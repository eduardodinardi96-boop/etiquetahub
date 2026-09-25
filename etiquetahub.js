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
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)')
    .run(token, userId, Date.now() + SESSION_DAYS * 864e5);
  return token;
}
function userFromToken(token) {
  if (!token) return null;
  const row = db.prepare(`SELECT u.id, u.email, u.name, u.role, u.seller_id, s.expires_at FROM sessions s
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

module.exports = { encrypt, decrypt, hashPassword, checkPassword, createSession, userFromToken, destroySession, sign, randomId };

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

async function stampLabel(originalBytes, info) {
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
  const stripH = Math.max(used, 26 * MM);

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
    if (i === 0) drawStrip(page, fonts, first, info, stripH, false);
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
    meta: { status: sh.status, substatus: sh.substatus, logistic },
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
    meta: { orderItemIds: active.map(i => String(i.OrderItemId)), statuses, packageId: active.find(i => i.PackageId)?.PackageId || null },
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
    meta: { labelId: sh.labelId || null, labelUrl: sh.labelUrl || null, carrier: sh.carrier, statusId: sh.statusId, shipmentId: sh.id },
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
  return { mk, external_id: `demo-${sellerId}-${counter}`, order_number: num, sold_at: new Date().toISOString(), items, labelReady: true, cancelled: false, shipped: false, meta: { demoMk: mk } };
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
    carrier: meta.carrier || null,
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
    if (!u || !sec.checkPassword(String(password || ''), u.pass_hash)) { recovery.loginFailed(key); return fail(res, 401, 'Correo o contraseña incorrectos'); }
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
    return ok(res, { user: { id: user.id, email: user.email, name: user.name, role: user.role }, seller, cutoff: cfg.cutoff, demo: cfg.demo, mlConfigured: Boolean(settings.mlClientId()) });
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
    if (view === 'all') where.push("created_at >= datetime('now','-7 day')");
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
      const users = db.prepare('SELECT id, email, name, role, seller_id FROM users ORDER BY role, name').all();
      return ok(res, { sellers, users });
    }
    if (p === '/api/admin/settings' && m === 'GET') {
      return ok(res, {
        ml_client_id: settings.mlClientId(), ml_secret_set: Boolean(settings.mlClientSecret()),
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
    const res = await fetch(`${cfg.backupUrl}?t=${Date.now()}`, { signal: AbortSignal.timeout(20000) });
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

global.__EH_PUBLIC = {"app.css":"OnJvb3R7CiAgLS1iZzojRUFGNUZDOyAtLWJnMjojRDhFREY5OyAtLXN1cmZhY2U6I0ZGRkZGRjsgLS1zdXJmYWNlMjojRjRGQUZFOwogIC0taW5rOiMwQzJCNDA7IC0tbXV0ZWQ6IzU1NzI4NzsgLS1saW5lOiNDOUUyRjI7CiAgLS1hY2NlbnQ6IzE2OTNEMzsgLS1hY2NlbnQtc3Ryb25nOiMwQTZGQTY7IC0tc2t5OiM3RkNERjI7IC0taWNlOiNCRkU2Rjg7CiAgLS1vazojMjM5NDZBOyAtLW9rLWJnOiNEREY0RUE7IC0tbG9jazojQzgzRTU1OyAtLWxvY2stYmc6I0ZCRTNFODsgLS13YXJuOiNCNzc5MEY7IC0td2Fybi1iZzojRkNGMEQ2OwogIC0tbWw6I0ZGRTYwMDsgLS1tbC1pbms6IzJEMzI3NzsgLS1mYTojQUFENTAwOyAtLWZhLWluazojMkYzQTAwOyAtLXBhOiMwMDc4Qzg7IC0tcGEtaW5rOiNGRkZGRkY7CiAgLS1zaGFkb3c6MCAxMHB4IDMwcHggLTE0cHggcmdiYSgxMiw3MCwxMTAsLjM1KTsKICAtLWRpc3BsYXk6IkJhbG9vIDIiLCJUcmVidWNoZXQgTVMiLHN5c3RlbS11aSxzYW5zLXNlcmlmOwogIC0tYm9keToiTnVuaXRvIFNhbnMiLHN5c3RlbS11aSwtYXBwbGUtc3lzdGVtLCJTZWdvZSBVSSIsc2Fucy1zZXJpZjsKICAtLW1vbm86IkpldEJyYWlucyBNb25vIix1aS1tb25vc3BhY2UsTWVubG8sQ29uc29sYXMsbW9ub3NwYWNlOwogIGNvbG9yLXNjaGVtZTpsaWdodDsKfQpAbWVkaWEgKHByZWZlcnMtY29sb3Itc2NoZW1lOiBkYXJrKXsKICA6cm9vdHsKICAgIGNvbG9yLXNjaGVtZTpkYXJrOwogICAgLS1iZzojMDgxQjI5OyAtLWJnMjojMEQyNjM4OyAtLXN1cmZhY2U6IzBGMkEzRTsgLS1zdXJmYWNlMjojMTIzMjQ4OwogICAgLS1pbms6I0U0RjNGQzsgLS1tdXRlZDojOTNCNEM5OyAtLWxpbmU6IzFFNDY2MDsKICAgIC0tYWNjZW50OiMzQkFFRTg7IC0tYWNjZW50LXN0cm9uZzojOEFEM0Y3OyAtLXNreTojMkM3RkFFOyAtLWljZTojMTg0NDVGOwogICAgLS1vazojNTZEMjlGOyAtLW9rLWJnOiMxMjM4MkI7IC0tbG9jazojRjA3RDkwOyAtLWxvY2stYmc6IzNEMTgyMjsgLS13YXJuOiNFQkI2NUE7IC0td2Fybi1iZzojM0EyQzEwOwogICAgLS1zaGFkb3c6MCAxMHB4IDMwcHggLTE0cHggcmdiYSgwLDAsMCwuNik7CiAgfQp9Cip7Ym94LXNpemluZzpib3JkZXItYm94fQpodG1sLGJvZHl7bWFyZ2luOjB9CmJvZHl7YmFja2dyb3VuZDp2YXIoLS1iZyk7Y29sb3I6dmFyKC0taW5rKTtmb250LWZhbWlseTp2YXIoLS1ib2R5KTtmb250LXNpemU6MTVweDtsaW5lLWhlaWdodDoxLjU7bWluLWhlaWdodDoxMDB2aH0KLndyYXB7bWF4LXdpZHRoOjEyNDBweDttYXJnaW46MCBhdXRvO3BhZGRpbmctaW5saW5lOjIwcHg7cGFkZGluZy1ibG9jazowIDYwcHh9CmgxLGgyLGgze2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2xpbmUtaGVpZ2h0OjEuMTt0ZXh0LXdyYXA6YmFsYW5jZTttYXJnaW46MH0KYnV0dG9ue2ZvbnQ6aW5oZXJpdDtjdXJzb3I6cG9pbnRlcjtjb2xvcjppbmhlcml0fQphe2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQpidXR0b246Zm9jdXMtdmlzaWJsZSxpbnB1dDpmb2N1cy12aXNpYmxlLHNlbGVjdDpmb2N1cy12aXNpYmxlLHRleHRhcmVhOmZvY3VzLXZpc2libGUsYTpmb2N1cy12aXNpYmxle291dGxpbmU6M3B4IHNvbGlkIHZhcigtLXNreSk7b3V0bGluZS1vZmZzZXQ6MnB4fQoubW9ub3tmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6Ljg2ZW19Ci5tdXRlZHtjb2xvcjp2YXIoLS1tdXRlZCl9CltoaWRkZW5de2Rpc3BsYXk6bm9uZSFpbXBvcnRhbnR9CgovKiBiYXJyYSBzdXBlcmlvciAqLwoudG9we3Bvc2l0aW9uOnN0aWNreTt0b3A6MDt6LWluZGV4OjIwO2JhY2tncm91bmQ6Y29sb3ItbWl4KGluIHNyZ2IsdmFyKC0tYmcpIDg4JSx0cmFuc3BhcmVudCk7YmFja2Ryb3AtZmlsdGVyOmJsdXIoOHB4KTtib3JkZXItYm90dG9tOjFweCBzb2xpZCB2YXIoLS1saW5lKX0KLnRvcCAud3JhcHtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDoxNHB4O2ZsZXgtd3JhcDp3cmFwO3BhZGRpbmctYmxvY2s6MTBweH0KLmJyYW5ke2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjEwcHg7Zm9udC1mYW1pbHk6dmFyKC0tZGlzcGxheSk7Zm9udC13ZWlnaHQ6ODAwO2ZvbnQtc2l6ZToyMnB4O2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpO3RleHQtZGVjb3JhdGlvbjpub25lfQouYnJhbmQgaW1ne3dpZHRoOjMycHg7aGVpZ2h0OjMycHh9Ci5uYXZ7ZGlzcGxheTpmbGV4O2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjk5OXB4O3BhZGRpbmc6NHB4O2dhcDo0cHh9Ci5uYXYgYnV0dG9ue2JvcmRlcjowO2JhY2tncm91bmQ6dHJhbnNwYXJlbnQ7Y29sb3I6dmFyKC0tbXV0ZWQpO3BhZGRpbmc6N3B4IDE1cHg7Ym9yZGVyLXJhZGl1czo5OTlweDtmb250LXdlaWdodDo3MDB9Ci5uYXYgYnV0dG9uW2FyaWEtY3VycmVudD0idHJ1ZSJde2JhY2tncm91bmQ6dmFyKC0tYWNjZW50KTtjb2xvcjojZmZmfQouc3BhY2Vye2ZsZXg6MX0KLmxpdmV7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4O2ZvbnQtc2l6ZToxMi41cHg7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOnZhcigtLW11dGVkKX0KLmxpdmUgaXt3aWR0aDo5cHg7aGVpZ2h0OjlweDtib3JkZXItcmFkaXVzOjUwJTtiYWNrZ3JvdW5kOnZhcigtLW11dGVkKX0KLmxpdmUub257Y29sb3I6dmFyKC0tb2spfSAubGl2ZS5vbiBpe2JhY2tncm91bmQ6dmFyKC0tb2spO2JveC1zaGFkb3c6MCAwIDAgNHB4IGNvbG9yLW1peChpbiBzcmdiLHZhcigtLW9rKSAyNSUsdHJhbnNwYXJlbnQpfQouY2xvY2t7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6MTBweDtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czoxNHB4O3BhZGRpbmc6NXB4IDEycHh9Ci5jbG9jayBie2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZToxN3B4O2ZvbnQtdmFyaWFudC1udW1lcmljOnRhYnVsYXItbnVtc30KLmNsb2NrIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtkaXNwbGF5OmJsb2NrO2xpbmUtaGVpZ2h0OjEuMTtmb250LXNpemU6MTAuNXB4O3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtsZXR0ZXItc3BhY2luZzouMDZlbX0KLmNsb2NrLmxhdGUgYntjb2xvcjp2YXIoLS1sb2NrKX0KLnVzZXJ7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6OHB4O2ZvbnQtc2l6ZToxMy41cHh9Ci51c2VyIGJ7ZGlzcGxheTpibG9jaztsaW5lLWhlaWdodDoxLjF9Ci51c2VyIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKX0KCi8qIGVsZW1lbnRvcyAqLwouYnRue3RleHQtZGVjb3JhdGlvbjpub25lO2JvcmRlcjowO2JvcmRlci1yYWRpdXM6MTNweDtwYWRkaW5nOjlweCAxNXB4O2ZvbnQtd2VpZ2h0OjcwMDtkaXNwbGF5OmlubGluZS1mbGV4O2dhcDo4cHg7YWxpZ24taXRlbXM6Y2VudGVyO2p1c3RpZnktY29udGVudDpjZW50ZXI7d2hpdGUtc3BhY2U6bm93cmFwfQouYnRuIHN2Z3t3aWR0aDoxOHB4O2hlaWdodDoxOHB4O2ZsZXg6bm9uZX0KLmJ0bi1wcmltYXJ5e2JhY2tncm91bmQ6dmFyKC0tYWNjZW50KTtjb2xvcjojZmZmfQouYnRuLXByaW1hcnk6aG92ZXJ7YmFja2dyb3VuZDp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KLmJ0bi1naG9zdHtiYWNrZ3JvdW5kOnZhcigtLWljZSk7Y29sb3I6dmFyKC0tYWNjZW50LXN0cm9uZyl9Ci5idG4tbGluZXtiYWNrZ3JvdW5kOnRyYW5zcGFyZW50O2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Y29sb3I6dmFyKC0taW5rKX0KLmJ0bi1kYW5nZXJ7YmFja2dyb3VuZDp2YXIoLS1sb2NrLWJnKTtjb2xvcjp2YXIoLS1sb2NrKX0KLmJ0bjpkaXNhYmxlZHtvcGFjaXR5Oi40NTtjdXJzb3I6bm90LWFsbG93ZWR9Ci5idG4tc217cGFkZGluZzo2cHggMTBweDtmb250LXNpemU6MTNweDtib3JkZXItcmFkaXVzOjEwcHh9CnNlbGVjdCxpbnB1dFt0eXBlPXRleHRdLGlucHV0W3R5cGU9ZW1haWxdLGlucHV0W3R5cGU9cGFzc3dvcmRdLGlucHV0W3R5cGU9c2VhcmNoXSx0ZXh0YXJlYXtmb250OmluaGVyaXQ7Y29sb3I6dmFyKC0taW5rKTtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTJweDtwYWRkaW5nOjhweCAxMnB4O21pbi13aWR0aDowO3dpZHRoOjEwMCV9CnRleHRhcmVhe3Jlc2l6ZTp2ZXJ0aWNhbDttaW4taGVpZ2h0OjcwcHh9CmxhYmVsLmZ7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6NHB4O2ZvbnQtc2l6ZToxMi41cHg7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOnZhcigtLW11dGVkKX0KLmNoaXBze2Rpc3BsYXk6ZmxleDtnYXA6NnB4O2ZsZXgtd3JhcDp3cmFwfQouY2hpcHtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZTIpO2NvbG9yOnZhcigtLWluayk7cGFkZGluZzo2cHggMTJweDtib3JkZXItcmFkaXVzOjk5OXB4O2ZvbnQtd2VpZ2h0OjYwMDtmb250LXNpemU6MTNweH0KLmNoaXBbYXJpYS1wcmVzc2VkPSJ0cnVlIl17YmFja2dyb3VuZDp2YXIoLS1hY2NlbnQpO2JvcmRlci1jb2xvcjp2YXIoLS1hY2NlbnQpO2NvbG9yOiNmZmZ9Ci5zd2l0Y2h7ZGlzcGxheTppbmxpbmUtZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjEwcHg7Zm9udC13ZWlnaHQ6NzAwO2ZvbnQtc2l6ZToxNHB4O2N1cnNvcjpwb2ludGVyO3VzZXItc2VsZWN0Om5vbmV9Ci5zd2l0Y2ggaW5wdXR7YXBwZWFyYW5jZTpub25lO3dpZHRoOjQ0cHg7aGVpZ2h0OjI2cHg7Ym9yZGVyLXJhZGl1czo5OTlweDtiYWNrZ3JvdW5kOnZhcigtLWxpbmUpO3Bvc2l0aW9uOnJlbGF0aXZlO3RyYW5zaXRpb246YmFja2dyb3VuZCAuMnM7Y3Vyc29yOnBvaW50ZXI7bWFyZ2luOjA7ZmxleDpub25lfQouc3dpdGNoIGlucHV0OjphZnRlcntjb250ZW50OiIiO3Bvc2l0aW9uOmFic29sdXRlO3RvcDozcHg7bGVmdDozcHg7d2lkdGg6MjBweDtoZWlnaHQ6MjBweDtib3JkZXItcmFkaXVzOjUwJTtiYWNrZ3JvdW5kOiNmZmY7dHJhbnNpdGlvbjpsZWZ0IC4ycztib3gtc2hhZG93OjAgMXB4IDNweCByZ2JhKDAsMCwwLC4yNSl9Ci5zd2l0Y2ggaW5wdXQ6Y2hlY2tlZHtiYWNrZ3JvdW5kOnZhcigtLW9rKX0KLnN3aXRjaCBpbnB1dDpjaGVja2VkOjphZnRlcntsZWZ0OjIxcHh9CgoucGFuZWx7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MjJweDtib3gtc2hhZG93OnZhcigtLXNoYWRvdyl9Ci5wYW5lbC1oZWFke2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6MTJweDthbGlnbi1pdGVtczpjZW50ZXI7cGFkZGluZzoxNnB4IDIwcHg7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tbGluZSl9Ci5wYW5lbC1oZWFkIGgye2ZvbnQtc2l6ZToyM3B4O21hcmdpbi1yaWdodDphdXRvfQoucGFuZWwtYm9keXtwYWRkaW5nOjE2cHggMjBweH0KLnBhbmVsLWZvb3R7ZGlzcGxheTpmbGV4O2ZsZXgtd3JhcDp3cmFwO2dhcDoxMHB4O2FsaWduLWl0ZW1zOmNlbnRlcjtwYWRkaW5nOjE0cHggMjBweDtib3JkZXItdG9wOjFweCBzb2xpZCB2YXIoLS1saW5lKTtjb2xvcjp2YXIoLS1tdXRlZCk7Zm9udC1zaXplOjEzLjVweH0KCi5ta3tkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtmb250LXdlaWdodDo3MDA7Zm9udC1zaXplOjEycHg7cGFkZGluZzozcHggOXB4O2JvcmRlci1yYWRpdXM6OHB4O3doaXRlLXNwYWNlOm5vd3JhcH0KLm1rLm1se2JhY2tncm91bmQ6dmFyKC0tbWwpO2NvbG9yOnZhcigtLW1sLWluayl9IC5tay5mYXtiYWNrZ3JvdW5kOnZhcigtLWZhKTtjb2xvcjp2YXIoLS1mYS1pbmspfSAubWsucGF7YmFja2dyb3VuZDp2YXIoLS1wYSk7Y29sb3I6dmFyKC0tcGEtaW5rKX0KLnBpbGx7ZGlzcGxheTppbmxpbmUtZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjZweDtib3JkZXItcmFkaXVzOjk5OXB4O3BhZGRpbmc6NHB4IDEwcHg7Zm9udC13ZWlnaHQ6NzAwO2ZvbnQtc2l6ZToxMi41cHg7d2hpdGUtc3BhY2U6bm93cmFwfQoucGlsbCBzdmd7d2lkdGg6MTRweDtoZWlnaHQ6MTRweH0KLnBpbGwucmVhZHl7YmFja2dyb3VuZDp2YXIoLS1vay1iZyk7Y29sb3I6dmFyKC0tb2spfQoucGlsbC5ibG9ja2Vke2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayl9Ci5waWxsLnByaW50ZWR7YmFja2dyb3VuZDp2YXIoLS1pY2UpO2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQoucGlsbC53YWl0aW5ne2JhY2tncm91bmQ6dmFyKC0td2Fybi1iZyk7Y29sb3I6dmFyKC0td2Fybil9Ci5waWxsLmVycm9ye2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayl9Ci5waWxsLmNhbmNlbGxlZHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKTtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5ub3Rle2Rpc3BsYXk6YmxvY2s7Zm9udC1zaXplOjEycHg7Y29sb3I6dmFyKC0tbXV0ZWQpO21hcmdpbi10b3A6NHB4O21heC13aWR0aDozNGNofQoubm90ZS5iYWR7Y29sb3I6dmFyKC0tbG9jayl9CgovKiBow6lyb2UgKi8KLmhlcm97ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczoxLjFmciAuOWZyO2dhcDoyNHB4O2FsaWduLWl0ZW1zOmNlbnRlcjtwYWRkaW5nLWJsb2NrOjI0cHggNnB4fQouaGVybyBoMXtmb250LXNpemU6Y2xhbXAoMjhweCwzLjZ2dyw0MHB4KTtmb250LXdlaWdodDo4MDB9Ci5oZXJvIGgxIGVte2ZvbnQtc3R5bGU6bm9ybWFsO2NvbG9yOnZhcigtLWFjY2VudCl9Ci5oZXJvIHB7Y29sb3I6dmFyKC0tbXV0ZWQpO21heC13aWR0aDo1NmNoO21hcmdpbjoxMHB4IDAgMH0KLmhlcm8gc3Zne3dpZHRoOjEwMCU7aGVpZ2h0OmF1dG87bWF4LWhlaWdodDoyMTBweH0KCi8qIGtwaXMgKi8KLmtwaXN7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoNCwxZnIpO2dhcDoxNHB4O21hcmdpbi1ibG9jazoxOHB4fQoua3Bpe2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjE4cHg7cGFkZGluZzoxNHB4IDE2cHg7ZGlzcGxheTpmbGV4O2dhcDoxMnB4O2FsaWduLWl0ZW1zOmNlbnRlcn0KLmtwaSAuaWN7d2lkdGg6NDJweDtoZWlnaHQ6NDJweDtib3JkZXItcmFkaXVzOjEycHg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtmbGV4Om5vbmV9Ci5rcGkgLmljIHN2Z3t3aWR0aDoyMnB4O2hlaWdodDoyMnB4fQoua3BpLm9rIC5pY3tiYWNrZ3JvdW5kOnZhcigtLW9rLWJnKTtjb2xvcjp2YXIoLS1vayl9Ci5rcGkud2FpdCAuaWN7YmFja2dyb3VuZDp2YXIoLS13YXJuLWJnKTtjb2xvcjp2YXIoLS13YXJuKX0KLmtwaS5sb2NrIC5pY3tiYWNrZ3JvdW5kOnZhcigtLWxvY2stYmcpO2NvbG9yOnZhcigtLWxvY2spfQoua3BpLmRvbmUgLmlje2JhY2tncm91bmQ6dmFyKC0taWNlKTtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KLmtwaSBie2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtc2l6ZToyOHB4O2xpbmUtaGVpZ2h0OjE7ZGlzcGxheTpibG9jaztmb250LXZhcmlhbnQtbnVtZXJpYzp0YWJ1bGFyLW51bXN9Ci5rcGkgc3Bhbntjb2xvcjp2YXIoLS1tdXRlZCk7Zm9udC1zaXplOjEzcHh9CgouYXV0b2JhcntkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7Z2FwOjE0cHg7YWxpZ24taXRlbXM6Y2VudGVyO2p1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuO2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDEyMGRlZyx2YXIoLS1iZzIpLHZhcigtLXN1cmZhY2UpKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MThweDtwYWRkaW5nOjE0cHggMThweDttYXJnaW4tYm90dG9tOjE2cHh9Ci5hdXRvYmFyIHB7bWFyZ2luOjJweCAwIDA7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtc2l6ZToxM3B4O21heC13aWR0aDo3MGNofQoKLmZpbHRlcnN7ZGlzcGxheTpmbGV4O2ZsZXgtd3JhcDp3cmFwO2dhcDoxMHB4O2FsaWduLWl0ZW1zOmNlbnRlcn0KLmZpbHRlcnMgc2VsZWN0LC5maWx0ZXJzIGlucHV0e3dpZHRoOmF1dG99Ci50YWJsZS13cmFwe292ZXJmbG93LXg6YXV0b30KdGFibGV7d2lkdGg6MTAwJTtib3JkZXItY29sbGFwc2U6Y29sbGFwc2U7bWluLXdpZHRoOjgyMHB4fQp0aHtmb250LXNpemU6MTEuNXB4O3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtsZXR0ZXItc3BhY2luZzouMDdlbTtjb2xvcjp2YXIoLS1tdXRlZCk7dGV4dC1hbGlnbjpsZWZ0O3BhZGRpbmc6MTBweCAxNHB4O2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZTIpO3doaXRlLXNwYWNlOm5vd3JhcH0KdGR7cGFkZGluZzoxMXB4IDE0cHg7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tbGluZSk7dmVydGljYWwtYWxpZ246bWlkZGxlfQp0ci5pcy1ibG9ja2VkIHRke2JhY2tncm91bmQ6Y29sb3ItbWl4KGluIHNyZ2IsdmFyKC0tbG9jay1iZykgNDUlLHRyYW5zcGFyZW50KX0KdHIuaXMtbmV3IHRke2FuaW1hdGlvbjpmbGFzaCAyLjVzIGVhc2Utb3V0fQpAa2V5ZnJhbWVzIGZsYXNoe2Zyb217YmFja2dyb3VuZDpjb2xvci1taXgoaW4gc3JnYix2YXIoLS1za3kpIDQ1JSx0cmFuc3BhcmVudCl9dG97YmFja2dyb3VuZDp0cmFuc3BhcmVudH19Ci5pdGVtc3tkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDoycHg7Zm9udC1zaXplOjEzLjVweH0KLml0ZW1zIC52e2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTIuNXB4fQouaXRlbXMgLmJhZHtjb2xvcjp2YXIoLS1sb2NrKTtmb250LXdlaWdodDo3MDB9Ci5jYnt3aWR0aDoxOXB4O2hlaWdodDoxOXB4O2FjY2VudC1jb2xvcjp2YXIoLS1hY2NlbnQpfQoubG9ja2NlbGx7Y29sb3I6dmFyKC0tbG9jayk7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcn0KLmxvY2tjZWxsIHN2Z3t3aWR0aDoxOHB4O2hlaWdodDoxOHB4fQoucm93LWFjdGlvbnN7ZGlzcGxheTpmbGV4O2dhcDo2cHg7ZmxleC13cmFwOndyYXB9Ci5lbXB0eXtwYWRkaW5nOjQwcHggMjBweDt0ZXh0LWFsaWduOmNlbnRlcjtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5lbXB0eSBzdmd7d2lkdGg6MTIwcHg7aGVpZ2h0OmF1dG87bWFyZ2luLWJvdHRvbToxMHB4fQoKLyogdmVuZGVkb3IgKi8KLnNlY3Rpb24tdGl0bGV7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6MTJweDtmbGV4LXdyYXA6d3JhcDttYXJnaW4tYmxvY2s6MjRweCAxMnB4fQouc2VjdGlvbi10aXRsZSBoMntmb250LXNpemU6MjZweH0KLmNvbm57ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoMywxZnIpO2dhcDoxNHB4fQoubWNhcmR7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MjBweDtwYWRkaW5nOjE2cHg7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MTBweH0KLm1jYXJkIC5sb2dve2hlaWdodDo0NHB4O2JvcmRlci1yYWRpdXM6MTJweDtkaXNwbGF5OmdyaWQ7cGxhY2UtaXRlbXM6Y2VudGVyO2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MThweH0KLm1jYXJkIC5ob3d7Zm9udC1zaXplOjEyLjVweDtjb2xvcjp2YXIoLS1tdXRlZCk7bWFyZ2luOjB9Ci5zdGF0ZXtmb250LXNpemU6MTNweDtmb250LXdlaWdodDo3MDA7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4fQouc3RhdGUub257Y29sb3I6dmFyKC0tb2spfSAuc3RhdGUub2Zme2NvbG9yOnZhcigtLW11dGVkKX0gLnN0YXRlLmVycntjb2xvcjp2YXIoLS1sb2NrKX0KLnN0YXRlIGl7d2lkdGg6OHB4O2hlaWdodDo4cHg7Ym9yZGVyLXJhZGl1czo1MCU7YmFja2dyb3VuZDpjdXJyZW50Q29sb3I7ZGlzcGxheTppbmxpbmUtYmxvY2t9Ci5jb3B5e2Rpc3BsYXk6ZmxleDtnYXA6NnB4fQouY29weSBpbnB1dHtmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6MTEuNXB4fQouZ3JpZDJ7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczoxZnIgMWZyO2dhcDoyMHB4O21hcmdpbi10b3A6MjBweH0KLnJ1bGV7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczphdXRvIDFmcjtnYXA6MTRweDthbGlnbi1pdGVtczpjZW50ZXI7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlMik7Ym9yZGVyOjFweCBkYXNoZWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czoxNnB4O3BhZGRpbmc6MTJweCAxNHB4fQoucnVsZSBzdmd7d2lkdGg6MTEwcHg7aGVpZ2h0OmF1dG99Ci5ydWxlIHB7bWFyZ2luOjA7Zm9udC1zaXplOjEzLjVweDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5ydWxlIGJ7Y29sb3I6dmFyKC0taW5rKX0KLmFkZHJvd3tkaXNwbGF5OmdyaWQ7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmciAxNTBweCBhdXRvO2dhcDo4cHg7YWxpZ24taXRlbXM6c3RhcnR9Ci50YWdze2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6OHB4O21heC1oZWlnaHQ6MjYwcHg7b3ZlcmZsb3c6YXV0b30KLnRhZ3tkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4O2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayk7Ym9yZGVyLXJhZGl1czoxMHB4O3BhZGRpbmc6NHB4IDRweCA0cHggMTBweDtmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6MTIuNXB4O2ZvbnQtd2VpZ2h0OjcwMH0KLnRhZyBzbWFsbHtmb250LWZhbWlseTp2YXIoLS1ib2R5KTtmb250LXdlaWdodDo2MDA7b3BhY2l0eTouOH0KLnRhZyBidXR0b257Ym9yZGVyOjA7YmFja2dyb3VuZDp0cmFuc3BhcmVudDtjb2xvcjppbmhlcml0O3dpZHRoOjI0cHg7aGVpZ2h0OjI0cHg7Ym9yZGVyLXJhZGl1czo2cHg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcn0KLnRhZyBidXR0b246aG92ZXJ7YmFja2dyb3VuZDpjb2xvci1taXgoaW4gc3JnYix2YXIoLS1sb2NrKSAxOCUsdHJhbnNwYXJlbnQpfQouc3RhY2t7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MTJweH0KLnJvd3tkaXNwbGF5OmZsZXg7Z2FwOjEwcHg7ZmxleC13cmFwOndyYXA7YWxpZ24taXRlbXM6ZW5kfQoucm93ID4gKntmbGV4OjE7bWluLXdpZHRoOjE1MHB4fQoKLyogbG9naW4gKi8KLmxvZ2lue21pbi1oZWlnaHQ6MTAwdmg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtwYWRkaW5nOjIwcHh9Ci5sb2dpbiAuY2FyZHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czoyNnB4O2JveC1zaGFkb3c6dmFyKC0tc2hhZG93KTt3aWR0aDoxMDAlO21heC13aWR0aDo0MjBweDtvdmVyZmxvdzpoaWRkZW59Ci5sb2dpbiAuYXJ0e2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDEzNWRlZyx2YXIoLS1iZzIpLHZhcigtLWljZSkpO3BhZGRpbmc6MjJweCAyNHB4IDhweH0KLmxvZ2luIC5hcnQgc3Zne3dpZHRoOjEwMCU7aGVpZ2h0OmF1dG99Ci5sb2dpbiBmb3Jte3BhZGRpbmc6MjJweCAyNHB4IDI2cHg7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MTJweH0KLmxvZ2luIGgxe2ZvbnQtc2l6ZTozMHB4O2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQouZXJye2NvbG9yOnZhcigtLWxvY2spO2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTMuNXB4O21pbi1oZWlnaHQ6MS4yZW19Ci5kZW1vLWhpbnR7Zm9udC1zaXplOjEyLjVweDtiYWNrZ3JvdW5kOnZhcigtLXdhcm4tYmcpO2NvbG9yOnZhcigtLXdhcm4pO3BhZGRpbmc6OHB4IDEycHg7Ym9yZGVyLXJhZGl1czoxMnB4fQoKLnRvYXN0e3Bvc2l0aW9uOmZpeGVkO2xlZnQ6NTAlO2JvdHRvbToyMnB4O3RyYW5zZm9ybTp0cmFuc2xhdGVYKC01MCUpO2JhY2tncm91bmQ6dmFyKC0taW5rKTtjb2xvcjp2YXIoLS1iZyk7cGFkZGluZzoxMHB4IDE4cHg7Ym9yZGVyLXJhZGl1czoxMnB4O2ZvbnQtd2VpZ2h0OjcwMDt6LWluZGV4OjYwO21heC13aWR0aDpjYWxjKDEwMCUgLSAzMnB4KX0KLm1vZGFse3Bvc2l0aW9uOmZpeGVkO2luc2V0OjA7ei1pbmRleDo1MDtiYWNrZ3JvdW5kOnJnYmEoNiwzMCw0OCwuNTUpO2Rpc3BsYXk6Z3JpZDtwbGFjZS1pdGVtczpjZW50ZXI7cGFkZGluZzoxNnB4fQouc2hlZXR7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXItcmFkaXVzOjIycHg7bWF4LXdpZHRoOjUyMHB4O3dpZHRoOjEwMCU7cGFkZGluZzoyMHB4O2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjEycHh9CgpAbWVkaWEgKG1heC13aWR0aDo5ODBweCl7CiAgLmhlcm8sLmdyaWQye2dyaWQtdGVtcGxhdGUtY29sdW1uczoxZnJ9CiAgLmhlcm8gc3Zne2Rpc3BsYXk6bm9uZX0KICAua3Bpc3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDIsMWZyKX0KICAuY29ubntncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyfQp9CkBtZWRpYSAobWF4LXdpZHRoOjUyMHB4KXsKICAud3JhcHtwYWRkaW5nLWlubGluZToxNnB4fQogIC5hZGRyb3d7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmcn0KICAucnVsZXtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyfQogIC51c2VyIHNtYWxse2Rpc3BsYXk6bm9uZX0KfQpAbWVkaWEgKHByZWZlcnMtcmVkdWNlZC1tb3Rpb246bm8tcHJlZmVyZW5jZSl7CiAgLnRydWNre2FuaW1hdGlvbjpkcml2ZSA2cyBlYXNlLWluLW91dCBpbmZpbml0ZX0KICBAa2V5ZnJhbWVzIGRyaXZlezAlLDEwMCV7dHJhbnNmb3JtOnRyYW5zbGF0ZVgoMCl9NTAle3RyYW5zZm9ybTp0cmFuc2xhdGVYKDE2cHgpfX0KfQo=","app.js":"LyogRXRpcXVldGFIdWIg4oCUIGludGVyZmF6ICovCigoKSA9PiB7CmNvbnN0ICQgPSAocywgZWwgPSBkb2N1bWVudCkgPT4gZWwucXVlcnlTZWxlY3RvcihzKTsKY29uc3QgJCQgPSAocywgZWwgPSBkb2N1bWVudCkgPT4gWy4uLmVsLnF1ZXJ5U2VsZWN0b3JBbGwocyldOwpjb25zdCBlc2MgPSBzID0+IFN0cmluZyhzID8/ICcnKS5yZXBsYWNlKC9bJjw+IiddL2csIGMgPT4gKHsgJyYnOiAnJmFtcDsnLCAnPCc6ICcmbHQ7JywgJz4nOiAnJmd0OycsICciJzogJyZxdW90OycsICInIjogJyYjMzk7JyB9W2NdKSk7CmNvbnN0IE1LID0geyBtbDogJ01lcmNhZG8gTGlicmUnLCBmYTogJ0ZhbGFiZWxsYScsIHBhOiAnUGFyaXMnIH07CmNvbnN0IFNUQVRFID0geyByZWFkeTogJ0xpc3RhJywgd2FpdGluZzogJ0VzcGVyYW5kbyBldGlxdWV0YScsIGJsb2NrZWQ6ICdCbG9xdWVhZGEnLCBwcmludGVkOiAnSW1wcmVzYScsIGVycm9yOiAnRXJyb3InLCBjYW5jZWxsZWQ6ICdDYW5jZWxhZGEnIH07CmNvbnN0IHN0b3JlID0geyBnZXQoaywgZCkgeyB0cnkgeyBjb25zdCB2ID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2VoOicgKyBrKTsgcmV0dXJuIHYgPT0gbnVsbCA/IGQgOiBKU09OLnBhcnNlKHYpOyB9IGNhdGNoIHsgcmV0dXJuIGQ7IH0gfSwgc2V0KGssIHYpIHsgdHJ5IHsgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2VoOicgKyBrLCBKU09OLnN0cmluZ2lmeSh2KSk7IH0gY2F0Y2gge30gfSB9OwoKY29uc3QgSSA9IHsKICBsb2NrOiAnPHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjIuMiI+PHJlY3QgeD0iNSIgeT0iMTEiIHdpZHRoPSIxNCIgaGVpZ2h0PSIxMCIgcng9IjIiLz48cGF0aCBkPSJNOCAxMVY4YTQgNCAwIDAxOCAwdjMiLz48L3N2Zz4nLAogIGNoZWNrOiAnPHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjMiPjxwYXRoIGQ9Ik01IDEybDUgNSA5LTEwIi8+PC9zdmc+JywKICBwcmludDogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyLjIiPjxwYXRoIGQ9Ik03IDlWM2gxMHY2TTcgMTdINHYtN2gxNnY3aC0zIi8+PHJlY3QgeD0iNyIgeT0iMTQiIHdpZHRoPSIxMCIgaGVpZ2h0PSI3Ii8+PC9zdmc+JywKICBjbG9jazogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyLjIiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjkiLz48cGF0aCBkPSJNMTIgN3Y1bDMgMiIvPjwvc3ZnPicsCiAgd2FybjogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyLjIiPjxwYXRoIGQ9Ik0xMiAzbDEwIDE4SDJ6Ii8+PHBhdGggZD0iTTEyIDEwdjVNMTIgMTh2LjUiLz48L3N2Zz4nLAogIGRvd246ICc8c3ZnIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMi40Ij48cGF0aCBkPSJNMTIgNHYxMW0wIDBsLTUtNW01IDVsNS01TTUgMjBoMTQiLz48L3N2Zz4nLAogIHN5bmM6ICc8c3ZnIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMi4yIj48cGF0aCBkPSJNMjAgMTFhOCA4IDAgMDAtMTQuOS0zTTQgNXY0aDRNNCAxM2E4IDggMCAwMDE0LjkgM00yMCAxOXYtNGgtNCIvPjwvc3ZnPicsCiAgeDogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiB3aWR0aD0iMTQiIGhlaWdodD0iMTQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjIuNiI+PHBhdGggZD0iTTYgNmwxMiAxMk0xOCA2TDYgMTgiLz48L3N2Zz4nLAogIGJveDogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIj48cmVjdCB4PSIzIiB5PSI0IiB3aWR0aD0iMTgiIGhlaWdodD0iMTYiIHJ4PSIzIi8+PHBhdGggZD0iTTMgOWgxOCIvPjwvc3ZnPicsCn07CmNvbnN0IHBpbGxJY29uID0geyByZWFkeTogSS5jaGVjaywgYmxvY2tlZDogSS5sb2NrLCBwcmludGVkOiBJLnByaW50LCB3YWl0aW5nOiBJLmNsb2NrLCBlcnJvcjogSS53YXJuLCBjYW5jZWxsZWQ6IEkueCB9OwoKbGV0IG1lID0gbnVsbCwgdGFiID0gbnVsbCwgb3JkZXJzID0gW10sIHNlbGxlcnMgPSBbXSwgc2VsZWN0ZWQgPSBuZXcgU2V0KCksIGtub3duUmVhZHkgPSBuZXcgU2V0KCksIGZpcnN0TG9hZCA9IHRydWU7CmNvbnN0IHVpID0geyB2aWV3OiAncGVuZGluZycsIG1rOiAnYWxsJywgc2VsbGVyOiAnYWxsJywgcTogJycsIGFkbWluU2VsbGVyOiBzdG9yZS5nZXQoJ2FkbWluU2VsbGVyJywgbnVsbCkgfTsKCmZ1bmN0aW9uIHRvYXN0KG1zZywgbXMgPSAyODAwKSB7IGNvbnN0IHQgPSAkKCcjdG9hc3QnKTsgdC50ZXh0Q29udGVudCA9IG1zZzsgdC5oaWRkZW4gPSBmYWxzZTsgY2xlYXJUaW1lb3V0KHQuX3QpOyB0Ll90ID0gc2V0VGltZW91dCgoKSA9PiB0LmhpZGRlbiA9IHRydWUsIG1zKTsgfQphc3luYyBmdW5jdGlvbiBhcGkocGF0aCwgb3B0cyA9IHt9KSB7CiAgY29uc3QgcmVzID0gYXdhaXQgZmV0Y2gocGF0aCwgeyBjcmVkZW50aWFsczogJ3NhbWUtb3JpZ2luJywgLi4ub3B0cywgaGVhZGVyczogeyAnY29udGVudC10eXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLCAuLi4ob3B0cy5oZWFkZXJzIHx8IHt9KSB9LCBib2R5OiBvcHRzLmJvZHkgJiYgdHlwZW9mIG9wdHMuYm9keSAhPT0gJ3N0cmluZycgPyBKU09OLnN0cmluZ2lmeShvcHRzLmJvZHkpIDogb3B0cy5ib2R5IH0pOwogIGlmIChyZXMuc3RhdHVzID09PSA0MDEgJiYgIXBhdGguaW5jbHVkZXMoJy9sb2dpbicpKSB7IG1lID0gbnVsbDsgcmVuZGVyTG9naW4oKTsgdGhyb3cgbmV3IEVycm9yKCdTZXNpw7NuIHZlbmNpZGEnKTsgfQogIGNvbnN0IGN0ID0gcmVzLmhlYWRlcnMuZ2V0KCdjb250ZW50LXR5cGUnKSB8fCAnJzsKICBpZiAoIXJlcy5vaykgeyBjb25zdCBlID0gY3QuaW5jbHVkZXMoJ2pzb24nKSA/IChhd2FpdCByZXMuanNvbigpKS5lcnJvciA6IGF3YWl0IHJlcy50ZXh0KCk7IHRocm93IG5ldyBFcnJvcihlIHx8ICdFcnJvcicpOyB9CiAgcmV0dXJuIGN0LmluY2x1ZGVzKCdqc29uJykgPyByZXMuanNvbigpIDogcmVzOwp9CmZ1bmN0aW9uIHNlbGxlclFTKCkgeyByZXR1cm4gbWUudXNlci5yb2xlID09PSAnYWRtaW4nICYmIHVpLmFkbWluU2VsbGVyID8gYD9zZWxsZXJfaWQ9JHt1aS5hZG1pblNlbGxlcn1gIDogJyc7IH0KZnVuY3Rpb24gZm10VGltZShzKSB7IGlmICghcykgcmV0dXJuICcnOyBjb25zdCBkID0gbmV3IERhdGUocy5pbmNsdWRlcygnVCcpID8gcyA6IHMucmVwbGFjZSgnICcsICdUJykgKyAnWicpOyByZXR1cm4gZC50b0xvY2FsZVN0cmluZygnZXMtQ0wnLCB7IGRheTogJzItZGlnaXQnLCBtb250aDogJzItZGlnaXQnLCBob3VyOiAnMi1kaWdpdCcsIG1pbnV0ZTogJzItZGlnaXQnIH0pOyB9CgovLyAtLS0tLS0tLS0tIGlsdXN0cmFjaW9uZXMgLS0tLS0tLS0tLQpjb25zdCBIRVJPX1NWRyA9IGA8c3ZnIHZpZXdCb3g9IjAgMCA1MjAgMjMwIiBhcmlhLWhpZGRlbj0idHJ1ZSI+CjxyZWN0IHdpZHRoPSI1MjAiIGhlaWdodD0iMjMwIiByeD0iMjYiIGZpbGw9InZhcigtLWJnMikiLz4KPGcgZm9udC1mYW1pbHk9IkJhbG9vIDIsIHNhbnMtc2VyaWYiIGZvbnQtd2VpZ2h0PSI4MDAiIGZvbnQtc2l6ZT0iMTQiIHRleHQtYW5jaG9yPSJtaWRkbGUiPgo8cmVjdCB4PSIyMiIgeT0iMjYiIHdpZHRoPSIxMTIiIGhlaWdodD0iNDQiIHJ4PSIxMiIgZmlsbD0idmFyKC0tbWwpIi8+PHRleHQgeD0iNzgiIHk9IjUzIiBmaWxsPSJ2YXIoLS1tbC1pbmspIj5NZXJjYWRvIExpYnJlPC90ZXh0Pgo8cmVjdCB4PSIyMiIgeT0iOTMiIHdpZHRoPSIxMTIiIGhlaWdodD0iNDQiIHJ4PSIxMiIgZmlsbD0idmFyKC0tZmEpIi8+PHRleHQgeD0iNzgiIHk9IjEyMCIgZmlsbD0idmFyKC0tZmEtaW5rKSI+RmFsYWJlbGxhPC90ZXh0Pgo8cmVjdCB4PSIyMiIgeT0iMTYwIiB3aWR0aD0iMTEyIiBoZWlnaHQ9IjQ0IiByeD0iMTIiIGZpbGw9InZhcigtLXBhKSIvPjx0ZXh0IHg9Ijc4IiB5PSIxODciIGZpbGw9IiNmZmYiPlBhcmlzPC90ZXh0PjwvZz4KPGcgc3Ryb2tlPSJ2YXIoLS1za3kpIiBzdHJva2Utd2lkdGg9IjMiIGZpbGw9Im5vbmUiIHN0cm9rZS1kYXNoYXJyYXk9IjYgNyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48cGF0aCBkPSJNMTM0IDQ4IEMgMTc1IDQ4LCAxNzUgMTE1LCAyMTAgMTE1Ii8+PHBhdGggZD0iTTEzNCAxMTUgSDIxMCIvPjxwYXRoIGQ9Ik0xMzQgMTgyIEMgMTc1IDE4MiwgMTc1IDExNSwgMjEwIDExNSIvPjwvZz4KPHJlY3QgeD0iMjEwIiB5PSI3MCIgd2lkdGg9IjEwNCIgaGVpZ2h0PSI5MCIgcng9IjIwIiBmaWxsPSJ2YXIoLS1hY2NlbnQpIi8+CjxyZWN0IHg9IjIyNiIgeT0iODgiIHdpZHRoPSI3MiIgaGVpZ2h0PSIxMiIgcng9IjYiIGZpbGw9IiNmZmYiIG9wYWNpdHk9Ii45Ii8+PHJlY3QgeD0iMjI2IiB5PSIxMDciIHdpZHRoPSI1MiIgaGVpZ2h0PSIxMCIgcng9IjUiIGZpbGw9IiNmZmYiIG9wYWNpdHk9Ii42Ii8+CjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDIzMiwxMjYpIj48cmVjdCB3aWR0aD0iMjIiIGhlaWdodD0iMjIiIHJ4PSI2IiBmaWxsPSIjZmZmIi8+PHBhdGggZD0iTTYgMTFsNCA0IDctOCIgc3Ryb2tlPSJ2YXIoLS1vaykiIHN0cm9rZS13aWR0aD0iMyIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9nPgo8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyNjQsMTI2KSI+PHJlY3Qgd2lkdGg9IjIyIiBoZWlnaHQ9IjIyIiByeD0iNiIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjYiIHk9IjEwIiB3aWR0aD0iMTAiIGhlaWdodD0iOCIgcng9IjIiIGZpbGw9InZhcigtLWxvY2spIi8+PHBhdGggZD0iTTggMTBWOGEzIDMgMCAwMTYgMHYyIiBzdHJva2U9InZhcigtLWxvY2spIiBzdHJva2Utd2lkdGg9IjIiIGZpbGw9Im5vbmUiLz48L2c+CjxwYXRoIGQ9Ik0zMTQgMTE1IEgzNTYiIHN0cm9rZT0idmFyKC0tc2t5KSIgc3Ryb2tlLXdpZHRoPSIzIiBzdHJva2UtZGFzaGFycmF5PSI2IDciIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8cGF0aCBkPSJNMzYyIDk4IEw0MjQgNzAgTDQ4NiA5OCBWMTc4IEgzNjIgWiIgZmlsbD0idmFyKC0tc3VyZmFjZSkiIHN0cm9rZT0idmFyKC0tbGluZSkiIHN0cm9rZS13aWR0aD0iMiIvPgo8cmVjdCB4PSIzODgiIHk9IjEyNCIgd2lkdGg9IjcyIiBoZWlnaHQ9IjU0IiByeD0iNCIgZmlsbD0idmFyKC0taWNlKSIvPgo8ZyBmaWxsPSJ2YXIoLS1za3kpIj48cmVjdCB4PSIzOTYiIHk9IjE0NCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjE2IiByeD0iMiIvPjxyZWN0IHg9IjQyNCIgeT0iMTQ0IiB3aWR0aD0iMjQiIGhlaWdodD0iMTYiIHJ4PSIyIi8+PHJlY3QgeD0iNDEwIiB5PSIxMzAiIHdpZHRoPSIyNCIgaGVpZ2h0PSIxNCIgcng9IjIiLz48L2c+CjxnIGNsYXNzPSJ0cnVjayI+PHJlY3QgeD0iMzcyIiB5PSIxODgiIHdpZHRoPSI1OCIgaGVpZ2h0PSIyNCIgcng9IjUiIGZpbGw9InZhcigtLWFjY2VudC1zdHJvbmcpIi8+PHBhdGggZD0iTTQzMCAxOTQgaDE4IGwxMCAxMCB2OCBoLTI4eiIgZmlsbD0idmFyKC0tYWNjZW50KSIvPjxjaXJjbGUgY3g9IjM4OCIgY3k9IjIxNCIgcj0iNiIgZmlsbD0idmFyKC0taW5rKSIvPjxjaXJjbGUgY3g9IjQ0NiIgY3k9IjIxNCIgcj0iNiIgZmlsbD0idmFyKC0taW5rKSIvPjwvZz48L3N2Zz5gOwpjb25zdCBFTVBUWV9TVkcgPSBgPHN2ZyB2aWV3Qm94PSIwIDAgMTQwIDEwMCIgYXJpYS1oaWRkZW49InRydWUiPjxyZWN0IHg9IjIwIiB5PSIzMCIgd2lkdGg9IjEwMCIgaGVpZ2h0PSI2MiIgcng9IjEwIiBmaWxsPSJ2YXIoLS1pY2UpIi8+PHBhdGggZD0iTTIwIDQ2aDEwMCIgc3Ryb2tlPSJ2YXIoLS1za3kpIiBzdHJva2Utd2lkdGg9IjMiLz48cmVjdCB4PSIzNiIgeT0iNTgiIHdpZHRoPSI0MCIgaGVpZ2h0PSI3IiByeD0iMy41IiBmaWxsPSJ2YXIoLS1za3kpIi8+PHJlY3QgeD0iMzYiIHk9IjcxIiB3aWR0aD0iMjYiIGhlaWdodD0iNyIgcng9IjMuNSIgZmlsbD0idmFyKC0tc2t5KSIgb3BhY2l0eT0iLjYiLz48Y2lyY2xlIGN4PSIxMDQiIGN5PSIyMiIgcj0iMTQiIGZpbGw9InZhcigtLW9rKSIvPjxwYXRoIGQ9Ik05NyAyMmw1IDUgOS0xMCIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjMuNCIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+YDsKY29uc3QgUlVMRV9TVkcgPSBgPHN2ZyB2aWV3Qm94PSIwIDAgMTMwIDgwIiBhcmlhLWhpZGRlbj0idHJ1ZSI+PHJlY3QgeD0iNCIgeT0iMTAiIHdpZHRoPSI3OCIgaGVpZ2h0PSI2MiIgcng9IjEwIiBmaWxsPSJ2YXIoLS1zdXJmYWNlKSIgc3Ryb2tlPSJ2YXIoLS1saW5lKSIgc3Ryb2tlLXdpZHRoPSIyIi8+PHJlY3QgeD0iMTQiIHk9IjIyIiB3aWR0aD0iNDQiIGhlaWdodD0iOCIgcng9IjQiIGZpbGw9InZhcigtLW9rKSIvPjxyZWN0IHg9IjE0IiB5PSIzNiIgd2lkdGg9IjQ0IiBoZWlnaHQ9IjgiIHJ4PSI0IiBmaWxsPSJ2YXIoLS1vaykiLz48cmVjdCB4PSIxNCIgeT0iNTAiIHdpZHRoPSI0NCIgaGVpZ2h0PSI4IiByeD0iNCIgZmlsbD0idmFyKC0tbG9jaykiLz48cGF0aCBkPSJNODggNDFoMTQiIHN0cm9rZT0idmFyKC0tbXV0ZWQpIiBzdHJva2Utd2lkdGg9IjIuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PHBhdGggZD0iTTk4IDM2bDUgNS01IDUiIHN0cm9rZT0idmFyKC0tbXV0ZWQpIiBzdHJva2Utd2lkdGg9IjIuNSIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PHJlY3QgeD0iMTA2IiB5PSIyOCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjI2IiByeD0iNSIgZmlsbD0idmFyKC0tbG9jaykiLz48cmVjdCB4PSIxMTEiIHk9IjQwIiB3aWR0aD0iMTAiIGhlaWdodD0iOSIgcng9IjIiIGZpbGw9IiNmZmYiLz48cGF0aCBkPSJNMTEzIDQwdi0zYTMgMyAwIDAxNiAwdjMiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSJub25lIi8+PC9zdmc+YDsKCi8vIC0tLS0tLS0tLS0gbG9naW4gLS0tLS0tLS0tLQpmdW5jdGlvbiByZW5kZXJMb2dpbihkZW1vKSB7CiAgJCgnI2FwcCcpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJsb2dpbiI+PGRpdiBjbGFzcz0iY2FyZCI+CiAgICA8ZGl2IGNsYXNzPSJhcnQiPiR7SEVST19TVkd9PC9kaXY+CiAgICA8Zm9ybSBpZD0ibG9naW5Gb3JtIj4KICAgICAgPGgxPkV0aXF1ZXRhSHViPC9oMT4KICAgICAgPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjAiPkV0aXF1ZXRhcyBkZSBNZXJjYWRvIExpYnJlLCBGYWxhYmVsbGEgeSBQYXJpcyBlbiB1bmEgc29sYSBiYW5kZWphLjwvcD4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5Db3JyZW88aW5wdXQgdHlwZT0iZW1haWwiIGlkPSJsRW1haWwiIGF1dG9jb21wbGV0ZT0idXNlcm5hbWUiIHJlcXVpcmVkPjwvbGFiZWw+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+Q29udHJhc2XDsWE8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJsUGFzcyIgYXV0b2NvbXBsZXRlPSJjdXJyZW50LXBhc3N3b3JkIiByZXF1aXJlZD48L2xhYmVsPgogICAgICA8ZGl2IGNsYXNzPSJlcnIiIGlkPSJsRXJyIj48L2Rpdj4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiPkVudHJhcjwvYnV0dG9uPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUiIHR5cGU9ImJ1dHRvbiIgaWQ9ImZvcmdvdCI+wr9PbHZpZGFzdGUgdHUgY29udHJhc2XDsWE/PC9idXR0b24+CiAgICAgICR7ZGVtbyA/ICc8ZGl2IGNsYXNzPSJkZW1vLWhpbnQiPk1vZG8gZGVtbzogZW50cmEgY29uIDxiPmJvZGVnYUBkZW1vLmNsPC9iPiwgPGI+dmVuZGVkb3IxQGRlbW8uY2w8L2I+IG8gPGI+YWRtaW5AZGVtby5jbDwvYj4sIGNsYXZlIDxiPmRlbW8xMjM0PC9iPi48L2Rpdj4nIDogJyd9CiAgICA8L2Zvcm0+PC9kaXY+PC9kaXY+YDsKICAkKCcjbG9naW5Gb3JtJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgIGUucHJldmVudERlZmF1bHQoKTsKICAgICQoJyNsRXJyJykudGV4dENvbnRlbnQgPSAnJzsKICAgIHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9sb2dpbicsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgZW1haWw6ICQoJyNsRW1haWwnKS52YWx1ZSwgcGFzc3dvcmQ6ICQoJyNsUGFzcycpLnZhbHVlIH0gfSk7IGJvb3QoKTsgfQogICAgY2F0Y2ggKGVycikgeyAkKCcjbEVycicpLnRleHRDb250ZW50ID0gZXJyLm1lc3NhZ2U7IH0KICB9OwogICQoJyNmb3Jnb3QnKS5vbmNsaWNrID0gKCkgPT4gcmVuZGVyRm9yZ290KCQoJyNsRW1haWwnKS52YWx1ZSk7Cn0KCi8vIFJlY3VwZXJhciBjb250cmFzZcOxYTogY29ycmVvIC0+IGPDs2RpZ28gZGUgNiBkw61naXRvcyAtPiBlbnRyYXIgbyBjYW1iaWFyIGNvbnRyYXNlw7FhCmZ1bmN0aW9uIHJlbmRlckZvcmdvdChwcmVmaWxsID0gJycpIHsKICBsZXQgZW1haWwgPSBwcmVmaWxsLCBjb2RlID0gJyc7CiAgY29uc3Qgc2hlbGwgPSBpbm5lciA9PiB7ICQoJyNhcHAnKS5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz0ibG9naW4iPjxkaXYgY2xhc3M9ImNhcmQiPjxkaXYgY2xhc3M9ImFydCI+JHtIRVJPX1NWR308L2Rpdj48Zm9ybSBpZD0iZkZvcm0iPiR7aW5uZXJ9PGRpdiBjbGFzcz0iZXJyIiBpZD0iZkVyciI+PC9kaXY+PC9mb3JtPjwvZGl2PjwvZGl2PmA7IH07CiAgY29uc3QgYmFjayA9ICgpID0+IHsgY29uc3QgYiA9ICQoJyNmQmFjaycpOyBpZiAoYikgYi5vbmNsaWNrID0gKCkgPT4gcmVuZGVyTG9naW4oKTsgfTsKICBjb25zdCBlcnIgPSBtID0+IHsgJCgnI2ZFcnInKS50ZXh0Q29udGVudCA9IG07IH07CiAgZnVuY3Rpb24gc3RlcEVtYWlsKCkgewogICAgc2hlbGwoYDxoMT5SZWN1cGVyYXIgYWNjZXNvPC9oMT48cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJtYXJnaW46MCI+RXNjcmliZSB0dSBjb3JyZW8geSB0ZSBlbnZpYXJlbW9zIHVuIGPDs2RpZ28gZGUgNiBkw61naXRvcy48L3A+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+Q29ycmVvPGlucHV0IHR5cGU9ImVtYWlsIiBpZD0iZkVtYWlsIiBhdXRvY29tcGxldGU9InVzZXJuYW1lIiByZXF1aXJlZCB2YWx1ZT0iJHtlc2MoZW1haWwpfSI+PC9sYWJlbD4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiPkVudmlhciBjw7NkaWdvPC9idXR0b24+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIiB0eXBlPSJidXR0b24iIGlkPSJmQmFjayI+Vm9sdmVyPC9idXR0b24+YCk7CiAgICBiYWNrKCk7CiAgICAkKCcjZkZvcm0nKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4gewogICAgICBlLnByZXZlbnREZWZhdWx0KCk7IGVtYWlsID0gJCgnI2ZFbWFpbCcpLnZhbHVlLnRyaW0oKTsKICAgICAgY29uc3QgYiA9IGUuc3VibWl0dGVyOyBpZiAoYikgYi5kaXNhYmxlZCA9IHRydWU7CiAgICAgIHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9wYXNzd29yZC9mb3Jnb3QnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGVtYWlsIH0gfSk7IHN0ZXBDb2RlKCk7IH0KICAgICAgY2F0Y2ggKHgpIHsgZXJyKHgubWVzc2FnZSk7IGlmIChiKSBiLmRpc2FibGVkID0gZmFsc2U7IH0KICAgIH07CiAgfQogIGZ1bmN0aW9uIHN0ZXBDb2RlKCkgewogICAgc2hlbGwoYDxoMT5SZXZpc2EgdHUgY29ycmVvPC9oMT48cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJtYXJnaW46MCI+U2kgPGI+JHtlc2MoZW1haWwpfTwvYj4gZXN0w6EgcmVnaXN0cmFkbywgdGUgbGxlZ8OzIHVuIGPDs2RpZ28gZGUgNiBkw61naXRvcy4gVmVuY2UgZW4gMTUgbWludXRvcy4gUmV2aXNhIHRhbWJpw6luIGxhIGNhcnBldGEgZGUgc3BhbS48L3A+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+Q8OzZGlnbzxpbnB1dCB0eXBlPSJ0ZXh0IiBpZD0iZkNvZGUiIGlucHV0bW9kZT0ibnVtZXJpYyIgYXV0b2NvbXBsZXRlPSJvbmUtdGltZS1jb2RlIiBtYXhsZW5ndGg9IjYiIHBhdHRlcm49IlswLTldezZ9IiByZXF1aXJlZCBzdHlsZT0iZm9udC1mYW1pbHk6dmFyKC0tbW9ubyk7Zm9udC1zaXplOjI0cHg7bGV0dGVyLXNwYWNpbmc6OHB4O3RleHQtYWxpZ246Y2VudGVyIj48L2xhYmVsPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIHR5cGU9InN1Ym1pdCI+Q29udGludWFyPC9idXR0b24+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSIgdHlwZT0iYnV0dG9uIiBpZD0iZlJlc2VuZCI+RW52aWFyIG90cm8gY8OzZGlnbzwvYnV0dG9uPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSIgdHlwZT0iYnV0dG9uIiBpZD0iZkJhY2siPlZvbHZlcjwvYnV0dG9uPmApOwogICAgYmFjaygpOwogICAgJCgnI2ZDb2RlJykuZm9jdXMoKTsKICAgICQoJyNmUmVzZW5kJykub25jbGljayA9IGFzeW5jICgpID0+IHsgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL3Bhc3N3b3JkL2ZvcmdvdCcsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgZW1haWwgfSB9KTsgdG9hc3QoJ0PDs2RpZ28gcmVlbnZpYWRvJyk7IH0gY2F0Y2ggKHgpIHsgZXJyKHgubWVzc2FnZSk7IH0gfTsKICAgICQoJyNmRm9ybScpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICAgIGUucHJldmVudERlZmF1bHQoKTsgY29kZSA9ICQoJyNmQ29kZScpLnZhbHVlLnRyaW0oKTsKICAgICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL3Bhc3N3b3JkL2NoZWNrJywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBlbWFpbCwgY29kZSB9IH0pOyBzdGVwQ2hvb3NlKCk7IH0KICAgICAgY2F0Y2ggKHgpIHsgZXJyKHgubWVzc2FnZSk7IH0KICAgIH07CiAgfQogIGZ1bmN0aW9uIHN0ZXBDaG9vc2UoKSB7CiAgICBzaGVsbChgPGgxPkPDs2RpZ28gY29ycmVjdG88L2gxPjxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9Im1hcmdpbjowIj7Cv1F1w6kgcXVpZXJlcyBoYWNlcj88L3A+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgdHlwZT0iYnV0dG9uIiBpZD0iZkxvZ2luIj5FbnRyYXIgYWhvcmE8L2J1dHRvbj4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1naG9zdCIgdHlwZT0iYnV0dG9uIiBpZD0iZkNoYW5nZSI+Q2FtYmlhciBtaSBjb250cmFzZcOxYTwvYnV0dG9uPmApOwogICAgJCgnI2ZMb2dpbicpLm9uY2xpY2sgPSBhc3luYyAoKSA9PiB7IHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9wYXNzd29yZC9sb2dpbicsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgZW1haWwsIGNvZGUgfSB9KTsgYm9vdCgpOyB9IGNhdGNoICh4KSB7IGVycih4Lm1lc3NhZ2UpOyB9IH07CiAgICAkKCcjZkNoYW5nZScpLm9uY2xpY2sgPSBzdGVwTmV3OwogIH0KICBmdW5jdGlvbiBzdGVwTmV3KCkgewogICAgc2hlbGwoYDxoMT5OdWV2YSBjb250cmFzZcOxYTwvaDE+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+TnVldmEgY29udHJhc2XDsWEgKG3DrW5pbW8gOCk8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJmUDEiIGF1dG9jb21wbGV0ZT0ibmV3LXBhc3N3b3JkIiBtaW5sZW5ndGg9IjgiIHJlcXVpcmVkPjwvbGFiZWw+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+UmVww610ZWxhPGlucHV0IHR5cGU9InBhc3N3b3JkIiBpZD0iZlAyIiBhdXRvY29tcGxldGU9Im5ldy1wYXNzd29yZCIgbWlubGVuZ3RoPSI4IiByZXF1aXJlZD48L2xhYmVsPgogICAgICA8bGFiZWwgY2xhc3M9InN3aXRjaCIgc3R5bGU9ImZvbnQtc2l6ZToxM3B4Ij48aW5wdXQgdHlwZT0iY2hlY2tib3giIGlkPSJmU2hvdyI+IE1vc3RyYXIgY29udHJhc2XDsWE8L2xhYmVsPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIHR5cGU9InN1Ym1pdCI+R3VhcmRhciB5IGVudHJhcjwvYnV0dG9uPmApOwogICAgJCgnI2ZTaG93Jykub25jaGFuZ2UgPSBlID0+IHsgJCgnI2ZQMScpLnR5cGUgPSAkKCcjZlAyJykudHlwZSA9IGUudGFyZ2V0LmNoZWNrZWQgPyAndGV4dCcgOiAncGFzc3dvcmQnOyB9OwogICAgJCgnI2ZGb3JtJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpOwogICAgICBpZiAoJCgnI2ZQMScpLnZhbHVlICE9PSAkKCcjZlAyJykudmFsdWUpIHJldHVybiBlcnIoJ0xhcyBjb250cmFzZcOxYXMgbm8gY29pbmNpZGVuJyk7CiAgICAgIHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9wYXNzd29yZC9yZXNldCcsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgZW1haWwsIGNvZGUsIHBhc3N3b3JkOiAkKCcjZlAxJykudmFsdWUgfSB9KTsgdG9hc3QoJ0NvbnRyYXNlw7FhIGFjdHVhbGl6YWRhJyk7IGJvb3QoKTsgfQogICAgICBjYXRjaCAoeCkgeyBlcnIoeC5tZXNzYWdlKTsgfQogICAgfTsKICB9CiAgc3RlcEVtYWlsKCk7Cn0KCmZ1bmN0aW9uIHJlbmRlclNldHVwKCkgewogICQoJyNhcHAnKS5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz0ibG9naW4iPjxkaXYgY2xhc3M9ImNhcmQiPgogICAgPGRpdiBjbGFzcz0iYXJ0Ij4ke0hFUk9fU1ZHfTwvZGl2PgogICAgPGZvcm0gaWQ9InNldHVwRm9ybSI+CiAgICAgIDxoMT5CaWVudmVuaWRvPC9oMT4KICAgICAgPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjAiPkNyZWEgbGEgY3VlbnRhIGRlIGFkbWluaXN0cmFkb3IuIENvbiBlbGxhIGFncmVnYXMgdmVuZGVkb3JlcywgdXN1YXJpb3MgeSBsYSBjb25leGnDs24gYSBNZXJjYWRvIExpYnJlLjwvcD4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5UdSBub21icmU8aW5wdXQgdHlwZT0idGV4dCIgaWQ9InNOYW1lIiByZXF1aXJlZD48L2xhYmVsPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPkNvcnJlbzxpbnB1dCB0eXBlPSJlbWFpbCIgaWQ9InNFbWFpbCIgYXV0b2NvbXBsZXRlPSJ1c2VybmFtZSIgcmVxdWlyZWQ+PC9sYWJlbD4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5Db250cmFzZcOxYSAobcOtbmltbyA4KTxpbnB1dCB0eXBlPSJwYXNzd29yZCIgaWQ9InNQYXNzIiBhdXRvY29tcGxldGU9Im5ldy1wYXNzd29yZCIgbWlubGVuZ3RoPSI4IiByZXF1aXJlZD48L2xhYmVsPgogICAgICA8bGFiZWwgY2xhc3M9InN3aXRjaCIgc3R5bGU9ImZvbnQtc2l6ZToxM3B4Ij48aW5wdXQgdHlwZT0iY2hlY2tib3giIGlkPSJzU2hvdyI+IE1vc3RyYXIgY29udHJhc2XDsWE8L2xhYmVsPgogICAgICA8ZGl2IGNsYXNzPSJlcnIiIGlkPSJzRXJyIj48L2Rpdj4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiPkNyZWFyIGFkbWluaXN0cmFkb3I8L2J1dHRvbj4KICAgIDwvZm9ybT48L2Rpdj48L2Rpdj5gOwogICQoJyNzU2hvdycpLm9uY2hhbmdlID0gZSA9PiB7ICQoJyNzUGFzcycpLnR5cGUgPSBlLnRhcmdldC5jaGVja2VkID8gJ3RleHQnIDogJ3Bhc3N3b3JkJzsgfTsKICAkKCcjc2V0dXBGb3JtJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgIGUucHJldmVudERlZmF1bHQoKTsKICAgIHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9zZXR1cCcsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgbmFtZTogJCgnI3NOYW1lJykudmFsdWUsIGVtYWlsOiAkKCcjc0VtYWlsJykudmFsdWUsIHBhc3N3b3JkOiAkKCcjc1Bhc3MnKS52YWx1ZSB9IH0pOyBib290KCk7IH0KICAgIGNhdGNoIChlcnIpIHsgJCgnI3NFcnInKS50ZXh0Q29udGVudCA9IGVyci5tZXNzYWdlOyB9CiAgfTsKfQoKLy8gLS0tLS0tLS0tLSBlc3RydWN0dXJhIC0tLS0tLS0tLS0KZnVuY3Rpb24gdGFic0Zvcihyb2xlKSB7CiAgaWYgKHJvbGUgPT09ICdzZWxsZXInKSByZXR1cm4gW1snc2VsbGVyJywgJ01pIGN1ZW50YSddXTsKICBpZiAocm9sZSA9PT0gJ2Z1bGZpbGxtZW50JykgcmV0dXJuIFtbJ3RyYXknLCAnQmFuZGVqYSBkZSBldGlxdWV0YXMnXV07CiAgcmV0dXJuIFtbJ3RyYXknLCAnQmFuZGVqYSddLCBbJ3NlbGxlcicsICdWZW5kZWRvcmVzJ10sIFsnYWRtaW4nLCAnVXN1YXJpb3MgeSBhanVzdGVzJ11dOwp9CmZ1bmN0aW9uIHJlbmRlclNoZWxsKCkgewogIGNvbnN0IHRhYnMgPSB0YWJzRm9yKG1lLnVzZXIucm9sZSk7CiAgaWYgKCF0YWIgfHwgIXRhYnMuc29tZSh0ID0+IHRbMF0gPT09IHRhYikpIHRhYiA9IHN0b3JlLmdldCgndGFiJywgdGFic1swXVswXSk7CiAgaWYgKCF0YWJzLnNvbWUodCA9PiB0WzBdID09PSB0YWIpKSB0YWIgPSB0YWJzWzBdWzBdOwogICQoJyNhcHAnKS5pbm5lckhUTUwgPSBgCiAgPGhlYWRlciBjbGFzcz0idG9wIj48ZGl2IGNsYXNzPSJ3cmFwIj4KICAgIDxhIGNsYXNzPSJicmFuZCIgaHJlZj0iLyI+PGltZyBzcmM9Ii9sb2dvLnN2ZyIgYWx0PSIiPkV0aXF1ZXRhSHViPC9hPgogICAgJHt0YWJzLmxlbmd0aCA+IDEgPyBgPG5hdiBjbGFzcz0ibmF2Ij4ke3RhYnMubWFwKChbaywgbl0pID0+IGA8YnV0dG9uIGRhdGEtdGFiPSIke2t9IiBhcmlhLWN1cnJlbnQ9IiR7ayA9PT0gdGFifSI+JHtufTwvYnV0dG9uPmApLmpvaW4oJycpfTwvbmF2PmAgOiAnJ30KICAgIDxzcGFuIGNsYXNzPSJzcGFjZXIiPjwvc3Bhbj4KICAgIDxzcGFuIGNsYXNzPSJsaXZlIiBpZD0ibGl2ZSI+PGk+PC9pPjxzcGFuPkNvbmVjdGFuZG/igKY8L3NwYW4+PC9zcGFuPgogICAgPGRpdiBjbGFzcz0iY2xvY2siIGlkPSJjbG9jayI+JHtJLmNsb2NrLnJlcGxhY2UoJzxzdmcnLCAnPHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHN0eWxlPSJjb2xvcjp2YXIoLS1hY2NlbnQpIicpfTxkaXY+PHNtYWxsPkNvcnRlICR7ZXNjKG1lLmN1dG9mZil9PC9zbWFsbD48YiBpZD0iY2QiPi0tOi0tOi0tPC9iPjwvZGl2PjwvZGl2PgogICAgPGRpdiBjbGFzcz0idXNlciI+PGRpdj48Yj4ke2VzYyhtZS5zZWxsZXI/Lm5hbWUgfHwgbWUudXNlci5uYW1lKX08L2I+PHNtYWxsPiR7ZXNjKG1lLnVzZXIuZW1haWwpfTwvc21hbGw+PC9kaXY+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgaWQ9ImxvZ291dCI+U2FsaXI8L2J1dHRvbj48L2Rpdj4KICA8L2Rpdj48L2hlYWRlcj4KICA8bWFpbiBjbGFzcz0id3JhcCIgaWQ9Im1haW4iPjwvbWFpbj5gOwogICQkKCcubmF2IGJ1dHRvbicpLmZvckVhY2goYiA9PiBiLm9uY2xpY2sgPSAoKSA9PiB7IHRhYiA9IGIuZGF0YXNldC50YWI7IHN0b3JlLnNldCgndGFiJywgdGFiKTsgJCQoJy5uYXYgYnV0dG9uJykuZm9yRWFjaCh4ID0+IHguc2V0QXR0cmlidXRlKCdhcmlhLWN1cnJlbnQnLCB4ID09PSBiKSk7IHJlbmRlclRhYigpOyB9KTsKICAkKCcjbG9nb3V0Jykub25jbGljayA9IGFzeW5jICgpID0+IHsgYXdhaXQgYXBpKCcvYXBpL2xvZ291dCcsIHsgbWV0aG9kOiAnUE9TVCcgfSkuY2F0Y2goKCkgPT4ge30pOyBsb2NhdGlvbi5yZWxvYWQoKTsgfTsKICBzdGFydENsb2NrKCk7IGNvbm5lY3RTdHJlYW0oKTsgcmVuZGVyVGFiKCk7Cn0KZnVuY3Rpb24gcmVuZGVyVGFiKCkgeyAoeyB0cmF5OiByZW5kZXJUcmF5LCBzZWxsZXI6IHJlbmRlclNlbGxlciwgYWRtaW46IHJlbmRlckFkbWluIH0pW3RhYl0oKTsgfQoKZnVuY3Rpb24gc3RhcnRDbG9jaygpIHsKICBjb25zdCBbaGgsIG1tXSA9IG1lLmN1dG9mZi5zcGxpdCgnOicpLm1hcChOdW1iZXIpOwogIGNvbnN0IHRpY2sgPSAoKSA9PiB7CiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLCBjdXQgPSBuZXcgRGF0ZShub3cpOyBjdXQuc2V0SG91cnMoaGgsIG1tLCAwLCAwKTsKICAgIGNvbnN0IGMgPSAkKCcjY2xvY2snKTsgaWYgKCFjKSByZXR1cm47CiAgICBpZiAobm93ID49IGN1dCkgeyBjdXQuc2V0RGF0ZShjdXQuZ2V0RGF0ZSgpICsgMSk7IGMuY2xhc3NMaXN0LmFkZCgnbGF0ZScpOyB9IGVsc2UgYy5jbGFzc0xpc3QucmVtb3ZlKCdsYXRlJyk7CiAgICBjb25zdCBkID0gTWF0aC5mbG9vcigoY3V0IC0gbm93KSAvIDEwMDApOwogICAgJCgnI2NkJykudGV4dENvbnRlbnQgPSBbTWF0aC5mbG9vcihkIC8gMzYwMCksIE1hdGguZmxvb3IoZCAlIDM2MDAgLyA2MCksIGQgJSA2MF0ubWFwKHggPT4gU3RyaW5nKHgpLnBhZFN0YXJ0KDIsICcwJykpLmpvaW4oJzonKTsKICB9OwogIHRpY2soKTsgY2xlYXJJbnRlcnZhbChzdGFydENsb2NrLl9pKTsgc3RhcnRDbG9jay5faSA9IHNldEludGVydmFsKHRpY2ssIDEwMDApOwp9CgpsZXQgZXMgPSBudWxsLCByZWZyZXNoVCA9IG51bGw7CmZ1bmN0aW9uIGNvbm5lY3RTdHJlYW0oKSB7CiAgaWYgKGVzKSBlcy5jbG9zZSgpOwogIGVzID0gbmV3IEV2ZW50U291cmNlKCcvYXBpL3N0cmVhbScpOwogIGNvbnN0IGxpdmUgPSBvbiA9PiB7IGNvbnN0IGwgPSAkKCcjbGl2ZScpOyBpZiAoIWwpIHJldHVybjsgbC5jbGFzc0xpc3QudG9nZ2xlKCdvbicsIG9uKTsgbC5sYXN0RWxlbWVudENoaWxkLnRleHRDb250ZW50ID0gb24gPyAnRW4gdml2bycgOiAnUmVjb25lY3RhbmRv4oCmJzsgfTsKICBlcy5vbm9wZW4gPSAoKSA9PiBsaXZlKHRydWUpOwogIGVzLm9uZXJyb3IgPSAoKSA9PiBsaXZlKGZhbHNlKTsKICBlcy5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBldiA9PiB7CiAgICBjb25zdCBkID0gSlNPTi5wYXJzZShldi5kYXRhKTsKICAgIGNsZWFyVGltZW91dChyZWZyZXNoVCk7CiAgICByZWZyZXNoVCA9IHNldFRpbWVvdXQoKCkgPT4geyBpZiAodGFiID09PSAndHJheScpIGxvYWRPcmRlcnMoKTsgZWxzZSBpZiAodGFiID09PSAnc2VsbGVyJyAmJiBbJ29yZGVyJywgJ2xhYmVsJywgJ2Jsb2NrbGlzdCcsICdjb25uZWN0aW9uJywgJ3ByaW50ZWQnXS5pbmNsdWRlcyhkLnR5cGUpKSBsb2FkU2VsbGVyT3JkZXJzKCk7IH0sIDYwMCk7CiAgfSk7Cn0KCi8vIC0tLS0tLS0tLS0gQkFOREVKQSAoZnVsZmlsbG1lbnQpIC0tLS0tLS0tLS0KZnVuY3Rpb24gcmVuZGVyVHJheSgpIHsKICBjb25zdCBhdXRvID0gc3RvcmUuZ2V0KCdhdXRvJywgZmFsc2UpOwogICQoJyNtYWluJykuaW5uZXJIVE1MID0gYAogIDxzZWN0aW9uIGNsYXNzPSJoZXJvIj4KICAgIDxkaXY+PGgxPkV0aXF1ZXRhcyBkZWwgZMOtYSwgPGVtPmxpc3RhcyBhbnRlcyBkZSBsYXMgJHtlc2MobWUuY3V0b2ZmKX08L2VtPjwvaDE+CiAgICA8cD5DYWRhIHBlZGlkbyBudWV2byBkZSBsb3MgdmVuZGVkb3JlcyBsbGVnYSBhcXXDrSBjb24gc3UgZXRpcXVldGEgZW4gMTAwIMOXIDE1MCBtbSB5IGxhIGZyYW5qYSBkZSBsbyBxdWUgY29tcHLDsyBlbCBjbGllbnRlLiBMb3MgcGVkaWRvcyBjb24gcHJvZHVjdG9zIHF1ZSBubyB0cmFiYWphcyBxdWVkYW4gYmxvcXVlYWRvcy48L3A+PC9kaXY+CiAgICAke0hFUk9fU1ZHfQogIDwvc2VjdGlvbj4KICA8ZGl2IGNsYXNzPSJrcGlzIiBpZD0ia3BpcyI+PC9kaXY+CiAgPGRpdiBjbGFzcz0iYXV0b2JhciI+CiAgICA8ZGl2PjxsYWJlbCBjbGFzcz0ic3dpdGNoIj48aW5wdXQgdHlwZT0iY2hlY2tib3giIGlkPSJhdXRvRGwiICR7YXV0byA/ICdjaGVja2VkJyA6ICcnfT4gRGVzY2FyZ2EgYXV0b23DoXRpY2E8L2xhYmVsPgogICAgPHA+TWllbnRyYXMgZXN0YSBwYW50YWxsYSBlc3TDqSBhYmllcnRhLCBjYWRhIGV0aXF1ZXRhIG51ZXZhIHNlIGRlc2NhcmdhIHNvbGEgZW4gUERGIGFwZW5hcyBlbCBtYXJrZXRwbGFjZSBsYSBsaWJlcmEgeSBxdWVkYSBtYXJjYWRhIGNvbW8gaW1wcmVzYS4gTGEgcHJpbWVyYSB2ZXogZWwgbmF2ZWdhZG9yIHB1ZWRlIHBlZGlyIHBlcm1pc28gcGFyYSBkZXNjYXJnYXIgdmFyaW9zIGFyY2hpdm9zLjwvcD48L2Rpdj4KICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tZ2hvc3QiIGlkPSJzeW5jTm93Ij4ke0kuc3luY31CdXNjYXIgcGVkaWRvcyBhaG9yYTwvYnV0dG9uPgogIDwvZGl2PgogIDxkaXYgY2xhc3M9InBhbmVsIj4KICAgIDxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPgogICAgICA8aDI+QmFuZGVqYTwvaDI+CiAgICAgIDxkaXYgY2xhc3M9ImZpbHRlcnMiPgogICAgICAgIDxkaXYgY2xhc3M9ImNoaXBzIiBpZD0idmlld0NoaXBzIj4ke1tbJ3BlbmRpbmcnLCAnUGVuZGllbnRlcyddLCBbJ3ByaW50ZWQnLCAnSW1wcmVzYXMgaG95J10sIFsnYWxsJywgJ8OabHRpbW9zIDcgZMOtYXMnXV0ubWFwKChbaywgbl0pID0+IGA8YnV0dG9uIGNsYXNzPSJjaGlwIiBkYXRhLXY9IiR7a30iIGFyaWEtcHJlc3NlZD0iJHt1aS52aWV3ID09PSBrfSI+JHtufTwvYnV0dG9uPmApLmpvaW4oJycpfTwvZGl2PgogICAgICAgIDxkaXYgY2xhc3M9ImNoaXBzIiBpZD0ibWtDaGlwcyI+JHtbWydhbGwnLCAnVG9kb3MnXSwgWydtbCcsICdNZXJjYWRvIExpYnJlJ10sIFsnZmEnLCAnRmFsYWJlbGxhJ10sIFsncGEnLCAnUGFyaXMnXV0ubWFwKChbaywgbl0pID0+IGA8YnV0dG9uIGNsYXNzPSJjaGlwIiBkYXRhLW1rPSIke2t9IiBhcmlhLXByZXNzZWQ9IiR7dWkubWsgPT09IGt9Ij4ke259PC9idXR0b24+YCkuam9pbignJyl9PC9kaXY+CiAgICAgICAgPHNlbGVjdCBpZD0ic2VsbGVyRiIgYXJpYS1sYWJlbD0iVmVuZGVkb3IiPjwvc2VsZWN0PgogICAgICAgIDxpbnB1dCB0eXBlPSJzZWFyY2giIGlkPSJxIiBwbGFjZWhvbGRlcj0iQnVzY2FyIHBlZGlkbyBvIFNLVSIgdmFsdWU9IiR7ZXNjKHVpLnEpfSIgYXJpYS1sYWJlbD0iQnVzY2FyIj4KICAgICAgPC9kaXY+CiAgICA8L2Rpdj4KICAgIDxkaXYgY2xhc3M9InRhYmxlLXdyYXAiPjx0YWJsZT4KICAgICAgPHRoZWFkPjx0cj48dGg+PGlucHV0IHR5cGU9ImNoZWNrYm94IiBjbGFzcz0iY2IiIGlkPSJzZWxBbGwiIGFyaWEtbGFiZWw9IlNlbGVjY2lvbmFyIHRvZGFzIj48L3RoPjx0aD5WZW5kZWRvcjwvdGg+PHRoPkNhbmFsPC90aD48dGg+TsKwIHBlZGlkbzwvdGg+PHRoPlF1w6kgY29tcHLDsyBlbCBjbGllbnRlPC90aD48dGg+RXN0YWRvPC90aD48dGg+PC90aD48L3RyPjwvdGhlYWQ+CiAgICAgIDx0Ym9keSBpZD0icm93cyI+PC90Ym9keT48L3RhYmxlPjwvZGl2PgogICAgPGRpdiBjbGFzcz0icGFuZWwtZm9vdCI+CiAgICAgIDxzcGFuIGlkPSJzZWxJbmZvIj48L3NwYW4+PHNwYW4gY2xhc3M9InNwYWNlciI+PC9zcGFuPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUiIGlkPSJkbFNlbCIgZGlzYWJsZWQ+JHtJLmRvd259RGVzY2FyZ2FyIHNlbGVjY2nDs248L2J1dHRvbj4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiBpZD0iZGxSZWFkeSI+JHtJLmRvd259RGVzY2FyZ2FyIHRvZGFzIGxhcyBsaXN0YXM8L2J1dHRvbj4KICAgIDwvZGl2PgogIDwvZGl2PmA7CiAgJCgnI2F1dG9EbCcpLm9uY2hhbmdlID0gZSA9PiB7IHN0b3JlLnNldCgnYXV0bycsIGUudGFyZ2V0LmNoZWNrZWQpOyB0b2FzdChlLnRhcmdldC5jaGVja2VkID8gJ0Rlc2NhcmdhIGF1dG9tw6F0aWNhIGFjdGl2YWRhJyA6ICdEZXNjYXJnYSBhdXRvbcOhdGljYSBkZXNhY3RpdmFkYScpOyBpZiAoZS50YXJnZXQuY2hlY2tlZCkgYXV0b0Rvd25sb2FkKCk7IH07CiAgJCgnI3N5bmNOb3cnKS5vbmNsaWNrID0gYXN5bmMgKCkgPT4geyBhd2FpdCBhcGkoJy9hcGkvc3luYycsIHsgbWV0aG9kOiAnUE9TVCcgfSk7IHRvYXN0KCdCdXNjYW5kbyBwZWRpZG9zIG51ZXZvcyBlbiBsb3MgbWFya2V0cGxhY2Vz4oCmJyk7IH07CiAgJCgnI3ZpZXdDaGlwcycpLm9uY2xpY2sgPSBlID0+IHsgY29uc3QgYiA9IGUudGFyZ2V0LmNsb3Nlc3QoJy5jaGlwJyk7IGlmICghYikgcmV0dXJuOyB1aS52aWV3ID0gYi5kYXRhc2V0LnY7ICQkKCcjdmlld0NoaXBzIC5jaGlwJykuZm9yRWFjaChjID0+IGMuc2V0QXR0cmlidXRlKCdhcmlhLXByZXNzZWQnLCBjID09PSBiKSk7IHNlbGVjdGVkLmNsZWFyKCk7IGxvYWRPcmRlcnMoKTsgfTsKICAkKCcjbWtDaGlwcycpLm9uY2xpY2sgPSBlID0+IHsgY29uc3QgYiA9IGUudGFyZ2V0LmNsb3Nlc3QoJy5jaGlwJyk7IGlmICghYikgcmV0dXJuOyB1aS5tayA9IGIuZGF0YXNldC5tazsgJCQoJyNta0NoaXBzIC5jaGlwJykuZm9yRWFjaChjID0+IGMuc2V0QXR0cmlidXRlKCdhcmlhLXByZXNzZWQnLCBjID09PSBiKSk7IGRyYXdSb3dzKCk7IH07CiAgJCgnI3NlbGxlckYnKS5vbmNoYW5nZSA9IGUgPT4geyB1aS5zZWxsZXIgPSBlLnRhcmdldC52YWx1ZTsgZHJhd1Jvd3MoKTsgfTsKICAkKCcjcScpLm9uaW5wdXQgPSBlID0+IHsgdWkucSA9IGUudGFyZ2V0LnZhbHVlLnRyaW0oKS50b0xvd2VyQ2FzZSgpOyBkcmF3Um93cygpOyB9OwogICQoJyNyb3dzJykub25jaGFuZ2UgPSBlID0+IHsgY29uc3QgaWQgPSBlLnRhcmdldC5kYXRhc2V0LmlkOyBpZiAoIWlkKSByZXR1cm47IGUudGFyZ2V0LmNoZWNrZWQgPyBzZWxlY3RlZC5hZGQoK2lkKSA6IHNlbGVjdGVkLmRlbGV0ZSgraWQpOyB1cGRhdGVTZWwoKTsgfTsKICAkKCcjcm93cycpLm9uY2xpY2sgPSBhc3luYyBlID0+IHsKICAgIGNvbnN0IGIgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1hY3RdJyk7IGlmICghYikgcmV0dXJuOwogICAgY29uc3QgaWQgPSArYi5kYXRhc2V0LmlkOwogICAgaWYgKGIuZGF0YXNldC5hY3QgPT09ICdyZXRyeScpIHsgYi5kaXNhYmxlZCA9IHRydWU7IHRyeSB7IGF3YWl0IGFwaShgL2FwaS9vcmRlcnMvJHtpZH0vcmV0cnlgLCB7IG1ldGhvZDogJ1BPU1QnIH0pOyB0b2FzdCgnUmVpbnRlbnRhbmRv4oCmJyk7IGxvYWRPcmRlcnMoKTsgfSBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlKTsgfSB9CiAgICBpZiAoYi5kYXRhc2V0LmFjdCA9PT0gJ3VucHJpbnQnKSB7IGF3YWl0IGFwaShgL2FwaS9vcmRlcnMvJHtpZH0vdW5wcmludGAsIHsgbWV0aG9kOiAnUE9TVCcgfSk7IHRvYXN0KCdWb2x2acOzIGEgcGVuZGllbnRlcycpOyBsb2FkT3JkZXJzKCk7IH0KICB9OwogICQoJyNzZWxBbGwnKS5vbmNoYW5nZSA9IGUgPT4geyB2aXNpYmxlKCkuZmlsdGVyKG8gPT4gby5zdGF0ZSA9PT0gJ3JlYWR5JyB8fCBvLnN0YXRlID09PSAncHJpbnRlZCcpLmZvckVhY2gobyA9PiBlLnRhcmdldC5jaGVja2VkID8gc2VsZWN0ZWQuYWRkKG8uaWQpIDogc2VsZWN0ZWQuZGVsZXRlKG8uaWQpKTsgZHJhd1Jvd3MoKTsgfTsKICAkKCcjZGxTZWwnKS5vbmNsaWNrID0gKCkgPT4gZG93bmxvYWRCYXRjaChbLi4uc2VsZWN0ZWRdKTsKICAkKCcjZGxSZWFkeScpLm9uY2xpY2sgPSAoKSA9PiBkb3dubG9hZEJhdGNoKG9yZGVycy5maWx0ZXIobyA9PiBvLnN0YXRlID09PSAncmVhZHknKS5tYXAobyA9PiBvLmlkKSk7CiAgbG9hZE9yZGVycygpOwp9Cgphc3luYyBmdW5jdGlvbiBsb2FkT3JkZXJzKCkgewogIGlmICh0YWIgIT09ICd0cmF5JykgcmV0dXJuOwogIGNvbnN0IGQgPSBhd2FpdCBhcGkoYC9hcGkvb3JkZXJzP3ZpZXc9JHt1aS52aWV3fWApOwogIGNvbnN0IHByZXZSZWFkeSA9IG5ldyBTZXQob3JkZXJzLmZpbHRlcihvID0+IG8uc3RhdGUgPT09ICdyZWFkeScpLm1hcChvID0+IG8uaWQpKTsKICBvcmRlcnMgPSBkLm9yZGVyczsgc2VsbGVycyA9IGQuc2VsbGVyczsKICBjb25zdCBzZiA9ICQoJyNzZWxsZXJGJyk7CiAgaWYgKHNmKSB7IHNmLmlubmVySFRNTCA9IGA8b3B0aW9uIHZhbHVlPSJhbGwiPlRvZG9zIGxvcyB2ZW5kZWRvcmVzPC9vcHRpb24+YCArIHNlbGxlcnMubWFwKHMgPT4gYDxvcHRpb24gdmFsdWU9IiR7cy5pZH0iPiR7ZXNjKHMubmFtZSl9PC9vcHRpb24+YCkuam9pbignJyk7IHNmLnZhbHVlID0gdWkuc2VsbGVyOyB9CiAgY29uc3QgZnJlc2ggPSBvcmRlcnMuZmlsdGVyKG8gPT4gby5zdGF0ZSA9PT0gJ3JlYWR5JyAmJiAhcHJldlJlYWR5LmhhcyhvLmlkKSkubWFwKG8gPT4gby5pZCk7CiAgZHJhd1Jvd3MoZmlyc3RMb2FkID8gW10gOiBmcmVzaCk7CiAgaWYgKCFmaXJzdExvYWQgJiYgZnJlc2gubGVuZ3RoKSB0b2FzdChgJHtmcmVzaC5sZW5ndGh9IGV0aXF1ZXRhJHtmcmVzaC5sZW5ndGggPiAxID8gJ3MnIDogJyd9IG51ZXZhJHtmcmVzaC5sZW5ndGggPiAxID8gJ3MnIDogJyd9IGxpc3RhJHtmcmVzaC5sZW5ndGggPiAxID8gJ3MnIDogJyd9YCk7CiAgZmlyc3RMb2FkID0gZmFsc2U7CiAgaWYgKHN0b3JlLmdldCgnYXV0bycsIGZhbHNlKSkgYXV0b0Rvd25sb2FkKCk7Cn0KCmZ1bmN0aW9uIHZpc2libGUoKSB7CiAgcmV0dXJuIG9yZGVycy5maWx0ZXIobyA9PiAodWkubWsgPT09ICdhbGwnIHx8IG8ubWFya2V0cGxhY2UgPT09IHVpLm1rKSAmJiAodWkuc2VsbGVyID09PSAnYWxsJyB8fCBTdHJpbmcoby5zZWxsZXJfaWQpID09PSB1aS5zZWxsZXIpICYmCiAgICAoIXVpLnEgfHwgby5vcmRlcl9udW1iZXIudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyh1aS5xKSB8fCBvLml0ZW1zLnNvbWUoaSA9PiBbaS5za3UsIGkucHViX2lkLCBpLm5hbWVdLmpvaW4oJyAnKS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHVpLnEpKSkpOwp9CmZ1bmN0aW9uIGl0ZW1zSFRNTChvKSB7CiAgY29uc3QgYmFkID0gbmV3IFNldChvLmJsb2NrZWRfc2t1cyB8fCBbXSk7CiAgcmV0dXJuIGA8ZGl2IGNsYXNzPSJpdGVtcyI+JHtvLml0ZW1zLm1hcChpID0+IGA8c3BhbiBjbGFzcz0iJHtiYWQuaGFzKGkuc2t1KSB8fCBiYWQuaGFzKGkucHViX2lkKSA/ICdiYWQnIDogJyd9Ij48Yj4ke2VzYyhpLnF0eSl9w5c8L2I+ICR7ZXNjKGkubmFtZSl9JHtpLnZhcmlhbnQgPyBgIDxzcGFuIGNsYXNzPSJ2Ij7CtyAke2VzYyhpLnZhcmlhbnQpfTwvc3Bhbj5gIDogJyd9IDxzcGFuIGNsYXNzPSJtb25vIHYiPiR7ZXNjKGkuc2t1IHx8IGkucHViX2lkKX08L3NwYW4+PC9zcGFuPmApLmpvaW4oJycpfTwvZGl2PmA7Cn0KZnVuY3Rpb24gcGlsbChvKSB7IHJldHVybiBgPHNwYW4gY2xhc3M9InBpbGwgJHtvLnN0YXRlfSI+JHtwaWxsSWNvbltvLnN0YXRlXSB8fCAnJ30ke1NUQVRFW28uc3RhdGVdIHx8IG8uc3RhdGV9PC9zcGFuPmA7IH0KCmZ1bmN0aW9uIGRyYXdSb3dzKGZyZXNoID0gW10pIHsKICBjb25zdCBrcCA9ICQoJyNrcGlzJyk7CiAgaWYgKGtwKSB7CiAgICBjb25zdCBjID0gcyA9PiBvcmRlcnMuZmlsdGVyKG8gPT4gby5zdGF0ZSA9PT0gcykubGVuZ3RoOwogICAga3AuaW5uZXJIVE1MID0gW1snb2snLCBJLmNoZWNrLCBjKCdyZWFkeScpLCAnbGlzdGFzIHBhcmEgaW1wcmltaXInXSwgWyd3YWl0JywgSS5jbG9jaywgYygnd2FpdGluZycpICsgYygnZXJyb3InKSwgJ2VzcGVyYW5kbyBldGlxdWV0YSddLCBbJ2xvY2snLCBJLmxvY2ssIGMoJ2Jsb2NrZWQnKSwgJ2Jsb3F1ZWFkYXMgcG9yIGVsIHZlbmRlZG9yJ10sIFsnZG9uZScsIEkucHJpbnQsIGMoJ3ByaW50ZWQnKSwgdWkudmlldyA9PT0gJ3BlbmRpbmcnID8gJ2ltcHJlc2FzICh2ZXIgcGVzdGHDsWEpJyA6ICdpbXByZXNhcyddXQogICAgICAubWFwKChbaywgaWMsIG4sIHRdKSA9PiBgPGRpdiBjbGFzcz0ia3BpICR7a30iPjxkaXYgY2xhc3M9ImljIj4ke2ljfTwvZGl2PjxkaXY+PGI+JHtufTwvYj48c3Bhbj4ke3R9PC9zcGFuPjwvZGl2PjwvZGl2PmApLmpvaW4oJycpOwogIH0KICBjb25zdCByb3dzID0gdmlzaWJsZSgpOwogIGNvbnN0IHRiID0gJCgnI3Jvd3MnKTsgaWYgKCF0YikgcmV0dXJuOwogIGlmICghcm93cy5sZW5ndGgpIHsgdGIuaW5uZXJIVE1MID0gYDx0cj48dGQgY29sc3Bhbj0iNyI+PGRpdiBjbGFzcz0iZW1wdHkiPiR7RU1QVFlfU1ZHfTxkaXY+JHt1aS52aWV3ID09PSAncGVuZGluZycgPyAnTm8gaGF5IGV0aXF1ZXRhcyBwZW5kaWVudGVzLiBMb3MgcGVkaWRvcyBudWV2b3MgYXBhcmVjZW4gYXF1w60gc29sb3MuJyA6ICdTaW4gcGVkaWRvcyBwYXJhIGVzdGUgZmlsdHJvLid9PC9kaXY+PC9kaXY+PC90ZD48L3RyPmA7IHVwZGF0ZVNlbCgpOyByZXR1cm47IH0KICB0Yi5pbm5lckhUTUwgPSByb3dzLm1hcChvID0+IHsKICAgIGNvbnN0IGNhblNlbCA9IG8uc3RhdGUgPT09ICdyZWFkeScgfHwgby5zdGF0ZSA9PT0gJ3ByaW50ZWQnOwogICAgaWYgKCFjYW5TZWwpIHNlbGVjdGVkLmRlbGV0ZShvLmlkKTsKICAgIGxldCBub3RlID0gJyc7CiAgICBpZiAoby5zdGF0ZSA9PT0gJ2Jsb2NrZWQnKSBub3RlID0gJzxzcGFuIGNsYXNzPSJub3RlIGJhZCI+RWwgdmVuZGVkb3IgZGVzcGFjaGEgZXN0ZSBwZWRpZG8gcG9yIHN1IGN1ZW50YTwvc3Bhbj4nOwogICAgZWxzZSBpZiAoby5zdGF0ZSA9PT0gJ3dhaXRpbmcnKSBub3RlID0gYDxzcGFuIGNsYXNzPSJub3RlIj4ke2VzYyhvLmVycm9yIHx8ICdFbCBtYXJrZXRwbGFjZSBhw7puIG5vIGxpYmVyYSBsYSBldGlxdWV0YScpfTwvc3Bhbj5gOwogICAgZWxzZSBpZiAoby5zdGF0ZSA9PT0gJ2Vycm9yJykgbm90ZSA9IGA8c3BhbiBjbGFzcz0ibm90ZSBiYWQiPiR7ZXNjKG8uZXJyb3IgfHwgJycpfTwvc3Bhbj5gOwogICAgZWxzZSBpZiAoby5zdGF0ZSA9PT0gJ3ByaW50ZWQnKSBub3RlID0gYDxzcGFuIGNsYXNzPSJub3RlIj4ke2VzYyhmbXRUaW1lKG8ucHJpbnRlZF9hdCkpfSDCtyAke2VzYyhvLnByaW50ZWRfYnkgfHwgJycpfTwvc3Bhbj5gOwogICAgY29uc3QgYWN0aW9ucyA9IFtdOwogICAgaWYgKGNhblNlbCkgYWN0aW9ucy5wdXNoKGA8YSBjbGFzcz0iYnRuIGJ0bi1naG9zdCBidG4tc20iIGhyZWY9Ii9hcGkvb3JkZXJzLyR7by5pZH0vbGFiZWwucGRmIiB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciI+VmVyIFBERjwvYT5gKTsKICAgIGlmIChvLnN0YXRlID09PSAnZXJyb3InIHx8IG8uc3RhdGUgPT09ICd3YWl0aW5nJykgYWN0aW9ucy5wdXNoKGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWFjdD0icmV0cnkiIGRhdGEtaWQ9IiR7by5pZH0iPlJlaW50ZW50YXI8L2J1dHRvbj5gKTsKICAgIGlmIChvLnN0YXRlID09PSAncHJpbnRlZCcpIGFjdGlvbnMucHVzaChgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1hY3Q9InVucHJpbnQiIGRhdGEtaWQ9IiR7by5pZH0iPlZvbHZlciBhIHBlbmRpZW50ZTwvYnV0dG9uPmApOwogICAgcmV0dXJuIGA8dHIgY2xhc3M9IiR7by5zdGF0ZSA9PT0gJ2Jsb2NrZWQnID8gJ2lzLWJsb2NrZWQnIDogJyd9ICR7ZnJlc2guaW5jbHVkZXMoby5pZCkgPyAnaXMtbmV3JyA6ICcnfSI+CiAgICAgIDx0ZD4ke28uc3RhdGUgPT09ICdibG9ja2VkJyA/IGA8c3BhbiBjbGFzcz0ibG9ja2NlbGwiIHRpdGxlPSJCbG9xdWVhZGEiPiR7SS5sb2NrfTwvc3Bhbj5gIDogY2FuU2VsID8gYDxpbnB1dCB0eXBlPSJjaGVja2JveCIgY2xhc3M9ImNiIiBkYXRhLWlkPSIke28uaWR9IiAke3NlbGVjdGVkLmhhcyhvLmlkKSA/ICdjaGVja2VkJyA6ICcnfSBhcmlhLWxhYmVsPSJTZWxlY2Npb25hciAke2VzYyhvLm9yZGVyX251bWJlcil9Ij5gIDogJyd9PC90ZD4KICAgICAgPHRkPjxiPiR7ZXNjKG8uc2VsbGVyKX08L2I+PHNwYW4gY2xhc3M9Im5vdGUiPiR7ZXNjKGZtdFRpbWUoby5zb2xkX2F0IHx8IG8uY3JlYXRlZF9hdCkpfTwvc3Bhbj48L3RkPgogICAgICA8dGQ+PHNwYW4gY2xhc3M9Im1rICR7by5tYXJrZXRwbGFjZX0iPiR7TUtbby5tYXJrZXRwbGFjZV0gfHwgby5tYXJrZXRwbGFjZX08L3NwYW4+PC90ZD4KICAgICAgPHRkIGNsYXNzPSJtb25vIj4ke2VzYyhvLm9yZGVyX251bWJlcil9PC90ZD4KICAgICAgPHRkPiR7aXRlbXNIVE1MKG8pfTwvdGQ+CiAgICAgIDx0ZD4ke3BpbGwobyl9JHtub3RlfTwvdGQ+CiAgICAgIDx0ZD48ZGl2IGNsYXNzPSJyb3ctYWN0aW9ucyI+JHthY3Rpb25zLmpvaW4oJycpfTwvZGl2PjwvdGQ+PC90cj5gOwogIH0pLmpvaW4oJycpOwogIHVwZGF0ZVNlbCgpOwp9CmZ1bmN0aW9uIHVwZGF0ZVNlbCgpIHsKICBjb25zdCBuID0gc2VsZWN0ZWQuc2l6ZSwgciA9IG9yZGVycy5maWx0ZXIobyA9PiBvLnN0YXRlID09PSAncmVhZHknKS5sZW5ndGg7CiAgaWYgKCQoJyNzZWxJbmZvJykpICQoJyNzZWxJbmZvJykudGV4dENvbnRlbnQgPSBgJHtufSBzZWxlY2Npb25hZGEke24gPT09IDEgPyAnJyA6ICdzJ31gOwogIGlmICgkKCcjZGxTZWwnKSkgJCgnI2RsU2VsJykuZGlzYWJsZWQgPSAhbjsKICBpZiAoJCgnI2RsUmVhZHknKSkgeyAkKCcjZGxSZWFkeScpLmRpc2FibGVkID0gIXI7ICQoJyNkbFJlYWR5JykubGFzdENoaWxkLnRleHRDb250ZW50ID0gYERlc2NhcmdhciB0b2RhcyBsYXMgbGlzdGFzICgke3J9KWA7IH0KfQoKbGV0IGRvd25sb2FkaW5nID0gZmFsc2U7CmFzeW5jIGZ1bmN0aW9uIGRvd25sb2FkQmF0Y2goaWRzLCB7IHNpbGVudCA9IGZhbHNlIH0gPSB7fSkgewogIGlmICghaWRzLmxlbmd0aCB8fCBkb3dubG9hZGluZykgcmV0dXJuIDA7CiAgZG93bmxvYWRpbmcgPSB0cnVlOwogIHRyeSB7CiAgICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaCgnL2FwaS9sYWJlbHMvYmF0Y2gnLCB7IG1ldGhvZDogJ1BPU1QnLCBjcmVkZW50aWFsczogJ3NhbWUtb3JpZ2luJywgaGVhZGVyczogeyAnY29udGVudC10eXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0sIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgaWRzLCBtYXJrOiB0cnVlIH0pIH0pOwogICAgaWYgKCFyZXMub2spIHsgY29uc3QgZSA9IGF3YWl0IHJlcy5qc29uKCkuY2F0Y2goKCkgPT4gKHt9KSk7IHRocm93IG5ldyBFcnJvcihlLmVycm9yIHx8ICdObyBzZSBwdWRvIGRlc2NhcmdhcicpOyB9CiAgICBjb25zdCBibG9iID0gYXdhaXQgcmVzLmJsb2IoKTsKICAgIGNvbnN0IG5hbWUgPSAocmVzLmhlYWRlcnMuZ2V0KCdjb250ZW50LWRpc3Bvc2l0aW9uJykgfHwgJycpLm1hdGNoKC9maWxlbmFtZT0iKFteIl0rKSIvKT8uWzFdIHx8ICdldGlxdWV0YXMucGRmJzsKICAgIGNvbnN0IGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7IGEuaHJlZiA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7IGEuZG93bmxvYWQgPSBuYW1lOyBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGEpOyBhLmNsaWNrKCk7IGEucmVtb3ZlKCk7CiAgICBzZXRUaW1lb3V0KCgpID0+IFVSTC5yZXZva2VPYmplY3RVUkwoYS5ocmVmKSwgNjAwMDApOwogICAgY29uc3QgbiA9ICtyZXMuaGVhZGVycy5nZXQoJ3gtbGFiZWwtY291bnQnKSB8fCBpZHMubGVuZ3RoOwogICAgdG9hc3QoYCR7bn0gZXRpcXVldGEke24gPT09IDEgPyAnJyA6ICdzJ30gZGVzY2FyZ2FkYSR7biA9PT0gMSA/ICcnIDogJ3MnfSB5IG1hcmNhZGEke24gPT09IDEgPyAnJyA6ICdzJ30gY29tbyBpbXByZXNhJHtuID09PSAxID8gJycgOiAncyd9YCk7CiAgICBzZWxlY3RlZC5jbGVhcigpOwogICAgcmV0dXJuIG47CiAgfSBjYXRjaCAoZSkgeyBpZiAoIXNpbGVudCkgdG9hc3QoZS5tZXNzYWdlKTsgcmV0dXJuIDA7IH0KICBmaW5hbGx5IHsgZG93bmxvYWRpbmcgPSBmYWxzZTsgc2V0VGltZW91dChsb2FkT3JkZXJzLCA0MDApOyB9Cn0KbGV0IGF1dG9UID0gbnVsbDsKZnVuY3Rpb24gYXV0b0Rvd25sb2FkKCkgewogIGNsZWFyVGltZW91dChhdXRvVCk7CiAgLy8gZXNwZXJhIHVub3Mgc2VndW5kb3MgcGFyYSBqdW50YXIgZXRpcXVldGFzIHF1ZSBsbGVnYW4gY2FzaSBqdW50YXMgZW4gdW4gc29sbyBQREYKICBhdXRvVCA9IHNldFRpbWVvdXQoKCkgPT4gewogICAgY29uc3QgaWRzID0gb3JkZXJzLmZpbHRlcihvID0+IG8uc3RhdGUgPT09ICdyZWFkeScpLm1hcChvID0+IG8uaWQpOwogICAgaWYgKGlkcy5sZW5ndGggJiYgc3RvcmUuZ2V0KCdhdXRvJywgZmFsc2UpKSBkb3dubG9hZEJhdGNoKGlkcywgeyBzaWxlbnQ6IHRydWUgfSk7CiAgfSwgNDAwMCk7Cn0KCi8vIC0tLS0tLS0tLS0gVkVOREVET1IgLS0tLS0tLS0tLQphc3luYyBmdW5jdGlvbiByZW5kZXJTZWxsZXIoKSB7CiAgY29uc3QgaXNBZG1pbiA9IG1lLnVzZXIucm9sZSA9PT0gJ2FkbWluJzsKICBsZXQgc2VsbGVyUGlja2VyID0gJyc7CiAgaWYgKGlzQWRtaW4pIHsKICAgIGNvbnN0IGQgPSBhd2FpdCBhcGkoJy9hcGkvYWRtaW4vc2VsbGVycycpOwogICAgc2VsbGVycyA9IGQuc2VsbGVyczsKICAgIGlmICghc2VsbGVycy5sZW5ndGgpIHsgJCgnI21haW4nKS5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz0ic2VjdGlvbi10aXRsZSI+PGgyPlZlbmRlZG9yZXM8L2gyPjwvZGl2PjxkaXYgY2xhc3M9InBhbmVsIj48ZGl2IGNsYXNzPSJlbXB0eSI+JHtFTVBUWV9TVkd9PGRpdj5QcmltZXJvIGNyZWEgbG9zIHZlbmRlZG9yZXMgZW4gbGEgcGVzdGHDsWEgVXN1YXJpb3MuPC9kaXY+PC9kaXY+PC9kaXY+YDsgcmV0dXJuOyB9CiAgICBpZiAoIXNlbGxlcnMuc29tZShzID0+IHMuaWQgPT09IHVpLmFkbWluU2VsbGVyKSkgdWkuYWRtaW5TZWxsZXIgPSBzZWxsZXJzWzBdLmlkOwogICAgc2VsbGVyUGlja2VyID0gYDxzZWxlY3QgaWQ9ImFkbWluU2VsbGVyIiBzdHlsZT0id2lkdGg6YXV0byI+JHtzZWxsZXJzLm1hcChzID0+IGA8b3B0aW9uIHZhbHVlPSIke3MuaWR9IiAke3MuaWQgPT09IHVpLmFkbWluU2VsbGVyID8gJ3NlbGVjdGVkJyA6ICcnfT4ke2VzYyhzLm5hbWUpfTwvb3B0aW9uPmApLmpvaW4oJycpfTwvc2VsZWN0PmA7CiAgfQogICQoJyNtYWluJykuaW5uZXJIVE1MID0gYAogIDxkaXYgY2xhc3M9InNlY3Rpb24tdGl0bGUiPjxoMj4ke2lzQWRtaW4gPyAnQ3VlbnRhIGRlbCB2ZW5kZWRvcicgOiAnTWlzIG1hcmtldHBsYWNlcyd9PC9oMj4ke3NlbGxlclBpY2tlcn08c3BhbiBjbGFzcz0ic3BhY2VyIiBzdHlsZT0iZmxleDoxIj48L3NwYW4+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1naG9zdCIgaWQ9InNTeW5jIj4ke0kuc3luY31TaW5jcm9uaXphciBhaG9yYTwvYnV0dG9uPjwvZGl2PgogIDxkaXYgY2xhc3M9ImNvbm4iIGlkPSJjb25uIj48L2Rpdj4KICA8ZGl2IGNsYXNzPSJncmlkMiI+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbCI+CiAgICAgIDxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj5Qcm9kdWN0b3MgcXVlIE5PIHZhbiBhbCBmdWxmaWxsbWVudDwvaDI+PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9InBhbmVsLWJvZHkgc3RhY2siPgogICAgICAgIDxkaXYgY2xhc3M9InJ1bGUiPiR7UlVMRV9TVkd9PHA+PGI+QmFzdGEgdW4gcHJvZHVjdG8gZGUgZXN0YSBsaXN0YSBwYXJhIGJsb3F1ZWFyIGVsIHBlZGlkbyBjb21wbGV0by48L2I+IEVsIGZ1bGZpbGxtZW50IGxvIHZlcsOhIGNvbiBjYW5kYWRvIHkgbm8gcG9kcsOhIGRlc2NhcmdhciBzdSBldGlxdWV0YS4gVXNhIGVsIElEIGRlIHB1YmxpY2FjacOzbiAoTUxD4oCmLCBJRCBkZSBGYWxhYmVsbGEsIFNLVSBNS+KApiBkZSBQYXJpcykgbyB0dSBTS1UgZGUgdmVuZGVkb3IuPC9wPjwvZGl2PgogICAgICAgIDxmb3JtIGNsYXNzPSJhZGRyb3ciIGlkPSJhZGRGb3JtIj4KICAgICAgICAgIDx0ZXh0YXJlYSBpZD0iYWRkVmFsIiByb3dzPSIyIiBwbGFjZWhvbGRlcj0iVW5vIG8gdmFyaW9zLCBzZXBhcmFkb3MgcG9yIGNvbWEgbyBzYWx0byBkZSBsw61uZWEmIzEwO0VqOiBNTEMxNDg3NzY1NDMyLCBMRU4tUE9MLTAxIiBhcmlhLWxhYmVsPSJJRHMgbyBTS1VzIj48L3RleHRhcmVhPgogICAgICAgICAgPHNlbGVjdCBpZD0iYWRkTWsiIGFyaWEtbGFiZWw9Ik1hcmtldHBsYWNlIj48b3B0aW9uIHZhbHVlPSJhbnkiPlRvZG9zIGxvcyBjYW5hbGVzPC9vcHRpb24+PG9wdGlvbiB2YWx1ZT0ibWwiPlNvbG8gTWVyY2FkbyBMaWJyZTwvb3B0aW9uPjxvcHRpb24gdmFsdWU9ImZhIj5Tb2xvIEZhbGFiZWxsYTwvb3B0aW9uPjxvcHRpb24gdmFsdWU9InBhIj5Tb2xvIFBhcmlzPC9vcHRpb24+PC9zZWxlY3Q+CiAgICAgICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIHR5cGU9InN1Ym1pdCI+JHtJLmxvY2t9QmxvcXVlYXI8L2J1dHRvbj4KICAgICAgICA8L2Zvcm0+CiAgICAgICAgPGlucHV0IHR5cGU9InNlYXJjaCIgaWQ9ImJsUSIgcGxhY2Vob2xkZXI9IkJ1c2NhciBlbiBsYSBsaXN0YSIgYXJpYS1sYWJlbD0iQnVzY2FyIGJsb3F1ZWFkb3MiPgogICAgICAgIDxkaXYgY2xhc3M9InRhZ3MiIGlkPSJ0YWdzIj48L2Rpdj4KICAgICAgPC9kaXY+CiAgICA8L2Rpdj4KICAgIDxkaXYgY2xhc3M9InBhbmVsIj4KICAgICAgPGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+PGgyPlBlZGlkb3MgcmVjaWVudGVzPC9oMj48L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0idGFibGUtd3JhcCI+PHRhYmxlIHN0eWxlPSJtaW4td2lkdGg6NTIwcHgiPjx0aGVhZD48dHI+PHRoPlBlZGlkbzwvdGg+PHRoPkNhbmFsPC90aD48dGg+UHJvZHVjdG9zPC90aD48dGg+RXN0YWRvPC90aD48L3RyPjwvdGhlYWQ+PHRib2R5IGlkPSJteVJvd3MiPjwvdGJvZHk+PC90YWJsZT48L2Rpdj4KICAgIDwvZGl2PgogIDwvZGl2PmA7CiAgaWYgKGlzQWRtaW4pICQoJyNhZG1pblNlbGxlcicpLm9uY2hhbmdlID0gZSA9PiB7IHVpLmFkbWluU2VsbGVyID0gK2UudGFyZ2V0LnZhbHVlOyBzdG9yZS5zZXQoJ2FkbWluU2VsbGVyJywgdWkuYWRtaW5TZWxsZXIpOyByZW5kZXJTZWxsZXIoKTsgfTsKICAkKCcjc1N5bmMnKS5vbmNsaWNrID0gYXN5bmMgKCkgPT4geyBhd2FpdCBhcGkoJy9hcGkvc3luYycgKyBzZWxsZXJRUygpLCB7IG1ldGhvZDogJ1BPU1QnIH0pOyB0b2FzdCgnU2luY3Jvbml6YW5kb+KApicpOyB9OwogICQoJyNhZGRGb3JtJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgIGUucHJldmVudERlZmF1bHQoKTsKICAgIHRyeSB7IGNvbnN0IHIgPSBhd2FpdCBhcGkoJy9hcGkvYmxvY2tsaXN0JyArIHNlbGxlclFTKCksIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgdmFsdWU6ICQoJyNhZGRWYWwnKS52YWx1ZSwgbWFya2V0cGxhY2U6ICQoJyNhZGRNaycpLnZhbHVlIH0gfSk7ICQoJyNhZGRWYWwnKS52YWx1ZSA9ICcnOyB0b2FzdChgJHtyLmFkZGVkfSBibG9xdWVhZG8ke3IuYWRkZWQgPT09IDEgPyAnJyA6ICdzJ31gKTsgbG9hZEJsb2NrbGlzdCgpOyB9CiAgICBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlKTsgfQogIH07CiAgJCgnI2JsUScpLm9uaW5wdXQgPSAoKSA9PiBkcmF3VGFncygpOwogICQoJyN0YWdzJykub25jbGljayA9IGFzeW5jIGUgPT4geyBjb25zdCBiID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtcm1dJyk7IGlmICghYikgcmV0dXJuOyBhd2FpdCBhcGkoYC9hcGkvYmxvY2tsaXN0LyR7Yi5kYXRhc2V0LnJtfSR7c2VsbGVyUVMoKX1gLCB7IG1ldGhvZDogJ0RFTEVURScgfSk7IHRvYXN0KCdEZXNibG9xdWVhZG86IHN1cyBwZWRpZG9zIHBhc2FuIGFsIGZ1bGZpbGxtZW50Jyk7IGxvYWRCbG9ja2xpc3QoKTsgfTsKICBsb2FkQ29ubmVjdGlvbnMoKTsgbG9hZEJsb2NrbGlzdCgpOyBsb2FkU2VsbGVyT3JkZXJzKCk7CiAgaWYgKG5ldyBVUkxTZWFyY2hQYXJhbXMobG9jYXRpb24uc2VhcmNoKS5nZXQoJ2NvbmVjdGFkbycpID09PSAnbWwnKSB7IHRvYXN0KCdNZXJjYWRvIExpYnJlIGNvbmVjdGFkbycpOyBoaXN0b3J5LnJlcGxhY2VTdGF0ZShudWxsLCAnJywgJy8nKTsgfQp9Cgphc3luYyBmdW5jdGlvbiBsb2FkQ29ubmVjdGlvbnMoKSB7CiAgY29uc3QgeyBjb25uZWN0aW9ucyB9ID0gYXdhaXQgYXBpKCcvYXBpL2Nvbm5lY3Rpb25zJyArIHNlbGxlclFTKCkpOwogIGNvbnN0IGJ5ID0gT2JqZWN0LmZyb21FbnRyaWVzKGNvbm5lY3Rpb25zLm1hcChjID0+IFtjLm1hcmtldHBsYWNlLCBjXSkpOwogIGNvbnN0IHN0ID0gYyA9PiAhYyA/ICc8ZGl2IGNsYXNzPSJzdGF0ZSBvZmYiPjxpPjwvaT5TaW4gY29uZWN0YXI8L2Rpdj4nIDogYy5sYXN0X2Vycm9yID8gYDxkaXYgY2xhc3M9InN0YXRlIGVyciI+PGk+PC9pPkVycm9yOiAke2VzYyhjLmxhc3RfZXJyb3Iuc2xpY2UoMCwgMTIwKSl9PC9kaXY+YCA6IGA8ZGl2IGNsYXNzPSJzdGF0ZSBvbiI+PGk+PC9pPkNvbmVjdGFkbyR7Yy5hY2NvdW50X2xhYmVsID8gJyDCtyAnICsgZXNjKGMuYWNjb3VudF9sYWJlbCkgOiAnJ30ke2MubGFzdF9zeW5jX2F0ID8gJyDCtyByZXZpc2FkbyAnICsgZXNjKGZtdFRpbWUoYy5sYXN0X3N5bmNfYXQpKSA6ICcnfTwvZGl2PmA7CiAgY29uc3QgZGlzYyA9IGMgPT4gYyA/IGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWRlbD0iJHtjLmlkfSI+RGVzY29uZWN0YXI8L2J1dHRvbj5gIDogJyc7CiAgY29uc3QgbWwgPSBieS5tbCwgZmEgPSBieS5mYSwgcGEgPSBieS5wYTsKICAkKCcjY29ubicpLmlubmVySFRNTCA9IGAKICA8ZGl2IGNsYXNzPSJtY2FyZCI+PGRpdiBjbGFzcz0ibG9nbyIgc3R5bGU9ImJhY2tncm91bmQ6dmFyKC0tbWwpO2NvbG9yOnZhcigtLW1sLWluaykiPk1lcmNhZG8gTGlicmU8L2Rpdj4ke3N0KG1sKX0KICAgIDxwIGNsYXNzPSJob3ciPlRlIGxsZXZhIGEgTWVyY2FkbyBMaWJyZSBwYXJhIGF1dG9yaXphci4gTm8gY29tcGFydGVzIHR1IGNvbnRyYXNlw7FhLiBMYXMgZXRpcXVldGFzIGxsZWdhbiBhcGVuYXMgbGEgdmVudGEgcXVlZGEgbGlzdGEgcGFyYSBpbXByaW1pci48L3A+CiAgICAke21lLm1sQ29uZmlndXJlZCA/IGA8YSBjbGFzcz0iYnRuICR7bWwgPyAnYnRuLWdob3N0JyA6ICdidG4tcHJpbWFyeSd9IiBocmVmPSIvYXV0aC9tbC9zdGFydCR7c2VsbGVyUVMoKX0iPiR7bWwgPyAnVm9sdmVyIGEgYXV0b3JpemFyJyA6ICdDb25lY3RhciBjb24gTWVyY2FkbyBMaWJyZSd9PC9hPmAgOiAnPHAgY2xhc3M9ImhvdyIgc3R5bGU9ImNvbG9yOnZhcigtLXdhcm4pIj5FbCBhZG1pbmlzdHJhZG9yIGRlYmUgY29uZmlndXJhciBsYSBhcHAgZGUgTWVyY2FkbyBMaWJyZSBlbiBlbCBzZXJ2aWRvci48L3A+J30ke2Rpc2MobWwpfTwvZGl2PgogIDxkaXYgY2xhc3M9Im1jYXJkIj48ZGl2IGNsYXNzPSJsb2dvIiBzdHlsZT0iYmFja2dyb3VuZDp2YXIoLS1mYSk7Y29sb3I6dmFyKC0tZmEtaW5rKSI+RmFsYWJlbGxhPC9kaXY+JHtzdChmYSl9CiAgICA8Zm9ybSBpZD0iZmFGb3JtIiBjbGFzcz0ic3RhY2siPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPlVzdWFyaW8gQVBJIChjb3JyZW8gZGVsIFNlbGxlciBDZW50ZXIpPGlucHV0IHR5cGU9ImVtYWlsIiBpZD0iZmFVc2VyIiB2YWx1ZT0iJHtlc2MoZmE/LmFjY291bnRfbGFiZWwgfHwgJycpfSIgcmVxdWlyZWQ+PC9sYWJlbD4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5BUEkgS2V5PGlucHV0IHR5cGU9InBhc3N3b3JkIiBpZD0iZmFLZXkiIHBsYWNlaG9sZGVyPSIke2ZhID8gJ+KAouKAouKAouKAouKAouKAoiAoZ3VhcmRhZGEpJyA6ICdTZWxsZXIgQ2VudGVyIOKAuiBNaSBjdWVudGEg4oC6IEludGVncmFjaW9uZXMnfSIgJHtmYSA/ICcnIDogJ3JlcXVpcmVkJ30+PC9sYWJlbD4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5TZWxsZXIgSUQ8aW5wdXQgdHlwZT0idGV4dCIgaWQ9ImZhU2lkIiBwbGFjZWhvbGRlcj0iQ8OzZGlnbyBkZSB0aWVuZGEsIGVqLiBTQzEyMzQiPjwvbGFiZWw+CiAgICAgIDxsYWJlbCBjbGFzcz0ic3dpdGNoIj48aW5wdXQgdHlwZT0iY2hlY2tib3giIGlkPSJmYUF1dG8iICR7ZmE/LnNldHRpbmdzPy5hdXRvUmVhZHkgPyAnY2hlY2tlZCcgOiAnJ30+IE1hcmNhciAibGlzdG8gcGFyYSBkZXNwYWNobyIgYXV0b23DoXRpY288L2xhYmVsPgogICAgICA8cCBjbGFzcz0iaG93Ij5GYWxhYmVsbGEgZ2VuZXJhIGxhIGV0aXF1ZXRhIHNvbG8gY3VhbmRvIGVsIHBlZGlkbyBlc3TDoSBsaXN0byBwYXJhIGRlc3BhY2hvLiBDb24gZXN0YSBvcGNpw7NuLCBsYSBhcHAgbG8gbWFyY2Egc29sYSBhcGVuYXMgbGxlZ2EuPC9wPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gJHtmYSA/ICdidG4tZ2hvc3QnIDogJ2J0bi1wcmltYXJ5J30iIHR5cGU9InN1Ym1pdCI+JHtmYSA/ICdBY3R1YWxpemFyJyA6ICdDb25lY3RhciBGYWxhYmVsbGEnfTwvYnV0dG9uPgogICAgPC9mb3JtPgogICAgJHtmYT8ud2ViaG9va191cmwgPyBgPGxhYmVsIGNsYXNzPSJmIj5BdmlzbyBpbnN0YW50w6FuZW8gKHdlYmhvb2ssIG9wY2lvbmFsKTxzcGFuIGNsYXNzPSJjb3B5Ij48aW5wdXQgdHlwZT0idGV4dCIgcmVhZG9ubHkgdmFsdWU9IiR7ZXNjKGZhLndlYmhvb2tfdXJsKX0iPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtY29weT0iJHtlc2MoZmEud2ViaG9va191cmwpfSI+Q29waWFyPC9idXR0b24+PC9zcGFuPjwvbGFiZWw+YCA6ICcnfQogICAgJHtkaXNjKGZhKX08L2Rpdj4KICA8ZGl2IGNsYXNzPSJtY2FyZCI+PGRpdiBjbGFzcz0ibG9nbyIgc3R5bGU9ImJhY2tncm91bmQ6dmFyKC0tcGEpO2NvbG9yOiNmZmYiPlBhcmlzPC9kaXY+JHtzdChwYSl9CiAgICA8Zm9ybSBpZD0icGFGb3JtIiBjbGFzcz0ic3RhY2siPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPkFQSSBLZXk8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJwYUtleSIgcGxhY2Vob2xkZXI9IiR7cGEgPyAn4oCi4oCi4oCi4oCi4oCi4oCiIChndWFyZGFkYSknIDogJ1NlbGxlciBDZW50ZXIgUGFyaXMg4oC6IE1pIGN1ZW50YSDigLogSW50ZWdyYWNpb25lcyd9IiByZXF1aXJlZD48L2xhYmVsPgogICAgICA8cCBjbGFzcz0iaG93Ij5QYXJpcyBlbnRyZWdhIGxhIEFQSSBLZXkgZW4gTWkgY3VlbnRhIOKAuiBJbnRlZ3JhY2lvbmVzLiBTaSBubyBhcGFyZWNlLCBzZSBwaWRlIHBvciB0aWNrZXQgYSBQYXJpcy48L3A+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biAke3BhID8gJ2J0bi1naG9zdCcgOiAnYnRuLXByaW1hcnknfSIgdHlwZT0ic3VibWl0Ij4ke3BhID8gJ0FjdHVhbGl6YXInIDogJ0NvbmVjdGFyIFBhcmlzJ308L2J1dHRvbj4KICAgIDwvZm9ybT4ke2Rpc2MocGEpfTwvZGl2PmA7CiAgJCgnI2ZhRm9ybScpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICBlLnByZXZlbnREZWZhdWx0KCk7CiAgICBpZiAoZmEgJiYgISQoJyNmYUtleScpLnZhbHVlKSB7IGF3YWl0IGFwaShgL2FwaS9jb25uZWN0aW9ucy8ke2ZhLmlkfS9zZXR0aW5ncyR7c2VsbGVyUVMoKX1gLCB7IG1ldGhvZDogJ1BBVENIJywgYm9keTogeyBhdXRvUmVhZHk6ICQoJyNmYUF1dG8nKS5jaGVja2VkIH0gfSk7IHRvYXN0KCdHdWFyZGFkbycpOyByZXR1cm4gbG9hZENvbm5lY3Rpb25zKCk7IH0KICAgIHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9jb25uZWN0aW9ucy9mYScgKyBzZWxsZXJRUygpLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IHVzZXJJZDogJCgnI2ZhVXNlcicpLnZhbHVlLCBhcGlLZXk6ICQoJyNmYUtleScpLnZhbHVlLCBzZWxsZXJJZDogJCgnI2ZhU2lkJykudmFsdWUsIGF1dG9SZWFkeTogJCgnI2ZhQXV0bycpLmNoZWNrZWQgfSB9KTsgdG9hc3QoJ0ZhbGFiZWxsYSBjb25lY3RhZG8nKTsgbG9hZENvbm5lY3Rpb25zKCk7IH0KICAgIGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UsIDUwMDApOyB9CiAgfTsKICAkKCcjcGFGb3JtJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgIGUucHJldmVudERlZmF1bHQoKTsKICAgIHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9jb25uZWN0aW9ucy9wYScgKyBzZWxsZXJRUygpLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGFwaUtleTogJCgnI3BhS2V5JykudmFsdWUgfSB9KTsgdG9hc3QoJ1BhcmlzIGNvbmVjdGFkbycpOyBsb2FkQ29ubmVjdGlvbnMoKTsgfQogICAgY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSwgNTAwMCk7IH0KICB9OwogICQoJyNjb25uJykub25jbGljayA9IGFzeW5jIGUgPT4gewogICAgY29uc3QgZCA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLWRlbF0nKTsKICAgIGlmIChkKSB7IGQuZGlzYWJsZWQgPSB0cnVlOyBhd2FpdCBhcGkoYC9hcGkvY29ubmVjdGlvbnMvJHtkLmRhdGFzZXQuZGVsfSR7c2VsbGVyUVMoKX1gLCB7IG1ldGhvZDogJ0RFTEVURScgfSk7IHRvYXN0KCdEZXNjb25lY3RhZG8nKTsgbG9hZENvbm5lY3Rpb25zKCk7IH0KICAgIGNvbnN0IGMgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1jb3B5XScpOwogICAgaWYgKGMpIHsgZS5wcmV2ZW50RGVmYXVsdCgpOyB0cnkgeyBhd2FpdCBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dChjLmRhdGFzZXQuY29weSk7IHRvYXN0KCdDb3BpYWRvJyk7IH0gY2F0Y2ggeyBjLnByZXZpb3VzRWxlbWVudFNpYmxpbmcuc2VsZWN0KCk7IH0gfQogIH07Cn0KCmxldCBibEl0ZW1zID0gW107CmFzeW5jIGZ1bmN0aW9uIGxvYWRCbG9ja2xpc3QoKSB7IGJsSXRlbXMgPSAoYXdhaXQgYXBpKCcvYXBpL2Jsb2NrbGlzdCcgKyBzZWxsZXJRUygpKSkuaXRlbXM7IGRyYXdUYWdzKCk7IH0KZnVuY3Rpb24gZHJhd1RhZ3MoKSB7CiAgY29uc3QgcSA9ICgkKCcjYmxRJyk/LnZhbHVlIHx8ICcnKS50b0xvd2VyQ2FzZSgpOwogIGNvbnN0IGxpc3QgPSBibEl0ZW1zLmZpbHRlcihiID0+ICFxIHx8IGIudmFsdWUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxKSk7CiAgJCgnI3RhZ3MnKS5pbm5lckhUTUwgPSBsaXN0Lmxlbmd0aCA/IGxpc3QubWFwKGIgPT4gYDxzcGFuIGNsYXNzPSJ0YWciPiR7ZXNjKGIudmFsdWUpfSA8c21hbGw+wrcgJHtiLm1hcmtldHBsYWNlID09PSAnYW55JyA/ICd0b2RvcycgOiBNS1tiLm1hcmtldHBsYWNlXX08L3NtYWxsPjxidXR0b24gZGF0YS1ybT0iJHtiLmlkfSIgYXJpYS1sYWJlbD0iUXVpdGFyICR7ZXNjKGIudmFsdWUpfSI+JHtJLnh9PC9idXR0b24+PC9zcGFuPmApLmpvaW4oJycpCiAgICA6IGA8c3BhbiBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTMuNXB4Ij4ke2JsSXRlbXMubGVuZ3RoID8gJ1NpbiByZXN1bHRhZG9zLicgOiAnU2luIHByb2R1Y3RvcyBibG9xdWVhZG9zOiB0b2RvIHZhIGFsIGZ1bGZpbGxtZW50Lid9PC9zcGFuPmA7Cn0KYXN5bmMgZnVuY3Rpb24gbG9hZFNlbGxlck9yZGVycygpIHsKICBpZiAodGFiICE9PSAnc2VsbGVyJyB8fCAhJCgnI215Um93cycpKSByZXR1cm47CiAgbGV0IGxpc3Q7CiAgaWYgKG1lLnVzZXIucm9sZSA9PT0gJ3NlbGxlcicpIGxpc3QgPSAoYXdhaXQgYXBpKCcvYXBpL29yZGVycz92aWV3PWFsbCcpKS5vcmRlcnM7CiAgZWxzZSBsaXN0ID0gKGF3YWl0IGFwaSgnL2FwaS9vcmRlcnM/dmlldz1hbGwnKSkub3JkZXJzLmZpbHRlcihvID0+IG8uc2VsbGVyX2lkID09PSB1aS5hZG1pblNlbGxlcik7CiAgJCgnI215Um93cycpLmlubmVySFRNTCA9IGxpc3QubGVuZ3RoID8gbGlzdC5zbGljZSgwLCA2MCkubWFwKG8gPT4gYDx0cj48dGQgY2xhc3M9Im1vbm8iPiR7ZXNjKG8ub3JkZXJfbnVtYmVyKX08c3BhbiBjbGFzcz0ibm90ZSI+JHtlc2MoZm10VGltZShvLnNvbGRfYXQgfHwgby5jcmVhdGVkX2F0KSl9PC9zcGFuPjwvdGQ+PHRkPjxzcGFuIGNsYXNzPSJtayAke28ubWFya2V0cGxhY2V9Ij4ke01LW28ubWFya2V0cGxhY2VdIHx8ICcnfTwvc3Bhbj48L3RkPjx0ZD4ke2l0ZW1zSFRNTChvKX08L3RkPjx0ZD4ke3BpbGwobyl9JHtvLnN0YXRlID09PSAnZXJyb3InIHx8IG8uc3RhdGUgPT09ICd3YWl0aW5nJyA/IGA8c3BhbiBjbGFzcz0ibm90ZSAke28uc3RhdGUgPT09ICdlcnJvcicgPyAnYmFkJyA6ICcnfSI+JHtlc2Moby5lcnJvciB8fCAnJyl9PC9zcGFuPmAgOiAnJ308L3RkPjwvdHI+YCkuam9pbignJykKICAgIDogYDx0cj48dGQgY29sc3Bhbj0iNCI+PGRpdiBjbGFzcz0iZW1wdHkiPkHDum4gbm8gaGF5IHBlZGlkb3MuIENvbmVjdGEgdHVzIG1hcmtldHBsYWNlcyB5IGFwYXJlY2Vyw6FuIGFxdcOtLjwvZGl2PjwvdGQ+PC90cj5gOwp9CgovLyAtLS0tLS0tLS0tIEFETUlOIC0tLS0tLS0tLS0KYXN5bmMgZnVuY3Rpb24gcmVuZGVyQWRtaW4oKSB7CiAgY29uc3QgW2QsIHN0XSA9IGF3YWl0IFByb21pc2UuYWxsKFthcGkoJy9hcGkvYWRtaW4vc2VsbGVycycpLCBhcGkoJy9hcGkvYWRtaW4vc2V0dGluZ3MnKV0pOwogIGNvbnN0IHNOYW1lID0gaWQgPT4gZC5zZWxsZXJzLmZpbmQocyA9PiBzLmlkID09PSBpZCk/Lm5hbWUgfHwgJyc7CiAgY29uc3Qgcm9sZU5hbWUgPSB7IGFkbWluOiAnQWRtaW5pc3RyYWRvcicsIGZ1bGZpbGxtZW50OiAnRnVsZmlsbG1lbnQnLCBzZWxsZXI6ICdWZW5kZWRvcicgfTsKICAkKCcjbWFpbicpLmlubmVySFRNTCA9IGAKICA8ZGl2IGNsYXNzPSJncmlkMiI+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbCI+PGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+PGgyPlZlbmRlZG9yZXM8L2gyPjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJwYW5lbC1ib2R5IHN0YWNrIj4KICAgICAgICA8Zm9ybSBjbGFzcz0icm93IiBpZD0ibmV3U2VsbGVyIj48bGFiZWwgY2xhc3M9ImYiPk5vbWJyZSBkZSBsYSB0aWVuZGE8aW5wdXQgdHlwZT0idGV4dCIgaWQ9Im5zTmFtZSIgcmVxdWlyZWQ+PC9sYWJlbD48YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIHR5cGU9InN1Ym1pdCIgc3R5bGU9ImZsZXg6MCI+QWdyZWdhcjwvYnV0dG9uPjwvZm9ybT4KICAgICAgICA8ZGl2IGNsYXNzPSJ0YWJsZS13cmFwIj48dGFibGUgc3R5bGU9Im1pbi13aWR0aDo0MjBweCI+PHRoZWFkPjx0cj48dGg+VmVuZGVkb3I8L3RoPjx0aD5NYXJrZXRwbGFjZXM8L3RoPjx0aD5CbG9xdWVhZG9zPC90aD48dGg+PC90aD48L3RyPjwvdGhlYWQ+PHRib2R5PgogICAgICAgICR7ZC5zZWxsZXJzLm1hcChzID0+IGA8dHI+PHRkPjxiPiR7ZXNjKHMubmFtZSl9PC9iPjwvdGQ+PHRkPiR7cy5jb25uZWN0aW9ucy5maWx0ZXIoYyA9PiBNS1tjLm1hcmtldHBsYWNlXSkubWFwKGMgPT4gYDxzcGFuIGNsYXNzPSJtayAke2MubWFya2V0cGxhY2V9IiB0aXRsZT0iJHtlc2MoYy5sYXN0X2Vycm9yIHx8ICdPSycpfSI+JHtNS1tjLm1hcmtldHBsYWNlXX0ke2MubGFzdF9lcnJvciA/ICcg4pqgJyA6ICcnfTwvc3Bhbj5gKS5qb2luKCcgJykgfHwgJzxzcGFuIGNsYXNzPSJtdXRlZCI+4oCUPC9zcGFuPid9PC90ZD48dGQ+JHtzLmJsb2NrZWR9PC90ZD48dGQ+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1kYW5nZXIgYnRuLXNtIiBkYXRhLWRlbHM9IiR7cy5pZH0iPkVsaW1pbmFyPC9idXR0b24+PC90ZD48L3RyPmApLmpvaW4oJycpIHx8ICc8dHI+PHRkIGNvbHNwYW49IjQiIGNsYXNzPSJtdXRlZCI+U2luIHZlbmRlZG9yZXM8L3RkPjwvdHI+J30KICAgICAgICA8L3Rib2R5PjwvdGFibGU+PC9kaXY+CiAgICAgIDwvZGl2PjwvZGl2PgogICAgPGRpdiBjbGFzcz0icGFuZWwiPjxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj5Vc3VhcmlvczwvaDI+PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9InBhbmVsLWJvZHkgc3RhY2siPgogICAgICAgIDxmb3JtIGNsYXNzPSJzdGFjayIgaWQ9Im5ld1VzZXIiPgogICAgICAgICAgPGRpdiBjbGFzcz0icm93Ij48bGFiZWwgY2xhc3M9ImYiPk5vbWJyZTxpbnB1dCB0eXBlPSJ0ZXh0IiBpZD0ibnVOYW1lIiByZXF1aXJlZD48L2xhYmVsPjxsYWJlbCBjbGFzcz0iZiI+Q29ycmVvPGlucHV0IHR5cGU9ImVtYWlsIiBpZD0ibnVFbWFpbCIgcmVxdWlyZWQ+PC9sYWJlbD48L2Rpdj4KICAgICAgICAgIDxkaXYgY2xhc3M9InJvdyI+PGxhYmVsIGNsYXNzPSJmIj5Sb2w8c2VsZWN0IGlkPSJudVJvbGUiPjxvcHRpb24gdmFsdWU9InNlbGxlciI+VmVuZGVkb3I8L29wdGlvbj48b3B0aW9uIHZhbHVlPSJmdWxmaWxsbWVudCI+RnVsZmlsbG1lbnQ8L29wdGlvbj48b3B0aW9uIHZhbHVlPSJhZG1pbiI+QWRtaW5pc3RyYWRvcjwvb3B0aW9uPjwvc2VsZWN0PjwvbGFiZWw+CiAgICAgICAgICA8bGFiZWwgY2xhc3M9ImYiIGlkPSJudVNlbGxlcldyYXAiPlRpZW5kYTxzZWxlY3QgaWQ9Im51U2VsbGVyIj4ke2Quc2VsbGVycy5tYXAocyA9PiBgPG9wdGlvbiB2YWx1ZT0iJHtzLmlkfSI+JHtlc2Mocy5uYW1lKX08L29wdGlvbj5gKS5qb2luKCcnKX08L3NlbGVjdD48L2xhYmVsPjwvZGl2PgogICAgICAgICAgPGRpdiBjbGFzcz0icm93Ij48bGFiZWwgY2xhc3M9ImYiPkNvbnRyYXNlw7FhIGluaWNpYWwgKG3DrW4uIDgpPGlucHV0IHR5cGU9InRleHQiIGlkPSJudVBhc3MiIG1pbmxlbmd0aD0iOCIgcmVxdWlyZWQ+PC9sYWJlbD48YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIHR5cGU9InN1Ym1pdCIgc3R5bGU9ImZsZXg6MCI+Q3JlYXIgdXN1YXJpbzwvYnV0dG9uPjwvZGl2PgogICAgICAgIDwvZm9ybT4KICAgICAgICA8ZGl2IGNsYXNzPSJ0YWJsZS13cmFwIj48dGFibGUgc3R5bGU9Im1pbi13aWR0aDo0NjBweCI+PHRoZWFkPjx0cj48dGg+VXN1YXJpbzwvdGg+PHRoPlJvbDwvdGg+PHRoPjwvdGg+PC90cj48L3RoZWFkPjx0Ym9keT4KICAgICAgICAke2QudXNlcnMubWFwKHUgPT4gYDx0cj48dGQ+PGI+JHtlc2ModS5uYW1lKX08L2I+PHNwYW4gY2xhc3M9Im5vdGUiPiR7ZXNjKHUuZW1haWwpfTwvc3Bhbj48L3RkPjx0ZD4ke3JvbGVOYW1lW3Uucm9sZV19JHt1LnNlbGxlcl9pZCA/ICcgwrcgJyArIGVzYyhzTmFtZSh1LnNlbGxlcl9pZCkpIDogJyd9PC90ZD48dGQ+PGRpdiBjbGFzcz0icm93LWFjdGlvbnMiPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtcHc9IiR7dS5pZH0iPkNhbWJpYXIgY2xhdmU8L2J1dHRvbj4ke3UuaWQgPT09IG1lLnVzZXIuaWQgPyAnJyA6IGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWRhbmdlciBidG4tc20iIGRhdGEtZGVsdT0iJHt1LmlkfSI+RWxpbWluYXI8L2J1dHRvbj5gfTwvZGl2PjwvdGQ+PC90cj5gKS5qb2luKCcnKX0KICAgICAgICA8L3Rib2R5PjwvdGFibGU+PC9kaXY+CiAgICAgIDwvZGl2PjwvZGl2PgogIDwvZGl2PgogIDxkaXYgY2xhc3M9InBhbmVsIiBzdHlsZT0ibWFyZ2luLXRvcDoyMHB4Ij48ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj48aDI+Q29uZXhpw7NuIGNvbiBNZXJjYWRvIExpYnJlPC9oMj4ke3N0Lm1sX2NsaWVudF9pZCAmJiBzdC5tbF9zZWNyZXRfc2V0ID8gJzxzcGFuIGNsYXNzPSJzdGF0ZSBvbiI+PGk+PC9pPkNvbmZpZ3VyYWRhPC9zcGFuPicgOiAnPHNwYW4gY2xhc3M9InN0YXRlIGVyciI+PGk+PC9pPkZhbHRhIGNvbmZpZ3VyYXI8L3NwYW4+J308L2Rpdj4KICAgIDxkaXYgY2xhc3M9InBhbmVsLWJvZHkgc3RhY2siPgogICAgICA8cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJtYXJnaW46MCI+Q3JlYSB1bmEgYXBsaWNhY2nDs24gZW4gPGEgaHJlZj0iaHR0cHM6Ly9kZXZlbG9wZXJzLm1lcmNhZG9saWJyZS5jbC9kZXZjZW50ZXIiIHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIj5kZXZlbG9wZXJzLm1lcmNhZG9saWJyZS5jbDwvYT4gY29uIGVzdG9zIGRhdG9zIHkgcGVnYSBhcXXDrSBzdSBBcHAgSUQgeSBTZWNyZXQgS2V5LiBVbmEgc29sYSBhcHAgc2lydmUgcGFyYSB0b2RvcyBsb3MgdmVuZGVkb3Jlcy48L3A+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+VVJJIGRlIHJlZGlyZWN0PHNwYW4gY2xhc3M9ImNvcHkiPjxpbnB1dCB0eXBlPSJ0ZXh0IiByZWFkb25seSB2YWx1ZT0iJHtlc2Moc3QubWxfcmVkaXJlY3RfdXJpKX0iPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtY29weT0iJHtlc2Moc3QubWxfcmVkaXJlY3RfdXJpKX0iPkNvcGlhcjwvYnV0dG9uPjwvc3Bhbj48L2xhYmVsPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPlVSTCBkZSBub3RpZmljYWNpb25lcyAodMOzcGljb3M6IG9yZGVyc192MiB5IHNoaXBtZW50cyk8c3BhbiBjbGFzcz0iY29weSI+PGlucHV0IHR5cGU9InRleHQiIHJlYWRvbmx5IHZhbHVlPSIke2VzYyhzdC5tbF9ub3RpZmljYXRpb25zX3VybCl9Ij48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWNvcHk9IiR7ZXNjKHN0Lm1sX25vdGlmaWNhdGlvbnNfdXJsKX0iPkNvcGlhcjwvYnV0dG9uPjwvc3Bhbj48L2xhYmVsPgogICAgICA8Zm9ybSBjbGFzcz0icm93IiBpZD0ibWxDZmciPjxsYWJlbCBjbGFzcz0iZiI+QXBwIElEPGlucHV0IHR5cGU9InRleHQiIGlkPSJtbElkIiB2YWx1ZT0iJHtlc2Moc3QubWxfY2xpZW50X2lkKX0iIHJlcXVpcmVkPjwvbGFiZWw+PGxhYmVsIGNsYXNzPSJmIj5TZWNyZXQgS2V5PGlucHV0IHR5cGU9InBhc3N3b3JkIiBpZD0ibWxTZWNyZXQiIHBsYWNlaG9sZGVyPSIke3N0Lm1sX3NlY3JldF9zZXQgPyAn4oCi4oCi4oCi4oCi4oCi4oCiIChndWFyZGFkYSknIDogJyd9Ij48L2xhYmVsPjxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgdHlwZT0ic3VibWl0IiBzdHlsZT0iZmxleDowIj5HdWFyZGFyPC9idXR0b24+PC9mb3JtPgogICAgPC9kaXY+PC9kaXY+CiAgPGRpdiBjbGFzcz0icGFuZWwiIHN0eWxlPSJtYXJnaW4tdG9wOjIwcHgiPjxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj5Db3JyZW9zIChyZWN1cGVyYXIgY29udHJhc2XDsWEpPC9oMj4ke3N0Lm1haWxfa2V5X3NldCAmJiBzdC5tYWlsX2Zyb20gPyAnPHNwYW4gY2xhc3M9InN0YXRlIG9uIj48aT48L2k+QWN0aXZhZG88L3NwYW4+JyA6ICc8c3BhbiBjbGFzcz0ic3RhdGUgZXJyIj48aT48L2k+U2luIGNvbmZpZ3VyYXI8L3NwYW4+J308L2Rpdj4KICAgIDxkaXYgY2xhc3M9InBhbmVsLWJvZHkgc3RhY2siPgogICAgICA8cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJtYXJnaW46MCI+UGFyYSBlbnZpYXIgbG9zIGPDs2RpZ29zIGRlIDYgZMOtZ2l0b3Mgc2UgdXNhIDxhIGhyZWY9Imh0dHBzOi8vd3d3LmJyZXZvLmNvbSIgdGFyZ2V0PSJfYmxhbmsiIHJlbD0ibm9vcGVuZXIiPkJyZXZvPC9hPiAoZ3JhdGlzIGhhc3RhIDMwMCBjb3JyZW9zIGFsIGTDrWEpLiBDcmVhIHVuYSBjdWVudGEsIHZlcmlmaWNhIGVsIGNvcnJlbyByZW1pdGVudGUgeSBjb3BpYSB1bmEgQVBJIEtleSAoQ29uZmlndXJhY2nDs24g4oC6IFNNVFAgeSBBUEkg4oC6IEFQSSBLZXlzKS48L3A+CiAgICAgIDxmb3JtIGNsYXNzPSJzdGFjayIgaWQ9Im1haWxDZmciPgogICAgICAgIDxkaXYgY2xhc3M9InJvdyI+PGxhYmVsIGNsYXNzPSJmIj5Db3JyZW8gcmVtaXRlbnRlICh2ZXJpZmljYWRvIGVuIEJyZXZvKTxpbnB1dCB0eXBlPSJlbWFpbCIgaWQ9Im1Gcm9tIiB2YWx1ZT0iJHtlc2Moc3QubWFpbF9mcm9tIHx8ICcnKX0iIHJlcXVpcmVkPjwvbGFiZWw+PGxhYmVsIGNsYXNzPSJmIj5Ob21icmUgcmVtaXRlbnRlPGlucHV0IHR5cGU9InRleHQiIGlkPSJtTmFtZSIgdmFsdWU9IiR7ZXNjKHN0Lm1haWxfZnJvbV9uYW1lIHx8ICdFdGlxdWV0YUh1YicpfSI+PC9sYWJlbD48L2Rpdj4KICAgICAgICA8ZGl2IGNsYXNzPSJyb3ciPjxsYWJlbCBjbGFzcz0iZiI+QVBJIEtleSBkZSBCcmV2bzxpbnB1dCB0eXBlPSJwYXNzd29yZCIgaWQ9Im1LZXkiIHBsYWNlaG9sZGVyPSIke3N0Lm1haWxfa2V5X3NldCA/ICfigKLigKLigKLigKLigKLigKIgKGd1YXJkYWRhKScgOiAneGtleXNpYi3igKYnfSI+PC9sYWJlbD48bGFiZWwgY2xhc3M9ImYiPkVudmlhciBwcnVlYmEgYSAob3BjaW9uYWwpPGlucHV0IHR5cGU9ImVtYWlsIiBpZD0ibVRlc3QiIHZhbHVlPSIke2VzYyhtZS51c2VyLmVtYWlsKX0iPjwvbGFiZWw+PC9kaXY+CiAgICAgICAgPGRpdiBjbGFzcz0icm93IiBzdHlsZT0ianVzdGlmeS1jb250ZW50OmZsZXgtZW5kIj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIHR5cGU9InN1Ym1pdCIgc3R5bGU9ImZsZXg6MCI+R3VhcmRhcjwvYnV0dG9uPjwvZGl2PgogICAgICA8L2Zvcm0+CiAgICA8L2Rpdj48L2Rpdj4KICA8ZGl2IGNsYXNzPSJtb2RhbCIgaWQ9ImNvbmZpcm0iIGhpZGRlbj48ZGl2IGNsYXNzPSJzaGVldCI+PGgzIGlkPSJjZlRpdGxlIj7Cv1NlZ3Vybz88L2gzPjxwIGNsYXNzPSJtdXRlZCIgaWQ9ImNmVGV4dCIgc3R5bGU9Im1hcmdpbjowIj48L3A+PGRpdiBpZD0iY2ZFeHRyYSI+PC9kaXY+PGRpdiBjbGFzcz0icm93IiBzdHlsZT0ianVzdGlmeS1jb250ZW50OmZsZXgtZW5kIj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUiIGlkPSJjZk5vIiBzdHlsZT0iZmxleDowIj5DYW5jZWxhcjwvYnV0dG9uPjxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgaWQ9ImNmWWVzIiBzdHlsZT0iZmxleDowIj5Db25maXJtYXI8L2J1dHRvbj48L2Rpdj48L2Rpdj48L2Rpdj5gOwogIGNvbnN0IHJvbGUgPSAkKCcjbnVSb2xlJyk7IGNvbnN0IHN5bmMgPSAoKSA9PiAkKCcjbnVTZWxsZXJXcmFwJykuaGlkZGVuID0gcm9sZS52YWx1ZSAhPT0gJ3NlbGxlcic7IHJvbGUub25jaGFuZ2UgPSBzeW5jOyBzeW5jKCk7CiAgJCgnI25ld1NlbGxlcicpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7IGUucHJldmVudERlZmF1bHQoKTsgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL2FkbWluL3NlbGxlcnMnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IG5hbWU6ICQoJyNuc05hbWUnKS52YWx1ZSB9IH0pOyB0b2FzdCgnVmVuZGVkb3IgYWdyZWdhZG8nKTsgcmVuZGVyQWRtaW4oKTsgfSBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlKTsgfSB9OwogICQoJyNuZXdVc2VyJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsgZS5wcmV2ZW50RGVmYXVsdCgpOyB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvYWRtaW4vdXNlcnMnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IG5hbWU6ICQoJyNudU5hbWUnKS52YWx1ZSwgZW1haWw6ICQoJyNudUVtYWlsJykudmFsdWUsIHJvbGU6IHJvbGUudmFsdWUsIHNlbGxlcl9pZDogJCgnI251U2VsbGVyJykudmFsdWUsIHBhc3N3b3JkOiAkKCcjbnVQYXNzJykudmFsdWUgfSB9KTsgdG9hc3QoJ1VzdWFyaW8gY3JlYWRvJyk7IHJlbmRlckFkbWluKCk7IH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSwgNDAwMCk7IH0gfTsKICBjb25zdCBjb25maXJtQm94ID0gKHRpdGxlLCB0ZXh0LCBleHRyYSA9ICcnKSA9PiBuZXcgUHJvbWlzZShyZXMgPT4gewogICAgJCgnI2NmVGl0bGUnKS50ZXh0Q29udGVudCA9IHRpdGxlOyAkKCcjY2ZUZXh0JykudGV4dENvbnRlbnQgPSB0ZXh0OyAkKCcjY2ZFeHRyYScpLmlubmVySFRNTCA9IGV4dHJhOyAkKCcjY29uZmlybScpLmhpZGRlbiA9IGZhbHNlOwogICAgJCgnI2NmTm8nKS5vbmNsaWNrID0gKCkgPT4geyAkKCcjY29uZmlybScpLmhpZGRlbiA9IHRydWU7IHJlcyhmYWxzZSk7IH07CiAgICAkKCcjY2ZZZXMnKS5vbmNsaWNrID0gKCkgPT4geyAkKCcjY29uZmlybScpLmhpZGRlbiA9IHRydWU7IHJlcyh0cnVlKTsgfTsKICB9KTsKICAkKCcjbWFpbENmZycpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICBlLnByZXZlbnREZWZhdWx0KCk7CiAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvYWRtaW4vc2V0dGluZ3MnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IG1haWxfZnJvbTogJCgnI21Gcm9tJykudmFsdWUsIG1haWxfZnJvbV9uYW1lOiAkKCcjbU5hbWUnKS52YWx1ZSwgbWFpbF9hcGlfa2V5OiAkKCcjbUtleScpLnZhbHVlLCB0ZXN0X3RvOiAkKCcjbVRlc3QnKS52YWx1ZSB9IH0pOyB0b2FzdCgkKCcjbVRlc3QnKS52YWx1ZSA/ICdHdWFyZGFkby4gVGUgZW52aWFtb3MgdW4gY29ycmVvIGRlIHBydWViYS4nIDogJ0d1YXJkYWRvJyk7IHJlbmRlckFkbWluKCk7IH0KICAgIGNhdGNoICh4KSB7IHRvYXN0KHgubWVzc2FnZSwgNTAwMCk7IH0KICB9OwogICQoJyNtbENmZycpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7IGUucHJldmVudERlZmF1bHQoKTsgYXdhaXQgYXBpKCcvYXBpL2FkbWluL3NldHRpbmdzJywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBtbF9jbGllbnRfaWQ6ICQoJyNtbElkJykudmFsdWUsIG1sX2NsaWVudF9zZWNyZXQ6ICQoJyNtbFNlY3JldCcpLnZhbHVlIH0gfSk7IHRvYXN0KCdNZXJjYWRvIExpYnJlIGNvbmZpZ3VyYWRvJyk7IG1lLm1sQ29uZmlndXJlZCA9IHRydWU7IHJlbmRlckFkbWluKCk7IH07CiAgJCgnI21haW4nKS5vbmNsaWNrID0gYXN5bmMgZSA9PiB7CiAgICBjb25zdCBjcCA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLWNvcHldJyk7CiAgICBpZiAoY3ApIHsgZS5wcmV2ZW50RGVmYXVsdCgpOyB0cnkgeyBhd2FpdCBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dChjcC5kYXRhc2V0LmNvcHkpOyB0b2FzdCgnQ29waWFkbycpOyB9IGNhdGNoIHsgY3AucHJldmlvdXNFbGVtZW50U2libGluZy5zZWxlY3QoKTsgfSByZXR1cm47IH0KICAgIGNvbnN0IHMgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1kZWxzXScpLCB1ID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtZGVsdV0nKSwgcCA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLXB3XScpOwogICAgaWYgKHMgJiYgYXdhaXQgY29uZmlybUJveCgnRWxpbWluYXIgdmVuZGVkb3InLCAnU2UgYm9ycmFuIHN1cyBjb25leGlvbmVzLCBibG9xdWVvcywgcGVkaWRvcyB5IHVzdWFyaW9zLicpKSB7IGF3YWl0IGFwaShgL2FwaS9hZG1pbi9zZWxsZXJzLyR7cy5kYXRhc2V0LmRlbHN9YCwgeyBtZXRob2Q6ICdERUxFVEUnIH0pOyB0b2FzdCgnVmVuZGVkb3IgZWxpbWluYWRvJyk7IHJlbmRlckFkbWluKCk7IH0KICAgIGlmICh1ICYmIGF3YWl0IGNvbmZpcm1Cb3goJ0VsaW1pbmFyIHVzdWFyaW8nLCAnWWEgbm8gcG9kcsOhIGVudHJhciBhIEV0aXF1ZXRhSHViLicpKSB7IGF3YWl0IGFwaShgL2FwaS9hZG1pbi91c2Vycy8ke3UuZGF0YXNldC5kZWx1fWAsIHsgbWV0aG9kOiAnREVMRVRFJyB9KTsgdG9hc3QoJ1VzdWFyaW8gZWxpbWluYWRvJyk7IHJlbmRlckFkbWluKCk7IH0KICAgIGlmIChwICYmIGF3YWl0IGNvbmZpcm1Cb3goJ0NhbWJpYXIgY29udHJhc2XDsWEnLCAnRXNjcmliZSBsYSBudWV2YSBjb250cmFzZcOxYSAobcOtbmltbyA4IGNhcmFjdGVyZXMpLicsICc8aW5wdXQgdHlwZT0idGV4dCIgaWQ9ImNmUHciIG1pbmxlbmd0aD0iOCI+JykpIHsKICAgICAgdHJ5IHsgYXdhaXQgYXBpKGAvYXBpL2FkbWluL3VzZXJzLyR7cC5kYXRhc2V0LnB3fS9wYXNzd29yZGAsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgcGFzc3dvcmQ6ICQoJyNjZlB3JykudmFsdWUgfSB9KTsgdG9hc3QoJ0NvbnRyYXNlw7FhIGFjdHVhbGl6YWRhJyk7IH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IH0KICAgIH0KICB9Owp9CgovLyAtLS0tLS0tLS0tIGluaWNpbyAtLS0tLS0tLS0tCmFzeW5jIGZ1bmN0aW9uIGJvb3QoKSB7CiAgdHJ5IHsgbWUgPSBhd2FpdCBhcGkoJy9hcGkvbWUnKTsgfQogIGNhdGNoIHsKICAgIGNvbnN0IGggPSBhd2FpdCBmZXRjaCgnL2FwaS9zZXR1cC1zdGF0dXMnKS50aGVuKHIgPT4gci5qc29uKCkpLmNhdGNoKCgpID0+ICh7fSkpOwogICAgcmV0dXJuIGgubmVlZHNTZXR1cCA/IHJlbmRlclNldHVwKCkgOiByZW5kZXJMb2dpbihoLmRlbW8pOwogIH0KICBmaXJzdExvYWQgPSB0cnVlOwogIHJlbmRlclNoZWxsKCk7Cn0KYm9vdCgpOwp9KSgpOwo=","index.html":"PCFkb2N0eXBlIGh0bWw+CjxodG1sIGxhbmc9ImVzIj4KPGhlYWQ+CjxtZXRhIGNoYXJzZXQ9InV0Zi04Ij4KPG1ldGEgbmFtZT0idmlld3BvcnQiIGNvbnRlbnQ9IndpZHRoPWRldmljZS13aWR0aCwgaW5pdGlhbC1zY2FsZT0xLCB2aWV3cG9ydC1maXQ9Y292ZXIiPgo8dGl0bGU+RXRpcXVldGFIdWI8L3RpdGxlPgo8bGluayByZWw9Imljb24iIGhyZWY9Ii9sb2dvLnN2ZyIgdHlwZT0iaW1hZ2Uvc3ZnK3htbCI+CjxsaW5rIHJlbD0icHJlY29ubmVjdCIgaHJlZj0iaHR0cHM6Ly9mb250cy5nb29nbGVhcGlzLmNvbSI+CjxsaW5rIHJlbD0ic3R5bGVzaGVldCIgaHJlZj0iaHR0cHM6Ly9mb250cy5nb29nbGVhcGlzLmNvbS9jc3MyP2ZhbWlseT1CYWxvbysyOndnaHRANjAwOzcwMDs4MDAmZmFtaWx5PU51bml0bytTYW5zOm9wc3osd2dodEA2Li4xMiw0MDA7Ni4uMTIsNjAwOzYuLjEyLDcwMCZmYW1pbHk9SmV0QnJhaW5zK01vbm86d2dodEA1MDA7NzAwJmRpc3BsYXk9c3dhcCI+CjxsaW5rIHJlbD0ic3R5bGVzaGVldCIgaHJlZj0iL2FwcC5jc3MiPgo8L2hlYWQ+Cjxib2R5Pgo8ZGl2IGlkPSJhcHAiPjwvZGl2Pgo8ZGl2IGNsYXNzPSJ0b2FzdCIgaWQ9InRvYXN0IiBoaWRkZW4+PC9kaXY+CjxzY3JpcHQgc3JjPSIvYXBwLmpzIj48L3NjcmlwdD4KPC9ib2R5Pgo8L2h0bWw+Cg==","logo.svg":"PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0MCA0MCI+PHJlY3QgeD0iNCIgeT0iOCIgd2lkdGg9IjMyIiBoZWlnaHQ9IjI2IiByeD0iNyIgZmlsbD0iIzE2OTNEMyIvPjxwYXRoIGQ9Ik00IDE2aDMyIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iMi41Ii8+PHJlY3QgeD0iMTAiIHk9IjIxIiB3aWR0aD0iMTIiIGhlaWdodD0iMyIgcng9IjEuNSIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjEwIiB5PSIyNiIgd2lkdGg9IjgiIGhlaWdodD0iMyIgcng9IjEuNSIgZmlsbD0iI0JGRTZGOCIvPjxjaXJjbGUgY3g9IjI5IiBjeT0iMjYiIHI9IjQiIGZpbGw9IiNmZmYiLz48L3N2Zz4K"};
__req('index', './start');
