import { NextRequest, NextResponse } from 'next/server';
import { importGoogleCalendarEvents } from '@/lib/google-import';

export async function POST(request: NextRequest) {
  try {
    const { tokens, startDate, endDate, calendarId, filters } = await request.json();

    if (!tokens) {
      return NextResponse.json({ error: 'Tokens manquants' }, { status: 400 });
    }
    const result = await importGoogleCalendarEvents({
      tokens,
      calendarId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      filters,
    });

    return NextResponse.json({
      success: true,
      imported: result.imported,
      skipped: result.skipped,
      details: {
        importedEvents: result.importedEvents,
        skippedEvents: result.skippedEvents,
      },
    });
  } catch (error) {
    console.error('Erreur lors de l\'importation:', error);
    return NextResponse.json(
      { error: 'Erreur lors de l\'importation', details: error instanceof Error ? error.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}
