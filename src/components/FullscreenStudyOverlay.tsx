import { useEffect } from 'react';
import { Minimize2, Pause, Play, Square } from 'lucide-react';
import { formatClock } from '../../shared/timerMath';
import type { BreakRecord, StudySession } from '../../shared/types';

interface FullscreenStudyOverlayProps {
  open: boolean;
  activeSession: StudySession | null;
  activeBreak: BreakRecord | null;
  sessionElapsedSeconds: number;
  sessionRemainingSeconds: number | null;
  breakTiming: { elapsedSeconds: number; remainingSeconds: number; isOvertime: boolean } | null;
  onPauseSession: (id: number) => Promise<void>;
  onResumeSession: (id: number) => Promise<void>;
  onFinishSession: (id: number) => Promise<void>;
  onEndBreak: (id: number, action: 'complete' | 'skip') => Promise<void>;
  onExit: () => Promise<void>;
}

export function FullscreenStudyOverlay({
  open,
  activeSession,
  activeBreak,
  sessionElapsedSeconds,
  sessionRemainingSeconds,
  breakTiming,
  onPauseSession,
  onResumeSession,
  onFinishSession,
  onEndBreak,
  onExit,
}: FullscreenStudyOverlayProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        void onExit();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onExit]);

  if (!open) return null;

  const isCountdown = activeSession?.timer_mode === 'countdown';
  const mainTime = activeBreak && breakTiming
    ? formatClock(breakTiming.remainingSeconds, true)
    : activeSession
      ? isCountdown
        ? formatClock(sessionRemainingSeconds ?? 0, true)
        : formatClock(sessionElapsedSeconds, true)
      : '00:00:00';

  return (
    <div
      data-testid="fullscreen-study-overlay"
      className="fixed inset-0 z-50 bg-[#151A20] flex flex-col justify-between p-8 select-none"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#A0ADA9]">
          FocusDesk · Distraction-Free Mode
        </span>
        <button
          type="button"
          onClick={() => void onExit()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#343F49] bg-[#242D36] text-xs font-medium text-[#F1F5F4] hover:bg-[#2C3742] transition-colors whitespace-nowrap"
        >
          <Minimize2 className="w-4 h-4 text-[#A0ADA9]" />
          <span>Exit Fullscreen (Esc)</span>
        </button>
      </div>

      <div className="flex flex-col items-center text-center max-w-2xl mx-auto w-full rounded-3xl bg-[#242D36] border border-[#8BE0BC]/35 shadow-xl shadow-black/30 px-8 py-12">
        {activeBreak ? (
          <div className="text-sm font-semibold text-[#F6D07A] mb-3">
            {activeBreak.break_type === 'short' ? 'Short Break' : 'Long Break'}
          </div>
        ) : activeSession ? (
          <div className="text-base text-[#A0ADA9] mb-3">
            <span className="font-semibold text-[#F1F5F4]">{activeSession.subject_name}</span>
            {activeSession.study_note && (
              <>
                <span className="mx-2.5 text-[#A0ADA9]">·</span>
                <span>{activeSession.study_note}</span>
              </>
            )}
          </div>
        ) : (
          <div className="text-sm text-[#A0ADA9] mb-3">No active study session</div>
        )}

        <div className="text-7xl sm:text-8xl font-semibold tracking-tight font-mono-tabular text-[#F1F5F4]">
          {mainTime}
        </div>

        {activeSession && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-sm text-[#A0ADA9] font-mono-tabular">
            <span>Elapsed: {formatClock(sessionElapsedSeconds, true)}</span>
            {isCountdown && (
              <span>Remaining: {formatClock(sessionRemainingSeconds ?? 0, true)}</span>
            )}
            <span className="font-sans">
              Status:{' '}
              <span className={activeSession.status === 'running' ? 'font-medium text-[#8BE0BC]' : 'font-medium text-[#F6D07A]'}>
                {activeSession.status === 'running' ? 'Running' : 'Paused'}
              </span>
            </span>
          </div>
        )}

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          {activeBreak ? (
            <>
              <button
                type="button"
                onClick={() => void onEndBreak(activeBreak.id, 'complete')}
                className="px-5 py-2.5 rounded-xl bg-[#F5C563]/16 hover:bg-[#F5C563]/24 border border-[#F5C563]/40 text-sm font-medium text-[#F6D07A]"
              >
                End Break
              </button>
              <button
                type="button"
                onClick={() => void onEndBreak(activeBreak.id, 'skip')}
                className="px-5 py-2.5 rounded-xl border border-[#343F49] bg-[#1C232B] text-sm font-medium text-[#F1F5F4] hover:bg-[#2C3742]"
              >
                Skip Break
              </button>
            </>
          ) : activeSession ? (
            <>
              {activeSession.status === 'running' ? (
                <button
                  type="button"
                  onClick={() => void onPauseSession(activeSession.id)}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#F5C563]/16 hover:bg-[#F5C563]/24 border border-[#F5C563]/40 text-sm font-medium text-[#F6D07A]"
                >
                  <Pause className="w-4 h-4" />
                  <span>Pause</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void onResumeSession(activeSession.id)}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#8BE0BC] hover:bg-[#7AD5AE] text-sm font-medium text-[#11221B]"
                >
                  <Play className="w-4 h-4" />
                  <span>Resume</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => void onFinishSession(activeSession.id)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#8ABEFF]/15 hover:bg-[#8ABEFF]/25 border border-[#8ABEFF]/40 text-sm font-medium text-[#8ABEFF]"
              >
                <Square className="w-4 h-4" />
                <span>Finish Session</span>
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="text-center text-xs text-[#A0ADA9]">
        Press Escape or click Exit Fullscreen to return
      </div>
    </div>
  );
}
