import { useEffect, useState } from 'react';
import { CheckCircle2, Target, Trash2 } from 'lucide-react';
import { formatDurationHuman } from '../../shared/timerMath';
import type { DashboardStats, Goal, GoalType } from '../../shared/types';

interface GoalsViewProps {
  goals: Goal[];
  dashboard: DashboardStats | null;
  onUpsertGoal: (type: GoalType, targetSeconds: number) => Promise<void>;
  onDeleteGoal: (type: GoalType) => Promise<void>;
}

export function GoalsView({ goals, dashboard, onUpsertGoal, onDeleteGoal }: GoalsViewProps) {
  const dailyGoal = goals.find((g) => g.goal_type === 'daily') ?? null;
  const weeklyGoal = goals.find((g) => g.goal_type === 'weekly') ?? null;

  const [dailyHours, setDailyHours] = useState(0);
  const [dailyMinutes, setDailyMinutes] = useState(0);
  const [weeklyHours, setWeeklyHours] = useState(0);
  const [weeklyMinutes, setWeeklyMinutes] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (dailyGoal) {
      setDailyHours(Math.floor(dailyGoal.target_seconds / 3600));
      setDailyMinutes(Math.floor((dailyGoal.target_seconds % 3600) / 60));
    } else {
      setDailyHours(0);
      setDailyMinutes(0);
    }
  }, [dailyGoal?.target_seconds]);

  useEffect(() => {
    if (weeklyGoal) {
      setWeeklyHours(Math.floor(weeklyGoal.target_seconds / 3600));
      setWeeklyMinutes(Math.floor((weeklyGoal.target_seconds % 3600) / 60));
    } else {
      setWeeklyHours(0);
      setWeeklyMinutes(0);
    }
  }, [weeklyGoal?.target_seconds]);

  const handleSaveDaily = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const total = dailyHours * 3600 + dailyMinutes * 60;
    if (total <= 0) {
      setError('Daily goal target must be greater than 0 minutes.');
      return;
    }
    try {
      await onUpsertGoal('daily', total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save daily goal.');
    }
  };

  const handleSaveWeekly = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const total = weeklyHours * 3600 + weeklyMinutes * 60;
    if (total <= 0) {
      setError('Weekly goal target must be greater than 0 minutes.');
      return;
    }
    try {
      await onUpsertGoal('weekly', total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save weekly goal.');
    }
  };

  const todayFocused = dashboard?.todayFocusedSeconds ?? 0;
  const weeklyFocused = dashboard?.weeklyFocusedSeconds ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#F1F5F4]">Study Goals</h1>
        <p className="mt-1 text-sm text-[#A0ADA9]">
          Configure independent daily and weekly focused study targets. No target is assumed until you set one.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-[#F87171]/12 border border-[#F87171]/35 px-4 py-3 text-sm text-[#FCA5A5]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Goal Card */}
        <div className="rounded-2xl bg-[#242D36] border border-[#343F49] shadow-sm shadow-black/20 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-[#8ABEFF]/15 text-[#8ABEFF]">
                <Target className="w-5 h-5" />
              </span>
              <h2 className="text-base font-semibold text-[#F1F5F4]">Daily Study Goal</h2>
            </div>
            {dailyGoal && (
              <button
                type="button"
                aria-label="Clear daily goal"
                onClick={() => void onDeleteGoal('daily')}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#A0ADA9] hover:text-[#FCA5A5]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            )}
          </div>

          {dailyGoal ? (
            <div className="rounded-xl bg-[#1A2128] border border-[#343F49] p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#A0ADA9]">Today&apos;s Progress</span>
                <span className="font-mono-tabular font-semibold text-[#8ABEFF]">
                  {dashboard?.dailyGoalPercentage ?? 0}%
                </span>
              </div>
              <div className="h-3 w-full rounded-full bg-[#242D36] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#8ABEFF] transition-all duration-300"
                  style={{ width: `${dashboard?.dailyGoalPercentage ?? 0}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-[#A0ADA9] tabular-nums">
                <span>Completed: {formatDurationHuman(todayFocused)}</span>
                <span>Target: {formatDurationHuman(dailyGoal.target_seconds)}</span>
              </div>
              {(dashboard?.dailyGoalPercentage ?? 0) >= 100 && (
                <div className="pt-1 flex items-center gap-1.5 text-xs font-medium text-[#8BE0BC]">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Daily goal reached</span>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl bg-[#1A2128] border border-[#343F49] p-4 text-xs text-[#A0ADA9]">
              No daily goal configured yet. Enter your desired daily study target below.
            </div>
          )}

          <form onSubmit={(e) => void handleSaveDaily(e)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="daily-goal-hours" className="block text-xs font-medium text-[#A0ADA9] mb-1">
                  Hours
                </label>
                <input
                  id="daily-goal-hours"
                  type="number"
                  min={0}
                  max={24}
                  value={dailyHours}
                  onChange={(e) => setDailyHours(Math.max(0, Math.min(24, Number(e.target.value) || 0)))}
                  className="w-full rounded-xl bg-[#1A2128] border border-[#343F49] px-3 py-2 text-sm font-mono-tabular text-[#F1F5F4] focus:outline-none focus:ring-2 focus:ring-[#8ABEFF]/40 focus:border-[#8ABEFF]"
                />
              </div>
              <div>
                <label htmlFor="daily-goal-minutes" className="block text-xs font-medium text-[#A0ADA9] mb-1">
                  Minutes
                </label>
                <input
                  id="daily-goal-minutes"
                  type="number"
                  min={0}
                  max={59}
                  value={dailyMinutes}
                  onChange={(e) => setDailyMinutes(Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
                  className="w-full rounded-xl bg-[#1A2128] border border-[#343F49] px-3 py-2 text-sm font-mono-tabular text-[#F1F5F4] focus:outline-none focus:ring-2 focus:ring-[#8ABEFF]/40 focus:border-[#8ABEFF]"
                />
              </div>
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[#8ABEFF] hover:bg-[#74B1FE] text-xs font-semibold text-[#111E2D] transition-colors"
            >
              Save Daily Goal
            </button>
          </form>
        </div>

        {/* Weekly Goal Card */}
        <div className="rounded-2xl bg-[#242D36] border border-[#343F49] shadow-sm shadow-black/20 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-[#8BE0BC]/14 text-[#8BE0BC]">
                <Target className="w-5 h-5" />
              </span>
              <h2 className="text-base font-semibold text-[#F1F5F4]">Weekly Study Goal</h2>
            </div>
            {weeklyGoal && (
              <button
                type="button"
                aria-label="Clear weekly goal"
                onClick={() => void onDeleteGoal('weekly')}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#A0ADA9] hover:text-[#FCA5A5]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            )}
          </div>

          {weeklyGoal ? (
            <div className="rounded-xl bg-[#1A2128] border border-[#343F49] p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#A0ADA9]">This Week&apos;s Progress</span>
                <span className="font-mono-tabular font-semibold text-[#8BE0BC]">
                  {dashboard?.weeklyGoalPercentage ?? 0}%
                </span>
              </div>
              <div className="h-3 w-full rounded-full bg-[#242D36] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#8BE0BC] transition-all duration-300"
                  style={{ width: `${dashboard?.weeklyGoalPercentage ?? 0}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 text-xs text-[#A0ADA9] tabular-nums">
                <div>Target: {formatDurationHuman(weeklyGoal.target_seconds)}</div>
                <div className="text-center">Focused: {formatDurationHuman(weeklyFocused)}</div>
                <div className="text-right">
                  Remaining: {formatDurationHuman(dashboard?.weeklyRemainingSeconds ?? 0)}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-[#1A2128] border border-[#343F49] p-4 text-xs text-[#A0ADA9]">
              No weekly goal configured yet. Enter your desired weekly study target below.
            </div>
          )}

          <form onSubmit={(e) => void handleSaveWeekly(e)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="weekly-goal-hours" className="block text-xs font-medium text-[#A0ADA9] mb-1">
                  Hours
                </label>
                <input
                  id="weekly-goal-hours"
                  type="number"
                  min={0}
                  max={168}
                  value={weeklyHours}
                  onChange={(e) => setWeeklyHours(Math.max(0, Math.min(168, Number(e.target.value) || 0)))}
                  className="w-full rounded-xl bg-[#1A2128] border border-[#343F49] px-3 py-2 text-sm font-mono-tabular text-[#F1F5F4] focus:outline-none focus:ring-2 focus:ring-[#8BE0BC]/40 focus:border-[#8BE0BC]"
                />
              </div>
              <div>
                <label htmlFor="weekly-goal-minutes" className="block text-xs font-medium text-[#A0ADA9] mb-1">
                  Minutes
                </label>
                <input
                  id="weekly-goal-minutes"
                  type="number"
                  min={0}
                  max={59}
                  value={weeklyMinutes}
                  onChange={(e) => setWeeklyMinutes(Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
                  className="w-full rounded-xl bg-[#1A2128] border border-[#343F49] px-3 py-2 text-sm font-mono-tabular text-[#F1F5F4] focus:outline-none focus:ring-2 focus:ring-[#8BE0BC]/40 focus:border-[#8BE0BC]"
                />
              </div>
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[#8BE0BC] hover:bg-[#7AD5AE] text-xs font-semibold text-[#11221B] transition-colors"
            >
              Save Weekly Goal
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
