import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { computeAnalyticsData, computeDashboardStats } from './analytics';
import { computeCrashSafeFocusedSeconds, toLocalDateKey } from './timerMath';
import type {
  ActiveStatePayload,
  AnalyticsData,
  AppSettings,
  BackupFileInfo,
  BreakRecord,
  BreakType,
  DashboardStats,
  Goal,
  GoalType,
  StudySession,
  Subject,
  TimerMode,
} from './types';
import {
  assertBackupFilename,
  assertBreakType,
  assertGoalType,
  assertHexColor,
  assertIsoTimestamp,
  assertNonEmptyString,
  assertNonNegativeInt,
  assertOptionalNote,
  assertPositiveInt,
  assertTimerMode,
} from './validation';

const APP_VERSION = '1.0.0';
const MAX_AUTO_BACKUPS = 20;

export class FocusDeskDatabase {
  private db: Database.Database;
  public readonly dbPath: string;
  public readonly backupDir: string;

  constructor(dataDir: string) {
    const resolvedDataDir = path.resolve(dataDir);
    fs.mkdirSync(resolvedDataDir, { recursive: true });
    this.dbPath = path.join(resolvedDataDir, 'focusdesk.db');
    this.backupDir = path.join(resolvedDataDir, 'backups');
    fs.mkdirSync(this.backupDir, { recursive: true });

    this.db = this.openAndInit(this.dbPath);
  }

