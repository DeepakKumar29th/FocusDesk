import { useMemo, useState } from 'react';
import { BookOpen, CalendarDays, ChevronLeft, ChevronRight, Clock, Target, TrendingUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatDurationHuman, toLocalDateKey } from '../../shared/timerMath';
import type { AnalyticsData } from '../../shared/types';

interface AnalyticsViewProps {
  analytics: AnalyticsData | null;
}

type GraphRange = 'daily' | 'weekly' | 'monthly';
type SubjectRange = 'today' | 'week' | 'month' | 'all';

const SUBJECT_RANGES: Array<{ id: SubjectRange; label: string }> = [
  { id: 'today', label: 'Daily' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
  { id: 'all', label: 'All Time' },
];

export function AnalyticsView({ analytics }: AnalyticsViewProps) {
  const [graphRange, setGraphRange] = useState<GraphRange>('daily');
  const [subjectRange, setSubjectRange] = useState<SubjectRange>('all');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDateKey, setSelectedDateKey] = useState<string>(() => toLocalDateKey(new Date()));

  const data = analytics;

  const chartSeries = useMemo(() => {
    if (!data) return [];
    const src =
      graphRange === 'daily'
        ? data.dailySeries
        : graphRange === 'weekly'
          ? data.weeklySeries
          : data.monthlySeries;
    return src.map((pt) => ({
      ...pt,
      minutes: Math.round((pt.focusedSeconds / 60) * 10) / 10,
    }));
  }, [data, graphRange]);

  const graphBarColor =
    graphRange === 'daily' ? '#8BE0BC' : graphRange === 'weekly' ? '#8ABEFF' : '#B9A5F5';

  const activeSubjectBreakdown = useMemo(() => {
    if (!data) return [];
    return data.subjectBreakdown[subjectRange] ?? [];
  }, [data, subjectRange]);

  const subjectPeriodTotalSeconds = useMemo(
    () => activeSubjectBreakdown.reduce((sum, item) => sum + item.focusedSeconds, 0),
    [activeSubjectBreakdown]
  );

  const subjectChartSeries = useMemo(
    () =>
      activeSubjectBreakdown.map((item) => ({
        ...item,
        minutes: Math.round((item.focusedSeconds / 60) * 10) / 10,
      })),
    [activeSubjectBreakdown]
  );

  // Calendar grid generation for current calendarMonth
  const calendarCells = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Monday-first grid: Monday=0 .. Sunday=6
    const startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const cells: Array<{ dateKey: string | null; dayNumber: number | null }> = [];

    for (let i = 0; i < startOffset; i++) {
      cells.push({ dateKey: null, dayNumber: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, month, d);
      cells.push({ dateKey: toLocalDateKey(dt), dayNumber: d });
    }
    return cells;
  }, [calendarMonth]);

  const selectedDaySummary = data?.calendarDays[selectedDateKey] ?? null;

  const getIntensityClass = (seconds: number, isSelected: boolean) => {
    const ring = isSelected ? 'ring-2 ring-[#F1F5F4] ring-offset-1 ring-offset-[#242D36]' : '';
    if (seconds <= 0) return `bg-[#1A2128] text-[#A0ADA9] border-[#343F49] hover:bg-[#2A343E] ${ring}`;
    if (seconds < 1800) return `bg-[#8BE0BC]/16 text-[#8BE0BC] border-[#8BE0BC]/35 ${ring}`;
    if (seconds < 3600) return `bg-[#8BE0BC]/32 text-[#E2FAF0] border-[#8BE0BC]/50 ${ring}`;
    if (seconds < 7200) return `bg-[#8BE0BC]/65 text-[#11221B] border-[#8BE0BC]/75 ${ring}`;
    return `bg-[#8BE0BC] text-[#11221B] border-[#B4EED5] ${ring}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#F1F5F4]">Analytics</h1>
        <p className="mt-1 text-sm text-[#A0ADA9]">
          Subject-wise study tracking and trends computed directly from your saved SQLite study sessions.
        </p>
      </div>

      {/* Summary KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <div className="rounded-2xl bg-[#242D36] border border-[#343F49] shadow-sm shadow-black/20 p-5">
          <div className="flex items-center justify-between text-xs font-medium text-[#A0ADA9]">
            <span>Most Studied Subject</span>
            <div className="w-7 h-7 rounded-lg bg-[#8BE0BC]/14 flex items-center justify-center">
              <BookOpen className="w-3.5 h-3.5 text-[#8BE0BC]" />
            </div>
          </div>
          <div className="mt-2.5 flex items-start gap-2 min-w-0">
            {data?.mostStudiedSubject ? (
              <>
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5"
                  style={{ backgroundColor: data.mostStudiedSubject.subjectColor }}
                />
                <span
                  className="text-lg font-semibold leading-snug text-[#F1F5F4] line-clamp-2"
                  title={data.mostStudiedSubject.subjectName}
                >
                  {data.mostStudiedSubject.subjectName}
                </span>
              </>
            ) : (
              <span className="text-lg font-semibold leading-snug text-[#A0ADA9]">No data yet</span>
            )}
          </div>
          <div className="mt-1.5 text-xs text-[#A0ADA9] tabular-nums">
            {data?.mostStudiedSubject
              ? `${formatDurationHuman(data.mostStudiedSubject.focusedSeconds)} (${data.mostStudiedSubject.percentage}% share)`
              : 'Complete a session to calculate'}
          </div>
        </div>

        <div className="rounded-2xl bg-[#242D36] border border-[#343F49] shadow-sm shadow-black/20 p-5">
          <div className="flex items-center justify-between text-xs font-medium text-[#A0ADA9]">
            <span>Average Daily Study Time</span>
            <div className="w-7 h-7 rounded-lg bg-[#8ABEFF]/14 flex items-center justify-center">
              <Clock className="w-3.5 h-3.5 text-[#8ABEFF]" />
            </div>
          </div>
          <div className="mt-2.5 text-2xl font-semibold font-mono-tabular text-[#F1F5F4]">
            {formatDurationHuman(data?.averageDailyFocusedSeconds ?? 0)}
          </div>
          <div className="mt-1.5 text-xs text-[#A0ADA9] tabular-nums">
            Across {data?.activeStudyDaysCount ?? 0} active study{' '}
            {(data?.activeStudyDaysCount ?? 0) === 1 ? 'day' : 'days'}
          </div>
        </div>

        <div className="rounded-2xl bg-[#242D36] border border-[#343F49] shadow-sm shadow-black/20 p-5">
          <div className="flex items-center justify-between text-xs font-medium text-[#A0ADA9]">
            <span>Daily Study Progress</span>
            <div className="w-7 h-7 rounded-lg bg-[#8ABEFF]/14 flex items-center justify-center">
              <Target className="w-3.5 h-3.5 text-[#8ABEFF]" />
            </div>
          </div>
          <div className="mt-2.5 text-2xl font-semibold font-mono-tabular text-[#8ABEFF]">
            {data?.dailyGoalPercentage !== null && data?.dailyGoalPercentage !== undefined
              ? `${data.dailyGoalPercentage}%`
              : formatDurationHuman(data?.todayFocusedSeconds ?? 0)}
          </div>
          <div className="mt-1.5 text-xs text-[#A0ADA9] tabular-nums">
            {data?.dailyGoalTargetSeconds
              ? `${formatDurationHuman(data.todayFocusedSeconds)} / ${formatDurationHuman(data.dailyGoalTargetSeconds)} today`
              : 'Today (no daily goal set)'}
          </div>
        </div>

        <div className="rounded-2xl bg-[#242D36] border border-[#343F49] shadow-sm shadow-black/20 p-5">
          <div className="flex items-center justify-between text-xs font-medium text-[#A0ADA9]">
            <span>Weekly Study Progress</span>
            <div className="w-7 h-7 rounded-lg bg-[#8BE0BC]/14 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5 text-[#8BE0BC]" />
            </div>
          </div>
          <div className="mt-2.5 text-2xl font-semibold font-mono-tabular text-[#8BE0BC]">
            {data?.weeklyGoalPercentage !== null && data?.weeklyGoalPercentage !== undefined
              ? `${data.weeklyGoalPercentage}%`
              : formatDurationHuman(data?.weeklyFocusedSeconds ?? 0)}
          </div>
          <div className="mt-1.5 text-xs text-[#A0ADA9] tabular-nums">
            {data?.weeklyGoalTargetSeconds
              ? `${formatDurationHuman(data.weeklyFocusedSeconds)} / ${formatDurationHuman(data.weeklyGoalTargetSeconds)} this week`
              : 'This week (no weekly goal set)'}
          </div>
        </div>

        <div className="rounded-2xl bg-[#242D36] border border-[#343F49] shadow-sm shadow-black/20 p-5">
          <div className="flex items-center justify-between text-xs font-medium text-[#A0ADA9]">
            <span>Most Productive Day</span>
            <div className="w-7 h-7 rounded-lg bg-[#B9A5F5]/14 flex items-center justify-center">
              <CalendarDays className="w-3.5 h-3.5 text-[#B9A5F5]" />
            </div>
          </div>
          <div className="mt-2.5 text-2xl font-semibold text-[#F1F5F4]">
            {data?.mostProductiveDay ? data.mostProductiveDay.weekdayName : 'No data yet'}
          </div>
          <div className="mt-1.5 text-xs text-[#A0ADA9] tabular-nums">
            {data?.mostProductiveDay
              ? `${formatDurationHuman(data.mostProductiveDay.focusedSeconds)} total focused`
              : 'Complete a session to calculate'}
          </div>
        </div>
      </div>

      {/* Subject-Wise Study Time Breakdown + Chart */}
      <div className="rounded-2xl bg-[#242D36] border border-[#343F49] shadow-sm shadow-black/20 p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-[#F1F5F4]">Subject-Wise Study Time</h2>
            <p className="text-xs text-[#A0ADA9]">
              Focused study totals per subject across all sessions, with or without study notes.
            </p>
          </div>

          <div
            role="group"
            aria-label="Analytics Subject Timeframe"
            className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#1A2128] border border-[#343F49]"
          >
            {SUBJECT_RANGES.map((range) => (
              <button
                key={range.id}
                type="button"
                onClick={() => setSubjectRange(range.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  subjectRange === range.id
                    ? 'bg-[#8BE0BC]/16 text-[#8BE0BC] border border-[#8BE0BC]/35'
                    : 'text-[#A0ADA9] hover:text-[#F1F5F4] border border-transparent'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        {activeSubjectBreakdown.length === 0 ? (
          <div className="rounded-xl bg-[#1A2128] border border-[#343F49] p-6 text-center text-xs text-[#A0ADA9]">
            No subject study data recorded for this period yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-6 space-y-3.5">
              {activeSubjectBreakdown.map((item) => (
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
                  <div className="h-2.5 w-full rounded-full bg-[#1A2128] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(4, item.percentage)}%`,
                        backgroundColor: item.subjectColor || '#8BE0BC',
                      }}
                    />
                  </div>
                </div>
              ))}

              <div className="pt-3 border-t border-[#343F49] flex items-center justify-between text-xs">
                <span className="text-[#A0ADA9]">Sum of Subject Study Time</span>
                <span className="font-mono-tabular font-semibold text-[#8BE0BC]">
                  {formatDurationHuman(subjectPeriodTotalSeconds)}
                </span>
              </div>
            </div>

            <div className="lg:col-span-6 h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subjectChartSeries} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(241,245,244,0.08)" vertical={false} />
                  <XAxis
                    dataKey="subjectName"
                    tick={{ fill: '#A0ADA9', fontSize: 11 }}
                    axisLine={{ stroke: '#343F49' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#A0ADA9', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    unit="m"
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(139,224,188,0.08)' }}
                    contentStyle={{
                      backgroundColor: '#1C232B',
                      border: '1px solid #343F49',
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: '#F1F5F4',
                    }}
                    formatter={(_value, _name, item) => [
                      formatDurationHuman(item?.payload?.focusedSeconds ?? 0),
                      'Focused Time',
                    ]}
                  />
                  <Bar dataKey="minutes" radius={[6, 6, 0, 0]} maxBarSize={44}>
                    {subjectChartSeries.map((entry) => (
                      <Cell key={entry.subjectId} fill={entry.subjectColor || '#8BE0BC'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Study-Time Graphs */}
      <div className="rounded-2xl bg-[#242D36] border border-[#343F49] shadow-sm shadow-black/20 p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-[#F1F5F4]">Focused Study Time</h2>
            <p className="text-xs text-[#A0ADA9]">Minutes of focused study per interval</p>
          </div>

          <div
            role="group"
            aria-label="Study-Time Graph Granularity"
            className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#1A2128] border border-[#343F49]"
          >
            {(['daily', 'weekly', 'monthly'] as GraphRange[]).map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setGraphRange(range)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize whitespace-nowrap ${
                  graphRange === range
                    ? range === 'daily'
                      ? 'bg-[#8BE0BC]/16 text-[#8BE0BC] border border-[#8BE0BC]/35'
                      : range === 'weekly'
                        ? 'bg-[#8ABEFF]/16 text-[#8ABEFF] border border-[#8ABEFF]/35'
                        : 'bg-[#B9A5F5]/16 text-[#B9A5F5] border border-[#B9A5F5]/35'
                    : 'text-[#A0ADA9] hover:text-[#F1F5F4] border border-transparent'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartSeries} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(241,245,244,0.08)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#A0ADA9', fontSize: 11 }}
                axisLine={{ stroke: '#343F49' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#A0ADA9', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                unit="m"
              />
              <Tooltip
                cursor={{ fill: 'rgba(138,190,255,0.08)' }}
                contentStyle={{
                  backgroundColor: '#1C232B',
                  border: '1px solid #343F49',
                  borderRadius: '12px',
                  fontSize: '12px',
                  color: '#F1F5F4',
                }}
                formatter={(_value, _name, item) => [
                  formatDurationHuman(item?.payload?.focusedSeconds ?? 0),
                  'Focused Time',
                ]}
              />
              <Bar dataKey="minutes" fill={graphBarColor} radius={[6, 6, 0, 0]} maxBarSize={42} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Interactive Study Calendar */}
      <div className="rounded-2xl bg-[#242D36] border border-[#343F49] shadow-sm shadow-black/20 p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#F1F5F4]">Study Calendar</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() =>
                setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
              }
              className="p-1.5 rounded-lg border border-[#343F49] bg-[#1A2128] text-[#A0ADA9] hover:text-[#F1F5F4] hover:bg-[#2C3742] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-semibold text-[#F1F5F4] min-w-[120px] text-center">
              {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() =>
                setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
              }
              className="p-1.5 rounded-lg border border-[#343F49] bg-[#1A2128] text-[#A0ADA9] hover:text-[#F1F5F4] hover:bg-[#2C3742] transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-medium text-[#A0ADA9]">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {calendarCells.map((cell, idx) => {
            if (!cell.dateKey || !cell.dayNumber) {
              return <div key={`empty-${idx}`} className="h-12 rounded-xl" />;
            }
            const summary = data?.calendarDays[cell.dateKey];
            const focused = summary?.focusedSeconds ?? 0;
            const isSelected = cell.dateKey === selectedDateKey;
            return (
              <button
                key={cell.dateKey}
                type="button"
                onClick={() => setSelectedDateKey(cell.dateKey!)}
                aria-label={`${cell.dateKey}: ${formatDurationHuman(focused)} studied`}
                className={`h-12 rounded-xl border flex flex-col items-center justify-center transition-colors ${getIntensityClass(
                  focused,
                  isSelected
                )}`}
              >
                <span className="text-xs font-medium tabular-nums">{cell.dayNumber}</span>
                {focused > 0 && (
                  <span className="text-[10px] font-mono-tabular opacity-90">
                    {formatDurationHuman(focused)}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2 text-[11px] text-[#A0ADA9]">
          <span>Less</span>
          <span className="w-3.5 h-3.5 rounded bg-[#1A2128] border border-[#343F49]" title="0m" />
          <span className="w-3.5 h-3.5 rounded bg-[#8BE0BC]/16 border border-[#8BE0BC]/35" title="<30m" />
          <span className="w-3.5 h-3.5 rounded bg-[#8BE0BC]/32 border border-[#8BE0BC]/50" title="30m–1h" />
          <span className="w-3.5 h-3.5 rounded bg-[#8BE0BC]/65 border border-[#8BE0BC]/75" title="1h–2h" />
          <span className="w-3.5 h-3.5 rounded bg-[#8BE0BC] border border-[#B4EED5]" title="2h+" />
          <span>More</span>
        </div>

        {/* Selected Date Inspection */}
        <div className="rounded-xl bg-[#1A2128] border border-[#343F49] p-4 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-semibold text-[#F1F5F4]">
                Selected Date: <span className="font-mono-tabular">{selectedDateKey}</span>
              </div>
              <div className="mt-0.5 text-[#A0ADA9]">
                {selectedDaySummary
                  ? `${selectedDaySummary.sessionCount} ${
                      selectedDaySummary.sessionCount === 1 ? 'session' : 'sessions'
                    } recorded`
                  : 'No study activity recorded on this date'}
              </div>
            </div>
            <div className="text-base font-semibold font-mono-tabular text-[#8BE0BC]">
              {formatDurationHuman(selectedDaySummary?.focusedSeconds ?? 0)}
            </div>
          </div>
          {selectedDaySummary && selectedDaySummary.sessions.length > 0 && (
            <div className="pt-2 border-t border-[#343F49] space-y-1.5">
              {selectedDaySummary.sessions.map((sess) => (
                <div key={sess.id} className="flex items-center justify-between text-[#F1F5F4]">
                  <span className="truncate">
                    {sess.subject_name}
                    {sess.study_note ? ` · ${sess.study_note}` : ''}
                  </span>
                  <span className="font-mono-tabular text-[#A0ADA9] shrink-0 ml-2">
                    {formatDurationHuman(sess.focused_seconds)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
