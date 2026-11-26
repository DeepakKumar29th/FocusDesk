export type TimerMode = 'stopwatch' | 'countdown';
export type SessionStatus = 'running' | 'paused' | 'completed' | 'discarded';
export type BreakType = 'short' | 'long';
export type BreakStatus = 'running' | 'completed' | 'skipped';
export type GoalType = 'daily' | 'weekly';

export interface Subject {
  id: number;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  session_count?: number;
}

export interface StudySession {
  id: number;
  subject_id: number;
  timer_mode: TimerMode;
  target_seconds: number | null;
  started_at: string;
  ended_at: string | null;
  focused_seconds: number;
  status: SessionStatus;
  last_heartbeat_at: string;
  active_segment_started_at: string | null;
  recovery_pending: number;
  created_at: string;
  updated_at: string;
  subject_name?: string;
  subject_color?: string;
  study_note?: string | null;
  break_count?: number;
  break_seconds?: number;
}

export interface BreakRecord {
  id: number;
  study_session_id: number | null;
  break_type: BreakType;
  planned_seconds: number;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  status: BreakStatus;
  created_at: string;
}

export interface Goal {
  id: number;
  goal_type: GoalType;
  target_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface AppSettings {
  default_timer_mode: TimerMode;
  preferred_countdown_seconds: number;
  short_break_seconds: number;
  long_break_seconds: number;
  auto_backup_enabled: boolean;
  last_backup_at: string | null;
  last_backup_file: string | null;
  notifications_enabled: boolean;
  app_version: string;
  database_path: string;
  backup_dir: string;
}

export interface BackupFileInfo {
  filename: string;
  created_at: string;
  size_bytes: number;
  reason: 'auto' | 'manual' | 'pre-restore';
}

export interface SubjectBreakdownItem {
  subjectId: number;
  subjectName: string;
  subjectColor: string;
  focusedSeconds: number;
  sessionCount: number;
  percentage: number;
}

export interface SubjectBreakdownByPeriod {
  today: SubjectBreakdownItem[];
  week: SubjectBreakdownItem[];
  month: SubjectBreakdownItem[];
  all: SubjectBreakdownItem[];
}

export interface DashboardStats {
  todayFocusedSeconds: number;
  todayBreakSeconds: number;
  todayCompletedSessions: number;
  longestSessionSeconds: number;
  totalCompletedSessions: number;
  totalFocusedSeconds: number;
  totalBreakSeconds: number;
  currentStreakDays: number;
  longestStreakDays: number;
  weeklyFocusedSeconds: number;
  monthlyFocusedSeconds: number;
  dailyGoalTargetSeconds: number | null;
  dailyGoalPercentage: number | null;
  weeklyGoalTargetSeconds: number | null;
  weeklyGoalPercentage: number | null;
  weeklyRemainingSeconds: number | null;
  mostStudiedSubject: SubjectBreakdownItem | null;
  subjectBreakdown: SubjectBreakdownByPeriod;
}

export interface TimeSeriesPoint {
  key: string;
  label: string;
  focusedSeconds: number;
  breakSeconds: number;
  sessionCount: number;
}

export interface CalendarDaySummary {
  dateKey: string;
  focusedSeconds: number;
  breakSeconds: number;
  sessionCount: number;
  sessions: StudySession[];
}

export interface WeekdayProductivity {
  weekdayIndex: number; // 0 = Sunday .. 6 = Saturday
  weekdayName: string;
  focusedSeconds: number;
  sessionCount: number;
}

export interface AnalyticsData {
  dailySeries: TimeSeriesPoint[];
  weeklySeries: TimeSeriesPoint[];
  monthlySeries: TimeSeriesPoint[];
  subjectBreakdown: SubjectBreakdownByPeriod;
  mostStudiedSubject: SubjectBreakdownItem | null;
  averageDailyFocusedSeconds: number;
  activeStudyDaysCount: number;
  todayFocusedSeconds: number;
  weeklyFocusedSeconds: number;
  dailyGoalTargetSeconds: number | null;
  weeklyGoalTargetSeconds: number | null;
  dailyGoalPercentage: number | null;
  weeklyGoalPercentage: number | null;
  mostProductiveDay: WeekdayProductivity | null;
  weekdayBreakdown: WeekdayProductivity[];
  calendarDays: Record<string, CalendarDaySummary>;
  currentStreakDays: number;
  longestStreakDays: number;
}

export interface ActiveStatePayload {
  activeSession: StudySession | null;
  recoverySession: StudySession | null;
  activeBreak: BreakRecord | null;
  serverNowIso: string;
}

export type PageId =
  | 'dashboard'
  | 'timer'
  | 'history'
  | 'analytics'
  | 'goals'
  | 'settings';
