'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ParisPreview } from './pdf-preview/ParisPreview';
import {
  User, Briefcase, GraduationCap, Zap, Settings2,
  ChevronLeft, ChevronRight, Sparkles, Download,
  Save, Loader2, CheckCircle, AlertCircle, FileText, ArrowLeft,
} from 'lucide-react';
import Toast, { type ToastData } from '@/components/ui/Toast';
import SavedCVsList from './SavedCVsList';
import StepMode, { type CVMode } from './StepMode';
import StepPersonal from './StepPersonal';
import StepExperience from './StepExperience';
import StepEducation from './StepEducation';
import StepSkills from './StepSkills';
import StepPreferences from './StepPreferences';
import CVUploader from './CVUploader';
import { defaultFormData, DEFAULT_SKILL_CATEGORIES, PALETTE_COLORS, type CVFormData } from './types';
import { getTemplate } from './templates';
import DOMAIN_PLACEHOLDERS from './domainPlaceholders';
import CVMatchScore from './CVMatchScore';

// ─── Step definitions ─────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Personal Info',   icon: User,          short: 'Info' },
  { id: 2, label: 'Experience',      icon: Briefcase,     short: 'Exp.' },
  { id: 3, label: 'Education',       icon: GraduationCap, short: 'Edu.' },
  { id: 4, label: 'Skills',          icon: Zap,           short: 'Skills' },
  { id: 5, label: 'Generate',        icon: Settings2,     short: 'Generate' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mergeWithDefaults(parsed: Partial<CVFormData>): CVFormData {
  return {
    ...defaultFormData,
    ...parsed,
    preferences: {
      ...defaultFormData.preferences,
      ...(parsed.preferences ?? {}),
    },
    skillCategories:
      parsed.skillCategories?.length
        ? parsed.skillCategories
        : DEFAULT_SKILL_CATEGORIES.map((c) => ({ ...c, items: [] })),
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CVBuilderClient() {
  const [activeTab, setActiveTab] = useState<'builder' | 'saved'>('builder');
  const [mode, setMode]               = useState<CVMode>('select');
  const [step, setStep]               = useState(1);
  const [form, setForm]               = useState<CVFormData>(defaultFormData);
  const [generating, setGenerating]   = useState(false);
  const [generatingStep, setGeneratingStep] = useState<'translating' | 'building' | null>(null);
  const [describing, setDescribing]   = useState(false);
  const [saving, setSaving]           = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [generatedHTML, setGeneratedHTML] = useState<string | null>(null);
  const [error, setError]             = useState('');
  const [saved, setSaved]             = useState(false);
  const [toast, setToast]             = useState<ToastData | null>(null);
  const [modifyInstruction, setModifyInstruction] = useState('');
  const [modifying, setModifying]     = useState(false);
  const [modifyHistory, setModifyHistory] = useState<string[]>([]);
  const closeToast = useCallback(() => setToast(null), []);
  const [describeText, setDescribeText] = useState('');
  const [domainCategory, setDomainCategory] = useState('');       // left dropdown value
  const [categoryIsCustom, setCategoryIsCustom] = useState(false);
  const [customCategoryText, setCustomCategoryText] = useState('');
  const [specialityIsCustom, setSpecialityIsCustom] = useState(false);
  const [autoFillBanner, setAutoFillBanner] = useState(false);
  const previewRef   = useRef<HTMLDivElement>(null);
  const hiddenCVRef  = useRef<HTMLDivElement>(null);

  // ── Auto-fill personal info from Settings profile ──────────────────────────
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from('profiles')
        .select('full_name, phone, location, linkedin_url, portfolio_url')
        .eq('id', user.id)
        .single()
        .then(({ data: profile }) => {
          if (!profile) return;
          setForm(prev => {
            const pi = prev.personalInfo;
            const merged = {
              fullName:  !pi.fullName  && profile.full_name    ? profile.full_name    : pi.fullName,
              email:     !pi.email     && user.email           ? user.email           : pi.email,
              phone:     !pi.phone     && profile.phone        ? profile.phone        : pi.phone,
              location:  !pi.location  && profile.location     ? profile.location     : pi.location,
              linkedin:  !pi.linkedin  && profile.linkedin_url ? profile.linkedin_url : pi.linkedin,
              portfolio: !pi.portfolio && profile.portfolio_url? profile.portfolio_url: pi.portfolio,
            };
            const anyFilled =
              merged.fullName  !== pi.fullName  ||
              merged.email     !== pi.email     ||
              merged.phone     !== pi.phone     ||
              merged.location  !== pi.location  ||
              merged.linkedin  !== pi.linkedin  ||
              merged.portfolio !== pi.portfolio;
            if (anyFilled) setAutoFillBanner(true);
            return anyFilled ? { ...prev, personalInfo: merged } : prev;
          });
        });
    });
  }, []);

  const updateForm = <K extends keyof CVFormData>(key: K, value: CVFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const updatePreference = <K extends keyof CVFormData['preferences']>(key: K, value: CVFormData['preferences'][K]) =>
    setForm((prev) => ({ ...prev, preferences: { ...prev.preferences, [key]: value } }));

  const handleModeSelect = (selected: Exclude<CVMode, 'select'>) => {
    setMode(selected);
    if (selected === 'manual') setStep(1);
  };

  const handleParsed = (parsed: Partial<CVFormData>) => {
    setForm(mergeWithDefaults(parsed));
    setSaved(false);
    setGeneratedHTML(null);
    setMode('manual');
    setStep(1);
  };

  const handleDescribe = async () => {
    if (!describeText.trim()) return;
    setDescribing(true);
    setError('');
    try {
      const res = await fetch('/api/describe-cv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: describeText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to parse description');
      handleParsed(data.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setDescribing(false);
    }
  };

  const canNext = () => {
    if (step === 1) return !!form.personalInfo.fullName && !!form.personalInfo.email;
    return true;
  };

  const FRENCH_TEMPLATES = new Set(['paris-elegant', 'bordeaux-classique']);

  const generate = async () => {
    setGenerating(true);
    setGeneratingStep(null);
    setError('');
    setSaved(false);

    // If a template is selected, generate HTML client-side
    const tpl = form.preferences.template ? getTemplate(form.preferences.template) : null;
    if (tpl) {
      try {
        let formData = form;

        // French templates: translate all content to French first
        if (FRENCH_TEMPLATES.has(tpl.id)) {
          setGeneratingStep('translating');
          const res = await fetch('/api/translate-cv', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workExperience: form.workExperience,
              education: form.education,
              skills: form.skills,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.translated) {
              formData = {
                ...form,
                workExperience: data.translated.workExperience ?? form.workExperience,
                education:      data.translated.education      ?? form.education,
                skills:         data.translated.skills         ?? form.skills,
              };
            }
          }
          setGeneratingStep('building');
          await new Promise(r => setTimeout(r, 150));
        }

        const html = tpl.generateHTML(formData);
        setGeneratedHTML(html);
      } catch (e: unknown) {
        setError('Template generation failed: ' + (e instanceof Error ? e.message : 'Unknown error'));
      } finally {
        setGenerating(false);
        setGeneratingStep(null);
      }
      return;
    }

    // No template selected — use Claude API
    try {
      const res = await fetch('/api/generate-cv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalInfo: form.personalInfo,
          workExperience: form.workExperience,
          education: form.education,
          skills: form.skills,
          skillCategories: form.skillCategories,
          preferences: form.preferences,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Generation failed');
      setGeneratedHTML(data.html);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setGenerating(false);
    }
  };

  const saveCV = async () => {
    if (!generatedHTML) return;
    setSaving(true);
    try {
      const res = await fetch('/api/save-cv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `CV — ${form.personalInfo.fullName}`,
          formData: form,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      setSaved(true);
      setToast({ message: 'CV sauvegardé ✓', type: 'success' });
    } catch (e: unknown) {
      setToast({ message: e instanceof Error ? e.message : 'Failed to save', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const downloadPDF = async () => {
    const templateId = form.preferences.template;
    setDownloading(true);
    setError('');

    const name     = form.personalInfo.fullName.trim() || 'cv';
    const filename = `cv-${name.toLowerCase().replace(/\s+/g, '-')}.pdf`;

    try {
      if (templateId) {
        // Template-based CV: use react-pdf for a real, text-selectable ATS-friendly PDF
        const [{ pdf: renderPDF }, pdfComponents] = await Promise.all([
          import('@react-pdf/renderer'),
          import('./pdf'),
        ]);
        const { ParisPDF, BordeauxPDF, AmericanPDF, NewYorkPDF, LondonPDF } = pdfComponents;

        type PDFComponent = React.ComponentType<{ data: typeof form }>;
        const componentMap: Record<string, PDFComponent> = {
          'paris-elegant':      ParisPDF,
          'bordeaux-classique': BordeauxPDF,
          'american-classic':   AmericanPDF,
          'new-york-modern':    NewYorkPDF,
          'london-executive':   LondonPDF,
        };
        const Component = componentMap[templateId];
        if (!Component) throw new Error(`Unknown template: ${templateId}`);

        const element = React.createElement(Component, { data: form });
        // Cast needed: pdf() expects ReactElement<DocumentProps> but component wraps it
        const blob    = await renderPDF(element as React.ReactElement<never>).toBlob();
        const url     = URL.createObjectURL(blob);
        const a       = document.createElement('a');
        a.href        = url;
        a.download    = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // Claude-generated HTML: use html2canvas + jsPDF (image-based)
        if (!generatedHTML) {
          setError('No CV to download. Please generate a CV first.');
          setDownloading(false);
          return;
        }
        if (!hiddenCVRef.current) {
          setError('PDF preview not ready — please wait a moment and try again.');
          setDownloading(false);
          return;
        }

        const [html2canvasModule, jsPDFModule] = await Promise.all([
          import('html2canvas'),
          import('jspdf'),
        ]);
        const html2canvas = html2canvasModule.default;
        const jsPDF       = jsPDFModule.jsPDF;

        const canvas = await html2canvas(hiddenCVRef.current, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: null,
          logging: false,
          width: 794,
          windowWidth: 794,
        });

        const imgData = canvas.toDataURL('image/png');
        const doc     = new jsPDF('p', 'mm', 'a4');
        doc.addImage(imgData, 'PNG', 0, 0, 210, 297);
        doc.save(filename);
      }
    } catch (e: unknown) {
      setError('PDF download failed: ' + (e instanceof Error ? e.message : 'Unknown error'));
    } finally {
      setDownloading(false);
    }
  };

  const handleModify = async () => {
    if (!generatedHTML || !modifyInstruction.trim()) return;
    setModifying(true);
    setError('');
    try {
      // For template-based CVs: modify the JSON data, then re-render through the
      // template engine so the layout (columns, sidebar, etc.) is always preserved.
      const tpl = form.preferences.template ? getTemplate(form.preferences.template) : null;
      if (tpl) {
        const res = await fetch('/api/modify-cv-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ formData: form, instruction: modifyInstruction }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Modification failed');
        const modifiedForm: CVFormData = { ...form, ...data.formData, preferences: form.preferences };
        setForm(modifiedForm);
        setGeneratedHTML(tpl.generateHTML(modifiedForm));
      } else {
        // No template (Claude-generated HTML) — fall back to HTML modification
        const res = await fetch('/api/modify-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ html: generatedHTML, instruction: modifyInstruction }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Modification failed');
        setGeneratedHTML(data.html);
      }
      setModifyHistory((h) => [modifyInstruction, ...h].slice(0, 8));
      setModifyInstruction('');
      setSaved(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setModifying(false);
    }
  };

  const progressPct = ((step - 1) / (STEPS.length - 1)) * 100;
  const basePalette = PALETTE_COLORS[form.preferences.colorPalette];
  const palette = form.preferences.customColor
    ? { ...basePalette, primary: form.preferences.customColor, accent: form.preferences.customColor }
    : basePalette;

  // ── Left panel content based on mode ──────────────────────────────────────

  const renderLeftContent = () => {
    // ── Mode selector ──
    if (mode === 'select') {
      return (
        <div className="flex-1 px-6 py-5">
          <StepMode onSelect={handleModeSelect} />
        </div>
      );
    }

    // ── Upload mode ──
    if (mode === 'upload') {
      return (
        <div className="flex-1 px-6 py-5">
          <button
            type="button"
            onClick={() => setMode('select')}
            className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white mb-5 transition-colors"
          >
            <ArrowLeft size={14} /> Back
          </button>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Upload your CV</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
            PDF or Word — AI extracts all information automatically
          </p>
          <CVUploader onParsed={handleParsed} />
        </div>
      );
    }

    // ── Describe mode ──
    if (mode === 'describe') {
      const currentDomain = form.preferences.domain;
      const specialityKey = currentDomain.includes(' › ') ? currentDomain.split(' › ')[1] : currentDomain;
      const placeholder = DOMAIN_PLACEHOLDERS[specialityKey] ?? DOMAIN_PLACEHOLDERS[''];

      return (
        <div className="flex-1 px-6 py-5">
          <button
            type="button"
            onClick={() => setMode('select')}
            className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white mb-5 transition-colors"
          >
            <ArrowLeft size={14} /> Back
          </button>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Describe your profile</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Write freely — AI will fill your entire CV from your description.
          </p>

          {/* ── Domain + Speciality — two side-by-side selectors ── */}
          {(() => {
            const DOMAIN_MAP: Record<string, string[]> = {
              'Health & Medical':       ['General Medicine','Cardiology','Neurology','Dentistry','Ophthalmology','Gynaecology','Paediatrics','Orthopaedics','Pulmonology','Medical Biology','Pharmacy','General Surgery','Nursing & Care','Physiotherapy','Psychiatry','Radiology','Emergency & ICU','Geriatrics','ENT','Anaesthesiology'],
              'Technology':             ['Web Development','Artificial Intelligence','Cybersecurity','Cloud / DevOps','Data Science','Game Development','UI / UX Design','Systems Administration','Technical Support','E-commerce'],
              'Law & Legal':            ['Lawyer / Attorney','Judiciary','Notary','Bailiff','Business Law','International Law'],
              'Finance & Business':     ['Accounting / Audit','Banking / Finance','Stock Market / Investment','Insurance','Consulting / Management','Real Estate','Entrepreneurship'],
              'Engineering':            ['Civil Engineering','Electrical Engineering','Mechanical Engineering','Oil & Gas','Environmental Engineering','Industrial Engineering','Automotive / Aerospace','Naval / Maritime','Chemical Engineering','Mining / Geology'],
              'Education':              ['Primary Education','Higher Education','Scientific Research','Vocational Training','Early Childhood'],
              'Media & Communication':  ['Journalism','Film / Audiovisual','Graphic Arts','Photography','Performing Arts','Music','Writing / Copywriting','Public Relations','Marketing / Advertising'],
              'Social & HR':            ['Human Resources','Social Work','Public Service','Security / Defence','Fire & Rescue','Police / Law Enforcement'],
              'Transport & Logistics':  ['Aviation / Piloting','Hospitality / Tourism','Restaurant / Culinary','Transport / Logistics','Maritime / Cruise'],
              'Agriculture & Environment': ['Agriculture / Agronomy','Livestock / Veterinary','Forestry','Ecology'],
              'Commerce & Sales':       ['Retail / Distribution','Sales / Business Development','Import / Export','Purchasing / Supply Chain'],
            };
            const selectCls = 'w-full px-2.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-colors appearance-none cursor-pointer';
            const inputCls  = 'w-full px-2.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-colors';
            const labelCls  = 'block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1';
            const specialities = domainCategory ? DOMAIN_MAP[domainCategory] ?? [] : [];
            const bothCustom = categoryIsCustom;

            return (
              <div className="mb-3 flex gap-2">
                {/* ── LEFT: Domain ── */}
                <div className="flex-1 min-w-0">
                  <span className={labelCls}>Your Domain</span>
                  {categoryIsCustom ? (
                    <div className="space-y-1">
                      <input
                        type="text"
                        value={customCategoryText}
                        onChange={(e) => {
                          setCustomCategoryText(e.target.value);
                          updatePreference('domain', e.target.value + (form.preferences.domain.includes(' › ') ? ' › ' + form.preferences.domain.split(' › ')[1] : ''));
                        }}
                        placeholder="Ex: Architecture, Diplomacy…"
                        className={inputCls}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => { setCategoryIsCustom(false); setCustomCategoryText(''); setDomainCategory(''); setSpecialityIsCustom(false); updatePreference('domain', ''); }}
                        className="text-[11px] text-violet-600 dark:text-violet-400 hover:underline"
                      >
                        ← Choose from list
                      </button>
                    </div>
                  ) : (
                    <select
                      value={domainCategory}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__custom__') {
                          setCategoryIsCustom(true);
                          setDomainCategory('');
                          setSpecialityIsCustom(true);
                          updatePreference('domain', '');
                        } else {
                          setDomainCategory(val);
                          setSpecialityIsCustom(false);
                          updatePreference('domain', val ? val : '');
                        }
                      }}
                      className={selectCls}
                    >
                      <option value="">— Select a domain —</option>
                      {Object.keys(DOMAIN_MAP).map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                      <option value="__custom__">Other — type manually</option>
                    </select>
                  )}
                </div>

                {/* ── RIGHT: Speciality ── */}
                <div className="flex-1 min-w-0">
                  <span className={labelCls}>Your Speciality</span>
                  {(bothCustom || specialityIsCustom) ? (
                    <div className="space-y-1">
                      <input
                        type="text"
                        value={specialityIsCustom && !bothCustom ? (form.preferences.domain.includes(' › ') ? form.preferences.domain.split(' › ')[1] : form.preferences.domain) : (form.preferences.domain.includes(' › ') ? form.preferences.domain.split(' › ')[1] : '')}
                        onChange={(e) => {
                          const cat = bothCustom ? customCategoryText : domainCategory;
                          updatePreference('domain', cat ? cat + ' › ' + e.target.value : e.target.value);
                        }}
                        placeholder="Ex: Osteopathy, Tattoo Artist…"
                        className={inputCls}
                      />
                      {!bothCustom && (
                        <button
                          type="button"
                          onClick={() => { setSpecialityIsCustom(false); updatePreference('domain', domainCategory); }}
                          className="text-[11px] text-violet-600 dark:text-violet-400 hover:underline"
                        >
                          ← Choose from list
                        </button>
                      )}
                    </div>
                  ) : (
                    <select
                      value={form.preferences.domain.includes(' › ') ? form.preferences.domain.split(' › ')[1] : (domainCategory && form.preferences.domain === domainCategory ? '' : form.preferences.domain)}
                      disabled={!domainCategory}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__custom__') {
                          setSpecialityIsCustom(true);
                          updatePreference('domain', domainCategory);
                        } else {
                          updatePreference('domain', domainCategory + ' › ' + val);
                        }
                      }}
                      className={selectCls + (!domainCategory ? ' opacity-40 cursor-not-allowed' : '')}
                    >
                      <option value="">{domainCategory ? '— Select a speciality —' : '— Select a domain first —'}</option>
                      {specialities.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                      {domainCategory && <option value="__custom__">Other — type manually</option>}
                    </select>
                  )}
                </div>
              </div>
            );
          })()}

          <textarea
            value={describeText}
            onChange={(e) => setDescribeText(e.target.value)}
            placeholder={placeholder}
            rows={9}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700
              bg-white dark:bg-gray-800 text-gray-900 dark:text-white
              placeholder:text-gray-400 dark:placeholder:text-gray-500
              focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent
              resize-none text-sm transition-colors"
          />
          {error && (
            <div className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}
          <button
            type="button"
            onClick={handleDescribe}
            disabled={describing || !describeText.trim()}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl
              bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500
              text-white text-sm font-semibold shadow-lg shadow-violet-500/20
              disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {describing ? (
              <><Loader2 size={16} className="animate-spin" /> Generating your CV…</>
            ) : (
              <><Sparkles size={16} /> Fill CV with AI</>
            )}
          </button>
        </div>
      );
    }

    // ── Manual wizard mode ──
    return (
      <>
        <div className="flex-1 px-6 py-5">
          {/* Auto-fill banner */}
          {autoFillBanner && (
            <div className="flex items-center justify-between gap-3 mb-4 px-3 py-2.5 rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800">
              <p className="text-xs text-violet-700 dark:text-violet-300 font-medium">
                Profile data auto-filled from your Settings
              </p>
              <button
                type="button"
                onClick={() => setAutoFillBanner(false)}
                className="text-violet-400 hover:text-violet-600 dark:hover:text-violet-200 text-xs font-semibold flex-shrink-0"
              >
                ✕
              </button>
            </div>
          )}
          {step === 1 && (
            <StepPersonal
              data={form.personalInfo}
              onChange={(v) => updateForm('personalInfo', v)}
            />
          )}
          {step === 2 && (
            <StepExperience
              data={form.workExperience}
              onChange={(v) => updateForm('workExperience', v)}
              targetCountry={form.preferences.targetCountry}
              language={form.preferences.language}
            />
          )}
          {step === 3 && (
            <StepEducation
              data={form.education}
              onChange={(v) => updateForm('education', v)}
              targetCountry={form.preferences.targetCountry}
            />
          )}
          {step === 4 && (
            <StepSkills
              data={form.skills}
              onChange={(v) => updateForm('skills', v)}
              targetCountry={form.preferences.targetCountry}
              skillCategories={form.skillCategories}
              onCategoriesChange={(v) => updateForm('skillCategories', v)}
            />
          )}
          {step === 5 && (
            <StepPreferences
              data={form.preferences}
              onChange={(v) => updateForm('preferences', v)}
            />
          )}
          {step === 5 && (
            <div className="mt-4">
              <CVMatchScore cvData={form} />
            </div>
          )}
        </div>

        {/* Navigation footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => step === 1 ? setMode('select') : setStep((s) => s - 1)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700
              text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white
              hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
          >
            <ChevronLeft size={15} /> {step === 1 ? 'Menu' : 'Back'}
          </button>

          {step < 5 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl
                bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400
                text-white text-sm font-semibold shadow-lg shadow-violet-500/20
                disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              Continue <ChevronRight size={15} />
            </button>
          ) : (
            <button
              type="button"
              onClick={generate}
              disabled={generating || !form.personalInfo.fullName}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl
                bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500
                text-white text-sm font-bold shadow-xl shadow-violet-500/30
                disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {generating ? (
                <><Loader2 size={16} className="animate-spin" /> Generating…</>
              ) : (
                <>🚀 Generate CV with AI</>
              )}
            </button>
          )}
        </div>
      </>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-screen bg-gray-50 dark:bg-gray-950">

      {/* ── Hidden CV capture div (Paris Élégant) ── */}
      {form.preferences.template === 'paris-elegant' && (
        <div
          ref={hiddenCVRef}
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '-9999px',
            top: 0,
            width: '794px',
            overflow: 'visible',
            pointerEvents: 'none',
          }}
        >
          <ParisPreview data={form} />
        </div>
      )}

      {/* ── Left panel ── */}
      <div className="flex flex-col w-full xl:w-[520px] xl:min-w-[520px] xl:border-r xl:border-gray-200 xl:dark:border-gray-800 bg-white dark:bg-gray-900 overflow-y-auto">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${palette.primary}, ${palette.accent})` }}>
              <FileText size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">CV Builder</h1>
              <p className="text-xs text-gray-400 dark:text-gray-500">Powered by Claude AI</p>
            </div>
          </div>

          {/* Main tab switcher */}
          <div className="flex gap-1 mb-3">
            {(['builder', 'saved'] as const).map((tab) => (
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
                {tab === 'builder' ? 'Builder' : 'My CVs'}
              </button>
            ))}
          </div>

          {/* Step tabs — only in manual mode and builder tab */}
          {activeTab === 'builder' && mode === 'manual' && (
            <>
              <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
                {STEPS.map((s) => {
                  const Icon = s.icon;
                  const isDone   = step > s.id;
                  const isActive = step === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => s.id < step && setStep(s.id)}
                      disabled={s.id > step}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150 flex-shrink-0
                        ${isActive
                          ? 'bg-violet-600 text-white shadow-sm'
                          : isDone
                          ? 'bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 cursor-pointer hover:bg-violet-100 dark:hover:bg-violet-900/50'
                          : 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                        }`}
                    >
                      {isDone ? <CheckCircle size={13} /> : <Icon size={13} />}
                      <span className="hidden sm:inline">{s.short}</span>
                      <span className="sm:hidden">{s.id}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progressPct}%`, background: `linear-gradient(90deg, ${palette.primary}, ${palette.accent})` }}
                />
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                Step {step} of {STEPS.length} — {STEPS[step - 1].label}
              </p>
            </>
          )}
        </div>

        {/* Mode-dependent content */}
        {activeTab === 'saved' ? (
          <SavedCVsList
            onView={(html) => setGeneratedHTML(html)}
            onToast={(message, type) => setToast({ message, type })}
          />
        ) : renderLeftContent()}
      </div>

      {/* ── Right panel: preview ── */}
      <div className="hidden xl:flex flex-1 flex-col bg-gray-100 dark:bg-gray-950/50 overflow-hidden">

        {/* Preview toolbar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
            <span className="ml-2 text-xs text-gray-400 dark:text-gray-500 font-medium">CV Preview</span>
          </div>
          {generatedHTML && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={saveCV}
                disabled={saving || saved}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700
                  text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white
                  hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-all"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : saved ? <CheckCircle size={12} className="text-emerald-500" /> : <Save size={12} />}
                {saved ? 'Saved!' : 'Save'}
              </button>
              <button
                type="button"
                onClick={downloadPDF}
                disabled={downloading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                  text-xs font-semibold text-white shadow-sm transition-all disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${palette.primary}, ${palette.accent})` }}
              >
                {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                {downloading ? 'Generating…' : 'Download PDF'}
              </button>
            </div>
          )}
        </div>

        {/* Preview area */}
        <div className="flex-1 overflow-auto p-6">
          {error && (
            <div className="mb-4 flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          {!generatedHTML && !generating && (
            <div className="h-full flex flex-col items-center justify-center text-center py-20">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: `linear-gradient(135deg, ${palette.primary}18, ${palette.accent}18)` }}>
                <Sparkles size={32} style={{ color: palette.accent }} />
              </div>
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Your CV will appear here
              </h3>
              <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs">
                Fill in your details and click <strong className="text-violet-600 dark:text-violet-400">&quot;Generate CV with AI&quot;</strong> on the last step.
              </p>

              <div className="mt-8 w-full max-w-sm space-y-2 text-left">
                {[
                  { label: 'Personal Info',    done: !!form.personalInfo.fullName },
                  { label: 'Work Experience',  done: form.workExperience.length > 0 },
                  { label: 'Education',        done: form.education.length > 0 },
                  { label: 'Skills',           done: form.skills.length > 0 || form.skillCategories.some((c) => c.items.length > 0) },
                ].map(({ label, done }) => (
                  <div key={label} className="flex items-center gap-2 text-sm">
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0
                      ${done ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-gray-100 dark:bg-gray-800'}`}>
                      {done
                        ? <CheckCircle size={12} className="text-emerald-500" />
                        : <div className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
                      }
                    </div>
                    <span className={done ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                {generatingStep === 'translating' ? 'Translating content to French…' : 'Generating your CV…'}
              </h3>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                {generatingStep === 'translating' ? 'Job titles, descriptions and skills are being translated.' : 'Please wait a moment.'}
              </p>
            </div>
          )}

          {generatedHTML && !generating && (
            <>
              <div className="bg-white rounded-2xl shadow-xl shadow-gray-300/30 dark:shadow-black/30 overflow-hidden">
                <div ref={previewRef} className="cv-preview" dangerouslySetInnerHTML={{ __html: generatedHTML }} />
              </div>

              {/* Modify CV with AI */}
              <div className="mt-4 p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: `linear-gradient(135deg, ${palette.primary}, ${palette.accent})` }}>
                    <Sparkles size={12} className="text-white" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Modify CV with AI</h3>
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
                  placeholder="Ex: Make the summary more concise, add a stronger opening sentence, highlight leadership skills more…"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700
                    bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm
                    placeholder:text-gray-400 dark:placeholder:text-gray-500
                    focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent
                    resize-none transition-colors"
                />
                <button
                  type="button"
                  onClick={handleModify}
                  disabled={modifying || !modifyInstruction.trim()}
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
              </div>
            </>
          )}
        </div>

        {/* Mobile generate + download strip */}
        {generatedHTML && (
          <div className="xl:hidden fixed bottom-0 inset-x-0 p-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex gap-2">
            <button
              type="button"
              onClick={saveCV}
              disabled={saving || saved}
              className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400 disabled:opacity-50"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {saved ? 'Saved!' : 'Save'}
            </button>
            <button
              type="button"
              onClick={downloadPDF}
              disabled={downloading}
              className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: `linear-gradient(135deg, ${palette.primary}, ${palette.accent})` }}
            >
              {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              {downloading ? 'Generating…' : 'Download PDF'}
            </button>
          </div>
        )}
      </div>

      {/* Mobile: fullscreen CV preview */}
      {generatedHTML && (
        <div className="xl:hidden fixed inset-0 z-50 bg-gray-100 dark:bg-gray-950 overflow-auto pt-16">
          <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setGeneratedHTML(null)}
              className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
            >
              <ChevronLeft size={16} /> Back to editor
            </button>
            <button
              type="button"
              onClick={downloadPDF}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-semibold"
              style={{ backgroundColor: palette.accent }}
            >
              <Download size={13} /> PDF
            </button>
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
