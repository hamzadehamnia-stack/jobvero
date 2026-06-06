import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { CVFormData, SkillCategory } from '../types';
import { dateRange, eduRange, parseBullets } from './helpers';

const NAVY = '#1a1a2e';

const s = StyleSheet.create({
  page: { backgroundColor: '#ffffff', fontFamily: 'Helvetica', padding: '36 42' },

  // Centered header
  header:      { alignItems: 'center', borderBottomWidth: 2, borderBottomColor: NAVY, borderBottomStyle: 'solid', paddingBottom: 12, marginBottom: 14 },
  name:        { fontSize: 22, fontFamily: 'Times-Bold', color: NAVY, letterSpacing: 2, marginBottom: 5 },
  headerPos:   { fontSize: 8.5, color: '#555555', fontFamily: 'Helvetica-Oblique', marginBottom: 5 },
  contactRow:  { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  contactTxt:  { fontSize: 7.5, color: '#555555' },
  contactSep:  { fontSize: 7.5, color: '#bbbbbb' },

  secHeader: {
    fontSize: 7, fontFamily: 'Times-Bold', letterSpacing: 1.8, textTransform: 'uppercase',
    color: NAVY, borderBottomWidth: 2, borderBottomColor: NAVY, borderBottomStyle: 'solid',
    paddingBottom: 3, marginBottom: 9,
  },
  secGap: { marginBottom: 16 },

  // Summary
  summary: { fontSize: 8.5, color: '#333333', lineHeight: 1.65 },

  // Experience
  expBlock:  { marginBottom: 12 },
  expTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  expPos:    { fontSize: 9, fontFamily: 'Times-Bold', color: NAVY },
  expDate:   { fontSize: 7, color: '#555555' },
  expCo:     { fontSize: 8, fontFamily: 'Helvetica-Oblique', color: '#333333', marginBottom: 4 },

  bulletRow: { flexDirection: 'row', marginBottom: 2 },
  bulletDot: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: NAVY, width: 10 },
  bulletTxt: { fontSize: 7.5, color: '#374151', flex: 1, lineHeight: 1.5 },

  // Edu + Lang two-column
  twoCol:     { flexDirection: 'row', gap: 16 },
  eduCol:     { flex: 1 },
  langCol:    { width: 120, borderLeftWidth: 1, borderLeftColor: '#e5e7eb', borderLeftStyle: 'solid', paddingLeft: 14 },
  eduBlock:   { marginBottom: 8 },
  eduTopRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  eduDeg:     { fontSize: 8.5, fontFamily: 'Times-Bold', color: NAVY, flex: 1 },
  eduDate:    { fontSize: 7, color: '#555555' },
  eduSchool:  { fontSize: 7.5, fontFamily: 'Helvetica-Oblique', color: '#444444' },
  langTxt:    { fontSize: 8, color: '#333333', marginBottom: 3 },

  // Skills
  skillTag: {
    borderWidth: 1, borderColor: NAVY, borderStyle: 'solid',
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 3, margin: 2,
  },
  skillTagTxt: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: NAVY },
  skillsWrap:  { flexDirection: 'row', flexWrap: 'wrap' },
  skillCatRow: { marginBottom: 4 },
  skillCatTxt: { fontSize: 8.5, color: '#333333' },
  skillCatName:{ fontFamily: 'Times-Bold', color: NAVY },
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

export function AmericanPDF({ data }: { data: CVFormData }) {
  const { personalInfo: p, workExperience: we, education: edu, skills, skillCategories } = data;
  const hasCategories = skillCategories?.some((c: SkillCategory) => c.items.length > 0);
  const contactParts = [p.email, p.phone, p.location, p.linkedin].filter(Boolean);

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Centered header */}
        <View style={s.header}>
          <Text style={s.name}>{p.fullName.toUpperCase()}</Text>
          {we[0] && <Text style={s.headerPos}>{we[0].position}</Text>}
          <View style={s.contactRow}>
            {contactParts.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <Text style={s.contactSep}>|</Text>}
                <Text style={s.contactTxt}>{c}</Text>
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* Professional Summary */}
        {we[0] && (
          <View style={s.secGap}>
            <Text style={s.secHeader}>Professional Summary</Text>
            <Text style={s.summary}>
              {`Experienced ${we[0].position} with a proven track record of delivering results at ${we[0].company}. `}
              {skills.length > 0 ? `Skilled in ${skills.slice(0, 3).join(', ')}. ` : ''}
              {'Committed to continuous improvement and driving measurable business impact.'}
            </Text>
          </View>
        )}

        {/* Experience */}
        {we.length > 0 && (
          <View style={s.secGap}>
            <Text style={s.secHeader}>Professional Experience</Text>
            {we.map(exp => (
              <View key={exp.id} style={s.expBlock}>
                <View style={s.expTopRow}>
                  <Text style={s.expPos}>{exp.position}</Text>
                  <Text style={s.expDate}>{dateRange(exp)}</Text>
                </View>
                <Text style={s.expCo}>{exp.company}{p.location ? ` · ${p.location}` : ''}</Text>
                <Bullets text={exp.description} />
              </View>
            ))}
          </View>
        )}

        {/* Education + Languages */}
        <View style={[s.twoCol, s.secGap]}>
          {edu.length > 0 && (
            <View style={s.eduCol}>
              <Text style={s.secHeader}>Education</Text>
              {edu.map(ed => (
                <View key={ed.id} style={s.eduBlock}>
                  <View style={s.eduTopRow}>
                    <Text style={s.eduDeg}>{ed.degree}{ed.field ? `, ${ed.field}` : ''}</Text>
                    <Text style={s.eduDate}>{eduRange(ed)}</Text>
                  </View>
                  <Text style={s.eduSchool}>{ed.school}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={s.langCol}>
            <Text style={s.secHeader}>Languages</Text>
            <Text style={s.langTxt}>English — Native</Text>
            <Text style={s.langTxt}>French — Intermediate</Text>
          </View>
        </View>

        {/* Skills */}
        {(skills.length > 0 || hasCategories) && (
          <View>
            <Text style={s.secHeader}>Skills</Text>
            {hasCategories ? (
              <View>
                {(skillCategories ?? [])
                  .filter((c: SkillCategory) => c.items.length > 0)
                  .map((c: SkillCategory) => (
                    <View key={c.id} style={s.skillCatRow}>
                      <Text style={s.skillCatTxt}>
                        <Text style={s.skillCatName}>{c.name}: </Text>
                        {c.items.join(', ')}
                      </Text>
                    </View>
                  ))}
              </View>
            ) : (
              <View style={s.skillsWrap}>
                {skills.map((sk, i) => (
                  <View key={i} style={s.skillTag}>
                    <Text style={s.skillTagTxt}>{sk}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

      </Page>
    </Document>
  );
}
