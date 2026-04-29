import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const { secteurs, motsCles, maxResults = 50 } = await request.json();

    if (!secteurs || !motsCles || secteurs.length === 0 || motsCles.length === 0) {
      return NextResponse.json(
        { error: 'Secteurs et mots-clés requis' },
        { status: 400 }
      );
    }

    // Chemin vers le script Python API (plus rapide et fiable)
    const scriptPath = path.join(
      process.cwd(),
      '..',
      'GOOGLE MAP SCRAPPER',
      'dj_lead_hunter_api.py'
    );

    // Créer un fichier de config temporaire
    const config = {
      SECTEURS: secteurs,
      MOTS_CLES: motsCles,
    };

    // Lancer le script Python avec les paramètres
    const command = `python3 "${scriptPath}"`;

    console.log('Lancement du scraping:', command);
    console.log('Config:', config);

    // Exécuter le script (timeout de 10 minutes)
    const { stdout, stderr } = await execAsync(command, {
      cwd: path.join(process.cwd(), '..', 'GOOGLE MAP SCRAPPER'),
      timeout: 600000, // 10 minutes
      env: {
        ...process.env,
        SCRAPING_SECTEURS: JSON.stringify(secteurs),
        SCRAPING_MOTS_CLES: JSON.stringify(motsCles),
        SCRAPING_MAX_RESULTS: maxResults.toString(),
      },
    });

    console.log('Scraping stdout:', stdout);
    if (stderr) console.error('Scraping stderr:', stderr);

    // Extraire le nom du fichier généré depuis le stdout
    const filenameMatch = stdout.match(/dj_leads_\d{8}_\d{6}\.csv/);
    const filename = filenameMatch ? filenameMatch[0] : null;

    if (!filename) {
      throw new Error('Impossible de trouver le fichier généré');
    }

    // Compter le nombre de lignes (approximation du nombre de prospects)
    const { stdout: wcOutput } = await execAsync(
      `wc -l "${path.join(process.cwd(), '..', 'GOOGLE MAP SCRAPPER', filename)}"`
    );
    const count = parseInt(wcOutput.trim().split(' ')[0]) - 1; // -1 pour le header

    return NextResponse.json({
      success: true,
      filename,
      count,
      message: `${count} établissements trouvés`,
    });

  } catch (error) {
    console.error('Erreur scraping:', error);

    // Log plus de détails
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }

    return NextResponse.json(
      {
        error: 'Erreur lors du scraping',
        details: error instanceof Error ? error.message : 'Erreur inconnue',
        stdout: error && typeof error === 'object' && 'stdout' in error ? (error as any).stdout : undefined,
        stderr: error && typeof error === 'object' && 'stderr' in error ? (error as any).stderr : undefined,
      },
      { status: 500 }
    );
  }
}
