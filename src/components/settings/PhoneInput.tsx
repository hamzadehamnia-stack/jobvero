'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown } from 'lucide-react';

// ─── Country data ─────────────────────────────────────────────────────────────

export interface DialCountry {
  code:     string; // ISO-2
  flag:     string;
  name:     string;
  dialCode: string;
}

// Priority countries shown first, then the rest alphabetically
const PRIORITY_CODES = [
  'FR','US','GB','CA','DE','BE','CH','NL','ES','PT','AU','NZ','IE','BR','MX','PE',
];

const ALL_COUNTRIES: DialCountry[] = [
  { code: 'AF', flag: '🇦🇫', name: 'Afghanistan',              dialCode: '+93'   },
  { code: 'AL', flag: '🇦🇱', name: 'Albania',                  dialCode: '+355'  },
  { code: 'DZ', flag: '🇩🇿', name: 'Algeria',                  dialCode: '+213'  },
  { code: 'AD', flag: '🇦🇩', name: 'Andorra',                  dialCode: '+376'  },
  { code: 'AO', flag: '🇦🇴', name: 'Angola',                   dialCode: '+244'  },
  { code: 'AG', flag: '🇦🇬', name: 'Antigua & Barbuda',        dialCode: '+1268' },
  { code: 'AR', flag: '🇦🇷', name: 'Argentina',                dialCode: '+54'   },
  { code: 'AM', flag: '🇦🇲', name: 'Armenia',                  dialCode: '+374'  },
  { code: 'AU', flag: '🇦🇺', name: 'Australia',                dialCode: '+61'   },
  { code: 'AT', flag: '🇦🇹', name: 'Austria',                  dialCode: '+43'   },
  { code: 'AZ', flag: '🇦🇿', name: 'Azerbaijan',               dialCode: '+994'  },
  { code: 'BS', flag: '🇧🇸', name: 'Bahamas',                  dialCode: '+1242' },
  { code: 'BH', flag: '🇧🇭', name: 'Bahrain',                  dialCode: '+973'  },
  { code: 'BD', flag: '🇧🇩', name: 'Bangladesh',               dialCode: '+880'  },
  { code: 'BB', flag: '🇧🇧', name: 'Barbados',                 dialCode: '+1246' },
  { code: 'BY', flag: '🇧🇾', name: 'Belarus',                  dialCode: '+375'  },
  { code: 'BE', flag: '🇧🇪', name: 'Belgium',                  dialCode: '+32'   },
  { code: 'BZ', flag: '🇧🇿', name: 'Belize',                   dialCode: '+501'  },
  { code: 'BJ', flag: '🇧🇯', name: 'Benin',                    dialCode: '+229'  },
  { code: 'BT', flag: '🇧🇹', name: 'Bhutan',                   dialCode: '+975'  },
  { code: 'BO', flag: '🇧🇴', name: 'Bolivia',                  dialCode: '+591'  },
  { code: 'BA', flag: '🇧🇦', name: 'Bosnia & Herzegovina',     dialCode: '+387'  },
  { code: 'BW', flag: '🇧🇼', name: 'Botswana',                 dialCode: '+267'  },
  { code: 'BR', flag: '🇧🇷', name: 'Brazil',                   dialCode: '+55'   },
  { code: 'BN', flag: '🇧🇳', name: 'Brunei',                   dialCode: '+673'  },
  { code: 'BG', flag: '🇧🇬', name: 'Bulgaria',                 dialCode: '+359'  },
  { code: 'BF', flag: '🇧🇫', name: 'Burkina Faso',             dialCode: '+226'  },
  { code: 'BI', flag: '🇧🇮', name: 'Burundi',                  dialCode: '+257'  },
  { code: 'CV', flag: '🇨🇻', name: 'Cabo Verde',               dialCode: '+238'  },
  { code: 'KH', flag: '🇰🇭', name: 'Cambodia',                 dialCode: '+855'  },
  { code: 'CM', flag: '🇨🇲', name: 'Cameroon',                 dialCode: '+237'  },
  { code: 'CA', flag: '🇨🇦', name: 'Canada',                   dialCode: '+1'    },
  { code: 'CF', flag: '🇨🇫', name: 'Central African Republic', dialCode: '+236'  },
  { code: 'TD', flag: '🇹🇩', name: 'Chad',                     dialCode: '+235'  },
  { code: 'CL', flag: '🇨🇱', name: 'Chile',                    dialCode: '+56'   },
  { code: 'CN', flag: '🇨🇳', name: 'China',                    dialCode: '+86'   },
  { code: 'CO', flag: '🇨🇴', name: 'Colombia',                 dialCode: '+57'   },
  { code: 'KM', flag: '🇰🇲', name: 'Comoros',                  dialCode: '+269'  },
  { code: 'CG', flag: '🇨🇬', name: 'Congo',                    dialCode: '+242'  },
  { code: 'CR', flag: '🇨🇷', name: 'Costa Rica',               dialCode: '+506'  },
  { code: 'HR', flag: '🇭🇷', name: 'Croatia',                  dialCode: '+385'  },
  { code: 'CU', flag: '🇨🇺', name: 'Cuba',                     dialCode: '+53'   },
  { code: 'CY', flag: '🇨🇾', name: 'Cyprus',                   dialCode: '+357'  },
  { code: 'CZ', flag: '🇨🇿', name: 'Czech Republic',           dialCode: '+420'  },
  { code: 'DK', flag: '🇩🇰', name: 'Denmark',                  dialCode: '+45'   },
  { code: 'DJ', flag: '🇩🇯', name: 'Djibouti',                 dialCode: '+253'  },
  { code: 'DO', flag: '🇩🇴', name: 'Dominican Republic',       dialCode: '+1809' },
  { code: 'EC', flag: '🇪🇨', name: 'Ecuador',                  dialCode: '+593'  },
  { code: 'EG', flag: '🇪🇬', name: 'Egypt',                    dialCode: '+20'   },
  { code: 'SV', flag: '🇸🇻', name: 'El Salvador',              dialCode: '+503'  },
  { code: 'GQ', flag: '🇬🇶', name: 'Equatorial Guinea',        dialCode: '+240'  },
  { code: 'ER', flag: '🇪🇷', name: 'Eritrea',                  dialCode: '+291'  },
  { code: 'EE', flag: '🇪🇪', name: 'Estonia',                  dialCode: '+372'  },
  { code: 'SZ', flag: '🇸🇿', name: 'Eswatini',                 dialCode: '+268'  },
  { code: 'ET', flag: '🇪🇹', name: 'Ethiopia',                 dialCode: '+251'  },
  { code: 'FJ', flag: '🇫🇯', name: 'Fiji',                     dialCode: '+679'  },
  { code: 'FI', flag: '🇫🇮', name: 'Finland',                  dialCode: '+358'  },
  { code: 'FR', flag: '🇫🇷', name: 'France',                   dialCode: '+33'   },
  { code: 'GA', flag: '🇬🇦', name: 'Gabon',                    dialCode: '+241'  },
  { code: 'GM', flag: '🇬🇲', name: 'Gambia',                   dialCode: '+220'  },
  { code: 'GE', flag: '🇬🇪', name: 'Georgia',                  dialCode: '+995'  },
  { code: 'DE', flag: '🇩🇪', name: 'Germany',                  dialCode: '+49'   },
  { code: 'GH', flag: '🇬🇭', name: 'Ghana',                    dialCode: '+233'  },
  { code: 'GR', flag: '🇬🇷', name: 'Greece',                   dialCode: '+30'   },
  { code: 'GD', flag: '🇬🇩', name: 'Grenada',                  dialCode: '+1473' },
  { code: 'GT', flag: '🇬🇹', name: 'Guatemala',                dialCode: '+502'  },
  { code: 'GN', flag: '🇬🇳', name: 'Guinea',                   dialCode: '+224'  },
  { code: 'GW', flag: '🇬🇼', name: 'Guinea-Bissau',            dialCode: '+245'  },
  { code: 'GY', flag: '🇬🇾', name: 'Guyana',                   dialCode: '+592'  },
  { code: 'HT', flag: '🇭🇹', name: 'Haiti',                    dialCode: '+509'  },
  { code: 'HN', flag: '🇭🇳', name: 'Honduras',                 dialCode: '+504'  },
  { code: 'HU', flag: '🇭🇺', name: 'Hungary',                  dialCode: '+36'   },
  { code: 'IS', flag: '🇮🇸', name: 'Iceland',                  dialCode: '+354'  },
  { code: 'IN', flag: '🇮🇳', name: 'India',                    dialCode: '+91'   },
  { code: 'ID', flag: '🇮🇩', name: 'Indonesia',                dialCode: '+62'   },
  { code: 'IR', flag: '🇮🇷', name: 'Iran',                     dialCode: '+98'   },
  { code: 'IQ', flag: '🇮🇶', name: 'Iraq',                     dialCode: '+964'  },
  { code: 'IE', flag: '🇮🇪', name: 'Ireland',                  dialCode: '+353'  },
  { code: 'IT', flag: '🇮🇹', name: 'Italy',                    dialCode: '+39'   },
  { code: 'JM', flag: '🇯🇲', name: 'Jamaica',                  dialCode: '+1876' },
  { code: 'JP', flag: '🇯🇵', name: 'Japan',                    dialCode: '+81'   },
  { code: 'JO', flag: '🇯🇴', name: 'Jordan',                   dialCode: '+962'  },
  { code: 'KZ', flag: '🇰🇿', name: 'Kazakhstan',               dialCode: '+7'    },
  { code: 'KE', flag: '🇰🇪', name: 'Kenya',                    dialCode: '+254'  },
  { code: 'KI', flag: '🇰🇮', name: 'Kiribati',                 dialCode: '+686'  },
  { code: 'KW', flag: '🇰🇼', name: 'Kuwait',                   dialCode: '+965'  },
  { code: 'KG', flag: '🇰🇬', name: 'Kyrgyzstan',               dialCode: '+996'  },
  { code: 'LA', flag: '🇱🇦', name: 'Laos',                     dialCode: '+856'  },
  { code: 'LV', flag: '🇱🇻', name: 'Latvia',                   dialCode: '+371'  },
  { code: 'LB', flag: '🇱🇧', name: 'Lebanon',                  dialCode: '+961'  },
  { code: 'LS', flag: '🇱🇸', name: 'Lesotho',                  dialCode: '+266'  },
  { code: 'LR', flag: '🇱🇷', name: 'Liberia',                  dialCode: '+231'  },
  { code: 'LY', flag: '🇱🇾', name: 'Libya',                    dialCode: '+218'  },
  { code: 'LI', flag: '🇱🇮', name: 'Liechtenstein',            dialCode: '+423'  },
  { code: 'LT', flag: '🇱🇹', name: 'Lithuania',                dialCode: '+370'  },
  { code: 'LU', flag: '🇱🇺', name: 'Luxembourg',               dialCode: '+352'  },
  { code: 'MG', flag: '🇲🇬', name: 'Madagascar',               dialCode: '+261'  },
  { code: 'MW', flag: '🇲🇼', name: 'Malawi',                   dialCode: '+265'  },
  { code: 'MY', flag: '🇲🇾', name: 'Malaysia',                 dialCode: '+60'   },
  { code: 'MV', flag: '🇲🇻', name: 'Maldives',                 dialCode: '+960'  },
  { code: 'ML', flag: '🇲🇱', name: 'Mali',                     dialCode: '+223'  },
  { code: 'MT', flag: '🇲🇹', name: 'Malta',                    dialCode: '+356'  },
  { code: 'MH', flag: '🇲🇭', name: 'Marshall Islands',         dialCode: '+692'  },
  { code: 'MR', flag: '🇲🇷', name: 'Mauritania',               dialCode: '+222'  },
  { code: 'MU', flag: '🇲🇺', name: 'Mauritius',                dialCode: '+230'  },
  { code: 'MX', flag: '🇲🇽', name: 'Mexico',                   dialCode: '+52'   },
  { code: 'FM', flag: '🇫🇲', name: 'Micronesia',               dialCode: '+691'  },
  { code: 'MD', flag: '🇲🇩', name: 'Moldova',                  dialCode: '+373'  },
  { code: 'MC', flag: '🇲🇨', name: 'Monaco',                   dialCode: '+377'  },
  { code: 'MN', flag: '🇲🇳', name: 'Mongolia',                 dialCode: '+976'  },
  { code: 'ME', flag: '🇲🇪', name: 'Montenegro',               dialCode: '+382'  },
  { code: 'MA', flag: '🇲🇦', name: 'Morocco',                  dialCode: '+212'  },
  { code: 'MZ', flag: '🇲🇿', name: 'Mozambique',               dialCode: '+258'  },
  { code: 'MM', flag: '🇲🇲', name: 'Myanmar',                  dialCode: '+95'   },
  { code: 'NA', flag: '🇳🇦', name: 'Namibia',                  dialCode: '+264'  },
  { code: 'NR', flag: '🇳🇷', name: 'Nauru',                    dialCode: '+674'  },
  { code: 'NP', flag: '🇳🇵', name: 'Nepal',                    dialCode: '+977'  },
  { code: 'NL', flag: '🇳🇱', name: 'Netherlands',              dialCode: '+31'   },
  { code: 'NZ', flag: '🇳🇿', name: 'New Zealand',              dialCode: '+64'   },
  { code: 'NI', flag: '🇳🇮', name: 'Nicaragua',                dialCode: '+505'  },
  { code: 'NE', flag: '🇳🇪', name: 'Niger',                    dialCode: '+227'  },
  { code: 'NG', flag: '🇳🇬', name: 'Nigeria',                  dialCode: '+234'  },
  { code: 'NO', flag: '🇳🇴', name: 'Norway',                   dialCode: '+47'   },
  { code: 'OM', flag: '🇴🇲', name: 'Oman',                     dialCode: '+968'  },
  { code: 'PK', flag: '🇵🇰', name: 'Pakistan',                 dialCode: '+92'   },
  { code: 'PW', flag: '🇵🇼', name: 'Palau',                    dialCode: '+680'  },
  { code: 'PS', flag: '🇵🇸', name: 'Palestine',                dialCode: '+970'  },
  { code: 'PA', flag: '🇵🇦', name: 'Panama',                   dialCode: '+507'  },
  { code: 'PG', flag: '🇵🇬', name: 'Papua New Guinea',         dialCode: '+675'  },
  { code: 'PY', flag: '🇵🇾', name: 'Paraguay',                 dialCode: '+595'  },
  { code: 'PE', flag: '🇵🇪', name: 'Peru',                     dialCode: '+51'   },
  { code: 'PH', flag: '🇵🇭', name: 'Philippines',              dialCode: '+63'   },
  { code: 'PL', flag: '🇵🇱', name: 'Poland',                   dialCode: '+48'   },
  { code: 'PT', flag: '🇵🇹', name: 'Portugal',                 dialCode: '+351'  },
  { code: 'QA', flag: '🇶🇦', name: 'Qatar',                    dialCode: '+974'  },
  { code: 'RO', flag: '🇷🇴', name: 'Romania',                  dialCode: '+40'   },
  { code: 'RU', flag: '🇷🇺', name: 'Russia',                   dialCode: '+7'    },
  { code: 'RW', flag: '🇷🇼', name: 'Rwanda',                   dialCode: '+250'  },
  { code: 'KN', flag: '🇰🇳', name: 'Saint Kitts & Nevis',      dialCode: '+1869' },
  { code: 'LC', flag: '🇱🇨', name: 'Saint Lucia',              dialCode: '+1758' },
  { code: 'VC', flag: '🇻🇨', name: 'Saint Vincent & Grenadines', dialCode: '+1784' },
  { code: 'WS', flag: '🇼🇸', name: 'Samoa',                    dialCode: '+685'  },
  { code: 'SM', flag: '🇸🇲', name: 'San Marino',               dialCode: '+378'  },
  { code: 'ST', flag: '🇸🇹', name: 'São Tomé & Príncipe',      dialCode: '+239'  },
  { code: 'SA', flag: '🇸🇦', name: 'Saudi Arabia',             dialCode: '+966'  },
  { code: 'SN', flag: '🇸🇳', name: 'Senegal',                  dialCode: '+221'  },
  { code: 'RS', flag: '🇷🇸', name: 'Serbia',                   dialCode: '+381'  },
  { code: 'SC', flag: '🇸🇨', name: 'Seychelles',               dialCode: '+248'  },
  { code: 'SL', flag: '🇸🇱', name: 'Sierra Leone',             dialCode: '+232'  },
  { code: 'SG', flag: '🇸🇬', name: 'Singapore',                dialCode: '+65'   },
  { code: 'SK', flag: '🇸🇰', name: 'Slovakia',                 dialCode: '+421'  },
  { code: 'SI', flag: '🇸🇮', name: 'Slovenia',                 dialCode: '+386'  },
  { code: 'SB', flag: '🇸🇧', name: 'Solomon Islands',          dialCode: '+677'  },
  { code: 'SO', flag: '🇸🇴', name: 'Somalia',                  dialCode: '+252'  },
  { code: 'ZA', flag: '🇿🇦', name: 'South Africa',             dialCode: '+27'   },
  { code: 'SS', flag: '🇸🇸', name: 'South Sudan',              dialCode: '+211'  },
  { code: 'ES', flag: '🇪🇸', name: 'Spain',                    dialCode: '+34'   },
  { code: 'LK', flag: '🇱🇰', name: 'Sri Lanka',                dialCode: '+94'   },
  { code: 'SD', flag: '🇸🇩', name: 'Sudan',                    dialCode: '+249'  },
  { code: 'SR', flag: '🇸🇷', name: 'Suriname',                 dialCode: '+597'  },
  { code: 'SE', flag: '🇸🇪', name: 'Sweden',                   dialCode: '+46'   },
  { code: 'CH', flag: '🇨🇭', name: 'Switzerland',              dialCode: '+41'   },
  { code: 'SY', flag: '🇸🇾', name: 'Syria',                    dialCode: '+963'  },
  { code: 'TW', flag: '🇹🇼', name: 'Taiwan',                   dialCode: '+886'  },
  { code: 'TJ', flag: '🇹🇯', name: 'Tajikistan',               dialCode: '+992'  },
  { code: 'TZ', flag: '🇹🇿', name: 'Tanzania',                 dialCode: '+255'  },
  { code: 'TH', flag: '🇹🇭', name: 'Thailand',                 dialCode: '+66'   },
  { code: 'TL', flag: '🇹🇱', name: 'Timor-Leste',              dialCode: '+670'  },
  { code: 'TG', flag: '🇹🇬', name: 'Togo',                     dialCode: '+228'  },
  { code: 'TO', flag: '🇹🇴', name: 'Tonga',                    dialCode: '+676'  },
  { code: 'TT', flag: '🇹🇹', name: 'Trinidad & Tobago',        dialCode: '+1868' },
  { code: 'TN', flag: '🇹🇳', name: 'Tunisia',                  dialCode: '+216'  },
  { code: 'TR', flag: '🇹🇷', name: 'Turkey',                   dialCode: '+90'   },
  { code: 'TM', flag: '🇹🇲', name: 'Turkmenistan',             dialCode: '+993'  },
  { code: 'TV', flag: '🇹🇻', name: 'Tuvalu',                   dialCode: '+688'  },
  { code: 'UG', flag: '🇺🇬', name: 'Uganda',                   dialCode: '+256'  },
  { code: 'UA', flag: '🇺🇦', name: 'Ukraine',                  dialCode: '+380'  },
  { code: 'AE', flag: '🇦🇪', name: 'United Arab Emirates',     dialCode: '+971'  },
  { code: 'GB', flag: '🇬🇧', name: 'United Kingdom',           dialCode: '+44'   },
  { code: 'US', flag: '🇺🇸', name: 'United States',            dialCode: '+1'    },
  { code: 'UY', flag: '🇺🇾', name: 'Uruguay',                  dialCode: '+598'  },
  { code: 'UZ', flag: '🇺🇿', name: 'Uzbekistan',               dialCode: '+998'  },
  { code: 'VU', flag: '🇻🇺', name: 'Vanuatu',                  dialCode: '+678'  },
  { code: 'VE', flag: '🇻🇪', name: 'Venezuela',                dialCode: '+58'   },
  { code: 'VN', flag: '🇻🇳', name: 'Vietnam',                  dialCode: '+84'   },
  { code: 'YE', flag: '🇾🇪', name: 'Yemen',                    dialCode: '+967'  },
  { code: 'ZM', flag: '🇿🇲', name: 'Zambia',                   dialCode: '+260'  },
  { code: 'ZW', flag: '🇿🇼', name: 'Zimbabwe',                 dialCode: '+263'  },
];

