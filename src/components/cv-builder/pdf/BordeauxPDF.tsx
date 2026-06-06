import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { CVFormData } from '../types';
import { initials, dateRange, eduRange, parseBullets, skillLevel } from './helpers';

const BURGUNDY = '#8b1a1a';
const CREAM    = '#f9f5f0';
const DARK     = '#3a2020';

const s = StyleSheet.create({
  page:  { backgroundColor: '#ffffff', fontFamily: 'Helvetica' },

  // Full-width header
  header: {
    backgroundColor: BURGUNDY, padding: '22 30',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 14 },
  circle: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.45)', borderStyle: 'solid',
    alignItems: 'center', justifyContent: 'center',
  },
  circleText: { fontSize: 16, fontFamily: 'Times-Bold', color: '#ffffff' },
  headerName: { fontSize: 18, fontFamily: 'Times-Bold', color: '#ffffff', letterSpacing: 0.5, marginBottom: 3 },
  headerPos:  { fontSize: 8.5, color: 'rgba(255,255,255,0.8)' },
  headerRight: { alignItems: 'flex-end', gap: 2 },
  headerContact: { fontSize: 7.5, color: 'rgba(255,255,255,0.78)' },
  headerLinkedin: { fontSize: 7, color: 'rgba(255,255,255,0.55)' },

  // Body: sidebar + main
  body:    { flexDirection: 'row', flex: 1 },
  sidebar: {
    width: 150, backgroundColor: CREAM, padding: '20 14',
    borderRightWidth: 1, borderRightColor: '#e8dede', borderRightStyle: 'solid',
  },
  main:    { flex: 1, padding: '22 22' },

  secLblSb: {
    fontSize: 7.5, fontFamily: 'Times-Bold', letterSpacing: 1.5, textTransform: 'uppercase',
    color: BURGUNDY, borderBottomWidth: 1.5, borderBottomColor: BURGUNDY, borderBottomStyle: 'solid',
    paddingBottom: 3, marginBottom: 8,
  },
  secLblMain: {
    fontSize: 9, fontFamily: 'Times-Bold', letterSpacing: 0.8, textTransform: 'uppercase',
    color: BURGUNDY, flexDirection: 'row', alignItems: 'center', marginBottom: 10,
  },
  secLine: { flex: 1, height: 1, backgroundColor: '#e8dede', marginLeft: 8 },
  sbGap: { marginBottom: 20 },

  skillName: { fontSize: 7.5, color: DARK, marginBottom: 3 },
  skillDots: { flexDirection: 'row', gap: 3, marginBottom: 7 },
  dot:       { width: 7, height: 7, borderRadius: 4 },

  langLabel: { fontSize: 7.5, color: DARK, marginBottom: 3 },
  langBadge: {
    backgroundColor: BURGUNDY, paddingHorizontal: 6, paddingVertical: 1.5,
    borderRadius: 8, alignSelf: 'flex-start', marginBottom: 10,
  },
  langBadge2: {
    backgroundColor: '#5d3a3a', paddingHorizontal: 6, paddingVertical: 1.5,
    borderRadius: 8, alignSelf: 'flex-start', marginBottom: 10,
  },
  langBadgeTxt: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#ffffff' },

  interestTxt: { fontSize: 7.5, color: '#5a3a3a', marginBottom: 3 },

  // Experience
  expBlock:  { marginBottom: 14 },
  expTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 2 },
  expPos:    { fontSize: 9.5, fontFamily: 'Times-Bold', color: '#1a1a2e', flex: 1 },
  expBadge:  {
    backgroundColor: BURGUNDY, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10,
  },
  expBadgeTxt: { fontSize: 6, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  expCo:     { fontSize: 8, fontFamily: 'Helvetica-Bold', color: BURGUNDY, marginBottom: 4 },

  bulletRow: { flexDirection: 'row', marginBottom: 2 },
  bulletDot: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: BURGUNDY, width: 9 },
  bulletTxt: { fontSize: 7, color: '#374151', flex: 1, lineHeight: 1.5 },

  eduBlock:  { marginBottom: 10 },
  eduTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 1 },
  eduDeg:    { fontSize: 9.5, fontFamily: 'Times-Bold', color: '#1a1a2e', flex: 1 },
  eduSchool: { fontSize: 7.5, color: '#555555' },
  secGap:    { marginBottom: 20 },
});

