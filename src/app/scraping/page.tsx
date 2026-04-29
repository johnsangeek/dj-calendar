'use client';

import { useState } from 'react';
import { TopNav } from '@/components/TopNav';
import { Play, Loader2, CheckCircle, XCircle, Download, Upload } from 'lucide-react';

type ScrapingStatus = 'idle' | 'running' | 'enriching' | 'completed' | 'error';

interface ScrapingLog {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

export default function ScrapingPage() {
  const [secteurs, setSecteurs] = useState(['Marseille', 'Aix-en-Provence', 'Salon-de-Provence']);
  const [motsCles, setMotsCles] = useState(['Discothèque', 'Beach Club', 'Bar ambiance', 'Boîte de nuit']);
  const [newSecteur, setNewSecteur] = useState('');
  const [newMotCle, setNewMotCle] = useState('');
  const [maxResults, setMaxResults] = useState(50);
  const [status, setStatus] = useState<ScrapingStatus>('idle');
  const [logs, setLogs] = useState<ScrapingLog[]>([]);
  const [stats, setStats] = useState({
    scraped: 0,
    enriched: 0,
    qualified: 0,
  });
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const timestamp = new Date().toLocaleTimeString('fr-FR');
    setLogs(prev => [...prev, { timestamp, message, type }]);
  };

  const addSecteur = () => {
    if (newSecteur.trim() && !secteurs.includes(newSecteur.trim())) {
      setSecteurs([...secteurs, newSecteur.trim()]);
      setNewSecteur('');
    }
  };

  const removeSecteur = (index: number) => {
    setSecteurs(secteurs.filter((_, i) => i !== index));
  };

  const addMotCle = () => {
    if (newMotCle.trim() && !motsCles.includes(newMotCle.trim())) {
      setMotsCles([...motsCles, newMotCle.trim()]);
      setNewMotCle('');
    }
  };

  const removeMotCle = (index: number) => {
    setMotsCles(motsCles.filter((_, i) => i !== index));
  };

  const stopScraping = () => {
    if (abortController) {
      abortController.abort();
      addLog('⚠️ Scraping arrêté par l\'utilisateur', 'error');
      setStatus('error');
      setAbortController(null);
    }
  };

  const startScraping = async () => {
    if (secteurs.length === 0 || motsCles.length === 0) {
      alert('Veuillez ajouter au moins un secteur et un mot-clé');
      return;
    }

    setStatus('running');
    setLogs([]);
    setStats({ scraped: 0, enriched: 0, qualified: 0 });

    const controller = new AbortController();
    setAbortController(controller);

    addLog('🚀 Démarrage du scraping Google Maps...', 'info');
    addLog(`📊 Limite: ${maxResults} résultats par recherche`, 'info');

    try {
      // Étape 1: Scraping Google Maps
      const scrapeRes = await fetch('/api/scrape/google-maps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secteurs, motsCles, maxResults }),
        signal: controller.signal,
      });

      const scrapeData = await scrapeRes.json();

      if (!scrapeRes.ok) {
        // Afficher les détails de l'erreur
        const errorMsg = scrapeData.details || 'Erreur inconnue';
        addLog(`❌ ${errorMsg}`, 'error');
        if (scrapeData.stderr) {
          addLog(`Stderr: ${scrapeData.stderr}`, 'error');
        }
        throw new Error(errorMsg);
      }
      setStats(prev => ({ ...prev, scraped: scrapeData.count }));
      addLog(`✅ Scraping terminé: ${scrapeData.count} établissements trouvés`, 'success');

      // Étape 2: Enrichissement
      setStatus('enriching');
      addLog('🔍 Enrichissement des données en cours...', 'info');

      const enrichRes = await fetch('/api/scrape/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: scrapeData.filename }),
        signal: controller.signal,
      });

      if (!enrichRes.ok) throw new Error('Erreur lors de l\'enrichissement');

      const enrichData = await enrichRes.json();
      setStats(prev => ({
        ...prev,
        enriched: enrichData.enriched,
        qualified: enrichData.qualified
      }));
      addLog(`✅ Enrichissement terminé: ${enrichData.qualified} prospects qualifiés`, 'success');

      // Étape 3: Import dans Firebase
      addLog('📥 Import automatique dans Firebase...', 'info');

