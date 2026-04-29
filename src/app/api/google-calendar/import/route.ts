import { NextRequest, NextResponse } from 'next/server';
import { importGoogleCalendarEvents } from '@/lib/google-import';

export async function POST(request: NextRequest) {
  const requestId = `sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    const { tokens, startDate, endDate, calendarId, filters, strictMirror } = await request.json();
    console.info(`[GoogleImport:${requestId}] Request received`, {
      calendarId: calendarId || 'primary',
      hasStartDate: Boolean(startDate),
      hasEndDate: Boolean(endDate),
      filters,
      strictMirror: Boolean(strictMirror),
      tokenExpiry: (tokens as { expiry_date?: number })?.expiry_date || null,
    });

    if (!tokens) {
      return NextResponse.json({ error: 'Tokens manquants', requestId }, { status: 400 });
    }
    const result = await importGoogleCalendarEvents({
      tokens,
      calendarId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      filters,
      strictMirror: Boolean(strictMirror),
    });

    return NextResponse.json({
      success: true,
      imported: result.imported,
      updated: result.updated,
      deleted: result.deleted,
      skipped: result.skipped,
      details: {
        importedEvents: result.importedEvents,
        updatedEvents: result.updatedEvents,
        deletedEvents: result.deletedEvents,
        skippedEvents: result.skippedEvents,
        calendarErrors: result.calendarErrors,
        skipReasons: result.skipReasons,
      },
      requestId,
      debug: {
        logs: result.logs.slice(-300),
      },
    });
  } catch (error) {
    console.error(`[GoogleImport:${requestId}] Erreur lors de l'importation:`, error);
    return NextResponse.json(
      {
        error: 'Erreur lors de l\'importation',
        details: error instanceof Error ? error.message : 'Erreur inconnue',
        stack: error instanceof Error ? error.stack : undefined,
        requestId,
      },
      { status: 500 }
    );
  }
}
