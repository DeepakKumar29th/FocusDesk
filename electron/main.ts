import { app, BrowserWindow, ipcMain, Notification, screen, shell } from 'electron';
import path from 'node:path';
import { FocusDeskDatabase } from '../shared/database';
import { assertNonEmptyString } from '../shared/validation';

let mainWindow: BrowserWindow | null = null;
let floatingWindow: BrowserWindow | null = null;
let db: FocusDeskDatabase | null = null;
let autoBackupTimer: NodeJS.Timeout | null = null;

const isDev = !app.isPackaged;
const DEV_URL = 'http://localhost:3000';

// Enforce single instance of FocusDesk on Windows 11
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function getDb(): FocusDeskDatabase {
  if (!db) {
    throw new Error('Database not initialized.');
  }
  return db;
}

function broadcastStateChange(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('focusdesk:state-changed');
    }
  }
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#151A20',
    title: 'FocusDesk',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) {
    win.loadURL(DEV_URL);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.on('closed', () => {
    mainWindow = null;
    if (floatingWindow && !floatingWindow.isDestroyed()) {
      floatingWindow.close();
    }
  });

  return win;
}

function createOrFocusFloatingWindow(): BrowserWindow {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.show();
    floatingWindow.focus();
    return floatingWindow;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  const winWidth = 340;
  const winHeight = 196;

  const win = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: Math.max(20, width - winWidth - 28),
    y: Math.max(20, height - winHeight - 28),
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: false,
    backgroundColor: '#151A20',
    title: 'FocusDesk Mini Timer',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.setAlwaysOnTop(true, 'floating');

  if (isDev) {
    win.loadURL(`${DEV_URL}/?window=floating`);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: { window: 'floating' },
    });
  }

  win.on('closed', () => {
    floatingWindow = null;
  });

  floatingWindow = win;
  return win;
}

