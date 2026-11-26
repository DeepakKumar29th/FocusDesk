import { fromLocalDateKey, getWeekStartKey, toLocalDateKey } from './timerMath';
import type {
  AnalyticsData,
  BreakRecord,
  CalendarDaySummary,
  DashboardStats,
  Goal,
  StudySession,
  SubjectBreakdownByPeriod,
  SubjectBreakdownItem,
  TimeSeriesPoint,
  WeekdayProductivity,
} from './types';

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function validCompletedSessions(sessions: StudySession[]): StudySession[] {
  return sessions.filter((s) => s.status === 'completed' && s.focused_seconds > 0);
}

function validCompletedBreaks(breaks: BreakRecord[]): BreakRecord[] {
  return breaks.filter((b) => b.status !== 'running' && b.duration_seconds > 0);
}

function aggregateSubjects(sessions: StudySession[]): SubjectBreakdownItem[] {
  const map = new Map<number, SubjectBreakdownItem>();
  let total = 0;

  for (const s of sessions) {
    total += s.focused_seconds;
    const existing = map.get(s.subject_id);
    if (existing) {
      existing.focusedSeconds += s.focused_seconds;
      existing.sessionCount += 1;
    } else {
      map.set(s.subject_id, {
        subjectId: s.subject_id,
        subjectName: s.subject_name ?? `Subject #${s.subject_id}`,
        subjectColor: s.subject_color ?? '#3B82F6',
        focusedSeconds: s.focused_seconds,
        sessionCount: 1,
        percentage: 0,
      });
    }
  }

  return Array.from(map.values())
    .map((item) => ({
      ...item,
      percentage: total > 0 ? Math.round((item.focusedSeconds / total) * 100) : 0,
    }))
    .sort((a, b) => b.focusedSeconds - a.focusedSeconds);
}

export function computeSubjectBreakdowns(
  sessions: StudySession[],
  now: Date = new Date()
): SubjectBreakdownByPeriod {
  const completed = validCompletedSessions(sessions);
  const todayKey = toLocalDateKey(now);
  const weekStartKey = getWeekStartKey(now);
  const monthPrefix = todayKey.slice(0, 7);

  const nonFuture = completed.filter((s) => toLocalDateKey(s.started_at) <= todayKey);
  const todaySessions = nonFuture.filter((s) => toLocalDateKey(s.started_at) === todayKey);
  const weekSessions = nonFuture.filter((s) => toLocalDateKey(s.started_at) >= weekStartKey);
  const monthSessions = nonFuture.filter((s) => toLocalDateKey(s.started_at).slice(0, 7) === monthPrefix);

  return {
    today: aggregateSubjects(todaySessions),
    week: aggregateSubjects(weekSessions),
    month: aggregateSubjects(monthSessions),
    all: aggregateSubjects(nonFuture),
  };
}

/**
 * Computes consecutive study day streaks using local YYYY-MM-DD calendar boundaries.
 * A day counts if at least one completed study session on that date has focused_seconds > 0.
 * Sessions without a topic still count fully.
 */
export function calculateStreaks(
  sessions: StudySession[],
  now: Date = new Date()
): { currentStreakDays: number; longestStreakDays: number; activeDateKeys: string[] } {
  const valid = validCompletedSessions(sessions);
  const daySet = new Set<string>();
  const todayKey = toLocalDateKey(now);

  for (const s of valid) {
    const key = toLocalDateKey(s.started_at);
    if (key <= todayKey) {
      daySet.add(key);
    }
  }

  const activeDateKeys = Array.from(daySet).sort();
  if (activeDateKeys.length === 0) {
    return { currentStreakDays: 0, longestStreakDays: 0, activeDateKeys: [] };
  }

  let longestStreakDays = 1;
  let running = 1;
  for (let i = 1; i < activeDateKeys.length; i++) {
    const prev = fromLocalDateKey(activeDateKeys[i - 1]);
    const curr = fromLocalDateKey(activeDateKeys[i]);
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000);
    if (diffDays === 1) {
      running += 1;
      if (running > longestStreakDays) longestStreakDays = running;
    } else if (diffDays > 1) {
      running = 1;
    }
  }

  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterdayKey = toLocalDateKey(yesterday);

  let anchorKey: string | null = null;
  if (daySet.has(todayKey)) {
    anchorKey = todayKey;
  } else if (daySet.has(yesterdayKey)) {
    anchorKey = yesterdayKey;
  }

  let currentStreakDays = 0;
  if (anchorKey) {
    let cursor = fromLocalDateKey(anchorKey);
    while (daySet.has(toLocalDateKey(cursor))) {
      currentStreakDays += 1;
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
    }
  }

  return { currentStreakDays, longestStreakDays, activeDateKeys };
}

