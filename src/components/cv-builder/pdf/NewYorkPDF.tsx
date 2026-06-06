import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { CVFormData, SkillCategory } from '../types';
import { dateRange, eduRange, parseBullets, skillLevel } from './helpers';

const BLACK = '#0f0f0f';
const BLUE  = '#3b82f6';

const s = StyleSheet.create({
  page: { backgroundColor: '#ffffff', fontFamily: 'Helvetica' },

  // Black header
  header: {
    backgroundColor: BLACK, padding: '20 26',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  headerName: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#ffffff', letterSpacing: -0.8, marginBottom: 3 },
  headerPos:  { fontSize: 8.5, color: 'rgba(255,255,255,0.6)' },
  pills:      { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end', maxWidth: 220 },
  pill: {
    backgroundColor: '#1f1f1f',
    paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 10,
  },
  pillTxt: { fontSize: 6.5, color: 'rgba(255,255,255,0.8)' },

  // Blue accent bar
  accentBar: { height: 4, backgroundColor: BLUE },

  // Body
  body:    { flexDirection: 'row', flex: 1 },

  // Sidebar (light, no bg)
  sidebar: { width: 150, padding: '18 14', borderRightWidth: 1, borderRightColor: '#f3f4f6', borderRightStyle: 'solid' },
  secLbl:  { fontSize: 6.5, fontFamily: 'Helvetica-Bold', letterSpacing: 1.8, textTransform: 'uppercase', color: BLUE, marginBottom: 8 },
  sbGap:   { marginBottom: 18 },

  skillName: { fontSize: 7.5, color: '#374151', marginBottom: 2 },
  skillBg:   { height: 3, backgroundColor: '#e5e7eb', borderRadius: 2, marginBottom: 6 },
  skillFill: { height: 3, backgroundColor: BLUE, borderRadius: 2 },

  langName:  { fontSize: 7.5, color: '#374151', marginBottom: 2 },
  langBar:   { height: 2, backgroundColor: '#e5e7eb', borderRadius: 1, marginBottom: 7 },
  langFill:  { height: 2, backgroundColor: BLUE, borderRadius: 1 },

  eduSbBlock: { marginBottom: 10 },
  eduSbDeg:   { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#111827' },
  eduSbField: { fontSize: 7, color: BLUE },
  eduSbSch:   { fontSize: 7, color: '#6B7280' },
  eduSbDate:  { fontSize: 6.5, color: '#9CA3AF' },

  // Main
  main:    { flex: 1, padding: '18 20' },
  summary: {
    paddingHorizontal: 11, paddingVertical: 8,
    borderLeftWidth: 3, borderLeftColor: BLUE, borderLeftStyle: 'solid',
    backgroundColor: '#eff6ff', borderRadius: 4, marginBottom: 18,
  },
  summaryTxt: { fontSize: 8, color: '#1e40af', lineHeight: 1.6, fontFamily: 'Helvetica-Oblique' },

  secHeader: {
    fontSize: 7.5, fontFamily: 'Helvetica-Bold', letterSpacing: 1.5, textTransform: 'uppercase',
    color: '#1f2937', borderBottomWidth: 2, borderBottomColor: '#e5e7eb', borderBottomStyle: 'solid',
    paddingBottom: 3, marginBottom: 10,
  },
  secGap: { marginBottom: 20 },

  expBlock:  { marginBottom: 12, paddingLeft: 14 },
  dot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: BLUE, position: 'absolute', left: 0, top: 3,
  },
  expTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  expPos:    { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#111827', flex: 1 },
  expDate:   { fontSize: 7, color: '#9CA3AF' },
  expCo:     { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: BLUE, marginBottom: 4 },

  bulletRow: { flexDirection: 'row', marginBottom: 2 },
  bulletDot: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: BLUE, width: 9 },
  bulletTxt: { fontSize: 7, color: '#374151', flex: 1, lineHeight: 1.5 },

  tagWrap:   { flexDirection: 'row', flexWrap: 'wrap' },
  tag: {
    backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderStyle: 'solid',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, margin: 2,
  },
  tagTxt: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: BLUE },
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

export function NewYorkPDF({ data }: { data: CVFormData }) {
  const { personalInfo: p, workExperience: we, education: edu, skills, skillCategories } = data;
  const hasCategories = skillCategories?.some((c: SkillCategory) => c.items.length > 0);
  const contactList = [p.email, p.phone, p.location].filter(Boolean);
  const allSkills = (hasCategories ? (skillCategories ?? []).flatMap((c: SkillCategory) => c.items) : skills).slice(0, 12);

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Black header */}
        <View style={s.header}>
          <View>
            <Text style={s.headerName}>{p.fullName}</Text>
            {we[0] && <Text style={s.headerPos}>{we[0].position}</Text>}
          </View>
          <View style={s.pills}>
            {contactList.map((c, i) => (
              <View key={i} style={s.pill}>
                <Text style={s.pillTxt}>{c}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Blue bar */}
        <View style={s.accentBar} />

        {/* Body */}
        <View style={s.body}>

          {/* Sidebar */}
          <View style={s.sidebar}>
            {skills.length > 0 && (
              <View style={s.sbGap}>
                <Text style={s.secLbl}>Skills</Text>
                {skills.slice(0, 8).map((sk, i) => (
                  <View key={i}>
                    <Text style={s.skillName}>{sk}</Text>
                    <View style={s.skillBg}>
                      <View style={[s.skillFill, { width: `${skillLevel(i)}%` as unknown as number }]} />
                    </View>
                  </View>
                ))}
              </View>
            )}

            <View style={s.sbGap}>
              <Text style={s.secLbl}>Languages</Text>
              <Text style={s.langName}>English</Text>
              <View style={s.langBar}><View style={[s.langFill, { width: '95%' as unknown as number }]} /></View>
              <Text style={s.langName}>French</Text>
              <View style={s.langBar}><View style={[s.langFill, { width: '70%' as unknown as number }]} /></View>
            </View>

            {edu.length > 0 && (
              <View>
                <Text style={s.secLbl}>Education</Text>
                {edu.map(ed => (
                  <View key={ed.id} style={s.eduSbBlock}>
                    <Text style={s.eduSbDeg}>{ed.degree}</Text>
                    {ed.field && <Text style={s.eduSbField}>{ed.field}</Text>}
                    <Text style={s.eduSbSch}>{ed.school}</Text>
                    <Text style={s.eduSbDate}>{eduRange(ed)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Main */}
          <View style={s.main}>
            {we[0] && (
              <View style={s.summary}>
                <Text style={s.summaryTxt}>
                  {`Experienced ${we[0].position} with expertise in ${skills.slice(0, 3).join(', ')}. Committed to delivering impactful results.`}
                </Text>
              </View>
            )}

            {we.length > 0 && (
              <View style={s.secGap}>
                <Text style={s.secHeader}>Experience</Text>
                {we.map(exp => (
                  <View key={exp.id} style={s.expBlock}>
                    <View style={s.dot} />
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

            {allSkills.length > 0 && (
              <View>
                <Text style={s.secHeader}>Competencies</Text>
                <View style={s.tagWrap}>
                  {allSkills.map((sk, i) => (
                    <View key={i} style={s.tag}>
                      <Text style={s.tagTxt}>{sk}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>

        </View>
      </Page>
    </Document>
  );
}
