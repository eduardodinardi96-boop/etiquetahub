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
  role TEXT NOT NULL CHECK (role IN ('admin','fulfillment','seller','agencia')),
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
CREATE TABLE IF NOT EXISTS item_family (marketplace TEXT NOT NULL, pub_id TEXT NOT NULL, family TEXT, fetched_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (marketplace, pub_id));
CREATE TABLE IF NOT EXISTS undo_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, label TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'orders', before TEXT, after TEXT, done INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS print_log (order_id INTEGER NOT NULL, by TEXT, at TEXT NOT NULL, PRIMARY KEY (order_id, at));
CREATE TABLE IF NOT EXISTS return_codes (seller_id INTEGER NOT NULL, day TEXT NOT NULL, code TEXT NOT NULL, set_by TEXT, set_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (seller_id, day));`);

// Migraciones simples (columnas nuevas)
for (const [t, c, def] of [['users', 'must_change', 'INTEGER NOT NULL DEFAULT 0'], ['sessions', 'impersonator_id', 'INTEGER'], ['users', 'backup_hash', 'TEXT'], ['orders', 'block_no', 'INTEGER'], ['orders', 'unblocked_at', 'TEXT'], ['orders', 'unblocked_by', 'TEXT'], ['orders', 'unprinted_at', 'TEXT'], ['item_family', 'family_id', 'TEXT'], ['item_family', 'up_id', 'TEXT']]) {
  const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(x => x.name);
  if (!cols.includes(c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`);
}

// Rol nuevo "agencia" (solo ve los códigos de devolución): la tabla users tenía un CHECK con los roles antiguos
try {
  const u = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (u && !u.sql.includes("'agencia'")) {
    const cols = db.prepare('PRAGMA table_info(users)').all().map(x => '"' + x.name + '"').join(',');
    const newSql = u.sql.replace(/CREATE TABLE\s+(IF NOT EXISTS\s+)?["`]?users["`]?/i, 'CREATE TABLE users__new').replace(/CHECK\s*\(\s*role IN \(([^)]*)\)\s*\)/i, "CHECK (role IN ('admin','fulfillment','seller','agencia'))");
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      db.exec(newSql);
      db.exec(`INSERT INTO users__new (${cols}) SELECT ${cols} FROM users`);
      db.exec('DROP TABLE users');
      db.exec('ALTER TABLE users__new RENAME TO users');
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; } finally { db.exec('PRAGMA foreign_keys = ON'); }
  }
} catch (e) { console.warn('[db] rol agencia:', e.message); }

// pedidos que quedaron apuntando a una conexión borrada (se desconectó y se volvió a conectar): se pasan a la conexión actual
try {
  db.exec(`UPDATE orders SET connection_id = (SELECT c.id FROM connections c WHERE c.seller_id = orders.seller_id AND c.marketplace = orders.marketplace ORDER BY c.id DESC LIMIT 1)
    WHERE (connection_id IS NULL OR connection_id NOT IN (SELECT id FROM connections))
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

__defs["snap"] = function (module, exports, require, __dirname) {
// Copia de la base de datos en un hilo aparte (Worker): así el servidor sigue respondiendo mientras se
// arma el respaldo. Antes esto bloqueaba la app varios segundos y Render la reiniciaba ("health check failed").
const path = require('path');
const os = require('os');
const { Worker } = require('worker_threads');
const cfg = require('./config');

const CODE = `
const { parentPort, workerData } = require('worker_threads');
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs'), zlib = require('zlib'), crypto = require('crypto');
try {
  const d = new DatabaseSync(workerData.file, { readOnly: true });
  d.exec("VACUUM INTO '" + workerData.tmp.replace(/'/g, "''") + "'");
  d.close();
  const plain = fs.readFileSync(workerData.tmp); fs.unlinkSync(workerData.tmp);
  const hash = crypto.createHash('sha256').update(plain).digest('hex');
  const gz = zlib.gzipSync(plain, { level: 6 });
  parentPort.postMessage({ ok: true, gz, hash, size: plain.length });
} catch (e) { parentPort.postMessage({ ok: false, error: e.message }); }
`;

function snapshotGz() {
  return new Promise((resolve, reject) => {
    const w = new Worker(CODE, { eval: true, workerData: { file: path.join(cfg.dataDir, 'etiquetahub.db'), tmp: path.join(os.tmpdir(), `eh-snap-${Date.now()}-${Math.random().toString(36).slice(2)}.db`) } });
    const t = setTimeout(() => { w.terminate(); reject(new Error('El respaldo tardó demasiado')); }, 120e3);
    w.once('message', m => { clearTimeout(t); w.terminate(); m.ok ? resolve({ gz: Buffer.from(m.gz), hash: m.hash, size: m.size }) : reject(new Error(m.error)); });
    w.once('error', e => { clearTimeout(t); reject(e); });
  });
}
module.exports = { snapshotGz };

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

async function snapshot() {
  const { gz, hash } = await require('./snap').snapshotGz(); // en un hilo aparte: no bloquea la app
  return { enc: encryptBuf(gz), hash };
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

let lastHash = null, lastOkAt = null, lastError = null, running = false, pending = false, frozenUntil = 0;
// Versión vieja congelada durante el traspaso: ya no sube respaldos (no debe pisar los de la versión nueva)
function freeze(until) { frozenUntil = until; clearTimeout(timer); }

async function putFile(name, buf, msg) {
  const cur = await gh('GET', `/contents/${name}?ref=backup`);
  await gh('PUT', `/contents/${name}`, { message: msg, content: buf.toString('base64'), branch: 'backup', ...(cur?.sha ? { sha: cur.sha } : {}) });
}

async function pushNow() {
  if (!configured()) return { skipped: true };
  if (Date.now() < frozenUntil) return { skipped: 'frozen' };
  if (running) { pending = true; return { queued: true }; }
  running = true;
  try {
    const s = await snapshot();
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
// Respaldo como máximo "ms" después del primer cambio (antes se reiniciaba el reloj con cada cambio y con
// mucha actividad el respaldo podía atrasarse varios minutos)
function schedule(ms = 10000) {
  if (!configured() || timer) return;
  timer = setTimeout(() => { timer = null; pushNow(); }, ms);
}

function status() { return { configured: configured(), repo: repo(), lastOkAt, lastError }; }

// Al apagarse (Render reinicia o publica una versión nueva), intenta guardar antes de salir
let shuttingDown = false;
async function onShutdown(sig) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Recibido ${sig}: guardando respaldo antes de salir…`);
  const t = setTimeout(() => process.exit(0), 25000);
  try {
    while (running) await new Promise(r => setTimeout(r, 300)); // espera el respaldo que estaba en curso
    pending = false;
    await pushNow();
  } finally { clearTimeout(t); process.exit(0); }
}
process.on('SIGTERM', () => onShutdown('SIGTERM'));
process.on('SIGINT', () => onShutdown('SIGINT'));

setInterval(() => pushNow(), 10 * 60e3);

module.exports = { pushNow, schedule, status, configured, freeze };

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

async function apiSend(conn, method, path, body) {
  const tk = await token(conn);
  return request(`${API}${path}`, { method, headers: { authorization: `Bearer ${tk}`, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) }, { retries: 0 });
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
  // 2) plazo de preparación que informa Mercado Libre para el envío
  if (!d) {
    try { const lt = await api(conn, `/shipments/${sh.id}/lead_time`); d = lt?.estimated_handling_limit?.date || lt?.buffering?.date || null; } catch { /* sin dato */ }
  }
  // 3) último recurso: "pay_before" (es la hora límite de PAGO del comprador, no el corte de despacho)
  if (!d) d = so.estimated_delivery_time?.pay_before || null;
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
  const dBy = await dispatchBy(conn, sh);
  // ¿Mercado Libre la marca atrasada? Solo se consulta cuando ya pasó el plazo y el paquete no ha salido
  let mlDelayed = false;
  if (dBy && new Date(dBy) < new Date() && !alreadyOut(sh) && sh.status !== 'cancelled') {
    try { const sla = await api(conn, `/shipments/${sh.id}/sla`); mlDelayed = sla?.status === 'delayed'; } catch { /* sin dato */ }
  }
  return {
    external_id: String(sh.id),
    order_number: String(first.pack_id || first.id || sh.order_id || sh.id),
    sold_at: first.date_created || sh.date_created,
    items,
    // Lista para imprimir en Mercado Libre: "ready_to_ship" salvo que ya la entregaron al correo/agencia
    labelReady: sh.status === 'ready_to_ship' && !alreadyOut(sh) && !WAIT_SUBSTATUS.includes(sh.substatus),
    cancelled: sh.status === 'cancelled' || orders.every(o => o.status === 'cancelled'),
    // Flex: sigue en "Etiquetas impresas" hasta que el cliente lo recibe; el resto sale cuando la agencia/centro lo recibe
    shipped: logistic === 'self_service' ? ['delivered'].includes(sh.status) : alreadyOut(sh),
    meta: { status: sh.status, substatus: sh.substatus, buffered_until: sh.status === 'pending' && sh.substatus === 'buffered' ? (sh.shipping_option?.buffering?.date || null) : null, logistic, dispatch_by: dBy, ml_delayed: mlDelayed, out: alreadyOut(sh), customer: sh.receiver_address?.receiver_name || [first.buyer?.first_name, first.buyer?.last_name].filter(Boolean).join(' ') || first.buyer?.nickname || '' },
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

module.exports = { raw: api, apiSend, itemIds, families, sales, debugOrder, refresh, authUrl, exchangeCode, whoAmI, listShipments, fetchLabel, fromNotification };

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
    meta: { mk_printed: statuses.length > 0 && statuses.every(x => x === 'ready_to_ship'), dispatch_by: active.map(i => i.PromisedShippingTime).filter(Boolean).sort()[0] || null, orderItemIds: active.map(i => String(i.OrderItemId)), statuses, packageId: active.find(i => i.PackageId)?.PackageId || null, tracking: active.find(i => i.TrackingCode)?.TrackingCode || null, carrier: active.find(i => i.ShipmentProvider)?.ShipmentProvider || null, customer: [order.CustomerFirstName, order.CustomerLastName].filter(Boolean).join(' ') || [order.AddressShipping?.FirstName, order.AddressShipping?.LastName].filter(Boolean).join(' ') },
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

// Vuelve a consultar un pedido puntual (para saber si ya se despachó o entregó)
async function refresh(conn, order) {
  const items = await orderItems(conn.creds, order.external_id);
  const meta = JSON.parse(order.meta || '{}');
  const n = normalize({ OrderId: order.external_id, OrderNumber: order.order_number, CreatedAt: order.sold_at }, items);
  if (!n.meta.customer) n.meta.customer = meta.customer || '';
  if (!n.items.length) n.items = JSON.parse(order.items || '[]');
  return n;
}
async function debugOrder(conn, order) { return { items: await orderItems(conn.creds, order.external_id) }; }
module.exports = { call, refresh, debugOrder, sales, debugList, test, listShipments, fetchLabel, normalize, orderItems };

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

// Vuelve a consultar un pedido puntual en Paris (para saber si ya se despachó)
async function refresh(conn, order) {
  const meta = JSON.parse(order.meta || '{}');
  const list = await shipmentsOf(conn, { subOrderNumber: order.order_number, originOrderDate: order.sold_at, items: JSON.parse(order.items || '[]').map(i => ({ name: i.name, sellerSku: i.sku, sku: i.pub_id, quantity: i.qty })), customer: { name: meta.customer || '' } });
  return list.find(x => String(x.external_id) === String(order.external_id)) || list[0] || null;
}
async function debugOrder(conn, order) {
  const out = { shipments: await api(conn, `/v2/shipments/${encodeURIComponent(order.order_number)}`) };
  // sub-orden completa (para ver los estados que entrega Paris)
  try {
    const from = new Date(new Date(order.sold_at || order.created_at || Date.now()).getTime() - 864e5).toISOString();
    for (let offset = 0; offset < 1000 && !out.subOrder; offset += 50) {
      const r = await api(conn, `/v3/sub-orders?gteCreatedAt=${encodeURIComponent(from)}&limit=50&offset=${offset}`);
      const subs = flatten(r?.data);
      out.subOrder = subs.find(x => String(x.subOrderNumber) === String(order.order_number)) || null;
      if (subs.length < 50) break;
    }
  } catch (e) { out.subOrderError = e.message; }
  return out;
}
module.exports = { refresh, debugOrder, sales, test, listShipments, fetchLabel };

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

const MKNAME = { fa: 'Falabella', pa: 'Paris', ml: 'Mercado Libre' };
async function upsert(conn, s) {
  const mk = s.mk || conn.row.marketplace;
  const existing = db.prepare('SELECT * FROM orders WHERE marketplace = ? AND external_id = ?').get(mk, s.external_id);
  // Ya NO se marca como impresa solo porque Mercado Libre diga "printed": otras herramientas (o el propio ML)
  // descargan la etiqueta sin que nadie la imprima. Solo se muestra un aviso en la tarjeta.
  // Paris y Falabella: si la etiqueta ya se imprimió directamente en el marketplace, pasa a "Etiquetas impresas".
  // (En Mercado Libre no, porque otras herramientas descargan la etiqueta sin imprimirla.)
  // En Falabella "listo para despacho" = etiqueta impresa, salvo que la cuenta dependa de marcarlo a mano para que la app la reciba.
  const printedOutside = Boolean(s.meta?.mk_printed) && (mk === 'pa' || (mk === 'fa' && Boolean(conn.settings?.autoReady)));
  if (!existing) {
    if (s.shipped || s.cancelled) return;
    const r = db.prepare(`INSERT INTO orders (seller_id, connection_id, marketplace, external_id, order_number, sold_at, items, meta)
      VALUES (?,?,?,?,?,?,?,?)`).run(conn.row.seller_id, conn.row.id, mk, s.external_id, s.order_number, s.sold_at || null, JSON.stringify(s.items), JSON.stringify(s.meta || {}));
    const id = Number(r.lastInsertRowid);
    if (printedOutside) db.prepare(`UPDATE orders SET state='printed', printed_at=datetime('now'), printed_by=? WHERE id=?`).run(MKNAME[mk] ? `Impresa en ${MKNAME[mk]}` : 'Marketplace', id);
    logEvent(conn.row.seller_id, 'order', `Nuevo pedido ${s.order_number}`);
    bus.emit('change', { type: 'order', orderId: id, sellerId: conn.row.seller_id });
    return id;
  }
  let state = existing.state;
  // cancelada en el marketplace (aunque ya estuviera impresa): no se despacha, no cuenta como atrasada ni en camino
  if (s.cancelled && state !== 'shipped') state = 'cancelled';
  // Flex que se había dado por enviado al retirarlo el conductor: vuelve a "impresa" hasta que el cliente lo recibe
  else if (!s.shipped && !s.cancelled && state === 'shipped' && mk === 'ml' && s.meta?.logistic === 'self_service' && existing.printed_at) state = 'printed';
  else if (s.shipped && state !== 'shipped') {
    // Ya salió (en Mercado Libre aparece "Seguir envío"): se da por impresa y enviada
    state = 'shipped';
    if (!existing.printed_at) db.prepare(`UPDATE orders SET printed_at=datetime('now'), printed_by=? WHERE id=?`).run(existing.label_at ? 'EtiquetaHub' : (mk === 'ml' ? 'Mercado Libre' : 'Marketplace'), existing.id);
  }
  // Si la imprimieron en Mercado Libre (y no fue la app la que la descargó), pasa a impresa
  // Mercado Libre dice que la etiqueta ya se imprimió: pasa a impresa (salvo que alguien la haya marcado "no impresa" a mano)
  if (printedOutside && ['ready', 'waiting', 'error'].includes(state) && !existing.unprinted_at) {
    state = 'printed';
    db.prepare(`UPDATE orders SET printed_at=datetime('now'), printed_by=? WHERE id=?`).run(`Impresa en ${MKNAME[mk] || 'el marketplace'}`, existing.id);
    logEvent(existing.seller_id, 'print', `Pedido ${existing.order_number}: impreso directamente en ${MKNAME[mk] || 'el marketplace'}`);
  }
  db.prepare(`UPDATE orders SET items=?, meta=?, state=?, updated_at=datetime('now') WHERE id=?`)
    .run(JSON.stringify(s.items), JSON.stringify(s.meta || {}), state, existing.id);
  // si la cuenta se reconectó (nuevo id de conexión) el pedido pasa a la conexión vigente del mismo vendedor
  if (existing.connection_id !== conn.row.id && existing.seller_id === conn.row.seller_id) db.prepare('UPDATE orders SET connection_id=? WHERE id=?').run(conn.row.id, existing.id);
  // La venta aparece en la cuenta de ESTE vendedor pero estaba registrada a otro (p. ej. entró mientras una cuenta
  // estaba mal conectada): el dueño real es quien la vendió, se corrige el vendedor del pedido.
  if (existing.seller_id !== conn.row.seller_id && mk === 'ml') {
    db.prepare('UPDATE orders SET seller_id=?, connection_id=? WHERE id=?').run(conn.row.seller_id, conn.row.id, existing.id);
    logEvent(conn.row.seller_id, 'order', `Pedido ${existing.order_number} corregido: la venta es de esta cuenta de Mercado Libre`);
    bus.emit('change', { type: 'order', orderId: existing.id, sellerId: conn.row.seller_id });
  }
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
      // Impresas que aún no figuran como enviadas: se revisan por turnos (las menos actualizadas primero) para saber
      // si el centro de envío ya las recibió/escaneó y así sacarlas de "Etiquetas impresas"
      const printedOpen = db.prepare("SELECT * FROM orders WHERE connection_id=? AND state='printed' ORDER BY updated_at ASC LIMIT 80").all(connId).filter(o => !seen.has(String(o.external_id)));
      for (const o of printedOpen) {
        try { const s = await connectors[row.marketplace].refresh(conn, o); if (s) list.push(s); } catch (e) { console.warn('[sync] refrescar impresa', o.order_number, e.message); }
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
  // pedidos que quedaron sin conexión (se desconectó y reconectó la cuenta): pasan a la conexión actual del vendedor
  try {
    db.exec(`UPDATE orders SET connection_id = (SELECT c.id FROM connections c WHERE c.seller_id = orders.seller_id AND c.marketplace = orders.marketplace ORDER BY c.id DESC LIMIT 1)
      WHERE (connection_id IS NULL OR connection_id NOT IN (SELECT id FROM connections)) AND state NOT IN ('shipped','cancelled')
        AND EXISTS (SELECT 1 FROM connections c WHERE c.seller_id = orders.seller_id AND c.marketplace = orders.marketplace)`);
  } catch (e) { console.warn('[sync] reasignar conexiones:', e.message); }
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

__defs["mkp"] = function (module, exports, require, __dirname) {
// MKP Flash: preguntas, mensajes, reclamos, mediaciones (Mercado Libre) y devoluciones del día (ML y Falabella)
const db = require('./db');
const cfg = require('./config');
const sync = require('./sync');
const ml = require('./connectors/ml');
const fa = require('./connectors/falabella');

const chileDay = d => new Intl.DateTimeFormat('en-CA', { timeZone: cfg.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const cache = new Map(); // clave -> { at, data }
const reasons = new Map();
const nameCache = new Map();

// Error amigable cuando falta un permiso en la app de Mercado Libre
function why(e) {
  const s = String(e && e.message || e);
  if (/PolicyAgent|PA_UNAUTHORIZED|403/.test(s)) return 'permiso';
  return s.slice(0, 160);
}
async function safe(fn, fallback) { try { return { ok: true, v: await fn() }; } catch (e) { return { ok: false, err: why(e), v: fallback }; } }

async function userName(conn, id) {
  if (!id) return '';
  if (nameCache.has(id)) return nameCache.get(id);
  let n = '';
  try { const u = await ml.raw(conn, `/users/${id}`); n = u.nickname || ''; } catch {}
  nameCache.set(id, n);
  return n;
}
async function items(conn, ids) {
  const out = {};
  const uniq = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 20) {
    try {
      const r = await ml.raw(conn, `/items?ids=${uniq.slice(i, i + 20).join(',')}&attributes=id,title,thumbnail,permalink,price`);
      for (const x of r || []) if (x.body) out[x.body.id] = { id: x.body.id, title: x.body.title, thumb: (x.body.thumbnail || '').replace('http://', 'https://'), link: x.body.permalink };
    } catch {}
  }
  return out;
}
async function orderInfo(conn, orderId) {
  try {
    const o = await ml.raw(conn, `/orders/${orderId}`);
    const b = o.buyer || {};
    return {
      order_id: String(o.id), pack_id: o.pack_id ? String(o.pack_id) : null,
      buyer: [b.first_name, b.last_name].filter(Boolean).join(' ') || b.nickname || '', buyer_id: b.id,
      products: (o.order_items || []).map(i => ({ title: i.item?.title, qty: i.quantity, price: Number(i.unit_price || 0) * Number(i.quantity || 1) })),
      total: Number(o.total_amount || 0),
    };
  } catch { return { order_id: String(orderId), buyer: '', products: [], total: 0 }; }
}
async function reasonText(conn, id) {
  if (!id) return '';
  if (reasons.has(id)) return reasons.get(id);
  let t = '';
  try { const r = await ml.raw(conn, `/post-purchase/v1/claims/reasons/${id}`); t = r.detail || r.name || ''; } catch {}
  reasons.set(id, t);
  return t;
}

// ejecuta fn sobre la lista con n llamadas en paralelo (más rápido sin saturar a Mercado Libre)
async function pmap(arr, n, fn) {
  const out = new Array(arr.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, arr.length) }, async () => { while (i < arr.length) { const k = i++; out[k] = await fn(arr[k], k); } }));
  return out;
}
// Un reclamo puede apuntar a la venta (order) o al envío (shipment)
async function orderOfClaim(conn, x) {
  if (x.resource === 'shipment') {
    try { const sh = await ml.raw(conn, `/shipments/${x.resource_id}`); if (sh?.order_id) return orderInfo(conn, sh.order_id); } catch {}
  }
  return orderInfo(conn, x.resource_id);
}

async function mlAccount(row) {
  const conn = sync.connObj(row);
  const uid = conn.creds.user_id;
  const seller = db.prepare('SELECT name FROM sellers WHERE id=?').get(row.seller_id)?.name || '';
  const acc = { seller_id: row.seller_id, seller, conn_id: row.id, errors: {}, questions: [], messages: [], claims: [], returns: [] };
  const today = chileDay(new Date());

  const [q, m, c, rc] = await Promise.all([
    safe(() => ml.raw(conn, `/questions/search?seller_id=${uid}&status=UNANSWERED&api_version=4&sort_fields=date_created&sort_types=DESC&limit=50`), null),
    safe(() => ml.raw(conn, `/messages/unread?role=seller&tag=post_sale`), null),
    safe(() => ml.raw(conn, `/post-purchase/v1/claims/search?players.role=respondent&players.user_id=${uid}&status=opened&limit=50&sort=last_updated:desc`), null),
    safe(() => ml.raw(conn, `/post-purchase/v1/claims/search?players.role=respondent&players.user_id=${uid}&type=returns&limit=40&sort=last_updated:desc`), null),
  ]);

  // Preguntas sin responder
  if (!q.ok) acc.errors.questions = q.err;
  else {
    const qs = q.v?.questions || [];
    const it = await items(conn, qs.map(x => x.item_id));
    acc.questions = qs.map(x => ({ id: x.id, text: x.text, date: x.date_created, item: it[x.item_id] || { id: x.item_id, title: x.item_id } }));
  }

  // Mensajes post venta sin leer
  if (!m.ok) acc.errors.messages = m.err;
  else {
    const list = (m.v?.results || []).slice(0, 25).map(r => ({ r, pack: String(r.resource || '').match(/packs\/(\d+)/)?.[1] })).filter(x => x.pack);
    acc.messages = await pmap(list, 5, async ({ r, pack }) => {
      const [th, info] = await Promise.all([safe(() => ml.raw(conn, `/messages/packs/${pack}/sellers/${uid}?tag=post_sale&mark_as_read=false&limit=10`), null), orderInfo(conn, pack)]);
      const raw = th.v?.messages || [];
      const msgs = raw.map(x => ({ from: String(x.from?.user_id) === String(uid) ? 'seller' : 'buyer', text: x.text, date: x.message_date?.created || x.date_created })).sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const buyerId = info.buyer_id || raw.map(x => String(x.from?.user_id) === String(uid) ? x.to?.user_id : x.from?.user_id).find(Boolean);
      return { pack_id: pack, buyer_id: buyerId, unread: r.count || 1, buyer: info.buyer || await userName(conn, buyerId), product: info.products.map(p => p.title).join(' · '), thread: msgs };
    });
  }

  // Reclamos y mediaciones abiertas
  if (!c.ok) acc.errors.claims = c.err;
  else {
    acc.claims = await pmap((c.v?.data || []).slice(0, 40), 6, async x => {
      const [info, reason] = await Promise.all([orderOfClaim(conn, x), reasonText(conn, x.reason_id)]);
      const me = (x.players || []).find(p => String(p.user_id) === String(uid)) || {};
      return {
        id: x.id, stage: x.stage, type: x.type, dispute: x.stage === 'dispute', date: x.date_created, updated: x.last_updated,
        reason, order_id: info.order_id || x.resource_id, buyer: info.buyer, products: info.products, total: info.total,
        actions: (me.available_actions || []).map(a => a.action || a), due: (me.available_actions || []).map(a => a.due_date).filter(Boolean).sort()[0] || null,
      };
    });
  }

  // Devoluciones: reclamos de tipo "returns" recientes; se muestran las que vienen en camino al vendedor o llegan hoy
  if (!rc.ok) acc.errors.returns = rc.err;
  else {
    const recent = (rc.v?.data || []).filter(x => Date.now() - new Date(x.last_updated || x.date_created) < 20 * 864e5).slice(0, 30);
    const rows = await pmap(recent, 6, async x => {
      const r = await safe(() => ml.raw(conn, `/post-purchase/v2/claims/${x.id}/returns`), null);
      const ret = r.ok ? r.v : null;
      if (!ret || !ret.id || /cancel/.test(ret.status || '')) return null;
      const shp = (ret.shipments || []).find(s => /seller|warehouse/i.test(s.destination?.name || '')) || (ret.shipments || [])[0];
      if (!shp) return null;
      let eta = null, st = shp.status || ret.status;
      const sid = shp.shipment_id || shp.id;
      if (sid) {
        const sh = await safe(() => ml.raw(conn, `/shipments/${sid}`), null);
        if (sh.ok && sh.v) { st = sh.v.status || st; eta = sh.v.status_history?.date_delivered || sh.v.shipping_option?.estimated_delivery_time?.date || sh.v.shipping_option?.estimated_delivery_final?.date || null; }
      }
      const delivered = /delivered/.test(st);
      const day = eta ? chileDay(new Date(eta)) : null;
      if (delivered && day !== today) return null; // ya llegó otro día
      if (!/shipped|delivered|ready_to_ship|handling|pending/.test(st)) return null;
      const oid = ret.orders?.[0]?.order_id || x.resource_id;
      const info = await orderInfo(conn, oid);
      const label = { shipped: 'En camino al vendedor', delivered: 'Entregada hoy', ready_to_ship: 'El comprador aún no la despacha', handling: 'El comprador aún no la despacha', pending: 'Pendiente' }[st] || st;
      return { mk: 'ml', id: ret.id, claim_id: x.id, status: ret.status, ship_status: label, eta, today: day === today, order_id: info.order_id || oid, buyer: info.buyer, products: info.products, total: info.total };
    });
    acc.returns = rows.filter(Boolean);
  }
  return acc;
}

async function faReturns(row) {
  const conn = sync.connObj(row);
  const seller = db.prepare('SELECT name FROM sellers WHERE id=?').get(row.seller_id)?.name || '';
  const start = new Date(chileDay(new Date()) + 'T00:00:00-04:00');
  const out = [];
  const r = await safe(async () => {
    const res = [];
    for (const status of ['returned']) {
      const b = await fa.call(conn.creds, 'GetOrders', { UpdatedAfter: new Date(start.getTime() - 2 * 864e5).toISOString().replace(/\.\d{3}Z$/, '+00:00'), Status: status, Limit: '100' });
      const arr = Array.isArray(b.Orders) ? b.Orders.flatMap(e => e.Order ? [].concat(e.Order) : [e]) : [].concat(b.Orders?.Order || []);
      // solo las actualizadas en los últimos 2 días; los productos se consultan en paralelo
      const recent = arr.filter(o => !o.UpdatedAt || new Date(String(o.UpdatedAt).replace(' ', 'T') + '-03:00') >= new Date(start.getTime() - 2 * 864e5)).slice(0, 25);
      await pmap(recent, 5, async o => {
        const its = await fa.orderItems(conn.creds, o.OrderId).catch(() => []);
        const back = its.filter(i => /return/i.test(i.Status));
        if (!back.length) return;
        res.push({ mk: 'fa', id: o.OrderId, order_id: o.OrderNumber || o.OrderId, today: chileDay(new Date(String(o.UpdatedAt || '').replace(' ', 'T') + '-03:00')) === chileDay(new Date()), status: back[0].Status, buyer: [o.CustomerFirstName, o.CustomerLastName].filter(Boolean).join(' '), products: back.map(i => ({ title: i.Name, qty: 1, price: Number(i.PaidPrice || i.ItemPrice || 0) })), total: back.reduce((a, i) => a + Number(i.PaidPrice || i.ItemPrice || 0), 0) });
      });
    }
    return res;
  }, []);
  return { seller_id: row.seller_id, seller, ok: r.ok, err: r.err, returns: r.v || out };
}

// Cada cuenta se guarda aparte: la pantalla recibe al instante lo último que se tiene y, si ya tiene
// más de 90 s, se vuelve a consultar en segundo plano (la próxima vez aparece actualizado).
const accCache = new Map(); // connId -> { at, data, p }
function loadAcc(r) {
  const c = accCache.get(r.id) || {};
  if (c.p) return c.p;
  c.p = (r.marketplace === 'ml' ? mlAccount(r) : faReturns(r))
    .then(data => { accCache.set(r.id, { at: Date.now(), data }); return data; })
    .catch(e => { console.warn('[mkp]', r.id, e.message); const cur = accCache.get(r.id) || {}; delete cur.p; accCache.set(r.id, cur); return cur.data || null; });
  accCache.set(r.id, c);
  return c.p;
}
async function getAcc(r, force) {
  const c = accCache.get(r.id);
  if (c && c.data && !force) { if (Date.now() - c.at > 90e3) loadAcc(r); return c.data; }
  const seller = db.prepare('SELECT name FROM sellers WHERE id=?').get(r.seller_id)?.name || '';
  const wait = new Promise(res => setTimeout(() => res(null), force ? 45000 : 25000));
  const d = await Promise.race([loadAcc(r), wait]);
  if (d) return d;
  if (c && c.data) return c.data;
  return r.marketplace === 'ml'
    ? { seller_id: r.seller_id, seller, conn_id: r.id, loading: true, errors: {}, questions: [], messages: [], claims: [], returns: [] }
    : { seller_id: r.seller_id, seller, ok: true, loading: true, returns: [] };
}
async function summary(user, sellerId, force) {
  let rows = db.prepare("SELECT * FROM connections WHERE marketplace IN ('ml','fa') ORDER BY seller_id").all();
  const only = user.role === 'seller' ? user.seller_id : sellerId ? Number(sellerId) : null;
  if (only) rows = rows.filter(r => r.seller_id === only);
  const res = await Promise.all(rows.map(r => getAcc(r, force).then(d => ({ r, d }))));
  const accounts = res.filter(x => x.r.marketplace === 'ml' && x.d).map(x => x.d).sort((a, b) => a.seller.localeCompare(b.seller));
  const faAcc = res.filter(x => x.r.marketplace === 'fa' && x.d).map(x => x.d).sort((a, b) => a.seller.localeCompare(b.seller));
  const ats = rows.map(r => accCache.get(r.id)?.at).filter(Boolean);
  return { at: new Date(ats.length ? Math.min(...ats) : Date.now()).toISOString(), today: chileDay(new Date()), loading: res.some(x => x.d && x.d.loading), accounts, falabella: faAcc, paris: { supported: false } };
}
// se precalcula cada 3 minutos para que la sección abra al instante
setTimeout(function warm() {
  try { for (const r of db.prepare("SELECT * FROM connections WHERE marketplace IN ('ml','fa')").all()) loadAcc(r); } catch {}
  setTimeout(warm, 180e3);
}, 20e3);

function connFor(user, connId) {
  const row = db.prepare("SELECT * FROM connections WHERE id=? AND marketplace='ml'").get(Number(connId));
  if (!row) throw Object.assign(new Error('Cuenta no encontrada'), { status: 404 });
  if (user.role === 'seller' && row.seller_id !== user.seller_id) throw Object.assign(new Error('No permitido'), { status: 403 });
  return sync.connObj(row);
}
const bust = connId => { const c = accCache.get(Number(connId)); if (c) c.at = 0; };

async function answerQuestion(user, connId, questionId, text) {
  const conn = connFor(user, connId);
  await ml.apiSend(conn, 'POST', '/answers', { question_id: Number(questionId), text: String(text).slice(0, 2000) });
  bust(connId);
}
async function sendMessage(user, connId, packId, buyerId, text) {
  const conn = connFor(user, connId);
  const uid = conn.creds.user_id;
  await ml.apiSend(conn, 'POST', `/messages/packs/${packId}/sellers/${uid}?tag=post_sale`, { from: { user_id: String(uid) }, to: { user_id: String(buyerId) }, text: String(text).slice(0, 350) });
  bust(connId);
}
async function claimMessages(user, connId, claimId) {
  const conn = connFor(user, connId);
  const uid = conn.creds.user_id;
  const r = await ml.raw(conn, `/post-purchase/v1/claims/${claimId}/messages`);
  return (Array.isArray(r) ? r : r?.data || []).map(x => ({ from: x.sender_role === 'respondent' ? 'seller' : x.sender_role === 'mediator' ? 'mediator' : 'buyer', text: x.message || x.text, date: x.date_created })).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}
async function claimReply(user, connId, claimId, text, toMediator) {
  const conn = connFor(user, connId);
  await ml.apiSend(conn, 'POST', `/post-purchase/v1/claims/${claimId}/actions/send-message`, { receiver_role: toMediator ? 'mediator' : 'complainant', message: String(text).slice(0, 2000) });
  bust(connId);
}

module.exports = { summary, answerQuestion, sendMessage, claimMessages, claimReply };

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
// Historial de impresiones: queda aunque la etiqueta vuelva a "por imprimir"
const _plIns = () => db.prepare('INSERT OR IGNORE INTO print_log (order_id, by, at) VALUES (?,?,?)');
function logPrint(id) { const o = db.prepare('SELECT printed_by, printed_at FROM orders WHERE id=?').get(id); if (o?.printed_at) _plIns().run(id, o.printed_by || '', o.printed_at); }
function orderView(o, user) {
  const items = JSON.parse(o.items);
  const blocked = sync.blockedBy(o);
  const seller = db.prepare('SELECT name FROM sellers WHERE id=?').get(o.seller_id);
  const meta = JSON.parse(o.meta || '{}');
  const own = user.role !== 'seller' || o.seller_id === user.seller_id; // un vendedor ve todo, pero solo actúa sobre lo suyo
  // Atrasada: no ha salido y ya pasó el horario límite real de entrega de cada canal
  const late = isLate(o, meta);
  return {
    own,
    id: o.id, seller_id: o.seller_id, seller: seller?.name || '', marketplace: o.marketplace, order_number: o.order_number,
    sold_at: o.sold_at, created_at: o.created_at, items, state: blocked.length && !o.unblocked_at && ['ready', 'waiting', 'error'].includes(o.state) ? 'blocked' : o.state,
    block_no: o.block_no || null, unblocked_by: o.unblocked_at ? o.unblocked_by : null, missing: o.block_no ? blocked.length : 0,
    waiting_note: meta.buffered_until ? `Mercado Libre libera la etiqueta el ${new Intl.DateTimeFormat('es-CL', { timeZone: cfg.timezone, weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(meta.buffered_until))}` : null,
    blocked_skus: blocked.map(b => (b.sku || b.pub_id)), missing_idx: blocked.map(b => b.index), label_at: o.label_at, printed_at: o.printed_at, printed_by: o.printed_by,
    error: (user.role === 'seller' && own) || user.role === 'admin' ? o.error : (o.state === 'error' ? 'No se pudo obtener la etiqueta' : o.error),
    carrier: meta.carrier || null, dispatch_by: dispatchView(o.marketplace, meta.dispatch_by), dispatch_mk: o.marketplace === 'fa' ? meta.dispatch_by || null : null, ship_type: ({ self_service: 'Flex', cross_docking: 'Colecta', drop_off: 'Agencia', xd_drop_off: 'Agencia', fulfillment: 'Full' })[meta.logistic] || null, customer: meta.customer || '', tracking: meta.tracking || null, track_url: own ? trackUrl(o, meta, user) : null,
    ml_downloaded: o.marketplace === 'ml' && meta.substatus === 'printed' && !['printed', 'shipped'].includes(o.state),
    prev_print: ['printed', 'shipped'].includes(o.state) ? null : (db.prepare('SELECT by, at FROM print_log WHERE order_id=? ORDER BY at DESC LIMIT 1').get(o.id) || null),
    late, late_ml: late && meta.ml_delayed === true, deadline: late ? lateDeadline(o.marketplace, meta)?.toISOString() : null,
  };
}

// Quién imprimió: "Vendedor · Tienda", "Fulfillment · Nombre" o "Administrador · Nombre"
// Paris informa como plazo "fecha de compra + 72 h", así que la hora es la de la compra (8:23, 11:13…), no un horario de corte real.
// Para Paris mostramos solo el día (hora local de Chile), sin hora.
// Hora de Chile -> instante real (considera horario de verano/invierno)
function chileAt(day, hhmmss) {
  const [y, m, d] = day.split('-').map(Number), [h, mi, se] = hhmmss.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi, se || 0);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: cfg.timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(guess)).map(x => [x.type, x.value]));
  const asLocal = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return new Date(guess - (asLocal - guess));
}
const chileDay = d => new Intl.DateTimeFormat('en-CA', { timeZone: cfg.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const parseD = v => { if (!v) return null; const d = new Date(String(v).includes('T') ? v : String(v).replace(' ', 'T')); return isNaN(d) ? null : d; };
// Día de despacho de Paris: el día (hora de Chile) del plazo que informa Paris; se puede entregar hasta las 23:59
function parisDay(v) {
  const d = parseD(v); const raw = String(v).slice(0, 10);
  if (!d) return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  return chileDay(d);
}
// Horario límite real de entrega:
//  - Paris: hasta las 23:59 del día de despacho
//  - Flex (Mercado Libre): hasta las 23:00 del día de despacho
//  - Agencia/Colecta ML y Falabella: el horario que informa el marketplace
function lateDeadline(mk, meta) {
  const v = meta.dispatch_by; if (!v) return null;
  if (mk === 'pa') { const day = parisDay(v); return day ? chileAt(day, '23:59:59') : null; }
  const d = parseD(v); if (!d) return null;
  if (mk === 'ml' && meta.logistic === 'self_service') return chileAt(chileDay(d), '23:00:00');
  return d;
}
function isLate(o, meta) {
  if (['shipped', 'cancelled'].includes(o.state)) return false;
  // cancelada en el marketplace (aunque ya estuviera impresa) no es atrasada
  if (meta.status === 'cancelled' || meta.cancelled) return false;
  if (meta.out) return false; // ya salió (la retiró el conductor Flex o la recibió la agencia)
  const dl = lateDeadline(o.marketplace, meta);
  return Boolean(dl && dl < new Date());
}
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
  const day = parisDay(v);
  return day ? day + ' 23:59:00' : v;
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

// ---------- traspaso entre versiones ----------
const handoff = {
  until: 0,
  frozen() { return Date.now() < this.until; },
  freeze() { this.until = Date.now() + 8 * 60e3; backup.freeze(this.until); console.log('Traspaso: versión congelada (llegó una versión nueva)'); },
};
// peticiones que cambian datos: se rechazan mientras la versión está congelada (el navegador reintenta solo)
function isWrite(req, p, url) {
  if (p.startsWith('/webhooks/')) return false;
  if (req.method !== 'GET' && req.method !== 'HEAD') return true;
  if (/^\/api\/orders\/\d+\/label\.pdf$/.test(p) && url.searchParams.get('mark') === '1') return true;
  if (p.startsWith('/auth/')) return true;
  return false;
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
    // Traspaso a una versión nueva: la versión nueva pide la base firmada con "handoff". Desde ese momento esta
    // versión (la vieja) queda CONGELADA: no acepta más cambios (imprimir, desbloquear…) hasta que se apague, así
    // nada de lo que se haga en ese minuto se pierde; el navegador reintenta solo y el cambio cae en la versión nueva.
    const ts = Number(url.searchParams.get('ts') || 0), hs = url.searchParams.get('handoff');
    if (hs && Math.abs(Date.now() - ts) < 5 * 60e3 && hs === require('crypto').createHmac('sha256', require('./keys').KEY).update('handoff:' + ts).digest('hex')) {
      handoff.freeze();
      await new Promise(r => setTimeout(r, 1500)); // deja terminar lo que estaba en curso
    }
    // la copia se arma en un hilo aparte para que la app siga respondiendo (antes Render la reiniciaba)
    const snap = await require('./snap').snapshotGz();
    res.setHeader('x-plain-hash', snap.hash);
    return send(res, 200, encryptBuf(snap.gz), { 'content-type': 'application/octet-stream' });
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

  // "Agencia" (p. ej. Agencia Jimmy): solo puede ver los códigos de devolución de Mercado Libre
  if (user.role === 'agencia' && !['/api/undo', '/api/me', '/api/me/password', '/api/me/backup-code', '/api/return-codes', '/api/stream', '/api/impersonate/stop'].includes(p)) return fail(res, 403, 'Este usuario solo puede ver los códigos de devolución');

  // ----- códigos de autorización de devoluciones de Mercado Libre (uno nuevo cada día) -----
  if (p === '/api/return-codes' && m === 'GET') {
    if (user.role === 'fulfillment') return fail(res, 403, 'No permitido');
    const day = chileDay(new Date());
    let sellers = db.prepare(`SELECT s.id, s.name, (SELECT c.account_label FROM connections c WHERE c.seller_id=s.id AND c.marketplace='ml' ORDER BY c.id DESC LIMIT 1) AS account
      FROM sellers s WHERE EXISTS (SELECT 1 FROM connections c WHERE c.seller_id=s.id AND c.marketplace='ml') ORDER BY s.name`).all();
    if (user.role === 'seller') sellers = sellers.filter(x => x.id === user.seller_id);
    const codes = sellers.map(x => {
      const r = db.prepare('SELECT code, set_by, set_at FROM return_codes WHERE seller_id=? AND day=?').get(x.id, day);
      return { seller_id: x.id, seller: x.name, account: x.account || '', code: r?.code || null, set_by: r?.set_by || null, set_at: r?.set_at || null };
    });
    return ok(res, { day, codes, canEdit: user.role === 'admin' || user.role === 'seller' });
  }
  // Código leído directo desde Mercado Libre (favorito o tarea automática): se identifica la cuenta por su id de usuario ML
  let byMl = null;
  if (p === '/api/return-codes/by-ml' && m === 'POST') {
    byMl = await readBody(req);
    const conn = db.prepare("SELECT seller_id FROM connections WHERE marketplace='ml' AND external_id=? ORDER BY id DESC LIMIT 1").get(String(byMl.ml_user_id || ''));
    if (!conn) return fail(res, 404, 'Esa cuenta de Mercado Libre no está conectada a EtiquetaHub');
    byMl.sid = conn.seller_id;
  }
  const rc = byMl ? [null, String(byMl.sid)] : p.match(/^\/api\/return-codes\/(\d+)$/);
  if (rc && m === 'POST') {
    const sid = Number(rc[1]);
    if (!(user.role === 'admin' || (user.role === 'seller' && user.seller_id === sid))) return fail(res, 403, 'No permitido');
    const b = byMl || await readBody(req);
    const code = String(b.code || '').trim().replace(/\s+/g, ' ');
    const day = chileDay(new Date());
    if (!code) { db.prepare('DELETE FROM return_codes WHERE seller_id=? AND day=?').run(sid, day); }
    else {
      if (code.length > 30 || !/^[\w\- ]+$/.test(code)) return fail(res, 400, 'Código no válido');
      const who = user.role === 'seller' ? (db.prepare('SELECT name FROM sellers WHERE id=?').get(user.seller_id)?.name || user.name) : user.name;
      db.prepare(`INSERT INTO return_codes (seller_id, day, code, set_by, set_at) VALUES (?,?,?,?,datetime('now'))
        ON CONFLICT(seller_id, day) DO UPDATE SET code=excluded.code, set_by=excluded.set_by, set_at=excluded.set_at`).run(sid, day, code, who);
    }
    sync.bus.emit('change', { type: 'codes', sellerId: sid });
    return ok(res);
  }

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
    // las enviadas solo vienen si se imprimieron en los últimos 7 días (sección "Impresas 7 días")
    if (view === 'all') where.push("(state <> 'shipped' OR printed_at >= datetime('now','-7 day'))");
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
      logPrint(o.id);
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
      for (const o of allowed.filter(o => o.state === 'ready')) { st.run(who, o.id); logPrint(o.id); }
      sync.bus.emit('change', { type: 'printed', sellerId: null });
    }
    const stamp = new Intl.DateTimeFormat('sv-SE', { timeZone: cfg.timezone, dateStyle: 'short', timeStyle: 'short' }).format(new Date()).replace(/[-: ]/g, '').replace(/^(\d{8})/, '$1-');
    return send(res, 200, pdf, { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="etiquetas-${stamp}.pdf"`, 'x-label-count': String(allowed.length), 'x-skipped': String(rows.length - allowed.length) });
  }

  // Desbloquear varias etiquetas a la vez (en una sola petición)
  if (p === '/api/orders/unblock-bulk' && m === 'POST') {
    const body = await readBody(req).catch(() => ({}));
    const ids = [...new Set((body.ids || []).map(Number).filter(Boolean))].slice(0, 500);
    if (!ids.length) return fail(res, 400, 'No hay etiquetas seleccionadas');
    sync.assignBlockNumbers();
    const label = printedByLabel(user);
    const upd = db.prepare("UPDATE orders SET unblocked_at=datetime('now'), unblocked_by=? WHERE id=? AND unblocked_at IS NULL");
    let n = 0; const touched = new Set();
    for (const id of ids) {
      const o = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
      if (!o || (user.role === 'seller' && o.seller_id !== user.seller_id)) continue;
      if (!['ready', 'waiting', 'error'].includes(o.state)) continue;
      if (upd.run(label, o.id).changes) { n++; touched.add(o.seller_id); sync.logEvent(o.seller_id, 'unblock', `${label} desbloqueó el pedido ${o.order_number}`); }
    }
    for (const sid of touched) sync.bus.emit('change', { type: 'order', sellerId: sid });
    return ok(res, { ok: true, unblocked: n });
  }

  // Desbloquear / volver a bloquear una etiqueta puntual (admin, fulfillment o el vendedor dueño)
  const ub = p.match(/^\/api\/orders\/(\d+)\/(unblock|reblock)$/);
  if (ub && m === 'POST') {
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(Number(ub[1]));
    if (!o || (user.role === 'seller' && o.seller_id !== user.seller_id)) return fail(res, 404, 'Pedido no encontrado');
    if (ub[2] === 'unblock') {
      if (o.unblocked_at) return ok(res); // ya estaba desbloqueada: no es error (evita tener que insistir)
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

  // ----- Deshacer: cada usuario solo puede deshacer SUS propias acciones, paso a paso -----
  // Se guarda cómo estaban los pedidos antes (before) y cómo quedaron después (after). Al deshacer solo se
  // restauran los pedidos que siguen tal como los dejó este usuario (si otro los cambió después, no se tocan).
  const UNDO_FIELDS = ['state', 'printed_at', 'printed_by', 'unprinted_at', 'unblocked_at', 'unblocked_by', 'label_at'];
  const snapOf = ids => ids.map(id => db.prepare(`SELECT id, ${UNDO_FIELDS.join(',')} FROM orders WHERE id=?`).get(id)).filter(Boolean);
  const undoTop = () => db.prepare('SELECT id, label FROM undo_log WHERE user_id=? AND done=1 ORDER BY id DESC LIMIT 1').get(user.id);
  if (p === '/api/undo' && m === 'GET') {
    const t = undoTop();
    return ok(res, { label: t?.label || null, count: db.prepare('SELECT COUNT(*) n FROM undo_log WHERE user_id=? AND done=1').get(user.id).n });
  }
  if (p === '/api/undo/begin' && m === 'POST') {
    if (user.role === 'agencia') return fail(res, 403, 'No permitido');
    const b = await readBody(req);
    const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Boolean).slice(0, 500);
    const r = db.prepare("INSERT INTO undo_log (user_id, label, kind, before) VALUES (?,?,'orders',?)").run(user.id, String(b.label || 'Acción').slice(0, 80), JSON.stringify(snapOf(ids)));
    // se guardan los últimos 30 pasos por usuario
    db.prepare('DELETE FROM undo_log WHERE user_id=? AND id NOT IN (SELECT id FROM undo_log WHERE user_id=? ORDER BY id DESC LIMIT 30)').run(user.id, user.id);
    db.prepare("DELETE FROM undo_log WHERE created_at < datetime('now','-3 day')").run();
    return ok(res, { id: Number(r.lastInsertRowid) });
  }
  const ud = p.match(/^\/api\/undo\/(\d+)\/done$/);
  if (ud && m === 'POST') {
    const e = db.prepare('SELECT * FROM undo_log WHERE id=? AND user_id=?').get(Number(ud[1]), user.id);
    if (!e) return fail(res, 404, 'No encontrado');
    const before = JSON.parse(e.before || '[]');
    const after = snapOf(before.map(x => x.id));
    const changed = after.some((a, i) => UNDO_FIELDS.some(f => a[f] !== before[i]?.[f]));
    if (!changed) db.prepare('DELETE FROM undo_log WHERE id=?').run(e.id); // no cambió nada: no hay qué deshacer
    else db.prepare('UPDATE undo_log SET after=?, done=1 WHERE id=?').run(JSON.stringify(after), e.id);
    return ok(res);
  }
  if (p === '/api/undo/code' && m === 'POST') {
    const b = await readBody(req);
    db.prepare("INSERT INTO undo_log (user_id, label, kind, before, after, done) VALUES (?,?,'code',?,?,1)").run(user.id, String(b.label || 'Código').slice(0, 80), JSON.stringify({ seller_id: Number(b.seller_id), code: String(b.prev || '') }), JSON.stringify({ code: String(b.next || '') }));
    return ok(res);
  }
  if (p === '/api/undo/last' && m === 'POST') {
    const e = db.prepare('SELECT * FROM undo_log WHERE user_id=? AND done=1 ORDER BY id DESC LIMIT 1').get(user.id);
    if (!e) return fail(res, 404, 'No hay nada tuyo para deshacer');
    db.prepare('DELETE FROM undo_log WHERE id=?').run(e.id);
    let n = 0, skipped = 0;
    if (e.kind === 'code') {
      const bf = JSON.parse(e.before), af = JSON.parse(e.after), day = chileDay(new Date());
      const cur = db.prepare('SELECT code FROM return_codes WHERE seller_id=? AND day=?').get(bf.seller_id, day)?.code || '';
      if (cur === af.code) {
        if (bf.code) db.prepare(`INSERT INTO return_codes (seller_id, day, code, set_by, set_at) VALUES (?,?,?,?,datetime('now')) ON CONFLICT(seller_id, day) DO UPDATE SET code=excluded.code, set_by=excluded.set_by, set_at=excluded.set_at`).run(bf.seller_id, day, bf.code, user.name);
        else db.prepare('DELETE FROM return_codes WHERE seller_id=? AND day=?').run(bf.seller_id, day);
        sync.bus.emit('change', { type: 'codes', sellerId: bf.seller_id });
        n = 1;
      } else skipped = 1;
    } else {
      const before = JSON.parse(e.before || '[]'), after = JSON.parse(e.after || '[]');
      for (const sn of before) {
        const o = db.prepare('SELECT * FROM orders WHERE id=?').get(sn.id);
        const af = after.find(x => x.id === sn.id);
        if (!o || !af) continue;
        // si alguien más cambió la etiqueta después, no se toca
        if (UNDO_FIELDS.some(f => o[f] !== af[f])) { skipped++; continue; }
        if (['shipped', 'cancelled'].includes(o.state) || !['ready', 'waiting', 'error', 'printed'].includes(sn.state)) { skipped++; continue; }
        if (o.printed_at) logPrint(o.id);
        const vals = UNDO_FIELDS.map(f => sn[f] ?? null);
        if (sn.state !== 'printed' && o.state === 'printed') vals[UNDO_FIELDS.indexOf('unprinted_at')] = new Date().toISOString().replace('T', ' ').slice(0, 19);
        db.prepare(`UPDATE orders SET ${UNDO_FIELDS.map(f => f + '=?').join(',')} WHERE id=?`).run(...vals, o.id);
        sync.bus.emit('change', { type: 'order', orderId: o.id, sellerId: o.seller_id });
        n++;
      }
      if (n) sync.logEvent(null, 'undo', `${printedByLabel(user)} deshizo "${e.label}" (${n} etiqueta${n === 1 ? '' : 's'})`);
    }
    const t = undoTop();
    return ok(res, { label: e.label, restored: n, skipped, next: t?.label || null });
  }

  const ret = p.match(/^\/api\/orders\/(\d+)\/(retry|unprint)$/);
  if (ret && m === 'POST') {
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(Number(ret[1]));
    if (!o || (user.role === 'seller' && ret[2] === 'unprint' && o.seller_id !== user.seller_id)) return fail(res, 404, 'Pedido no encontrado');
    if (ret[2] === 'unprint') {
      logPrint(o.id); // la impresión anterior queda en el historial
      db.prepare("UPDATE orders SET state='ready', printed_at=NULL, printed_by=NULL, unprinted_at=datetime('now') WHERE id=?").run(o.id);
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
  // ----- MKP Flash: preguntas, mensajes, reclamos, mediaciones y devoluciones -----
  if (p.startsWith('/api/mkp/')) {
    if (!['admin', 'seller'].includes(user.role)) return fail(res, 403, 'No permitido');
    const mkp = require('./mkp');
    try {
      if (p === '/api/mkp/summary' && m === 'GET') return ok(res, await mkp.summary(user, url.searchParams.get('seller_id'), url.searchParams.get('refresh') === '1'));
      if (m === 'POST') {
        const b = await readBody(req);
        if (!String(b.text || '').trim()) return fail(res, 400, 'Escribe una respuesta');
        if (p === '/api/mkp/answer') { await mkp.answerQuestion(user, b.conn_id, b.question_id, b.text); return ok(res); }
        if (p === '/api/mkp/message') { await mkp.sendMessage(user, b.conn_id, b.pack_id, b.buyer_id, b.text); return ok(res); }
        if (p === '/api/mkp/claim-reply') { await mkp.claimReply(user, b.conn_id, b.claim_id, b.text, b.to_mediator); return ok(res); }
      }
      const cm = p.match(/^\/api\/mkp\/claim\/(\d+)\/(\d+)\/messages$/);
      if (cm && m === 'GET') return ok(res, { messages: await mkp.claimMessages(user, cm[1], cm[2]) });
    } catch (e) {
      const msg = /PolicyAgent|PA_UNAUTHORIZED/.test(e.message) ? 'Falta activar el permiso en la app de Mercado Libre' : e.message.replace(/HTTP \d+ en \S+: /, '');
      return fail(res, e.status || 502, msg.slice(0, 300));
    }
    return fail(res, 404, 'No encontrado');
  }

  // Historial diario de paquetes por día de despacho (cuántos se envían cada día, por canal)
  if (p === '/api/ship-history' && m === 'GET') {
    if (user.role === 'agencia') return fail(res, 403, 'No permitido');
    const days = Math.min(60, Math.max(1, Number(url.searchParams.get('days')) || 21));
    const today = chileDay(new Date());
    const from = chileDay(new Date(Date.now() - (days - 1) * 864e5));
    const rows = db.prepare("SELECT * FROM orders WHERE state <> 'cancelled' AND created_at >= datetime('now', ?)" + (user.role === 'seller' ? ' AND seller_id = ?' : '')).all(`-${days + 15} day`, ...(user.role === 'seller' ? [user.seller_id] : []));
    const map = new Map(), sNames = new Map();
    const sellerName = id => { if (!sNames.has(id)) sNames.set(id, db.prepare('SELECT name FROM sellers WHERE id=?').get(id)?.name || '?'); return sNames.get(id); };
    for (const o of rows) {
      const meta = JSON.parse(o.meta || '{}');
      const v = dispatchView(o.marketplace, meta.dispatch_by);
      if (!v) continue;
      const day = /T|[+-]\d\d:\d\d$|Z$/.test(String(v)) ? chileDay(parseD(v) || new Date()) : String(v).slice(0, 10);
      if (day < from || day > today) continue;
      const cat = o.marketplace === 'ml' ? (meta.logistic === 'self_service' ? 'flex' : 'ce') : o.marketplace;
      const items = JSON.parse(o.items || '[]');
      const blocked = sync.blockedBy(o);
      const noneFf = blocked.length > 0 && blocked.length >= items.length;
      if (!map.has(day)) map.set(day, { day, total: 0, ffTotal: 0, ff: {}, bl: {}, sellers: {} });
      const r = map.get(day);
      const sn = sellerName(o.seller_id);
      const se = r.sellers[sn] || (r.sellers[sn] = { ff: {}, bl: {} });
      r.total++;
      // ff = etiquetas que separa el fulfillment; bl = bloqueadas al 100% (el fulfillment no tiene ningún producto)
      const bucket = noneFf ? 'bl' : 'ff';
      if (!noneFf) r.ffTotal++;
      r[bucket][cat] = (r[bucket][cat] || 0) + 1;
      se[bucket][cat] = (se[bucket][cat] || 0) + 1;
    }
    return ok(res, { days: [...map.values()].sort((a, b) => b.day.localeCompare(a.day)) });
  }
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
    // Recuperar etiquetas que se imprimieron pero cuyo registro se perdió: quedan impresas (y desbloqueadas)
    if (p === '/api/admin/restore-printed' && m === 'POST') {
      const b = await readBody(req);
      let n = 0;
      for (const it of (b.items || []).slice(0, 500)) {
        const o = db.prepare('SELECT * FROM orders WHERE id=?').get(Number(it.id));
        if (!o || !['ready', 'waiting', 'error'].includes(o.state)) continue;
        const at = String(it.printed_at || '').replace('T', ' ').slice(0, 19) || null;
        db.prepare(`UPDATE orders SET state='printed', printed_at=COALESCE(?, datetime('now')), printed_by=?, unblocked_at=COALESCE(unblocked_at, ?, datetime('now')), unblocked_by=COALESCE(unblocked_by, ?) WHERE id=?`)
          .run(at, String(b.by || 'EtiquetaHub (recuperada)'), at, 'Recuperada', o.id);
        logPrint(o.id);
        if (!o.block_no) sync.assignBlockNumbers();
        sync.logEvent(o.seller_id, 'print', `Recuperada como impresa: pedido ${o.order_number}`);
        sync.bus.emit('change', { type: 'printed', orderId: o.id, sellerId: o.seller_id });
        n++;
      }
      return ok(res, { ok: true, restored: n });
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
      const role = ['admin', 'fulfillment', 'seller', 'agencia'].includes(b.role) ? b.role : null;
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
      const role = ['admin', 'fulfillment', 'seller', 'agencia'].includes(b.role) ? b.role : null;
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
  if (handoff.frozen()) {
    const u = new URL(req.url, cfg.baseUrl);
    if (isWrite(req, u.pathname, u)) {
      res.writeHead(503, { 'content-type': 'application/json', 'x-eh-updating': '1', 'retry-after': '5' });
      return res.end(JSON.stringify({ error: 'La app se está actualizando. Tu acción se hará sola en unos segundos…', updating: true }));
    }
  }
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
    // 1) Durante una publicación, la versión anterior sigue atendiendo en la URL pública: se copia su base
    //    (así no se pierde lo impreso en los minutos desde el último respaldo de GitHub).
    try {
      // "handoff" firmado: congela la versión vieja para que nada de lo que se haga desde ahora se pierda
      const ts = Date.now(), hs = require('crypto').createHmac('sha256', require('./keys').KEY).update('handoff:' + ts).digest('hex');
      const live = await fetch(`${cfg.baseUrl}/backup.enc?t=${ts}&ts=${ts}&handoff=${hs}`, { signal: AbortSignal.timeout(20000) });
      if (live.ok) {
        let plain = decryptBuf(Buffer.from(await live.arrayBuffer()));
        if (plain[0] === 0x1f && plain[1] === 0x8b) plain = require('zlib').gunzipSync(plain);
        if (plain.slice(0, 15).toString() === 'SQLite format 3') {
          fs.writeFileSync(dbFile, plain);
          console.log(`Base copiada de la versión en línea (${plain.length} bytes).`);
          return;
        }
      }
    } catch (e) { console.log('Sin versión en línea para copiar:', e.message); }
    // 2) Respaldo de GitHub: preferimos la API (sin caché); si falla, el enlace raw
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

global.__EH_PUBLIC = {"app.css":"OnJvb3R7CiAgLS1iZzojRUFGNUZDOyAtLWJnMjojRDhFREY5OyAtLXN1cmZhY2U6I0ZGRkZGRjsgLS1zdXJmYWNlMjojRjRGQUZFOwogIC0taW5rOiMwQzJCNDA7IC0tbXV0ZWQ6IzU1NzI4NzsgLS1saW5lOiNDOUUyRjI7CiAgLS1hY2NlbnQ6IzE2OTNEMzsgLS1hY2NlbnQtc3Ryb25nOiMwQTZGQTY7IC0tc2t5OiM3RkNERjI7IC0taWNlOiNCRkU2Rjg7CiAgLS1vazojMjM5NDZBOyAtLW9rLWJnOiNEREY0RUE7IC0tbG9jazojQzgzRTU1OyAtLWxvY2stYmc6I0ZCRTNFODsgLS13YXJuOiNCNzc5MEY7IC0td2Fybi1iZzojRkNGMEQ2OwogIC0tbWw6I0ZGRTYwMDsgLS1tbC1pbms6IzJEMzI3NzsgLS1mYTojQUFENTAwOyAtLWZhLWluazojMkYzQTAwOyAtLXBhOiMwMDc4Qzg7IC0tcGEtaW5rOiNGRkZGRkY7CiAgLS1zaGFkb3c6MCAxMHB4IDMwcHggLTE0cHggcmdiYSgxMiw3MCwxMTAsLjM1KTsKICAtLWRpc3BsYXk6IkJhbG9vIDIiLCJUcmVidWNoZXQgTVMiLHN5c3RlbS11aSxzYW5zLXNlcmlmOwogIC0tYm9keToiTnVuaXRvIFNhbnMiLHN5c3RlbS11aSwtYXBwbGUtc3lzdGVtLCJTZWdvZSBVSSIsc2Fucy1zZXJpZjsKICAtLW1vbm86IkpldEJyYWlucyBNb25vIix1aS1tb25vc3BhY2UsTWVubG8sQ29uc29sYXMsbW9ub3NwYWNlOwogIGNvbG9yLXNjaGVtZTpsaWdodDsKfQoqe2JveC1zaXppbmc6Ym9yZGVyLWJveH0KaHRtbCxib2R5e21hcmdpbjowfQpib2R5e2JhY2tncm91bmQ6dmFyKC0tYmcpO2NvbG9yOnZhcigtLWluayk7Zm9udC1mYW1pbHk6dmFyKC0tYm9keSk7Zm9udC1zaXplOjE1cHg7bGluZS1oZWlnaHQ6MS41O21pbi1oZWlnaHQ6MTAwdmh9Ci53cmFwe21heC13aWR0aDoxMjQwcHg7bWFyZ2luOjAgYXV0bztwYWRkaW5nLWlubGluZToyMHB4O3BhZGRpbmctYmxvY2s6MCA2MHB4fQpoMSxoMixoM3tmb250LWZhbWlseTp2YXIoLS1kaXNwbGF5KTtsaW5lLWhlaWdodDoxLjE7dGV4dC13cmFwOmJhbGFuY2U7bWFyZ2luOjB9CmJ1dHRvbntmb250OmluaGVyaXQ7Y3Vyc29yOnBvaW50ZXI7Y29sb3I6aW5oZXJpdH0KYXtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KYnV0dG9uOmZvY3VzLXZpc2libGUsaW5wdXQ6Zm9jdXMtdmlzaWJsZSxzZWxlY3Q6Zm9jdXMtdmlzaWJsZSx0ZXh0YXJlYTpmb2N1cy12aXNpYmxlLGE6Zm9jdXMtdmlzaWJsZXtvdXRsaW5lOjNweCBzb2xpZCB2YXIoLS1za3kpO291dGxpbmUtb2Zmc2V0OjJweH0KLm1vbm97Zm9udC1mYW1pbHk6dmFyKC0tbW9ubyk7Zm9udC1zaXplOi44NmVtfQoubXV0ZWR7Y29sb3I6dmFyKC0tbXV0ZWQpfQpbaGlkZGVuXXtkaXNwbGF5Om5vbmUhaW1wb3J0YW50fQoKLyogYmFycmEgc3VwZXJpb3IgKi8KLnRvcHtwb3NpdGlvbjpzdGlja3k7dG9wOjA7ei1pbmRleDoyMDtiYWNrZ3JvdW5kOmNvbG9yLW1peChpbiBzcmdiLHZhcigtLWJnKSA4OCUsdHJhbnNwYXJlbnQpO2JhY2tkcm9wLWZpbHRlcjpibHVyKDhweCk7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tbGluZSl9Ci50b3AgLndyYXB7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6MTRweDtmbGV4LXdyYXA6d3JhcDtwYWRkaW5nLWJsb2NrOjEwcHh9Ci5icmFuZHtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDoxMHB4O2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MjJweDtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKTt0ZXh0LWRlY29yYXRpb246bm9uZX0KLmJyYW5kIGltZ3t3aWR0aDozMnB4O2hlaWdodDozMnB4fQoubmF2e2Rpc3BsYXk6ZmxleDtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czo5OTlweDtwYWRkaW5nOjRweDtnYXA6NHB4fQoubmF2IGJ1dHRvbntib3JkZXI6MDtiYWNrZ3JvdW5kOnRyYW5zcGFyZW50O2NvbG9yOnZhcigtLW11dGVkKTtwYWRkaW5nOjdweCAxNXB4O2JvcmRlci1yYWRpdXM6OTk5cHg7Zm9udC13ZWlnaHQ6NzAwfQoubmF2IGJ1dHRvblthcmlhLWN1cnJlbnQ9InRydWUiXXtiYWNrZ3JvdW5kOnZhcigtLWFjY2VudCk7Y29sb3I6I2ZmZn0KLnNwYWNlcntmbGV4OjF9Ci5saXZle2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjZweDtmb250LXNpemU6MTIuNXB4O2ZvbnQtd2VpZ2h0OjcwMDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5saXZlIGl7d2lkdGg6OXB4O2hlaWdodDo5cHg7Ym9yZGVyLXJhZGl1czo1MCU7YmFja2dyb3VuZDp2YXIoLS1tdXRlZCl9Ci5saXZlLm9ue2NvbG9yOnZhcigtLW9rKX0gLmxpdmUub24gaXtiYWNrZ3JvdW5kOnZhcigtLW9rKTtib3gtc2hhZG93OjAgMCAwIDRweCBjb2xvci1taXgoaW4gc3JnYix2YXIoLS1vaykgMjUlLHRyYW5zcGFyZW50KX0KLmNsb2Nre2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjEwcHg7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTRweDtwYWRkaW5nOjVweCAxMnB4fQouY2xvY2sgYntmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6MTdweDtmb250LXZhcmlhbnQtbnVtZXJpYzp0YWJ1bGFyLW51bXN9Ci5jbG9jayBzbWFsbHtjb2xvcjp2YXIoLS1tdXRlZCk7ZGlzcGxheTpibG9jaztsaW5lLWhlaWdodDoxLjE7Zm9udC1zaXplOjEwLjVweDt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7bGV0dGVyLXNwYWNpbmc6LjA2ZW19Ci5jbG9jay5sYXRlIGJ7Y29sb3I6dmFyKC0tbG9jayl9Ci51c2Vye2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjhweDtmb250LXNpemU6MTMuNXB4fQoudXNlciBie2Rpc3BsYXk6YmxvY2s7bGluZS1oZWlnaHQ6MS4xfQoudXNlciBzbWFsbHtjb2xvcjp2YXIoLS1tdXRlZCl9CgovKiBlbGVtZW50b3MgKi8KLmJ0bnt0ZXh0LWRlY29yYXRpb246bm9uZTtib3JkZXI6MDtib3JkZXItcmFkaXVzOjEzcHg7cGFkZGluZzo5cHggMTVweDtmb250LXdlaWdodDo3MDA7ZGlzcGxheTppbmxpbmUtZmxleDtnYXA6OHB4O2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyO3doaXRlLXNwYWNlOm5vd3JhcH0KLmJ0biBzdmd7d2lkdGg6MThweDtoZWlnaHQ6MThweDtmbGV4Om5vbmV9Ci5idG4tcHJpbWFyeXtiYWNrZ3JvdW5kOnZhcigtLWFjY2VudCk7Y29sb3I6I2ZmZn0KLmJ0bi1wcmltYXJ5OmhvdmVye2JhY2tncm91bmQ6dmFyKC0tYWNjZW50LXN0cm9uZyl9Ci5idG4tZ2hvc3R7YmFja2dyb3VuZDp2YXIoLS1pY2UpO2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQouYnRuLWxpbmV7YmFja2dyb3VuZDp0cmFuc3BhcmVudDtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2NvbG9yOnZhcigtLWluayl9Ci5idG4tZGFuZ2Vye2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayl9Ci5idG46ZGlzYWJsZWR7b3BhY2l0eTouNDU7Y3Vyc29yOm5vdC1hbGxvd2VkfQouYnRuLXNte3BhZGRpbmc6NnB4IDEwcHg7Zm9udC1zaXplOjEzcHg7Ym9yZGVyLXJhZGl1czoxMHB4fQpzZWxlY3QsaW5wdXRbdHlwZT10ZXh0XSxpbnB1dFt0eXBlPWVtYWlsXSxpbnB1dFt0eXBlPXBhc3N3b3JkXSxpbnB1dFt0eXBlPXNlYXJjaF0sdGV4dGFyZWF7Zm9udDppbmhlcml0O2NvbG9yOnZhcigtLWluayk7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlMik7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjEycHg7cGFkZGluZzo4cHggMTJweDttaW4td2lkdGg6MDt3aWR0aDoxMDAlfQp0ZXh0YXJlYXtyZXNpemU6dmVydGljYWw7bWluLWhlaWdodDo3MHB4fQpsYWJlbC5me2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjRweDtmb250LXNpemU6MTIuNXB4O2ZvbnQtd2VpZ2h0OjcwMDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5jaGlwc3tkaXNwbGF5OmZsZXg7Z2FwOjZweDtmbGV4LXdyYXA6d3JhcH0KLmNoaXB7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKTtjb2xvcjp2YXIoLS1pbmspO3BhZGRpbmc6NnB4IDEycHg7Ym9yZGVyLXJhZGl1czo5OTlweDtmb250LXdlaWdodDo2MDA7Zm9udC1zaXplOjEzcHh9Ci5jaGlwW2FyaWEtcHJlc3NlZD0idHJ1ZSJde2JhY2tncm91bmQ6dmFyKC0tYWNjZW50KTtib3JkZXItY29sb3I6dmFyKC0tYWNjZW50KTtjb2xvcjojZmZmfQouc3dpdGNoe2Rpc3BsYXk6aW5saW5lLWZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDoxMHB4O2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTRweDtjdXJzb3I6cG9pbnRlcjt1c2VyLXNlbGVjdDpub25lfQouc3dpdGNoIGlucHV0e2FwcGVhcmFuY2U6bm9uZTt3aWR0aDo0NHB4O2hlaWdodDoyNnB4O2JvcmRlci1yYWRpdXM6OTk5cHg7YmFja2dyb3VuZDp2YXIoLS1saW5lKTtwb3NpdGlvbjpyZWxhdGl2ZTt0cmFuc2l0aW9uOmJhY2tncm91bmQgLjJzO2N1cnNvcjpwb2ludGVyO21hcmdpbjowO2ZsZXg6bm9uZX0KLnN3aXRjaCBpbnB1dDo6YWZ0ZXJ7Y29udGVudDoiIjtwb3NpdGlvbjphYnNvbHV0ZTt0b3A6M3B4O2xlZnQ6M3B4O3dpZHRoOjIwcHg7aGVpZ2h0OjIwcHg7Ym9yZGVyLXJhZGl1czo1MCU7YmFja2dyb3VuZDojZmZmO3RyYW5zaXRpb246bGVmdCAuMnM7Ym94LXNoYWRvdzowIDFweCAzcHggcmdiYSgwLDAsMCwuMjUpfQouc3dpdGNoIGlucHV0OmNoZWNrZWR7YmFja2dyb3VuZDp2YXIoLS1vayl9Ci5zd2l0Y2ggaW5wdXQ6Y2hlY2tlZDo6YWZ0ZXJ7bGVmdDoyMXB4fQoKLnBhbmVse2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjIycHg7Ym94LXNoYWRvdzp2YXIoLS1zaGFkb3cpfQoucGFuZWwtaGVhZHtkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7Z2FwOjEycHg7YWxpZ24taXRlbXM6Y2VudGVyO3BhZGRpbmc6MTZweCAyMHB4O2JvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLWxpbmUpfQoucGFuZWwtaGVhZCBoMntmb250LXNpemU6MjNweDttYXJnaW4tcmlnaHQ6YXV0b30KLnBhbmVsLWJvZHl7cGFkZGluZzoxNnB4IDIwcHh9Ci5wYW5lbC1mb290e2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6MTBweDthbGlnbi1pdGVtczpjZW50ZXI7cGFkZGluZzoxNHB4IDIwcHg7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tbGluZSk7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtc2l6ZToxMy41cHh9CgoubWt7ZGlzcGxheTppbmxpbmUtZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Zm9udC13ZWlnaHQ6NzAwO2ZvbnQtc2l6ZToxMnB4O3BhZGRpbmc6M3B4IDlweDtib3JkZXItcmFkaXVzOjhweDt3aGl0ZS1zcGFjZTpub3dyYXB9Ci5tay5tbHtiYWNrZ3JvdW5kOnZhcigtLW1sKTtjb2xvcjp2YXIoLS1tbC1pbmspfSAubWsuZmF7YmFja2dyb3VuZDp2YXIoLS1mYSk7Y29sb3I6dmFyKC0tZmEtaW5rKX0gLm1rLnBhe2JhY2tncm91bmQ6dmFyKC0tcGEpO2NvbG9yOnZhcigtLXBhLWluayl9Ci5waWxse2Rpc3BsYXk6aW5saW5lLWZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo2cHg7Ym9yZGVyLXJhZGl1czo5OTlweDtwYWRkaW5nOjRweCAxMHB4O2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTIuNXB4O3doaXRlLXNwYWNlOm5vd3JhcH0KLnBpbGwgc3Zne3dpZHRoOjE0cHg7aGVpZ2h0OjE0cHh9Ci5waWxsLnJlYWR5e2JhY2tncm91bmQ6dmFyKC0tb2stYmcpO2NvbG9yOnZhcigtLW9rKX0KLnBpbGwuYmxvY2tlZHtiYWNrZ3JvdW5kOiNFM0U3RUM7Y29sb3I6IzRBNTU2M30KLnBpbGwucHJpbnRlZHtiYWNrZ3JvdW5kOnZhcigtLWxvY2stYmcpO2NvbG9yOnZhcigtLWxvY2spfQoucGlsbC53YWl0aW5ne2JhY2tncm91bmQ6dmFyKC0td2Fybi1iZyk7Y29sb3I6dmFyKC0td2Fybil9Ci5waWxsLmVycm9ye2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayl9Ci5waWxsLmNhbmNlbGxlZHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKTtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5ub3Rle2Rpc3BsYXk6YmxvY2s7Zm9udC1zaXplOjEycHg7Y29sb3I6dmFyKC0tbXV0ZWQpO21hcmdpbi10b3A6NHB4O21heC13aWR0aDozNGNofQoubm90ZS5iYWR7Y29sb3I6dmFyKC0tbG9jayl9CgovKiBow6lyb2UgKi8KLmhlcm97ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczoxLjFmciAuOWZyO2dhcDoyNHB4O2FsaWduLWl0ZW1zOmNlbnRlcjtwYWRkaW5nLWJsb2NrOjI0cHggNnB4fQouaGVybyBoMXtmb250LXNpemU6Y2xhbXAoMjhweCwzLjZ2dyw0MHB4KTtmb250LXdlaWdodDo4MDB9Ci5oZXJvIGgxIGVte2ZvbnQtc3R5bGU6bm9ybWFsO2NvbG9yOnZhcigtLWFjY2VudCl9Ci5oZXJvIHB7Y29sb3I6dmFyKC0tbXV0ZWQpO21heC13aWR0aDo1NmNoO21hcmdpbjoxMHB4IDAgMH0KLmhlcm8gc3Zne3dpZHRoOjEwMCU7aGVpZ2h0OmF1dG87bWF4LWhlaWdodDoyMTBweH0KCi8qIGtwaXMgKi8KLmtwaXN7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoNCwxZnIpO2dhcDoxNHB4O21hcmdpbi1ibG9jazoxOHB4fQoua3Bpe2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjE4cHg7cGFkZGluZzoxNHB4IDE2cHg7ZGlzcGxheTpmbGV4O2dhcDoxMnB4O2FsaWduLWl0ZW1zOmNlbnRlcn0KLmtwaSAuaWN7d2lkdGg6NDJweDtoZWlnaHQ6NDJweDtib3JkZXItcmFkaXVzOjEycHg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtmbGV4Om5vbmV9Ci5rcGkgLmljIHN2Z3t3aWR0aDoyMnB4O2hlaWdodDoyMnB4fQoua3BpLm9rIC5pY3tiYWNrZ3JvdW5kOnZhcigtLW9rLWJnKTtjb2xvcjp2YXIoLS1vayl9Ci5rcGkud2FpdCAuaWN7YmFja2dyb3VuZDp2YXIoLS13YXJuLWJnKTtjb2xvcjp2YXIoLS13YXJuKX0KLmtwaS5sb2NrIC5pY3tiYWNrZ3JvdW5kOnZhcigtLWxvY2stYmcpO2NvbG9yOnZhcigtLWxvY2spfQoua3BpLmRvbmUgLmlje2JhY2tncm91bmQ6dmFyKC0taWNlKTtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KLmtwaSBie2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtc2l6ZToyOHB4O2xpbmUtaGVpZ2h0OjE7ZGlzcGxheTpibG9jaztmb250LXZhcmlhbnQtbnVtZXJpYzp0YWJ1bGFyLW51bXN9Ci5rcGkgc3Bhbntjb2xvcjp2YXIoLS1tdXRlZCk7Zm9udC1zaXplOjEzcHh9CgouYXV0b2JhcntkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7Z2FwOjE0cHg7YWxpZ24taXRlbXM6Y2VudGVyO2p1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuO2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDEyMGRlZyx2YXIoLS1iZzIpLHZhcigtLXN1cmZhY2UpKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MThweDtwYWRkaW5nOjE0cHggMThweDttYXJnaW4tYm90dG9tOjE2cHh9Ci5hdXRvYmFyIHB7bWFyZ2luOjJweCAwIDA7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtc2l6ZToxM3B4O21heC13aWR0aDo3MGNofQoKLmZpbHRlcnN7ZGlzcGxheTpmbGV4O2ZsZXgtd3JhcDp3cmFwO2dhcDoxMHB4O2FsaWduLWl0ZW1zOmNlbnRlcn0KLmZpbHRlcnMgc2VsZWN0LC5maWx0ZXJzIGlucHV0e3dpZHRoOmF1dG99Ci50YWJsZS13cmFwe292ZXJmbG93LXg6YXV0b30KdGFibGV7d2lkdGg6MTAwJTtib3JkZXItY29sbGFwc2U6Y29sbGFwc2U7bWluLXdpZHRoOjgyMHB4fQp0aHtmb250LXNpemU6MTEuNXB4O3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtsZXR0ZXItc3BhY2luZzouMDdlbTtjb2xvcjp2YXIoLS1tdXRlZCk7dGV4dC1hbGlnbjpsZWZ0O3BhZGRpbmc6MTBweCAxNHB4O2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZTIpO3doaXRlLXNwYWNlOm5vd3JhcH0KdGR7cGFkZGluZzoxMXB4IDE0cHg7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tbGluZSk7dmVydGljYWwtYWxpZ246bWlkZGxlfQp0ci5pcy1ibG9ja2VkIHRke2JhY2tncm91bmQ6Y29sb3ItbWl4KGluIHNyZ2IsdmFyKC0tbG9jay1iZykgNDUlLHRyYW5zcGFyZW50KX0KdHIuaXMtbmV3IHRke2FuaW1hdGlvbjpmbGFzaCAyLjVzIGVhc2Utb3V0fQpAa2V5ZnJhbWVzIGZsYXNoe2Zyb217YmFja2dyb3VuZDpjb2xvci1taXgoaW4gc3JnYix2YXIoLS1za3kpIDQ1JSx0cmFuc3BhcmVudCl9dG97YmFja2dyb3VuZDp0cmFuc3BhcmVudH19Ci5pdGVtc3tkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDoycHg7Zm9udC1zaXplOjEzLjVweH0KLml0ZW1zIC52e2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTIuNXB4fQouaXRlbXMgLmJhZHtjb2xvcjp2YXIoLS1sb2NrKTtmb250LXdlaWdodDo3MDB9Ci5jYnt3aWR0aDoxOXB4O2hlaWdodDoxOXB4O2FjY2VudC1jb2xvcjp2YXIoLS1hY2NlbnQpfQoubG9ja2NlbGx7Y29sb3I6dmFyKC0tbG9jayk7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcn0KLmxvY2tjZWxsIHN2Z3t3aWR0aDoxOHB4O2hlaWdodDoxOHB4fQoucm93LWFjdGlvbnN7ZGlzcGxheTpmbGV4O2dhcDo2cHg7ZmxleC13cmFwOndyYXB9Ci5lbXB0eXtwYWRkaW5nOjQwcHggMjBweDt0ZXh0LWFsaWduOmNlbnRlcjtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5lbXB0eSBzdmd7d2lkdGg6MTIwcHg7aGVpZ2h0OmF1dG87bWFyZ2luLWJvdHRvbToxMHB4fQoKLyogdmVuZGVkb3IgKi8KLnNlY3Rpb24tdGl0bGV7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6MTJweDtmbGV4LXdyYXA6d3JhcDttYXJnaW4tYmxvY2s6MjRweCAxMnB4fQouc2VjdGlvbi10aXRsZSBoMntmb250LXNpemU6MjZweH0KLmNvbm57ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoMywxZnIpO2dhcDoxNHB4fQoubWNhcmR7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MjBweDtwYWRkaW5nOjE2cHg7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MTBweH0KLm1jYXJkIC5sb2dve2hlaWdodDo0NHB4O2JvcmRlci1yYWRpdXM6MTJweDtkaXNwbGF5OmdyaWQ7cGxhY2UtaXRlbXM6Y2VudGVyO2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MThweH0KLm1jYXJkIC5ob3d7Zm9udC1zaXplOjEyLjVweDtjb2xvcjp2YXIoLS1tdXRlZCk7bWFyZ2luOjB9Ci5zdGF0ZXtmb250LXNpemU6MTNweDtmb250LXdlaWdodDo3MDA7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4fQouc3RhdGUub257Y29sb3I6dmFyKC0tb2spfSAuc3RhdGUub2Zme2NvbG9yOnZhcigtLW11dGVkKX0gLnN0YXRlLmVycntjb2xvcjp2YXIoLS1sb2NrKX0KLnN0YXRlIGl7d2lkdGg6OHB4O2hlaWdodDo4cHg7Ym9yZGVyLXJhZGl1czo1MCU7YmFja2dyb3VuZDpjdXJyZW50Q29sb3I7ZGlzcGxheTppbmxpbmUtYmxvY2t9Ci5jb3B5e2Rpc3BsYXk6ZmxleDtnYXA6NnB4fQouY29weSBpbnB1dHtmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6MTEuNXB4fQouZ3JpZDJ7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczoxZnIgMWZyO2dhcDoyMHB4O21hcmdpbi10b3A6MjBweH0KLnJ1bGV7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczphdXRvIDFmcjtnYXA6MTRweDthbGlnbi1pdGVtczpjZW50ZXI7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlMik7Ym9yZGVyOjFweCBkYXNoZWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czoxNnB4O3BhZGRpbmc6MTJweCAxNHB4fQoucnVsZSBzdmd7d2lkdGg6MTEwcHg7aGVpZ2h0OmF1dG99Ci5ydWxlIHB7bWFyZ2luOjA7Zm9udC1zaXplOjEzLjVweDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5ydWxlIGJ7Y29sb3I6dmFyKC0taW5rKX0KLmFkZHJvd3tkaXNwbGF5OmdyaWQ7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmciAxNTBweCBhdXRvO2dhcDo4cHg7YWxpZ24taXRlbXM6c3RhcnR9Ci50YWdze2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6OHB4O21heC1oZWlnaHQ6MjYwcHg7b3ZlcmZsb3c6YXV0b30KLnRhZ3tkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4O2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayk7Ym9yZGVyLXJhZGl1czoxMHB4O3BhZGRpbmc6NHB4IDRweCA0cHggMTBweDtmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6MTIuNXB4O2ZvbnQtd2VpZ2h0OjcwMH0KLnRhZyBzbWFsbHtmb250LWZhbWlseTp2YXIoLS1ib2R5KTtmb250LXdlaWdodDo2MDA7b3BhY2l0eTouOH0KLnRhZyBidXR0b257Ym9yZGVyOjA7YmFja2dyb3VuZDp0cmFuc3BhcmVudDtjb2xvcjppbmhlcml0O3dpZHRoOjI0cHg7aGVpZ2h0OjI0cHg7Ym9yZGVyLXJhZGl1czo2cHg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcn0KLnRhZyBidXR0b246aG92ZXJ7YmFja2dyb3VuZDpjb2xvci1taXgoaW4gc3JnYix2YXIoLS1sb2NrKSAxOCUsdHJhbnNwYXJlbnQpfQouc3RhY2t7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MTJweH0KLnJvd3tkaXNwbGF5OmZsZXg7Z2FwOjEwcHg7ZmxleC13cmFwOndyYXA7YWxpZ24taXRlbXM6ZW5kfQoucm93ID4gKntmbGV4OjE7bWluLXdpZHRoOjE1MHB4fQoKLyogbG9naW4gKi8KLmxvZ2lue21pbi1oZWlnaHQ6MTAwdmg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtwYWRkaW5nOjIwcHh9Ci5sb2dpbiAuY2FyZHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czoyNnB4O2JveC1zaGFkb3c6dmFyKC0tc2hhZG93KTt3aWR0aDoxMDAlO21heC13aWR0aDo0MjBweDtvdmVyZmxvdzpoaWRkZW59Ci5sb2dpbiAuYXJ0e2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDEzNWRlZyx2YXIoLS1iZzIpLHZhcigtLWljZSkpO3BhZGRpbmc6MjJweCAyNHB4IDhweH0KLmxvZ2luIC5hcnQgc3Zne3dpZHRoOjEwMCU7aGVpZ2h0OmF1dG99Ci5sb2dpbiBmb3Jte3BhZGRpbmc6MjJweCAyNHB4IDI2cHg7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MTJweH0KLmxvZ2luIGgxe2ZvbnQtc2l6ZTozMHB4O2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQouZXJye2NvbG9yOnZhcigtLWxvY2spO2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTMuNXB4O21pbi1oZWlnaHQ6MS4yZW19Ci5kZW1vLWhpbnR7Zm9udC1zaXplOjEyLjVweDtiYWNrZ3JvdW5kOnZhcigtLXdhcm4tYmcpO2NvbG9yOnZhcigtLXdhcm4pO3BhZGRpbmc6OHB4IDEycHg7Ym9yZGVyLXJhZGl1czoxMnB4fQoKLnRvYXN0e3Bvc2l0aW9uOmZpeGVkO2xlZnQ6NTAlO2JvdHRvbToyMnB4O3RyYW5zZm9ybTp0cmFuc2xhdGVYKC01MCUpO2JhY2tncm91bmQ6dmFyKC0taW5rKTtjb2xvcjp2YXIoLS1iZyk7cGFkZGluZzoxMHB4IDE4cHg7Ym9yZGVyLXJhZGl1czoxMnB4O2ZvbnQtd2VpZ2h0OjcwMDt6LWluZGV4OjYwO21heC13aWR0aDpjYWxjKDEwMCUgLSAzMnB4KX0KLm1vZGFse3Bvc2l0aW9uOmZpeGVkO2luc2V0OjA7ei1pbmRleDo1MDtiYWNrZ3JvdW5kOnJnYmEoNiwzMCw0OCwuNTUpO2Rpc3BsYXk6Z3JpZDtwbGFjZS1pdGVtczpjZW50ZXI7cGFkZGluZzoxNnB4fQouc2hlZXR7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXItcmFkaXVzOjIycHg7bWF4LXdpZHRoOjUyMHB4O3dpZHRoOjEwMCU7cGFkZGluZzoyMHB4O2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjEycHh9CgpAbWVkaWEgKG1heC13aWR0aDo5ODBweCl7CiAgLmhlcm8sLmdyaWQye2dyaWQtdGVtcGxhdGUtY29sdW1uczoxZnJ9CiAgLmhlcm8gc3Zne2Rpc3BsYXk6bm9uZX0KICAua3Bpc3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDIsMWZyKX0KICAuY29ubntncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyfQp9CkBtZWRpYSAobWF4LXdpZHRoOjUyMHB4KXsKICAud3JhcHtwYWRkaW5nLWlubGluZToxNnB4fQogIC5hZGRyb3d7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmcn0KICAucnVsZXtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyfQogIC51c2VyIHNtYWxse2Rpc3BsYXk6bm9uZX0KfQpAbWVkaWEgKHByZWZlcnMtcmVkdWNlZC1tb3Rpb246bm8tcHJlZmVyZW5jZSl7CiAgLnRydWNre2FuaW1hdGlvbjpkcml2ZSA2cyBlYXNlLWluLW91dCBpbmZpbml0ZX0KICBAa2V5ZnJhbWVzIGRyaXZlezAlLDEwMCV7dHJhbnNmb3JtOnRyYW5zbGF0ZVgoMCl9NTAle3RyYW5zZm9ybTp0cmFuc2xhdGVYKDE2cHgpfX0KfQouZ3JpZDIgPiAqe21pbi13aWR0aDowfQovKiBiYW5kZWphIG51ZXZhICovCi50YWJzYmlne2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDYsMWZyKTtnYXA6MTBweDttYXJnaW4tYm90dG9tOjE2cHh9Ci50YntkaXNwbGF5OmZsZXg7Z2FwOjEycHg7YWxpZ24taXRlbXM6Y2VudGVyO3RleHQtYWxpZ246bGVmdDtib3JkZXI6MnB4IHNvbGlkIHZhcigtLWxpbmUpO2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyLXJhZGl1czoxOHB4O3BhZGRpbmc6MTRweCAxNnB4O2NvbG9yOnZhcigtLWluayl9Ci50YiAudGItaWN7d2lkdGg6NDRweDtoZWlnaHQ6NDRweDtib3JkZXItcmFkaXVzOjEycHg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtmbGV4Om5vbmV9Ci50YiAudGItaWMgc3Zne3dpZHRoOjIycHg7aGVpZ2h0OjIycHh9Ci50YiBie2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtc2l6ZTozMHB4O2xpbmUtaGVpZ2h0OjE7ZGlzcGxheTpibG9jaztmb250LXZhcmlhbnQtbnVtZXJpYzp0YWJ1bGFyLW51bXN9Ci50YiAudGItbntmb250LXdlaWdodDo4MDA7ZGlzcGxheTpibG9ja30KLnRiIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTJweDtkaXNwbGF5OmJsb2NrO2xpbmUtaGVpZ2h0OjEuMn0KLnRiLXJlYWR5IC50Yi1pY3tiYWNrZ3JvdW5kOnZhcigtLWljZSk7Y29sb3I6dmFyKC0tYWNjZW50LXN0cm9uZyl9Ci50Yi13YWl0aW5nIC50Yi1pY3tiYWNrZ3JvdW5kOnZhcigtLXdhcm4tYmcpO2NvbG9yOnZhcigtLXdhcm4pfQoudGItcHJpbnRlZCAudGItaWN7YmFja2dyb3VuZDp2YXIoLS1vay1iZyk7Y29sb3I6dmFyKC0tb2spfQoudGItYmxvY2tlZCAudGItaWN7YmFja2dyb3VuZDp2YXIoLS1sb2NrLWJnKTtjb2xvcjp2YXIoLS1sb2NrKX0KLnRiW2FyaWEtcHJlc3NlZD0idHJ1ZSJde2JvcmRlci1jb2xvcjp2YXIoLS1hY2NlbnQpO2JveC1zaGFkb3c6MCAwIDAgM3B4IGNvbG9yLW1peChpbiBzcmdiLHZhcigtLWFjY2VudCkgMjIlLHRyYW5zcGFyZW50KX0KLnRiLXJlYWR5W2FyaWEtcHJlc3NlZD0idHJ1ZSJde2JhY2tncm91bmQ6Y29sb3ItbWl4KGluIHNyZ2IsdmFyKC0taWNlKSA0NSUsdmFyKC0tc3VyZmFjZSkpfQouY2hpcCAuY250e2Rpc3BsYXk6aW5saW5lLWJsb2NrO21pbi13aWR0aDoyMHB4O3BhZGRpbmc6MCA2cHg7Ym9yZGVyLXJhZGl1czo5OTlweDtiYWNrZ3JvdW5kOmNvbG9yLW1peChpbiBzcmdiLGN1cnJlbnRDb2xvciAxNSUsdHJhbnNwYXJlbnQpO2ZvbnQtc2l6ZToxMS41cHg7bWFyZ2luLWxlZnQ6NHB4fQouYWN0aW9uYmFye2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6MTBweDthbGlnbi1pdGVtczpjZW50ZXI7cGFkZGluZzoxMnB4IDIwcHg7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tbGluZSk7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlMil9Ci5kYXloZWFke3BhZGRpbmc6MTBweCAyMHB4O2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MTNweDt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7bGV0dGVyLXNwYWNpbmc6LjA2ZW07Y29sb3I6dmFyKC0tYWNjZW50LXN0cm9uZyk7YmFja2dyb3VuZDp2YXIoLS1iZyk7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tbGluZSl9Ci5vcm93e2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MzRweCAxMTBweCAxZnIgYXV0bztnYXA6MTRweDthbGlnbi1pdGVtczpjZW50ZXI7cGFkZGluZzoxMnB4IDIwcHg7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tbGluZSl9Ci5vcm93LnN0LXByaW50ZWR7b3BhY2l0eTouOH0KLm9yb3cuc3QtYmxvY2tlZHtiYWNrZ3JvdW5kOmNvbG9yLW1peChpbiBzcmdiLHZhcigtLWxvY2stYmcpIDQ1JSx0cmFuc3BhcmVudCl9Ci5vYy10aW1le2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjRweDthbGlnbi1pdGVtczpmbGV4LXN0YXJ0fQoub2MtdGltZSBie2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZToxOHB4fQoub2MtdG9we2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6OHB4O2FsaWduLWl0ZW1zOmJhc2VsaW5lO21hcmdpbi1ib3R0b206MnB4fQouY3VzdHtmb250LXdlaWdodDo4MDA7Zm9udC1zaXplOjE1LjVweH0KLmN1c3Q6OmFmdGVye2NvbnRlbnQ6IsK3IjttYXJnaW4tbGVmdDo4cHg7Y29sb3I6dmFyKC0tbXV0ZWQpfQoub2MtYWN0e2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47YWxpZ24taXRlbXM6ZmxleC1lbmQ7Z2FwOjhweH0KLm9yb3cuaXMtbmV3e2FuaW1hdGlvbjpmbGFzaCAyLjVzIGVhc2Utb3V0fQpAbWVkaWEgKG1heC13aWR0aDo4MjBweCl7CiAgLnRhYnNiaWd7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgyLDFmcil9CiAgLm9yb3d7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjI4cHggMWZyO30KICAub3JvdyAub2MtdGltZXtmbGV4LWRpcmVjdGlvbjpyb3c7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo4cHh9CiAgLm9yb3cgLm9jLW1haW4sLm9yb3cgLm9jLWFjdHtncmlkLWNvbHVtbjoyfQogIC5vYy1hY3R7YWxpZ24taXRlbXM6ZmxleC1zdGFydH0KfQoKLyogaW1wcmVzYXMgZW4gcm9qbyAoY29tbyBNZXJjYWRvIExpYnJlKSwgYmxvcXVlYWRhcyBlbiBncmlzICovCi50Yi1wcmludGVkIC50Yi1pY3tiYWNrZ3JvdW5kOnZhcigtLWxvY2stYmcpO2NvbG9yOnZhcigtLWxvY2spfQoudGItYmxvY2tlZCAudGItaWN7YmFja2dyb3VuZDojRTNFN0VDO2NvbG9yOiM0QTU1NjN9Ci5vcm93LnN0LXByaW50ZWR7b3BhY2l0eToxO2JhY2tncm91bmQ6I0ZGRjdGOH0KLm9yb3cuc3QtYmxvY2tlZHtiYWNrZ3JvdW5kOiNGM0Y1Rjd9Ci5vcm93LnN0LWJsb2NrZWQgLmxvY2tjZWxse2NvbG9yOiM0QTU1NjN9Ci5idG4tcmVwcmludHtiYWNrZ3JvdW5kOnZhcigtLWxvY2spO2NvbG9yOiNmZmZ9Ci5idG4tcmVwcmludDpob3ZlcntmaWx0ZXI6YnJpZ2h0bmVzcyguOTIpfQoKLnBpbGwuc2hpcHBlZHtiYWNrZ3JvdW5kOiNFM0U3RUM7Y29sb3I6IzM0NDE0Rn0KLm9yb3cuc3Qtc2hpcHBlZHtiYWNrZ3JvdW5kOiNGQUZCRkN9CgoudGItdG9kYXkgLnRiLWlje2JhY2tncm91bmQ6dmFyKC0taWNlKTtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KLnRiLXVwY29taW5nIC50Yi1pY3tiYWNrZ3JvdW5kOiNFREU5RkU7Y29sb3I6IzZEMjhEOX0KLnRiLXRvZGF5W2FyaWEtcHJlc3NlZD0idHJ1ZSJde2JhY2tncm91bmQ6Y29sb3ItbWl4KGluIHNyZ2IsdmFyKC0taWNlKSA0NSUsdmFyKC0tc3VyZmFjZSkpfQouc2hpcHR5cGV7Zm9udC1zaXplOjExcHg7Zm9udC13ZWlnaHQ6ODAwO3BhZGRpbmc6MnB4IDhweDtib3JkZXItcmFkaXVzOjZweDtiYWNrZ3JvdW5kOiNFRUYyRjY7Y29sb3I6IzM0NDE0Rn0KLnNoaXB0eXBlLnN0LWZsZXh7YmFja2dyb3VuZDojMTZBMzRBO2NvbG9yOiNmZmZ9Ci5zaGlwdHlwZS5zdC1jb2xlY3Rhe2JhY2tncm91bmQ6I0RCRUFGRTtjb2xvcjojMUU0MEFGfQouc2hpcHR5cGUuc3QtYWdlbmNpYXtiYWNrZ3JvdW5kOiNGRUYzQzc7Y29sb3I6IzkyNDAwRX0KLmRpc3BhdGNoe2Rpc3BsYXk6aW5saW5lLWJsb2NrO2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MTIuNXB4O2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpO2JhY2tncm91bmQ6dmFyKC0taWNlKTtib3JkZXItcmFkaXVzOjhweDtwYWRkaW5nOjJweCA4cHg7bWFyZ2luLWJvdHRvbTo0cHh9Ci5kaXNwYXRjaC5sYXRle2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayl9CkBtZWRpYSAobWF4LXdpZHRoOjExMDBweCl7LnRhYnNiaWd7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgzLDFmcil9fQpAbWVkaWEgKG1heC13aWR0aDo2NDBweCl7LnRhYnNiaWd7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgyLDFmcil9fQoKLmJsb2Nrbm97ZGlzcGxheTppbmxpbmUtYmxvY2s7YmFja2dyb3VuZDp2YXIoLS1pbmspO2NvbG9yOiNmZmY7Zm9udC13ZWlnaHQ6ODAwO2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2JvcmRlci1yYWRpdXM6OHB4O3BhZGRpbmc6MnB4IDlweDttYXJnaW4tcmlnaHQ6OHB4O2ZvbnQtc2l6ZToxNHB4fQouaXRlbXMgZW0uZmFsdGF7Zm9udC1zdHlsZTpub3JtYWw7YmFja2dyb3VuZDp2YXIoLS1sb2NrKTtjb2xvcjojZmZmO2JvcmRlci1yYWRpdXM6NXB4O3BhZGRpbmc6MCA1cHg7Zm9udC1zaXplOjExcHg7Zm9udC13ZWlnaHQ6ODAwO2xldHRlci1zcGFjaW5nOi4wNGVtfQoKLml0ZW1zIC5nb29ke2NvbG9yOnZhcigtLW9rKTtmb250LXdlaWdodDo3MDB9Ci5pdGVtcyBlbS50aWVuZXtmb250LXN0eWxlOm5vcm1hbDtiYWNrZ3JvdW5kOnZhcigtLW9rKTtjb2xvcjojZmZmO2JvcmRlci1yYWRpdXM6NXB4O3BhZGRpbmc6MCA1cHg7Zm9udC1zaXplOjExcHg7Zm9udC13ZWlnaHQ6ODAwO2xldHRlci1zcGFjaW5nOi4wNGVtfQoubm9wcmludHtkaXNwbGF5OmJsb2NrO21hcmdpbi10b3A6NnB4O2ZvbnQtd2VpZ2h0OjkwMDtjb2xvcjp2YXIoLS1pbmspO2ZvbnQtc2l6ZToxNXB4O2xldHRlci1zcGFjaW5nOi4wMmVtfQoKLyogVmVudGFzICovCi5zYWxlcy1rcGlze2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MS42ZnIgcmVwZWF0KDQsMWZyKTtnYXA6MTJweDttYXJnaW4tYm90dG9tOjE2cHh9Ci5rcGl7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTZweDtwYWRkaW5nOjE0cHggMTZweDtkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDo0cHg7Ym94LXNoYWRvdzp2YXIoLS1zaGFkb3cpfQoua3BpIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXdlaWdodDo3MDA7Zm9udC1zaXplOjEyLjVweDtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo2cHh9Ci5rcGkgYntmb250LWZhbWlseTp2YXIoLS1kaXNwbGF5KTtmb250LXNpemU6MjRweDtjb2xvcjp2YXIoLS1pbmspO2xpbmUtaGVpZ2h0OjEuMX0KLmtwaSBzcGFue2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTNweH0KLmtwaS1oZXJve2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDEzNWRlZywjRTNGNEZELCNmZmYpO2JvcmRlci1jb2xvcjp2YXIoLS1pY2UpfQoua3BpLWhlcm8gYntmb250LXNpemU6MzRweDtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KLmtwaS1oZXJvIHNwYW57Y29sb3I6dmFyKC0tb2spO2ZvbnQtd2VpZ2h0OjcwMH0KLmRvdHtkaXNwbGF5OmlubGluZS1ibG9jazt3aWR0aDoxMXB4O2hlaWdodDoxMXB4O2JvcmRlci1yYWRpdXM6M3B4O3ZlcnRpY2FsLWFsaWduOi0xcHg7bWFyZ2luLXJpZ2h0OjZweH0KLmxlZ2VuZHtkaXNwbGF5OmZsZXg7Z2FwOjE0cHg7ZmxleC13cmFwOndyYXA7Zm9udC1zaXplOjEzcHg7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOnZhcigtLWluayl9Ci5jaGFydHt3aWR0aDoxMDAlO2hlaWdodDphdXRvO2Rpc3BsYXk6YmxvY2t9Ci5jaGFydCAuY2gtYXh7Zm9udC1zaXplOjExcHg7ZmlsbDp2YXIoLS1tdXRlZCl9Ci5jaGFydCAuY2gtdmFse2ZvbnQtc2l6ZToxMnB4O2ZvbnQtd2VpZ2h0OjcwMDtmaWxsOnZhcigtLWluayl9Ci5jaGFydCAuY2gtZGF5e2ZvbnQtc2l6ZToxMnB4O2ZpbGw6dmFyKC0tbXV0ZWQpfQouY2hhcnQgLmNoLXRvZGF5e2ZpbGw6dmFyKC0tYWNjZW50LXN0cm9uZyk7Zm9udC13ZWlnaHQ6ODAwfQouY2hhcnQgLmNoLWhpdHtjdXJzb3I6cG9pbnRlcn0KLmNoYXJ0IC5jaC1oaXQ6aG92ZXJ7ZmlsbDpyZ2JhKDIyLDE0NywyMTEsLjA3KX0KLnNhbGVzLWdyaWR7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoMywxZnIpO2dhcDoxNHB4O21hcmdpbi10b3A6MTRweH0KLnNhbGVzLW1rIC5wYW5lbC1oZWFkIGgye2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXJ9Ci5jaC10aXB7cG9zaXRpb246Zml4ZWQ7ei1pbmRleDo1MDtiYWNrZ3JvdW5kOnZhcigtLWluayk7Y29sb3I6I2ZmZjtib3JkZXItcmFkaXVzOjEwcHg7cGFkZGluZzo4cHggMTFweDtmb250LXNpemU6MTIuNXB4O2xpbmUtaGVpZ2h0OjEuNTtwb2ludGVyLWV2ZW50czpub25lO2JveC1zaGFkb3c6dmFyKC0tc2hhZG93KTttYXgtd2lkdGg6MjgwcHh9Ci5jaC10aXAgYntkaXNwbGF5OmJsb2NrO21hcmdpbi1ib3R0b206MnB4O3RleHQtdHJhbnNmb3JtOmNhcGl0YWxpemV9Ci5jaC10YWJsZXttYXJnaW4tdG9wOjEwcHh9Ci5jaC10YWJsZSBzdW1tYXJ5e2N1cnNvcjpwb2ludGVyO2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpO2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTNweH0KQG1lZGlhIChtYXgtd2lkdGg6MTAwMHB4KXsuc2FsZXMta3Bpc3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDIsMWZyKX0ua3BpLWhlcm97Z3JpZC1jb2x1bW46MS8tMX0uc2FsZXMtZ3JpZHtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyfX0KLmNoYXJ0e3dpZHRoOjEwMCU7bWF4LXdpZHRoOjEwMCU7aGVpZ2h0OmF1dG99Ci5jaC1zbG90e3dpZHRoOjEwMCV9CgoucHAtd2Vla3tkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6OHB4O2ZvbnQtc2l6ZToxNHB4fQoucHAtdGFibGUgdGgubnVtLC5wcC10YWJsZSB0ZC5udW17dGV4dC1hbGlnbjpyaWdodDt3aGl0ZS1zcGFjZTpub3dyYXB9Ci5wcC10YWJsZSB0aCBzbWFsbHtkaXNwbGF5OmJsb2NrO2ZvbnQtd2VpZ2h0OjYwMDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5wcC10YWJsZSAucHAtbmFtZXtkaXNwbGF5OmJsb2NrO2ZvbnQtd2VpZ2h0OjcwMDtjb2xvcjp2YXIoLS1vayl9Ci5wcC10YWJsZSB0ZCBzbWFsbHtkaXNwbGF5OmJsb2NrfQoucHAtdGFibGUgLnplcm97Y29sb3I6dmFyKC0tbGluZSl9Ci5wcC10YWJsZSAucHAtdG90YWx7Zm9udC13ZWlnaHQ6ODAwO2ZvbnQtc2l6ZToxNXB4O2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQoucHAtdGFibGUgdGZvb3QgdGR7Ym9yZGVyLXRvcDoycHggc29saWQgdmFyKC0tbGluZSk7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlMil9Ci5wcC1ub3Rle2JhY2tncm91bmQ6dmFyKC0td2Fybi1iZyk7Y29sb3I6dmFyKC0td2Fybik7Ym9yZGVyLXJhZGl1czoxMHB4O3BhZGRpbmc6OHB4IDEycHg7Zm9udC1zaXplOjEzcHg7Zm9udC13ZWlnaHQ6NjAwO21hcmdpbjowIDAgMTBweH0KCi5wcC10YWJsZSAucHAtY2Fue2N1cnNvcjpwb2ludGVyfQoucHAtdGFibGUgLnBwLWNhbjpob3ZlciB0ZHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKX0KLnBwLXRhYmxlIC5wcC1hcnJvd3tkaXNwbGF5OmlubGluZS1ibG9jazt3aWR0aDoxNnB4O2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpO2ZvbnQtd2VpZ2h0OjkwMH0KLnBwLXRhYmxlIC5wcC1wdWIgLnBwLW5hbWV7ZGlzcGxheTppbmxpbmV9Ci5wcC10YWJsZSAucHAtc3Vie2Rpc3BsYXk6YmxvY2s7bWFyZ2luLWxlZnQ6MTZweH0KLnBwLXRhYmxlIC5wcC12YXIgdGR7YmFja2dyb3VuZDojRjdGQkZFO2ZvbnQtc2l6ZToxM3B4fQoucHAtdGFibGUgLnBwLXZuYW1le2Rpc3BsYXk6YmxvY2s7cGFkZGluZy1sZWZ0OjM0cHg7Y29sb3I6dmFyKC0tb2spO2ZvbnQtd2VpZ2h0OjYwMH0KLnBwLXRhYmxlIC5wcC12YXIgLnBwLXRvdGFse2ZvbnQtc2l6ZToxM3B4fQoudGItdW5ibG9ja2VkIC50Yi1pY3tiYWNrZ3JvdW5kOnZhcigtLXdhcm4tYmcpO2NvbG9yOnZhcigtLXdhcm4pfQpAbWVkaWEgKG1heC13aWR0aDoxMjgwcHgpey50YWJzYmlnIC50YiBzbWFsbHtkaXNwbGF5Om5vbmV9fQoKLyogUHJvZHVjdG9zIHZlbmRpZG9zIChzaW4gcHJlY2lvcykgKi8KLnV2LWtwaXN7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczoxLjNmciAxZnIgMWZyIDEuNmZyO2dhcDoxMnB4O21hcmdpbi1ib3R0b206MTJweH0KLnV2LW1re2Rpc3BsYXk6ZmxleDtnYXA6MThweDtmbGV4LXdyYXA6d3JhcDtmb250LXNpemU6MTRweDttYXJnaW46NHB4IDJweCAxNHB4O2NvbG9yOnZhcigtLWluayl9Ci51di1tayBzbWFsbHtjb2xvcjp2YXIoLS1tdXRlZCl9Ci51di1jYXJke21hcmdpbi1ib3R0b206MTRweH0KLnV2LWdyaWR7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczoxLjRmciAxZnI7Z2FwOjE0cHh9Ci51di1ncmlkID4gLnV2LWNhcmQ6b25seS1jaGlsZHtncmlkLWNvbHVtbjoxLy0xfQoudXYtaHtmb250LWZhbWlseTp2YXIoLS1kaXNwbGF5KTtmb250LXNpemU6MjBweDttYXJnaW46NnB4IDAgMTBweDtjb2xvcjp2YXIoLS1pbmspfQoudXYtaCBzbWFsbHtmb250LWZhbWlseTp2YXIoLS1ib2R5KTtmb250LXNpemU6MTNweDtjb2xvcjp2YXIoLS1tdXRlZCk7Zm9udC13ZWlnaHQ6NjAwO21hcmdpbi1sZWZ0OjhweH0KLmhie2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6bWlubWF4KDAsMS4zZnIpIG1pbm1heCgwLDFmcikgYXV0bztnYXA6MTJweDthbGlnbi1pdGVtczpjZW50ZXI7cGFkZGluZzo3cHggMDtib3JkZXItYm90dG9tOjFweCBkYXNoZWQgdmFyKC0tbGluZSl9Ci5oYjpsYXN0LWNoaWxke2JvcmRlci1ib3R0b206MH0KLmhiLWx7bWluLXdpZHRoOjB9Ci5oYi1uYW1le2Rpc3BsYXk6YmxvY2s7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOnZhcigtLWluayk7Zm9udC1zaXplOjEzLjVweDt3aGl0ZS1zcGFjZTpub3dyYXA7b3ZlcmZsb3c6aGlkZGVuO3RleHQtb3ZlcmZsb3c6ZWxsaXBzaXN9Ci5oYi1sIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTJweH0KLmhiLXRyYWNre2hlaWdodDoxMnB4O2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZTIpO2JvcmRlci1yYWRpdXM6NnB4O292ZXJmbG93OmhpZGRlbn0KLmhiLXRyYWNrIGl7ZGlzcGxheTpibG9jaztoZWlnaHQ6MTAwJTtib3JkZXItcmFkaXVzOjZweH0KLmhiLXZ7Zm9udC1zaXplOjE1cHg7Y29sb3I6dmFyKC0taW5rKTttaW4td2lkdGg6MzhweDt0ZXh0LWFsaWduOnJpZ2h0fQoucmt7Zm9udC1zdHlsZTpub3JtYWw7ZGlzcGxheTppbmxpbmUtZ3JpZDtwbGFjZS1pdGVtczpjZW50ZXI7d2lkdGg6MjBweDtoZWlnaHQ6MjBweDtib3JkZXItcmFkaXVzOjZweDtiYWNrZ3JvdW5kOnZhcigtLWljZSk7Y29sb3I6dmFyKC0tYWNjZW50LXN0cm9uZyk7Zm9udC1zaXplOjExLjVweDtmb250LXdlaWdodDo4MDA7bWFyZ2luLXJpZ2h0OjZweH0KQG1lZGlhIChtYXgtd2lkdGg6MTAwMHB4KXsudXYta3Bpc3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDIsMWZyKX0udXYtZ3JpZHtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyfX0KCi8qIFJlc3VtZW4gZGUgZW52w61vcyB5IDggc2VjY2lvbmVzICovCi50YWJzYmlne2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoNCwxZnIpfQoudGItd2VlayAudGItaWN7YmFja2dyb3VuZDp2YXIoLS1vay1iZyk7Y29sb3I6dmFyKC0tb2spfQoudGItYmxvY2tlZFByaW50ZWQgLnRiLWlje2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayl9Ci5zaGlwLXN1bXttYXJnaW4tYm90dG9tOjE0cHh9Ci5zcy10aWxlc3tkaXNwbGF5OmdyaWQ7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCg1LDFmcik7Z2FwOjEwcHg7bWFyZ2luLWJvdHRvbToxMnB4fQouc3MtdGlsZXtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1sZWZ0OjVweCBzb2xpZCB2YXIoLS1jKTtib3JkZXItcmFkaXVzOjEycHg7cGFkZGluZzoxMHB4IDEycHg7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKX0KLnNzLXRpbGUgc21hbGx7ZGlzcGxheTpibG9jaztjb2xvcjp2YXIoLS1tdXRlZCk7Zm9udC13ZWlnaHQ6NzAwO2ZvbnQtc2l6ZToxMi41cHh9Ci5zcy10aWxlIGJ7Zm9udC1mYW1pbHk6dmFyKC0tZGlzcGxheSk7Zm9udC1zaXplOjI4cHg7Y29sb3I6dmFyKC0taW5rKTtsaW5lLWhlaWdodDoxLjF9Ci5zcy10b3RhbHstLWM6dmFyKC0tYWNjZW50LXN0cm9uZyk7YmFja2dyb3VuZDpsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCNFM0Y0RkQsI2ZmZil9Ci5zcy10b3RhbCBie2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQouc3MtdGFibGUgdGQubnVtLC5zcy10YWJsZSB0aC5udW17dGV4dC1hbGlnbjpyaWdodH0KLnNzLXRhYmxlIC56ZXJve2NvbG9yOnZhcigtLWxpbmUpfQouc3MtdGFibGUgdGZvb3QgdGR7Ym9yZGVyLXRvcDoycHggc29saWQgdmFyKC0tbGluZSk7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlMil9CkBtZWRpYSAobWF4LXdpZHRoOjgwMHB4KXsuc3MtdGlsZXN7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgyLDFmcil9LnNzLXRvdGFse2dyaWQtY29sdW1uOjEvLTF9LnRhYnNiaWd7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgyLDFmcil9fQouZGlzcGF0Y2guZG9uZXtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKTtjb2xvcjp2YXIoLS1tdXRlZCk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKX0KLnNzLWN1dHtkaXNwbGF5OmJsb2NrO2ZvbnQtc2l6ZToxMi41cHg7Y29sb3I6dmFyKC0taW5rKTttYXJnaW4tdG9wOjJweH0KLnNzLWN1dCBzdHJvbmd7Y29sb3I6dmFyKC0tbG9jayl9Ci5zcy1jdXQgc21hbGx7Y29sb3I6dmFyKC0tbXV0ZWQpfQouc3MtY3V0Lm11dGVke2NvbG9yOnZhcigtLW11dGVkKX0KLnNzLWN1dCBzdHJvbmd7d2hpdGUtc3BhY2U6bm93cmFwfQoKLyogUmVzdW1lbiBkZSBlbnbDrW9zIGNvbXBhY3RvICovCi5zaGlwLXN1bXttYXJnaW46MCAwIDEycHg7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTJweDtwYWRkaW5nOjZweCAxMnB4fQouc3N4e2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7ZmxleC13cmFwOndyYXA7Z2FwOjZweCAxNnB4O2ZvbnQtc2l6ZToxM3B4O2NvbG9yOnZhcigtLWluayl9Ci5zc3gtdHtmb250LXdlaWdodDo4MDB9Ci5zc3gtaXtkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmJhc2VsaW5lO2dhcDo1cHg7d2hpdGUtc3BhY2U6bm93cmFwfQouc3N4LWkgaXt3aWR0aDo5cHg7aGVpZ2h0OjlweDtib3JkZXItcmFkaXVzOjNweDtiYWNrZ3JvdW5kOnZhcigtLWMpO2Rpc3BsYXk6aW5saW5lLWJsb2NrO2FsaWduLXNlbGY6Y2VudGVyfQouc3N4LWkgYntmb250LXNpemU6MTRweH0KLnNzeC1pIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTEuNXB4fQouc3N4LXRvdCBie2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQouc3N4LXN3e2Rpc3BsYXk6aW5saW5lLWZsZXg7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjhweDtvdmVyZmxvdzpoaWRkZW59Ci5zc3gtc3cgYnV0dG9ue2JvcmRlcjowO2JhY2tncm91bmQ6dHJhbnNwYXJlbnQ7cGFkZGluZzozcHggOXB4O2ZvbnQ6aW5oZXJpdDtmb250LXNpemU6MTJweDtmb250LXdlaWdodDo3MDA7Y29sb3I6dmFyKC0tbXV0ZWQpO2N1cnNvcjpwb2ludGVyfQouc3N4LXN3IGJ1dHRvblthcmlhLXByZXNzZWQ9InRydWUiXXtiYWNrZ3JvdW5kOnZhcigtLWFjY2VudCk7Y29sb3I6I2ZmZn0KLnNzeC1kZXQgc3VtbWFyeXtjdXJzb3I6cG9pbnRlcjtmb250LXNpemU6MTJweDtmb250LXdlaWdodDo3MDA7Y29sb3I6dmFyKC0tYWNjZW50LXN0cm9uZyk7bWFyZ2luLXRvcDoycHh9Ci5zc3gtZGV0IC5zcy10YWJsZXtmb250LXNpemU6MTIuNXB4O21hcmdpbi10b3A6NnB4fQouc3N4LWRldCAuc3MtdGFibGUgdGQsLnNzeC1kZXQgLnNzLXRhYmxlIHRoe3BhZGRpbmc6NHB4IDhweH0KLnNzeC1tb3Jle2JvcmRlcjowO2JhY2tncm91bmQ6bm9uZTtmb250OmluaGVyaXQ7Zm9udC1zaXplOjEycHg7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpO2N1cnNvcjpwb2ludGVyO3BhZGRpbmc6MnB4IDRweH0KLnNzeHtnYXA6NHB4IDE0cHh9Ci5zc3gtcnttYXJnaW4tbGVmdDphdXRvO2Rpc3BsYXk6aW5saW5lLWZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo4cHg7d2hpdGUtc3BhY2U6bm93cmFwfQouc3N4e2ZvbnQtc2l6ZToxMi41cHg7Z2FwOjRweCAxMnB4fQouc3N4LWFsbHtwYWRkaW5nLWxlZnQ6MTBweDtib3JkZXItbGVmdDoxcHggc29saWQgdmFyKC0tbGluZSk7Y29sb3I6dmFyKC0tbXV0ZWQpfQouc3N4LWFsbCBie2NvbG9yOnZhcigtLWluayl9Ci5zcy1zdW0gdGR7Ym9yZGVyLXRvcDoycHggc29saWQgdmFyKC0tbGluZSl9Ci8qIGZpbHRybyBkZSB2ZW5kZWRvcmVzIGNvbiBzZWxlY2Npw7NuIG3Dumx0aXBsZSAqLwoubXNlbHtwb3NpdGlvbjpyZWxhdGl2ZX0KLm1zZWwtYnRue2ZvbnQ6aW5oZXJpdDtjb2xvcjp2YXIoLS1pbmspO2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZTIpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czoxMnB4O3BhZGRpbmc6OHB4IDM0cHggOHB4IDEycHg7Y3Vyc29yOnBvaW50ZXI7d2hpdGUtc3BhY2U6bm93cmFwO3Bvc2l0aW9uOnJlbGF0aXZlO21pbi13aWR0aDoyMDBweDt0ZXh0LWFsaWduOmxlZnR9Ci5tc2VsLWJ0bjo6YWZ0ZXJ7Y29udGVudDonJztwb3NpdGlvbjphYnNvbHV0ZTtyaWdodDoxM3B4O3RvcDo1MCU7d2lkdGg6N3B4O2hlaWdodDo3cHg7Ym9yZGVyLXJpZ2h0OjJweCBzb2xpZCBjdXJyZW50Q29sb3I7Ym9yZGVyLWJvdHRvbToycHggc29saWQgY3VycmVudENvbG9yO3RyYW5zZm9ybTp0cmFuc2xhdGVZKC03MCUpIHJvdGF0ZSg0NWRlZyl9Ci5tc2VsLm9uIC5tc2VsLWJ0bntib3JkZXItY29sb3I6dmFyKC0tYWNjZW50KTtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKTtmb250LXdlaWdodDo3MDB9Ci5tc2VsLXBvcHtwb3NpdGlvbjphYnNvbHV0ZTt6LWluZGV4OjMwO3RvcDpjYWxjKDEwMCUgKyA2cHgpO2xlZnQ6MDttaW4td2lkdGg6MjQwcHg7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTJweDtib3gtc2hhZG93OjAgMTBweCAzMHB4IHJnYmEoMCwwLDAsLjE0KTtwYWRkaW5nOjZweH0KLm1zZWwtcG9wIGxhYmVse2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjEwcHg7cGFkZGluZzo4cHggMTBweDtib3JkZXItcmFkaXVzOjhweDtjdXJzb3I6cG9pbnRlcjt3aGl0ZS1zcGFjZTpub3dyYXB9Ci5tc2VsLXBvcCBsYWJlbDpob3ZlcntiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKX0KLm1zZWwtcG9wIGlucHV0e3dpZHRoOjE4cHg7aGVpZ2h0OjE4cHg7YWNjZW50LWNvbG9yOnZhcigtLWFjY2VudCk7bWFyZ2luOjB9Ci5tc2VsLWFsbHtib3JkZXItYm90dG9tOjFweCBzb2xpZCB2YXIoLS1saW5lKTttYXJnaW4tYm90dG9tOjRweDtmb250LXdlaWdodDo3MDB9Ci8qIGZpbHRybyBkZSBCbG9xdWVhZGFzIGltcHJlc2FzICovCi5icGZ7ZGlzcGxheTpmbGV4O2ZsZXgtd3JhcDp3cmFwO2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6OHB4O3BhZGRpbmc6MTBweCAxOHB4O2JvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLWxpbmUpfQouYnBmW2hpZGRlbl17ZGlzcGxheTpub25lfQouYnBmLXR7Zm9udC13ZWlnaHQ6NzAwO2ZvbnQtc2l6ZToxM3B4O2NvbG9yOnZhcigtLW11dGVkKX0KLmNoaXAtZmlsbFthcmlhLXByZXNzZWQ9InRydWUiXXtiYWNrZ3JvdW5kOiMxZjhmNGU7Ym9yZGVyLWNvbG9yOiMxZjhmNGU7Y29sb3I6I2ZmZn0KLndhcm5ib3h7YmFja2dyb3VuZDojZmZmNmUwO2JvcmRlcjoxcHggc29saWQgI2YwZDQ4YTtib3JkZXItcmFkaXVzOjEwcHg7cGFkZGluZzo4cHggMTBweDtjb2xvcjojNmI0ZTAwfQouYnBmLXNlcHt3aWR0aDoxcHg7aGVpZ2h0OjIycHg7YmFja2dyb3VuZDp2YXIoLS1saW5lKTttYXJnaW46MCA2cHh9CgoubGF0ZXRhZ3tkaXNwbGF5OmlubGluZS1ibG9jaztiYWNrZ3JvdW5kOiNmZGUyZTI7Y29sb3I6I2I0MjMxODtmb250LXdlaWdodDo3MDA7Zm9udC1zaXplOjEycHg7Ym9yZGVyLXJhZGl1czo2cHg7cGFkZGluZzoycHggOHB4O21hcmdpbjoycHggMH0KLnRiLWxhdGUgLnRiLWlje2JhY2tncm91bmQ6I2ZkZTJlMjtjb2xvcjojYjQyMzE4fQoKLyogY8OzZGlnb3MgZGUgZGV2b2x1Y2nDs24gTUwgKi8KLnJjb2Rlc3twb3NpdGlvbjpyZWxhdGl2ZTttYXJnaW4tbGVmdDphdXRvO2ZvbnQtc2l6ZToxM3B4fQoucmMtcGlsbHtkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4O2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXItcmFkaXVzOjk5OXB4O3BhZGRpbmc6M3B4IDEwcHg7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtc2l6ZToxMi41cHh9Ci5yYy1waWxsIHN2Z3t3aWR0aDoxNHB4O2hlaWdodDoxNHB4O2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQoucmMtcGlsbCBie2NvbG9yOnZhcigtLWluayl9Ci5yYy1waWxsOmhvdmVye2JvcmRlci1jb2xvcjp2YXIoLS1za3kpfQoucmMtcG9we3Bvc2l0aW9uOmFic29sdXRlO3JpZ2h0OjA7dG9wOmNhbGMoMTAwJSArIDZweCk7ei1pbmRleDozMDttaW4td2lkdGg6MjgwcHg7bWF4LXdpZHRoOm1pbigzNjBweCxjYWxjKDEwMHZ3IC0gMzJweCkpO2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjEycHg7Ym94LXNoYWRvdzp2YXIoLS1zaGFkb3cpO3BhZGRpbmc6OHB4IDEwcHg7ZGlzcGxheTpncmlkO2dhcDoycHh9Ci5yYy1wb3AtaHtmb250LXNpemU6MTEuNXB4O2NvbG9yOnZhcigtLW11dGVkKTtwYWRkaW5nOjJweCAycHggNnB4O2JvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLWxpbmUpO21hcmdpbi1ib3R0b206NHB4fQoucmMtcm93e2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjhweDtwYWRkaW5nOjNweCAycHh9Ci5yYy1yb3cgLnJjLW57ZmxleDoxO2ZvbnQtc2l6ZToxMi41cHh9Ci5yYy1ue2NvbG9yOnZhcigtLW11dGVkKTtmb250LXdlaWdodDo2MDB9Ci5yYy1jb2Rle2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZToxMi41cHg7bGV0dGVyLXNwYWNpbmc6LjA1ZW07Y29sb3I6dmFyKC0taW5rKTtiYWNrZ3JvdW5kOiNGRkY3QjM7Ym9yZGVyLXJhZGl1czo1cHg7cGFkZGluZzowIDVweH0KLnJjLW1pc3N7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtc3R5bGU6aXRhbGljO2ZvbnQtc2l6ZToxMnB4fQoucmMtZW1wdHl7Ym9yZGVyLXN0eWxlOmRhc2hlZH0KLnJjLWVkaXR7Ym9yZGVyOjA7YmFja2dyb3VuZDpub25lO2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpO2ZvbnQtc2l6ZToxMnB4O2ZvbnQtd2VpZ2h0OjcwMDtwYWRkaW5nOjJweCA2cHg7Ym9yZGVyLXJhZGl1czo5OTlweH0KLnJjLWVkaXQ6aG92ZXJ7YmFja2dyb3VuZDp2YXIoLS1pY2UpfQoucmMtZm9ybXtkaXNwbGF5OmlubGluZS1mbGV4O2dhcDo0cHg7YWxpZ24taXRlbXM6Y2VudGVyfQoucmMtZm9ybSBpbnB1dHt3aWR0aDoxMTBweDtwYWRkaW5nOjNweCA4cHg7Zm9udC1mYW1pbHk6dmFyKC0tbW9ubyk7Zm9udC1zaXplOjEzcHh9Ci5yYy1wYWdle21hcmdpbi10b3A6MjZweH0KLnJjLWhlcm97dGV4dC1hbGlnbjpjZW50ZXI7bWFyZ2luLWJvdHRvbToyMnB4fQoucmMtaGVybyBoMntmb250LXNpemU6MzBweDtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KLnJjLWhlcm8gcHttYXJnaW46NnB4IDAgMnB4O2ZvbnQtc2l6ZToxNnB4O3RleHQtdHJhbnNmb3JtOm5vbmV9Ci5yYy1oZXJvIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKX0KLnJjLWdyaWR7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoYXV0by1maWxsLG1pbm1heCgyMzBweCwxZnIpKTtnYXA6MTZweH0KLnJjLWNhcmR7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjZweDt0ZXh0LWFsaWduOmNlbnRlcjtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czoxOHB4O3BhZGRpbmc6MjJweCAxNnB4O2JveC1zaGFkb3c6dmFyKC0tc2hhZG93KTtwb3NpdGlvbjpyZWxhdGl2ZTtvdmVyZmxvdzpoaWRkZW59Ci5yYy1jYXJkOjpiZWZvcmV7Y29udGVudDoiIjtwb3NpdGlvbjphYnNvbHV0ZTtpbnNldDowIDAgYXV0byAwO2hlaWdodDo1cHg7YmFja2dyb3VuZDp2YXIoLS1tbCl9Ci5yYy1jYXJkLnJjLWVtcHR5e2JveC1zaGFkb3c6bm9uZTtib3JkZXItc3R5bGU6ZGFzaGVkfQoucmMtc2VsbGVye2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MTlweH0KLnJjLWFjY3tjb2xvcjp2YXIoLS1tdXRlZCk7bWFyZ2luLXRvcDotNnB4fQoucmMtYmlne2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZTozNHB4O2xldHRlci1zcGFjaW5nOi4xMmVtO2JhY2tncm91bmQ6I0ZGRjdCMztjb2xvcjp2YXIoLS1tbC1pbmspO2JvcmRlci1yYWRpdXM6MTJweDtwYWRkaW5nOjZweCAxNnB4O21hcmdpbjo2cHggMH0KLnJjLXdhaXR7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtc3R5bGU6aXRhbGljO21hcmdpbjoxNHB4IDB9CkBtZWRpYSAobWF4LXdpZHRoOjYwMHB4KXsucmMtaGVybyBoMntmb250LXNpemU6MjRweH0ucmMtYmlne2ZvbnQtc2l6ZToyOHB4fX0KCi5yYy1ob3didG57anVzdGlmeS1zZWxmOnN0YXJ0O2ZvbnQtd2VpZ2h0OjYwMDtjb2xvcjp2YXIoLS1tdXRlZCk7bWFyZ2luLXRvcDo0cHh9Ci5yYy1ob3dib3h7ZmxleC1iYXNpczoxMDAlfQoucmMtaGVscHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTJweDtwYWRkaW5nOjEwcHggMTRweDtmb250LXNpemU6MTMuNXB4fQoucmMtaGVscCBvbHttYXJnaW46NnB4IDAgMDtwYWRkaW5nLWxlZnQ6MjBweDtkaXNwbGF5OmdyaWQ7Z2FwOjRweH0KLnJjLWJte2Rpc3BsYXk6aW5saW5lLWJsb2NrO2JhY2tncm91bmQ6dmFyKC0tbWwpO2NvbG9yOnZhcigtLW1sLWluayk7Zm9udC13ZWlnaHQ6ODAwO3RleHQtZGVjb3JhdGlvbjpub25lO2JvcmRlci1yYWRpdXM6OHB4O3BhZGRpbmc6MnB4IDEwcHg7Y3Vyc29yOmdyYWJ9Ci5yYy1tb2RhbHtwb3NpdGlvbjpmaXhlZDtpbnNldDowO2JhY2tncm91bmQ6cmdiYSgxMiw0Myw2NCwuMzUpO2Rpc3BsYXk6Z3JpZDtwbGFjZS1pdGVtczpjZW50ZXI7ei1pbmRleDo1MDtwYWRkaW5nOjE2cHh9Ci5yYy1tb2RhbC1ib3h7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXItcmFkaXVzOjE4cHg7cGFkZGluZzoyMHB4O21heC13aWR0aDo0MjBweDt3aWR0aDoxMDAlO2Rpc3BsYXk6Z3JpZDtnYXA6MTRweDtib3gtc2hhZG93OnZhcigtLXNoYWRvdyl9Ci5yYy1waWNre2Rpc3BsYXk6Z3JpZDtnYXA6OHB4fQoucmMtcGljayBsYWJlbHtkaXNwbGF5OmZsZXg7Z2FwOjhweDthbGlnbi1pdGVtczpjZW50ZXI7cGFkZGluZzo4cHggMTBweDtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTBweDtjdXJzb3I6cG9pbnRlcn0KLnJjLXBpY2sgc21hbGx7Y29sb3I6dmFyKC0tbXV0ZWQpfQoKLnVuZG8tYnRue2Rpc3BsYXk6aW5saW5lLWZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo4cHg7YmFja2dyb3VuZDp2YXIoLS1pbmspO2NvbG9yOiNmZmY7Ym9yZGVyOjA7Ym9yZGVyLXJhZGl1czoxMnB4O3BhZGRpbmc6NnB4IDEycHggNnB4IDEwcHg7Zm9udC1zaXplOjEzcHg7bGluZS1oZWlnaHQ6MS4xNTt0ZXh0LWFsaWduOmxlZnQ7bWF4LXdpZHRoOjIzMHB4fQoudW5kby1idG4gc3BhbntkaXNwbGF5OmdyaWQ7bWluLXdpZHRoOjB9Ci51bmRvLWJ0biBzbWFsbHtmb250LXdlaWdodDo1MDA7b3BhY2l0eTouODt3aGl0ZS1zcGFjZTpub3dyYXA7b3ZlcmZsb3c6aGlkZGVuO3RleHQtb3ZlcmZsb3c6ZWxsaXBzaXM7Zm9udC1zaXplOjExLjVweH0KLnVuZG8tYnRuOmhvdmVyOm5vdCg6ZGlzYWJsZWQpe2JhY2tncm91bmQ6dmFyKC0tYWNjZW50LXN0cm9uZyl9Ci51bmRvLWJ0bjpkaXNhYmxlZHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKTtjb2xvcjp2YXIoLS1tdXRlZCk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtjdXJzb3I6ZGVmYXVsdH0KLnRiLXByaW50ZWQ3IC50Yi1pY3tiYWNrZ3JvdW5kOnZhcigtLW9rLWJnKTtjb2xvcjp2YXIoLS1vayl9CgoudGItdHJhbnNpdCAudGItaWN7YmFja2dyb3VuZDp2YXIoLS1pY2UpO2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQoKLnNzLXRvZGF5IHRke2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZTIpfQoKLnNzLTIgdGguc3MtZ3Jwe3RleHQtYWxpZ246Y2VudGVyO2JvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLWxpbmUpfQouc3MtMiAuc3MtYmx7Y29sb3I6dmFyKC0tbG9jayl9Ci5zcy0yIHRoLnNzLWJse2NvbG9yOnZhcigtLWxvY2spfQouc3MtZGF5cm93IHRke2JvcmRlci10b3A6MXB4IHNvbGlkIHZhcigtLWxpbmUpfQouc3Mtc2Vscm93IHRke2ZvbnQtc2l6ZToxMnB4O2NvbG9yOnZhcigtLW11dGVkKX0KLnNzLXNlbHJvdyAuc3Mtc3Vie3BhZGRpbmctbGVmdDoxNHB4fQouc3Mtbm90ZXtmb250LXNpemU6MTEuNXB4O3BhZGRpbmc6NnB4IDJweCAwfQoKLnBwLW1vcmV7ZGlzcGxheTpmbGV4O2p1c3RpZnktY29udGVudDpjZW50ZXI7bWFyZ2luLXRvcDoxMHB4fQoKLyogTUtQIEZsYXNoIOKAlCBjb2xvcmVzIGRlIE1lcmNhZG8gTGlicmUgKi8KLm1rcC1oZXJve2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjEycHg7ZmxleC13cmFwOndyYXA7bWFyZ2luLXRvcDoyMnB4O2JhY2tncm91bmQ6I0ZGRTYwMDtjb2xvcjojMkQzMjc3O2JvcmRlci1yYWRpdXM6MThweDtwYWRkaW5nOjE2cHggMjBweH0KLm1rcC1oZXJvIGgye2ZvbnQtc2l6ZToyNnB4O2NvbG9yOiMyRDMyNzd9Ci5ta3AtaGVybyBwe21hcmdpbjoycHggMCAwO2ZvbnQtc2l6ZToxNHB4fQoubWtwLWhlcm8gc2VsZWN0e2JhY2tncm91bmQ6I2ZmZjtib3JkZXItY29sb3I6I2UwY2MwMH0KLm1rcC1yZWZyZXNoe2JhY2tncm91bmQ6IzJEMzI3Nztjb2xvcjojZmZmO2JvcmRlcjowfQoubWtwLXRpbGVze2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDUsbWlubWF4KDAsMWZyKSk7Z2FwOjEwcHg7bWFyZ2luOjE0cHggMH0KLm1rcC10aWxle2Rpc3BsYXk6Z3JpZDtqdXN0aWZ5LWl0ZW1zOnN0YXJ0O2dhcDowO3RleHQtYWxpZ246bGVmdDtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czoxNHB4O3BhZGRpbmc6MTJweCAxNHB4O2N1cnNvcjpwb2ludGVyfQoubWtwLXRpbGUgYntmb250LWZhbWlseTp2YXIoLS1kaXNwbGF5KTtmb250LXNpemU6MzBweDtsaW5lLWhlaWdodDoxO2NvbG9yOiMyRDMyNzd9Ci5ta3AtdGlsZSBzcGFue2ZvbnQtd2VpZ2h0OjcwMH0KLm1rcC10aWxlIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTJweH0KLm1rcC10aWxlLm9ue2JvcmRlcjoycHggc29saWQgIzM0ODNGQTtiYWNrZ3JvdW5kOiNGMEY2RkZ9Ci5ta3AtbWtkb3RzIGl7ZGlzcGxheTppbmxpbmUtYmxvY2s7d2lkdGg6OXB4O2hlaWdodDo5cHg7Ym9yZGVyLXJhZGl1czo1MCU7bWFyZ2luOjAgMnB4IDAgNnB4O3ZlcnRpY2FsLWFsaWduOi0xcHh9Ci5ta3AtbWtkb3RzIGkubWx7YmFja2dyb3VuZDojRkZFNjAwO2JvcmRlcjoxcHggc29saWQgI0M5QjQwMH0ubWtwLW1rZG90cyBpLmZhe2JhY2tncm91bmQ6I0FBRDUwMH0ubWtwLW1rZG90cyBpLnBhe2JhY2tncm91bmQ6IzAwNzhDOH0KLm1rcC1ib2R5e2Rpc3BsYXk6Z3JpZDtnYXA6MTBweH0KLm1rcC1jYXJke2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItbGVmdDo1cHggc29saWQgIzM0ODNGQTtib3JkZXItcmFkaXVzOjE0cHg7cGFkZGluZzoxMnB4IDE0cHg7ZGlzcGxheTpncmlkO2dhcDo4cHh9Ci5ta3AtY2FyZC5ta3AtbWVke2JvcmRlci1sZWZ0LWNvbG9yOiNFODY2MUF9Ci5ta3AtY2FyZC5ta3AtZG9uZXtvcGFjaXR5Oi41fQoubWtwLWNhcmQtaHtkaXNwbGF5OmZsZXg7Z2FwOjEwcHg7YWxpZ24taXRlbXM6ZmxleC1zdGFydH0KLm1rcC1jYXJkLWggaW1ne3dpZHRoOjQ4cHg7aGVpZ2h0OjQ4cHg7b2JqZWN0LWZpdDpjb3Zlcjtib3JkZXItcmFkaXVzOjhweDtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpfQoubWtwLWNhcmQtaCBkaXZ7ZGlzcGxheTpncmlkO2dhcDoxcHg7bWluLXdpZHRoOjB9Ci5ta3AtY2FyZC1oIGF7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOiMyRDMyNzc7dGV4dC1kZWNvcmF0aW9uOm5vbmV9Ci5ta3AtY2FyZC1oIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTJweH0KLm1rcC1hY2N7ZGlzcGxheTppbmxpbmUtYmxvY2s7YmFja2dyb3VuZDojRkZFNjAwO2NvbG9yOiMyRDMyNzc7Zm9udC13ZWlnaHQ6NzAwO2JvcmRlci1yYWRpdXM6NnB4O3BhZGRpbmc6MCA2cHg7bWFyZ2luLXJpZ2h0OjZweH0KLm1rcC1kdWV7Y29sb3I6I0I0MjMxOCFpbXBvcnRhbnQ7Zm9udC13ZWlnaHQ6NzAwfQoubWtwLXF7bWFyZ2luOjA7Zm9udC1zaXplOjE1LjVweDtiYWNrZ3JvdW5kOiNGNUY1RjU7Ym9yZGVyLXJhZGl1czoxMHB4O3BhZGRpbmc6OHB4IDEycHh9Ci5ta3AtdGhyZWFke2Rpc3BsYXk6Z3JpZDtnYXA6NnB4O21heC1oZWlnaHQ6MjYwcHg7b3ZlcmZsb3c6YXV0bztwYWRkaW5nOjJweH0KLm1rcC1idWJ7bWF4LXdpZHRoOjgwJTtib3JkZXItcmFkaXVzOjEycHg7cGFkZGluZzo2cHggMTBweDtkaXNwbGF5OmdyaWQ7YmFja2dyb3VuZDojRjBGMEYwO2p1c3RpZnktc2VsZjpzdGFydH0KLm1rcC1idWIuc2VsbGVye2JhY2tncm91bmQ6I0UzRUVGRjtqdXN0aWZ5LXNlbGY6ZW5kfQoubWtwLWJ1Yi5tZWRpYXRvcntiYWNrZ3JvdW5kOiNGRkY0RDZ9Ci5ta3AtYnViIHNtYWxse2ZvbnQtc2l6ZToxMXB4O2NvbG9yOnZhcigtLW11dGVkKX0KLm1rcC1yZXBseXtkaXNwbGF5OmdyaWQ7Z2FwOjZweH0KLm1rcC1yZXBseSB0ZXh0YXJlYXt3aWR0aDoxMDAlO3Jlc2l6ZTp2ZXJ0aWNhbDtib3JkZXItcmFkaXVzOjEwcHh9Ci5ta3AtcmVwbHktYmFye2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7anVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW59Ci5ta3AtcmVwbHktYmFyIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTEuNXB4fQoubWtwLXNlbmR7YmFja2dyb3VuZDojMzQ4M0ZBO2NvbG9yOiNmZmY7Ym9yZGVyOjB9Ci5ta3Atc2VuZDpob3ZlcntiYWNrZ3JvdW5kOiMyOTY4Qzh9Ci5ta3AtZW1wdHl7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IGRhc2hlZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjE0cHg7cGFkZGluZzoyMnB4O3RleHQtYWxpZ246Y2VudGVyO2NvbG9yOnZhcigtLW11dGVkKX0KLm1rcC1lbXB0eS5zbXtwYWRkaW5nOjEwcHg7Zm9udC1zaXplOjEzcHh9Ci5ta3AtcGVybXtiYWNrZ3JvdW5kOiNGRkY4RDY7Ym9yZGVyOjFweCBzb2xpZCAjRThEMjAwO2NvbG9yOiMyRDMyNzc7Ym9yZGVyLXJhZGl1czoxMnB4O3BhZGRpbmc6MTJweCAxNHB4O2ZvbnQtc2l6ZToxNHB4fQoubWtwLXJldHN7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoMyxtaW5tYXgoMCwxZnIpKTtnYXA6MTJweH0KLm1rcC1yZXR7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTRweDtvdmVyZmxvdzpoaWRkZW59Ci5ta3AtcmV0IGgze2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpiYXNlbGluZTtnYXA6NnB4O3BhZGRpbmc6MTBweCAxNHB4O21hcmdpbjowO2ZvbnQtc2l6ZToxNnB4fQoubWtwLXJldCBoMyBpe2Rpc3BsYXk6aW5saW5lLWJsb2NrO3dpZHRoOjEycHg7aGVpZ2h0OjEycHg7Ym9yZGVyLXJhZGl1czo1MCV9Ci5ta3AtcmV0IGgzIGJ7Zm9udC1zaXplOjIycHh9Ci5ta3AtcmV0LW1sIGgze2JhY2tncm91bmQ6I0ZGRTYwMDtjb2xvcjojMkQzMjc3fS5ta3AtcmV0LW1sIGgzIGl7YmFja2dyb3VuZDojMkQzMjc3fQoubWtwLXJldC1mYSBoM3tiYWNrZ3JvdW5kOiNBQUQ1MDA7Y29sb3I6IzJGM0EwMH0ubWtwLXJldC1mYSBoMyBpe2JhY2tncm91bmQ6IzJGM0EwMH0KLm1rcC1yZXQtcGEgaDN7YmFja2dyb3VuZDojMDA3OEM4O2NvbG9yOiNmZmZ9Lm1rcC1yZXQtcGEgaDMgaXtiYWNrZ3JvdW5kOiNmZmZ9Ci5ta3AtcmV0ID4gZGl2LC5ta3AtcmV0IC5ta3AtcGVybXttYXJnaW46MTBweH0KLm1rcC1ycm93e2Rpc3BsYXk6ZmxleDtqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbjtnYXA6MTBweDtwYWRkaW5nOjhweCAxNHB4O2JvcmRlci10b3A6MXB4IHNvbGlkIHZhcigtLWxpbmUpO21hcmdpbjowIWltcG9ydGFudH0KLm1rcC1ycm93IGRpdntkaXNwbGF5OmdyaWQ7Z2FwOjFweH0KLm1rcC1ycm93IHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTJweH0KLm1rcC1wcmljZXtmb250LWZhbWlseTp2YXIoLS1kaXNwbGF5KTtmb250LXNpemU6MTdweDt3aGl0ZS1zcGFjZTpub3dyYXB9Ci5ta3AtdG9kYXl7ZGlzcGxheTppbmxpbmUtYmxvY2s7bWFyZ2luLWxlZnQ6NnB4O2JhY2tncm91bmQ6IzM0ODNGQTtjb2xvcjojZmZmO2JvcmRlci1yYWRpdXM6NnB4O3BhZGRpbmc6MCA2cHg7Zm9udC1zaXplOjExLjVweDtmb250LXdlaWdodDo3MDB9CkBtZWRpYSAobWF4LXdpZHRoOjkwMHB4KXsubWtwLXRpbGVze2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoMixtaW5tYXgoMCwxZnIpKX0ubWtwLXJldHN7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmcn19CgoubWtwLXNlbnR7Y29sb3I6IzAwQTY1MDtmb250LXdlaWdodDo3MDA7Zm9udC1zaXplOjE0cHh9CgovKiAtLS0tLS0tLS0tIFNvbCAicHJvY2VzYW5kbyIgYWwgaW1wcmltaXIgLS0tLS0tLS0tLSAqLwojc3VuTG9hZGVye3Bvc2l0aW9uOmZpeGVkO2luc2V0OjA7ei1pbmRleDo5OTk5O2Rpc3BsYXk6Z3JpZDtwbGFjZS1pdGVtczpjZW50ZXI7cGFkZGluZzoxNnB4O2JhY2tncm91bmQ6cmFkaWFsLWdyYWRpZW50KGNpcmNsZSBhdCA1MCUgNDIlLHJnYmEoMjU1LDIzNiwxNzAsLjU1KSxyZ2JhKDI1NSwyNDgsMjMwLC44MikgNDUlLHJnYmEoMjAsMzAsNTAsLjM1KSk7YmFja2Ryb3AtZmlsdGVyOmJsdXIoNXB4KTstd2Via2l0LWJhY2tkcm9wLWZpbHRlcjpibHVyKDVweCk7b3BhY2l0eTowO3RyYW5zaXRpb246b3BhY2l0eSAuM3MgZWFzZTtjdXJzb3I6cHJvZ3Jlc3N9CiNzdW5Mb2FkZXIub257b3BhY2l0eToxfQouc3VuLWNhcmR7dGV4dC1hbGlnbjpjZW50ZXI7bWF4LXdpZHRoOjQ2MHB4O3BhZGRpbmc6MjhweCAyOHB4IDI2cHg7Ym9yZGVyLXJhZGl1czoyOHB4O2JhY2tncm91bmQ6cmdiYSgyNTUsMjU1LDI1NSwuODgpO2JveC1zaGFkb3c6MCAyMHB4IDYwcHggcmdiYSgyNTUsMTU5LDI4LC4yOCksMCAycHggOHB4IHJnYmEoMCwwLDAsLjA2KTt0cmFuc2Zvcm06dHJhbnNsYXRlWSgxNHB4KSBzY2FsZSguOTYpO3RyYW5zaXRpb246dHJhbnNmb3JtIC40NXMgY3ViaWMtYmV6aWVyKC4yLDEuNCwuNCwxKX0KI3N1bkxvYWRlci5vbiAuc3VuLWNhcmR7dHJhbnNmb3JtOm5vbmV9Ci5zdW57d2lkdGg6MTUwcHg7aGVpZ2h0OjE1MHB4O2Rpc3BsYXk6YmxvY2s7bWFyZ2luOjAgYXV0byA2cHg7YW5pbWF0aW9uOnN1bkJvYiAyLjRzIGVhc2UtaW4tb3V0IGluZmluaXRlfQouc3VuLXJheXN7dHJhbnNmb3JtLW9yaWdpbjoxMDBweCAxMDBweDthbmltYXRpb246c3VuU3BpbiA3cyBsaW5lYXIgaW5maW5pdGV9Ci5zdW4tcmF5cyByZWN0e2FuaW1hdGlvbjpzdW5SYXkgMS42cyBlYXNlLWluLW91dCBpbmZpbml0ZX0KLnN1bi1yYXlzIHJlY3Q6bnRoLWNoaWxkKG9kZCl7YW5pbWF0aW9uLWRlbGF5Oi44c30KLnN1bi1nbG93e3RyYW5zZm9ybS1vcmlnaW46MTAwcHggMTAwcHg7YW5pbWF0aW9uOnN1blB1bHNlIDEuOHMgZWFzZS1pbi1vdXQgaW5maW5pdGV9Ci5zdW4tZmFjZXt0cmFuc2Zvcm0tb3JpZ2luOjEwMHB4IDEwMHB4O2FuaW1hdGlvbjpzdW5CbGluayA0cyBpbmZpbml0ZX0KLnN1bi1sMXtmb250LWZhbWlseTonUGFjaWZpY28nLGN1cnNpdmU7Zm9udC1zaXplOjI2cHg7bGluZS1oZWlnaHQ6MS4zO21hcmdpbjo2cHggMCA0cHg7YmFja2dyb3VuZDpsaW5lYXItZ3JhZGllbnQoOTBkZWcsI0ZGN0EwMCwjRkZCNjI3LCNGRjVFN0UsI0ZGN0EwMCk7YmFja2dyb3VuZC1zaXplOjMwMCUgMTAwJTstd2Via2l0LWJhY2tncm91bmQtY2xpcDp0ZXh0O2JhY2tncm91bmQtY2xpcDp0ZXh0O2NvbG9yOnRyYW5zcGFyZW50O2FuaW1hdGlvbjpzdW5TaGluZSA0cyBsaW5lYXIgaW5maW5pdGUsc3VuSW4gLjZzIC4xcyBib3RofQouc3VuLWwye2ZvbnQtZmFtaWx5OidCYWxvbyAyJyx2YXIoLS1kaXNwbGF5KSxzYW5zLXNlcmlmO2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTlweDtjb2xvcjojNkI0MjAwO21hcmdpbjowO2FuaW1hdGlvbjpzdW5JbiAuNnMgLjM1cyBib3RofQouc3VuLWwze2ZvbnQtZmFtaWx5OidCYWxvbyAyJyx2YXIoLS1kaXNwbGF5KSxzYW5zLXNlcmlmO2ZvbnQtd2VpZ2h0OjYwMDtmb250LXNpemU6MTZweDtjb2xvcjojQzA3MDAwO21hcmdpbjo0cHggMCAwO2FuaW1hdGlvbjpzdW5JbiAuNnMgLjZzIGJvdGh9Ci5zdW4tZG90cyBpe2ZvbnQtc3R5bGU6bm9ybWFsO2Rpc3BsYXk6aW5saW5lLWJsb2NrO2FuaW1hdGlvbjpzdW5Eb3QgMS4ycyBpbmZpbml0ZX0KLnN1bi1kb3RzIGk6bnRoLWNoaWxkKDIpe2FuaW1hdGlvbi1kZWxheTouMnN9LnN1bi1kb3RzIGk6bnRoLWNoaWxkKDMpe2FuaW1hdGlvbi1kZWxheTouNHN9CiNzdW5Mb2FkZXIuZG9uZSAuc3VuLXJheXN7YW5pbWF0aW9uLWR1cmF0aW9uOjEuMnN9CiNzdW5Mb2FkZXIuZG9uZSAuc3VuLWwye2NvbG9yOiMxRjhBNEN9CkBrZXlmcmFtZXMgc3VuU3Bpbnt0b3t0cmFuc2Zvcm06cm90YXRlKDM2MGRlZyl9fQpAa2V5ZnJhbWVzIHN1blJheXswJSwxMDAle29wYWNpdHk6MX01MCV7b3BhY2l0eTouNDV9fQpAa2V5ZnJhbWVzIHN1blB1bHNlezAlLDEwMCV7dHJhbnNmb3JtOnNjYWxlKDEpO29wYWNpdHk6LjM1fTUwJXt0cmFuc2Zvcm06c2NhbGUoMS4xOCk7b3BhY2l0eTouMTV9fQpAa2V5ZnJhbWVzIHN1bkJvYnswJSwxMDAle3RyYW5zZm9ybTp0cmFuc2xhdGVZKDApfTUwJXt0cmFuc2Zvcm06dHJhbnNsYXRlWSgtOHB4KX19CkBrZXlmcmFtZXMgc3VuQmxpbmt7MCUsOTIlLDEwMCV7dHJhbnNmb3JtOnNjYWxlWSgxKX05NSV7dHJhbnNmb3JtOnNjYWxlWSguMTUpfX0KQGtleWZyYW1lcyBzdW5TaGluZXt0b3tiYWNrZ3JvdW5kLXBvc2l0aW9uOjMwMCUgMH19CkBrZXlmcmFtZXMgc3VuSW57ZnJvbXtvcGFjaXR5OjA7dHJhbnNmb3JtOnRyYW5zbGF0ZVkoOHB4KX10b3tvcGFjaXR5OjE7dHJhbnNmb3JtOm5vbmV9fQpAa2V5ZnJhbWVzIHN1bkRvdHswJSwxMDAle29wYWNpdHk6LjI7dHJhbnNmb3JtOnRyYW5zbGF0ZVkoMCl9NDAle29wYWNpdHk6MTt0cmFuc2Zvcm06dHJhbnNsYXRlWSgtM3B4KX19CkBtZWRpYSAocHJlZmVycy1yZWR1Y2VkLW1vdGlvbjpyZWR1Y2UpeyNzdW5Mb2FkZXIgKnthbmltYXRpb24tZHVyYXRpb246MHMhaW1wb3J0YW50O2FuaW1hdGlvbi1pdGVyYXRpb24tY291bnQ6MSFpbXBvcnRhbnR9fQpAbWVkaWEgKG1heC13aWR0aDo0ODBweCl7LnN1bnt3aWR0aDoxMjBweDtoZWlnaHQ6MTIwcHh9LnN1bi1sMXtmb250LXNpemU6MjJweH19Ci5ub3RlLnByZXZwcmludHtjb2xvcjojQjQ1MzA5O2JhY2tncm91bmQ6I0ZGRjdFNjtib3JkZXItcmFkaXVzOjZweDtwYWRkaW5nOjJweCA2cHg7ZGlzcGxheTppbmxpbmUtYmxvY2s7bWFyZ2luLXRvcDo0cHh9Cg==","app.js":"LyogRXRpcXVldGFIdWIg4oCUIGludGVyZmF6ICovCigoKSA9PiB7CmNvbnN0ICQgPSAocywgZWwgPSBkb2N1bWVudCkgPT4gZWwucXVlcnlTZWxlY3RvcihzKTsKY29uc3QgJCQgPSAocywgZWwgPSBkb2N1bWVudCkgPT4gWy4uLmVsLnF1ZXJ5U2VsZWN0b3JBbGwocyldOwpjb25zdCBlc2MgPSBzID0+IFN0cmluZyhzID8/ICcnKS5yZXBsYWNlKC9bJjw+IiddL2csIGMgPT4gKHsgJyYnOiAnJmFtcDsnLCAnPCc6ICcmbHQ7JywgJz4nOiAnJmd0OycsICciJzogJyZxdW90OycsICInIjogJyYjMzk7JyB9W2NdKSk7CmNvbnN0IE1LID0geyBtbDogJ01lcmNhZG8gTGlicmUnLCBmYTogJ0ZhbGFiZWxsYScsIHBhOiAnUGFyaXMnIH07CmNvbnN0IFNUQVRFID0geyByZWFkeTogJ0V0aXF1ZXRhIHBvciBpbXByaW1pcicsIHdhaXRpbmc6ICdFc3BlcmFuZG8gZXRpcXVldGEnLCBibG9ja2VkOiAnQmxvcXVlYWRhJywgcHJpbnRlZDogJ0V0aXF1ZXRhIGltcHJlc2EnLCBzaGlwcGVkOiAnRW52aWFkYScsIGVycm9yOiAnRXJyb3IgZW4gZXRpcXVldGEnLCBjYW5jZWxsZWQ6ICdDYW5jZWxhZGEnIH07CmNvbnN0IHN0b3JlID0geyBnZXQoaywgZCkgeyB0cnkgeyBjb25zdCB2ID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2VoOicgKyBrKTsgcmV0dXJuIHYgPT0gbnVsbCA/IGQgOiBKU09OLnBhcnNlKHYpOyB9IGNhdGNoIHsgcmV0dXJuIGQ7IH0gfSwgc2V0KGssIHYpIHsgdHJ5IHsgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2VoOicgKyBrLCBKU09OLnN0cmluZ2lmeSh2KSk7IH0gY2F0Y2gge30gfSB9OwoKY29uc3QgSSA9IHsKICBsb2NrOiAnPHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjIuMiI+PHJlY3QgeD0iNSIgeT0iMTEiIHdpZHRoPSIxNCIgaGVpZ2h0PSIxMCIgcng9IjIiLz48cGF0aCBkPSJNOCAxMVY4YTQgNCAwIDAxOCAwdjMiLz48L3N2Zz4nLAogIGNoZWNrOiAnPHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjMiPjxwYXRoIGQ9Ik01IDEybDUgNSA5LTEwIi8+PC9zdmc+JywKICBwcmludDogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyLjIiPjxwYXRoIGQ9Ik03IDlWM2gxMHY2TTcgMTdINHYtN2gxNnY3aC0zIi8+PHJlY3QgeD0iNyIgeT0iMTQiIHdpZHRoPSIxMCIgaGVpZ2h0PSI3Ii8+PC9zdmc+JywKICBjbG9jazogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyLjIiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjkiLz48cGF0aCBkPSJNMTIgN3Y1bDMgMiIvPjwvc3ZnPicsCiAgd2FybjogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyLjIiPjxwYXRoIGQ9Ik0xMiAzbDEwIDE4SDJ6Ii8+PHBhdGggZD0iTTEyIDEwdjVNMTIgMTh2LjUiLz48L3N2Zz4nLAogIGRvd246ICc8c3ZnIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMi40Ij48cGF0aCBkPSJNMTIgNHYxMW0wIDBsLTUtNW01IDVsNS01TTUgMjBoMTQiLz48L3N2Zz4nLAogIHN5bmM6ICc8c3ZnIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMi4yIj48cGF0aCBkPSJNMjAgMTFhOCA4IDAgMDAtMTQuOS0zTTQgNXY0aDRNNCAxM2E4IDggMCAwMDE0LjkgM00yMCAxOXYtNGgtNCIvPjwvc3ZnPicsCiAgeDogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiB3aWR0aD0iMTQiIGhlaWdodD0iMTQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjIuNiI+PHBhdGggZD0iTTYgNmwxMiAxMk0xOCA2TDYgMTgiLz48L3N2Zz4nLAogIGJveDogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIj48cmVjdCB4PSIzIiB5PSI0IiB3aWR0aD0iMTgiIGhlaWdodD0iMTYiIHJ4PSIzIi8+PHBhdGggZD0iTTMgOWgxOCIvPjwvc3ZnPicsCn07CmNvbnN0IHBpbGxJY29uID0geyBzaGlwcGVkOiBJLmNoZWNrLCByZWFkeTogSS5jaGVjaywgYmxvY2tlZDogSS5sb2NrLCBwcmludGVkOiBJLnByaW50LCB3YWl0aW5nOiBJLmNsb2NrLCBlcnJvcjogSS53YXJuLCBjYW5jZWxsZWQ6IEkueCB9OwoKbGV0IG1lID0gbnVsbCwgdGFiID0gbnVsbCwgb3JkZXJzID0gW10sIHNlbGxlcnMgPSBbXSwgc2VsZWN0ZWQgPSBuZXcgU2V0KCksIGtub3duUmVhZHkgPSBuZXcgU2V0KCksIGZpcnN0TG9hZCA9IHRydWU7CmNvbnN0IHVpID0geyBicGY6ICdhbGwnLCBiZGY6ICdhbGwnLCB1ZGY6ICdhbGwnLCB1YmY6ICdhbGwnLCBiYmY6ICdhbGwnLCBzaGlwRGF5OiAndG9kYXknLCB0YWI6ICd0b2RheScsIG1rOiAnYWxsJywgc2VsbGVyczogbmV3IFNldCgpLCBxOiAnJywgYWRtaW5TZWxsZXI6IHN0b3JlLmdldCgnYWRtaW5TZWxsZXInLCBudWxsKSB9OwoKZnVuY3Rpb24gdG9hc3QobXNnLCBtcyA9IDI4MDApIHsgY29uc3QgdCA9ICQoJyN0b2FzdCcpOyB0LnRleHRDb250ZW50ID0gbXNnOyB0LmhpZGRlbiA9IGZhbHNlOyBjbGVhclRpbWVvdXQodC5fdCk7IHQuX3QgPSBzZXRUaW1lb3V0KCgpID0+IHQuaGlkZGVuID0gdHJ1ZSwgbXMpOyB9Ci8vIE1pZW50cmFzIGxhIGFwcCBzZSBhY3R1YWxpemEgKHVub3Mgc2VndW5kb3MgYWwgcHVibGljYXIgdW5hIHZlcnNpw7NuIG51ZXZhKSBlbCBzZXJ2aWRvciByZXNwb25kZSA1MDMgInVwZGF0aW5nIjoKLy8gc2UgZXNwZXJhIHkgc2UgcmVpbnRlbnRhIHNvbGEsIGFzw60gbmFkYSBkZSBsbyBxdWUgaGFnYXMgc2UgcGllcmRlLgphc3luYyBmdW5jdGlvbiBzYWZlRmV0Y2gocGF0aCwgb3B0cykgewogIGNvbnN0IHQwID0gRGF0ZS5ub3coKTsgbGV0IHdhcm5lZCA9IGZhbHNlOwogIGZvciAoOzspIHsKICAgIGxldCByZXM7CiAgICB0cnkgeyByZXMgPSBhd2FpdCBmZXRjaChwYXRoLCBvcHRzKTsgfQogICAgY2F0Y2ggKGUpIHsgaWYgKERhdGUubm93KCkgLSB0MCA+IDE4MGUzKSB0aHJvdyBuZXcgRXJyb3IoJ1NpbiBjb25leGnDs24gY29uIGxhIGFwcCwgaW50ZW50YSBkZSBudWV2bycpOyBhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgNDAwMCkpOyBjb250aW51ZTsgfQogICAgaWYgKHJlcy5zdGF0dXMgPT09IDUwMyAmJiByZXMuaGVhZGVycy5nZXQoJ3gtZWgtdXBkYXRpbmcnKSAmJiBEYXRlLm5vdygpIC0gdDAgPCAxODBlMykgewogICAgICBpZiAoIXdhcm5lZCkgeyB3YXJuZWQgPSB0cnVlOyB0cnkgeyB0b2FzdCgnTGEgYXBwIHNlIGVzdMOhIGFjdHVhbGl6YW5kb+KApiB0dSBhY2Npw7NuIHNlIGhhcsOhIHNvbGEgZW4gdW5vcyBzZWd1bmRvcycsIDYwMDApOyB9IGNhdGNoIHt9IH0KICAgICAgYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDQwMDApKTsgY29udGludWU7CiAgICB9CiAgICByZXR1cm4gcmVzOwogIH0KfQphc3luYyBmdW5jdGlvbiBhcGkocGF0aCwgb3B0cyA9IHt9KSB7CiAgY29uc3QgcmVzID0gYXdhaXQgc2FmZUZldGNoKHBhdGgsIHsgY3JlZGVudGlhbHM6ICdzYW1lLW9yaWdpbicsIC4uLm9wdHMsIGhlYWRlcnM6IHsgJ2NvbnRlbnQtdHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJywgLi4uKG9wdHMuaGVhZGVycyB8fCB7fSkgfSwgYm9keTogb3B0cy5ib2R5ICYmIHR5cGVvZiBvcHRzLmJvZHkgIT09ICdzdHJpbmcnID8gSlNPTi5zdHJpbmdpZnkob3B0cy5ib2R5KSA6IG9wdHMuYm9keSB9KTsKICBpZiAocmVzLnN0YXR1cyA9PT0gNDAxICYmICFwYXRoLmluY2x1ZGVzKCcvbG9naW4nKSkgeyBtZSA9IG51bGw7IHJlbmRlckxvZ2luKCk7IHRocm93IG5ldyBFcnJvcignU2VzacOzbiB2ZW5jaWRhJyk7IH0KICBjb25zdCBjdCA9IHJlcy5oZWFkZXJzLmdldCgnY29udGVudC10eXBlJykgfHwgJyc7CiAgaWYgKCFyZXMub2spIHsgY29uc3QgZSA9IGN0LmluY2x1ZGVzKCdqc29uJykgPyAoYXdhaXQgcmVzLmpzb24oKSkuZXJyb3IgOiBhd2FpdCByZXMudGV4dCgpOyB0aHJvdyBuZXcgRXJyb3IoZSB8fCAnRXJyb3InKTsgfQogIHJldHVybiBjdC5pbmNsdWRlcygnanNvbicpID8gcmVzLmpzb24oKSA6IHJlczsKfQovLyByZWludGVudGEgc29sbyBjdWFuZG8gZmFsbGEgbGEgY29uZXhpw7NuIG8gZWwgc2Vydmlkb3IgZXN0w6Egb2N1cGFkbyAoNXh4KSwgbm8gY3VhbmRvIGVzIHVuIGVycm9yIHJlYWwgKDR4eCkKYXN5bmMgZnVuY3Rpb24gYXBpUmV0cnkocGF0aCwgb3B0cyA9IHt9LCB0cmllcyA9IDQpIHsKICBmb3IgKGxldCBpID0gMDsgOyBpKyspIHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHNhZmVGZXRjaChwYXRoLCB7IGNyZWRlbnRpYWxzOiAnc2FtZS1vcmlnaW4nLCAuLi5vcHRzLCBoZWFkZXJzOiB7ICdjb250ZW50LXR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSwgYm9keTogb3B0cy5ib2R5ICYmIHR5cGVvZiBvcHRzLmJvZHkgIT09ICdzdHJpbmcnID8gSlNPTi5zdHJpbmdpZnkob3B0cy5ib2R5KSA6IG9wdHMuYm9keSB9KTsKICAgICAgY29uc3QgY3QgPSByZXMuaGVhZGVycy5nZXQoJ2NvbnRlbnQtdHlwZScpIHx8ICcnOwogICAgICBpZiAocmVzLnN0YXR1cyA9PT0gNDAxKSB7IG1lID0gbnVsbDsgcmVuZGVyTG9naW4oKTsgdGhyb3cgT2JqZWN0LmFzc2lnbihuZXcgRXJyb3IoJ1Nlc2nDs24gdmVuY2lkYScpLCB7IGZpbmFsOiB0cnVlIH0pOyB9CiAgICAgIGlmIChyZXMub2spIHJldHVybiBjdC5pbmNsdWRlcygnanNvbicpID8gcmVzLmpzb24oKSA6IHJlczsKICAgICAgY29uc3QgZSA9IGN0LmluY2x1ZGVzKCdqc29uJykgPyAoYXdhaXQgcmVzLmpzb24oKS5jYXRjaCgoKSA9PiAoe30pKSkuZXJyb3IgOiAnJzsKICAgICAgaWYgKHJlcy5zdGF0dXMgPCA1MDAgfHwgaSA+PSB0cmllcyAtIDEpIHRocm93IE9iamVjdC5hc3NpZ24obmV3IEVycm9yKGUgfHwgJ0VsIHNlcnZpZG9yIG5vIHJlc3BvbmRpw7MsIGludGVudGEgZGUgbnVldm8nKSwgeyBmaW5hbDogdHJ1ZSB9KTsKICAgIH0gY2F0Y2ggKGVycikgeyBpZiAoZXJyLmZpbmFsIHx8IGkgPj0gdHJpZXMgLSAxKSB0aHJvdyBlcnI7IH0KICAgIGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCA4MDAgKiAoaSArIDEpKSk7CiAgfQp9CmZ1bmN0aW9uIHNlbGxlclFTKCkgeyByZXR1cm4gbWUudXNlci5yb2xlID09PSAnYWRtaW4nICYmIHVpLmFkbWluU2VsbGVyID8gYD9zZWxsZXJfaWQ9JHt1aS5hZG1pblNlbGxlcn1gIDogJyc7IH0KZnVuY3Rpb24gZm10VGltZShzKSB7IGlmICghcykgcmV0dXJuICcnOyBjb25zdCBkID0gbmV3IERhdGUocy5pbmNsdWRlcygnVCcpID8gcyA6IHMucmVwbGFjZSgnICcsICdUJykgKyAnWicpOyByZXR1cm4gZC50b0xvY2FsZVN0cmluZygnZXMtQ0wnLCB7IGRheTogJzItZGlnaXQnLCBtb250aDogJzItZGlnaXQnLCBob3VyOiAnMi1kaWdpdCcsIG1pbnV0ZTogJzItZGlnaXQnIH0pOyB9CgovLyAtLS0tLS0tLS0tIGlsdXN0cmFjaW9uZXMgLS0tLS0tLS0tLQpjb25zdCBIRVJPX1NWRyA9IGA8c3ZnIHZpZXdCb3g9IjAgMCA1MjAgMjMwIiBhcmlhLWhpZGRlbj0idHJ1ZSI+CjxyZWN0IHdpZHRoPSI1MjAiIGhlaWdodD0iMjMwIiByeD0iMjYiIGZpbGw9InZhcigtLWJnMikiLz4KPGcgZm9udC1mYW1pbHk9IkJhbG9vIDIsIHNhbnMtc2VyaWYiIGZvbnQtd2VpZ2h0PSI4MDAiIGZvbnQtc2l6ZT0iMTQiIHRleHQtYW5jaG9yPSJtaWRkbGUiPgo8cmVjdCB4PSIyMiIgeT0iMjYiIHdpZHRoPSIxMTIiIGhlaWdodD0iNDQiIHJ4PSIxMiIgZmlsbD0idmFyKC0tbWwpIi8+PHRleHQgeD0iNzgiIHk9IjUzIiBmaWxsPSJ2YXIoLS1tbC1pbmspIj5NZXJjYWRvIExpYnJlPC90ZXh0Pgo8cmVjdCB4PSIyMiIgeT0iOTMiIHdpZHRoPSIxMTIiIGhlaWdodD0iNDQiIHJ4PSIxMiIgZmlsbD0idmFyKC0tZmEpIi8+PHRleHQgeD0iNzgiIHk9IjEyMCIgZmlsbD0idmFyKC0tZmEtaW5rKSI+RmFsYWJlbGxhPC90ZXh0Pgo8cmVjdCB4PSIyMiIgeT0iMTYwIiB3aWR0aD0iMTEyIiBoZWlnaHQ9IjQ0IiByeD0iMTIiIGZpbGw9InZhcigtLXBhKSIvPjx0ZXh0IHg9Ijc4IiB5PSIxODciIGZpbGw9IiNmZmYiPlBhcmlzPC90ZXh0PjwvZz4KPGcgc3Ryb2tlPSJ2YXIoLS1za3kpIiBzdHJva2Utd2lkdGg9IjMiIGZpbGw9Im5vbmUiIHN0cm9rZS1kYXNoYXJyYXk9IjYgNyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48cGF0aCBkPSJNMTM0IDQ4IEMgMTc1IDQ4LCAxNzUgMTE1LCAyMTAgMTE1Ii8+PHBhdGggZD0iTTEzNCAxMTUgSDIxMCIvPjxwYXRoIGQ9Ik0xMzQgMTgyIEMgMTc1IDE4MiwgMTc1IDExNSwgMjEwIDExNSIvPjwvZz4KPHJlY3QgeD0iMjEwIiB5PSI3MCIgd2lkdGg9IjEwNCIgaGVpZ2h0PSI5MCIgcng9IjIwIiBmaWxsPSJ2YXIoLS1hY2NlbnQpIi8+CjxyZWN0IHg9IjIyNiIgeT0iODgiIHdpZHRoPSI3MiIgaGVpZ2h0PSIxMiIgcng9IjYiIGZpbGw9IiNmZmYiIG9wYWNpdHk9Ii45Ii8+PHJlY3QgeD0iMjI2IiB5PSIxMDciIHdpZHRoPSI1MiIgaGVpZ2h0PSIxMCIgcng9IjUiIGZpbGw9IiNmZmYiIG9wYWNpdHk9Ii42Ii8+CjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDIzMiwxMjYpIj48cmVjdCB3aWR0aD0iMjIiIGhlaWdodD0iMjIiIHJ4PSI2IiBmaWxsPSIjZmZmIi8+PHBhdGggZD0iTTYgMTFsNCA0IDctOCIgc3Ryb2tlPSJ2YXIoLS1vaykiIHN0cm9rZS13aWR0aD0iMyIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9nPgo8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyNjQsMTI2KSI+PHJlY3Qgd2lkdGg9IjIyIiBoZWlnaHQ9IjIyIiByeD0iNiIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjYiIHk9IjEwIiB3aWR0aD0iMTAiIGhlaWdodD0iOCIgcng9IjIiIGZpbGw9InZhcigtLWxvY2spIi8+PHBhdGggZD0iTTggMTBWOGEzIDMgMCAwMTYgMHYyIiBzdHJva2U9InZhcigtLWxvY2spIiBzdHJva2Utd2lkdGg9IjIiIGZpbGw9Im5vbmUiLz48L2c+CjxwYXRoIGQ9Ik0zMTQgMTE1IEgzNTYiIHN0cm9rZT0idmFyKC0tc2t5KSIgc3Ryb2tlLXdpZHRoPSIzIiBzdHJva2UtZGFzaGFycmF5PSI2IDciIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8cGF0aCBkPSJNMzYyIDk4IEw0MjQgNzAgTDQ4NiA5OCBWMTc4IEgzNjIgWiIgZmlsbD0idmFyKC0tc3VyZmFjZSkiIHN0cm9rZT0idmFyKC0tbGluZSkiIHN0cm9rZS13aWR0aD0iMiIvPgo8cmVjdCB4PSIzODgiIHk9IjEyNCIgd2lkdGg9IjcyIiBoZWlnaHQ9IjU0IiByeD0iNCIgZmlsbD0idmFyKC0taWNlKSIvPgo8ZyBmaWxsPSJ2YXIoLS1za3kpIj48cmVjdCB4PSIzOTYiIHk9IjE0NCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjE2IiByeD0iMiIvPjxyZWN0IHg9IjQyNCIgeT0iMTQ0IiB3aWR0aD0iMjQiIGhlaWdodD0iMTYiIHJ4PSIyIi8+PHJlY3QgeD0iNDEwIiB5PSIxMzAiIHdpZHRoPSIyNCIgaGVpZ2h0PSIxNCIgcng9IjIiLz48L2c+CjxnIGNsYXNzPSJ0cnVjayI+PHJlY3QgeD0iMzcyIiB5PSIxODgiIHdpZHRoPSI1OCIgaGVpZ2h0PSIyNCIgcng9IjUiIGZpbGw9InZhcigtLWFjY2VudC1zdHJvbmcpIi8+PHBhdGggZD0iTTQzMCAxOTQgaDE4IGwxMCAxMCB2OCBoLTI4eiIgZmlsbD0idmFyKC0tYWNjZW50KSIvPjxjaXJjbGUgY3g9IjM4OCIgY3k9IjIxNCIgcj0iNiIgZmlsbD0idmFyKC0taW5rKSIvPjxjaXJjbGUgY3g9IjQ0NiIgY3k9IjIxNCIgcj0iNiIgZmlsbD0idmFyKC0taW5rKSIvPjwvZz48L3N2Zz5gOwpjb25zdCBFTVBUWV9TVkcgPSBgPHN2ZyB2aWV3Qm94PSIwIDAgMTQwIDEwMCIgYXJpYS1oaWRkZW49InRydWUiPjxyZWN0IHg9IjIwIiB5PSIzMCIgd2lkdGg9IjEwMCIgaGVpZ2h0PSI2MiIgcng9IjEwIiBmaWxsPSJ2YXIoLS1pY2UpIi8+PHBhdGggZD0iTTIwIDQ2aDEwMCIgc3Ryb2tlPSJ2YXIoLS1za3kpIiBzdHJva2Utd2lkdGg9IjMiLz48cmVjdCB4PSIzNiIgeT0iNTgiIHdpZHRoPSI0MCIgaGVpZ2h0PSI3IiByeD0iMy41IiBmaWxsPSJ2YXIoLS1za3kpIi8+PHJlY3QgeD0iMzYiIHk9IjcxIiB3aWR0aD0iMjYiIGhlaWdodD0iNyIgcng9IjMuNSIgZmlsbD0idmFyKC0tc2t5KSIgb3BhY2l0eT0iLjYiLz48Y2lyY2xlIGN4PSIxMDQiIGN5PSIyMiIgcj0iMTQiIGZpbGw9InZhcigtLW9rKSIvPjxwYXRoIGQ9Ik05NyAyMmw1IDUgOS0xMCIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjMuNCIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+YDsKY29uc3QgUlVMRV9TVkcgPSBgPHN2ZyB2aWV3Qm94PSIwIDAgMTMwIDgwIiBhcmlhLWhpZGRlbj0idHJ1ZSI+PHJlY3QgeD0iNCIgeT0iMTAiIHdpZHRoPSI3OCIgaGVpZ2h0PSI2MiIgcng9IjEwIiBmaWxsPSJ2YXIoLS1zdXJmYWNlKSIgc3Ryb2tlPSJ2YXIoLS1saW5lKSIgc3Ryb2tlLXdpZHRoPSIyIi8+PHJlY3QgeD0iMTQiIHk9IjIyIiB3aWR0aD0iNDQiIGhlaWdodD0iOCIgcng9IjQiIGZpbGw9InZhcigtLW9rKSIvPjxyZWN0IHg9IjE0IiB5PSIzNiIgd2lkdGg9IjQ0IiBoZWlnaHQ9IjgiIHJ4PSI0IiBmaWxsPSJ2YXIoLS1vaykiLz48cmVjdCB4PSIxNCIgeT0iNTAiIHdpZHRoPSI0NCIgaGVpZ2h0PSI4IiByeD0iNCIgZmlsbD0idmFyKC0tbG9jaykiLz48cGF0aCBkPSJNODggNDFoMTQiIHN0cm9rZT0idmFyKC0tbXV0ZWQpIiBzdHJva2Utd2lkdGg9IjIuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PHBhdGggZD0iTTk4IDM2bDUgNS01IDUiIHN0cm9rZT0idmFyKC0tbXV0ZWQpIiBzdHJva2Utd2lkdGg9IjIuNSIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PHJlY3QgeD0iMTA2IiB5PSIyOCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjI2IiByeD0iNSIgZmlsbD0idmFyKC0tbG9jaykiLz48cmVjdCB4PSIxMTEiIHk9IjQwIiB3aWR0aD0iMTAiIGhlaWdodD0iOSIgcng9IjIiIGZpbGw9IiNmZmYiLz48cGF0aCBkPSJNMTEzIDQwdi0zYTMgMyAwIDAxNiAwdjMiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSJub25lIi8+PC9zdmc+YDsKCi8vIC0tLS0tLS0tLS0gbG9naW4gLS0tLS0tLS0tLQpmdW5jdGlvbiByZW5kZXJMb2dpbihkZW1vKSB7CiAgJCgnI2FwcCcpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJsb2dpbiI+PGRpdiBjbGFzcz0iY2FyZCI+CiAgICA8ZGl2IGNsYXNzPSJhcnQiPiR7SEVST19TVkd9PC9kaXY+CiAgICA8Zm9ybSBpZD0ibG9naW5Gb3JtIj4KICAgICAgPGgxPkV0aXF1ZXRhSHViPC9oMT4KICAgICAgPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjAiPkV0aXF1ZXRhcyBkZSBNZXJjYWRvIExpYnJlLCBGYWxhYmVsbGEgeSBQYXJpcyBlbiB1bmEgc29sYSBiYW5kZWphLjwvcD4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5Db3JyZW88aW5wdXQgdHlwZT0iZW1haWwiIGlkPSJsRW1haWwiIGF1dG9jb21wbGV0ZT0idXNlcm5hbWUiIHJlcXVpcmVkPjwvbGFiZWw+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+Q29udHJhc2XDsWE8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJsUGFzcyIgYXV0b2NvbXBsZXRlPSJjdXJyZW50LXBhc3N3b3JkIiByZXF1aXJlZD48L2xhYmVsPgogICAgICA8ZGl2IGNsYXNzPSJlcnIiIGlkPSJsRXJyIj48L2Rpdj4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiPkVudHJhcjwvYnV0dG9uPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUiIHR5cGU9ImJ1dHRvbiIgaWQ9ImZvcmdvdCI+wr9PbHZpZGFzdGUgdHUgY29udHJhc2XDsWE/PC9idXR0b24+CiAgICAgIDxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9Im1hcmdpbjowO2ZvbnQtc2l6ZToxMi41cHg7dGV4dC1hbGlnbjpjZW50ZXIiPsK/VGllbmVzIHVuYSBjbGF2ZSBkZSByZXNwYWxkbyAoUlNQLeKApik/IEVzY3LDrWJlbGEgZW4gQ29udHJhc2XDsWEuPC9wPgogICAgICAke2RlbW8gPyAnPGRpdiBjbGFzcz0iZGVtby1oaW50Ij5Nb2RvIGRlbW86IGVudHJhIGNvbiA8Yj5ib2RlZ2FAZGVtby5jbDwvYj4sIDxiPnZlbmRlZG9yMUBkZW1vLmNsPC9iPiBvIDxiPmFkbWluQGRlbW8uY2w8L2I+LCBjbGF2ZSA8Yj5kZW1vMTIzNDwvYj4uPC9kaXY+JyA6ICcnfQogICAgPC9mb3JtPjwvZGl2PjwvZGl2PmA7CiAgJCgnI2xvZ2luRm9ybScpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICBlLnByZXZlbnREZWZhdWx0KCk7CiAgICAkKCcjbEVycicpLnRleHRDb250ZW50ID0gJyc7CiAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvbG9naW4nLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGVtYWlsOiAkKCcjbEVtYWlsJykudmFsdWUsIHBhc3N3b3JkOiAkKCcjbFBhc3MnKS52YWx1ZSB9IH0pOyBib290KCk7IH0KICAgIGNhdGNoIChlcnIpIHsgJCgnI2xFcnInKS50ZXh0Q29udGVudCA9IGVyci5tZXNzYWdlOyB9CiAgfTsKICAkKCcjZm9yZ290Jykub25jbGljayA9ICgpID0+IHJlbmRlckZvcmdvdCgkKCcjbEVtYWlsJykudmFsdWUpOwp9CgovLyBSZWN1cGVyYXIgY29udHJhc2XDsWE6IGNvcnJlbyAtPiBjw7NkaWdvIGRlIDYgZMOtZ2l0b3MgLT4gZW50cmFyIG8gY2FtYmlhciBjb250cmFzZcOxYQpmdW5jdGlvbiByZW5kZXJGb3Jnb3QocHJlZmlsbCA9ICcnKSB7CiAgbGV0IGVtYWlsID0gcHJlZmlsbCwgY29kZSA9ICcnOwogIGNvbnN0IHNoZWxsID0gaW5uZXIgPT4geyAkKCcjYXBwJykuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9ImxvZ2luIj48ZGl2IGNsYXNzPSJjYXJkIj48ZGl2IGNsYXNzPSJhcnQiPiR7SEVST19TVkd9PC9kaXY+PGZvcm0gaWQ9ImZGb3JtIj4ke2lubmVyfTxkaXYgY2xhc3M9ImVyciIgaWQ9ImZFcnIiPjwvZGl2PjwvZm9ybT48L2Rpdj48L2Rpdj5gOyB9OwogIGNvbnN0IGJhY2sgPSAoKSA9PiB7IGNvbnN0IGIgPSAkKCcjZkJhY2snKTsgaWYgKGIpIGIub25jbGljayA9ICgpID0+IHJlbmRlckxvZ2luKCk7IH07CiAgY29uc3QgZXJyID0gbSA9PiB7ICQoJyNmRXJyJykudGV4dENvbnRlbnQgPSBtOyB9OwogIGZ1bmN0aW9uIHN0ZXBFbWFpbCgpIHsKICAgIHNoZWxsKGA8aDE+UmVjdXBlcmFyIGFjY2VzbzwvaDE+PHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjAiPkVzY3JpYmUgdHUgY29ycmVvIHkgdGUgZW52aWFyZW1vcyB1biBjw7NkaWdvIGRlIDYgZMOtZ2l0b3MuPC9wPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPkNvcnJlbzxpbnB1dCB0eXBlPSJlbWFpbCIgaWQ9ImZFbWFpbCIgYXV0b2NvbXBsZXRlPSJ1c2VybmFtZSIgcmVxdWlyZWQgdmFsdWU9IiR7ZXNjKGVtYWlsKX0iPjwvbGFiZWw+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgdHlwZT0ic3VibWl0Ij5FbnZpYXIgY8OzZGlnbzwvYnV0dG9uPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSIgdHlwZT0iYnV0dG9uIiBpZD0iZkJhY2siPlZvbHZlcjwvYnV0dG9uPmApOwogICAgYmFjaygpOwogICAgJCgnI2ZGb3JtJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpOyBlbWFpbCA9ICQoJyNmRW1haWwnKS52YWx1ZS50cmltKCk7CiAgICAgIGNvbnN0IGIgPSBlLnN1Ym1pdHRlcjsgaWYgKGIpIGIuZGlzYWJsZWQgPSB0cnVlOwogICAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvcGFzc3dvcmQvZm9yZ290JywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBlbWFpbCB9IH0pOyBzdGVwQ29kZSgpOyB9CiAgICAgIGNhdGNoICh4KSB7IGVycih4Lm1lc3NhZ2UpOyBpZiAoYikgYi5kaXNhYmxlZCA9IGZhbHNlOyB9CiAgICB9OwogIH0KICBmdW5jdGlvbiBzdGVwQ29kZSgpIHsKICAgIHNoZWxsKGA8aDE+UmV2aXNhIHR1IGNvcnJlbzwvaDE+PHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjAiPlNpIDxiPiR7ZXNjKGVtYWlsKX08L2I+IGVzdMOhIHJlZ2lzdHJhZG8sIHRlIGxsZWfDsyB1biBjw7NkaWdvIGRlIDYgZMOtZ2l0b3MuIFZlbmNlIGVuIDE1IG1pbnV0b3MuIFJldmlzYSB0YW1iacOpbiBsYSBjYXJwZXRhIGRlIHNwYW0uPC9wPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPkPDs2RpZ288aW5wdXQgdHlwZT0idGV4dCIgaWQ9ImZDb2RlIiBpbnB1dG1vZGU9Im51bWVyaWMiIGF1dG9jb21wbGV0ZT0ib25lLXRpbWUtY29kZSIgbWF4bGVuZ3RoPSI2IiBwYXR0ZXJuPSJbMC05XXs2fSIgcmVxdWlyZWQgc3R5bGU9ImZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZToyNHB4O2xldHRlci1zcGFjaW5nOjhweDt0ZXh0LWFsaWduOmNlbnRlciI+PC9sYWJlbD4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiPkNvbnRpbnVhcjwvYnV0dG9uPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUiIHR5cGU9ImJ1dHRvbiIgaWQ9ImZSZXNlbmQiPkVudmlhciBvdHJvIGPDs2RpZ288L2J1dHRvbj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUiIHR5cGU9ImJ1dHRvbiIgaWQ9ImZCYWNrIj5Wb2x2ZXI8L2J1dHRvbj5gKTsKICAgIGJhY2soKTsKICAgICQoJyNmQ29kZScpLmZvY3VzKCk7CiAgICAkKCcjZlJlc2VuZCcpLm9uY2xpY2sgPSBhc3luYyAoKSA9PiB7IHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9wYXNzd29yZC9mb3Jnb3QnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGVtYWlsIH0gfSk7IHRvYXN0KCdDw7NkaWdvIHJlZW52aWFkbycpOyB9IGNhdGNoICh4KSB7IGVycih4Lm1lc3NhZ2UpOyB9IH07CiAgICAkKCcjZkZvcm0nKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4gewogICAgICBlLnByZXZlbnREZWZhdWx0KCk7IGNvZGUgPSAkKCcjZkNvZGUnKS52YWx1ZS50cmltKCk7CiAgICAgIHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9wYXNzd29yZC9jaGVjaycsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgZW1haWwsIGNvZGUgfSB9KTsgc3RlcENob29zZSgpOyB9CiAgICAgIGNhdGNoICh4KSB7IGVycih4Lm1lc3NhZ2UpOyB9CiAgICB9OwogIH0KICBmdW5jdGlvbiBzdGVwQ2hvb3NlKCkgewogICAgc2hlbGwoYDxoMT5Dw7NkaWdvIGNvcnJlY3RvPC9oMT48cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJtYXJnaW46MCI+wr9RdcOpIHF1aWVyZXMgaGFjZXI/PC9wPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIHR5cGU9ImJ1dHRvbiIgaWQ9ImZMb2dpbiI+RW50cmFyIGFob3JhPC9idXR0b24+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tZ2hvc3QiIHR5cGU9ImJ1dHRvbiIgaWQ9ImZDaGFuZ2UiPkNhbWJpYXIgbWkgY29udHJhc2XDsWE8L2J1dHRvbj5gKTsKICAgICQoJyNmTG9naW4nKS5vbmNsaWNrID0gYXN5bmMgKCkgPT4geyB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvcGFzc3dvcmQvbG9naW4nLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGVtYWlsLCBjb2RlIH0gfSk7IGJvb3QoKTsgfSBjYXRjaCAoeCkgeyBlcnIoeC5tZXNzYWdlKTsgfSB9OwogICAgJCgnI2ZDaGFuZ2UnKS5vbmNsaWNrID0gc3RlcE5ldzsKICB9CiAgZnVuY3Rpb24gc3RlcE5ldygpIHsKICAgIHNoZWxsKGA8aDE+TnVldmEgY29udHJhc2XDsWE8L2gxPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPk51ZXZhIGNvbnRyYXNlw7FhIChtw61uaW1vIDgpPGlucHV0IHR5cGU9InBhc3N3b3JkIiBpZD0iZlAxIiBhdXRvY29tcGxldGU9Im5ldy1wYXNzd29yZCIgbWlubGVuZ3RoPSI4IiByZXF1aXJlZD48L2xhYmVsPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPlJlcMOtdGVsYTxpbnB1dCB0eXBlPSJwYXNzd29yZCIgaWQ9ImZQMiIgYXV0b2NvbXBsZXRlPSJuZXctcGFzc3dvcmQiIG1pbmxlbmd0aD0iOCIgcmVxdWlyZWQ+PC9sYWJlbD4KICAgICAgPGxhYmVsIGNsYXNzPSJzd2l0Y2giIHN0eWxlPSJmb250LXNpemU6MTNweCI+PGlucHV0IHR5cGU9ImNoZWNrYm94IiBpZD0iZlNob3ciPiBNb3N0cmFyIGNvbnRyYXNlw7FhPC9sYWJlbD4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiPkd1YXJkYXIgeSBlbnRyYXI8L2J1dHRvbj5gKTsKICAgICQoJyNmU2hvdycpLm9uY2hhbmdlID0gZSA9PiB7ICQoJyNmUDEnKS50eXBlID0gJCgnI2ZQMicpLnR5cGUgPSBlLnRhcmdldC5jaGVja2VkID8gJ3RleHQnIDogJ3Bhc3N3b3JkJzsgfTsKICAgICQoJyNmRm9ybScpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICAgIGUucHJldmVudERlZmF1bHQoKTsKICAgICAgaWYgKCQoJyNmUDEnKS52YWx1ZSAhPT0gJCgnI2ZQMicpLnZhbHVlKSByZXR1cm4gZXJyKCdMYXMgY29udHJhc2XDsWFzIG5vIGNvaW5jaWRlbicpOwogICAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvcGFzc3dvcmQvcmVzZXQnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGVtYWlsLCBjb2RlLCBwYXNzd29yZDogJCgnI2ZQMScpLnZhbHVlIH0gfSk7IHRvYXN0KCdDb250cmFzZcOxYSBhY3R1YWxpemFkYScpOyBib290KCk7IH0KICAgICAgY2F0Y2ggKHgpIHsgZXJyKHgubWVzc2FnZSk7IH0KICAgIH07CiAgfQogIHN0ZXBFbWFpbCgpOwp9CgpmdW5jdGlvbiByZW5kZXJTZXR1cCgpIHsKICAkKCcjYXBwJykuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9ImxvZ2luIj48ZGl2IGNsYXNzPSJjYXJkIj4KICAgIDxkaXYgY2xhc3M9ImFydCI+JHtIRVJPX1NWR308L2Rpdj4KICAgIDxmb3JtIGlkPSJzZXR1cEZvcm0iPgogICAgICA8aDE+QmllbnZlbmlkbzwvaDE+CiAgICAgIDxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9Im1hcmdpbjowIj5DcmVhIGxhIGN1ZW50YSBkZSBhZG1pbmlzdHJhZG9yLiBDb24gZWxsYSBhZ3JlZ2FzIHZlbmRlZG9yZXMsIHVzdWFyaW9zIHkgbGEgY29uZXhpw7NuIGEgTWVyY2FkbyBMaWJyZS48L3A+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+VHUgbm9tYnJlPGlucHV0IHR5cGU9InRleHQiIGlkPSJzTmFtZSIgcmVxdWlyZWQ+PC9sYWJlbD4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5Db3JyZW88aW5wdXQgdHlwZT0iZW1haWwiIGlkPSJzRW1haWwiIGF1dG9jb21wbGV0ZT0idXNlcm5hbWUiIHJlcXVpcmVkPjwvbGFiZWw+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+Q29udHJhc2XDsWEgKG3DrW5pbW8gOCk8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJzUGFzcyIgYXV0b2NvbXBsZXRlPSJuZXctcGFzc3dvcmQiIG1pbmxlbmd0aD0iOCIgcmVxdWlyZWQ+PC9sYWJlbD4KICAgICAgPGxhYmVsIGNsYXNzPSJzd2l0Y2giIHN0eWxlPSJmb250LXNpemU6MTNweCI+PGlucHV0IHR5cGU9ImNoZWNrYm94IiBpZD0ic1Nob3ciPiBNb3N0cmFyIGNvbnRyYXNlw7FhPC9sYWJlbD4KICAgICAgPGRpdiBjbGFzcz0iZXJyIiBpZD0ic0VyciI+PC9kaXY+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgdHlwZT0ic3VibWl0Ij5DcmVhciBhZG1pbmlzdHJhZG9yPC9idXR0b24+CiAgICA8L2Zvcm0+PC9kaXY+PC9kaXY+YDsKICAkKCcjc1Nob3cnKS5vbmNoYW5nZSA9IGUgPT4geyAkKCcjc1Bhc3MnKS50eXBlID0gZS50YXJnZXQuY2hlY2tlZCA/ICd0ZXh0JyA6ICdwYXNzd29yZCc7IH07CiAgJCgnI3NldHVwRm9ybScpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICBlLnByZXZlbnREZWZhdWx0KCk7CiAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvc2V0dXAnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IG5hbWU6ICQoJyNzTmFtZScpLnZhbHVlLCBlbWFpbDogJCgnI3NFbWFpbCcpLnZhbHVlLCBwYXNzd29yZDogJCgnI3NQYXNzJykudmFsdWUgfSB9KTsgYm9vdCgpOyB9CiAgICBjYXRjaCAoZXJyKSB7ICQoJyNzRXJyJykudGV4dENvbnRlbnQgPSBlcnIubWVzc2FnZTsgfQogIH07Cn0KCi8vIC0tLS0tLS0tLS0gZXN0cnVjdHVyYSAtLS0tLS0tLS0tCmZ1bmN0aW9uIHRhYnNGb3Iocm9sZSkgewogIGlmIChyb2xlID09PSAnc2VsbGVyJykgcmV0dXJuIFtbJ3RyYXknLCAnTWlzIGV0aXF1ZXRhcyddLCBbJ21rcCcsICdNS1AgRmxhc2gnXSwgWydzYWxlcycsICdBbsOhbGlzaXMgdmVudGFzJ10sIFsndW5pdHMnLCAnUHJvdmVlZG9yIEZ1bGZpbGxtZW50J10sIFsnc2VsbGVyJywgJ01pIGN1ZW50YSddXTsKICBpZiAocm9sZSA9PT0gJ2FnZW5jaWEnKSByZXR1cm4gW1snY29kZXMnLCAnQ8OzZGlnb3MgZGUgZGV2b2x1Y2nDs24nXV07CiAgaWYgKHJvbGUgPT09ICdmdWxmaWxsbWVudCcpIHJldHVybiBbWyd0cmF5JywgJ0JhbmRlamEgZGUgZXRpcXVldGFzJ10sIFsndW5pdHMnLCAnUHJvdmVlZG9yIEZ1bGZpbGxtZW50J10sIFsnc2VsbGVyc1ZpZXcnLCAnVmVuZGVkb3JlcyddXTsKICByZXR1cm4gW1sndHJheScsICdCYW5kZWphJ10sIFsnbWtwJywgJ01LUCBGbGFzaCddLCBbJ3NhbGVzJywgJ0Fuw6FsaXNpcyB2ZW50YXMnXSwgWyd1bml0cycsICdQcm92ZWVkb3IgRnVsZmlsbG1lbnQnXSwgWydzZWxsZXInLCAnVmVuZGVkb3JlcyddLCBbJ2FkbWluJywgJ1VzdWFyaW9zIHkgYWp1c3RlcyddXTsKfQpmdW5jdGlvbiByZW5kZXJTaGVsbCgpIHsKICBjb25zdCB0YWJzID0gdGFic0ZvcihtZS51c2VyLnJvbGUpOwogIGlmICghdGFiIHx8ICF0YWJzLnNvbWUodCA9PiB0WzBdID09PSB0YWIpKSB0YWIgPSBzdG9yZS5nZXQoJ3RhYicsIHRhYnNbMF1bMF0pOwogIGlmICghdGFicy5zb21lKHQgPT4gdFswXSA9PT0gdGFiKSkgdGFiID0gdGFic1swXVswXTsKICAkKCcjYXBwJykuaW5uZXJIVE1MID0gYAogIDxoZWFkZXIgY2xhc3M9InRvcCI+PGRpdiBjbGFzcz0id3JhcCI+CiAgICA8YSBjbGFzcz0iYnJhbmQiIGhyZWY9Ii8iPjxpbWcgc3JjPSIvbG9nby5zdmciIGFsdD0iIj5FdGlxdWV0YUh1YjwvYT4KICAgICR7dGFicy5sZW5ndGggPiAxID8gYDxuYXYgY2xhc3M9Im5hdiI+JHt0YWJzLm1hcCgoW2ssIG5dKSA9PiBgPGJ1dHRvbiBkYXRhLXRhYj0iJHtrfSIgYXJpYS1jdXJyZW50PSIke2sgPT09IHRhYn0iPiR7bn08L2J1dHRvbj5gKS5qb2luKCcnKX08L25hdj5gIDogJyd9CiAgICA8c3BhbiBjbGFzcz0ic3BhY2VyIj48L3NwYW4+CiAgICAke21lLnVzZXIucm9sZSA9PT0gJ2FnZW5jaWEnID8gJycgOiBgPHNwYW4gY2xhc3M9ImxpdmUiIGlkPSJsaXZlIj48aT48L2k+PHNwYW4+Q29uZWN0YW5kb+KApjwvc3Bhbj48L3NwYW4+CiAgICA8ZGl2IGNsYXNzPSJjbG9jayIgaWQ9ImNsb2NrIj4ke0kuY2xvY2sucmVwbGFjZSgnPHN2ZycsICc8c3ZnIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgc3R5bGU9ImNvbG9yOnZhcigtLWFjY2VudCkiJyl9PGRpdj48c21hbGw+Q29ydGUgJHtlc2MobWUuY3V0b2ZmKX08L3NtYWxsPjxiIGlkPSJjZCI+LS06LS06LS08L2I+PC9kaXY+PC9kaXY+YH0KICAgICR7bWUudXNlci5yb2xlID09PSAnYWdlbmNpYScgPyAnJyA6IGA8YnV0dG9uIGNsYXNzPSJ1bmRvLWJ0biIgaWQ9InVuZG9CdG4iIGRpc2FibGVkPjxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjIuNCIgYXJpYS1oaWRkZW49InRydWUiPjxwYXRoIGQ9Ik05IDE0TDQgOWw1LTUiLz48cGF0aCBkPSJNNCA5aDEwYTYgNiAwIDAxMCAxMmgtMyIvPjwvc3ZnPjxzcGFuPjxiPkRlc2hhY2VyPC9iPjxzbWFsbD5OYWRhIHF1ZSBkZXNoYWNlcjwvc21hbGw+PC9zcGFuPjwvYnV0dG9uPmB9CiAgICA8ZGl2IGNsYXNzPSJ1c2VyIj48ZGl2PjxiPiR7ZXNjKG1lLnNlbGxlcj8ubmFtZSB8fCBtZS51c2VyLm5hbWUpfTwvYj48c21hbGw+JHtlc2MobWUudXNlci5lbWFpbCl9PC9zbWFsbD48L2Rpdj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBpZD0ibXlBY2MiPk1pIGNsYXZlPC9idXR0b24+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgaWQ9ImxvZ291dCI+U2FsaXI8L2J1dHRvbj48L2Rpdj4KICA8L2Rpdj48L2hlYWRlcj4KICA8bWFpbiBjbGFzcz0id3JhcCIgaWQ9Im1haW4iPjwvbWFpbj5gOwogICQkKCcubmF2IGJ1dHRvbicpLmZvckVhY2goYiA9PiBiLm9uY2xpY2sgPSAoKSA9PiB7IHRhYiA9IGIuZGF0YXNldC50YWI7IHN0b3JlLnNldCgndGFiJywgdGFiKTsgJCQoJy5uYXYgYnV0dG9uJykuZm9yRWFjaCh4ID0+IHguc2V0QXR0cmlidXRlKCdhcmlhLWN1cnJlbnQnLCB4ID09PSBiKSk7IHJlbmRlclRhYigpOyB9KTsKICAkKCcjbXlBY2MnKS5vbmNsaWNrID0gKCkgPT4gcmVuZGVyTXlBY2NvdW50KCk7CiAgaWYgKCQoJyN1bmRvQnRuJykpIHsgJCgnI3VuZG9CdG4nKS5vbmNsaWNrID0gdW5kb0xhc3Q7IHJlZnJlc2hVbmRvKCk7IH0KICBpZiAobWUuaW1wZXJzb25hdGVkQnkpIHsKICAgIGNvbnN0IGJhciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpOwogICAgYmFyLnN0eWxlLmNzc1RleHQgPSAnYmFja2dyb3VuZDp2YXIoLS13YXJuLWJnKTtjb2xvcjp2YXIoLS13YXJuKTtmb250LXdlaWdodDo3MDA7cGFkZGluZzoxMHB4IDE2cHg7ZGlzcGxheTpmbGV4O2dhcDoxMnB4O2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyO2ZsZXgtd3JhcDp3cmFwJzsKICAgIGJhci5pbm5lckhUTUwgPSBgRXN0w6FzIHZpZW5kbyBsYSBjdWVudGEgZGUgJHtlc2MobWUudXNlci5uYW1lKX0gKCR7ZXNjKG1lLnVzZXIuZW1haWwpfSkgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IGJ0bi1zbSIgaWQ9InN0b3BJbXAiPlZvbHZlciBhIG1pIGN1ZW50YTwvYnV0dG9uPmA7CiAgICAkKCcjYXBwJykucHJlcGVuZChiYXIpOwogICAgJCgnI3N0b3BJbXAnKS5vbmNsaWNrID0gYXN5bmMgKCkgPT4geyBhd2FpdCBhcGkoJy9hcGkvaW1wZXJzb25hdGUvc3RvcCcsIHsgbWV0aG9kOiAnUE9TVCcgfSk7IGxvY2F0aW9uLmhyZWYgPSAnLyc7IH07CiAgfQogICQoJyNsb2dvdXQnKS5vbmNsaWNrID0gYXN5bmMgKCkgPT4geyBhd2FpdCBhcGkoJy9hcGkvbG9nb3V0JywgeyBtZXRob2Q6ICdQT1NUJyB9KS5jYXRjaCgoKSA9PiB7fSk7IGxvY2F0aW9uLnJlbG9hZCgpOyB9OwogIHN0YXJ0Q2xvY2soKTsgY29ubmVjdFN0cmVhbSgpOyByZW5kZXJUYWIoKTsgd2F0Y2hWZXJzaW9uKCk7Cn0KLy8gU2kgc2UgcHVibGljYSB1bmEgdmVyc2nDs24gbnVldmEgZGUgbGEgYXBwLCBsYSBwYW50YWxsYSBzZSBhY3R1YWxpemEgc29sYQpmdW5jdGlvbiB3YXRjaFZlcnNpb24oKSB7CiAgaWYgKHdhdGNoVmVyc2lvbi5faSkgcmV0dXJuOwogIGNvbnN0IGNoZWNrID0gYXN5bmMgKCkgPT4gewogICAgdHJ5IHsKICAgICAgY29uc3QgeyB2IH0gPSBhd2FpdCBmZXRjaCgnL2hlYWx0aCcsIHsgY2FjaGU6ICduby1zdG9yZScgfSkudGhlbihyID0+IHIuanNvbigpKTsKICAgICAgaWYgKCF3YXRjaFZlcnNpb24udikgd2F0Y2hWZXJzaW9uLnYgPSB2OwogICAgICBlbHNlIGlmICh2ICYmIHYgIT09IHdhdGNoVmVyc2lvbi52ICYmICFkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdpbnB1dDpmb2N1cywgdGV4dGFyZWE6Zm9jdXMnKSkgbG9jYXRpb24ucmVsb2FkKCk7CiAgICB9IGNhdGNoIHt9CiAgfTsKICBjaGVjaygpOyB3YXRjaFZlcnNpb24uX2kgPSBzZXRJbnRlcnZhbChjaGVjaywgNjAwMDApOwp9CmZ1bmN0aW9uIHJlbmRlclRhYigpIHsgKHsgbWtwOiByZW5kZXJNa3AsIGNvZGVzOiByZW5kZXJDb2Rlc1BhZ2UsIHRyYXk6IHJlbmRlclRyYXksIHNlbGxlcjogcmVuZGVyU2VsbGVyLCBhZG1pbjogcmVuZGVyQWRtaW4sIHNlbGxlcnNWaWV3OiByZW5kZXJTZWxsZXJzVmlldywgc2FsZXM6IHJlbmRlclNhbGVzLCB1bml0czogcmVuZGVyVW5pdHMgfSlbdGFiXSgpOyB9CgovLyBSZXN1bWVuIHZpc3VhbCBkZSB1bmlkYWRlcyAoc2VjY2nDs24gc2luIHByZWNpb3MpOiB0YXJqZXRhcywgdW5pZGFkZXMgcG9yIGTDrWEsIHRvcCBwdWJsaWNhY2lvbmVzIHkgcG9yIHZlbmRlZG9yCmZ1bmN0aW9uIHVuaXRzVml6KGQsIHJvd3MsIGZyb20sIHRvLCBhbGwpIHsKICBjb25zdCB1bml0cyA9IHJvd3MucmVkdWNlKChhLCByKSA9PiBhICsgci5xdHksIDApLCBvcmRlcnMgPSByb3dzLnJlZHVjZSgoYSwgcikgPT4gYSArIHIub3JkZXJzLCAwKTsKICBjb25zdCB0b3AgPSByb3dzWzBdOwogIGNvbnN0IG1rVG90ID0gayA9PiByb3dzLnJlZHVjZSgoYSwgcikgPT4gYSArIChyLmJ5TWtba10gfHwgMCksIDApOwogIGNvbnN0IGJhciA9IChsYWJlbCwgdmFsdWUsIG1heCwgY29sb3IsIHN1YikgPT4gYDxkaXYgY2xhc3M9ImhiIj48ZGl2IGNsYXNzPSJoYi1sIj48c3BhbiBjbGFzcz0iaGItbmFtZSI+JHtsYWJlbH08L3NwYW4+JHtzdWIgPyBgPHNtYWxsPiR7c3VifTwvc21hbGw+YCA6ICcnfTwvZGl2PjxkaXYgY2xhc3M9ImhiLXRyYWNrIj48aSBzdHlsZT0id2lkdGg6JHtNYXRoLm1heCgyLCBNYXRoLnJvdW5kKHZhbHVlIC8gbWF4ICogMTAwKSl9JTtiYWNrZ3JvdW5kOiR7Y29sb3J9Ij48L2k+PC9kaXY+PGIgY2xhc3M9ImhiLXYiPiR7dmFsdWUudG9Mb2NhbGVTdHJpbmcoJ2VzLUNMJyl9PC9iPjwvZGl2PmA7CiAgY29uc3QgdG9wMTAgPSByb3dzLnNsaWNlKDAsIDEwKSwgbWF4VG9wID0gTWF0aC5tYXgoMSwgLi4udG9wMTAubWFwKHIgPT4gci5xdHkpKTsKICBsZXQgYnlTZWxsZXIgPSAnJzsKICBpZiAoYWxsKSB7CiAgICBjb25zdCBtID0gbmV3IE1hcCgpOyByb3dzLmZvckVhY2gociA9PiBtLnNldChyLnNlbGxlciwgKG0uZ2V0KHIuc2VsbGVyKSB8fCAwKSArIHIucXR5KSk7CiAgICBjb25zdCBsaXN0ID0gWy4uLm0uZW50cmllcygpXS5zb3J0KChhLCBiKSA9PiBiWzFdIC0gYVsxXSksIG14ID0gTWF0aC5tYXgoMSwgLi4ubGlzdC5tYXAoeCA9PiB4WzFdKSk7CiAgICBieVNlbGxlciA9IGA8ZGl2IGNsYXNzPSJwYW5lbCB1di1jYXJkIj48ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj48aDI+VW5pZGFkZXMgcG9yIHZlbmRlZG9yPC9oMj48L2Rpdj48ZGl2IGNsYXNzPSJwYW5lbC1ib2R5Ij4ke2xpc3QubWFwKChbbiwgdl0pID0+IGJhcihlc2MobiksIHYsIG14LCAndmFyKC0tYWNjZW50KScsIGAke01hdGgucm91bmQodiAvIHVuaXRzICogMTAwKX0lIGRlbCB0b3RhbGApKS5qb2luKCcnKX08L2Rpdj48L2Rpdj5gOwogIH0KICByZXR1cm4gYDxkaXYgY2xhc3M9InV2Ij4KICAgIDxkaXYgY2xhc3M9InV2LWtwaXMiPgogICAgICA8ZGl2IGNsYXNzPSJrcGkga3BpLWhlcm8iPjxzbWFsbD5VbmlkYWRlcyB2ZW5kaWRhczwvc21hbGw+PGI+JHt1bml0cy50b0xvY2FsZVN0cmluZygnZXMtQ0wnKX08L2I+PHNwYW4+JHtlc2MoZm10RChmcm9tKSl9IOKAkyAke2VzYyhmbXREKHRvKSl9PC9zcGFuPjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJrcGkiPjxzbWFsbD5QZWRpZG9zPC9zbWFsbD48Yj4ke29yZGVycy50b0xvY2FsZVN0cmluZygnZXMtQ0wnKX08L2I+PHNwYW4+dmVudGFzIGNvbiBlc3RvcyBwcm9kdWN0b3M8L3NwYW4+PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9ImtwaSI+PHNtYWxsPlB1YmxpY2FjaW9uZXMgdmVuZGlkYXM8L3NtYWxsPjxiPiR7cm93cy5sZW5ndGgudG9Mb2NhbGVTdHJpbmcoJ2VzLUNMJyl9PC9iPjxzcGFuPmRpc3RpbnRhczwvc3Bhbj48L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0ia3BpIj48c21hbGw+8J+PhiBMYSBtw6FzIHZlbmRpZGE8L3NtYWxsPjxiIHN0eWxlPSJmb250LXNpemU6MTdweDtsaW5lLWhlaWdodDoxLjI1Ij4ke2VzYygodG9wPy5uYW1lIHx8ICfigJQnKS5zbGljZSgwLCA0OCkpfSR7KHRvcD8ubmFtZSB8fCAnJykubGVuZ3RoID4gNDggPyAn4oCmJyA6ICcnfTwvYj48c3Bhbj4ke3RvcCA/IHRvcC5xdHkudG9Mb2NhbGVTdHJpbmcoJ2VzLUNMJykgKyAnIHVuaWRhZGVzJyA6ICcnfTwvc3Bhbj48L2Rpdj4KICAgIDwvZGl2PgogICAgPGRpdiBjbGFzcz0idXYtbWsiPiR7WydtbCcsICdmYScsICdwYSddLm1hcChrID0+IGA8c3Bhbj48aSBjbGFzcz0iZG90IiBzdHlsZT0iYmFja2dyb3VuZDoke01LX0NPTE9SW2tdfSI+PC9pPiR7TUtba119IDxiPiR7bWtUb3QoaykudG9Mb2NhbGVTdHJpbmcoJ2VzLUNMJyl9PC9iPiB1bmlkLiA8c21hbGw+KCR7dW5pdHMgPyBNYXRoLnJvdW5kKG1rVG90KGspIC8gdW5pdHMgKiAxMDApIDogMH0lKTwvc21hbGw+PC9zcGFuPmApLmpvaW4oJycpfTwvZGl2PgogICAgPGRpdiBjbGFzcz0icGFuZWwgdXYtY2FyZCI+PGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+PGgyPlVuaWRhZGVzIHZlbmRpZGFzIHBvciBkw61hPC9oMj48ZGl2IGNsYXNzPSJsZWdlbmQiPiR7WydtbCcsICdmYScsICdwYSddLm1hcChrID0+IGA8c3Bhbj48aSBjbGFzcz0iZG90IiBzdHlsZT0iYmFja2dyb3VuZDoke01LX0NPTE9SW2tdfSI+PC9pPiR7TUtba119PC9zcGFuPmApLmpvaW4oJycpfTwvZGl2PjwvZGl2PjxkaXYgY2xhc3M9InBhbmVsLWJvZHkiPjxkaXYgY2xhc3M9ImNoLXNsb3QiIGlkPSJ1dkRheXMiIGRhdGEtaD0iMjQwIj48L2Rpdj48L2Rpdj48L2Rpdj4KICAgIDxkaXYgY2xhc3M9InV2LWdyaWQiPgogICAgICA8ZGl2IGNsYXNzPSJwYW5lbCB1di1jYXJkIj48ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj48aDI+VG9wIDEwIHB1YmxpY2FjaW9uZXM8L2gyPjxzcGFuIGNsYXNzPSJtdXRlZCI+cG9yIHVuaWRhZGVzPC9zcGFuPjwvZGl2PjxkaXYgY2xhc3M9InBhbmVsLWJvZHkiPiR7dG9wMTAubWFwKChyLCBpKSA9PiBiYXIoYDxlbSBjbGFzcz0icmsiPiR7aSArIDF9PC9lbT4ke2VzYyhyLm5hbWUpfWAsIHIucXR5LCBtYXhUb3AsIE1LX0NPTE9SW3IubWFya2V0cGxhY2VdIHx8ICd2YXIoLS1hY2NlbnQpJywgYCR7TUtbci5tYXJrZXRwbGFjZV0gfHwgJyd9JHthbGwgPyAnIMK3ICcgKyBlc2Moci5zZWxsZXIpIDogJyd9YCkpLmpvaW4oJycpfTwvZGl2PjwvZGl2PgogICAgICAke2J5U2VsbGVyfQogICAgPC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJjaC10aXAiIGlkPSJjaFRpcDIiIGhpZGRlbj48L2Rpdj4KICA8L2Rpdj5gOwp9CmZ1bmN0aW9uIGRyYXdVbml0Q2hhcnRzKGQsIGZyb20sIHRvKSB7CiAgY29uc3QgZWwgPSAkKCcjdXZEYXlzJyk7IGlmICghZWwpIHJldHVybjsKICBjb25zdCBkYXlzID0gW107IGZvciAobGV0IHggPSBuZXcgRGF0ZShmcm9tICsgJ1QxMjowMDowMCcpOyBpc28oeCkgPD0gdG8gJiYgZGF5cy5sZW5ndGggPCA0MDA7IHguc2V0RGF0ZSh4LmdldERhdGUoKSArIDEpKSBkYXlzLnB1c2goaXNvKHgpKTsKICAvLyBoYXN0YSAzMSBkw61hczogdW5hIGNvbHVtbmEgcG9yIGTDrWE7IG3DoXM6IHBvciBzZW1hbmEgKGx1bmVzKSBvIHBvciBtZXMKICBjb25zdCBtb2RlID0gZGF5cy5sZW5ndGggPD0gMzEgPyAnZGF5JyA6IGRheXMubGVuZ3RoIDw9IDEyMCA/ICd3ZWVrJyA6ICdtb250aCc7CiAgY29uc3Qga2V5T2YgPSB4ID0+IHsgaWYgKG1vZGUgPT09ICdkYXknKSByZXR1cm4geDsgY29uc3QgdCA9IG5ldyBEYXRlKHggKyAnVDEyOjAwOjAwJyk7IGlmIChtb2RlID09PSAnbW9udGgnKSByZXR1cm4geC5zbGljZSgwLCA3KTsgdC5zZXREYXRlKHQuZ2V0RGF0ZSgpIC0gKCh0LmdldERheSgpICsgNikgJSA3KSk7IHJldHVybiBpc28odCk7IH07CiAgY29uc3QgYnVja2V0cyA9IFsuLi5uZXcgU2V0KGRheXMubWFwKGtleU9mKSldOwogIGNvbnN0IHZhbCA9IChiLCBrKSA9PiBkYXlzLmZpbHRlcih4ID0+IGtleU9mKHgpID09PSBiKS5yZWR1Y2UoKGEsIHgpID0+IGEgKyAoKGQuZGFpbHkgfHwge30pW3hdPy5ba10gfHwgMCksIDApOwogIGNvbnN0IHN0YWNrcyA9IFsnbWwnLCAnZmEnLCAncGEnXS5tYXAoayA9PiAoeyBrZXk6IGssIGxhYmVsOiBNS1trXSwgY29sb3I6IE1LX0NPTE9SW2tdLCB2YWx1ZXM6IGJ1Y2tldHMubWFwKGIgPT4gKHsgYW1vdW50OiB2YWwoYiwgayksIG9yZGVyczogMCB9KSkgfSkpOwogIGNvbnN0IE1FUyA9IFsnZW5lJywgJ2ZlYicsICdtYXInLCAnYWJyJywgJ21heScsICdqdW4nLCAnanVsJywgJ2FnbycsICdzZXAnLCAnb2N0JywgJ25vdicsICdkaWMnXTsKICBjb25zdCBsYWJlbCA9IGIgPT4gbW9kZSA9PT0gJ21vbnRoJyA/IE1FU1srYi5zbGljZSg1LCA3KSAtIDFdIDogbW9kZSA9PT0gJ3dlZWsnID8gYHNlbSAkeytiLnNsaWNlKDgpfS8keytiLnNsaWNlKDUsIDcpfWAgOiBudWxsOwogIGNvbnN0IHRpdGxlID0gYiA9PiBtb2RlID09PSAnbW9udGgnID8gYCR7TUVTWytiLnNsaWNlKDUsIDcpIC0gMV19ICR7Yi5zbGljZSgwLCA0KX1gIDogbW9kZSA9PT0gJ3dlZWsnID8gYFNlbWFuYSBkZWwgJHtkYXlMb25nKGIpfWAgOiBkYXlMb25nKGIpOwogIGVsLmlubmVySFRNTCA9IGNvbHVtbkNoYXJ0KGJ1Y2tldHMsIHN0YWNrcywgeyBoZWlnaHQ6IDI0MCwgd2lkdGg6IGVsLmNsaWVudFdpZHRoIHx8IDY0MCwgdW5pdHM6IHRydWUsIHRvZGF5OiBtb2RlID09PSAnZGF5JyA/IGlzbyhuZXcgRGF0ZSgpKSA6IG51bGwsIGxhYmVsOiBtb2RlID09PSAnZGF5JyA/IG51bGwgOiBsYWJlbCwgdGl0bGUgfSk7Cn0KCi8vIC0tLS0tLS0tLS0gUFJPRFVDVE9TIFZFTkRJRE9TIChjYW50aWRhZGVzLCBzaW4gcHJlY2lvcykgcGFyYSBlbCBmdWxmaWxsbWVudCB5IGVsIGFkbWluaXN0cmFkb3IgLS0tLS0tLS0tLQphc3luYyBmdW5jdGlvbiByZW5kZXJVbml0cygpIHsKICAkKCcjbWFpbicpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJzZWN0aW9uLXRpdGxlIiBzdHlsZT0ibWFyZ2luLXRvcDoyMnB4Ij48aDI+UHJvdmVlZG9yIEZ1bGZpbGxtZW50PC9oMj48c3BhbiBjbGFzcz0ibXV0ZWQiPkNhbnRpZGFkZXMgcG9yIHB1YmxpY2FjacOzbiB5IHZhcmlhbnRlIMK3IHNpbiBwcmVjaW9zIMK3IHNpbiBsb3MgcHJvZHVjdG9zIGJsb3F1ZWFkb3M8L3NwYW4+PHNwYW4gY2xhc3M9InNwYWNlciIgc3R5bGU9ImZsZXg6MSI+PC9zcGFuPjxzcGFuIGlkPSJ1bml0c1BpY2siPjwvc3Bhbj48L2Rpdj48ZGl2IGNsYXNzPSJwYW5lbCIgaWQ9InByb2RQYW5lbCI+PC9kaXY+YDsKICB0cnkgewogICAgY29uc3QgeyBzZWxsZXJzOiBsaXN0IH0gPSBhd2FpdCBhcGkoJy9hcGkvc2VsbGVycy9saXN0Jyk7CiAgICBjb25zdCBjdXIgPSBzdG9yZS5nZXQoJ3VuaXRzU2VsbGVyJywgJycpOwogICAgJCgnI3VuaXRzUGljaycpLmlubmVySFRNTCA9IGA8c2VsZWN0IGlkPSJ1bml0c1NlbCIgc3R5bGU9IndpZHRoOmF1dG8iPjxvcHRpb24gdmFsdWU9IiI+VG9kb3MgbG9zIHZlbmRlZG9yZXM8L29wdGlvbj4ke2xpc3QubWFwKHggPT4gYDxvcHRpb24gdmFsdWU9IiR7eC5pZH0iICR7U3RyaW5nKHguaWQpID09PSBTdHJpbmcoY3VyKSA/ICdzZWxlY3RlZCcgOiAnJ30+JHtlc2MoeC5uYW1lKX08L29wdGlvbj5gKS5qb2luKCcnKX08L3NlbGVjdD5gOwogICAgJCgnI3VuaXRzU2VsJykub25jaGFuZ2UgPSBlID0+IHsgc3RvcmUuc2V0KCd1bml0c1NlbGxlcicsIGUudGFyZ2V0LnZhbHVlKTsgcmVuZGVyUHJvZHVjdHMoKTsgfTsKICB9IGNhdGNoIHt9CiAgcmVuZGVyUHJvZHVjdHMoKTsKfQoKLy8gLS0tLS0tLS0tLSBWRU5UQVMgLS0tLS0tLS0tLQovLyBQbGFuaWxsYSBkZSBwcm9kdWN0b3MgdmVuZGlkb3M6IGZpamEgZGUgbHVuZXMgYSBkb21pbmdvOyB0YW1iacOpbiBtZXMsIDMwIGTDrWFzLCBhw7FvIG8gZmVjaGFzIGEgZWxlY2Npw7NuCmNvbnN0IHBwID0geyBtb2RlOiAnd2VlaycsIHdlZWs6IDAsIGZyb206ICcnLCB0bzogJycsIHE6ICcnLCBvcGVuOiBuZXcgU2V0KCkgfTsKY29uc3QgaXNvID0gZCA9PiBgJHtkLmdldEZ1bGxZZWFyKCl9LSR7U3RyaW5nKGQuZ2V0TW9udGgoKSArIDEpLnBhZFN0YXJ0KDIsICcwJyl9LSR7U3RyaW5nKGQuZ2V0RGF0ZSgpKS5wYWRTdGFydCgyLCAnMCcpfWA7CmZ1bmN0aW9uIHBwUmFuZ2UoKSB7CiAgY29uc3QgdCA9IG5ldyBEYXRlKCk7IHQuc2V0SG91cnMoMTIsIDAsIDAsIDApOwogIGlmIChwcC5tb2RlID09PSAnd2VlaycpIHsgY29uc3QgbW9uID0gbmV3IERhdGUodCk7IG1vbi5zZXREYXRlKHQuZ2V0RGF0ZSgpIC0gKCh0LmdldERheSgpICsgNikgJSA3KSArIHBwLndlZWsgKiA3KTsgY29uc3Qgc3VuID0gbmV3IERhdGUobW9uKTsgc3VuLnNldERhdGUobW9uLmdldERhdGUoKSArIDYpOyByZXR1cm4gW2lzbyhtb24pLCBpc28oc3VuKV07IH0KICBpZiAocHAubW9kZSA9PT0gJ21vbnRoJykgcmV0dXJuIFtpc28obmV3IERhdGUodC5nZXRGdWxsWWVhcigpLCB0LmdldE1vbnRoKCksIDEpKSwgaXNvKHQpXTsKICBpZiAocHAubW9kZSA9PT0gJzMwJykgeyBjb25zdCBmID0gbmV3IERhdGUodCk7IGYuc2V0RGF0ZSh0LmdldERhdGUoKSAtIDI5KTsgcmV0dXJuIFtpc28oZiksIGlzbyh0KV07IH0KICBpZiAocHAubW9kZSA9PT0gJ3llYXInKSByZXR1cm4gW2lzbyhuZXcgRGF0ZSh0LmdldEZ1bGxZZWFyKCksIDAsIDEpKSwgaXNvKHQpXTsKICByZXR1cm4gW3BwLmZyb20gfHwgaXNvKHQpLCBwcC50byB8fCBpc28odCldOwp9CmNvbnN0IGZtdEQgPSBkID0+IG5ldyBEYXRlKGQgKyAnVDEyOjAwOjAwJykudG9Mb2NhbGVEYXRlU3RyaW5nKCdlcy1DTCcsIHsgd2Vla2RheTogJ3Nob3J0JywgZGF5OiAnbnVtZXJpYycsIG1vbnRoOiAnc2hvcnQnIH0pLnJlcGxhY2UoJy4nLCAnJyk7CmFzeW5jIGZ1bmN0aW9uIHJlbmRlclByb2R1Y3RzKCkgewogIGNvbnN0IGJveCA9ICQoJyNwcm9kUGFuZWwnKTsgaWYgKCFib3gpIHJldHVybjsKICBjb25zdCBpc0FkbWluID0gbWUudXNlci5yb2xlID09PSAnYWRtaW4nOwogIGNvbnN0IG5vTW9uZXkgPSB0YWIgPT09ICd1bml0cyc7IC8vIHNlY2Npw7NuIHNpbiBwcmVjaW9zIChmdWxmaWxsbWVudCAvIGFkbWluaXN0cmFkb3IpCiAgY29uc3Qgc2lkID0gbm9Nb25leSA/IHN0b3JlLmdldCgndW5pdHNTZWxsZXInLCAnJykgOiBpc0FkbWluID8gc3RvcmUuZ2V0KCdzYWxlc1NlbGxlcicsICcnKSA6ICcnOwogIGNvbnN0IFtmcm9tLCB0b10gPSBwcFJhbmdlKCk7CiAgY29uc3QgcXMgPSBgZnJvbT0ke2Zyb219JnRvPSR7dG99JHtzaWQgPyAnJnNlbGxlcl9pZD0nICsgc2lkIDogJyd9JHtub01vbmV5ID8gJyZub21vbmV5PTEnIDogJyd9YDsKICBib3guaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9InBhbmVsLWhlYWQiIHN0eWxlPSJmbGV4LXdyYXA6d3JhcDtnYXA6MTBweCI+JHtub01vbmV5ID8gJycgOiAnPGgyPlByb2R1Y3RvcyB2ZW5kaWRvczwvaDI+J30KICAgIDxzZWxlY3QgaWQ9InBwTW9kZSIgc3R5bGU9IndpZHRoOmF1dG8iPiR7W1snd2VlaycsICdTZW1hbmEgKGx1bmVzIGEgZG9taW5nbyknXSwgWydtb250aCcsICdFc3RlIG1lcyddLCBbJzMwJywgJ8OabHRpbW9zIDMwIGTDrWFzJ10sIFsneWVhcicsICdFc3RlIGHDsW8nXSwgWydjdXN0b20nLCAnRWxlZ2lyIGZlY2hhc+KApiddXS5tYXAoKFtrLCBuXSkgPT4gYDxvcHRpb24gdmFsdWU9IiR7a30iICR7cHAubW9kZSA9PT0gayA/ICdzZWxlY3RlZCcgOiAnJ30+JHtufTwvb3B0aW9uPmApLmpvaW4oJycpfTwvc2VsZWN0PgogICAgJHtwcC5tb2RlID09PSAnd2VlaycgPyBgPHNwYW4gY2xhc3M9InBwLXdlZWsiPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGlkPSJwcFByZXYiIGFyaWEtbGFiZWw9IlNlbWFuYSBhbnRlcmlvciI+4oC5PC9idXR0b24+PGI+JHtlc2MoZm10RChmcm9tKSl9IOKAkyAke2VzYyhmbXREKHRvKSl9PC9iPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGlkPSJwcE5leHQiIGFyaWEtbGFiZWw9IlNlbWFuYSBzaWd1aWVudGUiICR7cHAud2VlayA+PSAwID8gJ2Rpc2FibGVkJyA6ICcnfT7igLo8L2J1dHRvbj48L3NwYW4+YCA6ICcnfQogICAgJHtwcC5tb2RlID09PSAnY3VzdG9tJyA/IGA8c3BhbiBjbGFzcz0icHAtd2VlayI+PGlucHV0IHR5cGU9ImRhdGUiIGlkPSJwcEZyb20iIHZhbHVlPSIke2Zyb219IiBzdHlsZT0id2lkdGg6YXV0byI+IGEgPGlucHV0IHR5cGU9ImRhdGUiIGlkPSJwcFRvIiB2YWx1ZT0iJHt0b30iIHN0eWxlPSJ3aWR0aDphdXRvIj48L3NwYW4+YCA6ICcnfQogICAgPGlucHV0IHR5cGU9InNlYXJjaCIgaWQ9InBwUSIgcGxhY2Vob2xkZXI9IkJ1c2NhciBwcm9kdWN0byBvIFNLVSIgdmFsdWU9IiR7ZXNjKHBwLnEpfSIgc3R5bGU9IndpZHRoOmF1dG87bWluLXdpZHRoOjE5MHB4Ij4KICAgIDxzcGFuIGNsYXNzPSJzcGFjZXIiIHN0eWxlPSJmbGV4OjEiPjwvc3Bhbj4KICAgIDxhIGNsYXNzPSJidG4gYnRuLXByaW1hcnkgYnRuLXNtIiBpZD0icHBYbHMiIGhyZWY9Ii9hcGkvc2FsZXMvcHJvZHVjdHMueGxzeD8ke3FzfSI+JHtJLmRvd259RGVzY2FyZ2FyIEV4Y2VsPC9hPjwvZGl2PgogICAgPGRpdiBjbGFzcz0icGFuZWwtYm9keSIgaWQ9InBwQm9keSI+PGRpdiBjbGFzcz0ibXV0ZWQiPkNhcmdhbmRvIHByb2R1Y3Rvc+KApjwvZGl2PjwvZGl2PmA7CiAgJCgnI3BwTW9kZScpLm9uY2hhbmdlID0gZSA9PiB7IHBwLm1vZGUgPSBlLnRhcmdldC52YWx1ZTsgcHAud2VlayA9IDA7IGlmIChwcC5tb2RlID09PSAnY3VzdG9tJyAmJiAhcHAuZnJvbSkgeyBjb25zdCBbZiwgdF0gPSBwcFJhbmdlKCk7IHBwLmZyb20gPSBmOyBwcC50byA9IHQ7IH0gcmVuZGVyUHJvZHVjdHMoKTsgfTsKICBpZiAoJCgnI3BwUHJldicpKSB7ICQoJyNwcFByZXYnKS5vbmNsaWNrID0gKCkgPT4geyBwcC53ZWVrLS07IHJlbmRlclByb2R1Y3RzKCk7IH07ICQoJyNwcE5leHQnKS5vbmNsaWNrID0gKCkgPT4geyBpZiAocHAud2VlayA8IDApIHsgcHAud2VlaysrOyByZW5kZXJQcm9kdWN0cygpOyB9IH07IH0KICBpZiAoJCgnI3BwRnJvbScpKSB7IGNvbnN0IGNoID0gKCkgPT4geyBwcC5mcm9tID0gJCgnI3BwRnJvbScpLnZhbHVlOyBwcC50byA9ICQoJyNwcFRvJykudmFsdWU7IHJlbmRlclByb2R1Y3RzKCk7IH07ICQoJyNwcEZyb20nKS5vbmNoYW5nZSA9IGNoOyAkKCcjcHBUbycpLm9uY2hhbmdlID0gY2g7IH0KICBsZXQgZDsKICB0cnkgeyBkID0gYXdhaXQgYXBpKCcvYXBpL3NhbGVzL3Byb2R1Y3RzPycgKyBxcyk7IH0gY2F0Y2ggKGUpIHsgJCgnI3BwQm9keScpLmlubmVySFRNTCA9IGVzYyhlLm1lc3NhZ2UpOyByZXR1cm47IH0KICBjb25zdCBkcmF3ID0gKCkgPT4gewogICAgaWYgKCEkKCcjcHBCb2R5JykpIHJldHVybjsKICAgIGNvbnN0IHEgPSBwcC5xLnRvTG93ZXJDYXNlKCk7CiAgICBjb25zdCByb3dzID0gZC5yb3dzLmZpbHRlcihyID0+ICFxIHx8IFtyLm5hbWUsIHIucHViX2lkLCByLnNlbGxlciwgLi4uci52YXJpYW50cy5tYXAodiA9PiB2LnZhcmlhbnQgKyAnICcgKyB2LnNrdSldLmpvaW4oJyAnKS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHEpKTsKICAgIGNvbnN0IGRheXMgPSBbXTsgZm9yIChsZXQgeCA9IG5ldyBEYXRlKGZyb20gKyAnVDEyOjAwOjAwJyk7IGlzbyh4KSA8PSB0byAmJiBkYXlzLmxlbmd0aCA8IDQwMDsgeC5zZXREYXRlKHguZ2V0RGF0ZSgpICsgMSkpIGRheXMucHVzaChpc28oeCkpOwogICAgY29uc3Qgd2Vla2x5ID0gZGF5cy5sZW5ndGggPD0gNywgYWxsID0gIXNpZCAmJiAoaXNBZG1pbiB8fCBub01vbmV5KTsKICAgIGNvbnN0IHRvdCA9IGsgPT4gcm93cy5yZWR1Y2UoKGEsIHIpID0+IGEgKyAodHlwZW9mIGsgPT09ICdmdW5jdGlvbicgPyBrKHIpIDogcltrXSksIDApOwogICAgY29uc3QgaGVhZCA9IGAke2FsbCA/ICc8dGg+VmVuZGVkb3I8L3RoPicgOiAnJ308dGg+UHVibGljYWNpw7NuPC90aD48dGg+SUQgLyBTS1U8L3RoPiR7d2Vla2x5ID8gZGF5cy5tYXAoeCA9PiBgPHRoIGNsYXNzPSJudW0iPiR7ZXNjKGZtdEQoeCkuc3BsaXQoJyAnKVswXS5yZXBsYWNlKCcsJywgJycpKX08c21hbGw+JHt4LnNsaWNlKDgpfTwvc21hbGw+PC90aD5gKS5qb2luKCcnKSA6IFsnbWwnLCAnZmEnLCAncGEnXS5tYXAoayA9PiBgPHRoIGNsYXNzPSJudW0iPjxpIGNsYXNzPSJkb3QiIHN0eWxlPSJiYWNrZ3JvdW5kOiR7TUtfQ09MT1Jba119Ij48L2k+JHtNS1trXX08L3RoPmApLmpvaW4oJycpfTx0aCBjbGFzcz0ibnVtIj5Ub3RhbDwvdGg+JHtub01vbmV5ID8gJzx0aCBjbGFzcz0ibnVtIj5WZW50YXM8L3RoPicgOiAnPHRoIGNsYXNzPSJudW0iPk1vbnRvPC90aD4nfWA7CiAgICBjb25zdCBjZWxsUSA9IG4gPT4gbiA/IGA8Yj4ke259PC9iPmAgOiAnPHNwYW4gY2xhc3M9Inplcm8iPsK3PC9zcGFuPic7CiAgICBjb25zdCBudW1zID0gciA9PiBgJHt3ZWVrbHkgPyBkYXlzLm1hcCh4ID0+IGA8dGQgY2xhc3M9Im51bSI+JHtjZWxsUShyLmJ5RGF5W3hdIHx8IDApfTwvdGQ+YCkuam9pbignJykgOiBbJ21sJywgJ2ZhJywgJ3BhJ10ubWFwKGsgPT4gYDx0ZCBjbGFzcz0ibnVtIj4ke2NlbGxRKHIuYnlNa1trXSB8fCAwKX08L3RkPmApLmpvaW4oJycpfTx0ZCBjbGFzcz0ibnVtIHBwLXRvdGFsIj4ke3IucXR5fTwvdGQ+PHRkIGNsYXNzPSJudW0iPiR7bm9Nb25leSA/IHIub3JkZXJzIDogbW9uZXkoci5hbW91bnQpfTwvdGQ+YDsKICAgIC8vIHVuYSBmaWxhIHBvciBwdWJsaWNhY2nDs247IGNvbiBsYSBmbGVjaGEgc2UgZGVzcGxpZWdhbiBzdXMgdmFyaWFudGVzCiAgICAvLyBFbiBWZW50YXMgZWwgbGlzdGFkbyBwYXJ0ZSByZWNvZ2lkbyAoc2UgdmVuIGxhcyBwcmltZXJhcyA4KTsgY29uIGVsIGJvdMOzbiBzZSBkZXNwbGllZ2EgY29tcGxldG8KICAgIGNvbnN0IExJTSA9IDgsIGNvbGxhcHNlZCA9ICFub01vbmV5ICYmICFwcC5mdWxsICYmICFxICYmIHJvd3MubGVuZ3RoID4gTElNOwogICAgY29uc3Qgc2hvd24gPSBjb2xsYXBzZWQgPyByb3dzLnNsaWNlKDAsIExJTSkgOiByb3dzOwogICAgY29uc3QgYm9keSA9IHNob3duLm1hcChyID0+IHsKICAgICAgLy8gbGEgZmlsYSBtdWVzdHJhIGxhIHB1YmxpY2FjacOzbiBjb21wbGV0YSAodG9kYXMgc3VzIHZhcmlhbnRlcyBzdW1hZGFzKTsgbGFzIHZhcmlhbnRlcyBzb2xvIGFsIGRlc3BsZWdhcgogICAgICBjb25zdCBrZXkgPSByLnNlbGxlciArICd8JyArIHIubWFya2V0cGxhY2UgKyAnfCcgKyAoci5wdWJfaWQgfHwgci5uYW1lKSwgb3BlbiA9IHBwLm9wZW4uaGFzKGtleSksIG52ID0gci52YXJpYW50cy5maWx0ZXIodiA9PiB2LnZhcmlhbnQgfHwgdi5za3UpLmxlbmd0aCwgbWFueSA9IG52ID4gMDsKICAgICAgbGV0IGggPSBgPHRyIGNsYXNzPSJwcC1wdWIke21hbnkgPyAnIHBwLWNhbicgOiAnJ30iICR7bWFueSA/IGBkYXRhLXBrPSIke2VzYyhrZXkpfSJgIDogJyd9PiR7YWxsID8gYDx0ZD4ke2VzYyhyLnNlbGxlcil9PC90ZD5gIDogJyd9PHRkPiR7bWFueSA/IGA8c3BhbiBjbGFzcz0icHAtYXJyb3ciPiR7b3BlbiA/ICfilr4nIDogJ+KWuCd9PC9zcGFuPmAgOiAnPHNwYW4gY2xhc3M9InBwLWFycm93Ij48L3NwYW4+J308c3BhbiBjbGFzcz0ibWsgJHtyLm1hcmtldHBsYWNlfSIgc3R5bGU9Im1hcmdpbi1yaWdodDo2cHgiPiR7TUtbci5tYXJrZXRwbGFjZV0gfHwgJyd9PC9zcGFuPjxzcGFuIGNsYXNzPSJwcC1uYW1lIj4ke2VzYyhyLm5hbWUpfTwvc3Bhbj4ke21hbnkgPyBgPHNtYWxsIGNsYXNzPSJtdXRlZCBwcC1zdWIiPiR7bnZ9IHZhcmlhbnRlJHtudiA9PT0gMSA/ICcnIDogJ3MnfSB2ZW5kaWRhJHtudiA9PT0gMSA/ICcnIDogJ3MnfSDCtyAke29wZW4gPyAndG9jYSBwYXJhIG9jdWx0YXInIDogJ3RvY2EgcGFyYSB2ZXInfTwvc21hbGw+YCA6ICcnfTwvdGQ+PHRkIGNsYXNzPSJtb25vIj4ke2VzYyhyLnB1Yl9pZCB8fCAnJyl9PC90ZD4ke251bXMocil9PC90cj5gOwogICAgICBpZiAobWFueSAmJiBvcGVuKSBoICs9IHIudmFyaWFudHMubWFwKHYgPT4gYDx0ciBjbGFzcz0icHAtdmFyIj4ke2FsbCA/ICc8dGQ+PC90ZD4nIDogJyd9PHRkPjxzcGFuIGNsYXNzPSJwcC12bmFtZSI+JHtlc2Modi52YXJpYW50IHx8ICdTaW4gdmFyaWFudGUnKX08L3NwYW4+PC90ZD48dGQgY2xhc3M9Im1vbm8iPiR7ZXNjKHYuc2t1IHx8ICcnKX08L3RkPiR7bnVtcyh2KX08L3RyPmApLmpvaW4oJycpOwogICAgICByZXR1cm4gaDsKICAgIH0pLmpvaW4oJycpOwogICAgY29uc3QgZm9vdCA9IGA8dHI+JHthbGwgPyAnPHRkPjwvdGQ+JyA6ICcnfTx0ZD48Yj5Ub3RhbCAoJHtyb3dzLmxlbmd0aH0gcHVibGljYWNpJHtyb3dzLmxlbmd0aCA9PT0gMSA/ICfDs24nIDogJ29uZXMnfSk8L2I+PC90ZD48dGQ+PC90ZD4ke3dlZWtseSA/IGRheXMubWFwKHggPT4gYDx0ZCBjbGFzcz0ibnVtIj48Yj4ke3RvdChyID0+IHIuYnlEYXlbeF0gfHwgMCl9PC9iPjwvdGQ+YCkuam9pbignJykgOiBbJ21sJywgJ2ZhJywgJ3BhJ10ubWFwKGsgPT4gYDx0ZCBjbGFzcz0ibnVtIj48Yj4ke3RvdChyID0+IHIuYnlNa1trXSB8fCAwKX08L2I+PC90ZD5gKS5qb2luKCcnKX08dGQgY2xhc3M9Im51bSBwcC10b3RhbCI+JHt0b3QoJ3F0eScpfTwvdGQ+PHRkIGNsYXNzPSJudW0iPjxiPiR7bm9Nb25leSA/IHRvdCgnb3JkZXJzJykgOiBtb25leSh0b3QoJ2Ftb3VudCcpKX08L2I+PC90ZD48L3RyPmA7CiAgICBjb25zdCBub3RlID0gZC5oaXN0b3J5U2luY2UgJiYgZnJvbSA8IGQuaGlzdG9yeVNpbmNlID8gYDxwIGNsYXNzPSJwcC1ub3RlIj5Fc3RhbW9zIHRyYXllbmRvIHR1IGhpc3RvcmlhbCBkZSB2ZW50YXMgZGUgYSBwb2NvIChoYXN0YSAxIGHDsW8pLiBQb3IgYWhvcmEgaGF5IGRhdG9zIGNvbXBsZXRvcyBkZXNkZSBlbCAke2VzYyhmbXREKGQuaGlzdG9yeVNpbmNlKSl9OyBlbCByZXN0byBhcGFyZWNlIHNvbG8gZW4gbGFzIHByw7N4aW1hcyBob3Jhcy48L3A+YCA6ICcnOwogICAgY29uc3QgY2FuT3BlbiA9IHIgPT4gci52YXJpYW50cy5zb21lKHYgPT4gdi52YXJpYW50IHx8IHYuc2t1KTsKICAgIGNvbnN0IGV4cGFuZEJ0biA9IHJvd3Muc29tZShjYW5PcGVuKSA/IGA8ZGl2IHN0eWxlPSJtYXJnaW46MCAwIDhweCI+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgaWQ9InBwQWxsIj4ke3Jvd3MuZmlsdGVyKGNhbk9wZW4pLmV2ZXJ5KHIgPT4gcHAub3Blbi5oYXMoci5zZWxsZXIgKyAnfCcgKyByLm1hcmtldHBsYWNlICsgJ3wnICsgKHIucHViX2lkIHx8IHIubmFtZSkpKSA/ICdPY3VsdGFyIHZhcmlhbnRlcycgOiAnVmVyIHRvZGFzIGxhcyB2YXJpYW50ZXMnfTwvYnV0dG9uPjwvZGl2PmAgOiAnJzsKICAgIGNvbnN0IHZpeiA9IG5vTW9uZXkgJiYgcm93cy5sZW5ndGggPyB1bml0c1ZpeihkLCByb3dzLCBmcm9tLCB0bywgYWxsKSA6ICcnOwogICAgJCgnI3BwQm9keScpLmlubmVySFRNTCA9IHZpeiArIG5vdGUgKyBleHBhbmRCdG4gKyAocm93cy5sZW5ndGggPyBgJHt2aXogPyAnPGgzIGNsYXNzPSJ1di1oIj5EZXRhbGxlIHBvciBwdWJsaWNhY2nDs24gPHNtYWxsPlRvY2EgdW5hIHB1YmxpY2FjacOzbiBwYXJhIHZlciBzdXMgdmFyaWFudGVzPC9zbWFsbD48L2gzPicgOiAnJ308ZGl2IGNsYXNzPSJ0YWJsZS13cmFwIj48dGFibGUgY2xhc3M9InBwLXRhYmxlIj48dGhlYWQ+PHRyPiR7aGVhZH08L3RyPjwvdGhlYWQ+PHRib2R5PiR7Ym9keX08L3Rib2R5Pjx0Zm9vdD4ke2Zvb3R9PC90Zm9vdD48L3RhYmxlPjwvZGl2PmAgOiBgPGRpdiBjbGFzcz0iZW1wdHkiPiR7cSA/ICdOaW5nw7puIHByb2R1Y3RvIGNvaW5jaWRlIGNvbiBsYSBiw7pzcXVlZGEuJyA6ICdObyBoYXkgcHJvZHVjdG9zIHZlbmRpZG9zIGVuIGVzdGFzIGZlY2hhcy4nfTwvZGl2PmApOwogICAgaWYgKCFub01vbmV5ICYmICFxICYmIHJvd3MubGVuZ3RoID4gTElNKSAkKCcjcHBCb2R5JykuaW5zZXJ0QWRqYWNlbnRIVE1MKCdiZWZvcmVlbmQnLCBgPGRpdiBjbGFzcz0icHAtbW9yZSI+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgaWQ9InBwRnVsbCI+JHtwcC5mdWxsID8gJ1JlY29nZXIgbGlzdGFkbyDilrQnIDogYFZlciBsaXN0YWRvIGNvbXBsZXRvICgke3Jvd3MubGVuZ3RofSBwdWJsaWNhY2lvbmVzKSDilr5gfTwvYnV0dG9uPjwvZGl2PmApOwogIH07CiAgZHJhdygpOwogIGlmIChub01vbmV5KSBkcmF3VW5pdENoYXJ0cyhkLCBmcm9tLCB0byk7CiAgJCgnI3BwQm9keScpLm9ubW91c2Vtb3ZlID0gZSA9PiB7CiAgICBjb25zdCB0aXBFbCA9ICQoJyNjaFRpcDInKTsgaWYgKCF0aXBFbCkgcmV0dXJuOwogICAgY29uc3QgaCA9IGUudGFyZ2V0LmNsb3Nlc3QoJy5jaC1oaXQnKTsgaWYgKCFoKSB7IHRpcEVsLmhpZGRlbiA9IHRydWU7IHJldHVybjsgfQogICAgY29uc3QgW3QsIC4uLnJlc3RdID0gaC5kYXRhc2V0LnRpcC5zcGxpdCgnfCcpOwogICAgdGlwRWwuaW5uZXJIVE1MID0gYDxiPiR7ZXNjKHQpfTwvYj4ke3Jlc3QubWFwKHIgPT4gYDxkaXY+JHtlc2Mocil9PC9kaXY+YCkuam9pbignJyl9YDsgdGlwRWwuaGlkZGVuID0gZmFsc2U7CiAgICB0aXBFbC5zdHlsZS5sZWZ0ID0gTWF0aC5taW4oZS5jbGllbnRYICsgMTQsIGlubmVyV2lkdGggLSB0aXBFbC5vZmZzZXRXaWR0aCAtIDgpICsgJ3B4JzsgdGlwRWwuc3R5bGUudG9wID0gKGUuY2xpZW50WSArIDE0KSArICdweCc7CiAgfTsKICAkKCcjcHBCb2R5Jykub25tb3VzZWxlYXZlID0gKCkgPT4geyBjb25zdCB0ID0gJCgnI2NoVGlwMicpOyBpZiAodCkgdC5oaWRkZW4gPSB0cnVlOyB9OwogICQoJyNwcEJvZHknKS5vbmNsaWNrID0gZSA9PiB7CiAgICBpZiAoZS50YXJnZXQuY2xvc2VzdCgnI3BwRnVsbCcpKSB7IHBwLmZ1bGwgPSAhcHAuZnVsbDsgZHJhdygpOyBpZiAoIXBwLmZ1bGwpICQoJyNwcm9kUGFuZWwnKT8uc2Nyb2xsSW50b1ZpZXcoeyBibG9jazogJ3N0YXJ0JywgYmVoYXZpb3I6ICdzbW9vdGgnIH0pOyByZXR1cm47IH0KICAgIGlmIChlLnRhcmdldC5jbG9zZXN0KCcjcHBBbGwnKSkgewogICAgICBjb25zdCBrZXlzID0gZC5yb3dzLmZpbHRlcihyID0+IHIudmFyaWFudHMuc29tZSh2ID0+IHYudmFyaWFudCB8fCB2LnNrdSkpLm1hcChyID0+IHIuc2VsbGVyICsgJ3wnICsgci5tYXJrZXRwbGFjZSArICd8JyArIChyLnB1Yl9pZCB8fCByLm5hbWUpKTsKICAgICAgY29uc3QgYWxsT3BlbiA9IGtleXMuZXZlcnkoayA9PiBwcC5vcGVuLmhhcyhrKSk7CiAgICAgIGtleXMuZm9yRWFjaChrID0+IGFsbE9wZW4gPyBwcC5vcGVuLmRlbGV0ZShrKSA6IHBwLm9wZW4uYWRkKGspKTsgZHJhdygpOyBpZiAobm9Nb25leSkgZHJhd1VuaXRDaGFydHMoZCwgZnJvbSwgdG8pOyByZXR1cm47CiAgICB9CiAgICBjb25zdCB0ciA9IGUudGFyZ2V0LmNsb3Nlc3QoJ3RyW2RhdGEtcGtdJyk7IGlmICghdHIpIHJldHVybjsKICAgIGNvbnN0IGsgPSB0ci5kYXRhc2V0LnBrOyBwcC5vcGVuLmhhcyhrKSA/IHBwLm9wZW4uZGVsZXRlKGspIDogcHAub3Blbi5hZGQoayk7IGRyYXcoKTsgaWYgKG5vTW9uZXkpIGRyYXdVbml0Q2hhcnRzKGQsIGZyb20sIHRvKTsKICB9OwogICQoJyNwcFEnKS5vbmlucHV0ID0gZSA9PiB7IHBwLnEgPSBlLnRhcmdldC52YWx1ZTsgZHJhdygpOyBpZiAobm9Nb25leSkgZHJhd1VuaXRDaGFydHMoZCwgZnJvbSwgdG8pOyB9Owp9CmNvbnN0IE1LX0NPTE9SID0geyBtbDogJyNDOTlBMDAnLCBmYTogJyM0RjhGMDAnLCBwYTogJyMwMDY4QjgnIH07IC8vIGNvbG9yZXMgZGUgY2FkYSBtYXJrZXRwbGFjZSAodmFsaWRhZG9zIHBhcmEgZGFsdG9uaXNtbywgY29uIGV0aXF1ZXRhcyB5IHNlcGFyYWNpw7NuKQpjb25zdCBtb25leSA9IG4gPT4gJyQnICsgTWF0aC5yb3VuZChuKS50b0xvY2FsZVN0cmluZygnZXMtQ0wnKTsKY29uc3QgbW9uZXlTaG9ydCA9IG4gPT4gbiA+PSAxZTYgPyAnJCcgKyAobiAvIDFlNikudG9GaXhlZCgxKS5yZXBsYWNlKCcuJywgJywnKS5yZXBsYWNlKCcsMCcsICcnKSArICcgTScgOiBuID49IDFlNCA/ICckJyArIE1hdGgucm91bmQobiAvIDFlMykgKyAnIG1pbCcgOiBtb25leShuKTsKY29uc3QgZGF5U2hvcnQgPSBkID0+IHsgY29uc3QgeCA9IG5ldyBEYXRlKGQgKyAnVDEyOjAwOjAwJyk7IHJldHVybiB4LnRvTG9jYWxlRGF0ZVN0cmluZygnZXMtQ0wnLCB7IHdlZWtkYXk6ICdzaG9ydCcgfSkucmVwbGFjZSgnLicsICcnKSArICcgJyArIHguZ2V0RGF0ZSgpOyB9Owpjb25zdCBkYXlMb25nID0gZCA9PiBuZXcgRGF0ZShkICsgJ1QxMjowMDowMCcpLnRvTG9jYWxlRGF0ZVN0cmluZygnZXMtQ0wnLCB7IHdlZWtkYXk6ICdsb25nJywgZGF5OiAnbnVtZXJpYycsIG1vbnRoOiAnbG9uZycgfSk7CmNvbnN0IG5pY2VNYXggPSB2ID0+IHsgaWYgKHYgPD0gMCkgcmV0dXJuIDEwMDAwOyBjb25zdCBwID0gTWF0aC5wb3coMTAsIE1hdGguZmxvb3IoTWF0aC5sb2cxMCh2KSkpOyBjb25zdCBmID0gdiAvIHA7IHJldHVybiAoZiA8PSAxID8gMSA6IGYgPD0gMiA/IDIgOiBmIDw9IDIuNSA/IDIuNSA6IGYgPD0gNSA/IDUgOiAxMCkgKiBwOyB9OwpmdW5jdGlvbiBiYXJQYXRoKHgsIHksIHcsIGgsIHIpIHsKICBpZiAoaCA8PSAwKSByZXR1cm4gJyc7CiAgciA9IE1hdGgubWluKHIsIGgsIHcgLyAyKTsKICByZXR1cm4gYE0ke3h9LCR7eSArIGh9ViR7eSArIHJ9USR7eH0sJHt5fSAke3ggKyByfSwke3l9SCR7eCArIHcgLSByfVEke3ggKyB3fSwke3l9ICR7eCArIHd9LCR7eSArIHJ9ViR7eSArIGh9WmA7Cn0KLy8gR3LDoWZpY28gZGUgY29sdW1uYXMgKHVuYSBzZXJpZSkgbyBjb2x1bW5hcyBhcGlsYWRhcyAodmFyaWFzKS4gVG9vbHRpcCBwb3IgY29sdW1uYS4KZnVuY3Rpb24gY29sdW1uQ2hhcnQoZGF5cywgc3RhY2tzLCB7IGhlaWdodCA9IDIzMCwgdG9kYXksIHdpZHRoID0gNjQwLCB1bml0cyA9IGZhbHNlLCBsYWJlbCwgdGl0bGUgfSA9IHt9KSB7CiAgY29uc3QgZm10UyA9IHVuaXRzID8gKG4gPT4gTWF0aC5yb3VuZChuKS50b0xvY2FsZVN0cmluZygnZXMtQ0wnKSkgOiBtb25leVNob3J0LCBmbXRMID0gdW5pdHMgPyAobiA9PiBgJHtNYXRoLnJvdW5kKG4pLnRvTG9jYWxlU3RyaW5nKCdlcy1DTCcpfSB1bmlkLmApIDogbW9uZXk7CiAgY29uc3QgVyA9IE1hdGgubWF4KDI4MCwgd2lkdGgpLCBIID0gaGVpZ2h0LCBMID0gNCwgUiA9IDUyLCBUID0gMjYsIEIgPSAzMDsKICBjb25zdCB0b3RhbHMgPSBkYXlzLm1hcCgoXywgaSkgPT4gc3RhY2tzLnJlZHVjZSgoYSwgcykgPT4gYSArIHMudmFsdWVzW2ldLmFtb3VudCwgMCkpOwogIGNvbnN0IG1heCA9IHVuaXRzICYmIE1hdGgubWF4KC4uLnRvdGFscykgPD0gMCA/IDEwIDogbmljZU1heChNYXRoLm1heCguLi50b3RhbHMpICogMS4wOCk7CiAgY29uc3Qgc2xvdCA9IChXIC0gTCAtIFIpIC8gZGF5cy5sZW5ndGgsIGJ3ID0gTWF0aC5taW4oNTYsIHNsb3QgKiAwLjU4KTsKICBjb25zdCBjb21wYWN0ID0gc2xvdCA8IDc0OyAvLyBjYWphIGFuZ29zdGEgKGNlbHVsYXIgLyB0YXJqZXRhIGNoaWNhKTogbWVub3MgZXRpcXVldGFzIHBhcmEgcXVlIG5vIHNlIGVuY2ltZW4KICBsZXQgYmVzdEkgPSAwOyB0b3RhbHMuZm9yRWFjaCgodCwgaSkgPT4geyBpZiAodCA+IHRvdGFsc1tiZXN0SV0pIGJlc3RJID0gaTsgfSk7CiAgY29uc3QgeSA9IHYgPT4gVCArIChIIC0gVCAtIEIpICogKDEgLSB2IC8gbWF4KTsKICBsZXQgZyA9ICcnOwogIGZvciAoY29uc3QgZiBvZiBbMC41LCAxXSkgZyArPSBgPGxpbmUgeDE9IiR7TH0iIHgyPSIke1cgLSBSfSIgeTE9IiR7eShtYXggKiBmKX0iIHkyPSIke3kobWF4ICogZil9IiBzdHJva2U9InZhcigtLWxpbmUpIiBzdHJva2UtZGFzaGFycmF5PSIzIDQiLz48dGV4dCB4PSIke1cgLSAyfSIgeT0iJHt5KG1heCAqIGYpICsgNH0iIHRleHQtYW5jaG9yPSJlbmQiIGNsYXNzPSJjaC1heCI+JHtmbXRTKG1heCAqIGYpfTwvdGV4dD5gOwogIGcgKz0gYDxsaW5lIHgxPSIke0x9IiB4Mj0iJHtXIC0gUn0iIHkxPSIke3koMCl9IiB5Mj0iJHt5KDApfSIgc3Ryb2tlPSJ2YXIoLS1saW5lKSIvPmA7CiAgZGF5cy5mb3JFYWNoKChkLCBpKSA9PiB7CiAgICBjb25zdCB4ID0gTCArIHNsb3QgKiBpICsgKHNsb3QgLSBidykgLyAyOwogICAgbGV0IGFjYyA9IDA7CiAgICBjb25zdCBzZWdzID0gc3RhY2tzLmZpbHRlcihzID0+IHMudmFsdWVzW2ldLmFtb3VudCA+IDApOwogICAgc2Vncy5mb3JFYWNoKChzLCBrKSA9PiB7CiAgICAgIGNvbnN0IHYgPSBzLnZhbHVlc1tpXS5hbW91bnQsIHkxID0geShhY2MgKyB2KSwgeTAgPSB5KGFjYyk7CiAgICAgIGNvbnN0IHRvcCA9IGsgPT09IHNlZ3MubGVuZ3RoIC0gMTsKICAgICAgY29uc3QgaCA9IE1hdGgubWF4KDAsIHkwIC0geTEgLSAoayA+IDAgPyAyIDogMCkpOyAvLyAycHggZGUgc2VwYXJhY2nDs24gZW50cmUgc2VnbWVudG9zCiAgICAgIGcgKz0gdG9wID8gYDxwYXRoIGQ9IiR7YmFyUGF0aCh4LCB5MSwgYncsIGgsIDQpfSIgZmlsbD0iJHtzLmNvbG9yfSIvPmAgOiBgPHJlY3QgeD0iJHt4fSIgeT0iJHt5MX0iIHdpZHRoPSIke2J3fSIgaGVpZ2h0PSIke2h9IiBmaWxsPSIke3MuY29sb3J9Ii8+YDsKICAgICAgYWNjICs9IHY7CiAgICB9KTsKICAgIGNvbnN0IGlzVG9kYXkgPSBkID09PSB0b2RheTsKICAgIGlmICh0b3RhbHNbaV0gPiAwICYmICghY29tcGFjdCB8fCBpc1RvZGF5IHx8IGkgPT09IGJlc3RJKSkgeyBjb25zdCBsYmwgPSBmbXRTKHRvdGFsc1tpXSksIGh3ID0gbGJsLmxlbmd0aCAqIDMuNjsgY29uc3QgY3ggPSBNYXRoLm1pbihNYXRoLm1heCh4ICsgYncgLyAyLCBMICsgaHcpLCBXIC0gUiAtIGh3ICsgMzApOyBnICs9IGA8dGV4dCB4PSIke2N4fSIgeT0iJHt5KHRvdGFsc1tpXSkgLSA3fSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgY2xhc3M9ImNoLXZhbCR7aXNUb2RheSA/ICcgY2gtdG9kYXknIDogJyd9Ij4ke2xibH08L3RleHQ+YDsgfQogICAgZyArPSBgPHRleHQgeD0iJHt4ICsgYncgLyAyfSIgeT0iJHtIIC0gMTB9IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBjbGFzcz0iY2gtZGF5JHtpc1RvZGF5ID8gJyBjaC10b2RheScgOiAnJ30iPiR7bGFiZWwgPyBlc2MobGFiZWwoZCkpIDogaXNUb2RheSA/ICdIb3knIDogY29tcGFjdCA/IGRheVNob3J0KGQpLnNsaWNlKDAsIDIpICsgJyAnICsgZC5zbGljZSg4KS5yZXBsYWNlKC9eMC8sICcnKSA6IGRheVNob3J0KGQpfTwvdGV4dD5gOwogICAgY29uc3QgdGlwID0gW3RpdGxlID8gdGl0bGUoZCkgOiBkYXlMb25nKGQpLCAuLi5zdGFja3MubWFwKHMgPT4gYCR7cy5sYWJlbH06ICR7Zm10TChzLnZhbHVlc1tpXS5hbW91bnQpfSR7dW5pdHMgPyAnJyA6IGAgwrcgJHtzLnZhbHVlc1tpXS5vcmRlcnN9IHZlbnRhJHtzLnZhbHVlc1tpXS5vcmRlcnMgPT09IDEgPyAnJyA6ICdzJ31gfWApLCBzdGFja3MubGVuZ3RoID4gMSA/IGBUb3RhbDogJHtmbXRMKHRvdGFsc1tpXSl9YCA6ICcnXS5maWx0ZXIoQm9vbGVhbikuam9pbignfCcpOwogICAgZyArPSBgPHJlY3QgeD0iJHtMICsgc2xvdCAqIGl9IiB5PSIke1QgLSAyMH0iIHdpZHRoPSIke3Nsb3R9IiBoZWlnaHQ9IiR7SCAtIFQgLSBCICsgMjB9IiBmaWxsPSJ0cmFuc3BhcmVudCIgY2xhc3M9ImNoLWhpdCIgZGF0YS10aXA9IiR7ZXNjKHRpcCl9Ii8+YDsKICB9KTsKICByZXR1cm4gYDxzdmcgdmlld0JveD0iMCAwICR7V30gJHtIfSIgd2lkdGg9IiR7V30iIGhlaWdodD0iJHtIfSIgY2xhc3M9ImNoYXJ0IiByb2xlPSJpbWciPiR7Z308L3N2Zz5gOwp9CmZ1bmN0aW9uIHNhbGVzVGFibGUoZGF5cywgZCkgewogIHJldHVybiBgPGRldGFpbHMgY2xhc3M9ImNoLXRhYmxlIj48c3VtbWFyeT5WZXIgdGFibGE8L3N1bW1hcnk+PGRpdiBjbGFzcz0idGFibGUtd3JhcCI+PHRhYmxlPjx0aGVhZD48dHI+PHRoPkTDrWE8L3RoPiR7WydtbCcsICdmYScsICdwYSddLm1hcChrID0+IGA8dGg+JHtNS1trXX08L3RoPmApLmpvaW4oJycpfTx0aD5Ub3RhbDwvdGg+PC90cj48L3RoZWFkPjx0Ym9keT4KICAgICR7ZGF5cy5tYXAoKGRheSwgaSkgPT4gYDx0cj48dGQ+JHtlc2MoZGF5TG9uZyhkYXkpKX08L3RkPiR7WydtbCcsICdmYScsICdwYSddLm1hcChrID0+IGA8dGQ+JHttb25leShkLnNlcmllc1trXVtpXS5hbW91bnQpfSA8c3BhbiBjbGFzcz0ibXV0ZWQiPigke2Quc2VyaWVzW2tdW2ldLm9yZGVyc30pPC9zcGFuPjwvdGQ+YCkuam9pbignJyl9PHRkPjxiPiR7bW9uZXkoWydtbCcsICdmYScsICdwYSddLnJlZHVjZSgoYSwgaykgPT4gYSArIGQuc2VyaWVzW2tdW2ldLmFtb3VudCwgMCkpfTwvYj48L3RkPjwvdHI+YCkuam9pbignJyl9CiAgPC90Ym9keT48L3RhYmxlPjwvZGl2PjwvZGV0YWlscz5gOwp9CmFzeW5jIGZ1bmN0aW9uIHJlbmRlclNhbGVzKGZvcmNlID0gZmFsc2UpIHsKICBjb25zdCBpc0FkbWluID0gbWUudXNlci5yb2xlID09PSAnYWRtaW4nOwogIGlmICghJCgnI3NhbGVzQm9keScpKSAkKCcjbWFpbicpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJzZWN0aW9uLXRpdGxlIiBzdHlsZT0ibWFyZ2luLXRvcDoyMnB4Ij48aDI+QW7DoWxpc2lzIHZlbnRhczwvaDI+PHNwYW4gY2xhc3M9Im11dGVkIj7Dmmx0aW1vcyA3IGTDrWFzIMK3IHNlIGFjdHVhbGl6YSBzb2xhPC9zcGFuPjxzcGFuIGNsYXNzPSJzcGFjZXIiIHN0eWxlPSJmbGV4OjEiPjwvc3Bhbj48c3BhbiBpZD0ic2FsZXNQaWNrIj48L3NwYW4+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1naG9zdCBidG4tc20iIGlkPSJzYWxlc1JlZnJlc2giPiR7SS5zeW5jfUFjdHVhbGl6YXI8L2J1dHRvbj48L2Rpdj48ZGl2IGlkPSJzYWxlc0JvZHkiPjxkaXYgY2xhc3M9InBhbmVsIj48ZGl2IGNsYXNzPSJwYW5lbC1ib2R5IG11dGVkIj5DYXJnYW5kbyB0dXMgdmVudGFz4oCmPC9kaXY+PC9kaXY+PC9kaXY+PGRpdiBjbGFzcz0iY2gtdGlwIiBpZD0iY2hUaXAiIGhpZGRlbj48L2Rpdj5gOwogICQoJyNzYWxlc1JlZnJlc2gnKS5vbmNsaWNrID0gYXN5bmMgKCkgPT4geyAkKCcjc2FsZXNSZWZyZXNoJykuZGlzYWJsZWQgPSB0cnVlOyBhd2FpdCByZW5kZXJTYWxlcyh0cnVlKTsgaWYgKCQoJyNzYWxlc1JlZnJlc2gnKSkgJCgnI3NhbGVzUmVmcmVzaCcpLmRpc2FibGVkID0gZmFsc2U7IHRvYXN0KCdWZW50YXMgYWN0dWFsaXphZGFzJyk7IH07CiAgY29uc3Qgc2lkID0gaXNBZG1pbiA/IHN0b3JlLmdldCgnc2FsZXNTZWxsZXInLCAnJykgOiAnJzsKICBsZXQgZDsKICB0cnkgeyBkID0gYXdhaXQgYXBpKGAvYXBpL3NhbGVzPyR7c2lkID8gJ3NlbGxlcl9pZD0nICsgc2lkICsgJyYnIDogJyd9JHtmb3JjZSA/ICdyZWZyZXNoPTEnIDogJyd9YCk7IH0gY2F0Y2ggKGUpIHsgJCgnI3NhbGVzQm9keScpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJwYW5lbCI+PGRpdiBjbGFzcz0icGFuZWwtYm9keSI+JHtlc2MoZS5tZXNzYWdlKX08L2Rpdj48L2Rpdj5gOyByZXR1cm47IH0KICBpZiAodGFiICE9PSAnc2FsZXMnKSByZXR1cm47CiAgaWYgKGlzQWRtaW4pIHsKICAgICQoJyNzYWxlc1BpY2snKS5pbm5lckhUTUwgPSBgPHNlbGVjdCBpZD0ic2FsZXNTZWwiIHN0eWxlPSJ3aWR0aDphdXRvIj48b3B0aW9uIHZhbHVlPSIiPlRvZGFzIGxhcyBjdWVudGFzPC9vcHRpb24+JHtkLnNlbGxlcnMubWFwKHggPT4gYDxvcHRpb24gdmFsdWU9IiR7eC5pZH0iICR7U3RyaW5nKHguaWQpID09PSBTdHJpbmcoc2lkKSA/ICdzZWxlY3RlZCcgOiAnJ30+JHtlc2MoeC5uYW1lKX08L29wdGlvbj5gKS5qb2luKCcnKX08L3NlbGVjdD5gOwogICAgJCgnI3NhbGVzU2VsJykub25jaGFuZ2UgPSBlID0+IHsgc3RvcmUuc2V0KCdzYWxlc1NlbGxlcicsIGUudGFyZ2V0LnZhbHVlKTsgcmVuZGVyU2FsZXMoKTsgfTsKICB9CiAgY29uc3QgZGF5cyA9IGQuZGF5cywgdGkgPSBkYXlzLmxlbmd0aCAtIDEsIG1rcyA9IFsnbWwnLCAnZmEnLCAncGEnXTsKICBjb25zdCBkYXlUb3RhbCA9IGkgPT4gbWtzLnJlZHVjZSgoYSwgaykgPT4gYSArIGQuc2VyaWVzW2tdW2ldLmFtb3VudCwgMCk7CiAgY29uc3QgZGF5T3JkZXJzID0gaSA9PiBta3MucmVkdWNlKChhLCBrKSA9PiBhICsgZC5zZXJpZXNba11baV0ub3JkZXJzLCAwKTsKICBjb25zdCB3ZWVrVG90YWwgPSBkYXlzLnJlZHVjZSgoYSwgXywgaSkgPT4gYSArIGRheVRvdGFsKGkpLCAwKSwgd2Vla09yZGVycyA9IGRheXMucmVkdWNlKChhLCBfLCBpKSA9PiBhICsgZGF5T3JkZXJzKGkpLCAwKTsKICBsZXQgYmVzdCA9IDA7IGRheXMuZm9yRWFjaCgoXywgaSkgPT4geyBpZiAoZGF5VG90YWwoaSkgPiBkYXlUb3RhbChiZXN0KSkgYmVzdCA9IGk7IH0pOwogIGNvbnN0IHVwID0gZGF5VG90YWwodGkgLSAxKSA+IDAgJiYgZGF5VG90YWwodGkpID4gZGF5VG90YWwodGkgLSAxKSA/IE1hdGgucm91bmQoKGRheVRvdGFsKHRpKSAvIGRheVRvdGFsKHRpIC0gMSkgLSAxKSAqIDEwMCkgOiBudWxsOwogIGNvbnN0IGNoZWVyID0gdXAgPyBgwqFWYXMgJHt1cH0lIGFycmliYSBkZSBheWVyISDwn5qAYCA6IGRheU9yZGVycyh0aSkgPyBgwqFZYSBsbGV2YXMgJHtkYXlPcmRlcnModGkpfSB2ZW50YSR7ZGF5T3JkZXJzKHRpKSA9PT0gMSA/ICcnIDogJ3MnfSBob3khYCA6ICdFbCBkw61hIHJlY2nDqW4gZW1waWV6YTogdHVzIHZlbnRhcyBkZSBob3kgYXBhcmVjZW4gYXF1w60nOwogIGNvbnN0IHN0YWNrcyA9IG1rcy5tYXAoayA9PiAoeyBrZXk6IGssIGxhYmVsOiBNS1trXSwgY29sb3I6IE1LX0NPTE9SW2tdLCB2YWx1ZXM6IGQuc2VyaWVzW2tdIH0pKTsKICBjb25zdCBta0NhcmQgPSBrID0+IHsKICAgIGNvbnN0IHdrID0gZC5zZXJpZXNba10ucmVkdWNlKChhLCB4KSA9PiBhICsgeC5hbW91bnQsIDApLCBuID0gZC5zZXJpZXNba10ucmVkdWNlKChhLCB4KSA9PiBhICsgeC5vcmRlcnMsIDApOwogICAgY29uc3Qgb24gPSBkLmNvbm5lY3RlZC5pbmNsdWRlcyhrKSB8fCB3ayA+IDA7CiAgICByZXR1cm4gYDxkaXYgY2xhc3M9InBhbmVsIHNhbGVzLW1rIj48ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj48aDI+PGkgY2xhc3M9ImRvdCIgc3R5bGU9ImJhY2tncm91bmQ6JHtNS19DT0xPUltrXX0iPjwvaT4ke01LW2tdfTwvaDI+PHNwYW4gY2xhc3M9Im11dGVkIj4ke29uID8gYCR7bW9uZXkod2spfSDCtyAke259IHZlbnRhJHtuID09PSAxID8gJycgOiAncyd9IGVuIDcgZMOtYXNgIDogJyd9PC9zcGFuPjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJwYW5lbC1ib2R5Ij4ke29uID8gYDxkaXYgY2xhc3M9ImNoLXNsb3QiIGRhdGEtbWs9IiR7a30iIGRhdGEtaD0iMjAwIj48L2Rpdj5gIDogYDxkaXYgY2xhc3M9ImVtcHR5Ij5Db25lY3RhICR7TUtba119IGVuICR7aXNBZG1pbiA/ICdWZW5kZWRvcmVzJyA6ICdNaSBjdWVudGEnfSBwYXJhIHZlciBhcXXDrSBzdXMgdmVudGFzLjwvZGl2PmB9PC9kaXY+PC9kaXY+YDsKICB9OwogICQoJyNzYWxlc0JvZHknKS5pbm5lckhUTUwgPSBgCiAgICA8ZGl2IGNsYXNzPSJzYWxlcy1rcGlzIj4KICAgICAgPGRpdiBjbGFzcz0ia3BpIGtwaS1oZXJvIj48c21hbGw+VmVuZGlzdGUgaG95PC9zbWFsbD48Yj4ke21vbmV5KGRheVRvdGFsKHRpKSl9PC9iPjxzcGFuPiR7ZGF5T3JkZXJzKHRpKX0gdmVudGEke2RheU9yZGVycyh0aSkgPT09IDEgPyAnJyA6ICdzJ30gwrcgJHtlc2MoY2hlZXIpfTwvc3Bhbj48L2Rpdj4KICAgICAgJHtta3MubWFwKGsgPT4gYDxkaXYgY2xhc3M9ImtwaSI+PHNtYWxsPjxpIGNsYXNzPSJkb3QiIHN0eWxlPSJiYWNrZ3JvdW5kOiR7TUtfQ09MT1Jba119Ij48L2k+JHtNS1trXX0gaG95PC9zbWFsbD48Yj4ke21vbmV5KGQuc2VyaWVzW2tdW3RpXS5hbW91bnQpfTwvYj48c3Bhbj4ke2Quc2VyaWVzW2tdW3RpXS5vcmRlcnN9IHZlbnRhJHtkLnNlcmllc1trXVt0aV0ub3JkZXJzID09PSAxID8gJycgOiAncyd9PC9zcGFuPjwvZGl2PmApLmpvaW4oJycpfQogICAgICA8ZGl2IGNsYXNzPSJrcGkiPjxzbWFsbD7Dmmx0aW1vcyA3IGTDrWFzPC9zbWFsbD48Yj4ke21vbmV5KHdlZWtUb3RhbCl9PC9iPjxzcGFuPiR7d2Vla09yZGVyc30gdmVudGFzJHtkYXlUb3RhbChiZXN0KSA+IDAgPyBgIMK3IG1lam9yIGTDrWE6ICR7ZXNjKGRheUxvbmcoZGF5c1tiZXN0XSkuc3BsaXQoJywnKVswXSl9IPCfj4ZgIDogJyd9PC9zcGFuPjwvZGl2PgogICAgPC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbCI+PGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+PGgyPlRvZG9zIGxvcyBtYXJrZXRwbGFjZXM8L2gyPjxkaXYgY2xhc3M9ImxlZ2VuZCI+JHtta3MubWFwKGsgPT4gYDxzcGFuPjxpIGNsYXNzPSJkb3QiIHN0eWxlPSJiYWNrZ3JvdW5kOiR7TUtfQ09MT1Jba119Ij48L2k+JHtNS1trXX08L3NwYW4+YCkuam9pbignJyl9PC9kaXY+PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9InBhbmVsLWJvZHkiPjxkaXYgY2xhc3M9ImNoLXNsb3QiIGRhdGEtbWs9ImFsbCIgZGF0YS1oPSIyNjAiPjwvZGl2PiR7c2FsZXNUYWJsZShkYXlzLCBkKX08L2Rpdj48L2Rpdj4KICAgIDxkaXYgY2xhc3M9InNhbGVzLWdyaWQiPiR7bWtzLm1hcChta0NhcmQpLmpvaW4oJycpfTwvZGl2PgogICAgPGRpdiBjbGFzcz0icGFuZWwiIGlkPSJwcm9kUGFuZWwiIHN0eWxlPSJtYXJnaW4tdG9wOjE0cHgiPjwvZGl2PgogICAgPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEyLjVweDttYXJnaW46MTBweCAycHgiPk1vbnRvcyBwYWdhZG9zIHNlZ8O6biBjYWRhIG1hcmtldHBsYWNlIChzaW4gY29zdG8gZGUgZW52w61vIGVuIE1lcmNhZG8gTGlicmUpLiBObyBpbmNsdXllIHZlbnRhcyBjYW5jZWxhZGFzLiR7ZC51cGRhdGVkQXQgPyAnIEFjdHVhbGl6YWRvICcgKyBlc2MobmV3IERhdGUoZC51cGRhdGVkQXQpLnRvTG9jYWxlVGltZVN0cmluZygnZXMtQ0wnLCB7IGhvdXI6ICdudW1lcmljJywgbWludXRlOiAnMi1kaWdpdCcgfSkpICsgJy4nIDogJyd9PC9wPmA7CiAgLy8gbG9zIGdyw6FmaWNvcyBzZSBkaWJ1amFuIGFsIGFuY2hvIHJlYWwgZGUgc3UgY2FqYTogZWwgdGV4dG8gcXVlZGEgc2llbXByZSBkZWwgbWlzbW8gdGFtYcOxbyB5IGxlZ2libGUKICBjb25zdCBkcmF3ID0gKCkgPT4gJCQoJy5jaC1zbG90JykuZm9yRWFjaChlbCA9PiB7IGNvbnN0IHcgPSBlbC5jbGllbnRXaWR0aDsgaWYgKCF3IHx8IGVsLl93ID09PSB3KSByZXR1cm47IGVsLl93ID0gdzsgZWwuaW5uZXJIVE1MID0gY29sdW1uQ2hhcnQoZGF5cywgZWwuZGF0YXNldC5tayA9PT0gJ2FsbCcgPyBzdGFja3MgOiBbc3RhY2tzLmZpbmQocyA9PiBzLmtleSA9PT0gZWwuZGF0YXNldC5tayldLCB7IGhlaWdodDogK2VsLmRhdGFzZXQuaCwgdG9kYXk6IGQudG9kYXksIHdpZHRoOiB3IH0pOyB9KTsKICBkcmF3KCk7CiAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHJlbmRlclNhbGVzLl9ycyB8fCAoKCkgPT4ge30pKTsgcmVuZGVyU2FsZXMuX3JzID0gKCkgPT4geyBpZiAodGFiID09PSAnc2FsZXMnKSBkcmF3KCk7IH07IHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCByZW5kZXJTYWxlcy5fcnMpOwogIGNvbnN0IHRpcEVsID0gJCgnI2NoVGlwJyk7CiAgJCgnI3NhbGVzQm9keScpLm9ubW91c2Vtb3ZlID0gZSA9PiB7CiAgICBjb25zdCBoID0gZS50YXJnZXQuY2xvc2VzdCgnLmNoLWhpdCcpOwogICAgaWYgKCFoKSB7IHRpcEVsLmhpZGRlbiA9IHRydWU7IHJldHVybjsgfQogICAgY29uc3QgW3QsIC4uLnJlc3RdID0gaC5kYXRhc2V0LnRpcC5zcGxpdCgnfCcpOwogICAgdGlwRWwuaW5uZXJIVE1MID0gYDxiPiR7ZXNjKHQpfTwvYj4ke3Jlc3QubWFwKHIgPT4gYDxkaXY+JHtlc2Mocil9PC9kaXY+YCkuam9pbignJyl9YDsKICAgIHRpcEVsLmhpZGRlbiA9IGZhbHNlOwogICAgY29uc3QgeCA9IE1hdGgubWluKGUuY2xpZW50WCArIDE0LCBpbm5lcldpZHRoIC0gdGlwRWwub2Zmc2V0V2lkdGggLSA4KTsKICAgIHRpcEVsLnN0eWxlLmxlZnQgPSB4ICsgJ3B4JzsgdGlwRWwuc3R5bGUudG9wID0gKGUuY2xpZW50WSArIDE0KSArICdweCc7CiAgfTsKICAkKCcjc2FsZXNCb2R5Jykub25tb3VzZWxlYXZlID0gKCkgPT4geyB0aXBFbC5oaWRkZW4gPSB0cnVlOyB9OwogIHJlbmRlclByb2R1Y3RzKCk7CiAgY2xlYXJUaW1lb3V0KHJlbmRlclNhbGVzLl90KTsgcmVuZGVyU2FsZXMuX3QgPSBzZXRUaW1lb3V0KCgpID0+IHsgaWYgKHRhYiA9PT0gJ3NhbGVzJykgcmVuZGVyU2FsZXMoKTsgfSwgNSAqIDYwZTMpOwp9CgovLyAtLS0tLS0tLS0tIFZFTkRFRE9SRVMgKHNvbG8gbGVjdHVyYSwgcGFyYSBlbCBmdWxmaWxsbWVudCkgLS0tLS0tLS0tLQphc3luYyBmdW5jdGlvbiByZW5kZXJTZWxsZXJzVmlldygpIHsKICAkKCcjbWFpbicpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJzZWN0aW9uLXRpdGxlIiBzdHlsZT0ibWFyZ2luLXRvcDoyMnB4Ij48aDI+VmVuZGVkb3JlczwvaDI+PHNwYW4gY2xhc3M9Im11dGVkIj5Tb2xvIGxlY3R1cmE6IHF1w6kgbWFya2V0cGxhY2VzIHRpZW5lIGNvbmVjdGFkb3MgY2FkYSB2ZW5kZWRvci48L3NwYW4+PC9kaXY+PGRpdiBjbGFzcz0icGFuZWwiPjxkaXYgaWQ9InN2Qm9keSIgY2xhc3M9InBhbmVsLWJvZHkiPjxkaXYgY2xhc3M9Im11dGVkIj5DYXJnYW5kb+KApjwvZGl2PjwvZGl2PjwvZGl2PmA7CiAgY29uc3QgeyBzZWxsZXJzOiBsaXN0IH0gPSBhd2FpdCBhcGkoJy9hcGkvc2VsbGVycy9vdmVydmlldycpOwogIGNvbnN0IGNvbm4gPSBjID0+IGA8c3BhbiBjbGFzcz0ibWsgJHtjLm1hcmtldHBsYWNlfSI+JHtNS1tjLm1hcmtldHBsYWNlXX08L3NwYW4+IDxzcGFuIGNsYXNzPSJub3RlIiBzdHlsZT0iZGlzcGxheTppbmxpbmUiPiR7Yy5vayA/ICdDb25lY3RhZG8nIDogJzxiIHN0eWxlPSJjb2xvcjp2YXIoLS1sb2NrKSI+Q29uIHByb2JsZW1hczwvYj4nfSR7Yy5sYXN0X3N5bmNfYXQgPyAnIMK3IHJldmlzYWRvICcgKyBlc2MoZm10VGltZShjLmxhc3Rfc3luY19hdCkpIDogJyd9PC9zcGFuPmA7CiAgJCgnI3N2Qm9keScpLmlubmVySFRNTCA9IGxpc3QubGVuZ3RoID8gYDxkaXYgY2xhc3M9InRhYmxlLXdyYXAiPjx0YWJsZSBzdHlsZT0ibWluLXdpZHRoOjUyMHB4Ij48dGhlYWQ+PHRyPjx0aD5WZW5kZWRvcjwvdGg+PHRoPk1hcmtldHBsYWNlcyBjb25lY3RhZG9zPC90aD48dGg+UG9yIGltcHJpbWlyPC90aD48dGg+UHJvZHVjdG9zIGJsb3F1ZWFkb3M8L3RoPjwvdHI+PC90aGVhZD48dGJvZHk+CiAgICAke2xpc3QubWFwKHMgPT4gYDx0cj48dGQ+PGI+JHtlc2Mocy5uYW1lKX08L2I+PC90ZD48dGQ+PGRpdiBjbGFzcz0ic3RhY2siIHN0eWxlPSJnYXA6NnB4Ij4ke3MuY29ubmVjdGlvbnMubWFwKGNvbm4pLmpvaW4oJycpIHx8ICc8c3BhbiBjbGFzcz0ibXV0ZWQiPlNpbiBtYXJrZXRwbGFjZXMgY29uZWN0YWRvczwvc3Bhbj4nfTwvZGl2PjwvdGQ+PHRkPiR7cy5wZW5kaW5nfTwvdGQ+PHRkPiR7cy5ibG9ja2VkfTwvdGQ+PC90cj5gKS5qb2luKCcnKX0KICAgIDwvdGJvZHk+PC90YWJsZT48L2Rpdj5gIDogYDxkaXYgY2xhc3M9ImVtcHR5Ij4ke0VNUFRZX1NWR308ZGl2PkHDum4gbm8gaGF5IHZlbmRlZG9yZXMuPC9kaXY+PC9kaXY+YDsKfQoKZnVuY3Rpb24gc3RhcnRDbG9jaygpIHsKICBjb25zdCBbaGgsIG1tXSA9IG1lLmN1dG9mZi5zcGxpdCgnOicpLm1hcChOdW1iZXIpOwogIGNvbnN0IHRpY2sgPSAoKSA9PiB7CiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLCBjdXQgPSBuZXcgRGF0ZShub3cpOyBjdXQuc2V0SG91cnMoaGgsIG1tLCAwLCAwKTsKICAgIGNvbnN0IGMgPSAkKCcjY2xvY2snKTsgaWYgKCFjKSByZXR1cm47CiAgICBpZiAobm93ID49IGN1dCkgeyBjdXQuc2V0RGF0ZShjdXQuZ2V0RGF0ZSgpICsgMSk7IGMuY2xhc3NMaXN0LmFkZCgnbGF0ZScpOyB9IGVsc2UgYy5jbGFzc0xpc3QucmVtb3ZlKCdsYXRlJyk7CiAgICBjb25zdCBkID0gTWF0aC5mbG9vcigoY3V0IC0gbm93KSAvIDEwMDApOwogICAgJCgnI2NkJykudGV4dENvbnRlbnQgPSBbTWF0aC5mbG9vcihkIC8gMzYwMCksIE1hdGguZmxvb3IoZCAlIDM2MDAgLyA2MCksIGQgJSA2MF0ubWFwKHggPT4gU3RyaW5nKHgpLnBhZFN0YXJ0KDIsICcwJykpLmpvaW4oJzonKTsKICB9OwogIHRpY2soKTsgY2xlYXJJbnRlcnZhbChzdGFydENsb2NrLl9pKTsgc3RhcnRDbG9jay5faSA9IHNldEludGVydmFsKHRpY2ssIDEwMDApOwp9CgpsZXQgZXMgPSBudWxsLCByZWZyZXNoVCA9IG51bGw7CmZ1bmN0aW9uIGNvbm5lY3RTdHJlYW0oKSB7CiAgaWYgKGVzKSBlcy5jbG9zZSgpOwogIGVzID0gbmV3IEV2ZW50U291cmNlKCcvYXBpL3N0cmVhbScpOwogIGNvbnN0IGxpdmUgPSBvbiA9PiB7IGNvbnN0IGwgPSAkKCcjbGl2ZScpOyBpZiAoIWwpIHJldHVybjsgbC5jbGFzc0xpc3QudG9nZ2xlKCdvbicsIG9uKTsgbC5sYXN0RWxlbWVudENoaWxkLnRleHRDb250ZW50ID0gb24gPyAnRW4gdml2bycgOiAnUmVjb25lY3RhbmRv4oCmJzsgfTsKICBlcy5vbm9wZW4gPSAoKSA9PiBsaXZlKHRydWUpOwogIGVzLm9uZXJyb3IgPSAoKSA9PiBsaXZlKGZhbHNlKTsKICBlcy5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBldiA9PiB7CiAgICBjb25zdCBkID0gSlNPTi5wYXJzZShldi5kYXRhKTsKICAgIGNsZWFyVGltZW91dChyZWZyZXNoVCk7CiAgICByZWZyZXNoVCA9IHNldFRpbWVvdXQoKCkgPT4geyBpZiAoZC50eXBlID09PSAnY29kZXMnKSB7IGxvYWRDb2RlcygpOyByZXR1cm47IH0gaWYgKHRhYiA9PT0gJ3RyYXknKSBsb2FkT3JkZXJzKCk7IGVsc2UgaWYgKHRhYiA9PT0gJ3NlbGxlcicgJiYgWydvcmRlcicsICdsYWJlbCcsICdibG9ja2xpc3QnLCAnY29ubmVjdGlvbicsICdwcmludGVkJ10uaW5jbHVkZXMoZC50eXBlKSkgbG9hZFNlbGxlck9yZGVycygpOyB9LCA2MDApOwogIH0pOwp9CgoKLy8gLS0tLS0tLS0tLSBDw7NkaWdvcyBkZSBhdXRvcml6YWNpw7NuIGRlIGRldm9sdWNpb25lcyBkZSBNZXJjYWRvIExpYnJlICh1bm8gbnVldm8gY2FkYSBkw61hKSAtLS0tLS0tLS0tCmxldCBjb2Rlc0RhdGEgPSBudWxsOwpjb25zdCBLRVlfU1ZHID0gJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjIuMiIgYXJpYS1oaWRkZW49InRydWUiPjxjaXJjbGUgY3g9IjgiIGN5PSIxNSIgcj0iNCIvPjxwYXRoIGQ9Ik0xMSAxMmw5LTlNMTcgNmwzIDNNMTUgOGwyIDIiLz48L3N2Zz4nOwpjb25zdCBjb2RlRGF5UyA9IGQgPT4gbmV3IERhdGUoZCArICdUMTI6MDA6MDAnKS50b0xvY2FsZURhdGVTdHJpbmcoJ2VzLUNMJywgeyB3ZWVrZGF5OiAnbG9uZycsIGRheTogJ251bWVyaWMnLCBtb250aDogJ2xvbmcnIH0pOwphc3luYyBmdW5jdGlvbiBsb2FkQ29kZXMoKSB7CiAgaWYgKG1lLnVzZXIucm9sZSA9PT0gJ2Z1bGZpbGxtZW50JykgcmV0dXJuOwogIHRyeSB7IGNvZGVzRGF0YSA9IGF3YWl0IGFwaSgnL2FwaS9yZXR1cm4tY29kZXMnKTsgfSBjYXRjaCB7IHJldHVybjsgfQogIGlmICh0YWIgPT09ICdjb2RlcycpIGRyYXdDb2Rlc1BhZ2UoKTsgZWxzZSBkcmF3Q29kZXNTdHJpcCgpOwp9Ci8vIFRpcmEgZGlzY3JldGEgYXJyaWJhIGRlIGxhIGJhbmRlamEgKGFkbWluIHkgdmVuZGVkb3JlcykKZnVuY3Rpb24gZHJhd0NvZGVzU3RyaXAoKSB7CiAgY29uc3QgYm94ID0gJCgnI3Jjb2RlcycpOyBpZiAoIWJveCB8fCAhY29kZXNEYXRhKSByZXR1cm47CiAgY29uc3QgZCA9IGNvZGVzRGF0YTsKICBpZiAoIWQuY29kZXMubGVuZ3RoKSB7IGJveC5oaWRkZW4gPSB0cnVlOyByZXR1cm47IH0KICBib3guaGlkZGVuID0gZmFsc2U7CiAgY29uc3QgZG9uZSA9IGQuY29kZXMuZmlsdGVyKGMgPT4gYy5jb2RlKS5sZW5ndGgsIG9uZSA9IGQuY29kZXMubGVuZ3RoID09PSAxID8gZC5jb2Rlc1swXSA6IG51bGw7CiAgY29uc3Qgd2FzT3BlbiA9IGJveC5xdWVyeVNlbGVjdG9yKCcucmMtcG9wJykgJiYgIWJveC5xdWVyeVNlbGVjdG9yKCcucmMtcG9wJykuaGlkZGVuOwogIGNvbnN0IGxhYmVsID0gb25lID8gKG9uZS5jb2RlID8gYEPDs2RpZ28gTUwgaG95IDxiIGNsYXNzPSJyYy1jb2RlIj4ke2VzYyhvbmUuY29kZSl9PC9iPmAgOiAnQ8OzZGlnbyBNTCBob3k6IDxzcGFuIGNsYXNzPSJyYy1taXNzIj5zaW4gY2FyZ2FyPC9zcGFuPicpIDogYEPDs2RpZ29zIE1MIDxiPiR7ZG9uZX0vJHtkLmNvZGVzLmxlbmd0aH08L2I+YDsKICBib3guaW5uZXJIVE1MID0gYDxidXR0b24gdHlwZT0iYnV0dG9uIiBjbGFzcz0icmMtcGlsbCIgZGF0YS1yY3RvZ2dsZSBhcmlhLWV4cGFuZGVkPSIke3dhc09wZW59Ij4ke0tFWV9TVkd9PHNwYW4+JHtsYWJlbH08L3NwYW4+PC9idXR0b24+CiAgICA8ZGl2IGNsYXNzPSJyYy1wb3AiICR7d2FzT3BlbiA/ICcnIDogJ2hpZGRlbid9PjxkaXYgY2xhc3M9InJjLXBvcC1oIj5EZXZvbHVjaW9uZXMgTWVyY2FkbyBMaWJyZSDCtyAke2VzYyhjb2RlRGF5UyhkLmRheSkpfTwvZGl2PgogICAgJHtkLmNvZGVzLm1hcChjID0+IGA8ZGl2IGNsYXNzPSJyYy1yb3ciPjxzcGFuIGNsYXNzPSJyYy1uIj4ke2VzYyhjLnNlbGxlcil9PC9zcGFuPiR7Yy5jb2RlID8gYDxiIGNsYXNzPSJyYy1jb2RlIj4ke2VzYyhjLmNvZGUpfTwvYj5gIDogJzxzcGFuIGNsYXNzPSJyYy1taXNzIj5zaW4gY8OzZGlnbzwvc3Bhbj4nfSR7ZC5jYW5FZGl0ID8gYDxidXR0b24gY2xhc3M9InJjLWVkaXQiIGRhdGEtcmM9IiR7Yy5zZWxsZXJfaWR9Ij4ke2MuY29kZSA/ICdDYW1iaWFyJyA6ICdBZ3JlZ2FyJ308L2J1dHRvbj5gIDogJyd9PC9kaXY+YCkuam9pbignJyl9CiAgICAke2QuY2FuRWRpdCA/ICc8YnV0dG9uIGNsYXNzPSJyYy1lZGl0IHJjLWhvd2J0biIgZGF0YS1ob3c+wr9Dw7NtbyBjYXJnYXJsbyBlbiAxIGNsaWM/PC9idXR0b24+PGRpdiBjbGFzcz0icmMtaG93Ym94IiBoaWRkZW4+JyArIGJvb2ttYXJrbGV0SGVscCgpICsgJzwvZGl2PicgOiAnJ308L2Rpdj5gOwogIGJveC5vbmNsaWNrID0gZSA9PiB7CiAgICBpZiAoZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtcmN0b2dnbGVdJykpIHsgY29uc3QgcG9wID0gYm94LnF1ZXJ5U2VsZWN0b3IoJy5yYy1wb3AnKTsgcG9wLmhpZGRlbiA9ICFwb3AuaGlkZGVuOyBib3gucXVlcnlTZWxlY3RvcignW2RhdGEtcmN0b2dnbGVdJykuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgIXBvcC5oaWRkZW4pOyByZXR1cm47IH0KICAgIGlmIChlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1ob3ddJykpIHsgY29uc3QgaCA9IGJveC5xdWVyeVNlbGVjdG9yKCcucmMtaG93Ym94Jyk7IGguaGlkZGVuID0gIWguaGlkZGVuOyByZXR1cm47IH0KICAgIGNvZGVzRWRpdENsaWNrKGUpOwogIH07CiAgaWYgKCFkcmF3Q29kZXNTdHJpcC5fb3V0c2lkZSkgeyBkcmF3Q29kZXNTdHJpcC5fb3V0c2lkZSA9IHRydWU7IGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZSA9PiB7IGNvbnN0IGJ4ID0gJCgnI3Jjb2RlcycpOyBjb25zdCBwb3AgPSBieD8ucXVlcnlTZWxlY3RvcignLnJjLXBvcCcpOyBpZiAocG9wICYmICFwb3AuaGlkZGVuICYmICFieC5jb250YWlucyhlLnRhcmdldCkpIHsgcG9wLmhpZGRlbiA9IHRydWU7IGJ4LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXJjdG9nZ2xlXScpPy5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAnZmFsc2UnKTsgfSB9KTsgfQp9CmZ1bmN0aW9uIGNvZGVzRWRpdENsaWNrKGUpIHsKICBjb25zdCBiID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtcmNdJyk7IGlmICghYikgcmV0dXJuOwogIGNvbnN0IHNpZCA9IE51bWJlcihiLmRhdGFzZXQucmMpLCBjID0gY29kZXNEYXRhLmNvZGVzLmZpbmQoeCA9PiB4LnNlbGxlcl9pZCA9PT0gc2lkKTsKICBjb25zdCBjaGlwID0gYi5jbG9zZXN0KCcucmMtcm93LCAucmMtY2FyZCcpOwogIGNvbnN0IGhvbGRlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2Zvcm0nKTsgaG9sZGVyLmNsYXNzTmFtZSA9ICdyYy1mb3JtJzsKICBob2xkZXIuaW5uZXJIVE1MID0gYDxpbnB1dCBtYXhsZW5ndGg9IjMwIiBwbGFjZWhvbGRlcj0iQ8OzZGlnbyBkZSBob3kiIHZhbHVlPSIke2VzYyhjPy5jb2RlIHx8ICcnKX0iIGFyaWEtbGFiZWw9IkPDs2RpZ28gZGUgJHtlc2MoYz8uc2VsbGVyIHx8ICcnKX0iPjxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSBidG4tc20iPkd1YXJkYXI8L2J1dHRvbj5gOwogIGIucmVwbGFjZVdpdGgoaG9sZGVyKTsKICBjb25zdCBpbnAgPSBob2xkZXIucXVlcnlTZWxlY3RvcignaW5wdXQnKTsgaW5wLmZvY3VzKCk7IGlucC5zZWxlY3QoKTsKICBob2xkZXIub25zdWJtaXQgPSBhc3luYyBldiA9PiB7IGV2LnByZXZlbnREZWZhdWx0KCk7IHRyeSB7IGNvbnN0IHByZXYgPSBjPy5jb2RlIHx8ICcnOyBhd2FpdCBhcGkoJy9hcGkvcmV0dXJuLWNvZGVzLycgKyBzaWQsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgY29kZTogaW5wLnZhbHVlIH0gfSk7IGlmIChwcmV2ICE9PSBpbnAudmFsdWUudHJpbSgpKSB7IGF3YWl0IGFwaSgnL2FwaS91bmRvL2NvZGUnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGxhYmVsOiAnQ8OzZGlnbyBkZSAnICsgKGM/LnNlbGxlciB8fCAnJyksIHNlbGxlcl9pZDogc2lkLCBwcmV2LCBuZXh0OiBpbnAudmFsdWUudHJpbSgpIH0gfSkuY2F0Y2goKCkgPT4ge30pOyByZWZyZXNoVW5kbygpOyB9IHRvYXN0KCdDw7NkaWdvIGd1YXJkYWRvJyk7IGxvYWRDb2RlcygpOyB9IGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UsIDQwMDApOyB9IH07CiAgaW5wLm9ua2V5ZG93biA9IGV2ID0+IHsgaWYgKGV2LmtleSA9PT0gJ0VzY2FwZScpIGxvYWRDb2RlcygpOyB9OwogIGlmIChjaGlwKSBjaGlwLmNsYXNzTGlzdC5hZGQoJ3JjLWVkaXRpbmcnKTsKfQoKLy8gTWFyY2Fkb3IgIkVudmlhciBjw7NkaWdvIGEgRXRpcXVldGFIdWIiOiBlbiBNZXJjYWRvIExpYnJlIChWZW50YXMpIGxlZSBlbCAiQ8OzZGlnbyBkZSBhdXRvcml6YWNpw7NuIHBhcmEgaG95IiB5IGxvIGFicmUgYXF1w60KY29uc3QgQk9PS01BUktMRVQgPSBgamF2YXNjcmlwdDooKCk9Pntjb25zdCB0PWRvY3VtZW50LmJvZHkuaW5uZXJUZXh0O2NvbnN0IG09dC5tYXRjaCgvYXV0b3JpemFjaVtvw7NdbiBwYXJhIGhveTo/XFxzKihbQS1aMC05XXs0LDE2fSkvaSk7aWYoIW0pe2FsZXJ0KCdObyBlbmNvbnRyw6kgZWwgY8OzZGlnby4gQWJyZSBWZW50YXMgZW4gTWVyY2FkbyBMaWJyZSB5IHZ1ZWx2ZSBhIGludGVudGFyLicpO3JldHVybn1jb25zdCB1PShkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuaW5uZXJIVE1MLm1hdGNoKC8idXNlcklkIjoiKFxcZCspIi8pfHxbXSlbMV18fCcnO3dpbmRvdy5vcGVuKCcke2xvY2F0aW9uLm9yaWdpbn0vY29kaWdvP2M9JyttWzFdKycmdT0nK3UsJ19ibGFuaycpfSkoKWA7CmZ1bmN0aW9uIGJvb2ttYXJrbGV0SGVscCgpIHsKICByZXR1cm4gYDxkaXYgY2xhc3M9InJjLWhlbHAiPjxiPkNhcmdhciBlbCBjw7NkaWdvIGVuIDEgY2xpYzwvYj48b2w+CiAgICA8bGk+QXJyYXN0cmEgZXN0ZSBib3TDs24gYSB0dSBiYXJyYSBkZSBmYXZvcml0b3M6IDxhIGNsYXNzPSJyYy1ibSIgaHJlZj0iJHtlc2MoQk9PS01BUktMRVQpfSIgb25jbGljaz0iZXZlbnQucHJldmVudERlZmF1bHQoKTthbGVydCgnQXJyw6FzdHJhbG8gYSBsYSBiYXJyYSBkZSBmYXZvcml0b3MgKG5vIGxlIGhhZ2FzIGNsaWMgYXF1w60pLicpIj5FbnZpYXIgY8OzZGlnbyBhIEV0aXF1ZXRhSHViPC9hPjwvbGk+CiAgICA8bGk+Q2FkYSBkw61hIGFicmUgPGI+VmVudGFzPC9iPiBlbiBNZXJjYWRvIExpYnJlIGNvbiBsYSBjdWVudGEgZGVsIHZlbmRlZG9yIHkgaGF6IGNsaWMgZW4gZXNlIGZhdm9yaXRvLjwvbGk+CiAgICA8bGk+RWwgY8OzZGlnbyBxdWVkYSBndWFyZGFkbyBhcXXDrSB5IGxvIHZlbiBsYSBhZ2VuY2lhIHkgZWwgYWRtaW5pc3RyYWRvci48L2xpPjwvb2w+PC9kaXY+YDsKfQphc3luYyBmdW5jdGlvbiBzYXZlQ29kZUZyb21MaW5rKCkgewogIGNvbnN0IHFzID0gbmV3IFVSTFNlYXJjaFBhcmFtcyhsb2NhdGlvbi5zZWFyY2gpLCBjb2RlID0gKHFzLmdldCgnYycpIHx8ICcnKS50cmltKCksIG1sdSA9IChxcy5nZXQoJ3UnKSB8fCAnJykudHJpbSgpOwogIGhpc3RvcnkucmVwbGFjZVN0YXRlKG51bGwsICcnLCAnLycpOwogIGlmICghY29kZSkgcmV0dXJuIHJlbmRlclNoZWxsKCk7CiAgaWYgKG1sdSAmJiBbJ2FkbWluJywgJ3NlbGxlciddLmluY2x1ZGVzKG1lLnVzZXIucm9sZSkpIHsKICAgIHJlbmRlclNoZWxsKCk7CiAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvcmV0dXJuLWNvZGVzL2J5LW1sJywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBtbF91c2VyX2lkOiBtbHUsIGNvZGUgfSB9KTsgdG9hc3QoYEPDs2RpZ28gJHtjb2RlfSBndWFyZGFkb2AsIDQwMDApOyBsb2FkQ29kZXMoKTsgcmV0dXJuOyB9CiAgICBjYXRjaCAoZXJyKSB7IGlmIChtZS51c2VyLnJvbGUgPT09ICdzZWxsZXInKSByZXR1cm4gdG9hc3QoZXJyLm1lc3NhZ2UsIDUwMDApOyB9CiAgfSBlbHNlIHJlbmRlclNoZWxsKCk7CiAgaWYgKG1lLnVzZXIucm9sZSA9PT0gJ3NlbGxlcicgJiYgbWUuc2VsbGVyKSB7CiAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvcmV0dXJuLWNvZGVzLycgKyBtZS5zZWxsZXIuaWQsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgY29kZSB9IH0pOyB0b2FzdChgQ8OzZGlnbyAke2NvZGV9IGd1YXJkYWRvIHBhcmEgJHttZS5zZWxsZXIubmFtZX1gLCA0MDAwKTsgbG9hZENvZGVzKCk7IH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSwgNTAwMCk7IH0KICAgIHJldHVybjsKICB9CiAgaWYgKG1lLnVzZXIucm9sZSAhPT0gJ2FkbWluJykgcmV0dXJuIHRvYXN0KCdTb2xvIGVsIGFkbWluaXN0cmFkb3IgbyBlbCB2ZW5kZWRvciBwdWVkZW4gY2FyZ2FyIGPDs2RpZ29zJywgNDAwMCk7CiAgY29uc3QgZCA9IGF3YWl0IGFwaSgnL2FwaS9yZXR1cm4tY29kZXMnKTsKICBjb25zdCBkbGcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTsgZGxnLmNsYXNzTmFtZSA9ICdyYy1tb2RhbCc7CiAgZGxnLmlubmVySFRNTCA9IGA8Zm9ybSBjbGFzcz0icmMtbW9kYWwtYm94Ij48aDM+wr9EZSBxdcOpIGN1ZW50YSBlcyBlbCBjw7NkaWdvIDxzcGFuIGNsYXNzPSJyYy1jb2RlIj4ke2VzYyhjb2RlKX08L3NwYW4+PzwvaDM+CiAgICA8ZGl2IGNsYXNzPSJyYy1waWNrIj4ke2QuY29kZXMubWFwKGMgPT4gYDxsYWJlbD48aW5wdXQgdHlwZT0icmFkaW8iIG5hbWU9InJjcyIgdmFsdWU9IiR7Yy5zZWxsZXJfaWR9Ij4gJHtlc2MoYy5zZWxsZXIpfSR7Yy5hY2NvdW50ID8gYCA8c21hbGw+JHtlc2MoYy5hY2NvdW50KX08L3NtYWxsPmAgOiAnJ30ke2MuY29kZSA/IGAgPHNtYWxsPihob3k6ICR7ZXNjKGMuY29kZSl9KTwvc21hbGw+YCA6ICcnfTwvbGFiZWw+YCkuam9pbignJyl9PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJyb3ctYWN0aW9ucyI+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5Ij5HdWFyZGFyPC9idXR0b24+PGJ1dHRvbiB0eXBlPSJidXR0b24iIGNsYXNzPSJidG4gYnRuLWxpbmUiIGRhdGEteD5DYW5jZWxhcjwvYnV0dG9uPjwvZGl2PjwvZm9ybT5gOwogIGRvY3VtZW50LmJvZHkuYXBwZW5kKGRsZyk7CiAgZGxnLnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXhdJykub25jbGljayA9ICgpID0+IGRsZy5yZW1vdmUoKTsKICBkbGcucXVlcnlTZWxlY3RvcignZm9ybScpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICBlLnByZXZlbnREZWZhdWx0KCk7CiAgICBjb25zdCB2ID0gZGxnLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W25hbWU9cmNzXTpjaGVja2VkJyk7IGlmICghdikgcmV0dXJuIHRvYXN0KCdFbGlnZSBsYSBjdWVudGEnKTsKICAgIHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9yZXR1cm4tY29kZXMvJyArIHYudmFsdWUsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgY29kZSB9IH0pOyBkbGcucmVtb3ZlKCk7IHRvYXN0KCdDw7NkaWdvIGd1YXJkYWRvJyk7IGxvYWRDb2RlcygpOyB9IGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UsIDQwMDApOyB9CiAgfTsKfQovLyBQw6FnaW5hIGNvbXBsZXRhIHBhcmEgbGEgYWdlbmNpYSAoeSBxdWllbiBsYSBhYnJhKQpmdW5jdGlvbiByZW5kZXJDb2Rlc1BhZ2UoKSB7CiAgJCgnI21haW4nKS5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz0icmMtcGFnZSIgaWQ9InJjUGFnZSI+PGRpdiBjbGFzcz0iZW1wdHkiPkNhcmdhbmRvIGPDs2RpZ29z4oCmPC9kaXY+PC9kaXY+YDsKICBsb2FkQ29kZXMoKTsKfQpmdW5jdGlvbiBkcmF3Q29kZXNQYWdlKCkgewogIGNvbnN0IGJveCA9ICQoJyNyY1BhZ2UnKTsgaWYgKCFib3ggfHwgIWNvZGVzRGF0YSkgcmV0dXJuOwogIGNvbnN0IGQgPSBjb2Rlc0RhdGE7CiAgYm94LmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJyYy1oZXJvIj48aDI+Q8OzZGlnb3MgZGUgYXV0b3JpemFjacOzbiBwYXJhIGhveTwvaDI+PHA+RGV2b2x1Y2lvbmVzIGRlIE1lcmNhZG8gTGlicmUgwrcgPGI+JHtlc2MoY29kZURheVMoZC5kYXkpKX08L2I+PC9wPjxzbWFsbD5DYW1iaWFuIHRvZG9zIGxvcyBkw61hcy4gRXN0YSBwYW50YWxsYSBzZSBhY3R1YWxpemEgc29sYS48L3NtYWxsPjwvZGl2PgogICAgPGRpdiBjbGFzcz0icmMtZ3JpZCI+JHtkLmNvZGVzLm1hcChjID0+IGA8ZGl2IGNsYXNzPSJyYy1jYXJkICR7Yy5jb2RlID8gJycgOiAncmMtZW1wdHknfSI+CiAgICAgIDxzcGFuIGNsYXNzPSJyYy1zZWxsZXIiPiR7ZXNjKGMuc2VsbGVyKX08L3NwYW4+JHtjLmFjY291bnQgPyBgPHNtYWxsIGNsYXNzPSJyYy1hY2MiPiR7ZXNjKGMuYWNjb3VudCl9PC9zbWFsbD5gIDogJyd9CiAgICAgICR7Yy5jb2RlID8gYDxiIGNsYXNzPSJyYy1iaWciPiR7ZXNjKGMuY29kZSl9PC9iPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20gcmMtY29weSIgZGF0YS1jb3B5PSIke2VzYyhjLmNvZGUpfSI+Q29waWFyPC9idXR0b24+YCA6ICc8c3BhbiBjbGFzcz0icmMtd2FpdCI+QcO6biBubyBlc3TDoSBlbCBjw7NkaWdvIGRlIGhveTwvc3Bhbj4nfQogICAgICAke2QuY2FuRWRpdCA/IGA8YnV0dG9uIGNsYXNzPSJyYy1lZGl0IiBkYXRhLXJjPSIke2Muc2VsbGVyX2lkfSI+JHtjLmNvZGUgPyAnQ2FtYmlhcicgOiAnKyBBZ3JlZ2FyIGPDs2RpZ28nfTwvYnV0dG9uPmAgOiAnJ30KICAgIDwvZGl2PmApLmpvaW4oJycpIHx8ICc8ZGl2IGNsYXNzPSJlbXB0eSI+Tm8gaGF5IGN1ZW50YXMgZGUgTWVyY2FkbyBMaWJyZSBjb25lY3RhZGFzLjwvZGl2Pid9PC9kaXY+YDsKICBib3gub25jbGljayA9IGUgPT4gewogICAgY29uc3QgY3AgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1jb3B5XScpOwogICAgaWYgKGNwKSB7IG5hdmlnYXRvci5jbGlwYm9hcmQ/LndyaXRlVGV4dChjcC5kYXRhc2V0LmNvcHkpLnRoZW4oKCkgPT4gdG9hc3QoJ0PDs2RpZ28gY29waWFkbycpKS5jYXRjaCgoKSA9PiB7fSk7IHJldHVybjsgfQogICAgY29kZXNFZGl0Q2xpY2soZSk7CiAgfTsKfQovLyBDYW1iaWEgZWwgZMOtYSBhIG1lZGlhbm9jaGU6IHNlIHZ1ZWx2ZSBhIHBlZGlyIGNhZGEgNSBtaW51dG9zIHkgYWwgdm9sdmVyIGEgbGEgcGVzdGHDsWEKc2V0SW50ZXJ2YWwoKCkgPT4geyBpZiAobWUgJiYgIWRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5yYy1mb3JtIGlucHV0OmZvY3VzJykpIGxvYWRDb2RlcygpOyB9LCAzMDAwMDApOwpkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCd2aXNpYmlsaXR5Y2hhbmdlJywgKCkgPT4geyBpZiAoIWRvY3VtZW50LmhpZGRlbiAmJiBtZSkgbG9hZENvZGVzKCk7IH0pOwoKCi8vIC0tLS0tLS0tLS0gRGVzaGFjZXI6IGNhZGEgdXN1YXJpbyBkZXNoYWNlIHNvbG8gbG8gcXVlIMOpbCBoaXpvLCB1biBwYXNvIGEgbGEgdmV6IC0tLS0tLS0tLS0KbGV0IHVuZG9JbmZvID0geyBsYWJlbDogbnVsbCwgY291bnQ6IDAgfTsKLy8gQW50ZXMgZGUgdW5hIGFjY2nDs246IGd1YXJkYSBjw7NtbyBlc3RhYmFuIGxhcyBldGlxdWV0YXMuIERldnVlbHZlIHVuYSBmdW5jacOzbiBxdWUgc2UgbGxhbWEgY3VhbmRvIGxhIGFjY2nDs24gdGVybWluw7MuCmFzeW5jIGZ1bmN0aW9uIHJlY29yZE9yZGVycyhsYWJlbCwgaWRzKSB7CiAgbGV0IGlkID0gbnVsbDsKICB0cnkgeyBpZCA9IChhd2FpdCBhcGkoJy9hcGkvdW5kby9iZWdpbicsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgbGFiZWwsIGlkcyB9IH0pKS5pZDsgfSBjYXRjaCB7fQogIHJldHVybiBhc3luYyAoKSA9PiB7IGlmICghaWQpIHJldHVybjsgdHJ5IHsgYXdhaXQgYXBpKGAvYXBpL3VuZG8vJHtpZH0vZG9uZWAsIHsgbWV0aG9kOiAnUE9TVCcgfSk7IH0gY2F0Y2gge30gcmVmcmVzaFVuZG8oKTsgfTsKfQphc3luYyBmdW5jdGlvbiByZWZyZXNoVW5kbygpIHsgdHJ5IHsgdW5kb0luZm8gPSBhd2FpdCBhcGkoJy9hcGkvdW5kbycpOyB9IGNhdGNoIHt9IGRyYXdVbmRvKCk7IH0KYXN5bmMgZnVuY3Rpb24gdW5kb0xhc3QoKSB7CiAgY29uc3QgYiA9ICQoJyN1bmRvQnRuJyk7IGlmICghdW5kb0luZm8ubGFiZWwgfHwgYj8uZGlzYWJsZWQpIHJldHVybjsKICBpZiAoYikgYi5kaXNhYmxlZCA9IHRydWU7CiAgdHJ5IHsKICAgIGNvbnN0IHIgPSBhd2FpdCBhcGkoJy9hcGkvdW5kby9sYXN0JywgeyBtZXRob2Q6ICdQT1NUJyB9KTsKICAgIHRvYXN0KHIucmVzdG9yZWQgPyBgRGVzaGVjaG86ICR7ci5sYWJlbH1gICsgKHIuc2tpcHBlZCA/IGAgKCR7ci5za2lwcGVkfSBubyBzZSB0b2Nhcm9uIHBvcnF1ZSBvdHJhIHBlcnNvbmEgbGFzIGNhbWJpw7MgZGVzcHXDqXMpYCA6ICcnKSA6IGBObyBzZSBwdWRvIGRlc2hhY2VyICIke3IubGFiZWx9Ijogb3RyYSBwZXJzb25hIHlhIGNhbWJpw7MgZXNhcyBldGlxdWV0YXNgLCA0NTAwKTsKICB9IGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UsIDQwMDApOyB9CiAgYXdhaXQgcmVmcmVzaFVuZG8oKTsKICBpZiAodGFiID09PSAndHJheScpIGxvYWRPcmRlcnMoKTsgZWxzZSBpZiAodGFiID09PSAnc2VsbGVyJykgbG9hZFNlbGxlck9yZGVycygpOwogIGxvYWRDb2RlcygpOwp9CmZ1bmN0aW9uIGRyYXdVbmRvKCkgewogIGNvbnN0IGIgPSAkKCcjdW5kb0J0bicpOyBpZiAoIWIpIHJldHVybjsKICBiLmRpc2FibGVkID0gIXVuZG9JbmZvLmxhYmVsOwogIGIudGl0bGUgPSB1bmRvSW5mby5sYWJlbCA/IGBEZXNoYWNlcjogJHt1bmRvSW5mby5sYWJlbH0gKEN0cmwrWilgIDogJ05vIHRpZW5lcyBhY2Npb25lcyBwYXJhIGRlc2hhY2VyJzsKICBiLnF1ZXJ5U2VsZWN0b3IoJ3NtYWxsJykudGV4dENvbnRlbnQgPSB1bmRvSW5mby5sYWJlbCB8fCAnTmFkYSBxdWUgZGVzaGFjZXInOwp9CmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBlID0+IHsgaWYgKChlLmN0cmxLZXkgfHwgZS5tZXRhS2V5KSAmJiAhZS5zaGlmdEtleSAmJiBlLmtleS50b0xvd2VyQ2FzZSgpID09PSAneicgJiYgIWUudGFyZ2V0LmNsb3Nlc3QoJ2lucHV0LCB0ZXh0YXJlYSwgc2VsZWN0LCBbY29udGVudGVkaXRhYmxlXScpICYmIHVuZG9JbmZvLmxhYmVsKSB7IGUucHJldmVudERlZmF1bHQoKTsgdW5kb0xhc3QoKTsgfSB9KTsKCgovLyAtLS0tLS0tLS0tIE1LUCBGbGFzaDogcHJlZ3VudGFzLCBtZW5zYWplcywgcmVjbGFtb3MsIG1lZGlhY2lvbmVzIHkgZGV2b2x1Y2lvbmVzIC0tLS0tLS0tLS0KY29uc3QgbWsgPSB7IHZpZXc6ICdxdWVzdGlvbnMnLCBkYXRhOiBudWxsLCBsb2FkaW5nOiBmYWxzZSwgaGlkZGVuOiBuZXcgU2V0KCksIHNlbGxlcjogc3RvcmUuZ2V0KCdta3BTZWxsZXInLCAnJykgfTsKY29uc3QgYWdvUyA9IGQgPT4geyBpZiAoIWQpIHJldHVybiAnJzsgY29uc3QgbSA9IE1hdGgucm91bmQoKERhdGUubm93KCkgLSBuZXcgRGF0ZShkKSkgLyA2MDAwMCk7IHJldHVybiBtIDwgMSA/ICdyZWNpw6luJyA6IG0gPCA2MCA/IGBoYWNlICR7bX0gbWluYCA6IG0gPCAxNDQwID8gYGhhY2UgJHtNYXRoLnJvdW5kKG0gLyA2MCl9IGhgIDogYGhhY2UgJHtNYXRoLnJvdW5kKG0gLyAxNDQwKX0gZGA7IH07CmNvbnN0IFBFUk1fTVNHID0gJzxkaXYgY2xhc3M9Im1rcC1wZXJtIj48Yj5GYWx0YSBhY3RpdmFyIHVuIHBlcm1pc28gZW4gbGEgYXBwIGRlIE1lcmNhZG8gTGlicmUuPC9iPiBFbnRyYSBhIGRldmVsb3BlcnMubWVyY2Fkb2xpYnJlLmNsIOKGkiBNaXMgYXBsaWNhY2lvbmVzIOKGkiBFdGlxdWV0YUh1YiDihpIgRWRpdGFyIOKGkiBQZXJtaXNvcyBmdW5jaW9uYWxlcyB5IGFjdGl2YSA8Yj4iQ29tdW5pY2FjaW9uZXMgcHJlIHkgcG9zdCB2ZW50YSI8L2I+IChsZWN0dXJhIHkgZXNjcml0dXJhKS4gQ3VhbmRvIGxvIGd1YXJkZXMsIGVzdGEgc2VjY2nDs24gc2UgbGxlbmEgc29sYS48L2Rpdj4nOwphc3luYyBmdW5jdGlvbiByZW5kZXJNa3AoZm9yY2UgPSBmYWxzZSkgewogIGlmICghJCgnI21rcEJvZHknKSkgewogICAgJCgnI21haW4nKS5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz0ibWtwLWhlcm8iPjxkaXY+PGgyPk1LUCBGbGFzaDwvaDI+PHA+VG9kbyBsbyBxdWUgdHVzIGNvbXByYWRvcmVzIGVzcGVyYW4gZGUgdGksIGVuIHVuIHNvbG8gbHVnYXIuPC9wPjwvZGl2PjxzcGFuIGNsYXNzPSJzcGFjZXIiIHN0eWxlPSJmbGV4OjEiPjwvc3Bhbj48c3BhbiBpZD0ibWtwUGljayI+PC9zcGFuPjxidXR0b24gY2xhc3M9ImJ0biBidG4tc20gbWtwLXJlZnJlc2giIGlkPSJta3BSZWZyZXNoIj5BY3R1YWxpemFyPC9idXR0b24+PC9kaXY+PGRpdiBpZD0ibWtwQm9keSI+PGRpdiBjbGFzcz0iZW1wdHkiPkNhcmdhbmRvIHByZWd1bnRhcywgbWVuc2FqZXMgeSByZWNsYW1vcyBkZSBNZXJjYWRvIExpYnJl4oCmIChwdWVkZSB0YXJkYXIgdW5vcyBzZWd1bmRvcyk8L2Rpdj48L2Rpdj5gOwogICAgJCgnI21rcFJlZnJlc2gnKS5vbmNsaWNrID0gKCkgPT4gcmVuZGVyTWtwKHRydWUpOwogIH0KICBpZiAobWsubG9hZGluZykgcmV0dXJuOyBtay5sb2FkaW5nID0gdHJ1ZTsKICB0cnkgeyBtay5kYXRhID0gYXdhaXQgYXBpKGAvYXBpL21rcC9zdW1tYXJ5PyR7bWsuc2VsbGVyID8gJ3NlbGxlcl9pZD0nICsgbWsuc2VsbGVyICsgJyYnIDogJyd9JHtmb3JjZSA/ICdyZWZyZXNoPTEnIDogJyd9YCk7IH0KICBjYXRjaCAoZSkgeyAkKCcjbWtwQm9keScpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJwYW5lbCI+PGRpdiBjbGFzcz0icGFuZWwtYm9keSI+JHtlc2MoZS5tZXNzYWdlKX08L2Rpdj48L2Rpdj5gOyBtay5sb2FkaW5nID0gZmFsc2U7IHJldHVybjsgfQogIG1rLmxvYWRpbmcgPSBmYWxzZTsKICBpZiAodGFiICE9PSAnbWtwJykgcmV0dXJuOwogIGlmIChtZS51c2VyLnJvbGUgPT09ICdhZG1pbicgJiYgJCgnI21rcFBpY2snKSAmJiAhJCgnI21rcFNlbCcpKSB7CiAgICBjb25zdCBzbCA9IGF3YWl0IGFwaSgnL2FwaS9zZWxsZXJzL2xpc3QnKS5jYXRjaCgoKSA9PiAoeyBzZWxsZXJzOiBbXSB9KSk7CiAgICAkKCcjbWtwUGljaycpLmlubmVySFRNTCA9IGA8c2VsZWN0IGlkPSJta3BTZWwiIHN0eWxlPSJ3aWR0aDphdXRvIj48b3B0aW9uIHZhbHVlPSIiPlRvZGFzIGxhcyBjdWVudGFzPC9vcHRpb24+JHtzbC5zZWxsZXJzLm1hcCh4ID0+IGA8b3B0aW9uIHZhbHVlPSIke3guaWR9IiAke1N0cmluZyh4LmlkKSA9PT0gU3RyaW5nKG1rLnNlbGxlcikgPyAnc2VsZWN0ZWQnIDogJyd9PiR7ZXNjKHgubmFtZSl9PC9vcHRpb24+YCkuam9pbignJyl9PC9zZWxlY3Q+YDsKICAgICQoJyNta3BTZWwnKS5vbmNoYW5nZSA9IGUgPT4geyBtay5zZWxsZXIgPSBlLnRhcmdldC52YWx1ZTsgc3RvcmUuc2V0KCdta3BTZWxsZXInLCBtay5zZWxsZXIpOyByZW5kZXJNa3AoKTsgfTsKICB9CiAgZHJhd01rcCgpOwogIGNsZWFyVGltZW91dChyZW5kZXJNa3AuX3QpOyByZW5kZXJNa3AuX3QgPSBzZXRUaW1lb3V0KCgpID0+IHsgaWYgKHRhYiA9PT0gJ21rcCcgJiYgIWRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5ta3AtYm9keSB0ZXh0YXJlYTpmb2N1cycpKSByZW5kZXJNa3AoKTsgfSwgbWsuZGF0YS5sb2FkaW5nID8gODAwMCA6IDEyMGUzKTsKfQpmdW5jdGlvbiBta3BMaXN0cygpIHsKICBjb25zdCBkID0gbWsuZGF0YSwgQSA9IGQuYWNjb3VudHM7CiAgY29uc3QgdGFnID0gYSA9PiAoeyAuLi5hIH0pOwogIGNvbnN0IHEgPSBbXSwgbSA9IFtdLCBjID0gW10sIG1kID0gW10sIHIgPSBbXTsKICAvLyBzb2xvIHNlIG11ZXN0cmEgImZhbHRhIHBlcm1pc28iIHNpIE5JTkdVTkEgY3VlbnRhIHB1ZG8gbGVlcnNlOyBzaSBhbGd1bmEgZmFsbGEsIHNlIGF2aXNhIGFwYXJ0ZQogIGNvbnN0IGFsbEVyciA9IGsgPT4gQS5sZW5ndGggPiAwICYmIEEuZXZlcnkoYSA9PiBhLmVycm9yc1trXSA9PT0gJ3Blcm1pc28nKTsKICBjb25zdCBlcnIgPSB7IHF1ZXN0aW9uczogYWxsRXJyKCdxdWVzdGlvbnMnKSwgbWVzc2FnZXM6IGFsbEVycignbWVzc2FnZXMnKSwgY2xhaW1zOiBhbGxFcnIoJ2NsYWltcycpLCByZXR1cm5zOiBhbGxFcnIoJ3JldHVybnMnKSB9OwogIGVyci5wYXJ0aWFsID0gQS5maWx0ZXIoYSA9PiBPYmplY3QudmFsdWVzKGEuZXJyb3JzIHx8IHt9KS5pbmNsdWRlcygncGVybWlzbycpKS5tYXAoYSA9PiBhLnNlbGxlcik7CiAgZm9yIChjb25zdCBhIG9mIEEpIHsKICAgIGEucXVlc3Rpb25zLmZvckVhY2goeCA9PiB7IGlmICghbWsuaGlkZGVuLmhhcygncScgKyB4LmlkKSkgcS5wdXNoKHsgLi4ueCwgYWNjOiBhIH0pOyB9KTsKICAgIGEubWVzc2FnZXMuZm9yRWFjaCh4ID0+IHsgaWYgKCFtay5oaWRkZW4uaGFzKCdtJyArIHgucGFja19pZCkpIG0ucHVzaCh7IC4uLngsIGFjYzogYSB9KTsgfSk7CiAgICBhLmNsYWltcy5mb3JFYWNoKHggPT4gKHguZGlzcHV0ZSA/IG1kIDogYykucHVzaCh7IC4uLngsIGFjYzogYSB9KSk7CiAgICBhLnJldHVybnMuZm9yRWFjaCh4ID0+IHIucHVzaCh7IC4uLngsIGFjYzogYSB9KSk7CiAgfQogIGZvciAoY29uc3QgZiBvZiBkLmZhbGFiZWxsYSkgZi5yZXR1cm5zLmZvckVhY2goeCA9PiByLnB1c2goeyAuLi54LCBhY2M6IGYgfSkpOwogIHJldHVybiB7IHEsIG0sIGMsIG1kLCByLCBlcnIsIHRhZyB9Owp9CmZ1bmN0aW9uIGRyYXdNa3AoKSB7CiAgY29uc3QgYm94ID0gJCgnI21rcEJvZHknKTsgaWYgKCFib3ggfHwgIW1rLmRhdGEpIHJldHVybjsKICBjb25zdCBMID0gbWtwTGlzdHMoKTsKICBjb25zdCByVG9kYXkgPSBMLnIuZmlsdGVyKHggPT4geC50b2RheSk7CiAgY29uc3QgckJ5ID0gayA9PiByVG9kYXkuZmlsdGVyKHggPT4geC5tayA9PT0gaykubGVuZ3RoOwogIGNvbnN0IHRpbGVzID0gWwogICAgWydxdWVzdGlvbnMnLCAnUHJlZ3VudGFzJywgTC5xLmxlbmd0aCwgJ3NpbiByZXNwb25kZXInLCBMLmVyci5xdWVzdGlvbnNdLAogICAgWydtZXNzYWdlcycsICdNZW5zYWplcycsIEwubS5sZW5ndGgsICdzaW4gbGVlcicsIEwuZXJyLm1lc3NhZ2VzXSwKICAgIFsnY2xhaW1zJywgJ1JlY2xhbW9zJywgTC5jLmxlbmd0aCwgJ2FiaWVydG9zJywgTC5lcnIuY2xhaW1zXSwKICAgIFsnbWVkaWF0aW9ucycsICdNZWRpYWNpb25lcycsIEwubWQubGVuZ3RoLCAnZW4gY3Vyc28nLCBMLmVyci5jbGFpbXNdLAogIF07CiAgY29uc3QgYWNjTmFtZSA9IHggPT4gbWUudXNlci5yb2xlID09PSAnYWRtaW4nID8gYDxzcGFuIGNsYXNzPSJta3AtYWNjIj4ke2VzYyh4LmFjYy5zZWxsZXIpfTwvc3Bhbj5gIDogJyc7CiAgY29uc3QgcmVwbHlCb3ggPSAoa2luZCwgYXR0cnMsIG1heCwgcGgpID0+IGA8Zm9ybSBjbGFzcz0ibWtwLXJlcGx5IiBkYXRhLWtpbmQ9IiR7a2luZH0iICR7YXR0cnN9Pjx0ZXh0YXJlYSByb3dzPSIyIiBtYXhsZW5ndGg9IiR7bWF4fSIgcGxhY2Vob2xkZXI9IiR7cGh9Ij48L3RleHRhcmVhPjxkaXYgY2xhc3M9Im1rcC1yZXBseS1iYXIiPjxzbWFsbD48c3BhbiBjbGFzcz0ibWtwLWNudCI+MDwvc3Bhbj4vJHttYXh9PC9zbWFsbD48YnV0dG9uIGNsYXNzPSJidG4gYnRuLXNtIG1rcC1zZW5kIj5SZXNwb25kZXI8L2J1dHRvbj48L2Rpdj48L2Zvcm0+YDsKICBjb25zdCBwcm9kTGluZSA9IHBzID0+IChwcyB8fCBbXSkubWFwKHAgPT4gYCR7ZXNjKHAudGl0bGUgfHwgJycpfSR7cC5xdHkgPiAxID8gYCA8c21hbGw+w5cke3AucXR5fTwvc21hbGw+YCA6ICcnfWApLmpvaW4oJyDCtyAnKTsKICBsZXQgbGlzdCA9ICcnOwogIGlmIChtay52aWV3ID09PSAncXVlc3Rpb25zJykgbGlzdCA9IEwuZXJyLnF1ZXN0aW9ucyA/IFBFUk1fTVNHIDogTC5xLmxlbmd0aCA/IEwucS5tYXAoeCA9PiBgPGFydGljbGUgY2xhc3M9Im1rcC1jYXJkIj4KICAgICAgPGRpdiBjbGFzcz0ibWtwLWNhcmQtaCI+JHt4Lml0ZW0udGh1bWIgPyBgPGltZyBzcmM9IiR7ZXNjKHguaXRlbS50aHVtYil9IiBhbHQ9IiIgbG9hZGluZz0ibGF6eSI+YCA6ICcnfTxkaXY+PGEgaHJlZj0iJHtlc2MoeC5pdGVtLmxpbmsgfHwgJyMnKX0iIHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIj4ke2VzYyh4Lml0ZW0udGl0bGUgfHwgeC5pdGVtLmlkKX08L2E+PHNtYWxsPiR7YWNjTmFtZSh4KX0ke2Fnb1MoeC5kYXRlKX08L3NtYWxsPjwvZGl2PjwvZGl2PgogICAgICA8cCBjbGFzcz0ibWtwLXEiPuKAnCR7ZXNjKHgudGV4dCl94oCdPC9wPiR7cmVwbHlCb3goJ2Fuc3dlcicsIGBkYXRhLWNvbm49IiR7eC5hY2MuY29ubl9pZH0iIGRhdGEtaWQ9IiR7eC5pZH0iYCwgMjAwMCwgJ0VzY3JpYmUgdHUgcmVzcHVlc3Rh4oCmJyl9PC9hcnRpY2xlPmApLmpvaW4oJycpIDogJzxkaXYgY2xhc3M9Im1rcC1lbXB0eSI+8J+OiSBObyB0aWVuZXMgcHJlZ3VudGFzIHBlbmRpZW50ZXMuPC9kaXY+JzsKICBpZiAobWsudmlldyA9PT0gJ21lc3NhZ2VzJykgbGlzdCA9IEwuZXJyLm1lc3NhZ2VzID8gUEVSTV9NU0cgOiBMLm0ubGVuZ3RoID8gTC5tLm1hcCh4ID0+IGA8YXJ0aWNsZSBjbGFzcz0ibWtwLWNhcmQiPgogICAgICA8ZGl2IGNsYXNzPSJta3AtY2FyZC1oIj48ZGl2PjxiPiR7ZXNjKHguYnV5ZXIgfHwgJ0NvbXByYWRvcicpfTwvYj48c21hbGw+JHthY2NOYW1lKHgpfVZlbnRhICMke2VzYyh4LnBhY2tfaWQpfSDCtyAke3gudW5yZWFkfSBzaW4gbGVlcjwvc21hbGw+PHNtYWxsPiR7ZXNjKHgucHJvZHVjdCB8fCAnJyl9PC9zbWFsbD48L2Rpdj48L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0ibWtwLXRocmVhZCI+JHt4LnRocmVhZC5zbGljZSgtNikubWFwKHQgPT4gYDxkaXYgY2xhc3M9Im1rcC1idWIgJHt0LmZyb219Ij48c3Bhbj4ke2VzYyh0LnRleHQgfHwgJycpfTwvc3Bhbj48c21hbGw+JHthZ29TKHQuZGF0ZSl9PC9zbWFsbD48L2Rpdj5gKS5qb2luKCcnKX08L2Rpdj4KICAgICAgJHtyZXBseUJveCgnbWVzc2FnZScsIGBkYXRhLWNvbm49IiR7eC5hY2MuY29ubl9pZH0iIGRhdGEtcGFjaz0iJHtlc2MoeC5wYWNrX2lkKX0iIGRhdGEtYnV5ZXI9IiR7ZXNjKHguYnV5ZXJfaWQgfHwgJycpfSJgLCAzNTAsICdFc2NyaWJlIHVuIG1lbnNhamUgYWwgY29tcHJhZG9y4oCmJyl9PC9hcnRpY2xlPmApLmpvaW4oJycpIDogJzxkaXYgY2xhc3M9Im1rcC1lbXB0eSI+8J+OiSBObyB0aWVuZXMgbWVuc2FqZXMgc2luIGxlZXIuPC9kaXY+JzsKICBjb25zdCBjbGFpbUNhcmQgPSB4ID0+IGA8YXJ0aWNsZSBjbGFzcz0ibWtwLWNhcmQgJHt4LmRpc3B1dGUgPyAnbWtwLW1lZCcgOiAnJ30iPgogICAgICA8ZGl2IGNsYXNzPSJta3AtY2FyZC1oIj48ZGl2PjxiPiR7eC5kaXNwdXRlID8gJ+Kalu+4jyBNZWRpYWNpw7NuJyA6ICfimqDvuI8gUmVjbGFtbyd9IMK3ICR7ZXNjKHgucmVhc29uIHx8ICdTaW4gbW90aXZvJyl9PC9iPjxzbWFsbD4ke2FjY05hbWUoeCl9JHtlc2MoeC5idXllciB8fCAnJyl9IMK3IFZlbnRhICMke2VzYyh4Lm9yZGVyX2lkKX0gwrcgYWJpZXJ0byAke2Fnb1MoeC5kYXRlKX08L3NtYWxsPjxzbWFsbD4ke3Byb2RMaW5lKHgucHJvZHVjdHMpfSR7eC50b3RhbCA/IGAgwrcgPGI+JHttb25leSh4LnRvdGFsKX08L2I+YCA6ICcnfTwvc21hbGw+JHt4LmR1ZSA/IGA8c21hbGwgY2xhc3M9Im1rcC1kdWUiPlJlc3BvbmRlciBhbnRlcyBkZTogJHtlc2MobmV3IERhdGUoeC5kdWUpLnRvTG9jYWxlU3RyaW5nKCdlcy1DTCcsIHsgZGF5OiAnMi1kaWdpdCcsIG1vbnRoOiAnc2hvcnQnLCBob3VyOiAnMi1kaWdpdCcsIG1pbnV0ZTogJzItZGlnaXQnIH0pKX08L3NtYWxsPmAgOiAnJ308L2Rpdj48L2Rpdj4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1jbGFpbXRocmVhZD0iJHt4LmlkfSIgZGF0YS1jb25uPSIke3guYWNjLmNvbm5faWR9Ij5WZXIgY29udmVyc2FjacOzbjwvYnV0dG9uPjxkaXYgY2xhc3M9Im1rcC10aHJlYWQiIGlkPSJjdC0ke3guaWR9IiBoaWRkZW4+PC9kaXY+CiAgICAgICR7cmVwbHlCb3goJ2NsYWltJywgYGRhdGEtY29ubj0iJHt4LmFjYy5jb25uX2lkfSIgZGF0YS1pZD0iJHt4LmlkfSIgZGF0YS1tZWQ9IiR7eC5kaXNwdXRlID8gMSA6IDB9ImAsIDIwMDAsIHguZGlzcHV0ZSA/ICdFc2NyaWJlIGFsIG1lZGlhZG9yIGRlIE1lcmNhZG8gTGlicmXigKYnIDogJ1Jlc3BvbmRlIGFsIGNvbXByYWRvcuKApicpfTwvYXJ0aWNsZT5gOwogIGlmIChtay52aWV3ID09PSAnY2xhaW1zJykgbGlzdCA9IEwuZXJyLmNsYWltcyA/IFBFUk1fTVNHIDogTC5jLmxlbmd0aCA/IEwuYy5tYXAoY2xhaW1DYXJkKS5qb2luKCcnKSA6ICc8ZGl2IGNsYXNzPSJta3AtZW1wdHkiPvCfjokgTm8gdGllbmVzIHJlY2xhbW9zIGFiaWVydG9zLjwvZGl2Pic7CiAgaWYgKG1rLnZpZXcgPT09ICdtZWRpYXRpb25zJykgbGlzdCA9IEwuZXJyLmNsYWltcyA/IFBFUk1fTVNHIDogTC5tZC5sZW5ndGggPyBMLm1kLm1hcChjbGFpbUNhcmQpLmpvaW4oJycpIDogJzxkaXYgY2xhc3M9Im1rcC1lbXB0eSI+8J+OiSBObyB0aWVuZXMgbWVkaWFjaW9uZXMgZW4gY3Vyc28uPC9kaXY+JzsKICBpZiAobWsudmlldyA9PT0gJ3JldHVybnMnKSB7CiAgICBjb25zdCBncnAgPSAoaywgYXJyLCBleHRyYSkgPT4gYDxzZWN0aW9uIGNsYXNzPSJta3AtcmV0IG1rcC1yZXQtJHtrfSI+PGgzPjxpPjwvaT4ke01LW2tdfSA8Yj4ke2Fyci5maWx0ZXIoeCA9PiB4LnRvZGF5KS5sZW5ndGh9PC9iPiA8c21hbGw+cGFyYSBob3k8L3NtYWxsPiR7YXJyLmxlbmd0aCA+IGFyci5maWx0ZXIoeCA9PiB4LnRvZGF5KS5sZW5ndGggPyBgPHNtYWxsPiDCtyAke2Fyci5sZW5ndGggLSBhcnIuZmlsdGVyKHggPT4geC50b2RheSkubGVuZ3RofSBlbiBjYW1pbm88L3NtYWxsPmAgOiAnJ308L2gzPgogICAgICAke2V4dHJhIHx8IChhcnIubGVuZ3RoID8gYXJyLnNvcnQoKGEsIGIpID0+IGIudG9kYXkgLSBhLnRvZGF5KS5tYXAoeCA9PiBgPGRpdiBjbGFzcz0ibWtwLXJyb3ciPjxkaXY+PGI+JHtlc2MoeC5idXllciB8fCAnQ29tcHJhZG9yJyl9PC9iPiR7eC50b2RheSA/ICc8c3BhbiBjbGFzcz0ibWtwLXRvZGF5Ij5MbGVnYSBob3k8L3NwYW4+JyA6ICcnfTxzbWFsbD4ke21lLnVzZXIucm9sZSA9PT0gJ2FkbWluJyA/IGVzYyh4LmFjYy5zZWxsZXIpICsgJyDCtyAnIDogJyd9VmVudGEgIyR7ZXNjKHgub3JkZXJfaWQpfSR7eC5zaGlwX3N0YXR1cyA/ICcgwrcgJyArIGVzYyh4LnNoaXBfc3RhdHVzKSA6ICcnfTwvc21hbGw+PHNtYWxsPiR7cHJvZExpbmUoeC5wcm9kdWN0cyl9PC9zbWFsbD48L2Rpdj48YiBjbGFzcz0ibWtwLXByaWNlIj4ke21vbmV5KHgudG90YWwgfHwgMCl9PC9iPjwvZGl2PmApLmpvaW4oJycpIDogJzxkaXYgY2xhc3M9Im1rcC1lbXB0eSBzbSI+U2luIGRldm9sdWNpb25lcy48L2Rpdj4nKX08L3NlY3Rpb24+YDsKICAgIGxpc3QgPSBgPGRpdiBjbGFzcz0ibWtwLXJldHMiPiR7Z3JwKCdtbCcsIEwuci5maWx0ZXIoeCA9PiB4Lm1rID09PSAnbWwnKSwgTC5lcnIucmV0dXJucyA/IFBFUk1fTVNHIDogJycpfSR7Z3JwKCdmYScsIEwuci5maWx0ZXIoeCA9PiB4Lm1rID09PSAnZmEnKSl9JHtncnAoJ3BhJywgW10sICc8ZGl2IGNsYXNzPSJta3AtZW1wdHkgc20iPlBhcmlzIG5vIGluZm9ybWEgZGV2b2x1Y2lvbmVzIHBvciBzdSBjb25leGnDs247IHJldsOtc2FsYXMgZW4gZWwgU2VsbGVyIENlbnRlciBkZSBQYXJpcy48L2Rpdj4nKX08L2Rpdj5gOwogIH0KICBib3guaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9Im1rcC10aWxlcyI+JHt0aWxlcy5tYXAoKFtrLCBuLCB2LCBzdWIsIGVdKSA9PiBgPGJ1dHRvbiBjbGFzcz0ibWtwLXRpbGUgJHttay52aWV3ID09PSBrID8gJ29uJyA6ICcnfSIgZGF0YS1tdj0iJHtrfSI+PGI+JHtlID8gJ+KAlCcgOiB2fTwvYj48c3Bhbj4ke259PC9zcGFuPjxzbWFsbD4ke2UgPyAnZmFsdGEgcGVybWlzbycgOiBzdWJ9PC9zbWFsbD48L2J1dHRvbj5gKS5qb2luKCcnKX0KICAgICAgPGJ1dHRvbiBjbGFzcz0ibWtwLXRpbGUgbWtwLXRpbGUtcmV0ICR7bWsudmlldyA9PT0gJ3JldHVybnMnID8gJ29uJyA6ICcnfSIgZGF0YS1tdj0icmV0dXJucyI+PGI+JHtyVG9kYXkubGVuZ3RofTwvYj48c3Bhbj5EZXZvbHVjaW9uZXMgaG95PC9zcGFuPjxzbWFsbCBjbGFzcz0ibWtwLW1rZG90cyI+PGkgY2xhc3M9Im1sIj48L2k+JHtyQnkoJ21sJyl9IDxpIGNsYXNzPSJmYSI+PC9pPiR7ckJ5KCdmYScpfSA8aSBjbGFzcz0icGEiPjwvaT7igJQ8L3NtYWxsPjwvYnV0dG9uPjwvZGl2PgogICAgPGRpdiBjbGFzcz0ibWtwLWJvZHkiPiR7bGlzdH08L2Rpdj4KICAgICR7TC5lcnIucGFydGlhbC5sZW5ndGggJiYgIUwuZXJyLnF1ZXN0aW9ucyA/IGA8cCBjbGFzcz0ibWtwLXBlcm0iIHN0eWxlPSJtYXJnaW4tdG9wOjEwcHgiPk5vIHNlIHB1ZG8gbGVlcjogPGI+JHtlc2MoTC5lcnIucGFydGlhbC5qb2luKCcsICcpKX08L2I+LiBFc2EgY3VlbnRhIGRlYmUgdm9sdmVyIGEgY29uZWN0YXJzZSBhIE1lcmNhZG8gTGlicmUgKGVuIFZlbmRlZG9yZXMg4oaSIFZvbHZlciBhIGF1dG9yaXphcikuPC9wPmAgOiAnJ30ke21rLmRhdGEubG9hZGluZyA/ICc8cCBjbGFzcz0ibWtwLXBlcm0iIHN0eWxlPSJtYXJnaW4tdG9wOjEwcHgiPkFsZ3VuYXMgY3VlbnRhcyB0b2RhdsOtYSBzZSBlc3TDoW4gY2FyZ2FuZG8gZGVzZGUgTWVyY2FkbyBMaWJyZTsgYXBhcmVjZW4gc29sYXMgZW4gdW5vcyBzZWd1bmRvcy48L3A+JyA6ICcnfTxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9ImZvbnQtc2l6ZToxMnB4O21hcmdpbjoxMHB4IDJweCI+QWN0dWFsaXphZG8gJHtlc2MobmV3IERhdGUobWsuZGF0YS5hdCkudG9Mb2NhbGVUaW1lU3RyaW5nKCdlcy1DTCcsIHsgaG91cjogJzItZGlnaXQnLCBtaW51dGU6ICcyLWRpZ2l0JyB9KSl9IMK3IHNlIGFjdHVhbGl6YSBzb2xhIGNhZGEgMiBtaW51dG9zLjwvcD5gOwogIGJveC5vbmNsaWNrID0gYXN5bmMgZSA9PiB7CiAgICBjb25zdCB0ID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtbXZdJyk7IGlmICh0KSB7IG1rLnZpZXcgPSB0LmRhdGFzZXQubXY7IGRyYXdNa3AoKTsgcmV0dXJuOyB9CiAgICBjb25zdCBjdCA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLWNsYWltdGhyZWFkXScpOwogICAgaWYgKGN0KSB7CiAgICAgIGNvbnN0IGVsID0gJCgnI2N0LScgKyBjdC5kYXRhc2V0LmNsYWltdGhyZWFkKTsgZWwuaGlkZGVuID0gIWVsLmhpZGRlbjsgaWYgKGVsLmhpZGRlbikgcmV0dXJuOwogICAgICBlbC5pbm5lckhUTUwgPSAnPHNtYWxsIGNsYXNzPSJtdXRlZCI+Q2FyZ2FuZG/igKY8L3NtYWxsPic7CiAgICAgIHRyeSB7IGNvbnN0IHIgPSBhd2FpdCBhcGkoYC9hcGkvbWtwL2NsYWltLyR7Y3QuZGF0YXNldC5jb25ufS8ke2N0LmRhdGFzZXQuY2xhaW10aHJlYWR9L21lc3NhZ2VzYCk7IGVsLmlubmVySFRNTCA9IHIubWVzc2FnZXMubGVuZ3RoID8gci5tZXNzYWdlcy5tYXAodCA9PiBgPGRpdiBjbGFzcz0ibWtwLWJ1YiAke3QuZnJvbX0iPjxzcGFuPiR7ZXNjKHQudGV4dCB8fCAnJyl9PC9zcGFuPjxzbWFsbD4ke3QuZnJvbSA9PT0gJ21lZGlhdG9yJyA/ICdNZXJjYWRvIExpYnJlIMK3ICcgOiAnJ30ke2Fnb1ModC5kYXRlKX08L3NtYWxsPjwvZGl2PmApLmpvaW4oJycpIDogJzxzbWFsbCBjbGFzcz0ibXV0ZWQiPlNpbiBtZW5zYWplcyB0b2RhdsOtYS48L3NtYWxsPic7IH0KICAgICAgY2F0Y2ggKGVycikgeyBlbC5pbm5lckhUTUwgPSBgPHNtYWxsIGNsYXNzPSJtdXRlZCI+JHtlc2MoZXJyLm1lc3NhZ2UpfTwvc21hbGw+YDsgfQogICAgfQogIH07CiAgYm94Lm9uaW5wdXQgPSBlID0+IHsgY29uc3QgZiA9IGUudGFyZ2V0LmNsb3Nlc3QoJy5ta3AtcmVwbHknKTsgaWYgKGYpIGYucXVlcnlTZWxlY3RvcignLm1rcC1jbnQnKS50ZXh0Q29udGVudCA9IGUudGFyZ2V0LnZhbHVlLmxlbmd0aDsgfTsKICBib3gub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgIGUucHJldmVudERlZmF1bHQoKTsKICAgIGNvbnN0IGYgPSBlLnRhcmdldC5jbG9zZXN0KCcubWtwLXJlcGx5Jyk7IGlmICghZikgcmV0dXJuOwogICAgY29uc3QgdGV4dCA9IGYucXVlcnlTZWxlY3RvcigndGV4dGFyZWEnKS52YWx1ZS50cmltKCk7IGlmICghdGV4dCkgcmV0dXJuIHRvYXN0KCdFc2NyaWJlIHVuYSByZXNwdWVzdGEnKTsKICAgIGNvbnN0IGIgPSBmLnF1ZXJ5U2VsZWN0b3IoJ2J1dHRvbicpOyBiLmRpc2FibGVkID0gdHJ1ZTsgYi50ZXh0Q29udGVudCA9ICdFbnZpYW5kb+KApic7CiAgICBjb25zdCBrID0gZi5kYXRhc2V0LmtpbmQ7CiAgICBjb25zdCBib2R5ID0gayA9PT0gJ2Fuc3dlcicgPyB7IGNvbm5faWQ6IGYuZGF0YXNldC5jb25uLCBxdWVzdGlvbl9pZDogZi5kYXRhc2V0LmlkLCB0ZXh0IH0gOiBrID09PSAnbWVzc2FnZScgPyB7IGNvbm5faWQ6IGYuZGF0YXNldC5jb25uLCBwYWNrX2lkOiBmLmRhdGFzZXQucGFjaywgYnV5ZXJfaWQ6IGYuZGF0YXNldC5idXllciwgdGV4dCB9IDogeyBjb25uX2lkOiBmLmRhdGFzZXQuY29ubiwgY2xhaW1faWQ6IGYuZGF0YXNldC5pZCwgdG9fbWVkaWF0b3I6IGYuZGF0YXNldC5tZWQgPT09ICcxJywgdGV4dCB9OwogICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL21rcC8nICsgKGsgPT09ICdhbnN3ZXInID8gJ2Fuc3dlcicgOiBrID09PSAnbWVzc2FnZScgPyAnbWVzc2FnZScgOiAnY2xhaW0tcmVwbHknKSwgeyBtZXRob2Q6ICdQT1NUJywgYm9keSB9KTsgdG9hc3QoJ1Jlc3B1ZXN0YSBlbnZpYWRhIOKckycpOyBpZiAoayA9PT0gJ2Fuc3dlcicpIG1rLmhpZGRlbi5hZGQoJ3EnICsgZi5kYXRhc2V0LmlkKTsgaWYgKGsgPT09ICdtZXNzYWdlJykgbWsuaGlkZGVuLmFkZCgnbScgKyBmLmRhdGFzZXQucGFjayk7IGNvbnN0IGNhcmQgPSBmLmNsb3Nlc3QoJy5ta3AtY2FyZCcpOyBjYXJkLmNsYXNzTGlzdC5hZGQoJ21rcC1kb25lJyk7IGYub3V0ZXJIVE1MID0gJzxkaXYgY2xhc3M9Im1rcC1zZW50Ij7inJMgUmVzcHVlc3RhIGVudmlhZGE8L2Rpdj4nOyBzZXRUaW1lb3V0KCgpID0+IHsgaWYgKGsgIT09ICdjbGFpbScpIGRyYXdNa3AoKTsgfSwgMTUwMCk7IH0KICAgIGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UsIDUwMDApOyBiLmRpc2FibGVkID0gZmFsc2U7IGIudGV4dENvbnRlbnQgPSAnUmVzcG9uZGVyJzsgfQogIH07Cn0KCi8vIC0tLS0tLS0tLS0gQkFOREVKQSAoZnVsZmlsbG1lbnQpIC0tLS0tLS0tLS0KY29uc3QgVEFCUyA9IFsKICBbJ3RvZGF5JywgJ1BhcmEgaW1wcmltaXIgaG95JywgJ1NhbGVuIGhveSAoaW5jbHV5ZSBGbGV4KScsIEkucHJpbnRdLAogIFsndXBjb21pbmcnLCAnUHLDs3hpbW9zIGTDrWFzJywgJ1NlIGRlc3BhY2hhbiBtw6FzIGFkZWxhbnRlJywgSS5ib3hdLAogIFsndW5ibG9ja2VkJywgJ0Rlc2Jsb3F1ZWFkYXMnLCAnUGVkaWRvcyBpbmNvbXBsZXRvcyBwb3IgaW1wcmltaXInLCBJLnByaW50XSwKICBbJ3dhaXRpbmcnLCAnRXNwZXJhbmRvIGV0aXF1ZXRhJywgJ0VsIG1hcmtldHBsYWNlIGHDum4gbm8gbGEgbGliZXJhJywgSS5jbG9ja10sCiAgWydwcmludGVkJywgJ0V0aXF1ZXRhcyBpbXByZXNhcycsICdEZWwgZGVzcGFjaG8gZW4gY3Vyc28gKGNhbWJpYSBhIGxhcyAxNTowMCknLCBJLmNoZWNrXSwKICBbJ3RyYW5zaXQnLCAnRW4gY2FtaW5vJywgJ0ltcHJlc2FzIHF1ZSBhw7puIG5vIGxsZWdhbiBhIGRlc3Rpbm8nLCBJLmJveF0sCiAgWydibG9ja2VkJywgJ0Jsb3F1ZWFkYXMnLCAnTnVtZXJhZGFzOiBOwrAgMSwgMiwgM+KApicsIEkubG9ja10sCiAgWydibG9ja2VkUHJpbnRlZCcsICdCbG9xdWVhZGFzIGltcHJlc2FzJywgJ0RlbCBkZXNwYWNobyBlbiBjdXJzbywgcG9yIHJlbGxlbmFyJywgSS5ib3hdLAogIFsnbGF0ZScsICdBdHJhc2FkYXMnLCAnTm8gc2FsaWVyb24gZGVudHJvIGRlbCBwbGF6bycsIEkud2Fybl0sCiAgWydwcmludGVkNycsICdJbXByZXNhcyA3IGTDrWFzJywgJ1RvZG8gbG8gaW1wcmVzbywgaW5jbHVzbyBsbyB5YSBlbnZpYWRvJywgSS5jaGVja10sCl07CmNvbnN0IGVuZE9mVG9kYXkgPSAoKSA9PiB7IGNvbnN0IGQgPSBuZXcgRGF0ZSgpOyBkLnNldEhvdXJzKDIzLCA1OSwgNTksIDk5OSk7IHJldHVybiBkOyB9OwpmdW5jdGlvbiBkaXNwYXRjaERhdGUobykgeyBjb25zdCBzID0gby5kaXNwYXRjaF9ieTsgaWYgKCFzKSByZXR1cm4gbnVsbDsgY29uc3QgZCA9IG5ldyBEYXRlKHMuaW5jbHVkZXMoJ1QnKSA/IHMgOiBzLnJlcGxhY2UoJyAnLCAnVCcpKTsgcmV0dXJuIGlzTmFOKGQpID8gbnVsbCA6IGQ7IH0KY29uc3QgaXNGb3JUb2RheSA9IG8gPT4geyBjb25zdCBkID0gZGlzcGF0Y2hEYXRlKG8pOyByZXR1cm4gIWQgfHwgZCA8PSBlbmRPZlRvZGF5KCk7IH07Ci8vIGxhcyBkZXNibG9xdWVhZGFzIHF1ZWRhbiBlbiBzdSBwcm9waWEgc2VjY2nDs24gaGFzdGEgcXVlIHNlIGltcHJpbWVuCmNvbnN0IGlzVW5ibG9ja2VkID0gbyA9PiBCb29sZWFuKG8udW5ibG9ja2VkX2J5ICYmIG8uYmxvY2tfbm8pICYmIFsncmVhZHknLCAnd2FpdGluZycsICdlcnJvciddLmluY2x1ZGVzKG8uc3RhdGUpOwovLyBpbXByZXNhcyBkZSBwZWRpZG9zIHF1ZSB0ZW7DrWFuIHByb2R1Y3RvcyBibG9xdWVhZG9zOiBlbCB2ZW5kZWRvciBkZWJlIGxsZXZhciBsbyBxdWUgZmFsdGEKLy8gY3VhbHF1aWVyIGV0aXF1ZXRhIGltcHJlc2EgY29uIHByb2R1Y3RvcyBibG9xdWVhZG9zIHZhIFNPTE8gYSAiQmxvcXVlYWRhcyBpbXByZXNhcyIgKGF1bnF1ZSBsYSBoYXlhbiBpbXByZXNvIGZ1ZXJhIGRlIGxhIGFwcCkKLy8gc29sbyBzaSBIT1kgdGllbmUgYWxnw7puIHByb2R1Y3RvIGJsb3F1ZWFkbyAoc2kgZWwgdmVuZGVkb3IgbG8gc2Fjw7MgZGUgc3UgbGlzdGEsIHZ1ZWx2ZSBhICJFdGlxdWV0YXMgaW1wcmVzYXMiKQpjb25zdCBpc0Jsb2NrZWRQcmludGVkID0gbyA9PiAoby5taXNzaW5nX2lkeCB8fCBbXSkubGVuZ3RoID4gMCAmJiBvLnN0YXRlID09PSAncHJpbnRlZCc7CmNvbnN0IHdlZWtTdGFydCA9ICgpID0+IHsgY29uc3QgZCA9IG5ldyBEYXRlKCk7IGQuc2V0SG91cnMoMCwgMCwgMCwgMCk7IGQuc2V0RGF0ZShkLmdldERhdGUoKSAtICgoZC5nZXREYXkoKSArIDYpICUgNykpOyByZXR1cm4gZDsgfTsKY29uc3QgcHJpbnRlZEF0ID0gbyA9PiBvLnByaW50ZWRfYXQgPyBuZXcgRGF0ZShvLnByaW50ZWRfYXQucmVwbGFjZSgnICcsICdUJykgKyAnWicpIDogbnVsbDsKY29uc3QgaXNQcmludGVkNyA9IG8gPT4gWydwcmludGVkJywgJ3NoaXBwZWQnXS5pbmNsdWRlcyhvLnN0YXRlKSAmJiBwcmludGVkQXQobykgPj0gbmV3IERhdGUoRGF0ZS5ub3coKSAtIDcgKiA4NjRlNSk7CmNvbnN0IGlzUHJpbnRlZFRoaXNXZWVrID0gbyA9PiBbJ3ByaW50ZWQnLCAnc2hpcHBlZCddLmluY2x1ZGVzKG8uc3RhdGUpICYmIHByaW50ZWRBdChvKSA+PSB3ZWVrU3RhcnQoKTsKLy8gbGFzIGJsb3F1ZWFkYXMgaW1wcmVzYXMgcXVlIGVsIGZ1bGZpbGxtZW50IHNlcGFyw7MgZW4gcGFydGUgKHRlbsOtYSBhbGfDum4gcHJvZHVjdG8pIHRhbWJpw6luIGN1ZW50YW4gZW4gIkV0aXF1ZXRhcyBpbXByZXNhcyIKLy8gdW5hIGV0aXF1ZXRhIHB1ZWRlIGVzdGFyIGVuIG3DoXMgZGUgdW5hIHNlY2Npw7NuIChwLiBlai4gIkltcHJlc2FzIGRlIGxhIHNlbWFuYSIgeSAiQmxvcXVlYWRhcyBpbXByZXNhcyIpCi8vICJFdGlxdWV0YXMgaW1wcmVzYXMiIHkgIkJsb3F1ZWFkYXMgaW1wcmVzYXMiIG11ZXN0cmFuIGxhcyBpbXByZXNhcyBkZWwgZGVzcGFjaG8gZW4gY3Vyc286IHRvZGFzIGxhcyBxdWUgc2UKLy8gZGVzcGFjaGFuIGVzZSBkw61hIChhdW5xdWUgc2UgaGF5YW4gaW1wcmVzbyBkw61hcyBhbnRlcykuIEEgbGFzIDE1OjAwIGRlbCBkw61hIGRlIGRlc3BhY2hvIHNhbGVuIGRlIGFow60gKHF1ZWRhbiBlbgovLyAiSW1wcmVzYXMgNyBkw61hcyIpIHkgZW1waWV6YW4gYSBqdW50YXJzZSBsYXMgZGVsIHNpZ3VpZW50ZSBkw61hIGRlIGRlc3BhY2hvLgpjb25zdCBkaXNwRGF5ID0gbyA9PiB7IGNvbnN0IGQgPSBkaXNwYXRjaERhdGUobyk7IHJldHVybiBkID8gaXNvKGQpIDogbnVsbDsgfTsKbGV0IF9jeWMgPSB7IGtleTogJycsIGRheTogJycgfTsKZnVuY3Rpb24gcHJpbnRDeWNsZURheSgpIHsKICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLCBrZXkgPSBvcmRlcnMubGVuZ3RoICsgJzonICsgbm93LmdldEhvdXJzKCkgKyAnOicgKyBub3cuZ2V0RGF0ZSgpOwogIGlmIChfY3ljLmtleSA9PT0ga2V5ICYmIF9jeWMuc3JjID09PSBvcmRlcnMpIHJldHVybiBfY3ljLmRheTsKICBjb25zdCBiYXNlID0gbmV3IERhdGUobm93KTsgaWYgKG5vdy5nZXRIb3VycygpID49IDE1KSBiYXNlLnNldERhdGUoYmFzZS5nZXREYXRlKCkgKyAxKTsKICBjb25zdCBiID0gaXNvKGJhc2UpOwogIGNvbnN0IGRheSA9IG9yZGVycy5maWx0ZXIobyA9PiBbJ3ByaW50ZWQnLCAnc2hpcHBlZCddLmluY2x1ZGVzKG8uc3RhdGUpKS5tYXAoZGlzcERheSkuZmlsdGVyKGQgPT4gZCAmJiBkID49IGIpLnNvcnQoKVswXSB8fCBiOwogIF9jeWMgPSB7IGtleSwgZGF5LCBzcmM6IG9yZGVycyB9OwogIHJldHVybiBkYXk7Cn0KY29uc3QgaW5QcmludEN5Y2xlID0gbyA9PiBbJ3ByaW50ZWQnLCAnc2hpcHBlZCddLmluY2x1ZGVzKG8uc3RhdGUpICYmIGRpc3BEYXkobykgPT09IHByaW50Q3ljbGVEYXkoKTsKY29uc3QgaGFzTWlzc2luZyA9IG8gPT4gKG8ubWlzc2luZ19pZHggfHwgW10pLmxlbmd0aCA+IDA7CmNvbnN0IGluVGFiRm4gPSAobywgdCkgPT4gdCA9PT0gJ3RyYW5zaXQnID8gby5zdGF0ZSA9PT0gJ3ByaW50ZWQnIDogdCA9PT0gJ3ByaW50ZWQ3JyA/IGlzUHJpbnRlZDcobykgOiB0ID09PSAnbGF0ZScgPyBCb29sZWFuKG8ubGF0ZSkgOiB0ID09PSAnd2VlaycgPyBpc1ByaW50ZWRUaGlzV2VlayhvKSA6IHQgPT09ICdibG9ja2VkUHJpbnRlZCcgPyAoaW5QcmludEN5Y2xlKG8pICYmIGhhc01pc3NpbmcobykpIDogdCA9PT0gJ3ByaW50ZWQnID8gKGluUHJpbnRDeWNsZShvKSAmJiAoIWhhc01pc3NpbmcobykgfHwgYnBLaW5kKG8pID09PSAnZmlsbCcpKSA6IHRhYk9mKG8pID09PSB0Owpjb25zdCB0YWJPZiA9IG8gPT4gaXNVbmJsb2NrZWQobykgPyAndW5ibG9ja2VkJyA6IChvLnN0YXRlID09PSAncmVhZHknID8gKGlzRm9yVG9kYXkobykgPyAndG9kYXknIDogJ3VwY29taW5nJykgOiBvLnN0YXRlID09PSAnZXJyb3InID8gJ3dhaXRpbmcnIDogby5zdGF0ZSA9PT0gJ3NoaXBwZWQnID8gbnVsbCA6IG8uc3RhdGUgPT09ICdjYW5jZWxsZWQnID8gbnVsbCA6IG8uc3RhdGUpOwovLyBwYXJhIGV0aXF1ZXRhcyB5YSBpbXByZXNhcyBvIGVudmlhZGFzOiBzZSBtYW50aWVuZSBjdcOhbmRvIGhhYsOtYSBxdWUgZGVzcGFjaGFybGFzIChzaW4gImF0cmFzYWRhIikKZnVuY3Rpb24gZGlzcGF0Y2hQbGFpbihvKSB7CiAgY29uc3QgZCA9IGRpc3BhdGNoRGF0ZShvKTsgaWYgKCFkKSByZXR1cm4gJyc7CiAgY29uc3QgaCA9IGhobW0oZCksIGhvcmEgPSBoID09PSAnMjM6NTknIHx8IGggPT09ICcwMDowMCcgPyAnJyA6ICcgYW50ZXMgZGUgbGFzICcgKyBhbXBtKGQpOwogIGNvbnN0IHQgPSBuZXcgRGF0ZSgpOyB0LnNldEhvdXJzKDAsIDAsIDAsIDApOyBjb25zdCB4ID0gbmV3IERhdGUoZCk7IHguc2V0SG91cnMoMCwgMCwgMCwgMCk7CiAgY29uc3QgZGlmZiA9IE1hdGgucm91bmQoKHggLSB0KSAvIDg2NGU1KTsKICBjb25zdCBkaWEgPSBkaWZmID09PSAwID8gJ2hveScgOiBkaWZmID09PSAtMSA/ICdheWVyJyA6IGRpZmYgPT09IDEgPyAnbWHDsWFuYScgOiAnZWwgJyArIGQudG9Mb2NhbGVEYXRlU3RyaW5nKCdlcy1DTCcsIHsgd2Vla2RheTogJ2xvbmcnLCBkYXk6ICdudW1lcmljJywgbW9udGg6ICdzaG9ydCcgfSk7CiAgcmV0dXJuIGBEZXNwYWNobzogJHtkaWF9JHtob3JhfSR7bWtEZWFkbGluZShvKX1gOwp9Ci8vIEZhbGFiZWxsYTogc2UgbXVlc3RyYSBlbCBwbGF6byByZWFsIGRlbCBtYXJrZXRwbGFjZSAobGEgYXBwIGxvIGFkZWxhbnRhIHVuIGTDrWEpCmZ1bmN0aW9uIG1rRGVhZGxpbmUobykgewogIGlmICghby5kaXNwYXRjaF9taykgcmV0dXJuICcnOwogIGNvbnN0IGQgPSBuZXcgRGF0ZShvLmRpc3BhdGNoX21rLmluY2x1ZGVzKCdUJykgPyBvLmRpc3BhdGNoX21rIDogby5kaXNwYXRjaF9tay5yZXBsYWNlKCcgJywgJ1QnKSk7IGlmIChpc05hTihkKSkgcmV0dXJuICcnOwogIHJldHVybiBgIMK3IHBsYXpvIEZhbGFiZWxsYSAke2QudG9Mb2NhbGVEYXRlU3RyaW5nKCdlcy1DTCcsIHsgd2Vla2RheTogJ3Nob3J0JywgZGF5OiAnbnVtZXJpYycgfSkucmVwbGFjZSgnLicsICcnKX1gOwp9CmZ1bmN0aW9uIGRpc3BhdGNoVGV4dChvKSB7IGNvbnN0IHQgPSBkaXNwYXRjaFRleHQwKG8pOyByZXR1cm4gdCA/IHQgKyBta0RlYWRsaW5lKG8pIDogdDsgfQpmdW5jdGlvbiBkaXNwYXRjaFRleHQwKG8pIHsKICBjb25zdCBkID0gZGlzcGF0Y2hEYXRlKG8pOyBpZiAoIWQpIHJldHVybiAnJzsKICBjb25zdCB0b2RheSA9IG5ldyBEYXRlKCk7IHRvZGF5LnNldEhvdXJzKDAsIDAsIDAsIDApOwogIGNvbnN0IGRheSA9IG5ldyBEYXRlKGQpOyBkYXkuc2V0SG91cnMoMCwgMCwgMCwgMCk7CiAgY29uc3QgZGlmZiA9IE1hdGgucm91bmQoKGRheSAtIHRvZGF5KSAvIDg2NGU1KTsKICBjb25zdCBoID0gaGhtbShkKTsKICBpZiAoZGlmZiA8IDApIHJldHVybiBgQXRyYXNhZGEgwrcgZGViw61hIHNhbGlyIGVsICR7ZC50b0xvY2FsZURhdGVTdHJpbmcoJ2VzLUNMJywgeyBkYXk6ICdudW1lcmljJywgbW9udGg6ICdzaG9ydCcgfSl9YDsKICBpZiAoZGlmZiA9PT0gMCkgcmV0dXJuIGggPT09ICcyMzo1OScgfHwgaCA9PT0gJzAwOjAwJyA/ICdEZXNwYWNoYXIgaG95JyA6IChkIDwgbmV3IERhdGUoKSA/IGBEZXNwYWNoYXIgaG95IMK3IGNvcnRlICR7YW1wbShkKX1gIDogYERlc3BhY2hhciBob3kgYW50ZXMgZGUgbGFzICR7YW1wbShkKX1gKTsKICBpZiAoZGlmZiA9PT0gMSkgcmV0dXJuIGBEZXNwYWNoYXIgbWHDsWFuYSR7aCA9PT0gJzIzOjU5JyB8fCBoID09PSAnMDA6MDAnID8gJycgOiAnIGFudGVzIGRlIGxhcyAnICsgYW1wbShkKX1gOwogIHJldHVybiBgRGVzcGFjaGFyIGVsICR7ZC50b0xvY2FsZURhdGVTdHJpbmcoJ2VzLUNMJywgeyB3ZWVrZGF5OiAnbG9uZycsIGRheTogJ251bWVyaWMnLCBtb250aDogJ3Nob3J0JyB9KX1gOwp9CmZ1bmN0aW9uIHRzKG8pIHsKICBjb25zdCBzID0gby5zb2xkX2F0IHx8ICcnOwogIGlmIChzKSB7IGNvbnN0IGQgPSBuZXcgRGF0ZShzLmluY2x1ZGVzKCdUJykgPyBzIDogcy5yZXBsYWNlKCcgJywgJ1QnKSk7IGlmICghaXNOYU4oZCkpIHJldHVybiBkOyB9CiAgcmV0dXJuIG5ldyBEYXRlKChvLmNyZWF0ZWRfYXQgfHwgJycpLnJlcGxhY2UoJyAnLCAnVCcpICsgJ1onKTsKfQpmdW5jdGlvbiBkYXlMYWJlbChkKSB7CiAgY29uc3QgdG9kYXkgPSBuZXcgRGF0ZSgpOyB0b2RheS5zZXRIb3VycygwLCAwLCAwLCAwKTsKICBjb25zdCB4ID0gbmV3IERhdGUoZCk7IHguc2V0SG91cnMoMCwgMCwgMCwgMCk7CiAgY29uc3QgZGlmZiA9IE1hdGgucm91bmQoKHRvZGF5IC0geCkgLyA4NjRlNSk7CiAgY29uc3QgZiA9IGQudG9Mb2NhbGVEYXRlU3RyaW5nKCdlcy1DTCcsIHsgd2Vla2RheTogJ2xvbmcnLCBkYXk6ICdudW1lcmljJywgbW9udGg6ICdsb25nJyB9KTsKICByZXR1cm4gZGlmZiA9PT0gMCA/IGBIb3kgwrcgJHtmfWAgOiBkaWZmID09PSAxID8gYEF5ZXIgwrcgJHtmfWAgOiBmLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgZi5zbGljZSgxKTsKfQpjb25zdCBoaG1tID0gZCA9PiBkLnRvTG9jYWxlVGltZVN0cmluZygnZXMtQ0wnLCB7IGhvdXI6ICcyLWRpZ2l0JywgbWludXRlOiAnMi1kaWdpdCcsIGhvdXJDeWNsZTogJ2gyMycgfSk7CmNvbnN0IGFtcG0gPSBkID0+IHsgY29uc3QgaCA9IGQuZ2V0SG91cnMoKSwgbSA9IFN0cmluZyhkLmdldE1pbnV0ZXMoKSkucGFkU3RhcnQoMiwgJzAnKTsgcmV0dXJuIGAke2ggJSAxMiB8fCAxMn06JHttfSAke2ggPCAxMiA/ICdBTScgOiAnUE0nfWA7IH07CgpmdW5jdGlvbiByZW5kZXJUcmF5KCkgewogIGlmICghdWkudGFiIHx8IHVpLnRhYiA9PT0gJ3JlYWR5JykgdWkudGFiID0gJ3RvZGF5JzsKICAkKCcjbWFpbicpLmlubmVySFRNTCA9IGAKICA8ZGl2IGNsYXNzPSJzZWN0aW9uLXRpdGxlIiBzdHlsZT0ibWFyZ2luLXRvcDoyMnB4Ij48aDI+RXRpcXVldGFzPC9oMj48c3BhbiBjbGFzcz0ibXV0ZWQiPkxhcyBtw6FzIG51ZXZhcyBhcnJpYmEuIFNlIGFjdHVhbGl6YSBzb2xhLjwvc3Bhbj48ZGl2IGNsYXNzPSJyY29kZXMiIGlkPSJyY29kZXMiIGhpZGRlbj48L2Rpdj48L2Rpdj4KICA8ZGl2IGNsYXNzPSJzaGlwLXN1bSIgaWQ9InNoaXBTdW0iPjwvZGl2PgogIDxkaXYgY2xhc3M9InRhYnNiaWciIGlkPSJ0YWJzQmlnIj48L2Rpdj4KICA8ZGl2IGNsYXNzPSJwYW5lbCI+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj4KICAgICAgPGRpdiBjbGFzcz0iY2hpcHMiIGlkPSJta0NoaXBzIj48L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0ibXNlbCIgaWQ9InNlbGxlckYiPjxidXR0b24gdHlwZT0iYnV0dG9uIiBjbGFzcz0ibXNlbC1idG4iIGFyaWEtaGFzcG9wdXA9InRydWUiIGFyaWEtZXhwYW5kZWQ9ImZhbHNlIj5Ub2RvcyBsb3MgdmVuZGVkb3JlczwvYnV0dG9uPjxkaXYgY2xhc3M9Im1zZWwtcG9wIiBoaWRkZW4+PC9kaXY+PC9kaXY+CiAgICAgIDxpbnB1dCB0eXBlPSJzZWFyY2giIGlkPSJxIiBwbGFjZWhvbGRlcj0iQnVzY2FyIGNsaWVudGUsIHBlZGlkbyBvIFNLVSIgdmFsdWU9IiR7ZXNjKHVpLnEpfSIgYXJpYS1sYWJlbD0iQnVzY2FyIiBzdHlsZT0id2lkdGg6YXV0bzttaW4td2lkdGg6MjIwcHgiPgogICAgICA8c3BhbiBjbGFzcz0ic3BhY2VyIiBzdHlsZT0iZmxleDoxIj48L3NwYW4+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tZ2hvc3QgYnRuLXNtIiBpZD0ic3luY05vdyI+JHtJLnN5bmN9QnVzY2FyIHBlZGlkb3MgYWhvcmE8L2J1dHRvbj4KICAgIDwvZGl2PgogICAgPGRpdiBjbGFzcz0iYnBmIiBpZD0iYnBGaWx0ZXIiIGhpZGRlbj48L2Rpdj4KICAgIDxkaXYgY2xhc3M9ImFjdGlvbmJhciIgaWQ9ImFjdGlvbmJhciI+PC9kaXY+CiAgICA8ZGl2IGlkPSJsaXN0Ij48L2Rpdj4KICA8L2Rpdj5gOwogIGRyYXdDb2Rlc1N0cmlwKCk7IGxvYWRDb2RlcygpOwogICQoJyNzeW5jTm93Jykub25jbGljayA9IGFzeW5jICgpID0+IHsgYXdhaXQgYXBpKCcvYXBpL3N5bmMnLCB7IG1ldGhvZDogJ1BPU1QnIH0pOyB0b2FzdCgnQnVzY2FuZG8gcGVkaWRvcyBudWV2b3MgZW4gbG9zIG1hcmtldHBsYWNlc+KApicpOyB9OwogICQoJyN0YWJzQmlnJykub25jbGljayA9IGUgPT4geyBjb25zdCBiID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtdGFiMl0nKTsgaWYgKCFiKSByZXR1cm47IHVpLnRhYiA9IGIuZGF0YXNldC50YWIyOyBzZWxlY3RlZC5jbGVhcigpOyBkcmF3Um93cygpOyB9OwogICQoJyNta0NoaXBzJykub25jbGljayA9IGUgPT4geyBjb25zdCBiID0gZS50YXJnZXQuY2xvc2VzdCgnLmNoaXAnKTsgaWYgKCFiKSByZXR1cm47IHVpLm1rID0gYi5kYXRhc2V0Lm1rOyBkcmF3Um93cygpOyB9OwogIC8vIGZpbHRybyBkZSB2ZW5kZWRvcmVzOiBzZSBwdWVkZW4gbWFyY2FyIHZhcmlvcyBhIGxhIHZleiAobmluZ3VubyBtYXJjYWRvID0gdG9kb3MpCiAgY29uc3Qgc2ZCb3ggPSAkKCcjc2VsbGVyRicpOwogIHNmQm94LnF1ZXJ5U2VsZWN0b3IoJy5tc2VsLWJ0bicpLm9uY2xpY2sgPSAoKSA9PiB7IGNvbnN0IHBvcCA9IHNmQm94LnF1ZXJ5U2VsZWN0b3IoJy5tc2VsLXBvcCcpOyBwb3AuaGlkZGVuID0gIXBvcC5oaWRkZW47IHNmQm94LnF1ZXJ5U2VsZWN0b3IoJy5tc2VsLWJ0bicpLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsIFN0cmluZyghcG9wLmhpZGRlbikpOyB9OwogIHNmQm94LnF1ZXJ5U2VsZWN0b3IoJy5tc2VsLXBvcCcpLm9uY2hhbmdlID0gZSA9PiB7CiAgICBjb25zdCB2ID0gZS50YXJnZXQudmFsdWU7IGlmICghdikgcmV0dXJuOwogICAgaWYgKHYgPT09ICdhbGwnKSB1aS5zZWxsZXJzLmNsZWFyKCk7IGVsc2UgZS50YXJnZXQuY2hlY2tlZCA/IHVpLnNlbGxlcnMuYWRkKHYpIDogdWkuc2VsbGVycy5kZWxldGUodik7CiAgICBkcmF3U2VsbGVyRmlsdGVyKCk7IGRyYXdSb3dzKCk7CiAgfTsKICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGUgPT4geyBpZiAoIWUudGFyZ2V0LmNsb3Nlc3QoJyNzZWxsZXJGJykpIHsgY29uc3QgcG9wID0gJCgnI3NlbGxlckYgLm1zZWwtcG9wJyk7IGlmIChwb3ApIHBvcC5oaWRkZW4gPSB0cnVlOyB9IH0pOwogICQoJyNxJykub25pbnB1dCA9IGUgPT4geyB1aS5xID0gZS50YXJnZXQudmFsdWUudHJpbSgpLnRvTG93ZXJDYXNlKCk7IGRyYXdSb3dzKCk7IH07CiAgJCgnI2xpc3QnKS5vbmNoYW5nZSA9IGUgPT4geyBjb25zdCBpZCA9IGUudGFyZ2V0LmRhdGFzZXQuaWQ7IGlmICghaWQpIHJldHVybjsgZS50YXJnZXQuY2hlY2tlZCA/IHNlbGVjdGVkLmFkZCgraWQpIDogc2VsZWN0ZWQuZGVsZXRlKCtpZCk7IGRyYXdBY3Rpb25iYXIoKTsgfTsKICAkKCcjbGlzdCcpLm9uY2xpY2sgPSBhc3luYyBlID0+IHsKICAgIGNvbnN0IGIgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1hY3RdJyk7IGlmICghYikgcmV0dXJuOwogICAgY29uc3QgaWQgPSArYi5kYXRhc2V0LmlkOwogICAgaWYgKGIuZGF0YXNldC5hY3QgPT09ICdwcmludCcpIHsgaWYgKG1lLnVzZXIucm9sZSA9PT0gJ3NlbGxlcicgJiYgIWNvbmZpcm0oJ1NpIGxhIGltcHJpbWVzIHTDuiwgcXVlZGEgY29tbyBpbXByZXNhIHBvciB0dSB0aWVuZGEgeSBlbCBmdWxmaWxsbWVudCBsYSB2ZXLDoSBlbiByb2pvIGNvbW8gIkV0aXF1ZXRhIGltcHJlc2EiLiDCv0ltcHJpbWlyPycpKSByZXR1cm47IGlmIChkb3dubG9hZGluZykgcmV0dXJuOyBkb3dubG9hZGluZyA9IHRydWU7IGIuZGlzYWJsZWQgPSB0cnVlOyBzaG93U3VuKDEpOyBsZXQgb2tEbCA9IGZhbHNlOwogICAgICB0cnkgewogICAgICAgIGNvbnN0IGRvbmUgPSBhd2FpdCByZWNvcmRPcmRlcnMoJ0ltcHJpbWlyIGV0aXF1ZXRhJywgW2lkXSk7CiAgICAgICAgY29uc3QgcmVzID0gYXdhaXQgc2FmZUZldGNoKGAvYXBpL29yZGVycy8ke2lkfS9sYWJlbC5wZGY/bWFyaz0xYCwgeyBjcmVkZW50aWFsczogJ3NhbWUtb3JpZ2luJyB9KTsKICAgICAgICBpZiAoIXJlcy5vaykgeyBjb25zdCBlID0gYXdhaXQgcmVzLmpzb24oKS5jYXRjaCgoKSA9PiAoe30pKTsgdGhyb3cgbmV3IEVycm9yKGUuZXJyb3IgfHwgJ05vIHNlIHB1ZG8gZGVzY2FyZ2FyIGxhIGV0aXF1ZXRhJyk7IH0KICAgICAgICBjb25zdCBibG9iID0gYXdhaXQgcmVzLmJsb2IoKTsKICAgICAgICBjb25zdCBuYW1lID0gKHJlcy5oZWFkZXJzLmdldCgnY29udGVudC1kaXNwb3NpdGlvbicpIHx8ICcnKS5tYXRjaCgvZmlsZW5hbWU9IihbXiJdKykiLyk/LlsxXSB8fCBgZXRpcXVldGEtJHtpZH0ucGRmYDsKICAgICAgICBjb25zdCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpOyBhLmhyZWYgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpOyBhLmRvd25sb2FkID0gbmFtZTsgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChhKTsgYS5jbGljaygpOyBhLnJlbW92ZSgpOwogICAgICAgIHNldFRpbWVvdXQoKCkgPT4gVVJMLnJldm9rZU9iamVjdFVSTChhLmhyZWYpLCA2MDAwMCk7CiAgICAgICAgb2tEbCA9IHRydWU7IGRvbmUoKTsgdG9hc3QoJ0V0aXF1ZXRhIGRlc2NhcmdhZGEgwrcgcGFzw7MgYSAiRXRpcXVldGFzIGltcHJlc2FzIicpOwogICAgICB9IGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UsIDUwMDApOyBiLmRpc2FibGVkID0gZmFsc2U7IH0KICAgICAgZmluYWxseSB7IGhpZGVTdW4oIW9rRGwpOyBkb3dubG9hZGluZyA9IGZhbHNlOyBzZXRUaW1lb3V0KGxvYWRPcmRlcnMsIDQwMCk7IH0gfQogICAgaWYgKGIuZGF0YXNldC5hY3QgPT09ICdyZXByaW50Jykgd2luZG93Lm9wZW4oYC9hcGkvb3JkZXJzLyR7aWR9L2xhYmVsLnBkZmAsICdfYmxhbmsnKTsKICAgIGlmIChiLmRhdGFzZXQuYWN0ID09PSAncmV0cnknKSB7IGIuZGlzYWJsZWQgPSB0cnVlOyB0cnkgeyBhd2FpdCBhcGkoYC9hcGkvb3JkZXJzLyR7aWR9L3JldHJ5YCwgeyBtZXRob2Q6ICdQT1NUJyB9KTsgdG9hc3QoJ1JlaW50ZW50YW5kb+KApicpOyBsb2FkT3JkZXJzKCk7IH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IH0gfQogICAgaWYgKGIuZGF0YXNldC5hY3QgPT09ICd1bmJsb2NrJykgewogICAgICBpZiAoIWNvbmZpcm0oJ8K/RGVzYmxvcXVlYXIgZXN0YSBldGlxdWV0YT8gUGFzYSBhIGxhIHNlY2Npw7NuICJEZXNibG9xdWVhZGFzIi4gRW4gbGEgaG9qYSBkZWwgcGVkaWRvIHNhbGRyw6Egc3UgbsO6bWVybyB5IHF1ZWRhcsOhbiBtYXJjYWRvcyBjb24gIkZBTFRBIiBsb3MgcHJvZHVjdG9zIHF1ZSBzZSByZWxsZW5hbiBhcGFydGUuJykpIHJldHVybjsKICAgICAgYi5kaXNhYmxlZCA9IHRydWU7IGIudGV4dENvbnRlbnQgPSAnRGVzYmxvcXVlYW5kb+KApic7CiAgICAgIHRyeSB7IGNvbnN0IHJlYyA9IGF3YWl0IHJlY29yZE9yZGVycygnRGVzYmxvcXVlYXIgZXRpcXVldGEnLCBbaWRdKTsgYXdhaXQgYXBpUmV0cnkoYC9hcGkvb3JkZXJzLyR7aWR9L3VuYmxvY2tgLCB7IG1ldGhvZDogJ1BPU1QnIH0pOyByZWMoKTsgbWFya1VuYmxvY2tlZChbaWRdKTsgdG9hc3QoJ0V0aXF1ZXRhIGRlc2Jsb3F1ZWFkYSDCtyBwYXPDsyBhICJEZXNibG9xdWVhZGFzIicpOyBsb2FkT3JkZXJzKCk7IH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IGIuZGlzYWJsZWQgPSBmYWxzZTsgYi5pbm5lckhUTUwgPSBgJHtJLmxvY2t9RGVzYmxvcXVlYXIgZXRpcXVldGFgOyB9CiAgICB9CiAgICBpZiAoYi5kYXRhc2V0LmFjdCA9PT0gJ3JlYmxvY2snKSB7IHRyeSB7IGNvbnN0IHJlYyA9IGF3YWl0IHJlY29yZE9yZGVycygnVm9sdmVyIGEgYmxvcXVlYXInLCBbaWRdKTsgYXdhaXQgYXBpKGAvYXBpL29yZGVycy8ke2lkfS9yZWJsb2NrYCwgeyBtZXRob2Q6ICdQT1NUJyB9KTsgcmVjKCk7IHRvYXN0KCdFdGlxdWV0YSBibG9xdWVhZGEgb3RyYSB2ZXonKTsgbG9hZE9yZGVycygpOyB9IGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UpOyB9IH0KICAgIGlmIChiLmRhdGFzZXQuYWN0ID09PSAndW5wcmludCcpIHsgY29uc3QgcmVjID0gYXdhaXQgcmVjb3JkT3JkZXJzKCdNYXJjYXIgY29tbyBubyBpbXByZXNhJywgW2lkXSk7IGF3YWl0IGFwaShgL2FwaS9vcmRlcnMvJHtpZH0vdW5wcmludGAsIHsgbWV0aG9kOiAnUE9TVCcgfSk7IHJlYygpOyB0b2FzdCgnVm9sdmnDsyBhICJFdGlxdWV0YXMgcG9yIGltcHJpbWlyIicpOyBsb2FkT3JkZXJzKCk7IH0KICB9OwogICQoJyNhY3Rpb25iYXInKS5vbmNsaWNrID0gYXN5bmMgZSA9PiB7CiAgICBjb25zdCBiID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtYnVsa10nKTsgaWYgKCFiKSByZXR1cm47CiAgICBpZiAoYi5kYXRhc2V0LmJ1bGsgPT09ICdhbGwnKSB7IGNvbnN0IGlkcyA9IHZpc2libGUoKS5maWx0ZXIocHJpbnRhYmxlKS5tYXAobyA9PiBvLmlkKTsgaWYgKGlkcy5sZW5ndGggJiYgc2VsbGVyT2tUb1ByaW50KGlkcy5sZW5ndGgpKSBkb3dubG9hZEJhdGNoKGlkcyk7IH0KICAgIGlmIChiLmRhdGFzZXQuYnVsayA9PT0gJ3NlbCcpIHsgY29uc3QgaWRzID0gWy4uLnNlbGVjdGVkXS5maWx0ZXIoaWQgPT4gb3JkZXJzLnNvbWUobyA9PiBvLmlkID09PSBpZCAmJiBwcmludGFibGUobykpKTsgaWYgKGlkcy5sZW5ndGggJiYgc2VsbGVyT2tUb1ByaW50KGlkcy5sZW5ndGgpKSBkb3dubG9hZEJhdGNoKGlkcyk7IH0KICAgIGlmIChiLmRhdGFzZXQuYnVsayA9PT0gJ3NlbGFsbCcpIHsgdmlzaWJsZSgpLmZpbHRlcihvID0+IHVpLnRhYiA9PT0gJ2Jsb2NrZWQnID8gKG8uc3RhdGUgPT09ICdibG9ja2VkJyAmJiBvLm93biAhPT0gZmFsc2UpIDogKHByaW50YWJsZShvKSB8fCAoby5zdGF0ZSA9PT0gJ3ByaW50ZWQnICYmIG8ub3duICE9PSBmYWxzZSkpKS5mb3JFYWNoKG8gPT4gc2VsZWN0ZWQuYWRkKG8uaWQpKTsgZHJhd1Jvd3MoKTsgfQogICAgaWYgKGIuZGF0YXNldC5idWxrID09PSAndW5wcmludCcpIHsKICAgICAgY29uc3QgaWRzID0gWy4uLnNlbGVjdGVkXS5maWx0ZXIoaWQgPT4gb3JkZXJzLmZpbmQobyA9PiBvLmlkID09PSBpZCAmJiBvLnN0YXRlID09PSAncHJpbnRlZCcpKTsKICAgICAgaWYgKCFpZHMubGVuZ3RoIHx8ICFjb25maXJtKGDCv01hcmNhciAke2lkcy5sZW5ndGh9IGV0aXF1ZXRhJHtpZHMubGVuZ3RoID09PSAxID8gJycgOiAncyd9IGNvbW8gTk8gaW1wcmVzYSR7aWRzLmxlbmd0aCA9PT0gMSA/ICcnIDogJ3MnfT8gVnVlbHZlbiBhICJQYXJhIGltcHJpbWlyIi5gKSkgcmV0dXJuOwogICAgICBiLmRpc2FibGVkID0gdHJ1ZTsKICAgICAgY29uc3QgcmVjID0gYXdhaXQgcmVjb3JkT3JkZXJzKGBNYXJjYXIgJHtpZHMubGVuZ3RofSBjb21vIG5vIGltcHJlc2FzYCwgaWRzKTsKICAgICAgbGV0IG9rID0gMDsgZm9yIChjb25zdCBpZCBvZiBpZHMpIHsgdHJ5IHsgYXdhaXQgYXBpKGAvYXBpL29yZGVycy8ke2lkfS91bnByaW50YCwgeyBtZXRob2Q6ICdQT1NUJyB9KTsgb2srKzsgfSBjYXRjaCB7fSB9CiAgICAgIHJlYygpOyBzZWxlY3RlZC5jbGVhcigpOyB0b2FzdChgJHtva30gZXRpcXVldGEke29rID09PSAxID8gJycgOiAncyd9IHZvbHZpZXJvbiBhICJQYXJhIGltcHJpbWlyImApOyBsb2FkT3JkZXJzKCk7CiAgICB9CiAgICBpZiAoYi5kYXRhc2V0LmJ1bGsgPT09ICd1bmJsb2NrJykgewogICAgICBjb25zdCBpZHMgPSBbLi4uc2VsZWN0ZWRdLmZpbHRlcihpZCA9PiBvcmRlcnMuZmluZChvID0+IG8uaWQgPT09IGlkICYmIG8uc3RhdGUgPT09ICdibG9ja2VkJykpOwogICAgICBpZiAoIWlkcy5sZW5ndGggfHwgIWNvbmZpcm0oYMK/RGVzYmxvcXVlYXIgJHtpZHMubGVuZ3RofSBldGlxdWV0YSR7aWRzLmxlbmd0aCA9PT0gMSA/ICcnIDogJ3MnfT8gUGFzYW4gYSBsYSBzZWNjacOzbiAiRGVzYmxvcXVlYWRhcyIuIEVuIGxhIGhvamEgZGUgY2FkYSBwZWRpZG8gc2FsZHLDoSBzdSBuw7ptZXJvIHkgcXVlZGFyw6FuIG1hcmNhZG9zIGNvbiAiRkFMVEEiIGxvcyBwcm9kdWN0b3MgcXVlIHNlIHJlbGxlbmFuIGFwYXJ0ZS5gKSkgcmV0dXJuOwogICAgICBiLmRpc2FibGVkID0gdHJ1ZTsgYi50ZXh0Q29udGVudCA9ICdEZXNibG9xdWVhbmRv4oCmJzsKICAgICAgdHJ5IHsKICAgICAgICBjb25zdCByZWMgPSBhd2FpdCByZWNvcmRPcmRlcnMoYERlc2Jsb3F1ZWFyICR7aWRzLmxlbmd0aH0gZXRpcXVldGFzYCwgaWRzKTsKICAgICAgICBjb25zdCByID0gYXdhaXQgYXBpUmV0cnkoJy9hcGkvb3JkZXJzL3VuYmxvY2stYnVsaycsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgaWRzIH0gfSk7CiAgICAgICAgcmVjKCk7IG1hcmtVbmJsb2NrZWQoaWRzKTsgc2VsZWN0ZWQuY2xlYXIoKTsKICAgICAgICB0b2FzdChgJHtyLnVuYmxvY2tlZH0gZXRpcXVldGEke3IudW5ibG9ja2VkID09PSAxID8gJycgOiAncyd9IGRlc2Jsb3F1ZWFkYSR7ci51bmJsb2NrZWQgPT09IDEgPyAnJyA6ICdzJ30gwrcgcGFzYXJvbiBhICJEZXNibG9xdWVhZGFzImApOyBsb2FkT3JkZXJzKCk7CiAgICAgIH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IGRyYXdBY3Rpb25iYXIoKTsgfQogICAgfQogICAgaWYgKGIuZGF0YXNldC5idWxrID09PSAnbm9uZScpIHsgc2VsZWN0ZWQuY2xlYXIoKTsgZHJhd1Jvd3MoKTsgfQogIH07CiAgbG9hZE9yZGVycygpOwp9Cgphc3luYyBmdW5jdGlvbiBsb2FkT3JkZXJzKCkgewogIGlmICh0YWIgIT09ICd0cmF5JykgcmV0dXJuOwogIGNvbnN0IGQgPSBhd2FpdCBhcGkoJy9hcGkvb3JkZXJzP3ZpZXc9YWxsJyk7CiAgY29uc3QgcHJldlJlYWR5ID0gbmV3IFNldChvcmRlcnMuZmlsdGVyKG8gPT4gby5zdGF0ZSA9PT0gJ3JlYWR5JykubWFwKG8gPT4gby5pZCkpOwogIG9yZGVycyA9IGQub3JkZXJzLnNvcnQoKGEsIGIpID0+IHRzKGIpIC0gdHMoYSkpOwogIHNlbGxlcnMgPSBkLnNlbGxlcnM7CiAgZHJhd1NlbGxlckZpbHRlcigpOwogIGNvbnN0IGZyZXNoID0gb3JkZXJzLmZpbHRlcihvID0+IG8uc3RhdGUgPT09ICdyZWFkeScgJiYgIXByZXZSZWFkeS5oYXMoby5pZCkpLm1hcChvID0+IG8uaWQpOwogIGRyYXdSb3dzKGZpcnN0TG9hZCA/IFtdIDogZnJlc2gpOwogIGlmICghZmlyc3RMb2FkICYmIGZyZXNoLmxlbmd0aCkgdG9hc3QoYCR7ZnJlc2gubGVuZ3RofSBldGlxdWV0YSR7ZnJlc2gubGVuZ3RoID4gMSA/ICdzJyA6ICcnfSBudWV2YSR7ZnJlc2gubGVuZ3RoID4gMSA/ICdzJyA6ICcnfSBwb3IgaW1wcmltaXJgKTsKICBmaXJzdExvYWQgPSBmYWxzZTsKICAvLyBkZXNjYXJnYSBhdXRvbcOhdGljYSBlbGltaW5hZGE6IG51bmNhIHNlIGRlc2NhcmdhbiBuaSBtYXJjYW4gZXRpcXVldGFzIHNpbiBxdWUgYWxndWllbiBoYWdhIGNsaWMKfQoKY29uc3Qgc2VsbGVyT2sgPSBvID0+ICF1aS5zZWxsZXJzLnNpemUgfHwgdWkuc2VsbGVycy5oYXMoU3RyaW5nKG8uc2VsbGVyX2lkKSk7CmZ1bmN0aW9uIGRyYXdTZWxsZXJGaWx0ZXIoKSB7CiAgY29uc3QgYm94ID0gJCgnI3NlbGxlckYnKTsgaWYgKCFib3gpIHJldHVybjsKICBmb3IgKGNvbnN0IGlkIG9mIFsuLi51aS5zZWxsZXJzXSkgaWYgKCFzZWxsZXJzLnNvbWUocyA9PiBTdHJpbmcocy5pZCkgPT09IGlkKSkgdWkuc2VsbGVycy5kZWxldGUoaWQpOwogIGNvbnN0IG4gPSB1aS5zZWxsZXJzLnNpemU7CiAgYm94LnF1ZXJ5U2VsZWN0b3IoJy5tc2VsLWJ0bicpLnRleHRDb250ZW50ID0gIW4gPyAnVG9kb3MgbG9zIHZlbmRlZG9yZXMnIDogbiA9PT0gMSA/IChzZWxsZXJzLmZpbmQocyA9PiB1aS5zZWxsZXJzLmhhcyhTdHJpbmcocy5pZCkpKT8ubmFtZSB8fCAnMSB2ZW5kZWRvcicpIDogYCR7bn0gdmVuZGVkb3Jlc2A7CiAgYm94LmNsYXNzTGlzdC50b2dnbGUoJ29uJywgbiA+IDApOwogIGJveC5xdWVyeVNlbGVjdG9yKCcubXNlbC1wb3AnKS5pbm5lckhUTUwgPSBgPGxhYmVsIGNsYXNzPSJtc2VsLWFsbCI+PGlucHV0IHR5cGU9ImNoZWNrYm94IiB2YWx1ZT0iYWxsIiAkeyFuID8gJ2NoZWNrZWQnIDogJyd9PiBUb2RvcyBsb3MgdmVuZGVkb3JlczwvbGFiZWw+YCArCiAgICBzZWxsZXJzLm1hcChzID0+IGA8bGFiZWw+PGlucHV0IHR5cGU9ImNoZWNrYm94IiB2YWx1ZT0iJHtzLmlkfSIgJHt1aS5zZWxsZXJzLmhhcyhTdHJpbmcocy5pZCkpID8gJ2NoZWNrZWQnIDogJyd9PiAke2VzYyhzLm5hbWUpfTwvbGFiZWw+YCkuam9pbignJyk7Cn0KLy8gZmlsdHJvIGRlIG1hcmtldHBsYWNlOiBhZGVtw6FzIHNlcGFyYSBNZXJjYWRvIExpYnJlIEFnZW5jaWEgeSBNZXJjYWRvIExpYnJlIEZsZXgKY29uc3QgbWtNYXRjaCA9IChvLCBrKSA9PiBrID09PSAnYWxsJyB8fCAoayA9PT0gJ21sLWFnZW5jaWEnID8gby5tYXJrZXRwbGFjZSA9PT0gJ21sJyAmJiBvLnNoaXBfdHlwZSA9PT0gJ0FnZW5jaWEnIDogayA9PT0gJ21sLWZsZXgnID8gby5tYXJrZXRwbGFjZSA9PT0gJ21sJyAmJiBvLnNoaXBfdHlwZSA9PT0gJ0ZsZXgnIDogby5tYXJrZXRwbGFjZSA9PT0gayk7CmNvbnN0IG1hdGNoZXNGaWx0ZXJzID0gbyA9PiBta01hdGNoKG8sIHVpLm1rKSAmJiBzZWxsZXJPayhvKSAmJgogICghdWkucSB8fCBvLm9yZGVyX251bWJlci50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHVpLnEpIHx8IChvLmN1c3RvbWVyIHx8ICcnKS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHVpLnEpIHx8IG8uaXRlbXMuc29tZShpID0+IFtpLnNrdSwgaS5wdWJfaWQsIGkubmFtZV0uam9pbignICcpLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXModWkucSkpKTsKY29uc3QgdmlzaWJsZUluID0gdCA9PiBvcmRlcnMuZmlsdGVyKG8gPT4gaW5UYWJGbihvLCB0KSAmJiBtYXRjaGVzRmlsdGVycyhvKSk7Ci8vIEVuICJQb3IgaW1wcmltaXIiIHRhbWJpw6luIHNlIHF1ZWRhbiBsYXMgcXVlIHNlIGltcHJpbWllcm9uIGVuIGxhcyDDumx0aW1hcyAxMiBob3JhcywgZW4gcm9qbyBjb24gIlZvbHZlciBhIGltcHJpbWlyIgpjb25zdCBwcmludGVkUmVjZW50bHkgPSBvID0+IG8uc3RhdGUgPT09ICdwcmludGVkJyAmJiBvLnByaW50ZWRfYXQgJiYgRGF0ZS5ub3coKSAtIG5ldyBEYXRlKG8ucHJpbnRlZF9hdC5yZXBsYWNlKCcgJywgJ1QnKSArICdaJykgPCAxMiAqIDM2MDBlMzsKLy8gQmxvcXVlYWRhcyBpbXByZXNhczogwr9lbCBmdWxmaWxsbWVudCB0aWVuZSBxdWUgcmVsbGVuYXIgKHRpZW5lIGFsIG1lbm9zIHVuIHByb2R1Y3RvKSBvIG5vIGxlIHRvY2EgbmFkYT8KY29uc3QgYnBLaW5kID0gbyA9PiAoKG8ubWlzc2luZ19pZHggfHwgW10pLmxlbmd0aCA+PSAoby5pdGVtcyB8fCBbXSkubGVuZ3RoID8gJ25vbmUnIDogJ2ZpbGwnKTsKZnVuY3Rpb24gdmlzaWJsZSgpIHsKICBpZiAodWkudGFiID09PSAnYmxvY2tlZFByaW50ZWQnICYmIHVpLmJwZiAhPT0gJ2FsbCcpIHJldHVybiB2aXNpYmxlSW4odWkudGFiKS5maWx0ZXIobyA9PiBicEtpbmQobykgPT09IHVpLmJwZik7CiAgaWYgKHVpLnRhYiA9PT0gJ2Jsb2NrZWQnKSByZXR1cm4gdmlzaWJsZUluKHVpLnRhYikuZmlsdGVyKG8gPT4gKHVpLmJkZiA9PT0gJ2FsbCcgfHwgKHVpLmJkZiA9PT0gJ3RvZGF5JykgPT09IGlzRm9yVG9kYXkobykpICYmICh1aS5iYmYgPT09ICdhbGwnIHx8IGJwS2luZChvKSA9PT0gdWkuYmJmKSk7CiAgaWYgKHVpLnRhYiA9PT0gJ3VuYmxvY2tlZCcpIHJldHVybiB2aXNpYmxlSW4odWkudGFiKS5maWx0ZXIobyA9PiAodWkudWRmID09PSAnYWxsJyB8fCAodWkudWRmID09PSAndG9kYXknKSA9PT0gaXNGb3JUb2RheShvKSkgJiYgKHVpLnViZiA9PT0gJ2FsbCcgfHwgYnBLaW5kKG8pID09PSB1aS51YmYpKTsKICAvLyBsYXMgaW1wcmVzYXMgc2FsZW4gZGUgIlBhcmEgaW1wcmltaXIgaG95IiB5IHF1ZWRhbiBzb2xvIGVuICJFdGlxdWV0YXMgaW1wcmVzYXMiIG8gIkJsb3F1ZWFkYXMgaW1wcmVzYXMiCiAgcmV0dXJuIHZpc2libGVJbih1aS50YWIpOwp9CgpmdW5jdGlvbiBpdGVtc0hUTUwobykgewogIGNvbnN0IGJhZCA9IG5ldyBTZXQoby5taXNzaW5nX2lkeCB8fCBbXSk7CiAgY29uc3QgbWl4ZWQgPSBiYWQuc2l6ZSA+IDA7IC8vIHBlZGlkbyBjb24gcHJvZHVjdG9zIGJsb3F1ZWFkb3M6IHJvam8gPSBubyBsbyB0aWVuZSBlbCBmdWxmaWxsbWVudCwgdmVyZGUgPSBzw60gbG8gdGllbmUKICByZXR1cm4gYDxkaXYgY2xhc3M9Iml0ZW1zIj4ke28uaXRlbXMubWFwKChpLCBuKSA9PiBgPHNwYW4gY2xhc3M9IiR7YmFkLmhhcyhuKSA/ICdiYWQnIDogJ2dvb2QnfSI+JHtiYWQuaGFzKG4pID8gJzxlbSBjbGFzcz0iZmFsdGEiPkZBTFRBPC9lbT4gJyA6IG1peGVkID8gJzxlbSBjbGFzcz0idGllbmUiPlRJRU5FPC9lbT4gJyA6ICcnfTxiPiR7ZXNjKGkucXR5KX3DlzwvYj4gJHtlc2MoaS5uYW1lKX0ke2kudmFyaWFudCA/IGAgPHNwYW4gY2xhc3M9InYiPsK3ICR7ZXNjKGkudmFyaWFudCl9PC9zcGFuPmAgOiAnJ30gPHNwYW4gY2xhc3M9Im1vbm8gdiI+JHtlc2MoaS5za3UgfHwgaS5wdWJfaWQpfTwvc3Bhbj48L3NwYW4+YCkuam9pbignJyl9PC9kaXY+YDsKfQpmdW5jdGlvbiBwaWxsKG8pIHsgcmV0dXJuIGA8c3BhbiBjbGFzcz0icGlsbCAke28uc3RhdGV9Ij4ke3BpbGxJY29uW28uc3RhdGVdIHx8ICcnfSR7U1RBVEVbby5zdGF0ZV0gfHwgby5zdGF0ZX08L3NwYW4+YDsgfQoKCi8vIFRhYmxhIGRlIGNvbnRlbyBwb3IgY2FuYWw6IHBhcmEgY2FkYSBjYW5hbCwgIkZGIiA9IGxhcyBxdWUgc2VwYXJhIGVsIGZ1bGZpbGxtZW50IHkgIkJsb3EuIiA9IGJsb3F1ZWFkYXMgYWwgMTAwJQovLyAoZWwgdmVuZGVkb3IgZW52w61hIHRvZG87IGVsIGZ1bGZpbGxtZW50IG5vIHNlcGFyYSBuYWRhKQpjb25zdCBTU19DQVRTID0gW1snY2UnLCAnQ2VudHJvIGVudsOtbyBNTCddLCBbJ2ZsZXgnLCAnRmxleCddLCBbJ2ZhJywgJ0ZhbGFiZWxsYSddLCBbJ3BhJywgJ1BhcmlzJ11dOwpmdW5jdGlvbiBjb3VudFRhYmxlKHJvd3MsIGZpcnN0KSB7CiAgY29uc3QgeiA9IG4gPT4gbiA/IG4gOiAnPHNwYW4gY2xhc3M9Inplcm8iPsK3PC9zcGFuPic7CiAgY29uc3Qgc3VtID0gKG8sIGspID0+IFNTX0NBVFMucmVkdWNlKChhLCBbY10pID0+IGEgKyAoKG9ba10gfHwge30pW2NdIHx8IDApLCAwKTsKICByZXR1cm4gYDxkaXYgY2xhc3M9InRhYmxlLXdyYXAiPjx0YWJsZSBjbGFzcz0ic3MtdGFibGUgc3MtMiI+PHRoZWFkPgogICAgPHRyPjx0aCByb3dzcGFuPSIyIj4ke2ZpcnN0fTwvdGg+JHtTU19DQVRTLm1hcCgoWywgbl0pID0+IGA8dGggY29sc3Bhbj0iMiIgY2xhc3M9InNzLWdycCI+JHtufTwvdGg+YCkuam9pbignJyl9PHRoIGNvbHNwYW49IjIiIGNsYXNzPSJzcy1ncnAiPlRvdGFsPC90aD48dGggcm93c3Bhbj0iMiIgY2xhc3M9Im51bSI+VG9kYXM8L3RoPjwvdHI+CiAgICA8dHI+JHtTU19DQVRTLmNvbmNhdChbWyd0J11dKS5tYXAoKCkgPT4gJzx0aCBjbGFzcz0ibnVtIiB0aXRsZT0iTGFzIHNlcGFyYSBlbCBmdWxmaWxsbWVudCI+RkY8L3RoPjx0aCBjbGFzcz0ibnVtIHNzLWJsIiB0aXRsZT0iQmxvcXVlYWRhcyBhbCAxMDAlOiBlbCBmdWxmaWxsbWVudCBubyBzZXBhcmEgbmFkYSI+QmxvcS48L3RoPicpLmpvaW4oJycpfTwvdHI+PC90aGVhZD48dGJvZHk+CiAgICAke3Jvd3MubWFwKHIgPT4gYDx0ciBjbGFzcz0iJHtyLmNscyB8fCAnJ30iPjx0ZD4ke3IubGFiZWx9PC90ZD4ke1NTX0NBVFMubWFwKChbY10pID0+IGA8dGQgY2xhc3M9Im51bSI+JHt6KChyLmZmIHx8IHt9KVtjXSl9PC90ZD48dGQgY2xhc3M9Im51bSBzcy1ibCI+JHt6KChyLmJsIHx8IHt9KVtjXSl9PC90ZD5gKS5qb2luKCcnKX08dGQgY2xhc3M9Im51bSI+PGI+JHtzdW0ociwgJ2ZmJyl9PC9iPjwvdGQ+PHRkIGNsYXNzPSJudW0gc3MtYmwiPjxiPiR7c3VtKHIsICdibCcpIHx8ICc8c3BhbiBjbGFzcz0iemVybyI+wrc8L3NwYW4+J308L2I+PC90ZD48dGQgY2xhc3M9Im51bSI+JHtzdW0ociwgJ2ZmJykgKyBzdW0ociwgJ2JsJyl9PC90ZD48L3RyPmApLmpvaW4oJycpfQogIDwvdGJvZHk+PC90YWJsZT48L2Rpdj5gOwp9CgovLyBSZWdpc3RybyBkaWFyaW8gZGUgcGFxdWV0ZXMgKHBvciBkw61hIGRlIGRlc3BhY2hvKTogbm8gc2UgYm9ycmEsIHF1ZWRhIHVuIGhpc3RvcmlhbCBkw61hIGEgZMOtYQphc3luYyBmdW5jdGlvbiBkcmF3U2hpcEhpc3RvcnkoKSB7CiAgbGV0IGQ7IHRyeSB7IGQgPSBhd2FpdCBhcGkoJy9hcGkvc2hpcC1oaXN0b3J5P2RheXM9MjEnKTsgfSBjYXRjaCB7IHJldHVybjsgfQogIGNvbnN0IGJveCA9ICQoJyNzaGlwSGlzdCcpOyBpZiAoIWJveCkgcmV0dXJuOwogIGNvbnN0IENBVFMgPSBbWydjZScsICdDZW50cm8gZW52w61vIE1MJ10sIFsnZmxleCcsICdGbGV4J10sIFsnZmEnLCAnRmFsYWJlbGxhJ10sIFsncGEnLCAnUGFyaXMnXV07CiAgY29uc3QgZGF5UyA9IHggPT4gZXNjKG5ldyBEYXRlKHggKyAnVDEyOjAwOjAwJykudG9Mb2NhbGVEYXRlU3RyaW5nKCdlcy1DTCcsIHsgd2Vla2RheTogJ3Nob3J0JywgZGF5OiAnbnVtZXJpYycsIG1vbnRoOiAnc2hvcnQnIH0pLnJlcGxhY2UoL1wuL2csICcnKSk7CiAgY29uc3Qgcm93cyA9IFtdOwogIGZvciAoY29uc3QgciBvZiBkLmRheXMpIHsKICAgIGNvbnN0IGhveSA9IHIuZGF5ID09PSBpc28obmV3IERhdGUoKSk7CiAgICByb3dzLnB1c2goeyBsYWJlbDogYDxiPiR7ZGF5UyhyLmRheSl9PC9iPiR7aG95ID8gJyA8c21hbGwgY2xhc3M9Im11dGVkIj4oaG95KTwvc21hbGw+JyA6ICcnfWAsIGZmOiByLmZmLCBibDogci5ibCwgY2xzOiAnc3MtZGF5cm93JyArIChob3kgPyAnIHNzLXRvZGF5JyA6ICcnKSB9KTsKICAgIGlmICh1aS5zaGlwT3BlbikgT2JqZWN0LmtleXMoci5zZWxsZXJzKS5zb3J0KCkuZm9yRWFjaChuID0+IHJvd3MucHVzaCh7IGxhYmVsOiBgPHNwYW4gY2xhc3M9InNzLXN1YiI+JHtlc2Mobil9PC9zcGFuPmAsIC4uLnIuc2VsbGVyc1tuXSwgY2xzOiAnc3Mtc2Vscm93JyB9KSk7CiAgfQogIGJveC5pbm5lckhUTUwgPSBkLmRheXMubGVuZ3RoID8gY291bnRUYWJsZShyb3dzLCAnRMOtYSBkZSBkZXNwYWNobycpICsgYDxkaXYgY2xhc3M9Im11dGVkIHNzLW5vdGUiPkZGID0gbGFzIHNlcGFyYSBlbCBmdWxmaWxsbWVudCDCtyBCbG9xLiA9IGJsb3F1ZWFkYXMgYWwgMTAwJSAobGFzIGVudsOtYSBlbCB2ZW5kZWRvciBjb21wbGV0YXMpLiAke3VpLnNoaXBPcGVuID8gJycgOiAnVG9jYSAiUG9yIGN1ZW50YSIgcGFyYSB2ZXIgZWwgZGV0YWxsZSBkZSBjYWRhIHZlbmRlZG9yLid9PC9kaXY+YCA6ICc8ZGl2IGNsYXNzPSJtdXRlZCIgc3R5bGU9InBhZGRpbmc6NnB4IDJweCI+QcO6biBubyBoYXkgaGlzdG9yaWFsLjwvZGl2Pic7Cn0KCi8vIFJlc3VtZW4gYXJyaWJhOiBjdcOhbnRvcyBlbnbDrW9zIHNhbGVuIChob3kgbyBlbiBlbCBwcsOzeGltbyBkw61hIGRlIGRlc3BhY2hvKSBwb3IgdGlwbyB5IHBvciBjdWVudGEKZnVuY3Rpb24gZHJhd1NoaXBTdW1tYXJ5KCkgewogIGNvbnN0IGJveCA9ICQoJyNzaGlwU3VtJyk7IGlmICghYm94KSByZXR1cm47CiAgLy8gRWwgY29udGVvIGRlbCBkw61hIGluY2x1eWUgbG8gcXVlIHlhIHNhbGnDsyAoZW52aWFkYXMpLCBhc8OtIGVsIG7Dum1lcm8gZGVsIGTDrWEgbm8gYmFqYTsgc2UgcmVpbmljaWEgYSBsYXMgMDA6MDAKICBjb25zdCBvcGVuID0gb3JkZXJzLmZpbHRlcihvID0+IG8uc3RhdGUgIT09ICdjYW5jZWxsZWQnKTsKICBjb25zdCBkYXlPZiA9IG8gPT4geyBjb25zdCBkID0gZGlzcGF0Y2hEYXRlKG8pOyByZXR1cm4gZCA/IGlzbyhkKSA6IGlzbyhuZXcgRGF0ZSgpKTsgfTsKICBjb25zdCB0b2RheSA9IGlzbyhuZXcgRGF0ZSgpKTsKICBjb25zdCBjYXQgPSBvID0+IG8ubWFya2V0cGxhY2UgPT09ICdtbCcgPyAoby5zaGlwX3R5cGUgPT09ICdGbGV4JyA/ICdmbGV4JyA6ICdjZScpIDogby5tYXJrZXRwbGFjZTsKICBjb25zdCBDQVRTID0gW1snY2UnLCAnQ2VudHJvIGVudsOtbyBNTCcsIE1LX0NPTE9SLm1sXSwgWydmbGV4JywgJ0ZsZXgnLCAnIzIzOTQ2QSddLCBbJ2ZhJywgJ0ZhbGFiZWxsYScsIE1LX0NPTE9SLmZhXSwgWydwYScsICdQYXJpcycsIE1LX0NPTE9SLnBhXV07CiAgY29uc3QgZWZmID0gbyA9PiAoby5zdGF0ZSAhPT0gJ3NoaXBwZWQnICYmIGRheU9mKG8pIDwgdG9kYXkgPyB0b2RheSA6IGRheU9mKG8pKTsKICAvLyBDYWRhIGNhbmFsIHRpZW5lIHN1IHByb3BpbyBwcsOzeGltbyBkw61hIGRlIGRlc3BhY2hvIChwLiBlai4gTUwgZWwgbHVuZXMgeSBGYWxhYmVsbGEgZWwgbWFydGVzKToKICAvLyBlbiAiUHLDs3hpbW8iIHNlIGN1ZW50YSwgcG9yIGNhbmFsLCBsbyBxdWUgdmVuY2UgZW4gc3Ugc2lndWllbnRlIGTDrWEgZGUgZGVzcGFjaG8uCiAgY29uc3QgdGFyZ2V0T2YgPSB7fTsKICBmb3IgKGNvbnN0IFtrXSBvZiBDQVRTKSB0YXJnZXRPZltrXSA9IHVpLnNoaXBEYXkgPT09ICd0b2RheScgPyB0b2RheSA6IChvcGVuLmZpbHRlcihvID0+IGNhdChvKSA9PT0gayAmJiBvLnN0YXRlICE9PSAnc2hpcHBlZCcpLm1hcChlZmYpLmZpbHRlcihkID0+IGQgPiB0b2RheSkuc29ydCgpWzBdIHx8IG51bGwpOwogIGNvbnN0IGxpc3QgPSBvcGVuLmZpbHRlcihvID0+IHRhcmdldE9mW2NhdChvKV0gJiYgZWZmKG8pID09PSB0YXJnZXRPZltjYXQobyldKTsKICBjb25zdCBjb3VudCA9IChhcnIsIGspID0+IGFyci5maWx0ZXIobyA9PiBjYXQobykgPT09IGspLmxlbmd0aDsKICBjb25zdCBjbnRCeSA9IGFyciA9PiB7IGNvbnN0IHIgPSB7fTsgYXJyLmZvckVhY2gobyA9PiB7IHJbY2F0KG8pXSA9IChyW2NhdChvKV0gfHwgMCkgKyAxOyB9KTsgcmV0dXJuIHI7IH07CiAgY29uc3QgZGF5UyA9IGQgPT4gZXNjKG5ldyBEYXRlKGQgKyAnVDEyOjAwOjAwJykudG9Mb2NhbGVEYXRlU3RyaW5nKCdlcy1DTCcsIHsgd2Vla2RheTogJ3Nob3J0JywgZGF5OiAnbnVtZXJpYycgfSkucmVwbGFjZSgvXC4vZywgJycpKTsKICAvLyBQYXJhIGVsIGNvbnRlbyBkZWwgZnVsZmlsbG1lbnQgbm8gY3VlbnRhbiBsYXMgZXRpcXVldGFzIGJsb3F1ZWFkYXMgYWwgMTAwJSAobm8gdGllbmUgbmluZ3VubyBkZSBzdXMgcHJvZHVjdG9zKTsKICAvLyBzw60gY3VlbnRhbiBsYXMgcXVlIHRpZW5lbiBhbCBtZW5vcyB1biBwcm9kdWN0byBxdWUgZWwgZnVsZmlsbG1lbnQgdGllbmUuCiAgY29uc3Qgbm9uZUZmID0gbyA9PiAoby5taXNzaW5nX2lkeCB8fCBbXSkubGVuZ3RoID4gMCAmJiAoby5taXNzaW5nX2lkeCB8fCBbXSkubGVuZ3RoID49IChvLml0ZW1zIHx8IFtdKS5sZW5ndGg7CiAgY29uc3QgZmYgPSBsaXN0LmZpbHRlcihvID0+ICFub25lRmYobykpOwogIGNvbnN0IGJ5U2VsbGVyID0gWy4uLm5ldyBTZXQobGlzdC5tYXAobyA9PiBvLnNlbGxlcikpXS5zb3J0KCkubWFwKG4gPT4gW24sIGZmLmZpbHRlcihvID0+IG8uc2VsbGVyID09PSBuKSwgbGlzdC5maWx0ZXIobyA9PiBvLnNlbGxlciA9PT0gbildKTsKICBjb25zdCBjdXRTID0gKGFyciwgaykgPT4geyBjb25zdCB0ID0gdGFyZ2V0T2Zba107IGlmICghdCkgcmV0dXJuICcnOyBjb25zdCBocyA9IGFyci5maWx0ZXIobyA9PiBjYXQobykgPT09IGspLm1hcChkaXNwYXRjaERhdGUpLmZpbHRlcihkID0+IGQgJiYgaXNvKGQpID09PSB0ICYmICFbJzIzOjU5JywgJzAwOjAwJ10uaW5jbHVkZXMoaGhtbShkKSkpOyBjb25zdCBjbnQgPSBuZXcgTWFwKCk7IGhzLmZvckVhY2goZCA9PiB7IGNvbnN0IGggPSBoaG1tKGQpOyBjbnQuc2V0KGgsIChjbnQuZ2V0KGgpIHx8IHsgbjogMCwgZCB9KSApOyBjbnQuZ2V0KGgpLm4rKzsgfSk7IGNvbnN0IHRvcCA9IFsuLi5jbnQudmFsdWVzKCldLnNvcnQoKGEsIGIpID0+IGIubiAtIGEubiB8fCBiLmQgLSBhLmQpWzBdOyByZXR1cm4gKHVpLnNoaXBEYXkgPT09ICd0b2RheScgPyAnJyA6IGRheVModCkgKyAnICcpICsgKHRvcCA/IGFtcG0odG9wLmQpIDogJycpOyB9OyAvLyBob3JhIGRlIGNvcnRlID0gbGEgcXVlIHRpZW5lbiBsYSBtYXlvcsOtYSBkZSBsYXMgZXRpcXVldGFzIGRlbCBkw61hCiAgY29uc3QgZXhjbCA9IGxpc3QubGVuZ3RoIC0gZmYubGVuZ3RoOwogIGNvbnN0IGZmUHJpbnRlZCA9IGZmLmZpbHRlcihvID0+IFsncHJpbnRlZCcsICdzaGlwcGVkJ10uaW5jbHVkZXMoby5zdGF0ZSkpLmxlbmd0aDsgLy8gbGFzIGltcHJlc2FzIHNpZ3VlbiBjb250YW5kbzogc2FsZW4gaWd1YWwgZXNlIGTDrWEKICBib3guaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9InNzeCI+CiAgICAgIDxzcGFuIGNsYXNzPSJzc3gtdCI+8J+amiBQYXF1ZXRlcyBmdWxmaWxsbWVudCAke3VpLnNoaXBEYXkgPT09ICd0b2RheScgPyAnaG95JyA6ICdwcsOzeGltbyBkZXNwYWNobyd9PC9zcGFuPgogICAgICAke0NBVFMubWFwKChbaywgbiwgY10pID0+IGA8c3BhbiBjbGFzcz0ic3N4LWkiIHN0eWxlPSItLWM6JHtjfSI+PGk+PC9pPiR7bn0gPGI+JHtjb3VudChmZiwgayl9PC9iPiR7Y3V0UyhmZiwgaykgPyBgPHNtYWxsIHRpdGxlPSJIb3JhIGRlIGNvcnRlIj7ij7Ake2N1dFMoZmYsIGspfTwvc21hbGw+YCA6ICcnfTwvc3Bhbj5gKS5qb2luKCcnKX0KICAgICAgPHNwYW4gY2xhc3M9InNzeC1pIHNzeC10b3QiIHRpdGxlPSJFdGlxdWV0YXMgZG9uZGUgZWwgZnVsZmlsbG1lbnQgdGllbmUgYWwgbWVub3MgdW4gcHJvZHVjdG8gKGltcHJlc2FzIHkgcG9yIGltcHJpbWlyKSI+RnVsZmlsbG1lbnQgPGI+JHtmZi5sZW5ndGh9PC9iPjxzbWFsbD4oJHtmZlByaW50ZWR9IGltcHJlc2FzIMK3ICR7ZmYubGVuZ3RoIC0gZmZQcmludGVkfSBwb3IgaW1wcmltaXIpPC9zbWFsbD48L3NwYW4+CiAgICAgIDxzcGFuIGNsYXNzPSJzc3gtaSBzc3gtYWxsIiB0aXRsZT0iVG9kYXMgbGFzIGV0aXF1ZXRhcyBkZWwgZMOtYSwgaW5jbHVpZGFzIGxhcyBibG9xdWVhZGFzIGFsIDEwMCUiPlRvZGFzIGxhcyBldGlxdWV0YXMgPGI+JHtsaXN0Lmxlbmd0aH08L2I+JHtleGNsID8gYDxzbWFsbD4oJHtleGNsfSBibG9xdWVhZGEke2V4Y2wgPiAxID8gJ3MnIDogJyd9IDEwMCUpPC9zbWFsbD5gIDogJyd9PC9zcGFuPgogICAgICA8c3BhbiBjbGFzcz0ic3N4LXIiPgogICAgICA8YnV0dG9uIGNsYXNzPSJzc3gtbW9yZSIgZGF0YS1oaXN0PSIxIj4ke3VpLnNoaXBIaXN0ID8gJ09jdWx0YXIgaGlzdG9yaWFsIOKWtCcgOiAnSGlzdG9yaWFsIHBvciBkw61hIOKWvid9PC9idXR0b24+CiAgICAgICR7YnlTZWxsZXIubGVuZ3RoID8gYDxidXR0b24gY2xhc3M9InNzeC1tb3JlIiBkYXRhLW1vcmU9IjEiPiR7dWkuc2hpcE9wZW4gPyAnT2N1bHRhciBjdWVudGFzIOKWtCcgOiAnUG9yIGN1ZW50YSDilr4nfTwvYnV0dG9uPmAgOiAnJ30KICAgICAgPHNwYW4gY2xhc3M9InNzeC1zdyI+PGJ1dHRvbiBkYXRhLXNkPSJ0b2RheSIgYXJpYS1wcmVzc2VkPSIke3VpLnNoaXBEYXkgPT09ICd0b2RheSd9Ij5Ib3k8L2J1dHRvbj48YnV0dG9uIGRhdGEtc2Q9Im5leHQiIGFyaWEtcHJlc3NlZD0iJHt1aS5zaGlwRGF5ICE9PSAndG9kYXknfSI+UHLDs3hpbW88L2J1dHRvbj48L3NwYW4+PC9zcGFuPgogICAgPC9kaXY+CiAgICAke2J5U2VsbGVyLmxlbmd0aCAmJiB1aS5zaGlwT3BlbiA/IGA8ZGl2IGNsYXNzPSJzc3gtZGV0Ij4ke2NvdW50VGFibGUoYnlTZWxsZXIubWFwKChbbiwgLCBhbGxdKSA9PiAoeyBsYWJlbDogZXNjKG4pLCBmZjogY250QnkoYWxsLmZpbHRlcihvID0+ICFub25lRmYobykpKSwgYmw6IGNudEJ5KGFsbC5maWx0ZXIobm9uZUZmKSkgfSkpLmNvbmNhdChbeyBsYWJlbDogJzxiPlRvdGFsPC9iPicsIGZmOiBjbnRCeShmZiksIGJsOiBjbnRCeShsaXN0LmZpbHRlcihub25lRmYpKSwgY2xzOiAnc3Mtc3VtJyB9XSksICdDdWVudGEnKX08L2Rpdj5gIDogJyd9CiAgICAke3VpLnNoaXBIaXN0ID8gYDxkaXYgY2xhc3M9InNzeC1kZXQiIGlkPSJzaGlwSGlzdCI+PGRpdiBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJwYWRkaW5nOjZweCAycHgiPkNhcmdhbmRvIGhpc3RvcmlhbOKApjwvZGl2PjwvZGl2PmAgOiAnJ31gOwogIGlmICh1aS5zaGlwSGlzdCkgZHJhd1NoaXBIaXN0b3J5KCk7CiAgYm94Lm9uY2xpY2sgPSBlID0+IHsgaWYgKGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLWhpc3RdJykpIHsgdWkuc2hpcEhpc3QgPSAhdWkuc2hpcEhpc3Q7IGRyYXdTaGlwU3VtbWFyeSgpOyByZXR1cm47IH0gaWYgKGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLW1vcmVdJykpIHsgdWkuc2hpcE9wZW4gPSAhdWkuc2hpcE9wZW47IGRyYXdTaGlwU3VtbWFyeSgpOyByZXR1cm47IH0gY29uc3QgYiA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLXNkXScpOyBpZiAoIWIpIHJldHVybjsgdWkuc2hpcERheSA9IGIuZGF0YXNldC5zZDsgZHJhd1NoaXBTdW1tYXJ5KCk7IH07Cn0KCmZ1bmN0aW9uIGRyYXdSb3dzKGZyZXNoID0gW10pIHsKICBpZiAoISQoJyN0YWJzQmlnJykpIHJldHVybjsKICBkcmF3U2hpcFN1bW1hcnkoKTsKICBjb25zdCBpblRhYiA9IHQgPT4gb3JkZXJzLmZpbHRlcihvID0+IGluVGFiRm4obywgdCkgJiYgbWtNYXRjaChvLCB1aS5taykgJiYgc2VsbGVyT2sobykpOwogIGNvbnN0IHRhYnNMaXN0ID0gVEFCUzsgLy8gdG9kYXMgbGFzIHNlY2Npb25lcyBwYXJhIHRvZG9zIChlbCBmdWxmaWxsbWVudCB0YW1iacOpbiB2ZSAiQmxvcXVlYWRhcyBpbXByZXNhcyIpCiAgaWYgKCF0YWJzTGlzdC5zb21lKChba10pID0+IGsgPT09IHVpLnRhYikpIHVpLnRhYiA9ICd0b2RheSc7CiAgJCgnI3RhYnNCaWcnKS5pbm5lckhUTUwgPSB0YWJzTGlzdC5tYXAoKFtrLCBuLCBzdWIsIGljXSkgPT4gYDxidXR0b24gY2xhc3M9InRiIHRiLSR7a30iIGRhdGEtdGFiMj0iJHtrfSIgYXJpYS1wcmVzc2VkPSIke3VpLnRhYiA9PT0ga30iPjxzcGFuIGNsYXNzPSJ0Yi1pYyI+JHtpY308L3NwYW4+PHNwYW4+PGI+JHtpblRhYihrKS5sZW5ndGh9PC9iPjxzcGFuIGNsYXNzPSJ0Yi1uIj4ke259PC9zcGFuPjxzbWFsbD4ke3N1Yn08L3NtYWxsPjwvc3Bhbj48L2J1dHRvbj5gKS5qb2luKCcnKTsKICBjb25zdCBta0NvdW50ID0gbWsgPT4gb3JkZXJzLmZpbHRlcihvID0+IGluVGFiRm4obywgdWkudGFiKSAmJiBta01hdGNoKG8sIG1rKSkubGVuZ3RoOwogICQoJyNta0NoaXBzJykuaW5uZXJIVE1MID0gW1snYWxsJywgJ1RvZG9zJ10sIFsnbWwnLCAnTWVyY2FkbyBMaWJyZSddLCBbJ21sLWFnZW5jaWEnLCAnTWVyY2FkbyBMaWJyZSBBZ2VuY2lhJ10sIFsnbWwtZmxleCcsICdNZXJjYWRvIExpYnJlIEZsZXgnXSwgWydmYScsICdGYWxhYmVsbGEnXSwgWydwYScsICdQYXJpcyddXS5tYXAoKFtrLCBuXSkgPT4gYDxidXR0b24gY2xhc3M9ImNoaXAiIGRhdGEtbWs9IiR7a30iIGFyaWEtcHJlc3NlZD0iJHt1aS5tayA9PT0ga30iPiR7bn0gPHNwYW4gY2xhc3M9ImNudCI+JHtta0NvdW50KGspfTwvc3Bhbj48L2J1dHRvbj5gKS5qb2luKCcnKTsKICBjb25zdCBicCA9ICQoJyNicEZpbHRlcicpOwogIGlmIChicCkgewogICAgYnAuaGlkZGVuID0gIVsnYmxvY2tlZFByaW50ZWQnLCAnYmxvY2tlZCcsICd1bmJsb2NrZWQnXS5pbmNsdWRlcyh1aS50YWIpOwogICAgaWYgKHVpLnRhYiA9PT0gJ3VuYmxvY2tlZCcpIHsKICAgICAgLy8gRGVzYmxvcXVlYWRhczogc2VwYXJhciBsYXMgcXVlIHNlIGRlc3BhY2hhbiBob3kgZGUgbGFzIGRlIHByw7N4aW1vcyBkw61hcyAocGFyYSB0b2RvcyBsb3MgdXN1YXJpb3MpCiAgICAgIGNvbnN0IGJhc2UgPSB2aXNpYmxlSW4oJ3VuYmxvY2tlZCcpLCBuVG9kYXkgPSBiYXNlLmZpbHRlcihpc0ZvclRvZGF5KS5sZW5ndGg7CiAgICAgIGNvbnN0IGJ5RGF5ID0gYmFzZS5maWx0ZXIobyA9PiB1aS51ZGYgPT09ICdhbGwnIHx8ICh1aS51ZGYgPT09ICd0b2RheScpID09PSBpc0ZvclRvZGF5KG8pKSwgbkZpbGwgPSBieURheS5maWx0ZXIobyA9PiBicEtpbmQobykgPT09ICdmaWxsJykubGVuZ3RoOwogICAgICBicC5pbm5lckhUTUwgPSBgPHNwYW4gY2xhc3M9ImJwZi10Ij5EZXNwYWNobzo8L3NwYW4+YCArIFtbJ2FsbCcsICdUb2RhcycsIGJhc2UubGVuZ3RoXSwgWyd0b2RheScsICdEZXNwYWNoYXIgaG95JywgblRvZGF5XSwgWyduZXh0JywgJ1Byw7N4aW1vcyBkw61hcycsIGJhc2UubGVuZ3RoIC0gblRvZGF5XV0KICAgICAgICAubWFwKChbaywgbiwgY10pID0+IGA8YnV0dG9uIGNsYXNzPSJjaGlwICR7ayA9PT0gJ3RvZGF5JyA/ICdjaGlwLWZpbGwnIDogJyd9IiBkYXRhLXVkZj0iJHtrfSIgYXJpYS1wcmVzc2VkPSIke3VpLnVkZiA9PT0ga30iPiR7bn0gPHNwYW4gY2xhc3M9ImNudCI+JHtjfTwvc3Bhbj48L2J1dHRvbj5gKS5qb2luKCcnKSArCiAgICAgICAgYDxzcGFuIGNsYXNzPSJicGYtc2VwIj48L3NwYW4+PHNwYW4gY2xhc3M9ImJwZi10Ij5GdWxmaWxsbWVudDo8L3NwYW4+YCArIFtbJ2FsbCcsICdUb2RhcycsIGJ5RGF5Lmxlbmd0aF0sIFsnZmlsbCcsICdEZWJlIHJlbGxlbmFyJywgbkZpbGxdLCBbJ25vbmUnLCAnTmFkYSBwYXJhIHJlbGxlbmFyJywgYnlEYXkubGVuZ3RoIC0gbkZpbGxdXQogICAgICAgIC5tYXAoKFtrLCBuLCBjXSkgPT4gYDxidXR0b24gY2xhc3M9ImNoaXAgJHtrID09PSAnZmlsbCcgPyAnY2hpcC1maWxsJyA6ICcnfSIgZGF0YS11YmY9IiR7a30iIGFyaWEtcHJlc3NlZD0iJHt1aS51YmYgPT09IGt9Ij4ke259IDxzcGFuIGNsYXNzPSJjbnQiPiR7Y308L3NwYW4+PC9idXR0b24+YCkuam9pbignJyk7CiAgICAgIGJwLm9uY2xpY2sgPSBlID0+IHsgY29uc3QgYiA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLXVkZl0sW2RhdGEtdWJmXScpOyBpZiAoIWIpIHJldHVybjsgaWYgKGIuZGF0YXNldC51ZGYpIHVpLnVkZiA9IGIuZGF0YXNldC51ZGY7IGVsc2UgdWkudWJmID0gYi5kYXRhc2V0LnViZjsgZHJhd1Jvd3MoKTsgfTsKICAgIH0gZWxzZSBpZiAodWkudGFiID09PSAnYmxvY2tlZCcpIHsKICAgICAgLy8gQmxvcXVlYWRhczogc2VwYXJhciBsYXMgcXVlIHNlIGRlc3BhY2hhbiBob3kgZGUgbGFzIGRlIHByw7N4aW1vcyBkw61hcwogICAgICBjb25zdCBiYXNlID0gdmlzaWJsZUluKCdibG9ja2VkJyksIG5Ub2RheSA9IGJhc2UuZmlsdGVyKGlzRm9yVG9kYXkpLmxlbmd0aDsKICAgICAgY29uc3QgYnlEYXkgPSBiYXNlLmZpbHRlcihvID0+IHVpLmJkZiA9PT0gJ2FsbCcgfHwgKHVpLmJkZiA9PT0gJ3RvZGF5JykgPT09IGlzRm9yVG9kYXkobykpLCBuRmlsbCA9IGJ5RGF5LmZpbHRlcihvID0+IGJwS2luZChvKSA9PT0gJ2ZpbGwnKS5sZW5ndGg7CiAgICAgIGJwLmlubmVySFRNTCA9IGA8c3BhbiBjbGFzcz0iYnBmLXQiPkRlc3BhY2hvOjwvc3Bhbj5gICsgW1snYWxsJywgJ1RvZGFzJywgYmFzZS5sZW5ndGhdLCBbJ3RvZGF5JywgJ0Rlc3BhY2hhciBob3knLCBuVG9kYXldLCBbJ25leHQnLCAnUHLDs3hpbW9zIGTDrWFzJywgYmFzZS5sZW5ndGggLSBuVG9kYXldXQogICAgICAgIC5tYXAoKFtrLCBuLCBjXSkgPT4gYDxidXR0b24gY2xhc3M9ImNoaXAgJHtrID09PSAndG9kYXknID8gJ2NoaXAtZmlsbCcgOiAnJ30iIGRhdGEtYmRmPSIke2t9IiBhcmlhLXByZXNzZWQ9IiR7dWkuYmRmID09PSBrfSI+JHtufSA8c3BhbiBjbGFzcz0iY250Ij4ke2N9PC9zcGFuPjwvYnV0dG9uPmApLmpvaW4oJycpICsKICAgICAgICBgPHNwYW4gY2xhc3M9ImJwZi1zZXAiPjwvc3Bhbj48c3BhbiBjbGFzcz0iYnBmLXQiPkZ1bGZpbGxtZW50Ojwvc3Bhbj5gICsgW1snYWxsJywgJ1RvZGFzJywgYnlEYXkubGVuZ3RoXSwgWydmaWxsJywgJ0RlYmUgcmVsbGVuYXInLCBuRmlsbF0sIFsnbm9uZScsICdOYWRhIHBhcmEgZWwgZnVsZmlsbG1lbnQnLCBieURheS5sZW5ndGggLSBuRmlsbF1dCiAgICAgICAgLm1hcCgoW2ssIG4sIGNdKSA9PiBgPGJ1dHRvbiBjbGFzcz0iY2hpcCAke2sgPT09ICdmaWxsJyA/ICdjaGlwLWZpbGwnIDogJyd9IiBkYXRhLWJiZj0iJHtrfSIgYXJpYS1wcmVzc2VkPSIke3VpLmJiZiA9PT0ga30iPiR7bn0gPHNwYW4gY2xhc3M9ImNudCI+JHtjfTwvc3Bhbj48L2J1dHRvbj5gKS5qb2luKCcnKTsKICAgICAgYnAub25jbGljayA9IGUgPT4geyBjb25zdCBiID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtYmRmXSxbZGF0YS1iYmZdJyk7IGlmICghYikgcmV0dXJuOyBpZiAoYi5kYXRhc2V0LmJkZikgdWkuYmRmID0gYi5kYXRhc2V0LmJkZjsgZWxzZSB1aS5iYmYgPSBiLmRhdGFzZXQuYmJmOyBkcmF3Um93cygpOyB9OwogICAgfSBlbHNlIGlmICghYnAuaGlkZGVuKSB7CiAgICAgIGNvbnN0IGJhc2UgPSB2aXNpYmxlSW4oJ2Jsb2NrZWRQcmludGVkJyksIG5GaWxsID0gYmFzZS5maWx0ZXIobyA9PiBicEtpbmQobykgPT09ICdmaWxsJykubGVuZ3RoOwogICAgICBicC5pbm5lckhUTUwgPSBgPHNwYW4gY2xhc3M9ImJwZi10Ij5Nb3N0cmFyOjwvc3Bhbj5gICsgW1snYWxsJywgJ1RvZGFzJywgYmFzZS5sZW5ndGhdLCBbJ2ZpbGwnLCAnRWwgZnVsZmlsbG1lbnQgZGViZSByZWxsZW5hcicsIG5GaWxsXSwgWydub25lJywgJ05hZGEgcGFyYSBlbCBmdWxmaWxsbWVudCcsIGJhc2UubGVuZ3RoIC0gbkZpbGxdXQogICAgICAgIC5tYXAoKFtrLCBuLCBjXSkgPT4gYDxidXR0b24gY2xhc3M9ImNoaXAgJHtrID09PSAnZmlsbCcgPyAnY2hpcC1maWxsJyA6ICcnfSIgZGF0YS1icGY9IiR7a30iIGFyaWEtcHJlc3NlZD0iJHt1aS5icGYgPT09IGt9Ij4ke259IDxzcGFuIGNsYXNzPSJjbnQiPiR7Y308L3NwYW4+PC9idXR0b24+YCkuam9pbignJyk7CiAgICAgIGJwLm9uY2xpY2sgPSBlID0+IHsgY29uc3QgYiA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLWJwZl0nKTsgaWYgKCFiKSByZXR1cm47IHVpLmJwZiA9IGIuZGF0YXNldC5icGY7IGRyYXdSb3dzKCk7IH07CiAgICB9CiAgfQogIGNvbnN0IHJvd3MgPSB2aXNpYmxlKCk7CiAgaWYgKCFyb3dzLmxlbmd0aCkgewogICAgY29uc3QgbXNnID0geyB0b2RheTogJ05vIGhheSBldGlxdWV0YXMgcG9yIGltcHJpbWlyIHBhcmEgaG95LiBMYXMgdmVudGFzIG51ZXZhcyAoeSBsb3MgRmxleCBxdWUgZW50cmVuIGR1cmFudGUgZWwgZMOtYSkgYXBhcmVjZW4gYXF1w60gc29sYXMuJywgdXBjb21pbmc6ICdObyBoYXkgZXRpcXVldGFzIHBhcmEgbG9zIHByw7N4aW1vcyBkw61hcy4nLCB3YWl0aW5nOiAnTmluZ3VuYSB2ZW50YSBlc3TDoSBlc3BlcmFuZG8gZXRpcXVldGEuJywgcHJpbnRlZDogJ1RvZGF2w61hIG5vIGhheSBldGlxdWV0YXMgaW1wcmVzYXMgcGFyYSBlc3RlIGRlc3BhY2hvLicsIGJsb2NrZWQ6ICdObyBoYXkgcGVkaWRvcyBibG9xdWVhZG9zLicsIHVuYmxvY2tlZDogJ05vIGhheSBldGlxdWV0YXMgZGVzYmxvcXVlYWRhcyBwZW5kaWVudGVzLiBDdWFuZG8gZGVzYmxvcXVlZXMgdW5hLCBhcGFyZWNlIGFxdcOtIGhhc3RhIHF1ZSBzZSBpbXByaW1hLicsIHdlZWs6ICdFc3RhIHNlbWFuYSBhw7puIG5vIHNlIGltcHJpbWVuIGV0aXF1ZXRhcy4nLCBibG9ja2VkUHJpbnRlZDogJ05vIGhheSBldGlxdWV0YXMgYmxvcXVlYWRhcyBpbXByZXNhcyBwYXJhIGVzdGUgZGVzcGFjaG8uJywgcHJpbnRlZDc6ICdObyBoYXkgZXRpcXVldGFzIGltcHJlc2FzIGVuIGxvcyDDumx0aW1vcyA3IGTDrWFzLicsIHRyYW5zaXQ6ICdObyBoYXkgcGFxdWV0ZXMgZW4gY2FtaW5vOiB0b2RvIGxvIGltcHJlc28geWEgZnVlIHJlY2VwY2lvbmFkbyBvIGVudHJlZ2Fkby4nLCBsYXRlOiAnTm8gaGF5IHBhcXVldGVzIGF0cmFzYWRvcy4gQXF1w60gYXBhcmVjZW4gbG9zIHF1ZSBubyBzYWxpZXJvbiBhbnRlcyBkZWwgaG9yYXJpbyBkZWwgbWFya2V0cGxhY2UuJyB9W3VpLnRhYl07CiAgICAkKCcjbGlzdCcpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJlbXB0eSI+JHtFTVBUWV9TVkd9PGRpdj4ke21zZ308L2Rpdj48L2Rpdj5gOwogICAgZHJhd0FjdGlvbmJhcigpOyByZXR1cm47CiAgfQogIGxldCBsYXN0RGF5ID0gJycsIGh0bWwgPSAnJzsKICBmb3IgKGNvbnN0IG8gb2Ygcm93cykgewogICAgY29uc3QgZCA9IHRzKG8pLCBkYXkgPSBkYXlMYWJlbChkKTsKICAgIGlmIChkYXkgIT09IGxhc3REYXkpIHsgaHRtbCArPSBgPGRpdiBjbGFzcz0iZGF5aGVhZCI+JHtlc2MoZGF5KX08L2Rpdj5gOyBsYXN0RGF5ID0gZGF5OyB9CiAgICBjb25zdCBzdCA9IG8uc3RhdGU7CiAgICBsZXQgbm90ZSA9ICcnLCBidG4gPSAnJzsKICAgIGNvbnN0IG1pbmUgPSBvLm93biAhPT0gZmFsc2U7CiAgICBpZiAoc3QgPT09ICdyZWFkeScpIGJ0biA9IGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIGRhdGEtYWN0PSJwcmludCIgZGF0YS1pZD0iJHtvLmlkfSI+JHtJLnByaW50fUltcHJpbWlyPC9idXR0b24+YDsKICAgIGlmIChzdCA9PT0gJ3ByaW50ZWQnKSB7IG5vdGUgPSBgPHNwYW4gY2xhc3M9Im5vdGUiPkltcHJlc2EgJHtlc2MoZm10VGltZShvLnByaW50ZWRfYXQpKX0ke28ucHJpbnRlZF9ieSA/IGAgwrcgPGI+SW1wcmltacOzOiAke2VzYyhvLnByaW50ZWRfYnkpfTwvYj5gIDogJyd9PC9zcGFuPmA7IGJ0biA9IGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXJlcHJpbnQiIGRhdGEtYWN0PSJyZXByaW50IiBkYXRhLWlkPSIke28uaWR9Ij4ke0kucHJpbnR9Vm9sdmVyIGEgaW1wcmltaXI8L2J1dHRvbj5gICsgKG1pbmUgPyBgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1hY3Q9InVucHJpbnQiIGRhdGEtaWQ9IiR7by5pZH0iPk1hcmNhciBjb21vIG5vIGltcHJlc2E8L2J1dHRvbj5gIDogJycpOyB9CiAgICBpZiAoc3QgPT09ICdzaGlwcGVkJykgbm90ZSA9IGA8c3BhbiBjbGFzcz0ibm90ZSI+WWEgc2FsacOzIMK3IDxiPkltcHJpbWnDszogJHtlc2Moby5wcmludGVkX2J5IHx8ICdNYXJrZXRwbGFjZScpfTwvYj48L3NwYW4+YDsKICAgIGlmIChzdCA9PT0gJ3dhaXRpbmcnIHx8IHN0ID09PSAnZXJyb3InKSB7IG5vdGUgPSBgPHNwYW4gY2xhc3M9Im5vdGUgJHtzdCA9PT0gJ2Vycm9yJyA/ICdiYWQnIDogJyd9Ij4ke2VzYyhvLmVycm9yIHx8IG8ud2FpdGluZ19ub3RlIHx8ICdFbCBtYXJrZXRwbGFjZSBhw7puIG5vIGxpYmVyYSBsYSBldGlxdWV0YScpfTwvc3Bhbj5gOyBidG4gPSBgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1hY3Q9InJldHJ5IiBkYXRhLWlkPSIke28uaWR9Ij5SZWludGVudGFyPC9idXR0b24+YDsgfQogICAgY29uc3Qgbm9uZUZvckZmID0gKG8ubWlzc2luZ19pZHggfHwgW10pLmxlbmd0aCA+IDAgJiYgKG8ubWlzc2luZ19pZHggfHwgW10pLmxlbmd0aCA+PSBvLml0ZW1zLmxlbmd0aDsKICAgIGlmIChzdCA9PT0gJ2Jsb2NrZWQnKSB7IG5vdGUgPSBub25lRm9yRmYgPyAnPHNwYW4gY2xhc3M9Im5vcHJpbnQiPlJPTkcgWElOIE5PIElNUFJJTUlSIEVUSVFVRVRBPC9zcGFuPicgOiAnPHNwYW4gY2xhc3M9Im5vdGUiPlRpZW5lIHByb2R1Y3RvcyBxdWUgbm8gdmFuIGFsIGZ1bGZpbGxtZW50OiBtYW5kYSBzb2xvIGxvcyBtYXJjYWRvcyBlbiB2ZXJkZTwvc3Bhbj4nOyBpZiAobWluZSkgYnRuID0gYDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgZGF0YS1hY3Q9InVuYmxvY2siIGRhdGEtaWQ9IiR7by5pZH0iPiR7SS5sb2NrfURlc2Jsb3F1ZWFyIGV0aXF1ZXRhPC9idXR0b24+YDsgfQogICAgaWYgKG8udW5ibG9ja2VkX2J5ICYmIG8uYmxvY2tfbm8gJiYgc3QgIT09ICdibG9ja2VkJykgewogICAgICBub3RlICs9IGA8c3BhbiBjbGFzcz0ibm90ZSI+PGI+UGVkaWRvIGluY29tcGxldG88L2I+OiBlbCBmdWxmaWxsbWVudCBtYW5kYSBsbyBzdXlvIHkgc2UgcmVsbGVuYSBsbyBtYXJjYWRvICJGQUxUQSIgwrcgRGVzYmxvcXVlw7M6ICR7ZXNjKG8udW5ibG9ja2VkX2J5KX08L3NwYW4+YDsKICAgICAgaWYgKG1pbmUgJiYgWydyZWFkeScsICd3YWl0aW5nJywgJ2Vycm9yJ10uaW5jbHVkZXMoc3QpKSBidG4gKz0gYDxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtYWN0PSJyZWJsb2NrIiBkYXRhLWlkPSIke28uaWR9Ij5Wb2x2ZXIgYSBibG9xdWVhcjwvYnV0dG9uPmA7CiAgICB9CiAgICBpZiAoby5wcmV2X3ByaW50ICYmIG8ucHJldl9wcmludC5hdCkgbm90ZSArPSBgPHNwYW4gY2xhc3M9Im5vdGUgcHJldnByaW50Ij7ihrogWWEgZnVlIGltcHJlc2EgcG9yIDxiPiR7ZXNjKG8ucHJldl9wcmludC5ieSB8fCAnYWxndWllbicpfTwvYj4gZWwgJHtlc2MoZm10VGltZShvLnByZXZfcHJpbnQuYXQpKX08L3NwYW4+YDsKICAgIGlmIChvLm1sX2Rvd25sb2FkZWQpIG5vdGUgKz0gJzxzcGFuIGNsYXNzPSJub3RlIiB0aXRsZT0iTWVyY2FkbyBMaWJyZSBpbmRpY2EgcXVlIGxhIGV0aXF1ZXRhIHlhIHNlIGRlc2NhcmfDsyAoZGVzZGUgTWVyY2FkbyBMaWJyZSB1IG90cmEgaGVycmFtaWVudGEpLiBFbiBFdGlxdWV0YUh1YiBzaWd1ZSBwb3IgaW1wcmltaXIuIj7ik5ggRGVzY2FyZ2FkYSBlbiBNZXJjYWRvIExpYnJlPC9zcGFuPic7CiAgICBpZiAoby5sYXRlKSBub3RlID0gYDxzcGFuIGNsYXNzPSJsYXRldGFnIj5BVFJBU0FEQSR7by5sYXRlX21sID8gJyDCtyBNZXJjYWRvIExpYnJlIGxhIG1hcmNhIGF0cmFzYWRhJyA6ICcnfSR7by5kZWFkbGluZSA/ICcgwrcgcGxhem8gJyArIGVzYyhmbXRUaW1lKG8uZGVhZGxpbmUpKSA6ICcnfTwvc3Bhbj5gICsgbm90ZTsKICAgIGh0bWwgKz0gYDxkaXYgY2xhc3M9Im9yb3cgc3QtJHtzdH0gJHtmcmVzaC5pbmNsdWRlcyhvLmlkKSA/ICdpcy1uZXcnIDogJyd9Ij4KICAgICAgPGRpdiBjbGFzcz0ib2MtY2hlY2siPiR7cHJpbnRhYmxlKG8pIHx8IChzdCA9PT0gJ3ByaW50ZWQnICYmIG8ub3duICE9PSBmYWxzZSkgPyBgPGlucHV0IHR5cGU9ImNoZWNrYm94IiBjbGFzcz0iY2IiIGRhdGEtaWQ9IiR7by5pZH0iICR7c2VsZWN0ZWQuaGFzKG8uaWQpID8gJ2NoZWNrZWQnIDogJyd9IGFyaWEtbGFiZWw9IlNlbGVjY2lvbmFyICR7ZXNjKG8ub3JkZXJfbnVtYmVyKX0iPmAgOiBzdCA9PT0gJ2Jsb2NrZWQnID8gKG1pbmUgPyBgPGlucHV0IHR5cGU9ImNoZWNrYm94IiBjbGFzcz0iY2IiIGRhdGEtaWQ9IiR7by5pZH0iICR7c2VsZWN0ZWQuaGFzKG8uaWQpID8gJ2NoZWNrZWQnIDogJyd9IGFyaWEtbGFiZWw9IlNlbGVjY2lvbmFyICR7ZXNjKG8ub3JkZXJfbnVtYmVyKX0gcGFyYSBkZXNibG9xdWVhciI+YCA6IGA8c3BhbiBjbGFzcz0ibG9ja2NlbGwiPiR7SS5sb2NrfTwvc3Bhbj5gKSA6ICcnfTwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJvYy10aW1lIj48Yj4ke2VzYyhhbXBtKGQpKX08L2I+PHNwYW4gY2xhc3M9Im1rICR7by5tYXJrZXRwbGFjZX0iPiR7TUtbby5tYXJrZXRwbGFjZV0gfHwgby5tYXJrZXRwbGFjZX08L3NwYW4+JHtvLnNoaXBfdHlwZSA/IGA8c3BhbiBjbGFzcz0ic2hpcHR5cGUgc3QtJHtlc2Moby5zaGlwX3R5cGUudG9Mb3dlckNhc2UoKSl9Ij4ke2VzYyhvLnNoaXBfdHlwZSl9PC9zcGFuPmAgOiAnJ308L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0ib2MtbWFpbiI+JHtbJ3JlYWR5JywgJ3dhaXRpbmcnLCAnZXJyb3InXS5pbmNsdWRlcyhzdCkgJiYgZGlzcGF0Y2hUZXh0KG8pID8gYDxkaXYgY2xhc3M9ImRpc3BhdGNoICR7ZGlzcGF0Y2hUZXh0KG8pLnN0YXJ0c1dpdGgoJ0F0cmFzYWRhJykgPyAnbGF0ZScgOiAnJ30iPiR7ZXNjKGRpc3BhdGNoVGV4dChvKSl9PC9kaXY+YCA6IGRpc3BhdGNoUGxhaW4obykgPyBgPGRpdiBjbGFzcz0iZGlzcGF0Y2ggZG9uZSI+JHtlc2MoZGlzcGF0Y2hQbGFpbihvKSl9PC9kaXY+YCA6ICcnfTxkaXYgY2xhc3M9Im9jLXRvcCI+JHtvLmJsb2NrX25vID8gYDxzcGFuIGNsYXNzPSJibG9ja25vIiB0aXRsZT0iTsO6bWVybyBkZWwgcGVkaWRvIGluY29tcGxldG8iPk7CsCAke28uYmxvY2tfbm99PC9zcGFuPmAgOiAnJ30ke28uY3VzdG9tZXIgPyBgPHNwYW4gY2xhc3M9ImN1c3QiPiR7ZXNjKG8uY3VzdG9tZXIpfTwvc3Bhbj5gIDogJyd9PGI+JHtlc2Moby5zZWxsZXIpfTwvYj4gPHNwYW4gY2xhc3M9Im1vbm8gbXV0ZWQiPiMke2VzYyhvLm9yZGVyX251bWJlcil9PC9zcGFuPjwvZGl2PiR7aXRlbXNIVE1MKG8pfSR7bm90ZX08L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0ib2MtYWN0Ij4ke3BpbGwobyl9PGRpdiBjbGFzcz0icm93LWFjdGlvbnMiPiR7YnRufSR7by50cmFja191cmwgPyBgPGEgY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGhyZWY9IiR7ZXNjKG8udHJhY2tfdXJsKX0iIHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIj5TZWd1aXIgZW52w61vPC9hPmAgOiAnJ308L2Rpdj4ke28udHJhY2tpbmcgPyBgPHNwYW4gY2xhc3M9Im5vdGUgbW9ubyI+TsKwIHNlZ3VpbWllbnRvICR7ZXNjKG8udHJhY2tpbmcpfTwvc3Bhbj5gIDogJyd9PC9kaXY+CiAgICA8L2Rpdj5gOwogIH0KICAkKCcjbGlzdCcpLmlubmVySFRNTCA9IGh0bWw7CiAgZHJhd0FjdGlvbmJhcigpOwp9CmZ1bmN0aW9uIGRyYXdBY3Rpb25iYXIoKSB7CiAgY29uc3QgYWIgPSAkKCcjYWN0aW9uYmFyJyk7IGlmICghYWIpIHJldHVybjsKICBjb25zdCBQUklOVEVEX1RBQlMgPSBbJ3ByaW50ZWQnLCAndHJhbnNpdCcsICdibG9ja2VkUHJpbnRlZCcsICdwcmludGVkNycsICdsYXRlJ107CiAgaWYgKFBSSU5URURfVEFCUy5pbmNsdWRlcyh1aS50YWIpKSB7CiAgICAvLyBlbiBsYXMgc2VjY2lvbmVzIGRlIGltcHJlc2FzOiBtYXJjYXIgdmFyaWFzIGEgbGEgdmV6IGNvbW8gIm5vIGltcHJlc2FzIgogICAgY29uc3QgbiA9IHZpc2libGVJbih1aS50YWIpLmZpbHRlcihvID0+IG8uc3RhdGUgPT09ICdwcmludGVkJyAmJiBvLm93biAhPT0gZmFsc2UpLmxlbmd0aCwgcyA9IFsuLi5zZWxlY3RlZF0uZmlsdGVyKGlkID0+IG9yZGVycy5maW5kKG8gPT4gby5pZCA9PT0gaWQgJiYgby5zdGF0ZSA9PT0gJ3ByaW50ZWQnKSkubGVuZ3RoOwogICAgYWIuaGlkZGVuID0gIW47CiAgICBhYi5pbm5lckhUTUwgPSBuID8gYDxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSIgZGF0YS1idWxrPSJ1bnByaW50IiAke3MgPyAnJyA6ICdkaXNhYmxlZCd9Pk1hcmNhciBzZWxlY2Npb25hZGFzIGNvbW8gbm8gaW1wcmVzYXMgKCR7c30pPC9idXR0b24+CiAgICAgIDxzcGFuIGNsYXNzPSJzcGFjZXIiIHN0eWxlPSJmbGV4OjEiPjwvc3Bhbj4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1idWxrPSJzZWxhbGwiPlNlbGVjY2lvbmFyIHRvZGFzPC9idXR0b24+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1idWxrPSJub25lIj5RdWl0YXIgc2VsZWNjacOzbjwvYnV0dG9uPmAgOiAnJzsKICAgIHJldHVybjsKICB9CiAgaWYgKHVpLnRhYiA9PT0gJ2Jsb2NrZWQnKSB7CiAgICAvLyBkZXNibG9xdWVhciB2YXJpYXMgYSBsYSB2ZXogKHJlc3BldGEgbG9zIGZpbHRyb3MgZGUgbWFya2V0cGxhY2UsIHZlbmRlZG9yIHkgYsO6c3F1ZWRhKQogICAgY29uc3QgbiA9IHZpc2libGUoKS5maWx0ZXIobyA9PiBvLnN0YXRlID09PSAnYmxvY2tlZCcgJiYgby5vd24gIT09IGZhbHNlKS5sZW5ndGgsIHMgPSBbLi4uc2VsZWN0ZWRdLmZpbHRlcihpZCA9PiBvcmRlcnMuZmluZChvID0+IG8uaWQgPT09IGlkICYmIG8uc3RhdGUgPT09ICdibG9ja2VkJykpLmxlbmd0aDsKICAgIGFiLmhpZGRlbiA9ICFuOwogICAgYWIuaW5uZXJIVE1MID0gbiA/IGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIGRhdGEtYnVsaz0idW5ibG9jayIgJHtzID8gJycgOiAnZGlzYWJsZWQnfT4ke0kubG9ja31EZXNibG9xdWVhciBzZWxlY2Npb25hZGFzICgke3N9KTwvYnV0dG9uPgogICAgICA8c3BhbiBjbGFzcz0ic3BhY2VyIiBzdHlsZT0iZmxleDoxIj48L3NwYW4+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtYnVsaz0ic2VsYWxsIj5TZWxlY2Npb25hciB0b2RhcyAoJHtufSk8L2J1dHRvbj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWJ1bGs9Im5vbmUiPlF1aXRhciBzZWxlY2Npw7NuPC9idXR0b24+YCA6ICcnOwogICAgcmV0dXJuOwogIH0KICBpZiAoIVsndG9kYXknLCAndXBjb21pbmcnLCAndW5ibG9ja2VkJ10uaW5jbHVkZXModWkudGFiKSkgeyBhYi5pbm5lckhUTUwgPSAnJzsgYWIuaGlkZGVuID0gdHJ1ZTsgcmV0dXJuOyB9CiAgYWIuaGlkZGVuID0gZmFsc2U7CiAgLy8gdG9kb3MgbG9zIHVzdWFyaW9zIHRpZW5lbiBsb3MgbWlzbW9zIGJvdG9uZXMgKGVsIHZlbmRlZG9yIHNvbG8gaW1wcmltZSBsYXMgc3V5YXMpCiAgY29uc3QgbiA9IHZpc2libGUoKS5maWx0ZXIocHJpbnRhYmxlKS5sZW5ndGgsIHMgPSBbLi4uc2VsZWN0ZWRdLmZpbHRlcihpZCA9PiBvcmRlcnMuc29tZShvID0+IG8uaWQgPT09IGlkICYmIHByaW50YWJsZShvKSkpLmxlbmd0aDsKICBhYi5pbm5lckhUTUwgPSBgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiBkYXRhLWJ1bGs9ImFsbCIgJHtuID8gJycgOiAnZGlzYWJsZWQnfT4ke0kuZG93bn1JbXByaW1pciB0b2RhcyAoJHtufSk8L2J1dHRvbj4KICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSIgZGF0YS1idWxrPSJzZWwiICR7cyA/ICcnIDogJ2Rpc2FibGVkJ30+SW1wcmltaXIgc2VsZWNjaW9uYWRhcyAoJHtzfSk8L2J1dHRvbj4KICAgIDxzcGFuIGNsYXNzPSJzcGFjZXIiIHN0eWxlPSJmbGV4OjEiPjwvc3Bhbj4KICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtYnVsaz0ic2VsYWxsIj5TZWxlY2Npb25hciB0b2RhczwvYnV0dG9uPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtYnVsaz0ibm9uZSI+UXVpdGFyIHNlbGVjY2nDs248L2J1dHRvbj5gOwp9CmZ1bmN0aW9uIHVwZGF0ZVNlbCgpIHsgZHJhd0FjdGlvbmJhcigpOyB9Ci8vIGV0aXF1ZXRhcyBxdWUgZXN0ZSB1c3VhcmlvIHB1ZWRlIGltcHJpbWlyIGRlIHVuYSB2ZXoKZnVuY3Rpb24gcHJpbnRhYmxlKG8pIHsgcmV0dXJuIG8uc3RhdGUgPT09ICdyZWFkeScgJiYgKG1lLnVzZXIucm9sZSAhPT0gJ3NlbGxlcicgfHwgby5vd24gIT09IGZhbHNlKTsgfQpmdW5jdGlvbiBzZWxsZXJPa1RvUHJpbnQobikgeyByZXR1cm4gbWUudXNlci5yb2xlICE9PSAnc2VsbGVyJyB8fCBjb25maXJtKGBTaSBsYXMgaW1wcmltZXMgdMO6LCAke24gPT09IDEgPyAncXVlZGEnIDogJ3F1ZWRhbid9IGNvbW8gJHtuID09PSAxID8gJ2ltcHJlc2EnIDogJ2ltcHJlc2FzJ30gcG9yIHR1IHRpZW5kYSB5IGVsIGZ1bGZpbGxtZW50ICR7biA9PT0gMSA/ICdsYScgOiAnbGFzJ30gdmVyw6EgZW4gcm9qbyBjb21vICJFdGlxdWV0YSBpbXByZXNhIi4gwr9JbXByaW1pciAke259P2ApOyB9Ci8vIGFjdHVhbGl6YSBsYSBwYW50YWxsYSBhbCB0aXJvLCBzaW4gZXNwZXJhciBhIHF1ZSBlbCBzZXJ2aWRvciBtYW5kZSBsYSBsaXN0YSBudWV2YQpmdW5jdGlvbiBtYXJrVW5ibG9ja2VkKGlkcykgewogIGNvbnN0IHdobyA9IG1lLnVzZXIucm9sZSA9PT0gJ2FkbWluJyA/ICdBZG1pbmlzdHJhZG9yJyA6IChtZS51c2VyLm5hbWUgfHwgJ1TDuicpOwogIGZvciAoY29uc3QgbyBvZiBvcmRlcnMpIGlmIChpZHMuaW5jbHVkZXMoby5pZCkgJiYgby5zdGF0ZSA9PT0gJ2Jsb2NrZWQnKSB7IG8uc3RhdGUgPSAncmVhZHknOyBvLnVuYmxvY2tlZF9ieSA9IG8udW5ibG9ja2VkX2J5IHx8IHdobzsgfQogIGRyYXdSb3dzKCk7Cn0KCmxldCBkb3dubG9hZGluZyA9IGZhbHNlOwovLyBwYW50YWxsYSBkZSAicHJvY2VzYW5kbyI6IHVuIHNvbCBhbmltYWRvIGFsIGNlbnRybyBxdWUgbm8gc2UgdmEgaGFzdGEgcXVlIHRlcm1pbmEgbGEgZGVzY2FyZ2EKZnVuY3Rpb24gc2hvd1N1bihuKSB7CiAgaGlkZVN1bih0cnVlKTsKICBjb25zdCBlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpOwogIGVsLmlkID0gJ3N1bkxvYWRlcic7IGVsLnNldEF0dHJpYnV0ZSgncm9sZScsICdzdGF0dXMnKTsgZWwuc2V0QXR0cmlidXRlKCdhcmlhLWxpdmUnLCAncG9saXRlJyk7CiAgY29uc3QgcmF5cyA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDEyIH0sIChfLCBpKSA9PiBgPHJlY3QgeD0iOTciIHk9IjgiIHdpZHRoPSI2IiBoZWlnaHQ9IjI2IiByeD0iMyIgdHJhbnNmb3JtPSJyb3RhdGUoJHtpICogMzB9IDEwMCAxMDApIi8+YCkuam9pbignJyk7CiAgZWwuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9InN1bi1jYXJkIj4KICAgIDxzdmcgY2xhc3M9InN1biIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGFyaWEtaGlkZGVuPSJ0cnVlIj4KICAgICAgPGRlZnM+PHJhZGlhbEdyYWRpZW50IGlkPSJzdW5HIiBjeD0iNTAlIiBjeT0iNDUlIiByPSI1NSUiPjxzdG9wIG9mZnNldD0iMCIgc3RvcC1jb2xvcj0iI0ZGRjNCMCIvPjxzdG9wIG9mZnNldD0iLjU1IiBzdG9wLWNvbG9yPSIjRkZDOTNDIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjRkY5RjFDIi8+PC9yYWRpYWxHcmFkaWVudD48L2RlZnM+CiAgICAgIDxnIGNsYXNzPSJzdW4tcmF5cyIgZmlsbD0iI0ZGQjYyNyI+JHtyYXlzfTwvZz4KICAgICAgPGNpcmNsZSBjbGFzcz0ic3VuLWdsb3ciIGN4PSIxMDAiIGN5PSIxMDAiIHI9IjU0IiBmaWxsPSIjRkZEMTY2IiBvcGFjaXR5PSIuMzUiLz4KICAgICAgPGNpcmNsZSBjeD0iMTAwIiBjeT0iMTAwIiByPSI0NCIgZmlsbD0idXJsKCNzdW5HKSIvPgogICAgICA8ZyBjbGFzcz0ic3VuLWZhY2UiIGZpbGw9IiM3QTRCMDAiPjxjaXJjbGUgY3g9Ijg1IiBjeT0iOTQiIHI9IjQuNSIvPjxjaXJjbGUgY3g9IjExNSIgY3k9Ijk0IiByPSI0LjUiLz48cGF0aCBkPSJNODQgMTEwIHExNiAxNCAzMiAwIiBzdHJva2U9IiM3QTRCMDAiIHN0cm9rZS13aWR0aD0iNCIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9nPgogICAgICA8Y2lyY2xlIGN4PSI3NCIgY3k9IjEwNiIgcj0iNiIgZmlsbD0iI0ZGOEM2OSIgb3BhY2l0eT0iLjQ1Ii8+PGNpcmNsZSBjeD0iMTI2IiBjeT0iMTA2IiByPSI2IiBmaWxsPSIjRkY4QzY5IiBvcGFjaXR5PSIuNDUiLz4KICAgIDwvc3ZnPgogICAgPHAgY2xhc3M9InN1bi1sMSI+wqFFcmVzIHVuIGdlbmlvLCB2YXMgbXV5IGJpZW4gaG95ITwvcD4KICAgIDxwIGNsYXNzPSJzdW4tbDIiPkVzdG95IHByb2Nlc2FuZG8gJHtuID4gMSA/IGB0dXMgPGI+JHtufTwvYj4gZXRpcXVldGFzYCA6ICd0dSBldGlxdWV0YSd9PHNwYW4gY2xhc3M9InN1bi1kb3RzIj48aT4uPC9pPjxpPi48L2k+PGk+LjwvaT48L3NwYW4+PC9wPgogICAgPHAgY2xhc3M9InN1bi1sMyI+UXVlIHRlbmdhcyB1biBsaW5kbyBkw61hIOKYgDwvcD4KICA8L2Rpdj5gOwogIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoZWwpOwogIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiBlbC5jbGFzc0xpc3QuYWRkKCdvbicpKTsKfQpmdW5jdGlvbiBoaWRlU3VuKG5vdykgewogIGNvbnN0IGVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N1bkxvYWRlcicpOyBpZiAoIWVsKSByZXR1cm47CiAgaWYgKG5vdykgeyBlbC5yZW1vdmUoKTsgcmV0dXJuOyB9CiAgZWwucXVlcnlTZWxlY3RvcignLnN1bi1sMicpLmlubmVySFRNTCA9ICfCoUxpc3RvISBUdXMgZXRpcXVldGFzIHNlIGRlc2Nhcmdhcm9uJzsKICBlbC5jbGFzc0xpc3QuYWRkKCdkb25lJyk7CiAgc2V0VGltZW91dCgoKSA9PiB7IGVsLmNsYXNzTGlzdC5yZW1vdmUoJ29uJyk7IHNldFRpbWVvdXQoKCkgPT4gZWwucmVtb3ZlKCksIDM1MCk7IH0sIDExMDApOwp9Cgphc3luYyBmdW5jdGlvbiBkb3dubG9hZEJhdGNoKGlkcywgeyBzaWxlbnQgPSBmYWxzZSB9ID0ge30pIHsKICBpZiAoIWlkcy5sZW5ndGggfHwgZG93bmxvYWRpbmcpIHJldHVybiAwOwogIGRvd25sb2FkaW5nID0gdHJ1ZTsKICBpZiAoIXNpbGVudCkgc2hvd1N1bihpZHMubGVuZ3RoKTsKICBsZXQgb2tEbCA9IGZhbHNlOwogIGNvbnN0IHJlYyA9IGF3YWl0IHJlY29yZE9yZGVycyhgSW1wcmltaXIgJHtpZHMubGVuZ3RofSBldGlxdWV0YSR7aWRzLmxlbmd0aCA9PT0gMSA/ICcnIDogJ3MnfWAsIGlkcyk7CiAgdHJ5IHsKICAgIGNvbnN0IHJlcyA9IGF3YWl0IHNhZmVGZXRjaCgnL2FwaS9sYWJlbHMvYmF0Y2gnLCB7IG1ldGhvZDogJ1BPU1QnLCBjcmVkZW50aWFsczogJ3NhbWUtb3JpZ2luJywgaGVhZGVyczogeyAnY29udGVudC10eXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0sIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgaWRzLCBtYXJrOiB0cnVlIH0pIH0pOwogICAgaWYgKCFyZXMub2spIHsgY29uc3QgZSA9IGF3YWl0IHJlcy5qc29uKCkuY2F0Y2goKCkgPT4gKHt9KSk7IHRocm93IG5ldyBFcnJvcihlLmVycm9yIHx8ICdObyBzZSBwdWRvIGRlc2NhcmdhcicpOyB9CiAgICBjb25zdCBibG9iID0gYXdhaXQgcmVzLmJsb2IoKTsKICAgIGNvbnN0IG5hbWUgPSAocmVzLmhlYWRlcnMuZ2V0KCdjb250ZW50LWRpc3Bvc2l0aW9uJykgfHwgJycpLm1hdGNoKC9maWxlbmFtZT0iKFteIl0rKSIvKT8uWzFdIHx8ICdldGlxdWV0YXMucGRmJzsKICAgIGNvbnN0IGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7IGEuaHJlZiA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7IGEuZG93bmxvYWQgPSBuYW1lOyBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGEpOyBhLmNsaWNrKCk7IGEucmVtb3ZlKCk7CiAgICBzZXRUaW1lb3V0KCgpID0+IFVSTC5yZXZva2VPYmplY3RVUkwoYS5ocmVmKSwgNjAwMDApOwogICAgb2tEbCA9IHRydWU7CiAgICBjb25zdCBuID0gK3Jlcy5oZWFkZXJzLmdldCgneC1sYWJlbC1jb3VudCcpIHx8IGlkcy5sZW5ndGg7CiAgICB0b2FzdChgJHtufSBldGlxdWV0YSR7biA9PT0gMSA/ICcnIDogJ3MnfSBkZXNjYXJnYWRhJHtuID09PSAxID8gJycgOiAncyd9IHkgbWFyY2FkYSR7biA9PT0gMSA/ICcnIDogJ3MnfSBjb21vIGltcHJlc2Eke24gPT09IDEgPyAnJyA6ICdzJ31gKTsKICAgIHNlbGVjdGVkLmNsZWFyKCk7CiAgICByZWMoKTsKICAgIHJldHVybiBuOwogIH0gY2F0Y2ggKGUpIHsgaWYgKCFzaWxlbnQpIHRvYXN0KGUubWVzc2FnZSwgNTAwMCk7IHJldHVybiAwOyB9CiAgZmluYWxseSB7IGhpZGVTdW4oIW9rRGwpOyBkb3dubG9hZGluZyA9IGZhbHNlOyBzZXRUaW1lb3V0KGxvYWRPcmRlcnMsIDQwMCk7IH0KfQovLyBsYSBkZXNjYXJnYSBhdXRvbcOhdGljYSBmdWUgZWxpbWluYWRhIHBvciBjb21wbGV0byAocGFyYSB0b2RvcyBsb3MgdXN1YXJpb3MpCnRyeSB7IGxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKCdlaDphdXRvJyk7IH0gY2F0Y2gge30KCi8vIC0tLS0tLS0tLS0gVkVOREVET1IgLS0tLS0tLS0tLQphc3luYyBmdW5jdGlvbiByZW5kZXJTZWxsZXIoKSB7CiAgY29uc3QgaXNBZG1pbiA9IG1lLnVzZXIucm9sZSA9PT0gJ2FkbWluJzsKICBsZXQgc2VsbGVyUGlja2VyID0gJyc7CiAgaWYgKGlzQWRtaW4pIHsKICAgIGNvbnN0IGQgPSBhd2FpdCBhcGkoJy9hcGkvYWRtaW4vc2VsbGVycycpOwogICAgc2VsbGVycyA9IGQuc2VsbGVyczsKICAgIGlmICghc2VsbGVycy5sZW5ndGgpIHsgJCgnI21haW4nKS5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz0ic2VjdGlvbi10aXRsZSI+PGgyPlZlbmRlZG9yZXM8L2gyPjwvZGl2PjxkaXYgY2xhc3M9InBhbmVsIj48ZGl2IGNsYXNzPSJlbXB0eSI+JHtFTVBUWV9TVkd9PGRpdj5QcmltZXJvIGNyZWEgbG9zIHZlbmRlZG9yZXMgZW4gbGEgcGVzdGHDsWEgVXN1YXJpb3MuPC9kaXY+PC9kaXY+PC9kaXY+YDsgcmV0dXJuOyB9CiAgICBpZiAoIXNlbGxlcnMuc29tZShzID0+IHMuaWQgPT09IHVpLmFkbWluU2VsbGVyKSkgdWkuYWRtaW5TZWxsZXIgPSBzZWxsZXJzWzBdLmlkOwogICAgc2VsbGVyUGlja2VyID0gYDxzZWxlY3QgaWQ9ImFkbWluU2VsbGVyIiBzdHlsZT0id2lkdGg6YXV0byI+JHtzZWxsZXJzLm1hcChzID0+IGA8b3B0aW9uIHZhbHVlPSIke3MuaWR9IiAke3MuaWQgPT09IHVpLmFkbWluU2VsbGVyID8gJ3NlbGVjdGVkJyA6ICcnfT4ke2VzYyhzLm5hbWUpfTwvb3B0aW9uPmApLmpvaW4oJycpfTwvc2VsZWN0PmA7CiAgfQogICQoJyNtYWluJykuaW5uZXJIVE1MID0gYAogIDxkaXYgY2xhc3M9InNlY3Rpb24tdGl0bGUiPjxoMj4ke2lzQWRtaW4gPyAnQ3VlbnRhIGRlbCB2ZW5kZWRvcicgOiAnTWlzIG1hcmtldHBsYWNlcyd9PC9oMj4ke3NlbGxlclBpY2tlcn08c3BhbiBjbGFzcz0ic3BhY2VyIiBzdHlsZT0iZmxleDoxIj48L3NwYW4+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1naG9zdCIgaWQ9InNTeW5jIj4ke0kuc3luY31TaW5jcm9uaXphciBhaG9yYTwvYnV0dG9uPjwvZGl2PgogIDxkaXYgY2xhc3M9ImNvbm4iIGlkPSJjb25uIj48L2Rpdj4KICA8ZGl2IGNsYXNzPSJncmlkMiI+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbCI+CiAgICAgIDxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj5Qcm9kdWN0b3MgcXVlIE5PIHZhbiBhbCBmdWxmaWxsbWVudDwvaDI+PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9InBhbmVsLWJvZHkgc3RhY2siPgogICAgICAgIDxkaXYgY2xhc3M9InJ1bGUiPiR7UlVMRV9TVkd9PHA+PGI+QmFzdGEgdW4gcHJvZHVjdG8gZGUgZXN0YSBsaXN0YSBwYXJhIGJsb3F1ZWFyIGVsIHBlZGlkbyBjb21wbGV0by48L2I+IEVsIGZ1bGZpbGxtZW50IGxvIHZlcsOhIGNvbiBjYW5kYWRvIHkgbm8gcG9kcsOhIGRlc2NhcmdhciBzdSBldGlxdWV0YS4gVXNhIGVsIElEIGRlIHB1YmxpY2FjacOzbiAoTUxD4oCmLCBJRCBkZSBGYWxhYmVsbGEsIFNLVSBNS+KApiBkZSBQYXJpcykgbyB0dSBTS1UgZGUgdmVuZGVkb3IuPC9wPjwvZGl2PgogICAgICAgIDxmb3JtIGNsYXNzPSJhZGRyb3ciIGlkPSJhZGRGb3JtIj4KICAgICAgICAgIDx0ZXh0YXJlYSBpZD0iYWRkVmFsIiByb3dzPSIyIiBwbGFjZWhvbGRlcj0iVW5vIG8gdmFyaW9zLCBzZXBhcmFkb3MgcG9yIGNvbWEgbyBzYWx0byBkZSBsw61uZWEmIzEwO0VqOiBNTEMxNDg3NzY1NDMyLCBMRU4tUE9MLTAxIiBhcmlhLWxhYmVsPSJJRHMgbyBTS1VzIj48L3RleHRhcmVhPgogICAgICAgICAgPHNlbGVjdCBpZD0iYWRkTWsiIGFyaWEtbGFiZWw9Ik1hcmtldHBsYWNlIj48b3B0aW9uIHZhbHVlPSJhbnkiPlRvZG9zIGxvcyBjYW5hbGVzPC9vcHRpb24+PG9wdGlvbiB2YWx1ZT0ibWwiPlNvbG8gTWVyY2FkbyBMaWJyZTwvb3B0aW9uPjxvcHRpb24gdmFsdWU9ImZhIj5Tb2xvIEZhbGFiZWxsYTwvb3B0aW9uPjxvcHRpb24gdmFsdWU9InBhIj5Tb2xvIFBhcmlzPC9vcHRpb24+PC9zZWxlY3Q+CiAgICAgICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIHR5cGU9InN1Ym1pdCI+JHtJLmxvY2t9QmxvcXVlYXI8L2J1dHRvbj4KICAgICAgICA8L2Zvcm0+CiAgICAgICAgPGlucHV0IHR5cGU9InNlYXJjaCIgaWQ9ImJsUSIgcGxhY2Vob2xkZXI9IkJ1c2NhciBlbiBsYSBsaXN0YSIgYXJpYS1sYWJlbD0iQnVzY2FyIGJsb3F1ZWFkb3MiPgogICAgICAgIDxkaXYgY2xhc3M9InRhZ3MiIGlkPSJ0YWdzIj48L2Rpdj4KICAgICAgPC9kaXY+CiAgICA8L2Rpdj4KICAgIDxkaXYgY2xhc3M9InBhbmVsIj4KICAgICAgPGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+PGgyPlBlZGlkb3MgcmVjaWVudGVzPC9oMj48L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0idGFibGUtd3JhcCI+PHRhYmxlIHN0eWxlPSJtaW4td2lkdGg6NTIwcHgiPjx0aGVhZD48dHI+PHRoPlBlZGlkbzwvdGg+PHRoPkNhbmFsPC90aD48dGg+UHJvZHVjdG9zPC90aD48dGg+RXN0YWRvPC90aD48L3RyPjwvdGhlYWQ+PHRib2R5IGlkPSJteVJvd3MiPjwvdGJvZHk+PC90YWJsZT48L2Rpdj4KICAgIDwvZGl2PgogIDwvZGl2PmA7CiAgaWYgKGlzQWRtaW4pICQoJyNhZG1pblNlbGxlcicpLm9uY2hhbmdlID0gZSA9PiB7IHVpLmFkbWluU2VsbGVyID0gK2UudGFyZ2V0LnZhbHVlOyBzdG9yZS5zZXQoJ2FkbWluU2VsbGVyJywgdWkuYWRtaW5TZWxsZXIpOyByZW5kZXJTZWxsZXIoKTsgfTsKICAkKCcjc1N5bmMnKS5vbmNsaWNrID0gYXN5bmMgKCkgPT4geyBhd2FpdCBhcGkoJy9hcGkvc3luYycgKyBzZWxsZXJRUygpLCB7IG1ldGhvZDogJ1BPU1QnIH0pOyB0b2FzdCgnU2luY3Jvbml6YW5kb+KApicpOyB9OwogICQoJyNhZGRGb3JtJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgIGUucHJldmVudERlZmF1bHQoKTsKICAgIHRyeSB7IGNvbnN0IHIgPSBhd2FpdCBhcGkoJy9hcGkvYmxvY2tsaXN0JyArIHNlbGxlclFTKCksIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgdmFsdWU6ICQoJyNhZGRWYWwnKS52YWx1ZSwgbWFya2V0cGxhY2U6ICQoJyNhZGRNaycpLnZhbHVlIH0gfSk7ICQoJyNhZGRWYWwnKS52YWx1ZSA9ICcnOyB0b2FzdChgJHtyLmFkZGVkfSBibG9xdWVhZG8ke3IuYWRkZWQgPT09IDEgPyAnJyA6ICdzJ31gKTsgbG9hZEJsb2NrbGlzdCgpOyB9CiAgICBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlKTsgfQogIH07CiAgJCgnI2JsUScpLm9uaW5wdXQgPSAoKSA9PiBkcmF3VGFncygpOwogICQoJyN0YWdzJykub25jbGljayA9IGFzeW5jIGUgPT4geyBjb25zdCBiID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtcm1dJyk7IGlmICghYikgcmV0dXJuOyBhd2FpdCBhcGkoYC9hcGkvYmxvY2tsaXN0LyR7Yi5kYXRhc2V0LnJtfSR7c2VsbGVyUVMoKX1gLCB7IG1ldGhvZDogJ0RFTEVURScgfSk7IHRvYXN0KCdEZXNibG9xdWVhZG86IHN1cyBwZWRpZG9zIHBhc2FuIGFsIGZ1bGZpbGxtZW50Jyk7IGxvYWRCbG9ja2xpc3QoKTsgfTsKICAkKCcjbXlSb3dzJykub25jbGljayA9IGFzeW5jIGUgPT4gewogICAgY29uc3QgYiA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLXVuYmxvY2tdJyk7IGlmICghYikgcmV0dXJuOwogICAgaWYgKCFjb25maXJtKCfCv0Rlc2Jsb3F1ZWFyIGVzdGEgZXRpcXVldGE/IFBhc2EgYSBsYSBzZWNjacOzbiAiRGVzYmxvcXVlYWRhcyIuIEVuIGxhIGhvamEgZGVsIHBlZGlkbyBzYWxkcsOhIHN1IG7Dum1lcm8geSBxdWVkYXLDoW4gbWFyY2Fkb3MgY29uICJGQUxUQSIgbG9zIHByb2R1Y3RvcyBxdWUgc2UgcmVsbGVuYW4gYXBhcnRlLicpKSByZXR1cm47CiAgICBiLmRpc2FibGVkID0gdHJ1ZTsgYi50ZXh0Q29udGVudCA9ICdEZXNibG9xdWVhbmRv4oCmJzsgdHJ5IHsgYXdhaXQgYXBpUmV0cnkoYC9hcGkvb3JkZXJzLyR7Yi5kYXRhc2V0LnVuYmxvY2t9L3VuYmxvY2tgLCB7IG1ldGhvZDogJ1BPU1QnIH0pOyB0b2FzdCgnRXRpcXVldGEgZGVzYmxvcXVlYWRhJyk7IGxvYWRTZWxsZXJPcmRlcnMoKTsgfSBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlKTsgYi5kaXNhYmxlZCA9IGZhbHNlOyBiLnRleHRDb250ZW50ID0gJ0Rlc2Jsb3F1ZWFyIGV0aXF1ZXRhJzsgfQogIH07CiAgbG9hZENvbm5lY3Rpb25zKCk7IGxvYWRCbG9ja2xpc3QoKTsgbG9hZFNlbGxlck9yZGVycygpOwogIGlmIChuZXcgVVJMU2VhcmNoUGFyYW1zKGxvY2F0aW9uLnNlYXJjaCkuZ2V0KCdjb25lY3RhZG8nKSA9PT0gJ21sJykgeyB0b2FzdCgnTWVyY2FkbyBMaWJyZSBjb25lY3RhZG8nKTsgaGlzdG9yeS5yZXBsYWNlU3RhdGUobnVsbCwgJycsICcvJyk7IH0KfQoKYXN5bmMgZnVuY3Rpb24gbG9hZENvbm5lY3Rpb25zKCkgewogIGNvbnN0IHsgY29ubmVjdGlvbnMgfSA9IGF3YWl0IGFwaSgnL2FwaS9jb25uZWN0aW9ucycgKyBzZWxsZXJRUygpKTsKICBjb25zdCBieSA9IE9iamVjdC5mcm9tRW50cmllcyhjb25uZWN0aW9ucy5tYXAoYyA9PiBbYy5tYXJrZXRwbGFjZSwgY10pKTsKICBjb25zdCBzdCA9IGMgPT4gIWMgPyAnPGRpdiBjbGFzcz0ic3RhdGUgb2ZmIj48aT48L2k+U2luIGNvbmVjdGFyPC9kaXY+JyA6IGMubGFzdF9lcnJvciA/IGA8ZGl2IGNsYXNzPSJzdGF0ZSBlcnIiPjxpPjwvaT5FcnJvcjogJHtlc2MoYy5sYXN0X2Vycm9yLnNsaWNlKDAsIDEyMCkpfTwvZGl2PmAgOiBgPGRpdiBjbGFzcz0ic3RhdGUgb24iPjxpPjwvaT5Db25lY3RhZG8ke2MuYWNjb3VudF9sYWJlbCA/ICcgwrcgJyArIGVzYyhjLmFjY291bnRfbGFiZWwpIDogJyd9JHtjLmxhc3Rfc3luY19hdCA/ICcgwrcgcmV2aXNhZG8gJyArIGVzYyhmbXRUaW1lKGMubGFzdF9zeW5jX2F0KSkgOiAnJ308L2Rpdj5gOwogIGNvbnN0IGRpc2MgPSBjID0+IGMgPyBgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1kZWw9IiR7Yy5pZH0iPkRlc2NvbmVjdGFyPC9idXR0b24+YCA6ICcnOwogIGNvbnN0IG1sID0gYnkubWwsIGZhID0gYnkuZmEsIHBhID0gYnkucGE7CiAgJCgnI2Nvbm4nKS5pbm5lckhUTUwgPSBgCiAgPGRpdiBjbGFzcz0ibWNhcmQiPjxkaXYgY2xhc3M9ImxvZ28iIHN0eWxlPSJiYWNrZ3JvdW5kOnZhcigtLW1sKTtjb2xvcjp2YXIoLS1tbC1pbmspIj5NZXJjYWRvIExpYnJlPC9kaXY+JHtzdChtbCl9CiAgICA8cCBjbGFzcz0iaG93Ij5UZSBsbGV2YSBhIE1lcmNhZG8gTGlicmUgcGFyYSBhdXRvcml6YXIuIE5vIGNvbXBhcnRlcyB0dSBjb250cmFzZcOxYS4gTGFzIGV0aXF1ZXRhcyBsbGVnYW4gYXBlbmFzIGxhIHZlbnRhIHF1ZWRhIGxpc3RhIHBhcmEgaW1wcmltaXIuPC9wPgogICAgPHAgY2xhc3M9ImhvdyB3YXJuYm94Ij48Yj5JbXBvcnRhbnRlOjwvYj4gTWVyY2FkbyBMaWJyZSBjb25lY3RhIGxhIGN1ZW50YSBxdWUgZXN0w6kgPGI+YWJpZXJ0YSBlbiBlc3RlIG5hdmVnYWRvcjwvYj4uIFNpIGFxdcOtIGVzdMOhIGFiaWVydGEgb3RyYSBjdWVudGEgKHBvciBlamVtcGxvIGxhIGRlIG90cm8gdmVuZGVkb3IpLCBjaWVycmEgc2VzacOzbiBlbiBtZXJjYWRvbGlicmUuY2wgYW50ZXMsIG8gdXNhIGVsIGxpbmsgcGFyYSBxdWUgZWwgdmVuZGVkb3IgY29uZWN0ZSBkZXNkZSBzdSBwcm9waW8gY29tcHV0YWRvci48L3A+CiAgICAke21lLm1sQ29uZmlndXJlZCA/IGA8YSBjbGFzcz0iYnRuICR7bWwgPyAnYnRuLWdob3N0JyA6ICdidG4tcHJpbWFyeSd9IiBocmVmPSIvYXV0aC9tbC9zdGFydCR7c2VsbGVyUVMoKX0iPiR7bWwgPyAnVm9sdmVyIGEgYXV0b3JpemFyJyA6ICdDb25lY3RhciBjb24gTWVyY2FkbyBMaWJyZSd9PC9hPiR7bWUudXNlci5yb2xlID09PSAnYWRtaW4nID8gJzxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGlkPSJtbExpbmsiPkNvcGlhciBsaW5rIHBhcmEgcXVlIGVsIHZlbmRlZG9yIGNvbmVjdGU8L2J1dHRvbj4nIDogJyd9YCA6ICc8cCBjbGFzcz0iaG93IiBzdHlsZT0iY29sb3I6dmFyKC0td2FybikiPkVsIGFkbWluaXN0cmFkb3IgZGViZSBjb25maWd1cmFyIGxhIGFwcCBkZSBNZXJjYWRvIExpYnJlIGVuIGVsIHNlcnZpZG9yLjwvcD4nfSR7ZGlzYyhtbCl9PC9kaXY+CiAgPGRpdiBjbGFzcz0ibWNhcmQiPjxkaXYgY2xhc3M9ImxvZ28iIHN0eWxlPSJiYWNrZ3JvdW5kOnZhcigtLWZhKTtjb2xvcjp2YXIoLS1mYS1pbmspIj5GYWxhYmVsbGE8L2Rpdj4ke3N0KGZhKX0KICAgIDxmb3JtIGlkPSJmYUZvcm0iIGNsYXNzPSJzdGFjayI+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+VXN1YXJpbyBBUEkgKGNvcnJlbyBkZWwgU2VsbGVyIENlbnRlcik8aW5wdXQgdHlwZT0iZW1haWwiIGlkPSJmYVVzZXIiIHZhbHVlPSIke2VzYyhmYT8uYWNjb3VudF9sYWJlbCB8fCAnJyl9IiByZXF1aXJlZD48L2xhYmVsPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPkFQSSBLZXk8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJmYUtleSIgcGxhY2Vob2xkZXI9IiR7ZmEgPyAn4oCi4oCi4oCi4oCi4oCi4oCiIChndWFyZGFkYSknIDogJ1NlbGxlciBDZW50ZXIg4oC6IE1pIGN1ZW50YSDigLogSW50ZWdyYWNpb25lcyd9IiAke2ZhID8gJycgOiAncmVxdWlyZWQnfT48L2xhYmVsPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPlNlbGxlciBJRDxpbnB1dCB0eXBlPSJ0ZXh0IiBpZD0iZmFTaWQiIHBsYWNlaG9sZGVyPSJDw7NkaWdvIGRlIHRpZW5kYSwgZWouIFNDMTIzNCI+PC9sYWJlbD4KICAgICAgPGxhYmVsIGNsYXNzPSJzd2l0Y2giPjxpbnB1dCB0eXBlPSJjaGVja2JveCIgaWQ9ImZhQXV0byIgJHtmYT8uc2V0dGluZ3M/LmF1dG9SZWFkeSA/ICdjaGVja2VkJyA6ICcnfT4gTWFyY2FyICJsaXN0byBwYXJhIGRlc3BhY2hvIiBhdXRvbcOhdGljbzwvbGFiZWw+CiAgICAgIDxwIGNsYXNzPSJob3ciPkZhbGFiZWxsYSBnZW5lcmEgbGEgZXRpcXVldGEgc29sbyBjdWFuZG8gZWwgcGVkaWRvIGVzdMOhIGxpc3RvIHBhcmEgZGVzcGFjaG8uIENvbiBlc3RhIG9wY2nDs24sIGxhIGFwcCBsbyBtYXJjYSBzb2xhIGFwZW5hcyBsbGVnYS48L3A+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biAke2ZhID8gJ2J0bi1naG9zdCcgOiAnYnRuLXByaW1hcnknfSIgdHlwZT0ic3VibWl0Ij4ke2ZhID8gJ0FjdHVhbGl6YXInIDogJ0NvbmVjdGFyIEZhbGFiZWxsYSd9PC9idXR0b24+CiAgICA8L2Zvcm0+CiAgICAke2ZhPy53ZWJob29rX3VybCA/IGA8bGFiZWwgY2xhc3M9ImYiPkF2aXNvIGluc3RhbnTDoW5lbyAod2ViaG9vaywgb3BjaW9uYWwpPHNwYW4gY2xhc3M9ImNvcHkiPjxpbnB1dCB0eXBlPSJ0ZXh0IiByZWFkb25seSB2YWx1ZT0iJHtlc2MoZmEud2ViaG9va191cmwpfSI+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1jb3B5PSIke2VzYyhmYS53ZWJob29rX3VybCl9Ij5Db3BpYXI8L2J1dHRvbj48L3NwYW4+PC9sYWJlbD5gIDogJyd9CiAgICAke2Rpc2MoZmEpfTwvZGl2PgogIDxkaXYgY2xhc3M9Im1jYXJkIj48ZGl2IGNsYXNzPSJsb2dvIiBzdHlsZT0iYmFja2dyb3VuZDp2YXIoLS1wYSk7Y29sb3I6I2ZmZiI+UGFyaXM8L2Rpdj4ke3N0KHBhKX0KICAgIDxmb3JtIGlkPSJwYUZvcm0iIGNsYXNzPSJzdGFjayI+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+QVBJIEtleTxpbnB1dCB0eXBlPSJwYXNzd29yZCIgaWQ9InBhS2V5IiBwbGFjZWhvbGRlcj0iJHtwYSA/ICfigKLigKLigKLigKLigKLigKIgKGd1YXJkYWRhKScgOiAnU2VsbGVyIENlbnRlciBQYXJpcyDigLogTWkgY3VlbnRhIOKAuiBJbnRlZ3JhY2lvbmVzJ30iIHJlcXVpcmVkPjwvbGFiZWw+CiAgICAgIDxwIGNsYXNzPSJob3ciPlBhcmlzIGVudHJlZ2EgbGEgQVBJIEtleSBlbiBNaSBjdWVudGEg4oC6IEludGVncmFjaW9uZXMuIFNpIG5vIGFwYXJlY2UsIHNlIHBpZGUgcG9yIHRpY2tldCBhIFBhcmlzLjwvcD4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuICR7cGEgPyAnYnRuLWdob3N0JyA6ICdidG4tcHJpbWFyeSd9IiB0eXBlPSJzdWJtaXQiPiR7cGEgPyAnQWN0dWFsaXphcicgOiAnQ29uZWN0YXIgUGFyaXMnfTwvYnV0dG9uPgogICAgPC9mb3JtPiR7ZGlzYyhwYSl9PC9kaXY+YDsKICAkKCcjZmFGb3JtJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgIGUucHJldmVudERlZmF1bHQoKTsKICAgIGlmIChmYSAmJiAhJCgnI2ZhS2V5JykudmFsdWUpIHsgYXdhaXQgYXBpKGAvYXBpL2Nvbm5lY3Rpb25zLyR7ZmEuaWR9L3NldHRpbmdzJHtzZWxsZXJRUygpfWAsIHsgbWV0aG9kOiAnUEFUQ0gnLCBib2R5OiB7IGF1dG9SZWFkeTogJCgnI2ZhQXV0bycpLmNoZWNrZWQgfSB9KTsgdG9hc3QoJ0d1YXJkYWRvJyk7IHJldHVybiBsb2FkQ29ubmVjdGlvbnMoKTsgfQogICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL2Nvbm5lY3Rpb25zL2ZhJyArIHNlbGxlclFTKCksIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgdXNlcklkOiAkKCcjZmFVc2VyJykudmFsdWUsIGFwaUtleTogJCgnI2ZhS2V5JykudmFsdWUsIHNlbGxlcklkOiAkKCcjZmFTaWQnKS52YWx1ZSwgYXV0b1JlYWR5OiAkKCcjZmFBdXRvJykuY2hlY2tlZCB9IH0pOyB0b2FzdCgnRmFsYWJlbGxhIGNvbmVjdGFkbycpOyBsb2FkQ29ubmVjdGlvbnMoKTsgfQogICAgY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSwgNTAwMCk7IH0KICB9OwogICQoJyNwYUZvcm0nKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4gewogICAgZS5wcmV2ZW50RGVmYXVsdCgpOwogICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL2Nvbm5lY3Rpb25zL3BhJyArIHNlbGxlclFTKCksIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgYXBpS2V5OiAkKCcjcGFLZXknKS52YWx1ZSB9IH0pOyB0b2FzdCgnUGFyaXMgY29uZWN0YWRvJyk7IGxvYWRDb25uZWN0aW9ucygpOyB9CiAgICBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlLCA1MDAwKTsgfQogIH07CiAgaWYgKCQoJyNtbExpbmsnKSkgJCgnI21sTGluaycpLm9uY2xpY2sgPSBhc3luYyAoKSA9PiB7CiAgICB0cnkgewogICAgICBjb25zdCB7IHVybCB9ID0gYXdhaXQgYXBpKCcvYXBpL2FkbWluL21sLWxpbmsnICsgc2VsbGVyUVMoKSwgeyBtZXRob2Q6ICdQT1NUJyB9KTsKICAgICAgdHJ5IHsgYXdhaXQgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQodXJsKTsgdG9hc3QoJ0xpbmsgY29waWFkbzogZW52w61hc2VsbyBhbCB2ZW5kZWRvciAoc2lydmUgcG9yIDQ4IGhvcmFzKScsIDUwMDApOyB9CiAgICAgIGNhdGNoIHsgcHJvbXB0KCdDb3BpYSBlc3RlIGxpbmsgeSBlbnbDrWFzZWxvIGFsIHZlbmRlZG9yIChzaXJ2ZSBwb3IgNDggaG9yYXMpOicsIHVybCk7IH0KICAgIH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IH0KICB9OwogICQoJyNjb25uJykub25jbGljayA9IGFzeW5jIGUgPT4gewogICAgY29uc3QgZCA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLWRlbF0nKTsKICAgIGlmIChkKSB7IGQuZGlzYWJsZWQgPSB0cnVlOyBhd2FpdCBhcGkoYC9hcGkvY29ubmVjdGlvbnMvJHtkLmRhdGFzZXQuZGVsfSR7c2VsbGVyUVMoKX1gLCB7IG1ldGhvZDogJ0RFTEVURScgfSk7IHRvYXN0KCdEZXNjb25lY3RhZG8nKTsgbG9hZENvbm5lY3Rpb25zKCk7IH0KICAgIGNvbnN0IGMgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1jb3B5XScpOwogICAgaWYgKGMpIHsgZS5wcmV2ZW50RGVmYXVsdCgpOyB0cnkgeyBhd2FpdCBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dChjLmRhdGFzZXQuY29weSk7IHRvYXN0KCdDb3BpYWRvJyk7IH0gY2F0Y2ggeyBjLnByZXZpb3VzRWxlbWVudFNpYmxpbmcuc2VsZWN0KCk7IH0gfQogIH07Cn0KCmxldCBibEl0ZW1zID0gW107CmFzeW5jIGZ1bmN0aW9uIGxvYWRCbG9ja2xpc3QoKSB7IGJsSXRlbXMgPSAoYXdhaXQgYXBpKCcvYXBpL2Jsb2NrbGlzdCcgKyBzZWxsZXJRUygpKSkuaXRlbXM7IGRyYXdUYWdzKCk7IH0KZnVuY3Rpb24gZHJhd1RhZ3MoKSB7CiAgY29uc3QgcSA9ICgkKCcjYmxRJyk/LnZhbHVlIHx8ICcnKS50b0xvd2VyQ2FzZSgpOwogIGNvbnN0IGxpc3QgPSBibEl0ZW1zLmZpbHRlcihiID0+ICFxIHx8IGIudmFsdWUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxKSk7CiAgJCgnI3RhZ3MnKS5pbm5lckhUTUwgPSBsaXN0Lmxlbmd0aCA/IGxpc3QubWFwKGIgPT4gYDxzcGFuIGNsYXNzPSJ0YWciPiR7ZXNjKGIudmFsdWUpfSA8c21hbGw+wrcgJHtiLm1hcmtldHBsYWNlID09PSAnYW55JyA/ICd0b2RvcycgOiBNS1tiLm1hcmtldHBsYWNlXX08L3NtYWxsPjxidXR0b24gZGF0YS1ybT0iJHtiLmlkfSIgYXJpYS1sYWJlbD0iUXVpdGFyICR7ZXNjKGIudmFsdWUpfSI+JHtJLnh9PC9idXR0b24+PC9zcGFuPmApLmpvaW4oJycpCiAgICA6IGA8c3BhbiBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTMuNXB4Ij4ke2JsSXRlbXMubGVuZ3RoID8gJ1NpbiByZXN1bHRhZG9zLicgOiAnU2luIHByb2R1Y3RvcyBibG9xdWVhZG9zOiB0b2RvIHZhIGFsIGZ1bGZpbGxtZW50Lid9PC9zcGFuPmA7Cn0KYXN5bmMgZnVuY3Rpb24gbG9hZFNlbGxlck9yZGVycygpIHsKICBpZiAodGFiICE9PSAnc2VsbGVyJyB8fCAhJCgnI215Um93cycpKSByZXR1cm47CiAgbGV0IGxpc3Q7CiAgaWYgKG1lLnVzZXIucm9sZSA9PT0gJ3NlbGxlcicpIGxpc3QgPSAoYXdhaXQgYXBpKCcvYXBpL29yZGVycz92aWV3PWFsbCcpKS5vcmRlcnMuZmlsdGVyKG8gPT4gby5zZWxsZXJfaWQgPT09IG1lLnNlbGxlcj8uaWQpOwogIGVsc2UgbGlzdCA9IChhd2FpdCBhcGkoJy9hcGkvb3JkZXJzP3ZpZXc9YWxsJykpLm9yZGVycy5maWx0ZXIobyA9PiBvLnNlbGxlcl9pZCA9PT0gdWkuYWRtaW5TZWxsZXIpOwogICQoJyNteVJvd3MnKS5pbm5lckhUTUwgPSBsaXN0Lmxlbmd0aCA/IGxpc3Quc2xpY2UoMCwgNjApLm1hcChvID0+IGA8dHI+PHRkIGNsYXNzPSJtb25vIj4ke2VzYyhvLm9yZGVyX251bWJlcil9PHNwYW4gY2xhc3M9Im5vdGUiPiR7ZXNjKGZtdFRpbWUoby5zb2xkX2F0IHx8IG8uY3JlYXRlZF9hdCkpfSR7by5jdXN0b21lciA/ICcgwrcgJyArIGVzYyhvLmN1c3RvbWVyKSA6ICcnfTwvc3Bhbj48L3RkPjx0ZD48c3BhbiBjbGFzcz0ibWsgJHtvLm1hcmtldHBsYWNlfSI+JHtNS1tvLm1hcmtldHBsYWNlXSB8fCAnJ308L3NwYW4+PC90ZD48dGQ+JHtpdGVtc0hUTUwobyl9PC90ZD48dGQ+JHtvLmJsb2NrX25vID8gYDxzcGFuIGNsYXNzPSJibG9ja25vIj5OwrAgJHtvLmJsb2NrX25vfTwvc3Bhbj5gIDogJyd9JHtwaWxsKG8pfSR7by5zdGF0ZSA9PT0gJ2Jsb2NrZWQnICYmIG8ub3duICE9PSBmYWxzZSA/IGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkgYnRuLXNtIiBzdHlsZT0ibWFyZ2luLXRvcDo2cHgiIGRhdGEtdW5ibG9jaz0iJHtvLmlkfSI+RGVzYmxvcXVlYXIgZXRpcXVldGE8L2J1dHRvbj5gIDogJyd9JHtbJ3ByaW50ZWQnLCAnc2hpcHBlZCddLmluY2x1ZGVzKG8uc3RhdGUpICYmIG8ucHJpbnRlZF9ieSA/IGA8c3BhbiBjbGFzcz0ibm90ZSI+SW1wcmltacOzOiAke2VzYyhvLnByaW50ZWRfYnkpfTwvc3Bhbj5gIDogJyd9JHtvLnByZXZfcHJpbnQgJiYgby5wcmV2X3ByaW50LmF0ID8gYDxzcGFuIGNsYXNzPSJub3RlIHByZXZwcmludCI+4oa6IFlhIGZ1ZSBpbXByZXNhIHBvciAke2VzYyhvLnByZXZfcHJpbnQuYnkgfHwgJ2FsZ3VpZW4nKX0gZWwgJHtlc2MoZm10VGltZShvLnByZXZfcHJpbnQuYXQpKX08L3NwYW4+YCA6ICcnfSR7by5zdGF0ZSA9PT0gJ2Vycm9yJyB8fCBvLnN0YXRlID09PSAnd2FpdGluZycgPyBgPHNwYW4gY2xhc3M9Im5vdGUgJHtvLnN0YXRlID09PSAnZXJyb3InID8gJ2JhZCcgOiAnJ30iPiR7ZXNjKG8uZXJyb3IgfHwgJycpfTwvc3Bhbj5gIDogJyd9PC90ZD48L3RyPmApLmpvaW4oJycpCiAgICA6IGA8dHI+PHRkIGNvbHNwYW49IjQiPjxkaXYgY2xhc3M9ImVtcHR5Ij5Bw7puIG5vIGhheSBwZWRpZG9zLiBDb25lY3RhIHR1cyBtYXJrZXRwbGFjZXMgeSBhcGFyZWNlcsOhbiBhcXXDrS48L2Rpdj48L3RkPjwvdHI+YDsKfQoKLy8gLS0tLS0tLS0tLSBBRE1JTiAtLS0tLS0tLS0tCmFzeW5jIGZ1bmN0aW9uIHJlbmRlckFkbWluKCkgewogIGNvbnN0IFtkLCBzdF0gPSBhd2FpdCBQcm9taXNlLmFsbChbYXBpKCcvYXBpL2FkbWluL3NlbGxlcnMnKSwgYXBpKCcvYXBpL2FkbWluL3NldHRpbmdzJyldKTsKICBjb25zdCBzTmFtZSA9IGlkID0+IGQuc2VsbGVycy5maW5kKHMgPT4gcy5pZCA9PT0gaWQpPy5uYW1lIHx8ICcnOwogIGNvbnN0IHJvbGVOYW1lID0geyBhZG1pbjogJ0FkbWluaXN0cmFkb3InLCBmdWxmaWxsbWVudDogJ0Z1bGZpbGxtZW50Jywgc2VsbGVyOiAnVmVuZGVkb3InLCBhZ2VuY2lhOiAnQWdlbmNpYSAoc29sbyBjw7NkaWdvcyBkZSBkZXZvbHVjacOzbiknIH07CiAgJCgnI21haW4nKS5pbm5lckhUTUwgPSBgCiAgPGRpdiBjbGFzcz0iZ3JpZDIiPgogICAgPGRpdiBjbGFzcz0icGFuZWwiPjxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj5WZW5kZWRvcmVzPC9oMj48L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0icGFuZWwtYm9keSBzdGFjayI+CiAgICAgICAgPGZvcm0gY2xhc3M9InJvdyIgaWQ9Im5ld1NlbGxlciI+PGxhYmVsIGNsYXNzPSJmIj5Ob21icmUgZGUgbGEgdGllbmRhPGlucHV0IHR5cGU9InRleHQiIGlkPSJuc05hbWUiIHJlcXVpcmVkPjwvbGFiZWw+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiIHN0eWxlPSJmbGV4OjAiPkFncmVnYXI8L2J1dHRvbj48L2Zvcm0+CiAgICAgICAgPGRpdiBjbGFzcz0idGFibGUtd3JhcCI+PHRhYmxlIHN0eWxlPSJtaW4td2lkdGg6NDIwcHgiPjx0aGVhZD48dHI+PHRoPlZlbmRlZG9yPC90aD48dGg+TWFya2V0cGxhY2VzPC90aD48dGg+QmxvcXVlYWRvczwvdGg+PHRoPjwvdGg+PC90cj48L3RoZWFkPjx0Ym9keT4KICAgICAgICAke2Quc2VsbGVycy5tYXAocyA9PiBgPHRyPjx0ZD48Yj4ke2VzYyhzLm5hbWUpfTwvYj48L3RkPjx0ZD4ke3MuY29ubmVjdGlvbnMuZmlsdGVyKGMgPT4gTUtbYy5tYXJrZXRwbGFjZV0pLm1hcChjID0+IGA8c3BhbiBjbGFzcz0ibWsgJHtjLm1hcmtldHBsYWNlfSIgdGl0bGU9IiR7ZXNjKGMubGFzdF9lcnJvciB8fCAnT0snKX0iPiR7TUtbYy5tYXJrZXRwbGFjZV19JHtjLmxhc3RfZXJyb3IgPyAnIOKaoCcgOiAnJ308L3NwYW4+YCkuam9pbignICcpIHx8ICc8c3BhbiBjbGFzcz0ibXV0ZWQiPuKAlDwvc3Bhbj4nfTwvdGQ+PHRkPiR7cy5ibG9ja2VkfTwvdGQ+PHRkPjxidXR0b24gY2xhc3M9ImJ0biBidG4tZGFuZ2VyIGJ0bi1zbSIgZGF0YS1kZWxzPSIke3MuaWR9Ij5FbGltaW5hcjwvYnV0dG9uPjwvdGQ+PC90cj5gKS5qb2luKCcnKSB8fCAnPHRyPjx0ZCBjb2xzcGFuPSI0IiBjbGFzcz0ibXV0ZWQiPlNpbiB2ZW5kZWRvcmVzPC90ZD48L3RyPid9CiAgICAgICAgPC90Ym9keT48L3RhYmxlPjwvZGl2PgogICAgICA8L2Rpdj48L2Rpdj4KICAgIDxkaXYgY2xhc3M9InBhbmVsIj48ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj48aDI+VXN1YXJpb3M8L2gyPjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJwYW5lbC1ib2R5IHN0YWNrIj4KICAgICAgICA8Zm9ybSBjbGFzcz0ic3RhY2siIGlkPSJuZXdVc2VyIj4KICAgICAgICAgIDxkaXYgY2xhc3M9InJvdyI+PGxhYmVsIGNsYXNzPSJmIj5Ob21icmU8aW5wdXQgdHlwZT0idGV4dCIgaWQ9Im51TmFtZSIgcmVxdWlyZWQ+PC9sYWJlbD48bGFiZWwgY2xhc3M9ImYiPkNvcnJlbzxpbnB1dCB0eXBlPSJlbWFpbCIgaWQ9Im51RW1haWwiIHJlcXVpcmVkPjwvbGFiZWw+PC9kaXY+CiAgICAgICAgICA8ZGl2IGNsYXNzPSJyb3ciPjxsYWJlbCBjbGFzcz0iZiI+Um9sPHNlbGVjdCBpZD0ibnVSb2xlIj48b3B0aW9uIHZhbHVlPSJzZWxsZXIiPlZlbmRlZG9yPC9vcHRpb24+PG9wdGlvbiB2YWx1ZT0iZnVsZmlsbG1lbnQiPkZ1bGZpbGxtZW50PC9vcHRpb24+PG9wdGlvbiB2YWx1ZT0iYWRtaW4iPkFkbWluaXN0cmFkb3I8L29wdGlvbj48b3B0aW9uIHZhbHVlPSJhZ2VuY2lhIj5BZ2VuY2lhIChzb2xvIGPDs2RpZ29zIGRlIGRldm9sdWNpw7NuKTwvb3B0aW9uPjwvc2VsZWN0PjwvbGFiZWw+CiAgICAgICAgICA8bGFiZWwgY2xhc3M9ImYiIGlkPSJudVNlbGxlcldyYXAiPlRpZW5kYTxzZWxlY3QgaWQ9Im51U2VsbGVyIj4ke2Quc2VsbGVycy5tYXAocyA9PiBgPG9wdGlvbiB2YWx1ZT0iJHtzLmlkfSI+JHtlc2Mocy5uYW1lKX08L29wdGlvbj5gKS5qb2luKCcnKX08L3NlbGVjdD48L2xhYmVsPjwvZGl2PgogICAgICAgICAgPGRpdiBjbGFzcz0icm93Ij48bGFiZWwgY2xhc3M9ImYiPkNvbnRyYXNlw7FhIGluaWNpYWwgKG3DrW4uIDgpPGlucHV0IHR5cGU9InRleHQiIGlkPSJudVBhc3MiIG1pbmxlbmd0aD0iOCIgcmVxdWlyZWQ+PC9sYWJlbD48YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIHR5cGU9InN1Ym1pdCIgc3R5bGU9ImZsZXg6MCI+Q3JlYXIgdXN1YXJpbzwvYnV0dG9uPjwvZGl2PgogICAgICAgIDwvZm9ybT4KICAgICAgICA8cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJtYXJnaW46MDtmb250LXNpemU6MTNweCI+PGI+Q2xhdmUgdGVtcG9yYWw6PC9iPiBjcmVhIHVuYSBjbGF2ZSBudWV2YSBxdWUgbGUgZGljdGFzIGFsIHZlbmRlZG9yOyBhbCBlbnRyYXIgZGViZSBjYW1iaWFybGEuIDxiPkNsYXZlIGRlIHJlc3BhbGRvOjwvYj4gdW4gY8OzZGlnbyBkZSB1biBzb2xvIHVzbyBxdWUgZWwgdmVuZGVkb3IgZ3VhcmRhIHBvciBzaSBvbHZpZGEgc3UgY2xhdmUuIDxiPkVudHJhciBjb21vOjwvYj4gYWJyZXMgc3UgY3VlbnRhIHNpbiBzYWJlciBzdSBjbGF2ZSwgcGFyYSBheXVkYXJsby48L3A+CiAgICAgICAgPGRpdiBjbGFzcz0idGFibGUtd3JhcCI+PHRhYmxlIHN0eWxlPSJtaW4td2lkdGg6NzYwcHgiPjx0aGVhZD48dHI+PHRoPlVzdWFyaW88L3RoPjx0aD5Sb2w8L3RoPjx0aD5BY2Nlc288L3RoPjx0aD48L3RoPjwvdHI+PC90aGVhZD48dGJvZHk+CiAgICAgICAgJHtkLnVzZXJzLm1hcCh1ID0+IGA8dHI+PHRkPjxiPiR7ZXNjKHUubmFtZSl9PC9iPjxzcGFuIGNsYXNzPSJub3RlIj4ke2VzYyh1LmVtYWlsKX08L3NwYW4+PC90ZD48dGQ+JHt1LmlkID09PSBtZS51c2VyLmlkID8gcm9sZU5hbWVbdS5yb2xlXSA6IGA8c2VsZWN0IGRhdGEtcm9sZT0iJHt1LmlkfSIgc3R5bGU9IndpZHRoOmF1dG87cGFkZGluZzo0cHggOHB4IiBhcmlhLWxhYmVsPSJSb2wiPiR7T2JqZWN0LmVudHJpZXMocm9sZU5hbWUpLmZpbHRlcigoW2tdKSA9PiBrICE9PSAnc2VsbGVyJyB8fCB1LnNlbGxlcl9pZCkubWFwKChbaywgbl0pID0+IGA8b3B0aW9uIHZhbHVlPSIke2t9IiAke3Uucm9sZSA9PT0gayA/ICdzZWxlY3RlZCcgOiAnJ30+JHtufTwvb3B0aW9uPmApLmpvaW4oJycpfTwvc2VsZWN0PmB9JHt1LnNlbGxlcl9pZCA/ICcgwrcgJyArIGVzYyhzTmFtZSh1LnNlbGxlcl9pZCkpIDogJyd9PC90ZD48dGQ+JHt1Lmhhc19iYWNrdXAgPyAnPHNwYW4gY2xhc3M9InBpbGwgcmVhZHkiIHN0eWxlPSJtYXJnaW4tdG9wOjRweCI+UmVzcGFsZG8gbGlzdG88L3NwYW4+JyA6ICcnfSR7dS5tdXN0X2NoYW5nZSA/ICcgPHNwYW4gY2xhc3M9InBpbGwgd2FpdGluZyIgc3R5bGU9Im1hcmdpbi10b3A6NHB4Ij5EZWJlIGNyZWFyIGNsYXZlIG51ZXZhPC9zcGFuPicgOiAnJ308L3RkPjx0ZD48ZGl2IGNsYXNzPSJyb3ctYWN0aW9ucyI+CiAgICAgICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWdob3N0IGJ0bi1zbSIgZGF0YS1hY3Q9InRlbXAtcGFzc3dvcmQiIGRhdGEtaWQ9IiR7dS5pZH0iIGRhdGEtbmFtZT0iJHtlc2ModS5uYW1lKX0iPkNsYXZlIHRlbXBvcmFsPC9idXR0b24+CiAgICAgICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWFjdD0iYmFja3VwLWNvZGUiIGRhdGEtaWQ9IiR7dS5pZH0iIGRhdGEtbmFtZT0iJHtlc2ModS5uYW1lKX0iPkNsYXZlIGRlIHJlc3BhbGRvPC9idXR0b24+CiAgICAgICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWFjdD0ic2VuZC1jb2RlIiBkYXRhLWlkPSIke3UuaWR9IiBkYXRhLW5hbWU9IiR7ZXNjKHUubmFtZSl9Ij5FbnZpYXIgY8OzZGlnbzwvYnV0dG9uPgogICAgICAgICAgJHt1LmlkID09PSBtZS51c2VyLmlkID8gJycgOiBgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1hY3Q9ImltcGVyc29uYXRlIiBkYXRhLWlkPSIke3UuaWR9IiBkYXRhLW5hbWU9IiR7ZXNjKHUubmFtZSl9Ij5FbnRyYXIgY29tbzwvYnV0dG9uPjxidXR0b24gY2xhc3M9ImJ0biBidG4tZGFuZ2VyIGJ0bi1zbSIgZGF0YS1kZWx1PSIke3UuaWR9Ij5FbGltaW5hcjwvYnV0dG9uPmB9PC9kaXY+PC90ZD48L3RyPmApLmpvaW4oJycpfQogICAgICAgIDwvdGJvZHk+PC90YWJsZT48L2Rpdj4KICAgICAgPC9kaXY+PC9kaXY+CiAgPC9kaXY+CiAgPGRpdiBjbGFzcz0icGFuZWwiIHN0eWxlPSJtYXJnaW4tdG9wOjIwcHgiPjxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj5FbmxhY2VzIMO6dGlsZXM8L2gyPjwvZGl2PgogICAgPGRpdiBjbGFzcz0icGFuZWwtYm9keSI+PHVsIHN0eWxlPSJsaXN0LXN0eWxlOm5vbmU7bWFyZ2luOjA7cGFkZGluZzowIj48bGkgc3R5bGU9ImRpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjJweDtwYWRkaW5nOjEwcHggMDtib3JkZXItdG9wOjFweCBzb2xpZCB2YXIoLS1saW5lKSI+PGEgaHJlZj0iaHR0cHM6Ly9ldGlxdWV0YWh1Yi1qYXZpLm9ucmVuZGVyLmNvbSIgdGFyZ2V0PSJfYmxhbmsiIHJlbD0ibm9vcGVuZXIiIHN0eWxlPSJmb250LXdlaWdodDo3MDAiPlR1IGFwcCBFdGlxdWV0YUh1YjwvYT48c3BhbiBjbGFzcz0ibW9ubyBtdXRlZCIgc3R5bGU9ImZvbnQtc2l6ZToxMnB4Ij5odHRwczovL2V0aXF1ZXRhaHViLWphdmkub25yZW5kZXIuY29tPC9zcGFuPjxzcGFuIGNsYXNzPSJtdXRlZCIgc3R5bGU9ImZvbnQtc2l6ZToxM3B4Ij5Fc3RhIG1pc21hIGFwcC4gQ29tcMOhcnRlbGEgY29uIGxvcyB2ZW5kZWRvcmVzIHkgZWwgZnVsZmlsbG1lbnQuPC9zcGFuPjwvbGk+PGxpIHN0eWxlPSJkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDoycHg7cGFkZGluZzoxMHB4IDA7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tbGluZSkiPjxhIGhyZWY9Imh0dHBzOi8vZGV2ZWxvcGVycy5tZXJjYWRvbGlicmUuY2wvZGV2Y2VudGVyIiB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciIgc3R5bGU9ImZvbnQtd2VpZ2h0OjcwMCI+TWVyY2FkbyBMaWJyZSBEZXZlbG9wZXJzPC9hPjxzcGFuIGNsYXNzPSJtb25vIG11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEycHgiPmh0dHBzOi8vZGV2ZWxvcGVycy5tZXJjYWRvbGlicmUuY2wvZGV2Y2VudGVyPC9zcGFuPjxzcGFuIGNsYXNzPSJtdXRlZCIgc3R5bGU9ImZvbnQtc2l6ZToxM3B4Ij5Eb25kZSBlc3TDoSBsYSBhcGxpY2FjacOzbiBFdGlxdWV0YUh1YiB5IHN1IFNlY3JldCBLZXkuIEVudHJhcyBjb24gdHUgY3VlbnRhIG5vcm1hbCBkZSBNZXJjYWRvIExpYnJlLjwvc3Bhbj48L2xpPjxsaSBzdHlsZT0iZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MnB4O3BhZGRpbmc6MTBweCAwO2JvcmRlci10b3A6MXB4IHNvbGlkIHZhcigtLWxpbmUpIj48YSBocmVmPSJodHRwczovL2Rhc2hib2FyZC5yZW5kZXIuY29tIiB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciIgc3R5bGU9ImZvbnQtd2VpZ2h0OjcwMCI+UmVuZGVyPC9hPjxzcGFuIGNsYXNzPSJtb25vIG11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEycHgiPmh0dHBzOi8vZGFzaGJvYXJkLnJlbmRlci5jb208L3NwYW4+PHNwYW4gY2xhc3M9Im11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEzcHgiPkRvbmRlIHZpdmUgbGEgYXBwLiBBcXXDrSBzZSBwdWJsaWNhIGNhZGEgdmVyc2nDs24gbnVldmEgKE1hbnVhbCBEZXBsb3kpLjwvc3Bhbj48L2xpPjxsaSBzdHlsZT0iZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MnB4O3BhZGRpbmc6MTBweCAwO2JvcmRlci10b3A6MXB4IHNvbGlkIHZhcigtLWxpbmUpIj48YSBocmVmPSJodHRwczovL2dpdGh1Yi5jb20vZWR1YXJkb2RpbmFyZGk5Ni1ib29wL2V0aXF1ZXRhaHViIiB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciIgc3R5bGU9ImZvbnQtd2VpZ2h0OjcwMCI+R2l0SHViPC9hPjxzcGFuIGNsYXNzPSJtb25vIG11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEycHgiPmh0dHBzOi8vZ2l0aHViLmNvbS9lZHVhcmRvZGluYXJkaTk2LWJvb3AvZXRpcXVldGFodWI8L3NwYW4+PHNwYW4gY2xhc3M9Im11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEzcHgiPkVsIGPDs2RpZ28gZGUgbGEgYXBwIHkgZWwgcmVzcGFsZG8gYXV0b23DoXRpY28gY2FkYSAxNSBtaW51dG9zLjwvc3Bhbj48L2xpPjxsaSBzdHlsZT0iZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MnB4O3BhZGRpbmc6MTBweCAwO2JvcmRlci10b3A6MXB4IHNvbGlkIHZhcigtLWxpbmUpIj48YSBocmVmPSJodHRwczovL2FwcC5icmV2by5jb20iIHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIiBzdHlsZT0iZm9udC13ZWlnaHQ6NzAwIj5CcmV2bzwvYT48c3BhbiBjbGFzcz0ibW9ubyBtdXRlZCIgc3R5bGU9ImZvbnQtc2l6ZToxMnB4Ij5odHRwczovL2FwcC5icmV2by5jb208L3NwYW4+PHNwYW4gY2xhc3M9Im11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEzcHgiPkVsIHNlcnZpY2lvIHF1ZSBlbnbDrWEgbG9zIGNvcnJlb3MgY29uIGPDs2RpZ29zIHBhcmEgcmVjdXBlcmFyIGNvbnRyYXNlw7FhLjwvc3Bhbj48L2xpPjwvdWw+PC9kaXY+PC9kaXY+CiAgPGRpdiBjbGFzcz0icGFuZWwiIHN0eWxlPSJtYXJnaW4tdG9wOjIwcHgiPjxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj5Db25leGnDs24gY29uIE1lcmNhZG8gTGlicmU8L2gyPiR7c3QubWxfY2xpZW50X2lkICYmIHN0Lm1sX3NlY3JldF9zZXQgPyAnPHNwYW4gY2xhc3M9InN0YXRlIG9uIj48aT48L2k+Q29uZmlndXJhZGE8L3NwYW4+JyA6ICc8c3BhbiBjbGFzcz0ic3RhdGUgZXJyIj48aT48L2k+RmFsdGEgY29uZmlndXJhcjwvc3Bhbj4nfTwvZGl2PgogICAgPGRpdiBjbGFzcz0icGFuZWwtYm9keSBzdGFjayI+CiAgICAgIDxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9Im1hcmdpbjowIj5DcmVhIHVuYSBhcGxpY2FjacOzbiBlbiA8YSBocmVmPSJodHRwczovL2RldmVsb3BlcnMubWVyY2Fkb2xpYnJlLmNsL2RldmNlbnRlciIgdGFyZ2V0PSJfYmxhbmsiIHJlbD0ibm9vcGVuZXIiPmRldmVsb3BlcnMubWVyY2Fkb2xpYnJlLmNsPC9hPiBjb24gZXN0b3MgZGF0b3MgeSBwZWdhIGFxdcOtIHN1IEFwcCBJRCB5IFNlY3JldCBLZXkuIFVuYSBzb2xhIGFwcCBzaXJ2ZSBwYXJhIHRvZG9zIGxvcyB2ZW5kZWRvcmVzLjwvcD4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5VUkkgZGUgcmVkaXJlY3Q8c3BhbiBjbGFzcz0iY29weSI+PGlucHV0IHR5cGU9InRleHQiIHJlYWRvbmx5IHZhbHVlPSIke2VzYyhzdC5tbF9yZWRpcmVjdF91cmkpfSI+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1jb3B5PSIke2VzYyhzdC5tbF9yZWRpcmVjdF91cmkpfSI+Q29waWFyPC9idXR0b24+PC9zcGFuPjwvbGFiZWw+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+VVJMIGRlIG5vdGlmaWNhY2lvbmVzICh0w7NwaWNvczogb3JkZXJzX3YyIHkgc2hpcG1lbnRzKTxzcGFuIGNsYXNzPSJjb3B5Ij48aW5wdXQgdHlwZT0idGV4dCIgcmVhZG9ubHkgdmFsdWU9IiR7ZXNjKHN0Lm1sX25vdGlmaWNhdGlvbnNfdXJsKX0iPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtY29weT0iJHtlc2Moc3QubWxfbm90aWZpY2F0aW9uc191cmwpfSI+Q29waWFyPC9idXR0b24+PC9zcGFuPjwvbGFiZWw+CiAgICAgIDxmb3JtIGNsYXNzPSJyb3ciIGlkPSJtbENmZyI+PGxhYmVsIGNsYXNzPSJmIj5BcHAgSUQ8aW5wdXQgdHlwZT0idGV4dCIgaWQ9Im1sSWQiIHZhbHVlPSIke2VzYyhzdC5tbF9jbGllbnRfaWQpfSIgcmVxdWlyZWQ+PC9sYWJlbD48bGFiZWwgY2xhc3M9ImYiPlNlY3JldCBLZXk8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJtbFNlY3JldCIgcGxhY2Vob2xkZXI9IiR7c3QubWxfc2VjcmV0X3NldCA/ICfigKLigKLigKLigKLigKLigKIgKGd1YXJkYWRhKScgOiAnJ30iPjwvbGFiZWw+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiIHN0eWxlPSJmbGV4OjAiPkd1YXJkYXI8L2J1dHRvbj48L2Zvcm0+CiAgICA8L2Rpdj48L2Rpdj4KICA8ZGl2IGNsYXNzPSJwYW5lbCIgc3R5bGU9Im1hcmdpbi10b3A6MjBweCI+PGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+PGgyPkNvcnJlb3MgKHJlY3VwZXJhciBjb250cmFzZcOxYSk8L2gyPiR7c3QubWFpbF9rZXlfc2V0ICYmIHN0Lm1haWxfZnJvbSA/ICc8c3BhbiBjbGFzcz0ic3RhdGUgb24iPjxpPjwvaT5BY3RpdmFkbzwvc3Bhbj4nIDogJzxzcGFuIGNsYXNzPSJzdGF0ZSBlcnIiPjxpPjwvaT5TaW4gY29uZmlndXJhcjwvc3Bhbj4nfTwvZGl2PgogICAgPGRpdiBjbGFzcz0icGFuZWwtYm9keSBzdGFjayI+CiAgICAgIDxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9Im1hcmdpbjowIj5QYXJhIGVudmlhciBsb3MgY8OzZGlnb3MgZGUgNiBkw61naXRvcyBzZSB1c2EgPGEgaHJlZj0iaHR0cHM6Ly93d3cuYnJldm8uY29tIiB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciI+QnJldm88L2E+IChncmF0aXMgaGFzdGEgMzAwIGNvcnJlb3MgYWwgZMOtYSkuIENyZWEgdW5hIGN1ZW50YSwgdmVyaWZpY2EgZWwgY29ycmVvIHJlbWl0ZW50ZSB5IGNvcGlhIHVuYSBBUEkgS2V5IChDb25maWd1cmFjacOzbiDigLogU01UUCB5IEFQSSDigLogQVBJIEtleXMpLjwvcD4KICAgICAgPGZvcm0gY2xhc3M9InN0YWNrIiBpZD0ibWFpbENmZyI+CiAgICAgICAgPGRpdiBjbGFzcz0icm93Ij48bGFiZWwgY2xhc3M9ImYiPkNvcnJlbyByZW1pdGVudGUgKHZlcmlmaWNhZG8gZW4gQnJldm8pPGlucHV0IHR5cGU9ImVtYWlsIiBpZD0ibUZyb20iIHZhbHVlPSIke2VzYyhzdC5tYWlsX2Zyb20gfHwgJycpfSIgcmVxdWlyZWQ+PC9sYWJlbD48bGFiZWwgY2xhc3M9ImYiPk5vbWJyZSByZW1pdGVudGU8aW5wdXQgdHlwZT0idGV4dCIgaWQ9Im1OYW1lIiB2YWx1ZT0iJHtlc2Moc3QubWFpbF9mcm9tX25hbWUgfHwgJ0V0aXF1ZXRhSHViJyl9Ij48L2xhYmVsPjwvZGl2PgogICAgICAgIDxkaXYgY2xhc3M9InJvdyI+PGxhYmVsIGNsYXNzPSJmIj5BUEkgS2V5IGRlIEJyZXZvPGlucHV0IHR5cGU9InBhc3N3b3JkIiBpZD0ibUtleSIgcGxhY2Vob2xkZXI9IiR7c3QubWFpbF9rZXlfc2V0ID8gJ+KAouKAouKAouKAouKAouKAoiAoZ3VhcmRhZGEpJyA6ICd4a2V5c2liLeKApid9Ij48L2xhYmVsPjxsYWJlbCBjbGFzcz0iZiI+RW52aWFyIHBydWViYSBhIChvcGNpb25hbCk8aW5wdXQgdHlwZT0iZW1haWwiIGlkPSJtVGVzdCIgdmFsdWU9IiR7ZXNjKG1lLnVzZXIuZW1haWwpfSI+PC9sYWJlbD48L2Rpdj4KICAgICAgICA8ZGl2IGNsYXNzPSJyb3ciIHN0eWxlPSJqdXN0aWZ5LWNvbnRlbnQ6ZmxleC1lbmQiPjxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgdHlwZT0ic3VibWl0IiBzdHlsZT0iZmxleDowIj5HdWFyZGFyPC9idXR0b24+PC9kaXY+CiAgICAgIDwvZm9ybT4KICAgIDwvZGl2PjwvZGl2PgogIDxkaXYgY2xhc3M9InBhbmVsIiBpZD0iYmtQYW5lbCIgc3R5bGU9Im1hcmdpbi10b3A6MjBweCI+PGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+PGgyPlJlc3BhbGRvIGlubWVkaWF0byAocXVlIG5vIHNlIHBpZXJkYSBuYWRhKTwvaDI+JHtzdC5iYWNrdXA/LmNvbmZpZ3VyZWQgPyBgPHNwYW4gY2xhc3M9InN0YXRlIG9uIj48aT48L2k+QWN0aXZhZG8ke3N0LmJhY2t1cC5sYXN0T2tBdCA/ICcgwrcgw7psdGltbyAnICsgZXNjKGZtdFRpbWUoc3QuYmFja3VwLmxhc3RPa0F0KSkgOiAnJ308L3NwYW4+YCA6ICc8c3BhbiBjbGFzcz0ic3RhdGUgZXJyIj48aT48L2k+U2luIGFjdGl2YXI8L3NwYW4+J308L2Rpdj4KICAgIDxkaXYgY2xhc3M9InBhbmVsLWJvZHkgc3RhY2siPgogICAgICA8cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJtYXJnaW46MCI+UmVuZGVyIChlbCBzZXJ2aWRvciBncmF0aXMpIGEgdmVjZXMgcmVpbmljaWEgbGEgYXBwIHkgYm9ycmEgbG8gw7psdGltbyBxdWUgc2UgaGl6by4gQ29uIGVzdG8sIGNhZGEgY2FtYmlvIChpbXByaW1pciwgZGVzYmxvcXVlYXLigKYpIHNlIGd1YXJkYSBlbiBHaXRIdWIgYSBsb3MgcG9jb3Mgc2VndW5kb3MgeSBhbCByZWluaWNpYXIgbm8gc2UgcGllcmRlIG5hZGEuPC9wPgogICAgICA8b2wgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjA7cGFkZGluZy1sZWZ0OjE4cHgiPgogICAgICAgIDxsaT5BYnJlIDxhIGhyZWY9Imh0dHBzOi8vZ2l0aHViLmNvbS9zZXR0aW5ncy9wZXJzb25hbC1hY2Nlc3MtdG9rZW5zL25ldyIgdGFyZ2V0PSJfYmxhbmsiIHJlbD0ibm9vcGVuZXIiPkdpdEh1YiDigLogRmluZS1ncmFpbmVkIHRva2VuIG51ZXZvPC9hPi48L2xpPgogICAgICAgIDxsaT5Ob21icmU6IDxiPkV0aXF1ZXRhSHViIHJlc3BhbGRvPC9iPiDCtyBFeHBpcmFjacOzbjogbGEgbcOhcyBsYXJnYSAobyBzaW4gdmVuY2ltaWVudG8pLjwvbGk+CiAgICAgICAgPGxpPlJlcG9zaXRvcnkgYWNjZXNzOiA8Yj5Pbmx5IHNlbGVjdCByZXBvc2l0b3JpZXM8L2I+IOKAuiA8Yj5ldGlxdWV0YWh1YjwvYj4uPC9saT4KICAgICAgICA8bGk+UGVybWlzc2lvbnMg4oC6IFJlcG9zaXRvcnkgcGVybWlzc2lvbnMg4oC6IDxiPkNvbnRlbnRzOiBSZWFkIGFuZCB3cml0ZTwvYj4uPC9saT4KICAgICAgICA8bGk+R2VuZXJhdGUgdG9rZW4sIGPDs3BpYWxvIHkgcMOpZ2FsbyBhcXXDrSBhYmFqby48L2xpPgogICAgICA8L29sPgogICAgICAke3N0LmJhY2t1cD8ubGFzdEVycm9yID8gYDxwIGNsYXNzPSJub3RlIGJhZCIgc3R5bGU9Im1hcmdpbjowIj7Dmmx0aW1vIGVycm9yOiAke2VzYyhzdC5iYWNrdXAubGFzdEVycm9yKX08L3A+YCA6ICcnfQogICAgICA8Zm9ybSBjbGFzcz0icm93IiBpZD0iZ2hDZmciPjxsYWJlbCBjbGFzcz0iZiI+VG9rZW4gZGUgR2l0SHViPGlucHV0IHR5cGU9InBhc3N3b3JkIiBpZD0iZ2hUb2siIHBsYWNlaG9sZGVyPSIke3N0LmdoX3Rva2VuX3NldCA/ICfigKLigKLigKLigKLigKLigKIgKGd1YXJkYWRvKScgOiAnZ2l0aHViX3BhdF/igKYnfSIgYXV0b2NvbXBsZXRlPSJvZmYiPjwvbGFiZWw+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiIHN0eWxlPSJmbGV4OjAiPkd1YXJkYXIgeSByZXNwYWxkYXIgYWhvcmE8L2J1dHRvbj48L2Zvcm0+CiAgICA8L2Rpdj48L2Rpdj4KICA8ZGl2IGNsYXNzPSJtb2RhbCIgaWQ9ImNvbmZpcm0iIGhpZGRlbj48ZGl2IGNsYXNzPSJzaGVldCI+PGgzIGlkPSJjZlRpdGxlIj7Cv1NlZ3Vybz88L2gzPjxwIGNsYXNzPSJtdXRlZCIgaWQ9ImNmVGV4dCIgc3R5bGU9Im1hcmdpbjowIj48L3A+PGRpdiBpZD0iY2ZFeHRyYSI+PC9kaXY+PGRpdiBjbGFzcz0icm93IiBzdHlsZT0ianVzdGlmeS1jb250ZW50OmZsZXgtZW5kIj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUiIGlkPSJjZk5vIiBzdHlsZT0iZmxleDowIj5DYW5jZWxhcjwvYnV0dG9uPjxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgaWQ9ImNmWWVzIiBzdHlsZT0iZmxleDowIj5Db25maXJtYXI8L2J1dHRvbj48L2Rpdj48L2Rpdj48L2Rpdj5gOwogIGNvbnN0IHJvbGUgPSAkKCcjbnVSb2xlJyk7IGNvbnN0IHN5bmMgPSAoKSA9PiAkKCcjbnVTZWxsZXJXcmFwJykuaGlkZGVuID0gcm9sZS52YWx1ZSAhPT0gJ3NlbGxlcic7IHJvbGUub25jaGFuZ2UgPSBzeW5jOyBzeW5jKCk7CiAgJCgnI25ld1NlbGxlcicpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7IGUucHJldmVudERlZmF1bHQoKTsgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL2FkbWluL3NlbGxlcnMnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IG5hbWU6ICQoJyNuc05hbWUnKS52YWx1ZSB9IH0pOyB0b2FzdCgnVmVuZGVkb3IgYWdyZWdhZG8nKTsgcmVuZGVyQWRtaW4oKTsgfSBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlKTsgfSB9OwogICQoJyNuZXdVc2VyJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsgZS5wcmV2ZW50RGVmYXVsdCgpOyB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvYWRtaW4vdXNlcnMnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IG5hbWU6ICQoJyNudU5hbWUnKS52YWx1ZSwgZW1haWw6ICQoJyNudUVtYWlsJykudmFsdWUsIHJvbGU6IHJvbGUudmFsdWUsIHNlbGxlcl9pZDogJCgnI251U2VsbGVyJykudmFsdWUsIHBhc3N3b3JkOiAkKCcjbnVQYXNzJykudmFsdWUgfSB9KTsgdG9hc3QoJ1VzdWFyaW8gY3JlYWRvJyk7IHJlbmRlckFkbWluKCk7IH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSwgNDAwMCk7IH0gfTsKICBjb25zdCBjb25maXJtQm94ID0gKHRpdGxlLCB0ZXh0LCBleHRyYSA9ICcnKSA9PiBuZXcgUHJvbWlzZShyZXMgPT4gewogICAgJCgnI2NmVGl0bGUnKS50ZXh0Q29udGVudCA9IHRpdGxlOyAkKCcjY2ZUZXh0JykudGV4dENvbnRlbnQgPSB0ZXh0OyAkKCcjY2ZFeHRyYScpLmlubmVySFRNTCA9IGV4dHJhOyAkKCcjY29uZmlybScpLmhpZGRlbiA9IGZhbHNlOwogICAgJCgnI2NmTm8nKS5vbmNsaWNrID0gKCkgPT4geyAkKCcjY29uZmlybScpLmhpZGRlbiA9IHRydWU7IHJlcyhmYWxzZSk7IH07CiAgICAkKCcjY2ZZZXMnKS5vbmNsaWNrID0gKCkgPT4geyAkKCcjY29uZmlybScpLmhpZGRlbiA9IHRydWU7IHJlcyh0cnVlKTsgfTsKICB9KTsKICAkKCcjbWFpbENmZycpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICBlLnByZXZlbnREZWZhdWx0KCk7CiAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvYWRtaW4vc2V0dGluZ3MnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IG1haWxfZnJvbTogJCgnI21Gcm9tJykudmFsdWUsIG1haWxfZnJvbV9uYW1lOiAkKCcjbU5hbWUnKS52YWx1ZSwgbWFpbF9hcGlfa2V5OiAkKCcjbUtleScpLnZhbHVlLCB0ZXN0X3RvOiAkKCcjbVRlc3QnKS52YWx1ZSB9IH0pOyB0b2FzdCgkKCcjbVRlc3QnKS52YWx1ZSA/ICdHdWFyZGFkby4gVGUgZW52aWFtb3MgdW4gY29ycmVvIGRlIHBydWViYS4nIDogJ0d1YXJkYWRvJyk7IHJlbmRlckFkbWluKCk7IH0KICAgIGNhdGNoICh4KSB7IHRvYXN0KHgubWVzc2FnZSwgNTAwMCk7IH0KICB9OwogICQoJyNnaENmZycpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICBlLnByZXZlbnREZWZhdWx0KCk7IGNvbnN0IHYgPSAkKCcjZ2hUb2snKS52YWx1ZS50cmltKCk7IGlmICghdikgcmV0dXJuIHRvYXN0KCdQZWdhIGVsIHRva2VuIGRlIEdpdEh1YicpOwogICAgY29uc3QgYiA9IGUudGFyZ2V0LnF1ZXJ5U2VsZWN0b3IoJ2J1dHRvbicpOyBiLmRpc2FibGVkID0gdHJ1ZTsgYi50ZXh0Q29udGVudCA9ICdHdWFyZGFuZG8gcmVzcGFsZG/igKYnOwogICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL2FkbWluL3NldHRpbmdzJywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBnaF90b2tlbjogdiB9IH0pOyB0b2FzdCgnwqFMaXN0byEgUmVzcGFsZG8gaW5tZWRpYXRvIGFjdGl2YWRvJywgNTAwMCk7IHJlbmRlckFkbWluKCk7IH0KICAgIGNhdGNoICh4KSB7IHRvYXN0KHgubWVzc2FnZSwgNzAwMCk7IGIuZGlzYWJsZWQgPSBmYWxzZTsgYi50ZXh0Q29udGVudCA9ICdHdWFyZGFyIHkgcmVzcGFsZGFyIGFob3JhJzsgfQogIH07CiAgJCgnI21sQ2ZnJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsgZS5wcmV2ZW50RGVmYXVsdCgpOyBhd2FpdCBhcGkoJy9hcGkvYWRtaW4vc2V0dGluZ3MnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IG1sX2NsaWVudF9pZDogJCgnI21sSWQnKS52YWx1ZSwgbWxfY2xpZW50X3NlY3JldDogJCgnI21sU2VjcmV0JykudmFsdWUgfSB9KTsgdG9hc3QoJ01lcmNhZG8gTGlicmUgY29uZmlndXJhZG8nKTsgbWUubWxDb25maWd1cmVkID0gdHJ1ZTsgcmVuZGVyQWRtaW4oKTsgfTsKICAkKCcjbWFpbicpLm9uY2hhbmdlID0gYXN5bmMgZSA9PiB7IGNvbnN0IHIgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1yb2xlXScpOyBpZiAoIXIpIHJldHVybjsgdHJ5IHsgYXdhaXQgYXBpKGAvYXBpL2FkbWluL3VzZXJzLyR7ci5kYXRhc2V0LnJvbGV9L3JvbGVgLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IHJvbGU6IHIudmFsdWUgfSB9KTsgdG9hc3QoJ1JvbCBhY3R1YWxpemFkbyAoZGViZSB2b2x2ZXIgYSBpbmljaWFyIHNlc2nDs24pJyk7IH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IHJlbmRlckFkbWluKCk7IH0gfTsKICAkKCcjbWFpbicpLm9uY2xpY2sgPSBhc3luYyBlID0+IHsKICAgIGNvbnN0IGNwID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtY29weV0nKTsKICAgIGlmIChjcCkgeyBlLnByZXZlbnREZWZhdWx0KCk7IHRyeSB7IGF3YWl0IG5hdmlnYXRvci5jbGlwYm9hcmQud3JpdGVUZXh0KGNwLmRhdGFzZXQuY29weSk7IHRvYXN0KCdDb3BpYWRvJyk7IH0gY2F0Y2ggeyBjcC5wcmV2aW91c0VsZW1lbnRTaWJsaW5nLnNlbGVjdCgpOyB9IHJldHVybjsgfQogICAgY29uc3QgYWN0ID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtYWN0XScpOwogICAgaWYgKGFjdCkgewogICAgICBjb25zdCBpZCA9IGFjdC5kYXRhc2V0LmlkLCBuYW1lID0gYWN0LmRhdGFzZXQubmFtZSwga2luZCA9IGFjdC5kYXRhc2V0LmFjdDsKICAgICAgY29uc3QgdGV4dHMgPSB7CiAgICAgICAgJ3RlbXAtcGFzc3dvcmQnOiBbJ0NsYXZlIHRlbXBvcmFsJywgYFNlIHJlZW1wbGF6YSBsYSBjbGF2ZSBhY3R1YWwgZGUgJHtuYW1lfS4gQWwgZW50cmFyIGNvbiBsYSBjbGF2ZSB0ZW1wb3JhbCB0ZW5kcsOhIHF1ZSBjcmVhciB1bmEgbnVldmEuYF0sCiAgICAgICAgJ2JhY2t1cC1jb2RlJzogWydDbGF2ZSBkZSByZXNwYWxkbycsIGBTZSBjcmVhIHVuIGPDs2RpZ28gZGUgdW4gc29sbyB1c28gcGFyYSAke25hbWV9LiBTaSB5YSB0ZW7DrWEgdW5vLCBlbCBhbnRlcmlvciBkZWphIGRlIHNlcnZpci5gXSwKICAgICAgICAnc2VuZC1jb2RlJzogWydFbnZpYXIgY8OzZGlnbycsIGBMZSBsbGVnYSBhICR7bmFtZX0gdW4gY8OzZGlnbyBkZSA2IGTDrWdpdG9zIGEgc3UgY29ycmVvIHBhcmEgZW50cmFyIG8gY2FtYmlhciBzdSBjbGF2ZS5gXSwKICAgICAgICAnaW1wZXJzb25hdGUnOiBbJ0VudHJhciBjb21vICcgKyBuYW1lLCAnVmVyw6FzIGxhIGFwcCBjb21vIGxhIHZlIGVzdGEgcGVyc29uYSwgc2luIG5lY2VzaXRhciBzdSBjbGF2ZS4gUXVlZGEgcmVnaXN0cmFkby4gUGFyYSBzYWxpciBhcHJpZXRhICJWb2x2ZXIgYSBtaSBjdWVudGEiLiddLAogICAgICB9OwogICAgICBpZiAoIWF3YWl0IGNvbmZpcm1Cb3godGV4dHNba2luZF1bMF0sIHRleHRzW2tpbmRdWzFdKSkgcmV0dXJuOwogICAgICB0cnkgewogICAgICAgIGNvbnN0IHIgPSBhd2FpdCBhcGkoYC9hcGkvYWRtaW4vdXNlcnMvJHtpZH0vJHtraW5kfWAsIHsgbWV0aG9kOiAnUE9TVCcgfSk7CiAgICAgICAgaWYgKGtpbmQgPT09ICdpbXBlcnNvbmF0ZScpIHsgbG9jYXRpb24uaHJlZiA9ICcvJzsgcmV0dXJuOyB9CiAgICAgICAgaWYgKHIucGFzc3dvcmQgfHwgci5jb2RlKSB7CiAgICAgICAgICBjb25zdCB2YWwgPSByLnBhc3N3b3JkIHx8IHIuY29kZTsKICAgICAgICAgIGF3YWl0IGNvbmZpcm1Cb3goa2luZCA9PT0gJ3RlbXAtcGFzc3dvcmQnID8gJ0NsYXZlIHRlbXBvcmFsIGRlICcgKyBuYW1lIDogJ0NsYXZlIGRlIHJlc3BhbGRvIGRlICcgKyBuYW1lLAogICAgICAgICAgICBraW5kID09PSAndGVtcC1wYXNzd29yZCcgPyAnRMOtc2VsYSBhbCB1c3VhcmlvLiBTb2xvIHNlIG11ZXN0cmEgYWhvcmE7IGFsIGVudHJhciB0ZW5kcsOhIHF1ZSBjcmVhciBzdSBwcm9waWEgY2xhdmUuJyA6ICdQw6FzYXNlbGEgYWwgdXN1YXJpbyBwYXJhIHF1ZSBsYSBndWFyZGUgZW4gdW4gbHVnYXIgc2VndXJvLiBTaXJ2ZSB1bmEgc29sYSB2ZXosIGVuIGVsIGNhbXBvIENvbnRyYXNlw7FhLiBTb2xvIHNlIG11ZXN0cmEgYWhvcmEuJywKICAgICAgICAgICAgYDxkaXYgY2xhc3M9ImNvcHkiPjxpbnB1dCB0eXBlPSJ0ZXh0IiByZWFkb25seSB2YWx1ZT0iJHtlc2ModmFsKX0iIHN0eWxlPSJmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6MjBweDt0ZXh0LWFsaWduOmNlbnRlciI+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1jb3B5PSIke2VzYyh2YWwpfSI+Q29waWFyPC9idXR0b24+PC9kaXY+YCk7CiAgICAgICAgfSBlbHNlIHRvYXN0KHIubWVzc2FnZSB8fCAnTGlzdG8nKTsKICAgICAgICByZW5kZXJBZG1pbigpOwogICAgICB9IGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UsIDUwMDApOyB9CiAgICAgIHJldHVybjsKICAgIH0KICAgIGNvbnN0IHMgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1kZWxzXScpLCB1ID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtZGVsdV0nKSwgcCA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLXB3XScpOwogICAgaWYgKHMgJiYgYXdhaXQgY29uZmlybUJveCgnRWxpbWluYXIgdmVuZGVkb3InLCAnU2UgYm9ycmFuIHN1cyBjb25leGlvbmVzLCBibG9xdWVvcywgcGVkaWRvcyB5IHVzdWFyaW9zLicpKSB7IGF3YWl0IGFwaShgL2FwaS9hZG1pbi9zZWxsZXJzLyR7cy5kYXRhc2V0LmRlbHN9YCwgeyBtZXRob2Q6ICdERUxFVEUnIH0pOyB0b2FzdCgnVmVuZGVkb3IgZWxpbWluYWRvJyk7IHJlbmRlckFkbWluKCk7IH0KICAgIGlmICh1ICYmIGF3YWl0IGNvbmZpcm1Cb3goJ0VsaW1pbmFyIHVzdWFyaW8nLCAnWWEgbm8gcG9kcsOhIGVudHJhciBhIEV0aXF1ZXRhSHViLicpKSB7IGF3YWl0IGFwaShgL2FwaS9hZG1pbi91c2Vycy8ke3UuZGF0YXNldC5kZWx1fWAsIHsgbWV0aG9kOiAnREVMRVRFJyB9KTsgdG9hc3QoJ1VzdWFyaW8gZWxpbWluYWRvJyk7IHJlbmRlckFkbWluKCk7IH0KICAgIGlmIChwICYmIGF3YWl0IGNvbmZpcm1Cb3goJ0NhbWJpYXIgY29udHJhc2XDsWEnLCAnRXNjcmliZSBsYSBudWV2YSBjb250cmFzZcOxYSAobcOtbmltbyA4IGNhcmFjdGVyZXMpLicsICc8aW5wdXQgdHlwZT0idGV4dCIgaWQ9ImNmUHciIG1pbmxlbmd0aD0iOCI+JykpIHsKICAgICAgdHJ5IHsgYXdhaXQgYXBpKGAvYXBpL2FkbWluL3VzZXJzLyR7cC5kYXRhc2V0LnB3fS9wYXNzd29yZGAsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgcGFzc3dvcmQ6ICQoJyNjZlB3JykudmFsdWUgfSB9KTsgdG9hc3QoJ0NvbnRyYXNlw7FhIGFjdHVhbGl6YWRhJyk7IH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IH0KICAgIH0KICB9Owp9CgovLyAtLS0tLS0tLS0tIG1pIGNsYXZlIC0tLS0tLS0tLS0KZnVuY3Rpb24gcmVuZGVyTXlBY2NvdW50KGZvcmNlZCA9IGZhbHNlKSB7CiAgJCgnI2FwcCcpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJsb2dpbiI+PGRpdiBjbGFzcz0iY2FyZCI+PGRpdiBjbGFzcz0iYXJ0Ij4ke0hFUk9fU1ZHfTwvZGl2Pjxmb3JtIGlkPSJteUZvcm0iPgogICAgPGgxPiR7Zm9yY2VkID8gJ0NyZWEgdHUgY2xhdmUgbnVldmEnIDogJ01pIGNsYXZlJ308L2gxPgogICAgPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjAiPiR7Zm9yY2VkID8gJ0VudHJhc3RlIGNvbiB1bmEgY2xhdmUgdGVtcG9yYWwgbyBkZSByZXNwYWxkby4gQ3JlYSB0dSBwcm9waWEgY29udHJhc2XDsWEgcGFyYSBzZWd1aXIuJyA6IGVzYyhtZS51c2VyLmVtYWlsKX08L3A+CiAgICAke2ZvcmNlZCA/ICcnIDogJzxsYWJlbCBjbGFzcz0iZiI+Q29udHJhc2XDsWEgYWN0dWFsPGlucHV0IHR5cGU9InBhc3N3b3JkIiBpZD0ibUN1ciIgYXV0b2NvbXBsZXRlPSJjdXJyZW50LXBhc3N3b3JkIiByZXF1aXJlZD48L2xhYmVsPid9CiAgICA8bGFiZWwgY2xhc3M9ImYiPk51ZXZhIGNvbnRyYXNlw7FhIChtw61uaW1vIDgpPGlucHV0IHR5cGU9InBhc3N3b3JkIiBpZD0ibVAxIiBhdXRvY29tcGxldGU9Im5ldy1wYXNzd29yZCIgbWlubGVuZ3RoPSI4IiByZXF1aXJlZD48L2xhYmVsPgogICAgPGxhYmVsIGNsYXNzPSJmIj5SZXDDrXRlbGE8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJtUDIiIGF1dG9jb21wbGV0ZT0ibmV3LXBhc3N3b3JkIiBtaW5sZW5ndGg9IjgiIHJlcXVpcmVkPjwvbGFiZWw+CiAgICA8bGFiZWwgY2xhc3M9InN3aXRjaCIgc3R5bGU9ImZvbnQtc2l6ZToxM3B4Ij48aW5wdXQgdHlwZT0iY2hlY2tib3giIGlkPSJtU2hvdyI+IE1vc3RyYXIgY29udHJhc2XDsWE8L2xhYmVsPgogICAgPGRpdiBjbGFzcz0iZXJyIiBpZD0ibUVyciI+PC9kaXY+CiAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIHR5cGU9InN1Ym1pdCI+R3VhcmRhcjwvYnV0dG9uPgogICAgJHtmb3JjZWQgPyAnJyA6ICc8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWdob3N0IiB0eXBlPSJidXR0b24iIGlkPSJtQmFja3VwIj5DcmVhciBtaSBjbGF2ZSBkZSByZXNwYWxkbzwvYnV0dG9uPjxkaXYgaWQ9Im1CYWNrdXBPdXQiPjwvZGl2PjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSIgdHlwZT0iYnV0dG9uIiBpZD0ibUJhY2siPlZvbHZlcjwvYnV0dG9uPid9CiAgPC9mb3JtPjwvZGl2PjwvZGl2PmA7CiAgJCgnI21TaG93Jykub25jaGFuZ2UgPSBlID0+IHsgJCQoJyNteUZvcm0gaW5wdXRbdHlwZT1wYXNzd29yZF0sICNteUZvcm0gaW5wdXRbZGF0YS1wd10nKS5mb3JFYWNoKGkgPT4geyBpLmRhdGFzZXQucHcgPSAxOyBpLnR5cGUgPSBlLnRhcmdldC5jaGVja2VkID8gJ3RleHQnIDogJ3Bhc3N3b3JkJzsgfSk7IH07CiAgJCgnI215Rm9ybScpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICBlLnByZXZlbnREZWZhdWx0KCk7CiAgICBpZiAoJCgnI21QMScpLnZhbHVlICE9PSAkKCcjbVAyJykudmFsdWUpIHJldHVybiAoJCgnI21FcnInKS50ZXh0Q29udGVudCA9ICdMYXMgY29udHJhc2XDsWFzIG5vIGNvaW5jaWRlbicpOwogICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL21lL3Bhc3N3b3JkJywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBjdXJyZW50OiBmb3JjZWQgPyAnJyA6ICQoJyNtQ3VyJykudmFsdWUsIHBhc3N3b3JkOiAkKCcjbVAxJykudmFsdWUgfSB9KTsgdG9hc3QoJ0NvbnRyYXNlw7FhIGd1YXJkYWRhJyk7IGJvb3QoKTsgfQogICAgY2F0Y2ggKHgpIHsgJCgnI21FcnInKS50ZXh0Q29udGVudCA9IHgubWVzc2FnZTsgfQogIH07CiAgaWYgKCFmb3JjZWQpIHsKICAgICQoJyNtQmFjaycpLm9uY2xpY2sgPSAoKSA9PiBib290KCk7CiAgICAkKCcjbUJhY2t1cCcpLm9uY2xpY2sgPSBhc3luYyAoKSA9PiB7CiAgICAgIHRyeSB7CiAgICAgICAgY29uc3QgciA9IGF3YWl0IGFwaSgnL2FwaS9tZS9iYWNrdXAtY29kZScsIHsgbWV0aG9kOiAnUE9TVCcgfSk7CiAgICAgICAgJCgnI21CYWNrdXBPdXQnKS5pbm5lckhUTUwgPSBgPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEzcHg7bWFyZ2luOjAgMCA2cHgiPkd1w6FyZGFsYSBlbiB1biBsdWdhciBzZWd1cm8gKGZvdG8sIHBhcGVsIG8gbm90YXMgZGVsIGNlbHVsYXIpLiBTaXJ2ZSB1bmEgc29sYSB2ZXogZW4gZWwgY2FtcG8gQ29udHJhc2XDsWEgc2kgb2x2aWRhcyB0dSBjbGF2ZS4gU2kgY3JlYXMgb3RyYSwgZXN0YSBkZWphIGRlIHNlcnZpci48L3A+PGlucHV0IHR5cGU9InRleHQiIHJlYWRvbmx5IHZhbHVlPSIke2VzYyhyLmNvZGUpfSIgc3R5bGU9ImZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZToyMHB4O3RleHQtYWxpZ246Y2VudGVyIj5gOwogICAgICB9IGNhdGNoICh4KSB7ICQoJyNtRXJyJykudGV4dENvbnRlbnQgPSB4Lm1lc3NhZ2U7IH0KICAgIH07CiAgfQp9CgovLyAtLS0tLS0tLS0tIGluaWNpbyAtLS0tLS0tLS0tCmFzeW5jIGZ1bmN0aW9uIGJvb3QoKSB7CiAgdHJ5IHsgbWUgPSBhd2FpdCBhcGkoJy9hcGkvbWUnKTsgfQogIGNhdGNoIHsKICAgIGNvbnN0IGggPSBhd2FpdCBmZXRjaCgnL2FwaS9zZXR1cC1zdGF0dXMnKS50aGVuKHIgPT4gci5qc29uKCkpLmNhdGNoKCgpID0+ICh7fSkpOwogICAgcmV0dXJuIGgubmVlZHNTZXR1cCA/IHJlbmRlclNldHVwKCkgOiByZW5kZXJMb2dpbihoLmRlbW8pOwogIH0KICBmaXJzdExvYWQgPSB0cnVlOwogIGlmIChtZS5tdXN0Q2hhbmdlKSByZXR1cm4gcmVuZGVyTXlBY2NvdW50KHRydWUpOwogIGlmIChsb2NhdGlvbi5wYXRobmFtZSA9PT0gJy9jb2RpZ28nKSByZXR1cm4gc2F2ZUNvZGVGcm9tTGluaygpOwogIHJlbmRlclNoZWxsKCk7Cn0KYm9vdCgpOwp9KSgpOwo=","index.html":"PCFkb2N0eXBlIGh0bWw+CjxodG1sIGxhbmc9ImVzIj4KPGhlYWQ+CjxtZXRhIGNoYXJzZXQ9InV0Zi04Ij4KPG1ldGEgbmFtZT0idmlld3BvcnQiIGNvbnRlbnQ9IndpZHRoPWRldmljZS13aWR0aCwgaW5pdGlhbC1zY2FsZT0xLCB2aWV3cG9ydC1maXQ9Y292ZXIiPgo8dGl0bGU+RXRpcXVldGFIdWI8L3RpdGxlPgo8bGluayByZWw9Imljb24iIGhyZWY9Ii9sb2dvLnN2ZyIgdHlwZT0iaW1hZ2Uvc3ZnK3htbCI+CjxsaW5rIHJlbD0icHJlY29ubmVjdCIgaHJlZj0iaHR0cHM6Ly9mb250cy5nb29nbGVhcGlzLmNvbSI+CjxsaW5rIHJlbD0ic3R5bGVzaGVldCIgaHJlZj0iaHR0cHM6Ly9mb250cy5nb29nbGVhcGlzLmNvbS9jc3MyP2ZhbWlseT1CYWxvbysyOndnaHRANjAwOzcwMDs4MDAmZmFtaWx5PVBhY2lmaWNvJmZhbWlseT1OdW5pdG8rU2FuczpvcHN6LHdnaHRANi4uMTIsNDAwOzYuLjEyLDYwMDs2Li4xMiw3MDAmZmFtaWx5PUpldEJyYWlucytNb25vOndnaHRANTAwOzcwMCZkaXNwbGF5PXN3YXAiPgo8bGluayByZWw9InN0eWxlc2hlZXQiIGhyZWY9Ii9hcHAuY3NzIj4KPC9oZWFkPgo8Ym9keT4KPGRpdiBpZD0iYXBwIj48ZGl2IHN0eWxlPSJtaW4taGVpZ2h0OjEwMHZoO2Rpc3BsYXk6Z3JpZDtwbGFjZS1pdGVtczpjZW50ZXI7Zm9udC1mYW1pbHk6c3lzdGVtLXVpLHNhbnMtc2VyaWY7Y29sb3I6IzBBNkZBNjtmb250LXdlaWdodDo3MDAiPkNhcmdhbmRvIEV0aXF1ZXRhSHVi4oCmIChsYSBwcmltZXJhIHZleiBwdWVkZSB0YXJkYXIgaGFzdGEgMSBtaW51dG8pPC9kaXY+PC9kaXY+CjxkaXYgY2xhc3M9InRvYXN0IiBpZD0idG9hc3QiIGhpZGRlbj48L2Rpdj4KPHNjcmlwdCBzcmM9Ii9hcHAuanMiPjwvc2NyaXB0Pgo8L2JvZHk+CjwvaHRtbD4K","logo.svg":"PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0MCA0MCI+PHJlY3QgeD0iNCIgeT0iOCIgd2lkdGg9IjMyIiBoZWlnaHQ9IjI2IiByeD0iNyIgZmlsbD0iIzE2OTNEMyIvPjxwYXRoIGQ9Ik00IDE2aDMyIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iMi41Ii8+PHJlY3QgeD0iMTAiIHk9IjIxIiB3aWR0aD0iMTIiIGhlaWdodD0iMyIgcng9IjEuNSIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjEwIiB5PSIyNiIgd2lkdGg9IjgiIGhlaWdodD0iMyIgcng9IjEuNSIgZmlsbD0iI0JGRTZGOCIvPjxjaXJjbGUgY3g9IjI5IiBjeT0iMjYiIHI9IjQiIGZpbGw9IiNmZmYiLz48L3N2Zz4K"};
__req('index', './start');
