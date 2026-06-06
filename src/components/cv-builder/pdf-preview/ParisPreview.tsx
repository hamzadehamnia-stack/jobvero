'use client';

import React from 'react';
import type { CVFormData } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const SERIF = 'Georgia, "Times New Roman", serif';
const SANS  = 'Arial, Helvetica, sans-serif';

const NAVY       = '#1a2744';
const BLUE       = '#4a6fa5';
const CIRCLE_BG  = '#253555'; // rgba(255,255,255,0.10) blended on NAVY
const DIVIDER    = '#2c3f5a'; // rgba(255,255,255,0.12) blended on NAVY
const MUTED      = '#a8c0d6'; // rgba(255,255,255,0.72) blended on NAVY
const FAINT      = '#7a9ab8'; // rgba(255,255,255,0.55) blended on NAVY

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(d: string, lang = 'fr'): string {
  if (!d) return '';
  const [y, m] = d.split('-');
  if (!m) return y;
  const en = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fr = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  return `${(lang === 'fr' ? fr : en)[parseInt(m) - 1]} ${y}`;
}

function dateRange(exp: { startDate: string; endDate: string; current: boolean }, lang = 'fr') {
  const now = lang === 'fr' ? "Auj." : 'Present';
  return `${fmt(exp.startDate, lang)} – ${exp.current ? now : fmt(exp.endDate, lang)}`;
}

function eduRange(ed: { startDate: string; endDate: string; current?: boolean }, lang = 'fr') {
  const now = lang === 'fr' ? 'Auj.' : 'Present';
  return `${fmt(ed.startDate, lang)} – ${ed.current ? now : fmt(ed.endDate, lang)}`;
}

function getInitials(name: string): string {
  return (name || 'U').split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2);
}

function skillLevel(i: number): number {
  return [85, 90, 75, 95, 80, 88, 70, 92][i % 8];
}

function parseBullets(text: string): string[] {
  if (!text?.trim()) return [];
  const lines = text.split(/\n/).map(l => l.replace(/^[-•*]\s*/, '').trim()).filter(l => l.length > 2);
  if (lines.length > 0) return lines;
  return text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 3);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabelSidebar({ children }: { children: string }) {
  return (
    <div style={{
      fontFamily: SANS,
      fontSize: '7.5px',
      fontWeight: 700,
      letterSpacing: '1.8px',
      textTransform: 'uppercase',
      color: BLUE,
      marginBottom: '9px',
    }}>
      {children}
    </div>
  );
}

function SectionHeaderMain({ children }: { children: string }) {
  return (
    <div style={{
      fontFamily: SERIF,
      fontSize: '10.5px',
      fontWeight: 700,
      letterSpacing: '0.5px',
      textTransform: 'uppercase',
      color: NAVY,
      borderBottom: `2px solid ${BLUE}`,
      paddingBottom: '4px',
      marginBottom: '12px',
      WebkitPrintColorAdjust: 'exact',
      printColorAdjust: 'exact',
    } as React.CSSProperties}>
      {children}
    </div>
  );
}

function SkillBar({ name, level }: { name: string; level: number }) {
  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={{ fontFamily: SANS, fontSize: '9px', color: MUTED, marginBottom: '3px' }}>
        {name}
      </div>
      <div style={{
        height: '3px',
        backgroundColor: DIVIDER,
        borderRadius: '2px',
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
      } as React.CSSProperties}>
        <div style={{
          height: '3px',
          backgroundColor: BLUE,
          borderRadius: '2px',
          width: `${level}%`,
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
        } as React.CSSProperties} />
      </div>
    </div>
  );
}