function registerIpcHandlers(): void {
  // Active state & recovery
  ipcMain.handle('state:get', () => getDb().getActiveState());

  ipcMain.handle('session:resolveRecovery', (_e, payload: { sessionId: number; action: 'resume' | 'discard' }) => {
    const res = getDb().resolveRecovery(payload?.sessionId, payload?.action);
    broadcastStateChange();
    return res;
  });

  // Sessions
  ipcMain.handle(
    'session:start',
    (
      _e,
      payload: {
        subjectId: number;
        studyNote?: string | null;
        timerMode: 'stopwatch' | 'countdown';
        targetSeconds?: number;
      }
    ) => {
      const res = getDb().startSession(payload ?? {});
      broadcastStateChange();
      return res;
    }
  );

  ipcMain.handle('session:pause', (_e, payload: { sessionId: number }) => {
    const res = getDb().pauseSession(payload?.sessionId);
    broadcastStateChange();
    return res;
  });

  ipcMain.handle('session:resume', (_e, payload: { sessionId: number }) => {
    const res = getDb().resumeSession(payload?.sessionId);
    broadcastStateChange();
    return res;
  });

  ipcMain.handle('session:heartbeat', (_e, payload: { sessionId: number }) => {
    getDb().heartbeatSession(payload?.sessionId);
    return { ok: true };
  });

  ipcMain.handle('session:finish', async (_e, payload: { sessionId: number; clampCountdown?: boolean }) => {
    const res = getDb().finishSession(payload?.sessionId, Date.now(), {
      clampCountdown: Boolean(payload?.clampCountdown),
    });
    await getDb().maybeRunAutoBackup(1).catch(() => null);
    broadcastStateChange();
    return res;
  });

  ipcMain.handle('session:discard', (_e, payload: { sessionId: number }) => {
    const res = getDb().discardActiveSession(payload?.sessionId);
    broadcastStateChange();
    return res;
  });

  // Breaks
  ipcMain.handle('break:start', (_e, payload: { breakType: 'short' | 'long' }) => {
    const res = getDb().startBreak(payload?.breakType);
    broadcastStateChange();
    return res;
  });

  ipcMain.handle('break:end', (_e, payload: { breakId: number; action: 'complete' | 'skip' }) => {
    const res = getDb().endBreak(payload?.breakId, payload?.action);
    broadcastStateChange();
    return res;
  });

  // Subjects
  ipcMain.handle('subjects:list', (_e, payload?: { includeArchived?: boolean }) =>
    getDb().listSubjects(Boolean(payload?.includeArchived))
  );

  ipcMain.handle('subjects:create', (_e, payload: { name: string; color?: string }) => {
    const res = getDb().createSubject(payload?.name, payload?.color);
    broadcastStateChange();
    return res;
  });

  ipcMain.handle('subjects:update', (_e, payload: { id: number; name: string; color?: string }) => {
    const res = getDb().updateSubject(payload?.id, payload?.name, payload?.color);
    broadcastStateChange();
    return res;
  });

  ipcMain.handle('subjects:delete', (_e, payload: { id: number }) => {
    const res = getDb().deleteSubject(payload?.id);
    broadcastStateChange();
    return res;
  });

  ipcMain.handle('subjects:restore', (_e, payload: { id: number }) => {
    const res = getDb().restoreSubject(payload?.id);
    broadcastStateChange();
    return res;
  });

  // History
  ipcMain.handle('history:list', () => getDb().listCompletedSessions());

  ipcMain.handle(
    'history:update',
    (
      _e,
      payload: {
        id: number;
        updates: {
          subjectId: number;
          studyNote?: string | null;
          startedAt: string;
          endedAt: string;
          focusedSeconds: number;
        };
      }
    ) => {
      const res = getDb().updateCompletedSession(payload?.id, payload?.updates);
      broadcastStateChange();
      return res;
    }
  );

  ipcMain.handle('history:delete', (_e, payload: { id: number }) => {
    getDb().deleteCompletedSession(payload?.id);
    broadcastStateChange();
    return { ok: true };
  });

  // Goals & Analytics
  ipcMain.handle('goals:list', () => getDb().listGoals());

  ipcMain.handle('goals:upsert', (_e, payload: { goalType: 'daily' | 'weekly'; targetSeconds: number }) => {
    const res = getDb().upsertGoal(payload?.goalType, payload?.targetSeconds);
    broadcastStateChange();
    return res;
  });

  ipcMain.handle('goals:delete', (_e, payload: { goalType: 'daily' | 'weekly' }) => {
    const res = getDb().deleteGoal(payload?.goalType);
    broadcastStateChange();
    return res;
  });

  ipcMain.handle('dashboard:get', () => getDb().getDashboardStats());
  ipcMain.handle('analytics:get', () => getDb().getAnalytics());

  // Settings & Backups
  ipcMain.handle('settings:get', () => getDb().getSettings());

  ipcMain.handle('settings:update', (_e, patch: Record<string, unknown>) => {
    const res = getDb().updateSettings(patch ?? {});
    broadcastStateChange();
    return res;
  });

  ipcMain.handle('backups:list', () => getDb().listBackups());

  ipcMain.handle('backups:create', async () => {
    const res = await getDb().createBackup('manual');
    broadcastStateChange();
    return res;
  });

  ipcMain.handle('backups:restore', async (_e, payload: { filename: string }) => {
    const res = await getDb().restoreBackup(payload?.filename);
    broadcastStateChange();
    return res;
  });

  ipcMain.handle('backups:openFolder', async () => {
    await shell.openPath(getDb().backupDir);
    return { ok: true };
  });

  // Native silent Windows notification
  ipcMain.handle('notify:show', (_e, payload: { title: string; body: string }) => {
    const title = assertNonEmptyString(payload?.title, 'Notification title', 100);
    const body = assertNonEmptyString(payload?.body, 'Notification body', 240);
    const settings = getDb().getSettings();
    if (settings.notifications_enabled && Notification.isSupported()) {
      new Notification({
        title,
        body,
        silent: true,
      }).show();
    }
    return { ok: true };
  });

  // Fullscreen & Floating Windows
  ipcMain.handle('window:setFullscreen', (_e, payload: { enabled: boolean }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setFullScreen(Boolean(payload?.enabled));
    }
    return { ok: true };
  });

  ipcMain.handle('window:openFloating', () => {
    createOrFocusFloatingWindow();
    return { ok: true };
  });

  ipcMain.handle('window:closeFloating', () => {
    if (floatingWindow && !floatingWindow.isDestroyed()) {
      floatingWindow.close();
      floatingWindow = null;
    }
    return { ok: true };
  });
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.focusdesk.app');
  }

  const userDataDir = app.getPath('userData');
  db = new FocusDeskDatabase(userDataDir);
  db.prepareRecoveryOnBoot();

  await db.maybeRunAutoBackup(12).catch((err) => {
    console.error('Startup auto-backup check failed:', err);
  });

  autoBackupTimer = setInterval(() => {
    db?.maybeRunAutoBackup(12).catch(() => null);
  }, 6 * 3600 * 1000);

  registerIpcHandlers();
  mainWindow = createMainWindow();
});

app.on('before-quit', () => {
  if (autoBackupTimer) {
    clearInterval(autoBackupTimer);
    autoBackupTimer = null;
  }
  if (db) {
    db.prepareCleanShutdown();
    db.close();
    db = null;
  }
});

app.on('window-all-closed', () => {
  app.quit();
});
