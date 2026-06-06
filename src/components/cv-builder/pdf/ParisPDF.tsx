import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { CVFormData } from '../types';
import { initials, dateRange, eduRange, parseBullets, skillLevel } from './helpers';

const NAVY  = '#1a2744';
const BLUE  = '#4a6fa5';
const SB_BG = '#1a2744';
const CIRCLE_BG  = '#2d3f5e'; // ~rgba(255,255,255,0.1) on NAVY
const DIVIDER    = '#2f3f5a'; // ~rgba(255,255,255,0.12) on NAVY
const TEXT_MUTED = '#a8c0d6'; // ~rgba(255,255,255,0.72) on NAVY
const TEXT_FAINT = '#7a9ab8'; // ~rgba(255,255,255,0.55) on NAVY

const s = StyleSheet.create({
  page: { backgroundColor: '#ffffff', fontFamily: 'Helvetica' },
  row:  { flexDirection: 'row', flex: 1 },

  // ── Sidebar ──────────────────────────────────────────────
  sidebar: { width: 165, backgroundColor: SB_BG, padding: 20 },

  circle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: CIRCLE_BG,
    borderWidth: 2, borderColor: BLUE, borderStyle: 'solid',
    alignSelf: 'center', alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  circleText:  { fontSize: 17, fontFamily: 'Times-Bold', color: '#ffffff' },
  sbName:      { fontSize: 10, fontFamily: 'Times-Bold',  color: '#ffffff', textAlign: 'center', lineHeight: 1.3, marginBottom: 3 },
  sbTitle:     { fontSize: 7,  color: '#9ab5cc', textAlign: 'center', marginBottom: 14 },
  divider:     { height: 1, backgroundColor: DIVIDER, marginBottom: 14 },
  sectionLbl:  { fontSize: 6.5, fontFamily: 'Helvetica-Bold', letterSpacing: 1.5, textTransform: 'uppercase', color: BLUE, marginBottom: 7 },
  sbGap:       { marginBottom: 16 },

  contactRow:  { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4, gap: 4 },
  contactDot:  { fontSize: 7, color: BLUE, width: 10 },
  contactTxt:  { fontSize: 6.5, color: TEXT_MUTED, flex: 1 },

  skillName:   { fontSize: 7, color: TEXT_MUTED, marginBottom: 2 },
  skillBg:     { height: 3, backgroundColor: DIVIDER, borderRadius: 2, marginBottom: 6 },
  skillFill:   { height: 3, backgroundColor: BLUE, borderRadius: 2 },

  langTxt:     { fontSize: 7.5, color: TEXT_MUTED, marginBottom: 4 },
  interestTxt: { fontSize: 7.5, color: TEXT_FAINT, marginBottom: 3 },

  // ── Main ─────────────────────────────────────────────────
  main:      { flex: 1, backgroundColor: '#ffffff', padding: 28 },
  mainName:  { fontSize: 20, fontFamily: 'Times-Bold', color: NAVY, letterSpacing: -0.5, marginBottom: 3 },
  mainTitle: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: BLUE, letterSpacing: 0.3, marginBottom: 20 },

  secHeader: {
    fontSize: 8, fontFamily: 'Times-Bold', textTransform: 'uppercase', letterSpacing: 0.5,
    color: NAVY, borderBottomWidth: 2, borderBottomColor: BLUE, borderBottomStyle: 'solid',
    paddingBottom: 3, marginBottom: 10,
  },
  secGap:     { marginBottom: 18 },
  expBlock:   { marginBottom: 12 },
  expTopRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 2 },
  expPos:     { fontSize: 9, fontFamily: 'Times-Bold', color: '#1a1a2e', flex: 1 },
  expDate:    { fontSize: 6.5, color: BLUE },
  expCo:      { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: BLUE, marginBottom: 4 },
  expSep:     { height: 1, backgroundColor: '#f0f0f0', marginTop: 10, marginBottom: 10 },

  bulletRow:  { flexDirection: 'row', marginBottom: 2 },
  bulletDot:  { fontSize: 7, fontFamily: 'Helvetica-Bold', color: BLUE, width: 9 },
  bulletTxt:  { fontSize: 7, color: '#374151', flex: 1, lineHeight: 1.5 },

  eduBlock:   { marginBottom: 10 },
  eduTopRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 1 },
  eduDeg:     { fontSize: 8.5, fontFamily: 'Times-Bold', color: '#1a1a2e', flex: 1 },
  eduDate:    { fontSize: 6.5, color: BLUE },
  eduSchool:  { fontSize: 7.5, color: '#555555' },
});

