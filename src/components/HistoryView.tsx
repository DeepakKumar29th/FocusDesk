import { useMemo, useState } from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import { formatDurationHuman, getWeekStartKey, toLocalDateKey } from '../../shared/timerMath';
import type { StudySession, Subject } from '../../shared/types';
import { ConfirmDialog } from './ConfirmDialog';

interface HistoryViewProps {
  sessions: StudySession[];
  subjects: Subject[];
  onUpdateSession: (
    id: number,
    updates: {
      subjectId: number;
      studyNote?: string | null;
      startedAt: string;
      endedAt: string;
      focusedSeconds: number;
    }
  ) => Promise<void>;
  onDeleteSession: (id: number) => Promise<void>;
}

type FilterMode = 'all' | 'date' | 'week' | 'month';

function toLocalDateTimeInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function HistoryView({
  sessions,
  subjects,
  onUpdateSession,
  onDeleteSession,
}: HistoryViewProps) {
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [filterDate, setFilterDate] = useState<string>(() => toLocalDateKey(new Date()));
  const [filterWeekDate, setFilterWeekDate] = useState<string>(() => toLocalDateKey(new Date()));
  const [filterMonth, setFilterMonth] = useState<string>(() => toLocalDateKey(new Date()).slice(0, 7));

  const [editing, setEditing] = useState<{
    id: number;
    subjectId: number;
    studyNote: string;
    startedLocal: string;
    endedLocal: string;
    focusedMinutes: number;
    focusedSecondsRemainder: number;
  } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StudySession | null>(null);

  const filteredSessions = useMemo(() => {
    if (filterMode === 'all') return sessions;
    if (filterMode === 'date') {
      return sessions.filter((s) => toLocalDateKey(s.started_at) === filterDate);
    }
    if (filterMode === 'week') {
      const targetWeek = getWeekStartKey(new Date(`${filterWeekDate}T00:00:00`));
      return sessions.filter((s) => getWeekStartKey(new Date(s.started_at)) === targetWeek);
    }
    // month
    return sessions.filter((s) => toLocalDateKey(s.started_at).slice(0, 7) === filterMonth);
  }, [sessions, filterMode, filterDate, filterWeekDate, filterMonth]);

  const openEdit = (s: StudySession) => {
    setEditError(null);
    setEditing({
      id: s.id,
      subjectId: s.subject_id,
      studyNote: s.study_note ?? '',
      startedLocal: toLocalDateTimeInput(s.started_at),
      endedLocal: toLocalDateTimeInput(s.ended_at ?? s.started_at),
      focusedMinutes: Math.floor(s.focused_seconds / 60),
      focusedSecondsRemainder: s.focused_seconds % 60,
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setEditError(null);

    const startMs = Date.parse(editing.startedLocal);
    const endMs = Date.parse(editing.endedLocal);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      setEditError('Please provide valid start and end times.');
      return;
    }
    if (endMs < startMs) {
      setEditError('End time cannot be earlier than start time.');
      return;
    }
    const totalFocused = Math.max(0, editing.focusedMinutes * 60 + editing.focusedSecondsRemainder);
    try {
      await onUpdateSession(editing.id, {
        subjectId: editing.subjectId,
        studyNote: editing.studyNote.trim() || null,
        startedAt: new Date(startMs).toISOString(),
        endedAt: new Date(endMs).toISOString(),
        focusedSeconds: totalFocused,
      });
      setEditing(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Unable to update session.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#F1F5F4]">Study History</h1>
          <p className="mt-1 text-sm text-[#A0ADA9]">
            Review, filter, edit, or delete completed study sessions. Changes update all statistics automatically.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-2xl bg-[#242D36] border border-[#343F49] shadow-sm shadow-black/20 p-4 flex flex-wrap items-center justify-between gap-4">
        <div
          role="group"
          aria-label="Filter Study History"
          className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#1A2128] border border-[#343F49]"
        >
          {(['all', 'date', 'week', 'month'] as FilterMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setFilterMode(mode)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap capitalize ${
                filterMode === mode
                  ? 'bg-[#8BE0BC]/16 text-[#8BE0BC] border border-[#8BE0BC]/35'
                  : 'text-[#A0ADA9] hover:text-[#F1F5F4] border border-transparent'
              }`}
            >
              {mode === 'all' ? 'All Sessions' : `By ${mode}`}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {filterMode === 'date' && (
            <label className="flex items-center gap-2 text-xs text-[#A0ADA9]">
              <span>Date</span>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="rounded-xl bg-[#1A2128] border border-[#343F49] px-3 py-1.5 text-xs text-[#F1F5F4]"
              />
            </label>
          )}
          {filterMode === 'week' && (
            <label className="flex items-center gap-2 text-xs text-[#A0ADA9]">
              <span>Week containing</span>
              <input
                type="date"
                value={filterWeekDate}
                onChange={(e) => setFilterWeekDate(e.target.value)}
                className="rounded-xl bg-[#1A2128] border border-[#343F49] px-3 py-1.5 text-xs text-[#F1F5F4]"
              />
            </label>
          )}
          {filterMode === 'month' && (
            <label className="flex items-center gap-2 text-xs text-[#A0ADA9]">
              <span>Month</span>
              <input
                type="month"
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="rounded-xl bg-[#1A2128] border border-[#343F49] px-3 py-1.5 text-xs text-[#F1F5F4]"
              />
            </label>
          )}
          <span className="text-xs text-[#A0ADA9] tabular-nums">
            {filteredSessions.length} {filteredSessions.length === 1 ? 'record' : 'records'}
          </span>
        </div>
      </div>

      {/* History Table */}
      <div className="rounded-2xl bg-[#242D36] border border-[#343F49] shadow-sm shadow-black/20 overflow-hidden">
        {filteredSessions.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-[#F1F5F4]">No completed study sessions match this view.</p>
            <p className="mt-1 text-xs text-[#A0ADA9]">
              Complete a study session or adjust your date filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#343F49] bg-[#1A2128] text-xs font-medium text-[#A0ADA9]">
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">Start – End</th>
                  <th className="py-3.5 px-4">Subject</th>
                  <th className="py-3.5 px-4">Topic / Study Note</th>
                  <th className="py-3.5 px-4 text-right">Focused Time</th>
                  <th className="py-3.5 px-4 text-right">Breaks</th>
                  <th className="py-3.5 px-4 text-right">Break Duration</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#343F49] text-sm">
                {filteredSessions.map((s) => {
                  const start = new Date(s.started_at);
                  const end = s.ended_at ? new Date(s.ended_at) : null;
                  return (
                    <tr key={s.id} className="hover:bg-[#2A343E] transition-colors">
                      <td className="py-3.5 px-4 text-[#F1F5F4] whitespace-nowrap tabular-nums">
                        {start.toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      <td className="py-3.5 px-4 text-[#A0ADA9] whitespace-nowrap font-mono-tabular text-xs">
                        {start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        {' – '}
                        {end
                          ? end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-[#F1F5F4] font-medium">{s.subject_name}</td>
                      <td className="py-3.5 px-4 text-[#A0ADA9] max-w-xs truncate" title={s.study_note ?? ''}>
                        {s.study_note || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular font-semibold text-[#8BE0BC] whitespace-nowrap">
                        {formatDurationHuman(s.focused_seconds)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular text-[#F1F5F4]">
                        {s.break_count ?? 0}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular text-[#A0ADA9] whitespace-nowrap">
                        {formatDurationHuman(s.break_seconds ?? 0)}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            aria-label={`Edit session ${s.id}`}
                            onClick={() => openEdit(s)}
                            className="p-1.5 rounded-lg text-[#A0ADA9] hover:text-[#8BE0BC] hover:bg-[#8BE0BC]/14 transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete session ${s.id}`}
                            onClick={() => setDeleteTarget(s)}
                            className="p-1.5 rounded-lg text-[#A0ADA9] hover:text-[#FCA5A5] hover:bg-[#F87171]/15 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Session Modal */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-[2px] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-session-title"
        >
          <form
            onSubmit={(e) => void handleSaveEdit(e)}
            className="w-full max-w-md rounded-2xl bg-[#242D36] border border-[#343F49] p-6 shadow-xl shadow-black/40 space-y-4"
          >
            <h2 id="edit-session-title" className="text-lg font-semibold text-[#F1F5F4]">
              Edit Study Session
            </h2>

            {editError && (
              <div className="rounded-xl bg-[#F87171]/12 border border-[#F87171]/35 px-3 py-2 text-xs text-[#FCA5A5]">
                {editError}
              </div>
            )}

            <div>
              <label htmlFor="edit-subject" className="block text-xs font-medium text-[#A0ADA9] mb-1">
                Subject
              </label>
              <select
                id="edit-subject"
                value={editing.subjectId}
                onChange={(e) => {
                  const newSubId = Number(e.target.value);
                  setEditing({
                    ...editing,
                    subjectId: newSubId,
                  });
                }}
                className="w-full rounded-xl bg-[#1A2128] border border-[#343F49] px-3 py-2 text-sm text-[#F1F5F4] focus:outline-none focus:ring-2 focus:ring-[#8BE0BC]/40 focus:border-[#8BE0BC]"
              >
                {subjects.map((sub) => (
                  <option key={sub.id} value={sub.id} className="bg-[#242D36] text-[#F1F5F4]">
                    {sub.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="edit-study-note" className="block text-xs font-medium text-[#A0ADA9] mb-1">
                Topic / Study Note (Optional)
              </label>
              <textarea
                id="edit-study-note"
                rows={2}
                maxLength={200}
                placeholder="Optional study note (leave blank if none)"
                value={editing.studyNote}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    studyNote: e.target.value,
                  })
                }
                className="w-full rounded-xl bg-[#1A2128] border border-[#343F49] px-3 py-2 text-sm text-[#F1F5F4] placeholder:text-[#A0ADA9]/65 resize-none focus:outline-none focus:ring-2 focus:ring-[#8BE0BC]/40 focus:border-[#8BE0BC]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="edit-start" className="block text-xs font-medium text-[#A0ADA9] mb-1">
                  Start Time
                </label>
                <input
                  id="edit-start"
                  type="datetime-local"
                  value={editing.startedLocal}
                  onChange={(e) => setEditing({ ...editing, startedLocal: e.target.value })}
                  className="w-full rounded-xl bg-[#1A2128] border border-[#343F49] px-2.5 py-2 text-xs text-[#F1F5F4]"
                />
              </div>
              <div>
                <label htmlFor="edit-end" className="block text-xs font-medium text-[#A0ADA9] mb-1">
                  End Time
                </label>
                <input
                  id="edit-end"
                  type="datetime-local"
                  value={editing.endedLocal}
                  onChange={(e) => setEditing({ ...editing, endedLocal: e.target.value })}
                  className="w-full rounded-xl bg-[#1A2128] border border-[#343F49] px-2.5 py-2 text-xs text-[#F1F5F4]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="edit-minutes" className="block text-xs font-medium text-[#A0ADA9] mb-1">
                  Focused Minutes
                </label>
                <input
                  id="edit-minutes"
                  type="number"
                  min={0}
                  value={editing.focusedMinutes}
                  onChange={(e) =>
                    setEditing({ ...editing, focusedMinutes: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="w-full rounded-xl bg-[#1A2128] border border-[#343F49] px-3 py-2 text-sm font-mono-tabular text-[#F1F5F4]"
                />
              </div>
              <div>
                <label htmlFor="edit-seconds" className="block text-xs font-medium text-[#A0ADA9] mb-1">
                  Focused Seconds
                </label>
                <input
                  id="edit-seconds"
                  type="number"
                  min={0}
                  max={59}
                  value={editing.focusedSecondsRemainder}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      focusedSecondsRemainder: Math.max(0, Math.min(59, Number(e.target.value) || 0)),
                    })
                  }
                  className="w-full rounded-xl bg-[#1A2128] border border-[#343F49] px-3 py-2 text-sm font-mono-tabular text-[#F1F5F4]"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-4 py-2 rounded-xl border border-[#343F49] bg-[#1C232B] text-sm text-[#F1F5F4] hover:bg-[#2C3742]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#8BE0BC] hover:bg-[#7AD5AE] text-sm font-semibold text-[#11221B]"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Study Session?"
        message="This session will be permanently removed from Study History and all dashboard, streak, and analytics calculations will update."
        confirmLabel="Delete Session"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            void onDeleteSession(deleteTarget.id);
          }
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
