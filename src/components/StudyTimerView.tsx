import { useEffect, useMemo, useState } from 'react';
import {
  ArchiveRestore,
  CheckCircle2,
  Coffee,
  Edit2,
  FolderPlus,
  Maximize2,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  SkipForward,
  Square,
  Trash2,
} from 'lucide-react';
import { formatClock, formatDurationHuman } from '../../shared/timerMath';
import type {
  AppSettings,
  BreakRecord,
  BreakType,
  StudySession,
  Subject,
  TimerMode,
} from '../../shared/types';
import { ConfirmDialog } from './ConfirmDialog';

interface StudyTimerViewProps {
  activeSession: StudySession | null;
  activeBreak: BreakRecord | null;
  sessionElapsedSeconds: number;
  sessionRemainingSeconds: number | null;
  breakTiming: { elapsedSeconds: number; remainingSeconds: number; isOvertime: boolean } | null;
  lastCompletedBanner: StudySession | null;
  onClearCompletedBanner: () => void;
  subjects: Subject[];
  settings: AppSettings | null;
  showSeconds?: boolean;
  onStartSession: (payload: {
    subjectId: number;
    studyNote?: string | null;
    timerMode: TimerMode;
    targetSeconds?: number;
  }) => Promise<void>;
  onPauseSession: (id: number) => Promise<void>;
  onResumeSession: (id: number) => Promise<void>;
  onFinishSession: (id: number) => Promise<void>;
  onDiscardSession: (id: number) => Promise<void>;
  onStartBreak: (type: BreakType) => Promise<void>;
  onEndBreak: (id: number, action: 'complete' | 'skip') => Promise<void>;
  onEnterFullscreen: () => Promise<void>;
  onOpenFloating: () => Promise<void>;
  onCreateSubject: (name: string, color?: string) => Promise<Subject>;
  onUpdateSubject: (id: number, name: string, color?: string) => Promise<void>;
  onDeleteSubject: (id: number) => Promise<{ action: 'deleted' | 'archived' }>;
  onRestoreSubject: (id: number) => Promise<void>;
}

const SUBJECT_COLORS = ['#8BE0BC', '#8ABEFF', '#B9A5F5', '#F5C563', '#5EEAD4', '#A5B4FC'];

function formatTimerClock(totalSeconds: number, showSeconds: boolean): string {
  const full = formatClock(totalSeconds, true);
  return showSeconds ? full : full.slice(0, 5);
}

