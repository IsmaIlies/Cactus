const {
  onCall,
  HttpsError,
  onRequest,
} = require("firebase-functions/v2/https");
const {
  beforeUserCreated,
  beforeUserSignedIn,
  HttpsError: IdentityHttpsError,
} = require('firebase-functions/v2/identity');
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const axios = require("axios");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require('firebase-functions/params');
const ipaddr = require('ipaddr.js');

admin.initializeApp();

const cors = require('cors')({ origin: true });

// ---------------------------------------------------------------------------
// Optional .env loader (local/dev). In production, prefer Firebase env/Secrets.
// This lets you place AUTH_IP_* variables in functions/.env without changing code.
// Files loaded in order (first found wins per-key):
//  - functions/.env.local
//  - functions/.env
//  - projectRoot/.env.local
//  - projectRoot/.env
// ---------------------------------------------------------------------------
try {
  const path = require('path');
  const dotenv = require('dotenv');
  const envFiles = [
    path.resolve(__dirname, '.env.local'),
    path.resolve(__dirname, '.env'),
    path.resolve(__dirname, '../.env.local'),
    path.resolve(__dirname, '../.env'),
  ];
  for (const p of envFiles) {
    try { dotenv.config({ path: p, override: false }); } catch {}
  }
} catch {}

// ---------------------------------------------------------------------------
// Auth Blocking Functions: IP allowlist (Identity Platform required)
//
// Env vars (recommended to set via: firebase functions:config:set or .env / CI):
// - AUTH_IP_ENFORCE: 'true' | 'false' (default false)
// - AUTH_IP_ALLOWLIST: comma/space separated IPs and CIDRs
//   e.g. "203.0.113.4,198.51.100.0/24,2001:db8::/32"
// - AUTH_IP_BYPASS_EMAILS: comma/space separated emails allowed from anywhere (optional)
//
// Safety: if AUTH_IP_ENFORCE is not true, requests are allowed (log-only).
// ---------------------------------------------------------------------------

// No hardcoded allowlist for security.
// Configure AUTH_IP_ALLOWLIST via environment (.env/.env.local or Firebase env).

// ---------------------------------------------------------------------------
// Helpers to read configuration from multiple sources
// Priority order:
// 1) Explicit environment variables (process.env.*)
// 2) Firebase Functions runtime config (functions.config()) — useful for Gen1
// ---------------------------------------------------------------------------
let functionsV1Config = null;
try {
  const functionsV1 = require('firebase-functions');
  functionsV1Config = typeof functionsV1.config === 'function' ? functionsV1.config() : null;
} catch {}

function readRaw(keyPath, envKey) {
  // First, environment variable
  const envVal = (process.env[envKey] || '').toString().trim();
  if (envVal) return envVal;
  // Next, Firebase runtime config (Gen1 style), keyPath like 'authip.allowlist'
  try {
    if (functionsV1Config && keyPath) {
      const [ns, prop] = keyPath.split('.');
      const val = (functionsV1Config?.[ns]?.[prop] || '').toString().trim();
      if (val) return val;
    }
  } catch {}
  return '';
}

function parseCsvList(raw) {
  return (raw || '')
    .toString()
    .split(/[\s,]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeIp(ip) {
  if (!ip) return null;
  const raw = ip.toString().trim();
  if (!raw) return null;
  // Identity Platform provides plain IP, but be defensive.
  const withoutPort = raw.includes(':') && raw.includes('.') === false && raw.includes(']') === false
    ? raw
    : raw;
  // Handle IPv6-mapped IPv4 like ::ffff:203.0.113.4
  const cleaned = withoutPort.replace(/^::ffff:/i, '');
  try {
    return ipaddr.parse(cleaned);
  } catch {
    return null;
  }
}

function parseAllowlistEntries(raw) {
  const parts = parseCsvList(raw);
  const entries = [];
  for (const part of parts) {
    // CIDR
    if (part.includes('/')) {
      const [ipStr, prefixStr] = part.split('/');
      const parsed = normalizeIp(ipStr);
      const prefix = Number(prefixStr);
      if (!parsed || !Number.isFinite(prefix)) continue;
      // normalize kind to match ipaddr expectations
      const kind = parsed.kind();
      const maxPrefix = kind === 'ipv6' ? 128 : 32;
      if (prefix < 0 || prefix > maxPrefix) continue;
      entries.push({ type: 'cidr', ip: parsed, prefix });
      continue;
    }
    // Single IP
    const parsed = normalizeIp(part);
    if (!parsed) continue;
    entries.push({ type: 'ip', ip: parsed });
  }
  return entries;
}

function ipMatchesAllowlist(ipParsed, allowlist) {
  if (!ipParsed) return false;
  const ipKind = ipParsed.kind();
  for (const entry of allowlist) {
    if (!entry || !entry.ip) continue;
    if (entry.ip.kind() !== ipKind) {
      // Compare IPv4 vs IPv6-mapped IPv4 by coercing when possible
      if (ipKind === 'ipv6' && ipParsed.isIPv4MappedAddress && ipParsed.isIPv4MappedAddress()) {
        const asV4 = ipParsed.toIPv4Address();
        if (entry.ip.kind() !== 'ipv4') continue;
        if (entry.type === 'ip') {
          if (asV4.toString() === entry.ip.toString()) return true;
        } else if (entry.type === 'cidr') {
          if (asV4.match(entry.ip, entry.prefix)) return true;
        }
      }
      continue;
    }

    if (entry.type === 'ip') {
      if (ipParsed.toString() === entry.ip.toString()) return true;
    } else if (entry.type === 'cidr') {
      if (ipParsed.match(entry.ip, entry.prefix)) return true;
    }
  }
  return false;
}

function shouldEnforceIpAllowlist() {
  const raw = readRaw('authip.enforce', 'AUTH_IP_ENFORCE').toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}

function flagEnabled(keyPath, envKey, defaultVal = false) {
  try {
    const raw = readRaw(keyPath, envKey).toLowerCase();
    if (!raw) return defaultVal;
    return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
  } catch { return defaultVal; }
}

function isBypassEmail(email) {
  if (!email) return false;
  const raw = readRaw('authip.bypass_emails', 'AUTH_IP_BYPASS_EMAILS');
  const bypass = parseCsvList(raw);
  if (bypass.length === 0) return false;
  return bypass.includes(email.toLowerCase());
}

function enforceIpPolicyOrThrow(event, phase) {
  const ipRaw = event?.ipAddress || '';
  const ipParsed = normalizeIp(ipRaw);
  const email = (event?.data?.email || '').toString().toLowerCase();
  if (email && isBypassEmail(email)) return;

  const allowlistRaw = readRaw('authip.allowlist', 'AUTH_IP_ALLOWLIST');
  const allowlist = parseAllowlistEntries(allowlistRaw);
  const enforce = shouldEnforceIpAllowlist();
  const allowed = ipMatchesAllowlist(ipParsed, allowlist);

  if (!enforce) {
    if (!allowed) {
      console.warn(`[auth-ip] NOT enforced (${phase}) ip=${ipRaw || 'n/a'} email=${email || 'n/a'} allowlistCount=${allowlist.length} allowlistSource=${allowlistRaw ? 'env' : 'none'}`);
    }
    return;
  }

  // Enforced mode: if allowlist is empty, block (safer than allowing everyone)
  if (allowlist.length === 0) {
    console.error(`[auth-ip] Enforced but allowlist empty (${phase}) - blocking for safety`);
    throw new IdentityHttpsError('permission-denied', 'Connexion refusée: réseau non autorisé (allowlist manquante).');
  }

  if (!allowed) {
    console.warn(`[auth-ip] BLOCK (${phase}) ip=${ipRaw || 'n/a'} email=${email || 'n/a'}`);
    throw new IdentityHttpsError('permission-denied', 'Connexion refusée: réseau non autorisé.');
  }
}

// Allow disabling blocking triggers on environments where Gen2/Eventarc is not ready.
const BLOCKING_ENABLED = flagEnabled('authip.blocking_enabled', 'AUTH_IP_BLOCKING_ENABLED', true);
if (BLOCKING_ENABLED) {
  // Blocks sign-in attempts not coming from allowed IP ranges.
  exports.authBeforeUserSignedIn = beforeUserSignedIn((event) => {
    enforceIpPolicyOrThrow(event, 'beforeSignIn');
  });

  // Blocks new account creation from disallowed IP ranges.
  exports.authBeforeUserCreated = beforeUserCreated((event) => {
    enforceIpPolicyOrThrow(event, 'beforeCreate');
  });
} else {
  console.warn('[auth-ip] Blocking functions disabled for this environment');
}

// Simple local test endpoint to check current IP policy against the caller IP.
// Not exposed in hosting rewrites; used via emulator: http://127.0.0.1:5001/<project>/us-central1/authIpCheck
// Allow disabling v2 HTTP when Eventarc/Run causes deployment issues.
const V2_HTTP_ENABLED = flagEnabled('v2.http_enabled', 'V2_HTTP_ENABLED', false);
if (V2_HTTP_ENABLED) {
exports.authIpCheck = onRequest((req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
      // Echo requested headers to satisfy preflight (Accept, etc.)
      const reqHeaders = (req.headers['access-control-request-headers'] || '').toString();
      res.set('Access-Control-Allow-Headers', reqHeaders || 'Content-Type, Authorization, Accept');
      res.set('Vary', 'Origin, Access-Control-Request-Headers');
      return res.status(204).send('');
    }

    const xff = (req.headers['x-forwarded-for'] || '').toString();
    const remote = (req.socket && req.socket.remoteAddress) || (req.connection && req.connection.remoteAddress) || '';
    const cfip = (req.headers['cf-connecting-ip'] || '').toString();
    const ipRaw = xff ? xff.split(',')[0].trim() : (cfip || req.headers['x-real-ip'] || remote || req.ip || '').toString();
    const ipParsed = normalizeIp(ipRaw);
    const allowlistRaw = readRaw('authip.allowlist', 'AUTH_IP_ALLOWLIST');
    const allowlist = parseAllowlistEntries(allowlistRaw);
    const enforce = shouldEnforceIpAllowlist();
    const allowed = ipMatchesAllowlist(ipParsed, allowlist);

    res.set('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.set('Vary', 'Origin');
    const payload = {
      ok: allowed || !enforce,
      enforce,
      ip: ipRaw || null,
      allowed,
      allowlistCount: allowlist.length,
      allowlistRaw: allowlistRaw || ''
    };
    return res.status(allowed || !enforce ? 200 : 403).json(payload);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e && e.message ? e.message : 'internal' });
  }
});
} else {
  console.warn('[auth-ip] v2 HTTP authIpCheck disabled; using v1 fallback');
}

