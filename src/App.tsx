import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import type { PageId } from '../shared/types';
import { AnalyticsView } from './components/AnalyticsView';
import { DashboardView } from './components/DashboardView';
import { FloatingTimerWindow } from './components/FloatingTimerWindow';
import { FullscreenStudyOverlay } from './components/FullscreenStudyOverlay';
import { GoalsView } from './components/GoalsView';
import { HistoryView } from './components/HistoryView';
import { RecoveryDialog } from './components/RecoveryDialog';
import { SettingsView } from './components/SettingsView';
import { Sidebar } from './components/Sidebar';
import { StudyTimerView } from './components/StudyTimerView';
import { useFocusDesk } from './hooks/useFocusDesk';

export function FloatingApp() {
  const fd = useFocusDesk({ isFloatingWindow: true });

  return (
    <FloatingTimerWindow
      isStandaloneWindow
      activeSession={fd.activeSession}
      activeBreak={fd.activeBreak}
      sessionElapsedSeconds={fd.sessionElapsedSeconds}
      sessionRemainingSeconds={fd.sessionRemainingSeconds}
      breakTiming={fd.breakTiming}
      onPauseSession={fd.pauseSession}
      onResumeSession={fd.resumeSession}
      onClose={() => window.close()}
    />
  );
}

export default function App() {
  const [activePage, setActivePage] = useState<PageId>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showSeconds, setShowSeconds] = useState<boolean>(() => {
    try {
      return localStorage.getItem('focusdesk:showSeconds') !== 'false';
    } catch {
      return true;
    }
  });

  const fd = useFocusDesk();

  const handleToggleShowSeconds = (next: boolean) => {
    setShowSeconds(next);
    try {
      localStorage.setItem('focusdesk:showSeconds', String(next));
    } catch {
      // Ignore storage failures
    }
  };

  const handleNavigate = (page: PageId) => {
    setActivePage(page);
    setMobileNavOpen(false);
  };

  const sidebarDisplaySeconds =
    fd.activeSession?.timer_mode === 'countdown'
      ? (fd.sessionRemainingSeconds ?? 0)
      : fd.sessionElapsedSeconds;

  return (
    <div className="min-h-screen bg-[#151A20] text-[#F1F5F4] flex">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex shrink-0">
        <Sidebar
          activePage={activePage}
          onNavigate={handleNavigate}
          activeSession={fd.activeSession}
          activeBreak={fd.activeBreak}
          sessionDisplaySeconds={sidebarDisplaySeconds}
          breakRemainingSeconds={fd.breakTiming?.remainingSeconds ?? null}
        />
      </div>

      {/* Mobile / Narrow Window Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-[2px]"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 flex">
            <Sidebar
              activePage={activePage}
              onNavigate={handleNavigate}
              activeSession={fd.activeSession}
              activeBreak={fd.activeBreak}
              sessionDisplaySeconds={sidebarDisplaySeconds}
              breakRemainingSeconds={fd.breakTiming?.remainingSeconds ?? null}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Compact narrow-viewport menu trigger */}
        <div className="flex md:hidden items-center justify-between px-4 py-3 border-b border-[#343F49] bg-[#1C232B]">
          <button
            type="button"
            aria-label="Open navigation menu"
            onClick={() => setMobileNavOpen(true)}
            className="p-2 rounded-xl border border-[#343F49] text-[#F1F5F4] hover:bg-[#242D36]"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold text-[#F1F5F4]">FocusDesk</span>
          <div className="w-9" />
        </div>

        <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {fd.error && (
            <div className="mb-6 rounded-xl bg-[#F87171]/12 border border-[#F87171]/35 px-4 py-3 text-sm text-[#FCA5A5]">
              {fd.error}
            </div>
          )}

          {fd.loading ? (
            <div className="space-y-4">
              <div className="h-8 w-48 rounded-xl bg-[#242D36]" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-32 rounded-2xl bg-[#242D36] border border-[#343F49]" />
                ))}
              </div>
            </div>
          ) : (
            <>
              {activePage === 'dashboard' && (
                <DashboardView
                  stats={fd.dashboard}
                  recentSessions={fd.history}
                  onNavigate={handleNavigate}
                />
              )}

              {activePage === 'timer' && (
                <StudyTimerView
                  activeSession={fd.activeSession}
                  activeBreak={fd.activeBreak}
                  sessionElapsedSeconds={fd.sessionElapsedSeconds}
                  sessionRemainingSeconds={fd.sessionRemainingSeconds}
                  breakTiming={fd.breakTiming}
                  lastCompletedBanner={fd.lastCompletedBanner}
                  onClearCompletedBanner={fd.clearCompletedBanner}
                  subjects={fd.subjects}
                  settings={fd.settings}
                  showSeconds={showSeconds}
                  onStartSession={fd.startSession}
                  onPauseSession={fd.pauseSession}
                  onResumeSession={fd.resumeSession}
                  onFinishSession={fd.finishSession}
                  onDiscardSession={fd.discardActiveSession}
                  onStartBreak={fd.startBreak}
                  onEndBreak={fd.endBreak}
                  onEnterFullscreen={fd.enterFullscreen}
                  onOpenFloating={fd.openFloatingTimer}
                  onCreateSubject={fd.createSubject}
                  onUpdateSubject={fd.updateSubject}
                  onDeleteSubject={fd.deleteSubject}
                  onRestoreSubject={fd.restoreSubject}
                />
              )}

              {activePage === 'history' && (
                <HistoryView
                  sessions={fd.history}
                  subjects={fd.subjects}
                  onUpdateSession={fd.updateCompletedSession}
                  onDeleteSession={fd.deleteCompletedSession}
                />
              )}

              {activePage === 'analytics' && <AnalyticsView analytics={fd.analytics} />}

              {activePage === 'goals' && (
                <GoalsView
                  goals={fd.goals}
                  dashboard={fd.dashboard}
                  onUpsertGoal={fd.upsertGoal}
                  onDeleteGoal={fd.deleteGoal}
                />
              )}

              {activePage === 'settings' && (
                <SettingsView
                  settings={fd.settings}
                  backups={fd.backups}
                  showSeconds={showSeconds}
                  onToggleShowSeconds={handleToggleShowSeconds}
                  onUpdateSettings={fd.updateSettings}
                  onCreateBackup={fd.createBackup}
                  onRestoreBackup={fd.restoreBackup}
                  onNavigate={handleNavigate}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Unfinished Session Recovery Dialog */}
      {fd.recoverySession && (
        <RecoveryDialog
          session={fd.recoverySession}
          onResume={(id) => fd.resolveRecovery(id, 'resume')}
          onDiscard={(id) => fd.resolveRecovery(id, 'discard')}
        />
      )}

      {/* Fullscreen Distraction-Free Study Mode */}
      <FullscreenStudyOverlay
        open={fd.isFullscreen}
        activeSession={fd.activeSession}
        activeBreak={fd.activeBreak}
        sessionElapsedSeconds={fd.sessionElapsedSeconds}
        sessionRemainingSeconds={fd.sessionRemainingSeconds}
        breakTiming={fd.breakTiming}
        onPauseSession={fd.pauseSession}
        onResumeSession={fd.resumeSession}
        onFinishSession={fd.finishSession}
        onEndBreak={fd.endBreak}
        onExit={fd.exitFullscreen}
      />

      {/* Synchronized Floating Timer Window (Web Preview Mode) */}
      {fd.isWebFloatingOpen && (
        <FloatingTimerWindow
          isStandaloneWindow={false}
          activeSession={fd.activeSession}
          activeBreak={fd.activeBreak}
          sessionElapsedSeconds={fd.sessionElapsedSeconds}
          sessionRemainingSeconds={fd.sessionRemainingSeconds}
          breakTiming={fd.breakTiming}
          onPauseSession={fd.pauseSession}
          onResumeSession={fd.resumeSession}
          onClose={fd.closeFloatingTimer}
        />
      )}

      {/* Toast Notifications */}
      {fd.toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]"
        >
          {fd.toasts.map((t) => (
            <div
              key={t.id}
              className={`rounded-xl border p-3.5 shadow-lg shadow-black/30 bg-[#242D36] flex items-start justify-between gap-3 ${
                t.tone === 'success'
                  ? 'border-[#8BE0BC]/45'
                  : t.tone === 'warning'
                    ? 'border-[#F5C563]/45'
                    : 'border-[#8ABEFF]/45'
              }`}
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[#F1F5F4]">{t.title}</div>
                <div className="mt-0.5 text-xs text-[#A0ADA9]">{t.body}</div>
              </div>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => fd.dismissToast(t.id)}
                className="p-0.5 rounded text-[#A0ADA9] hover:text-[#F1F5F4] shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
