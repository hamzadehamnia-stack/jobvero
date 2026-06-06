export type ColumnId = 'saved' | 'applied' | 'interview' | 'offer' | 'rejected';

// Mirrors the `applications` table schema
export interface Job {
  id:               string;
  user_id?:         string;
  job_title:        string;
  company_name:     string;
  location:         string | null;
  salary:           string | null;
  status:           ColumnId;
  notes:            string | null;
  job_url:          string | null;
  contract_type:    string | null;
  job_source:       string | null;
  job_id:           string | null;
  created_at:       string;
  sent_at:          string | null;
  interview_date:   string | null;
  follow_up_date:   string | null;
  cover_letter:     string | null;
  company_email:    string | null;
  thread_id:        string | null;
  send_status:      string | null;
  application_type: string;
  priority?:        'high' | 'medium' | 'low' | null;
}

export const COLUMNS: {
  id:         ColumnId;
  label:      string;
  headerBg:   string;
  headerText: string;
  badge:      string;
  dot:        string;
  overBg:     string;
  color:      string;
  bg:         string;
}[] = [
  {
    id:         'saved',
    label:      'Saved',
    headerBg:   'bg-slate-100 dark:bg-slate-800/70',
    headerText: 'text-slate-600 dark:text-slate-300',
    badge:      'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
    dot:        'bg-slate-400 dark:bg-slate-500',
    overBg:     'bg-slate-50/60 dark:bg-slate-900/30',
    color:      'text-gray-600 dark:text-gray-300',
    bg:         'bg-gray-100 dark:bg-gray-800/60',
  },
  {
    id:         'applied',
    label:      'Applied',
    headerBg:   'bg-blue-50 dark:bg-blue-900/30',
    headerText: 'text-blue-700 dark:text-blue-300',
    badge:      'bg-blue-100 dark:bg-blue-800/50 text-blue-700 dark:text-blue-300',
    dot:        'bg-blue-500',
    overBg:     'bg-blue-50/60 dark:bg-blue-950/20',
    color:      'text-blue-600 dark:text-blue-300',
    bg:         'bg-blue-50 dark:bg-blue-950/40',
  },
  {
    id:         'interview',
    label:      'Interview',
    headerBg:   'bg-amber-50 dark:bg-amber-900/30',
    headerText: 'text-amber-700 dark:text-amber-300',
    badge:      'bg-amber-100 dark:bg-amber-800/50 text-amber-700 dark:text-amber-300',
    dot:        'bg-amber-500',
    overBg:     'bg-amber-50/60 dark:bg-amber-950/20',
    color:      'text-amber-600 dark:text-amber-300',
    bg:         'bg-amber-50 dark:bg-amber-950/40',
  },
  {
    id:         'offer',
    label:      'Offer',
    headerBg:   'bg-emerald-50 dark:bg-emerald-900/30',
    headerText: 'text-emerald-700 dark:text-emerald-300',
    badge:      'bg-emerald-100 dark:bg-emerald-800/50 text-emerald-700 dark:text-emerald-300',
    dot:        'bg-emerald-500',
    overBg:     'bg-emerald-50/60 dark:bg-emerald-950/20',
    color:      'text-emerald-600 dark:text-emerald-300',
    bg:         'bg-emerald-50 dark:bg-emerald-950/40',
  },
  {
    id:         'rejected',
    label:      'Rejected',
    headerBg:   'bg-red-50 dark:bg-red-900/30',
    headerText: 'text-red-600 dark:text-red-400',
    badge:      'bg-red-100 dark:bg-red-800/50 text-red-600 dark:text-red-400',
    dot:        'bg-red-500',
    overBg:     'bg-red-50/60 dark:bg-red-950/20',
    color:      'text-red-500 dark:text-red-400',
    bg:         'bg-red-50 dark:bg-red-950/30',
  },
];
