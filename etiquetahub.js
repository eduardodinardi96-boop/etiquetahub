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
CREATE TABLE IF NOT EXISTS sales_sync (connection_id INTEGER PRIMARY KEY, backfilled_to TEXT);`);

// Migraciones simples (columnas nuevas)
for (const [t, c, def] of [['users', 'must_change', 'INTEGER NOT NULL DEFAULT 0'], ['sessions', 'impersonator_id', 'INTEGER'], ['users', 'backup_hash', 'TEXT'], ['orders', 'block_no', 'INTEGER'], ['orders', 'unblocked_at', 'TEXT'], ['orders', 'unblocked_by', 'TEXT']]) {
  const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(x => x.name);
  if (!cols.includes(c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`);
}

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
  return { plain, enc: encryptBuf(plain), hash: crypto.createHash('sha256').update(plain).digest('hex') };
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
      sku: oi.item?.seller_sku || oi.item?.seller_custom_field || '', pub_id: oi.item?.id, qty: oi.quantity,
    });
  }
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

module.exports = { sales, debugOrder, refresh, authUrl, exchangeCode, whoAmI, listShipments, fetchLabel, fromNotification };

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
  const norm = v => { const x = String(v).trim().toUpperCase().replace(/[\s-]+/g, ''); return [x, x.replace(/^MLC/, '')]; };
  items.forEach((it, index) => {
    const keys = new Set([it.sku, it.pub_id].filter(Boolean).flatMap(norm));
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
    const row = db.prepare('SELECT * FROM connections WHERE id=?').get(order.connection_id);
    if (!row) throw new Error('La cuenta del marketplace ya no está conectada');
    const conn = connObj(row);
    const original = await connectors[row.marketplace].fetchLabel(conn, order);
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

// Planilla de productos vendidos entre dos días (incluidos)
function products(sellerId, from, to) {
  const args = [from, to]; let where = 'day >= ? AND day <= ?';
  if (sellerId) { where += ' AND i.seller_id = ?'; args.push(sellerId); }
  const rows = db.prepare(`SELECT i.*, s.name seller FROM sale_items i LEFT JOIN sellers s ON s.id = i.seller_id WHERE ${where}`).all(...args);
  // Se agrupa por publicación (en Mercado Libre, el ID MLC… que comparte todas sus variantes); dentro, por variante
  const pubs = new Map();
  const blank = () => ({ qty: 0, amount: 0, orders: new Set(), byMk: { ml: 0, fa: 0, pa: 0 }, byDay: {} });
  const add = (x, r) => { x.qty += r.qty; x.amount += r.amount; x.orders.add(r.marketplace + r.order_id); x.byMk[r.marketplace] = (x.byMk[r.marketplace] || 0) + r.qty; x.byDay[r.day] = (x.byDay[r.day] || 0) + r.qty; };
  for (const r of rows) {
    const pkey = `${r.seller_id}|${r.marketplace}|${r.marketplace === 'ml' && r.pub_id ? r.pub_id : (r.name || '').trim().toUpperCase()}`;
    if (!pubs.has(pkey)) pubs.set(pkey, { ...blank(), seller: r.seller || '', marketplace: r.marketplace, pub_id: r.pub_id || '', name: r.name, variants: new Map() });
    const p = pubs.get(pkey); add(p, r);
    // la misma variante puede venir con los atributos en distinto orden ("Talla · Color" / "Color · Talla"): se ordenan
    const vkey = (r.variant || '').split('·').map(x => x.trim().toUpperCase()).filter(Boolean).sort().join('|') + '|' + (r.sku || '').toUpperCase();
    if (!p.variants.has(vkey)) p.variants.set(vkey, { ...blank(), variant: r.variant || '', sku: r.sku || '' });
    add(p.variants.get(vkey), r);
  }
  const fin = x => ({ ...x, orders: x.orders.size, amount: Math.round(x.amount) });
  const byQty = (a, b) => b.qty - a.qty || b.amount - a.amount;
  const list = [...pubs.values()].map(p => ({ ...fin(p), variants: [...p.variants.values()].map(fin).sort(byQty) })).sort(byQty);
  // desde qué día hay historial completo
  const conns = db.prepare(`SELECT c.id FROM connections c WHERE c.marketplace IN ('ml','fa','pa') ${sellerId ? 'AND c.seller_id = ?' : ''}`).all(...(sellerId ? [sellerId] : []));
  let since = today();
  for (const c of conns) { const st = db.prepare('SELECT backfilled_to FROM sales_sync WHERE connection_id=?').get(c.id); const d = st ? localDay(new Date(st.backfilled_to)) : today(); if (d < since) since = d; }
  return { from, to, rows: list, historySince: conns.length ? since : null };
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
function productsXlsx(sellerId, from, to, sellerName) {
  const data = products(sellerId, from, to);
  const days = daysBetween(from, to);
  const weekly = days.length <= 7;
  const MKN = { ml: 'Mercado Libre', fa: 'Falabella', pa: 'Paris' };
  const header = [
    ...(sellerId ? [] : [{ label: 'Vendedor' }]),
    { label: 'Publicación' }, { label: 'Marketplace' }, { label: 'ID publicación' }, { label: 'Variante' }, { label: 'SKU' },
    ...(weekly ? days.map(d => ({ label: `${WD[new Date(d + 'T12:00:00Z').getUTCDay()]} ${d.slice(8)}/${d.slice(5, 7)}` })) : [{ label: 'Mercado Libre' }, { label: 'Falabella' }, { label: 'Paris' }]),
    { label: 'Total unidades' }, { label: 'Ventas' }, { label: 'Monto', money: true },
  ];
  const nums = r => [...(weekly ? days.map(d => r.byDay[d] || 0) : [r.byMk.ml || 0, r.byMk.fa || 0, r.byMk.pa || 0]), r.qty, r.orders, r.amount];
  const rows = [];
  for (const p of data.rows) {
    // fila de la publicación (en negrita) y debajo sus variantes
    rows.push({ bold: true, cells: [...(sellerId ? [] : [p.seller]), p.name, MKN[p.marketplace] || '', p.pub_id, p.variants.length > 1 ? `${p.variants.length} variantes` : (p.variants[0]?.variant || ''), p.variants.length === 1 ? p.variants[0].sku : '', ...nums(p)] });
    if (p.variants.length > 1) for (const v of p.variants) rows.push({ cells: [...(sellerId ? [] : ['']), '', '', '', '   ' + (v.variant || 'Sin variante'), v.sku, ...nums(v)] });
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
    carrier: meta.carrier || null, dispatch_by: meta.dispatch_by || null, ship_type: ({ self_service: 'Flex', cross_docking: 'Colecta', drop_off: 'Agencia', xd_drop_off: 'Agencia', fulfillment: 'Full' })[meta.logistic] || null, customer: meta.customer || '', tracking: meta.tracking || null, track_url: own ? trackUrl(o, meta, user) : null,
  };
}

// Quién imprimió: "Vendedor · Tienda", "Fulfillment · Nombre" o "Administrador · Nombre"
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
    const enc = encryptBuf(plain);
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
      const connId = upsertConnection(Number(sellerId), 'ml', t, { externalId: t.user_id });
      const conn = sync.connObj(db.prepare('SELECT * FROM connections WHERE id=?').get(connId));
      const me = await ml.whoAmI(conn).catch(() => null);
      if (me?.nickname) db.prepare('UPDATE connections SET account_label=? WHERE id=?').run(me.nickname, connId);
      sync.syncConnection(connId);
      res.writeHead(302, { location: '/?conectado=ml' }); return res.end();
    } catch (e) {
      return send(res, 502, 'Mercado Libre rechazó la conexión: ' + e.message);
    }
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
    if (view === 'all') where.push("(created_at >= datetime('now','-7 day') OR state NOT IN ('printed','cancelled','shipped'))");
    const rows = db.prepare(`SELECT * FROM orders ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 1000`).all(...args);
    const sellers = db.prepare('SELECT id, name FROM sellers ORDER BY name').all();
    return ok(res, { orders: rows.map(o => orderView(o, user)), sellers });
  }

  const lab = p.match(/^\/api\/orders\/(\d+)\/label\.pdf$/);
  if (lab && m === 'GET') {
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(Number(lab[1]));
    if (!o || (user.role === 'seller' && o.seller_id !== user.seller_id)) return fail(res, 404, 'Pedido no encontrado');
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
      .filter(o => user.role !== 'seller' || o.seller_id === user.seller_id);
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
    if (!o || (user.role === 'seller' && o.seller_id !== user.seller_id)) return fail(res, 404, 'Pedido no encontrado');
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
    if (user.role === 'fulfillment') return fail(res, 403, 'No permitido');
    const isDay = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
    const to = isDay(url.searchParams.get('to')) ? url.searchParams.get('to') : sales.today();
    let from = isDay(url.searchParams.get('from')) ? url.searchParams.get('from') : to;
    if (from > to) from = to;
    const sid = user.role === 'seller' ? user.seller_id : (Number(url.searchParams.get('seller_id')) || null);
    if (p.endsWith('.xlsx')) {
      const sname = sid ? db.prepare('SELECT name FROM sellers WHERE id=?').get(sid)?.name : null;
      const file = `productos-vendidos-${(sname || 'todas').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${from}-al-${to}.xlsx`;
      return send(res, 200, sales.productsXlsx(sid, from, to, sname), { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': `attachment; filename="${file}"` });
    }
    return ok(res, sales.products(sid, from, to));
  }

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
    const plain = decryptBuf(Buffer.from(await res.arrayBuffer()));
    fs.writeFileSync(dbFile, plain);
    console.log(`Respaldo recuperado (${plain.length} bytes).`);
  } catch (e) {
    console.warn('No se pudo recuperar el respaldo:', e.message);
  }
}

restore().then(() => require('./server'));

};

