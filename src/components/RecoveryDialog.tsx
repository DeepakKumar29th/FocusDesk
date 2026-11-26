import { useState } from 'react';
import { Clock, RotateCcw, Trash2 } from 'lucide-react';
import { formatClock, formatDurationHuman } from '../../shared/timerMath';
import type { StudySession } from '../../shared/types';

interface RecoveryDialogProps {
  session: StudySession;
  onResume: (sessionId: number) => Promise<void>;
  onDiscard: (sessionId: number) => Promise<void>;
}

export function RecoveryDialog({ session, onResume, onDiscard }: RecoveryDialogProps) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleResume = async () => {
    setBusy(true);
    try {
      await onResume(session.id);
    } finally {
      setBusy(false);
    }
  };

  const handleDiscardConfirmed = async () => {
    setBusy(true);
    try {
      await onDiscard(session.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recovery-dialog-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-[#242D36] border border-[#343F49] p-6 shadow-xl shadow-black/40">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#F5C563]/15 text-[#F6D07A] shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h2 id="recovery-dialog-title" className="text-lg font-semibold text-[#F1F5F4]">
              Unfinished Study Session Detected
            </h2>
            <p className="text-sm text-[#A0ADA9]">
              FocusDesk closed before this session ended. Time while closed was not counted.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-xl bg-[#1A2128] border border-[#343F49] p-4 space-y-2.5 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[#A0ADA9]">
              {session.study_note ? 'Subject & Study Note' : 'Subject'}
            </span>
            <span className="font-medium text-[#F1F5F4] text-right">
              {session.subject_name}
              {session.study_note ? ` · ${session.study_note}` : ''}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#A0ADA9]">Timer Mode</span>
            <span className="text-[#F1F5F4] capitalize">{session.timer_mode}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#A0ADA9]">Saved Focused Time</span>
            <span className="font-mono-tabular font-semibold text-[#8BE0BC]">
              {formatClock(session.focused_seconds)} ({formatDurationHuman(session.focused_seconds)})
            </span>
          </div>
        </div>

        {confirmingDiscard ? (
          <div className="mt-5 rounded-xl bg-[#F87171]/12 border border-[#F87171]/35 p-4">
            <p className="text-sm text-[#FCA5A5]">
              Are you sure you want to discard this unfinished session? Its saved time will not be added to your study statistics.
            </p>
            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmingDiscard(false)}
                className="px-4 py-2 text-sm font-medium rounded-xl border border-[#343F49] bg-[#1C232B] text-[#F1F5F4] hover:bg-[#2C3742] whitespace-nowrap"
              >
                Keep Session
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleDiscardConfirmed}
                className="px-4 py-2 text-sm font-medium rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white whitespace-nowrap"
              >
                {busy ? 'Discarding...' : 'Confirm Discard'}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmingDiscard(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl border border-[#343F49] text-[#A0ADA9] hover:text-[#FCA5A5] hover:border-[#F87171]/45 hover:bg-[#F87171]/10 transition-colors whitespace-nowrap"
            >
              <Trash2 className="w-4 h-4" />
              <span>Discard Session</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleResume}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-xl bg-[#8BE0BC] hover:bg-[#7AD5AE] text-[#11221B] transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{busy ? 'Restoring...' : 'Resume Session (Paused)'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
