'use client';

import { useState, useRef, useEffect } from 'react';
import { Menu, ChevronDown, LogOut, Settings, Search, Shield, ArrowRight } from 'lucide-react';
import NotificationBell from './NotificationBell';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import Link from 'next/link';
import CreditGauge from '@/components/ui/CreditGauge';
import ThemeToggle from '@/components/ui/ThemeToggle';
import Toast from '@/components/ui/Toast';

const PAGES: Array<{ path: string; label: string; keywords: string[] }> = [
  { path: '/dashboard',              label: 'Dashboard',      keywords: ['dashboard', 'home', 'accueil', 'inicio', 'início'] },
  { path: '/dashboard/inbox',        label: 'Inbox',          keywords: ['inbox', 'mail', 'email', 'messagerie', 'mensajes', 'caixa', 'boîte'] },
  { path: '/dashboard/jobs',         label: 'Job Search',     keywords: ['jobs', 'job search', 'emploi', 'recherche', 'empleos', 'empregos', 'recherche emploi'] },
  { path: '/dashboard/cv-builder',   label: 'CV Builder',     keywords: ['cv', 'resume', 'cv builder', 'curriculum', 'currículo'] },
  { path: '/dashboard/cover-letters',label: 'Cover Letters',  keywords: ['cover letter', 'lettre', 'motivation', 'carta', 'cartas', 'cover'] },
  { path: '/dashboard/auto-apply',   label: 'Auto Apply',     keywords: ['auto apply', 'automatique', 'auto', 'autopostule'] },
  { path: '/dashboard/assistant',    label: 'AI Assistant',   keywords: ['ai', 'assistant', 'chat', 'aide', 'asistente'] },
  { path: '/dashboard/ai-matches',   label: 'AI Job Matches', keywords: ['matches', 'matching', 'ai matches', 'job matches', 'correspondances'] },
  { path: '/dashboard/interview-coach', label: 'Interview Coach', keywords: ['interview', 'coach', 'entretien', 'entrevista'] },
  { path: '/dashboard/ats-score',    label: 'ATS Score',      keywords: ['ats', 'score', 'ats score', 'tracking', 'analyse'] },
  { path: '/dashboard/job-tracker',  label: 'Job Tracker',    keywords: ['tracker', 'job tracker', 'suivi', 'seguimiento', 'rastreador'] },
  { path: '/dashboard/analytics',    label: 'Analytics',      keywords: ['analytics', 'stats', 'statistiques', 'estadísticas', 'estatísticas'] },
  { path: '/dashboard/settings',     label: 'Settings',       keywords: ['settings', 'preferences', 'paramètres', 'config', 'configuración', 'configurações'] },
  { path: '/dashboard/support',      label: 'Support',        keywords: ['support', 'help', 'aide', 'ayuda', 'ajuda'] },
];

interface Props {
  user: SupabaseUser;
  onMenuClick: () => void;
  initialAvatarUrl: string | null;
  initialEmailAlias: string | null;
}

