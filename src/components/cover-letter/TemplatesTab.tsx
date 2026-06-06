'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, Plus, Search, Edit2, Trash2, Sparkles,
  FileText, Copy, Check, Download, X, BookOpen,
  Clock, BarChart2,
} from 'lucide-react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Template {
  id: string;
  name: string;
  category: string;
  content: string;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
}

const CATEGORIES = ['Santé', 'Tech', 'Commercial', 'BTP', 'Éducation', 'Autre'];

const CATEGORY_COLORS: Record<string, string> = {
  'Santé':      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'Tech':       'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'Commercial': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'BTP':        'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  'Éducation':  'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  'Autre':      'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

function daysAgo(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days === 0) return "aujourd'hui";
  if (days === 1) return 'il y a 1 jour';
  return `il y a ${days} jours`;
}

const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 ' +
  'bg-white dark:bg-gray-800 text-gray-900 dark:text-white ' +
  'placeholder:text-gray-400 dark:placeholder:text-gray-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent ' +
  'transition-colors text-sm';

// ─── Template form modal (create / edit) ─────────────────────────────────────

interface TemplateFormProps {
  initial?: Template;
  onSave:  (t: Template) => void;
  onClose: () => void;
}

function TemplateFormModal({ initial, onSave, onClose }: TemplateFormProps) {
  const [name,     setName]     = useState(initial?.name     ?? '');
  const [category, setCategory] = useState(initial?.category ?? 'Autre');
  const [content,  setContent]  = useState(initial?.content  ?? '');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  const handleSubmit = async () => {
    if (!name.trim() || !content.trim()) {
      setError('Le nom et le contenu sont obligatoires');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const url    = initial ? `/api/letter-templates/${initial.id}` : '/api/letter-templates';
      const method = initial ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), category, content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      onSave({
        id:           initial?.id            ?? data.id,
        name:         name.trim(),
        category,
        content,
        use_count:    initial?.use_count     ?? 0,
        last_used_at: initial?.last_used_at  ?? null,
        created_at:   initial?.created_at    ?? new Date().toISOString(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la sauvegarde');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="font-bold text-sm text-gray-900 dark:text-white">
            {initial ? 'Modifier le template' : 'Nouveau template'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto max-h-[70vh]">
          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Nom du template <span className="text-red-400">*</span>
            </label>
            <input
              className={inputCls}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="ex: Lettre Infirmier IDE"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Catégorie
            </label>
            <select className={inputCls} value={category} onChange={e => setCategory(e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Contenu <span className="text-red-400">*</span>
            </label>
            <textarea
              rows={12}
              className={`${inputCls} resize-none`}
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Collez ou rédigez votre lettre type ici…"
            />
            <p className="text-xs text-gray-400 mt-1">{content.length} caractères</p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-60 transition-colors flex items-center gap-2"
          >
            {saving ? <><Loader2 size={13} className="animate-spin" /> Enregistrement…</> : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Use template modal ───────────────────────────────────────────────────────

interface UseTemplateModalProps {
  template: Template;
  onClose:  () => void;
  onUsed:   (id: string) => void;
  onToast:  (msg: string, type?: 'success' | 'error') => void;
}

function UseTemplateModal({ template, onClose, onUsed, onToast }: UseTemplateModalProps) {
  const [step,           setStep]           = useState<'form' | 'result'>('form');
  const [jobTitle,       setJobTitle]       = useState('');
  const [companyName,    setCompanyName]    = useState('');
  const [companyCity,    setCompanyCity]    = useState('');
  const [description,    setDescription]    = useState('');
  const [generating,     setGenerating]     = useState(false);
  const [adaptedText,    setAdaptedText]    = useState('');
  const [copied,         setCopied]         = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [error,          setError]          = useState('');

  const handleGenerate = async () => {
    if (!jobTitle.trim() || !companyName.trim()) {
      setError("Le titre du poste et l'entreprise sont obligatoires");
      return;
    }
    setGenerating(true);
    setError('');
    try {
      const res = await fetch(`/api/letter-templates/${template.id}/adapt`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobTitle, companyName, companyCity, description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Génération échouée');
      setAdaptedText(data.text);
      setStep('result');
      onUsed(template.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la génération');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(adaptedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const { jsPDF } = await import('jspdf');
      const date     = new Date().toLocaleDateString('fr-FR').replace(/\//g, '-');
      const safe     = companyName.replace(/[^a-zA-Z0-9]/g, '_');
      const doc      = new jsPDF({ unit: 'mm', format: 'a4' });
      const maxWidth = 170;
      const maxY     = doc.internal.pageSize.getHeight() - 15;
      let y          = 15;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(26, 26, 46);

      const blocks = adaptedText.replace(/\r\n/g, '\n').split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
      for (const block of blocks) {
        if (y > maxY) break;
        const lines = doc.splitTextToSize(block, maxWidth) as string[];
        for (const line of lines) {
          if (y > maxY) break;
          doc.text(line, 20, y);
          y += 6;
        }
        y += 4;
      }

      doc.save(`Lettre_${safe}_${date}.pdf`);
    } catch {
      onToast('Erreur lors de la génération du PDF', 'error');
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div>
            <h3 className="font-bold text-sm text-gray-900 dark:text-white">
              {step === 'form' ? `Utiliser "${template.name}"` : 'Lettre adaptée ✓'}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {step === 'form' ? 'Renseignez les détails du poste' : 'Votre lettre personnalisée est prête'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'form' ? (
            <div className="space-y-4">
              {/* Template preview */}
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 flex items-center gap-2">
                  <FileText size={11} className="text-gray-400" />
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Template original</span>
                </div>
                <div className="px-4 py-3 max-h-36 overflow-y-auto">
                  <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap leading-relaxed">
                    {template.content.slice(0, 400)}{template.content.length > 400 ? '…' : ''}
                  </p>
                </div>
              </div>

              {error && (
                <div className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Titre du poste <span className="text-red-400">*</span>
                  </label>
                  <input
                    className={inputCls}
                    value={jobTitle}
                    onChange={e => setJobTitle(e.target.value)}
                    placeholder="ex: Infirmier IDE"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Entreprise <span className="text-red-400">*</span>
                  </label>
                  <input
                    className={inputCls}
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    placeholder="ex: Hôpital Saint-Louis"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Ville</label>
                <input
                  className={inputCls}
                  value={companyCity}
                  onChange={e => setCompanyCity(e.target.value)}
                  placeholder="ex: Paris"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Description du poste</label>
                <textarea
                  rows={5}
                  className={`${inputCls} resize-none`}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Collez la description du poste ici pour une meilleure personnalisation…"
                />
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 flex items-center gap-2">
                <Check size={11} className="text-emerald-500" />
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Lettre adaptée — {jobTitle} chez {companyName}</span>
              </div>
              <div className="px-4 py-4">
                <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                  {adaptedText}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
          {step === 'form' ? (
            <button
              onClick={handleGenerate}
              disabled={generating || !jobTitle.trim() || !companyName.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white
                bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500
                disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {generating
                ? <><Loader2 size={15} className="animate-spin" /> Génération en cours…</>
                : <><Sparkles size={15} /> Générer la lettre adaptée</>
              }
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium
                  border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300
                  hover:border-violet-300 dark:hover:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950/30 hover:text-violet-700 dark:hover:text-violet-400 transition-all"
              >
                {copied
                  ? <><Check size={14} className="text-emerald-500" /> Copié ✓</>
                  : <><Copy size={14} /> Copier le texte</>
                }
              </button>
              <button
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white
                  bg-gradient-to-r from-cyan-600 to-violet-600 hover:from-cyan-500 hover:to-violet-500
                  disabled:opacity-60 transition-all"
              >
                {downloadingPdf
                  ? <><Loader2 size={14} className="animate-spin" /> PDF…</>
                  : <><Download size={14} /> Télécharger PDF</>
                }
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main TemplatesTab ────────────────────────────────────────────────────────

interface Props {
  onToast: (message: string, type?: 'success' | 'error') => void;
}

export default function TemplatesTab({ onToast }: Props) {
  const [templates,    setTemplates]    = useState<Template[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [filterCat,    setFilterCat]    = useState('');
  const [deleteId,     setDeleteId]     = useState<string | null>(null);
  const [deleting,     setDeleting]     = useState(false);
  const [editTemplate, setEditTemplate] = useState<Template | null>(null);
  const [showNew,      setShowNew]      = useState(false);
  const [useTemplate,  setUseTemplate]  = useState<Template | null>(null);

  const fetchTemplates = useCallback(async () => {
    const res = await fetch('/api/letter-templates');
    if (res.ok) {
      const { templates: data } = await res.json();
      setTemplates(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    const res = await fetch(`/api/letter-templates/${deleteId}`, { method: 'DELETE' });
    if (res.ok) {
      setTemplates(prev => prev.filter(t => t.id !== deleteId));
      onToast('Template supprimé ✓', 'success');
    } else {
      onToast('Erreur lors de la suppression', 'error');
    }
    setDeleteId(null);
    setDeleting(false);
  };

  const handleSaved = (t: Template) => {
    setTemplates(prev => {
      const idx = prev.findIndex(x => x.id === t.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = t; return next; }
      return [t, ...prev];
    });
    setEditTemplate(null);
    setShowNew(false);
    onToast('Template sauvegardé ✓', 'success');
  };

  const handleUsed = (id: string) => {
    setTemplates(prev => prev.map(t =>
      t.id === id ? { ...t, use_count: t.use_count + 1, last_used_at: new Date().toISOString() } : t
    ));
  };

  const filtered = templates.filter(t => {
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.content.toLowerCase().includes(search.toLowerCase());
    const matchCat    = !filterCat || t.category === filterCat;
    return matchSearch && matchCat;
  });

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-violet-400" />
      </div>
    );
  }

  return (
    <>
      {/* ── Search + New button ── */}
      <div className="px-4 pt-4 pb-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700
                bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400
                focus:outline-none focus:ring-2 focus:ring-violet-500 transition-colors"
              placeholder="Rechercher un template…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 transition-colors flex-shrink-0"
          >
            <Plus size={13} /> Nouveau
          </button>
        </div>

        {/* ── Category filter pills ── */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          <button
            onClick={() => setFilterCat('')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors flex-shrink-0
              ${!filterCat ? 'bg-violet-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
          >
            Toutes
          </button>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCat(cat === filterCat ? '' : cat)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors flex-shrink-0
                ${filterCat === cat ? 'bg-violet-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ── Empty state ── */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center flex-1 py-16 text-center px-6">
          <div className="relative w-24 h-24 mb-5">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-cyan-500/10 to-violet-500/10 border-2 border-dashed border-violet-200 dark:border-violet-800" />
            <div className="absolute inset-0 flex items-center justify-center">
              <BookOpen size={36} className="text-violet-300 dark:text-violet-600" />
            </div>
          </div>
          <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-1">
            {search || filterCat ? 'Aucun résultat' : 'Aucun template'}
          </h3>
          <p className="text-sm text-gray-400 dark:text-gray-500 max-w-[200px] leading-relaxed">
            {search || filterCat
              ? 'Modifiez votre recherche ou filtre.'
              : 'Créez votre premier template en cliquant sur "+ Nouveau".'}
          </p>
        </div>
      )}

      {/* ── Cards list ── */}
      {filtered.length > 0 && (
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3 pb-4">
          {filtered.map(t => (
            <div
              key={t.id}
              className="p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60
                hover:border-violet-200 dark:hover:border-violet-800/60 transition-colors"
            >
              {/* Name + category */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-semibold text-sm text-gray-900 dark:text-white truncate leading-tight">{t.name}</h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${CATEGORY_COLORS[t.category] ?? CATEGORY_COLORS['Autre']}`}>
                  {t.category}
                </span>
              </div>

              {/* Preview */}
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3 mb-2.5 leading-relaxed">
                {t.content.slice(0, 150)}{t.content.length > 150 ? '…' : ''}
              </p>

              {/* Stats */}
              <div className="flex items-center gap-3 mb-3 text-[11px] text-gray-400 dark:text-gray-500">
                <span className="flex items-center gap-1">
                  <BarChart2 size={10} /> Utilisé {t.use_count} fois
                </span>
                {t.last_used_at && (
                  <span className="flex items-center gap-1">
                    <Clock size={10} /> {daysAgo(t.last_used_at)}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setUseTemplate(t)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 transition-colors"
                >
                  <Sparkles size={11} /> Utiliser
                </button>
                <button
                  onClick={() => setEditTemplate(t)}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                    border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300
                    hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <Edit2 size={11} /> Modifier
                </button>
                <button
                  onClick={() => setDeleteId(t.id)}
                  className="flex items-center justify-center p-1.5 rounded-lg border border-gray-200 dark:border-gray-700
                    text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-200 dark:hover:border-red-800 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modals ── */}
      {(showNew || editTemplate) && (
        <TemplateFormModal
          initial={editTemplate ?? undefined}
          onSave={handleSaved}
          onClose={() => { setShowNew(false); setEditTemplate(null); }}
        />
      )}

      {useTemplate && (
        <UseTemplateModal
          template={useTemplate}
          onClose={() => setUseTemplate(null)}
          onUsed={handleUsed}
          onToast={onToast}
        />
      )}

      {deleteId && (
        <ConfirmDialog
          title="Supprimer ce template ?"
          message="Ce template sera définitivement supprimé et ne pourra pas être récupéré."
          confirmLabel="Supprimer"
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
          loading={deleting}
        />
      )}
    </>
  );
}
