'use client';

import { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import DashboardSidebar from './DashboardSidebar';
import DashboardTopbar from './DashboardTopbar';
import OnboardingModal from '@/components/onboarding/OnboardingModal';

interface Props {
  locale: string;
  user: User;
  needsOnboarding: boolean;
  initialAvatarUrl: string | null;
  initialEmailAlias: string | null;
  children: React.ReactNode;
}

export default function DashboardShell({ locale, user, needsOnboarding, initialAvatarUrl, initialEmailAlias, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(needsOnboarding);
  const [displayName, setDisplayName] = useState<string | undefined>(
    user.user_metadata?.full_name
  );

  const handleOnboardingComplete = (name: string) => {
    setDisplayName(name);
    setShowOnboarding(false);
  };

  // Merge the resolved name into the user object for downstream components
  const resolvedUser: User = displayName
    ? { ...user, user_metadata: { ...user.user_metadata, full_name: displayName } }
    : user;

  return (
    <div className="min-h-screen flex bg-[#F8FAFC] dark:bg-[#0F172A]">
      {/* Onboarding gate — blocks all interaction until complete */}
      {showOnboarding && (
        <OnboardingModal
          userId={user.id}
          onComplete={handleOnboardingComplete}
        />
      )}

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-40 lg:static lg:z-auto lg:flex
          transition-transform duration-300 ease-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <DashboardSidebar
          locale={locale}
          user={resolvedUser}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-0">
        <DashboardTopbar
          user={resolvedUser}
          onMenuClick={() => setSidebarOpen((v) => !v)}
          initialAvatarUrl={initialAvatarUrl}
          initialEmailAlias={initialEmailAlias}
        />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
