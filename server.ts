import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { FocusDeskDatabase } from './shared/database';

const PORT = 3000;
const DATA_DIR = process.env.FOCUSDESK_DATA_DIR
  ? path.resolve(process.env.FOCUSDESK_DATA_DIR)
  : path.resolve(process.cwd(), 'data');

async function startServer(): Promise<void> {
  const db = new FocusDeskDatabase(DATA_DIR);
  db.prepareRecoveryOnBoot();
  await db.maybeRunAutoBackup(12).catch((err) => {
    console.error('Auto-backup startup check failed:', err);
  });

  const autoBackupTimer = setInterval(() => {
    db.maybeRunAutoBackup(12).catch(() => null);
  }, 6 * 3600 * 1000);

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const wrap =
    (handler: (req: express.Request, res: express.Response) => Promise<unknown> | unknown) =>
    async (req: express.Request, res: express.Response) => {
      try {
        const result = await handler(req, res);
        if (!res.headersSent) {
          res.json(result ?? { ok: true });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected server error';
        const isNotFound = /not found|does not exist/i.test(message);
        res.status(isNotFound ? 404 : 400).json({ error: message });
      }
    };

  // Active state & recovery
  app.get('/api/state', wrap(() => db.getActiveState()));

  app.post(
    '/api/session/recovery',
    wrap((req) => db.resolveRecovery(Number(req.body?.sessionId), req.body?.action))
  );

  // Study session lifecycle
  app.post('/api/session/start', wrap((req) => db.startSession(req.body ?? {})));
  app.post('/api/session/:id/pause', wrap((req) => db.pauseSession(Number(req.params.id))));
  app.post('/api/session/:id/resume', wrap((req) => db.resumeSession(Number(req.params.id))));
  app.post(
    '/api/session/:id/heartbeat',
    wrap((req) => {
      db.heartbeatSession(Number(req.params.id));
      return { ok: true };
    })
  );
  app.post(
    '/api/session/:id/finish',
    wrap(async (req) => {
      const result = db.finishSession(Number(req.params.id), Date.now(), {
        clampCountdown: Boolean(req.body?.clampCountdown),
      });
      await db.maybeRunAutoBackup(1).catch(() => null);
      return result;
    })
  );
  app.post('/api/session/:id/discard', wrap((req) => db.discardActiveSession(Number(req.params.id))));

  // Breaks
  app.post('/api/break/start', wrap((req) => db.startBreak(req.body?.breakType)));
  app.post('/api/break/:id/end', wrap((req) => db.endBreak(Number(req.params.id), req.body?.action)));

  // Subjects
  app.get('/api/subjects', wrap((req) => db.listSubjects(req.query.includeArchived === 'true')));
  app.post('/api/subjects', wrap((req) => db.createSubject(req.body?.name, req.body?.color)));
  app.put('/api/subjects/:id', wrap((req) => db.updateSubject(Number(req.params.id), req.body?.name, req.body?.color)));
  app.delete('/api/subjects/:id', wrap((req) => db.deleteSubject(Number(req.params.id))));
  app.post('/api/subjects/:id/restore', wrap((req) => db.restoreSubject(Number(req.params.id))));

  // History
  app.get('/api/history', wrap(() => db.listCompletedSessions()));
  app.put('/api/history/:id', wrap((req) => db.updateCompletedSession(Number(req.params.id), req.body ?? {})));
  app.delete(
    '/api/history/:id',
    wrap((req) => {
      db.deleteCompletedSession(Number(req.params.id));
      return { ok: true };
    })
  );

  // Goals, Dashboard, Analytics
  app.get('/api/goals', wrap(() => db.listGoals()));
  app.put('/api/goals/:type', wrap((req) => db.upsertGoal(req.params.type, req.body?.targetSeconds)));
  app.delete('/api/goals/:type', wrap((req) => db.deleteGoal(req.params.type)));
  app.get('/api/dashboard', wrap(() => db.getDashboardStats()));
  app.get('/api/analytics', wrap(() => db.getAnalytics()));

  // Settings & Backups
  app.get('/api/settings', wrap(() => db.getSettings()));
  app.put('/api/settings', wrap((req) => db.updateSettings(req.body ?? {})));
  app.get('/api/backups', wrap(() => db.listBackups()));
  app.post('/api/backups', wrap(() => db.createBackup('manual')));
  app.post('/api/backups/restore', wrap((req) => db.restoreBackup(req.body?.filename)));

  // Vite dev middleware or production static build
  const distDir = path.resolve(process.cwd(), 'dist');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(distDir);

  if (isProd) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`FocusDesk local server running at http://localhost:${PORT}`);
  });

  const shutdown = () => {
    clearInterval(autoBackupTimer);
    db.prepareCleanShutdown();
    db.close();
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch((err) => {
  console.error('Failed to start FocusDesk server:', err);
  process.exit(1);
});
