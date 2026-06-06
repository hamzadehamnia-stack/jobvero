export interface PersonalInfo {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  portfolio: string;
}

export interface WorkExperience {
  id: string;
  company: string;
  position: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
}

export interface Education {
  id: string;
  school: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  current?: boolean;
  gpa?: string;
}

export interface SkillCategory {
  id: string;
  name: string;
  items: string[];
}

export type ColorPalette = 'classic-black' | 'blue-pro' | 'green-modern' | 'violet-creative' | 'red-bold' | 'gray-elegant';
export type CVLayout = '1-column' | '2-column' | 'sidebar-left';
export type FontStyle = 'serif' | 'sans-serif' | 'monospace';
export type Spacing = 'compact' | 'standard' | 'airy';

export interface Preferences {
  language: 'en' | 'fr' | 'es' | 'pt';
  targetCountry: string;
  domain: string;
  style: 'Professional' | 'Modern' | 'Creative';
  colorPalette: ColorPalette;
  customColor?: string;
  layout: CVLayout;
  fontStyle: FontStyle;
  spacing: Spacing;
  template?: string;
}

export interface CVFormData {
  personalInfo: PersonalInfo;
  workExperience: WorkExperience[];
  education: Education[];
  skills: string[];
  skillCategories: SkillCategory[];
  preferences: Preferences;
}

export const DEFAULT_SKILL_CATEGORIES: SkillCategory[] = [
  { id: 'languages',  name: 'Programming Languages', items: [] },
  { id: 'frameworks', name: 'Frameworks & Libraries', items: [] },
  { id: 'tools',      name: 'Tools & Platforms',      items: [] },
  { id: 'databases',  name: 'Databases',              items: [] },
];

export const PALETTE_COLORS: Record<ColorPalette, { primary: string; accent: string; name: string }> = {
  'classic-black':   { primary: '#111827', accent: '#374151', name: 'Classique noir' },
  'blue-pro':        { primary: '#1e3a5f', accent: '#2563eb', name: 'Bleu professionnel' },
  'green-modern':    { primary: '#064e3b', accent: '#059669', name: 'Vert moderne' },
  'violet-creative': { primary: '#4c1d95', accent: '#7c3aed', name: 'Violet créatif' },
  'red-bold':        { primary: '#7f1d1d', accent: '#ef4444', name: 'Rouge audacieux' },
  'gray-elegant':    { primary: '#374151', accent: '#9ca3af', name: 'Gris élégant' },
};

export const defaultFormData: CVFormData = {
  personalInfo: {
    fullName: '',
    email: '',
    phone: '',
    location: '',
    linkedin: '',
    portfolio: '',
  },
  workExperience: [],
  education: [],
  skills: [],
  skillCategories: DEFAULT_SKILL_CATEGORIES.map((c) => ({ ...c, items: [] })),
  preferences: {
    language: 'en',
    targetCountry: 'USA',
    domain: '',
    style: 'Professional',
    colorPalette: 'blue-pro',
    layout: '1-column',
    fontStyle: 'sans-serif',
    spacing: 'standard',
  },
};
