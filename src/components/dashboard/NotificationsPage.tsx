'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import {
  Bell, BellOff, Trash2, Check, Loader2,
} from 'lucide-react';
import { TYPE_META, type AppNotification, type NotificationType } from './NotificationBell';

type Tab = 'all' | 'unread' | 'read';

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

export default function NotificationsPage() {
  const t        = useTranslations('notifications');
  const supabase = useMemo(() => createClient(), []);

  const [allItems,  setAllItems]  = useState<AppNotification[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState<Tab>('all');
  const [deleting,  setDeleting]  = useState<string | null>(null);

  // ── Fetch all ────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, message, read, created_at')
      .order('created_at', { ascending: false });
    if (data) setAllItems(data as AppNotification[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Filtered list ────────────────────────────────────────────────────────
  const filtered = allItems.filter(n => {
    if (tab === 'unread') return !n.read;
    if (tab === 'read')   return n.read;
    return true;
  });

  const unreadCount = allItems.filter(n => !n.read).length;

  // ── Mark one read ────────────────────────────────────────────────────────
  const markRead = async (id: string) => {
    setAllItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    await supabase.from('notifications').update({ read: true }).eq('id', id);
  };

  // ── Mark all read ────────────────────────────────────────────────────────
  const markAllRead = async () => {
    const ids = allItems.filter(n => !n.read).map(n => n.id);
    if (!ids.length) return;
    setAllItems(prev => prev.map(n => ({ ...n, read: true })));
    await supabase.from('notifications').update({ read: true }).in('id', ids);
  };

  // ── Delete one ───────────────────────────────────────────────────────────
  const deleteOne = async (id: string) => {
    setDeleting(id);
    await supabase.from('notifications').delete().eq('id', id);
    setAllItems(prev => prev.filter(n => n.id !== id));
    setDeleting(null);
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: 'all',    label: t('tabs.all')    },
    { id: 'unread', label: t('tabs.unread') },
    { id: 'read',   label: t('tabs.read')   },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto w-full">

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('title')}</h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">{t('subtitle')}</p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold
              bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400
              text-white shadow-lg shadow-violet-500/20 transition-all"
          >
            <Check size={14} /> {t('markAllRead')}
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 p-1 bg-gray-100 dark:bg-gray-800/60 rounded-xl w-fit">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150
              ${tab === id
                ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
          >
            {label}
            {id === 'unread' && unreadCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400">
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-violet-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
            <BellOff size={28} className="text-gray-300 dark:text-gray-600" />
          </div>
          <p className="text-base font-semibold text-gray-600 dark:text-gray-400">
            {tab === 'unread' ? t('noUnread') : t('empty')}
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 max-w-xs leading-relaxed">
            {tab === 'unread' ? t('noUnreadDesc') : t('emptyDesc')}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => {
            const meta = TYPE_META[n.type as NotificationType] ?? TYPE_META.welcome;
            const Icon = meta.icon;
            const tKey = `types.${n.type}` as const;

            return (
              <div
                key={n.id}
                className={`flex items-start gap-4 p-4 rounded-2xl border transition-all duration-150
                  ${!n.read
                    ? 'bg-violet-50/60 dark:bg-violet-950/10 border-violet-100 dark:border-violet-900/30'
                    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800'
                  }`}
              >
                {/* Icon */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
                  <Icon size={18} className={meta.color} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className={`text-sm font-semibold ${!n.read ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                      {t(`${tKey}.title` as Parameters<typeof t>[0])}
                    </p>
                    {!n.read && (
                      <span className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                    {t(`${tKey}.message` as Parameters<typeof t>[0])}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                    {relativeTime(n.created_at)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!n.read && (
                    <button
                      type="button"
                      onClick={() => markRead(n.id)}
                      title={t('markRead')}
                      className="p-2 rounded-lg text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                    >
                      <Check size={15} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => deleteOne(n.id)}
                    disabled={deleting === n.id}
                    title={t('deleteNotification')}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                  >
                    {deleting === n.id
                      ? <Loader2 size={15} className="animate-spin" />
                      : <Trash2 size={15} />
                    }
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bell footer hint */}
      {!loading && allItems.length > 0 && (
        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
          <Bell size={11} />
          <span>{t('footerHint')}</span>
        </div>
      )}
    </div>
  );
}
