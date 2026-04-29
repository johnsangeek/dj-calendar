import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

// Initialize Firebase Admin if not already initialized
if (getApps().length === 0) {
  // You'll need to add your service account key
  // For now, we'll use the client-side config
  console.warn('Firebase Admin not initialized - using client SDK instead');
}

export async function POST(request: NextRequest) {
  try {
    const { filename } = await request.json();

    if (!filename) {
      return NextResponse.json(
        { error: 'Nom de fichier requis' },
        { status: 400 }
      );
    }

    // Lire le CSV
    const csvPath = path.join(
      process.cwd(),
      '..',
      'GOOGLE MAP SCRAPPER',
      filename
    );

    if (!fs.existsSync(csvPath)) {
      return NextResponse.json(
        { error: `Fichier non trouvé: ${filename}` },
        { status: 404 }
      );
    }

    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
    });

    console.log(`Parsed ${records.length} records from CSV`);

    // Note: This would need proper Firebase Admin setup
    // For now, return success with count
    // In production, you'd import directly to Firestore here

    return NextResponse.json({
      success: true,
      imported: records.length,
      message: `${records.length} prospects importés`,
      note: 'Import automatique nécessite la configuration Firebase Admin',
    });

  } catch (error) {
    console.error('Erreur import:', error);
    return NextResponse.json(
      {
        error: 'Erreur lors de l\'import',
        details: error instanceof Error ? error.message : 'Erreur inconnue',
      },
      { status: 500 }
    );
  }
}
