'use client';

import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import type { ColumnId, Job } from './types';
import { COLUMNS } from './types';

interface Props {
  defaultStatus: ColumnId;
  onClose: () => void;
  onAdd: (job: Omit<Job, 'id' | 'user_id' | 'created_at'>) => Promise<void>;
}

// Note: This file is superseded by the inlined AddJobModal in KanbanBoard.tsx.
// Kept for reference only.

const inputCls = `w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700
  bg-white dark:bg-gray-800 text-gray-900 dark:text-white
  placeholder:text-gray-400 dark:placeholder:text-gray-500
  focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent
  transition-colors text-sm`;

export default function AddJobModal({ defaultStatus, onClose, onAdd }: Props) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    job_title:        '',
    company_name:     '',
    location:         '' as string | null,
    salary:           '' as string | null,
    status:           defaultStatus as ColumnId,
    notes:            '' as string | null,
    job_url:          '' as string | null,
    job_id:           null as string | null,
    job_source:       null as string | null,
    contract_type:    null as string | null,
    sent_at:          null as string | null,
    interview_date:   null as string | null,
    follow_up_date:   null as string | null,
    cover_letter:     null as string | null,
    company_email:    null as string | null,
    thread_id:        null as string | null,
    send_status:      null as string | null,
    application_type: 'manual',
  });

  const set = (k: keyof typeof form, v: string) =>
    setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onAdd(form);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            Add Job
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={17} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                Job Title <span className="text-red-400">*</span>
              </label>
              <input
                className={inputCls}
                required
                value={form.job_title}
                onChange={e => set('job_title', e.target.value)}
                placeholder="Software Engineer"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                Company Name <span className="text-red-400">*</span>
              </label>
              <input
                className={inputCls}
                required
                value={form.company_name}
                onChange={e => set('company_name', e.target.value)}
                placeholder="Acme Corp"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                Location
              </label>
              <input
                className={inputCls}
                value={form.location ?? ''}
                onChange={e => set('location', e.target.value)}
                placeholder="Paris, France"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                Salary <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                className={inputCls}
                value={form.salary ?? ''}
                onChange={e => set('salary', e.target.value)}
                placeholder="€50k/year"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                Status
              </label>
              <div className="relative">
                <select
                  value={form.status}
                  onChange={e => set('status', e.target.value)}
                  className={`${inputCls} appearance-none cursor-pointer pr-8`}
                >
                  {COLUMNS.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <svg
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                Job URL <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                className={inputCls}
                value={form.job_url ?? ''}
                onChange={e => set('job_url', e.target.value)}
                placeholder="https://linkedin.com/jobs/..."
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                Notes <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                rows={2}
                className={`${inputCls} resize-none`}
                value={form.notes ?? ''}
                onChange={e => set('notes', e.target.value)}
                placeholder="Any notes about this position..."
              />
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white text-sm font-semibold shadow-lg shadow-violet-500/20 disabled:opacity-60 transition-all inline-flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              Add Job
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
