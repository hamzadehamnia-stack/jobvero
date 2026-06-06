'use client';

import { usePathname } from 'next/navigation';

// ─── Locale data ──────────────────────────────────────────────────────────────

const MONTHS: Record<string, string[]> = {
  en: ['January','February','March','April','May','June','July','August','September','October','November','December'],
  fr: ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'],
  es: ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
  pt: ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'],
};

const LABELS: Record<string, { month: string; day: string; year: string; present: string; clear: string; today: string }> = {
  en: { month: 'Month', day: 'Day', year: 'Year', present: 'Present', clear: 'Clear', today: 'Today' },
  fr: { month: 'Mois', day: 'Jour', year: 'Année', present: 'Présent', clear: 'Effacer', today: "Aujourd'hui" },
  es: { month: 'Mes', day: 'Día', year: 'Año', present: 'Presente', clear: 'Borrar', today: 'Hoy' },
  pt: { month: 'Mês', day: 'Dia', year: 'Ano', present: 'Presente', clear: 'Limpar', today: 'Hoje' },
};

export const DATE_ORDER_ERRORS: Record<string, string> = {
  en: 'Start date must be before end date',
  fr: 'La date de début doit être antérieure à la date de fin',
  es: 'La fecha de inicio debe ser anterior a la fecha de fin',
  pt: 'A data de início deve ser anterior à data de fim',
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  /**
   * Controlled value.
   * - Without showDay: "YYYY-MM" format
   * - With showDay:    "YYYY-MM-DD" format
   * Pass "" for empty.
   */
  value: string;
  onChange: (value: string) => void;
  /** Text shown above the selects */
  label?: string;
  /** Include a day selector. Value format becomes "YYYY-MM-DD". */
  showDay?: boolean;
  /** Show a "currently here" checkbox next to the label */
  allowCurrent?: boolean;
  isCurrent?: boolean;
  onCurrentChange?: (checked: boolean) => void;
  /** Label text for the checkbox — defaults to locale "Present" */
  currentLabel?: string;
  /** Earliest selectable year (default: 1970) */
  minYear?: number;
  /** Latest selectable year (default: 2035) */
  maxYear?: number;
  /** Override locale; auto-detected from URL if omitted */
  locale?: string;
  disabled?: boolean;
  /** Inline error shown below the selects */
  error?: string;
  /** Show Clear and Today action buttons below the selects */
  showActions?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildYears(min: number, max: number): number[] {
  const arr: number[] = [];
  for (let y = max; y >= min; y--) arr.push(y);
  return arr;
}

function parseValue(v: string): { day: number; month: number; year: number } {
  if (!v) return { day: 0, month: 0, year: 0 };
  const parts = v.split('-');
  return {
    year:  parseInt(parts[0] ?? '0', 10),
    month: parseInt(parts[1] ?? '0', 10),
    day:   parseInt(parts[2] ?? '0', 10),
  };
}

function daysInMonth(year: number, month: number): number {
  if (!year || !month) return 31;
  // new Date(y, m, 0) = last day of month m (1-indexed)
  return new Date(year, month, 0).getDate();
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DatePicker({
  value,
  onChange,
  label,
  showDay = false,
  allowCurrent = false,
  isCurrent = false,
  onCurrentChange,
  currentLabel,
  minYear = 1970,
  maxYear = 2035,
  locale: localeProp,
  disabled = false,
  error,
  showActions = false,
}: Props) {
  const pathname = usePathname();

  const rawLocale = localeProp ?? (pathname?.split('/')[1] ?? 'en');
  const locale = ['en', 'fr', 'es', 'pt'].includes(rawLocale) ? rawLocale : 'en';

  const months = MONTHS[locale];
  const l      = LABELS[locale];
  const years  = buildYears(minYear, maxYear);

  const { month, day, year } = parseValue(value);
  const maxDay = daysInMonth(year, month);
  const isDisabled = disabled || isCurrent;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const today = new Date();

  const handleMonth = (m: string) => {
    if (!m) { onChange(''); return; }
    const y = year || today.getFullYear();
    if (showDay) {
      // clamp existing day to new month's max; default to 1 if no day set
      const d = day > 0 ? Math.min(day, daysInMonth(y, parseInt(m, 10))) : 1;
      onChange(`${y}-${m.padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    } else {
      onChange(`${y}-${m.padStart(2, '0')}`);
    }
  };

  const handleDay = (d: string) => {
    if (!d) { onChange(''); return; }
    const y = year || today.getFullYear();
    const m = month || (today.getMonth() + 1);
    onChange(`${y}-${String(m).padStart(2, '0')}-${d.padStart(2, '0')}`);
  };

  const handleYear = (y: string) => {
    if (!y) { onChange(''); return; }
    const m = month || (today.getMonth() + 1);
    if (showDay) {
      const d = day > 0 ? Math.min(day, daysInMonth(parseInt(y, 10), m)) : 1;
      onChange(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    } else {
      onChange(`${y}-${String(m).padStart(2, '0')}`);
    }
  };

  // ── Styles ────────────────────────────────────────────────────────────────

  const selectCls = [
    'rounded-xl border text-sm transition-colors px-3 py-2.5',
    'focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent',
    'bg-white dark:bg-gray-800 text-gray-900 dark:text-white',
    error
      ? 'border-red-400 dark:border-red-600'
      : 'border-gray-200 dark:border-gray-700',
    isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
  ].join(' ');

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-1.5">

      {/* Label + optional "currently" checkbox */}
      {(label || allowCurrent) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {label && (
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
              {label}
            </span>
          )}
          {allowCurrent && (
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isCurrent}
                onChange={(e) => onCurrentChange?.(e.target.checked)}
                className="rounded accent-violet-600 w-3.5 h-3.5"
              />
              <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                {currentLabel ?? l.present}
              </span>
            </label>
          )}
        </div>
      )}

      {/* Selects or "Present" display */}
      {isCurrent ? (
        <div className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-gray-400 dark:text-gray-500 text-sm italic select-none">
          {l.present}
        </div>
      ) : (
        <div className="flex gap-2">
          {/* Month */}
          <select
            value={month ? String(month).padStart(2, '0') : ''}
            onChange={(e) => handleMonth(e.target.value)}
            disabled={isDisabled}
            aria-label={label ? `${label} – ${l.month}` : l.month}
            className={`flex-1 ${selectCls}`}
          >
            <option value="">{l.month}</option>
            {months.map((name, i) => (
              <option key={i + 1} value={String(i + 1).padStart(2, '0')}>
                {name}
              </option>
            ))}
          </select>

          {/* Day (only when showDay=true) */}
          {showDay && (
            <select
              value={day ? String(day).padStart(2, '0') : ''}
              onChange={(e) => handleDay(e.target.value)}
              disabled={isDisabled}
              aria-label={label ? `${label} – ${l.day}` : l.day}
              className={`w-20 ${selectCls}`}
            >
              <option value="">{l.day}</option>
              {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
                <option key={d} value={String(d).padStart(2, '0')}>
                  {d}
                </option>
              ))}
            </select>
          )}

          {/* Year */}
          <select
            value={year ? String(year) : ''}
            onChange={(e) => handleYear(e.target.value)}
            disabled={isDisabled}
            aria-label={label ? `${label} – ${l.year}` : l.year}
            className={`w-28 ${selectCls}`}
          >
            <option value="">{l.year}</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
        </div>
      )}

      {/* Clear / Today actions */}
      {showActions && !isCurrent && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onChange('')}
            disabled={disabled || !value}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {l.clear}
          </button>
          <span className="text-gray-300 dark:text-gray-600 select-none">·</span>
          <button
            type="button"
            onClick={() => {
              const t = new Date();
              if (showDay) {
                onChange(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`);
              } else {
                onChange(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`);
              }
            }}
            disabled={disabled}
            className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-500 dark:hover:text-violet-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {l.today}
          </button>
        </div>
      )}

      {/* Validation error */}
      {error && (
        <p className="text-xs text-red-500 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
