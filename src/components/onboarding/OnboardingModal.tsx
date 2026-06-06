'use client';

import { useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  User, Phone, MapPin, Briefcase, Globe, CheckCircle2, Loader2,
  ChevronRight, ChevronLeft, Sparkles,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormData {
  // Step 1
  full_name: string;
  phone: string;
  location: string;
  // Step 2
  target_job_title: string;
  sector: string;
  contract_type: string;
  work_type: 'remote' | 'onsite' | 'hybrid' | '';
  target_country: string;
}

interface Props {
  userId: string;
  onComplete: (name: string) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTORS = [
  'Tech', 'Healthcare', 'Finance', 'Construction',
  'Commerce', 'Education', 'Other',
];

const CONTRACT_TYPES = ['CDI', 'CDD', 'Intérim', 'Freelance', 'Part-time'];

const WORK_TYPES = [
  { id: 'remote', label: 'Remote' },
  { id: 'hybrid', label: 'Hybrid' },
  { id: 'onsite', label: 'Onsite' },
] as const;

const TARGET_COUNTRIES = [
  'France', 'United Kingdom', 'United States', 'Canada',
  'Spain', 'Portugal', 'Belgium', 'Switzerland',
];

// ─── Shared UI ────────────────────────────────────────────────────────────────

const inputCls = `w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700
  bg-white dark:bg-gray-800 text-gray-900 dark:text-white
  placeholder:text-gray-400 dark:placeholder:text-gray-500
  focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent
  transition-colors text-sm`;

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
      {children}
    </label>
  );
}

function SummaryRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="w-7 h-7 rounded-lg bg-violet-50 dark:bg-violet-950/40 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon size={13} className="text-violet-500" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-400 dark:text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5 leading-snug">{value}</p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function OnboardingModal({ userId, onComplete }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState<FormData>({
    full_name: '',
    phone: '',
    location: '',
    target_job_title: '',
    sector: '',
    contract_type: '',
    work_type: '',
    target_country: '',
  });

  const set = (k: keyof FormData, v: string) =>
    setForm(prev => ({ ...prev, [k]: v }));

  // ── Validation ──────────────────────────────────────────────────────────────
  const step1Valid = form.full_name.trim().length > 0 && form.location.trim().length > 0;
  const step2Valid =
    form.target_job_title.trim().length > 0 &&
    form.sector.length > 0 &&
    form.contract_type.length > 0 &&
    form.work_type.length > 0 &&
    form.target_country.length > 0;

  const canAdvance = step === 1 ? step1Valid : step === 2 ? step2Valid : true;

  // ── Save & finish ───────────────────────────────────────────────────────────
  const handleFinish = async () => {
    setSaving(true);
    setError('');
    try {
      const { error: upsertError } = await supabase.from('profiles').upsert({
        id: userId,
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
        location: form.location.trim(),
        target_job_title: form.target_job_title.trim(),
        sector: form.sector,
        contract_type: form.contract_type,
        work_type: form.work_type || null,
        target_country: form.target_country,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      });

      if (upsertError) throw new Error(upsertError.message);

      // Update auth display name
      await supabase.auth.updateUser({ data: { full_name: form.full_name.trim() } });

      onComplete(form.full_name.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setSaving(false);
    }
  };

  const STEPS = ['Basic Info', 'Preferences', 'Confirm'];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-gray-950/80 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden">

        {/* ── Header ── */}
        <div className="px-6 pt-6 pb-5 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-violet-500 flex items-center justify-center shadow-md shadow-violet-500/30">
              <Sparkles size={15} className="text-white" />
            </div>
            <span className="text-base font-bold text-gray-900 dark:text-white">Welcome to Jobvero</span>
          </div>

          {/* Step progress */}
          <div className="flex items-center gap-2">
            {STEPS.map((label, i) => {
              const n = i + 1;
              const active = n === step;
              const done = n < step;
              return (
                <div key={label} className="flex items-center gap-2 flex-1 last:flex-none">
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-all
                      ${done
                        ? 'bg-violet-600 text-white'
                        : active
                          ? 'bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 ring-2 ring-violet-500'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
                      }`}>
                      {done ? <CheckCircle2 size={13} /> : n}
                    </div>
                    <span className={`text-xs font-medium hidden sm:block
                      ${active ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>
                      {label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-px transition-colors ${done ? 'bg-violet-400' : 'bg-gray-200 dark:bg-gray-700'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="px-6 py-5 max-h-[65vh] overflow-y-auto">

          {/* Step 1 — Basic Info */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Let&apos;s get your profile set up. This takes less than 2 minutes.
              </p>

              <div>
                <FieldLabel>Full Name <span className="text-red-400">*</span></FieldLabel>
                <div className="relative">
                  <User size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    className={`${inputCls} pl-9`}
                    value={form.full_name}
                    onChange={e => set('full_name', e.target.value)}
                    placeholder="Jane Doe"
                    autoFocus
                    autoComplete="name"
                  />
                </div>
              </div>

              <div>
                <FieldLabel>Phone Number</FieldLabel>
                <div className="relative">
                  <Phone size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="tel"
                    className={`${inputCls} pl-9`}
                    value={form.phone}
                    onChange={e => set('phone', e.target.value)}
                    placeholder="+33 6 00 00 00 00"
                    autoComplete="tel"
                  />
                </div>
              </div>

              <div>
                <FieldLabel>Location (City, Country) <span className="text-red-400">*</span></FieldLabel>
                <div className="relative">
                  <MapPin size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    className={`${inputCls} pl-9`}
                    value={form.location}
                    onChange={e => set('location', e.target.value)}
                    placeholder="Paris, France"
                    autoComplete="off"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2 — Job Preferences */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Tell us what you&apos;re looking for so we can tailor your experience.
              </p>

              {/* Target job title */}
              <div>
                <FieldLabel>Target Job Title <span className="text-red-400">*</span></FieldLabel>
                <div className="relative">
                  <Briefcase size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    className={`${inputCls} pl-9`}
                    value={form.target_job_title}
                    onChange={e => set('target_job_title', e.target.value)}
                    placeholder="Software Engineer"
                    autoFocus
                    autoComplete="off"
                  />
                </div>
              </div>

              {/* Sector */}
              <div>
                <FieldLabel>Sector <span className="text-red-400">*</span></FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {SECTORS.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => set('sector', s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                        ${form.sector === s
                          ? 'bg-violet-600 text-white border-violet-600 shadow-sm shadow-violet-500/20'
                          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-700'
                        }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Contract type */}
              <div>
                <FieldLabel>Contract Type <span className="text-red-400">*</span></FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {CONTRACT_TYPES.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => set('contract_type', c)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                        ${form.contract_type === c
                          ? 'bg-violet-600 text-white border-violet-600 shadow-sm shadow-violet-500/20'
                          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-700'
                        }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Work type */}
              <div>
                <FieldLabel>Work Type <span className="text-red-400">*</span></FieldLabel>
                <div className="flex gap-2">
                  {WORK_TYPES.map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => set('work_type', id)}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all
                        ${form.work_type === id
                          ? 'bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-500/20'
                          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-700'
                        }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target country */}
              <div>
                <FieldLabel>Target Country <span className="text-red-400">*</span></FieldLabel>
                <div className="relative">
                  <Globe size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <select
                    value={form.target_country}
                    onChange={e => set('target_country', e.target.value)}
                    className={`${inputCls} pl-9 appearance-none cursor-pointer pr-8`}
                  >
                    <option value="">Select a country…</option>
                    {TARGET_COUNTRIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
          )}

          {/* Step 3 — Confirmation */}
          {step === 3 && (
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                Here&apos;s a summary of your profile. You can always update this in Settings.
              </p>

              <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-1 mb-4">
                <SummaryRow icon={User} label="Full Name" value={form.full_name} />
                <SummaryRow icon={Phone} label="Phone" value={form.phone} />
                <SummaryRow icon={MapPin} label="Location" value={form.location} />
                <SummaryRow icon={Briefcase} label="Target Job" value={form.target_job_title} />
                <SummaryRow icon={Sparkles} label="Sector" value={form.sector} />
                <SummaryRow icon={CheckCircle2} label="Contract Type" value={form.contract_type} />
                <SummaryRow
                  icon={MapPin}
                  label="Work Type"
                  value={form.work_type ? form.work_type.charAt(0).toUpperCase() + form.work_type.slice(1) : ''}
                />
                <SummaryRow icon={Globe} label="Target Country" value={form.target_country} />
              </div>

              {error && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400 mb-4">
                  <span className="font-medium">Error:</span> {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 pb-6 flex items-center justify-between gap-3 border-t border-gray-100 dark:border-gray-800 pt-4">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(s => s - 1)}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              <ChevronLeft size={15} />
              Back
            </button>
          ) : (
            <div /> /* spacer */
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep(s => s + 1)}
              disabled={!canAdvance}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all
                bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400
                text-white shadow-lg shadow-violet-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue
              <ChevronRight size={15} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all
                bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400
                text-white shadow-lg shadow-violet-500/20 disabled:opacity-60"
            >
              {saving ? (
                <><Loader2 size={14} className="animate-spin" /> Saving…</>
              ) : (
                <><Sparkles size={14} /> Start using Jobvero</>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
