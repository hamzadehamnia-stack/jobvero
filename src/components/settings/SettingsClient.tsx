'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import NextLink from 'next/link';
import { createClient } from '@/lib/supabase/client';
import PhoneInput from './PhoneInput';
import DatePicker from '@/components/ui/DatePicker';
import {
  User, Mail, MapPin, Camera, Briefcase, Globe,
  Lock, CreditCard, Loader2,
  CheckCircle2, AlertCircle, Eye, EyeOff, Shield, Sparkles,
  Crown, Bell, BriefcaseBusiness, Link, Check, Copy, AtSign, Hash,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProfileRow {
  full_name:            string | null;
  phone:                string | null;
  location:             string | null;
  avatar_url:           string | null;
  job_title:            string | null;
  linkedin_url:         string | null;
  portfolio_url:        string | null;
  target_job_title:     string | null;
  target_country:       string | null;
  target_countries:     string[] | null;
  min_salary:           string | null;
  max_salary:           string | null;
  work_type:            string[] | null;
  available_from:       string | null;
  notify_email_alerts:  boolean | null;
  notify_job_alerts:    boolean | null;
  notify_weekly_report: boolean | null;
  subscription_plan:    string | null;
  trial_ends_at:        string | null;
  preferred_language:   string | null;
  email_alias:          string | null;
  jobvero_id:           string | null;
}

interface Props {
  userId:  string;
  email:   string;
  profile: ProfileRow | null;
}

type SaveState  = 'idle' | 'saving' | 'saved' | 'error';
type DisplayTier = 'trial' | 'free' | 'pro' | 'premium';

// ─── Constants ────────────────────────────────────────────────────────────────

const COUNTRIES = [
  { code: 'fr', label: 'France',       flag: '🇫🇷' },
  { code: 'us', label: 'USA',          flag: '🇺🇸' },
  { code: 'gb', label: 'UK',           flag: '🇬🇧' },
  { code: 'ca', label: 'Canada',       flag: '🇨🇦' },
  { code: 'de', label: 'Germany',      flag: '🇩🇪' },
  { code: 'be', label: 'Belgium',      flag: '🇧🇪' },
  { code: 'ch', label: 'Switzerland',  flag: '🇨🇭' },
  { code: 'nl', label: 'Netherlands',  flag: '🇳🇱' },
  { code: 'es', label: 'Spain',        flag: '🇪🇸' },
  { code: 'pt', label: 'Portugal',     flag: '🇵🇹' },
  { code: 'au', label: 'Australia',    flag: '🇦🇺' },
  { code: 'nz', label: 'New Zealand',  flag: '🇳🇿' },
  { code: 'ie', label: 'Ireland',      flag: '🇮🇪' },
  { code: 'br', label: 'Brazil',       flag: '🇧🇷' },
  { code: 'mx', label: 'Mexico',       flag: '🇲🇽' },
  { code: 'pe', label: 'Peru',         flag: '🇵🇪' },
];

const EU_CODES  = new Set(['fr','be','ch','de','nl','es','pt','ie']);
const USD_CODES = new Set(['us','ca','au','nz','mx','pe']);

const LANGUAGES = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
];

const LANG_UI: Record<string, { section: string; field: string; hint: string }> = {
  fr: { section: 'Langue & Région',    field: "Langue de l'interface",    hint: "Modifie la langue de l'interface Jobvero." },
  en: { section: 'Language & Region',  field: 'Interface Language',       hint: 'Changes the language of the Jobvero interface.' },
  es: { section: 'Idioma y Región',    field: 'Idioma de la interfaz',    hint: 'Cambia el idioma de la interfaz de Jobvero.' },
  pt: { section: 'Idioma e Região',    field: 'Idioma da interface',      hint: 'Altera o idioma da interface Jobvero.' },
};

const WORK_TYPE_IDS = ['remote', 'hybrid', 'onsite'] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDisplayTier(plan: string | null, trialEndsAt: string | null): DisplayTier {
  const p = plan ?? 'trial';
  if (p === 'trial') {
    if (!trialEndsAt || new Date(trialEndsAt) < new Date()) return 'free';
    return 'trial';
  }
  return p as DisplayTier;
}

const inputCls =
  'w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 ' +
  'bg-white dark:bg-gray-800 text-gray-900 dark:text-white ' +
  'placeholder:text-gray-400 dark:placeholder:text-gray-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent ' +
  'transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed';