// ─── Sub-components ───────────────────────────────────────────────────────────

function Bullets({ text }: { text: string }) {
  const lines = parseBullets(text);
  if (!lines.length) return null;
  return (
    <View>
      {lines.map((l, i) => (
        <View key={i} style={s.bulletRow}>
          <Text style={s.bulletDot}>•</Text>
          <Text style={s.bulletTxt}>{l}</Text>
        </View>
      ))}
    </View>
  );
}

function SkillBar({ name, level }: { name: string; level: number }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={s.skillName}>{name}</Text>
      <View style={s.skillBg}>
        <View style={[s.skillFill, { width: `${level}%` as unknown as number }]} />
      </View>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ParisPDF({ data }: { data: CVFormData }) {
  const { personalInfo: p, workExperience: we, education: edu, skills } = data;
  const jobTitle = we[0]?.position ?? '';
  const lang = 'fr';

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.row}>

          {/* ── Sidebar ─────────────────────────────────────── */}
          <View style={s.sidebar}>

            {/* Initials circle */}
            <View style={s.circle}>
              <Text style={s.circleText}>{initials(p.fullName)}</Text>
            </View>

            {/* Name + title */}
            <Text style={s.sbName}>{p.fullName}</Text>
            {jobTitle ? <Text style={s.sbTitle}>{jobTitle}</Text> : null}

            <View style={s.divider} />

            {/* Contact */}
            {(p.email || p.phone || p.location || p.linkedin) && (
              <View style={s.sbGap}>
                <Text style={s.sectionLbl}>Contact</Text>
                {p.email    && <View style={s.contactRow}><Text style={s.contactDot}>✉</Text><Text style={s.contactTxt}>{p.email}</Text></View>}
                {p.phone    && <View style={s.contactRow}><Text style={s.contactDot}>☎</Text><Text style={s.contactTxt}>{p.phone}</Text></View>}
                {p.location && <View style={s.contactRow}><Text style={s.contactDot}>📍</Text><Text style={s.contactTxt}>{p.location}</Text></View>}
                {p.linkedin && <View style={s.contactRow}><Text style={s.contactDot}>in</Text><Text style={s.contactTxt}>{p.linkedin}</Text></View>}
              </View>
            )}

            {/* Skills */}
            {skills.length > 0 && (
              <View style={s.sbGap}>
                <Text style={s.sectionLbl}>Compétences</Text>
                {skills.slice(0, 10).map((sk, i) => (
                  <SkillBar key={i} name={sk} level={skillLevel(i)} />
                ))}
              </View>
            )}

            {/* Languages */}
            <View style={s.sbGap}>
              <Text style={s.sectionLbl}>Langues</Text>
              <Text style={s.langTxt}>Français — Natif</Text>
              <Text style={s.langTxt}>Anglais — Courant</Text>
            </View>

            {/* Interests */}
            <View>
              <Text style={s.sectionLbl}>{"Centres d'intérêt"}</Text>
              <Text style={s.interestTxt}>Voyages</Text>
              <Text style={s.interestTxt}>Lecture</Text>
              <Text style={s.interestTxt}>Sport</Text>
            </View>
          </View>

          {/* ── Main ────────────────────────────────────────── */}
          <View style={s.main}>
            <Text style={s.mainName}>{p.fullName}</Text>
            {jobTitle ? <Text style={s.mainTitle}>{jobTitle}</Text> : null}

            {/* Experience */}
            {we.length > 0 && (
              <View style={s.secGap}>
                <Text style={s.secHeader}>Expérience Professionnelle</Text>
                {we.map((exp, idx) => (
                  <View key={exp.id}>
                    {idx > 0 && <View style={s.expSep} />}
                    <View style={s.expBlock}>
                      <View style={s.expTopRow}>
                        <Text style={s.expPos}>{exp.position}</Text>
                        <Text style={s.expDate}>{dateRange(exp, lang)}</Text>
                      </View>
                      <Text style={s.expCo}>{exp.company}</Text>
                      <Bullets text={exp.description} />
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Education */}
            {edu.length > 0 && (
              <View>
                <Text style={s.secHeader}>Formation</Text>
                {edu.map(ed => (
                  <View key={ed.id} style={s.eduBlock}>
                    <View style={s.eduTopRow}>
                      <Text style={s.eduDeg}>{ed.degree}{ed.field ? ` — ${ed.field}` : ''}</Text>
                      <Text style={s.eduDate}>{eduRange(ed, lang)}</Text>
                    </View>
                    <Text style={s.eduSchool}>{ed.school}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

        </View>
      </Page>
    </Document>
  );
}
