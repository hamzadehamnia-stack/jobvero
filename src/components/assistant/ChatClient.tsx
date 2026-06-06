'use client';

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Sparkles,
  Send,
  Loader2,
  Trash2,
  RotateCcw,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface Props {
  userId: string;
  displayName: string;
  initialMessages: ChatMessage[];
  avatarUrl: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function initials(name: string) {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// Render assistant markdown-lite: bold, bullets, line breaks
function renderContent(text: string) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const trimmed = line.trim();
    const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('• ');
    const content = isBullet ? trimmed.slice(2) : line;

    // Bold: **text**
    const parts = content.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={j}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });

    if (isBullet) {
      return (
        <div key={i} className="flex gap-2 my-0.5">
          <span className="text-violet-400 flex-shrink-0 mt-1">•</span>
          <span>{parts}</span>
        </div>
      );
    }
    if (trimmed === '') return <div key={i} className="h-2" />;
    return <div key={i}>{parts}</div>;
  });
}

// Typing cursor
function Cursor() {
  return (
    <span className="inline-block w-0.5 h-4 bg-violet-400 ml-0.5 animate-pulse align-middle" />
  );
}

// ─── Suggestion chips ─────────────────────────────────────────────────────────

const SUGGESTIONS = [
  'How do I tailor my CV for ATS?',
  'Tips for salary negotiation',
  'How to prepare for interviews',
  'Write a cold outreach message',
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ChatClient({ userId, displayName, initialMessages, avatarUrl: initialAvatarUrl }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const userInitials = initials(displayName);

  useEffect(() => {
    const handler = (e: Event) => {
      const url = (e as CustomEvent<string>).detail;
      setAvatarUrl(url || null);
    };
    window.addEventListener('avatar-updated', handler);
    return () => window.removeEventListener('avatar-updated', handler);
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // Auto-grow textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  // Send message
  const send = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || isStreaming) return;

    setInput('');
    setError('');
    if (inputRef.current) inputRef.current.style.height = 'auto';

    // Optimistic user message
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);
    setStreamingText('');

    // Build history for API (last 20 messages for context window)
    const history = [...messages, userMsg]
      .slice(-20)
      .map(m => ({ role: m.role, content: m.content }));

    try {
      abortRef.current = new AbortController();
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      // Stream reading
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let full = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        full += chunk;
        setStreamingText(full);
      }

      // Commit streaming message
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: full,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      setStreamingText('');
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setError(msg);
      // Remove optimistic user message on failure
      setMessages(prev => prev.filter(m => m.id !== userMsg.id));
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  }, [input, isStreaming, messages]);

  // Enter to send (Shift+Enter = newline)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // Clear history
  const clearHistory = useCallback(async () => {
    if (!confirm('Clear all chat history? This cannot be undone.')) return;
    await supabase.from('chat_messages').delete().eq('user_id', userId);
    setMessages([]);
  }, [supabase, userId]);

  const isEmpty = messages.length === 0 && !isStreaming;

  return (
    <div className="flex flex-col h-full min-h-screen bg-gray-50 dark:bg-gray-950">

      {/* ── Header ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-violet-500 flex items-center justify-center shadow-md shadow-violet-500/25">
            <Sparkles size={17} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">
              Career Assistant
            </h1>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Powered by Claude AI
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clearHistory}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          >
            <Trash2 size={13} />
            Clear
          </button>
        )}
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Empty state */}
        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-full min-h-[40vh] text-center gap-6">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-100 to-violet-50 dark:from-violet-950/60 dark:to-violet-900/30 flex items-center justify-center mx-auto mb-4 border border-violet-200 dark:border-violet-800">
                <Sparkles size={24} className="text-violet-500" />
              </div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                Your AI Career Assistant
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
                Ask me anything about job searching, CVs, interviews, salaries, or career development.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:border-violet-400 dark:hover:border-violet-600 hover:text-violet-700 dark:hover:text-violet-300 transition-all shadow-sm"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message list */}
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            {/* Avatar */}
            {msg.role === 'assistant' ? (
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-violet-500 flex items-center justify-center flex-shrink-0 shadow-sm shadow-violet-500/20 mt-1">
                <Sparkles size={14} className="text-white" />
              </div>
            ) : avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="w-8 h-8 rounded-xl object-cover flex-shrink-0 mt-1 ring-2 ring-violet-500/30"
              />
            ) : (
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-gray-700 to-gray-600 dark:from-gray-600 dark:to-gray-500 flex items-center justify-center flex-shrink-0 text-white text-xs font-semibold mt-1">
                {userInitials}
              </div>
            )}

            {/* Bubble */}
            <div className={`max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
              <div
                className={`px-4 py-3 rounded-2xl text-sm leading-relaxed
                  ${msg.role === 'user'
                    ? 'bg-gradient-to-br from-violet-600 to-violet-500 text-white rounded-tr-sm shadow-md shadow-violet-500/20'
                    : 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-tl-sm shadow-sm'
                  }`}
              >
                {msg.role === 'assistant'
                  ? renderContent(msg.content)
                  : msg.content}
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-600 px-1">
                {formatTime(msg.created_at)}
              </span>
            </div>
          </div>
        ))}

        {/* Streaming bubble */}
        {isStreaming && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-violet-500 flex items-center justify-center flex-shrink-0 shadow-sm shadow-violet-500/20 mt-1">
              <Sparkles size={14} className="text-white" />
            </div>
            <div className="max-w-[75%]">
              <div className="px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700 shadow-sm">
                {streamingText
                  ? <>{renderContent(streamingText)}<Cursor /></>
                  : (
                    <span className="flex items-center gap-2 text-gray-400 dark:text-gray-500">
                      <Loader2 size={14} className="animate-spin" />
                      Thinking…
                    </span>
                  )
                }
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError('')}
              className="flex-shrink-0 p-1 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors"
            >
              <RotateCcw size={13} />
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      <div className="flex-shrink-0 px-4 sm:px-6 py-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
        <div className="flex items-end gap-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 focus-within:ring-2 focus-within:ring-violet-500 focus-within:border-transparent transition-all">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask about CVs, interviews, salaries…"
            disabled={isStreaming}
            className="flex-1 bg-transparent resize-none text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none leading-relaxed max-h-40 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => send()}
            disabled={!input.trim() || isStreaming}
            className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 flex items-center justify-center text-white shadow-md shadow-violet-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {isStreaming
              ? <Loader2 size={15} className="animate-spin" />
              : <Send size={15} />
            }
          </button>
        </div>
        <p className="text-xs text-center text-gray-400 dark:text-gray-600 mt-2">
          Career assistant only · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
