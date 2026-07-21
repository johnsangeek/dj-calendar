import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import crypto from 'node:crypto';
import { adminDb } from '@/lib/firebase-admin';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI;
const TOKEN_SECRET = process.env.GMAIL_TOKEN_SECRET;

function encryptTokens(data: object): string {
  const key = crypto.createHash('sha256').update(TOKEN_SECRET!).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action');

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !REDIRECT_URI) {
    return NextResponse.json(
      { error: 'Configuration manquante', details: { clientId: !!GOOGLE_CLIENT_ID, clientSecret: !!GOOGLE_CLIENT_SECRET, redirectUri: REDIRECT_URI } },
      { status: 500 }
    );
  }

  if (action === 'auth-url') {
    const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI);
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/calendar.events'],
      prompt: 'consent',
      state: searchParams.get('state') || undefined,
    });
    return NextResponse.json({ authUrl });
  }

  return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
}

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();
    if (!code) return NextResponse.json({ error: 'Code manquant' }, { status: 400 });

    const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI);
    const { tokens } = await oauth2Client.getToken(code);

    // Persister les tokens en Firestore (chiffrés) pour accès serveur/bot
    if (TOKEN_SECRET && tokens.refresh_token) {
      await adminDb.collection('calendar_credentials').doc('primary').set({
        encrypted: encryptTokens(tokens),
        updatedAt: new Date(),
      });
    }

    return NextResponse.json({ tokens });
  } catch (error) {
    console.error('Erreur auth Google Calendar:', error);
    return NextResponse.json({ error: 'Erreur lors de l\'authentification' }, { status: 500 });
  }
}
