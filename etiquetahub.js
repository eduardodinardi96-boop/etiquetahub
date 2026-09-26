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
  const map = new Map();
  for (const r of rows) {
    const key = `${r.seller_id}|${(r.sku || r.name).trim().toUpperCase()}|${(r.variant || '').trim().toUpperCase()}`;
    if (!map.has(key)) map.set(key, { seller: r.seller || '', sku: r.sku || r.pub_id || '', name: r.name, variant: r.variant || '', qty: 0, amount: 0, orders: new Set(), byMk: { ml: 0, fa: 0, pa: 0 }, byDay: {} });
    const x = map.get(key);
    x.qty += r.qty; x.amount += r.amount; x.orders.add(r.marketplace + r.order_id);
    x.byMk[r.marketplace] = (x.byMk[r.marketplace] || 0) + r.qty;
    x.byDay[r.day] = (x.byDay[r.day] || 0) + r.qty;
  }
  const list = [...map.values()].map(x => ({ ...x, orders: x.orders.size, amount: Math.round(x.amount) })).sort((a, b) => b.qty - a.qty || b.amount - a.amount);
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
  const all = [[{ v: title, s: 3 }], [], header.map(h => ({ v: h.label, s: 1 })), ...rows.map(r => header.map((h, i) => ({ v: r[i], s: h.money ? 2 : 0 })))];
  const sheetRows = all.map((r, ri) => `<row r="${ri + 1}">${r.map((x, ci) => cell(x.v, ri, ci, x.s)).join('')}</row>`).join('');
  const cols = `<cols>${header.map((h, i) => `<col min="${i + 1}" max="${i + 1}" width="${(widths && widths[i]) || 14}" customWidth="1"/>`).join('')}</cols>`;
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${sheetRows}</sheetData><autoFilter ref="A3:${colName(header.length - 1)}${Math.max(3, rows.length + 3)}"/></worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF0C2B40"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF0A6FA6"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD8EDF9"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
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
  const header = [
    ...(sellerId ? [] : [{ label: 'Vendedor' }]),
    { label: 'Producto' }, { label: 'Variante' }, { label: 'SKU' },
    ...(weekly ? days.map(d => ({ label: `${WD[new Date(d + 'T12:00:00Z').getUTCDay()]} ${d.slice(8)}/${d.slice(5, 7)}` })) : [{ label: 'Mercado Libre' }, { label: 'Falabella' }, { label: 'Paris' }]),
    { label: 'Total unidades' }, { label: 'Ventas' }, { label: 'Monto', money: true },
  ];
  const rows = data.rows.map(r => [
    ...(sellerId ? [] : [r.seller]), r.name, r.variant, r.sku,
    ...(weekly ? days.map(d => r.byDay[d] || 0) : [r.byMk.ml || 0, r.byMk.fa || 0, r.byMk.pa || 0]),
    r.qty, r.orders, r.amount,
  ]);
  const widths = [...(sellerId ? [] : [18]), 46, 24, 18, ...(weekly ? days.map(() => 10) : [14, 12, 10]), 14, 10, 14];
  const title = `Productos vendidos · ${sellerName || 'Todas las cuentas'} · ${from.split('-').reverse().join('/')} al ${to.split('-').reverse().join('/')}`;
  return xlsx(title, header, rows, widths);
}

