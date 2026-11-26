import { useEffect, useState } from 'react';
import { Database, FolderOpen, HardDriveDownload, Palette, RotateCcw } from 'lucide-react';
import type { AppSettings, BackupFileInfo, PageId, TimerMode } from '../../shared/types';
import { api } from '../services/api';
import { ConfirmDialog } from './ConfirmDialog';

interface SettingsViewProps {
  settings: AppSettings | null;
  backups: BackupFileInfo[];
  showSeconds?: boolean;
  onToggleShowSeconds?: (next: boolean) => void;
  onUpdateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  onCreateBackup: () => Promise<BackupFileInfo>;
  onRestoreBackup: (filename: string) => Promise<{ restoredFrom: string; preRestoreBackup: string }>;
  onNavigate: (page: PageId) => void;
}

export function SettingsView({
  settings,
  backups,
  showSeconds = true,
  onToggleShowSeconds,
  onUpdateSettings,
  onCreateBackup,
  onRestoreBackup,
  onNavigate,
}: SettingsViewProps) {
  const [defaultMode, setDefaultMode] = useState<TimerMode>('stopwatch');
  const [countdownMin, setCountdownMin] = useState(25);
  const [shortBreakMin, setShortBreakMin] = useState(5);
  const [longBreakMin, setLongBreakMin] = useState(15);
  const [autoBackup, setAutoBackup] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const [restoreTarget, setRestoreTarget] = useState<BackupFileInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setDefaultMode(settings.default_timer_mode);
    setCountdownMin(Math.max(1, Math.round(settings.preferred_countdown_seconds / 60)));
    setShortBreakMin(Math.max(1, Math.round(settings.short_break_seconds / 60)));
    setLongBreakMin(Math.max(1, Math.round(settings.long_break_seconds / 60)));
    setAutoBackup(settings.auto_backup_enabled);
    setNotificationsEnabled(settings.notifications_enabled);
  }, [settings]);

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onUpdateSettings({
        default_timer_mode: defaultMode,
        preferred_countdown_seconds: Math.max(1, countdownMin) * 60,
        short_break_seconds: Math.max(1, shortBreakMin) * 60,
        long_break_seconds: Math.max(1, longBreakMin) * 60,
        auto_backup_enabled: autoBackup,
        notifications_enabled: notificationsEnabled,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save settings.');
    } finally {
      setBusy(false);
    }
  };

  const handleBackupNow = async () => {
    setError(null);
    setBusy(true);
    try {
      await onCreateBackup();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!restoreTarget) return;
    setError(null);
    setBusy(true);
    try {
      await onRestoreBackup(restoreTarget.filename);
      setRestoreTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#F1F5F4]">Settings</h1>
        <p className="mt-1 text-sm text-[#A0ADA9]">
          Manage appearance, timer defaults, break durations, notifications, and offline SQLite backups.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-[#F87171]/12 border border-[#F87171]/35 px-4 py-3 text-sm text-[#FCA5A5]">
          {error}
        </div>
      )}

      {/* Appearance Section */}
      <div className="rounded-2xl bg-[#242D36] border border-[#343F49] shadow-sm shadow-black/20 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#8BE0BC]/14 flex items-center justify-center">
              <Palette className="w-4 h-4 text-[#8BE0BC]" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#F1F5F4]">Appearance</h2>
              <p className="text-xs text-[#A0ADA9]">
                Charcoal Dark Theme with mint, soft blue, and lavender accents for comfortable focus.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className="w-5 h-5 rounded-md bg-[#151A20] border border-[#343F49]"
              title="Main Background #151A20"
            />
            <span
              className="w-5 h-5 rounded-md bg-[#242D36] border border-[#343F49]"
              title="Card Surface #242D36"
            />
            <span
              className="w-5 h-5 rounded-md bg-[#8BE0BC] border border-[#8BE0BC]"
              title="Primary Mint #8BE0BC"
            />
            <span
              className="w-5 h-5 rounded-md bg-[#8ABEFF] border border-[#8ABEFF]"
              title="Soft Blue #8ABEFF"
            />
            <span
              className="w-5 h-5 rounded-md bg-[#B9A5F5] border border-[#B9A5F5]"
              title="Lavender #B9A5F5"
            />
          </div>
        </div>

        <div className="pt-3 border-t border-[#343F49]">
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div>
              <div className="text-sm font-medium text-[#F1F5F4]">
                Show seconds on Study Timer clock
              </div>
              <div className="text-xs text-[#A0ADA9]">
                Display HH:MM:SS precision or switch to a calmer HH:MM display while studying.
              </div>
            </div>
            <input
              type="checkbox"
              checked={showSeconds}
              onChange={(e) => onToggleShowSeconds?.(e.target.checked)}
              className="w-4 h-4 accent-[#8BE0BC]"
            />
          </label>
        </div>
      </div>

      <form
        onSubmit={(e) => void handleSavePreferences(e)}
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
      >
        {/* Timer & Break Preferences */}
        <div className="rounded-2xl bg-[#242D36] border border-[#343F49] shadow-sm shadow-black/20 p-6 space-y-5">
          <h2 className="text-base font-semibold text-[#F1F5F4]">Timer &amp; Break Preferences</h2>

          <div>
            <label
              htmlFor="setting-default-mode"
              className="block text-xs font-medium text-[#A0ADA9] mb-1.5"
            >
              Default Timer Mode
            </label>
            <select
              id="setting-default-mode"
              value={defaultMode}
              onChange={(e) => setDefaultMode(e.target.value as TimerMode)}
              className="w-full rounded-xl bg-[#1A2128] border border-[#343F49] px-3.5 py-2.5 text-sm text-[#F1F5F4] focus:outline-none focus:ring-2 focus:ring-[#8BE0BC]/40 focus:border-[#8BE0BC]"
            >
              <option value="stopwatch" className="bg-[#242D36] text-[#F1F5F4]">
                Stopwatch
              </option>
              <option value="countdown" className="bg-[#242D36] text-[#F1F5F4]">
                Countdown Timer
              </option>
            </select>
          </div>

          <div>
            <label
              htmlFor="setting-countdown-min"
              className="block text-xs font-medium text-[#A0ADA9] mb-1.5"
            >
              Preferred Countdown Duration (minutes)
            </label>
            <input
              id="setting-countdown-min"
              type="number"
              min={1}
              max={1440}
              value={countdownMin}
              onChange={(e) => setCountdownMin(Math.max(1, Number(e.target.value) || 1))}
              className="w-full rounded-xl bg-[#1A2128] border border-[#343F49] px-3.5 py-2.5 text-sm font-mono-tabular text-[#F1F5F4] focus:outline-none focus:ring-2 focus:ring-[#8BE0BC]/40 focus:border-[#8BE0BC]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="setting-short-break"
                className="block text-xs font-medium text-[#A0ADA9] mb-1.5"
              >
                Short Break (minutes)
              </label>
              <input
                id="setting-short-break"
                type="number"
                min={1}
                max={120}
                value={shortBreakMin}
                onChange={(e) => setShortBreakMin(Math.max(1, Number(e.target.value) || 1))}
                className="w-full rounded-xl bg-[#1A2128] border border-[#343F49] px-3.5 py-2.5 text-sm font-mono-tabular text-[#F1F5F4] focus:outline-none focus:ring-2 focus:ring-[#8BE0BC]/40 focus:border-[#8BE0BC]"
              />
            </div>
            <div>
              <label
                htmlFor="setting-long-break"
                className="block text-xs font-medium text-[#A0ADA9] mb-1.5"
              >
                Long Break (minutes)
              </label>
              <input
                id="setting-long-break"
                type="number"
                min={1}
                max={240}
                value={longBreakMin}
                onChange={(e) => setLongBreakMin(Math.max(1, Number(e.target.value) || 1))}
                className="w-full rounded-xl bg-[#1A2128] border border-[#343F49] px-3.5 py-2.5 text-sm font-mono-tabular text-[#F1F5F4] focus:outline-none focus:ring-2 focus:ring-[#8BE0BC]/40 focus:border-[#8BE0BC]"
              />
            </div>
          </div>

          <div className="pt-3 space-y-3 border-t border-[#343F49]">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <div className="text-sm font-medium text-[#F1F5F4]">
                  Desktop Notifications (Silent)
                </div>
                <div className="text-xs text-[#A0ADA9]">
                  Notify when countdown or break duration finishes without playing sound.
                </div>
              </div>
              <input
                type="checkbox"
                checked={notificationsEnabled}
                onChange={(e) => setNotificationsEnabled(e.target.checked)}
                className="w-4 h-4 accent-[#8BE0BC]"
              />
            </label>

            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <div className="text-sm font-medium text-[#F1F5F4]">Automatic Local Backups</div>
                <div className="text-xs text-[#A0ADA9]">
                  Automatically back up the SQLite database safely using SQLite online backup.
                </div>
              </div>
              <input
                type="checkbox"
                checked={autoBackup}
                onChange={(e) => setAutoBackup(e.target.checked)}
                className="w-4 h-4 accent-[#8BE0BC]"
              />
            </label>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onNavigate('goals')}
              className="text-xs font-medium text-[#8ABEFF] hover:text-[#B3D4FF]"
            >
              Configure Daily &amp; Weekly Goals
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-xl bg-[#8BE0BC] hover:bg-[#7AD5AE] text-xs font-semibold text-[#11221B] transition-colors"
            >
              {busy ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </div>

        {/* Application Info & Storage */}
        <div className="rounded-2xl bg-[#242D36] border border-[#343F49] shadow-sm shadow-black/20 p-6 space-y-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#8ABEFF]/14 flex items-center justify-center">
              <Database className="w-4 h-4 text-[#8ABEFF]" />
            </div>
            <h2 className="text-base font-semibold text-[#F1F5F4]">
              Application &amp; Local Storage
            </h2>
          </div>

          <div className="rounded-xl bg-[#1A2128] border border-[#343F49] divide-y divide-[#343F49] text-xs">
            <div className="p-3.5 flex items-center justify-between gap-4">
              <span className="text-[#A0ADA9]">Application</span>
              <span className="font-medium text-[#F1F5F4]">
                FocusDesk v{settings?.app_version ?? '1.0.0'} (Offline Windows 11)
              </span>
            </div>
            <div className="p-3.5 flex items-center justify-between gap-4">
              <span className="text-[#A0ADA9]">Automatic Backup Status</span>
              <span className={autoBackup ? 'text-[#8BE0BC] font-semibold' : 'text-[#A0ADA9]'}>
                {autoBackup ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div className="p-3.5 flex items-center justify-between gap-4">
              <span className="text-[#A0ADA9]">Last Successful Backup</span>
              <span className="font-mono-tabular text-[#F1F5F4]">
                {settings?.last_backup_at
                  ? new Date(settings.last_backup_at).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'No backup created yet'}
              </span>
            </div>
            <div className="p-3.5 space-y-1">
              <div className="text-[#A0ADA9]">SQLite Database Path</div>
              <div className="font-mono-tabular text-[11px] text-[#F1F5F4] break-all">
                {settings?.database_path ?? '—'}
              </div>
            </div>
            <div className="p-3.5 space-y-1">
              <div className="text-[#A0ADA9]">Local Backup Folder</div>
              <div className="font-mono-tabular text-[11px] text-[#F1F5F4] break-all">
                {settings?.backup_dir ?? '—'}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleBackupNow()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#8BE0BC] hover:bg-[#7AD5AE] text-xs font-semibold text-[#11221B] transition-colors"
            >
              <HardDriveDownload className="w-4 h-4" />
              <span>Create Backup Now</span>
            </button>
            {api.isElectron && (
              <button
                type="button"
                onClick={() => void api.openBackupFolder()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#343F49] bg-[#1C232B] text-xs font-medium text-[#F1F5F4] hover:bg-[#2C3742] transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
                <span>Open Backup Folder</span>
              </button>
            )}
          </div>
        </div>
      </form>

      {/* Restore Backup List */}
      <div className="rounded-2xl bg-[#242D36] border border-[#343F49] shadow-sm shadow-black/20 overflow-hidden">
        <div className="px-6 py-4 border-b border-[#343F49] flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#F1F5F4]">Available Local Backups</h2>
            <p className="text-xs text-[#A0ADA9]">
              Restoring creates a pre-restore safety backup of your current database first.
            </p>
          </div>
          <span className="text-xs text-[#A0ADA9] tabular-nums">{backups.length} files</span>
        </div>

        {backups.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#A0ADA9]">
            No backup files found yet. Click &ldquo;Create Backup Now&rdquo; above.
          </div>
        ) : (
          <div className="divide-y divide-[#343F49]">
            {backups.map((b) => (
              <div
                key={b.filename}
                className="px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs hover:bg-[#2A343E] transition-colors"
              >
                <div>
                  <div className="font-mono-tabular font-medium text-[#F1F5F4]">{b.filename}</div>
                  <div className="mt-0.5 text-[#A0ADA9] tabular-nums">
                    {new Date(b.created_at).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {' · '}
                    {(b.size_bytes / 1024).toFixed(1)} KB
                    {' · '}
                    <span className="capitalize">{b.reason}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRestoreTarget(b)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#343F49] bg-[#1A2128] text-xs font-medium text-[#F1F5F4] hover:bg-[#8ABEFF]/15 hover:border-[#8ABEFF]/40 hover:text-[#8ABEFF] transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restore</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(restoreTarget)}
        title="Restore SQLite Backup?"
        message={
          restoreTarget
            ? `Restore FocusDesk data from "${restoreTarget.filename}"? A pre-restore backup of your current database will be created automatically before restoring.`
            : ''
        }
        confirmLabel="Restore Backup"
        destructive={false}
        busy={busy}
        onCancel={() => setRestoreTarget(null)}
        onConfirm={() => void handleConfirmRestore()}
      />
    </div>
  );
}
