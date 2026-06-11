// API WebAuthn — Face ID / Touch ID
const CREDS_KEY = 'webauthn_credentials';

async function upstash(url, token, command) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  return res.json();
}

async function kvGet(url, token, key) {
  const res = await upstash(url, token, ['GET', key]);
  if (res.result == null) return {};
  let val = res.result;
  if (typeof val === 'object') return val;
  try { val = JSON.parse(val); } catch { return {}; }
  if (typeof val === 'string') { try { val = JSON.parse(val); } catch { return {}; } }
  return typeof val === 'object' ? val : {};
}

async function kvSet(url, token, key, data) {
  await upstash(url, token, ['SET', key, JSON.stringify(data)]);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url   = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return res.status(503).json({ error: 'KV non configuré.' });

  const action = req.query?.action || (req.body || {}).action;

  // ── POST register : associer un credential à un utilisateur ──
  if (req.method === 'POST' && action === 'register') {
    const { credentialId, userId, nom, avatar } = req.body || {};
    if (!credentialId || !userId) return res.status(400).json({ error: 'Données manquantes.' });
    const creds = await kvGet(url, token, CREDS_KEY);
    creds[credentialId] = { userId, nom, avatar, registeredAt: new Date().toISOString() };
    await kvSet(url, token, CREDS_KEY, creds);
    return res.status(200).json({ ok: true });
  }

  // ── POST login : retrouver l'utilisateur par credential ID ──
  if (req.method === 'POST' && action === 'login') {
    const { credentialId } = req.body || {};
    if (!credentialId) return res.status(400).json({ error: 'Données manquantes.' });
    const creds = await kvGet(url, token, CREDS_KEY);
    const cred  = creds[credentialId];
    if (!cred) return res.status(401).json({ error: 'Appareil non reconnu. Utilise ton mot de passe.' });
    return res.status(200).json({ ok: true, user: { user: cred.userId, nom: cred.nom, avatar: cred.avatar } });
  }

  return res.status(405).json({ error: 'Méthode non autorisée.' });
}
