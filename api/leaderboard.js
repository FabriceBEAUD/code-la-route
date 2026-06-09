// API Leaderboard — utilise Upstash Redis via REST API
// Variables d'env nécessaires : KV_REST_API_URL + KV_REST_API_TOKEN

const KEY = 'leaderboard_famille';

async function kvGet(url, token) {
  const res = await fetch(`${url}/get/${KEY}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const json = await res.json();
  return json.result ? JSON.parse(json.result) : {};
}

async function kvSet(url, token, data) {
  await fetch(`${url}/set/${KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(data))
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url   = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    return res.status(503).json({ error: 'KV non configuré — voir guide de setup.' });
  }

  if (req.method === 'GET') {
    try {
      const raw  = await kvGet(url, token);
      // Filtrer les entrées corrompues (sans nom valide)
      const data = Object.fromEntries(
        Object.entries(raw).filter(([, v]) => v && v.nom && v.nom !== 'undefined')
      );
      return res.status(200).json(data);
    } catch (e) {
      return res.status(500).json({ error: 'Lecture KV échouée.' });
    }
  }

  if (req.method === 'POST') {
    const { user, nom, xp, bestScore, gamesPlayed, bestStreak } = req.body;
    if (!user) return res.status(400).json({ error: 'Champ user manquant.' });

    try {
      const data = await kvGet(url, token);
      const existing = data[user] || {};

      data[user] = {
        nom,
        xp:         (existing.xp || 0) + (xp || 0),
        bestScore:  Math.max(existing.bestScore || 0, bestScore || 0),
        gamesPlayed:(existing.gamesPlayed || 0) + 1,
        bestStreak: Math.max(existing.bestStreak || 0, bestStreak || 0),
        lastPlayed: new Date().toISOString(),
      };

      await kvSet(url, token, data);
      return res.status(200).json({ ok: true, user: data[user] });
    } catch (e) {
      return res.status(500).json({ error: 'Écriture KV échouée.' });
    }
  }

  res.status(405).json({ error: 'Méthode non autorisée.' });
}
