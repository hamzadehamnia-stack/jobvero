'use client';

import { useState, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Sparkles, Loader2, Download, Copy, Check, Save,
  AlertCircle, FileText, Briefcase, Building2, AlignLeft,
  ChevronLeft,
} from 'lucide-react';
import Toast, { type ToastData } from '@/components/ui/Toast';
import SavedLettersList from './SavedLettersList';
import TemplatesTab from './TemplatesTab';

type Tone = 'Professional' | 'Friendly' | 'Formal';
type Language = 'en' | 'fr' | 'es' | 'pt';

interface FormData {
  jobTitle: string;
  companyName: string;
  jobDescription: string;
  tone: Tone;
  language: Language;
}

const TONES: Tone[] = ['Professional', 'Friendly', 'Formal'];

const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'en', label: '🇺🇸 English' },
  { value: 'fr', label: '🇫🇷 Français' },
  { value: 'es', label: '🇪🇸 Español' },
  { value: 'pt', label: '🇧🇷 Português' },
];

const toneActiveClass: Record<Tone, string> = {
  Professional: 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300',
  Friendly:     'border-violet-500 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300',
  Formal:       'border-slate-500 bg-slate-50 dark:bg-slate-950/40 text-slate-700 dark:text-slate-300',
};

const inputCls =
  'w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 ' +
  'bg-white dark:bg-gray-800 text-gray-900 dark:text-white ' +
  'placeholder:text-gray-400 dark:placeholder:text-gray-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent ' +
  'transition-colors text-sm';

interface Props {
  userName: string;
  userEmail: string;
  initialCredits: number;
}

