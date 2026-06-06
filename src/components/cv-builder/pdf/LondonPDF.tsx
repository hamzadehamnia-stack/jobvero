import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { CVFormData } from '../types';
import { dateRange, eduRange, parseBullets } from './helpers';

const NAVY   = '#1b3a5c';
const ACCENT = '#4a7fa5';

const s = StyleSheet.create({
  page: { backgroundColor: '#ffffff', fontFamily: 'Helvetica' },

  // Header
  header: {
    padding: '24 30 18',
    borderBottomWidth: 3, borderBottomColor: NAVY, borderBottomStyle: 'solid',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
  },
  headerLeft:  {},
  name:        { fontSize: 22, fontFamily: 'Times-Bold', color: NAVY, letterSpacing: 0.5, marginBottom: 3 },
  headerPos:   { fontSize: 10, fontFamily: 'Helvetica-Bold', color: ACCENT },
  headerRight: { alignItems: 'flex-end', gap: 2 },
  contactTxt:  { fontSize: 7.5, color: '#555555' },
  contactBlue: { fontSize: 7, color: ACCENT },

  // Personal statement
  statement: {
    marginHorizontal: 30, marginVertical: 12,
    borderLeftWidth: 4, borderLeftColor: ACCENT, borderLeftStyle: 'solid',
    backgroundColor: '#f8fafc', padding: '10 14',
  },
  statementTxt: { fontSize: 9, fontFamily: 'Times-Roman', color: '#374151', lineHeight: 1.7, fontStyle: 'italic' },

  // Main + Aside
  body:  { flexDirection: 'row', flex: 1 },
  main:  { flex: 1, padding: '18 18 18 30', borderRightWidth: 1, borderRightColor: '#f0f0f0', borderRightStyle: 'solid' },
  aside: { width: 160, padding: '18 18 18 18' },

  secHeader: {
    fontSize: 8.5, fontFamily: 'Times-Bold', letterSpacing: 1, textTransform: 'uppercase',
    color: NAVY, borderBottomWidth: 2, borderBottomColor: NAVY, borderBottomStyle: 'solid',
    paddingBottom: 3, marginBottom: 10,
  },
  asideSecHeader: {
    fontSize: 7.5, fontFamily: 'Times-Bold', letterSpacing: 1.2, textTransform: 'uppercase',
    color: NAVY, borderBottomWidth: 1.5, borderBottomColor: ACCENT, borderBottomStyle: 'solid',
    paddingBottom: 2.5, marginBottom: 8,
  },
  secGap: { marginBottom: 18 },

  expBlock:  { marginBottom: 14 },
  expTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 2 },
  expPos:    { fontSize: 9.5, fontFamily: 'Times-Bold', color: '#1a1a2e', flex: 1 },
  expDate:   { fontSize: 7, color: ACCENT, fontFamily: 'Helvetica-Oblique' },
  expCo:     { fontSize: 8, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 4 },

  bulletRow: { flexDirection: 'row', marginBottom: 2 },
  bulletDot: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: NAVY, width: 9 },
  bulletTxt: { fontSize: 7, color: '#374151', flex: 1, lineHeight: 1.5 },

  eduBlock:  { marginBottom: 10 },
  eduTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 1 },
  eduDeg:    { fontSize: 9, fontFamily: 'Times-Bold', color: '#1a1a2e', flex: 1 },
  eduDate:   { fontSize: 7, color: ACCENT },
  eduSch:    { fontSize: 7.5, color: NAVY },

  achieveRow:  { flexDirection: 'row', marginBottom: 5 },
  achieveDot:  { width: 5, height: 5, borderRadius: 3, backgroundColor: NAVY, marginTop: 4, marginRight: 7, flexShrink: 0 },
  achieveTxt:  { fontSize: 8, color: '#374151', flex: 1, lineHeight: 1.5 },

  skillRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 5, gap: 5 },
  skillDot:    { width: 4, height: 4, borderRadius: 2, backgroundColor: NAVY },
  skillTxt:    { fontSize: 7.5, color: '#374151', flex: 1 },

  langBlock:   { marginBottom: 6 },
  langName:    { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 1 },
  langLevel:   { fontSize: 7, color: '#6B7280', fontFamily: 'Helvetica-Oblique' },

  interestTxt: { fontSize: 7.5, color: '#374151', marginBottom: 3 },
});

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

