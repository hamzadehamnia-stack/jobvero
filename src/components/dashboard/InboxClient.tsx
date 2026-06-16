'use client';

import {
  useState, useEffect, useRef, useCallback, useMemo, type ReactNode,
} from 'react';
import { createClient } from '@/lib/supabase/client';
import type { LucideIcon } from 'lucide-react';
import {
  Inbox, Send, Star, Archive, Trash2, Clock, FileText, Tag,
  Search, RefreshCw, MoreVertical, ChevronLeft, ChevronRight,
  MailOpen, X, Minimize2, Maximize2, Pencil, Paperclip,
  Bold, Italic, Underline, Loader2, Reply, ChevronDown, Plus,
  Check, Bell, HelpCircle, Filter, Forward, Mail, AlertTriangle, RotateCcw,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type NavFolder    = 'inbox' | 'starred' | 'snoozed' | 'sent' | 'drafts' | 'archived' | 'trash';
type TabId        = 'principale' | 'candidatures' | 'recruteurs' | 'notifications';
type LabelId      = 'interview' | 'offer' | 'applied' | 'rejected';
type ThreadAction = 'star' | 'archive' | 'delete' | 'mark_unread' | 'restore';

interface Thread {
  id:                     string;
  job_id?:                string;
  job_title:              string;
  company_name:           string;
  employer_email:         string;
  subject:                string;
  last_message_preview:   string | null;
  unread_count:           number;
  last_message_at:        string;
  created_at:             string;
  starred:                boolean;
  archived:               boolean;
  deleted:                boolean;
  status:                 string;
  original_folder:        string;
  last_message_direction: string;
}

interface MessageRow {
  id:         string;
  thread_id:  string;
  direction:  'inbound' | 'outbound';
  from_email: string;
  to_email?:  string;
  subject?:   string;
  body:       string;
  read:       boolean;
  created_at: string;
}

interface ToastData { message: string; undoFn?: () => void; }

// ─── Constants ────────────────────────────────────────────────────────────────

const NAV_FOLDERS: { id: NavFolder; label: string; icon: LucideIcon }[] = [
  { id: 'inbox',    label: 'Boîte de réception', icon: Inbox    },
  { id: 'starred',  label: 'Suivis',             icon: Star     },
  { id: 'snoozed',  label: 'En attente',         icon: Clock    },
  { id: 'sent',     label: 'Envoyés',            icon: Send     },
  { id: 'drafts',   label: 'Brouillons',         icon: FileText },
  { id: 'archived', label: 'Archivés',           icon: Archive  },
  { id: 'trash',    label: 'Corbeille',          icon: Trash2   },
];

const NAV_LABELS: { id: LabelId; label: string; dot: string }[] = [
  { id: 'interview', label: 'Entretien',   dot: 'bg-emerald-500' },
  { id: 'offer',     label: 'Offre reçue', dot: 'bg-violet-500'  },
  { id: 'applied',   label: 'Postulé',     dot: 'bg-blue-500'    },
  { id: 'rejected',  label: 'Refusé',      dot: 'bg-red-500'     },
];

const LABEL_CONFIG: Record<LabelId, { label: string; bg: string; text: string }> = {
  interview: { label: 'Entretien', bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
  offer:     { label: 'Offre',     bg: 'bg-violet-100 dark:bg-violet-900/30',   text: 'text-violet-700 dark:text-violet-300'   },
  applied:   { label: 'Postulé',   bg: 'bg-blue-100 dark:bg-blue-900/30',       text: 'text-blue-700 dark:text-blue-300'       },
  rejected:  { label: 'Refusé',    bg: 'bg-red-100 dark:bg-red-900/30',         text: 'text-red-700 dark:text-red-300'         },
};

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'principale',    label: 'Principale',    icon: Inbox },
  { id: 'candidatures',  label: 'Candidatures',  icon: Tag   },
  { id: 'recruteurs',    label: 'Recruteurs',    icon: Mail  },
  { id: 'notifications', label: 'Notifications', icon: Bell  },
];

