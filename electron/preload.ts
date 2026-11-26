import { contextBridge, ipcRenderer } from 'electron';

export type Unsubscribe = () => void;

contextBridge.exposeInMainWorld('focusDeskAPI', {
  isElectron: true,

  // Active state & recovery
  getActiveState: () => ipcRenderer.invoke('state:get'),
  resolveRecovery: (sessionId: number, action: 'resume' | 'discard') =>
    ipcRenderer.invoke('session:resolveRecovery', { sessionId, action }),

  // Study sessions & timer
  startSession: (payload: {
    subjectId: number;
    studyNote?: string | null;
    timerMode: 'stopwatch' | 'countdown';
    targetSeconds?: number;
  }) => ipcRenderer.invoke('session:start', payload),
  pauseSession: (sessionId: number) => ipcRenderer.invoke('session:pause', { sessionId }),
  resumeSession: (sessionId: number) => ipcRenderer.invoke('session:resume', { sessionId }),
  heartbeatSession: (sessionId: number) => ipcRenderer.invoke('session:heartbeat', { sessionId }),
  finishSession: (sessionId: number, clampCountdown?: boolean) =>
    ipcRenderer.invoke('session:finish', { sessionId, clampCountdown }),
  discardActiveSession: (sessionId: number) => ipcRenderer.invoke('session:discard', { sessionId }),

  // Breaks
  startBreak: (breakType: 'short' | 'long') => ipcRenderer.invoke('break:start', { breakType }),
  endBreak: (breakId: number, action: 'complete' | 'skip') =>
    ipcRenderer.invoke('break:end', { breakId, action }),

  // Subjects
  listSubjects: (includeArchived?: boolean) => ipcRenderer.invoke('subjects:list', { includeArchived }),
  createSubject: (name: string, color?: string) => ipcRenderer.invoke('subjects:create', { name, color }),
  updateSubject: (id: number, name: string, color?: string) =>
    ipcRenderer.invoke('subjects:update', { id, name, color }),
  deleteSubject: (id: number) => ipcRenderer.invoke('subjects:delete', { id }),
  restoreSubject: (id: number) => ipcRenderer.invoke('subjects:restore', { id }),

  // History
  listCompletedSessions: () => ipcRenderer.invoke('history:list'),
  updateCompletedSession: (
    id: number,
    updates: {
      subjectId: number;
      studyNote?: string | null;
      startedAt: string;
      endedAt: string;
      focusedSeconds: number;
    }
  ) => ipcRenderer.invoke('history:update', { id, updates }),
  deleteCompletedSession: (id: number) => ipcRenderer.invoke('history:delete', { id }),

  // Goals, Dashboard, Analytics
  listGoals: () => ipcRenderer.invoke('goals:list'),
  upsertGoal: (goalType: 'daily' | 'weekly', targetSeconds: number) =>
    ipcRenderer.invoke('goals:upsert', { goalType, targetSeconds }),
  deleteGoal: (goalType: 'daily' | 'weekly') => ipcRenderer.invoke('goals:delete', { goalType }),
  getDashboardStats: () => ipcRenderer.invoke('dashboard:get'),
  getAnalytics: () => ipcRenderer.invoke('analytics:get'),

  // Settings & Backups
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch: Record<string, unknown>) => ipcRenderer.invoke('settings:update', patch),
  listBackups: () => ipcRenderer.invoke('backups:list'),
  createBackup: () => ipcRenderer.invoke('backups:create'),
  restoreBackup: (filename: string) => ipcRenderer.invoke('backups:restore', { filename }),
  openBackupFolder: () => ipcRenderer.invoke('backups:openFolder'),

  // Native Desktop Features (Windows 11 Notifications, Fullscreen, Floating Window)
  showNotification: (title: string, body: string) => ipcRenderer.invoke('notify:show', { title, body }),
  setFullscreen: (enabled: boolean) => ipcRenderer.invoke('window:setFullscreen', { enabled }),
  openFloatingWindow: () => ipcRenderer.invoke('window:openFloating'),
  closeFloatingWindow: () => ipcRenderer.invoke('window:closeFloating'),

  // Sync subscription across main & floating windows
  onStateChanged: (callback: () => void): Unsubscribe => {
    const handler = () => callback();
    ipcRenderer.on('focusdesk:state-changed', handler);
    return () => {
      ipcRenderer.removeListener('focusdesk:state-changed', handler);
    };
  },
});
