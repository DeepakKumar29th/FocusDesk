import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateStreaks, computeAnalyticsData, computeDashboardStats } from './analytics';
import type { BreakRecord, Goal, StudySession } from './types';

function makeSession(overrides: Partial<StudySession>): StudySession {
  return {
    id: 1,
    subject_id: 1,
    study_note: 'Linear Algebra',
    timer_mode: 'stopwatch',
    target_seconds: null,
    started_at: '2026-11-25T10:00:00.000',
    ended_at: '2026-11-25T10:30:00.000',
    focused_seconds: 1800,
    status: 'completed',
    last_heartbeat_at: '2026-11-25T10:30:00.000',
    active_segment_started_at: null,
    recovery_pending: 0,
    created_at: '2026-11-25T10:00:00.000',
    updated_at: '2026-11-25T10:30:00.000',
    subject_name: 'Mathematics',
    subject_color: '#3B82F6',
    ...overrides,
  };
}

test('calculateStreaks tracks consecutive study days and ignores 0-second or future sessions', () => {
  const now = new Date(2026, 10, 25, 18, 0, 0); // Nov 25, 2026
  const sessions: StudySession[] = [
    makeSession({ id: 1, started_at: new Date(2026, 10, 20, 9, 0).toISOString(), focused_seconds: 1200 }),
    makeSession({ id: 2, started_at: new Date(2026, 10, 21, 9, 0).toISOString(), focused_seconds: 1200 }),
    makeSession({ id: 3, started_at: new Date(2026, 10, 22, 9, 0).toISOString(), focused_seconds: 0 }), // 0s ignored
    makeSession({ id: 4, started_at: new Date(2026, 10, 23, 9, 0).toISOString(), focused_seconds: 1500 }),
    makeSession({ id: 5, started_at: new Date(2026, 10, 24, 9, 0).toISOString(), focused_seconds: 1800 }),
    makeSession({ id: 6, started_at: new Date(2026, 10, 25, 9, 0).toISOString(), focused_seconds: 900 }),
    makeSession({ id: 7, started_at: new Date(2026, 10, 26, 9, 0).toISOString(), focused_seconds: 900 }), // future ignored
  ];

  const streak = calculateStreaks(sessions, now);
  assert.equal(streak.currentStreakDays, 3); // Nov 23, 24, 25
  assert.equal(streak.longestStreakDays, 3);
});

test('computeDashboardStats leaves goal percentages null when goals are unconfigured', () => {
  const now = new Date(2026, 10, 25, 18, 0, 0);
  const sessions = [makeSession({ started_at: new Date(2026, 10, 25, 10, 0).toISOString(), focused_seconds: 3600 })];
  const breaks: BreakRecord[] = [
    {
      id: 1,
      study_session_id: 1,
      break_type: 'short',
      planned_seconds: 300,
      started_at: new Date(2026, 10, 25, 11, 0).toISOString(),
      ended_at: new Date(2026, 10, 25, 11, 5).toISOString(),
      duration_seconds: 300,
      status: 'completed',
      created_at: new Date(2026, 10, 25, 11, 0).toISOString(),
    },
  ];
  const stats = computeDashboardStats(sessions, breaks, [], now);
  assert.equal(stats.todayFocusedSeconds, 3600);
  assert.equal(stats.todayBreakSeconds, 300);
  assert.equal(stats.dailyGoalTargetSeconds, null);
  assert.equal(stats.dailyGoalPercentage, null);
  assert.equal(stats.weeklyGoalTargetSeconds, null);
  assert.equal(stats.weeklyGoalPercentage, null);
});