export function LondonPDF({ data }: { data: CVFormData }) {
  const { personalInfo: p, workExperience: we, education: edu, skills } = data;

  const statement = we[0]
    ? `A dedicated ${we[0].position} with extensive experience${skills.length > 0 ? ` and demonstrable expertise in ${skills.slice(0, 3).join(', ')}` : ''}. A results-driven professional committed to excellence and organisational success.`
    : 'An experienced professional committed to excellence through strategic thinking and collaborative leadership.';

  const achievements = we
    .flatMap(e => parseBullets(e.description))
    .slice(0, 4);

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.name}>{p.fullName}</Text>
            {we[0] && <Text style={s.headerPos}>{we[0].position}</Text>}
          </View>
          <View style={s.headerRight}>
            {p.email    && <Text style={s.contactTxt}>✉ {p.email}</Text>}
            {p.phone    && <Text style={s.contactTxt}>☎ {p.phone}</Text>}
            {p.location && <Text style={s.contactTxt}>📍 {p.location}</Text>}
            {p.linkedin && <Text style={s.contactBlue}>{p.linkedin}</Text>}
          </View>
        </View>

        {/* Personal Statement */}
        <View style={s.statement}>
          <Text style={s.statementTxt}>{statement}</Text>
        </View>

        {/* Body */}
        <View style={s.body}>

          {/* Main */}
          <View style={s.main}>
            {we.length > 0 && (
              <View style={s.secGap}>
                <Text style={s.secHeader}>Experience</Text>
                {we.map(exp => (
                  <View key={exp.id} style={s.expBlock}>
                    <View style={s.expTopRow}>
                      <Text style={s.expPos}>{exp.position}</Text>
                      <Text style={s.expDate}>{dateRange(exp)}</Text>
                    </View>
                    <Text style={s.expCo}>{exp.company}</Text>
                    <Bullets text={exp.description} />
                  </View>
                ))}
              </View>
            )}

            {edu.length > 0 && (
              <View style={s.secGap}>
                <Text style={s.secHeader}>Education</Text>
                {edu.map(ed => (
                  <View key={ed.id} style={s.eduBlock}>
                    <View style={s.eduTopRow}>
                      <Text style={s.eduDeg}>{ed.degree}{ed.field ? `, ${ed.field}` : ''}</Text>
                      <Text style={s.eduDate}>{eduRange(ed)}</Text>
                    </View>
                    <Text style={s.eduSch}>{ed.school}</Text>
                  </View>
                ))}
              </View>
            )}

            {achievements.length > 0 && (
              <View>
                <Text style={s.secHeader}>Key Achievements</Text>
                {achievements.map((a, i) => (
                  <View key={i} style={s.achieveRow}>
                    <View style={s.achieveDot} />
                    <Text style={s.achieveTxt}>{a}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Aside */}
          <View style={s.aside}>
            {skills.length > 0 && (
              <View style={s.secGap}>
                <Text style={s.asideSecHeader}>Core Skills</Text>
                {skills.slice(0, 10).map((sk, i) => (
                  <View key={i} style={s.skillRow}>
                    <View style={s.skillDot} />
                    <Text style={s.skillTxt}>{sk}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={s.secGap}>
              <Text style={s.asideSecHeader}>Languages</Text>
              <View style={s.langBlock}>
                <Text style={s.langName}>English</Text>
                <Text style={s.langLevel}>Native / Fluent</Text>
              </View>
              <View style={s.langBlock}>
                <Text style={s.langName}>French</Text>
                <Text style={s.langLevel}>Professional</Text>
              </View>
            </View>

            <View>
              <Text style={s.asideSecHeader}>Interests</Text>
              <Text style={s.interestTxt}>Leadership & Mentoring</Text>
              <Text style={s.interestTxt}>Industry Research</Text>
              <Text style={s.interestTxt}>Travel</Text>
            </View>
          </View>

        </View>
      </Page>
    </Document>
  );
}
