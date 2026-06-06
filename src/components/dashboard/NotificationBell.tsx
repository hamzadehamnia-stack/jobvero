'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  Bell, Briefcase, CheckCircle, FileText, Mail,
  AlertTriangle, Sparkles, CheckCheck, BellOff, X,
  CalendarCheck, PenLine,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'job_match' | 'application_sent' | 'cv_saved'
  | 'cover_letter' | 'credits_low' | 'welcome'
  | 'follow_up_reminder' | 'interview_reminder';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

// ─── Icon map ─────────────────────────────────────────────────────────────────

export const TYPE_META: Record<NotificationType, {
  icon: React.ElementType;
  color: string;
  bg: string;
  label: string;
}> = {
  job_match:           { icon: Briefcase,     color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-950/40',     label: 'Job Match'          },
  application_sent:    { icon: CheckCircle,   color: 'text-emerald-500',bg: 'bg-emerald-50 dark:bg-emerald-950/40',label: 'Application Sent'  },
  cv_saved:            { icon: FileText,      color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-950/40', label: 'CV Saved'           },
  cover_letter:        { icon: Mail,          color: 'text-cyan-500',   bg: 'bg-cyan-50 dark:bg-cyan-950/40',     label: 'Cover Letter'       },
  credits_low:         { icon: AlertTriangle, color: 'text-amber-500',  bg: 'bg-amber-50 dark:bg-amber-950/40',   label: 'Credits Warning'    },
  welcome:             { icon: Sparkles,      color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-950/40', label: 'Welcome'            },
  follow_up_reminder:  { icon: PenLine,       color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-950/40', label: 'Follow-up Reminder' },
  interview_reminder:  { icon: CalendarCheck, color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-950/40', label: 'Interview Reminder' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (m < 1)  return 'Just now';
  if (h < 1)  return `${m}m ago`;
  if (d < 1)  return `${h}h ago`;
  if (d < 7)  return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NotificationBell() {
  const t        = useTranslations('notifications');
  const pathname = usePathname();
  const locale   = pathname.split('/')[1] || 'en';
  const supabase = useMemo(() => createClient(), []);

  const [open, setOpen]               = useState(false);
  const [items, setItems]             = useState<AppNotification[]>([]);
  const [markingAll, setMarkingAll]   = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const unreadCount = items.filter(n => !n.read).length;
  const badgeCount  = Math.min(unreadCount, 99);

  // ── Fetch latest 5 ──────────────────────────────────────────────────────
  const fetchRecent = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, message, read, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    if (data) setItems(data as AppNotification[]);
  }, [supabase]);

  useEffect(() => { fetchRecent(); }, [fetchRecent]);

  // ── Realtime subscription ────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('notifications-bell')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'notifications',
      }, () => fetchRecent())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, fetchRecent]);

  // ── Click outside ────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Mark all read ────────────────────────────────────────────────────────
  const markAllRead = async () => {
    setMarkingAll(true);
    const unreadIds = items.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length) {
      await supabase
        .from('notifications')
        .update({ read: true })
        .in('id', unreadIds);
      setItems(prev => prev.map(n => ({ ...n, read: true })));
    }
    setMarkingAll(false);
  };

  // ── Mark one read ────────────────────────────────────────────────────────
  const markRead = async (id: string) => {
    setItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    await supabase.from('notifications').update({ read: true }).eq('id', id);
  };

  return (
    <div ref={dropRef} className="relative">
      {/* Bell button */}
      <button
        aria-label="Notifications"
        onClick={() => setOpen(v => !v)}
        className="relative p-2.5 rounded-xl text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-150"
      >
        <Bell size={17} />
        {badgeCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-0.5 ring-2 ring-white dark:ring-[#0F172A] leading-none">
            {badgeCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 z-50
          bg-white dark:bg-[#111827]
          border border-gray-200 dark:border-[#1F2937]
          rounded-2xl shadow-2xl shadow-gray-200/60 dark:shadow-black/50
          overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-[#1F2937]">
            <div className="flex items-center gap-2">
              <Bell size={14} className="text-violet-500" />
              <span className="text-sm font-semibold text-gray-900 dark:text-white">{t('title')}</span>
              {badgeCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400">
                  {badgeCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  disabled={markingAll}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors disabled:opacity-50"
                >
                  <CheckCheck size={11} /> {t('markAllRead')}
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {/* List */}
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <BellOff size={28} className="text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('empty')}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t('emptyDesc')}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-[#1F2937] max-h-[320px] overflow-y-auto">
              {items.map((n) => {
                const meta  = TYPE_META[n.type] ?? TYPE_META.welcome;
                const Icon  = meta.icon;
                const tKey  = `types.${n.type}` as const;
                return (
                  <div
                    key={n.id}
                    onClick={() => { if (!n.read) markRead(n.id); }}
                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors
                      ${!n.read
                        ? 'bg-violet-50/50 dark:bg-violet-950/10 hover:bg-violet-50 dark:hover:bg-violet-950/20'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'
                      }`}
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${meta.bg}`}>
                      <Icon size={15} className={meta.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className={`text-xs font-semibold truncate ${!n.read ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                          {t(`${tKey}.title` as Parameters<typeof t>[0])}
                        </p>
                        {!n.read && (
                          <span className="w-1.5 h-1.5 rounded-full bg-violet-500 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">
                        {t(`${tKey}.message` as Parameters<typeof t>[0])}
                      </p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                        {relativeTime(n.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-gray-100 dark:border-[#1F2937] px-4 py-2.5">
            <Link
              href={`/${locale}/dashboard/inbox`}
              onClick={() => setOpen(false)}
              className="block text-center text-xs font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
            >
              {t('seeAll')} →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
