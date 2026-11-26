import type { BreakRecord, StudySession } from './types';

/**
 * Computes current focused seconds for a study session using timestamp arithmetic.
 * Never counts paused intervals or time after completion/recovery freeze.
 */
export function computeSessionFocusedSeconds(
  session: Pick<StudySession, 'focused_seconds' | 'status' | 'active_segment_started_at' | 'timer_mode' | 'target_seconds'>,
  nowMs: number = Date.now()
): number {
  let total = Math.max(0, Math.floor(session.focused_seconds || 0));

  if (session.status === 'running' && session.active_segment_started_at) {
    const segStartMs = Date.parse(session.active_segment_started_at);
    if (Number.isFinite(segStartMs)) {
      const deltaSec = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));
      total += deltaSec;
    }
  }

  return total;
}

/**
 * Computes remaining seconds for countdown mode (clamped >= 0).
 * Returns null for stopwatch mode.
 */
export function computeCountdownRemainingSeconds(
  session: Pick<StudySession, 'focused_seconds' | 'status' | 'active_segment_started_at' | 'timer_mode' | 'target_seconds'>,
  nowMs: number = Date.now()
): number | null {
  if (session.timer_mode !== 'countdown' || session.target_seconds == null) {
    return null;
  }
  const elapsed = computeSessionFocusedSeconds(session, nowMs);
  return Math.max(0, session.target_seconds - elapsed);
}

export function isCountdownFinished(
  session: Pick<StudySession, 'focused_seconds' | 'status' | 'active_segment_started_at' | 'timer_mode' | 'target_seconds'>,
  nowMs: number = Date.now()
): boolean {
  if (session.timer_mode !== 'countdown' || session.target_seconds == null || session.target_seconds <= 0) {
    return false;
  }
  return computeSessionFocusedSeconds(session, nowMs) >= session.target_seconds;
}

/**
 * Computes elapsed seconds and remaining planned seconds for an active break.
 */
export function computeBreakTiming(
  breakRecord: Pick<BreakRecord, 'started_at' | 'ended_at' | 'duration_seconds' | 'planned_seconds' | 'status'>,
  nowMs: number = Date.now()
): { elapsedSeconds: number; remainingSeconds: number; isOvertime: boolean } {
  let elapsed = Math.max(0, Math.floor(breakRecord.duration_seconds || 0));
  if (breakRecord.status === 'running') {
    const startMs = Date.parse(breakRecord.started_at);
    if (Number.isFinite(startMs)) {
      elapsed = Math.max(0, Math.floor((nowMs - startMs) / 1000));
    }
  }
  const planned = Math.max(0, Math.floor(breakRecord.planned_seconds || 0));
  const remainingSeconds = Math.max(0, planned - elapsed);
  return {
    elapsedSeconds: elapsed,
    remainingSeconds,
    isOvertime: planned > 0 && elapsed >= planned,
  };
}

/**
 * Formats seconds as HH:MM:SS or MM:SS for timer displays.
 */
export function formatClock(totalSeconds: number, alwaysShowHours: boolean = false): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  if (hours > 0 || alwaysShowHours) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Formats seconds as clean human-readable duration (e.g., "1h 24m", "18m", "45s").
 */
export function formatDurationHuman(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  if (safe === 0) return '0m';
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

/**
 * Converts a Date or ISO timestamp into a local calendar YYYY-MM-DD key.
 * Uses local year/month/day consistently for day boundaries.
 */
export function toLocalDateKey(input: Date | string): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parses a YYYY-MM-DD key into a local Date at midnight.
 */
export function fromLocalDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

/**
 * Returns the local Monday YYYY-MM-DD key for the week containing `date`.
 */
export function getWeekStartKey(date: Date): string {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day; // Monday as week start
  copy.setDate(copy.getDate() + diff);
  return toLocalDateKey(copy);
}

/**
 * Computes recovery focused seconds when an app closes/crashes unexpectedly.
 * Caps active segment at `last_heartbeat_at` so closed time is NEVER counted.
 */
export function computeCrashSafeFocusedSeconds(
  session: Pick<StudySession, 'focused_seconds' | 'status' | 'active_segment_started_at' | 'last_heartbeat_at'>
): number {
  const base = Math.max(0, Math.floor(session.focused_seconds || 0));
  if (session.status !== 'running' || !session.active_segment_started_at) {
    return base;
  }
  const segStartMs = Date.parse(session.active_segment_started_at);
  const hbMs = Date.parse(session.last_heartbeat_at);
  if (!Number.isFinite(segStartMs) || !Number.isFinite(hbMs)) {
    return base;
  }
  const extra = Math.max(0, Math.floor((hbMs - segStartMs) / 1000));
  return base + extra;
}