// ---------------------------------------------------------------------------
// Fallback v1 HTTP endpoint for authIpCheck (no Eventarc/Run requirements)
// Useful when v2 onRequest deployment is blocked by missing GCP services.
// URL: https://us-central1-<projectId>.cloudfunctions.net/authIpCheckV1
// ---------------------------------------------------------------------------
try {
  const functionsV1 = require('firebase-functions');
  exports.authIpCheckV1 = functionsV1.https.onRequest((req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Origin', req.headers.origin || '*');
        res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
        const reqHeaders = (req.headers['access-control-request-headers'] || '').toString();
        res.set('Access-Control-Allow-Headers', reqHeaders || 'Content-Type, Authorization, Accept');
        res.set('Vary', 'Origin, Access-Control-Request-Headers');
        return res.status(204).send('');
      }

      const xff = (req.headers['x-forwarded-for'] || '').toString();
      const remote = (req.socket && req.socket.remoteAddress) || (req.connection && req.connection.remoteAddress) || '';
      const cfip = (req.headers['cf-connecting-ip'] || '').toString();
      const ipRaw = xff ? xff.split(',')[0].trim() : (cfip || req.headers['x-real-ip'] || remote || req.ip || '').toString();
      const ipParsed = normalizeIp(ipRaw);
      const allowlistRaw = readRaw('authip.allowlist', 'AUTH_IP_ALLOWLIST');
      const allowlist = parseAllowlistEntries(allowlistRaw);
      const enforce = shouldEnforceIpAllowlist();
      const allowed = ipMatchesAllowlist(ipParsed, allowlist);

      res.set('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.set('Vary', 'Origin');
      const payload = {
        ok: allowed || !enforce,
        enforce,
        ip: ipRaw || null,
        allowed,
        allowlistCount: allowlist.length,
        allowlistRaw: allowlistRaw || ''
      };
      return res.status(allowed || !enforce ? 200 : 403).json(payload);
    } catch (e) {
      return res.status(500).json({ ok: false, error: e && e.message ? e.message : 'internal' });
    }
  });
} catch {}

// Migré depuis functions.config() vers Firebase Secret Manager (post-2026 compliant).
const LEADS_API_TOKEN = defineSecret('LEADS_API_TOKEN');
const SWEEGO_API_KEY = defineSecret('SWEEGO_API_KEY');

// Sanitize token: trim and if pasted twice (e.g., ABCABC), keep first half
function sanitizeToken(raw) {
  const t = (raw || '').toString().trim();
  if (!t) return '';
  if (t.length % 2 === 0) {
    const mid = t.length / 2;
    const a = t.slice(0, mid);
    const b = t.slice(mid);
    if (a === b) return a;
  }
  return t;
}

async function fetchWithRetry(url, options, retries = 2, baseDelayMs = 800) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...options, timeout: options?.timeout ?? 25000 });
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw lastErr;
    }
  }
}

// Petite aide CORS pour l'endpoint leadsStats (autorise GET + préflight)
function setCorsHeaders(req, res) {
  const origin = req.headers.origin || '*';
  res.set('Access-Control-Allow-Origin', origin);
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Max-Age', '86400');
}

// Cache mémoire simple (30s) pour limiter les appels upstream
let leadsStatsCache = { expires: 0, payload: null };

exports.leadsStats = onRequest({
  region: 'europe-west1',
  timeoutSeconds: 30,
  memory: '256MiB',
  secrets: [LEADS_API_TOKEN],
}, async (req, res) => {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Méthode non autorisée', dolead: 0, hipto: 0 });
  }

  try {
    // Mode diagnostic: renvoyer l'IP de sortie pour whitelist chez le fournisseur
    if (req.query && (req.query.diagnostic === '1' || req.query.diagnostic === 'true')) {
      const ip = await getEgressIp();
      return res.json({ ok: true, diagnostic: true, egressIp: ip || null });
    }

    const now = Date.now();
    if (leadsStatsCache.payload && leadsStatsCache.expires > now) {
      return res.json({ ok: true, ...leadsStatsCache.payload });
    }

    const { date_start, date_end } = req.query || {};
    const params = {};
    if (typeof date_start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date_start)) {
      params.date_start = date_start;
    }
    if (typeof date_end === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date_end)) {
      params.date_end = date_end;
    }

    const token = sanitizeToken((LEADS_API_TOKEN && LEADS_API_TOKEN.value && LEADS_API_TOKEN.value()) || process.env.LEADS_API_TOKEN || '');

    // Si pas de configuration, retourner des zéros « ok » pour éviter de casser l’UI
    if (!token) {
      const payload = { dolead: 0, hipto: 0 };
      leadsStatsCache = { expires: now + 30 * 1000, payload };
      return res.json({ ok: true, ...payload });
    }

    const data = await fetchLeadStatsFromApi(params, token);
    leadsStatsCache = { expires: now + 30 * 1000, payload: data };
    return res.json({ ok: true, ...data });
  } catch (error) {
    console.warn('[leadsStats] error', error && error.message ? error.message : error);
    // En cas d’erreur, on renvoie un 200 avec zéros pour ne pas bloquer les écrans
    return res.status(200).json({ ok: false, error: error?.message || 'Erreur inconnue', dolead: 0, hipto: 0 });
  }
});

// Proxy sécurisé qui relaie l'appel vers l'API Emitel en propageant l'IP client via X-Forwarded-For/X-Real-IP
// Usage côté front: fetch('/api/leads-stats-forward?date_start=YYYY-MM-DD&date_end=YYYY-MM-DD')
exports.leadsStatsForward = onRequest({
  region: 'europe-west1',
  timeoutSeconds: 30,
  memory: '256MiB',
  secrets: [LEADS_API_TOKEN],
}, async (req, res) => {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    // Mode diagnostic: retourne l'IP de sortie pour whitelist chez le fournisseur
    if (req.query && (req.query.diagnostic === '1' || req.query.diagnostic === 'true')) {
      const ip = await getEgressIp();
      return res.json({ ok: true, diagnostic: true, egressIp: ip || null });
    }

    const baseUrl = process.env.LEADS_STATS_URL || 'https://orange-leads.mm.emitel.io/stats-lead.php';
    const url = new URL(baseUrl);
    const { date_start, date_end } = req.query || {};
    if (typeof date_start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date_start)) {
      url.searchParams.set('date_start', date_start);
    }
    if (typeof date_end === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date_end)) {
      url.searchParams.set('date_end', date_end);
    }

    const token = sanitizeToken((LEADS_API_TOKEN && LEADS_API_TOKEN.value && LEADS_API_TOKEN.value()) || process.env.LEADS_API_TOKEN || '');
    if (token) {
      url.searchParams.set('token', token);
    } else {
      // Pas de token configuré: renvoyer une réponse "safe" pour ne pas casser l'UI
      return res.status(200).json({ ok: false, error: 'LEADS_API_TOKEN manquant', dolead: 0, hipto: 0, mm: 0 });
    }

    // Récupère la vraie IP du client (dernière du header X-Forwarded-For peut contenir une chaîne d'IPs)
    const xff = (req.headers['x-forwarded-for'] || '').toString();
    const clientIp = xff ? xff.split(',')[0].trim() : (req.headers['x-real-ip'] || req.ip || '').toString();

    const upstream = await fetchWithRetry(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Cactus/LeadsProxy (+https://cactus-labs.fr)',
        'X-Forwarded-For': clientIp,
        'X-Real-IP': clientIp,
      },
      timeout: 25_000,
    });

    const text = await upstream.text();
    const contentType = upstream.headers.get('content-type') || 'application/json';
    res.set('Content-Type', contentType);
    res.set('X-Cactus-Client-IP', clientIp || '');

    // Si l'amont répond en erreur, renvoyer 200 avec des zéros pour ne pas bloquer l'UI
    if (!upstream.ok) {
      console.warn('[leadsStatsForward] Upstream error status', upstream.status, text.slice(0, 200));
      return res.status(200).json({ ok: false, error: `Upstream HTTP ${upstream.status}` , dolead: 0, hipto: 0, mm: 0 });
    }
    return res.status(200).send(text);
  } catch (e) {
    console.error('[leadsStatsForward] Error', e && e.stack ? e.stack : e);
    // Réponse "safe" pour que l'UI continue de fonctionner
    return res.status(200).json({ ok: false, error: e && e.message ? e.message : 'Proxy failure', dolead: 0, hipto: 0, mm: 0 });
  }
});

// Appel HTTP vers l’API amont (URL configurable via variable d’environnement LEADS_STATS_URL)
// Spécification (mail): GET https://orange-leads.mm.emitel.io/stats-lead.php?token=...&date_start=YYYY-MM-DD&date_end=YYYY-MM-DD
async function fetchLeadStatsFromApi(params, token) {
  const baseUrl = process.env.LEADS_STATS_URL || 'https://orange-leads.mm.emitel.io/stats-lead.php';
  if (!baseUrl) {
    // Pas d’URL, on renvoie des zéros
    return { dolead: 0, hipto: 0 };
  }
  const url = new URL(baseUrl);
  // Paramètres de date optionnels
  Object.entries(params || {}).forEach(([k, v]) => {
    if (typeof v === 'string' && v) url.searchParams.set(k, v);
  });
  // Le token est requis par la spec en query string
  if (token) url.searchParams.set('token', token);

  const upstream = await fetchWithRetry(url.toString(), {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      // Ne pas envoyer Authorization: Bearer ici, l'API attend le token en query
    },
    timeout: 25_000,
  });

  let payload = null;
  try {
    payload = await upstream.json();
  } catch (e) {
    console.warn('[leadsStats] Réponse non JSON (ou vide)');
  }

  // Deux formats gérés: { ok:true, dolead:x, hipto:y } ou { RESPONSE:'OK', DATA:[{type,count}...] }
  if (payload && typeof payload === 'object') {
    if (typeof payload.dolead === 'number' && typeof payload.hipto === 'number') {
      return { dolead: Number(payload.dolead) || 0, hipto: Number(payload.hipto) || 0 };
    }
    if (payload.RESPONSE === 'OK' && Array.isArray(payload.DATA)) {
      const findCount = (t) => {
        const entry = payload.DATA.find((it) => it && String(it.type).toLowerCase() === t);
        return entry && typeof entry.count === 'number' ? entry.count : 0;
      };
      return { dolead: Number(findCount('dolead')) || 0, hipto: Number(findCount('hipto')) || 0 };
    }
  }

  if (!upstream.ok) {
    throw new Error(`Upstream HTTP ${upstream.status}`);
  }
  // Par défaut si format inconnu mais statut OK, renvoyer 0
  return { dolead: 0, hipto: 0 };
}

