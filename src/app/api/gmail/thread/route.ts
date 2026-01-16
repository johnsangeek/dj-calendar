import { NextRequest, NextResponse } from 'next/server';
import { gmailService } from '@/lib/gmail';

export async function GET(request: NextRequest) {
  try {
    const threadId = request.nextUrl.searchParams.get('threadId');
    if (!threadId) {
      return NextResponse.json({ error: 'threadId requis' }, { status: 400 });
    }

    const messages = await gmailService.getThread(threadId);
    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Erreur récupération thread Gmail', error);
    return NextResponse.json({ error: 'Erreur interne Gmail' }, { status: 500 });
  }
}