function SkillDots({ level }: { level: number }) {
  return (
    <View style={s.skillDots}>
      {Array.from({ length: 5 }, (_, i) => (
        <View key={i} style={[s.dot, { backgroundColor: i < level ? BURGUNDY : '#ddd' }]} />
      ))}
    </View>
  );
}

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

function SecHeaderMain({ title }: { title: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
      <Text style={{ fontSize: 9, fontFamily: 'Times-Bold', letterSpacing: 0.8, textTransform: 'uppercase', color: BURGUNDY }}>
        {title}
      </Text>
      <View style={s.secLine} />
    </View>
  );
}

export function BordeauxPDF({ data }: { data: CVFormData }) {
  const { personalInfo: p, workExperience: we, education: edu, skills } = data;
  const lang = 'fr';

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Full-width Burgundy header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <View style={s.circle}>
              <Text style={s.circleText}>{initials(p.fullName)}</Text>
            </View>
            <View>
              <Text style={s.headerName}>{p.fullName}</Text>
              {we[0] && <Text style={s.headerPos}>{we[0].position}</Text>}
            </View>
          </View>
          <View style={s.headerRight}>
            {p.email    && <Text style={s.headerContact}>{p.email}</Text>}
            {p.phone    && <Text style={s.headerContact}>{p.phone}</Text>}
            {p.location && <Text style={s.headerContact}>{p.location}</Text>}
            {p.linkedin && <Text style={s.headerLinkedin}>{p.linkedin}</Text>}
          </View>
        </View>

        {/* Body */}
        <View style={s.body}>

          {/* Cream sidebar */}
          <View style={s.sidebar}>
            {skills.length > 0 && (
              <View style={s.sbGap}>
                <Text style={s.secLblSb}>Compétences</Text>
                {skills.slice(0, 8).map((sk, i) => (
                  <View key={i}>
                    <Text style={s.skillName}>{sk}</Text>
                    <SkillDots level={Math.max(2, 5 - (i % 3))} />
                  </View>
                ))}
              </View>
            )}

            <View style={s.sbGap}>
              <Text style={s.secLblSb}>Langues</Text>
              <Text style={s.langLabel}>Français</Text>
              <View style={s.langBadge}><Text style={s.langBadgeTxt}>Natif</Text></View>
              <Text style={s.langLabel}>Anglais</Text>
              <View style={s.langBadge2}><Text style={s.langBadgeTxt}>Courant</Text></View>
            </View>

            <View>
              <Text style={s.secLblSb}>{"Centres d'intérêt"}</Text>
              <Text style={s.interestTxt}>Voyages</Text>
              <Text style={s.interestTxt}>Littérature</Text>
              <Text style={s.interestTxt}>Sport</Text>
            </View>
          </View>

          {/* White main */}
          <View style={s.main}>
            {we.length > 0 && (
              <View style={s.secGap}>
                <SecHeaderMain title="Expériences Professionnelles" />
                {we.map(exp => (
                  <View key={exp.id} style={s.expBlock}>
                    <View style={s.expTopRow}>
                      <Text style={s.expPos}>{exp.position}</Text>
                      <View style={s.expBadge}><Text style={s.expBadgeTxt}>{dateRange(exp, lang)}</Text></View>
                    </View>
                    <Text style={s.expCo}>{exp.company}</Text>
                    <Bullets text={exp.description} />
                  </View>
                ))}
              </View>
            )}

            {edu.length > 0 && (
              <View>
                <SecHeaderMain title="Formation" />
                {edu.map(ed => (
                  <View key={ed.id} style={s.eduBlock}>
                    <View style={s.eduTopRow}>
                      <Text style={s.eduDeg}>{ed.degree}{ed.field ? ` — ${ed.field}` : ''}</Text>
                      <View style={s.expBadge}><Text style={s.expBadgeTxt}>{eduRange(ed, lang)}</Text></View>
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