// Récupère l'IP publique de sortie des Cloud Functions (utile pour whitelist côté fournisseur)
async function getEgressIp() {
  try {
    const r = await fetch('https://api.ipify.org?format=json', { timeout: 5000, headers: { 'Accept': 'application/json' } });
    const j = await r.json().catch(() => null);
    return j && j.ip ? j.ip : null;
  } catch (e) {
    try {
      const r2 = await fetch('https://ifconfig.me/ip', { timeout: 5000 });
      const t = await r2.text();
      return (t || '').trim() || null;
    } catch {
      return null;
    }
  }
}

const ADMIN_ACTIVITY_WINDOW_HOURS = 1;
const ADMIN_ACTIVITY_WINDOW_MS = ADMIN_ACTIVITY_WINDOW_HOURS * 60 * 60 * 1000;

const isAdminFromToken = (token = {}) => {
  if (!token || typeof token !== "object") {
    return false;
  }
  // Email whitelist: specific admins (both legacy and orange domains)
  const email = (token.email || '').toLowerCase();
  if (email) {
    const [local, domain = ''] = email.split('@');
    const isOwner = local === 'i.brai' || local === 'i.boultame';
    const isAllowedDomain = domain === 'mars-marketing.fr' || domain === 'orange.mars-marketing.fr';
    if (isOwner && isAllowedDomain) {
      return true;
    }
  }
  if (token.isAdmin === true) {
    return true;
  }
  const role = typeof token.role === "string" ? token.role.toLowerCase() : "";
  if (role === "admin" || role === "administrateur" || role === "direction") {
    return true;
  }
  const roles = Array.isArray(token.roles) ? token.roles.map((value) => String(value).toLowerCase()) : [];
  return roles.includes("admin") || roles.includes("administrateur") || roles.includes("direction");
};

// Async guard that checks multiple sources to determine admin privilege
async function isAdminAllowed(auth) {
  if (!auth || !auth.token) return false;
  // 1) Fast path: token-based checks, including whitelisted emails
  if (isAdminFromToken(auth.token)) return true;
  // 2) Fallback: read Firestore user role
  try {
    const snap = await admin.firestore().collection('users').doc(auth.uid).get();
    const data = snap.exists ? snap.data() || {} : {};
    const role = (data.role || '').toString().toUpperCase();
    if (!role) return false;
    if (role === 'ADMINISTRATEUR' || role === 'DIRECTION') return true;
    if (role.startsWith('SUPERVISEUR')) return true;
    return false;
  } catch (e) {
    console.warn('[isAdminAllowed] Firestore lookup failed', e && e.message ? e.message : e);
    return false;
  }
}

// =============================================================
// Roles management
// - setUserRole: admin-only, assigns role string and optional claims
// - Updates Firebase custom claims and Firestore user document
// =============================================================
const ALLOWED_ROLES = [
  'TA C+ FR',
  'TA C+ CIV',
  'TA LEADS CIV',
  'TA LEADS FR',
  'SUPERVISEUR C+ FR',
  'SUPERVISEUR C+ CIV',
  'SUPERVISEUR LEADS FR',
  'SUPERVISEUR LEADS CIV',
  'DIRECTION',
  'ADMINISTRATEUR',
];

function deriveClaimsFromRole(role) {
  const r = String(role).toUpperCase();
  const isAdmin = r === 'ADMINISTRATEUR' || r === 'DIRECTION';
  let mission = null;
  let operation = null;
  if (r.includes('C+')) { mission = 'CANAL+'; }
  if (r.includes('LEADS')) { mission = 'LEADS'; }
  if (r.includes('FR')) { operation = 'FR'; }
  if (r.includes('CIV')) { operation = 'CIV'; }
  const supervisor = r.startsWith('SUPERVISEUR');
  const direction = r === 'DIRECTION';
  return { role, isAdmin, mission, operation, supervisor, direction };
}

exports.setUserRole = onCall({ region: 'europe-west9' }, async (req) => {
  const { auth } = req;
  if (!auth || !auth.token) {
    throw new HttpsError('unauthenticated', 'Authentification requise');
  }
  if (!(await isAdminAllowed(auth))) {
    throw new HttpsError('permission-denied', 'Réservé aux administrateurs');
  }
  const { userId, userIds, role } = req.data || {};
  if (!role || typeof role !== 'string') {
    throw new HttpsError('invalid-argument', 'role requis');
  }
  const normalized = role.trim();
  if (!ALLOWED_ROLES.includes(normalized)) {
    throw new HttpsError('invalid-argument', 'Rôle invalide');
  }
  const targets = Array.isArray(userIds) && userIds.length > 0
    ? Array.from(new Set(userIds.filter((u) => typeof u === 'string' && u.trim().length > 0)))
    : (typeof userId === 'string' && userId.trim().length > 0 ? [userId] : []);
  if (targets.length === 0) {
    throw new HttpsError('invalid-argument', 'Aucun utilisateur à traiter');
  }
  const updated = [];
  const failed = [];
  for (const uid of targets) {
    try {
      const claims = deriveClaimsFromRole(normalized);
      await admin.auth().setCustomUserClaims(uid, { ...(claims || {}) });
      await admin.firestore().collection('users').doc(uid).set({
        role: normalized,
        mission: claims.mission || null,
        operation: claims.operation || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: auth.uid,
      }, { merge: true });
      updated.push(uid);
    } catch (e) {
      console.error('[setUserRole] failed for', uid, e);
      failed.push({ uid, code: e?.code, message: e?.message });
    }
  }
  if (updated.length === 0) {
    throw new HttpsError('internal', 'Aucune assignation réalisée', { failed });
  }
  return { ok: true, role: normalized, updated, failed };
});

// (Removed duplicate definition of setUserRoleHttp)