export default function CoverLetterClient({ userName, userEmail, initialCredits }: Props) {
  const t = useTranslations('coverLetter');
  const [credits, setCredits] = useState(initialCredits);
  const [activeTab, setActiveTab] = useState<'new' | 'saved' | 'templates'>('new');

  const [form, setForm] = useState<FormData>({
    jobTitle: '',
    companyName: '',
    jobDescription: '',
    tone: 'Professional',
    language: 'en',
  });
  const [generating, setGenerating]   = useState(false);
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const [copied, setCopied]           = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [generatedHTML, setGeneratedHTML] = useState<string | null>(null);
  const [error, setError]             = useState('');
  const [toast, setToast]             = useState<ToastData | null>(null);
  const [modifyInstruction, setModifyInstruction] = useState('');
  const [modifying, setModifying]     = useState(false);
  const [modifyHistory, setModifyHistory] = useState<string[]>([]);
  const closeToast = useCallback(() => setToast(null), []);
  const previewRef = useRef<HTMLDivElement>(null);

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const hasCredits = credits > 0;
  const canGenerate =
    form.jobTitle.trim().length > 0 &&
    form.companyName.trim().length > 0 &&
    form.jobDescription.trim().length > 20 &&
    hasCredits;

  // ── Generate ────────────────────────────────────────────────────────────────
  const generate = async () => {
    if (credits <= 0) {
      setError(t('limitError'));
      return;
    }
    setGenerating(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch('/api/generate-cover-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, userName, userEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403) {
          // Server confirmed no credits — sync local state
          setCredits(0);
          throw new Error(t('limitError'));
        }
        throw new Error(data.error ?? 'Generation failed');
      }
      setGeneratedHTML(data.html);
      // Optimistically reflect the credit deduction the server just made
      setCredits((c) => Math.max(0, c - 1));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setGenerating(false);
    }
  };

  // ── Save (via API route so cv_id can be auto-linked server-side) ────────────
  const saveToSupabase = async () => {
    if (!generatedHTML) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/save-cover-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle:    form.jobTitle,
          companyName: form.companyName,
          htmlContent: generatedHTML,
          language:    form.language,
          tone:        form.tone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      setSaved(true);
      setToast({ message: 'Lettre sauvegardée ✓', type: 'success' });
    } catch (e: unknown) {
      setToast({ message: e instanceof Error ? e.message : 'Failed to save', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // ── Copy ────────────────────────────────────────────────────────────────────
  const copyToClipboard = async () => {
    if (!previewRef.current) return;
    try {
      await navigator.clipboard.writeText(previewRef.current.innerText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  };

  // ── Download PDF (puppeteer via API) ────────────────────────────────────────
  const downloadPDF = async () => {
    if (!generatedHTML) return;
    setDownloading(true);
    setError('');
    const name     = `${form.jobTitle}-${form.companyName}`.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const filename = `cover-letter-${name}`;
    try {
      const res = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: generatedHTML, filename }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `${filename}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError('PDF download failed: ' + (e instanceof Error ? e.message : 'Unknown error'));
    } finally {
      setDownloading(false);
    }
  };

  // ── Modify with AI ──────────────────────────────────────────────────────────
  const handleModify = async () => {
    if (!generatedHTML || !modifyInstruction.trim()) return;
    if (credits <= 0) { setError(t('limitError')); return; }
    setModifying(true);
    setError('');
    try {
      const res = await fetch('/api/modify-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: generatedHTML, instruction: modifyInstruction }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403) setCredits(0);
        throw new Error(data.error ?? 'Modification failed');
      }
      setGeneratedHTML(data.html);
      setModifyHistory((h) => [modifyInstruction, ...h].slice(0, 8));
      setModifyInstruction('');
      setCredits((c) => Math.max(0, c - 1));
      setSaved(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setModifying(false);
    }
  };

  // ── Toolbar buttons ──────────────────────────────────────────────────────────
  const toolbar = (
    <div className="flex items-center gap-2">
      <button type="button" onClick={copyToClipboard}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700
          text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white
          hover:bg-gray-50 dark:hover:bg-gray-800 transition-all">
        {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
        {copied ? t('copied') : t('copyText')}
      </button>
      <button type="button" onClick={saveToSupabase} disabled={saving || saved}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700
          text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white
          hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-all">
        {saving ? <Loader2 size={12} className="animate-spin" /> : saved ? <Check size={12} className="text-emerald-500" /> : <Save size={12} />}
        {saved ? t('saved') : t('save')}
      </button>
      <button type="button" onClick={downloadPDF} disabled={downloading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
          bg-gradient-to-r from-cyan-600 to-violet-600 hover:from-cyan-500 hover:to-violet-500
          text-xs font-semibold text-white shadow-sm transition-all disabled:opacity-60">
        {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
        {downloading ? t('generatingPDF') : t('downloadPDF')}
      </button>
    </div>
  );

  return (
    <div className="flex h-full min-h-screen bg-gray-50 dark:bg-gray-950">

      {/* ── Left: Form ── */}
      <div className="flex flex-col w-full xl:w-[480px] xl:min-w-[480px] xl:border-r xl:border-gray-200 xl:dark:border-gray-800 bg-white dark:bg-gray-900 overflow-y-auto">

        {/* Header */}
        <div className="px-3 sm:px-6 pt-4 sm:pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-violet-500 flex items-center justify-center">
              <FileText size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">{t('title')}</h1>
              <p className="text-xs text-gray-400 dark:text-gray-500">{t('powered')}</p>
            </div>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 px-3 sm:px-6 pt-3 pb-0">
          {(['new', 'saved', 'templates'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all duration-150
                ${activeTab === tab
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
            >
              {tab === 'new' ? 'New Letter' : tab === 'saved' ? 'My Letters' : 'Templates'}
            </button>
          ))}
        </div>

        {/* Form body */}
        {activeTab === 'saved' ? (
          <SavedLettersList
            onView={(html) => setGeneratedHTML(html)}
            onToast={(message, type) => setToast({ message, type })}
          />
        ) : activeTab === 'templates' ? (
          <TemplatesTab onToast={(message, type) => setToast({ message, type: type ?? 'success' })} />
        ) : (
        <>
        <div className="flex-1 px-3 sm:px-6 py-4 sm:py-5 space-y-5 overflow-y-auto">

          {/* Job Title */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              <Briefcase size={13} className="text-gray-400" />
              {t('jobTitle')} <span className="text-red-400">*</span>
            </label>
            <input
              className={inputCls}
              value={form.jobTitle}
              onChange={(e) => set('jobTitle', e.target.value)}
              placeholder={t('jobTitlePlaceholder')}
            />
          </div>

          {/* Company Name */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              <Building2 size={13} className="text-gray-400" />
              {t('companyName')} <span className="text-red-400">*</span>
            </label>
            <input
              className={inputCls}
              value={form.companyName}
              onChange={(e) => set('companyName', e.target.value)}
              placeholder={t('companyNamePlaceholder')}
            />
          </div>

          {/* Job Description */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              <AlignLeft size={13} className="text-gray-400" />
              {t('jobDescription')} <span className="text-red-400">*</span>
              <span className="ml-1 text-xs font-normal text-gray-400">({t('jobDescriptionHint')})</span>
            </label>
            <textarea
              rows={8}
              className={`${inputCls} resize-none`}
              value={form.jobDescription}
              onChange={(e) => set('jobDescription', e.target.value)}
              placeholder={t('jobDescriptionPlaceholder')}
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {form.jobDescription.length} {t('characters')}
            </p>
          </div>

          {/* Tone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('tone')}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {TONES.map((tone) => {
                const isActive = form.tone === tone;
                return (
                  <button key={tone} type="button" onClick={() => set('tone', tone)}
                    className={`p-3 rounded-xl border-2 text-left transition-all duration-150
                      ${isActive
                        ? toneActiveClass[tone]
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}>
                    <p className={`text-sm font-semibold mb-0.5 ${!isActive ? 'text-gray-700 dark:text-gray-300' : ''}`}>
                      {t(`tones.${tone}`)}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 leading-tight">
                      {t(`tones.${tone}Desc`)}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Language */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('language')}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {LANGUAGES.map(({ value, label }) => (
                <button key={value} type="button" onClick={() => set('language', value)}
                  className={`py-2 px-3 rounded-xl border text-sm font-medium transition-all duration-150
                    ${form.language === value
                      ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Generate button */}
        <div className="px-3 sm:px-6 py-4 border-t border-gray-100 dark:border-gray-800">
          {/* Credits indicator */}
          <div className={`flex items-center justify-between mb-3 px-3 py-2 rounded-xl text-xs font-medium
            ${credits > 0
              ? 'bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300'
              : 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400'
            }`}>
            <span>
              {credits > 0
                ? `${credits} AI credit${credits === 1 ? '' : 's'} remaining`
                : 'No credits remaining'}
            </span>
            <span className={`font-bold tabular-nums ${credits === 0 ? 'text-red-500' : credits <= 3 ? 'text-amber-500' : 'text-emerald-500'}`}>
              {credits}
            </span>
          </div>

          {error && (
            <div className="mb-3 flex items-start gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}
          <button
            type="button"
            onClick={generate}
            disabled={generating || !canGenerate}
            className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl
              bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500
              text-white text-sm font-semibold shadow-lg shadow-violet-500/20
              disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            {generating
              ? <><Loader2 size={16} className="animate-spin" /> {t('generating')}</>
              : <><Sparkles size={16} /> {t('generate')}</>
            }
          </button>
          {!canGenerate && (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-2">
              {!hasCredits ? t('limitError') : t('fillRequired')}
            </p>
          )}
        </div>
        </>
        )}
      </div>

      {/* ── Right: Preview ── */}
      <div className="hidden xl:flex flex-1 flex-col bg-gray-100 dark:bg-gray-950/50 overflow-hidden">

        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
            <span className="ml-2 text-xs text-gray-400 dark:text-gray-500 font-medium">
              {form.jobTitle && form.companyName
                ? `${form.jobTitle} · ${form.companyName}`
                : t('previewTitle')}
            </span>
          </div>
          {generatedHTML && toolbar}
        </div>

        {/* Preview content */}
        <div className="flex-1 overflow-auto p-6">

          {/* Empty state */}
          {!generatedHTML && !generating && (
            <div className="h-full flex flex-col items-center justify-center text-center py-20">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-violet-500/10 flex items-center justify-center mb-5">
                <FileText size={32} className="text-violet-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                {t('emptyTitle')}
              </h3>
              <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs leading-relaxed">
                {t('emptyDesc')}
              </p>

              {/* Checklist */}
              <div className="mt-8 w-full max-w-xs space-y-2 text-left">
                {[
                  { label: t('checklistJobTitle'),    done: form.jobTitle.trim().length > 0 },
                  { label: t('checklistCompany'),     done: form.companyName.trim().length > 0 },
                  { label: t('checklistDescription'), done: form.jobDescription.trim().length > 20 },
                ].map(({ label, done }) => (
                  <div key={label} className="flex items-center gap-2 text-sm">
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0
                      ${done ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-gray-100 dark:bg-gray-800'}`}>
                      {done
                        ? <Check size={10} className="text-emerald-500" />
                        : <div className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
                      }
                    </div>
                    <span className={done ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Tip */}
              <div className="mt-6 w-full max-w-xs p-4 rounded-2xl bg-violet-50 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900/40 text-left">
                <p className="text-xs font-semibold text-violet-700 dark:text-violet-300 mb-1.5">
                  💡 {t('proTip')}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  {t('proTipText')}
                </p>
              </div>
            </div>
          )}

          {/* Generating spinner */}
          {generating && (
            <div className="h-full flex flex-col items-center justify-center text-center py-20">
              <div className="relative w-16 h-16 mb-5">
                <div className="absolute inset-0 rounded-full border-4 border-violet-200 dark:border-violet-900" />
                <div className="absolute inset-0 rounded-full border-4 border-violet-600 border-t-transparent animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles size={20} className="text-violet-500" />
                </div>
              </div>
              <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-1">
                {t('writingTitle')}
              </h3>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                {t('writingDesc', { company: form.companyName || '…', tone: t(`tones.${form.tone}`) })}
              </p>
            </div>
          )}

          {/* Generated preview + modify section */}
          {generatedHTML && !generating && (
            <>
              <div className="bg-white rounded-2xl shadow-xl shadow-gray-300/30 dark:shadow-black/30 overflow-hidden">
                <div
                  ref={previewRef}
                  className="cover-letter-preview"
                  dangerouslySetInnerHTML={{ __html: generatedHTML }}
                />
              </div>

              {/* Modify with AI */}
              <div className="mt-4 p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
                    <Sparkles size={12} className="text-white" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Modify with AI</h3>
                </div>

                {/* History chips */}
                {modifyHistory.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {modifyHistory.map((item, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium
                          bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400
                          border border-violet-100 dark:border-violet-800"
                      >
                        {item.length > 28 ? item.slice(0, 28) + '…' : item}
                        <span className="text-emerald-500 font-bold">✓</span>
                      </span>
                    ))}
                  </div>
                )}

                <textarea
                  rows={3}
                  value={modifyInstruction}
                  onChange={(e) => setModifyInstruction(e.target.value)}
                  placeholder="Ex: Make the tone more formal, shorten paragraph 2, add a sentence about my passion for technology…"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700
                    bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm
                    placeholder:text-gray-400 dark:placeholder:text-gray-500
                    focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent
                    resize-none transition-colors"
                />
                <button
                  type="button"
                  onClick={handleModify}
                  disabled={modifying || !modifyInstruction.trim() || credits <= 0}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl
                    bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500
                    text-white text-sm font-semibold shadow-md shadow-violet-500/20
                    disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                >
                  {modifying
                    ? <><Loader2 size={14} className="animate-spin" /> Applying…</>
                    : <><Sparkles size={14} /> Apply Modification</>
                  }
                </button>
                {credits <= 0 && (
                  <p className="text-xs text-red-500 dark:text-red-400 text-center">{t('limitError')}</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Mobile: generated letter overlay ── */}
      {generatedHTML && (
        <div className="xl:hidden fixed inset-0 z-50 bg-gray-100 dark:bg-gray-950 overflow-auto">
          <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setGeneratedHTML(null)}
              className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
            >
              <ChevronLeft size={16} /> {t('backToForm')}
            </button>
            <div className="flex items-center gap-2">
              <button type="button" onClick={copyToClipboard}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400">
                {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                {copied ? t('copied') : t('copyText')}
              </button>
              <button type="button" onClick={downloadPDF} disabled={downloading}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold disabled:opacity-60">
                {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                PDF
              </button>
            </div>
          </div>
          <div className="p-4">
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
              <div ref={previewRef} dangerouslySetInnerHTML={{ __html: generatedHTML }} />
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={closeToast} />}
    </div>
  );
}
