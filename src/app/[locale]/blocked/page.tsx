import Link from 'next/link';
import { ShieldOff } from 'lucide-react';

export default function BlockedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0F172A] px-4">
      <div className="w-full max-w-md text-center">
        <div className="w-20 h-20 rounded-3xl bg-red-100 dark:bg-red-950/40 flex items-center justify-center mx-auto mb-6 shadow-lg">
          <ShieldOff size={36} className="text-red-600 dark:text-red-400" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
          Account Suspended
        </h1>
        <p className="text-gray-500 dark:text-gray-400 leading-relaxed mb-2">
          Your account has been suspended.
        </p>
        <p className="text-gray-500 dark:text-gray-400 leading-relaxed mb-8">
          Please contact{' '}
          <a
            href="mailto:support@getjobvero.com"
            className="text-violet-600 dark:text-violet-400 font-medium hover:underline"
          >
            support@getjobvero.com
          </a>{' '}
          for more information.
        </p>

        <Link
          href="mailto:support@getjobvero.com"
          className="inline-flex items-center justify-center px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all shadow-lg shadow-violet-500/20"
          style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}
        >
          Contact Support
        </Link>
      </div>
    </div>
  );
}
