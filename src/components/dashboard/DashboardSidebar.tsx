'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  LayoutDashboard, FileText, Send, Mail, Sparkles, Briefcase,
  ClipboardList, BarChart3, Inbox, Mic, Settings, LogOut,
  X, Zap, Crown, ChevronLeft, ChevronRight, Target, Search, Shield, LifeBuoy,
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';

interface Props {
  locale: string;
  user: User;
  onClose?: () => void;
}

const NAV = [
  { href: (l: string) => `/${l}/dashboard`,               label: 'Dashboard',       icon: LayoutDashboard, exact: true,  badge: null  },
  { href: (l: string) => `/${l}/dashboard/inbox`,         label: 'Inbox',           icon: Inbox,           exact: false, badge: null  },
  { href: (l: string) => `/${l}/dashboard/jobs`,          label: 'Job Search',      icon: Search,          exact: false, badge: null  },
  { href: (l: string) => `/${l}/dashboard/cv-builder`,    label: 'CV Builder',      icon: FileText,        exact: false, badge: null  },
  { href: (l: string) => `/${l}/dashboard/cover-letters`, label: 'Cover Letters',   icon: Mail,            exact: false, badge: null  },
  { href: (l: string) => `/${l}/dashboard/auto-apply`,    label: 'Auto Apply',      icon: Send,            exact: false, badge: null  },
  { href: (l: string) => `/${l}/dashboard/assistant`,     label: 'AI Assistant',    icon: Sparkles,        exact: false, badge: null  },
  { href: (l: string) => `/${l}/dashboard/ai-matches`,    label: 'AI Job Matches',  icon: Briefcase,       exact: false, badge: null  },
  { href: (l: string) => `/${l}/dashboard/interview-coach`, label: 'Interview Coach', icon: Mic,             exact: false, badge: 'Pro' },
  { href: (l: string) => `/${l}/dashboard/ats-score`,      label: 'ATS Score',       icon: Target,          exact: false, badge: null  },
  { href: (l: string) => `/${l}/dashboard/job-tracker`,   label: 'Job Tracker',     icon: ClipboardList,   exact: false, badge: null  },
  { href: (l: string) => `/${l}/dashboard/analytics`,     label: 'Analytics',       icon: BarChart3,       exact: false, badge: null  },
  { href: (l: string) => `/${l}/dashboard/settings`,      label: 'Settings',        icon: Settings,        exact: false, badge: null  },
  { href: (l: string) => `/${l}/dashboard/support`,       label: 'Support',         icon: LifeBuoy,        exact: false, badge: null  },
];

