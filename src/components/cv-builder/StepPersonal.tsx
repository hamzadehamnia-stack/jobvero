'use client';

import type { PersonalInfo } from './types';

function Field({
  label, value, onChange, type = 'text', placeholder, required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700
          bg-white dark:bg-gray-800 text-gray-900 dark:text-white
          placeholder:text-gray-400 dark:placeholder:text-gray-500
          focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent
          transition-colors text-sm"
      />
    </div>
  );
}

interface Props {
  data: PersonalInfo;
  onChange: (data: PersonalInfo) => void;
}

export default function StepPersonal({ data, onChange }: Props) {
  const set = (key: keyof PersonalInfo) => (v: string) => onChange({ ...data, [key]: v });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Full Name"  value={data.fullName} onChange={set('fullName')} placeholder="Jane Doe"            required />
        <Field label="Email"      type="email" value={data.email} onChange={set('email')} placeholder="jane@example.com" required />
        <Field label="Phone"      value={data.phone}    onChange={set('phone')}    placeholder="+1 555 000 0000" />
        <Field label="Location"   value={data.location} onChange={set('location')} placeholder="New York, USA" />
      </div>
      <Field label="LinkedIn URL"        value={data.linkedin}  onChange={set('linkedin')}  placeholder="https://linkedin.com/in/janedoe" />
      <Field label="Portfolio / Website" value={data.portfolio} onChange={set('portfolio')} placeholder="https://janedoe.dev" />
    </div>
  );
}
