import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST() {
  try {
    // Chercher le fichier APP_READY le plus récent
    const scrapingDir = path.join(process.cwd(), '..', 'GOOGLE MAP SCRAPPER');
    const filename = 'dj_leads_APP_READY.csv';
    const filePath = path.join(scrapingDir, filename);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: 'Aucun fichier CSV disponible' },
        { status: 404 }
      );
    }

    // Lire le fichier
    const fileContent = fs.readFileSync(filePath);

    // Retourner le CSV
    return new NextResponse(fileContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error) {
    console.error('Erreur export CSV:', error);
    return NextResponse.json(
      {
        error: 'Erreur lors de l\'export',
        details: error instanceof Error ? error.message : 'Erreur inconnue',
      },
      { status: 500 }
    );
  }
}