export function computeDashboardStats(
  sessions: StudySession[],
  breaks: BreakRecord[],
  goals: Goal[],
  now: Date = new Date()
): DashboardStats {
  const completed = validCompletedSessions(sessions);
  const completedBreaks = validCompletedBreaks(breaks);

  const todayKey = toLocalDateKey(now);
  const weekStartKey = getWeekStartKey(now);
  const monthPrefix = todayKey.slice(0, 7);

  let todayFocusedSeconds = 0;
  let todayCompletedSessions = 0;
  let totalCompletedSessions = 0;
  let longestSessionSeconds = 0;
  let totalFocusedSeconds = 0;
  let weeklyFocusedSeconds = 0;
  let monthlyFocusedSeconds = 0;

  for (const s of completed) {
    const dKey = toLocalDateKey(s.started_at);
    if (dKey > todayKey) continue;

    totalCompletedSessions += 1;
    totalFocusedSeconds += s.focused_seconds;
    if (s.focused_seconds > longestSessionSeconds) {
      longestSessionSeconds = s.focused_seconds;
    }
    if (dKey === todayKey) {
      todayFocusedSeconds += s.focused_seconds;
      todayCompletedSessions += 1;
    }
    if (dKey >= weekStartKey && dKey <= todayKey) {
      weeklyFocusedSeconds += s.focused_seconds;
    }
    if (dKey.slice(0, 7) === monthPrefix) {
      monthlyFocusedSeconds += s.focused_seconds;
    }
  }

  let todayBreakSeconds = 0;
  let totalBreakSeconds = 0;
  for (const b of completedBreaks) {
    const bKey = toLocalDateKey(b.started_at);
    if (bKey > todayKey) continue;
    totalBreakSeconds += b.duration_seconds;
    if (bKey === todayKey) {
      todayBreakSeconds += b.duration_seconds;
    }
  }

  const dailyGoal = goals.find((g) => g.goal_type === 'daily') ?? null;
  const weeklyGoal = goals.find((g) => g.goal_type === 'weekly') ?? null;

  const dailyGoalTargetSeconds = dailyGoal ? dailyGoal.target_seconds : null;
  const dailyGoalPercentage =
    dailyGoal && dailyGoal.target_seconds > 0
      ? Math.min(100, Math.round((todayFocusedSeconds / dailyGoal.target_seconds) * 100))
      : null;

  const weeklyGoalTargetSeconds = weeklyGoal ? weeklyGoal.target_seconds : null;
  const weeklyGoalPercentage =
    weeklyGoal && weeklyGoal.target_seconds > 0
      ? Math.min(100, Math.round((weeklyFocusedSeconds / weeklyGoal.target_seconds) * 100))
      : null;
  const weeklyRemainingSeconds =
    weeklyGoal ? Math.max(0, weeklyGoal.target_seconds - weeklyFocusedSeconds) : null;

  const { currentStreakDays, longestStreakDays } = calculateStreaks(completed, now);
  const subjectBreakdown = computeSubjectBreakdowns(completed, now);
  const mostStudiedSubject = subjectBreakdown.all[0] ?? null;

  return {
    todayFocusedSeconds,
    todayBreakSeconds,
    todayCompletedSessions,
    longestSessionSeconds,
    totalCompletedSessions,
    totalFocusedSeconds,
    totalBreakSeconds,
    currentStreakDays,
    longestStreakDays,
    weeklyFocusedSeconds,
    monthlyFocusedSeconds,
    dailyGoalTargetSeconds,
    dailyGoalPercentage,
    weeklyGoalTargetSeconds,
    weeklyGoalPercentage,
    weeklyRemainingSeconds,
    mostStudiedSubject,
    subjectBreakdown,
  };
}