export default function DashboardSidebar({ locale, user, onClose }: Props) {
  const pathname   = usePathname();
  const router     = useRouter();
  const [collapsed,     setCollapsed]    = useState(false);
  const [inboxUnread,   setInboxUnread]  = useState(0);
  const [trackerCount,  setTrackerCount] = useState(0);
  const [pendingCount,  setPendingCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    const refresh  = () =>
      supabase
        .from('message_threads')
        .select('unread_count')
        .then(({ data }) => {
          const total = (data ?? []).reduce((s, t) => s + ((t as { unread_count: number }).unread_count ?? 0), 0);
          setInboxUnread(total);
        });

    refresh();

    const ch = supabase
      .channel('sidebar-inbox-badge')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'message_threads' },
        refresh
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    const supabase = createClient();

    const refreshTracker = () =>
      supabase
        .from('applications')
        .select('id', { count: 'exact', head: true })
        .neq('status', 'rejected')
        .then(({ count }) => setTrackerCount(count ?? 0));

    const refreshPending = () =>
      supabase
        .from('applications')
        .select('id', { count: 'exact', head: true })
        .eq('send_status', 'no_email')
        .then(({ count }) => setPendingCount(count ?? 0));

    const refresh = () => { refreshTracker(); refreshPending(); };

    refresh();

    const ch = supabase
      .channel('sidebar-tracker-badge')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'applications' },
        refresh
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push(`/${locale}/auth/login`);
    router.refresh();
  };

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? 'hamzadehamnia@gmail.com';
  const isAdmin = user.email === ADMIN_EMAIL;

  return (
    <aside
      className={`h-full min-h-screen flex flex-col bg-white dark:bg-[#111827] border-r border-gray-100 dark:border-[#1F2937] flex-shrink-0 transition-all duration-200 overflow-hidden
        ${collapsed ? 'w-16' : 'w-60'}`}
    >
      {/* ── Logo / Header ───────────────────────────── */}
      <div className="h-16 flex items-center border-b border-gray-100 dark:border-[#1F2937] flex-shrink-0">
        {collapsed ? (
          /* Collapsed: Zap icon + expand button stacked */
          <div className="w-full flex flex-col items-center justify-center gap-1 py-1">
            <Link href={`/${locale}`}>
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] flex items-center justify-center shadow-md shadow-violet-500/30">
                <Zap size={13} className="text-white" />
              </div>
            </Link>
            <button
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
              className="p-0.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        ) : (
          /* Expanded: logo + text + collapse button */
          <div className="flex items-center justify-between w-full px-5">
            <Link href={`/${locale}`} className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] flex items-center justify-center shadow-lg shadow-violet-500/30 flex-shrink-0">
                <Zap size={15} className="text-white" />
              </div>
              <span className="text-lg font-bold bg-gradient-to-r from-[#7C3AED] to-[#4F46E5] bg-clip-text text-transparent truncate">
                Jobvero
              </span>
            </Link>
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button
                onClick={() => setCollapsed(true)}
                aria-label="Collapse sidebar"
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <ChevronLeft size={17} />
              </button>
              <button
                onClick={onClose}
                aria-label="Close menu"
                className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X size={17} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Navigation ──────────────────────────────── */}
      <nav className={`flex-1 py-4 space-y-0.5 overflow-y-auto ${collapsed ? 'px-2' : 'px-3'}`}>
        {NAV.map(({ href, label, icon: Icon, exact, badge }) => {
          const h      = href(locale);
          const active = isActive(h, exact);
          const dynamicBadge = label === 'Inbox' && inboxUnread > 0
            ? String(inboxUnread > 99 ? '99+' : inboxUnread)
            : label === 'Job Tracker' && trackerCount > 0
            ? String(trackerCount > 99 ? '99+' : trackerCount)
            : label === 'Auto Apply' && pendingCount > 0
            ? String(pendingCount > 99 ? '99+' : pendingCount)
            : badge;
          const isNumericBadge = dynamicBadge !== null && dynamicBadge !== 'New' && dynamicBadge !== 'Pro';
          const isAmberBadge   = label === 'Auto Apply' && isNumericBadge;

          return (
            <Link
              key={h}
              href={h}
              title={collapsed ? label : undefined}
              className={`relative flex items-center rounded-xl text-sm font-medium transition-all duration-150
                ${collapsed ? 'justify-center py-2.5' : 'gap-3 px-3 py-2.5'}
                ${active
                  ? 'bg-gradient-to-r from-violet-600/10 to-indigo-600/5 text-[#7C3AED] dark:text-violet-400 font-semibold'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800/60'
                }`}
            >
              {/* Icon with optional numeric dot */}
              <div className="relative flex-shrink-0">
                <Icon
                  size={17}
                  className={`transition-colors ${active ? 'text-[#7C3AED] dark:text-violet-400' : 'text-gray-400 dark:text-gray-500'}`}
                />
                {collapsed && dynamicBadge && isNumericBadge && (
                  <span className={`absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 rounded-full text-white text-[8px] font-bold flex items-center justify-center px-0.5 leading-none ${isAmberBadge ? 'bg-amber-500' : 'bg-red-500'}`}>
                    {dynamicBadge}
                  </span>
                )}
              </div>

              {/* Label + badge — only in expanded mode */}
              {!collapsed && (
                <>
                  <span className="truncate">{label}</span>
                  {dynamicBadge && (
                    <span className={`ml-auto px-2 py-0.5 text-[10px] font-bold uppercase rounded-full flex-shrink-0 ${
                      dynamicBadge === 'Pro'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                        : dynamicBadge === 'New'
                        ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                        : isAmberBadge
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                        : 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300'
                    }`}>
                      {dynamicBadge}
                    </span>
                  )}
                  {!badge && active && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#7C3AED] flex-shrink-0" />
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── Admin link (admin only) ── */}
      {isAdmin && (
        <div className={`border-t border-gray-100 dark:border-[#1F2937] pt-2 pb-1 ${collapsed ? 'px-2' : 'px-3'}`}>
          <Link
            href={`/${locale}/dashboard/admin`}
            title={collapsed ? 'Admin Panel' : undefined}
            className={`relative flex items-center rounded-xl text-sm font-medium transition-all duration-150
              ${collapsed ? 'justify-center py-2.5' : 'gap-3 px-3 py-2.5'}
              ${isActive(`/${locale}/dashboard/admin`, false)
                ? 'bg-gradient-to-r from-red-600/10 to-rose-600/5 text-red-700 dark:text-red-400 font-semibold'
                : 'text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30'
              }`}
          >
            <Shield size={17} className="flex-shrink-0" />
            {!collapsed && (
              <>
                <span className="truncate">Admin Panel</span>
                <span className="ml-auto px-1.5 py-0.5 text-[9px] font-black uppercase rounded bg-red-600 text-white flex-shrink-0">
                  ADMIN
                </span>
              </>
            )}
            {collapsed && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-600 ring-2 ring-white dark:ring-[#111827]" />
            )}
          </Link>
        </div>
      )}

      {/* ── Trial badge + user profile (hidden when collapsed) ── */}
      {!collapsed && (
        <>
          <div className="mx-3 mb-3 p-3.5 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Crown size={14} className="text-yellow-300" />
              <span className="text-xs font-bold uppercase tracking-wide">Free Trial</span>
            </div>
            <p className="text-xs text-white/80 mb-3 leading-relaxed">
              Upgrade to unlock unlimited AI credits and premium templates.
            </p>
            <Link
              href={`/${locale}/pricing`}
              className="block w-full text-center bg-white/20 hover:bg-white/30 text-white text-xs font-semibold py-2 rounded-xl transition-colors duration-150"
            >
              Upgrade to Pro
            </Link>
          </div>

          <div className="px-3 pb-4 border-t border-gray-100 dark:border-[#1F2937] pt-3">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all duration-150"
            >
              <LogOut size={16} className="flex-shrink-0" />
              Sign out
            </button>
          </div>
        </>
      )}

      {/* Logout icon only — shown when collapsed */}
      {collapsed && (
        <div className="pb-4 px-2 border-t border-gray-100 dark:border-[#1F2937] pt-3">
          <button
            onClick={handleLogout}
            title="Sign out"
            className="w-full flex items-center justify-center py-2.5 rounded-xl text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all duration-150"
          >
            <LogOut size={16} />
          </button>
        </div>
      )}
    </aside>
  );
}
