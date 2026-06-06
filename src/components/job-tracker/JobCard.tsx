'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MapPin, DollarSign, Calendar, ExternalLink, Trash2, GripVertical, AlertCircle } from 'lucide-react';
import type { Job } from './types';

interface Props {
  job: Job;
  onDelete: (id: string) => void;
}

function diffDays(dateStr: string): number {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export default function JobCard({ job, onDelete }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: job.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const createdDate = new Date(job.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const appliedDiff   = job.sent_at        ? diffDays(job.sent_at)        : null;
  const interviewDiff = job.interview_date ? diffDays(job.interview_date) : null;
  const followUpDiff  = job.follow_up_date ? diffDays(job.follow_up_date) : null;

  const isFollowUpOverdue    = followUpDiff !== null && followUpDiff <= 0;
  const hasUpcomingInterview = interviewDiff !== null && interviewDiff >= 0;

  let appliedLabel = '';
  if (appliedDiff !== null) {
    if (appliedDiff === 0) appliedLabel = 'Applied today';
    else if (appliedDiff < 0) appliedLabel = `Applied ${Math.abs(appliedDiff)} day${Math.abs(appliedDiff) !== 1 ? 's' : ''} ago`;
  }

  let interviewLabel = '';
  if (hasUpcomingInterview && interviewDiff !== null) {
    interviewLabel = interviewDiff === 0
      ? 'Interview today'
      : `Interview in ${interviewDiff} day${interviewDiff !== 1 ? 's' : ''}`;
  }

  const showDateBadges = appliedLabel || hasUpcomingInterview || isFollowUpOverdue;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative bg-white dark:bg-gray-900 rounded-xl border
        shadow-sm hover:shadow-md transition-all duration-150 p-3.5
        ${isFollowUpOverdue
          ? 'border-red-300 dark:border-red-800 hover:border-red-400 dark:hover:border-red-700'
          : 'border-gray-200 dark:border-gray-700 hover:border-violet-200 dark:hover:border-violet-800'
        }
        ${isDragging ? 'shadow-xl z-50' : ''}`}
    >
      {isFollowUpOverdue && (
        <span className="absolute top-2 left-2 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
      )}

      <div className="absolute top-2.5 right-2.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onDelete(job.id)}
          className="p-1 rounded-lg text-gray-300 dark:text-gray-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
        >
          <Trash2 size={13} />
        </button>
        <div
          {...attributes}
          {...listeners}
          className="p-1 rounded-lg text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 cursor-grab active:cursor-grabbing"
        >
          <GripVertical size={13} />
        </div>
      </div>

      <div className="pr-14 mb-2">
        <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug truncate">{job.job_title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{job.company_name}</p>
      </div>

      <div className="space-y-1">
        {job.location && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
            <MapPin size={11} className="flex-shrink-0" />
            <span className="truncate">{job.location}</span>
          </div>
        )}
        {job.salary && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
            <DollarSign size={11} className="flex-shrink-0" />
            <span className="truncate">{job.salary}</span>
          </div>
        )}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5 text-xs text-gray-300 dark:text-gray-600">
            <Calendar size={11} />
            <span>{createdDate}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {hasUpcomingInterview && <Calendar size={12} className="text-violet-400" />}
            {job.job_url && (
              <a
                href={job.job_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="text-gray-300 dark:text-gray-600 hover:text-violet-500 transition-colors"
              >
                <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>
      </div>

      {showDateBadges && (
        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 space-y-1">
          {appliedLabel && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
              <span className="w-1 h-1 rounded-full bg-blue-400 flex-shrink-0" />
              {appliedLabel}
            </div>
          )}
          {hasUpcomingInterview && interviewLabel && (
            <div className="flex items-center gap-1.5 text-xs text-violet-500 dark:text-violet-400 font-medium">
              <Calendar size={10} className="flex-shrink-0" />
              {interviewLabel}
            </div>
          )}
          {isFollowUpOverdue && (
            <div className="flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400 font-medium">
              <AlertCircle size={10} className="flex-shrink-0" />
              Follow up overdue
            </div>
          )}
        </div>
      )}

      {job.notes && (
        <p className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-500 line-clamp-2 leading-relaxed">
          {job.notes}
        </p>
      )}
    </div>
  );
}
