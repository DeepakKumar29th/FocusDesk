import type {
  ActiveStatePayload,
  AnalyticsData,
  AppSettings,
  BackupFileInfo,
  BreakType,
  DashboardStats,
  Goal,
  GoalType,
  StudySession,
  Subject,
  TimerMode,
} from '../../shared/types';

export interface FocusDeskBridge {
  isElectron: boolean;
  getActiveState(): Promise<ActiveStatePayload>;
  resolveRecovery(sessionId: number, action: 'resume' | 'discard'): Promise<ActiveStatePayload>;
  startSession(payload: {
    subjectId: number;
    studyNote?: string | null;
    timerMode: TimerMode;
    targetSeconds?: number;
  }): Promise<ActiveStatePayload>;
  pauseSession(sessionId: number): Promise<ActiveStatePayload>;
  resumeSession(sessionId: number): Promise<ActiveStatePayload>;
  heartbeatSession(sessionId: number): Promise<void>;
  finishSession(
    sessionId: number,
    clampCountdown?: boolean
  ): Promise<{ completedSession: StudySession; activeState: ActiveStatePayload }>;
  discardActiveSession(sessionId: number): Promise<ActiveStatePayload>;

  startBreak(breakType: BreakType): Promise<ActiveStatePayload>;
  endBreak(breakId: number, action: 'complete' | 'skip'): Promise<ActiveStatePayload>;

  listSubjects(includeArchived?: boolean): Promise<Subject[]>;
  createSubject(name: string, color?: string): Promise<Subject>;
  updateSubject(id: number, name: string, color?: string): Promise<Subject>;
  deleteSubject(id: number): Promise<{ action: 'deleted' | 'archived' }>;
  restoreSubject(id: number): Promise<Subject>;

  listCompletedSessions(): Promise<StudySession[]>;
  updateCompletedSession(
    id: number,
    updates: {
      subjectId: number;
      studyNote?: string | null;
      startedAt: string;
      endedAt: string;
      focusedSeconds: number;
    }
  ): Promise<StudySession>;
  deleteCompletedSession(id: number): Promise<void>;

  listGoals(): Promise<Goal[]>;
  upsertGoal(goalType: GoalType, targetSeconds: number): Promise<Goal[]>;
  deleteGoal(goalType: GoalType): Promise<Goal[]>;
  getDashboardStats(): Promise<DashboardStats>;
  getAnalytics(): Promise<AnalyticsData>;

  getSettings(): Promise<AppSettings>;
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  listBackups(): Promise<BackupFileInfo[]>;
  createBackup(): Promise<BackupFileInfo>;
  restoreBackup(filename: string): Promise<{ restoredFrom: string; preRestoreBackup: string }>;
  openBackupFolder(): Promise<void>;

  showNotification(title: string, body: string): Promise<void>;
  setFullscreen(enabled: boolean): Promise<void>;
  openFloatingWindow(): Promise<void>;
  closeFloatingWindow(): Promise<void>;
  onStateChanged(callback: () => void): () => void;
}

declare global {
  interface Window {
    focusDeskAPI?: FocusDeskBridge;
  }
}

const syncChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('focusdesk_sync') : null;

function notifyBroadcast(): void {
  syncChannel?.postMessage({ type: 'state-changed', ts: Date.now() });
}

async function httpJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : `Request failed (${res.status})`);
  }
  return data as T;
}

