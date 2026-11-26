import { useState } from 'react';
import { ArrowRight, BookOpen, Clock, Coffee, Flame, Play, Target, Trophy } from 'lucide-react';
import { formatDurationHuman } from '../../shared/timerMath';
import type { DashboardStats, PageId, StudySession } from '../../shared/types';

interface DashboardViewProps {
  stats: DashboardStats | null;
  recentSessions: StudySession[];
  onNavigate: (page: PageId) => void;
}

type SubjectPeriod = 'today' | 'week' | 'month' | 'all';

const PERIOD_LABELS: Array<{ id: SubjectPeriod; label: string; summaryLabel: string }> = [
  { id: 'today', label: 'Today', summaryLabel: 'Today' },
  { id: 'week', label: 'This Week', summaryLabel: 'This Week' },
  { id: 'month', label: 'This Month', summaryLabel: 'This Month' },
  { id: 'all', label: 'All Time', summaryLabel: 'All Time' },
];

export function DashboardView({ stats, recentSessions, onNavigate }: DashboardViewProps) {
  const [subjectPeriod, setSubjectPeriod] = useState<SubjectPeriod>('today');

  const todayFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const s: DashboardStats = stats ?? {
    todayFocusedSeconds: 0,
    todayBreakSeconds: 0,
    todayCompletedSessions: 0,
    longestSessionSeconds: 0,
    totalCompletedSessions: 0,
    totalFocusedSeconds: 0,
    totalBreakSeconds: 0,
    currentStreakDays: 0,
    longestStreakDays: 0,
    weeklyFocusedSeconds: 0,
    monthlyFocusedSeconds: 0,
    dailyGoalTargetSeconds: null,
    dailyGoalPercentage: null,
    weeklyGoalTargetSeconds: null,
    weeklyGoalPercentage: null,
    weeklyRemainingSeconds: null,
    mostStudiedSubject: null,
    subjectBreakdown: {
      today: [],
      week: [],
      month: [],
      all: [],
    },
  };

  const todayTotalTracked = s.todayFocusedSeconds + s.todayBreakSeconds;
  const studySharePercent =
    todayTotalTracked > 0 ? Math.round((s.todayFocusedSeconds / todayTotalTracked) * 100) : 0;

  const activeSubjectsList = s.subjectBreakdown[subjectPeriod];
  const periodFocusedTotal = activeSubjectsList.reduce((sum, item) => sum + item.focusedSeconds, 0);
  const currentPeriodMeta = PERIOD_LABELS.find((p) => p.id === subjectPeriod) ?? PERIOD_LABELS[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#A0ADA9]">{todayFormatted}</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-[#F1F5F4]">
            Welcome back to FocusDesk
          </h1>
          <p className="mt-1 text-sm text-[#A0ADA9]">
            Your calm overview of focused study time, subject progress, breaks, streaks, and goals.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('timer')}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#8BE0BC] hover:bg-[#7AD5AE] text-sm font-semibold text-[#11221B] transition-colors whitespace-nowrap shrink-0"
        >
          <Play className="w-4 h-4" />
          <span>Open Study Timer</span>
        </button>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <div className="rounded-2xl bg-[#242D36] border border-[#343F49] shadow-sm shadow-black/20 p-5">
          <div className="flex items-center justify-between text-xs font-medium text-[#A0ADA9]">
            <span>Today&apos;s Focused Study</span>
            <span className="p-1.5 rounded-lg bg-[#8BE0BC]/14 text-[#8BE0BC]">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 text-3xl font-semibold font-mono-tabular text-[#F1F5F4]">
            {formatDurationHuman(s.todayFocusedSeconds)}
          </div>
          <div className="mt-2 text-xs text-[#A0ADA9] tabular-nums">
            {s.todayCompletedSessions} {s.todayCompletedSessions === 1 ? 'session' : 'sessions'} today
          </div>
        </div>

        <div className="rounded-2xl bg-[#242D36] border border-[#343F49] shadow-sm shadow-black/20 p-5">
          <div className="flex items-center justify-between text-xs font-medium text-[#A0ADA9]">
            <span>Longest Study Session</span>
            <span className="p-1.5 rounded-lg bg-[#8ABEFF]/14 text-[#8ABEFF]">
              <Trophy className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 text-3xl font-semibold font-mono-tabular text-[#F1F5F4]">
            {formatDurationHuman(s.longestSessionSeconds)}
          </div>
          <div className="mt-2 text-xs text-[#A0ADA9] tabular-nums">
            Personal best single session
          </div>
        </div>

        <div className="rounded-2xl bg-[#242D36] border border-[#343F49] shadow-sm shadow-black/20 p-5">
          <div className="flex items-center justify-between text-xs font-medium text-[#A0ADA9]">
            <span>Current Study Streak</span>
            <span className="p-1.5 rounded-lg bg-[#B9A5F5]/14 text-[#B9A5F5]">
              <Flame className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 text-3xl font-semibold font-mono-tabular text-[#F1F5F4]">
            {s.currentStreakDays} {s.currentStreakDays === 1 ? 'day' : 'days'}
          </div>
          <div className="mt-2 text-xs text-[#A0ADA9] tabular-nums">
            Longest streak: {s.longestStreakDays} {s.longestStreakDays === 1 ? 'day' : 'days'}
          </div>
        </div>

        <div className="rounded-2xl bg-[#242D36] border border-[#343F49] shadow-sm shadow-black/20 p-5">
          <div className="flex items-center justify-between text-xs font-medium text-[#A0ADA9]">
            <span>Completed Sessions</span>
            <span className="p-1.5 rounded-lg bg-[#1A2128] text-[#A0ADA9]">
              <Target className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 text-3xl font-semibold font-mono-tabular text-[#F1F5F4]">
            {s.totalCompletedSessions}
          </div>
          <div className="mt-2 text-xs text-[#A0ADA9] tabular-nums">
            Total focused: {formatDurationHuman(s.totalFocusedSeconds)}
          </div>
        </div>

        <div className="rounded-2xl bg-[#242D36] border border-[#343F49] shadow-sm shadow-black/20 p-5">
          <div className="flex items-center justify-between text-xs font-medium text-[#A0ADA9]">
            <span>Most Studied Subject</span>
            <span className="p-1.5 rounded-lg bg-[#8BE0BC]/14 text-[#8BE0BC]">
              <BookOpen className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3 flex items-start gap-2 min-w-0">
            {s.mostStudiedSubject ? (
              <>
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5"
                  style={{ backgroundColor: s.mostStudiedSubject.subjectColor }}
                />
                <span
                  className="text-lg font-semibold leading-snug text-[#F1F5F4] line-clamp-2"
                  title={s.mostStudiedSubject.subjectName}
                >
                  {s.mostStudiedSubject.subjectName}
                </span>
              </>
            ) : (
              <span className="text-lg font-semibold leading-snug text-[#A0ADA9]">No data yet</span>
            )}
          </div>
          <div className="mt-2 text-xs text-[#A0ADA9] tabular-nums">
            {s.mostStudiedSubject
              ? `${formatDurationHuman(s.mostStudiedSubject.focusedSeconds)} total (${s.mostStudiedSubject.percentage}% share)`
              : 'Complete a session to calculate'}
          </div>
        </div>
      </div>

      {/* Goals & Study vs Break Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Daily Goal */}
        <div className="rounded-2xl bg-[#242D36] border border-[#343F49] shadow-sm shadow-black/20 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#F1F5F4]">Daily Study Goal</h2>
              {s.dailyGoalPercentage !== null ? (
                <span className="text-sm font-semibold font-mono-tabular text-[#8ABEFF]">
                  {s.dailyGoalPercentage}%
                </span>
              ) : (
                <Target className="w-4 h-4 text-[#A0ADA9]" />
              )}
            </div>

            {s.dailyGoalTargetSeconds !== null ? (
              <div className="mt-4">
                <div className="flex items-baseline justify-between text-xs text-[#A0ADA9] tabular-nums">
                  <span>{formatDurationHuman(s.todayFocusedSeconds)} completed</span>
                  <span>Target {formatDurationHuman(s.dailyGoalTargetSeconds)}</span>
                </div>
                <div className="mt-2 h-2.5 w-full rounded-full bg-[#1A2128] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#8ABEFF] transition-all duration-300"
                    style={{ width: `${s.dailyGoalPercentage ?? 0}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <p className="text-sm text-[#A0ADA9]">No daily goal configured yet.</p>
                <button
                  type="button"
                  onClick={() => onNavigate('goals')}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[#8BE0BC] hover:text-[#A9ECD0]"
                >
                  <span>Set daily goal</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Weekly Study & Goal Progress */}
        <div className="rounded-2xl bg-[#242D36] border border-[#343F49] shadow-sm shadow-black/20 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#F1F5F4]">Weekly Study Progress</h2>
              {s.weeklyGoalPercentage !== null && (
                <span className="text-sm font-semibold font-mono-tabular text-[#8BE0BC]">
                  {s.weeklyGoalPercentage}%
                </span>
              )}
            </div>

            <div className="mt-3 text-xl font-semibold font-mono-tabular text-[#F1F5F4]">
              {formatDurationHuman(s.weeklyFocusedSeconds)}
              <span className="ml-2 text-xs font-sans font-normal text-[#A0ADA9]">this week</span>
            </div>

            {s.weeklyGoalTargetSeconds !== null ? (
              <div className="mt-3">
                <div className="flex items-baseline justify-between text-xs text-[#A0ADA9] tabular-nums">
                  <span>Target {formatDurationHuman(s.weeklyGoalTargetSeconds)}</span>
                  <span>{formatDurationHuman(s.weeklyRemainingSeconds ?? 0)} left</span>
                </div>
                <div className="mt-2 h-2.5 w-full rounded-full bg-[#1A2128] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#8BE0BC] transition-all duration-300"
                    style={{ width: `${s.weeklyGoalPercentage ?? 0}%` }}
                  />
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate('goals')}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[#8BE0BC] hover:text-[#A9ECD0]"
              >
                <span>Set weekly goal</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Study vs Break Time */}
        <div className="rounded-2xl bg-[#242D36] border border-[#343F49] shadow-sm shadow-black/20 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#F1F5F4]">Study vs Break Time</h2>
              <Coffee className="w-4 h-4 text-[#B9A5F5]" />
            </div>

            <div className="mt-4 space-y-2 text-xs tabular-nums">
              <div className="flex items-center justify-between">
                <span className="text-[#A0ADA9]">Today Study / Break</span>
                <span className="text-[#F1F5F4] font-semibold font-mono-tabular">
                  {formatDurationHuman(s.todayFocusedSeconds)} / {formatDurationHuman(s.todayBreakSeconds)}
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-[#1A2128] overflow-hidden flex">
                {todayTotalTracked > 0 && (
                  <>
                    <div
                      className="h-full bg-[#8BE0BC]"
                      style={{ width: `${studySharePercent}%` }}
                      title={`Study: ${studySharePercent}%`}
                    />
                    <div
                      className="h-full bg-[#B9A5F5]"
                      style={{ width: `${100 - studySharePercent}%` }}
                      title={`Break: ${100 - studySharePercent}%`}
                    />
                  </>
                )}
              </div>
              <div className="flex items-center justify-between pt-1 text-[#A0ADA9]">
                <span>All-time Study: {formatDurationHuman(s.totalFocusedSeconds)}</span>
                <span>All-time Break: {formatDurationHuman(s.totalBreakSeconds)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Subject-Wise Study Time & Recent Study Sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Subject-Wise Study Time */}
        <div className="lg:col-span-6 rounded-2xl bg-[#242D36] border border-[#343F49] shadow-sm shadow-black/20 overflow-hidden">
          <div className="px-5 py-4 border-b border-[#343F49] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[#F1F5F4]">Subject-Wise Study Time</h2>
              <p className="mt-0.5 text-xs text-[#A0ADA9]">
                Total focused time per subject ({currentPeriodMeta.summaryLabel.toLowerCase()})
              </p>
            </div>
            <div
              role="group"
              aria-label="Subject breakdown period"
              className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#1A2128] border border-[#343F49]"
            >
              {PERIOD_LABELS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSubjectPeriod(tab.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    subjectPeriod === tab.id
                      ? 'bg-[#8BE0BC]/16 text-[#8BE0BC] border border-[#8BE0BC]/35'
                      : 'text-[#A0ADA9] hover:text-[#F1F5F4] border border-transparent'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-5">
            {activeSubjectsList.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm text-[#F1F5F4]">
                  No focused study recorded for {currentPeriodMeta.summaryLabel.toLowerCase()}.
                </p>
                <p className="mt-1 text-xs text-[#A0ADA9]">
                  All completed sessions for a subject—with or without study notes—count here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-3.5">
                  {activeSubjectsList.map((item) => (
                    <div key={item.subjectId} className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: item.subjectColor }}
                          />
                          <span className="font-medium text-[#F1F5F4] truncate">{item.subjectName}</span>
                          <span className="text-[#A0ADA9] tabular-nums shrink-0">
                            · {item.sessionCount} {item.sessionCount === 1 ? 'session' : 'sessions'}
                          </span>
                        </div>
                        <div className="shrink-0 font-mono-tabular text-[#F1F5F4]">
                          {formatDurationHuman(item.focusedSeconds)}{' '}
                          <span className="text-[#A0ADA9]">({item.percentage}%)</span>
                        </div>
                      </div>
                      <div className="h-2 w-full rounded-full bg-[#1A2128] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.max(4, item.percentage)}%`,
                            backgroundColor: item.subjectColor || '#8BE0BC',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-3 border-t border-[#343F49] flex items-center justify-between text-xs">
                  <span className="text-[#A0ADA9]">
                    Total Focused ({currentPeriodMeta.summaryLabel})
                  </span>
                  <span className="font-mono-tabular font-semibold text-[#8BE0BC]">
                    {formatDurationHuman(periodFocusedTotal)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Recent Study Sessions */}
        <div className="lg:col-span-6 rounded-2xl bg-[#242D36] border border-[#343F49] shadow-sm shadow-black/20 overflow-hidden">
          <div className="px-5 py-4 border-b border-[#343F49] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#F1F5F4]">Recent Study Sessions</h2>
            <button
              type="button"
              onClick={() => onNavigate('history')}
              className="text-xs font-medium text-[#8ABEFF] hover:text-[#B3D4FF]"
            >
              View all history
            </button>
          </div>

          {recentSessions.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-[#F1F5F4]">No completed study sessions recorded yet.</p>
              <p className="mt-1 text-xs text-[#A0ADA9]">
                Open the Study Timer to select or create a subject, then start your first session.
              </p>
              <div className="mt-4 flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => onNavigate('timer')}
                  className="px-4 py-2 rounded-xl bg-[#8BE0BC] hover:bg-[#7AD5AE] text-xs font-semibold text-[#11221B]"
                >
                  Start First Session
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[#343F49]">
              {recentSessions.slice(0, 6).map((item) => {
                const dt = new Date(item.started_at);
                return (
                  <div
                    key={item.id}
                    className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-sm hover:bg-[#2A343E] transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-[#F1F5F4] truncate">
                        {item.subject_name}
                        {item.study_note ? ` · ${item.study_note}` : ''}
                      </div>
                      <div className="mt-0.5 text-xs text-[#A0ADA9] tabular-nums">
                        {dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {' · '}
                        {dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        {' · '}
                        <span className="capitalize">{item.timer_mode}</span>
                      </div>
                    </div>
                    <div className="text-right tabular-nums">
                      <div className="font-mono-tabular font-semibold text-[#8BE0BC]">
                        {formatDurationHuman(item.focused_seconds)}
                      </div>
                      <div className="text-xs text-[#A0ADA9]">
                        {(item.break_count ?? 0) > 0
                          ? `${item.break_count} break (${formatDurationHuman(item.break_seconds ?? 0)})`
                          : 'No breaks'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
