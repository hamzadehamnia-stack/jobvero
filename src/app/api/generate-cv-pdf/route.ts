import React from 'react';
import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import type { CVFormData } from '@/components/cv-builder/types';
import {
  ParisPDF, BordeauxPDF, AmericanPDF, NewYorkPDF, LondonPDF,
} from '@/components/cv-builder/pdf';

function getPDFElement(templateId: string, data: CVFormData): React.ReactElement | null {
  switch (templateId) {
    case 'paris-elegant':      return React.createElement(ParisPDF,        { data });
    case 'bordeaux-classique': return React.createElement(BordeauxPDF,     { data });
    case 'american-classic':   return React.createElement(AmericanPDF,     { data });
    case 'new-york-modern':    return React.createElement(NewYorkPDF,      { data });
    case 'london-executive':   return React.createElement(LondonPDF,       { data });
    default: return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { templateId, userData, filename } = body as {
      templateId?: string;
      userData?: CVFormData;
      filename?: string;
    };

    if (!templateId || !userData) {
      return NextResponse.json(
        { error: 'Provide templateId and userData' },
        { status: 400 },
      );
    }

    const element = getPDFElement(templateId, userData);
    if (!element) {
      return NextResponse.json(
        { error: `Unknown template: ${templateId}` },
        { status: 400 },
      );
    }

    const pdfBuffer = await renderToBuffer(element);
    const safeName = ((filename ?? 'cv') + '.pdf')
      .replace(/[^a-z0-9-_.]/gi, '-')
      .toLowerCase();

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${safeName}"`,
        'Content-Length':      String(pdfBuffer.byteLength),
      },
    });
  } catch (err) {
    console.error('CV PDF generation error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'PDF generation failed' },
      { status: 500 },
    );
  }
}
