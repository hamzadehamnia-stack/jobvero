'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Loader2, FileText, Trash2, Eye, Download,
  Calendar, Globe, LayoutTemplate,
} from 'lucide-react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { getTemplate } from './templates';
import type { CVFormData } from './types';

interface SavedCV {
  id: string;
  title: string;
  content: CVFormData;
  template: string | null;
  country: string | null;
  created_at: string;
}

const TEMPLATE_NAMES: Record<string, string> = {
  'paris-elegant':      'Paris Élégant',
  'bordeaux-classique': 'Bordeaux Classique',
  'american-classic':   'American Classic',
  'new-york-modern':    'New York Modern',
  'london-executive':   'London Executive',
  // legacy IDs for backward compat with saved CVs
  'lyon-moderne':           'Lyon Moderne',
  'marseille-creatif':      'Marseille Créatif',
  'newyork-modern':         'New York Modern',
  'silicon-valley':         'Silicon Valley',
  'cambridge-professional': 'Cambridge Professional',
};

const COUNTRY_FLAGS: Record<string, string> = {
  France: '🇫🇷', USA: '🇺🇸', UK: '🇬🇧', Canada: '🇨🇦',
  Germany: '🇩🇪', Spain: '🇪🇸', Portugal: '🇵🇹', Netherlands: '🇳🇱',
  Belgium: '🇧🇪', Switzerland: '🇨🇭', Australia: '🇦🇺', Luxembourg: '🇱🇺',
};

interface Props {
  onView: (html: string) => void;
  onToast: (message: string, type?: 'success' | 'error') => void;
}

export default function SavedCVsList({ onView, onToast }: Props) {
  const [cvs, setCVs]                 = useState<SavedCV[]>([]);
  const [loading, setLoading]         = useState(true);
  const [deleteId, setDeleteId]       = useState<string | null>(null);
  const [deleting, setDeleting]       = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('cvs')
      .select('id, title, content, template, country, created_at')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error) setCVs((data as SavedCV[]) ?? []);
        setLoading(false);
      });
  }, []);

  const renderHTML = (cv: SavedCV): string => {
    if (!cv.template || !cv.content) {
      return '<div style="padding:48px;text-align:center;color:#6B7280;font-family:sans-serif;">No preview available — re-generate with a template.</div>';
    }
    const tpl = getTemplate(cv.template);
    if (!tpl) {
      return '<div style="padding:48px;text-align:center;color:#6B7280;font-family:sans-serif;">Template not found.</div>';
    }
    return tpl.generateHTML(cv.content);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from('cvs').delete().eq('id', deleteId);
    if (error) {
      onToast('Failed to delete CV', 'error');
    } else {
      setCVs((prev) => prev.filter((c) => c.id !== deleteId));
      onToast('CV deleted', 'success');
    }
    setDeleteId(null);
    setDeleting(false);
  };

  const handleDownload = async (cv: SavedCV) => {
    setDownloadingId(cv.id);
    const html     = renderHTML(cv);
    const filename = cv.title.replace(/[^a-z0-9]/gi, '-').toLowerCase().replace(/-+/g, '-');
    try {
      const res = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, filename }),
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `${filename}.pdf`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch {
      onToast('PDF download failed', 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1 py-20">
        <Loader2 size={24} className="animate-spin text-violet-400" />
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (cvs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 py-20 text-center px-6">
        <div className="relative w-28 h-28 mb-5">
          {/* Stacked paper illustration */}
          <div className="absolute top-3 left-3 right-0 bottom-0 rounded-2xl bg-violet-100 dark:bg-violet-900/30 border-2 border-dashed border-violet-200 dark:border-violet-800" />
          <div className="absolute top-1.5 left-1.5 right-1 bottom-1 rounded-2xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800" />
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-500/10 to-cyan-500/10 border-2 border-dashed border-violet-200 dark:border-violet-800 flex items-center justify-center">
            <FileText size={40} className="text-violet-300 dark:text-violet-600" />
          </div>
        </div>
        <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-1">
          No CVs saved yet
        </h3>
        <p className="text-sm text-gray-400 dark:text-gray-500 max-w-[220px] leading-relaxed">
          Build a CV, generate it with a template, then click&nbsp;<strong>Save</strong>.
        </p>
      </div>
    );
  }

  // ── List ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
      {cvs.map((cv) => (
        <div
          key={cv.id}
          className="p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60
            hover:border-violet-200 dark:hover:border-violet-800/60 transition-colors"
        >
          {/* Title row */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="font-semibold text-sm text-gray-900 dark:text-white truncate flex-1 leading-tight">
              {cv.title || 'Untitled CV'}
            </h3>
            {cv.country && (
              <span className="text-lg flex-shrink-0" title={cv.country}>
                {COUNTRY_FLAGS[cv.country] ?? '🌐'}
              </span>
            )}
          </div>

          {/* Meta */}
          <div className="flex flex-col gap-1 mb-3">
            {cv.template && (
              <div className="flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400 font-medium">
                <LayoutTemplate size={10} />
                <span>{TEMPLATE_NAMES[cv.template] ?? cv.template}</span>
              </div>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <Calendar size={10} />
                <span>{new Date(cv.created_at).toLocaleDateString()}</span>
              </div>
              {cv.country && (
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <Globe size={10} />
                  <span>{cv.country}</span>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onView(renderHTML(cv))}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg
                border border-gray-200 dark:border-gray-700 text-xs font-medium
                text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700
                hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
            >
              <Eye size={12} /> View
            </button>
            <button
              type="button"
              onClick={() => handleDownload(cv)}
              disabled={downloadingId === cv.id}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg
                border border-gray-200 dark:border-gray-700 text-xs font-medium
                text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700
                hover:border-gray-300 dark:hover:border-gray-600 transition-colors disabled:opacity-50"
            >
              {downloadingId === cv.id
                ? <Loader2 size={11} className="animate-spin" />
                : <Download size={11} />}
              PDF
            </button>
            <button
              type="button"
              onClick={() => setDeleteId(cv.id)}
              className="inline-flex items-center justify-center p-1.5 rounded-lg
                border border-gray-200 dark:border-gray-700
                text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30
                hover:border-red-200 dark:hover:border-red-800 transition-colors"
              title="Delete"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      ))}

      {deleteId && (
        <ConfirmDialog
          message="This CV will be permanently deleted and cannot be recovered."
          onConfirm={confirmDelete}
          onCancel={() => setDeleteId(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}
