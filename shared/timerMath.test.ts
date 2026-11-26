import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeBreakTiming,
  computeCountdownRemainingSeconds,
  computeCrashSafeFocusedSeconds,
  computeSessionFocusedSeconds,
  formatClock,
  formatDurationHuman,
  isCountdownFinished,
} from './timerMath';

test('computeSessionFocusedSeconds calculates elapsed time via timestamps and ignores paused intervals', () => {
  const t0 = Date.parse('2026-11-25T10:00:00.000Z');
  const running = {
    focused_seconds: 120,
    status: 'running' as const,
    active_segment_started_at: new Date(t0).toISOString(),
    timer_mode: 'stopwatch' as const,
    target_seconds: null,
  };
  assert.equal(computeSessionFocusedSeconds(running, t0 + 45_000), 165);

  const paused = {
    focused_seconds: 165,
    status: 'paused' as const,
    active_segment_started_at: null,
    timer_mode: 'stopwatch' as const,
    target_seconds: null,
  };
  // Even 10 minutes later, paused time does not count
  assert.equal(computeSessionFocusedSeconds(paused, t0 + 645_000), 165);
});

test('countdown remaining and completion math', () => {
  const t0 = Date.parse('2026-11-25T10:00:00.000Z');
  const session = {
    focused_seconds: 0,
    status: 'running' as const,
    active_segment_started_at: new Date(t0).toISOString(),
    timer_mode: 'countdown' as const,
    target_seconds: 1500,
  };
  assert.equal(computeCountdownRemainingSeconds(session, t0 + 500_000), 1000);
  assert.equal(isCountdownFinished(session, t0 + 1499_000), false);
  assert.equal(isCountdownFinished(session, t0 + 1500_000), true);
  assert.equal(computeCountdownRemainingSeconds(session, t0 + 1600_000), 0);
});

test('computeCrashSafeFocusedSeconds never counts time while application was closed', () => {
  const t0 = Date.parse('2026-11-25T10:00:00.000Z');
  const hb = Date.parse('2026-11-25T10:12:30.000Z'); // 12m 30s after segment start
  const recovered = computeCrashSafeFocusedSeconds({
    focused_seconds: 600,
    status: 'running',
    active_segment_started_at: new Date(t0).toISOString(),
    last_heartbeat_at: new Date(hb).toISOString(),
  });
  assert.equal(recovered, 600 + 750);
});

test('break timing tracks elapsed and overtime accurately', () => {
  const t0 = Date.parse('2026-11-25T11:00:00.000Z');
  const br = {
    started_at: new Date(t0).toISOString(),
    ended_at: null,
    duration_seconds: 0,
    planned_seconds: 300,
    status: 'running' as const,
  };
  assert.deepEqual(computeBreakTiming(br, t0 + 120_000), {
    elapsedSeconds: 120,
    remainingSeconds: 180,
    isOvertime: false,
  });
  assert.deepEqual(computeBreakTiming(br, t0 + 305_000), {
    elapsedSeconds: 305,
    remainingSeconds: 0,
    isOvertime: true,
  });
});

test('clock and human duration formatting', () => {
  assert.equal(formatClock(65), '01:05');
  assert.equal(formatClock(3665), '01:01:05');
  assert.equal(formatClock(65, true), '00:01:05');
  assert.equal(formatDurationHuman(0), '0m');
  assert.equal(formatDurationHuman(45), '45s');
  assert.equal(formatDurationHuman(5400), '1h 30m');
});