function start() {
  if (cfg.demo) {
    // datos de ejemplo para el modo demo
    const sellers = db.prepare('SELECT id FROM sellers').all();
    const P = [['Polera básica algodón', 'Blanco · M', 'POL-BAS-B-M'], ['Polera oversize', 'Negro · L', 'POL-OVS-N-L'], ['Jockey trucker', 'Azul marino', 'JCK-TRK-AZ'], ['Hoodie con cierre', 'Celeste · S', 'HOO-ZIP-S'], ['Jogger french terry', 'Gris · XL', 'JOG-GR-XL'], ['Lentes de sol polarizados', 'Marco negro', 'LEN-POL-01']];
    const ins = db.prepare('INSERT OR IGNORE INTO sales (marketplace, external_id, seller_id, day, amount, units) VALUES (?,?,?,?,?,?)');
    const insI = db.prepare('INSERT OR IGNORE INTO sale_items (marketplace, order_id, line, seller_id, day, sku, pub_id, name, variant, qty, amount) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    let n = 0;
    for (const s of sellers) for (let i = 0; i < 60; i++) for (const mk of ['ml', 'fa', 'pa']) {
      const k = mk === 'ml' ? 9 : mk === 'fa' ? 4 : 2;
      for (let j = 0; j < Math.floor(Math.random() * k) + 1; j++) {
        const id = `demo-${s.id}-${i}-${mk}-${j}-${n++}`, p = P[Math.floor(Math.random() * P.length)], q = 1 + Math.floor(Math.random() * 2), amt = (7990 + Math.floor(Math.random() * 25) * 1000) * q, day = localDay(new Date(Date.now() - i * 864e5));
        ins.run(mk, id, s.id, day, amt, q); insI.run(mk, id, 0, s.id, day, p[2], 'MLC' + (1000 + P.indexOf(p)), p[0], p[1], q, amt);
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

global.__EH_PUBLIC = {"app.css":"OnJvb3R7CiAgLS1iZzojRUFGNUZDOyAtLWJnMjojRDhFREY5OyAtLXN1cmZhY2U6I0ZGRkZGRjsgLS1zdXJmYWNlMjojRjRGQUZFOwogIC0taW5rOiMwQzJCNDA7IC0tbXV0ZWQ6IzU1NzI4NzsgLS1saW5lOiNDOUUyRjI7CiAgLS1hY2NlbnQ6IzE2OTNEMzsgLS1hY2NlbnQtc3Ryb25nOiMwQTZGQTY7IC0tc2t5OiM3RkNERjI7IC0taWNlOiNCRkU2Rjg7CiAgLS1vazojMjM5NDZBOyAtLW9rLWJnOiNEREY0RUE7IC0tbG9jazojQzgzRTU1OyAtLWxvY2stYmc6I0ZCRTNFODsgLS13YXJuOiNCNzc5MEY7IC0td2Fybi1iZzojRkNGMEQ2OwogIC0tbWw6I0ZGRTYwMDsgLS1tbC1pbms6IzJEMzI3NzsgLS1mYTojQUFENTAwOyAtLWZhLWluazojMkYzQTAwOyAtLXBhOiMwMDc4Qzg7IC0tcGEtaW5rOiNGRkZGRkY7CiAgLS1zaGFkb3c6MCAxMHB4IDMwcHggLTE0cHggcmdiYSgxMiw3MCwxMTAsLjM1KTsKICAtLWRpc3BsYXk6IkJhbG9vIDIiLCJUcmVidWNoZXQgTVMiLHN5c3RlbS11aSxzYW5zLXNlcmlmOwogIC0tYm9keToiTnVuaXRvIFNhbnMiLHN5c3RlbS11aSwtYXBwbGUtc3lzdGVtLCJTZWdvZSBVSSIsc2Fucy1zZXJpZjsKICAtLW1vbm86IkpldEJyYWlucyBNb25vIix1aS1tb25vc3BhY2UsTWVubG8sQ29uc29sYXMsbW9ub3NwYWNlOwogIGNvbG9yLXNjaGVtZTpsaWdodDsKfQoqe2JveC1zaXppbmc6Ym9yZGVyLWJveH0KaHRtbCxib2R5e21hcmdpbjowfQpib2R5e2JhY2tncm91bmQ6dmFyKC0tYmcpO2NvbG9yOnZhcigtLWluayk7Zm9udC1mYW1pbHk6dmFyKC0tYm9keSk7Zm9udC1zaXplOjE1cHg7bGluZS1oZWlnaHQ6MS41O21pbi1oZWlnaHQ6MTAwdmh9Ci53cmFwe21heC13aWR0aDoxMjQwcHg7bWFyZ2luOjAgYXV0bztwYWRkaW5nLWlubGluZToyMHB4O3BhZGRpbmctYmxvY2s6MCA2MHB4fQpoMSxoMixoM3tmb250LWZhbWlseTp2YXIoLS1kaXNwbGF5KTtsaW5lLWhlaWdodDoxLjE7dGV4dC13cmFwOmJhbGFuY2U7bWFyZ2luOjB9CmJ1dHRvbntmb250OmluaGVyaXQ7Y3Vyc29yOnBvaW50ZXI7Y29sb3I6aW5oZXJpdH0KYXtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KYnV0dG9uOmZvY3VzLXZpc2libGUsaW5wdXQ6Zm9jdXMtdmlzaWJsZSxzZWxlY3Q6Zm9jdXMtdmlzaWJsZSx0ZXh0YXJlYTpmb2N1cy12aXNpYmxlLGE6Zm9jdXMtdmlzaWJsZXtvdXRsaW5lOjNweCBzb2xpZCB2YXIoLS1za3kpO291dGxpbmUtb2Zmc2V0OjJweH0KLm1vbm97Zm9udC1mYW1pbHk6dmFyKC0tbW9ubyk7Zm9udC1zaXplOi44NmVtfQoubXV0ZWR7Y29sb3I6dmFyKC0tbXV0ZWQpfQpbaGlkZGVuXXtkaXNwbGF5Om5vbmUhaW1wb3J0YW50fQoKLyogYmFycmEgc3VwZXJpb3IgKi8KLnRvcHtwb3NpdGlvbjpzdGlja3k7dG9wOjA7ei1pbmRleDoyMDtiYWNrZ3JvdW5kOmNvbG9yLW1peChpbiBzcmdiLHZhcigtLWJnKSA4OCUsdHJhbnNwYXJlbnQpO2JhY2tkcm9wLWZpbHRlcjpibHVyKDhweCk7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tbGluZSl9Ci50b3AgLndyYXB7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6MTRweDtmbGV4LXdyYXA6d3JhcDtwYWRkaW5nLWJsb2NrOjEwcHh9Ci5icmFuZHtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDoxMHB4O2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MjJweDtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKTt0ZXh0LWRlY29yYXRpb246bm9uZX0KLmJyYW5kIGltZ3t3aWR0aDozMnB4O2hlaWdodDozMnB4fQoubmF2e2Rpc3BsYXk6ZmxleDtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czo5OTlweDtwYWRkaW5nOjRweDtnYXA6NHB4fQoubmF2IGJ1dHRvbntib3JkZXI6MDtiYWNrZ3JvdW5kOnRyYW5zcGFyZW50O2NvbG9yOnZhcigtLW11dGVkKTtwYWRkaW5nOjdweCAxNXB4O2JvcmRlci1yYWRpdXM6OTk5cHg7Zm9udC13ZWlnaHQ6NzAwfQoubmF2IGJ1dHRvblthcmlhLWN1cnJlbnQ9InRydWUiXXtiYWNrZ3JvdW5kOnZhcigtLWFjY2VudCk7Y29sb3I6I2ZmZn0KLnNwYWNlcntmbGV4OjF9Ci5saXZle2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjZweDtmb250LXNpemU6MTIuNXB4O2ZvbnQtd2VpZ2h0OjcwMDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5saXZlIGl7d2lkdGg6OXB4O2hlaWdodDo5cHg7Ym9yZGVyLXJhZGl1czo1MCU7YmFja2dyb3VuZDp2YXIoLS1tdXRlZCl9Ci5saXZlLm9ue2NvbG9yOnZhcigtLW9rKX0gLmxpdmUub24gaXtiYWNrZ3JvdW5kOnZhcigtLW9rKTtib3gtc2hhZG93OjAgMCAwIDRweCBjb2xvci1taXgoaW4gc3JnYix2YXIoLS1vaykgMjUlLHRyYW5zcGFyZW50KX0KLmNsb2Nre2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjEwcHg7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTRweDtwYWRkaW5nOjVweCAxMnB4fQouY2xvY2sgYntmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6MTdweDtmb250LXZhcmlhbnQtbnVtZXJpYzp0YWJ1bGFyLW51bXN9Ci5jbG9jayBzbWFsbHtjb2xvcjp2YXIoLS1tdXRlZCk7ZGlzcGxheTpibG9jaztsaW5lLWhlaWdodDoxLjE7Zm9udC1zaXplOjEwLjVweDt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7bGV0dGVyLXNwYWNpbmc6LjA2ZW19Ci5jbG9jay5sYXRlIGJ7Y29sb3I6dmFyKC0tbG9jayl9Ci51c2Vye2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjhweDtmb250LXNpemU6MTMuNXB4fQoudXNlciBie2Rpc3BsYXk6YmxvY2s7bGluZS1oZWlnaHQ6MS4xfQoudXNlciBzbWFsbHtjb2xvcjp2YXIoLS1tdXRlZCl9CgovKiBlbGVtZW50b3MgKi8KLmJ0bnt0ZXh0LWRlY29yYXRpb246bm9uZTtib3JkZXI6MDtib3JkZXItcmFkaXVzOjEzcHg7cGFkZGluZzo5cHggMTVweDtmb250LXdlaWdodDo3MDA7ZGlzcGxheTppbmxpbmUtZmxleDtnYXA6OHB4O2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyO3doaXRlLXNwYWNlOm5vd3JhcH0KLmJ0biBzdmd7d2lkdGg6MThweDtoZWlnaHQ6MThweDtmbGV4Om5vbmV9Ci5idG4tcHJpbWFyeXtiYWNrZ3JvdW5kOnZhcigtLWFjY2VudCk7Y29sb3I6I2ZmZn0KLmJ0bi1wcmltYXJ5OmhvdmVye2JhY2tncm91bmQ6dmFyKC0tYWNjZW50LXN0cm9uZyl9Ci5idG4tZ2hvc3R7YmFja2dyb3VuZDp2YXIoLS1pY2UpO2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQouYnRuLWxpbmV7YmFja2dyb3VuZDp0cmFuc3BhcmVudDtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2NvbG9yOnZhcigtLWluayl9Ci5idG4tZGFuZ2Vye2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayl9Ci5idG46ZGlzYWJsZWR7b3BhY2l0eTouNDU7Y3Vyc29yOm5vdC1hbGxvd2VkfQouYnRuLXNte3BhZGRpbmc6NnB4IDEwcHg7Zm9udC1zaXplOjEzcHg7Ym9yZGVyLXJhZGl1czoxMHB4fQpzZWxlY3QsaW5wdXRbdHlwZT10ZXh0XSxpbnB1dFt0eXBlPWVtYWlsXSxpbnB1dFt0eXBlPXBhc3N3b3JkXSxpbnB1dFt0eXBlPXNlYXJjaF0sdGV4dGFyZWF7Zm9udDppbmhlcml0O2NvbG9yOnZhcigtLWluayk7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlMik7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjEycHg7cGFkZGluZzo4cHggMTJweDttaW4td2lkdGg6MDt3aWR0aDoxMDAlfQp0ZXh0YXJlYXtyZXNpemU6dmVydGljYWw7bWluLWhlaWdodDo3MHB4fQpsYWJlbC5me2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjRweDtmb250LXNpemU6MTIuNXB4O2ZvbnQtd2VpZ2h0OjcwMDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5jaGlwc3tkaXNwbGF5OmZsZXg7Z2FwOjZweDtmbGV4LXdyYXA6d3JhcH0KLmNoaXB7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKTtjb2xvcjp2YXIoLS1pbmspO3BhZGRpbmc6NnB4IDEycHg7Ym9yZGVyLXJhZGl1czo5OTlweDtmb250LXdlaWdodDo2MDA7Zm9udC1zaXplOjEzcHh9Ci5jaGlwW2FyaWEtcHJlc3NlZD0idHJ1ZSJde2JhY2tncm91bmQ6dmFyKC0tYWNjZW50KTtib3JkZXItY29sb3I6dmFyKC0tYWNjZW50KTtjb2xvcjojZmZmfQouc3dpdGNoe2Rpc3BsYXk6aW5saW5lLWZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDoxMHB4O2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTRweDtjdXJzb3I6cG9pbnRlcjt1c2VyLXNlbGVjdDpub25lfQouc3dpdGNoIGlucHV0e2FwcGVhcmFuY2U6bm9uZTt3aWR0aDo0NHB4O2hlaWdodDoyNnB4O2JvcmRlci1yYWRpdXM6OTk5cHg7YmFja2dyb3VuZDp2YXIoLS1saW5lKTtwb3NpdGlvbjpyZWxhdGl2ZTt0cmFuc2l0aW9uOmJhY2tncm91bmQgLjJzO2N1cnNvcjpwb2ludGVyO21hcmdpbjowO2ZsZXg6bm9uZX0KLnN3aXRjaCBpbnB1dDo6YWZ0ZXJ7Y29udGVudDoiIjtwb3NpdGlvbjphYnNvbHV0ZTt0b3A6M3B4O2xlZnQ6M3B4O3dpZHRoOjIwcHg7aGVpZ2h0OjIwcHg7Ym9yZGVyLXJhZGl1czo1MCU7YmFja2dyb3VuZDojZmZmO3RyYW5zaXRpb246bGVmdCAuMnM7Ym94LXNoYWRvdzowIDFweCAzcHggcmdiYSgwLDAsMCwuMjUpfQouc3dpdGNoIGlucHV0OmNoZWNrZWR7YmFja2dyb3VuZDp2YXIoLS1vayl9Ci5zd2l0Y2ggaW5wdXQ6Y2hlY2tlZDo6YWZ0ZXJ7bGVmdDoyMXB4fQoKLnBhbmVse2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjIycHg7Ym94LXNoYWRvdzp2YXIoLS1zaGFkb3cpfQoucGFuZWwtaGVhZHtkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7Z2FwOjEycHg7YWxpZ24taXRlbXM6Y2VudGVyO3BhZGRpbmc6MTZweCAyMHB4O2JvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLWxpbmUpfQoucGFuZWwtaGVhZCBoMntmb250LXNpemU6MjNweDttYXJnaW4tcmlnaHQ6YXV0b30KLnBhbmVsLWJvZHl7cGFkZGluZzoxNnB4IDIwcHh9Ci5wYW5lbC1mb290e2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6MTBweDthbGlnbi1pdGVtczpjZW50ZXI7cGFkZGluZzoxNHB4IDIwcHg7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tbGluZSk7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtc2l6ZToxMy41cHh9CgoubWt7ZGlzcGxheTppbmxpbmUtZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Zm9udC13ZWlnaHQ6NzAwO2ZvbnQtc2l6ZToxMnB4O3BhZGRpbmc6M3B4IDlweDtib3JkZXItcmFkaXVzOjhweDt3aGl0ZS1zcGFjZTpub3dyYXB9Ci5tay5tbHtiYWNrZ3JvdW5kOnZhcigtLW1sKTtjb2xvcjp2YXIoLS1tbC1pbmspfSAubWsuZmF7YmFja2dyb3VuZDp2YXIoLS1mYSk7Y29sb3I6dmFyKC0tZmEtaW5rKX0gLm1rLnBhe2JhY2tncm91bmQ6dmFyKC0tcGEpO2NvbG9yOnZhcigtLXBhLWluayl9Ci5waWxse2Rpc3BsYXk6aW5saW5lLWZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo2cHg7Ym9yZGVyLXJhZGl1czo5OTlweDtwYWRkaW5nOjRweCAxMHB4O2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTIuNXB4O3doaXRlLXNwYWNlOm5vd3JhcH0KLnBpbGwgc3Zne3dpZHRoOjE0cHg7aGVpZ2h0OjE0cHh9Ci5waWxsLnJlYWR5e2JhY2tncm91bmQ6dmFyKC0tb2stYmcpO2NvbG9yOnZhcigtLW9rKX0KLnBpbGwuYmxvY2tlZHtiYWNrZ3JvdW5kOiNFM0U3RUM7Y29sb3I6IzRBNTU2M30KLnBpbGwucHJpbnRlZHtiYWNrZ3JvdW5kOnZhcigtLWxvY2stYmcpO2NvbG9yOnZhcigtLWxvY2spfQoucGlsbC53YWl0aW5ne2JhY2tncm91bmQ6dmFyKC0td2Fybi1iZyk7Y29sb3I6dmFyKC0td2Fybil9Ci5waWxsLmVycm9ye2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayl9Ci5waWxsLmNhbmNlbGxlZHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKTtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5ub3Rle2Rpc3BsYXk6YmxvY2s7Zm9udC1zaXplOjEycHg7Y29sb3I6dmFyKC0tbXV0ZWQpO21hcmdpbi10b3A6NHB4O21heC13aWR0aDozNGNofQoubm90ZS5iYWR7Y29sb3I6dmFyKC0tbG9jayl9CgovKiBow6lyb2UgKi8KLmhlcm97ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczoxLjFmciAuOWZyO2dhcDoyNHB4O2FsaWduLWl0ZW1zOmNlbnRlcjtwYWRkaW5nLWJsb2NrOjI0cHggNnB4fQouaGVybyBoMXtmb250LXNpemU6Y2xhbXAoMjhweCwzLjZ2dyw0MHB4KTtmb250LXdlaWdodDo4MDB9Ci5oZXJvIGgxIGVte2ZvbnQtc3R5bGU6bm9ybWFsO2NvbG9yOnZhcigtLWFjY2VudCl9Ci5oZXJvIHB7Y29sb3I6dmFyKC0tbXV0ZWQpO21heC13aWR0aDo1NmNoO21hcmdpbjoxMHB4IDAgMH0KLmhlcm8gc3Zne3dpZHRoOjEwMCU7aGVpZ2h0OmF1dG87bWF4LWhlaWdodDoyMTBweH0KCi8qIGtwaXMgKi8KLmtwaXN7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoNCwxZnIpO2dhcDoxNHB4O21hcmdpbi1ibG9jazoxOHB4fQoua3Bpe2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjE4cHg7cGFkZGluZzoxNHB4IDE2cHg7ZGlzcGxheTpmbGV4O2dhcDoxMnB4O2FsaWduLWl0ZW1zOmNlbnRlcn0KLmtwaSAuaWN7d2lkdGg6NDJweDtoZWlnaHQ6NDJweDtib3JkZXItcmFkaXVzOjEycHg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtmbGV4Om5vbmV9Ci5rcGkgLmljIHN2Z3t3aWR0aDoyMnB4O2hlaWdodDoyMnB4fQoua3BpLm9rIC5pY3tiYWNrZ3JvdW5kOnZhcigtLW9rLWJnKTtjb2xvcjp2YXIoLS1vayl9Ci5rcGkud2FpdCAuaWN7YmFja2dyb3VuZDp2YXIoLS13YXJuLWJnKTtjb2xvcjp2YXIoLS13YXJuKX0KLmtwaS5sb2NrIC5pY3tiYWNrZ3JvdW5kOnZhcigtLWxvY2stYmcpO2NvbG9yOnZhcigtLWxvY2spfQoua3BpLmRvbmUgLmlje2JhY2tncm91bmQ6dmFyKC0taWNlKTtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KLmtwaSBie2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtc2l6ZToyOHB4O2xpbmUtaGVpZ2h0OjE7ZGlzcGxheTpibG9jaztmb250LXZhcmlhbnQtbnVtZXJpYzp0YWJ1bGFyLW51bXN9Ci5rcGkgc3Bhbntjb2xvcjp2YXIoLS1tdXRlZCk7Zm9udC1zaXplOjEzcHh9CgouYXV0b2JhcntkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7Z2FwOjE0cHg7YWxpZ24taXRlbXM6Y2VudGVyO2p1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuO2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDEyMGRlZyx2YXIoLS1iZzIpLHZhcigtLXN1cmZhY2UpKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MThweDtwYWRkaW5nOjE0cHggMThweDttYXJnaW4tYm90dG9tOjE2cHh9Ci5hdXRvYmFyIHB7bWFyZ2luOjJweCAwIDA7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtc2l6ZToxM3B4O21heC13aWR0aDo3MGNofQoKLmZpbHRlcnN7ZGlzcGxheTpmbGV4O2ZsZXgtd3JhcDp3cmFwO2dhcDoxMHB4O2FsaWduLWl0ZW1zOmNlbnRlcn0KLmZpbHRlcnMgc2VsZWN0LC5maWx0ZXJzIGlucHV0e3dpZHRoOmF1dG99Ci50YWJsZS13cmFwe292ZXJmbG93LXg6YXV0b30KdGFibGV7d2lkdGg6MTAwJTtib3JkZXItY29sbGFwc2U6Y29sbGFwc2U7bWluLXdpZHRoOjgyMHB4fQp0aHtmb250LXNpemU6MTEuNXB4O3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtsZXR0ZXItc3BhY2luZzouMDdlbTtjb2xvcjp2YXIoLS1tdXRlZCk7dGV4dC1hbGlnbjpsZWZ0O3BhZGRpbmc6MTBweCAxNHB4O2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZTIpO3doaXRlLXNwYWNlOm5vd3JhcH0KdGR7cGFkZGluZzoxMXB4IDE0cHg7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tbGluZSk7dmVydGljYWwtYWxpZ246bWlkZGxlfQp0ci5pcy1ibG9ja2VkIHRke2JhY2tncm91bmQ6Y29sb3ItbWl4KGluIHNyZ2IsdmFyKC0tbG9jay1iZykgNDUlLHRyYW5zcGFyZW50KX0KdHIuaXMtbmV3IHRke2FuaW1hdGlvbjpmbGFzaCAyLjVzIGVhc2Utb3V0fQpAa2V5ZnJhbWVzIGZsYXNoe2Zyb217YmFja2dyb3VuZDpjb2xvci1taXgoaW4gc3JnYix2YXIoLS1za3kpIDQ1JSx0cmFuc3BhcmVudCl9dG97YmFja2dyb3VuZDp0cmFuc3BhcmVudH19Ci5pdGVtc3tkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDoycHg7Zm9udC1zaXplOjEzLjVweH0KLml0ZW1zIC52e2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTIuNXB4fQouaXRlbXMgLmJhZHtjb2xvcjp2YXIoLS1sb2NrKTtmb250LXdlaWdodDo3MDB9Ci5jYnt3aWR0aDoxOXB4O2hlaWdodDoxOXB4O2FjY2VudC1jb2xvcjp2YXIoLS1hY2NlbnQpfQoubG9ja2NlbGx7Y29sb3I6dmFyKC0tbG9jayk7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcn0KLmxvY2tjZWxsIHN2Z3t3aWR0aDoxOHB4O2hlaWdodDoxOHB4fQoucm93LWFjdGlvbnN7ZGlzcGxheTpmbGV4O2dhcDo2cHg7ZmxleC13cmFwOndyYXB9Ci5lbXB0eXtwYWRkaW5nOjQwcHggMjBweDt0ZXh0LWFsaWduOmNlbnRlcjtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5lbXB0eSBzdmd7d2lkdGg6MTIwcHg7aGVpZ2h0OmF1dG87bWFyZ2luLWJvdHRvbToxMHB4fQoKLyogdmVuZGVkb3IgKi8KLnNlY3Rpb24tdGl0bGV7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6MTJweDtmbGV4LXdyYXA6d3JhcDttYXJnaW4tYmxvY2s6MjRweCAxMnB4fQouc2VjdGlvbi10aXRsZSBoMntmb250LXNpemU6MjZweH0KLmNvbm57ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoMywxZnIpO2dhcDoxNHB4fQoubWNhcmR7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MjBweDtwYWRkaW5nOjE2cHg7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MTBweH0KLm1jYXJkIC5sb2dve2hlaWdodDo0NHB4O2JvcmRlci1yYWRpdXM6MTJweDtkaXNwbGF5OmdyaWQ7cGxhY2UtaXRlbXM6Y2VudGVyO2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MThweH0KLm1jYXJkIC5ob3d7Zm9udC1zaXplOjEyLjVweDtjb2xvcjp2YXIoLS1tdXRlZCk7bWFyZ2luOjB9Ci5zdGF0ZXtmb250LXNpemU6MTNweDtmb250LXdlaWdodDo3MDA7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4fQouc3RhdGUub257Y29sb3I6dmFyKC0tb2spfSAuc3RhdGUub2Zme2NvbG9yOnZhcigtLW11dGVkKX0gLnN0YXRlLmVycntjb2xvcjp2YXIoLS1sb2NrKX0KLnN0YXRlIGl7d2lkdGg6OHB4O2hlaWdodDo4cHg7Ym9yZGVyLXJhZGl1czo1MCU7YmFja2dyb3VuZDpjdXJyZW50Q29sb3I7ZGlzcGxheTppbmxpbmUtYmxvY2t9Ci5jb3B5e2Rpc3BsYXk6ZmxleDtnYXA6NnB4fQouY29weSBpbnB1dHtmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6MTEuNXB4fQouZ3JpZDJ7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczoxZnIgMWZyO2dhcDoyMHB4O21hcmdpbi10b3A6MjBweH0KLnJ1bGV7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczphdXRvIDFmcjtnYXA6MTRweDthbGlnbi1pdGVtczpjZW50ZXI7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlMik7Ym9yZGVyOjFweCBkYXNoZWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czoxNnB4O3BhZGRpbmc6MTJweCAxNHB4fQoucnVsZSBzdmd7d2lkdGg6MTEwcHg7aGVpZ2h0OmF1dG99Ci5ydWxlIHB7bWFyZ2luOjA7Zm9udC1zaXplOjEzLjVweDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5ydWxlIGJ7Y29sb3I6dmFyKC0taW5rKX0KLmFkZHJvd3tkaXNwbGF5OmdyaWQ7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmciAxNTBweCBhdXRvO2dhcDo4cHg7YWxpZ24taXRlbXM6c3RhcnR9Ci50YWdze2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6OHB4O21heC1oZWlnaHQ6MjYwcHg7b3ZlcmZsb3c6YXV0b30KLnRhZ3tkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4O2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayk7Ym9yZGVyLXJhZGl1czoxMHB4O3BhZGRpbmc6NHB4IDRweCA0cHggMTBweDtmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6MTIuNXB4O2ZvbnQtd2VpZ2h0OjcwMH0KLnRhZyBzbWFsbHtmb250LWZhbWlseTp2YXIoLS1ib2R5KTtmb250LXdlaWdodDo2MDA7b3BhY2l0eTouOH0KLnRhZyBidXR0b257Ym9yZGVyOjA7YmFja2dyb3VuZDp0cmFuc3BhcmVudDtjb2xvcjppbmhlcml0O3dpZHRoOjI0cHg7aGVpZ2h0OjI0cHg7Ym9yZGVyLXJhZGl1czo2cHg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcn0KLnRhZyBidXR0b246aG92ZXJ7YmFja2dyb3VuZDpjb2xvci1taXgoaW4gc3JnYix2YXIoLS1sb2NrKSAxOCUsdHJhbnNwYXJlbnQpfQouc3RhY2t7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MTJweH0KLnJvd3tkaXNwbGF5OmZsZXg7Z2FwOjEwcHg7ZmxleC13cmFwOndyYXA7YWxpZ24taXRlbXM6ZW5kfQoucm93ID4gKntmbGV4OjE7bWluLXdpZHRoOjE1MHB4fQoKLyogbG9naW4gKi8KLmxvZ2lue21pbi1oZWlnaHQ6MTAwdmg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtwYWRkaW5nOjIwcHh9Ci5sb2dpbiAuY2FyZHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czoyNnB4O2JveC1zaGFkb3c6dmFyKC0tc2hhZG93KTt3aWR0aDoxMDAlO21heC13aWR0aDo0MjBweDtvdmVyZmxvdzpoaWRkZW59Ci5sb2dpbiAuYXJ0e2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDEzNWRlZyx2YXIoLS1iZzIpLHZhcigtLWljZSkpO3BhZGRpbmc6MjJweCAyNHB4IDhweH0KLmxvZ2luIC5hcnQgc3Zne3dpZHRoOjEwMCU7aGVpZ2h0OmF1dG99Ci5sb2dpbiBmb3Jte3BhZGRpbmc6MjJweCAyNHB4IDI2cHg7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MTJweH0KLmxvZ2luIGgxe2ZvbnQtc2l6ZTozMHB4O2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQouZXJye2NvbG9yOnZhcigtLWxvY2spO2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTMuNXB4O21pbi1oZWlnaHQ6MS4yZW19Ci5kZW1vLWhpbnR7Zm9udC1zaXplOjEyLjVweDtiYWNrZ3JvdW5kOnZhcigtLXdhcm4tYmcpO2NvbG9yOnZhcigtLXdhcm4pO3BhZGRpbmc6OHB4IDEycHg7Ym9yZGVyLXJhZGl1czoxMnB4fQoKLnRvYXN0e3Bvc2l0aW9uOmZpeGVkO2xlZnQ6NTAlO2JvdHRvbToyMnB4O3RyYW5zZm9ybTp0cmFuc2xhdGVYKC01MCUpO2JhY2tncm91bmQ6dmFyKC0taW5rKTtjb2xvcjp2YXIoLS1iZyk7cGFkZGluZzoxMHB4IDE4cHg7Ym9yZGVyLXJhZGl1czoxMnB4O2ZvbnQtd2VpZ2h0OjcwMDt6LWluZGV4OjYwO21heC13aWR0aDpjYWxjKDEwMCUgLSAzMnB4KX0KLm1vZGFse3Bvc2l0aW9uOmZpeGVkO2luc2V0OjA7ei1pbmRleDo1MDtiYWNrZ3JvdW5kOnJnYmEoNiwzMCw0OCwuNTUpO2Rpc3BsYXk6Z3JpZDtwbGFjZS1pdGVtczpjZW50ZXI7cGFkZGluZzoxNnB4fQouc2hlZXR7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXItcmFkaXVzOjIycHg7bWF4LXdpZHRoOjUyMHB4O3dpZHRoOjEwMCU7cGFkZGluZzoyMHB4O2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjEycHh9CgpAbWVkaWEgKG1heC13aWR0aDo5ODBweCl7CiAgLmhlcm8sLmdyaWQye2dyaWQtdGVtcGxhdGUtY29sdW1uczoxZnJ9CiAgLmhlcm8gc3Zne2Rpc3BsYXk6bm9uZX0KICAua3Bpc3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDIsMWZyKX0KICAuY29ubntncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyfQp9CkBtZWRpYSAobWF4LXdpZHRoOjUyMHB4KXsKICAud3JhcHtwYWRkaW5nLWlubGluZToxNnB4fQogIC5hZGRyb3d7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmcn0KICAucnVsZXtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyfQogIC51c2VyIHNtYWxse2Rpc3BsYXk6bm9uZX0KfQpAbWVkaWEgKHByZWZlcnMtcmVkdWNlZC1tb3Rpb246bm8tcHJlZmVyZW5jZSl7CiAgLnRydWNre2FuaW1hdGlvbjpkcml2ZSA2cyBlYXNlLWluLW91dCBpbmZpbml0ZX0KICBAa2V5ZnJhbWVzIGRyaXZlezAlLDEwMCV7dHJhbnNmb3JtOnRyYW5zbGF0ZVgoMCl9NTAle3RyYW5zZm9ybTp0cmFuc2xhdGVYKDE2cHgpfX0KfQouZ3JpZDIgPiAqe21pbi13aWR0aDowfQovKiBiYW5kZWphIG51ZXZhICovCi50YWJzYmlne2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDUsMWZyKTtnYXA6MTJweDttYXJnaW4tYm90dG9tOjE2cHh9Ci50YntkaXNwbGF5OmZsZXg7Z2FwOjEycHg7YWxpZ24taXRlbXM6Y2VudGVyO3RleHQtYWxpZ246bGVmdDtib3JkZXI6MnB4IHNvbGlkIHZhcigtLWxpbmUpO2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyLXJhZGl1czoxOHB4O3BhZGRpbmc6MTRweCAxNnB4O2NvbG9yOnZhcigtLWluayl9Ci50YiAudGItaWN7d2lkdGg6NDRweDtoZWlnaHQ6NDRweDtib3JkZXItcmFkaXVzOjEycHg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtmbGV4Om5vbmV9Ci50YiAudGItaWMgc3Zne3dpZHRoOjIycHg7aGVpZ2h0OjIycHh9Ci50YiBie2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtc2l6ZTozMHB4O2xpbmUtaGVpZ2h0OjE7ZGlzcGxheTpibG9jaztmb250LXZhcmlhbnQtbnVtZXJpYzp0YWJ1bGFyLW51bXN9Ci50YiAudGItbntmb250LXdlaWdodDo4MDA7ZGlzcGxheTpibG9ja30KLnRiIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTJweDtkaXNwbGF5OmJsb2NrO2xpbmUtaGVpZ2h0OjEuMn0KLnRiLXJlYWR5IC50Yi1pY3tiYWNrZ3JvdW5kOnZhcigtLWljZSk7Y29sb3I6dmFyKC0tYWNjZW50LXN0cm9uZyl9Ci50Yi13YWl0aW5nIC50Yi1pY3tiYWNrZ3JvdW5kOnZhcigtLXdhcm4tYmcpO2NvbG9yOnZhcigtLXdhcm4pfQoudGItcHJpbnRlZCAudGItaWN7YmFja2dyb3VuZDp2YXIoLS1vay1iZyk7Y29sb3I6dmFyKC0tb2spfQoudGItYmxvY2tlZCAudGItaWN7YmFja2dyb3VuZDp2YXIoLS1sb2NrLWJnKTtjb2xvcjp2YXIoLS1sb2NrKX0KLnRiW2FyaWEtcHJlc3NlZD0idHJ1ZSJde2JvcmRlci1jb2xvcjp2YXIoLS1hY2NlbnQpO2JveC1zaGFkb3c6MCAwIDAgM3B4IGNvbG9yLW1peChpbiBzcmdiLHZhcigtLWFjY2VudCkgMjIlLHRyYW5zcGFyZW50KX0KLnRiLXJlYWR5W2FyaWEtcHJlc3NlZD0idHJ1ZSJde2JhY2tncm91bmQ6Y29sb3ItbWl4KGluIHNyZ2IsdmFyKC0taWNlKSA0NSUsdmFyKC0tc3VyZmFjZSkpfQouY2hpcCAuY250e2Rpc3BsYXk6aW5saW5lLWJsb2NrO21pbi13aWR0aDoyMHB4O3BhZGRpbmc6MCA2cHg7Ym9yZGVyLXJhZGl1czo5OTlweDtiYWNrZ3JvdW5kOmNvbG9yLW1peChpbiBzcmdiLGN1cnJlbnRDb2xvciAxNSUsdHJhbnNwYXJlbnQpO2ZvbnQtc2l6ZToxMS41cHg7bWFyZ2luLWxlZnQ6NHB4fQouYWN0aW9uYmFye2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6MTBweDthbGlnbi1pdGVtczpjZW50ZXI7cGFkZGluZzoxMnB4IDIwcHg7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tbGluZSk7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlMil9Ci5kYXloZWFke3BhZGRpbmc6MTBweCAyMHB4O2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MTNweDt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7bGV0dGVyLXNwYWNpbmc6LjA2ZW07Y29sb3I6dmFyKC0tYWNjZW50LXN0cm9uZyk7YmFja2dyb3VuZDp2YXIoLS1iZyk7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tbGluZSl9Ci5vcm93e2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MzRweCAxMTBweCAxZnIgYXV0bztnYXA6MTRweDthbGlnbi1pdGVtczpjZW50ZXI7cGFkZGluZzoxMnB4IDIwcHg7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tbGluZSl9Ci5vcm93LnN0LXByaW50ZWR7b3BhY2l0eTouOH0KLm9yb3cuc3QtYmxvY2tlZHtiYWNrZ3JvdW5kOmNvbG9yLW1peChpbiBzcmdiLHZhcigtLWxvY2stYmcpIDQ1JSx0cmFuc3BhcmVudCl9Ci5vYy10aW1le2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjRweDthbGlnbi1pdGVtczpmbGV4LXN0YXJ0fQoub2MtdGltZSBie2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZToxOHB4fQoub2MtdG9we2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6OHB4O2FsaWduLWl0ZW1zOmJhc2VsaW5lO21hcmdpbi1ib3R0b206MnB4fQouY3VzdHtmb250LXdlaWdodDo4MDA7Zm9udC1zaXplOjE1LjVweH0KLmN1c3Q6OmFmdGVye2NvbnRlbnQ6IsK3IjttYXJnaW4tbGVmdDo4cHg7Y29sb3I6dmFyKC0tbXV0ZWQpfQoub2MtYWN0e2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47YWxpZ24taXRlbXM6ZmxleC1lbmQ7Z2FwOjhweH0KLm9yb3cuaXMtbmV3e2FuaW1hdGlvbjpmbGFzaCAyLjVzIGVhc2Utb3V0fQpAbWVkaWEgKG1heC13aWR0aDo4MjBweCl7CiAgLnRhYnNiaWd7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgyLDFmcil9CiAgLm9yb3d7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjI4cHggMWZyO30KICAub3JvdyAub2MtdGltZXtmbGV4LWRpcmVjdGlvbjpyb3c7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo4cHh9CiAgLm9yb3cgLm9jLW1haW4sLm9yb3cgLm9jLWFjdHtncmlkLWNvbHVtbjoyfQogIC5vYy1hY3R7YWxpZ24taXRlbXM6ZmxleC1zdGFydH0KfQoKLyogaW1wcmVzYXMgZW4gcm9qbyAoY29tbyBNZXJjYWRvIExpYnJlKSwgYmxvcXVlYWRhcyBlbiBncmlzICovCi50Yi1wcmludGVkIC50Yi1pY3tiYWNrZ3JvdW5kOnZhcigtLWxvY2stYmcpO2NvbG9yOnZhcigtLWxvY2spfQoudGItYmxvY2tlZCAudGItaWN7YmFja2dyb3VuZDojRTNFN0VDO2NvbG9yOiM0QTU1NjN9Ci5vcm93LnN0LXByaW50ZWR7b3BhY2l0eToxO2JhY2tncm91bmQ6I0ZGRjdGOH0KLm9yb3cuc3QtYmxvY2tlZHtiYWNrZ3JvdW5kOiNGM0Y1Rjd9Ci5vcm93LnN0LWJsb2NrZWQgLmxvY2tjZWxse2NvbG9yOiM0QTU1NjN9Ci5idG4tcmVwcmludHtiYWNrZ3JvdW5kOnZhcigtLWxvY2spO2NvbG9yOiNmZmZ9Ci5idG4tcmVwcmludDpob3ZlcntmaWx0ZXI6YnJpZ2h0bmVzcyguOTIpfQoKLnBpbGwuc2hpcHBlZHtiYWNrZ3JvdW5kOiNFM0U3RUM7Y29sb3I6IzM0NDE0Rn0KLm9yb3cuc3Qtc2hpcHBlZHtiYWNrZ3JvdW5kOiNGQUZCRkN9CgoudGItdG9kYXkgLnRiLWlje2JhY2tncm91bmQ6dmFyKC0taWNlKTtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KLnRiLXVwY29taW5nIC50Yi1pY3tiYWNrZ3JvdW5kOiNFREU5RkU7Y29sb3I6IzZEMjhEOX0KLnRiLXRvZGF5W2FyaWEtcHJlc3NlZD0idHJ1ZSJde2JhY2tncm91bmQ6Y29sb3ItbWl4KGluIHNyZ2IsdmFyKC0taWNlKSA0NSUsdmFyKC0tc3VyZmFjZSkpfQouc2hpcHR5cGV7Zm9udC1zaXplOjExcHg7Zm9udC13ZWlnaHQ6ODAwO3BhZGRpbmc6MnB4IDhweDtib3JkZXItcmFkaXVzOjZweDtiYWNrZ3JvdW5kOiNFRUYyRjY7Y29sb3I6IzM0NDE0Rn0KLnNoaXB0eXBlLnN0LWZsZXh7YmFja2dyb3VuZDojMTZBMzRBO2NvbG9yOiNmZmZ9Ci5zaGlwdHlwZS5zdC1jb2xlY3Rhe2JhY2tncm91bmQ6I0RCRUFGRTtjb2xvcjojMUU0MEFGfQouc2hpcHR5cGUuc3QtYWdlbmNpYXtiYWNrZ3JvdW5kOiNGRUYzQzc7Y29sb3I6IzkyNDAwRX0KLmRpc3BhdGNoe2Rpc3BsYXk6aW5saW5lLWJsb2NrO2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MTIuNXB4O2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpO2JhY2tncm91bmQ6dmFyKC0taWNlKTtib3JkZXItcmFkaXVzOjhweDtwYWRkaW5nOjJweCA4cHg7bWFyZ2luLWJvdHRvbTo0cHh9Ci5kaXNwYXRjaC5sYXRle2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayl9CkBtZWRpYSAobWF4LXdpZHRoOjExMDBweCl7LnRhYnNiaWd7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgzLDFmcil9fQpAbWVkaWEgKG1heC13aWR0aDo2NDBweCl7LnRhYnNiaWd7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgyLDFmcil9fQoKLmJsb2Nrbm97ZGlzcGxheTppbmxpbmUtYmxvY2s7YmFja2dyb3VuZDp2YXIoLS1pbmspO2NvbG9yOiNmZmY7Zm9udC13ZWlnaHQ6ODAwO2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2JvcmRlci1yYWRpdXM6OHB4O3BhZGRpbmc6MnB4IDlweDttYXJnaW4tcmlnaHQ6OHB4O2ZvbnQtc2l6ZToxNHB4fQouaXRlbXMgZW0uZmFsdGF7Zm9udC1zdHlsZTpub3JtYWw7YmFja2dyb3VuZDp2YXIoLS1sb2NrKTtjb2xvcjojZmZmO2JvcmRlci1yYWRpdXM6NXB4O3BhZGRpbmc6MCA1cHg7Zm9udC1zaXplOjExcHg7Zm9udC13ZWlnaHQ6ODAwO2xldHRlci1zcGFjaW5nOi4wNGVtfQoKLml0ZW1zIC5nb29ke2NvbG9yOnZhcigtLW9rKTtmb250LXdlaWdodDo3MDB9Ci5pdGVtcyBlbS50aWVuZXtmb250LXN0eWxlOm5vcm1hbDtiYWNrZ3JvdW5kOnZhcigtLW9rKTtjb2xvcjojZmZmO2JvcmRlci1yYWRpdXM6NXB4O3BhZGRpbmc6MCA1cHg7Zm9udC1zaXplOjExcHg7Zm9udC13ZWlnaHQ6ODAwO2xldHRlci1zcGFjaW5nOi4wNGVtfQoubm9wcmludHtkaXNwbGF5OmJsb2NrO21hcmdpbi10b3A6NnB4O2ZvbnQtd2VpZ2h0OjkwMDtjb2xvcjp2YXIoLS1pbmspO2ZvbnQtc2l6ZToxNXB4O2xldHRlci1zcGFjaW5nOi4wMmVtfQoKLyogVmVudGFzICovCi5zYWxlcy1rcGlze2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MS42ZnIgcmVwZWF0KDQsMWZyKTtnYXA6MTJweDttYXJnaW4tYm90dG9tOjE2cHh9Ci5rcGl7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTZweDtwYWRkaW5nOjE0cHggMTZweDtkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDo0cHg7Ym94LXNoYWRvdzp2YXIoLS1zaGFkb3cpfQoua3BpIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXdlaWdodDo3MDA7Zm9udC1zaXplOjEyLjVweDtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo2cHh9Ci5rcGkgYntmb250LWZhbWlseTp2YXIoLS1kaXNwbGF5KTtmb250LXNpemU6MjRweDtjb2xvcjp2YXIoLS1pbmspO2xpbmUtaGVpZ2h0OjEuMX0KLmtwaSBzcGFue2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTNweH0KLmtwaS1oZXJve2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDEzNWRlZywjRTNGNEZELCNmZmYpO2JvcmRlci1jb2xvcjp2YXIoLS1pY2UpfQoua3BpLWhlcm8gYntmb250LXNpemU6MzRweDtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KLmtwaS1oZXJvIHNwYW57Y29sb3I6dmFyKC0tb2spO2ZvbnQtd2VpZ2h0OjcwMH0KLmRvdHtkaXNwbGF5OmlubGluZS1ibG9jazt3aWR0aDoxMXB4O2hlaWdodDoxMXB4O2JvcmRlci1yYWRpdXM6M3B4O3ZlcnRpY2FsLWFsaWduOi0xcHg7bWFyZ2luLXJpZ2h0OjZweH0KLmxlZ2VuZHtkaXNwbGF5OmZsZXg7Z2FwOjE0cHg7ZmxleC13cmFwOndyYXA7Zm9udC1zaXplOjEzcHg7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOnZhcigtLWluayl9Ci5jaGFydHt3aWR0aDoxMDAlO2hlaWdodDphdXRvO2Rpc3BsYXk6YmxvY2t9Ci5jaGFydCAuY2gtYXh7Zm9udC1zaXplOjExcHg7ZmlsbDp2YXIoLS1tdXRlZCl9Ci5jaGFydCAuY2gtdmFse2ZvbnQtc2l6ZToxMnB4O2ZvbnQtd2VpZ2h0OjcwMDtmaWxsOnZhcigtLWluayl9Ci5jaGFydCAuY2gtZGF5e2ZvbnQtc2l6ZToxMnB4O2ZpbGw6dmFyKC0tbXV0ZWQpfQouY2hhcnQgLmNoLXRvZGF5e2ZpbGw6dmFyKC0tYWNjZW50LXN0cm9uZyk7Zm9udC13ZWlnaHQ6ODAwfQouY2hhcnQgLmNoLWhpdHtjdXJzb3I6cG9pbnRlcn0KLmNoYXJ0IC5jaC1oaXQ6aG92ZXJ7ZmlsbDpyZ2JhKDIyLDE0NywyMTEsLjA3KX0KLnNhbGVzLWdyaWR7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoMywxZnIpO2dhcDoxNHB4O21hcmdpbi10b3A6MTRweH0KLnNhbGVzLW1rIC5wYW5lbC1oZWFkIGgye2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXJ9Ci5jaC10aXB7cG9zaXRpb246Zml4ZWQ7ei1pbmRleDo1MDtiYWNrZ3JvdW5kOnZhcigtLWluayk7Y29sb3I6I2ZmZjtib3JkZXItcmFkaXVzOjEwcHg7cGFkZGluZzo4cHggMTFweDtmb250LXNpemU6MTIuNXB4O2xpbmUtaGVpZ2h0OjEuNTtwb2ludGVyLWV2ZW50czpub25lO2JveC1zaGFkb3c6dmFyKC0tc2hhZG93KTttYXgtd2lkdGg6MjgwcHh9Ci5jaC10aXAgYntkaXNwbGF5OmJsb2NrO21hcmdpbi1ib3R0b206MnB4O3RleHQtdHJhbnNmb3JtOmNhcGl0YWxpemV9Ci5jaC10YWJsZXttYXJnaW4tdG9wOjEwcHh9Ci5jaC10YWJsZSBzdW1tYXJ5e2N1cnNvcjpwb2ludGVyO2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpO2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTNweH0KQG1lZGlhIChtYXgtd2lkdGg6MTAwMHB4KXsuc2FsZXMta3Bpc3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDIsMWZyKX0ua3BpLWhlcm97Z3JpZC1jb2x1bW46MS8tMX0uc2FsZXMtZ3JpZHtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyfX0KLmNoYXJ0e3dpZHRoOjEwMCU7bWF4LXdpZHRoOjEwMCU7aGVpZ2h0OmF1dG99Ci5jaC1zbG90e3dpZHRoOjEwMCV9CgoucHAtd2Vla3tkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6OHB4O2ZvbnQtc2l6ZToxNHB4fQoucHAtdGFibGUgdGgubnVtLC5wcC10YWJsZSB0ZC5udW17dGV4dC1hbGlnbjpyaWdodDt3aGl0ZS1zcGFjZTpub3dyYXB9Ci5wcC10YWJsZSB0aCBzbWFsbHtkaXNwbGF5OmJsb2NrO2ZvbnQtd2VpZ2h0OjYwMDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5wcC10YWJsZSAucHAtbmFtZXtkaXNwbGF5OmJsb2NrO2ZvbnQtd2VpZ2h0OjcwMDtjb2xvcjp2YXIoLS1vayl9Ci5wcC10YWJsZSB0ZCBzbWFsbHtkaXNwbGF5OmJsb2NrfQoucHAtdGFibGUgLnplcm97Y29sb3I6dmFyKC0tbGluZSl9Ci5wcC10YWJsZSAucHAtdG90YWx7Zm9udC13ZWlnaHQ6ODAwO2ZvbnQtc2l6ZToxNXB4O2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQoucHAtdGFibGUgdGZvb3QgdGR7Ym9yZGVyLXRvcDoycHggc29saWQgdmFyKC0tbGluZSk7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlMil9Ci5wcC1ub3Rle2JhY2tncm91bmQ6dmFyKC0td2Fybi1iZyk7Y29sb3I6dmFyKC0td2Fybik7Ym9yZGVyLXJhZGl1czoxMHB4O3BhZGRpbmc6OHB4IDEycHg7Zm9udC1zaXplOjEzcHg7Zm9udC13ZWlnaHQ6NjAwO21hcmdpbjowIDAgMTBweH0K","app.js":"LyogRXRpcXVldGFIdWIg4oCUIGludGVyZmF6ICovCigoKSA9PiB7CmNvbnN0ICQgPSAocywgZWwgPSBkb2N1bWVudCkgPT4gZWwucXVlcnlTZWxlY3RvcihzKTsKY29uc3QgJCQgPSAocywgZWwgPSBkb2N1bWVudCkgPT4gWy4uLmVsLnF1ZXJ5U2VsZWN0b3JBbGwocyldOwpjb25zdCBlc2MgPSBzID0+IFN0cmluZyhzID8/ICcnKS5yZXBsYWNlKC9bJjw+IiddL2csIGMgPT4gKHsgJyYnOiAnJmFtcDsnLCAnPCc6ICcmbHQ7JywgJz4nOiAnJmd0OycsICciJzogJyZxdW90OycsICInIjogJyYjMzk7JyB9W2NdKSk7CmNvbnN0IE1LID0geyBtbDogJ01lcmNhZG8gTGlicmUnLCBmYTogJ0ZhbGFiZWxsYScsIHBhOiAnUGFyaXMnIH07CmNvbnN0IFNUQVRFID0geyByZWFkeTogJ0V0aXF1ZXRhIHBvciBpbXByaW1pcicsIHdhaXRpbmc6ICdFc3BlcmFuZG8gZXRpcXVldGEnLCBibG9ja2VkOiAnQmxvcXVlYWRhJywgcHJpbnRlZDogJ0V0aXF1ZXRhIGltcHJlc2EnLCBzaGlwcGVkOiAnRW52aWFkYScsIGVycm9yOiAnRXJyb3IgZW4gZXRpcXVldGEnLCBjYW5jZWxsZWQ6ICdDYW5jZWxhZGEnIH07CmNvbnN0IHN0b3JlID0geyBnZXQoaywgZCkgeyB0cnkgeyBjb25zdCB2ID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2VoOicgKyBrKTsgcmV0dXJuIHYgPT0gbnVsbCA/IGQgOiBKU09OLnBhcnNlKHYpOyB9IGNhdGNoIHsgcmV0dXJuIGQ7IH0gfSwgc2V0KGssIHYpIHsgdHJ5IHsgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2VoOicgKyBrLCBKU09OLnN0cmluZ2lmeSh2KSk7IH0gY2F0Y2gge30gfSB9OwoKY29uc3QgSSA9IHsKICBsb2NrOiAnPHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjIuMiI+PHJlY3QgeD0iNSIgeT0iMTEiIHdpZHRoPSIxNCIgaGVpZ2h0PSIxMCIgcng9IjIiLz48cGF0aCBkPSJNOCAxMVY4YTQgNCAwIDAxOCAwdjMiLz48L3N2Zz4nLAogIGNoZWNrOiAnPHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjMiPjxwYXRoIGQ9Ik01IDEybDUgNSA5LTEwIi8+PC9zdmc+JywKICBwcmludDogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyLjIiPjxwYXRoIGQ9Ik03IDlWM2gxMHY2TTcgMTdINHYtN2gxNnY3aC0zIi8+PHJlY3QgeD0iNyIgeT0iMTQiIHdpZHRoPSIxMCIgaGVpZ2h0PSI3Ii8+PC9zdmc+JywKICBjbG9jazogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyLjIiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjkiLz48cGF0aCBkPSJNMTIgN3Y1bDMgMiIvPjwvc3ZnPicsCiAgd2FybjogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyLjIiPjxwYXRoIGQ9Ik0xMiAzbDEwIDE4SDJ6Ii8+PHBhdGggZD0iTTEyIDEwdjVNMTIgMTh2LjUiLz48L3N2Zz4nLAogIGRvd246ICc8c3ZnIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMi40Ij48cGF0aCBkPSJNMTIgNHYxMW0wIDBsLTUtNW01IDVsNS01TTUgMjBoMTQiLz48L3N2Zz4nLAogIHN5bmM6ICc8c3ZnIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMi4yIj48cGF0aCBkPSJNMjAgMTFhOCA4IDAgMDAtMTQuOS0zTTQgNXY0aDRNNCAxM2E4IDggMCAwMDE0LjkgM00yMCAxOXYtNGgtNCIvPjwvc3ZnPicsCiAgeDogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiB3aWR0aD0iMTQiIGhlaWdodD0iMTQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjIuNiI+PHBhdGggZD0iTTYgNmwxMiAxMk0xOCA2TDYgMTgiLz48L3N2Zz4nLAogIGJveDogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIj48cmVjdCB4PSIzIiB5PSI0IiB3aWR0aD0iMTgiIGhlaWdodD0iMTYiIHJ4PSIzIi8+PHBhdGggZD0iTTMgOWgxOCIvPjwvc3ZnPicsCn07CmNvbnN0IHBpbGxJY29uID0geyBzaGlwcGVkOiBJLmNoZWNrLCByZWFkeTogSS5jaGVjaywgYmxvY2tlZDogSS5sb2NrLCBwcmludGVkOiBJLnByaW50LCB3YWl0aW5nOiBJLmNsb2NrLCBlcnJvcjogSS53YXJuLCBjYW5jZWxsZWQ6IEkueCB9OwoKbGV0IG1lID0gbnVsbCwgdGFiID0gbnVsbCwgb3JkZXJzID0gW10sIHNlbGxlcnMgPSBbXSwgc2VsZWN0ZWQgPSBuZXcgU2V0KCksIGtub3duUmVhZHkgPSBuZXcgU2V0KCksIGZpcnN0TG9hZCA9IHRydWU7CmNvbnN0IHVpID0geyB0YWI6ICd0b2RheScsIG1rOiAnYWxsJywgc2VsbGVyOiAnYWxsJywgcTogJycsIGFkbWluU2VsbGVyOiBzdG9yZS5nZXQoJ2FkbWluU2VsbGVyJywgbnVsbCkgfTsKCmZ1bmN0aW9uIHRvYXN0KG1zZywgbXMgPSAyODAwKSB7IGNvbnN0IHQgPSAkKCcjdG9hc3QnKTsgdC50ZXh0Q29udGVudCA9IG1zZzsgdC5oaWRkZW4gPSBmYWxzZTsgY2xlYXJUaW1lb3V0KHQuX3QpOyB0Ll90ID0gc2V0VGltZW91dCgoKSA9PiB0LmhpZGRlbiA9IHRydWUsIG1zKTsgfQphc3luYyBmdW5jdGlvbiBhcGkocGF0aCwgb3B0cyA9IHt9KSB7CiAgY29uc3QgcmVzID0gYXdhaXQgZmV0Y2gocGF0aCwgeyBjcmVkZW50aWFsczogJ3NhbWUtb3JpZ2luJywgLi4ub3B0cywgaGVhZGVyczogeyAnY29udGVudC10eXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLCAuLi4ob3B0cy5oZWFkZXJzIHx8IHt9KSB9LCBib2R5OiBvcHRzLmJvZHkgJiYgdHlwZW9mIG9wdHMuYm9keSAhPT0gJ3N0cmluZycgPyBKU09OLnN0cmluZ2lmeShvcHRzLmJvZHkpIDogb3B0cy5ib2R5IH0pOwogIGlmIChyZXMuc3RhdHVzID09PSA0MDEgJiYgIXBhdGguaW5jbHVkZXMoJy9sb2dpbicpKSB7IG1lID0gbnVsbDsgcmVuZGVyTG9naW4oKTsgdGhyb3cgbmV3IEVycm9yKCdTZXNpw7NuIHZlbmNpZGEnKTsgfQogIGNvbnN0IGN0ID0gcmVzLmhlYWRlcnMuZ2V0KCdjb250ZW50LXR5cGUnKSB8fCAnJzsKICBpZiAoIXJlcy5vaykgeyBjb25zdCBlID0gY3QuaW5jbHVkZXMoJ2pzb24nKSA/IChhd2FpdCByZXMuanNvbigpKS5lcnJvciA6IGF3YWl0IHJlcy50ZXh0KCk7IHRocm93IG5ldyBFcnJvcihlIHx8ICdFcnJvcicpOyB9CiAgcmV0dXJuIGN0LmluY2x1ZGVzKCdqc29uJykgPyByZXMuanNvbigpIDogcmVzOwp9CmZ1bmN0aW9uIHNlbGxlclFTKCkgeyByZXR1cm4gbWUudXNlci5yb2xlID09PSAnYWRtaW4nICYmIHVpLmFkbWluU2VsbGVyID8gYD9zZWxsZXJfaWQ9JHt1aS5hZG1pblNlbGxlcn1gIDogJyc7IH0KZnVuY3Rpb24gZm10VGltZShzKSB7IGlmICghcykgcmV0dXJuICcnOyBjb25zdCBkID0gbmV3IERhdGUocy5pbmNsdWRlcygnVCcpID8gcyA6IHMucmVwbGFjZSgnICcsICdUJykgKyAnWicpOyByZXR1cm4gZC50b0xvY2FsZVN0cmluZygnZXMtQ0wnLCB7IGRheTogJzItZGlnaXQnLCBtb250aDogJzItZGlnaXQnLCBob3VyOiAnMi1kaWdpdCcsIG1pbnV0ZTogJzItZGlnaXQnIH0pOyB9CgovLyAtLS0tLS0tLS0tIGlsdXN0cmFjaW9uZXMgLS0tLS0tLS0tLQpjb25zdCBIRVJPX1NWRyA9IGA8c3ZnIHZpZXdCb3g9IjAgMCA1MjAgMjMwIiBhcmlhLWhpZGRlbj0idHJ1ZSI+CjxyZWN0IHdpZHRoPSI1MjAiIGhlaWdodD0iMjMwIiByeD0iMjYiIGZpbGw9InZhcigtLWJnMikiLz4KPGcgZm9udC1mYW1pbHk9IkJhbG9vIDIsIHNhbnMtc2VyaWYiIGZvbnQtd2VpZ2h0PSI4MDAiIGZvbnQtc2l6ZT0iMTQiIHRleHQtYW5jaG9yPSJtaWRkbGUiPgo8cmVjdCB4PSIyMiIgeT0iMjYiIHdpZHRoPSIxMTIiIGhlaWdodD0iNDQiIHJ4PSIxMiIgZmlsbD0idmFyKC0tbWwpIi8+PHRleHQgeD0iNzgiIHk9IjUzIiBmaWxsPSJ2YXIoLS1tbC1pbmspIj5NZXJjYWRvIExpYnJlPC90ZXh0Pgo8cmVjdCB4PSIyMiIgeT0iOTMiIHdpZHRoPSIxMTIiIGhlaWdodD0iNDQiIHJ4PSIxMiIgZmlsbD0idmFyKC0tZmEpIi8+PHRleHQgeD0iNzgiIHk9IjEyMCIgZmlsbD0idmFyKC0tZmEtaW5rKSI+RmFsYWJlbGxhPC90ZXh0Pgo8cmVjdCB4PSIyMiIgeT0iMTYwIiB3aWR0aD0iMTEyIiBoZWlnaHQ9IjQ0IiByeD0iMTIiIGZpbGw9InZhcigtLXBhKSIvPjx0ZXh0IHg9Ijc4IiB5PSIxODciIGZpbGw9IiNmZmYiPlBhcmlzPC90ZXh0PjwvZz4KPGcgc3Ryb2tlPSJ2YXIoLS1za3kpIiBzdHJva2Utd2lkdGg9IjMiIGZpbGw9Im5vbmUiIHN0cm9rZS1kYXNoYXJyYXk9IjYgNyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48cGF0aCBkPSJNMTM0IDQ4IEMgMTc1IDQ4LCAxNzUgMTE1LCAyMTAgMTE1Ii8+PHBhdGggZD0iTTEzNCAxMTUgSDIxMCIvPjxwYXRoIGQ9Ik0xMzQgMTgyIEMgMTc1IDE4MiwgMTc1IDExNSwgMjEwIDExNSIvPjwvZz4KPHJlY3QgeD0iMjEwIiB5PSI3MCIgd2lkdGg9IjEwNCIgaGVpZ2h0PSI5MCIgcng9IjIwIiBmaWxsPSJ2YXIoLS1hY2NlbnQpIi8+CjxyZWN0IHg9IjIyNiIgeT0iODgiIHdpZHRoPSI3MiIgaGVpZ2h0PSIxMiIgcng9IjYiIGZpbGw9IiNmZmYiIG9wYWNpdHk9Ii45Ii8+PHJlY3QgeD0iMjI2IiB5PSIxMDciIHdpZHRoPSI1MiIgaGVpZ2h0PSIxMCIgcng9IjUiIGZpbGw9IiNmZmYiIG9wYWNpdHk9Ii42Ii8+CjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDIzMiwxMjYpIj48cmVjdCB3aWR0aD0iMjIiIGhlaWdodD0iMjIiIHJ4PSI2IiBmaWxsPSIjZmZmIi8+PHBhdGggZD0iTTYgMTFsNCA0IDctOCIgc3Ryb2tlPSJ2YXIoLS1vaykiIHN0cm9rZS13aWR0aD0iMyIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9nPgo8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyNjQsMTI2KSI+PHJlY3Qgd2lkdGg9IjIyIiBoZWlnaHQ9IjIyIiByeD0iNiIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjYiIHk9IjEwIiB3aWR0aD0iMTAiIGhlaWdodD0iOCIgcng9IjIiIGZpbGw9InZhcigtLWxvY2spIi8+PHBhdGggZD0iTTggMTBWOGEzIDMgMCAwMTYgMHYyIiBzdHJva2U9InZhcigtLWxvY2spIiBzdHJva2Utd2lkdGg9IjIiIGZpbGw9Im5vbmUiLz48L2c+CjxwYXRoIGQ9Ik0zMTQgMTE1IEgzNTYiIHN0cm9rZT0idmFyKC0tc2t5KSIgc3Ryb2tlLXdpZHRoPSIzIiBzdHJva2UtZGFzaGFycmF5PSI2IDciIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8cGF0aCBkPSJNMzYyIDk4IEw0MjQgNzAgTDQ4NiA5OCBWMTc4IEgzNjIgWiIgZmlsbD0idmFyKC0tc3VyZmFjZSkiIHN0cm9rZT0idmFyKC0tbGluZSkiIHN0cm9rZS13aWR0aD0iMiIvPgo8cmVjdCB4PSIzODgiIHk9IjEyNCIgd2lkdGg9IjcyIiBoZWlnaHQ9IjU0IiByeD0iNCIgZmlsbD0idmFyKC0taWNlKSIvPgo8ZyBmaWxsPSJ2YXIoLS1za3kpIj48cmVjdCB4PSIzOTYiIHk9IjE0NCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjE2IiByeD0iMiIvPjxyZWN0IHg9IjQyNCIgeT0iMTQ0IiB3aWR0aD0iMjQiIGhlaWdodD0iMTYiIHJ4PSIyIi8+PHJlY3QgeD0iNDEwIiB5PSIxMzAiIHdpZHRoPSIyNCIgaGVpZ2h0PSIxNCIgcng9IjIiLz48L2c+CjxnIGNsYXNzPSJ0cnVjayI+PHJlY3QgeD0iMzcyIiB5PSIxODgiIHdpZHRoPSI1OCIgaGVpZ2h0PSIyNCIgcng9IjUiIGZpbGw9InZhcigtLWFjY2VudC1zdHJvbmcpIi8+PHBhdGggZD0iTTQzMCAxOTQgaDE4IGwxMCAxMCB2OCBoLTI4eiIgZmlsbD0idmFyKC0tYWNjZW50KSIvPjxjaXJjbGUgY3g9IjM4OCIgY3k9IjIxNCIgcj0iNiIgZmlsbD0idmFyKC0taW5rKSIvPjxjaXJjbGUgY3g9IjQ0NiIgY3k9IjIxNCIgcj0iNiIgZmlsbD0idmFyKC0taW5rKSIvPjwvZz48L3N2Zz5gOwpjb25zdCBFTVBUWV9TVkcgPSBgPHN2ZyB2aWV3Qm94PSIwIDAgMTQwIDEwMCIgYXJpYS1oaWRkZW49InRydWUiPjxyZWN0IHg9IjIwIiB5PSIzMCIgd2lkdGg9IjEwMCIgaGVpZ2h0PSI2MiIgcng9IjEwIiBmaWxsPSJ2YXIoLS1pY2UpIi8+PHBhdGggZD0iTTIwIDQ2aDEwMCIgc3Ryb2tlPSJ2YXIoLS1za3kpIiBzdHJva2Utd2lkdGg9IjMiLz48cmVjdCB4PSIzNiIgeT0iNTgiIHdpZHRoPSI0MCIgaGVpZ2h0PSI3IiByeD0iMy41IiBmaWxsPSJ2YXIoLS1za3kpIi8+PHJlY3QgeD0iMzYiIHk9IjcxIiB3aWR0aD0iMjYiIGhlaWdodD0iNyIgcng9IjMuNSIgZmlsbD0idmFyKC0tc2t5KSIgb3BhY2l0eT0iLjYiLz48Y2lyY2xlIGN4PSIxMDQiIGN5PSIyMiIgcj0iMTQiIGZpbGw9InZhcigtLW9rKSIvPjxwYXRoIGQ9Ik05NyAyMmw1IDUgOS0xMCIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjMuNCIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+YDsKY29uc3QgUlVMRV9TVkcgPSBgPHN2ZyB2aWV3Qm94PSIwIDAgMTMwIDgwIiBhcmlhLWhpZGRlbj0idHJ1ZSI+PHJlY3QgeD0iNCIgeT0iMTAiIHdpZHRoPSI3OCIgaGVpZ2h0PSI2MiIgcng9IjEwIiBmaWxsPSJ2YXIoLS1zdXJmYWNlKSIgc3Ryb2tlPSJ2YXIoLS1saW5lKSIgc3Ryb2tlLXdpZHRoPSIyIi8+PHJlY3QgeD0iMTQiIHk9IjIyIiB3aWR0aD0iNDQiIGhlaWdodD0iOCIgcng9IjQiIGZpbGw9InZhcigtLW9rKSIvPjxyZWN0IHg9IjE0IiB5PSIzNiIgd2lkdGg9IjQ0IiBoZWlnaHQ9IjgiIHJ4PSI0IiBmaWxsPSJ2YXIoLS1vaykiLz48cmVjdCB4PSIxNCIgeT0iNTAiIHdpZHRoPSI0NCIgaGVpZ2h0PSI4IiByeD0iNCIgZmlsbD0idmFyKC0tbG9jaykiLz48cGF0aCBkPSJNODggNDFoMTQiIHN0cm9rZT0idmFyKC0tbXV0ZWQpIiBzdHJva2Utd2lkdGg9IjIuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PHBhdGggZD0iTTk4IDM2bDUgNS01IDUiIHN0cm9rZT0idmFyKC0tbXV0ZWQpIiBzdHJva2Utd2lkdGg9IjIuNSIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PHJlY3QgeD0iMTA2IiB5PSIyOCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjI2IiByeD0iNSIgZmlsbD0idmFyKC0tbG9jaykiLz48cmVjdCB4PSIxMTEiIHk9IjQwIiB3aWR0aD0iMTAiIGhlaWdodD0iOSIgcng9IjIiIGZpbGw9IiNmZmYiLz48cGF0aCBkPSJNMTEzIDQwdi0zYTMgMyAwIDAxNiAwdjMiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSJub25lIi8+PC9zdmc+YDsKCi8vIC0tLS0tLS0tLS0gbG9naW4gLS0tLS0tLS0tLQpmdW5jdGlvbiByZW5kZXJMb2dpbihkZW1vKSB7CiAgJCgnI2FwcCcpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJsb2dpbiI+PGRpdiBjbGFzcz0iY2FyZCI+CiAgICA8ZGl2IGNsYXNzPSJhcnQiPiR7SEVST19TVkd9PC9kaXY+CiAgICA8Zm9ybSBpZD0ibG9naW5Gb3JtIj4KICAgICAgPGgxPkV0aXF1ZXRhSHViPC9oMT4KICAgICAgPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjAiPkV0aXF1ZXRhcyBkZSBNZXJjYWRvIExpYnJlLCBGYWxhYmVsbGEgeSBQYXJpcyBlbiB1bmEgc29sYSBiYW5kZWphLjwvcD4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5Db3JyZW88aW5wdXQgdHlwZT0iZW1haWwiIGlkPSJsRW1haWwiIGF1dG9jb21wbGV0ZT0idXNlcm5hbWUiIHJlcXVpcmVkPjwvbGFiZWw+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+Q29udHJhc2XDsWE8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJsUGFzcyIgYXV0b2NvbXBsZXRlPSJjdXJyZW50LXBhc3N3b3JkIiByZXF1aXJlZD48L2xhYmVsPgogICAgICA8ZGl2IGNsYXNzPSJlcnIiIGlkPSJsRXJyIj48L2Rpdj4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiPkVudHJhcjwvYnV0dG9uPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUiIHR5cGU9ImJ1dHRvbiIgaWQ9ImZvcmdvdCI+wr9PbHZpZGFzdGUgdHUgY29udHJhc2XDsWE/PC9idXR0b24+CiAgICAgIDxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9Im1hcmdpbjowO2ZvbnQtc2l6ZToxMi41cHg7dGV4dC1hbGlnbjpjZW50ZXIiPsK/VGllbmVzIHVuYSBjbGF2ZSBkZSByZXNwYWxkbyAoUlNQLeKApik/IEVzY3LDrWJlbGEgZW4gQ29udHJhc2XDsWEuPC9wPgogICAgICAke2RlbW8gPyAnPGRpdiBjbGFzcz0iZGVtby1oaW50Ij5Nb2RvIGRlbW86IGVudHJhIGNvbiA8Yj5ib2RlZ2FAZGVtby5jbDwvYj4sIDxiPnZlbmRlZG9yMUBkZW1vLmNsPC9iPiBvIDxiPmFkbWluQGRlbW8uY2w8L2I+LCBjbGF2ZSA8Yj5kZW1vMTIzNDwvYj4uPC9kaXY+JyA6ICcnfQogICAgPC9mb3JtPjwvZGl2PjwvZGl2PmA7CiAgJCgnI2xvZ2luRm9ybScpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICBlLnByZXZlbnREZWZhdWx0KCk7CiAgICAkKCcjbEVycicpLnRleHRDb250ZW50ID0gJyc7CiAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvbG9naW4nLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGVtYWlsOiAkKCcjbEVtYWlsJykudmFsdWUsIHBhc3N3b3JkOiAkKCcjbFBhc3MnKS52YWx1ZSB9IH0pOyBib290KCk7IH0KICAgIGNhdGNoIChlcnIpIHsgJCgnI2xFcnInKS50ZXh0Q29udGVudCA9IGVyci5tZXNzYWdlOyB9CiAgfTsKICAkKCcjZm9yZ290Jykub25jbGljayA9ICgpID0+IHJlbmRlckZvcmdvdCgkKCcjbEVtYWlsJykudmFsdWUpOwp9CgovLyBSZWN1cGVyYXIgY29udHJhc2XDsWE6IGNvcnJlbyAtPiBjw7NkaWdvIGRlIDYgZMOtZ2l0b3MgLT4gZW50cmFyIG8gY2FtYmlhciBjb250cmFzZcOxYQpmdW5jdGlvbiByZW5kZXJGb3Jnb3QocHJlZmlsbCA9ICcnKSB7CiAgbGV0IGVtYWlsID0gcHJlZmlsbCwgY29kZSA9ICcnOwogIGNvbnN0IHNoZWxsID0gaW5uZXIgPT4geyAkKCcjYXBwJykuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9ImxvZ2luIj48ZGl2IGNsYXNzPSJjYXJkIj48ZGl2IGNsYXNzPSJhcnQiPiR7SEVST19TVkd9PC9kaXY+PGZvcm0gaWQ9ImZGb3JtIj4ke2lubmVyfTxkaXYgY2xhc3M9ImVyciIgaWQ9ImZFcnIiPjwvZGl2PjwvZm9ybT48L2Rpdj48L2Rpdj5gOyB9OwogIGNvbnN0IGJhY2sgPSAoKSA9PiB7IGNvbnN0IGIgPSAkKCcjZkJhY2snKTsgaWYgKGIpIGIub25jbGljayA9ICgpID0+IHJlbmRlckxvZ2luKCk7IH07CiAgY29uc3QgZXJyID0gbSA9PiB7ICQoJyNmRXJyJykudGV4dENvbnRlbnQgPSBtOyB9OwogIGZ1bmN0aW9uIHN0ZXBFbWFpbCgpIHsKICAgIHNoZWxsKGA8aDE+UmVjdXBlcmFyIGFjY2VzbzwvaDE+PHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjAiPkVzY3JpYmUgdHUgY29ycmVvIHkgdGUgZW52aWFyZW1vcyB1biBjw7NkaWdvIGRlIDYgZMOtZ2l0b3MuPC9wPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPkNvcnJlbzxpbnB1dCB0eXBlPSJlbWFpbCIgaWQ9ImZFbWFpbCIgYXV0b2NvbXBsZXRlPSJ1c2VybmFtZSIgcmVxdWlyZWQgdmFsdWU9IiR7ZXNjKGVtYWlsKX0iPjwvbGFiZWw+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgdHlwZT0ic3VibWl0Ij5FbnZpYXIgY8OzZGlnbzwvYnV0dG9uPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSIgdHlwZT0iYnV0dG9uIiBpZD0iZkJhY2siPlZvbHZlcjwvYnV0dG9uPmApOwogICAgYmFjaygpOwogICAgJCgnI2ZGb3JtJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpOyBlbWFpbCA9ICQoJyNmRW1haWwnKS52YWx1ZS50cmltKCk7CiAgICAgIGNvbnN0IGIgPSBlLnN1Ym1pdHRlcjsgaWYgKGIpIGIuZGlzYWJsZWQgPSB0cnVlOwogICAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvcGFzc3dvcmQvZm9yZ290JywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBlbWFpbCB9IH0pOyBzdGVwQ29kZSgpOyB9CiAgICAgIGNhdGNoICh4KSB7IGVycih4Lm1lc3NhZ2UpOyBpZiAoYikgYi5kaXNhYmxlZCA9IGZhbHNlOyB9CiAgICB9OwogIH0KICBmdW5jdGlvbiBzdGVwQ29kZSgpIHsKICAgIHNoZWxsKGA8aDE+UmV2aXNhIHR1IGNvcnJlbzwvaDE+PHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjAiPlNpIDxiPiR7ZXNjKGVtYWlsKX08L2I+IGVzdMOhIHJlZ2lzdHJhZG8sIHRlIGxsZWfDsyB1biBjw7NkaWdvIGRlIDYgZMOtZ2l0b3MuIFZlbmNlIGVuIDE1IG1pbnV0b3MuIFJldmlzYSB0YW1iacOpbiBsYSBjYXJwZXRhIGRlIHNwYW0uPC9wPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPkPDs2RpZ288aW5wdXQgdHlwZT0idGV4dCIgaWQ9ImZDb2RlIiBpbnB1dG1vZGU9Im51bWVyaWMiIGF1dG9jb21wbGV0ZT0ib25lLXRpbWUtY29kZSIgbWF4bGVuZ3RoPSI2IiBwYXR0ZXJuPSJbMC05XXs2fSIgcmVxdWlyZWQgc3R5bGU9ImZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZToyNHB4O2xldHRlci1zcGFjaW5nOjhweDt0ZXh0LWFsaWduOmNlbnRlciI+PC9sYWJlbD4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiPkNvbnRpbnVhcjwvYnV0dG9uPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUiIHR5cGU9ImJ1dHRvbiIgaWQ9ImZSZXNlbmQiPkVudmlhciBvdHJvIGPDs2RpZ288L2J1dHRvbj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUiIHR5cGU9ImJ1dHRvbiIgaWQ9ImZCYWNrIj5Wb2x2ZXI8L2J1dHRvbj5gKTsKICAgIGJhY2soKTsKICAgICQoJyNmQ29kZScpLmZvY3VzKCk7CiAgICAkKCcjZlJlc2VuZCcpLm9uY2xpY2sgPSBhc3luYyAoKSA9PiB7IHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9wYXNzd29yZC9mb3Jnb3QnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGVtYWlsIH0gfSk7IHRvYXN0KCdDw7NkaWdvIHJlZW52aWFkbycpOyB9IGNhdGNoICh4KSB7IGVycih4Lm1lc3NhZ2UpOyB9IH07CiAgICAkKCcjZkZvcm0nKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4gewogICAgICBlLnByZXZlbnREZWZhdWx0KCk7IGNvZGUgPSAkKCcjZkNvZGUnKS52YWx1ZS50cmltKCk7CiAgICAgIHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9wYXNzd29yZC9jaGVjaycsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgZW1haWwsIGNvZGUgfSB9KTsgc3RlcENob29zZSgpOyB9CiAgICAgIGNhdGNoICh4KSB7IGVycih4Lm1lc3NhZ2UpOyB9CiAgICB9OwogIH0KICBmdW5jdGlvbiBzdGVwQ2hvb3NlKCkgewogICAgc2hlbGwoYDxoMT5Dw7NkaWdvIGNvcnJlY3RvPC9oMT48cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJtYXJnaW46MCI+wr9RdcOpIHF1aWVyZXMgaGFjZXI/PC9wPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIHR5cGU9ImJ1dHRvbiIgaWQ9ImZMb2dpbiI+RW50cmFyIGFob3JhPC9idXR0b24+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tZ2hvc3QiIHR5cGU9ImJ1dHRvbiIgaWQ9ImZDaGFuZ2UiPkNhbWJpYXIgbWkgY29udHJhc2XDsWE8L2J1dHRvbj5gKTsKICAgICQoJyNmTG9naW4nKS5vbmNsaWNrID0gYXN5bmMgKCkgPT4geyB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvcGFzc3dvcmQvbG9naW4nLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGVtYWlsLCBjb2RlIH0gfSk7IGJvb3QoKTsgfSBjYXRjaCAoeCkgeyBlcnIoeC5tZXNzYWdlKTsgfSB9OwogICAgJCgnI2ZDaGFuZ2UnKS5vbmNsaWNrID0gc3RlcE5ldzsKICB9CiAgZnVuY3Rpb24gc3RlcE5ldygpIHsKICAgIHNoZWxsKGA8aDE+TnVldmEgY29udHJhc2XDsWE8L2gxPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPk51ZXZhIGNvbnRyYXNlw7FhIChtw61uaW1vIDgpPGlucHV0IHR5cGU9InBhc3N3b3JkIiBpZD0iZlAxIiBhdXRvY29tcGxldGU9Im5ldy1wYXNzd29yZCIgbWlubGVuZ3RoPSI4IiByZXF1aXJlZD48L2xhYmVsPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPlJlcMOtdGVsYTxpbnB1dCB0eXBlPSJwYXNzd29yZCIgaWQ9ImZQMiIgYXV0b2NvbXBsZXRlPSJuZXctcGFzc3dvcmQiIG1pbmxlbmd0aD0iOCIgcmVxdWlyZWQ+PC9sYWJlbD4KICAgICAgPGxhYmVsIGNsYXNzPSJzd2l0Y2giIHN0eWxlPSJmb250LXNpemU6MTNweCI+PGlucHV0IHR5cGU9ImNoZWNrYm94IiBpZD0iZlNob3ciPiBNb3N0cmFyIGNvbnRyYXNlw7FhPC9sYWJlbD4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiPkd1YXJkYXIgeSBlbnRyYXI8L2J1dHRvbj5gKTsKICAgICQoJyNmU2hvdycpLm9uY2hhbmdlID0gZSA9PiB7ICQoJyNmUDEnKS50eXBlID0gJCgnI2ZQMicpLnR5cGUgPSBlLnRhcmdldC5jaGVja2VkID8gJ3RleHQnIDogJ3Bhc3N3b3JkJzsgfTsKICAgICQoJyNmRm9ybScpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICAgIGUucHJldmVudERlZmF1bHQoKTsKICAgICAgaWYgKCQoJyNmUDEnKS52YWx1ZSAhPT0gJCgnI2ZQMicpLnZhbHVlKSByZXR1cm4gZXJyKCdMYXMgY29udHJhc2XDsWFzIG5vIGNvaW5jaWRlbicpOwogICAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvcGFzc3dvcmQvcmVzZXQnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGVtYWlsLCBjb2RlLCBwYXNzd29yZDogJCgnI2ZQMScpLnZhbHVlIH0gfSk7IHRvYXN0KCdDb250cmFzZcOxYSBhY3R1YWxpemFkYScpOyBib290KCk7IH0KICAgICAgY2F0Y2ggKHgpIHsgZXJyKHgubWVzc2FnZSk7IH0KICAgIH07CiAgfQogIHN0ZXBFbWFpbCgpOwp9CgpmdW5jdGlvbiByZW5kZXJTZXR1cCgpIHsKICAkKCcjYXBwJykuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9ImxvZ2luIj48ZGl2IGNsYXNzPSJjYXJkIj4KICAgIDxkaXYgY2xhc3M9ImFydCI+JHtIRVJPX1NWR308L2Rpdj4KICAgIDxmb3JtIGlkPSJzZXR1cEZvcm0iPgogICAgICA8aDE+QmllbnZlbmlkbzwvaDE+CiAgICAgIDxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9Im1hcmdpbjowIj5DcmVhIGxhIGN1ZW50YSBkZSBhZG1pbmlzdHJhZG9yLiBDb24gZWxsYSBhZ3JlZ2FzIHZlbmRlZG9yZXMsIHVzdWFyaW9zIHkgbGEgY29uZXhpw7NuIGEgTWVyY2FkbyBMaWJyZS48L3A+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+VHUgbm9tYnJlPGlucHV0IHR5cGU9InRleHQiIGlkPSJzTmFtZSIgcmVxdWlyZWQ+PC9sYWJlbD4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5Db3JyZW88aW5wdXQgdHlwZT0iZW1haWwiIGlkPSJzRW1haWwiIGF1dG9jb21wbGV0ZT0idXNlcm5hbWUiIHJlcXVpcmVkPjwvbGFiZWw+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+Q29udHJhc2XDsWEgKG3DrW5pbW8gOCk8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJzUGFzcyIgYXV0b2NvbXBsZXRlPSJuZXctcGFzc3dvcmQiIG1pbmxlbmd0aD0iOCIgcmVxdWlyZWQ+PC9sYWJlbD4KICAgICAgPGxhYmVsIGNsYXNzPSJzd2l0Y2giIHN0eWxlPSJmb250LXNpemU6MTNweCI+PGlucHV0IHR5cGU9ImNoZWNrYm94IiBpZD0ic1Nob3ciPiBNb3N0cmFyIGNvbnRyYXNlw7FhPC9sYWJlbD4KICAgICAgPGRpdiBjbGFzcz0iZXJyIiBpZD0ic0VyciI+PC9kaXY+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgdHlwZT0ic3VibWl0Ij5DcmVhciBhZG1pbmlzdHJhZG9yPC9idXR0b24+CiAgICA8L2Zvcm0+PC9kaXY+PC9kaXY+YDsKICAkKCcjc1Nob3cnKS5vbmNoYW5nZSA9IGUgPT4geyAkKCcjc1Bhc3MnKS50eXBlID0gZS50YXJnZXQuY2hlY2tlZCA/ICd0ZXh0JyA6ICdwYXNzd29yZCc7IH07CiAgJCgnI3NldHVwRm9ybScpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICBlLnByZXZlbnREZWZhdWx0KCk7CiAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvc2V0dXAnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IG5hbWU6ICQoJyNzTmFtZScpLnZhbHVlLCBlbWFpbDogJCgnI3NFbWFpbCcpLnZhbHVlLCBwYXNzd29yZDogJCgnI3NQYXNzJykudmFsdWUgfSB9KTsgYm9vdCgpOyB9CiAgICBjYXRjaCAoZXJyKSB7ICQoJyNzRXJyJykudGV4dENvbnRlbnQgPSBlcnIubWVzc2FnZTsgfQogIH07Cn0KCi8vIC0tLS0tLS0tLS0gZXN0cnVjdHVyYSAtLS0tLS0tLS0tCmZ1bmN0aW9uIHRhYnNGb3Iocm9sZSkgewogIGlmIChyb2xlID09PSAnc2VsbGVyJykgcmV0dXJuIFtbJ3RyYXknLCAnTWlzIGV0aXF1ZXRhcyddLCBbJ3NhbGVzJywgJ01pcyB2ZW50YXMnXSwgWydzZWxsZXInLCAnTWkgY3VlbnRhJ11dOwogIGlmIChyb2xlID09PSAnZnVsZmlsbG1lbnQnKSByZXR1cm4gW1sndHJheScsICdCYW5kZWphIGRlIGV0aXF1ZXRhcyddLCBbJ3NlbGxlcnNWaWV3JywgJ1ZlbmRlZG9yZXMnXV07CiAgcmV0dXJuIFtbJ3RyYXknLCAnQmFuZGVqYSddLCBbJ3NhbGVzJywgJ1ZlbnRhcyddLCBbJ3NlbGxlcicsICdWZW5kZWRvcmVzJ10sIFsnYWRtaW4nLCAnVXN1YXJpb3MgeSBhanVzdGVzJ11dOwp9CmZ1bmN0aW9uIHJlbmRlclNoZWxsKCkgewogIGNvbnN0IHRhYnMgPSB0YWJzRm9yKG1lLnVzZXIucm9sZSk7CiAgaWYgKCF0YWIgfHwgIXRhYnMuc29tZSh0ID0+IHRbMF0gPT09IHRhYikpIHRhYiA9IHN0b3JlLmdldCgndGFiJywgdGFic1swXVswXSk7CiAgaWYgKCF0YWJzLnNvbWUodCA9PiB0WzBdID09PSB0YWIpKSB0YWIgPSB0YWJzWzBdWzBdOwogICQoJyNhcHAnKS5pbm5lckhUTUwgPSBgCiAgPGhlYWRlciBjbGFzcz0idG9wIj48ZGl2IGNsYXNzPSJ3cmFwIj4KICAgIDxhIGNsYXNzPSJicmFuZCIgaHJlZj0iLyI+PGltZyBzcmM9Ii9sb2dvLnN2ZyIgYWx0PSIiPkV0aXF1ZXRhSHViPC9hPgogICAgJHt0YWJzLmxlbmd0aCA+IDEgPyBgPG5hdiBjbGFzcz0ibmF2Ij4ke3RhYnMubWFwKChbaywgbl0pID0+IGA8YnV0dG9uIGRhdGEtdGFiPSIke2t9IiBhcmlhLWN1cnJlbnQ9IiR7ayA9PT0gdGFifSI+JHtufTwvYnV0dG9uPmApLmpvaW4oJycpfTwvbmF2PmAgOiAnJ30KICAgIDxzcGFuIGNsYXNzPSJzcGFjZXIiPjwvc3Bhbj4KICAgIDxzcGFuIGNsYXNzPSJsaXZlIiBpZD0ibGl2ZSI+PGk+PC9pPjxzcGFuPkNvbmVjdGFuZG/igKY8L3NwYW4+PC9zcGFuPgogICAgPGRpdiBjbGFzcz0iY2xvY2siIGlkPSJjbG9jayI+JHtJLmNsb2NrLnJlcGxhY2UoJzxzdmcnLCAnPHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHN0eWxlPSJjb2xvcjp2YXIoLS1hY2NlbnQpIicpfTxkaXY+PHNtYWxsPkNvcnRlICR7ZXNjKG1lLmN1dG9mZil9PC9zbWFsbD48YiBpZD0iY2QiPi0tOi0tOi0tPC9iPjwvZGl2PjwvZGl2PgogICAgPGRpdiBjbGFzcz0idXNlciI+PGRpdj48Yj4ke2VzYyhtZS5zZWxsZXI/Lm5hbWUgfHwgbWUudXNlci5uYW1lKX08L2I+PHNtYWxsPiR7ZXNjKG1lLnVzZXIuZW1haWwpfTwvc21hbGw+PC9kaXY+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgaWQ9Im15QWNjIj5NaSBjbGF2ZTwvYnV0dG9uPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGlkPSJsb2dvdXQiPlNhbGlyPC9idXR0b24+PC9kaXY+CiAgPC9kaXY+PC9oZWFkZXI+CiAgPG1haW4gY2xhc3M9IndyYXAiIGlkPSJtYWluIj48L21haW4+YDsKICAkJCgnLm5hdiBidXR0b24nKS5mb3JFYWNoKGIgPT4gYi5vbmNsaWNrID0gKCkgPT4geyB0YWIgPSBiLmRhdGFzZXQudGFiOyBzdG9yZS5zZXQoJ3RhYicsIHRhYik7ICQkKCcubmF2IGJ1dHRvbicpLmZvckVhY2goeCA9PiB4LnNldEF0dHJpYnV0ZSgnYXJpYS1jdXJyZW50JywgeCA9PT0gYikpOyByZW5kZXJUYWIoKTsgfSk7CiAgJCgnI215QWNjJykub25jbGljayA9ICgpID0+IHJlbmRlck15QWNjb3VudCgpOwogIGlmIChtZS5pbXBlcnNvbmF0ZWRCeSkgewogICAgY29uc3QgYmFyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7CiAgICBiYXIuc3R5bGUuY3NzVGV4dCA9ICdiYWNrZ3JvdW5kOnZhcigtLXdhcm4tYmcpO2NvbG9yOnZhcigtLXdhcm4pO2ZvbnQtd2VpZ2h0OjcwMDtwYWRkaW5nOjEwcHggMTZweDtkaXNwbGF5OmZsZXg7Z2FwOjEycHg7YWxpZ24taXRlbXM6Y2VudGVyO2p1c3RpZnktY29udGVudDpjZW50ZXI7ZmxleC13cmFwOndyYXAnOwogICAgYmFyLmlubmVySFRNTCA9IGBFc3TDoXMgdmllbmRvIGxhIGN1ZW50YSBkZSAke2VzYyhtZS51c2VyLm5hbWUpfSAoJHtlc2MobWUudXNlci5lbWFpbCl9KSA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkgYnRuLXNtIiBpZD0ic3RvcEltcCI+Vm9sdmVyIGEgbWkgY3VlbnRhPC9idXR0b24+YDsKICAgICQoJyNhcHAnKS5wcmVwZW5kKGJhcik7CiAgICAkKCcjc3RvcEltcCcpLm9uY2xpY2sgPSBhc3luYyAoKSA9PiB7IGF3YWl0IGFwaSgnL2FwaS9pbXBlcnNvbmF0ZS9zdG9wJywgeyBtZXRob2Q6ICdQT1NUJyB9KTsgbG9jYXRpb24uaHJlZiA9ICcvJzsgfTsKICB9CiAgJCgnI2xvZ291dCcpLm9uY2xpY2sgPSBhc3luYyAoKSA9PiB7IGF3YWl0IGFwaSgnL2FwaS9sb2dvdXQnLCB7IG1ldGhvZDogJ1BPU1QnIH0pLmNhdGNoKCgpID0+IHt9KTsgbG9jYXRpb24ucmVsb2FkKCk7IH07CiAgc3RhcnRDbG9jaygpOyBjb25uZWN0U3RyZWFtKCk7IHJlbmRlclRhYigpOyB3YXRjaFZlcnNpb24oKTsKfQovLyBTaSBzZSBwdWJsaWNhIHVuYSB2ZXJzacOzbiBudWV2YSBkZSBsYSBhcHAsIGxhIHBhbnRhbGxhIHNlIGFjdHVhbGl6YSBzb2xhCmZ1bmN0aW9uIHdhdGNoVmVyc2lvbigpIHsKICBpZiAod2F0Y2hWZXJzaW9uLl9pKSByZXR1cm47CiAgY29uc3QgY2hlY2sgPSBhc3luYyAoKSA9PiB7CiAgICB0cnkgewogICAgICBjb25zdCB7IHYgfSA9IGF3YWl0IGZldGNoKCcvaGVhbHRoJywgeyBjYWNoZTogJ25vLXN0b3JlJyB9KS50aGVuKHIgPT4gci5qc29uKCkpOwogICAgICBpZiAoIXdhdGNoVmVyc2lvbi52KSB3YXRjaFZlcnNpb24udiA9IHY7CiAgICAgIGVsc2UgaWYgKHYgJiYgdiAhPT0gd2F0Y2hWZXJzaW9uLnYgJiYgIWRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0OmZvY3VzLCB0ZXh0YXJlYTpmb2N1cycpKSBsb2NhdGlvbi5yZWxvYWQoKTsKICAgIH0gY2F0Y2gge30KICB9OwogIGNoZWNrKCk7IHdhdGNoVmVyc2lvbi5faSA9IHNldEludGVydmFsKGNoZWNrLCA2MDAwMCk7Cn0KZnVuY3Rpb24gcmVuZGVyVGFiKCkgeyAoeyB0cmF5OiByZW5kZXJUcmF5LCBzZWxsZXI6IHJlbmRlclNlbGxlciwgYWRtaW46IHJlbmRlckFkbWluLCBzZWxsZXJzVmlldzogcmVuZGVyU2VsbGVyc1ZpZXcsIHNhbGVzOiByZW5kZXJTYWxlcyB9KVt0YWJdKCk7IH0KCi8vIC0tLS0tLS0tLS0gVkVOVEFTIC0tLS0tLS0tLS0KLy8gUGxhbmlsbGEgZGUgcHJvZHVjdG9zIHZlbmRpZG9zOiBmaWphIGRlIGx1bmVzIGEgZG9taW5nbzsgdGFtYmnDqW4gbWVzLCAzMCBkw61hcywgYcOxbyBvIGZlY2hhcyBhIGVsZWNjacOzbgpjb25zdCBwcCA9IHsgbW9kZTogJ3dlZWsnLCB3ZWVrOiAwLCBmcm9tOiAnJywgdG86ICcnLCBxOiAnJyB9Owpjb25zdCBpc28gPSBkID0+IGAke2QuZ2V0RnVsbFllYXIoKX0tJHtTdHJpbmcoZC5nZXRNb250aCgpICsgMSkucGFkU3RhcnQoMiwgJzAnKX0tJHtTdHJpbmcoZC5nZXREYXRlKCkpLnBhZFN0YXJ0KDIsICcwJyl9YDsKZnVuY3Rpb24gcHBSYW5nZSgpIHsKICBjb25zdCB0ID0gbmV3IERhdGUoKTsgdC5zZXRIb3VycygxMiwgMCwgMCwgMCk7CiAgaWYgKHBwLm1vZGUgPT09ICd3ZWVrJykgeyBjb25zdCBtb24gPSBuZXcgRGF0ZSh0KTsgbW9uLnNldERhdGUodC5nZXREYXRlKCkgLSAoKHQuZ2V0RGF5KCkgKyA2KSAlIDcpICsgcHAud2VlayAqIDcpOyBjb25zdCBzdW4gPSBuZXcgRGF0ZShtb24pOyBzdW4uc2V0RGF0ZShtb24uZ2V0RGF0ZSgpICsgNik7IHJldHVybiBbaXNvKG1vbiksIGlzbyhzdW4pXTsgfQogIGlmIChwcC5tb2RlID09PSAnbW9udGgnKSByZXR1cm4gW2lzbyhuZXcgRGF0ZSh0LmdldEZ1bGxZZWFyKCksIHQuZ2V0TW9udGgoKSwgMSkpLCBpc28odCldOwogIGlmIChwcC5tb2RlID09PSAnMzAnKSB7IGNvbnN0IGYgPSBuZXcgRGF0ZSh0KTsgZi5zZXREYXRlKHQuZ2V0RGF0ZSgpIC0gMjkpOyByZXR1cm4gW2lzbyhmKSwgaXNvKHQpXTsgfQogIGlmIChwcC5tb2RlID09PSAneWVhcicpIHJldHVybiBbaXNvKG5ldyBEYXRlKHQuZ2V0RnVsbFllYXIoKSwgMCwgMSkpLCBpc28odCldOwogIHJldHVybiBbcHAuZnJvbSB8fCBpc28odCksIHBwLnRvIHx8IGlzbyh0KV07Cn0KY29uc3QgZm10RCA9IGQgPT4gbmV3IERhdGUoZCArICdUMTI6MDA6MDAnKS50b0xvY2FsZURhdGVTdHJpbmcoJ2VzLUNMJywgeyB3ZWVrZGF5OiAnc2hvcnQnLCBkYXk6ICdudW1lcmljJywgbW9udGg6ICdzaG9ydCcgfSkucmVwbGFjZSgnLicsICcnKTsKYXN5bmMgZnVuY3Rpb24gcmVuZGVyUHJvZHVjdHMoKSB7CiAgY29uc3QgYm94ID0gJCgnI3Byb2RQYW5lbCcpOyBpZiAoIWJveCkgcmV0dXJuOwogIGNvbnN0IGlzQWRtaW4gPSBtZS51c2VyLnJvbGUgPT09ICdhZG1pbic7CiAgY29uc3Qgc2lkID0gaXNBZG1pbiA/IHN0b3JlLmdldCgnc2FsZXNTZWxsZXInLCAnJykgOiAnJzsKICBjb25zdCBbZnJvbSwgdG9dID0gcHBSYW5nZSgpOwogIGNvbnN0IHFzID0gYGZyb209JHtmcm9tfSZ0bz0ke3RvfSR7c2lkID8gJyZzZWxsZXJfaWQ9JyArIHNpZCA6ICcnfWA7CiAgYm94LmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIiBzdHlsZT0iZmxleC13cmFwOndyYXA7Z2FwOjEwcHgiPjxoMj5Qcm9kdWN0b3MgdmVuZGlkb3M8L2gyPgogICAgPHNlbGVjdCBpZD0icHBNb2RlIiBzdHlsZT0id2lkdGg6YXV0byI+JHtbWyd3ZWVrJywgJ1NlbWFuYSAobHVuZXMgYSBkb21pbmdvKSddLCBbJ21vbnRoJywgJ0VzdGUgbWVzJ10sIFsnMzAnLCAnw5psdGltb3MgMzAgZMOtYXMnXSwgWyd5ZWFyJywgJ0VzdGUgYcOxbyddLCBbJ2N1c3RvbScsICdFbGVnaXIgZmVjaGFz4oCmJ11dLm1hcCgoW2ssIG5dKSA9PiBgPG9wdGlvbiB2YWx1ZT0iJHtrfSIgJHtwcC5tb2RlID09PSBrID8gJ3NlbGVjdGVkJyA6ICcnfT4ke259PC9vcHRpb24+YCkuam9pbignJyl9PC9zZWxlY3Q+CiAgICAke3BwLm1vZGUgPT09ICd3ZWVrJyA/IGA8c3BhbiBjbGFzcz0icHAtd2VlayI+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgaWQ9InBwUHJldiIgYXJpYS1sYWJlbD0iU2VtYW5hIGFudGVyaW9yIj7igLk8L2J1dHRvbj48Yj4ke2VzYyhmbXREKGZyb20pKX0g4oCTICR7ZXNjKGZtdEQodG8pKX08L2I+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgaWQ9InBwTmV4dCIgYXJpYS1sYWJlbD0iU2VtYW5hIHNpZ3VpZW50ZSIgJHtwcC53ZWVrID49IDAgPyAnZGlzYWJsZWQnIDogJyd9PuKAujwvYnV0dG9uPjwvc3Bhbj5gIDogJyd9CiAgICAke3BwLm1vZGUgPT09ICdjdXN0b20nID8gYDxzcGFuIGNsYXNzPSJwcC13ZWVrIj48aW5wdXQgdHlwZT0iZGF0ZSIgaWQ9InBwRnJvbSIgdmFsdWU9IiR7ZnJvbX0iIHN0eWxlPSJ3aWR0aDphdXRvIj4gYSA8aW5wdXQgdHlwZT0iZGF0ZSIgaWQ9InBwVG8iIHZhbHVlPSIke3RvfSIgc3R5bGU9IndpZHRoOmF1dG8iPjwvc3Bhbj5gIDogJyd9CiAgICA8aW5wdXQgdHlwZT0ic2VhcmNoIiBpZD0icHBRIiBwbGFjZWhvbGRlcj0iQnVzY2FyIHByb2R1Y3RvIG8gU0tVIiB2YWx1ZT0iJHtlc2MocHAucSl9IiBzdHlsZT0id2lkdGg6YXV0bzttaW4td2lkdGg6MTkwcHgiPgogICAgPHNwYW4gY2xhc3M9InNwYWNlciIgc3R5bGU9ImZsZXg6MSI+PC9zcGFuPgogICAgPGEgY2xhc3M9ImJ0biBidG4tcHJpbWFyeSBidG4tc20iIGlkPSJwcFhscyIgaHJlZj0iL2FwaS9zYWxlcy9wcm9kdWN0cy54bHN4PyR7cXN9Ij4ke0kuZG93bn1EZXNjYXJnYXIgRXhjZWw8L2E+PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbC1ib2R5IiBpZD0icHBCb2R5Ij48ZGl2IGNsYXNzPSJtdXRlZCI+Q2FyZ2FuZG8gcHJvZHVjdG9z4oCmPC9kaXY+PC9kaXY+YDsKICAkKCcjcHBNb2RlJykub25jaGFuZ2UgPSBlID0+IHsgcHAubW9kZSA9IGUudGFyZ2V0LnZhbHVlOyBwcC53ZWVrID0gMDsgaWYgKHBwLm1vZGUgPT09ICdjdXN0b20nICYmICFwcC5mcm9tKSB7IGNvbnN0IFtmLCB0XSA9IHBwUmFuZ2UoKTsgcHAuZnJvbSA9IGY7IHBwLnRvID0gdDsgfSByZW5kZXJQcm9kdWN0cygpOyB9OwogIGlmICgkKCcjcHBQcmV2JykpIHsgJCgnI3BwUHJldicpLm9uY2xpY2sgPSAoKSA9PiB7IHBwLndlZWstLTsgcmVuZGVyUHJvZHVjdHMoKTsgfTsgJCgnI3BwTmV4dCcpLm9uY2xpY2sgPSAoKSA9PiB7IGlmIChwcC53ZWVrIDwgMCkgeyBwcC53ZWVrKys7IHJlbmRlclByb2R1Y3RzKCk7IH0gfTsgfQogIGlmICgkKCcjcHBGcm9tJykpIHsgY29uc3QgY2ggPSAoKSA9PiB7IHBwLmZyb20gPSAkKCcjcHBGcm9tJykudmFsdWU7IHBwLnRvID0gJCgnI3BwVG8nKS52YWx1ZTsgcmVuZGVyUHJvZHVjdHMoKTsgfTsgJCgnI3BwRnJvbScpLm9uY2hhbmdlID0gY2g7ICQoJyNwcFRvJykub25jaGFuZ2UgPSBjaDsgfQogIGxldCBkOwogIHRyeSB7IGQgPSBhd2FpdCBhcGkoJy9hcGkvc2FsZXMvcHJvZHVjdHM/JyArIHFzKTsgfSBjYXRjaCAoZSkgeyAkKCcjcHBCb2R5JykuaW5uZXJIVE1MID0gZXNjKGUubWVzc2FnZSk7IHJldHVybjsgfQogIGNvbnN0IGRyYXcgPSAoKSA9PiB7CiAgICBpZiAoISQoJyNwcEJvZHknKSkgcmV0dXJuOwogICAgY29uc3QgcSA9IHBwLnEudG9Mb3dlckNhc2UoKTsKICAgIGNvbnN0IHJvd3MgPSBkLnJvd3MuZmlsdGVyKHIgPT4gIXEgfHwgW3IubmFtZSwgci52YXJpYW50LCByLnNrdSwgci5zZWxsZXJdLmpvaW4oJyAnKS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHEpKTsKICAgIGNvbnN0IGRheXMgPSBbXTsgZm9yIChsZXQgeCA9IG5ldyBEYXRlKGZyb20gKyAnVDEyOjAwOjAwJyk7IGlzbyh4KSA8PSB0byAmJiBkYXlzLmxlbmd0aCA8IDQwMDsgeC5zZXREYXRlKHguZ2V0RGF0ZSgpICsgMSkpIGRheXMucHVzaChpc28oeCkpOwogICAgY29uc3Qgd2Vla2x5ID0gZGF5cy5sZW5ndGggPD0gNywgYWxsID0gIXNpZCAmJiBpc0FkbWluOwogICAgY29uc3QgdG90ID0gayA9PiByb3dzLnJlZHVjZSgoYSwgcikgPT4gYSArICh0eXBlb2YgayA9PT0gJ2Z1bmN0aW9uJyA/IGsocikgOiByW2tdKSwgMCk7CiAgICBjb25zdCBoZWFkID0gYCR7YWxsID8gJzx0aD5WZW5kZWRvcjwvdGg+JyA6ICcnfTx0aD5Qcm9kdWN0bzwvdGg+PHRoPlNLVTwvdGg+JHt3ZWVrbHkgPyBkYXlzLm1hcCh4ID0+IGA8dGggY2xhc3M9Im51bSI+JHtlc2MoZm10RCh4KS5zcGxpdCgnICcpWzBdLnJlcGxhY2UoJywnLCAnJykpfTxzbWFsbD4ke3guc2xpY2UoOCl9PC9zbWFsbD48L3RoPmApLmpvaW4oJycpIDogWydtbCcsICdmYScsICdwYSddLm1hcChrID0+IGA8dGggY2xhc3M9Im51bSI+PGkgY2xhc3M9ImRvdCIgc3R5bGU9ImJhY2tncm91bmQ6JHtNS19DT0xPUltrXX0iPjwvaT4ke01LW2tdfTwvdGg+YCkuam9pbignJyl9PHRoIGNsYXNzPSJudW0iPlRvdGFsPC90aD48dGggY2xhc3M9Im51bSI+TW9udG88L3RoPmA7CiAgICBjb25zdCBjZWxsUSA9IG4gPT4gbiA/IGA8Yj4ke259PC9iPmAgOiAnPHNwYW4gY2xhc3M9Inplcm8iPsK3PC9zcGFuPic7CiAgICBjb25zdCBib2R5ID0gcm93cy5tYXAociA9PiBgPHRyPiR7YWxsID8gYDx0ZD4ke2VzYyhyLnNlbGxlcil9PC90ZD5gIDogJyd9PHRkPjxzcGFuIGNsYXNzPSJwcC1uYW1lIj4ke2VzYyhyLm5hbWUpfTwvc3Bhbj4ke3IudmFyaWFudCA/IGA8c21hbGwgY2xhc3M9Im11dGVkIj4ke2VzYyhyLnZhcmlhbnQpfTwvc21hbGw+YCA6ICcnfTwvdGQ+PHRkIGNsYXNzPSJtb25vIj4ke2VzYyhyLnNrdSl9PC90ZD4ke3dlZWtseSA/IGRheXMubWFwKHggPT4gYDx0ZCBjbGFzcz0ibnVtIj4ke2NlbGxRKHIuYnlEYXlbeF0gfHwgMCl9PC90ZD5gKS5qb2luKCcnKSA6IFsnbWwnLCAnZmEnLCAncGEnXS5tYXAoayA9PiBgPHRkIGNsYXNzPSJudW0iPiR7Y2VsbFEoci5ieU1rW2tdIHx8IDApfTwvdGQ+YCkuam9pbignJyl9PHRkIGNsYXNzPSJudW0gcHAtdG90YWwiPiR7ci5xdHl9PC90ZD48dGQgY2xhc3M9Im51bSI+JHttb25leShyLmFtb3VudCl9PC90ZD48L3RyPmApLmpvaW4oJycpOwogICAgY29uc3QgZm9vdCA9IGA8dHI+JHthbGwgPyAnPHRkPjwvdGQ+JyA6ICcnfTx0ZD48Yj5Ub3RhbCAoJHtyb3dzLmxlbmd0aH0gcHJvZHVjdG8ke3Jvd3MubGVuZ3RoID09PSAxID8gJycgOiAncyd9KTwvYj48L3RkPjx0ZD48L3RkPiR7d2Vla2x5ID8gZGF5cy5tYXAoeCA9PiBgPHRkIGNsYXNzPSJudW0iPjxiPiR7dG90KHIgPT4gci5ieURheVt4XSB8fCAwKX08L2I+PC90ZD5gKS5qb2luKCcnKSA6IFsnbWwnLCAnZmEnLCAncGEnXS5tYXAoayA9PiBgPHRkIGNsYXNzPSJudW0iPjxiPiR7dG90KHIgPT4gci5ieU1rW2tdIHx8IDApfTwvYj48L3RkPmApLmpvaW4oJycpfTx0ZCBjbGFzcz0ibnVtIHBwLXRvdGFsIj4ke3RvdCgncXR5Jyl9PC90ZD48dGQgY2xhc3M9Im51bSI+PGI+JHttb25leSh0b3QoJ2Ftb3VudCcpKX08L2I+PC90ZD48L3RyPmA7CiAgICBjb25zdCBub3RlID0gZC5oaXN0b3J5U2luY2UgJiYgZnJvbSA8IGQuaGlzdG9yeVNpbmNlID8gYDxwIGNsYXNzPSJwcC1ub3RlIj5Fc3RhbW9zIHRyYXllbmRvIHR1IGhpc3RvcmlhbCBkZSB2ZW50YXMgZGUgYSBwb2NvIChoYXN0YSAxIGHDsW8pLiBQb3IgYWhvcmEgaGF5IGRhdG9zIGNvbXBsZXRvcyBkZXNkZSBlbCAke2VzYyhmbXREKGQuaGlzdG9yeVNpbmNlKSl9OyBlbCByZXN0byBhcGFyZWNlIHNvbG8gZW4gbGFzIHByw7N4aW1hcyBob3Jhcy48L3A+YCA6ICcnOwogICAgJCgnI3BwQm9keScpLmlubmVySFRNTCA9IG5vdGUgKyAocm93cy5sZW5ndGggPyBgPGRpdiBjbGFzcz0idGFibGUtd3JhcCI+PHRhYmxlIGNsYXNzPSJwcC10YWJsZSI+PHRoZWFkPjx0cj4ke2hlYWR9PC90cj48L3RoZWFkPjx0Ym9keT4ke2JvZHl9PC90Ym9keT48dGZvb3Q+JHtmb290fTwvdGZvb3Q+PC90YWJsZT48L2Rpdj5gIDogYDxkaXYgY2xhc3M9ImVtcHR5Ij4ke3EgPyAnTmluZ8O6biBwcm9kdWN0byBjb2luY2lkZSBjb24gbGEgYsO6c3F1ZWRhLicgOiAnTm8gaGF5IHByb2R1Y3RvcyB2ZW5kaWRvcyBlbiBlc3RhcyBmZWNoYXMuJ308L2Rpdj5gKTsKICB9OwogIGRyYXcoKTsKICAkKCcjcHBRJykub25pbnB1dCA9IGUgPT4geyBwcC5xID0gZS50YXJnZXQudmFsdWU7IGRyYXcoKTsgfTsKfQpjb25zdCBNS19DT0xPUiA9IHsgbWw6ICcjQzk5QTAwJywgZmE6ICcjNEY4RjAwJywgcGE6ICcjMDA2OEI4JyB9OyAvLyBjb2xvcmVzIGRlIGNhZGEgbWFya2V0cGxhY2UgKHZhbGlkYWRvcyBwYXJhIGRhbHRvbmlzbW8sIGNvbiBldGlxdWV0YXMgeSBzZXBhcmFjacOzbikKY29uc3QgbW9uZXkgPSBuID0+ICckJyArIE1hdGgucm91bmQobikudG9Mb2NhbGVTdHJpbmcoJ2VzLUNMJyk7CmNvbnN0IG1vbmV5U2hvcnQgPSBuID0+IG4gPj0gMWU2ID8gJyQnICsgKG4gLyAxZTYpLnRvRml4ZWQoMSkucmVwbGFjZSgnLicsICcsJykucmVwbGFjZSgnLDAnLCAnJykgKyAnIE0nIDogbiA+PSAxZTQgPyAnJCcgKyBNYXRoLnJvdW5kKG4gLyAxZTMpICsgJyBtaWwnIDogbW9uZXkobik7CmNvbnN0IGRheVNob3J0ID0gZCA9PiB7IGNvbnN0IHggPSBuZXcgRGF0ZShkICsgJ1QxMjowMDowMCcpOyByZXR1cm4geC50b0xvY2FsZURhdGVTdHJpbmcoJ2VzLUNMJywgeyB3ZWVrZGF5OiAnc2hvcnQnIH0pLnJlcGxhY2UoJy4nLCAnJykgKyAnICcgKyB4LmdldERhdGUoKTsgfTsKY29uc3QgZGF5TG9uZyA9IGQgPT4gbmV3IERhdGUoZCArICdUMTI6MDA6MDAnKS50b0xvY2FsZURhdGVTdHJpbmcoJ2VzLUNMJywgeyB3ZWVrZGF5OiAnbG9uZycsIGRheTogJ251bWVyaWMnLCBtb250aDogJ2xvbmcnIH0pOwpjb25zdCBuaWNlTWF4ID0gdiA9PiB7IGlmICh2IDw9IDApIHJldHVybiAxMDAwMDsgY29uc3QgcCA9IE1hdGgucG93KDEwLCBNYXRoLmZsb29yKE1hdGgubG9nMTAodikpKTsgY29uc3QgZiA9IHYgLyBwOyByZXR1cm4gKGYgPD0gMSA/IDEgOiBmIDw9IDIgPyAyIDogZiA8PSAyLjUgPyAyLjUgOiBmIDw9IDUgPyA1IDogMTApICogcDsgfTsKZnVuY3Rpb24gYmFyUGF0aCh4LCB5LCB3LCBoLCByKSB7CiAgaWYgKGggPD0gMCkgcmV0dXJuICcnOwogIHIgPSBNYXRoLm1pbihyLCBoLCB3IC8gMik7CiAgcmV0dXJuIGBNJHt4fSwke3kgKyBofVYke3kgKyByfVEke3h9LCR7eX0gJHt4ICsgcn0sJHt5fUgke3ggKyB3IC0gcn1RJHt4ICsgd30sJHt5fSAke3ggKyB3fSwke3kgKyByfVYke3kgKyBofVpgOwp9Ci8vIEdyw6FmaWNvIGRlIGNvbHVtbmFzICh1bmEgc2VyaWUpIG8gY29sdW1uYXMgYXBpbGFkYXMgKHZhcmlhcykuIFRvb2x0aXAgcG9yIGNvbHVtbmEuCmZ1bmN0aW9uIGNvbHVtbkNoYXJ0KGRheXMsIHN0YWNrcywgeyBoZWlnaHQgPSAyMzAsIHRvZGF5LCB3aWR0aCA9IDY0MCB9ID0ge30pIHsKICBjb25zdCBXID0gTWF0aC5tYXgoMjgwLCB3aWR0aCksIEggPSBoZWlnaHQsIEwgPSA0LCBSID0gNTIsIFQgPSAyNiwgQiA9IDMwOwogIGNvbnN0IHRvdGFscyA9IGRheXMubWFwKChfLCBpKSA9PiBzdGFja3MucmVkdWNlKChhLCBzKSA9PiBhICsgcy52YWx1ZXNbaV0uYW1vdW50LCAwKSk7CiAgY29uc3QgbWF4ID0gbmljZU1heChNYXRoLm1heCguLi50b3RhbHMpICogMS4wOCk7CiAgY29uc3Qgc2xvdCA9IChXIC0gTCAtIFIpIC8gZGF5cy5sZW5ndGgsIGJ3ID0gTWF0aC5taW4oNTYsIHNsb3QgKiAwLjU4KTsKICBjb25zdCBjb21wYWN0ID0gc2xvdCA8IDc0OyAvLyBjYWphIGFuZ29zdGEgKGNlbHVsYXIgLyB0YXJqZXRhIGNoaWNhKTogbWVub3MgZXRpcXVldGFzIHBhcmEgcXVlIG5vIHNlIGVuY2ltZW4KICBsZXQgYmVzdEkgPSAwOyB0b3RhbHMuZm9yRWFjaCgodCwgaSkgPT4geyBpZiAodCA+IHRvdGFsc1tiZXN0SV0pIGJlc3RJID0gaTsgfSk7CiAgY29uc3QgeSA9IHYgPT4gVCArIChIIC0gVCAtIEIpICogKDEgLSB2IC8gbWF4KTsKICBsZXQgZyA9ICcnOwogIGZvciAoY29uc3QgZiBvZiBbMC41LCAxXSkgZyArPSBgPGxpbmUgeDE9IiR7TH0iIHgyPSIke1cgLSBSfSIgeTE9IiR7eShtYXggKiBmKX0iIHkyPSIke3kobWF4ICogZil9IiBzdHJva2U9InZhcigtLWxpbmUpIiBzdHJva2UtZGFzaGFycmF5PSIzIDQiLz48dGV4dCB4PSIke1cgLSAyfSIgeT0iJHt5KG1heCAqIGYpICsgNH0iIHRleHQtYW5jaG9yPSJlbmQiIGNsYXNzPSJjaC1heCI+JHttb25leVNob3J0KG1heCAqIGYpfTwvdGV4dD5gOwogIGcgKz0gYDxsaW5lIHgxPSIke0x9IiB4Mj0iJHtXIC0gUn0iIHkxPSIke3koMCl9IiB5Mj0iJHt5KDApfSIgc3Ryb2tlPSJ2YXIoLS1saW5lKSIvPmA7CiAgZGF5cy5mb3JFYWNoKChkLCBpKSA9PiB7CiAgICBjb25zdCB4ID0gTCArIHNsb3QgKiBpICsgKHNsb3QgLSBidykgLyAyOwogICAgbGV0IGFjYyA9IDA7CiAgICBjb25zdCBzZWdzID0gc3RhY2tzLmZpbHRlcihzID0+IHMudmFsdWVzW2ldLmFtb3VudCA+IDApOwogICAgc2Vncy5mb3JFYWNoKChzLCBrKSA9PiB7CiAgICAgIGNvbnN0IHYgPSBzLnZhbHVlc1tpXS5hbW91bnQsIHkxID0geShhY2MgKyB2KSwgeTAgPSB5KGFjYyk7CiAgICAgIGNvbnN0IHRvcCA9IGsgPT09IHNlZ3MubGVuZ3RoIC0gMTsKICAgICAgY29uc3QgaCA9IE1hdGgubWF4KDAsIHkwIC0geTEgLSAoayA+IDAgPyAyIDogMCkpOyAvLyAycHggZGUgc2VwYXJhY2nDs24gZW50cmUgc2VnbWVudG9zCiAgICAgIGcgKz0gdG9wID8gYDxwYXRoIGQ9IiR7YmFyUGF0aCh4LCB5MSwgYncsIGgsIDQpfSIgZmlsbD0iJHtzLmNvbG9yfSIvPmAgOiBgPHJlY3QgeD0iJHt4fSIgeT0iJHt5MX0iIHdpZHRoPSIke2J3fSIgaGVpZ2h0PSIke2h9IiBmaWxsPSIke3MuY29sb3J9Ii8+YDsKICAgICAgYWNjICs9IHY7CiAgICB9KTsKICAgIGNvbnN0IGlzVG9kYXkgPSBkID09PSB0b2RheTsKICAgIGlmICh0b3RhbHNbaV0gPiAwICYmICghY29tcGFjdCB8fCBpc1RvZGF5IHx8IGkgPT09IGJlc3RJKSkgeyBjb25zdCBsYmwgPSBtb25leVNob3J0KHRvdGFsc1tpXSksIGh3ID0gbGJsLmxlbmd0aCAqIDMuNjsgY29uc3QgY3ggPSBNYXRoLm1pbihNYXRoLm1heCh4ICsgYncgLyAyLCBMICsgaHcpLCBXIC0gUiAtIGh3ICsgMzApOyBnICs9IGA8dGV4dCB4PSIke2N4fSIgeT0iJHt5KHRvdGFsc1tpXSkgLSA3fSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgY2xhc3M9ImNoLXZhbCR7aXNUb2RheSA/ICcgY2gtdG9kYXknIDogJyd9Ij4ke2xibH08L3RleHQ+YDsgfQogICAgZyArPSBgPHRleHQgeD0iJHt4ICsgYncgLyAyfSIgeT0iJHtIIC0gMTB9IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBjbGFzcz0iY2gtZGF5JHtpc1RvZGF5ID8gJyBjaC10b2RheScgOiAnJ30iPiR7aXNUb2RheSA/ICdIb3knIDogY29tcGFjdCA/IGRheVNob3J0KGQpLnNsaWNlKDAsIDIpICsgJyAnICsgZC5zbGljZSg4KS5yZXBsYWNlKC9eMC8sICcnKSA6IGRheVNob3J0KGQpfTwvdGV4dD5gOwogICAgY29uc3QgdGlwID0gW2RheUxvbmcoZCksIC4uLnN0YWNrcy5tYXAocyA9PiBgJHtzLmxhYmVsfTogJHttb25leShzLnZhbHVlc1tpXS5hbW91bnQpfSDCtyAke3MudmFsdWVzW2ldLm9yZGVyc30gdmVudGEke3MudmFsdWVzW2ldLm9yZGVycyA9PT0gMSA/ICcnIDogJ3MnfWApLCBzdGFja3MubGVuZ3RoID4gMSA/IGBUb3RhbDogJHttb25leSh0b3RhbHNbaV0pfWAgOiAnJ10uZmlsdGVyKEJvb2xlYW4pLmpvaW4oJ3wnKTsKICAgIGcgKz0gYDxyZWN0IHg9IiR7TCArIHNsb3QgKiBpfSIgeT0iJHtUIC0gMjB9IiB3aWR0aD0iJHtzbG90fSIgaGVpZ2h0PSIke0ggLSBUIC0gQiArIDIwfSIgZmlsbD0idHJhbnNwYXJlbnQiIGNsYXNzPSJjaC1oaXQiIGRhdGEtdGlwPSIke2VzYyh0aXApfSIvPmA7CiAgfSk7CiAgcmV0dXJuIGA8c3ZnIHZpZXdCb3g9IjAgMCAke1d9ICR7SH0iIHdpZHRoPSIke1d9IiBoZWlnaHQ9IiR7SH0iIGNsYXNzPSJjaGFydCIgcm9sZT0iaW1nIj4ke2d9PC9zdmc+YDsKfQpmdW5jdGlvbiBzYWxlc1RhYmxlKGRheXMsIGQpIHsKICByZXR1cm4gYDxkZXRhaWxzIGNsYXNzPSJjaC10YWJsZSI+PHN1bW1hcnk+VmVyIHRhYmxhPC9zdW1tYXJ5PjxkaXYgY2xhc3M9InRhYmxlLXdyYXAiPjx0YWJsZT48dGhlYWQ+PHRyPjx0aD5Ew61hPC90aD4ke1snbWwnLCAnZmEnLCAncGEnXS5tYXAoayA9PiBgPHRoPiR7TUtba119PC90aD5gKS5qb2luKCcnKX08dGg+VG90YWw8L3RoPjwvdHI+PC90aGVhZD48dGJvZHk+CiAgICAke2RheXMubWFwKChkYXksIGkpID0+IGA8dHI+PHRkPiR7ZXNjKGRheUxvbmcoZGF5KSl9PC90ZD4ke1snbWwnLCAnZmEnLCAncGEnXS5tYXAoayA9PiBgPHRkPiR7bW9uZXkoZC5zZXJpZXNba11baV0uYW1vdW50KX0gPHNwYW4gY2xhc3M9Im11dGVkIj4oJHtkLnNlcmllc1trXVtpXS5vcmRlcnN9KTwvc3Bhbj48L3RkPmApLmpvaW4oJycpfTx0ZD48Yj4ke21vbmV5KFsnbWwnLCAnZmEnLCAncGEnXS5yZWR1Y2UoKGEsIGspID0+IGEgKyBkLnNlcmllc1trXVtpXS5hbW91bnQsIDApKX08L2I+PC90ZD48L3RyPmApLmpvaW4oJycpfQogIDwvdGJvZHk+PC90YWJsZT48L2Rpdj48L2RldGFpbHM+YDsKfQphc3luYyBmdW5jdGlvbiByZW5kZXJTYWxlcyhmb3JjZSA9IGZhbHNlKSB7CiAgY29uc3QgaXNBZG1pbiA9IG1lLnVzZXIucm9sZSA9PT0gJ2FkbWluJzsKICBpZiAoISQoJyNzYWxlc0JvZHknKSkgJCgnI21haW4nKS5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz0ic2VjdGlvbi10aXRsZSIgc3R5bGU9Im1hcmdpbi10b3A6MjJweCI+PGgyPiR7aXNBZG1pbiA/ICdWZW50YXMnIDogJ01pcyB2ZW50YXMnfTwvaDI+PHNwYW4gY2xhc3M9Im11dGVkIj7Dmmx0aW1vcyA3IGTDrWFzIMK3IHNlIGFjdHVhbGl6YSBzb2xhPC9zcGFuPjxzcGFuIGNsYXNzPSJzcGFjZXIiIHN0eWxlPSJmbGV4OjEiPjwvc3Bhbj48c3BhbiBpZD0ic2FsZXNQaWNrIj48L3NwYW4+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1naG9zdCBidG4tc20iIGlkPSJzYWxlc1JlZnJlc2giPiR7SS5zeW5jfUFjdHVhbGl6YXI8L2J1dHRvbj48L2Rpdj48ZGl2IGlkPSJzYWxlc0JvZHkiPjxkaXYgY2xhc3M9InBhbmVsIj48ZGl2IGNsYXNzPSJwYW5lbC1ib2R5IG11dGVkIj5DYXJnYW5kbyB0dXMgdmVudGFz4oCmPC9kaXY+PC9kaXY+PC9kaXY+PGRpdiBjbGFzcz0iY2gtdGlwIiBpZD0iY2hUaXAiIGhpZGRlbj48L2Rpdj5gOwogICQoJyNzYWxlc1JlZnJlc2gnKS5vbmNsaWNrID0gYXN5bmMgKCkgPT4geyAkKCcjc2FsZXNSZWZyZXNoJykuZGlzYWJsZWQgPSB0cnVlOyBhd2FpdCByZW5kZXJTYWxlcyh0cnVlKTsgaWYgKCQoJyNzYWxlc1JlZnJlc2gnKSkgJCgnI3NhbGVzUmVmcmVzaCcpLmRpc2FibGVkID0gZmFsc2U7IHRvYXN0KCdWZW50YXMgYWN0dWFsaXphZGFzJyk7IH07CiAgY29uc3Qgc2lkID0gaXNBZG1pbiA/IHN0b3JlLmdldCgnc2FsZXNTZWxsZXInLCAnJykgOiAnJzsKICBsZXQgZDsKICB0cnkgeyBkID0gYXdhaXQgYXBpKGAvYXBpL3NhbGVzPyR7c2lkID8gJ3NlbGxlcl9pZD0nICsgc2lkICsgJyYnIDogJyd9JHtmb3JjZSA/ICdyZWZyZXNoPTEnIDogJyd9YCk7IH0gY2F0Y2ggKGUpIHsgJCgnI3NhbGVzQm9keScpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJwYW5lbCI+PGRpdiBjbGFzcz0icGFuZWwtYm9keSI+JHtlc2MoZS5tZXNzYWdlKX08L2Rpdj48L2Rpdj5gOyByZXR1cm47IH0KICBpZiAodGFiICE9PSAnc2FsZXMnKSByZXR1cm47CiAgaWYgKGlzQWRtaW4pIHsKICAgICQoJyNzYWxlc1BpY2snKS5pbm5lckhUTUwgPSBgPHNlbGVjdCBpZD0ic2FsZXNTZWwiIHN0eWxlPSJ3aWR0aDphdXRvIj48b3B0aW9uIHZhbHVlPSIiPlRvZGFzIGxhcyBjdWVudGFzPC9vcHRpb24+JHtkLnNlbGxlcnMubWFwKHggPT4gYDxvcHRpb24gdmFsdWU9IiR7eC5pZH0iICR7U3RyaW5nKHguaWQpID09PSBTdHJpbmcoc2lkKSA/ICdzZWxlY3RlZCcgOiAnJ30+JHtlc2MoeC5uYW1lKX08L29wdGlvbj5gKS5qb2luKCcnKX08L3NlbGVjdD5gOwogICAgJCgnI3NhbGVzU2VsJykub25jaGFuZ2UgPSBlID0+IHsgc3RvcmUuc2V0KCdzYWxlc1NlbGxlcicsIGUudGFyZ2V0LnZhbHVlKTsgcmVuZGVyU2FsZXMoKTsgfTsKICB9CiAgY29uc3QgZGF5cyA9IGQuZGF5cywgdGkgPSBkYXlzLmxlbmd0aCAtIDEsIG1rcyA9IFsnbWwnLCAnZmEnLCAncGEnXTsKICBjb25zdCBkYXlUb3RhbCA9IGkgPT4gbWtzLnJlZHVjZSgoYSwgaykgPT4gYSArIGQuc2VyaWVzW2tdW2ldLmFtb3VudCwgMCk7CiAgY29uc3QgZGF5T3JkZXJzID0gaSA9PiBta3MucmVkdWNlKChhLCBrKSA9PiBhICsgZC5zZXJpZXNba11baV0ub3JkZXJzLCAwKTsKICBjb25zdCB3ZWVrVG90YWwgPSBkYXlzLnJlZHVjZSgoYSwgXywgaSkgPT4gYSArIGRheVRvdGFsKGkpLCAwKSwgd2Vla09yZGVycyA9IGRheXMucmVkdWNlKChhLCBfLCBpKSA9PiBhICsgZGF5T3JkZXJzKGkpLCAwKTsKICBsZXQgYmVzdCA9IDA7IGRheXMuZm9yRWFjaCgoXywgaSkgPT4geyBpZiAoZGF5VG90YWwoaSkgPiBkYXlUb3RhbChiZXN0KSkgYmVzdCA9IGk7IH0pOwogIGNvbnN0IHVwID0gZGF5VG90YWwodGkgLSAxKSA+IDAgJiYgZGF5VG90YWwodGkpID4gZGF5VG90YWwodGkgLSAxKSA/IE1hdGgucm91bmQoKGRheVRvdGFsKHRpKSAvIGRheVRvdGFsKHRpIC0gMSkgLSAxKSAqIDEwMCkgOiBudWxsOwogIGNvbnN0IGNoZWVyID0gdXAgPyBgwqFWYXMgJHt1cH0lIGFycmliYSBkZSBheWVyISDwn5qAYCA6IGRheU9yZGVycyh0aSkgPyBgwqFZYSBsbGV2YXMgJHtkYXlPcmRlcnModGkpfSB2ZW50YSR7ZGF5T3JkZXJzKHRpKSA9PT0gMSA/ICcnIDogJ3MnfSBob3khYCA6ICdFbCBkw61hIHJlY2nDqW4gZW1waWV6YTogdHVzIHZlbnRhcyBkZSBob3kgYXBhcmVjZW4gYXF1w60nOwogIGNvbnN0IHN0YWNrcyA9IG1rcy5tYXAoayA9PiAoeyBrZXk6IGssIGxhYmVsOiBNS1trXSwgY29sb3I6IE1LX0NPTE9SW2tdLCB2YWx1ZXM6IGQuc2VyaWVzW2tdIH0pKTsKICBjb25zdCBta0NhcmQgPSBrID0+IHsKICAgIGNvbnN0IHdrID0gZC5zZXJpZXNba10ucmVkdWNlKChhLCB4KSA9PiBhICsgeC5hbW91bnQsIDApLCBuID0gZC5zZXJpZXNba10ucmVkdWNlKChhLCB4KSA9PiBhICsgeC5vcmRlcnMsIDApOwogICAgY29uc3Qgb24gPSBkLmNvbm5lY3RlZC5pbmNsdWRlcyhrKSB8fCB3ayA+IDA7CiAgICByZXR1cm4gYDxkaXYgY2xhc3M9InBhbmVsIHNhbGVzLW1rIj48ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj48aDI+PGkgY2xhc3M9ImRvdCIgc3R5bGU9ImJhY2tncm91bmQ6JHtNS19DT0xPUltrXX0iPjwvaT4ke01LW2tdfTwvaDI+PHNwYW4gY2xhc3M9Im11dGVkIj4ke29uID8gYCR7bW9uZXkod2spfSDCtyAke259IHZlbnRhJHtuID09PSAxID8gJycgOiAncyd9IGVuIDcgZMOtYXNgIDogJyd9PC9zcGFuPjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJwYW5lbC1ib2R5Ij4ke29uID8gYDxkaXYgY2xhc3M9ImNoLXNsb3QiIGRhdGEtbWs9IiR7a30iIGRhdGEtaD0iMjAwIj48L2Rpdj5gIDogYDxkaXYgY2xhc3M9ImVtcHR5Ij5Db25lY3RhICR7TUtba119IGVuICR7aXNBZG1pbiA/ICdWZW5kZWRvcmVzJyA6ICdNaSBjdWVudGEnfSBwYXJhIHZlciBhcXXDrSBzdXMgdmVudGFzLjwvZGl2PmB9PC9kaXY+PC9kaXY+YDsKICB9OwogICQoJyNzYWxlc0JvZHknKS5pbm5lckhUTUwgPSBgCiAgICA8ZGl2IGNsYXNzPSJzYWxlcy1rcGlzIj4KICAgICAgPGRpdiBjbGFzcz0ia3BpIGtwaS1oZXJvIj48c21hbGw+VmVuZGlzdGUgaG95PC9zbWFsbD48Yj4ke21vbmV5KGRheVRvdGFsKHRpKSl9PC9iPjxzcGFuPiR7ZGF5T3JkZXJzKHRpKX0gdmVudGEke2RheU9yZGVycyh0aSkgPT09IDEgPyAnJyA6ICdzJ30gwrcgJHtlc2MoY2hlZXIpfTwvc3Bhbj48L2Rpdj4KICAgICAgJHtta3MubWFwKGsgPT4gYDxkaXYgY2xhc3M9ImtwaSI+PHNtYWxsPjxpIGNsYXNzPSJkb3QiIHN0eWxlPSJiYWNrZ3JvdW5kOiR7TUtfQ09MT1Jba119Ij48L2k+JHtNS1trXX0gaG95PC9zbWFsbD48Yj4ke21vbmV5KGQuc2VyaWVzW2tdW3RpXS5hbW91bnQpfTwvYj48c3Bhbj4ke2Quc2VyaWVzW2tdW3RpXS5vcmRlcnN9IHZlbnRhJHtkLnNlcmllc1trXVt0aV0ub3JkZXJzID09PSAxID8gJycgOiAncyd9PC9zcGFuPjwvZGl2PmApLmpvaW4oJycpfQogICAgICA8ZGl2IGNsYXNzPSJrcGkiPjxzbWFsbD7Dmmx0aW1vcyA3IGTDrWFzPC9zbWFsbD48Yj4ke21vbmV5KHdlZWtUb3RhbCl9PC9iPjxzcGFuPiR7d2Vla09yZGVyc30gdmVudGFzJHtkYXlUb3RhbChiZXN0KSA+IDAgPyBgIMK3IG1lam9yIGTDrWE6ICR7ZXNjKGRheUxvbmcoZGF5c1tiZXN0XSkuc3BsaXQoJywnKVswXSl9IPCfj4ZgIDogJyd9PC9zcGFuPjwvZGl2PgogICAgPC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbCI+PGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+PGgyPlRvZG9zIGxvcyBtYXJrZXRwbGFjZXM8L2gyPjxkaXYgY2xhc3M9ImxlZ2VuZCI+JHtta3MubWFwKGsgPT4gYDxzcGFuPjxpIGNsYXNzPSJkb3QiIHN0eWxlPSJiYWNrZ3JvdW5kOiR7TUtfQ09MT1Jba119Ij48L2k+JHtNS1trXX08L3NwYW4+YCkuam9pbignJyl9PC9kaXY+PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9InBhbmVsLWJvZHkiPjxkaXYgY2xhc3M9ImNoLXNsb3QiIGRhdGEtbWs9ImFsbCIgZGF0YS1oPSIyNjAiPjwvZGl2PiR7c2FsZXNUYWJsZShkYXlzLCBkKX08L2Rpdj48L2Rpdj4KICAgIDxkaXYgY2xhc3M9InNhbGVzLWdyaWQiPiR7bWtzLm1hcChta0NhcmQpLmpvaW4oJycpfTwvZGl2PgogICAgPGRpdiBjbGFzcz0icGFuZWwiIGlkPSJwcm9kUGFuZWwiIHN0eWxlPSJtYXJnaW4tdG9wOjE0cHgiPjwvZGl2PgogICAgPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEyLjVweDttYXJnaW46MTBweCAycHgiPk1vbnRvcyBwYWdhZG9zIHNlZ8O6biBjYWRhIG1hcmtldHBsYWNlIChzaW4gY29zdG8gZGUgZW52w61vIGVuIE1lcmNhZG8gTGlicmUpLiBObyBpbmNsdXllIHZlbnRhcyBjYW5jZWxhZGFzLiR7ZC51cGRhdGVkQXQgPyAnIEFjdHVhbGl6YWRvICcgKyBlc2MobmV3IERhdGUoZC51cGRhdGVkQXQpLnRvTG9jYWxlVGltZVN0cmluZygnZXMtQ0wnLCB7IGhvdXI6ICdudW1lcmljJywgbWludXRlOiAnMi1kaWdpdCcgfSkpICsgJy4nIDogJyd9PC9wPmA7CiAgLy8gbG9zIGdyw6FmaWNvcyBzZSBkaWJ1amFuIGFsIGFuY2hvIHJlYWwgZGUgc3UgY2FqYTogZWwgdGV4dG8gcXVlZGEgc2llbXByZSBkZWwgbWlzbW8gdGFtYcOxbyB5IGxlZ2libGUKICBjb25zdCBkcmF3ID0gKCkgPT4gJCQoJy5jaC1zbG90JykuZm9yRWFjaChlbCA9PiB7IGNvbnN0IHcgPSBlbC5jbGllbnRXaWR0aDsgaWYgKCF3IHx8IGVsLl93ID09PSB3KSByZXR1cm47IGVsLl93ID0gdzsgZWwuaW5uZXJIVE1MID0gY29sdW1uQ2hhcnQoZGF5cywgZWwuZGF0YXNldC5tayA9PT0gJ2FsbCcgPyBzdGFja3MgOiBbc3RhY2tzLmZpbmQocyA9PiBzLmtleSA9PT0gZWwuZGF0YXNldC5tayldLCB7IGhlaWdodDogK2VsLmRhdGFzZXQuaCwgdG9kYXk6IGQudG9kYXksIHdpZHRoOiB3IH0pOyB9KTsKICBkcmF3KCk7CiAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHJlbmRlclNhbGVzLl9ycyB8fCAoKCkgPT4ge30pKTsgcmVuZGVyU2FsZXMuX3JzID0gKCkgPT4geyBpZiAodGFiID09PSAnc2FsZXMnKSBkcmF3KCk7IH07IHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCByZW5kZXJTYWxlcy5fcnMpOwogIGNvbnN0IHRpcEVsID0gJCgnI2NoVGlwJyk7CiAgJCgnI3NhbGVzQm9keScpLm9ubW91c2Vtb3ZlID0gZSA9PiB7CiAgICBjb25zdCBoID0gZS50YXJnZXQuY2xvc2VzdCgnLmNoLWhpdCcpOwogICAgaWYgKCFoKSB7IHRpcEVsLmhpZGRlbiA9IHRydWU7IHJldHVybjsgfQogICAgY29uc3QgW3QsIC4uLnJlc3RdID0gaC5kYXRhc2V0LnRpcC5zcGxpdCgnfCcpOwogICAgdGlwRWwuaW5uZXJIVE1MID0gYDxiPiR7ZXNjKHQpfTwvYj4ke3Jlc3QubWFwKHIgPT4gYDxkaXY+JHtlc2Mocil9PC9kaXY+YCkuam9pbignJyl9YDsKICAgIHRpcEVsLmhpZGRlbiA9IGZhbHNlOwogICAgY29uc3QgeCA9IE1hdGgubWluKGUuY2xpZW50WCArIDE0LCBpbm5lcldpZHRoIC0gdGlwRWwub2Zmc2V0V2lkdGggLSA4KTsKICAgIHRpcEVsLnN0eWxlLmxlZnQgPSB4ICsgJ3B4JzsgdGlwRWwuc3R5bGUudG9wID0gKGUuY2xpZW50WSArIDE0KSArICdweCc7CiAgfTsKICAkKCcjc2FsZXNCb2R5Jykub25tb3VzZWxlYXZlID0gKCkgPT4geyB0aXBFbC5oaWRkZW4gPSB0cnVlOyB9OwogIHJlbmRlclByb2R1Y3RzKCk7CiAgY2xlYXJUaW1lb3V0KHJlbmRlclNhbGVzLl90KTsgcmVuZGVyU2FsZXMuX3QgPSBzZXRUaW1lb3V0KCgpID0+IHsgaWYgKHRhYiA9PT0gJ3NhbGVzJykgcmVuZGVyU2FsZXMoKTsgfSwgNSAqIDYwZTMpOwp9CgovLyAtLS0tLS0tLS0tIFZFTkRFRE9SRVMgKHNvbG8gbGVjdHVyYSwgcGFyYSBlbCBmdWxmaWxsbWVudCkgLS0tLS0tLS0tLQphc3luYyBmdW5jdGlvbiByZW5kZXJTZWxsZXJzVmlldygpIHsKICAkKCcjbWFpbicpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJzZWN0aW9uLXRpdGxlIiBzdHlsZT0ibWFyZ2luLXRvcDoyMnB4Ij48aDI+VmVuZGVkb3JlczwvaDI+PHNwYW4gY2xhc3M9Im11dGVkIj5Tb2xvIGxlY3R1cmE6IHF1w6kgbWFya2V0cGxhY2VzIHRpZW5lIGNvbmVjdGFkb3MgY2FkYSB2ZW5kZWRvci48L3NwYW4+PC9kaXY+PGRpdiBjbGFzcz0icGFuZWwiPjxkaXYgaWQ9InN2Qm9keSIgY2xhc3M9InBhbmVsLWJvZHkiPjxkaXYgY2xhc3M9Im11dGVkIj5DYXJnYW5kb+KApjwvZGl2PjwvZGl2PjwvZGl2PmA7CiAgY29uc3QgeyBzZWxsZXJzOiBsaXN0IH0gPSBhd2FpdCBhcGkoJy9hcGkvc2VsbGVycy9vdmVydmlldycpOwogIGNvbnN0IGNvbm4gPSBjID0+IGA8c3BhbiBjbGFzcz0ibWsgJHtjLm1hcmtldHBsYWNlfSI+JHtNS1tjLm1hcmtldHBsYWNlXX08L3NwYW4+IDxzcGFuIGNsYXNzPSJub3RlIiBzdHlsZT0iZGlzcGxheTppbmxpbmUiPiR7Yy5vayA/ICdDb25lY3RhZG8nIDogJzxiIHN0eWxlPSJjb2xvcjp2YXIoLS1sb2NrKSI+Q29uIHByb2JsZW1hczwvYj4nfSR7Yy5sYXN0X3N5bmNfYXQgPyAnIMK3IHJldmlzYWRvICcgKyBlc2MoZm10VGltZShjLmxhc3Rfc3luY19hdCkpIDogJyd9PC9zcGFuPmA7CiAgJCgnI3N2Qm9keScpLmlubmVySFRNTCA9IGxpc3QubGVuZ3RoID8gYDxkaXYgY2xhc3M9InRhYmxlLXdyYXAiPjx0YWJsZSBzdHlsZT0ibWluLXdpZHRoOjUyMHB4Ij48dGhlYWQ+PHRyPjx0aD5WZW5kZWRvcjwvdGg+PHRoPk1hcmtldHBsYWNlcyBjb25lY3RhZG9zPC90aD48dGg+UG9yIGltcHJpbWlyPC90aD48dGg+UHJvZHVjdG9zIGJsb3F1ZWFkb3M8L3RoPjwvdHI+PC90aGVhZD48dGJvZHk+CiAgICAke2xpc3QubWFwKHMgPT4gYDx0cj48dGQ+PGI+JHtlc2Mocy5uYW1lKX08L2I+PC90ZD48dGQ+PGRpdiBjbGFzcz0ic3RhY2siIHN0eWxlPSJnYXA6NnB4Ij4ke3MuY29ubmVjdGlvbnMubWFwKGNvbm4pLmpvaW4oJycpIHx8ICc8c3BhbiBjbGFzcz0ibXV0ZWQiPlNpbiBtYXJrZXRwbGFjZXMgY29uZWN0YWRvczwvc3Bhbj4nfTwvZGl2PjwvdGQ+PHRkPiR7cy5wZW5kaW5nfTwvdGQ+PHRkPiR7cy5ibG9ja2VkfTwvdGQ+PC90cj5gKS5qb2luKCcnKX0KICAgIDwvdGJvZHk+PC90YWJsZT48L2Rpdj5gIDogYDxkaXYgY2xhc3M9ImVtcHR5Ij4ke0VNUFRZX1NWR308ZGl2PkHDum4gbm8gaGF5IHZlbmRlZG9yZXMuPC9kaXY+PC9kaXY+YDsKfQoKZnVuY3Rpb24gc3RhcnRDbG9jaygpIHsKICBjb25zdCBbaGgsIG1tXSA9IG1lLmN1dG9mZi5zcGxpdCgnOicpLm1hcChOdW1iZXIpOwogIGNvbnN0IHRpY2sgPSAoKSA9PiB7CiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLCBjdXQgPSBuZXcgRGF0ZShub3cpOyBjdXQuc2V0SG91cnMoaGgsIG1tLCAwLCAwKTsKICAgIGNvbnN0IGMgPSAkKCcjY2xvY2snKTsgaWYgKCFjKSByZXR1cm47CiAgICBpZiAobm93ID49IGN1dCkgeyBjdXQuc2V0RGF0ZShjdXQuZ2V0RGF0ZSgpICsgMSk7IGMuY2xhc3NMaXN0LmFkZCgnbGF0ZScpOyB9IGVsc2UgYy5jbGFzc0xpc3QucmVtb3ZlKCdsYXRlJyk7CiAgICBjb25zdCBkID0gTWF0aC5mbG9vcigoY3V0IC0gbm93KSAvIDEwMDApOwogICAgJCgnI2NkJykudGV4dENvbnRlbnQgPSBbTWF0aC5mbG9vcihkIC8gMzYwMCksIE1hdGguZmxvb3IoZCAlIDM2MDAgLyA2MCksIGQgJSA2MF0ubWFwKHggPT4gU3RyaW5nKHgpLnBhZFN0YXJ0KDIsICcwJykpLmpvaW4oJzonKTsKICB9OwogIHRpY2soKTsgY2xlYXJJbnRlcnZhbChzdGFydENsb2NrLl9pKTsgc3RhcnRDbG9jay5faSA9IHNldEludGVydmFsKHRpY2ssIDEwMDApOwp9CgpsZXQgZXMgPSBudWxsLCByZWZyZXNoVCA9IG51bGw7CmZ1bmN0aW9uIGNvbm5lY3RTdHJlYW0oKSB7CiAgaWYgKGVzKSBlcy5jbG9zZSgpOwogIGVzID0gbmV3IEV2ZW50U291cmNlKCcvYXBpL3N0cmVhbScpOwogIGNvbnN0IGxpdmUgPSBvbiA9PiB7IGNvbnN0IGwgPSAkKCcjbGl2ZScpOyBpZiAoIWwpIHJldHVybjsgbC5jbGFzc0xpc3QudG9nZ2xlKCdvbicsIG9uKTsgbC5sYXN0RWxlbWVudENoaWxkLnRleHRDb250ZW50ID0gb24gPyAnRW4gdml2bycgOiAnUmVjb25lY3RhbmRv4oCmJzsgfTsKICBlcy5vbm9wZW4gPSAoKSA9PiBsaXZlKHRydWUpOwogIGVzLm9uZXJyb3IgPSAoKSA9PiBsaXZlKGZhbHNlKTsKICBlcy5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBldiA9PiB7CiAgICBjb25zdCBkID0gSlNPTi5wYXJzZShldi5kYXRhKTsKICAgIGNsZWFyVGltZW91dChyZWZyZXNoVCk7CiAgICByZWZyZXNoVCA9IHNldFRpbWVvdXQoKCkgPT4geyBpZiAodGFiID09PSAndHJheScpIGxvYWRPcmRlcnMoKTsgZWxzZSBpZiAodGFiID09PSAnc2VsbGVyJyAmJiBbJ29yZGVyJywgJ2xhYmVsJywgJ2Jsb2NrbGlzdCcsICdjb25uZWN0aW9uJywgJ3ByaW50ZWQnXS5pbmNsdWRlcyhkLnR5cGUpKSBsb2FkU2VsbGVyT3JkZXJzKCk7IH0sIDYwMCk7CiAgfSk7Cn0KCi8vIC0tLS0tLS0tLS0gQkFOREVKQSAoZnVsZmlsbG1lbnQpIC0tLS0tLS0tLS0KLy8gLS0tLS0tLS0tLSBCQU5ERUpBIChmdWxmaWxsbWVudCkgLS0tLS0tLS0tLQpjb25zdCBUQUJTID0gWwogIFsndG9kYXknLCAnUGFyYSBpbXByaW1pciBob3knLCAnU2FsZW4gaG95IChpbmNsdXllIEZsZXgpJywgSS5wcmludF0sCiAgWyd1cGNvbWluZycsICdQcsOzeGltb3MgZMOtYXMnLCAnU2UgZGVzcGFjaGFuIG3DoXMgYWRlbGFudGUnLCBJLmJveF0sCiAgWyd3YWl0aW5nJywgJ0VzcGVyYW5kbyBldGlxdWV0YScsICdFbCBtYXJrZXRwbGFjZSBhw7puIG5vIGxhIGxpYmVyYScsIEkuY2xvY2tdLAogIFsncHJpbnRlZCcsICdFdGlxdWV0YXMgaW1wcmVzYXMnLCAnSW1wcmVzYXMgbyB5YSBlbnZpYWRhcycsIEkuY2hlY2tdLAogIFsnYmxvY2tlZCcsICdCbG9xdWVhZGFzJywgJ051bWVyYWRhczogTsKwIDEsIDIsIDPigKYnLCBJLmxvY2tdLApdOwpjb25zdCBlbmRPZlRvZGF5ID0gKCkgPT4geyBjb25zdCBkID0gbmV3IERhdGUoKTsgZC5zZXRIb3VycygyMywgNTksIDU5LCA5OTkpOyByZXR1cm4gZDsgfTsKZnVuY3Rpb24gZGlzcGF0Y2hEYXRlKG8pIHsgY29uc3QgcyA9IG8uZGlzcGF0Y2hfYnk7IGlmICghcykgcmV0dXJuIG51bGw7IGNvbnN0IGQgPSBuZXcgRGF0ZShzLmluY2x1ZGVzKCdUJykgPyBzIDogcy5yZXBsYWNlKCcgJywgJ1QnKSk7IHJldHVybiBpc05hTihkKSA/IG51bGwgOiBkOyB9CmNvbnN0IGlzRm9yVG9kYXkgPSBvID0+IHsgY29uc3QgZCA9IGRpc3BhdGNoRGF0ZShvKTsgcmV0dXJuICFkIHx8IGQgPD0gZW5kT2ZUb2RheSgpOyB9Owpjb25zdCB0YWJPZiA9IG8gPT4gKG8uc3RhdGUgPT09ICdyZWFkeScgPyAoaXNGb3JUb2RheShvKSA/ICd0b2RheScgOiAndXBjb21pbmcnKSA6IG8uc3RhdGUgPT09ICdlcnJvcicgPyAnd2FpdGluZycgOiBvLnN0YXRlID09PSAnc2hpcHBlZCcgPyAncHJpbnRlZCcgOiBvLnN0YXRlID09PSAnY2FuY2VsbGVkJyA/IG51bGwgOiBvLnN0YXRlKTsKZnVuY3Rpb24gZGlzcGF0Y2hUZXh0KG8pIHsKICBjb25zdCBkID0gZGlzcGF0Y2hEYXRlKG8pOyBpZiAoIWQpIHJldHVybiAnJzsKICBjb25zdCB0b2RheSA9IG5ldyBEYXRlKCk7IHRvZGF5LnNldEhvdXJzKDAsIDAsIDAsIDApOwogIGNvbnN0IGRheSA9IG5ldyBEYXRlKGQpOyBkYXkuc2V0SG91cnMoMCwgMCwgMCwgMCk7CiAgY29uc3QgZGlmZiA9IE1hdGgucm91bmQoKGRheSAtIHRvZGF5KSAvIDg2NGU1KTsKICBjb25zdCBoID0gaGhtbShkKTsKICBpZiAoZGlmZiA8IDApIHJldHVybiBgQXRyYXNhZGEgwrcgZGViw61hIHNhbGlyIGVsICR7ZC50b0xvY2FsZURhdGVTdHJpbmcoJ2VzLUNMJywgeyBkYXk6ICdudW1lcmljJywgbW9udGg6ICdzaG9ydCcgfSl9YDsKICBpZiAoZGlmZiA9PT0gMCkgcmV0dXJuIGggPT09ICcyMzo1OScgfHwgaCA9PT0gJzAwOjAwJyA/ICdEZXNwYWNoYXIgaG95JyA6IChkIDwgbmV3IERhdGUoKSA/IGBEZXNwYWNoYXIgaG95IMK3IGNvcnRlICR7YW1wbShkKX1gIDogYERlc3BhY2hhciBob3kgYW50ZXMgZGUgbGFzICR7YW1wbShkKX1gKTsKICBpZiAoZGlmZiA9PT0gMSkgcmV0dXJuIGBEZXNwYWNoYXIgbWHDsWFuYSR7aCA9PT0gJzIzOjU5JyB8fCBoID09PSAnMDA6MDAnID8gJycgOiAnIGFudGVzIGRlIGxhcyAnICsgYW1wbShkKX1gOwogIHJldHVybiBgRGVzcGFjaGFyIGVsICR7ZC50b0xvY2FsZURhdGVTdHJpbmcoJ2VzLUNMJywgeyB3ZWVrZGF5OiAnbG9uZycsIGRheTogJ251bWVyaWMnLCBtb250aDogJ3Nob3J0JyB9KX1gOwp9CmZ1bmN0aW9uIHRzKG8pIHsKICBjb25zdCBzID0gby5zb2xkX2F0IHx8ICcnOwogIGlmIChzKSB7IGNvbnN0IGQgPSBuZXcgRGF0ZShzLmluY2x1ZGVzKCdUJykgPyBzIDogcy5yZXBsYWNlKCcgJywgJ1QnKSk7IGlmICghaXNOYU4oZCkpIHJldHVybiBkOyB9CiAgcmV0dXJuIG5ldyBEYXRlKChvLmNyZWF0ZWRfYXQgfHwgJycpLnJlcGxhY2UoJyAnLCAnVCcpICsgJ1onKTsKfQpmdW5jdGlvbiBkYXlMYWJlbChkKSB7CiAgY29uc3QgdG9kYXkgPSBuZXcgRGF0ZSgpOyB0b2RheS5zZXRIb3VycygwLCAwLCAwLCAwKTsKICBjb25zdCB4ID0gbmV3IERhdGUoZCk7IHguc2V0SG91cnMoMCwgMCwgMCwgMCk7CiAgY29uc3QgZGlmZiA9IE1hdGgucm91bmQoKHRvZGF5IC0geCkgLyA4NjRlNSk7CiAgY29uc3QgZiA9IGQudG9Mb2NhbGVEYXRlU3RyaW5nKCdlcy1DTCcsIHsgd2Vla2RheTogJ2xvbmcnLCBkYXk6ICdudW1lcmljJywgbW9udGg6ICdsb25nJyB9KTsKICByZXR1cm4gZGlmZiA9PT0gMCA/IGBIb3kgwrcgJHtmfWAgOiBkaWZmID09PSAxID8gYEF5ZXIgwrcgJHtmfWAgOiBmLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgZi5zbGljZSgxKTsKfQpjb25zdCBoaG1tID0gZCA9PiBkLnRvTG9jYWxlVGltZVN0cmluZygnZXMtQ0wnLCB7IGhvdXI6ICcyLWRpZ2l0JywgbWludXRlOiAnMi1kaWdpdCcsIGhvdXJDeWNsZTogJ2gyMycgfSk7CmNvbnN0IGFtcG0gPSBkID0+IHsgY29uc3QgaCA9IGQuZ2V0SG91cnMoKSwgbSA9IFN0cmluZyhkLmdldE1pbnV0ZXMoKSkucGFkU3RhcnQoMiwgJzAnKTsgcmV0dXJuIGAke2ggJSAxMiB8fCAxMn06JHttfSAke2ggPCAxMiA/ICdBTScgOiAnUE0nfWA7IH07CgpmdW5jdGlvbiByZW5kZXJUcmF5KCkgewogIGlmICghdWkudGFiIHx8IHVpLnRhYiA9PT0gJ3JlYWR5JykgdWkudGFiID0gJ3RvZGF5JzsKICBjb25zdCBhdXRvID0gc3RvcmUuZ2V0KCdhdXRvJywgZmFsc2UpOwogICQoJyNtYWluJykuaW5uZXJIVE1MID0gYAogIDxkaXYgY2xhc3M9InNlY3Rpb24tdGl0bGUiIHN0eWxlPSJtYXJnaW4tdG9wOjIycHgiPjxoMj5FdGlxdWV0YXM8L2gyPjxzcGFuIGNsYXNzPSJtdXRlZCI+TGFzIG3DoXMgbnVldmFzIGFycmliYS4gU2UgYWN0dWFsaXphIHNvbGEuPC9zcGFuPjwvZGl2PgogIDxkaXYgY2xhc3M9InRhYnNiaWciIGlkPSJ0YWJzQmlnIj48L2Rpdj4KICA8ZGl2IGNsYXNzPSJwYW5lbCI+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj4KICAgICAgPGRpdiBjbGFzcz0iY2hpcHMiIGlkPSJta0NoaXBzIj48L2Rpdj4KICAgICAgPHNlbGVjdCBpZD0ic2VsbGVyRiIgYXJpYS1sYWJlbD0iVmVuZGVkb3IiIHN0eWxlPSJ3aWR0aDphdXRvIj48L3NlbGVjdD4KICAgICAgPGlucHV0IHR5cGU9InNlYXJjaCIgaWQ9InEiIHBsYWNlaG9sZGVyPSJCdXNjYXIgY2xpZW50ZSwgcGVkaWRvIG8gU0tVIiB2YWx1ZT0iJHtlc2ModWkucSl9IiBhcmlhLWxhYmVsPSJCdXNjYXIiIHN0eWxlPSJ3aWR0aDphdXRvO21pbi13aWR0aDoyMjBweCI+CiAgICAgIDxzcGFuIGNsYXNzPSJzcGFjZXIiIHN0eWxlPSJmbGV4OjEiPjwvc3Bhbj4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1naG9zdCBidG4tc20iIGlkPSJzeW5jTm93Ij4ke0kuc3luY31CdXNjYXIgcGVkaWRvcyBhaG9yYTwvYnV0dG9uPgogICAgPC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJhY3Rpb25iYXIiIGlkPSJhY3Rpb25iYXIiPjwvZGl2PgogICAgPGRpdiBpZD0ibGlzdCI+PC9kaXY+CiAgPC9kaXY+CiAgPGRpdiBjbGFzcz0iYXV0b2JhciIgc3R5bGU9Im1hcmdpbi10b3A6MTZweCIgJHttZS51c2VyLnJvbGUgPT09ICdzZWxsZXInID8gJ2hpZGRlbicgOiAnJ30+CiAgICA8ZGl2PjxsYWJlbCBjbGFzcz0ic3dpdGNoIj48aW5wdXQgdHlwZT0iY2hlY2tib3giIGlkPSJhdXRvRGwiICR7YXV0byA/ICdjaGVja2VkJyA6ICcnfT4gRGVzY2FyZ2EgYXV0b23DoXRpY2E8L2xhYmVsPgogICAgPHA+TWllbnRyYXMgZXN0YSBwYW50YWxsYSBlc3TDqSBhYmllcnRhLCBjYWRhIGV0aXF1ZXRhIG51ZXZhIHNlIGRlc2NhcmdhIHNvbGEgZW4gUERGIHkgcGFzYSBhICJJbXByZXNhcyIuIExhIHByaW1lcmEgdmV6IGVsIG5hdmVnYWRvciBwdWVkZSBwZWRpciBwZXJtaXNvIHBhcmEgZGVzY2FyZ2FyIHZhcmlvcyBhcmNoaXZvcy48L3A+PC9kaXY+CiAgPC9kaXY+YDsKICAkKCcjYXV0b0RsJykub25jaGFuZ2UgPSBlID0+IHsgc3RvcmUuc2V0KCdhdXRvJywgZS50YXJnZXQuY2hlY2tlZCk7IHRvYXN0KGUudGFyZ2V0LmNoZWNrZWQgPyAnRGVzY2FyZ2EgYXV0b23DoXRpY2EgYWN0aXZhZGEnIDogJ0Rlc2NhcmdhIGF1dG9tw6F0aWNhIGRlc2FjdGl2YWRhJyk7IGlmIChlLnRhcmdldC5jaGVja2VkKSBhdXRvRG93bmxvYWQoKTsgfTsKICAkKCcjc3luY05vdycpLm9uY2xpY2sgPSBhc3luYyAoKSA9PiB7IGF3YWl0IGFwaSgnL2FwaS9zeW5jJywgeyBtZXRob2Q6ICdQT1NUJyB9KTsgdG9hc3QoJ0J1c2NhbmRvIHBlZGlkb3MgbnVldm9zIGVuIGxvcyBtYXJrZXRwbGFjZXPigKYnKTsgfTsKICAkKCcjdGFic0JpZycpLm9uY2xpY2sgPSBlID0+IHsgY29uc3QgYiA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLXRhYjJdJyk7IGlmICghYikgcmV0dXJuOyB1aS50YWIgPSBiLmRhdGFzZXQudGFiMjsgc2VsZWN0ZWQuY2xlYXIoKTsgZHJhd1Jvd3MoKTsgfTsKICAkKCcjbWtDaGlwcycpLm9uY2xpY2sgPSBlID0+IHsgY29uc3QgYiA9IGUudGFyZ2V0LmNsb3Nlc3QoJy5jaGlwJyk7IGlmICghYikgcmV0dXJuOyB1aS5tayA9IGIuZGF0YXNldC5tazsgZHJhd1Jvd3MoKTsgfTsKICAkKCcjc2VsbGVyRicpLm9uY2hhbmdlID0gZSA9PiB7IHVpLnNlbGxlciA9IGUudGFyZ2V0LnZhbHVlOyBkcmF3Um93cygpOyB9OwogICQoJyNxJykub25pbnB1dCA9IGUgPT4geyB1aS5xID0gZS50YXJnZXQudmFsdWUudHJpbSgpLnRvTG93ZXJDYXNlKCk7IGRyYXdSb3dzKCk7IH07CiAgJCgnI2xpc3QnKS5vbmNoYW5nZSA9IGUgPT4geyBjb25zdCBpZCA9IGUudGFyZ2V0LmRhdGFzZXQuaWQ7IGlmICghaWQpIHJldHVybjsgZS50YXJnZXQuY2hlY2tlZCA/IHNlbGVjdGVkLmFkZCgraWQpIDogc2VsZWN0ZWQuZGVsZXRlKCtpZCk7IGRyYXdBY3Rpb25iYXIoKTsgfTsKICAkKCcjbGlzdCcpLm9uY2xpY2sgPSBhc3luYyBlID0+IHsKICAgIGNvbnN0IGIgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1hY3RdJyk7IGlmICghYikgcmV0dXJuOwogICAgY29uc3QgaWQgPSArYi5kYXRhc2V0LmlkOwogICAgaWYgKGIuZGF0YXNldC5hY3QgPT09ICdwcmludCcpIHsgaWYgKG1lLnVzZXIucm9sZSA9PT0gJ3NlbGxlcicgJiYgIWNvbmZpcm0oJ1NpIGxhIGltcHJpbWVzIHTDuiwgcXVlZGEgY29tbyBpbXByZXNhIHBvciB0dSB0aWVuZGEgeSBlbCBmdWxmaWxsbWVudCBsYSB2ZXLDoSBlbiByb2pvIGNvbW8gIkV0aXF1ZXRhIGltcHJlc2EiLiDCv0ltcHJpbWlyPycpKSByZXR1cm47IHdpbmRvdy5vcGVuKGAvYXBpL29yZGVycy8ke2lkfS9sYWJlbC5wZGY/bWFyaz0xYCwgJ19ibGFuaycpOyBzZXRUaW1lb3V0KGxvYWRPcmRlcnMsIDEyMDApOyB0b2FzdCgnRXRpcXVldGEgYWJpZXJ0YSDCtyBwYXPDsyBhICJFdGlxdWV0YXMgaW1wcmVzYXMiJyk7IH0KICAgIGlmIChiLmRhdGFzZXQuYWN0ID09PSAncmVwcmludCcpIHdpbmRvdy5vcGVuKGAvYXBpL29yZGVycy8ke2lkfS9sYWJlbC5wZGZgLCAnX2JsYW5rJyk7CiAgICBpZiAoYi5kYXRhc2V0LmFjdCA9PT0gJ3JldHJ5JykgeyBiLmRpc2FibGVkID0gdHJ1ZTsgdHJ5IHsgYXdhaXQgYXBpKGAvYXBpL29yZGVycy8ke2lkfS9yZXRyeWAsIHsgbWV0aG9kOiAnUE9TVCcgfSk7IHRvYXN0KCdSZWludGVudGFuZG/igKYnKTsgbG9hZE9yZGVycygpOyB9IGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UpOyB9IH0KICAgIGlmIChiLmRhdGFzZXQuYWN0ID09PSAndW5ibG9jaycpIHsKICAgICAgaWYgKCFjb25maXJtKCfCv0Rlc2Jsb3F1ZWFyIGVzdGEgZXRpcXVldGE/IFBhc2EgYSAiUG9yIGltcHJpbWlyIi4gRW4gbGEgaG9qYSBkZWwgcGVkaWRvIHNhbGRyw6Egc3UgbsO6bWVybyB5IHF1ZWRhcsOhbiBtYXJjYWRvcyBjb24gIkZBTFRBIiBsb3MgcHJvZHVjdG9zIHF1ZSBzZSByZWxsZW5hbiBhcGFydGUuJykpIHJldHVybjsKICAgICAgYi5kaXNhYmxlZCA9IHRydWU7IHRyeSB7IGF3YWl0IGFwaShgL2FwaS9vcmRlcnMvJHtpZH0vdW5ibG9ja2AsIHsgbWV0aG9kOiAnUE9TVCcgfSk7IHRvYXN0KCdFdGlxdWV0YSBkZXNibG9xdWVhZGEnKTsgbG9hZE9yZGVycygpOyB9IGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UpOyBiLmRpc2FibGVkID0gZmFsc2U7IH0KICAgIH0KICAgIGlmIChiLmRhdGFzZXQuYWN0ID09PSAncmVibG9jaycpIHsgdHJ5IHsgYXdhaXQgYXBpKGAvYXBpL29yZGVycy8ke2lkfS9yZWJsb2NrYCwgeyBtZXRob2Q6ICdQT1NUJyB9KTsgdG9hc3QoJ0V0aXF1ZXRhIGJsb3F1ZWFkYSBvdHJhIHZleicpOyBsb2FkT3JkZXJzKCk7IH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IH0gfQogICAgaWYgKGIuZGF0YXNldC5hY3QgPT09ICd1bnByaW50JykgeyBhd2FpdCBhcGkoYC9hcGkvb3JkZXJzLyR7aWR9L3VucHJpbnRgLCB7IG1ldGhvZDogJ1BPU1QnIH0pOyB0b2FzdCgnVm9sdmnDsyBhICJFdGlxdWV0YXMgcG9yIGltcHJpbWlyIicpOyBsb2FkT3JkZXJzKCk7IH0KICB9OwogICQoJyNhY3Rpb25iYXInKS5vbmNsaWNrID0gZSA9PiB7CiAgICBjb25zdCBiID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtYnVsa10nKTsgaWYgKCFiKSByZXR1cm47CiAgICBpZiAoYi5kYXRhc2V0LmJ1bGsgPT09ICdhbGwnKSBkb3dubG9hZEJhdGNoKHZpc2libGVJbih1aS50YWIpLm1hcChvID0+IG8uaWQpKTsKICAgIGlmIChiLmRhdGFzZXQuYnVsayA9PT0gJ3NlbCcpIGRvd25sb2FkQmF0Y2goWy4uLnNlbGVjdGVkXSk7CiAgICBpZiAoYi5kYXRhc2V0LmJ1bGsgPT09ICdzZWxhbGwnKSB7IHZpc2libGVJbih1aS50YWIpLmZvckVhY2gobyA9PiBzZWxlY3RlZC5hZGQoby5pZCkpOyBkcmF3Um93cygpOyB9CiAgICBpZiAoYi5kYXRhc2V0LmJ1bGsgPT09ICdub25lJykgeyBzZWxlY3RlZC5jbGVhcigpOyBkcmF3Um93cygpOyB9CiAgfTsKICBsb2FkT3JkZXJzKCk7Cn0KCmFzeW5jIGZ1bmN0aW9uIGxvYWRPcmRlcnMoKSB7CiAgaWYgKHRhYiAhPT0gJ3RyYXknKSByZXR1cm47CiAgY29uc3QgZCA9IGF3YWl0IGFwaSgnL2FwaS9vcmRlcnM/dmlldz1hbGwnKTsKICBjb25zdCBwcmV2UmVhZHkgPSBuZXcgU2V0KG9yZGVycy5maWx0ZXIobyA9PiBvLnN0YXRlID09PSAncmVhZHknKS5tYXAobyA9PiBvLmlkKSk7CiAgb3JkZXJzID0gZC5vcmRlcnMuc29ydCgoYSwgYikgPT4gdHMoYikgLSB0cyhhKSk7CiAgc2VsbGVycyA9IGQuc2VsbGVyczsKICBjb25zdCBzZiA9ICQoJyNzZWxsZXJGJyk7CiAgaWYgKHNmKSB7IHNmLmlubmVySFRNTCA9IGA8b3B0aW9uIHZhbHVlPSJhbGwiPlRvZG9zIGxvcyB2ZW5kZWRvcmVzPC9vcHRpb24+YCArIHNlbGxlcnMubWFwKHMgPT4gYDxvcHRpb24gdmFsdWU9IiR7cy5pZH0iPiR7ZXNjKHMubmFtZSl9PC9vcHRpb24+YCkuam9pbignJyk7IHNmLnZhbHVlID0gdWkuc2VsbGVyOyB9CiAgY29uc3QgZnJlc2ggPSBvcmRlcnMuZmlsdGVyKG8gPT4gby5zdGF0ZSA9PT0gJ3JlYWR5JyAmJiAhcHJldlJlYWR5LmhhcyhvLmlkKSkubWFwKG8gPT4gby5pZCk7CiAgZHJhd1Jvd3MoZmlyc3RMb2FkID8gW10gOiBmcmVzaCk7CiAgaWYgKCFmaXJzdExvYWQgJiYgZnJlc2gubGVuZ3RoKSB0b2FzdChgJHtmcmVzaC5sZW5ndGh9IGV0aXF1ZXRhJHtmcmVzaC5sZW5ndGggPiAxID8gJ3MnIDogJyd9IG51ZXZhJHtmcmVzaC5sZW5ndGggPiAxID8gJ3MnIDogJyd9IHBvciBpbXByaW1pcmApOwogIGZpcnN0TG9hZCA9IGZhbHNlOwogIGlmIChzdG9yZS5nZXQoJ2F1dG8nLCBmYWxzZSkpIGF1dG9Eb3dubG9hZCgpOwp9Cgpjb25zdCBtYXRjaGVzRmlsdGVycyA9IG8gPT4gKHVpLm1rID09PSAnYWxsJyB8fCBvLm1hcmtldHBsYWNlID09PSB1aS5taykgJiYgKHVpLnNlbGxlciA9PT0gJ2FsbCcgfHwgU3RyaW5nKG8uc2VsbGVyX2lkKSA9PT0gdWkuc2VsbGVyKSAmJgogICghdWkucSB8fCBvLm9yZGVyX251bWJlci50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHVpLnEpIHx8IChvLmN1c3RvbWVyIHx8ICcnKS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHVpLnEpIHx8IG8uaXRlbXMuc29tZShpID0+IFtpLnNrdSwgaS5wdWJfaWQsIGkubmFtZV0uam9pbignICcpLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXModWkucSkpKTsKY29uc3QgdmlzaWJsZUluID0gdCA9PiBvcmRlcnMuZmlsdGVyKG8gPT4gdGFiT2YobykgPT09IHQgJiYgbWF0Y2hlc0ZpbHRlcnMobykpOwovLyBFbiAiUG9yIGltcHJpbWlyIiB0YW1iacOpbiBzZSBxdWVkYW4gbGFzIHF1ZSBzZSBpbXByaW1pZXJvbiBlbiBsYXMgw7psdGltYXMgMTIgaG9yYXMsIGVuIHJvam8gY29uICJWb2x2ZXIgYSBpbXByaW1pciIKY29uc3QgcHJpbnRlZFJlY2VudGx5ID0gbyA9PiBvLnN0YXRlID09PSAncHJpbnRlZCcgJiYgby5wcmludGVkX2F0ICYmIERhdGUubm93KCkgLSBuZXcgRGF0ZShvLnByaW50ZWRfYXQucmVwbGFjZSgnICcsICdUJykgKyAnWicpIDwgMTIgKiAzNjAwZTM7CmZ1bmN0aW9uIHZpc2libGUoKSB7CiAgaWYgKHVpLnRhYiA9PT0gJ3RvZGF5JykgcmV0dXJuIG9yZGVycy5maWx0ZXIobyA9PiAoKG8uc3RhdGUgPT09ICdyZWFkeScgJiYgaXNGb3JUb2RheShvKSkgfHwgcHJpbnRlZFJlY2VudGx5KG8pKSAmJiBtYXRjaGVzRmlsdGVycyhvKSk7CiAgcmV0dXJuIHZpc2libGVJbih1aS50YWIpOwp9CgpmdW5jdGlvbiBpdGVtc0hUTUwobykgewogIGNvbnN0IGJhZCA9IG5ldyBTZXQoby5taXNzaW5nX2lkeCB8fCBbXSk7CiAgY29uc3QgbWl4ZWQgPSBiYWQuc2l6ZSA+IDA7IC8vIHBlZGlkbyBjb24gcHJvZHVjdG9zIGJsb3F1ZWFkb3M6IHJvam8gPSBubyBsbyB0aWVuZSBlbCBmdWxmaWxsbWVudCwgdmVyZGUgPSBzw60gbG8gdGllbmUKICByZXR1cm4gYDxkaXYgY2xhc3M9Iml0ZW1zIj4ke28uaXRlbXMubWFwKChpLCBuKSA9PiBgPHNwYW4gY2xhc3M9IiR7YmFkLmhhcyhuKSA/ICdiYWQnIDogJ2dvb2QnfSI+JHtiYWQuaGFzKG4pID8gJzxlbSBjbGFzcz0iZmFsdGEiPkZBTFRBPC9lbT4gJyA6IG1peGVkID8gJzxlbSBjbGFzcz0idGllbmUiPlRJRU5FPC9lbT4gJyA6ICcnfTxiPiR7ZXNjKGkucXR5KX3DlzwvYj4gJHtlc2MoaS5uYW1lKX0ke2kudmFyaWFudCA/IGAgPHNwYW4gY2xhc3M9InYiPsK3ICR7ZXNjKGkudmFyaWFudCl9PC9zcGFuPmAgOiAnJ30gPHNwYW4gY2xhc3M9Im1vbm8gdiI+JHtlc2MoaS5za3UgfHwgaS5wdWJfaWQpfTwvc3Bhbj48L3NwYW4+YCkuam9pbignJyl9PC9kaXY+YDsKfQpmdW5jdGlvbiBwaWxsKG8pIHsgcmV0dXJuIGA8c3BhbiBjbGFzcz0icGlsbCAke28uc3RhdGV9Ij4ke3BpbGxJY29uW28uc3RhdGVdIHx8ICcnfSR7U1RBVEVbby5zdGF0ZV0gfHwgby5zdGF0ZX08L3NwYW4+YDsgfQoKZnVuY3Rpb24gZHJhd1Jvd3MoZnJlc2ggPSBbXSkgewogIGlmICghJCgnI3RhYnNCaWcnKSkgcmV0dXJuOwogIGNvbnN0IGluVGFiID0gdCA9PiBvcmRlcnMuZmlsdGVyKG8gPT4gdGFiT2YobykgPT09IHQgJiYgKHVpLm1rID09PSAnYWxsJyB8fCBvLm1hcmtldHBsYWNlID09PSB1aS5taykgJiYgKHVpLnNlbGxlciA9PT0gJ2FsbCcgfHwgU3RyaW5nKG8uc2VsbGVyX2lkKSA9PT0gdWkuc2VsbGVyKSk7CiAgJCgnI3RhYnNCaWcnKS5pbm5lckhUTUwgPSBUQUJTLm1hcCgoW2ssIG4sIHN1YiwgaWNdKSA9PiBgPGJ1dHRvbiBjbGFzcz0idGIgdGItJHtrfSIgZGF0YS10YWIyPSIke2t9IiBhcmlhLXByZXNzZWQ9IiR7dWkudGFiID09PSBrfSI+PHNwYW4gY2xhc3M9InRiLWljIj4ke2ljfTwvc3Bhbj48c3Bhbj48Yj4ke2luVGFiKGspLmxlbmd0aH08L2I+PHNwYW4gY2xhc3M9InRiLW4iPiR7bn08L3NwYW4+PHNtYWxsPiR7c3VifTwvc21hbGw+PC9zcGFuPjwvYnV0dG9uPmApLmpvaW4oJycpOwogIGNvbnN0IG1rQ291bnQgPSBtayA9PiBvcmRlcnMuZmlsdGVyKG8gPT4gdGFiT2YobykgPT09IHVpLnRhYiAmJiAobWsgPT09ICdhbGwnIHx8IG8ubWFya2V0cGxhY2UgPT09IG1rKSkubGVuZ3RoOwogICQoJyNta0NoaXBzJykuaW5uZXJIVE1MID0gW1snYWxsJywgJ1RvZG9zJ10sIFsnbWwnLCAnTWVyY2FkbyBMaWJyZSddLCBbJ2ZhJywgJ0ZhbGFiZWxsYSddLCBbJ3BhJywgJ1BhcmlzJ11dLm1hcCgoW2ssIG5dKSA9PiBgPGJ1dHRvbiBjbGFzcz0iY2hpcCIgZGF0YS1taz0iJHtrfSIgYXJpYS1wcmVzc2VkPSIke3VpLm1rID09PSBrfSI+JHtufSA8c3BhbiBjbGFzcz0iY250Ij4ke21rQ291bnQoayl9PC9zcGFuPjwvYnV0dG9uPmApLmpvaW4oJycpOwogIGNvbnN0IHJvd3MgPSB2aXNpYmxlKCk7CiAgaWYgKCFyb3dzLmxlbmd0aCkgewogICAgY29uc3QgbXNnID0geyB0b2RheTogJ05vIGhheSBldGlxdWV0YXMgcG9yIGltcHJpbWlyIHBhcmEgaG95LiBMYXMgdmVudGFzIG51ZXZhcyAoeSBsb3MgRmxleCBxdWUgZW50cmVuIGR1cmFudGUgZWwgZMOtYSkgYXBhcmVjZW4gYXF1w60gc29sYXMuJywgdXBjb21pbmc6ICdObyBoYXkgZXRpcXVldGFzIHBhcmEgbG9zIHByw7N4aW1vcyBkw61hcy4nLCB3YWl0aW5nOiAnTmluZ3VuYSB2ZW50YSBlc3TDoSBlc3BlcmFuZG8gZXRpcXVldGEuJywgcHJpbnRlZDogJ0HDum4gbm8gaGF5IGV0aXF1ZXRhcyBpbXByZXNhcyBlbiBsb3Mgw7psdGltb3MgNyBkw61hcy4nLCBibG9ja2VkOiAnTm8gaGF5IHBlZGlkb3MgYmxvcXVlYWRvcy4nIH1bdWkudGFiXTsKICAgICQoJyNsaXN0JykuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9ImVtcHR5Ij4ke0VNUFRZX1NWR308ZGl2PiR7bXNnfTwvZGl2PjwvZGl2PmA7CiAgICBkcmF3QWN0aW9uYmFyKCk7IHJldHVybjsKICB9CiAgbGV0IGxhc3REYXkgPSAnJywgaHRtbCA9ICcnOwogIGZvciAoY29uc3QgbyBvZiByb3dzKSB7CiAgICBjb25zdCBkID0gdHMobyksIGRheSA9IGRheUxhYmVsKGQpOwogICAgaWYgKGRheSAhPT0gbGFzdERheSkgeyBodG1sICs9IGA8ZGl2IGNsYXNzPSJkYXloZWFkIj4ke2VzYyhkYXkpfTwvZGl2PmA7IGxhc3REYXkgPSBkYXk7IH0KICAgIGNvbnN0IHN0ID0gby5zdGF0ZTsKICAgIGxldCBub3RlID0gJycsIGJ0biA9ICcnOwogICAgY29uc3QgbWluZSA9IG8ub3duICE9PSBmYWxzZTsKICAgIGlmIChzdCA9PT0gJ3JlYWR5JyAmJiBtaW5lKSBidG4gPSBgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiBkYXRhLWFjdD0icHJpbnQiIGRhdGEtaWQ9IiR7by5pZH0iPiR7SS5wcmludH1JbXByaW1pcjwvYnV0dG9uPmA7CiAgICBpZiAoc3QgPT09ICdwcmludGVkJykgeyBub3RlID0gYDxzcGFuIGNsYXNzPSJub3RlIj5JbXByZXNhICR7ZXNjKGZtdFRpbWUoby5wcmludGVkX2F0KSl9JHtvLnByaW50ZWRfYnkgPyBgIMK3IDxiPkltcHJpbWnDszogJHtlc2Moby5wcmludGVkX2J5KX08L2I+YCA6ICcnfTwvc3Bhbj5gOyBpZiAobWluZSkgYnRuID0gYDxidXR0b24gY2xhc3M9ImJ0biBidG4tcmVwcmludCIgZGF0YS1hY3Q9InJlcHJpbnQiIGRhdGEtaWQ9IiR7by5pZH0iPiR7SS5wcmludH1Wb2x2ZXIgYSBpbXByaW1pcjwvYnV0dG9uPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtYWN0PSJ1bnByaW50IiBkYXRhLWlkPSIke28uaWR9Ij5NYXJjYXIgY29tbyBubyBpbXByZXNhPC9idXR0b24+YDsgfQogICAgaWYgKHN0ID09PSAnc2hpcHBlZCcpIG5vdGUgPSBgPHNwYW4gY2xhc3M9Im5vdGUiPllhIHNhbGnDsyDCtyA8Yj5JbXByaW1pw7M6ICR7ZXNjKG8ucHJpbnRlZF9ieSB8fCAnTWFya2V0cGxhY2UnKX08L2I+PC9zcGFuPmA7CiAgICBpZiAoc3QgPT09ICd3YWl0aW5nJyB8fCBzdCA9PT0gJ2Vycm9yJykgeyBub3RlID0gYDxzcGFuIGNsYXNzPSJub3RlICR7c3QgPT09ICdlcnJvcicgPyAnYmFkJyA6ICcnfSI+JHtlc2Moby5lcnJvciB8fCBvLndhaXRpbmdfbm90ZSB8fCAnRWwgbWFya2V0cGxhY2UgYcO6biBubyBsaWJlcmEgbGEgZXRpcXVldGEnKX08L3NwYW4+YDsgaWYgKG1pbmUpIGJ0biA9IGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWFjdD0icmV0cnkiIGRhdGEtaWQ9IiR7by5pZH0iPlJlaW50ZW50YXI8L2J1dHRvbj5gOyB9CiAgICBjb25zdCBub25lRm9yRmYgPSAoby5taXNzaW5nX2lkeCB8fCBbXSkubGVuZ3RoID4gMCAmJiAoby5taXNzaW5nX2lkeCB8fCBbXSkubGVuZ3RoID49IG8uaXRlbXMubGVuZ3RoOwogICAgaWYgKHN0ID09PSAnYmxvY2tlZCcpIHsgbm90ZSA9IG5vbmVGb3JGZiA/ICc8c3BhbiBjbGFzcz0ibm9wcmludCI+Uk9ORyBYSU4gTk8gSU1QUklNSVIgRVRJUVVFVEE8L3NwYW4+JyA6ICc8c3BhbiBjbGFzcz0ibm90ZSI+VGllbmUgcHJvZHVjdG9zIHF1ZSBubyB2YW4gYWwgZnVsZmlsbG1lbnQ6IG1hbmRhIHNvbG8gbG9zIG1hcmNhZG9zIGVuIHZlcmRlPC9zcGFuPic7IGlmIChtaW5lKSBidG4gPSBgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiBkYXRhLWFjdD0idW5ibG9jayIgZGF0YS1pZD0iJHtvLmlkfSI+JHtJLmxvY2t9RGVzYmxvcXVlYXIgZXRpcXVldGE8L2J1dHRvbj5gOyB9CiAgICBpZiAoby51bmJsb2NrZWRfYnkgJiYgby5ibG9ja19ubyAmJiBzdCAhPT0gJ2Jsb2NrZWQnKSB7CiAgICAgIG5vdGUgKz0gYDxzcGFuIGNsYXNzPSJub3RlIj48Yj5QZWRpZG8gaW5jb21wbGV0bzwvYj46IGVsIGZ1bGZpbGxtZW50IG1hbmRhIGxvIHN1eW8geSBzZSByZWxsZW5hIGxvIG1hcmNhZG8gIkZBTFRBIiDCtyBEZXNibG9xdWXDszogJHtlc2Moby51bmJsb2NrZWRfYnkpfTwvc3Bhbj5gOwogICAgICBpZiAobWluZSAmJiBbJ3JlYWR5JywgJ3dhaXRpbmcnLCAnZXJyb3InXS5pbmNsdWRlcyhzdCkpIGJ0biArPSBgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1hY3Q9InJlYmxvY2siIGRhdGEtaWQ9IiR7by5pZH0iPlZvbHZlciBhIGJsb3F1ZWFyPC9idXR0b24+YDsKICAgIH0KICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9Im9yb3cgc3QtJHtzdH0gJHtmcmVzaC5pbmNsdWRlcyhvLmlkKSA/ICdpcy1uZXcnIDogJyd9Ij4KICAgICAgPGRpdiBjbGFzcz0ib2MtY2hlY2siPiR7c3QgPT09ICdyZWFkeScgJiYgbWluZSA/IGA8aW5wdXQgdHlwZT0iY2hlY2tib3giIGNsYXNzPSJjYiIgZGF0YS1pZD0iJHtvLmlkfSIgJHtzZWxlY3RlZC5oYXMoby5pZCkgPyAnY2hlY2tlZCcgOiAnJ30gYXJpYS1sYWJlbD0iU2VsZWNjaW9uYXIgJHtlc2Moby5vcmRlcl9udW1iZXIpfSI+YCA6IHN0ID09PSAnYmxvY2tlZCcgPyBgPHNwYW4gY2xhc3M9ImxvY2tjZWxsIj4ke0kubG9ja308L3NwYW4+YCA6ICcnfTwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJvYy10aW1lIj48Yj4ke2VzYyhhbXBtKGQpKX08L2I+PHNwYW4gY2xhc3M9Im1rICR7by5tYXJrZXRwbGFjZX0iPiR7TUtbby5tYXJrZXRwbGFjZV0gfHwgby5tYXJrZXRwbGFjZX08L3NwYW4+JHtvLnNoaXBfdHlwZSA/IGA8c3BhbiBjbGFzcz0ic2hpcHR5cGUgc3QtJHtlc2Moby5zaGlwX3R5cGUudG9Mb3dlckNhc2UoKSl9Ij4ke2VzYyhvLnNoaXBfdHlwZSl9PC9zcGFuPmAgOiAnJ308L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0ib2MtbWFpbiI+JHtbJ3JlYWR5JywgJ3dhaXRpbmcnLCAnZXJyb3InXS5pbmNsdWRlcyhzdCkgJiYgZGlzcGF0Y2hUZXh0KG8pID8gYDxkaXYgY2xhc3M9ImRpc3BhdGNoICR7ZGlzcGF0Y2hUZXh0KG8pLnN0YXJ0c1dpdGgoJ0F0cmFzYWRhJykgPyAnbGF0ZScgOiAnJ30iPiR7ZXNjKGRpc3BhdGNoVGV4dChvKSl9PC9kaXY+YCA6ICcnfTxkaXYgY2xhc3M9Im9jLXRvcCI+JHtvLmJsb2NrX25vID8gYDxzcGFuIGNsYXNzPSJibG9ja25vIiB0aXRsZT0iTsO6bWVybyBkZWwgcGVkaWRvIGluY29tcGxldG8iPk7CsCAke28uYmxvY2tfbm99PC9zcGFuPmAgOiAnJ30ke28uY3VzdG9tZXIgPyBgPHNwYW4gY2xhc3M9ImN1c3QiPiR7ZXNjKG8uY3VzdG9tZXIpfTwvc3Bhbj5gIDogJyd9PGI+JHtlc2Moby5zZWxsZXIpfTwvYj4gPHNwYW4gY2xhc3M9Im1vbm8gbXV0ZWQiPiMke2VzYyhvLm9yZGVyX251bWJlcil9PC9zcGFuPjwvZGl2PiR7aXRlbXNIVE1MKG8pfSR7bm90ZX08L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0ib2MtYWN0Ij4ke3BpbGwobyl9PGRpdiBjbGFzcz0icm93LWFjdGlvbnMiPiR7YnRufSR7by50cmFja191cmwgPyBgPGEgY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGhyZWY9IiR7ZXNjKG8udHJhY2tfdXJsKX0iIHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIj5TZWd1aXIgZW52w61vPC9hPmAgOiAnJ308L2Rpdj4ke28udHJhY2tpbmcgPyBgPHNwYW4gY2xhc3M9Im5vdGUgbW9ubyI+TsKwIHNlZ3VpbWllbnRvICR7ZXNjKG8udHJhY2tpbmcpfTwvc3Bhbj5gIDogJyd9PC9kaXY+CiAgICA8L2Rpdj5gOwogIH0KICAkKCcjbGlzdCcpLmlubmVySFRNTCA9IGh0bWw7CiAgZHJhd0FjdGlvbmJhcigpOwp9CmZ1bmN0aW9uIGRyYXdBY3Rpb25iYXIoKSB7CiAgY29uc3QgYWIgPSAkKCcjYWN0aW9uYmFyJyk7IGlmICghYWIpIHJldHVybjsKICBpZiAoIVsndG9kYXknLCAndXBjb21pbmcnXS5pbmNsdWRlcyh1aS50YWIpKSB7IGFiLmlubmVySFRNTCA9ICcnOyBhYi5oaWRkZW4gPSB0cnVlOyByZXR1cm47IH0KICBhYi5oaWRkZW4gPSBmYWxzZTsKICBjb25zdCBuID0gdmlzaWJsZUluKHVpLnRhYikubGVuZ3RoLCBzID0gc2VsZWN0ZWQuc2l6ZTsKICBpZiAobWUudXNlci5yb2xlID09PSAnc2VsbGVyJykgeyBhYi5pbm5lckhUTUwgPSAnJzsgYWIuaGlkZGVuID0gdHJ1ZTsgcmV0dXJuOyB9CiAgYWIuaW5uZXJIVE1MID0gYDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgZGF0YS1idWxrPSJhbGwiICR7biA/ICcnIDogJ2Rpc2FibGVkJ30+JHtJLmRvd259SW1wcmltaXIgdG9kYXMgKCR7bn0pPC9idXR0b24+CiAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUiIGRhdGEtYnVsaz0ic2VsIiAke3MgPyAnJyA6ICdkaXNhYmxlZCd9PkltcHJpbWlyIHNlbGVjY2lvbmFkYXMgKCR7c30pPC9idXR0b24+CiAgICA8c3BhbiBjbGFzcz0ic3BhY2VyIiBzdHlsZT0iZmxleDoxIj48L3NwYW4+CiAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWJ1bGs9InNlbGFsbCI+U2VsZWNjaW9uYXIgdG9kYXM8L2J1dHRvbj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWJ1bGs9Im5vbmUiPlF1aXRhciBzZWxlY2Npw7NuPC9idXR0b24+YDsKfQpmdW5jdGlvbiB1cGRhdGVTZWwoKSB7IGRyYXdBY3Rpb25iYXIoKTsgfQoKbGV0IGRvd25sb2FkaW5nID0gZmFsc2U7CmFzeW5jIGZ1bmN0aW9uIGRvd25sb2FkQmF0Y2goaWRzLCB7IHNpbGVudCA9IGZhbHNlIH0gPSB7fSkgewogIGlmICghaWRzLmxlbmd0aCB8fCBkb3dubG9hZGluZykgcmV0dXJuIDA7CiAgZG93bmxvYWRpbmcgPSB0cnVlOwogIHRyeSB7CiAgICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaCgnL2FwaS9sYWJlbHMvYmF0Y2gnLCB7IG1ldGhvZDogJ1BPU1QnLCBjcmVkZW50aWFsczogJ3NhbWUtb3JpZ2luJywgaGVhZGVyczogeyAnY29udGVudC10eXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0sIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgaWRzLCBtYXJrOiB0cnVlIH0pIH0pOwogICAgaWYgKCFyZXMub2spIHsgY29uc3QgZSA9IGF3YWl0IHJlcy5qc29uKCkuY2F0Y2goKCkgPT4gKHt9KSk7IHRocm93IG5ldyBFcnJvcihlLmVycm9yIHx8ICdObyBzZSBwdWRvIGRlc2NhcmdhcicpOyB9CiAgICBjb25zdCBibG9iID0gYXdhaXQgcmVzLmJsb2IoKTsKICAgIGNvbnN0IG5hbWUgPSAocmVzLmhlYWRlcnMuZ2V0KCdjb250ZW50LWRpc3Bvc2l0aW9uJykgfHwgJycpLm1hdGNoKC9maWxlbmFtZT0iKFteIl0rKSIvKT8uWzFdIHx8ICdldGlxdWV0YXMucGRmJzsKICAgIGNvbnN0IGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7IGEuaHJlZiA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7IGEuZG93bmxvYWQgPSBuYW1lOyBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGEpOyBhLmNsaWNrKCk7IGEucmVtb3ZlKCk7CiAgICBzZXRUaW1lb3V0KCgpID0+IFVSTC5yZXZva2VPYmplY3RVUkwoYS5ocmVmKSwgNjAwMDApOwogICAgY29uc3QgbiA9ICtyZXMuaGVhZGVycy5nZXQoJ3gtbGFiZWwtY291bnQnKSB8fCBpZHMubGVuZ3RoOwogICAgdG9hc3QoYCR7bn0gZXRpcXVldGEke24gPT09IDEgPyAnJyA6ICdzJ30gZGVzY2FyZ2FkYSR7biA9PT0gMSA/ICcnIDogJ3MnfSB5IG1hcmNhZGEke24gPT09IDEgPyAnJyA6ICdzJ30gY29tbyBpbXByZXNhJHtuID09PSAxID8gJycgOiAncyd9YCk7CiAgICBzZWxlY3RlZC5jbGVhcigpOwogICAgcmV0dXJuIG47CiAgfSBjYXRjaCAoZSkgeyBpZiAoIXNpbGVudCkgdG9hc3QoZS5tZXNzYWdlKTsgcmV0dXJuIDA7IH0KICBmaW5hbGx5IHsgZG93bmxvYWRpbmcgPSBmYWxzZTsgc2V0VGltZW91dChsb2FkT3JkZXJzLCA0MDApOyB9Cn0KbGV0IGF1dG9UID0gbnVsbDsKZnVuY3Rpb24gYXV0b0Rvd25sb2FkKCkgewogIGNsZWFyVGltZW91dChhdXRvVCk7CiAgLy8gZXNwZXJhIHVub3Mgc2VndW5kb3MgcGFyYSBqdW50YXIgZXRpcXVldGFzIHF1ZSBsbGVnYW4gY2FzaSBqdW50YXMgZW4gdW4gc29sbyBQREYKICBhdXRvVCA9IHNldFRpbWVvdXQoKCkgPT4gewogICAgY29uc3QgaWRzID0gb3JkZXJzLmZpbHRlcihvID0+IG8uc3RhdGUgPT09ICdyZWFkeScgJiYgby5vd24gIT09IGZhbHNlICYmIGlzRm9yVG9kYXkobykpLm1hcChvID0+IG8uaWQpOwogICAgaWYgKGlkcy5sZW5ndGggJiYgc3RvcmUuZ2V0KCdhdXRvJywgZmFsc2UpICYmIG1lLnVzZXIucm9sZSAhPT0gJ3NlbGxlcicpIGRvd25sb2FkQmF0Y2goaWRzLCB7IHNpbGVudDogdHJ1ZSB9KTsKICB9LCA0MDAwKTsKfQoKLy8gLS0tLS0tLS0tLSBWRU5ERURPUiAtLS0tLS0tLS0tCmFzeW5jIGZ1bmN0aW9uIHJlbmRlclNlbGxlcigpIHsKICBjb25zdCBpc0FkbWluID0gbWUudXNlci5yb2xlID09PSAnYWRtaW4nOwogIGxldCBzZWxsZXJQaWNrZXIgPSAnJzsKICBpZiAoaXNBZG1pbikgewogICAgY29uc3QgZCA9IGF3YWl0IGFwaSgnL2FwaS9hZG1pbi9zZWxsZXJzJyk7CiAgICBzZWxsZXJzID0gZC5zZWxsZXJzOwogICAgaWYgKCFzZWxsZXJzLmxlbmd0aCkgeyAkKCcjbWFpbicpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJzZWN0aW9uLXRpdGxlIj48aDI+VmVuZGVkb3JlczwvaDI+PC9kaXY+PGRpdiBjbGFzcz0icGFuZWwiPjxkaXYgY2xhc3M9ImVtcHR5Ij4ke0VNUFRZX1NWR308ZGl2PlByaW1lcm8gY3JlYSBsb3MgdmVuZGVkb3JlcyBlbiBsYSBwZXN0YcOxYSBVc3Vhcmlvcy48L2Rpdj48L2Rpdj48L2Rpdj5gOyByZXR1cm47IH0KICAgIGlmICghc2VsbGVycy5zb21lKHMgPT4gcy5pZCA9PT0gdWkuYWRtaW5TZWxsZXIpKSB1aS5hZG1pblNlbGxlciA9IHNlbGxlcnNbMF0uaWQ7CiAgICBzZWxsZXJQaWNrZXIgPSBgPHNlbGVjdCBpZD0iYWRtaW5TZWxsZXIiIHN0eWxlPSJ3aWR0aDphdXRvIj4ke3NlbGxlcnMubWFwKHMgPT4gYDxvcHRpb24gdmFsdWU9IiR7cy5pZH0iICR7cy5pZCA9PT0gdWkuYWRtaW5TZWxsZXIgPyAnc2VsZWN0ZWQnIDogJyd9PiR7ZXNjKHMubmFtZSl9PC9vcHRpb24+YCkuam9pbignJyl9PC9zZWxlY3Q+YDsKICB9CiAgJCgnI21haW4nKS5pbm5lckhUTUwgPSBgCiAgPGRpdiBjbGFzcz0ic2VjdGlvbi10aXRsZSI+PGgyPiR7aXNBZG1pbiA/ICdDdWVudGEgZGVsIHZlbmRlZG9yJyA6ICdNaXMgbWFya2V0cGxhY2VzJ308L2gyPiR7c2VsbGVyUGlja2VyfTxzcGFuIGNsYXNzPSJzcGFjZXIiIHN0eWxlPSJmbGV4OjEiPjwvc3Bhbj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWdob3N0IiBpZD0ic1N5bmMiPiR7SS5zeW5jfVNpbmNyb25pemFyIGFob3JhPC9idXR0b24+PC9kaXY+CiAgPGRpdiBjbGFzcz0iY29ubiIgaWQ9ImNvbm4iPjwvZGl2PgogIDxkaXYgY2xhc3M9ImdyaWQyIj4KICAgIDxkaXYgY2xhc3M9InBhbmVsIj4KICAgICAgPGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+PGgyPlByb2R1Y3RvcyBxdWUgTk8gdmFuIGFsIGZ1bGZpbGxtZW50PC9oMj48L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0icGFuZWwtYm9keSBzdGFjayI+CiAgICAgICAgPGRpdiBjbGFzcz0icnVsZSI+JHtSVUxFX1NWR308cD48Yj5CYXN0YSB1biBwcm9kdWN0byBkZSBlc3RhIGxpc3RhIHBhcmEgYmxvcXVlYXIgZWwgcGVkaWRvIGNvbXBsZXRvLjwvYj4gRWwgZnVsZmlsbG1lbnQgbG8gdmVyw6EgY29uIGNhbmRhZG8geSBubyBwb2Ryw6EgZGVzY2FyZ2FyIHN1IGV0aXF1ZXRhLiBVc2EgZWwgSUQgZGUgcHVibGljYWNpw7NuIChNTEPigKYsIElEIGRlIEZhbGFiZWxsYSwgU0tVIE1L4oCmIGRlIFBhcmlzKSBvIHR1IFNLVSBkZSB2ZW5kZWRvci48L3A+PC9kaXY+CiAgICAgICAgPGZvcm0gY2xhc3M9ImFkZHJvdyIgaWQ9ImFkZEZvcm0iPgogICAgICAgICAgPHRleHRhcmVhIGlkPSJhZGRWYWwiIHJvd3M9IjIiIHBsYWNlaG9sZGVyPSJVbm8gbyB2YXJpb3MsIHNlcGFyYWRvcyBwb3IgY29tYSBvIHNhbHRvIGRlIGzDrW5lYSYjMTA7RWo6IE1MQzE0ODc3NjU0MzIsIExFTi1QT0wtMDEiIGFyaWEtbGFiZWw9IklEcyBvIFNLVXMiPjwvdGV4dGFyZWE+CiAgICAgICAgICA8c2VsZWN0IGlkPSJhZGRNayIgYXJpYS1sYWJlbD0iTWFya2V0cGxhY2UiPjxvcHRpb24gdmFsdWU9ImFueSI+VG9kb3MgbG9zIGNhbmFsZXM8L29wdGlvbj48b3B0aW9uIHZhbHVlPSJtbCI+U29sbyBNZXJjYWRvIExpYnJlPC9vcHRpb24+PG9wdGlvbiB2YWx1ZT0iZmEiPlNvbG8gRmFsYWJlbGxhPC9vcHRpb24+PG9wdGlvbiB2YWx1ZT0icGEiPlNvbG8gUGFyaXM8L29wdGlvbj48L3NlbGVjdD4KICAgICAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgdHlwZT0ic3VibWl0Ij4ke0kubG9ja31CbG9xdWVhcjwvYnV0dG9uPgogICAgICAgIDwvZm9ybT4KICAgICAgICA8aW5wdXQgdHlwZT0ic2VhcmNoIiBpZD0iYmxRIiBwbGFjZWhvbGRlcj0iQnVzY2FyIGVuIGxhIGxpc3RhIiBhcmlhLWxhYmVsPSJCdXNjYXIgYmxvcXVlYWRvcyI+CiAgICAgICAgPGRpdiBjbGFzcz0idGFncyIgaWQ9InRhZ3MiPjwvZGl2PgogICAgICA8L2Rpdj4KICAgIDwvZGl2PgogICAgPGRpdiBjbGFzcz0icGFuZWwiPgogICAgICA8ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj48aDI+UGVkaWRvcyByZWNpZW50ZXM8L2gyPjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJ0YWJsZS13cmFwIj48dGFibGUgc3R5bGU9Im1pbi13aWR0aDo1MjBweCI+PHRoZWFkPjx0cj48dGg+UGVkaWRvPC90aD48dGg+Q2FuYWw8L3RoPjx0aD5Qcm9kdWN0b3M8L3RoPjx0aD5Fc3RhZG88L3RoPjwvdHI+PC90aGVhZD48dGJvZHkgaWQ9Im15Um93cyI+PC90Ym9keT48L3RhYmxlPjwvZGl2PgogICAgPC9kaXY+CiAgPC9kaXY+YDsKICBpZiAoaXNBZG1pbikgJCgnI2FkbWluU2VsbGVyJykub25jaGFuZ2UgPSBlID0+IHsgdWkuYWRtaW5TZWxsZXIgPSArZS50YXJnZXQudmFsdWU7IHN0b3JlLnNldCgnYWRtaW5TZWxsZXInLCB1aS5hZG1pblNlbGxlcik7IHJlbmRlclNlbGxlcigpOyB9OwogICQoJyNzU3luYycpLm9uY2xpY2sgPSBhc3luYyAoKSA9PiB7IGF3YWl0IGFwaSgnL2FwaS9zeW5jJyArIHNlbGxlclFTKCksIHsgbWV0aG9kOiAnUE9TVCcgfSk7IHRvYXN0KCdTaW5jcm9uaXphbmRv4oCmJyk7IH07CiAgJCgnI2FkZEZvcm0nKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4gewogICAgZS5wcmV2ZW50RGVmYXVsdCgpOwogICAgdHJ5IHsgY29uc3QgciA9IGF3YWl0IGFwaSgnL2FwaS9ibG9ja2xpc3QnICsgc2VsbGVyUVMoKSwgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyB2YWx1ZTogJCgnI2FkZFZhbCcpLnZhbHVlLCBtYXJrZXRwbGFjZTogJCgnI2FkZE1rJykudmFsdWUgfSB9KTsgJCgnI2FkZFZhbCcpLnZhbHVlID0gJyc7IHRvYXN0KGAke3IuYWRkZWR9IGJsb3F1ZWFkbyR7ci5hZGRlZCA9PT0gMSA/ICcnIDogJ3MnfWApOyBsb2FkQmxvY2tsaXN0KCk7IH0KICAgIGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UpOyB9CiAgfTsKICAkKCcjYmxRJykub25pbnB1dCA9ICgpID0+IGRyYXdUYWdzKCk7CiAgJCgnI3RhZ3MnKS5vbmNsaWNrID0gYXN5bmMgZSA9PiB7IGNvbnN0IGIgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1ybV0nKTsgaWYgKCFiKSByZXR1cm47IGF3YWl0IGFwaShgL2FwaS9ibG9ja2xpc3QvJHtiLmRhdGFzZXQucm19JHtzZWxsZXJRUygpfWAsIHsgbWV0aG9kOiAnREVMRVRFJyB9KTsgdG9hc3QoJ0Rlc2Jsb3F1ZWFkbzogc3VzIHBlZGlkb3MgcGFzYW4gYWwgZnVsZmlsbG1lbnQnKTsgbG9hZEJsb2NrbGlzdCgpOyB9OwogICQoJyNteVJvd3MnKS5vbmNsaWNrID0gYXN5bmMgZSA9PiB7CiAgICBjb25zdCBiID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtdW5ibG9ja10nKTsgaWYgKCFiKSByZXR1cm47CiAgICBpZiAoIWNvbmZpcm0oJ8K/RGVzYmxvcXVlYXIgZXN0YSBldGlxdWV0YT8gUGFzYSBhICJQb3IgaW1wcmltaXIiLiBFbiBsYSBob2phIGRlbCBwZWRpZG8gc2FsZHLDoSBzdSBuw7ptZXJvIHkgcXVlZGFyw6FuIG1hcmNhZG9zIGNvbiAiRkFMVEEiIGxvcyBwcm9kdWN0b3MgcXVlIHNlIHJlbGxlbmFuIGFwYXJ0ZS4nKSkgcmV0dXJuOwogICAgYi5kaXNhYmxlZCA9IHRydWU7IHRyeSB7IGF3YWl0IGFwaShgL2FwaS9vcmRlcnMvJHtiLmRhdGFzZXQudW5ibG9ja30vdW5ibG9ja2AsIHsgbWV0aG9kOiAnUE9TVCcgfSk7IHRvYXN0KCdFdGlxdWV0YSBkZXNibG9xdWVhZGEnKTsgbG9hZFNlbGxlck9yZGVycygpOyB9IGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UpOyBiLmRpc2FibGVkID0gZmFsc2U7IH0KICB9OwogIGxvYWRDb25uZWN0aW9ucygpOyBsb2FkQmxvY2tsaXN0KCk7IGxvYWRTZWxsZXJPcmRlcnMoKTsKICBpZiAobmV3IFVSTFNlYXJjaFBhcmFtcyhsb2NhdGlvbi5zZWFyY2gpLmdldCgnY29uZWN0YWRvJykgPT09ICdtbCcpIHsgdG9hc3QoJ01lcmNhZG8gTGlicmUgY29uZWN0YWRvJyk7IGhpc3RvcnkucmVwbGFjZVN0YXRlKG51bGwsICcnLCAnLycpOyB9Cn0KCmFzeW5jIGZ1bmN0aW9uIGxvYWRDb25uZWN0aW9ucygpIHsKICBjb25zdCB7IGNvbm5lY3Rpb25zIH0gPSBhd2FpdCBhcGkoJy9hcGkvY29ubmVjdGlvbnMnICsgc2VsbGVyUVMoKSk7CiAgY29uc3QgYnkgPSBPYmplY3QuZnJvbUVudHJpZXMoY29ubmVjdGlvbnMubWFwKGMgPT4gW2MubWFya2V0cGxhY2UsIGNdKSk7CiAgY29uc3Qgc3QgPSBjID0+ICFjID8gJzxkaXYgY2xhc3M9InN0YXRlIG9mZiI+PGk+PC9pPlNpbiBjb25lY3RhcjwvZGl2PicgOiBjLmxhc3RfZXJyb3IgPyBgPGRpdiBjbGFzcz0ic3RhdGUgZXJyIj48aT48L2k+RXJyb3I6ICR7ZXNjKGMubGFzdF9lcnJvci5zbGljZSgwLCAxMjApKX08L2Rpdj5gIDogYDxkaXYgY2xhc3M9InN0YXRlIG9uIj48aT48L2k+Q29uZWN0YWRvJHtjLmFjY291bnRfbGFiZWwgPyAnIMK3ICcgKyBlc2MoYy5hY2NvdW50X2xhYmVsKSA6ICcnfSR7Yy5sYXN0X3N5bmNfYXQgPyAnIMK3IHJldmlzYWRvICcgKyBlc2MoZm10VGltZShjLmxhc3Rfc3luY19hdCkpIDogJyd9PC9kaXY+YDsKICBjb25zdCBkaXNjID0gYyA9PiBjID8gYDxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtZGVsPSIke2MuaWR9Ij5EZXNjb25lY3RhcjwvYnV0dG9uPmAgOiAnJzsKICBjb25zdCBtbCA9IGJ5Lm1sLCBmYSA9IGJ5LmZhLCBwYSA9IGJ5LnBhOwogICQoJyNjb25uJykuaW5uZXJIVE1MID0gYAogIDxkaXYgY2xhc3M9Im1jYXJkIj48ZGl2IGNsYXNzPSJsb2dvIiBzdHlsZT0iYmFja2dyb3VuZDp2YXIoLS1tbCk7Y29sb3I6dmFyKC0tbWwtaW5rKSI+TWVyY2FkbyBMaWJyZTwvZGl2PiR7c3QobWwpfQogICAgPHAgY2xhc3M9ImhvdyI+VGUgbGxldmEgYSBNZXJjYWRvIExpYnJlIHBhcmEgYXV0b3JpemFyLiBObyBjb21wYXJ0ZXMgdHUgY29udHJhc2XDsWEuIExhcyBldGlxdWV0YXMgbGxlZ2FuIGFwZW5hcyBsYSB2ZW50YSBxdWVkYSBsaXN0YSBwYXJhIGltcHJpbWlyLjwvcD4KICAgICR7bWUubWxDb25maWd1cmVkID8gYDxhIGNsYXNzPSJidG4gJHttbCA/ICdidG4tZ2hvc3QnIDogJ2J0bi1wcmltYXJ5J30iIGhyZWY9Ii9hdXRoL21sL3N0YXJ0JHtzZWxsZXJRUygpfSI+JHttbCA/ICdWb2x2ZXIgYSBhdXRvcml6YXInIDogJ0NvbmVjdGFyIGNvbiBNZXJjYWRvIExpYnJlJ308L2E+YCA6ICc8cCBjbGFzcz0iaG93IiBzdHlsZT0iY29sb3I6dmFyKC0td2FybikiPkVsIGFkbWluaXN0cmFkb3IgZGViZSBjb25maWd1cmFyIGxhIGFwcCBkZSBNZXJjYWRvIExpYnJlIGVuIGVsIHNlcnZpZG9yLjwvcD4nfSR7ZGlzYyhtbCl9PC9kaXY+CiAgPGRpdiBjbGFzcz0ibWNhcmQiPjxkaXYgY2xhc3M9ImxvZ28iIHN0eWxlPSJiYWNrZ3JvdW5kOnZhcigtLWZhKTtjb2xvcjp2YXIoLS1mYS1pbmspIj5GYWxhYmVsbGE8L2Rpdj4ke3N0KGZhKX0KICAgIDxmb3JtIGlkPSJmYUZvcm0iIGNsYXNzPSJzdGFjayI+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+VXN1YXJpbyBBUEkgKGNvcnJlbyBkZWwgU2VsbGVyIENlbnRlcik8aW5wdXQgdHlwZT0iZW1haWwiIGlkPSJmYVVzZXIiIHZhbHVlPSIke2VzYyhmYT8uYWNjb3VudF9sYWJlbCB8fCAnJyl9IiByZXF1aXJlZD48L2xhYmVsPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPkFQSSBLZXk8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJmYUtleSIgcGxhY2Vob2xkZXI9IiR7ZmEgPyAn4oCi4oCi4oCi4oCi4oCi4oCiIChndWFyZGFkYSknIDogJ1NlbGxlciBDZW50ZXIg4oC6IE1pIGN1ZW50YSDigLogSW50ZWdyYWNpb25lcyd9IiAke2ZhID8gJycgOiAncmVxdWlyZWQnfT48L2xhYmVsPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPlNlbGxlciBJRDxpbnB1dCB0eXBlPSJ0ZXh0IiBpZD0iZmFTaWQiIHBsYWNlaG9sZGVyPSJDw7NkaWdvIGRlIHRpZW5kYSwgZWouIFNDMTIzNCI+PC9sYWJlbD4KICAgICAgPGxhYmVsIGNsYXNzPSJzd2l0Y2giPjxpbnB1dCB0eXBlPSJjaGVja2JveCIgaWQ9ImZhQXV0byIgJHtmYT8uc2V0dGluZ3M/LmF1dG9SZWFkeSA/ICdjaGVja2VkJyA6ICcnfT4gTWFyY2FyICJsaXN0byBwYXJhIGRlc3BhY2hvIiBhdXRvbcOhdGljbzwvbGFiZWw+CiAgICAgIDxwIGNsYXNzPSJob3ciPkZhbGFiZWxsYSBnZW5lcmEgbGEgZXRpcXVldGEgc29sbyBjdWFuZG8gZWwgcGVkaWRvIGVzdMOhIGxpc3RvIHBhcmEgZGVzcGFjaG8uIENvbiBlc3RhIG9wY2nDs24sIGxhIGFwcCBsbyBtYXJjYSBzb2xhIGFwZW5hcyBsbGVnYS48L3A+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biAke2ZhID8gJ2J0bi1naG9zdCcgOiAnYnRuLXByaW1hcnknfSIgdHlwZT0ic3VibWl0Ij4ke2ZhID8gJ0FjdHVhbGl6YXInIDogJ0NvbmVjdGFyIEZhbGFiZWxsYSd9PC9idXR0b24+CiAgICA8L2Zvcm0+CiAgICAke2ZhPy53ZWJob29rX3VybCA/IGA8bGFiZWwgY2xhc3M9ImYiPkF2aXNvIGluc3RhbnTDoW5lbyAod2ViaG9vaywgb3BjaW9uYWwpPHNwYW4gY2xhc3M9ImNvcHkiPjxpbnB1dCB0eXBlPSJ0ZXh0IiByZWFkb25seSB2YWx1ZT0iJHtlc2MoZmEud2ViaG9va191cmwpfSI+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1jb3B5PSIke2VzYyhmYS53ZWJob29rX3VybCl9Ij5Db3BpYXI8L2J1dHRvbj48L3NwYW4+PC9sYWJlbD5gIDogJyd9CiAgICAke2Rpc2MoZmEpfTwvZGl2PgogIDxkaXYgY2xhc3M9Im1jYXJkIj48ZGl2IGNsYXNzPSJsb2dvIiBzdHlsZT0iYmFja2dyb3VuZDp2YXIoLS1wYSk7Y29sb3I6I2ZmZiI+UGFyaXM8L2Rpdj4ke3N0KHBhKX0KICAgIDxmb3JtIGlkPSJwYUZvcm0iIGNsYXNzPSJzdGFjayI+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+QVBJIEtleTxpbnB1dCB0eXBlPSJwYXNzd29yZCIgaWQ9InBhS2V5IiBwbGFjZWhvbGRlcj0iJHtwYSA/ICfigKLigKLigKLigKLigKLigKIgKGd1YXJkYWRhKScgOiAnU2VsbGVyIENlbnRlciBQYXJpcyDigLogTWkgY3VlbnRhIOKAuiBJbnRlZ3JhY2lvbmVzJ30iIHJlcXVpcmVkPjwvbGFiZWw+CiAgICAgIDxwIGNsYXNzPSJob3ciPlBhcmlzIGVudHJlZ2EgbGEgQVBJIEtleSBlbiBNaSBjdWVudGEg4oC6IEludGVncmFjaW9uZXMuIFNpIG5vIGFwYXJlY2UsIHNlIHBpZGUgcG9yIHRpY2tldCBhIFBhcmlzLjwvcD4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuICR7cGEgPyAnYnRuLWdob3N0JyA6ICdidG4tcHJpbWFyeSd9IiB0eXBlPSJzdWJtaXQiPiR7cGEgPyAnQWN0dWFsaXphcicgOiAnQ29uZWN0YXIgUGFyaXMnfTwvYnV0dG9uPgogICAgPC9mb3JtPiR7ZGlzYyhwYSl9PC9kaXY+YDsKICAkKCcjZmFGb3JtJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgIGUucHJldmVudERlZmF1bHQoKTsKICAgIGlmIChmYSAmJiAhJCgnI2ZhS2V5JykudmFsdWUpIHsgYXdhaXQgYXBpKGAvYXBpL2Nvbm5lY3Rpb25zLyR7ZmEuaWR9L3NldHRpbmdzJHtzZWxsZXJRUygpfWAsIHsgbWV0aG9kOiAnUEFUQ0gnLCBib2R5OiB7IGF1dG9SZWFkeTogJCgnI2ZhQXV0bycpLmNoZWNrZWQgfSB9KTsgdG9hc3QoJ0d1YXJkYWRvJyk7IHJldHVybiBsb2FkQ29ubmVjdGlvbnMoKTsgfQogICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL2Nvbm5lY3Rpb25zL2ZhJyArIHNlbGxlclFTKCksIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgdXNlcklkOiAkKCcjZmFVc2VyJykudmFsdWUsIGFwaUtleTogJCgnI2ZhS2V5JykudmFsdWUsIHNlbGxlcklkOiAkKCcjZmFTaWQnKS52YWx1ZSwgYXV0b1JlYWR5OiAkKCcjZmFBdXRvJykuY2hlY2tlZCB9IH0pOyB0b2FzdCgnRmFsYWJlbGxhIGNvbmVjdGFkbycpOyBsb2FkQ29ubmVjdGlvbnMoKTsgfQogICAgY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSwgNTAwMCk7IH0KICB9OwogICQoJyNwYUZvcm0nKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4gewogICAgZS5wcmV2ZW50RGVmYXVsdCgpOwogICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL2Nvbm5lY3Rpb25zL3BhJyArIHNlbGxlclFTKCksIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgYXBpS2V5OiAkKCcjcGFLZXknKS52YWx1ZSB9IH0pOyB0b2FzdCgnUGFyaXMgY29uZWN0YWRvJyk7IGxvYWRDb25uZWN0aW9ucygpOyB9CiAgICBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlLCA1MDAwKTsgfQogIH07CiAgJCgnI2Nvbm4nKS5vbmNsaWNrID0gYXN5bmMgZSA9PiB7CiAgICBjb25zdCBkID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtZGVsXScpOwogICAgaWYgKGQpIHsgZC5kaXNhYmxlZCA9IHRydWU7IGF3YWl0IGFwaShgL2FwaS9jb25uZWN0aW9ucy8ke2QuZGF0YXNldC5kZWx9JHtzZWxsZXJRUygpfWAsIHsgbWV0aG9kOiAnREVMRVRFJyB9KTsgdG9hc3QoJ0Rlc2NvbmVjdGFkbycpOyBsb2FkQ29ubmVjdGlvbnMoKTsgfQogICAgY29uc3QgYyA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLWNvcHldJyk7CiAgICBpZiAoYykgeyBlLnByZXZlbnREZWZhdWx0KCk7IHRyeSB7IGF3YWl0IG5hdmlnYXRvci5jbGlwYm9hcmQud3JpdGVUZXh0KGMuZGF0YXNldC5jb3B5KTsgdG9hc3QoJ0NvcGlhZG8nKTsgfSBjYXRjaCB7IGMucHJldmlvdXNFbGVtZW50U2libGluZy5zZWxlY3QoKTsgfSB9CiAgfTsKfQoKbGV0IGJsSXRlbXMgPSBbXTsKYXN5bmMgZnVuY3Rpb24gbG9hZEJsb2NrbGlzdCgpIHsgYmxJdGVtcyA9IChhd2FpdCBhcGkoJy9hcGkvYmxvY2tsaXN0JyArIHNlbGxlclFTKCkpKS5pdGVtczsgZHJhd1RhZ3MoKTsgfQpmdW5jdGlvbiBkcmF3VGFncygpIHsKICBjb25zdCBxID0gKCQoJyNibFEnKT8udmFsdWUgfHwgJycpLnRvTG93ZXJDYXNlKCk7CiAgY29uc3QgbGlzdCA9IGJsSXRlbXMuZmlsdGVyKGIgPT4gIXEgfHwgYi52YWx1ZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHEpKTsKICAkKCcjdGFncycpLmlubmVySFRNTCA9IGxpc3QubGVuZ3RoID8gbGlzdC5tYXAoYiA9PiBgPHNwYW4gY2xhc3M9InRhZyI+JHtlc2MoYi52YWx1ZSl9IDxzbWFsbD7CtyAke2IubWFya2V0cGxhY2UgPT09ICdhbnknID8gJ3RvZG9zJyA6IE1LW2IubWFya2V0cGxhY2VdfTwvc21hbGw+PGJ1dHRvbiBkYXRhLXJtPSIke2IuaWR9IiBhcmlhLWxhYmVsPSJRdWl0YXIgJHtlc2MoYi52YWx1ZSl9Ij4ke0kueH08L2J1dHRvbj48L3NwYW4+YCkuam9pbignJykKICAgIDogYDxzcGFuIGNsYXNzPSJtdXRlZCIgc3R5bGU9ImZvbnQtc2l6ZToxMy41cHgiPiR7YmxJdGVtcy5sZW5ndGggPyAnU2luIHJlc3VsdGFkb3MuJyA6ICdTaW4gcHJvZHVjdG9zIGJsb3F1ZWFkb3M6IHRvZG8gdmEgYWwgZnVsZmlsbG1lbnQuJ308L3NwYW4+YDsKfQphc3luYyBmdW5jdGlvbiBsb2FkU2VsbGVyT3JkZXJzKCkgewogIGlmICh0YWIgIT09ICdzZWxsZXInIHx8ICEkKCcjbXlSb3dzJykpIHJldHVybjsKICBsZXQgbGlzdDsKICBpZiAobWUudXNlci5yb2xlID09PSAnc2VsbGVyJykgbGlzdCA9IChhd2FpdCBhcGkoJy9hcGkvb3JkZXJzP3ZpZXc9YWxsJykpLm9yZGVycy5maWx0ZXIobyA9PiBvLnNlbGxlcl9pZCA9PT0gbWUuc2VsbGVyPy5pZCk7CiAgZWxzZSBsaXN0ID0gKGF3YWl0IGFwaSgnL2FwaS9vcmRlcnM/dmlldz1hbGwnKSkub3JkZXJzLmZpbHRlcihvID0+IG8uc2VsbGVyX2lkID09PSB1aS5hZG1pblNlbGxlcik7CiAgJCgnI215Um93cycpLmlubmVySFRNTCA9IGxpc3QubGVuZ3RoID8gbGlzdC5zbGljZSgwLCA2MCkubWFwKG8gPT4gYDx0cj48dGQgY2xhc3M9Im1vbm8iPiR7ZXNjKG8ub3JkZXJfbnVtYmVyKX08c3BhbiBjbGFzcz0ibm90ZSI+JHtlc2MoZm10VGltZShvLnNvbGRfYXQgfHwgby5jcmVhdGVkX2F0KSl9JHtvLmN1c3RvbWVyID8gJyDCtyAnICsgZXNjKG8uY3VzdG9tZXIpIDogJyd9PC9zcGFuPjwvdGQ+PHRkPjxzcGFuIGNsYXNzPSJtayAke28ubWFya2V0cGxhY2V9Ij4ke01LW28ubWFya2V0cGxhY2VdIHx8ICcnfTwvc3Bhbj48L3RkPjx0ZD4ke2l0ZW1zSFRNTChvKX08L3RkPjx0ZD4ke28uYmxvY2tfbm8gPyBgPHNwYW4gY2xhc3M9ImJsb2Nrbm8iPk7CsCAke28uYmxvY2tfbm99PC9zcGFuPmAgOiAnJ30ke3BpbGwobyl9JHtvLnN0YXRlID09PSAnYmxvY2tlZCcgJiYgby5vd24gIT09IGZhbHNlID8gYDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSBidG4tc20iIHN0eWxlPSJtYXJnaW4tdG9wOjZweCIgZGF0YS11bmJsb2NrPSIke28uaWR9Ij5EZXNibG9xdWVhciBldGlxdWV0YTwvYnV0dG9uPmAgOiAnJ30ke1sncHJpbnRlZCcsICdzaGlwcGVkJ10uaW5jbHVkZXMoby5zdGF0ZSkgJiYgby5wcmludGVkX2J5ID8gYDxzcGFuIGNsYXNzPSJub3RlIj5JbXByaW1pw7M6ICR7ZXNjKG8ucHJpbnRlZF9ieSl9PC9zcGFuPmAgOiAnJ30ke28uc3RhdGUgPT09ICdlcnJvcicgfHwgby5zdGF0ZSA9PT0gJ3dhaXRpbmcnID8gYDxzcGFuIGNsYXNzPSJub3RlICR7by5zdGF0ZSA9PT0gJ2Vycm9yJyA/ICdiYWQnIDogJyd9Ij4ke2VzYyhvLmVycm9yIHx8ICcnKX08L3NwYW4+YCA6ICcnfTwvdGQ+PC90cj5gKS5qb2luKCcnKQogICAgOiBgPHRyPjx0ZCBjb2xzcGFuPSI0Ij48ZGl2IGNsYXNzPSJlbXB0eSI+QcO6biBubyBoYXkgcGVkaWRvcy4gQ29uZWN0YSB0dXMgbWFya2V0cGxhY2VzIHkgYXBhcmVjZXLDoW4gYXF1w60uPC9kaXY+PC90ZD48L3RyPmA7Cn0KCi8vIC0tLS0tLS0tLS0gQURNSU4gLS0tLS0tLS0tLQphc3luYyBmdW5jdGlvbiByZW5kZXJBZG1pbigpIHsKICBjb25zdCBbZCwgc3RdID0gYXdhaXQgUHJvbWlzZS5hbGwoW2FwaSgnL2FwaS9hZG1pbi9zZWxsZXJzJyksIGFwaSgnL2FwaS9hZG1pbi9zZXR0aW5ncycpXSk7CiAgY29uc3Qgc05hbWUgPSBpZCA9PiBkLnNlbGxlcnMuZmluZChzID0+IHMuaWQgPT09IGlkKT8ubmFtZSB8fCAnJzsKICBjb25zdCByb2xlTmFtZSA9IHsgYWRtaW46ICdBZG1pbmlzdHJhZG9yJywgZnVsZmlsbG1lbnQ6ICdGdWxmaWxsbWVudCcsIHNlbGxlcjogJ1ZlbmRlZG9yJyB9OwogICQoJyNtYWluJykuaW5uZXJIVE1MID0gYAogIDxkaXYgY2xhc3M9ImdyaWQyIj4KICAgIDxkaXYgY2xhc3M9InBhbmVsIj48ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj48aDI+VmVuZGVkb3JlczwvaDI+PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9InBhbmVsLWJvZHkgc3RhY2siPgogICAgICAgIDxmb3JtIGNsYXNzPSJyb3ciIGlkPSJuZXdTZWxsZXIiPjxsYWJlbCBjbGFzcz0iZiI+Tm9tYnJlIGRlIGxhIHRpZW5kYTxpbnB1dCB0eXBlPSJ0ZXh0IiBpZD0ibnNOYW1lIiByZXF1aXJlZD48L2xhYmVsPjxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgdHlwZT0ic3VibWl0IiBzdHlsZT0iZmxleDowIj5BZ3JlZ2FyPC9idXR0b24+PC9mb3JtPgogICAgICAgIDxkaXYgY2xhc3M9InRhYmxlLXdyYXAiPjx0YWJsZSBzdHlsZT0ibWluLXdpZHRoOjQyMHB4Ij48dGhlYWQ+PHRyPjx0aD5WZW5kZWRvcjwvdGg+PHRoPk1hcmtldHBsYWNlczwvdGg+PHRoPkJsb3F1ZWFkb3M8L3RoPjx0aD48L3RoPjwvdHI+PC90aGVhZD48dGJvZHk+CiAgICAgICAgJHtkLnNlbGxlcnMubWFwKHMgPT4gYDx0cj48dGQ+PGI+JHtlc2Mocy5uYW1lKX08L2I+PC90ZD48dGQ+JHtzLmNvbm5lY3Rpb25zLmZpbHRlcihjID0+IE1LW2MubWFya2V0cGxhY2VdKS5tYXAoYyA9PiBgPHNwYW4gY2xhc3M9Im1rICR7Yy5tYXJrZXRwbGFjZX0iIHRpdGxlPSIke2VzYyhjLmxhc3RfZXJyb3IgfHwgJ09LJyl9Ij4ke01LW2MubWFya2V0cGxhY2VdfSR7Yy5sYXN0X2Vycm9yID8gJyDimqAnIDogJyd9PC9zcGFuPmApLmpvaW4oJyAnKSB8fCAnPHNwYW4gY2xhc3M9Im11dGVkIj7igJQ8L3NwYW4+J308L3RkPjx0ZD4ke3MuYmxvY2tlZH08L3RkPjx0ZD48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWRhbmdlciBidG4tc20iIGRhdGEtZGVscz0iJHtzLmlkfSI+RWxpbWluYXI8L2J1dHRvbj48L3RkPjwvdHI+YCkuam9pbignJykgfHwgJzx0cj48dGQgY29sc3Bhbj0iNCIgY2xhc3M9Im11dGVkIj5TaW4gdmVuZGVkb3JlczwvdGQ+PC90cj4nfQogICAgICAgIDwvdGJvZHk+PC90YWJsZT48L2Rpdj4KICAgICAgPC9kaXY+PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbCI+PGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+PGgyPlVzdWFyaW9zPC9oMj48L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0icGFuZWwtYm9keSBzdGFjayI+CiAgICAgICAgPGZvcm0gY2xhc3M9InN0YWNrIiBpZD0ibmV3VXNlciI+CiAgICAgICAgICA8ZGl2IGNsYXNzPSJyb3ciPjxsYWJlbCBjbGFzcz0iZiI+Tm9tYnJlPGlucHV0IHR5cGU9InRleHQiIGlkPSJudU5hbWUiIHJlcXVpcmVkPjwvbGFiZWw+PGxhYmVsIGNsYXNzPSJmIj5Db3JyZW88aW5wdXQgdHlwZT0iZW1haWwiIGlkPSJudUVtYWlsIiByZXF1aXJlZD48L2xhYmVsPjwvZGl2PgogICAgICAgICAgPGRpdiBjbGFzcz0icm93Ij48bGFiZWwgY2xhc3M9ImYiPlJvbDxzZWxlY3QgaWQ9Im51Um9sZSI+PG9wdGlvbiB2YWx1ZT0ic2VsbGVyIj5WZW5kZWRvcjwvb3B0aW9uPjxvcHRpb24gdmFsdWU9ImZ1bGZpbGxtZW50Ij5GdWxmaWxsbWVudDwvb3B0aW9uPjxvcHRpb24gdmFsdWU9ImFkbWluIj5BZG1pbmlzdHJhZG9yPC9vcHRpb24+PC9zZWxlY3Q+PC9sYWJlbD4KICAgICAgICAgIDxsYWJlbCBjbGFzcz0iZiIgaWQ9Im51U2VsbGVyV3JhcCI+VGllbmRhPHNlbGVjdCBpZD0ibnVTZWxsZXIiPiR7ZC5zZWxsZXJzLm1hcChzID0+IGA8b3B0aW9uIHZhbHVlPSIke3MuaWR9Ij4ke2VzYyhzLm5hbWUpfTwvb3B0aW9uPmApLmpvaW4oJycpfTwvc2VsZWN0PjwvbGFiZWw+PC9kaXY+CiAgICAgICAgICA8ZGl2IGNsYXNzPSJyb3ciPjxsYWJlbCBjbGFzcz0iZiI+Q29udHJhc2XDsWEgaW5pY2lhbCAobcOtbi4gOCk8aW5wdXQgdHlwZT0idGV4dCIgaWQ9Im51UGFzcyIgbWlubGVuZ3RoPSI4IiByZXF1aXJlZD48L2xhYmVsPjxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgdHlwZT0ic3VibWl0IiBzdHlsZT0iZmxleDowIj5DcmVhciB1c3VhcmlvPC9idXR0b24+PC9kaXY+CiAgICAgICAgPC9mb3JtPgogICAgICAgIDxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9Im1hcmdpbjowO2ZvbnQtc2l6ZToxM3B4Ij48Yj5DbGF2ZSB0ZW1wb3JhbDo8L2I+IGNyZWEgdW5hIGNsYXZlIG51ZXZhIHF1ZSBsZSBkaWN0YXMgYWwgdmVuZGVkb3I7IGFsIGVudHJhciBkZWJlIGNhbWJpYXJsYS4gPGI+Q2xhdmUgZGUgcmVzcGFsZG86PC9iPiB1biBjw7NkaWdvIGRlIHVuIHNvbG8gdXNvIHF1ZSBlbCB2ZW5kZWRvciBndWFyZGEgcG9yIHNpIG9sdmlkYSBzdSBjbGF2ZS4gPGI+RW50cmFyIGNvbW86PC9iPiBhYnJlcyBzdSBjdWVudGEgc2luIHNhYmVyIHN1IGNsYXZlLCBwYXJhIGF5dWRhcmxvLjwvcD4KICAgICAgICA8ZGl2IGNsYXNzPSJ0YWJsZS13cmFwIj48dGFibGUgc3R5bGU9Im1pbi13aWR0aDo3NjBweCI+PHRoZWFkPjx0cj48dGg+VXN1YXJpbzwvdGg+PHRoPlJvbDwvdGg+PHRoPkFjY2VzbzwvdGg+PHRoPjwvdGg+PC90cj48L3RoZWFkPjx0Ym9keT4KICAgICAgICAke2QudXNlcnMubWFwKHUgPT4gYDx0cj48dGQ+PGI+JHtlc2ModS5uYW1lKX08L2I+PHNwYW4gY2xhc3M9Im5vdGUiPiR7ZXNjKHUuZW1haWwpfTwvc3Bhbj48L3RkPjx0ZD4ke3JvbGVOYW1lW3Uucm9sZV19JHt1LnNlbGxlcl9pZCA/ICcgwrcgJyArIGVzYyhzTmFtZSh1LnNlbGxlcl9pZCkpIDogJyd9PC90ZD48dGQ+JHt1Lmhhc19iYWNrdXAgPyAnPHNwYW4gY2xhc3M9InBpbGwgcmVhZHkiIHN0eWxlPSJtYXJnaW4tdG9wOjRweCI+UmVzcGFsZG8gbGlzdG88L3NwYW4+JyA6ICcnfSR7dS5tdXN0X2NoYW5nZSA/ICcgPHNwYW4gY2xhc3M9InBpbGwgd2FpdGluZyIgc3R5bGU9Im1hcmdpbi10b3A6NHB4Ij5EZWJlIGNyZWFyIGNsYXZlIG51ZXZhPC9zcGFuPicgOiAnJ308L3RkPjx0ZD48ZGl2IGNsYXNzPSJyb3ctYWN0aW9ucyI+CiAgICAgICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWdob3N0IGJ0bi1zbSIgZGF0YS1hY3Q9InRlbXAtcGFzc3dvcmQiIGRhdGEtaWQ9IiR7dS5pZH0iIGRhdGEtbmFtZT0iJHtlc2ModS5uYW1lKX0iPkNsYXZlIHRlbXBvcmFsPC9idXR0b24+CiAgICAgICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWFjdD0iYmFja3VwLWNvZGUiIGRhdGEtaWQ9IiR7dS5pZH0iIGRhdGEtbmFtZT0iJHtlc2ModS5uYW1lKX0iPkNsYXZlIGRlIHJlc3BhbGRvPC9idXR0b24+CiAgICAgICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWFjdD0ic2VuZC1jb2RlIiBkYXRhLWlkPSIke3UuaWR9IiBkYXRhLW5hbWU9IiR7ZXNjKHUubmFtZSl9Ij5FbnZpYXIgY8OzZGlnbzwvYnV0dG9uPgogICAgICAgICAgJHt1LmlkID09PSBtZS51c2VyLmlkID8gJycgOiBgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1hY3Q9ImltcGVyc29uYXRlIiBkYXRhLWlkPSIke3UuaWR9IiBkYXRhLW5hbWU9IiR7ZXNjKHUubmFtZSl9Ij5FbnRyYXIgY29tbzwvYnV0dG9uPjxidXR0b24gY2xhc3M9ImJ0biBidG4tZGFuZ2VyIGJ0bi1zbSIgZGF0YS1kZWx1PSIke3UuaWR9Ij5FbGltaW5hcjwvYnV0dG9uPmB9PC9kaXY+PC90ZD48L3RyPmApLmpvaW4oJycpfQogICAgICAgIDwvdGJvZHk+PC90YWJsZT48L2Rpdj4KICAgICAgPC9kaXY+PC9kaXY+CiAgPC9kaXY+CiAgPGRpdiBjbGFzcz0icGFuZWwiIHN0eWxlPSJtYXJnaW4tdG9wOjIwcHgiPjxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj5FbmxhY2VzIMO6dGlsZXM8L2gyPjwvZGl2PgogICAgPGRpdiBjbGFzcz0icGFuZWwtYm9keSI+PHVsIHN0eWxlPSJsaXN0LXN0eWxlOm5vbmU7bWFyZ2luOjA7cGFkZGluZzowIj48bGkgc3R5bGU9ImRpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjJweDtwYWRkaW5nOjEwcHggMDtib3JkZXItdG9wOjFweCBzb2xpZCB2YXIoLS1saW5lKSI+PGEgaHJlZj0iaHR0cHM6Ly9ldGlxdWV0YWh1Yi1qYXZpLm9ucmVuZGVyLmNvbSIgdGFyZ2V0PSJfYmxhbmsiIHJlbD0ibm9vcGVuZXIiIHN0eWxlPSJmb250LXdlaWdodDo3MDAiPlR1IGFwcCBFdGlxdWV0YUh1YjwvYT48c3BhbiBjbGFzcz0ibW9ubyBtdXRlZCIgc3R5bGU9ImZvbnQtc2l6ZToxMnB4Ij5odHRwczovL2V0aXF1ZXRhaHViLWphdmkub25yZW5kZXIuY29tPC9zcGFuPjxzcGFuIGNsYXNzPSJtdXRlZCIgc3R5bGU9ImZvbnQtc2l6ZToxM3B4Ij5Fc3RhIG1pc21hIGFwcC4gQ29tcMOhcnRlbGEgY29uIGxvcyB2ZW5kZWRvcmVzIHkgZWwgZnVsZmlsbG1lbnQuPC9zcGFuPjwvbGk+PGxpIHN0eWxlPSJkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDoycHg7cGFkZGluZzoxMHB4IDA7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tbGluZSkiPjxhIGhyZWY9Imh0dHBzOi8vZGV2ZWxvcGVycy5tZXJjYWRvbGlicmUuY2wvZGV2Y2VudGVyIiB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciIgc3R5bGU9ImZvbnQtd2VpZ2h0OjcwMCI+TWVyY2FkbyBMaWJyZSBEZXZlbG9wZXJzPC9hPjxzcGFuIGNsYXNzPSJtb25vIG11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEycHgiPmh0dHBzOi8vZGV2ZWxvcGVycy5tZXJjYWRvbGlicmUuY2wvZGV2Y2VudGVyPC9zcGFuPjxzcGFuIGNsYXNzPSJtdXRlZCIgc3R5bGU9ImZvbnQtc2l6ZToxM3B4Ij5Eb25kZSBlc3TDoSBsYSBhcGxpY2FjacOzbiBFdGlxdWV0YUh1YiB5IHN1IFNlY3JldCBLZXkuIEVudHJhcyBjb24gdHUgY3VlbnRhIG5vcm1hbCBkZSBNZXJjYWRvIExpYnJlLjwvc3Bhbj48L2xpPjxsaSBzdHlsZT0iZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MnB4O3BhZGRpbmc6MTBweCAwO2JvcmRlci10b3A6MXB4IHNvbGlkIHZhcigtLWxpbmUpIj48YSBocmVmPSJodHRwczovL2Rhc2hib2FyZC5yZW5kZXIuY29tIiB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciIgc3R5bGU9ImZvbnQtd2VpZ2h0OjcwMCI+UmVuZGVyPC9hPjxzcGFuIGNsYXNzPSJtb25vIG11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEycHgiPmh0dHBzOi8vZGFzaGJvYXJkLnJlbmRlci5jb208L3NwYW4+PHNwYW4gY2xhc3M9Im11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEzcHgiPkRvbmRlIHZpdmUgbGEgYXBwLiBBcXXDrSBzZSBwdWJsaWNhIGNhZGEgdmVyc2nDs24gbnVldmEgKE1hbnVhbCBEZXBsb3kpLjwvc3Bhbj48L2xpPjxsaSBzdHlsZT0iZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MnB4O3BhZGRpbmc6MTBweCAwO2JvcmRlci10b3A6MXB4IHNvbGlkIHZhcigtLWxpbmUpIj48YSBocmVmPSJodHRwczovL2dpdGh1Yi5jb20vZWR1YXJkb2RpbmFyZGk5Ni1ib29wL2V0aXF1ZXRhaHViIiB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciIgc3R5bGU9ImZvbnQtd2VpZ2h0OjcwMCI+R2l0SHViPC9hPjxzcGFuIGNsYXNzPSJtb25vIG11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEycHgiPmh0dHBzOi8vZ2l0aHViLmNvbS9lZHVhcmRvZGluYXJkaTk2LWJvb3AvZXRpcXVldGFodWI8L3NwYW4+PHNwYW4gY2xhc3M9Im11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEzcHgiPkVsIGPDs2RpZ28gZGUgbGEgYXBwIHkgZWwgcmVzcGFsZG8gYXV0b23DoXRpY28gY2FkYSAxNSBtaW51dG9zLjwvc3Bhbj48L2xpPjxsaSBzdHlsZT0iZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MnB4O3BhZGRpbmc6MTBweCAwO2JvcmRlci10b3A6MXB4IHNvbGlkIHZhcigtLWxpbmUpIj48YSBocmVmPSJodHRwczovL2FwcC5icmV2by5jb20iIHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIiBzdHlsZT0iZm9udC13ZWlnaHQ6NzAwIj5CcmV2bzwvYT48c3BhbiBjbGFzcz0ibW9ubyBtdXRlZCIgc3R5bGU9ImZvbnQtc2l6ZToxMnB4Ij5odHRwczovL2FwcC5icmV2by5jb208L3NwYW4+PHNwYW4gY2xhc3M9Im11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEzcHgiPkVsIHNlcnZpY2lvIHF1ZSBlbnbDrWEgbG9zIGNvcnJlb3MgY29uIGPDs2RpZ29zIHBhcmEgcmVjdXBlcmFyIGNvbnRyYXNlw7FhLjwvc3Bhbj48L2xpPjwvdWw+PC9kaXY+PC9kaXY+CiAgPGRpdiBjbGFzcz0icGFuZWwiIHN0eWxlPSJtYXJnaW4tdG9wOjIwcHgiPjxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj5Db25leGnDs24gY29uIE1lcmNhZG8gTGlicmU8L2gyPiR7c3QubWxfY2xpZW50X2lkICYmIHN0Lm1sX3NlY3JldF9zZXQgPyAnPHNwYW4gY2xhc3M9InN0YXRlIG9uIj48aT48L2k+Q29uZmlndXJhZGE8L3NwYW4+JyA6ICc8c3BhbiBjbGFzcz0ic3RhdGUgZXJyIj48aT48L2k+RmFsdGEgY29uZmlndXJhcjwvc3Bhbj4nfTwvZGl2PgogICAgPGRpdiBjbGFzcz0icGFuZWwtYm9keSBzdGFjayI+CiAgICAgIDxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9Im1hcmdpbjowIj5DcmVhIHVuYSBhcGxpY2FjacOzbiBlbiA8YSBocmVmPSJodHRwczovL2RldmVsb3BlcnMubWVyY2Fkb2xpYnJlLmNsL2RldmNlbnRlciIgdGFyZ2V0PSJfYmxhbmsiIHJlbD0ibm9vcGVuZXIiPmRldmVsb3BlcnMubWVyY2Fkb2xpYnJlLmNsPC9hPiBjb24gZXN0b3MgZGF0b3MgeSBwZWdhIGFxdcOtIHN1IEFwcCBJRCB5IFNlY3JldCBLZXkuIFVuYSBzb2xhIGFwcCBzaXJ2ZSBwYXJhIHRvZG9zIGxvcyB2ZW5kZWRvcmVzLjwvcD4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5VUkkgZGUgcmVkaXJlY3Q8c3BhbiBjbGFzcz0iY29weSI+PGlucHV0IHR5cGU9InRleHQiIHJlYWRvbmx5IHZhbHVlPSIke2VzYyhzdC5tbF9yZWRpcmVjdF91cmkpfSI+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1jb3B5PSIke2VzYyhzdC5tbF9yZWRpcmVjdF91cmkpfSI+Q29waWFyPC9idXR0b24+PC9zcGFuPjwvbGFiZWw+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+VVJMIGRlIG5vdGlmaWNhY2lvbmVzICh0w7NwaWNvczogb3JkZXJzX3YyIHkgc2hpcG1lbnRzKTxzcGFuIGNsYXNzPSJjb3B5Ij48aW5wdXQgdHlwZT0idGV4dCIgcmVhZG9ubHkgdmFsdWU9IiR7ZXNjKHN0Lm1sX25vdGlmaWNhdGlvbnNfdXJsKX0iPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtY29weT0iJHtlc2Moc3QubWxfbm90aWZpY2F0aW9uc191cmwpfSI+Q29waWFyPC9idXR0b24+PC9zcGFuPjwvbGFiZWw+CiAgICAgIDxmb3JtIGNsYXNzPSJyb3ciIGlkPSJtbENmZyI+PGxhYmVsIGNsYXNzPSJmIj5BcHAgSUQ8aW5wdXQgdHlwZT0idGV4dCIgaWQ9Im1sSWQiIHZhbHVlPSIke2VzYyhzdC5tbF9jbGllbnRfaWQpfSIgcmVxdWlyZWQ+PC9sYWJlbD48bGFiZWwgY2xhc3M9ImYiPlNlY3JldCBLZXk8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJtbFNlY3JldCIgcGxhY2Vob2xkZXI9IiR7c3QubWxfc2VjcmV0X3NldCA/ICfigKLigKLigKLigKLigKLigKIgKGd1YXJkYWRhKScgOiAnJ30iPjwvbGFiZWw+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiIHN0eWxlPSJmbGV4OjAiPkd1YXJkYXI8L2J1dHRvbj48L2Zvcm0+CiAgICA8L2Rpdj48L2Rpdj4KICA8ZGl2IGNsYXNzPSJwYW5lbCIgc3R5bGU9Im1hcmdpbi10b3A6MjBweCI+PGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+PGgyPkNvcnJlb3MgKHJlY3VwZXJhciBjb250cmFzZcOxYSk8L2gyPiR7c3QubWFpbF9rZXlfc2V0ICYmIHN0Lm1haWxfZnJvbSA/ICc8c3BhbiBjbGFzcz0ic3RhdGUgb24iPjxpPjwvaT5BY3RpdmFkbzwvc3Bhbj4nIDogJzxzcGFuIGNsYXNzPSJzdGF0ZSBlcnIiPjxpPjwvaT5TaW4gY29uZmlndXJhcjwvc3Bhbj4nfTwvZGl2PgogICAgPGRpdiBjbGFzcz0icGFuZWwtYm9keSBzdGFjayI+CiAgICAgIDxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9Im1hcmdpbjowIj5QYXJhIGVudmlhciBsb3MgY8OzZGlnb3MgZGUgNiBkw61naXRvcyBzZSB1c2EgPGEgaHJlZj0iaHR0cHM6Ly93d3cuYnJldm8uY29tIiB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciI+QnJldm88L2E+IChncmF0aXMgaGFzdGEgMzAwIGNvcnJlb3MgYWwgZMOtYSkuIENyZWEgdW5hIGN1ZW50YSwgdmVyaWZpY2EgZWwgY29ycmVvIHJlbWl0ZW50ZSB5IGNvcGlhIHVuYSBBUEkgS2V5IChDb25maWd1cmFjacOzbiDigLogU01UUCB5IEFQSSDigLogQVBJIEtleXMpLjwvcD4KICAgICAgPGZvcm0gY2xhc3M9InN0YWNrIiBpZD0ibWFpbENmZyI+CiAgICAgICAgPGRpdiBjbGFzcz0icm93Ij48bGFiZWwgY2xhc3M9ImYiPkNvcnJlbyByZW1pdGVudGUgKHZlcmlmaWNhZG8gZW4gQnJldm8pPGlucHV0IHR5cGU9ImVtYWlsIiBpZD0ibUZyb20iIHZhbHVlPSIke2VzYyhzdC5tYWlsX2Zyb20gfHwgJycpfSIgcmVxdWlyZWQ+PC9sYWJlbD48bGFiZWwgY2xhc3M9ImYiPk5vbWJyZSByZW1pdGVudGU8aW5wdXQgdHlwZT0idGV4dCIgaWQ9Im1OYW1lIiB2YWx1ZT0iJHtlc2Moc3QubWFpbF9mcm9tX25hbWUgfHwgJ0V0aXF1ZXRhSHViJyl9Ij48L2xhYmVsPjwvZGl2PgogICAgICAgIDxkaXYgY2xhc3M9InJvdyI+PGxhYmVsIGNsYXNzPSJmIj5BUEkgS2V5IGRlIEJyZXZvPGlucHV0IHR5cGU9InBhc3N3b3JkIiBpZD0ibUtleSIgcGxhY2Vob2xkZXI9IiR7c3QubWFpbF9rZXlfc2V0ID8gJ+KAouKAouKAouKAouKAouKAoiAoZ3VhcmRhZGEpJyA6ICd4a2V5c2liLeKApid9Ij48L2xhYmVsPjxsYWJlbCBjbGFzcz0iZiI+RW52aWFyIHBydWViYSBhIChvcGNpb25hbCk8aW5wdXQgdHlwZT0iZW1haWwiIGlkPSJtVGVzdCIgdmFsdWU9IiR7ZXNjKG1lLnVzZXIuZW1haWwpfSI+PC9sYWJlbD48L2Rpdj4KICAgICAgICA8ZGl2IGNsYXNzPSJyb3ciIHN0eWxlPSJqdXN0aWZ5LWNvbnRlbnQ6ZmxleC1lbmQiPjxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgdHlwZT0ic3VibWl0IiBzdHlsZT0iZmxleDowIj5HdWFyZGFyPC9idXR0b24+PC9kaXY+CiAgICAgIDwvZm9ybT4KICAgIDwvZGl2PjwvZGl2PgogIDxkaXYgY2xhc3M9Im1vZGFsIiBpZD0iY29uZmlybSIgaGlkZGVuPjxkaXYgY2xhc3M9InNoZWV0Ij48aDMgaWQ9ImNmVGl0bGUiPsK/U2VndXJvPzwvaDM+PHAgY2xhc3M9Im11dGVkIiBpZD0iY2ZUZXh0IiBzdHlsZT0ibWFyZ2luOjAiPjwvcD48ZGl2IGlkPSJjZkV4dHJhIj48L2Rpdj48ZGl2IGNsYXNzPSJyb3ciIHN0eWxlPSJqdXN0aWZ5LWNvbnRlbnQ6ZmxleC1lbmQiPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSIgaWQ9ImNmTm8iIHN0eWxlPSJmbGV4OjAiPkNhbmNlbGFyPC9idXR0b24+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiBpZD0iY2ZZZXMiIHN0eWxlPSJmbGV4OjAiPkNvbmZpcm1hcjwvYnV0dG9uPjwvZGl2PjwvZGl2PjwvZGl2PmA7CiAgY29uc3Qgcm9sZSA9ICQoJyNudVJvbGUnKTsgY29uc3Qgc3luYyA9ICgpID0+ICQoJyNudVNlbGxlcldyYXAnKS5oaWRkZW4gPSByb2xlLnZhbHVlICE9PSAnc2VsbGVyJzsgcm9sZS5vbmNoYW5nZSA9IHN5bmM7IHN5bmMoKTsKICAkKCcjbmV3U2VsbGVyJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsgZS5wcmV2ZW50RGVmYXVsdCgpOyB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvYWRtaW4vc2VsbGVycycsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgbmFtZTogJCgnI25zTmFtZScpLnZhbHVlIH0gfSk7IHRvYXN0KCdWZW5kZWRvciBhZ3JlZ2FkbycpOyByZW5kZXJBZG1pbigpOyB9IGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UpOyB9IH07CiAgJCgnI25ld1VzZXInKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4geyBlLnByZXZlbnREZWZhdWx0KCk7IHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9hZG1pbi91c2VycycsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgbmFtZTogJCgnI251TmFtZScpLnZhbHVlLCBlbWFpbDogJCgnI251RW1haWwnKS52YWx1ZSwgcm9sZTogcm9sZS52YWx1ZSwgc2VsbGVyX2lkOiAkKCcjbnVTZWxsZXInKS52YWx1ZSwgcGFzc3dvcmQ6ICQoJyNudVBhc3MnKS52YWx1ZSB9IH0pOyB0b2FzdCgnVXN1YXJpbyBjcmVhZG8nKTsgcmVuZGVyQWRtaW4oKTsgfSBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlLCA0MDAwKTsgfSB9OwogIGNvbnN0IGNvbmZpcm1Cb3ggPSAodGl0bGUsIHRleHQsIGV4dHJhID0gJycpID0+IG5ldyBQcm9taXNlKHJlcyA9PiB7CiAgICAkKCcjY2ZUaXRsZScpLnRleHRDb250ZW50ID0gdGl0bGU7ICQoJyNjZlRleHQnKS50ZXh0Q29udGVudCA9IHRleHQ7ICQoJyNjZkV4dHJhJykuaW5uZXJIVE1MID0gZXh0cmE7ICQoJyNjb25maXJtJykuaGlkZGVuID0gZmFsc2U7CiAgICAkKCcjY2ZObycpLm9uY2xpY2sgPSAoKSA9PiB7ICQoJyNjb25maXJtJykuaGlkZGVuID0gdHJ1ZTsgcmVzKGZhbHNlKTsgfTsKICAgICQoJyNjZlllcycpLm9uY2xpY2sgPSAoKSA9PiB7ICQoJyNjb25maXJtJykuaGlkZGVuID0gdHJ1ZTsgcmVzKHRydWUpOyB9OwogIH0pOwogICQoJyNtYWlsQ2ZnJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgIGUucHJldmVudERlZmF1bHQoKTsKICAgIHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9hZG1pbi9zZXR0aW5ncycsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgbWFpbF9mcm9tOiAkKCcjbUZyb20nKS52YWx1ZSwgbWFpbF9mcm9tX25hbWU6ICQoJyNtTmFtZScpLnZhbHVlLCBtYWlsX2FwaV9rZXk6ICQoJyNtS2V5JykudmFsdWUsIHRlc3RfdG86ICQoJyNtVGVzdCcpLnZhbHVlIH0gfSk7IHRvYXN0KCQoJyNtVGVzdCcpLnZhbHVlID8gJ0d1YXJkYWRvLiBUZSBlbnZpYW1vcyB1biBjb3JyZW8gZGUgcHJ1ZWJhLicgOiAnR3VhcmRhZG8nKTsgcmVuZGVyQWRtaW4oKTsgfQogICAgY2F0Y2ggKHgpIHsgdG9hc3QoeC5tZXNzYWdlLCA1MDAwKTsgfQogIH07CiAgJCgnI21sQ2ZnJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsgZS5wcmV2ZW50RGVmYXVsdCgpOyBhd2FpdCBhcGkoJy9hcGkvYWRtaW4vc2V0dGluZ3MnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IG1sX2NsaWVudF9pZDogJCgnI21sSWQnKS52YWx1ZSwgbWxfY2xpZW50X3NlY3JldDogJCgnI21sU2VjcmV0JykudmFsdWUgfSB9KTsgdG9hc3QoJ01lcmNhZG8gTGlicmUgY29uZmlndXJhZG8nKTsgbWUubWxDb25maWd1cmVkID0gdHJ1ZTsgcmVuZGVyQWRtaW4oKTsgfTsKICAkKCcjbWFpbicpLm9uY2xpY2sgPSBhc3luYyBlID0+IHsKICAgIGNvbnN0IGNwID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtY29weV0nKTsKICAgIGlmIChjcCkgeyBlLnByZXZlbnREZWZhdWx0KCk7IHRyeSB7IGF3YWl0IG5hdmlnYXRvci5jbGlwYm9hcmQud3JpdGVUZXh0KGNwLmRhdGFzZXQuY29weSk7IHRvYXN0KCdDb3BpYWRvJyk7IH0gY2F0Y2ggeyBjcC5wcmV2aW91c0VsZW1lbnRTaWJsaW5nLnNlbGVjdCgpOyB9IHJldHVybjsgfQogICAgY29uc3QgYWN0ID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtYWN0XScpOwogICAgaWYgKGFjdCkgewogICAgICBjb25zdCBpZCA9IGFjdC5kYXRhc2V0LmlkLCBuYW1lID0gYWN0LmRhdGFzZXQubmFtZSwga2luZCA9IGFjdC5kYXRhc2V0LmFjdDsKICAgICAgY29uc3QgdGV4dHMgPSB7CiAgICAgICAgJ3RlbXAtcGFzc3dvcmQnOiBbJ0NsYXZlIHRlbXBvcmFsJywgYFNlIHJlZW1wbGF6YSBsYSBjbGF2ZSBhY3R1YWwgZGUgJHtuYW1lfS4gQWwgZW50cmFyIGNvbiBsYSBjbGF2ZSB0ZW1wb3JhbCB0ZW5kcsOhIHF1ZSBjcmVhciB1bmEgbnVldmEuYF0sCiAgICAgICAgJ2JhY2t1cC1jb2RlJzogWydDbGF2ZSBkZSByZXNwYWxkbycsIGBTZSBjcmVhIHVuIGPDs2RpZ28gZGUgdW4gc29sbyB1c28gcGFyYSAke25hbWV9LiBTaSB5YSB0ZW7DrWEgdW5vLCBlbCBhbnRlcmlvciBkZWphIGRlIHNlcnZpci5gXSwKICAgICAgICAnc2VuZC1jb2RlJzogWydFbnZpYXIgY8OzZGlnbycsIGBMZSBsbGVnYSBhICR7bmFtZX0gdW4gY8OzZGlnbyBkZSA2IGTDrWdpdG9zIGEgc3UgY29ycmVvIHBhcmEgZW50cmFyIG8gY2FtYmlhciBzdSBjbGF2ZS5gXSwKICAgICAgICAnaW1wZXJzb25hdGUnOiBbJ0VudHJhciBjb21vICcgKyBuYW1lLCAnVmVyw6FzIGxhIGFwcCBjb21vIGxhIHZlIGVzdGEgcGVyc29uYSwgc2luIG5lY2VzaXRhciBzdSBjbGF2ZS4gUXVlZGEgcmVnaXN0cmFkby4gUGFyYSBzYWxpciBhcHJpZXRhICJWb2x2ZXIgYSBtaSBjdWVudGEiLiddLAogICAgICB9OwogICAgICBpZiAoIWF3YWl0IGNvbmZpcm1Cb3godGV4dHNba2luZF1bMF0sIHRleHRzW2tpbmRdWzFdKSkgcmV0dXJuOwogICAgICB0cnkgewogICAgICAgIGNvbnN0IHIgPSBhd2FpdCBhcGkoYC9hcGkvYWRtaW4vdXNlcnMvJHtpZH0vJHtraW5kfWAsIHsgbWV0aG9kOiAnUE9TVCcgfSk7CiAgICAgICAgaWYgKGtpbmQgPT09ICdpbXBlcnNvbmF0ZScpIHsgbG9jYXRpb24uaHJlZiA9ICcvJzsgcmV0dXJuOyB9CiAgICAgICAgaWYgKHIucGFzc3dvcmQgfHwgci5jb2RlKSB7CiAgICAgICAgICBjb25zdCB2YWwgPSByLnBhc3N3b3JkIHx8IHIuY29kZTsKICAgICAgICAgIGF3YWl0IGNvbmZpcm1Cb3goa2luZCA9PT0gJ3RlbXAtcGFzc3dvcmQnID8gJ0NsYXZlIHRlbXBvcmFsIGRlICcgKyBuYW1lIDogJ0NsYXZlIGRlIHJlc3BhbGRvIGRlICcgKyBuYW1lLAogICAgICAgICAgICBraW5kID09PSAndGVtcC1wYXNzd29yZCcgPyAnRMOtc2VsYSBhbCB1c3VhcmlvLiBTb2xvIHNlIG11ZXN0cmEgYWhvcmE7IGFsIGVudHJhciB0ZW5kcsOhIHF1ZSBjcmVhciBzdSBwcm9waWEgY2xhdmUuJyA6ICdQw6FzYXNlbGEgYWwgdXN1YXJpbyBwYXJhIHF1ZSBsYSBndWFyZGUgZW4gdW4gbHVnYXIgc2VndXJvLiBTaXJ2ZSB1bmEgc29sYSB2ZXosIGVuIGVsIGNhbXBvIENvbnRyYXNlw7FhLiBTb2xvIHNlIG11ZXN0cmEgYWhvcmEuJywKICAgICAgICAgICAgYDxkaXYgY2xhc3M9ImNvcHkiPjxpbnB1dCB0eXBlPSJ0ZXh0IiByZWFkb25seSB2YWx1ZT0iJHtlc2ModmFsKX0iIHN0eWxlPSJmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6MjBweDt0ZXh0LWFsaWduOmNlbnRlciI+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1jb3B5PSIke2VzYyh2YWwpfSI+Q29waWFyPC9idXR0b24+PC9kaXY+YCk7CiAgICAgICAgfSBlbHNlIHRvYXN0KHIubWVzc2FnZSB8fCAnTGlzdG8nKTsKICAgICAgICByZW5kZXJBZG1pbigpOwogICAgICB9IGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UsIDUwMDApOyB9CiAgICAgIHJldHVybjsKICAgIH0KICAgIGNvbnN0IHMgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1kZWxzXScpLCB1ID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtZGVsdV0nKSwgcCA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLXB3XScpOwogICAgaWYgKHMgJiYgYXdhaXQgY29uZmlybUJveCgnRWxpbWluYXIgdmVuZGVkb3InLCAnU2UgYm9ycmFuIHN1cyBjb25leGlvbmVzLCBibG9xdWVvcywgcGVkaWRvcyB5IHVzdWFyaW9zLicpKSB7IGF3YWl0IGFwaShgL2FwaS9hZG1pbi9zZWxsZXJzLyR7cy5kYXRhc2V0LmRlbHN9YCwgeyBtZXRob2Q6ICdERUxFVEUnIH0pOyB0b2FzdCgnVmVuZGVkb3IgZWxpbWluYWRvJyk7IHJlbmRlckFkbWluKCk7IH0KICAgIGlmICh1ICYmIGF3YWl0IGNvbmZpcm1Cb3goJ0VsaW1pbmFyIHVzdWFyaW8nLCAnWWEgbm8gcG9kcsOhIGVudHJhciBhIEV0aXF1ZXRhSHViLicpKSB7IGF3YWl0IGFwaShgL2FwaS9hZG1pbi91c2Vycy8ke3UuZGF0YXNldC5kZWx1fWAsIHsgbWV0aG9kOiAnREVMRVRFJyB9KTsgdG9hc3QoJ1VzdWFyaW8gZWxpbWluYWRvJyk7IHJlbmRlckFkbWluKCk7IH0KICAgIGlmIChwICYmIGF3YWl0IGNvbmZpcm1Cb3goJ0NhbWJpYXIgY29udHJhc2XDsWEnLCAnRXNjcmliZSBsYSBudWV2YSBjb250cmFzZcOxYSAobcOtbmltbyA4IGNhcmFjdGVyZXMpLicsICc8aW5wdXQgdHlwZT0idGV4dCIgaWQ9ImNmUHciIG1pbmxlbmd0aD0iOCI+JykpIHsKICAgICAgdHJ5IHsgYXdhaXQgYXBpKGAvYXBpL2FkbWluL3VzZXJzLyR7cC5kYXRhc2V0LnB3fS9wYXNzd29yZGAsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgcGFzc3dvcmQ6ICQoJyNjZlB3JykudmFsdWUgfSB9KTsgdG9hc3QoJ0NvbnRyYXNlw7FhIGFjdHVhbGl6YWRhJyk7IH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IH0KICAgIH0KICB9Owp9CgovLyAtLS0tLS0tLS0tIG1pIGNsYXZlIC0tLS0tLS0tLS0KZnVuY3Rpb24gcmVuZGVyTXlBY2NvdW50KGZvcmNlZCA9IGZhbHNlKSB7CiAgJCgnI2FwcCcpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJsb2dpbiI+PGRpdiBjbGFzcz0iY2FyZCI+PGRpdiBjbGFzcz0iYXJ0Ij4ke0hFUk9fU1ZHfTwvZGl2Pjxmb3JtIGlkPSJteUZvcm0iPgogICAgPGgxPiR7Zm9yY2VkID8gJ0NyZWEgdHUgY2xhdmUgbnVldmEnIDogJ01pIGNsYXZlJ308L2gxPgogICAgPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjAiPiR7Zm9yY2VkID8gJ0VudHJhc3RlIGNvbiB1bmEgY2xhdmUgdGVtcG9yYWwgbyBkZSByZXNwYWxkby4gQ3JlYSB0dSBwcm9waWEgY29udHJhc2XDsWEgcGFyYSBzZWd1aXIuJyA6IGVzYyhtZS51c2VyLmVtYWlsKX08L3A+CiAgICAke2ZvcmNlZCA/ICcnIDogJzxsYWJlbCBjbGFzcz0iZiI+Q29udHJhc2XDsWEgYWN0dWFsPGlucHV0IHR5cGU9InBhc3N3b3JkIiBpZD0ibUN1ciIgYXV0b2NvbXBsZXRlPSJjdXJyZW50LXBhc3N3b3JkIiByZXF1aXJlZD48L2xhYmVsPid9CiAgICA8bGFiZWwgY2xhc3M9ImYiPk51ZXZhIGNvbnRyYXNlw7FhIChtw61uaW1vIDgpPGlucHV0IHR5cGU9InBhc3N3b3JkIiBpZD0ibVAxIiBhdXRvY29tcGxldGU9Im5ldy1wYXNzd29yZCIgbWlubGVuZ3RoPSI4IiByZXF1aXJlZD48L2xhYmVsPgogICAgPGxhYmVsIGNsYXNzPSJmIj5SZXDDrXRlbGE8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJtUDIiIGF1dG9jb21wbGV0ZT0ibmV3LXBhc3N3b3JkIiBtaW5sZW5ndGg9IjgiIHJlcXVpcmVkPjwvbGFiZWw+CiAgICA8bGFiZWwgY2xhc3M9InN3aXRjaCIgc3R5bGU9ImZvbnQtc2l6ZToxM3B4Ij48aW5wdXQgdHlwZT0iY2hlY2tib3giIGlkPSJtU2hvdyI+IE1vc3RyYXIgY29udHJhc2XDsWE8L2xhYmVsPgogICAgPGRpdiBjbGFzcz0iZXJyIiBpZD0ibUVyciI+PC9kaXY+CiAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIHR5cGU9InN1Ym1pdCI+R3VhcmRhcjwvYnV0dG9uPgogICAgJHtmb3JjZWQgPyAnJyA6ICc8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWdob3N0IiB0eXBlPSJidXR0b24iIGlkPSJtQmFja3VwIj5DcmVhciBtaSBjbGF2ZSBkZSByZXNwYWxkbzwvYnV0dG9uPjxkaXYgaWQ9Im1CYWNrdXBPdXQiPjwvZGl2PjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSIgdHlwZT0iYnV0dG9uIiBpZD0ibUJhY2siPlZvbHZlcjwvYnV0dG9uPid9CiAgPC9mb3JtPjwvZGl2PjwvZGl2PmA7CiAgJCgnI21TaG93Jykub25jaGFuZ2UgPSBlID0+IHsgJCQoJyNteUZvcm0gaW5wdXRbdHlwZT1wYXNzd29yZF0sICNteUZvcm0gaW5wdXRbZGF0YS1wd10nKS5mb3JFYWNoKGkgPT4geyBpLmRhdGFzZXQucHcgPSAxOyBpLnR5cGUgPSBlLnRhcmdldC5jaGVja2VkID8gJ3RleHQnIDogJ3Bhc3N3b3JkJzsgfSk7IH07CiAgJCgnI215Rm9ybScpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICBlLnByZXZlbnREZWZhdWx0KCk7CiAgICBpZiAoJCgnI21QMScpLnZhbHVlICE9PSAkKCcjbVAyJykudmFsdWUpIHJldHVybiAoJCgnI21FcnInKS50ZXh0Q29udGVudCA9ICdMYXMgY29udHJhc2XDsWFzIG5vIGNvaW5jaWRlbicpOwogICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL21lL3Bhc3N3b3JkJywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBjdXJyZW50OiBmb3JjZWQgPyAnJyA6ICQoJyNtQ3VyJykudmFsdWUsIHBhc3N3b3JkOiAkKCcjbVAxJykudmFsdWUgfSB9KTsgdG9hc3QoJ0NvbnRyYXNlw7FhIGd1YXJkYWRhJyk7IGJvb3QoKTsgfQogICAgY2F0Y2ggKHgpIHsgJCgnI21FcnInKS50ZXh0Q29udGVudCA9IHgubWVzc2FnZTsgfQogIH07CiAgaWYgKCFmb3JjZWQpIHsKICAgICQoJyNtQmFjaycpLm9uY2xpY2sgPSAoKSA9PiBib290KCk7CiAgICAkKCcjbUJhY2t1cCcpLm9uY2xpY2sgPSBhc3luYyAoKSA9PiB7CiAgICAgIHRyeSB7CiAgICAgICAgY29uc3QgciA9IGF3YWl0IGFwaSgnL2FwaS9tZS9iYWNrdXAtY29kZScsIHsgbWV0aG9kOiAnUE9TVCcgfSk7CiAgICAgICAgJCgnI21CYWNrdXBPdXQnKS5pbm5lckhUTUwgPSBgPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEzcHg7bWFyZ2luOjAgMCA2cHgiPkd1w6FyZGFsYSBlbiB1biBsdWdhciBzZWd1cm8gKGZvdG8sIHBhcGVsIG8gbm90YXMgZGVsIGNlbHVsYXIpLiBTaXJ2ZSB1bmEgc29sYSB2ZXogZW4gZWwgY2FtcG8gQ29udHJhc2XDsWEgc2kgb2x2aWRhcyB0dSBjbGF2ZS4gU2kgY3JlYXMgb3RyYSwgZXN0YSBkZWphIGRlIHNlcnZpci48L3A+PGlucHV0IHR5cGU9InRleHQiIHJlYWRvbmx5IHZhbHVlPSIke2VzYyhyLmNvZGUpfSIgc3R5bGU9ImZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZToyMHB4O3RleHQtYWxpZ246Y2VudGVyIj5gOwogICAgICB9IGNhdGNoICh4KSB7ICQoJyNtRXJyJykudGV4dENvbnRlbnQgPSB4Lm1lc3NhZ2U7IH0KICAgIH07CiAgfQp9CgovLyAtLS0tLS0tLS0tIGluaWNpbyAtLS0tLS0tLS0tCmFzeW5jIGZ1bmN0aW9uIGJvb3QoKSB7CiAgdHJ5IHsgbWUgPSBhd2FpdCBhcGkoJy9hcGkvbWUnKTsgfQogIGNhdGNoIHsKICAgIGNvbnN0IGggPSBhd2FpdCBmZXRjaCgnL2FwaS9zZXR1cC1zdGF0dXMnKS50aGVuKHIgPT4gci5qc29uKCkpLmNhdGNoKCgpID0+ICh7fSkpOwogICAgcmV0dXJuIGgubmVlZHNTZXR1cCA/IHJlbmRlclNldHVwKCkgOiByZW5kZXJMb2dpbihoLmRlbW8pOwogIH0KICBmaXJzdExvYWQgPSB0cnVlOwogIGlmIChtZS5tdXN0Q2hhbmdlKSByZXR1cm4gcmVuZGVyTXlBY2NvdW50KHRydWUpOwogIHJlbmRlclNoZWxsKCk7Cn0KYm9vdCgpOwp9KSgpOwo=","index.html":"PCFkb2N0eXBlIGh0bWw+CjxodG1sIGxhbmc9ImVzIj4KPGhlYWQ+CjxtZXRhIGNoYXJzZXQ9InV0Zi04Ij4KPG1ldGEgbmFtZT0idmlld3BvcnQiIGNvbnRlbnQ9IndpZHRoPWRldmljZS13aWR0aCwgaW5pdGlhbC1zY2FsZT0xLCB2aWV3cG9ydC1maXQ9Y292ZXIiPgo8dGl0bGU+RXRpcXVldGFIdWI8L3RpdGxlPgo8bGluayByZWw9Imljb24iIGhyZWY9Ii9sb2dvLnN2ZyIgdHlwZT0iaW1hZ2Uvc3ZnK3htbCI+CjxsaW5rIHJlbD0icHJlY29ubmVjdCIgaHJlZj0iaHR0cHM6Ly9mb250cy5nb29nbGVhcGlzLmNvbSI+CjxsaW5rIHJlbD0ic3R5bGVzaGVldCIgaHJlZj0iaHR0cHM6Ly9mb250cy5nb29nbGVhcGlzLmNvbS9jc3MyP2ZhbWlseT1CYWxvbysyOndnaHRANjAwOzcwMDs4MDAmZmFtaWx5PU51bml0bytTYW5zOm9wc3osd2dodEA2Li4xMiw0MDA7Ni4uMTIsNjAwOzYuLjEyLDcwMCZmYW1pbHk9SmV0QnJhaW5zK01vbm86d2dodEA1MDA7NzAwJmRpc3BsYXk9c3dhcCI+CjxsaW5rIHJlbD0ic3R5bGVzaGVldCIgaHJlZj0iL2FwcC5jc3MiPgo8L2hlYWQ+Cjxib2R5Pgo8ZGl2IGlkPSJhcHAiPjxkaXYgc3R5bGU9Im1pbi1oZWlnaHQ6MTAwdmg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtmb250LWZhbWlseTpzeXN0ZW0tdWksc2Fucy1zZXJpZjtjb2xvcjojMEE2RkE2O2ZvbnQtd2VpZ2h0OjcwMCI+Q2FyZ2FuZG8gRXRpcXVldGFIdWLigKYgKGxhIHByaW1lcmEgdmV6IHB1ZWRlIHRhcmRhciBoYXN0YSAxIG1pbnV0byk8L2Rpdj48L2Rpdj4KPGRpdiBjbGFzcz0idG9hc3QiIGlkPSJ0b2FzdCIgaGlkZGVuPjwvZGl2Pgo8c2NyaXB0IHNyYz0iL2FwcC5qcyI+PC9zY3JpcHQ+CjwvYm9keT4KPC9odG1sPgo=","logo.svg":"PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0MCA0MCI+PHJlY3QgeD0iNCIgeT0iOCIgd2lkdGg9IjMyIiBoZWlnaHQ9IjI2IiByeD0iNyIgZmlsbD0iIzE2OTNEMyIvPjxwYXRoIGQ9Ik00IDE2aDMyIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iMi41Ii8+PHJlY3QgeD0iMTAiIHk9IjIxIiB3aWR0aD0iMTIiIGhlaWdodD0iMyIgcng9IjEuNSIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjEwIiB5PSIyNiIgd2lkdGg9IjgiIGhlaWdodD0iMyIgcng9IjEuNSIgZmlsbD0iI0JGRTZGOCIvPjxjaXJjbGUgY3g9IjI5IiBjeT0iMjYiIHI9IjQiIGZpbGw9IiNmZmYiLz48L3N2Zz4K"};
__req('index', './start');
