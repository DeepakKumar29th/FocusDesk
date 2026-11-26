import { useState } from 'react';
import { GripHorizontal, Pause, Play, X } from 'lucide-react';
import { formatClock } from '../../shared/timerMath';
import type { BreakRecord, StudySession } from '../../shared/types';

interface FloatingTimerWindowProps {
  isStandaloneWindow: boolean;
  activeSession: StudySession | null;
  activeBreak: BreakRecord | null;
  sessionElapsedSeconds: number;
  sessionRemainingSeconds: number | null;
  breakTiming: { elapsedSeconds: number; remainingSeconds: number; isOvertime: boolean } | null;
  onPauseSession: (id: number) => Promise<void>;
  onResumeSession: (id: number) => Promise<void>;
  onClose: () => Promise<void> | void;
}

export function FloatingTimerWindow({
  isStandaloneWindow,
  activeSession,
  activeBreak,
  sessionElapsedSeconds,
  sessionRemainingSeconds,
  breakTiming,
  onPauseSession,
  onResumeSession,
  onClose,
}: FloatingTimerWindowProps) {
  // Draggable coordinates for embedded web preview floating overlay
  const [pos, setPos] = useState({ x: 24, y: 24 });
  const [dragging, setDragging] = useState(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isStandaloneWindow) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = pos.x;
    const origY = pos.y;
    setDragging(true);

    const onMove = (moveEv: PointerEvent) => {
      const dx = startX - moveEv.clientX;
      const dy = startY - moveEv.clientY;
      setPos({
        x: Math.max(12, Math.min(window.innerWidth - 340, origX + dx)),
        y: Math.max(12, Math.min(window.innerHeight - 190, origY + dy)),
      });
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const timeText = activeBreak && breakTiming
    ? formatClock(breakTiming.remainingSeconds, true)
    : activeSession
      ? activeSession.timer_mode === 'countdown'
        ? formatClock(sessionRemainingSeconds ?? 0, true)
        : formatClock(sessionElapsedSeconds, true)
      : '00:00:00';

  const statusText = activeBreak
    ? `${activeBreak.break_type === 'short' ? 'Short' : 'Long'} Break`
    : activeSession
      ? activeSession.status === 'running'
        ? 'Running'
        : 'Paused'
      : 'Idle';

  const card = (
    <div
      data-testid="floating-timer-window"
      className={`${
        isStandaloneWindow ? 'w-full h-screen' : 'w-[324px] shadow-xl shadow-black/40'
      } rounded-2xl bg-[#242D36] border border-[#8BE0BC]/40 flex flex-col justify-between p-4 select-none`}
    >
      <div
        onPointerDown={handlePointerDown}
        style={isStandaloneWindow ? ({ WebkitAppRegion: 'drag' } as React.CSSProperties) : undefined}
        className={`flex items-center justify-between gap-2 pb-2.5 border-b border-[#343F49] ${
          isStandaloneWindow ? 'cursor-move' : dragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#F1F5F4]">
          <GripHorizontal className="w-3.5 h-3.5 text-[#A0ADA9]" />
          <span>FocusDesk Mini</span>
        </div>
        <button
          type="button"
          aria-label="Close Floating Timer"
          onClick={() => void onClose()}
          style={isStandaloneWindow ? ({ WebkitAppRegion: 'no-drag' } as React.CSSProperties) : undefined}
          className="p-1 rounded-lg text-[#A0ADA9] hover:text-[#F1F5F4] hover:bg-[#1C232B] transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`text-xs font-semibold ${
              statusText === 'Running'
                ? 'text-[#8BE0BC]'
                : statusText === 'Paused'
                  ? 'text-[#F6D07A]'
                  : statusText.includes('Break')
                    ? 'text-[#F6D07A]'
                    : 'text-[#A0ADA9]'
            }`}
          >
            {statusText}
          </span>
          {activeSession && (
            <span className="text-[11px] text-[#A0ADA9] capitalize">{activeSession.timer_mode}</span>
          )}
        </div>

        <div className="mt-1 text-3xl font-semibold font-mono-tabular text-[#F1F5F4]">{timeText}</div>

        <div className="mt-1 text-xs text-[#A0ADA9] truncate">
          {activeSession
            ? activeSession.study_note
              ? `${activeSession.subject_name} · ${activeSession.study_note}`
              : activeSession.subject_name
            : activeBreak
              ? 'Break timer active'
              : 'No active study session'}
        </div>
      </div>

      <div className="pt-2.5 border-t border-[#343F49] flex items-center justify-end gap-2">
        {activeSession ? (
          activeSession.status === 'running' ? (
            <button
              type="button"
              onClick={() => void onPauseSession(activeSession.id)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#F5C563]/16 hover:bg-[#F5C563]/24 text-[#F6D07A] border border-[#F5C563]/40 text-xs font-medium whitespace-nowrap"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Pause</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={Boolean(activeBreak)}
              onClick={() => void onResumeSession(activeSession.id)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#8BE0BC] hover:bg-[#7AD5AE] disabled:opacity-45 text-xs font-medium text-[#11221B] whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Resume</span>
            </button>
          )
        ) : (
          <span className="text-[11px] text-[#A0ADA9]">Synchronized with main window</span>
        )}
      </div>
    </div>
  );

  if (isStandaloneWindow) {
    return card;
  }

  return (
    <div
      className="fixed z-40"
      style={{ right: `${pos.x}px`, bottom: `${pos.y}px` }}
    >
      {card}
    </div>
  );
}
