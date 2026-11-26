import Database from 'better-sqlite3';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FocusDeskDatabase } from './database';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'focusdesk-test-'));
}

test('SQLite database lifecycle: subjects, optional study notes, safe archival, sessions, breaks, recovery, backup & restore', async () => {
  const dir = makeTempDir();
  const db = new FocusDeskDatabase(dir);

  try {
    // 1. Create subject
    const sub = db.createSubject('Computer Science', '#3B82F6');
    assert.equal(sub.name, 'Computer Science');

    // Unused subject hard deletes
    const tempSub = db.createSubject('Temporary', '#10B981');
    const tempDel = db.deleteSubject(tempSub.id);
    assert.equal(tempDel.action, 'deleted');

    // 2. Start session with optional studyNote, disallow overlapping sessions, pause, resume, finish
    const t0 = Date.parse('2026-11-25T09:00:00.000Z');
    const state1 = db.startSession(
      { subjectId: sub.id, studyNote: 'Operating Systems', timerMode: 'stopwatch' },
      t0
    );
    assert.ok(state1.activeSession);
    assert.equal(state1.activeSession.status, 'running');
    assert.equal(state1.activeSession.study_note, 'Operating Systems');

    assert.throws(() => {
      db.startSession({ subjectId: sub.id, studyNote: 'Algorithms', timerMode: 'stopwatch' }, t0 + 1000);
    }, /already exists/);

    const paused = db.pauseSession(state1.activeSession.id, t0 + 60_000);
    assert.equal(paused.activeSession?.focused_seconds, 60);
    assert.equal(paused.activeSession?.status, 'paused');

    // Start and end a manual break while paused; break must not count as focused study time
    const brkState = db.startBreak('short', t0 + 70_000);
    assert.ok(brkState.activeBreak);
    assert.equal(brkState.activeBreak.study_session_id, state1.activeSession.id);
    const afterBrk = db.endBreak(brkState.activeBreak.id, 'complete', t0 + 370_000);
    assert.equal(afterBrk.activeBreak, null);

    // Resume and finish
    db.resumeSession(state1.activeSession.id, t0 + 380_000);
    const { completedSession } = db.finishSession(state1.activeSession.id, t0 + 440_000);
    assert.equal(completedSession.focused_seconds, 120); // 60s + 60s, paused & break excluded
    assert.equal(completedSession.break_count, 1);
    assert.equal(completedSession.break_seconds, 300);
    assert.equal(completedSession.study_note, 'Operating Systems');

    // Safe archival when subject has study sessions
    const archiveRes = db.deleteSubject(sub.id);
    assert.equal(archiveRes.action, 'archived');
    assert.equal(db.listSubjects(false).length, 0);
    assert.equal(db.listCompletedSessions().length, 1);
    db.restoreSubject(sub.id);

    // Renaming subject must preserve historical subject name and study_note in completed records
    db.updateSubject(sub.id, 'Systems Engineering');
    const historyAfterRename = db.listCompletedSessions();
    assert.equal(historyAfterRename[0].subject_name, 'Computer Science');
    assert.equal(historyAfterRename[0].study_note, 'Operating Systems');

    // 3. Create manual backup before adding another session
    const backup = await db.createBackup('manual');
    assert.ok(fs.existsSync(path.join(db.backupDir, backup.filename)));

    // 4. Simulate crash during active session -> boot recovery must freeze at heartbeat without counting closed hours
    const tCrashStart = Date.parse('2026-11-25T12:00:00.000Z');
    const crashState = db.startSession(
      { subjectId: sub.id, studyNote: 'Chapter 4', timerMode: 'countdown', targetSeconds: 1500 },
      tCrashStart
    );
    db.heartbeatSession(crashState.activeSession!.id, tCrashStart + 90_000); // 90s elapsed before crash

    // Simulate reopening 3 hours later
    db.prepareRecoveryOnBoot(tCrashStart + 3 * 3600_000);
    const afterBoot = db.getActiveState(tCrashStart + 3 * 3600_000);
    assert.equal(afterBoot.activeSession, null);
    assert.ok(afterBoot.recoverySession);
    assert.equal(afterBoot.recoverySession.focused_seconds, 90);
    assert.equal(afterBoot.recoverySession.status, 'paused');
    assert.equal(afterBoot.recoverySession.study_note, 'Chapter 4');

    // Discard recovered session
    const discarded = db.resolveRecovery(afterBoot.recoverySession.id, 'discard');
    assert.equal(discarded.recoverySession, null);
    assert.equal(db.listCompletedSessions().length, 1);

    // 5. Modify history then restore earlier backup
    db.deleteCompletedSession(completedSession.id);
    assert.equal(db.listCompletedSessions().length, 0);

    await db.restoreBackup(backup.filename);
    assert.equal(db.listCompletedSessions().length, 1);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('SQLite stores empty study notes as NULL, edits notes freely, and migrates legacy topic schemas to study_note', () => {
  const dir = makeTempDir();
  const dbPath = path.join(dir, 'focusdesk.db');

  // Create a legacy database where study_sessions.topic_id was NOT NULL
  const legacy = new Database(dbPath);
  legacy.exec(`
    CREATE TABLE subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#3B82F6',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT NULL
    );
    CREATE TABLE topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT NULL
    );
    CREATE TABLE study_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
      topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
      timer_mode TEXT NOT NULL CHECK (timer_mode IN ('stopwatch', 'countdown')),
      target_seconds INTEGER NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT NULL,
      focused_seconds INTEGER NOT NULL DEFAULT 0 CHECK (focused_seconds >= 0),
      status TEXT NOT NULL CHECK (status IN ('running', 'paused', 'completed', 'discarded')),
      last_heartbeat_at TEXT NOT NULL,
      active_segment_started_at TEXT NULL,
      recovery_pending INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const iso = '2026-11-25T08:00:00.000Z';
  legacy.prepare(`INSERT INTO subjects (name, color, created_at, updated_at) VALUES (?, ?, ?, ?)`).run('DBMS', '#10B981', iso, iso);
  legacy.prepare(`INSERT INTO topics (subject_id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`).run(1, 'SQL Joins', iso, iso);
  legacy
    .prepare(
      `INSERT INTO study_sessions (subject_id, topic_id, timer_mode, started_at, ended_at, focused_seconds, status, last_heartbeat_at, created_at, updated_at)
       VALUES (1, 1, 'stopwatch', ?, ?, 1800, 'completed', ?, ?, ?)`
    )
    .run(iso, '2026-11-25T08:30:00.000Z', '2026-11-25T08:30:00.000Z', iso, iso);
  legacy.close();

  const db = new FocusDeskDatabase(dir);
  try {
    // Existing legacy row preserves topic name inside study_note
    const initialHistory = db.listCompletedSessions();
    assert.equal(initialHistory.length, 1);
    assert.equal(initialHistory[0].subject_name, 'DBMS');
    assert.equal(initialHistory[0].study_note, 'SQL Joins');

    // Start + finish a session with empty/whitespace study note -> saved as NULL
    const python = db.createSubject('Python', '#3B82F6');
    const t0 = Date.parse('2026-11-25T10:00:00.000Z');
    const started = db.startSession({ subjectId: python.id, studyNote: '   ', timerMode: 'stopwatch' }, t0);
    assert.ok(started.activeSession);
    assert.equal(started.activeSession.study_note, null);

    const { completedSession } = db.finishSession(started.activeSession.id, t0 + 3600_000);
    assert.equal(completedSession.study_note, null);
    assert.equal(completedSession.subject_name, 'Python');
    assert.equal(completedSession.focused_seconds, 3600);

    // Edit session to add a free-form study note, then clear it back to NULL
    const withNote = db.updateCompletedSession(completedSession.id, {
      subjectId: python.id,
      studyNote: 'Introduction to Python',
      startedAt: completedSession.started_at,
      endedAt: completedSession.ended_at!,
      focusedSeconds: 3600,
    });
    assert.equal(withNote.study_note, 'Introduction to Python');

    const clearedNote = db.updateCompletedSession(completedSession.id, {
      subjectId: python.id,
      studyNote: '',
      startedAt: completedSession.started_at,
      endedAt: completedSession.ended_at!,
      focusedSeconds: 3600,
    });
    assert.equal(clearedNote.study_note, null);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

