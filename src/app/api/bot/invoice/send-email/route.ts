import { NextRequest, NextResponse } from 'next/server';
import { sendInvoiceEmail } from '@/lib/send-invoice-email';

export const runtime = 'nodejs';
export const maxDuration = 30;

const BOT_API_SECRET = process.env.BOT_API_SECRET;

// Generates the PDF for an existing invoice and emails it to the client via Gmail, with a
// polite ready-made message. Triggered from the Telegram bot after the DJ confirms.
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('x-bot-secret');
    if (!BOT_API_SECRET || authHeader !== BOT_API_SECRET) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { invoiceId, number } = await request.json();
    const { messageId, sentTo } = await sendInvoiceEmail({ invoiceId, number });

    return NextResponse.json({ success: true, messageId, sentTo });
  } catch (error) {
    console.error('Erreur envoi email facture bot:', error);
    return NextResponse.json({ error: "Erreur lors de l'envoi de l'email", details: String(error) }, { status: 500 });
  }
}
