import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const { filename } = await request.json();

    if (!filename) {
      return NextResponse.json(
        { error: 'Nom de fichier requis' },
        { status: 400 }
      );
    }

    // Chemin vers le script Python d'enrichissement
    const scriptPath = path.join(
      process.cwd(),
      '..',
      'GOOGLE MAP SCRAPPER',
      'enrichir_leads.py'
    );

    const workingDir = path.join(process.cwd(), '..', 'GOOGLE MAP SCRAPPER');

    console.log('Lancement de l\'enrichissement pour:', filename);

    // Lancer le script Python (timeout de 20 minutes car enrichissement plus long)
    const { stdout, stderr } = await execAsync(
      `python3 "${scriptPath}"`,
      {
        cwd: workingDir,
        timeout: 1200000, // 20 minutes
        env: {
          ...process.env,
          INPUT_FILE: filename,
        },
      }
    );

    console.log('Enrichissement stdout:', stdout);
    if (stderr) console.error('Enrichissement stderr:', stderr);

    // Extraire les stats depuis le stdout
    const enrichedMatch = stdout.match(/(\d+) prospects trouvés/);
    const qualifiedMatch = stdout.match(/(\d+) prospects avec au moins un moyen de contact/);

    const enriched = enrichedMatch ? parseInt(enrichedMatch[1]) : 0;
    const qualified = qualifiedMatch ? parseInt(qualifiedMatch[1]) : 0;

    // Le fichier généré est dj_leads_APP_READY.csv
    const outputFilename = 'dj_leads_APP_READY.csv';

    return NextResponse.json({
      success: true,
      filename: outputFilename,
      enriched,
      qualified,
      message: `${qualified} prospects qualifiés sur ${enriched} enrichis`,
    });

  } catch (error) {
    console.error('Erreur enrichissement:', error);
    return NextResponse.json(
      {
        error: 'Erreur lors de l\'enrichissement',
        details: error instanceof Error ? error.message : 'Erreur inconnue',
      },
      { status: 500 }
    );
  }
}
