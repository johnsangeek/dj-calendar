import { NextRequest, NextResponse } from 'next/server';
import { gmailService } from '@/lib/gmail';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface SendPayload {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  threadId?: string;
  replyTo?: string[];
  clientId?: string;
  templateId?: string;
}

function normalizeList(values?: string[]) {
  return (values || []).map(value => value.trim()).filter(Boolean);
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as SendPayload;
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

    const response = await gmailService.sendMessage({
      to,
      cc: normalizeList(payload.cc),
      bcc: normalizeList(payload.bcc),
      subject: payload.subject,
      body: {
        html: payload.bodyHtml,
        text: payload.bodyText,
      },
      threadId: payload.threadId,
      replyTo: normalizeList(payload.replyTo),
    });

    if (payload.clientId) {
      await addDoc(collection(db, 'crm_logs'), {
        clientId: payload.clientId,
        channel: 'email',
        sentAt: serverTimestamp(),
        threadId: response.threadId,
        messageId: response.id,
        subject: payload.subject,
        to,
        cc: normalizeList(payload.cc),
        templateId: payload.templateId || null,
      });
    }

    return NextResponse.json({ success: true, messageId: response.id, threadId: response.threadId });
  } catch (error) {
    console.error('Erreur envoi Gmail', error);

    // Extraire un message d'erreur plus détaillé
    let errorMessage = 'Erreur interne Gmail';
    if (error instanceof Error) {
      if (error.message.includes('token')) {
        errorMessage = 'Token Gmail expiré ou invalide. Veuillez vous reconnecter à Gmail dans les paramètres.';
      } else if (error.message.includes('quota')) {
        errorMessage = 'Quota Gmail dépassé. Réessayez dans quelques minutes.';
      } else if (error.message.includes('invalid_grant')) {
        errorMessage = 'Autorisation Gmail révoquée. Veuillez vous reconnecter à Gmail dans les paramètres.';
      } else if (error.message.includes('Aucun token')) {
        errorMessage = 'Gmail non connecté. Veuillez vous connecter à Gmail dans les paramètres.';
      } else {
        errorMessage = `Erreur Gmail: ${error.message}`;
      }
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