// HTTP fallback for role assignment using Authorization: Bearer <idToken>
exports.setUserRoleHttp = onRequest({ region: 'europe-west9' }, async (req, res) => {
  const allowedOrigins = [
    'https://cactus-labs.fr',
    'http://localhost:5173', 'http://127.0.0.1:5173',
    'http://localhost:5174', 'http://127.0.0.1:5174'
  ];
  const origin = req.headers.origin;
  const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  const setCors = () => {
    const reqAllowed = (req.headers['access-control-request-headers'] || 'Content-Type, Authorization').toString();
    res.set({
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Credentials': 'true',
      'Vary': 'Origin',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': reqAllowed,
      'Access-Control-Max-Age': '86400',
    });
  };
  if (req.method === 'OPTIONS') { setCors(); return res.status(204).send(''); }
  if (req.method !== 'POST') { setCors(); return res.status(405).json({ error: 'Méthode non autorisée' }); }
  setCors();
  try {
    const authHeader = req.headers.authorization || '';
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!m) return res.status(401).json({ error: 'Token Firebase requis' });
    let decoded;
    try { decoded = await admin.auth().verifyIdToken(m[1]); } catch (e) {
      return res.status(401).json({ error: 'Token invalide', details: e && e.message });
    }
    const auth = { uid: decoded.uid, token: decoded };
    if (!(await isAdminAllowed(auth))) {
      return res.status(403).json({ error: 'Réservé aux administrateurs' });
    }
    let body;
    try { body = typeof req.body === 'object' ? req.body : JSON.parse(req.rawBody?.toString('utf8') || '{}'); }
    catch { body = {}; }
    const { userId, userIds, role } = body || {};
    if (!role || typeof role !== 'string') {
      return res.status(400).json({ error: 'role requis' });
    }
    const normalized = role.trim();
    if (!ALLOWED_ROLES.includes(normalized)) {
      return res.status(400).json({ error: 'Rôle invalide' });
    }
    const targets = Array.isArray(userIds) && userIds.length > 0
      ? Array.from(new Set(userIds.filter((u) => typeof u === 'string' && u.trim().length > 0)))
      : (typeof userId === 'string' && userId.trim().length > 0 ? [userId] : []);
    if (targets.length === 0) return res.status(400).json({ error: 'Aucun utilisateur à traiter' });
    const updated = [];
    const failed = [];
    for (const uid of targets) {
      try {
        const claims = deriveClaimsFromRole(normalized);
        await admin.auth().setCustomUserClaims(uid, { ...(claims || {}) });
        await admin.firestore().collection('users').doc(uid).set({
          role: normalized,
          mission: claims.mission || null,
          operation: claims.operation || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: auth.uid,
        }, { merge: true });
        updated.push(uid);
      } catch (e) {
        failed.push({ uid, code: e?.code, message: e?.message });
      }
    }
    if (updated.length === 0) return res.status(500).json({ error: 'Aucune assignation réalisée', failed });
    return res.json({ ok: true, role: normalized, updated, failed });
  } catch (err) {
    console.error('[setUserRoleHttp] error', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// =============================================================
// Purge automatique des matchs passés
// - Supprime les documents de la collection 'matches' dont startTime < (now - 48h)
// - Exécuté chaque nuit à 03:10 heure de Paris
// =============================================================
exports.purgeOldMatches = onSchedule({
  schedule: '10 3 * * *', // 03:10 tous les jours
  timeZone: 'Europe/Paris',
  region: 'europe-west1'
}, async () => {
  const db = admin.firestore();
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48h avant maintenant
  console.log('[purgeOldMatches] Lancement purge, cutoff =', cutoff.toISOString());
  try {
    const snap = await db.collection('matches')
      .where('startTime', '<', cutoff)
      .limit(500) // sécurité batch
      .get();
    if (snap.empty) {
      console.log('[purgeOldMatches] Aucun match à supprimer.');
      return null;
    }
    const batch = db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    console.log(`[purgeOldMatches] ${snap.size} match(s) supprimé(s).`);
  } catch (e) {
    console.error('[purgeOldMatches] Erreur purge', e);
  }
  return null;
});

// =============================================================
// Endpoint: top14Schedule (stub) - renvoie JSON des prochains matchs Rugby
// À terme on peut remplacer par scraping / API officielle.
// =============================================================
exports.top14Schedule = onRequest({ region: 'europe-west9', timeoutSeconds: 15 }, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).send('');
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }
  try {
    // Jeu de données exemple (à substituer dynamiquement)
    const now = new Date();
    const baseDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 35, 0, 0);
    const addDays = (n) => new Date(baseDay.getTime() + n * 86400000);
    const matches = [
      { id: 'm1', sport: 'rugby', competition: 'TOP14', round: 'J4', startTime: addDays(2).toISOString(), homeTeam: 'Stade Toulousain', awayTeam: 'RC Toulon', channel: 'CANAL+ SPORT', status: 'scheduled' },
      { id: 'm2', sport: 'rugby', competition: 'TOP14', round: 'J4', startTime: addDays(3).toISOString(), homeTeam: 'Racing 92', awayTeam: 'Stade Français', channel: 'CANAL+ FOOT', status: 'scheduled' },
      { id: 'm3', sport: 'rugby', competition: 'TOP14', round: 'J4', startTime: addDays(7).toISOString(), homeTeam: 'ASM Clermont', awayTeam: 'Union Bordeaux-Bègles', channel: 'CANAL+ SPORT 360', status: 'scheduled' },
    ];
    return res.json({ updatedAt: new Date().toISOString(), matches });
  } catch (e) {
    console.error('[top14Schedule] error', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// =============================================================
// JustWatch Proxy (répare CORS côté backend au lieu du Worker CF)
// Endpoint: /api/justwatch (voir firebase.json rewrite)
// =============================================================
exports.justwatchProxy = onRequest({ region: 'europe-west9', timeoutSeconds: 15, memory: '256MiB' }, async (req, res) => {
  const allowedOrigins = [
    'http://cactus-labs.fr',
    'https://cactus-labs.fr',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  // Dev fallback port sometimes used if 5173 busy
    'http://localhost:5174',
    'http://127.0.0.1:5174'
  ];
  const origin = req.headers.origin;
  const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  // Preflight
  if (req.method === 'OPTIONS') {
    res.set({
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    return res.status(204).send('');
  }

  if (req.method !== 'POST') {
    res.set('Access-Control-Allow-Origin', allowOrigin);
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const contentType = (req.headers['content-type'] || '').toLowerCase();
    let bodyText = req.rawBody ? req.rawBody.toString('utf8') : '';
    if (!bodyText) bodyText = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    console.log('[justwatchProxy] Body reçu:', bodyText.slice(0, 500));
    if (bodyText.length > 200_000) {
      console.error('[justwatchProxy] Payload trop volumineux:', bodyText.length);
      throw new Error('Payload trop volumineux');
    }
    let parsed;
    if (contentType.includes('application/json') || contentType.includes('text/plain')) {
      try { parsed = JSON.parse(bodyText); } catch { /* si déjà objet */ }
      if (!parsed && typeof req.body === 'object') parsed = req.body;
    }
    if (!parsed || !parsed.query) {
      console.error('[justwatchProxy] Champ query manquant dans le body:', parsed);
      return res.status(400).set('Access-Control-Allow-Origin', allowOrigin).json({ error: 'Requête GraphQL invalide (champ query manquant)' });
    }

    const upstreamResp = await fetch('https://apis.justwatch.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; CactusJustWatchProxy/1.0)'
      },
      body: JSON.stringify(parsed)
    });

    const text = await upstreamResp.text();
    console.log('[justwatchProxy] Status JustWatch:', upstreamResp.status, 'Réponse:', text.slice(0, 500));
    res.set({
      'Access-Control-Allow-Origin': allowOrigin,
      'Content-Type': upstreamResp.headers.get('content-type') || 'application/json',
      'Vary': 'Origin'
    });
    return res.status(upstreamResp.status).send(text);
  } catch (e) {
    console.error('[justwatchProxy] Error', e && e.stack ? e.stack : e);
    res.set('Access-Control-Allow-Origin', origin || '*');
    return res.status(500).json({ error: 'Proxy failure', details: e && e.message ? e.message : String(e), stack: e && e.stack ? e.stack : undefined });
  }
});

exports.registerUser = onRequest({ region: "europe-west9" }, (req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Méthode non autorisée" });
    }
    const { email, password, firstName, lastName } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: "Tous les champs sont requis" });
    }

    try {
      const userRecord = await admin.auth().createUser({
        email: email,
        password: password,
        displayName: `${firstName} ${lastName}`,
      });

      await admin.firestore().collection("users").doc(userRecord.uid).set({
        firstName: firstName,
        lastName: lastName,
        email: email,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await admin
        .firestore()
        .collection("gameCredits")
        .doc(userRecord.uid)
        .set({
          userId: userRecord.uid,
          credits: 100,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

      return res.status(200).json({ uid: userRecord.uid, success: true });
    } catch (error) {
      return res.status(500).json({ error: error.message, rawCode: error.code });
    }
  });
});

exports.disableUsers = onRequest({ region: "europe-west9" }, async (req, res) => {
  res.set("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Vary", "Origin");

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const { userIds } = req.body || {};
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ error: "Liste d'utilisateurs invalide" });
  }

  const uniqueIds = Array.from(
    new Set(
      userIds.filter((value) => typeof value === "string" && value.trim().length > 0)
    )
  );

  if (uniqueIds.length === 0) {
    return res.status(400).json({ error: "Aucun utilisateur à traiter" });
  }

  try {
    const disabled = [];
    for (const uid of uniqueIds) {
      await admin.auth().updateUser(uid, { disabled: true });
      await admin
        .firestore()
        .collection("users")
        .doc(uid)
        .set(
          {
            disabled: true,
            disabledAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      disabled.push(uid);
    }

    return res.status(200).json({ success: true, disabled: disabled.length, userIds: disabled });
  } catch (error) {
    console.error("[disableUsers] error", error);
    return res.status(500).json({ error: error.message, rawCode: error.code });
  }
});