function Bullets({ text, color }: { text: string; color: string }) {
  const lines = parseBullets(text);
  if (!lines.length) return null;
  return (
    <div>
      {lines.map((l, i) => (
        <div key={i} style={{ display: 'flex', gap: '5px', marginBottom: '3px' }}>
          <span style={{ color, fontWeight: 700, flexShrink: 0, fontFamily: SANS, fontSize: '9px', marginTop: '1px' }}>•</span>
          <span style={{ fontFamily: SANS, fontSize: '9px', color: '#374151', lineHeight: '1.5' }}>{l}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  data: CVFormData;
}

export function ParisPreview({ data }: Props) {
  const { personalInfo: p, workExperience: we, education: edu, skills } = data;
  const jobTitle = we[0]?.position ?? '';
  const initText = getInitials(p.fullName);

  const printExact: React.CSSProperties = {
    WebkitPrintColorAdjust: 'exact',
    printColorAdjust: 'exact',
  };

  return (
    <div style={{
      fontFamily: SANS,
      width: '794px',
      background: '#ffffff',
      display: 'flex',
      alignItems: 'stretch',
      minHeight: '1123px',
      boxSizing: 'border-box',
      ...printExact,
    }}>

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <div style={{
        width: '220px',
        flexShrink: 0,
        backgroundColor: NAVY,
        padding: '32px 20px',
        boxSizing: 'border-box',
        alignSelf: 'stretch',
        ...printExact,
      }}>

        {/* Initials circle */}
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          backgroundColor: CIRCLE_BG,
          border: `2.5px solid ${BLUE}`,
          margin: '0 auto 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: SERIF,
          fontSize: '26px',
          fontWeight: 700,
          color: '#ffffff',
          ...printExact,
        }}>
          {initText}
        </div>

        {/* Name + title */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ fontFamily: SERIF, fontSize: '14px', fontWeight: 700, color: '#ffffff', lineHeight: '1.3' }}>
            {p.fullName}
          </div>
          {jobTitle && (
            <div style={{ fontFamily: SANS, fontSize: '9.5px', color: 'rgba(255,255,255,0.6)', marginTop: '5px' }}>
              {jobTitle}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: '1px', backgroundColor: DIVIDER, marginBottom: '18px', ...printExact }} />

        {/* Contact */}
        {(p.email || p.phone || p.location || p.linkedin) && (
          <div style={{ marginBottom: '20px' }}>
            <SectionLabelSidebar>Contact</SectionLabelSidebar>
            {p.email && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <span style={{ color: BLUE, fontSize: '10px', fontFamily: SANS }}>✉</span>
                <span style={{ color: MUTED, fontSize: '9px', wordBreak: 'break-all', fontFamily: SANS }}>{p.email}</span>
              </div>
            )}
            {p.phone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <span style={{ color: BLUE, fontSize: '10px', fontFamily: SANS }}>☎</span>
                <span style={{ color: MUTED, fontSize: '9px', fontFamily: SANS }}>{p.phone}</span>
              </div>
            )}
            {p.location && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <span style={{ color: BLUE, fontSize: '10px', fontFamily: SANS }}>📍</span>
                <span style={{ color: MUTED, fontSize: '9px', fontFamily: SANS }}>{p.location}</span>
              </div>
            )}
            {p.linkedin && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <span style={{ color: BLUE, fontSize: '10px', fontFamily: SANS, fontWeight: 700 }}>in</span>
                <span style={{ color: FAINT, fontSize: '8.5px', wordBreak: 'break-all', fontFamily: SANS }}>{p.linkedin}</span>
              </div>
            )}
          </div>
        )}

        {/* Skills */}
        {skills.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <SectionLabelSidebar>Compétences</SectionLabelSidebar>
            {skills.slice(0, 10).map((sk, i) => (
              <SkillBar key={i} name={sk} level={skillLevel(i)} />
            ))}
          </div>
        )}

        {/* Languages */}
        <div style={{ marginBottom: '20px' }}>
          <SectionLabelSidebar>Langues</SectionLabelSidebar>
          <div style={{ fontFamily: SANS, fontSize: '9.5px', color: MUTED, marginBottom: '5px' }}>Français — Natif</div>
          <div style={{ fontFamily: SANS, fontSize: '9.5px', color: MUTED }}>Anglais — Courant</div>
        </div>

        {/* Interests */}
        <div>
          <SectionLabelSidebar>{"Centres d'intérêt"}</SectionLabelSidebar>
          <div style={{ fontFamily: SANS, fontSize: '9.5px', color: FAINT, lineHeight: '2' }}>
            <div>Voyages</div>
            <div>Lecture</div>
            <div>Sport</div>
          </div>
        </div>

      </div>{/* end sidebar */}

      {/* ── Main ────────────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        padding: '36px 30px',
        boxSizing: 'border-box',
        minWidth: 0,
        backgroundColor: '#ffffff',
      }}>

        {/* Header */}
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{
            fontFamily: SERIF,
            fontSize: '28px',
            fontWeight: 900,
            color: NAVY,
            margin: '0 0 5px',
            letterSpacing: '-0.5px',
          }}>
            {p.fullName}
          </h1>
          {jobTitle && (
            <div style={{ fontFamily: SANS, fontSize: '13px', color: BLUE, fontWeight: 600, letterSpacing: '0.3px' }}>
              {jobTitle}
            </div>
          )}
        </div>

        {/* Profil Professionnel */}
        {we.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <SectionHeaderMain>Profil Professionnel</SectionHeaderMain>
            <p style={{
              fontFamily: SANS,
              fontSize: '10px',
              color: '#374151',
              lineHeight: '1.7',
              margin: 0,
            }}>
              {`${we[0].position} expérimenté(e) avec un solide parcours chez ${we[0].company}. `}
              {skills.length > 0
                ? `Maîtrise de ${skills.slice(0, 3).join(', ')}. `
                : ''}
              {'Orienté(e) résultats, capable de mener des projets complexes avec rigueur et leadership.'}
            </p>
          </div>
        )}

        {/* Experience */}
        {we.length > 0 && (
          <div style={{ marginBottom: '26px' }}>
            <SectionHeaderMain>Expérience Professionnelle</SectionHeaderMain>
            {we.map((exp, idx) => (
              <div key={exp.id} style={{
                marginBottom: '16px',
                ...(idx > 0 ? { paddingTop: '14px', borderTop: '1px solid #f0f0f0' } : {}),
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2px' }}>
                  <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: '11.5px', color: '#1a1a2e' }}>
                    {exp.position}
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: '8.5px', color: BLUE, whiteSpace: 'nowrap', marginLeft: '8px' }}>
                    {dateRange(exp)}
                  </div>
                </div>
                <div style={{ fontFamily: SANS, fontSize: '10px', color: BLUE, fontWeight: 600, marginBottom: '6px' }}>
                  {exp.company}
                </div>
                <Bullets text={exp.description} color={BLUE} />
              </div>
            ))}
          </div>
        )}

        {/* Education */}
        {edu.length > 0 && (
          <div>
            <SectionHeaderMain>Formation</SectionHeaderMain>
            {edu.map(ed => (
              <div key={ed.id} style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1px' }}>
                  <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: '11px', color: '#1a1a2e' }}>
                    {ed.degree}{ed.field ? ` — ${ed.field}` : ''}
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: '8.5px', color: BLUE, whiteSpace: 'nowrap', marginLeft: '8px' }}>
                    {eduRange(ed)}
                  </div>
                </div>
                <div style={{ fontFamily: SANS, fontSize: '10px', color: '#555555' }}>
                  {ed.school}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>{/* end main */}

    </div>
  );
}