export function computeAnalyticsData(
  sessions: StudySession[],
  breaks: BreakRecord[],
  goals: Goal[],
  now: Date = new Date()
): AnalyticsData {
  const completed = validCompletedSessions(sessions);
  const completedBreaks = validCompletedBreaks(breaks);
  const todayKey = toLocalDateKey(now);

  const calendarDays: Record<string, CalendarDaySummary> = {};
  for (const s of completed) {
    const dKey = toLocalDateKey(s.started_at);
    if (dKey > todayKey) continue;
    if (!calendarDays[dKey]) {
      calendarDays[dKey] = {
        dateKey: dKey,
        focusedSeconds: 0,
        breakSeconds: 0,
        sessionCount: 0,
        sessions: [],
      };
    }
    calendarDays[dKey].focusedSeconds += s.focused_seconds;
    calendarDays[dKey].sessionCount += 1;
    calendarDays[dKey].sessions.push(s);
  }

  for (const b of completedBreaks) {
    const bKey = toLocalDateKey(b.started_at);
    if (bKey > todayKey) continue;
    if (calendarDays[bKey]) {
      calendarDays[bKey].breakSeconds += b.duration_seconds;
    }
  }

  // Daily series: last 14 days
  const dailySeries: TimeSeriesPoint[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = toLocalDateKey(d);
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const summary = calendarDays[key];
    dailySeries.push({
      key,
      label,
      focusedSeconds: summary?.focusedSeconds ?? 0,
      breakSeconds: summary?.breakSeconds ?? 0,
      sessionCount: summary?.sessionCount ?? 0,
    });
  }

  // Weekly series: last 8 weeks
  const weeklyMap = new Map<string, { focusedSeconds: number; breakSeconds: number; sessionCount: number }>();
  for (const s of completed) {
    const dKey = toLocalDateKey(s.started_at);
    if (dKey > todayKey) continue;
    const wKey = getWeekStartKey(fromLocalDateKey(dKey));
    const entry = weeklyMap.get(wKey) ?? { focusedSeconds: 0, breakSeconds: 0, sessionCount: 0 };
    entry.focusedSeconds += s.focused_seconds;
    entry.sessionCount += 1;
    weeklyMap.set(wKey, entry);
  }
  for (const b of completedBreaks) {
    const bKey = toLocalDateKey(b.started_at);
    if (bKey > todayKey) continue;
    const wKey = getWeekStartKey(fromLocalDateKey(bKey));
    const entry = weeklyMap.get(wKey);
    if (entry) entry.breakSeconds += b.duration_seconds;
  }

  const currentWeekStart = fromLocalDateKey(getWeekStartKey(now));
  const weeklySeries: TimeSeriesPoint[] = [];
  for (let i = 7; i >= 0; i--) {
    const wStart = new Date(
      currentWeekStart.getFullYear(),
      currentWeekStart.getMonth(),
      currentWeekStart.getDate() - i * 7
    );
    const wKey = toLocalDateKey(wStart);
    const entry = weeklyMap.get(wKey);
    const label = wStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    weeklySeries.push({
      key: wKey,
      label: `Wk ${label}`,
      focusedSeconds: entry?.focusedSeconds ?? 0,
      breakSeconds: entry?.breakSeconds ?? 0,
      sessionCount: entry?.sessionCount ?? 0,
    });
  }

  // Monthly series: last 6 months
  const monthlyMap = new Map<string, { focusedSeconds: number; breakSeconds: number; sessionCount: number }>();
  for (const s of completed) {
    const dKey = toLocalDateKey(s.started_at);
    if (dKey > todayKey) continue;
    const mKey = dKey.slice(0, 7);
    const entry = monthlyMap.get(mKey) ?? { focusedSeconds: 0, breakSeconds: 0, sessionCount: 0 };
    entry.focusedSeconds += s.focused_seconds;
    entry.sessionCount += 1;
    monthlyMap.set(mKey, entry);
  }
  for (const b of completedBreaks) {
    const bKey = toLocalDateKey(b.started_at);
    if (bKey > todayKey) continue;
    const mKey = bKey.slice(0, 7);
    const entry = monthlyMap.get(mKey);
    if (entry) entry.breakSeconds += b.duration_seconds;
  }

  const monthlySeries: TimeSeriesPoint[] = [];
  for (let i = 5; i >= 0; i--) {
    const mDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mKey = `${mDate.getFullYear()}-${String(mDate.getMonth() + 1).padStart(2, '0')}`;
    const entry = monthlyMap.get(mKey);
    const label = mDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    monthlySeries.push({
      key: mKey,
      label,
      focusedSeconds: entry?.focusedSeconds ?? 0,
      breakSeconds: entry?.breakSeconds ?? 0,
      sessionCount: entry?.sessionCount ?? 0,
    });
  }

  // Subject-wise breakdown across Today, Week, Month, and All Time
  const subjectBreakdown = computeSubjectBreakdowns(completed, now);
  const mostStudiedSubject = subjectBreakdown.all[0] ?? null;

  let totalAllFocused = 0;
  for (const s of completed) {
    const dKey = toLocalDateKey(s.started_at);
    if (dKey > todayKey) continue;
    totalAllFocused += s.focused_seconds;
  }

  const activeDays = Object.values(calendarDays).filter((d) => d.focusedSeconds > 0);
  const activeStudyDaysCount = activeDays.length;
  const averageDailyFocusedSeconds =
    activeStudyDaysCount > 0 ? Math.round(totalAllFocused / activeStudyDaysCount) : 0;

  const weekdayMap = new Map<number, WeekdayProductivity>();
  for (let i = 0; i < 7; i++) {
    weekdayMap.set(i, {
      weekdayIndex: i,
      weekdayName: WEEKDAY_NAMES[i],
      focusedSeconds: 0,
      sessionCount: 0,
    });
  }
  for (const s of completed) {
    const dKey = toLocalDateKey(s.started_at);
    if (dKey > todayKey) continue;
    const wd = fromLocalDateKey(dKey).getDay();
    const row = weekdayMap.get(wd)!;
    row.focusedSeconds += s.focused_seconds;
    row.sessionCount += 1;
  }
  const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
  const weekdayBreakdown = weekdayOrder.map((idx) => weekdayMap.get(idx)!);
  const nonZeroWeekdays = weekdayBreakdown.filter((w) => w.focusedSeconds > 0);
  const mostProductiveDay =
    nonZeroWeekdays.length > 0
      ? nonZeroWeekdays.reduce((best, curr) => (curr.focusedSeconds > best.focusedSeconds ? curr : best))
      : null;

  const dash = computeDashboardStats(completed, completedBreaks, goals, now);

  return {
    dailySeries,
    weeklySeries,
    monthlySeries,
    subjectBreakdown,
    mostStudiedSubject,
    averageDailyFocusedSeconds,
    activeStudyDaysCount,
    todayFocusedSeconds: dash.todayFocusedSeconds,
    weeklyFocusedSeconds: dash.weeklyFocusedSeconds,
    dailyGoalTargetSeconds: dash.dailyGoalTargetSeconds,
    weeklyGoalTargetSeconds: dash.weeklyGoalTargetSeconds,
    dailyGoalPercentage: dash.dailyGoalPercentage,
    weeklyGoalPercentage: dash.weeklyGoalPercentage,
    mostProductiveDay,
    weekdayBreakdown,
    calendarDays,
    currentStreakDays: dash.currentStreakDays,
    longestStreakDays: dash.longestStreakDays,
  };
}