      const importRes = await fetch('/api/scrape/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: enrichData.filename }),
        signal: controller.signal,
      });

      if (!importRes.ok) throw new Error('Erreur lors de l\'import');

      const importData = await importRes.json();
      addLog(`✅ Import terminé: ${importData.imported} prospects ajoutés`, 'success');

      setStatus('completed');
      setAbortController(null);

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // L'utilisateur a annulé
        return;
      }
      console.error('Erreur scraping:', error);
      addLog(`❌ Erreur: ${error instanceof Error ? error.message : 'Erreur inconnue'}`, 'error');
      setStatus('error');
      setAbortController(null);
    }
  };

  const exportCSV = async () => {
    try {
      addLog('📦 Export CSV en cours...', 'info');

      const res = await fetch('/api/scrape/export-csv', {
        method: 'POST',
      });

      if (!res.ok) throw new Error('Erreur lors de l\'export');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dj_leads_export_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);

      addLog('✅ CSV exporté avec succès', 'success');
    } catch (error) {
      console.error('Erreur export:', error);
      addLog('❌ Erreur lors de l\'export CSV', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <TopNav />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Scraping Google Maps</h1>
          <p className="text-gray-600 mt-1">Automatisez la recherche de prospects avec enrichissement des données</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Configuration */}
          <div className="lg:col-span-2 space-y-6">
            {/* Secteurs */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Secteurs géographiques</h2>

              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newSecteur}
                  onChange={(e) => setNewSecteur(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addSecteur()}
                  placeholder="Ex: Marseille, Aix-en-Provence..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <button
                  onClick={addSecteur}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Ajouter
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {secteurs.map((secteur, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium"
                  >
                    {secteur}
                    <button
                      onClick={() => removeSecteur(index)}
                      className="text-purple-500 hover:text-purple-700"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Limite de résultats */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Limite de résultats</h2>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Nombre max par recherche</span>
                  <span className="text-2xl font-bold text-purple-600">{maxResults}</span>
                </div>

                <input
                  type="range"
                  min="10"
                  max="500"
                  step="10"
                  value={maxResults}
                  onChange={(e) => setMaxResults(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                  disabled={status === 'running' || status === 'enriching'}
                />

                <div className="flex justify-between text-xs text-gray-500">
                  <span>10 (Test rapide)</span>
                  <span>250</span>
                  <span>500 (Complet)</span>
                </div>
              </div>
            </div>

            {/* Mots-clés */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Mots-clés de recherche</h2>

              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newMotCle}
                  onChange={(e) => setNewMotCle(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addMotCle()}
                  placeholder="Ex: Discothèque, Beach Club..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <button
                  onClick={addMotCle}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Ajouter
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {motsCles.map((motCle, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium"
                  >
                    {motCle}
                    <button
                      onClick={() => removeMotCle(index)}
                      className="text-blue-500 hover:text-blue-700"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Logs */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Console</h2>

              <div className="bg-gray-900 rounded-lg p-4 h-64 overflow-y-auto font-mono text-sm">
                {logs.length === 0 ? (
                  <p className="text-gray-500">En attente de démarrage...</p>
                ) : (
                  logs.map((log, index) => (
                    <div
                      key={index}
                      className={`mb-1 ${
                        log.type === 'error' ? 'text-red-400' :
                        log.type === 'success' ? 'text-green-400' :
                        'text-gray-300'
                      }`}
                    >
                      <span className="text-gray-500">[{log.timestamp}]</span> {log.message}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Actions & Stats */}
          <div className="space-y-6">
            {/* Actions */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Actions</h2>

              <div className="space-y-3">
                {status === 'running' || status === 'enriching' ? (
                  <button
                    onClick={stopScraping}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors font-medium"
                  >
                    <XCircle className="w-5 h-5" />
                    Arrêter le scraping
                  </button>
                ) : (
                  <button
                    onClick={startScraping}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors font-medium"
                  >
                    <Play className="w-5 h-5" />
                    Lancer le scraping
                  </button>
                )}

                <button
                  onClick={exportCSV}
                  disabled={status !== 'completed'}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-5 h-5" />
                  Exporter le CSV
                </button>
              </div>
            </div>

            {/* Statistiques */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Statistiques</h2>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-gray-600">Scrapés</span>
                    <span className="text-2xl font-bold text-purple-600">{stats.scraped}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-purple-600 h-2 rounded-full transition-all"
                      style={{ width: status === 'idle' ? '0%' : '100%' }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-gray-600">Enrichis</span>
                    <span className="text-2xl font-bold text-blue-600">{stats.enriched}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{
                        width: stats.scraped > 0 ? `${(stats.enriched / stats.scraped) * 100}%` : '0%'
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-gray-600">Qualifiés</span>
                    <span className="text-2xl font-bold text-green-600">{stats.qualified}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full transition-all"
                      style={{
                        width: stats.enriched > 0 ? `${(stats.qualified / stats.enriched) * 100}%` : '0%'
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Status */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Statut</h2>

              <div className="flex items-center gap-3">
                {status === 'idle' && (
                  <>
                    <div className="w-3 h-3 bg-gray-400 rounded-full" />
                    <span className="text-gray-600">En attente</span>
                  </>
                )}
                {status === 'running' && (
                  <>
                    <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />
                    <span className="text-purple-600 font-medium">Scraping en cours...</span>
                  </>
                )}
                {status === 'enriching' && (
                  <>
                    <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                    <span className="text-blue-600 font-medium">Enrichissement...</span>
                  </>
                )}
                {status === 'completed' && (
                  <>
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="text-green-600 font-medium">Terminé avec succès</span>
                  </>
                )}
                {status === 'error' && (
                  <>
                    <XCircle className="w-5 h-5 text-red-600" />
                    <span className="text-red-600 font-medium">Erreur</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
