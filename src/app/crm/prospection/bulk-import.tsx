'use client';

import { useState } from 'react';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Upload, Download, X, Check, AlertCircle } from 'lucide-react';

interface CSVProspect {
  name: string;
  instagramHandle?: string;
  instagramUrl?: string;
  igMeUrl?: string;
  threadId?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  facebook?: string;
  website?: string;
  rating?: string;
  reviewCount?: string;
  category?: string;
  googleMapsUrl?: string;
  city?: string;
}

interface ImportResult {
  success: number;
  skipped: number;
  errors: string[];
}

export default function BulkImportModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [preview, setPreview] = useState<CSVProspect[]>([]);

  const downloadTemplate = () => {
    const template = `name,instagramHandle,instagramUrl,igMeUrl,threadId,email,phone,address,notes
Le Zèbre,zebreevents,https://instagram.com/zebreevents,https://ig.me/m/zebreevents,110841490316401,contact@zebre.com,0601020304,Paris 75001,Super club parisien
MyBeers,mybeers_official,https://instagram.com/mybeers_official,https://ig.me/m/mybeers_official,,info@mybeers.fr,0612345678,Lyon 69001,Bar à bières artisanales`;

    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template-import-prospects.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const extractInstagramHandle = (value: string): string => {
    // Extraire le handle depuis différents formats:
    // - @username
    // - https://instagram.com/username
    // - https://www.instagram.com/username
    // - username
    if (!value) return '';

    const instagramMatch = value.match(/instagram\.com\/([a-zA-Z0-9._]+)/);
    if (instagramMatch) return instagramMatch[1];

    return value.replace('@', '').trim();
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Guillemet échappé ("")
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote mode
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // Fin de champ
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  };

  const parseCSV = (text: string): CSVProspect[] => {
    // Supprimer le BOM UTF-8 si présent
    text = text.replace(/^\uFEFF/, '');

    const lines: string[] = [];
    let currentLine = '';
    let inQuotes = false;

    // Parser les lignes en gérant les retours à la ligne dans les champs entre guillemets
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentLine += '""';
          i++;
        } else {
          inQuotes = !inQuotes;
          currentLine += char;
        }
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (currentLine.trim()) {
          lines.push(currentLine);
        }
        currentLine = '';
        // Skip \r\n
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
      } else {
        currentLine += char;
      }
    }

    // Ajouter la dernière ligne
    if (currentLine.trim()) {
      lines.push(currentLine);
    }

    if (lines.length < 2) return [];

    const headers = parseCSVLine(lines[0]);
    const prospects: CSVProspect[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const prospect: CSVProspect = { name: '' };

      headers.forEach((header, index) => {
        let value = values[index] || '';
        // Retirer les guillemets de début et fin
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        // Remplacer les guillemets échappés
        value = value.replace(/""/g, '"').trim();

        if (!value) return;

        // Support pour le format original (anglais)
        switch (header) {
          case 'name':
            prospect.name = value;
            break;
          case 'instagramHandle':
            prospect.instagramHandle = extractInstagramHandle(value);
            break;
          case 'instagramUrl':
            prospect.instagramUrl = value;
            break;
          case 'igMeUrl':
            prospect.igMeUrl = value;
            break;
          case 'threadId':
            prospect.threadId = value;
            break;
          case 'email':
            prospect.email = value;
            break;
          case 'phone':
            prospect.phone = value;
            break;
          case 'address':
            prospect.address = value;
            break;
          case 'notes':
            prospect.notes = value;
            break;
        }

        // Support pour le format Google Places API (français)
        switch (header) {
          case 'Nom':
            prospect.name = value;
            break;
          case 'Ville_Recherche':
            prospect.city = value;
            break;
          case 'Téléphone':
            prospect.phone = value;
            break;
          case 'Email':
            prospect.email = value;
            break;
          case 'Instagram':
          case 'Recherche_Instagram':
            if (value && !prospect.instagramHandle) {
              const handle = extractInstagramHandle(value);
              if (handle) {
                prospect.instagramHandle = handle;
                prospect.instagramUrl = `https://instagram.com/${handle}`;
              }
            }
            break;
          case 'Facebook':
          case 'Recherche_Facebook':
            prospect.facebook = value;
            break;
          case 'Site_Web':
            prospect.website = value;
            break;
          case 'Adresse':
            prospect.address = value;
            break;
          case 'Note':
            prospect.rating = value;
            break;
          case 'Nb_Avis':
            prospect.reviewCount = value;
            break;
          case 'Catégorie_Recherche':
            prospect.category = value;
            break;
          case 'URL_Google_Maps':
            prospect.googleMapsUrl = value;
            break;
        }
      });

      if (prospect.name) {
        prospects.push(prospect);
      }
    }

    return prospects;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    const text = await file.text();
    const prospects = parseCSV(text);
    setPreview(prospects.slice(0, 5)); // Afficher les 5 premiers pour preview
  };

  const extractThreadIdFromIgMe = (igMeUrl: string): string | null => {
    // Format: https://ig.me/m/zebreevents ou https://ig.me/m/1/ABC123
    const match = igMeUrl.match(/ig\.me\/m\/([a-zA-Z0-9_]+)/);
    return match ? match[1] : null;
  };

  const handleImport = async () => {
    if (!csvFile) return;

    setImporting(true);
    const text = await csvFile.text();
    const prospects = parseCSV(text);

    const result: ImportResult = {
      success: 0,
      skipped: 0,
      errors: []
    };

    for (const prospect of prospects) {
      try {
        // Vérifier si le prospect existe déjà
        let existingQuery = null;

        if (prospect.instagramHandle) {
          existingQuery = query(
            collection(db, 'prospects'),
            where('instagramHandle', '==', prospect.instagramHandle)
          );
        } else if (prospect.threadId) {
          existingQuery = query(
            collection(db, 'prospects'),
            where('instagramThreadId', '==', prospect.threadId)
          );
        } else if (prospect.email) {
          existingQuery = query(
            collection(db, 'prospects'),
            where('email', '==', prospect.email)
          );
        }

        if (existingQuery) {
          const existingSnap = await getDocs(existingQuery);
          if (!existingSnap.empty) {
            result.skipped++;
            continue;
          }
        }

        // Extraire le Thread ID depuis ig.me si pas fourni
        let threadId = prospect.threadId;
        if (!threadId && prospect.igMeUrl) {
          const extracted = extractThreadIdFromIgMe(prospect.igMeUrl);
          if (extracted && /^\d+$/.test(extracted)) {
            threadId = extracted;
          }
        }

        // Construire les notes avec toutes les infos supplémentaires
        const notesLines: string[] = [];

        if (prospect.igMeUrl) {
          notesLines.push(`ig.me: ${prospect.igMeUrl}`);
        }

        if (prospect.facebook) {
          notesLines.push(`Facebook: ${prospect.facebook}`);
        }

        if (prospect.website) {
          notesLines.push(`Site web: ${prospect.website}`);
        }

        if (prospect.googleMapsUrl) {
          notesLines.push(`Google Maps: ${prospect.googleMapsUrl}`);
        }

        if (prospect.rating) {
          notesLines.push(`Note: ${prospect.rating}${prospect.reviewCount ? ` (${prospect.reviewCount} avis)` : ''}`);
        }

        if (prospect.category) {
          notesLines.push(`Catégorie: ${prospect.category}`);
        }

        if (prospect.city) {
          notesLines.push(`Ville: ${prospect.city}`);
        }

        if (prospect.notes) {
          notesLines.push(`\n${prospect.notes}`);
        }

        // Créer le prospect
        const prospectData: Record<string, unknown> = {
          name: prospect.name,
          instagramHandle: prospect.instagramHandle || null,
          instagramUrl: prospect.instagramUrl || null,
          instagramThreadId: threadId || null,
          email: prospect.email || null,
          phone: prospect.phone || null,
          address: prospect.address || null,
          igStatus: 'NOT_CONTACTED',
          igNotes: notesLines.join('\n').trim(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await addDoc(collection(db, 'prospects'), prospectData);
        result.success++;

      } catch (error) {
        console.error('Erreur import prospect:', error);
        result.errors.push(`${prospect.name}: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
      }
    }

    setResult(result);
    setImporting(false);

    if (result.success > 0) {
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 3000);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Import CSV Prospects</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              <X size={24} />
            </button>
          </div>

          {/* Template download */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 mb-2">Formats CSV supportés</h3>
                <p className="text-sm text-blue-800 mb-2">
                  <strong>Format 1 (Template):</strong> <code className="bg-blue-100 px-1 py-0.5 rounded">name</code>,
                  <code className="bg-blue-100 px-1 py-0.5 rounded ml-1">instagramHandle</code>,
                  <code className="bg-blue-100 px-1 py-0.5 rounded ml-1">email</code>,
                  <code className="bg-blue-100 px-1 py-0.5 rounded ml-1">phone</code>,
                  <code className="bg-blue-100 px-1 py-0.5 rounded ml-1">address</code>, etc.
                </p>
                <p className="text-sm text-blue-800 mb-3">
                  <strong>Format 2 (Google Places API):</strong> <code className="bg-blue-100 px-1 py-0.5 rounded">Nom</code>,
                  <code className="bg-blue-100 px-1 py-0.5 rounded ml-1">Instagram</code>,
                  <code className="bg-blue-100 px-1 py-0.5 rounded ml-1">Email</code>,
                  <code className="bg-blue-100 px-1 py-0.5 rounded ml-1">Téléphone</code>,
                  <code className="bg-blue-100 px-1 py-0.5 rounded ml-1">Facebook</code>,
                  <code className="bg-blue-100 px-1 py-0.5 rounded ml-1">Site_Web</code>, etc.
                </p>
                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  <Download size={16} />
                  Télécharger le template (Format 1)
                </button>
              </div>
            </div>
          </div>

          {/* File upload */}
          {!result && (
            <>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fichier CSV
                </label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none"
                />
              </div>

              {/* Preview */}
              {preview.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    Aperçu ({preview.length} premiers prospects)
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 border">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nom</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Instagram</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">ig.me</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Téléphone</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {preview.map((prospect, index) => (
                          <tr key={index}>
                            <td className="px-4 py-2 text-sm text-gray-900">{prospect.name}</td>
                            <td className="px-4 py-2 text-sm text-gray-600">
                              {prospect.instagramHandle ? `@${prospect.instagramHandle}` : '-'}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600">
                              {prospect.igMeUrl ? '✓' : '-'}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600">{prospect.email || '-'}</td>
                            <td className="px-4 py-2 text-sm text-gray-600">{prospect.phone || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Import button */}
              <div className="flex gap-3">
                <button
                  onClick={handleImport}
                  disabled={!csvFile || importing}
                  className="flex-1 bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {importing ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Import en cours...
                    </>
                  ) : (
                    <>
                      <Upload size={20} />
                      Importer les prospects
                    </>
                  )}
                </button>
                <button
                  onClick={onClose}
                  className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Annuler
                </button>
              </div>
            </>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-green-800">
                  <Check className="w-5 h-5" />
                  <span className="font-semibold">Import terminé !</span>
                </div>
                <div className="mt-2 text-sm text-green-700">
                  <p>✓ {result.success} prospects importés avec succès</p>
                  <p>⊘ {result.skipped} prospects ignorés (doublons)</p>
                  {result.errors.length > 0 && (
                    <p className="text-red-600">✗ {result.errors.length} erreurs</p>
                  )}
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 className="font-semibold text-red-900 mb-2">Erreurs :</h4>
                  <ul className="text-sm text-red-700 space-y-1">
                    {result.errors.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                onClick={onClose}
                className="w-full bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700"
              >
                Fermer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
