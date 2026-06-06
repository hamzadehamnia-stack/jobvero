'use client';

import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import type { SkillCategory } from './types';

interface Props {
  data: string[];
  onChange: (data: string[]) => void;
  targetCountry?: string;
  skillCategories: SkillCategory[];
  onCategoriesChange: (cats: SkillCategory[]) => void;
}

const SUGGESTIONS = [
  'JavaScript', 'TypeScript', 'React', 'Next.js', 'Node.js', 'Python',
  'SQL', 'Git', 'Docker', 'AWS', 'Figma', 'Project Management',
  'Communication', 'Leadership', 'Problem Solving', 'Agile / Scrum',
  'Excel', 'Data Analysis', 'Marketing', 'SEO', 'Content Writing',
];

// ─── Flat skill input (non-USA) ───────────────────────────────────────────────

function FlatSkills({ data, onChange }: { data: string[]; onChange: (d: string[]) => void }) {
  const [input, setInput] = useState('');

  const add = (skill: string) => {
    const t = skill.trim();
    if (t && !data.includes(t)) onChange([...data, t]);
    setInput('');
  };
  const remove = (skill: string) => onChange(data.filter((s) => s !== skill));

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) { e.preventDefault(); add(input); }
    if (e.key === 'Backspace' && !input && data.length) remove(data[data.length - 1]);
  };

  const suggestions = SUGGESTIONS.filter(
    (s) => !data.includes(s) && s.toLowerCase().includes(input.toLowerCase()),
  ).slice(0, 8);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Your Skills
          <span className="ml-2 text-xs font-normal text-gray-400">Press Enter or comma to add</span>
        </label>
        <div
          className="min-h-[56px] flex flex-wrap gap-2 px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700
            bg-white dark:bg-gray-800 focus-within:ring-2 focus-within:ring-violet-500 focus-within:border-transparent transition-colors"
          onClick={() => document.getElementById('skill-input')?.focus()}
        >
          {data.map((skill) => (
            <span key={skill} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg
              bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300
              text-sm font-medium border border-violet-200 dark:border-violet-700">
              {skill}
              <button type="button" onClick={(e) => { e.stopPropagation(); remove(skill); }}
                className="hover:text-violet-900 dark:hover:text-violet-100 transition-colors">
                <X size={12} />
              </button>
            </span>
          ))}
          <input
            id="skill-input" type="text" value={input}
            onChange={(e) => setInput(e.target.value)} onKeyDown={handleKey}
            placeholder={data.length === 0 ? 'Type a skill and press Enter...' : ''}
            className="flex-1 min-w-[120px] bg-transparent text-sm text-gray-900 dark:text-white
              placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Suggestions — click to add</p>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button key={s} type="button" onClick={() => add(s)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm
                border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400
                hover:border-violet-400 hover:text-violet-600 dark:hover:text-violet-400
                hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-all duration-150">
              <Plus size={11} /> {s}
            </button>
          ))}
        </div>
      </div>

      {data.length > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {data.length} skill{data.length !== 1 ? 's' : ''} added
        </p>
      )}
    </div>
  );
}

// ─── Per-category tag input ───────────────────────────────────────────────────

function CategoryInput({
  category,
  onUpdate,
  onRemove,
}: {
  category: SkillCategory;
  onUpdate: (cat: SkillCategory) => void;
  onRemove: () => void;
}) {
  const [input, setInput] = useState('');
  const inputId = `cat-${category.id}`;

  const addItem = (skill: string) => {
    const t = skill.trim();
    if (t && !category.items.includes(t))
      onUpdate({ ...category, items: [...category.items, t] });
    setInput('');
  };
  const removeItem = (skill: string) =>
    onUpdate({ ...category, items: category.items.filter((s) => s !== skill) });

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) { e.preventDefault(); addItem(input); }
    if (e.key === 'Backspace' && !input && category.items.length)
      removeItem(category.items[category.items.length - 1]);
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/60">
        <input
          value={category.name}
          onChange={(e) => onUpdate({ ...category, name: e.target.value })}
          className="flex-1 bg-transparent text-xs font-semibold text-gray-700 dark:text-gray-300
            focus:outline-none placeholder:text-gray-400"
          placeholder="Category name"
        />
        <button type="button" onClick={onRemove}
          className="ml-2 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50
            dark:hover:bg-red-950/30 rounded-lg transition-colors flex-shrink-0">
          <Trash2 size={13} />
        </button>
      </div>

      <div
        className="min-h-[44px] flex flex-wrap gap-1.5 px-3 py-2 bg-white dark:bg-gray-800
          focus-within:ring-2 focus-within:ring-inset focus-within:ring-violet-500 transition-all cursor-text"
        onClick={() => document.getElementById(inputId)?.focus()}
      >
        {category.items.map((skill) => (
          <span key={skill} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md
            bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300
            text-xs font-medium border border-violet-200 dark:border-violet-700">
            {skill}
            <button type="button" onClick={(e) => { e.stopPropagation(); removeItem(skill); }}
              className="hover:text-violet-900 dark:hover:text-violet-100">
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          id={inputId} type="text" value={input}
          onChange={(e) => setInput(e.target.value)} onKeyDown={handleKey}
          placeholder={category.items.length === 0 ? 'Add skills, press Enter…' : ''}
          className="flex-1 min-w-[100px] bg-transparent text-xs text-gray-900 dark:text-white
            placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none py-0.5"
        />
      </div>
    </div>
  );
}

// ─── Categorized skills (USA) ─────────────────────────────────────────────────

function CategorizedSkills({
  skillCategories,
  onCategoriesChange,
}: {
  skillCategories: SkillCategory[];
  onCategoriesChange: (cats: SkillCategory[]) => void;
}) {
  const updateCat = (updated: SkillCategory) =>
    onCategoriesChange(skillCategories.map((c) => (c.id === updated.id ? updated : c)));

  const removeCat = (id: string) =>
    onCategoriesChange(skillCategories.filter((c) => c.id !== id));

  const addCat = () =>
    onCategoriesChange([
      ...skillCategories,
      { id: crypto.randomUUID(), name: 'Other', items: [] },
    ]);

  const total = skillCategories.reduce((n, c) => n + c.items.length, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between mb-1">
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Skills by Category</p>
          <p className="text-xs text-gray-400 mt-0.5">ATS-optimized for US Resume — group by type</p>
        </div>
        <span className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full
          bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400">
          US Resume
        </span>
      </div>

      {skillCategories.map((cat) => (
        <CategoryInput
          key={cat.id}
          category={cat}
          onUpdate={updateCat}
          onRemove={() => removeCat(cat.id)}
        />
      ))}

      <button
        type="button"
        onClick={addCat}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
          border-2 border-dashed border-gray-200 dark:border-gray-700
          text-sm text-gray-500 dark:text-gray-400
          hover:border-violet-400 hover:text-violet-600 dark:hover:text-violet-400
          transition-colors duration-150"
      >
        <Plus size={14} /> Add Category
      </button>

      {total > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {total} skill{total !== 1 ? 's' : ''} across{' '}
          {skillCategories.filter((c) => c.items.length > 0).length} categories
        </p>
      )}
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function StepSkills({
  data,
  onChange,
  targetCountry,
  skillCategories,
  onCategoriesChange,
}: Props) {
  if (targetCountry === 'USA') {
    return (
      <CategorizedSkills
        skillCategories={skillCategories}
        onCategoriesChange={onCategoriesChange}
      />
    );
  }
  return <FlatSkills data={data} onChange={onChange} />;
}