export function StudyTimerView({
  activeSession,
  activeBreak,
  sessionElapsedSeconds,
  sessionRemainingSeconds,
  breakTiming,
  lastCompletedBanner,
  onClearCompletedBanner,
  subjects,
  settings,
  showSeconds = true,
  onStartSession,
  onPauseSession,
  onResumeSession,
  onFinishSession,
  onDiscardSession,
  onStartBreak,
  onEndBreak,
  onEnterFullscreen,
  onOpenFloating,
  onCreateSubject,
  onUpdateSubject,
  onDeleteSubject,
  onRestoreSubject,
}: StudyTimerViewProps) {
  const activeSubjects = useMemo(() => subjects.filter((s) => !s.archived_at), [subjects]);
  const archivedSubjects = useMemo(() => subjects.filter((s) => Boolean(s.archived_at)), [subjects]);

  const [selectedSubjectId, setSelectedSubjectId] = useState<number>(0);
  const [studyNoteInput, setStudyNoteInput] = useState('');
  const [timerMode, setTimerMode] = useState<TimerMode>('stopwatch');

  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(25);
  const [seconds, setSeconds] = useState(0);

  // Inline Subject CRUD state
  const [subjectFormMode, setSubjectFormMode] = useState<'closed' | 'add' | 'edit'>('closed');
  const [subjectNameInput, setSubjectNameInput] = useState('');
  const [subjectColorInput, setSubjectColorInput] = useState(SUBJECT_COLORS[0]);

  const [showArchived, setShowArchived] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [confirmDeleteSubject, setConfirmDeleteSubject] = useState<Subject | null>(null);

  // Initialize timer defaults from settings once loaded
  useEffect(() => {
    if (!settings) return;
    setTimerMode(settings.default_timer_mode);
    const total = settings.preferred_countdown_seconds;
    setHours(Math.floor(total / 3600));
    setMinutes(Math.floor((total % 3600) / 60));
    setSeconds(total % 60);
  }, [settings?.default_timer_mode, settings?.preferred_countdown_seconds]);

  // Keep selected subject valid
  useEffect(() => {
    if (activeSubjects.length === 0) {
      setSelectedSubjectId(0);
      return;
    }
    if (!activeSubjects.some((s) => s.id === selectedSubjectId)) {
      setSelectedSubjectId(activeSubjects[0].id);
    }
  }, [activeSubjects, selectedSubjectId]);

  const selectedSubject = activeSubjects.find((s) => s.id === selectedSubjectId) ?? null;

  const countdownTotalSeconds = hours * 3600 + minutes * 60 + seconds;

  const sessionStateLabel = activeSession
    ? activeSession.status === 'running'
      ? 'Running'
      : 'Paused'
    : lastCompletedBanner
      ? 'Completed'
      : 'Ready';

  // Subject CRUD handlers
  const openAddSubject = () => {
    setFormError(null);
    setSubjectNameInput('');
    setSubjectColorInput(SUBJECT_COLORS[activeSubjects.length % SUBJECT_COLORS.length]);
    setSubjectFormMode('add');
  };

  const openEditSubject = () => {
    if (!selectedSubject) return;
    setFormError(null);
    setSubjectNameInput(selectedSubject.name);
    setSubjectColorInput(selectedSubject.color);
    setSubjectFormMode('edit');
  };

  const handleSaveSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const trimmed = subjectNameInput.trim();
    if (!trimmed) {
      setFormError('Subject name cannot be empty.');
      return;
    }
    try {
      if (subjectFormMode === 'add') {
        const created = await onCreateSubject(trimmed, subjectColorInput);
        setSelectedSubjectId(created.id);
      } else if (subjectFormMode === 'edit' && selectedSubject) {
        await onUpdateSubject(selectedSubject.id, trimmed, subjectColorInput);
      }
      setSubjectFormMode('closed');
      setSubjectNameInput('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save subject.');
    }
  };

  const handleStart = async () => {
    setFormError(null);
    if (!selectedSubjectId) {
      setFormError('Please select or create a subject before starting.');
      return;
    }
    if (timerMode === 'countdown' && countdownTotalSeconds <= 0) {
      setFormError('Countdown duration must be greater than 0 seconds.');
      return;
    }
    setBusy(true);
    try {
      const trimmedNote = studyNoteInput.trim();
      await onStartSession({
        subjectId: selectedSubjectId,
        studyNote: trimmedNote || null,
        timerMode,
        targetSeconds: timerMode === 'countdown' ? countdownTotalSeconds : undefined,
      });
      setStudyNoteInput('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to start session.');
    } finally {
      setBusy(false);
    }
  };

  const handleResetSetup = () => {
    onClearCompletedBanner();
    setFormError(null);
    setStudyNoteInput('');
    if (settings) {
      const total = settings.preferred_countdown_seconds;
      setHours(Math.floor(total / 3600));
      setMinutes(Math.floor((total % 3600) / 60));
      setSeconds(total % 60);
    } else {
      setHours(0);
      setMinutes(25);
      setSeconds(0);
    }
  };

  const primaryClockDisplay = activeSession
    ? activeSession.timer_mode === 'countdown'
      ? formatTimerClock(sessionRemainingSeconds ?? 0, showSeconds)
      : formatTimerClock(sessionElapsedSeconds, showSeconds)
    : timerMode === 'countdown'
      ? formatTimerClock(countdownTotalSeconds, showSeconds)
      : formatTimerClock(0, showSeconds);

  const shortBreakMin = Math.round((settings?.short_break_seconds ?? 300) / 60);
  const longBreakMin = Math.round((settings?.long_break_seconds ?? 900) / 60);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#F1F5F4]">Study Timer</h1>
          <p className="mt-1 text-sm text-[#A0ADA9]">
            Select a subject, optionally add a study note, and track your focused session.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void onOpenFloating()}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[#343F49] bg-[#242D36] hover:bg-[#2C3742] text-xs font-medium text-[#F1F5F4] transition-colors whitespace-nowrap shrink-0"
          >
            <PictureInPicture2 className="w-4 h-4 text-[#8ABEFF]" />
            <span>Floating Timer</span>
          </button>
          <button
            type="button"
            onClick={() => void onEnterFullscreen()}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[#343F49] bg-[#242D36] hover:bg-[#2C3742] text-xs font-medium text-[#F1F5F4] transition-colors whitespace-nowrap shrink-0"
          >
            <Maximize2 className="w-4 h-4 text-[#8BE0BC]" />
            <span>Fullscreen Mode</span>
          </button>
        </div>
      </div>

      {lastCompletedBanner && !activeSession && (
        <div className="rounded-2xl bg-[#8BE0BC]/12 border border-[#8BE0BC]/35 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-[#8BE0BC] shrink-0" />
            <div className="text-sm text-[#F1F5F4]">
              <span className="font-semibold text-[#8BE0BC]">Session Completed: </span>
              <span>
                {lastCompletedBanner.subject_name}
                {lastCompletedBanner.study_note ? ` · ${lastCompletedBanner.study_note}` : ''} —{' '}
                <strong className="font-mono-tabular">
                  {formatDurationHuman(lastCompletedBanner.focused_seconds)}
                </strong>{' '}
                focused
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClearCompletedBanner}
            className="text-xs font-medium text-[#8BE0BC] hover:text-[#F1F5F4]"
          >
            Dismiss
          </button>
        </div>
      )}

      {formError && (
        <div className="rounded-xl bg-[#F87171]/12 border border-[#F87171]/35 px-4 py-3 text-sm text-[#FCA5A5]">
          {formError}
        </div>
      )}

      {/* Integrated Subject Selector & Optional Multiline Study Note */}
      <div className="rounded-2xl bg-[#242D36] border border-[#343F49] shadow-sm shadow-black/20 p-5 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
          {/* Subject Control Group */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 min-h-[28px]">
              <label htmlFor="timer-subject-select" className="text-xs font-semibold text-[#F1F5F4]">
                Subject
              </label>
              <button
                type="button"
                onClick={openAddSubject}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#8BE0BC]/14 hover:bg-[#8BE0BC]/22 border border-[#8BE0BC]/35 text-xs font-medium text-[#8BE0BC] transition-colors whitespace-nowrap"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>Add Subject</span>
              </button>
            </div>

            {activeSubjects.length === 0 ? (
              <div className="rounded-xl bg-[#1A2128] border border-[#343F49] px-3.5 py-2.5 text-xs text-[#A0ADA9]">
                No subjects yet. Click &ldquo;Add Subject&rdquo; above to create one.
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <select
                  id="timer-subject-select"
                  disabled={Boolean(activeSession)}
                  value={selectedSubjectId}
                  onChange={(e) => {
                    setSelectedSubjectId(Number(e.target.value));
                    setSubjectFormMode('closed');
                  }}
                  className="flex-1 min-w-0 rounded-xl bg-[#1A2128] border border-[#343F49] px-3.5 py-2.5 text-sm text-[#F1F5F4] focus:outline-none focus:ring-2 focus:ring-[#8BE0BC]/40 focus:border-[#8BE0BC] disabled:opacity-60"
                >
                  {activeSubjects.map((sub) => (
                    <option key={sub.id} value={sub.id} className="bg-[#242D36] text-[#F1F5F4]">
                      {sub.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={!selectedSubject}
                  aria-label="Edit selected subject"
                  title="Edit selected subject"
                  onClick={openEditSubject}
                  className="p-2.5 rounded-xl border border-[#343F49] bg-[#1A2128] text-[#A0ADA9] hover:text-[#F1F5F4] hover:bg-[#2C3742] disabled:opacity-40 shrink-0 transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={
                    !selectedSubject ||
                    Boolean(activeSession && activeSession.subject_id === selectedSubject?.id)
                  }
                  aria-label="Delete selected subject"
                  title="Delete or archive selected subject"
                  onClick={() => selectedSubject && setConfirmDeleteSubject(selectedSubject)}
                  className="p-2.5 rounded-xl border border-[#343F49] bg-[#1A2128] text-[#A0ADA9] hover:text-[#FCA5A5] hover:border-[#F87171]/45 hover:bg-[#F87171]/12 disabled:opacity-40 shrink-0 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Inline Add / Edit Subject Form */}
            {subjectFormMode !== 'closed' && (
              <form
                onSubmit={(e) => void handleSaveSubject(e)}
                className="rounded-xl bg-[#1A2128] border border-[#8BE0BC]/40 p-3.5 space-y-2.5"
              >
                <div className="text-xs font-semibold text-[#F1F5F4]">
                  {subjectFormMode === 'add' ? 'New Subject' : `Rename "${selectedSubject?.name}"`}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    autoFocus
                    aria-label="Subject name"
                    placeholder="Subject name (e.g., Mathematics)"
                    value={subjectNameInput}
                    onChange={(e) => setSubjectNameInput(e.target.value)}
                    className="flex-1 rounded-lg bg-[#242D36] border border-[#343F49] px-3 py-1.5 text-sm text-[#F1F5F4] placeholder:text-[#A0ADA9]/60 focus:outline-none focus:ring-2 focus:ring-[#8BE0BC]/40 focus:border-[#8BE0BC]"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 rounded-lg bg-[#8BE0BC] hover:bg-[#7AD5AE] text-xs font-semibold text-[#11221B] whitespace-nowrap transition-colors"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubjectFormMode('closed')}
                    className="px-3 py-1.5 rounded-lg border border-[#343F49] bg-[#242D36] text-xs text-[#A0ADA9] hover:text-[#F1F5F4] hover:bg-[#2C3742] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#A0ADA9]">Color:</span>
                  {SUBJECT_COLORS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      aria-label={`Select subject color ${hex}`}
                      onClick={() => setSubjectColorInput(hex)}
                      className={`w-4 h-4 rounded-full transition-transform ${
                        subjectColorInput === hex
                          ? 'ring-2 ring-[#F1F5F4] ring-offset-2 ring-offset-[#1A2128] scale-110'
                          : ''
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </form>
            )}
          </div>

          {/* Topic / Study Note Control Group (Optional Multiline Field) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 min-h-[28px]">
              <label htmlFor="timer-study-note" className="text-xs font-semibold text-[#F1F5F4]">
                Topic to Study
              </label>
              <span className="text-[11px] text-[#A0ADA9]">Optional note saved with session</span>
            </div>
            <textarea
              id="timer-study-note"
              rows={2}
              maxLength={200}
              disabled={Boolean(activeSession)}
              value={activeSession ? (activeSession.study_note ?? '') : studyNoteInput}
              onChange={(e) => setStudyNoteInput(e.target.value)}
              placeholder="e.g., Introduction to Python, Chapter 2, Bar Charts, SQL Joins"
              className="w-full resize-none rounded-xl bg-[#1A2128] border border-[#343F49] px-3.5 py-2 text-sm text-[#F1F5F4] placeholder:text-[#A0ADA9]/60 focus:outline-none focus:ring-2 focus:ring-[#8BE0BC]/40 focus:border-[#8BE0BC] disabled:opacity-60"
            />
          </div>
        </div>

        {/* Archived Subjects Restore Bar */}
        {archivedSubjects.length > 0 && (
          <div className="pt-3 border-t border-[#343F49]">
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="text-xs font-medium text-[#A0ADA9] hover:text-[#F1F5F4]"
            >
              {showArchived
                ? 'Hide archived subjects'
                : `View archived subjects (${archivedSubjects.length})`}
            </button>
            {showArchived && (
              <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {archivedSubjects.map((sub) => (
                  <div
                    key={`arch-sub-${sub.id}`}
                    className="flex items-center justify-between rounded-xl bg-[#1A2128] border border-[#343F49] px-3.5 py-2"
                  >
                    <span className="text-[#F1F5F4] truncate">Subject: {sub.name}</span>
                    <button
                      type="button"
                      onClick={() => void onRestoreSubject(sub.id)}
                      className="inline-flex items-center gap-1 text-[#8BE0BC] hover:text-[#A9ECD0] font-medium shrink-0"
                    >
                      <ArchiveRestore className="w-3.5 h-3.5" />
                      <span>Restore</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Timer Centerpiece + Break Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 rounded-2xl bg-[#242D36] border border-[#8BE0BC]/30 shadow-sm shadow-black/20 p-6 sm:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div
              role="group"
              aria-label="Timer Mode"
              className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#1A2128] border border-[#343F49]"
            >
              <button
                type="button"
                disabled={Boolean(activeSession)}
                onClick={() => {
                  onClearCompletedBanner();
                  setTimerMode('stopwatch');
                }}
                className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  (activeSession ? activeSession.timer_mode : timerMode) === 'stopwatch'
                    ? 'bg-[#8BE0BC]/16 text-[#8BE0BC] border border-[#8BE0BC]/35'
                    : 'text-[#A0ADA9] hover:text-[#F1F5F4] border border-transparent disabled:opacity-50'
                }`}
              >
                Stopwatch
              </button>
              <button
                type="button"
                disabled={Boolean(activeSession)}
                onClick={() => {
                  onClearCompletedBanner();
                  setTimerMode('countdown');
                }}
                className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  (activeSession ? activeSession.timer_mode : timerMode) === 'countdown'
                    ? 'bg-[#8ABEFF]/16 text-[#8ABEFF] border border-[#8ABEFF]/35'
                    : 'text-[#A0ADA9] hover:text-[#F1F5F4] border border-transparent disabled:opacity-50'
                }`}
              >
                Countdown
              </button>
            </div>

            <div className="text-xs font-medium text-[#A0ADA9]">
              Status:{' '}
              <span
                className={
                  sessionStateLabel === 'Running'
                    ? 'text-[#8BE0BC] font-semibold'
                    : sessionStateLabel === 'Paused'
                      ? 'text-[#F6D07A] font-semibold'
                      : sessionStateLabel === 'Completed'
                        ? 'text-[#8ABEFF] font-semibold'
                        : 'text-[#F1F5F4] font-semibold'
                }
              >
                {sessionStateLabel}
              </span>
            </div>
          </div>

          {/* Calm Dark Focus Stage */}
          <div className="rounded-2xl bg-[#1A2128] border border-[#343F49] py-10 px-6 text-center">
            {activeSession ? (
              <div className="mb-3 flex items-center justify-center gap-2 text-sm text-[#A0ADA9]">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: activeSession.subject_color }}
                />
                <span className="font-semibold text-[#F1F5F4]">{activeSession.subject_name}</span>
                {activeSession.study_note && (
                  <>
                    <span className="text-[#A0ADA9]">·</span>
                    <span className="text-[#A0ADA9]">{activeSession.study_note}</span>
                  </>
                )}
              </div>
            ) : (
              <div className="mb-3 flex items-center justify-center gap-2 text-sm text-[#A0ADA9]">
                {selectedSubject ? (
                  <>
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: selectedSubject.color }}
                    />
                    <span className="font-semibold text-[#F1F5F4]">{selectedSubject.name}</span>
                    {studyNoteInput.trim() && (
                      <>
                        <span className="text-[#A0ADA9]">·</span>
                        <span className="text-[#A0ADA9] truncate max-w-md">
                          {studyNoteInput.trim()}
                        </span>
                      </>
                    )}
                  </>
                ) : (
                  'Select or create a subject above to begin'
                )}
              </div>
            )}

            <div
              data-testid="main-timer-clock"
              className="text-6xl sm:text-7xl font-semibold tracking-tight font-mono-tabular text-[#F1F5F4]"
            >
              {primaryClockDisplay}
            </div>

            {activeSession?.timer_mode === 'countdown' && (
              <div className="mt-3 text-xs text-[#A0ADA9] font-mono-tabular">
                Elapsed focused time: {formatTimerClock(sessionElapsedSeconds, showSeconds)}
                {activeSession.target_seconds
                  ? ` / Target: ${formatTimerClock(activeSession.target_seconds, showSeconds)}`
                  : ''}
              </div>
            )}
            {activeSession?.timer_mode === 'stopwatch' && (
              <div className="mt-3 text-xs text-[#A0ADA9]">
                Paused intervals and breaks are excluded from focused study time.
              </div>
            )}
            {!activeSession && (
              <div className="mt-3 text-xs text-[#A0ADA9]">
                {timerMode === 'countdown'
                  ? 'Set your target focus duration below before starting.'
                  : 'Stopwatch tracks open-ended focused study sessions.'}
              </div>
            )}

            {!activeSession && timerMode === 'countdown' && (
              <div className="mt-6 inline-flex items-center gap-3 rounded-xl bg-[#242D36] border border-[#343F49] px-4 py-3">
                <label className="flex flex-col items-center text-xs text-[#A0ADA9]">
                  <span>Hours</span>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={hours}
                    onChange={(e) => {
                      onClearCompletedBanner();
                      setHours(Math.max(0, Math.min(23, Number(e.target.value) || 0)));
                    }}
                    className="mt-1 w-16 rounded-lg bg-[#1A2128] border border-[#343F49] px-2 py-1.5 text-center text-sm font-mono-tabular text-[#F1F5F4] focus:outline-none focus:ring-2 focus:ring-[#8ABEFF]/40 focus:border-[#8ABEFF]"
                  />
                </label>
                <span className="text-[#A0ADA9] mt-4 font-mono-tabular">:</span>
                <label className="flex flex-col items-center text-xs text-[#A0ADA9]">
                  <span>Minutes</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={minutes}
                    onChange={(e) => {
                      onClearCompletedBanner();
                      setMinutes(Math.max(0, Math.min(59, Number(e.target.value) || 0)));
                    }}
                    className="mt-1 w-16 rounded-lg bg-[#1A2128] border border-[#343F49] px-2 py-1.5 text-center text-sm font-mono-tabular text-[#F1F5F4] focus:outline-none focus:ring-2 focus:ring-[#8ABEFF]/40 focus:border-[#8ABEFF]"
                  />
                </label>
                <span className="text-[#A0ADA9] mt-4 font-mono-tabular">:</span>
                <label className="flex flex-col items-center text-xs text-[#A0ADA9]">
                  <span>Seconds</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={seconds}
                    onChange={(e) => {
                      onClearCompletedBanner();
                      setSeconds(Math.max(0, Math.min(59, Number(e.target.value) || 0)));
                    }}
                    className="mt-1 w-16 rounded-lg bg-[#1A2128] border border-[#343F49] px-2 py-1.5 text-center text-sm font-mono-tabular text-[#F1F5F4] focus:outline-none focus:ring-2 focus:ring-[#8ABEFF]/40 focus:border-[#8ABEFF]"
                  />
                </label>
              </div>
            )}
          </div>

          {/* Primary Timer Actions */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {!activeSession ? (
              <>
                <button
                  type="button"
                  disabled={busy || Boolean(activeBreak) || !selectedSubjectId}
                  onClick={() => void handleStart()}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#8BE0BC] hover:bg-[#7AD5AE] disabled:opacity-45 text-sm font-semibold text-[#11221B] transition-colors whitespace-nowrap"
                >
                  <Play className="w-4 h-4" />
                  <span>Start Study Session</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetSetup}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#343F49] bg-[#1C232B] text-sm font-medium text-[#A0ADA9] hover:text-[#F1F5F4] hover:bg-[#2C3742] transition-colors whitespace-nowrap"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Reset</span>
                </button>
              </>
            ) : (
              <>
                {activeSession.status === 'running' ? (
                  <button
                    type="button"
                    onClick={() => void onPauseSession(activeSession.id)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#F5C563]/16 hover:bg-[#F5C563]/24 border border-[#F5C563]/40 text-sm font-medium text-[#F6D07A] transition-colors whitespace-nowrap"
                  >
                    <Pause className="w-4 h-4" />
                    <span>Pause</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={Boolean(activeBreak)}
                    onClick={() => void onResumeSession(activeSession.id)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#8BE0BC] hover:bg-[#7AD5AE] disabled:opacity-45 text-sm font-semibold text-[#11221B] transition-colors whitespace-nowrap"
                  >
                    <Play className="w-4 h-4" />
                    <span>Resume</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => void onFinishSession(activeSession.id)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#8ABEFF]/16 hover:bg-[#8ABEFF]/24 border border-[#8ABEFF]/40 text-sm font-medium text-[#8ABEFF] transition-colors whitespace-nowrap"
                >
                  <Square className="w-4 h-4" />
                  <span>Finish Session</span>
                </button>

                <button
                  type="button"
                  onClick={() => setConfirmDiscardOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#343F49] bg-[#1C232B] text-sm font-medium text-[#A0ADA9] hover:text-[#FCA5A5] hover:border-[#F87171]/45 hover:bg-[#F87171]/12 transition-colors whitespace-nowrap"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Discard</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Manual Break Management */}
        <div className="rounded-2xl bg-[#242D36] border border-[#343F49] shadow-sm shadow-black/20 p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#B9A5F5]/16 flex items-center justify-center">
                <Coffee className="w-4 h-4 text-[#B9A5F5]" />
              </div>
              <h2 className="text-sm font-semibold text-[#F1F5F4]">Break Controls</h2>
            </div>
            <span className="text-xs text-[#A0ADA9]">Manual start</span>
          </div>

          {activeBreak && breakTiming ? (
            <div className="rounded-xl bg-[#F5C563]/10 border border-[#F5C563]/35 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#F6D07A]">
                  {activeBreak.break_type === 'short' ? 'Short Break' : 'Long Break'}
                </span>
                <span className="text-[#F6D07A]/80">
                  {breakTiming.isOvertime ? 'Duration reached' : 'In progress'}
                </span>
              </div>

              <div className="text-3xl font-semibold font-mono-tabular text-[#F1F5F4]">
                {formatClock(breakTiming.remainingSeconds)}
              </div>
              <div className="text-xs text-[#A0ADA9] font-mono-tabular">
                Elapsed: {formatClock(breakTiming.elapsedSeconds)} / Planned:{' '}
                {formatClock(activeBreak.planned_seconds)}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void onEndBreak(activeBreak.id, 'complete')}
                  className="flex-1 px-3 py-2 rounded-xl bg-[#8BE0BC] hover:bg-[#7AD5AE] text-xs font-semibold text-[#11221B] whitespace-nowrap transition-colors"
                >
                  End Break
                </button>
                <button
                  type="button"
                  onClick={() => void onEndBreak(activeBreak.id, 'skip')}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[#343F49] bg-[#1C232B] text-xs font-medium text-[#A0ADA9] hover:text-[#F1F5F4] hover:bg-[#2C3742] whitespace-nowrap transition-colors"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  <span>Skip Break</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-[#A0ADA9]">
                Breaks never start automatically and never count toward focused study time.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2.5">
                <button
                  type="button"
                  onClick={() => void onStartBreak('short')}
                  className="px-3.5 py-2.5 rounded-xl border border-[#343F49] bg-[#1A2128] hover:bg-[#B9A5F5]/14 hover:border-[#B9A5F5]/40 text-xs font-medium text-[#F1F5F4] transition-colors whitespace-nowrap"
                >
                  Start Short Break ({shortBreakMin}m)
                </button>
                <button
                  type="button"
                  onClick={() => void onStartBreak('long')}
                  className="px-3.5 py-2.5 rounded-xl border border-[#343F49] bg-[#1A2128] hover:bg-[#8ABEFF]/14 hover:border-[#8ABEFF]/40 text-xs font-medium text-[#F1F5F4] transition-colors whitespace-nowrap"
                >
                  Start Long Break ({longBreakMin}m)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDiscardOpen}
        title="Discard Active Study Session?"
        message="This active session will be discarded and will not be saved to your Study History or statistics."
        confirmLabel="Discard Session"
        onCancel={() => setConfirmDiscardOpen(false)}
        onConfirm={() => {
          if (activeSession) {
            void onDiscardSession(activeSession.id);
          }
          setConfirmDiscardOpen(false);
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmDeleteSubject)}
        title={confirmDeleteSubject ? `Delete or Archive '${confirmDeleteSubject.name}'?` : ''}
        message="If this subject is referenced by existing study records, FocusDesk will archive it safely so historical records remain intact. Otherwise it will be permanently deleted."
        confirmLabel="Continue"
        onCancel={() => setConfirmDeleteSubject(null)}
        onConfirm={() => {
          if (confirmDeleteSubject) {
            void onDeleteSubject(confirmDeleteSubject.id);
          }
          setConfirmDeleteSubject(null);
        }}
      />
    </div>
  );
}
