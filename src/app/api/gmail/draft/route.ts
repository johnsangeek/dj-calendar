import { NextRequest, NextResponse } from 'next/server';
import { gmailService } from '@/lib/gmail';

interface DraftPayload {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  threadId?: string;
  replyTo?: string[];
  attachment?: {
    filename: string;
    mimeType: string;
    data: string; // base64
  };
}

function normalizeList(values?: string[]) {
  return (values || []).map(value => value.trim()).filter(Boolean);
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as DraftPayload;
    const to = normalizeList(payload.to);

    if (!to.length) {
      return NextResponse.json({ error: 'Destinataire requis' }, { status: 400 });
    }

    if (!payload.subject) {
      return NextResponse.json({ error: 'Sujet requis' }, { status: 400 });
    }

    if (!payload.bodyHtml && !payload.bodyText) {
      return NextResponse.json({ error: 'Contenu requis' }, { status: 400 });
    }

    const response = await gmailService.createDraftWithAttachment({
      to,
      cc: normalizeList(payload.cc),
      bcc: normalizeList(payload.bcc),
      subject: payload.subject,
      body: {
        html: payload.bodyHtml,
        text: payload.bodyText,
      },
      attachment: payload.attachment,
      threadId: payload.threadId,
      replyTo: normalizeList(payload.replyTo),
    });

    return NextResponse.json({
      success: true,
      draftId: response.id,
      messageId: response.message?.id,
    });
  } catch (error) {
    console.error('Erreur création brouillon Gmail', error);
    return NextResponse.json({ error: 'Erreur interne Gmail' }, { status: 500 });
  }
}
