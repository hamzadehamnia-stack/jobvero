'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import UpgradeModal from '@/components/UpgradeModal';
import {
  Mic, ChevronRight, Loader2, Send, RotateCcw,
  Trophy, TrendingUp, Lightbulb, Star, Briefcase,
  Info, AlertCircle, CheckCircle, MessageSquare,
  Volume2, VolumeX, Search, X, MapPin, Building2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiMessage { role: 'user' | 'assistant'; content: string; }

interface DisplayMessage {
  id: string;
  type: 'question' | 'answer' | 'feedback';
  content: string;
}

interface FinalReport {
  score: number;
  strengths: string[];
  improvements: string[];
  tips: string[];
}

interface Settings {
  jobDescription: string;
  interviewType: string;
  difficulty: string;
  language: string;
  cvId: string;
}

interface CvOption {
  id: string;
  title: string;
  created_at: string;
}

interface ModalJob {
  title: string;
  company: string;
  location: string;
  description: string;
}

interface AdzunaRaw {
  id: string;
  title: string;
  company?: { display_name: string };
  location?: { display_name: string };
  description?: string;
}

interface SavedJobOption {
  id: string;
  job_title: string;
  company_name: string;
  location: string;
  notes: string;
}

interface Props {
  userId: string;
  sessionsUsed: number;
  sessionLimit: number;
  plan: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INTERVIEW_TYPES = ['Mixed (recommended)', 'Behavioral', 'Technical', 'HR/Motivation'];
const DIFFICULTIES    = ['Junior', 'Mid-level', 'Senior'];
const LANGUAGES       = [
  { code: 'fr', label: 'French'     },
  { code: 'en', label: 'English'    },
  { code: 'es', label: 'Spanish'    },
  { code: 'pt', label: 'Portuguese' },
];

const TOTAL_QUESTIONS = 8;

const MODAL_COUNTRIES = [
  { code: 'fr', label: '🇫🇷 France'       },
  { code: 'us', label: '🇺🇸 USA'          },
  { code: 'gb', label: '🇬🇧 UK'           },
  { code: 'ca', label: '🇨🇦 Canada'       },
  { code: 'de', label: '🇩🇪 Germany'      },
  { code: 'be', label: '🇧🇪 Belgium'      },
  { code: 'ch', label: '🇨🇭 Switzerland'  },
  { code: 'nl', label: '🇳🇱 Netherlands'  },
  { code: 'es', label: '🇪🇸 Spain'        },
  { code: 'pt', label: '🇵🇹 Portugal'     },
  { code: 'au', label: '🇦🇺 Australia'    },
  { code: 'ie', label: '🇮🇪 Ireland'      },
  { code: 'br', label: '🇧🇷 Brazil'       },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function parseRecruiterResponse(text: string): {
  feedback?: string;
  question?: string;
  report?: FinalReport | null;
} {
  const feedbackMatch = text.match(/^FEEDBACK:\s*([\s\S]*?)(?=\n\nQUESTION:|\n\nFINAL_REPORT:|$)/im);
  const questionMatch = text.match(/QUESTION:\s*([\s\S]+?)(?=\n\nFINAL_REPORT:|$)/im);
  const reportMatch   = text.match(/FINAL_REPORT:\s*(\{[\s\S]+\})\s*$/im);

  let report: FinalReport | null = null;
  if (reportMatch) {
    try { report = JSON.parse(reportMatch[1].trim()); } catch { /* ignore */ }
  }

  return {
    feedback: feedbackMatch?.[1]?.trim(),
    question: questionMatch?.[1]?.trim(),
    report,
  };
}

const inputCls =
  'w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 ' +
  'bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white ' +
  'focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400';

// ─── Main component ───────────────────────────────────────────────────────────

export default function InterviewCoachClient({ userId, sessionsUsed, sessionLimit, plan }: Props) {
  const pathname = usePathname();
  const locale   = pathname?.split('/')[1] ?? 'en';

  // ── Phase & settings ──────────────────────────────────────────────────────
  const [phase, setPhase] = useState<'setup' | 'interviewing' | 'complete'>('setup');
  const [settings, setSettings] = useState<Settings>({
    jobDescription: '',
    interviewType:  'Mixed (recommended)',
    difficulty:     'Mid-level',
    language:       'fr',
    cvId:           '',
  });
  const [cvOptions,         setCvOptions]         = useState<CvOption[]>([]);
  const [savedJobs,         setSavedJobs]         = useState<SavedJobOption[]>([]);
  const [savedJobsLoading,  setSavedJobsLoading]  = useState(true);
  const [savedJobSelectVal, setSavedJobSelectVal] = useState('');

  // ── Job search modal ──────────────────────────────────────────────────────
  const [showJobModal,    setShowJobModal]    = useState(false);
  const [modalKeyword,    setModalKeyword]    = useState('');
  const [modalCountry,    setModalCountry]    = useState('fr');
  const [modalSearching,  setModalSearching]  = useState(false);
  const [modalJobs,       setModalJobs]       = useState<ModalJob[]>([]);
  const [modalError,      setModalError]      = useState('');
  const [selectedJob,     setSelectedJob]     = useState<{ title: string; company: string } | null>(null);

  // ── Conversation ──────────────────────────────────────────────────────────
  const [history,         setHistory]         = useState<ApiMessage[]>([]);
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([]);
  const [currentAnswer,   setCurrentAnswer]   = useState('');
  const [answersGiven,    setAnswersGiven]     = useState(0);

  // ── Streaming ─────────────────────────────────────────────────────────────
  const [isStreaming,   setIsStreaming]   = useState(false);
  const [streamingText, setStreamingText] = useState('');

  // ── Voice — STT ───────────────────────────────────────────────────────────
  const [isRecording,      setIsRecording]      = useState(false);
  const [isTranscribing,   setIsTranscribing]   = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef  = useRef<MediaRecorder | null>(null);
  const audioChunksRef    = useRef<Blob[]>([]);
  const isRecordingRef    = useRef(false);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartRef = useRef<number>(0);

  // ── Voice — TTS ───────────────────────────────────────────────────────────
  const [isTtsEnabled, setIsTtsEnabled] = useState(true);
  const [isSpeaking,   setIsSpeaking]   = useState(false);
  const isTtsEnabledRef = useRef(true);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const settingsRef     = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // ── Session & report ──────────────────────────────────────────────────────
  const [finalReport,       setFinalReport]       = useState<FinalReport | null>(null);
  const [sessionId,         setSessionId]         = useState<string | null>(null);
  const [localSessionsUsed, setLocalSessionsUsed] = useState(sessionsUsed);
  const [showUpgradeModal,  setShowUpgradeModal]  = useState(false);

  // ── UI ────────────────────────────────────────────────────────────────────
  const [error,      setError]      = useState('');
  const [startingUp, setStartingUp] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages, streamingText, isStreaming]);

  // Fetch user's saved CVs and tracked jobs for the setup dropdowns
  useEffect(() => {
    const supabase = createClient();
    supabase.from('cvs').select('id, title, created_at').order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setCvOptions(data); });
    supabase.from('applications').select('id, job_title, company_name, location, notes').order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setSavedJobs(data as SavedJobOption[]);
        setSavedJobsLoading(false);
      });
  }, []);

  // ── TTS ───────────────────────────────────────────────────────────────────

  function stopCurrentAudio() {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.src = '';
      currentAudioRef.current = null;
    }
    setIsSpeaking(false);
  }

  function toggleTts() {
    setIsTtsEnabled(v => {
      isTtsEnabledRef.current = !v;
      if (!isTtsEnabledRef.current) stopCurrentAudio();
      return !v;
    });
  }

  async function speakText(text: string) {
    if (!isTtsEnabledRef.current || !text.trim()) return;
    stopCurrentAudio();
    try {
      const res = await fetch('/api/text-to-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), language: settingsRef.current.language }),
      });
      if (!res.ok) return;
      const { audio, mimeType } = await res.json();
      if (!audio || !isTtsEnabledRef.current) return;
      const el = new Audio(`data:${mimeType};base64,${audio}`);
      currentAudioRef.current = el;
      setIsSpeaking(true);
      el.onended  = () => { currentAudioRef.current = null; setIsSpeaking(false); };
      el.onerror  = () => { currentAudioRef.current = null; setIsSpeaking(false); };
      el.play().catch(() => { currentAudioRef.current = null; setIsSpeaking(false); });
    } catch {
      setIsSpeaking(false);
    }
  }

  // ── STT ──────────────────────────────────────────────────────────────────

  function formatDuration(s: number) {
    return `0:${String(s).padStart(2, '0')}`;
  }

  function clearRecordingTimer() {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }

  async function startRecording() {
    if (isRecordingRef.current || isStreaming || isTranscribing) return;
    setError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      audioChunksRef.current = [];

      recorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' });
        if (blob.size < 500) {
          // Too short — nothing captured, skip silently
          return;
        }
        await transcribeAndSend(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(100); // collect chunks every 100ms for reliable data
      recordingStartRef.current = Date.now();
      isRecordingRef.current = true;
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(s => s + 1);
      }, 1000);
    } catch {
      setError('Microphone access denied. Please allow microphone access and try again.');
    }
  }

  function stopRecording() {
    if (!isRecordingRef.current) return;

    const elapsed = Date.now() - recordingStartRef.current;
    const MIN_MS = 500;

    const doStop = () => {
      isRecordingRef.current = false;
      clearRecordingTimer();
      setRecordingSeconds(0);
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    };

    // Ensure at least 500ms of audio is captured before stopping
    if (elapsed < MIN_MS) {
      setTimeout(doStop, MIN_MS - elapsed);
    } else {
      doStop();
    }
  }

  // Desktop: single click toggles start/stop
  function handleMicClick() {
    if (isRecordingRef.current) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  // Mobile: touch-start begins, touch-end stops (hold-to-speak)
  function handleTouchStart(e: React.TouchEvent) {
    e.preventDefault(); // block synthetic click that follows touch
    startRecording();
  }

  function handleTouchEnd(e: React.TouchEvent) {
    e.preventDefault();
    stopRecording();
  }

  async function transcribeAndSend(blob: Blob) {
    setIsTranscribing(true);
    try {
      const form = new FormData();
      form.append('audio', blob, 'audio.webm');
      const res = await fetch('/api/speech-to-text', { method: 'POST', body: form });
      if (!res.ok) throw new Error('Transcription failed');
      const { transcript } = await res.json();
      if (transcript?.trim()) {
        await sendAnswer(transcript.trim());
      }
    } catch {
      setError('Failed to transcribe audio. Please type your answer instead.');
    } finally {
      setIsTranscribing(false);
    }
  }

  // ── Stream recruiter response ──────────────────────────────────────────────

  async function streamRecruiterResponse(
    currentHistory: ApiMessage[],
    qNum: number,
    sid: string | null,
  ) {
    setIsStreaming(true);
    setStreamingText('');
    setError('');

    try {
      const res = await fetch('/api/interview-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages:       currentHistory,
          jobDescription: settingsRef.current.jobDescription,
          interviewType:  settingsRef.current.interviewType,
          difficulty:     settingsRef.current.difficulty,
          language:       settingsRef.current.language,
          questionNumber: qNum,
          cvId:           settingsRef.current.cvId || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let raw = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
        if (qNum === 0) setStreamingText(raw); // live-stream only first question
      }

      const newHistory: ApiMessage[] = [
        ...currentHistory,
        { role: 'assistant', content: raw },
      ];
      setHistory(newHistory);
      setStreamingText('');

      if (qNum === 0) {
        const questionText = raw.trim();
        setDisplayMessages(prev => [...prev, {
          id: crypto.randomUUID(), type: 'question', content: questionText,
        }]);
        speakText(questionText);
      } else {
        const parsed = parseRecruiterResponse(raw);
        const newMsgs: DisplayMessage[] = [];

        if (parsed.feedback) {
          newMsgs.push({ id: crypto.randomUUID(), type: 'feedback', content: parsed.feedback });
        }

        if (parsed.report) {
          setDisplayMessages(prev => [...prev, ...newMsgs]);
          setFinalReport(parsed.report);
          if (sid) {
            const supabase = createClient();
            await supabase
              .from('interview_sessions')
              .update({ score: parsed.report.score, feedback_json: parsed.report })
              .eq('id', sid);
          }
          setPhase('complete');
          return;
        }

        if (parsed.question) {
          newMsgs.push({ id: crypto.randomUUID(), type: 'question', content: parsed.question });
        }

        setDisplayMessages(prev => [...prev, ...newMsgs]);

        // Speak feedback + question together
        const toSpeak = [parsed.feedback, parsed.question].filter(Boolean).join(' ');
        speakText(toSpeak);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setIsStreaming(false);
    }
  }

  // ── Job search modal ──────────────────────────────────────────────────────

  async function searchModalJobs() {
    if (!modalKeyword.trim()) return;
    setModalSearching(true);
    setModalError('');
    setModalJobs([]);
    try {
      const params = new URLSearchParams({ what: modalKeyword.trim(), country: modalCountry });
      const res  = await fetch(`/api/jobs/search?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Search failed');
      const jobs: ModalJob[] = ((data.results ?? []) as AdzunaRaw[]).map(j => ({
        title:       j.title,
        company:     j.company?.display_name  ?? '',
        location:    j.location?.display_name ?? '',
        description: stripHtml(j.description ?? ''),
      }));
      setModalJobs(jobs);
    } catch (e) {
      setModalError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setModalSearching(false);
    }
  }

  function pickJob(job: ModalJob) {
    const text = [
      `${job.title}${job.company ? ` at ${job.company}` : ''}${job.location ? ` — ${job.location}` : ''}`,
      '',
      job.description,
    ].join('\n');
    setSettings(s => ({ ...s, jobDescription: text }));
    setSelectedJob({ title: job.title, company: job.company });
    setShowJobModal(false);
  }

  function handleSavedJobPick(id: string) {
    const job = savedJobs.find(j => j.id === id);
    if (!job) return;
    const lines: string[] = [`${job.job_title}${job.company_name ? ` at ${job.company_name}` : ''}`];
    if (job.location) lines.push(`Location: ${job.location}`);
    if (job.notes?.trim()) { lines.push(''); lines.push(job.notes.trim()); }
    setSettings(s => ({ ...s, jobDescription: lines.join('\n') }));
    setSelectedJob({ title: job.job_title, company: job.company_name });
    setSavedJobSelectVal('');
  }

  // ── Start interview ────────────────────────────────────────────────────────

  async function handleStart() {
    if (localSessionsUsed >= sessionLimit) { setShowUpgradeModal(true); return; }

    setStartingUp(true);
    setError('');

    try {
      const supabase = createClient();
      const { data: session } = await supabase
        .from('interview_sessions')
        .insert({
          user_id:         userId,
          job_description: settings.jobDescription || null,
          interview_type:  settings.interviewType,
          difficulty:      settings.difficulty,
          language:        settings.language,
        })
        .select('id')
        .single();

      const sid = session?.id ?? null;
      setSessionId(sid);
      setLocalSessionsUsed(n => n + 1);
      setAnswersGiven(0);
      setHistory([]);
      setDisplayMessages([]);
      setFinalReport(null);
      setPhase('interviewing');

      await streamRecruiterResponse([], 0, sid);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start interview');
    } finally {
      setStartingUp(false);
    }
  }

  // ── Send answer ───────────────────────────────────────────────────────────

  async function sendAnswer(text: string) {
    if (!text || isStreaming) return;
    const newAnswersGiven = answersGiven + 1;
    setDisplayMessages(prev => [...prev, { id: crypto.randomUUID(), type: 'answer', content: text }]);
    setCurrentAnswer('');
    setAnswersGiven(newAnswersGiven);
    const newHistory: ApiMessage[] = [...history, { role: 'user', content: text }];
    setHistory(newHistory);
    await streamRecruiterResponse(newHistory, newAnswersGiven, sessionId);
  }

  async function handleSendAnswer() {
    const text = currentAnswer.trim();
    if (!text || isStreaming) return;
    await sendAnswer(text);
  }

  // ── Reset ─────────────────────────────────────────────────────────────────

  function handleReset() {
    // Stop recording if active
    stopRecording();
    // Stop any TTS playback
    stopCurrentAudio();
    setPhase('setup');
    setHistory([]);
    setDisplayMessages([]);
    setCurrentAnswer('');
    setAnswersGiven(0);
    setStreamingText('');
    setFinalReport(null);
    setSessionId(null);
    setError('');
  }

  // ─── Setup screen ─────────────────────────────────────────────────────────

  if (phase === 'setup') {
    return (
      <div className="flex-1 flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-2xl">

            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/30 mb-4">
                <Mic size={28} className="text-white" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Interview Coach</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                AI-powered mock interviews with real-time feedback
              </p>
            </div>

            <div className="flex justify-center mb-6">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                localSessionsUsed >= sessionLimit
                  ? 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400'
                  : 'bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400'
              }`}>
                <Info size={12} />
                {localSessionsUsed} / {sessionLimit} sessions used this month
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-6 space-y-5">

              {/* CV selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Your CV <span className="font-normal normal-case text-gray-400">(optional — personalizes questions to your experience)</span>
                </label>
                <select
                  value={settings.cvId}
                  onChange={e => setSettings(s => ({ ...s, cvId: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">No CV selected</option>
                  {cvOptions.map(cv => (
                    <option key={cv.id} value={cv.id}>{cv.title}</option>
                  ))}
                </select>
              </div>

              {/* Job offer — 3 input methods */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Job Offer <span className="font-normal normal-case text-gray-400">(optional — for targeted questions)</span>
                </label>

                {/* Row 1: saved jobs dropdown + search button */}
                <div className="flex gap-2 mb-2">
                  <select
                    value={savedJobSelectVal}
                    onChange={e => handleSavedJobPick(e.target.value)}
                    disabled={savedJobsLoading}
                    className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 disabled:opacity-50"
                  >
                    <option value="">
                      {savedJobsLoading ? 'Loading saved jobs…' : savedJobs.length === 0 ? '📋 No saved jobs yet' : '📋 Choose from saved jobs'}
                    </option>
                    {savedJobs.map(j => (
                      <option key={j.id} value={j.id}>
                        {j.job_title}{j.company_name ? ` at ${j.company_name}` : ''}{j.location ? ` — ${j.location}` : ''}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => { setShowJobModal(true); setModalJobs([]); setModalError(''); }}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40 border border-violet-200 dark:border-violet-800 transition-colors whitespace-nowrap"
                  >
                    <Search size={11} /> Search jobs
                  </button>
                </div>

                {/* Selected job tag */}
                {selectedJob && (
                  <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 text-xs text-violet-800 dark:text-violet-200">
                    <Briefcase size={12} className="flex-shrink-0 text-violet-500" />
                    <span className="flex-1 min-w-0 truncate font-medium">
                      {selectedJob.title}{selectedJob.company ? ` at ${selectedJob.company}` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => { setSelectedJob(null); setSettings(s => ({ ...s, jobDescription: '' })); }}
                      className="flex-shrink-0 text-violet-400 hover:text-violet-600 dark:hover:text-violet-200 transition-colors"
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}

                {/* Manual textarea */}
                <textarea
                  value={settings.jobDescription}
                  onChange={e => { setSettings(s => ({ ...s, jobDescription: e.target.value })); setSelectedJob(null); }}
                  placeholder="✏️ Or paste any job description here…"
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 resize-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">Type</label>
                  <select value={settings.interviewType} onChange={e => setSettings(s => ({ ...s, interviewType: e.target.value }))} className={inputCls}>
                    {INTERVIEW_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">Level</label>
                  <select value={settings.difficulty} onChange={e => setSettings(s => ({ ...s, difficulty: e.target.value }))} className={inputCls}>
                    {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">Language</label>
                  <select value={settings.language} onChange={e => setSettings(s => ({ ...s, language: e.target.value }))} className={inputCls}>
                    {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                  </select>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  {error}
                </div>
              )}

              <button
                onClick={handleStart}
                disabled={startingUp || localSessionsUsed >= sessionLimit}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white shadow-lg shadow-violet-500/25 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}
              >
                {startingUp
                  ? <><Loader2 size={16} className="animate-spin" /> Starting interview…</>
                  : localSessionsUsed >= sessionLimit
                  ? <>Session limit reached — Upgrade to continue</>
                  : <><Mic size={16} /> Start Interview <ChevronRight size={16} /></>
                }
              </button>
            </div>
          </div>
        </div>

        <UpgradeModal
          isOpen={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          reason="limit_reached"
          upgradeTo={plan === 'pro' ? 'premium' : 'pro'}
          locale={locale}
        />

        {/* ── Job search modal ── */}
        {showJobModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) setShowJobModal(false); }}
          >
            <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col max-h-[85vh]">

              {/* Modal header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-950/40 flex items-center justify-center">
                    <Search size={13} className="text-violet-600 dark:text-violet-400" />
                  </div>
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Choose a Job Offer</h2>
                </div>
                <button
                  onClick={() => setShowJobModal(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Search bar */}
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={modalKeyword}
                    onChange={e => setModalKeyword(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') searchModalJobs(); }}
                    placeholder="Job title, keywords…"
                    className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
                  />
                  <select
                    value={modalCountry}
                    onChange={e => setModalCountry(e.target.value)}
                    className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
                  >
                    {MODAL_COUNTRIES.map(c => (
                      <option key={c.code} value={c.code}>{c.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={searchModalJobs}
                    disabled={modalSearching || !modalKeyword.trim()}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}
                  >
                    {modalSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                    Search
                  </button>
                </div>
              </div>

              {/* Results */}
              <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
                {modalSearching && (
                  <div className="flex items-center justify-center py-12 text-gray-400 dark:text-gray-500">
                    <Loader2 size={20} className="animate-spin mr-2" /> Searching…
                  </div>
                )}

                {modalError && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
                    <AlertCircle size={14} className="flex-shrink-0" /> {modalError}
                  </div>
                )}

                {!modalSearching && !modalError && modalJobs.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-gray-400 dark:text-gray-500">
                    <Search size={28} className="mb-2 opacity-40" />
                    <p className="text-sm">Search for a job to get started</p>
                  </div>
                )}

                {modalJobs.map((job, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => pickJob(job)}
                    className="w-full text-left px-4 py-3.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-violet-400 dark:hover:border-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/20 transition-all group"
                  >
                    <p className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-violet-700 dark:group-hover:text-violet-300 truncate mb-1">
                      {job.title}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      {job.company && (
                        <span className="flex items-center gap-1 truncate">
                          <Building2 size={11} /> {job.company}
                        </span>
                      )}
                      {job.location && (
                        <span className="flex items-center gap-1 truncate">
                          <MapPin size={11} /> {job.location}
                        </span>
                      )}
                    </div>
                    {job.description && (
                      <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500 line-clamp-2 leading-relaxed">
                        {job.description}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Complete screen ──────────────────────────────────────────────────────

  if (phase === 'complete' && finalReport) {
    const score = finalReport.score ?? 0;
    const scoreMeta = score >= 80
      ? { color: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500', ring: 'border-emerald-200 dark:border-emerald-800', bg: 'bg-emerald-50 dark:bg-emerald-950/20' }
      : score >= 60
      ? { color: 'text-amber-600 dark:text-amber-400',   bar: 'bg-amber-500',   ring: 'border-amber-200 dark:border-amber-800',   bg: 'bg-amber-50 dark:bg-amber-950/20'   }
      : { color: 'text-red-600 dark:text-red-400',       bar: 'bg-red-500',     ring: 'border-red-200 dark:border-red-800',       bg: 'bg-red-50 dark:bg-red-950/20'       };

    return (
      <div className="flex-1 flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto space-y-5">

            <div className="text-center pt-4">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/30 mb-3">
                <Trophy size={24} className="text-white" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Interview Complete!</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Here&apos;s your performance breakdown</p>
            </div>

            <div className={`rounded-2xl border p-6 text-center ${scoreMeta.ring} ${scoreMeta.bg}`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Overall Score</p>
              <p className={`text-6xl font-bold ${scoreMeta.color}`}>{score}</p>
              <p className="text-xs text-gray-400 mt-0.5">out of 100</p>
              <div className="mt-4 bg-gray-200 dark:bg-gray-700 rounded-full h-2 max-w-xs mx-auto overflow-hidden">
                <div className={`h-2 rounded-full transition-all duration-1000 ${scoreMeta.bar}`} style={{ width: `${score}%` }} />
              </div>
            </div>

            {finalReport.strengths?.length > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle size={15} className="text-emerald-500" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Strengths</h3>
                </div>
                <ul className="space-y-2">
                  {finalReport.strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <Star size={12} className="text-emerald-500 mt-1 flex-shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {finalReport.improvements?.length > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp size={15} className="text-amber-500" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Areas to Improve</h3>
                </div>
                <ul className="space-y-2">
                  {finalReport.improvements.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {finalReport.tips?.length > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb size={15} className="text-violet-500" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Tips for Next Time</h3>
                </div>
                <ul className="space-y-2">
                  {finalReport.tips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-500 mt-1.5 flex-shrink-0" />
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={handleReset}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition-all"
              style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}
            >
              <RotateCcw size={15} /> Start New Interview
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Interview screen ─────────────────────────────────────────────────────

  const displayQuestionNumber = Math.min(answersGiven + 1, TOTAL_QUESTIONS);
  const progress = (answersGiven / TOTAL_QUESTIONS) * 100;
  const isGeneratingReport = isStreaming && answersGiven >= TOTAL_QUESTIONS;

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-950">

      {/* ── Progress header ── */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-950/40 flex items-center justify-center">
                <Mic size={15} className="text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {isGeneratingReport ? 'Generating your report…' : `Question ${displayQuestionNumber} of ${TOTAL_QUESTIONS}`}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {settings.interviewType} · {settings.difficulty}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* TTS mute toggle + speaking indicator */}
              <button
                onClick={toggleTts}
                title={isTtsEnabled ? 'Mute voice' : 'Enable voice'}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors ${
                  isTtsEnabled
                    ? 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40 hover:bg-violet-100 dark:hover:bg-violet-900/40'
                    : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {isTtsEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
                {isSpeaking && isTtsEnabled && (
                  <span className="flex items-end gap-px h-3.5">
                    {[0, 150, 300].map(delay => (
                      <span
                        key={delay}
                        className="w-0.5 rounded-full bg-violet-500 dark:bg-violet-400 animate-bounce"
                        style={{ height: '60%', animationDelay: `${delay}ms`, animationDuration: '0.8s' }}
                      />
                    ))}
                  </span>
                )}
              </button>

              <button
                onClick={handleReset}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1 transition-colors"
              >
                <RotateCcw size={12} /> End
              </button>
            </div>
          </div>

          <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #7C3AED, #4F46E5)' }}
            />
          </div>
        </div>
      </div>

      {/* ── Chat messages ── */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="max-w-3xl mx-auto space-y-4">

          {displayMessages.map(msg => {
            if (msg.type === 'answer') {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[78%] px-4 py-3 rounded-2xl rounded-tr-sm bg-gradient-to-br from-violet-600 to-indigo-600 text-white text-sm shadow-md shadow-violet-500/20 leading-relaxed">
                    {msg.content}
                  </div>
                </div>
              );
            }

            if (msg.type === 'feedback') {
              return (
                <div key={msg.id} className="flex gap-3">
                  <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MessageSquare size={13} className="text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1 px-4 py-3 rounded-2xl rounded-tl-sm bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-900 dark:text-amber-100 leading-relaxed">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1.5">Feedback</p>
                    {msg.content}
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id} className="flex gap-3">
                <div className="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-950/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Mic size={13} className="text-violet-600 dark:text-violet-400" />
                </div>
                <div className="max-w-[78%] px-4 py-3 rounded-2xl rounded-tl-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white shadow-sm leading-relaxed">
                  {msg.content}
                </div>
              </div>
            );
          })}

          {/* Streaming indicator */}
          {isStreaming && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-950/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Mic size={13} className="text-violet-600 dark:text-violet-400" />
              </div>
              {streamingText ? (
                <div className="max-w-[78%] px-4 py-3 rounded-2xl rounded-tl-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white shadow-sm leading-relaxed">
                  {streamingText}
                  <span className="inline-block w-0.5 h-4 ml-0.5 bg-violet-500 animate-pulse align-text-bottom" />
                </div>
              ) : (
                <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2 shadow-sm">
                  <Loader2 size={12} className="animate-spin" />
                  {isGeneratingReport ? 'Generating your report…' : 'Thinking…'}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
              <AlertCircle size={14} className="flex-shrink-0" />
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Answer input ── */}
      <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="max-w-3xl mx-auto space-y-2">

          {/* Recording / transcribing status bar */}
          {(isRecording || isTranscribing) && (
            <div className={`flex items-center justify-between px-4 py-2 rounded-xl text-sm font-medium ${
              isRecording
                ? 'bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800'
                : 'bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800'
            }`}>
              <div className="flex items-center gap-2">
                {isRecording ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                    <span className="text-red-700 dark:text-red-400">Recording…</span>
                  </>
                ) : (
                  <>
                    <Loader2 size={13} className="animate-spin text-amber-500 flex-shrink-0" />
                    <span className="text-amber-700 dark:text-amber-400">Sending…</span>
                  </>
                )}
              </div>
              {isRecording && (
                <span className="font-mono text-sm text-red-600 dark:text-red-400 tabular-nums">
                  {formatDuration(recordingSeconds)}
                </span>
              )}
            </div>
          )}

          {/* Input row */}
          <div className="flex gap-2 items-end">
            <textarea
              value={currentAnswer}
              onChange={e => setCurrentAnswer(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSendAnswer(); }}
              placeholder={isStreaming ? 'Wait for the recruiter…' : 'Type your answer… (Ctrl+Enter to send)'}
              rows={3}
              disabled={isStreaming || isRecording || isTranscribing}
              className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
            />

            {/* Mic button + hint */}
            <div className="flex flex-col items-center gap-0.5 flex-shrink-0 select-none">
              <button
                onClick={handleMicClick}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                onContextMenu={e => e.preventDefault()}
                disabled={isStreaming || isTranscribing}
                className={`flex items-center justify-center w-11 h-11 rounded-xl border-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                  isRecording
                    ? 'bg-red-500 border-red-500 text-white shadow-lg shadow-red-500/40 scale-110'
                    : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-violet-400 hover:text-violet-600 dark:hover:text-violet-400 active:scale-95'
                }`}
              >
                <Mic size={16} className={isRecording ? 'animate-pulse' : ''} />
              </button>
              <span className="text-[9px] text-gray-400 dark:text-gray-500 whitespace-nowrap leading-none">
                {isTranscribing ? 'Transcribing…' : isRecording ? 'Click to stop' : '🎤 Click to record'}
              </span>
            </div>

            {/* Send button */}
            <button
              onClick={handleSendAnswer}
              disabled={!currentAnswer.trim() || isStreaming || isRecording || isTranscribing}
              className="flex items-center justify-center w-11 h-11 rounded-xl text-white shadow-md shadow-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>

      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        reason="limit_reached"
        upgradeTo={plan === 'pro' ? 'premium' : 'pro'}
        locale={locale}
      />
    </div>
  );
}