const AVATAR_GRADIENTS: [string, string][] = [
  ['#7c3aed', '#4f46e5'], ['#2563eb', '#0891b2'], ['#059669', '#0d9488'],
  ['#d97706', '#dc2626'], ['#db2777', '#9333ea'], ['#0284c7', '#7c3aed'],
  ['#16a34a', '#2563eb'], ['#ea580c', '#db2777'],
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avatarColors(name: string): [string, string] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

function initials(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
}

function smartDate(dateStr: string): string {
  const d = new Date(dateStr), now = new Date();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === yesterday.toDateString()) return 'Hier';
  if (d.getFullYear() === now.getFullYear())
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function autoLabel(thread: Thread): LabelId {
  const text = [thread.subject, thread.last_message_preview ?? ''].join(' ').toLowerCase();
  if (/entretien|interview|rendez-vous|disponible\?/.test(text))    return 'interview';
  if (/offre|félicit|congratul|sélectionné|recruté/.test(text))     return 'offer';
  if (/refus|désolé|malheureusement|n.avons pas retenu/.test(text)) return 'rejected';
  return 'applied';
}

// ─── Highlight ────────────────────────────────────────────────────────────────

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const esc   = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${esc})`, 'gi'));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-600/50 text-inherit rounded-sm px-px not-italic">{p}</mark>
          : <span key={i}>{p}</span>
      )}
    </>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function GmailAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const [c1, c2] = avatarColors(name);
  const dims     = { sm: 32, md: 40, lg: 48 }[size];
  const font     = { sm: 13, md: 16, lg: 19 }[size];
  return (
    <div
      className="rounded-full flex-shrink-0 flex items-center justify-center font-bold text-white select-none"
      style={{ width: dims, height: dims, fontSize: font, background: `linear-gradient(135deg,${c1},${c2})` }}
    >
      {initials(name)}
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ data, onClose }: { data: ToastData; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-[#323232] text-white text-sm rounded-xl px-5 py-3.5 shadow-2xl">
      <span>{data.message}</span>
      {data.undoFn && (
        <button onClick={() => { data.undoFn!(); onClose(); }}
          className="font-semibold text-[#8ab4f8] hover:text-[#aecbfa] uppercase text-xs tracking-wide transition-colors">
          Annuler
        </button>
      )}
      <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors ml-1"><X size={15} /></button>
    </div>
  );
}

// ─── Compose Modal ────────────────────────────────────────────────────────────

const ALLOWED_TYPES = ['application/pdf','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg','image/png'];
const MAX_FILE_BYTES = 5 * 1024 * 1024;

function ComposeModal({ onClose, onMinimize, minimized, onSent, userId }: {
  onClose: () => void; onMinimize: () => void; minimized: boolean;
  onSent: (threadId: string) => void;
  userName?: string; userId?: string;
}) {
  const [to,         setTo]         = useState('');
  const [subject,    setSubject]    = useState('');
  const [bodyText,   setBodyText]   = useState('');
  const [fmtState,   setFmtState]   = useState({ bold: false, italic: false, underline: false });
  const [sending,    setSending]    = useState(false);
  const [expanded,   setExpanded]   = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachErr,  setAttachErr]  = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Focus the empty editor on mount
  useEffect(() => {
    if (!bodyRef.current) return;
    bodyRef.current.focus();
    const range = document.createRange();
    const sel   = window.getSelection();
    if (sel) { range.setStart(bodyRef.current, 0); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-focus on un-minimize without resetting content
  useEffect(() => {
    if (!minimized) bodyRef.current?.focus();
  }, [minimized]);

  const updateFmtState = () => setFmtState({
    bold:      document.queryCommandState('bold'),
    italic:    document.queryCommandState('italic'),
    underline: document.queryCommandState('underline'),
  });

  const applyFormat = (cmd: 'bold' | 'italic' | 'underline') => {
    bodyRef.current?.focus();
    document.execCommand(cmd, false);
    updateFmtState();
  };

  const canSend = to.includes('@') && subject.trim() !== '' && bodyText.trim() !== '';

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setAttachErr('');
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) { setAttachErr('Type non autorisé (PDF, DOC, DOCX, JPG, PNG)'); return; }
    if (file.size > MAX_FILE_BYTES) { setAttachErr('Fichier trop volumineux (max 5 MB)'); return; }
    setAttachment(file);
  };

  const handleSend = async () => {
    if (!canSend || sending) return;
    setSending(true);
    try {
      const finalBody = bodyRef.current?.innerHTML ?? '';
      let attachmentUrl: string | null = null;
      let attachmentName: string | null = null;

      if (attachment && userId) {
        const path = `${userId}/${Date.now()}_${attachment.name}`;
        const { data: uploaded, error: upErr } = await createClient()
          .storage.from('attachments')
          .upload(path, attachment, { contentType: attachment.type, upsert: false });
        if (upErr) {
          console.warn('[compose] attachment upload failed:', upErr.message);
        } else if (uploaded) {
          const { data: urlData } = createClient().storage.from('attachments').getPublicUrl(uploaded.path);
          attachmentUrl  = urlData.publicUrl;
          attachmentName = attachment.name;
        }
      }

      const res = await fetch('/api/inbox/compose', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: to.trim(), subject: subject.trim(), body: finalBody, attachmentUrl, attachmentName }),
      });
      const d = await res.json() as { thread_id?: string; error?: string };
      if (!res.ok) throw new Error(d.error ?? 'Envoi échoué');
      if (!d.thread_id) throw new Error('Réponse invalide');
      onSent(d.thread_id);
    } catch (e) { alert(e instanceof Error ? e.message : 'Erreur'); }
    finally { setSending(false); }
  };

  const wrapperStyle: React.CSSProperties = expanded
    ? { position: 'fixed', inset: 0, zIndex: 60, borderRadius: 0 }
    : { position: 'fixed', bottom: 0, right: 80, width: 600, zIndex: 50, borderRadius: '16px 16px 0 0' };

  const FMT_BTNS: { cmd: 'bold' | 'italic' | 'underline'; Icon: typeof Bold; key: keyof typeof fmtState; label: string }[] = [
    { cmd: 'bold',      Icon: Bold,      key: 'bold',      label: 'Gras (Ctrl+B)'      },
    { cmd: 'italic',    Icon: Italic,    key: 'italic',    label: 'Italique (Ctrl+I)'  },
    { cmd: 'underline', Icon: Underline, key: 'underline', label: 'Souligné (Ctrl+U)'  },
  ];

  return (
    <div
      className="bg-white dark:bg-gray-900 shadow-2xl border border-gray-300/60 dark:border-gray-700 overflow-hidden flex flex-col"
      style={{ ...wrapperStyle, height: minimized ? 52 : expanded ? '100%' : 500, transition: expanded ? 'none' : 'height 0.18s ease' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 h-[52px] bg-[#404040] dark:bg-gray-800 text-white cursor-pointer select-none flex-shrink-0"
        onClick={onMinimize}
      >
        <span className="text-sm font-medium">Nouveau message</span>
        <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
          <button onClick={onMinimize} title="Réduire" className="p-1.5 rounded hover:bg-white/20 transition-colors"><Minimize2 size={14} /></button>
          <button onClick={() => setExpanded(v => !v)} title={expanded ? 'Réduire' : 'Plein écran'} className="p-1.5 rounded hover:bg-white/20 transition-colors">
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button onClick={onClose} title="Fermer" className="p-1.5 rounded hover:bg-white/20 transition-colors"><X size={14} /></button>
        </div>
      </div>

      {!minimized && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <span className="text-sm text-gray-500 dark:text-gray-400 w-10 flex-shrink-0">À</span>
            <input value={to} onChange={e => setTo(e.target.value)} autoFocus
              className="flex-1 text-sm text-gray-900 dark:text-gray-100 bg-transparent focus:outline-none placeholder-gray-400"
              placeholder="Destinataire" />
          </div>
          <div className="flex items-center px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <input value={subject} onChange={e => setSubject(e.target.value)}
              className="flex-1 text-sm text-gray-900 dark:text-gray-100 bg-transparent focus:outline-none placeholder-gray-400"
              placeholder="Objet" />
          </div>

          {/* Rich text editor */}
          <div
            ref={bodyRef}
            contentEditable
            suppressContentEditableWarning
            onInput={e => { setBodyText((e.target as HTMLDivElement).innerText); updateFmtState(); }}
            onKeyUp={updateFmtState}
            onMouseUp={updateFmtState}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend(); }}
            className={`${expanded ? 'flex-1' : ''} w-full px-4 py-3 text-sm text-gray-900 dark:text-gray-100 bg-transparent focus:outline-none overflow-y-auto`}
            style={{ minHeight: expanded ? 0 : 250, lineHeight: '1.65', wordBreak: 'break-word' }}
          />

          {/* Attachment preview */}
          {(attachment || attachErr) && (
            <div className="px-4 pb-2 flex-shrink-0">
              {attachErr && (
                <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                  <AlertTriangle size={12} /> {attachErr}
                </div>
              )}
              {attachment && (
                <div className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-1.5 w-fit">
                  <Paperclip size={12} className="text-violet-500 flex-shrink-0" />
                  <span className="truncate max-w-[260px]">{attachment.name}</span>
                  <span className="text-gray-400">({(attachment.size / 1024).toFixed(0)} KB)</span>
                  <button onClick={() => { setAttachment(null); if (fileRef.current) fileRef.current.value = ''; }}
                    className="ml-1 text-gray-400 hover:text-red-500 transition-colors"><X size={12} /></button>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between px-3 py-2.5 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
            <button onClick={handleSend} disabled={!canSend || sending}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium text-white disabled:opacity-40 transition-all hover:shadow-md"
              style={{ background: '#7c3aed' }}>
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {sending ? 'Envoi…' : 'Envoyer'}
            </button>
            <div className="flex items-center gap-0.5">
              {FMT_BTNS.map(({ cmd, Icon, key, label }) => (
                <button
                  key={cmd}
                  onMouseDown={e => { e.preventDefault(); applyFormat(cmd); }}
                  title={label}
                  className={`p-2 rounded-full transition-colors ${
                    fmtState[key]
                      ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400'
                  }`}>
                  <Icon size={15} />
                </button>
              ))}
              <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden" onChange={onFileChange} />
              <button onClick={() => fileRef.current?.click()} title="Joindre un fichier"
                className={`p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${attachment ? 'text-violet-600' : 'text-gray-500 dark:text-gray-400'}`}>
                <Paperclip size={15} />
              </button>
            </div>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400"><Trash2 size={15} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Thread Row ───────────────────────────────────────────────────────────────

interface ThreadRowProps {
  thread: Thread; selected: boolean; checked: boolean; search: string;
  narrow: boolean; inTrash?: boolean;
  onSelect: () => void; onCheck: () => void; onStar: () => void;
  onArchive: () => void; onDelete: () => void; onMarkUnread: () => void;
  onRestore?: () => void; onPermanentDelete?: () => void;
}

function ThreadRow({ thread, selected, checked, search, narrow, inTrash, onSelect, onCheck, onStar, onArchive, onDelete, onMarkUnread, onRestore, onPermanentDelete }: ThreadRowProps) {
  const [hovered, setHovered] = useState(false);
  const unread      = thread.unread_count > 0;
  const label       = autoLabel(thread);
  const lCfg        = LABEL_CONFIG[label];
  const senderLabel = thread.company_name || thread.employer_email.split('@')[0];

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`relative flex items-center h-[52px] px-2 border-b cursor-pointer transition-all select-none
        ${selected
          ? 'bg-[#e8f0fe] dark:bg-violet-900/30 border-gray-200/60 dark:border-gray-700/60'
          : checked
            ? 'bg-[#fef8e1] dark:bg-amber-900/20 border-gray-200/60 dark:border-gray-700/60'
            : hovered
              ? 'bg-[#f2f6fc] dark:bg-gray-800 shadow-[0_1px_2px_rgba(0,0,0,.08)] border-gray-200/60 dark:border-gray-700/60 z-10'
              : unread
                ? 'bg-white dark:bg-gray-900 border-gray-200/60 dark:border-gray-700/60'
                : 'bg-[#f6f8fc] dark:bg-gray-900/60 border-gray-200/60 dark:border-gray-700/60'
        }`}
    >
      {/* Unread accent */}
      {unread && !selected && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-8 rounded-r-full bg-[#7c3aed]" />
      )}

      {/* Checkbox */}
      <div className="flex-shrink-0 w-9 flex items-center justify-center" onClick={e => { e.stopPropagation(); onCheck(); }}>
        <div className={`w-[18px] h-[18px] rounded border-2 flex items-center justify-center transition-all
          ${checked ? 'bg-[#7c3aed] border-[#7c3aed]' : 'border-gray-400 dark:border-gray-500 group-hover:border-gray-600 dark:group-hover:border-gray-400'}`}>
          {checked && <Check size={11} className="text-white" />}
        </div>
      </div>

      {/* Star */}
      <div className="flex-shrink-0 w-8 flex items-center justify-center" onClick={e => { e.stopPropagation(); onStar(); }}>
        <Star size={18} className={`transition-all cursor-pointer ${thread.starred ? 'fill-amber-400 text-amber-400' : 'text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400'}`} />
      </div>

      {/* Avatar */}
      <div className="flex-shrink-0 mr-3"><GmailAvatar name={senderLabel} size="sm" /></div>

      {/* Sender — fixed width */}
      <div className={`flex-shrink-0 text-[14px] truncate ${narrow ? 'w-full max-w-[120px]' : 'w-[172px]'}
        ${unread ? 'font-semibold text-gray-900 dark:text-gray-100' : 'font-normal text-gray-800 dark:text-gray-200'}`}>
        <Highlight text={senderLabel} query={search} />
      </div>

      {/* Subject + snippet */}
      {!narrow && (
        <div className="flex-1 min-w-0 flex items-center gap-2 mx-2 overflow-hidden">
          <span className={`flex-shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${lCfg.bg} ${lCfg.text}`}>
            {lCfg.label}
          </span>
          <span className={`text-[14px] truncate max-w-[200px] ${unread ? 'font-semibold text-gray-900 dark:text-gray-100' : 'font-normal text-gray-700 dark:text-gray-300'}`}>
            <Highlight text={thread.subject || '(Sans objet)'} query={search} />
          </span>
          {thread.last_message_preview && (
            <span className="text-[14px] text-gray-400 dark:text-gray-500 truncate hidden xl:block">
              — <Highlight text={thread.last_message_preview.slice(0, 80)} query={search} />
            </span>
          )}
        </div>
      )}

      {/* Hover quick actions */}
      {hovered && !narrow && (
        <div className="absolute right-[88px] flex items-center gap-0.5 bg-[#f2f6fc] dark:bg-gray-800"
          onClick={e => e.stopPropagation()}>
          {(inTrash ? [
            { Icon: RotateCcw, title: 'Restaurer',                fn: onRestore        ?? (() => {}) },
            { Icon: Trash2,    title: 'Supprimer définitivement', fn: onPermanentDelete ?? (() => {}) },
          ] : [
            { Icon: Archive,  title: 'Archiver',       fn: onArchive    },
            { Icon: Trash2,   title: 'Supprimer',      fn: onDelete     },
            { Icon: MailOpen, title: 'Marquer non lu', fn: onMarkUnread },
            { Icon: Clock,    title: 'Reporter',       fn: () => {}     },
          ]).map(({ Icon, title, fn }) => (
            <button key={title} onClick={fn} title={title}
              className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400">
              <Icon size={15} />
            </button>
          ))}
        </div>
      )}

      {/* Date */}
      <div className={`flex-shrink-0 ${narrow ? 'w-auto ml-auto' : 'w-[80px]'} text-right text-[12px] pr-2
        ${unread ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
        {smartDate(thread.last_message_at)}
      </div>
    </div>
  );
}

