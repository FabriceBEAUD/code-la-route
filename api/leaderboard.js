// API Leaderboard — Upstash Redis REST API
// Variables requises : KV_REST_API_URL + KV_REST_API_TOKEN

const KEY = 'leaderboard_famille';

async function upstash(url, token, command) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  return res.json();
}

async function kvGet(url, token) {
  const res = await upstash(url, token, ['GET', KEY]);
  if (res.result == null) return {};
  // Upstash peut retourner un objet déjà parsé OU une string (parfois double-encodée)
  let val = res.result;
  if (typeof val === 'object') return val;                          // déjà un objet
  try { val = JSON.parse(val); } catch { return {}; }              // 1er parse
  if (typeof val === 'string') { try { val = JSON.parse(val); } catch { return {}; } } // 2ème si toujours string
  return typeof val === 'object' ? val : {};
}

async function kvSet(url, token, data) {
  // Stocker en tant que chaîne JSON simple
  await upstash(url, token, ['SET', KEY, JSON.stringify(data)]);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url   = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    return res.status(503).json({ error: 'KV non configuré.' });
  }

  // ── GET : classement complet ──
  if (req.method === 'GET') {
    // ?reset=true : vider toutes les données (admin)
    if (req.query?.reset === 'true') {
      await upstash(url, token, ['DEL', KEY]);
      return res.status(200).json({ ok: true, message: 'Classement réinitialisé.' });
    }
    try {
      const raw  = await kvGet(url, token);
      // Filtrer les entrées sans nom valide
      const data = Object.fromEntries(
        Object.entries(raw).filter(([, v]) => v && v.nom && v.nom !== 'undefined' && v.nom !== 'null')
      );
      return res.status(200).json(data);
    } catch (e) {
      return res.status(500).json({ error: `Lecture échouée: ${e.message}` });
    }
  }

  // ── POST : soumettre un score ──
  if (req.method === 'POST') {
    // Lire le body (Vercel parse automatiquement JSON)
    const body = req.body || {};
    const { user, nom, xp, bestScore, gamesPlayed, bestStreak } = body;

    if (!user || !nom || nom === 'undefined') {
      return res.status(400).json({ error: `Données invalides: user=${user}, nom=${nom}` });
    }

    try {
      const data     = await kvGet(url, token);
      const existing = data[user] || {};

      data[user] = {
        nom,
        xp:         (existing.xp || 0) + (Number(xp) || 0),
        bestScore:  Math.max(existing.bestScore || 0, Number(bestScore) || 0),
        gamesPlayed:(existing.gamesPlayed || 0) + 1,
        bestStreak: Math.max(existing.bestStreak || 0, Number(bestStreak) || 0),
        lastPlayed: new Date().toISOString(),
      };

      await kvSet(url, token, data);
      return res.status(200).json({ ok: true, saved: data[user] });
    } catch (e) {
      return res.status(500).json({ error: `Écriture échouée: ${e.message}` });
    }
  }

  res.status(405).json({ error: 'Méthode non autorisée.' });
}