export default function DashboardTopbar({ user, onMenuClick, initialAvatarUrl, initialEmailAlias }: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [avatarUrl, setAvatarUrl]       = useState<string | null>(initialAvatarUrl);
  const [emailAlias, setEmailAlias]     = useState<string | null>(initialEmailAlias);
  const [searchQuery, setSearchQuery]   = useState('');
  const [toastData, setToastData]       = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router   = useRouter();
  const pathname = usePathname();
  const locale   = pathname.split('/')[1] || 'en';

  const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? 'hamzadehamnia@gmail.com';
  const isAdmin  = user.email === ADMIN_EMAIL;
  const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
  const firstName   = displayName.split(' ')[0];
  const initials    = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

  // Listen for avatar updates dispatched by SettingsClient after a successful upload
  useEffect(() => {
    const handler = (e: Event) => {
      const url = (e as CustomEvent<{ url: string }>).detail?.url;
      if (url) setAvatarUrl(url);
    };
    window.addEventListener('avatar-updated', handler);
    return () => window.removeEventListener('avatar-updated', handler);
  }, []);

  // If no alias was provided at SSR time, fetch it client-side (covers stale-cache scenarios)
  useEffect(() => {
    if (emailAlias) return;
    const supabase = createClient();
    supabase.from('profiles').select('email_alias').eq('id', user.id).single()
      .then(({ data }) => { if (data?.email_alias) setEmailAlias(data.email_alias as string); });
  }, [user.id, emailAlias]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const findMatchingPage = (query: string) => {
    const q = query.toLowerCase().trim();
    if (!q) return null;
    return PAGES.find(page =>
      page.keywords.some(kw => kw.includes(q) || q.includes(kw))
    ) ?? null;
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    setSearchQuery('');
    if (!q) return;
    const match = findMatchingPage(q);
    if (match) {
      router.push(`/${locale}${match.path}`);
    } else {
      setToastData({ message: `No matching page found for "${q}"`, type: 'error' });
    }
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push(`/${locale}/auth/login`);
    router.refresh();
  };

  return (
    <>
    <header className="sticky top-0 z-20 h-16 flex items-center justify-between gap-4 px-4 sm:px-6
      bg-white/90 dark:bg-[#0F172A]/90 backdrop-blur-md
      border-b border-gray-100 dark:border-[#1F2937]">

      {/* Left: hamburger + greeting */}
      <div className="flex items-center gap-3 min-w-0">
        <button onClick={onMenuClick} aria-label="Toggle sidebar"
          className="lg:hidden p-2 rounded-xl text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <Menu size={20} />
        </button>

        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            Good morning, <span className="text-[#7C3AED] dark:text-violet-400">{firstName}</span> 👋
          </h1>
          <p className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block leading-none mt-0.5">
            Here&apos;s what&apos;s happening with your job search today.
          </p>
        </div>
      </div>

      {/* Center: search bar */}
      <div className="hidden md:flex flex-1 max-w-sm mx-4">
        <form onSubmit={handleSearch} className="relative w-full">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search jobs, CVs, applications…"
            className="w-full pl-9 pr-10 py-2 text-sm rounded-xl border border-gray-200 dark:border-[#1F2937]
              bg-gray-50 dark:bg-[#111827] text-gray-900 dark:text-white
              placeholder:text-gray-400 dark:placeholder:text-gray-600
              focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500
              transition-all duration-150"
          />
          <button
            type="submit"
            disabled={!searchQuery.trim()}
            aria-label="Search"
            className="absolute right-2 top-1/2 -translate-y-1/2
              w-6 h-6 flex items-center justify-center rounded-lg
              bg-violet-600 hover:bg-violet-700
              disabled:opacity-0 disabled:pointer-events-none
              transition-all duration-150"
          >
            <ArrowRight size={12} className="text-white" />
          </button>
        </form>
      </div>

      {/* Right: credits + theme + bell + avatar */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {isAdmin && (
          <Link href={`/${locale}/dashboard/admin`}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wide transition-colors shadow-sm shadow-red-500/20">
            <Shield size={11} />
            ADMIN
          </Link>
        )}
        <div className="hidden sm:block">
          <CreditGauge />
        </div>

        <ThemeToggle />

        {/* Notification bell */}
        <NotificationBell />

        {/* Avatar dropdown */}
        <div ref={dropdownRef} className="relative">
          <button onClick={() => setDropdownOpen((v) => !v)}
            aria-expanded={dropdownOpen}
            className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-150">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="w-7 h-7 rounded-full object-cover shadow-sm ring-1 ring-violet-200 dark:ring-violet-800"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] flex items-center justify-center text-white text-xs font-bold shadow-sm">
                {initials}
              </div>
            )}
            <span className="hidden sm:block text-sm font-medium text-gray-700 dark:text-gray-300 max-w-[80px] truncate">
              {firstName}
            </span>
            <ChevronDown size={13}
              className={`text-gray-400 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-52 z-50
              bg-white dark:bg-[#111827]
              border border-gray-200 dark:border-[#1F2937]
              rounded-2xl shadow-xl shadow-gray-200/60 dark:shadow-black/40
              py-1.5 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 dark:border-[#1F2937]">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{displayName}</p>
                <p className="text-xs text-gray-400 truncate">
                  {emailAlias ? `${emailAlias}@getjobvero.com` : user.email}
                </p>
              </div>
              <div className="py-1">
                <Link href={`/${locale}/dashboard/settings`} onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <Settings size={14} className="text-gray-400" /> Settings
                </Link>
              </div>
              <div className="border-t border-gray-100 dark:border-[#1F2937] pt-1">
                <button onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors duration-150">
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>

    {toastData && (
      <Toast
        message={toastData.message}
        type={toastData.type}
        onClose={() => setToastData(null)}
      />
    )}
  </>
  );
}
