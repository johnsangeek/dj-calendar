#!/usr/bin/env node

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

function normalizeForMatch(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function isGenericClientLabel(value) {
  const n = normalizeForMatch(value);
  return n === 'client google calendar' || n === 'importe de google calendar' || n === 'importe google calendar';
}

function scoreAliasCandidate(alias, candidate) {
  if (!alias || !candidate) return 0;
  if (alias === candidate) return 1;
  if (candidate.includes(alias) || alias.includes(candidate)) {
    const ratio = Math.min(alias.length, candidate.length) / Math.max(alias.length, candidate.length);
    return Math.max(0.75, ratio);
  }

  const aliasTokens = alias.split(' ').filter(Boolean);
  const candidateTokens = candidate.split(' ').filter(Boolean);
  if (aliasTokens.length === 0 || candidateTokens.length === 0) return 0;

  let common = 0;
  for (const t of aliasTokens) {
    if (candidateTokens.includes(t)) common++;
  }

  return common / Math.max(aliasTokens.length, candidateTokens.length);
}

function resolveClient(clients, rawCandidates) {
  const candidates = rawCandidates
    .filter((x) => typeof x === 'string' && x.trim().length > 0)
    .map((x) => normalizeForMatch(x));

  if (candidates.length === 0) return null;

  for (const c of candidates) {
    const exact = clients.find((client) => client.aliases.includes(c));
    if (exact) return { client: exact, score: 1, via: c };
  }

  let best = null;
  let bestScore = 0;

  for (const client of clients) {
    for (const alias of client.aliases) {
      for (const candidate of candidates) {
        const score = scoreAliasCandidate(alias, candidate);
        if (score > bestScore) {
          bestScore = score;
          best = { client, score, via: candidate };
        }
      }
    }
  }

  return bestScore >= 0.72 ? best : null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const saPath = path.resolve('firebase-service-account.json');

  if (!fs.existsSync(saPath)) {
    console.error('Service account introuvable:', saPath);
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(saPath, 'utf8'));
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
  }

  const db = admin.firestore();

  const [clientsSnap, bookingsSnap] = await Promise.all([
    db.collection('clients').get(),
    db.collection('bookings').get(),
  ]);

  const clients = clientsSnap.docs.map((d) => {
    const data = d.data() || {};
    const aliases = [data.name, data.professionalName, ...(Array.isArray(data.eventAliases) ? data.eventAliases : [])]
      .filter(Boolean)
      .map((v) => normalizeForMatch(v));

    return {
      id: d.id,
      name: data.name || data.professionalName || d.id,
      aliases: Array.from(new Set(aliases)),
    };
  });

  const bookings = bookingsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((b) => !b.clientId);

  const proposals = [];
  for (const booking of bookings) {
    const notes = String(booking.notes || '');
    const clientLine = notes.match(/Client:\s*(.+)/i)?.[1]?.split('\n')[0]?.trim();

    const match = resolveClient(clients, [
      !isGenericClientLabel(booking.clientName) ? booking.clientName : '',
      !isGenericClientLabel(clientLine) ? clientLine : '',
      booking.title,
      notes,
    ]);

    if (!match) continue;

    const shouldOverwriteClientName = !booking.clientName || isGenericClientLabel(booking.clientName);

    proposals.push({
      bookingId: booking.id,
      bookingTitle: booking.title || '',
      oldClientName: booking.clientName || '',
      newClientId: match.client.id,
      newClientName: match.client.name,
      score: Number(match.score.toFixed(3)),
      shouldOverwriteClientName,
    });
  }

  console.log('\nBackfill bookings clientId');
  console.log('----------------------------------------');
  console.log('bookings sans clientId :', bookings.length);
  console.log('propositions trouvées  :', proposals.length);
  console.log('mode                   :', apply ? 'APPLY' : 'DRY-RUN');

  if (proposals.length > 0) {
    console.log('\nAperçu (30 max):');
    for (const p of proposals.slice(0, 30)) {
      console.log(`- ${p.bookingId} | ${p.bookingTitle} | ${p.oldClientName} -> ${p.newClientName} (${p.score})`);
    }
  }

  if (!apply || proposals.length === 0) {
    return;
  }

  let updated = 0;
  for (const p of proposals) {
    const payload = {
      clientId: p.newClientId,
      updatedAt: new Date(),
    };
    if (p.shouldOverwriteClientName) {
      payload.clientName = p.newClientName;
    }
    await db.collection('bookings').doc(p.bookingId).update(payload);
    updated++;
  }

  console.log('\nMise à jour terminée. Bookings corrigés :', updated);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
