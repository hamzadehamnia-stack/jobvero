'use client';

import { useRef, useState } from 'react';
import { Upload, FileText, X, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import type { CVFormData } from './types';

interface Props {
  onParsed: (data: CVFormData) => void;
}

type Status = 'idle' | 'uploading' | 'success' | 'error';

export default function CVUploader({ onParsed }: Props) {
  const [status, setStatus]       = useState<Status>('idle');
  const [errorMsg, setErrorMsg]   = useState('');
  const [fileName, setFileName]   = useState('');
  const [dragging, setDragging]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setStatus('uploading');
    setErrorMsg('');

    const form = new FormData();
    form.append('file', file);

    try {
      const res = await fetch('/api/parse-cv', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');
      setStatus('success');
      onParsed(json.data as CVFormData);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Something went wrong');
      setStatus('error');
    }
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so same file can be re-uploaded
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const reset = () => {
    setStatus('idle');
    setFileName('');
    setErrorMsg('');
  };

  return (
    <div className="mb-5">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => status === 'idle' || status === 'error' ? inputRef.current?.click() : undefined}
        className={`relative flex flex-col items-center justify-center gap-2 px-4 py-5 rounded-xl border-2 border-dashed transition-all duration-150 cursor-pointer
          ${dragging
            ? 'border-violet-400 bg-violet-50 dark:bg-violet-950/30'
            : status === 'success'
            ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 cursor-default'
            : status === 'error'
            ? 'border-red-300 bg-red-50 dark:bg-red-950/20'
            : 'border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-700 hover:bg-gray-50 dark:hover:bg-gray-800/50'
          }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={onInputChange}
          className="hidden"
        />

        {status === 'idle' && (
          <>
            <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-950/40 flex items-center justify-center">
              <Upload size={18} className="text-violet-500" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Upload existing CV
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                PDF or Word — AI will fill all fields automatically
              </p>
            </div>
            <span className="text-[10px] text-gray-300 dark:text-gray-600">Max 5 MB</span>
          </>
        )}

        {status === 'uploading' && (
          <>
            <Loader2 size={24} className="text-violet-500 animate-spin" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Parsing <span className="text-violet-600">{fileName}</span>…
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Extracting your information — image-based PDFs may take up to 30s
              </p>
            </div>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
              <CheckCircle size={18} className="text-emerald-500" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                Fields filled from {fileName}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Review and adjust below, then generate your CV</p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); reset(); }}
              className="absolute top-2 right-2 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={13} />
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/40 flex items-center justify-center">
              <AlertCircle size={18} className="text-red-400" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-red-600 dark:text-red-400">Upload failed</p>
              <p className="text-xs text-gray-400 mt-0.5">{errorMsg}</p>
              <p className="text-xs text-violet-600 dark:text-violet-400 mt-1">Click to try again</p>
            </div>
          </>
        )}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 mt-4">
        <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
        <span className="text-xs text-gray-400 dark:text-gray-600 flex items-center gap-1.5">
          <FileText size={11} />
          or fill in manually below
        </span>
        <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
      </div>
    </div>
  );
}