function createWebBridge(): FocusDeskBridge {
  return {
    isElectron: false,

    getActiveState: () => httpJson<ActiveStatePayload>('/api/state'),
    async resolveRecovery(sessionId, action) {
      const res = await httpJson<ActiveStatePayload>('/api/session/recovery', {
        method: 'POST',
        body: JSON.stringify({ sessionId, action }),
      });
      notifyBroadcast();
      return res;
    },
    async startSession(payload) {
      const res = await httpJson<ActiveStatePayload>('/api/session/start', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      notifyBroadcast();
      return res;
    },
    async pauseSession(sessionId) {
      const res = await httpJson<ActiveStatePayload>(`/api/session/${sessionId}/pause`, { method: 'POST' });
      notifyBroadcast();
      return res;
    },
    async resumeSession(sessionId) {
      const res = await httpJson<ActiveStatePayload>(`/api/session/${sessionId}/resume`, { method: 'POST' });
      notifyBroadcast();
      return res;
    },
    async heartbeatSession(sessionId) {
      await httpJson(`/api/session/${sessionId}/heartbeat`, { method: 'POST' });
    },
    async finishSession(sessionId, clampCountdown) {
      const res = await httpJson<{ completedSession: StudySession; activeState: ActiveStatePayload }>(
        `/api/session/${sessionId}/finish`,
        {
          method: 'POST',
          body: JSON.stringify({ clampCountdown: Boolean(clampCountdown) }),
        }
      );
      notifyBroadcast();
      return res;
    },
    async discardActiveSession(sessionId) {
      const res = await httpJson<ActiveStatePayload>(`/api/session/${sessionId}/discard`, { method: 'POST' });
      notifyBroadcast();
      return res;
    },

    async startBreak(breakType) {
      const res = await httpJson<ActiveStatePayload>('/api/break/start', {
        method: 'POST',
        body: JSON.stringify({ breakType }),
      });
      notifyBroadcast();
      return res;
    },
    async endBreak(breakId, action) {
      const res = await httpJson<ActiveStatePayload>(`/api/break/${breakId}/end`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      notifyBroadcast();
      return res;
    },

    listSubjects: (includeArchived = false) =>
      httpJson<Subject[]>(`/api/subjects?includeArchived=${includeArchived ? 'true' : 'false'}`),
    async createSubject(name, color) {
      const res = await httpJson<Subject>('/api/subjects', {
        method: 'POST',
        body: JSON.stringify({ name, color }),
      });
      notifyBroadcast();
      return res;
    },
    async updateSubject(id, name, color) {
      const res = await httpJson<Subject>(`/api/subjects/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, color }),
      });
      notifyBroadcast();
      return res;
    },
    async deleteSubject(id) {
      const res = await httpJson<{ action: 'deleted' | 'archived' }>(`/api/subjects/${id}`, { method: 'DELETE' });
      notifyBroadcast();
      return res;
    },
    async restoreSubject(id) {
      const res = await httpJson<Subject>(`/api/subjects/${id}/restore`, { method: 'POST' });
      notifyBroadcast();
      return res;
    },

    listCompletedSessions: () => httpJson<StudySession[]>('/api/history'),
    async updateCompletedSession(id, updates) {
      const res = await httpJson<StudySession>(`/api/history/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      notifyBroadcast();
      return res;
    },
    async deleteCompletedSession(id) {
      await httpJson(`/api/history/${id}`, { method: 'DELETE' });
      notifyBroadcast();
    },

    listGoals: () => httpJson<Goal[]>('/api/goals'),
    async upsertGoal(goalType, targetSeconds) {
      const res = await httpJson<Goal[]>(`/api/goals/${goalType}`, {
        method: 'PUT',
        body: JSON.stringify({ targetSeconds }),
      });
      notifyBroadcast();
      return res;
    },
    async deleteGoal(goalType) {
      const res = await httpJson<Goal[]>(`/api/goals/${goalType}`, { method: 'DELETE' });
      notifyBroadcast();
      return res;
    },
    getDashboardStats: () => httpJson<DashboardStats>('/api/dashboard'),
    getAnalytics: () => httpJson<AnalyticsData>('/api/analytics'),

    getSettings: () => httpJson<AppSettings>('/api/settings'),
    async updateSettings(patch) {
      const res = await httpJson<AppSettings>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
      notifyBroadcast();
      return res;
    },
    listBackups: () => httpJson<BackupFileInfo[]>('/api/backups'),
    async createBackup() {
      const res = await httpJson<BackupFileInfo>('/api/backups', { method: 'POST' });
      notifyBroadcast();
      return res;
    },
    async restoreBackup(filename) {
      const res = await httpJson<{ restoredFrom: string; preRestoreBackup: string }>('/api/backups/restore', {
        method: 'POST',
        body: JSON.stringify({ filename }),
      });
      notifyBroadcast();
      return res;
    },
    async openBackupFolder() {
      // Handled natively in Electron; in web mode Settings displays the path directly
    },

    async showNotification(title, body) {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(title, { body, silent: true });
      }
    },
    async setFullscreen(enabled) {
      if (typeof document === 'undefined') return;
      try {
        if (enabled && !document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        } else if (!enabled && document.fullscreenElement) {
          await document.exitFullscreen();
        }
      } catch {
        // Fullscreen API may be restricted in embedded preview iframes; UI overlay still renders fullscreen
      }
    },
    async openFloatingWindow() {
      // Managed in React for embedded browser mode; native BrowserWindow in Electron
    },
    async closeFloatingWindow() {},

    onStateChanged(callback) {
      if (!syncChannel) return () => {};
      const listener = (ev: MessageEvent) => {
        if (ev.data?.type === 'state-changed') callback();
      };
      syncChannel.addEventListener('message', listener);
      return () => syncChannel.removeEventListener('message', listener);
    },
  };
}

export const api: FocusDeskBridge =
  typeof window !== 'undefined' && window.focusDeskAPI ? window.focusDeskAPI : createWebBridge();
