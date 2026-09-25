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

// Migraciones simples (columnas nuevas)
for (const [t, c, def] of [['users', 'must_change', 'INTEGER NOT NULL DEFAULT 0'], ['sessions', 'impersonator_id', 'INTEGER'], ['users', 'backup_hash', 'TEXT']]) {
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
  const textW = PAGE_W - PAD * 2 - qtyW;
  return items.map(it => {
    const name = safeText(fonts.bold, it.name || 'Producto');
    const variant = safeText(fonts.reg, it.variant || '');
    const sku = safeText(fonts.reg, [it.sku && `SKU ${it.sku}`, it.pub_id && it.pub_id !== it.sku && `ID ${it.pub_id}`].filter(Boolean).join('  ·  '));
    const lines = [
      ...wrap(fonts.bold, name, 9.5, textW).map(t => ({ t, f: fonts.bold, s: 9.5 })),
      ...(variant ? wrap(fonts.reg, variant, 8.5, textW).map(t => ({ t, f: fonts.reg, s: 8.5 })) : []),
      ...(sku ? wrap(fonts.reg, sku, 7.5, textW).map(t => ({ t, f: fonts.reg, s: 7.5, grey: true })) : []),
    ];
    return { qty: String(it.qty || 1), lines, h: lines.reduce((a, l) => a + l.s + 2, 0) + 4 };
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

// Hoja de detalle del pedido (segunda página, 100x150 mm)
function drawOrderSheet(page, fonts, blocks, info, part, parts) {
  const black = rgb(0, 0, 0), grey = rgb(0.3, 0.3, 0.3);
  let y = PAGE_H - PAD - 10;
  page.drawText('DETALLE DEL PEDIDO' + (parts > 1 ? `  (${part}/${parts})` : ''), { x: PAD, y, size: 8.5, font: fonts.bold, color: grey });
  const units = `${info.units} unidad${info.units === 1 ? '' : 'es'}`;
  page.drawText(units, { x: PAGE_W - PAD - fonts.bold.widthOfTextAtSize(units, 8.5), y, size: 8.5, font: fonts.bold, color: grey });
  y -= 22;
  const num = safeText(fonts.bold, info.orderNumber);
  let size = 20; while (fonts.bold.widthOfTextAtSize(num, size) > PAGE_W - PAD * 2 && size > 10) size -= 1;
  page.drawText(num, { x: PAD, y, size, font: fonts.bold, color: black });
  y -= 14;
  page.drawText(safeText(fonts.reg, `${MK_NAME[info.marketplace] || ''}  ·  ${info.seller}`), { x: PAD, y, size: 9, font: fonts.reg, color: grey });
  if (info.customer) {
    y -= 18;
    page.drawText('Cliente:', { x: PAD, y, size: 9, font: fonts.reg, color: grey });
    const c = wrap(fonts.bold, safeText(fonts.bold, info.customer), 12, PAGE_W - PAD * 2 - 42)[0] || '';
    page.drawText(c, { x: PAD + 40, y, size: 12, font: fonts.bold, color: black });
  }
  y -= 10;
  for (let x = PAD; x < PAGE_W - PAD; x += 6) page.drawLine({ start: { x, y }, end: { x: Math.min(x + 3, PAGE_W - PAD), y }, thickness: 1, color: black });
  y -= 6;
  for (const b of blocks) {
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
    y -= 8;
  }
  const foot = safeText(fonts.reg, 'Va junto a la etiqueta anterior · EtiquetaHub');
  page.drawText(foot, { x: PAD, y: PAD, size: 7, font: fonts.reg, color: grey });
}
const sheetHeaderH = info => 70 + (info.customer ? 18 : 0);

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
  const pages = src.getPages();
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
    const areaW = PAGE_W - 2, areaH = PAGE_H - stripH - 2;
    const w = emb.width, h = emb.height;
    const sNormal = Math.min(areaW / w, areaH / h);
    const sRot = Math.min(areaW / h, areaH / w);
    if (sRot > sNormal * 1.15) {
      const dw = h * sRot, dh = w * sRot;
      const x = (PAGE_W - dw) / 2 + dw, y = PAGE_H - 1 - dh;
      page.drawPage(emb, { x, y, xScale: sRot, yScale: sRot, rotate: degrees(90) });
    } else {
      const dw = w * sNormal, dh = h * sNormal;
      page.drawPage(emb, { x: (PAGE_W - dw) / 2, y: PAGE_H - 1 - dh, xScale: sNormal, yScale: sNormal });
    }
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
    labelReady: sh.status === 'ready_to_ship' && ['ready_to_print', 'printed'].includes(sh.substatus),
    cancelled: sh.status === 'cancelled' || orders.every(o => o.status === 'cancelled'),
    shipped: ['shipped', 'delivered', 'not_delivered'].includes(sh.status),
    meta: { status: sh.status, substatus: sh.substatus, logistic, customer: sh.receiver_address?.receiver_name || [first.buyer?.first_name, first.buyer?.last_name].filter(Boolean).join(' ') || first.buyer?.nickname || '' },
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

module.exports = { authUrl, exchangeCode, whoAmI, listShipments, fetchLabel, fromNotification };

};

__defs["connectors/falabella"] = function (module, exports, require, __dirname) {
// Falabella Seller Center API (firma HMAC-SHA256)
const crypto = require('crypto');
const cfg = require('../config');
const { request, NotReady } = require('../http');

const enc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const arr = x => (x == null ? [] : Array.isArray(x) ? x : [x]);

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
  return arr(b.OrderItems?.OrderItem);
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
    meta: { orderItemIds: active.map(i => String(i.OrderItemId)), statuses, packageId: active.find(i => i.PackageId)?.PackageId || null, tracking: active.find(i => i.TrackingCode)?.TrackingCode || null, carrier: active.find(i => i.ShipmentProvider)?.ShipmentProvider || null, customer: [order.CustomerFirstName, order.CustomerLastName].filter(Boolean).join(' ') || [order.AddressShipping?.FirstName, order.AddressShipping?.LastName].filter(Boolean).join(' ') },
  };
}

async function listShipments(conn) {
  const after = new Date(Date.now() - cfg.lookbackDays * 864e5).toISOString().replace(/\.\d{3}Z$/, '+00:00');
  const out = [];
  for (const status of ['pending', 'ready_to_ship']) {
    for (let offset = 0; offset < 1000; offset += 100) {
      const b = await call(conn.creds, 'GetOrders', { CreatedAfter: after, Status: status, Limit: '100', Offset: String(offset), SortBy: 'created_at', SortDirection: 'DESC' });
      const orders = arr(b.Orders?.Order);
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
    packageId = arr(b.OrderItems?.OrderItem).find(i => i.PackageId)?.PackageId || null;
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
  const doc = arr(b.Documents?.Document)[0] || b.Document;
  if (!doc?.File) throw new NotReady('Falabella todavía no entrega la etiqueta');
  const buf = Buffer.from(doc.File, 'base64');
  if (!String(doc.MimeType || '').includes('pdf') && buf.slice(0, 5).toString() !== '%PDF-') throw new Error(`Falabella entregó la etiqueta en formato ${doc.MimeType}; se necesita PDF`);
  return buf;
}

module.exports = { test, listShipments, fetchLabel, normalize, orderItems };

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
    meta: { labelId: sh.labelId || null, labelUrl: sh.labelUrl || null, carrier: sh.carrier, tracking: sh.trackingNumber || null, statusId: sh.statusId, shipmentId: sh.id, customer: sub.customer?.name || [sh.shippingAddress?.firstName, sh.shippingAddress?.lastName].filter(Boolean).join(' ') },
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

module.exports = { test, listShipments, fetchLabel };

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
  return { mk, external_id: `demo-${sellerId}-${counter}`, order_number: num, sold_at: new Date().toISOString(), items, labelReady: true, cancelled: false, shipped: false, meta: { demoMk: mk, customer: rnd(['Camila Rojas', 'Diego Muñoz', 'Valentina Soto', 'Matías González', 'Fernanda Pérez', 'Benjamín Díaz']) } };
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
  for (const it of items) {
    const keys = [it.sku, it.pub_id].filter(Boolean).map(s => String(s).trim().toUpperCase());
    const r = rules.find(r => (r.marketplace === 'any' || r.marketplace === order.marketplace) && keys.includes(String(r.value).trim().toUpperCase()));
    if (r) hits.push({ sku: it.sku, pub_id: it.pub_id, name: it.name, rule: r.value });
  }
  return hits;
}

function labelPath(id) { return path.join(cfg.dataDir, 'labels', `${id}.pdf`); }

const getOrder = id => db.prepare('SELECT * FROM orders WHERE id = ?').get(id);

async function tryLabel(conn, orderId) {
  const order = getOrder(orderId);
  if (!order || !['waiting', 'error'].includes(order.state)) return;
  if (blockedBy(order).length) return; // bloqueado: el fulfillment no recibe esta etiqueta
  const connector = connectors[conn.row.marketplace];
  try {
    const original = await connector.fetchLabel(conn, order);
    const seller = db.prepare('SELECT name FROM sellers WHERE id = ?').get(order.seller_id);
    const stamped = await stampLabel(original, {
      items: JSON.parse(order.items), seller: seller?.name || '', marketplace: order.marketplace, orderNumber: order.order_number,
      customer: JSON.parse(order.meta || '{}').customer || '',
    });
    fs.writeFileSync(labelPath(order.id), stamped);
    fs.writeFileSync(labelPath(order.id + '.original'), original);
    db.prepare(`UPDATE orders SET state='ready', label_file=?, label_at=datetime('now'), error=NULL, updated_at=datetime('now') WHERE id=?`).run(`${order.id}.pdf`, order.id);
    logEvent(order.seller_id, 'label', `Etiqueta lista: pedido ${order.order_number}`);
    bus.emit('change', { type: 'label', orderId: order.id, sellerId: order.seller_id });
  } catch (e) {
    const state = e instanceof NotReady ? 'waiting' : 'error';
    db.prepare(`UPDATE orders SET state=?, error=?, updated_at=datetime('now') WHERE id=?`).run(state, e.message.slice(0, 500), order.id);
    if (state === 'error') console.warn(`[etiqueta] pedido ${order.order_number}:`, e.message);
    bus.emit('change', { type: 'order', orderId: order.id, sellerId: order.seller_id });
  }
}

async function upsert(conn, s) {
  const mk = s.mk || conn.row.marketplace;
  const existing = db.prepare('SELECT * FROM orders WHERE marketplace = ? AND external_id = ?').get(mk, s.external_id);
  if (!existing) {
    if (s.shipped || s.cancelled) return;
    const r = db.prepare(`INSERT INTO orders (seller_id, connection_id, marketplace, external_id, order_number, sold_at, items, meta)
      VALUES (?,?,?,?,?,?,?,?)`).run(conn.row.seller_id, conn.row.id, mk, s.external_id, s.order_number, s.sold_at || null, JSON.stringify(s.items), JSON.stringify(s.meta || {}));
    const id = Number(r.lastInsertRowid);
    logEvent(conn.row.seller_id, 'order', `Nuevo pedido ${s.order_number}`);
    bus.emit('change', { type: 'order', orderId: id, sellerId: conn.row.seller_id });
    return id;
  }
  let state = existing.state;
  if (s.cancelled && state !== 'printed') state = 'cancelled';
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
    for (const s of list) {
      if (!s) continue;
      const id = await upsert(conn, s);
      if (!id) continue;
      const canTry = s.labelReady || (row.marketplace === 'fa' && conn.settings.autoReady);
      if (canTry) await tryLabel(conn, id);
    }
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
  // Si el servidor se reinició y se perdieron los PDF, se vuelven a pedir al marketplace
  for (const o of db.prepare("SELECT id FROM orders WHERE state='ready'").all()) {
    if (!fs.existsSync(labelPath(o.id))) db.prepare("UPDATE orders SET state='waiting', label_file=NULL WHERE id=?").run(o.id);
  }
  const every = (cfg.demo ? 20 : cfg.pollSeconds) * 1000;
  const tick = () => syncAll().catch(e => console.error('[sync]', e));
  setTimeout(tick, 1500);
  timer = setInterval(tick, every);
  console.log(`Sincronización automática cada ${every / 1000} s`);
}

module.exports = { bus, start, tryLabel, syncConnection, syncAll, blockedBy, labelPath, connObj, connectors, retryUnblocked, logEvent };

};

__defs["server"] = function (module, exports, require, __dirname) {
const http = require('http');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const db = require('./db');
const sec = require('./security');
const sync = require('./sync');
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
function trackUrl(o, meta) {
  if (o.marketplace === 'ml') return `https://www.mercadolibre.cl/ventas/${encodeURIComponent(o.order_number)}/detalle`;
  const t = meta.tracking, c = String(meta.carrier || '').toUpperCase();
  if (t && c.includes('BLUE')) return `https://www.blue.cl/seguimiento/?n_seguimiento=${encodeURIComponent(t)}`;
  if (t && c.includes('CHILEXPRESS')) return `https://centrodeayuda.chilexpress.cl/seguimiento/${encodeURIComponent(t)}`;
  if (t && c.includes('STARKEN')) return `https://www.starken.cl/seguimiento?codigo=${encodeURIComponent(t)}`;
  if (o.marketplace === 'fa') return 'https://sellercenter.falabella.com/';
  if (o.marketplace === 'pa') return 'https://marketplace.paris.cl/';
  return null;
}
function orderView(o, user) {
  const items = JSON.parse(o.items);
  const blocked = sync.blockedBy(o);
  const seller = db.prepare('SELECT name FROM sellers WHERE id=?').get(o.seller_id);
  const meta = JSON.parse(o.meta || '{}');
  return {
    id: o.id, seller_id: o.seller_id, seller: seller?.name || '', marketplace: o.marketplace, order_number: o.order_number,
    sold_at: o.sold_at, created_at: o.created_at, items, state: blocked.length ? 'blocked' : o.state,
    blocked_skus: blocked.map(b => (b.sku || b.pub_id)), label_at: o.label_at, printed_at: o.printed_at, printed_by: o.printed_by,
    error: user.role === 'seller' || user.role === 'admin' ? o.error : (o.state === 'error' ? 'No se pudo obtener la etiqueta' : o.error),
    carrier: meta.carrier || null, customer: meta.customer || '', tracking: meta.tracking || null, track_url: trackUrl(o, meta),
  };
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
  for (const c of clients) if (c.user.role !== 'seller' || c.user.seller_id === ev.sellerId) c.res.write(msg);
});
setInterval(() => { for (const c of clients) c.res.write(': ping\n\n'); }, 25000);

// ---------- rutas ----------
async function route(req, res) {
  const url = new URL(req.url, cfg.baseUrl);
  const p = url.pathname;
  const m = req.method;

  if (p === '/health') return ok(res, { ok: true, demo: cfg.demo });

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
    const view = url.searchParams.get('view') || 'pending';
    const where = [], args = [];
    if (user.role === 'seller') { where.push('seller_id = ?'); args.push(user.seller_id); }
    if (view === 'pending') where.push("state NOT IN ('printed','cancelled')");
    if (view === 'printed') where.push("state = 'printed' AND printed_at >= datetime('now','-1 day')");
    if (view === 'all') where.push("(created_at >= datetime('now','-7 day') OR state NOT IN ('printed','cancelled'))");
    const rows = db.prepare(`SELECT * FROM orders ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 1000`).all(...args);
    const sellers = user.role === 'seller' ? [] : db.prepare('SELECT id, name FROM sellers ORDER BY name').all();
    return ok(res, { orders: rows.map(o => orderView(o, user)), sellers });
  }

  const lab = p.match(/^\/api\/orders\/(\d+)\/label\.pdf$/);
  if (lab && m === 'GET') {
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(Number(lab[1]));
    if (!o || (user.role === 'seller' && o.seller_id !== user.seller_id)) return fail(res, 404, 'Pedido no encontrado');
    if (user.role !== 'seller' && sync.blockedBy(o).length) return fail(res, 403, 'Etiqueta bloqueada por el vendedor');
    if (!o.label_file || !fs.existsSync(sync.labelPath(o.id))) return fail(res, 409, 'La etiqueta aún no está lista');
    if (user.role !== 'seller' && url.searchParams.get('mark') === '1') {
      db.prepare("UPDATE orders SET state='printed', printed_at=datetime('now'), printed_by=? WHERE id=?").run(user.name, o.id);
      sync.bus.emit('change', { type: 'printed', orderId: o.id, sellerId: o.seller_id });
    }
    return send(res, 200, fs.readFileSync(sync.labelPath(o.id)), { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="etiqueta-${o.marketplace}-${o.order_number}.pdf"` });
  }

  if (p === '/api/labels/batch' && m === 'POST') {
    if (user.role === 'seller') return fail(res, 403, 'Solo el fulfillment descarga en lote');
    const { ids = [], mark = true } = await readBody(req);
    const rows = ids.map(Number).filter(Boolean).map(id => db.prepare('SELECT * FROM orders WHERE id=?').get(id)).filter(Boolean);
    const allowed = rows.filter(o => !sync.blockedBy(o).length && o.label_file && fs.existsSync(sync.labelPath(o.id)));
    if (!allowed.length) return fail(res, 409, 'Ninguna de las etiquetas seleccionadas está disponible');
    const sellerName = id => db.prepare('SELECT name FROM sellers WHERE id=?').get(id)?.name || '';
    allowed.sort((a, b) => sellerName(a.seller_id).localeCompare(sellerName(b.seller_id)) || a.marketplace.localeCompare(b.marketplace) || a.id - b.id);
    const pdf = await mergePdfs(allowed.map(o => fs.readFileSync(sync.labelPath(o.id))));
    if (mark) {
      const st = db.prepare("UPDATE orders SET state='printed', printed_at=datetime('now'), printed_by=? WHERE id=?");
      for (const o of allowed) st.run(user.name, o.id);
      sync.bus.emit('change', { type: 'printed', sellerId: null });
    }
    const stamp = new Intl.DateTimeFormat('sv-SE', { timeZone: cfg.timezone, dateStyle: 'short', timeStyle: 'short' }).format(new Date()).replace(/[-: ]/g, '').replace(/^(\d{8})/, '$1-');
    return send(res, 200, pdf, { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="etiquetas-${stamp}.pdf"`, 'x-label-count': String(allowed.length), 'x-skipped': String(rows.length - allowed.length) });
  }

  const ret = p.match(/^\/api\/orders\/(\d+)\/(retry|unprint)$/);
  if (ret && m === 'POST') {
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(Number(ret[1]));
    if (!o || (user.role === 'seller' && o.seller_id !== user.seller_id)) return fail(res, 404, 'Pedido no encontrado');
    if (ret[2] === 'unprint') {
      if (user.role === 'seller') return fail(res, 403, 'No permitido');
      db.prepare("UPDATE orders SET state=CASE WHEN label_file IS NOT NULL THEN 'ready' ELSE 'waiting' END, printed_at=NULL, printed_by=NULL WHERE id=?").run(o.id);
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

  // ----- administración -----
  if (p.startsWith('/api/admin/')) {
    if (user.role !== 'admin') return fail(res, 403, 'Solo administrador');
    if (p === '/api/admin/sellers' && m === 'GET') {
      const sellers = db.prepare('SELECT id, name, created_at FROM sellers ORDER BY name').all().map(s => ({
        ...s,
        connections: db.prepare('SELECT marketplace, last_error, last_sync_at FROM connections WHERE seller_id=?').all(s.id),
        blocked: db.prepare('SELECT COUNT(*) n FROM blocklist WHERE seller_id=?').get(s.id).n,
      }));
      const users = db.prepare('SELECT id, email, name, role, seller_id, must_change, (backup_hash IS NOT NULL) AS has_backup FROM users ORDER BY role, name').all();
      return ok(res, { sellers, users });
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

global.__EH_PUBLIC = {"app.css":"OnJvb3R7CiAgLS1iZzojRUFGNUZDOyAtLWJnMjojRDhFREY5OyAtLXN1cmZhY2U6I0ZGRkZGRjsgLS1zdXJmYWNlMjojRjRGQUZFOwogIC0taW5rOiMwQzJCNDA7IC0tbXV0ZWQ6IzU1NzI4NzsgLS1saW5lOiNDOUUyRjI7CiAgLS1hY2NlbnQ6IzE2OTNEMzsgLS1hY2NlbnQtc3Ryb25nOiMwQTZGQTY7IC0tc2t5OiM3RkNERjI7IC0taWNlOiNCRkU2Rjg7CiAgLS1vazojMjM5NDZBOyAtLW9rLWJnOiNEREY0RUE7IC0tbG9jazojQzgzRTU1OyAtLWxvY2stYmc6I0ZCRTNFODsgLS13YXJuOiNCNzc5MEY7IC0td2Fybi1iZzojRkNGMEQ2OwogIC0tbWw6I0ZGRTYwMDsgLS1tbC1pbms6IzJEMzI3NzsgLS1mYTojQUFENTAwOyAtLWZhLWluazojMkYzQTAwOyAtLXBhOiMwMDc4Qzg7IC0tcGEtaW5rOiNGRkZGRkY7CiAgLS1zaGFkb3c6MCAxMHB4IDMwcHggLTE0cHggcmdiYSgxMiw3MCwxMTAsLjM1KTsKICAtLWRpc3BsYXk6IkJhbG9vIDIiLCJUcmVidWNoZXQgTVMiLHN5c3RlbS11aSxzYW5zLXNlcmlmOwogIC0tYm9keToiTnVuaXRvIFNhbnMiLHN5c3RlbS11aSwtYXBwbGUtc3lzdGVtLCJTZWdvZSBVSSIsc2Fucy1zZXJpZjsKICAtLW1vbm86IkpldEJyYWlucyBNb25vIix1aS1tb25vc3BhY2UsTWVubG8sQ29uc29sYXMsbW9ub3NwYWNlOwogIGNvbG9yLXNjaGVtZTpsaWdodDsKfQpAbWVkaWEgKHByZWZlcnMtY29sb3Itc2NoZW1lOiBkYXJrKXsKICA6cm9vdHsKICAgIGNvbG9yLXNjaGVtZTpkYXJrOwogICAgLS1iZzojMDgxQjI5OyAtLWJnMjojMEQyNjM4OyAtLXN1cmZhY2U6IzBGMkEzRTsgLS1zdXJmYWNlMjojMTIzMjQ4OwogICAgLS1pbms6I0U0RjNGQzsgLS1tdXRlZDojOTNCNEM5OyAtLWxpbmU6IzFFNDY2MDsKICAgIC0tYWNjZW50OiMzQkFFRTg7IC0tYWNjZW50LXN0cm9uZzojOEFEM0Y3OyAtLXNreTojMkM3RkFFOyAtLWljZTojMTg0NDVGOwogICAgLS1vazojNTZEMjlGOyAtLW9rLWJnOiMxMjM4MkI7IC0tbG9jazojRjA3RDkwOyAtLWxvY2stYmc6IzNEMTgyMjsgLS13YXJuOiNFQkI2NUE7IC0td2Fybi1iZzojM0EyQzEwOwogICAgLS1zaGFkb3c6MCAxMHB4IDMwcHggLTE0cHggcmdiYSgwLDAsMCwuNik7CiAgfQp9Cip7Ym94LXNpemluZzpib3JkZXItYm94fQpodG1sLGJvZHl7bWFyZ2luOjB9CmJvZHl7YmFja2dyb3VuZDp2YXIoLS1iZyk7Y29sb3I6dmFyKC0taW5rKTtmb250LWZhbWlseTp2YXIoLS1ib2R5KTtmb250LXNpemU6MTVweDtsaW5lLWhlaWdodDoxLjU7bWluLWhlaWdodDoxMDB2aH0KLndyYXB7bWF4LXdpZHRoOjEyNDBweDttYXJnaW46MCBhdXRvO3BhZGRpbmctaW5saW5lOjIwcHg7cGFkZGluZy1ibG9jazowIDYwcHh9CmgxLGgyLGgze2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2xpbmUtaGVpZ2h0OjEuMTt0ZXh0LXdyYXA6YmFsYW5jZTttYXJnaW46MH0KYnV0dG9ue2ZvbnQ6aW5oZXJpdDtjdXJzb3I6cG9pbnRlcjtjb2xvcjppbmhlcml0fQphe2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQpidXR0b246Zm9jdXMtdmlzaWJsZSxpbnB1dDpmb2N1cy12aXNpYmxlLHNlbGVjdDpmb2N1cy12aXNpYmxlLHRleHRhcmVhOmZvY3VzLXZpc2libGUsYTpmb2N1cy12aXNpYmxle291dGxpbmU6M3B4IHNvbGlkIHZhcigtLXNreSk7b3V0bGluZS1vZmZzZXQ6MnB4fQoubW9ub3tmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6Ljg2ZW19Ci5tdXRlZHtjb2xvcjp2YXIoLS1tdXRlZCl9CltoaWRkZW5de2Rpc3BsYXk6bm9uZSFpbXBvcnRhbnR9CgovKiBiYXJyYSBzdXBlcmlvciAqLwoudG9we3Bvc2l0aW9uOnN0aWNreTt0b3A6MDt6LWluZGV4OjIwO2JhY2tncm91bmQ6Y29sb3ItbWl4KGluIHNyZ2IsdmFyKC0tYmcpIDg4JSx0cmFuc3BhcmVudCk7YmFja2Ryb3AtZmlsdGVyOmJsdXIoOHB4KTtib3JkZXItYm90dG9tOjFweCBzb2xpZCB2YXIoLS1saW5lKX0KLnRvcCAud3JhcHtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDoxNHB4O2ZsZXgtd3JhcDp3cmFwO3BhZGRpbmctYmxvY2s6MTBweH0KLmJyYW5ke2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjEwcHg7Zm9udC1mYW1pbHk6dmFyKC0tZGlzcGxheSk7Zm9udC13ZWlnaHQ6ODAwO2ZvbnQtc2l6ZToyMnB4O2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpO3RleHQtZGVjb3JhdGlvbjpub25lfQouYnJhbmQgaW1ne3dpZHRoOjMycHg7aGVpZ2h0OjMycHh9Ci5uYXZ7ZGlzcGxheTpmbGV4O2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjk5OXB4O3BhZGRpbmc6NHB4O2dhcDo0cHh9Ci5uYXYgYnV0dG9ue2JvcmRlcjowO2JhY2tncm91bmQ6dHJhbnNwYXJlbnQ7Y29sb3I6dmFyKC0tbXV0ZWQpO3BhZGRpbmc6N3B4IDE1cHg7Ym9yZGVyLXJhZGl1czo5OTlweDtmb250LXdlaWdodDo3MDB9Ci5uYXYgYnV0dG9uW2FyaWEtY3VycmVudD0idHJ1ZSJde2JhY2tncm91bmQ6dmFyKC0tYWNjZW50KTtjb2xvcjojZmZmfQouc3BhY2Vye2ZsZXg6MX0KLmxpdmV7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4O2ZvbnQtc2l6ZToxMi41cHg7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOnZhcigtLW11dGVkKX0KLmxpdmUgaXt3aWR0aDo5cHg7aGVpZ2h0OjlweDtib3JkZXItcmFkaXVzOjUwJTtiYWNrZ3JvdW5kOnZhcigtLW11dGVkKX0KLmxpdmUub257Y29sb3I6dmFyKC0tb2spfSAubGl2ZS5vbiBpe2JhY2tncm91bmQ6dmFyKC0tb2spO2JveC1zaGFkb3c6MCAwIDAgNHB4IGNvbG9yLW1peChpbiBzcmdiLHZhcigtLW9rKSAyNSUsdHJhbnNwYXJlbnQpfQouY2xvY2t7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6MTBweDtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czoxNHB4O3BhZGRpbmc6NXB4IDEycHh9Ci5jbG9jayBie2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZToxN3B4O2ZvbnQtdmFyaWFudC1udW1lcmljOnRhYnVsYXItbnVtc30KLmNsb2NrIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtkaXNwbGF5OmJsb2NrO2xpbmUtaGVpZ2h0OjEuMTtmb250LXNpemU6MTAuNXB4O3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtsZXR0ZXItc3BhY2luZzouMDZlbX0KLmNsb2NrLmxhdGUgYntjb2xvcjp2YXIoLS1sb2NrKX0KLnVzZXJ7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6OHB4O2ZvbnQtc2l6ZToxMy41cHh9Ci51c2VyIGJ7ZGlzcGxheTpibG9jaztsaW5lLWhlaWdodDoxLjF9Ci51c2VyIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKX0KCi8qIGVsZW1lbnRvcyAqLwouYnRue3RleHQtZGVjb3JhdGlvbjpub25lO2JvcmRlcjowO2JvcmRlci1yYWRpdXM6MTNweDtwYWRkaW5nOjlweCAxNXB4O2ZvbnQtd2VpZ2h0OjcwMDtkaXNwbGF5OmlubGluZS1mbGV4O2dhcDo4cHg7YWxpZ24taXRlbXM6Y2VudGVyO2p1c3RpZnktY29udGVudDpjZW50ZXI7d2hpdGUtc3BhY2U6bm93cmFwfQouYnRuIHN2Z3t3aWR0aDoxOHB4O2hlaWdodDoxOHB4O2ZsZXg6bm9uZX0KLmJ0bi1wcmltYXJ5e2JhY2tncm91bmQ6dmFyKC0tYWNjZW50KTtjb2xvcjojZmZmfQouYnRuLXByaW1hcnk6aG92ZXJ7YmFja2dyb3VuZDp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KLmJ0bi1naG9zdHtiYWNrZ3JvdW5kOnZhcigtLWljZSk7Y29sb3I6dmFyKC0tYWNjZW50LXN0cm9uZyl9Ci5idG4tbGluZXtiYWNrZ3JvdW5kOnRyYW5zcGFyZW50O2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Y29sb3I6dmFyKC0taW5rKX0KLmJ0bi1kYW5nZXJ7YmFja2dyb3VuZDp2YXIoLS1sb2NrLWJnKTtjb2xvcjp2YXIoLS1sb2NrKX0KLmJ0bjpkaXNhYmxlZHtvcGFjaXR5Oi40NTtjdXJzb3I6bm90LWFsbG93ZWR9Ci5idG4tc217cGFkZGluZzo2cHggMTBweDtmb250LXNpemU6MTNweDtib3JkZXItcmFkaXVzOjEwcHh9CnNlbGVjdCxpbnB1dFt0eXBlPXRleHRdLGlucHV0W3R5cGU9ZW1haWxdLGlucHV0W3R5cGU9cGFzc3dvcmRdLGlucHV0W3R5cGU9c2VhcmNoXSx0ZXh0YXJlYXtmb250OmluaGVyaXQ7Y29sb3I6dmFyKC0taW5rKTtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTJweDtwYWRkaW5nOjhweCAxMnB4O21pbi13aWR0aDowO3dpZHRoOjEwMCV9CnRleHRhcmVhe3Jlc2l6ZTp2ZXJ0aWNhbDttaW4taGVpZ2h0OjcwcHh9CmxhYmVsLmZ7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6NHB4O2ZvbnQtc2l6ZToxMi41cHg7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOnZhcigtLW11dGVkKX0KLmNoaXBze2Rpc3BsYXk6ZmxleDtnYXA6NnB4O2ZsZXgtd3JhcDp3cmFwfQouY2hpcHtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZTIpO2NvbG9yOnZhcigtLWluayk7cGFkZGluZzo2cHggMTJweDtib3JkZXItcmFkaXVzOjk5OXB4O2ZvbnQtd2VpZ2h0OjYwMDtmb250LXNpemU6MTNweH0KLmNoaXBbYXJpYS1wcmVzc2VkPSJ0cnVlIl17YmFja2dyb3VuZDp2YXIoLS1hY2NlbnQpO2JvcmRlci1jb2xvcjp2YXIoLS1hY2NlbnQpO2NvbG9yOiNmZmZ9Ci5zd2l0Y2h7ZGlzcGxheTppbmxpbmUtZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjEwcHg7Zm9udC13ZWlnaHQ6NzAwO2ZvbnQtc2l6ZToxNHB4O2N1cnNvcjpwb2ludGVyO3VzZXItc2VsZWN0Om5vbmV9Ci5zd2l0Y2ggaW5wdXR7YXBwZWFyYW5jZTpub25lO3dpZHRoOjQ0cHg7aGVpZ2h0OjI2cHg7Ym9yZGVyLXJhZGl1czo5OTlweDtiYWNrZ3JvdW5kOnZhcigtLWxpbmUpO3Bvc2l0aW9uOnJlbGF0aXZlO3RyYW5zaXRpb246YmFja2dyb3VuZCAuMnM7Y3Vyc29yOnBvaW50ZXI7bWFyZ2luOjA7ZmxleDpub25lfQouc3dpdGNoIGlucHV0OjphZnRlcntjb250ZW50OiIiO3Bvc2l0aW9uOmFic29sdXRlO3RvcDozcHg7bGVmdDozcHg7d2lkdGg6MjBweDtoZWlnaHQ6MjBweDtib3JkZXItcmFkaXVzOjUwJTtiYWNrZ3JvdW5kOiNmZmY7dHJhbnNpdGlvbjpsZWZ0IC4ycztib3gtc2hhZG93OjAgMXB4IDNweCByZ2JhKDAsMCwwLC4yNSl9Ci5zd2l0Y2ggaW5wdXQ6Y2hlY2tlZHtiYWNrZ3JvdW5kOnZhcigtLW9rKX0KLnN3aXRjaCBpbnB1dDpjaGVja2VkOjphZnRlcntsZWZ0OjIxcHh9CgoucGFuZWx7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MjJweDtib3gtc2hhZG93OnZhcigtLXNoYWRvdyl9Ci5wYW5lbC1oZWFke2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6MTJweDthbGlnbi1pdGVtczpjZW50ZXI7cGFkZGluZzoxNnB4IDIwcHg7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tbGluZSl9Ci5wYW5lbC1oZWFkIGgye2ZvbnQtc2l6ZToyM3B4O21hcmdpbi1yaWdodDphdXRvfQoucGFuZWwtYm9keXtwYWRkaW5nOjE2cHggMjBweH0KLnBhbmVsLWZvb3R7ZGlzcGxheTpmbGV4O2ZsZXgtd3JhcDp3cmFwO2dhcDoxMHB4O2FsaWduLWl0ZW1zOmNlbnRlcjtwYWRkaW5nOjE0cHggMjBweDtib3JkZXItdG9wOjFweCBzb2xpZCB2YXIoLS1saW5lKTtjb2xvcjp2YXIoLS1tdXRlZCk7Zm9udC1zaXplOjEzLjVweH0KCi5ta3tkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtmb250LXdlaWdodDo3MDA7Zm9udC1zaXplOjEycHg7cGFkZGluZzozcHggOXB4O2JvcmRlci1yYWRpdXM6OHB4O3doaXRlLXNwYWNlOm5vd3JhcH0KLm1rLm1se2JhY2tncm91bmQ6dmFyKC0tbWwpO2NvbG9yOnZhcigtLW1sLWluayl9IC5tay5mYXtiYWNrZ3JvdW5kOnZhcigtLWZhKTtjb2xvcjp2YXIoLS1mYS1pbmspfSAubWsucGF7YmFja2dyb3VuZDp2YXIoLS1wYSk7Y29sb3I6dmFyKC0tcGEtaW5rKX0KLnBpbGx7ZGlzcGxheTppbmxpbmUtZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjZweDtib3JkZXItcmFkaXVzOjk5OXB4O3BhZGRpbmc6NHB4IDEwcHg7Zm9udC13ZWlnaHQ6NzAwO2ZvbnQtc2l6ZToxMi41cHg7d2hpdGUtc3BhY2U6bm93cmFwfQoucGlsbCBzdmd7d2lkdGg6MTRweDtoZWlnaHQ6MTRweH0KLnBpbGwucmVhZHl7YmFja2dyb3VuZDp2YXIoLS1vay1iZyk7Y29sb3I6dmFyKC0tb2spfQoucGlsbC5ibG9ja2Vke2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayl9Ci5waWxsLnByaW50ZWR7YmFja2dyb3VuZDp2YXIoLS1pY2UpO2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQoucGlsbC53YWl0aW5ne2JhY2tncm91bmQ6dmFyKC0td2Fybi1iZyk7Y29sb3I6dmFyKC0td2Fybil9Ci5waWxsLmVycm9ye2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayl9Ci5waWxsLmNhbmNlbGxlZHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKTtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5ub3Rle2Rpc3BsYXk6YmxvY2s7Zm9udC1zaXplOjEycHg7Y29sb3I6dmFyKC0tbXV0ZWQpO21hcmdpbi10b3A6NHB4O21heC13aWR0aDozNGNofQoubm90ZS5iYWR7Y29sb3I6dmFyKC0tbG9jayl9CgovKiBow6lyb2UgKi8KLmhlcm97ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczoxLjFmciAuOWZyO2dhcDoyNHB4O2FsaWduLWl0ZW1zOmNlbnRlcjtwYWRkaW5nLWJsb2NrOjI0cHggNnB4fQouaGVybyBoMXtmb250LXNpemU6Y2xhbXAoMjhweCwzLjZ2dyw0MHB4KTtmb250LXdlaWdodDo4MDB9Ci5oZXJvIGgxIGVte2ZvbnQtc3R5bGU6bm9ybWFsO2NvbG9yOnZhcigtLWFjY2VudCl9Ci5oZXJvIHB7Y29sb3I6dmFyKC0tbXV0ZWQpO21heC13aWR0aDo1NmNoO21hcmdpbjoxMHB4IDAgMH0KLmhlcm8gc3Zne3dpZHRoOjEwMCU7aGVpZ2h0OmF1dG87bWF4LWhlaWdodDoyMTBweH0KCi8qIGtwaXMgKi8KLmtwaXN7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoNCwxZnIpO2dhcDoxNHB4O21hcmdpbi1ibG9jazoxOHB4fQoua3Bpe2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjE4cHg7cGFkZGluZzoxNHB4IDE2cHg7ZGlzcGxheTpmbGV4O2dhcDoxMnB4O2FsaWduLWl0ZW1zOmNlbnRlcn0KLmtwaSAuaWN7d2lkdGg6NDJweDtoZWlnaHQ6NDJweDtib3JkZXItcmFkaXVzOjEycHg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtmbGV4Om5vbmV9Ci5rcGkgLmljIHN2Z3t3aWR0aDoyMnB4O2hlaWdodDoyMnB4fQoua3BpLm9rIC5pY3tiYWNrZ3JvdW5kOnZhcigtLW9rLWJnKTtjb2xvcjp2YXIoLS1vayl9Ci5rcGkud2FpdCAuaWN7YmFja2dyb3VuZDp2YXIoLS13YXJuLWJnKTtjb2xvcjp2YXIoLS13YXJuKX0KLmtwaS5sb2NrIC5pY3tiYWNrZ3JvdW5kOnZhcigtLWxvY2stYmcpO2NvbG9yOnZhcigtLWxvY2spfQoua3BpLmRvbmUgLmlje2JhY2tncm91bmQ6dmFyKC0taWNlKTtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KLmtwaSBie2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtc2l6ZToyOHB4O2xpbmUtaGVpZ2h0OjE7ZGlzcGxheTpibG9jaztmb250LXZhcmlhbnQtbnVtZXJpYzp0YWJ1bGFyLW51bXN9Ci5rcGkgc3Bhbntjb2xvcjp2YXIoLS1tdXRlZCk7Zm9udC1zaXplOjEzcHh9CgouYXV0b2JhcntkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7Z2FwOjE0cHg7YWxpZ24taXRlbXM6Y2VudGVyO2p1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuO2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDEyMGRlZyx2YXIoLS1iZzIpLHZhcigtLXN1cmZhY2UpKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MThweDtwYWRkaW5nOjE0cHggMThweDttYXJnaW4tYm90dG9tOjE2cHh9Ci5hdXRvYmFyIHB7bWFyZ2luOjJweCAwIDA7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtc2l6ZToxM3B4O21heC13aWR0aDo3MGNofQoKLmZpbHRlcnN7ZGlzcGxheTpmbGV4O2ZsZXgtd3JhcDp3cmFwO2dhcDoxMHB4O2FsaWduLWl0ZW1zOmNlbnRlcn0KLmZpbHRlcnMgc2VsZWN0LC5maWx0ZXJzIGlucHV0e3dpZHRoOmF1dG99Ci50YWJsZS13cmFwe292ZXJmbG93LXg6YXV0b30KdGFibGV7d2lkdGg6MTAwJTtib3JkZXItY29sbGFwc2U6Y29sbGFwc2U7bWluLXdpZHRoOjgyMHB4fQp0aHtmb250LXNpemU6MTEuNXB4O3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtsZXR0ZXItc3BhY2luZzouMDdlbTtjb2xvcjp2YXIoLS1tdXRlZCk7dGV4dC1hbGlnbjpsZWZ0O3BhZGRpbmc6MTBweCAxNHB4O2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZTIpO3doaXRlLXNwYWNlOm5vd3JhcH0KdGR7cGFkZGluZzoxMXB4IDE0cHg7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tbGluZSk7dmVydGljYWwtYWxpZ246bWlkZGxlfQp0ci5pcy1ibG9ja2VkIHRke2JhY2tncm91bmQ6Y29sb3ItbWl4KGluIHNyZ2IsdmFyKC0tbG9jay1iZykgNDUlLHRyYW5zcGFyZW50KX0KdHIuaXMtbmV3IHRke2FuaW1hdGlvbjpmbGFzaCAyLjVzIGVhc2Utb3V0fQpAa2V5ZnJhbWVzIGZsYXNoe2Zyb217YmFja2dyb3VuZDpjb2xvci1taXgoaW4gc3JnYix2YXIoLS1za3kpIDQ1JSx0cmFuc3BhcmVudCl9dG97YmFja2dyb3VuZDp0cmFuc3BhcmVudH19Ci5pdGVtc3tkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDoycHg7Zm9udC1zaXplOjEzLjVweH0KLml0ZW1zIC52e2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTIuNXB4fQouaXRlbXMgLmJhZHtjb2xvcjp2YXIoLS1sb2NrKTtmb250LXdlaWdodDo3MDB9Ci5jYnt3aWR0aDoxOXB4O2hlaWdodDoxOXB4O2FjY2VudC1jb2xvcjp2YXIoLS1hY2NlbnQpfQoubG9ja2NlbGx7Y29sb3I6dmFyKC0tbG9jayk7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcn0KLmxvY2tjZWxsIHN2Z3t3aWR0aDoxOHB4O2hlaWdodDoxOHB4fQoucm93LWFjdGlvbnN7ZGlzcGxheTpmbGV4O2dhcDo2cHg7ZmxleC13cmFwOndyYXB9Ci5lbXB0eXtwYWRkaW5nOjQwcHggMjBweDt0ZXh0LWFsaWduOmNlbnRlcjtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5lbXB0eSBzdmd7d2lkdGg6MTIwcHg7aGVpZ2h0OmF1dG87bWFyZ2luLWJvdHRvbToxMHB4fQoKLyogdmVuZGVkb3IgKi8KLnNlY3Rpb24tdGl0bGV7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6MTJweDtmbGV4LXdyYXA6d3JhcDttYXJnaW4tYmxvY2s6MjRweCAxMnB4fQouc2VjdGlvbi10aXRsZSBoMntmb250LXNpemU6MjZweH0KLmNvbm57ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoMywxZnIpO2dhcDoxNHB4fQoubWNhcmR7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MjBweDtwYWRkaW5nOjE2cHg7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MTBweH0KLm1jYXJkIC5sb2dve2hlaWdodDo0NHB4O2JvcmRlci1yYWRpdXM6MTJweDtkaXNwbGF5OmdyaWQ7cGxhY2UtaXRlbXM6Y2VudGVyO2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MThweH0KLm1jYXJkIC5ob3d7Zm9udC1zaXplOjEyLjVweDtjb2xvcjp2YXIoLS1tdXRlZCk7bWFyZ2luOjB9Ci5zdGF0ZXtmb250LXNpemU6MTNweDtmb250LXdlaWdodDo3MDA7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4fQouc3RhdGUub257Y29sb3I6dmFyKC0tb2spfSAuc3RhdGUub2Zme2NvbG9yOnZhcigtLW11dGVkKX0gLnN0YXRlLmVycntjb2xvcjp2YXIoLS1sb2NrKX0KLnN0YXRlIGl7d2lkdGg6OHB4O2hlaWdodDo4cHg7Ym9yZGVyLXJhZGl1czo1MCU7YmFja2dyb3VuZDpjdXJyZW50Q29sb3I7ZGlzcGxheTppbmxpbmUtYmxvY2t9Ci5jb3B5e2Rpc3BsYXk6ZmxleDtnYXA6NnB4fQouY29weSBpbnB1dHtmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6MTEuNXB4fQouZ3JpZDJ7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczoxZnIgMWZyO2dhcDoyMHB4O21hcmdpbi10b3A6MjBweH0KLnJ1bGV7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczphdXRvIDFmcjtnYXA6MTRweDthbGlnbi1pdGVtczpjZW50ZXI7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlMik7Ym9yZGVyOjFweCBkYXNoZWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czoxNnB4O3BhZGRpbmc6MTJweCAxNHB4fQoucnVsZSBzdmd7d2lkdGg6MTEwcHg7aGVpZ2h0OmF1dG99Ci5ydWxlIHB7bWFyZ2luOjA7Zm9udC1zaXplOjEzLjVweDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5ydWxlIGJ7Y29sb3I6dmFyKC0taW5rKX0KLmFkZHJvd3tkaXNwbGF5OmdyaWQ7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmciAxNTBweCBhdXRvO2dhcDo4cHg7YWxpZ24taXRlbXM6c3RhcnR9Ci50YWdze2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6OHB4O21heC1oZWlnaHQ6MjYwcHg7b3ZlcmZsb3c6YXV0b30KLnRhZ3tkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4O2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayk7Ym9yZGVyLXJhZGl1czoxMHB4O3BhZGRpbmc6NHB4IDRweCA0cHggMTBweDtmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6MTIuNXB4O2ZvbnQtd2VpZ2h0OjcwMH0KLnRhZyBzbWFsbHtmb250LWZhbWlseTp2YXIoLS1ib2R5KTtmb250LXdlaWdodDo2MDA7b3BhY2l0eTouOH0KLnRhZyBidXR0b257Ym9yZGVyOjA7YmFja2dyb3VuZDp0cmFuc3BhcmVudDtjb2xvcjppbmhlcml0O3dpZHRoOjI0cHg7aGVpZ2h0OjI0cHg7Ym9yZGVyLXJhZGl1czo2cHg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcn0KLnRhZyBidXR0b246aG92ZXJ7YmFja2dyb3VuZDpjb2xvci1taXgoaW4gc3JnYix2YXIoLS1sb2NrKSAxOCUsdHJhbnNwYXJlbnQpfQouc3RhY2t7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MTJweH0KLnJvd3tkaXNwbGF5OmZsZXg7Z2FwOjEwcHg7ZmxleC13cmFwOndyYXA7YWxpZ24taXRlbXM6ZW5kfQoucm93ID4gKntmbGV4OjE7bWluLXdpZHRoOjE1MHB4fQoKLyogbG9naW4gKi8KLmxvZ2lue21pbi1oZWlnaHQ6MTAwdmg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtwYWRkaW5nOjIwcHh9Ci5sb2dpbiAuY2FyZHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czoyNnB4O2JveC1zaGFkb3c6dmFyKC0tc2hhZG93KTt3aWR0aDoxMDAlO21heC13aWR0aDo0MjBweDtvdmVyZmxvdzpoaWRkZW59Ci5sb2dpbiAuYXJ0e2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDEzNWRlZyx2YXIoLS1iZzIpLHZhcigtLWljZSkpO3BhZGRpbmc6MjJweCAyNHB4IDhweH0KLmxvZ2luIC5hcnQgc3Zne3dpZHRoOjEwMCU7aGVpZ2h0OmF1dG99Ci5sb2dpbiBmb3Jte3BhZGRpbmc6MjJweCAyNHB4IDI2cHg7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MTJweH0KLmxvZ2luIGgxe2ZvbnQtc2l6ZTozMHB4O2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQouZXJye2NvbG9yOnZhcigtLWxvY2spO2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTMuNXB4O21pbi1oZWlnaHQ6MS4yZW19Ci5kZW1vLWhpbnR7Zm9udC1zaXplOjEyLjVweDtiYWNrZ3JvdW5kOnZhcigtLXdhcm4tYmcpO2NvbG9yOnZhcigtLXdhcm4pO3BhZGRpbmc6OHB4IDEycHg7Ym9yZGVyLXJhZGl1czoxMnB4fQoKLnRvYXN0e3Bvc2l0aW9uOmZpeGVkO2xlZnQ6NTAlO2JvdHRvbToyMnB4O3RyYW5zZm9ybTp0cmFuc2xhdGVYKC01MCUpO2JhY2tncm91bmQ6dmFyKC0taW5rKTtjb2xvcjp2YXIoLS1iZyk7cGFkZGluZzoxMHB4IDE4cHg7Ym9yZGVyLXJhZGl1czoxMnB4O2ZvbnQtd2VpZ2h0OjcwMDt6LWluZGV4OjYwO21heC13aWR0aDpjYWxjKDEwMCUgLSAzMnB4KX0KLm1vZGFse3Bvc2l0aW9uOmZpeGVkO2luc2V0OjA7ei1pbmRleDo1MDtiYWNrZ3JvdW5kOnJnYmEoNiwzMCw0OCwuNTUpO2Rpc3BsYXk6Z3JpZDtwbGFjZS1pdGVtczpjZW50ZXI7cGFkZGluZzoxNnB4fQouc2hlZXR7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXItcmFkaXVzOjIycHg7bWF4LXdpZHRoOjUyMHB4O3dpZHRoOjEwMCU7cGFkZGluZzoyMHB4O2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjEycHh9CgpAbWVkaWEgKG1heC13aWR0aDo5ODBweCl7CiAgLmhlcm8sLmdyaWQye2dyaWQtdGVtcGxhdGUtY29sdW1uczoxZnJ9CiAgLmhlcm8gc3Zne2Rpc3BsYXk6bm9uZX0KICAua3Bpc3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDIsMWZyKX0KICAuY29ubntncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyfQp9CkBtZWRpYSAobWF4LXdpZHRoOjUyMHB4KXsKICAud3JhcHtwYWRkaW5nLWlubGluZToxNnB4fQogIC5hZGRyb3d7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmcn0KICAucnVsZXtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyfQogIC51c2VyIHNtYWxse2Rpc3BsYXk6bm9uZX0KfQpAbWVkaWEgKHByZWZlcnMtcmVkdWNlZC1tb3Rpb246bm8tcHJlZmVyZW5jZSl7CiAgLnRydWNre2FuaW1hdGlvbjpkcml2ZSA2cyBlYXNlLWluLW91dCBpbmZpbml0ZX0KICBAa2V5ZnJhbWVzIGRyaXZlezAlLDEwMCV7dHJhbnNmb3JtOnRyYW5zbGF0ZVgoMCl9NTAle3RyYW5zZm9ybTp0cmFuc2xhdGVYKDE2cHgpfX0KfQouZ3JpZDIgPiAqe21pbi13aWR0aDowfQovKiBiYW5kZWphIG51ZXZhICovCi50YWJzYmlne2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDQsMWZyKTtnYXA6MTJweDttYXJnaW4tYm90dG9tOjE2cHh9Ci50YntkaXNwbGF5OmZsZXg7Z2FwOjEycHg7YWxpZ24taXRlbXM6Y2VudGVyO3RleHQtYWxpZ246bGVmdDtib3JkZXI6MnB4IHNvbGlkIHZhcigtLWxpbmUpO2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyLXJhZGl1czoxOHB4O3BhZGRpbmc6MTRweCAxNnB4O2NvbG9yOnZhcigtLWluayl9Ci50YiAudGItaWN7d2lkdGg6NDRweDtoZWlnaHQ6NDRweDtib3JkZXItcmFkaXVzOjEycHg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtmbGV4Om5vbmV9Ci50YiAudGItaWMgc3Zne3dpZHRoOjIycHg7aGVpZ2h0OjIycHh9Ci50YiBie2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtc2l6ZTozMHB4O2xpbmUtaGVpZ2h0OjE7ZGlzcGxheTpibG9jaztmb250LXZhcmlhbnQtbnVtZXJpYzp0YWJ1bGFyLW51bXN9Ci50YiAudGItbntmb250LXdlaWdodDo4MDA7ZGlzcGxheTpibG9ja30KLnRiIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTJweDtkaXNwbGF5OmJsb2NrO2xpbmUtaGVpZ2h0OjEuMn0KLnRiLXJlYWR5IC50Yi1pY3tiYWNrZ3JvdW5kOnZhcigtLWljZSk7Y29sb3I6dmFyKC0tYWNjZW50LXN0cm9uZyl9Ci50Yi13YWl0aW5nIC50Yi1pY3tiYWNrZ3JvdW5kOnZhcigtLXdhcm4tYmcpO2NvbG9yOnZhcigtLXdhcm4pfQoudGItcHJpbnRlZCAudGItaWN7YmFja2dyb3VuZDp2YXIoLS1vay1iZyk7Y29sb3I6dmFyKC0tb2spfQoudGItYmxvY2tlZCAudGItaWN7YmFja2dyb3VuZDp2YXIoLS1sb2NrLWJnKTtjb2xvcjp2YXIoLS1sb2NrKX0KLnRiW2FyaWEtcHJlc3NlZD0idHJ1ZSJde2JvcmRlci1jb2xvcjp2YXIoLS1hY2NlbnQpO2JveC1zaGFkb3c6MCAwIDAgM3B4IGNvbG9yLW1peChpbiBzcmdiLHZhcigtLWFjY2VudCkgMjIlLHRyYW5zcGFyZW50KX0KLnRiLXJlYWR5W2FyaWEtcHJlc3NlZD0idHJ1ZSJde2JhY2tncm91bmQ6Y29sb3ItbWl4KGluIHNyZ2IsdmFyKC0taWNlKSA0NSUsdmFyKC0tc3VyZmFjZSkpfQouY2hpcCAuY250e2Rpc3BsYXk6aW5saW5lLWJsb2NrO21pbi13aWR0aDoyMHB4O3BhZGRpbmc6MCA2cHg7Ym9yZGVyLXJhZGl1czo5OTlweDtiYWNrZ3JvdW5kOmNvbG9yLW1peChpbiBzcmdiLGN1cnJlbnRDb2xvciAxNSUsdHJhbnNwYXJlbnQpO2ZvbnQtc2l6ZToxMS41cHg7bWFyZ2luLWxlZnQ6NHB4fQouYWN0aW9uYmFye2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6MTBweDthbGlnbi1pdGVtczpjZW50ZXI7cGFkZGluZzoxMnB4IDIwcHg7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tbGluZSk7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlMil9Ci5kYXloZWFke3BhZGRpbmc6MTBweCAyMHB4O2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MTNweDt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7bGV0dGVyLXNwYWNpbmc6LjA2ZW07Y29sb3I6dmFyKC0tYWNjZW50LXN0cm9uZyk7YmFja2dyb3VuZDp2YXIoLS1iZyk7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tbGluZSl9Ci5vcm93e2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MzRweCAxMTBweCAxZnIgYXV0bztnYXA6MTRweDthbGlnbi1pdGVtczpjZW50ZXI7cGFkZGluZzoxMnB4IDIwcHg7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tbGluZSl9Ci5vcm93LnN0LXByaW50ZWR7b3BhY2l0eTouOH0KLm9yb3cuc3QtYmxvY2tlZHtiYWNrZ3JvdW5kOmNvbG9yLW1peChpbiBzcmdiLHZhcigtLWxvY2stYmcpIDQ1JSx0cmFuc3BhcmVudCl9Ci5vYy10aW1le2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjRweDthbGlnbi1pdGVtczpmbGV4LXN0YXJ0fQoub2MtdGltZSBie2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZToxOHB4fQoub2MtdG9we2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6OHB4O2FsaWduLWl0ZW1zOmJhc2VsaW5lO21hcmdpbi1ib3R0b206MnB4fQouY3VzdHtmb250LXdlaWdodDo4MDA7Zm9udC1zaXplOjE1LjVweH0KLmN1c3Q6OmFmdGVye2NvbnRlbnQ6IsK3IjttYXJnaW4tbGVmdDo4cHg7Y29sb3I6dmFyKC0tbXV0ZWQpfQoub2MtYWN0e2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47YWxpZ24taXRlbXM6ZmxleC1lbmQ7Z2FwOjhweH0KLm9yb3cuaXMtbmV3e2FuaW1hdGlvbjpmbGFzaCAyLjVzIGVhc2Utb3V0fQpAbWVkaWEgKG1heC13aWR0aDo4MjBweCl7CiAgLnRhYnNiaWd7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgyLDFmcil9CiAgLm9yb3d7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjI4cHggMWZyO30KICAub3JvdyAub2MtdGltZXtmbGV4LWRpcmVjdGlvbjpyb3c7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo4cHh9CiAgLm9yb3cgLm9jLW1haW4sLm9yb3cgLm9jLWFjdHtncmlkLWNvbHVtbjoyfQogIC5vYy1hY3R7YWxpZ24taXRlbXM6ZmxleC1zdGFydH0KfQo=","app.js":"LyogRXRpcXVldGFIdWIg4oCUIGludGVyZmF6ICovCigoKSA9PiB7CmNvbnN0ICQgPSAocywgZWwgPSBkb2N1bWVudCkgPT4gZWwucXVlcnlTZWxlY3RvcihzKTsKY29uc3QgJCQgPSAocywgZWwgPSBkb2N1bWVudCkgPT4gWy4uLmVsLnF1ZXJ5U2VsZWN0b3JBbGwocyldOwpjb25zdCBlc2MgPSBzID0+IFN0cmluZyhzID8/ICcnKS5yZXBsYWNlKC9bJjw+IiddL2csIGMgPT4gKHsgJyYnOiAnJmFtcDsnLCAnPCc6ICcmbHQ7JywgJz4nOiAnJmd0OycsICciJzogJyZxdW90OycsICInIjogJyYjMzk7JyB9W2NdKSk7CmNvbnN0IE1LID0geyBtbDogJ01lcmNhZG8gTGlicmUnLCBmYTogJ0ZhbGFiZWxsYScsIHBhOiAnUGFyaXMnIH07CmNvbnN0IFNUQVRFID0geyByZWFkeTogJ0V0aXF1ZXRhIHBvciBpbXByaW1pcicsIHdhaXRpbmc6ICdFc3BlcmFuZG8gZXRpcXVldGEnLCBibG9ja2VkOiAnQmxvcXVlYWRhJywgcHJpbnRlZDogJ0V0aXF1ZXRhIGltcHJlc2EnLCBlcnJvcjogJ0Vycm9yIGVuIGV0aXF1ZXRhJywgY2FuY2VsbGVkOiAnQ2FuY2VsYWRhJyB9Owpjb25zdCBzdG9yZSA9IHsgZ2V0KGssIGQpIHsgdHJ5IHsgY29uc3QgdiA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKCdlaDonICsgayk7IHJldHVybiB2ID09IG51bGwgPyBkIDogSlNPTi5wYXJzZSh2KTsgfSBjYXRjaCB7IHJldHVybiBkOyB9IH0sIHNldChrLCB2KSB7IHRyeSB7IGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdlaDonICsgaywgSlNPTi5zdHJpbmdpZnkodikpOyB9IGNhdGNoIHt9IH0gfTsKCmNvbnN0IEkgPSB7CiAgbG9jazogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyLjIiPjxyZWN0IHg9IjUiIHk9IjExIiB3aWR0aD0iMTQiIGhlaWdodD0iMTAiIHJ4PSIyIi8+PHBhdGggZD0iTTggMTFWOGE0IDQgMCAwMTggMHYzIi8+PC9zdmc+JywKICBjaGVjazogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIzIj48cGF0aCBkPSJNNSAxMmw1IDUgOS0xMCIvPjwvc3ZnPicsCiAgcHJpbnQ6ICc8c3ZnIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMi4yIj48cGF0aCBkPSJNNyA5VjNoMTB2Nk03IDE3SDR2LTdoMTZ2N2gtMyIvPjxyZWN0IHg9IjciIHk9IjE0IiB3aWR0aD0iMTAiIGhlaWdodD0iNyIvPjwvc3ZnPicsCiAgY2xvY2s6ICc8c3ZnIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMi4yIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSI5Ii8+PHBhdGggZD0iTTEyIDd2NWwzIDIiLz48L3N2Zz4nLAogIHdhcm46ICc8c3ZnIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMi4yIj48cGF0aCBkPSJNMTIgM2wxMCAxOEgyeiIvPjxwYXRoIGQ9Ik0xMiAxMHY1TTEyIDE4di41Ii8+PC9zdmc+JywKICBkb3duOiAnPHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjIuNCI+PHBhdGggZD0iTTEyIDR2MTFtMCAwbC01LTVtNSA1bDUtNU01IDIwaDE0Ii8+PC9zdmc+JywKICBzeW5jOiAnPHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjIuMiI+PHBhdGggZD0iTTIwIDExYTggOCAwIDAwLTE0LjktM000IDV2NGg0TTQgMTNhOCA4IDAgMDAxNC45IDNNMjAgMTl2LTRoLTQiLz48L3N2Zz4nLAogIHg6ICc8c3ZnIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjE0IiBoZWlnaHQ9IjE0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyLjYiPjxwYXRoIGQ9Ik02IDZsMTIgMTJNMTggNkw2IDE4Ii8+PC9zdmc+JywKICBib3g6ICc8c3ZnIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMiI+PHJlY3QgeD0iMyIgeT0iNCIgd2lkdGg9IjE4IiBoZWlnaHQ9IjE2IiByeD0iMyIvPjxwYXRoIGQ9Ik0zIDloMTgiLz48L3N2Zz4nLAp9Owpjb25zdCBwaWxsSWNvbiA9IHsgcmVhZHk6IEkuY2hlY2ssIGJsb2NrZWQ6IEkubG9jaywgcHJpbnRlZDogSS5wcmludCwgd2FpdGluZzogSS5jbG9jaywgZXJyb3I6IEkud2FybiwgY2FuY2VsbGVkOiBJLnggfTsKCmxldCBtZSA9IG51bGwsIHRhYiA9IG51bGwsIG9yZGVycyA9IFtdLCBzZWxsZXJzID0gW10sIHNlbGVjdGVkID0gbmV3IFNldCgpLCBrbm93blJlYWR5ID0gbmV3IFNldCgpLCBmaXJzdExvYWQgPSB0cnVlOwpjb25zdCB1aSA9IHsgdGFiOiAncmVhZHknLCBtazogJ2FsbCcsIHNlbGxlcjogJ2FsbCcsIHE6ICcnLCBhZG1pblNlbGxlcjogc3RvcmUuZ2V0KCdhZG1pblNlbGxlcicsIG51bGwpIH07CgpmdW5jdGlvbiB0b2FzdChtc2csIG1zID0gMjgwMCkgeyBjb25zdCB0ID0gJCgnI3RvYXN0Jyk7IHQudGV4dENvbnRlbnQgPSBtc2c7IHQuaGlkZGVuID0gZmFsc2U7IGNsZWFyVGltZW91dCh0Ll90KTsgdC5fdCA9IHNldFRpbWVvdXQoKCkgPT4gdC5oaWRkZW4gPSB0cnVlLCBtcyk7IH0KYXN5bmMgZnVuY3Rpb24gYXBpKHBhdGgsIG9wdHMgPSB7fSkgewogIGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoKHBhdGgsIHsgY3JlZGVudGlhbHM6ICdzYW1lLW9yaWdpbicsIC4uLm9wdHMsIGhlYWRlcnM6IHsgJ2NvbnRlbnQtdHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJywgLi4uKG9wdHMuaGVhZGVycyB8fCB7fSkgfSwgYm9keTogb3B0cy5ib2R5ICYmIHR5cGVvZiBvcHRzLmJvZHkgIT09ICdzdHJpbmcnID8gSlNPTi5zdHJpbmdpZnkob3B0cy5ib2R5KSA6IG9wdHMuYm9keSB9KTsKICBpZiAocmVzLnN0YXR1cyA9PT0gNDAxICYmICFwYXRoLmluY2x1ZGVzKCcvbG9naW4nKSkgeyBtZSA9IG51bGw7IHJlbmRlckxvZ2luKCk7IHRocm93IG5ldyBFcnJvcignU2VzacOzbiB2ZW5jaWRhJyk7IH0KICBjb25zdCBjdCA9IHJlcy5oZWFkZXJzLmdldCgnY29udGVudC10eXBlJykgfHwgJyc7CiAgaWYgKCFyZXMub2spIHsgY29uc3QgZSA9IGN0LmluY2x1ZGVzKCdqc29uJykgPyAoYXdhaXQgcmVzLmpzb24oKSkuZXJyb3IgOiBhd2FpdCByZXMudGV4dCgpOyB0aHJvdyBuZXcgRXJyb3IoZSB8fCAnRXJyb3InKTsgfQogIHJldHVybiBjdC5pbmNsdWRlcygnanNvbicpID8gcmVzLmpzb24oKSA6IHJlczsKfQpmdW5jdGlvbiBzZWxsZXJRUygpIHsgcmV0dXJuIG1lLnVzZXIucm9sZSA9PT0gJ2FkbWluJyAmJiB1aS5hZG1pblNlbGxlciA/IGA/c2VsbGVyX2lkPSR7dWkuYWRtaW5TZWxsZXJ9YCA6ICcnOyB9CmZ1bmN0aW9uIGZtdFRpbWUocykgeyBpZiAoIXMpIHJldHVybiAnJzsgY29uc3QgZCA9IG5ldyBEYXRlKHMuaW5jbHVkZXMoJ1QnKSA/IHMgOiBzLnJlcGxhY2UoJyAnLCAnVCcpICsgJ1onKTsgcmV0dXJuIGQudG9Mb2NhbGVTdHJpbmcoJ2VzLUNMJywgeyBkYXk6ICcyLWRpZ2l0JywgbW9udGg6ICcyLWRpZ2l0JywgaG91cjogJzItZGlnaXQnLCBtaW51dGU6ICcyLWRpZ2l0JyB9KTsgfQoKLy8gLS0tLS0tLS0tLSBpbHVzdHJhY2lvbmVzIC0tLS0tLS0tLS0KY29uc3QgSEVST19TVkcgPSBgPHN2ZyB2aWV3Qm94PSIwIDAgNTIwIDIzMCIgYXJpYS1oaWRkZW49InRydWUiPgo8cmVjdCB3aWR0aD0iNTIwIiBoZWlnaHQ9IjIzMCIgcng9IjI2IiBmaWxsPSJ2YXIoLS1iZzIpIi8+CjxnIGZvbnQtZmFtaWx5PSJCYWxvbyAyLCBzYW5zLXNlcmlmIiBmb250LXdlaWdodD0iODAwIiBmb250LXNpemU9IjE0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj4KPHJlY3QgeD0iMjIiIHk9IjI2IiB3aWR0aD0iMTEyIiBoZWlnaHQ9IjQ0IiByeD0iMTIiIGZpbGw9InZhcigtLW1sKSIvPjx0ZXh0IHg9Ijc4IiB5PSI1MyIgZmlsbD0idmFyKC0tbWwtaW5rKSI+TWVyY2FkbyBMaWJyZTwvdGV4dD4KPHJlY3QgeD0iMjIiIHk9IjkzIiB3aWR0aD0iMTEyIiBoZWlnaHQ9IjQ0IiByeD0iMTIiIGZpbGw9InZhcigtLWZhKSIvPjx0ZXh0IHg9Ijc4IiB5PSIxMjAiIGZpbGw9InZhcigtLWZhLWluaykiPkZhbGFiZWxsYTwvdGV4dD4KPHJlY3QgeD0iMjIiIHk9IjE2MCIgd2lkdGg9IjExMiIgaGVpZ2h0PSI0NCIgcng9IjEyIiBmaWxsPSJ2YXIoLS1wYSkiLz48dGV4dCB4PSI3OCIgeT0iMTg3IiBmaWxsPSIjZmZmIj5QYXJpczwvdGV4dD48L2c+CjxnIHN0cm9rZT0idmFyKC0tc2t5KSIgc3Ryb2tlLXdpZHRoPSIzIiBmaWxsPSJub25lIiBzdHJva2UtZGFzaGFycmF5PSI2IDciIHN0cm9rZS1saW5lY2FwPSJyb3VuZCI+PHBhdGggZD0iTTEzNCA0OCBDIDE3NSA0OCwgMTc1IDExNSwgMjEwIDExNSIvPjxwYXRoIGQ9Ik0xMzQgMTE1IEgyMTAiLz48cGF0aCBkPSJNMTM0IDE4MiBDIDE3NSAxODIsIDE3NSAxMTUsIDIxMCAxMTUiLz48L2c+CjxyZWN0IHg9IjIxMCIgeT0iNzAiIHdpZHRoPSIxMDQiIGhlaWdodD0iOTAiIHJ4PSIyMCIgZmlsbD0idmFyKC0tYWNjZW50KSIvPgo8cmVjdCB4PSIyMjYiIHk9Ijg4IiB3aWR0aD0iNzIiIGhlaWdodD0iMTIiIHJ4PSI2IiBmaWxsPSIjZmZmIiBvcGFjaXR5PSIuOSIvPjxyZWN0IHg9IjIyNiIgeT0iMTA3IiB3aWR0aD0iNTIiIGhlaWdodD0iMTAiIHJ4PSI1IiBmaWxsPSIjZmZmIiBvcGFjaXR5PSIuNiIvPgo8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyMzIsMTI2KSI+PHJlY3Qgd2lkdGg9IjIyIiBoZWlnaHQ9IjIyIiByeD0iNiIgZmlsbD0iI2ZmZiIvPjxwYXRoIGQ9Ik02IDExbDQgNCA3LTgiIHN0cm9rZT0idmFyKC0tb2spIiBzdHJva2Utd2lkdGg9IjMiIGZpbGw9Im5vbmUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjwvZz4KPGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMjY0LDEyNikiPjxyZWN0IHdpZHRoPSIyMiIgaGVpZ2h0PSIyMiIgcng9IjYiIGZpbGw9IiNmZmYiLz48cmVjdCB4PSI2IiB5PSIxMCIgd2lkdGg9IjEwIiBoZWlnaHQ9IjgiIHJ4PSIyIiBmaWxsPSJ2YXIoLS1sb2NrKSIvPjxwYXRoIGQ9Ik04IDEwVjhhMyAzIDAgMDE2IDB2MiIgc3Ryb2tlPSJ2YXIoLS1sb2NrKSIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSJub25lIi8+PC9nPgo8cGF0aCBkPSJNMzE0IDExNSBIMzU2IiBzdHJva2U9InZhcigtLXNreSkiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWRhc2hhcnJheT0iNiA3IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KPHBhdGggZD0iTTM2MiA5OCBMNDI0IDcwIEw0ODYgOTggVjE3OCBIMzYyIFoiIGZpbGw9InZhcigtLXN1cmZhY2UpIiBzdHJva2U9InZhcigtLWxpbmUpIiBzdHJva2Utd2lkdGg9IjIiLz4KPHJlY3QgeD0iMzg4IiB5PSIxMjQiIHdpZHRoPSI3MiIgaGVpZ2h0PSI1NCIgcng9IjQiIGZpbGw9InZhcigtLWljZSkiLz4KPGcgZmlsbD0idmFyKC0tc2t5KSI+PHJlY3QgeD0iMzk2IiB5PSIxNDQiIHdpZHRoPSIyNCIgaGVpZ2h0PSIxNiIgcng9IjIiLz48cmVjdCB4PSI0MjQiIHk9IjE0NCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjE2IiByeD0iMiIvPjxyZWN0IHg9IjQxMCIgeT0iMTMwIiB3aWR0aD0iMjQiIGhlaWdodD0iMTQiIHJ4PSIyIi8+PC9nPgo8ZyBjbGFzcz0idHJ1Y2siPjxyZWN0IHg9IjM3MiIgeT0iMTg4IiB3aWR0aD0iNTgiIGhlaWdodD0iMjQiIHJ4PSI1IiBmaWxsPSJ2YXIoLS1hY2NlbnQtc3Ryb25nKSIvPjxwYXRoIGQ9Ik00MzAgMTk0IGgxOCBsMTAgMTAgdjggaC0yOHoiIGZpbGw9InZhcigtLWFjY2VudCkiLz48Y2lyY2xlIGN4PSIzODgiIGN5PSIyMTQiIHI9IjYiIGZpbGw9InZhcigtLWluaykiLz48Y2lyY2xlIGN4PSI0NDYiIGN5PSIyMTQiIHI9IjYiIGZpbGw9InZhcigtLWluaykiLz48L2c+PC9zdmc+YDsKY29uc3QgRU1QVFlfU1ZHID0gYDxzdmcgdmlld0JveD0iMCAwIDE0MCAxMDAiIGFyaWEtaGlkZGVuPSJ0cnVlIj48cmVjdCB4PSIyMCIgeT0iMzAiIHdpZHRoPSIxMDAiIGhlaWdodD0iNjIiIHJ4PSIxMCIgZmlsbD0idmFyKC0taWNlKSIvPjxwYXRoIGQ9Ik0yMCA0NmgxMDAiIHN0cm9rZT0idmFyKC0tc2t5KSIgc3Ryb2tlLXdpZHRoPSIzIi8+PHJlY3QgeD0iMzYiIHk9IjU4IiB3aWR0aD0iNDAiIGhlaWdodD0iNyIgcng9IjMuNSIgZmlsbD0idmFyKC0tc2t5KSIvPjxyZWN0IHg9IjM2IiB5PSI3MSIgd2lkdGg9IjI2IiBoZWlnaHQ9IjciIHJ4PSIzLjUiIGZpbGw9InZhcigtLXNreSkiIG9wYWNpdHk9Ii42Ii8+PGNpcmNsZSBjeD0iMTA0IiBjeT0iMjIiIHI9IjE0IiBmaWxsPSJ2YXIoLS1vaykiLz48cGF0aCBkPSJNOTcgMjJsNSA1IDktMTAiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIzLjQiIGZpbGw9Im5vbmUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjwvc3ZnPmA7CmNvbnN0IFJVTEVfU1ZHID0gYDxzdmcgdmlld0JveD0iMCAwIDEzMCA4MCIgYXJpYS1oaWRkZW49InRydWUiPjxyZWN0IHg9IjQiIHk9IjEwIiB3aWR0aD0iNzgiIGhlaWdodD0iNjIiIHJ4PSIxMCIgZmlsbD0idmFyKC0tc3VyZmFjZSkiIHN0cm9rZT0idmFyKC0tbGluZSkiIHN0cm9rZS13aWR0aD0iMiIvPjxyZWN0IHg9IjE0IiB5PSIyMiIgd2lkdGg9IjQ0IiBoZWlnaHQ9IjgiIHJ4PSI0IiBmaWxsPSJ2YXIoLS1vaykiLz48cmVjdCB4PSIxNCIgeT0iMzYiIHdpZHRoPSI0NCIgaGVpZ2h0PSI4IiByeD0iNCIgZmlsbD0idmFyKC0tb2spIi8+PHJlY3QgeD0iMTQiIHk9IjUwIiB3aWR0aD0iNDQiIGhlaWdodD0iOCIgcng9IjQiIGZpbGw9InZhcigtLWxvY2spIi8+PHBhdGggZD0iTTg4IDQxaDE0IiBzdHJva2U9InZhcigtLW11dGVkKSIgc3Ryb2tlLXdpZHRoPSIyLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjxwYXRoIGQ9Ik05OCAzNmw1IDUtNSA1IiBzdHJva2U9InZhcigtLW11dGVkKSIgc3Ryb2tlLXdpZHRoPSIyLjUiIGZpbGw9Im5vbmUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjxyZWN0IHg9IjEwNiIgeT0iMjgiIHdpZHRoPSIyMCIgaGVpZ2h0PSIyNiIgcng9IjUiIGZpbGw9InZhcigtLWxvY2spIi8+PHJlY3QgeD0iMTExIiB5PSI0MCIgd2lkdGg9IjEwIiBoZWlnaHQ9IjkiIHJ4PSIyIiBmaWxsPSIjZmZmIi8+PHBhdGggZD0iTTExMyA0MHYtM2EzIDMgMCAwMTYgMHYzIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iMiIgZmlsbD0ibm9uZSIvPjwvc3ZnPmA7CgovLyAtLS0tLS0tLS0tIGxvZ2luIC0tLS0tLS0tLS0KZnVuY3Rpb24gcmVuZGVyTG9naW4oZGVtbykgewogICQoJyNhcHAnKS5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz0ibG9naW4iPjxkaXYgY2xhc3M9ImNhcmQiPgogICAgPGRpdiBjbGFzcz0iYXJ0Ij4ke0hFUk9fU1ZHfTwvZGl2PgogICAgPGZvcm0gaWQ9ImxvZ2luRm9ybSI+CiAgICAgIDxoMT5FdGlxdWV0YUh1YjwvaDE+CiAgICAgIDxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9Im1hcmdpbjowIj5FdGlxdWV0YXMgZGUgTWVyY2FkbyBMaWJyZSwgRmFsYWJlbGxhIHkgUGFyaXMgZW4gdW5hIHNvbGEgYmFuZGVqYS48L3A+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+Q29ycmVvPGlucHV0IHR5cGU9ImVtYWlsIiBpZD0ibEVtYWlsIiBhdXRvY29tcGxldGU9InVzZXJuYW1lIiByZXF1aXJlZD48L2xhYmVsPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPkNvbnRyYXNlw7FhPGlucHV0IHR5cGU9InBhc3N3b3JkIiBpZD0ibFBhc3MiIGF1dG9jb21wbGV0ZT0iY3VycmVudC1wYXNzd29yZCIgcmVxdWlyZWQ+PC9sYWJlbD4KICAgICAgPGRpdiBjbGFzcz0iZXJyIiBpZD0ibEVyciI+PC9kaXY+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgdHlwZT0ic3VibWl0Ij5FbnRyYXI8L2J1dHRvbj4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIiB0eXBlPSJidXR0b24iIGlkPSJmb3Jnb3QiPsK/T2x2aWRhc3RlIHR1IGNvbnRyYXNlw7FhPzwvYnV0dG9uPgogICAgICA8cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJtYXJnaW46MDtmb250LXNpemU6MTIuNXB4O3RleHQtYWxpZ246Y2VudGVyIj7Cv1RpZW5lcyB1bmEgY2xhdmUgZGUgcmVzcGFsZG8gKFJTUC3igKYpPyBFc2Nyw61iZWxhIGVuIENvbnRyYXNlw7FhLjwvcD4KICAgICAgJHtkZW1vID8gJzxkaXYgY2xhc3M9ImRlbW8taGludCI+TW9kbyBkZW1vOiBlbnRyYSBjb24gPGI+Ym9kZWdhQGRlbW8uY2w8L2I+LCA8Yj52ZW5kZWRvcjFAZGVtby5jbDwvYj4gbyA8Yj5hZG1pbkBkZW1vLmNsPC9iPiwgY2xhdmUgPGI+ZGVtbzEyMzQ8L2I+LjwvZGl2PicgOiAnJ30KICAgIDwvZm9ybT48L2Rpdj48L2Rpdj5gOwogICQoJyNsb2dpbkZvcm0nKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4gewogICAgZS5wcmV2ZW50RGVmYXVsdCgpOwogICAgJCgnI2xFcnInKS50ZXh0Q29udGVudCA9ICcnOwogICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL2xvZ2luJywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBlbWFpbDogJCgnI2xFbWFpbCcpLnZhbHVlLCBwYXNzd29yZDogJCgnI2xQYXNzJykudmFsdWUgfSB9KTsgYm9vdCgpOyB9CiAgICBjYXRjaCAoZXJyKSB7ICQoJyNsRXJyJykudGV4dENvbnRlbnQgPSBlcnIubWVzc2FnZTsgfQogIH07CiAgJCgnI2ZvcmdvdCcpLm9uY2xpY2sgPSAoKSA9PiByZW5kZXJGb3Jnb3QoJCgnI2xFbWFpbCcpLnZhbHVlKTsKfQoKLy8gUmVjdXBlcmFyIGNvbnRyYXNlw7FhOiBjb3JyZW8gLT4gY8OzZGlnbyBkZSA2IGTDrWdpdG9zIC0+IGVudHJhciBvIGNhbWJpYXIgY29udHJhc2XDsWEKZnVuY3Rpb24gcmVuZGVyRm9yZ290KHByZWZpbGwgPSAnJykgewogIGxldCBlbWFpbCA9IHByZWZpbGwsIGNvZGUgPSAnJzsKICBjb25zdCBzaGVsbCA9IGlubmVyID0+IHsgJCgnI2FwcCcpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJsb2dpbiI+PGRpdiBjbGFzcz0iY2FyZCI+PGRpdiBjbGFzcz0iYXJ0Ij4ke0hFUk9fU1ZHfTwvZGl2Pjxmb3JtIGlkPSJmRm9ybSI+JHtpbm5lcn08ZGl2IGNsYXNzPSJlcnIiIGlkPSJmRXJyIj48L2Rpdj48L2Zvcm0+PC9kaXY+PC9kaXY+YDsgfTsKICBjb25zdCBiYWNrID0gKCkgPT4geyBjb25zdCBiID0gJCgnI2ZCYWNrJyk7IGlmIChiKSBiLm9uY2xpY2sgPSAoKSA9PiByZW5kZXJMb2dpbigpOyB9OwogIGNvbnN0IGVyciA9IG0gPT4geyAkKCcjZkVycicpLnRleHRDb250ZW50ID0gbTsgfTsKICBmdW5jdGlvbiBzdGVwRW1haWwoKSB7CiAgICBzaGVsbChgPGgxPlJlY3VwZXJhciBhY2Nlc288L2gxPjxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9Im1hcmdpbjowIj5Fc2NyaWJlIHR1IGNvcnJlbyB5IHRlIGVudmlhcmVtb3MgdW4gY8OzZGlnbyBkZSA2IGTDrWdpdG9zLjwvcD4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5Db3JyZW88aW5wdXQgdHlwZT0iZW1haWwiIGlkPSJmRW1haWwiIGF1dG9jb21wbGV0ZT0idXNlcm5hbWUiIHJlcXVpcmVkIHZhbHVlPSIke2VzYyhlbWFpbCl9Ij48L2xhYmVsPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIHR5cGU9InN1Ym1pdCI+RW52aWFyIGPDs2RpZ288L2J1dHRvbj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUiIHR5cGU9ImJ1dHRvbiIgaWQ9ImZCYWNrIj5Wb2x2ZXI8L2J1dHRvbj5gKTsKICAgIGJhY2soKTsKICAgICQoJyNmRm9ybScpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICAgIGUucHJldmVudERlZmF1bHQoKTsgZW1haWwgPSAkKCcjZkVtYWlsJykudmFsdWUudHJpbSgpOwogICAgICBjb25zdCBiID0gZS5zdWJtaXR0ZXI7IGlmIChiKSBiLmRpc2FibGVkID0gdHJ1ZTsKICAgICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL3Bhc3N3b3JkL2ZvcmdvdCcsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgZW1haWwgfSB9KTsgc3RlcENvZGUoKTsgfQogICAgICBjYXRjaCAoeCkgeyBlcnIoeC5tZXNzYWdlKTsgaWYgKGIpIGIuZGlzYWJsZWQgPSBmYWxzZTsgfQogICAgfTsKICB9CiAgZnVuY3Rpb24gc3RlcENvZGUoKSB7CiAgICBzaGVsbChgPGgxPlJldmlzYSB0dSBjb3JyZW88L2gxPjxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9Im1hcmdpbjowIj5TaSA8Yj4ke2VzYyhlbWFpbCl9PC9iPiBlc3TDoSByZWdpc3RyYWRvLCB0ZSBsbGVnw7MgdW4gY8OzZGlnbyBkZSA2IGTDrWdpdG9zLiBWZW5jZSBlbiAxNSBtaW51dG9zLiBSZXZpc2EgdGFtYmnDqW4gbGEgY2FycGV0YSBkZSBzcGFtLjwvcD4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5Dw7NkaWdvPGlucHV0IHR5cGU9InRleHQiIGlkPSJmQ29kZSIgaW5wdXRtb2RlPSJudW1lcmljIiBhdXRvY29tcGxldGU9Im9uZS10aW1lLWNvZGUiIG1heGxlbmd0aD0iNiIgcGF0dGVybj0iWzAtOV17Nn0iIHJlcXVpcmVkIHN0eWxlPSJmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6MjRweDtsZXR0ZXItc3BhY2luZzo4cHg7dGV4dC1hbGlnbjpjZW50ZXIiPjwvbGFiZWw+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgdHlwZT0ic3VibWl0Ij5Db250aW51YXI8L2J1dHRvbj4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIiB0eXBlPSJidXR0b24iIGlkPSJmUmVzZW5kIj5FbnZpYXIgb3RybyBjw7NkaWdvPC9idXR0b24+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIiB0eXBlPSJidXR0b24iIGlkPSJmQmFjayI+Vm9sdmVyPC9idXR0b24+YCk7CiAgICBiYWNrKCk7CiAgICAkKCcjZkNvZGUnKS5mb2N1cygpOwogICAgJCgnI2ZSZXNlbmQnKS5vbmNsaWNrID0gYXN5bmMgKCkgPT4geyB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvcGFzc3dvcmQvZm9yZ290JywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBlbWFpbCB9IH0pOyB0b2FzdCgnQ8OzZGlnbyByZWVudmlhZG8nKTsgfSBjYXRjaCAoeCkgeyBlcnIoeC5tZXNzYWdlKTsgfSB9OwogICAgJCgnI2ZGb3JtJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpOyBjb2RlID0gJCgnI2ZDb2RlJykudmFsdWUudHJpbSgpOwogICAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvcGFzc3dvcmQvY2hlY2snLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGVtYWlsLCBjb2RlIH0gfSk7IHN0ZXBDaG9vc2UoKTsgfQogICAgICBjYXRjaCAoeCkgeyBlcnIoeC5tZXNzYWdlKTsgfQogICAgfTsKICB9CiAgZnVuY3Rpb24gc3RlcENob29zZSgpIHsKICAgIHNoZWxsKGA8aDE+Q8OzZGlnbyBjb3JyZWN0bzwvaDE+PHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjAiPsK/UXXDqSBxdWllcmVzIGhhY2VyPzwvcD4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJidXR0b24iIGlkPSJmTG9naW4iPkVudHJhciBhaG9yYTwvYnV0dG9uPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWdob3N0IiB0eXBlPSJidXR0b24iIGlkPSJmQ2hhbmdlIj5DYW1iaWFyIG1pIGNvbnRyYXNlw7FhPC9idXR0b24+YCk7CiAgICAkKCcjZkxvZ2luJykub25jbGljayA9IGFzeW5jICgpID0+IHsgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL3Bhc3N3b3JkL2xvZ2luJywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBlbWFpbCwgY29kZSB9IH0pOyBib290KCk7IH0gY2F0Y2ggKHgpIHsgZXJyKHgubWVzc2FnZSk7IH0gfTsKICAgICQoJyNmQ2hhbmdlJykub25jbGljayA9IHN0ZXBOZXc7CiAgfQogIGZ1bmN0aW9uIHN0ZXBOZXcoKSB7CiAgICBzaGVsbChgPGgxPk51ZXZhIGNvbnRyYXNlw7FhPC9oMT4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5OdWV2YSBjb250cmFzZcOxYSAobcOtbmltbyA4KTxpbnB1dCB0eXBlPSJwYXNzd29yZCIgaWQ9ImZQMSIgYXV0b2NvbXBsZXRlPSJuZXctcGFzc3dvcmQiIG1pbmxlbmd0aD0iOCIgcmVxdWlyZWQ+PC9sYWJlbD4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5SZXDDrXRlbGE8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJmUDIiIGF1dG9jb21wbGV0ZT0ibmV3LXBhc3N3b3JkIiBtaW5sZW5ndGg9IjgiIHJlcXVpcmVkPjwvbGFiZWw+CiAgICAgIDxsYWJlbCBjbGFzcz0ic3dpdGNoIiBzdHlsZT0iZm9udC1zaXplOjEzcHgiPjxpbnB1dCB0eXBlPSJjaGVja2JveCIgaWQ9ImZTaG93Ij4gTW9zdHJhciBjb250cmFzZcOxYTwvbGFiZWw+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgdHlwZT0ic3VibWl0Ij5HdWFyZGFyIHkgZW50cmFyPC9idXR0b24+YCk7CiAgICAkKCcjZlNob3cnKS5vbmNoYW5nZSA9IGUgPT4geyAkKCcjZlAxJykudHlwZSA9ICQoJyNmUDInKS50eXBlID0gZS50YXJnZXQuY2hlY2tlZCA/ICd0ZXh0JyA6ICdwYXNzd29yZCc7IH07CiAgICAkKCcjZkZvcm0nKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4gewogICAgICBlLnByZXZlbnREZWZhdWx0KCk7CiAgICAgIGlmICgkKCcjZlAxJykudmFsdWUgIT09ICQoJyNmUDInKS52YWx1ZSkgcmV0dXJuIGVycignTGFzIGNvbnRyYXNlw7FhcyBubyBjb2luY2lkZW4nKTsKICAgICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL3Bhc3N3b3JkL3Jlc2V0JywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBlbWFpbCwgY29kZSwgcGFzc3dvcmQ6ICQoJyNmUDEnKS52YWx1ZSB9IH0pOyB0b2FzdCgnQ29udHJhc2XDsWEgYWN0dWFsaXphZGEnKTsgYm9vdCgpOyB9CiAgICAgIGNhdGNoICh4KSB7IGVycih4Lm1lc3NhZ2UpOyB9CiAgICB9OwogIH0KICBzdGVwRW1haWwoKTsKfQoKZnVuY3Rpb24gcmVuZGVyU2V0dXAoKSB7CiAgJCgnI2FwcCcpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJsb2dpbiI+PGRpdiBjbGFzcz0iY2FyZCI+CiAgICA8ZGl2IGNsYXNzPSJhcnQiPiR7SEVST19TVkd9PC9kaXY+CiAgICA8Zm9ybSBpZD0ic2V0dXBGb3JtIj4KICAgICAgPGgxPkJpZW52ZW5pZG88L2gxPgogICAgICA8cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJtYXJnaW46MCI+Q3JlYSBsYSBjdWVudGEgZGUgYWRtaW5pc3RyYWRvci4gQ29uIGVsbGEgYWdyZWdhcyB2ZW5kZWRvcmVzLCB1c3VhcmlvcyB5IGxhIGNvbmV4acOzbiBhIE1lcmNhZG8gTGlicmUuPC9wPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPlR1IG5vbWJyZTxpbnB1dCB0eXBlPSJ0ZXh0IiBpZD0ic05hbWUiIHJlcXVpcmVkPjwvbGFiZWw+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+Q29ycmVvPGlucHV0IHR5cGU9ImVtYWlsIiBpZD0ic0VtYWlsIiBhdXRvY29tcGxldGU9InVzZXJuYW1lIiByZXF1aXJlZD48L2xhYmVsPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPkNvbnRyYXNlw7FhIChtw61uaW1vIDgpPGlucHV0IHR5cGU9InBhc3N3b3JkIiBpZD0ic1Bhc3MiIGF1dG9jb21wbGV0ZT0ibmV3LXBhc3N3b3JkIiBtaW5sZW5ndGg9IjgiIHJlcXVpcmVkPjwvbGFiZWw+CiAgICAgIDxsYWJlbCBjbGFzcz0ic3dpdGNoIiBzdHlsZT0iZm9udC1zaXplOjEzcHgiPjxpbnB1dCB0eXBlPSJjaGVja2JveCIgaWQ9InNTaG93Ij4gTW9zdHJhciBjb250cmFzZcOxYTwvbGFiZWw+CiAgICAgIDxkaXYgY2xhc3M9ImVyciIgaWQ9InNFcnIiPjwvZGl2PgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIHR5cGU9InN1Ym1pdCI+Q3JlYXIgYWRtaW5pc3RyYWRvcjwvYnV0dG9uPgogICAgPC9mb3JtPjwvZGl2PjwvZGl2PmA7CiAgJCgnI3NTaG93Jykub25jaGFuZ2UgPSBlID0+IHsgJCgnI3NQYXNzJykudHlwZSA9IGUudGFyZ2V0LmNoZWNrZWQgPyAndGV4dCcgOiAncGFzc3dvcmQnOyB9OwogICQoJyNzZXR1cEZvcm0nKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4gewogICAgZS5wcmV2ZW50RGVmYXVsdCgpOwogICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL3NldHVwJywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBuYW1lOiAkKCcjc05hbWUnKS52YWx1ZSwgZW1haWw6ICQoJyNzRW1haWwnKS52YWx1ZSwgcGFzc3dvcmQ6ICQoJyNzUGFzcycpLnZhbHVlIH0gfSk7IGJvb3QoKTsgfQogICAgY2F0Y2ggKGVycikgeyAkKCcjc0VycicpLnRleHRDb250ZW50ID0gZXJyLm1lc3NhZ2U7IH0KICB9Owp9CgovLyAtLS0tLS0tLS0tIGVzdHJ1Y3R1cmEgLS0tLS0tLS0tLQpmdW5jdGlvbiB0YWJzRm9yKHJvbGUpIHsKICBpZiAocm9sZSA9PT0gJ3NlbGxlcicpIHJldHVybiBbWydzZWxsZXInLCAnTWkgY3VlbnRhJ11dOwogIGlmIChyb2xlID09PSAnZnVsZmlsbG1lbnQnKSByZXR1cm4gW1sndHJheScsICdCYW5kZWphIGRlIGV0aXF1ZXRhcyddXTsKICByZXR1cm4gW1sndHJheScsICdCYW5kZWphJ10sIFsnc2VsbGVyJywgJ1ZlbmRlZG9yZXMnXSwgWydhZG1pbicsICdVc3VhcmlvcyB5IGFqdXN0ZXMnXV07Cn0KZnVuY3Rpb24gcmVuZGVyU2hlbGwoKSB7CiAgY29uc3QgdGFicyA9IHRhYnNGb3IobWUudXNlci5yb2xlKTsKICBpZiAoIXRhYiB8fCAhdGFicy5zb21lKHQgPT4gdFswXSA9PT0gdGFiKSkgdGFiID0gc3RvcmUuZ2V0KCd0YWInLCB0YWJzWzBdWzBdKTsKICBpZiAoIXRhYnMuc29tZSh0ID0+IHRbMF0gPT09IHRhYikpIHRhYiA9IHRhYnNbMF1bMF07CiAgJCgnI2FwcCcpLmlubmVySFRNTCA9IGAKICA8aGVhZGVyIGNsYXNzPSJ0b3AiPjxkaXYgY2xhc3M9IndyYXAiPgogICAgPGEgY2xhc3M9ImJyYW5kIiBocmVmPSIvIj48aW1nIHNyYz0iL2xvZ28uc3ZnIiBhbHQ9IiI+RXRpcXVldGFIdWI8L2E+CiAgICAke3RhYnMubGVuZ3RoID4gMSA/IGA8bmF2IGNsYXNzPSJuYXYiPiR7dGFicy5tYXAoKFtrLCBuXSkgPT4gYDxidXR0b24gZGF0YS10YWI9IiR7a30iIGFyaWEtY3VycmVudD0iJHtrID09PSB0YWJ9Ij4ke259PC9idXR0b24+YCkuam9pbignJyl9PC9uYXY+YCA6ICcnfQogICAgPHNwYW4gY2xhc3M9InNwYWNlciI+PC9zcGFuPgogICAgPHNwYW4gY2xhc3M9ImxpdmUiIGlkPSJsaXZlIj48aT48L2k+PHNwYW4+Q29uZWN0YW5kb+KApjwvc3Bhbj48L3NwYW4+CiAgICA8ZGl2IGNsYXNzPSJjbG9jayIgaWQ9ImNsb2NrIj4ke0kuY2xvY2sucmVwbGFjZSgnPHN2ZycsICc8c3ZnIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgc3R5bGU9ImNvbG9yOnZhcigtLWFjY2VudCkiJyl9PGRpdj48c21hbGw+Q29ydGUgJHtlc2MobWUuY3V0b2ZmKX08L3NtYWxsPjxiIGlkPSJjZCI+LS06LS06LS08L2I+PC9kaXY+PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJ1c2VyIj48ZGl2PjxiPiR7ZXNjKG1lLnNlbGxlcj8ubmFtZSB8fCBtZS51c2VyLm5hbWUpfTwvYj48c21hbGw+JHtlc2MobWUudXNlci5lbWFpbCl9PC9zbWFsbD48L2Rpdj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBpZD0ibXlBY2MiPk1pIGNsYXZlPC9idXR0b24+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgaWQ9ImxvZ291dCI+U2FsaXI8L2J1dHRvbj48L2Rpdj4KICA8L2Rpdj48L2hlYWRlcj4KICA8bWFpbiBjbGFzcz0id3JhcCIgaWQ9Im1haW4iPjwvbWFpbj5gOwogICQkKCcubmF2IGJ1dHRvbicpLmZvckVhY2goYiA9PiBiLm9uY2xpY2sgPSAoKSA9PiB7IHRhYiA9IGIuZGF0YXNldC50YWI7IHN0b3JlLnNldCgndGFiJywgdGFiKTsgJCQoJy5uYXYgYnV0dG9uJykuZm9yRWFjaCh4ID0+IHguc2V0QXR0cmlidXRlKCdhcmlhLWN1cnJlbnQnLCB4ID09PSBiKSk7IHJlbmRlclRhYigpOyB9KTsKICAkKCcjbXlBY2MnKS5vbmNsaWNrID0gKCkgPT4gcmVuZGVyTXlBY2NvdW50KCk7CiAgaWYgKG1lLmltcGVyc29uYXRlZEJ5KSB7CiAgICBjb25zdCBiYXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTsKICAgIGJhci5zdHlsZS5jc3NUZXh0ID0gJ2JhY2tncm91bmQ6dmFyKC0td2Fybi1iZyk7Y29sb3I6dmFyKC0td2Fybik7Zm9udC13ZWlnaHQ6NzAwO3BhZGRpbmc6MTBweCAxNnB4O2Rpc3BsYXk6ZmxleDtnYXA6MTJweDthbGlnbi1pdGVtczpjZW50ZXI7anVzdGlmeS1jb250ZW50OmNlbnRlcjtmbGV4LXdyYXA6d3JhcCc7CiAgICBiYXIuaW5uZXJIVE1MID0gYEVzdMOhcyB2aWVuZG8gbGEgY3VlbnRhIGRlICR7ZXNjKG1lLnVzZXIubmFtZSl9ICgke2VzYyhtZS51c2VyLmVtYWlsKX0pIDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSBidG4tc20iIGlkPSJzdG9wSW1wIj5Wb2x2ZXIgYSBtaSBjdWVudGE8L2J1dHRvbj5gOwogICAgJCgnI2FwcCcpLnByZXBlbmQoYmFyKTsKICAgICQoJyNzdG9wSW1wJykub25jbGljayA9IGFzeW5jICgpID0+IHsgYXdhaXQgYXBpKCcvYXBpL2ltcGVyc29uYXRlL3N0b3AnLCB7IG1ldGhvZDogJ1BPU1QnIH0pOyBsb2NhdGlvbi5ocmVmID0gJy8nOyB9OwogIH0KICAkKCcjbG9nb3V0Jykub25jbGljayA9IGFzeW5jICgpID0+IHsgYXdhaXQgYXBpKCcvYXBpL2xvZ291dCcsIHsgbWV0aG9kOiAnUE9TVCcgfSkuY2F0Y2goKCkgPT4ge30pOyBsb2NhdGlvbi5yZWxvYWQoKTsgfTsKICBzdGFydENsb2NrKCk7IGNvbm5lY3RTdHJlYW0oKTsgcmVuZGVyVGFiKCk7Cn0KZnVuY3Rpb24gcmVuZGVyVGFiKCkgeyAoeyB0cmF5OiByZW5kZXJUcmF5LCBzZWxsZXI6IHJlbmRlclNlbGxlciwgYWRtaW46IHJlbmRlckFkbWluIH0pW3RhYl0oKTsgfQoKZnVuY3Rpb24gc3RhcnRDbG9jaygpIHsKICBjb25zdCBbaGgsIG1tXSA9IG1lLmN1dG9mZi5zcGxpdCgnOicpLm1hcChOdW1iZXIpOwogIGNvbnN0IHRpY2sgPSAoKSA9PiB7CiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLCBjdXQgPSBuZXcgRGF0ZShub3cpOyBjdXQuc2V0SG91cnMoaGgsIG1tLCAwLCAwKTsKICAgIGNvbnN0IGMgPSAkKCcjY2xvY2snKTsgaWYgKCFjKSByZXR1cm47CiAgICBpZiAobm93ID49IGN1dCkgeyBjdXQuc2V0RGF0ZShjdXQuZ2V0RGF0ZSgpICsgMSk7IGMuY2xhc3NMaXN0LmFkZCgnbGF0ZScpOyB9IGVsc2UgYy5jbGFzc0xpc3QucmVtb3ZlKCdsYXRlJyk7CiAgICBjb25zdCBkID0gTWF0aC5mbG9vcigoY3V0IC0gbm93KSAvIDEwMDApOwogICAgJCgnI2NkJykudGV4dENvbnRlbnQgPSBbTWF0aC5mbG9vcihkIC8gMzYwMCksIE1hdGguZmxvb3IoZCAlIDM2MDAgLyA2MCksIGQgJSA2MF0ubWFwKHggPT4gU3RyaW5nKHgpLnBhZFN0YXJ0KDIsICcwJykpLmpvaW4oJzonKTsKICB9OwogIHRpY2soKTsgY2xlYXJJbnRlcnZhbChzdGFydENsb2NrLl9pKTsgc3RhcnRDbG9jay5faSA9IHNldEludGVydmFsKHRpY2ssIDEwMDApOwp9CgpsZXQgZXMgPSBudWxsLCByZWZyZXNoVCA9IG51bGw7CmZ1bmN0aW9uIGNvbm5lY3RTdHJlYW0oKSB7CiAgaWYgKGVzKSBlcy5jbG9zZSgpOwogIGVzID0gbmV3IEV2ZW50U291cmNlKCcvYXBpL3N0cmVhbScpOwogIGNvbnN0IGxpdmUgPSBvbiA9PiB7IGNvbnN0IGwgPSAkKCcjbGl2ZScpOyBpZiAoIWwpIHJldHVybjsgbC5jbGFzc0xpc3QudG9nZ2xlKCdvbicsIG9uKTsgbC5sYXN0RWxlbWVudENoaWxkLnRleHRDb250ZW50ID0gb24gPyAnRW4gdml2bycgOiAnUmVjb25lY3RhbmRv4oCmJzsgfTsKICBlcy5vbm9wZW4gPSAoKSA9PiBsaXZlKHRydWUpOwogIGVzLm9uZXJyb3IgPSAoKSA9PiBsaXZlKGZhbHNlKTsKICBlcy5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBldiA9PiB7CiAgICBjb25zdCBkID0gSlNPTi5wYXJzZShldi5kYXRhKTsKICAgIGNsZWFyVGltZW91dChyZWZyZXNoVCk7CiAgICByZWZyZXNoVCA9IHNldFRpbWVvdXQoKCkgPT4geyBpZiAodGFiID09PSAndHJheScpIGxvYWRPcmRlcnMoKTsgZWxzZSBpZiAodGFiID09PSAnc2VsbGVyJyAmJiBbJ29yZGVyJywgJ2xhYmVsJywgJ2Jsb2NrbGlzdCcsICdjb25uZWN0aW9uJywgJ3ByaW50ZWQnXS5pbmNsdWRlcyhkLnR5cGUpKSBsb2FkU2VsbGVyT3JkZXJzKCk7IH0sIDYwMCk7CiAgfSk7Cn0KCi8vIC0tLS0tLS0tLS0gQkFOREVKQSAoZnVsZmlsbG1lbnQpIC0tLS0tLS0tLS0KLy8gLS0tLS0tLS0tLSBCQU5ERUpBIChmdWxmaWxsbWVudCkgLS0tLS0tLS0tLQpjb25zdCBUQUJTID0gWwogIFsncmVhZHknLCAnRXRpcXVldGFzIHBvciBpbXByaW1pcicsICdMaXN0YXMgcGFyYSBpbXByaW1pciBhaG9yYScsIEkucHJpbnRdLAogIFsnd2FpdGluZycsICdFc3BlcmFuZG8gZXRpcXVldGEnLCAnRWwgbWFya2V0cGxhY2UgYcO6biBubyBsYSBsaWJlcmEnLCBJLmNsb2NrXSwKICBbJ3ByaW50ZWQnLCAnRXRpcXVldGFzIGltcHJlc2FzJywgJ1lhIHNlIGltcHJpbWllcm9uJywgSS5jaGVja10sCiAgWydibG9ja2VkJywgJ0Jsb3F1ZWFkYXMnLCAnTGFzIGRlc3BhY2hhIGVsIHZlbmRlZG9yJywgSS5sb2NrXSwKXTsKY29uc3QgdGFiT2YgPSBvID0+IChvLnN0YXRlID09PSAnZXJyb3InID8gJ3dhaXRpbmcnIDogby5zdGF0ZSA9PT0gJ2NhbmNlbGxlZCcgPyBudWxsIDogby5zdGF0ZSk7CmZ1bmN0aW9uIHRzKG8pIHsKICBjb25zdCBzID0gby5zb2xkX2F0IHx8ICcnOwogIGlmIChzKSB7IGNvbnN0IGQgPSBuZXcgRGF0ZShzLmluY2x1ZGVzKCdUJykgPyBzIDogcy5yZXBsYWNlKCcgJywgJ1QnKSk7IGlmICghaXNOYU4oZCkpIHJldHVybiBkOyB9CiAgcmV0dXJuIG5ldyBEYXRlKChvLmNyZWF0ZWRfYXQgfHwgJycpLnJlcGxhY2UoJyAnLCAnVCcpICsgJ1onKTsKfQpmdW5jdGlvbiBkYXlMYWJlbChkKSB7CiAgY29uc3QgdG9kYXkgPSBuZXcgRGF0ZSgpOyB0b2RheS5zZXRIb3VycygwLCAwLCAwLCAwKTsKICBjb25zdCB4ID0gbmV3IERhdGUoZCk7IHguc2V0SG91cnMoMCwgMCwgMCwgMCk7CiAgY29uc3QgZGlmZiA9IE1hdGgucm91bmQoKHRvZGF5IC0geCkgLyA4NjRlNSk7CiAgY29uc3QgZiA9IGQudG9Mb2NhbGVEYXRlU3RyaW5nKCdlcy1DTCcsIHsgd2Vla2RheTogJ2xvbmcnLCBkYXk6ICdudW1lcmljJywgbW9udGg6ICdsb25nJyB9KTsKICByZXR1cm4gZGlmZiA9PT0gMCA/IGBIb3kgwrcgJHtmfWAgOiBkaWZmID09PSAxID8gYEF5ZXIgwrcgJHtmfWAgOiBmLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgZi5zbGljZSgxKTsKfQpjb25zdCBoaG1tID0gZCA9PiBkLnRvTG9jYWxlVGltZVN0cmluZygnZXMtQ0wnLCB7IGhvdXI6ICcyLWRpZ2l0JywgbWludXRlOiAnMi1kaWdpdCcsIGhvdXJDeWNsZTogJ2gyMycgfSk7CgpmdW5jdGlvbiByZW5kZXJUcmF5KCkgewogIGlmICghdWkudGFiKSB1aS50YWIgPSAncmVhZHknOwogIGNvbnN0IGF1dG8gPSBzdG9yZS5nZXQoJ2F1dG8nLCBmYWxzZSk7CiAgJCgnI21haW4nKS5pbm5lckhUTUwgPSBgCiAgPGRpdiBjbGFzcz0ic2VjdGlvbi10aXRsZSIgc3R5bGU9Im1hcmdpbi10b3A6MjJweCI+PGgyPkV0aXF1ZXRhczwvaDI+PHNwYW4gY2xhc3M9Im11dGVkIj5MYXMgbcOhcyBudWV2YXMgYXJyaWJhLiBTZSBhY3R1YWxpemEgc29sYS48L3NwYW4+PC9kaXY+CiAgPGRpdiBjbGFzcz0idGFic2JpZyIgaWQ9InRhYnNCaWciPjwvZGl2PgogIDxkaXYgY2xhc3M9InBhbmVsIj4KICAgIDxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPgogICAgICA8ZGl2IGNsYXNzPSJjaGlwcyIgaWQ9Im1rQ2hpcHMiPjwvZGl2PgogICAgICA8c2VsZWN0IGlkPSJzZWxsZXJGIiBhcmlhLWxhYmVsPSJWZW5kZWRvciIgc3R5bGU9IndpZHRoOmF1dG8iPjwvc2VsZWN0PgogICAgICA8aW5wdXQgdHlwZT0ic2VhcmNoIiBpZD0icSIgcGxhY2Vob2xkZXI9IkJ1c2NhciBjbGllbnRlLCBwZWRpZG8gbyBTS1UiIHZhbHVlPSIke2VzYyh1aS5xKX0iIGFyaWEtbGFiZWw9IkJ1c2NhciIgc3R5bGU9IndpZHRoOmF1dG87bWluLXdpZHRoOjIyMHB4Ij4KICAgICAgPHNwYW4gY2xhc3M9InNwYWNlciIgc3R5bGU9ImZsZXg6MSI+PC9zcGFuPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWdob3N0IGJ0bi1zbSIgaWQ9InN5bmNOb3ciPiR7SS5zeW5jfUJ1c2NhciBwZWRpZG9zIGFob3JhPC9idXR0b24+CiAgICA8L2Rpdj4KICAgIDxkaXYgY2xhc3M9ImFjdGlvbmJhciIgaWQ9ImFjdGlvbmJhciI+PC9kaXY+CiAgICA8ZGl2IGlkPSJsaXN0Ij48L2Rpdj4KICA8L2Rpdj4KICA8ZGl2IGNsYXNzPSJhdXRvYmFyIiBzdHlsZT0ibWFyZ2luLXRvcDoxNnB4Ij4KICAgIDxkaXY+PGxhYmVsIGNsYXNzPSJzd2l0Y2giPjxpbnB1dCB0eXBlPSJjaGVja2JveCIgaWQ9ImF1dG9EbCIgJHthdXRvID8gJ2NoZWNrZWQnIDogJyd9PiBEZXNjYXJnYSBhdXRvbcOhdGljYTwvbGFiZWw+CiAgICA8cD5NaWVudHJhcyBlc3RhIHBhbnRhbGxhIGVzdMOpIGFiaWVydGEsIGNhZGEgZXRpcXVldGEgbnVldmEgc2UgZGVzY2FyZ2Egc29sYSBlbiBQREYgeSBwYXNhIGEgIkltcHJlc2FzIi4gTGEgcHJpbWVyYSB2ZXogZWwgbmF2ZWdhZG9yIHB1ZWRlIHBlZGlyIHBlcm1pc28gcGFyYSBkZXNjYXJnYXIgdmFyaW9zIGFyY2hpdm9zLjwvcD48L2Rpdj4KICA8L2Rpdj5gOwogICQoJyNhdXRvRGwnKS5vbmNoYW5nZSA9IGUgPT4geyBzdG9yZS5zZXQoJ2F1dG8nLCBlLnRhcmdldC5jaGVja2VkKTsgdG9hc3QoZS50YXJnZXQuY2hlY2tlZCA/ICdEZXNjYXJnYSBhdXRvbcOhdGljYSBhY3RpdmFkYScgOiAnRGVzY2FyZ2EgYXV0b23DoXRpY2EgZGVzYWN0aXZhZGEnKTsgaWYgKGUudGFyZ2V0LmNoZWNrZWQpIGF1dG9Eb3dubG9hZCgpOyB9OwogICQoJyNzeW5jTm93Jykub25jbGljayA9IGFzeW5jICgpID0+IHsgYXdhaXQgYXBpKCcvYXBpL3N5bmMnLCB7IG1ldGhvZDogJ1BPU1QnIH0pOyB0b2FzdCgnQnVzY2FuZG8gcGVkaWRvcyBudWV2b3MgZW4gbG9zIG1hcmtldHBsYWNlc+KApicpOyB9OwogICQoJyN0YWJzQmlnJykub25jbGljayA9IGUgPT4geyBjb25zdCBiID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtdGFiMl0nKTsgaWYgKCFiKSByZXR1cm47IHVpLnRhYiA9IGIuZGF0YXNldC50YWIyOyBzZWxlY3RlZC5jbGVhcigpOyBkcmF3Um93cygpOyB9OwogICQoJyNta0NoaXBzJykub25jbGljayA9IGUgPT4geyBjb25zdCBiID0gZS50YXJnZXQuY2xvc2VzdCgnLmNoaXAnKTsgaWYgKCFiKSByZXR1cm47IHVpLm1rID0gYi5kYXRhc2V0Lm1rOyBkcmF3Um93cygpOyB9OwogICQoJyNzZWxsZXJGJykub25jaGFuZ2UgPSBlID0+IHsgdWkuc2VsbGVyID0gZS50YXJnZXQudmFsdWU7IGRyYXdSb3dzKCk7IH07CiAgJCgnI3EnKS5vbmlucHV0ID0gZSA9PiB7IHVpLnEgPSBlLnRhcmdldC52YWx1ZS50cmltKCkudG9Mb3dlckNhc2UoKTsgZHJhd1Jvd3MoKTsgfTsKICAkKCcjbGlzdCcpLm9uY2hhbmdlID0gZSA9PiB7IGNvbnN0IGlkID0gZS50YXJnZXQuZGF0YXNldC5pZDsgaWYgKCFpZCkgcmV0dXJuOyBlLnRhcmdldC5jaGVja2VkID8gc2VsZWN0ZWQuYWRkKCtpZCkgOiBzZWxlY3RlZC5kZWxldGUoK2lkKTsgZHJhd0FjdGlvbmJhcigpOyB9OwogICQoJyNsaXN0Jykub25jbGljayA9IGFzeW5jIGUgPT4gewogICAgY29uc3QgYiA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLWFjdF0nKTsgaWYgKCFiKSByZXR1cm47CiAgICBjb25zdCBpZCA9ICtiLmRhdGFzZXQuaWQ7CiAgICBpZiAoYi5kYXRhc2V0LmFjdCA9PT0gJ3ByaW50JykgeyB3aW5kb3cub3BlbihgL2FwaS9vcmRlcnMvJHtpZH0vbGFiZWwucGRmP21hcms9MWAsICdfYmxhbmsnKTsgc2V0VGltZW91dChsb2FkT3JkZXJzLCAxMjAwKTsgdG9hc3QoJ0V0aXF1ZXRhIGFiaWVydGEgwrcgcGFzw7MgYSAiRXRpcXVldGFzIGltcHJlc2FzIicpOyB9CiAgICBpZiAoYi5kYXRhc2V0LmFjdCA9PT0gJ3JlcHJpbnQnKSB3aW5kb3cub3BlbihgL2FwaS9vcmRlcnMvJHtpZH0vbGFiZWwucGRmYCwgJ19ibGFuaycpOwogICAgaWYgKGIuZGF0YXNldC5hY3QgPT09ICdyZXRyeScpIHsgYi5kaXNhYmxlZCA9IHRydWU7IHRyeSB7IGF3YWl0IGFwaShgL2FwaS9vcmRlcnMvJHtpZH0vcmV0cnlgLCB7IG1ldGhvZDogJ1BPU1QnIH0pOyB0b2FzdCgnUmVpbnRlbnRhbmRv4oCmJyk7IGxvYWRPcmRlcnMoKTsgfSBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlKTsgfSB9CiAgICBpZiAoYi5kYXRhc2V0LmFjdCA9PT0gJ3VucHJpbnQnKSB7IGF3YWl0IGFwaShgL2FwaS9vcmRlcnMvJHtpZH0vdW5wcmludGAsIHsgbWV0aG9kOiAnUE9TVCcgfSk7IHRvYXN0KCdWb2x2acOzIGEgIkV0aXF1ZXRhcyBwb3IgaW1wcmltaXIiJyk7IGxvYWRPcmRlcnMoKTsgfQogIH07CiAgJCgnI2FjdGlvbmJhcicpLm9uY2xpY2sgPSBlID0+IHsKICAgIGNvbnN0IGIgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1idWxrXScpOyBpZiAoIWIpIHJldHVybjsKICAgIGlmIChiLmRhdGFzZXQuYnVsayA9PT0gJ2FsbCcpIGRvd25sb2FkQmF0Y2godmlzaWJsZUluKCdyZWFkeScpLm1hcChvID0+IG8uaWQpKTsKICAgIGlmIChiLmRhdGFzZXQuYnVsayA9PT0gJ3NlbCcpIGRvd25sb2FkQmF0Y2goWy4uLnNlbGVjdGVkXSk7CiAgICBpZiAoYi5kYXRhc2V0LmJ1bGsgPT09ICdzZWxhbGwnKSB7IHZpc2libGVJbigncmVhZHknKS5mb3JFYWNoKG8gPT4gc2VsZWN0ZWQuYWRkKG8uaWQpKTsgZHJhd1Jvd3MoKTsgfQogICAgaWYgKGIuZGF0YXNldC5idWxrID09PSAnbm9uZScpIHsgc2VsZWN0ZWQuY2xlYXIoKTsgZHJhd1Jvd3MoKTsgfQogIH07CiAgbG9hZE9yZGVycygpOwp9Cgphc3luYyBmdW5jdGlvbiBsb2FkT3JkZXJzKCkgewogIGlmICh0YWIgIT09ICd0cmF5JykgcmV0dXJuOwogIGNvbnN0IGQgPSBhd2FpdCBhcGkoJy9hcGkvb3JkZXJzP3ZpZXc9YWxsJyk7CiAgY29uc3QgcHJldlJlYWR5ID0gbmV3IFNldChvcmRlcnMuZmlsdGVyKG8gPT4gby5zdGF0ZSA9PT0gJ3JlYWR5JykubWFwKG8gPT4gby5pZCkpOwogIG9yZGVycyA9IGQub3JkZXJzLnNvcnQoKGEsIGIpID0+IHRzKGIpIC0gdHMoYSkpOwogIHNlbGxlcnMgPSBkLnNlbGxlcnM7CiAgY29uc3Qgc2YgPSAkKCcjc2VsbGVyRicpOwogIGlmIChzZikgeyBzZi5pbm5lckhUTUwgPSBgPG9wdGlvbiB2YWx1ZT0iYWxsIj5Ub2RvcyBsb3MgdmVuZGVkb3Jlczwvb3B0aW9uPmAgKyBzZWxsZXJzLm1hcChzID0+IGA8b3B0aW9uIHZhbHVlPSIke3MuaWR9Ij4ke2VzYyhzLm5hbWUpfTwvb3B0aW9uPmApLmpvaW4oJycpOyBzZi52YWx1ZSA9IHVpLnNlbGxlcjsgfQogIGNvbnN0IGZyZXNoID0gb3JkZXJzLmZpbHRlcihvID0+IG8uc3RhdGUgPT09ICdyZWFkeScgJiYgIXByZXZSZWFkeS5oYXMoby5pZCkpLm1hcChvID0+IG8uaWQpOwogIGRyYXdSb3dzKGZpcnN0TG9hZCA/IFtdIDogZnJlc2gpOwogIGlmICghZmlyc3RMb2FkICYmIGZyZXNoLmxlbmd0aCkgdG9hc3QoYCR7ZnJlc2gubGVuZ3RofSBldGlxdWV0YSR7ZnJlc2gubGVuZ3RoID4gMSA/ICdzJyA6ICcnfSBudWV2YSR7ZnJlc2gubGVuZ3RoID4gMSA/ICdzJyA6ICcnfSBwb3IgaW1wcmltaXJgKTsKICBmaXJzdExvYWQgPSBmYWxzZTsKICBpZiAoc3RvcmUuZ2V0KCdhdXRvJywgZmFsc2UpKSBhdXRvRG93bmxvYWQoKTsKfQoKY29uc3QgbWF0Y2hlc0ZpbHRlcnMgPSBvID0+ICh1aS5tayA9PT0gJ2FsbCcgfHwgby5tYXJrZXRwbGFjZSA9PT0gdWkubWspICYmICh1aS5zZWxsZXIgPT09ICdhbGwnIHx8IFN0cmluZyhvLnNlbGxlcl9pZCkgPT09IHVpLnNlbGxlcikgJiYKICAoIXVpLnEgfHwgby5vcmRlcl9udW1iZXIudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyh1aS5xKSB8fCAoby5jdXN0b21lciB8fCAnJykudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyh1aS5xKSB8fCBvLml0ZW1zLnNvbWUoaSA9PiBbaS5za3UsIGkucHViX2lkLCBpLm5hbWVdLmpvaW4oJyAnKS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHVpLnEpKSk7CmNvbnN0IHZpc2libGVJbiA9IHQgPT4gb3JkZXJzLmZpbHRlcihvID0+IHRhYk9mKG8pID09PSB0ICYmIG1hdGNoZXNGaWx0ZXJzKG8pKTsKZnVuY3Rpb24gdmlzaWJsZSgpIHsgcmV0dXJuIHZpc2libGVJbih1aS50YWIpOyB9CgpmdW5jdGlvbiBpdGVtc0hUTUwobykgewogIGNvbnN0IGJhZCA9IG5ldyBTZXQoby5ibG9ja2VkX3NrdXMgfHwgW10pOwogIHJldHVybiBgPGRpdiBjbGFzcz0iaXRlbXMiPiR7by5pdGVtcy5tYXAoaSA9PiBgPHNwYW4gY2xhc3M9IiR7YmFkLmhhcyhpLnNrdSkgfHwgYmFkLmhhcyhpLnB1Yl9pZCkgPyAnYmFkJyA6ICcnfSI+PGI+JHtlc2MoaS5xdHkpfcOXPC9iPiAke2VzYyhpLm5hbWUpfSR7aS52YXJpYW50ID8gYCA8c3BhbiBjbGFzcz0idiI+wrcgJHtlc2MoaS52YXJpYW50KX08L3NwYW4+YCA6ICcnfSA8c3BhbiBjbGFzcz0ibW9ubyB2Ij4ke2VzYyhpLnNrdSB8fCBpLnB1Yl9pZCl9PC9zcGFuPjwvc3Bhbj5gKS5qb2luKCcnKX08L2Rpdj5gOwp9CmZ1bmN0aW9uIHBpbGwobykgeyByZXR1cm4gYDxzcGFuIGNsYXNzPSJwaWxsICR7by5zdGF0ZX0iPiR7cGlsbEljb25bby5zdGF0ZV0gfHwgJyd9JHtTVEFURVtvLnN0YXRlXSB8fCBvLnN0YXRlfTwvc3Bhbj5gOyB9CgpmdW5jdGlvbiBkcmF3Um93cyhmcmVzaCA9IFtdKSB7CiAgaWYgKCEkKCcjdGFic0JpZycpKSByZXR1cm47CiAgY29uc3QgaW5UYWIgPSB0ID0+IG9yZGVycy5maWx0ZXIobyA9PiB0YWJPZihvKSA9PT0gdCAmJiAodWkubWsgPT09ICdhbGwnIHx8IG8ubWFya2V0cGxhY2UgPT09IHVpLm1rKSAmJiAodWkuc2VsbGVyID09PSAnYWxsJyB8fCBTdHJpbmcoby5zZWxsZXJfaWQpID09PSB1aS5zZWxsZXIpKTsKICAkKCcjdGFic0JpZycpLmlubmVySFRNTCA9IFRBQlMubWFwKChbaywgbiwgc3ViLCBpY10pID0+IGA8YnV0dG9uIGNsYXNzPSJ0YiB0Yi0ke2t9IiBkYXRhLXRhYjI9IiR7a30iIGFyaWEtcHJlc3NlZD0iJHt1aS50YWIgPT09IGt9Ij48c3BhbiBjbGFzcz0idGItaWMiPiR7aWN9PC9zcGFuPjxzcGFuPjxiPiR7aW5UYWIoaykubGVuZ3RofTwvYj48c3BhbiBjbGFzcz0idGItbiI+JHtufTwvc3Bhbj48c21hbGw+JHtzdWJ9PC9zbWFsbD48L3NwYW4+PC9idXR0b24+YCkuam9pbignJyk7CiAgY29uc3QgbWtDb3VudCA9IG1rID0+IG9yZGVycy5maWx0ZXIobyA9PiB0YWJPZihvKSA9PT0gdWkudGFiICYmIChtayA9PT0gJ2FsbCcgfHwgby5tYXJrZXRwbGFjZSA9PT0gbWspKS5sZW5ndGg7CiAgJCgnI21rQ2hpcHMnKS5pbm5lckhUTUwgPSBbWydhbGwnLCAnVG9kb3MnXSwgWydtbCcsICdNZXJjYWRvIExpYnJlJ10sIFsnZmEnLCAnRmFsYWJlbGxhJ10sIFsncGEnLCAnUGFyaXMnXV0ubWFwKChbaywgbl0pID0+IGA8YnV0dG9uIGNsYXNzPSJjaGlwIiBkYXRhLW1rPSIke2t9IiBhcmlhLXByZXNzZWQ9IiR7dWkubWsgPT09IGt9Ij4ke259IDxzcGFuIGNsYXNzPSJjbnQiPiR7bWtDb3VudChrKX08L3NwYW4+PC9idXR0b24+YCkuam9pbignJyk7CiAgY29uc3Qgcm93cyA9IHZpc2libGUoKTsKICBpZiAoIXJvd3MubGVuZ3RoKSB7CiAgICBjb25zdCBtc2cgPSB7IHJlYWR5OiAnTm8gaGF5IGV0aXF1ZXRhcyBwb3IgaW1wcmltaXIuIExhcyB2ZW50YXMgbnVldmFzIGFwYXJlY2VuIGFxdcOtIHNvbGFzLicsIHdhaXRpbmc6ICdOaW5ndW5hIHZlbnRhIGVzdMOhIGVzcGVyYW5kbyBldGlxdWV0YS4nLCBwcmludGVkOiAnQcO6biBubyBoYXkgZXRpcXVldGFzIGltcHJlc2FzIGVuIGxvcyDDumx0aW1vcyA3IGTDrWFzLicsIGJsb2NrZWQ6ICdObyBoYXkgcGVkaWRvcyBibG9xdWVhZG9zLicgfVt1aS50YWJdOwogICAgJCgnI2xpc3QnKS5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz0iZW1wdHkiPiR7RU1QVFlfU1ZHfTxkaXY+JHttc2d9PC9kaXY+PC9kaXY+YDsKICAgIGRyYXdBY3Rpb25iYXIoKTsgcmV0dXJuOwogIH0KICBsZXQgbGFzdERheSA9ICcnLCBodG1sID0gJyc7CiAgZm9yIChjb25zdCBvIG9mIHJvd3MpIHsKICAgIGNvbnN0IGQgPSB0cyhvKSwgZGF5ID0gZGF5TGFiZWwoZCk7CiAgICBpZiAoZGF5ICE9PSBsYXN0RGF5KSB7IGh0bWwgKz0gYDxkaXYgY2xhc3M9ImRheWhlYWQiPiR7ZXNjKGRheSl9PC9kaXY+YDsgbGFzdERheSA9IGRheTsgfQogICAgY29uc3Qgc3QgPSBvLnN0YXRlOwogICAgbGV0IG5vdGUgPSAnJywgYnRuID0gJyc7CiAgICBpZiAoc3QgPT09ICdyZWFkeScpIGJ0biA9IGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIGRhdGEtYWN0PSJwcmludCIgZGF0YS1pZD0iJHtvLmlkfSI+JHtJLnByaW50fUltcHJpbWlyPC9idXR0b24+YDsKICAgIGlmIChzdCA9PT0gJ3ByaW50ZWQnKSB7IG5vdGUgPSBgPHNwYW4gY2xhc3M9Im5vdGUiPkltcHJlc2EgJHtlc2MoZm10VGltZShvLnByaW50ZWRfYXQpKX0ke28ucHJpbnRlZF9ieSA/ICcgwrcgJyArIGVzYyhvLnByaW50ZWRfYnkpIDogJyd9PC9zcGFuPmA7IGJ0biA9IGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWFjdD0icmVwcmludCIgZGF0YS1pZD0iJHtvLmlkfSI+UmVpbXByaW1pcjwvYnV0dG9uPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtYWN0PSJ1bnByaW50IiBkYXRhLWlkPSIke28uaWR9Ij5NYXJjYXIgY29tbyBubyBpbXByZXNhPC9idXR0b24+YDsgfQogICAgaWYgKHN0ID09PSAnd2FpdGluZycgfHwgc3QgPT09ICdlcnJvcicpIHsgbm90ZSA9IGA8c3BhbiBjbGFzcz0ibm90ZSAke3N0ID09PSAnZXJyb3InID8gJ2JhZCcgOiAnJ30iPiR7ZXNjKG8uZXJyb3IgfHwgJ0VsIG1hcmtldHBsYWNlIGHDum4gbm8gbGliZXJhIGxhIGV0aXF1ZXRhJyl9PC9zcGFuPmA7IGJ0biA9IGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWFjdD0icmV0cnkiIGRhdGEtaWQ9IiR7by5pZH0iPlJlaW50ZW50YXI8L2J1dHRvbj5gOyB9CiAgICBpZiAoc3QgPT09ICdibG9ja2VkJykgbm90ZSA9ICc8c3BhbiBjbGFzcz0ibm90ZSBiYWQiPlRpZW5lIHVuIHByb2R1Y3RvIHF1ZSBubyB2YSBhbCBmdWxmaWxsbWVudDwvc3Bhbj4nOwogICAgaHRtbCArPSBgPGRpdiBjbGFzcz0ib3JvdyBzdC0ke3N0fSAke2ZyZXNoLmluY2x1ZGVzKG8uaWQpID8gJ2lzLW5ldycgOiAnJ30iPgogICAgICA8ZGl2IGNsYXNzPSJvYy1jaGVjayI+JHtzdCA9PT0gJ3JlYWR5JyA/IGA8aW5wdXQgdHlwZT0iY2hlY2tib3giIGNsYXNzPSJjYiIgZGF0YS1pZD0iJHtvLmlkfSIgJHtzZWxlY3RlZC5oYXMoby5pZCkgPyAnY2hlY2tlZCcgOiAnJ30gYXJpYS1sYWJlbD0iU2VsZWNjaW9uYXIgJHtlc2Moby5vcmRlcl9udW1iZXIpfSI+YCA6IHN0ID09PSAnYmxvY2tlZCcgPyBgPHNwYW4gY2xhc3M9ImxvY2tjZWxsIj4ke0kubG9ja308L3NwYW4+YCA6ICcnfTwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJvYy10aW1lIj48Yj4ke2VzYyhoaG1tKGQpKX08L2I+PHNwYW4gY2xhc3M9Im1rICR7by5tYXJrZXRwbGFjZX0iPiR7TUtbby5tYXJrZXRwbGFjZV0gfHwgby5tYXJrZXRwbGFjZX08L3NwYW4+PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9Im9jLW1haW4iPjxkaXYgY2xhc3M9Im9jLXRvcCI+JHtvLmN1c3RvbWVyID8gYDxzcGFuIGNsYXNzPSJjdXN0Ij4ke2VzYyhvLmN1c3RvbWVyKX08L3NwYW4+YCA6ICcnfTxiPiR7ZXNjKG8uc2VsbGVyKX08L2I+IDxzcGFuIGNsYXNzPSJtb25vIG11dGVkIj4jJHtlc2Moby5vcmRlcl9udW1iZXIpfTwvc3Bhbj48L2Rpdj4ke2l0ZW1zSFRNTChvKX0ke25vdGV9PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9Im9jLWFjdCI+JHtwaWxsKG8pfTxkaXYgY2xhc3M9InJvdy1hY3Rpb25zIj4ke2J0bn0ke28udHJhY2tfdXJsID8gYDxhIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBocmVmPSIke2VzYyhvLnRyYWNrX3VybCl9IiB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciI+U2VndWlyIGVudsOtbzwvYT5gIDogJyd9PC9kaXY+JHtvLnRyYWNraW5nID8gYDxzcGFuIGNsYXNzPSJub3RlIG1vbm8iPk7CsCBzZWd1aW1pZW50byAke2VzYyhvLnRyYWNraW5nKX08L3NwYW4+YCA6ICcnfTwvZGl2PgogICAgPC9kaXY+YDsKICB9CiAgJCgnI2xpc3QnKS5pbm5lckhUTUwgPSBodG1sOwogIGRyYXdBY3Rpb25iYXIoKTsKfQpmdW5jdGlvbiBkcmF3QWN0aW9uYmFyKCkgewogIGNvbnN0IGFiID0gJCgnI2FjdGlvbmJhcicpOyBpZiAoIWFiKSByZXR1cm47CiAgaWYgKHVpLnRhYiAhPT0gJ3JlYWR5JykgeyBhYi5pbm5lckhUTUwgPSAnJzsgYWIuaGlkZGVuID0gdHJ1ZTsgcmV0dXJuOyB9CiAgYWIuaGlkZGVuID0gZmFsc2U7CiAgY29uc3QgbiA9IHZpc2libGVJbigncmVhZHknKS5sZW5ndGgsIHMgPSBzZWxlY3RlZC5zaXplOwogIGFiLmlubmVySFRNTCA9IGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIGRhdGEtYnVsaz0iYWxsIiAke24gPyAnJyA6ICdkaXNhYmxlZCd9PiR7SS5kb3dufUltcHJpbWlyIHRvZGFzICgke259KTwvYnV0dG9uPgogICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIiBkYXRhLWJ1bGs9InNlbCIgJHtzID8gJycgOiAnZGlzYWJsZWQnfT5JbXByaW1pciBzZWxlY2Npb25hZGFzICgke3N9KTwvYnV0dG9uPgogICAgPHNwYW4gY2xhc3M9InNwYWNlciIgc3R5bGU9ImZsZXg6MSI+PC9zcGFuPgogICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1idWxrPSJzZWxhbGwiPlNlbGVjY2lvbmFyIHRvZGFzPC9idXR0b24+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1idWxrPSJub25lIj5RdWl0YXIgc2VsZWNjacOzbjwvYnV0dG9uPmA7Cn0KZnVuY3Rpb24gdXBkYXRlU2VsKCkgeyBkcmF3QWN0aW9uYmFyKCk7IH0KCmxldCBkb3dubG9hZGluZyA9IGZhbHNlOwphc3luYyBmdW5jdGlvbiBkb3dubG9hZEJhdGNoKGlkcywgeyBzaWxlbnQgPSBmYWxzZSB9ID0ge30pIHsKICBpZiAoIWlkcy5sZW5ndGggfHwgZG93bmxvYWRpbmcpIHJldHVybiAwOwogIGRvd25sb2FkaW5nID0gdHJ1ZTsKICB0cnkgewogICAgY29uc3QgcmVzID0gYXdhaXQgZmV0Y2goJy9hcGkvbGFiZWxzL2JhdGNoJywgeyBtZXRob2Q6ICdQT1NUJywgY3JlZGVudGlhbHM6ICdzYW1lLW9yaWdpbicsIGhlYWRlcnM6IHsgJ2NvbnRlbnQtdHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9LCBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGlkcywgbWFyazogdHJ1ZSB9KSB9KTsKICAgIGlmICghcmVzLm9rKSB7IGNvbnN0IGUgPSBhd2FpdCByZXMuanNvbigpLmNhdGNoKCgpID0+ICh7fSkpOyB0aHJvdyBuZXcgRXJyb3IoZS5lcnJvciB8fCAnTm8gc2UgcHVkbyBkZXNjYXJnYXInKTsgfQogICAgY29uc3QgYmxvYiA9IGF3YWl0IHJlcy5ibG9iKCk7CiAgICBjb25zdCBuYW1lID0gKHJlcy5oZWFkZXJzLmdldCgnY29udGVudC1kaXNwb3NpdGlvbicpIHx8ICcnKS5tYXRjaCgvZmlsZW5hbWU9IihbXiJdKykiLyk/LlsxXSB8fCAnZXRpcXVldGFzLnBkZic7CiAgICBjb25zdCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpOyBhLmhyZWYgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpOyBhLmRvd25sb2FkID0gbmFtZTsgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChhKTsgYS5jbGljaygpOyBhLnJlbW92ZSgpOwogICAgc2V0VGltZW91dCgoKSA9PiBVUkwucmV2b2tlT2JqZWN0VVJMKGEuaHJlZiksIDYwMDAwKTsKICAgIGNvbnN0IG4gPSArcmVzLmhlYWRlcnMuZ2V0KCd4LWxhYmVsLWNvdW50JykgfHwgaWRzLmxlbmd0aDsKICAgIHRvYXN0KGAke259IGV0aXF1ZXRhJHtuID09PSAxID8gJycgOiAncyd9IGRlc2NhcmdhZGEke24gPT09IDEgPyAnJyA6ICdzJ30geSBtYXJjYWRhJHtuID09PSAxID8gJycgOiAncyd9IGNvbW8gaW1wcmVzYSR7biA9PT0gMSA/ICcnIDogJ3MnfWApOwogICAgc2VsZWN0ZWQuY2xlYXIoKTsKICAgIHJldHVybiBuOwogIH0gY2F0Y2ggKGUpIHsgaWYgKCFzaWxlbnQpIHRvYXN0KGUubWVzc2FnZSk7IHJldHVybiAwOyB9CiAgZmluYWxseSB7IGRvd25sb2FkaW5nID0gZmFsc2U7IHNldFRpbWVvdXQobG9hZE9yZGVycywgNDAwKTsgfQp9CmxldCBhdXRvVCA9IG51bGw7CmZ1bmN0aW9uIGF1dG9Eb3dubG9hZCgpIHsKICBjbGVhclRpbWVvdXQoYXV0b1QpOwogIC8vIGVzcGVyYSB1bm9zIHNlZ3VuZG9zIHBhcmEganVudGFyIGV0aXF1ZXRhcyBxdWUgbGxlZ2FuIGNhc2kganVudGFzIGVuIHVuIHNvbG8gUERGCiAgYXV0b1QgPSBzZXRUaW1lb3V0KCgpID0+IHsKICAgIGNvbnN0IGlkcyA9IG9yZGVycy5maWx0ZXIobyA9PiBvLnN0YXRlID09PSAncmVhZHknKS5tYXAobyA9PiBvLmlkKTsKICAgIGlmIChpZHMubGVuZ3RoICYmIHN0b3JlLmdldCgnYXV0bycsIGZhbHNlKSkgZG93bmxvYWRCYXRjaChpZHMsIHsgc2lsZW50OiB0cnVlIH0pOwogIH0sIDQwMDApOwp9CgovLyAtLS0tLS0tLS0tIFZFTkRFRE9SIC0tLS0tLS0tLS0KYXN5bmMgZnVuY3Rpb24gcmVuZGVyU2VsbGVyKCkgewogIGNvbnN0IGlzQWRtaW4gPSBtZS51c2VyLnJvbGUgPT09ICdhZG1pbic7CiAgbGV0IHNlbGxlclBpY2tlciA9ICcnOwogIGlmIChpc0FkbWluKSB7CiAgICBjb25zdCBkID0gYXdhaXQgYXBpKCcvYXBpL2FkbWluL3NlbGxlcnMnKTsKICAgIHNlbGxlcnMgPSBkLnNlbGxlcnM7CiAgICBpZiAoIXNlbGxlcnMubGVuZ3RoKSB7ICQoJyNtYWluJykuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9InNlY3Rpb24tdGl0bGUiPjxoMj5WZW5kZWRvcmVzPC9oMj48L2Rpdj48ZGl2IGNsYXNzPSJwYW5lbCI+PGRpdiBjbGFzcz0iZW1wdHkiPiR7RU1QVFlfU1ZHfTxkaXY+UHJpbWVybyBjcmVhIGxvcyB2ZW5kZWRvcmVzIGVuIGxhIHBlc3Rhw7FhIFVzdWFyaW9zLjwvZGl2PjwvZGl2PjwvZGl2PmA7IHJldHVybjsgfQogICAgaWYgKCFzZWxsZXJzLnNvbWUocyA9PiBzLmlkID09PSB1aS5hZG1pblNlbGxlcikpIHVpLmFkbWluU2VsbGVyID0gc2VsbGVyc1swXS5pZDsKICAgIHNlbGxlclBpY2tlciA9IGA8c2VsZWN0IGlkPSJhZG1pblNlbGxlciIgc3R5bGU9IndpZHRoOmF1dG8iPiR7c2VsbGVycy5tYXAocyA9PiBgPG9wdGlvbiB2YWx1ZT0iJHtzLmlkfSIgJHtzLmlkID09PSB1aS5hZG1pblNlbGxlciA/ICdzZWxlY3RlZCcgOiAnJ30+JHtlc2Mocy5uYW1lKX08L29wdGlvbj5gKS5qb2luKCcnKX08L3NlbGVjdD5gOwogIH0KICAkKCcjbWFpbicpLmlubmVySFRNTCA9IGAKICA8ZGl2IGNsYXNzPSJzZWN0aW9uLXRpdGxlIj48aDI+JHtpc0FkbWluID8gJ0N1ZW50YSBkZWwgdmVuZGVkb3InIDogJ01pcyBtYXJrZXRwbGFjZXMnfTwvaDI+JHtzZWxsZXJQaWNrZXJ9PHNwYW4gY2xhc3M9InNwYWNlciIgc3R5bGU9ImZsZXg6MSI+PC9zcGFuPjxidXR0b24gY2xhc3M9ImJ0biBidG4tZ2hvc3QiIGlkPSJzU3luYyI+JHtJLnN5bmN9U2luY3Jvbml6YXIgYWhvcmE8L2J1dHRvbj48L2Rpdj4KICA8ZGl2IGNsYXNzPSJjb25uIiBpZD0iY29ubiI+PC9kaXY+CiAgPGRpdiBjbGFzcz0iZ3JpZDIiPgogICAgPGRpdiBjbGFzcz0icGFuZWwiPgogICAgICA8ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj48aDI+UHJvZHVjdG9zIHF1ZSBOTyB2YW4gYWwgZnVsZmlsbG1lbnQ8L2gyPjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJwYW5lbC1ib2R5IHN0YWNrIj4KICAgICAgICA8ZGl2IGNsYXNzPSJydWxlIj4ke1JVTEVfU1ZHfTxwPjxiPkJhc3RhIHVuIHByb2R1Y3RvIGRlIGVzdGEgbGlzdGEgcGFyYSBibG9xdWVhciBlbCBwZWRpZG8gY29tcGxldG8uPC9iPiBFbCBmdWxmaWxsbWVudCBsbyB2ZXLDoSBjb24gY2FuZGFkbyB5IG5vIHBvZHLDoSBkZXNjYXJnYXIgc3UgZXRpcXVldGEuIFVzYSBlbCBJRCBkZSBwdWJsaWNhY2nDs24gKE1MQ+KApiwgSUQgZGUgRmFsYWJlbGxhLCBTS1UgTUvigKYgZGUgUGFyaXMpIG8gdHUgU0tVIGRlIHZlbmRlZG9yLjwvcD48L2Rpdj4KICAgICAgICA8Zm9ybSBjbGFzcz0iYWRkcm93IiBpZD0iYWRkRm9ybSI+CiAgICAgICAgICA8dGV4dGFyZWEgaWQ9ImFkZFZhbCIgcm93cz0iMiIgcGxhY2Vob2xkZXI9IlVubyBvIHZhcmlvcywgc2VwYXJhZG9zIHBvciBjb21hIG8gc2FsdG8gZGUgbMOtbmVhJiMxMDtFajogTUxDMTQ4Nzc2NTQzMiwgTEVOLVBPTC0wMSIgYXJpYS1sYWJlbD0iSURzIG8gU0tVcyI+PC90ZXh0YXJlYT4KICAgICAgICAgIDxzZWxlY3QgaWQ9ImFkZE1rIiBhcmlhLWxhYmVsPSJNYXJrZXRwbGFjZSI+PG9wdGlvbiB2YWx1ZT0iYW55Ij5Ub2RvcyBsb3MgY2FuYWxlczwvb3B0aW9uPjxvcHRpb24gdmFsdWU9Im1sIj5Tb2xvIE1lcmNhZG8gTGlicmU8L29wdGlvbj48b3B0aW9uIHZhbHVlPSJmYSI+U29sbyBGYWxhYmVsbGE8L29wdGlvbj48b3B0aW9uIHZhbHVlPSJwYSI+U29sbyBQYXJpczwvb3B0aW9uPjwvc2VsZWN0PgogICAgICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiPiR7SS5sb2NrfUJsb3F1ZWFyPC9idXR0b24+CiAgICAgICAgPC9mb3JtPgogICAgICAgIDxpbnB1dCB0eXBlPSJzZWFyY2giIGlkPSJibFEiIHBsYWNlaG9sZGVyPSJCdXNjYXIgZW4gbGEgbGlzdGEiIGFyaWEtbGFiZWw9IkJ1c2NhciBibG9xdWVhZG9zIj4KICAgICAgICA8ZGl2IGNsYXNzPSJ0YWdzIiBpZD0idGFncyI+PC9kaXY+CiAgICAgIDwvZGl2PgogICAgPC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbCI+CiAgICAgIDxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj5QZWRpZG9zIHJlY2llbnRlczwvaDI+PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9InRhYmxlLXdyYXAiPjx0YWJsZSBzdHlsZT0ibWluLXdpZHRoOjUyMHB4Ij48dGhlYWQ+PHRyPjx0aD5QZWRpZG88L3RoPjx0aD5DYW5hbDwvdGg+PHRoPlByb2R1Y3RvczwvdGg+PHRoPkVzdGFkbzwvdGg+PC90cj48L3RoZWFkPjx0Ym9keSBpZD0ibXlSb3dzIj48L3Rib2R5PjwvdGFibGU+PC9kaXY+CiAgICA8L2Rpdj4KICA8L2Rpdj5gOwogIGlmIChpc0FkbWluKSAkKCcjYWRtaW5TZWxsZXInKS5vbmNoYW5nZSA9IGUgPT4geyB1aS5hZG1pblNlbGxlciA9ICtlLnRhcmdldC52YWx1ZTsgc3RvcmUuc2V0KCdhZG1pblNlbGxlcicsIHVpLmFkbWluU2VsbGVyKTsgcmVuZGVyU2VsbGVyKCk7IH07CiAgJCgnI3NTeW5jJykub25jbGljayA9IGFzeW5jICgpID0+IHsgYXdhaXQgYXBpKCcvYXBpL3N5bmMnICsgc2VsbGVyUVMoKSwgeyBtZXRob2Q6ICdQT1NUJyB9KTsgdG9hc3QoJ1NpbmNyb25pemFuZG/igKYnKTsgfTsKICAkKCcjYWRkRm9ybScpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICBlLnByZXZlbnREZWZhdWx0KCk7CiAgICB0cnkgeyBjb25zdCByID0gYXdhaXQgYXBpKCcvYXBpL2Jsb2NrbGlzdCcgKyBzZWxsZXJRUygpLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IHZhbHVlOiAkKCcjYWRkVmFsJykudmFsdWUsIG1hcmtldHBsYWNlOiAkKCcjYWRkTWsnKS52YWx1ZSB9IH0pOyAkKCcjYWRkVmFsJykudmFsdWUgPSAnJzsgdG9hc3QoYCR7ci5hZGRlZH0gYmxvcXVlYWRvJHtyLmFkZGVkID09PSAxID8gJycgOiAncyd9YCk7IGxvYWRCbG9ja2xpc3QoKTsgfQogICAgY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IH0KICB9OwogICQoJyNibFEnKS5vbmlucHV0ID0gKCkgPT4gZHJhd1RhZ3MoKTsKICAkKCcjdGFncycpLm9uY2xpY2sgPSBhc3luYyBlID0+IHsgY29uc3QgYiA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLXJtXScpOyBpZiAoIWIpIHJldHVybjsgYXdhaXQgYXBpKGAvYXBpL2Jsb2NrbGlzdC8ke2IuZGF0YXNldC5ybX0ke3NlbGxlclFTKCl9YCwgeyBtZXRob2Q6ICdERUxFVEUnIH0pOyB0b2FzdCgnRGVzYmxvcXVlYWRvOiBzdXMgcGVkaWRvcyBwYXNhbiBhbCBmdWxmaWxsbWVudCcpOyBsb2FkQmxvY2tsaXN0KCk7IH07CiAgbG9hZENvbm5lY3Rpb25zKCk7IGxvYWRCbG9ja2xpc3QoKTsgbG9hZFNlbGxlck9yZGVycygpOwogIGlmIChuZXcgVVJMU2VhcmNoUGFyYW1zKGxvY2F0aW9uLnNlYXJjaCkuZ2V0KCdjb25lY3RhZG8nKSA9PT0gJ21sJykgeyB0b2FzdCgnTWVyY2FkbyBMaWJyZSBjb25lY3RhZG8nKTsgaGlzdG9yeS5yZXBsYWNlU3RhdGUobnVsbCwgJycsICcvJyk7IH0KfQoKYXN5bmMgZnVuY3Rpb24gbG9hZENvbm5lY3Rpb25zKCkgewogIGNvbnN0IHsgY29ubmVjdGlvbnMgfSA9IGF3YWl0IGFwaSgnL2FwaS9jb25uZWN0aW9ucycgKyBzZWxsZXJRUygpKTsKICBjb25zdCBieSA9IE9iamVjdC5mcm9tRW50cmllcyhjb25uZWN0aW9ucy5tYXAoYyA9PiBbYy5tYXJrZXRwbGFjZSwgY10pKTsKICBjb25zdCBzdCA9IGMgPT4gIWMgPyAnPGRpdiBjbGFzcz0ic3RhdGUgb2ZmIj48aT48L2k+U2luIGNvbmVjdGFyPC9kaXY+JyA6IGMubGFzdF9lcnJvciA/IGA8ZGl2IGNsYXNzPSJzdGF0ZSBlcnIiPjxpPjwvaT5FcnJvcjogJHtlc2MoYy5sYXN0X2Vycm9yLnNsaWNlKDAsIDEyMCkpfTwvZGl2PmAgOiBgPGRpdiBjbGFzcz0ic3RhdGUgb24iPjxpPjwvaT5Db25lY3RhZG8ke2MuYWNjb3VudF9sYWJlbCA/ICcgwrcgJyArIGVzYyhjLmFjY291bnRfbGFiZWwpIDogJyd9JHtjLmxhc3Rfc3luY19hdCA/ICcgwrcgcmV2aXNhZG8gJyArIGVzYyhmbXRUaW1lKGMubGFzdF9zeW5jX2F0KSkgOiAnJ308L2Rpdj5gOwogIGNvbnN0IGRpc2MgPSBjID0+IGMgPyBgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1kZWw9IiR7Yy5pZH0iPkRlc2NvbmVjdGFyPC9idXR0b24+YCA6ICcnOwogIGNvbnN0IG1sID0gYnkubWwsIGZhID0gYnkuZmEsIHBhID0gYnkucGE7CiAgJCgnI2Nvbm4nKS5pbm5lckhUTUwgPSBgCiAgPGRpdiBjbGFzcz0ibWNhcmQiPjxkaXYgY2xhc3M9ImxvZ28iIHN0eWxlPSJiYWNrZ3JvdW5kOnZhcigtLW1sKTtjb2xvcjp2YXIoLS1tbC1pbmspIj5NZXJjYWRvIExpYnJlPC9kaXY+JHtzdChtbCl9CiAgICA8cCBjbGFzcz0iaG93Ij5UZSBsbGV2YSBhIE1lcmNhZG8gTGlicmUgcGFyYSBhdXRvcml6YXIuIE5vIGNvbXBhcnRlcyB0dSBjb250cmFzZcOxYS4gTGFzIGV0aXF1ZXRhcyBsbGVnYW4gYXBlbmFzIGxhIHZlbnRhIHF1ZWRhIGxpc3RhIHBhcmEgaW1wcmltaXIuPC9wPgogICAgJHttZS5tbENvbmZpZ3VyZWQgPyBgPGEgY2xhc3M9ImJ0biAke21sID8gJ2J0bi1naG9zdCcgOiAnYnRuLXByaW1hcnknfSIgaHJlZj0iL2F1dGgvbWwvc3RhcnQke3NlbGxlclFTKCl9Ij4ke21sID8gJ1ZvbHZlciBhIGF1dG9yaXphcicgOiAnQ29uZWN0YXIgY29uIE1lcmNhZG8gTGlicmUnfTwvYT5gIDogJzxwIGNsYXNzPSJob3ciIHN0eWxlPSJjb2xvcjp2YXIoLS13YXJuKSI+RWwgYWRtaW5pc3RyYWRvciBkZWJlIGNvbmZpZ3VyYXIgbGEgYXBwIGRlIE1lcmNhZG8gTGlicmUgZW4gZWwgc2Vydmlkb3IuPC9wPid9JHtkaXNjKG1sKX08L2Rpdj4KICA8ZGl2IGNsYXNzPSJtY2FyZCI+PGRpdiBjbGFzcz0ibG9nbyIgc3R5bGU9ImJhY2tncm91bmQ6dmFyKC0tZmEpO2NvbG9yOnZhcigtLWZhLWluaykiPkZhbGFiZWxsYTwvZGl2PiR7c3QoZmEpfQogICAgPGZvcm0gaWQ9ImZhRm9ybSIgY2xhc3M9InN0YWNrIj4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5Vc3VhcmlvIEFQSSAoY29ycmVvIGRlbCBTZWxsZXIgQ2VudGVyKTxpbnB1dCB0eXBlPSJlbWFpbCIgaWQ9ImZhVXNlciIgdmFsdWU9IiR7ZXNjKGZhPy5hY2NvdW50X2xhYmVsIHx8ICcnKX0iIHJlcXVpcmVkPjwvbGFiZWw+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+QVBJIEtleTxpbnB1dCB0eXBlPSJwYXNzd29yZCIgaWQ9ImZhS2V5IiBwbGFjZWhvbGRlcj0iJHtmYSA/ICfigKLigKLigKLigKLigKLigKIgKGd1YXJkYWRhKScgOiAnU2VsbGVyIENlbnRlciDigLogTWkgY3VlbnRhIOKAuiBJbnRlZ3JhY2lvbmVzJ30iICR7ZmEgPyAnJyA6ICdyZXF1aXJlZCd9PjwvbGFiZWw+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+U2VsbGVyIElEPGlucHV0IHR5cGU9InRleHQiIGlkPSJmYVNpZCIgcGxhY2Vob2xkZXI9IkPDs2RpZ28gZGUgdGllbmRhLCBlai4gU0MxMjM0Ij48L2xhYmVsPgogICAgICA8bGFiZWwgY2xhc3M9InN3aXRjaCI+PGlucHV0IHR5cGU9ImNoZWNrYm94IiBpZD0iZmFBdXRvIiAke2ZhPy5zZXR0aW5ncz8uYXV0b1JlYWR5ID8gJ2NoZWNrZWQnIDogJyd9PiBNYXJjYXIgImxpc3RvIHBhcmEgZGVzcGFjaG8iIGF1dG9tw6F0aWNvPC9sYWJlbD4KICAgICAgPHAgY2xhc3M9ImhvdyI+RmFsYWJlbGxhIGdlbmVyYSBsYSBldGlxdWV0YSBzb2xvIGN1YW5kbyBlbCBwZWRpZG8gZXN0w6EgbGlzdG8gcGFyYSBkZXNwYWNoby4gQ29uIGVzdGEgb3BjacOzbiwgbGEgYXBwIGxvIG1hcmNhIHNvbGEgYXBlbmFzIGxsZWdhLjwvcD4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuICR7ZmEgPyAnYnRuLWdob3N0JyA6ICdidG4tcHJpbWFyeSd9IiB0eXBlPSJzdWJtaXQiPiR7ZmEgPyAnQWN0dWFsaXphcicgOiAnQ29uZWN0YXIgRmFsYWJlbGxhJ308L2J1dHRvbj4KICAgIDwvZm9ybT4KICAgICR7ZmE/LndlYmhvb2tfdXJsID8gYDxsYWJlbCBjbGFzcz0iZiI+QXZpc28gaW5zdGFudMOhbmVvICh3ZWJob29rLCBvcGNpb25hbCk8c3BhbiBjbGFzcz0iY29weSI+PGlucHV0IHR5cGU9InRleHQiIHJlYWRvbmx5IHZhbHVlPSIke2VzYyhmYS53ZWJob29rX3VybCl9Ij48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWNvcHk9IiR7ZXNjKGZhLndlYmhvb2tfdXJsKX0iPkNvcGlhcjwvYnV0dG9uPjwvc3Bhbj48L2xhYmVsPmAgOiAnJ30KICAgICR7ZGlzYyhmYSl9PC9kaXY+CiAgPGRpdiBjbGFzcz0ibWNhcmQiPjxkaXYgY2xhc3M9ImxvZ28iIHN0eWxlPSJiYWNrZ3JvdW5kOnZhcigtLXBhKTtjb2xvcjojZmZmIj5QYXJpczwvZGl2PiR7c3QocGEpfQogICAgPGZvcm0gaWQ9InBhRm9ybSIgY2xhc3M9InN0YWNrIj4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5BUEkgS2V5PGlucHV0IHR5cGU9InBhc3N3b3JkIiBpZD0icGFLZXkiIHBsYWNlaG9sZGVyPSIke3BhID8gJ+KAouKAouKAouKAouKAouKAoiAoZ3VhcmRhZGEpJyA6ICdTZWxsZXIgQ2VudGVyIFBhcmlzIOKAuiBNaSBjdWVudGEg4oC6IEludGVncmFjaW9uZXMnfSIgcmVxdWlyZWQ+PC9sYWJlbD4KICAgICAgPHAgY2xhc3M9ImhvdyI+UGFyaXMgZW50cmVnYSBsYSBBUEkgS2V5IGVuIE1pIGN1ZW50YSDigLogSW50ZWdyYWNpb25lcy4gU2kgbm8gYXBhcmVjZSwgc2UgcGlkZSBwb3IgdGlja2V0IGEgUGFyaXMuPC9wPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gJHtwYSA/ICdidG4tZ2hvc3QnIDogJ2J0bi1wcmltYXJ5J30iIHR5cGU9InN1Ym1pdCI+JHtwYSA/ICdBY3R1YWxpemFyJyA6ICdDb25lY3RhciBQYXJpcyd9PC9idXR0b24+CiAgICA8L2Zvcm0+JHtkaXNjKHBhKX08L2Rpdj5gOwogICQoJyNmYUZvcm0nKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4gewogICAgZS5wcmV2ZW50RGVmYXVsdCgpOwogICAgaWYgKGZhICYmICEkKCcjZmFLZXknKS52YWx1ZSkgeyBhd2FpdCBhcGkoYC9hcGkvY29ubmVjdGlvbnMvJHtmYS5pZH0vc2V0dGluZ3Mke3NlbGxlclFTKCl9YCwgeyBtZXRob2Q6ICdQQVRDSCcsIGJvZHk6IHsgYXV0b1JlYWR5OiAkKCcjZmFBdXRvJykuY2hlY2tlZCB9IH0pOyB0b2FzdCgnR3VhcmRhZG8nKTsgcmV0dXJuIGxvYWRDb25uZWN0aW9ucygpOyB9CiAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvY29ubmVjdGlvbnMvZmEnICsgc2VsbGVyUVMoKSwgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyB1c2VySWQ6ICQoJyNmYVVzZXInKS52YWx1ZSwgYXBpS2V5OiAkKCcjZmFLZXknKS52YWx1ZSwgc2VsbGVySWQ6ICQoJyNmYVNpZCcpLnZhbHVlLCBhdXRvUmVhZHk6ICQoJyNmYUF1dG8nKS5jaGVja2VkIH0gfSk7IHRvYXN0KCdGYWxhYmVsbGEgY29uZWN0YWRvJyk7IGxvYWRDb25uZWN0aW9ucygpOyB9CiAgICBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlLCA1MDAwKTsgfQogIH07CiAgJCgnI3BhRm9ybScpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICBlLnByZXZlbnREZWZhdWx0KCk7CiAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvY29ubmVjdGlvbnMvcGEnICsgc2VsbGVyUVMoKSwgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBhcGlLZXk6ICQoJyNwYUtleScpLnZhbHVlIH0gfSk7IHRvYXN0KCdQYXJpcyBjb25lY3RhZG8nKTsgbG9hZENvbm5lY3Rpb25zKCk7IH0KICAgIGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UsIDUwMDApOyB9CiAgfTsKICAkKCcjY29ubicpLm9uY2xpY2sgPSBhc3luYyBlID0+IHsKICAgIGNvbnN0IGQgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1kZWxdJyk7CiAgICBpZiAoZCkgeyBkLmRpc2FibGVkID0gdHJ1ZTsgYXdhaXQgYXBpKGAvYXBpL2Nvbm5lY3Rpb25zLyR7ZC5kYXRhc2V0LmRlbH0ke3NlbGxlclFTKCl9YCwgeyBtZXRob2Q6ICdERUxFVEUnIH0pOyB0b2FzdCgnRGVzY29uZWN0YWRvJyk7IGxvYWRDb25uZWN0aW9ucygpOyB9CiAgICBjb25zdCBjID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtY29weV0nKTsKICAgIGlmIChjKSB7IGUucHJldmVudERlZmF1bHQoKTsgdHJ5IHsgYXdhaXQgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQoYy5kYXRhc2V0LmNvcHkpOyB0b2FzdCgnQ29waWFkbycpOyB9IGNhdGNoIHsgYy5wcmV2aW91c0VsZW1lbnRTaWJsaW5nLnNlbGVjdCgpOyB9IH0KICB9Owp9CgpsZXQgYmxJdGVtcyA9IFtdOwphc3luYyBmdW5jdGlvbiBsb2FkQmxvY2tsaXN0KCkgeyBibEl0ZW1zID0gKGF3YWl0IGFwaSgnL2FwaS9ibG9ja2xpc3QnICsgc2VsbGVyUVMoKSkpLml0ZW1zOyBkcmF3VGFncygpOyB9CmZ1bmN0aW9uIGRyYXdUYWdzKCkgewogIGNvbnN0IHEgPSAoJCgnI2JsUScpPy52YWx1ZSB8fCAnJykudG9Mb3dlckNhc2UoKTsKICBjb25zdCBsaXN0ID0gYmxJdGVtcy5maWx0ZXIoYiA9PiAhcSB8fCBiLnZhbHVlLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMocSkpOwogICQoJyN0YWdzJykuaW5uZXJIVE1MID0gbGlzdC5sZW5ndGggPyBsaXN0Lm1hcChiID0+IGA8c3BhbiBjbGFzcz0idGFnIj4ke2VzYyhiLnZhbHVlKX0gPHNtYWxsPsK3ICR7Yi5tYXJrZXRwbGFjZSA9PT0gJ2FueScgPyAndG9kb3MnIDogTUtbYi5tYXJrZXRwbGFjZV19PC9zbWFsbD48YnV0dG9uIGRhdGEtcm09IiR7Yi5pZH0iIGFyaWEtbGFiZWw9IlF1aXRhciAke2VzYyhiLnZhbHVlKX0iPiR7SS54fTwvYnV0dG9uPjwvc3Bhbj5gKS5qb2luKCcnKQogICAgOiBgPHNwYW4gY2xhc3M9Im11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEzLjVweCI+JHtibEl0ZW1zLmxlbmd0aCA/ICdTaW4gcmVzdWx0YWRvcy4nIDogJ1NpbiBwcm9kdWN0b3MgYmxvcXVlYWRvczogdG9kbyB2YSBhbCBmdWxmaWxsbWVudC4nfTwvc3Bhbj5gOwp9CmFzeW5jIGZ1bmN0aW9uIGxvYWRTZWxsZXJPcmRlcnMoKSB7CiAgaWYgKHRhYiAhPT0gJ3NlbGxlcicgfHwgISQoJyNteVJvd3MnKSkgcmV0dXJuOwogIGxldCBsaXN0OwogIGlmIChtZS51c2VyLnJvbGUgPT09ICdzZWxsZXInKSBsaXN0ID0gKGF3YWl0IGFwaSgnL2FwaS9vcmRlcnM/dmlldz1hbGwnKSkub3JkZXJzOwogIGVsc2UgbGlzdCA9IChhd2FpdCBhcGkoJy9hcGkvb3JkZXJzP3ZpZXc9YWxsJykpLm9yZGVycy5maWx0ZXIobyA9PiBvLnNlbGxlcl9pZCA9PT0gdWkuYWRtaW5TZWxsZXIpOwogICQoJyNteVJvd3MnKS5pbm5lckhUTUwgPSBsaXN0Lmxlbmd0aCA/IGxpc3Quc2xpY2UoMCwgNjApLm1hcChvID0+IGA8dHI+PHRkIGNsYXNzPSJtb25vIj4ke2VzYyhvLm9yZGVyX251bWJlcil9PHNwYW4gY2xhc3M9Im5vdGUiPiR7ZXNjKGZtdFRpbWUoby5zb2xkX2F0IHx8IG8uY3JlYXRlZF9hdCkpfSR7by5jdXN0b21lciA/ICcgwrcgJyArIGVzYyhvLmN1c3RvbWVyKSA6ICcnfTwvc3Bhbj48L3RkPjx0ZD48c3BhbiBjbGFzcz0ibWsgJHtvLm1hcmtldHBsYWNlfSI+JHtNS1tvLm1hcmtldHBsYWNlXSB8fCAnJ308L3NwYW4+PC90ZD48dGQ+JHtpdGVtc0hUTUwobyl9PC90ZD48dGQ+JHtwaWxsKG8pfSR7by5zdGF0ZSA9PT0gJ2Vycm9yJyB8fCBvLnN0YXRlID09PSAnd2FpdGluZycgPyBgPHNwYW4gY2xhc3M9Im5vdGUgJHtvLnN0YXRlID09PSAnZXJyb3InID8gJ2JhZCcgOiAnJ30iPiR7ZXNjKG8uZXJyb3IgfHwgJycpfTwvc3Bhbj5gIDogJyd9PC90ZD48L3RyPmApLmpvaW4oJycpCiAgICA6IGA8dHI+PHRkIGNvbHNwYW49IjQiPjxkaXYgY2xhc3M9ImVtcHR5Ij5Bw7puIG5vIGhheSBwZWRpZG9zLiBDb25lY3RhIHR1cyBtYXJrZXRwbGFjZXMgeSBhcGFyZWNlcsOhbiBhcXXDrS48L2Rpdj48L3RkPjwvdHI+YDsKfQoKLy8gLS0tLS0tLS0tLSBBRE1JTiAtLS0tLS0tLS0tCmFzeW5jIGZ1bmN0aW9uIHJlbmRlckFkbWluKCkgewogIGNvbnN0IFtkLCBzdF0gPSBhd2FpdCBQcm9taXNlLmFsbChbYXBpKCcvYXBpL2FkbWluL3NlbGxlcnMnKSwgYXBpKCcvYXBpL2FkbWluL3NldHRpbmdzJyldKTsKICBjb25zdCBzTmFtZSA9IGlkID0+IGQuc2VsbGVycy5maW5kKHMgPT4gcy5pZCA9PT0gaWQpPy5uYW1lIHx8ICcnOwogIGNvbnN0IHJvbGVOYW1lID0geyBhZG1pbjogJ0FkbWluaXN0cmFkb3InLCBmdWxmaWxsbWVudDogJ0Z1bGZpbGxtZW50Jywgc2VsbGVyOiAnVmVuZGVkb3InIH07CiAgJCgnI21haW4nKS5pbm5lckhUTUwgPSBgCiAgPGRpdiBjbGFzcz0iZ3JpZDIiPgogICAgPGRpdiBjbGFzcz0icGFuZWwiPjxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj5WZW5kZWRvcmVzPC9oMj48L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0icGFuZWwtYm9keSBzdGFjayI+CiAgICAgICAgPGZvcm0gY2xhc3M9InJvdyIgaWQ9Im5ld1NlbGxlciI+PGxhYmVsIGNsYXNzPSJmIj5Ob21icmUgZGUgbGEgdGllbmRhPGlucHV0IHR5cGU9InRleHQiIGlkPSJuc05hbWUiIHJlcXVpcmVkPjwvbGFiZWw+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiIHN0eWxlPSJmbGV4OjAiPkFncmVnYXI8L2J1dHRvbj48L2Zvcm0+CiAgICAgICAgPGRpdiBjbGFzcz0idGFibGUtd3JhcCI+PHRhYmxlIHN0eWxlPSJtaW4td2lkdGg6NDIwcHgiPjx0aGVhZD48dHI+PHRoPlZlbmRlZG9yPC90aD48dGg+TWFya2V0cGxhY2VzPC90aD48dGg+QmxvcXVlYWRvczwvdGg+PHRoPjwvdGg+PC90cj48L3RoZWFkPjx0Ym9keT4KICAgICAgICAke2Quc2VsbGVycy5tYXAocyA9PiBgPHRyPjx0ZD48Yj4ke2VzYyhzLm5hbWUpfTwvYj48L3RkPjx0ZD4ke3MuY29ubmVjdGlvbnMuZmlsdGVyKGMgPT4gTUtbYy5tYXJrZXRwbGFjZV0pLm1hcChjID0+IGA8c3BhbiBjbGFzcz0ibWsgJHtjLm1hcmtldHBsYWNlfSIgdGl0bGU9IiR7ZXNjKGMubGFzdF9lcnJvciB8fCAnT0snKX0iPiR7TUtbYy5tYXJrZXRwbGFjZV19JHtjLmxhc3RfZXJyb3IgPyAnIOKaoCcgOiAnJ308L3NwYW4+YCkuam9pbignICcpIHx8ICc8c3BhbiBjbGFzcz0ibXV0ZWQiPuKAlDwvc3Bhbj4nfTwvdGQ+PHRkPiR7cy5ibG9ja2VkfTwvdGQ+PHRkPjxidXR0b24gY2xhc3M9ImJ0biBidG4tZGFuZ2VyIGJ0bi1zbSIgZGF0YS1kZWxzPSIke3MuaWR9Ij5FbGltaW5hcjwvYnV0dG9uPjwvdGQ+PC90cj5gKS5qb2luKCcnKSB8fCAnPHRyPjx0ZCBjb2xzcGFuPSI0IiBjbGFzcz0ibXV0ZWQiPlNpbiB2ZW5kZWRvcmVzPC90ZD48L3RyPid9CiAgICAgICAgPC90Ym9keT48L3RhYmxlPjwvZGl2PgogICAgICA8L2Rpdj48L2Rpdj4KICAgIDxkaXYgY2xhc3M9InBhbmVsIj48ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj48aDI+VXN1YXJpb3M8L2gyPjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJwYW5lbC1ib2R5IHN0YWNrIj4KICAgICAgICA8Zm9ybSBjbGFzcz0ic3RhY2siIGlkPSJuZXdVc2VyIj4KICAgICAgICAgIDxkaXYgY2xhc3M9InJvdyI+PGxhYmVsIGNsYXNzPSJmIj5Ob21icmU8aW5wdXQgdHlwZT0idGV4dCIgaWQ9Im51TmFtZSIgcmVxdWlyZWQ+PC9sYWJlbD48bGFiZWwgY2xhc3M9ImYiPkNvcnJlbzxpbnB1dCB0eXBlPSJlbWFpbCIgaWQ9Im51RW1haWwiIHJlcXVpcmVkPjwvbGFiZWw+PC9kaXY+CiAgICAgICAgICA8ZGl2IGNsYXNzPSJyb3ciPjxsYWJlbCBjbGFzcz0iZiI+Um9sPHNlbGVjdCBpZD0ibnVSb2xlIj48b3B0aW9uIHZhbHVlPSJzZWxsZXIiPlZlbmRlZG9yPC9vcHRpb24+PG9wdGlvbiB2YWx1ZT0iZnVsZmlsbG1lbnQiPkZ1bGZpbGxtZW50PC9vcHRpb24+PG9wdGlvbiB2YWx1ZT0iYWRtaW4iPkFkbWluaXN0cmFkb3I8L29wdGlvbj48L3NlbGVjdD48L2xhYmVsPgogICAgICAgICAgPGxhYmVsIGNsYXNzPSJmIiBpZD0ibnVTZWxsZXJXcmFwIj5UaWVuZGE8c2VsZWN0IGlkPSJudVNlbGxlciI+JHtkLnNlbGxlcnMubWFwKHMgPT4gYDxvcHRpb24gdmFsdWU9IiR7cy5pZH0iPiR7ZXNjKHMubmFtZSl9PC9vcHRpb24+YCkuam9pbignJyl9PC9zZWxlY3Q+PC9sYWJlbD48L2Rpdj4KICAgICAgICAgIDxkaXYgY2xhc3M9InJvdyI+PGxhYmVsIGNsYXNzPSJmIj5Db250cmFzZcOxYSBpbmljaWFsIChtw61uLiA4KTxpbnB1dCB0eXBlPSJ0ZXh0IiBpZD0ibnVQYXNzIiBtaW5sZW5ndGg9IjgiIHJlcXVpcmVkPjwvbGFiZWw+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiIHN0eWxlPSJmbGV4OjAiPkNyZWFyIHVzdWFyaW88L2J1dHRvbj48L2Rpdj4KICAgICAgICA8L2Zvcm0+CiAgICAgICAgPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjA7Zm9udC1zaXplOjEzcHgiPjxiPkNsYXZlIHRlbXBvcmFsOjwvYj4gY3JlYSB1bmEgY2xhdmUgbnVldmEgcXVlIGxlIGRpY3RhcyBhbCB2ZW5kZWRvcjsgYWwgZW50cmFyIGRlYmUgY2FtYmlhcmxhLiA8Yj5DbGF2ZSBkZSByZXNwYWxkbzo8L2I+IHVuIGPDs2RpZ28gZGUgdW4gc29sbyB1c28gcXVlIGVsIHZlbmRlZG9yIGd1YXJkYSBwb3Igc2kgb2x2aWRhIHN1IGNsYXZlLiA8Yj5FbnRyYXIgY29tbzo8L2I+IGFicmVzIHN1IGN1ZW50YSBzaW4gc2FiZXIgc3UgY2xhdmUsIHBhcmEgYXl1ZGFybG8uPC9wPgogICAgICAgIDxkaXYgY2xhc3M9InRhYmxlLXdyYXAiPjx0YWJsZSBzdHlsZT0ibWluLXdpZHRoOjc2MHB4Ij48dGhlYWQ+PHRyPjx0aD5Vc3VhcmlvPC90aD48dGg+Um9sPC90aD48dGg+QWNjZXNvPC90aD48dGg+PC90aD48L3RyPjwvdGhlYWQ+PHRib2R5PgogICAgICAgICR7ZC51c2Vycy5tYXAodSA9PiBgPHRyPjx0ZD48Yj4ke2VzYyh1Lm5hbWUpfTwvYj48c3BhbiBjbGFzcz0ibm90ZSI+JHtlc2ModS5lbWFpbCl9PC9zcGFuPjwvdGQ+PHRkPiR7cm9sZU5hbWVbdS5yb2xlXX0ke3Uuc2VsbGVyX2lkID8gJyDCtyAnICsgZXNjKHNOYW1lKHUuc2VsbGVyX2lkKSkgOiAnJ308L3RkPjx0ZD4ke3UuaGFzX2JhY2t1cCA/ICc8c3BhbiBjbGFzcz0icGlsbCByZWFkeSIgc3R5bGU9Im1hcmdpbi10b3A6NHB4Ij5SZXNwYWxkbyBsaXN0bzwvc3Bhbj4nIDogJyd9JHt1Lm11c3RfY2hhbmdlID8gJyA8c3BhbiBjbGFzcz0icGlsbCB3YWl0aW5nIiBzdHlsZT0ibWFyZ2luLXRvcDo0cHgiPkRlYmUgY3JlYXIgY2xhdmUgbnVldmE8L3NwYW4+JyA6ICcnfTwvdGQ+PHRkPjxkaXYgY2xhc3M9InJvdy1hY3Rpb25zIj4KICAgICAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tZ2hvc3QgYnRuLXNtIiBkYXRhLWFjdD0idGVtcC1wYXNzd29yZCIgZGF0YS1pZD0iJHt1LmlkfSIgZGF0YS1uYW1lPSIke2VzYyh1Lm5hbWUpfSI+Q2xhdmUgdGVtcG9yYWw8L2J1dHRvbj4KICAgICAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtYWN0PSJiYWNrdXAtY29kZSIgZGF0YS1pZD0iJHt1LmlkfSIgZGF0YS1uYW1lPSIke2VzYyh1Lm5hbWUpfSI+Q2xhdmUgZGUgcmVzcGFsZG88L2J1dHRvbj4KICAgICAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtYWN0PSJzZW5kLWNvZGUiIGRhdGEtaWQ9IiR7dS5pZH0iIGRhdGEtbmFtZT0iJHtlc2ModS5uYW1lKX0iPkVudmlhciBjw7NkaWdvPC9idXR0b24+CiAgICAgICAgICAke3UuaWQgPT09IG1lLnVzZXIuaWQgPyAnJyA6IGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWFjdD0iaW1wZXJzb25hdGUiIGRhdGEtaWQ9IiR7dS5pZH0iIGRhdGEtbmFtZT0iJHtlc2ModS5uYW1lKX0iPkVudHJhciBjb21vPC9idXR0b24+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1kYW5nZXIgYnRuLXNtIiBkYXRhLWRlbHU9IiR7dS5pZH0iPkVsaW1pbmFyPC9idXR0b24+YH08L2Rpdj48L3RkPjwvdHI+YCkuam9pbignJyl9CiAgICAgICAgPC90Ym9keT48L3RhYmxlPjwvZGl2PgogICAgICA8L2Rpdj48L2Rpdj4KICA8L2Rpdj4KICA8ZGl2IGNsYXNzPSJwYW5lbCIgc3R5bGU9Im1hcmdpbi10b3A6MjBweCI+PGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+PGgyPkVubGFjZXMgw7p0aWxlczwvaDI+PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbC1ib2R5Ij48dWwgc3R5bGU9Imxpc3Qtc3R5bGU6bm9uZTttYXJnaW46MDtwYWRkaW5nOjAiPjxsaSBzdHlsZT0iZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MnB4O3BhZGRpbmc6MTBweCAwO2JvcmRlci10b3A6MXB4IHNvbGlkIHZhcigtLWxpbmUpIj48YSBocmVmPSJodHRwczovL2V0aXF1ZXRhaHViLWphdmkub25yZW5kZXIuY29tIiB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciIgc3R5bGU9ImZvbnQtd2VpZ2h0OjcwMCI+VHUgYXBwIEV0aXF1ZXRhSHViPC9hPjxzcGFuIGNsYXNzPSJtb25vIG11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEycHgiPmh0dHBzOi8vZXRpcXVldGFodWItamF2aS5vbnJlbmRlci5jb208L3NwYW4+PHNwYW4gY2xhc3M9Im11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEzcHgiPkVzdGEgbWlzbWEgYXBwLiBDb21ww6FydGVsYSBjb24gbG9zIHZlbmRlZG9yZXMgeSBlbCBmdWxmaWxsbWVudC48L3NwYW4+PC9saT48bGkgc3R5bGU9ImRpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjJweDtwYWRkaW5nOjEwcHggMDtib3JkZXItdG9wOjFweCBzb2xpZCB2YXIoLS1saW5lKSI+PGEgaHJlZj0iaHR0cHM6Ly9kZXZlbG9wZXJzLm1lcmNhZG9saWJyZS5jbC9kZXZjZW50ZXIiIHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIiBzdHlsZT0iZm9udC13ZWlnaHQ6NzAwIj5NZXJjYWRvIExpYnJlIERldmVsb3BlcnM8L2E+PHNwYW4gY2xhc3M9Im1vbm8gbXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTJweCI+aHR0cHM6Ly9kZXZlbG9wZXJzLm1lcmNhZG9saWJyZS5jbC9kZXZjZW50ZXI8L3NwYW4+PHNwYW4gY2xhc3M9Im11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEzcHgiPkRvbmRlIGVzdMOhIGxhIGFwbGljYWNpw7NuIEV0aXF1ZXRhSHViIHkgc3UgU2VjcmV0IEtleS4gRW50cmFzIGNvbiB0dSBjdWVudGEgbm9ybWFsIGRlIE1lcmNhZG8gTGlicmUuPC9zcGFuPjwvbGk+PGxpIHN0eWxlPSJkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDoycHg7cGFkZGluZzoxMHB4IDA7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tbGluZSkiPjxhIGhyZWY9Imh0dHBzOi8vZGFzaGJvYXJkLnJlbmRlci5jb20iIHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIiBzdHlsZT0iZm9udC13ZWlnaHQ6NzAwIj5SZW5kZXI8L2E+PHNwYW4gY2xhc3M9Im1vbm8gbXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTJweCI+aHR0cHM6Ly9kYXNoYm9hcmQucmVuZGVyLmNvbTwvc3Bhbj48c3BhbiBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTNweCI+RG9uZGUgdml2ZSBsYSBhcHAuIEFxdcOtIHNlIHB1YmxpY2EgY2FkYSB2ZXJzacOzbiBudWV2YSAoTWFudWFsIERlcGxveSkuPC9zcGFuPjwvbGk+PGxpIHN0eWxlPSJkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDoycHg7cGFkZGluZzoxMHB4IDA7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tbGluZSkiPjxhIGhyZWY9Imh0dHBzOi8vZ2l0aHViLmNvbS9lZHVhcmRvZGluYXJkaTk2LWJvb3AvZXRpcXVldGFodWIiIHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIiBzdHlsZT0iZm9udC13ZWlnaHQ6NzAwIj5HaXRIdWI8L2E+PHNwYW4gY2xhc3M9Im1vbm8gbXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTJweCI+aHR0cHM6Ly9naXRodWIuY29tL2VkdWFyZG9kaW5hcmRpOTYtYm9vcC9ldGlxdWV0YWh1Yjwvc3Bhbj48c3BhbiBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTNweCI+RWwgY8OzZGlnbyBkZSBsYSBhcHAgeSBlbCByZXNwYWxkbyBhdXRvbcOhdGljbyBjYWRhIDE1IG1pbnV0b3MuPC9zcGFuPjwvbGk+PGxpIHN0eWxlPSJkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDoycHg7cGFkZGluZzoxMHB4IDA7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tbGluZSkiPjxhIGhyZWY9Imh0dHBzOi8vYXBwLmJyZXZvLmNvbSIgdGFyZ2V0PSJfYmxhbmsiIHJlbD0ibm9vcGVuZXIiIHN0eWxlPSJmb250LXdlaWdodDo3MDAiPkJyZXZvPC9hPjxzcGFuIGNsYXNzPSJtb25vIG11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEycHgiPmh0dHBzOi8vYXBwLmJyZXZvLmNvbTwvc3Bhbj48c3BhbiBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTNweCI+RWwgc2VydmljaW8gcXVlIGVudsOtYSBsb3MgY29ycmVvcyBjb24gY8OzZGlnb3MgcGFyYSByZWN1cGVyYXIgY29udHJhc2XDsWEuPC9zcGFuPjwvbGk+PC91bD48L2Rpdj48L2Rpdj4KICA8ZGl2IGNsYXNzPSJwYW5lbCIgc3R5bGU9Im1hcmdpbi10b3A6MjBweCI+PGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+PGgyPkNvbmV4acOzbiBjb24gTWVyY2FkbyBMaWJyZTwvaDI+JHtzdC5tbF9jbGllbnRfaWQgJiYgc3QubWxfc2VjcmV0X3NldCA/ICc8c3BhbiBjbGFzcz0ic3RhdGUgb24iPjxpPjwvaT5Db25maWd1cmFkYTwvc3Bhbj4nIDogJzxzcGFuIGNsYXNzPSJzdGF0ZSBlcnIiPjxpPjwvaT5GYWx0YSBjb25maWd1cmFyPC9zcGFuPid9PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbC1ib2R5IHN0YWNrIj4KICAgICAgPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjAiPkNyZWEgdW5hIGFwbGljYWNpw7NuIGVuIDxhIGhyZWY9Imh0dHBzOi8vZGV2ZWxvcGVycy5tZXJjYWRvbGlicmUuY2wvZGV2Y2VudGVyIiB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciI+ZGV2ZWxvcGVycy5tZXJjYWRvbGlicmUuY2w8L2E+IGNvbiBlc3RvcyBkYXRvcyB5IHBlZ2EgYXF1w60gc3UgQXBwIElEIHkgU2VjcmV0IEtleS4gVW5hIHNvbGEgYXBwIHNpcnZlIHBhcmEgdG9kb3MgbG9zIHZlbmRlZG9yZXMuPC9wPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPlVSSSBkZSByZWRpcmVjdDxzcGFuIGNsYXNzPSJjb3B5Ij48aW5wdXQgdHlwZT0idGV4dCIgcmVhZG9ubHkgdmFsdWU9IiR7ZXNjKHN0Lm1sX3JlZGlyZWN0X3VyaSl9Ij48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWNvcHk9IiR7ZXNjKHN0Lm1sX3JlZGlyZWN0X3VyaSl9Ij5Db3BpYXI8L2J1dHRvbj48L3NwYW4+PC9sYWJlbD4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5VUkwgZGUgbm90aWZpY2FjaW9uZXMgKHTDs3BpY29zOiBvcmRlcnNfdjIgeSBzaGlwbWVudHMpPHNwYW4gY2xhc3M9ImNvcHkiPjxpbnB1dCB0eXBlPSJ0ZXh0IiByZWFkb25seSB2YWx1ZT0iJHtlc2Moc3QubWxfbm90aWZpY2F0aW9uc191cmwpfSI+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1jb3B5PSIke2VzYyhzdC5tbF9ub3RpZmljYXRpb25zX3VybCl9Ij5Db3BpYXI8L2J1dHRvbj48L3NwYW4+PC9sYWJlbD4KICAgICAgPGZvcm0gY2xhc3M9InJvdyIgaWQ9Im1sQ2ZnIj48bGFiZWwgY2xhc3M9ImYiPkFwcCBJRDxpbnB1dCB0eXBlPSJ0ZXh0IiBpZD0ibWxJZCIgdmFsdWU9IiR7ZXNjKHN0Lm1sX2NsaWVudF9pZCl9IiByZXF1aXJlZD48L2xhYmVsPjxsYWJlbCBjbGFzcz0iZiI+U2VjcmV0IEtleTxpbnB1dCB0eXBlPSJwYXNzd29yZCIgaWQ9Im1sU2VjcmV0IiBwbGFjZWhvbGRlcj0iJHtzdC5tbF9zZWNyZXRfc2V0ID8gJ+KAouKAouKAouKAouKAouKAoiAoZ3VhcmRhZGEpJyA6ICcnfSI+PC9sYWJlbD48YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIHR5cGU9InN1Ym1pdCIgc3R5bGU9ImZsZXg6MCI+R3VhcmRhcjwvYnV0dG9uPjwvZm9ybT4KICAgIDwvZGl2PjwvZGl2PgogIDxkaXYgY2xhc3M9InBhbmVsIiBzdHlsZT0ibWFyZ2luLXRvcDoyMHB4Ij48ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj48aDI+Q29ycmVvcyAocmVjdXBlcmFyIGNvbnRyYXNlw7FhKTwvaDI+JHtzdC5tYWlsX2tleV9zZXQgJiYgc3QubWFpbF9mcm9tID8gJzxzcGFuIGNsYXNzPSJzdGF0ZSBvbiI+PGk+PC9pPkFjdGl2YWRvPC9zcGFuPicgOiAnPHNwYW4gY2xhc3M9InN0YXRlIGVyciI+PGk+PC9pPlNpbiBjb25maWd1cmFyPC9zcGFuPid9PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbC1ib2R5IHN0YWNrIj4KICAgICAgPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjAiPlBhcmEgZW52aWFyIGxvcyBjw7NkaWdvcyBkZSA2IGTDrWdpdG9zIHNlIHVzYSA8YSBocmVmPSJodHRwczovL3d3dy5icmV2by5jb20iIHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIj5CcmV2bzwvYT4gKGdyYXRpcyBoYXN0YSAzMDAgY29ycmVvcyBhbCBkw61hKS4gQ3JlYSB1bmEgY3VlbnRhLCB2ZXJpZmljYSBlbCBjb3JyZW8gcmVtaXRlbnRlIHkgY29waWEgdW5hIEFQSSBLZXkgKENvbmZpZ3VyYWNpw7NuIOKAuiBTTVRQIHkgQVBJIOKAuiBBUEkgS2V5cykuPC9wPgogICAgICA8Zm9ybSBjbGFzcz0ic3RhY2siIGlkPSJtYWlsQ2ZnIj4KICAgICAgICA8ZGl2IGNsYXNzPSJyb3ciPjxsYWJlbCBjbGFzcz0iZiI+Q29ycmVvIHJlbWl0ZW50ZSAodmVyaWZpY2FkbyBlbiBCcmV2byk8aW5wdXQgdHlwZT0iZW1haWwiIGlkPSJtRnJvbSIgdmFsdWU9IiR7ZXNjKHN0Lm1haWxfZnJvbSB8fCAnJyl9IiByZXF1aXJlZD48L2xhYmVsPjxsYWJlbCBjbGFzcz0iZiI+Tm9tYnJlIHJlbWl0ZW50ZTxpbnB1dCB0eXBlPSJ0ZXh0IiBpZD0ibU5hbWUiIHZhbHVlPSIke2VzYyhzdC5tYWlsX2Zyb21fbmFtZSB8fCAnRXRpcXVldGFIdWInKX0iPjwvbGFiZWw+PC9kaXY+CiAgICAgICAgPGRpdiBjbGFzcz0icm93Ij48bGFiZWwgY2xhc3M9ImYiPkFQSSBLZXkgZGUgQnJldm88aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJtS2V5IiBwbGFjZWhvbGRlcj0iJHtzdC5tYWlsX2tleV9zZXQgPyAn4oCi4oCi4oCi4oCi4oCi4oCiIChndWFyZGFkYSknIDogJ3hrZXlzaWIt4oCmJ30iPjwvbGFiZWw+PGxhYmVsIGNsYXNzPSJmIj5FbnZpYXIgcHJ1ZWJhIGEgKG9wY2lvbmFsKTxpbnB1dCB0eXBlPSJlbWFpbCIgaWQ9Im1UZXN0IiB2YWx1ZT0iJHtlc2MobWUudXNlci5lbWFpbCl9Ij48L2xhYmVsPjwvZGl2PgogICAgICAgIDxkaXYgY2xhc3M9InJvdyIgc3R5bGU9Imp1c3RpZnktY29udGVudDpmbGV4LWVuZCI+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiIHN0eWxlPSJmbGV4OjAiPkd1YXJkYXI8L2J1dHRvbj48L2Rpdj4KICAgICAgPC9mb3JtPgogICAgPC9kaXY+PC9kaXY+CiAgPGRpdiBjbGFzcz0ibW9kYWwiIGlkPSJjb25maXJtIiBoaWRkZW4+PGRpdiBjbGFzcz0ic2hlZXQiPjxoMyBpZD0iY2ZUaXRsZSI+wr9TZWd1cm8/PC9oMz48cCBjbGFzcz0ibXV0ZWQiIGlkPSJjZlRleHQiIHN0eWxlPSJtYXJnaW46MCI+PC9wPjxkaXYgaWQ9ImNmRXh0cmEiPjwvZGl2PjxkaXYgY2xhc3M9InJvdyIgc3R5bGU9Imp1c3RpZnktY29udGVudDpmbGV4LWVuZCI+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIiBpZD0iY2ZObyIgc3R5bGU9ImZsZXg6MCI+Q2FuY2VsYXI8L2J1dHRvbj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIGlkPSJjZlllcyIgc3R5bGU9ImZsZXg6MCI+Q29uZmlybWFyPC9idXR0b24+PC9kaXY+PC9kaXY+PC9kaXY+YDsKICBjb25zdCByb2xlID0gJCgnI251Um9sZScpOyBjb25zdCBzeW5jID0gKCkgPT4gJCgnI251U2VsbGVyV3JhcCcpLmhpZGRlbiA9IHJvbGUudmFsdWUgIT09ICdzZWxsZXInOyByb2xlLm9uY2hhbmdlID0gc3luYzsgc3luYygpOwogICQoJyNuZXdTZWxsZXInKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4geyBlLnByZXZlbnREZWZhdWx0KCk7IHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9hZG1pbi9zZWxsZXJzJywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBuYW1lOiAkKCcjbnNOYW1lJykudmFsdWUgfSB9KTsgdG9hc3QoJ1ZlbmRlZG9yIGFncmVnYWRvJyk7IHJlbmRlckFkbWluKCk7IH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IH0gfTsKICAkKCcjbmV3VXNlcicpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7IGUucHJldmVudERlZmF1bHQoKTsgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL2FkbWluL3VzZXJzJywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBuYW1lOiAkKCcjbnVOYW1lJykudmFsdWUsIGVtYWlsOiAkKCcjbnVFbWFpbCcpLnZhbHVlLCByb2xlOiByb2xlLnZhbHVlLCBzZWxsZXJfaWQ6ICQoJyNudVNlbGxlcicpLnZhbHVlLCBwYXNzd29yZDogJCgnI251UGFzcycpLnZhbHVlIH0gfSk7IHRvYXN0KCdVc3VhcmlvIGNyZWFkbycpOyByZW5kZXJBZG1pbigpOyB9IGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UsIDQwMDApOyB9IH07CiAgY29uc3QgY29uZmlybUJveCA9ICh0aXRsZSwgdGV4dCwgZXh0cmEgPSAnJykgPT4gbmV3IFByb21pc2UocmVzID0+IHsKICAgICQoJyNjZlRpdGxlJykudGV4dENvbnRlbnQgPSB0aXRsZTsgJCgnI2NmVGV4dCcpLnRleHRDb250ZW50ID0gdGV4dDsgJCgnI2NmRXh0cmEnKS5pbm5lckhUTUwgPSBleHRyYTsgJCgnI2NvbmZpcm0nKS5oaWRkZW4gPSBmYWxzZTsKICAgICQoJyNjZk5vJykub25jbGljayA9ICgpID0+IHsgJCgnI2NvbmZpcm0nKS5oaWRkZW4gPSB0cnVlOyByZXMoZmFsc2UpOyB9OwogICAgJCgnI2NmWWVzJykub25jbGljayA9ICgpID0+IHsgJCgnI2NvbmZpcm0nKS5oaWRkZW4gPSB0cnVlOyByZXModHJ1ZSk7IH07CiAgfSk7CiAgJCgnI21haWxDZmcnKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4gewogICAgZS5wcmV2ZW50RGVmYXVsdCgpOwogICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL2FkbWluL3NldHRpbmdzJywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBtYWlsX2Zyb206ICQoJyNtRnJvbScpLnZhbHVlLCBtYWlsX2Zyb21fbmFtZTogJCgnI21OYW1lJykudmFsdWUsIG1haWxfYXBpX2tleTogJCgnI21LZXknKS52YWx1ZSwgdGVzdF90bzogJCgnI21UZXN0JykudmFsdWUgfSB9KTsgdG9hc3QoJCgnI21UZXN0JykudmFsdWUgPyAnR3VhcmRhZG8uIFRlIGVudmlhbW9zIHVuIGNvcnJlbyBkZSBwcnVlYmEuJyA6ICdHdWFyZGFkbycpOyByZW5kZXJBZG1pbigpOyB9CiAgICBjYXRjaCAoeCkgeyB0b2FzdCh4Lm1lc3NhZ2UsIDUwMDApOyB9CiAgfTsKICAkKCcjbWxDZmcnKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4geyBlLnByZXZlbnREZWZhdWx0KCk7IGF3YWl0IGFwaSgnL2FwaS9hZG1pbi9zZXR0aW5ncycsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgbWxfY2xpZW50X2lkOiAkKCcjbWxJZCcpLnZhbHVlLCBtbF9jbGllbnRfc2VjcmV0OiAkKCcjbWxTZWNyZXQnKS52YWx1ZSB9IH0pOyB0b2FzdCgnTWVyY2FkbyBMaWJyZSBjb25maWd1cmFkbycpOyBtZS5tbENvbmZpZ3VyZWQgPSB0cnVlOyByZW5kZXJBZG1pbigpOyB9OwogICQoJyNtYWluJykub25jbGljayA9IGFzeW5jIGUgPT4gewogICAgY29uc3QgY3AgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1jb3B5XScpOwogICAgaWYgKGNwKSB7IGUucHJldmVudERlZmF1bHQoKTsgdHJ5IHsgYXdhaXQgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQoY3AuZGF0YXNldC5jb3B5KTsgdG9hc3QoJ0NvcGlhZG8nKTsgfSBjYXRjaCB7IGNwLnByZXZpb3VzRWxlbWVudFNpYmxpbmcuc2VsZWN0KCk7IH0gcmV0dXJuOyB9CiAgICBjb25zdCBhY3QgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1hY3RdJyk7CiAgICBpZiAoYWN0KSB7CiAgICAgIGNvbnN0IGlkID0gYWN0LmRhdGFzZXQuaWQsIG5hbWUgPSBhY3QuZGF0YXNldC5uYW1lLCBraW5kID0gYWN0LmRhdGFzZXQuYWN0OwogICAgICBjb25zdCB0ZXh0cyA9IHsKICAgICAgICAndGVtcC1wYXNzd29yZCc6IFsnQ2xhdmUgdGVtcG9yYWwnLCBgU2UgcmVlbXBsYXphIGxhIGNsYXZlIGFjdHVhbCBkZSAke25hbWV9LiBBbCBlbnRyYXIgY29uIGxhIGNsYXZlIHRlbXBvcmFsIHRlbmRyw6EgcXVlIGNyZWFyIHVuYSBudWV2YS5gXSwKICAgICAgICAnYmFja3VwLWNvZGUnOiBbJ0NsYXZlIGRlIHJlc3BhbGRvJywgYFNlIGNyZWEgdW4gY8OzZGlnbyBkZSB1biBzb2xvIHVzbyBwYXJhICR7bmFtZX0uIFNpIHlhIHRlbsOtYSB1bm8sIGVsIGFudGVyaW9yIGRlamEgZGUgc2VydmlyLmBdLAogICAgICAgICdzZW5kLWNvZGUnOiBbJ0VudmlhciBjw7NkaWdvJywgYExlIGxsZWdhIGEgJHtuYW1lfSB1biBjw7NkaWdvIGRlIDYgZMOtZ2l0b3MgYSBzdSBjb3JyZW8gcGFyYSBlbnRyYXIgbyBjYW1iaWFyIHN1IGNsYXZlLmBdLAogICAgICAgICdpbXBlcnNvbmF0ZSc6IFsnRW50cmFyIGNvbW8gJyArIG5hbWUsICdWZXLDoXMgbGEgYXBwIGNvbW8gbGEgdmUgZXN0YSBwZXJzb25hLCBzaW4gbmVjZXNpdGFyIHN1IGNsYXZlLiBRdWVkYSByZWdpc3RyYWRvLiBQYXJhIHNhbGlyIGFwcmlldGEgIlZvbHZlciBhIG1pIGN1ZW50YSIuJ10sCiAgICAgIH07CiAgICAgIGlmICghYXdhaXQgY29uZmlybUJveCh0ZXh0c1traW5kXVswXSwgdGV4dHNba2luZF1bMV0pKSByZXR1cm47CiAgICAgIHRyeSB7CiAgICAgICAgY29uc3QgciA9IGF3YWl0IGFwaShgL2FwaS9hZG1pbi91c2Vycy8ke2lkfS8ke2tpbmR9YCwgeyBtZXRob2Q6ICdQT1NUJyB9KTsKICAgICAgICBpZiAoa2luZCA9PT0gJ2ltcGVyc29uYXRlJykgeyBsb2NhdGlvbi5ocmVmID0gJy8nOyByZXR1cm47IH0KICAgICAgICBpZiAoci5wYXNzd29yZCB8fCByLmNvZGUpIHsKICAgICAgICAgIGNvbnN0IHZhbCA9IHIucGFzc3dvcmQgfHwgci5jb2RlOwogICAgICAgICAgYXdhaXQgY29uZmlybUJveChraW5kID09PSAndGVtcC1wYXNzd29yZCcgPyAnQ2xhdmUgdGVtcG9yYWwgZGUgJyArIG5hbWUgOiAnQ2xhdmUgZGUgcmVzcGFsZG8gZGUgJyArIG5hbWUsCiAgICAgICAgICAgIGtpbmQgPT09ICd0ZW1wLXBhc3N3b3JkJyA/ICdEw61zZWxhIGFsIHVzdWFyaW8uIFNvbG8gc2UgbXVlc3RyYSBhaG9yYTsgYWwgZW50cmFyIHRlbmRyw6EgcXVlIGNyZWFyIHN1IHByb3BpYSBjbGF2ZS4nIDogJ1DDoXNhc2VsYSBhbCB1c3VhcmlvIHBhcmEgcXVlIGxhIGd1YXJkZSBlbiB1biBsdWdhciBzZWd1cm8uIFNpcnZlIHVuYSBzb2xhIHZleiwgZW4gZWwgY2FtcG8gQ29udHJhc2XDsWEuIFNvbG8gc2UgbXVlc3RyYSBhaG9yYS4nLAogICAgICAgICAgICBgPGRpdiBjbGFzcz0iY29weSI+PGlucHV0IHR5cGU9InRleHQiIHJlYWRvbmx5IHZhbHVlPSIke2VzYyh2YWwpfSIgc3R5bGU9ImZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZToyMHB4O3RleHQtYWxpZ246Y2VudGVyIj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWNvcHk9IiR7ZXNjKHZhbCl9Ij5Db3BpYXI8L2J1dHRvbj48L2Rpdj5gKTsKICAgICAgICB9IGVsc2UgdG9hc3Qoci5tZXNzYWdlIHx8ICdMaXN0bycpOwogICAgICAgIHJlbmRlckFkbWluKCk7CiAgICAgIH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSwgNTAwMCk7IH0KICAgICAgcmV0dXJuOwogICAgfQogICAgY29uc3QgcyA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLWRlbHNdJyksIHUgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1kZWx1XScpLCBwID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtcHddJyk7CiAgICBpZiAocyAmJiBhd2FpdCBjb25maXJtQm94KCdFbGltaW5hciB2ZW5kZWRvcicsICdTZSBib3JyYW4gc3VzIGNvbmV4aW9uZXMsIGJsb3F1ZW9zLCBwZWRpZG9zIHkgdXN1YXJpb3MuJykpIHsgYXdhaXQgYXBpKGAvYXBpL2FkbWluL3NlbGxlcnMvJHtzLmRhdGFzZXQuZGVsc31gLCB7IG1ldGhvZDogJ0RFTEVURScgfSk7IHRvYXN0KCdWZW5kZWRvciBlbGltaW5hZG8nKTsgcmVuZGVyQWRtaW4oKTsgfQogICAgaWYgKHUgJiYgYXdhaXQgY29uZmlybUJveCgnRWxpbWluYXIgdXN1YXJpbycsICdZYSBubyBwb2Ryw6EgZW50cmFyIGEgRXRpcXVldGFIdWIuJykpIHsgYXdhaXQgYXBpKGAvYXBpL2FkbWluL3VzZXJzLyR7dS5kYXRhc2V0LmRlbHV9YCwgeyBtZXRob2Q6ICdERUxFVEUnIH0pOyB0b2FzdCgnVXN1YXJpbyBlbGltaW5hZG8nKTsgcmVuZGVyQWRtaW4oKTsgfQogICAgaWYgKHAgJiYgYXdhaXQgY29uZmlybUJveCgnQ2FtYmlhciBjb250cmFzZcOxYScsICdFc2NyaWJlIGxhIG51ZXZhIGNvbnRyYXNlw7FhIChtw61uaW1vIDggY2FyYWN0ZXJlcykuJywgJzxpbnB1dCB0eXBlPSJ0ZXh0IiBpZD0iY2ZQdyIgbWlubGVuZ3RoPSI4Ij4nKSkgewogICAgICB0cnkgeyBhd2FpdCBhcGkoYC9hcGkvYWRtaW4vdXNlcnMvJHtwLmRhdGFzZXQucHd9L3Bhc3N3b3JkYCwgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBwYXNzd29yZDogJCgnI2NmUHcnKS52YWx1ZSB9IH0pOyB0b2FzdCgnQ29udHJhc2XDsWEgYWN0dWFsaXphZGEnKTsgfSBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlKTsgfQogICAgfQogIH07Cn0KCi8vIC0tLS0tLS0tLS0gbWkgY2xhdmUgLS0tLS0tLS0tLQpmdW5jdGlvbiByZW5kZXJNeUFjY291bnQoZm9yY2VkID0gZmFsc2UpIHsKICAkKCcjYXBwJykuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9ImxvZ2luIj48ZGl2IGNsYXNzPSJjYXJkIj48ZGl2IGNsYXNzPSJhcnQiPiR7SEVST19TVkd9PC9kaXY+PGZvcm0gaWQ9Im15Rm9ybSI+CiAgICA8aDE+JHtmb3JjZWQgPyAnQ3JlYSB0dSBjbGF2ZSBudWV2YScgOiAnTWkgY2xhdmUnfTwvaDE+CiAgICA8cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJtYXJnaW46MCI+JHtmb3JjZWQgPyAnRW50cmFzdGUgY29uIHVuYSBjbGF2ZSB0ZW1wb3JhbCBvIGRlIHJlc3BhbGRvLiBDcmVhIHR1IHByb3BpYSBjb250cmFzZcOxYSBwYXJhIHNlZ3Vpci4nIDogZXNjKG1lLnVzZXIuZW1haWwpfTwvcD4KICAgICR7Zm9yY2VkID8gJycgOiAnPGxhYmVsIGNsYXNzPSJmIj5Db250cmFzZcOxYSBhY3R1YWw8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJtQ3VyIiBhdXRvY29tcGxldGU9ImN1cnJlbnQtcGFzc3dvcmQiIHJlcXVpcmVkPjwvbGFiZWw+J30KICAgIDxsYWJlbCBjbGFzcz0iZiI+TnVldmEgY29udHJhc2XDsWEgKG3DrW5pbW8gOCk8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJtUDEiIGF1dG9jb21wbGV0ZT0ibmV3LXBhc3N3b3JkIiBtaW5sZW5ndGg9IjgiIHJlcXVpcmVkPjwvbGFiZWw+CiAgICA8bGFiZWwgY2xhc3M9ImYiPlJlcMOtdGVsYTxpbnB1dCB0eXBlPSJwYXNzd29yZCIgaWQ9Im1QMiIgYXV0b2NvbXBsZXRlPSJuZXctcGFzc3dvcmQiIG1pbmxlbmd0aD0iOCIgcmVxdWlyZWQ+PC9sYWJlbD4KICAgIDxsYWJlbCBjbGFzcz0ic3dpdGNoIiBzdHlsZT0iZm9udC1zaXplOjEzcHgiPjxpbnB1dCB0eXBlPSJjaGVja2JveCIgaWQ9Im1TaG93Ij4gTW9zdHJhciBjb250cmFzZcOxYTwvbGFiZWw+CiAgICA8ZGl2IGNsYXNzPSJlcnIiIGlkPSJtRXJyIj48L2Rpdj4KICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgdHlwZT0ic3VibWl0Ij5HdWFyZGFyPC9idXR0b24+CiAgICAke2ZvcmNlZCA/ICcnIDogJzxidXR0b24gY2xhc3M9ImJ0biBidG4tZ2hvc3QiIHR5cGU9ImJ1dHRvbiIgaWQ9Im1CYWNrdXAiPkNyZWFyIG1pIGNsYXZlIGRlIHJlc3BhbGRvPC9idXR0b24+PGRpdiBpZD0ibUJhY2t1cE91dCI+PC9kaXY+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIiB0eXBlPSJidXR0b24iIGlkPSJtQmFjayI+Vm9sdmVyPC9idXR0b24+J30KICA8L2Zvcm0+PC9kaXY+PC9kaXY+YDsKICAkKCcjbVNob3cnKS5vbmNoYW5nZSA9IGUgPT4geyAkJCgnI215Rm9ybSBpbnB1dFt0eXBlPXBhc3N3b3JkXSwgI215Rm9ybSBpbnB1dFtkYXRhLXB3XScpLmZvckVhY2goaSA9PiB7IGkuZGF0YXNldC5wdyA9IDE7IGkudHlwZSA9IGUudGFyZ2V0LmNoZWNrZWQgPyAndGV4dCcgOiAncGFzc3dvcmQnOyB9KTsgfTsKICAkKCcjbXlGb3JtJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgIGUucHJldmVudERlZmF1bHQoKTsKICAgIGlmICgkKCcjbVAxJykudmFsdWUgIT09ICQoJyNtUDInKS52YWx1ZSkgcmV0dXJuICgkKCcjbUVycicpLnRleHRDb250ZW50ID0gJ0xhcyBjb250cmFzZcOxYXMgbm8gY29pbmNpZGVuJyk7CiAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvbWUvcGFzc3dvcmQnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGN1cnJlbnQ6IGZvcmNlZCA/ICcnIDogJCgnI21DdXInKS52YWx1ZSwgcGFzc3dvcmQ6ICQoJyNtUDEnKS52YWx1ZSB9IH0pOyB0b2FzdCgnQ29udHJhc2XDsWEgZ3VhcmRhZGEnKTsgYm9vdCgpOyB9CiAgICBjYXRjaCAoeCkgeyAkKCcjbUVycicpLnRleHRDb250ZW50ID0geC5tZXNzYWdlOyB9CiAgfTsKICBpZiAoIWZvcmNlZCkgewogICAgJCgnI21CYWNrJykub25jbGljayA9ICgpID0+IGJvb3QoKTsKICAgICQoJyNtQmFja3VwJykub25jbGljayA9IGFzeW5jICgpID0+IHsKICAgICAgdHJ5IHsKICAgICAgICBjb25zdCByID0gYXdhaXQgYXBpKCcvYXBpL21lL2JhY2t1cC1jb2RlJywgeyBtZXRob2Q6ICdQT1NUJyB9KTsKICAgICAgICAkKCcjbUJhY2t1cE91dCcpLmlubmVySFRNTCA9IGA8cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTNweDttYXJnaW46MCAwIDZweCI+R3XDoXJkYWxhIGVuIHVuIGx1Z2FyIHNlZ3VybyAoZm90bywgcGFwZWwgbyBub3RhcyBkZWwgY2VsdWxhcikuIFNpcnZlIHVuYSBzb2xhIHZleiBlbiBlbCBjYW1wbyBDb250cmFzZcOxYSBzaSBvbHZpZGFzIHR1IGNsYXZlLiBTaSBjcmVhcyBvdHJhLCBlc3RhIGRlamEgZGUgc2VydmlyLjwvcD48aW5wdXQgdHlwZT0idGV4dCIgcmVhZG9ubHkgdmFsdWU9IiR7ZXNjKHIuY29kZSl9IiBzdHlsZT0iZm9udC1mYW1pbHk6dmFyKC0tbW9ubyk7Zm9udC1zaXplOjIwcHg7dGV4dC1hbGlnbjpjZW50ZXIiPmA7CiAgICAgIH0gY2F0Y2ggKHgpIHsgJCgnI21FcnInKS50ZXh0Q29udGVudCA9IHgubWVzc2FnZTsgfQogICAgfTsKICB9Cn0KCi8vIC0tLS0tLS0tLS0gaW5pY2lvIC0tLS0tLS0tLS0KYXN5bmMgZnVuY3Rpb24gYm9vdCgpIHsKICB0cnkgeyBtZSA9IGF3YWl0IGFwaSgnL2FwaS9tZScpOyB9CiAgY2F0Y2ggewogICAgY29uc3QgaCA9IGF3YWl0IGZldGNoKCcvYXBpL3NldHVwLXN0YXR1cycpLnRoZW4ociA9PiByLmpzb24oKSkuY2F0Y2goKCkgPT4gKHt9KSk7CiAgICByZXR1cm4gaC5uZWVkc1NldHVwID8gcmVuZGVyU2V0dXAoKSA6IHJlbmRlckxvZ2luKGguZGVtbyk7CiAgfQogIGZpcnN0TG9hZCA9IHRydWU7CiAgaWYgKG1lLm11c3RDaGFuZ2UpIHJldHVybiByZW5kZXJNeUFjY291bnQodHJ1ZSk7CiAgcmVuZGVyU2hlbGwoKTsKfQpib290KCk7Cn0pKCk7Cg==","index.html":"PCFkb2N0eXBlIGh0bWw+CjxodG1sIGxhbmc9ImVzIj4KPGhlYWQ+CjxtZXRhIGNoYXJzZXQ9InV0Zi04Ij4KPG1ldGEgbmFtZT0idmlld3BvcnQiIGNvbnRlbnQ9IndpZHRoPWRldmljZS13aWR0aCwgaW5pdGlhbC1zY2FsZT0xLCB2aWV3cG9ydC1maXQ9Y292ZXIiPgo8dGl0bGU+RXRpcXVldGFIdWI8L3RpdGxlPgo8bGluayByZWw9Imljb24iIGhyZWY9Ii9sb2dvLnN2ZyIgdHlwZT0iaW1hZ2Uvc3ZnK3htbCI+CjxsaW5rIHJlbD0icHJlY29ubmVjdCIgaHJlZj0iaHR0cHM6Ly9mb250cy5nb29nbGVhcGlzLmNvbSI+CjxsaW5rIHJlbD0ic3R5bGVzaGVldCIgaHJlZj0iaHR0cHM6Ly9mb250cy5nb29nbGVhcGlzLmNvbS9jc3MyP2ZhbWlseT1CYWxvbysyOndnaHRANjAwOzcwMDs4MDAmZmFtaWx5PU51bml0bytTYW5zOm9wc3osd2dodEA2Li4xMiw0MDA7Ni4uMTIsNjAwOzYuLjEyLDcwMCZmYW1pbHk9SmV0QnJhaW5zK01vbm86d2dodEA1MDA7NzAwJmRpc3BsYXk9c3dhcCI+CjxsaW5rIHJlbD0ic3R5bGVzaGVldCIgaHJlZj0iL2FwcC5jc3MiPgo8L2hlYWQ+Cjxib2R5Pgo8ZGl2IGlkPSJhcHAiPjwvZGl2Pgo8ZGl2IGNsYXNzPSJ0b2FzdCIgaWQ9InRvYXN0IiBoaWRkZW4+PC9kaXY+CjxzY3JpcHQgc3JjPSIvYXBwLmpzIj48L3NjcmlwdD4KPC9ib2R5Pgo8L2h0bWw+Cg==","logo.svg":"PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0MCA0MCI+PHJlY3QgeD0iNCIgeT0iOCIgd2lkdGg9IjMyIiBoZWlnaHQ9IjI2IiByeD0iNyIgZmlsbD0iIzE2OTNEMyIvPjxwYXRoIGQ9Ik00IDE2aDMyIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iMi41Ii8+PHJlY3QgeD0iMTAiIHk9IjIxIiB3aWR0aD0iMTIiIGhlaWdodD0iMyIgcng9IjEuNSIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjEwIiB5PSIyNiIgd2lkdGg9IjgiIGhlaWdodD0iMyIgcng9IjEuNSIgZmlsbD0iI0JGRTZGOCIvPjxjaXJjbGUgY3g9IjI5IiBjeT0iMjYiIHI9IjQiIGZpbGw9IiNmZmYiLz48L3N2Zz4K"};
__req('index', './start');
