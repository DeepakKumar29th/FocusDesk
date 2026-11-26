import {
  BarChart3,
  Clock,
  History,
  LayoutDashboard,
  Settings,
  Target,
} from 'lucide-react';
import { formatClock } from '../../shared/timerMath';
import type { BreakRecord, PageId, StudySession } from '../../shared/types';
import { Logo } from './Logo';

interface SidebarProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  activeSession: StudySession | null;
  activeBreak: BreakRecord | null;
  sessionDisplaySeconds: number;
  breakRemainingSeconds: number | null;
}

const NAV_ITEMS: Array<{ id: PageId; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'timer', label: 'Study Timer', icon: Clock },
  { id: 'history', label: 'Study History', icon: History },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'goals', label: 'Goals', icon: Target },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar({
  activePage,
  onNavigate,
  activeSession,
  activeBreak,
  sessionDisplaySeconds,
  breakRemainingSeconds,
}: SidebarProps) {
  const primaryItems = NAV_ITEMS.filter((item) => item.id !== 'settings');
  const settingsItem = NAV_ITEMS.find((item) => item.id === 'settings')!;
  const SettingsIcon = settingsItem.icon;
  const isSettingsActive = activePage === 'settings';

  return (
    <aside className="w-[248px] shrink-0 bg-[#1C232B] border-r border-[#343F49] flex flex-col justify-between select-none min-h-screen">
      <div className="p-5">
        <div className="flex items-center gap-3 pb-5 mb-5 border-b border-[#343F49]">
          <Logo className="w-8 h-8 shrink-0" />
          <span className="text-[17px] font-semibold tracking-tight text-[#F1F5F4] whitespace-nowrap">
            FocusDesk
          </span>
        </div>

        <nav aria-label="Primary Navigation" className="flex flex-col gap-1.5">
          {primaryItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`group flex items-center gap-3 w-full px-3.5 py-2.5 rounded-xl text-[14px] font-medium transition-colors whitespace-nowrap text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8BE0BC] ${
                  isActive
                    ? 'bg-[#8BE0BC]/14 text-[#8BE0BC] border border-[#8BE0BC]/35'
                    : 'text-[#A0ADA9] hover:text-[#F1F5F4] hover:bg-[#242D36] border border-transparent'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-[#8BE0BC]' : 'text-[#A0ADA9] group-hover:text-[#F1F5F4]'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="p-4 space-y-3">
        {(activeSession || activeBreak) && (
          <div
            className={`p-3.5 rounded-xl border ${
              activeBreak
                ? 'bg-[#F5C563]/10 border-[#F5C563]/35'
                : 'bg-[#8BE0BC]/10 border-[#8BE0BC]/30'
            }`}
          >
            {activeBreak ? (
              <button
                type="button"
                onClick={() => onNavigate('timer')}
                className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F6D07A] rounded-lg"
              >
                <div className="text-xs font-medium text-[#F6D07A]">
                  {activeBreak.break_type === 'short' ? 'Short Break Active' : 'Long Break Active'}
                </div>
                <div className="mt-1 text-lg font-semibold font-mono-tabular text-[#F1F5F4]">
                  {formatClock(breakRemainingSeconds ?? 0)}
                </div>
                <div className="mt-0.5 text-xs text-[#A0ADA9]">Open timer controls</div>
              </button>
            ) : activeSession ? (
              <button
                type="button"
                onClick={() => onNavigate('timer')}
                className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8BE0BC] rounded-lg"
              >
                <div className="text-xs font-medium text-[#8BE0BC]">
                  {activeSession.status === 'running' ? 'Session Running' : 'Session Paused'}
                </div>
                <div className="mt-1 text-lg font-semibold font-mono-tabular text-[#F1F5F4]">
                  {formatClock(sessionDisplaySeconds)}
                </div>
                <div className="mt-0.5 text-xs text-[#A0ADA9] truncate">
                  {activeSession.subject_name}
                  {activeSession.study_note ? ` · ${activeSession.study_note}` : ''}
                </div>
              </button>
            ) : null}
          </div>
        )}

        <div className="pt-3 border-t border-[#343F49]">
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            aria-current={isSettingsActive ? 'page' : undefined}
            className={`group flex items-center gap-3 w-full px-3.5 py-2.5 rounded-xl text-[14px] font-medium transition-colors whitespace-nowrap text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8BE0BC] ${
              isSettingsActive
                ? 'bg-[#8BE0BC]/14 text-[#8BE0BC] border border-[#8BE0BC]/35'
                : 'text-[#A0ADA9] hover:text-[#F1F5F4] hover:bg-[#242D36] border border-transparent'
            }`}
          >
            <SettingsIcon
              className={`w-4 h-4 shrink-0 ${
                isSettingsActive ? 'text-[#8BE0BC]' : 'text-[#A0ADA9] group-hover:text-[#F1F5F4]'
              }`}
            />
            <span className="truncate">{settingsItem.label}</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
