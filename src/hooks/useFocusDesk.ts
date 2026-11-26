import { useCallback, useEffect, useRef, useState } from 'react';
import {
  computeBreakTiming,
  computeCountdownRemainingSeconds,
  computeSessionFocusedSeconds,
  isCountdownFinished,
} from '../../shared/timerMath';
import type {
  ActiveStatePayload,
  AnalyticsData,
  AppSettings,
  BackupFileInfo,
  BreakRecord,
  BreakType,
  DashboardStats,
  Goal,
  GoalType,
  StudySession,
  Subject,
  TimerMode,
} from '../../shared/types';
import { api } from '../services/api';

export interface ToastMessage {
  id: number;
  title: string;
  body: string;
  tone: 'info' | 'success' | 'warning';
}

export function useFocusDesk(options?: { isFloatingWindow?: boolean }) {
  const isFloatingWindow = Boolean(options?.isFloatingWindow);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const [activeState, setActiveState] = useState<ActiveStatePayload>({
    activeSession: null,
    recoverySession: null,
    activeBreak: null,
    serverNowIso: new Date().toISOString(),
  });
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [history, setHistory] = useState<StudySession[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [dashboard, setDashboard] = useState<DashboardStats | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [backups, setBackups] = useState<BackupFileInfo[]>([]);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isWebFloatingOpen, setIsWebFloatingOpen] = useState(false);
  const [lastCompletedBanner, setLastCompletedBanner] = useState<StudySession | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const completedNotifiedRef = useRef<Set<number>>(new Set());
  const breakNotifiedRef = useRef<Set<number>>(new Set());

  const pushToast = useCallback((title: string, body: string, tone: ToastMessage['tone'] = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev.slice(-1), { id, title, body, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      if (isFloatingWindow) {
        const [st, cfg] = await Promise.all([api.getActiveState(), api.getSettings()]);
        setActiveState(st);
        setSettings(cfg);
      } else {
        const [st, subs, hist, gls, dash, anl, cfg, bks] = await Promise.all([
          api.getActiveState(),
          api.listSubjects(true),
          api.listCompletedSessions(),
          api.listGoals(),
          api.getDashboardStats(),
          api.getAnalytics(),
          api.getSettings(),
          api.listBackups(),
        ]);
        setActiveState(st);
        setSubjects(subs);
        setHistory(hist);
        setGoals(gls);
        setDashboard(dash);
        setAnalytics(anl);
        setSettings(cfg);
        setBackups(bks);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load FocusDesk data.');
    } finally {
      setLoading(false);
    }
  }, [isFloatingWindow]);

  useEffect(() => {
    void refreshAll();
    const unsub = api.onStateChanged(() => {
      void refreshAll();
    });
    return unsub;
  }, [refreshAll]);

  // Accurate wall-clock tick every 250ms while a session or break is running
  useEffect(() => {
    const isRunningSession = activeState.activeSession?.status === 'running';
    const isRunningBreak = activeState.activeBreak?.status === 'running';
    if (!isRunningSession && !isRunningBreak) {
      return;
    }
    setNowMs(Date.now());
    const id = setInterval(() => {
      setNowMs(Date.now());
    }, 250);
    return () => clearInterval(id);
  }, [activeState.activeSession?.status, activeState.activeBreak?.status]);

  // Periodic heartbeat to SQLite every 5 seconds while session is running (crash recovery accuracy)
  useEffect(() => {
    const session = activeState.activeSession;
    if (!session || session.status !== 'running' || isFloatingWindow) return;

    const id = setInterval(() => {
      void api.heartbeatSession(session.id).catch(() => null);
    }, 5000);

    const onVisibility = () => {
      void api.heartbeatSession(session.id).catch(() => null);
      setNowMs(Date.now());
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [activeState.activeSession?.id, activeState.activeSession?.status, isFloatingWindow]);

  // Countdown completion monitor (main window only drives completion to avoid duplicate finish calls)
  useEffect(() => {
    if (isFloatingWindow) return;
    const session = activeState.activeSession;
    if (!session || session.status !== 'running') return;
    if (!isCountdownFinished(session, nowMs)) return;
    if (completedNotifiedRef.current.has(session.id)) return;

    completedNotifiedRef.current.add(session.id);
    void (async () => {
      try {
        const res = await api.finishSession(session.id, true);
        setLastCompletedBanner(res.completedSession);
        const sessionLabel = session.study_note
          ? `${session.subject_name ?? 'Study'} · ${session.study_note}`
          : (session.subject_name ?? 'Study Session');
        await api.showNotification(
          'Study Timer Finished',
          `${sessionLabel} countdown completed.`
        );
        pushToast(
          'Study Timer Finished',
          `Completed ${sessionLabel}`,
          'success'
        );
        await refreshAll();
      } catch (err) {
        completedNotifiedRef.current.delete(session.id);
        setError(err instanceof Error ? err.message : 'Failed to complete countdown session.');
      }
    })();
  }, [activeState.activeSession, nowMs, isFloatingWindow, pushToast, refreshAll]);

  // Break duration reached monitor (silent Windows/browser reminder)
  useEffect(() => {
    if (isFloatingWindow) return;
    const brk = activeState.activeBreak;
    if (!brk || brk.status !== 'running') return;
    const timing = computeBreakTiming(brk, nowMs);
    if (!timing.isOvertime) return;
    if (breakNotifiedRef.current.has(brk.id)) return;

    breakNotifiedRef.current.add(brk.id);
    const label = brk.break_type === 'short' ? 'Short Break' : 'Long Break';
    void api.showNotification(
      `${label} Complete`,
      'Your scheduled break duration has finished. Ready to resume studying?'
    );
    pushToast(`${label} Complete`, 'Your break duration has elapsed. End or skip break when ready.', 'warning');
  }, [activeState.activeBreak, nowMs, isFloatingWindow, pushToast]);

  const requestNotificationPermissionOnce = useCallback(() => {
    if (!api.isElectron && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission().catch(() => null);
    }
  }, []);

  // Actions
  const startSession = useCallback(
    async (payload: { subjectId: number; studyNote?: string | null; timerMode: TimerMode; targetSeconds?: number }) => {
      requestNotificationPermissionOnce();
      setLastCompletedBanner(null);
      const st = await api.startSession(payload);
      setActiveState(st);
      setNowMs(Date.now());
      await refreshAll();
    },
    [refreshAll, requestNotificationPermissionOnce]
  );

  const pauseSession = useCallback(
    async (sessionId: number) => {
      const st = await api.pauseSession(sessionId);
      setActiveState(st);
      setNowMs(Date.now());
      await refreshAll();
    },
    [refreshAll]
  );

  const resumeSession = useCallback(
    async (sessionId: number) => {
      const st = await api.resumeSession(sessionId);
      setActiveState(st);
      setNowMs(Date.now());
      await refreshAll();
    },
    [refreshAll]
  );

  const finishSession = useCallback(
    async (sessionId: number) => {
      const res = await api.finishSession(sessionId, false);
      setLastCompletedBanner(res.completedSession);
      if (isFullscreen) {
        await api.setFullscreen(false);
        setIsFullscreen(false);
      }
      await refreshAll();
      pushToast('Study Session Saved', 'Your focused study time has been recorded.', 'success');
    },
    [isFullscreen, pushToast, refreshAll]
  );

  const discardActiveSession = useCallback(
    async (sessionId: number) => {
      await api.discardActiveSession(sessionId);
      if (isFullscreen) {
        await api.setFullscreen(false);
        setIsFullscreen(false);
      }
      await refreshAll();
      pushToast('Session Discarded', 'Unfinished session was discarded without affecting statistics.', 'info');
    },
    [isFullscreen, pushToast, refreshAll]
  );

  const resolveRecovery = useCallback(
    async (sessionId: number, action: 'resume' | 'discard') => {
      const st = await api.resolveRecovery(sessionId, action);
      setActiveState(st);
      await refreshAll();
      if (action === 'resume') {
        pushToast('Session Restored', 'Session resumed in paused state without counting closed time.', 'info');
      } else {
        pushToast('Session Discarded', 'Unfinished session discarded.', 'info');
      }
    },
    [pushToast, refreshAll]
  );

  const startBreak = useCallback(
    async (breakType: BreakType) => {
      requestNotificationPermissionOnce();
      const st = await api.startBreak(breakType);
      setActiveState(st);
      setNowMs(Date.now());
      await refreshAll();
    },
    [refreshAll, requestNotificationPermissionOnce]
  );

  const endBreak = useCallback(
    async (breakId: number, action: 'complete' | 'skip') => {
      const st = await api.endBreak(breakId, action);
      setActiveState(st);
      setNowMs(Date.now());
      await refreshAll();
    },
    [refreshAll]
  );

  const enterFullscreen = useCallback(async () => {
    setIsFullscreen(true);
    await api.setFullscreen(true);
  }, []);

  const exitFullscreen = useCallback(async () => {
    setIsFullscreen(false);
    await api.setFullscreen(false);
  }, []);

  const openFloatingTimer = useCallback(async () => {
    if (api.isElectron) {
      await api.openFloatingWindow();
    } else {
      setIsWebFloatingOpen(true);
    }
  }, []);

  const closeFloatingTimer = useCallback(async () => {
    if (api.isElectron) {
      await api.closeFloatingWindow();
    } else {
      setIsWebFloatingOpen(false);
    }
  }, []);

  // Subjects & Topics
  const createSubject = useCallback(
    async (name: string, color?: string) => {
      const sub = await api.createSubject(name, color);
      await refreshAll();
      return sub;
    },
    [refreshAll]
  );

  const updateSubject = useCallback(
    async (id: number, name: string, color?: string) => {
      await api.updateSubject(id, name, color);
      await refreshAll();
    },
    [refreshAll]
  );

  const deleteSubject = useCallback(
    async (id: number) => {
      const res = await api.deleteSubject(id);
      await refreshAll();
      pushToast(
        res.action === 'archived' ? 'Subject Archived' : 'Subject Deleted',
        res.action === 'archived'
          ? 'Referenced by existing study records; archived safely to preserve history.'
          : 'Subject permanently deleted.',
        'info'
      );
      return res;
    },
    [pushToast, refreshAll]
  );

  const restoreSubject = useCallback(
    async (id: number) => {
      await api.restoreSubject(id);
      await refreshAll();
    },
    [refreshAll]
  );

  // History
  const updateCompletedSession = useCallback(
    async (
      id: number,
      updates: {
        subjectId: number;
        studyNote?: string | null;
        startedAt: string;
        endedAt: string;
        focusedSeconds: number;
      }
    ) => {
      await api.updateCompletedSession(id, updates);
      await refreshAll();
      pushToast('Session Updated', 'Study history and statistics updated.', 'success');
    },
    [pushToast, refreshAll]
  );

  const deleteCompletedSession = useCallback(
    async (id: number) => {
      await api.deleteCompletedSession(id);
      await refreshAll();
      pushToast('Session Deleted', 'Record removed and statistics recalculated.', 'info');
    },
    [pushToast, refreshAll]
  );

  // Goals
  const upsertGoal = useCallback(
    async (goalType: GoalType, targetSeconds: number) => {
      await api.upsertGoal(goalType, targetSeconds);
      await refreshAll();
      pushToast('Goal Saved', `${goalType === 'daily' ? 'Daily' : 'Weekly'} study target updated.`, 'success');
    },
    [pushToast, refreshAll]
  );

  const deleteGoal = useCallback(
    async (goalType: GoalType) => {
      await api.deleteGoal(goalType);
      await refreshAll();
      pushToast('Goal Cleared', `${goalType === 'daily' ? 'Daily' : 'Weekly'} goal removed.`, 'info');
    },
    [pushToast, refreshAll]
  );

  // Settings & Backups
  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      await api.updateSettings(patch);
      await refreshAll();
      pushToast('Settings Saved', 'Preferences updated locally.', 'success');
    },
    [pushToast, refreshAll]
  );

  const createBackup = useCallback(async () => {
    const info = await api.createBackup();
    await refreshAll();
    pushToast('Backup Created', `Saved ${info.filename}`, 'success');
    return info;
  }, [pushToast, refreshAll]);

  const restoreBackup = useCallback(
    async (filename: string) => {
      const res = await api.restoreBackup(filename);
      await refreshAll();
      pushToast('Backup Restored', `Database restored from ${res.restoredFrom}`, 'success');
      return res;
    },
    [pushToast, refreshAll]
  );

  const activeSession = activeState.activeSession;
  const activeBreak = activeState.activeBreak;

  const sessionElapsedSeconds = activeSession ? computeSessionFocusedSeconds(activeSession, nowMs) : 0;
  const sessionRemainingSeconds = activeSession ? computeCountdownRemainingSeconds(activeSession, nowMs) : null;
  const breakTiming = activeBreak ? computeBreakTiming(activeBreak, nowMs) : null;

  return {
    loading,
    error,
    nowMs,
    activeSession,
    recoverySession: activeState.recoverySession,
    activeBreak,
    sessionElapsedSeconds,
    sessionRemainingSeconds,
    breakTiming,
    lastCompletedBanner,
    clearCompletedBanner: () => setLastCompletedBanner(null),
    subjects,
    history,
    goals,
    dashboard,
    analytics,
    settings,
    backups,
    isFullscreen,
    isWebFloatingOpen,
    toasts,
    dismissToast,
    refreshAll,
    startSession,
    pauseSession,
    resumeSession,
    finishSession,
    discardActiveSession,
    resolveRecovery,
    startBreak,
    endBreak,
    enterFullscreen,
    exitFullscreen,
    openFloatingTimer,
    closeFloatingTimer,
    createSubject,
    updateSubject,
    deleteSubject,
    restoreSubject,
    updateCompletedSession,
    deleteCompletedSession,
    upsertGoal,
    deleteGoal,
    updateSettings,
    createBackup,
    restoreBackup,
  };
}
