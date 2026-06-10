// API Auth — inscription par code d'invitation
const USERS_KEY = 'app_users';
const CODES_KEY  = 'invite_codes';

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

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let a = '', b = '';
  for (let i = 0; i < 4; i++) a += chars[Math.floor(Math.random() * chars.length)];
  for (let i = 0; i < 4; i++) b += chars[Math.floor(Math.random() * chars.length)];
  return `${a}-${b}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url   = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const ADMIN = process.env.ADMIN_PASSWORD || 'papounet-admin-2027';

  if (!url || !token) return res.status(503).json({ error: 'KV non configuré.' });

  const action = req.query?.action || (req.body || {}).action;

  // ── POST register ──
  if (req.method === 'POST' && action === 'register') {
    const { code, username, nom, pass, avatar } = req.body || {};
    if (!code || !username || !nom || !pass)
      return res.status(400).json({ error: 'Tous les champs sont obligatoires.' });

    const cleanUser = username.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    const cleanCode = code.toUpperCase().trim();

    if (!cleanUser || cleanUser.length < 2)
      return res.status(400).json({ error: 'Identifiant invalide (min. 2 caractères, sans accent).' });

    const codes = await kvGet(url, token, CODES_KEY);
    if (!codes[cleanCode])
      return res.status(400).json({ error: 'Code d\'invitation invalide.' });
    if (codes[cleanCode].used)
      return res.status(400).json({ error: 'Ce code a déjà été utilisé.' });

    const users = await kvGet(url, token, USERS_KEY);
    if (users[cleanUser])
      return res.status(400).json({ error: 'Cet identifiant est déjà pris, choisis-en un autre.' });

    users[cleanUser] = { nom: nom.trim(), pass, avatar: avatar || '🙂', createdAt: new Date().toISOString() };
    await kvSet(url, token, USERS_KEY, users);

    codes[cleanCode].used   = true;
    codes[cleanCode].usedBy = cleanUser;
    codes[cleanCode].usedAt = new Date().toISOString();
    await kvSet(url, token, CODES_KEY, codes);

    return res.status(200).json({ ok: true, user: { user: cleanUser, nom: nom.trim(), avatar: avatar || '🙂' } });
  }

  // ── POST login (utilisateurs Redis) ──
  if (req.method === 'POST' && action === 'login') {
    const { username, pass } = req.body || {};
    if (!username || !pass) return res.status(400).json({ error: 'Données manquantes.' });
    const users = await kvGet(url, token, USERS_KEY);
    const found = users[username.toLowerCase().trim()];
    if (!found || found.pass !== pass)
      return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
    return res.status(200).json({ ok: true, user: { user: username.toLowerCase().trim(), nom: found.nom, avatar: found.avatar } });
  }

  // ── POST admin : générer un code ──
  if (req.method === 'POST' && action === 'generate') {
    const { adminPass, label } = req.body || {};
    if (adminPass !== ADMIN) return res.status(403).json({ error: 'Mot de passe admin incorrect.' });
    const codes = await kvGet(url, token, CODES_KEY);
    const code  = generateCode();
    codes[code] = { used: false, label: (label || '').trim(), createdAt: new Date().toISOString() };
    await kvSet(url, token, CODES_KEY, codes);
    return res.status(200).json({ ok: true, code });
  }

  // ── GET admin : lister les codes ──
  if (req.method === 'GET' && action === 'codes') {
    const adminPass = req.query?.adminPass;
    if (adminPass !== ADMIN) return res.status(403).json({ error: 'Accès refusé.' });
    const codes = await kvGet(url, token, CODES_KEY);
    return res.status(200).json(codes);
  }

  return res.status(405).json({ error: 'Méthode non autorisée.' });
}
