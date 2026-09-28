#!/usr/bin/env node
// EtiquetaHub — archivo generado. Fuente en src/. No editar a mano.
'use strict';
const __path = require('path');
const __BASE = __path.join(__dirname, 'src');
const __defs = {}, __cache = {};
function __req(from, id) {
  if (!id.startsWith('.')) return require(id);
  const key = __path.posix.normalize(__path.posix.join(__path.posix.dirname(from), id));
  if (__cache[key]) return __cache[key].exports;
  if (!__defs[key]) throw new Error('Módulo no encontrado: ' + key);
  const module = { exports: {} }; __cache[key] = module;
  __defs[key](module, module.exports, x => __req(key, x), __path.join(__BASE, __path.posix.dirname(key)));
  return module.exports;
}

__defs["config"] = function (module, exports, require, __dirname) {
// Configuración leída desde variables de entorno (.env)
const fs = require('fs');
const path = require('path');

// Carga simple de .env sin dependencias
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const env = process.env;
const cfg = {
  port: Number(env.PORT || 3000),
  baseUrl: (env.BASE_URL || env.RENDER_EXTERNAL_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, ''),
  backupUrl: env.BACKUP_URL || (env.RENDER_GIT_REPO_SLUG ? `https://raw.githubusercontent.com/${env.RENDER_GIT_REPO_SLUG}/backup/db.enc` : ''),
  appSecret: env.APP_SECRET || '',
  dataDir: env.DATA_DIR || path.join(__dirname, '..', 'data'),
  demo: env.DEMO_MODE === '1',
  pollSeconds: Number(env.POLL_SECONDS || 120),
  lookbackDays: Number(env.LOOKBACK_DAYS || 3),
  cutoff: env.CUTOFF_TIME || '09:00',
  timezone: env.TZ_NAME || 'America/Santiago',
  admin: { email: env.ADMIN_EMAIL || '', password: env.ADMIN_PASSWORD || '', name: env.ADMIN_NAME || 'Administrador' },
  ml: {
    clientId: env.ML_CLIENT_ID || '',
    clientSecret: env.ML_CLIENT_SECRET || '',
    authHost: env.ML_AUTH_HOST || 'https://auth.mercadolibre.cl',
    apiHost: env.ML_API_HOST || 'https://api.mercadolibre.com',
  },
  falabella: {
    apiHost: env.FALABELLA_API_HOST || 'https://sellercenter-api.falabella.com',
    country: env.FALABELLA_COUNTRY || 'FACL',
  },
  paris: {
    apiHost: env.PARIS_API_HOST || 'https://api-developers.ecomm.cencosud.com',
  },
  // Recorte opcional de la etiqueta original antes de ajustarla a 100x150 mm.
  // Formato: "x,y,ancho,alto" en puntos PDF, medido desde la esquina inferior izquierda.
  crop: { ml: env.LABEL_CROP_ML || '', fa: env.LABEL_CROP_FA || '', pa: env.LABEL_CROP_PA || '' },
};

if (!cfg.appSecret) {
  if (cfg.demo) cfg.appSecret = 'demo-secret-no-usar-en-produccion-0123456789';
  else { console.error('Falta APP_SECRET en .env (usa una frase larga y aleatoria).'); process.exit(1); }
}
fs.mkdirSync(path.join(cfg.dataDir, 'labels'), { recursive: true });

module.exports = cfg;

};

__defs["db"] = function (module, exports, require, __dirname) {
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const cfg = require('./config');

const db = new DatabaseSync(path.join(cfg.dataDir, 'etiquetahub.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS sellers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','fulfillment','seller')),
  seller_id INTEGER REFERENCES sellers(id) ON DELETE CASCADE,
  pass_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  marketplace TEXT NOT NULL CHECK (marketplace IN ('ml','fa','pa','demo')),
  account_label TEXT,
  external_id TEXT,
  creds_enc TEXT NOT NULL,
  settings TEXT NOT NULL DEFAULT '{}',
  hook_secret TEXT,
  last_sync_at TEXT,
  last_error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (seller_id, marketplace)
);
CREATE TABLE IF NOT EXISTS blocklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  marketplace TEXT NOT NULL DEFAULT 'any',
  value TEXT NOT NULL COLLATE NOCASE,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (seller_id, marketplace, value)
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  connection_id INTEGER REFERENCES connections(id) ON DELETE SET NULL,
  marketplace TEXT NOT NULL,
  external_id TEXT NOT NULL,
  order_number TEXT NOT NULL,
  sold_at TEXT,
  items TEXT NOT NULL DEFAULT '[]',
  state TEXT NOT NULL DEFAULT 'waiting',
  label_file TEXT,
  label_at TEXT,
  printed_at TEXT,
  printed_by TEXT,
  error TEXT,
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE (marketplace, external_id)
);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(seller_id, created_at);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT DEFAULT (datetime('now')),
  seller_id INTEGER,
  kind TEXT,
  message TEXT
);
`);

db.exec(`CREATE TABLE IF NOT EXISTS sales (
  marketplace TEXT NOT NULL,
  external_id TEXT NOT NULL,
  seller_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  units INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (marketplace, external_id)
); CREATE INDEX IF NOT EXISTS sales_day ON sales (seller_id, day);
CREATE TABLE IF NOT EXISTS sale_items (
  marketplace TEXT NOT NULL,
  order_id TEXT NOT NULL,
  line INTEGER NOT NULL,
  seller_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  sku TEXT, pub_id TEXT, name TEXT, variant TEXT,
  qty INTEGER NOT NULL DEFAULT 1,
  amount REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (marketplace, order_id, line)
); CREATE INDEX IF NOT EXISTS sale_items_day ON sale_items (seller_id, day);
CREATE TABLE IF NOT EXISTS sales_sync (connection_id INTEGER PRIMARY KEY, backfilled_to TEXT);
CREATE TABLE IF NOT EXISTS item_family (marketplace TEXT NOT NULL, pub_id TEXT NOT NULL, family TEXT, fetched_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (marketplace, pub_id));`);

// Migraciones simples (columnas nuevas)
for (const [t, c, def] of [['users', 'must_change', 'INTEGER NOT NULL DEFAULT 0'], ['sessions', 'impersonator_id', 'INTEGER'], ['users', 'backup_hash', 'TEXT'], ['orders', 'block_no', 'INTEGER'], ['orders', 'unblocked_at', 'TEXT'], ['orders', 'unblocked_by', 'TEXT'], ['item_family', 'family_id', 'TEXT'], ['item_family', 'up_id', 'TEXT']]) {
  const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(x => x.name);
  if (!cols.includes(c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`);
}

// pedidos que quedaron apuntando a una conexión borrada (se desconectó y se volvió a conectar): se pasan a la conexión actual
try {
  db.exec(`UPDATE orders SET connection_id = (SELECT c.id FROM connections c WHERE c.seller_id = orders.seller_id AND c.marketplace = orders.marketplace ORDER BY c.id DESC LIMIT 1)
    WHERE connection_id NOT IN (SELECT id FROM connections)
      AND EXISTS (SELECT 1 FROM connections c WHERE c.seller_id = orders.seller_id AND c.marketplace = orders.marketplace)`);
} catch (e) { console.warn('[db] reasignar conexiones:', e.message); }

module.exports = db;

};

__defs["keys"] = function (module, exports, require, __dirname) {
// Clave de cifrado derivada de APP_SECRET y cifrado de archivos (sin depender de la base de datos)
const crypto = require('crypto');
const cfg = require('./config');

const KEY = crypto.createHash('sha256').update('etiquetahub:' + cfg.appSecret).digest();

function encryptBuf(buf) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const data = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([Buffer.from('EHB1'), iv, c.getAuthTag(), data]);
}
function decryptBuf(buf) {
  if (buf.slice(0, 4).toString() !== 'EHB1') throw new Error('Respaldo con formato desconocido');
  const iv = buf.slice(4, 16), tag = buf.slice(16, 32), data = buf.slice(32);
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]);
}
module.exports = { KEY, encryptBuf, decryptBuf };

};

__defs["security"] = function (module, exports, require, __dirname) {
// Contraseñas, sesiones y cifrado de credenciales de marketplaces
const crypto = require('crypto');
const cfg = require('./config');
const db = require('./db');

const { KEY } = require('./keys');

function encrypt(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map(b => b.toString('base64')).join('.');
}
function decrypt(str) {
  const [iv, tag, data] = str.split('.').map(s => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(data), d.final()]).toString('utf8'));
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64);
  return salt.toString('hex') + ':' + h.toString('hex');
}
function checkPassword(pw, stored) {
  const [salt, h] = stored.split(':');
  const test = crypto.scryptSync(pw, Buffer.from(salt, 'hex'), 64);
  return crypto.timingSafeEqual(test, Buffer.from(h, 'hex'));
}

const SESSION_DAYS = 30;
function createSession(userId, impersonatorId = null) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, expires_at, impersonator_id) VALUES (?,?,?,?)')
    .run(token, userId, Date.now() + (impersonatorId ? 1 : SESSION_DAYS) * 864e5, impersonatorId);
  return token;
}
function userFromToken(token) {
  if (!token) return null;
  const row = db.prepare(`SELECT u.id, u.email, u.name, u.role, u.seller_id, u.must_change, s.expires_at, s.impersonator_id FROM sessions s
    JOIN users u ON u.id = s.user_id WHERE s.token = ?`).get(token);
  if (!row || row.expires_at < Date.now()) return null;
  return row;
}
function destroySession(token) { db.prepare('DELETE FROM sessions WHERE token = ?').run(token); }

// Firma corta para el "state" de OAuth y enlaces de webhook
function sign(value) {
  return crypto.createHmac('sha256', KEY).update(String(value)).digest('base64url').slice(0, 32);
}
function randomId(n = 16) { return crypto.randomBytes(n).toString('hex'); }
// Clave de respaldo de un solo uso: ej. "RSP-7KQ2-M9XD"
function backupCode() {
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const part = () => Array.from({ length: 4 }, () => a[crypto.randomInt(a.length)]).join('');
  return `RSP-${part()}-${part()}`;
}
// Clave temporal fácil de dictar: ej. "Etq-4829-kmtp"
function tempPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  let w = ''; for (let i = 0; i < 4; i++) w += letters[crypto.randomInt(letters.length)];
  return `Etq-${String(crypto.randomInt(1000, 10000))}-${w}`;
}

module.exports = { encrypt, decrypt, hashPassword, checkPassword, createSession, userFromToken, destroySession, sign, randomId, tempPassword, backupCode };

};

__defs["settings"] = function (module, exports, require, __dirname) {
// Ajustes guardados en la base de datos (cifrados), editables desde la pantalla de administración
const db = require('./db');
const cfg = require('./config');
const { encrypt, decrypt } = require('./security');

db.exec('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value_enc TEXT NOT NULL)');

function get(key) {
  const r = db.prepare('SELECT value_enc FROM app_settings WHERE key=?').get(key);
  if (!r) return null;
  try { return decrypt(r.value_enc); } catch { return null; }
}
function set(key, value) {
  db.prepare('INSERT INTO app_settings (key, value_enc) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value_enc=excluded.value_enc').run(key, encrypt(value));
}
const mlClientId = () => cfg.ml.clientId || get('ml_client_id') || '';
const mlClientSecret = () => cfg.ml.clientSecret || get('ml_client_secret') || '';

module.exports = { get, set, mlClientId, mlClientSecret };

};

__defs["http"] = function (module, exports, require, __dirname) {
// Pequeño cliente HTTP con reintentos
class HttpError extends Error {
  constructor(status, body, url) {
    super(`HTTP ${status} en ${url.split('?')[0]}: ${String(body).slice(0, 300)}`);
    this.status = status; this.body = body;
  }
}
class NotReady extends Error {}

async function request(url, opts = {}, { retries = 2, as = 'json' } = {}) {
  let last;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(opts.timeout || 30000) });
      if (res.status === 429 || res.status >= 500) {
        last = new HttpError(res.status, await res.text(), url);
        await new Promise(r => setTimeout(r, 1500 * (i + 1)));
        continue;
      }
      if (!res.ok) throw new HttpError(res.status, await res.text(), url);
      if (as === 'buffer') return Buffer.from(await res.arrayBuffer());
      if (as === 'text') return res.text();
      const t = await res.text();
      return t ? JSON.parse(t) : null;
    } catch (e) {
      if (e instanceof HttpError && e.status < 500 && e.status !== 429) throw e;
      last = e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw last;
}

const isPdf = b => Buffer.isBuffer(b) && b.slice(0, 5).toString() === '%PDF-';

module.exports = { request, HttpError, NotReady, isPdf };

};

__defs["recovery"] = function (module, exports, require, __dirname) {
// Recuperación de contraseña con código de 6 dígitos enviado por correo (Brevo)
const crypto = require('crypto');
const db = require('./db');
const settings = require('./settings');
const { request } = require('./http');

db.exec(`CREATE TABLE IF NOT EXISTS password_codes (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
)`);

const CODE_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_HOUR = 4;
const hash = c => crypto.createHash('sha256').update('eh-code:' + c).digest('hex');

function mailConfig() {
  return { apiKey: settings.get('mail_api_key') || '', from: settings.get('mail_from') || '', fromName: settings.get('mail_from_name') || 'EtiquetaHub' };
}
const mailConfigured = () => { const c = mailConfig(); return Boolean(c.apiKey && c.from); };

async function sendMail(to, subject, html, text) {
  const c = mailConfig();
  if (!c.apiKey || !c.from) throw new Error('El envío de correos no está configurado');
  await request(process.env.BREVO_API_URL || 'https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': c.apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { email: c.from, name: c.fromName }, to: [{ email: to }], subject, htmlContent: html, textContent: text }),
  }, { retries: 1 });
}

// Siempre responde igual (no revela si el correo existe)
async function requestCode(email) {
  email = String(email || '').trim();
  const user = db.prepare('SELECT id, name FROM users WHERE email = ?').get(email);
  if (!user) return;
  const now = Date.now();
  const row = db.prepare('SELECT * FROM password_codes WHERE email = ?').get(email);
  let sent = 0, windowStart = now;
  if (row && now - row.window_start < 3600e3) { sent = row.sent_count; windowStart = row.window_start; }
  if (sent >= MAX_SENDS_PER_HOUR) return;
  const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  db.prepare(`INSERT INTO password_codes (email, code_hash, expires_at, attempts, sent_count, window_start) VALUES (?,?,?,?,?,?)
    ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at, attempts=0, sent_count=excluded.sent_count, window_start=excluded.window_start`)
    .run(email, hash(code), now + CODE_MINUTES * 60e3, 0, sent + 1, windowStart);
  const html = `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;border-radius:16px;background:#EAF5FC;color:#0C2B40">
    <h2 style="color:#0A6FA6;margin:0 0 8px">EtiquetaHub</h2>
    <p>Hola ${String(user.name).replace(/[<>&]/g, '')}, tu código para entrar es:</p>
    <p style="font-size:34px;font-weight:bold;letter-spacing:8px;background:#fff;border-radius:12px;padding:14px;text-align:center;margin:12px 0">${code}</p>
    <p style="font-size:13px;color:#557287">Vence en ${CODE_MINUTES} minutos. Si no lo pediste, ignora este correo: tu contraseña sigue igual.</p></div>`;
  await sendMail(email, `Tu código de EtiquetaHub: ${code}`, html, `Tu código de EtiquetaHub es ${code}. Vence en ${CODE_MINUTES} minutos.`);
}

// Verifica el código; si es correcto lo consume y devuelve el usuario
function verifyCode(email, code, consume = true) {
  email = String(email || '').trim();
  const row = db.prepare('SELECT * FROM password_codes WHERE email = ?').get(email);
  if (!row || row.expires_at < Date.now()) return { error: 'El código venció o no existe. Pide uno nuevo.' };
  if (row.attempts >= MAX_ATTEMPTS) return { error: 'Demasiados intentos. Pide un código nuevo.' };
  const ok = crypto.timingSafeEqual(Buffer.from(hash(String(code || '').trim())), Buffer.from(row.code_hash));
  if (!ok) {
    db.prepare('UPDATE password_codes SET attempts = attempts + 1 WHERE email = ?').run(email);
    const left = MAX_ATTEMPTS - row.attempts - 1;
    return { error: left > 0 ? `Código incorrecto. Te quedan ${left} intento${left === 1 ? '' : 's'}.` : 'Demasiados intentos. Pide un código nuevo.' };
  }
  if (consume) db.prepare('UPDATE password_codes SET expires_at = 0 WHERE email = ?').run(email);
  return { user: db.prepare('SELECT id FROM users WHERE email = ?').get(email) };
}

// Límite simple de intentos de ingreso con contraseña (por correo e IP)
const loginFails = new Map();
function loginBlocked(key) {
  const r = loginFails.get(key);
  return r && r.count >= 8 && Date.now() - r.first < 15 * 60e3;
}
function loginFailed(key) {
  const r = loginFails.get(key);
  if (!r || Date.now() - r.first > 15 * 60e3) loginFails.set(key, { count: 1, first: Date.now() });
  else r.count++;
}
function loginOk(key) { loginFails.delete(key); }

module.exports = { requestCode, verifyCode, sendMail, mailConfig, mailConfigured, loginBlocked, loginFailed, loginOk };

};

__defs["backup"] = function (module, exports, require, __dirname) {
// Respaldo inmediato: después de cada cambio, guarda la base de datos cifrada en la rama "backup" de GitHub.
// Así, si Render reinicia la app, no se pierde nada de lo que se hizo recién.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const settings = require('./settings');
const { encryptBuf } = require('./keys');

const repo = () => process.env.RENDER_GIT_REPO_SLUG || settings.get('gh_repo') || '';
const token = () => settings.get('gh_token') || '';
const configured = () => Boolean(repo() && token());

function snapshot() {
  const tmp = path.join(os.tmpdir(), `eh-snap-${Date.now()}.db`);
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  const plain = fs.readFileSync(tmp);
  fs.unlinkSync(tmp);
  return { plain, enc: encryptBuf(require('zlib').gzipSync(plain, { level: 6 })), hash: crypto.createHash('sha256').update(plain).digest('hex') };
}

async function gh(method, url, body) {
  const res = await fetch(`https://api.github.com/repos/${repo()}${url}`, {
    method, signal: AbortSignal.timeout(20000),
    headers: { authorization: `Bearer ${token()}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'etiquetahub', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok && res.status !== 404) throw new Error(`GitHub ${res.status}: ${text.slice(0, 200)}`);
  return res.status === 404 ? null : (text ? JSON.parse(text) : null);
}

let lastHash = null, lastOkAt = null, lastError = null, running = false, pending = false;

async function putFile(name, buf, msg) {
  const cur = await gh('GET', `/contents/${name}?ref=backup`);
  await gh('PUT', `/contents/${name}`, { message: msg, content: buf.toString('base64'), branch: 'backup', ...(cur?.sha ? { sha: cur.sha } : {}) });
}

async function pushNow() {
  if (!configured()) return { skipped: true };
  if (running) { pending = true; return { queued: true }; }
  running = true;
  try {
    const s = snapshot();
    if (s.hash === lastHash) return { unchanged: true };
    const branch = await gh('GET', '/branches/backup');
    if (!branch) {
      // crea la rama "backup" a partir de la rama principal
      const main = await gh('GET', '/git/ref/heads/main');
      await gh('POST', '/git/refs', { ref: 'refs/heads/backup', sha: main.object.sha });
    }
    const stamp = new Date().toISOString();
    await putFile('db.enc', s.enc, `Respaldo inmediato ${stamp}`);
    await putFile('hash.txt', Buffer.from(s.hash + '\n'), `Respaldo inmediato ${stamp}`);
    lastHash = s.hash; lastOkAt = stamp; lastError = null;
    return { ok: true };
  } catch (e) {
    lastError = e.message;
    console.warn('[respaldo]', e.message);
    return { error: e.message };
  } finally {
    running = false;
    if (pending) { pending = false; setTimeout(() => pushNow(), 2000); }
  }
}

let timer = null;
function schedule(ms = 10000) {
  if (!configured()) return;
  clearTimeout(timer);
  timer = setTimeout(() => pushNow(), ms);
}

function status() { return { configured: configured(), repo: repo(), lastOkAt, lastError }; }

// Al apagarse (Render reinicia o publica una versión nueva), intenta guardar antes de salir
let shuttingDown = false;
async function onShutdown(sig) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Recibido ${sig}: guardando respaldo antes de salir…`);
  const t = setTimeout(() => process.exit(0), 25000);
  try { await pushNow(); } finally { clearTimeout(t); process.exit(0); }
}
process.on('SIGTERM', () => onShutdown('SIGTERM'));
process.on('SIGINT', () => onShutdown('SIGINT'));

setInterval(() => pushNow(), 10 * 60e3);

module.exports = { pushNow, schedule, status, configured };

};

__defs["label"] = function (module, exports, require, __dirname) {
// Convierte la etiqueta original del marketplace a 100 x 150 mm (impresora térmica)
// y le agrega al pie la franja "Contenido del paquete" con lo que compró el cliente.
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
const cfg = require('./config');

const MM = 72 / 25.4;
const PAGE_W = 100 * MM; // 283.46 pt
const PAGE_H = 150 * MM; // 425.20 pt
const PAD = 2.5 * MM;
const MK_NAME = { ml: 'MERCADO LIBRE', fa: 'FALABELLA', pa: 'PARIS', demo: 'DEMO' };

function safeText(font, text) {
  let out = '';
  for (const ch of String(text ?? '').normalize('NFC')) {
    try { font.encodeText(ch); out += ch; } catch { out += ch.normalize('NFD').replace(/[̀-ͯ]/g, '') || '?'; }
  }
  return out.replace(/\s+/g, ' ').trim();
}

function wrap(font, text, size, maxW) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (font.widthOfTextAtSize(t, size) <= maxW) cur = t;
    else {
      if (cur) lines.push(cur);
      cur = w;
      while (font.widthOfTextAtSize(cur, size) > maxW && cur.length > 1) {
        let i = cur.length - 1;
        while (i > 1 && font.widthOfTextAtSize(cur.slice(0, i), size) > maxW) i--;
        lines.push(cur.slice(0, i)); cur = cur.slice(i);
      }
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Recorte automático: renderiza la página en baja resolución (pdftoppm) y busca
// el rectángulo donde hay tinta, para no achicar la etiqueta por culpa de márgenes blancos (ej. A4).
const { execFile } = require('child_process');
const os = require('os');
const fsp = require('fs/promises');
const pathMod = require('path');
let hasPdftoppm = null;
function run(cmd, args) { return new Promise((res, rej) => execFile(cmd, args, { timeout: 20000 }, (e, so) => (e ? rej(e) : res(so)))); }
async function autoBoxes(bytes, pageCount) {
  if (hasPdftoppm === false) return [];
  const dir = await fsp.mkdtemp(pathMod.join(os.tmpdir(), 'eh-'));
  try {
    const inFile = pathMod.join(dir, 'in.pdf');
    await fsp.writeFile(inFile, bytes);
    const DPI = 50;
    const boxes = [];
    for (let i = 1; i <= Math.min(pageCount, 10); i++) {
      const out = pathMod.join(dir, `p${i}`);
      try { await run('pdftoppm', ['-f', String(i), '-l', String(i), '-r', String(DPI), '-gray', '-singlefile', inFile, out]); hasPdftoppm = true; }
      catch (e) { if (e.code === 'ENOENT') { hasPdftoppm = false; return []; } boxes.push(null); continue; }
      const buf = await fsp.readFile(out + '.pgm');
      // cabecera PGM binaria: P5\n<w> <h>\n<max>\n
      const header = buf.slice(0, 64).toString('latin1').match(/^P5\s+(\d+)\s+(\d+)\s+(\d+)\s/);
      if (!header) { boxes.push(null); continue; }
      const [, W, H] = header.map(Number); const off = header[0].length;
      let minX = W, minY = H, maxX = -1, maxY = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (buf[off + y * W + x] < 200) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      }
      if (maxX < 0) { boxes.push(null); continue; }
      const k = 72 / DPI, m = 6; // margen de 6 pt
      boxes.push({ left: minX * k - m, right: (maxX + 1) * k + m, top: H * k - minY * k + m, bottom: H * k - (maxY + 1) * k - m, pxW: W * k, pxH: H * k });
    }
    return boxes;
  } finally { fsp.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

function parseCrop(s) {
  if (!s) return null;
  const [x, y, w, h] = s.split(',').map(Number);
  if ([x, y, w, h].some(n => !Number.isFinite(n))) return null;
  return { left: x, bottom: y, right: x + w, top: y + h };
}

// Arma las líneas de la franja: cada ítem -> { qty, lines[] }
function layoutItems(fonts, items) {
  const qtyW = 26;
  return items.map(it => {
    const textW = PAGE_W - PAD * 2 - qtyW - (it.missing ? 46 : 0); // espacio para la marca "FALTA"
    const name = safeText(fonts.bold, it.name || 'Producto');
    const variant = safeText(fonts.reg, it.variant || '');
    const sku = safeText(fonts.reg, [it.sku && `SKU ${it.sku}`, it.pub_id && it.pub_id !== it.sku && `ID ${it.pub_id}`].filter(Boolean).join('  ·  '));
    const lines = [
      ...wrap(fonts.bold, name, 9.5, textW).map(t => ({ t, f: fonts.bold, s: 9.5 })),
      ...(variant ? wrap(fonts.reg, variant, 8.5, textW).map(t => ({ t, f: fonts.reg, s: 8.5 })) : []),
      ...(sku ? wrap(fonts.reg, sku, 7.5, textW).map(t => ({ t, f: fonts.reg, s: 7.5, grey: true })) : []),
    ];
    return { qty: String(it.qty || 1), missing: Boolean(it.missing), lines, h: lines.reduce((a, l) => a + l.s + 2, 0) + 4 + (it.missing ? 8 : 0) };
  });
}

function drawStrip(page, fonts, blocks, info, stripH, cont) {
  const top = stripH;
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: stripH, color: rgb(1, 1, 1) });
  // línea punteada separadora
  for (let x = PAD; x < PAGE_W - PAD; x += 6) page.drawLine({ start: { x, y: top }, end: { x: Math.min(x + 3, PAGE_W - PAD), y: top }, thickness: 1, color: rgb(0, 0, 0) });
  let y = top - PAD - 8;
  const head = cont ? 'CONTENIDO DEL PAQUETE (continuación)' : 'CONTENIDO DEL PAQUETE';
  page.drawText(head, { x: PAD, y, size: 8, font: fonts.bold, color: rgb(0, 0, 0) });
  const units = info.units;
  const right = `${units} unidad${units === 1 ? '' : 'es'}`;
  page.drawText(right, { x: PAGE_W - PAD - fonts.bold.widthOfTextAtSize(right, 8), y, size: 8, font: fonts.bold });
  y -= 5;
  for (const b of blocks) {
    y -= b.lines[0].s;
    page.drawRectangle({ x: PAD, y: y - 3, width: 22, height: 14, color: rgb(0, 0, 0) });
    const qt = b.qty + 'x';
    page.drawText(qt, { x: PAD + 11 - fonts.bold.widthOfTextAtSize(qt, 10) / 2, y: y, size: 10, font: fonts.bold, color: rgb(1, 1, 1) });
    let first = true;
    for (const l of b.lines) {
      if (!first) y -= l.s + 2;
      page.drawText(l.t, { x: PAD + 26, y, size: l.s, font: l.f, color: l.grey ? rgb(0.25, 0.25, 0.25) : rgb(0, 0, 0) });
      first = false;
    }
    y -= 6;
  }
  const foot = safeText(fonts.reg, `${info.seller}  ·  ${MK_NAME[info.marketplace] || ''} ${info.orderNumber}`);
  page.drawText(foot.slice(0, 70), { x: PAD, y: PAD, size: 7, font: fonts.reg, color: rgb(0.2, 0.2, 0.2) });
}

// Franja negra arriba de la etiqueta: "MERCADO LIBRE · FLEX" a la izquierda y el vendedor a la derecha
function drawHeaderBand(page, fonts, info, h) {
  const white = rgb(1, 1, 1);
  page.drawRectangle({ x: 0, y: PAGE_H - h, width: PAGE_W, height: h, color: rgb(0, 0, 0) });
  const left = safeText(fonts.bold, [MK_NAME[info.marketplace] || '', info.shipType ? String(info.shipType).toUpperCase() : ''].filter(Boolean).join(' · '));
  const right = safeText(fonts.bold, String(info.seller || '').toUpperCase());
  let size = 10.5;
  const fits = sz => fonts.bold.widthOfTextAtSize(left, sz) + fonts.bold.widthOfTextAtSize(right, sz) + 14 <= PAGE_W - PAD * 2;
  while (!fits(size) && size > 6) size -= 0.5;
  const y = PAGE_H - h + (h - size * 0.72) / 2;
  page.drawText(left, { x: PAD, y, size, font: fonts.bold, color: white });
  page.drawText(right, { x: PAGE_W - PAD - fonts.bold.widthOfTextAtSize(right, size), y, size, font: fonts.bold, color: white });
}

// Hoja de detalle del pedido (segunda página, 100x150 mm)
function drawOrderSheet(page, fonts, blocks, info, part, parts) {
  const black = rgb(0, 0, 0), grey = rgb(0.3, 0.3, 0.3);
  let y = PAGE_H - PAD - 10;
  page.drawText('DETALLE DEL PEDIDO' + (parts > 1 ? `  (${part}/${parts})` : ''), { x: PAD, y, size: 8.5, font: fonts.bold, color: grey });
  const units = `${info.units} unidad${info.units === 1 ? '' : 'es'}`;
  page.drawText(units, { x: PAGE_W - PAD - fonts.bold.widthOfTextAtSize(units, 8.5), y, size: 8.5, font: fonts.bold, color: grey });
  y -= 22;
  // Número de pedido incompleto (1, 2, 3…): grande, arriba a la derecha
  let numMaxW = PAGE_W - PAD * 2;
  if (info.blockNo) {
    const t = `N° ${info.blockNo}`;
    let bs = 26; while (fonts.bold.widthOfTextAtSize(t, bs) > 110 && bs > 14) bs -= 1;
    const bw = fonts.bold.widthOfTextAtSize(t, bs) + 14, bh = bs + 10;
    page.drawRectangle({ x: PAGE_W - PAD - bw, y: y - 6, width: bw, height: bh, color: black });
    page.drawText(t, { x: PAGE_W - PAD - bw + 7, y: y - 6 + (bh - bs * 0.72) / 2, size: bs, font: fonts.bold, color: rgb(1, 1, 1) });
    numMaxW -= bw + 6;
  }
  const num = safeText(fonts.bold, info.orderNumber);
  let size = 20; while (fonts.bold.widthOfTextAtSize(num, size) > numMaxW && size > 9) size -= 1;
  page.drawText(num, { x: PAD, y, size, font: fonts.bold, color: black });
  y -= 14;
  page.drawText(safeText(fonts.reg, `${MK_NAME[info.marketplace] || ''}  ·  ${info.seller}`), { x: PAD, y, size: 9, font: fonts.reg, color: grey });
  if (info.customer) {
    y -= 18;
    page.drawText('Cliente:', { x: PAD, y, size: 9, font: fonts.reg, color: grey });
    const c = wrap(fonts.bold, safeText(fonts.bold, info.customer), 12, PAGE_W - PAD * 2 - 42)[0] || '';
    page.drawText(c, { x: PAD + 40, y, size: 12, font: fonts.bold, color: black });
  }
  const nMissing = info.items.filter(i => i.missing).reduce((a, i) => a + Number(i.qty || 1), 0);
  if (info.blockNo && nMissing && part === 1) {
    y -= 22;
    const t = `PEDIDO INCOMPLETO · FALTA${nMissing === 1 ? '' : 'N'} ${nMissing} PRODUCTO${nMissing === 1 ? '' : 'S'} (RELLENAR)`;
    let ts = 9; while (fonts.bold.widthOfTextAtSize(t, ts) > PAGE_W - PAD * 2 - 8 && ts > 6) ts -= 0.5;
    page.drawRectangle({ x: PAD, y: y - 5, width: PAGE_W - PAD * 2, height: ts + 9, color: black });
    page.drawText(t, { x: PAD + 4, y: y - 5 + 4.5, size: ts, font: fonts.bold, color: rgb(1, 1, 1) });
  }
  y -= 10;
  for (let x = PAD; x < PAGE_W - PAD; x += 6) page.drawLine({ start: { x, y }, end: { x: Math.min(x + 3, PAGE_W - PAD), y }, thickness: 1, color: black });
  y -= 6;
  for (const b of blocks) {
    const top = y;
    if (b.missing) y -= 4;
    y -= b.lines[0].s + 2;
    page.drawRectangle({ x: PAD, y: y - 3, width: 22, height: 14, color: black });
    const qt = b.qty + 'x';
    page.drawText(qt, { x: PAD + 11 - fonts.bold.widthOfTextAtSize(qt, 10) / 2, y, size: 10, font: fonts.bold, color: rgb(1, 1, 1) });
    let first = true;
    for (const l of b.lines) {
      if (!first) y -= l.s + 2;
      page.drawText(l.t, { x: PAD + 26, y, size: l.s, font: l.f, color: l.grey ? grey : black });
      first = false;
    }
    if (b.missing) {
      // Producto que NO manda el fulfillment: recuadro grueso + marca "FALTA"
      y -= 4;
      page.drawRectangle({ x: PAD - 1.5, y: y - 3, width: PAGE_W - PAD * 2 + 3, height: top - y + 1, borderColor: black, borderWidth: 2.2 });
      const tag = 'FALTA', tw = fonts.bold.widthOfTextAtSize(tag, 10) + 8;
      page.drawRectangle({ x: PAGE_W - PAD - tw - 3, y: top - 19, width: tw, height: 14, color: black });
      page.drawText(tag, { x: PAGE_W - PAD - tw + 1, y: top - 15, size: 10, font: fonts.bold, color: rgb(1, 1, 1) });
    }
    y -= 8;
  }
  const foot = safeText(fonts.reg, info.blockNo ? `N° ${info.blockNo} · Va junto a la etiqueta anterior · EtiquetaHub` : 'Va junto a la etiqueta anterior · EtiquetaHub');
  page.drawText(foot, { x: PAD, y: PAD, size: 7, font: fonts.reg, color: grey });
}
const sheetHeaderH = info => 70 + (info.customer ? 18 : 0) + (info.blockNo ? 26 : 0);

async function stampLabel(originalBytes, info) {
  const mode = process.env.LABEL_CONTENT_MODE || 'page'; // 'page' = detalle en segunda hoja; 'strip' = franja al pie
  const src = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const fonts = { reg: await out.embedFont(StandardFonts.Helvetica), bold: await out.embedFont(StandardFonts.HelveticaBold) };
  info.units = info.items.reduce((a, i) => a + Number(i.qty || 1), 0);

  const blocks = layoutItems(fonts, info.items);
  const HEAD = PAD + 14, FOOT = PAD + 12;
  const maxStrip = PAGE_H * 0.42;
  // reparte ítems: los que caben van en la franja, el resto en hoja de continuación
  const first = [], rest = [];
  let used = HEAD + FOOT;
  for (const b of blocks) { if (used + b.h <= maxStrip && rest.length === 0) { first.push(b); used += b.h; } else rest.push(b); }
  const stripH = mode === 'strip' ? Math.max(used, 26 * MM) : 0;

  const crop = parseCrop(cfg.crop[info.marketplace]);
  // Mercado Libre agrega una hoja propia con el detalle: se deja solo la etiqueta (la hoja de detalle es la nuestra)
  const pages = info.marketplace === 'ml' && mode !== 'strip' ? src.getPages().slice(0, 1) : src.getPages();
  const HEAD_H = 6.5 * MM; // franja superior: marketplace · tipo de envío · vendedor
  const auto = crop ? [] : await autoBoxes(originalBytes, pages.length).catch(() => []);
  for (let i = 0; i < pages.length; i++) {
    let box = crop;
    const a = auto[i];
    if (!box && a) {
      // coordenadas relativas a la caja visible de la página
      const { x: cx, y: cy, width: cw, height: ch } = pages[i].getCropBox();
      const sx = cw / a.pxW, sy = ch / a.pxH;
      const b = { left: cx + a.left * sx, right: cx + a.right * sx, bottom: cy + a.bottom * sy, top: cy + a.top * sy };
      b.left = Math.max(cx, b.left); b.bottom = Math.max(cy, b.bottom); b.right = Math.min(cx + cw, b.right); b.top = Math.min(cy + ch, b.top);
      // solo recorta si realmente sobra espacio (más de 10% del área)
      if ((b.right - b.left) * (b.top - b.bottom) < cw * ch * 0.9 && pages[i].getRotation().angle % 360 === 0) box = b;
    }
    const emb = await out.embedPage(pages[i], box || undefined);
    const page = out.addPage([PAGE_W, PAGE_H]);
    const areaW = PAGE_W - 2, areaH = PAGE_H - stripH - 2 - HEAD_H;
    const w = emb.width, h = emb.height;
    const sNormal = Math.min(areaW / w, areaH / h);
    const sRot = Math.min(areaW / h, areaH / w);
    if (sRot > sNormal * 1.15) {
      const dw = h * sRot, dh = w * sRot;
      const x = (PAGE_W - dw) / 2 + dw, y = PAGE_H - HEAD_H - 1 - dh;
      page.drawPage(emb, { x, y, xScale: sRot, yScale: sRot, rotate: degrees(90) });
    } else {
      const dw = w * sNormal, dh = h * sNormal;
      page.drawPage(emb, { x: (PAGE_W - dw) / 2, y: PAGE_H - HEAD_H - 1 - dh, xScale: sNormal, yScale: sNormal });
    }
    drawHeaderBand(page, fonts, info, HEAD_H);
    if (i === 0 && mode === 'strip') drawStrip(page, fonts, first, info, stripH, false);
  }
  if (mode !== 'strip') {
    // Etiqueta original a tamaño completo y, en la hoja siguiente, el detalle del pedido
    const all = [...blocks];
    const chunks = [];
    while (all.length) {
      const chunk = [];
      let u = sheetHeaderH(info) + 20;
      while (all.length && u + all[0].h <= PAGE_H - 16) { u += all[0].h + 4; chunk.push(all.shift()); }
      if (!chunk.length) chunk.push(all.shift());
      chunks.push(chunk);
    }
    chunks.forEach((c, i) => drawOrderSheet(out.addPage([PAGE_W, PAGE_H]), fonts, c, info, i + 1, chunks.length));
    return Buffer.from(await out.save());
  }
  // hoja(s) extra si el pedido trae muchos productos
  while (rest.length) {
    const page = out.addPage([PAGE_W, PAGE_H]);
    const chunk = [];
    let u = HEAD + FOOT;
    while (rest.length && u + rest[0].h <= PAGE_H - 10) { u += rest[0].h; chunk.push(rest.shift()); }
    if (!chunk.length) chunk.push(rest.shift());
    drawStrip(page, fonts, chunk, info, PAGE_H - 4, true);
  }
  return Buffer.from(await out.save());
}

async function mergePdfs(buffers) {
  const out = await PDFDocument.create();
  for (const b of buffers) {
    const d = await PDFDocument.load(b);
    const copied = await out.copyPages(d, d.getPageIndices());
    copied.forEach(p => out.addPage(p));
  }
  return Buffer.from(await out.save());
}

module.exports = { stampLabel, mergePdfs, PAGE_W, PAGE_H, MM };

};

__defs["connectors/ml"] = function (module, exports, require, __dirname) {
// Mercado Libre: OAuth + pedidos + etiquetas (/shipment_labels)
const cfg = require('../config');
const { request, NotReady, isPdf } = require('../http');
const settings = require('../settings');

const API = cfg.ml.apiHost;

function authUrl(state) {
  const u = new URL('/authorization', cfg.ml.authHost);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', settings.mlClientId());
  u.searchParams.set('redirect_uri', `${cfg.baseUrl}/auth/ml/callback`);
  u.searchParams.set('state', state);
  return u.toString();
}

async function tokenRequest(params) {
  const body = new URLSearchParams({ client_id: settings.mlClientId(), client_secret: settings.mlClientSecret(), ...params });
  const t = await request(`${API}/oauth/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body,
  }, { retries: 1 });
  return { access_token: t.access_token, refresh_token: t.refresh_token, user_id: String(t.user_id), expires_at: Date.now() + (t.expires_in - 300) * 1000 };
}
const exchangeCode = code => tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: `${cfg.baseUrl}/auth/ml/callback` });

async function token(conn) {
  if (conn.creds.expires_at > Date.now()) return conn.creds.access_token;
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: conn.creds.refresh_token });
  conn.saveCreds({ ...conn.creds, ...t });
  return t.access_token;
}
async function api(conn, path, as = 'json') {
  const tk = await token(conn);
  return request(`${API}${path}`, { headers: { authorization: `Bearer ${tk}` } }, { as });
}

async function whoAmI(conn) { return api(conn, '/users/me'); }

function variantText(item) {
  const attrs = (item.variation_attributes || []).map(a => `${a.name}: ${a.value_name}`);
  return attrs.join(' · ');
}

// Fecha/hora límite para despachar (según la configuración de Flex/Colecta del vendedor en Mercado Libre)
const leadCache = new Map();
async function dispatchBy(conn, sh) {
  const so = sh.shipping_option || {};
  const direct = so.estimated_handling_limit?.date || sh.lead_time?.estimated_handling_limit?.date;
  if (direct) return direct;
  const key = `${sh.id}:${sh.status}`;
  if (leadCache.has(key)) return leadCache.get(key);
  let d = null;
  // 1) SLA de despacho de Mercado Libre: fecha/hora límite para despachar
  try { const sla = await api(conn, `/shipments/${sh.id}/sla`); d = sla?.expected_date || null; } catch { /* sin dato */ }
  // 2) "pay_before" = hora de corte del día (Flex/Colecta/Agencia) según la configuración del vendedor
  if (!d) d = so.estimated_delivery_time?.pay_before || null;
  if (!d) {
    try { const lt = await api(conn, `/shipments/${sh.id}/lead_time`); d = lt?.estimated_handling_limit?.date || lt?.buffering?.date || lt?.estimated_delivery_time?.pay_before || null; } catch { /* sin dato */ }
  }
  d = d || so.estimated_delivery_time?.date || null;
  if (d) leadCache.set(key, d);
  return d;
}

async function debugOrder(conn, order) {
  const sh = await api(conn, `/shipments/${order.external_id}`);
  const lt = await api(conn, `/shipments/${order.external_id}/lead_time`).catch(e => ({ error: e.message }));
  const sla = await api(conn, `/shipments/${order.external_id}/sla`).catch(e => ({ error: e.message }));
  return { shipment: sh, lead_time: lt, sla, dispatch_by: await dispatchBy(conn, sh) };
}

// Subestados de Mercado Libre: ya se entregó al correo/agencia (en ML aparece "Seguir envío")
const OUT_SUBSTATUS = ['dropped_off', 'picked_up', 'in_hub', 'in_packing_list', 'in_transit', 'authorized_by_carrier', 'out_for_delivery'];
// ¿Ya salió? Mira el estado actual y también el historial (p. ej. entregado en agencia → en tránsito → "in_packing_list")
const alreadyOut = sh => ['shipped', 'delivered', 'not_delivered'].includes(sh.status) ||
  (sh.status === 'ready_to_ship' && (OUT_SUBSTATUS.includes(sh.substatus) || (sh.substatus_history || []).some(h => ['dropped_off', 'picked_up', 'in_hub'].includes(h.substatus))));
// Aún no se puede imprimir (falta factura o autorización)
const WAIT_SUBSTATUS = ['invoice_pending', 'waiting_for_carrier_authorization'];

// Un envío (shipment) puede agrupar varias órdenes de un carrito (pack): una sola etiqueta.
async function buildFromShipment(conn, shipmentId, knownOrders = []) {
  const sh = await api(conn, `/shipments/${shipmentId}`);
  const logistic = sh.logistic_type || sh.logistic?.type || '';
  if (logistic === 'fulfillment') return null; // Full: lo despacha Mercado Libre
  let orders = knownOrders;
  if (!orders.length) {
    const ids = new Set([sh.order_id, ...(sh.orders || []).map(o => o.id || o)].filter(Boolean));
    orders = await Promise.all([...ids].map(id => api(conn, `/orders/${id}`)));
  }
  const items = [];
  for (const o of orders) for (const oi of o.order_items || []) {
    items.push({
      name: oi.item?.title, variant: variantText(oi.item || {}),
      sku: oi.item?.seller_sku || oi.item?.seller_custom_field || '', pub_id: oi.item?.id, qty: oi.quantity, up_id: oi.item?.user_product_id || undefined,
    });
  }
  await addFamilyIds(conn, items);
  const first = orders[0] || {};
  return {
    external_id: String(sh.id),
    order_number: String(first.pack_id || first.id || sh.order_id || sh.id),
    sold_at: first.date_created || sh.date_created,
    items,
    // Lista para imprimir en Mercado Libre: "ready_to_ship" salvo que ya la entregaron al correo/agencia
    labelReady: sh.status === 'ready_to_ship' && !alreadyOut(sh) && !WAIT_SUBSTATUS.includes(sh.substatus),
    cancelled: sh.status === 'cancelled' || orders.every(o => o.status === 'cancelled'),
    shipped: alreadyOut(sh),
    meta: { status: sh.status, substatus: sh.substatus, buffered_until: sh.status === 'pending' && sh.substatus === 'buffered' ? (sh.shipping_option?.buffering?.date || null) : null, logistic, dispatch_by: await dispatchBy(conn, sh), customer: sh.receiver_address?.receiver_name || [first.buyer?.first_name, first.buyer?.last_name].filter(Boolean).join(' ') || first.buyer?.nickname || '' },
  };
}

async function listShipments(conn) {
  const from = new Date(Date.now() - cfg.lookbackDays * 864e5).toISOString().replace('Z', '-00:00');
  const byShipment = new Map();
  for (let offset = 0; offset < 500; offset += 50) {
    const r = await api(conn, `/orders/search?seller=${conn.creds.user_id}&order.status=paid&order.date_created.from=${encodeURIComponent(from)}&sort=date_desc&limit=50&offset=${offset}`);
    for (const o of r.results || []) {
      const sid = o.shipping?.id;
      if (!sid) continue;
      if (!byShipment.has(sid)) byShipment.set(sid, []);
      byShipment.get(sid).push(o);
    }
    if ((r.results || []).length < 50) break;
  }
  const out = [];
  for (const [sid, orders] of byShipment) {
    try { const s = await buildFromShipment(conn, sid, orders); if (s) out.push(s); }
    catch (e) { console.warn('[ML] envío', sid, e.message); }
  }
  return out;
}

async function fetchLabel(conn, order) {
  const s = await buildFromShipment(conn, order.external_id);
  if (!s || !s.labelReady) throw new NotReady('Mercado Libre todavía no libera la etiqueta');
  const pdf = await api(conn, `/shipment_labels?shipment_ids=${order.external_id}&response_type=pdf`, 'buffer');
  if (!isPdf(pdf)) throw new Error('Mercado Libre no devolvió un PDF');
  return pdf;
}

// Notificación: { resource: "/orders/123" | "/shipments/456", user_id, topic }
async function fromNotification(conn, body) {
  const res = String(body.resource || '');
  let shipmentId = null;
  if (res.startsWith('/shipments/')) shipmentId = res.split('/')[2];
  else if (res.startsWith('/orders/')) {
    const o = await api(conn, res);
    if (o.status !== 'paid') return null;
    shipmentId = o.shipping?.id;
  }
  if (!shipmentId) return null;
  return buildFromShipment(conn, shipmentId);
}

async function refresh(conn, order) { return buildFromShipment(conn, order.external_id); }

// Ventas pagadas entre dos fechas, con sus productos (sección Ventas). Incluye Full, Flex, Colecta y Agencia.
async function sales(conn, fromISO, toISO) {
  const out = [];
  const q = `order.date_created.from=${encodeURIComponent(fromISO.replace('Z', '-00:00'))}` + (toISO ? `&order.date_created.to=${encodeURIComponent(toISO.replace('Z', '-00:00'))}` : '');
  for (let offset = 0; offset < 10000; offset += 50) {
    const r = await api(conn, `/orders/search?seller=${conn.creds.user_id}&${q}&sort=date_desc&limit=50&offset=${offset}`);
    const res = r.results || [];
    for (const o of res) {
      if (!['paid', 'partially_paid', 'partially_refunded'].includes(o.status)) continue;
      const items = (o.order_items || []).map(oi => ({
        sku: oi.item?.seller_sku || oi.item?.seller_custom_field || '', pub_id: oi.item?.id || '', name: oi.item?.title || 'Producto',
        variant: variantText(oi.item || {}), qty: Number(oi.quantity || 1), amount: Number(oi.unit_price || 0) * Number(oi.quantity || 1),
      }));
      out.push({ id: String(o.id), at: o.date_created, amount: Number(o.total_amount || 0), units: items.reduce((a, i) => a + i.qty, 0), items });
    }
    if (res.length < 50 || offset + 50 >= (r.paging?.total || 0)) break;
  }
  return out;
}

// IDs "de publicación" del modelo nuevo de Mercado Libre (User Products): cada color/talla es un MLC… distinto,
// pero el vendedor ve y bloquea el ID de la familia (p. ej. 7601467027761936) o el del producto (MLCU…).
const idCache = new Map(); // pub_id -> { fam_id, up_id }
let itemsForbiddenAt = 0; // la app de Mercado Libre no tiene permiso para leer publicaciones: no insistir por 20 minutos
async function itemIds(conn, ids) {
  if (Date.now() - itemsForbiddenAt < 20 * 60e3) return {};
  const need = [...new Set(ids.filter(id => id && !idCache.has(id)))];
  for (let i = 0; i < need.length; i += 20) {
    const chunk = need.slice(i, i + 20);
    const put = b => { if (b && b.id) idCache.set(b.id, { fam_id: b.family_id ? String(b.family_id) : '', up_id: b.user_product_id || '' }); };
    try {
      const r = await api(conn, `/items?ids=${chunk.join(',')}&attributes=id,family_id,user_product_id`);
      for (const x of Array.isArray(r) ? r : []) put(x.body);
    } catch (e) {
      if (/403/.test(e.message)) { itemsForbiddenAt = Date.now(); console.warn('[ML] sin permiso para leer publicaciones (/items): no se puede leer el ID de familia'); return {}; }
    }
  }
  const out = {}; for (const id of ids) if (idCache.has(id)) out[id] = idCache.get(id);
  return out;
}
async function addFamilyIds(conn, items) {
  const m = await itemIds(conn, items.map(i => i.pub_id).filter(Boolean));
  for (const it of items) { const x = m[it.pub_id]; if (x) { if (x.fam_id) it.fam_id = x.fam_id; if (x.up_id && !it.up_id) it.up_id = x.up_id; } }
}

// "Familia" de cada publicación: con el modelo nuevo de Mercado Libre (User Products) cada variante es una publicación
// distinta (otro MLC…), pero todas comparten family_name. Sirve para agruparlas como una sola.
async function families(conn, ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    const r = await api(conn, `/items?ids=${chunk.join(',')}&attributes=id,title,family_name,family_id,user_product_id`);
    for (const x of Array.isArray(r) ? r : []) {
      const b = x.body || {};
      if (b.id) out[b.id] = { family: b.family_name || '', fam_id: b.family_id ? String(b.family_id) : '', up: b.user_product_id || '' };
    }
    for (const id of chunk) if (!out[id]) out[id] = { family: '', fam_id: '', up: '' };
  }
  return out;
}

module.exports = { raw: api, itemIds, families, sales, debugOrder, refresh, authUrl, exchangeCode, whoAmI, listShipments, fetchLabel, fromNotification };

};

__defs["connectors/falabella"] = function (module, exports, require, __dirname) {
// Falabella Seller Center API (firma HMAC-SHA256)
const crypto = require('crypto');
const cfg = require('../config');
const { request, NotReady } = require('../http');

const enc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const arr = x => (x == null ? [] : Array.isArray(x) ? x : [x]);
// Falabella a veces entrega { Orders: { Order: [...] } } y otras { Orders: [...] }: acepta ambas
const list = (x, key) => (Array.isArray(x) ? x.flatMap(e => (e && e[key] !== undefined ? arr(e[key]) : [e])) : arr(x?.[key]));

async function call(creds, action, params = {}) {
  const p = { Action: action, Format: 'JSON', Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00'), UserID: creds.userId, Version: '1.0', ...params };
  const qs = Object.keys(p).sort().map(k => `${enc(k)}=${enc(p[k])}`).join('&');
  const sig = crypto.createHmac('sha256', creds.apiKey).update(qs).digest('hex');
  const ua = `${creds.sellerId || 'SELLER'}/Node/22/PROPIA/${cfg.falabella.country}`;
  const r = await request(`${cfg.falabella.apiHost}/?${qs}&Signature=${sig}`, { headers: { 'user-agent': ua, accept: 'application/json' } });
  if (r?.ErrorResponse) {
    const h = r.ErrorResponse.Head || {};
    const err = new Error(`Falabella ${action}: ${h.ErrorMessage || 'error'} (${h.ErrorCode || '?'})`);
    err.code = String(h.ErrorCode || '');
    throw err;
  }
  return r?.SuccessResponse?.Body || {};
}

async function test(creds) { await call(creds, 'GetOrders', { Limit: '1' }); return true; }

async function orderItems(creds, orderId) {
  const b = await call(creds, 'GetOrderItems', { OrderId: String(orderId) });
  return list(b.OrderItems, 'OrderItem');
}

function normalize(order, items) {
  const active = items.filter(i => !['canceled', 'cancelled', 'returned', 'failed'].includes(String(i.Status).toLowerCase()));
  const group = new Map();
  for (const it of active) {
    const k = it.Sku || it.ShopSku;
    if (!group.has(k)) group.set(k, { name: it.Name, variant: it.Variation && it.Variation !== '…' ? it.Variation : '', sku: it.Sku || '', pub_id: it.ShopSku || '', qty: 0 });
    group.get(k).qty += 1; // Falabella entrega 1 OrderItem por unidad
  }
  const statuses = active.map(i => String(i.Status).toLowerCase());
  return {
    external_id: String(order.OrderId),
    order_number: String(order.OrderNumber || order.OrderId),
    sold_at: order.CreatedAt,
    items: [...group.values()],
    labelReady: statuses.length > 0 && statuses.every(s => s === 'ready_to_ship'),
    cancelled: active.length === 0,
    shipped: statuses.length > 0 && statuses.every(s => ['shipped', 'delivered'].includes(s)),
    meta: { dispatch_by: active.map(i => i.PromisedShippingTime).filter(Boolean).sort()[0] || null, orderItemIds: active.map(i => String(i.OrderItemId)), statuses, packageId: active.find(i => i.PackageId)?.PackageId || null, tracking: active.find(i => i.TrackingCode)?.TrackingCode || null, carrier: active.find(i => i.ShipmentProvider)?.ShipmentProvider || null, customer: [order.CustomerFirstName, order.CustomerLastName].filter(Boolean).join(' ') || [order.AddressShipping?.FirstName, order.AddressShipping?.LastName].filter(Boolean).join(' ') },
  };
}

async function listShipments(conn) {
  const after = new Date(Date.now() - cfg.lookbackDays * 864e5).toISOString().replace(/\.\d{3}Z$/, '+00:00');
  const out = [];
  for (const status of ['pending', 'ready_to_ship']) {
    for (let offset = 0; offset < 1000; offset += 100) {
      const b = await call(conn.creds, 'GetOrders', { CreatedAfter: after, Status: status, Limit: '100', Offset: String(offset), SortBy: 'created_at', SortDirection: 'DESC' });
      const orders = list(b.Orders, 'Order');
      for (const o of orders) {
        try { out.push(normalize(o, await orderItems(conn.creds, o.OrderId))); }
        catch (e) { console.warn('[Falabella] orden', o.OrderId, e.message); }
      }
      if (orders.length < 100) break;
    }
  }
  return out;
}

// Si el vendedor activó "marcar listo automáticamente", deja el pedido listo para despacho
// para que Falabella genere la etiqueta.
async function markReady(conn, ids) {
  let packageId = null;
  try {
    const b = await call(conn.creds, 'SetStatusToPackedByMarketplace', { OrderItemIds: JSON.stringify(ids.map(Number)), DeliveryType: 'dropship' });
    packageId = list(b.OrderItems, 'OrderItem').find(i => i.PackageId)?.PackageId || null;
  } catch (e) { console.warn('[Falabella] empaquetar:', e.message); }
  const params = { OrderItemIds: JSON.stringify(ids.map(Number)), DeliveryType: 'dropship' };
  if (packageId) params.PackageId = packageId;
  await call(conn.creds, 'SetStatusToReadyToShip', params);
}

async function fetchLabel(conn, order) {
  const items = await orderItems(conn.creds, order.external_id);
  const n = normalize({ OrderId: order.external_id, OrderNumber: order.order_number }, items);
  if (!n.labelReady) {
    if (!conn.settings.autoReady) throw new NotReady('Pedido pendiente: márcalo "listo para despacho" en Falabella o activa el modo automático');
    await markReady(conn, n.meta.orderItemIds);
  }
  const b = await call(conn.creds, 'GetDocument', { DocumentType: 'shippingParcel', OrderItemIds: JSON.stringify(n.meta.orderItemIds.map(Number)) });
  const doc = list(b.Documents, 'Document')[0] || b.Document;
  if (!doc?.File) throw new NotReady('Falabella todavía no entrega la etiqueta');
  const buf = Buffer.from(doc.File, 'base64');
  if (!String(doc.MimeType || '').includes('pdf') && buf.slice(0, 5).toString() !== '%PDF-') throw new Error(`Falabella entregó la etiqueta en formato ${doc.MimeType}; se necesita PDF`);
  return buf;
}

// Diagnóstico (solo admin): qué pedidos y estados entrega Falabella, sin datos personales
async function debugList(conn) {
  const after = new Date(Date.now() - 10 * 864e5).toISOString().replace(/\.\d{3}Z$/, '+00:00');
  const b = await call(conn.creds, 'GetOrders', { CreatedAfter: after, Limit: '50', SortBy: 'created_at', SortDirection: 'DESC' });
  const orders = list(b.Orders, 'Order');
  const first = orders[0];
  let items = null;
  if (first) { try { items = (await orderItems(conn.creds, first.OrderId)).map(i => ({ Status: i.Status, ShippingType: i.ShippingType, PromisedShippingTime: i.PromisedShippingTime, keys: Object.keys(i) })); } catch (e) { items = { error: e.message }; } }
  let noDate = null;
  try { const b2 = await call(conn.creds, 'GetOrders', { Limit: '5', SortBy: 'created_at', SortDirection: 'DESC' }); noDate = list(b2.Orders, 'Order').map(o => ({ id: o.OrderId, created: o.CreatedAt, statuses: o.Statuses })); } catch (e) { noDate = { error: e.message }; }
  return { noDate, sentAfter: after, bodyKeys: Object.keys(b), ordersType: Array.isArray(b.Orders) ? 'array' : typeof b.Orders, rawLen: Array.isArray(b.Orders) ? b.Orders.length : null, count: orders.length,
    orders: orders.map(o => ({ id: o.OrderId, created: o.CreatedAt, statuses: o.Statuses, keys: Object.keys(o).length })), firstItems: items };
}

// Productos de muchas órdenes a la vez (máx. 50 por llamada); si falla, una por una
async function itemsForOrders(creds, ids) {
  const map = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    try {
      const b = await call(creds, 'GetMultipleOrderItems', { OrderIdList: `[${chunk.join(',')}]` });
      for (const o of list(b.Orders, 'Order')) map.set(String(o.OrderId), list(o.OrderItems, 'OrderItem'));
    } catch {
      for (const id of chunk) { try { map.set(String(id), await orderItems(creds, id)); } catch { /* sin detalle */ } }
    }
  }
  return map;
}

// Ventas entre dos fechas, con productos (sección Ventas). Falabella entrega la hora local de Chile sin zona horaria.
async function sales(conn, fromISO, toISO) {
  const params = { CreatedAfter: fromISO.replace(/\.\d{3}Z$/, '+00:00'), Limit: '100', SortBy: 'created_at', SortDirection: 'DESC' };
  if (toISO) params.CreatedBefore = toISO.replace(/\.\d{3}Z$/, '+00:00');
  const orders = [];
  for (let offset = 0; offset < 5000; offset += 100) {
    const b = await call(conn.creds, 'GetOrders', { ...params, Offset: String(offset) });
    const page = list(b.Orders, 'Order');
    orders.push(...page);
    if (page.length < 100) break;
  }
  const bad = s => ['canceled', 'cancelled', 'failed', 'returned'].includes(String(s).toLowerCase());
  const valid = orders.filter(o => { const st = arr(o.Statuses).flatMap(x => (x && typeof x === 'object' ? Object.values(x) : [x])); return !(st.length && st.every(bad)); });
  const itemsMap = await itemsForOrders(conn.creds, valid.map(o => o.OrderId));
  return valid.map(o => {
    const raw = (itemsMap.get(String(o.OrderId)) || []).filter(i => !bad(i.Status));
    const g = new Map();
    for (const it of raw) {
      const k = it.Sku || it.ShopSku || it.Name;
      if (!g.has(k)) g.set(k, { sku: it.Sku || '', pub_id: it.ShopSku || '', name: it.Name || 'Producto', variant: it.Variation && it.Variation !== '…' ? it.Variation : '', qty: 0, amount: 0 });
      const x = g.get(k); x.qty += 1; x.amount += Number(String(it.PaidPrice ?? it.ItemPrice ?? 0).replace(/[^0-9.]/g, '')) || 0;
    }
    const amount = Number(String(o.Price ?? o.GrandTotal ?? 0).replace(/[^0-9.]/g, '')) || [...g.values()].reduce((a, i) => a + i.amount, 0);
    return { id: String(o.OrderId), localDay: String(o.CreatedAt || '').slice(0, 10), at: o.CreatedAt, amount, units: Number(o.ItemsCount || raw.length || 1), items: [...g.values()] };
  });
}

module.exports = { sales, debugList, test, listShipments, fetchLabel, normalize, orderItems };

};

__defs["connectors/paris"] = function (module, exports, require, __dirname) {
// Paris Marketplace (Cencosud) — API de developers.ecomm.cencosud.com
const cfg = require('../config');
const { request, NotReady, isPdf } = require('../http');

const API = () => cfg.paris.apiHost;

async function token(conn) {
  if (conn.creds.token && conn.creds.token_exp > Date.now()) return conn.creds.token;
  const r = await request(`${API()}/v1/auth/apiKey`, { method: 'POST', headers: { authorization: `Bearer ${conn.creds.apiKey}`, 'content-type': 'application/json' } }, { retries: 1 });
  const t = r.accessToken;
  if (!t) throw new Error('Paris no entregó accessToken; revisa la API Key');
  // el token dura 4 horas; se renueva 10 minutos antes
  conn.saveCreds({ ...conn.creds, token: t, token_exp: Date.now() + ((r.expiresIn || 14400) - 600) * 1000, parisSellerId: r.jwtPayload?.seller_id || conn.creds.parisSellerId });
  return t;
}
async function api(conn, path, opts = {}) {
  const t = await token(conn);
  return request(`${API()}${path}`, { ...opts, headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json', ...(opts.headers || {}) } });
}

async function test(conn) { await token(conn); return { sellerName: null }; }

function flatten(list) {
  // la API a veces anida { data: [ { data: [...] } ] }
  const out = [];
  for (const x of list || []) { if (Array.isArray(x?.data)) out.push(...x.data); else out.push(x); }
  return out;
}

function itemsOf(list) {
  const g = new Map();
  for (const it of list || []) {
    const k = it.sku || it.sellerSku || it.name;
    if (!g.has(k)) g.set(k, { name: it.name, variant: it.size ? `Talla/Tamaño: ${it.size}` : '', sku: it.sellerSku || '', pub_id: it.sku || '', qty: 0 });
    g.get(k).qty += Number(it.quantity || 1);
  }
  return [...g.values()];
}

async function shipmentsOf(conn, sub) {
  const shipments = await api(conn, `/v2/shipments/${encodeURIComponent(sub.subOrderNumber)}`);
  return (Array.isArray(shipments) ? shipments : []).map((sh, idx, all) => ({
    external_id: all.length > 1 ? `${sub.subOrderNumber}-${sh.id}` : String(sub.subOrderNumber),
    order_number: String(sub.subOrderNumber),
    sold_at: sub.originOrderDate || sub.createdAt,
    items: itemsOf(sh.items?.length ? sh.items : sub.items),
    labelReady: Boolean(sh.labelId || sh.labelUrl),
    cancelled: false,
    shipped: Boolean(sh.effectiveDispatchDate),
    meta: { dispatch_by: sh.dispatchDateTime || (sh.dispatchDate ? sh.dispatchDate + ' 23:59:00' : null), labelId: sh.labelId || null, labelUrl: sh.labelUrl || null, carrier: sh.carrier, tracking: sh.trackingNumber || null, statusId: sh.statusId, shipmentId: sh.id, customer: sub.customer?.name || [sh.shippingAddress?.firstName, sh.shippingAddress?.lastName].filter(Boolean).join(' ') },
  }));
}

async function listShipments(conn) {
  const from = new Date(Date.now() - cfg.lookbackDays * 864e5).toISOString();
  const out = [];
  for (let offset = 0; offset < 1000; offset += 50) {
    const r = await api(conn, `/v3/sub-orders?gteCreatedAt=${encodeURIComponent(from)}&limit=50&offset=${offset}`);
    const subs = flatten(r?.data);
    for (const sub of subs) {
      try { out.push(...(await shipmentsOf(conn, sub))); }
      catch (e) { console.warn('[Paris] suborden', sub.subOrderNumber, e.message); }
    }
    if (subs.length < 50) break;
  }
  return out;
}

async function fetchLabel(conn, order) {
  const meta = JSON.parse(order.meta || '{}');
  let url = null;
  if (meta.labelId) {
    const r = await api(conn, `/v2/label/print-label/${encodeURIComponent(meta.labelId)}`);
    const d = (r?.data || [])[0] || {};
    url = d.labels || d.url || null;
  }
  url = url || meta.labelUrl;
  if (!url) throw new NotReady('Paris todavía no genera la etiqueta');
  const pdf = await request(url, {}, { as: 'buffer' });
  if (!isPdf(pdf)) throw new Error('La etiqueta de Paris no es un PDF');
  return pdf;
}

// Ventas entre dos fechas, con productos (sección Ventas)
async function sales(conn, fromISO, toISO) {
  const out = [];
  const to = toISO ? new Date(toISO) : null;
  for (let offset = 0; offset < 10000; offset += 50) {
    const r = await api(conn, `/v3/sub-orders?gteCreatedAt=${encodeURIComponent(fromISO)}${toISO ? '&lteCreatedAt=' + encodeURIComponent(toISO) : ''}&limit=50&offset=${offset}`);
    const subs = flatten(r?.data);
    for (const sub of subs) {
      const at = sub.originOrderDate || sub.createdAt;
      if (to && at && new Date(at) > to) continue;
      const status = String(sub.status?.name || sub.statusName || sub.status || '').toLowerCase();
      if (/cancel|anulad|rechaz/.test(status)) continue;
      const g = new Map();
      for (const it of sub.items || []) {
        const k = it.sellerSku || it.sku || it.name;
        const qty = Number(it.quantity || 1);
        const line = Number(it.priceAfterDiscounts ?? it.grossPrice ?? 0) || Number(it.price ?? it.basePrice ?? 0) * qty;
        if (!g.has(k)) g.set(k, { sku: it.sellerSku || '', pub_id: it.sku || '', name: it.name || 'Producto', variant: it.size ? `Talla/Tamaño: ${it.size}` : '', qty: 0, amount: 0 });
        const x = g.get(k); x.qty += qty; x.amount += line;
      }
      const items = [...g.values()];
      const amount = Number(sub.subTotal ?? sub.totalAmount ?? sub.total ?? sub.grossTotal ?? 0) || items.reduce((a, i) => a + i.amount, 0);
      out.push({ id: String(sub.subOrderNumber), at, amount, units: items.reduce((a, i) => a + i.qty, 0) || 1, items });
    }
    if (subs.length < 50) break;
  }
  return out;
}

module.exports = { sales, test, listShipments, fetchLabel };

};

__defs["connectors/demo"] = function (module, exports, require, __dirname) {
// Conector de demostración: simula pedidos nuevos cada cierto tiempo y genera etiquetas falsas.
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const CATALOG = [
  { name: 'Polera básica algodón', variant: 'Color: Blanco · Talla: M', sku: 'POL-BAS-B-M' },
  { name: 'Polera oversize', variant: 'Color: Negro · Talla: L', sku: 'POL-OVS-N-L' },
  { name: 'Jogger french terry', variant: 'Color: Gris · Talla: XL', sku: 'JOG-GR-XL' },
  { name: 'Jockey trucker', variant: 'Color: Azul marino', sku: 'JCK-TRK-AZ' },
  { name: 'Lentes de sol polarizados', variant: 'Marco negro', sku: 'LEN-POL-01' },
  { name: 'Polerón canguro niña', variant: 'Color: Lila · Talla: 10', sku: 'POL-NIN-10' },
  { name: 'Hoodie con cierre', variant: 'Color: Celeste · Talla: S', sku: 'HOO-ZIP-S' },
];
const MKS = ['ml', 'fa', 'pa'];
const state = new Map(); // connection_id -> orders[]
let counter = 1000;

function rnd(a) { return a[Math.floor(Math.random() * a.length)]; }

function newOrder(sellerId) {
  const mk = rnd(MKS);
  const n = Math.random() < 0.3 ? 2 : 1;
  const items = [];
  for (let i = 0; i < n; i++) {
    const p = rnd(CATALOG);
    const pub = mk === 'ml' ? 'MLC' + (1400000000 + Math.floor(Math.random() * 9e8)) : mk === 'fa' ? String(880000000 + Math.floor(Math.random() * 9e6)) : 'MK' + Math.random().toString(36).slice(2, 10).toUpperCase();
    items.push({ ...p, pub_id: pub, qty: Math.random() < 0.2 ? 2 : 1 });
  }
  counter++;
  const num = mk === 'ml' ? '20000' + (9123450000 + counter) : mk === 'fa' ? String(1045670000 + counter) : String(3004510000 + counter);
  return { mk, external_id: `demo-${sellerId}-${counter}`, order_number: num, sold_at: new Date().toISOString(), items, labelReady: true, cancelled: false, shipped: false, meta: { demoMk: mk, dispatch_by: new Date(Date.now() + (Math.random() < 0.35 ? 864e5 * (1 + Math.floor(Math.random() * 2)) : 3600e3 * 3)).toISOString(), logistic: mk === 'ml' ? rnd(['self_service', 'cross_docking', 'drop_off']) : null, customer: rnd(['Camila Rojas', 'Diego Muñoz', 'Valentina Soto', 'Matías González', 'Fernanda Pérez', 'Benjamín Díaz']) } };
}

async function listShipments(conn) {
  const key = conn.row.id;
  if (!state.has(key)) {
    const initial = [];
    for (let i = 0; i < 3; i++) initial.push(newOrder(conn.row.seller_id));
    // pedido que incluye un producto bloqueado típico
    initial.push({ ...newOrder(conn.row.seller_id), items: [{ ...CATALOG[4], pub_id: 'MLC1487765432', qty: 1 }, { ...CATALOG[0], pub_id: 'MLC1392200411', qty: 1 }], meta: { demoMk: 'ml' }, mk: 'ml' });
    state.set(key, initial);
  } else if (Math.random() < 0.5) {
    state.get(key).push(newOrder(conn.row.seller_id));
  }
  return state.get(key);
}

async function fetchLabel(conn, order) {
  const meta = JSON.parse(order.meta || '{}');
  const mk = order.marketplace;
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.HelveticaBold);
  const r = await doc.embedFont(StandardFonts.Helvetica);
  // tamaños distintos para probar el ajuste a 100x150: ML 10x15, Falabella A4, Paris carta
  const size = mk === 'ml' ? [283, 425] : mk === 'fa' ? [595, 842] : [612, 792];
  const p = doc.addPage(size);
  const [W, H] = size;
  const lw = Math.min(W - 40, 360), lh = Math.min(H - 40, 520);
  const x0 = 20, y0 = H - 20 - lh;
  p.drawRectangle({ x: x0, y: y0, width: lw, height: lh, borderColor: rgb(0, 0, 0), borderWidth: 1.5 });
  const carrier = mk === 'ml' ? 'MERCADO ENVIOS' : mk === 'fa' ? 'FALABELLA ENVIOS - BLUE EXPRESS' : 'PARIS - CHILEXPRESS';
  p.drawText(carrier, { x: x0 + 12, y: y0 + lh - 26, size: 14, font: f });
  p.drawText(`Pedido ${order.order_number}`, { x: x0 + 12, y: y0 + lh - 46, size: 12, font: f });
  for (let i = 0; i < 60; i++) {
    const w = [1, 2, 3][i % 3];
    p.drawRectangle({ x: x0 + 20 + i * ((lw - 40) / 60), y: y0 + lh - 140, width: w, height: 70, color: rgb(0, 0, 0) });
  }
  p.drawText('DEMO-' + String(order.external_id).slice(-6), { x: x0 + 20, y: y0 + lh - 158, size: 11, font: r });
  const lines = ['Destinatario: Cliente de prueba', 'Av. Siempre Viva 742, Providencia', 'Región Metropolitana', 'Tel: +56 9 0000 0000'];
  lines.forEach((t, i) => p.drawText(t, { x: x0 + 12, y: y0 + lh - 190 - i * 16, size: 10, font: r }));
  if (mk !== 'ml') p.drawText('ETIQUETA DE PRUEBA (no válida para envío)', { x: x0 + 12, y: y0 + 16, size: 9, font: r, color: rgb(0.4, 0.4, 0.4) });
  return Buffer.from(await doc.save());
}

module.exports = { listShipments, fetchLabel };

};

__defs["sync"] = function (module, exports, require, __dirname) {
// Sincronización: trae pedidos, aplica bloqueos, descarga y estampa etiquetas automáticamente.
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const cfg = require('./config');
const db = require('./db');
const { decrypt, encrypt } = require('./security');
const { stampLabel } = require('./label');
const { NotReady } = require('./http');

const connectors = {
  ml: require('./connectors/ml'),
  fa: require('./connectors/falabella'),
  pa: require('./connectors/paris'),
  demo: require('./connectors/demo'),
};

const bus = new EventEmitter();
bus.setMaxListeners(200);

function logEvent(sellerId, kind, message) {
  db.prepare('INSERT INTO events (seller_id, kind, message) VALUES (?,?,?)').run(sellerId ?? null, kind, message);
}

function connObj(row) {
  const o = {
    row,
    creds: decrypt(row.creds_enc),
    settings: JSON.parse(row.settings || '{}'),
    saveCreds(c) { o.creds = c; db.prepare('UPDATE connections SET creds_enc = ? WHERE id = ?').run(encrypt(c), row.id); },
  };
  return o;
}

function blockedBy(order) {
  const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
  const rules = db.prepare('SELECT marketplace, value FROM blocklist WHERE seller_id = ?').all(order.seller_id);
  const hits = [];
  // Normaliza: mayúsculas, sin espacios/guiones, y el ID de Mercado Libre con o sin "MLC" (MLC123 = 123)
  const norm = v => { const x = String(v).trim().toUpperCase().replace(/[\s#-]+/g, ''); return [x, x.replace(/^MLC/, '')]; };
  items.forEach((it, index) => {
    const keys = new Set([it.sku, it.pub_id, it.fam_id, it.up_id].filter(Boolean).flatMap(norm)); // también el ID de familia / producto de Mercado Libre
    const r = rules.find(r => (r.marketplace === 'any' || r.marketplace === order.marketplace) && norm(r.value).some(k => k && keys.has(k)));
    if (r) hits.push({ index, sku: it.sku, pub_id: it.pub_id, name: it.name, rule: r.value });
  });
  return hits;
}

// Bloqueada = tiene un producto bloqueado y nadie la desbloqueó a mano
const isBlocked = o => !o.unblocked_at && blockedBy(o).length > 0;

// Numera los pedidos bloqueados (1, 2, 3…): el número sirve para juntar lo que manda el fulfillment con lo que rellena el vendedor
function assignBlockNumbers() {
  const rows = db.prepare("SELECT * FROM orders WHERE block_no IS NULL AND state IN ('ready','waiting','error') ORDER BY id ASC").all();
  for (const o of rows) {
    if (!blockedBy(o).length) continue;
    const next = (db.prepare('SELECT MAX(block_no) m FROM orders').get().m || 0) + 1;
    db.prepare('UPDATE orders SET block_no=? WHERE id=?').run(next, o.id);
  }
}

function labelPath(id) { return path.join(cfg.dataDir, 'labels', `${id}.pdf`); }

const getOrder = id => db.prepare('SELECT * FROM orders WHERE id = ?').get(id);

// Marca que la etiqueta ya está disponible en el marketplace, SIN descargarla.
// (En Mercado Libre, descargar la etiqueta la marca como "impresa"; por eso solo se descarga al imprimir.)
async function tryLabel(conn, orderId) {
  const order = getOrder(orderId);
  if (!order || !['waiting', 'error'].includes(order.state)) return;
  db.prepare(`UPDATE orders SET state='ready', error=NULL, updated_at=datetime('now') WHERE id=?`).run(order.id);
  logEvent(order.seller_id, 'label', `Etiqueta disponible: pedido ${order.order_number}`);
  bus.emit('change', { type: 'label', orderId: order.id, sellerId: order.seller_id });
}

// Descarga la etiqueta del marketplace y la prepara (100x150 + hoja de detalle). Solo se llama al imprimir.
const fetching = new Map();
function fetchLabelFile(orderId) {
  if (fetching.has(orderId)) return fetching.get(orderId);
  const p = (async () => {
    const order = getOrder(orderId);
    if (!order) throw new Error('Pedido no encontrado');
    if (order.label_file && fs.existsSync(labelPath(order.id))) return labelPath(order.id);
    let row = db.prepare('SELECT * FROM connections WHERE id=?').get(order.connection_id);
    if (!row) {
      // la cuenta se desconectó y se volvió a conectar (queda con otro id): se usa la conexión actual del vendedor
      row = db.prepare('SELECT * FROM connections WHERE seller_id=? AND marketplace=? ORDER BY id DESC').get(order.seller_id, order.marketplace);
      if (row) db.prepare('UPDATE orders SET connection_id=? WHERE id=?').run(row.id, order.id);
    }
    if (!row) throw new Error('La cuenta del marketplace ya no está conectada');
    let conn = connObj(row);
    let original;
    try { original = await connectors[row.marketplace].fetchLabel(conn, order); }
    catch (e) {
      // El envío pertenece a otra cuenta (p. ej. el pedido entró mientras una cuenta estaba mal conectada):
      // se busca la cuenta dueña del envío y se corrige el vendedor del pedido.
      if (row.marketplace !== 'ml' || !/invalid_caller|HTTP 40[13]/.test(e.message)) throw e;
      let fixed = false;
      for (const other of db.prepare("SELECT * FROM connections WHERE marketplace='ml' AND id<>?").all(row.id)) {
        try {
          const c2 = connObj(other);
          original = await connectors.ml.fetchLabel(c2, order);
          db.prepare('UPDATE orders SET seller_id=?, connection_id=? WHERE id=?').run(other.seller_id, other.id, order.id);
          order.seller_id = other.seller_id; conn = c2; fixed = true;
          logEvent(other.seller_id, 'order', `Pedido ${order.order_number} corregido: pertenece a esta cuenta de Mercado Libre`);
          bus.emit('change', { type: 'order', orderId: order.id, sellerId: other.seller_id });
          break;
        } catch { /* no es de esta cuenta */ }
      }
      if (!fixed) throw e;
    }
    const seller = db.prepare('SELECT name FROM sellers WHERE id = ?').get(order.seller_id);
    const missing = new Set(blockedBy(order).map(h => h.index));
    const stamped = await stampLabel(original, {
      blockNo: order.block_no || null,
      shipType: (() => { const m = JSON.parse(order.meta || '{}'); return ({ self_service: 'Flex', cross_docking: 'Colecta', drop_off: 'Agencia', xd_drop_off: 'Agencia' })[m.logistic] || m.carrier || ''; })(),
      items: JSON.parse(order.items).map((it, i) => ({ ...it, missing: missing.has(i) })), seller: seller?.name || '', marketplace: order.marketplace, orderNumber: order.order_number,
      customer: JSON.parse(order.meta || '{}').customer || '',
    });
    fs.writeFileSync(labelPath(order.id), stamped);
    db.prepare(`UPDATE orders SET label_file=?, label_at=COALESCE(label_at, datetime('now')), error=NULL WHERE id=?`).run(`${order.id}.pdf`, order.id);
    return labelPath(order.id);
  })().finally(() => fetching.delete(orderId));
  fetching.set(orderId, p);
  return p;
}

async function upsert(conn, s) {
  const mk = s.mk || conn.row.marketplace;
  const existing = db.prepare('SELECT * FROM orders WHERE marketplace = ? AND external_id = ?').get(mk, s.external_id);
  const printedOutside = mk === 'ml' && s.meta?.substatus === 'printed'; // la imprimieron directo en Mercado Libre
  if (!existing) {
    if (s.shipped || s.cancelled) return;
    const r = db.prepare(`INSERT INTO orders (seller_id, connection_id, marketplace, external_id, order_number, sold_at, items, meta)
      VALUES (?,?,?,?,?,?,?,?)`).run(conn.row.seller_id, conn.row.id, mk, s.external_id, s.order_number, s.sold_at || null, JSON.stringify(s.items), JSON.stringify(s.meta || {}));
    const id = Number(r.lastInsertRowid);
    if (printedOutside) db.prepare(`UPDATE orders SET state='printed', printed_at=datetime('now'), printed_by='Mercado Libre' WHERE id=?`).run(id);
    logEvent(conn.row.seller_id, 'order', `Nuevo pedido ${s.order_number}`);
    bus.emit('change', { type: 'order', orderId: id, sellerId: conn.row.seller_id });
    return id;
  }
  let state = existing.state;
  if (s.cancelled && !['printed', 'shipped'].includes(state)) state = 'cancelled';
  else if (s.shipped && state !== 'shipped') {
    // Ya salió (en Mercado Libre aparece "Seguir envío"): se da por impresa y enviada
    state = 'shipped';
    if (!existing.printed_at) db.prepare(`UPDATE orders SET printed_at=datetime('now'), printed_by=? WHERE id=?`).run(existing.label_at ? 'EtiquetaHub' : (mk === 'ml' ? 'Mercado Libre' : 'Marketplace'), existing.id);
  }
  // Si la imprimieron en Mercado Libre (y no fue la app la que la descargó), pasa a impresa
  if (printedOutside && ['ready', 'waiting', 'error'].includes(state) && !existing.label_at) {
    state = 'printed';
    db.prepare(`UPDATE orders SET printed_at=datetime('now'), printed_by='Mercado Libre' WHERE id=?`).run(existing.id);
  }
  db.prepare(`UPDATE orders SET items=?, meta=?, state=?, updated_at=datetime('now') WHERE id=?`)
    .run(JSON.stringify(s.items), JSON.stringify(s.meta || {}), state, existing.id);
  // si la cuenta se reconectó (nuevo id de conexión) el pedido pasa a la conexión vigente del mismo vendedor
  if (existing.connection_id !== conn.row.id && existing.seller_id === conn.row.seller_id) db.prepare('UPDATE orders SET connection_id=? WHERE id=?').run(conn.row.id, existing.id);
  if (state !== existing.state) bus.emit('change', { type: 'order', orderId: existing.id, sellerId: conn.row.seller_id });
  return existing.id;
}

const running = new Set();
async function syncConnection(connId, only = null) {
  if (running.has(connId)) return;
  running.add(connId);
  const row = db.prepare('SELECT * FROM connections WHERE id = ?').get(connId);
  try {
    if (!row) return;
    const conn = connObj(row);
    const list = only ? [only] : await connectors[row.marketplace].listShipments(conn);
    // Pedidos abiertos en la app que ya no vienen en la lista (p. ej. se enviaron): se consultan uno por uno
    if (!only && connectors[row.marketplace].refresh) {
      const seen = new Set(list.filter(Boolean).map(s => String(s.external_id)));
      const open = db.prepare("SELECT * FROM orders WHERE connection_id=? AND state IN ('waiting','ready','error')").all(connId).filter(o => !seen.has(String(o.external_id)));
      for (const o of open.slice(0, 50)) {
        try { const s = await connectors[row.marketplace].refresh(conn, o); if (s) list.push(s); } catch (e) { console.warn('[sync] refrescar', o.order_number, e.message); }
      }
    }
    for (const s of list) {
      if (!s) continue;
      const id = await upsert(conn, s);
      if (!id) continue;
      const canTry = s.labelReady || (row.marketplace === 'fa' && conn.settings.autoReady);
      if (canTry) await tryLabel(conn, id);
    }
    assignBlockNumbers();
    db.prepare(`UPDATE connections SET last_sync_at=datetime('now'), last_error=NULL WHERE id=?`).run(connId);
  } catch (e) {
    console.warn(`[sync] conexión ${connId} (${row?.marketplace}):`, e.message);
    db.prepare(`UPDATE connections SET last_sync_at=datetime('now'), last_error=? WHERE id=?`).run(e.message.slice(0, 500), connId);
    bus.emit('change', { type: 'connection', sellerId: row?.seller_id });
  } finally {
    running.delete(connId);
  }
}

async function syncAll() {
  const rows = db.prepare('SELECT id FROM connections').all();
  for (const r of rows) await syncConnection(r.id);
}

// Reintenta etiquetas pendientes de pedidos que se desbloquearon
async function retryUnblocked(sellerId) {
  const rows = db.prepare(`SELECT o.id, o.connection_id FROM orders o WHERE o.seller_id=? AND o.state IN ('waiting','error') AND o.connection_id IS NOT NULL`).all(sellerId);
  for (const r of rows) {
    const c = db.prepare('SELECT * FROM connections WHERE id=?').get(r.connection_id);
    if (c) await tryLabel(connObj(c), r.id);
  }
}

let timer = null;
function start() {
  // Tras un reinicio los PDF guardados se pierden: se vuelven a descargar solo cuando alguien imprima
  for (const o of db.prepare("SELECT id FROM orders WHERE label_file IS NOT NULL").all()) {
    if (!fs.existsSync(labelPath(o.id))) db.prepare('UPDATE orders SET label_file=NULL WHERE id=?').run(o.id);
  }
  const every = (cfg.demo ? 20 : cfg.pollSeconds) * 1000;
  const tick = () => syncAll().catch(e => console.error('[sync]', e));
  setTimeout(tick, 1500);
  timer = setInterval(tick, every);
  console.log(`Sincronización automática cada ${every / 1000} s`);
}

module.exports = { isBlocked, assignBlockNumbers, bus, start, tryLabel, fetchLabelFile, syncConnection, syncAll, blockedBy, labelPath, connObj, connectors, retryUnblocked, logEvent };

};

__defs["sales"] = function (module, exports, require, __dirname) {
// Sección Ventas: lo vendido por día y por producto en cada marketplace (hora de Chile)
const zlib = require('zlib');
const cfg = require('./config');
const db = require('./db');

const dayFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: cfg.timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
const localDay = d => dayFmt.format(d);
const today = () => localDay(new Date());
const KEEP_DAYS = 400;      // se guarda algo más de un año
const BACKFILL_STEP = 21;   // días de historial que se traen en cada vuelta (para no saturar las APIs)

function saveWindow(row, list, fromDay, toDay) {
  const upS = db.prepare(`INSERT INTO sales (marketplace, external_id, seller_id, day, amount, units, updated_at) VALUES (?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(marketplace, external_id) DO UPDATE SET day=excluded.day, amount=excluded.amount, units=excluded.units, seller_id=excluded.seller_id, updated_at=excluded.updated_at`);
  const delI = db.prepare('DELETE FROM sale_items WHERE marketplace=? AND order_id=?');
  const insI = db.prepare('INSERT INTO sale_items (marketplace, order_id, line, seller_id, day, sku, pub_id, name, variant, qty, amount) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const seen = new Set();
  db.exec('BEGIN');
  try {
    for (const s of list) {
      const day = s.localDay || (s.at ? localDay(new Date(s.at)) : null);
      if (!day) continue;
      upS.run(row.marketplace, s.id, row.seller_id, day, s.amount || 0, s.units || 1);
      if (Array.isArray(s.items)) {
        delI.run(row.marketplace, s.id);
        s.items.forEach((it, i) => insI.run(row.marketplace, s.id, i, row.seller_id, day, it.sku || '', it.pub_id || '', it.name || 'Producto', it.variant || '', it.qty || 1, it.amount || 0));
      }
      seen.add(s.id);
    }
    // lo que ya no viene (cancelado) dentro de la ventana se quita
    for (const r of db.prepare('SELECT external_id FROM sales WHERE marketplace=? AND seller_id=? AND day>=? AND day<=?').all(row.marketplace, row.seller_id, fromDay, toDay)) {
      if (!seen.has(r.external_id)) { db.prepare('DELETE FROM sales WHERE marketplace=? AND external_id=?').run(row.marketplace, r.external_id); delI.run(row.marketplace, r.external_id); }
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

let lastRun = 0, running = null;
async function refresh(force = false) {
  if (running) return running;
  if (!force && Date.now() - lastRun < 10 * 60e3) return;
  const sync = require('./sync');
  running = (async () => {
    const now = Date.now();
    for (const row of db.prepare("SELECT * FROM connections WHERE marketplace IN ('ml','fa','pa')").all()) {
      const c = sync.connectors[row.marketplace];
      if (!c.sales) continue;
      const conn = sync.connObj(row);
      try {
        // 1) últimos 8 días (se actualiza siempre)
        const from = new Date(now - 8 * 864e5);
        saveWindow(row, await c.sales(conn, from.toISOString(), null), localDay(new Date(now - 7 * 864e5)), today());
        // 2) historial hacia atrás, de a poco, hasta completar un año
        let st = db.prepare('SELECT backfilled_to FROM sales_sync WHERE connection_id=?').get(row.id);
        if (!st) { db.prepare('INSERT INTO sales_sync (connection_id, backfilled_to) VALUES (?,?)').run(row.id, from.toISOString()); st = { backfilled_to: from.toISOString() }; }
        const limit = now - 366 * 864e5;
        const to = new Date(st.backfilled_to);
        if (to.getTime() > limit) {
          const start = new Date(Math.max(limit, to.getTime() - BACKFILL_STEP * 864e5));
          const list = await c.sales(conn, start.toISOString(), to.toISOString());
          saveWindow(row, list, localDay(new Date(start.getTime() + 864e5)), localDay(new Date(to.getTime() - 864e5)));
          db.prepare('UPDATE sales_sync SET backfilled_to=? WHERE connection_id=?').run(start.toISOString(), row.id);
        }
        // familias de las publicaciones de Mercado Libre (para agrupar variantes que son publicaciones separadas)
        if (row.marketplace === 'ml' && c.families) {
          const ids = db.prepare(`SELECT DISTINCT i.pub_id FROM sale_items i LEFT JOIN item_family f ON f.marketplace='ml' AND f.pub_id=i.pub_id
            WHERE i.marketplace='ml' AND i.seller_id=? AND i.pub_id<>'' AND (f.pub_id IS NULL OR f.family_id IS NULL) LIMIT 3000`).all(row.seller_id).map(r => r.pub_id);
          if (ids.length) {
            const fam = await c.families(conn, ids);
            const ins = db.prepare("INSERT OR REPLACE INTO item_family (marketplace, pub_id, family, family_id, up_id) VALUES ('ml',?,?,?,?)");
            for (const [id, f] of Object.entries(fam)) ins.run(id, f.family || '', f.fam_id || '', f.up || '');
          }
        }
      } catch (e) { console.warn('[ventas]', row.marketplace, row.seller_id, e.message); }
    }
    const old = localDay(new Date(now - KEEP_DAYS * 864e5));
    db.prepare('DELETE FROM sales WHERE day < ?').run(old);
    db.prepare('DELETE FROM sale_items WHERE day < ?').run(old);
    lastRun = Date.now();
  })().finally(() => { running = null; });
  return running;
}

// Resumen de los últimos 7 días (hoy incluido) para un vendedor o para todos
function summary(sellerId) {
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(localDay(new Date(Date.now() - i * 864e5)));
  const where = sellerId ? 'AND seller_id = ?' : '';
  const args = sellerId ? [days[0], sellerId] : [days[0]];
  const rows = db.prepare(`SELECT day, marketplace, SUM(amount) amount, COUNT(*) orders, SUM(units) units FROM sales WHERE day >= ? ${where} GROUP BY day, marketplace`).all(...args);
  const series = {};
  for (const mk of ['ml', 'fa', 'pa']) series[mk] = days.map(d => { const r = rows.find(x => x.day === d && x.marketplace === mk); return { day: d, amount: r ? Math.round(r.amount) : 0, orders: r ? r.orders : 0, units: r ? r.units : 0 }; });
  const conns = db.prepare(`SELECT DISTINCT marketplace FROM connections WHERE marketplace IN ('ml','fa','pa') ${sellerId ? 'AND seller_id = ?' : ''}`).all(...(sellerId ? [sellerId] : [])).map(r => r.marketplace);
  return { days, today: today(), series, connected: conns, updatedAt: lastRun || null };
}

// Título sin colores ni tallas: "Camiseta Niña … Negro 3/4años" y "… Blanco 13/14 Años" quedan iguales
const COLORS = 'negro negra blanco blanca rojo roja azul marino oscuro oscura claro clara gris grafito rosa rosado rosada verde amarillo amarilla morado morada lila celeste beige cafe café chocolate burdeo burdeos fucsia naranjo naranja crema mostaza vino turquesa menta lavanda coral durazno salmon salmón palo hueso perla plomo jaspeado jaspeada melange caqui khaki camel arena terracota petroleo petróleo calipso multicolor dorado plateado'.split(' ');
const SIZE = /^(xxs|xs|s|m|l|xl|xxl|xxxl|xxxxl|[2-5]xl|\d{1,2}(\/\d{1,2})?|\d{1,2}-\d{1,2}|talla|tallas|t|años|anos|año|meses|unica|única|u|xl-xxl|s-m|l-xl|m-l)$/;
function baseTitle(t) {
  const words = String(t || '').split(/\s+/).filter(Boolean);
  const keep = words.filter(w => { const x = w.toLowerCase().replace(/[.,;:()]/g, '').replace(/(años|anos)$/, ''); return x && !COLORS.includes(x) && !SIZE.test(x); });
  return keep.join(' ');
}

// Planilla de productos vendidos entre dos días (incluidos)
function products(sellerId, from, to, { excludeBlocked = false } = {}) {
  const args = [from, to]; let where = 'day >= ? AND day <= ?';
  if (sellerId) { where += ' AND i.seller_id = ?'; args.push(sellerId); }
  const rows = db.prepare(`SELECT i.*, s.name seller, f.family, f.family_id, f.up_id FROM sale_items i LEFT JOIN sellers s ON s.id = i.seller_id
    LEFT JOIN item_family f ON f.marketplace = i.marketplace AND f.pub_id = i.pub_id WHERE ${where}`).all(...args);
  // Se agrupa por publicación (en Mercado Libre, el ID MLC… que comparte todas sus variantes); dentro, por variante
  // para el fulfillment: no se cuentan los productos que el vendedor bloqueó (el fulfillment no los trabaja)
  let isBlockedItem = () => false;
  if (excludeBlocked) {
    const norm = v => { const x = String(v || '').trim().toUpperCase().replace(/[\s#-]+/g, ''); return x ? [x, x.replace(/^MLC/, '')] : []; };
    const rules = new Map();
    for (const b of db.prepare('SELECT seller_id, marketplace, value FROM blocklist').all()) {
      if (!rules.has(b.seller_id)) rules.set(b.seller_id, []);
      rules.get(b.seller_id).push({ mk: b.marketplace, keys: norm(b.value) });
    }
    isBlockedItem = r => {
      const list = rules.get(r.seller_id); if (!list) return false;
      const keys = new Set([...norm(r.sku), ...norm(r.pub_id), ...norm(r.family_id), ...norm(r.up_id)]);
      return list.some(x => (x.mk === 'any' || x.mk === r.marketplace) && x.keys.some(k => keys.has(k)));
    };
  }
  const pubs = new Map();
  const blank = () => ({ qty: 0, amount: 0, orders: new Set(), byMk: { ml: 0, fa: 0, pa: 0 }, byDay: {} });
  const add = (x, r) => { x.qty += r.qty; x.amount += r.amount; x.orders.add(r.marketplace + r.order_id); x.byMk[r.marketplace] = (x.byMk[r.marketplace] || 0) + r.qty; x.byDay[r.day] = (x.byDay[r.day] || 0) + r.qty; };
  const daily = {}; // unidades por día y marketplace (para el gráfico)
  for (const r of rows) {
    if (isBlockedItem(r)) continue;
    daily[r.day] = daily[r.day] || { ml: 0, fa: 0, pa: 0 }; daily[r.day][r.marketplace] = (daily[r.day][r.marketplace] || 0) + r.qty;
    // Mercado Libre: se agrupa por familia (variantes publicadas por separado) y si no hay, por publicación (MLC…)
    // si Mercado Libre no entrega familia, se agrupan los títulos que solo cambian en color o talla
    const fam = r.marketplace === 'ml' ? baseTitle(r.family || r.name) || r.name : '';
    const pkey = `${r.seller_id}|${r.marketplace}|${fam ? 'FAM:' + fam.toUpperCase() : r.marketplace === 'ml' && r.pub_id ? r.pub_id : (r.name || '').trim().toUpperCase()}`;
    if (!pubs.has(pkey)) pubs.set(pkey, { ...blank(), seller: r.seller || '', marketplace: r.marketplace, pub_id: r.pub_id || '', pubIds: new Set(), name: fam || r.name, variants: new Map() });
    const p = pubs.get(pkey); add(p, r); if (r.pub_id) p.pubIds.add(r.pub_id);
    // la misma variante puede venir con los atributos en distinto orden ("Talla · Color" / "Color · Talla"): se ordenan
    // si la variante es una publicación aparte (familia), se muestra su título y su MLC
    const extra = fam ? String(r.name || '').split(/\s+/).filter(w => !baseTitle(w)).join(' ') : ''; // lo que distingue a esta publicación: color / talla
    // variante = atributos de Mercado Libre + lo que dice el título y no está en los atributos (p. ej. la talla "13/14 Años")
    const low = String(r.variant || '').toLowerCase();
    const extraNew = extra.split(/\s+/).filter(w => w && !low.includes(w.toLowerCase())).join(' ');
    const vlabel = [r.variant, extraNew].filter(Boolean).join(' · ') || (fam && fam !== r.name ? r.name : '');
    const vkey = (vlabel || '').split('·').map(x => x.trim().toUpperCase()).filter(Boolean).sort().join('|') + '|' + (r.sku || '').toUpperCase();
    if (!p.variants.has(vkey)) p.variants.set(vkey, { ...blank(), variant: vlabel, sku: r.sku || r.pub_id || '' });
    add(p.variants.get(vkey), r);
  }
  const fin = x => ({ ...x, orders: x.orders.size, amount: Math.round(x.amount) });
  const byQty = (a, b) => b.qty - a.qty || b.amount - a.amount;
  const list = [...pubs.values()].map(p => ({ ...fin(p), pubIds: undefined, pubList: [...p.pubIds], pub_id: p.pubIds.size > 1 ? `${p.pubIds.size} publicaciones` : p.pub_id, variants: [...p.variants.values()].map(fin).sort(byQty) })).sort(byQty);
  // desde qué día hay historial completo
  const conns = db.prepare(`SELECT c.id FROM connections c WHERE c.marketplace IN ('ml','fa','pa') ${sellerId ? 'AND c.seller_id = ?' : ''}`).all(...(sellerId ? [sellerId] : []));
  let since = today();
  for (const c of conns) { const st = db.prepare('SELECT backfilled_to FROM sales_sync WHERE connection_id=?').get(c.id); const d = st ? localDay(new Date(st.backfilled_to)) : today(); if (d < since) since = d; }
  return { from, to, rows: list, daily, historySince: conns.length ? since : null };
}

// ---------- Excel (.xlsx) sin librerías: un ZIP con las hojas en XML ----------
function zip(files) {
  const parts = [], central = []; let offset = 0;
  for (const [name, content] of files) {
    const data = Buffer.from(content, 'utf8'), comp = zlib.deflateRawSync(data), nameB = Buffer.from(name), crc = zlib.crc32(data);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0, 6); h.writeUInt16LE(8, 8); h.writeUInt32LE(0, 10); h.writeUInt32LE(crc >>> 0, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nameB.length, 26); h.writeUInt16LE(0, 28);
    parts.push(h, nameB, comp);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0, 8); c.writeUInt16LE(8, 10); c.writeUInt32LE(0, 12); c.writeUInt32LE(crc >>> 0, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nameB.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, nameB);
    offset += 30 + nameB.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}
const xmlEsc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const colName = n => { let s = ''; n++; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
function xlsx(title, header, rows, widths) {
  // estilos: 0 normal, 1 encabezado (negrita, fondo celeste), 2 dinero, 3 título
  const cell = (v, r, c, style) => {
    const ref = colName(c) + (r + 1);
    if (typeof v === 'number') return `<c r="${ref}"${style ? ` s="${style}"` : ''}><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
  };
  const all = [[{ v: title, s: 3 }], [], header.map(h => ({ v: h.label, s: 1 })), ...rows.map(r => { const cells = Array.isArray(r) ? r : r.cells, b = !Array.isArray(r) && r.bold; return header.map((h, i) => ({ v: cells[i], s: h.money ? (b ? 5 : 2) : (b ? 4 : 0) })); })];
  const sheetRows = all.map((r, ri) => `<row r="${ri + 1}">${r.map((x, ci) => cell(x.v, ri, ci, x.s)).join('')}</row>`).join('');
  const cols = `<cols>${header.map((h, i) => `<col min="${i + 1}" max="${i + 1}" width="${(widths && widths[i]) || 14}" customWidth="1"/>`).join('')}</cols>`;
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${sheetRows}</sheetData><autoFilter ref="A3:${colName(header.length - 1)}${Math.max(3, rows.length + 3)}"/></worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0"/></numFmts><fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF0C2B40"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF0A6FA6"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD8EDF9"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  return zip([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Productos vendidos" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">\'Productos vendidos\'!$A$3:$' + colName(header.length - 1) + '$' + Math.max(3, rows.length + 3) + '</definedName></definedNames></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/worksheets/sheet1.xml', sheet],
    ['xl/styles.xml', styles],
  ]);
}

// Días entre dos fechas (YYYY-MM-DD), incluidos
function daysBetween(from, to) {
  const out = []; const d = new Date(from + 'T12:00:00Z'), end = new Date(to + 'T12:00:00Z');
  while (d <= end && out.length < 400) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
const WD = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
function productsXlsx(sellerId, from, to, sellerName, { noMoney = false } = {}) {
  const data = products(sellerId, from, to, { excludeBlocked: noMoney });
  const days = daysBetween(from, to);
  const weekly = days.length <= 7;
  const MKN = { ml: 'Mercado Libre', fa: 'Falabella', pa: 'Paris' };
  const header = [
    ...(sellerId ? [] : [{ label: 'Vendedor' }]),
    { label: 'Publicación' }, { label: 'Marketplace' }, { label: 'ID publicación' }, { label: 'Variante' }, { label: 'SKU' },
    ...(weekly ? days.map(d => ({ label: `${WD[new Date(d + 'T12:00:00Z').getUTCDay()]} ${d.slice(8)}/${d.slice(5, 7)}` })) : [{ label: 'Mercado Libre' }, { label: 'Falabella' }, { label: 'Paris' }]),
    { label: 'Total unidades' }, { label: 'Ventas' }, ...(noMoney ? [] : [{ label: 'Monto', money: true }]),
  ];
  const nums = r => [...(weekly ? days.map(d => r.byDay[d] || 0) : [r.byMk.ml || 0, r.byMk.fa || 0, r.byMk.pa || 0]), r.qty, r.orders, ...(noMoney ? [] : [r.amount])];
  const rows = [];
  for (const p of data.rows) {
    // fila de la publicación (en negrita) y debajo sus variantes
    const vs = p.variants.filter(v => v.variant || v.sku);
    rows.push({ bold: true, cells: [...(sellerId ? [] : [p.seller]), p.name, MKN[p.marketplace] || '', p.pub_id, vs.length ? `${vs.length} variante${vs.length === 1 ? '' : 's'}` : '', '', ...nums(p)] });
    if (vs.length) for (const v of vs) rows.push({ cells: [...(sellerId ? [] : ['']), '', '', '', '   ' + (v.variant || 'Sin variante'), v.sku, ...nums(v)] });
  }
  const widths = [...(sellerId ? [] : [18]), 46, 14, 16, 30, 18, ...(weekly ? days.map(() => 10) : [14, 12, 10]), 14, 10, 14];
  const title = `Productos vendidos · ${sellerName || 'Todas las cuentas'} · ${from.split('-').reverse().join('/')} al ${to.split('-').reverse().join('/')}`;
  return xlsx(title, header, rows, widths);
}

function start() {
  if (cfg.demo) {
    // datos de ejemplo para el modo demo
    const sellers = db.prepare('SELECT id FROM sellers').all();
    const P = [['Polera básica algodón', 'Blanco · M', 'POL-BAS-B-M'], ['Polera oversize', 'Negro · L', 'POL-OVS-N-L'], ['Jockey trucker', 'Azul marino', 'JCK-TRK-AZ'], ['Hoodie con cierre', 'Celeste · S', 'HOO-ZIP-S'], ['Jogger french terry', 'Gris · XL', 'JOG-GR-XL'], ['Lentes de sol polarizados', 'Marco negro', 'LEN-POL-01'], ['Polera básica algodón', 'Negro · L', 'POL-BAS-N-L'], ['Polera básica algodón', 'Gris · S', 'POL-BAS-G-S']];
    const ins = db.prepare('INSERT OR IGNORE INTO sales (marketplace, external_id, seller_id, day, amount, units) VALUES (?,?,?,?,?,?)');
    const insI = db.prepare('INSERT OR IGNORE INTO sale_items (marketplace, order_id, line, seller_id, day, sku, pub_id, name, variant, qty, amount) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    let n = 0;
    for (const s of sellers) for (let i = 0; i < 60; i++) for (const mk of ['ml', 'fa', 'pa']) {
      const k = mk === 'ml' ? 9 : mk === 'fa' ? 4 : 2;
      for (let j = 0; j < Math.floor(Math.random() * k) + 1; j++) {
        const id = `demo-${s.id}-${i}-${mk}-${j}-${n++}`, p = P[Math.floor(Math.random() * P.length)], q = 1 + Math.floor(Math.random() * 2), amt = (7990 + Math.floor(Math.random() * 25) * 1000) * q, day = localDay(new Date(Date.now() - i * 864e5));
        ins.run(mk, id, s.id, day, amt, q); insI.run(mk, id, 0, s.id, day, p[2], 'MLC' + (1000 + P.findIndex(x => x[0] === p[0])), p[0], p[1], q, amt);
      }
    }
    return;
  }
  setTimeout(() => refresh(true).catch(() => {}), 20000);
  setInterval(() => refresh(true).catch(() => {}), 15 * 60e3);
}

module.exports = { refresh, summary, products, productsXlsx, start, today };

};

__defs["server"] = function (module, exports, require, __dirname) {
const http = require('http');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const db = require('./db');
const sec = require('./security');
const sync = require('./sync');
const sales = require('./sales');
const { mergePdfs } = require('./label');
const ml = require('./connectors/ml');
const fa = require('./connectors/falabella');
const pa = require('./connectors/paris');
const settings = require('./settings');
const recovery = require('./recovery');
const backup = require('./backup');
const { encryptBuf } = require('./keys');

const PUBLIC = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

// ---------- utilidades ----------
function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  const data = isBuf ? body : typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': isBuf ? 'application/octet-stream' : typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(data);
}
const ok = (res, body = { ok: true }) => send(res, 200, body);
const fail = (res, status, message) => send(res, status, { error: message });

function cookies(req) {
  const out = {};
  for (const p of (req.headers.cookie || '').split(';')) { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }
  return out;
}
function setSessionCookie(res, token, maxAge = 30 * 86400) {
  const secure = cfg.baseUrl.startsWith('https') ? '; Secure' : '';
  res.setHeader('set-cookie', `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}
async function readBody(req, limit = 1e6) {
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > limit) throw Object.assign(new Error('Cuerpo muy grande'), { status: 413 }); chunks.push(c); }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error('JSON inválido'), { status: 400 }); }
}

// Enlace "Seguir envío": la venta en Mercado Libre, o el seguimiento del courier en Falabella/Paris
function trackUrl(o, meta, user) {
  const restricted = user && user.role === 'fulfillment'; // el fulfillment no ve el detalle de la venta (precios, etc.)
  if (o.marketplace === 'ml' && !restricted) return `https://www.mercadolibre.cl/ventas/${encodeURIComponent(o.order_number)}/detalle`;
  const t = meta.tracking, c = String(meta.carrier || '').toUpperCase();
  if (t && c.includes('BLUE')) return `https://www.blue.cl/seguimiento/?n_seguimiento=${encodeURIComponent(t)}`;
  if (t && c.includes('CHILEXPRESS')) return `https://centrodeayuda.chilexpress.cl/seguimiento/${encodeURIComponent(t)}`;
  if (t && c.includes('STARKEN')) return `https://www.starken.cl/seguimiento?codigo=${encodeURIComponent(t)}`;
  if (restricted) return null;
  if (o.marketplace === 'fa') return 'https://sellercenter.falabella.com/';
  if (o.marketplace === 'pa') return 'https://marketplace.paris.cl/';
  return null;
}
function orderView(o, user) {
  const items = JSON.parse(o.items);
  const blocked = sync.blockedBy(o);
  const seller = db.prepare('SELECT name FROM sellers WHERE id=?').get(o.seller_id);
  const meta = JSON.parse(o.meta || '{}');
  const own = user.role !== 'seller' || o.seller_id === user.seller_id; // un vendedor ve todo, pero solo actúa sobre lo suyo
  return {
    own,
    id: o.id, seller_id: o.seller_id, seller: seller?.name || '', marketplace: o.marketplace, order_number: o.order_number,
    sold_at: o.sold_at, created_at: o.created_at, items, state: blocked.length && !o.unblocked_at && ['ready', 'waiting', 'error'].includes(o.state) ? 'blocked' : o.state,
    block_no: o.block_no || null, unblocked_by: o.unblocked_at ? o.unblocked_by : null, missing: o.block_no ? blocked.length : 0,
    waiting_note: meta.buffered_until ? `Mercado Libre libera la etiqueta el ${new Intl.DateTimeFormat('es-CL', { timeZone: cfg.timezone, weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(meta.buffered_until))}` : null,
    blocked_skus: blocked.map(b => (b.sku || b.pub_id)), missing_idx: blocked.map(b => b.index), label_at: o.label_at, printed_at: o.printed_at, printed_by: o.printed_by,
    error: (user.role === 'seller' && own) || user.role === 'admin' ? o.error : (o.state === 'error' ? 'No se pudo obtener la etiqueta' : o.error),
    carrier: meta.carrier || null, dispatch_by: dispatchView(o.marketplace, meta.dispatch_by), dispatch_mk: o.marketplace === 'fa' ? meta.dispatch_by || null : null, ship_type: ({ self_service: 'Flex', cross_docking: 'Colecta', drop_off: 'Agencia', xd_drop_off: 'Agencia', fulfillment: 'Full' })[meta.logistic] || null, customer: meta.customer || '', tracking: meta.tracking || null, track_url: own ? trackUrl(o, meta, user) : null,
  };
}

// Quién imprimió: "Vendedor · Tienda", "Fulfillment · Nombre" o "Administrador · Nombre"
// Paris informa como plazo "fecha de compra + 72 h", así que la hora es la de la compra (8:23, 11:13…), no un horario de corte real.
// Para Paris mostramos solo el día (hora local de Chile), sin hora.
function dispatchView(mk, v) {
  if (!v) return null;
  if (mk === 'fa') {
    // Falabella da 2 días para preparar: se despacha un día antes del plazo (si cae domingo, el sábado)
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/);
    if (!m) return v;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] - 1));
    if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10) + ' ' + m[4];
  }
  if (mk !== 'pa') return v;
  const d = new Date(String(v).includes('T') ? v : String(v).replace(' ', 'T'));
  if (isNaN(d)) return v;
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: cfg.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return day + ' 23:59:00';
}
function printedByLabel(user) {
  if (user.role === 'seller') return `Vendedor · ${db.prepare('SELECT name FROM sellers WHERE id=?').get(user.seller_id)?.name || user.name}`;
  if (user.role === 'fulfillment') return `Fulfillment · ${user.name}`;
  return `Administrador · ${user.name}`;
}

// Vendedor objetivo: el propio, o el que indique un admin con ?seller_id=
function targetSeller(user, url) {
  if (user.role === 'seller') return user.seller_id;
  if (user.role === 'admin') { const id = Number(url.searchParams.get('seller_id')); return id || null; }
  return null;
}

function connView(c) {
  const s = JSON.parse(c.settings || '{}');
  const hook = c.marketplace === 'fa' ? `${cfg.baseUrl}/webhooks/falabella/${c.id}/${sec.sign('fa:' + c.id)}` : null;
  return { id: c.id, marketplace: c.marketplace, account_label: c.account_label, last_sync_at: c.last_sync_at, last_error: c.last_error, settings: s, webhook_url: hook };
}

function upsertConnection(sellerId, mk, creds, { label, externalId, settings } = {}) {
  const existing = db.prepare('SELECT id, settings FROM connections WHERE seller_id=? AND marketplace=?').get(sellerId, mk);
  const enc = sec.encrypt(creds);
  if (existing) {
    const merged = { ...JSON.parse(existing.settings || '{}'), ...(settings || {}) };
    db.prepare('UPDATE connections SET creds_enc=?, account_label=?, external_id=?, settings=?, last_error=NULL WHERE id=?').run(enc, label || null, externalId || null, JSON.stringify(merged), existing.id);
    return existing.id;
  }
  return Number(db.prepare('INSERT INTO connections (seller_id, marketplace, creds_enc, account_label, external_id, settings) VALUES (?,?,?,?,?,?)')
    .run(sellerId, mk, enc, label || null, externalId || null, JSON.stringify(settings || {})).lastInsertRowid);
}

// ---------- SSE ----------
const clients = new Set();
sync.bus.on('change', () => backup.schedule(15000));
sync.bus.on('change', ev => {
  const msg = `event: change\ndata: ${JSON.stringify(ev)}\n\n`;
  for (const c of clients) c.res.write(msg); // todos ven todas las etiquetas
});
setInterval(() => { for (const c of clients) c.res.write(': ping\n\n'); }, 25000);

// Versión de la app (cambia en cada actualización): el navegador se recarga solo cuando cambia
let _ver = null;
function appVersion() {
  if (_ver) return _ver;
  const h = require('crypto').createHash('sha1');
  try { h.update(global.__EH_PUBLIC ? global.__EH_PUBLIC['app.js'] + global.__EH_PUBLIC['app.css'] : fs.readFileSync(path.join(PUBLIC, 'app.js')) + fs.readFileSync(path.join(PUBLIC, 'app.css'))); } catch { h.update(String(Date.now())); }
  return (_ver = h.digest('hex').slice(0, 12));
}

// ---------- rutas ----------
async function route(req, res) {
  const url = new URL(req.url, cfg.baseUrl);
  const p = url.pathname;
  const m = req.method;

  if (p === '/health') return ok(res, { ok: true, demo: cfg.demo, v: appVersion() });

  // Respaldo cifrado de la base de datos (lo guarda GitHub Actions; sin APP_SECRET es ilegible)
  if (p === '/backup.enc' && m === 'GET') {
    const tmp = path.join(require('os').tmpdir(), `eh-backup-${Date.now()}.db`);
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    const plain = fs.readFileSync(tmp);
    const enc = encryptBuf(require('zlib').gzipSync(plain, { level: 6 })); // comprimido: el respaldo ocupa ~5 veces menos
    res.setHeader('x-plain-hash', require('crypto').createHash('sha256').update(plain).digest('hex'));
    fs.unlinkSync(tmp);
    return send(res, 200, enc, { 'content-type': 'application/octet-stream' });
  }

  // Primera vez: crear el administrador desde la pantalla
  if (p === '/api/setup-status' && m === 'GET') {
    return ok(res, { needsSetup: db.prepare('SELECT COUNT(*) n FROM users').get().n === 0, demo: cfg.demo });
  }
  if (p === '/api/setup' && m === 'POST') {
    if (db.prepare('SELECT COUNT(*) n FROM users').get().n > 0) return fail(res, 403, 'La app ya tiene administrador');
    const b = await readBody(req);
    if (!b.name || !b.email || String(b.password || '').length < 8) return fail(res, 400, 'Completa nombre, correo y una contraseña de al menos 8 caracteres');
    const r = db.prepare('INSERT INTO users (email,name,role,pass_hash) VALUES (?,?,?,?)').run(String(b.email).trim(), String(b.name).trim(), 'admin', sec.hashPassword(String(b.password)));
    setSessionCookie(res, sec.createSession(Number(r.lastInsertRowid)));
    return ok(res);
  }

  // Webhook Mercado Libre (responder rápido y procesar después)
  if (p === '/webhooks/ml' && m === 'POST') {
    const body = await readBody(req).catch(() => ({}));
    ok(res);
    const conn = db.prepare("SELECT * FROM connections WHERE marketplace='ml' AND external_id=?").get(String(body.user_id || ''));
    if (conn && ['orders_v2', 'shipments'].includes(body.topic)) {
      ml.fromNotification(sync.connObj(conn), body).then(s => s && sync.syncConnection(conn.id, s)).catch(e => console.warn('[webhook ML]', e.message));
    }
    return;
  }
  // Webhook Falabella: /webhooks/falabella/:connId/:firma
  const fh = p.match(/^\/webhooks\/falabella\/(\d+)\/([\w-]+)$/);
  if (fh && m === 'POST') {
    await readBody(req).catch(() => ({}));
    if (fh[2] !== sec.sign('fa:' + fh[1])) return fail(res, 403, 'Firma inválida');
    ok(res);
    sync.syncConnection(Number(fh[1]));
    return;
  }

  // Archivos estáticos
  if (m === 'GET' && !p.startsWith('/api/') && !p.startsWith('/auth/')) {
    const file = p === '/' ? 'index.html' : p.slice(1);
    if (global.__EH_PUBLIC) {
      const f = global.__EH_PUBLIC[file] !== undefined ? file : 'index.html';
      return send(res, 200, Buffer.from(global.__EH_PUBLIC[f], 'base64'), { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    }
    const full = path.join(PUBLIC, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
    if (full.startsWith(PUBLIC) && fs.existsSync(full) && fs.statSync(full).isFile()) {
      return send(res, 200, fs.readFileSync(full), { 'content-type': MIME[path.extname(full)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    }
    return send(res, 200, fs.readFileSync(path.join(PUBLIC, 'index.html')), { 'content-type': MIME['.html'] });
  }

  // Login
  if (p === '/api/login' && m === 'POST') {
    const { email, password } = await readBody(req);
    const key = String(email || '').trim().toLowerCase() + '|' + (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0];
    if (recovery.loginBlocked(key)) return fail(res, 429, 'Demasiados intentos. Espera 15 minutos o usa "¿Olvidaste tu contraseña?".');
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim());
    let viaBackup = false;
    if (u && !sec.checkPassword(String(password || ''), u.pass_hash)) {
      // ¿Es su clave de respaldo? (un solo uso; después debe crear contraseña nueva)
      const code = String(password || '').trim().toUpperCase();
      if (u.backup_hash && /^RSP-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code) && sec.checkPassword(code, u.backup_hash)) viaBackup = true;
      else { recovery.loginFailed(key); return fail(res, 401, 'Correo o contraseña incorrectos'); }
    }
    if (!u) { recovery.loginFailed(key); return fail(res, 401, 'Correo o contraseña incorrectos'); }
    if (viaBackup) {
      db.prepare('UPDATE users SET backup_hash=NULL, must_change=1 WHERE id=?').run(u.id);
      sync.logEvent(null, 'auth', `${u.email} entró con su clave de respaldo`);
    }
    recovery.loginOk(key);
    setSessionCookie(res, sec.createSession(u.id));
    return ok(res);
  }

  // Recuperar contraseña con código por correo
  if (p === '/api/password/forgot' && m === 'POST') {
    if (!recovery.mailConfigured()) return fail(res, 503, 'La recuperación por correo aún no está activada. Pídele al administrador que la configure.');
    const { email } = await readBody(req);
    try { await recovery.requestCode(email); } catch (e) { console.warn('[correo]', e.message); return fail(res, 502, 'No se pudo enviar el correo. Intenta de nuevo en unos minutos.'); }
    return ok(res, { ok: true, message: 'Si el correo está registrado, te llegará un código de 6 dígitos.' });
  }
  if (p === '/api/password/check' && m === 'POST') {
    const { email, code } = await readBody(req);
    const r = recovery.verifyCode(email, code, false);
    return r.error ? fail(res, 400, r.error) : ok(res);
  }
  if (p === '/api/password/login' && m === 'POST') {
    const { email, code } = await readBody(req);
    const r = recovery.verifyCode(email, code, true);
    if (r.error || !r.user) return fail(res, 400, r.error || 'Código inválido');
    setSessionCookie(res, sec.createSession(r.user.id));
    return ok(res);
  }
  if (p === '/api/password/reset' && m === 'POST') {
    const { email, code, password } = await readBody(req);
    if (String(password || '').length < 8) return fail(res, 400, 'La contraseña debe tener al menos 8 caracteres');
    const r = recovery.verifyCode(email, code, true);
    if (r.error || !r.user) return fail(res, 400, r.error || 'Código inválido');
    db.prepare('UPDATE users SET pass_hash=? WHERE id=?').run(sec.hashPassword(String(password)), r.user.id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(r.user.id);
    setSessionCookie(res, sec.createSession(r.user.id));
    return ok(res);
  }

  const token = cookies(req).sid;
  const user = sec.userFromToken(token);

  if (p === '/api/logout' && m === 'POST') { if (token) sec.destroySession(token); setSessionCookie(res, '', 0); return ok(res); }

  // OAuth Mercado Libre: callback no requiere sesión (se valida el state firmado)
  if (p === '/auth/ml/callback') {
    const code = url.searchParams.get('code');
    const [sellerId, ts, sig] = String(url.searchParams.get('state') || '').split('.');
    if (!code || sig !== sec.sign(`ml:${sellerId}:${ts}`) || Date.now() - Number(ts) > 15 * 60e3) return send(res, 400, 'Autorización inválida o vencida. Vuelve a intentarlo desde EtiquetaHub.');
    try {
      const t = await ml.exchangeCode(code);
      // Evita conectar por error la cuenta de Mercado Libre de OTRO vendedor (pasa si el navegador tenía otra sesión abierta)
      const dup = db.prepare("SELECT c.seller_id, s.name, c.account_label FROM connections c JOIN sellers s ON s.id=c.seller_id WHERE c.marketplace='ml' AND c.external_id=? AND c.seller_id<>?").get(String(t.user_id), Number(sellerId));
      if (dup) return send(res, 409, `Esa cuenta de Mercado Libre${dup.account_label ? ' (' + dup.account_label + ')' : ''} ya está conectada al vendedor ${dup.name}. Cierra sesión en Mercado Libre, entra con la cuenta correcta de este vendedor y vuelve a conectar desde EtiquetaHub.`);
      const connId = upsertConnection(Number(sellerId), 'ml', t, { externalId: t.user_id });
      const conn = sync.connObj(db.prepare('SELECT * FROM connections WHERE id=?').get(connId));
      const me = await ml.whoAmI(conn).catch(() => null);
      if (me?.nickname) db.prepare('UPDATE connections SET account_label=? WHERE id=?').run(me.nickname, connId);
      sync.syncConnection(connId);
      if (!user) return send(res, 200, `Listo: la cuenta de Mercado Libre${me?.nickname ? ' ' + me.nickname : ''} quedó conectada a EtiquetaHub. Ya puedes cerrar esta ventana.`);
      res.writeHead(302, { location: '/?conectado=ml' }); return res.end();
    } catch (e) {
      return send(res, 502, 'Mercado Libre rechazó la conexión: ' + e.message);
    }
  }

  // link para que un vendedor conecte SU Mercado Libre desde su propio navegador (lo genera el administrador)
  if (p === '/auth/ml/link') {
    const sid = Number(url.searchParams.get('s')), exp = Number(url.searchParams.get('e')), sig = url.searchParams.get('g');
    if (!sid || sig !== sec.sign(`mllink:${sid}:${exp}`) || Date.now() > exp) return send(res, 400, 'Este link ya no es válido. Pide uno nuevo al administrador de EtiquetaHub.');
    const ts = Date.now();
    res.writeHead(302, { location: ml.authUrl(`${sid}.${ts}.${sec.sign(`ml:${sid}:${ts}`)}`) });
    return res.end();
  }

  if (!user) return fail(res, 401, 'Inicia sesión');

  if (p === '/auth/ml/start') {
    const sellerId = targetSeller(user, url);
    if (!sellerId) return fail(res, 400, 'Falta el vendedor');
    if (!settings.mlClientId()) return send(res, 500, 'Falta configurar la app de Mercado Libre (Usuarios › Configuración).');
    const ts = Date.now();
    res.writeHead(302, { location: ml.authUrl(`${sellerId}.${ts}.${sec.sign(`ml:${sellerId}:${ts}`)}`) });
    return res.end();
  }

  if (p === '/api/me' && m === 'GET') {
    const seller = user.seller_id ? db.prepare('SELECT id, name FROM sellers WHERE id=?').get(user.seller_id) : null;
    const imp = user.impersonator_id ? db.prepare('SELECT name FROM users WHERE id=?').get(user.impersonator_id) : null;
    return ok(res, { user: { id: user.id, email: user.email, name: user.name, role: user.role }, mustChange: Boolean(user.must_change) && !user.impersonator_id, impersonatedBy: imp?.name || null, seller, cutoff: cfg.cutoff, demo: cfg.demo, mlConfigured: Boolean(settings.mlClientId()) });
  }

  // Cambiar mi propia contraseña (también la obligatoria tras una clave temporal)
  if (p === '/api/me/password' && m === 'POST') {
    const b = await readBody(req);
    if (String(b.password || '').length < 8) return fail(res, 400, 'La contraseña debe tener al menos 8 caracteres');
    if (user.impersonator_id) return fail(res, 403, 'No puedes cambiar la clave de otra persona mientras usas su cuenta');
    const u = db.prepare('SELECT pass_hash, must_change FROM users WHERE id=?').get(user.id);
    if (!u.must_change && !sec.checkPassword(String(b.current || ''), u.pass_hash)) return fail(res, 400, 'Tu contraseña actual no es correcta');
    db.prepare('UPDATE users SET pass_hash=?, must_change=0 WHERE id=?').run(sec.hashPassword(String(b.password)), user.id);
    db.prepare('DELETE FROM sessions WHERE user_id=? AND token<>?').run(user.id, token);
    return ok(res);
  }
  // Generar mi propia clave de respaldo
  if (p === '/api/me/backup-code' && m === 'POST') {
    if (user.impersonator_id) return fail(res, 403, 'No disponible mientras usas otra cuenta');
    const code = sec.backupCode();
    db.prepare('UPDATE users SET backup_hash=? WHERE id=?').run(sec.hashPassword(code), user.id);
    return ok(res, { code });
  }
  // Volver a la cuenta del administrador después de "Entrar como"
  if (p === '/api/impersonate/stop' && m === 'POST') {
    if (!user.impersonator_id) return fail(res, 400, 'No estás usando otra cuenta');
    sec.destroySession(token);
    setSessionCookie(res, sec.createSession(user.impersonator_id));
    return ok(res);
  }

  if (p === '/api/stream' && m === 'GET') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    res.write('retry: 3000\n\n');
    const c = { res, user };
    clients.add(c);
    req.on('close', () => clients.delete(c));
    return;
  }

  // ----- pedidos -----
  if (p === '/api/orders' && m === 'GET') {
    sync.assignBlockNumbers();
    const view = url.searchParams.get('view') || 'pending';
    const where = [], args = [];
    if (view === 'pending') where.push("state NOT IN ('printed','cancelled','shipped')");
    if (view === 'printed') where.push("state = 'printed' AND printed_at >= datetime('now','-1 day')");
    // lo que ya fue entregado y escaneado por el marketplace (en tránsito / entregado) sale de la app
    if (view === 'all') where.push("state <> 'shipped'");
    if (view === 'all') where.push("(created_at >= datetime('now','-7 day') OR state NOT IN ('printed','cancelled','shipped') OR printed_at >= datetime('now','-8 day') OR (block_no IS NOT NULL AND printed_at >= datetime('now','-30 day')))");
    const rows = db.prepare(`SELECT * FROM orders ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 1000`).all(...args);
    const sellers = db.prepare('SELECT id, name FROM sellers ORDER BY name').all();
    return ok(res, { orders: rows.map(o => orderView(o, user)), sellers });
  }

  const lab = p.match(/^\/api\/orders\/(\d+)\/label\.pdf$/);
  if (lab && m === 'GET') {
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(Number(lab[1]));
    if (!o) return fail(res, 404, 'Pedido no encontrado'); // cualquier usuario puede imprimir cualquier etiqueta; queda registrado quién la imprimió
    if (o.state === 'ready' && sync.isBlocked(o)) return fail(res, 403, 'Etiqueta bloqueada: primero desbloquéala');
    if (!['ready', 'printed', 'shipped'].includes(o.state)) return fail(res, 409, 'La etiqueta aún no está lista');
    if (!o.label_file || !fs.existsSync(sync.labelPath(o.id))) {
      // Descargarla la marca como impresa en Mercado Libre: solo se descarga al imprimir
      if (user.role === 'seller' && url.searchParams.get('mark') !== '1') return fail(res, 409, 'Esta etiqueta todavía no se imprime');
      try { await sync.fetchLabelFile(o.id); } catch (e) { return fail(res, 409, 'No se pudo obtener la etiqueta: ' + e.message); }
    }
    if (url.searchParams.get('mark') === '1' && o.state === 'ready') {
      db.prepare("UPDATE orders SET state='printed', printed_at=datetime('now'), printed_by=? WHERE id=?").run(printedByLabel(user), o.id);
      sync.bus.emit('change', { type: 'printed', orderId: o.id, sellerId: o.seller_id });
    }
    return send(res, 200, fs.readFileSync(sync.labelPath(o.id)), { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="etiqueta-${o.marketplace}-${o.order_number}.pdf"` });
  }

  if (p === '/api/labels/batch' && m === 'POST') {
    const { ids = [], mark = true } = await readBody(req);
    const rows = ids.map(Number).filter(Boolean).map(id => db.prepare('SELECT * FROM orders WHERE id=?').get(id)).filter(Boolean)
      ; // todos pueden imprimir etiquetas de cualquier vendedor
    const allowed = [];
    for (const o of rows.filter(o => !sync.isBlocked(o) && ['ready', 'printed'].includes(o.state))) {
      try { await sync.fetchLabelFile(o.id); allowed.push(o); } catch (e) { console.warn('[imprimir]', o.order_number, e.message); }
    }
    if (!allowed.length) return fail(res, 409, 'Ninguna de las etiquetas seleccionadas está disponible');
    const sellerName = id => db.prepare('SELECT name FROM sellers WHERE id=?').get(id)?.name || '';
    allowed.sort((a, b) => sellerName(a.seller_id).localeCompare(sellerName(b.seller_id)) || a.marketplace.localeCompare(b.marketplace) || a.id - b.id);
    const pdf = await mergePdfs(allowed.map(o => fs.readFileSync(sync.labelPath(o.id))));
    if (mark) {
      const st = db.prepare("UPDATE orders SET state='printed', printed_at=datetime('now'), printed_by=? WHERE id=?");
      const who = printedByLabel(user);
      for (const o of allowed.filter(o => o.state === 'ready')) st.run(who, o.id);
      sync.bus.emit('change', { type: 'printed', sellerId: null });
    }
    const stamp = new Intl.DateTimeFormat('sv-SE', { timeZone: cfg.timezone, dateStyle: 'short', timeStyle: 'short' }).format(new Date()).replace(/[-: ]/g, '').replace(/^(\d{8})/, '$1-');
    return send(res, 200, pdf, { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="etiquetas-${stamp}.pdf"`, 'x-label-count': String(allowed.length), 'x-skipped': String(rows.length - allowed.length) });
  }

  // Desbloquear / volver a bloquear una etiqueta puntual (admin, fulfillment o el vendedor dueño)
  const ub = p.match(/^\/api\/orders\/(\d+)\/(unblock|reblock)$/);
  if (ub && m === 'POST') {
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(Number(ub[1]));
    if (!o || (user.role === 'seller' && o.seller_id !== user.seller_id)) return fail(res, 404, 'Pedido no encontrado');
    if (ub[2] === 'unblock') {
      if (!o.block_no) sync.assignBlockNumbers();
      db.prepare("UPDATE orders SET unblocked_at=datetime('now'), unblocked_by=? WHERE id=?").run(printedByLabel(user), o.id);
      sync.logEvent(o.seller_id, 'unblock', `${printedByLabel(user)} desbloqueó el pedido ${o.order_number}`);
    } else {
      if (!['ready', 'waiting', 'error'].includes(o.state)) return fail(res, 409, 'Esta etiqueta ya se imprimió');
      db.prepare('UPDATE orders SET unblocked_at=NULL, unblocked_by=NULL WHERE id=?').run(o.id);
    }
    sync.bus.emit('change', { type: 'order', orderId: o.id, sellerId: o.seller_id });
    return ok(res);
  }

  const ret = p.match(/^\/api\/orders\/(\d+)\/(retry|unprint)$/);
  if (ret && m === 'POST') {
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(Number(ret[1]));
    if (!o || (user.role === 'seller' && ret[2] === 'unprint' && o.seller_id !== user.seller_id)) return fail(res, 404, 'Pedido no encontrado');
    if (ret[2] === 'unprint') {
      db.prepare("UPDATE orders SET state='ready', printed_at=NULL, printed_by=NULL WHERE id=?").run(o.id);
      sync.bus.emit('change', { type: 'order', orderId: o.id, sellerId: o.seller_id });
      return ok(res);
    }
    db.prepare("UPDATE orders SET state='waiting' WHERE id=? AND state='error'").run(o.id);
    const c = db.prepare('SELECT * FROM connections WHERE id=?').get(o.connection_id);
    if (c) await sync.tryLabel(sync.connObj(c), o.id);
    return ok(res, { order: orderView(db.prepare('SELECT * FROM orders WHERE id=?').get(o.id), user) });
  }

  if (p === '/api/sync' && m === 'POST') {
    if (user.role === 'seller') {
      for (const c of db.prepare('SELECT id FROM connections WHERE seller_id=?').all(user.seller_id)) sync.syncConnection(c.id);
    } else sync.syncAll();
    return ok(res, { ok: true, message: 'Sincronizando' });
  }

  // ----- conexiones y bloqueos (vendedor, o admin con ?seller_id=) -----
  if (p.startsWith('/api/connections') || p.startsWith('/api/blocklist')) {
    const sellerId = targetSeller(user, url);
    if (!sellerId) return fail(res, 403, 'Solo vendedores o administrador');

    if (p === '/api/connections' && m === 'GET') {
      return ok(res, { connections: db.prepare('SELECT * FROM connections WHERE seller_id=?').all(sellerId).map(connView) });
    }
    if (p === '/api/connections/fa' && m === 'POST') {
      const b = await readBody(req);
      const creds = { userId: String(b.userId || '').trim(), apiKey: String(b.apiKey || '').trim(), sellerId: String(b.sellerId || '').trim() };
      if (!creds.userId || !creds.apiKey) return fail(res, 400, 'Falta el usuario o la API Key de Falabella');
      try { await fa.test(creds); } catch (e) { return fail(res, 400, 'Falabella rechazó las credenciales: ' + e.message); }
      const id = upsertConnection(sellerId, 'fa', creds, { label: creds.userId, settings: { autoReady: Boolean(b.autoReady) } });
      sync.syncConnection(id);
      return ok(res, { id });
    }
    if (p === '/api/connections/pa' && m === 'POST') {
      const b = await readBody(req);
      const creds = { apiKey: String(b.apiKey || '').trim() };
      if (!creds.apiKey) return fail(res, 400, 'Falta la API Key de Paris');
      const probe = { creds, saveCreds(c) { probe.creds = c; } };
      try { await pa.test(probe); } catch (e) { return fail(res, 400, 'Paris rechazó la API Key: ' + e.message); }
      const id = upsertConnection(sellerId, 'pa', probe.creds, { label: b.label || probe.creds.parisSellerId || 'Paris' });
      sync.syncConnection(id);
      return ok(res, { id });
    }
    const cs = p.match(/^\/api\/connections\/(\d+)(\/settings)?$/);
    if (cs) {
      const c = db.prepare('SELECT * FROM connections WHERE id=? AND seller_id=?').get(Number(cs[1]), sellerId);
      if (!c) return fail(res, 404, 'Conexión no encontrada');
      if (m === 'DELETE' && !cs[2]) { db.prepare('DELETE FROM connections WHERE id=?').run(c.id); return ok(res); }
      if (m === 'PATCH' && cs[2]) {
        const b = await readBody(req);
        const s = { ...JSON.parse(c.settings || '{}') };
        if ('autoReady' in b) s.autoReady = Boolean(b.autoReady);
        db.prepare('UPDATE connections SET settings=? WHERE id=?').run(JSON.stringify(s), c.id);
        if (s.autoReady) sync.syncConnection(c.id);
        return ok(res);
      }
    }
    if (p === '/api/blocklist' && m === 'GET') {
      return ok(res, { items: db.prepare('SELECT id, marketplace, value, note, created_at FROM blocklist WHERE seller_id=? ORDER BY created_at DESC').all(sellerId) });
    }
    if (p === '/api/blocklist' && m === 'POST') {
      const b = await readBody(req);
      const values = String(b.value || '').split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
      const mk = ['any', 'ml', 'fa', 'pa'].includes(b.marketplace) ? b.marketplace : 'any';
      if (!values.length) return fail(res, 400, 'Escribe un ID de publicación o SKU');
      const st = db.prepare('INSERT OR IGNORE INTO blocklist (seller_id, marketplace, value, note) VALUES (?,?,?,?)');
      for (const v of values.slice(0, 500)) st.run(sellerId, mk, v, b.note || null);
      sync.bus.emit('change', { type: 'blocklist', sellerId });
      return ok(res, { added: values.length });
    }
    const bl = p.match(/^\/api\/blocklist\/(\d+)$/);
    if (bl && m === 'DELETE') {
      db.prepare('DELETE FROM blocklist WHERE id=? AND seller_id=?').run(Number(bl[1]), sellerId);
      sync.bus.emit('change', { type: 'blocklist', sellerId });
      sync.retryUnblocked(sellerId);
      return ok(res);
    }
  }

  // ----- ventas: el vendedor ve lo suyo; el administrador, todas las cuentas. El fulfillment no ve montos -----
  if (p === '/api/sales' && m === 'GET') {
    if (user.role === 'fulfillment') return fail(res, 403, 'No permitido');
    if (url.searchParams.get('refresh') === '1') await sales.refresh(true).catch(() => {});
    else sales.refresh().catch(() => {});
    const sid = user.role === 'seller' ? user.seller_id : (Number(url.searchParams.get('seller_id')) || null);
    const sellersList = user.role === 'admin' ? db.prepare('SELECT id, name FROM sellers ORDER BY name').all() : [];
    return ok(res, { ...sales.summary(sid), sellers: sellersList, seller_id: sid });
  }

  // Planilla de productos vendidos (y su descarga en Excel)
  if ((p === '/api/sales/products' || p === '/api/sales/products.xlsx') && m === 'GET') {
    // el fulfillment ve cantidades, nunca precios ni montos
    const noMoney = user.role === 'fulfillment' || url.searchParams.get('nomoney') === '1';
    const isDay = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
    const to = isDay(url.searchParams.get('to')) ? url.searchParams.get('to') : sales.today();
    let from = isDay(url.searchParams.get('from')) ? url.searchParams.get('from') : to;
    if (from > to) from = to;
    // con precios, el vendedor solo ve lo suyo; la planilla de unidades (sin precios) la ven todos, por vendedor o en conjunto
    const sid = user.role === 'seller' && !noMoney ? user.seller_id : (Number(url.searchParams.get('seller_id')) || null);
    if (p.endsWith('.xlsx')) {
      const sname = sid ? db.prepare('SELECT name FROM sellers WHERE id=?').get(sid)?.name : null;
      const file = `productos-vendidos-${(sname || 'todas').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${from}-al-${to}.xlsx`;
      return send(res, 200, sales.productsXlsx(sid, from, to, sname, { noMoney }), { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': `attachment; filename="${file}"` });
    }
    const out = sales.products(sid, from, to, { excludeBlocked: noMoney });
    if (noMoney) for (const r of out.rows) { delete r.amount; for (const v of r.variants) delete v.amount; }
    return ok(res, out);
  }

  if (p === '/api/sellers/list' && m === 'GET') return ok(res, { sellers: db.prepare('SELECT id, name FROM sellers ORDER BY name').all() });

  // ----- vendedores (solo lectura) para fulfillment y administrador -----
  if (p === '/api/sellers/overview' && m === 'GET') {
    if (user.role === 'seller') return fail(res, 403, 'No permitido');
    const MKN = { ml: 'Mercado Libre', fa: 'Falabella', pa: 'Paris' };
    const sellersList = db.prepare('SELECT id, name FROM sellers ORDER BY name').all().map(s => ({
      id: s.id, name: s.name,
      connections: db.prepare('SELECT marketplace, account_label, last_sync_at, last_error FROM connections WHERE seller_id=?').all(s.id)
        .filter(c => MKN[c.marketplace]).map(c => ({ marketplace: c.marketplace, account_label: c.account_label, last_sync_at: c.last_sync_at, ok: !c.last_error })),
      blocked: db.prepare('SELECT COUNT(*) n FROM blocklist WHERE seller_id=?').get(s.id).n,
      pending: db.prepare("SELECT COUNT(*) n FROM orders WHERE seller_id=? AND state='ready'").get(s.id).n,
    }));
    return ok(res, { sellers: sellersList });
  }

  // ----- administración -----
  if (p.startsWith('/api/admin/')) {
    if (user.role !== 'admin') return fail(res, 403, 'Solo administrador');
    if (p === '/api/admin/sellers' && m === 'GET') {
      const sellers = db.prepare('SELECT id, name, created_at FROM sellers ORDER BY name').all().map(s => ({
        ...s,
        connections: db.prepare('SELECT id, marketplace, last_error, last_sync_at FROM connections WHERE seller_id=?').all(s.id),
        blocked: db.prepare('SELECT COUNT(*) n FROM blocklist WHERE seller_id=?').get(s.id).n,
      }));
      const users = db.prepare('SELECT id, email, name, role, seller_id, must_change, (backup_hash IS NOT NULL) AS has_backup FROM users ORDER BY role, name').all();
      return ok(res, { sellers, users });
    }
    const dbc = p.match(/^\/api\/admin\/debug\/conn\/(\d+)$/);
    if (dbc && m === 'GET') {
      const c = db.prepare('SELECT * FROM connections WHERE id=?').get(Number(dbc[1]));
      if (!c || !sync.connectors[c.marketplace].debugList) return fail(res, 404, 'Sin datos');
      try { return ok(res, await sync.connectors[c.marketplace].debugList(sync.connObj(c))); } catch (e) { return fail(res, 500, e.message); }
    }
    // consulta directa a la API de Mercado Libre (solo lectura, administrador) para diagnosticar
    const dbr = p.match(/^\/api\/admin\/debug\/mlget\/(\d+)$/);
    if (dbr && m === 'GET') {
      const c = db.prepare("SELECT * FROM connections WHERE id=? AND marketplace='ml'").get(Number(dbr[1]));
      const path = url.searchParams.get('path') || '';
      if (!c || !path.startsWith('/')) return fail(res, 404, 'Sin datos');
      const co = sync.connObj(c);
      if (url.searchParams.get('fresh') === '1') co.creds.expires_at = 0; // fuerza un token nuevo (toma los permisos actuales de la app)
      try { return ok(res, { data: await sync.connectors.ml.raw(co, path) }); } catch (e) { return fail(res, 500, e.message); }
    }
    const dbg = p.match(/^\/api\/admin\/debug\/order\/(\d+)$/);
    if (dbg && m === 'GET') {
      const o = db.prepare('SELECT * FROM orders WHERE id=?').get(Number(dbg[1]));
      const c = o && db.prepare('SELECT * FROM connections WHERE id=?').get(o.connection_id);
      if (!c || !sync.connectors[c.marketplace].debugOrder) return fail(res, 404, 'Sin datos');
      try { return ok(res, await sync.connectors[c.marketplace].debugOrder(sync.connObj(c), o)); } catch (e) { return fail(res, 500, e.message); }
    }
    if (p === '/api/admin/settings' && m === 'GET') {
      return ok(res, {
        ml_client_id: settings.mlClientId(), ml_secret_set: Boolean(settings.mlClientSecret()),
        backup: backup.status(), gh_token_set: Boolean(settings.get('gh_token')),
        mail_from: recovery.mailConfig().from, mail_from_name: recovery.mailConfig().fromName, mail_key_set: Boolean(recovery.mailConfig().apiKey),
        ml_redirect_uri: `${cfg.baseUrl}/auth/ml/callback`, ml_notifications_url: `${cfg.baseUrl}/webhooks/ml`, base_url: cfg.baseUrl,
      });
    }
    if (p === '/api/admin/settings' && m === 'POST') {
      const b = await readBody(req);
      if (b.ml_client_id !== undefined) settings.set('ml_client_id', String(b.ml_client_id).trim());
      if (b.ml_client_secret) settings.set('ml_client_secret', String(b.ml_client_secret).trim());
      if (b.mail_from !== undefined) settings.set('mail_from', String(b.mail_from).trim());
      if (b.mail_from_name !== undefined) settings.set('mail_from_name', String(b.mail_from_name).trim() || 'EtiquetaHub');
      if (b.mail_api_key) settings.set('mail_api_key', String(b.mail_api_key).trim());
      if (b.gh_token) {
        settings.set('gh_token', String(b.gh_token).trim());
        const r = await backup.pushNow();
        if (r.error) return fail(res, 400, 'No se pudo guardar el respaldo en GitHub: ' + r.error);
      }
      if (b.test_to) {
        try { await recovery.sendMail(String(b.test_to).trim(), 'Prueba de EtiquetaHub', '<p>El envío de correos de EtiquetaHub funciona.</p>', 'El envío de correos de EtiquetaHub funciona.'); }
        catch (e) { return fail(res, 400, 'No se pudo enviar el correo de prueba: ' + e.message); }
      }
      return ok(res);
    }
    if (p === '/api/admin/sellers' && m === 'POST') {
      const { name } = await readBody(req);
      if (!String(name || '').trim()) return fail(res, 400, 'Falta el nombre');
      return ok(res, { id: Number(db.prepare('INSERT INTO sellers (name) VALUES (?)').run(String(name).trim()).lastInsertRowid) });
    }
    const sd = p.match(/^\/api\/admin\/sellers\/(\d+)$/);
    if (sd && m === 'DELETE') { db.prepare('DELETE FROM sellers WHERE id=?').run(Number(sd[1])); return ok(res); }
    if (p === '/api/admin/users' && m === 'POST') {
      const b = await readBody(req);
      const role = ['admin', 'fulfillment', 'seller'].includes(b.role) ? b.role : null;
      if (!role || !b.email || !b.name || String(b.password || '').length < 8) return fail(res, 400, 'Completa nombre, correo, rol y una contraseña de al menos 8 caracteres');
      if (role === 'seller' && !b.seller_id) return fail(res, 400, 'Elige a qué vendedor pertenece');
      try {
        db.prepare('INSERT INTO users (email, name, role, seller_id, pass_hash) VALUES (?,?,?,?,?)').run(String(b.email).trim(), String(b.name).trim(), role, role === 'seller' ? Number(b.seller_id) : null, sec.hashPassword(String(b.password)));
      } catch { return fail(res, 400, 'Ese correo ya existe'); }
      return ok(res);
    }
    const ua = p.match(/^\/api\/admin\/users\/(\d+)\/(temp-password|send-code|impersonate|backup-code)$/);
    if (ua && m === 'POST') {
      const target = db.prepare('SELECT id, email, name, role FROM users WHERE id=?').get(Number(ua[1]));
      if (!target) return fail(res, 404, 'Usuario no encontrado');
      if (ua[2] === 'backup-code') {
        const code = sec.backupCode();
        db.prepare('UPDATE users SET backup_hash=? WHERE id=?').run(sec.hashPassword(code), target.id);
        sync.logEvent(null, 'admin', `${user.name} generó una clave de respaldo para ${target.email}`);
        return ok(res, { code });
      }
      if (ua[2] === 'temp-password') {
        const temp = sec.tempPassword();
        db.prepare('UPDATE users SET pass_hash=?, must_change=1 WHERE id=?').run(sec.hashPassword(temp), target.id);
        db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);
        sync.logEvent(null, 'admin', `${user.name} generó una clave temporal para ${target.email}`);
        return ok(res, { password: temp });
      }
      if (ua[2] === 'send-code') {
        if (!recovery.mailConfigured()) return fail(res, 503, 'Primero configura el envío de correos (sección Correos).');
        try { await recovery.requestCode(target.email); } catch (e) { return fail(res, 502, 'No se pudo enviar el correo: ' + e.message); }
        return ok(res, { message: `Código enviado a ${target.email}` });
      }
      if (ua[2] === 'impersonate') {
        if (target.id === user.id) return fail(res, 400, 'Ya estás en tu cuenta');
        sync.logEvent(null, 'admin', `${user.name} entró como ${target.email}`);
        setSessionCookie(res, sec.createSession(target.id, user.impersonator_id || user.id));
        return ok(res);
      }
    }
    if (p === '/api/admin/ml-link' && m === 'POST') {
      const sid = Number(url.searchParams.get('seller_id'));
      if (!sid || !db.prepare('SELECT id FROM sellers WHERE id=?').get(sid)) return fail(res, 400, 'Elige un vendedor');
      const exp = Date.now() + 48 * 3600e3;
      return ok(res, { url: `${cfg.baseUrl}/auth/ml/link?s=${sid}&e=${exp}&g=${sec.sign(`mllink:${sid}:${exp}`)}` });
    }
    // cambiar el rol de un usuario (p. ej. dar permisos de administrador a la cuenta de un vendedor)
    const ur = p.match(/^\/api\/admin\/users\/(\d+)\/role$/);
    if (ur && m === 'POST') {
      const b = await readBody(req);
      const role = ['admin', 'fulfillment', 'seller'].includes(b.role) ? b.role : null;
      const target = db.prepare('SELECT id, email, role, seller_id FROM users WHERE id=?').get(Number(ur[1]));
      if (!target || !role) return fail(res, 400, 'Usuario o rol inválido');
      if (target.id === user.id && role !== 'admin') return fail(res, 400, 'No puedes quitarte el rol de administrador');
      if (role === 'seller' && !target.seller_id) return fail(res, 400, 'Ese usuario no tiene vendedor asignado');
      db.prepare('UPDATE users SET role=? WHERE id=?').run(role, target.id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);
      sync.logEvent(null, 'admin', `${user.name} cambió el rol de ${target.email} a ${role}`);
      return ok(res);
    }
    const ud = p.match(/^\/api\/admin\/users\/(\d+)(\/password)?$/);
    if (ud && m === 'DELETE' && !ud[2]) {
      if (Number(ud[1]) === user.id) return fail(res, 400, 'No puedes borrarte a ti mismo');
      db.prepare('DELETE FROM users WHERE id=?').run(Number(ud[1])); return ok(res);
    }
    if (ud && m === 'POST' && ud[2]) {
      const { password } = await readBody(req);
      if (String(password || '').length < 8) return fail(res, 400, 'La contraseña debe tener al menos 8 caracteres');
      db.prepare('UPDATE users SET pass_hash=? WHERE id=?').run(sec.hashPassword(String(password)), Number(ud[1]));
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(Number(ud[1]));
      return ok(res);
    }
  }

  return fail(res, 404, 'No encontrado');
}

// ---------- datos iniciales ----------
function bootstrap() {
  // Reinicio del administrador (una sola vez por cada valor distinto de RESET_ADMIN)
  const resetTag = process.env.RESET_ADMIN || '';
  if (resetTag && settings.get('reset_admin_applied') !== resetTag) {
    db.exec('DELETE FROM sessions; DELETE FROM users;');
    settings.set('reset_admin_applied', resetTag);
    console.log('Usuarios reiniciados: la app pedirá crear el administrador de nuevo.');
  }
  const count = db.prepare('SELECT COUNT(*) n FROM users').get().n;
  if (count > 0) return;
  if (cfg.demo) {
    const names = ['Tienda Norte', 'Moda Sur', 'Casa Andes', 'Kids Pacífico', 'Deportes Maipo'];
    const ids = names.map(n => Number(db.prepare('INSERT INTO sellers (name) VALUES (?)').run(n).lastInsertRowid));
    db.prepare('INSERT INTO users (email,name,role,pass_hash) VALUES (?,?,?,?)').run('admin@demo.cl', 'Administrador', 'admin', sec.hashPassword('demo1234'));
    db.prepare('INSERT INTO users (email,name,role,pass_hash) VALUES (?,?,?,?)').run('bodega@demo.cl', 'Bodega Fulfillment', 'fulfillment', sec.hashPassword('demo1234'));
    ids.forEach((id, i) => {
      db.prepare('INSERT INTO users (email,name,role,seller_id,pass_hash) VALUES (?,?,?,?,?)').run(`vendedor${i + 1}@demo.cl`, names[i], 'seller', id, sec.hashPassword('demo1234'));
      db.prepare('INSERT INTO connections (seller_id, marketplace, creds_enc, account_label) VALUES (?,?,?,?)').run(id, 'demo', sec.encrypt({}), 'Cuenta de prueba');
    });
    db.prepare("INSERT INTO blocklist (seller_id, marketplace, value) VALUES (?, 'any', 'LEN-POL-01')").run(ids[0]);
    db.prepare("INSERT INTO blocklist (seller_id, marketplace, value) VALUES (?, 'any', 'JOG-GR-XL')").run(ids[1]);
    console.log('Modo demo: usuarios admin@demo.cl, bodega@demo.cl, vendedor1@demo.cl … (clave demo1234)');
    return;
  }
  if (cfg.admin.email && cfg.admin.password) {
    db.prepare('INSERT INTO users (email,name,role,pass_hash) VALUES (?,?,?,?)').run(cfg.admin.email, cfg.admin.name, 'admin', sec.hashPassword(cfg.admin.password));
    console.log('Administrador creado:', cfg.admin.email);
  } else {
    console.log('Sin usuarios: el primer ingreso a la app pedirá crear el administrador.');
  }
}

bootstrap();
http.createServer((req, res) => {
  if (req.method !== 'GET' || req.url.startsWith('/auth/ml/callback')) res.on('finish', () => { if (res.statusCode < 400) backup.schedule(8000); });
  route(req, res).catch(e => {
    console.error(e);
    if (!res.headersSent) fail(res, e.status || 500, e.status ? e.message : 'Error interno');
  });
}).listen(cfg.port, () => {
  console.log(`EtiquetaHub en ${cfg.baseUrl} (puerto ${cfg.port})${cfg.demo ? ' — MODO DEMO' : ''}`);
  sync.start();
  sales.start();
  // Render gratis se duerme sin visitas: la app se visita sola cada 4 minutos
  if (process.env.RENDER_EXTERNAL_URL) setInterval(() => fetch(`${cfg.baseUrl}/health`).catch(() => {}), 4 * 60e3);
});

};

__defs["start"] = function (module, exports, require, __dirname) {
// Punto de entrada: recupera el respaldo (si la base de datos no existe) y arranca el servidor.
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const { decryptBuf } = require('./keys');

async function restore() {
  const dbFile = path.join(cfg.dataDir, 'etiquetahub.db');
  if (fs.existsSync(dbFile) || !cfg.backupUrl) return;
  try {
    // Preferimos la API de GitHub (sin caché); si falla, el enlace raw
    const slug = process.env.RENDER_GIT_REPO_SLUG;
    let res = slug ? await fetch(`https://api.github.com/repos/${slug}/contents/db.enc?ref=backup`, { headers: { accept: 'application/vnd.github.raw', 'user-agent': 'etiquetahub' }, signal: AbortSignal.timeout(20000) }).catch(() => null) : null;
    if (!res || !res.ok) res = await fetch(`${cfg.backupUrl}?t=${Date.now()}`, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) { console.log(`Sin respaldo previo (${res.status}); se parte con base nueva.`); return; }
    let plain = decryptBuf(Buffer.from(await res.arrayBuffer()));
    if (plain[0] === 0x1f && plain[1] === 0x8b) plain = require('zlib').gunzipSync(plain); // respaldo comprimido
    fs.writeFileSync(dbFile, plain);
    console.log(`Respaldo recuperado (${plain.length} bytes).`);
  } catch (e) {
    console.warn('No se pudo recuperar el respaldo:', e.message);
  }
}

restore().then(() => require('./server'));

};

global.__EH_PUBLIC = {"app.css":"OnJvb3R7CiAgLS1iZzojRUFGNUZDOyAtLWJnMjojRDhFREY5OyAtLXN1cmZhY2U6I0ZGRkZGRjsgLS1zdXJmYWNlMjojRjRGQUZFOwogIC0taW5rOiMwQzJCNDA7IC0tbXV0ZWQ6IzU1NzI4NzsgLS1saW5lOiNDOUUyRjI7CiAgLS1hY2NlbnQ6IzE2OTNEMzsgLS1hY2NlbnQtc3Ryb25nOiMwQTZGQTY7IC0tc2t5OiM3RkNERjI7IC0taWNlOiNCRkU2Rjg7CiAgLS1vazojMjM5NDZBOyAtLW9rLWJnOiNEREY0RUE7IC0tbG9jazojQzgzRTU1OyAtLWxvY2stYmc6I0ZCRTNFODsgLS13YXJuOiNCNzc5MEY7IC0td2Fybi1iZzojRkNGMEQ2OwogIC0tbWw6I0ZGRTYwMDsgLS1tbC1pbms6IzJEMzI3NzsgLS1mYTojQUFENTAwOyAtLWZhLWluazojMkYzQTAwOyAtLXBhOiMwMDc4Qzg7IC0tcGEtaW5rOiNGRkZGRkY7CiAgLS1zaGFkb3c6MCAxMHB4IDMwcHggLTE0cHggcmdiYSgxMiw3MCwxMTAsLjM1KTsKICAtLWRpc3BsYXk6IkJhbG9vIDIiLCJUcmVidWNoZXQgTVMiLHN5c3RlbS11aSxzYW5zLXNlcmlmOwogIC0tYm9keToiTnVuaXRvIFNhbnMiLHN5c3RlbS11aSwtYXBwbGUtc3lzdGVtLCJTZWdvZSBVSSIsc2Fucy1zZXJpZjsKICAtLW1vbm86IkpldEJyYWlucyBNb25vIix1aS1tb25vc3BhY2UsTWVubG8sQ29uc29sYXMsbW9ub3NwYWNlOwogIGNvbG9yLXNjaGVtZTpsaWdodDsKfQoqe2JveC1zaXppbmc6Ym9yZGVyLWJveH0KaHRtbCxib2R5e21hcmdpbjowfQpib2R5e2JhY2tncm91bmQ6dmFyKC0tYmcpO2NvbG9yOnZhcigtLWluayk7Zm9udC1mYW1pbHk6dmFyKC0tYm9keSk7Zm9udC1zaXplOjE1cHg7bGluZS1oZWlnaHQ6MS41O21pbi1oZWlnaHQ6MTAwdmh9Ci53cmFwe21heC13aWR0aDoxMjQwcHg7bWFyZ2luOjAgYXV0bztwYWRkaW5nLWlubGluZToyMHB4O3BhZGRpbmctYmxvY2s6MCA2MHB4fQpoMSxoMixoM3tmb250LWZhbWlseTp2YXIoLS1kaXNwbGF5KTtsaW5lLWhlaWdodDoxLjE7dGV4dC13cmFwOmJhbGFuY2U7bWFyZ2luOjB9CmJ1dHRvbntmb250OmluaGVyaXQ7Y3Vyc29yOnBvaW50ZXI7Y29sb3I6aW5oZXJpdH0KYXtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KYnV0dG9uOmZvY3VzLXZpc2libGUsaW5wdXQ6Zm9jdXMtdmlzaWJsZSxzZWxlY3Q6Zm9jdXMtdmlzaWJsZSx0ZXh0YXJlYTpmb2N1cy12aXNpYmxlLGE6Zm9jdXMtdmlzaWJsZXtvdXRsaW5lOjNweCBzb2xpZCB2YXIoLS1za3kpO291dGxpbmUtb2Zmc2V0OjJweH0KLm1vbm97Zm9udC1mYW1pbHk6dmFyKC0tbW9ubyk7Zm9udC1zaXplOi44NmVtfQoubXV0ZWR7Y29sb3I6dmFyKC0tbXV0ZWQpfQpbaGlkZGVuXXtkaXNwbGF5Om5vbmUhaW1wb3J0YW50fQoKLyogYmFycmEgc3VwZXJpb3IgKi8KLnRvcHtwb3NpdGlvbjpzdGlja3k7dG9wOjA7ei1pbmRleDoyMDtiYWNrZ3JvdW5kOmNvbG9yLW1peChpbiBzcmdiLHZhcigtLWJnKSA4OCUsdHJhbnNwYXJlbnQpO2JhY2tkcm9wLWZpbHRlcjpibHVyKDhweCk7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tbGluZSl9Ci50b3AgLndyYXB7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6MTRweDtmbGV4LXdyYXA6d3JhcDtwYWRkaW5nLWJsb2NrOjEwcHh9Ci5icmFuZHtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDoxMHB4O2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MjJweDtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKTt0ZXh0LWRlY29yYXRpb246bm9uZX0KLmJyYW5kIGltZ3t3aWR0aDozMnB4O2hlaWdodDozMnB4fQoubmF2e2Rpc3BsYXk6ZmxleDtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czo5OTlweDtwYWRkaW5nOjRweDtnYXA6NHB4fQoubmF2IGJ1dHRvbntib3JkZXI6MDtiYWNrZ3JvdW5kOnRyYW5zcGFyZW50O2NvbG9yOnZhcigtLW11dGVkKTtwYWRkaW5nOjdweCAxNXB4O2JvcmRlci1yYWRpdXM6OTk5cHg7Zm9udC13ZWlnaHQ6NzAwfQoubmF2IGJ1dHRvblthcmlhLWN1cnJlbnQ9InRydWUiXXtiYWNrZ3JvdW5kOnZhcigtLWFjY2VudCk7Y29sb3I6I2ZmZn0KLnNwYWNlcntmbGV4OjF9Ci5saXZle2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjZweDtmb250LXNpemU6MTIuNXB4O2ZvbnQtd2VpZ2h0OjcwMDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5saXZlIGl7d2lkdGg6OXB4O2hlaWdodDo5cHg7Ym9yZGVyLXJhZGl1czo1MCU7YmFja2dyb3VuZDp2YXIoLS1tdXRlZCl9Ci5saXZlLm9ue2NvbG9yOnZhcigtLW9rKX0gLmxpdmUub24gaXtiYWNrZ3JvdW5kOnZhcigtLW9rKTtib3gtc2hhZG93OjAgMCAwIDRweCBjb2xvci1taXgoaW4gc3JnYix2YXIoLS1vaykgMjUlLHRyYW5zcGFyZW50KX0KLmNsb2Nre2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjEwcHg7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTRweDtwYWRkaW5nOjVweCAxMnB4fQouY2xvY2sgYntmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6MTdweDtmb250LXZhcmlhbnQtbnVtZXJpYzp0YWJ1bGFyLW51bXN9Ci5jbG9jayBzbWFsbHtjb2xvcjp2YXIoLS1tdXRlZCk7ZGlzcGxheTpibG9jaztsaW5lLWhlaWdodDoxLjE7Zm9udC1zaXplOjEwLjVweDt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7bGV0dGVyLXNwYWNpbmc6LjA2ZW19Ci5jbG9jay5sYXRlIGJ7Y29sb3I6dmFyKC0tbG9jayl9Ci51c2Vye2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjhweDtmb250LXNpemU6MTMuNXB4fQoudXNlciBie2Rpc3BsYXk6YmxvY2s7bGluZS1oZWlnaHQ6MS4xfQoudXNlciBzbWFsbHtjb2xvcjp2YXIoLS1tdXRlZCl9CgovKiBlbGVtZW50b3MgKi8KLmJ0bnt0ZXh0LWRlY29yYXRpb246bm9uZTtib3JkZXI6MDtib3JkZXItcmFkaXVzOjEzcHg7cGFkZGluZzo5cHggMTVweDtmb250LXdlaWdodDo3MDA7ZGlzcGxheTppbmxpbmUtZmxleDtnYXA6OHB4O2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyO3doaXRlLXNwYWNlOm5vd3JhcH0KLmJ0biBzdmd7d2lkdGg6MThweDtoZWlnaHQ6MThweDtmbGV4Om5vbmV9Ci5idG4tcHJpbWFyeXtiYWNrZ3JvdW5kOnZhcigtLWFjY2VudCk7Y29sb3I6I2ZmZn0KLmJ0bi1wcmltYXJ5OmhvdmVye2JhY2tncm91bmQ6dmFyKC0tYWNjZW50LXN0cm9uZyl9Ci5idG4tZ2hvc3R7YmFja2dyb3VuZDp2YXIoLS1pY2UpO2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQouYnRuLWxpbmV7YmFja2dyb3VuZDp0cmFuc3BhcmVudDtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2NvbG9yOnZhcigtLWluayl9Ci5idG4tZGFuZ2Vye2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayl9Ci5idG46ZGlzYWJsZWR7b3BhY2l0eTouNDU7Y3Vyc29yOm5vdC1hbGxvd2VkfQouYnRuLXNte3BhZGRpbmc6NnB4IDEwcHg7Zm9udC1zaXplOjEzcHg7Ym9yZGVyLXJhZGl1czoxMHB4fQpzZWxlY3QsaW5wdXRbdHlwZT10ZXh0XSxpbnB1dFt0eXBlPWVtYWlsXSxpbnB1dFt0eXBlPXBhc3N3b3JkXSxpbnB1dFt0eXBlPXNlYXJjaF0sdGV4dGFyZWF7Zm9udDppbmhlcml0O2NvbG9yOnZhcigtLWluayk7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlMik7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjEycHg7cGFkZGluZzo4cHggMTJweDttaW4td2lkdGg6MDt3aWR0aDoxMDAlfQp0ZXh0YXJlYXtyZXNpemU6dmVydGljYWw7bWluLWhlaWdodDo3MHB4fQpsYWJlbC5me2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjRweDtmb250LXNpemU6MTIuNXB4O2ZvbnQtd2VpZ2h0OjcwMDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5jaGlwc3tkaXNwbGF5OmZsZXg7Z2FwOjZweDtmbGV4LXdyYXA6d3JhcH0KLmNoaXB7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKTtjb2xvcjp2YXIoLS1pbmspO3BhZGRpbmc6NnB4IDEycHg7Ym9yZGVyLXJhZGl1czo5OTlweDtmb250LXdlaWdodDo2MDA7Zm9udC1zaXplOjEzcHh9Ci5jaGlwW2FyaWEtcHJlc3NlZD0idHJ1ZSJde2JhY2tncm91bmQ6dmFyKC0tYWNjZW50KTtib3JkZXItY29sb3I6dmFyKC0tYWNjZW50KTtjb2xvcjojZmZmfQouc3dpdGNoe2Rpc3BsYXk6aW5saW5lLWZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDoxMHB4O2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTRweDtjdXJzb3I6cG9pbnRlcjt1c2VyLXNlbGVjdDpub25lfQouc3dpdGNoIGlucHV0e2FwcGVhcmFuY2U6bm9uZTt3aWR0aDo0NHB4O2hlaWdodDoyNnB4O2JvcmRlci1yYWRpdXM6OTk5cHg7YmFja2dyb3VuZDp2YXIoLS1saW5lKTtwb3NpdGlvbjpyZWxhdGl2ZTt0cmFuc2l0aW9uOmJhY2tncm91bmQgLjJzO2N1cnNvcjpwb2ludGVyO21hcmdpbjowO2ZsZXg6bm9uZX0KLnN3aXRjaCBpbnB1dDo6YWZ0ZXJ7Y29udGVudDoiIjtwb3NpdGlvbjphYnNvbHV0ZTt0b3A6M3B4O2xlZnQ6M3B4O3dpZHRoOjIwcHg7aGVpZ2h0OjIwcHg7Ym9yZGVyLXJhZGl1czo1MCU7YmFja2dyb3VuZDojZmZmO3RyYW5zaXRpb246bGVmdCAuMnM7Ym94LXNoYWRvdzowIDFweCAzcHggcmdiYSgwLDAsMCwuMjUpfQouc3dpdGNoIGlucHV0OmNoZWNrZWR7YmFja2dyb3VuZDp2YXIoLS1vayl9Ci5zd2l0Y2ggaW5wdXQ6Y2hlY2tlZDo6YWZ0ZXJ7bGVmdDoyMXB4fQoKLnBhbmVse2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjIycHg7Ym94LXNoYWRvdzp2YXIoLS1zaGFkb3cpfQoucGFuZWwtaGVhZHtkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7Z2FwOjEycHg7YWxpZ24taXRlbXM6Y2VudGVyO3BhZGRpbmc6MTZweCAyMHB4O2JvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLWxpbmUpfQoucGFuZWwtaGVhZCBoMntmb250LXNpemU6MjNweDttYXJnaW4tcmlnaHQ6YXV0b30KLnBhbmVsLWJvZHl7cGFkZGluZzoxNnB4IDIwcHh9Ci5wYW5lbC1mb290e2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6MTBweDthbGlnbi1pdGVtczpjZW50ZXI7cGFkZGluZzoxNHB4IDIwcHg7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tbGluZSk7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtc2l6ZToxMy41cHh9CgoubWt7ZGlzcGxheTppbmxpbmUtZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Zm9udC13ZWlnaHQ6NzAwO2ZvbnQtc2l6ZToxMnB4O3BhZGRpbmc6M3B4IDlweDtib3JkZXItcmFkaXVzOjhweDt3aGl0ZS1zcGFjZTpub3dyYXB9Ci5tay5tbHtiYWNrZ3JvdW5kOnZhcigtLW1sKTtjb2xvcjp2YXIoLS1tbC1pbmspfSAubWsuZmF7YmFja2dyb3VuZDp2YXIoLS1mYSk7Y29sb3I6dmFyKC0tZmEtaW5rKX0gLm1rLnBhe2JhY2tncm91bmQ6dmFyKC0tcGEpO2NvbG9yOnZhcigtLXBhLWluayl9Ci5waWxse2Rpc3BsYXk6aW5saW5lLWZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo2cHg7Ym9yZGVyLXJhZGl1czo5OTlweDtwYWRkaW5nOjRweCAxMHB4O2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTIuNXB4O3doaXRlLXNwYWNlOm5vd3JhcH0KLnBpbGwgc3Zne3dpZHRoOjE0cHg7aGVpZ2h0OjE0cHh9Ci5waWxsLnJlYWR5e2JhY2tncm91bmQ6dmFyKC0tb2stYmcpO2NvbG9yOnZhcigtLW9rKX0KLnBpbGwuYmxvY2tlZHtiYWNrZ3JvdW5kOiNFM0U3RUM7Y29sb3I6IzRBNTU2M30KLnBpbGwucHJpbnRlZHtiYWNrZ3JvdW5kOnZhcigtLWxvY2stYmcpO2NvbG9yOnZhcigtLWxvY2spfQoucGlsbC53YWl0aW5ne2JhY2tncm91bmQ6dmFyKC0td2Fybi1iZyk7Y29sb3I6dmFyKC0td2Fybil9Ci5waWxsLmVycm9ye2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayl9Ci5waWxsLmNhbmNlbGxlZHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKTtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5ub3Rle2Rpc3BsYXk6YmxvY2s7Zm9udC1zaXplOjEycHg7Y29sb3I6dmFyKC0tbXV0ZWQpO21hcmdpbi10b3A6NHB4O21heC13aWR0aDozNGNofQoubm90ZS5iYWR7Y29sb3I6dmFyKC0tbG9jayl9CgovKiBow6lyb2UgKi8KLmhlcm97ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczoxLjFmciAuOWZyO2dhcDoyNHB4O2FsaWduLWl0ZW1zOmNlbnRlcjtwYWRkaW5nLWJsb2NrOjI0cHggNnB4fQouaGVybyBoMXtmb250LXNpemU6Y2xhbXAoMjhweCwzLjZ2dyw0MHB4KTtmb250LXdlaWdodDo4MDB9Ci5oZXJvIGgxIGVte2ZvbnQtc3R5bGU6bm9ybWFsO2NvbG9yOnZhcigtLWFjY2VudCl9Ci5oZXJvIHB7Y29sb3I6dmFyKC0tbXV0ZWQpO21heC13aWR0aDo1NmNoO21hcmdpbjoxMHB4IDAgMH0KLmhlcm8gc3Zne3dpZHRoOjEwMCU7aGVpZ2h0OmF1dG87bWF4LWhlaWdodDoyMTBweH0KCi8qIGtwaXMgKi8KLmtwaXN7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoNCwxZnIpO2dhcDoxNHB4O21hcmdpbi1ibG9jazoxOHB4fQoua3Bpe2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjE4cHg7cGFkZGluZzoxNHB4IDE2cHg7ZGlzcGxheTpmbGV4O2dhcDoxMnB4O2FsaWduLWl0ZW1zOmNlbnRlcn0KLmtwaSAuaWN7d2lkdGg6NDJweDtoZWlnaHQ6NDJweDtib3JkZXItcmFkaXVzOjEycHg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtmbGV4Om5vbmV9Ci5rcGkgLmljIHN2Z3t3aWR0aDoyMnB4O2hlaWdodDoyMnB4fQoua3BpLm9rIC5pY3tiYWNrZ3JvdW5kOnZhcigtLW9rLWJnKTtjb2xvcjp2YXIoLS1vayl9Ci5rcGkud2FpdCAuaWN7YmFja2dyb3VuZDp2YXIoLS13YXJuLWJnKTtjb2xvcjp2YXIoLS13YXJuKX0KLmtwaS5sb2NrIC5pY3tiYWNrZ3JvdW5kOnZhcigtLWxvY2stYmcpO2NvbG9yOnZhcigtLWxvY2spfQoua3BpLmRvbmUgLmlje2JhY2tncm91bmQ6dmFyKC0taWNlKTtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KLmtwaSBie2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtc2l6ZToyOHB4O2xpbmUtaGVpZ2h0OjE7ZGlzcGxheTpibG9jaztmb250LXZhcmlhbnQtbnVtZXJpYzp0YWJ1bGFyLW51bXN9Ci5rcGkgc3Bhbntjb2xvcjp2YXIoLS1tdXRlZCk7Zm9udC1zaXplOjEzcHh9CgouYXV0b2JhcntkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7Z2FwOjE0cHg7YWxpZ24taXRlbXM6Y2VudGVyO2p1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuO2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDEyMGRlZyx2YXIoLS1iZzIpLHZhcigtLXN1cmZhY2UpKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MThweDtwYWRkaW5nOjE0cHggMThweDttYXJnaW4tYm90dG9tOjE2cHh9Ci5hdXRvYmFyIHB7bWFyZ2luOjJweCAwIDA7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtc2l6ZToxM3B4O21heC13aWR0aDo3MGNofQoKLmZpbHRlcnN7ZGlzcGxheTpmbGV4O2ZsZXgtd3JhcDp3cmFwO2dhcDoxMHB4O2FsaWduLWl0ZW1zOmNlbnRlcn0KLmZpbHRlcnMgc2VsZWN0LC5maWx0ZXJzIGlucHV0e3dpZHRoOmF1dG99Ci50YWJsZS13cmFwe292ZXJmbG93LXg6YXV0b30KdGFibGV7d2lkdGg6MTAwJTtib3JkZXItY29sbGFwc2U6Y29sbGFwc2U7bWluLXdpZHRoOjgyMHB4fQp0aHtmb250LXNpemU6MTEuNXB4O3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtsZXR0ZXItc3BhY2luZzouMDdlbTtjb2xvcjp2YXIoLS1tdXRlZCk7dGV4dC1hbGlnbjpsZWZ0O3BhZGRpbmc6MTBweCAxNHB4O2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZTIpO3doaXRlLXNwYWNlOm5vd3JhcH0KdGR7cGFkZGluZzoxMXB4IDE0cHg7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tbGluZSk7dmVydGljYWwtYWxpZ246bWlkZGxlfQp0ci5pcy1ibG9ja2VkIHRke2JhY2tncm91bmQ6Y29sb3ItbWl4KGluIHNyZ2IsdmFyKC0tbG9jay1iZykgNDUlLHRyYW5zcGFyZW50KX0KdHIuaXMtbmV3IHRke2FuaW1hdGlvbjpmbGFzaCAyLjVzIGVhc2Utb3V0fQpAa2V5ZnJhbWVzIGZsYXNoe2Zyb217YmFja2dyb3VuZDpjb2xvci1taXgoaW4gc3JnYix2YXIoLS1za3kpIDQ1JSx0cmFuc3BhcmVudCl9dG97YmFja2dyb3VuZDp0cmFuc3BhcmVudH19Ci5pdGVtc3tkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDoycHg7Zm9udC1zaXplOjEzLjVweH0KLml0ZW1zIC52e2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTIuNXB4fQouaXRlbXMgLmJhZHtjb2xvcjp2YXIoLS1sb2NrKTtmb250LXdlaWdodDo3MDB9Ci5jYnt3aWR0aDoxOXB4O2hlaWdodDoxOXB4O2FjY2VudC1jb2xvcjp2YXIoLS1hY2NlbnQpfQoubG9ja2NlbGx7Y29sb3I6dmFyKC0tbG9jayk7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcn0KLmxvY2tjZWxsIHN2Z3t3aWR0aDoxOHB4O2hlaWdodDoxOHB4fQoucm93LWFjdGlvbnN7ZGlzcGxheTpmbGV4O2dhcDo2cHg7ZmxleC13cmFwOndyYXB9Ci5lbXB0eXtwYWRkaW5nOjQwcHggMjBweDt0ZXh0LWFsaWduOmNlbnRlcjtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5lbXB0eSBzdmd7d2lkdGg6MTIwcHg7aGVpZ2h0OmF1dG87bWFyZ2luLWJvdHRvbToxMHB4fQoKLyogdmVuZGVkb3IgKi8KLnNlY3Rpb24tdGl0bGV7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6MTJweDtmbGV4LXdyYXA6d3JhcDttYXJnaW4tYmxvY2s6MjRweCAxMnB4fQouc2VjdGlvbi10aXRsZSBoMntmb250LXNpemU6MjZweH0KLmNvbm57ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoMywxZnIpO2dhcDoxNHB4fQoubWNhcmR7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MjBweDtwYWRkaW5nOjE2cHg7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MTBweH0KLm1jYXJkIC5sb2dve2hlaWdodDo0NHB4O2JvcmRlci1yYWRpdXM6MTJweDtkaXNwbGF5OmdyaWQ7cGxhY2UtaXRlbXM6Y2VudGVyO2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MThweH0KLm1jYXJkIC5ob3d7Zm9udC1zaXplOjEyLjVweDtjb2xvcjp2YXIoLS1tdXRlZCk7bWFyZ2luOjB9Ci5zdGF0ZXtmb250LXNpemU6MTNweDtmb250LXdlaWdodDo3MDA7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4fQouc3RhdGUub257Y29sb3I6dmFyKC0tb2spfSAuc3RhdGUub2Zme2NvbG9yOnZhcigtLW11dGVkKX0gLnN0YXRlLmVycntjb2xvcjp2YXIoLS1sb2NrKX0KLnN0YXRlIGl7d2lkdGg6OHB4O2hlaWdodDo4cHg7Ym9yZGVyLXJhZGl1czo1MCU7YmFja2dyb3VuZDpjdXJyZW50Q29sb3I7ZGlzcGxheTppbmxpbmUtYmxvY2t9Ci5jb3B5e2Rpc3BsYXk6ZmxleDtnYXA6NnB4fQouY29weSBpbnB1dHtmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6MTEuNXB4fQouZ3JpZDJ7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczoxZnIgMWZyO2dhcDoyMHB4O21hcmdpbi10b3A6MjBweH0KLnJ1bGV7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczphdXRvIDFmcjtnYXA6MTRweDthbGlnbi1pdGVtczpjZW50ZXI7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlMik7Ym9yZGVyOjFweCBkYXNoZWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czoxNnB4O3BhZGRpbmc6MTJweCAxNHB4fQoucnVsZSBzdmd7d2lkdGg6MTEwcHg7aGVpZ2h0OmF1dG99Ci5ydWxlIHB7bWFyZ2luOjA7Zm9udC1zaXplOjEzLjVweDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5ydWxlIGJ7Y29sb3I6dmFyKC0taW5rKX0KLmFkZHJvd3tkaXNwbGF5OmdyaWQ7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmciAxNTBweCBhdXRvO2dhcDo4cHg7YWxpZ24taXRlbXM6c3RhcnR9Ci50YWdze2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6OHB4O21heC1oZWlnaHQ6MjYwcHg7b3ZlcmZsb3c6YXV0b30KLnRhZ3tkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4O2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayk7Ym9yZGVyLXJhZGl1czoxMHB4O3BhZGRpbmc6NHB4IDRweCA0cHggMTBweDtmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6MTIuNXB4O2ZvbnQtd2VpZ2h0OjcwMH0KLnRhZyBzbWFsbHtmb250LWZhbWlseTp2YXIoLS1ib2R5KTtmb250LXdlaWdodDo2MDA7b3BhY2l0eTouOH0KLnRhZyBidXR0b257Ym9yZGVyOjA7YmFja2dyb3VuZDp0cmFuc3BhcmVudDtjb2xvcjppbmhlcml0O3dpZHRoOjI0cHg7aGVpZ2h0OjI0cHg7Ym9yZGVyLXJhZGl1czo2cHg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcn0KLnRhZyBidXR0b246aG92ZXJ7YmFja2dyb3VuZDpjb2xvci1taXgoaW4gc3JnYix2YXIoLS1sb2NrKSAxOCUsdHJhbnNwYXJlbnQpfQouc3RhY2t7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MTJweH0KLnJvd3tkaXNwbGF5OmZsZXg7Z2FwOjEwcHg7ZmxleC13cmFwOndyYXA7YWxpZ24taXRlbXM6ZW5kfQoucm93ID4gKntmbGV4OjE7bWluLXdpZHRoOjE1MHB4fQoKLyogbG9naW4gKi8KLmxvZ2lue21pbi1oZWlnaHQ6MTAwdmg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtwYWRkaW5nOjIwcHh9Ci5sb2dpbiAuY2FyZHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czoyNnB4O2JveC1zaGFkb3c6dmFyKC0tc2hhZG93KTt3aWR0aDoxMDAlO21heC13aWR0aDo0MjBweDtvdmVyZmxvdzpoaWRkZW59Ci5sb2dpbiAuYXJ0e2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDEzNWRlZyx2YXIoLS1iZzIpLHZhcigtLWljZSkpO3BhZGRpbmc6MjJweCAyNHB4IDhweH0KLmxvZ2luIC5hcnQgc3Zne3dpZHRoOjEwMCU7aGVpZ2h0OmF1dG99Ci5sb2dpbiBmb3Jte3BhZGRpbmc6MjJweCAyNHB4IDI2cHg7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MTJweH0KLmxvZ2luIGgxe2ZvbnQtc2l6ZTozMHB4O2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQouZXJye2NvbG9yOnZhcigtLWxvY2spO2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTMuNXB4O21pbi1oZWlnaHQ6MS4yZW19Ci5kZW1vLWhpbnR7Zm9udC1zaXplOjEyLjVweDtiYWNrZ3JvdW5kOnZhcigtLXdhcm4tYmcpO2NvbG9yOnZhcigtLXdhcm4pO3BhZGRpbmc6OHB4IDEycHg7Ym9yZGVyLXJhZGl1czoxMnB4fQoKLnRvYXN0e3Bvc2l0aW9uOmZpeGVkO2xlZnQ6NTAlO2JvdHRvbToyMnB4O3RyYW5zZm9ybTp0cmFuc2xhdGVYKC01MCUpO2JhY2tncm91bmQ6dmFyKC0taW5rKTtjb2xvcjp2YXIoLS1iZyk7cGFkZGluZzoxMHB4IDE4cHg7Ym9yZGVyLXJhZGl1czoxMnB4O2ZvbnQtd2VpZ2h0OjcwMDt6LWluZGV4OjYwO21heC13aWR0aDpjYWxjKDEwMCUgLSAzMnB4KX0KLm1vZGFse3Bvc2l0aW9uOmZpeGVkO2luc2V0OjA7ei1pbmRleDo1MDtiYWNrZ3JvdW5kOnJnYmEoNiwzMCw0OCwuNTUpO2Rpc3BsYXk6Z3JpZDtwbGFjZS1pdGVtczpjZW50ZXI7cGFkZGluZzoxNnB4fQouc2hlZXR7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXItcmFkaXVzOjIycHg7bWF4LXdpZHRoOjUyMHB4O3dpZHRoOjEwMCU7cGFkZGluZzoyMHB4O2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjEycHh9CgpAbWVkaWEgKG1heC13aWR0aDo5ODBweCl7CiAgLmhlcm8sLmdyaWQye2dyaWQtdGVtcGxhdGUtY29sdW1uczoxZnJ9CiAgLmhlcm8gc3Zne2Rpc3BsYXk6bm9uZX0KICAua3Bpc3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDIsMWZyKX0KICAuY29ubntncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyfQp9CkBtZWRpYSAobWF4LXdpZHRoOjUyMHB4KXsKICAud3JhcHtwYWRkaW5nLWlubGluZToxNnB4fQogIC5hZGRyb3d7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmcn0KICAucnVsZXtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyfQogIC51c2VyIHNtYWxse2Rpc3BsYXk6bm9uZX0KfQpAbWVkaWEgKHByZWZlcnMtcmVkdWNlZC1tb3Rpb246bm8tcHJlZmVyZW5jZSl7CiAgLnRydWNre2FuaW1hdGlvbjpkcml2ZSA2cyBlYXNlLWluLW91dCBpbmZpbml0ZX0KICBAa2V5ZnJhbWVzIGRyaXZlezAlLDEwMCV7dHJhbnNmb3JtOnRyYW5zbGF0ZVgoMCl9NTAle3RyYW5zZm9ybTp0cmFuc2xhdGVYKDE2cHgpfX0KfQouZ3JpZDIgPiAqe21pbi13aWR0aDowfQovKiBiYW5kZWphIG51ZXZhICovCi50YWJzYmlne2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDYsMWZyKTtnYXA6MTBweDttYXJnaW4tYm90dG9tOjE2cHh9Ci50YntkaXNwbGF5OmZsZXg7Z2FwOjEycHg7YWxpZ24taXRlbXM6Y2VudGVyO3RleHQtYWxpZ246bGVmdDtib3JkZXI6MnB4IHNvbGlkIHZhcigtLWxpbmUpO2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyLXJhZGl1czoxOHB4O3BhZGRpbmc6MTRweCAxNnB4O2NvbG9yOnZhcigtLWluayl9Ci50YiAudGItaWN7d2lkdGg6NDRweDtoZWlnaHQ6NDRweDtib3JkZXItcmFkaXVzOjEycHg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtmbGV4Om5vbmV9Ci50YiAudGItaWMgc3Zne3dpZHRoOjIycHg7aGVpZ2h0OjIycHh9Ci50YiBie2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtc2l6ZTozMHB4O2xpbmUtaGVpZ2h0OjE7ZGlzcGxheTpibG9jaztmb250LXZhcmlhbnQtbnVtZXJpYzp0YWJ1bGFyLW51bXN9Ci50YiAudGItbntmb250LXdlaWdodDo4MDA7ZGlzcGxheTpibG9ja30KLnRiIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTJweDtkaXNwbGF5OmJsb2NrO2xpbmUtaGVpZ2h0OjEuMn0KLnRiLXJlYWR5IC50Yi1pY3tiYWNrZ3JvdW5kOnZhcigtLWljZSk7Y29sb3I6dmFyKC0tYWNjZW50LXN0cm9uZyl9Ci50Yi13YWl0aW5nIC50Yi1pY3tiYWNrZ3JvdW5kOnZhcigtLXdhcm4tYmcpO2NvbG9yOnZhcigtLXdhcm4pfQoudGItcHJpbnRlZCAudGItaWN7YmFja2dyb3VuZDp2YXIoLS1vay1iZyk7Y29sb3I6dmFyKC0tb2spfQoudGItYmxvY2tlZCAudGItaWN7YmFja2dyb3VuZDp2YXIoLS1sb2NrLWJnKTtjb2xvcjp2YXIoLS1sb2NrKX0KLnRiW2FyaWEtcHJlc3NlZD0idHJ1ZSJde2JvcmRlci1jb2xvcjp2YXIoLS1hY2NlbnQpO2JveC1zaGFkb3c6MCAwIDAgM3B4IGNvbG9yLW1peChpbiBzcmdiLHZhcigtLWFjY2VudCkgMjIlLHRyYW5zcGFyZW50KX0KLnRiLXJlYWR5W2FyaWEtcHJlc3NlZD0idHJ1ZSJde2JhY2tncm91bmQ6Y29sb3ItbWl4KGluIHNyZ2IsdmFyKC0taWNlKSA0NSUsdmFyKC0tc3VyZmFjZSkpfQouY2hpcCAuY250e2Rpc3BsYXk6aW5saW5lLWJsb2NrO21pbi13aWR0aDoyMHB4O3BhZGRpbmc6MCA2cHg7Ym9yZGVyLXJhZGl1czo5OTlweDtiYWNrZ3JvdW5kOmNvbG9yLW1peChpbiBzcmdiLGN1cnJlbnRDb2xvciAxNSUsdHJhbnNwYXJlbnQpO2ZvbnQtc2l6ZToxMS41cHg7bWFyZ2luLWxlZnQ6NHB4fQouYWN0aW9uYmFye2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6MTBweDthbGlnbi1pdGVtczpjZW50ZXI7cGFkZGluZzoxMnB4IDIwcHg7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tbGluZSk7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlMil9Ci5kYXloZWFke3BhZGRpbmc6MTBweCAyMHB4O2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MTNweDt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7bGV0dGVyLXNwYWNpbmc6LjA2ZW07Y29sb3I6dmFyKC0tYWNjZW50LXN0cm9uZyk7YmFja2dyb3VuZDp2YXIoLS1iZyk7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tbGluZSl9Ci5vcm93e2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MzRweCAxMTBweCAxZnIgYXV0bztnYXA6MTRweDthbGlnbi1pdGVtczpjZW50ZXI7cGFkZGluZzoxMnB4IDIwcHg7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tbGluZSl9Ci5vcm93LnN0LXByaW50ZWR7b3BhY2l0eTouOH0KLm9yb3cuc3QtYmxvY2tlZHtiYWNrZ3JvdW5kOmNvbG9yLW1peChpbiBzcmdiLHZhcigtLWxvY2stYmcpIDQ1JSx0cmFuc3BhcmVudCl9Ci5vYy10aW1le2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjRweDthbGlnbi1pdGVtczpmbGV4LXN0YXJ0fQoub2MtdGltZSBie2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZToxOHB4fQoub2MtdG9we2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6OHB4O2FsaWduLWl0ZW1zOmJhc2VsaW5lO21hcmdpbi1ib3R0b206MnB4fQouY3VzdHtmb250LXdlaWdodDo4MDA7Zm9udC1zaXplOjE1LjVweH0KLmN1c3Q6OmFmdGVye2NvbnRlbnQ6IsK3IjttYXJnaW4tbGVmdDo4cHg7Y29sb3I6dmFyKC0tbXV0ZWQpfQoub2MtYWN0e2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47YWxpZ24taXRlbXM6ZmxleC1lbmQ7Z2FwOjhweH0KLm9yb3cuaXMtbmV3e2FuaW1hdGlvbjpmbGFzaCAyLjVzIGVhc2Utb3V0fQpAbWVkaWEgKG1heC13aWR0aDo4MjBweCl7CiAgLnRhYnNiaWd7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgyLDFmcil9CiAgLm9yb3d7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjI4cHggMWZyO30KICAub3JvdyAub2MtdGltZXtmbGV4LWRpcmVjdGlvbjpyb3c7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo4cHh9CiAgLm9yb3cgLm9jLW1haW4sLm9yb3cgLm9jLWFjdHtncmlkLWNvbHVtbjoyfQogIC5vYy1hY3R7YWxpZ24taXRlbXM6ZmxleC1zdGFydH0KfQoKLyogaW1wcmVzYXMgZW4gcm9qbyAoY29tbyBNZXJjYWRvIExpYnJlKSwgYmxvcXVlYWRhcyBlbiBncmlzICovCi50Yi1wcmludGVkIC50Yi1pY3tiYWNrZ3JvdW5kOnZhcigtLWxvY2stYmcpO2NvbG9yOnZhcigtLWxvY2spfQoudGItYmxvY2tlZCAudGItaWN7YmFja2dyb3VuZDojRTNFN0VDO2NvbG9yOiM0QTU1NjN9Ci5vcm93LnN0LXByaW50ZWR7b3BhY2l0eToxO2JhY2tncm91bmQ6I0ZGRjdGOH0KLm9yb3cuc3QtYmxvY2tlZHtiYWNrZ3JvdW5kOiNGM0Y1Rjd9Ci5vcm93LnN0LWJsb2NrZWQgLmxvY2tjZWxse2NvbG9yOiM0QTU1NjN9Ci5idG4tcmVwcmludHtiYWNrZ3JvdW5kOnZhcigtLWxvY2spO2NvbG9yOiNmZmZ9Ci5idG4tcmVwcmludDpob3ZlcntmaWx0ZXI6YnJpZ2h0bmVzcyguOTIpfQoKLnBpbGwuc2hpcHBlZHtiYWNrZ3JvdW5kOiNFM0U3RUM7Y29sb3I6IzM0NDE0Rn0KLm9yb3cuc3Qtc2hpcHBlZHtiYWNrZ3JvdW5kOiNGQUZCRkN9CgoudGItdG9kYXkgLnRiLWlje2JhY2tncm91bmQ6dmFyKC0taWNlKTtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KLnRiLXVwY29taW5nIC50Yi1pY3tiYWNrZ3JvdW5kOiNFREU5RkU7Y29sb3I6IzZEMjhEOX0KLnRiLXRvZGF5W2FyaWEtcHJlc3NlZD0idHJ1ZSJde2JhY2tncm91bmQ6Y29sb3ItbWl4KGluIHNyZ2IsdmFyKC0taWNlKSA0NSUsdmFyKC0tc3VyZmFjZSkpfQouc2hpcHR5cGV7Zm9udC1zaXplOjExcHg7Zm9udC13ZWlnaHQ6ODAwO3BhZGRpbmc6MnB4IDhweDtib3JkZXItcmFkaXVzOjZweDtiYWNrZ3JvdW5kOiNFRUYyRjY7Y29sb3I6IzM0NDE0Rn0KLnNoaXB0eXBlLnN0LWZsZXh7YmFja2dyb3VuZDojMTZBMzRBO2NvbG9yOiNmZmZ9Ci5zaGlwdHlwZS5zdC1jb2xlY3Rhe2JhY2tncm91bmQ6I0RCRUFGRTtjb2xvcjojMUU0MEFGfQouc2hpcHR5cGUuc3QtYWdlbmNpYXtiYWNrZ3JvdW5kOiNGRUYzQzc7Y29sb3I6IzkyNDAwRX0KLmRpc3BhdGNoe2Rpc3BsYXk6aW5saW5lLWJsb2NrO2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MTIuNXB4O2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpO2JhY2tncm91bmQ6dmFyKC0taWNlKTtib3JkZXItcmFkaXVzOjhweDtwYWRkaW5nOjJweCA4cHg7bWFyZ2luLWJvdHRvbTo0cHh9Ci5kaXNwYXRjaC5sYXRle2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayl9CkBtZWRpYSAobWF4LXdpZHRoOjExMDBweCl7LnRhYnNiaWd7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgzLDFmcil9fQpAbWVkaWEgKG1heC13aWR0aDo2NDBweCl7LnRhYnNiaWd7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgyLDFmcil9fQoKLmJsb2Nrbm97ZGlzcGxheTppbmxpbmUtYmxvY2s7YmFja2dyb3VuZDp2YXIoLS1pbmspO2NvbG9yOiNmZmY7Zm9udC13ZWlnaHQ6ODAwO2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2JvcmRlci1yYWRpdXM6OHB4O3BhZGRpbmc6MnB4IDlweDttYXJnaW4tcmlnaHQ6OHB4O2ZvbnQtc2l6ZToxNHB4fQouaXRlbXMgZW0uZmFsdGF7Zm9udC1zdHlsZTpub3JtYWw7YmFja2dyb3VuZDp2YXIoLS1sb2NrKTtjb2xvcjojZmZmO2JvcmRlci1yYWRpdXM6NXB4O3BhZGRpbmc6MCA1cHg7Zm9udC1zaXplOjExcHg7Zm9udC13ZWlnaHQ6ODAwO2xldHRlci1zcGFjaW5nOi4wNGVtfQoKLml0ZW1zIC5nb29ke2NvbG9yOnZhcigtLW9rKTtmb250LXdlaWdodDo3MDB9Ci5pdGVtcyBlbS50aWVuZXtmb250LXN0eWxlOm5vcm1hbDtiYWNrZ3JvdW5kOnZhcigtLW9rKTtjb2xvcjojZmZmO2JvcmRlci1yYWRpdXM6NXB4O3BhZGRpbmc6MCA1cHg7Zm9udC1zaXplOjExcHg7Zm9udC13ZWlnaHQ6ODAwO2xldHRlci1zcGFjaW5nOi4wNGVtfQoubm9wcmludHtkaXNwbGF5OmJsb2NrO21hcmdpbi10b3A6NnB4O2ZvbnQtd2VpZ2h0OjkwMDtjb2xvcjp2YXIoLS1pbmspO2ZvbnQtc2l6ZToxNXB4O2xldHRlci1zcGFjaW5nOi4wMmVtfQoKLyogVmVudGFzICovCi5zYWxlcy1rcGlze2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MS42ZnIgcmVwZWF0KDQsMWZyKTtnYXA6MTJweDttYXJnaW4tYm90dG9tOjE2cHh9Ci5rcGl7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTZweDtwYWRkaW5nOjE0cHggMTZweDtkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDo0cHg7Ym94LXNoYWRvdzp2YXIoLS1zaGFkb3cpfQoua3BpIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXdlaWdodDo3MDA7Zm9udC1zaXplOjEyLjVweDtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo2cHh9Ci5rcGkgYntmb250LWZhbWlseTp2YXIoLS1kaXNwbGF5KTtmb250LXNpemU6MjRweDtjb2xvcjp2YXIoLS1pbmspO2xpbmUtaGVpZ2h0OjEuMX0KLmtwaSBzcGFue2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTNweH0KLmtwaS1oZXJve2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDEzNWRlZywjRTNGNEZELCNmZmYpO2JvcmRlci1jb2xvcjp2YXIoLS1pY2UpfQoua3BpLWhlcm8gYntmb250LXNpemU6MzRweDtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KLmtwaS1oZXJvIHNwYW57Y29sb3I6dmFyKC0tb2spO2ZvbnQtd2VpZ2h0OjcwMH0KLmRvdHtkaXNwbGF5OmlubGluZS1ibG9jazt3aWR0aDoxMXB4O2hlaWdodDoxMXB4O2JvcmRlci1yYWRpdXM6M3B4O3ZlcnRpY2FsLWFsaWduOi0xcHg7bWFyZ2luLXJpZ2h0OjZweH0KLmxlZ2VuZHtkaXNwbGF5OmZsZXg7Z2FwOjE0cHg7ZmxleC13cmFwOndyYXA7Zm9udC1zaXplOjEzcHg7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOnZhcigtLWluayl9Ci5jaGFydHt3aWR0aDoxMDAlO2hlaWdodDphdXRvO2Rpc3BsYXk6YmxvY2t9Ci5jaGFydCAuY2gtYXh7Zm9udC1zaXplOjExcHg7ZmlsbDp2YXIoLS1tdXRlZCl9Ci5jaGFydCAuY2gtdmFse2ZvbnQtc2l6ZToxMnB4O2ZvbnQtd2VpZ2h0OjcwMDtmaWxsOnZhcigtLWluayl9Ci5jaGFydCAuY2gtZGF5e2ZvbnQtc2l6ZToxMnB4O2ZpbGw6dmFyKC0tbXV0ZWQpfQouY2hhcnQgLmNoLXRvZGF5e2ZpbGw6dmFyKC0tYWNjZW50LXN0cm9uZyk7Zm9udC13ZWlnaHQ6ODAwfQouY2hhcnQgLmNoLWhpdHtjdXJzb3I6cG9pbnRlcn0KLmNoYXJ0IC5jaC1oaXQ6aG92ZXJ7ZmlsbDpyZ2JhKDIyLDE0NywyMTEsLjA3KX0KLnNhbGVzLWdyaWR7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoMywxZnIpO2dhcDoxNHB4O21hcmdpbi10b3A6MTRweH0KLnNhbGVzLW1rIC5wYW5lbC1oZWFkIGgye2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXJ9Ci5jaC10aXB7cG9zaXRpb246Zml4ZWQ7ei1pbmRleDo1MDtiYWNrZ3JvdW5kOnZhcigtLWluayk7Y29sb3I6I2ZmZjtib3JkZXItcmFkaXVzOjEwcHg7cGFkZGluZzo4cHggMTFweDtmb250LXNpemU6MTIuNXB4O2xpbmUtaGVpZ2h0OjEuNTtwb2ludGVyLWV2ZW50czpub25lO2JveC1zaGFkb3c6dmFyKC0tc2hhZG93KTttYXgtd2lkdGg6MjgwcHh9Ci5jaC10aXAgYntkaXNwbGF5OmJsb2NrO21hcmdpbi1ib3R0b206MnB4O3RleHQtdHJhbnNmb3JtOmNhcGl0YWxpemV9Ci5jaC10YWJsZXttYXJnaW4tdG9wOjEwcHh9Ci5jaC10YWJsZSBzdW1tYXJ5e2N1cnNvcjpwb2ludGVyO2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpO2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTNweH0KQG1lZGlhIChtYXgtd2lkdGg6MTAwMHB4KXsuc2FsZXMta3Bpc3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDIsMWZyKX0ua3BpLWhlcm97Z3JpZC1jb2x1bW46MS8tMX0uc2FsZXMtZ3JpZHtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyfX0KLmNoYXJ0e3dpZHRoOjEwMCU7bWF4LXdpZHRoOjEwMCU7aGVpZ2h0OmF1dG99Ci5jaC1zbG90e3dpZHRoOjEwMCV9CgoucHAtd2Vla3tkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6OHB4O2ZvbnQtc2l6ZToxNHB4fQoucHAtdGFibGUgdGgubnVtLC5wcC10YWJsZSB0ZC5udW17dGV4dC1hbGlnbjpyaWdodDt3aGl0ZS1zcGFjZTpub3dyYXB9Ci5wcC10YWJsZSB0aCBzbWFsbHtkaXNwbGF5OmJsb2NrO2ZvbnQtd2VpZ2h0OjYwMDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5wcC10YWJsZSAucHAtbmFtZXtkaXNwbGF5OmJsb2NrO2ZvbnQtd2VpZ2h0OjcwMDtjb2xvcjp2YXIoLS1vayl9Ci5wcC10YWJsZSB0ZCBzbWFsbHtkaXNwbGF5OmJsb2NrfQoucHAtdGFibGUgLnplcm97Y29sb3I6dmFyKC0tbGluZSl9Ci5wcC10YWJsZSAucHAtdG90YWx7Zm9udC13ZWlnaHQ6ODAwO2ZvbnQtc2l6ZToxNXB4O2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQoucHAtdGFibGUgdGZvb3QgdGR7Ym9yZGVyLXRvcDoycHggc29saWQgdmFyKC0tbGluZSk7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlMil9Ci5wcC1ub3Rle2JhY2tncm91bmQ6dmFyKC0td2Fybi1iZyk7Y29sb3I6dmFyKC0td2Fybik7Ym9yZGVyLXJhZGl1czoxMHB4O3BhZGRpbmc6OHB4IDEycHg7Zm9udC1zaXplOjEzcHg7Zm9udC13ZWlnaHQ6NjAwO21hcmdpbjowIDAgMTBweH0KCi5wcC10YWJsZSAucHAtY2Fue2N1cnNvcjpwb2ludGVyfQoucHAtdGFibGUgLnBwLWNhbjpob3ZlciB0ZHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKX0KLnBwLXRhYmxlIC5wcC1hcnJvd3tkaXNwbGF5OmlubGluZS1ibG9jazt3aWR0aDoxNnB4O2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpO2ZvbnQtd2VpZ2h0OjkwMH0KLnBwLXRhYmxlIC5wcC1wdWIgLnBwLW5hbWV7ZGlzcGxheTppbmxpbmV9Ci5wcC10YWJsZSAucHAtc3Vie2Rpc3BsYXk6YmxvY2s7bWFyZ2luLWxlZnQ6MTZweH0KLnBwLXRhYmxlIC5wcC12YXIgdGR7YmFja2dyb3VuZDojRjdGQkZFO2ZvbnQtc2l6ZToxM3B4fQoucHAtdGFibGUgLnBwLXZuYW1le2Rpc3BsYXk6YmxvY2s7cGFkZGluZy1sZWZ0OjM0cHg7Y29sb3I6dmFyKC0tb2spO2ZvbnQtd2VpZ2h0OjYwMH0KLnBwLXRhYmxlIC5wcC12YXIgLnBwLXRvdGFse2ZvbnQtc2l6ZToxM3B4fQoudGItdW5ibG9ja2VkIC50Yi1pY3tiYWNrZ3JvdW5kOnZhcigtLXdhcm4tYmcpO2NvbG9yOnZhcigtLXdhcm4pfQpAbWVkaWEgKG1heC13aWR0aDoxMjgwcHgpey50YWJzYmlnIC50YiBzbWFsbHtkaXNwbGF5Om5vbmV9fQoKLyogUHJvZHVjdG9zIHZlbmRpZG9zIChzaW4gcHJlY2lvcykgKi8KLnV2LWtwaXN7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczoxLjNmciAxZnIgMWZyIDEuNmZyO2dhcDoxMnB4O21hcmdpbi1ib3R0b206MTJweH0KLnV2LW1re2Rpc3BsYXk6ZmxleDtnYXA6MThweDtmbGV4LXdyYXA6d3JhcDtmb250LXNpemU6MTRweDttYXJnaW46NHB4IDJweCAxNHB4O2NvbG9yOnZhcigtLWluayl9Ci51di1tayBzbWFsbHtjb2xvcjp2YXIoLS1tdXRlZCl9Ci51di1jYXJke21hcmdpbi1ib3R0b206MTRweH0KLnV2LWdyaWR7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczoxLjRmciAxZnI7Z2FwOjE0cHh9Ci51di1ncmlkID4gLnV2LWNhcmQ6b25seS1jaGlsZHtncmlkLWNvbHVtbjoxLy0xfQoudXYtaHtmb250LWZhbWlseTp2YXIoLS1kaXNwbGF5KTtmb250LXNpemU6MjBweDttYXJnaW46NnB4IDAgMTBweDtjb2xvcjp2YXIoLS1pbmspfQoudXYtaCBzbWFsbHtmb250LWZhbWlseTp2YXIoLS1ib2R5KTtmb250LXNpemU6MTNweDtjb2xvcjp2YXIoLS1tdXRlZCk7Zm9udC13ZWlnaHQ6NjAwO21hcmdpbi1sZWZ0OjhweH0KLmhie2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6bWlubWF4KDAsMS4zZnIpIG1pbm1heCgwLDFmcikgYXV0bztnYXA6MTJweDthbGlnbi1pdGVtczpjZW50ZXI7cGFkZGluZzo3cHggMDtib3JkZXItYm90dG9tOjFweCBkYXNoZWQgdmFyKC0tbGluZSl9Ci5oYjpsYXN0LWNoaWxke2JvcmRlci1ib3R0b206MH0KLmhiLWx7bWluLXdpZHRoOjB9Ci5oYi1uYW1le2Rpc3BsYXk6YmxvY2s7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOnZhcigtLWluayk7Zm9udC1zaXplOjEzLjVweDt3aGl0ZS1zcGFjZTpub3dyYXA7b3ZlcmZsb3c6aGlkZGVuO3RleHQtb3ZlcmZsb3c6ZWxsaXBzaXN9Ci5oYi1sIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTJweH0KLmhiLXRyYWNre2hlaWdodDoxMnB4O2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZTIpO2JvcmRlci1yYWRpdXM6NnB4O292ZXJmbG93OmhpZGRlbn0KLmhiLXRyYWNrIGl7ZGlzcGxheTpibG9jaztoZWlnaHQ6MTAwJTtib3JkZXItcmFkaXVzOjZweH0KLmhiLXZ7Zm9udC1zaXplOjE1cHg7Y29sb3I6dmFyKC0taW5rKTttaW4td2lkdGg6MzhweDt0ZXh0LWFsaWduOnJpZ2h0fQoucmt7Zm9udC1zdHlsZTpub3JtYWw7ZGlzcGxheTppbmxpbmUtZ3JpZDtwbGFjZS1pdGVtczpjZW50ZXI7d2lkdGg6MjBweDtoZWlnaHQ6MjBweDtib3JkZXItcmFkaXVzOjZweDtiYWNrZ3JvdW5kOnZhcigtLWljZSk7Y29sb3I6dmFyKC0tYWNjZW50LXN0cm9uZyk7Zm9udC1zaXplOjExLjVweDtmb250LXdlaWdodDo4MDA7bWFyZ2luLXJpZ2h0OjZweH0KQG1lZGlhIChtYXgtd2lkdGg6MTAwMHB4KXsudXYta3Bpc3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDIsMWZyKX0udXYtZ3JpZHtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyfX0KCi8qIFJlc3VtZW4gZGUgZW52w61vcyB5IDggc2VjY2lvbmVzICovCi50YWJzYmlne2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoNCwxZnIpfQoudGItd2VlayAudGItaWN7YmFja2dyb3VuZDp2YXIoLS1vay1iZyk7Y29sb3I6dmFyKC0tb2spfQoudGItYmxvY2tlZFByaW50ZWQgLnRiLWlje2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayl9Ci5zaGlwLXN1bXttYXJnaW4tYm90dG9tOjE0cHh9Ci5zcy10aWxlc3tkaXNwbGF5OmdyaWQ7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCg1LDFmcik7Z2FwOjEwcHg7bWFyZ2luLWJvdHRvbToxMnB4fQouc3MtdGlsZXtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1sZWZ0OjVweCBzb2xpZCB2YXIoLS1jKTtib3JkZXItcmFkaXVzOjEycHg7cGFkZGluZzoxMHB4IDEycHg7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKX0KLnNzLXRpbGUgc21hbGx7ZGlzcGxheTpibG9jaztjb2xvcjp2YXIoLS1tdXRlZCk7Zm9udC13ZWlnaHQ6NzAwO2ZvbnQtc2l6ZToxMi41cHh9Ci5zcy10aWxlIGJ7Zm9udC1mYW1pbHk6dmFyKC0tZGlzcGxheSk7Zm9udC1zaXplOjI4cHg7Y29sb3I6dmFyKC0taW5rKTtsaW5lLWhlaWdodDoxLjF9Ci5zcy10b3RhbHstLWM6dmFyKC0tYWNjZW50LXN0cm9uZyk7YmFja2dyb3VuZDpsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCNFM0Y0RkQsI2ZmZil9Ci5zcy10b3RhbCBie2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQouc3MtdGFibGUgdGQubnVtLC5zcy10YWJsZSB0aC5udW17dGV4dC1hbGlnbjpyaWdodH0KLnNzLXRhYmxlIC56ZXJve2NvbG9yOnZhcigtLWxpbmUpfQouc3MtdGFibGUgdGZvb3QgdGR7Ym9yZGVyLXRvcDoycHggc29saWQgdmFyKC0tbGluZSk7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlMil9CkBtZWRpYSAobWF4LXdpZHRoOjgwMHB4KXsuc3MtdGlsZXN7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgyLDFmcil9LnNzLXRvdGFse2dyaWQtY29sdW1uOjEvLTF9LnRhYnNiaWd7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgyLDFmcil9fQouZGlzcGF0Y2guZG9uZXtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKTtjb2xvcjp2YXIoLS1tdXRlZCk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKX0KLnNzLWN1dHtkaXNwbGF5OmJsb2NrO2ZvbnQtc2l6ZToxMi41cHg7Y29sb3I6dmFyKC0taW5rKTttYXJnaW4tdG9wOjJweH0KLnNzLWN1dCBzdHJvbmd7Y29sb3I6dmFyKC0tbG9jayl9Ci5zcy1jdXQgc21hbGx7Y29sb3I6dmFyKC0tbXV0ZWQpfQouc3MtY3V0Lm11dGVke2NvbG9yOnZhcigtLW11dGVkKX0KLnNzLWN1dCBzdHJvbmd7d2hpdGUtc3BhY2U6bm93cmFwfQoKLyogUmVzdW1lbiBkZSBlbnbDrW9zIGNvbXBhY3RvICovCi5zaGlwLXN1bXttYXJnaW46MCAwIDEycHg7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTJweDtwYWRkaW5nOjZweCAxMnB4fQouc3N4e2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7ZmxleC13cmFwOndyYXA7Z2FwOjZweCAxNnB4O2ZvbnQtc2l6ZToxM3B4O2NvbG9yOnZhcigtLWluayl9Ci5zc3gtdHtmb250LXdlaWdodDo4MDB9Ci5zc3gtaXtkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmJhc2VsaW5lO2dhcDo1cHg7d2hpdGUtc3BhY2U6bm93cmFwfQouc3N4LWkgaXt3aWR0aDo5cHg7aGVpZ2h0OjlweDtib3JkZXItcmFkaXVzOjNweDtiYWNrZ3JvdW5kOnZhcigtLWMpO2Rpc3BsYXk6aW5saW5lLWJsb2NrO2FsaWduLXNlbGY6Y2VudGVyfQouc3N4LWkgYntmb250LXNpemU6MTRweH0KLnNzeC1pIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTEuNXB4fQouc3N4LXRvdCBie2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQouc3N4LXN3e2Rpc3BsYXk6aW5saW5lLWZsZXg7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjhweDtvdmVyZmxvdzpoaWRkZW59Ci5zc3gtc3cgYnV0dG9ue2JvcmRlcjowO2JhY2tncm91bmQ6dHJhbnNwYXJlbnQ7cGFkZGluZzozcHggOXB4O2ZvbnQ6aW5oZXJpdDtmb250LXNpemU6MTJweDtmb250LXdlaWdodDo3MDA7Y29sb3I6dmFyKC0tbXV0ZWQpO2N1cnNvcjpwb2ludGVyfQouc3N4LXN3IGJ1dHRvblthcmlhLXByZXNzZWQ9InRydWUiXXtiYWNrZ3JvdW5kOnZhcigtLWFjY2VudCk7Y29sb3I6I2ZmZn0KLnNzeC1kZXQgc3VtbWFyeXtjdXJzb3I6cG9pbnRlcjtmb250LXNpemU6MTJweDtmb250LXdlaWdodDo3MDA7Y29sb3I6dmFyKC0tYWNjZW50LXN0cm9uZyk7bWFyZ2luLXRvcDoycHh9Ci5zc3gtZGV0IC5zcy10YWJsZXtmb250LXNpemU6MTIuNXB4O21hcmdpbi10b3A6NnB4fQouc3N4LWRldCAuc3MtdGFibGUgdGQsLnNzeC1kZXQgLnNzLXRhYmxlIHRoe3BhZGRpbmc6NHB4IDhweH0KLnNzeC1tb3Jle2JvcmRlcjowO2JhY2tncm91bmQ6bm9uZTtmb250OmluaGVyaXQ7Zm9udC1zaXplOjEycHg7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpO2N1cnNvcjpwb2ludGVyO3BhZGRpbmc6MnB4IDRweH0KLnNzeHtnYXA6NHB4IDE0cHh9Ci5zc3gtcnttYXJnaW4tbGVmdDphdXRvO2Rpc3BsYXk6aW5saW5lLWZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo4cHg7d2hpdGUtc3BhY2U6bm93cmFwfQouc3N4e2ZvbnQtc2l6ZToxMi41cHg7Z2FwOjRweCAxMnB4fQouc3N4LWFsbHtwYWRkaW5nLWxlZnQ6MTBweDtib3JkZXItbGVmdDoxcHggc29saWQgdmFyKC0tbGluZSk7Y29sb3I6dmFyKC0tbXV0ZWQpfQouc3N4LWFsbCBie2NvbG9yOnZhcigtLWluayl9Ci5zcy1zdW0gdGR7Ym9yZGVyLXRvcDoycHggc29saWQgdmFyKC0tbGluZSl9Ci8qIGZpbHRybyBkZSB2ZW5kZWRvcmVzIGNvbiBzZWxlY2Npw7NuIG3Dumx0aXBsZSAqLwoubXNlbHtwb3NpdGlvbjpyZWxhdGl2ZX0KLm1zZWwtYnRue2ZvbnQ6aW5oZXJpdDtjb2xvcjp2YXIoLS1pbmspO2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZTIpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czoxMnB4O3BhZGRpbmc6OHB4IDM0cHggOHB4IDEycHg7Y3Vyc29yOnBvaW50ZXI7d2hpdGUtc3BhY2U6bm93cmFwO3Bvc2l0aW9uOnJlbGF0aXZlO21pbi13aWR0aDoyMDBweDt0ZXh0LWFsaWduOmxlZnR9Ci5tc2VsLWJ0bjo6YWZ0ZXJ7Y29udGVudDonJztwb3NpdGlvbjphYnNvbHV0ZTtyaWdodDoxM3B4O3RvcDo1MCU7d2lkdGg6N3B4O2hlaWdodDo3cHg7Ym9yZGVyLXJpZ2h0OjJweCBzb2xpZCBjdXJyZW50Q29sb3I7Ym9yZGVyLWJvdHRvbToycHggc29saWQgY3VycmVudENvbG9yO3RyYW5zZm9ybTp0cmFuc2xhdGVZKC03MCUpIHJvdGF0ZSg0NWRlZyl9Ci5tc2VsLm9uIC5tc2VsLWJ0bntib3JkZXItY29sb3I6dmFyKC0tYWNjZW50KTtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKTtmb250LXdlaWdodDo3MDB9Ci5tc2VsLXBvcHtwb3NpdGlvbjphYnNvbHV0ZTt6LWluZGV4OjMwO3RvcDpjYWxjKDEwMCUgKyA2cHgpO2xlZnQ6MDttaW4td2lkdGg6MjQwcHg7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTJweDtib3gtc2hhZG93OjAgMTBweCAzMHB4IHJnYmEoMCwwLDAsLjE0KTtwYWRkaW5nOjZweH0KLm1zZWwtcG9wIGxhYmVse2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjEwcHg7cGFkZGluZzo4cHggMTBweDtib3JkZXItcmFkaXVzOjhweDtjdXJzb3I6cG9pbnRlcjt3aGl0ZS1zcGFjZTpub3dyYXB9Ci5tc2VsLXBvcCBsYWJlbDpob3ZlcntiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKX0KLm1zZWwtcG9wIGlucHV0e3dpZHRoOjE4cHg7aGVpZ2h0OjE4cHg7YWNjZW50LWNvbG9yOnZhcigtLWFjY2VudCk7bWFyZ2luOjB9Ci5tc2VsLWFsbHtib3JkZXItYm90dG9tOjFweCBzb2xpZCB2YXIoLS1saW5lKTttYXJnaW4tYm90dG9tOjRweDtmb250LXdlaWdodDo3MDB9Ci8qIGZpbHRybyBkZSBCbG9xdWVhZGFzIGltcHJlc2FzICovCi5icGZ7ZGlzcGxheTpmbGV4O2ZsZXgtd3JhcDp3cmFwO2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6OHB4O3BhZGRpbmc6MTBweCAxOHB4O2JvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLWxpbmUpfQouYnBmW2hpZGRlbl17ZGlzcGxheTpub25lfQouYnBmLXR7Zm9udC13ZWlnaHQ6NzAwO2ZvbnQtc2l6ZToxM3B4O2NvbG9yOnZhcigtLW11dGVkKX0KLmNoaXAtZmlsbFthcmlhLXByZXNzZWQ9InRydWUiXXtiYWNrZ3JvdW5kOiMxZjhmNGU7Ym9yZGVyLWNvbG9yOiMxZjhmNGU7Y29sb3I6I2ZmZn0KLndhcm5ib3h7YmFja2dyb3VuZDojZmZmNmUwO2JvcmRlcjoxcHggc29saWQgI2YwZDQ4YTtib3JkZXItcmFkaXVzOjEwcHg7cGFkZGluZzo4cHggMTBweDtjb2xvcjojNmI0ZTAwfQo=","app.js":"LyogRXRpcXVldGFIdWIg4oCUIGludGVyZmF6ICovCigoKSA9PiB7CmNvbnN0ICQgPSAocywgZWwgPSBkb2N1bWVudCkgPT4gZWwucXVlcnlTZWxlY3RvcihzKTsKY29uc3QgJCQgPSAocywgZWwgPSBkb2N1bWVudCkgPT4gWy4uLmVsLnF1ZXJ5U2VsZWN0b3JBbGwocyldOwpjb25zdCBlc2MgPSBzID0+IFN0cmluZyhzID8/ICcnKS5yZXBsYWNlKC9bJjw+IiddL2csIGMgPT4gKHsgJyYnOiAnJmFtcDsnLCAnPCc6ICcmbHQ7JywgJz4nOiAnJmd0OycsICciJzogJyZxdW90OycsICInIjogJyYjMzk7JyB9W2NdKSk7CmNvbnN0IE1LID0geyBtbDogJ01lcmNhZG8gTGlicmUnLCBmYTogJ0ZhbGFiZWxsYScsIHBhOiAnUGFyaXMnIH07CmNvbnN0IFNUQVRFID0geyByZWFkeTogJ0V0aXF1ZXRhIHBvciBpbXByaW1pcicsIHdhaXRpbmc6ICdFc3BlcmFuZG8gZXRpcXVldGEnLCBibG9ja2VkOiAnQmxvcXVlYWRhJywgcHJpbnRlZDogJ0V0aXF1ZXRhIGltcHJlc2EnLCBzaGlwcGVkOiAnRW52aWFkYScsIGVycm9yOiAnRXJyb3IgZW4gZXRpcXVldGEnLCBjYW5jZWxsZWQ6ICdDYW5jZWxhZGEnIH07CmNvbnN0IHN0b3JlID0geyBnZXQoaywgZCkgeyB0cnkgeyBjb25zdCB2ID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2VoOicgKyBrKTsgcmV0dXJuIHYgPT0gbnVsbCA/IGQgOiBKU09OLnBhcnNlKHYpOyB9IGNhdGNoIHsgcmV0dXJuIGQ7IH0gfSwgc2V0KGssIHYpIHsgdHJ5IHsgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2VoOicgKyBrLCBKU09OLnN0cmluZ2lmeSh2KSk7IH0gY2F0Y2gge30gfSB9OwoKY29uc3QgSSA9IHsKICBsb2NrOiAnPHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjIuMiI+PHJlY3QgeD0iNSIgeT0iMTEiIHdpZHRoPSIxNCIgaGVpZ2h0PSIxMCIgcng9IjIiLz48cGF0aCBkPSJNOCAxMVY4YTQgNCAwIDAxOCAwdjMiLz48L3N2Zz4nLAogIGNoZWNrOiAnPHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjMiPjxwYXRoIGQ9Ik01IDEybDUgNSA5LTEwIi8+PC9zdmc+JywKICBwcmludDogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyLjIiPjxwYXRoIGQ9Ik03IDlWM2gxMHY2TTcgMTdINHYtN2gxNnY3aC0zIi8+PHJlY3QgeD0iNyIgeT0iMTQiIHdpZHRoPSIxMCIgaGVpZ2h0PSI3Ii8+PC9zdmc+JywKICBjbG9jazogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyLjIiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjkiLz48cGF0aCBkPSJNMTIgN3Y1bDMgMiIvPjwvc3ZnPicsCiAgd2FybjogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyLjIiPjxwYXRoIGQ9Ik0xMiAzbDEwIDE4SDJ6Ii8+PHBhdGggZD0iTTEyIDEwdjVNMTIgMTh2LjUiLz48L3N2Zz4nLAogIGRvd246ICc8c3ZnIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMi40Ij48cGF0aCBkPSJNMTIgNHYxMW0wIDBsLTUtNW01IDVsNS01TTUgMjBoMTQiLz48L3N2Zz4nLAogIHN5bmM6ICc8c3ZnIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMi4yIj48cGF0aCBkPSJNMjAgMTFhOCA4IDAgMDAtMTQuOS0zTTQgNXY0aDRNNCAxM2E4IDggMCAwMDE0LjkgM00yMCAxOXYtNGgtNCIvPjwvc3ZnPicsCiAgeDogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiB3aWR0aD0iMTQiIGhlaWdodD0iMTQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjIuNiI+PHBhdGggZD0iTTYgNmwxMiAxMk0xOCA2TDYgMTgiLz48L3N2Zz4nLAogIGJveDogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIj48cmVjdCB4PSIzIiB5PSI0IiB3aWR0aD0iMTgiIGhlaWdodD0iMTYiIHJ4PSIzIi8+PHBhdGggZD0iTTMgOWgxOCIvPjwvc3ZnPicsCn07CmNvbnN0IHBpbGxJY29uID0geyBzaGlwcGVkOiBJLmNoZWNrLCByZWFkeTogSS5jaGVjaywgYmxvY2tlZDogSS5sb2NrLCBwcmludGVkOiBJLnByaW50LCB3YWl0aW5nOiBJLmNsb2NrLCBlcnJvcjogSS53YXJuLCBjYW5jZWxsZWQ6IEkueCB9OwoKbGV0IG1lID0gbnVsbCwgdGFiID0gbnVsbCwgb3JkZXJzID0gW10sIHNlbGxlcnMgPSBbXSwgc2VsZWN0ZWQgPSBuZXcgU2V0KCksIGtub3duUmVhZHkgPSBuZXcgU2V0KCksIGZpcnN0TG9hZCA9IHRydWU7CmNvbnN0IHVpID0geyBicGY6ICdhbGwnLCBiZGY6ICdhbGwnLCBzaGlwRGF5OiAndG9kYXknLCB0YWI6ICd0b2RheScsIG1rOiAnYWxsJywgc2VsbGVyczogbmV3IFNldCgpLCBxOiAnJywgYWRtaW5TZWxsZXI6IHN0b3JlLmdldCgnYWRtaW5TZWxsZXInLCBudWxsKSB9OwoKZnVuY3Rpb24gdG9hc3QobXNnLCBtcyA9IDI4MDApIHsgY29uc3QgdCA9ICQoJyN0b2FzdCcpOyB0LnRleHRDb250ZW50ID0gbXNnOyB0LmhpZGRlbiA9IGZhbHNlOyBjbGVhclRpbWVvdXQodC5fdCk7IHQuX3QgPSBzZXRUaW1lb3V0KCgpID0+IHQuaGlkZGVuID0gdHJ1ZSwgbXMpOyB9CmFzeW5jIGZ1bmN0aW9uIGFwaShwYXRoLCBvcHRzID0ge30pIHsKICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaChwYXRoLCB7IGNyZWRlbnRpYWxzOiAnc2FtZS1vcmlnaW4nLCAuLi5vcHRzLCBoZWFkZXJzOiB7ICdjb250ZW50LXR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsIC4uLihvcHRzLmhlYWRlcnMgfHwge30pIH0sIGJvZHk6IG9wdHMuYm9keSAmJiB0eXBlb2Ygb3B0cy5ib2R5ICE9PSAnc3RyaW5nJyA/IEpTT04uc3RyaW5naWZ5KG9wdHMuYm9keSkgOiBvcHRzLmJvZHkgfSk7CiAgaWYgKHJlcy5zdGF0dXMgPT09IDQwMSAmJiAhcGF0aC5pbmNsdWRlcygnL2xvZ2luJykpIHsgbWUgPSBudWxsOyByZW5kZXJMb2dpbigpOyB0aHJvdyBuZXcgRXJyb3IoJ1Nlc2nDs24gdmVuY2lkYScpOyB9CiAgY29uc3QgY3QgPSByZXMuaGVhZGVycy5nZXQoJ2NvbnRlbnQtdHlwZScpIHx8ICcnOwogIGlmICghcmVzLm9rKSB7IGNvbnN0IGUgPSBjdC5pbmNsdWRlcygnanNvbicpID8gKGF3YWl0IHJlcy5qc29uKCkpLmVycm9yIDogYXdhaXQgcmVzLnRleHQoKTsgdGhyb3cgbmV3IEVycm9yKGUgfHwgJ0Vycm9yJyk7IH0KICByZXR1cm4gY3QuaW5jbHVkZXMoJ2pzb24nKSA/IHJlcy5qc29uKCkgOiByZXM7Cn0KZnVuY3Rpb24gc2VsbGVyUVMoKSB7IHJldHVybiBtZS51c2VyLnJvbGUgPT09ICdhZG1pbicgJiYgdWkuYWRtaW5TZWxsZXIgPyBgP3NlbGxlcl9pZD0ke3VpLmFkbWluU2VsbGVyfWAgOiAnJzsgfQpmdW5jdGlvbiBmbXRUaW1lKHMpIHsgaWYgKCFzKSByZXR1cm4gJyc7IGNvbnN0IGQgPSBuZXcgRGF0ZShzLmluY2x1ZGVzKCdUJykgPyBzIDogcy5yZXBsYWNlKCcgJywgJ1QnKSArICdaJyk7IHJldHVybiBkLnRvTG9jYWxlU3RyaW5nKCdlcy1DTCcsIHsgZGF5OiAnMi1kaWdpdCcsIG1vbnRoOiAnMi1kaWdpdCcsIGhvdXI6ICcyLWRpZ2l0JywgbWludXRlOiAnMi1kaWdpdCcgfSk7IH0KCi8vIC0tLS0tLS0tLS0gaWx1c3RyYWNpb25lcyAtLS0tLS0tLS0tCmNvbnN0IEhFUk9fU1ZHID0gYDxzdmcgdmlld0JveD0iMCAwIDUyMCAyMzAiIGFyaWEtaGlkZGVuPSJ0cnVlIj4KPHJlY3Qgd2lkdGg9IjUyMCIgaGVpZ2h0PSIyMzAiIHJ4PSIyNiIgZmlsbD0idmFyKC0tYmcyKSIvPgo8ZyBmb250LWZhbWlseT0iQmFsb28gMiwgc2Fucy1zZXJpZiIgZm9udC13ZWlnaHQ9IjgwMCIgZm9udC1zaXplPSIxNCIgdGV4dC1hbmNob3I9Im1pZGRsZSI+CjxyZWN0IHg9IjIyIiB5PSIyNiIgd2lkdGg9IjExMiIgaGVpZ2h0PSI0NCIgcng9IjEyIiBmaWxsPSJ2YXIoLS1tbCkiLz48dGV4dCB4PSI3OCIgeT0iNTMiIGZpbGw9InZhcigtLW1sLWluaykiPk1lcmNhZG8gTGlicmU8L3RleHQ+CjxyZWN0IHg9IjIyIiB5PSI5MyIgd2lkdGg9IjExMiIgaGVpZ2h0PSI0NCIgcng9IjEyIiBmaWxsPSJ2YXIoLS1mYSkiLz48dGV4dCB4PSI3OCIgeT0iMTIwIiBmaWxsPSJ2YXIoLS1mYS1pbmspIj5GYWxhYmVsbGE8L3RleHQ+CjxyZWN0IHg9IjIyIiB5PSIxNjAiIHdpZHRoPSIxMTIiIGhlaWdodD0iNDQiIHJ4PSIxMiIgZmlsbD0idmFyKC0tcGEpIi8+PHRleHQgeD0iNzgiIHk9IjE4NyIgZmlsbD0iI2ZmZiI+UGFyaXM8L3RleHQ+PC9nPgo8ZyBzdHJva2U9InZhcigtLXNreSkiIHN0cm9rZS13aWR0aD0iMyIgZmlsbD0ibm9uZSIgc3Ryb2tlLWRhc2hhcnJheT0iNiA3IiBzdHJva2UtbGluZWNhcD0icm91bmQiPjxwYXRoIGQ9Ik0xMzQgNDggQyAxNzUgNDgsIDE3NSAxMTUsIDIxMCAxMTUiLz48cGF0aCBkPSJNMTM0IDExNSBIMjEwIi8+PHBhdGggZD0iTTEzNCAxODIgQyAxNzUgMTgyLCAxNzUgMTE1LCAyMTAgMTE1Ii8+PC9nPgo8cmVjdCB4PSIyMTAiIHk9IjcwIiB3aWR0aD0iMTA0IiBoZWlnaHQ9IjkwIiByeD0iMjAiIGZpbGw9InZhcigtLWFjY2VudCkiLz4KPHJlY3QgeD0iMjI2IiB5PSI4OCIgd2lkdGg9IjcyIiBoZWlnaHQ9IjEyIiByeD0iNiIgZmlsbD0iI2ZmZiIgb3BhY2l0eT0iLjkiLz48cmVjdCB4PSIyMjYiIHk9IjEwNyIgd2lkdGg9IjUyIiBoZWlnaHQ9IjEwIiByeD0iNSIgZmlsbD0iI2ZmZiIgb3BhY2l0eT0iLjYiLz4KPGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMjMyLDEyNikiPjxyZWN0IHdpZHRoPSIyMiIgaGVpZ2h0PSIyMiIgcng9IjYiIGZpbGw9IiNmZmYiLz48cGF0aCBkPSJNNiAxMWw0IDQgNy04IiBzdHJva2U9InZhcigtLW9rKSIgc3Ryb2tlLXdpZHRoPSIzIiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48L2c+CjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDI2NCwxMjYpIj48cmVjdCB3aWR0aD0iMjIiIGhlaWdodD0iMjIiIHJ4PSI2IiBmaWxsPSIjZmZmIi8+PHJlY3QgeD0iNiIgeT0iMTAiIHdpZHRoPSIxMCIgaGVpZ2h0PSI4IiByeD0iMiIgZmlsbD0idmFyKC0tbG9jaykiLz48cGF0aCBkPSJNOCAxMFY4YTMgMyAwIDAxNiAwdjIiIHN0cm9rZT0idmFyKC0tbG9jaykiIHN0cm9rZS13aWR0aD0iMiIgZmlsbD0ibm9uZSIvPjwvZz4KPHBhdGggZD0iTTMxNCAxMTUgSDM1NiIgc3Ryb2tlPSJ2YXIoLS1za3kpIiBzdHJva2Utd2lkdGg9IjMiIHN0cm9rZS1kYXNoYXJyYXk9IjYgNyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CjxwYXRoIGQ9Ik0zNjIgOTggTDQyNCA3MCBMNDg2IDk4IFYxNzggSDM2MiBaIiBmaWxsPSJ2YXIoLS1zdXJmYWNlKSIgc3Ryb2tlPSJ2YXIoLS1saW5lKSIgc3Ryb2tlLXdpZHRoPSIyIi8+CjxyZWN0IHg9IjM4OCIgeT0iMTI0IiB3aWR0aD0iNzIiIGhlaWdodD0iNTQiIHJ4PSI0IiBmaWxsPSJ2YXIoLS1pY2UpIi8+CjxnIGZpbGw9InZhcigtLXNreSkiPjxyZWN0IHg9IjM5NiIgeT0iMTQ0IiB3aWR0aD0iMjQiIGhlaWdodD0iMTYiIHJ4PSIyIi8+PHJlY3QgeD0iNDI0IiB5PSIxNDQiIHdpZHRoPSIyNCIgaGVpZ2h0PSIxNiIgcng9IjIiLz48cmVjdCB4PSI0MTAiIHk9IjEzMCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjE0IiByeD0iMiIvPjwvZz4KPGcgY2xhc3M9InRydWNrIj48cmVjdCB4PSIzNzIiIHk9IjE4OCIgd2lkdGg9IjU4IiBoZWlnaHQ9IjI0IiByeD0iNSIgZmlsbD0idmFyKC0tYWNjZW50LXN0cm9uZykiLz48cGF0aCBkPSJNNDMwIDE5NCBoMTggbDEwIDEwIHY4IGgtMjh6IiBmaWxsPSJ2YXIoLS1hY2NlbnQpIi8+PGNpcmNsZSBjeD0iMzg4IiBjeT0iMjE0IiByPSI2IiBmaWxsPSJ2YXIoLS1pbmspIi8+PGNpcmNsZSBjeD0iNDQ2IiBjeT0iMjE0IiByPSI2IiBmaWxsPSJ2YXIoLS1pbmspIi8+PC9nPjwvc3ZnPmA7CmNvbnN0IEVNUFRZX1NWRyA9IGA8c3ZnIHZpZXdCb3g9IjAgMCAxNDAgMTAwIiBhcmlhLWhpZGRlbj0idHJ1ZSI+PHJlY3QgeD0iMjAiIHk9IjMwIiB3aWR0aD0iMTAwIiBoZWlnaHQ9IjYyIiByeD0iMTAiIGZpbGw9InZhcigtLWljZSkiLz48cGF0aCBkPSJNMjAgNDZoMTAwIiBzdHJva2U9InZhcigtLXNreSkiIHN0cm9rZS13aWR0aD0iMyIvPjxyZWN0IHg9IjM2IiB5PSI1OCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjciIHJ4PSIzLjUiIGZpbGw9InZhcigtLXNreSkiLz48cmVjdCB4PSIzNiIgeT0iNzEiIHdpZHRoPSIyNiIgaGVpZ2h0PSI3IiByeD0iMy41IiBmaWxsPSJ2YXIoLS1za3kpIiBvcGFjaXR5PSIuNiIvPjxjaXJjbGUgY3g9IjEwNCIgY3k9IjIyIiByPSIxNCIgZmlsbD0idmFyKC0tb2spIi8+PHBhdGggZD0iTTk3IDIybDUgNSA5LTEwIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iMy40IiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48L3N2Zz5gOwpjb25zdCBSVUxFX1NWRyA9IGA8c3ZnIHZpZXdCb3g9IjAgMCAxMzAgODAiIGFyaWEtaGlkZGVuPSJ0cnVlIj48cmVjdCB4PSI0IiB5PSIxMCIgd2lkdGg9Ijc4IiBoZWlnaHQ9IjYyIiByeD0iMTAiIGZpbGw9InZhcigtLXN1cmZhY2UpIiBzdHJva2U9InZhcigtLWxpbmUpIiBzdHJva2Utd2lkdGg9IjIiLz48cmVjdCB4PSIxNCIgeT0iMjIiIHdpZHRoPSI0NCIgaGVpZ2h0PSI4IiByeD0iNCIgZmlsbD0idmFyKC0tb2spIi8+PHJlY3QgeD0iMTQiIHk9IjM2IiB3aWR0aD0iNDQiIGhlaWdodD0iOCIgcng9IjQiIGZpbGw9InZhcigtLW9rKSIvPjxyZWN0IHg9IjE0IiB5PSI1MCIgd2lkdGg9IjQ0IiBoZWlnaHQ9IjgiIHJ4PSI0IiBmaWxsPSJ2YXIoLS1sb2NrKSIvPjxwYXRoIGQ9Ik04OCA0MWgxNCIgc3Ryb2tlPSJ2YXIoLS1tdXRlZCkiIHN0cm9rZS13aWR0aD0iMi41IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48cGF0aCBkPSJNOTggMzZsNSA1LTUgNSIgc3Ryb2tlPSJ2YXIoLS1tdXRlZCkiIHN0cm9rZS13aWR0aD0iMi41IiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48cmVjdCB4PSIxMDYiIHk9IjI4IiB3aWR0aD0iMjAiIGhlaWdodD0iMjYiIHJ4PSI1IiBmaWxsPSJ2YXIoLS1sb2NrKSIvPjxyZWN0IHg9IjExMSIgeT0iNDAiIHdpZHRoPSIxMCIgaGVpZ2h0PSI5IiByeD0iMiIgZmlsbD0iI2ZmZiIvPjxwYXRoIGQ9Ik0xMTMgNDB2LTNhMyAzIDAgMDE2IDB2MyIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjIiIGZpbGw9Im5vbmUiLz48L3N2Zz5gOwoKLy8gLS0tLS0tLS0tLSBsb2dpbiAtLS0tLS0tLS0tCmZ1bmN0aW9uIHJlbmRlckxvZ2luKGRlbW8pIHsKICAkKCcjYXBwJykuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9ImxvZ2luIj48ZGl2IGNsYXNzPSJjYXJkIj4KICAgIDxkaXYgY2xhc3M9ImFydCI+JHtIRVJPX1NWR308L2Rpdj4KICAgIDxmb3JtIGlkPSJsb2dpbkZvcm0iPgogICAgICA8aDE+RXRpcXVldGFIdWI8L2gxPgogICAgICA8cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJtYXJnaW46MCI+RXRpcXVldGFzIGRlIE1lcmNhZG8gTGlicmUsIEZhbGFiZWxsYSB5IFBhcmlzIGVuIHVuYSBzb2xhIGJhbmRlamEuPC9wPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPkNvcnJlbzxpbnB1dCB0eXBlPSJlbWFpbCIgaWQ9ImxFbWFpbCIgYXV0b2NvbXBsZXRlPSJ1c2VybmFtZSIgcmVxdWlyZWQ+PC9sYWJlbD4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5Db250cmFzZcOxYTxpbnB1dCB0eXBlPSJwYXNzd29yZCIgaWQ9ImxQYXNzIiBhdXRvY29tcGxldGU9ImN1cnJlbnQtcGFzc3dvcmQiIHJlcXVpcmVkPjwvbGFiZWw+CiAgICAgIDxkaXYgY2xhc3M9ImVyciIgaWQ9ImxFcnIiPjwvZGl2PgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIHR5cGU9InN1Ym1pdCI+RW50cmFyPC9idXR0b24+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSIgdHlwZT0iYnV0dG9uIiBpZD0iZm9yZ290Ij7Cv09sdmlkYXN0ZSB0dSBjb250cmFzZcOxYT88L2J1dHRvbj4KICAgICAgPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjA7Zm9udC1zaXplOjEyLjVweDt0ZXh0LWFsaWduOmNlbnRlciI+wr9UaWVuZXMgdW5hIGNsYXZlIGRlIHJlc3BhbGRvIChSU1At4oCmKT8gRXNjcsOtYmVsYSBlbiBDb250cmFzZcOxYS48L3A+CiAgICAgICR7ZGVtbyA/ICc8ZGl2IGNsYXNzPSJkZW1vLWhpbnQiPk1vZG8gZGVtbzogZW50cmEgY29uIDxiPmJvZGVnYUBkZW1vLmNsPC9iPiwgPGI+dmVuZGVkb3IxQGRlbW8uY2w8L2I+IG8gPGI+YWRtaW5AZGVtby5jbDwvYj4sIGNsYXZlIDxiPmRlbW8xMjM0PC9iPi48L2Rpdj4nIDogJyd9CiAgICA8L2Zvcm0+PC9kaXY+PC9kaXY+YDsKICAkKCcjbG9naW5Gb3JtJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgIGUucHJldmVudERlZmF1bHQoKTsKICAgICQoJyNsRXJyJykudGV4dENvbnRlbnQgPSAnJzsKICAgIHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9sb2dpbicsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgZW1haWw6ICQoJyNsRW1haWwnKS52YWx1ZSwgcGFzc3dvcmQ6ICQoJyNsUGFzcycpLnZhbHVlIH0gfSk7IGJvb3QoKTsgfQogICAgY2F0Y2ggKGVycikgeyAkKCcjbEVycicpLnRleHRDb250ZW50ID0gZXJyLm1lc3NhZ2U7IH0KICB9OwogICQoJyNmb3Jnb3QnKS5vbmNsaWNrID0gKCkgPT4gcmVuZGVyRm9yZ290KCQoJyNsRW1haWwnKS52YWx1ZSk7Cn0KCi8vIFJlY3VwZXJhciBjb250cmFzZcOxYTogY29ycmVvIC0+IGPDs2RpZ28gZGUgNiBkw61naXRvcyAtPiBlbnRyYXIgbyBjYW1iaWFyIGNvbnRyYXNlw7FhCmZ1bmN0aW9uIHJlbmRlckZvcmdvdChwcmVmaWxsID0gJycpIHsKICBsZXQgZW1haWwgPSBwcmVmaWxsLCBjb2RlID0gJyc7CiAgY29uc3Qgc2hlbGwgPSBpbm5lciA9PiB7ICQoJyNhcHAnKS5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz0ibG9naW4iPjxkaXYgY2xhc3M9ImNhcmQiPjxkaXYgY2xhc3M9ImFydCI+JHtIRVJPX1NWR308L2Rpdj48Zm9ybSBpZD0iZkZvcm0iPiR7aW5uZXJ9PGRpdiBjbGFzcz0iZXJyIiBpZD0iZkVyciI+PC9kaXY+PC9mb3JtPjwvZGl2PjwvZGl2PmA7IH07CiAgY29uc3QgYmFjayA9ICgpID0+IHsgY29uc3QgYiA9ICQoJyNmQmFjaycpOyBpZiAoYikgYi5vbmNsaWNrID0gKCkgPT4gcmVuZGVyTG9naW4oKTsgfTsKICBjb25zdCBlcnIgPSBtID0+IHsgJCgnI2ZFcnInKS50ZXh0Q29udGVudCA9IG07IH07CiAgZnVuY3Rpb24gc3RlcEVtYWlsKCkgewogICAgc2hlbGwoYDxoMT5SZWN1cGVyYXIgYWNjZXNvPC9oMT48cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJtYXJnaW46MCI+RXNjcmliZSB0dSBjb3JyZW8geSB0ZSBlbnZpYXJlbW9zIHVuIGPDs2RpZ28gZGUgNiBkw61naXRvcy48L3A+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+Q29ycmVvPGlucHV0IHR5cGU9ImVtYWlsIiBpZD0iZkVtYWlsIiBhdXRvY29tcGxldGU9InVzZXJuYW1lIiByZXF1aXJlZCB2YWx1ZT0iJHtlc2MoZW1haWwpfSI+PC9sYWJlbD4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiPkVudmlhciBjw7NkaWdvPC9idXR0b24+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIiB0eXBlPSJidXR0b24iIGlkPSJmQmFjayI+Vm9sdmVyPC9idXR0b24+YCk7CiAgICBiYWNrKCk7CiAgICAkKCcjZkZvcm0nKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4gewogICAgICBlLnByZXZlbnREZWZhdWx0KCk7IGVtYWlsID0gJCgnI2ZFbWFpbCcpLnZhbHVlLnRyaW0oKTsKICAgICAgY29uc3QgYiA9IGUuc3VibWl0dGVyOyBpZiAoYikgYi5kaXNhYmxlZCA9IHRydWU7CiAgICAgIHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9wYXNzd29yZC9mb3Jnb3QnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGVtYWlsIH0gfSk7IHN0ZXBDb2RlKCk7IH0KICAgICAgY2F0Y2ggKHgpIHsgZXJyKHgubWVzc2FnZSk7IGlmIChiKSBiLmRpc2FibGVkID0gZmFsc2U7IH0KICAgIH07CiAgfQogIGZ1bmN0aW9uIHN0ZXBDb2RlKCkgewogICAgc2hlbGwoYDxoMT5SZXZpc2EgdHUgY29ycmVvPC9oMT48cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJtYXJnaW46MCI+U2kgPGI+JHtlc2MoZW1haWwpfTwvYj4gZXN0w6EgcmVnaXN0cmFkbywgdGUgbGxlZ8OzIHVuIGPDs2RpZ28gZGUgNiBkw61naXRvcy4gVmVuY2UgZW4gMTUgbWludXRvcy4gUmV2aXNhIHRhbWJpw6luIGxhIGNhcnBldGEgZGUgc3BhbS48L3A+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+Q8OzZGlnbzxpbnB1dCB0eXBlPSJ0ZXh0IiBpZD0iZkNvZGUiIGlucHV0bW9kZT0ibnVtZXJpYyIgYXV0b2NvbXBsZXRlPSJvbmUtdGltZS1jb2RlIiBtYXhsZW5ndGg9IjYiIHBhdHRlcm49IlswLTldezZ9IiByZXF1aXJlZCBzdHlsZT0iZm9udC1mYW1pbHk6dmFyKC0tbW9ubyk7Zm9udC1zaXplOjI0cHg7bGV0dGVyLXNwYWNpbmc6OHB4O3RleHQtYWxpZ246Y2VudGVyIj48L2xhYmVsPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIHR5cGU9InN1Ym1pdCI+Q29udGludWFyPC9idXR0b24+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSIgdHlwZT0iYnV0dG9uIiBpZD0iZlJlc2VuZCI+RW52aWFyIG90cm8gY8OzZGlnbzwvYnV0dG9uPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSIgdHlwZT0iYnV0dG9uIiBpZD0iZkJhY2siPlZvbHZlcjwvYnV0dG9uPmApOwogICAgYmFjaygpOwogICAgJCgnI2ZDb2RlJykuZm9jdXMoKTsKICAgICQoJyNmUmVzZW5kJykub25jbGljayA9IGFzeW5jICgpID0+IHsgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL3Bhc3N3b3JkL2ZvcmdvdCcsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgZW1haWwgfSB9KTsgdG9hc3QoJ0PDs2RpZ28gcmVlbnZpYWRvJyk7IH0gY2F0Y2ggKHgpIHsgZXJyKHgubWVzc2FnZSk7IH0gfTsKICAgICQoJyNmRm9ybScpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICAgIGUucHJldmVudERlZmF1bHQoKTsgY29kZSA9ICQoJyNmQ29kZScpLnZhbHVlLnRyaW0oKTsKICAgICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL3Bhc3N3b3JkL2NoZWNrJywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBlbWFpbCwgY29kZSB9IH0pOyBzdGVwQ2hvb3NlKCk7IH0KICAgICAgY2F0Y2ggKHgpIHsgZXJyKHgubWVzc2FnZSk7IH0KICAgIH07CiAgfQogIGZ1bmN0aW9uIHN0ZXBDaG9vc2UoKSB7CiAgICBzaGVsbChgPGgxPkPDs2RpZ28gY29ycmVjdG88L2gxPjxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9Im1hcmdpbjowIj7Cv1F1w6kgcXVpZXJlcyBoYWNlcj88L3A+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgdHlwZT0iYnV0dG9uIiBpZD0iZkxvZ2luIj5FbnRyYXIgYWhvcmE8L2J1dHRvbj4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1naG9zdCIgdHlwZT0iYnV0dG9uIiBpZD0iZkNoYW5nZSI+Q2FtYmlhciBtaSBjb250cmFzZcOxYTwvYnV0dG9uPmApOwogICAgJCgnI2ZMb2dpbicpLm9uY2xpY2sgPSBhc3luYyAoKSA9PiB7IHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9wYXNzd29yZC9sb2dpbicsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgZW1haWwsIGNvZGUgfSB9KTsgYm9vdCgpOyB9IGNhdGNoICh4KSB7IGVycih4Lm1lc3NhZ2UpOyB9IH07CiAgICAkKCcjZkNoYW5nZScpLm9uY2xpY2sgPSBzdGVwTmV3OwogIH0KICBmdW5jdGlvbiBzdGVwTmV3KCkgewogICAgc2hlbGwoYDxoMT5OdWV2YSBjb250cmFzZcOxYTwvaDE+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+TnVldmEgY29udHJhc2XDsWEgKG3DrW5pbW8gOCk8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJmUDEiIGF1dG9jb21wbGV0ZT0ibmV3LXBhc3N3b3JkIiBtaW5sZW5ndGg9IjgiIHJlcXVpcmVkPjwvbGFiZWw+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+UmVww610ZWxhPGlucHV0IHR5cGU9InBhc3N3b3JkIiBpZD0iZlAyIiBhdXRvY29tcGxldGU9Im5ldy1wYXNzd29yZCIgbWlubGVuZ3RoPSI4IiByZXF1aXJlZD48L2xhYmVsPgogICAgICA8bGFiZWwgY2xhc3M9InN3aXRjaCIgc3R5bGU9ImZvbnQtc2l6ZToxM3B4Ij48aW5wdXQgdHlwZT0iY2hlY2tib3giIGlkPSJmU2hvdyI+IE1vc3RyYXIgY29udHJhc2XDsWE8L2xhYmVsPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIHR5cGU9InN1Ym1pdCI+R3VhcmRhciB5IGVudHJhcjwvYnV0dG9uPmApOwogICAgJCgnI2ZTaG93Jykub25jaGFuZ2UgPSBlID0+IHsgJCgnI2ZQMScpLnR5cGUgPSAkKCcjZlAyJykudHlwZSA9IGUudGFyZ2V0LmNoZWNrZWQgPyAndGV4dCcgOiAncGFzc3dvcmQnOyB9OwogICAgJCgnI2ZGb3JtJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpOwogICAgICBpZiAoJCgnI2ZQMScpLnZhbHVlICE9PSAkKCcjZlAyJykudmFsdWUpIHJldHVybiBlcnIoJ0xhcyBjb250cmFzZcOxYXMgbm8gY29pbmNpZGVuJyk7CiAgICAgIHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9wYXNzd29yZC9yZXNldCcsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgZW1haWwsIGNvZGUsIHBhc3N3b3JkOiAkKCcjZlAxJykudmFsdWUgfSB9KTsgdG9hc3QoJ0NvbnRyYXNlw7FhIGFjdHVhbGl6YWRhJyk7IGJvb3QoKTsgfQogICAgICBjYXRjaCAoeCkgeyBlcnIoeC5tZXNzYWdlKTsgfQogICAgfTsKICB9CiAgc3RlcEVtYWlsKCk7Cn0KCmZ1bmN0aW9uIHJlbmRlclNldHVwKCkgewogICQoJyNhcHAnKS5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz0ibG9naW4iPjxkaXYgY2xhc3M9ImNhcmQiPgogICAgPGRpdiBjbGFzcz0iYXJ0Ij4ke0hFUk9fU1ZHfTwvZGl2PgogICAgPGZvcm0gaWQ9InNldHVwRm9ybSI+CiAgICAgIDxoMT5CaWVudmVuaWRvPC9oMT4KICAgICAgPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjAiPkNyZWEgbGEgY3VlbnRhIGRlIGFkbWluaXN0cmFkb3IuIENvbiBlbGxhIGFncmVnYXMgdmVuZGVkb3JlcywgdXN1YXJpb3MgeSBsYSBjb25leGnDs24gYSBNZXJjYWRvIExpYnJlLjwvcD4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5UdSBub21icmU8aW5wdXQgdHlwZT0idGV4dCIgaWQ9InNOYW1lIiByZXF1aXJlZD48L2xhYmVsPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPkNvcnJlbzxpbnB1dCB0eXBlPSJlbWFpbCIgaWQ9InNFbWFpbCIgYXV0b2NvbXBsZXRlPSJ1c2VybmFtZSIgcmVxdWlyZWQ+PC9sYWJlbD4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5Db250cmFzZcOxYSAobcOtbmltbyA4KTxpbnB1dCB0eXBlPSJwYXNzd29yZCIgaWQ9InNQYXNzIiBhdXRvY29tcGxldGU9Im5ldy1wYXNzd29yZCIgbWlubGVuZ3RoPSI4IiByZXF1aXJlZD48L2xhYmVsPgogICAgICA8bGFiZWwgY2xhc3M9InN3aXRjaCIgc3R5bGU9ImZvbnQtc2l6ZToxM3B4Ij48aW5wdXQgdHlwZT0iY2hlY2tib3giIGlkPSJzU2hvdyI+IE1vc3RyYXIgY29udHJhc2XDsWE8L2xhYmVsPgogICAgICA8ZGl2IGNsYXNzPSJlcnIiIGlkPSJzRXJyIj48L2Rpdj4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiPkNyZWFyIGFkbWluaXN0cmFkb3I8L2J1dHRvbj4KICAgIDwvZm9ybT48L2Rpdj48L2Rpdj5gOwogICQoJyNzU2hvdycpLm9uY2hhbmdlID0gZSA9PiB7ICQoJyNzUGFzcycpLnR5cGUgPSBlLnRhcmdldC5jaGVja2VkID8gJ3RleHQnIDogJ3Bhc3N3b3JkJzsgfTsKICAkKCcjc2V0dXBGb3JtJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgIGUucHJldmVudERlZmF1bHQoKTsKICAgIHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9zZXR1cCcsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgbmFtZTogJCgnI3NOYW1lJykudmFsdWUsIGVtYWlsOiAkKCcjc0VtYWlsJykudmFsdWUsIHBhc3N3b3JkOiAkKCcjc1Bhc3MnKS52YWx1ZSB9IH0pOyBib290KCk7IH0KICAgIGNhdGNoIChlcnIpIHsgJCgnI3NFcnInKS50ZXh0Q29udGVudCA9IGVyci5tZXNzYWdlOyB9CiAgfTsKfQoKLy8gLS0tLS0tLS0tLSBlc3RydWN0dXJhIC0tLS0tLS0tLS0KZnVuY3Rpb24gdGFic0Zvcihyb2xlKSB7CiAgaWYgKHJvbGUgPT09ICdzZWxsZXInKSByZXR1cm4gW1sndHJheScsICdNaXMgZXRpcXVldGFzJ10sIFsnc2FsZXMnLCAnTWlzIHZlbnRhcyddLCBbJ3VuaXRzJywgJ1Byb2R1Y3RvcyB2ZW5kaWRvcyddLCBbJ3NlbGxlcicsICdNaSBjdWVudGEnXV07CiAgaWYgKHJvbGUgPT09ICdmdWxmaWxsbWVudCcpIHJldHVybiBbWyd0cmF5JywgJ0JhbmRlamEgZGUgZXRpcXVldGFzJ10sIFsndW5pdHMnLCAnUHJvZHVjdG9zIHZlbmRpZG9zJ10sIFsnc2VsbGVyc1ZpZXcnLCAnVmVuZGVkb3JlcyddXTsKICByZXR1cm4gW1sndHJheScsICdCYW5kZWphJ10sIFsnc2FsZXMnLCAnVmVudGFzJ10sIFsndW5pdHMnLCAnUHJvZHVjdG9zIHZlbmRpZG9zJ10sIFsnc2VsbGVyJywgJ1ZlbmRlZG9yZXMnXSwgWydhZG1pbicsICdVc3VhcmlvcyB5IGFqdXN0ZXMnXV07Cn0KZnVuY3Rpb24gcmVuZGVyU2hlbGwoKSB7CiAgY29uc3QgdGFicyA9IHRhYnNGb3IobWUudXNlci5yb2xlKTsKICBpZiAoIXRhYiB8fCAhdGFicy5zb21lKHQgPT4gdFswXSA9PT0gdGFiKSkgdGFiID0gc3RvcmUuZ2V0KCd0YWInLCB0YWJzWzBdWzBdKTsKICBpZiAoIXRhYnMuc29tZSh0ID0+IHRbMF0gPT09IHRhYikpIHRhYiA9IHRhYnNbMF1bMF07CiAgJCgnI2FwcCcpLmlubmVySFRNTCA9IGAKICA8aGVhZGVyIGNsYXNzPSJ0b3AiPjxkaXYgY2xhc3M9IndyYXAiPgogICAgPGEgY2xhc3M9ImJyYW5kIiBocmVmPSIvIj48aW1nIHNyYz0iL2xvZ28uc3ZnIiBhbHQ9IiI+RXRpcXVldGFIdWI8L2E+CiAgICAke3RhYnMubGVuZ3RoID4gMSA/IGA8bmF2IGNsYXNzPSJuYXYiPiR7dGFicy5tYXAoKFtrLCBuXSkgPT4gYDxidXR0b24gZGF0YS10YWI9IiR7a30iIGFyaWEtY3VycmVudD0iJHtrID09PSB0YWJ9Ij4ke259PC9idXR0b24+YCkuam9pbignJyl9PC9uYXY+YCA6ICcnfQogICAgPHNwYW4gY2xhc3M9InNwYWNlciI+PC9zcGFuPgogICAgPHNwYW4gY2xhc3M9ImxpdmUiIGlkPSJsaXZlIj48aT48L2k+PHNwYW4+Q29uZWN0YW5kb+KApjwvc3Bhbj48L3NwYW4+CiAgICA8ZGl2IGNsYXNzPSJjbG9jayIgaWQ9ImNsb2NrIj4ke0kuY2xvY2sucmVwbGFjZSgnPHN2ZycsICc8c3ZnIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgc3R5bGU9ImNvbG9yOnZhcigtLWFjY2VudCkiJyl9PGRpdj48c21hbGw+Q29ydGUgJHtlc2MobWUuY3V0b2ZmKX08L3NtYWxsPjxiIGlkPSJjZCI+LS06LS06LS08L2I+PC9kaXY+PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJ1c2VyIj48ZGl2PjxiPiR7ZXNjKG1lLnNlbGxlcj8ubmFtZSB8fCBtZS51c2VyLm5hbWUpfTwvYj48c21hbGw+JHtlc2MobWUudXNlci5lbWFpbCl9PC9zbWFsbD48L2Rpdj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBpZD0ibXlBY2MiPk1pIGNsYXZlPC9idXR0b24+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgaWQ9ImxvZ291dCI+U2FsaXI8L2J1dHRvbj48L2Rpdj4KICA8L2Rpdj48L2hlYWRlcj4KICA8bWFpbiBjbGFzcz0id3JhcCIgaWQ9Im1haW4iPjwvbWFpbj5gOwogICQkKCcubmF2IGJ1dHRvbicpLmZvckVhY2goYiA9PiBiLm9uY2xpY2sgPSAoKSA9PiB7IHRhYiA9IGIuZGF0YXNldC50YWI7IHN0b3JlLnNldCgndGFiJywgdGFiKTsgJCQoJy5uYXYgYnV0dG9uJykuZm9yRWFjaCh4ID0+IHguc2V0QXR0cmlidXRlKCdhcmlhLWN1cnJlbnQnLCB4ID09PSBiKSk7IHJlbmRlclRhYigpOyB9KTsKICAkKCcjbXlBY2MnKS5vbmNsaWNrID0gKCkgPT4gcmVuZGVyTXlBY2NvdW50KCk7CiAgaWYgKG1lLmltcGVyc29uYXRlZEJ5KSB7CiAgICBjb25zdCBiYXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTsKICAgIGJhci5zdHlsZS5jc3NUZXh0ID0gJ2JhY2tncm91bmQ6dmFyKC0td2Fybi1iZyk7Y29sb3I6dmFyKC0td2Fybik7Zm9udC13ZWlnaHQ6NzAwO3BhZGRpbmc6MTBweCAxNnB4O2Rpc3BsYXk6ZmxleDtnYXA6MTJweDthbGlnbi1pdGVtczpjZW50ZXI7anVzdGlmeS1jb250ZW50OmNlbnRlcjtmbGV4LXdyYXA6d3JhcCc7CiAgICBiYXIuaW5uZXJIVE1MID0gYEVzdMOhcyB2aWVuZG8gbGEgY3VlbnRhIGRlICR7ZXNjKG1lLnVzZXIubmFtZSl9ICgke2VzYyhtZS51c2VyLmVtYWlsKX0pIDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSBidG4tc20iIGlkPSJzdG9wSW1wIj5Wb2x2ZXIgYSBtaSBjdWVudGE8L2J1dHRvbj5gOwogICAgJCgnI2FwcCcpLnByZXBlbmQoYmFyKTsKICAgICQoJyNzdG9wSW1wJykub25jbGljayA9IGFzeW5jICgpID0+IHsgYXdhaXQgYXBpKCcvYXBpL2ltcGVyc29uYXRlL3N0b3AnLCB7IG1ldGhvZDogJ1BPU1QnIH0pOyBsb2NhdGlvbi5ocmVmID0gJy8nOyB9OwogIH0KICAkKCcjbG9nb3V0Jykub25jbGljayA9IGFzeW5jICgpID0+IHsgYXdhaXQgYXBpKCcvYXBpL2xvZ291dCcsIHsgbWV0aG9kOiAnUE9TVCcgfSkuY2F0Y2goKCkgPT4ge30pOyBsb2NhdGlvbi5yZWxvYWQoKTsgfTsKICBzdGFydENsb2NrKCk7IGNvbm5lY3RTdHJlYW0oKTsgcmVuZGVyVGFiKCk7IHdhdGNoVmVyc2lvbigpOwp9Ci8vIFNpIHNlIHB1YmxpY2EgdW5hIHZlcnNpw7NuIG51ZXZhIGRlIGxhIGFwcCwgbGEgcGFudGFsbGEgc2UgYWN0dWFsaXphIHNvbGEKZnVuY3Rpb24gd2F0Y2hWZXJzaW9uKCkgewogIGlmICh3YXRjaFZlcnNpb24uX2kpIHJldHVybjsKICBjb25zdCBjaGVjayA9IGFzeW5jICgpID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgdiB9ID0gYXdhaXQgZmV0Y2goJy9oZWFsdGgnLCB7IGNhY2hlOiAnbm8tc3RvcmUnIH0pLnRoZW4ociA9PiByLmpzb24oKSk7CiAgICAgIGlmICghd2F0Y2hWZXJzaW9uLnYpIHdhdGNoVmVyc2lvbi52ID0gdjsKICAgICAgZWxzZSBpZiAodiAmJiB2ICE9PSB3YXRjaFZlcnNpb24udiAmJiAhZG9jdW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQ6Zm9jdXMsIHRleHRhcmVhOmZvY3VzJykpIGxvY2F0aW9uLnJlbG9hZCgpOwogICAgfSBjYXRjaCB7fQogIH07CiAgY2hlY2soKTsgd2F0Y2hWZXJzaW9uLl9pID0gc2V0SW50ZXJ2YWwoY2hlY2ssIDYwMDAwKTsKfQpmdW5jdGlvbiByZW5kZXJUYWIoKSB7ICh7IHRyYXk6IHJlbmRlclRyYXksIHNlbGxlcjogcmVuZGVyU2VsbGVyLCBhZG1pbjogcmVuZGVyQWRtaW4sIHNlbGxlcnNWaWV3OiByZW5kZXJTZWxsZXJzVmlldywgc2FsZXM6IHJlbmRlclNhbGVzLCB1bml0czogcmVuZGVyVW5pdHMgfSlbdGFiXSgpOyB9CgovLyBSZXN1bWVuIHZpc3VhbCBkZSB1bmlkYWRlcyAoc2VjY2nDs24gc2luIHByZWNpb3MpOiB0YXJqZXRhcywgdW5pZGFkZXMgcG9yIGTDrWEsIHRvcCBwdWJsaWNhY2lvbmVzIHkgcG9yIHZlbmRlZG9yCmZ1bmN0aW9uIHVuaXRzVml6KGQsIHJvd3MsIGZyb20sIHRvLCBhbGwpIHsKICBjb25zdCB1bml0cyA9IHJvd3MucmVkdWNlKChhLCByKSA9PiBhICsgci5xdHksIDApLCBvcmRlcnMgPSByb3dzLnJlZHVjZSgoYSwgcikgPT4gYSArIHIub3JkZXJzLCAwKTsKICBjb25zdCB0b3AgPSByb3dzWzBdOwogIGNvbnN0IG1rVG90ID0gayA9PiByb3dzLnJlZHVjZSgoYSwgcikgPT4gYSArIChyLmJ5TWtba10gfHwgMCksIDApOwogIGNvbnN0IGJhciA9IChsYWJlbCwgdmFsdWUsIG1heCwgY29sb3IsIHN1YikgPT4gYDxkaXYgY2xhc3M9ImhiIj48ZGl2IGNsYXNzPSJoYi1sIj48c3BhbiBjbGFzcz0iaGItbmFtZSI+JHtsYWJlbH08L3NwYW4+JHtzdWIgPyBgPHNtYWxsPiR7c3VifTwvc21hbGw+YCA6ICcnfTwvZGl2PjxkaXYgY2xhc3M9ImhiLXRyYWNrIj48aSBzdHlsZT0id2lkdGg6JHtNYXRoLm1heCgyLCBNYXRoLnJvdW5kKHZhbHVlIC8gbWF4ICogMTAwKSl9JTtiYWNrZ3JvdW5kOiR7Y29sb3J9Ij48L2k+PC9kaXY+PGIgY2xhc3M9ImhiLXYiPiR7dmFsdWUudG9Mb2NhbGVTdHJpbmcoJ2VzLUNMJyl9PC9iPjwvZGl2PmA7CiAgY29uc3QgdG9wMTAgPSByb3dzLnNsaWNlKDAsIDEwKSwgbWF4VG9wID0gTWF0aC5tYXgoMSwgLi4udG9wMTAubWFwKHIgPT4gci5xdHkpKTsKICBsZXQgYnlTZWxsZXIgPSAnJzsKICBpZiAoYWxsKSB7CiAgICBjb25zdCBtID0gbmV3IE1hcCgpOyByb3dzLmZvckVhY2gociA9PiBtLnNldChyLnNlbGxlciwgKG0uZ2V0KHIuc2VsbGVyKSB8fCAwKSArIHIucXR5KSk7CiAgICBjb25zdCBsaXN0ID0gWy4uLm0uZW50cmllcygpXS5zb3J0KChhLCBiKSA9PiBiWzFdIC0gYVsxXSksIG14ID0gTWF0aC5tYXgoMSwgLi4ubGlzdC5tYXAoeCA9PiB4WzFdKSk7CiAgICBieVNlbGxlciA9IGA8ZGl2IGNsYXNzPSJwYW5lbCB1di1jYXJkIj48ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj48aDI+VW5pZGFkZXMgcG9yIHZlbmRlZG9yPC9oMj48L2Rpdj48ZGl2IGNsYXNzPSJwYW5lbC1ib2R5Ij4ke2xpc3QubWFwKChbbiwgdl0pID0+IGJhcihlc2MobiksIHYsIG14LCAndmFyKC0tYWNjZW50KScsIGAke01hdGgucm91bmQodiAvIHVuaXRzICogMTAwKX0lIGRlbCB0b3RhbGApKS5qb2luKCcnKX08L2Rpdj48L2Rpdj5gOwogIH0KICByZXR1cm4gYDxkaXYgY2xhc3M9InV2Ij4KICAgIDxkaXYgY2xhc3M9InV2LWtwaXMiPgogICAgICA8ZGl2IGNsYXNzPSJrcGkga3BpLWhlcm8iPjxzbWFsbD5VbmlkYWRlcyB2ZW5kaWRhczwvc21hbGw+PGI+JHt1bml0cy50b0xvY2FsZVN0cmluZygnZXMtQ0wnKX08L2I+PHNwYW4+JHtlc2MoZm10RChmcm9tKSl9IOKAkyAke2VzYyhmbXREKHRvKSl9PC9zcGFuPjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJrcGkiPjxzbWFsbD5QZWRpZG9zPC9zbWFsbD48Yj4ke29yZGVycy50b0xvY2FsZVN0cmluZygnZXMtQ0wnKX08L2I+PHNwYW4+dmVudGFzIGNvbiBlc3RvcyBwcm9kdWN0b3M8L3NwYW4+PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9ImtwaSI+PHNtYWxsPlB1YmxpY2FjaW9uZXMgdmVuZGlkYXM8L3NtYWxsPjxiPiR7cm93cy5sZW5ndGgudG9Mb2NhbGVTdHJpbmcoJ2VzLUNMJyl9PC9iPjxzcGFuPmRpc3RpbnRhczwvc3Bhbj48L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0ia3BpIj48c21hbGw+8J+PhiBMYSBtw6FzIHZlbmRpZGE8L3NtYWxsPjxiIHN0eWxlPSJmb250LXNpemU6MTdweDtsaW5lLWhlaWdodDoxLjI1Ij4ke2VzYygodG9wPy5uYW1lIHx8ICfigJQnKS5zbGljZSgwLCA0OCkpfSR7KHRvcD8ubmFtZSB8fCAnJykubGVuZ3RoID4gNDggPyAn4oCmJyA6ICcnfTwvYj48c3Bhbj4ke3RvcCA/IHRvcC5xdHkudG9Mb2NhbGVTdHJpbmcoJ2VzLUNMJykgKyAnIHVuaWRhZGVzJyA6ICcnfTwvc3Bhbj48L2Rpdj4KICAgIDwvZGl2PgogICAgPGRpdiBjbGFzcz0idXYtbWsiPiR7WydtbCcsICdmYScsICdwYSddLm1hcChrID0+IGA8c3Bhbj48aSBjbGFzcz0iZG90IiBzdHlsZT0iYmFja2dyb3VuZDoke01LX0NPTE9SW2tdfSI+PC9pPiR7TUtba119IDxiPiR7bWtUb3QoaykudG9Mb2NhbGVTdHJpbmcoJ2VzLUNMJyl9PC9iPiB1bmlkLiA8c21hbGw+KCR7dW5pdHMgPyBNYXRoLnJvdW5kKG1rVG90KGspIC8gdW5pdHMgKiAxMDApIDogMH0lKTwvc21hbGw+PC9zcGFuPmApLmpvaW4oJycpfTwvZGl2PgogICAgPGRpdiBjbGFzcz0icGFuZWwgdXYtY2FyZCI+PGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+PGgyPlVuaWRhZGVzIHZlbmRpZGFzIHBvciBkw61hPC9oMj48ZGl2IGNsYXNzPSJsZWdlbmQiPiR7WydtbCcsICdmYScsICdwYSddLm1hcChrID0+IGA8c3Bhbj48aSBjbGFzcz0iZG90IiBzdHlsZT0iYmFja2dyb3VuZDoke01LX0NPTE9SW2tdfSI+PC9pPiR7TUtba119PC9zcGFuPmApLmpvaW4oJycpfTwvZGl2PjwvZGl2PjxkaXYgY2xhc3M9InBhbmVsLWJvZHkiPjxkaXYgY2xhc3M9ImNoLXNsb3QiIGlkPSJ1dkRheXMiIGRhdGEtaD0iMjQwIj48L2Rpdj48L2Rpdj48L2Rpdj4KICAgIDxkaXYgY2xhc3M9InV2LWdyaWQiPgogICAgICA8ZGl2IGNsYXNzPSJwYW5lbCB1di1jYXJkIj48ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj48aDI+VG9wIDEwIHB1YmxpY2FjaW9uZXM8L2gyPjxzcGFuIGNsYXNzPSJtdXRlZCI+cG9yIHVuaWRhZGVzPC9zcGFuPjwvZGl2PjxkaXYgY2xhc3M9InBhbmVsLWJvZHkiPiR7dG9wMTAubWFwKChyLCBpKSA9PiBiYXIoYDxlbSBjbGFzcz0icmsiPiR7aSArIDF9PC9lbT4ke2VzYyhyLm5hbWUpfWAsIHIucXR5LCBtYXhUb3AsIE1LX0NPTE9SW3IubWFya2V0cGxhY2VdIHx8ICd2YXIoLS1hY2NlbnQpJywgYCR7TUtbci5tYXJrZXRwbGFjZV0gfHwgJyd9JHthbGwgPyAnIMK3ICcgKyBlc2Moci5zZWxsZXIpIDogJyd9YCkpLmpvaW4oJycpfTwvZGl2PjwvZGl2PgogICAgICAke2J5U2VsbGVyfQogICAgPC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJjaC10aXAiIGlkPSJjaFRpcDIiIGhpZGRlbj48L2Rpdj4KICA8L2Rpdj5gOwp9CmZ1bmN0aW9uIGRyYXdVbml0Q2hhcnRzKGQsIGZyb20sIHRvKSB7CiAgY29uc3QgZWwgPSAkKCcjdXZEYXlzJyk7IGlmICghZWwpIHJldHVybjsKICBjb25zdCBkYXlzID0gW107IGZvciAobGV0IHggPSBuZXcgRGF0ZShmcm9tICsgJ1QxMjowMDowMCcpOyBpc28oeCkgPD0gdG8gJiYgZGF5cy5sZW5ndGggPCA0MDA7IHguc2V0RGF0ZSh4LmdldERhdGUoKSArIDEpKSBkYXlzLnB1c2goaXNvKHgpKTsKICAvLyBoYXN0YSAzMSBkw61hczogdW5hIGNvbHVtbmEgcG9yIGTDrWE7IG3DoXM6IHBvciBzZW1hbmEgKGx1bmVzKSBvIHBvciBtZXMKICBjb25zdCBtb2RlID0gZGF5cy5sZW5ndGggPD0gMzEgPyAnZGF5JyA6IGRheXMubGVuZ3RoIDw9IDEyMCA/ICd3ZWVrJyA6ICdtb250aCc7CiAgY29uc3Qga2V5T2YgPSB4ID0+IHsgaWYgKG1vZGUgPT09ICdkYXknKSByZXR1cm4geDsgY29uc3QgdCA9IG5ldyBEYXRlKHggKyAnVDEyOjAwOjAwJyk7IGlmIChtb2RlID09PSAnbW9udGgnKSByZXR1cm4geC5zbGljZSgwLCA3KTsgdC5zZXREYXRlKHQuZ2V0RGF0ZSgpIC0gKCh0LmdldERheSgpICsgNikgJSA3KSk7IHJldHVybiBpc28odCk7IH07CiAgY29uc3QgYnVja2V0cyA9IFsuLi5uZXcgU2V0KGRheXMubWFwKGtleU9mKSldOwogIGNvbnN0IHZhbCA9IChiLCBrKSA9PiBkYXlzLmZpbHRlcih4ID0+IGtleU9mKHgpID09PSBiKS5yZWR1Y2UoKGEsIHgpID0+IGEgKyAoKGQuZGFpbHkgfHwge30pW3hdPy5ba10gfHwgMCksIDApOwogIGNvbnN0IHN0YWNrcyA9IFsnbWwnLCAnZmEnLCAncGEnXS5tYXAoayA9PiAoeyBrZXk6IGssIGxhYmVsOiBNS1trXSwgY29sb3I6IE1LX0NPTE9SW2tdLCB2YWx1ZXM6IGJ1Y2tldHMubWFwKGIgPT4gKHsgYW1vdW50OiB2YWwoYiwgayksIG9yZGVyczogMCB9KSkgfSkpOwogIGNvbnN0IE1FUyA9IFsnZW5lJywgJ2ZlYicsICdtYXInLCAnYWJyJywgJ21heScsICdqdW4nLCAnanVsJywgJ2FnbycsICdzZXAnLCAnb2N0JywgJ25vdicsICdkaWMnXTsKICBjb25zdCBsYWJlbCA9IGIgPT4gbW9kZSA9PT0gJ21vbnRoJyA/IE1FU1srYi5zbGljZSg1LCA3KSAtIDFdIDogbW9kZSA9PT0gJ3dlZWsnID8gYHNlbSAkeytiLnNsaWNlKDgpfS8keytiLnNsaWNlKDUsIDcpfWAgOiBudWxsOwogIGNvbnN0IHRpdGxlID0gYiA9PiBtb2RlID09PSAnbW9udGgnID8gYCR7TUVTWytiLnNsaWNlKDUsIDcpIC0gMV19ICR7Yi5zbGljZSgwLCA0KX1gIDogbW9kZSA9PT0gJ3dlZWsnID8gYFNlbWFuYSBkZWwgJHtkYXlMb25nKGIpfWAgOiBkYXlMb25nKGIpOwogIGVsLmlubmVySFRNTCA9IGNvbHVtbkNoYXJ0KGJ1Y2tldHMsIHN0YWNrcywgeyBoZWlnaHQ6IDI0MCwgd2lkdGg6IGVsLmNsaWVudFdpZHRoIHx8IDY0MCwgdW5pdHM6IHRydWUsIHRvZGF5OiBtb2RlID09PSAnZGF5JyA/IGlzbyhuZXcgRGF0ZSgpKSA6IG51bGwsIGxhYmVsOiBtb2RlID09PSAnZGF5JyA/IG51bGwgOiBsYWJlbCwgdGl0bGUgfSk7Cn0KCi8vIC0tLS0tLS0tLS0gUFJPRFVDVE9TIFZFTkRJRE9TIChjYW50aWRhZGVzLCBzaW4gcHJlY2lvcykgcGFyYSBlbCBmdWxmaWxsbWVudCB5IGVsIGFkbWluaXN0cmFkb3IgLS0tLS0tLS0tLQphc3luYyBmdW5jdGlvbiByZW5kZXJVbml0cygpIHsKICAkKCcjbWFpbicpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJzZWN0aW9uLXRpdGxlIiBzdHlsZT0ibWFyZ2luLXRvcDoyMnB4Ij48aDI+UHJvZHVjdG9zIHZlbmRpZG9zPC9oMj48c3BhbiBjbGFzcz0ibXV0ZWQiPkNhbnRpZGFkZXMgcG9yIHB1YmxpY2FjacOzbiB5IHZhcmlhbnRlIMK3IHNpbiBwcmVjaW9zIMK3IHNpbiBsb3MgcHJvZHVjdG9zIGJsb3F1ZWFkb3M8L3NwYW4+PHNwYW4gY2xhc3M9InNwYWNlciIgc3R5bGU9ImZsZXg6MSI+PC9zcGFuPjxzcGFuIGlkPSJ1bml0c1BpY2siPjwvc3Bhbj48L2Rpdj48ZGl2IGNsYXNzPSJwYW5lbCIgaWQ9InByb2RQYW5lbCI+PC9kaXY+YDsKICB0cnkgewogICAgY29uc3QgeyBzZWxsZXJzOiBsaXN0IH0gPSBhd2FpdCBhcGkoJy9hcGkvc2VsbGVycy9saXN0Jyk7CiAgICBjb25zdCBjdXIgPSBzdG9yZS5nZXQoJ3VuaXRzU2VsbGVyJywgJycpOwogICAgJCgnI3VuaXRzUGljaycpLmlubmVySFRNTCA9IGA8c2VsZWN0IGlkPSJ1bml0c1NlbCIgc3R5bGU9IndpZHRoOmF1dG8iPjxvcHRpb24gdmFsdWU9IiI+VG9kb3MgbG9zIHZlbmRlZG9yZXM8L29wdGlvbj4ke2xpc3QubWFwKHggPT4gYDxvcHRpb24gdmFsdWU9IiR7eC5pZH0iICR7U3RyaW5nKHguaWQpID09PSBTdHJpbmcoY3VyKSA/ICdzZWxlY3RlZCcgOiAnJ30+JHtlc2MoeC5uYW1lKX08L29wdGlvbj5gKS5qb2luKCcnKX08L3NlbGVjdD5gOwogICAgJCgnI3VuaXRzU2VsJykub25jaGFuZ2UgPSBlID0+IHsgc3RvcmUuc2V0KCd1bml0c1NlbGxlcicsIGUudGFyZ2V0LnZhbHVlKTsgcmVuZGVyUHJvZHVjdHMoKTsgfTsKICB9IGNhdGNoIHt9CiAgcmVuZGVyUHJvZHVjdHMoKTsKfQoKLy8gLS0tLS0tLS0tLSBWRU5UQVMgLS0tLS0tLS0tLQovLyBQbGFuaWxsYSBkZSBwcm9kdWN0b3MgdmVuZGlkb3M6IGZpamEgZGUgbHVuZXMgYSBkb21pbmdvOyB0YW1iacOpbiBtZXMsIDMwIGTDrWFzLCBhw7FvIG8gZmVjaGFzIGEgZWxlY2Npw7NuCmNvbnN0IHBwID0geyBtb2RlOiAnd2VlaycsIHdlZWs6IDAsIGZyb206ICcnLCB0bzogJycsIHE6ICcnLCBvcGVuOiBuZXcgU2V0KCkgfTsKY29uc3QgaXNvID0gZCA9PiBgJHtkLmdldEZ1bGxZZWFyKCl9LSR7U3RyaW5nKGQuZ2V0TW9udGgoKSArIDEpLnBhZFN0YXJ0KDIsICcwJyl9LSR7U3RyaW5nKGQuZ2V0RGF0ZSgpKS5wYWRTdGFydCgyLCAnMCcpfWA7CmZ1bmN0aW9uIHBwUmFuZ2UoKSB7CiAgY29uc3QgdCA9IG5ldyBEYXRlKCk7IHQuc2V0SG91cnMoMTIsIDAsIDAsIDApOwogIGlmIChwcC5tb2RlID09PSAnd2VlaycpIHsgY29uc3QgbW9uID0gbmV3IERhdGUodCk7IG1vbi5zZXREYXRlKHQuZ2V0RGF0ZSgpIC0gKCh0LmdldERheSgpICsgNikgJSA3KSArIHBwLndlZWsgKiA3KTsgY29uc3Qgc3VuID0gbmV3IERhdGUobW9uKTsgc3VuLnNldERhdGUobW9uLmdldERhdGUoKSArIDYpOyByZXR1cm4gW2lzbyhtb24pLCBpc28oc3VuKV07IH0KICBpZiAocHAubW9kZSA9PT0gJ21vbnRoJykgcmV0dXJuIFtpc28obmV3IERhdGUodC5nZXRGdWxsWWVhcigpLCB0LmdldE1vbnRoKCksIDEpKSwgaXNvKHQpXTsKICBpZiAocHAubW9kZSA9PT0gJzMwJykgeyBjb25zdCBmID0gbmV3IERhdGUodCk7IGYuc2V0RGF0ZSh0LmdldERhdGUoKSAtIDI5KTsgcmV0dXJuIFtpc28oZiksIGlzbyh0KV07IH0KICBpZiAocHAubW9kZSA9PT0gJ3llYXInKSByZXR1cm4gW2lzbyhuZXcgRGF0ZSh0LmdldEZ1bGxZZWFyKCksIDAsIDEpKSwgaXNvKHQpXTsKICByZXR1cm4gW3BwLmZyb20gfHwgaXNvKHQpLCBwcC50byB8fCBpc28odCldOwp9CmNvbnN0IGZtdEQgPSBkID0+IG5ldyBEYXRlKGQgKyAnVDEyOjAwOjAwJykudG9Mb2NhbGVEYXRlU3RyaW5nKCdlcy1DTCcsIHsgd2Vla2RheTogJ3Nob3J0JywgZGF5OiAnbnVtZXJpYycsIG1vbnRoOiAnc2hvcnQnIH0pLnJlcGxhY2UoJy4nLCAnJyk7CmFzeW5jIGZ1bmN0aW9uIHJlbmRlclByb2R1Y3RzKCkgewogIGNvbnN0IGJveCA9ICQoJyNwcm9kUGFuZWwnKTsgaWYgKCFib3gpIHJldHVybjsKICBjb25zdCBpc0FkbWluID0gbWUudXNlci5yb2xlID09PSAnYWRtaW4nOwogIGNvbnN0IG5vTW9uZXkgPSB0YWIgPT09ICd1bml0cyc7IC8vIHNlY2Npw7NuIHNpbiBwcmVjaW9zIChmdWxmaWxsbWVudCAvIGFkbWluaXN0cmFkb3IpCiAgY29uc3Qgc2lkID0gbm9Nb25leSA/IHN0b3JlLmdldCgndW5pdHNTZWxsZXInLCAnJykgOiBpc0FkbWluID8gc3RvcmUuZ2V0KCdzYWxlc1NlbGxlcicsICcnKSA6ICcnOwogIGNvbnN0IFtmcm9tLCB0b10gPSBwcFJhbmdlKCk7CiAgY29uc3QgcXMgPSBgZnJvbT0ke2Zyb219JnRvPSR7dG99JHtzaWQgPyAnJnNlbGxlcl9pZD0nICsgc2lkIDogJyd9JHtub01vbmV5ID8gJyZub21vbmV5PTEnIDogJyd9YDsKICBib3guaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9InBhbmVsLWhlYWQiIHN0eWxlPSJmbGV4LXdyYXA6d3JhcDtnYXA6MTBweCI+JHtub01vbmV5ID8gJycgOiAnPGgyPlByb2R1Y3RvcyB2ZW5kaWRvczwvaDI+J30KICAgIDxzZWxlY3QgaWQ9InBwTW9kZSIgc3R5bGU9IndpZHRoOmF1dG8iPiR7W1snd2VlaycsICdTZW1hbmEgKGx1bmVzIGEgZG9taW5nbyknXSwgWydtb250aCcsICdFc3RlIG1lcyddLCBbJzMwJywgJ8OabHRpbW9zIDMwIGTDrWFzJ10sIFsneWVhcicsICdFc3RlIGHDsW8nXSwgWydjdXN0b20nLCAnRWxlZ2lyIGZlY2hhc+KApiddXS5tYXAoKFtrLCBuXSkgPT4gYDxvcHRpb24gdmFsdWU9IiR7a30iICR7cHAubW9kZSA9PT0gayA/ICdzZWxlY3RlZCcgOiAnJ30+JHtufTwvb3B0aW9uPmApLmpvaW4oJycpfTwvc2VsZWN0PgogICAgJHtwcC5tb2RlID09PSAnd2VlaycgPyBgPHNwYW4gY2xhc3M9InBwLXdlZWsiPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGlkPSJwcFByZXYiIGFyaWEtbGFiZWw9IlNlbWFuYSBhbnRlcmlvciI+4oC5PC9idXR0b24+PGI+JHtlc2MoZm10RChmcm9tKSl9IOKAkyAke2VzYyhmbXREKHRvKSl9PC9iPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGlkPSJwcE5leHQiIGFyaWEtbGFiZWw9IlNlbWFuYSBzaWd1aWVudGUiICR7cHAud2VlayA+PSAwID8gJ2Rpc2FibGVkJyA6ICcnfT7igLo8L2J1dHRvbj48L3NwYW4+YCA6ICcnfQogICAgJHtwcC5tb2RlID09PSAnY3VzdG9tJyA/IGA8c3BhbiBjbGFzcz0icHAtd2VlayI+PGlucHV0IHR5cGU9ImRhdGUiIGlkPSJwcEZyb20iIHZhbHVlPSIke2Zyb219IiBzdHlsZT0id2lkdGg6YXV0byI+IGEgPGlucHV0IHR5cGU9ImRhdGUiIGlkPSJwcFRvIiB2YWx1ZT0iJHt0b30iIHN0eWxlPSJ3aWR0aDphdXRvIj48L3NwYW4+YCA6ICcnfQogICAgPGlucHV0IHR5cGU9InNlYXJjaCIgaWQ9InBwUSIgcGxhY2Vob2xkZXI9IkJ1c2NhciBwcm9kdWN0byBvIFNLVSIgdmFsdWU9IiR7ZXNjKHBwLnEpfSIgc3R5bGU9IndpZHRoOmF1dG87bWluLXdpZHRoOjE5MHB4Ij4KICAgIDxzcGFuIGNsYXNzPSJzcGFjZXIiIHN0eWxlPSJmbGV4OjEiPjwvc3Bhbj4KICAgIDxhIGNsYXNzPSJidG4gYnRuLXByaW1hcnkgYnRuLXNtIiBpZD0icHBYbHMiIGhyZWY9Ii9hcGkvc2FsZXMvcHJvZHVjdHMueGxzeD8ke3FzfSI+JHtJLmRvd259RGVzY2FyZ2FyIEV4Y2VsPC9hPjwvZGl2PgogICAgPGRpdiBjbGFzcz0icGFuZWwtYm9keSIgaWQ9InBwQm9keSI+PGRpdiBjbGFzcz0ibXV0ZWQiPkNhcmdhbmRvIHByb2R1Y3Rvc+KApjwvZGl2PjwvZGl2PmA7CiAgJCgnI3BwTW9kZScpLm9uY2hhbmdlID0gZSA9PiB7IHBwLm1vZGUgPSBlLnRhcmdldC52YWx1ZTsgcHAud2VlayA9IDA7IGlmIChwcC5tb2RlID09PSAnY3VzdG9tJyAmJiAhcHAuZnJvbSkgeyBjb25zdCBbZiwgdF0gPSBwcFJhbmdlKCk7IHBwLmZyb20gPSBmOyBwcC50byA9IHQ7IH0gcmVuZGVyUHJvZHVjdHMoKTsgfTsKICBpZiAoJCgnI3BwUHJldicpKSB7ICQoJyNwcFByZXYnKS5vbmNsaWNrID0gKCkgPT4geyBwcC53ZWVrLS07IHJlbmRlclByb2R1Y3RzKCk7IH07ICQoJyNwcE5leHQnKS5vbmNsaWNrID0gKCkgPT4geyBpZiAocHAud2VlayA8IDApIHsgcHAud2VlaysrOyByZW5kZXJQcm9kdWN0cygpOyB9IH07IH0KICBpZiAoJCgnI3BwRnJvbScpKSB7IGNvbnN0IGNoID0gKCkgPT4geyBwcC5mcm9tID0gJCgnI3BwRnJvbScpLnZhbHVlOyBwcC50byA9ICQoJyNwcFRvJykudmFsdWU7IHJlbmRlclByb2R1Y3RzKCk7IH07ICQoJyNwcEZyb20nKS5vbmNoYW5nZSA9IGNoOyAkKCcjcHBUbycpLm9uY2hhbmdlID0gY2g7IH0KICBsZXQgZDsKICB0cnkgeyBkID0gYXdhaXQgYXBpKCcvYXBpL3NhbGVzL3Byb2R1Y3RzPycgKyBxcyk7IH0gY2F0Y2ggKGUpIHsgJCgnI3BwQm9keScpLmlubmVySFRNTCA9IGVzYyhlLm1lc3NhZ2UpOyByZXR1cm47IH0KICBjb25zdCBkcmF3ID0gKCkgPT4gewogICAgaWYgKCEkKCcjcHBCb2R5JykpIHJldHVybjsKICAgIGNvbnN0IHEgPSBwcC5xLnRvTG93ZXJDYXNlKCk7CiAgICBjb25zdCByb3dzID0gZC5yb3dzLmZpbHRlcihyID0+ICFxIHx8IFtyLm5hbWUsIHIucHViX2lkLCByLnNlbGxlciwgLi4uci52YXJpYW50cy5tYXAodiA9PiB2LnZhcmlhbnQgKyAnICcgKyB2LnNrdSldLmpvaW4oJyAnKS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHEpKTsKICAgIGNvbnN0IGRheXMgPSBbXTsgZm9yIChsZXQgeCA9IG5ldyBEYXRlKGZyb20gKyAnVDEyOjAwOjAwJyk7IGlzbyh4KSA8PSB0byAmJiBkYXlzLmxlbmd0aCA8IDQwMDsgeC5zZXREYXRlKHguZ2V0RGF0ZSgpICsgMSkpIGRheXMucHVzaChpc28oeCkpOwogICAgY29uc3Qgd2Vla2x5ID0gZGF5cy5sZW5ndGggPD0gNywgYWxsID0gIXNpZCAmJiAoaXNBZG1pbiB8fCBub01vbmV5KTsKICAgIGNvbnN0IHRvdCA9IGsgPT4gcm93cy5yZWR1Y2UoKGEsIHIpID0+IGEgKyAodHlwZW9mIGsgPT09ICdmdW5jdGlvbicgPyBrKHIpIDogcltrXSksIDApOwogICAgY29uc3QgaGVhZCA9IGAke2FsbCA/ICc8dGg+VmVuZGVkb3I8L3RoPicgOiAnJ308dGg+UHVibGljYWNpw7NuPC90aD48dGg+SUQgLyBTS1U8L3RoPiR7d2Vla2x5ID8gZGF5cy5tYXAoeCA9PiBgPHRoIGNsYXNzPSJudW0iPiR7ZXNjKGZtdEQoeCkuc3BsaXQoJyAnKVswXS5yZXBsYWNlKCcsJywgJycpKX08c21hbGw+JHt4LnNsaWNlKDgpfTwvc21hbGw+PC90aD5gKS5qb2luKCcnKSA6IFsnbWwnLCAnZmEnLCAncGEnXS5tYXAoayA9PiBgPHRoIGNsYXNzPSJudW0iPjxpIGNsYXNzPSJkb3QiIHN0eWxlPSJiYWNrZ3JvdW5kOiR7TUtfQ09MT1Jba119Ij48L2k+JHtNS1trXX08L3RoPmApLmpvaW4oJycpfTx0aCBjbGFzcz0ibnVtIj5Ub3RhbDwvdGg+JHtub01vbmV5ID8gJzx0aCBjbGFzcz0ibnVtIj5WZW50YXM8L3RoPicgOiAnPHRoIGNsYXNzPSJudW0iPk1vbnRvPC90aD4nfWA7CiAgICBjb25zdCBjZWxsUSA9IG4gPT4gbiA/IGA8Yj4ke259PC9iPmAgOiAnPHNwYW4gY2xhc3M9Inplcm8iPsK3PC9zcGFuPic7CiAgICBjb25zdCBudW1zID0gciA9PiBgJHt3ZWVrbHkgPyBkYXlzLm1hcCh4ID0+IGA8dGQgY2xhc3M9Im51bSI+JHtjZWxsUShyLmJ5RGF5W3hdIHx8IDApfTwvdGQ+YCkuam9pbignJykgOiBbJ21sJywgJ2ZhJywgJ3BhJ10ubWFwKGsgPT4gYDx0ZCBjbGFzcz0ibnVtIj4ke2NlbGxRKHIuYnlNa1trXSB8fCAwKX08L3RkPmApLmpvaW4oJycpfTx0ZCBjbGFzcz0ibnVtIHBwLXRvdGFsIj4ke3IucXR5fTwvdGQ+PHRkIGNsYXNzPSJudW0iPiR7bm9Nb25leSA/IHIub3JkZXJzIDogbW9uZXkoci5hbW91bnQpfTwvdGQ+YDsKICAgIC8vIHVuYSBmaWxhIHBvciBwdWJsaWNhY2nDs247IGNvbiBsYSBmbGVjaGEgc2UgZGVzcGxpZWdhbiBzdXMgdmFyaWFudGVzCiAgICBjb25zdCBib2R5ID0gcm93cy5tYXAociA9PiB7CiAgICAgIC8vIGxhIGZpbGEgbXVlc3RyYSBsYSBwdWJsaWNhY2nDs24gY29tcGxldGEgKHRvZGFzIHN1cyB2YXJpYW50ZXMgc3VtYWRhcyk7IGxhcyB2YXJpYW50ZXMgc29sbyBhbCBkZXNwbGVnYXIKICAgICAgY29uc3Qga2V5ID0gci5zZWxsZXIgKyAnfCcgKyByLm1hcmtldHBsYWNlICsgJ3wnICsgKHIucHViX2lkIHx8IHIubmFtZSksIG9wZW4gPSBwcC5vcGVuLmhhcyhrZXkpLCBudiA9IHIudmFyaWFudHMuZmlsdGVyKHYgPT4gdi52YXJpYW50IHx8IHYuc2t1KS5sZW5ndGgsIG1hbnkgPSBudiA+IDA7CiAgICAgIGxldCBoID0gYDx0ciBjbGFzcz0icHAtcHViJHttYW55ID8gJyBwcC1jYW4nIDogJyd9IiAke21hbnkgPyBgZGF0YS1waz0iJHtlc2Moa2V5KX0iYCA6ICcnfT4ke2FsbCA/IGA8dGQ+JHtlc2Moci5zZWxsZXIpfTwvdGQ+YCA6ICcnfTx0ZD4ke21hbnkgPyBgPHNwYW4gY2xhc3M9InBwLWFycm93Ij4ke29wZW4gPyAn4pa+JyA6ICfilrgnfTwvc3Bhbj5gIDogJzxzcGFuIGNsYXNzPSJwcC1hcnJvdyI+PC9zcGFuPid9PHNwYW4gY2xhc3M9Im1rICR7ci5tYXJrZXRwbGFjZX0iIHN0eWxlPSJtYXJnaW4tcmlnaHQ6NnB4Ij4ke01LW3IubWFya2V0cGxhY2VdIHx8ICcnfTwvc3Bhbj48c3BhbiBjbGFzcz0icHAtbmFtZSI+JHtlc2Moci5uYW1lKX08L3NwYW4+JHttYW55ID8gYDxzbWFsbCBjbGFzcz0ibXV0ZWQgcHAtc3ViIj4ke252fSB2YXJpYW50ZSR7bnYgPT09IDEgPyAnJyA6ICdzJ30gdmVuZGlkYSR7bnYgPT09IDEgPyAnJyA6ICdzJ30gwrcgJHtvcGVuID8gJ3RvY2EgcGFyYSBvY3VsdGFyJyA6ICd0b2NhIHBhcmEgdmVyJ308L3NtYWxsPmAgOiAnJ308L3RkPjx0ZCBjbGFzcz0ibW9ubyI+JHtlc2Moci5wdWJfaWQgfHwgJycpfTwvdGQ+JHtudW1zKHIpfTwvdHI+YDsKICAgICAgaWYgKG1hbnkgJiYgb3BlbikgaCArPSByLnZhcmlhbnRzLm1hcCh2ID0+IGA8dHIgY2xhc3M9InBwLXZhciI+JHthbGwgPyAnPHRkPjwvdGQ+JyA6ICcnfTx0ZD48c3BhbiBjbGFzcz0icHAtdm5hbWUiPiR7ZXNjKHYudmFyaWFudCB8fCAnU2luIHZhcmlhbnRlJyl9PC9zcGFuPjwvdGQ+PHRkIGNsYXNzPSJtb25vIj4ke2VzYyh2LnNrdSB8fCAnJyl9PC90ZD4ke251bXModil9PC90cj5gKS5qb2luKCcnKTsKICAgICAgcmV0dXJuIGg7CiAgICB9KS5qb2luKCcnKTsKICAgIGNvbnN0IGZvb3QgPSBgPHRyPiR7YWxsID8gJzx0ZD48L3RkPicgOiAnJ308dGQ+PGI+VG90YWwgKCR7cm93cy5sZW5ndGh9IHB1YmxpY2FjaSR7cm93cy5sZW5ndGggPT09IDEgPyAnw7NuJyA6ICdvbmVzJ30pPC9iPjwvdGQ+PHRkPjwvdGQ+JHt3ZWVrbHkgPyBkYXlzLm1hcCh4ID0+IGA8dGQgY2xhc3M9Im51bSI+PGI+JHt0b3QociA9PiByLmJ5RGF5W3hdIHx8IDApfTwvYj48L3RkPmApLmpvaW4oJycpIDogWydtbCcsICdmYScsICdwYSddLm1hcChrID0+IGA8dGQgY2xhc3M9Im51bSI+PGI+JHt0b3QociA9PiByLmJ5TWtba10gfHwgMCl9PC9iPjwvdGQ+YCkuam9pbignJyl9PHRkIGNsYXNzPSJudW0gcHAtdG90YWwiPiR7dG90KCdxdHknKX08L3RkPjx0ZCBjbGFzcz0ibnVtIj48Yj4ke25vTW9uZXkgPyB0b3QoJ29yZGVycycpIDogbW9uZXkodG90KCdhbW91bnQnKSl9PC9iPjwvdGQ+PC90cj5gOwogICAgY29uc3Qgbm90ZSA9IGQuaGlzdG9yeVNpbmNlICYmIGZyb20gPCBkLmhpc3RvcnlTaW5jZSA/IGA8cCBjbGFzcz0icHAtbm90ZSI+RXN0YW1vcyB0cmF5ZW5kbyB0dSBoaXN0b3JpYWwgZGUgdmVudGFzIGRlIGEgcG9jbyAoaGFzdGEgMSBhw7FvKS4gUG9yIGFob3JhIGhheSBkYXRvcyBjb21wbGV0b3MgZGVzZGUgZWwgJHtlc2MoZm10RChkLmhpc3RvcnlTaW5jZSkpfTsgZWwgcmVzdG8gYXBhcmVjZSBzb2xvIGVuIGxhcyBwcsOzeGltYXMgaG9yYXMuPC9wPmAgOiAnJzsKICAgIGNvbnN0IGNhbk9wZW4gPSByID0+IHIudmFyaWFudHMuc29tZSh2ID0+IHYudmFyaWFudCB8fCB2LnNrdSk7CiAgICBjb25zdCBleHBhbmRCdG4gPSByb3dzLnNvbWUoY2FuT3BlbikgPyBgPGRpdiBzdHlsZT0ibWFyZ2luOjAgMCA4cHgiPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGlkPSJwcEFsbCI+JHtyb3dzLmZpbHRlcihjYW5PcGVuKS5ldmVyeShyID0+IHBwLm9wZW4uaGFzKHIuc2VsbGVyICsgJ3wnICsgci5tYXJrZXRwbGFjZSArICd8JyArIChyLnB1Yl9pZCB8fCByLm5hbWUpKSkgPyAnT2N1bHRhciB2YXJpYW50ZXMnIDogJ1ZlciB0b2RhcyBsYXMgdmFyaWFudGVzJ308L2J1dHRvbj48L2Rpdj5gIDogJyc7CiAgICBjb25zdCB2aXogPSBub01vbmV5ICYmIHJvd3MubGVuZ3RoID8gdW5pdHNWaXooZCwgcm93cywgZnJvbSwgdG8sIGFsbCkgOiAnJzsKICAgICQoJyNwcEJvZHknKS5pbm5lckhUTUwgPSB2aXogKyBub3RlICsgZXhwYW5kQnRuICsgKHJvd3MubGVuZ3RoID8gYCR7dml6ID8gJzxoMyBjbGFzcz0idXYtaCI+RGV0YWxsZSBwb3IgcHVibGljYWNpw7NuIDxzbWFsbD5Ub2NhIHVuYSBwdWJsaWNhY2nDs24gcGFyYSB2ZXIgc3VzIHZhcmlhbnRlczwvc21hbGw+PC9oMz4nIDogJyd9PGRpdiBjbGFzcz0idGFibGUtd3JhcCI+PHRhYmxlIGNsYXNzPSJwcC10YWJsZSI+PHRoZWFkPjx0cj4ke2hlYWR9PC90cj48L3RoZWFkPjx0Ym9keT4ke2JvZHl9PC90Ym9keT48dGZvb3Q+JHtmb290fTwvdGZvb3Q+PC90YWJsZT48L2Rpdj5gIDogYDxkaXYgY2xhc3M9ImVtcHR5Ij4ke3EgPyAnTmluZ8O6biBwcm9kdWN0byBjb2luY2lkZSBjb24gbGEgYsO6c3F1ZWRhLicgOiAnTm8gaGF5IHByb2R1Y3RvcyB2ZW5kaWRvcyBlbiBlc3RhcyBmZWNoYXMuJ308L2Rpdj5gKTsKICB9OwogIGRyYXcoKTsKICBpZiAobm9Nb25leSkgZHJhd1VuaXRDaGFydHMoZCwgZnJvbSwgdG8pOwogICQoJyNwcEJvZHknKS5vbm1vdXNlbW92ZSA9IGUgPT4gewogICAgY29uc3QgdGlwRWwgPSAkKCcjY2hUaXAyJyk7IGlmICghdGlwRWwpIHJldHVybjsKICAgIGNvbnN0IGggPSBlLnRhcmdldC5jbG9zZXN0KCcuY2gtaGl0Jyk7IGlmICghaCkgeyB0aXBFbC5oaWRkZW4gPSB0cnVlOyByZXR1cm47IH0KICAgIGNvbnN0IFt0LCAuLi5yZXN0XSA9IGguZGF0YXNldC50aXAuc3BsaXQoJ3wnKTsKICAgIHRpcEVsLmlubmVySFRNTCA9IGA8Yj4ke2VzYyh0KX08L2I+JHtyZXN0Lm1hcChyID0+IGA8ZGl2PiR7ZXNjKHIpfTwvZGl2PmApLmpvaW4oJycpfWA7IHRpcEVsLmhpZGRlbiA9IGZhbHNlOwogICAgdGlwRWwuc3R5bGUubGVmdCA9IE1hdGgubWluKGUuY2xpZW50WCArIDE0LCBpbm5lcldpZHRoIC0gdGlwRWwub2Zmc2V0V2lkdGggLSA4KSArICdweCc7IHRpcEVsLnN0eWxlLnRvcCA9IChlLmNsaWVudFkgKyAxNCkgKyAncHgnOwogIH07CiAgJCgnI3BwQm9keScpLm9ubW91c2VsZWF2ZSA9ICgpID0+IHsgY29uc3QgdCA9ICQoJyNjaFRpcDInKTsgaWYgKHQpIHQuaGlkZGVuID0gdHJ1ZTsgfTsKICAkKCcjcHBCb2R5Jykub25jbGljayA9IGUgPT4gewogICAgaWYgKGUudGFyZ2V0LmNsb3Nlc3QoJyNwcEFsbCcpKSB7CiAgICAgIGNvbnN0IGtleXMgPSBkLnJvd3MuZmlsdGVyKHIgPT4gci52YXJpYW50cy5zb21lKHYgPT4gdi52YXJpYW50IHx8IHYuc2t1KSkubWFwKHIgPT4gci5zZWxsZXIgKyAnfCcgKyByLm1hcmtldHBsYWNlICsgJ3wnICsgKHIucHViX2lkIHx8IHIubmFtZSkpOwogICAgICBjb25zdCBhbGxPcGVuID0ga2V5cy5ldmVyeShrID0+IHBwLm9wZW4uaGFzKGspKTsKICAgICAga2V5cy5mb3JFYWNoKGsgPT4gYWxsT3BlbiA/IHBwLm9wZW4uZGVsZXRlKGspIDogcHAub3Blbi5hZGQoaykpOyBkcmF3KCk7IGlmIChub01vbmV5KSBkcmF3VW5pdENoYXJ0cyhkLCBmcm9tLCB0byk7IHJldHVybjsKICAgIH0KICAgIGNvbnN0IHRyID0gZS50YXJnZXQuY2xvc2VzdCgndHJbZGF0YS1wa10nKTsgaWYgKCF0cikgcmV0dXJuOwogICAgY29uc3QgayA9IHRyLmRhdGFzZXQucGs7IHBwLm9wZW4uaGFzKGspID8gcHAub3Blbi5kZWxldGUoaykgOiBwcC5vcGVuLmFkZChrKTsgZHJhdygpOyBpZiAobm9Nb25leSkgZHJhd1VuaXRDaGFydHMoZCwgZnJvbSwgdG8pOwogIH07CiAgJCgnI3BwUScpLm9uaW5wdXQgPSBlID0+IHsgcHAucSA9IGUudGFyZ2V0LnZhbHVlOyBkcmF3KCk7IGlmIChub01vbmV5KSBkcmF3VW5pdENoYXJ0cyhkLCBmcm9tLCB0byk7IH07Cn0KY29uc3QgTUtfQ09MT1IgPSB7IG1sOiAnI0M5OUEwMCcsIGZhOiAnIzRGOEYwMCcsIHBhOiAnIzAwNjhCOCcgfTsgLy8gY29sb3JlcyBkZSBjYWRhIG1hcmtldHBsYWNlICh2YWxpZGFkb3MgcGFyYSBkYWx0b25pc21vLCBjb24gZXRpcXVldGFzIHkgc2VwYXJhY2nDs24pCmNvbnN0IG1vbmV5ID0gbiA9PiAnJCcgKyBNYXRoLnJvdW5kKG4pLnRvTG9jYWxlU3RyaW5nKCdlcy1DTCcpOwpjb25zdCBtb25leVNob3J0ID0gbiA9PiBuID49IDFlNiA/ICckJyArIChuIC8gMWU2KS50b0ZpeGVkKDEpLnJlcGxhY2UoJy4nLCAnLCcpLnJlcGxhY2UoJywwJywgJycpICsgJyBNJyA6IG4gPj0gMWU0ID8gJyQnICsgTWF0aC5yb3VuZChuIC8gMWUzKSArICcgbWlsJyA6IG1vbmV5KG4pOwpjb25zdCBkYXlTaG9ydCA9IGQgPT4geyBjb25zdCB4ID0gbmV3IERhdGUoZCArICdUMTI6MDA6MDAnKTsgcmV0dXJuIHgudG9Mb2NhbGVEYXRlU3RyaW5nKCdlcy1DTCcsIHsgd2Vla2RheTogJ3Nob3J0JyB9KS5yZXBsYWNlKCcuJywgJycpICsgJyAnICsgeC5nZXREYXRlKCk7IH07CmNvbnN0IGRheUxvbmcgPSBkID0+IG5ldyBEYXRlKGQgKyAnVDEyOjAwOjAwJykudG9Mb2NhbGVEYXRlU3RyaW5nKCdlcy1DTCcsIHsgd2Vla2RheTogJ2xvbmcnLCBkYXk6ICdudW1lcmljJywgbW9udGg6ICdsb25nJyB9KTsKY29uc3QgbmljZU1heCA9IHYgPT4geyBpZiAodiA8PSAwKSByZXR1cm4gMTAwMDA7IGNvbnN0IHAgPSBNYXRoLnBvdygxMCwgTWF0aC5mbG9vcihNYXRoLmxvZzEwKHYpKSk7IGNvbnN0IGYgPSB2IC8gcDsgcmV0dXJuIChmIDw9IDEgPyAxIDogZiA8PSAyID8gMiA6IGYgPD0gMi41ID8gMi41IDogZiA8PSA1ID8gNSA6IDEwKSAqIHA7IH07CmZ1bmN0aW9uIGJhclBhdGgoeCwgeSwgdywgaCwgcikgewogIGlmIChoIDw9IDApIHJldHVybiAnJzsKICByID0gTWF0aC5taW4ociwgaCwgdyAvIDIpOwogIHJldHVybiBgTSR7eH0sJHt5ICsgaH1WJHt5ICsgcn1RJHt4fSwke3l9ICR7eCArIHJ9LCR7eX1IJHt4ICsgdyAtIHJ9USR7eCArIHd9LCR7eX0gJHt4ICsgd30sJHt5ICsgcn1WJHt5ICsgaH1aYDsKfQovLyBHcsOhZmljbyBkZSBjb2x1bW5hcyAodW5hIHNlcmllKSBvIGNvbHVtbmFzIGFwaWxhZGFzICh2YXJpYXMpLiBUb29sdGlwIHBvciBjb2x1bW5hLgpmdW5jdGlvbiBjb2x1bW5DaGFydChkYXlzLCBzdGFja3MsIHsgaGVpZ2h0ID0gMjMwLCB0b2RheSwgd2lkdGggPSA2NDAsIHVuaXRzID0gZmFsc2UsIGxhYmVsLCB0aXRsZSB9ID0ge30pIHsKICBjb25zdCBmbXRTID0gdW5pdHMgPyAobiA9PiBNYXRoLnJvdW5kKG4pLnRvTG9jYWxlU3RyaW5nKCdlcy1DTCcpKSA6IG1vbmV5U2hvcnQsIGZtdEwgPSB1bml0cyA/IChuID0+IGAke01hdGgucm91bmQobikudG9Mb2NhbGVTdHJpbmcoJ2VzLUNMJyl9IHVuaWQuYCkgOiBtb25leTsKICBjb25zdCBXID0gTWF0aC5tYXgoMjgwLCB3aWR0aCksIEggPSBoZWlnaHQsIEwgPSA0LCBSID0gNTIsIFQgPSAyNiwgQiA9IDMwOwogIGNvbnN0IHRvdGFscyA9IGRheXMubWFwKChfLCBpKSA9PiBzdGFja3MucmVkdWNlKChhLCBzKSA9PiBhICsgcy52YWx1ZXNbaV0uYW1vdW50LCAwKSk7CiAgY29uc3QgbWF4ID0gdW5pdHMgJiYgTWF0aC5tYXgoLi4udG90YWxzKSA8PSAwID8gMTAgOiBuaWNlTWF4KE1hdGgubWF4KC4uLnRvdGFscykgKiAxLjA4KTsKICBjb25zdCBzbG90ID0gKFcgLSBMIC0gUikgLyBkYXlzLmxlbmd0aCwgYncgPSBNYXRoLm1pbig1Niwgc2xvdCAqIDAuNTgpOwogIGNvbnN0IGNvbXBhY3QgPSBzbG90IDwgNzQ7IC8vIGNhamEgYW5nb3N0YSAoY2VsdWxhciAvIHRhcmpldGEgY2hpY2EpOiBtZW5vcyBldGlxdWV0YXMgcGFyYSBxdWUgbm8gc2UgZW5jaW1lbgogIGxldCBiZXN0SSA9IDA7IHRvdGFscy5mb3JFYWNoKCh0LCBpKSA9PiB7IGlmICh0ID4gdG90YWxzW2Jlc3RJXSkgYmVzdEkgPSBpOyB9KTsKICBjb25zdCB5ID0gdiA9PiBUICsgKEggLSBUIC0gQikgKiAoMSAtIHYgLyBtYXgpOwogIGxldCBnID0gJyc7CiAgZm9yIChjb25zdCBmIG9mIFswLjUsIDFdKSBnICs9IGA8bGluZSB4MT0iJHtMfSIgeDI9IiR7VyAtIFJ9IiB5MT0iJHt5KG1heCAqIGYpfSIgeTI9IiR7eShtYXggKiBmKX0iIHN0cm9rZT0idmFyKC0tbGluZSkiIHN0cm9rZS1kYXNoYXJyYXk9IjMgNCIvPjx0ZXh0IHg9IiR7VyAtIDJ9IiB5PSIke3kobWF4ICogZikgKyA0fSIgdGV4dC1hbmNob3I9ImVuZCIgY2xhc3M9ImNoLWF4Ij4ke2ZtdFMobWF4ICogZil9PC90ZXh0PmA7CiAgZyArPSBgPGxpbmUgeDE9IiR7TH0iIHgyPSIke1cgLSBSfSIgeTE9IiR7eSgwKX0iIHkyPSIke3koMCl9IiBzdHJva2U9InZhcigtLWxpbmUpIi8+YDsKICBkYXlzLmZvckVhY2goKGQsIGkpID0+IHsKICAgIGNvbnN0IHggPSBMICsgc2xvdCAqIGkgKyAoc2xvdCAtIGJ3KSAvIDI7CiAgICBsZXQgYWNjID0gMDsKICAgIGNvbnN0IHNlZ3MgPSBzdGFja3MuZmlsdGVyKHMgPT4gcy52YWx1ZXNbaV0uYW1vdW50ID4gMCk7CiAgICBzZWdzLmZvckVhY2goKHMsIGspID0+IHsKICAgICAgY29uc3QgdiA9IHMudmFsdWVzW2ldLmFtb3VudCwgeTEgPSB5KGFjYyArIHYpLCB5MCA9IHkoYWNjKTsKICAgICAgY29uc3QgdG9wID0gayA9PT0gc2Vncy5sZW5ndGggLSAxOwogICAgICBjb25zdCBoID0gTWF0aC5tYXgoMCwgeTAgLSB5MSAtIChrID4gMCA/IDIgOiAwKSk7IC8vIDJweCBkZSBzZXBhcmFjacOzbiBlbnRyZSBzZWdtZW50b3MKICAgICAgZyArPSB0b3AgPyBgPHBhdGggZD0iJHtiYXJQYXRoKHgsIHkxLCBidywgaCwgNCl9IiBmaWxsPSIke3MuY29sb3J9Ii8+YCA6IGA8cmVjdCB4PSIke3h9IiB5PSIke3kxfSIgd2lkdGg9IiR7Ynd9IiBoZWlnaHQ9IiR7aH0iIGZpbGw9IiR7cy5jb2xvcn0iLz5gOwogICAgICBhY2MgKz0gdjsKICAgIH0pOwogICAgY29uc3QgaXNUb2RheSA9IGQgPT09IHRvZGF5OwogICAgaWYgKHRvdGFsc1tpXSA+IDAgJiYgKCFjb21wYWN0IHx8IGlzVG9kYXkgfHwgaSA9PT0gYmVzdEkpKSB7IGNvbnN0IGxibCA9IGZtdFModG90YWxzW2ldKSwgaHcgPSBsYmwubGVuZ3RoICogMy42OyBjb25zdCBjeCA9IE1hdGgubWluKE1hdGgubWF4KHggKyBidyAvIDIsIEwgKyBodyksIFcgLSBSIC0gaHcgKyAzMCk7IGcgKz0gYDx0ZXh0IHg9IiR7Y3h9IiB5PSIke3kodG90YWxzW2ldKSAtIDd9IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBjbGFzcz0iY2gtdmFsJHtpc1RvZGF5ID8gJyBjaC10b2RheScgOiAnJ30iPiR7bGJsfTwvdGV4dD5gOyB9CiAgICBnICs9IGA8dGV4dCB4PSIke3ggKyBidyAvIDJ9IiB5PSIke0ggLSAxMH0iIHRleHQtYW5jaG9yPSJtaWRkbGUiIGNsYXNzPSJjaC1kYXkke2lzVG9kYXkgPyAnIGNoLXRvZGF5JyA6ICcnfSI+JHtsYWJlbCA/IGVzYyhsYWJlbChkKSkgOiBpc1RvZGF5ID8gJ0hveScgOiBjb21wYWN0ID8gZGF5U2hvcnQoZCkuc2xpY2UoMCwgMikgKyAnICcgKyBkLnNsaWNlKDgpLnJlcGxhY2UoL14wLywgJycpIDogZGF5U2hvcnQoZCl9PC90ZXh0PmA7CiAgICBjb25zdCB0aXAgPSBbdGl0bGUgPyB0aXRsZShkKSA6IGRheUxvbmcoZCksIC4uLnN0YWNrcy5tYXAocyA9PiBgJHtzLmxhYmVsfTogJHtmbXRMKHMudmFsdWVzW2ldLmFtb3VudCl9JHt1bml0cyA/ICcnIDogYCDCtyAke3MudmFsdWVzW2ldLm9yZGVyc30gdmVudGEke3MudmFsdWVzW2ldLm9yZGVycyA9PT0gMSA/ICcnIDogJ3MnfWB9YCksIHN0YWNrcy5sZW5ndGggPiAxID8gYFRvdGFsOiAke2ZtdEwodG90YWxzW2ldKX1gIDogJyddLmZpbHRlcihCb29sZWFuKS5qb2luKCd8Jyk7CiAgICBnICs9IGA8cmVjdCB4PSIke0wgKyBzbG90ICogaX0iIHk9IiR7VCAtIDIwfSIgd2lkdGg9IiR7c2xvdH0iIGhlaWdodD0iJHtIIC0gVCAtIEIgKyAyMH0iIGZpbGw9InRyYW5zcGFyZW50IiBjbGFzcz0iY2gtaGl0IiBkYXRhLXRpcD0iJHtlc2ModGlwKX0iLz5gOwogIH0pOwogIHJldHVybiBgPHN2ZyB2aWV3Qm94PSIwIDAgJHtXfSAke0h9IiB3aWR0aD0iJHtXfSIgaGVpZ2h0PSIke0h9IiBjbGFzcz0iY2hhcnQiIHJvbGU9ImltZyI+JHtnfTwvc3ZnPmA7Cn0KZnVuY3Rpb24gc2FsZXNUYWJsZShkYXlzLCBkKSB7CiAgcmV0dXJuIGA8ZGV0YWlscyBjbGFzcz0iY2gtdGFibGUiPjxzdW1tYXJ5PlZlciB0YWJsYTwvc3VtbWFyeT48ZGl2IGNsYXNzPSJ0YWJsZS13cmFwIj48dGFibGU+PHRoZWFkPjx0cj48dGg+RMOtYTwvdGg+JHtbJ21sJywgJ2ZhJywgJ3BhJ10ubWFwKGsgPT4gYDx0aD4ke01LW2tdfTwvdGg+YCkuam9pbignJyl9PHRoPlRvdGFsPC90aD48L3RyPjwvdGhlYWQ+PHRib2R5PgogICAgJHtkYXlzLm1hcCgoZGF5LCBpKSA9PiBgPHRyPjx0ZD4ke2VzYyhkYXlMb25nKGRheSkpfTwvdGQ+JHtbJ21sJywgJ2ZhJywgJ3BhJ10ubWFwKGsgPT4gYDx0ZD4ke21vbmV5KGQuc2VyaWVzW2tdW2ldLmFtb3VudCl9IDxzcGFuIGNsYXNzPSJtdXRlZCI+KCR7ZC5zZXJpZXNba11baV0ub3JkZXJzfSk8L3NwYW4+PC90ZD5gKS5qb2luKCcnKX08dGQ+PGI+JHttb25leShbJ21sJywgJ2ZhJywgJ3BhJ10ucmVkdWNlKChhLCBrKSA9PiBhICsgZC5zZXJpZXNba11baV0uYW1vdW50LCAwKSl9PC9iPjwvdGQ+PC90cj5gKS5qb2luKCcnKX0KICA8L3Rib2R5PjwvdGFibGU+PC9kaXY+PC9kZXRhaWxzPmA7Cn0KYXN5bmMgZnVuY3Rpb24gcmVuZGVyU2FsZXMoZm9yY2UgPSBmYWxzZSkgewogIGNvbnN0IGlzQWRtaW4gPSBtZS51c2VyLnJvbGUgPT09ICdhZG1pbic7CiAgaWYgKCEkKCcjc2FsZXNCb2R5JykpICQoJyNtYWluJykuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9InNlY3Rpb24tdGl0bGUiIHN0eWxlPSJtYXJnaW4tdG9wOjIycHgiPjxoMj4ke2lzQWRtaW4gPyAnVmVudGFzJyA6ICdNaXMgdmVudGFzJ308L2gyPjxzcGFuIGNsYXNzPSJtdXRlZCI+w5psdGltb3MgNyBkw61hcyDCtyBzZSBhY3R1YWxpemEgc29sYTwvc3Bhbj48c3BhbiBjbGFzcz0ic3BhY2VyIiBzdHlsZT0iZmxleDoxIj48L3NwYW4+PHNwYW4gaWQ9InNhbGVzUGljayI+PC9zcGFuPjxidXR0b24gY2xhc3M9ImJ0biBidG4tZ2hvc3QgYnRuLXNtIiBpZD0ic2FsZXNSZWZyZXNoIj4ke0kuc3luY31BY3R1YWxpemFyPC9idXR0b24+PC9kaXY+PGRpdiBpZD0ic2FsZXNCb2R5Ij48ZGl2IGNsYXNzPSJwYW5lbCI+PGRpdiBjbGFzcz0icGFuZWwtYm9keSBtdXRlZCI+Q2FyZ2FuZG8gdHVzIHZlbnRhc+KApjwvZGl2PjwvZGl2PjwvZGl2PjxkaXYgY2xhc3M9ImNoLXRpcCIgaWQ9ImNoVGlwIiBoaWRkZW4+PC9kaXY+YDsKICAkKCcjc2FsZXNSZWZyZXNoJykub25jbGljayA9IGFzeW5jICgpID0+IHsgJCgnI3NhbGVzUmVmcmVzaCcpLmRpc2FibGVkID0gdHJ1ZTsgYXdhaXQgcmVuZGVyU2FsZXModHJ1ZSk7IGlmICgkKCcjc2FsZXNSZWZyZXNoJykpICQoJyNzYWxlc1JlZnJlc2gnKS5kaXNhYmxlZCA9IGZhbHNlOyB0b2FzdCgnVmVudGFzIGFjdHVhbGl6YWRhcycpOyB9OwogIGNvbnN0IHNpZCA9IGlzQWRtaW4gPyBzdG9yZS5nZXQoJ3NhbGVzU2VsbGVyJywgJycpIDogJyc7CiAgbGV0IGQ7CiAgdHJ5IHsgZCA9IGF3YWl0IGFwaShgL2FwaS9zYWxlcz8ke3NpZCA/ICdzZWxsZXJfaWQ9JyArIHNpZCArICcmJyA6ICcnfSR7Zm9yY2UgPyAncmVmcmVzaD0xJyA6ICcnfWApOyB9IGNhdGNoIChlKSB7ICQoJyNzYWxlc0JvZHknKS5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz0icGFuZWwiPjxkaXYgY2xhc3M9InBhbmVsLWJvZHkiPiR7ZXNjKGUubWVzc2FnZSl9PC9kaXY+PC9kaXY+YDsgcmV0dXJuOyB9CiAgaWYgKHRhYiAhPT0gJ3NhbGVzJykgcmV0dXJuOwogIGlmIChpc0FkbWluKSB7CiAgICAkKCcjc2FsZXNQaWNrJykuaW5uZXJIVE1MID0gYDxzZWxlY3QgaWQ9InNhbGVzU2VsIiBzdHlsZT0id2lkdGg6YXV0byI+PG9wdGlvbiB2YWx1ZT0iIj5Ub2RhcyBsYXMgY3VlbnRhczwvb3B0aW9uPiR7ZC5zZWxsZXJzLm1hcCh4ID0+IGA8b3B0aW9uIHZhbHVlPSIke3guaWR9IiAke1N0cmluZyh4LmlkKSA9PT0gU3RyaW5nKHNpZCkgPyAnc2VsZWN0ZWQnIDogJyd9PiR7ZXNjKHgubmFtZSl9PC9vcHRpb24+YCkuam9pbignJyl9PC9zZWxlY3Q+YDsKICAgICQoJyNzYWxlc1NlbCcpLm9uY2hhbmdlID0gZSA9PiB7IHN0b3JlLnNldCgnc2FsZXNTZWxsZXInLCBlLnRhcmdldC52YWx1ZSk7IHJlbmRlclNhbGVzKCk7IH07CiAgfQogIGNvbnN0IGRheXMgPSBkLmRheXMsIHRpID0gZGF5cy5sZW5ndGggLSAxLCBta3MgPSBbJ21sJywgJ2ZhJywgJ3BhJ107CiAgY29uc3QgZGF5VG90YWwgPSBpID0+IG1rcy5yZWR1Y2UoKGEsIGspID0+IGEgKyBkLnNlcmllc1trXVtpXS5hbW91bnQsIDApOwogIGNvbnN0IGRheU9yZGVycyA9IGkgPT4gbWtzLnJlZHVjZSgoYSwgaykgPT4gYSArIGQuc2VyaWVzW2tdW2ldLm9yZGVycywgMCk7CiAgY29uc3Qgd2Vla1RvdGFsID0gZGF5cy5yZWR1Y2UoKGEsIF8sIGkpID0+IGEgKyBkYXlUb3RhbChpKSwgMCksIHdlZWtPcmRlcnMgPSBkYXlzLnJlZHVjZSgoYSwgXywgaSkgPT4gYSArIGRheU9yZGVycyhpKSwgMCk7CiAgbGV0IGJlc3QgPSAwOyBkYXlzLmZvckVhY2goKF8sIGkpID0+IHsgaWYgKGRheVRvdGFsKGkpID4gZGF5VG90YWwoYmVzdCkpIGJlc3QgPSBpOyB9KTsKICBjb25zdCB1cCA9IGRheVRvdGFsKHRpIC0gMSkgPiAwICYmIGRheVRvdGFsKHRpKSA+IGRheVRvdGFsKHRpIC0gMSkgPyBNYXRoLnJvdW5kKChkYXlUb3RhbCh0aSkgLyBkYXlUb3RhbCh0aSAtIDEpIC0gMSkgKiAxMDApIDogbnVsbDsKICBjb25zdCBjaGVlciA9IHVwID8gYMKhVmFzICR7dXB9JSBhcnJpYmEgZGUgYXllciEg8J+agGAgOiBkYXlPcmRlcnModGkpID8gYMKhWWEgbGxldmFzICR7ZGF5T3JkZXJzKHRpKX0gdmVudGEke2RheU9yZGVycyh0aSkgPT09IDEgPyAnJyA6ICdzJ30gaG95IWAgOiAnRWwgZMOtYSByZWNpw6luIGVtcGllemE6IHR1cyB2ZW50YXMgZGUgaG95IGFwYXJlY2VuIGFxdcOtJzsKICBjb25zdCBzdGFja3MgPSBta3MubWFwKGsgPT4gKHsga2V5OiBrLCBsYWJlbDogTUtba10sIGNvbG9yOiBNS19DT0xPUltrXSwgdmFsdWVzOiBkLnNlcmllc1trXSB9KSk7CiAgY29uc3QgbWtDYXJkID0gayA9PiB7CiAgICBjb25zdCB3ayA9IGQuc2VyaWVzW2tdLnJlZHVjZSgoYSwgeCkgPT4gYSArIHguYW1vdW50LCAwKSwgbiA9IGQuc2VyaWVzW2tdLnJlZHVjZSgoYSwgeCkgPT4gYSArIHgub3JkZXJzLCAwKTsKICAgIGNvbnN0IG9uID0gZC5jb25uZWN0ZWQuaW5jbHVkZXMoaykgfHwgd2sgPiAwOwogICAgcmV0dXJuIGA8ZGl2IGNsYXNzPSJwYW5lbCBzYWxlcy1tayI+PGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+PGgyPjxpIGNsYXNzPSJkb3QiIHN0eWxlPSJiYWNrZ3JvdW5kOiR7TUtfQ09MT1Jba119Ij48L2k+JHtNS1trXX08L2gyPjxzcGFuIGNsYXNzPSJtdXRlZCI+JHtvbiA/IGAke21vbmV5KHdrKX0gwrcgJHtufSB2ZW50YSR7biA9PT0gMSA/ICcnIDogJ3MnfSBlbiA3IGTDrWFzYCA6ICcnfTwvc3Bhbj48L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0icGFuZWwtYm9keSI+JHtvbiA/IGA8ZGl2IGNsYXNzPSJjaC1zbG90IiBkYXRhLW1rPSIke2t9IiBkYXRhLWg9IjIwMCI+PC9kaXY+YCA6IGA8ZGl2IGNsYXNzPSJlbXB0eSI+Q29uZWN0YSAke01LW2tdfSBlbiAke2lzQWRtaW4gPyAnVmVuZGVkb3JlcycgOiAnTWkgY3VlbnRhJ30gcGFyYSB2ZXIgYXF1w60gc3VzIHZlbnRhcy48L2Rpdj5gfTwvZGl2PjwvZGl2PmA7CiAgfTsKICAkKCcjc2FsZXNCb2R5JykuaW5uZXJIVE1MID0gYAogICAgPGRpdiBjbGFzcz0ic2FsZXMta3BpcyI+CiAgICAgIDxkaXYgY2xhc3M9ImtwaSBrcGktaGVybyI+PHNtYWxsPlZlbmRpc3RlIGhveTwvc21hbGw+PGI+JHttb25leShkYXlUb3RhbCh0aSkpfTwvYj48c3Bhbj4ke2RheU9yZGVycyh0aSl9IHZlbnRhJHtkYXlPcmRlcnModGkpID09PSAxID8gJycgOiAncyd9IMK3ICR7ZXNjKGNoZWVyKX08L3NwYW4+PC9kaXY+CiAgICAgICR7bWtzLm1hcChrID0+IGA8ZGl2IGNsYXNzPSJrcGkiPjxzbWFsbD48aSBjbGFzcz0iZG90IiBzdHlsZT0iYmFja2dyb3VuZDoke01LX0NPTE9SW2tdfSI+PC9pPiR7TUtba119IGhveTwvc21hbGw+PGI+JHttb25leShkLnNlcmllc1trXVt0aV0uYW1vdW50KX08L2I+PHNwYW4+JHtkLnNlcmllc1trXVt0aV0ub3JkZXJzfSB2ZW50YSR7ZC5zZXJpZXNba11bdGldLm9yZGVycyA9PT0gMSA/ICcnIDogJ3MnfTwvc3Bhbj48L2Rpdj5gKS5qb2luKCcnKX0KICAgICAgPGRpdiBjbGFzcz0ia3BpIj48c21hbGw+w5psdGltb3MgNyBkw61hczwvc21hbGw+PGI+JHttb25leSh3ZWVrVG90YWwpfTwvYj48c3Bhbj4ke3dlZWtPcmRlcnN9IHZlbnRhcyR7ZGF5VG90YWwoYmVzdCkgPiAwID8gYCDCtyBtZWpvciBkw61hOiAke2VzYyhkYXlMb25nKGRheXNbYmVzdF0pLnNwbGl0KCcsJylbMF0pfSDwn4+GYCA6ICcnfTwvc3Bhbj48L2Rpdj4KICAgIDwvZGl2PgogICAgPGRpdiBjbGFzcz0icGFuZWwiPjxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj5Ub2RvcyBsb3MgbWFya2V0cGxhY2VzPC9oMj48ZGl2IGNsYXNzPSJsZWdlbmQiPiR7bWtzLm1hcChrID0+IGA8c3Bhbj48aSBjbGFzcz0iZG90IiBzdHlsZT0iYmFja2dyb3VuZDoke01LX0NPTE9SW2tdfSI+PC9pPiR7TUtba119PC9zcGFuPmApLmpvaW4oJycpfTwvZGl2PjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJwYW5lbC1ib2R5Ij48ZGl2IGNsYXNzPSJjaC1zbG90IiBkYXRhLW1rPSJhbGwiIGRhdGEtaD0iMjYwIj48L2Rpdj4ke3NhbGVzVGFibGUoZGF5cywgZCl9PC9kaXY+PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJzYWxlcy1ncmlkIj4ke21rcy5tYXAobWtDYXJkKS5qb2luKCcnKX08L2Rpdj4KICAgIDxkaXYgY2xhc3M9InBhbmVsIiBpZD0icHJvZFBhbmVsIiBzdHlsZT0ibWFyZ2luLXRvcDoxNHB4Ij48L2Rpdj4KICAgIDxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9ImZvbnQtc2l6ZToxMi41cHg7bWFyZ2luOjEwcHggMnB4Ij5Nb250b3MgcGFnYWRvcyBzZWfDum4gY2FkYSBtYXJrZXRwbGFjZSAoc2luIGNvc3RvIGRlIGVudsOtbyBlbiBNZXJjYWRvIExpYnJlKS4gTm8gaW5jbHV5ZSB2ZW50YXMgY2FuY2VsYWRhcy4ke2QudXBkYXRlZEF0ID8gJyBBY3R1YWxpemFkbyAnICsgZXNjKG5ldyBEYXRlKGQudXBkYXRlZEF0KS50b0xvY2FsZVRpbWVTdHJpbmcoJ2VzLUNMJywgeyBob3VyOiAnbnVtZXJpYycsIG1pbnV0ZTogJzItZGlnaXQnIH0pKSArICcuJyA6ICcnfTwvcD5gOwogIC8vIGxvcyBncsOhZmljb3Mgc2UgZGlidWphbiBhbCBhbmNobyByZWFsIGRlIHN1IGNhamE6IGVsIHRleHRvIHF1ZWRhIHNpZW1wcmUgZGVsIG1pc21vIHRhbWHDsW8geSBsZWdpYmxlCiAgY29uc3QgZHJhdyA9ICgpID0+ICQkKCcuY2gtc2xvdCcpLmZvckVhY2goZWwgPT4geyBjb25zdCB3ID0gZWwuY2xpZW50V2lkdGg7IGlmICghdyB8fCBlbC5fdyA9PT0gdykgcmV0dXJuOyBlbC5fdyA9IHc7IGVsLmlubmVySFRNTCA9IGNvbHVtbkNoYXJ0KGRheXMsIGVsLmRhdGFzZXQubWsgPT09ICdhbGwnID8gc3RhY2tzIDogW3N0YWNrcy5maW5kKHMgPT4gcy5rZXkgPT09IGVsLmRhdGFzZXQubWspXSwgeyBoZWlnaHQ6ICtlbC5kYXRhc2V0LmgsIHRvZGF5OiBkLnRvZGF5LCB3aWR0aDogdyB9KTsgfSk7CiAgZHJhdygpOwogIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdyZXNpemUnLCByZW5kZXJTYWxlcy5fcnMgfHwgKCgpID0+IHt9KSk7IHJlbmRlclNhbGVzLl9ycyA9ICgpID0+IHsgaWYgKHRhYiA9PT0gJ3NhbGVzJykgZHJhdygpOyB9OyB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgcmVuZGVyU2FsZXMuX3JzKTsKICBjb25zdCB0aXBFbCA9ICQoJyNjaFRpcCcpOwogICQoJyNzYWxlc0JvZHknKS5vbm1vdXNlbW92ZSA9IGUgPT4gewogICAgY29uc3QgaCA9IGUudGFyZ2V0LmNsb3Nlc3QoJy5jaC1oaXQnKTsKICAgIGlmICghaCkgeyB0aXBFbC5oaWRkZW4gPSB0cnVlOyByZXR1cm47IH0KICAgIGNvbnN0IFt0LCAuLi5yZXN0XSA9IGguZGF0YXNldC50aXAuc3BsaXQoJ3wnKTsKICAgIHRpcEVsLmlubmVySFRNTCA9IGA8Yj4ke2VzYyh0KX08L2I+JHtyZXN0Lm1hcChyID0+IGA8ZGl2PiR7ZXNjKHIpfTwvZGl2PmApLmpvaW4oJycpfWA7CiAgICB0aXBFbC5oaWRkZW4gPSBmYWxzZTsKICAgIGNvbnN0IHggPSBNYXRoLm1pbihlLmNsaWVudFggKyAxNCwgaW5uZXJXaWR0aCAtIHRpcEVsLm9mZnNldFdpZHRoIC0gOCk7CiAgICB0aXBFbC5zdHlsZS5sZWZ0ID0geCArICdweCc7IHRpcEVsLnN0eWxlLnRvcCA9IChlLmNsaWVudFkgKyAxNCkgKyAncHgnOwogIH07CiAgJCgnI3NhbGVzQm9keScpLm9ubW91c2VsZWF2ZSA9ICgpID0+IHsgdGlwRWwuaGlkZGVuID0gdHJ1ZTsgfTsKICByZW5kZXJQcm9kdWN0cygpOwogIGNsZWFyVGltZW91dChyZW5kZXJTYWxlcy5fdCk7IHJlbmRlclNhbGVzLl90ID0gc2V0VGltZW91dCgoKSA9PiB7IGlmICh0YWIgPT09ICdzYWxlcycpIHJlbmRlclNhbGVzKCk7IH0sIDUgKiA2MGUzKTsKfQoKLy8gLS0tLS0tLS0tLSBWRU5ERURPUkVTIChzb2xvIGxlY3R1cmEsIHBhcmEgZWwgZnVsZmlsbG1lbnQpIC0tLS0tLS0tLS0KYXN5bmMgZnVuY3Rpb24gcmVuZGVyU2VsbGVyc1ZpZXcoKSB7CiAgJCgnI21haW4nKS5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz0ic2VjdGlvbi10aXRsZSIgc3R5bGU9Im1hcmdpbi10b3A6MjJweCI+PGgyPlZlbmRlZG9yZXM8L2gyPjxzcGFuIGNsYXNzPSJtdXRlZCI+U29sbyBsZWN0dXJhOiBxdcOpIG1hcmtldHBsYWNlcyB0aWVuZSBjb25lY3RhZG9zIGNhZGEgdmVuZGVkb3IuPC9zcGFuPjwvZGl2PjxkaXYgY2xhc3M9InBhbmVsIj48ZGl2IGlkPSJzdkJvZHkiIGNsYXNzPSJwYW5lbC1ib2R5Ij48ZGl2IGNsYXNzPSJtdXRlZCI+Q2FyZ2FuZG/igKY8L2Rpdj48L2Rpdj48L2Rpdj5gOwogIGNvbnN0IHsgc2VsbGVyczogbGlzdCB9ID0gYXdhaXQgYXBpKCcvYXBpL3NlbGxlcnMvb3ZlcnZpZXcnKTsKICBjb25zdCBjb25uID0gYyA9PiBgPHNwYW4gY2xhc3M9Im1rICR7Yy5tYXJrZXRwbGFjZX0iPiR7TUtbYy5tYXJrZXRwbGFjZV19PC9zcGFuPiA8c3BhbiBjbGFzcz0ibm90ZSIgc3R5bGU9ImRpc3BsYXk6aW5saW5lIj4ke2Mub2sgPyAnQ29uZWN0YWRvJyA6ICc8YiBzdHlsZT0iY29sb3I6dmFyKC0tbG9jaykiPkNvbiBwcm9ibGVtYXM8L2I+J30ke2MubGFzdF9zeW5jX2F0ID8gJyDCtyByZXZpc2FkbyAnICsgZXNjKGZtdFRpbWUoYy5sYXN0X3N5bmNfYXQpKSA6ICcnfTwvc3Bhbj5gOwogICQoJyNzdkJvZHknKS5pbm5lckhUTUwgPSBsaXN0Lmxlbmd0aCA/IGA8ZGl2IGNsYXNzPSJ0YWJsZS13cmFwIj48dGFibGUgc3R5bGU9Im1pbi13aWR0aDo1MjBweCI+PHRoZWFkPjx0cj48dGg+VmVuZGVkb3I8L3RoPjx0aD5NYXJrZXRwbGFjZXMgY29uZWN0YWRvczwvdGg+PHRoPlBvciBpbXByaW1pcjwvdGg+PHRoPlByb2R1Y3RvcyBibG9xdWVhZG9zPC90aD48L3RyPjwvdGhlYWQ+PHRib2R5PgogICAgJHtsaXN0Lm1hcChzID0+IGA8dHI+PHRkPjxiPiR7ZXNjKHMubmFtZSl9PC9iPjwvdGQ+PHRkPjxkaXYgY2xhc3M9InN0YWNrIiBzdHlsZT0iZ2FwOjZweCI+JHtzLmNvbm5lY3Rpb25zLm1hcChjb25uKS5qb2luKCcnKSB8fCAnPHNwYW4gY2xhc3M9Im11dGVkIj5TaW4gbWFya2V0cGxhY2VzIGNvbmVjdGFkb3M8L3NwYW4+J308L2Rpdj48L3RkPjx0ZD4ke3MucGVuZGluZ308L3RkPjx0ZD4ke3MuYmxvY2tlZH08L3RkPjwvdHI+YCkuam9pbignJyl9CiAgICA8L3Rib2R5PjwvdGFibGU+PC9kaXY+YCA6IGA8ZGl2IGNsYXNzPSJlbXB0eSI+JHtFTVBUWV9TVkd9PGRpdj5Bw7puIG5vIGhheSB2ZW5kZWRvcmVzLjwvZGl2PjwvZGl2PmA7Cn0KCmZ1bmN0aW9uIHN0YXJ0Q2xvY2soKSB7CiAgY29uc3QgW2hoLCBtbV0gPSBtZS5jdXRvZmYuc3BsaXQoJzonKS5tYXAoTnVtYmVyKTsKICBjb25zdCB0aWNrID0gKCkgPT4gewogICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKSwgY3V0ID0gbmV3IERhdGUobm93KTsgY3V0LnNldEhvdXJzKGhoLCBtbSwgMCwgMCk7CiAgICBjb25zdCBjID0gJCgnI2Nsb2NrJyk7IGlmICghYykgcmV0dXJuOwogICAgaWYgKG5vdyA+PSBjdXQpIHsgY3V0LnNldERhdGUoY3V0LmdldERhdGUoKSArIDEpOyBjLmNsYXNzTGlzdC5hZGQoJ2xhdGUnKTsgfSBlbHNlIGMuY2xhc3NMaXN0LnJlbW92ZSgnbGF0ZScpOwogICAgY29uc3QgZCA9IE1hdGguZmxvb3IoKGN1dCAtIG5vdykgLyAxMDAwKTsKICAgICQoJyNjZCcpLnRleHRDb250ZW50ID0gW01hdGguZmxvb3IoZCAvIDM2MDApLCBNYXRoLmZsb29yKGQgJSAzNjAwIC8gNjApLCBkICUgNjBdLm1hcCh4ID0+IFN0cmluZyh4KS5wYWRTdGFydCgyLCAnMCcpKS5qb2luKCc6Jyk7CiAgfTsKICB0aWNrKCk7IGNsZWFySW50ZXJ2YWwoc3RhcnRDbG9jay5faSk7IHN0YXJ0Q2xvY2suX2kgPSBzZXRJbnRlcnZhbCh0aWNrLCAxMDAwKTsKfQoKbGV0IGVzID0gbnVsbCwgcmVmcmVzaFQgPSBudWxsOwpmdW5jdGlvbiBjb25uZWN0U3RyZWFtKCkgewogIGlmIChlcykgZXMuY2xvc2UoKTsKICBlcyA9IG5ldyBFdmVudFNvdXJjZSgnL2FwaS9zdHJlYW0nKTsKICBjb25zdCBsaXZlID0gb24gPT4geyBjb25zdCBsID0gJCgnI2xpdmUnKTsgaWYgKCFsKSByZXR1cm47IGwuY2xhc3NMaXN0LnRvZ2dsZSgnb24nLCBvbik7IGwubGFzdEVsZW1lbnRDaGlsZC50ZXh0Q29udGVudCA9IG9uID8gJ0VuIHZpdm8nIDogJ1JlY29uZWN0YW5kb+KApic7IH07CiAgZXMub25vcGVuID0gKCkgPT4gbGl2ZSh0cnVlKTsKICBlcy5vbmVycm9yID0gKCkgPT4gbGl2ZShmYWxzZSk7CiAgZXMuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgZXYgPT4gewogICAgY29uc3QgZCA9IEpTT04ucGFyc2UoZXYuZGF0YSk7CiAgICBjbGVhclRpbWVvdXQocmVmcmVzaFQpOwogICAgcmVmcmVzaFQgPSBzZXRUaW1lb3V0KCgpID0+IHsgaWYgKHRhYiA9PT0gJ3RyYXknKSBsb2FkT3JkZXJzKCk7IGVsc2UgaWYgKHRhYiA9PT0gJ3NlbGxlcicgJiYgWydvcmRlcicsICdsYWJlbCcsICdibG9ja2xpc3QnLCAnY29ubmVjdGlvbicsICdwcmludGVkJ10uaW5jbHVkZXMoZC50eXBlKSkgbG9hZFNlbGxlck9yZGVycygpOyB9LCA2MDApOwogIH0pOwp9CgovLyAtLS0tLS0tLS0tIEJBTkRFSkEgKGZ1bGZpbGxtZW50KSAtLS0tLS0tLS0tCi8vIC0tLS0tLS0tLS0gQkFOREVKQSAoZnVsZmlsbG1lbnQpIC0tLS0tLS0tLS0KY29uc3QgVEFCUyA9IFsKICBbJ3RvZGF5JywgJ1BhcmEgaW1wcmltaXIgaG95JywgJ1NhbGVuIGhveSAoaW5jbHV5ZSBGbGV4KScsIEkucHJpbnRdLAogIFsndXBjb21pbmcnLCAnUHLDs3hpbW9zIGTDrWFzJywgJ1NlIGRlc3BhY2hhbiBtw6FzIGFkZWxhbnRlJywgSS5ib3hdLAogIFsndW5ibG9ja2VkJywgJ0Rlc2Jsb3F1ZWFkYXMnLCAnUGVkaWRvcyBpbmNvbXBsZXRvcyBwb3IgaW1wcmltaXInLCBJLnByaW50XSwKICBbJ3dhaXRpbmcnLCAnRXNwZXJhbmRvIGV0aXF1ZXRhJywgJ0VsIG1hcmtldHBsYWNlIGHDum4gbm8gbGEgbGliZXJhJywgSS5jbG9ja10sCiAgWydwcmludGVkJywgJ0V0aXF1ZXRhcyBpbXByZXNhcycsICdJbXByZXNhcyBvIHlhIGVudmlhZGFzJywgSS5jaGVja10sCiAgWydibG9ja2VkJywgJ0Jsb3F1ZWFkYXMnLCAnTnVtZXJhZGFzOiBOwrAgMSwgMiwgM+KApicsIEkubG9ja10sCiAgWydibG9ja2VkUHJpbnRlZCcsICdCbG9xdWVhZGFzIGltcHJlc2FzJywgJ0xvIHF1ZSBoYXkgcXVlIHJlbGxlbmFyJywgSS5ib3hdLApdOwpjb25zdCBlbmRPZlRvZGF5ID0gKCkgPT4geyBjb25zdCBkID0gbmV3IERhdGUoKTsgZC5zZXRIb3VycygyMywgNTksIDU5LCA5OTkpOyByZXR1cm4gZDsgfTsKZnVuY3Rpb24gZGlzcGF0Y2hEYXRlKG8pIHsgY29uc3QgcyA9IG8uZGlzcGF0Y2hfYnk7IGlmICghcykgcmV0dXJuIG51bGw7IGNvbnN0IGQgPSBuZXcgRGF0ZShzLmluY2x1ZGVzKCdUJykgPyBzIDogcy5yZXBsYWNlKCcgJywgJ1QnKSk7IHJldHVybiBpc05hTihkKSA/IG51bGwgOiBkOyB9CmNvbnN0IGlzRm9yVG9kYXkgPSBvID0+IHsgY29uc3QgZCA9IGRpc3BhdGNoRGF0ZShvKTsgcmV0dXJuICFkIHx8IGQgPD0gZW5kT2ZUb2RheSgpOyB9OwovLyBsYXMgZGVzYmxvcXVlYWRhcyBxdWVkYW4gZW4gc3UgcHJvcGlhIHNlY2Npw7NuIGhhc3RhIHF1ZSBzZSBpbXByaW1lbgpjb25zdCBpc1VuYmxvY2tlZCA9IG8gPT4gQm9vbGVhbihvLnVuYmxvY2tlZF9ieSAmJiBvLmJsb2NrX25vKSAmJiBbJ3JlYWR5JywgJ3dhaXRpbmcnLCAnZXJyb3InXS5pbmNsdWRlcyhvLnN0YXRlKTsKLy8gaW1wcmVzYXMgZGUgcGVkaWRvcyBxdWUgdGVuw61hbiBwcm9kdWN0b3MgYmxvcXVlYWRvczogZWwgdmVuZGVkb3IgZGViZSBsbGV2YXIgbG8gcXVlIGZhbHRhCi8vIGN1YWxxdWllciBldGlxdWV0YSBpbXByZXNhIGNvbiBwcm9kdWN0b3MgYmxvcXVlYWRvcyB2YSBTT0xPIGEgIkJsb3F1ZWFkYXMgaW1wcmVzYXMiIChhdW5xdWUgbGEgaGF5YW4gaW1wcmVzbyBmdWVyYSBkZSBsYSBhcHApCi8vIHNvbG8gc2kgSE9ZIHRpZW5lIGFsZ8O6biBwcm9kdWN0byBibG9xdWVhZG8gKHNpIGVsIHZlbmRlZG9yIGxvIHNhY8OzIGRlIHN1IGxpc3RhLCB2dWVsdmUgYSAiRXRpcXVldGFzIGltcHJlc2FzIikKY29uc3QgaXNCbG9ja2VkUHJpbnRlZCA9IG8gPT4gKG8ubWlzc2luZ19pZHggfHwgW10pLmxlbmd0aCA+IDAgJiYgWydwcmludGVkJywgJ3NoaXBwZWQnXS5pbmNsdWRlcyhvLnN0YXRlKTsKY29uc3Qgd2Vla1N0YXJ0ID0gKCkgPT4geyBjb25zdCBkID0gbmV3IERhdGUoKTsgZC5zZXRIb3VycygwLCAwLCAwLCAwKTsgZC5zZXREYXRlKGQuZ2V0RGF0ZSgpIC0gKChkLmdldERheSgpICsgNikgJSA3KSk7IHJldHVybiBkOyB9Owpjb25zdCBwcmludGVkQXQgPSBvID0+IG8ucHJpbnRlZF9hdCA/IG5ldyBEYXRlKG8ucHJpbnRlZF9hdC5yZXBsYWNlKCcgJywgJ1QnKSArICdaJykgOiBudWxsOwpjb25zdCBpc1ByaW50ZWRUaGlzV2VlayA9IG8gPT4gWydwcmludGVkJywgJ3NoaXBwZWQnXS5pbmNsdWRlcyhvLnN0YXRlKSAmJiBwcmludGVkQXQobykgPj0gd2Vla1N0YXJ0KCk7Ci8vIHVuYSBldGlxdWV0YSBwdWVkZSBlc3RhciBlbiBtw6FzIGRlIHVuYSBzZWNjacOzbiAocC4gZWouICJJbXByZXNhcyBkZSBsYSBzZW1hbmEiIHkgIkJsb3F1ZWFkYXMgaW1wcmVzYXMiKQpjb25zdCBpblRhYkZuID0gKG8sIHQpID0+IHQgPT09ICd3ZWVrJyA/IGlzUHJpbnRlZFRoaXNXZWVrKG8pIDogdCA9PT0gJ2Jsb2NrZWRQcmludGVkJyA/IGlzQmxvY2tlZFByaW50ZWQobykgOiB0ID09PSAncHJpbnRlZCcgPyAodGFiT2YobykgPT09ICdwcmludGVkJyAmJiAhaXNCbG9ja2VkUHJpbnRlZChvKSkgOiB0YWJPZihvKSA9PT0gdDsKY29uc3QgdGFiT2YgPSBvID0+IGlzVW5ibG9ja2VkKG8pID8gJ3VuYmxvY2tlZCcgOiAoby5zdGF0ZSA9PT0gJ3JlYWR5JyA/IChpc0ZvclRvZGF5KG8pID8gJ3RvZGF5JyA6ICd1cGNvbWluZycpIDogby5zdGF0ZSA9PT0gJ2Vycm9yJyA/ICd3YWl0aW5nJyA6IG8uc3RhdGUgPT09ICdzaGlwcGVkJyA/ICdwcmludGVkJyA6IG8uc3RhdGUgPT09ICdjYW5jZWxsZWQnID8gbnVsbCA6IG8uc3RhdGUpOwovLyBwYXJhIGV0aXF1ZXRhcyB5YSBpbXByZXNhcyBvIGVudmlhZGFzOiBzZSBtYW50aWVuZSBjdcOhbmRvIGhhYsOtYSBxdWUgZGVzcGFjaGFybGFzIChzaW4gImF0cmFzYWRhIikKZnVuY3Rpb24gZGlzcGF0Y2hQbGFpbihvKSB7CiAgY29uc3QgZCA9IGRpc3BhdGNoRGF0ZShvKTsgaWYgKCFkKSByZXR1cm4gJyc7CiAgY29uc3QgaCA9IGhobW0oZCksIGhvcmEgPSBoID09PSAnMjM6NTknIHx8IGggPT09ICcwMDowMCcgPyAnJyA6ICcgYW50ZXMgZGUgbGFzICcgKyBhbXBtKGQpOwogIGNvbnN0IHQgPSBuZXcgRGF0ZSgpOyB0LnNldEhvdXJzKDAsIDAsIDAsIDApOyBjb25zdCB4ID0gbmV3IERhdGUoZCk7IHguc2V0SG91cnMoMCwgMCwgMCwgMCk7CiAgY29uc3QgZGlmZiA9IE1hdGgucm91bmQoKHggLSB0KSAvIDg2NGU1KTsKICBjb25zdCBkaWEgPSBkaWZmID09PSAwID8gJ2hveScgOiBkaWZmID09PSAtMSA/ICdheWVyJyA6IGRpZmYgPT09IDEgPyAnbWHDsWFuYScgOiAnZWwgJyArIGQudG9Mb2NhbGVEYXRlU3RyaW5nKCdlcy1DTCcsIHsgd2Vla2RheTogJ2xvbmcnLCBkYXk6ICdudW1lcmljJywgbW9udGg6ICdzaG9ydCcgfSk7CiAgcmV0dXJuIGBEZXNwYWNobzogJHtkaWF9JHtob3JhfSR7bWtEZWFkbGluZShvKX1gOwp9Ci8vIEZhbGFiZWxsYTogc2UgbXVlc3RyYSBlbCBwbGF6byByZWFsIGRlbCBtYXJrZXRwbGFjZSAobGEgYXBwIGxvIGFkZWxhbnRhIHVuIGTDrWEpCmZ1bmN0aW9uIG1rRGVhZGxpbmUobykgewogIGlmICghby5kaXNwYXRjaF9taykgcmV0dXJuICcnOwogIGNvbnN0IGQgPSBuZXcgRGF0ZShvLmRpc3BhdGNoX21rLmluY2x1ZGVzKCdUJykgPyBvLmRpc3BhdGNoX21rIDogby5kaXNwYXRjaF9tay5yZXBsYWNlKCcgJywgJ1QnKSk7IGlmIChpc05hTihkKSkgcmV0dXJuICcnOwogIHJldHVybiBgIMK3IHBsYXpvIEZhbGFiZWxsYSAke2QudG9Mb2NhbGVEYXRlU3RyaW5nKCdlcy1DTCcsIHsgd2Vla2RheTogJ3Nob3J0JywgZGF5OiAnbnVtZXJpYycgfSkucmVwbGFjZSgnLicsICcnKX1gOwp9CmZ1bmN0aW9uIGRpc3BhdGNoVGV4dChvKSB7IGNvbnN0IHQgPSBkaXNwYXRjaFRleHQwKG8pOyByZXR1cm4gdCA/IHQgKyBta0RlYWRsaW5lKG8pIDogdDsgfQpmdW5jdGlvbiBkaXNwYXRjaFRleHQwKG8pIHsKICBjb25zdCBkID0gZGlzcGF0Y2hEYXRlKG8pOyBpZiAoIWQpIHJldHVybiAnJzsKICBjb25zdCB0b2RheSA9IG5ldyBEYXRlKCk7IHRvZGF5LnNldEhvdXJzKDAsIDAsIDAsIDApOwogIGNvbnN0IGRheSA9IG5ldyBEYXRlKGQpOyBkYXkuc2V0SG91cnMoMCwgMCwgMCwgMCk7CiAgY29uc3QgZGlmZiA9IE1hdGgucm91bmQoKGRheSAtIHRvZGF5KSAvIDg2NGU1KTsKICBjb25zdCBoID0gaGhtbShkKTsKICBpZiAoZGlmZiA8IDApIHJldHVybiBgQXRyYXNhZGEgwrcgZGViw61hIHNhbGlyIGVsICR7ZC50b0xvY2FsZURhdGVTdHJpbmcoJ2VzLUNMJywgeyBkYXk6ICdudW1lcmljJywgbW9udGg6ICdzaG9ydCcgfSl9YDsKICBpZiAoZGlmZiA9PT0gMCkgcmV0dXJuIGggPT09ICcyMzo1OScgfHwgaCA9PT0gJzAwOjAwJyA/ICdEZXNwYWNoYXIgaG95JyA6IChkIDwgbmV3IERhdGUoKSA/IGBEZXNwYWNoYXIgaG95IMK3IGNvcnRlICR7YW1wbShkKX1gIDogYERlc3BhY2hhciBob3kgYW50ZXMgZGUgbGFzICR7YW1wbShkKX1gKTsKICBpZiAoZGlmZiA9PT0gMSkgcmV0dXJuIGBEZXNwYWNoYXIgbWHDsWFuYSR7aCA9PT0gJzIzOjU5JyB8fCBoID09PSAnMDA6MDAnID8gJycgOiAnIGFudGVzIGRlIGxhcyAnICsgYW1wbShkKX1gOwogIHJldHVybiBgRGVzcGFjaGFyIGVsICR7ZC50b0xvY2FsZURhdGVTdHJpbmcoJ2VzLUNMJywgeyB3ZWVrZGF5OiAnbG9uZycsIGRheTogJ251bWVyaWMnLCBtb250aDogJ3Nob3J0JyB9KX1gOwp9CmZ1bmN0aW9uIHRzKG8pIHsKICBjb25zdCBzID0gby5zb2xkX2F0IHx8ICcnOwogIGlmIChzKSB7IGNvbnN0IGQgPSBuZXcgRGF0ZShzLmluY2x1ZGVzKCdUJykgPyBzIDogcy5yZXBsYWNlKCcgJywgJ1QnKSk7IGlmICghaXNOYU4oZCkpIHJldHVybiBkOyB9CiAgcmV0dXJuIG5ldyBEYXRlKChvLmNyZWF0ZWRfYXQgfHwgJycpLnJlcGxhY2UoJyAnLCAnVCcpICsgJ1onKTsKfQpmdW5jdGlvbiBkYXlMYWJlbChkKSB7CiAgY29uc3QgdG9kYXkgPSBuZXcgRGF0ZSgpOyB0b2RheS5zZXRIb3VycygwLCAwLCAwLCAwKTsKICBjb25zdCB4ID0gbmV3IERhdGUoZCk7IHguc2V0SG91cnMoMCwgMCwgMCwgMCk7CiAgY29uc3QgZGlmZiA9IE1hdGgucm91bmQoKHRvZGF5IC0geCkgLyA4NjRlNSk7CiAgY29uc3QgZiA9IGQudG9Mb2NhbGVEYXRlU3RyaW5nKCdlcy1DTCcsIHsgd2Vla2RheTogJ2xvbmcnLCBkYXk6ICdudW1lcmljJywgbW9udGg6ICdsb25nJyB9KTsKICByZXR1cm4gZGlmZiA9PT0gMCA/IGBIb3kgwrcgJHtmfWAgOiBkaWZmID09PSAxID8gYEF5ZXIgwrcgJHtmfWAgOiBmLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgZi5zbGljZSgxKTsKfQpjb25zdCBoaG1tID0gZCA9PiBkLnRvTG9jYWxlVGltZVN0cmluZygnZXMtQ0wnLCB7IGhvdXI6ICcyLWRpZ2l0JywgbWludXRlOiAnMi1kaWdpdCcsIGhvdXJDeWNsZTogJ2gyMycgfSk7CmNvbnN0IGFtcG0gPSBkID0+IHsgY29uc3QgaCA9IGQuZ2V0SG91cnMoKSwgbSA9IFN0cmluZyhkLmdldE1pbnV0ZXMoKSkucGFkU3RhcnQoMiwgJzAnKTsgcmV0dXJuIGAke2ggJSAxMiB8fCAxMn06JHttfSAke2ggPCAxMiA/ICdBTScgOiAnUE0nfWA7IH07CgpmdW5jdGlvbiByZW5kZXJUcmF5KCkgewogIGlmICghdWkudGFiIHx8IHVpLnRhYiA9PT0gJ3JlYWR5JykgdWkudGFiID0gJ3RvZGF5JzsKICBjb25zdCBhdXRvID0gc3RvcmUuZ2V0KCdhdXRvJywgZmFsc2UpOwogICQoJyNtYWluJykuaW5uZXJIVE1MID0gYAogIDxkaXYgY2xhc3M9InNlY3Rpb24tdGl0bGUiIHN0eWxlPSJtYXJnaW4tdG9wOjIycHgiPjxoMj5FdGlxdWV0YXM8L2gyPjxzcGFuIGNsYXNzPSJtdXRlZCI+TGFzIG3DoXMgbnVldmFzIGFycmliYS4gU2UgYWN0dWFsaXphIHNvbGEuPC9zcGFuPjwvZGl2PgogIDxkaXYgY2xhc3M9InNoaXAtc3VtIiBpZD0ic2hpcFN1bSI+PC9kaXY+CiAgPGRpdiBjbGFzcz0idGFic2JpZyIgaWQ9InRhYnNCaWciPjwvZGl2PgogIDxkaXYgY2xhc3M9InBhbmVsIj4KICAgIDxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPgogICAgICA8ZGl2IGNsYXNzPSJjaGlwcyIgaWQ9Im1rQ2hpcHMiPjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJtc2VsIiBpZD0ic2VsbGVyRiI+PGJ1dHRvbiB0eXBlPSJidXR0b24iIGNsYXNzPSJtc2VsLWJ0biIgYXJpYS1oYXNwb3B1cD0idHJ1ZSIgYXJpYS1leHBhbmRlZD0iZmFsc2UiPlRvZG9zIGxvcyB2ZW5kZWRvcmVzPC9idXR0b24+PGRpdiBjbGFzcz0ibXNlbC1wb3AiIGhpZGRlbj48L2Rpdj48L2Rpdj4KICAgICAgPGlucHV0IHR5cGU9InNlYXJjaCIgaWQ9InEiIHBsYWNlaG9sZGVyPSJCdXNjYXIgY2xpZW50ZSwgcGVkaWRvIG8gU0tVIiB2YWx1ZT0iJHtlc2ModWkucSl9IiBhcmlhLWxhYmVsPSJCdXNjYXIiIHN0eWxlPSJ3aWR0aDphdXRvO21pbi13aWR0aDoyMjBweCI+CiAgICAgIDxzcGFuIGNsYXNzPSJzcGFjZXIiIHN0eWxlPSJmbGV4OjEiPjwvc3Bhbj4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1naG9zdCBidG4tc20iIGlkPSJzeW5jTm93Ij4ke0kuc3luY31CdXNjYXIgcGVkaWRvcyBhaG9yYTwvYnV0dG9uPgogICAgPC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJicGYiIGlkPSJicEZpbHRlciIgaGlkZGVuPjwvZGl2PgogICAgPGRpdiBjbGFzcz0iYWN0aW9uYmFyIiBpZD0iYWN0aW9uYmFyIj48L2Rpdj4KICAgIDxkaXYgaWQ9Imxpc3QiPjwvZGl2PgogIDwvZGl2PgogIDxkaXYgY2xhc3M9ImF1dG9iYXIiIHN0eWxlPSJtYXJnaW4tdG9wOjE2cHgiICR7bWUudXNlci5yb2xlID09PSAnc2VsbGVyJyA/ICdoaWRkZW4nIDogJyd9PgogICAgPGRpdj48bGFiZWwgY2xhc3M9InN3aXRjaCI+PGlucHV0IHR5cGU9ImNoZWNrYm94IiBpZD0iYXV0b0RsIiAke2F1dG8gPyAnY2hlY2tlZCcgOiAnJ30+IERlc2NhcmdhIGF1dG9tw6F0aWNhPC9sYWJlbD4KICAgIDxwPk1pZW50cmFzIGVzdGEgcGFudGFsbGEgZXN0w6kgYWJpZXJ0YSwgY2FkYSBldGlxdWV0YSBudWV2YSBzZSBkZXNjYXJnYSBzb2xhIGVuIFBERiB5IHBhc2EgYSAiSW1wcmVzYXMiLiBMYSBwcmltZXJhIHZleiBlbCBuYXZlZ2Fkb3IgcHVlZGUgcGVkaXIgcGVybWlzbyBwYXJhIGRlc2NhcmdhciB2YXJpb3MgYXJjaGl2b3MuPC9wPjwvZGl2PgogIDwvZGl2PmA7CiAgJCgnI2F1dG9EbCcpLm9uY2hhbmdlID0gZSA9PiB7IHN0b3JlLnNldCgnYXV0bycsIGUudGFyZ2V0LmNoZWNrZWQpOyB0b2FzdChlLnRhcmdldC5jaGVja2VkID8gJ0Rlc2NhcmdhIGF1dG9tw6F0aWNhIGFjdGl2YWRhJyA6ICdEZXNjYXJnYSBhdXRvbcOhdGljYSBkZXNhY3RpdmFkYScpOyBpZiAoZS50YXJnZXQuY2hlY2tlZCkgYXV0b0Rvd25sb2FkKCk7IH07CiAgJCgnI3N5bmNOb3cnKS5vbmNsaWNrID0gYXN5bmMgKCkgPT4geyBhd2FpdCBhcGkoJy9hcGkvc3luYycsIHsgbWV0aG9kOiAnUE9TVCcgfSk7IHRvYXN0KCdCdXNjYW5kbyBwZWRpZG9zIG51ZXZvcyBlbiBsb3MgbWFya2V0cGxhY2Vz4oCmJyk7IH07CiAgJCgnI3RhYnNCaWcnKS5vbmNsaWNrID0gZSA9PiB7IGNvbnN0IGIgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS10YWIyXScpOyBpZiAoIWIpIHJldHVybjsgdWkudGFiID0gYi5kYXRhc2V0LnRhYjI7IHNlbGVjdGVkLmNsZWFyKCk7IGRyYXdSb3dzKCk7IH07CiAgJCgnI21rQ2hpcHMnKS5vbmNsaWNrID0gZSA9PiB7IGNvbnN0IGIgPSBlLnRhcmdldC5jbG9zZXN0KCcuY2hpcCcpOyBpZiAoIWIpIHJldHVybjsgdWkubWsgPSBiLmRhdGFzZXQubWs7IGRyYXdSb3dzKCk7IH07CiAgLy8gZmlsdHJvIGRlIHZlbmRlZG9yZXM6IHNlIHB1ZWRlbiBtYXJjYXIgdmFyaW9zIGEgbGEgdmV6IChuaW5ndW5vIG1hcmNhZG8gPSB0b2RvcykKICBjb25zdCBzZkJveCA9ICQoJyNzZWxsZXJGJyk7CiAgc2ZCb3gucXVlcnlTZWxlY3RvcignLm1zZWwtYnRuJykub25jbGljayA9ICgpID0+IHsgY29uc3QgcG9wID0gc2ZCb3gucXVlcnlTZWxlY3RvcignLm1zZWwtcG9wJyk7IHBvcC5oaWRkZW4gPSAhcG9wLmhpZGRlbjsgc2ZCb3gucXVlcnlTZWxlY3RvcignLm1zZWwtYnRuJykuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgU3RyaW5nKCFwb3AuaGlkZGVuKSk7IH07CiAgc2ZCb3gucXVlcnlTZWxlY3RvcignLm1zZWwtcG9wJykub25jaGFuZ2UgPSBlID0+IHsKICAgIGNvbnN0IHYgPSBlLnRhcmdldC52YWx1ZTsgaWYgKCF2KSByZXR1cm47CiAgICBpZiAodiA9PT0gJ2FsbCcpIHVpLnNlbGxlcnMuY2xlYXIoKTsgZWxzZSBlLnRhcmdldC5jaGVja2VkID8gdWkuc2VsbGVycy5hZGQodikgOiB1aS5zZWxsZXJzLmRlbGV0ZSh2KTsKICAgIGRyYXdTZWxsZXJGaWx0ZXIoKTsgZHJhd1Jvd3MoKTsKICB9OwogIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZSA9PiB7IGlmICghZS50YXJnZXQuY2xvc2VzdCgnI3NlbGxlckYnKSkgeyBjb25zdCBwb3AgPSAkKCcjc2VsbGVyRiAubXNlbC1wb3AnKTsgaWYgKHBvcCkgcG9wLmhpZGRlbiA9IHRydWU7IH0gfSk7CiAgJCgnI3EnKS5vbmlucHV0ID0gZSA9PiB7IHVpLnEgPSBlLnRhcmdldC52YWx1ZS50cmltKCkudG9Mb3dlckNhc2UoKTsgZHJhd1Jvd3MoKTsgfTsKICAkKCcjbGlzdCcpLm9uY2hhbmdlID0gZSA9PiB7IGNvbnN0IGlkID0gZS50YXJnZXQuZGF0YXNldC5pZDsgaWYgKCFpZCkgcmV0dXJuOyBlLnRhcmdldC5jaGVja2VkID8gc2VsZWN0ZWQuYWRkKCtpZCkgOiBzZWxlY3RlZC5kZWxldGUoK2lkKTsgZHJhd0FjdGlvbmJhcigpOyB9OwogICQoJyNsaXN0Jykub25jbGljayA9IGFzeW5jIGUgPT4gewogICAgY29uc3QgYiA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLWFjdF0nKTsgaWYgKCFiKSByZXR1cm47CiAgICBjb25zdCBpZCA9ICtiLmRhdGFzZXQuaWQ7CiAgICBpZiAoYi5kYXRhc2V0LmFjdCA9PT0gJ3ByaW50JykgeyBpZiAobWUudXNlci5yb2xlID09PSAnc2VsbGVyJyAmJiAhY29uZmlybSgnU2kgbGEgaW1wcmltZXMgdMO6LCBxdWVkYSBjb21vIGltcHJlc2EgcG9yIHR1IHRpZW5kYSB5IGVsIGZ1bGZpbGxtZW50IGxhIHZlcsOhIGVuIHJvam8gY29tbyAiRXRpcXVldGEgaW1wcmVzYSIuIMK/SW1wcmltaXI/JykpIHJldHVybjsgd2luZG93Lm9wZW4oYC9hcGkvb3JkZXJzLyR7aWR9L2xhYmVsLnBkZj9tYXJrPTFgLCAnX2JsYW5rJyk7IHNldFRpbWVvdXQobG9hZE9yZGVycywgMTIwMCk7IHRvYXN0KCdFdGlxdWV0YSBhYmllcnRhIMK3IHBhc8OzIGEgIkV0aXF1ZXRhcyBpbXByZXNhcyInKTsgfQogICAgaWYgKGIuZGF0YXNldC5hY3QgPT09ICdyZXByaW50Jykgd2luZG93Lm9wZW4oYC9hcGkvb3JkZXJzLyR7aWR9L2xhYmVsLnBkZmAsICdfYmxhbmsnKTsKICAgIGlmIChiLmRhdGFzZXQuYWN0ID09PSAncmV0cnknKSB7IGIuZGlzYWJsZWQgPSB0cnVlOyB0cnkgeyBhd2FpdCBhcGkoYC9hcGkvb3JkZXJzLyR7aWR9L3JldHJ5YCwgeyBtZXRob2Q6ICdQT1NUJyB9KTsgdG9hc3QoJ1JlaW50ZW50YW5kb+KApicpOyBsb2FkT3JkZXJzKCk7IH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IH0gfQogICAgaWYgKGIuZGF0YXNldC5hY3QgPT09ICd1bmJsb2NrJykgewogICAgICBpZiAoIWNvbmZpcm0oJ8K/RGVzYmxvcXVlYXIgZXN0YSBldGlxdWV0YT8gUGFzYSBhIGxhIHNlY2Npw7NuICJEZXNibG9xdWVhZGFzIi4gRW4gbGEgaG9qYSBkZWwgcGVkaWRvIHNhbGRyw6Egc3UgbsO6bWVybyB5IHF1ZWRhcsOhbiBtYXJjYWRvcyBjb24gIkZBTFRBIiBsb3MgcHJvZHVjdG9zIHF1ZSBzZSByZWxsZW5hbiBhcGFydGUuJykpIHJldHVybjsKICAgICAgYi5kaXNhYmxlZCA9IHRydWU7IHRyeSB7IGF3YWl0IGFwaShgL2FwaS9vcmRlcnMvJHtpZH0vdW5ibG9ja2AsIHsgbWV0aG9kOiAnUE9TVCcgfSk7IHRvYXN0KCdFdGlxdWV0YSBkZXNibG9xdWVhZGEgwrcgcGFzw7MgYSAiRGVzYmxvcXVlYWRhcyInKTsgbG9hZE9yZGVycygpOyB9IGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UpOyBiLmRpc2FibGVkID0gZmFsc2U7IH0KICAgIH0KICAgIGlmIChiLmRhdGFzZXQuYWN0ID09PSAncmVibG9jaycpIHsgdHJ5IHsgYXdhaXQgYXBpKGAvYXBpL29yZGVycy8ke2lkfS9yZWJsb2NrYCwgeyBtZXRob2Q6ICdQT1NUJyB9KTsgdG9hc3QoJ0V0aXF1ZXRhIGJsb3F1ZWFkYSBvdHJhIHZleicpOyBsb2FkT3JkZXJzKCk7IH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IH0gfQogICAgaWYgKGIuZGF0YXNldC5hY3QgPT09ICd1bnByaW50JykgeyBhd2FpdCBhcGkoYC9hcGkvb3JkZXJzLyR7aWR9L3VucHJpbnRgLCB7IG1ldGhvZDogJ1BPU1QnIH0pOyB0b2FzdCgnVm9sdmnDsyBhICJFdGlxdWV0YXMgcG9yIGltcHJpbWlyIicpOyBsb2FkT3JkZXJzKCk7IH0KICB9OwogICQoJyNhY3Rpb25iYXInKS5vbmNsaWNrID0gZSA9PiB7CiAgICBjb25zdCBiID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtYnVsa10nKTsgaWYgKCFiKSByZXR1cm47CiAgICBpZiAoYi5kYXRhc2V0LmJ1bGsgPT09ICdhbGwnKSBkb3dubG9hZEJhdGNoKHZpc2libGVJbih1aS50YWIpLm1hcChvID0+IG8uaWQpKTsKICAgIGlmIChiLmRhdGFzZXQuYnVsayA9PT0gJ3NlbCcpIGRvd25sb2FkQmF0Y2goWy4uLnNlbGVjdGVkXSk7CiAgICBpZiAoYi5kYXRhc2V0LmJ1bGsgPT09ICdzZWxhbGwnKSB7IHZpc2libGVJbih1aS50YWIpLmZvckVhY2gobyA9PiBzZWxlY3RlZC5hZGQoby5pZCkpOyBkcmF3Um93cygpOyB9CiAgICBpZiAoYi5kYXRhc2V0LmJ1bGsgPT09ICdub25lJykgeyBzZWxlY3RlZC5jbGVhcigpOyBkcmF3Um93cygpOyB9CiAgfTsKICBsb2FkT3JkZXJzKCk7Cn0KCmFzeW5jIGZ1bmN0aW9uIGxvYWRPcmRlcnMoKSB7CiAgaWYgKHRhYiAhPT0gJ3RyYXknKSByZXR1cm47CiAgY29uc3QgZCA9IGF3YWl0IGFwaSgnL2FwaS9vcmRlcnM/dmlldz1hbGwnKTsKICBjb25zdCBwcmV2UmVhZHkgPSBuZXcgU2V0KG9yZGVycy5maWx0ZXIobyA9PiBvLnN0YXRlID09PSAncmVhZHknKS5tYXAobyA9PiBvLmlkKSk7CiAgb3JkZXJzID0gZC5vcmRlcnMuc29ydCgoYSwgYikgPT4gdHMoYikgLSB0cyhhKSk7CiAgc2VsbGVycyA9IGQuc2VsbGVyczsKICBkcmF3U2VsbGVyRmlsdGVyKCk7CiAgY29uc3QgZnJlc2ggPSBvcmRlcnMuZmlsdGVyKG8gPT4gby5zdGF0ZSA9PT0gJ3JlYWR5JyAmJiAhcHJldlJlYWR5LmhhcyhvLmlkKSkubWFwKG8gPT4gby5pZCk7CiAgZHJhd1Jvd3MoZmlyc3RMb2FkID8gW10gOiBmcmVzaCk7CiAgaWYgKCFmaXJzdExvYWQgJiYgZnJlc2gubGVuZ3RoKSB0b2FzdChgJHtmcmVzaC5sZW5ndGh9IGV0aXF1ZXRhJHtmcmVzaC5sZW5ndGggPiAxID8gJ3MnIDogJyd9IG51ZXZhJHtmcmVzaC5sZW5ndGggPiAxID8gJ3MnIDogJyd9IHBvciBpbXByaW1pcmApOwogIGZpcnN0TG9hZCA9IGZhbHNlOwogIGlmIChzdG9yZS5nZXQoJ2F1dG8nLCBmYWxzZSkpIGF1dG9Eb3dubG9hZCgpOwp9Cgpjb25zdCBzZWxsZXJPayA9IG8gPT4gIXVpLnNlbGxlcnMuc2l6ZSB8fCB1aS5zZWxsZXJzLmhhcyhTdHJpbmcoby5zZWxsZXJfaWQpKTsKZnVuY3Rpb24gZHJhd1NlbGxlckZpbHRlcigpIHsKICBjb25zdCBib3ggPSAkKCcjc2VsbGVyRicpOyBpZiAoIWJveCkgcmV0dXJuOwogIGZvciAoY29uc3QgaWQgb2YgWy4uLnVpLnNlbGxlcnNdKSBpZiAoIXNlbGxlcnMuc29tZShzID0+IFN0cmluZyhzLmlkKSA9PT0gaWQpKSB1aS5zZWxsZXJzLmRlbGV0ZShpZCk7CiAgY29uc3QgbiA9IHVpLnNlbGxlcnMuc2l6ZTsKICBib3gucXVlcnlTZWxlY3RvcignLm1zZWwtYnRuJykudGV4dENvbnRlbnQgPSAhbiA/ICdUb2RvcyBsb3MgdmVuZGVkb3JlcycgOiBuID09PSAxID8gKHNlbGxlcnMuZmluZChzID0+IHVpLnNlbGxlcnMuaGFzKFN0cmluZyhzLmlkKSkpPy5uYW1lIHx8ICcxIHZlbmRlZG9yJykgOiBgJHtufSB2ZW5kZWRvcmVzYDsKICBib3guY2xhc3NMaXN0LnRvZ2dsZSgnb24nLCBuID4gMCk7CiAgYm94LnF1ZXJ5U2VsZWN0b3IoJy5tc2VsLXBvcCcpLmlubmVySFRNTCA9IGA8bGFiZWwgY2xhc3M9Im1zZWwtYWxsIj48aW5wdXQgdHlwZT0iY2hlY2tib3giIHZhbHVlPSJhbGwiICR7IW4gPyAnY2hlY2tlZCcgOiAnJ30+IFRvZG9zIGxvcyB2ZW5kZWRvcmVzPC9sYWJlbD5gICsKICAgIHNlbGxlcnMubWFwKHMgPT4gYDxsYWJlbD48aW5wdXQgdHlwZT0iY2hlY2tib3giIHZhbHVlPSIke3MuaWR9IiAke3VpLnNlbGxlcnMuaGFzKFN0cmluZyhzLmlkKSkgPyAnY2hlY2tlZCcgOiAnJ30+ICR7ZXNjKHMubmFtZSl9PC9sYWJlbD5gKS5qb2luKCcnKTsKfQpjb25zdCBtYXRjaGVzRmlsdGVycyA9IG8gPT4gKHVpLm1rID09PSAnYWxsJyB8fCBvLm1hcmtldHBsYWNlID09PSB1aS5taykgJiYgc2VsbGVyT2sobykgJiYKICAoIXVpLnEgfHwgby5vcmRlcl9udW1iZXIudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyh1aS5xKSB8fCAoby5jdXN0b21lciB8fCAnJykudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyh1aS5xKSB8fCBvLml0ZW1zLnNvbWUoaSA9PiBbaS5za3UsIGkucHViX2lkLCBpLm5hbWVdLmpvaW4oJyAnKS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHVpLnEpKSk7CmNvbnN0IHZpc2libGVJbiA9IHQgPT4gb3JkZXJzLmZpbHRlcihvID0+IGluVGFiRm4obywgdCkgJiYgbWF0Y2hlc0ZpbHRlcnMobykpOwovLyBFbiAiUG9yIGltcHJpbWlyIiB0YW1iacOpbiBzZSBxdWVkYW4gbGFzIHF1ZSBzZSBpbXByaW1pZXJvbiBlbiBsYXMgw7psdGltYXMgMTIgaG9yYXMsIGVuIHJvam8gY29uICJWb2x2ZXIgYSBpbXByaW1pciIKY29uc3QgcHJpbnRlZFJlY2VudGx5ID0gbyA9PiBvLnN0YXRlID09PSAncHJpbnRlZCcgJiYgby5wcmludGVkX2F0ICYmIERhdGUubm93KCkgLSBuZXcgRGF0ZShvLnByaW50ZWRfYXQucmVwbGFjZSgnICcsICdUJykgKyAnWicpIDwgMTIgKiAzNjAwZTM7Ci8vIEJsb3F1ZWFkYXMgaW1wcmVzYXM6IMK/ZWwgZnVsZmlsbG1lbnQgdGllbmUgcXVlIHJlbGxlbmFyICh0aWVuZSBhbCBtZW5vcyB1biBwcm9kdWN0bykgbyBubyBsZSB0b2NhIG5hZGE/CmNvbnN0IGJwS2luZCA9IG8gPT4gKChvLm1pc3NpbmdfaWR4IHx8IFtdKS5sZW5ndGggPj0gKG8uaXRlbXMgfHwgW10pLmxlbmd0aCA/ICdub25lJyA6ICdmaWxsJyk7CmZ1bmN0aW9uIHZpc2libGUoKSB7CiAgaWYgKHVpLnRhYiA9PT0gJ2Jsb2NrZWRQcmludGVkJyAmJiB1aS5icGYgIT09ICdhbGwnKSByZXR1cm4gdmlzaWJsZUluKHVpLnRhYikuZmlsdGVyKG8gPT4gYnBLaW5kKG8pID09PSB1aS5icGYpOwogIGlmICh1aS50YWIgPT09ICdibG9ja2VkJyAmJiB1aS5iZGYgIT09ICdhbGwnKSByZXR1cm4gdmlzaWJsZUluKHVpLnRhYikuZmlsdGVyKG8gPT4gKHVpLmJkZiA9PT0gJ3RvZGF5JykgPT09IGlzRm9yVG9kYXkobykpOwogIC8vIGxhcyBpbXByZXNhcyBzYWxlbiBkZSAiUGFyYSBpbXByaW1pciBob3kiIHkgcXVlZGFuIHNvbG8gZW4gIkV0aXF1ZXRhcyBpbXByZXNhcyIgbyAiQmxvcXVlYWRhcyBpbXByZXNhcyIKICByZXR1cm4gdmlzaWJsZUluKHVpLnRhYik7Cn0KCmZ1bmN0aW9uIGl0ZW1zSFRNTChvKSB7CiAgY29uc3QgYmFkID0gbmV3IFNldChvLm1pc3NpbmdfaWR4IHx8IFtdKTsKICBjb25zdCBtaXhlZCA9IGJhZC5zaXplID4gMDsgLy8gcGVkaWRvIGNvbiBwcm9kdWN0b3MgYmxvcXVlYWRvczogcm9qbyA9IG5vIGxvIHRpZW5lIGVsIGZ1bGZpbGxtZW50LCB2ZXJkZSA9IHPDrSBsbyB0aWVuZQogIHJldHVybiBgPGRpdiBjbGFzcz0iaXRlbXMiPiR7by5pdGVtcy5tYXAoKGksIG4pID0+IGA8c3BhbiBjbGFzcz0iJHtiYWQuaGFzKG4pID8gJ2JhZCcgOiAnZ29vZCd9Ij4ke2JhZC5oYXMobikgPyAnPGVtIGNsYXNzPSJmYWx0YSI+RkFMVEE8L2VtPiAnIDogbWl4ZWQgPyAnPGVtIGNsYXNzPSJ0aWVuZSI+VElFTkU8L2VtPiAnIDogJyd9PGI+JHtlc2MoaS5xdHkpfcOXPC9iPiAke2VzYyhpLm5hbWUpfSR7aS52YXJpYW50ID8gYCA8c3BhbiBjbGFzcz0idiI+wrcgJHtlc2MoaS52YXJpYW50KX08L3NwYW4+YCA6ICcnfSA8c3BhbiBjbGFzcz0ibW9ubyB2Ij4ke2VzYyhpLnNrdSB8fCBpLnB1Yl9pZCl9PC9zcGFuPjwvc3Bhbj5gKS5qb2luKCcnKX08L2Rpdj5gOwp9CmZ1bmN0aW9uIHBpbGwobykgeyByZXR1cm4gYDxzcGFuIGNsYXNzPSJwaWxsICR7by5zdGF0ZX0iPiR7cGlsbEljb25bby5zdGF0ZV0gfHwgJyd9JHtTVEFURVtvLnN0YXRlXSB8fCBvLnN0YXRlfTwvc3Bhbj5gOyB9CgovLyBSZXN1bWVuIGFycmliYTogY3XDoW50b3MgZW52w61vcyBzYWxlbiAoaG95IG8gZW4gZWwgcHLDs3hpbW8gZMOtYSBkZSBkZXNwYWNobykgcG9yIHRpcG8geSBwb3IgY3VlbnRhCmZ1bmN0aW9uIGRyYXdTaGlwU3VtbWFyeSgpIHsKICBjb25zdCBib3ggPSAkKCcjc2hpcFN1bScpOyBpZiAoIWJveCkgcmV0dXJuOwogIGNvbnN0IG9wZW4gPSBvcmRlcnMuZmlsdGVyKG8gPT4gIVsnc2hpcHBlZCcsICdjYW5jZWxsZWQnXS5pbmNsdWRlcyhvLnN0YXRlKSk7CiAgY29uc3QgZGF5T2YgPSBvID0+IHsgY29uc3QgZCA9IGRpc3BhdGNoRGF0ZShvKTsgcmV0dXJuIGQgPyBpc28oZCkgOiBpc28obmV3IERhdGUoKSk7IH07CiAgY29uc3QgdG9kYXkgPSBpc28obmV3IERhdGUoKSk7CiAgY29uc3QgY2F0ID0gbyA9PiBvLm1hcmtldHBsYWNlID09PSAnbWwnID8gKG8uc2hpcF90eXBlID09PSAnRmxleCcgPyAnZmxleCcgOiAnY2UnKSA6IG8ubWFya2V0cGxhY2U7CiAgY29uc3QgQ0FUUyA9IFtbJ2NlJywgJ0NlbnRybyBlbnbDrW8gTUwnLCBNS19DT0xPUi5tbF0sIFsnZmxleCcsICdGbGV4JywgJyMyMzk0NkEnXSwgWydmYScsICdGYWxhYmVsbGEnLCBNS19DT0xPUi5mYV0sIFsncGEnLCAnUGFyaXMnLCBNS19DT0xPUi5wYV1dOwogIGNvbnN0IGVmZiA9IG8gPT4gKGRheU9mKG8pIDwgdG9kYXkgPyB0b2RheSA6IGRheU9mKG8pKTsKICAvLyBDYWRhIGNhbmFsIHRpZW5lIHN1IHByb3BpbyBwcsOzeGltbyBkw61hIGRlIGRlc3BhY2hvIChwLiBlai4gTUwgZWwgbHVuZXMgeSBGYWxhYmVsbGEgZWwgbWFydGVzKToKICAvLyBlbiAiUHLDs3hpbW8iIHNlIGN1ZW50YSwgcG9yIGNhbmFsLCBsbyBxdWUgdmVuY2UgZW4gc3Ugc2lndWllbnRlIGTDrWEgZGUgZGVzcGFjaG8uCiAgY29uc3QgdGFyZ2V0T2YgPSB7fTsKICBmb3IgKGNvbnN0IFtrXSBvZiBDQVRTKSB0YXJnZXRPZltrXSA9IHVpLnNoaXBEYXkgPT09ICd0b2RheScgPyB0b2RheSA6IChvcGVuLmZpbHRlcihvID0+IGNhdChvKSA9PT0gaykubWFwKGVmZikuZmlsdGVyKGQgPT4gZCA+IHRvZGF5KS5zb3J0KClbMF0gfHwgbnVsbCk7CiAgY29uc3QgbGlzdCA9IG9wZW4uZmlsdGVyKG8gPT4gdGFyZ2V0T2ZbY2F0KG8pXSAmJiBlZmYobykgPT09IHRhcmdldE9mW2NhdChvKV0pOwogIGNvbnN0IGNvdW50ID0gKGFyciwgaykgPT4gYXJyLmZpbHRlcihvID0+IGNhdChvKSA9PT0gaykubGVuZ3RoOwogIGNvbnN0IGRheVMgPSBkID0+IGVzYyhuZXcgRGF0ZShkICsgJ1QxMjowMDowMCcpLnRvTG9jYWxlRGF0ZVN0cmluZygnZXMtQ0wnLCB7IHdlZWtkYXk6ICdzaG9ydCcsIGRheTogJ251bWVyaWMnIH0pLnJlcGxhY2UoL1wuL2csICcnKSk7CiAgLy8gUGFyYSBlbCBjb250ZW8gZGVsIGZ1bGZpbGxtZW50IG5vIGN1ZW50YW4gbGFzIGV0aXF1ZXRhcyBibG9xdWVhZGFzIGFsIDEwMCUgKG5vIHRpZW5lIG5pbmd1bm8gZGUgc3VzIHByb2R1Y3Rvcyk7CiAgLy8gc8OtIGN1ZW50YW4gbGFzIHF1ZSB0aWVuZW4gYWwgbWVub3MgdW4gcHJvZHVjdG8gcXVlIGVsIGZ1bGZpbGxtZW50IHRpZW5lLgogIGNvbnN0IG5vbmVGZiA9IG8gPT4gKG8ubWlzc2luZ19pZHggfHwgW10pLmxlbmd0aCA+IDAgJiYgKG8ubWlzc2luZ19pZHggfHwgW10pLmxlbmd0aCA+PSAoby5pdGVtcyB8fCBbXSkubGVuZ3RoOwogIGNvbnN0IGZmID0gbGlzdC5maWx0ZXIobyA9PiAhbm9uZUZmKG8pKTsKICBjb25zdCBieVNlbGxlciA9IFsuLi5uZXcgU2V0KGxpc3QubWFwKG8gPT4gby5zZWxsZXIpKV0uc29ydCgpLm1hcChuID0+IFtuLCBmZi5maWx0ZXIobyA9PiBvLnNlbGxlciA9PT0gbiksIGxpc3QuZmlsdGVyKG8gPT4gby5zZWxsZXIgPT09IG4pXSk7CiAgY29uc3QgY3V0UyA9IChhcnIsIGspID0+IHsgY29uc3QgdCA9IHRhcmdldE9mW2tdOyBpZiAoIXQpIHJldHVybiAnJzsgY29uc3QgaHMgPSBhcnIuZmlsdGVyKG8gPT4gY2F0KG8pID09PSBrKS5tYXAoZGlzcGF0Y2hEYXRlKS5maWx0ZXIoZCA9PiBkICYmIGlzbyhkKSA9PT0gdCAmJiAhWycyMzo1OScsICcwMDowMCddLmluY2x1ZGVzKGhobW0oZCkpKS5zb3J0KChhLCBiKSA9PiBhIC0gYik7IHJldHVybiAodWkuc2hpcERheSA9PT0gJ3RvZGF5JyA/ICcnIDogZGF5Uyh0KSArICcgJykgKyAoaHMubGVuZ3RoID8gYW1wbShoc1swXSkgOiAnJyk7IH07CiAgY29uc3QgZXhjbCA9IGxpc3QubGVuZ3RoIC0gZmYubGVuZ3RoOwogIGNvbnN0IGZmUHJpbnRlZCA9IGZmLmZpbHRlcihvID0+IG8uc3RhdGUgPT09ICdwcmludGVkJykubGVuZ3RoOyAvLyBsYXMgaW1wcmVzYXMgc2lndWVuIGNvbnRhbmRvOiBzYWxlbiBpZ3VhbCBlc2UgZMOtYQogIGJveC5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz0ic3N4Ij4KICAgICAgPHNwYW4gY2xhc3M9InNzeC10Ij7wn5qaIFBhcXVldGVzIGZ1bGZpbGxtZW50ICR7dWkuc2hpcERheSA9PT0gJ3RvZGF5JyA/ICdob3knIDogJ3Byw7N4aW1vIGRlc3BhY2hvJ308L3NwYW4+CiAgICAgICR7Q0FUUy5tYXAoKFtrLCBuLCBjXSkgPT4gYDxzcGFuIGNsYXNzPSJzc3gtaSIgc3R5bGU9Ii0tYzoke2N9Ij48aT48L2k+JHtufSA8Yj4ke2NvdW50KGZmLCBrKX08L2I+JHtjdXRTKGZmLCBrKSA/IGA8c21hbGwgdGl0bGU9IkhvcmEgZGUgY29ydGUiPuKPsCR7Y3V0UyhmZiwgayl9PC9zbWFsbD5gIDogJyd9PC9zcGFuPmApLmpvaW4oJycpfQogICAgICA8c3BhbiBjbGFzcz0ic3N4LWkgc3N4LXRvdCIgdGl0bGU9IkV0aXF1ZXRhcyBkb25kZSBlbCBmdWxmaWxsbWVudCB0aWVuZSBhbCBtZW5vcyB1biBwcm9kdWN0byAoaW1wcmVzYXMgeSBwb3IgaW1wcmltaXIpIj5GdWxmaWxsbWVudCA8Yj4ke2ZmLmxlbmd0aH08L2I+PHNtYWxsPigke2ZmUHJpbnRlZH0gaW1wcmVzYXMgwrcgJHtmZi5sZW5ndGggLSBmZlByaW50ZWR9IHBvciBpbXByaW1pcik8L3NtYWxsPjwvc3Bhbj4KICAgICAgPHNwYW4gY2xhc3M9InNzeC1pIHNzeC1hbGwiIHRpdGxlPSJUb2RhcyBsYXMgZXRpcXVldGFzIGRlbCBkw61hLCBpbmNsdWlkYXMgbGFzIGJsb3F1ZWFkYXMgYWwgMTAwJSI+VG9kYXMgbGFzIGV0aXF1ZXRhcyA8Yj4ke2xpc3QubGVuZ3RofTwvYj4ke2V4Y2wgPyBgPHNtYWxsPigke2V4Y2x9IGJsb3F1ZWFkYSR7ZXhjbCA+IDEgPyAncycgOiAnJ30gMTAwJSk8L3NtYWxsPmAgOiAnJ308L3NwYW4+CiAgICAgIDxzcGFuIGNsYXNzPSJzc3gtciI+CiAgICAgICR7YnlTZWxsZXIubGVuZ3RoID8gYDxidXR0b24gY2xhc3M9InNzeC1tb3JlIiBkYXRhLW1vcmU9IjEiPiR7dWkuc2hpcE9wZW4gPyAnT2N1bHRhciBjdWVudGFzIOKWtCcgOiAnUG9yIGN1ZW50YSDilr4nfTwvYnV0dG9uPmAgOiAnJ30KICAgICAgPHNwYW4gY2xhc3M9InNzeC1zdyI+PGJ1dHRvbiBkYXRhLXNkPSJ0b2RheSIgYXJpYS1wcmVzc2VkPSIke3VpLnNoaXBEYXkgPT09ICd0b2RheSd9Ij5Ib3k8L2J1dHRvbj48YnV0dG9uIGRhdGEtc2Q9Im5leHQiIGFyaWEtcHJlc3NlZD0iJHt1aS5zaGlwRGF5ICE9PSAndG9kYXknfSI+UHLDs3hpbW88L2J1dHRvbj48L3NwYW4+PC9zcGFuPgogICAgPC9kaXY+CiAgICAke2J5U2VsbGVyLmxlbmd0aCAmJiB1aS5zaGlwT3BlbiA/IGA8ZGl2IGNsYXNzPSJzc3gtZGV0Ij48ZGl2IGNsYXNzPSJ0YWJsZS13cmFwIj48dGFibGUgY2xhc3M9InNzLXRhYmxlIj48dGhlYWQ+PHRyPjx0aD5DdWVudGE8L3RoPiR7Q0FUUy5tYXAoKFssIG5dKSA9PiBgPHRoIGNsYXNzPSJudW0iPiR7bn08L3RoPmApLmpvaW4oJycpfTx0aCBjbGFzcz0ibnVtIj5GdWxmaWxsbWVudDwvdGg+PHRoIGNsYXNzPSJudW0iPlRvZGFzPC90aD48L3RyPjwvdGhlYWQ+PHRib2R5PgogICAgICAke2J5U2VsbGVyLm1hcCgoW24sIGEsIGFsbF0pID0+IGA8dHI+PHRkPiR7ZXNjKG4pfTwvdGQ+JHtDQVRTLm1hcCgoW2tdKSA9PiBgPHRkIGNsYXNzPSJudW0iPiR7Y291bnQoYSwgaykgfHwgJzxzcGFuIGNsYXNzPSJ6ZXJvIj7Ctzwvc3Bhbj4nfTwvdGQ+YCkuam9pbignJyl9PHRkIGNsYXNzPSJudW0iPjxiPiR7YS5sZW5ndGh9PC9iPjwvdGQ+PHRkIGNsYXNzPSJudW0iPiR7YWxsLmxlbmd0aH08L3RkPjwvdHI+YCkuam9pbignJyl9CiAgICAgIDx0ciBjbGFzcz0ic3Mtc3VtIj48dGQ+PGI+VG90YWw8L2I+PC90ZD4ke0NBVFMubWFwKChba10pID0+IGA8dGQgY2xhc3M9Im51bSI+PGI+JHtjb3VudChmZiwgayl9PC9iPjwvdGQ+YCkuam9pbignJyl9PHRkIGNsYXNzPSJudW0iPjxiPiR7ZmYubGVuZ3RofTwvYj48L3RkPjx0ZCBjbGFzcz0ibnVtIj48Yj4ke2xpc3QubGVuZ3RofTwvYj48L3RkPjwvdHI+CiAgICA8L3Rib2R5PjwvdGFibGU+PC9kaXY+PC9kaXY+YCA6ICcnfWA7CiAgYm94Lm9uY2xpY2sgPSBlID0+IHsgaWYgKGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLW1vcmVdJykpIHsgdWkuc2hpcE9wZW4gPSAhdWkuc2hpcE9wZW47IGRyYXdTaGlwU3VtbWFyeSgpOyByZXR1cm47IH0gY29uc3QgYiA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLXNkXScpOyBpZiAoIWIpIHJldHVybjsgdWkuc2hpcERheSA9IGIuZGF0YXNldC5zZDsgZHJhd1NoaXBTdW1tYXJ5KCk7IH07Cn0KCmZ1bmN0aW9uIGRyYXdSb3dzKGZyZXNoID0gW10pIHsKICBpZiAoISQoJyN0YWJzQmlnJykpIHJldHVybjsKICBkcmF3U2hpcFN1bW1hcnkoKTsKICBjb25zdCBpblRhYiA9IHQgPT4gb3JkZXJzLmZpbHRlcihvID0+IGluVGFiRm4obywgdCkgJiYgKHVpLm1rID09PSAnYWxsJyB8fCBvLm1hcmtldHBsYWNlID09PSB1aS5taykgJiYgc2VsbGVyT2sobykpOwogIGNvbnN0IHRhYnNMaXN0ID0gVEFCUzsgLy8gdG9kYXMgbGFzIHNlY2Npb25lcyBwYXJhIHRvZG9zIChlbCBmdWxmaWxsbWVudCB0YW1iacOpbiB2ZSAiQmxvcXVlYWRhcyBpbXByZXNhcyIpCiAgaWYgKCF0YWJzTGlzdC5zb21lKChba10pID0+IGsgPT09IHVpLnRhYikpIHVpLnRhYiA9ICd0b2RheSc7CiAgJCgnI3RhYnNCaWcnKS5pbm5lckhUTUwgPSB0YWJzTGlzdC5tYXAoKFtrLCBuLCBzdWIsIGljXSkgPT4gYDxidXR0b24gY2xhc3M9InRiIHRiLSR7a30iIGRhdGEtdGFiMj0iJHtrfSIgYXJpYS1wcmVzc2VkPSIke3VpLnRhYiA9PT0ga30iPjxzcGFuIGNsYXNzPSJ0Yi1pYyI+JHtpY308L3NwYW4+PHNwYW4+PGI+JHtpblRhYihrKS5sZW5ndGh9PC9iPjxzcGFuIGNsYXNzPSJ0Yi1uIj4ke259PC9zcGFuPjxzbWFsbD4ke3N1Yn08L3NtYWxsPjwvc3Bhbj48L2J1dHRvbj5gKS5qb2luKCcnKTsKICBjb25zdCBta0NvdW50ID0gbWsgPT4gb3JkZXJzLmZpbHRlcihvID0+IGluVGFiRm4obywgdWkudGFiKSAmJiAobWsgPT09ICdhbGwnIHx8IG8ubWFya2V0cGxhY2UgPT09IG1rKSkubGVuZ3RoOwogICQoJyNta0NoaXBzJykuaW5uZXJIVE1MID0gW1snYWxsJywgJ1RvZG9zJ10sIFsnbWwnLCAnTWVyY2FkbyBMaWJyZSddLCBbJ2ZhJywgJ0ZhbGFiZWxsYSddLCBbJ3BhJywgJ1BhcmlzJ11dLm1hcCgoW2ssIG5dKSA9PiBgPGJ1dHRvbiBjbGFzcz0iY2hpcCIgZGF0YS1taz0iJHtrfSIgYXJpYS1wcmVzc2VkPSIke3VpLm1rID09PSBrfSI+JHtufSA8c3BhbiBjbGFzcz0iY250Ij4ke21rQ291bnQoayl9PC9zcGFuPjwvYnV0dG9uPmApLmpvaW4oJycpOwogIGNvbnN0IGJwID0gJCgnI2JwRmlsdGVyJyk7CiAgaWYgKGJwKSB7CiAgICBicC5oaWRkZW4gPSAhWydibG9ja2VkUHJpbnRlZCcsICdibG9ja2VkJ10uaW5jbHVkZXModWkudGFiKTsKICAgIGlmICh1aS50YWIgPT09ICdibG9ja2VkJykgewogICAgICAvLyBCbG9xdWVhZGFzOiBzZXBhcmFyIGxhcyBxdWUgc2UgZGVzcGFjaGFuIGhveSBkZSBsYXMgZGUgcHLDs3hpbW9zIGTDrWFzCiAgICAgIGNvbnN0IGJhc2UgPSB2aXNpYmxlSW4oJ2Jsb2NrZWQnKSwgblRvZGF5ID0gYmFzZS5maWx0ZXIoaXNGb3JUb2RheSkubGVuZ3RoOwogICAgICBicC5pbm5lckhUTUwgPSBgPHNwYW4gY2xhc3M9ImJwZi10Ij5Nb3N0cmFyOjwvc3Bhbj5gICsgW1snYWxsJywgJ1RvZGFzJywgYmFzZS5sZW5ndGhdLCBbJ3RvZGF5JywgJ0Rlc3BhY2hhciBob3knLCBuVG9kYXldLCBbJ25leHQnLCAnUHLDs3hpbW9zIGTDrWFzJywgYmFzZS5sZW5ndGggLSBuVG9kYXldXQogICAgICAgIC5tYXAoKFtrLCBuLCBjXSkgPT4gYDxidXR0b24gY2xhc3M9ImNoaXAgJHtrID09PSAndG9kYXknID8gJ2NoaXAtZmlsbCcgOiAnJ30iIGRhdGEtYmRmPSIke2t9IiBhcmlhLXByZXNzZWQ9IiR7dWkuYmRmID09PSBrfSI+JHtufSA8c3BhbiBjbGFzcz0iY250Ij4ke2N9PC9zcGFuPjwvYnV0dG9uPmApLmpvaW4oJycpOwogICAgICBicC5vbmNsaWNrID0gZSA9PiB7IGNvbnN0IGIgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1iZGZdJyk7IGlmICghYikgcmV0dXJuOyB1aS5iZGYgPSBiLmRhdGFzZXQuYmRmOyBkcmF3Um93cygpOyB9OwogICAgfSBlbHNlIGlmICghYnAuaGlkZGVuKSB7CiAgICAgIGNvbnN0IGJhc2UgPSB2aXNpYmxlSW4oJ2Jsb2NrZWRQcmludGVkJyksIG5GaWxsID0gYmFzZS5maWx0ZXIobyA9PiBicEtpbmQobykgPT09ICdmaWxsJykubGVuZ3RoOwogICAgICBicC5pbm5lckhUTUwgPSBgPHNwYW4gY2xhc3M9ImJwZi10Ij5Nb3N0cmFyOjwvc3Bhbj5gICsgW1snYWxsJywgJ1RvZGFzJywgYmFzZS5sZW5ndGhdLCBbJ2ZpbGwnLCAnRWwgZnVsZmlsbG1lbnQgZGViZSByZWxsZW5hcicsIG5GaWxsXSwgWydub25lJywgJ05hZGEgcGFyYSBlbCBmdWxmaWxsbWVudCcsIGJhc2UubGVuZ3RoIC0gbkZpbGxdXQogICAgICAgIC5tYXAoKFtrLCBuLCBjXSkgPT4gYDxidXR0b24gY2xhc3M9ImNoaXAgJHtrID09PSAnZmlsbCcgPyAnY2hpcC1maWxsJyA6ICcnfSIgZGF0YS1icGY9IiR7a30iIGFyaWEtcHJlc3NlZD0iJHt1aS5icGYgPT09IGt9Ij4ke259IDxzcGFuIGNsYXNzPSJjbnQiPiR7Y308L3NwYW4+PC9idXR0b24+YCkuam9pbignJyk7CiAgICAgIGJwLm9uY2xpY2sgPSBlID0+IHsgY29uc3QgYiA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLWJwZl0nKTsgaWYgKCFiKSByZXR1cm47IHVpLmJwZiA9IGIuZGF0YXNldC5icGY7IGRyYXdSb3dzKCk7IH07CiAgICB9CiAgfQogIGNvbnN0IHJvd3MgPSB2aXNpYmxlKCk7CiAgaWYgKCFyb3dzLmxlbmd0aCkgewogICAgY29uc3QgbXNnID0geyB0b2RheTogJ05vIGhheSBldGlxdWV0YXMgcG9yIGltcHJpbWlyIHBhcmEgaG95LiBMYXMgdmVudGFzIG51ZXZhcyAoeSBsb3MgRmxleCBxdWUgZW50cmVuIGR1cmFudGUgZWwgZMOtYSkgYXBhcmVjZW4gYXF1w60gc29sYXMuJywgdXBjb21pbmc6ICdObyBoYXkgZXRpcXVldGFzIHBhcmEgbG9zIHByw7N4aW1vcyBkw61hcy4nLCB3YWl0aW5nOiAnTmluZ3VuYSB2ZW50YSBlc3TDoSBlc3BlcmFuZG8gZXRpcXVldGEuJywgcHJpbnRlZDogJ0HDum4gbm8gaGF5IGV0aXF1ZXRhcyBpbXByZXNhcyBlbiBsb3Mgw7psdGltb3MgNyBkw61hcy4nLCBibG9ja2VkOiAnTm8gaGF5IHBlZGlkb3MgYmxvcXVlYWRvcy4nLCB1bmJsb2NrZWQ6ICdObyBoYXkgZXRpcXVldGFzIGRlc2Jsb3F1ZWFkYXMgcGVuZGllbnRlcy4gQ3VhbmRvIGRlc2Jsb3F1ZWVzIHVuYSwgYXBhcmVjZSBhcXXDrSBoYXN0YSBxdWUgc2UgaW1wcmltYS4nLCB3ZWVrOiAnRXN0YSBzZW1hbmEgYcO6biBubyBzZSBpbXByaW1lbiBldGlxdWV0YXMuJywgYmxvY2tlZFByaW50ZWQ6ICdObyBoYXkgZXRpcXVldGFzIGJsb3F1ZWFkYXMgaW1wcmVzYXMgZW4gbG9zIMO6bHRpbW9zIDMwIGTDrWFzLicgfVt1aS50YWJdOwogICAgJCgnI2xpc3QnKS5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz0iZW1wdHkiPiR7RU1QVFlfU1ZHfTxkaXY+JHttc2d9PC9kaXY+PC9kaXY+YDsKICAgIGRyYXdBY3Rpb25iYXIoKTsgcmV0dXJuOwogIH0KICBsZXQgbGFzdERheSA9ICcnLCBodG1sID0gJyc7CiAgZm9yIChjb25zdCBvIG9mIHJvd3MpIHsKICAgIGNvbnN0IGQgPSB0cyhvKSwgZGF5ID0gZGF5TGFiZWwoZCk7CiAgICBpZiAoZGF5ICE9PSBsYXN0RGF5KSB7IGh0bWwgKz0gYDxkaXYgY2xhc3M9ImRheWhlYWQiPiR7ZXNjKGRheSl9PC9kaXY+YDsgbGFzdERheSA9IGRheTsgfQogICAgY29uc3Qgc3QgPSBvLnN0YXRlOwogICAgbGV0IG5vdGUgPSAnJywgYnRuID0gJyc7CiAgICBjb25zdCBtaW5lID0gby5vd24gIT09IGZhbHNlOwogICAgaWYgKHN0ID09PSAncmVhZHknKSBidG4gPSBgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiBkYXRhLWFjdD0icHJpbnQiIGRhdGEtaWQ9IiR7by5pZH0iPiR7SS5wcmludH1JbXByaW1pcjwvYnV0dG9uPmA7CiAgICBpZiAoc3QgPT09ICdwcmludGVkJykgeyBub3RlID0gYDxzcGFuIGNsYXNzPSJub3RlIj5JbXByZXNhICR7ZXNjKGZtdFRpbWUoby5wcmludGVkX2F0KSl9JHtvLnByaW50ZWRfYnkgPyBgIMK3IDxiPkltcHJpbWnDszogJHtlc2Moby5wcmludGVkX2J5KX08L2I+YCA6ICcnfTwvc3Bhbj5gOyBidG4gPSBgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1yZXByaW50IiBkYXRhLWFjdD0icmVwcmludCIgZGF0YS1pZD0iJHtvLmlkfSI+JHtJLnByaW50fVZvbHZlciBhIGltcHJpbWlyPC9idXR0b24+YCArIChtaW5lID8gYDxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtYWN0PSJ1bnByaW50IiBkYXRhLWlkPSIke28uaWR9Ij5NYXJjYXIgY29tbyBubyBpbXByZXNhPC9idXR0b24+YCA6ICcnKTsgfQogICAgaWYgKHN0ID09PSAnc2hpcHBlZCcpIG5vdGUgPSBgPHNwYW4gY2xhc3M9Im5vdGUiPllhIHNhbGnDsyDCtyA8Yj5JbXByaW1pw7M6ICR7ZXNjKG8ucHJpbnRlZF9ieSB8fCAnTWFya2V0cGxhY2UnKX08L2I+PC9zcGFuPmA7CiAgICBpZiAoc3QgPT09ICd3YWl0aW5nJyB8fCBzdCA9PT0gJ2Vycm9yJykgeyBub3RlID0gYDxzcGFuIGNsYXNzPSJub3RlICR7c3QgPT09ICdlcnJvcicgPyAnYmFkJyA6ICcnfSI+JHtlc2Moby5lcnJvciB8fCBvLndhaXRpbmdfbm90ZSB8fCAnRWwgbWFya2V0cGxhY2UgYcO6biBubyBsaWJlcmEgbGEgZXRpcXVldGEnKX08L3NwYW4+YDsgYnRuID0gYDxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtYWN0PSJyZXRyeSIgZGF0YS1pZD0iJHtvLmlkfSI+UmVpbnRlbnRhcjwvYnV0dG9uPmA7IH0KICAgIGNvbnN0IG5vbmVGb3JGZiA9IChvLm1pc3NpbmdfaWR4IHx8IFtdKS5sZW5ndGggPiAwICYmIChvLm1pc3NpbmdfaWR4IHx8IFtdKS5sZW5ndGggPj0gby5pdGVtcy5sZW5ndGg7CiAgICBpZiAoc3QgPT09ICdibG9ja2VkJykgeyBub3RlID0gbm9uZUZvckZmID8gJzxzcGFuIGNsYXNzPSJub3ByaW50Ij5ST05HIFhJTiBOTyBJTVBSSU1JUiBFVElRVUVUQTwvc3Bhbj4nIDogJzxzcGFuIGNsYXNzPSJub3RlIj5UaWVuZSBwcm9kdWN0b3MgcXVlIG5vIHZhbiBhbCBmdWxmaWxsbWVudDogbWFuZGEgc29sbyBsb3MgbWFyY2Fkb3MgZW4gdmVyZGU8L3NwYW4+JzsgaWYgKG1pbmUpIGJ0biA9IGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIGRhdGEtYWN0PSJ1bmJsb2NrIiBkYXRhLWlkPSIke28uaWR9Ij4ke0kubG9ja31EZXNibG9xdWVhciBldGlxdWV0YTwvYnV0dG9uPmA7IH0KICAgIGlmIChvLnVuYmxvY2tlZF9ieSAmJiBvLmJsb2NrX25vICYmIHN0ICE9PSAnYmxvY2tlZCcpIHsKICAgICAgbm90ZSArPSBgPHNwYW4gY2xhc3M9Im5vdGUiPjxiPlBlZGlkbyBpbmNvbXBsZXRvPC9iPjogZWwgZnVsZmlsbG1lbnQgbWFuZGEgbG8gc3V5byB5IHNlIHJlbGxlbmEgbG8gbWFyY2FkbyAiRkFMVEEiIMK3IERlc2Jsb3F1ZcOzOiAke2VzYyhvLnVuYmxvY2tlZF9ieSl9PC9zcGFuPmA7CiAgICAgIGlmIChtaW5lICYmIFsncmVhZHknLCAnd2FpdGluZycsICdlcnJvciddLmluY2x1ZGVzKHN0KSkgYnRuICs9IGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWFjdD0icmVibG9jayIgZGF0YS1pZD0iJHtvLmlkfSI+Vm9sdmVyIGEgYmxvcXVlYXI8L2J1dHRvbj5gOwogICAgfQogICAgaHRtbCArPSBgPGRpdiBjbGFzcz0ib3JvdyBzdC0ke3N0fSAke2ZyZXNoLmluY2x1ZGVzKG8uaWQpID8gJ2lzLW5ldycgOiAnJ30iPgogICAgICA8ZGl2IGNsYXNzPSJvYy1jaGVjayI+JHtzdCA9PT0gJ3JlYWR5JyA/IGA8aW5wdXQgdHlwZT0iY2hlY2tib3giIGNsYXNzPSJjYiIgZGF0YS1pZD0iJHtvLmlkfSIgJHtzZWxlY3RlZC5oYXMoby5pZCkgPyAnY2hlY2tlZCcgOiAnJ30gYXJpYS1sYWJlbD0iU2VsZWNjaW9uYXIgJHtlc2Moby5vcmRlcl9udW1iZXIpfSI+YCA6IHN0ID09PSAnYmxvY2tlZCcgPyBgPHNwYW4gY2xhc3M9ImxvY2tjZWxsIj4ke0kubG9ja308L3NwYW4+YCA6ICcnfTwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJvYy10aW1lIj48Yj4ke2VzYyhhbXBtKGQpKX08L2I+PHNwYW4gY2xhc3M9Im1rICR7by5tYXJrZXRwbGFjZX0iPiR7TUtbby5tYXJrZXRwbGFjZV0gfHwgby5tYXJrZXRwbGFjZX08L3NwYW4+JHtvLnNoaXBfdHlwZSA/IGA8c3BhbiBjbGFzcz0ic2hpcHR5cGUgc3QtJHtlc2Moby5zaGlwX3R5cGUudG9Mb3dlckNhc2UoKSl9Ij4ke2VzYyhvLnNoaXBfdHlwZSl9PC9zcGFuPmAgOiAnJ308L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0ib2MtbWFpbiI+JHtbJ3JlYWR5JywgJ3dhaXRpbmcnLCAnZXJyb3InXS5pbmNsdWRlcyhzdCkgJiYgZGlzcGF0Y2hUZXh0KG8pID8gYDxkaXYgY2xhc3M9ImRpc3BhdGNoICR7ZGlzcGF0Y2hUZXh0KG8pLnN0YXJ0c1dpdGgoJ0F0cmFzYWRhJykgPyAnbGF0ZScgOiAnJ30iPiR7ZXNjKGRpc3BhdGNoVGV4dChvKSl9PC9kaXY+YCA6IGRpc3BhdGNoUGxhaW4obykgPyBgPGRpdiBjbGFzcz0iZGlzcGF0Y2ggZG9uZSI+JHtlc2MoZGlzcGF0Y2hQbGFpbihvKSl9PC9kaXY+YCA6ICcnfTxkaXYgY2xhc3M9Im9jLXRvcCI+JHtvLmJsb2NrX25vID8gYDxzcGFuIGNsYXNzPSJibG9ja25vIiB0aXRsZT0iTsO6bWVybyBkZWwgcGVkaWRvIGluY29tcGxldG8iPk7CsCAke28uYmxvY2tfbm99PC9zcGFuPmAgOiAnJ30ke28uY3VzdG9tZXIgPyBgPHNwYW4gY2xhc3M9ImN1c3QiPiR7ZXNjKG8uY3VzdG9tZXIpfTwvc3Bhbj5gIDogJyd9PGI+JHtlc2Moby5zZWxsZXIpfTwvYj4gPHNwYW4gY2xhc3M9Im1vbm8gbXV0ZWQiPiMke2VzYyhvLm9yZGVyX251bWJlcil9PC9zcGFuPjwvZGl2PiR7aXRlbXNIVE1MKG8pfSR7bm90ZX08L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0ib2MtYWN0Ij4ke3BpbGwobyl9PGRpdiBjbGFzcz0icm93LWFjdGlvbnMiPiR7YnRufSR7by50cmFja191cmwgPyBgPGEgY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGhyZWY9IiR7ZXNjKG8udHJhY2tfdXJsKX0iIHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIj5TZWd1aXIgZW52w61vPC9hPmAgOiAnJ308L2Rpdj4ke28udHJhY2tpbmcgPyBgPHNwYW4gY2xhc3M9Im5vdGUgbW9ubyI+TsKwIHNlZ3VpbWllbnRvICR7ZXNjKG8udHJhY2tpbmcpfTwvc3Bhbj5gIDogJyd9PC9kaXY+CiAgICA8L2Rpdj5gOwogIH0KICAkKCcjbGlzdCcpLmlubmVySFRNTCA9IGh0bWw7CiAgZHJhd0FjdGlvbmJhcigpOwp9CmZ1bmN0aW9uIGRyYXdBY3Rpb25iYXIoKSB7CiAgY29uc3QgYWIgPSAkKCcjYWN0aW9uYmFyJyk7IGlmICghYWIpIHJldHVybjsKICBpZiAoIVsndG9kYXknLCAndXBjb21pbmcnLCAndW5ibG9ja2VkJ10uaW5jbHVkZXModWkudGFiKSkgeyBhYi5pbm5lckhUTUwgPSAnJzsgYWIuaGlkZGVuID0gdHJ1ZTsgcmV0dXJuOyB9CiAgYWIuaGlkZGVuID0gZmFsc2U7CiAgY29uc3QgbiA9IHZpc2libGVJbih1aS50YWIpLmxlbmd0aCwgcyA9IHNlbGVjdGVkLnNpemU7CiAgaWYgKG1lLnVzZXIucm9sZSA9PT0gJ3NlbGxlcicpIHsgYWIuaW5uZXJIVE1MID0gJyc7IGFiLmhpZGRlbiA9IHRydWU7IHJldHVybjsgfQogIGFiLmlubmVySFRNTCA9IGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIGRhdGEtYnVsaz0iYWxsIiAke24gPyAnJyA6ICdkaXNhYmxlZCd9PiR7SS5kb3dufUltcHJpbWlyIHRvZGFzICgke259KTwvYnV0dG9uPgogICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIiBkYXRhLWJ1bGs9InNlbCIgJHtzID8gJycgOiAnZGlzYWJsZWQnfT5JbXByaW1pciBzZWxlY2Npb25hZGFzICgke3N9KTwvYnV0dG9uPgogICAgPHNwYW4gY2xhc3M9InNwYWNlciIgc3R5bGU9ImZsZXg6MSI+PC9zcGFuPgogICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1idWxrPSJzZWxhbGwiPlNlbGVjY2lvbmFyIHRvZGFzPC9idXR0b24+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1idWxrPSJub25lIj5RdWl0YXIgc2VsZWNjacOzbjwvYnV0dG9uPmA7Cn0KZnVuY3Rpb24gdXBkYXRlU2VsKCkgeyBkcmF3QWN0aW9uYmFyKCk7IH0KCmxldCBkb3dubG9hZGluZyA9IGZhbHNlOwphc3luYyBmdW5jdGlvbiBkb3dubG9hZEJhdGNoKGlkcywgeyBzaWxlbnQgPSBmYWxzZSB9ID0ge30pIHsKICBpZiAoIWlkcy5sZW5ndGggfHwgZG93bmxvYWRpbmcpIHJldHVybiAwOwogIGRvd25sb2FkaW5nID0gdHJ1ZTsKICB0cnkgewogICAgY29uc3QgcmVzID0gYXdhaXQgZmV0Y2goJy9hcGkvbGFiZWxzL2JhdGNoJywgeyBtZXRob2Q6ICdQT1NUJywgY3JlZGVudGlhbHM6ICdzYW1lLW9yaWdpbicsIGhlYWRlcnM6IHsgJ2NvbnRlbnQtdHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9LCBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGlkcywgbWFyazogdHJ1ZSB9KSB9KTsKICAgIGlmICghcmVzLm9rKSB7IGNvbnN0IGUgPSBhd2FpdCByZXMuanNvbigpLmNhdGNoKCgpID0+ICh7fSkpOyB0aHJvdyBuZXcgRXJyb3IoZS5lcnJvciB8fCAnTm8gc2UgcHVkbyBkZXNjYXJnYXInKTsgfQogICAgY29uc3QgYmxvYiA9IGF3YWl0IHJlcy5ibG9iKCk7CiAgICBjb25zdCBuYW1lID0gKHJlcy5oZWFkZXJzLmdldCgnY29udGVudC1kaXNwb3NpdGlvbicpIHx8ICcnKS5tYXRjaCgvZmlsZW5hbWU9IihbXiJdKykiLyk/LlsxXSB8fCAnZXRpcXVldGFzLnBkZic7CiAgICBjb25zdCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpOyBhLmhyZWYgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpOyBhLmRvd25sb2FkID0gbmFtZTsgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChhKTsgYS5jbGljaygpOyBhLnJlbW92ZSgpOwogICAgc2V0VGltZW91dCgoKSA9PiBVUkwucmV2b2tlT2JqZWN0VVJMKGEuaHJlZiksIDYwMDAwKTsKICAgIGNvbnN0IG4gPSArcmVzLmhlYWRlcnMuZ2V0KCd4LWxhYmVsLWNvdW50JykgfHwgaWRzLmxlbmd0aDsKICAgIHRvYXN0KGAke259IGV0aXF1ZXRhJHtuID09PSAxID8gJycgOiAncyd9IGRlc2NhcmdhZGEke24gPT09IDEgPyAnJyA6ICdzJ30geSBtYXJjYWRhJHtuID09PSAxID8gJycgOiAncyd9IGNvbW8gaW1wcmVzYSR7biA9PT0gMSA/ICcnIDogJ3MnfWApOwogICAgc2VsZWN0ZWQuY2xlYXIoKTsKICAgIHJldHVybiBuOwogIH0gY2F0Y2ggKGUpIHsgaWYgKCFzaWxlbnQpIHRvYXN0KGUubWVzc2FnZSk7IHJldHVybiAwOyB9CiAgZmluYWxseSB7IGRvd25sb2FkaW5nID0gZmFsc2U7IHNldFRpbWVvdXQobG9hZE9yZGVycywgNDAwKTsgfQp9CmxldCBhdXRvVCA9IG51bGw7CmZ1bmN0aW9uIGF1dG9Eb3dubG9hZCgpIHsKICBjbGVhclRpbWVvdXQoYXV0b1QpOwogIC8vIGVzcGVyYSB1bm9zIHNlZ3VuZG9zIHBhcmEganVudGFyIGV0aXF1ZXRhcyBxdWUgbGxlZ2FuIGNhc2kganVudGFzIGVuIHVuIHNvbG8gUERGCiAgYXV0b1QgPSBzZXRUaW1lb3V0KCgpID0+IHsKICAgIGNvbnN0IGlkcyA9IG9yZGVycy5maWx0ZXIobyA9PiBvLnN0YXRlID09PSAncmVhZHknICYmICFpc1VuYmxvY2tlZChvKSAmJiBpc0ZvclRvZGF5KG8pKS5tYXAobyA9PiBvLmlkKTsKICAgIGlmIChpZHMubGVuZ3RoICYmIHN0b3JlLmdldCgnYXV0bycsIGZhbHNlKSAmJiBtZS51c2VyLnJvbGUgIT09ICdzZWxsZXInKSBkb3dubG9hZEJhdGNoKGlkcywgeyBzaWxlbnQ6IHRydWUgfSk7CiAgfSwgNDAwMCk7Cn0KCi8vIC0tLS0tLS0tLS0gVkVOREVET1IgLS0tLS0tLS0tLQphc3luYyBmdW5jdGlvbiByZW5kZXJTZWxsZXIoKSB7CiAgY29uc3QgaXNBZG1pbiA9IG1lLnVzZXIucm9sZSA9PT0gJ2FkbWluJzsKICBsZXQgc2VsbGVyUGlja2VyID0gJyc7CiAgaWYgKGlzQWRtaW4pIHsKICAgIGNvbnN0IGQgPSBhd2FpdCBhcGkoJy9hcGkvYWRtaW4vc2VsbGVycycpOwogICAgc2VsbGVycyA9IGQuc2VsbGVyczsKICAgIGlmICghc2VsbGVycy5sZW5ndGgpIHsgJCgnI21haW4nKS5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz0ic2VjdGlvbi10aXRsZSI+PGgyPlZlbmRlZG9yZXM8L2gyPjwvZGl2PjxkaXYgY2xhc3M9InBhbmVsIj48ZGl2IGNsYXNzPSJlbXB0eSI+JHtFTVBUWV9TVkd9PGRpdj5QcmltZXJvIGNyZWEgbG9zIHZlbmRlZG9yZXMgZW4gbGEgcGVzdGHDsWEgVXN1YXJpb3MuPC9kaXY+PC9kaXY+PC9kaXY+YDsgcmV0dXJuOyB9CiAgICBpZiAoIXNlbGxlcnMuc29tZShzID0+IHMuaWQgPT09IHVpLmFkbWluU2VsbGVyKSkgdWkuYWRtaW5TZWxsZXIgPSBzZWxsZXJzWzBdLmlkOwogICAgc2VsbGVyUGlja2VyID0gYDxzZWxlY3QgaWQ9ImFkbWluU2VsbGVyIiBzdHlsZT0id2lkdGg6YXV0byI+JHtzZWxsZXJzLm1hcChzID0+IGA8b3B0aW9uIHZhbHVlPSIke3MuaWR9IiAke3MuaWQgPT09IHVpLmFkbWluU2VsbGVyID8gJ3NlbGVjdGVkJyA6ICcnfT4ke2VzYyhzLm5hbWUpfTwvb3B0aW9uPmApLmpvaW4oJycpfTwvc2VsZWN0PmA7CiAgfQogICQoJyNtYWluJykuaW5uZXJIVE1MID0gYAogIDxkaXYgY2xhc3M9InNlY3Rpb24tdGl0bGUiPjxoMj4ke2lzQWRtaW4gPyAnQ3VlbnRhIGRlbCB2ZW5kZWRvcicgOiAnTWlzIG1hcmtldHBsYWNlcyd9PC9oMj4ke3NlbGxlclBpY2tlcn08c3BhbiBjbGFzcz0ic3BhY2VyIiBzdHlsZT0iZmxleDoxIj48L3NwYW4+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1naG9zdCIgaWQ9InNTeW5jIj4ke0kuc3luY31TaW5jcm9uaXphciBhaG9yYTwvYnV0dG9uPjwvZGl2PgogIDxkaXYgY2xhc3M9ImNvbm4iIGlkPSJjb25uIj48L2Rpdj4KICA8ZGl2IGNsYXNzPSJncmlkMiI+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbCI+CiAgICAgIDxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj5Qcm9kdWN0b3MgcXVlIE5PIHZhbiBhbCBmdWxmaWxsbWVudDwvaDI+PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9InBhbmVsLWJvZHkgc3RhY2siPgogICAgICAgIDxkaXYgY2xhc3M9InJ1bGUiPiR7UlVMRV9TVkd9PHA+PGI+QmFzdGEgdW4gcHJvZHVjdG8gZGUgZXN0YSBsaXN0YSBwYXJhIGJsb3F1ZWFyIGVsIHBlZGlkbyBjb21wbGV0by48L2I+IEVsIGZ1bGZpbGxtZW50IGxvIHZlcsOhIGNvbiBjYW5kYWRvIHkgbm8gcG9kcsOhIGRlc2NhcmdhciBzdSBldGlxdWV0YS4gVXNhIGVsIElEIGRlIHB1YmxpY2FjacOzbiAoTUxD4oCmLCBJRCBkZSBGYWxhYmVsbGEsIFNLVSBNS+KApiBkZSBQYXJpcykgbyB0dSBTS1UgZGUgdmVuZGVkb3IuPC9wPjwvZGl2PgogICAgICAgIDxmb3JtIGNsYXNzPSJhZGRyb3ciIGlkPSJhZGRGb3JtIj4KICAgICAgICAgIDx0ZXh0YXJlYSBpZD0iYWRkVmFsIiByb3dzPSIyIiBwbGFjZWhvbGRlcj0iVW5vIG8gdmFyaW9zLCBzZXBhcmFkb3MgcG9yIGNvbWEgbyBzYWx0byBkZSBsw61uZWEmIzEwO0VqOiBNTEMxNDg3NzY1NDMyLCBMRU4tUE9MLTAxIiBhcmlhLWxhYmVsPSJJRHMgbyBTS1VzIj48L3RleHRhcmVhPgogICAgICAgICAgPHNlbGVjdCBpZD0iYWRkTWsiIGFyaWEtbGFiZWw9Ik1hcmtldHBsYWNlIj48b3B0aW9uIHZhbHVlPSJhbnkiPlRvZG9zIGxvcyBjYW5hbGVzPC9vcHRpb24+PG9wdGlvbiB2YWx1ZT0ibWwiPlNvbG8gTWVyY2FkbyBMaWJyZTwvb3B0aW9uPjxvcHRpb24gdmFsdWU9ImZhIj5Tb2xvIEZhbGFiZWxsYTwvb3B0aW9uPjxvcHRpb24gdmFsdWU9InBhIj5Tb2xvIFBhcmlzPC9vcHRpb24+PC9zZWxlY3Q+CiAgICAgICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIHR5cGU9InN1Ym1pdCI+JHtJLmxvY2t9QmxvcXVlYXI8L2J1dHRvbj4KICAgICAgICA8L2Zvcm0+CiAgICAgICAgPGlucHV0IHR5cGU9InNlYXJjaCIgaWQ9ImJsUSIgcGxhY2Vob2xkZXI9IkJ1c2NhciBlbiBsYSBsaXN0YSIgYXJpYS1sYWJlbD0iQnVzY2FyIGJsb3F1ZWFkb3MiPgogICAgICAgIDxkaXYgY2xhc3M9InRhZ3MiIGlkPSJ0YWdzIj48L2Rpdj4KICAgICAgPC9kaXY+CiAgICA8L2Rpdj4KICAgIDxkaXYgY2xhc3M9InBhbmVsIj4KICAgICAgPGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+PGgyPlBlZGlkb3MgcmVjaWVudGVzPC9oMj48L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0idGFibGUtd3JhcCI+PHRhYmxlIHN0eWxlPSJtaW4td2lkdGg6NTIwcHgiPjx0aGVhZD48dHI+PHRoPlBlZGlkbzwvdGg+PHRoPkNhbmFsPC90aD48dGg+UHJvZHVjdG9zPC90aD48dGg+RXN0YWRvPC90aD48L3RyPjwvdGhlYWQ+PHRib2R5IGlkPSJteVJvd3MiPjwvdGJvZHk+PC90YWJsZT48L2Rpdj4KICAgIDwvZGl2PgogIDwvZGl2PmA7CiAgaWYgKGlzQWRtaW4pICQoJyNhZG1pblNlbGxlcicpLm9uY2hhbmdlID0gZSA9PiB7IHVpLmFkbWluU2VsbGVyID0gK2UudGFyZ2V0LnZhbHVlOyBzdG9yZS5zZXQoJ2FkbWluU2VsbGVyJywgdWkuYWRtaW5TZWxsZXIpOyByZW5kZXJTZWxsZXIoKTsgfTsKICAkKCcjc1N5bmMnKS5vbmNsaWNrID0gYXN5bmMgKCkgPT4geyBhd2FpdCBhcGkoJy9hcGkvc3luYycgKyBzZWxsZXJRUygpLCB7IG1ldGhvZDogJ1BPU1QnIH0pOyB0b2FzdCgnU2luY3Jvbml6YW5kb+KApicpOyB9OwogICQoJyNhZGRGb3JtJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgIGUucHJldmVudERlZmF1bHQoKTsKICAgIHRyeSB7IGNvbnN0IHIgPSBhd2FpdCBhcGkoJy9hcGkvYmxvY2tsaXN0JyArIHNlbGxlclFTKCksIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgdmFsdWU6ICQoJyNhZGRWYWwnKS52YWx1ZSwgbWFya2V0cGxhY2U6ICQoJyNhZGRNaycpLnZhbHVlIH0gfSk7ICQoJyNhZGRWYWwnKS52YWx1ZSA9ICcnOyB0b2FzdChgJHtyLmFkZGVkfSBibG9xdWVhZG8ke3IuYWRkZWQgPT09IDEgPyAnJyA6ICdzJ31gKTsgbG9hZEJsb2NrbGlzdCgpOyB9CiAgICBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlKTsgfQogIH07CiAgJCgnI2JsUScpLm9uaW5wdXQgPSAoKSA9PiBkcmF3VGFncygpOwogICQoJyN0YWdzJykub25jbGljayA9IGFzeW5jIGUgPT4geyBjb25zdCBiID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtcm1dJyk7IGlmICghYikgcmV0dXJuOyBhd2FpdCBhcGkoYC9hcGkvYmxvY2tsaXN0LyR7Yi5kYXRhc2V0LnJtfSR7c2VsbGVyUVMoKX1gLCB7IG1ldGhvZDogJ0RFTEVURScgfSk7IHRvYXN0KCdEZXNibG9xdWVhZG86IHN1cyBwZWRpZG9zIHBhc2FuIGFsIGZ1bGZpbGxtZW50Jyk7IGxvYWRCbG9ja2xpc3QoKTsgfTsKICAkKCcjbXlSb3dzJykub25jbGljayA9IGFzeW5jIGUgPT4gewogICAgY29uc3QgYiA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLXVuYmxvY2tdJyk7IGlmICghYikgcmV0dXJuOwogICAgaWYgKCFjb25maXJtKCfCv0Rlc2Jsb3F1ZWFyIGVzdGEgZXRpcXVldGE/IFBhc2EgYSBsYSBzZWNjacOzbiAiRGVzYmxvcXVlYWRhcyIuIEVuIGxhIGhvamEgZGVsIHBlZGlkbyBzYWxkcsOhIHN1IG7Dum1lcm8geSBxdWVkYXLDoW4gbWFyY2Fkb3MgY29uICJGQUxUQSIgbG9zIHByb2R1Y3RvcyBxdWUgc2UgcmVsbGVuYW4gYXBhcnRlLicpKSByZXR1cm47CiAgICBiLmRpc2FibGVkID0gdHJ1ZTsgdHJ5IHsgYXdhaXQgYXBpKGAvYXBpL29yZGVycy8ke2IuZGF0YXNldC51bmJsb2NrfS91bmJsb2NrYCwgeyBtZXRob2Q6ICdQT1NUJyB9KTsgdG9hc3QoJ0V0aXF1ZXRhIGRlc2Jsb3F1ZWFkYScpOyBsb2FkU2VsbGVyT3JkZXJzKCk7IH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IGIuZGlzYWJsZWQgPSBmYWxzZTsgfQogIH07CiAgbG9hZENvbm5lY3Rpb25zKCk7IGxvYWRCbG9ja2xpc3QoKTsgbG9hZFNlbGxlck9yZGVycygpOwogIGlmIChuZXcgVVJMU2VhcmNoUGFyYW1zKGxvY2F0aW9uLnNlYXJjaCkuZ2V0KCdjb25lY3RhZG8nKSA9PT0gJ21sJykgeyB0b2FzdCgnTWVyY2FkbyBMaWJyZSBjb25lY3RhZG8nKTsgaGlzdG9yeS5yZXBsYWNlU3RhdGUobnVsbCwgJycsICcvJyk7IH0KfQoKYXN5bmMgZnVuY3Rpb24gbG9hZENvbm5lY3Rpb25zKCkgewogIGNvbnN0IHsgY29ubmVjdGlvbnMgfSA9IGF3YWl0IGFwaSgnL2FwaS9jb25uZWN0aW9ucycgKyBzZWxsZXJRUygpKTsKICBjb25zdCBieSA9IE9iamVjdC5mcm9tRW50cmllcyhjb25uZWN0aW9ucy5tYXAoYyA9PiBbYy5tYXJrZXRwbGFjZSwgY10pKTsKICBjb25zdCBzdCA9IGMgPT4gIWMgPyAnPGRpdiBjbGFzcz0ic3RhdGUgb2ZmIj48aT48L2k+U2luIGNvbmVjdGFyPC9kaXY+JyA6IGMubGFzdF9lcnJvciA/IGA8ZGl2IGNsYXNzPSJzdGF0ZSBlcnIiPjxpPjwvaT5FcnJvcjogJHtlc2MoYy5sYXN0X2Vycm9yLnNsaWNlKDAsIDEyMCkpfTwvZGl2PmAgOiBgPGRpdiBjbGFzcz0ic3RhdGUgb24iPjxpPjwvaT5Db25lY3RhZG8ke2MuYWNjb3VudF9sYWJlbCA/ICcgwrcgJyArIGVzYyhjLmFjY291bnRfbGFiZWwpIDogJyd9JHtjLmxhc3Rfc3luY19hdCA/ICcgwrcgcmV2aXNhZG8gJyArIGVzYyhmbXRUaW1lKGMubGFzdF9zeW5jX2F0KSkgOiAnJ308L2Rpdj5gOwogIGNvbnN0IGRpc2MgPSBjID0+IGMgPyBgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1kZWw9IiR7Yy5pZH0iPkRlc2NvbmVjdGFyPC9idXR0b24+YCA6ICcnOwogIGNvbnN0IG1sID0gYnkubWwsIGZhID0gYnkuZmEsIHBhID0gYnkucGE7CiAgJCgnI2Nvbm4nKS5pbm5lckhUTUwgPSBgCiAgPGRpdiBjbGFzcz0ibWNhcmQiPjxkaXYgY2xhc3M9ImxvZ28iIHN0eWxlPSJiYWNrZ3JvdW5kOnZhcigtLW1sKTtjb2xvcjp2YXIoLS1tbC1pbmspIj5NZXJjYWRvIExpYnJlPC9kaXY+JHtzdChtbCl9CiAgICA8cCBjbGFzcz0iaG93Ij5UZSBsbGV2YSBhIE1lcmNhZG8gTGlicmUgcGFyYSBhdXRvcml6YXIuIE5vIGNvbXBhcnRlcyB0dSBjb250cmFzZcOxYS4gTGFzIGV0aXF1ZXRhcyBsbGVnYW4gYXBlbmFzIGxhIHZlbnRhIHF1ZWRhIGxpc3RhIHBhcmEgaW1wcmltaXIuPC9wPgogICAgPHAgY2xhc3M9ImhvdyB3YXJuYm94Ij48Yj5JbXBvcnRhbnRlOjwvYj4gTWVyY2FkbyBMaWJyZSBjb25lY3RhIGxhIGN1ZW50YSBxdWUgZXN0w6kgPGI+YWJpZXJ0YSBlbiBlc3RlIG5hdmVnYWRvcjwvYj4uIFNpIGFxdcOtIGVzdMOhIGFiaWVydGEgb3RyYSBjdWVudGEgKHBvciBlamVtcGxvIGxhIGRlIG90cm8gdmVuZGVkb3IpLCBjaWVycmEgc2VzacOzbiBlbiBtZXJjYWRvbGlicmUuY2wgYW50ZXMsIG8gdXNhIGVsIGxpbmsgcGFyYSBxdWUgZWwgdmVuZGVkb3IgY29uZWN0ZSBkZXNkZSBzdSBwcm9waW8gY29tcHV0YWRvci48L3A+CiAgICAke21lLm1sQ29uZmlndXJlZCA/IGA8YSBjbGFzcz0iYnRuICR7bWwgPyAnYnRuLWdob3N0JyA6ICdidG4tcHJpbWFyeSd9IiBocmVmPSIvYXV0aC9tbC9zdGFydCR7c2VsbGVyUVMoKX0iPiR7bWwgPyAnVm9sdmVyIGEgYXV0b3JpemFyJyA6ICdDb25lY3RhciBjb24gTWVyY2FkbyBMaWJyZSd9PC9hPiR7bWUudXNlci5yb2xlID09PSAnYWRtaW4nID8gJzxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGlkPSJtbExpbmsiPkNvcGlhciBsaW5rIHBhcmEgcXVlIGVsIHZlbmRlZG9yIGNvbmVjdGU8L2J1dHRvbj4nIDogJyd9YCA6ICc8cCBjbGFzcz0iaG93IiBzdHlsZT0iY29sb3I6dmFyKC0td2FybikiPkVsIGFkbWluaXN0cmFkb3IgZGViZSBjb25maWd1cmFyIGxhIGFwcCBkZSBNZXJjYWRvIExpYnJlIGVuIGVsIHNlcnZpZG9yLjwvcD4nfSR7ZGlzYyhtbCl9PC9kaXY+CiAgPGRpdiBjbGFzcz0ibWNhcmQiPjxkaXYgY2xhc3M9ImxvZ28iIHN0eWxlPSJiYWNrZ3JvdW5kOnZhcigtLWZhKTtjb2xvcjp2YXIoLS1mYS1pbmspIj5GYWxhYmVsbGE8L2Rpdj4ke3N0KGZhKX0KICAgIDxmb3JtIGlkPSJmYUZvcm0iIGNsYXNzPSJzdGFjayI+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+VXN1YXJpbyBBUEkgKGNvcnJlbyBkZWwgU2VsbGVyIENlbnRlcik8aW5wdXQgdHlwZT0iZW1haWwiIGlkPSJmYVVzZXIiIHZhbHVlPSIke2VzYyhmYT8uYWNjb3VudF9sYWJlbCB8fCAnJyl9IiByZXF1aXJlZD48L2xhYmVsPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPkFQSSBLZXk8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJmYUtleSIgcGxhY2Vob2xkZXI9IiR7ZmEgPyAn4oCi4oCi4oCi4oCi4oCi4oCiIChndWFyZGFkYSknIDogJ1NlbGxlciBDZW50ZXIg4oC6IE1pIGN1ZW50YSDigLogSW50ZWdyYWNpb25lcyd9IiAke2ZhID8gJycgOiAncmVxdWlyZWQnfT48L2xhYmVsPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPlNlbGxlciBJRDxpbnB1dCB0eXBlPSJ0ZXh0IiBpZD0iZmFTaWQiIHBsYWNlaG9sZGVyPSJDw7NkaWdvIGRlIHRpZW5kYSwgZWouIFNDMTIzNCI+PC9sYWJlbD4KICAgICAgPGxhYmVsIGNsYXNzPSJzd2l0Y2giPjxpbnB1dCB0eXBlPSJjaGVja2JveCIgaWQ9ImZhQXV0byIgJHtmYT8uc2V0dGluZ3M/LmF1dG9SZWFkeSA/ICdjaGVja2VkJyA6ICcnfT4gTWFyY2FyICJsaXN0byBwYXJhIGRlc3BhY2hvIiBhdXRvbcOhdGljbzwvbGFiZWw+CiAgICAgIDxwIGNsYXNzPSJob3ciPkZhbGFiZWxsYSBnZW5lcmEgbGEgZXRpcXVldGEgc29sbyBjdWFuZG8gZWwgcGVkaWRvIGVzdMOhIGxpc3RvIHBhcmEgZGVzcGFjaG8uIENvbiBlc3RhIG9wY2nDs24sIGxhIGFwcCBsbyBtYXJjYSBzb2xhIGFwZW5hcyBsbGVnYS48L3A+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biAke2ZhID8gJ2J0bi1naG9zdCcgOiAnYnRuLXByaW1hcnknfSIgdHlwZT0ic3VibWl0Ij4ke2ZhID8gJ0FjdHVhbGl6YXInIDogJ0NvbmVjdGFyIEZhbGFiZWxsYSd9PC9idXR0b24+CiAgICA8L2Zvcm0+CiAgICAke2ZhPy53ZWJob29rX3VybCA/IGA8bGFiZWwgY2xhc3M9ImYiPkF2aXNvIGluc3RhbnTDoW5lbyAod2ViaG9vaywgb3BjaW9uYWwpPHNwYW4gY2xhc3M9ImNvcHkiPjxpbnB1dCB0eXBlPSJ0ZXh0IiByZWFkb25seSB2YWx1ZT0iJHtlc2MoZmEud2ViaG9va191cmwpfSI+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1jb3B5PSIke2VzYyhmYS53ZWJob29rX3VybCl9Ij5Db3BpYXI8L2J1dHRvbj48L3NwYW4+PC9sYWJlbD5gIDogJyd9CiAgICAke2Rpc2MoZmEpfTwvZGl2PgogIDxkaXYgY2xhc3M9Im1jYXJkIj48ZGl2IGNsYXNzPSJsb2dvIiBzdHlsZT0iYmFja2dyb3VuZDp2YXIoLS1wYSk7Y29sb3I6I2ZmZiI+UGFyaXM8L2Rpdj4ke3N0KHBhKX0KICAgIDxmb3JtIGlkPSJwYUZvcm0iIGNsYXNzPSJzdGFjayI+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+QVBJIEtleTxpbnB1dCB0eXBlPSJwYXNzd29yZCIgaWQ9InBhS2V5IiBwbGFjZWhvbGRlcj0iJHtwYSA/ICfigKLigKLigKLigKLigKLigKIgKGd1YXJkYWRhKScgOiAnU2VsbGVyIENlbnRlciBQYXJpcyDigLogTWkgY3VlbnRhIOKAuiBJbnRlZ3JhY2lvbmVzJ30iIHJlcXVpcmVkPjwvbGFiZWw+CiAgICAgIDxwIGNsYXNzPSJob3ciPlBhcmlzIGVudHJlZ2EgbGEgQVBJIEtleSBlbiBNaSBjdWVudGEg4oC6IEludGVncmFjaW9uZXMuIFNpIG5vIGFwYXJlY2UsIHNlIHBpZGUgcG9yIHRpY2tldCBhIFBhcmlzLjwvcD4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuICR7cGEgPyAnYnRuLWdob3N0JyA6ICdidG4tcHJpbWFyeSd9IiB0eXBlPSJzdWJtaXQiPiR7cGEgPyAnQWN0dWFsaXphcicgOiAnQ29uZWN0YXIgUGFyaXMnfTwvYnV0dG9uPgogICAgPC9mb3JtPiR7ZGlzYyhwYSl9PC9kaXY+YDsKICAkKCcjZmFGb3JtJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgIGUucHJldmVudERlZmF1bHQoKTsKICAgIGlmIChmYSAmJiAhJCgnI2ZhS2V5JykudmFsdWUpIHsgYXdhaXQgYXBpKGAvYXBpL2Nvbm5lY3Rpb25zLyR7ZmEuaWR9L3NldHRpbmdzJHtzZWxsZXJRUygpfWAsIHsgbWV0aG9kOiAnUEFUQ0gnLCBib2R5OiB7IGF1dG9SZWFkeTogJCgnI2ZhQXV0bycpLmNoZWNrZWQgfSB9KTsgdG9hc3QoJ0d1YXJkYWRvJyk7IHJldHVybiBsb2FkQ29ubmVjdGlvbnMoKTsgfQogICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL2Nvbm5lY3Rpb25zL2ZhJyArIHNlbGxlclFTKCksIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgdXNlcklkOiAkKCcjZmFVc2VyJykudmFsdWUsIGFwaUtleTogJCgnI2ZhS2V5JykudmFsdWUsIHNlbGxlcklkOiAkKCcjZmFTaWQnKS52YWx1ZSwgYXV0b1JlYWR5OiAkKCcjZmFBdXRvJykuY2hlY2tlZCB9IH0pOyB0b2FzdCgnRmFsYWJlbGxhIGNvbmVjdGFkbycpOyBsb2FkQ29ubmVjdGlvbnMoKTsgfQogICAgY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSwgNTAwMCk7IH0KICB9OwogICQoJyNwYUZvcm0nKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4gewogICAgZS5wcmV2ZW50RGVmYXVsdCgpOwogICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL2Nvbm5lY3Rpb25zL3BhJyArIHNlbGxlclFTKCksIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgYXBpS2V5OiAkKCcjcGFLZXknKS52YWx1ZSB9IH0pOyB0b2FzdCgnUGFyaXMgY29uZWN0YWRvJyk7IGxvYWRDb25uZWN0aW9ucygpOyB9CiAgICBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlLCA1MDAwKTsgfQogIH07CiAgaWYgKCQoJyNtbExpbmsnKSkgJCgnI21sTGluaycpLm9uY2xpY2sgPSBhc3luYyAoKSA9PiB7CiAgICB0cnkgewogICAgICBjb25zdCB7IHVybCB9ID0gYXdhaXQgYXBpKCcvYXBpL2FkbWluL21sLWxpbmsnICsgc2VsbGVyUVMoKSwgeyBtZXRob2Q6ICdQT1NUJyB9KTsKICAgICAgdHJ5IHsgYXdhaXQgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQodXJsKTsgdG9hc3QoJ0xpbmsgY29waWFkbzogZW52w61hc2VsbyBhbCB2ZW5kZWRvciAoc2lydmUgcG9yIDQ4IGhvcmFzKScsIDUwMDApOyB9CiAgICAgIGNhdGNoIHsgcHJvbXB0KCdDb3BpYSBlc3RlIGxpbmsgeSBlbnbDrWFzZWxvIGFsIHZlbmRlZG9yIChzaXJ2ZSBwb3IgNDggaG9yYXMpOicsIHVybCk7IH0KICAgIH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IH0KICB9OwogICQoJyNjb25uJykub25jbGljayA9IGFzeW5jIGUgPT4gewogICAgY29uc3QgZCA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLWRlbF0nKTsKICAgIGlmIChkKSB7IGQuZGlzYWJsZWQgPSB0cnVlOyBhd2FpdCBhcGkoYC9hcGkvY29ubmVjdGlvbnMvJHtkLmRhdGFzZXQuZGVsfSR7c2VsbGVyUVMoKX1gLCB7IG1ldGhvZDogJ0RFTEVURScgfSk7IHRvYXN0KCdEZXNjb25lY3RhZG8nKTsgbG9hZENvbm5lY3Rpb25zKCk7IH0KICAgIGNvbnN0IGMgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1jb3B5XScpOwogICAgaWYgKGMpIHsgZS5wcmV2ZW50RGVmYXVsdCgpOyB0cnkgeyBhd2FpdCBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dChjLmRhdGFzZXQuY29weSk7IHRvYXN0KCdDb3BpYWRvJyk7IH0gY2F0Y2ggeyBjLnByZXZpb3VzRWxlbWVudFNpYmxpbmcuc2VsZWN0KCk7IH0gfQogIH07Cn0KCmxldCBibEl0ZW1zID0gW107CmFzeW5jIGZ1bmN0aW9uIGxvYWRCbG9ja2xpc3QoKSB7IGJsSXRlbXMgPSAoYXdhaXQgYXBpKCcvYXBpL2Jsb2NrbGlzdCcgKyBzZWxsZXJRUygpKSkuaXRlbXM7IGRyYXdUYWdzKCk7IH0KZnVuY3Rpb24gZHJhd1RhZ3MoKSB7CiAgY29uc3QgcSA9ICgkKCcjYmxRJyk/LnZhbHVlIHx8ICcnKS50b0xvd2VyQ2FzZSgpOwogIGNvbnN0IGxpc3QgPSBibEl0ZW1zLmZpbHRlcihiID0+ICFxIHx8IGIudmFsdWUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxKSk7CiAgJCgnI3RhZ3MnKS5pbm5lckhUTUwgPSBsaXN0Lmxlbmd0aCA/IGxpc3QubWFwKGIgPT4gYDxzcGFuIGNsYXNzPSJ0YWciPiR7ZXNjKGIudmFsdWUpfSA8c21hbGw+wrcgJHtiLm1hcmtldHBsYWNlID09PSAnYW55JyA/ICd0b2RvcycgOiBNS1tiLm1hcmtldHBsYWNlXX08L3NtYWxsPjxidXR0b24gZGF0YS1ybT0iJHtiLmlkfSIgYXJpYS1sYWJlbD0iUXVpdGFyICR7ZXNjKGIudmFsdWUpfSI+JHtJLnh9PC9idXR0b24+PC9zcGFuPmApLmpvaW4oJycpCiAgICA6IGA8c3BhbiBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTMuNXB4Ij4ke2JsSXRlbXMubGVuZ3RoID8gJ1NpbiByZXN1bHRhZG9zLicgOiAnU2luIHByb2R1Y3RvcyBibG9xdWVhZG9zOiB0b2RvIHZhIGFsIGZ1bGZpbGxtZW50Lid9PC9zcGFuPmA7Cn0KYXN5bmMgZnVuY3Rpb24gbG9hZFNlbGxlck9yZGVycygpIHsKICBpZiAodGFiICE9PSAnc2VsbGVyJyB8fCAhJCgnI215Um93cycpKSByZXR1cm47CiAgbGV0IGxpc3Q7CiAgaWYgKG1lLnVzZXIucm9sZSA9PT0gJ3NlbGxlcicpIGxpc3QgPSAoYXdhaXQgYXBpKCcvYXBpL29yZGVycz92aWV3PWFsbCcpKS5vcmRlcnMuZmlsdGVyKG8gPT4gby5zZWxsZXJfaWQgPT09IG1lLnNlbGxlcj8uaWQpOwogIGVsc2UgbGlzdCA9IChhd2FpdCBhcGkoJy9hcGkvb3JkZXJzP3ZpZXc9YWxsJykpLm9yZGVycy5maWx0ZXIobyA9PiBvLnNlbGxlcl9pZCA9PT0gdWkuYWRtaW5TZWxsZXIpOwogICQoJyNteVJvd3MnKS5pbm5lckhUTUwgPSBsaXN0Lmxlbmd0aCA/IGxpc3Quc2xpY2UoMCwgNjApLm1hcChvID0+IGA8dHI+PHRkIGNsYXNzPSJtb25vIj4ke2VzYyhvLm9yZGVyX251bWJlcil9PHNwYW4gY2xhc3M9Im5vdGUiPiR7ZXNjKGZtdFRpbWUoby5zb2xkX2F0IHx8IG8uY3JlYXRlZF9hdCkpfSR7by5jdXN0b21lciA/ICcgwrcgJyArIGVzYyhvLmN1c3RvbWVyKSA6ICcnfTwvc3Bhbj48L3RkPjx0ZD48c3BhbiBjbGFzcz0ibWsgJHtvLm1hcmtldHBsYWNlfSI+JHtNS1tvLm1hcmtldHBsYWNlXSB8fCAnJ308L3NwYW4+PC90ZD48dGQ+JHtpdGVtc0hUTUwobyl9PC90ZD48dGQ+JHtvLmJsb2NrX25vID8gYDxzcGFuIGNsYXNzPSJibG9ja25vIj5OwrAgJHtvLmJsb2NrX25vfTwvc3Bhbj5gIDogJyd9JHtwaWxsKG8pfSR7by5zdGF0ZSA9PT0gJ2Jsb2NrZWQnICYmIG8ub3duICE9PSBmYWxzZSA/IGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkgYnRuLXNtIiBzdHlsZT0ibWFyZ2luLXRvcDo2cHgiIGRhdGEtdW5ibG9jaz0iJHtvLmlkfSI+RGVzYmxvcXVlYXIgZXRpcXVldGE8L2J1dHRvbj5gIDogJyd9JHtbJ3ByaW50ZWQnLCAnc2hpcHBlZCddLmluY2x1ZGVzKG8uc3RhdGUpICYmIG8ucHJpbnRlZF9ieSA/IGA8c3BhbiBjbGFzcz0ibm90ZSI+SW1wcmltacOzOiAke2VzYyhvLnByaW50ZWRfYnkpfTwvc3Bhbj5gIDogJyd9JHtvLnN0YXRlID09PSAnZXJyb3InIHx8IG8uc3RhdGUgPT09ICd3YWl0aW5nJyA/IGA8c3BhbiBjbGFzcz0ibm90ZSAke28uc3RhdGUgPT09ICdlcnJvcicgPyAnYmFkJyA6ICcnfSI+JHtlc2Moby5lcnJvciB8fCAnJyl9PC9zcGFuPmAgOiAnJ308L3RkPjwvdHI+YCkuam9pbignJykKICAgIDogYDx0cj48dGQgY29sc3Bhbj0iNCI+PGRpdiBjbGFzcz0iZW1wdHkiPkHDum4gbm8gaGF5IHBlZGlkb3MuIENvbmVjdGEgdHVzIG1hcmtldHBsYWNlcyB5IGFwYXJlY2Vyw6FuIGFxdcOtLjwvZGl2PjwvdGQ+PC90cj5gOwp9CgovLyAtLS0tLS0tLS0tIEFETUlOIC0tLS0tLS0tLS0KYXN5bmMgZnVuY3Rpb24gcmVuZGVyQWRtaW4oKSB7CiAgY29uc3QgW2QsIHN0XSA9IGF3YWl0IFByb21pc2UuYWxsKFthcGkoJy9hcGkvYWRtaW4vc2VsbGVycycpLCBhcGkoJy9hcGkvYWRtaW4vc2V0dGluZ3MnKV0pOwogIGNvbnN0IHNOYW1lID0gaWQgPT4gZC5zZWxsZXJzLmZpbmQocyA9PiBzLmlkID09PSBpZCk/Lm5hbWUgfHwgJyc7CiAgY29uc3Qgcm9sZU5hbWUgPSB7IGFkbWluOiAnQWRtaW5pc3RyYWRvcicsIGZ1bGZpbGxtZW50OiAnRnVsZmlsbG1lbnQnLCBzZWxsZXI6ICdWZW5kZWRvcicgfTsKICAkKCcjbWFpbicpLmlubmVySFRNTCA9IGAKICA8ZGl2IGNsYXNzPSJncmlkMiI+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbCI+PGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+PGgyPlZlbmRlZG9yZXM8L2gyPjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJwYW5lbC1ib2R5IHN0YWNrIj4KICAgICAgICA8Zm9ybSBjbGFzcz0icm93IiBpZD0ibmV3U2VsbGVyIj48bGFiZWwgY2xhc3M9ImYiPk5vbWJyZSBkZSBsYSB0aWVuZGE8aW5wdXQgdHlwZT0idGV4dCIgaWQ9Im5zTmFtZSIgcmVxdWlyZWQ+PC9sYWJlbD48YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIHR5cGU9InN1Ym1pdCIgc3R5bGU9ImZsZXg6MCI+QWdyZWdhcjwvYnV0dG9uPjwvZm9ybT4KICAgICAgICA8ZGl2IGNsYXNzPSJ0YWJsZS13cmFwIj48dGFibGUgc3R5bGU9Im1pbi13aWR0aDo0MjBweCI+PHRoZWFkPjx0cj48dGg+VmVuZGVkb3I8L3RoPjx0aD5NYXJrZXRwbGFjZXM8L3RoPjx0aD5CbG9xdWVhZG9zPC90aD48dGg+PC90aD48L3RyPjwvdGhlYWQ+PHRib2R5PgogICAgICAgICR7ZC5zZWxsZXJzLm1hcChzID0+IGA8dHI+PHRkPjxiPiR7ZXNjKHMubmFtZSl9PC9iPjwvdGQ+PHRkPiR7cy5jb25uZWN0aW9ucy5maWx0ZXIoYyA9PiBNS1tjLm1hcmtldHBsYWNlXSkubWFwKGMgPT4gYDxzcGFuIGNsYXNzPSJtayAke2MubWFya2V0cGxhY2V9IiB0aXRsZT0iJHtlc2MoYy5sYXN0X2Vycm9yIHx8ICdPSycpfSI+JHtNS1tjLm1hcmtldHBsYWNlXX0ke2MubGFzdF9lcnJvciA/ICcg4pqgJyA6ICcnfTwvc3Bhbj5gKS5qb2luKCcgJykgfHwgJzxzcGFuIGNsYXNzPSJtdXRlZCI+4oCUPC9zcGFuPid9PC90ZD48dGQ+JHtzLmJsb2NrZWR9PC90ZD48dGQ+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1kYW5nZXIgYnRuLXNtIiBkYXRhLWRlbHM9IiR7cy5pZH0iPkVsaW1pbmFyPC9idXR0b24+PC90ZD48L3RyPmApLmpvaW4oJycpIHx8ICc8dHI+PHRkIGNvbHNwYW49IjQiIGNsYXNzPSJtdXRlZCI+U2luIHZlbmRlZG9yZXM8L3RkPjwvdHI+J30KICAgICAgICA8L3Rib2R5PjwvdGFibGU+PC9kaXY+CiAgICAgIDwvZGl2PjwvZGl2PgogICAgPGRpdiBjbGFzcz0icGFuZWwiPjxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj5Vc3VhcmlvczwvaDI+PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9InBhbmVsLWJvZHkgc3RhY2siPgogICAgICAgIDxmb3JtIGNsYXNzPSJzdGFjayIgaWQ9Im5ld1VzZXIiPgogICAgICAgICAgPGRpdiBjbGFzcz0icm93Ij48bGFiZWwgY2xhc3M9ImYiPk5vbWJyZTxpbnB1dCB0eXBlPSJ0ZXh0IiBpZD0ibnVOYW1lIiByZXF1aXJlZD48L2xhYmVsPjxsYWJlbCBjbGFzcz0iZiI+Q29ycmVvPGlucHV0IHR5cGU9ImVtYWlsIiBpZD0ibnVFbWFpbCIgcmVxdWlyZWQ+PC9sYWJlbD48L2Rpdj4KICAgICAgICAgIDxkaXYgY2xhc3M9InJvdyI+PGxhYmVsIGNsYXNzPSJmIj5Sb2w8c2VsZWN0IGlkPSJudVJvbGUiPjxvcHRpb24gdmFsdWU9InNlbGxlciI+VmVuZGVkb3I8L29wdGlvbj48b3B0aW9uIHZhbHVlPSJmdWxmaWxsbWVudCI+RnVsZmlsbG1lbnQ8L29wdGlvbj48b3B0aW9uIHZhbHVlPSJhZG1pbiI+QWRtaW5pc3RyYWRvcjwvb3B0aW9uPjwvc2VsZWN0PjwvbGFiZWw+CiAgICAgICAgICA8bGFiZWwgY2xhc3M9ImYiIGlkPSJudVNlbGxlcldyYXAiPlRpZW5kYTxzZWxlY3QgaWQ9Im51U2VsbGVyIj4ke2Quc2VsbGVycy5tYXAocyA9PiBgPG9wdGlvbiB2YWx1ZT0iJHtzLmlkfSI+JHtlc2Mocy5uYW1lKX08L29wdGlvbj5gKS5qb2luKCcnKX08L3NlbGVjdD48L2xhYmVsPjwvZGl2PgogICAgICAgICAgPGRpdiBjbGFzcz0icm93Ij48bGFiZWwgY2xhc3M9ImYiPkNvbnRyYXNlw7FhIGluaWNpYWwgKG3DrW4uIDgpPGlucHV0IHR5cGU9InRleHQiIGlkPSJudVBhc3MiIG1pbmxlbmd0aD0iOCIgcmVxdWlyZWQ+PC9sYWJlbD48YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIHR5cGU9InN1Ym1pdCIgc3R5bGU9ImZsZXg6MCI+Q3JlYXIgdXN1YXJpbzwvYnV0dG9uPjwvZGl2PgogICAgICAgIDwvZm9ybT4KICAgICAgICA8cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJtYXJnaW46MDtmb250LXNpemU6MTNweCI+PGI+Q2xhdmUgdGVtcG9yYWw6PC9iPiBjcmVhIHVuYSBjbGF2ZSBudWV2YSBxdWUgbGUgZGljdGFzIGFsIHZlbmRlZG9yOyBhbCBlbnRyYXIgZGViZSBjYW1iaWFybGEuIDxiPkNsYXZlIGRlIHJlc3BhbGRvOjwvYj4gdW4gY8OzZGlnbyBkZSB1biBzb2xvIHVzbyBxdWUgZWwgdmVuZGVkb3IgZ3VhcmRhIHBvciBzaSBvbHZpZGEgc3UgY2xhdmUuIDxiPkVudHJhciBjb21vOjwvYj4gYWJyZXMgc3UgY3VlbnRhIHNpbiBzYWJlciBzdSBjbGF2ZSwgcGFyYSBheXVkYXJsby48L3A+CiAgICAgICAgPGRpdiBjbGFzcz0idGFibGUtd3JhcCI+PHRhYmxlIHN0eWxlPSJtaW4td2lkdGg6NzYwcHgiPjx0aGVhZD48dHI+PHRoPlVzdWFyaW88L3RoPjx0aD5Sb2w8L3RoPjx0aD5BY2Nlc288L3RoPjx0aD48L3RoPjwvdHI+PC90aGVhZD48dGJvZHk+CiAgICAgICAgJHtkLnVzZXJzLm1hcCh1ID0+IGA8dHI+PHRkPjxiPiR7ZXNjKHUubmFtZSl9PC9iPjxzcGFuIGNsYXNzPSJub3RlIj4ke2VzYyh1LmVtYWlsKX08L3NwYW4+PC90ZD48dGQ+JHt1LmlkID09PSBtZS51c2VyLmlkID8gcm9sZU5hbWVbdS5yb2xlXSA6IGA8c2VsZWN0IGRhdGEtcm9sZT0iJHt1LmlkfSIgc3R5bGU9IndpZHRoOmF1dG87cGFkZGluZzo0cHggOHB4IiBhcmlhLWxhYmVsPSJSb2wiPiR7T2JqZWN0LmVudHJpZXMocm9sZU5hbWUpLmZpbHRlcigoW2tdKSA9PiBrICE9PSAnc2VsbGVyJyB8fCB1LnNlbGxlcl9pZCkubWFwKChbaywgbl0pID0+IGA8b3B0aW9uIHZhbHVlPSIke2t9IiAke3Uucm9sZSA9PT0gayA/ICdzZWxlY3RlZCcgOiAnJ30+JHtufTwvb3B0aW9uPmApLmpvaW4oJycpfTwvc2VsZWN0PmB9JHt1LnNlbGxlcl9pZCA/ICcgwrcgJyArIGVzYyhzTmFtZSh1LnNlbGxlcl9pZCkpIDogJyd9PC90ZD48dGQ+JHt1Lmhhc19iYWNrdXAgPyAnPHNwYW4gY2xhc3M9InBpbGwgcmVhZHkiIHN0eWxlPSJtYXJnaW4tdG9wOjRweCI+UmVzcGFsZG8gbGlzdG88L3NwYW4+JyA6ICcnfSR7dS5tdXN0X2NoYW5nZSA/ICcgPHNwYW4gY2xhc3M9InBpbGwgd2FpdGluZyIgc3R5bGU9Im1hcmdpbi10b3A6NHB4Ij5EZWJlIGNyZWFyIGNsYXZlIG51ZXZhPC9zcGFuPicgOiAnJ308L3RkPjx0ZD48ZGl2IGNsYXNzPSJyb3ctYWN0aW9ucyI+CiAgICAgICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWdob3N0IGJ0bi1zbSIgZGF0YS1hY3Q9InRlbXAtcGFzc3dvcmQiIGRhdGEtaWQ9IiR7dS5pZH0iIGRhdGEtbmFtZT0iJHtlc2ModS5uYW1lKX0iPkNsYXZlIHRlbXBvcmFsPC9idXR0b24+CiAgICAgICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWFjdD0iYmFja3VwLWNvZGUiIGRhdGEtaWQ9IiR7dS5pZH0iIGRhdGEtbmFtZT0iJHtlc2ModS5uYW1lKX0iPkNsYXZlIGRlIHJlc3BhbGRvPC9idXR0b24+CiAgICAgICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWFjdD0ic2VuZC1jb2RlIiBkYXRhLWlkPSIke3UuaWR9IiBkYXRhLW5hbWU9IiR7ZXNjKHUubmFtZSl9Ij5FbnZpYXIgY8OzZGlnbzwvYnV0dG9uPgogICAgICAgICAgJHt1LmlkID09PSBtZS51c2VyLmlkID8gJycgOiBgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1hY3Q9ImltcGVyc29uYXRlIiBkYXRhLWlkPSIke3UuaWR9IiBkYXRhLW5hbWU9IiR7ZXNjKHUubmFtZSl9Ij5FbnRyYXIgY29tbzwvYnV0dG9uPjxidXR0b24gY2xhc3M9ImJ0biBidG4tZGFuZ2VyIGJ0bi1zbSIgZGF0YS1kZWx1PSIke3UuaWR9Ij5FbGltaW5hcjwvYnV0dG9uPmB9PC9kaXY+PC90ZD48L3RyPmApLmpvaW4oJycpfQogICAgICAgIDwvdGJvZHk+PC90YWJsZT48L2Rpdj4KICAgICAgPC9kaXY+PC9kaXY+CiAgPC9kaXY+CiAgPGRpdiBjbGFzcz0icGFuZWwiIHN0eWxlPSJtYXJnaW4tdG9wOjIwcHgiPjxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj5FbmxhY2VzIMO6dGlsZXM8L2gyPjwvZGl2PgogICAgPGRpdiBjbGFzcz0icGFuZWwtYm9keSI+PHVsIHN0eWxlPSJsaXN0LXN0eWxlOm5vbmU7bWFyZ2luOjA7cGFkZGluZzowIj48bGkgc3R5bGU9ImRpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjJweDtwYWRkaW5nOjEwcHggMDtib3JkZXItdG9wOjFweCBzb2xpZCB2YXIoLS1saW5lKSI+PGEgaHJlZj0iaHR0cHM6Ly9ldGlxdWV0YWh1Yi1qYXZpLm9ucmVuZGVyLmNvbSIgdGFyZ2V0PSJfYmxhbmsiIHJlbD0ibm9vcGVuZXIiIHN0eWxlPSJmb250LXdlaWdodDo3MDAiPlR1IGFwcCBFdGlxdWV0YUh1YjwvYT48c3BhbiBjbGFzcz0ibW9ubyBtdXRlZCIgc3R5bGU9ImZvbnQtc2l6ZToxMnB4Ij5odHRwczovL2V0aXF1ZXRhaHViLWphdmkub25yZW5kZXIuY29tPC9zcGFuPjxzcGFuIGNsYXNzPSJtdXRlZCIgc3R5bGU9ImZvbnQtc2l6ZToxM3B4Ij5Fc3RhIG1pc21hIGFwcC4gQ29tcMOhcnRlbGEgY29uIGxvcyB2ZW5kZWRvcmVzIHkgZWwgZnVsZmlsbG1lbnQuPC9zcGFuPjwvbGk+PGxpIHN0eWxlPSJkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDoycHg7cGFkZGluZzoxMHB4IDA7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tbGluZSkiPjxhIGhyZWY9Imh0dHBzOi8vZGV2ZWxvcGVycy5tZXJjYWRvbGlicmUuY2wvZGV2Y2VudGVyIiB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciIgc3R5bGU9ImZvbnQtd2VpZ2h0OjcwMCI+TWVyY2FkbyBMaWJyZSBEZXZlbG9wZXJzPC9hPjxzcGFuIGNsYXNzPSJtb25vIG11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEycHgiPmh0dHBzOi8vZGV2ZWxvcGVycy5tZXJjYWRvbGlicmUuY2wvZGV2Y2VudGVyPC9zcGFuPjxzcGFuIGNsYXNzPSJtdXRlZCIgc3R5bGU9ImZvbnQtc2l6ZToxM3B4Ij5Eb25kZSBlc3TDoSBsYSBhcGxpY2FjacOzbiBFdGlxdWV0YUh1YiB5IHN1IFNlY3JldCBLZXkuIEVudHJhcyBjb24gdHUgY3VlbnRhIG5vcm1hbCBkZSBNZXJjYWRvIExpYnJlLjwvc3Bhbj48L2xpPjxsaSBzdHlsZT0iZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MnB4O3BhZGRpbmc6MTBweCAwO2JvcmRlci10b3A6MXB4IHNvbGlkIHZhcigtLWxpbmUpIj48YSBocmVmPSJodHRwczovL2Rhc2hib2FyZC5yZW5kZXIuY29tIiB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciIgc3R5bGU9ImZvbnQtd2VpZ2h0OjcwMCI+UmVuZGVyPC9hPjxzcGFuIGNsYXNzPSJtb25vIG11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEycHgiPmh0dHBzOi8vZGFzaGJvYXJkLnJlbmRlci5jb208L3NwYW4+PHNwYW4gY2xhc3M9Im11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEzcHgiPkRvbmRlIHZpdmUgbGEgYXBwLiBBcXXDrSBzZSBwdWJsaWNhIGNhZGEgdmVyc2nDs24gbnVldmEgKE1hbnVhbCBEZXBsb3kpLjwvc3Bhbj48L2xpPjxsaSBzdHlsZT0iZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MnB4O3BhZGRpbmc6MTBweCAwO2JvcmRlci10b3A6MXB4IHNvbGlkIHZhcigtLWxpbmUpIj48YSBocmVmPSJodHRwczovL2dpdGh1Yi5jb20vZWR1YXJkb2RpbmFyZGk5Ni1ib29wL2V0aXF1ZXRhaHViIiB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciIgc3R5bGU9ImZvbnQtd2VpZ2h0OjcwMCI+R2l0SHViPC9hPjxzcGFuIGNsYXNzPSJtb25vIG11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEycHgiPmh0dHBzOi8vZ2l0aHViLmNvbS9lZHVhcmRvZGluYXJkaTk2LWJvb3AvZXRpcXVldGFodWI8L3NwYW4+PHNwYW4gY2xhc3M9Im11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEzcHgiPkVsIGPDs2RpZ28gZGUgbGEgYXBwIHkgZWwgcmVzcGFsZG8gYXV0b23DoXRpY28gY2FkYSAxNSBtaW51dG9zLjwvc3Bhbj48L2xpPjxsaSBzdHlsZT0iZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MnB4O3BhZGRpbmc6MTBweCAwO2JvcmRlci10b3A6MXB4IHNvbGlkIHZhcigtLWxpbmUpIj48YSBocmVmPSJodHRwczovL2FwcC5icmV2by5jb20iIHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIiBzdHlsZT0iZm9udC13ZWlnaHQ6NzAwIj5CcmV2bzwvYT48c3BhbiBjbGFzcz0ibW9ubyBtdXRlZCIgc3R5bGU9ImZvbnQtc2l6ZToxMnB4Ij5odHRwczovL2FwcC5icmV2by5jb208L3NwYW4+PHNwYW4gY2xhc3M9Im11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEzcHgiPkVsIHNlcnZpY2lvIHF1ZSBlbnbDrWEgbG9zIGNvcnJlb3MgY29uIGPDs2RpZ29zIHBhcmEgcmVjdXBlcmFyIGNvbnRyYXNlw7FhLjwvc3Bhbj48L2xpPjwvdWw+PC9kaXY+PC9kaXY+CiAgPGRpdiBjbGFzcz0icGFuZWwiIHN0eWxlPSJtYXJnaW4tdG9wOjIwcHgiPjxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj5Db25leGnDs24gY29uIE1lcmNhZG8gTGlicmU8L2gyPiR7c3QubWxfY2xpZW50X2lkICYmIHN0Lm1sX3NlY3JldF9zZXQgPyAnPHNwYW4gY2xhc3M9InN0YXRlIG9uIj48aT48L2k+Q29uZmlndXJhZGE8L3NwYW4+JyA6ICc8c3BhbiBjbGFzcz0ic3RhdGUgZXJyIj48aT48L2k+RmFsdGEgY29uZmlndXJhcjwvc3Bhbj4nfTwvZGl2PgogICAgPGRpdiBjbGFzcz0icGFuZWwtYm9keSBzdGFjayI+CiAgICAgIDxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9Im1hcmdpbjowIj5DcmVhIHVuYSBhcGxpY2FjacOzbiBlbiA8YSBocmVmPSJodHRwczovL2RldmVsb3BlcnMubWVyY2Fkb2xpYnJlLmNsL2RldmNlbnRlciIgdGFyZ2V0PSJfYmxhbmsiIHJlbD0ibm9vcGVuZXIiPmRldmVsb3BlcnMubWVyY2Fkb2xpYnJlLmNsPC9hPiBjb24gZXN0b3MgZGF0b3MgeSBwZWdhIGFxdcOtIHN1IEFwcCBJRCB5IFNlY3JldCBLZXkuIFVuYSBzb2xhIGFwcCBzaXJ2ZSBwYXJhIHRvZG9zIGxvcyB2ZW5kZWRvcmVzLjwvcD4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5VUkkgZGUgcmVkaXJlY3Q8c3BhbiBjbGFzcz0iY29weSI+PGlucHV0IHR5cGU9InRleHQiIHJlYWRvbmx5IHZhbHVlPSIke2VzYyhzdC5tbF9yZWRpcmVjdF91cmkpfSI+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1jb3B5PSIke2VzYyhzdC5tbF9yZWRpcmVjdF91cmkpfSI+Q29waWFyPC9idXR0b24+PC9zcGFuPjwvbGFiZWw+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+VVJMIGRlIG5vdGlmaWNhY2lvbmVzICh0w7NwaWNvczogb3JkZXJzX3YyIHkgc2hpcG1lbnRzKTxzcGFuIGNsYXNzPSJjb3B5Ij48aW5wdXQgdHlwZT0idGV4dCIgcmVhZG9ubHkgdmFsdWU9IiR7ZXNjKHN0Lm1sX25vdGlmaWNhdGlvbnNfdXJsKX0iPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtY29weT0iJHtlc2Moc3QubWxfbm90aWZpY2F0aW9uc191cmwpfSI+Q29waWFyPC9idXR0b24+PC9zcGFuPjwvbGFiZWw+CiAgICAgIDxmb3JtIGNsYXNzPSJyb3ciIGlkPSJtbENmZyI+PGxhYmVsIGNsYXNzPSJmIj5BcHAgSUQ8aW5wdXQgdHlwZT0idGV4dCIgaWQ9Im1sSWQiIHZhbHVlPSIke2VzYyhzdC5tbF9jbGllbnRfaWQpfSIgcmVxdWlyZWQ+PC9sYWJlbD48bGFiZWwgY2xhc3M9ImYiPlNlY3JldCBLZXk8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJtbFNlY3JldCIgcGxhY2Vob2xkZXI9IiR7c3QubWxfc2VjcmV0X3NldCA/ICfigKLigKLigKLigKLigKLigKIgKGd1YXJkYWRhKScgOiAnJ30iPjwvbGFiZWw+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiIHN0eWxlPSJmbGV4OjAiPkd1YXJkYXI8L2J1dHRvbj48L2Zvcm0+CiAgICA8L2Rpdj48L2Rpdj4KICA8ZGl2IGNsYXNzPSJwYW5lbCIgc3R5bGU9Im1hcmdpbi10b3A6MjBweCI+PGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+PGgyPkNvcnJlb3MgKHJlY3VwZXJhciBjb250cmFzZcOxYSk8L2gyPiR7c3QubWFpbF9rZXlfc2V0ICYmIHN0Lm1haWxfZnJvbSA/ICc8c3BhbiBjbGFzcz0ic3RhdGUgb24iPjxpPjwvaT5BY3RpdmFkbzwvc3Bhbj4nIDogJzxzcGFuIGNsYXNzPSJzdGF0ZSBlcnIiPjxpPjwvaT5TaW4gY29uZmlndXJhcjwvc3Bhbj4nfTwvZGl2PgogICAgPGRpdiBjbGFzcz0icGFuZWwtYm9keSBzdGFjayI+CiAgICAgIDxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9Im1hcmdpbjowIj5QYXJhIGVudmlhciBsb3MgY8OzZGlnb3MgZGUgNiBkw61naXRvcyBzZSB1c2EgPGEgaHJlZj0iaHR0cHM6Ly93d3cuYnJldm8uY29tIiB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciI+QnJldm88L2E+IChncmF0aXMgaGFzdGEgMzAwIGNvcnJlb3MgYWwgZMOtYSkuIENyZWEgdW5hIGN1ZW50YSwgdmVyaWZpY2EgZWwgY29ycmVvIHJlbWl0ZW50ZSB5IGNvcGlhIHVuYSBBUEkgS2V5IChDb25maWd1cmFjacOzbiDigLogU01UUCB5IEFQSSDigLogQVBJIEtleXMpLjwvcD4KICAgICAgPGZvcm0gY2xhc3M9InN0YWNrIiBpZD0ibWFpbENmZyI+CiAgICAgICAgPGRpdiBjbGFzcz0icm93Ij48bGFiZWwgY2xhc3M9ImYiPkNvcnJlbyByZW1pdGVudGUgKHZlcmlmaWNhZG8gZW4gQnJldm8pPGlucHV0IHR5cGU9ImVtYWlsIiBpZD0ibUZyb20iIHZhbHVlPSIke2VzYyhzdC5tYWlsX2Zyb20gfHwgJycpfSIgcmVxdWlyZWQ+PC9sYWJlbD48bGFiZWwgY2xhc3M9ImYiPk5vbWJyZSByZW1pdGVudGU8aW5wdXQgdHlwZT0idGV4dCIgaWQ9Im1OYW1lIiB2YWx1ZT0iJHtlc2Moc3QubWFpbF9mcm9tX25hbWUgfHwgJ0V0aXF1ZXRhSHViJyl9Ij48L2xhYmVsPjwvZGl2PgogICAgICAgIDxkaXYgY2xhc3M9InJvdyI+PGxhYmVsIGNsYXNzPSJmIj5BUEkgS2V5IGRlIEJyZXZvPGlucHV0IHR5cGU9InBhc3N3b3JkIiBpZD0ibUtleSIgcGxhY2Vob2xkZXI9IiR7c3QubWFpbF9rZXlfc2V0ID8gJ+KAouKAouKAouKAouKAouKAoiAoZ3VhcmRhZGEpJyA6ICd4a2V5c2liLeKApid9Ij48L2xhYmVsPjxsYWJlbCBjbGFzcz0iZiI+RW52aWFyIHBydWViYSBhIChvcGNpb25hbCk8aW5wdXQgdHlwZT0iZW1haWwiIGlkPSJtVGVzdCIgdmFsdWU9IiR7ZXNjKG1lLnVzZXIuZW1haWwpfSI+PC9sYWJlbD48L2Rpdj4KICAgICAgICA8ZGl2IGNsYXNzPSJyb3ciIHN0eWxlPSJqdXN0aWZ5LWNvbnRlbnQ6ZmxleC1lbmQiPjxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgdHlwZT0ic3VibWl0IiBzdHlsZT0iZmxleDowIj5HdWFyZGFyPC9idXR0b24+PC9kaXY+CiAgICAgIDwvZm9ybT4KICAgIDwvZGl2PjwvZGl2PgogIDxkaXYgY2xhc3M9Im1vZGFsIiBpZD0iY29uZmlybSIgaGlkZGVuPjxkaXYgY2xhc3M9InNoZWV0Ij48aDMgaWQ9ImNmVGl0bGUiPsK/U2VndXJvPzwvaDM+PHAgY2xhc3M9Im11dGVkIiBpZD0iY2ZUZXh0IiBzdHlsZT0ibWFyZ2luOjAiPjwvcD48ZGl2IGlkPSJjZkV4dHJhIj48L2Rpdj48ZGl2IGNsYXNzPSJyb3ciIHN0eWxlPSJqdXN0aWZ5LWNvbnRlbnQ6ZmxleC1lbmQiPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSIgaWQ9ImNmTm8iIHN0eWxlPSJmbGV4OjAiPkNhbmNlbGFyPC9idXR0b24+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiBpZD0iY2ZZZXMiIHN0eWxlPSJmbGV4OjAiPkNvbmZpcm1hcjwvYnV0dG9uPjwvZGl2PjwvZGl2PjwvZGl2PmA7CiAgY29uc3Qgcm9sZSA9ICQoJyNudVJvbGUnKTsgY29uc3Qgc3luYyA9ICgpID0+ICQoJyNudVNlbGxlcldyYXAnKS5oaWRkZW4gPSByb2xlLnZhbHVlICE9PSAnc2VsbGVyJzsgcm9sZS5vbmNoYW5nZSA9IHN5bmM7IHN5bmMoKTsKICAkKCcjbmV3U2VsbGVyJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsgZS5wcmV2ZW50RGVmYXVsdCgpOyB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvYWRtaW4vc2VsbGVycycsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgbmFtZTogJCgnI25zTmFtZScpLnZhbHVlIH0gfSk7IHRvYXN0KCdWZW5kZWRvciBhZ3JlZ2FkbycpOyByZW5kZXJBZG1pbigpOyB9IGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UpOyB9IH07CiAgJCgnI25ld1VzZXInKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4geyBlLnByZXZlbnREZWZhdWx0KCk7IHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9hZG1pbi91c2VycycsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgbmFtZTogJCgnI251TmFtZScpLnZhbHVlLCBlbWFpbDogJCgnI251RW1haWwnKS52YWx1ZSwgcm9sZTogcm9sZS52YWx1ZSwgc2VsbGVyX2lkOiAkKCcjbnVTZWxsZXInKS52YWx1ZSwgcGFzc3dvcmQ6ICQoJyNudVBhc3MnKS52YWx1ZSB9IH0pOyB0b2FzdCgnVXN1YXJpbyBjcmVhZG8nKTsgcmVuZGVyQWRtaW4oKTsgfSBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlLCA0MDAwKTsgfSB9OwogIGNvbnN0IGNvbmZpcm1Cb3ggPSAodGl0bGUsIHRleHQsIGV4dHJhID0gJycpID0+IG5ldyBQcm9taXNlKHJlcyA9PiB7CiAgICAkKCcjY2ZUaXRsZScpLnRleHRDb250ZW50ID0gdGl0bGU7ICQoJyNjZlRleHQnKS50ZXh0Q29udGVudCA9IHRleHQ7ICQoJyNjZkV4dHJhJykuaW5uZXJIVE1MID0gZXh0cmE7ICQoJyNjb25maXJtJykuaGlkZGVuID0gZmFsc2U7CiAgICAkKCcjY2ZObycpLm9uY2xpY2sgPSAoKSA9PiB7ICQoJyNjb25maXJtJykuaGlkZGVuID0gdHJ1ZTsgcmVzKGZhbHNlKTsgfTsKICAgICQoJyNjZlllcycpLm9uY2xpY2sgPSAoKSA9PiB7ICQoJyNjb25maXJtJykuaGlkZGVuID0gdHJ1ZTsgcmVzKHRydWUpOyB9OwogIH0pOwogICQoJyNtYWlsQ2ZnJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgIGUucHJldmVudERlZmF1bHQoKTsKICAgIHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9hZG1pbi9zZXR0aW5ncycsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgbWFpbF9mcm9tOiAkKCcjbUZyb20nKS52YWx1ZSwgbWFpbF9mcm9tX25hbWU6ICQoJyNtTmFtZScpLnZhbHVlLCBtYWlsX2FwaV9rZXk6ICQoJyNtS2V5JykudmFsdWUsIHRlc3RfdG86ICQoJyNtVGVzdCcpLnZhbHVlIH0gfSk7IHRvYXN0KCQoJyNtVGVzdCcpLnZhbHVlID8gJ0d1YXJkYWRvLiBUZSBlbnZpYW1vcyB1biBjb3JyZW8gZGUgcHJ1ZWJhLicgOiAnR3VhcmRhZG8nKTsgcmVuZGVyQWRtaW4oKTsgfQogICAgY2F0Y2ggKHgpIHsgdG9hc3QoeC5tZXNzYWdlLCA1MDAwKTsgfQogIH07CiAgJCgnI21sQ2ZnJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsgZS5wcmV2ZW50RGVmYXVsdCgpOyBhd2FpdCBhcGkoJy9hcGkvYWRtaW4vc2V0dGluZ3MnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IG1sX2NsaWVudF9pZDogJCgnI21sSWQnKS52YWx1ZSwgbWxfY2xpZW50X3NlY3JldDogJCgnI21sU2VjcmV0JykudmFsdWUgfSB9KTsgdG9hc3QoJ01lcmNhZG8gTGlicmUgY29uZmlndXJhZG8nKTsgbWUubWxDb25maWd1cmVkID0gdHJ1ZTsgcmVuZGVyQWRtaW4oKTsgfTsKICAkKCcjbWFpbicpLm9uY2hhbmdlID0gYXN5bmMgZSA9PiB7IGNvbnN0IHIgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1yb2xlXScpOyBpZiAoIXIpIHJldHVybjsgdHJ5IHsgYXdhaXQgYXBpKGAvYXBpL2FkbWluL3VzZXJzLyR7ci5kYXRhc2V0LnJvbGV9L3JvbGVgLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IHJvbGU6IHIudmFsdWUgfSB9KTsgdG9hc3QoJ1JvbCBhY3R1YWxpemFkbyAoZGViZSB2b2x2ZXIgYSBpbmljaWFyIHNlc2nDs24pJyk7IH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IHJlbmRlckFkbWluKCk7IH0gfTsKICAkKCcjbWFpbicpLm9uY2xpY2sgPSBhc3luYyBlID0+IHsKICAgIGNvbnN0IGNwID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtY29weV0nKTsKICAgIGlmIChjcCkgeyBlLnByZXZlbnREZWZhdWx0KCk7IHRyeSB7IGF3YWl0IG5hdmlnYXRvci5jbGlwYm9hcmQud3JpdGVUZXh0KGNwLmRhdGFzZXQuY29weSk7IHRvYXN0KCdDb3BpYWRvJyk7IH0gY2F0Y2ggeyBjcC5wcmV2aW91c0VsZW1lbnRTaWJsaW5nLnNlbGVjdCgpOyB9IHJldHVybjsgfQogICAgY29uc3QgYWN0ID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtYWN0XScpOwogICAgaWYgKGFjdCkgewogICAgICBjb25zdCBpZCA9IGFjdC5kYXRhc2V0LmlkLCBuYW1lID0gYWN0LmRhdGFzZXQubmFtZSwga2luZCA9IGFjdC5kYXRhc2V0LmFjdDsKICAgICAgY29uc3QgdGV4dHMgPSB7CiAgICAgICAgJ3RlbXAtcGFzc3dvcmQnOiBbJ0NsYXZlIHRlbXBvcmFsJywgYFNlIHJlZW1wbGF6YSBsYSBjbGF2ZSBhY3R1YWwgZGUgJHtuYW1lfS4gQWwgZW50cmFyIGNvbiBsYSBjbGF2ZSB0ZW1wb3JhbCB0ZW5kcsOhIHF1ZSBjcmVhciB1bmEgbnVldmEuYF0sCiAgICAgICAgJ2JhY2t1cC1jb2RlJzogWydDbGF2ZSBkZSByZXNwYWxkbycsIGBTZSBjcmVhIHVuIGPDs2RpZ28gZGUgdW4gc29sbyB1c28gcGFyYSAke25hbWV9LiBTaSB5YSB0ZW7DrWEgdW5vLCBlbCBhbnRlcmlvciBkZWphIGRlIHNlcnZpci5gXSwKICAgICAgICAnc2VuZC1jb2RlJzogWydFbnZpYXIgY8OzZGlnbycsIGBMZSBsbGVnYSBhICR7bmFtZX0gdW4gY8OzZGlnbyBkZSA2IGTDrWdpdG9zIGEgc3UgY29ycmVvIHBhcmEgZW50cmFyIG8gY2FtYmlhciBzdSBjbGF2ZS5gXSwKICAgICAgICAnaW1wZXJzb25hdGUnOiBbJ0VudHJhciBjb21vICcgKyBuYW1lLCAnVmVyw6FzIGxhIGFwcCBjb21vIGxhIHZlIGVzdGEgcGVyc29uYSwgc2luIG5lY2VzaXRhciBzdSBjbGF2ZS4gUXVlZGEgcmVnaXN0cmFkby4gUGFyYSBzYWxpciBhcHJpZXRhICJWb2x2ZXIgYSBtaSBjdWVudGEiLiddLAogICAgICB9OwogICAgICBpZiAoIWF3YWl0IGNvbmZpcm1Cb3godGV4dHNba2luZF1bMF0sIHRleHRzW2tpbmRdWzFdKSkgcmV0dXJuOwogICAgICB0cnkgewogICAgICAgIGNvbnN0IHIgPSBhd2FpdCBhcGkoYC9hcGkvYWRtaW4vdXNlcnMvJHtpZH0vJHtraW5kfWAsIHsgbWV0aG9kOiAnUE9TVCcgfSk7CiAgICAgICAgaWYgKGtpbmQgPT09ICdpbXBlcnNvbmF0ZScpIHsgbG9jYXRpb24uaHJlZiA9ICcvJzsgcmV0dXJuOyB9CiAgICAgICAgaWYgKHIucGFzc3dvcmQgfHwgci5jb2RlKSB7CiAgICAgICAgICBjb25zdCB2YWwgPSByLnBhc3N3b3JkIHx8IHIuY29kZTsKICAgICAgICAgIGF3YWl0IGNvbmZpcm1Cb3goa2luZCA9PT0gJ3RlbXAtcGFzc3dvcmQnID8gJ0NsYXZlIHRlbXBvcmFsIGRlICcgKyBuYW1lIDogJ0NsYXZlIGRlIHJlc3BhbGRvIGRlICcgKyBuYW1lLAogICAgICAgICAgICBraW5kID09PSAndGVtcC1wYXNzd29yZCcgPyAnRMOtc2VsYSBhbCB1c3VhcmlvLiBTb2xvIHNlIG11ZXN0cmEgYWhvcmE7IGFsIGVudHJhciB0ZW5kcsOhIHF1ZSBjcmVhciBzdSBwcm9waWEgY2xhdmUuJyA6ICdQw6FzYXNlbGEgYWwgdXN1YXJpbyBwYXJhIHF1ZSBsYSBndWFyZGUgZW4gdW4gbHVnYXIgc2VndXJvLiBTaXJ2ZSB1bmEgc29sYSB2ZXosIGVuIGVsIGNhbXBvIENvbnRyYXNlw7FhLiBTb2xvIHNlIG11ZXN0cmEgYWhvcmEuJywKICAgICAgICAgICAgYDxkaXYgY2xhc3M9ImNvcHkiPjxpbnB1dCB0eXBlPSJ0ZXh0IiByZWFkb25seSB2YWx1ZT0iJHtlc2ModmFsKX0iIHN0eWxlPSJmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6MjBweDt0ZXh0LWFsaWduOmNlbnRlciI+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1jb3B5PSIke2VzYyh2YWwpfSI+Q29waWFyPC9idXR0b24+PC9kaXY+YCk7CiAgICAgICAgfSBlbHNlIHRvYXN0KHIubWVzc2FnZSB8fCAnTGlzdG8nKTsKICAgICAgICByZW5kZXJBZG1pbigpOwogICAgICB9IGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UsIDUwMDApOyB9CiAgICAgIHJldHVybjsKICAgIH0KICAgIGNvbnN0IHMgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1kZWxzXScpLCB1ID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtZGVsdV0nKSwgcCA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLXB3XScpOwogICAgaWYgKHMgJiYgYXdhaXQgY29uZmlybUJveCgnRWxpbWluYXIgdmVuZGVkb3InLCAnU2UgYm9ycmFuIHN1cyBjb25leGlvbmVzLCBibG9xdWVvcywgcGVkaWRvcyB5IHVzdWFyaW9zLicpKSB7IGF3YWl0IGFwaShgL2FwaS9hZG1pbi9zZWxsZXJzLyR7cy5kYXRhc2V0LmRlbHN9YCwgeyBtZXRob2Q6ICdERUxFVEUnIH0pOyB0b2FzdCgnVmVuZGVkb3IgZWxpbWluYWRvJyk7IHJlbmRlckFkbWluKCk7IH0KICAgIGlmICh1ICYmIGF3YWl0IGNvbmZpcm1Cb3goJ0VsaW1pbmFyIHVzdWFyaW8nLCAnWWEgbm8gcG9kcsOhIGVudHJhciBhIEV0aXF1ZXRhSHViLicpKSB7IGF3YWl0IGFwaShgL2FwaS9hZG1pbi91c2Vycy8ke3UuZGF0YXNldC5kZWx1fWAsIHsgbWV0aG9kOiAnREVMRVRFJyB9KTsgdG9hc3QoJ1VzdWFyaW8gZWxpbWluYWRvJyk7IHJlbmRlckFkbWluKCk7IH0KICAgIGlmIChwICYmIGF3YWl0IGNvbmZpcm1Cb3goJ0NhbWJpYXIgY29udHJhc2XDsWEnLCAnRXNjcmliZSBsYSBudWV2YSBjb250cmFzZcOxYSAobcOtbmltbyA4IGNhcmFjdGVyZXMpLicsICc8aW5wdXQgdHlwZT0idGV4dCIgaWQ9ImNmUHciIG1pbmxlbmd0aD0iOCI+JykpIHsKICAgICAgdHJ5IHsgYXdhaXQgYXBpKGAvYXBpL2FkbWluL3VzZXJzLyR7cC5kYXRhc2V0LnB3fS9wYXNzd29yZGAsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgcGFzc3dvcmQ6ICQoJyNjZlB3JykudmFsdWUgfSB9KTsgdG9hc3QoJ0NvbnRyYXNlw7FhIGFjdHVhbGl6YWRhJyk7IH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IH0KICAgIH0KICB9Owp9CgovLyAtLS0tLS0tLS0tIG1pIGNsYXZlIC0tLS0tLS0tLS0KZnVuY3Rpb24gcmVuZGVyTXlBY2NvdW50KGZvcmNlZCA9IGZhbHNlKSB7CiAgJCgnI2FwcCcpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJsb2dpbiI+PGRpdiBjbGFzcz0iY2FyZCI+PGRpdiBjbGFzcz0iYXJ0Ij4ke0hFUk9fU1ZHfTwvZGl2Pjxmb3JtIGlkPSJteUZvcm0iPgogICAgPGgxPiR7Zm9yY2VkID8gJ0NyZWEgdHUgY2xhdmUgbnVldmEnIDogJ01pIGNsYXZlJ308L2gxPgogICAgPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjAiPiR7Zm9yY2VkID8gJ0VudHJhc3RlIGNvbiB1bmEgY2xhdmUgdGVtcG9yYWwgbyBkZSByZXNwYWxkby4gQ3JlYSB0dSBwcm9waWEgY29udHJhc2XDsWEgcGFyYSBzZWd1aXIuJyA6IGVzYyhtZS51c2VyLmVtYWlsKX08L3A+CiAgICAke2ZvcmNlZCA/ICcnIDogJzxsYWJlbCBjbGFzcz0iZiI+Q29udHJhc2XDsWEgYWN0dWFsPGlucHV0IHR5cGU9InBhc3N3b3JkIiBpZD0ibUN1ciIgYXV0b2NvbXBsZXRlPSJjdXJyZW50LXBhc3N3b3JkIiByZXF1aXJlZD48L2xhYmVsPid9CiAgICA8bGFiZWwgY2xhc3M9ImYiPk51ZXZhIGNvbnRyYXNlw7FhIChtw61uaW1vIDgpPGlucHV0IHR5cGU9InBhc3N3b3JkIiBpZD0ibVAxIiBhdXRvY29tcGxldGU9Im5ldy1wYXNzd29yZCIgbWlubGVuZ3RoPSI4IiByZXF1aXJlZD48L2xhYmVsPgogICAgPGxhYmVsIGNsYXNzPSJmIj5SZXDDrXRlbGE8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJtUDIiIGF1dG9jb21wbGV0ZT0ibmV3LXBhc3N3b3JkIiBtaW5sZW5ndGg9IjgiIHJlcXVpcmVkPjwvbGFiZWw+CiAgICA8bGFiZWwgY2xhc3M9InN3aXRjaCIgc3R5bGU9ImZvbnQtc2l6ZToxM3B4Ij48aW5wdXQgdHlwZT0iY2hlY2tib3giIGlkPSJtU2hvdyI+IE1vc3RyYXIgY29udHJhc2XDsWE8L2xhYmVsPgogICAgPGRpdiBjbGFzcz0iZXJyIiBpZD0ibUVyciI+PC9kaXY+CiAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIHR5cGU9InN1Ym1pdCI+R3VhcmRhcjwvYnV0dG9uPgogICAgJHtmb3JjZWQgPyAnJyA6ICc8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWdob3N0IiB0eXBlPSJidXR0b24iIGlkPSJtQmFja3VwIj5DcmVhciBtaSBjbGF2ZSBkZSByZXNwYWxkbzwvYnV0dG9uPjxkaXYgaWQ9Im1CYWNrdXBPdXQiPjwvZGl2PjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSIgdHlwZT0iYnV0dG9uIiBpZD0ibUJhY2siPlZvbHZlcjwvYnV0dG9uPid9CiAgPC9mb3JtPjwvZGl2PjwvZGl2PmA7CiAgJCgnI21TaG93Jykub25jaGFuZ2UgPSBlID0+IHsgJCQoJyNteUZvcm0gaW5wdXRbdHlwZT1wYXNzd29yZF0sICNteUZvcm0gaW5wdXRbZGF0YS1wd10nKS5mb3JFYWNoKGkgPT4geyBpLmRhdGFzZXQucHcgPSAxOyBpLnR5cGUgPSBlLnRhcmdldC5jaGVja2VkID8gJ3RleHQnIDogJ3Bhc3N3b3JkJzsgfSk7IH07CiAgJCgnI215Rm9ybScpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICBlLnByZXZlbnREZWZhdWx0KCk7CiAgICBpZiAoJCgnI21QMScpLnZhbHVlICE9PSAkKCcjbVAyJykudmFsdWUpIHJldHVybiAoJCgnI21FcnInKS50ZXh0Q29udGVudCA9ICdMYXMgY29udHJhc2XDsWFzIG5vIGNvaW5jaWRlbicpOwogICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL21lL3Bhc3N3b3JkJywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBjdXJyZW50OiBmb3JjZWQgPyAnJyA6ICQoJyNtQ3VyJykudmFsdWUsIHBhc3N3b3JkOiAkKCcjbVAxJykudmFsdWUgfSB9KTsgdG9hc3QoJ0NvbnRyYXNlw7FhIGd1YXJkYWRhJyk7IGJvb3QoKTsgfQogICAgY2F0Y2ggKHgpIHsgJCgnI21FcnInKS50ZXh0Q29udGVudCA9IHgubWVzc2FnZTsgfQogIH07CiAgaWYgKCFmb3JjZWQpIHsKICAgICQoJyNtQmFjaycpLm9uY2xpY2sgPSAoKSA9PiBib290KCk7CiAgICAkKCcjbUJhY2t1cCcpLm9uY2xpY2sgPSBhc3luYyAoKSA9PiB7CiAgICAgIHRyeSB7CiAgICAgICAgY29uc3QgciA9IGF3YWl0IGFwaSgnL2FwaS9tZS9iYWNrdXAtY29kZScsIHsgbWV0aG9kOiAnUE9TVCcgfSk7CiAgICAgICAgJCgnI21CYWNrdXBPdXQnKS5pbm5lckhUTUwgPSBgPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEzcHg7bWFyZ2luOjAgMCA2cHgiPkd1w6FyZGFsYSBlbiB1biBsdWdhciBzZWd1cm8gKGZvdG8sIHBhcGVsIG8gbm90YXMgZGVsIGNlbHVsYXIpLiBTaXJ2ZSB1bmEgc29sYSB2ZXogZW4gZWwgY2FtcG8gQ29udHJhc2XDsWEgc2kgb2x2aWRhcyB0dSBjbGF2ZS4gU2kgY3JlYXMgb3RyYSwgZXN0YSBkZWphIGRlIHNlcnZpci48L3A+PGlucHV0IHR5cGU9InRleHQiIHJlYWRvbmx5IHZhbHVlPSIke2VzYyhyLmNvZGUpfSIgc3R5bGU9ImZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZToyMHB4O3RleHQtYWxpZ246Y2VudGVyIj5gOwogICAgICB9IGNhdGNoICh4KSB7ICQoJyNtRXJyJykudGV4dENvbnRlbnQgPSB4Lm1lc3NhZ2U7IH0KICAgIH07CiAgfQp9CgovLyAtLS0tLS0tLS0tIGluaWNpbyAtLS0tLS0tLS0tCmFzeW5jIGZ1bmN0aW9uIGJvb3QoKSB7CiAgdHJ5IHsgbWUgPSBhd2FpdCBhcGkoJy9hcGkvbWUnKTsgfQogIGNhdGNoIHsKICAgIGNvbnN0IGggPSBhd2FpdCBmZXRjaCgnL2FwaS9zZXR1cC1zdGF0dXMnKS50aGVuKHIgPT4gci5qc29uKCkpLmNhdGNoKCgpID0+ICh7fSkpOwogICAgcmV0dXJuIGgubmVlZHNTZXR1cCA/IHJlbmRlclNldHVwKCkgOiByZW5kZXJMb2dpbihoLmRlbW8pOwogIH0KICBmaXJzdExvYWQgPSB0cnVlOwogIGlmIChtZS5tdXN0Q2hhbmdlKSByZXR1cm4gcmVuZGVyTXlBY2NvdW50KHRydWUpOwogIHJlbmRlclNoZWxsKCk7Cn0KYm9vdCgpOwp9KSgpOwo=","index.html":"PCFkb2N0eXBlIGh0bWw+CjxodG1sIGxhbmc9ImVzIj4KPGhlYWQ+CjxtZXRhIGNoYXJzZXQ9InV0Zi04Ij4KPG1ldGEgbmFtZT0idmlld3BvcnQiIGNvbnRlbnQ9IndpZHRoPWRldmljZS13aWR0aCwgaW5pdGlhbC1zY2FsZT0xLCB2aWV3cG9ydC1maXQ9Y292ZXIiPgo8dGl0bGU+RXRpcXVldGFIdWI8L3RpdGxlPgo8bGluayByZWw9Imljb24iIGhyZWY9Ii9sb2dvLnN2ZyIgdHlwZT0iaW1hZ2Uvc3ZnK3htbCI+CjxsaW5rIHJlbD0icHJlY29ubmVjdCIgaHJlZj0iaHR0cHM6Ly9mb250cy5nb29nbGVhcGlzLmNvbSI+CjxsaW5rIHJlbD0ic3R5bGVzaGVldCIgaHJlZj0iaHR0cHM6Ly9mb250cy5nb29nbGVhcGlzLmNvbS9jc3MyP2ZhbWlseT1CYWxvbysyOndnaHRANjAwOzcwMDs4MDAmZmFtaWx5PU51bml0bytTYW5zOm9wc3osd2dodEA2Li4xMiw0MDA7Ni4uMTIsNjAwOzYuLjEyLDcwMCZmYW1pbHk9SmV0QnJhaW5zK01vbm86d2dodEA1MDA7NzAwJmRpc3BsYXk9c3dhcCI+CjxsaW5rIHJlbD0ic3R5bGVzaGVldCIgaHJlZj0iL2FwcC5jc3MiPgo8L2hlYWQ+Cjxib2R5Pgo8ZGl2IGlkPSJhcHAiPjxkaXYgc3R5bGU9Im1pbi1oZWlnaHQ6MTAwdmg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtmb250LWZhbWlseTpzeXN0ZW0tdWksc2Fucy1zZXJpZjtjb2xvcjojMEE2RkE2O2ZvbnQtd2VpZ2h0OjcwMCI+Q2FyZ2FuZG8gRXRpcXVldGFIdWLigKYgKGxhIHByaW1lcmEgdmV6IHB1ZWRlIHRhcmRhciBoYXN0YSAxIG1pbnV0byk8L2Rpdj48L2Rpdj4KPGRpdiBjbGFzcz0idG9hc3QiIGlkPSJ0b2FzdCIgaGlkZGVuPjwvZGl2Pgo8c2NyaXB0IHNyYz0iL2FwcC5qcyI+PC9zY3JpcHQ+CjwvYm9keT4KPC9odG1sPgo=","logo.svg":"PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0MCA0MCI+PHJlY3QgeD0iNCIgeT0iOCIgd2lkdGg9IjMyIiBoZWlnaHQ9IjI2IiByeD0iNyIgZmlsbD0iIzE2OTNEMyIvPjxwYXRoIGQ9Ik00IDE2aDMyIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iMi41Ii8+PHJlY3QgeD0iMTAiIHk9IjIxIiB3aWR0aD0iMTIiIGhlaWdodD0iMyIgcng9IjEuNSIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjEwIiB5PSIyNiIgd2lkdGg9IjgiIGhlaWdodD0iMyIgcng9IjEuNSIgZmlsbD0iI0JGRTZGOCIvPjxjaXJjbGUgY3g9IjI5IiBjeT0iMjYiIHI9IjQiIGZpbGw9IiNmZmYiLz48L3N2Zz4K"};
__req('index', './start');