// Callable équivalent pour correspondre au client (httpsCallable)
exports.registerUserCallable = onCall({ region: "europe-west9" }, async (req) => {
  const { email, password, firstName, lastName } = req.data || {};

  if (!email || !password || !firstName || !lastName) {
    throw new HttpsError("invalid-argument", "Tous les champs sont requis");
  }

  try {
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: `${firstName} ${lastName}`,
    });

    await admin.firestore().collection("users").doc(userRecord.uid).set({
      firstName,
      lastName,
      email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await admin
      .firestore()
      .collection("gameCredits")
      .doc(userRecord.uid)
      .set(
        {
          userId: userRecord.uid,
          credits: 100,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    return { uid: userRecord.uid, success: true };
  } catch (error) {
    const code = error.code || "internal";
    const message = error.message || "Erreur interne";
    throw new HttpsError("internal", message, { rawCode: code });
  }
});

exports.disableUsersCallable = onCall({ region: "europe-west9" }, async (req) => {
  const { userIds } = req.data || {};

  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new HttpsError("invalid-argument", "Liste d'utilisateurs invalide");
  }

  const uniqueIds = Array.from(
    new Set(
      userIds.filter((value) => typeof value === "string" && value.trim().length > 0)
    )
  );

  if (uniqueIds.length === 0) {
    throw new HttpsError("invalid-argument", "Aucun utilisateur à traiter");
  }

  try {
    const disabled = [];
    const notFound = [];
    const failed = [];
    for (const uid of uniqueIds) {
      try {
        await admin.auth().updateUser(uid, { disabled: true });
      } catch (error) {
        if (error?.code === "auth/user-not-found") {
          notFound.push(uid);
        } else {
          failed.push({ uid, code: error?.code, message: error?.message });
          continue;
        }
      }
      await admin
        .firestore()
        .collection("users")
        .doc(uid)
        .set(
          {
            disabled: true,
            disabledAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      disabled.push(uid);
    }

    return { success: true, disabled: disabled.length, userIds: disabled, notFound, failed };
  } catch (error) {
    console.error("[disableUsersCallable] error", error);
    throw new HttpsError("internal", error?.message || "Erreur serveur", {
      rawCode: error?.code,
    });
  }
});

exports.getAdminUserStats = onCall({ region: "europe-west9" }, async (req) => {
  const auth = req.auth;
  if (!auth) {
    throw new HttpsError("unauthenticated", "Authentification requise");
  }

  if (!(await isAdminAllowed(auth))) {
    throw new HttpsError("permission-denied", "Réservé aux administrateurs");
  }

  const now = Date.now();
  const threshold = now - ADMIN_ACTIVITY_WINDOW_MS;
  let totalUsers = 0;
  let activeUsers = 0;
  let disabledUsers = 0;
  let pageToken;

  try {
    do {
      const result = await admin.auth().listUsers(1000, pageToken);
      result.users.forEach((userRecord) => {
        if (userRecord.disabled) {
          disabledUsers += 1;
          return;
        }

        totalUsers += 1;

        const lastSignInTime = userRecord.metadata?.lastSignInTime;
        const lastRefreshTime = userRecord.metadata?.lastRefreshTime;
        const signInMs = lastSignInTime ? Date.parse(lastSignInTime) : NaN;
        const refreshMs = lastRefreshTime ? Date.parse(lastRefreshTime) : NaN;
        const latestActivity = Math.max(Number.isFinite(signInMs) ? signInMs : 0, Number.isFinite(refreshMs) ? refreshMs : 0);

        if (latestActivity && latestActivity >= threshold) {
          activeUsers += 1;
        }
      });
      pageToken = result.pageToken;
    } while (pageToken);
  } catch (error) {
    console.error("[getAdminUserStats] error", error);
    throw new HttpsError("internal", error?.message || "Erreur lors de la récupération des statistiques", {
      rawCode: error?.code,
    });
  }

  return {
    success: true,
    totalUsers,
    activeUsers,
    disabledUsers,
    windowHours: ADMIN_ACTIVITY_WINDOW_HOURS,
    updatedAt: new Date(now).toISOString(),
  };
});

// HTTP fallback for admin user stats with CORS and Bearer token verification
exports.getAdminUserStatsHttp = onRequest({ region: 'europe-west9' }, async (req, res) => {
  const allowedOrigins = [
    'https://cactus-labs.fr',
    'http://localhost:5173','http://127.0.0.1:5173',
    'http://localhost:5174','http://127.0.0.1:5174'
  ];
  const origin = req.headers.origin; const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  const setCors = () => { res.set({
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }); };
  if (req.method === 'OPTIONS') { setCors(); return res.status(204).send(''); }
  if (req.method !== 'GET') { setCors(); return res.status(405).json({ error: 'Méthode non autorisée' }); }
  setCors();
  try {
    const m = (req.headers.authorization || '').toString().match(/^Bearer\s+(.+)$/i);
    if (!m) return res.status(401).json({ error: 'Token Firebase requis' });
    const idToken = m[1];
    let decoded; try { decoded = await admin.auth().verifyIdToken(idToken); } catch (e) { return res.status(401).json({ error: 'Token invalide', details: e && e.message }); }
    const auth = { uid: decoded.uid, token: decoded };
    if (!(await isAdminAllowed(auth))) {
      return res.status(403).json({ error: 'Réservé aux administrateurs' });
    }

    const now = Date.now();
    const threshold = now - ADMIN_ACTIVITY_WINDOW_MS;
    let totalUsers = 0; let activeUsers = 0; let disabledUsers = 0; let pageToken;
    try {
      do {
        const result = await admin.auth().listUsers(1000, pageToken);
        result.users.forEach((userRecord) => {
          if (userRecord.disabled) { disabledUsers += 1; return; }
          totalUsers += 1;
          const lastSignInTime = userRecord.metadata?.lastSignInTime;
          const lastRefreshTime = userRecord.metadata?.lastRefreshTime;
          const signInMs = lastSignInTime ? Date.parse(lastSignInTime) : NaN;
          const refreshMs = lastRefreshTime ? Date.parse(lastRefreshTime) : NaN;
          const latestActivity = Math.max(Number.isFinite(signInMs) ? signInMs : 0, Number.isFinite(refreshMs) ? refreshMs : 0);
          if (latestActivity && latestActivity >= threshold) { activeUsers += 1; }
        });
        pageToken = result.pageToken;
      } while (pageToken);
    } catch (error) {
      console.error('[getAdminUserStatsHttp] error', error);
      return res.status(500).json({ error: error?.message || 'Erreur lors de la récupération des statistiques', rawCode: error?.code });
    }
    return res.json({ success: true, totalUsers, activeUsers, disabledUsers, windowHours: ADMIN_ACTIVITY_WINDOW_HOURS, updatedAt: new Date(now).toISOString() });
  } catch (err) {
    console.error('[getAdminUserStatsHttp] failure', err);
    return res.status(500).json({ error: 'Internal error', details: err?.message });
  }
});

// =============================================================
// Auth migration helpers
// - mintCustomTokenByEmail: returns a Custom Token for an existing user
//   Useful to link a new Microsoft SSO credential to an existing UID
//   even when emails/domains changed (e.g., mars-marketing.fr -> orange.mars-marketing.fr)
// =============================================================
exports.mintCustomTokenByEmail = onCall({
  region: 'europe-west9',
  // This callable is used *before* auth in some flows (SSO linking),
  // so it must be accessible without Firebase Auth.
  allowUnauthenticated: true,
}, async (req) => {
  try {
    const { email } = req.data || {};
    if (!email || typeof email !== 'string') {
      throw new HttpsError('invalid-argument', 'email requis');
    }
    const dbEmail = email.trim().toLowerCase();
    const candidates = [dbEmail];
    // If called with the new domain, also try legacy mars-marketing.fr
    if (dbEmail.endsWith('@orange.mars-marketing.fr')) {
      const local = dbEmail.split('@')[0];
      candidates.push(`${local}@mars-marketing.fr`);
    }
    if (dbEmail.endsWith('@mars-marketing.fr')) {
      const local = dbEmail.split('@')[0];
      candidates.push(`${local}@orange.mars-marketing.fr`);
    }

    let found = null;
    for (const e of candidates) {
      try {
        // getUserByEmail throws if not found
        const rec = await admin.auth().getUserByEmail(e);
        found = rec;
        break;
      } catch {
        // continue
      }
    }
    if (!found) {
      throw new HttpsError('not-found', 'Aucun utilisateur pour cet email (ni alias)');
    }

    const token = await admin.auth().createCustomToken(found.uid, { migrated: true });
    return { ok: true, uid: found.uid, token, email: found.email };
  } catch (e) {
    console.error('[mintCustomTokenByEmail] error', e);
    if (e instanceof HttpsError) throw e;
    throw new HttpsError('internal', e?.message || 'Echec création custom token');
  }
});

// HTTP variant for environments where callable requests are blocked/misconfigured.
// Expects JSON body: {"email":"..."} and returns { ok, uid, token, email }.
exports.mintCustomTokenByEmailHttp = onRequest({ region: 'europe-west9' }, async (req, res) => {
  const allowedOrigins = [
    'https://cactus-labs.fr',
    'http://localhost:5173', 'http://127.0.0.1:5173',
    'http://localhost:5174', 'http://127.0.0.1:5174',
  ];
  const origin = req.headers.origin;
  const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  const setCors = () => {
    const reqAllowed = (req.headers['access-control-request-headers'] || 'Content-Type').toString();
    res.set({
      'Access-Control-Allow-Origin': allowOrigin,
      'Vary': 'Origin',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': reqAllowed,
      'Access-Control-Max-Age': '86400',
    });
  };

  if (req.method === 'OPTIONS') {
    setCors();
    return res.status(204).send('');
  }
  if (req.method !== 'POST') {
    setCors();
    return res.status(405).json({ ok: false, error: 'Méthode non autorisée' });
  }
  setCors();

  try {
    let body;
    try {
      body = typeof req.body === 'object' ? req.body : JSON.parse(req.rawBody?.toString('utf8') || '{}');
    } catch {
      body = {};
    }
    const email = typeof body.email === 'string' ? body.email : '';
    if (!email) return res.status(400).json({ ok: false, error: 'email requis' });

    const dbEmail = email.trim().toLowerCase();
    const candidates = [dbEmail];
    if (dbEmail.endsWith('@orange.mars-marketing.fr')) {
      const local = dbEmail.split('@')[0];
      candidates.push(`${local}@mars-marketing.fr`);
    }
    if (dbEmail.endsWith('@mars-marketing.fr')) {
      const local = dbEmail.split('@')[0];
      candidates.push(`${local}@orange.mars-marketing.fr`);
    }

    let found = null;
    for (const e of candidates) {
      try {
        found = await admin.auth().getUserByEmail(e);
        break;
      } catch {
        // continue
      }
    }
    if (!found) return res.status(404).json({ ok: false, error: 'Aucun utilisateur pour cet email (ni alias)' });

    const token = await admin.auth().createCustomToken(found.uid, { migrated: true });
    return res.json({ ok: true, uid: found.uid, token, email: found.email });
  } catch (e) {
    console.error('[mintCustomTokenByEmailHttp] error', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Erreur serveur' });
  }
});

// =============================================================
// updatePrimaryEmailIfMicrosoftLinked
// Admin/self callable: migrate a user's primary email to @orange.mars-marketing.fr
// Works from any source domain (mars-marketing.fr, gmail.com, etc.) by defaulting
// to the caller's UID when email lookups don't match. Requires Microsoft provider
// to be linked (unless admin uses force). Prevents accidental UID duplication.
// =============================================================
exports.updatePrimaryEmailIfMicrosoftLinked = onCall({ region: 'europe-west9' }, async (req) => {
  const { auth } = req;
  if (!auth || !auth.token) {
    throw new HttpsError('unauthenticated', 'Authentification requise');
  }

  const { localPart, targetEmail, force } = req.data || {};
  let lpInput = typeof localPart === 'string' ? localPart.trim().toLowerCase() : '';
  let target = typeof targetEmail === 'string' ? targetEmail.trim().toLowerCase() : '';
  // Fallback: prendre localPart depuis l'email courant si non fourni
  const callerEmail = (auth.token.email || '').toLowerCase();
  if (!lpInput && callerEmail.includes('@')) {
    lpInput = callerEmail.split('@')[0];
  }
  // If a full target email is provided, prefer it (must be @orange.mars-marketing.fr)
  if (target) {
    if (!/@orange\.mars-marketing\.fr$/i.test(target)) {
      throw new HttpsError('invalid-argument', 'targetEmail doit être @orange.mars-marketing.fr');
    }
    const [loc] = target.split('@');
    if (!loc || /[^a-z0-9._-]/.test(loc)) {
      throw new HttpsError('invalid-argument', 'targetEmail invalide');
    }
  }
  if (!target) {
    if (!lpInput) {
      throw new HttpsError('invalid-argument', 'localPart requis ou impossible à déduire');
    }
    if (/[^a-z0-9._-]/.test(lpInput)) {
      throw new HttpsError('invalid-argument', 'localPart invalide');
    }
  }

  const desiredEmail = target || `${lpInput}@orange.mars-marketing.fr`;
  const legacyEmail = `${(target ? desiredEmail.split('@')[0] : lpInput)}@mars-marketing.fr`;

  // Toujours migrer le compte de l'appelant (évite les 403 si localPart diffère)
  let userRecord = null;
  let alreadyMigrated = false;
  try {
    userRecord = await admin.auth().getUser(auth.uid);
    alreadyMigrated = ((userRecord.email || '').toLowerCase() === desiredEmail);
  } catch (e3) {
    throw new HttpsError('not-found', 'Utilisateur appelant introuvable');
  }

  const callerIsAdmin = isAdminFromToken(auth.token);
  const callerIsSelf = auth.uid === userRecord.uid;
  if (!callerIsAdmin && !callerIsSelf) {
    throw new HttpsError('permission-denied', 'Opération réservée au compte lui-même ou aux administrateurs');
  }

  // Si déjà migré et c'est le même UID -> pas d'action
  if (alreadyMigrated) {
    return { ok: true, skipped: true, uid: userRecord.uid, email: userRecord.email };
  }

  // Vérifier provider Microsoft lié (sécurité migration) sauf si admin force
  const hasMicrosoft = Array.isArray(userRecord.providerData) && userRecord.providerData.some(p => p && p.providerId === 'microsoft.com');
  if (!hasMicrosoft && !callerIsAdmin && !force) {
    throw new HttpsError('failed-precondition', 'Provider Microsoft non lié. Liez Microsoft avant de migrer.');
  }

  // Vérifier collision nouvel email
  try {
    const existingNew = await admin.auth().getUserByEmail(desiredEmail);
    if (existingNew && existingNew.uid !== userRecord.uid) {
      throw new HttpsError('already-exists', 'Nouvel email déjà utilisé par un autre UID');
    }
    if (existingNew && existingNew.uid === userRecord.uid) {
      return { ok: true, skipped: true, uid: userRecord.uid, email: existingNew.email };
    }
  } catch (e) { /* si non trouvé: OK */ }

  try {
    await admin.auth().updateUser(userRecord.uid, { email: desiredEmail });
  } catch (e) {
    if (e && e.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'Nouvel email déjà utilisé');
    }
    throw new HttpsError('internal', 'Echec mise à jour email');
  }

  try {
    await admin.firestore().collection('users').doc(userRecord.uid).set({ email: desiredEmail, migratedEmailAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  } catch (e) {
    console.warn('[updatePrimaryEmailIfMicrosoftLinked] Firestore update failed', e);
  }

  return { ok: true, uid: userRecord.uid, oldEmail: legacyEmail, newEmail: desiredEmail };
});

// HTTP wrapper with CORS for updatePrimaryEmailIfMicrosoftLinked
// Allows calling via fetch POST when httpsCallable is not used.
exports.updatePrimaryEmailIfMicrosoftLinkedHttp = onRequest({ region: 'europe-west9' }, async (req, res) => {
  const allowedOrigins = [
    'https://cactus-tech.fr',
    'https://www.cactus-tech.fr',
    'https://cactus-labs.fr',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174'
  ];
  const reqOrigin = req.headers.origin;
  const allowOrigin = allowedOrigins.includes(reqOrigin) ? reqOrigin : allowedOrigins[0];
  const setCors = () => {
    res.set({
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Credentials': 'true',
      'Vary': 'Origin',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
  };

  // Preflight
  if (req.method === 'OPTIONS') {
    setCors();
    return res.status(204).send('');
  }

  if (req.method !== 'POST') {
    setCors();
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  setCors();
  try {
    // Emulate callable auth using Firebase Auth ID token from Authorization: Bearer
    const authHeader = req.headers.authorization || '';
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!m) {
      setCors();
      return res.status(401).json({ error: 'Token Firebase requis (Authorization: Bearer <idToken>)' });
    }
    const idToken = m[1];
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (e) {
      setCors();
      return res.status(401).json({ error: 'Token invalide', details: e && e.message });
    }

    const body = (() => {
      if (typeof req.body === 'object') return req.body;
      try { return JSON.parse(req.rawBody?.toString('utf8') || '{}'); } catch { return {}; }
    })();

    const { localPart, targetEmail, force } = body || {};
    let lpInput = typeof localPart === 'string' ? localPart.trim().toLowerCase() : '';
    let target = typeof targetEmail === 'string' ? targetEmail.trim().toLowerCase() : '';
    const callerEmail = (decoded.email || '').toLowerCase();
    if (!lpInput && !target && callerEmail.includes('@')) lpInput = callerEmail.split('@')[0];
    if (target) {
      if (!/@orange\.mars-marketing\.fr$/i.test(target)) {
        return res.status(400).json({ error: 'targetEmail doit être @orange.mars-marketing.fr' });
      }
      const [loc] = target.split('@');
      if (!loc || /[^a-z0-9._-]/.test(loc)) {
        return res.status(400).json({ error: 'targetEmail invalide' });
      }
    }
    if (!target) {
      if (!lpInput) return res.status(400).json({ error: 'localPart requis ou impossible à déduire' });
      if (/[^a-z0-9._-]/.test(lpInput)) return res.status(400).json({ error: 'localPart invalide' });
    }

    const desiredEmail = target || `${lpInput}@orange.mars-marketing.fr`;
    const legacyEmail = `${(target ? desiredEmail.split('@')[0] : lpInput)}@mars-marketing.fr`;

    // Toujours migrer le compte de l'appelant (évite les 403 si localPart diffère)
    let userRecord = null;
    let alreadyMigrated = false;
    try {
      userRecord = await admin.auth().getUser(decoded.uid);
      alreadyMigrated = ((userRecord.email || '').toLowerCase() === desiredEmail);
    } catch (e3) {
      return res.status(404).json({ error: 'Utilisateur appelant introuvable' });
    }

    const callerIsAdmin = isAdminFromToken(decoded);
    const callerIsSelf = decoded.uid === userRecord.uid;
    if (!callerIsAdmin && !callerIsSelf) {
      setCors();
      return res.status(403).json({ error: 'Opération réservée au compte lui-même ou aux administrateurs' });
    }

    if (alreadyMigrated) {
      return res.json({ ok: true, skipped: true, uid: userRecord.uid, email: userRecord.email });
    }

    const hasMicrosoft = Array.isArray(userRecord.providerData) && userRecord.providerData.some(p => p && p.providerId === 'microsoft.com');
    if (!hasMicrosoft && !callerIsAdmin && !force) {
      setCors();
      return res.status(412).json({ error: 'Provider Microsoft non lié. Liez Microsoft avant de migrer.' });
    }

    try {
      const existingNew = await admin.auth().getUserByEmail(desiredEmail);
      if (existingNew && existingNew.uid !== userRecord.uid) {
        setCors();
        return res.status(409).json({ error: 'Nouvel email déjà utilisé par un autre UID' });
      }
      if (existingNew && existingNew.uid === userRecord.uid) {
        return res.json({ ok: true, skipped: true, uid: userRecord.uid, email: existingNew.email });
      }
    } catch (e) { /* non trouvé OK */ }

    try {
      await admin.auth().updateUser(userRecord.uid, { email: desiredEmail });
    } catch (e) {
      if (e && e.code === 'auth/email-already-exists') {
        setCors();
        return res.status(409).json({ error: 'Nouvel email déjà utilisé' });
      }
      setCors();
      return res.status(500).json({ error: 'Echec mise à jour email', details: e && e.message });
    }

    try {
      await admin.firestore().collection('users').doc(userRecord.uid).set({ email: desiredEmail, migratedEmailAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    } catch (e) {
      console.warn('[updatePrimaryEmailIfMicrosoftLinkedHttp] Firestore update failed', e);
    }

    return res.json({ ok: true, uid: userRecord.uid, oldEmail: legacyEmail, newEmail: desiredEmail });
  } catch (err) {
    console.error('[updatePrimaryEmailIfMicrosoftLinkedHttp] Error', err);
    setCors();
    return res.status(500).json({ error: 'Internal error', details: err && err.message });
  }
});

const LEADS_MISSION = "ORANGE_LEADS";

const normalizeString = (value, { maxLength } = {}) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (maxLength && trimmed.length > maxLength) {
    return trimmed.slice(0, maxLength);
  }
  return trimmed;
};

const sanitizeAdditionalOffers = (input) => {
  if (!Array.isArray(input)) return [];
  return input
    .map((offer) => {
      const intituleOffre = normalizeString(offer?.intituleOffre, { maxLength: 150 });
      const referencePanier = normalizeString(offer?.referencePanier, { maxLength: 120 });
      if (!intituleOffre || !referencePanier) return null;
      return { intituleOffre, referencePanier };
    })
    .filter(Boolean);
};

const categorizeLeadOffer = (typeOffre) => {
  const type = normalizeString(typeOffre).toLowerCase();
  const zero = { mobile: 0, box: 0, mobileSosh: 0, internetSosh: 0 };
  switch (type) {
    case "mobile":
      return { ...zero, mobile: 1 };
    case "internet":
      return { ...zero, box: 1 };
    case "internetsosh":
      return { ...zero, internetSosh: 1 };
    case "mobilesosh":
      return { ...zero, mobileSosh: 1 };
    case "internet + mobile":
      return { ...zero, mobile: 1, box: 1 };
    case "internetsosh + mobilesosh":
      return { ...zero, internetSosh: 1, mobileSosh: 1 };
    default:
      return zero;
  }
};

exports.submitLeadSale = onCall({ region: "europe-west9" }, async (req) => {
  const { auth } = req;
  const data = req.data || {};

  if (!auth || !auth.uid) {
    throw new HttpsError("unauthenticated", "Authentification requise pour enregistrer une vente.");
  }

  const numeroId = normalizeString(data.numeroId, { maxLength: 120 });
  const typeOffre = normalizeString(data.typeOffre, { maxLength: 120 });
  const ficheDuJour = normalizeString(data.ficheDuJour, { maxLength: 80 }).toLowerCase();
  const origineLead = normalizeString(data.origineLead, { maxLength: 30 }).toLowerCase();
  const telephoneRaw = normalizeString(data.telephone, { maxLength: 40 });
  const telephone = telephoneRaw.replace(/\s+/g, "");
  const dateTechnicien = normalizeString(data.dateTechnicien || "", { maxLength: 20 }) || null;
  const intituleOffre = normalizeString(data.intituleOffre, { maxLength: 200 });
  const referencePanier = normalizeString(data.referencePanier, { maxLength: 120 });
  const additionalOffers = sanitizeAdditionalOffers(data.additionalOffers);
  // Region cloisonnement (FR par défaut si valeur absente/invalide)
  let region = (data && typeof data.region === 'string' ? data.region.toUpperCase().trim() : 'FR');
  if (region !== 'FR' && region !== 'CIV') region = 'FR';

  // Logging non-sensible pour diagnostic (sans données personnelles brutes)
  try {
    console.log('[submitLeadSale] input-summary', {
      uid: auth.uid,
      numeroIdLen: numeroId ? numeroId.length : 0,
      typeOffre,
      ficheDuJour,
      origineLead,
      telephoneLen: telephone ? telephone.length : 0,
      hasDateTechnicien: !!dateTechnicien,
      additionalOffersCount: Array.isArray(additionalOffers) ? additionalOffers.length : 0,
    });
  } catch (e) {
    // ignore logging failures
  }

  if (!numeroId) {
    throw new HttpsError("invalid-argument", "Le numéro d'identification est requis.");
  }
  if (!typeOffre) {
    throw new HttpsError("invalid-argument", "Le type d'offre est requis.");
  }
  if (!intituleOffre) {
    throw new HttpsError("invalid-argument", "L'intitulé de l'offre est requis.");
  }
  if (!referencePanier) {
    throw new HttpsError("invalid-argument", "La référence panier est requise.");
  }
  if (!ficheDuJour) {
    throw new HttpsError("invalid-argument", "La fiche du jour est requise.");
  }
  if (!origineLead || !["hipto", "dolead", "mm"].includes(origineLead)) {
    throw new HttpsError("invalid-argument", "Origine du lead invalide.");
  }
  if (!telephone) {
    throw new HttpsError("invalid-argument", "Le numéro de téléphone est requis.");
  }

  const categorized = categorizeLeadOffer(typeOffre);

  const doc = {
    numeroId,
    typeOffre,
    dateTechnicien,
    intituleOffre,
    referencePanier,
    additionalOffers,
    ficheDuJour,
    origineLead,
    telephone,
    mission: LEADS_MISSION,
  region,
    mobileCount: categorized.mobile,
    boxCount: categorized.box,
    mobileSoshCount: categorized.mobileSosh,
    internetSoshCount: categorized.internetSosh,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: {
      userId: auth.uid,
      displayName: normalizeString(auth.token?.name || auth.token?.displayName || "", { maxLength: 120 }),
      email: normalizeString(auth.token?.email || "", { maxLength: 160 }),
    },
  };

  try {
    const ref = await admin.firestore().collection("leads_sales").add(doc);
    return { success: true, id: ref.id };
  } catch (error) {
    console.error("[submitLeadSale] failed", {
      code: error && error.code,
      message: error && error.message,
      stack: error && error.stack,
    });
    throw new HttpsError("internal", "Enregistrement impossible pour le moment.", {
      rawCode: error?.code || 'unknown',
    });
  }
});

exports.sendSaleNotification = onCall(
  { region: "europe-west9" },
  async (req) => {
    const { sale, isConsentUpdate } = req.data;
    const subject = "📝 Nouvelle vente enregistrée";
    const html = buildHtml(sale, "Nouvelle vente enregistrée.");

    if (sale.consent === "yes" && isConsentUpdate) {
      await Promise.allSettled([
        sendEmail({
          to: "m.demauret@mars-marketing.fr",
          subject: "✅ Une vente a été consentie",
          html: buildHtml(sale, "La vente a été confirmée par le client."),
        }),
        sendEmail({
          to: "i.boultame@mars-marketing.fr",
          subject: "🔄 Confirmation d'une vente",
          html: buildHtml(sale, "La vente est maintenant consentie."),
        }),
      ]);
      return { success: true };
    }

    if (sale.consent === "yes") {
      await Promise.allSettled([
        sendEmail({ to: "m.demauret@mars-marketing.fr", subject, html }),
        sendEmail({ to: "i.boultame@mars-marketing.fr", subject, html }),
      ]);
    } else if (sale.consent === "pending") {
      await sendEmail({ to: "i.boultame@mars-marketing.fr", subject, html });
    }

    return { success: true };
  }
);

exports.sendProgramme = onCall({ region: "europe-west9" }, async () => {
  const programmes = await fetchProgrammes();
  if (!programmes.length) {
    console.log("Aucun programme à envoyer.");
    return { success: false };
  }

  const html = buildProgrammeEmailHTML(programmes);

  const recipients = [
    "a.rouhier@mars-marketing.fr",
    "e.brunet@mars-marketing.fr",
    "e.guengant@mars-marketing.fr",
    "e.soba@mars-marketing.fr",
    "f.diagne@mars-marketing.fr",
    "i.brai@mars-marketing.frc",
    "j.chuttoo@mars-marketing.fr",
    "j.mbassidje@mars-marketing.fr",
    "m.yikik@mars-marketing.fr",
    "r.sellal@mars-marketing.fr",
    "s.dekhil@mars-marketing.fr",
    "v.bacouillard@mars-marketing.fr",
    "w.nechmi@mars-marketing.fr",
    "i.boultame@mars-marketing.fr",
    "m.maimoun@mars-marketing.fr",
  ];

  await Promise.allSettled(
    recipients.map((email) =>
      sendEmail({
        to: email,
        subject: `🎬 Programme du ${new Date().toLocaleDateString("fr-FR")}`,
        html,
      })
    )
  );

  console.log(`✅ Programme envoyé à : ${recipients.join(", ")}`);

  return { success: true, recipients };
});

// =============================================================
// Password reset via Sweego
// - Generates a Firebase Auth password reset link using Admin SDK
// - Sends the link by email via Sweego (same sender as other mails)
// - Hides user enumeration (returns generic success when user not found)
// Endpoint: POST /api/request-password-reset { email, redirectUrl? }
// =============================================================
exports.requestPasswordReset = onRequest({ region: 'europe-west9', secrets: [SWEEGO_API_KEY] }, async (req, res) => {
  const allowedOrigins = [
    'https://cactus-labs.fr',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174'
  ];
  const origin = req.headers.origin;
  const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  const setCors = () => {
    res.set({
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Credentials': 'true',
      'Vary': 'Origin',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    });
  };

  if (req.method === 'OPTIONS') {
    setCors();
    return res.status(204).send('');
  }
  if (req.method !== 'POST') {
    setCors();
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  setCors();
  const body = (() => {
    if (typeof req.body === 'object') return req.body;
    try { return JSON.parse(req.rawBody?.toString('utf8') || '{}'); } catch { return {}; }
  })();
  const email = (body?.email || '').toString().trim().toLowerCase();
  const inferredRedirect = () => {
    // Force the reset link to use cactus-labs.fr to avoid NXDOMAIN issues
    return `https://cactus-labs.fr/auth/action`;
  };
  const redirectUrl = (body?.redirectUrl || inferredRedirect()).toString();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'Email invalide' });
  }

  try {
    let link = '';
    try {
      link = await admin.auth().generatePasswordResetLink(email, {
        url: redirectUrl,
        handleCodeInApp: true,
      });
    } catch (e) {
      // Cacher l’existence/non‑existence: si user-not-found, répondre comme succès sans envoyer
      if (e && e.code === 'auth/user-not-found') {
        return res.json({ success: true, sent: false });
      }
      // Si le domaine de redirection n'est pas autorisé ou l'URL invalide, tenter sans URL (utilise la configuration par défaut du projet)
      const code = e?.code || '';
      if (code === 'auth/invalid-continue-uri' || code === 'auth/unauthorized-continue-uri') {
        try {
          link = await admin.auth().generatePasswordResetLink(email);
        } catch (e2) {
          console.error('[requestPasswordReset] fallback without redirect failed', e2);
          // Ne pas bloquer l’UI: on considère succès même sans envoi
          return res.json({ success: true, sent: false });
        }
      } else {
        console.error('[requestPasswordReset] generate link failed', e);
        // Ne pas bloquer l’UI: on considère succès même sans envoi
        return res.json({ success: true, sent: false });
      }
    }

    const html = `
<!DOCTYPE html>
<html lang="fr">
  <head><meta charset="UTF-8" /></head>
  <body style="margin:0; padding:24px; font-family:Arial, sans-serif; background:#f7f7f8;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px; margin:0 auto; background:#fff; border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,0.06);">
      <tr><td style="padding:24px;">
        <h2 style="margin:0 0 8px; color:#0f172a;">Réinitialisation du mot de passe</h2>
        <p style="margin:0 0 16px; color:#334155;">Cliquez sur le bouton ci‑dessous pour définir un nouveau mot de passe. Si vous n’êtes pas à l’origine de cette demande, ignorez cet email.</p>
        <p style="margin:24px 0;">
          <a href="${link}" style="display:inline-block; background:#00c08b; color:#fff; padding:12px 18px; border-radius:8px; text-decoration:none; font-weight:600;">Réinitialiser le mot de passe</a>
        </p>
        <p style="font-size:13px; color:#64748b; margin:0 0 8px;">Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur :</p>
        <p style="font-size:12px; color:#0f172a; word-break:break-all;">${link}</p>
        <p style="font-size:12px; color:#64748b;">Le lien expirera automatiquement après un délai de sécurité.</p>
      </td></tr>
    </table>
  </body>
</html>`;

    try {
      const apiKey = (SWEEGO_API_KEY && SWEEGO_API_KEY.value && SWEEGO_API_KEY.value()) || process.env.SWEEGO_API_KEY;
      await sendEmail({ to: email, subject: '🔐 Réinitialisation du mot de passe', html, apiKey });
      return res.json({ success: true, sent: true });
    } catch (mailErr) {
      console.error('[requestPasswordReset] sendEmail failed, returning success without send', mailErr);
      // Ne bloque pas l’utilisateur: on considère succès même si l’email n’a pas pu être envoyé
      return res.json({ success: true, sent: false });
    }
  } catch (e) {
    console.error('[requestPasswordReset] error', e);
    return res.status(500).json({ error: 'Envoi email impossible' });
  }
});

exports.sendProgrammeScheduled = onSchedule(
  {
    schedule: "30 09 * * 1-5", // Du lundi au vendredi à 09:30 (heure de Paris)
    timeZone: "Europe/Paris",
    region: "europe-west1",
  },
  async () => {
    const programmes = await fetchProgrammes();
    if (!programmes.length) {
      console.log("Aucun programme à envoyer.");
      return;
    }

    const html = buildProgrammeEmailHTML(programmes);

    const recipients = [
      "a.rouhier@mars-marketing.fr",
      "e.brunet@mars-marketing.fr",
      "e.guengant@mars-marketing.fr",
      "e.soba@mars-marketing.fr",
      "f.diagne@mars-marketing.fr",
      "i.brai@mars-marketing.frc",
      "j.chuttoo@mars-marketing.fr",
      "j.mbassidje@mars-marketing.fr",
      "m.yikik@mars-marketing.fr",
      "r.sellal@mars-marketing.fr",
      "s.dekhil@mars-marketing.fr",
      "v.bacouillard@mars-marketing.fr",
      "w.nechmi@mars-marketing.fr",
      "i.boultame@mars-marketing.fr",
      "m.maimoun@mars-marketing.fr",
    ];

    await Promise.allSettled(
      recipients.map((email) =>
        sendEmail({
          to: email,
          subject: `🎬 Programme du ${new Date().toLocaleDateString("fr-FR")}`,
          html,
        })
      )
    );

    console.log(`✅ Programme envoyé à : ${recipients.join(", ")}`);
  }
);

const offerLabels = {
  canal: "CANAL+",
  "canal-cine-series": "CANAL+ Ciné Séries",
  "canal-sport": "CANAL+ Sport",
  "canal-100": "CANAL+ 100%",
};

function buildHtml(sale, message) {
  const offer = offerLabels[sale.offer] || sale.offer;
  const consent = sale.consent === "yes" ? "✅ Oui" : "⏳ En attente";

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Notification de vente</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f4; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" style="background-color:#ffffff; border-radius:8px; box-shadow:0 0 10px rgba(0,0,0,0.05); overflow:hidden;">
          <tr>
            <td style="background-color:#007b5f; padding:20px; text-align:center; color:#ffffff;">
              <h1 style="margin:0; font-size:22px;">${message}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:30px; font-size:16px; color:#333;">
              <p style="margin-top:0;">Bonjour,</p>
              <p>Voici les détails de la vente enregistrée :</p>
              <table width="100%" style="border-collapse: collapse;">
                <tr>
                  <td style="padding:8px; font-weight:bold;">Nom :</td>
                  <td style="padding:8px;">${sale.name}</td>
                </tr>
                <tr style="background-color:#f9f9f9;">
                  <td style="padding:8px; font-weight:bold;">Commande :</td>
                  <td style="padding:8px;">${sale.orderNumber}</td>
                </tr>
                <tr>
                  <td style="padding:8px; font-weight:bold;">Offre :</td>
                  <td style="padding:8px;">${offer}</td>
                </tr>
                <tr style="background-color:#f9f9f9;">
                  <td style="padding:8px; font-weight:bold;">Consentement :</td>
                  <td style="padding:8px;">${consent}</td>
                </tr>
              </table>
              <div style="text-align:center; margin:30px 0;">
                <a href="https://cactus-tech.fr" target="_blank" style="background-color:#00c08b; color:#ffffff; text-decoration:none; padding:12px 24px; border-radius:5px; font-size:16px;">Accéder à Cactus-Tech</a>
              </div>
              <p style="font-size:14px; color:#999;">L’équipe Cactus-Tech 🌵</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#e0e0e0; padding:15px; text-align:center; font-size:12px; color:#666;">
              Cet email est une notification automatique suite à l'enregistrement d'une vente.
              <br>
              <a href="mailto:support@cactus-tech.fr" style="color:#007b5f; text-decoration:underline;">Contact support</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendEmail({ to, subject, html, apiKey }) {
  // Récupération clé Sweego depuis config Firebase Functions ou variable d'env fallback
  // Cloud Functions Gen2: functions.config() n'est plus supporté.
  // Utiliser uniquement une variable d'environnement (ex: SWEEGO_API_KEY)
  apiKey = apiKey || process.env.SWEEGO_API_KEY;
  if (!apiKey) {
    console.error('[sendEmail] Clé API Sweego manquante (config sweego.apikey ou env SWEEGO_API_KEY). Email NON envoyé:', { to, subject });
    return; // On n'essaie pas l'appel sans clé
  }

  const data = {
    channel: "email",
    provider: "sweego",
    recipients: [{ email: to }],
    from: {
      email: "no-reply@cactus-labs.fr",
      name: "Cactus",
    },
    subject,
    "message-html": html,
  };

  try {
    const response = await axios.post("https://api.sweego.io/send", data, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Api-Key": apiKey,
      },
      timeout: 10000,
      validateStatus: (s) => s < 500 // laisser passer 4xx pour logging
    });
    if (response.status >= 200 && response.status < 300) {
      console.log(`✅ [Sweego] Email envoyé à ${to}:`, response.data);
    } else {
      console.error(`⚠️ [Sweego] Statut inattendu ${response.status} pour ${to}:`, response.data);
    }
  } catch (err) {
    console.error(`❌ [Sweego] Échec envoi email à ${to}:`, err.response?.data || err.message);
  }
}

function normalize(str) {
  return str
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function extractChaineFromAltText(altText) {
  const match = altText?.match(/Sur ([^,{]+)/i);
  return match ? match[1].trim().toUpperCase() : null;
}

async function fetchProgrammes() {
  const baseUrl =
    "https://hodor.canalplus.pro/api/v2/mycanal/strateContent/a666110cb2368353fd52f10778be9395/pfs/spyro/contents/avoircesoir-home:0.json";

  const params = new URLSearchParams({
    displayNBOLogo: "false",
    discoverMode: "true",
    dsp: "detailPage",
    sdm: "show",
    displayLogo: "true",
    imageRatio: "169",
    imageSize: "normal",
    distmodes: "catchup,live,svod",
    titleDisplayMode: "all",
    context_type: "edito",
    context_list_category: "contentGrid (no title)",
    context_page_title: "Guide - Grille TV HAPI - J - Ce soir",
    context_list_title: "contentGrid (no title)",
    context_list_id: "avoircesoir-home:0",
    context_list_type: "contentGrid",
    context_list_position: "1",
    context_layout_title: "[Web] Programme TV ce soir prospect",
    maxContentNumber: "73",
    provideBroadcastInformation: "true",
    selectedBroadcast: "next",
    maxContentRemaining: "59",
    get: "50",
  });

  const res = await fetch(`${baseUrl}?${params.toString()}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  const data = await res.json();
  const allItems = data.contents || [];

  const ALLOWED_CHAINES = [
    "CANAL+",
    "CANAL+ BOX OFFICE",
    "CANAL+ GRAND ECRAN",
    "CANAL+ SPORT 360",
    "CANAL+ SERIES",
    "CANAL+ DOCS",
    "CANAL+ SPORT",
    "CANAL+ FOOT",
    "CANAL+ CINEMA(S)",
    "CANAL+ A LA DEMANDE",
    "APPLE TV+",
    "MAX",
    "NETFLIX AVEC PUB",
    "PARAMOUNT+",
    "CINE+ OCS",
    "INSOMNIA",
    "BEIN SPORTS",
    "EUROSPORT",
    "PASS COUPES D'EUROPE",
    "INFOSPORT+",
  ].map(normalize);

  const seen = new Set();

  return allItems.filter((item) => {
    const id = item.contentID || item.epgID;
    if (!id || seen.has(id)) return false;
    seen.add(id);

    const altText = item.altText || "";
    const match = altText.match(/Sur ([^,{]+)/i);
    const rawChaine = match ? match[1] : item.altLogoChannel;
    const clean = normalize(rawChaine);

    if (ALLOWED_CHAINES.includes(clean)) {
      item._cleanChaine = rawChaine;
      return true;
    }
    return false;
  });
}

function buildProgrammeEmailHTML(items) {
  const formatHour = (ms) =>
    new Date(ms).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });

  const cards = items
    .map((item) => {
      const heure = formatHour(item.startTime);
      const imgJaquette = item.URLImage.replace(
        "{resolutionXY}",
        "600x338"
      ).replace("{imageQualityPercentage}", "95");

      const imgLogo = item.URLLogoChannel
        ? item.URLLogoChannel.replace("{resolutionXY}", "96x72").replace(
            "{imageQualityPercentage}",
            "95"
          )
        : null;

      const isEurosport = item._cleanChaine
        ?.toUpperCase()
        .includes("EUROSPORT");

      return `
        <table width="300" cellpadding="0" cellspacing="0" style="margin:10px; font-family:sans-serif; border-collapse:collapse;">
          <tr>
            <td style="padding:0;">
              <div style="position:relative;">
                <img src="${imgJaquette}" width="300" style="display:block; border-radius:8px;" />
                ${
                  imgLogo
                    ? `<div style="position:relative; top:-40px; left:10px;">
                        <img src="${imgLogo}" alt="${
                        item._cleanChaine
                      }" height="32"
                          style="background:${
                            isEurosport ? "#000" : "#fff"
                          }; border-radius:4px; padding:2px; ${
                        isEurosport ? "border: 1px solid white;" : ""
                      }" />
                      </div>`
                    : ""
                }
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding-top:4px;">
              <strong style="font-size:15px;">${heure} - ${
        item.title
      }</strong><br/>
              <span style="font-size:13px;">${item._cleanChaine}</span>
            </td>
          </tr>
        </table>
      `;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html lang="fr">
      <head><meta charset="UTF-8" /></head>
      <body style="margin:0; padding:30px; font-family:sans-serif;">
        <h2>Programme TV du ${new Date().toLocaleDateString("fr-FR")}</h2>
        <center>
          <table cellpadding="0" cellspacing="0" style="width:100%; max-width:700px;">
            <tr>
              <td align="center" style="display:flex; flex-wrap:wrap; justify-content:center;">
                ${cards}
              </td>
            </tr>
          </table>
        </center>
      </body>
    </html>
  `;
}

// Assure que "registerUser" reste un callable (évite l'erreur de changement de type)
exports.registerUser = onCall({ region: "europe-west9" }, async (req) => {
  const { email, password, firstName, lastName } = req.data || {};

  if (!email || !password || !firstName || !lastName) {
    throw new HttpsError("invalid-argument", "Tous les champs sont requis");
  }

  try {
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: `${firstName} ${lastName}`,
    });

    await admin.firestore().collection("users").doc(userRecord.uid).set({
      firstName,
      lastName,
      email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await admin
      .firestore()
      .collection("gameCredits")
      .doc(userRecord.uid)
      .set(
        {
          userId: userRecord.uid,
          credits: 100,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    return { uid: userRecord.uid, success: true };
  } catch (error) {
    const code = error.code || "internal";
    const message = error.message || "Erreur interne";
    throw new HttpsError("internal", message, { rawCode: code });
  }
});