const PRIORITY_SET = new Set(PRIORITY_CODES);
export const PRIORITY_COUNTRIES: DialCountry[] =
  PRIORITY_CODES.map(c => ALL_COUNTRIES.find(x => x.code === c)!).filter(Boolean);
export const REST_COUNTRIES: DialCountry[] =
  ALL_COUNTRIES.filter(c => !PRIORITY_SET.has(c.code));
export const COUNTRIES_SORTED: DialCountry[] = [...PRIORITY_COUNTRIES, ...REST_COUNTRIES];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parsePhone(raw: string): { dialCode: string; local: string } {
  if (!raw) return { dialCode: '+33', local: '' };
  if (!raw.startsWith('+')) return { dialCode: '+33', local: raw };

  // Try longest match first (up to 4-digit codes)
  for (const len of [4, 3, 2, 1]) {
    const prefix = raw.slice(0, 1 + len); // includes the '+'
    const match = COUNTRIES_SORTED.find(c => c.dialCode === prefix);
    if (match) {
      const local = raw.slice(prefix.length).trimStart();
      return { dialCode: match.dialCode, local };
    }
  }
  return { dialCode: '+33', local: raw };
}

// ─── Country row ─────────────────────────────────────────────────────────────

function CountryRow({ c, active, onSelect }: { c: DialCountry; active: boolean; onSelect: (d: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(c.dialCode)}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors
        ${active
          ? 'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300'
          : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
        }`}
    >
      <span className="text-base w-6 text-center leading-none">{c.flag}</span>
      <span className="flex-1 truncate text-xs">{c.name}</span>
      <span className="text-xs font-medium tabular-nums text-gray-400 dark:text-gray-500 flex-shrink-0">{c.dialCode}</span>
    </button>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  value:     string;
  onChange:  (v: string) => void;
  inputCls:  string;
  placeholder?: string;
}

export default function PhoneInput({ value, onChange, inputCls, placeholder }: Props) {
  const parsed   = parsePhone(value);
  const [dialCode, setDialCode] = useState(parsed.dialCode);
  const [local,    setLocal]    = useState(parsed.local);
  const [open,     setOpen]     = useState(false);
  const [search,   setSearch]   = useState('');
  const dropRef  = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Sync to parent
  const emitChange = (code: string, num: string) => {
    onChange(num ? `${code}${num}` : '');
  };

  const handleDialCode = (code: string) => {
    setDialCode(code);
    setOpen(false);
    setSearch('');
    emitChange(code, local);
  };

  const handleLocal = (num: string) => {
    setLocal(num);
    emitChange(dialCode, num);
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Focus search when opening
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  const selectedCountry = COUNTRIES_SORTED.find(c => c.dialCode === dialCode) ?? COUNTRIES_SORTED[0];

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return null; // signals "show sectioned view"
    return COUNTRIES_SORTED.filter(c =>
      c.name.toLowerCase().includes(q) || c.dialCode.includes(q)
    );
  }, [search]);

  return (
    <div className="flex gap-0 relative" ref={dropRef}>
      {/* ── Dial code button ── */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-2.5 rounded-l-xl border border-r-0 border-gray-200 dark:border-gray-700
          bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200
          hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex-shrink-0 min-w-[88px]"
      >
        <span className="text-base leading-none">{selectedCountry.flag}</span>
        <span className="font-medium tabular-nums">{dialCode}</span>
        <ChevronDown size={12} className={`text-gray-400 transition-transform ml-auto ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* ── Local number input ── */}
      <input
        type="tel"
        value={local}
        onChange={e => handleLocal(e.target.value)}
        placeholder={placeholder ?? '6 12 34 56 78'}
        autoComplete="tel-national"
        className={`${inputCls} rounded-l-none border-l-0 flex-1`}
      />

      {/* ── Dropdown ── */}
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-72 rounded-xl border border-gray-200 dark:border-gray-700
          bg-white dark:bg-gray-800 shadow-xl shadow-black/10 dark:shadow-black/40 overflow-hidden">

          {/* Search */}
          <div className="p-2 border-b border-gray-100 dark:border-gray-700">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search country or code…"
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700
                  bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400
                  focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
              />
            </div>
          </div>

          {/* List */}
          <div className="max-h-56 overflow-y-auto">
            {filtered !== null ? (
              /* Search results — flat list */
              filtered.length === 0 ? (
                <p className="px-3 py-4 text-xs text-center text-gray-400">No results</p>
              ) : (
                filtered.map(c => (
                  <CountryRow key={c.code} c={c} active={c.dialCode === dialCode} onSelect={handleDialCode} />
                ))
              )
            ) : (
              /* Default — priority section + divider + rest */
              <>
                {PRIORITY_COUNTRIES.map(c => (
                  <CountryRow key={c.code} c={c} active={c.dialCode === dialCode} onSelect={handleDialCode} />
                ))}
                <div className="mx-3 my-1 border-t border-gray-200 dark:border-gray-700" />
                {REST_COUNTRIES.map(c => (
                  <CountryRow key={c.code} c={c} active={c.dialCode === dialCode} onSelect={handleDialCode} />
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
