'use client';

import type { SearchFilters } from './types';

interface Props {
  filters:        SearchFilters;
  onChange:       (f: SearchFilters) => void;
  remoteOnly?:    boolean;
  onRemoteToggle?: () => void;
  mobile?:        boolean;
}

const DATE_OPTIONS = [
  { value: '' as const,   label: 'Any time' },
  { value: '1' as const,  label: 'Last 24 hours' },
  { value: '3' as const,  label: 'Last 3 days' },
  { value: '7' as const,  label: 'Last week' },
  { value: '30' as const, label: 'Last month' },
];

const TYPE_OPTIONS = [
  { value: '' as const,          label: 'All types' },
  { value: 'fulltime' as const,  label: 'Full-time' },
  { value: 'parttime' as const,  label: 'Part-time' },
  { value: 'contract' as const,  label: 'Contract' },
  { value: 'remote' as const,    label: 'Remote' },
];

const EXP_OPTIONS = [
  { value: '' as const,       label: 'Any level' },
  { value: 'entry' as const,  label: 'Entry level' },
  { value: 'mid' as const,    label: 'Mid level' },
  { value: 'senior' as const, label: 'Senior level' },
];

function FilterGroup<V extends string>({
  label, options, value, onChange,
}: {
  label: string;
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  return (
    <div className="mb-5">
      <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">{label}</p>
      <div className="space-y-1">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors
              ${value === opt.value
                ? 'bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/60'
              }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function JobFilters({ filters, onChange, remoteOnly, onRemoteToggle, mobile }: Props) {
  return (
    <div className={mobile ? 'w-full' : 'w-44 flex-shrink-0 hidden lg:block'}>
      <div className={mobile ? undefined : 'sticky top-4'}>
        <p className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Filters</p>

        <FilterGroup
          label="Date posted"
          options={DATE_OPTIONS}
          value={filters.datePosted}
          onChange={v => onChange({ ...filters, datePosted: v })}
        />

        <FilterGroup
          label="Job type"
          options={TYPE_OPTIONS}
          value={filters.jobType}
          onChange={v => onChange({ ...filters, jobType: v })}
        />

        <FilterGroup
          label="Experience"
          options={EXP_OPTIONS}
          value={filters.experience}
          onChange={v => onChange({ ...filters, experience: v })}
        />

        {/* Remote only toggle */}
        {remoteOnly !== undefined && onRemoteToggle && (
          <div className="mb-5">
            <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Remote</p>
            <button
              type="button"
              role="switch"
              aria-checked={remoteOnly}
              onClick={onRemoteToggle}
              className="flex items-center gap-2.5 w-full group"
            >
              <span
                className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200
                  ${remoteOnly
                    ? 'bg-violet-600 dark:bg-violet-500'
                    : 'bg-gray-200 dark:bg-gray-700'
                  }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 self-center
                    ${remoteOnly ? 'translate-x-[18px]' : 'translate-x-[3px]'}`}
                />
              </span>
              <span
                className={`text-xs font-medium transition-colors
                  ${remoteOnly
                    ? 'text-violet-700 dark:text-violet-300'
                    : 'text-gray-600 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-200'
                  }`}
              >
                Remote only
              </span>
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => onChange({ datePosted: '', jobType: '', experience: '' })}
          className="text-xs text-violet-600 dark:text-violet-400 font-medium hover:underline"
        >
          Clear all filters
        </button>
      </div>
    </div>
  );
}