  private openAndInit(filePath: string): Database.Database {
    const db = new Database(filePath);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = FULL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');

    db.exec(`
      CREATE TABLE IF NOT EXISTS subjects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#3B82F6',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_subjects_archived ON subjects(archived_at);

      CREATE TABLE IF NOT EXISTS topics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_topics_subject ON topics(subject_id);
      CREATE INDEX IF NOT EXISTS idx_topics_archived ON topics(archived_at);

      CREATE TABLE IF NOT EXISTS study_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
        topic_id INTEGER NULL REFERENCES topics(id) ON DELETE RESTRICT,
        timer_mode TEXT NOT NULL CHECK (timer_mode IN ('stopwatch', 'countdown')),
        target_seconds INTEGER NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT NULL,
        focused_seconds INTEGER NOT NULL DEFAULT 0 CHECK (focused_seconds >= 0),
        status TEXT NOT NULL CHECK (status IN ('running', 'paused', 'completed', 'discarded')),
        last_heartbeat_at TEXT NOT NULL,
        active_segment_started_at TEXT NULL,
        recovery_pending INTEGER NOT NULL DEFAULT 0,
        subject_name_snapshot TEXT NULL,
        topic_name_snapshot TEXT NULL,
        study_note TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_status ON study_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_sessions_started ON study_sessions(started_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_subject ON study_sessions(subject_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_session
        ON study_sessions((1))
        WHERE status IN ('running', 'paused');

      CREATE TABLE IF NOT EXISTS breaks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        study_session_id INTEGER NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
        break_type TEXT NOT NULL CHECK (break_type IN ('short', 'long')),
        planned_seconds INTEGER NOT NULL CHECK (planned_seconds > 0),
        started_at TEXT NOT NULL,
        ended_at TEXT NULL,
        duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
        status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'skipped')),
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_breaks_session ON breaks(study_session_id);
      CREATE INDEX IF NOT EXISTS idx_breaks_status ON breaks(status);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_break
        ON breaks((1))
        WHERE status = 'running';

      CREATE TABLE IF NOT EXISTS goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_type TEXT NOT NULL UNIQUE CHECK (goal_type IN ('daily', 'weekly')),
        target_seconds INTEGER NOT NULL CHECK (target_seconds > 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        setting_key TEXT NOT NULL UNIQUE,
        setting_value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    this.ensureSessionSnapshotColumns(db);
    this.seedDefaultSettings(db);
    return db;
  }

  private ensureSessionSnapshotColumns(db: Database.Database): void {
    const cols = db.prepare(`PRAGMA table_info(study_sessions)`).all() as Array<{
      name: string;
      notnull: number;
    }>;
    const names = new Set(cols.map((c) => c.name));
    if (!names.has('subject_name_snapshot')) {
      db.exec(`ALTER TABLE study_sessions ADD COLUMN subject_name_snapshot TEXT NULL`);
    }
    if (!names.has('topic_name_snapshot')) {
      db.exec(`ALTER TABLE study_sessions ADD COLUMN topic_name_snapshot TEXT NULL`);
    }
    if (!names.has('study_note')) {
      db.exec(`ALTER TABLE study_sessions ADD COLUMN study_note TEXT NULL`);
      // Migrate any legacy topic snapshot/name into descriptive study_note
      db.exec(`
        UPDATE study_sessions
        SET study_note = COALESCE(
          topic_name_snapshot,
          (SELECT name FROM topics WHERE topics.id = study_sessions.topic_id)
        )
        WHERE study_note IS NULL
          AND (topic_name_snapshot IS NOT NULL OR topic_id IS NOT NULL)
      `);
    }

    const topicCol = cols.find((c) => c.name === 'topic_id');
    if (topicCol && topicCol.notnull === 1) {
      db.pragma('foreign_keys = OFF');
      try {
        const migrate = db.transaction(() => {
          db.exec(`
            CREATE TABLE study_sessions_migrated (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
              topic_id INTEGER NULL REFERENCES topics(id) ON DELETE RESTRICT,
              timer_mode TEXT NOT NULL CHECK (timer_mode IN ('stopwatch', 'countdown')),
              target_seconds INTEGER NULL,
              started_at TEXT NOT NULL,
              ended_at TEXT NULL,
              focused_seconds INTEGER NOT NULL DEFAULT 0 CHECK (focused_seconds >= 0),
              status TEXT NOT NULL CHECK (status IN ('running', 'paused', 'completed', 'discarded')),
              last_heartbeat_at TEXT NOT NULL,
              active_segment_started_at TEXT NULL,
              recovery_pending INTEGER NOT NULL DEFAULT 0,
              subject_name_snapshot TEXT NULL,
              topic_name_snapshot TEXT NULL,
              study_note TEXT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            INSERT INTO study_sessions_migrated (
              id, subject_id, topic_id, timer_mode, target_seconds,
              started_at, ended_at, focused_seconds, status,
              last_heartbeat_at, active_segment_started_at, recovery_pending,
              subject_name_snapshot, topic_name_snapshot, study_note, created_at, updated_at
            )
            SELECT
              id, subject_id, topic_id, timer_mode, target_seconds,
              started_at, ended_at, focused_seconds, status,
              last_heartbeat_at, active_segment_started_at, recovery_pending,
              subject_name_snapshot, topic_name_snapshot, study_note, created_at, updated_at
            FROM study_sessions;

            DROP TABLE study_sessions;
            ALTER TABLE study_sessions_migrated RENAME TO study_sessions;

            CREATE INDEX IF NOT EXISTS idx_sessions_status ON study_sessions(status);
            CREATE INDEX IF NOT EXISTS idx_sessions_started ON study_sessions(started_at);
            CREATE INDEX IF NOT EXISTS idx_sessions_subject ON study_sessions(subject_id);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_session
              ON study_sessions((1))
              WHERE status IN ('running', 'paused');
          `);
        });
        migrate();
      } finally {
        db.pragma('foreign_keys = ON');
      }
    }
  }

  private seedDefaultSettings(db: Database.Database): void {
    const now = new Date().toISOString();
    const defaults: Record<string, string> = {
      default_timer_mode: 'stopwatch',
      preferred_countdown_seconds: '1500',
      short_break_seconds: '300',
      long_break_seconds: '900',
      auto_backup_enabled: 'true',
      last_backup_at: '',
      last_backup_file: '',
      notifications_enabled: 'true',
    };
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO app_settings (setting_key, setting_value, updated_at)
      VALUES (?, ?, ?)
    `);
    for (const [k, v] of Object.entries(defaults)) {
      stmt.run(k, v, now);
    }
  }

  public close(): void {
    if (this.db.open) {
      this.db.close();
    }
  }

  // ---------- Boot Recovery & Clean Shutdown ----------

  /**
   * Called on app startup. Freezes any active running/paused session into paused recovery state
   * using last_heartbeat_at so time while closed/crashed is NEVER counted.
   */
  public prepareRecoveryOnBoot(nowMs: number = Date.now()): void {
    const nowIso = new Date(nowMs).toISOString();
    const tx = this.db.transaction(() => {
      const unfinished = this.db
        .prepare(`SELECT * FROM study_sessions WHERE status IN ('running', 'paused')`)
        .all() as StudySession[];

      for (const s of unfinished) {
        const safeSeconds = computeCrashSafeFocusedSeconds(s);
        this.db
          .prepare(
            `UPDATE study_sessions
             SET focused_seconds = ?,
                 status = 'paused',
                 active_segment_started_at = NULL,
                 recovery_pending = 1,
                 updated_at = ?
             WHERE id = ?`
          )
          .run(safeSeconds, nowIso, s.id);
      }

      // Close any dangling active break without inflating duration
      const activeBreaks = this.db
        .prepare(`SELECT * FROM breaks WHERE status = 'running'`)
        .all() as BreakRecord[];
      for (const b of activeBreaks) {
        this.db
          .prepare(
            `UPDATE breaks
             SET status = 'completed',
                 ended_at = ?,
                 duration_seconds = CASE WHEN duration_seconds > 0 THEN duration_seconds ELSE 0 END
             WHERE id = ?`
          )
          .run(nowIso, b.id);
      }
    });
    tx();
  }

  /**
   * Called on graceful app shutdown / quit. Flushes exact focused seconds up to nowMs
   * and sets recovery_pending = 1 so reopening asks user to Resume or Discard.
   */
  public prepareCleanShutdown(nowMs: number = Date.now()): void {
    const nowIso = new Date(nowMs).toISOString();
    const tx = this.db.transaction(() => {
      const active = this.db
        .prepare(`SELECT * FROM study_sessions WHERE status IN ('running', 'paused')`)
        .get() as StudySession | undefined;
      if (active) {
        let total = active.focused_seconds;
        if (active.status === 'running' && active.active_segment_started_at) {
          const segStart = Date.parse(active.active_segment_started_at);
          if (Number.isFinite(segStart)) {
            total += Math.max(0, Math.floor((nowMs - segStart) / 1000));
          }
        }
        this.db
          .prepare(
            `UPDATE study_sessions
             SET focused_seconds = ?,
                 status = 'paused',
                 active_segment_started_at = NULL,
                 last_heartbeat_at = ?,
                 recovery_pending = 1,
                 updated_at = ?
             WHERE id = ?`
          )
          .run(total, nowIso, nowIso, active.id);
      }
    });
    tx();
  }

  public resolveRecovery(sessionId: number, action: 'resume' | 'discard', nowMs: number = Date.now()): ActiveStatePayload {
    const id = assertPositiveInt(sessionId, 'Session ID');
    if (action !== 'resume' && action !== 'discard') {
      throw new Error('Recovery action must be "resume" or "discard".');
    }
    const nowIso = new Date(nowMs).toISOString();
    const session = this.db
      .prepare(`SELECT * FROM study_sessions WHERE id = ? AND recovery_pending = 1`)
      .get(id) as StudySession | undefined;

    if (!session) {
      throw new Error('Pending recovery session not found.');
    }

    if (action === 'resume') {
      this.db
        .prepare(
          `UPDATE study_sessions
           SET recovery_pending = 0,
               status = 'paused',
               active_segment_started_at = NULL,
               last_heartbeat_at = ?,
               updated_at = ?
           WHERE id = ?`
        )
        .run(nowIso, nowIso, id);
    } else {
      this.db
        .prepare(
          `UPDATE study_sessions
           SET recovery_pending = 0,
               status = 'discarded',
               ended_at = ?,
               active_segment_started_at = NULL,
               updated_at = ?
           WHERE id = ?`
        )
        .run(nowIso, nowIso, id);
    }

    return this.getActiveState(nowMs);
  }

  // ---------- Subjects ----------

  public listSubjects(includeArchived = false): Subject[] {
    const whereClause = includeArchived ? '' : 'WHERE s.archived_at IS NULL';
    return this.db
      .prepare(
        `SELECT s.*,
          (SELECT COUNT(*) FROM study_sessions ss WHERE ss.subject_id = s.id AND ss.status = 'completed') AS session_count
         FROM subjects s
         ${whereClause}
         ORDER BY s.archived_at IS NOT NULL ASC, LOWER(s.name) ASC`
      )
      .all() as Subject[];
  }

  public createSubject(nameInput: unknown, colorInput?: unknown): Subject {
    const name = assertNonEmptyString(nameInput, 'Subject name', 80);
    const color = assertHexColor(colorInput, '#3B82F6');
    const dup = this.db
      .prepare(`SELECT id FROM subjects WHERE LOWER(name) = LOWER(?) AND archived_at IS NULL`)
      .get(name);
    if (dup) {
      throw new Error(`Subject "${name}" already exists.`);
    }
    const now = new Date().toISOString();
    const res = this.db
      .prepare(
        `INSERT INTO subjects (name, color, created_at, updated_at, archived_at)
         VALUES (?, ?, ?, ?, NULL)`
      )
      .run(name, color, now, now);
    return this.db.prepare(`SELECT * FROM subjects WHERE id = ?`).get(res.lastInsertRowid) as Subject;
  }

  public updateSubject(idInput: unknown, nameInput: unknown, colorInput?: unknown): Subject {
    const id = assertPositiveInt(idInput, 'Subject ID');
    const name = assertNonEmptyString(nameInput, 'Subject name', 80);
    const existing = this.db.prepare(`SELECT * FROM subjects WHERE id = ?`).get(id) as Subject | undefined;
    if (!existing) throw new Error('Subject not found.');
    const color = colorInput !== undefined ? assertHexColor(colorInput, existing.color) : existing.color;

    const dup = this.db
      .prepare(`SELECT id FROM subjects WHERE LOWER(name) = LOWER(?) AND archived_at IS NULL AND id != ?`)
      .get(name, id);
    if (dup) {
      throw new Error(`Another active subject named "${name}" already exists.`);
    }
    const now = new Date().toISOString();
    this.db
      .prepare(`UPDATE subjects SET name = ?, color = ?, updated_at = ? WHERE id = ?`)
      .run(name, color, now, id);
    return this.db.prepare(`SELECT * FROM subjects WHERE id = ?`).get(id) as Subject;
  }

  public deleteSubject(idInput: unknown): { action: 'deleted' | 'archived' } {
    const id = assertPositiveInt(idInput, 'Subject ID');
    const existing = this.db.prepare(`SELECT * FROM subjects WHERE id = ?`).get(id) as Subject | undefined;
    if (!existing) throw new Error('Subject not found.');

    const ref = this.db
      .prepare(`SELECT COUNT(*) AS cnt FROM study_sessions WHERE subject_id = ? AND status != 'discarded'`)
      .get(id) as { cnt: number };

    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      if (ref.cnt > 0) {
        this.db.prepare(`UPDATE subjects SET archived_at = ?, updated_at = ? WHERE id = ?`).run(now, now, id);
        this.db
          .prepare(`UPDATE topics SET archived_at = COALESCE(archived_at, ?), updated_at = ? WHERE subject_id = ?`)
          .run(now, now, id);
        return { action: 'archived' as const };
      } else {
        this.db.prepare(`DELETE FROM study_sessions WHERE subject_id = ? AND status = 'discarded'`).run(id);
        this.db.prepare(`DELETE FROM topics WHERE subject_id = ?`).run(id);
        this.db.prepare(`DELETE FROM subjects WHERE id = ?`).run(id);
        return { action: 'deleted' as const };
      }
    });
    return tx();
  }

  public restoreSubject(idInput: unknown): Subject {
    const id = assertPositiveInt(idInput, 'Subject ID');
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      const sub = this.db.prepare(`SELECT * FROM subjects WHERE id = ?`).get(id) as Subject | undefined;
      if (!sub) throw new Error('Subject not found.');
      this.db.prepare(`UPDATE subjects SET archived_at = NULL, updated_at = ? WHERE id = ?`).run(now, id);
    });
    tx();
    return this.db.prepare(`SELECT * FROM subjects WHERE id = ?`).get(id) as Subject;
  }

  // ---------- Active Study Session & Timer Lifecycle ----------

  private getHydratedSessionById(id: number): StudySession | null {
    const row = this.db
      .prepare(
        `SELECT ss.*,
                COALESCE(ss.subject_name_snapshot, s.name) AS subject_name,
                s.color AS subject_color,
                COALESCE(ss.study_note, ss.topic_name_snapshot) AS study_note,
                (SELECT COUNT(*) FROM breaks b WHERE b.study_session_id = ss.id AND b.status != 'running') AS break_count,
                (SELECT COALESCE(SUM(b.duration_seconds), 0) FROM breaks b WHERE b.study_session_id = ss.id AND b.status != 'running') AS break_seconds
         FROM study_sessions ss
         JOIN subjects s ON s.id = ss.subject_id
         WHERE ss.id = ?`
      )
      .get(id) as StudySession | undefined;
    return row ?? null;
  }

  public getActiveState(nowMs: number = Date.now()): ActiveStatePayload {
    const activeRow = this.db
      .prepare(`SELECT id, recovery_pending FROM study_sessions WHERE status IN ('running', 'paused') LIMIT 1`)
      .get() as { id: number; recovery_pending: number } | undefined;

    const hydrated = activeRow ? this.getHydratedSessionById(activeRow.id) : null;
    const recoverySession = hydrated && hydrated.recovery_pending === 1 ? hydrated : null;
    const activeSession = hydrated && hydrated.recovery_pending === 0 ? hydrated : null;

    const activeBreak =
      (this.db.prepare(`SELECT * FROM breaks WHERE status = 'running' LIMIT 1`).get() as BreakRecord | undefined) ??
      null;

    return {
      activeSession,
      recoverySession,
      activeBreak,
      serverNowIso: new Date(nowMs).toISOString(),
    };
  }

  public startSession(
    input: {
      subjectId: unknown;
      studyNote?: unknown;
      timerMode: unknown;
      targetSeconds?: unknown;
    },
    nowMs: number = Date.now()
  ): ActiveStatePayload {
    const subjectId = assertPositiveInt(input.subjectId, 'Subject');
    const studyNote = assertOptionalNote(input.studyNote, 'Topic / Study Note', 200);
    const timerMode = assertTimerMode(input.timerMode);

    let targetSeconds: number | null = null;
    if (timerMode === 'countdown') {
      targetSeconds = assertPositiveInt(input.targetSeconds, 'Countdown duration');
      if (targetSeconds > 86400) {
        throw new Error('Countdown duration cannot exceed 24 hours.');
      }
    }

    const nowIso = new Date(nowMs).toISOString();

    const tx = this.db.transaction(() => {
      const existingActive = this.db
        .prepare(`SELECT id FROM study_sessions WHERE status IN ('running', 'paused') LIMIT 1`)
        .get();
      if (existingActive) {
        throw new Error('An active or pending study session already exists.');
      }

      const runningBreak = this.db.prepare(`SELECT id FROM breaks WHERE status = 'running' LIMIT 1`).get();
      if (runningBreak) {
        throw new Error('End or skip your active break before starting a study session.');
      }

      const subject = this.db
        .prepare(`SELECT * FROM subjects WHERE id = ?`)
        .get(subjectId) as Subject | undefined;
      if (!subject) {
        throw new Error('Selected subject does not exist.');
      }
      if (subject.archived_at) {
        throw new Error('Cannot start a session with an archived subject.');
      }

      this.db
        .prepare(
          `INSERT INTO study_sessions (
             subject_id, topic_id, timer_mode, target_seconds,
             started_at, ended_at, focused_seconds, status,
             last_heartbeat_at, active_segment_started_at, recovery_pending,
             subject_name_snapshot, topic_name_snapshot, study_note,
             created_at, updated_at
           ) VALUES (?, NULL, ?, ?, ?, NULL, 0, 'running', ?, ?, 0, ?, NULL, ?, ?, ?)`
        )
        .run(
          subjectId,
          timerMode,
          targetSeconds,
          nowIso,
          nowIso,
          nowIso,
          subject.name,
          studyNote,
          nowIso,
          nowIso
        );
    });
    tx();

    return this.getActiveState(nowMs);
  }

  public pauseSession(sessionIdInput: unknown, nowMs: number = Date.now()): ActiveStatePayload {
    const id = assertPositiveInt(sessionIdInput, 'Session ID');
    const nowIso = new Date(nowMs).toISOString();

    const tx = this.db.transaction(() => {
      const s = this.db.prepare(`SELECT * FROM study_sessions WHERE id = ?`).get(id) as StudySession | undefined;
      if (!s || s.recovery_pending === 1) throw new Error('Active session not found.');
      if (s.status === 'paused') return;
      if (s.status !== 'running') throw new Error('Only a running session can be paused.');

      let total = s.focused_seconds;
      if (s.active_segment_started_at) {
        const segStart = Date.parse(s.active_segment_started_at);
        if (Number.isFinite(segStart)) {
          total += Math.max(0, Math.floor((nowMs - segStart) / 1000));
        }
      }

      this.db
        .prepare(
          `UPDATE study_sessions
           SET focused_seconds = ?,
               status = 'paused',
               active_segment_started_at = NULL,
               last_heartbeat_at = ?,
               updated_at = ?
           WHERE id = ?`
        )
        .run(total, nowIso, nowIso, id);
    });
    tx();

    return this.getActiveState(nowMs);
  }

  public resumeSession(sessionIdInput: unknown, nowMs: number = Date.now()): ActiveStatePayload {
    const id = assertPositiveInt(sessionIdInput, 'Session ID');
    const nowIso = new Date(nowMs).toISOString();

    const tx = this.db.transaction(() => {
      const runningBreak = this.db.prepare(`SELECT id FROM breaks WHERE status = 'running' LIMIT 1`).get();
      if (runningBreak) {
        throw new Error('End or skip your current break before resuming the study session.');
      }
      const s = this.db.prepare(`SELECT * FROM study_sessions WHERE id = ?`).get(id) as StudySession | undefined;
      if (!s || s.recovery_pending === 1) throw new Error('Active session not found.');
      if (s.status === 'running') return;
      if (s.status !== 'paused') throw new Error('Only a paused session can be resumed.');

      this.db
        .prepare(
          `UPDATE study_sessions
           SET status = 'running',
               active_segment_started_at = ?,
               last_heartbeat_at = ?,
               updated_at = ?
           WHERE id = ?`
        )
        .run(nowIso, nowIso, nowIso, id);
    });
    tx();

    return this.getActiveState(nowMs);
  }

  public heartbeatSession(sessionIdInput: unknown, nowMs: number = Date.now()): void {
    const id = assertPositiveInt(sessionIdInput, 'Session ID');
    const nowIso = new Date(nowMs).toISOString();
    this.db
      .prepare(
        `UPDATE study_sessions
         SET last_heartbeat_at = ?, updated_at = ?
         WHERE id = ? AND status = 'running' AND recovery_pending = 0`
      )
      .run(nowIso, nowIso, id);
  }

  public finishSession(
    sessionIdInput: unknown,
    nowMs: number = Date.now(),
    options?: { clampCountdown?: boolean }
  ): { completedSession: StudySession; activeState: ActiveStatePayload } {
    const id = assertPositiveInt(sessionIdInput, 'Session ID');
    const nowIso = new Date(nowMs).toISOString();

    const tx = this.db.transaction(() => {
      const s = this.db.prepare(`SELECT * FROM study_sessions WHERE id = ?`).get(id) as StudySession | undefined;
      if (!s || (s.status !== 'running' && s.status !== 'paused')) {
        throw new Error('Active study session not found.');
      }

      let total = s.focused_seconds;
      if (s.status === 'running' && s.active_segment_started_at) {
        const segStart = Date.parse(s.active_segment_started_at);
        if (Number.isFinite(segStart)) {
          total += Math.max(0, Math.floor((nowMs - segStart) / 1000));
        }
      }

      if (options?.clampCountdown && s.timer_mode === 'countdown' && s.target_seconds != null) {
        total = Math.min(total, s.target_seconds);
      }

      this.db
        .prepare(
          `UPDATE study_sessions
           SET focused_seconds = ?,
               status = 'completed',
               ended_at = ?,
               active_segment_started_at = NULL,
               last_heartbeat_at = ?,
               recovery_pending = 0,
               updated_at = ?
           WHERE id = ?`
        )
        .run(total, nowIso, nowIso, nowIso, id);
    });
    tx();

    const completedSession = this.getHydratedSessionById(id)!;
    return {
      completedSession,
      activeState: this.getActiveState(nowMs),
    };
  }

  public discardActiveSession(sessionIdInput: unknown, nowMs: number = Date.now()): ActiveStatePayload {
    const id = assertPositiveInt(sessionIdInput, 'Session ID');
    const nowIso = new Date(nowMs).toISOString();
    const res = this.db
      .prepare(
        `UPDATE study_sessions
         SET status = 'discarded',
             ended_at = ?,
             active_segment_started_at = NULL,
             recovery_pending = 0,
             updated_at = ?
         WHERE id = ? AND status IN ('running', 'paused')`
      )
      .run(nowIso, nowIso, id);

    if (res.changes === 0) {
      throw new Error('Active session not found.');
    }
    return this.getActiveState(nowMs);
  }

  // ---------- Breaks ----------

  public startBreak(breakTypeInput: unknown, nowMs: number = Date.now()): ActiveStatePayload {
    const breakType: BreakType = assertBreakType(breakTypeInput);
    const nowIso = new Date(nowMs).toISOString();
    const settings = this.getSettings();
    const plannedSeconds =
      breakType === 'short' ? settings.short_break_seconds : settings.long_break_seconds;

    const tx = this.db.transaction(() => {
      const activeBreak = this.db.prepare(`SELECT id FROM breaks WHERE status = 'running' LIMIT 1`).get();
      if (activeBreak) {
        throw new Error('A break is already running.');
      }

      // If a study session is currently running, pause it so break time never counts as focused study time
      const activeSession = this.db
        .prepare(`SELECT * FROM study_sessions WHERE status IN ('running', 'paused') AND recovery_pending = 0 LIMIT 1`)
        .get() as StudySession | undefined;

      let linkedSessionId: number | null = null;
      if (activeSession) {
        linkedSessionId = activeSession.id;
        if (activeSession.status === 'running') {
          let total = activeSession.focused_seconds;
          if (activeSession.active_segment_started_at) {
            const segStart = Date.parse(activeSession.active_segment_started_at);
            if (Number.isFinite(segStart)) {
              total += Math.max(0, Math.floor((nowMs - segStart) / 1000));
            }
          }
          this.db
            .prepare(
              `UPDATE study_sessions
               SET focused_seconds = ?,
                   status = 'paused',
                   active_segment_started_at = NULL,
                   last_heartbeat_at = ?,
                   updated_at = ?
               WHERE id = ?`
            )
            .run(total, nowIso, nowIso, activeSession.id);
        }
      } else {
        // Link to latest completed session from today if present
        const latestCompleted = this.db
          .prepare(`SELECT id, started_at FROM study_sessions WHERE status = 'completed' ORDER BY started_at DESC LIMIT 1`)
          .get() as { id: number; started_at: string } | undefined;
        if (latestCompleted && toLocalDateKey(latestCompleted.started_at) === toLocalDateKey(new Date(nowMs))) {
          linkedSessionId = latestCompleted.id;
        }
      }

      this.db
        .prepare(
          `INSERT INTO breaks (
             study_session_id, break_type, planned_seconds,
             started_at, ended_at, duration_seconds, status, created_at
           ) VALUES (?, ?, ?, ?, NULL, 0, 'running', ?)`
        )
        .run(linkedSessionId, breakType, plannedSeconds, nowIso, nowIso);
    });
    tx();

    return this.getActiveState(nowMs);
  }

  public endBreak(breakIdInput: unknown, action: 'complete' | 'skip', nowMs: number = Date.now()): ActiveStatePayload {
    const id = assertPositiveInt(breakIdInput, 'Break ID');
    if (action !== 'complete' && action !== 'skip') {
      throw new Error('Break action must be "complete" or "skip".');
    }
    const nowIso = new Date(nowMs).toISOString();

    const tx = this.db.transaction(() => {
      const b = this.db.prepare(`SELECT * FROM breaks WHERE id = ? AND status = 'running'`).get(id) as
        | BreakRecord
        | undefined;
      if (!b) throw new Error('Active break not found.');
      const startMs = Date.parse(b.started_at);
      const elapsed = Number.isFinite(startMs) ? Math.max(0, Math.floor((nowMs - startMs) / 1000)) : 0;

      this.db
        .prepare(
          `UPDATE breaks
           SET status = ?,
               ended_at = ?,
               duration_seconds = ?
           WHERE id = ?`
        )
        .run(action === 'skip' ? 'skipped' : 'completed', nowIso, elapsed, id);
    });
    tx();

    return this.getActiveState(nowMs);
  }

  // ---------- History & Records ----------

  public listCompletedSessions(): StudySession[] {
    return this.db
      .prepare(
        `SELECT ss.*,
                COALESCE(ss.subject_name_snapshot, s.name) AS subject_name,
                s.color AS subject_color,
                COALESCE(ss.study_note, ss.topic_name_snapshot) AS study_note,
                (SELECT COUNT(*) FROM breaks b WHERE b.study_session_id = ss.id AND b.status != 'running') AS break_count,
                (SELECT COALESCE(SUM(b.duration_seconds), 0) FROM breaks b WHERE b.study_session_id = ss.id AND b.status != 'running') AS break_seconds
         FROM study_sessions ss
         JOIN subjects s ON s.id = ss.subject_id
         WHERE ss.status = 'completed'
         ORDER BY ss.started_at DESC`
      )
      .all() as StudySession[];
  }

  public listAllBreaks(): BreakRecord[] {
    return this.db.prepare(`SELECT * FROM breaks ORDER BY started_at DESC`).all() as BreakRecord[];
  }

  public updateCompletedSession(
    sessionIdInput: unknown,
    updates: {
      subjectId: unknown;
      studyNote?: unknown;
      startedAt: unknown;
      endedAt: unknown;
      focusedSeconds: unknown;
    }
  ): StudySession {
    const id = assertPositiveInt(sessionIdInput, 'Session ID');
    const subjectId = assertPositiveInt(updates.subjectId, 'Subject');
    const studyNote = assertOptionalNote(updates.studyNote, 'Topic / Study Note', 200);
    const startedAt = assertIsoTimestamp(updates.startedAt, 'Start time');
    const endedAt = assertIsoTimestamp(updates.endedAt, 'End time');
    const focusedSeconds = assertNonNegativeInt(updates.focusedSeconds, 'Focused duration');

    if (Date.parse(endedAt) < Date.parse(startedAt)) {
      throw new Error('End time cannot be earlier than start time.');
    }

    const subjectRow = this.db
      .prepare(`SELECT name FROM subjects WHERE id = ?`)
      .get(subjectId) as { name: string } | undefined;
    if (!subjectRow) {
      throw new Error('Selected subject does not exist.');
    }

    const existing = this.db
      .prepare(`SELECT id, subject_id FROM study_sessions WHERE id = ? AND status = 'completed'`)
      .get(id) as { id: number; subject_id: number } | undefined;
    if (!existing) {
      throw new Error('Completed study session not found.');
    }

    const now = new Date().toISOString();
    const nextSubjectSnap =
      existing.subject_id !== subjectId ? subjectRow.name : undefined;

    this.db
      .prepare(
        `UPDATE study_sessions
         SET subject_id = ?,
             topic_id = NULL,
             started_at = ?,
             ended_at = ?,
             focused_seconds = ?,
             subject_name_snapshot = COALESCE(?, subject_name_snapshot, ?),
             topic_name_snapshot = NULL,
             study_note = ?,
             updated_at = ?
         WHERE id = ?`
      )
      .run(
        subjectId,
        startedAt,
        endedAt,
        focusedSeconds,
        nextSubjectSnap ?? null,
        subjectRow.name,
        studyNote,
        now,
        id
      );

    return this.getHydratedSessionById(id)!;
  }

  public deleteCompletedSession(sessionIdInput: unknown): void {
    const id = assertPositiveInt(sessionIdInput, 'Session ID');
    const res = this.db
      .prepare(`DELETE FROM study_sessions WHERE id = ? AND status = 'completed'`)
      .run(id);
    if (res.changes === 0) {
      throw new Error('Completed study session not found.');
    }
  }

  // ---------- Goals ----------

  public listGoals(): Goal[] {
    return this.db.prepare(`SELECT * FROM goals ORDER BY goal_type ASC`).all() as Goal[];
  }

  public upsertGoal(goalTypeInput: unknown, targetSecondsInput: unknown): Goal[] {
    const goalType: GoalType = assertGoalType(goalTypeInput);
    const targetSeconds = assertPositiveInt(targetSecondsInput, 'Goal target');
    const maxSeconds = goalType === 'daily' ? 86400 : 604800;
    if (targetSeconds > maxSeconds) {
      throw new Error(`${goalType === 'daily' ? 'Daily' : 'Weekly'} goal cannot exceed calendar bounds.`);
    }

    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO goals (goal_type, target_seconds, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(goal_type) DO UPDATE SET
           target_seconds = excluded.target_seconds,
           updated_at = excluded.updated_at`
      )
      .run(goalType, targetSeconds, now, now);

    return this.listGoals();
  }

  public deleteGoal(goalTypeInput: unknown): Goal[] {
    const goalType: GoalType = assertGoalType(goalTypeInput);
    this.db.prepare(`DELETE FROM goals WHERE goal_type = ?`).run(goalType);
    return this.listGoals();
  }

  // ---------- Settings ----------

  public getSettings(): AppSettings {
    const rows = this.db.prepare(`SELECT setting_key, setting_value FROM app_settings`).all() as Array<{
      setting_key: string;
      setting_value: string;
    }>;
    const map = new Map(rows.map((r) => [r.setting_key, r.setting_value]));
    return {
      default_timer_mode: map.get('default_timer_mode') === 'countdown' ? 'countdown' : 'stopwatch',
      preferred_countdown_seconds: Math.max(1, Number(map.get('preferred_countdown_seconds') ?? 1500) || 1500),
      short_break_seconds: Math.max(60, Number(map.get('short_break_seconds') ?? 300) || 300),
      long_break_seconds: Math.max(60, Number(map.get('long_break_seconds') ?? 900) || 900),
      auto_backup_enabled: map.get('auto_backup_enabled') !== 'false',
      last_backup_at: map.get('last_backup_at') || null,
      last_backup_file: map.get('last_backup_file') || null,
      notifications_enabled: map.get('notifications_enabled') !== 'false',
      app_version: APP_VERSION,
      database_path: this.dbPath,
      backup_dir: this.backupDir,
    };
  }

  public updateSettings(patch: Partial<{
    default_timer_mode: unknown;
    preferred_countdown_seconds: unknown;
    short_break_seconds: unknown;
    long_break_seconds: unknown;
    auto_backup_enabled: unknown;
    notifications_enabled: unknown;
  }>): AppSettings {
    const entries: Array<[string, string]> = [];

    if (patch.default_timer_mode !== undefined) {
      entries.push(['default_timer_mode', assertTimerMode(patch.default_timer_mode)]);
    }
    if (patch.preferred_countdown_seconds !== undefined) {
      const sec = assertPositiveInt(patch.preferred_countdown_seconds, 'Preferred countdown duration');
      if (sec > 86400) throw new Error('Preferred countdown cannot exceed 24 hours.');
      entries.push(['preferred_countdown_seconds', String(sec)]);
    }
    if (patch.short_break_seconds !== undefined) {
      const sec = assertPositiveInt(patch.short_break_seconds, 'Short break duration');
      if (sec > 7200) throw new Error('Short break duration cannot exceed 2 hours.');
      entries.push(['short_break_seconds', String(sec)]);
    }
    if (patch.long_break_seconds !== undefined) {
      const sec = assertPositiveInt(patch.long_break_seconds, 'Long break duration');
      if (sec > 14400) throw new Error('Long break duration cannot exceed 4 hours.');
      entries.push(['long_break_seconds', String(sec)]);
    }
    if (patch.auto_backup_enabled !== undefined) {
      if (typeof patch.auto_backup_enabled !== 'boolean') {
        throw new Error('auto_backup_enabled must be a boolean.');
      }
      entries.push(['auto_backup_enabled', String(patch.auto_backup_enabled)]);
    }
    if (patch.notifications_enabled !== undefined) {
      if (typeof patch.notifications_enabled !== 'boolean') {
        throw new Error('notifications_enabled must be a boolean.');
      }
      entries.push(['notifications_enabled', String(patch.notifications_enabled)]);
    }

    const now = new Date().toISOString();
    const stmt = this.db.prepare(
      `INSERT INTO app_settings (setting_key, setting_value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(setting_key) DO UPDATE SET
         setting_value = excluded.setting_value,
         updated_at = excluded.updated_at`
    );

    const tx = this.db.transaction(() => {
      for (const [k, v] of entries) {
        stmt.run(k, v, now);
      }
    });
    tx();

    return this.getSettings();
  }

  // ---------- Computed Stats & Analytics ----------

  public getDashboardStats(now: Date = new Date()): DashboardStats {
    const sessions = this.listCompletedSessions();
    const breaks = this.listAllBreaks();
    const goals = this.listGoals();
    return computeDashboardStats(sessions, breaks, goals, now);
  }

  public getAnalytics(now: Date = new Date()): AnalyticsData {
    const sessions = this.listCompletedSessions();
    const breaks = this.listAllBreaks();
    const goals = this.listGoals();
    return computeAnalyticsData(sessions, breaks, goals, now);
  }

  // ---------- Online SQLite Backup & Restore ----------

  public async createBackup(reason: 'auto' | 'manual' | 'pre-restore' = 'manual'): Promise<BackupFileInfo> {
    fs.mkdirSync(this.backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `focusdesk-${reason}-${stamp}.db`;
    const destPath = path.resolve(this.backupDir, filename);

    if (!destPath.startsWith(this.backupDir + path.sep)) {
      throw new Error('Invalid backup destination path.');
    }

    // Safe SQLite Online Backup API (never copies raw DB file mid-write)
    await this.db.backup(destPath);

    const stat = fs.statSync(destPath);
    const now = new Date().toISOString();

    if (reason === 'auto' || reason === 'manual') {
      this.db
        .prepare(
          `INSERT INTO app_settings (setting_key, setting_value, updated_at)
           VALUES ('last_backup_at', ?, ?), ('last_backup_file', ?, ?)
           ON CONFLICT(setting_key) DO UPDATE SET
             setting_value = excluded.setting_value,
             updated_at = excluded.updated_at`
        )
        .run(now, now, filename, now);
    }

    if (reason === 'auto') {
      this.pruneOldAutoBackups();
    }

    return {
      filename,
      created_at: stat.mtime.toISOString(),
      size_bytes: stat.size,
      reason,
    };
  }

  private pruneOldAutoBackups(): void {
    const allBackups = this.listBackups();
    if (allBackups.length <= 1) return; // Never remove the only valid backup

    const autoBackups = allBackups.filter((b) => b.reason === 'auto');
    if (autoBackups.length <= MAX_AUTO_BACKUPS) return;

    const toDelete = autoBackups.slice(MAX_AUTO_BACKUPS);
    for (const item of toDelete) {
      const target = path.resolve(this.backupDir, item.filename);
      if (target.startsWith(this.backupDir + path.sep) && fs.existsSync(target)) {
        fs.unlinkSync(target);
      }
    }
  }

  public listBackups(): BackupFileInfo[] {
    if (!fs.existsSync(this.backupDir)) return [];
    const files = fs.readdirSync(this.backupDir).filter((f) => f.endsWith('.db'));
    const list: BackupFileInfo[] = [];

    for (const filename of files) {
      const fullPath = path.resolve(this.backupDir, filename);
      if (!fullPath.startsWith(this.backupDir + path.sep)) continue;
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) continue;
      let reason: BackupFileInfo['reason'] = 'manual';
      if (filename.includes('-auto-')) reason = 'auto';
      else if (filename.includes('-pre-restore-')) reason = 'pre-restore';

      list.push({
        filename,
        created_at: stat.mtime.toISOString(),
        size_bytes: stat.size,
        reason,
      });
    }

    return list.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  }

  public async maybeRunAutoBackup(minIntervalHours = 12): Promise<BackupFileInfo | null> {
    const settings = this.getSettings();
    if (!settings.auto_backup_enabled) return null;

    const existing = this.listBackups();
    if (existing.length === 0) {
      return this.createBackup('auto');
    }

    if (!settings.last_backup_at) {
      return this.createBackup('auto');
    }

    const lastMs = Date.parse(settings.last_backup_at);
    if (!Number.isFinite(lastMs) || Date.now() - lastMs >= minIntervalHours * 3600 * 1000) {
      return this.createBackup('auto');
    }
    return null;
  }

  public async restoreBackup(filenameInput: unknown): Promise<{ restoredFrom: string; preRestoreBackup: string }> {
    const filename = assertBackupFilename(filenameInput);
    const sourcePath = path.resolve(this.backupDir, filename);

    if (!sourcePath.startsWith(this.backupDir + path.sep) || !fs.existsSync(sourcePath)) {
      throw new Error('Backup file does not exist.');
    }

    // Validate the backup file contains expected FocusDesk tables before touching live DB
    let probeDb: Database.Database | null = null;
    try {
      probeDb = new Database(sourcePath, { readonly: true });
      const integrity = probeDb.pragma('quick_check', { simple: true });
      if (integrity !== 'ok') {
        throw new Error('Selected backup file failed SQLite integrity verification.');
      }
      const tables = probeDb
        .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
        .all() as Array<{ name: string }>;
      const names = new Set(tables.map((t) => t.name));
      for (const req of ['subjects', 'study_sessions', 'breaks', 'goals', 'app_settings']) {
        if (!names.has(req)) {
          throw new Error(`Backup file is missing required table "${req}".`);
        }
      }
    } finally {
      probeDb?.close();
    }

    // Create a safety pre-restore backup of current live database
    const preRestore = await this.createBackup('pre-restore');

    // Safely close live DB, swap atomically using backup copy, and reopen
    this.close();
    try {
      for (const suffix of ['-wal', '-shm']) {
        const walFile = `${this.dbPath}${suffix}`;
        if (fs.existsSync(walFile)) {
          fs.unlinkSync(walFile);
        }
      }
      fs.copyFileSync(sourcePath, this.dbPath);
    } finally {
      this.db = this.openAndInit(this.dbPath);
      this.prepareRecoveryOnBoot();
    }

    return {
      restoredFrom: filename,
      preRestoreBackup: preRestore.filename,
    };
  }
}
