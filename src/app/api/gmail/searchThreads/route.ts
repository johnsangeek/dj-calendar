import { NextRequest, NextResponse } from 'next/server';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { gmailService } from '@/lib/gmail';

function normalizeEmail(value: string | undefined | null): string | null {
  if (!value) return null;
  return value.trim().toLowerCase();
}

export async function GET(request: NextRequest) {
  try {
    const clientId = request.nextUrl.searchParams.get('clientId');
    const pageToken = request.nextUrl.searchParams.get('pageToken') || undefined;

    if (!clientId) {
      return NextResponse.json({ error: 'clientId requis' }, { status: 400 });
    }

    const clientRef = doc(db, 'clients', clientId);
    const snapshot = await getDoc(clientRef);

    if (!snapshot.exists()) {
      return NextResponse.json({ error: 'Client introuvable' }, { status: 404 });
    }

    const data = snapshot.data();
    const emails = new Set<string>();

    const primary = normalizeEmail((data.primaryEmail as string) || (data.email as string));
    if (primary) emails.add(primary);

    const altEmails = Array.isArray(data.altEmails) ? data.altEmails : [];
    altEmails.forEach((value: unknown) => {
      if (typeof value === 'string') {
        const normalized = normalizeEmail(value);
        if (normalized) emails.add(normalized);
      }
    });

    const normalizedEmails = Array.from(emails);
    if (normalizedEmails.length === 0) {
      return NextResponse.json({ threads: [], nextPageToken: undefined });
    }

    const { threads, nextPageToken } = await gmailService.searchThreads(normalizedEmails, pageToken);
    return NextResponse.json({ threads, nextPageToken });
  } catch (error) {
    console.error('Erreur recherche threads Gmail', error);
    return NextResponse.json({ error: 'Erreur interne Gmail' }, { status: 500 });
  }
}
