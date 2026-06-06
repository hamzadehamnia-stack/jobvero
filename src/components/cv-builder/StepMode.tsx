'use client';

import { FileUp, Sparkles, PenLine, ChevronRight } from 'lucide-react';

export type CVMode = 'select' | 'upload' | 'describe' | 'manual';

interface Props {
  onSelect: (mode: Exclude<CVMode, 'select'>) => void;
}

const MODES: {
  id: Exclude<CVMode, 'select'>;
  icon: React.ElementType;
  title: string;
  desc: string;
  badge?: string;
  iconCls: string;
}[] = [
  {
    id: 'upload',
    icon: FileUp,
    title: 'Upload my existing CV',
    desc: 'Import your PDF or Word file — AI extracts everything automatically',
    iconCls: 'bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400',
  },
  {
    id: 'describe',
    icon: Sparkles,
    title: 'Describe my profile to AI',
    desc: 'Write a few sentences about yourself — Claude fills all fields for you',
    badge: 'New',
    iconCls: 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-600 dark:text-cyan-400',
  },
  {
    id: 'manual',
    icon: PenLine,
    title: 'Fill manually',
    desc: 'Guided step-by-step form — fill at your own pace',
    iconCls: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400',
  },
];

export default function StepMode({ onSelect }: Props) {
  return (
    <div className="flex flex-col justify-center py-4 h-full">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          How would you like to build your CV?
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Choose the method that works best for you
        </p>
      </div>

      <div className="space-y-3">
        {MODES.map(({ id, icon: Icon, title, desc, badge, iconCls }) => (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-gray-200 dark:border-gray-700
              hover:border-violet-400 dark:hover:border-violet-500 hover:bg-violet-50/50 dark:hover:bg-violet-950/20
              text-left transition-all duration-200 group"
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${iconCls} transition-transform duration-200 group-hover:scale-110`}>
              <Icon size={22} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{title}</p>
                {badge && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-400">
                    {badge}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{desc}</p>
            </div>

            <ChevronRight size={16} className="text-gray-300 dark:text-gray-600 group-hover:text-violet-500 transition-colors flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