global.__EH_PUBLIC = {"app.css":"OnJvb3R7CiAgLS1iZzojRUFGNUZDOyAtLWJnMjojRDhFREY5OyAtLXN1cmZhY2U6I0ZGRkZGRjsgLS1zdXJmYWNlMjojRjRGQUZFOwogIC0taW5rOiMwQzJCNDA7IC0tbXV0ZWQ6IzU1NzI4NzsgLS1saW5lOiNDOUUyRjI7CiAgLS1hY2NlbnQ6IzE2OTNEMzsgLS1hY2NlbnQtc3Ryb25nOiMwQTZGQTY7IC0tc2t5OiM3RkNERjI7IC0taWNlOiNCRkU2Rjg7CiAgLS1vazojMjM5NDZBOyAtLW9rLWJnOiNEREY0RUE7IC0tbG9jazojQzgzRTU1OyAtLWxvY2stYmc6I0ZCRTNFODsgLS13YXJuOiNCNzc5MEY7IC0td2Fybi1iZzojRkNGMEQ2OwogIC0tbWw6I0ZGRTYwMDsgLS1tbC1pbms6IzJEMzI3NzsgLS1mYTojQUFENTAwOyAtLWZhLWluazojMkYzQTAwOyAtLXBhOiMwMDc4Qzg7IC0tcGEtaW5rOiNGRkZGRkY7CiAgLS1zaGFkb3c6MCAxMHB4IDMwcHggLTE0cHggcmdiYSgxMiw3MCwxMTAsLjM1KTsKICAtLWRpc3BsYXk6IkJhbG9vIDIiLCJUcmVidWNoZXQgTVMiLHN5c3RlbS11aSxzYW5zLXNlcmlmOwogIC0tYm9keToiTnVuaXRvIFNhbnMiLHN5c3RlbS11aSwtYXBwbGUtc3lzdGVtLCJTZWdvZSBVSSIsc2Fucy1zZXJpZjsKICAtLW1vbm86IkpldEJyYWlucyBNb25vIix1aS1tb25vc3BhY2UsTWVubG8sQ29uc29sYXMsbW9ub3NwYWNlOwogIGNvbG9yLXNjaGVtZTpsaWdodDsKfQoqe2JveC1zaXppbmc6Ym9yZGVyLWJveH0KaHRtbCxib2R5e21hcmdpbjowfQpib2R5e2JhY2tncm91bmQ6dmFyKC0tYmcpO2NvbG9yOnZhcigtLWluayk7Zm9udC1mYW1pbHk6dmFyKC0tYm9keSk7Zm9udC1zaXplOjE1cHg7bGluZS1oZWlnaHQ6MS41O21pbi1oZWlnaHQ6MTAwdmh9Ci53cmFwe21heC13aWR0aDoxMjQwcHg7bWFyZ2luOjAgYXV0bztwYWRkaW5nLWlubGluZToyMHB4O3BhZGRpbmctYmxvY2s6MCA2MHB4fQpoMSxoMixoM3tmb250LWZhbWlseTp2YXIoLS1kaXNwbGF5KTtsaW5lLWhlaWdodDoxLjE7dGV4dC13cmFwOmJhbGFuY2U7bWFyZ2luOjB9CmJ1dHRvbntmb250OmluaGVyaXQ7Y3Vyc29yOnBvaW50ZXI7Y29sb3I6aW5oZXJpdH0KYXtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KYnV0dG9uOmZvY3VzLXZpc2libGUsaW5wdXQ6Zm9jdXMtdmlzaWJsZSxzZWxlY3Q6Zm9jdXMtdmlzaWJsZSx0ZXh0YXJlYTpmb2N1cy12aXNpYmxlLGE6Zm9jdXMtdmlzaWJsZXtvdXRsaW5lOjNweCBzb2xpZCB2YXIoLS1za3kpO291dGxpbmUtb2Zmc2V0OjJweH0KLm1vbm97Zm9udC1mYW1pbHk6dmFyKC0tbW9ubyk7Zm9udC1zaXplOi44NmVtfQoubXV0ZWR7Y29sb3I6dmFyKC0tbXV0ZWQpfQpbaGlkZGVuXXtkaXNwbGF5Om5vbmUhaW1wb3J0YW50fQoKLyogYmFycmEgc3VwZXJpb3IgKi8KLnRvcHtwb3NpdGlvbjpzdGlja3k7dG9wOjA7ei1pbmRleDoyMDtiYWNrZ3JvdW5kOmNvbG9yLW1peChpbiBzcmdiLHZhcigtLWJnKSA4OCUsdHJhbnNwYXJlbnQpO2JhY2tkcm9wLWZpbHRlcjpibHVyKDhweCk7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tbGluZSl9Ci50b3AgLndyYXB7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6MTRweDtmbGV4LXdyYXA6d3JhcDtwYWRkaW5nLWJsb2NrOjEwcHh9Ci5icmFuZHtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDoxMHB4O2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MjJweDtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKTt0ZXh0LWRlY29yYXRpb246bm9uZX0KLmJyYW5kIGltZ3t3aWR0aDozMnB4O2hlaWdodDozMnB4fQoubmF2e2Rpc3BsYXk6ZmxleDtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czo5OTlweDtwYWRkaW5nOjRweDtnYXA6NHB4fQoubmF2IGJ1dHRvbntib3JkZXI6MDtiYWNrZ3JvdW5kOnRyYW5zcGFyZW50O2NvbG9yOnZhcigtLW11dGVkKTtwYWRkaW5nOjdweCAxNXB4O2JvcmRlci1yYWRpdXM6OTk5cHg7Zm9udC13ZWlnaHQ6NzAwfQoubmF2IGJ1dHRvblthcmlhLWN1cnJlbnQ9InRydWUiXXtiYWNrZ3JvdW5kOnZhcigtLWFjY2VudCk7Y29sb3I6I2ZmZn0KLnNwYWNlcntmbGV4OjF9Ci5saXZle2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjZweDtmb250LXNpemU6MTIuNXB4O2ZvbnQtd2VpZ2h0OjcwMDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5saXZlIGl7d2lkdGg6OXB4O2hlaWdodDo5cHg7Ym9yZGVyLXJhZGl1czo1MCU7YmFja2dyb3VuZDp2YXIoLS1tdXRlZCl9Ci5saXZlLm9ue2NvbG9yOnZhcigtLW9rKX0gLmxpdmUub24gaXtiYWNrZ3JvdW5kOnZhcigtLW9rKTtib3gtc2hhZG93OjAgMCAwIDRweCBjb2xvci1taXgoaW4gc3JnYix2YXIoLS1vaykgMjUlLHRyYW5zcGFyZW50KX0KLmNsb2Nre2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjEwcHg7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTRweDtwYWRkaW5nOjVweCAxMnB4fQouY2xvY2sgYntmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6MTdweDtmb250LXZhcmlhbnQtbnVtZXJpYzp0YWJ1bGFyLW51bXN9Ci5jbG9jayBzbWFsbHtjb2xvcjp2YXIoLS1tdXRlZCk7ZGlzcGxheTpibG9jaztsaW5lLWhlaWdodDoxLjE7Zm9udC1zaXplOjEwLjVweDt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7bGV0dGVyLXNwYWNpbmc6LjA2ZW19Ci5jbG9jay5sYXRlIGJ7Y29sb3I6dmFyKC0tbG9jayl9Ci51c2Vye2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjhweDtmb250LXNpemU6MTMuNXB4fQoudXNlciBie2Rpc3BsYXk6YmxvY2s7bGluZS1oZWlnaHQ6MS4xfQoudXNlciBzbWFsbHtjb2xvcjp2YXIoLS1tdXRlZCl9CgovKiBlbGVtZW50b3MgKi8KLmJ0bnt0ZXh0LWRlY29yYXRpb246bm9uZTtib3JkZXI6MDtib3JkZXItcmFkaXVzOjEzcHg7cGFkZGluZzo5cHggMTVweDtmb250LXdlaWdodDo3MDA7ZGlzcGxheTppbmxpbmUtZmxleDtnYXA6OHB4O2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyO3doaXRlLXNwYWNlOm5vd3JhcH0KLmJ0biBzdmd7d2lkdGg6MThweDtoZWlnaHQ6MThweDtmbGV4Om5vbmV9Ci5idG4tcHJpbWFyeXtiYWNrZ3JvdW5kOnZhcigtLWFjY2VudCk7Y29sb3I6I2ZmZn0KLmJ0bi1wcmltYXJ5OmhvdmVye2JhY2tncm91bmQ6dmFyKC0tYWNjZW50LXN0cm9uZyl9Ci5idG4tZ2hvc3R7YmFja2dyb3VuZDp2YXIoLS1pY2UpO2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQouYnRuLWxpbmV7YmFja2dyb3VuZDp0cmFuc3BhcmVudDtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2NvbG9yOnZhcigtLWluayl9Ci5idG4tZGFuZ2Vye2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayl9Ci5idG46ZGlzYWJsZWR7b3BhY2l0eTouNDU7Y3Vyc29yOm5vdC1hbGxvd2VkfQouYnRuLXNte3BhZGRpbmc6NnB4IDEwcHg7Zm9udC1zaXplOjEzcHg7Ym9yZGVyLXJhZGl1czoxMHB4fQpzZWxlY3QsaW5wdXRbdHlwZT10ZXh0XSxpbnB1dFt0eXBlPWVtYWlsXSxpbnB1dFt0eXBlPXBhc3N3b3JkXSxpbnB1dFt0eXBlPXNlYXJjaF0sdGV4dGFyZWF7Zm9udDppbmhlcml0O2NvbG9yOnZhcigtLWluayk7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlMik7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjEycHg7cGFkZGluZzo4cHggMTJweDttaW4td2lkdGg6MDt3aWR0aDoxMDAlfQp0ZXh0YXJlYXtyZXNpemU6dmVydGljYWw7bWluLWhlaWdodDo3MHB4fQpsYWJlbC5me2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjRweDtmb250LXNpemU6MTIuNXB4O2ZvbnQtd2VpZ2h0OjcwMDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5jaGlwc3tkaXNwbGF5OmZsZXg7Z2FwOjZweDtmbGV4LXdyYXA6d3JhcH0KLmNoaXB7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKTtjb2xvcjp2YXIoLS1pbmspO3BhZGRpbmc6NnB4IDEycHg7Ym9yZGVyLXJhZGl1czo5OTlweDtmb250LXdlaWdodDo2MDA7Zm9udC1zaXplOjEzcHh9Ci5jaGlwW2FyaWEtcHJlc3NlZD0idHJ1ZSJde2JhY2tncm91bmQ6dmFyKC0tYWNjZW50KTtib3JkZXItY29sb3I6dmFyKC0tYWNjZW50KTtjb2xvcjojZmZmfQouc3dpdGNoe2Rpc3BsYXk6aW5saW5lLWZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDoxMHB4O2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTRweDtjdXJzb3I6cG9pbnRlcjt1c2VyLXNlbGVjdDpub25lfQouc3dpdGNoIGlucHV0e2FwcGVhcmFuY2U6bm9uZTt3aWR0aDo0NHB4O2hlaWdodDoyNnB4O2JvcmRlci1yYWRpdXM6OTk5cHg7YmFja2dyb3VuZDp2YXIoLS1saW5lKTtwb3NpdGlvbjpyZWxhdGl2ZTt0cmFuc2l0aW9uOmJhY2tncm91bmQgLjJzO2N1cnNvcjpwb2ludGVyO21hcmdpbjowO2ZsZXg6bm9uZX0KLnN3aXRjaCBpbnB1dDo6YWZ0ZXJ7Y29udGVudDoiIjtwb3NpdGlvbjphYnNvbHV0ZTt0b3A6M3B4O2xlZnQ6M3B4O3dpZHRoOjIwcHg7aGVpZ2h0OjIwcHg7Ym9yZGVyLXJhZGl1czo1MCU7YmFja2dyb3VuZDojZmZmO3RyYW5zaXRpb246bGVmdCAuMnM7Ym94LXNoYWRvdzowIDFweCAzcHggcmdiYSgwLDAsMCwuMjUpfQouc3dpdGNoIGlucHV0OmNoZWNrZWR7YmFja2dyb3VuZDp2YXIoLS1vayl9Ci5zd2l0Y2ggaW5wdXQ6Y2hlY2tlZDo6YWZ0ZXJ7bGVmdDoyMXB4fQoKLnBhbmVse2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjIycHg7Ym94LXNoYWRvdzp2YXIoLS1zaGFkb3cpfQoucGFuZWwtaGVhZHtkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7Z2FwOjEycHg7YWxpZ24taXRlbXM6Y2VudGVyO3BhZGRpbmc6MTZweCAyMHB4O2JvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLWxpbmUpfQoucGFuZWwtaGVhZCBoMntmb250LXNpemU6MjNweDttYXJnaW4tcmlnaHQ6YXV0b30KLnBhbmVsLWJvZHl7cGFkZGluZzoxNnB4IDIwcHh9Ci5wYW5lbC1mb290e2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6MTBweDthbGlnbi1pdGVtczpjZW50ZXI7cGFkZGluZzoxNHB4IDIwcHg7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tbGluZSk7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtc2l6ZToxMy41cHh9CgoubWt7ZGlzcGxheTppbmxpbmUtZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Zm9udC13ZWlnaHQ6NzAwO2ZvbnQtc2l6ZToxMnB4O3BhZGRpbmc6M3B4IDlweDtib3JkZXItcmFkaXVzOjhweDt3aGl0ZS1zcGFjZTpub3dyYXB9Ci5tay5tbHtiYWNrZ3JvdW5kOnZhcigtLW1sKTtjb2xvcjp2YXIoLS1tbC1pbmspfSAubWsuZmF7YmFja2dyb3VuZDp2YXIoLS1mYSk7Y29sb3I6dmFyKC0tZmEtaW5rKX0gLm1rLnBhe2JhY2tncm91bmQ6dmFyKC0tcGEpO2NvbG9yOnZhcigtLXBhLWluayl9Ci5waWxse2Rpc3BsYXk6aW5saW5lLWZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo2cHg7Ym9yZGVyLXJhZGl1czo5OTlweDtwYWRkaW5nOjRweCAxMHB4O2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTIuNXB4O3doaXRlLXNwYWNlOm5vd3JhcH0KLnBpbGwgc3Zne3dpZHRoOjE0cHg7aGVpZ2h0OjE0cHh9Ci5waWxsLnJlYWR5e2JhY2tncm91bmQ6dmFyKC0tb2stYmcpO2NvbG9yOnZhcigtLW9rKX0KLnBpbGwuYmxvY2tlZHtiYWNrZ3JvdW5kOiNFM0U3RUM7Y29sb3I6IzRBNTU2M30KLnBpbGwucHJpbnRlZHtiYWNrZ3JvdW5kOnZhcigtLWxvY2stYmcpO2NvbG9yOnZhcigtLWxvY2spfQoucGlsbC53YWl0aW5ne2JhY2tncm91bmQ6dmFyKC0td2Fybi1iZyk7Y29sb3I6dmFyKC0td2Fybil9Ci5waWxsLmVycm9ye2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayl9Ci5waWxsLmNhbmNlbGxlZHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKTtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5ub3Rle2Rpc3BsYXk6YmxvY2s7Zm9udC1zaXplOjEycHg7Y29sb3I6dmFyKC0tbXV0ZWQpO21hcmdpbi10b3A6NHB4O21heC13aWR0aDozNGNofQoubm90ZS5iYWR7Y29sb3I6dmFyKC0tbG9jayl9CgovKiBow6lyb2UgKi8KLmhlcm97ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczoxLjFmciAuOWZyO2dhcDoyNHB4O2FsaWduLWl0ZW1zOmNlbnRlcjtwYWRkaW5nLWJsb2NrOjI0cHggNnB4fQouaGVybyBoMXtmb250LXNpemU6Y2xhbXAoMjhweCwzLjZ2dyw0MHB4KTtmb250LXdlaWdodDo4MDB9Ci5oZXJvIGgxIGVte2ZvbnQtc3R5bGU6bm9ybWFsO2NvbG9yOnZhcigtLWFjY2VudCl9Ci5oZXJvIHB7Y29sb3I6dmFyKC0tbXV0ZWQpO21heC13aWR0aDo1NmNoO21hcmdpbjoxMHB4IDAgMH0KLmhlcm8gc3Zne3dpZHRoOjEwMCU7aGVpZ2h0OmF1dG87bWF4LWhlaWdodDoyMTBweH0KCi8qIGtwaXMgKi8KLmtwaXN7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoNCwxZnIpO2dhcDoxNHB4O21hcmdpbi1ibG9jazoxOHB4fQoua3Bpe2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjE4cHg7cGFkZGluZzoxNHB4IDE2cHg7ZGlzcGxheTpmbGV4O2dhcDoxMnB4O2FsaWduLWl0ZW1zOmNlbnRlcn0KLmtwaSAuaWN7d2lkdGg6NDJweDtoZWlnaHQ6NDJweDtib3JkZXItcmFkaXVzOjEycHg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtmbGV4Om5vbmV9Ci5rcGkgLmljIHN2Z3t3aWR0aDoyMnB4O2hlaWdodDoyMnB4fQoua3BpLm9rIC5pY3tiYWNrZ3JvdW5kOnZhcigtLW9rLWJnKTtjb2xvcjp2YXIoLS1vayl9Ci5rcGkud2FpdCAuaWN7YmFja2dyb3VuZDp2YXIoLS13YXJuLWJnKTtjb2xvcjp2YXIoLS13YXJuKX0KLmtwaS5sb2NrIC5pY3tiYWNrZ3JvdW5kOnZhcigtLWxvY2stYmcpO2NvbG9yOnZhcigtLWxvY2spfQoua3BpLmRvbmUgLmlje2JhY2tncm91bmQ6dmFyKC0taWNlKTtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KLmtwaSBie2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtc2l6ZToyOHB4O2xpbmUtaGVpZ2h0OjE7ZGlzcGxheTpibG9jaztmb250LXZhcmlhbnQtbnVtZXJpYzp0YWJ1bGFyLW51bXN9Ci5rcGkgc3Bhbntjb2xvcjp2YXIoLS1tdXRlZCk7Zm9udC1zaXplOjEzcHh9CgouYXV0b2JhcntkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7Z2FwOjE0cHg7YWxpZ24taXRlbXM6Y2VudGVyO2p1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuO2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDEyMGRlZyx2YXIoLS1iZzIpLHZhcigtLXN1cmZhY2UpKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MThweDtwYWRkaW5nOjE0cHggMThweDttYXJnaW4tYm90dG9tOjE2cHh9Ci5hdXRvYmFyIHB7bWFyZ2luOjJweCAwIDA7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtc2l6ZToxM3B4O21heC13aWR0aDo3MGNofQoKLmZpbHRlcnN7ZGlzcGxheTpmbGV4O2ZsZXgtd3JhcDp3cmFwO2dhcDoxMHB4O2FsaWduLWl0ZW1zOmNlbnRlcn0KLmZpbHRlcnMgc2VsZWN0LC5maWx0ZXJzIGlucHV0e3dpZHRoOmF1dG99Ci50YWJsZS13cmFwe292ZXJmbG93LXg6YXV0b30KdGFibGV7d2lkdGg6MTAwJTtib3JkZXItY29sbGFwc2U6Y29sbGFwc2U7bWluLXdpZHRoOjgyMHB4fQp0aHtmb250LXNpemU6MTEuNXB4O3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtsZXR0ZXItc3BhY2luZzouMDdlbTtjb2xvcjp2YXIoLS1tdXRlZCk7dGV4dC1hbGlnbjpsZWZ0O3BhZGRpbmc6MTBweCAxNHB4O2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZTIpO3doaXRlLXNwYWNlOm5vd3JhcH0KdGR7cGFkZGluZzoxMXB4IDE0cHg7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tbGluZSk7dmVydGljYWwtYWxpZ246bWlkZGxlfQp0ci5pcy1ibG9ja2VkIHRke2JhY2tncm91bmQ6Y29sb3ItbWl4KGluIHNyZ2IsdmFyKC0tbG9jay1iZykgNDUlLHRyYW5zcGFyZW50KX0KdHIuaXMtbmV3IHRke2FuaW1hdGlvbjpmbGFzaCAyLjVzIGVhc2Utb3V0fQpAa2V5ZnJhbWVzIGZsYXNoe2Zyb217YmFja2dyb3VuZDpjb2xvci1taXgoaW4gc3JnYix2YXIoLS1za3kpIDQ1JSx0cmFuc3BhcmVudCl9dG97YmFja2dyb3VuZDp0cmFuc3BhcmVudH19Ci5pdGVtc3tkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDoycHg7Zm9udC1zaXplOjEzLjVweH0KLml0ZW1zIC52e2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTIuNXB4fQouaXRlbXMgLmJhZHtjb2xvcjp2YXIoLS1sb2NrKTtmb250LXdlaWdodDo3MDB9Ci5jYnt3aWR0aDoxOXB4O2hlaWdodDoxOXB4O2FjY2VudC1jb2xvcjp2YXIoLS1hY2NlbnQpfQoubG9ja2NlbGx7Y29sb3I6dmFyKC0tbG9jayk7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcn0KLmxvY2tjZWxsIHN2Z3t3aWR0aDoxOHB4O2hlaWdodDoxOHB4fQoucm93LWFjdGlvbnN7ZGlzcGxheTpmbGV4O2dhcDo2cHg7ZmxleC13cmFwOndyYXB9Ci5lbXB0eXtwYWRkaW5nOjQwcHggMjBweDt0ZXh0LWFsaWduOmNlbnRlcjtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5lbXB0eSBzdmd7d2lkdGg6MTIwcHg7aGVpZ2h0OmF1dG87bWFyZ2luLWJvdHRvbToxMHB4fQoKLyogdmVuZGVkb3IgKi8KLnNlY3Rpb24tdGl0bGV7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6MTJweDtmbGV4LXdyYXA6d3JhcDttYXJnaW4tYmxvY2s6MjRweCAxMnB4fQouc2VjdGlvbi10aXRsZSBoMntmb250LXNpemU6MjZweH0KLmNvbm57ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoMywxZnIpO2dhcDoxNHB4fQoubWNhcmR7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MjBweDtwYWRkaW5nOjE2cHg7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MTBweH0KLm1jYXJkIC5sb2dve2hlaWdodDo0NHB4O2JvcmRlci1yYWRpdXM6MTJweDtkaXNwbGF5OmdyaWQ7cGxhY2UtaXRlbXM6Y2VudGVyO2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MThweH0KLm1jYXJkIC5ob3d7Zm9udC1zaXplOjEyLjVweDtjb2xvcjp2YXIoLS1tdXRlZCk7bWFyZ2luOjB9Ci5zdGF0ZXtmb250LXNpemU6MTNweDtmb250LXdlaWdodDo3MDA7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4fQouc3RhdGUub257Y29sb3I6dmFyKC0tb2spfSAuc3RhdGUub2Zme2NvbG9yOnZhcigtLW11dGVkKX0gLnN0YXRlLmVycntjb2xvcjp2YXIoLS1sb2NrKX0KLnN0YXRlIGl7d2lkdGg6OHB4O2hlaWdodDo4cHg7Ym9yZGVyLXJhZGl1czo1MCU7YmFja2dyb3VuZDpjdXJyZW50Q29sb3I7ZGlzcGxheTppbmxpbmUtYmxvY2t9Ci5jb3B5e2Rpc3BsYXk6ZmxleDtnYXA6NnB4fQouY29weSBpbnB1dHtmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6MTEuNXB4fQouZ3JpZDJ7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczoxZnIgMWZyO2dhcDoyMHB4O21hcmdpbi10b3A6MjBweH0KLnJ1bGV7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczphdXRvIDFmcjtnYXA6MTRweDthbGlnbi1pdGVtczpjZW50ZXI7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlMik7Ym9yZGVyOjFweCBkYXNoZWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czoxNnB4O3BhZGRpbmc6MTJweCAxNHB4fQoucnVsZSBzdmd7d2lkdGg6MTEwcHg7aGVpZ2h0OmF1dG99Ci5ydWxlIHB7bWFyZ2luOjA7Zm9udC1zaXplOjEzLjVweDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5ydWxlIGJ7Y29sb3I6dmFyKC0taW5rKX0KLmFkZHJvd3tkaXNwbGF5OmdyaWQ7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmciAxNTBweCBhdXRvO2dhcDo4cHg7YWxpZ24taXRlbXM6c3RhcnR9Ci50YWdze2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6OHB4O21heC1oZWlnaHQ6MjYwcHg7b3ZlcmZsb3c6YXV0b30KLnRhZ3tkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4O2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayk7Ym9yZGVyLXJhZGl1czoxMHB4O3BhZGRpbmc6NHB4IDRweCA0cHggMTBweDtmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6MTIuNXB4O2ZvbnQtd2VpZ2h0OjcwMH0KLnRhZyBzbWFsbHtmb250LWZhbWlseTp2YXIoLS1ib2R5KTtmb250LXdlaWdodDo2MDA7b3BhY2l0eTouOH0KLnRhZyBidXR0b257Ym9yZGVyOjA7YmFja2dyb3VuZDp0cmFuc3BhcmVudDtjb2xvcjppbmhlcml0O3dpZHRoOjI0cHg7aGVpZ2h0OjI0cHg7Ym9yZGVyLXJhZGl1czo2cHg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcn0KLnRhZyBidXR0b246aG92ZXJ7YmFja2dyb3VuZDpjb2xvci1taXgoaW4gc3JnYix2YXIoLS1sb2NrKSAxOCUsdHJhbnNwYXJlbnQpfQouc3RhY2t7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MTJweH0KLnJvd3tkaXNwbGF5OmZsZXg7Z2FwOjEwcHg7ZmxleC13cmFwOndyYXA7YWxpZ24taXRlbXM6ZW5kfQoucm93ID4gKntmbGV4OjE7bWluLXdpZHRoOjE1MHB4fQoKLyogbG9naW4gKi8KLmxvZ2lue21pbi1oZWlnaHQ6MTAwdmg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtwYWRkaW5nOjIwcHh9Ci5sb2dpbiAuY2FyZHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czoyNnB4O2JveC1zaGFkb3c6dmFyKC0tc2hhZG93KTt3aWR0aDoxMDAlO21heC13aWR0aDo0MjBweDtvdmVyZmxvdzpoaWRkZW59Ci5sb2dpbiAuYXJ0e2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDEzNWRlZyx2YXIoLS1iZzIpLHZhcigtLWljZSkpO3BhZGRpbmc6MjJweCAyNHB4IDhweH0KLmxvZ2luIC5hcnQgc3Zne3dpZHRoOjEwMCU7aGVpZ2h0OmF1dG99Ci5sb2dpbiBmb3Jte3BhZGRpbmc6MjJweCAyNHB4IDI2cHg7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MTJweH0KLmxvZ2luIGgxe2ZvbnQtc2l6ZTozMHB4O2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQouZXJye2NvbG9yOnZhcigtLWxvY2spO2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTMuNXB4O21pbi1oZWlnaHQ6MS4yZW19Ci5kZW1vLWhpbnR7Zm9udC1zaXplOjEyLjVweDtiYWNrZ3JvdW5kOnZhcigtLXdhcm4tYmcpO2NvbG9yOnZhcigtLXdhcm4pO3BhZGRpbmc6OHB4IDEycHg7Ym9yZGVyLXJhZGl1czoxMnB4fQoKLnRvYXN0e3Bvc2l0aW9uOmZpeGVkO2xlZnQ6NTAlO2JvdHRvbToyMnB4O3RyYW5zZm9ybTp0cmFuc2xhdGVYKC01MCUpO2JhY2tncm91bmQ6dmFyKC0taW5rKTtjb2xvcjp2YXIoLS1iZyk7cGFkZGluZzoxMHB4IDE4cHg7Ym9yZGVyLXJhZGl1czoxMnB4O2ZvbnQtd2VpZ2h0OjcwMDt6LWluZGV4OjYwO21heC13aWR0aDpjYWxjKDEwMCUgLSAzMnB4KX0KLm1vZGFse3Bvc2l0aW9uOmZpeGVkO2luc2V0OjA7ei1pbmRleDo1MDtiYWNrZ3JvdW5kOnJnYmEoNiwzMCw0OCwuNTUpO2Rpc3BsYXk6Z3JpZDtwbGFjZS1pdGVtczpjZW50ZXI7cGFkZGluZzoxNnB4fQouc2hlZXR7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXItcmFkaXVzOjIycHg7bWF4LXdpZHRoOjUyMHB4O3dpZHRoOjEwMCU7cGFkZGluZzoyMHB4O2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjEycHh9CgpAbWVkaWEgKG1heC13aWR0aDo5ODBweCl7CiAgLmhlcm8sLmdyaWQye2dyaWQtdGVtcGxhdGUtY29sdW1uczoxZnJ9CiAgLmhlcm8gc3Zne2Rpc3BsYXk6bm9uZX0KICAua3Bpc3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDIsMWZyKX0KICAuY29ubntncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyfQp9CkBtZWRpYSAobWF4LXdpZHRoOjUyMHB4KXsKICAud3JhcHtwYWRkaW5nLWlubGluZToxNnB4fQogIC5hZGRyb3d7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmcn0KICAucnVsZXtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyfQogIC51c2VyIHNtYWxse2Rpc3BsYXk6bm9uZX0KfQpAbWVkaWEgKHByZWZlcnMtcmVkdWNlZC1tb3Rpb246bm8tcHJlZmVyZW5jZSl7CiAgLnRydWNre2FuaW1hdGlvbjpkcml2ZSA2cyBlYXNlLWluLW91dCBpbmZpbml0ZX0KICBAa2V5ZnJhbWVzIGRyaXZlezAlLDEwMCV7dHJhbnNmb3JtOnRyYW5zbGF0ZVgoMCl9NTAle3RyYW5zZm9ybTp0cmFuc2xhdGVYKDE2cHgpfX0KfQouZ3JpZDIgPiAqe21pbi13aWR0aDowfQovKiBiYW5kZWphIG51ZXZhICovCi50YWJzYmlne2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDUsMWZyKTtnYXA6MTJweDttYXJnaW4tYm90dG9tOjE2cHh9Ci50YntkaXNwbGF5OmZsZXg7Z2FwOjEycHg7YWxpZ24taXRlbXM6Y2VudGVyO3RleHQtYWxpZ246bGVmdDtib3JkZXI6MnB4IHNvbGlkIHZhcigtLWxpbmUpO2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyLXJhZGl1czoxOHB4O3BhZGRpbmc6MTRweCAxNnB4O2NvbG9yOnZhcigtLWluayl9Ci50YiAudGItaWN7d2lkdGg6NDRweDtoZWlnaHQ6NDRweDtib3JkZXItcmFkaXVzOjEycHg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtmbGV4Om5vbmV9Ci50YiAudGItaWMgc3Zne3dpZHRoOjIycHg7aGVpZ2h0OjIycHh9Ci50YiBie2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtc2l6ZTozMHB4O2xpbmUtaGVpZ2h0OjE7ZGlzcGxheTpibG9jaztmb250LXZhcmlhbnQtbnVtZXJpYzp0YWJ1bGFyLW51bXN9Ci50YiAudGItbntmb250LXdlaWdodDo4MDA7ZGlzcGxheTpibG9ja30KLnRiIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTJweDtkaXNwbGF5OmJsb2NrO2xpbmUtaGVpZ2h0OjEuMn0KLnRiLXJlYWR5IC50Yi1pY3tiYWNrZ3JvdW5kOnZhcigtLWljZSk7Y29sb3I6dmFyKC0tYWNjZW50LXN0cm9uZyl9Ci50Yi13YWl0aW5nIC50Yi1pY3tiYWNrZ3JvdW5kOnZhcigtLXdhcm4tYmcpO2NvbG9yOnZhcigtLXdhcm4pfQoudGItcHJpbnRlZCAudGItaWN7YmFja2dyb3VuZDp2YXIoLS1vay1iZyk7Y29sb3I6dmFyKC0tb2spfQoudGItYmxvY2tlZCAudGItaWN7YmFja2dyb3VuZDp2YXIoLS1sb2NrLWJnKTtjb2xvcjp2YXIoLS1sb2NrKX0KLnRiW2FyaWEtcHJlc3NlZD0idHJ1ZSJde2JvcmRlci1jb2xvcjp2YXIoLS1hY2NlbnQpO2JveC1zaGFkb3c6MCAwIDAgM3B4IGNvbG9yLW1peChpbiBzcmdiLHZhcigtLWFjY2VudCkgMjIlLHRyYW5zcGFyZW50KX0KLnRiLXJlYWR5W2FyaWEtcHJlc3NlZD0idHJ1ZSJde2JhY2tncm91bmQ6Y29sb3ItbWl4KGluIHNyZ2IsdmFyKC0taWNlKSA0NSUsdmFyKC0tc3VyZmFjZSkpfQouY2hpcCAuY250e2Rpc3BsYXk6aW5saW5lLWJsb2NrO21pbi13aWR0aDoyMHB4O3BhZGRpbmc6MCA2cHg7Ym9yZGVyLXJhZGl1czo5OTlweDtiYWNrZ3JvdW5kOmNvbG9yLW1peChpbiBzcmdiLGN1cnJlbnRDb2xvciAxNSUsdHJhbnNwYXJlbnQpO2ZvbnQtc2l6ZToxMS41cHg7bWFyZ2luLWxlZnQ6NHB4fQouYWN0aW9uYmFye2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6MTBweDthbGlnbi1pdGVtczpjZW50ZXI7cGFkZGluZzoxMnB4IDIwcHg7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tbGluZSk7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlMil9Ci5kYXloZWFke3BhZGRpbmc6MTBweCAyMHB4O2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MTNweDt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7bGV0dGVyLXNwYWNpbmc6LjA2ZW07Y29sb3I6dmFyKC0tYWNjZW50LXN0cm9uZyk7YmFja2dyb3VuZDp2YXIoLS1iZyk7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tbGluZSl9Ci5vcm93e2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MzRweCAxMTBweCAxZnIgYXV0bztnYXA6MTRweDthbGlnbi1pdGVtczpjZW50ZXI7cGFkZGluZzoxMnB4IDIwcHg7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tbGluZSl9Ci5vcm93LnN0LXByaW50ZWR7b3BhY2l0eTouOH0KLm9yb3cuc3QtYmxvY2tlZHtiYWNrZ3JvdW5kOmNvbG9yLW1peChpbiBzcmdiLHZhcigtLWxvY2stYmcpIDQ1JSx0cmFuc3BhcmVudCl9Ci5vYy10aW1le2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjRweDthbGlnbi1pdGVtczpmbGV4LXN0YXJ0fQoub2MtdGltZSBie2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZToxOHB4fQoub2MtdG9we2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6OHB4O2FsaWduLWl0ZW1zOmJhc2VsaW5lO21hcmdpbi1ib3R0b206MnB4fQouY3VzdHtmb250LXdlaWdodDo4MDA7Zm9udC1zaXplOjE1LjVweH0KLmN1c3Q6OmFmdGVye2NvbnRlbnQ6IsK3IjttYXJnaW4tbGVmdDo4cHg7Y29sb3I6dmFyKC0tbXV0ZWQpfQoub2MtYWN0e2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47YWxpZ24taXRlbXM6ZmxleC1lbmQ7Z2FwOjhweH0KLm9yb3cuaXMtbmV3e2FuaW1hdGlvbjpmbGFzaCAyLjVzIGVhc2Utb3V0fQpAbWVkaWEgKG1heC13aWR0aDo4MjBweCl7CiAgLnRhYnNiaWd7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgyLDFmcil9CiAgLm9yb3d7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjI4cHggMWZyO30KICAub3JvdyAub2MtdGltZXtmbGV4LWRpcmVjdGlvbjpyb3c7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo4cHh9CiAgLm9yb3cgLm9jLW1haW4sLm9yb3cgLm9jLWFjdHtncmlkLWNvbHVtbjoyfQogIC5vYy1hY3R7YWxpZ24taXRlbXM6ZmxleC1zdGFydH0KfQoKLyogaW1wcmVzYXMgZW4gcm9qbyAoY29tbyBNZXJjYWRvIExpYnJlKSwgYmxvcXVlYWRhcyBlbiBncmlzICovCi50Yi1wcmludGVkIC50Yi1pY3tiYWNrZ3JvdW5kOnZhcigtLWxvY2stYmcpO2NvbG9yOnZhcigtLWxvY2spfQoudGItYmxvY2tlZCAudGItaWN7YmFja2dyb3VuZDojRTNFN0VDO2NvbG9yOiM0QTU1NjN9Ci5vcm93LnN0LXByaW50ZWR7b3BhY2l0eToxO2JhY2tncm91bmQ6I0ZGRjdGOH0KLm9yb3cuc3QtYmxvY2tlZHtiYWNrZ3JvdW5kOiNGM0Y1Rjd9Ci5vcm93LnN0LWJsb2NrZWQgLmxvY2tjZWxse2NvbG9yOiM0QTU1NjN9Ci5idG4tcmVwcmludHtiYWNrZ3JvdW5kOnZhcigtLWxvY2spO2NvbG9yOiNmZmZ9Ci5idG4tcmVwcmludDpob3ZlcntmaWx0ZXI6YnJpZ2h0bmVzcyguOTIpfQoKLnBpbGwuc2hpcHBlZHtiYWNrZ3JvdW5kOiNFM0U3RUM7Y29sb3I6IzM0NDE0Rn0KLm9yb3cuc3Qtc2hpcHBlZHtiYWNrZ3JvdW5kOiNGQUZCRkN9CgoudGItdG9kYXkgLnRiLWlje2JhY2tncm91bmQ6dmFyKC0taWNlKTtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KLnRiLXVwY29taW5nIC50Yi1pY3tiYWNrZ3JvdW5kOiNFREU5RkU7Y29sb3I6IzZEMjhEOX0KLnRiLXRvZGF5W2FyaWEtcHJlc3NlZD0idHJ1ZSJde2JhY2tncm91bmQ6Y29sb3ItbWl4KGluIHNyZ2IsdmFyKC0taWNlKSA0NSUsdmFyKC0tc3VyZmFjZSkpfQouc2hpcHR5cGV7Zm9udC1zaXplOjExcHg7Zm9udC13ZWlnaHQ6ODAwO3BhZGRpbmc6MnB4IDhweDtib3JkZXItcmFkaXVzOjZweDtiYWNrZ3JvdW5kOiNFRUYyRjY7Y29sb3I6IzM0NDE0Rn0KLnNoaXB0eXBlLnN0LWZsZXh7YmFja2dyb3VuZDojMTZBMzRBO2NvbG9yOiNmZmZ9Ci5zaGlwdHlwZS5zdC1jb2xlY3Rhe2JhY2tncm91bmQ6I0RCRUFGRTtjb2xvcjojMUU0MEFGfQouc2hpcHR5cGUuc3QtYWdlbmNpYXtiYWNrZ3JvdW5kOiNGRUYzQzc7Y29sb3I6IzkyNDAwRX0KLmRpc3BhdGNoe2Rpc3BsYXk6aW5saW5lLWJsb2NrO2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MTIuNXB4O2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpO2JhY2tncm91bmQ6dmFyKC0taWNlKTtib3JkZXItcmFkaXVzOjhweDtwYWRkaW5nOjJweCA4cHg7bWFyZ2luLWJvdHRvbTo0cHh9Ci5kaXNwYXRjaC5sYXRle2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayl9CkBtZWRpYSAobWF4LXdpZHRoOjExMDBweCl7LnRhYnNiaWd7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgzLDFmcil9fQpAbWVkaWEgKG1heC13aWR0aDo2NDBweCl7LnRhYnNiaWd7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgyLDFmcil9fQoKLmJsb2Nrbm97ZGlzcGxheTppbmxpbmUtYmxvY2s7YmFja2dyb3VuZDp2YXIoLS1pbmspO2NvbG9yOiNmZmY7Zm9udC13ZWlnaHQ6ODAwO2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2JvcmRlci1yYWRpdXM6OHB4O3BhZGRpbmc6MnB4IDlweDttYXJnaW4tcmlnaHQ6OHB4O2ZvbnQtc2l6ZToxNHB4fQouaXRlbXMgZW0uZmFsdGF7Zm9udC1zdHlsZTpub3JtYWw7YmFja2dyb3VuZDp2YXIoLS1sb2NrKTtjb2xvcjojZmZmO2JvcmRlci1yYWRpdXM6NXB4O3BhZGRpbmc6MCA1cHg7Zm9udC1zaXplOjExcHg7Zm9udC13ZWlnaHQ6ODAwO2xldHRlci1zcGFjaW5nOi4wNGVtfQoKLml0ZW1zIC5nb29ke2NvbG9yOnZhcigtLW9rKTtmb250LXdlaWdodDo3MDB9Ci5pdGVtcyBlbS50aWVuZXtmb250LXN0eWxlOm5vcm1hbDtiYWNrZ3JvdW5kOnZhcigtLW9rKTtjb2xvcjojZmZmO2JvcmRlci1yYWRpdXM6NXB4O3BhZGRpbmc6MCA1cHg7Zm9udC1zaXplOjExcHg7Zm9udC13ZWlnaHQ6ODAwO2xldHRlci1zcGFjaW5nOi4wNGVtfQoubm9wcmludHtkaXNwbGF5OmJsb2NrO21hcmdpbi10b3A6NnB4O2ZvbnQtd2VpZ2h0OjkwMDtjb2xvcjp2YXIoLS1pbmspO2ZvbnQtc2l6ZToxNXB4O2xldHRlci1zcGFjaW5nOi4wMmVtfQoKLyogVmVudGFzICovCi5zYWxlcy1rcGlze2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MS42ZnIgcmVwZWF0KDQsMWZyKTtnYXA6MTJweDttYXJnaW4tYm90dG9tOjE2cHh9Ci5rcGl7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTZweDtwYWRkaW5nOjE0cHggMTZweDtkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDo0cHg7Ym94LXNoYWRvdzp2YXIoLS1zaGFkb3cpfQoua3BpIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXdlaWdodDo3MDA7Zm9udC1zaXplOjEyLjVweDtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo2cHh9Ci5rcGkgYntmb250LWZhbWlseTp2YXIoLS1kaXNwbGF5KTtmb250LXNpemU6MjRweDtjb2xvcjp2YXIoLS1pbmspO2xpbmUtaGVpZ2h0OjEuMX0KLmtwaSBzcGFue2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTNweH0KLmtwaS1oZXJve2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDEzNWRlZywjRTNGNEZELCNmZmYpO2JvcmRlci1jb2xvcjp2YXIoLS1pY2UpfQoua3BpLWhlcm8gYntmb250LXNpemU6MzRweDtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KLmtwaS1oZXJvIHNwYW57Y29sb3I6dmFyKC0tb2spO2ZvbnQtd2VpZ2h0OjcwMH0KLmRvdHtkaXNwbGF5OmlubGluZS1ibG9jazt3aWR0aDoxMXB4O2hlaWdodDoxMXB4O2JvcmRlci1yYWRpdXM6M3B4O3ZlcnRpY2FsLWFsaWduOi0xcHg7bWFyZ2luLXJpZ2h0OjZweH0KLmxlZ2VuZHtkaXNwbGF5OmZsZXg7Z2FwOjE0cHg7ZmxleC13cmFwOndyYXA7Zm9udC1zaXplOjEzcHg7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOnZhcigtLWluayl9Ci5jaGFydHt3aWR0aDoxMDAlO2hlaWdodDphdXRvO2Rpc3BsYXk6YmxvY2t9Ci5jaGFydCAuY2gtYXh7Zm9udC1zaXplOjExcHg7ZmlsbDp2YXIoLS1tdXRlZCl9Ci5jaGFydCAuY2gtdmFse2ZvbnQtc2l6ZToxMnB4O2ZvbnQtd2VpZ2h0OjcwMDtmaWxsOnZhcigtLWluayl9Ci5jaGFydCAuY2gtZGF5e2ZvbnQtc2l6ZToxMnB4O2ZpbGw6dmFyKC0tbXV0ZWQpfQouY2hhcnQgLmNoLXRvZGF5e2ZpbGw6dmFyKC0tYWNjZW50LXN0cm9uZyk7Zm9udC13ZWlnaHQ6ODAwfQouY2hhcnQgLmNoLWhpdHtjdXJzb3I6cG9pbnRlcn0KLmNoYXJ0IC5jaC1oaXQ6aG92ZXJ7ZmlsbDpyZ2JhKDIyLDE0NywyMTEsLjA3KX0KLnNhbGVzLWdyaWR7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoMywxZnIpO2dhcDoxNHB4O21hcmdpbi10b3A6MTRweH0KLnNhbGVzLW1rIC5wYW5lbC1oZWFkIGgye2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXJ9Ci5jaC10aXB7cG9zaXRpb246Zml4ZWQ7ei1pbmRleDo1MDtiYWNrZ3JvdW5kOnZhcigtLWluayk7Y29sb3I6I2ZmZjtib3JkZXItcmFkaXVzOjEwcHg7cGFkZGluZzo4cHggMTFweDtmb250LXNpemU6MTIuNXB4O2xpbmUtaGVpZ2h0OjEuNTtwb2ludGVyLWV2ZW50czpub25lO2JveC1zaGFkb3c6dmFyKC0tc2hhZG93KTttYXgtd2lkdGg6MjgwcHh9Ci5jaC10aXAgYntkaXNwbGF5OmJsb2NrO21hcmdpbi1ib3R0b206MnB4O3RleHQtdHJhbnNmb3JtOmNhcGl0YWxpemV9Ci5jaC10YWJsZXttYXJnaW4tdG9wOjEwcHh9Ci5jaC10YWJsZSBzdW1tYXJ5e2N1cnNvcjpwb2ludGVyO2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpO2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTNweH0KQG1lZGlhIChtYXgtd2lkdGg6MTAwMHB4KXsuc2FsZXMta3Bpc3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDIsMWZyKX0ua3BpLWhlcm97Z3JpZC1jb2x1bW46MS8tMX0uc2FsZXMtZ3JpZHtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyfX0KLmNoYXJ0e3dpZHRoOjEwMCU7bWF4LXdpZHRoOjEwMCU7aGVpZ2h0OmF1dG99Ci5jaC1zbG90e3dpZHRoOjEwMCV9CgoucHAtd2Vla3tkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6OHB4O2ZvbnQtc2l6ZToxNHB4fQoucHAtdGFibGUgdGgubnVtLC5wcC10YWJsZSB0ZC5udW17dGV4dC1hbGlnbjpyaWdodDt3aGl0ZS1zcGFjZTpub3dyYXB9Ci5wcC10YWJsZSB0aCBzbWFsbHtkaXNwbGF5OmJsb2NrO2ZvbnQtd2VpZ2h0OjYwMDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5wcC10YWJsZSAucHAtbmFtZXtkaXNwbGF5OmJsb2NrO2ZvbnQtd2VpZ2h0OjcwMDtjb2xvcjp2YXIoLS1vayl9Ci5wcC10YWJsZSB0ZCBzbWFsbHtkaXNwbGF5OmJsb2NrfQoucHAtdGFibGUgLnplcm97Y29sb3I6dmFyKC0tbGluZSl9Ci5wcC10YWJsZSAucHAtdG90YWx7Zm9udC13ZWlnaHQ6ODAwO2ZvbnQtc2l6ZToxNXB4O2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQoucHAtdGFibGUgdGZvb3QgdGR7Ym9yZGVyLXRvcDoycHggc29saWQgdmFyKC0tbGluZSk7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlMil9Ci5wcC1ub3Rle2JhY2tncm91bmQ6dmFyKC0td2Fybi1iZyk7Y29sb3I6dmFyKC0td2Fybik7Ym9yZGVyLXJhZGl1czoxMHB4O3BhZGRpbmc6OHB4IDEycHg7Zm9udC1zaXplOjEzcHg7Zm9udC13ZWlnaHQ6NjAwO21hcmdpbjowIDAgMTBweH0KCi5wcC10YWJsZSAucHAtY2Fue2N1cnNvcjpwb2ludGVyfQoucHAtdGFibGUgLnBwLWNhbjpob3ZlciB0ZHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKX0KLnBwLXRhYmxlIC5wcC1hcnJvd3tkaXNwbGF5OmlubGluZS1ibG9jazt3aWR0aDoxNnB4O2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpO2ZvbnQtd2VpZ2h0OjkwMH0KLnBwLXRhYmxlIC5wcC1wdWIgLnBwLW5hbWV7ZGlzcGxheTppbmxpbmV9Ci5wcC10YWJsZSAucHAtc3Vie2Rpc3BsYXk6YmxvY2s7bWFyZ2luLWxlZnQ6MTZweH0KLnBwLXRhYmxlIC5wcC12YXIgdGR7YmFja2dyb3VuZDojRjdGQkZFO2ZvbnQtc2l6ZToxM3B4fQoucHAtdGFibGUgLnBwLXZuYW1le2Rpc3BsYXk6YmxvY2s7cGFkZGluZy1sZWZ0OjM0cHg7Y29sb3I6dmFyKC0tb2spO2ZvbnQtd2VpZ2h0OjYwMH0KLnBwLXRhYmxlIC5wcC12YXIgLnBwLXRvdGFse2ZvbnQtc2l6ZToxM3B4fQo=","app.js":"LyogRXRpcXVldGFIdWIg4oCUIGludGVyZmF6ICovCigoKSA9PiB7CmNvbnN0ICQgPSAocywgZWwgPSBkb2N1bWVudCkgPT4gZWwucXVlcnlTZWxlY3RvcihzKTsKY29uc3QgJCQgPSAocywgZWwgPSBkb2N1bWVudCkgPT4gWy4uLmVsLnF1ZXJ5U2VsZWN0b3JBbGwocyldOwpjb25zdCBlc2MgPSBzID0+IFN0cmluZyhzID8/ICcnKS5yZXBsYWNlKC9bJjw+IiddL2csIGMgPT4gKHsgJyYnOiAnJmFtcDsnLCAnPCc6ICcmbHQ7JywgJz4nOiAnJmd0OycsICciJzogJyZxdW90OycsICInIjogJyYjMzk7JyB9W2NdKSk7CmNvbnN0IE1LID0geyBtbDogJ01lcmNhZG8gTGlicmUnLCBmYTogJ0ZhbGFiZWxsYScsIHBhOiAnUGFyaXMnIH07CmNvbnN0IFNUQVRFID0geyByZWFkeTogJ0V0aXF1ZXRhIHBvciBpbXByaW1pcicsIHdhaXRpbmc6ICdFc3BlcmFuZG8gZXRpcXVldGEnLCBibG9ja2VkOiAnQmxvcXVlYWRhJywgcHJpbnRlZDogJ0V0aXF1ZXRhIGltcHJlc2EnLCBzaGlwcGVkOiAnRW52aWFkYScsIGVycm9yOiAnRXJyb3IgZW4gZXRpcXVldGEnLCBjYW5jZWxsZWQ6ICdDYW5jZWxhZGEnIH07CmNvbnN0IHN0b3JlID0geyBnZXQoaywgZCkgeyB0cnkgeyBjb25zdCB2ID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2VoOicgKyBrKTsgcmV0dXJuIHYgPT0gbnVsbCA/IGQgOiBKU09OLnBhcnNlKHYpOyB9IGNhdGNoIHsgcmV0dXJuIGQ7IH0gfSwgc2V0KGssIHYpIHsgdHJ5IHsgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2VoOicgKyBrLCBKU09OLnN0cmluZ2lmeSh2KSk7IH0gY2F0Y2gge30gfSB9OwoKY29uc3QgSSA9IHsKICBsb2NrOiAnPHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjIuMiI+PHJlY3QgeD0iNSIgeT0iMTEiIHdpZHRoPSIxNCIgaGVpZ2h0PSIxMCIgcng9IjIiLz48cGF0aCBkPSJNOCAxMVY4YTQgNCAwIDAxOCAwdjMiLz48L3N2Zz4nLAogIGNoZWNrOiAnPHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjMiPjxwYXRoIGQ9Ik01IDEybDUgNSA5LTEwIi8+PC9zdmc+JywKICBwcmludDogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyLjIiPjxwYXRoIGQ9Ik03IDlWM2gxMHY2TTcgMTdINHYtN2gxNnY3aC0zIi8+PHJlY3QgeD0iNyIgeT0iMTQiIHdpZHRoPSIxMCIgaGVpZ2h0PSI3Ii8+PC9zdmc+JywKICBjbG9jazogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyLjIiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjkiLz48cGF0aCBkPSJNMTIgN3Y1bDMgMiIvPjwvc3ZnPicsCiAgd2FybjogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyLjIiPjxwYXRoIGQ9Ik0xMiAzbDEwIDE4SDJ6Ii8+PHBhdGggZD0iTTEyIDEwdjVNMTIgMTh2LjUiLz48L3N2Zz4nLAogIGRvd246ICc8c3ZnIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMi40Ij48cGF0aCBkPSJNMTIgNHYxMW0wIDBsLTUtNW01IDVsNS01TTUgMjBoMTQiLz48L3N2Zz4nLAogIHN5bmM6ICc8c3ZnIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMi4yIj48cGF0aCBkPSJNMjAgMTFhOCA4IDAgMDAtMTQuOS0zTTQgNXY0aDRNNCAxM2E4IDggMCAwMDE0LjkgM00yMCAxOXYtNGgtNCIvPjwvc3ZnPicsCiAgeDogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiB3aWR0aD0iMTQiIGhlaWdodD0iMTQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjIuNiI+PHBhdGggZD0iTTYgNmwxMiAxMk0xOCA2TDYgMTgiLz48L3N2Zz4nLAogIGJveDogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIj48cmVjdCB4PSIzIiB5PSI0IiB3aWR0aD0iMTgiIGhlaWdodD0iMTYiIHJ4PSIzIi8+PHBhdGggZD0iTTMgOWgxOCIvPjwvc3ZnPicsCn07CmNvbnN0IHBpbGxJY29uID0geyBzaGlwcGVkOiBJLmNoZWNrLCByZWFkeTogSS5jaGVjaywgYmxvY2tlZDogSS5sb2NrLCBwcmludGVkOiBJLnByaW50LCB3YWl0aW5nOiBJLmNsb2NrLCBlcnJvcjogSS53YXJuLCBjYW5jZWxsZWQ6IEkueCB9OwoKbGV0IG1lID0gbnVsbCwgdGFiID0gbnVsbCwgb3JkZXJzID0gW10sIHNlbGxlcnMgPSBbXSwgc2VsZWN0ZWQgPSBuZXcgU2V0KCksIGtub3duUmVhZHkgPSBuZXcgU2V0KCksIGZpcnN0TG9hZCA9IHRydWU7CmNvbnN0IHVpID0geyB0YWI6ICd0b2RheScsIG1rOiAnYWxsJywgc2VsbGVyOiAnYWxsJywgcTogJycsIGFkbWluU2VsbGVyOiBzdG9yZS5nZXQoJ2FkbWluU2VsbGVyJywgbnVsbCkgfTsKCmZ1bmN0aW9uIHRvYXN0KG1zZywgbXMgPSAyODAwKSB7IGNvbnN0IHQgPSAkKCcjdG9hc3QnKTsgdC50ZXh0Q29udGVudCA9IG1zZzsgdC5oaWRkZW4gPSBmYWxzZTsgY2xlYXJUaW1lb3V0KHQuX3QpOyB0Ll90ID0gc2V0VGltZW91dCgoKSA9PiB0LmhpZGRlbiA9IHRydWUsIG1zKTsgfQphc3luYyBmdW5jdGlvbiBhcGkocGF0aCwgb3B0cyA9IHt9KSB7CiAgY29uc3QgcmVzID0gYXdhaXQgZmV0Y2gocGF0aCwgeyBjcmVkZW50aWFsczogJ3NhbWUtb3JpZ2luJywgLi4ub3B0cywgaGVhZGVyczogeyAnY29udGVudC10eXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLCAuLi4ob3B0cy5oZWFkZXJzIHx8IHt9KSB9LCBib2R5OiBvcHRzLmJvZHkgJiYgdHlwZW9mIG9wdHMuYm9keSAhPT0gJ3N0cmluZycgPyBKU09OLnN0cmluZ2lmeShvcHRzLmJvZHkpIDogb3B0cy5ib2R5IH0pOwogIGlmIChyZXMuc3RhdHVzID09PSA0MDEgJiYgIXBhdGguaW5jbHVkZXMoJy9sb2dpbicpKSB7IG1lID0gbnVsbDsgcmVuZGVyTG9naW4oKTsgdGhyb3cgbmV3IEVycm9yKCdTZXNpw7NuIHZlbmNpZGEnKTsgfQogIGNvbnN0IGN0ID0gcmVzLmhlYWRlcnMuZ2V0KCdjb250ZW50LXR5cGUnKSB8fCAnJzsKICBpZiAoIXJlcy5vaykgeyBjb25zdCBlID0gY3QuaW5jbHVkZXMoJ2pzb24nKSA/IChhd2FpdCByZXMuanNvbigpKS5lcnJvciA6IGF3YWl0IHJlcy50ZXh0KCk7IHRocm93IG5ldyBFcnJvcihlIHx8ICdFcnJvcicpOyB9CiAgcmV0dXJuIGN0LmluY2x1ZGVzKCdqc29uJykgPyByZXMuanNvbigpIDogcmVzOwp9CmZ1bmN0aW9uIHNlbGxlclFTKCkgeyByZXR1cm4gbWUudXNlci5yb2xlID09PSAnYWRtaW4nICYmIHVpLmFkbWluU2VsbGVyID8gYD9zZWxsZXJfaWQ9JHt1aS5hZG1pblNlbGxlcn1gIDogJyc7IH0KZnVuY3Rpb24gZm10VGltZShzKSB7IGlmICghcykgcmV0dXJuICcnOyBjb25zdCBkID0gbmV3IERhdGUocy5pbmNsdWRlcygnVCcpID8gcyA6IHMucmVwbGFjZSgnICcsICdUJykgKyAnWicpOyByZXR1cm4gZC50b0xvY2FsZVN0cmluZygnZXMtQ0wnLCB7IGRheTogJzItZGlnaXQnLCBtb250aDogJzItZGlnaXQnLCBob3VyOiAnMi1kaWdpdCcsIG1pbnV0ZTogJzItZGlnaXQnIH0pOyB9CgovLyAtLS0tLS0tLS0tIGlsdXN0cmFjaW9uZXMgLS0tLS0tLS0tLQpjb25zdCBIRVJPX1NWRyA9IGA8c3ZnIHZpZXdCb3g9IjAgMCA1MjAgMjMwIiBhcmlhLWhpZGRlbj0idHJ1ZSI+CjxyZWN0IHdpZHRoPSI1MjAiIGhlaWdodD0iMjMwIiByeD0iMjYiIGZpbGw9InZhcigtLWJnMikiLz4KPGcgZm9udC1mYW1pbHk9IkJhbG9vIDIsIHNhbnMtc2VyaWYiIGZvbnQtd2VpZ2h0PSI4MDAiIGZvbnQtc2l6ZT0iMTQiIHRleHQtYW5jaG9yPSJtaWRkbGUiPgo8cmVjdCB4PSIyMiIgeT0iMjYiIHdpZHRoPSIxMTIiIGhlaWdodD0iNDQiIHJ4PSIxMiIgZmlsbD0idmFyKC0tbWwpIi8+PHRleHQgeD0iNzgiIHk9IjUzIiBmaWxsPSJ2YXIoLS1tbC1pbmspIj5NZXJjYWRvIExpYnJlPC90ZXh0Pgo8cmVjdCB4PSIyMiIgeT0iOTMiIHdpZHRoPSIxMTIiIGhlaWdodD0iNDQiIHJ4PSIxMiIgZmlsbD0idmFyKC0tZmEpIi8+PHRleHQgeD0iNzgiIHk9IjEyMCIgZmlsbD0idmFyKC0tZmEtaW5rKSI+RmFsYWJlbGxhPC90ZXh0Pgo8cmVjdCB4PSIyMiIgeT0iMTYwIiB3aWR0aD0iMTEyIiBoZWlnaHQ9IjQ0IiByeD0iMTIiIGZpbGw9InZhcigtLXBhKSIvPjx0ZXh0IHg9Ijc4IiB5PSIxODciIGZpbGw9IiNmZmYiPlBhcmlzPC90ZXh0PjwvZz4KPGcgc3Ryb2tlPSJ2YXIoLS1za3kpIiBzdHJva2Utd2lkdGg9IjMiIGZpbGw9Im5vbmUiIHN0cm9rZS1kYXNoYXJyYXk9IjYgNyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48cGF0aCBkPSJNMTM0IDQ4IEMgMTc1IDQ4LCAxNzUgMTE1LCAyMTAgMTE1Ii8+PHBhdGggZD0iTTEzNCAxMTUgSDIxMCIvPjxwYXRoIGQ9Ik0xMzQgMTgyIEMgMTc1IDE4MiwgMTc1IDExNSwgMjEwIDExNSIvPjwvZz4KPHJlY3QgeD0iMjEwIiB5PSI3MCIgd2lkdGg9IjEwNCIgaGVpZ2h0PSI5MCIgcng9IjIwIiBmaWxsPSJ2YXIoLS1hY2NlbnQpIi8+CjxyZWN0IHg9IjIyNiIgeT0iODgiIHdpZHRoPSI3MiIgaGVpZ2h0PSIxMiIgcng9IjYiIGZpbGw9IiNmZmYiIG9wYWNpdHk9Ii45Ii8+PHJlY3QgeD0iMjI2IiB5PSIxMDciIHdpZHRoPSI1MiIgaGVpZ2h0PSIxMCIgcng9IjUiIGZpbGw9IiNmZmYiIG9wYWNpdHk9Ii42Ii8+CjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDIzMiwxMjYpIj48cmVjdCB3aWR0aD0iMjIiIGhlaWdodD0iMjIiIHJ4PSI2IiBmaWxsPSIjZmZmIi8+PHBhdGggZD0iTTYgMTFsNCA0IDctOCIgc3Ryb2tlPSJ2YXIoLS1vaykiIHN0cm9rZS13aWR0aD0iMyIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9nPgo8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyNjQsMTI2KSI+PHJlY3Qgd2lkdGg9IjIyIiBoZWlnaHQ9IjIyIiByeD0iNiIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjYiIHk9IjEwIiB3aWR0aD0iMTAiIGhlaWdodD0iOCIgcng9IjIiIGZpbGw9InZhcigtLWxvY2spIi8+PHBhdGggZD0iTTggMTBWOGEzIDMgMCAwMTYgMHYyIiBzdHJva2U9InZhcigtLWxvY2spIiBzdHJva2Utd2lkdGg9IjIiIGZpbGw9Im5vbmUiLz48L2c+CjxwYXRoIGQ9Ik0zMTQgMTE1IEgzNTYiIHN0cm9rZT0idmFyKC0tc2t5KSIgc3Ryb2tlLXdpZHRoPSIzIiBzdHJva2UtZGFzaGFycmF5PSI2IDciIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8cGF0aCBkPSJNMzYyIDk4IEw0MjQgNzAgTDQ4NiA5OCBWMTc4IEgzNjIgWiIgZmlsbD0idmFyKC0tc3VyZmFjZSkiIHN0cm9rZT0idmFyKC0tbGluZSkiIHN0cm9rZS13aWR0aD0iMiIvPgo8cmVjdCB4PSIzODgiIHk9IjEyNCIgd2lkdGg9IjcyIiBoZWlnaHQ9IjU0IiByeD0iNCIgZmlsbD0idmFyKC0taWNlKSIvPgo8ZyBmaWxsPSJ2YXIoLS1za3kpIj48cmVjdCB4PSIzOTYiIHk9IjE0NCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjE2IiByeD0iMiIvPjxyZWN0IHg9IjQyNCIgeT0iMTQ0IiB3aWR0aD0iMjQiIGhlaWdodD0iMTYiIHJ4PSIyIi8+PHJlY3QgeD0iNDEwIiB5PSIxMzAiIHdpZHRoPSIyNCIgaGVpZ2h0PSIxNCIgcng9IjIiLz48L2c+CjxnIGNsYXNzPSJ0cnVjayI+PHJlY3QgeD0iMzcyIiB5PSIxODgiIHdpZHRoPSI1OCIgaGVpZ2h0PSIyNCIgcng9IjUiIGZpbGw9InZhcigtLWFjY2VudC1zdHJvbmcpIi8+PHBhdGggZD0iTTQzMCAxOTQgaDE4IGwxMCAxMCB2OCBoLTI4eiIgZmlsbD0idmFyKC0tYWNjZW50KSIvPjxjaXJjbGUgY3g9IjM4OCIgY3k9IjIxNCIgcj0iNiIgZmlsbD0idmFyKC0taW5rKSIvPjxjaXJjbGUgY3g9IjQ0NiIgY3k9IjIxNCIgcj0iNiIgZmlsbD0idmFyKC0taW5rKSIvPjwvZz48L3N2Zz5gOwpjb25zdCBFTVBUWV9TVkcgPSBgPHN2ZyB2aWV3Qm94PSIwIDAgMTQwIDEwMCIgYXJpYS1oaWRkZW49InRydWUiPjxyZWN0IHg9IjIwIiB5PSIzMCIgd2lkdGg9IjEwMCIgaGVpZ2h0PSI2MiIgcng9IjEwIiBmaWxsPSJ2YXIoLS1pY2UpIi8+PHBhdGggZD0iTTIwIDQ2aDEwMCIgc3Ryb2tlPSJ2YXIoLS1za3kpIiBzdHJva2Utd2lkdGg9IjMiLz48cmVjdCB4PSIzNiIgeT0iNTgiIHdpZHRoPSI0MCIgaGVpZ2h0PSI3IiByeD0iMy41IiBmaWxsPSJ2YXIoLS1za3kpIi8+PHJlY3QgeD0iMzYiIHk9IjcxIiB3aWR0aD0iMjYiIGhlaWdodD0iNyIgcng9IjMuNSIgZmlsbD0idmFyKC0tc2t5KSIgb3BhY2l0eT0iLjYiLz48Y2lyY2xlIGN4PSIxMDQiIGN5PSIyMiIgcj0iMTQiIGZpbGw9InZhcigtLW9rKSIvPjxwYXRoIGQ9Ik05NyAyMmw1IDUgOS0xMCIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjMuNCIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+YDsKY29uc3QgUlVMRV9TVkcgPSBgPHN2ZyB2aWV3Qm94PSIwIDAgMTMwIDgwIiBhcmlhLWhpZGRlbj0idHJ1ZSI+PHJlY3QgeD0iNCIgeT0iMTAiIHdpZHRoPSI3OCIgaGVpZ2h0PSI2MiIgcng9IjEwIiBmaWxsPSJ2YXIoLS1zdXJmYWNlKSIgc3Ryb2tlPSJ2YXIoLS1saW5lKSIgc3Ryb2tlLXdpZHRoPSIyIi8+PHJlY3QgeD0iMTQiIHk9IjIyIiB3aWR0aD0iNDQiIGhlaWdodD0iOCIgcng9IjQiIGZpbGw9InZhcigtLW9rKSIvPjxyZWN0IHg9IjE0IiB5PSIzNiIgd2lkdGg9IjQ0IiBoZWlnaHQ9IjgiIHJ4PSI0IiBmaWxsPSJ2YXIoLS1vaykiLz48cmVjdCB4PSIxNCIgeT0iNTAiIHdpZHRoPSI0NCIgaGVpZ2h0PSI4IiByeD0iNCIgZmlsbD0idmFyKC0tbG9jaykiLz48cGF0aCBkPSJNODggNDFoMTQiIHN0cm9rZT0idmFyKC0tbXV0ZWQpIiBzdHJva2Utd2lkdGg9IjIuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PHBhdGggZD0iTTk4IDM2bDUgNS01IDUiIHN0cm9rZT0idmFyKC0tbXV0ZWQpIiBzdHJva2Utd2lkdGg9IjIuNSIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PHJlY3QgeD0iMTA2IiB5PSIyOCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjI2IiByeD0iNSIgZmlsbD0idmFyKC0tbG9jaykiLz48cmVjdCB4PSIxMTEiIHk9IjQwIiB3aWR0aD0iMTAiIGhlaWdodD0iOSIgcng9IjIiIGZpbGw9IiNmZmYiLz48cGF0aCBkPSJNMTEzIDQwdi0zYTMgMyAwIDAxNiAwdjMiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSJub25lIi8+PC9zdmc+YDsKCi8vIC0tLS0tLS0tLS0gbG9naW4gLS0tLS0tLS0tLQpmdW5jdGlvbiByZW5kZXJMb2dpbihkZW1vKSB7CiAgJCgnI2FwcCcpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJsb2dpbiI+PGRpdiBjbGFzcz0iY2FyZCI+CiAgICA8ZGl2IGNsYXNzPSJhcnQiPiR7SEVST19TVkd9PC9kaXY+CiAgICA8Zm9ybSBpZD0ibG9naW5Gb3JtIj4KICAgICAgPGgxPkV0aXF1ZXRhSHViPC9oMT4KICAgICAgPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjAiPkV0aXF1ZXRhcyBkZSBNZXJjYWRvIExpYnJlLCBGYWxhYmVsbGEgeSBQYXJpcyBlbiB1bmEgc29sYSBiYW5kZWphLjwvcD4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5Db3JyZW88aW5wdXQgdHlwZT0iZW1haWwiIGlkPSJsRW1haWwiIGF1dG9jb21wbGV0ZT0idXNlcm5hbWUiIHJlcXVpcmVkPjwvbGFiZWw+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+Q29udHJhc2XDsWE8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJsUGFzcyIgYXV0b2NvbXBsZXRlPSJjdXJyZW50LXBhc3N3b3JkIiByZXF1aXJlZD48L2xhYmVsPgogICAgICA8ZGl2IGNsYXNzPSJlcnIiIGlkPSJsRXJyIj48L2Rpdj4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiPkVudHJhcjwvYnV0dG9uPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUiIHR5cGU9ImJ1dHRvbiIgaWQ9ImZvcmdvdCI+wr9PbHZpZGFzdGUgdHUgY29udHJhc2XDsWE/PC9idXR0b24+CiAgICAgIDxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9Im1hcmdpbjowO2ZvbnQtc2l6ZToxMi41cHg7dGV4dC1hbGlnbjpjZW50ZXIiPsK/VGllbmVzIHVuYSBjbGF2ZSBkZSByZXNwYWxkbyAoUlNQLeKApik/IEVzY3LDrWJlbGEgZW4gQ29udHJhc2XDsWEuPC9wPgogICAgICAke2RlbW8gPyAnPGRpdiBjbGFzcz0iZGVtby1oaW50Ij5Nb2RvIGRlbW86IGVudHJhIGNvbiA8Yj5ib2RlZ2FAZGVtby5jbDwvYj4sIDxiPnZlbmRlZG9yMUBkZW1vLmNsPC9iPiBvIDxiPmFkbWluQGRlbW8uY2w8L2I+LCBjbGF2ZSA8Yj5kZW1vMTIzNDwvYj4uPC9kaXY+JyA6ICcnfQogICAgPC9mb3JtPjwvZGl2PjwvZGl2PmA7CiAgJCgnI2xvZ2luRm9ybScpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICBlLnByZXZlbnREZWZhdWx0KCk7CiAgICAkKCcjbEVycicpLnRleHRDb250ZW50ID0gJyc7CiAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvbG9naW4nLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGVtYWlsOiAkKCcjbEVtYWlsJykudmFsdWUsIHBhc3N3b3JkOiAkKCcjbFBhc3MnKS52YWx1ZSB9IH0pOyBib290KCk7IH0KICAgIGNhdGNoIChlcnIpIHsgJCgnI2xFcnInKS50ZXh0Q29udGVudCA9IGVyci5tZXNzYWdlOyB9CiAgfTsKICAkKCcjZm9yZ290Jykub25jbGljayA9ICgpID0+IHJlbmRlckZvcmdvdCgkKCcjbEVtYWlsJykudmFsdWUpOwp9CgovLyBSZWN1cGVyYXIgY29udHJhc2XDsWE6IGNvcnJlbyAtPiBjw7NkaWdvIGRlIDYgZMOtZ2l0b3MgLT4gZW50cmFyIG8gY2FtYmlhciBjb250cmFzZcOxYQpmdW5jdGlvbiByZW5kZXJGb3Jnb3QocHJlZmlsbCA9ICcnKSB7CiAgbGV0IGVtYWlsID0gcHJlZmlsbCwgY29kZSA9ICcnOwogIGNvbnN0IHNoZWxsID0gaW5uZXIgPT4geyAkKCcjYXBwJykuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9ImxvZ2luIj48ZGl2IGNsYXNzPSJjYXJkIj48ZGl2IGNsYXNzPSJhcnQiPiR7SEVST19TVkd9PC9kaXY+PGZvcm0gaWQ9ImZGb3JtIj4ke2lubmVyfTxkaXYgY2xhc3M9ImVyciIgaWQ9ImZFcnIiPjwvZGl2PjwvZm9ybT48L2Rpdj48L2Rpdj5gOyB9OwogIGNvbnN0IGJhY2sgPSAoKSA9PiB7IGNvbnN0IGIgPSAkKCcjZkJhY2snKTsgaWYgKGIpIGIub25jbGljayA9ICgpID0+IHJlbmRlckxvZ2luKCk7IH07CiAgY29uc3QgZXJyID0gbSA9PiB7ICQoJyNmRXJyJykudGV4dENvbnRlbnQgPSBtOyB9OwogIGZ1bmN0aW9uIHN0ZXBFbWFpbCgpIHsKICAgIHNoZWxsKGA8aDE+UmVjdXBlcmFyIGFjY2VzbzwvaDE+PHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjAiPkVzY3JpYmUgdHUgY29ycmVvIHkgdGUgZW52aWFyZW1vcyB1biBjw7NkaWdvIGRlIDYgZMOtZ2l0b3MuPC9wPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPkNvcnJlbzxpbnB1dCB0eXBlPSJlbWFpbCIgaWQ9ImZFbWFpbCIgYXV0b2NvbXBsZXRlPSJ1c2VybmFtZSIgcmVxdWlyZWQgdmFsdWU9IiR7ZXNjKGVtYWlsKX0iPjwvbGFiZWw+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgdHlwZT0ic3VibWl0Ij5FbnZpYXIgY8OzZGlnbzwvYnV0dG9uPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSIgdHlwZT0iYnV0dG9uIiBpZD0iZkJhY2siPlZvbHZlcjwvYnV0dG9uPmApOwogICAgYmFjaygpOwogICAgJCgnI2ZGb3JtJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpOyBlbWFpbCA9ICQoJyNmRW1haWwnKS52YWx1ZS50cmltKCk7CiAgICAgIGNvbnN0IGIgPSBlLnN1Ym1pdHRlcjsgaWYgKGIpIGIuZGlzYWJsZWQgPSB0cnVlOwogICAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvcGFzc3dvcmQvZm9yZ290JywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBlbWFpbCB9IH0pOyBzdGVwQ29kZSgpOyB9CiAgICAgIGNhdGNoICh4KSB7IGVycih4Lm1lc3NhZ2UpOyBpZiAoYikgYi5kaXNhYmxlZCA9IGZhbHNlOyB9CiAgICB9OwogIH0KICBmdW5jdGlvbiBzdGVwQ29kZSgpIHsKICAgIHNoZWxsKGA8aDE+UmV2aXNhIHR1IGNvcnJlbzwvaDE+PHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjAiPlNpIDxiPiR7ZXNjKGVtYWlsKX08L2I+IGVzdMOhIHJlZ2lzdHJhZG8sIHRlIGxsZWfDsyB1biBjw7NkaWdvIGRlIDYgZMOtZ2l0b3MuIFZlbmNlIGVuIDE1IG1pbnV0b3MuIFJldmlzYSB0YW1iacOpbiBsYSBjYXJwZXRhIGRlIHNwYW0uPC9wPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPkPDs2RpZ288aW5wdXQgdHlwZT0idGV4dCIgaWQ9ImZDb2RlIiBpbnB1dG1vZGU9Im51bWVyaWMiIGF1dG9jb21wbGV0ZT0ib25lLXRpbWUtY29kZSIgbWF4bGVuZ3RoPSI2IiBwYXR0ZXJuPSJbMC05XXs2fSIgcmVxdWlyZWQgc3R5bGU9ImZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZToyNHB4O2xldHRlci1zcGFjaW5nOjhweDt0ZXh0LWFsaWduOmNlbnRlciI+PC9sYWJlbD4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiPkNvbnRpbnVhcjwvYnV0dG9uPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUiIHR5cGU9ImJ1dHRvbiIgaWQ9ImZSZXNlbmQiPkVudmlhciBvdHJvIGPDs2RpZ288L2J1dHRvbj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUiIHR5cGU9ImJ1dHRvbiIgaWQ9ImZCYWNrIj5Wb2x2ZXI8L2J1dHRvbj5gKTsKICAgIGJhY2soKTsKICAgICQoJyNmQ29kZScpLmZvY3VzKCk7CiAgICAkKCcjZlJlc2VuZCcpLm9uY2xpY2sgPSBhc3luYyAoKSA9PiB7IHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9wYXNzd29yZC9mb3Jnb3QnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGVtYWlsIH0gfSk7IHRvYXN0KCdDw7NkaWdvIHJlZW52aWFkbycpOyB9IGNhdGNoICh4KSB7IGVycih4Lm1lc3NhZ2UpOyB9IH07CiAgICAkKCcjZkZvcm0nKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4gewogICAgICBlLnByZXZlbnREZWZhdWx0KCk7IGNvZGUgPSAkKCcjZkNvZGUnKS52YWx1ZS50cmltKCk7CiAgICAgIHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9wYXNzd29yZC9jaGVjaycsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgZW1haWwsIGNvZGUgfSB9KTsgc3RlcENob29zZSgpOyB9CiAgICAgIGNhdGNoICh4KSB7IGVycih4Lm1lc3NhZ2UpOyB9CiAgICB9OwogIH0KICBmdW5jdGlvbiBzdGVwQ2hvb3NlKCkgewogICAgc2hlbGwoYDxoMT5Dw7NkaWdvIGNvcnJlY3RvPC9oMT48cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJtYXJnaW46MCI+wr9RdcOpIHF1aWVyZXMgaGFjZXI/PC9wPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIHR5cGU9ImJ1dHRvbiIgaWQ9ImZMb2dpbiI+RW50cmFyIGFob3JhPC9idXR0b24+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tZ2hvc3QiIHR5cGU9ImJ1dHRvbiIgaWQ9ImZDaGFuZ2UiPkNhbWJpYXIgbWkgY29udHJhc2XDsWE8L2J1dHRvbj5gKTsKICAgICQoJyNmTG9naW4nKS5vbmNsaWNrID0gYXN5bmMgKCkgPT4geyB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvcGFzc3dvcmQvbG9naW4nLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGVtYWlsLCBjb2RlIH0gfSk7IGJvb3QoKTsgfSBjYXRjaCAoeCkgeyBlcnIoeC5tZXNzYWdlKTsgfSB9OwogICAgJCgnI2ZDaGFuZ2UnKS5vbmNsaWNrID0gc3RlcE5ldzsKICB9CiAgZnVuY3Rpb24gc3RlcE5ldygpIHsKICAgIHNoZWxsKGA8aDE+TnVldmEgY29udHJhc2XDsWE8L2gxPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPk51ZXZhIGNvbnRyYXNlw7FhIChtw61uaW1vIDgpPGlucHV0IHR5cGU9InBhc3N3b3JkIiBpZD0iZlAxIiBhdXRvY29tcGxldGU9Im5ldy1wYXNzd29yZCIgbWlubGVuZ3RoPSI4IiByZXF1aXJlZD48L2xhYmVsPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPlJlcMOtdGVsYTxpbnB1dCB0eXBlPSJwYXNzd29yZCIgaWQ9ImZQMiIgYXV0b2NvbXBsZXRlPSJuZXctcGFzc3dvcmQiIG1pbmxlbmd0aD0iOCIgcmVxdWlyZWQ+PC9sYWJlbD4KICAgICAgPGxhYmVsIGNsYXNzPSJzd2l0Y2giIHN0eWxlPSJmb250LXNpemU6MTNweCI+PGlucHV0IHR5cGU9ImNoZWNrYm94IiBpZD0iZlNob3ciPiBNb3N0cmFyIGNvbnRyYXNlw7FhPC9sYWJlbD4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiPkd1YXJkYXIgeSBlbnRyYXI8L2J1dHRvbj5gKTsKICAgICQoJyNmU2hvdycpLm9uY2hhbmdlID0gZSA9PiB7ICQoJyNmUDEnKS50eXBlID0gJCgnI2ZQMicpLnR5cGUgPSBlLnRhcmdldC5jaGVja2VkID8gJ3RleHQnIDogJ3Bhc3N3b3JkJzsgfTsKICAgICQoJyNmRm9ybScpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICAgIGUucHJldmVudERlZmF1bHQoKTsKICAgICAgaWYgKCQoJyNmUDEnKS52YWx1ZSAhPT0gJCgnI2ZQMicpLnZhbHVlKSByZXR1cm4gZXJyKCdMYXMgY29udHJhc2XDsWFzIG5vIGNvaW5jaWRlbicpOwogICAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvcGFzc3dvcmQvcmVzZXQnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGVtYWlsLCBjb2RlLCBwYXNzd29yZDogJCgnI2ZQMScpLnZhbHVlIH0gfSk7IHRvYXN0KCdDb250cmFzZcOxYSBhY3R1YWxpemFkYScpOyBib290KCk7IH0KICAgICAgY2F0Y2ggKHgpIHsgZXJyKHgubWVzc2FnZSk7IH0KICAgIH07CiAgfQogIHN0ZXBFbWFpbCgpOwp9CgpmdW5jdGlvbiByZW5kZXJTZXR1cCgpIHsKICAkKCcjYXBwJykuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9ImxvZ2luIj48ZGl2IGNsYXNzPSJjYXJkIj4KICAgIDxkaXYgY2xhc3M9ImFydCI+JHtIRVJPX1NWR308L2Rpdj4KICAgIDxmb3JtIGlkPSJzZXR1cEZvcm0iPgogICAgICA8aDE+QmllbnZlbmlkbzwvaDE+CiAgICAgIDxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9Im1hcmdpbjowIj5DcmVhIGxhIGN1ZW50YSBkZSBhZG1pbmlzdHJhZG9yLiBDb24gZWxsYSBhZ3JlZ2FzIHZlbmRlZG9yZXMsIHVzdWFyaW9zIHkgbGEgY29uZXhpw7NuIGEgTWVyY2FkbyBMaWJyZS48L3A+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+VHUgbm9tYnJlPGlucHV0IHR5cGU9InRleHQiIGlkPSJzTmFtZSIgcmVxdWlyZWQ+PC9sYWJlbD4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5Db3JyZW88aW5wdXQgdHlwZT0iZW1haWwiIGlkPSJzRW1haWwiIGF1dG9jb21wbGV0ZT0idXNlcm5hbWUiIHJlcXVpcmVkPjwvbGFiZWw+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+Q29udHJhc2XDsWEgKG3DrW5pbW8gOCk8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJzUGFzcyIgYXV0b2NvbXBsZXRlPSJuZXctcGFzc3dvcmQiIG1pbmxlbmd0aD0iOCIgcmVxdWlyZWQ+PC9sYWJlbD4KICAgICAgPGxhYmVsIGNsYXNzPSJzd2l0Y2giIHN0eWxlPSJmb250LXNpemU6MTNweCI+PGlucHV0IHR5cGU9ImNoZWNrYm94IiBpZD0ic1Nob3ciPiBNb3N0cmFyIGNvbnRyYXNlw7FhPC9sYWJlbD4KICAgICAgPGRpdiBjbGFzcz0iZXJyIiBpZD0ic0VyciI+PC9kaXY+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgdHlwZT0ic3VibWl0Ij5DcmVhciBhZG1pbmlzdHJhZG9yPC9idXR0b24+CiAgICA8L2Zvcm0+PC9kaXY+PC9kaXY+YDsKICAkKCcjc1Nob3cnKS5vbmNoYW5nZSA9IGUgPT4geyAkKCcjc1Bhc3MnKS50eXBlID0gZS50YXJnZXQuY2hlY2tlZCA/ICd0ZXh0JyA6ICdwYXNzd29yZCc7IH07CiAgJCgnI3NldHVwRm9ybScpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICBlLnByZXZlbnREZWZhdWx0KCk7CiAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvc2V0dXAnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IG5hbWU6ICQoJyNzTmFtZScpLnZhbHVlLCBlbWFpbDogJCgnI3NFbWFpbCcpLnZhbHVlLCBwYXNzd29yZDogJCgnI3NQYXNzJykudmFsdWUgfSB9KTsgYm9vdCgpOyB9CiAgICBjYXRjaCAoZXJyKSB7ICQoJyNzRXJyJykudGV4dENvbnRlbnQgPSBlcnIubWVzc2FnZTsgfQogIH07Cn0KCi8vIC0tLS0tLS0tLS0gZXN0cnVjdHVyYSAtLS0tLS0tLS0tCmZ1bmN0aW9uIHRhYnNGb3Iocm9sZSkgewogIGlmIChyb2xlID09PSAnc2VsbGVyJykgcmV0dXJuIFtbJ3RyYXknLCAnTWlzIGV0aXF1ZXRhcyddLCBbJ3NhbGVzJywgJ01pcyB2ZW50YXMnXSwgWydzZWxsZXInLCAnTWkgY3VlbnRhJ11dOwogIGlmIChyb2xlID09PSAnZnVsZmlsbG1lbnQnKSByZXR1cm4gW1sndHJheScsICdCYW5kZWphIGRlIGV0aXF1ZXRhcyddLCBbJ3NlbGxlcnNWaWV3JywgJ1ZlbmRlZG9yZXMnXV07CiAgcmV0dXJuIFtbJ3RyYXknLCAnQmFuZGVqYSddLCBbJ3NhbGVzJywgJ1ZlbnRhcyddLCBbJ3NlbGxlcicsICdWZW5kZWRvcmVzJ10sIFsnYWRtaW4nLCAnVXN1YXJpb3MgeSBhanVzdGVzJ11dOwp9CmZ1bmN0aW9uIHJlbmRlclNoZWxsKCkgewogIGNvbnN0IHRhYnMgPSB0YWJzRm9yKG1lLnVzZXIucm9sZSk7CiAgaWYgKCF0YWIgfHwgIXRhYnMuc29tZSh0ID0+IHRbMF0gPT09IHRhYikpIHRhYiA9IHN0b3JlLmdldCgndGFiJywgdGFic1swXVswXSk7CiAgaWYgKCF0YWJzLnNvbWUodCA9PiB0WzBdID09PSB0YWIpKSB0YWIgPSB0YWJzWzBdWzBdOwogICQoJyNhcHAnKS5pbm5lckhUTUwgPSBgCiAgPGhlYWRlciBjbGFzcz0idG9wIj48ZGl2IGNsYXNzPSJ3cmFwIj4KICAgIDxhIGNsYXNzPSJicmFuZCIgaHJlZj0iLyI+PGltZyBzcmM9Ii9sb2dvLnN2ZyIgYWx0PSIiPkV0aXF1ZXRhSHViPC9hPgogICAgJHt0YWJzLmxlbmd0aCA+IDEgPyBgPG5hdiBjbGFzcz0ibmF2Ij4ke3RhYnMubWFwKChbaywgbl0pID0+IGA8YnV0dG9uIGRhdGEtdGFiPSIke2t9IiBhcmlhLWN1cnJlbnQ9IiR7ayA9PT0gdGFifSI+JHtufTwvYnV0dG9uPmApLmpvaW4oJycpfTwvbmF2PmAgOiAnJ30KICAgIDxzcGFuIGNsYXNzPSJzcGFjZXIiPjwvc3Bhbj4KICAgIDxzcGFuIGNsYXNzPSJsaXZlIiBpZD0ibGl2ZSI+PGk+PC9pPjxzcGFuPkNvbmVjdGFuZG/igKY8L3NwYW4+PC9zcGFuPgogICAgPGRpdiBjbGFzcz0iY2xvY2siIGlkPSJjbG9jayI+JHtJLmNsb2NrLnJlcGxhY2UoJzxzdmcnLCAnPHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHN0eWxlPSJjb2xvcjp2YXIoLS1hY2NlbnQpIicpfTxkaXY+PHNtYWxsPkNvcnRlICR7ZXNjKG1lLmN1dG9mZil9PC9zbWFsbD48YiBpZD0iY2QiPi0tOi0tOi0tPC9iPjwvZGl2PjwvZGl2PgogICAgPGRpdiBjbGFzcz0idXNlciI+PGRpdj48Yj4ke2VzYyhtZS5zZWxsZXI/Lm5hbWUgfHwgbWUudXNlci5uYW1lKX08L2I+PHNtYWxsPiR7ZXNjKG1lLnVzZXIuZW1haWwpfTwvc21hbGw+PC9kaXY+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgaWQ9Im15QWNjIj5NaSBjbGF2ZTwvYnV0dG9uPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGlkPSJsb2dvdXQiPlNhbGlyPC9idXR0b24+PC9kaXY+CiAgPC9kaXY+PC9oZWFkZXI+CiAgPG1haW4gY2xhc3M9IndyYXAiIGlkPSJtYWluIj48L21haW4+YDsKICAkJCgnLm5hdiBidXR0b24nKS5mb3JFYWNoKGIgPT4gYi5vbmNsaWNrID0gKCkgPT4geyB0YWIgPSBiLmRhdGFzZXQudGFiOyBzdG9yZS5zZXQoJ3RhYicsIHRhYik7ICQkKCcubmF2IGJ1dHRvbicpLmZvckVhY2goeCA9PiB4LnNldEF0dHJpYnV0ZSgnYXJpYS1jdXJyZW50JywgeCA9PT0gYikpOyByZW5kZXJUYWIoKTsgfSk7CiAgJCgnI215QWNjJykub25jbGljayA9ICgpID0+IHJlbmRlck15QWNjb3VudCgpOwogIGlmIChtZS5pbXBlcnNvbmF0ZWRCeSkgewogICAgY29uc3QgYmFyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7CiAgICBiYXIuc3R5bGUuY3NzVGV4dCA9ICdiYWNrZ3JvdW5kOnZhcigtLXdhcm4tYmcpO2NvbG9yOnZhcigtLXdhcm4pO2ZvbnQtd2VpZ2h0OjcwMDtwYWRkaW5nOjEwcHggMTZweDtkaXNwbGF5OmZsZXg7Z2FwOjEycHg7YWxpZ24taXRlbXM6Y2VudGVyO2p1c3RpZnktY29udGVudDpjZW50ZXI7ZmxleC13cmFwOndyYXAnOwogICAgYmFyLmlubmVySFRNTCA9IGBFc3TDoXMgdmllbmRvIGxhIGN1ZW50YSBkZSAke2VzYyhtZS51c2VyLm5hbWUpfSAoJHtlc2MobWUudXNlci5lbWFpbCl9KSA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkgYnRuLXNtIiBpZD0ic3RvcEltcCI+Vm9sdmVyIGEgbWkgY3VlbnRhPC9idXR0b24+YDsKICAgICQoJyNhcHAnKS5wcmVwZW5kKGJhcik7CiAgICAkKCcjc3RvcEltcCcpLm9uY2xpY2sgPSBhc3luYyAoKSA9PiB7IGF3YWl0IGFwaSgnL2FwaS9pbXBlcnNvbmF0ZS9zdG9wJywgeyBtZXRob2Q6ICdQT1NUJyB9KTsgbG9jYXRpb24uaHJlZiA9ICcvJzsgfTsKICB9CiAgJCgnI2xvZ291dCcpLm9uY2xpY2sgPSBhc3luYyAoKSA9PiB7IGF3YWl0IGFwaSgnL2FwaS9sb2dvdXQnLCB7IG1ldGhvZDogJ1BPU1QnIH0pLmNhdGNoKCgpID0+IHt9KTsgbG9jYXRpb24ucmVsb2FkKCk7IH07CiAgc3RhcnRDbG9jaygpOyBjb25uZWN0U3RyZWFtKCk7IHJlbmRlclRhYigpOyB3YXRjaFZlcnNpb24oKTsKfQovLyBTaSBzZSBwdWJsaWNhIHVuYSB2ZXJzacOzbiBudWV2YSBkZSBsYSBhcHAsIGxhIHBhbnRhbGxhIHNlIGFjdHVhbGl6YSBzb2xhCmZ1bmN0aW9uIHdhdGNoVmVyc2lvbigpIHsKICBpZiAod2F0Y2hWZXJzaW9uLl9pKSByZXR1cm47CiAgY29uc3QgY2hlY2sgPSBhc3luYyAoKSA9PiB7CiAgICB0cnkgewogICAgICBjb25zdCB7IHYgfSA9IGF3YWl0IGZldGNoKCcvaGVhbHRoJywgeyBjYWNoZTogJ25vLXN0b3JlJyB9KS50aGVuKHIgPT4gci5qc29uKCkpOwogICAgICBpZiAoIXdhdGNoVmVyc2lvbi52KSB3YXRjaFZlcnNpb24udiA9IHY7CiAgICAgIGVsc2UgaWYgKHYgJiYgdiAhPT0gd2F0Y2hWZXJzaW9uLnYgJiYgIWRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0OmZvY3VzLCB0ZXh0YXJlYTpmb2N1cycpKSBsb2NhdGlvbi5yZWxvYWQoKTsKICAgIH0gY2F0Y2gge30KICB9OwogIGNoZWNrKCk7IHdhdGNoVmVyc2lvbi5faSA9IHNldEludGVydmFsKGNoZWNrLCA2MDAwMCk7Cn0KZnVuY3Rpb24gcmVuZGVyVGFiKCkgeyAoeyB0cmF5OiByZW5kZXJUcmF5LCBzZWxsZXI6IHJlbmRlclNlbGxlciwgYWRtaW46IHJlbmRlckFkbWluLCBzZWxsZXJzVmlldzogcmVuZGVyU2VsbGVyc1ZpZXcsIHNhbGVzOiByZW5kZXJTYWxlcyB9KVt0YWJdKCk7IH0KCi8vIC0tLS0tLS0tLS0gVkVOVEFTIC0tLS0tLS0tLS0KLy8gUGxhbmlsbGEgZGUgcHJvZHVjdG9zIHZlbmRpZG9zOiBmaWphIGRlIGx1bmVzIGEgZG9taW5nbzsgdGFtYmnDqW4gbWVzLCAzMCBkw61hcywgYcOxbyBvIGZlY2hhcyBhIGVsZWNjacOzbgpjb25zdCBwcCA9IHsgbW9kZTogJ3dlZWsnLCB3ZWVrOiAwLCBmcm9tOiAnJywgdG86ICcnLCBxOiAnJywgb3BlbjogbmV3IFNldCgpIH07CmNvbnN0IGlzbyA9IGQgPT4gYCR7ZC5nZXRGdWxsWWVhcigpfS0ke1N0cmluZyhkLmdldE1vbnRoKCkgKyAxKS5wYWRTdGFydCgyLCAnMCcpfS0ke1N0cmluZyhkLmdldERhdGUoKSkucGFkU3RhcnQoMiwgJzAnKX1gOwpmdW5jdGlvbiBwcFJhbmdlKCkgewogIGNvbnN0IHQgPSBuZXcgRGF0ZSgpOyB0LnNldEhvdXJzKDEyLCAwLCAwLCAwKTsKICBpZiAocHAubW9kZSA9PT0gJ3dlZWsnKSB7IGNvbnN0IG1vbiA9IG5ldyBEYXRlKHQpOyBtb24uc2V0RGF0ZSh0LmdldERhdGUoKSAtICgodC5nZXREYXkoKSArIDYpICUgNykgKyBwcC53ZWVrICogNyk7IGNvbnN0IHN1biA9IG5ldyBEYXRlKG1vbik7IHN1bi5zZXREYXRlKG1vbi5nZXREYXRlKCkgKyA2KTsgcmV0dXJuIFtpc28obW9uKSwgaXNvKHN1bildOyB9CiAgaWYgKHBwLm1vZGUgPT09ICdtb250aCcpIHJldHVybiBbaXNvKG5ldyBEYXRlKHQuZ2V0RnVsbFllYXIoKSwgdC5nZXRNb250aCgpLCAxKSksIGlzbyh0KV07CiAgaWYgKHBwLm1vZGUgPT09ICczMCcpIHsgY29uc3QgZiA9IG5ldyBEYXRlKHQpOyBmLnNldERhdGUodC5nZXREYXRlKCkgLSAyOSk7IHJldHVybiBbaXNvKGYpLCBpc28odCldOyB9CiAgaWYgKHBwLm1vZGUgPT09ICd5ZWFyJykgcmV0dXJuIFtpc28obmV3IERhdGUodC5nZXRGdWxsWWVhcigpLCAwLCAxKSksIGlzbyh0KV07CiAgcmV0dXJuIFtwcC5mcm9tIHx8IGlzbyh0KSwgcHAudG8gfHwgaXNvKHQpXTsKfQpjb25zdCBmbXREID0gZCA9PiBuZXcgRGF0ZShkICsgJ1QxMjowMDowMCcpLnRvTG9jYWxlRGF0ZVN0cmluZygnZXMtQ0wnLCB7IHdlZWtkYXk6ICdzaG9ydCcsIGRheTogJ251bWVyaWMnLCBtb250aDogJ3Nob3J0JyB9KS5yZXBsYWNlKCcuJywgJycpOwphc3luYyBmdW5jdGlvbiByZW5kZXJQcm9kdWN0cygpIHsKICBjb25zdCBib3ggPSAkKCcjcHJvZFBhbmVsJyk7IGlmICghYm94KSByZXR1cm47CiAgY29uc3QgaXNBZG1pbiA9IG1lLnVzZXIucm9sZSA9PT0gJ2FkbWluJzsKICBjb25zdCBzaWQgPSBpc0FkbWluID8gc3RvcmUuZ2V0KCdzYWxlc1NlbGxlcicsICcnKSA6ICcnOwogIGNvbnN0IFtmcm9tLCB0b10gPSBwcFJhbmdlKCk7CiAgY29uc3QgcXMgPSBgZnJvbT0ke2Zyb219JnRvPSR7dG99JHtzaWQgPyAnJnNlbGxlcl9pZD0nICsgc2lkIDogJyd9YDsKICBib3guaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9InBhbmVsLWhlYWQiIHN0eWxlPSJmbGV4LXdyYXA6d3JhcDtnYXA6MTBweCI+PGgyPlByb2R1Y3RvcyB2ZW5kaWRvczwvaDI+CiAgICA8c2VsZWN0IGlkPSJwcE1vZGUiIHN0eWxlPSJ3aWR0aDphdXRvIj4ke1tbJ3dlZWsnLCAnU2VtYW5hIChsdW5lcyBhIGRvbWluZ28pJ10sIFsnbW9udGgnLCAnRXN0ZSBtZXMnXSwgWyczMCcsICfDmmx0aW1vcyAzMCBkw61hcyddLCBbJ3llYXInLCAnRXN0ZSBhw7FvJ10sIFsnY3VzdG9tJywgJ0VsZWdpciBmZWNoYXPigKYnXV0ubWFwKChbaywgbl0pID0+IGA8b3B0aW9uIHZhbHVlPSIke2t9IiAke3BwLm1vZGUgPT09IGsgPyAnc2VsZWN0ZWQnIDogJyd9PiR7bn08L29wdGlvbj5gKS5qb2luKCcnKX08L3NlbGVjdD4KICAgICR7cHAubW9kZSA9PT0gJ3dlZWsnID8gYDxzcGFuIGNsYXNzPSJwcC13ZWVrIj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBpZD0icHBQcmV2IiBhcmlhLWxhYmVsPSJTZW1hbmEgYW50ZXJpb3IiPuKAuTwvYnV0dG9uPjxiPiR7ZXNjKGZtdEQoZnJvbSkpfSDigJMgJHtlc2MoZm10RCh0bykpfTwvYj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBpZD0icHBOZXh0IiBhcmlhLWxhYmVsPSJTZW1hbmEgc2lndWllbnRlIiAke3BwLndlZWsgPj0gMCA/ICdkaXNhYmxlZCcgOiAnJ30+4oC6PC9idXR0b24+PC9zcGFuPmAgOiAnJ30KICAgICR7cHAubW9kZSA9PT0gJ2N1c3RvbScgPyBgPHNwYW4gY2xhc3M9InBwLXdlZWsiPjxpbnB1dCB0eXBlPSJkYXRlIiBpZD0icHBGcm9tIiB2YWx1ZT0iJHtmcm9tfSIgc3R5bGU9IndpZHRoOmF1dG8iPiBhIDxpbnB1dCB0eXBlPSJkYXRlIiBpZD0icHBUbyIgdmFsdWU9IiR7dG99IiBzdHlsZT0id2lkdGg6YXV0byI+PC9zcGFuPmAgOiAnJ30KICAgIDxpbnB1dCB0eXBlPSJzZWFyY2giIGlkPSJwcFEiIHBsYWNlaG9sZGVyPSJCdXNjYXIgcHJvZHVjdG8gbyBTS1UiIHZhbHVlPSIke2VzYyhwcC5xKX0iIHN0eWxlPSJ3aWR0aDphdXRvO21pbi13aWR0aDoxOTBweCI+CiAgICA8c3BhbiBjbGFzcz0ic3BhY2VyIiBzdHlsZT0iZmxleDoxIj48L3NwYW4+CiAgICA8YSBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IGJ0bi1zbSIgaWQ9InBwWGxzIiBocmVmPSIvYXBpL3NhbGVzL3Byb2R1Y3RzLnhsc3g/JHtxc30iPiR7SS5kb3dufURlc2NhcmdhciBFeGNlbDwvYT48L2Rpdj4KICAgIDxkaXYgY2xhc3M9InBhbmVsLWJvZHkiIGlkPSJwcEJvZHkiPjxkaXYgY2xhc3M9Im11dGVkIj5DYXJnYW5kbyBwcm9kdWN0b3PigKY8L2Rpdj48L2Rpdj5gOwogICQoJyNwcE1vZGUnKS5vbmNoYW5nZSA9IGUgPT4geyBwcC5tb2RlID0gZS50YXJnZXQudmFsdWU7IHBwLndlZWsgPSAwOyBpZiAocHAubW9kZSA9PT0gJ2N1c3RvbScgJiYgIXBwLmZyb20pIHsgY29uc3QgW2YsIHRdID0gcHBSYW5nZSgpOyBwcC5mcm9tID0gZjsgcHAudG8gPSB0OyB9IHJlbmRlclByb2R1Y3RzKCk7IH07CiAgaWYgKCQoJyNwcFByZXYnKSkgeyAkKCcjcHBQcmV2Jykub25jbGljayA9ICgpID0+IHsgcHAud2Vlay0tOyByZW5kZXJQcm9kdWN0cygpOyB9OyAkKCcjcHBOZXh0Jykub25jbGljayA9ICgpID0+IHsgaWYgKHBwLndlZWsgPCAwKSB7IHBwLndlZWsrKzsgcmVuZGVyUHJvZHVjdHMoKTsgfSB9OyB9CiAgaWYgKCQoJyNwcEZyb20nKSkgeyBjb25zdCBjaCA9ICgpID0+IHsgcHAuZnJvbSA9ICQoJyNwcEZyb20nKS52YWx1ZTsgcHAudG8gPSAkKCcjcHBUbycpLnZhbHVlOyByZW5kZXJQcm9kdWN0cygpOyB9OyAkKCcjcHBGcm9tJykub25jaGFuZ2UgPSBjaDsgJCgnI3BwVG8nKS5vbmNoYW5nZSA9IGNoOyB9CiAgbGV0IGQ7CiAgdHJ5IHsgZCA9IGF3YWl0IGFwaSgnL2FwaS9zYWxlcy9wcm9kdWN0cz8nICsgcXMpOyB9IGNhdGNoIChlKSB7ICQoJyNwcEJvZHknKS5pbm5lckhUTUwgPSBlc2MoZS5tZXNzYWdlKTsgcmV0dXJuOyB9CiAgY29uc3QgZHJhdyA9ICgpID0+IHsKICAgIGlmICghJCgnI3BwQm9keScpKSByZXR1cm47CiAgICBjb25zdCBxID0gcHAucS50b0xvd2VyQ2FzZSgpOwogICAgY29uc3Qgcm93cyA9IGQucm93cy5maWx0ZXIociA9PiAhcSB8fCBbci5uYW1lLCByLnB1Yl9pZCwgci5zZWxsZXIsIC4uLnIudmFyaWFudHMubWFwKHYgPT4gdi52YXJpYW50ICsgJyAnICsgdi5za3UpXS5qb2luKCcgJykudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxKSk7CiAgICBjb25zdCBkYXlzID0gW107IGZvciAobGV0IHggPSBuZXcgRGF0ZShmcm9tICsgJ1QxMjowMDowMCcpOyBpc28oeCkgPD0gdG8gJiYgZGF5cy5sZW5ndGggPCA0MDA7IHguc2V0RGF0ZSh4LmdldERhdGUoKSArIDEpKSBkYXlzLnB1c2goaXNvKHgpKTsKICAgIGNvbnN0IHdlZWtseSA9IGRheXMubGVuZ3RoIDw9IDcsIGFsbCA9ICFzaWQgJiYgaXNBZG1pbjsKICAgIGNvbnN0IHRvdCA9IGsgPT4gcm93cy5yZWR1Y2UoKGEsIHIpID0+IGEgKyAodHlwZW9mIGsgPT09ICdmdW5jdGlvbicgPyBrKHIpIDogcltrXSksIDApOwogICAgY29uc3QgaGVhZCA9IGAke2FsbCA/ICc8dGg+VmVuZGVkb3I8L3RoPicgOiAnJ308dGg+UHVibGljYWNpw7NuPC90aD48dGg+SUQgLyBTS1U8L3RoPiR7d2Vla2x5ID8gZGF5cy5tYXAoeCA9PiBgPHRoIGNsYXNzPSJudW0iPiR7ZXNjKGZtdEQoeCkuc3BsaXQoJyAnKVswXS5yZXBsYWNlKCcsJywgJycpKX08c21hbGw+JHt4LnNsaWNlKDgpfTwvc21hbGw+PC90aD5gKS5qb2luKCcnKSA6IFsnbWwnLCAnZmEnLCAncGEnXS5tYXAoayA9PiBgPHRoIGNsYXNzPSJudW0iPjxpIGNsYXNzPSJkb3QiIHN0eWxlPSJiYWNrZ3JvdW5kOiR7TUtfQ09MT1Jba119Ij48L2k+JHtNS1trXX08L3RoPmApLmpvaW4oJycpfTx0aCBjbGFzcz0ibnVtIj5Ub3RhbDwvdGg+PHRoIGNsYXNzPSJudW0iPk1vbnRvPC90aD5gOwogICAgY29uc3QgY2VsbFEgPSBuID0+IG4gPyBgPGI+JHtufTwvYj5gIDogJzxzcGFuIGNsYXNzPSJ6ZXJvIj7Ctzwvc3Bhbj4nOwogICAgY29uc3QgbnVtcyA9IHIgPT4gYCR7d2Vla2x5ID8gZGF5cy5tYXAoeCA9PiBgPHRkIGNsYXNzPSJudW0iPiR7Y2VsbFEoci5ieURheVt4XSB8fCAwKX08L3RkPmApLmpvaW4oJycpIDogWydtbCcsICdmYScsICdwYSddLm1hcChrID0+IGA8dGQgY2xhc3M9Im51bSI+JHtjZWxsUShyLmJ5TWtba10gfHwgMCl9PC90ZD5gKS5qb2luKCcnKX08dGQgY2xhc3M9Im51bSBwcC10b3RhbCI+JHtyLnF0eX08L3RkPjx0ZCBjbGFzcz0ibnVtIj4ke21vbmV5KHIuYW1vdW50KX08L3RkPmA7CiAgICAvLyB1bmEgZmlsYSBwb3IgcHVibGljYWNpw7NuOyBjb24gbGEgZmxlY2hhIHNlIGRlc3BsaWVnYW4gc3VzIHZhcmlhbnRlcwogICAgY29uc3QgYm9keSA9IHJvd3MubWFwKHIgPT4gewogICAgICBjb25zdCBrZXkgPSByLnNlbGxlciArICd8JyArIHIubWFya2V0cGxhY2UgKyAnfCcgKyAoci5wdWJfaWQgfHwgci5uYW1lKSwgb3BlbiA9IHBwLm9wZW4uaGFzKGtleSksIG1hbnkgPSByLnZhcmlhbnRzLmxlbmd0aCA+IDE7CiAgICAgIGNvbnN0IG9uZSA9ICFtYW55ID8gci52YXJpYW50c1swXSA6IG51bGw7CiAgICAgIGxldCBoID0gYDx0ciBjbGFzcz0icHAtcHViJHttYW55ID8gJyBwcC1jYW4nIDogJyd9IiAke21hbnkgPyBgZGF0YS1waz0iJHtlc2Moa2V5KX0iYCA6ICcnfT4ke2FsbCA/IGA8dGQ+JHtlc2Moci5zZWxsZXIpfTwvdGQ+YCA6ICcnfTx0ZD4ke21hbnkgPyBgPHNwYW4gY2xhc3M9InBwLWFycm93Ij4ke29wZW4gPyAn4pa+JyA6ICfilrgnfTwvc3Bhbj5gIDogJzxzcGFuIGNsYXNzPSJwcC1hcnJvdyI+PC9zcGFuPid9PHNwYW4gY2xhc3M9Im1rICR7ci5tYXJrZXRwbGFjZX0iIHN0eWxlPSJtYXJnaW4tcmlnaHQ6NnB4Ij4ke01LW3IubWFya2V0cGxhY2VdIHx8ICcnfTwvc3Bhbj48c3BhbiBjbGFzcz0icHAtbmFtZSI+JHtlc2Moci5uYW1lKX08L3NwYW4+JHttYW55ID8gYDxzbWFsbCBjbGFzcz0ibXV0ZWQgcHAtc3ViIj4ke3IudmFyaWFudHMubGVuZ3RofSB2YXJpYW50ZXMgwrcgdG9jYSBwYXJhIHZlcjwvc21hbGw+YCA6IG9uZSAmJiBvbmUudmFyaWFudCA/IGA8c21hbGwgY2xhc3M9Im11dGVkIHBwLXN1YiI+JHtlc2Mob25lLnZhcmlhbnQpfTwvc21hbGw+YCA6ICcnfTwvdGQ+PHRkIGNsYXNzPSJtb25vIj4ke2VzYyhyLnB1Yl9pZCB8fCAnJyl9JHtvbmUgJiYgb25lLnNrdSA/IGA8c21hbGwgY2xhc3M9Im11dGVkIj4ke2VzYyhvbmUuc2t1KX08L3NtYWxsPmAgOiAnJ308L3RkPiR7bnVtcyhyKX08L3RyPmA7CiAgICAgIGlmIChtYW55ICYmIG9wZW4pIGggKz0gci52YXJpYW50cy5tYXAodiA9PiBgPHRyIGNsYXNzPSJwcC12YXIiPiR7YWxsID8gJzx0ZD48L3RkPicgOiAnJ308dGQ+PHNwYW4gY2xhc3M9InBwLXZuYW1lIj4ke2VzYyh2LnZhcmlhbnQgfHwgJ1NpbiB2YXJpYW50ZScpfTwvc3Bhbj48L3RkPjx0ZCBjbGFzcz0ibW9ubyI+JHtlc2Modi5za3UgfHwgJycpfTwvdGQ+JHtudW1zKHYpfTwvdHI+YCkuam9pbignJyk7CiAgICAgIHJldHVybiBoOwogICAgfSkuam9pbignJyk7CiAgICBjb25zdCBmb290ID0gYDx0cj4ke2FsbCA/ICc8dGQ+PC90ZD4nIDogJyd9PHRkPjxiPlRvdGFsICgke3Jvd3MubGVuZ3RofSBwdWJsaWNhY2kke3Jvd3MubGVuZ3RoID09PSAxID8gJ8OzbicgOiAnb25lcyd9KTwvYj48L3RkPjx0ZD48L3RkPiR7d2Vla2x5ID8gZGF5cy5tYXAoeCA9PiBgPHRkIGNsYXNzPSJudW0iPjxiPiR7dG90KHIgPT4gci5ieURheVt4XSB8fCAwKX08L2I+PC90ZD5gKS5qb2luKCcnKSA6IFsnbWwnLCAnZmEnLCAncGEnXS5tYXAoayA9PiBgPHRkIGNsYXNzPSJudW0iPjxiPiR7dG90KHIgPT4gci5ieU1rW2tdIHx8IDApfTwvYj48L3RkPmApLmpvaW4oJycpfTx0ZCBjbGFzcz0ibnVtIHBwLXRvdGFsIj4ke3RvdCgncXR5Jyl9PC90ZD48dGQgY2xhc3M9Im51bSI+PGI+JHttb25leSh0b3QoJ2Ftb3VudCcpKX08L2I+PC90ZD48L3RyPmA7CiAgICBjb25zdCBub3RlID0gZC5oaXN0b3J5U2luY2UgJiYgZnJvbSA8IGQuaGlzdG9yeVNpbmNlID8gYDxwIGNsYXNzPSJwcC1ub3RlIj5Fc3RhbW9zIHRyYXllbmRvIHR1IGhpc3RvcmlhbCBkZSB2ZW50YXMgZGUgYSBwb2NvIChoYXN0YSAxIGHDsW8pLiBQb3IgYWhvcmEgaGF5IGRhdG9zIGNvbXBsZXRvcyBkZXNkZSBlbCAke2VzYyhmbXREKGQuaGlzdG9yeVNpbmNlKSl9OyBlbCByZXN0byBhcGFyZWNlIHNvbG8gZW4gbGFzIHByw7N4aW1hcyBob3Jhcy48L3A+YCA6ICcnOwogICAgY29uc3QgZXhwYW5kQnRuID0gcm93cy5zb21lKHIgPT4gci52YXJpYW50cy5sZW5ndGggPiAxKSA/IGA8ZGl2IHN0eWxlPSJtYXJnaW46MCAwIDhweCI+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgaWQ9InBwQWxsIj4ke3Jvd3MuZmlsdGVyKHIgPT4gci52YXJpYW50cy5sZW5ndGggPiAxKS5ldmVyeShyID0+IHBwLm9wZW4uaGFzKHIuc2VsbGVyICsgJ3wnICsgci5tYXJrZXRwbGFjZSArICd8JyArIChyLnB1Yl9pZCB8fCByLm5hbWUpKSkgPyAnT2N1bHRhciB2YXJpYW50ZXMnIDogJ1ZlciB0b2RhcyBsYXMgdmFyaWFudGVzJ308L2J1dHRvbj48L2Rpdj5gIDogJyc7CiAgICAkKCcjcHBCb2R5JykuaW5uZXJIVE1MID0gbm90ZSArIGV4cGFuZEJ0biArIChyb3dzLmxlbmd0aCA/IGA8ZGl2IGNsYXNzPSJ0YWJsZS13cmFwIj48dGFibGUgY2xhc3M9InBwLXRhYmxlIj48dGhlYWQ+PHRyPiR7aGVhZH08L3RyPjwvdGhlYWQ+PHRib2R5PiR7Ym9keX08L3Rib2R5Pjx0Zm9vdD4ke2Zvb3R9PC90Zm9vdD48L3RhYmxlPjwvZGl2PmAgOiBgPGRpdiBjbGFzcz0iZW1wdHkiPiR7cSA/ICdOaW5nw7puIHByb2R1Y3RvIGNvaW5jaWRlIGNvbiBsYSBiw7pzcXVlZGEuJyA6ICdObyBoYXkgcHJvZHVjdG9zIHZlbmRpZG9zIGVuIGVzdGFzIGZlY2hhcy4nfTwvZGl2PmApOwogIH07CiAgZHJhdygpOwogICQoJyNwcEJvZHknKS5vbmNsaWNrID0gZSA9PiB7CiAgICBpZiAoZS50YXJnZXQuY2xvc2VzdCgnI3BwQWxsJykpIHsKICAgICAgY29uc3Qga2V5cyA9IGQucm93cy5maWx0ZXIociA9PiByLnZhcmlhbnRzLmxlbmd0aCA+IDEpLm1hcChyID0+IHIuc2VsbGVyICsgJ3wnICsgci5tYXJrZXRwbGFjZSArICd8JyArIChyLnB1Yl9pZCB8fCByLm5hbWUpKTsKICAgICAgY29uc3QgYWxsT3BlbiA9IGtleXMuZXZlcnkoayA9PiBwcC5vcGVuLmhhcyhrKSk7CiAgICAgIGtleXMuZm9yRWFjaChrID0+IGFsbE9wZW4gPyBwcC5vcGVuLmRlbGV0ZShrKSA6IHBwLm9wZW4uYWRkKGspKTsgZHJhdygpOyByZXR1cm47CiAgICB9CiAgICBjb25zdCB0ciA9IGUudGFyZ2V0LmNsb3Nlc3QoJ3RyW2RhdGEtcGtdJyk7IGlmICghdHIpIHJldHVybjsKICAgIGNvbnN0IGsgPSB0ci5kYXRhc2V0LnBrOyBwcC5vcGVuLmhhcyhrKSA/IHBwLm9wZW4uZGVsZXRlKGspIDogcHAub3Blbi5hZGQoayk7IGRyYXcoKTsKICB9OwogICQoJyNwcFEnKS5vbmlucHV0ID0gZSA9PiB7IHBwLnEgPSBlLnRhcmdldC52YWx1ZTsgZHJhdygpOyB9Owp9CmNvbnN0IE1LX0NPTE9SID0geyBtbDogJyNDOTlBMDAnLCBmYTogJyM0RjhGMDAnLCBwYTogJyMwMDY4QjgnIH07IC8vIGNvbG9yZXMgZGUgY2FkYSBtYXJrZXRwbGFjZSAodmFsaWRhZG9zIHBhcmEgZGFsdG9uaXNtbywgY29uIGV0aXF1ZXRhcyB5IHNlcGFyYWNpw7NuKQpjb25zdCBtb25leSA9IG4gPT4gJyQnICsgTWF0aC5yb3VuZChuKS50b0xvY2FsZVN0cmluZygnZXMtQ0wnKTsKY29uc3QgbW9uZXlTaG9ydCA9IG4gPT4gbiA+PSAxZTYgPyAnJCcgKyAobiAvIDFlNikudG9GaXhlZCgxKS5yZXBsYWNlKCcuJywgJywnKS5yZXBsYWNlKCcsMCcsICcnKSArICcgTScgOiBuID49IDFlNCA/ICckJyArIE1hdGgucm91bmQobiAvIDFlMykgKyAnIG1pbCcgOiBtb25leShuKTsKY29uc3QgZGF5U2hvcnQgPSBkID0+IHsgY29uc3QgeCA9IG5ldyBEYXRlKGQgKyAnVDEyOjAwOjAwJyk7IHJldHVybiB4LnRvTG9jYWxlRGF0ZVN0cmluZygnZXMtQ0wnLCB7IHdlZWtkYXk6ICdzaG9ydCcgfSkucmVwbGFjZSgnLicsICcnKSArICcgJyArIHguZ2V0RGF0ZSgpOyB9Owpjb25zdCBkYXlMb25nID0gZCA9PiBuZXcgRGF0ZShkICsgJ1QxMjowMDowMCcpLnRvTG9jYWxlRGF0ZVN0cmluZygnZXMtQ0wnLCB7IHdlZWtkYXk6ICdsb25nJywgZGF5OiAnbnVtZXJpYycsIG1vbnRoOiAnbG9uZycgfSk7CmNvbnN0IG5pY2VNYXggPSB2ID0+IHsgaWYgKHYgPD0gMCkgcmV0dXJuIDEwMDAwOyBjb25zdCBwID0gTWF0aC5wb3coMTAsIE1hdGguZmxvb3IoTWF0aC5sb2cxMCh2KSkpOyBjb25zdCBmID0gdiAvIHA7IHJldHVybiAoZiA8PSAxID8gMSA6IGYgPD0gMiA/IDIgOiBmIDw9IDIuNSA/IDIuNSA6IGYgPD0gNSA/IDUgOiAxMCkgKiBwOyB9OwpmdW5jdGlvbiBiYXJQYXRoKHgsIHksIHcsIGgsIHIpIHsKICBpZiAoaCA8PSAwKSByZXR1cm4gJyc7CiAgciA9IE1hdGgubWluKHIsIGgsIHcgLyAyKTsKICByZXR1cm4gYE0ke3h9LCR7eSArIGh9ViR7eSArIHJ9USR7eH0sJHt5fSAke3ggKyByfSwke3l9SCR7eCArIHcgLSByfVEke3ggKyB3fSwke3l9ICR7eCArIHd9LCR7eSArIHJ9ViR7eSArIGh9WmA7Cn0KLy8gR3LDoWZpY28gZGUgY29sdW1uYXMgKHVuYSBzZXJpZSkgbyBjb2x1bW5hcyBhcGlsYWRhcyAodmFyaWFzKS4gVG9vbHRpcCBwb3IgY29sdW1uYS4KZnVuY3Rpb24gY29sdW1uQ2hhcnQoZGF5cywgc3RhY2tzLCB7IGhlaWdodCA9IDIzMCwgdG9kYXksIHdpZHRoID0gNjQwIH0gPSB7fSkgewogIGNvbnN0IFcgPSBNYXRoLm1heCgyODAsIHdpZHRoKSwgSCA9IGhlaWdodCwgTCA9IDQsIFIgPSA1MiwgVCA9IDI2LCBCID0gMzA7CiAgY29uc3QgdG90YWxzID0gZGF5cy5tYXAoKF8sIGkpID0+IHN0YWNrcy5yZWR1Y2UoKGEsIHMpID0+IGEgKyBzLnZhbHVlc1tpXS5hbW91bnQsIDApKTsKICBjb25zdCBtYXggPSBuaWNlTWF4KE1hdGgubWF4KC4uLnRvdGFscykgKiAxLjA4KTsKICBjb25zdCBzbG90ID0gKFcgLSBMIC0gUikgLyBkYXlzLmxlbmd0aCwgYncgPSBNYXRoLm1pbig1Niwgc2xvdCAqIDAuNTgpOwogIGNvbnN0IGNvbXBhY3QgPSBzbG90IDwgNzQ7IC8vIGNhamEgYW5nb3N0YSAoY2VsdWxhciAvIHRhcmpldGEgY2hpY2EpOiBtZW5vcyBldGlxdWV0YXMgcGFyYSBxdWUgbm8gc2UgZW5jaW1lbgogIGxldCBiZXN0SSA9IDA7IHRvdGFscy5mb3JFYWNoKCh0LCBpKSA9PiB7IGlmICh0ID4gdG90YWxzW2Jlc3RJXSkgYmVzdEkgPSBpOyB9KTsKICBjb25zdCB5ID0gdiA9PiBUICsgKEggLSBUIC0gQikgKiAoMSAtIHYgLyBtYXgpOwogIGxldCBnID0gJyc7CiAgZm9yIChjb25zdCBmIG9mIFswLjUsIDFdKSBnICs9IGA8bGluZSB4MT0iJHtMfSIgeDI9IiR7VyAtIFJ9IiB5MT0iJHt5KG1heCAqIGYpfSIgeTI9IiR7eShtYXggKiBmKX0iIHN0cm9rZT0idmFyKC0tbGluZSkiIHN0cm9rZS1kYXNoYXJyYXk9IjMgNCIvPjx0ZXh0IHg9IiR7VyAtIDJ9IiB5PSIke3kobWF4ICogZikgKyA0fSIgdGV4dC1hbmNob3I9ImVuZCIgY2xhc3M9ImNoLWF4Ij4ke21vbmV5U2hvcnQobWF4ICogZil9PC90ZXh0PmA7CiAgZyArPSBgPGxpbmUgeDE9IiR7TH0iIHgyPSIke1cgLSBSfSIgeTE9IiR7eSgwKX0iIHkyPSIke3koMCl9IiBzdHJva2U9InZhcigtLWxpbmUpIi8+YDsKICBkYXlzLmZvckVhY2goKGQsIGkpID0+IHsKICAgIGNvbnN0IHggPSBMICsgc2xvdCAqIGkgKyAoc2xvdCAtIGJ3KSAvIDI7CiAgICBsZXQgYWNjID0gMDsKICAgIGNvbnN0IHNlZ3MgPSBzdGFja3MuZmlsdGVyKHMgPT4gcy52YWx1ZXNbaV0uYW1vdW50ID4gMCk7CiAgICBzZWdzLmZvckVhY2goKHMsIGspID0+IHsKICAgICAgY29uc3QgdiA9IHMudmFsdWVzW2ldLmFtb3VudCwgeTEgPSB5KGFjYyArIHYpLCB5MCA9IHkoYWNjKTsKICAgICAgY29uc3QgdG9wID0gayA9PT0gc2Vncy5sZW5ndGggLSAxOwogICAgICBjb25zdCBoID0gTWF0aC5tYXgoMCwgeTAgLSB5MSAtIChrID4gMCA/IDIgOiAwKSk7IC8vIDJweCBkZSBzZXBhcmFjacOzbiBlbnRyZSBzZWdtZW50b3MKICAgICAgZyArPSB0b3AgPyBgPHBhdGggZD0iJHtiYXJQYXRoKHgsIHkxLCBidywgaCwgNCl9IiBmaWxsPSIke3MuY29sb3J9Ii8+YCA6IGA8cmVjdCB4PSIke3h9IiB5PSIke3kxfSIgd2lkdGg9IiR7Ynd9IiBoZWlnaHQ9IiR7aH0iIGZpbGw9IiR7cy5jb2xvcn0iLz5gOwogICAgICBhY2MgKz0gdjsKICAgIH0pOwogICAgY29uc3QgaXNUb2RheSA9IGQgPT09IHRvZGF5OwogICAgaWYgKHRvdGFsc1tpXSA+IDAgJiYgKCFjb21wYWN0IHx8IGlzVG9kYXkgfHwgaSA9PT0gYmVzdEkpKSB7IGNvbnN0IGxibCA9IG1vbmV5U2hvcnQodG90YWxzW2ldKSwgaHcgPSBsYmwubGVuZ3RoICogMy42OyBjb25zdCBjeCA9IE1hdGgubWluKE1hdGgubWF4KHggKyBidyAvIDIsIEwgKyBodyksIFcgLSBSIC0gaHcgKyAzMCk7IGcgKz0gYDx0ZXh0IHg9IiR7Y3h9IiB5PSIke3kodG90YWxzW2ldKSAtIDd9IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBjbGFzcz0iY2gtdmFsJHtpc1RvZGF5ID8gJyBjaC10b2RheScgOiAnJ30iPiR7bGJsfTwvdGV4dD5gOyB9CiAgICBnICs9IGA8dGV4dCB4PSIke3ggKyBidyAvIDJ9IiB5PSIke0ggLSAxMH0iIHRleHQtYW5jaG9yPSJtaWRkbGUiIGNsYXNzPSJjaC1kYXkke2lzVG9kYXkgPyAnIGNoLXRvZGF5JyA6ICcnfSI+JHtpc1RvZGF5ID8gJ0hveScgOiBjb21wYWN0ID8gZGF5U2hvcnQoZCkuc2xpY2UoMCwgMikgKyAnICcgKyBkLnNsaWNlKDgpLnJlcGxhY2UoL14wLywgJycpIDogZGF5U2hvcnQoZCl9PC90ZXh0PmA7CiAgICBjb25zdCB0aXAgPSBbZGF5TG9uZyhkKSwgLi4uc3RhY2tzLm1hcChzID0+IGAke3MubGFiZWx9OiAke21vbmV5KHMudmFsdWVzW2ldLmFtb3VudCl9IMK3ICR7cy52YWx1ZXNbaV0ub3JkZXJzfSB2ZW50YSR7cy52YWx1ZXNbaV0ub3JkZXJzID09PSAxID8gJycgOiAncyd9YCksIHN0YWNrcy5sZW5ndGggPiAxID8gYFRvdGFsOiAke21vbmV5KHRvdGFsc1tpXSl9YCA6ICcnXS5maWx0ZXIoQm9vbGVhbikuam9pbignfCcpOwogICAgZyArPSBgPHJlY3QgeD0iJHtMICsgc2xvdCAqIGl9IiB5PSIke1QgLSAyMH0iIHdpZHRoPSIke3Nsb3R9IiBoZWlnaHQ9IiR7SCAtIFQgLSBCICsgMjB9IiBmaWxsPSJ0cmFuc3BhcmVudCIgY2xhc3M9ImNoLWhpdCIgZGF0YS10aXA9IiR7ZXNjKHRpcCl9Ii8+YDsKICB9KTsKICByZXR1cm4gYDxzdmcgdmlld0JveD0iMCAwICR7V30gJHtIfSIgd2lkdGg9IiR7V30iIGhlaWdodD0iJHtIfSIgY2xhc3M9ImNoYXJ0IiByb2xlPSJpbWciPiR7Z308L3N2Zz5gOwp9CmZ1bmN0aW9uIHNhbGVzVGFibGUoZGF5cywgZCkgewogIHJldHVybiBgPGRldGFpbHMgY2xhc3M9ImNoLXRhYmxlIj48c3VtbWFyeT5WZXIgdGFibGE8L3N1bW1hcnk+PGRpdiBjbGFzcz0idGFibGUtd3JhcCI+PHRhYmxlPjx0aGVhZD48dHI+PHRoPkTDrWE8L3RoPiR7WydtbCcsICdmYScsICdwYSddLm1hcChrID0+IGA8dGg+JHtNS1trXX08L3RoPmApLmpvaW4oJycpfTx0aD5Ub3RhbDwvdGg+PC90cj48L3RoZWFkPjx0Ym9keT4KICAgICR7ZGF5cy5tYXAoKGRheSwgaSkgPT4gYDx0cj48dGQ+JHtlc2MoZGF5TG9uZyhkYXkpKX08L3RkPiR7WydtbCcsICdmYScsICdwYSddLm1hcChrID0+IGA8dGQ+JHttb25leShkLnNlcmllc1trXVtpXS5hbW91bnQpfSA8c3BhbiBjbGFzcz0ibXV0ZWQiPigke2Quc2VyaWVzW2tdW2ldLm9yZGVyc30pPC9zcGFuPjwvdGQ+YCkuam9pbignJyl9PHRkPjxiPiR7bW9uZXkoWydtbCcsICdmYScsICdwYSddLnJlZHVjZSgoYSwgaykgPT4gYSArIGQuc2VyaWVzW2tdW2ldLmFtb3VudCwgMCkpfTwvYj48L3RkPjwvdHI+YCkuam9pbignJyl9CiAgPC90Ym9keT48L3RhYmxlPjwvZGl2PjwvZGV0YWlscz5gOwp9CmFzeW5jIGZ1bmN0aW9uIHJlbmRlclNhbGVzKGZvcmNlID0gZmFsc2UpIHsKICBjb25zdCBpc0FkbWluID0gbWUudXNlci5yb2xlID09PSAnYWRtaW4nOwogIGlmICghJCgnI3NhbGVzQm9keScpKSAkKCcjbWFpbicpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJzZWN0aW9uLXRpdGxlIiBzdHlsZT0ibWFyZ2luLXRvcDoyMnB4Ij48aDI+JHtpc0FkbWluID8gJ1ZlbnRhcycgOiAnTWlzIHZlbnRhcyd9PC9oMj48c3BhbiBjbGFzcz0ibXV0ZWQiPsOabHRpbW9zIDcgZMOtYXMgwrcgc2UgYWN0dWFsaXphIHNvbGE8L3NwYW4+PHNwYW4gY2xhc3M9InNwYWNlciIgc3R5bGU9ImZsZXg6MSI+PC9zcGFuPjxzcGFuIGlkPSJzYWxlc1BpY2siPjwvc3Bhbj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWdob3N0IGJ0bi1zbSIgaWQ9InNhbGVzUmVmcmVzaCI+JHtJLnN5bmN9QWN0dWFsaXphcjwvYnV0dG9uPjwvZGl2PjxkaXYgaWQ9InNhbGVzQm9keSI+PGRpdiBjbGFzcz0icGFuZWwiPjxkaXYgY2xhc3M9InBhbmVsLWJvZHkgbXV0ZWQiPkNhcmdhbmRvIHR1cyB2ZW50YXPigKY8L2Rpdj48L2Rpdj48L2Rpdj48ZGl2IGNsYXNzPSJjaC10aXAiIGlkPSJjaFRpcCIgaGlkZGVuPjwvZGl2PmA7CiAgJCgnI3NhbGVzUmVmcmVzaCcpLm9uY2xpY2sgPSBhc3luYyAoKSA9PiB7ICQoJyNzYWxlc1JlZnJlc2gnKS5kaXNhYmxlZCA9IHRydWU7IGF3YWl0IHJlbmRlclNhbGVzKHRydWUpOyBpZiAoJCgnI3NhbGVzUmVmcmVzaCcpKSAkKCcjc2FsZXNSZWZyZXNoJykuZGlzYWJsZWQgPSBmYWxzZTsgdG9hc3QoJ1ZlbnRhcyBhY3R1YWxpemFkYXMnKTsgfTsKICBjb25zdCBzaWQgPSBpc0FkbWluID8gc3RvcmUuZ2V0KCdzYWxlc1NlbGxlcicsICcnKSA6ICcnOwogIGxldCBkOwogIHRyeSB7IGQgPSBhd2FpdCBhcGkoYC9hcGkvc2FsZXM/JHtzaWQgPyAnc2VsbGVyX2lkPScgKyBzaWQgKyAnJicgOiAnJ30ke2ZvcmNlID8gJ3JlZnJlc2g9MScgOiAnJ31gKTsgfSBjYXRjaCAoZSkgeyAkKCcjc2FsZXNCb2R5JykuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9InBhbmVsIj48ZGl2IGNsYXNzPSJwYW5lbC1ib2R5Ij4ke2VzYyhlLm1lc3NhZ2UpfTwvZGl2PjwvZGl2PmA7IHJldHVybjsgfQogIGlmICh0YWIgIT09ICdzYWxlcycpIHJldHVybjsKICBpZiAoaXNBZG1pbikgewogICAgJCgnI3NhbGVzUGljaycpLmlubmVySFRNTCA9IGA8c2VsZWN0IGlkPSJzYWxlc1NlbCIgc3R5bGU9IndpZHRoOmF1dG8iPjxvcHRpb24gdmFsdWU9IiI+VG9kYXMgbGFzIGN1ZW50YXM8L29wdGlvbj4ke2Quc2VsbGVycy5tYXAoeCA9PiBgPG9wdGlvbiB2YWx1ZT0iJHt4LmlkfSIgJHtTdHJpbmcoeC5pZCkgPT09IFN0cmluZyhzaWQpID8gJ3NlbGVjdGVkJyA6ICcnfT4ke2VzYyh4Lm5hbWUpfTwvb3B0aW9uPmApLmpvaW4oJycpfTwvc2VsZWN0PmA7CiAgICAkKCcjc2FsZXNTZWwnKS5vbmNoYW5nZSA9IGUgPT4geyBzdG9yZS5zZXQoJ3NhbGVzU2VsbGVyJywgZS50YXJnZXQudmFsdWUpOyByZW5kZXJTYWxlcygpOyB9OwogIH0KICBjb25zdCBkYXlzID0gZC5kYXlzLCB0aSA9IGRheXMubGVuZ3RoIC0gMSwgbWtzID0gWydtbCcsICdmYScsICdwYSddOwogIGNvbnN0IGRheVRvdGFsID0gaSA9PiBta3MucmVkdWNlKChhLCBrKSA9PiBhICsgZC5zZXJpZXNba11baV0uYW1vdW50LCAwKTsKICBjb25zdCBkYXlPcmRlcnMgPSBpID0+IG1rcy5yZWR1Y2UoKGEsIGspID0+IGEgKyBkLnNlcmllc1trXVtpXS5vcmRlcnMsIDApOwogIGNvbnN0IHdlZWtUb3RhbCA9IGRheXMucmVkdWNlKChhLCBfLCBpKSA9PiBhICsgZGF5VG90YWwoaSksIDApLCB3ZWVrT3JkZXJzID0gZGF5cy5yZWR1Y2UoKGEsIF8sIGkpID0+IGEgKyBkYXlPcmRlcnMoaSksIDApOwogIGxldCBiZXN0ID0gMDsgZGF5cy5mb3JFYWNoKChfLCBpKSA9PiB7IGlmIChkYXlUb3RhbChpKSA+IGRheVRvdGFsKGJlc3QpKSBiZXN0ID0gaTsgfSk7CiAgY29uc3QgdXAgPSBkYXlUb3RhbCh0aSAtIDEpID4gMCAmJiBkYXlUb3RhbCh0aSkgPiBkYXlUb3RhbCh0aSAtIDEpID8gTWF0aC5yb3VuZCgoZGF5VG90YWwodGkpIC8gZGF5VG90YWwodGkgLSAxKSAtIDEpICogMTAwKSA6IG51bGw7CiAgY29uc3QgY2hlZXIgPSB1cCA/IGDCoVZhcyAke3VwfSUgYXJyaWJhIGRlIGF5ZXIhIPCfmoBgIDogZGF5T3JkZXJzKHRpKSA/IGDCoVlhIGxsZXZhcyAke2RheU9yZGVycyh0aSl9IHZlbnRhJHtkYXlPcmRlcnModGkpID09PSAxID8gJycgOiAncyd9IGhveSFgIDogJ0VsIGTDrWEgcmVjacOpbiBlbXBpZXphOiB0dXMgdmVudGFzIGRlIGhveSBhcGFyZWNlbiBhcXXDrSc7CiAgY29uc3Qgc3RhY2tzID0gbWtzLm1hcChrID0+ICh7IGtleTogaywgbGFiZWw6IE1LW2tdLCBjb2xvcjogTUtfQ09MT1Jba10sIHZhbHVlczogZC5zZXJpZXNba10gfSkpOwogIGNvbnN0IG1rQ2FyZCA9IGsgPT4gewogICAgY29uc3Qgd2sgPSBkLnNlcmllc1trXS5yZWR1Y2UoKGEsIHgpID0+IGEgKyB4LmFtb3VudCwgMCksIG4gPSBkLnNlcmllc1trXS5yZWR1Y2UoKGEsIHgpID0+IGEgKyB4Lm9yZGVycywgMCk7CiAgICBjb25zdCBvbiA9IGQuY29ubmVjdGVkLmluY2x1ZGVzKGspIHx8IHdrID4gMDsKICAgIHJldHVybiBgPGRpdiBjbGFzcz0icGFuZWwgc2FsZXMtbWsiPjxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj48aSBjbGFzcz0iZG90IiBzdHlsZT0iYmFja2dyb3VuZDoke01LX0NPTE9SW2tdfSI+PC9pPiR7TUtba119PC9oMj48c3BhbiBjbGFzcz0ibXV0ZWQiPiR7b24gPyBgJHttb25leSh3ayl9IMK3ICR7bn0gdmVudGEke24gPT09IDEgPyAnJyA6ICdzJ30gZW4gNyBkw61hc2AgOiAnJ308L3NwYW4+PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9InBhbmVsLWJvZHkiPiR7b24gPyBgPGRpdiBjbGFzcz0iY2gtc2xvdCIgZGF0YS1taz0iJHtrfSIgZGF0YS1oPSIyMDAiPjwvZGl2PmAgOiBgPGRpdiBjbGFzcz0iZW1wdHkiPkNvbmVjdGEgJHtNS1trXX0gZW4gJHtpc0FkbWluID8gJ1ZlbmRlZG9yZXMnIDogJ01pIGN1ZW50YSd9IHBhcmEgdmVyIGFxdcOtIHN1cyB2ZW50YXMuPC9kaXY+YH08L2Rpdj48L2Rpdj5gOwogIH07CiAgJCgnI3NhbGVzQm9keScpLmlubmVySFRNTCA9IGAKICAgIDxkaXYgY2xhc3M9InNhbGVzLWtwaXMiPgogICAgICA8ZGl2IGNsYXNzPSJrcGkga3BpLWhlcm8iPjxzbWFsbD5WZW5kaXN0ZSBob3k8L3NtYWxsPjxiPiR7bW9uZXkoZGF5VG90YWwodGkpKX08L2I+PHNwYW4+JHtkYXlPcmRlcnModGkpfSB2ZW50YSR7ZGF5T3JkZXJzKHRpKSA9PT0gMSA/ICcnIDogJ3MnfSDCtyAke2VzYyhjaGVlcil9PC9zcGFuPjwvZGl2PgogICAgICAke21rcy5tYXAoayA9PiBgPGRpdiBjbGFzcz0ia3BpIj48c21hbGw+PGkgY2xhc3M9ImRvdCIgc3R5bGU9ImJhY2tncm91bmQ6JHtNS19DT0xPUltrXX0iPjwvaT4ke01LW2tdfSBob3k8L3NtYWxsPjxiPiR7bW9uZXkoZC5zZXJpZXNba11bdGldLmFtb3VudCl9PC9iPjxzcGFuPiR7ZC5zZXJpZXNba11bdGldLm9yZGVyc30gdmVudGEke2Quc2VyaWVzW2tdW3RpXS5vcmRlcnMgPT09IDEgPyAnJyA6ICdzJ308L3NwYW4+PC9kaXY+YCkuam9pbignJyl9CiAgICAgIDxkaXYgY2xhc3M9ImtwaSI+PHNtYWxsPsOabHRpbW9zIDcgZMOtYXM8L3NtYWxsPjxiPiR7bW9uZXkod2Vla1RvdGFsKX08L2I+PHNwYW4+JHt3ZWVrT3JkZXJzfSB2ZW50YXMke2RheVRvdGFsKGJlc3QpID4gMCA/IGAgwrcgbWVqb3IgZMOtYTogJHtlc2MoZGF5TG9uZyhkYXlzW2Jlc3RdKS5zcGxpdCgnLCcpWzBdKX0g8J+PhmAgOiAnJ308L3NwYW4+PC9kaXY+CiAgICA8L2Rpdj4KICAgIDxkaXYgY2xhc3M9InBhbmVsIj48ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj48aDI+VG9kb3MgbG9zIG1hcmtldHBsYWNlczwvaDI+PGRpdiBjbGFzcz0ibGVnZW5kIj4ke21rcy5tYXAoayA9PiBgPHNwYW4+PGkgY2xhc3M9ImRvdCIgc3R5bGU9ImJhY2tncm91bmQ6JHtNS19DT0xPUltrXX0iPjwvaT4ke01LW2tdfTwvc3Bhbj5gKS5qb2luKCcnKX08L2Rpdj48L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0icGFuZWwtYm9keSI+PGRpdiBjbGFzcz0iY2gtc2xvdCIgZGF0YS1taz0iYWxsIiBkYXRhLWg9IjI2MCI+PC9kaXY+JHtzYWxlc1RhYmxlKGRheXMsIGQpfTwvZGl2PjwvZGl2PgogICAgPGRpdiBjbGFzcz0ic2FsZXMtZ3JpZCI+JHtta3MubWFwKG1rQ2FyZCkuam9pbignJyl9PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbCIgaWQ9InByb2RQYW5lbCIgc3R5bGU9Im1hcmdpbi10b3A6MTRweCI+PC9kaXY+CiAgICA8cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTIuNXB4O21hcmdpbjoxMHB4IDJweCI+TW9udG9zIHBhZ2Fkb3Mgc2Vnw7puIGNhZGEgbWFya2V0cGxhY2UgKHNpbiBjb3N0byBkZSBlbnbDrW8gZW4gTWVyY2FkbyBMaWJyZSkuIE5vIGluY2x1eWUgdmVudGFzIGNhbmNlbGFkYXMuJHtkLnVwZGF0ZWRBdCA/ICcgQWN0dWFsaXphZG8gJyArIGVzYyhuZXcgRGF0ZShkLnVwZGF0ZWRBdCkudG9Mb2NhbGVUaW1lU3RyaW5nKCdlcy1DTCcsIHsgaG91cjogJ251bWVyaWMnLCBtaW51dGU6ICcyLWRpZ2l0JyB9KSkgKyAnLicgOiAnJ308L3A+YDsKICAvLyBsb3MgZ3LDoWZpY29zIHNlIGRpYnVqYW4gYWwgYW5jaG8gcmVhbCBkZSBzdSBjYWphOiBlbCB0ZXh0byBxdWVkYSBzaWVtcHJlIGRlbCBtaXNtbyB0YW1hw7FvIHkgbGVnaWJsZQogIGNvbnN0IGRyYXcgPSAoKSA9PiAkJCgnLmNoLXNsb3QnKS5mb3JFYWNoKGVsID0+IHsgY29uc3QgdyA9IGVsLmNsaWVudFdpZHRoOyBpZiAoIXcgfHwgZWwuX3cgPT09IHcpIHJldHVybjsgZWwuX3cgPSB3OyBlbC5pbm5lckhUTUwgPSBjb2x1bW5DaGFydChkYXlzLCBlbC5kYXRhc2V0Lm1rID09PSAnYWxsJyA/IHN0YWNrcyA6IFtzdGFja3MuZmluZChzID0+IHMua2V5ID09PSBlbC5kYXRhc2V0Lm1rKV0sIHsgaGVpZ2h0OiArZWwuZGF0YXNldC5oLCB0b2RheTogZC50b2RheSwgd2lkdGg6IHcgfSk7IH0pOwogIGRyYXcoKTsKICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigncmVzaXplJywgcmVuZGVyU2FsZXMuX3JzIHx8ICgoKSA9PiB7fSkpOyByZW5kZXJTYWxlcy5fcnMgPSAoKSA9PiB7IGlmICh0YWIgPT09ICdzYWxlcycpIGRyYXcoKTsgfTsgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHJlbmRlclNhbGVzLl9ycyk7CiAgY29uc3QgdGlwRWwgPSAkKCcjY2hUaXAnKTsKICAkKCcjc2FsZXNCb2R5Jykub25tb3VzZW1vdmUgPSBlID0+IHsKICAgIGNvbnN0IGggPSBlLnRhcmdldC5jbG9zZXN0KCcuY2gtaGl0Jyk7CiAgICBpZiAoIWgpIHsgdGlwRWwuaGlkZGVuID0gdHJ1ZTsgcmV0dXJuOyB9CiAgICBjb25zdCBbdCwgLi4ucmVzdF0gPSBoLmRhdGFzZXQudGlwLnNwbGl0KCd8Jyk7CiAgICB0aXBFbC5pbm5lckhUTUwgPSBgPGI+JHtlc2ModCl9PC9iPiR7cmVzdC5tYXAociA9PiBgPGRpdj4ke2VzYyhyKX08L2Rpdj5gKS5qb2luKCcnKX1gOwogICAgdGlwRWwuaGlkZGVuID0gZmFsc2U7CiAgICBjb25zdCB4ID0gTWF0aC5taW4oZS5jbGllbnRYICsgMTQsIGlubmVyV2lkdGggLSB0aXBFbC5vZmZzZXRXaWR0aCAtIDgpOwogICAgdGlwRWwuc3R5bGUubGVmdCA9IHggKyAncHgnOyB0aXBFbC5zdHlsZS50b3AgPSAoZS5jbGllbnRZICsgMTQpICsgJ3B4JzsKICB9OwogICQoJyNzYWxlc0JvZHknKS5vbm1vdXNlbGVhdmUgPSAoKSA9PiB7IHRpcEVsLmhpZGRlbiA9IHRydWU7IH07CiAgcmVuZGVyUHJvZHVjdHMoKTsKICBjbGVhclRpbWVvdXQocmVuZGVyU2FsZXMuX3QpOyByZW5kZXJTYWxlcy5fdCA9IHNldFRpbWVvdXQoKCkgPT4geyBpZiAodGFiID09PSAnc2FsZXMnKSByZW5kZXJTYWxlcygpOyB9LCA1ICogNjBlMyk7Cn0KCi8vIC0tLS0tLS0tLS0gVkVOREVET1JFUyAoc29sbyBsZWN0dXJhLCBwYXJhIGVsIGZ1bGZpbGxtZW50KSAtLS0tLS0tLS0tCmFzeW5jIGZ1bmN0aW9uIHJlbmRlclNlbGxlcnNWaWV3KCkgewogICQoJyNtYWluJykuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9InNlY3Rpb24tdGl0bGUiIHN0eWxlPSJtYXJnaW4tdG9wOjIycHgiPjxoMj5WZW5kZWRvcmVzPC9oMj48c3BhbiBjbGFzcz0ibXV0ZWQiPlNvbG8gbGVjdHVyYTogcXXDqSBtYXJrZXRwbGFjZXMgdGllbmUgY29uZWN0YWRvcyBjYWRhIHZlbmRlZG9yLjwvc3Bhbj48L2Rpdj48ZGl2IGNsYXNzPSJwYW5lbCI+PGRpdiBpZD0ic3ZCb2R5IiBjbGFzcz0icGFuZWwtYm9keSI+PGRpdiBjbGFzcz0ibXV0ZWQiPkNhcmdhbmRv4oCmPC9kaXY+PC9kaXY+PC9kaXY+YDsKICBjb25zdCB7IHNlbGxlcnM6IGxpc3QgfSA9IGF3YWl0IGFwaSgnL2FwaS9zZWxsZXJzL292ZXJ2aWV3Jyk7CiAgY29uc3QgY29ubiA9IGMgPT4gYDxzcGFuIGNsYXNzPSJtayAke2MubWFya2V0cGxhY2V9Ij4ke01LW2MubWFya2V0cGxhY2VdfTwvc3Bhbj4gPHNwYW4gY2xhc3M9Im5vdGUiIHN0eWxlPSJkaXNwbGF5OmlubGluZSI+JHtjLm9rID8gJ0NvbmVjdGFkbycgOiAnPGIgc3R5bGU9ImNvbG9yOnZhcigtLWxvY2spIj5Db24gcHJvYmxlbWFzPC9iPid9JHtjLmxhc3Rfc3luY19hdCA/ICcgwrcgcmV2aXNhZG8gJyArIGVzYyhmbXRUaW1lKGMubGFzdF9zeW5jX2F0KSkgOiAnJ308L3NwYW4+YDsKICAkKCcjc3ZCb2R5JykuaW5uZXJIVE1MID0gbGlzdC5sZW5ndGggPyBgPGRpdiBjbGFzcz0idGFibGUtd3JhcCI+PHRhYmxlIHN0eWxlPSJtaW4td2lkdGg6NTIwcHgiPjx0aGVhZD48dHI+PHRoPlZlbmRlZG9yPC90aD48dGg+TWFya2V0cGxhY2VzIGNvbmVjdGFkb3M8L3RoPjx0aD5Qb3IgaW1wcmltaXI8L3RoPjx0aD5Qcm9kdWN0b3MgYmxvcXVlYWRvczwvdGg+PC90cj48L3RoZWFkPjx0Ym9keT4KICAgICR7bGlzdC5tYXAocyA9PiBgPHRyPjx0ZD48Yj4ke2VzYyhzLm5hbWUpfTwvYj48L3RkPjx0ZD48ZGl2IGNsYXNzPSJzdGFjayIgc3R5bGU9ImdhcDo2cHgiPiR7cy5jb25uZWN0aW9ucy5tYXAoY29ubikuam9pbignJykgfHwgJzxzcGFuIGNsYXNzPSJtdXRlZCI+U2luIG1hcmtldHBsYWNlcyBjb25lY3RhZG9zPC9zcGFuPid9PC9kaXY+PC90ZD48dGQ+JHtzLnBlbmRpbmd9PC90ZD48dGQ+JHtzLmJsb2NrZWR9PC90ZD48L3RyPmApLmpvaW4oJycpfQogICAgPC90Ym9keT48L3RhYmxlPjwvZGl2PmAgOiBgPGRpdiBjbGFzcz0iZW1wdHkiPiR7RU1QVFlfU1ZHfTxkaXY+QcO6biBubyBoYXkgdmVuZGVkb3Jlcy48L2Rpdj48L2Rpdj5gOwp9CgpmdW5jdGlvbiBzdGFydENsb2NrKCkgewogIGNvbnN0IFtoaCwgbW1dID0gbWUuY3V0b2ZmLnNwbGl0KCc6JykubWFwKE51bWJlcik7CiAgY29uc3QgdGljayA9ICgpID0+IHsKICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCksIGN1dCA9IG5ldyBEYXRlKG5vdyk7IGN1dC5zZXRIb3VycyhoaCwgbW0sIDAsIDApOwogICAgY29uc3QgYyA9ICQoJyNjbG9jaycpOyBpZiAoIWMpIHJldHVybjsKICAgIGlmIChub3cgPj0gY3V0KSB7IGN1dC5zZXREYXRlKGN1dC5nZXREYXRlKCkgKyAxKTsgYy5jbGFzc0xpc3QuYWRkKCdsYXRlJyk7IH0gZWxzZSBjLmNsYXNzTGlzdC5yZW1vdmUoJ2xhdGUnKTsKICAgIGNvbnN0IGQgPSBNYXRoLmZsb29yKChjdXQgLSBub3cpIC8gMTAwMCk7CiAgICAkKCcjY2QnKS50ZXh0Q29udGVudCA9IFtNYXRoLmZsb29yKGQgLyAzNjAwKSwgTWF0aC5mbG9vcihkICUgMzYwMCAvIDYwKSwgZCAlIDYwXS5tYXAoeCA9PiBTdHJpbmcoeCkucGFkU3RhcnQoMiwgJzAnKSkuam9pbignOicpOwogIH07CiAgdGljaygpOyBjbGVhckludGVydmFsKHN0YXJ0Q2xvY2suX2kpOyBzdGFydENsb2NrLl9pID0gc2V0SW50ZXJ2YWwodGljaywgMTAwMCk7Cn0KCmxldCBlcyA9IG51bGwsIHJlZnJlc2hUID0gbnVsbDsKZnVuY3Rpb24gY29ubmVjdFN0cmVhbSgpIHsKICBpZiAoZXMpIGVzLmNsb3NlKCk7CiAgZXMgPSBuZXcgRXZlbnRTb3VyY2UoJy9hcGkvc3RyZWFtJyk7CiAgY29uc3QgbGl2ZSA9IG9uID0+IHsgY29uc3QgbCA9ICQoJyNsaXZlJyk7IGlmICghbCkgcmV0dXJuOyBsLmNsYXNzTGlzdC50b2dnbGUoJ29uJywgb24pOyBsLmxhc3RFbGVtZW50Q2hpbGQudGV4dENvbnRlbnQgPSBvbiA/ICdFbiB2aXZvJyA6ICdSZWNvbmVjdGFuZG/igKYnOyB9OwogIGVzLm9ub3BlbiA9ICgpID0+IGxpdmUodHJ1ZSk7CiAgZXMub25lcnJvciA9ICgpID0+IGxpdmUoZmFsc2UpOwogIGVzLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGV2ID0+IHsKICAgIGNvbnN0IGQgPSBKU09OLnBhcnNlKGV2LmRhdGEpOwogICAgY2xlYXJUaW1lb3V0KHJlZnJlc2hUKTsKICAgIHJlZnJlc2hUID0gc2V0VGltZW91dCgoKSA9PiB7IGlmICh0YWIgPT09ICd0cmF5JykgbG9hZE9yZGVycygpOyBlbHNlIGlmICh0YWIgPT09ICdzZWxsZXInICYmIFsnb3JkZXInLCAnbGFiZWwnLCAnYmxvY2tsaXN0JywgJ2Nvbm5lY3Rpb24nLCAncHJpbnRlZCddLmluY2x1ZGVzKGQudHlwZSkpIGxvYWRTZWxsZXJPcmRlcnMoKTsgfSwgNjAwKTsKICB9KTsKfQoKLy8gLS0tLS0tLS0tLSBCQU5ERUpBIChmdWxmaWxsbWVudCkgLS0tLS0tLS0tLQovLyAtLS0tLS0tLS0tIEJBTkRFSkEgKGZ1bGZpbGxtZW50KSAtLS0tLS0tLS0tCmNvbnN0IFRBQlMgPSBbCiAgWyd0b2RheScsICdQYXJhIGltcHJpbWlyIGhveScsICdTYWxlbiBob3kgKGluY2x1eWUgRmxleCknLCBJLnByaW50XSwKICBbJ3VwY29taW5nJywgJ1Byw7N4aW1vcyBkw61hcycsICdTZSBkZXNwYWNoYW4gbcOhcyBhZGVsYW50ZScsIEkuYm94XSwKICBbJ3dhaXRpbmcnLCAnRXNwZXJhbmRvIGV0aXF1ZXRhJywgJ0VsIG1hcmtldHBsYWNlIGHDum4gbm8gbGEgbGliZXJhJywgSS5jbG9ja10sCiAgWydwcmludGVkJywgJ0V0aXF1ZXRhcyBpbXByZXNhcycsICdJbXByZXNhcyBvIHlhIGVudmlhZGFzJywgSS5jaGVja10sCiAgWydibG9ja2VkJywgJ0Jsb3F1ZWFkYXMnLCAnTnVtZXJhZGFzOiBOwrAgMSwgMiwgM+KApicsIEkubG9ja10sCl07CmNvbnN0IGVuZE9mVG9kYXkgPSAoKSA9PiB7IGNvbnN0IGQgPSBuZXcgRGF0ZSgpOyBkLnNldEhvdXJzKDIzLCA1OSwgNTksIDk5OSk7IHJldHVybiBkOyB9OwpmdW5jdGlvbiBkaXNwYXRjaERhdGUobykgeyBjb25zdCBzID0gby5kaXNwYXRjaF9ieTsgaWYgKCFzKSByZXR1cm4gbnVsbDsgY29uc3QgZCA9IG5ldyBEYXRlKHMuaW5jbHVkZXMoJ1QnKSA/IHMgOiBzLnJlcGxhY2UoJyAnLCAnVCcpKTsgcmV0dXJuIGlzTmFOKGQpID8gbnVsbCA6IGQ7IH0KY29uc3QgaXNGb3JUb2RheSA9IG8gPT4geyBjb25zdCBkID0gZGlzcGF0Y2hEYXRlKG8pOyByZXR1cm4gIWQgfHwgZCA8PSBlbmRPZlRvZGF5KCk7IH07CmNvbnN0IHRhYk9mID0gbyA9PiAoby5zdGF0ZSA9PT0gJ3JlYWR5JyA/IChpc0ZvclRvZGF5KG8pID8gJ3RvZGF5JyA6ICd1cGNvbWluZycpIDogby5zdGF0ZSA9PT0gJ2Vycm9yJyA/ICd3YWl0aW5nJyA6IG8uc3RhdGUgPT09ICdzaGlwcGVkJyA/ICdwcmludGVkJyA6IG8uc3RhdGUgPT09ICdjYW5jZWxsZWQnID8gbnVsbCA6IG8uc3RhdGUpOwpmdW5jdGlvbiBkaXNwYXRjaFRleHQobykgewogIGNvbnN0IGQgPSBkaXNwYXRjaERhdGUobyk7IGlmICghZCkgcmV0dXJuICcnOwogIGNvbnN0IHRvZGF5ID0gbmV3IERhdGUoKTsgdG9kYXkuc2V0SG91cnMoMCwgMCwgMCwgMCk7CiAgY29uc3QgZGF5ID0gbmV3IERhdGUoZCk7IGRheS5zZXRIb3VycygwLCAwLCAwLCAwKTsKICBjb25zdCBkaWZmID0gTWF0aC5yb3VuZCgoZGF5IC0gdG9kYXkpIC8gODY0ZTUpOwogIGNvbnN0IGggPSBoaG1tKGQpOwogIGlmIChkaWZmIDwgMCkgcmV0dXJuIGBBdHJhc2FkYSDCtyBkZWLDrWEgc2FsaXIgZWwgJHtkLnRvTG9jYWxlRGF0ZVN0cmluZygnZXMtQ0wnLCB7IGRheTogJ251bWVyaWMnLCBtb250aDogJ3Nob3J0JyB9KX1gOwogIGlmIChkaWZmID09PSAwKSByZXR1cm4gaCA9PT0gJzIzOjU5JyB8fCBoID09PSAnMDA6MDAnID8gJ0Rlc3BhY2hhciBob3knIDogKGQgPCBuZXcgRGF0ZSgpID8gYERlc3BhY2hhciBob3kgwrcgY29ydGUgJHthbXBtKGQpfWAgOiBgRGVzcGFjaGFyIGhveSBhbnRlcyBkZSBsYXMgJHthbXBtKGQpfWApOwogIGlmIChkaWZmID09PSAxKSByZXR1cm4gYERlc3BhY2hhciBtYcOxYW5hJHtoID09PSAnMjM6NTknIHx8IGggPT09ICcwMDowMCcgPyAnJyA6ICcgYW50ZXMgZGUgbGFzICcgKyBhbXBtKGQpfWA7CiAgcmV0dXJuIGBEZXNwYWNoYXIgZWwgJHtkLnRvTG9jYWxlRGF0ZVN0cmluZygnZXMtQ0wnLCB7IHdlZWtkYXk6ICdsb25nJywgZGF5OiAnbnVtZXJpYycsIG1vbnRoOiAnc2hvcnQnIH0pfWA7Cn0KZnVuY3Rpb24gdHMobykgewogIGNvbnN0IHMgPSBvLnNvbGRfYXQgfHwgJyc7CiAgaWYgKHMpIHsgY29uc3QgZCA9IG5ldyBEYXRlKHMuaW5jbHVkZXMoJ1QnKSA/IHMgOiBzLnJlcGxhY2UoJyAnLCAnVCcpKTsgaWYgKCFpc05hTihkKSkgcmV0dXJuIGQ7IH0KICByZXR1cm4gbmV3IERhdGUoKG8uY3JlYXRlZF9hdCB8fCAnJykucmVwbGFjZSgnICcsICdUJykgKyAnWicpOwp9CmZ1bmN0aW9uIGRheUxhYmVsKGQpIHsKICBjb25zdCB0b2RheSA9IG5ldyBEYXRlKCk7IHRvZGF5LnNldEhvdXJzKDAsIDAsIDAsIDApOwogIGNvbnN0IHggPSBuZXcgRGF0ZShkKTsgeC5zZXRIb3VycygwLCAwLCAwLCAwKTsKICBjb25zdCBkaWZmID0gTWF0aC5yb3VuZCgodG9kYXkgLSB4KSAvIDg2NGU1KTsKICBjb25zdCBmID0gZC50b0xvY2FsZURhdGVTdHJpbmcoJ2VzLUNMJywgeyB3ZWVrZGF5OiAnbG9uZycsIGRheTogJ251bWVyaWMnLCBtb250aDogJ2xvbmcnIH0pOwogIHJldHVybiBkaWZmID09PSAwID8gYEhveSDCtyAke2Z9YCA6IGRpZmYgPT09IDEgPyBgQXllciDCtyAke2Z9YCA6IGYuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBmLnNsaWNlKDEpOwp9CmNvbnN0IGhobW0gPSBkID0+IGQudG9Mb2NhbGVUaW1lU3RyaW5nKCdlcy1DTCcsIHsgaG91cjogJzItZGlnaXQnLCBtaW51dGU6ICcyLWRpZ2l0JywgaG91ckN5Y2xlOiAnaDIzJyB9KTsKY29uc3QgYW1wbSA9IGQgPT4geyBjb25zdCBoID0gZC5nZXRIb3VycygpLCBtID0gU3RyaW5nKGQuZ2V0TWludXRlcygpKS5wYWRTdGFydCgyLCAnMCcpOyByZXR1cm4gYCR7aCAlIDEyIHx8IDEyfToke219ICR7aCA8IDEyID8gJ0FNJyA6ICdQTSd9YDsgfTsKCmZ1bmN0aW9uIHJlbmRlclRyYXkoKSB7CiAgaWYgKCF1aS50YWIgfHwgdWkudGFiID09PSAncmVhZHknKSB1aS50YWIgPSAndG9kYXknOwogIGNvbnN0IGF1dG8gPSBzdG9yZS5nZXQoJ2F1dG8nLCBmYWxzZSk7CiAgJCgnI21haW4nKS5pbm5lckhUTUwgPSBgCiAgPGRpdiBjbGFzcz0ic2VjdGlvbi10aXRsZSIgc3R5bGU9Im1hcmdpbi10b3A6MjJweCI+PGgyPkV0aXF1ZXRhczwvaDI+PHNwYW4gY2xhc3M9Im11dGVkIj5MYXMgbcOhcyBudWV2YXMgYXJyaWJhLiBTZSBhY3R1YWxpemEgc29sYS48L3NwYW4+PC9kaXY+CiAgPGRpdiBjbGFzcz0idGFic2JpZyIgaWQ9InRhYnNCaWciPjwvZGl2PgogIDxkaXYgY2xhc3M9InBhbmVsIj4KICAgIDxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPgogICAgICA8ZGl2IGNsYXNzPSJjaGlwcyIgaWQ9Im1rQ2hpcHMiPjwvZGl2PgogICAgICA8c2VsZWN0IGlkPSJzZWxsZXJGIiBhcmlhLWxhYmVsPSJWZW5kZWRvciIgc3R5bGU9IndpZHRoOmF1dG8iPjwvc2VsZWN0PgogICAgICA8aW5wdXQgdHlwZT0ic2VhcmNoIiBpZD0icSIgcGxhY2Vob2xkZXI9IkJ1c2NhciBjbGllbnRlLCBwZWRpZG8gbyBTS1UiIHZhbHVlPSIke2VzYyh1aS5xKX0iIGFyaWEtbGFiZWw9IkJ1c2NhciIgc3R5bGU9IndpZHRoOmF1dG87bWluLXdpZHRoOjIyMHB4Ij4KICAgICAgPHNwYW4gY2xhc3M9InNwYWNlciIgc3R5bGU9ImZsZXg6MSI+PC9zcGFuPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWdob3N0IGJ0bi1zbSIgaWQ9InN5bmNOb3ciPiR7SS5zeW5jfUJ1c2NhciBwZWRpZG9zIGFob3JhPC9idXR0b24+CiAgICA8L2Rpdj4KICAgIDxkaXYgY2xhc3M9ImFjdGlvbmJhciIgaWQ9ImFjdGlvbmJhciI+PC9kaXY+CiAgICA8ZGl2IGlkPSJsaXN0Ij48L2Rpdj4KICA8L2Rpdj4KICA8ZGl2IGNsYXNzPSJhdXRvYmFyIiBzdHlsZT0ibWFyZ2luLXRvcDoxNnB4IiAke21lLnVzZXIucm9sZSA9PT0gJ3NlbGxlcicgPyAnaGlkZGVuJyA6ICcnfT4KICAgIDxkaXY+PGxhYmVsIGNsYXNzPSJzd2l0Y2giPjxpbnB1dCB0eXBlPSJjaGVja2JveCIgaWQ9ImF1dG9EbCIgJHthdXRvID8gJ2NoZWNrZWQnIDogJyd9PiBEZXNjYXJnYSBhdXRvbcOhdGljYTwvbGFiZWw+CiAgICA8cD5NaWVudHJhcyBlc3RhIHBhbnRhbGxhIGVzdMOpIGFiaWVydGEsIGNhZGEgZXRpcXVldGEgbnVldmEgc2UgZGVzY2FyZ2Egc29sYSBlbiBQREYgeSBwYXNhIGEgIkltcHJlc2FzIi4gTGEgcHJpbWVyYSB2ZXogZWwgbmF2ZWdhZG9yIHB1ZWRlIHBlZGlyIHBlcm1pc28gcGFyYSBkZXNjYXJnYXIgdmFyaW9zIGFyY2hpdm9zLjwvcD48L2Rpdj4KICA8L2Rpdj5gOwogICQoJyNhdXRvRGwnKS5vbmNoYW5nZSA9IGUgPT4geyBzdG9yZS5zZXQoJ2F1dG8nLCBlLnRhcmdldC5jaGVja2VkKTsgdG9hc3QoZS50YXJnZXQuY2hlY2tlZCA/ICdEZXNjYXJnYSBhdXRvbcOhdGljYSBhY3RpdmFkYScgOiAnRGVzY2FyZ2EgYXV0b23DoXRpY2EgZGVzYWN0aXZhZGEnKTsgaWYgKGUudGFyZ2V0LmNoZWNrZWQpIGF1dG9Eb3dubG9hZCgpOyB9OwogICQoJyNzeW5jTm93Jykub25jbGljayA9IGFzeW5jICgpID0+IHsgYXdhaXQgYXBpKCcvYXBpL3N5bmMnLCB7IG1ldGhvZDogJ1BPU1QnIH0pOyB0b2FzdCgnQnVzY2FuZG8gcGVkaWRvcyBudWV2b3MgZW4gbG9zIG1hcmtldHBsYWNlc+KApicpOyB9OwogICQoJyN0YWJzQmlnJykub25jbGljayA9IGUgPT4geyBjb25zdCBiID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtdGFiMl0nKTsgaWYgKCFiKSByZXR1cm47IHVpLnRhYiA9IGIuZGF0YXNldC50YWIyOyBzZWxlY3RlZC5jbGVhcigpOyBkcmF3Um93cygpOyB9OwogICQoJyNta0NoaXBzJykub25jbGljayA9IGUgPT4geyBjb25zdCBiID0gZS50YXJnZXQuY2xvc2VzdCgnLmNoaXAnKTsgaWYgKCFiKSByZXR1cm47IHVpLm1rID0gYi5kYXRhc2V0Lm1rOyBkcmF3Um93cygpOyB9OwogICQoJyNzZWxsZXJGJykub25jaGFuZ2UgPSBlID0+IHsgdWkuc2VsbGVyID0gZS50YXJnZXQudmFsdWU7IGRyYXdSb3dzKCk7IH07CiAgJCgnI3EnKS5vbmlucHV0ID0gZSA9PiB7IHVpLnEgPSBlLnRhcmdldC52YWx1ZS50cmltKCkudG9Mb3dlckNhc2UoKTsgZHJhd1Jvd3MoKTsgfTsKICAkKCcjbGlzdCcpLm9uY2hhbmdlID0gZSA9PiB7IGNvbnN0IGlkID0gZS50YXJnZXQuZGF0YXNldC5pZDsgaWYgKCFpZCkgcmV0dXJuOyBlLnRhcmdldC5jaGVja2VkID8gc2VsZWN0ZWQuYWRkKCtpZCkgOiBzZWxlY3RlZC5kZWxldGUoK2lkKTsgZHJhd0FjdGlvbmJhcigpOyB9OwogICQoJyNsaXN0Jykub25jbGljayA9IGFzeW5jIGUgPT4gewogICAgY29uc3QgYiA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLWFjdF0nKTsgaWYgKCFiKSByZXR1cm47CiAgICBjb25zdCBpZCA9ICtiLmRhdGFzZXQuaWQ7CiAgICBpZiAoYi5kYXRhc2V0LmFjdCA9PT0gJ3ByaW50JykgeyBpZiAobWUudXNlci5yb2xlID09PSAnc2VsbGVyJyAmJiAhY29uZmlybSgnU2kgbGEgaW1wcmltZXMgdMO6LCBxdWVkYSBjb21vIGltcHJlc2EgcG9yIHR1IHRpZW5kYSB5IGVsIGZ1bGZpbGxtZW50IGxhIHZlcsOhIGVuIHJvam8gY29tbyAiRXRpcXVldGEgaW1wcmVzYSIuIMK/SW1wcmltaXI/JykpIHJldHVybjsgd2luZG93Lm9wZW4oYC9hcGkvb3JkZXJzLyR7aWR9L2xhYmVsLnBkZj9tYXJrPTFgLCAnX2JsYW5rJyk7IHNldFRpbWVvdXQobG9hZE9yZGVycywgMTIwMCk7IHRvYXN0KCdFdGlxdWV0YSBhYmllcnRhIMK3IHBhc8OzIGEgIkV0aXF1ZXRhcyBpbXByZXNhcyInKTsgfQogICAgaWYgKGIuZGF0YXNldC5hY3QgPT09ICdyZXByaW50Jykgd2luZG93Lm9wZW4oYC9hcGkvb3JkZXJzLyR7aWR9L2xhYmVsLnBkZmAsICdfYmxhbmsnKTsKICAgIGlmIChiLmRhdGFzZXQuYWN0ID09PSAncmV0cnknKSB7IGIuZGlzYWJsZWQgPSB0cnVlOyB0cnkgeyBhd2FpdCBhcGkoYC9hcGkvb3JkZXJzLyR7aWR9L3JldHJ5YCwgeyBtZXRob2Q6ICdQT1NUJyB9KTsgdG9hc3QoJ1JlaW50ZW50YW5kb+KApicpOyBsb2FkT3JkZXJzKCk7IH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IH0gfQogICAgaWYgKGIuZGF0YXNldC5hY3QgPT09ICd1bmJsb2NrJykgewogICAgICBpZiAoIWNvbmZpcm0oJ8K/RGVzYmxvcXVlYXIgZXN0YSBldGlxdWV0YT8gUGFzYSBhICJQb3IgaW1wcmltaXIiLiBFbiBsYSBob2phIGRlbCBwZWRpZG8gc2FsZHLDoSBzdSBuw7ptZXJvIHkgcXVlZGFyw6FuIG1hcmNhZG9zIGNvbiAiRkFMVEEiIGxvcyBwcm9kdWN0b3MgcXVlIHNlIHJlbGxlbmFuIGFwYXJ0ZS4nKSkgcmV0dXJuOwogICAgICBiLmRpc2FibGVkID0gdHJ1ZTsgdHJ5IHsgYXdhaXQgYXBpKGAvYXBpL29yZGVycy8ke2lkfS91bmJsb2NrYCwgeyBtZXRob2Q6ICdQT1NUJyB9KTsgdG9hc3QoJ0V0aXF1ZXRhIGRlc2Jsb3F1ZWFkYScpOyBsb2FkT3JkZXJzKCk7IH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IGIuZGlzYWJsZWQgPSBmYWxzZTsgfQogICAgfQogICAgaWYgKGIuZGF0YXNldC5hY3QgPT09ICdyZWJsb2NrJykgeyB0cnkgeyBhd2FpdCBhcGkoYC9hcGkvb3JkZXJzLyR7aWR9L3JlYmxvY2tgLCB7IG1ldGhvZDogJ1BPU1QnIH0pOyB0b2FzdCgnRXRpcXVldGEgYmxvcXVlYWRhIG90cmEgdmV6Jyk7IGxvYWRPcmRlcnMoKTsgfSBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlKTsgfSB9CiAgICBpZiAoYi5kYXRhc2V0LmFjdCA9PT0gJ3VucHJpbnQnKSB7IGF3YWl0IGFwaShgL2FwaS9vcmRlcnMvJHtpZH0vdW5wcmludGAsIHsgbWV0aG9kOiAnUE9TVCcgfSk7IHRvYXN0KCdWb2x2acOzIGEgIkV0aXF1ZXRhcyBwb3IgaW1wcmltaXIiJyk7IGxvYWRPcmRlcnMoKTsgfQogIH07CiAgJCgnI2FjdGlvbmJhcicpLm9uY2xpY2sgPSBlID0+IHsKICAgIGNvbnN0IGIgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1idWxrXScpOyBpZiAoIWIpIHJldHVybjsKICAgIGlmIChiLmRhdGFzZXQuYnVsayA9PT0gJ2FsbCcpIGRvd25sb2FkQmF0Y2godmlzaWJsZUluKHVpLnRhYikubWFwKG8gPT4gby5pZCkpOwogICAgaWYgKGIuZGF0YXNldC5idWxrID09PSAnc2VsJykgZG93bmxvYWRCYXRjaChbLi4uc2VsZWN0ZWRdKTsKICAgIGlmIChiLmRhdGFzZXQuYnVsayA9PT0gJ3NlbGFsbCcpIHsgdmlzaWJsZUluKHVpLnRhYikuZm9yRWFjaChvID0+IHNlbGVjdGVkLmFkZChvLmlkKSk7IGRyYXdSb3dzKCk7IH0KICAgIGlmIChiLmRhdGFzZXQuYnVsayA9PT0gJ25vbmUnKSB7IHNlbGVjdGVkLmNsZWFyKCk7IGRyYXdSb3dzKCk7IH0KICB9OwogIGxvYWRPcmRlcnMoKTsKfQoKYXN5bmMgZnVuY3Rpb24gbG9hZE9yZGVycygpIHsKICBpZiAodGFiICE9PSAndHJheScpIHJldHVybjsKICBjb25zdCBkID0gYXdhaXQgYXBpKCcvYXBpL29yZGVycz92aWV3PWFsbCcpOwogIGNvbnN0IHByZXZSZWFkeSA9IG5ldyBTZXQob3JkZXJzLmZpbHRlcihvID0+IG8uc3RhdGUgPT09ICdyZWFkeScpLm1hcChvID0+IG8uaWQpKTsKICBvcmRlcnMgPSBkLm9yZGVycy5zb3J0KChhLCBiKSA9PiB0cyhiKSAtIHRzKGEpKTsKICBzZWxsZXJzID0gZC5zZWxsZXJzOwogIGNvbnN0IHNmID0gJCgnI3NlbGxlckYnKTsKICBpZiAoc2YpIHsgc2YuaW5uZXJIVE1MID0gYDxvcHRpb24gdmFsdWU9ImFsbCI+VG9kb3MgbG9zIHZlbmRlZG9yZXM8L29wdGlvbj5gICsgc2VsbGVycy5tYXAocyA9PiBgPG9wdGlvbiB2YWx1ZT0iJHtzLmlkfSI+JHtlc2Mocy5uYW1lKX08L29wdGlvbj5gKS5qb2luKCcnKTsgc2YudmFsdWUgPSB1aS5zZWxsZXI7IH0KICBjb25zdCBmcmVzaCA9IG9yZGVycy5maWx0ZXIobyA9PiBvLnN0YXRlID09PSAncmVhZHknICYmICFwcmV2UmVhZHkuaGFzKG8uaWQpKS5tYXAobyA9PiBvLmlkKTsKICBkcmF3Um93cyhmaXJzdExvYWQgPyBbXSA6IGZyZXNoKTsKICBpZiAoIWZpcnN0TG9hZCAmJiBmcmVzaC5sZW5ndGgpIHRvYXN0KGAke2ZyZXNoLmxlbmd0aH0gZXRpcXVldGEke2ZyZXNoLmxlbmd0aCA+IDEgPyAncycgOiAnJ30gbnVldmEke2ZyZXNoLmxlbmd0aCA+IDEgPyAncycgOiAnJ30gcG9yIGltcHJpbWlyYCk7CiAgZmlyc3RMb2FkID0gZmFsc2U7CiAgaWYgKHN0b3JlLmdldCgnYXV0bycsIGZhbHNlKSkgYXV0b0Rvd25sb2FkKCk7Cn0KCmNvbnN0IG1hdGNoZXNGaWx0ZXJzID0gbyA9PiAodWkubWsgPT09ICdhbGwnIHx8IG8ubWFya2V0cGxhY2UgPT09IHVpLm1rKSAmJiAodWkuc2VsbGVyID09PSAnYWxsJyB8fCBTdHJpbmcoby5zZWxsZXJfaWQpID09PSB1aS5zZWxsZXIpICYmCiAgKCF1aS5xIHx8IG8ub3JkZXJfbnVtYmVyLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXModWkucSkgfHwgKG8uY3VzdG9tZXIgfHwgJycpLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXModWkucSkgfHwgby5pdGVtcy5zb21lKGkgPT4gW2kuc2t1LCBpLnB1Yl9pZCwgaS5uYW1lXS5qb2luKCcgJykudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyh1aS5xKSkpOwpjb25zdCB2aXNpYmxlSW4gPSB0ID0+IG9yZGVycy5maWx0ZXIobyA9PiB0YWJPZihvKSA9PT0gdCAmJiBtYXRjaGVzRmlsdGVycyhvKSk7Ci8vIEVuICJQb3IgaW1wcmltaXIiIHRhbWJpw6luIHNlIHF1ZWRhbiBsYXMgcXVlIHNlIGltcHJpbWllcm9uIGVuIGxhcyDDumx0aW1hcyAxMiBob3JhcywgZW4gcm9qbyBjb24gIlZvbHZlciBhIGltcHJpbWlyIgpjb25zdCBwcmludGVkUmVjZW50bHkgPSBvID0+IG8uc3RhdGUgPT09ICdwcmludGVkJyAmJiBvLnByaW50ZWRfYXQgJiYgRGF0ZS5ub3coKSAtIG5ldyBEYXRlKG8ucHJpbnRlZF9hdC5yZXBsYWNlKCcgJywgJ1QnKSArICdaJykgPCAxMiAqIDM2MDBlMzsKZnVuY3Rpb24gdmlzaWJsZSgpIHsKICBpZiAodWkudGFiID09PSAndG9kYXknKSByZXR1cm4gb3JkZXJzLmZpbHRlcihvID0+ICgoby5zdGF0ZSA9PT0gJ3JlYWR5JyAmJiBpc0ZvclRvZGF5KG8pKSB8fCBwcmludGVkUmVjZW50bHkobykpICYmIG1hdGNoZXNGaWx0ZXJzKG8pKTsKICByZXR1cm4gdmlzaWJsZUluKHVpLnRhYik7Cn0KCmZ1bmN0aW9uIGl0ZW1zSFRNTChvKSB7CiAgY29uc3QgYmFkID0gbmV3IFNldChvLm1pc3NpbmdfaWR4IHx8IFtdKTsKICBjb25zdCBtaXhlZCA9IGJhZC5zaXplID4gMDsgLy8gcGVkaWRvIGNvbiBwcm9kdWN0b3MgYmxvcXVlYWRvczogcm9qbyA9IG5vIGxvIHRpZW5lIGVsIGZ1bGZpbGxtZW50LCB2ZXJkZSA9IHPDrSBsbyB0aWVuZQogIHJldHVybiBgPGRpdiBjbGFzcz0iaXRlbXMiPiR7by5pdGVtcy5tYXAoKGksIG4pID0+IGA8c3BhbiBjbGFzcz0iJHtiYWQuaGFzKG4pID8gJ2JhZCcgOiAnZ29vZCd9Ij4ke2JhZC5oYXMobikgPyAnPGVtIGNsYXNzPSJmYWx0YSI+RkFMVEE8L2VtPiAnIDogbWl4ZWQgPyAnPGVtIGNsYXNzPSJ0aWVuZSI+VElFTkU8L2VtPiAnIDogJyd9PGI+JHtlc2MoaS5xdHkpfcOXPC9iPiAke2VzYyhpLm5hbWUpfSR7aS52YXJpYW50ID8gYCA8c3BhbiBjbGFzcz0idiI+wrcgJHtlc2MoaS52YXJpYW50KX08L3NwYW4+YCA6ICcnfSA8c3BhbiBjbGFzcz0ibW9ubyB2Ij4ke2VzYyhpLnNrdSB8fCBpLnB1Yl9pZCl9PC9zcGFuPjwvc3Bhbj5gKS5qb2luKCcnKX08L2Rpdj5gOwp9CmZ1bmN0aW9uIHBpbGwobykgeyByZXR1cm4gYDxzcGFuIGNsYXNzPSJwaWxsICR7by5zdGF0ZX0iPiR7cGlsbEljb25bby5zdGF0ZV0gfHwgJyd9JHtTVEFURVtvLnN0YXRlXSB8fCBvLnN0YXRlfTwvc3Bhbj5gOyB9CgpmdW5jdGlvbiBkcmF3Um93cyhmcmVzaCA9IFtdKSB7CiAgaWYgKCEkKCcjdGFic0JpZycpKSByZXR1cm47CiAgY29uc3QgaW5UYWIgPSB0ID0+IG9yZGVycy5maWx0ZXIobyA9PiB0YWJPZihvKSA9PT0gdCAmJiAodWkubWsgPT09ICdhbGwnIHx8IG8ubWFya2V0cGxhY2UgPT09IHVpLm1rKSAmJiAodWkuc2VsbGVyID09PSAnYWxsJyB8fCBTdHJpbmcoby5zZWxsZXJfaWQpID09PSB1aS5zZWxsZXIpKTsKICAkKCcjdGFic0JpZycpLmlubmVySFRNTCA9IFRBQlMubWFwKChbaywgbiwgc3ViLCBpY10pID0+IGA8YnV0dG9uIGNsYXNzPSJ0YiB0Yi0ke2t9IiBkYXRhLXRhYjI9IiR7a30iIGFyaWEtcHJlc3NlZD0iJHt1aS50YWIgPT09IGt9Ij48c3BhbiBjbGFzcz0idGItaWMiPiR7aWN9PC9zcGFuPjxzcGFuPjxiPiR7aW5UYWIoaykubGVuZ3RofTwvYj48c3BhbiBjbGFzcz0idGItbiI+JHtufTwvc3Bhbj48c21hbGw+JHtzdWJ9PC9zbWFsbD48L3NwYW4+PC9idXR0b24+YCkuam9pbignJyk7CiAgY29uc3QgbWtDb3VudCA9IG1rID0+IG9yZGVycy5maWx0ZXIobyA9PiB0YWJPZihvKSA9PT0gdWkudGFiICYmIChtayA9PT0gJ2FsbCcgfHwgby5tYXJrZXRwbGFjZSA9PT0gbWspKS5sZW5ndGg7CiAgJCgnI21rQ2hpcHMnKS5pbm5lckhUTUwgPSBbWydhbGwnLCAnVG9kb3MnXSwgWydtbCcsICdNZXJjYWRvIExpYnJlJ10sIFsnZmEnLCAnRmFsYWJlbGxhJ10sIFsncGEnLCAnUGFyaXMnXV0ubWFwKChbaywgbl0pID0+IGA8YnV0dG9uIGNsYXNzPSJjaGlwIiBkYXRhLW1rPSIke2t9IiBhcmlhLXByZXNzZWQ9IiR7dWkubWsgPT09IGt9Ij4ke259IDxzcGFuIGNsYXNzPSJjbnQiPiR7bWtDb3VudChrKX08L3NwYW4+PC9idXR0b24+YCkuam9pbignJyk7CiAgY29uc3Qgcm93cyA9IHZpc2libGUoKTsKICBpZiAoIXJvd3MubGVuZ3RoKSB7CiAgICBjb25zdCBtc2cgPSB7IHRvZGF5OiAnTm8gaGF5IGV0aXF1ZXRhcyBwb3IgaW1wcmltaXIgcGFyYSBob3kuIExhcyB2ZW50YXMgbnVldmFzICh5IGxvcyBGbGV4IHF1ZSBlbnRyZW4gZHVyYW50ZSBlbCBkw61hKSBhcGFyZWNlbiBhcXXDrSBzb2xhcy4nLCB1cGNvbWluZzogJ05vIGhheSBldGlxdWV0YXMgcGFyYSBsb3MgcHLDs3hpbW9zIGTDrWFzLicsIHdhaXRpbmc6ICdOaW5ndW5hIHZlbnRhIGVzdMOhIGVzcGVyYW5kbyBldGlxdWV0YS4nLCBwcmludGVkOiAnQcO6biBubyBoYXkgZXRpcXVldGFzIGltcHJlc2FzIGVuIGxvcyDDumx0aW1vcyA3IGTDrWFzLicsIGJsb2NrZWQ6ICdObyBoYXkgcGVkaWRvcyBibG9xdWVhZG9zLicgfVt1aS50YWJdOwogICAgJCgnI2xpc3QnKS5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz0iZW1wdHkiPiR7RU1QVFlfU1ZHfTxkaXY+JHttc2d9PC9kaXY+PC9kaXY+YDsKICAgIGRyYXdBY3Rpb25iYXIoKTsgcmV0dXJuOwogIH0KICBsZXQgbGFzdERheSA9ICcnLCBodG1sID0gJyc7CiAgZm9yIChjb25zdCBvIG9mIHJvd3MpIHsKICAgIGNvbnN0IGQgPSB0cyhvKSwgZGF5ID0gZGF5TGFiZWwoZCk7CiAgICBpZiAoZGF5ICE9PSBsYXN0RGF5KSB7IGh0bWwgKz0gYDxkaXYgY2xhc3M9ImRheWhlYWQiPiR7ZXNjKGRheSl9PC9kaXY+YDsgbGFzdERheSA9IGRheTsgfQogICAgY29uc3Qgc3QgPSBvLnN0YXRlOwogICAgbGV0IG5vdGUgPSAnJywgYnRuID0gJyc7CiAgICBjb25zdCBtaW5lID0gby5vd24gIT09IGZhbHNlOwogICAgaWYgKHN0ID09PSAncmVhZHknICYmIG1pbmUpIGJ0biA9IGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIGRhdGEtYWN0PSJwcmludCIgZGF0YS1pZD0iJHtvLmlkfSI+JHtJLnByaW50fUltcHJpbWlyPC9idXR0b24+YDsKICAgIGlmIChzdCA9PT0gJ3ByaW50ZWQnKSB7IG5vdGUgPSBgPHNwYW4gY2xhc3M9Im5vdGUiPkltcHJlc2EgJHtlc2MoZm10VGltZShvLnByaW50ZWRfYXQpKX0ke28ucHJpbnRlZF9ieSA/IGAgwrcgPGI+SW1wcmltacOzOiAke2VzYyhvLnByaW50ZWRfYnkpfTwvYj5gIDogJyd9PC9zcGFuPmA7IGlmIChtaW5lKSBidG4gPSBgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1yZXByaW50IiBkYXRhLWFjdD0icmVwcmludCIgZGF0YS1pZD0iJHtvLmlkfSI+JHtJLnByaW50fVZvbHZlciBhIGltcHJpbWlyPC9idXR0b24+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1hY3Q9InVucHJpbnQiIGRhdGEtaWQ9IiR7by5pZH0iPk1hcmNhciBjb21vIG5vIGltcHJlc2E8L2J1dHRvbj5gOyB9CiAgICBpZiAoc3QgPT09ICdzaGlwcGVkJykgbm90ZSA9IGA8c3BhbiBjbGFzcz0ibm90ZSI+WWEgc2FsacOzIMK3IDxiPkltcHJpbWnDszogJHtlc2Moby5wcmludGVkX2J5IHx8ICdNYXJrZXRwbGFjZScpfTwvYj48L3NwYW4+YDsKICAgIGlmIChzdCA9PT0gJ3dhaXRpbmcnIHx8IHN0ID09PSAnZXJyb3InKSB7IG5vdGUgPSBgPHNwYW4gY2xhc3M9Im5vdGUgJHtzdCA9PT0gJ2Vycm9yJyA/ICdiYWQnIDogJyd9Ij4ke2VzYyhvLmVycm9yIHx8IG8ud2FpdGluZ19ub3RlIHx8ICdFbCBtYXJrZXRwbGFjZSBhw7puIG5vIGxpYmVyYSBsYSBldGlxdWV0YScpfTwvc3Bhbj5gOyBpZiAobWluZSkgYnRuID0gYDxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtYWN0PSJyZXRyeSIgZGF0YS1pZD0iJHtvLmlkfSI+UmVpbnRlbnRhcjwvYnV0dG9uPmA7IH0KICAgIGNvbnN0IG5vbmVGb3JGZiA9IChvLm1pc3NpbmdfaWR4IHx8IFtdKS5sZW5ndGggPiAwICYmIChvLm1pc3NpbmdfaWR4IHx8IFtdKS5sZW5ndGggPj0gby5pdGVtcy5sZW5ndGg7CiAgICBpZiAoc3QgPT09ICdibG9ja2VkJykgeyBub3RlID0gbm9uZUZvckZmID8gJzxzcGFuIGNsYXNzPSJub3ByaW50Ij5ST05HIFhJTiBOTyBJTVBSSU1JUiBFVElRVUVUQTwvc3Bhbj4nIDogJzxzcGFuIGNsYXNzPSJub3RlIj5UaWVuZSBwcm9kdWN0b3MgcXVlIG5vIHZhbiBhbCBmdWxmaWxsbWVudDogbWFuZGEgc29sbyBsb3MgbWFyY2Fkb3MgZW4gdmVyZGU8L3NwYW4+JzsgaWYgKG1pbmUpIGJ0biA9IGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIGRhdGEtYWN0PSJ1bmJsb2NrIiBkYXRhLWlkPSIke28uaWR9Ij4ke0kubG9ja31EZXNibG9xdWVhciBldGlxdWV0YTwvYnV0dG9uPmA7IH0KICAgIGlmIChvLnVuYmxvY2tlZF9ieSAmJiBvLmJsb2NrX25vICYmIHN0ICE9PSAnYmxvY2tlZCcpIHsKICAgICAgbm90ZSArPSBgPHNwYW4gY2xhc3M9Im5vdGUiPjxiPlBlZGlkbyBpbmNvbXBsZXRvPC9iPjogZWwgZnVsZmlsbG1lbnQgbWFuZGEgbG8gc3V5byB5IHNlIHJlbGxlbmEgbG8gbWFyY2FkbyAiRkFMVEEiIMK3IERlc2Jsb3F1ZcOzOiAke2VzYyhvLnVuYmxvY2tlZF9ieSl9PC9zcGFuPmA7CiAgICAgIGlmIChtaW5lICYmIFsncmVhZHknLCAnd2FpdGluZycsICdlcnJvciddLmluY2x1ZGVzKHN0KSkgYnRuICs9IGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWFjdD0icmVibG9jayIgZGF0YS1pZD0iJHtvLmlkfSI+Vm9sdmVyIGEgYmxvcXVlYXI8L2J1dHRvbj5gOwogICAgfQogICAgaHRtbCArPSBgPGRpdiBjbGFzcz0ib3JvdyBzdC0ke3N0fSAke2ZyZXNoLmluY2x1ZGVzKG8uaWQpID8gJ2lzLW5ldycgOiAnJ30iPgogICAgICA8ZGl2IGNsYXNzPSJvYy1jaGVjayI+JHtzdCA9PT0gJ3JlYWR5JyAmJiBtaW5lID8gYDxpbnB1dCB0eXBlPSJjaGVja2JveCIgY2xhc3M9ImNiIiBkYXRhLWlkPSIke28uaWR9IiAke3NlbGVjdGVkLmhhcyhvLmlkKSA/ICdjaGVja2VkJyA6ICcnfSBhcmlhLWxhYmVsPSJTZWxlY2Npb25hciAke2VzYyhvLm9yZGVyX251bWJlcil9Ij5gIDogc3QgPT09ICdibG9ja2VkJyA/IGA8c3BhbiBjbGFzcz0ibG9ja2NlbGwiPiR7SS5sb2NrfTwvc3Bhbj5gIDogJyd9PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9Im9jLXRpbWUiPjxiPiR7ZXNjKGFtcG0oZCkpfTwvYj48c3BhbiBjbGFzcz0ibWsgJHtvLm1hcmtldHBsYWNlfSI+JHtNS1tvLm1hcmtldHBsYWNlXSB8fCBvLm1hcmtldHBsYWNlfTwvc3Bhbj4ke28uc2hpcF90eXBlID8gYDxzcGFuIGNsYXNzPSJzaGlwdHlwZSBzdC0ke2VzYyhvLnNoaXBfdHlwZS50b0xvd2VyQ2FzZSgpKX0iPiR7ZXNjKG8uc2hpcF90eXBlKX08L3NwYW4+YCA6ICcnfTwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJvYy1tYWluIj4ke1sncmVhZHknLCAnd2FpdGluZycsICdlcnJvciddLmluY2x1ZGVzKHN0KSAmJiBkaXNwYXRjaFRleHQobykgPyBgPGRpdiBjbGFzcz0iZGlzcGF0Y2ggJHtkaXNwYXRjaFRleHQobykuc3RhcnRzV2l0aCgnQXRyYXNhZGEnKSA/ICdsYXRlJyA6ICcnfSI+JHtlc2MoZGlzcGF0Y2hUZXh0KG8pKX08L2Rpdj5gIDogJyd9PGRpdiBjbGFzcz0ib2MtdG9wIj4ke28uYmxvY2tfbm8gPyBgPHNwYW4gY2xhc3M9ImJsb2Nrbm8iIHRpdGxlPSJOw7ptZXJvIGRlbCBwZWRpZG8gaW5jb21wbGV0byI+TsKwICR7by5ibG9ja19ub308L3NwYW4+YCA6ICcnfSR7by5jdXN0b21lciA/IGA8c3BhbiBjbGFzcz0iY3VzdCI+JHtlc2Moby5jdXN0b21lcil9PC9zcGFuPmAgOiAnJ308Yj4ke2VzYyhvLnNlbGxlcil9PC9iPiA8c3BhbiBjbGFzcz0ibW9ubyBtdXRlZCI+IyR7ZXNjKG8ub3JkZXJfbnVtYmVyKX08L3NwYW4+PC9kaXY+JHtpdGVtc0hUTUwobyl9JHtub3RlfTwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJvYy1hY3QiPiR7cGlsbChvKX08ZGl2IGNsYXNzPSJyb3ctYWN0aW9ucyI+JHtidG59JHtvLnRyYWNrX3VybCA/IGA8YSBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgaHJlZj0iJHtlc2Moby50cmFja191cmwpfSIgdGFyZ2V0PSJfYmxhbmsiIHJlbD0ibm9vcGVuZXIiPlNlZ3VpciBlbnbDrW88L2E+YCA6ICcnfTwvZGl2PiR7by50cmFja2luZyA/IGA8c3BhbiBjbGFzcz0ibm90ZSBtb25vIj5OwrAgc2VndWltaWVudG8gJHtlc2Moby50cmFja2luZyl9PC9zcGFuPmAgOiAnJ308L2Rpdj4KICAgIDwvZGl2PmA7CiAgfQogICQoJyNsaXN0JykuaW5uZXJIVE1MID0gaHRtbDsKICBkcmF3QWN0aW9uYmFyKCk7Cn0KZnVuY3Rpb24gZHJhd0FjdGlvbmJhcigpIHsKICBjb25zdCBhYiA9ICQoJyNhY3Rpb25iYXInKTsgaWYgKCFhYikgcmV0dXJuOwogIGlmICghWyd0b2RheScsICd1cGNvbWluZyddLmluY2x1ZGVzKHVpLnRhYikpIHsgYWIuaW5uZXJIVE1MID0gJyc7IGFiLmhpZGRlbiA9IHRydWU7IHJldHVybjsgfQogIGFiLmhpZGRlbiA9IGZhbHNlOwogIGNvbnN0IG4gPSB2aXNpYmxlSW4odWkudGFiKS5sZW5ndGgsIHMgPSBzZWxlY3RlZC5zaXplOwogIGlmIChtZS51c2VyLnJvbGUgPT09ICdzZWxsZXInKSB7IGFiLmlubmVySFRNTCA9ICcnOyBhYi5oaWRkZW4gPSB0cnVlOyByZXR1cm47IH0KICBhYi5pbm5lckhUTUwgPSBgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiBkYXRhLWJ1bGs9ImFsbCIgJHtuID8gJycgOiAnZGlzYWJsZWQnfT4ke0kuZG93bn1JbXByaW1pciB0b2RhcyAoJHtufSk8L2J1dHRvbj4KICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSIgZGF0YS1idWxrPSJzZWwiICR7cyA/ICcnIDogJ2Rpc2FibGVkJ30+SW1wcmltaXIgc2VsZWNjaW9uYWRhcyAoJHtzfSk8L2J1dHRvbj4KICAgIDxzcGFuIGNsYXNzPSJzcGFjZXIiIHN0eWxlPSJmbGV4OjEiPjwvc3Bhbj4KICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtYnVsaz0ic2VsYWxsIj5TZWxlY2Npb25hciB0b2RhczwvYnV0dG9uPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtYnVsaz0ibm9uZSI+UXVpdGFyIHNlbGVjY2nDs248L2J1dHRvbj5gOwp9CmZ1bmN0aW9uIHVwZGF0ZVNlbCgpIHsgZHJhd0FjdGlvbmJhcigpOyB9CgpsZXQgZG93bmxvYWRpbmcgPSBmYWxzZTsKYXN5bmMgZnVuY3Rpb24gZG93bmxvYWRCYXRjaChpZHMsIHsgc2lsZW50ID0gZmFsc2UgfSA9IHt9KSB7CiAgaWYgKCFpZHMubGVuZ3RoIHx8IGRvd25sb2FkaW5nKSByZXR1cm4gMDsKICBkb3dubG9hZGluZyA9IHRydWU7CiAgdHJ5IHsKICAgIGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoKCcvYXBpL2xhYmVscy9iYXRjaCcsIHsgbWV0aG9kOiAnUE9TVCcsIGNyZWRlbnRpYWxzOiAnc2FtZS1vcmlnaW4nLCBoZWFkZXJzOiB7ICdjb250ZW50LXR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSwgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBpZHMsIG1hcms6IHRydWUgfSkgfSk7CiAgICBpZiAoIXJlcy5vaykgeyBjb25zdCBlID0gYXdhaXQgcmVzLmpzb24oKS5jYXRjaCgoKSA9PiAoe30pKTsgdGhyb3cgbmV3IEVycm9yKGUuZXJyb3IgfHwgJ05vIHNlIHB1ZG8gZGVzY2FyZ2FyJyk7IH0KICAgIGNvbnN0IGJsb2IgPSBhd2FpdCByZXMuYmxvYigpOwogICAgY29uc3QgbmFtZSA9IChyZXMuaGVhZGVycy5nZXQoJ2NvbnRlbnQtZGlzcG9zaXRpb24nKSB8fCAnJykubWF0Y2goL2ZpbGVuYW1lPSIoW14iXSspIi8pPy5bMV0gfHwgJ2V0aXF1ZXRhcy5wZGYnOwogICAgY29uc3QgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTsgYS5ocmVmID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTsgYS5kb3dubG9hZCA9IG5hbWU7IGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoYSk7IGEuY2xpY2soKTsgYS5yZW1vdmUoKTsKICAgIHNldFRpbWVvdXQoKCkgPT4gVVJMLnJldm9rZU9iamVjdFVSTChhLmhyZWYpLCA2MDAwMCk7CiAgICBjb25zdCBuID0gK3Jlcy5oZWFkZXJzLmdldCgneC1sYWJlbC1jb3VudCcpIHx8IGlkcy5sZW5ndGg7CiAgICB0b2FzdChgJHtufSBldGlxdWV0YSR7biA9PT0gMSA/ICcnIDogJ3MnfSBkZXNjYXJnYWRhJHtuID09PSAxID8gJycgOiAncyd9IHkgbWFyY2FkYSR7biA9PT0gMSA/ICcnIDogJ3MnfSBjb21vIGltcHJlc2Eke24gPT09IDEgPyAnJyA6ICdzJ31gKTsKICAgIHNlbGVjdGVkLmNsZWFyKCk7CiAgICByZXR1cm4gbjsKICB9IGNhdGNoIChlKSB7IGlmICghc2lsZW50KSB0b2FzdChlLm1lc3NhZ2UpOyByZXR1cm4gMDsgfQogIGZpbmFsbHkgeyBkb3dubG9hZGluZyA9IGZhbHNlOyBzZXRUaW1lb3V0KGxvYWRPcmRlcnMsIDQwMCk7IH0KfQpsZXQgYXV0b1QgPSBudWxsOwpmdW5jdGlvbiBhdXRvRG93bmxvYWQoKSB7CiAgY2xlYXJUaW1lb3V0KGF1dG9UKTsKICAvLyBlc3BlcmEgdW5vcyBzZWd1bmRvcyBwYXJhIGp1bnRhciBldGlxdWV0YXMgcXVlIGxsZWdhbiBjYXNpIGp1bnRhcyBlbiB1biBzb2xvIFBERgogIGF1dG9UID0gc2V0VGltZW91dCgoKSA9PiB7CiAgICBjb25zdCBpZHMgPSBvcmRlcnMuZmlsdGVyKG8gPT4gby5zdGF0ZSA9PT0gJ3JlYWR5JyAmJiBvLm93biAhPT0gZmFsc2UgJiYgaXNGb3JUb2RheShvKSkubWFwKG8gPT4gby5pZCk7CiAgICBpZiAoaWRzLmxlbmd0aCAmJiBzdG9yZS5nZXQoJ2F1dG8nLCBmYWxzZSkgJiYgbWUudXNlci5yb2xlICE9PSAnc2VsbGVyJykgZG93bmxvYWRCYXRjaChpZHMsIHsgc2lsZW50OiB0cnVlIH0pOwogIH0sIDQwMDApOwp9CgovLyAtLS0tLS0tLS0tIFZFTkRFRE9SIC0tLS0tLS0tLS0KYXN5bmMgZnVuY3Rpb24gcmVuZGVyU2VsbGVyKCkgewogIGNvbnN0IGlzQWRtaW4gPSBtZS51c2VyLnJvbGUgPT09ICdhZG1pbic7CiAgbGV0IHNlbGxlclBpY2tlciA9ICcnOwogIGlmIChpc0FkbWluKSB7CiAgICBjb25zdCBkID0gYXdhaXQgYXBpKCcvYXBpL2FkbWluL3NlbGxlcnMnKTsKICAgIHNlbGxlcnMgPSBkLnNlbGxlcnM7CiAgICBpZiAoIXNlbGxlcnMubGVuZ3RoKSB7ICQoJyNtYWluJykuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9InNlY3Rpb24tdGl0bGUiPjxoMj5WZW5kZWRvcmVzPC9oMj48L2Rpdj48ZGl2IGNsYXNzPSJwYW5lbCI+PGRpdiBjbGFzcz0iZW1wdHkiPiR7RU1QVFlfU1ZHfTxkaXY+UHJpbWVybyBjcmVhIGxvcyB2ZW5kZWRvcmVzIGVuIGxhIHBlc3Rhw7FhIFVzdWFyaW9zLjwvZGl2PjwvZGl2PjwvZGl2PmA7IHJldHVybjsgfQogICAgaWYgKCFzZWxsZXJzLnNvbWUocyA9PiBzLmlkID09PSB1aS5hZG1pblNlbGxlcikpIHVpLmFkbWluU2VsbGVyID0gc2VsbGVyc1swXS5pZDsKICAgIHNlbGxlclBpY2tlciA9IGA8c2VsZWN0IGlkPSJhZG1pblNlbGxlciIgc3R5bGU9IndpZHRoOmF1dG8iPiR7c2VsbGVycy5tYXAocyA9PiBgPG9wdGlvbiB2YWx1ZT0iJHtzLmlkfSIgJHtzLmlkID09PSB1aS5hZG1pblNlbGxlciA/ICdzZWxlY3RlZCcgOiAnJ30+JHtlc2Mocy5uYW1lKX08L29wdGlvbj5gKS5qb2luKCcnKX08L3NlbGVjdD5gOwogIH0KICAkKCcjbWFpbicpLmlubmVySFRNTCA9IGAKICA8ZGl2IGNsYXNzPSJzZWN0aW9uLXRpdGxlIj48aDI+JHtpc0FkbWluID8gJ0N1ZW50YSBkZWwgdmVuZGVkb3InIDogJ01pcyBtYXJrZXRwbGFjZXMnfTwvaDI+JHtzZWxsZXJQaWNrZXJ9PHNwYW4gY2xhc3M9InNwYWNlciIgc3R5bGU9ImZsZXg6MSI+PC9zcGFuPjxidXR0b24gY2xhc3M9ImJ0biBidG4tZ2hvc3QiIGlkPSJzU3luYyI+JHtJLnN5bmN9U2luY3Jvbml6YXIgYWhvcmE8L2J1dHRvbj48L2Rpdj4KICA8ZGl2IGNsYXNzPSJjb25uIiBpZD0iY29ubiI+PC9kaXY+CiAgPGRpdiBjbGFzcz0iZ3JpZDIiPgogICAgPGRpdiBjbGFzcz0icGFuZWwiPgogICAgICA8ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj48aDI+UHJvZHVjdG9zIHF1ZSBOTyB2YW4gYWwgZnVsZmlsbG1lbnQ8L2gyPjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJwYW5lbC1ib2R5IHN0YWNrIj4KICAgICAgICA8ZGl2IGNsYXNzPSJydWxlIj4ke1JVTEVfU1ZHfTxwPjxiPkJhc3RhIHVuIHByb2R1Y3RvIGRlIGVzdGEgbGlzdGEgcGFyYSBibG9xdWVhciBlbCBwZWRpZG8gY29tcGxldG8uPC9iPiBFbCBmdWxmaWxsbWVudCBsbyB2ZXLDoSBjb24gY2FuZGFkbyB5IG5vIHBvZHLDoSBkZXNjYXJnYXIgc3UgZXRpcXVldGEuIFVzYSBlbCBJRCBkZSBwdWJsaWNhY2nDs24gKE1MQ+KApiwgSUQgZGUgRmFsYWJlbGxhLCBTS1UgTUvigKYgZGUgUGFyaXMpIG8gdHUgU0tVIGRlIHZlbmRlZG9yLjwvcD48L2Rpdj4KICAgICAgICA8Zm9ybSBjbGFzcz0iYWRkcm93IiBpZD0iYWRkRm9ybSI+CiAgICAgICAgICA8dGV4dGFyZWEgaWQ9ImFkZFZhbCIgcm93cz0iMiIgcGxhY2Vob2xkZXI9IlVubyBvIHZhcmlvcywgc2VwYXJhZG9zIHBvciBjb21hIG8gc2FsdG8gZGUgbMOtbmVhJiMxMDtFajogTUxDMTQ4Nzc2NTQzMiwgTEVOLVBPTC0wMSIgYXJpYS1sYWJlbD0iSURzIG8gU0tVcyI+PC90ZXh0YXJlYT4KICAgICAgICAgIDxzZWxlY3QgaWQ9ImFkZE1rIiBhcmlhLWxhYmVsPSJNYXJrZXRwbGFjZSI+PG9wdGlvbiB2YWx1ZT0iYW55Ij5Ub2RvcyBsb3MgY2FuYWxlczwvb3B0aW9uPjxvcHRpb24gdmFsdWU9Im1sIj5Tb2xvIE1lcmNhZG8gTGlicmU8L29wdGlvbj48b3B0aW9uIHZhbHVlPSJmYSI+U29sbyBGYWxhYmVsbGE8L29wdGlvbj48b3B0aW9uIHZhbHVlPSJwYSI+U29sbyBQYXJpczwvb3B0aW9uPjwvc2VsZWN0PgogICAgICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiPiR7SS5sb2NrfUJsb3F1ZWFyPC9idXR0b24+CiAgICAgICAgPC9mb3JtPgogICAgICAgIDxpbnB1dCB0eXBlPSJzZWFyY2giIGlkPSJibFEiIHBsYWNlaG9sZGVyPSJCdXNjYXIgZW4gbGEgbGlzdGEiIGFyaWEtbGFiZWw9IkJ1c2NhciBibG9xdWVhZG9zIj4KICAgICAgICA8ZGl2IGNsYXNzPSJ0YWdzIiBpZD0idGFncyI+PC9kaXY+CiAgICAgIDwvZGl2PgogICAgPC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbCI+CiAgICAgIDxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj5QZWRpZG9zIHJlY2llbnRlczwvaDI+PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9InRhYmxlLXdyYXAiPjx0YWJsZSBzdHlsZT0ibWluLXdpZHRoOjUyMHB4Ij48dGhlYWQ+PHRyPjx0aD5QZWRpZG88L3RoPjx0aD5DYW5hbDwvdGg+PHRoPlByb2R1Y3RvczwvdGg+PHRoPkVzdGFkbzwvdGg+PC90cj48L3RoZWFkPjx0Ym9keSBpZD0ibXlSb3dzIj48L3Rib2R5PjwvdGFibGU+PC9kaXY+CiAgICA8L2Rpdj4KICA8L2Rpdj5gOwogIGlmIChpc0FkbWluKSAkKCcjYWRtaW5TZWxsZXInKS5vbmNoYW5nZSA9IGUgPT4geyB1aS5hZG1pblNlbGxlciA9ICtlLnRhcmdldC52YWx1ZTsgc3RvcmUuc2V0KCdhZG1pblNlbGxlcicsIHVpLmFkbWluU2VsbGVyKTsgcmVuZGVyU2VsbGVyKCk7IH07CiAgJCgnI3NTeW5jJykub25jbGljayA9IGFzeW5jICgpID0+IHsgYXdhaXQgYXBpKCcvYXBpL3N5bmMnICsgc2VsbGVyUVMoKSwgeyBtZXRob2Q6ICdQT1NUJyB9KTsgdG9hc3QoJ1NpbmNyb25pemFuZG/igKYnKTsgfTsKICAkKCcjYWRkRm9ybScpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICBlLnByZXZlbnREZWZhdWx0KCk7CiAgICB0cnkgeyBjb25zdCByID0gYXdhaXQgYXBpKCcvYXBpL2Jsb2NrbGlzdCcgKyBzZWxsZXJRUygpLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IHZhbHVlOiAkKCcjYWRkVmFsJykudmFsdWUsIG1hcmtldHBsYWNlOiAkKCcjYWRkTWsnKS52YWx1ZSB9IH0pOyAkKCcjYWRkVmFsJykudmFsdWUgPSAnJzsgdG9hc3QoYCR7ci5hZGRlZH0gYmxvcXVlYWRvJHtyLmFkZGVkID09PSAxID8gJycgOiAncyd9YCk7IGxvYWRCbG9ja2xpc3QoKTsgfQogICAgY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IH0KICB9OwogICQoJyNibFEnKS5vbmlucHV0ID0gKCkgPT4gZHJhd1RhZ3MoKTsKICAkKCcjdGFncycpLm9uY2xpY2sgPSBhc3luYyBlID0+IHsgY29uc3QgYiA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLXJtXScpOyBpZiAoIWIpIHJldHVybjsgYXdhaXQgYXBpKGAvYXBpL2Jsb2NrbGlzdC8ke2IuZGF0YXNldC5ybX0ke3NlbGxlclFTKCl9YCwgeyBtZXRob2Q6ICdERUxFVEUnIH0pOyB0b2FzdCgnRGVzYmxvcXVlYWRvOiBzdXMgcGVkaWRvcyBwYXNhbiBhbCBmdWxmaWxsbWVudCcpOyBsb2FkQmxvY2tsaXN0KCk7IH07CiAgJCgnI215Um93cycpLm9uY2xpY2sgPSBhc3luYyBlID0+IHsKICAgIGNvbnN0IGIgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS11bmJsb2NrXScpOyBpZiAoIWIpIHJldHVybjsKICAgIGlmICghY29uZmlybSgnwr9EZXNibG9xdWVhciBlc3RhIGV0aXF1ZXRhPyBQYXNhIGEgIlBvciBpbXByaW1pciIuIEVuIGxhIGhvamEgZGVsIHBlZGlkbyBzYWxkcsOhIHN1IG7Dum1lcm8geSBxdWVkYXLDoW4gbWFyY2Fkb3MgY29uICJGQUxUQSIgbG9zIHByb2R1Y3RvcyBxdWUgc2UgcmVsbGVuYW4gYXBhcnRlLicpKSByZXR1cm47CiAgICBiLmRpc2FibGVkID0gdHJ1ZTsgdHJ5IHsgYXdhaXQgYXBpKGAvYXBpL29yZGVycy8ke2IuZGF0YXNldC51bmJsb2NrfS91bmJsb2NrYCwgeyBtZXRob2Q6ICdQT1NUJyB9KTsgdG9hc3QoJ0V0aXF1ZXRhIGRlc2Jsb3F1ZWFkYScpOyBsb2FkU2VsbGVyT3JkZXJzKCk7IH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IGIuZGlzYWJsZWQgPSBmYWxzZTsgfQogIH07CiAgbG9hZENvbm5lY3Rpb25zKCk7IGxvYWRCbG9ja2xpc3QoKTsgbG9hZFNlbGxlck9yZGVycygpOwogIGlmIChuZXcgVVJMU2VhcmNoUGFyYW1zKGxvY2F0aW9uLnNlYXJjaCkuZ2V0KCdjb25lY3RhZG8nKSA9PT0gJ21sJykgeyB0b2FzdCgnTWVyY2FkbyBMaWJyZSBjb25lY3RhZG8nKTsgaGlzdG9yeS5yZXBsYWNlU3RhdGUobnVsbCwgJycsICcvJyk7IH0KfQoKYXN5bmMgZnVuY3Rpb24gbG9hZENvbm5lY3Rpb25zKCkgewogIGNvbnN0IHsgY29ubmVjdGlvbnMgfSA9IGF3YWl0IGFwaSgnL2FwaS9jb25uZWN0aW9ucycgKyBzZWxsZXJRUygpKTsKICBjb25zdCBieSA9IE9iamVjdC5mcm9tRW50cmllcyhjb25uZWN0aW9ucy5tYXAoYyA9PiBbYy5tYXJrZXRwbGFjZSwgY10pKTsKICBjb25zdCBzdCA9IGMgPT4gIWMgPyAnPGRpdiBjbGFzcz0ic3RhdGUgb2ZmIj48aT48L2k+U2luIGNvbmVjdGFyPC9kaXY+JyA6IGMubGFzdF9lcnJvciA/IGA8ZGl2IGNsYXNzPSJzdGF0ZSBlcnIiPjxpPjwvaT5FcnJvcjogJHtlc2MoYy5sYXN0X2Vycm9yLnNsaWNlKDAsIDEyMCkpfTwvZGl2PmAgOiBgPGRpdiBjbGFzcz0ic3RhdGUgb24iPjxpPjwvaT5Db25lY3RhZG8ke2MuYWNjb3VudF9sYWJlbCA/ICcgwrcgJyArIGVzYyhjLmFjY291bnRfbGFiZWwpIDogJyd9JHtjLmxhc3Rfc3luY19hdCA/ICcgwrcgcmV2aXNhZG8gJyArIGVzYyhmbXRUaW1lKGMubGFzdF9zeW5jX2F0KSkgOiAnJ308L2Rpdj5gOwogIGNvbnN0IGRpc2MgPSBjID0+IGMgPyBgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1kZWw9IiR7Yy5pZH0iPkRlc2NvbmVjdGFyPC9idXR0b24+YCA6ICcnOwogIGNvbnN0IG1sID0gYnkubWwsIGZhID0gYnkuZmEsIHBhID0gYnkucGE7CiAgJCgnI2Nvbm4nKS5pbm5lckhUTUwgPSBgCiAgPGRpdiBjbGFzcz0ibWNhcmQiPjxkaXYgY2xhc3M9ImxvZ28iIHN0eWxlPSJiYWNrZ3JvdW5kOnZhcigtLW1sKTtjb2xvcjp2YXIoLS1tbC1pbmspIj5NZXJjYWRvIExpYnJlPC9kaXY+JHtzdChtbCl9CiAgICA8cCBjbGFzcz0iaG93Ij5UZSBsbGV2YSBhIE1lcmNhZG8gTGlicmUgcGFyYSBhdXRvcml6YXIuIE5vIGNvbXBhcnRlcyB0dSBjb250cmFzZcOxYS4gTGFzIGV0aXF1ZXRhcyBsbGVnYW4gYXBlbmFzIGxhIHZlbnRhIHF1ZWRhIGxpc3RhIHBhcmEgaW1wcmltaXIuPC9wPgogICAgJHttZS5tbENvbmZpZ3VyZWQgPyBgPGEgY2xhc3M9ImJ0biAke21sID8gJ2J0bi1naG9zdCcgOiAnYnRuLXByaW1hcnknfSIgaHJlZj0iL2F1dGgvbWwvc3RhcnQke3NlbGxlclFTKCl9Ij4ke21sID8gJ1ZvbHZlciBhIGF1dG9yaXphcicgOiAnQ29uZWN0YXIgY29uIE1lcmNhZG8gTGlicmUnfTwvYT5gIDogJzxwIGNsYXNzPSJob3ciIHN0eWxlPSJjb2xvcjp2YXIoLS13YXJuKSI+RWwgYWRtaW5pc3RyYWRvciBkZWJlIGNvbmZpZ3VyYXIgbGEgYXBwIGRlIE1lcmNhZG8gTGlicmUgZW4gZWwgc2Vydmlkb3IuPC9wPid9JHtkaXNjKG1sKX08L2Rpdj4KICA8ZGl2IGNsYXNzPSJtY2FyZCI+PGRpdiBjbGFzcz0ibG9nbyIgc3R5bGU9ImJhY2tncm91bmQ6dmFyKC0tZmEpO2NvbG9yOnZhcigtLWZhLWluaykiPkZhbGFiZWxsYTwvZGl2PiR7c3QoZmEpfQogICAgPGZvcm0gaWQ9ImZhRm9ybSIgY2xhc3M9InN0YWNrIj4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5Vc3VhcmlvIEFQSSAoY29ycmVvIGRlbCBTZWxsZXIgQ2VudGVyKTxpbnB1dCB0eXBlPSJlbWFpbCIgaWQ9ImZhVXNlciIgdmFsdWU9IiR7ZXNjKGZhPy5hY2NvdW50X2xhYmVsIHx8ICcnKX0iIHJlcXVpcmVkPjwvbGFiZWw+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+QVBJIEtleTxpbnB1dCB0eXBlPSJwYXNzd29yZCIgaWQ9ImZhS2V5IiBwbGFjZWhvbGRlcj0iJHtmYSA/ICfigKLigKLigKLigKLigKLigKIgKGd1YXJkYWRhKScgOiAnU2VsbGVyIENlbnRlciDigLogTWkgY3VlbnRhIOKAuiBJbnRlZ3JhY2lvbmVzJ30iICR7ZmEgPyAnJyA6ICdyZXF1aXJlZCd9PjwvbGFiZWw+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+U2VsbGVyIElEPGlucHV0IHR5cGU9InRleHQiIGlkPSJmYVNpZCIgcGxhY2Vob2xkZXI9IkPDs2RpZ28gZGUgdGllbmRhLCBlai4gU0MxMjM0Ij48L2xhYmVsPgogICAgICA8bGFiZWwgY2xhc3M9InN3aXRjaCI+PGlucHV0IHR5cGU9ImNoZWNrYm94IiBpZD0iZmFBdXRvIiAke2ZhPy5zZXR0aW5ncz8uYXV0b1JlYWR5ID8gJ2NoZWNrZWQnIDogJyd9PiBNYXJjYXIgImxpc3RvIHBhcmEgZGVzcGFjaG8iIGF1dG9tw6F0aWNvPC9sYWJlbD4KICAgICAgPHAgY2xhc3M9ImhvdyI+RmFsYWJlbGxhIGdlbmVyYSBsYSBldGlxdWV0YSBzb2xvIGN1YW5kbyBlbCBwZWRpZG8gZXN0w6EgbGlzdG8gcGFyYSBkZXNwYWNoby4gQ29uIGVzdGEgb3BjacOzbiwgbGEgYXBwIGxvIG1hcmNhIHNvbGEgYXBlbmFzIGxsZWdhLjwvcD4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuICR7ZmEgPyAnYnRuLWdob3N0JyA6ICdidG4tcHJpbWFyeSd9IiB0eXBlPSJzdWJtaXQiPiR7ZmEgPyAnQWN0dWFsaXphcicgOiAnQ29uZWN0YXIgRmFsYWJlbGxhJ308L2J1dHRvbj4KICAgIDwvZm9ybT4KICAgICR7ZmE/LndlYmhvb2tfdXJsID8gYDxsYWJlbCBjbGFzcz0iZiI+QXZpc28gaW5zdGFudMOhbmVvICh3ZWJob29rLCBvcGNpb25hbCk8c3BhbiBjbGFzcz0iY29weSI+PGlucHV0IHR5cGU9InRleHQiIHJlYWRvbmx5IHZhbHVlPSIke2VzYyhmYS53ZWJob29rX3VybCl9Ij48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWNvcHk9IiR7ZXNjKGZhLndlYmhvb2tfdXJsKX0iPkNvcGlhcjwvYnV0dG9uPjwvc3Bhbj48L2xhYmVsPmAgOiAnJ30KICAgICR7ZGlzYyhmYSl9PC9kaXY+CiAgPGRpdiBjbGFzcz0ibWNhcmQiPjxkaXYgY2xhc3M9ImxvZ28iIHN0eWxlPSJiYWNrZ3JvdW5kOnZhcigtLXBhKTtjb2xvcjojZmZmIj5QYXJpczwvZGl2PiR7c3QocGEpfQogICAgPGZvcm0gaWQ9InBhRm9ybSIgY2xhc3M9InN0YWNrIj4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5BUEkgS2V5PGlucHV0IHR5cGU9InBhc3N3b3JkIiBpZD0icGFLZXkiIHBsYWNlaG9sZGVyPSIke3BhID8gJ+KAouKAouKAouKAouKAouKAoiAoZ3VhcmRhZGEpJyA6ICdTZWxsZXIgQ2VudGVyIFBhcmlzIOKAuiBNaSBjdWVudGEg4oC6IEludGVncmFjaW9uZXMnfSIgcmVxdWlyZWQ+PC9sYWJlbD4KICAgICAgPHAgY2xhc3M9ImhvdyI+UGFyaXMgZW50cmVnYSBsYSBBUEkgS2V5IGVuIE1pIGN1ZW50YSDigLogSW50ZWdyYWNpb25lcy4gU2kgbm8gYXBhcmVjZSwgc2UgcGlkZSBwb3IgdGlja2V0IGEgUGFyaXMuPC9wPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gJHtwYSA/ICdidG4tZ2hvc3QnIDogJ2J0bi1wcmltYXJ5J30iIHR5cGU9InN1Ym1pdCI+JHtwYSA/ICdBY3R1YWxpemFyJyA6ICdDb25lY3RhciBQYXJpcyd9PC9idXR0b24+CiAgICA8L2Zvcm0+JHtkaXNjKHBhKX08L2Rpdj5gOwogICQoJyNmYUZvcm0nKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4gewogICAgZS5wcmV2ZW50RGVmYXVsdCgpOwogICAgaWYgKGZhICYmICEkKCcjZmFLZXknKS52YWx1ZSkgeyBhd2FpdCBhcGkoYC9hcGkvY29ubmVjdGlvbnMvJHtmYS5pZH0vc2V0dGluZ3Mke3NlbGxlclFTKCl9YCwgeyBtZXRob2Q6ICdQQVRDSCcsIGJvZHk6IHsgYXV0b1JlYWR5OiAkKCcjZmFBdXRvJykuY2hlY2tlZCB9IH0pOyB0b2FzdCgnR3VhcmRhZG8nKTsgcmV0dXJuIGxvYWRDb25uZWN0aW9ucygpOyB9CiAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvY29ubmVjdGlvbnMvZmEnICsgc2VsbGVyUVMoKSwgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyB1c2VySWQ6ICQoJyNmYVVzZXInKS52YWx1ZSwgYXBpS2V5OiAkKCcjZmFLZXknKS52YWx1ZSwgc2VsbGVySWQ6ICQoJyNmYVNpZCcpLnZhbHVlLCBhdXRvUmVhZHk6ICQoJyNmYUF1dG8nKS5jaGVja2VkIH0gfSk7IHRvYXN0KCdGYWxhYmVsbGEgY29uZWN0YWRvJyk7IGxvYWRDb25uZWN0aW9ucygpOyB9CiAgICBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlLCA1MDAwKTsgfQogIH07CiAgJCgnI3BhRm9ybScpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICBlLnByZXZlbnREZWZhdWx0KCk7CiAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvY29ubmVjdGlvbnMvcGEnICsgc2VsbGVyUVMoKSwgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBhcGlLZXk6ICQoJyNwYUtleScpLnZhbHVlIH0gfSk7IHRvYXN0KCdQYXJpcyBjb25lY3RhZG8nKTsgbG9hZENvbm5lY3Rpb25zKCk7IH0KICAgIGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UsIDUwMDApOyB9CiAgfTsKICAkKCcjY29ubicpLm9uY2xpY2sgPSBhc3luYyBlID0+IHsKICAgIGNvbnN0IGQgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1kZWxdJyk7CiAgICBpZiAoZCkgeyBkLmRpc2FibGVkID0gdHJ1ZTsgYXdhaXQgYXBpKGAvYXBpL2Nvbm5lY3Rpb25zLyR7ZC5kYXRhc2V0LmRlbH0ke3NlbGxlclFTKCl9YCwgeyBtZXRob2Q6ICdERUxFVEUnIH0pOyB0b2FzdCgnRGVzY29uZWN0YWRvJyk7IGxvYWRDb25uZWN0aW9ucygpOyB9CiAgICBjb25zdCBjID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtY29weV0nKTsKICAgIGlmIChjKSB7IGUucHJldmVudERlZmF1bHQoKTsgdHJ5IHsgYXdhaXQgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQoYy5kYXRhc2V0LmNvcHkpOyB0b2FzdCgnQ29waWFkbycpOyB9IGNhdGNoIHsgYy5wcmV2aW91c0VsZW1lbnRTaWJsaW5nLnNlbGVjdCgpOyB9IH0KICB9Owp9CgpsZXQgYmxJdGVtcyA9IFtdOwphc3luYyBmdW5jdGlvbiBsb2FkQmxvY2tsaXN0KCkgeyBibEl0ZW1zID0gKGF3YWl0IGFwaSgnL2FwaS9ibG9ja2xpc3QnICsgc2VsbGVyUVMoKSkpLml0ZW1zOyBkcmF3VGFncygpOyB9CmZ1bmN0aW9uIGRyYXdUYWdzKCkgewogIGNvbnN0IHEgPSAoJCgnI2JsUScpPy52YWx1ZSB8fCAnJykudG9Mb3dlckNhc2UoKTsKICBjb25zdCBsaXN0ID0gYmxJdGVtcy5maWx0ZXIoYiA9PiAhcSB8fCBiLnZhbHVlLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMocSkpOwogICQoJyN0YWdzJykuaW5uZXJIVE1MID0gbGlzdC5sZW5ndGggPyBsaXN0Lm1hcChiID0+IGA8c3BhbiBjbGFzcz0idGFnIj4ke2VzYyhiLnZhbHVlKX0gPHNtYWxsPsK3ICR7Yi5tYXJrZXRwbGFjZSA9PT0gJ2FueScgPyAndG9kb3MnIDogTUtbYi5tYXJrZXRwbGFjZV19PC9zbWFsbD48YnV0dG9uIGRhdGEtcm09IiR7Yi5pZH0iIGFyaWEtbGFiZWw9IlF1aXRhciAke2VzYyhiLnZhbHVlKX0iPiR7SS54fTwvYnV0dG9uPjwvc3Bhbj5gKS5qb2luKCcnKQogICAgOiBgPHNwYW4gY2xhc3M9Im11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEzLjVweCI+JHtibEl0ZW1zLmxlbmd0aCA/ICdTaW4gcmVzdWx0YWRvcy4nIDogJ1NpbiBwcm9kdWN0b3MgYmxvcXVlYWRvczogdG9kbyB2YSBhbCBmdWxmaWxsbWVudC4nfTwvc3Bhbj5gOwp9CmFzeW5jIGZ1bmN0aW9uIGxvYWRTZWxsZXJPcmRlcnMoKSB7CiAgaWYgKHRhYiAhPT0gJ3NlbGxlcicgfHwgISQoJyNteVJvd3MnKSkgcmV0dXJuOwogIGxldCBsaXN0OwogIGlmIChtZS51c2VyLnJvbGUgPT09ICdzZWxsZXInKSBsaXN0ID0gKGF3YWl0IGFwaSgnL2FwaS9vcmRlcnM/dmlldz1hbGwnKSkub3JkZXJzLmZpbHRlcihvID0+IG8uc2VsbGVyX2lkID09PSBtZS5zZWxsZXI/LmlkKTsKICBlbHNlIGxpc3QgPSAoYXdhaXQgYXBpKCcvYXBpL29yZGVycz92aWV3PWFsbCcpKS5vcmRlcnMuZmlsdGVyKG8gPT4gby5zZWxsZXJfaWQgPT09IHVpLmFkbWluU2VsbGVyKTsKICAkKCcjbXlSb3dzJykuaW5uZXJIVE1MID0gbGlzdC5sZW5ndGggPyBsaXN0LnNsaWNlKDAsIDYwKS5tYXAobyA9PiBgPHRyPjx0ZCBjbGFzcz0ibW9ubyI+JHtlc2Moby5vcmRlcl9udW1iZXIpfTxzcGFuIGNsYXNzPSJub3RlIj4ke2VzYyhmbXRUaW1lKG8uc29sZF9hdCB8fCBvLmNyZWF0ZWRfYXQpKX0ke28uY3VzdG9tZXIgPyAnIMK3ICcgKyBlc2Moby5jdXN0b21lcikgOiAnJ308L3NwYW4+PC90ZD48dGQ+PHNwYW4gY2xhc3M9Im1rICR7by5tYXJrZXRwbGFjZX0iPiR7TUtbby5tYXJrZXRwbGFjZV0gfHwgJyd9PC9zcGFuPjwvdGQ+PHRkPiR7aXRlbXNIVE1MKG8pfTwvdGQ+PHRkPiR7by5ibG9ja19ubyA/IGA8c3BhbiBjbGFzcz0iYmxvY2tubyI+TsKwICR7by5ibG9ja19ub308L3NwYW4+YCA6ICcnfSR7cGlsbChvKX0ke28uc3RhdGUgPT09ICdibG9ja2VkJyAmJiBvLm93biAhPT0gZmFsc2UgPyBgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IGJ0bi1zbSIgc3R5bGU9Im1hcmdpbi10b3A6NnB4IiBkYXRhLXVuYmxvY2s9IiR7by5pZH0iPkRlc2Jsb3F1ZWFyIGV0aXF1ZXRhPC9idXR0b24+YCA6ICcnfSR7WydwcmludGVkJywgJ3NoaXBwZWQnXS5pbmNsdWRlcyhvLnN0YXRlKSAmJiBvLnByaW50ZWRfYnkgPyBgPHNwYW4gY2xhc3M9Im5vdGUiPkltcHJpbWnDszogJHtlc2Moby5wcmludGVkX2J5KX08L3NwYW4+YCA6ICcnfSR7by5zdGF0ZSA9PT0gJ2Vycm9yJyB8fCBvLnN0YXRlID09PSAnd2FpdGluZycgPyBgPHNwYW4gY2xhc3M9Im5vdGUgJHtvLnN0YXRlID09PSAnZXJyb3InID8gJ2JhZCcgOiAnJ30iPiR7ZXNjKG8uZXJyb3IgfHwgJycpfTwvc3Bhbj5gIDogJyd9PC90ZD48L3RyPmApLmpvaW4oJycpCiAgICA6IGA8dHI+PHRkIGNvbHNwYW49IjQiPjxkaXYgY2xhc3M9ImVtcHR5Ij5Bw7puIG5vIGhheSBwZWRpZG9zLiBDb25lY3RhIHR1cyBtYXJrZXRwbGFjZXMgeSBhcGFyZWNlcsOhbiBhcXXDrS48L2Rpdj48L3RkPjwvdHI+YDsKfQoKLy8gLS0tLS0tLS0tLSBBRE1JTiAtLS0tLS0tLS0tCmFzeW5jIGZ1bmN0aW9uIHJlbmRlckFkbWluKCkgewogIGNvbnN0IFtkLCBzdF0gPSBhd2FpdCBQcm9taXNlLmFsbChbYXBpKCcvYXBpL2FkbWluL3NlbGxlcnMnKSwgYXBpKCcvYXBpL2FkbWluL3NldHRpbmdzJyldKTsKICBjb25zdCBzTmFtZSA9IGlkID0+IGQuc2VsbGVycy5maW5kKHMgPT4gcy5pZCA9PT0gaWQpPy5uYW1lIHx8ICcnOwogIGNvbnN0IHJvbGVOYW1lID0geyBhZG1pbjogJ0FkbWluaXN0cmFkb3InLCBmdWxmaWxsbWVudDogJ0Z1bGZpbGxtZW50Jywgc2VsbGVyOiAnVmVuZGVkb3InIH07CiAgJCgnI21haW4nKS5pbm5lckhUTUwgPSBgCiAgPGRpdiBjbGFzcz0iZ3JpZDIiPgogICAgPGRpdiBjbGFzcz0icGFuZWwiPjxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj5WZW5kZWRvcmVzPC9oMj48L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0icGFuZWwtYm9keSBzdGFjayI+CiAgICAgICAgPGZvcm0gY2xhc3M9InJvdyIgaWQ9Im5ld1NlbGxlciI+PGxhYmVsIGNsYXNzPSJmIj5Ob21icmUgZGUgbGEgdGllbmRhPGlucHV0IHR5cGU9InRleHQiIGlkPSJuc05hbWUiIHJlcXVpcmVkPjwvbGFiZWw+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiIHN0eWxlPSJmbGV4OjAiPkFncmVnYXI8L2J1dHRvbj48L2Zvcm0+CiAgICAgICAgPGRpdiBjbGFzcz0idGFibGUtd3JhcCI+PHRhYmxlIHN0eWxlPSJtaW4td2lkdGg6NDIwcHgiPjx0aGVhZD48dHI+PHRoPlZlbmRlZG9yPC90aD48dGg+TWFya2V0cGxhY2VzPC90aD48dGg+QmxvcXVlYWRvczwvdGg+PHRoPjwvdGg+PC90cj48L3RoZWFkPjx0Ym9keT4KICAgICAgICAke2Quc2VsbGVycy5tYXAocyA9PiBgPHRyPjx0ZD48Yj4ke2VzYyhzLm5hbWUpfTwvYj48L3RkPjx0ZD4ke3MuY29ubmVjdGlvbnMuZmlsdGVyKGMgPT4gTUtbYy5tYXJrZXRwbGFjZV0pLm1hcChjID0+IGA8c3BhbiBjbGFzcz0ibWsgJHtjLm1hcmtldHBsYWNlfSIgdGl0bGU9IiR7ZXNjKGMubGFzdF9lcnJvciB8fCAnT0snKX0iPiR7TUtbYy5tYXJrZXRwbGFjZV19JHtjLmxhc3RfZXJyb3IgPyAnIOKaoCcgOiAnJ308L3NwYW4+YCkuam9pbignICcpIHx8ICc8c3BhbiBjbGFzcz0ibXV0ZWQiPuKAlDwvc3Bhbj4nfTwvdGQ+PHRkPiR7cy5ibG9ja2VkfTwvdGQ+PHRkPjxidXR0b24gY2xhc3M9ImJ0biBidG4tZGFuZ2VyIGJ0bi1zbSIgZGF0YS1kZWxzPSIke3MuaWR9Ij5FbGltaW5hcjwvYnV0dG9uPjwvdGQ+PC90cj5gKS5qb2luKCcnKSB8fCAnPHRyPjx0ZCBjb2xzcGFuPSI0IiBjbGFzcz0ibXV0ZWQiPlNpbiB2ZW5kZWRvcmVzPC90ZD48L3RyPid9CiAgICAgICAgPC90Ym9keT48L3RhYmxlPjwvZGl2PgogICAgICA8L2Rpdj48L2Rpdj4KICAgIDxkaXYgY2xhc3M9InBhbmVsIj48ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj48aDI+VXN1YXJpb3M8L2gyPjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJwYW5lbC1ib2R5IHN0YWNrIj4KICAgICAgICA8Zm9ybSBjbGFzcz0ic3RhY2siIGlkPSJuZXdVc2VyIj4KICAgICAgICAgIDxkaXYgY2xhc3M9InJvdyI+PGxhYmVsIGNsYXNzPSJmIj5Ob21icmU8aW5wdXQgdHlwZT0idGV4dCIgaWQ9Im51TmFtZSIgcmVxdWlyZWQ+PC9sYWJlbD48bGFiZWwgY2xhc3M9ImYiPkNvcnJlbzxpbnB1dCB0eXBlPSJlbWFpbCIgaWQ9Im51RW1haWwiIHJlcXVpcmVkPjwvbGFiZWw+PC9kaXY+CiAgICAgICAgICA8ZGl2IGNsYXNzPSJyb3ciPjxsYWJlbCBjbGFzcz0iZiI+Um9sPHNlbGVjdCBpZD0ibnVSb2xlIj48b3B0aW9uIHZhbHVlPSJzZWxsZXIiPlZlbmRlZG9yPC9vcHRpb24+PG9wdGlvbiB2YWx1ZT0iZnVsZmlsbG1lbnQiPkZ1bGZpbGxtZW50PC9vcHRpb24+PG9wdGlvbiB2YWx1ZT0iYWRtaW4iPkFkbWluaXN0cmFkb3I8L29wdGlvbj48L3NlbGVjdD48L2xhYmVsPgogICAgICAgICAgPGxhYmVsIGNsYXNzPSJmIiBpZD0ibnVTZWxsZXJXcmFwIj5UaWVuZGE8c2VsZWN0IGlkPSJudVNlbGxlciI+JHtkLnNlbGxlcnMubWFwKHMgPT4gYDxvcHRpb24gdmFsdWU9IiR7cy5pZH0iPiR7ZXNjKHMubmFtZSl9PC9vcHRpb24+YCkuam9pbignJyl9PC9zZWxlY3Q+PC9sYWJlbD48L2Rpdj4KICAgICAgICAgIDxkaXYgY2xhc3M9InJvdyI+PGxhYmVsIGNsYXNzPSJmIj5Db250cmFzZcOxYSBpbmljaWFsIChtw61uLiA4KTxpbnB1dCB0eXBlPSJ0ZXh0IiBpZD0ibnVQYXNzIiBtaW5sZW5ndGg9IjgiIHJlcXVpcmVkPjwvbGFiZWw+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiIHN0eWxlPSJmbGV4OjAiPkNyZWFyIHVzdWFyaW88L2J1dHRvbj48L2Rpdj4KICAgICAgICA8L2Zvcm0+CiAgICAgICAgPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjA7Zm9udC1zaXplOjEzcHgiPjxiPkNsYXZlIHRlbXBvcmFsOjwvYj4gY3JlYSB1bmEgY2xhdmUgbnVldmEgcXVlIGxlIGRpY3RhcyBhbCB2ZW5kZWRvcjsgYWwgZW50cmFyIGRlYmUgY2FtYmlhcmxhLiA8Yj5DbGF2ZSBkZSByZXNwYWxkbzo8L2I+IHVuIGPDs2RpZ28gZGUgdW4gc29sbyB1c28gcXVlIGVsIHZlbmRlZG9yIGd1YXJkYSBwb3Igc2kgb2x2aWRhIHN1IGNsYXZlLiA8Yj5FbnRyYXIgY29tbzo8L2I+IGFicmVzIHN1IGN1ZW50YSBzaW4gc2FiZXIgc3UgY2xhdmUsIHBhcmEgYXl1ZGFybG8uPC9wPgogICAgICAgIDxkaXYgY2xhc3M9InRhYmxlLXdyYXAiPjx0YWJsZSBzdHlsZT0ibWluLXdpZHRoOjc2MHB4Ij48dGhlYWQ+PHRyPjx0aD5Vc3VhcmlvPC90aD48dGg+Um9sPC90aD48dGg+QWNjZXNvPC90aD48dGg+PC90aD48L3RyPjwvdGhlYWQ+PHRib2R5PgogICAgICAgICR7ZC51c2Vycy5tYXAodSA9PiBgPHRyPjx0ZD48Yj4ke2VzYyh1Lm5hbWUpfTwvYj48c3BhbiBjbGFzcz0ibm90ZSI+JHtlc2ModS5lbWFpbCl9PC9zcGFuPjwvdGQ+PHRkPiR7cm9sZU5hbWVbdS5yb2xlXX0ke3Uuc2VsbGVyX2lkID8gJyDCtyAnICsgZXNjKHNOYW1lKHUuc2VsbGVyX2lkKSkgOiAnJ308L3RkPjx0ZD4ke3UuaGFzX2JhY2t1cCA/ICc8c3BhbiBjbGFzcz0icGlsbCByZWFkeSIgc3R5bGU9Im1hcmdpbi10b3A6NHB4Ij5SZXNwYWxkbyBsaXN0bzwvc3Bhbj4nIDogJyd9JHt1Lm11c3RfY2hhbmdlID8gJyA8c3BhbiBjbGFzcz0icGlsbCB3YWl0aW5nIiBzdHlsZT0ibWFyZ2luLXRvcDo0cHgiPkRlYmUgY3JlYXIgY2xhdmUgbnVldmE8L3NwYW4+JyA6ICcnfTwvdGQ+PHRkPjxkaXYgY2xhc3M9InJvdy1hY3Rpb25zIj4KICAgICAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tZ2hvc3QgYnRuLXNtIiBkYXRhLWFjdD0idGVtcC1wYXNzd29yZCIgZGF0YS1pZD0iJHt1LmlkfSIgZGF0YS1uYW1lPSIke2VzYyh1Lm5hbWUpfSI+Q2xhdmUgdGVtcG9yYWw8L2J1dHRvbj4KICAgICAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtYWN0PSJiYWNrdXAtY29kZSIgZGF0YS1pZD0iJHt1LmlkfSIgZGF0YS1uYW1lPSIke2VzYyh1Lm5hbWUpfSI+Q2xhdmUgZGUgcmVzcGFsZG88L2J1dHRvbj4KICAgICAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtYWN0PSJzZW5kLWNvZGUiIGRhdGEtaWQ9IiR7dS5pZH0iIGRhdGEtbmFtZT0iJHtlc2ModS5uYW1lKX0iPkVudmlhciBjw7NkaWdvPC9idXR0b24+CiAgICAgICAgICAke3UuaWQgPT09IG1lLnVzZXIuaWQgPyAnJyA6IGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWFjdD0iaW1wZXJzb25hdGUiIGRhdGEtaWQ9IiR7dS5pZH0iIGRhdGEtbmFtZT0iJHtlc2ModS5uYW1lKX0iPkVudHJhciBjb21vPC9idXR0b24+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1kYW5nZXIgYnRuLXNtIiBkYXRhLWRlbHU9IiR7dS5pZH0iPkVsaW1pbmFyPC9idXR0b24+YH08L2Rpdj48L3RkPjwvdHI+YCkuam9pbignJyl9CiAgICAgICAgPC90Ym9keT48L3RhYmxlPjwvZGl2PgogICAgICA8L2Rpdj48L2Rpdj4KICA8L2Rpdj4KICA8ZGl2IGNsYXNzPSJwYW5lbCIgc3R5bGU9Im1hcmdpbi10b3A6MjBweCI+PGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+PGgyPkVubGFjZXMgw7p0aWxlczwvaDI+PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbC1ib2R5Ij48dWwgc3R5bGU9Imxpc3Qtc3R5bGU6bm9uZTttYXJnaW46MDtwYWRkaW5nOjAiPjxsaSBzdHlsZT0iZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MnB4O3BhZGRpbmc6MTBweCAwO2JvcmRlci10b3A6MXB4IHNvbGlkIHZhcigtLWxpbmUpIj48YSBocmVmPSJodHRwczovL2V0aXF1ZXRhaHViLWphdmkub25yZW5kZXIuY29tIiB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciIgc3R5bGU9ImZvbnQtd2VpZ2h0OjcwMCI+VHUgYXBwIEV0aXF1ZXRhSHViPC9hPjxzcGFuIGNsYXNzPSJtb25vIG11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEycHgiPmh0dHBzOi8vZXRpcXVldGFodWItamF2aS5vbnJlbmRlci5jb208L3NwYW4+PHNwYW4gY2xhc3M9Im11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEzcHgiPkVzdGEgbWlzbWEgYXBwLiBDb21ww6FydGVsYSBjb24gbG9zIHZlbmRlZG9yZXMgeSBlbCBmdWxmaWxsbWVudC48L3NwYW4+PC9saT48bGkgc3R5bGU9ImRpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjJweDtwYWRkaW5nOjEwcHggMDtib3JkZXItdG9wOjFweCBzb2xpZCB2YXIoLS1saW5lKSI+PGEgaHJlZj0iaHR0cHM6Ly9kZXZlbG9wZXJzLm1lcmNhZG9saWJyZS5jbC9kZXZjZW50ZXIiIHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIiBzdHlsZT0iZm9udC13ZWlnaHQ6NzAwIj5NZXJjYWRvIExpYnJlIERldmVsb3BlcnM8L2E+PHNwYW4gY2xhc3M9Im1vbm8gbXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTJweCI+aHR0cHM6Ly9kZXZlbG9wZXJzLm1lcmNhZG9saWJyZS5jbC9kZXZjZW50ZXI8L3NwYW4+PHNwYW4gY2xhc3M9Im11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEzcHgiPkRvbmRlIGVzdMOhIGxhIGFwbGljYWNpw7NuIEV0aXF1ZXRhSHViIHkgc3UgU2VjcmV0IEtleS4gRW50cmFzIGNvbiB0dSBjdWVudGEgbm9ybWFsIGRlIE1lcmNhZG8gTGlicmUuPC9zcGFuPjwvbGk+PGxpIHN0eWxlPSJkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDoycHg7cGFkZGluZzoxMHB4IDA7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tbGluZSkiPjxhIGhyZWY9Imh0dHBzOi8vZGFzaGJvYXJkLnJlbmRlci5jb20iIHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIiBzdHlsZT0iZm9udC13ZWlnaHQ6NzAwIj5SZW5kZXI8L2E+PHNwYW4gY2xhc3M9Im1vbm8gbXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTJweCI+aHR0cHM6Ly9kYXNoYm9hcmQucmVuZGVyLmNvbTwvc3Bhbj48c3BhbiBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTNweCI+RG9uZGUgdml2ZSBsYSBhcHAuIEFxdcOtIHNlIHB1YmxpY2EgY2FkYSB2ZXJzacOzbiBudWV2YSAoTWFudWFsIERlcGxveSkuPC9zcGFuPjwvbGk+PGxpIHN0eWxlPSJkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDoycHg7cGFkZGluZzoxMHB4IDA7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tbGluZSkiPjxhIGhyZWY9Imh0dHBzOi8vZ2l0aHViLmNvbS9lZHVhcmRvZGluYXJkaTk2LWJvb3AvZXRpcXVldGFodWIiIHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIiBzdHlsZT0iZm9udC13ZWlnaHQ6NzAwIj5HaXRIdWI8L2E+PHNwYW4gY2xhc3M9Im1vbm8gbXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTJweCI+aHR0cHM6Ly9naXRodWIuY29tL2VkdWFyZG9kaW5hcmRpOTYtYm9vcC9ldGlxdWV0YWh1Yjwvc3Bhbj48c3BhbiBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTNweCI+RWwgY8OzZGlnbyBkZSBsYSBhcHAgeSBlbCByZXNwYWxkbyBhdXRvbcOhdGljbyBjYWRhIDE1IG1pbnV0b3MuPC9zcGFuPjwvbGk+PGxpIHN0eWxlPSJkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDoycHg7cGFkZGluZzoxMHB4IDA7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tbGluZSkiPjxhIGhyZWY9Imh0dHBzOi8vYXBwLmJyZXZvLmNvbSIgdGFyZ2V0PSJfYmxhbmsiIHJlbD0ibm9vcGVuZXIiIHN0eWxlPSJmb250LXdlaWdodDo3MDAiPkJyZXZvPC9hPjxzcGFuIGNsYXNzPSJtb25vIG11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEycHgiPmh0dHBzOi8vYXBwLmJyZXZvLmNvbTwvc3Bhbj48c3BhbiBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTNweCI+RWwgc2VydmljaW8gcXVlIGVudsOtYSBsb3MgY29ycmVvcyBjb24gY8OzZGlnb3MgcGFyYSByZWN1cGVyYXIgY29udHJhc2XDsWEuPC9zcGFuPjwvbGk+PC91bD48L2Rpdj48L2Rpdj4KICA8ZGl2IGNsYXNzPSJwYW5lbCIgc3R5bGU9Im1hcmdpbi10b3A6MjBweCI+PGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+PGgyPkNvbmV4acOzbiBjb24gTWVyY2FkbyBMaWJyZTwvaDI+JHtzdC5tbF9jbGllbnRfaWQgJiYgc3QubWxfc2VjcmV0X3NldCA/ICc8c3BhbiBjbGFzcz0ic3RhdGUgb24iPjxpPjwvaT5Db25maWd1cmFkYTwvc3Bhbj4nIDogJzxzcGFuIGNsYXNzPSJzdGF0ZSBlcnIiPjxpPjwvaT5GYWx0YSBjb25maWd1cmFyPC9zcGFuPid9PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbC1ib2R5IHN0YWNrIj4KICAgICAgPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjAiPkNyZWEgdW5hIGFwbGljYWNpw7NuIGVuIDxhIGhyZWY9Imh0dHBzOi8vZGV2ZWxvcGVycy5tZXJjYWRvbGlicmUuY2wvZGV2Y2VudGVyIiB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciI+ZGV2ZWxvcGVycy5tZXJjYWRvbGlicmUuY2w8L2E+IGNvbiBlc3RvcyBkYXRvcyB5IHBlZ2EgYXF1w60gc3UgQXBwIElEIHkgU2VjcmV0IEtleS4gVW5hIHNvbGEgYXBwIHNpcnZlIHBhcmEgdG9kb3MgbG9zIHZlbmRlZG9yZXMuPC9wPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPlVSSSBkZSByZWRpcmVjdDxzcGFuIGNsYXNzPSJjb3B5Ij48aW5wdXQgdHlwZT0idGV4dCIgcmVhZG9ubHkgdmFsdWU9IiR7ZXNjKHN0Lm1sX3JlZGlyZWN0X3VyaSl9Ij48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWNvcHk9IiR7ZXNjKHN0Lm1sX3JlZGlyZWN0X3VyaSl9Ij5Db3BpYXI8L2J1dHRvbj48L3NwYW4+PC9sYWJlbD4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5VUkwgZGUgbm90aWZpY2FjaW9uZXMgKHTDs3BpY29zOiBvcmRlcnNfdjIgeSBzaGlwbWVudHMpPHNwYW4gY2xhc3M9ImNvcHkiPjxpbnB1dCB0eXBlPSJ0ZXh0IiByZWFkb25seSB2YWx1ZT0iJHtlc2Moc3QubWxfbm90aWZpY2F0aW9uc191cmwpfSI+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1jb3B5PSIke2VzYyhzdC5tbF9ub3RpZmljYXRpb25zX3VybCl9Ij5Db3BpYXI8L2J1dHRvbj48L3NwYW4+PC9sYWJlbD4KICAgICAgPGZvcm0gY2xhc3M9InJvdyIgaWQ9Im1sQ2ZnIj48bGFiZWwgY2xhc3M9ImYiPkFwcCBJRDxpbnB1dCB0eXBlPSJ0ZXh0IiBpZD0ibWxJZCIgdmFsdWU9IiR7ZXNjKHN0Lm1sX2NsaWVudF9pZCl9IiByZXF1aXJlZD48L2xhYmVsPjxsYWJlbCBjbGFzcz0iZiI+U2VjcmV0IEtleTxpbnB1dCB0eXBlPSJwYXNzd29yZCIgaWQ9Im1sU2VjcmV0IiBwbGFjZWhvbGRlcj0iJHtzdC5tbF9zZWNyZXRfc2V0ID8gJ+KAouKAouKAouKAouKAouKAoiAoZ3VhcmRhZGEpJyA6ICcnfSI+PC9sYWJlbD48YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIHR5cGU9InN1Ym1pdCIgc3R5bGU9ImZsZXg6MCI+R3VhcmRhcjwvYnV0dG9uPjwvZm9ybT4KICAgIDwvZGl2PjwvZGl2PgogIDxkaXYgY2xhc3M9InBhbmVsIiBzdHlsZT0ibWFyZ2luLXRvcDoyMHB4Ij48ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj48aDI+Q29ycmVvcyAocmVjdXBlcmFyIGNvbnRyYXNlw7FhKTwvaDI+JHtzdC5tYWlsX2tleV9zZXQgJiYgc3QubWFpbF9mcm9tID8gJzxzcGFuIGNsYXNzPSJzdGF0ZSBvbiI+PGk+PC9pPkFjdGl2YWRvPC9zcGFuPicgOiAnPHNwYW4gY2xhc3M9InN0YXRlIGVyciI+PGk+PC9pPlNpbiBjb25maWd1cmFyPC9zcGFuPid9PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbC1ib2R5IHN0YWNrIj4KICAgICAgPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjAiPlBhcmEgZW52aWFyIGxvcyBjw7NkaWdvcyBkZSA2IGTDrWdpdG9zIHNlIHVzYSA8YSBocmVmPSJodHRwczovL3d3dy5icmV2by5jb20iIHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIj5CcmV2bzwvYT4gKGdyYXRpcyBoYXN0YSAzMDAgY29ycmVvcyBhbCBkw61hKS4gQ3JlYSB1bmEgY3VlbnRhLCB2ZXJpZmljYSBlbCBjb3JyZW8gcmVtaXRlbnRlIHkgY29waWEgdW5hIEFQSSBLZXkgKENvbmZpZ3VyYWNpw7NuIOKAuiBTTVRQIHkgQVBJIOKAuiBBUEkgS2V5cykuPC9wPgogICAgICA8Zm9ybSBjbGFzcz0ic3RhY2siIGlkPSJtYWlsQ2ZnIj4KICAgICAgICA8ZGl2IGNsYXNzPSJyb3ciPjxsYWJlbCBjbGFzcz0iZiI+Q29ycmVvIHJlbWl0ZW50ZSAodmVyaWZpY2FkbyBlbiBCcmV2byk8aW5wdXQgdHlwZT0iZW1haWwiIGlkPSJtRnJvbSIgdmFsdWU9IiR7ZXNjKHN0Lm1haWxfZnJvbSB8fCAnJyl9IiByZXF1aXJlZD48L2xhYmVsPjxsYWJlbCBjbGFzcz0iZiI+Tm9tYnJlIHJlbWl0ZW50ZTxpbnB1dCB0eXBlPSJ0ZXh0IiBpZD0ibU5hbWUiIHZhbHVlPSIke2VzYyhzdC5tYWlsX2Zyb21fbmFtZSB8fCAnRXRpcXVldGFIdWInKX0iPjwvbGFiZWw+PC9kaXY+CiAgICAgICAgPGRpdiBjbGFzcz0icm93Ij48bGFiZWwgY2xhc3M9ImYiPkFQSSBLZXkgZGUgQnJldm88aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJtS2V5IiBwbGFjZWhvbGRlcj0iJHtzdC5tYWlsX2tleV9zZXQgPyAn4oCi4oCi4oCi4oCi4oCi4oCiIChndWFyZGFkYSknIDogJ3hrZXlzaWIt4oCmJ30iPjwvbGFiZWw+PGxhYmVsIGNsYXNzPSJmIj5FbnZpYXIgcHJ1ZWJhIGEgKG9wY2lvbmFsKTxpbnB1dCB0eXBlPSJlbWFpbCIgaWQ9Im1UZXN0IiB2YWx1ZT0iJHtlc2MobWUudXNlci5lbWFpbCl9Ij48L2xhYmVsPjwvZGl2PgogICAgICAgIDxkaXYgY2xhc3M9InJvdyIgc3R5bGU9Imp1c3RpZnktY29udGVudDpmbGV4LWVuZCI+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiIHN0eWxlPSJmbGV4OjAiPkd1YXJkYXI8L2J1dHRvbj48L2Rpdj4KICAgICAgPC9mb3JtPgogICAgPC9kaXY+PC9kaXY+CiAgPGRpdiBjbGFzcz0ibW9kYWwiIGlkPSJjb25maXJtIiBoaWRkZW4+PGRpdiBjbGFzcz0ic2hlZXQiPjxoMyBpZD0iY2ZUaXRsZSI+wr9TZWd1cm8/PC9oMz48cCBjbGFzcz0ibXV0ZWQiIGlkPSJjZlRleHQiIHN0eWxlPSJtYXJnaW46MCI+PC9wPjxkaXYgaWQ9ImNmRXh0cmEiPjwvZGl2PjxkaXYgY2xhc3M9InJvdyIgc3R5bGU9Imp1c3RpZnktY29udGVudDpmbGV4LWVuZCI+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIiBpZD0iY2ZObyIgc3R5bGU9ImZsZXg6MCI+Q2FuY2VsYXI8L2J1dHRvbj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIGlkPSJjZlllcyIgc3R5bGU9ImZsZXg6MCI+Q29uZmlybWFyPC9idXR0b24+PC9kaXY+PC9kaXY+PC9kaXY+YDsKICBjb25zdCByb2xlID0gJCgnI251Um9sZScpOyBjb25zdCBzeW5jID0gKCkgPT4gJCgnI251U2VsbGVyV3JhcCcpLmhpZGRlbiA9IHJvbGUudmFsdWUgIT09ICdzZWxsZXInOyByb2xlLm9uY2hhbmdlID0gc3luYzsgc3luYygpOwogICQoJyNuZXdTZWxsZXInKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4geyBlLnByZXZlbnREZWZhdWx0KCk7IHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9hZG1pbi9zZWxsZXJzJywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBuYW1lOiAkKCcjbnNOYW1lJykudmFsdWUgfSB9KTsgdG9hc3QoJ1ZlbmRlZG9yIGFncmVnYWRvJyk7IHJlbmRlckFkbWluKCk7IH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IH0gfTsKICAkKCcjbmV3VXNlcicpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7IGUucHJldmVudERlZmF1bHQoKTsgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL2FkbWluL3VzZXJzJywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBuYW1lOiAkKCcjbnVOYW1lJykudmFsdWUsIGVtYWlsOiAkKCcjbnVFbWFpbCcpLnZhbHVlLCByb2xlOiByb2xlLnZhbHVlLCBzZWxsZXJfaWQ6ICQoJyNudVNlbGxlcicpLnZhbHVlLCBwYXNzd29yZDogJCgnI251UGFzcycpLnZhbHVlIH0gfSk7IHRvYXN0KCdVc3VhcmlvIGNyZWFkbycpOyByZW5kZXJBZG1pbigpOyB9IGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UsIDQwMDApOyB9IH07CiAgY29uc3QgY29uZmlybUJveCA9ICh0aXRsZSwgdGV4dCwgZXh0cmEgPSAnJykgPT4gbmV3IFByb21pc2UocmVzID0+IHsKICAgICQoJyNjZlRpdGxlJykudGV4dENvbnRlbnQgPSB0aXRsZTsgJCgnI2NmVGV4dCcpLnRleHRDb250ZW50ID0gdGV4dDsgJCgnI2NmRXh0cmEnKS5pbm5lckhUTUwgPSBleHRyYTsgJCgnI2NvbmZpcm0nKS5oaWRkZW4gPSBmYWxzZTsKICAgICQoJyNjZk5vJykub25jbGljayA9ICgpID0+IHsgJCgnI2NvbmZpcm0nKS5oaWRkZW4gPSB0cnVlOyByZXMoZmFsc2UpOyB9OwogICAgJCgnI2NmWWVzJykub25jbGljayA9ICgpID0+IHsgJCgnI2NvbmZpcm0nKS5oaWRkZW4gPSB0cnVlOyByZXModHJ1ZSk7IH07CiAgfSk7CiAgJCgnI21haWxDZmcnKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4gewogICAgZS5wcmV2ZW50RGVmYXVsdCgpOwogICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL2FkbWluL3NldHRpbmdzJywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBtYWlsX2Zyb206ICQoJyNtRnJvbScpLnZhbHVlLCBtYWlsX2Zyb21fbmFtZTogJCgnI21OYW1lJykudmFsdWUsIG1haWxfYXBpX2tleTogJCgnI21LZXknKS52YWx1ZSwgdGVzdF90bzogJCgnI21UZXN0JykudmFsdWUgfSB9KTsgdG9hc3QoJCgnI21UZXN0JykudmFsdWUgPyAnR3VhcmRhZG8uIFRlIGVudmlhbW9zIHVuIGNvcnJlbyBkZSBwcnVlYmEuJyA6ICdHdWFyZGFkbycpOyByZW5kZXJBZG1pbigpOyB9CiAgICBjYXRjaCAoeCkgeyB0b2FzdCh4Lm1lc3NhZ2UsIDUwMDApOyB9CiAgfTsKICAkKCcjbWxDZmcnKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4geyBlLnByZXZlbnREZWZhdWx0KCk7IGF3YWl0IGFwaSgnL2FwaS9hZG1pbi9zZXR0aW5ncycsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgbWxfY2xpZW50X2lkOiAkKCcjbWxJZCcpLnZhbHVlLCBtbF9jbGllbnRfc2VjcmV0OiAkKCcjbWxTZWNyZXQnKS52YWx1ZSB9IH0pOyB0b2FzdCgnTWVyY2FkbyBMaWJyZSBjb25maWd1cmFkbycpOyBtZS5tbENvbmZpZ3VyZWQgPSB0cnVlOyByZW5kZXJBZG1pbigpOyB9OwogICQoJyNtYWluJykub25jbGljayA9IGFzeW5jIGUgPT4gewogICAgY29uc3QgY3AgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1jb3B5XScpOwogICAgaWYgKGNwKSB7IGUucHJldmVudERlZmF1bHQoKTsgdHJ5IHsgYXdhaXQgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQoY3AuZGF0YXNldC5jb3B5KTsgdG9hc3QoJ0NvcGlhZG8nKTsgfSBjYXRjaCB7IGNwLnByZXZpb3VzRWxlbWVudFNpYmxpbmcuc2VsZWN0KCk7IH0gcmV0dXJuOyB9CiAgICBjb25zdCBhY3QgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1hY3RdJyk7CiAgICBpZiAoYWN0KSB7CiAgICAgIGNvbnN0IGlkID0gYWN0LmRhdGFzZXQuaWQsIG5hbWUgPSBhY3QuZGF0YXNldC5uYW1lLCBraW5kID0gYWN0LmRhdGFzZXQuYWN0OwogICAgICBjb25zdCB0ZXh0cyA9IHsKICAgICAgICAndGVtcC1wYXNzd29yZCc6IFsnQ2xhdmUgdGVtcG9yYWwnLCBgU2UgcmVlbXBsYXphIGxhIGNsYXZlIGFjdHVhbCBkZSAke25hbWV9LiBBbCBlbnRyYXIgY29uIGxhIGNsYXZlIHRlbXBvcmFsIHRlbmRyw6EgcXVlIGNyZWFyIHVuYSBudWV2YS5gXSwKICAgICAgICAnYmFja3VwLWNvZGUnOiBbJ0NsYXZlIGRlIHJlc3BhbGRvJywgYFNlIGNyZWEgdW4gY8OzZGlnbyBkZSB1biBzb2xvIHVzbyBwYXJhICR7bmFtZX0uIFNpIHlhIHRlbsOtYSB1bm8sIGVsIGFudGVyaW9yIGRlamEgZGUgc2VydmlyLmBdLAogICAgICAgICdzZW5kLWNvZGUnOiBbJ0VudmlhciBjw7NkaWdvJywgYExlIGxsZWdhIGEgJHtuYW1lfSB1biBjw7NkaWdvIGRlIDYgZMOtZ2l0b3MgYSBzdSBjb3JyZW8gcGFyYSBlbnRyYXIgbyBjYW1iaWFyIHN1IGNsYXZlLmBdLAogICAgICAgICdpbXBlcnNvbmF0ZSc6IFsnRW50cmFyIGNvbW8gJyArIG5hbWUsICdWZXLDoXMgbGEgYXBwIGNvbW8gbGEgdmUgZXN0YSBwZXJzb25hLCBzaW4gbmVjZXNpdGFyIHN1IGNsYXZlLiBRdWVkYSByZWdpc3RyYWRvLiBQYXJhIHNhbGlyIGFwcmlldGEgIlZvbHZlciBhIG1pIGN1ZW50YSIuJ10sCiAgICAgIH07CiAgICAgIGlmICghYXdhaXQgY29uZmlybUJveCh0ZXh0c1traW5kXVswXSwgdGV4dHNba2luZF1bMV0pKSByZXR1cm47CiAgICAgIHRyeSB7CiAgICAgICAgY29uc3QgciA9IGF3YWl0IGFwaShgL2FwaS9hZG1pbi91c2Vycy8ke2lkfS8ke2tpbmR9YCwgeyBtZXRob2Q6ICdQT1NUJyB9KTsKICAgICAgICBpZiAoa2luZCA9PT0gJ2ltcGVyc29uYXRlJykgeyBsb2NhdGlvbi5ocmVmID0gJy8nOyByZXR1cm47IH0KICAgICAgICBpZiAoci5wYXNzd29yZCB8fCByLmNvZGUpIHsKICAgICAgICAgIGNvbnN0IHZhbCA9IHIucGFzc3dvcmQgfHwgci5jb2RlOwogICAgICAgICAgYXdhaXQgY29uZmlybUJveChraW5kID09PSAndGVtcC1wYXNzd29yZCcgPyAnQ2xhdmUgdGVtcG9yYWwgZGUgJyArIG5hbWUgOiAnQ2xhdmUgZGUgcmVzcGFsZG8gZGUgJyArIG5hbWUsCiAgICAgICAgICAgIGtpbmQgPT09ICd0ZW1wLXBhc3N3b3JkJyA/ICdEw61zZWxhIGFsIHVzdWFyaW8uIFNvbG8gc2UgbXVlc3RyYSBhaG9yYTsgYWwgZW50cmFyIHRlbmRyw6EgcXVlIGNyZWFyIHN1IHByb3BpYSBjbGF2ZS4nIDogJ1DDoXNhc2VsYSBhbCB1c3VhcmlvIHBhcmEgcXVlIGxhIGd1YXJkZSBlbiB1biBsdWdhciBzZWd1cm8uIFNpcnZlIHVuYSBzb2xhIHZleiwgZW4gZWwgY2FtcG8gQ29udHJhc2XDsWEuIFNvbG8gc2UgbXVlc3RyYSBhaG9yYS4nLAogICAgICAgICAgICBgPGRpdiBjbGFzcz0iY29weSI+PGlucHV0IHR5cGU9InRleHQiIHJlYWRvbmx5IHZhbHVlPSIke2VzYyh2YWwpfSIgc3R5bGU9ImZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZToyMHB4O3RleHQtYWxpZ246Y2VudGVyIj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWNvcHk9IiR7ZXNjKHZhbCl9Ij5Db3BpYXI8L2J1dHRvbj48L2Rpdj5gKTsKICAgICAgICB9IGVsc2UgdG9hc3Qoci5tZXNzYWdlIHx8ICdMaXN0bycpOwogICAgICAgIHJlbmRlckFkbWluKCk7CiAgICAgIH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSwgNTAwMCk7IH0KICAgICAgcmV0dXJuOwogICAgfQogICAgY29uc3QgcyA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLWRlbHNdJyksIHUgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1kZWx1XScpLCBwID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtcHddJyk7CiAgICBpZiAocyAmJiBhd2FpdCBjb25maXJtQm94KCdFbGltaW5hciB2ZW5kZWRvcicsICdTZSBib3JyYW4gc3VzIGNvbmV4aW9uZXMsIGJsb3F1ZW9zLCBwZWRpZG9zIHkgdXN1YXJpb3MuJykpIHsgYXdhaXQgYXBpKGAvYXBpL2FkbWluL3NlbGxlcnMvJHtzLmRhdGFzZXQuZGVsc31gLCB7IG1ldGhvZDogJ0RFTEVURScgfSk7IHRvYXN0KCdWZW5kZWRvciBlbGltaW5hZG8nKTsgcmVuZGVyQWRtaW4oKTsgfQogICAgaWYgKHUgJiYgYXdhaXQgY29uZmlybUJveCgnRWxpbWluYXIgdXN1YXJpbycsICdZYSBubyBwb2Ryw6EgZW50cmFyIGEgRXRpcXVldGFIdWIuJykpIHsgYXdhaXQgYXBpKGAvYXBpL2FkbWluL3VzZXJzLyR7dS5kYXRhc2V0LmRlbHV9YCwgeyBtZXRob2Q6ICdERUxFVEUnIH0pOyB0b2FzdCgnVXN1YXJpbyBlbGltaW5hZG8nKTsgcmVuZGVyQWRtaW4oKTsgfQogICAgaWYgKHAgJiYgYXdhaXQgY29uZmlybUJveCgnQ2FtYmlhciBjb250cmFzZcOxYScsICdFc2NyaWJlIGxhIG51ZXZhIGNvbnRyYXNlw7FhIChtw61uaW1vIDggY2FyYWN0ZXJlcykuJywgJzxpbnB1dCB0eXBlPSJ0ZXh0IiBpZD0iY2ZQdyIgbWlubGVuZ3RoPSI4Ij4nKSkgewogICAgICB0cnkgeyBhd2FpdCBhcGkoYC9hcGkvYWRtaW4vdXNlcnMvJHtwLmRhdGFzZXQucHd9L3Bhc3N3b3JkYCwgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBwYXNzd29yZDogJCgnI2NmUHcnKS52YWx1ZSB9IH0pOyB0b2FzdCgnQ29udHJhc2XDsWEgYWN0dWFsaXphZGEnKTsgfSBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlKTsgfQogICAgfQogIH07Cn0KCi8vIC0tLS0tLS0tLS0gbWkgY2xhdmUgLS0tLS0tLS0tLQpmdW5jdGlvbiByZW5kZXJNeUFjY291bnQoZm9yY2VkID0gZmFsc2UpIHsKICAkKCcjYXBwJykuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9ImxvZ2luIj48ZGl2IGNsYXNzPSJjYXJkIj48ZGl2IGNsYXNzPSJhcnQiPiR7SEVST19TVkd9PC9kaXY+PGZvcm0gaWQ9Im15Rm9ybSI+CiAgICA8aDE+JHtmb3JjZWQgPyAnQ3JlYSB0dSBjbGF2ZSBudWV2YScgOiAnTWkgY2xhdmUnfTwvaDE+CiAgICA8cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJtYXJnaW46MCI+JHtmb3JjZWQgPyAnRW50cmFzdGUgY29uIHVuYSBjbGF2ZSB0ZW1wb3JhbCBvIGRlIHJlc3BhbGRvLiBDcmVhIHR1IHByb3BpYSBjb250cmFzZcOxYSBwYXJhIHNlZ3Vpci4nIDogZXNjKG1lLnVzZXIuZW1haWwpfTwvcD4KICAgICR7Zm9yY2VkID8gJycgOiAnPGxhYmVsIGNsYXNzPSJmIj5Db250cmFzZcOxYSBhY3R1YWw8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJtQ3VyIiBhdXRvY29tcGxldGU9ImN1cnJlbnQtcGFzc3dvcmQiIHJlcXVpcmVkPjwvbGFiZWw+J30KICAgIDxsYWJlbCBjbGFzcz0iZiI+TnVldmEgY29udHJhc2XDsWEgKG3DrW5pbW8gOCk8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJtUDEiIGF1dG9jb21wbGV0ZT0ibmV3LXBhc3N3b3JkIiBtaW5sZW5ndGg9IjgiIHJlcXVpcmVkPjwvbGFiZWw+CiAgICA8bGFiZWwgY2xhc3M9ImYiPlJlcMOtdGVsYTxpbnB1dCB0eXBlPSJwYXNzd29yZCIgaWQ9Im1QMiIgYXV0b2NvbXBsZXRlPSJuZXctcGFzc3dvcmQiIG1pbmxlbmd0aD0iOCIgcmVxdWlyZWQ+PC9sYWJlbD4KICAgIDxsYWJlbCBjbGFzcz0ic3dpdGNoIiBzdHlsZT0iZm9udC1zaXplOjEzcHgiPjxpbnB1dCB0eXBlPSJjaGVja2JveCIgaWQ9Im1TaG93Ij4gTW9zdHJhciBjb250cmFzZcOxYTwvbGFiZWw+CiAgICA8ZGl2IGNsYXNzPSJlcnIiIGlkPSJtRXJyIj48L2Rpdj4KICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgdHlwZT0ic3VibWl0Ij5HdWFyZGFyPC9idXR0b24+CiAgICAke2ZvcmNlZCA/ICcnIDogJzxidXR0b24gY2xhc3M9ImJ0biBidG4tZ2hvc3QiIHR5cGU9ImJ1dHRvbiIgaWQ9Im1CYWNrdXAiPkNyZWFyIG1pIGNsYXZlIGRlIHJlc3BhbGRvPC9idXR0b24+PGRpdiBpZD0ibUJhY2t1cE91dCI+PC9kaXY+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIiB0eXBlPSJidXR0b24iIGlkPSJtQmFjayI+Vm9sdmVyPC9idXR0b24+J30KICA8L2Zvcm0+PC9kaXY+PC9kaXY+YDsKICAkKCcjbVNob3cnKS5vbmNoYW5nZSA9IGUgPT4geyAkJCgnI215Rm9ybSBpbnB1dFt0eXBlPXBhc3N3b3JkXSwgI215Rm9ybSBpbnB1dFtkYXRhLXB3XScpLmZvckVhY2goaSA9PiB7IGkuZGF0YXNldC5wdyA9IDE7IGkudHlwZSA9IGUudGFyZ2V0LmNoZWNrZWQgPyAndGV4dCcgOiAncGFzc3dvcmQnOyB9KTsgfTsKICAkKCcjbXlGb3JtJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgIGUucHJldmVudERlZmF1bHQoKTsKICAgIGlmICgkKCcjbVAxJykudmFsdWUgIT09ICQoJyNtUDInKS52YWx1ZSkgcmV0dXJuICgkKCcjbUVycicpLnRleHRDb250ZW50ID0gJ0xhcyBjb250cmFzZcOxYXMgbm8gY29pbmNpZGVuJyk7CiAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvbWUvcGFzc3dvcmQnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGN1cnJlbnQ6IGZvcmNlZCA/ICcnIDogJCgnI21DdXInKS52YWx1ZSwgcGFzc3dvcmQ6ICQoJyNtUDEnKS52YWx1ZSB9IH0pOyB0b2FzdCgnQ29udHJhc2XDsWEgZ3VhcmRhZGEnKTsgYm9vdCgpOyB9CiAgICBjYXRjaCAoeCkgeyAkKCcjbUVycicpLnRleHRDb250ZW50ID0geC5tZXNzYWdlOyB9CiAgfTsKICBpZiAoIWZvcmNlZCkgewogICAgJCgnI21CYWNrJykub25jbGljayA9ICgpID0+IGJvb3QoKTsKICAgICQoJyNtQmFja3VwJykub25jbGljayA9IGFzeW5jICgpID0+IHsKICAgICAgdHJ5IHsKICAgICAgICBjb25zdCByID0gYXdhaXQgYXBpKCcvYXBpL21lL2JhY2t1cC1jb2RlJywgeyBtZXRob2Q6ICdQT1NUJyB9KTsKICAgICAgICAkKCcjbUJhY2t1cE91dCcpLmlubmVySFRNTCA9IGA8cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTNweDttYXJnaW46MCAwIDZweCI+R3XDoXJkYWxhIGVuIHVuIGx1Z2FyIHNlZ3VybyAoZm90bywgcGFwZWwgbyBub3RhcyBkZWwgY2VsdWxhcikuIFNpcnZlIHVuYSBzb2xhIHZleiBlbiBlbCBjYW1wbyBDb250cmFzZcOxYSBzaSBvbHZpZGFzIHR1IGNsYXZlLiBTaSBjcmVhcyBvdHJhLCBlc3RhIGRlamEgZGUgc2VydmlyLjwvcD48aW5wdXQgdHlwZT0idGV4dCIgcmVhZG9ubHkgdmFsdWU9IiR7ZXNjKHIuY29kZSl9IiBzdHlsZT0iZm9udC1mYW1pbHk6dmFyKC0tbW9ubyk7Zm9udC1zaXplOjIwcHg7dGV4dC1hbGlnbjpjZW50ZXIiPmA7CiAgICAgIH0gY2F0Y2ggKHgpIHsgJCgnI21FcnInKS50ZXh0Q29udGVudCA9IHgubWVzc2FnZTsgfQogICAgfTsKICB9Cn0KCi8vIC0tLS0tLS0tLS0gaW5pY2lvIC0tLS0tLS0tLS0KYXN5bmMgZnVuY3Rpb24gYm9vdCgpIHsKICB0cnkgeyBtZSA9IGF3YWl0IGFwaSgnL2FwaS9tZScpOyB9CiAgY2F0Y2ggewogICAgY29uc3QgaCA9IGF3YWl0IGZldGNoKCcvYXBpL3NldHVwLXN0YXR1cycpLnRoZW4ociA9PiByLmpzb24oKSkuY2F0Y2goKCkgPT4gKHt9KSk7CiAgICByZXR1cm4gaC5uZWVkc1NldHVwID8gcmVuZGVyU2V0dXAoKSA6IHJlbmRlckxvZ2luKGguZGVtbyk7CiAgfQogIGZpcnN0TG9hZCA9IHRydWU7CiAgaWYgKG1lLm11c3RDaGFuZ2UpIHJldHVybiByZW5kZXJNeUFjY291bnQodHJ1ZSk7CiAgcmVuZGVyU2hlbGwoKTsKfQpib290KCk7Cn0pKCk7Cg==","index.html":"PCFkb2N0eXBlIGh0bWw+CjxodG1sIGxhbmc9ImVzIj4KPGhlYWQ+CjxtZXRhIGNoYXJzZXQ9InV0Zi04Ij4KPG1ldGEgbmFtZT0idmlld3BvcnQiIGNvbnRlbnQ9IndpZHRoPWRldmljZS13aWR0aCwgaW5pdGlhbC1zY2FsZT0xLCB2aWV3cG9ydC1maXQ9Y292ZXIiPgo8dGl0bGU+RXRpcXVldGFIdWI8L3RpdGxlPgo8bGluayByZWw9Imljb24iIGhyZWY9Ii9sb2dvLnN2ZyIgdHlwZT0iaW1hZ2Uvc3ZnK3htbCI+CjxsaW5rIHJlbD0icHJlY29ubmVjdCIgaHJlZj0iaHR0cHM6Ly9mb250cy5nb29nbGVhcGlzLmNvbSI+CjxsaW5rIHJlbD0ic3R5bGVzaGVldCIgaHJlZj0iaHR0cHM6Ly9mb250cy5nb29nbGVhcGlzLmNvbS9jc3MyP2ZhbWlseT1CYWxvbysyOndnaHRANjAwOzcwMDs4MDAmZmFtaWx5PU51bml0bytTYW5zOm9wc3osd2dodEA2Li4xMiw0MDA7Ni4uMTIsNjAwOzYuLjEyLDcwMCZmYW1pbHk9SmV0QnJhaW5zK01vbm86d2dodEA1MDA7NzAwJmRpc3BsYXk9c3dhcCI+CjxsaW5rIHJlbD0ic3R5bGVzaGVldCIgaHJlZj0iL2FwcC5jc3MiPgo8L2hlYWQ+Cjxib2R5Pgo8ZGl2IGlkPSJhcHAiPjxkaXYgc3R5bGU9Im1pbi1oZWlnaHQ6MTAwdmg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtmb250LWZhbWlseTpzeXN0ZW0tdWksc2Fucy1zZXJpZjtjb2xvcjojMEE2RkE2O2ZvbnQtd2VpZ2h0OjcwMCI+Q2FyZ2FuZG8gRXRpcXVldGFIdWLigKYgKGxhIHByaW1lcmEgdmV6IHB1ZWRlIHRhcmRhciBoYXN0YSAxIG1pbnV0byk8L2Rpdj48L2Rpdj4KPGRpdiBjbGFzcz0idG9hc3QiIGlkPSJ0b2FzdCIgaGlkZGVuPjwvZGl2Pgo8c2NyaXB0IHNyYz0iL2FwcC5qcyI+PC9zY3JpcHQ+CjwvYm9keT4KPC9odG1sPgo=","logo.svg":"PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0MCA0MCI+PHJlY3QgeD0iNCIgeT0iOCIgd2lkdGg9IjMyIiBoZWlnaHQ9IjI2IiByeD0iNyIgZmlsbD0iIzE2OTNEMyIvPjxwYXRoIGQ9Ik00IDE2aDMyIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iMi41Ii8+PHJlY3QgeD0iMTAiIHk9IjIxIiB3aWR0aD0iMTIiIGhlaWdodD0iMyIgcng9IjEuNSIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjEwIiB5PSIyNiIgd2lkdGg9IjgiIGhlaWdodD0iMyIgcng9IjEuNSIgZmlsbD0iI0JGRTZGOCIvPjxjaXJjbGUgY3g9IjI5IiBjeT0iMjYiIHI9IjQiIGZpbGw9IiNmZmYiLz48L3N2Zz4K"};
__req('index', './start');