// ─── Message Card ─────────────────────────────────────────────────────────────

function MessageCard({ message, senderName, emailAlias, onReply, onDelete }: {
  message: MessageRow; senderName: string; emailAlias: string | null;
  onReply: () => void; onDelete: () => void;
}) {
  const [expanded,       setExpanded]       = useState(true);
  const [confirmDelete,  setConfirmDelete]  = useState(false);
  const out  = message.direction === 'outbound';
  // Use stored from_email when available (may already be alias); fall back to alias prop or legacy address
  const from = out
    ? (message.from_email && message.from_email !== 'apply@getjobvero.com'
        ? message.from_email
        : emailAlias
          ? `${emailAlias}@getjobvero.com`
          : 'apply@getjobvero.com')
    : message.from_email;
  const name = out ? 'Vous' : senderName;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200/80 dark:border-gray-700/60 shadow-[0_1px_4px_rgba(0,0,0,.07)] dark:shadow-none overflow-hidden">
      {/* Header */}
      <div
        className="flex items-start gap-4 px-6 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <GmailAvatar name={name} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap mb-0.5">
                <span className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">{name}</span>
                {expanded && <span className="text-[12px] text-gray-400 dark:text-gray-500 truncate">&lt;{from}&gt;</span>}
              </div>
              {!expanded && (
                <p className="text-[14px] text-gray-500 dark:text-gray-400 truncate">{message.body.slice(0, 100)}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
              <span className="text-[12px] text-gray-400 dark:text-gray-500 whitespace-nowrap hidden sm:block">
                {fullDate(message.created_at)}
              </span>
              {expanded && (
                <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                  <button onClick={onReply} title="Répondre"
                    className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400">
                    <Reply size={17} />
                  </button>
                  <button onClick={() => setConfirmDelete(true)} title="Supprimer"
                    className="p-1.5 rounded-full hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400 transition-colors text-gray-500 dark:text-gray-400">
                    <Trash2 size={17} />
                  </button>
                  <button className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400">
                    <MoreVertical size={17} />
                  </button>
                </div>
              )}
              {/* Delete confirmation inline */}
              {confirmDelete && (
                <div className="flex items-center gap-2 ml-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl px-3 py-1.5" onClick={e => e.stopPropagation()}>
                  <AlertTriangle size={13} className="text-red-500 flex-shrink-0" />
                  <span className="text-[12px] text-red-700 dark:text-red-300 font-medium">Êtes-vous sûr ?</span>
                  <button onClick={() => { onDelete(); setConfirmDelete(false); }}
                    className="text-[11px] font-bold text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 uppercase tracking-wide transition-colors">Oui</button>
                  <button onClick={() => setConfirmDelete(false)}
                    className="text-[11px] font-bold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 uppercase tracking-wide transition-colors">Non</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-8 pb-8 pt-1" style={{ paddingLeft: '88px' }}>
          {/<[a-z][\s\S]*>/i.test(message.body) ? (
            <div
              className="text-[15px] leading-[1.65] text-gray-800 dark:text-gray-200 [&_strong]:font-semibold [&_em]:italic [&_u]:underline [&_a]:text-violet-600 [&_a]:underline [&_br]:block"
              dangerouslySetInnerHTML={{ __html: message.body }}
            />
          ) : (
            <p className="text-[15px] leading-[1.65] text-gray-800 dark:text-gray-200 whitespace-pre-line">
              {message.body}
            </p>
          )}
          <div className="mt-6 flex items-center gap-3">
            <button onClick={onReply}
              className="flex items-center gap-2 px-5 py-2 rounded-full border border-gray-300 dark:border-gray-600 text-[13px] font-medium text-gray-600 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:border-[#7c3aed] hover:text-[#7c3aed] dark:hover:text-violet-400 transition-all">
              <Reply size={15} /> Répondre
            </button>
            <button
              className="flex items-center gap-2 px-5 py-2 rounded-full border border-gray-300 dark:border-gray-600 text-[13px] font-medium text-gray-600 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:border-[#7c3aed] hover:text-[#7c3aed] dark:hover:text-violet-400 transition-all">
              <Forward size={15} /> Transférer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Reply Box ────────────────────────────────────────────────────────────────

function ReplyBox({ thread, onSend, onClose, userName, userId }: {
  thread: Thread; onSend: (html: string) => Promise<void>; onClose: () => void;
  userName?: string; userId?: string;
}) {
  const sigHtml = `<br><br><br>Cordialement,<br>${userName ?? 'Utilisateur'}`;
  const [bodyText,   setBodyText]   = useState('');
  const [fmtState,   setFmtState]   = useState({ bold: false, italic: false, underline: false });
  const [sending,    setSending]    = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachErr,  setAttachErr]  = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const senderLabel = thread.company_name || thread.employer_email.split('@')[0];

  useEffect(() => {
    if (!bodyRef.current) return;
    bodyRef.current.innerHTML = sigHtml;
    setBodyText(bodyRef.current.innerText);
    bodyRef.current.focus();
    const range = document.createRange();
    const sel   = window.getSelection();
    if (sel) { range.setStart(bodyRef.current, 0); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); }
    bodyRef.current.scrollTop = 0;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateFmtState = () => setFmtState({
    bold:      document.queryCommandState('bold'),
    italic:    document.queryCommandState('italic'),
    underline: document.queryCommandState('underline'),
  });

  const applyFormat = (cmd: 'bold' | 'italic' | 'underline') => {
    bodyRef.current?.focus();
    document.execCommand(cmd, false);
    updateFmtState();
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setAttachErr('');
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) { setAttachErr('Type non autorisé (PDF, DOC, DOCX, JPG, PNG)'); return; }
    if (file.size > MAX_FILE_BYTES) { setAttachErr('Fichier trop volumineux (max 5 MB)'); return; }
    setAttachment(file);
  };

  const handleSend = async () => {
    if (!bodyText.trim() || sending) return;
    setSending(true);
    let finalBody = bodyRef.current?.innerHTML ?? '';

    if (attachment && userId) {
      const path = `${userId}/${Date.now()}_${attachment.name}`;
      const { data: uploaded, error: upErr } = await createClient()
        .storage.from('attachments')
        .upload(path, attachment, { contentType: attachment.type, upsert: false });
      if (upErr) {
        console.warn('[reply] attachment upload failed:', upErr.message);
      } else if (uploaded) {
        const { data: urlData } = createClient().storage.from('attachments').getPublicUrl(uploaded.path);
        finalBody += `<br><br>📎 Pièce jointe : <a href="${urlData.publicUrl}" target="_blank" rel="noopener noreferrer">${attachment.name}</a>`;
      }
    }

    await onSend(finalBody);
    setSending(false);
    if (bodyRef.current) {
      bodyRef.current.innerHTML = sigHtml;
      setBodyText(bodyRef.current.innerText);
    }
    setAttachment(null);
  };

  const FMT_BTNS: { cmd: 'bold' | 'italic' | 'underline'; Icon: typeof Bold; key: keyof typeof fmtState; label: string }[] = [
    { cmd: 'bold',      Icon: Bold,      key: 'bold',      label: 'Gras (Ctrl+B)'     },
    { cmd: 'italic',    Icon: Italic,    key: 'italic',    label: 'Italique (Ctrl+I)' },
    { cmd: 'underline', Icon: Underline, key: 'underline', label: 'Souligné (Ctrl+U)' },
  ];

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200/80 dark:border-gray-700 shadow-[0_2px_8px_rgba(0,0,0,.1)] dark:shadow-none overflow-hidden">
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 dark:border-gray-800">
        <span className="text-[13px] text-gray-500 dark:text-gray-400">
          Répondre à <span className="font-medium text-gray-800 dark:text-gray-200">{senderLabel}</span>
        </span>
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors">
          <X size={15} />
        </button>
      </div>
      <div className="px-6 py-4">
        {/* Rich text editor */}
        <div
          ref={bodyRef}
          contentEditable
          suppressContentEditableWarning
          onInput={e => { setBodyText((e.target as HTMLDivElement).innerText); updateFmtState(); }}
          onKeyUp={updateFmtState}
          onMouseUp={updateFmtState}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend(); }}
          className="w-full min-h-[120px] text-[15px] text-gray-900 dark:text-gray-100 bg-transparent focus:outline-none overflow-y-auto"
          style={{ lineHeight: '1.65', wordBreak: 'break-word' }}
        />
        {(attachment || attachErr) && (
          <div className="mt-2">
            {attachErr && (
              <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                <AlertTriangle size={12} /> {attachErr}
              </div>
            )}
            {attachment && (
              <div className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-1.5 w-fit">
                <Paperclip size={12} className="text-violet-500 flex-shrink-0" />
                <span className="truncate max-w-[220px]">{attachment.name}</span>
                <span className="text-gray-400">({(attachment.size / 1024).toFixed(0)} KB)</span>
                <button onClick={() => { setAttachment(null); if (fileRef.current) fileRef.current.value = ''; }}
                  className="ml-1 text-gray-400 hover:text-red-500 transition-colors"><X size={12} /></button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <button onClick={handleSend} disabled={!bodyText.trim() || sending}
            className="flex items-center gap-2 px-6 py-2.5 rounded-full text-[13px] font-medium text-white disabled:opacity-40 transition-all hover:shadow-md"
            style={{ background: '#7c3aed' }}>
            {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            {sending ? 'Envoi…' : 'Envoyer'}
          </button>
          <div className="flex items-center gap-0.5 ml-1">
            {FMT_BTNS.map(({ cmd, Icon, key, label }) => (
              <button
                key={cmd}
                onMouseDown={e => { e.preventDefault(); applyFormat(cmd); }}
                title={label}
                className={`p-2 rounded-full transition-colors ${
                  fmtState[key]
                    ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400'
                }`}>
                <Icon size={15} />
              </button>
            ))}
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden" onChange={onFileChange} />
            <button onClick={() => fileRef.current?.click()} title="Joindre un fichier"
              className={`p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${attachment ? 'text-violet-600' : 'text-gray-500 dark:text-gray-400'}`}>
              <Paperclip size={15} />
            </button>
          </div>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

// ─── Empty States ─────────────────────────────────────────────────────────────

function EmptyInbox({ folder }: { folder: NavFolder }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 py-24 px-8 text-center">
      <div className="w-20 h-20 rounded-full bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center mb-6">
        <Mail size={34} className="text-[#7c3aed]" />
      </div>
      <p className="text-[20px] font-normal text-gray-800 dark:text-gray-200 mb-2">
        {folder === 'inbox' ? 'Aucun message dans Boîte de réception' : 'Aucun message ici'}
      </p>
      <p className="text-[14px] text-gray-500 dark:text-gray-400 max-w-[300px] leading-relaxed">
        {folder === 'inbox' ? 'Les nouveaux messages apparaîtront ici.' : 'Cette section est vide.'}
      </p>
    </div>
  );
}

function NoThreadSelected() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-24 px-8 text-center">
      <div className="w-24 h-24 rounded-full bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center mb-6">
        <Mail size={40} className="text-[#7c3aed]" />
      </div>
      <p className="text-[17px] text-gray-500 dark:text-gray-400 font-normal">Sélectionnez une conversation pour la lire</p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InboxClient({ emailAlias, userName, userId }: {
  emailAlias?: string | null;
  userName?: string;
  userId?: string;
}) {

  const [threads,         setThreads]         = useState<Thread[]>([]);
  const [selectedId,      setSelectedId]      = useState<string | null>(null);
  const [messages,        setMessages]        = useState<MessageRow[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending,         setSending]         = useState(false);
  const [search,          setSearch]          = useState('');
  const [folder,          setFolder]          = useState<NavFolder>('inbox');
  const [activeTab,       setActiveTab]       = useState<TabId>('principale');
  const [composeOpen,     setComposeOpen]     = useState(false);
  const [composeMin,      setComposeMin]      = useState(false);
  const [checkedIds,      setCheckedIds]      = useState<Set<string>>(new Set());
  const [replyOpen,       setReplyOpen]       = useState(false);
  const [toast,           setToast]           = useState<ToastData | null>(null);
  const [showConvo,       setShowConvo]       = useState(false);
  const [refreshing,      setRefreshing]      = useState(false);

  const selectedIdRef  = useRef<string | null>(null);
  const threadsRef     = useRef<Thread[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { threadsRef.current    = threads;    }, [threads]);

  // ── Realtime + initial load ────────────────────────────────────────────────

  useEffect(() => {
    const supabase = createClient();
    supabase.from('message_threads').select('*').order('last_message_at', { ascending: false })
      .then(({ data }) => { setThreads((data as Thread[]) ?? []); setLoading(false); });

    const ch = supabase.channel('inbox-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_threads' }, payload => {
        if (payload.eventType === 'INSERT')
          setThreads(prev => [payload.new as Thread, ...prev]);
        else if (payload.eventType === 'UPDATE')
          setThreads(prev => prev.map(t => t.id === (payload.new as Thread).id ? payload.new as Thread : t));
        else if (payload.eventType === 'DELETE')
          setThreads(prev => prev.filter(t => t.id !== (payload.old as { id: string }).id));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const msg = payload.new as MessageRow;
        if (msg.thread_id === selectedIdRef.current)
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Keyboard shortcuts
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const id = selectedIdRef.current;
      if (e.key === 'c' || e.key === 'C') { setComposeOpen(true); return; }
      if (e.key === 'Escape') { setComposeOpen(false); return; }
      if ((e.key === 'e' || e.key === 'E') && id) doAction(id, 'archive');
      if (e.key === '#' && id) doAction(id, 'delete');
      if ((e.key === 's' || e.key === 'S') && id) doAction(id, 'star');
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ────────────────────────────────────────────────────────────────

  const folderCounts = useMemo(() => ({
    inbox:    threads.filter(t => t.status === 'inbox').reduce((s, t) => s + t.unread_count, 0),
    starred:  threads.filter(t => t.starred && t.status !== 'trash').length,
    snoozed:  0,
    sent:     threads.filter(t => t.status === 'sent').length,
    drafts:   0,
    archived: threads.filter(t => t.status === 'archived').length,
    trash:    threads.filter(t => t.status === 'trash').length,
  }), [threads]);

  const filtered = useMemo(() => {
    let list = threads.filter(t => {
      switch (folder) {
        case 'inbox':    return t.status === 'inbox';
        case 'starred':  return t.starred && t.status !== 'trash';
        case 'snoozed':  return false;
        case 'sent':     return t.status === 'sent';
        case 'drafts':   return false;
        case 'archived': return t.status === 'archived';
        case 'trash':    return t.status === 'trash';
        default:         return true;
      }
    });
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.company_name.toLowerCase().includes(q) || t.job_title.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) || (t.last_message_preview ?? '').toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
  }, [threads, folder, search]);

  const selectedThread = useMemo(() => threads.find(t => t.id === selectedId) ?? null, [threads, selectedId]);
  const totalUnread    = useMemo(() => threads.filter(t => t.status === 'inbox').reduce((s, t) => s + t.unread_count, 0), [threads]);
  const senderLabel    = selectedThread ? (selectedThread.company_name || selectedThread.employer_email.split('@')[0]) : '';

  // ── Actions ────────────────────────────────────────────────────────────────

  function doAction(threadId: string, action: ThreadAction) {
    const thread = threadsRef.current.find(t => t.id === threadId);
    if (!thread) return;
    const prev   = { status: thread.status, original_folder: thread.original_folder, starred: thread.starred, archived: thread.archived, deleted: thread.deleted, unread_count: thread.unread_count };
    const update: Record<string, unknown> = {};
    if (action === 'star')        { update.starred = !thread.starred; }
    if (action === 'archive')     { update.status = 'archived'; update.original_folder = thread.status; update.archived = true; update.deleted = false; }
    if (action === 'delete')      { update.status = 'trash'; update.original_folder = thread.status; update.deleted = true; update.archived = false; }
    if (action === 'restore')     { update.status = thread.original_folder || 'inbox'; update.deleted = false; update.archived = false; }
    if (action === 'mark_unread') { update.unread_count = Math.max(thread.unread_count, 1); }
    createClient().from('message_threads').update(update).eq('id', threadId).then(() => {});
    setThreads(p => p.map(t => t.id !== threadId ? t : { ...t, ...update }));
    const willHide = action === 'archive' || action === 'delete' || action === 'restore';
    if (willHide && threadId === selectedIdRef.current) {
      setSelectedId(null); setMessages([]); setShowConvo(false);
    }
    if (action === 'archive')
      setToast({ message: 'Conversation archivée', undoFn: () => {
        createClient().from('message_threads').update(prev).eq('id', threadId).then(() => {});
        setThreads(p => p.map(t => t.id !== threadId ? t : { ...t, ...prev }));
      }});
    if (action === 'delete')
      setToast({ message: 'Déplacé dans Corbeille', undoFn: () => {
        createClient().from('message_threads').update(prev).eq('id', threadId).then(() => {});
        setThreads(p => p.map(t => t.id !== threadId ? t : { ...t, ...prev }));
      }});
    if (action === 'restore')
      setToast({ message: 'Message restauré' });
  }

  // ── Select thread ──────────────────────────────────────────────────────────

  const handleSelectThread = useCallback(async (threadId: string) => {
    setSelectedId(threadId); setShowConvo(true); setMessages([]); setLoadingMessages(true); setReplyOpen(false);
    const supabase = createClient();
    const { data } = await supabase.from('messages').select('*').eq('thread_id', threadId).order('created_at', { ascending: true });
    setMessages((data as MessageRow[]) ?? []);
    setLoadingMessages(false);
    await Promise.all([
      supabase.from('message_threads').update({ unread_count: 0 }).eq('id', threadId),
      supabase.from('messages').update({ read: true }).eq('thread_id', threadId).eq('read', false),
    ]);
    setThreads(prev => prev.map(t => t.id === threadId ? { ...t, unread_count: 0 } : t));
  }, []);

  // ── Reply ──────────────────────────────────────────────────────────────────

  const handleReply = useCallback(async (body: string) => {
    if (!selectedId || sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/inbox/reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: selectedId, body }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; throw new Error(d.error ?? 'Erreur'); }
      const { message } = await res.json() as { message: MessageRow };
      setMessages(prev => [...prev, message]);
      setReplyOpen(false);
      setThreads(prev => prev.map(t =>
        t.id === selectedId ? { ...t, last_message_at: message.created_at, last_message_preview: body.slice(0, 120), last_message_direction: 'outbound' } : t
      ));
    } catch (e) { alert(e instanceof Error ? e.message : 'Erreur'); }
    finally { setSending(false); }
  }, [selectedId, sending]);

  // ── Compose ────────────────────────────────────────────────────────────────

  const handleCompose = useCallback(async (threadId: string) => {
    setComposeOpen(false);
    const supabase = createClient();
    const { data } = await supabase.from('message_threads').select('*').eq('id', threadId).single();
    if (data) setThreads(prev => [data as Thread, ...prev.filter(t => t.id !== threadId)]);
    handleSelectThread(threadId);
  }, [handleSelectThread]);

  // ── Permanent delete ──────────────────────────────────────────────────────

  const handlePermanentDelete = useCallback(async (threadId: string) => {
    await createClient().from('message_threads').delete().eq('id', threadId);
    setThreads(prev => prev.filter(t => t.id !== threadId));
    if (selectedId === threadId) {
      setSelectedId(null); setMessages([]); setShowConvo(false);
    }
    setToast({ message: 'Message supprimé définitivement' });
  }, [selectedId]);

  // ── Empty trash ────────────────────────────────────────────────────────────

  const handleEmptyTrash = useCallback(async () => {
    const trashIds = threadsRef.current.filter(t => t.status === 'trash').map(t => t.id);
    if (trashIds.length === 0) return;
    await createClient().from('message_threads').delete().in('id', trashIds);
    setThreads(prev => prev.filter(t => t.status !== 'trash'));
    if (selectedId && trashIds.includes(selectedId)) {
      setSelectedId(null); setMessages([]); setShowConvo(false);
    }
    setToast({ message: `${trashIds.length} message(s) supprimé(s) définitivement` });
  }, [selectedId]);

  // ── Check helpers ──────────────────────────────────────────────────────────

  const toggleCheck  = (id: string) => setCheckedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allChecked   = filtered.length > 0 && filtered.every(t => checkedIds.has(t.id));
  const someChecked  = checkedIds.size > 0;
  const toggleAll    = () => setCheckedIds(allChecked ? new Set() : new Set(filtered.map(t => t.id)));

  const markAllRead  = useCallback(async () => {
    const supabase = createClient();
    await supabase.from('message_threads').update({ unread_count: 0 }).gt('unread_count', 0);
    setThreads(prev => prev.map(t => ({ ...t, unread_count: 0 })));
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const { data } = await createClient().from('message_threads').select('*').order('last_message_at', { ascending: false });
    setThreads((data as Thread[]) ?? []);
    setTimeout(() => setRefreshing(false), 400);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-[#f6f8fc] dark:bg-gray-950 overflow-hidden">

      {/* ── Search header ──────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 bg-[#f6f8fc] dark:bg-gray-950">
        <div className="flex-1 max-w-[680px]">
          <div className="flex items-center bg-[#eaf1fb] dark:bg-gray-800 hover:bg-[#dce8f8] dark:hover:bg-gray-700 focus-within:bg-white dark:focus-within:bg-gray-800 focus-within:shadow-[0_1px_3px_rgba(0,0,0,.2)] rounded-full px-4 transition-all">
            <Search size={20} className="text-gray-500 dark:text-gray-400 flex-shrink-0 mr-3" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher dans la messagerie"
              className="flex-1 py-3 text-[15px] text-gray-900 dark:text-gray-100 bg-transparent focus:outline-none placeholder-gray-500 dark:placeholder-gray-400"
            />
            {search && (
              <button onClick={() => setSearch('')} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                <X size={16} className="text-gray-500 dark:text-gray-400" />
              </button>
            )}
            <button className="ml-2 p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex-shrink-0">
              <Filter size={17} className="text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button className="p-2.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400"><HelpCircle size={20} /></button>
        </div>
      </div>

      {/* ── Main 3-col area ────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden min-w-0">

        {/* ════ LEFT SIDEBAR (240px, desktop only) ════════════════════════════ */}
        <aside className="hidden lg:flex w-[240px] flex-shrink-0 flex-col overflow-y-auto py-2 bg-[#f6f8fc] dark:bg-gray-950">

          {/* Compose */}
          <div className="px-3 mb-3">
            <button
              onClick={() => { setComposeOpen(true); setComposeMin(false); }}
              className="flex items-center gap-3 pl-5 pr-6 h-[52px] rounded-2xl bg-[#c2e7ff] dark:bg-violet-600/20 hover:bg-[#b0d8f5] dark:hover:bg-violet-600/30 hover:shadow-md active:scale-[0.99] transition-all text-[#001d35] dark:text-violet-300 font-medium text-[14px]"
            >
              <Pencil size={20} /> Nouveau message
            </button>
          </div>

          {/* Folders */}
          <nav className="flex-1 overflow-y-auto">
            {NAV_FOLDERS.map(({ id, label, icon: Icon }) => {
              const count  = folderCounts[id];
              const active = folder === id;
              return (
                <button key={id}
                  onClick={() => { setFolder(id); setSelectedId(null); setMessages([]); setShowConvo(false); }}
                  className={`w-full flex items-center gap-3 pl-6 pr-4 h-[34px] rounded-r-full text-[14px] font-medium transition-all mb-0.5
                    ${active
                      ? 'bg-[#d3e3fd] dark:bg-violet-800/40 text-[#041e49] dark:text-violet-200 font-semibold'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200/80 dark:hover:bg-gray-800'
                    }`}
                >
                  <Icon size={18} className={active ? 'text-[#041e49] dark:text-violet-300' : 'text-gray-500 dark:text-gray-400'} />
                  <span className="flex-1 text-left truncate">{label}</span>
                  {count > 0 && (
                    <span className={`text-[11px] font-bold ml-1 ${active ? 'text-[#041e49] dark:text-violet-300' : 'text-gray-500 dark:text-gray-400'}`}>
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="mx-4 my-2 border-t border-gray-200/80 dark:border-gray-700/60" />

          {/* Labels */}
          <div className="px-6 pb-1">
            <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Libellés</p>
          </div>
          {NAV_LABELS.map(lbl => (
            <button key={lbl.id}
              className="w-full flex items-center gap-3 pl-6 pr-4 h-[34px] rounded-r-full text-[14px] text-gray-700 dark:text-gray-300 hover:bg-gray-200/80 dark:hover:bg-gray-800 transition-colors">
              <span className={`w-3 h-3 rounded-full flex-shrink-0 ${lbl.dot}`} />
              {lbl.label}
            </button>
          ))}
          <button className="flex items-center gap-2 pl-6 mt-1 mb-3 text-[13px] text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors py-1">
            <Plus size={15} /> Nouveau libellé
          </button>
        </aside>

        {/* ════ THREAD LIST ════════════════════════════════════════════════════
             Always rendered.
             No thread selected  → flex-1 (fills width)
             Thread selected     → w-[380px] fixed + right border
             Mobile + showConvo  → hidden
        ════════════════════════════════════════════════════════════════════════ */}
        <div className={`flex flex-col overflow-hidden min-w-0
          bg-white dark:bg-gray-900
          ${selectedId
            ? 'hidden lg:flex lg:flex-shrink-0 lg:w-[380px] border-r border-gray-200/70 dark:border-gray-700/70'
            : 'flex-1 mx-2 mb-2 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,.1)] dark:shadow-none border border-gray-200/60 dark:border-gray-700/60'
          }
          ${showConvo ? 'hidden lg:flex' : 'flex'}
        `}>

          {/* Toolbar */}
          <div className="flex items-center h-[52px] px-3 border-b border-gray-200/70 dark:border-gray-700/60 flex-shrink-0 gap-2">
            <div className="flex items-center gap-0.5">
              <button onClick={toggleAll}
                className="w-[22px] h-[22px] rounded border-2 flex items-center justify-center border-gray-400 dark:border-gray-500 hover:border-gray-600 dark:hover:border-gray-300 transition-colors">
                {allChecked ? <Check size={13} className="text-gray-600 dark:text-gray-300" /> : someChecked ? <div className="w-2 h-0.5 bg-gray-600 dark:bg-gray-300" /> : null}
              </button>
              <button className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400">
                <ChevronDown size={13} />
              </button>
            </div>

            {someChecked ? (
              <div className="flex items-center gap-0.5 ml-1">
                {(folder === 'trash' ? [
                  { Icon: RotateCcw, title: 'Restaurer',   fn: () => checkedIds.forEach(id => doAction(id, 'restore')) },
                  { Icon: Trash2,    title: 'Suppr. déf.', fn: () => { checkedIds.forEach(id => handlePermanentDelete(id)); setCheckedIds(new Set()); } },
                ] : [
                  { Icon: Archive,  title: 'Archiver',   fn: () => checkedIds.forEach(id => doAction(id, 'archive')) },
                  { Icon: Trash2,   title: 'Supprimer',  fn: () => checkedIds.forEach(id => doAction(id, 'delete'))  },
                  { Icon: MailOpen, title: 'Non lu',     fn: () => checkedIds.forEach(id => doAction(id, 'mark_unread')) },
                ]).map(({ Icon, title, fn }) => (
                  <button key={title} onClick={fn} title={title}
                    className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400">
                    <Icon size={17} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-0.5 ml-1">
                <button onClick={refresh} title="Actualiser"
                  className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400">
                  <RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} />
                </button>
                <button className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400">
                  <MoreVertical size={17} />
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 ml-auto text-[12px] text-gray-400 dark:text-gray-500">
              {folder === 'trash' && filtered.length > 0 && (
                <button onClick={handleEmptyTrash}
                  className="hidden sm:flex items-center gap-1.5 text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium transition-colors text-[12px] px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20">
                  <Trash2 size={12} /> Vider la corbeille
                </button>
              )}
              {totalUnread > 0 && !selectedId && folder !== 'trash' && (
                <button onClick={markAllRead}
                  className="hidden sm:flex items-center gap-1 text-[#7c3aed] dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 font-medium transition-colors text-[12px]">
                  <MailOpen size={13} /> Tout lire
                </button>
              )}
              {!selectedId && <span className="hidden sm:block">{filtered.length} conv.</span>}
              <div className="flex items-center">
                <button disabled className="p-1 rounded-full text-gray-300 dark:text-gray-600"><ChevronLeft size={17} /></button>
                <button disabled className="p-1 rounded-full text-gray-300 dark:text-gray-600"><ChevronRight size={17} /></button>
              </div>
            </div>
          </div>

          {/* Tabs (inbox only, hide when narrow) */}
          {folder === 'inbox' && !selectedId && (
            <div className="flex border-b border-gray-200/70 dark:border-gray-700/60 flex-shrink-0 overflow-x-auto">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-2 px-4 py-3 text-[13px] font-medium transition-all border-b-2 -mb-px whitespace-nowrap flex-shrink-0
                    ${activeTab === id
                      ? 'border-[#7c3aed] text-[#7c3aed] dark:text-violet-400'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}>
                  <Icon size={15} /> {label}
                </button>
              ))}
            </div>
          )}

          {/* Trash banner */}
          {folder === 'trash' && filtered.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200/60 dark:border-amber-700/40 text-[12px] text-amber-700 dark:text-amber-400 flex-shrink-0">
              <AlertTriangle size={13} className="flex-shrink-0" />
              Les messages de la corbeille sont supprimés définitivement après 30 jours.
            </div>
          )}

          {/* Thread rows */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3">
                <Loader2 size={22} className="animate-spin text-[#7c3aed]" />
                <span className="text-[13px] text-gray-400 dark:text-gray-500">Chargement…</span>
              </div>
            ) : filtered.length === 0 ? (
              <EmptyInbox folder={folder} />
            ) : (
              filtered.map(t => (
                <ThreadRow
                  key={t.id}
                  thread={t}
                  selected={t.id === selectedId}
                  checked={checkedIds.has(t.id)}
                  search={search}
                  narrow={!!selectedId}
                  inTrash={folder === 'trash'}
                  onSelect={() => handleSelectThread(t.id)}
                  onCheck={() => toggleCheck(t.id)}
                  onStar={() => doAction(t.id, 'star')}
                  onArchive={() => doAction(t.id, 'archive')}
                  onDelete={() => doAction(t.id, 'delete')}
                  onMarkUnread={() => doAction(t.id, 'mark_unread')}
                  onRestore={() => doAction(t.id, 'restore')}
                  onPermanentDelete={() => handlePermanentDelete(t.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* ════ CONVERSATION PANEL (flex-1) ════════════════════════════════════ */}
        {selectedThread ? (
          <div className={`flex-1 flex flex-col overflow-hidden min-w-0 ${showConvo ? 'flex' : 'hidden lg:flex'}`}>

            {/* Conversation toolbar */}
            <div className="flex-shrink-0 flex items-center h-[52px] px-3 gap-0.5 bg-[#f6f8fc] dark:bg-gray-950 border-b border-gray-200/70 dark:border-gray-700/60">
              <button
                onClick={() => { setSelectedId(null); setMessages([]); setShowConvo(false); }}
                className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400 mr-1"
              >
                <ChevronLeft size={20} />
              </button>
              {(selectedThread.status === 'trash' ? [
                { Icon: RotateCcw,    title: 'Restaurer',               fn: () => doAction(selectedThread.id, 'restore') },
                { Icon: Trash2,       title: 'Supprimer définitivement', fn: () => handlePermanentDelete(selectedThread.id) },
                { Icon: MailOpen,     title: 'Marquer non lu',   fn: () => doAction(selectedThread.id, 'mark_unread') },
                { Icon: MoreVertical, title: 'Plus',             fn: () => {} },
              ] : [
                { Icon: Archive,      title: selectedThread.status === 'archived' ? 'Désarchiver' : 'Archiver', fn: () => doAction(selectedThread.id, 'archive') },
                { Icon: Trash2,       title: 'Supprimer',        fn: () => doAction(selectedThread.id, 'delete')  },
                { Icon: MailOpen,     title: 'Marquer non lu',   fn: () => doAction(selectedThread.id, 'mark_unread') },
                { Icon: Clock,        title: 'Reporter',         fn: () => {} },
                { Icon: Tag,          title: 'Libellé',          fn: () => {} },
                { Icon: MoreVertical, title: 'Plus',             fn: () => {} },
              ]).map(({ Icon, title, fn }) => (
                <button key={title} onClick={fn} title={title}
                  className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400">
                  <Icon size={18} />
                </button>
              ))}
              <div className="flex items-center gap-1 ml-auto text-[12px] text-gray-400 dark:text-gray-500">
                <span className="hidden sm:block">{filtered.findIndex(t => t.id === selectedId) + 1} / {filtered.length}</span>
                <button onClick={() => { const i = filtered.findIndex(t => t.id === selectedId); if (i > 0) handleSelectThread(filtered[i - 1].id); }}
                  className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"><ChevronLeft size={17} /></button>
                <button onClick={() => { const i = filtered.findIndex(t => t.id === selectedId); if (i < filtered.length - 1) handleSelectThread(filtered[i + 1].id); }}
                  className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"><ChevronRight size={17} /></button>
              </div>
            </div>

            {/* Conversation body */}
            <div className="flex-1 overflow-y-auto bg-[#f6f8fc] dark:bg-gray-950">
              <div className="max-w-[860px] mx-auto px-6 py-6">

                {/* Subject + meta */}
                <div className="flex items-start gap-3 mb-6">
                  <h1 className="text-[26px] font-normal text-gray-900 dark:text-gray-100 flex-1 leading-tight">
                    {selectedThread.subject || '(Sans objet)'}
                  </h1>
                  <div className="flex items-center gap-2 flex-shrink-0 mt-1">
                    {(() => { const c = LABEL_CONFIG[autoLabel(selectedThread)]; return (
                      <span className={`text-[12px] font-medium px-2.5 py-1 rounded-full ${c.bg} ${c.text}`}>{c.label}</span>
                    ); })()}
                    <button onClick={() => doAction(selectedThread.id, 'star')}
                      className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">
                      <Star size={21} className={selectedThread.starred ? 'fill-amber-400 text-amber-400' : 'text-gray-400 dark:text-gray-500'} />
                    </button>
                  </div>
                </div>

                {/* Messages */}
                {loadingMessages ? (
                  <div className="flex flex-col items-center justify-center h-40 gap-3">
                    <Loader2 size={24} className="animate-spin text-[#7c3aed]" />
                    <span className="text-[13px] text-gray-400 dark:text-gray-500">Chargement…</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map(msg => (
                      <MessageCard key={msg.id} message={msg} senderName={senderLabel} emailAlias={emailAlias ?? null}
                        onReply={() => setReplyOpen(true)}
                        onDelete={() => folder === 'trash'
                          ? handlePermanentDelete(selectedThread!.id)
                          : doAction(selectedThread!.id, 'delete')
                        }
                      />
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}

                {/* Reply area */}
                <div className="mt-6">
                  {replyOpen ? (
                    <ReplyBox thread={selectedThread} onSend={handleReply} onClose={() => setReplyOpen(false)} userName={userName} userId={userId} />
                  ) : (
                    !loadingMessages && messages.length > 0 && (
                      <div className="flex items-center gap-3 pb-4">
                        <button onClick={() => setReplyOpen(true)}
                          className="flex items-center gap-2 px-6 py-2.5 rounded-full border border-gray-300 dark:border-gray-600 text-[14px] font-medium text-gray-600 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:border-[#7c3aed] hover:text-[#7c3aed] dark:hover:text-violet-400 transition-all shadow-sm">
                          <Reply size={16} /> Répondre
                        </button>
                        <button
                          className="flex items-center gap-2 px-6 py-2.5 rounded-full border border-gray-300 dark:border-gray-600 text-[14px] font-medium text-gray-600 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:border-[#7c3aed] hover:text-[#7c3aed] dark:hover:text-violet-400 transition-all shadow-sm">
                          <Forward size={16} /> Transférer
                        </button>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* No thread selected — desktop placeholder */
          <div className="hidden lg:flex flex-1 items-center justify-center bg-[#f6f8fc] dark:bg-gray-950">
            <NoThreadSelected />
          </div>
        )}
      </div>

      {/* ── Toast ────────────────────────────────────────────────────────────── */}
      {toast && <Toast data={toast} onClose={() => setToast(null)} />}

      {/* ── Compose modal ────────────────────────────────────────────────────── */}
      {composeOpen && (
        <ComposeModal
          onClose={() => setComposeOpen(false)}
          onMinimize={() => setComposeMin(v => !v)}
          minimized={composeMin}
          onSent={handleCompose}
          userName={userName}
          userId={userId}
        />
      )}

      {/* Mobile FAB */}
      <button
        onClick={() => { setComposeOpen(true); setComposeMin(false); }}
        className="lg:hidden fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all active:scale-95"
        style={{ background: '#7c3aed' }}
      >
        <Pencil size={22} className="text-white" />
      </button>
    </div>
  );
}
