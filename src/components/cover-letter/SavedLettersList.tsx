'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Loader2, FileText, Trash2, Eye, Download,
  Calendar, Building2, Globe,
} from 'lucide-react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

interface SavedLetter {
  id: string;
  job_title: string;
  company_name: string;
  content: string;
  language: string;
  tone: string;
  created_at: string;
}

const LANG_FLAGS: Record<string, string> = { en: '🇺🇸', fr: '🇫🇷', es: '🇪🇸', pt: '🇧🇷' };
const LANG_LABELS: Record<string, string> = { en: 'English', fr: 'Français', es: 'Español', pt: 'Português' };

interface Props {
  onView: (html: string) => void;
  onToast: (message: string, type?: 'success' | 'error') => void;
}

export default function SavedLettersList({ onView, onToast }: Props) {
  const [letters, setLetters]         = useState<SavedLetter[]>([]);
  const [loading, setLoading]         = useState(true);
  const [deleteId, setDeleteId]       = useState<string | null>(null);
  const [deleting, setDeleting]       = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('cover_letters')
      .select('id, job_title, company_name, content, language, tone, created_at')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error) setLetters((data as SavedLetter[]) ?? []);
        setLoading(false);
      });
  }, []);

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from('cover_letters').delete().eq('id', deleteId);
    if (error) {
      onToast('Failed to delete', 'error');
    } else {
      setLetters((prev) => prev.filter((l) => l.id !== deleteId));
      onToast('Letter deleted', 'success');
    }
    setDeleteId(null);
    setDeleting(false);
  };

  const handleDownload = async (letter: SavedLetter) => {
    setDownloadingId(letter.id);
    const slug = `${letter.job_title}-${letter.company_name}`
      .replace(/[^a-z0-9]/gi, '-').toLowerCase().replace(/-+/g, '-');
    try {
      const res = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: letter.content, filename: `cover-letter-${slug}` }),
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `cover-letter-${slug}.pdf`;
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
  if (letters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 py-20 text-center px-6">
        {/* Illustration */}
        <div className="relative w-28 h-28 mb-5">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-cyan-500/10 to-violet-500/10 border-2 border-dashed border-violet-200 dark:border-violet-800" />
          <div className="absolute inset-0 flex items-center justify-center">
            <FileText size={40} className="text-violet-300 dark:text-violet-600" />
          </div>
        </div>
        <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-1">
          No letters saved yet
        </h3>
        <p className="text-sm text-gray-400 dark:text-gray-500 max-w-[220px] leading-relaxed">
          Generate a cover letter and click&nbsp;<strong>Save</strong> to find it here.
        </p>
      </div>
    );
  }

  // ── List ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
      {letters.map((letter) => (
        <div
          key={letter.id}
          className="p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60
            hover:border-violet-200 dark:hover:border-violet-800/60 transition-colors group"
        >
          {/* Title row */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-sm text-gray-900 dark:text-white truncate leading-tight">
                {letter.job_title || 'Untitled position'}
              </h3>
              <div className="flex items-center gap-1 mt-0.5">
                <Building2 size={10} className="text-gray-400 flex-shrink-0" />
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {letter.company_name || '—'}
                </span>
              </div>
            </div>
            <span className="text-lg flex-shrink-0 mt-0.5" title={LANG_LABELS[letter.language]}>
              {LANG_FLAGS[letter.language] ?? '🌐'}
            </span>
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Calendar size={10} />
              <span>{new Date(letter.created_at).toLocaleDateString()}</span>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold
              bg-violet-50 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400 border border-violet-100 dark:border-violet-800">
              {letter.tone}
            </span>
            {letter.language && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium
                bg-gray-50 dark:bg-gray-700/60 text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <Globe size={8} /> {LANG_LABELS[letter.language]}
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onView(letter.content)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg
                border border-gray-200 dark:border-gray-700 text-xs font-medium
                text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700
                hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
            >
              <Eye size={12} /> View
            </button>
            <button
              type="button"
              onClick={() => handleDownload(letter)}
              disabled={downloadingId === letter.id}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg
                border border-gray-200 dark:border-gray-700 text-xs font-medium
                text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700
                hover:border-gray-300 dark:hover:border-gray-600 transition-colors disabled:opacity-50"
            >
              {downloadingId === letter.id
                ? <Loader2 size={11} className="animate-spin" />
                : <Download size={11} />}
              PDF
            </button>
            <button
              type="button"
              onClick={() => setDeleteId(letter.id)}
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
          message="This cover letter will be permanently deleted and cannot be recovered."
          onConfirm={confirmDelete}
          onCancel={() => setDeleteId(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}
