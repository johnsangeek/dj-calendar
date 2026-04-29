import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

export async function POST(request: NextRequest) {
  try {
    const { html, filename, exportDir } = await request.json();

    if (!html || !filename) {
      return NextResponse.json({ error: 'html and filename are required' }, { status: 400 });
    }

    // Générer le PDF avec Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    await browser.close();

    // Si un dossier d'export est configuré, sauvegarder le fichier
    if (exportDir) {
      // S'assurer que le dossier existe
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
      }

      const safeFilename = filename.replace(/[/\\?%*:|"<>]/g, '-');
      const filePath = path.join(exportDir, safeFilename);
      fs.writeFileSync(filePath, pdfBuffer);

      return NextResponse.json({
        success: true,
        filePath,
        message: `PDF sauvegardé dans ${filePath}`,
      });
    }

    // Sinon, retourner le PDF en téléchargement
    return new NextResponse(Buffer.from(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Erreur export PDF:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la génération du PDF', details: String(error) },
      { status: 500 }
    );
  }
}