// ─── Sub-components ───────────────────────────────────────────────────────────

function SaveBtn({ state, onClick, labels }: {
  state: SaveState;
  onClick: () => void;
  labels: { save: string; saving: string; saved: string; error: string };
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state === 'saving'}
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all
        bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400
        text-white shadow-lg shadow-violet-500/20 disabled:opacity-60"
    >
      {state === 'saving' && <Loader2 size={14} className="animate-spin" />}
      {state === 'saved'  && <CheckCircle2 size={14} />}
      {state === 'error'  && <AlertCircle size={14} />}
      {state === 'saving' ? labels.saving
        : state === 'saved'  ? labels.saved
        : state === 'error'  ? labels.error
        : labels.save}
    </button>
  );
}

function SectionCard({ title, icon: Icon, children }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-800">
        <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-950/40 flex items-center justify-center">
          <Icon size={16} className="text-violet-500" />
        </div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
      {children}
    </label>
  );
}

function ErrorMsg({ msg, prefix }: { msg: string; prefix: string }) {
  return (
    <p className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg flex items-start gap-1.5">
      <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
      <span><strong>{prefix}:</strong> {msg}</span>
    </p>
  );
}

function Toggle({ enabled, onChange, id }: { enabled: boolean; onChange: (v: boolean) => void; id: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={enabled} id={id}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
        transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900
        ${enabled ? 'bg-violet-600' : 'bg-gray-200 dark:bg-gray-700'}`}
    >
      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
        transition duration-200 ease-in-out ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  );
}

function ToggleRow({ id, icon: Icon, label, description, enabled, onChange }: {
  id: string; icon: React.ElementType; label: string; description: string;
  enabled: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Icon size={15} className="text-gray-500 dark:text-gray-400" />
        </div>
        <div>
          <label htmlFor={id} className="text-sm font-medium text-gray-900 dark:text-white cursor-pointer">{label}</label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
        </div>
      </div>
      <Toggle id={id} enabled={enabled} onChange={onChange} />
    </div>
  );
}

// ─── Plan badge config ────────────────────────────────────────────────────────

const PLAN_STYLES: Record<DisplayTier, { badge: string; icon: React.ElementType; ring: string }> = {
  trial:   { badge: 'bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300', icon: Sparkles, ring: 'border-violet-200 dark:border-violet-800' },
  free:    { badge: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',             icon: Shield,   ring: 'border-gray-200 dark:border-gray-700' },
  pro:     { badge: 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300',           icon: Crown,    ring: 'border-blue-200 dark:border-blue-800' },
  premium: { badge: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300',       icon: Crown,    ring: 'border-amber-200 dark:border-amber-800' },
};

// ─── Jobvero Identity Card ────────────────────────────────────────────────────

function CopyRow({ icon: Icon, label, value, placeholder }: {
  icon: React.ElementType; label: string; value: string | null; placeholder: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  return (
    <div className="flex items-center gap-4 py-4 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-950/40 flex items-center justify-center flex-shrink-0">
        <Icon size={16} className="text-violet-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
        <p className={`text-sm font-mono truncate ${value ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500 italic'}`}>
          {value ?? placeholder}
        </p>
      </div>
      {value && (
        <button
          type="button"
          onClick={handleCopy}
          title="Copier"
          className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
            ${copied
              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-violet-100 dark:hover:bg-violet-900/30 hover:text-violet-700 dark:hover:text-violet-300'
            }`}
        >
          {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
          {copied ? 'Copié' : 'Copier'}
        </button>
      )}
    </div>
  );
}

function JobveroIdentityCard({ emailAlias, jobveroId }: {
  emailAlias: string | null; jobveroId: string | null;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-800">
        <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-950/40 flex items-center justify-center">
          <Sparkles size={16} className="text-violet-500" />
        </div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Mon profil Jobvero</h2>
      </div>
      <div className="px-6 py-2">
        <CopyRow
          icon={Hash}
          label="Mon ID Jobvero"
          value={jobveroId}
          placeholder="En cours de génération…"
        />
        <CopyRow
          icon={AtSign}
          label="Mon adresse Jobvero"
          value={emailAlias ? `${emailAlias}@getjobvero.com` : null}
          placeholder="En cours de génération…"
        />
        <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed py-3">
          Cette adresse est utilisée pour envoyer vos candidatures. Les réponses des employeurs arrivent automatiquement dans votre Inbox.
        </p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SettingsClient({ userId, email, profile }: Props) {
  const t      = useTranslations('settings');
  const locale = useLocale();
  const supabase = useMemo(() => createClient(), []);
  const fileRef  = useRef<HTMLInputElement>(null);

  const saveLabels = {
    save: t('save'), saving: t('saving'), saved: t('saved'), error: t('errorRetry'),
  };

  // ── Profile state ─────────────────────────────────────────────────────────
  const [fullName,      setFullName]      = useState(profile?.full_name      ?? '');
  const [phone,         setPhone]         = useState(profile?.phone          ?? '');
  const [location,      setLocation]      = useState(profile?.location       ?? '');
  const [jobTitle,      setJobTitle]      = useState(profile?.job_title      ?? '');
  const [linkedinUrl,   setLinkedinUrl]   = useState(profile?.linkedin_url   ?? '');
  const [portfolioUrl,  setPortfolioUrl]  = useState(profile?.portfolio_url  ?? '');
  const [avatarUrl,     setAvatarUrl]     = useState(profile?.avatar_url     ?? '');
  const [avatarPreview, setAvatarPreview] = useState(profile?.avatar_url     ?? '');
  const [avatarFile,    setAvatarFile]    = useState<File | null>(null);
  const [profileSave,   setProfileSave]   = useState<SaveState>('idle');
  const [profileError,  setProfileError]  = useState('');

  // ── Job preferences state ──────────────────────────────────────────────────
  const [targetTitle,     setTargetTitle]     = useState(profile?.target_job_title  ?? '');
  const [targetCountries, setTargetCountries] = useState<string[]>(Array.isArray(profile?.target_countries) ? profile.target_countries : []);
  const [minSalary,       setMinSalary]       = useState(profile?.min_salary        ?? '');
  const [maxSalary,       setMaxSalary]       = useState(profile?.max_salary        ?? '');
  const [workTypes,       setWorkTypes]       = useState<string[]>(Array.isArray(profile?.work_type) ? profile.work_type : []);
  const [availableFrom,   setAvailableFrom]   = useState(profile?.available_from    ?? new Date().toISOString().split('T')[0]);
  const [prefSave,        setPrefSave]        = useState<SaveState>('idle');
  const [prefError,       setPrefError]       = useState('');

  // ── Notification state ────────────────────────────────────────────────────
  const [notifyEmail,  setNotifyEmail]  = useState(profile?.notify_email_alerts  ?? true);
  const [notifyJobs,   setNotifyJobs]   = useState(profile?.notify_job_alerts    ?? true);
  const [notifyWeekly, setNotifyWeekly] = useState(profile?.notify_weekly_report ?? true);
  const [notifySave,   setNotifySave]   = useState<SaveState>('idle');
  const [notifyError,  setNotifyError]  = useState('');

  // ── Password state ────────────────────────────────────────────────────────
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw,          setShowPw]          = useState(false);
  const [pwSave,          setPwSave]          = useState<SaveState>('idle');
  const [pwError,         setPwError]         = useState('');

  // ── Language state ────────────────────────────────────────────────────────
  const [preferredLang, setPreferredLang] = useState(profile?.preferred_language ?? 'en');
  const [langSave,      setLangSave]      = useState<SaveState>('idle');
  const [langError,     setLangError]     = useState('');

  // ── Toast state ───────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // ── Delete state ──────────────────────────────────────────────────────────
  const [deleteConfirm,       setDeleteConfirm]       = useState(false);
  const [deleting,            setDeleting]            = useState(false);
  const [otpSent,             setOtpSent]             = useState(false);
  const [otpCode,             setOtpCode]             = useState('');
  const [otpExpiresAt,        setOtpExpiresAt]        = useState<number | null>(null);
  const [otpRemainingSeconds, setOtpRemainingSeconds] = useState(0);
  const [sendingOtp,          setSendingOtp]          = useState(false);

  // ── Derived ───────────────────────────────────────────────────────────────
  const initials = fullName
    ? fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : email.slice(0, 2).toUpperCase();

  const tier = getDisplayTier(profile?.subscription_plan ?? null, profile?.trial_ends_at ?? null);

  const daysRemaining = profile?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(profile.trial_ends_at).getTime() - Date.now()) / 86_400_000))
    : 0;

  const currencySymbol = useMemo(() => {
    const first = targetCountries[0];
    if (!first) return '$';
    if (EU_CODES.has(first))  return '€';
    if (first === 'gb')       return '£';
    if (first === 'br')       return 'R$';
    return '$';
  }, [targetCountries]);
  const planStyle = PLAN_STYLES[tier];
  const PlanIcon  = planStyle.icon;
  const planDescKey = `account.planDesc${tier.charAt(0).toUpperCase() + tier.slice(1)}` as const;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const toggleCountry = (code: string) =>
    setTargetCountries(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );

  const toggleWorkType = (wt: string) =>
    setWorkTypes(prev =>
      prev.includes(wt) ? prev.filter(w => w !== wt) : [...prev, wt]
    );

  // ── Save profile ──────────────────────────────────────────────────────────
  const saveProfile = useCallback(async () => {
    setProfileSave('saving'); setProfileError('');
    try {
      let finalAvatarUrl = avatarUrl;
      if (avatarFile) {
        const ext  = avatarFile.name.split('.').pop();
        const path = `${userId}/avatar.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('avatars').upload(path, avatarFile, { upsert: true });
        if (upErr) throw new Error(`Avatar upload: ${upErr.message}`);
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
        finalAvatarUrl = urlData.publicUrl;
        setAvatarUrl(finalAvatarUrl); setAvatarFile(null);
        // Notify the topbar so it updates without a page reload
        window.dispatchEvent(new CustomEvent('avatar-updated', { detail: { url: finalAvatarUrl } }));
      }
      const { error } = await supabase.from('profiles').upsert({
        id: userId,
        full_name:     fullName     || null,
        phone:         phone        || null,
        location:      location     || null,
        avatar_url:    finalAvatarUrl || null,
        job_title:     jobTitle     || null,
        linkedin_url:  linkedinUrl  || null,
        portfolio_url: portfolioUrl || null,
      }, { onConflict: 'id' });
      if (error) throw new Error(error.message);
      await supabase.auth.updateUser({ data: { full_name: fullName } });
      setProfileSave('saved');
      showToast('Changes saved!');
      setTimeout(() => setProfileSave('idle'), 2500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setProfileError(msg); setProfileSave('error');
      showToast(msg, 'error');
      setTimeout(() => setProfileSave('idle'), 4000);
    }
  }, [supabase, userId, fullName, phone, location, jobTitle, linkedinUrl, portfolioUrl, avatarUrl, avatarFile]);

  // ── Save preferences ───────────────────────────────────────────────────────
  const savePreferences = useCallback(async () => {
    setPrefSave('saving'); setPrefError('');
    try {
      const { error } = await supabase.from('profiles').upsert({
        id: userId,
        target_job_title:  targetTitle       || null,
        target_countries:  targetCountries.length ? targetCountries : null,
        min_salary:        minSalary         || null,
        max_salary:        maxSalary         || null,
        work_type:         workTypes.length  ? workTypes  : null,
        available_from:    availableFrom     || null,
      }, { onConflict: 'id' });
      if (error) throw new Error(error.message);
      setPrefSave('saved');
      showToast('Preferences saved!');
      setTimeout(() => setPrefSave('idle'), 2500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setPrefError(msg); setPrefSave('error');
      showToast(msg, 'error');
      setTimeout(() => setPrefSave('idle'), 4000);
    }
  }, [supabase, userId, targetTitle, targetCountries, minSalary, maxSalary, workTypes, availableFrom]);

  // ── Save notifications ─────────────────────────────────────────────────────
  const saveNotifications = useCallback(async () => {
    setNotifySave('saving'); setNotifyError('');
    try {
      const { error } = await supabase.from('profiles').upsert({
        id: userId,
        notify_email_alerts:  notifyEmail,
        notify_job_alerts:    notifyJobs,
        notify_weekly_report: notifyWeekly,
      }, { onConflict: 'id' });
      if (error) throw new Error(error.message);
      setNotifySave('saved');
      showToast('Changes saved!');
      setTimeout(() => setNotifySave('idle'), 2500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setNotifyError(msg); setNotifySave('error');
      showToast(msg, 'error');
      setTimeout(() => setNotifySave('idle'), 4000);
    }
  }, [supabase, userId, notifyEmail, notifyJobs, notifyWeekly]);

  // ── Change password ────────────────────────────────────────────────────────
  const changePassword = useCallback(async () => {
    setPwError('');
    if (newPassword.length < 8) { setPwError(t('account.pwMinLength')); return; }
    if (newPassword !== confirmPassword) { setPwError(t('account.pwNoMatch')); return; }
    setPwSave('saving');
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message);
      setNewPassword(''); setConfirmPassword('');
      setPwSave('saved');
      showToast('Password updated!');
      setTimeout(() => setPwSave('idle'), 2500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed';
      setPwError(msg);
      setPwSave('error');
      showToast(msg, 'error');
      setTimeout(() => setPwSave('idle'), 3000);
    }
  }, [supabase, newPassword, confirmPassword, t]);

  // ── Save language ──────────────────────────────────────────────────────────
  const saveLanguage = useCallback(async () => {
    setLangSave('saving'); setLangError('');
    try {
      const { error } = await supabase.from('profiles').upsert(
        { id: userId, preferred_language: preferredLang },
        { onConflict: 'id' },
      );
      if (error) throw new Error(error.message);
      setLangSave('saved');
      showToast('Changes saved!');
      setTimeout(() => setLangSave('idle'), 2500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setLangError(msg); setLangSave('error');
      showToast(msg, 'error');
      setTimeout(() => setLangSave('idle'), 4000);
    }
  }, [supabase, userId, preferredLang]);

  // ── OTP countdown ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!otpExpiresAt) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((otpExpiresAt - Date.now()) / 1000));
      setOtpRemainingSeconds(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [otpExpiresAt]);

  // ── Send delete OTP ────────────────────────────────────────────────────────
  const sendDeleteOtp = useCallback(async () => {
    setSendingOtp(true);
    try {
      const res = await fetch('/api/account/delete-otp/send', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to send code.');
      setOtpSent(true);
      setOtpExpiresAt(body.expiresAt);
      setOtpRemainingSeconds(Math.floor((body.expiresAt - Date.now()) / 1000));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send code.');
    } finally {
      setSendingOtp(false);
    }
  }, []);

  // ── Confirm delete with OTP ────────────────────────────────────────────────
  const confirmDeleteAccount = useCallback(async () => {
    if (otpCode.length !== 8) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/delete-account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otpCode }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? 'Failed to delete account.');
      }
      await supabase.auth.signOut();
      window.location.href = '/';
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete account.');
      setDeleting(false);
    }
  }, [otpCode, supabase]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto w-full space-y-6">

      {/* Page header */}
      <div className="mb-2">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('title')}</h1>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">{t('subtitle')}</p>
      </div>

      {/* ── Profile ── */}
      <SectionCard title={t('profile.title')} icon={User}>
        <div className="space-y-5">

          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar"
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-gray-200 dark:border-gray-700" />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-white text-xl font-bold border-2 border-gray-200 dark:border-gray-700">
                  {initials}
                </div>
              )}
              <button type="button" onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                <Camera size={13} className="text-gray-500 dark:text-gray-400" />
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{fullName || 'Your Name'}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{email}</p>
              <button type="button" onClick={() => fileRef.current?.click()}
                className="mt-1.5 text-xs text-violet-600 dark:text-violet-400 hover:underline font-medium">
                {t('profile.changePhoto')}
              </button>
            </div>
          </div>

          {/* Fields grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Full name */}
            <div>
              <FieldLabel>{t('profile.fullName')} <span className="text-red-500">*</span></FieldLabel>
              <div className="relative">
                <User size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input type="text" className={`${inputCls} pl-9`} value={fullName}
                  onChange={e => setFullName(e.target.value)} placeholder={t('profile.fullNamePlaceholder')} autoComplete="name" />
              </div>
            </div>

            {/* Email */}
            <div>
              <FieldLabel>{t('profile.email')}</FieldLabel>
              <div className="relative">
                <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input type="email" className={`${inputCls} pl-9`} value={email} disabled />
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('profile.emailNote')}</p>
            </div>

            {/* Phone */}
            <div>
              <FieldLabel>{t('profile.phone')} <span className="text-red-500">*</span></FieldLabel>
              <PhoneInput
                value={phone}
                onChange={setPhone}
                inputCls={inputCls}
                placeholder={t('profile.phonePlaceholder')}
              />
            </div>

            {/* Location */}
            <div>
              <FieldLabel>{t('profile.location')} <span className="text-red-500">*</span></FieldLabel>
              <div className="relative">
                <MapPin size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input type="text" className={`${inputCls} pl-9`} value={location}
                  onChange={e => setLocation(e.target.value)} placeholder={t('profile.locationPlaceholder')} autoComplete="off" />
              </div>
            </div>

            {/* Job title */}
            <div>
              <FieldLabel>{t('profile.jobTitle')}</FieldLabel>
              <div className="relative">
                <Briefcase size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input type="text" className={`${inputCls} pl-9`} value={jobTitle}
                  onChange={e => setJobTitle(e.target.value)} placeholder={t('profile.jobTitlePlaceholder')} autoComplete="off" />
              </div>
            </div>

            {/* LinkedIn */}
            <div>
              <FieldLabel>{t('profile.linkedin')}</FieldLabel>
              <div className="relative">
                <Globe size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input type="url" className={`${inputCls} pl-9`} value={linkedinUrl}
                  onChange={e => setLinkedinUrl(e.target.value)} placeholder={t('profile.linkedinPlaceholder')} autoComplete="off" />
              </div>
            </div>

            {/* Portfolio */}
            <div className="sm:col-span-2">
              <FieldLabel>{t('profile.portfolio')}</FieldLabel>
              <div className="relative">
                <Link size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input type="url" className={`${inputCls} pl-9`} value={portfolioUrl}
                  onChange={e => setPortfolioUrl(e.target.value)} placeholder={t('profile.portfolioPlaceholder')} autoComplete="off" />
              </div>
            </div>
          </div>

          {profileError && <ErrorMsg msg={profileError} prefix={t('saveFailed')} />}
          <div className="flex justify-end pt-1">
            <SaveBtn state={profileSave} onClick={saveProfile} labels={saveLabels} />
          </div>
        </div>
      </SectionCard>

      {/* ── Job Preferences ── */}
      <SectionCard title={t('preferences.title')} icon={Briefcase}>
        <div className="space-y-5">

          {/* Target job title */}
          <div>
            <FieldLabel>{t('preferences.targetTitle')}</FieldLabel>
            <div className="relative">
              <Briefcase size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input type="text" className={`${inputCls} pl-9`} value={targetTitle}
                onChange={e => setTargetTitle(e.target.value)} placeholder={t('preferences.targetTitlePlaceholder')} autoComplete="off" />
            </div>
          </div>

          {/* Target countries — chip grid */}
          <div>
            <FieldLabel>{t('preferences.targetCountries')}</FieldLabel>
            <div className="flex flex-wrap gap-2 mt-1">
              {COUNTRIES.map(({ code, label, flag }) => {
                const selected = targetCountries.includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => toggleCountry(code)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition-all duration-150
                      ${selected
                        ? 'bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-500/20'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-700'
                      }`}
                  >
                    <span className="text-base">{flag}</span>
                    <span>{label}</span>
                    {selected && <Check size={12} className="ml-0.5" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Salary range */}
          <div>
            <FieldLabel>{t('preferences.salaryRange')}</FieldLabel>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1">{t('preferences.salaryMin')}</p>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-sm font-medium select-none">
                    {currencySymbol}
                  </span>
                  <input type="text" className={`${inputCls} ${currencySymbol === 'R$' ? 'pl-10' : 'pl-9'}`} value={minSalary}
                    onChange={e => setMinSalary(e.target.value)} placeholder={t('preferences.salaryMinPlaceholder')} autoComplete="off" />
                </div>
              </div>
              <div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1">{t('preferences.salaryMax')}</p>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-sm font-medium select-none">
                    {currencySymbol}
                  </span>
                  <input type="text" className={`${inputCls} ${currencySymbol === 'R$' ? 'pl-10' : 'pl-9'}`} value={maxSalary}
                    onChange={e => setMaxSalary(e.target.value)} placeholder={t('preferences.salaryMaxPlaceholder')} autoComplete="off" />
                </div>
              </div>
            </div>
          </div>

          {/* Work type — multi-select checkboxes */}
          <div>
            <FieldLabel>{t('preferences.workType')}</FieldLabel>
            <div className="flex gap-2 flex-wrap">
              {WORK_TYPE_IDS.map((wt) => {
                const selected = workTypes.includes(wt);
                const labelKey = `preferences.${wt}` as const;
                return (
                  <button
                    key={wt}
                    type="button"
                    onClick={() => toggleWorkType(wt)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all duration-150
                      ${selected
                        ? 'bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-500/20'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-700'
                      }`}
                  >
                    <span className={`w-4 h-4 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all
                      ${selected ? 'bg-white border-white' : 'border-gray-300 dark:border-gray-600'}`}>
                      {selected && <Check size={10} className="text-violet-600" />}
                    </span>
                    {t(labelKey)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Available from */}
          <div className="max-w-xs">
            <FieldLabel>{t('preferences.availableFrom')}</FieldLabel>
            <DatePicker
              value={availableFrom}
              onChange={setAvailableFrom}
              showDay
              showActions
              locale="en"
              minYear={new Date().getFullYear()}
              maxYear={new Date().getFullYear() + 5}
            />
          </div>

          {prefError && <ErrorMsg msg={prefError} prefix={t('saveFailed')} />}
          <div className="flex justify-end pt-1">
            <SaveBtn state={prefSave} onClick={savePreferences} labels={saveLabels} />
          </div>
        </div>
      </SectionCard>

      {/* ── Language & Region ── */}
      <SectionCard title={(LANG_UI[preferredLang] ?? LANG_UI.en).section} icon={Globe}>
        <div className="space-y-4">
          <div className="max-w-xs">
            <FieldLabel>{(LANG_UI[preferredLang] ?? LANG_UI.en).field}</FieldLabel>
            <select
              value={preferredLang}
              onChange={e => setPreferredLang(e.target.value)}
              className={inputCls}
            >
              {LANGUAGES.map(l => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
              {(LANG_UI[preferredLang] ?? LANG_UI.en).hint}
            </p>
          </div>
          {langError && <ErrorMsg msg={langError} prefix={t('saveFailed')} />}
          <div className="flex justify-end pt-1">
            <SaveBtn state={langSave} onClick={saveLanguage} labels={saveLabels} />
          </div>
        </div>
      </SectionCard>

      {/* ── Notifications ── */}
      <SectionCard title={t('notifications.title')} icon={Bell}>
        <div>
          <ToggleRow id="notify-email"  icon={Mail}            label={t('notifications.emailAlerts')}  description={t('notifications.emailAlertsDesc')}  enabled={notifyEmail}  onChange={setNotifyEmail} />
          <ToggleRow id="notify-jobs"   icon={BriefcaseBusiness} label={t('notifications.jobAlerts')}    description={t('notifications.jobAlertsDesc')}    enabled={notifyJobs}   onChange={setNotifyJobs} />
          <ToggleRow id="notify-weekly" icon={Bell}             label={t('notifications.weeklyReport')} description={t('notifications.weeklyReportDesc')} enabled={notifyWeekly} onChange={setNotifyWeekly} />

          {notifyError && <ErrorMsg msg={notifyError} prefix={t('saveFailed')} />}
          <div className="flex justify-end pt-4">
            <SaveBtn state={notifySave} onClick={saveNotifications} labels={saveLabels} />
          </div>
        </div>
      </SectionCard>

      {/* ── Jobvero Identity ── */}
      <JobveroIdentityCard
        emailAlias={profile?.email_alias ?? null}
        jobveroId={profile?.jobvero_id   ?? null}
      />

      {/* ── Account ── */}
      <SectionCard title={t('account.title')} icon={Shield}>
        <div className="space-y-6">

          {/* Change password */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Lock size={14} className="text-gray-400" />
              {t('account.changePassword')}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FieldLabel>{t('account.newPassword')}</FieldLabel>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} className={`${inputCls} pr-10`}
                    value={newPassword} onChange={e => setNewPassword(e.target.value)}
                    placeholder={t('account.newPasswordPlaceholder')} autoComplete="new-password" />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <div>
                <FieldLabel>{t('account.confirmPassword')}</FieldLabel>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} className={`${inputCls} pr-10`}
                    value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                    placeholder={t('account.confirmPasswordPlaceholder')} autoComplete="new-password" />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </div>
            {pwError && (
              <p className="text-xs text-red-500 dark:text-red-400 mt-2 flex items-center gap-1.5">
                <AlertCircle size={12} /> {pwError}
              </p>
            )}
            <div className="flex justify-end mt-3">
              <SaveBtn state={pwSave} onClick={changePassword} labels={saveLabels} />
            </div>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800" />

          {/* Current plan */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <CreditCard size={14} className="text-gray-400" />
              {t('account.currentPlan')}
            </h3>
            <div className={`flex items-center justify-between p-4 rounded-xl bg-gray-50 dark:bg-gray-800/60 border ${planStyle.ring}`}>
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${planStyle.badge}`}>
                  <PlanIcon size={16} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white capitalize">
                      {tier === 'trial' ? 'Trial' : tier === 'free' ? 'Free' : tier === 'pro' ? 'Pro' : 'Premium'}
                    </p>
                    {tier === 'trial' && daysRemaining > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300">
                        {daysRemaining}d left
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t(planDescKey)}</p>
                </div>
              </div>
              {(tier === 'free' || tier === 'trial') && (
                <a href="/en/pricing"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold
                    bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400
                    text-white shadow-md shadow-violet-500/20 transition-all flex-shrink-0 ml-3">
                  <Crown size={12} /> {t('account.upgrade')}
                </a>
              )}
            </div>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800" />

          {/* Danger zone */}
          <div>
            {/* Stage A: initial delete button */}
            {!deleteConfirm ? (
              <div className="flex items-center justify-between p-4 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{t('account.deleteAccount')}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('account.deleteDesc')}</p>
                </div>
                <button type="button" onClick={() => setDeleteConfirm(true)}
                  className="flex-shrink-0 ml-4 px-4 py-2 rounded-xl text-sm font-semibold text-red-500 border border-red-300 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-950/40 transition-colors">
                  {t('account.delete')}
                </button>
              </div>

            ) : !otpSent ? (
              /* Stage B: "Are you sure?" + send code button */
              <div className="p-4 rounded-xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 space-y-3">
                <p className="text-sm font-semibold text-red-600 dark:text-red-400">{t('account.deleteConfirmTitle')}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">{t('account.deleteConfirmDesc')}</p>
                <div className="mt-3 p-3 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40">
                  <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                    ⚠️ {t.rich('account.noRefundNotice', {
                      link: (chunks) => (
                        <NextLink
                          href={`/${locale}/terms`}
                          target="_blank"
                          className="underline font-medium hover:text-amber-900 dark:hover:text-amber-100 transition-colors"
                        >
                          {chunks}
                        </NextLink>
                      ),
                    })}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setDeleteConfirm(false)}
                    className="flex-1 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    {t('account.cancel')}
                  </button>
                  <button type="button" onClick={sendDeleteOtp} disabled={sendingOtp}
                    className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2">
                    {sendingOtp && <Loader2 size={13} className="animate-spin" />}
                    {t('account.sendCode')}
                  </button>
                </div>
              </div>

            ) : (
              /* Stage C: OTP input + countdown + confirm button */
              <div className="p-4 rounded-xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 space-y-3">
                <p className="text-sm font-semibold text-red-600 dark:text-red-400">{t('account.codeSentTitle')}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">{t('account.codeSentDescription')}</p>

                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                    {t('account.codeInputLabel')}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={8}
                    value={otpCode}
                    onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder="00000000"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700
                      bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                      text-center text-lg font-mono tracking-widest
                      placeholder:text-gray-400 dark:placeholder:text-gray-600
                      focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent
                      transition-colors"
                  />
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className={otpRemainingSeconds === 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}>
                    {otpRemainingSeconds === 0
                      ? t('account.codeExpired')
                      : t('account.codeExpiresIn', {
                          time: `${Math.floor(otpRemainingSeconds / 60)}:${(otpRemainingSeconds % 60).toString().padStart(2, '0')}`,
                        })
                    }
                  </span>
                  <button type="button" onClick={sendDeleteOtp} disabled={sendingOtp}
                    className="text-violet-600 dark:text-violet-400 hover:underline font-medium disabled:opacity-50">
                    {t('account.resendCode')}
                  </button>
                </div>

                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => { setDeleteConfirm(false); setOtpSent(false); setOtpCode(''); setOtpExpiresAt(null); }}
                    className="flex-1 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    {t('account.cancel')}
                  </button>
                  <button type="button" onClick={confirmDeleteAccount}
                    disabled={otpCode.length !== 8 || otpRemainingSeconds === 0 || deleting}
                    className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2">
                    {deleting && <Loader2 size={13} className="animate-spin" />}
                    {deleting ? t('account.deleting') : t('account.confirmDeletion')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all
          ${toast.type === 'success'
            ? 'bg-emerald-600 text-white'
            : 'bg-red-600 text-white'
          }`}>
          {toast.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          {toast.message}
        </div>
      )}
    </div>
  );
}