test('computeAnalyticsData calculates average daily time strictly over active study days and identifies most productive day', () => {
  const now = new Date(2026, 10, 25, 18, 0, 0); // Wednesday
  const sessions = [
    makeSession({
      id: 1,
      study_note: 'Algorithms',
      started_at: new Date(2026, 10, 23, 10, 0).toISOString(), // Monday
      focused_seconds: 7200,
    }),
    makeSession({
      id: 2,
      study_note: 'Databases',
      started_at: new Date(2026, 10, 25, 10, 0).toISOString(), // Wednesday
      focused_seconds: 3600,
    }),
  ];
  const goals: Goal[] = [
    {
      id: 1,
      goal_type: 'daily',
      target_seconds: 7200,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
  ];

  const analytics = computeAnalyticsData(sessions, [], goals, now);
  assert.equal(analytics.activeStudyDaysCount, 2);
  assert.equal(analytics.averageDailyFocusedSeconds, 5400); // (7200 + 3600) / 2 active days
  assert.equal(analytics.mostProductiveDay?.weekdayName, 'Monday');
  assert.equal(analytics.dailyGoalPercentage, 50); // 3600 / 7200 on today (Nov 25)
  assert.equal(analytics.weeklyGoalPercentage, null);
});

test('sessions with empty or free-form study_note aggregate strictly by subject and never fabricate an Other group', () => {
  const now = new Date(2026, 10, 25, 18, 0, 0); // Wed Nov 25, 2026
  const sessions: StudySession[] = [
    // Today: Python (no note) 2h
    makeSession({
      id: 1,
      subject_id: 10,
      subject_name: 'Python',
      subject_color: '#3B82F6',
      study_note: null,
      started_at: new Date(2026, 10, 25, 9, 0).toISOString(),
      focused_seconds: 7200,
    }),
    // Today: DBMS (with note) 1h 30m
    makeSession({
      id: 2,
      subject_id: 20,
      subject_name: 'DBMS',
      subject_color: '#10B981',
      study_note: 'SQL Joins',
      started_at: new Date(2026, 10, 25, 13, 0).toISOString(),
      focused_seconds: 5400,
    }),
    // Earlier this week (Mon Nov 23): Data Visualization (with note) 2h 30m
    makeSession({
      id: 3,
      subject_id: 30,
      subject_name: 'Data Visualization',
      subject_color: '#8B5CF6',
      study_note: 'Bar Charts',
      started_at: new Date(2026, 10, 23, 10, 0).toISOString(),
      focused_seconds: 9000,
    }),
    // Earlier this month (Nov 5): Python (different note) 1h -> must combine under Python
    makeSession({
      id: 4,
      subject_id: 10,
      subject_name: 'Python',
      subject_color: '#3B82F6',
      study_note: 'Introduction to Python',
      started_at: new Date(2026, 10, 5, 10, 0).toISOString(),
      focused_seconds: 3600,
    }),
    // Previous month (Oct 15): DBMS (no note) 30m
    makeSession({
      id: 5,
      subject_id: 20,
      subject_name: 'DBMS',
      subject_color: '#10B981',
      study_note: null,
      started_at: new Date(2026, 9, 15, 10, 0).toISOString(),
      focused_seconds: 1800,
    }),
  ];

  const goals: Goal[] = [
    {
      id: 1,
      goal_type: 'daily',
      target_seconds: 12600, // 3h 30m
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
    {
      id: 2,
      goal_type: 'weekly',
      target_seconds: 21600, // 6h
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
  ];

  const dash = computeDashboardStats(sessions, [], goals, now);
  const analytics = computeAnalyticsData(sessions, [], goals, now);

  assert.equal(dash.todayFocusedSeconds, 12600);
  assert.equal(dash.weeklyFocusedSeconds, 21600);
  assert.equal(dash.monthlyFocusedSeconds, 25200);
  assert.equal(dash.totalFocusedSeconds, 27000);
  assert.equal(dash.dailyGoalPercentage, 100);
  assert.equal(dash.weeklyGoalPercentage, 100);
  assert.equal(dash.currentStreakDays, 1);

  // Sum of subject breakdown matches exact total focused time per period
  const sum = (items: typeof dash.subjectBreakdown.today) =>
    items.reduce((acc, i) => acc + i.focusedSeconds, 0);

  assert.equal(sum(dash.subjectBreakdown.today), dash.todayFocusedSeconds);
  assert.equal(sum(dash.subjectBreakdown.week), dash.weeklyFocusedSeconds);
  assert.equal(sum(dash.subjectBreakdown.month), dash.monthlyFocusedSeconds);
  assert.equal(sum(dash.subjectBreakdown.all), dash.totalFocusedSeconds);

  // Most studied subject overall is Python (7200 + 3600 = 10800s)
  assert.equal(dash.mostStudiedSubject?.subjectName, 'Python');
  assert.equal(dash.mostStudiedSubject?.focusedSeconds, 10800);
  assert.equal(analytics.mostStudiedSubject?.subjectName, 'Python');

  // Study notes are descriptive only and never fabricate 'Other'
  assert.equal(analytics.subjectBreakdown.all.some((s) => /other/i.test(s.subjectName)), false);
  assert.equal('topicBreakdown' in analytics, false);
});

