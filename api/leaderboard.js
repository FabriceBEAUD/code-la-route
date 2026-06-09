import { kv } from '@vercel/kv';

const LEADERBOARD_KEY = 'leaderboard_famille';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — récupérer le classement
  if (req.method === 'GET') {
    try {
      const data = await kv.get(LEADERBOARD_KEY) || {};
      return res.status(200).json(data);
    } catch (e) {
      return res.status(500).json({ error: 'Impossible de lire le classement.' });
    }
  }

  // POST — mettre à jour le score d'un utilisateur
  if (req.method === 'POST') {
    const { user, nom, xp, bestScore, gamesPlayed, bestStreak } = req.body;
    if (!user) return res.status(400).json({ error: 'Champ user manquant.' });

    try {
      const data = await kv.get(LEADERBOARD_KEY) || {};

      const existing = data[user] || { xp: 0, bestScore: 0, gamesPlayed: 0, bestStreak: 0 };

      data[user] = {
        nom:        nom || user,
        xp:         (existing.xp || 0) + (xp || 0),
        bestScore:  Math.max(existing.bestScore || 0, bestScore || 0),
        gamesPlayed:(existing.gamesPlayed || 0) + 1,
        bestStreak: Math.max(existing.bestStreak || 0, bestStreak || 0),
        lastPlayed: new Date().toISOString(),
      };

      await kv.set(LEADERBOARD_KEY, data);
      return res.status(200).json({ ok: true, user: data[user] });
    } catch (e) {
      return res.status(500).json({ error: 'Impossible de sauvegarder.' });
    }
  }

  res.status(405).json({ error: 'Méthode non autorisée.' });
}
