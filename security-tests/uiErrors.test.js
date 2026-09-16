// A refusal is not a failure. One reader, or the screen lies.
//
// Run it:  node security-tests/uiErrors.test.js
//
// Every billed route can answer 402 (the balance is empty), 403 (the plan does
// not include it, or the account is blocked), 429 (too fast), 413 (too long) or
// 503 (our side is down). Each one asks the user for a different thing, and only
// one of them is worth money to us. The screens used to do this instead:
//
//     if (!res.ok) throw new Error(data.error ?? 'Generation failed');
//
// which shows the server's own English string — or a generic failure — for all
// five. A user out of credits read "Generation failed" and concluded the product
// was broken. One screen did not even check res.ok: a refused auto-apply run was
// rendered as a campaign that applied to nothing.
//
// Two rules:
//
//   1. Every call to a billed route reads its refusal through readAiError.
//   2. Nobody outside clientError.ts turns an HTTP status into a sentence.
//
// The list below is the billed catalogue — the subject of the rule, not an
// exemption list. Adding a billed route without wiring its refusal fails here.
//
// Guarded: the number of checks that ran must equal EXPECTED_CHECKS.

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT            = path.resolve(__dirname, '..');
const SRC             = path.join(ROOT, 'src');
const READER          = 'src/lib/ai/clientError.ts';
const EXPECTED_CHECKS = 2;
const LOOKAHEAD       = 30;   // lines between a fetch and its refusal handling

// The routes that spend credits. A trailing [`'"?$/] keeps /api/generate-cv from
// matching /api/generate-cv-pdf, which is a printer, not an AI call.
const BILLED = new RegExp(
  "fetch\\(\\s*[`'\"]\\/api\\/(" + [
    'chat',
    'ats-score',
    'cv-match-score',
    'generate-cover-letter',
    'generate-cv',
    'describe-cv',
    'parse-cv',
    'modify-document',
    'modify-cv-data',
    'rewrite-bullet',
    'interview-coach',
    'speech-to-text',
    'text-to-speech',
    'ai-job-matches',
    'auto-apply\\/run',
    'jobs\\/apply',
  ].join('|') + ")[`'\"?$/]",
);

// A letter template adapted to a job is billed; listing and deleting templates
// on the same route is not.
const BILLED_ADAPT = /fetch\(\s*`\/api\/letter-templates\/[^`]*\/adapt`/;

// Two calls answer a refusal with silence, on purpose.
const SILENT = [
  {
    file:   'src/components/interview-coach/InterviewCoachClient.tsx',
    route:  'text-to-speech',
    // A language with no voice answers 422 and the interview carries on in text.
    // The session is already paid for; muting the voice is the designed outcome.
    reason: 'a missing voice is not a refusal to show',
  },
  {
    file:   'src/components/cv-builder/CVBuilderClient.tsx',
    route:  'translate-cv',
    // Best-effort pre-step: if it fails the CV is built untranslated, and the
    // generate-cv call right after surfaces any real refusal.
    reason: 'falls back to the untranslated CV, and generate-cv reports',
  },
];

// Admin screens read 503 to detect an unconfigured install, not an AI refusal.
const STATUS_ALLOWED = (relative) =>
  relative === READER || relative.startsWith('src/components/admin/');

let passed = 0;
let failed = 0;
function check(name, violations) {
  if (violations.length === 0) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}`);
    for (const v of violations) console.log(`          ${v}`);
  }
}

function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(?<!:)\/\/.*$/, ''))
    .join('\n');
}

function isSilent(relative, line) {
  return SILENT.some((s) => s.file === relative && line.includes(`/api/${s.route}`));
}

// A screen may route its refusals through a helper of its own — the interview
// does, because it also has to decide which upgrade to offer — and that is still
// the shared reader, one indirection away. A helper counts only when its own
// body reaches readAiError: a private reader that parses the response itself is
// a second door, and stays a violation.
function localReaders(lines) {
  const names = new Set();
  lines.forEach((line, n) => {
    const declared = /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/.exec(line);
    if (declared && lines.slice(n, n + 25).join('\n').includes('readAiError')) {
      names.add(declared[1]);
    }
  });
  return names;
}

function main() {
  const files = sourceFiles(SRC);
  console.log(`\nUI errors — ${files.length} source files under src/`);
  console.log(`Reader: ${READER}`);
  console.log(`Silent by design: ${SILENT.map((s) => s.route).join(', ')}\n`);

  const unread   = [];
  const remapped = [];

  for (const file of files) {
    const relative = path.relative(ROOT, file).split(path.sep).join('/');
    if (relative === READER) continue;

    const lines   = stripComments(fs.readFileSync(file, 'utf8')).split('\n');
    const readers = localReaders(lines);

    lines.forEach((line, n) => {
      // Rule 1 — a billed call must read its refusal through the shared reader.
      if ((BILLED.test(line) || BILLED_ADAPT.test(line)) && !isSilent(relative, line)) {
        const window  = lines.slice(n, n + LOOKAHEAD).join('\n');
        const reaches = window.includes('readAiError')
          || [...readers].some((name) => new RegExp(`\\b${name}\\s*\\(`).test(window));
        if (!reaches) {
          unread.push(`${relative}:${n + 1}  ${line.trim().slice(0, 100)}`);
        }
      }

      // Rule 2 — nobody else maps a status to a meaning.
      if (/\bstatus\s*===\s*(402|403|413|429|503)\b/.test(line) && !STATUS_ALLOWED(relative)) {
        remapped.push(`${relative}:${n + 1}  ${line.trim().slice(0, 100)}`);
      }
    });
  }

  check('every billed call reads its refusal through the shared reader', unread);
  check('only clientError.ts turns an HTTP status into a sentence', remapped);

  const ran = passed + failed;
  if (ran !== EXPECTED_CHECKS) {
    failed++;
    console.log(`  FAIL  REPORT expected ${EXPECTED_CHECKS} checks, ran ${ran}`);
  }
  console.log(failed ? `\n${failed} FAILED, ${passed} ok` : `\nall ${passed} checks passed`);
  process.exit(failed ? 1 : 0);
}

main();
