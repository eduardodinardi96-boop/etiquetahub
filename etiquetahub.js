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
CREATE TABLE IF NOT EXISTS user_prefs (user_id INTEGER NOT NULL, key TEXT NOT NULL, value TEXT, PRIMARY KEY (user_id, key));
CREATE TABLE IF NOT EXISTS item_thumb (marketplace TEXT NOT NULL, key TEXT NOT NULL, url TEXT, fetched_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (marketplace, key));
CREATE TABLE IF NOT EXISTS return_codes (seller_id INTEGER NOT NULL, day TEXT NOT NULL, code TEXT NOT NULL, set_by TEXT, set_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (seller_id, day));`);

// Migraciones simples (columnas nuevas)
for (const [t, c, def] of [['users', 'must_change', 'INTEGER NOT NULL DEFAULT 0'], ['sessions', 'impersonator_id', 'INTEGER'], ['users', 'backup_hash', 'TEXT'], ['orders', 'block_no', 'INTEGER'], ['orders', 'unblocked_at', 'TEXT'], ['orders', 'unblocked_by', 'TEXT'], ['orders', 'unprinted_at', 'TEXT'], ['item_family', 'family_id', 'TEXT'], ['item_family', 'up_id', 'TEXT'], ['sales', 'sold_at', 'TEXT']]) {
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
    // cantidad sin recuadro, en negro y grande para que se lea bien al separar
    const qt = b.qty + 'x';
    page.drawText(qt, { x: PAD, y: y - 1, size: 11, font: fonts.bold, color: rgb(0, 0, 0) });
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
    // cantidad sin recuadro, en negro y grande para que se lea bien al separar
    const qt = b.qty + 'x';
    page.drawText(qt, { x: PAD + 2, y: y - 1, size: 11, font: fonts.bold, color: black });
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

// GET con cabeceras extra (p. ej. Api-Version para Mercado Ads)
async function apiH(conn, path, headers = {}) {
  const tk = await token(conn);
  return request(`${API}${path}`, { headers: { authorization: `Bearer ${tk}`, ...headers } }, { retries: 1 });
}
async function apiSend(conn, method, path, body) {
  const tk = await token(conn);
  return request(`${API}${path}`, { method, headers: { authorization: `Bearer ${tk}`, 'content-type': 'application/json', accept: 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, { retries: 0 });
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
  // Flex que Mercado Libre reprogramó para otro día (se pasó del plazo de entrega): también se pregunta
  const dayCL = v => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date(v));
  const flexMoved = logistic === 'self_service' && dBy && (first.date_created || sh.date_created) && dayCL(dBy) > dayCL(first.date_created || sh.date_created);
  if (dBy && (new Date(dBy) < new Date() || flexMoved) && !alreadyOut(sh) && sh.status !== 'cancelled') {
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
    meta: { status: sh.status, substatus: sh.substatus, buffered_until: sh.status === 'pending' && sh.substatus === 'buffered' ? (sh.shipping_option?.buffering?.date || null) : null, logistic, dispatch_by: dBy, ml_delayed: mlDelayed, delivery_limit: sh.shipping_option?.estimated_delivery_limit?.date || sh.lead_time?.estimated_delivery_limit?.date || null, out: alreadyOut(sh), customer: sh.receiver_address?.receiver_name || [first.buyer?.first_name, first.buyer?.last_name].filter(Boolean).join(' ') || first.buyer?.nickname || '' },
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
    // pagada o cancelada: la cancelada también se procesa, así el pedido sale altiro de la app y de los conteos
    if (!['paid', 'cancelled'].includes(o.status)) return null;
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

module.exports = { raw: api, apiH, apiSend, itemIds, families, sales, debugOrder, refresh, authUrl, exchangeCode, whoAmI, listShipments, fetchLabel, fromNotification };

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
module.exports = { list, call, refresh, debugOrder, sales, debugList, test, listShipments, fetchLabel, normalize, orderItems };

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
    // cancelada en Paris: el envío queda en estado 18 o todos sus productos tienen motivo de cancelación
    cancelled: Number(sh.statusId) === 18 || (() => { const its = (sh.items?.length ? sh.items : sub.items) || []; return its.length > 0 && its.every(i => i.cancellationReasonId || i.cancellationReason); })(),
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
module.exports = { raw: api, flatten, refresh, debugOrder, sales, test, listShipments, fetchLabel };

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

// primer plazo de despacho que informó el marketplace (si después lo corre, el paquete igual quedó atrasado)
function firstDispatch(oldMeta, m) {
  let o = {}; try { o = JSON.parse(oldMeta || '{}'); } catch { /* vacío */ }
  const c = [o.dispatch_first, o.dispatch_by, m?.dispatch_by].filter(Boolean).map(v => ({ v, t: new Date(String(v).includes('T') ? v : String(v).replace(' ', 'T')).getTime() })).filter(x => isFinite(x.t));
  return c.length ? c.sort((a, b) => a.t - b.t)[0].v : null;
}
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
    .run(JSON.stringify(s.items), JSON.stringify({ ...(s.meta || {}), cancelled: Boolean(s.cancelled), dispatch_first: firstDispatch(existing.meta, s.meta) }), state, existing.id);
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

// Un pedido que no se pudo revisar pasa al final de la fila (si no, siempre ocuparía los primeros cupos y
// otros pedidos —p. ej. los cancelados— nunca se volverían a revisar)
const touch = id => { try { db.prepare("UPDATE orders SET updated_at=datetime('now') WHERE id=?").run(id); } catch { /* nada */ } };
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
      const open = db.prepare("SELECT * FROM orders WHERE connection_id=? AND state IN ('waiting','ready','error') ORDER BY updated_at ASC").all(connId).filter(o => !seen.has(String(o.external_id)));
      for (const o of open.slice(0, 150)) { // las menos actualizadas primero, así ninguna queda sin revisar (p. ej. canceladas)
        try { const s = await connectors[row.marketplace].refresh(conn, o); if (s) list.push(s); else touch(o.id); } catch (e) { touch(o.id); console.warn('[sync] refrescar', o.order_number, e.message); }
      }
      // Impresas que aún no figuran como enviadas: se revisan por turnos (las menos actualizadas primero) para saber
      // si el centro de envío ya las recibió/escaneó y así sacarlas de "Etiquetas impresas"
      const printedOpen = db.prepare("SELECT * FROM orders WHERE connection_id=? AND state='printed' ORDER BY updated_at ASC LIMIT 80").all(connId).filter(o => !seen.has(String(o.external_id)));
      for (const o of printedOpen) {
        try { const s = await connectors[row.marketplace].refresh(conn, o); if (s) list.push(s); else touch(o.id); } catch (e) { touch(o.id); console.warn('[sync] refrescar impresa', o.order_number, e.message); }
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

// Hora de la venta en ISO (las fechas sin zona horaria vienen en hora de Chile)
function toIso(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/[zZ]$|[+-]\d\d:?\d\d$/.test(s)) { const d = new Date(s); return isNaN(d) ? null : d.toISOString(); }
  const g = new Date(s.replace(' ', 'T') + 'Z'); if (isNaN(g)) return null;
  const wall = new Date(new Intl.DateTimeFormat('sv-SE', { timeZone: cfg.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(g).replace(' ', 'T') + 'Z');
  return new Date(g.getTime() + (g - wall)).toISOString();
}
function saveWindow(row, list, fromDay, toDay) {
  const upS = db.prepare(`INSERT INTO sales (marketplace, external_id, seller_id, day, amount, units, sold_at, updated_at) VALUES (?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(marketplace, external_id) DO UPDATE SET day=excluded.day, amount=excluded.amount, units=excluded.units, seller_id=excluded.seller_id, sold_at=COALESCE(excluded.sold_at, sales.sold_at), updated_at=excluded.updated_at`);
  const delI = db.prepare('DELETE FROM sale_items WHERE marketplace=? AND order_id=?');
  const insI = db.prepare('INSERT INTO sale_items (marketplace, order_id, line, seller_id, day, sku, pub_id, name, variant, qty, amount) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const seen = new Set();
  db.exec('BEGIN');
  try {
    for (const s of list) {
      const day = s.localDay || (s.at ? localDay(new Date(s.at)) : null);
      if (!day) continue;
      upS.run(row.marketplace, s.id, row.seller_id, day, s.amount || 0, s.units || 1, toIso(s.at));
      if (Array.isArray(s.items)) {
        delI.run(row.marketplace, s.id);
        s.items.forEach((it, i) => insI.run(row.marketplace, s.id, i, row.seller_id, day, it.sku || '', it.pub_id || '', it.name || 'Producto', it.variant || '', it.qty || 1, it.amount || 0));
      }
      seen.add(s.id);
    }
    // lo que ya no viene (cancelado) dentro de la ventana se quita (si la respuesta vino vacía no se borra nada: puede ser una falla de la API)
    if (list.length) for (const r of db.prepare('SELECT external_id FROM sales WHERE marketplace=? AND seller_id=? AND day>=? AND day<=?').all(row.marketplace, row.seller_id, fromDay, toDay)) {
      if (!seen.has(r.external_id)) { db.prepare('DELETE FROM sales WHERE marketplace=? AND external_id=?').run(row.marketplace, r.external_id); delI.run(row.marketplace, r.external_id); }
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

// Reparación única: el historial de Mercado Libre quedó incompleto (ventas antiguas sin cargar); se vuelve a traer
try {
  db.exec('CREATE TABLE IF NOT EXISTS app_flags (k TEXT PRIMARY KEY, at TEXT)');
  if (!db.prepare("SELECT 1 FROM app_flags WHERE k='ml_sales_backfill_v2'").get()) {
    db.prepare("DELETE FROM sales_sync WHERE connection_id IN (SELECT id FROM connections WHERE marketplace='ml')").run();
    db.prepare("INSERT INTO app_flags (k, at) VALUES ('ml_sales_backfill_v2', datetime('now'))").run();
  }
} catch (e) { console.warn('[ventas] reparación', e.message); }

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
        // los últimos 4 meses se completan rápido (varias ventanas por vuelta); lo más antiguo, de a una
        for (let k = 0; k < 6; k++) {
          const to = new Date(st.backfilled_to);
          if (to.getTime() <= limit || (k > 0 && to.getTime() < now - 120 * 864e5)) break;
          const start = new Date(Math.max(limit, to.getTime() - BACKFILL_STEP * 864e5));
          const list = await c.sales(conn, start.toISOString(), to.toISOString());
          saveWindow(row, list, localDay(new Date(start.getTime() + 864e5)), localDay(new Date(to.getTime() - 864e5)));
          db.prepare('UPDATE sales_sync SET backfilled_to=? WHERE connection_id=?').run(start.toISOString(), row.id);
          st = { backfilled_to: start.toISOString() };
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

// Resumen de ventas de un período (por defecto los últimos 7 días, hoy incluido) para un vendedor o para todos.
// Hasta 62 días se muestra por día; hasta ~9 meses por semana; más largo, por mes. "Hoy" y "ayer" van siempre aparte.
function summary(sellerId, from, to) {
  const isDay = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
  const t0 = today();
  if (!isDay(to) || to > t0) to = t0;
  if (!isDay(from)) from = localDay(new Date(new Date(to + 'T12:00:00Z').getTime() - 6 * 864e5));
  if (from > to) from = to;
  const addD = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const nDays = Math.round((new Date(to + 'T12:00:00Z') - new Date(from + 'T12:00:00Z')) / 864e5) + 1;
  const group = nDays <= 62 ? 'day' : nDays <= 270 ? 'week' : 'month';
  const buckets = [];
  for (let d = from; d <= to;) {
    let end;
    if (group === 'day') end = d;
    else if (group === 'week') { const wd = (new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7; end = addD(d, 6 - wd); } // semana de lunes a domingo
    else { const x = new Date(d + 'T12:00:00Z'); end = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).toISOString().slice(0, 10); }
    if (end > to) end = to;
    buckets.push({ from: d, to: end });
    d = addD(end, 1);
  }
  const yest = addD(t0, -1);
  const lo = from < yest ? from : yest;
  const where = sellerId ? 'AND seller_id = ?' : '';
  const args = sellerId ? [lo, sellerId] : [lo];
  const rows = db.prepare(`SELECT day, marketplace, SUM(amount) amount, COUNT(*) orders, SUM(units) units FROM sales WHERE day >= ? ${where} GROUP BY day, marketplace`).all(...args);
  const sum = (mk, a, b) => rows.filter(r => r.marketplace === mk && r.day >= a && r.day <= b).reduce((x, r) => ({ amount: x.amount + (r.amount || 0), orders: x.orders + r.orders, units: x.units + (r.units || 0) }), { amount: 0, orders: 0, units: 0 });
  const series = {}, td = {}, yd = {};
  for (const mk of ['ml', 'fa', 'pa']) {
    series[mk] = buckets.map(b => { const x = sum(mk, b.from, b.to); return { day: b.from, to: b.to, amount: Math.round(x.amount), orders: x.orders, units: x.units }; });
    const a = sum(mk, t0, t0), y = sum(mk, yest, yest);
    td[mk] = { amount: Math.round(a.amount), orders: a.orders }; yd[mk] = { amount: Math.round(y.amount), orders: y.orders };
  }
  const conns = db.prepare(`SELECT DISTINCT marketplace FROM connections WHERE marketplace IN ('ml','fa','pa') ${sellerId ? 'AND seller_id = ?' : ''}`).all(...(sellerId ? [sellerId] : [])).map(r => r.marketplace);
  return { from, to, group, days: buckets.map(b => b.from), ends: buckets.map(b => b.to), today: t0, td, yd, series, connected: conns, updatedAt: lastRun || null };
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
// ¿El producto vendido está en la lista de bloqueados del vendedor? (el fulfillment no lo trabaja)
function blockedMatcher() {
  const norm = v => { const x = String(v || '').trim().toUpperCase().replace(/[\s#-]+/g, ''); return x ? [x, x.replace(/^MLC/, '')] : []; };
  const rules = new Map();
  for (const b of db.prepare('SELECT seller_id, marketplace, value FROM blocklist').all()) {
    if (!rules.has(b.seller_id)) rules.set(b.seller_id, []);
    rules.get(b.seller_id).push({ mk: b.marketplace, keys: norm(b.value) });
  }
  return r => {
    const list = rules.get(r.seller_id); if (!list) return false;
    const keys = new Set([...norm(r.sku), ...norm(r.pub_id), ...norm(r.family_id), ...norm(r.up_id)]);
    return list.some(x => (x.mk === 'any' || x.mk === r.marketplace) && x.keys.some(k => keys.has(k)));
  };
}
function products(sellerId, from, to, { excludeBlocked = false } = {}) {
  const args = [from, to]; let where = 'day >= ? AND day <= ?';
  if (sellerId) { where += ' AND i.seller_id = ?'; args.push(sellerId); }
  const rows = db.prepare(`SELECT i.*, s.name seller, f.family, f.family_id, f.up_id FROM sale_items i LEFT JOIN sellers s ON s.id = i.seller_id
    LEFT JOIN item_family f ON f.marketplace = i.marketplace AND f.pub_id = i.pub_id WHERE ${where}`).all(...args);
  // Se agrupa por publicación (en Mercado Libre, el ID MLC… que comparte todas sus variantes); dentro, por variante
  // para el fulfillment: no se cuentan los productos que el vendedor bloqueó (el fulfillment no los trabaja)
  const isBlockedItem = excludeBlocked ? blockedMatcher() : () => false;
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

// Notificaciones: se revisan seguido solo los últimos 2 días (liviano)
let lastRecent = 0, runningRecent = null;
async function refreshRecent() {
  if (runningRecent) return runningRecent;
  if (Date.now() - lastRecent < 3 * 60e3) return;
  lastRecent = Date.now();
  const sync = require('./sync');
  runningRecent = (async () => {
    const now = Date.now();
    for (const row of db.prepare("SELECT * FROM connections WHERE marketplace IN ('ml','fa','pa')").all()) {
      const c = sync.connectors[row.marketplace];
      if (!c.sales) continue;
      try { saveWindow(row, await c.sales(sync.connObj(row), new Date(now - 2 * 864e5).toISOString(), null), localDay(new Date(now - 864e5)), today()); }
      catch (e) { console.warn('[notif]', row.marketplace, row.seller_id, e.message); }
    }
  })().finally(() => { runningRecent = null; });
  return runningRecent;
}
// Imágenes de los productos vendidos (se guardan para no pedirlas de nuevo)
let thumbBusy = false;
async function fillThumbs(wanted) {
  if (thumbBusy || !wanted.length) return; thumbBusy = true;
  const sync = require('./sync');
  const put = db.prepare("INSERT OR REPLACE INTO item_thumb (marketplace, key, url, fetched_at) VALUES (?,?,?,datetime('now'))");
  try {
    const bySeller = new Map();
    for (const w of wanted) { const k = w.marketplace + '|' + w.seller_id; if (!bySeller.has(k)) bySeller.set(k, []); bySeller.get(k).push(w.key); }
    for (const [k, keys] of bySeller) {
      const [mk, sid] = k.split('|');
      const row = db.prepare('SELECT * FROM connections WHERE seller_id=? AND marketplace=?').get(Number(sid), mk); if (!row) continue;
      const conn = sync.connObj(row), uniq = [...new Set(keys)];
      try {
        if (mk === 'ml') {
          const ml = require('./connectors/ml');
          for (let i = 0; i < uniq.length; i += 20) {
            const chunk = uniq.slice(i, i + 20); const got = new Set();
            const r = await ml.raw(conn, `/items?ids=${chunk.join(',')}&attributes=id,thumbnail,pictures`).catch(() => []);
            for (const x of r || []) if (x.body?.id) { got.add(x.body.id); put.run('ml', x.body.id, String(x.body.pictures?.[0]?.secure_url || x.body.thumbnail || '').replace('http://', 'https://')); }
            for (const id of chunk) if (!got.has(id)) put.run('ml', id, '');
          }
        } else if (mk === 'fa') {
          const fa = require('./connectors/falabella');
          for (let i = 0; i < uniq.length; i += 20) {
            const chunk = uniq.slice(i, i + 20); const got = new Set();
            const b = await fa.call(conn.creds, 'GetProducts', { SkuSellerList: JSON.stringify(chunk), Filter: 'all' }).catch(() => ({}));
            const prods = b?.Products?.Product ? [].concat(b.Products.Product) : [];
            for (const pr of prods) { const img = pr.MainImage || [].concat(pr.Images?.Image || [])[0] || ''; if (pr.SellerSku) { got.add(pr.SellerSku); put.run('fa', pr.SellerSku, typeof img === 'string' ? img : ''); } }
            for (const id of chunk) if (!got.has(id)) put.run('fa', id, '');
          }
        } else for (const id of uniq) put.run(mk, id, '');
      } catch (e) { console.warn('[thumbs]', mk, e.message); }
    }
  } finally { thumbBusy = false; }
}
function feed(sellerIds, limit = 80, { noMoney = false } = {}) {
  const ids = (sellerIds || []).map(Number).filter(Boolean); const inq = ids.length ? `AND s.seller_id IN (${ids.map(() => '?').join(',')})` : 'AND 0';
  const since = localDay(new Date(Date.now() - 3 * 864e5));
  const rows = db.prepare(`SELECT s.marketplace, s.external_id, s.seller_id, s.day, s.amount, s.units, COALESCE(s.sold_at, s.updated_at) AS at, se.name AS seller
    FROM sales s JOIN sellers se ON se.id=s.seller_id WHERE s.day>=? ${inq} ORDER BY COALESCE(s.sold_at, s.day) DESC LIMIT ?`).all(since, ...ids, limit);
  const t = today();
  const todayRow = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(amount),0) total FROM sales s WHERE s.day=? ${inq}`).get(t, ...ids);
  const thumbQ = db.prepare('SELECT url FROM item_thumb WHERE marketplace=? AND key=?');
  const isBl = noMoney ? blockedMatcher() : () => false;
  const thumbFor = (mk, list) => { for (const it of list) { const t = thumbQ.get(mk, mk === 'fa' ? it.sku : it.pub_id); if (t && t.url) return t.url; } return ''; };
  const missing = [];
  const out = rows.map(r => {
    const its = db.prepare('SELECT i.name, i.variant, i.qty, i.amount, i.sku, i.pub_id, i.seller_id, i.marketplace, f.family_id, f.up_id FROM sale_items i LEFT JOIN item_family f ON f.marketplace=i.marketplace AND f.pub_id=i.pub_id WHERE i.marketplace=? AND i.order_id=? ORDER BY i.line').all(r.marketplace, r.external_id);
    if (noMoney) its.forEach(it => { it.blocked = isBl(it); });
    let thumb = '';
    for (const it of its) {
      const key = r.marketplace === 'fa' ? it.sku : it.pub_id; if (!key) continue;
      const t = thumbQ.get(r.marketplace, key);
      if (!t) missing.push({ marketplace: r.marketplace, seller_id: r.seller_id, key });
      else if (t.url && !thumb) thumb = t.url;
    }
    const at = r.at && !/[zZ]$/.test(r.at) && r.at.length === 19 ? r.at.replace(' ', 'T') + 'Z' : r.at;
    if (noMoney) {
      // fulfillment: sin precios ni número de venta; solo sus productos (los bloqueados van aparte, tachados)
      if (its.length && its.every(i => i.blocked)) return null;
      const okIts = its.filter(i => !i.blocked), blk = its.filter(i => i.blocked);
      const th = okIts.length ? thumbFor(r.marketplace, okIts) : '';
      return { marketplace: r.marketplace, seller: r.seller, seller_id: r.seller_id, day: r.day, at, key: r.marketplace + ':' + r.external_id, thumb: th || thumb, units: okIts.reduce((a, i) => a + (i.qty || 1), 0) || r.units, items: okIts.map(i => ({ name: i.name, variant: i.variant, qty: i.qty })), blocked: blk.map(i => ({ name: i.name, variant: i.variant, qty: i.qty })) };
    }
    return { ...r, key: r.marketplace + ':' + r.external_id, thumb, at, items: its.map(({ sku, pub_id, seller_id, marketplace, family_id, up_id, blocked, ...x }) => x) };
  }).filter(Boolean);
  fillThumbs(missing).catch(() => {});
  if (noMoney) return { today: { n: out.filter(x => x.day === t).length }, items: out };
  return { today: todayRow, items: out };
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
  setInterval(() => refreshRecent().catch(() => {}), 3 * 60e3 + 5000);
}

module.exports = { refresh, refreshRecent, feed, summary, products, productsXlsx, start, today };

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
    let o;
    try { o = await ml.raw(conn, `/orders/${orderId}`); }
    catch (e) {
      // es un número de carrito (pack): se busca la primera venta del carrito
      const pk = await ml.raw(conn, `/packs/${orderId}`);
      const first = (pk.orders || [])[0]?.id;
      if (!first) throw e;
      o = await ml.raw(conn, `/orders/${first}`);
      if (!o.pack_id) o.pack_id = orderId;
      // el carrito trae varias ventas: se juntan todos los productos
      for (const x of (pk.orders || []).slice(1, 8)) {
        try { const o2 = await ml.raw(conn, `/orders/${x.id}`); o.order_items = [...(o.order_items || []), ...(o2.order_items || [])]; o.total_amount = Number(o.total_amount || 0) + Number(o2.total_amount || 0); } catch {}
      }
      if (!o.shipping?.id && pk.shipment?.id) o.shipping = { id: pk.shipment.id };
    }
    const b = o.buyer || {};
    return {
      order_id: String(o.id), pack_id: o.pack_id ? String(o.pack_id) : null,
      buyer: [b.first_name, b.last_name].filter(Boolean).join(' ') || b.nickname || '', buyer_id: b.id,
      products: (o.order_items || []).map(i => ({ title: i.item?.title, qty: i.quantity, price: Number(i.unit_price || 0) * Number(i.quantity || 1) })),
      total: Number(o.total_amount || 0),
      status: o.status || '', tags: o.tags || [], mediations: (o.mediations || []).length, shipping_id: o.shipping?.id || null,
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
      const msgs = raw.map(x => ({ from: String(x.from?.user_id) === String(uid) ? 'seller' : 'buyer', text: x.text, date: x.message_date?.created || x.date_created, att: (x.message_attachments || x.attachments || []).map(a => ({ f: a.filename || a.file_name, n: a.original_filename || a.filename, t: a.type || '' })).filter(a => a.f) })).sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const buyerId = info.buyer_id || raw.map(x => String(x.from?.user_id) === String(uid) ? x.to?.user_id : x.from?.user_id).find(Boolean);
      // Conversación cerrada: devolución, reclamo/mediación o venta cancelada → no se muestra (ya no hay nada que responder)
      const cs = th.v?.conversation_status || {};
      const closed = String(cs.status || '').toLowerCase() === 'blocked' || /blocked|disabled/i.test(String(cs.substatus || ''))
        || (!th.ok && /40[13]/.test(String(th.err || ''))) || info.status === 'cancelled' || info.mediations > 0
        || (info.tags || []).some(t => /return|refund|claim|mediation/i.test(t));
      if (closed) return null;
      let ship = '';
      if (info.shipping_id) { const sh = await safe(() => ml.raw(conn, `/shipments/${info.shipping_id}`), null); ship = ({ self_service: 'Flex', drop_off: 'Agencia', xd_drop_off: 'Agencia', cross_docking: 'Colecta', fulfillment: 'Full' })[sh.v?.logistic_type] || ''; }
      return { pack_id: pack, order_id: info.order_id, buyer_id: buyerId, unread: r.count || 1, buyer: info.buyer || await userName(conn, buyerId), product: info.products.map(p => p.title).join(' · '), products: info.products.map(p => ({ title: p.title, qty: p.qty })), ship, thread: msgs };
    }).then(a => a.filter(Boolean));
  }

  // Reclamos y mediaciones abiertas
  if (!c.ok) acc.errors.claims = c.err;
  else {
    acc.claims = await pmap((c.v?.data || []).slice(0, 40), 6, async x => {
      const [info, reason] = await Promise.all([orderOfClaim(conn, x), reasonText(conn, x.reason_id)]);
      const me = (x.players || []).find(p => String(p.user_id) === String(uid)) || {};
      return {
        id: x.id, stage: x.stage, type: x.type, dispute: x.stage === 'dispute', date: x.date_created, updated: x.last_updated,
        reason, order_id: info.order_id || x.resource_id, pack_id: info.pack_id || null, buyer: info.buyer, products: info.products, total: info.total,
        actions: (me.available_actions || []).map(a => a.action || a), due: (me.available_actions || []).map(a => a.due_date).filter(Boolean).sort()[0] || null,
        status: x.status,
      };
    });
    // Solo reclamos/mediaciones abiertos donde el vendedor todavía puede hacer algo (tiene acciones y no venció el plazo);
    // las devoluciones van en su propia sección
    acc._claimOrders = acc.claims.map(x => String(x.order_id));
    acc.claims = acc.claims.filter(x => x.status === 'opened' && x.actions.length > 0 && x.due && new Date(x.due) > new Date()); // igual que "Próximos por atender" de Mercado Libre: con plazo para responder
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
  // Si la venta ya tiene reclamo o devolución, su conversación de mensajes queda deshabilitada en Mercado Libre: se oculta
  const closedOrders = new Set([...acc.claims, ...acc.returns].flatMap(x => [x.order_id, x.pack_id]).concat(acc._claimOrders || []).filter(Boolean).map(String));
  delete acc._claimOrders;
  acc.messages = acc.messages.filter(m => !closedOrders.has(String(m.pack_id)) && !closedOrders.has(String(m.order_id || '')));
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
  const late = await lateCached(only);
  return { at: new Date(ats.length ? Math.min(...ats) : Date.now()).toISOString(), today: chileDay(new Date()), loading: res.some(x => x.d && x.d.loading), accounts, falabella: faAcc, paris: { supported: false }, late };
}
// ---------- Pedidos atrasados (Mercado Libre) ----------
// Flex: a las 19:00 debe estar escaneado por el conductor (si no, advertencia) y a las 23:00 entregado (si no, atrasado).
// Agencia / Colecta: pasó su hora límite de despacho y todavía no sale.
const chileHour = d => Number(new Intl.DateTimeFormat('en-GB', { timeZone: cfg.timezone, hour: '2-digit', hour12: false }).format(d)) % 24;
const liveShip = new Map(); // shipmentId -> { at, sh }
const OUT_SUB = ['dropped_off', 'picked_up', 'in_hub', 'in_packing_list', 'in_transit', 'authorized_by_carrier', 'out_for_delivery'];
const isOut = sh => ['shipped', 'delivered', 'not_delivered'].includes(sh.status) || (sh.status === 'ready_to_ship' && OUT_SUB.includes(sh.substatus));
function lateKind(o, now) {
  const m = o.meta; if (!m.dispatch_by) return null;
  if (o.marketplace === 'fa' || o.marketplace === 'pa') {
    // Falabella / Paris: el día de despacho, desde las 20:00 sin que la agencia o el marketplace lo escanee → advertencia; al día siguiente → atrasado
    const v = String(m.dispatch_by), pd = new Date(v.includes('T') ? v : v.replace(' ', 'T'));
    const today = chileDay(now), dday = isNaN(pd) ? v.slice(0, 10) : chileDay(pd), h = chileHour(now);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dday) || dday > today) return null;
    const ship = o.marketplace === 'fa' ? 'Falabella' : 'Paris';
    if (dday < today) return { level: 'late', kind: 'sin_escanear', ship };
    if (h >= 20) return { level: 'warn', kind: 'sin_escanear', ship };
    return null;
  }
  const due = new Date(m.dispatch_by); if (isNaN(due)) return null;
  const today = chileDay(now), dday = chileDay(due), h = chileHour(now);
  if (dday > today) return null;
  if (m.logistic === 'self_service') {
    if (m.status === 'delivered') return null;
    const past = dday < today || h >= 23;
    if (past) return { level: 'late', kind: m.out ? 'no_entregado' : 'sin_escanear', ship: 'Flex' };
    if (h >= 19 && !m.out) return { level: 'warn', kind: 'sin_escanear', ship: 'Flex' };
    return null;
  }
  if (!m.out && due < now) return { level: 'late', kind: 'no_despachado', ship: m.logistic === 'cross_docking' ? 'Colecta' : 'Agencia' };
  return null;
}
async function lateOrders(only) {
  const now = new Date();
  const since = new Date(now - 6 * 864e5).toISOString().slice(0, 10);
  const rows = db.prepare(`SELECT o.*, s.name AS seller FROM orders o JOIN sellers s ON s.id=o.seller_id WHERE o.marketplace IN ('ml','fa','pa') AND o.state NOT IN ('shipped','cancelled')${only ? ' AND o.seller_id=?' : ''}`).all(...(only ? [only] : []));
  const cand = [];
  for (const r of rows) {
    let meta = {}; try { meta = JSON.parse(r.meta || '{}'); } catch {}
    if (!meta.dispatch_by || String(meta.dispatch_by).slice(0, 10) < since || meta.status === 'cancelled' || meta.cancelled) continue;
    const flex = r.marketplace === 'ml' && meta.logistic === 'self_service';
    if (meta.out && !flex) continue; // ya lo recibió la agencia / colecta (Flex sigue hasta que se entrega)
    const o = { ...r, meta };
    if (lateKind(o, now)) cand.push(o);
  }
  // se confirma el estado real en Mercado Libre (puede haber cambiado desde la última sincronización)
  const conns = new Map();
  await Promise.race([new Promise(r => setTimeout(r, 8000)), pmap(cand.filter(o => o.marketplace === 'ml').slice(0, 60), 5, async o => {
    try {
      let c = liveShip.get(o.external_id);
      if (!c || Date.now() - c.at > 120e3) {
        const row = db.prepare('SELECT * FROM connections WHERE id=?').get(o.connection_id); if (!row) return;
        if (!conns.has(row.id)) conns.set(row.id, sync.connObj(row));
        c = { at: Date.now(), sh: await ml.raw(conns.get(row.id), `/shipments/${o.external_id}`) };
        liveShip.set(o.external_id, c);
      }
      o.meta = { ...o.meta, status: c.sh.status, substatus: c.sh.substatus, out: o.meta.out || isOut(c.sh) };
    } catch { /* se usa lo sincronizado */ }
  })]);
  let items = [];
  const out = [];
  for (const o of cand) {
    if (o.meta.status === 'cancelled') continue;
    const k = lateKind(o, now); if (!k) continue;
    try { items = JSON.parse(o.items || '[]'); } catch { items = []; }
    out.push({ ...k, mk: o.marketplace, id: o.id, seller_id: o.seller_id, seller: o.seller, order_number: o.order_number, shipment: o.external_id, dispatch_by: o.meta.dispatch_by, status: o.meta.status, substatus: o.meta.substatus || '', customer: o.meta.customer || '', printed: Boolean(o.printed_at), products: items.map(i => ({ title: [i.name, i.variant].filter(Boolean).join(' · '), qty: i.qty || 1 })) });
  }
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'late' ? -1 : 1) || String(a.dispatch_by).localeCompare(String(b.dispatch_by)));
}
// atrasados: se entrega al instante lo último calculado y se recalcula en segundo plano (máx. cada 60 s)
const lateCache = new Map(); // clave vendedor|all -> { at, data, p }
function lateCached(only) {
  const k = String(only || 'all'); const c = lateCache.get(k) || {};
  const run = () => { if (!c.p) c.p = lateOrders(only).then(d => { c.data = d; c.at = Date.now(); }).catch(e => console.warn('[mkp] atrasados', e.message)).finally(() => { c.p = null; }); lateCache.set(k, c); return c.p; };
  if (c.data) { if (Date.now() - c.at > 60e3) run(); return Promise.resolve(c.data); }
  return Promise.race([run().then(() => c.data || []), new Promise(r => setTimeout(() => r(c.data || []), 3000))]);
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
  return (Array.isArray(r) ? r : r?.data || []).map(x => ({ from: x.sender_role === 'respondent' ? 'seller' : x.sender_role === 'mediator' ? 'mediator' : 'buyer', text: x.message || x.text, date: x.date_created, att: (x.attachments || []).map(a => ({ f: a.filename || a.file_name, n: a.original_filename || a.filename, t: a.type || '' })).filter(a => a.f) })).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}
async function claimReply(user, connId, claimId, text, toMediator) {
  const conn = connFor(user, connId);
  await ml.apiSend(conn, 'POST', `/post-purchase/v1/claims/${claimId}/actions/send-message`, { receiver_role: toMediator ? 'mediator' : 'complainant', message: String(text).slice(0, 2000) });
  bust(connId);
}

// Marca la conversación como leída en Mercado Libre (al comprador le aparece "visto") sin responder, y la saca de la bandeja
async function markRead(user, connId, packId) {
  const conn = connFor(user, connId);
  const uid = conn.creds.user_id;
  if (!/^\d+$/.test(String(packId || ''))) throw Object.assign(new Error('Conversación inválida'), { status: 400 });
  await ml.raw(conn, `/messages/packs/${packId}/sellers/${uid}?tag=post_sale&mark_as_read=true&limit=10`);
  const c = accCache.get(Number(connId));
  if (c?.data?.messages) c.data.messages = c.data.messages.filter(m => String(m.pack_id) !== String(packId));
}
// Elimina una pregunta sin responderla (igual que "Eliminar pregunta" en Mercado Libre)
// Archivos adjuntos (fotos) que el comprador o el mediador envían por Mercado Libre
async function attachment(user, connId, kind, ref, file) {
  const conn = connFor(user, connId);
  const f = encodeURIComponent(file);
  const path = kind === 'claim' ? `/post-purchase/v1/claims/${Number(ref)}/attachments/${f}/download` : `/messages/attachments/${f}?tag=post_sale&site_id=MLC`;
  const buf = await ml.raw(conn, path, 'buffer');
  const h = buf.slice(0, 12).toString('hex');
  const type = h.startsWith('ffd8') ? 'image/jpeg' : h.startsWith('89504e47') ? 'image/png' : h.startsWith('47494638') ? 'image/gif' : h.startsWith('52494646') && buf.slice(8, 12).toString() === 'WEBP' ? 'image/webp' : buf.slice(0, 5).toString() === '%PDF-' ? 'application/pdf' : 'application/octet-stream';
  return { buf, type };
}
async function deleteQuestion(user, connId, questionId) {
  const conn = connFor(user, connId);
  if (!/^\d+$/.test(String(questionId || ''))) throw Object.assign(new Error('Pregunta inválida'), { status: 400 });
  await ml.apiSend(conn, 'DELETE', `/questions/${questionId}`);
  const c = accCache.get(Number(connId));
  if (c?.data?.questions) c.data.questions = c.data.questions.filter(q => String(q.id) !== String(questionId));
}
module.exports = { summary, answerQuestion, sendMessage, claimMessages, claimReply, markRead, deleteQuestion, attachment };

};

__defs["profit"] = function (module, exports, require, __dirname) {
// Calculador de ganancia real por publicación (Análisis ventas)
// Mercado Libre: comisión (listing_prices), envío que paga el vendedor (shipping_options/free) y TACOS de Mercado Ads.
// Falabella / Paris: precio vigente y comisión estimada desde la API (si la entrega) o un valor por defecto editable.
// El vendedor ingresa el costo del producto con IVA; la ganancia se calcula neta (sin IVA) en el navegador.
const db = require('./db');

db.exec(`CREATE TABLE IF NOT EXISTS item_cost (seller_id INTEGER NOT NULL, marketplace TEXT NOT NULL, key TEXT NOT NULL,
  cost REAL, fee_pct REAL, ship REAL, tacos REAL, updated_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (seller_id, marketplace, key));
CREATE TABLE IF NOT EXISTS profit_cache (seller_id INTEGER PRIMARY KEY, data TEXT, at INTEGER);`);

const CACHE_V = 9; // sube cuando cambia el cálculo, para rehacer la caché
const DEFAULT_FEE = { fa: 18, pa: 18 }; // % por defecto si la API no entrega la comisión (vestuario en Paris = 18%)
const num = v => { const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function pool(list, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) { const k = i++; try { out[k] = await fn(list[k]); } catch (e) { out[k] = null; } } })); return out; }
const dayStr = d => d.toISOString().slice(0, 10);

// ---------- Mercado Libre ----------
const feeCache = new Map(); // `${cat}|${lt}|${price}` -> fee
// Precio vigente de una publicación en este momento: la promoción activa más barata (campañas del vendedor,
// SMART, DEAL/Cyber, descuentos…). No se consideran los precios exclusivos para Meli+.
const MELIPLUS = /meli\s*\+|meli\s*plus|loyalty|suscrip/i;
async function livePrice(conn, id, base) {
  const ml = require('./connectors/ml');
  let price = base, regular = null, gotPromos = false;
  try {
    const pr = await ml.raw(conn, `/seller-promotions/items/${id}?app_version=v2`);
    gotPromos = true;
    const started = (Array.isArray(pr) ? pr : []).filter(x => x.status === 'started' && num(x.price) > 0 && !MELIPLUS.test([x.name, x.type, x.sub_type].join(' ')));
    if (started.length) {
      const best = started.reduce((a, b) => (num(b.price) < num(a.price) ? b : a));
      if (num(best.price) < price) { regular = num(best.original_price) || price; price = num(best.price); }
    }
  } catch { /* la cuenta aún sin permiso de promociones */ }
  // respaldo (o cuando la cuenta no tiene permiso de promociones): precio de venta sin Meli+
  if (!gotPromos) {
    try {
      const sp = await ml.raw(conn, `/items/${id}/sale_price?context=channel_marketplace`);
      if (num(sp?.amount) > 0 && num(sp.amount) < price) { regular = sp.regular_amount ? num(sp.regular_amount) : price; price = num(sp.amount); }
    } catch { /* sin dato */ }
  }
  return { price, regular: regular && regular > price ? regular : null };
}
async function mlFee(conn, cat, lt, price) {
  const fk = `${cat}|${lt}|${price}`;
  if (feeCache.has(fk)) return feeCache.get(fk);
  try {
    const r = await require('./connectors/ml').raw(conn, `/sites/MLC/listing_prices?price=${price}&listing_type_id=${lt}&category_id=${cat}`);
    const o = Array.isArray(r) ? r[0] : r;
    const fee = num(o?.sale_fee_amount); feeCache.set(fk, fee); return fee;
  } catch { return null; }
}

async function mlListings(conn, errors) {
  const ml = require('./connectors/ml');
  const uid = conn.creds.user_id;
  const ids = [];
  for (let off = 0; off < 1000; off += 100) {
    const r = await ml.raw(conn, `/users/${uid}/items/search?status=active&limit=100&offset=${off}`);
    ids.push(...(r?.results || []));
    if ((r?.results || []).length < 100) break;
  }
  const items = [];
  for (let i = 0; i < ids.length; i += 20) {
    const r = await ml.raw(conn, `/items?ids=${ids.slice(i, i + 20).join(',')}&attributes=id,title,price,listing_type_id,category_id,thumbnail,secure_thumbnail,shipping,attributes,seller_custom_field,permalink,sold_quantity,family_name`);
    for (const x of r || []) if (x?.code === 200 && x.body) items.push(x.body);
  }
  // Mercado Ads: gasto y TACOS por publicación (últimos 30 días)
  const soldMap = sales30(conn.row?.seller_id);
  const ads = await mlAds(conn).catch(e => { if (/UNAUTHORIZED|403/.test(String(e.message))) errors.adsAuth = true; const msg = /UNAUTHORIZED|403/.test(String(e.message)) ? 'El TACOS automático aún no llega para esta cuenta: Mercado Libre activa el permiso de Publicidad cuando renueva el acceso (lo hace solo cada pocas horas; la app reintenta cada 45 minutos). Mientras tanto puedes escribirlo a mano.' : 'Mercado Ads: ' + String(e.message || e).slice(0, 160); if (!errors.includes(msg)) errors.push(msg); return null; });
  const rows = await pool(items, 6, async it => {
    const { price, regular } = await livePrice(conn, it.id, num(it.price));
    const fee = await mlFee(conn, it.category_id, it.listing_type_id, price);
    const logistic = it.shipping?.logistic_type || '';
    // Costo de envío que Mercado Libre le cobra al vendedor (también en productos bajo el umbral de envío gratis,
    // p. ej. $869 en un jockey de $4.990 en Full): se consulta siempre para los envíos de Mercado Envíos
    let ship = 0, shipSrc = 'sin costo';
    if (it.shipping?.mode === 'me2' || it.shipping?.free_shipping) {
      try {
        const r = await ml.raw(conn, `/users/${uid}/shipping_options/free?item_id=${it.id}`);
        ship = Math.round(num(r?.coverage?.all_country?.list_cost)); shipSrc = 'Mercado Libre';
      } catch { ship = null; shipSrc = 'no disponible'; }
    }
    const a = ads?.get(it.id);
    const s30 = soldMap.get(String(it.id)) || 0;
    const adTacos = a ? (a.tacos != null ? a.tacos : (s30 > 0 ? a.cost / s30 * 100 : null)) : null;
    const sku = (it.attributes || []).find(x => x.id === 'SELLER_SKU')?.value_name || it.seller_custom_field || '';
    return {
      mk: 'ml', key: it.id, id: it.id, title: it.title, thumb: (it.secure_thumbnail || it.thumbnail || '').replace(/^http:/, 'https:'), sku, url: it.permalink || '',
      price, regular, fee, fee_src: fee == null ? 'no disponible' : 'Mercado Libre', ship, ship_src: shipSrc,
      logistic: ({ self_service: 'Flex', cross_docking: 'Colecta', drop_off: 'Agencia', xd_drop_off: 'Agencia', fulfillment: 'Full' })[logistic] || '',
      listing: it.listing_type_id === 'gold_pro' ? 'Premium' : it.listing_type_id === 'gold_special' ? 'Clásica' : it.listing_type_id, listing_type: it.listing_type_id,
      tacos: adTacos, ads_cost: a ? a.cost : null, ads_amount: a ? a.amount : null, sales30: s30, tacos_src: a ? 'Mercado Ads' : (ads ? 'sin publicidad' : 'no disponible'),
      sold: num(it.sold_quantity), family: it.family_name || '', cat: it.category_id, base_price: num(it.price), conn_id: conn.row?.id,
    };
  });
  return rows.filter(Boolean);
}

async function mlAds(conn) {
  const ml = require('./connectors/ml');
  const adv = await ml.apiH(conn, '/advertising/advertisers?product_id=PADS', { 'Api-Version': '1' });
  const list = adv?.advertisers || [];
  const a = list.find(x => x.site_id === 'MLC') || list[0];
  if (!a) return new Map();
  const to = new Date(), from = new Date(Date.now() - 29 * 864e5);
  const out = new Map();
  const metrics = 'cost,tacos,acos,total_amount,units_quantity,direct_amount,indirect_amount,organic_units_amount';
  const q = off => `limit=100&offset=${off}&date_from=${dayStr(from)}&date_to=${dayStr(to)}&metrics=${metrics}`;
  // Mercado Ads cambió de rutas en el tiempo: se prueban en orden y se usa la primera que responda
  const routes = [
    off => [`/advertising/${a.site_id || 'MLC'}/advertisers/${a.advertiser_id}/product_ads/ads/search?${q(off)}`, { 'api-version': '2' }],
    off => [`/advertising/advertisers/${a.advertiser_id}/product_ads/ads/search?${q(off)}`, { 'api-version': '2' }],
    off => [`/advertising/product_ads/ads/search?advertiser_id=${a.advertiser_id}&${q(off)}`, { 'api-version': '2' }],
  ];
  let route = null, lastErr = null;
  for (const rt of routes) { try { const [pth, h] = rt(0); await ml.apiH(conn, pth, h); route = rt; break; } catch (e) { lastErr = e; } }
  if (!route) throw lastErr || new Error('Mercado Ads sin respuesta');
  for (let off = 0; off < 3000; off += 100) {
    const [pth, h] = route(off);
    const r = await ml.apiH(conn, pth, h);
    const res = r?.results || r?.ads || [];
    for (const x of res) {
      const m = x.metrics || x.metrics_summary || {};
      const id = String(x.item_id || x.item?.id || x.id || '');
      if (!id) continue;
      // TACOS de Mercado Ads = gasto / ventas totales del producto (con publicidad + orgánicas)
      const prev = out.get(id) || { cost: 0, amount: 0 };
      const cost = prev.cost + num(m.cost), amount = prev.amount + num(m.total_amount) + num(m.organic_units_amount);
      out.set(id, { cost, amount, tacos: amount > 0 ? cost / amount * 100 : (m.tacos != null ? num(m.tacos) : (cost > 0 ? null : 0)) });
    }
    if (res.length < 100) break;
    await sleep(200);
  }
  return out;
}

// Ventas (con IVA) de cada publicación en los últimos 30 días, para calcular el TACOS cuando Mercado Ads no lo entrega
function sales30(sellerId) {
  const since = dayStr(new Date(Date.now() - 30 * 864e5));
  const m = new Map();
  for (const r of db.prepare("SELECT pub_id, SUM(amount) a FROM sale_items WHERE seller_id=? AND marketplace='ml' AND day>=? GROUP BY pub_id").all(sellerId, since)) m.set(String(r.pub_id), r.a || 0);
  return m;
}

// ---------- Falabella / Paris: productos vendidos (últimos 90 días) con su precio promedio ----------
function soldProducts(sellerId, mk) {
  const since = dayStr(new Date(Date.now() - 90 * 864e5));
  const rows = db.prepare(`SELECT sku, pub_id, name, SUM(qty) q, SUM(amount) a, MAX(day) last FROM sale_items WHERE seller_id=? AND marketplace=? AND day>=? GROUP BY COALESCE(NULLIF(sku,''), pub_id, name) ORDER BY q DESC`).all(sellerId, mk, since);
  // precio al que se vendió la última vez (refleja la promoción vigente mejor que un promedio)
  const lastQ = db.prepare(`SELECT amount, qty FROM sale_items WHERE seller_id=? AND marketplace=? AND COALESCE(NULLIF(sku,''), pub_id, name)=? AND qty>0 AND amount>0 ORDER BY day DESC, rowid DESC LIMIT 1`);
  return rows.map(r => { const k = r.sku || r.pub_id || r.name; const l = lastQ.get(sellerId, mk, k); return { key: k, sku: r.sku || '', id: r.pub_id || '', title: r.name, avg: l ? l.amount / l.qty : (r.q ? r.a / r.q : 0), units90: r.q }; });
}

async function faListings(conn, sellerId, errors) {
  const fa = require('./connectors/falabella');
  const prices = new Map();
  let feePct = null;
  // precio vigente (con descuento si está activo) desde el catálogo
  try {
    for (let off = 0; off < 3000; off += 100) {
      const b = await fa.call(conn.creds, 'GetProducts', { Filter: 'live', Limit: '100', Offset: String(off) });
      const ps = fa.list(b.Products, 'Product');
      for (const p of ps) {
        // el precio viene en la unidad de negocio (Falabella): Price y SpecialPrice (oferta con fechas)
        const buList = fa.list(p.BusinessUnits, 'BusinessUnit');
        const bu = buList.find(x => /falabella/i.test(x?.BusinessUnit || '')) || buList[0] || p;
        const base = num(bu.Price ?? p.Price), sale = num(bu.SpecialPrice ?? bu.SalePrice ?? p.SalePrice);
        const chile = v => Date.parse(String(v || '').replace(' ', 'T') + (v && !/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? '-03:00' : ''));
        const now = Date.now(), s = chile(bu.SpecialFromDate ?? p.SaleStartDate) || 0, e = chile(bu.SpecialToDate ?? p.SaleEndDate) || Infinity;
        const price = sale > 0 && now >= s && now <= e ? sale : base;
        prices.set(String(p.SellerSku || '').toUpperCase(), { price, base, name: p.Name, img: p.MainImage || (p.Images && (p.Images.Image || [])[0]) || '' });
      }
      if (ps.length < 100) break;
    }
  } catch (e) { errors.push('Falabella productos: ' + String(e.message).slice(0, 140)); }
  // Falabella no entrega la comisión por API (GetPayoutStatus no está habilitado): se usa un % editable
  const sold = soldProducts(sellerId, 'fa');
  const seen = new Set(), rows = [];
  const push = (key, sku, title, price, img, units, base) => rows.push({ mk: 'fa', key, id: sku, sku, title, thumb: img || '', price, base: base || null, fee: null, fee_pct: feePct ?? DEFAULT_FEE.fa, fee_src: 'estimado', ship: 0, ship_src: 'editable', tacos: null, tacos_src: 'editable', units90: units || 0 });
  for (const s of sold) { const p = prices.get(String(s.sku).toUpperCase()); seen.add(String(s.sku).toUpperCase()); push(s.key, s.sku, p?.name || s.title, p ? p.price : Math.round(s.avg), p?.img, s.units90, p?.base); }
  for (const [sku, p] of prices) if (!seen.has(sku)) push(sku, sku, p.name, p.price, p.img, 0, p.base);
  return rows;
}

async function paListings(conn, sellerId, errors) {
  const pa = require('./connectors/paris');
  const fees = new Map(); // sku -> % de comisión si la API la entrega en los ítems de la orden
  const imgs = new Map();
  try {
    const from = new Date(Date.now() - 60 * 864e5).toISOString();
    for (let off = 0; off < 400; off += 50) {
    const r = await pa.raw(conn, `/v3/sub-orders?gteCreatedAt=${encodeURIComponent(from)}&limit=50&offset=${off}`);
    const subs = pa.flatten(r?.data);
    for (const sub of subs) for (const it of sub.items || []) {
      const sk = String(it.sellerSku || it.sku || '').toUpperCase();
      if (it.imagePath && !imgs.has(sk)) imgs.set(sk, String(it.imagePath));
      const k = Object.keys(it).find(x => /commission/i.test(x) && /percent|rate|pct/i.test(x));
      const kAmt = Object.keys(it).find(x => /commission/i.test(x) && !/percent|rate|pct/i.test(x));
      const price = num(it.priceAfterDiscounts ?? it.grossPrice ?? it.price);
      let pct = k ? num(it[k]) : (kAmt && price ? num(it[kAmt]) / price * 100 : null);
      if (pct != null && pct > 0 && pct < 1) pct *= 100;
      if (pct) fees.set(sk, Math.round(pct * 10) / 10);
    }
    if (subs.length < 50) break;
    }
  } catch (e) { errors.push('Paris comisión: ' + String(e.message).slice(0, 140)); }
  return soldProducts(sellerId, 'pa').map(s => {
    const f = fees.get(String(s.sku).toUpperCase());
    return { mk: 'pa', key: s.key, id: s.id, sku: s.sku, title: s.title, thumb: imgs.get(String(s.sku).toUpperCase()) || '', price: Math.round(s.avg), fee: null, fee_pct: f ?? DEFAULT_FEE.pa, fee_src: f != null ? 'Paris' : 'estimado (tabla Paris vestuario)', ship: 0, ship_src: 'editable', tacos: null, tacos_src: 'editable', units90: s.units90 };
  });
}

// Una fila por publicación: las variantes (color / talla) se venden al mismo precio y tienen el mismo costo.
// Mercado Libre: se agrupan por familia (o título) y tipo de publicación (Clásica y Premium quedan aparte);
// Falabella / Paris: por nombre del producto. El costo se guarda por producto (sirve para Clásica y Premium).
const normTitle = t => String(t || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
function groupByPublication(rows) {
  const g = new Map();
  for (const r of rows) {
    const base = normTitle(r.mk === 'ml' ? (r.family || r.title) : r.title);
    const k = `${r.mk}|${base}|${r.mk === 'ml' ? r.listing_type || '' : ''}`;
    if (!g.has(k)) g.set(k, { ...r, key: 'P:' + base + (r.mk === 'ml' ? '|' + (r.listing_type || '') : ''), cost_key: 'C:' + base, ids: [], skus: [], members: [], prices: new Map(), variants: 0, sold: 0, units90: 0 });
    const x = g.get(k);
    x.variants++; if (r.id) x.ids.push(r.id); if (r.sku) x.skus.push(r.sku); x.members.push(String(r.key || '').toUpperCase(), String(r.sku || '').toUpperCase(), String(r.id || '').toUpperCase());
    x.sold += r.sold || 0; x.units90 += r.units90 || 0;
    x.prices.set(r.price, (x.prices.get(r.price) || 0) + 1 + (r.sold || r.units90 || 0));
    if (!x.thumb && r.thumb) x.thumb = r.thumb;
    if (r.ads_cost != null) { x._adc = (x._adc || 0) + r.ads_cost; x._ada = (x._ada || 0) + (r.ads_amount || 0); x._ads = true; x.tacos_src = r.tacos_src; }
    if (x.tacos == null && r.tacos != null) { x.tacos = r.tacos; x.tacos_src = r.tacos_src; }
  }
  return [...g.values()].map(x => {
    // precio: el más barato vigente entre sus variantes (la promoción más económica); comisión y envío de esa variante
    const price = Math.min(...[...x.prices.keys()].filter(v => v > 0).concat([Infinity])) === Infinity ? [...x.prices.keys()][0] : Math.min(...[...x.prices.keys()].filter(v => v > 0));
    const ref = rows.find(r => r.mk === x.mk && r.price === price && x.ids.includes(r.id)) || x;
    const out = { ...x, price, regular: ref.regular ?? null, base: ref.base ?? null, fee: ref.fee, ship: ref.ship, ship_src: ref.ship_src, id: x.ids[0] || '', sku: [...new Set(x.skus)].length === 1 ? x.skus[0] : (x.skus.length ? x.skus.length + ' SKU' : ''), url: ref.url || x.url };
    // TACOS de la publicación = gasto total en publicidad / ventas totales de todas sus variantes
    if (x._ads && x._ada > 0) out.tacos = Math.round(x._adc / x._ada * 1000) / 10;
    delete out.prices; delete out.skus; delete out.family; delete out._adc; delete out._ads; delete out._ada;
    if (x.mk === 'ml') out.title = x.family && x.variants > 1 ? x.title : x.title;
    return out;
  });
}

// ---------- armado por vendedor (en segundo plano, con caché) ----------
const building = new Map();
function cached(sellerId) {
  const r = db.prepare('SELECT data, at FROM profit_cache WHERE seller_id=?').get(sellerId);
  if (!r) return null;
  try { return { ...JSON.parse(r.data), at: r.at }; } catch { return null; }
}
async function build(sellerId) {
  const sync = require('./sync');
  const conns = db.prepare("SELECT * FROM connections WHERE seller_id=? AND marketplace IN ('ml','fa','pa')").all(sellerId);
  const errors = [], rows = [];
  for (const c of conns) {
    const conn = sync.connObj(c);
    try {
      if (c.marketplace === 'ml') rows.push(...await mlListings(conn, errors));
      if (c.marketplace === 'fa') rows.push(...await faListings(conn, sellerId, errors));
      if (c.marketplace === 'pa') rows.push(...await paListings(conn, sellerId, errors));
    } catch (e) { errors.push(`${c.marketplace.toUpperCase()}: ${String(e.message).slice(0, 160)}`); }
  }
  const data = { items: rows, errors: [...errors], v: CACHE_V, retry: Boolean(errors.adsAuth), pricesAt: Date.now() };
  db.prepare('INSERT INTO profit_cache (seller_id, data, at) VALUES (?,?,?) ON CONFLICT(seller_id) DO UPDATE SET data=excluded.data, at=excluded.at').run(sellerId, JSON.stringify(data), Date.now());
  return data;
}
function refresh(sellerId, force) {
  const c = cached(sellerId);
  // si Mercado Ads aún no daba permiso, se reintenta cada 45 minutos (los accesos se renuevan solos cada pocas horas)
  const stale = !c || c.v !== CACHE_V || Date.now() - c.at > (c.retry ? 45 * 60e3 : 6 * 3600e3);
  if ((force || stale) && !building.has(sellerId)) {
    const p = build(sellerId).catch(e => console.warn('[ganancia]', e.message)).finally(() => building.delete(sellerId));
    building.set(sellerId, p);
  }
  return building.get(sellerId) || null;
}
// Precios al día: cada pocos minutos se vuelven a consultar solo los precios (promociones) de Mercado Libre y
// Falabella, sin rehacer todo (comisión se recalcula si el precio cambió; envío y TACOS quedan del armado completo)
const pricing = new Map();
async function refreshPrices(sellerId) {
  const c = cached(sellerId);
  if (!c || !Array.isArray(c.items)) return;
  const sync = require('./sync');
  const conns = new Map(db.prepare("SELECT * FROM connections WHERE seller_id=?").all(sellerId).map(r => [r.id, r]));
  const mlConn = id => { const r = conns.get(id) || [...conns.values()].find(x => x.marketplace === 'ml'); return r && r.marketplace === 'ml' ? sync.connObj(r) : null; };
  let changed = 0;
  await pool(c.items.filter(r => r.mk === 'ml'), 8, async r => {
    const conn = mlConn(r.conn_id); if (!conn) return;
    const { price, regular } = await livePrice(conn, r.id, r.base_price || r.regular || r.price);
    if (price !== r.price || regular !== r.regular) {
      r.price = price; r.regular = regular; changed++;
      if (r.cat && r.listing_type) { const fee = await mlFee(conn, r.cat, r.listing_type, price); if (fee != null) r.fee = fee; }
    }
  });
  // Falabella: el catálogo trae el precio de oferta vigente
  const faRow = [...conns.values()].find(x => x.marketplace === 'fa');
  if (faRow) {
    try {
      const fresh = await faListings(sync.connObj(faRow), sellerId, []);
      const byKey = new Map(fresh.map(x => [x.key, x]));
      for (const r of c.items) if (r.mk === 'fa' && byKey.has(r.key)) { const f = byKey.get(r.key); if (f.price !== r.price) { r.price = f.price; r.base = f.base; changed++; } }
    } catch { /* se intenta en la próxima vuelta */ }
  }
  const cur = cached(sellerId); // si en el intertanto se rehízo todo, no se pisa
  if (cur && cur.at !== c.at) return;
  c.pricesAt = Date.now();
  const { at, ...data } = c;
  db.prepare('UPDATE profit_cache SET data=? WHERE seller_id=?').run(JSON.stringify(data), sellerId);
  return changed;
}
function refreshPricesSoon(sellerId, maxAgeMs) {
  const c = cached(sellerId);
  if (!c || building.has(sellerId) || pricing.has(sellerId)) return pricing.get(sellerId) || null;
  if (Date.now() - (c.pricesAt || c.at || 0) < maxAgeMs) return null;
  const p = refreshPrices(sellerId).catch(e => console.warn('[ganancia precios]', e.message)).finally(() => pricing.delete(sellerId));
  pricing.set(sellerId, p);
  return p;
}
// en segundo plano: precios de todos los vendedores cada 20 minutos (el que está mirando la calculadora, cada 3)
setInterval(() => { for (const r of db.prepare('SELECT seller_id FROM profit_cache').all()) refreshPricesSoon(r.seller_id, 20 * 60e3); }, 5 * 60e3).unref?.();

// Unidades vendidas por publicación en un rango de días (hora de Chile), desde las ventas registradas
function unitsInRange(sellerId, rows, from, to, rets = []) {
  const q = db.prepare(`SELECT marketplace mk, UPPER(COALESCE(pub_id,'')) pid, UPPER(COALESCE(sku,'')) sku, UPPER(COALESCE(name,'')) nm, SUM(qty) u, SUM(amount) a
    FROM sale_items WHERE seller_id=? AND day>=? AND day<=? GROUP BY marketplace, pid, sku, nm`).all(sellerId, from, to);
  const idx = new Map();
  rows.forEach((r, i) => { for (const m of new Set(r.members || [])) if (m) idx.set(r.mk + '|' + m, i); });
  const units = rows.map(() => 0), amount = rows.map(() => 0);
  for (const s of q) {
    const i = [s.pid, s.sku, s.nm].map(k => idx.get(s.mk + '|' + k)).find(v => v !== undefined);
    if (i === undefined) continue;
    units[i] += s.u || 0; amount[i] += s.a || 0;
  }
  // devoluciones: unidades devueltas por publicación; las que no calzan con ninguna quedan aparte por marketplace
  const ru = rows.map(() => 0), loose = {};
  for (const x of rets) {
    const i = x.keys.map(k => idx.get(x.mk + '|' + k)).find(v => v !== undefined);
    if (i === undefined) { const l = loose[x.mk] ||= { units: 0, amount: 0 }; l.units += x.units; l.amount += x.amount; continue; }
    ru[i] += x.units;
  }
  rows.forEach((r, i) => { r.units = units[i]; r.sold_amount = Math.round(amount[i]); r.ret_units = ru[i]; delete r.members; });
  rows.ret_loose = loose;
  return rows;
}

async function get(sellerId, { force = false, wait = 2500, from = null, to = null, rets = [] } = {}) {
  const p = refresh(sellerId, force);
  if (p) await Promise.race([p, sleep(wait)]);
  else { const q = refreshPricesSoon(sellerId, 3 * 60e3); if (q) await Promise.race([q, sleep(wait)]); }
  const c = cached(sellerId);
  const saved = {};
  for (const r of db.prepare('SELECT marketplace, key, cost, fee_pct, ship, tacos FROM item_cost WHERE seller_id=?').all(sellerId)) saved[r.marketplace + '|' + r.key] = { cost: r.cost, fee_pct: r.fee_pct, ship: r.ship, tacos: r.tacos };
  return { loading: building.has(sellerId), pricing: pricing.has(sellerId), at: c?.at || null, prices_at: c?.pricesAt || c?.at || null, ...(() => { const rows = from && to ? unitsInRange(sellerId, groupByPublication(c?.items || []), from, to, rets) : groupByPublication(c?.items || []); return { rows, ret_loose: rows.ret_loose || {} }; })(), from, to, errors: c?.errors || [], saved };
}
function save(sellerId, b) {
  const mk = String(b.marketplace || ''), key = String(b.key || '').slice(0, 200);
  if (!['ml', 'fa', 'pa'].includes(mk) || !key) throw new Error('Datos incompletos');
  const v = x => (x === '' || x == null || !isFinite(Number(x)) ? null : Number(x));
  db.prepare(`INSERT INTO item_cost (seller_id, marketplace, key, cost, fee_pct, ship, tacos, updated_at) VALUES (?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(seller_id, marketplace, key) DO UPDATE SET cost=excluded.cost, fee_pct=excluded.fee_pct, ship=excluded.ship, tacos=excluded.tacos, updated_at=excluded.updated_at`)
    .run(sellerId, mk, key, v(b.cost), v(b.fee_pct), v(b.ship), v(b.tacos));
  return true;
}

module.exports = { get, save, groupByPublication };

};

__defs["returns"] = function (module, exports, require, __dirname) {
// Devoluciones por período (calculadora de ganancia): cantidad, unidades y plata devuelta, por marketplace.
// Se guarda un registro local (últimos 120 días) que se actualiza en segundo plano; las consultas por fecha son instantáneas.
// Mercado Libre: reclamos de tipo "returns" (sin las devoluciones canceladas); monto = total de la venta.
// Falabella: órdenes con productos en estado "returned". Paris: productos de la suborden con returnId.
const cfg = require('./config');
const db = require('./db');

db.exec(`CREATE TABLE IF NOT EXISTS returns_log (mk TEXT NOT NULL, rid TEXT NOT NULL, seller_id INTEGER NOT NULL, day TEXT NOT NULL,
  units INTEGER NOT NULL DEFAULT 1, amount REAL NOT NULL DEFAULT 0, status TEXT, title TEXT, final INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (mk, rid));
CREATE INDEX IF NOT EXISTS returns_log_day ON returns_log (seller_id, day);
CREATE TABLE IF NOT EXISTS returns_sync_v3 (seller_id INTEGER PRIMARY KEY, at INTEGER);`);
try { db.exec('ALTER TABLE returns_log ADD COLUMN keys TEXT'); } catch { /* ya existe */ }
try { db.exec('ALTER TABLE returns_log ADD COLUMN rev REAL'); } catch { /* ya existe */ }

const DAYS = 120;
const num = v => { const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };
const chileDay = d => new Intl.DateTimeFormat('en-CA', { timeZone: cfg.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const dayOf = v => { if (!v) return null; const s = String(v); const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(' ', 'T') + '-03:00'); return isNaN(d) ? null : chileDay(d); };
async function pool(list, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) { const k = i++; try { await fn(list[k]); } catch { /* sigue */ } } })); }

const up = db.prepare(`INSERT INTO returns_log (mk, rid, seller_id, day, units, amount, status, title, final, keys, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))
  ON CONFLICT(mk, rid) DO UPDATE SET seller_id=excluded.seller_id, day=excluded.day, units=excluded.units, amount=excluded.amount, status=excluded.status, title=excluded.title, final=excluded.final, keys=excluded.keys, updated_at=excluded.updated_at`);
// keys: ids de publicación / SKU / nombre de los productos devueltos (para calcular la ganancia perdida)
const upsert = (mk, rid, sid, day, units, amount, st, title, final, keys = []) => up.run(mk, rid, sid, day, units, amount, st, title, final, JSON.stringify([...new Set(keys.filter(Boolean).map(k => String(k).toUpperCase()))]));
const known = db.prepare('SELECT final, keys, rev FROM returns_log WHERE mk=? AND rid=?');
// costo de logística inversa que paga el vendedor (con IVA); en Mercado Libre se lee del envío de la devolución
const setRev = db.prepare('UPDATE returns_log SET rev=? WHERE mk=? AND rid=?');

async function syncMl(conn, sellerId) {
  const ml = require('./connectors/ml');
  const uid = conn.creds.user_id;
  const since = Date.now() - DAYS * 864e5;
  const claims = [];
  for (let off = 0; off < 2000; off += 50) {
    const r = await ml.raw(conn, `/post-purchase/v1/claims/search?players.role=respondent&players.user_id=${uid}&type=returns&limit=50&offset=${off}&sort=date_created:desc`);
    const list = r?.data || [];
    let old = false;
    for (const c of list) { if (new Date(c.date_created) < since) { old = true; break; } claims.push(c); }
    if (old || list.length < 50) break;
  }
  await pool(claims, 5, async c => {
    const k = known.get('ml', String(c.id));
    if (k && k.final && k.keys && k.rev != null) return; // ya cerrada y registrada
    let ret = null;
    try { ret = await ml.raw(conn, `/post-purchase/v2/claims/${c.id}/returns`); } catch { /* sin detalle */ }
    const st = String(ret?.status || c.status || '');
    // devolución cancelada o expirada: el comprador se quedó con el producto, no hay plata devuelta
    if (/cancel|expired/.test(st)) { upsert('ml', String(c.id), sellerId, dayOf(c.date_created) || chileDay(new Date()), 0, 0, 'cancelled', '', 1, ['-']); setRev.run(0, 'ml', String(c.id)); return; }
    const orderIds = [...new Set((ret?.orders || []).map(o => o.order_id).filter(Boolean))];
    if (!orderIds.length && c.resource === 'order') orderIds.push(c.resource_id);
    let amount = 0, units = 0, title = ''; const keys = [];
    for (const oid of orderIds.slice(0, 6)) {
      try {
        const o = await ml.raw(conn, `/orders/${oid}`);
        amount += num(o.total_amount);
        for (const it of o.order_items || []) { units += num(it.quantity) || 1; if (!title) title = it.item?.title || ''; keys.push(it.item?.id, it.item?.seller_sku, it.item?.title); }
      } catch { /* orden no disponible */ }
    }
    if (!orderIds.length && c.resource === 'shipment') {
      // la devolución apunta al envío: se toma la venta desde las etiquetas registradas en la app
      const o = db.prepare("SELECT items FROM orders WHERE marketplace='ml' AND external_id=?").get(String(c.resource_id));
      if (o) for (const it of JSON.parse(o.items || '[]')) { units += num(it.qty) || 1; if (!title) title = it.name || ''; keys.push(it.item_id, it.pub_id, it.id, it.sku, it.name); }
    }
    const final = c.status === 'closed' ? 1 : 0;
    // logística inversa: si Mercado Libre NO aplicó cobertura, el envío de vuelta lo paga el vendedor (receptor)
    let rev = null;
    try {
      const cl = c.resolution ? c : await ml.raw(conn, `/post-purchase/v1/claims/${c.id}`);
      const res = cl?.resolution;
      if (res) {
        rev = 0;
        if (res.applied_coverage === false) for (const sh of ret?.shipments || []) {
          if (sh.type && sh.type !== 'return') continue;
          const k2 = await ml.raw(conn, `/shipments/${sh.shipment_id}/costs`).catch(() => null);
          if (k2?.receiver && String(k2.receiver.user_id) === String(uid)) rev += num(k2.receiver.cost);
        }
      }
    } catch { /* sin dato */ }
    upsert('ml', String(c.id), sellerId, dayOf(c.date_created) || chileDay(new Date()), units || 1, amount, st || c.status || '', title, final, keys);
    setRev.run(rev, 'ml', String(c.id));
  });
}

async function syncFa(conn, sellerId) {
  const fa = require('./connectors/falabella');
  const after = new Date(Date.now() - DAYS * 864e5).toISOString().replace(/\.\d{3}Z$/, '+00:00');
  const byId = new Map();
  const st = o => JSON.stringify(o.Statuses || o.Status || '');
  // 1) órdenes en estado "returned"; 2) además se recorren las órdenes recientes y se toman las que tienen algo devuelto
  for (const extra of [{ Status: 'returned' }, {}]) {
    for (let off = 0; off < 3000; off += 100) {
      let page = [];
      try {
        const b = await fa.call(conn.creds, 'GetOrders', { ...(extra.Status ? {} : { CreatedAfter: after }), ...extra, Limit: '100', Offset: String(off), SortBy: 'created_at', SortDirection: 'DESC' });
        page = fa.list(b.Orders, 'Order');
      } catch (e) { console.warn('[devoluciones] Falabella', e.message); break; }
      for (const o of page) if (o && o.OrderId && /return/i.test(st(o)) && new Date(String(o.CreatedAt || '').replace(' ', 'T') + '-03:00') >= Date.now() - DAYS * 864e5) byId.set(String(o.OrderId), o);
      if (page.length < 100) break;
    }
  }
  const orders = [...byId.values()];
  syncFa.last = { seen: orders.length };
  await pool(orders, 5, async o => {
    const k = known.get('fa', String(o.OrderId));
    if (k && k.final && k.keys) return;
    const its = await fa.orderItems(conn.creds, o.OrderId).catch(e => { syncFa.last.err = e.message; return []; });
    const back = its.filter(i => /return/i.test(String(i.Status)));
    if (!back.length) { syncFa.last.noItems = (syncFa.last.noItems || 0) + 1; return; }
    syncFa.last.saved = (syncFa.last.saved || 0) + 1;
    const amount = back.reduce((a, i) => a + num(i.PaidPrice || i.ItemPrice), 0);
    upsert('fa', String(o.OrderId), sellerId, dayOf(o.UpdatedAt || o.CreatedAt) || chileDay(new Date()), back.length, amount, 'returned', back[0].Name || '', 1, back.flatMap(i => [i.Sku, i.ShopSku, i.Name]));
  });
}

async function syncPa(conn, sellerId) {
  const pa = require('./connectors/paris');
  const from = new Date(Date.now() - DAYS * 864e5).toISOString();
  for (let off = 0; off < 5000; off += 50) {
    const r = await pa.raw(conn, `/v3/sub-orders?gteCreatedAt=${encodeURIComponent(from)}&limit=50&offset=${off}`);
    const subs = pa.flatten(r?.data);
    for (const s of subs) {
      const back = (s.items || []).filter(i => i.returnId);
      if (!back.length) continue;
      const amount = back.reduce((a, i) => a + num(i.priceAfterDiscounts ?? i.basePrice), 0);
      upsert('pa', String(s.subOrderNumber), sellerId, dayOf(s.updatedAt || s.createdAt) || chileDay(new Date()), back.length, amount, 'returned', back[0].name || '', 0, back.flatMap(i => [i.sku, i.sellerSku, i.skuSeller, i.name]));
    }
    if (subs.length < 50) break;
  }
}

const running = new Map();
function refresh(sellerId, maxAgeMs = 30 * 60e3) {
  if (running.has(sellerId)) return running.get(sellerId);
  const last = db.prepare('SELECT at FROM returns_sync_v3 WHERE seller_id=?').get(sellerId)?.at || 0;
  if (Date.now() - last < maxAgeMs) return null;
  const p = (async () => {
    const sync = require('./sync');
    const conns = db.prepare("SELECT * FROM connections WHERE seller_id=? AND marketplace IN ('ml','fa','pa')").all(sellerId);
    for (const c of conns) {
      const conn = sync.connObj(c);
      try {
        if (c.marketplace === 'ml') await syncMl(conn, sellerId);
        if (c.marketplace === 'fa') await syncFa(conn, sellerId);
        if (c.marketplace === 'pa') await syncPa(conn, sellerId);
      } catch (e) { console.warn('[devoluciones]', c.marketplace, e.message); }
    }
    db.prepare('INSERT INTO returns_sync_v3 (seller_id, at) VALUES (?,?) ON CONFLICT(seller_id) DO UPDATE SET at=excluded.at').run(sellerId, Date.now());
  })().finally(() => running.delete(sellerId));
  running.set(sellerId, p);
  return p;
}

// Resumen del período: por marketplace y total (monto con IVA y neto)
function summary(sellerId, from, to) {
  const rows = db.prepare("SELECT mk, COUNT(*) n, SUM(units) u, SUM(amount) a, SUM(COALESCE(rev,0)) rv FROM returns_log WHERE seller_id=? AND day>=? AND day<=? AND status<>'cancelled' GROUP BY mk").all(sellerId, from, to);
  const by = { ml: { n: 0, units: 0, amount: 0, rev: 0 }, fa: { n: 0, units: 0, amount: 0, rev: 0 }, pa: { n: 0, units: 0, amount: 0, rev: 0 } };
  for (const r of rows) if (by[r.mk]) by[r.mk] = { n: r.n, units: r.u || 0, amount: Math.round(r.a || 0), rev: Math.round(r.rv || 0) };
  const tot = Object.values(by).reduce((a, x) => ({ n: a.n + x.n, units: a.units + x.units, amount: a.amount + x.amount, rev: a.rev + x.rev }), { n: 0, units: 0, amount: 0, rev: 0 });
  const last = db.prepare('SELECT at FROM returns_sync_v3 WHERE seller_id=?').get(sellerId)?.at || null;
  return { by, total: { ...tot, net: Math.round(tot.amount / 1.19) }, synced_at: last, syncing: running.has(sellerId) };
}

async function get(sellerId, from, to) {
  const p = refresh(sellerId);
  if (p) await Promise.race([p, new Promise(r => setTimeout(r, 2500))]);
  return summary(sellerId, from, to);
}

// Productos devueltos del período (para descontar la ganancia perdida en la calculadora)
function items(sellerId, from, to) {
  return db.prepare("SELECT mk, units, amount, keys FROM returns_log WHERE seller_id=? AND day>=? AND day<=? AND status<>'cancelled'").all(sellerId, from, to)
    .map(r => ({ mk: r.mk, units: r.units || 0, amount: r.amount || 0, keys: (() => { try { return JSON.parse(r.keys || '[]'); } catch { return []; } })() }));
}

module.exports = { get, refresh, summary, items, syncFa };

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
// Cuentas cuyas ventas le llegan a cada usuario: el vendedor, las suyas; el administrador, las que marcó como propias
// (si no ha elegido, las cuentas cuyo nombre coincide con el suyo, p. ej. javier → JAVI TEC)
function notifSellers(user) {
  if (user.role === 'seller') return [user.seller_id];
  const pref = db.prepare("SELECT value FROM user_prefs WHERE user_id=? AND key='notif_sellers'").get(user.id);
  if (pref) { try { return JSON.parse(pref.value); } catch {} }
  const key = String(user.name || '').trim().toLowerCase().split(/\s+/)[0].slice(0, 4);
  return key.length >= 3 ? db.prepare('SELECT id, name FROM sellers').all().filter(x => x.name.toLowerCase().split(/\s+/).some(w => w.startsWith(key))).map(x => x.id) : [];
}
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
    // ya salió (entregado al correo / retirado por el conductor) o cancelado en el marketplace
    out: Boolean(meta.out) || ['shipped', 'delivered', 'not_delivered'].includes(meta.status), mk_cancelled: meta.status === 'cancelled' || Boolean(meta.cancelled),
    ml_downloaded: o.marketplace === 'ml' && meta.substatus === 'printed' && !['printed', 'shipped'].includes(o.state),
    prev_print: ['printed', 'shipped'].includes(o.state) ? null : (db.prepare('SELECT by, at FROM print_log WHERE order_id=? ORDER BY at DESC LIMIT 1').get(o.id) || null),
    late, late_ml: late && meta.ml_delayed === true, deadline: late ? lateDeadline(o.marketplace, meta)?.toISOString() : null, dl: warnDeadline(o, meta),
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
  // Falabella: escaneado por la agencia/Falabella dentro del día de su plazo
  if (mk === 'fa') return chileAt(String(v).slice(0, 10), '23:59:59');
  if (mk === 'ml' && meta.logistic === 'self_service') {
    // Flex: vale el primer plazo que dio Mercado Libre (si lo corrió a otro día es porque no se entregó a tiempo)
    const f = parseD(meta.dispatch_first); const base = f && f < d ? f : d;
    return chileAt(chileDay(base), '23:00:00'); // Flex: entregado al cliente a las 23:00 del día de despacho
  }
  return d;
}
function isLate(o, meta) {
  if (['shipped', 'cancelled'].includes(o.state)) return false;
  // cancelada en el marketplace (aunque ya estuviera impresa) no es atrasada
  if (meta.status === 'cancelled' || meta.cancelled) return false;
  // ya salió (la recibió la agencia/centro). Flex sigue contando hasta que se entrega al cliente
  const flex = o.marketplace === 'ml' && meta.logistic === 'self_service';
  if (meta.out && !flex) return false;
  if (meta.ml_delayed === true) return true; // Mercado Libre la marca atrasada
  const dl = lateDeadline(o.marketplace, meta);
  return Boolean(dl && dl < new Date());
}
// Plazo límite (para "Advertencia": faltan 30 minutos o menos) solo si el paquete aún puede atrasarse
function warnDeadline(o, meta) {
  if (['shipped', 'cancelled'].includes(o.state) || meta.status === 'cancelled' || meta.cancelled) return null;
  if (meta.out && !(o.marketplace === 'ml' && meta.logistic === 'self_service')) return null;
  return lateDeadline(o.marketplace, meta)?.toISOString() || null;
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
        if (p === '/api/mkp/read') { await mkp.markRead(user, b.conn_id, b.pack_id); return ok(res); }
        if (p === '/api/mkp/question-delete') { await mkp.deleteQuestion(user, b.conn_id, b.question_id); return ok(res); }
        if (!String(b.text || '').trim()) return fail(res, 400, 'Escribe una respuesta');
        if (p === '/api/mkp/answer') { await mkp.answerQuestion(user, b.conn_id, b.question_id, b.text); return ok(res); }
        if (p === '/api/mkp/message') { await mkp.sendMessage(user, b.conn_id, b.pack_id, b.buyer_id, b.text); return ok(res); }
        if (p === '/api/mkp/claim-reply') { await mkp.claimReply(user, b.conn_id, b.claim_id, b.text, b.to_mediator); return ok(res); }
      }
      const at = p.match(/^\/api\/mkp\/att\/(\d+)\/(msg|claim)\/(\d+)\/([^/]+)$/);
      if (at && m === 'GET') { const r = await mkp.attachment(user, at[1], at[2], at[3], decodeURIComponent(at[4])); return send(res, 200, r.buf, { 'content-type': r.type, 'cache-control': 'private, max-age=86400' }); }
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
  // Notificaciones de ventas (con precio): solo administradores y vendedores, nunca el fulfillment
  if (p === '/api/notifications' && m === 'GET') {
    if (!['admin', 'seller', 'fulfillment'].includes(user.role)) return fail(res, 403, 'No permitido');
    sales.refreshRecent().catch(() => {});
    // fulfillment: ventas de todas las cuentas, sin precios ni número de venta, y sin los productos bloqueados
    if (user.role === 'fulfillment') return ok(res, sales.feed(db.prepare('SELECT id FROM sellers').all().map(x => x.id), 80, { noMoney: true }));
    return ok(res, { ...sales.feed(notifSellers(user)), mine: notifSellers(user), sellers: user.role === 'admin' ? db.prepare('SELECT id, name FROM sellers ORDER BY name').all() : [] });
  }
  // El administrador elige qué cuentas son "suyas" para las notificaciones
  if (p === '/api/notifications/prefs' && m === 'POST') {
    if (user.role !== 'admin') return fail(res, 403, 'No permitido');
    const b = await readBody(req);
    const ids = (Array.isArray(b.sellers) ? b.sellers : []).map(Number).filter(Boolean);
    db.prepare('INSERT OR REPLACE INTO user_prefs (user_id, key, value) VALUES (?,?,?)').run(user.id, 'notif_sellers', JSON.stringify(ids));
    return ok(res, { mine: ids });
  }
  if (p === '/api/sales' && m === 'GET') {
    if (user.role === 'fulfillment') return fail(res, 403, 'No permitido');
    if (url.searchParams.get('refresh') === '1') await sales.refresh(true).catch(() => {});
    else sales.refresh().catch(() => {});
    const sid = user.role === 'seller' ? user.seller_id : (Number(url.searchParams.get('seller_id')) || null);
    const sellersList = user.role === 'admin' ? db.prepare('SELECT id, name FROM sellers ORDER BY name').all() : [];
    return ok(res, { ...sales.summary(sid, url.searchParams.get('from'), url.searchParams.get('to')), sellers: sellersList, seller_id: sid });
  }

  // Calculador de ganancia por publicación (vendedor: lo suyo; administrador: el vendedor que elija)
  if (p === '/api/profit' && m === 'GET') {
    if (user.role === 'fulfillment') return fail(res, 403, 'No permitido');
    const sid = user.role === 'seller' ? user.seller_id : Number(url.searchParams.get('seller_id')) || null;
    if (!sid) return ok(res, { rows: [], saved: {}, errors: [], need_seller: true });
    const isDay = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
    const to = isDay(url.searchParams.get('to')) ? url.searchParams.get('to') : sales.today();
    let from = isDay(url.searchParams.get('from')) ? url.searchParams.get('from') : null;
    if (!from) { const d = new Date(to + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 29); from = d.toISOString().slice(0, 10); }
    if (from > to) from = to;
    const R = require('./returns');
    const rd = await R.get(sid, from, to).catch(() => null);
    let rets = []; try { rets = R.items(sid, from, to); } catch { /* sin devoluciones */ }
    const pd = await require('./profit').get(sid, { force: url.searchParams.get('refresh') === '1', from, to, rets });
    return ok(res, { ...pd, returns: rd });
  }
  if (p === '/api/profit/save' && m === 'POST') {
    if (user.role === 'fulfillment') return fail(res, 403, 'No permitido');
    const b = await readBody(req);
    const sid = user.role === 'seller' ? user.seller_id : Number(b.seller_id) || null;
    if (!sid) return fail(res, 400, 'Elige un vendedor');
    try { require('./profit').save(sid, b); } catch (e) { return fail(res, 400, e.message); }
    return ok(res, { ok: true });
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
    // diagnóstico (solo lectura, administrador): ML con cabeceras, Falabella por acción y Paris por ruta
    const dbx = p.match(/^\/api\/admin\/debug\/(mlh|fa|pa)\/(\d+)$/);
    if (dbx && m === 'GET') {
      const c = db.prepare('SELECT * FROM connections WHERE id=?').get(Number(dbx[2]));
      if (!c) return fail(res, 404, 'Sin datos');
      const co = sync.connObj(c);
      try {
        if (dbx[1] === 'mlh') { const h = {}; for (const x of url.searchParams.getAll('h')) { const i = x.indexOf(':'); if (i > 0) h[x.slice(0, i)] = x.slice(i + 1); } return ok(res, { data: await sync.connectors.ml.apiH(co, url.searchParams.get('path') || '/', h) }); }
        if (dbx[1] === 'fa') { const action = url.searchParams.get('action') || ''; if (!/^Get[A-Za-z]+$/.test(action)) return fail(res, 400, 'Solo acciones Get'); return ok(res, { data: await sync.connectors.fa.call(co.creds, action, JSON.parse(url.searchParams.get('params') || '{}')) }); }
        if (dbx[1] === 'pa') { const path = url.searchParams.get('path') || ''; if (!path.startsWith('/')) return fail(res, 400, 'Ruta'); return ok(res, { data: await sync.connectors.pa.raw(co, path) }); }
      } catch (e) { return fail(res, 500, e.message); }
    }
    // diagnóstico: vuelve a leer las devoluciones de Falabella de una conexión y dice cuántas encontró
    const dbf = p.match(/^\/api\/admin\/debug\/fareturns\/(\d+)$/);
    if (dbf && m === 'GET') {
      const c = db.prepare("SELECT * FROM connections WHERE id=? AND marketplace='fa'").get(Number(dbf[1]));
      if (!c) return fail(res, 404, 'Sin datos');
      const R = require('./returns');
      try { await R.syncFa(sync.connObj(c), c.seller_id); return ok(res, { seller_id: c.seller_id, ...R.syncFa.last, rows: db.prepare("SELECT COUNT(*) n FROM returns_log WHERE mk='fa' AND seller_id=?").get(c.seller_id).n }); }
      catch (e) { return fail(res, 500, e.stack || e.message); }
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

restore().then(() => { require('./server'); setTimeout(() => { try { require('./profit'); } catch (e) { console.warn('[ganancia]', e.message); } }, 60e3); });

};

global.__EH_PUBLIC = {"app.css":"OnJvb3R7CiAgLS1iZzojRUFGNUZDOyAtLWJnMjojRDhFREY5OyAtLXN1cmZhY2U6I0ZGRkZGRjsgLS1zdXJmYWNlMjojRjRGQUZFOwogIC0taW5rOiMwQzJCNDA7IC0tbXV0ZWQ6IzU1NzI4NzsgLS1saW5lOiNDOUUyRjI7CiAgLS1hY2NlbnQ6IzE2OTNEMzsgLS1hY2NlbnQtc3Ryb25nOiMwQTZGQTY7IC0tc2t5OiM3RkNERjI7IC0taWNlOiNCRkU2Rjg7CiAgLS1vazojMjM5NDZBOyAtLW9rLWJnOiNEREY0RUE7IC0tbG9jazojQzgzRTU1OyAtLWxvY2stYmc6I0ZCRTNFODsgLS13YXJuOiNCNzc5MEY7IC0td2Fybi1iZzojRkNGMEQ2OwogIC0tbWw6I0ZGRTYwMDsgLS1tbC1pbms6IzJEMzI3NzsgLS1mYTojQUFENTAwOyAtLWZhLWluazojMkYzQTAwOyAtLXBhOiMwMDc4Qzg7IC0tcGEtaW5rOiNGRkZGRkY7CiAgLS1zaGFkb3c6MCAxMHB4IDMwcHggLTE0cHggcmdiYSgxMiw3MCwxMTAsLjM1KTsKICAtLWRpc3BsYXk6IkJhbG9vIDIiLCJUcmVidWNoZXQgTVMiLHN5c3RlbS11aSxzYW5zLXNlcmlmOwogIC0tYm9keToiTnVuaXRvIFNhbnMiLHN5c3RlbS11aSwtYXBwbGUtc3lzdGVtLCJTZWdvZSBVSSIsc2Fucy1zZXJpZjsKICAtLW1vbm86IkpldEJyYWlucyBNb25vIix1aS1tb25vc3BhY2UsTWVubG8sQ29uc29sYXMsbW9ub3NwYWNlOwogIGNvbG9yLXNjaGVtZTpsaWdodDsKfQoqe2JveC1zaXppbmc6Ym9yZGVyLWJveH0KaHRtbCxib2R5e21hcmdpbjowfQpib2R5e2JhY2tncm91bmQ6dmFyKC0tYmcpO2NvbG9yOnZhcigtLWluayk7Zm9udC1mYW1pbHk6dmFyKC0tYm9keSk7Zm9udC1zaXplOjE1cHg7bGluZS1oZWlnaHQ6MS41O21pbi1oZWlnaHQ6MTAwdmh9Ci53cmFwe21heC13aWR0aDoxMjQwcHg7bWFyZ2luOjAgYXV0bztwYWRkaW5nLWlubGluZToyMHB4O3BhZGRpbmctYmxvY2s6MCA2MHB4fQpoMSxoMixoM3tmb250LWZhbWlseTp2YXIoLS1kaXNwbGF5KTtsaW5lLWhlaWdodDoxLjE7dGV4dC13cmFwOmJhbGFuY2U7bWFyZ2luOjB9CmJ1dHRvbntmb250OmluaGVyaXQ7Y3Vyc29yOnBvaW50ZXI7Y29sb3I6aW5oZXJpdH0KYXtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KYnV0dG9uOmZvY3VzLXZpc2libGUsaW5wdXQ6Zm9jdXMtdmlzaWJsZSxzZWxlY3Q6Zm9jdXMtdmlzaWJsZSx0ZXh0YXJlYTpmb2N1cy12aXNpYmxlLGE6Zm9jdXMtdmlzaWJsZXtvdXRsaW5lOjNweCBzb2xpZCB2YXIoLS1za3kpO291dGxpbmUtb2Zmc2V0OjJweH0KLm1vbm97Zm9udC1mYW1pbHk6dmFyKC0tbW9ubyk7Zm9udC1zaXplOi44NmVtfQoubXV0ZWR7Y29sb3I6dmFyKC0tbXV0ZWQpfQpbaGlkZGVuXXtkaXNwbGF5Om5vbmUhaW1wb3J0YW50fQoKLyogYmFycmEgc3VwZXJpb3IgKi8KLnRvcHtwb3NpdGlvbjpzdGlja3k7dG9wOjA7ei1pbmRleDoyMDtiYWNrZ3JvdW5kOmNvbG9yLW1peChpbiBzcmdiLHZhcigtLWJnKSA4OCUsdHJhbnNwYXJlbnQpO2JhY2tkcm9wLWZpbHRlcjpibHVyKDhweCk7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tbGluZSl9Ci50b3AgLndyYXB7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6MTRweDtmbGV4LXdyYXA6d3JhcDtwYWRkaW5nLWJsb2NrOjEwcHh9Ci5icmFuZHtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDoxMHB4O2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MjJweDtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKTt0ZXh0LWRlY29yYXRpb246bm9uZX0KLmJyYW5kIGltZ3t3aWR0aDozMnB4O2hlaWdodDozMnB4fQoubmF2e2Rpc3BsYXk6ZmxleDtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czo5OTlweDtwYWRkaW5nOjRweDtnYXA6NHB4fQoubmF2IGJ1dHRvbntib3JkZXI6MDtiYWNrZ3JvdW5kOnRyYW5zcGFyZW50O2NvbG9yOnZhcigtLW11dGVkKTtwYWRkaW5nOjdweCAxNXB4O2JvcmRlci1yYWRpdXM6OTk5cHg7Zm9udC13ZWlnaHQ6NzAwfQoubmF2IGJ1dHRvblthcmlhLWN1cnJlbnQ9InRydWUiXXtiYWNrZ3JvdW5kOnZhcigtLWFjY2VudCk7Y29sb3I6I2ZmZn0KLnNwYWNlcntmbGV4OjF9Ci5saXZle2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjZweDtmb250LXNpemU6MTIuNXB4O2ZvbnQtd2VpZ2h0OjcwMDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5saXZlIGl7d2lkdGg6OXB4O2hlaWdodDo5cHg7Ym9yZGVyLXJhZGl1czo1MCU7YmFja2dyb3VuZDp2YXIoLS1tdXRlZCl9Ci5saXZlLm9ue2NvbG9yOnZhcigtLW9rKX0gLmxpdmUub24gaXtiYWNrZ3JvdW5kOnZhcigtLW9rKTtib3gtc2hhZG93OjAgMCAwIDRweCBjb2xvci1taXgoaW4gc3JnYix2YXIoLS1vaykgMjUlLHRyYW5zcGFyZW50KX0KLmNsb2Nre2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjEwcHg7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTRweDtwYWRkaW5nOjVweCAxMnB4fQouY2xvY2sgYntmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6MTdweDtmb250LXZhcmlhbnQtbnVtZXJpYzp0YWJ1bGFyLW51bXN9Ci5jbG9jayBzbWFsbHtjb2xvcjp2YXIoLS1tdXRlZCk7ZGlzcGxheTpibG9jaztsaW5lLWhlaWdodDoxLjE7Zm9udC1zaXplOjEwLjVweDt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7bGV0dGVyLXNwYWNpbmc6LjA2ZW19Ci5jbG9jay5sYXRlIGJ7Y29sb3I6dmFyKC0tbG9jayl9Ci51c2Vye2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjhweDtmb250LXNpemU6MTMuNXB4fQoudXNlciBie2Rpc3BsYXk6YmxvY2s7bGluZS1oZWlnaHQ6MS4xfQoudXNlciBzbWFsbHtjb2xvcjp2YXIoLS1tdXRlZCl9CgovKiBlbGVtZW50b3MgKi8KLmJ0bnt0ZXh0LWRlY29yYXRpb246bm9uZTtib3JkZXI6MDtib3JkZXItcmFkaXVzOjEzcHg7cGFkZGluZzo5cHggMTVweDtmb250LXdlaWdodDo3MDA7ZGlzcGxheTppbmxpbmUtZmxleDtnYXA6OHB4O2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyO3doaXRlLXNwYWNlOm5vd3JhcH0KLmJ0biBzdmd7d2lkdGg6MThweDtoZWlnaHQ6MThweDtmbGV4Om5vbmV9Ci5idG4tcHJpbWFyeXtiYWNrZ3JvdW5kOnZhcigtLWFjY2VudCk7Y29sb3I6I2ZmZn0KLmJ0bi1wcmltYXJ5OmhvdmVye2JhY2tncm91bmQ6dmFyKC0tYWNjZW50LXN0cm9uZyl9Ci5idG4tZ2hvc3R7YmFja2dyb3VuZDp2YXIoLS1pY2UpO2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQouYnRuLWxpbmV7YmFja2dyb3VuZDp0cmFuc3BhcmVudDtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2NvbG9yOnZhcigtLWluayl9Ci5idG4tZGFuZ2Vye2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayl9Ci5idG46ZGlzYWJsZWR7b3BhY2l0eTouNDU7Y3Vyc29yOm5vdC1hbGxvd2VkfQouYnRuLXNte3BhZGRpbmc6NnB4IDEwcHg7Zm9udC1zaXplOjEzcHg7Ym9yZGVyLXJhZGl1czoxMHB4fQpzZWxlY3QsaW5wdXRbdHlwZT10ZXh0XSxpbnB1dFt0eXBlPWVtYWlsXSxpbnB1dFt0eXBlPXBhc3N3b3JkXSxpbnB1dFt0eXBlPXNlYXJjaF0sdGV4dGFyZWF7Zm9udDppbmhlcml0O2NvbG9yOnZhcigtLWluayk7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlMik7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjEycHg7cGFkZGluZzo4cHggMTJweDttaW4td2lkdGg6MDt3aWR0aDoxMDAlfQp0ZXh0YXJlYXtyZXNpemU6dmVydGljYWw7bWluLWhlaWdodDo3MHB4fQpsYWJlbC5me2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjRweDtmb250LXNpemU6MTIuNXB4O2ZvbnQtd2VpZ2h0OjcwMDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5jaGlwc3tkaXNwbGF5OmZsZXg7Z2FwOjZweDtmbGV4LXdyYXA6d3JhcH0KLmNoaXB7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKTtjb2xvcjp2YXIoLS1pbmspO3BhZGRpbmc6NnB4IDEycHg7Ym9yZGVyLXJhZGl1czo5OTlweDtmb250LXdlaWdodDo2MDA7Zm9udC1zaXplOjEzcHh9Ci5jaGlwW2FyaWEtcHJlc3NlZD0idHJ1ZSJde2JhY2tncm91bmQ6dmFyKC0tYWNjZW50KTtib3JkZXItY29sb3I6dmFyKC0tYWNjZW50KTtjb2xvcjojZmZmfQouc3dpdGNoe2Rpc3BsYXk6aW5saW5lLWZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDoxMHB4O2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTRweDtjdXJzb3I6cG9pbnRlcjt1c2VyLXNlbGVjdDpub25lfQouc3dpdGNoIGlucHV0e2FwcGVhcmFuY2U6bm9uZTt3aWR0aDo0NHB4O2hlaWdodDoyNnB4O2JvcmRlci1yYWRpdXM6OTk5cHg7YmFja2dyb3VuZDp2YXIoLS1saW5lKTtwb3NpdGlvbjpyZWxhdGl2ZTt0cmFuc2l0aW9uOmJhY2tncm91bmQgLjJzO2N1cnNvcjpwb2ludGVyO21hcmdpbjowO2ZsZXg6bm9uZX0KLnN3aXRjaCBpbnB1dDo6YWZ0ZXJ7Y29udGVudDoiIjtwb3NpdGlvbjphYnNvbHV0ZTt0b3A6M3B4O2xlZnQ6M3B4O3dpZHRoOjIwcHg7aGVpZ2h0OjIwcHg7Ym9yZGVyLXJhZGl1czo1MCU7YmFja2dyb3VuZDojZmZmO3RyYW5zaXRpb246bGVmdCAuMnM7Ym94LXNoYWRvdzowIDFweCAzcHggcmdiYSgwLDAsMCwuMjUpfQouc3dpdGNoIGlucHV0OmNoZWNrZWR7YmFja2dyb3VuZDp2YXIoLS1vayl9Ci5zd2l0Y2ggaW5wdXQ6Y2hlY2tlZDo6YWZ0ZXJ7bGVmdDoyMXB4fQoKLnBhbmVse2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjIycHg7Ym94LXNoYWRvdzp2YXIoLS1zaGFkb3cpfQoucGFuZWwtaGVhZHtkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7Z2FwOjEycHg7YWxpZ24taXRlbXM6Y2VudGVyO3BhZGRpbmc6MTZweCAyMHB4O2JvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLWxpbmUpfQoucGFuZWwtaGVhZCBoMntmb250LXNpemU6MjNweDttYXJnaW4tcmlnaHQ6YXV0b30KLnBhbmVsLWJvZHl7cGFkZGluZzoxNnB4IDIwcHh9Ci5wYW5lbC1mb290e2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6MTBweDthbGlnbi1pdGVtczpjZW50ZXI7cGFkZGluZzoxNHB4IDIwcHg7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tbGluZSk7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtc2l6ZToxMy41cHh9CgoubWt7ZGlzcGxheTppbmxpbmUtZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Zm9udC13ZWlnaHQ6NzAwO2ZvbnQtc2l6ZToxMnB4O3BhZGRpbmc6M3B4IDlweDtib3JkZXItcmFkaXVzOjhweDt3aGl0ZS1zcGFjZTpub3dyYXB9Ci5tay5tbHtiYWNrZ3JvdW5kOnZhcigtLW1sKTtjb2xvcjp2YXIoLS1tbC1pbmspfSAubWsuZmF7YmFja2dyb3VuZDp2YXIoLS1mYSk7Y29sb3I6dmFyKC0tZmEtaW5rKX0gLm1rLnBhe2JhY2tncm91bmQ6dmFyKC0tcGEpO2NvbG9yOnZhcigtLXBhLWluayl9Ci5waWxse2Rpc3BsYXk6aW5saW5lLWZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo2cHg7Ym9yZGVyLXJhZGl1czo5OTlweDtwYWRkaW5nOjRweCAxMHB4O2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTIuNXB4O3doaXRlLXNwYWNlOm5vd3JhcH0KLnBpbGwgc3Zne3dpZHRoOjE0cHg7aGVpZ2h0OjE0cHh9Ci5waWxsLnJlYWR5e2JhY2tncm91bmQ6dmFyKC0tb2stYmcpO2NvbG9yOnZhcigtLW9rKX0KLnBpbGwuYmxvY2tlZHtiYWNrZ3JvdW5kOiNFM0U3RUM7Y29sb3I6IzRBNTU2M30KLnBpbGwucHJpbnRlZHtiYWNrZ3JvdW5kOnZhcigtLWxvY2stYmcpO2NvbG9yOnZhcigtLWxvY2spfQoucGlsbC53YWl0aW5ne2JhY2tncm91bmQ6dmFyKC0td2Fybi1iZyk7Y29sb3I6dmFyKC0td2Fybil9Ci5waWxsLmVycm9ye2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayl9Ci5waWxsLmNhbmNlbGxlZHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKTtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5ub3Rle2Rpc3BsYXk6YmxvY2s7Zm9udC1zaXplOjEycHg7Y29sb3I6dmFyKC0tbXV0ZWQpO21hcmdpbi10b3A6NHB4O21heC13aWR0aDozNGNofQoubm90ZS5iYWR7Y29sb3I6dmFyKC0tbG9jayl9CgovKiBow6lyb2UgKi8KLmhlcm97ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczoxLjFmciAuOWZyO2dhcDoyNHB4O2FsaWduLWl0ZW1zOmNlbnRlcjtwYWRkaW5nLWJsb2NrOjI0cHggNnB4fQouaGVybyBoMXtmb250LXNpemU6Y2xhbXAoMjhweCwzLjZ2dyw0MHB4KTtmb250LXdlaWdodDo4MDB9Ci5oZXJvIGgxIGVte2ZvbnQtc3R5bGU6bm9ybWFsO2NvbG9yOnZhcigtLWFjY2VudCl9Ci5oZXJvIHB7Y29sb3I6dmFyKC0tbXV0ZWQpO21heC13aWR0aDo1NmNoO21hcmdpbjoxMHB4IDAgMH0KLmhlcm8gc3Zne3dpZHRoOjEwMCU7aGVpZ2h0OmF1dG87bWF4LWhlaWdodDoyMTBweH0KCi8qIGtwaXMgKi8KLmtwaXN7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoNCwxZnIpO2dhcDoxNHB4O21hcmdpbi1ibG9jazoxOHB4fQoua3Bpe2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjE4cHg7cGFkZGluZzoxNHB4IDE2cHg7ZGlzcGxheTpmbGV4O2dhcDoxMnB4O2FsaWduLWl0ZW1zOmNlbnRlcn0KLmtwaSAuaWN7d2lkdGg6NDJweDtoZWlnaHQ6NDJweDtib3JkZXItcmFkaXVzOjEycHg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtmbGV4Om5vbmV9Ci5rcGkgLmljIHN2Z3t3aWR0aDoyMnB4O2hlaWdodDoyMnB4fQoua3BpLm9rIC5pY3tiYWNrZ3JvdW5kOnZhcigtLW9rLWJnKTtjb2xvcjp2YXIoLS1vayl9Ci5rcGkud2FpdCAuaWN7YmFja2dyb3VuZDp2YXIoLS13YXJuLWJnKTtjb2xvcjp2YXIoLS13YXJuKX0KLmtwaS5sb2NrIC5pY3tiYWNrZ3JvdW5kOnZhcigtLWxvY2stYmcpO2NvbG9yOnZhcigtLWxvY2spfQoua3BpLmRvbmUgLmlje2JhY2tncm91bmQ6dmFyKC0taWNlKTtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KLmtwaSBie2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtc2l6ZToyOHB4O2xpbmUtaGVpZ2h0OjE7ZGlzcGxheTpibG9jaztmb250LXZhcmlhbnQtbnVtZXJpYzp0YWJ1bGFyLW51bXN9Ci5rcGkgc3Bhbntjb2xvcjp2YXIoLS1tdXRlZCk7Zm9udC1zaXplOjEzcHh9CgouYXV0b2JhcntkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7Z2FwOjE0cHg7YWxpZ24taXRlbXM6Y2VudGVyO2p1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuO2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDEyMGRlZyx2YXIoLS1iZzIpLHZhcigtLXN1cmZhY2UpKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MThweDtwYWRkaW5nOjE0cHggMThweDttYXJnaW4tYm90dG9tOjE2cHh9Ci5hdXRvYmFyIHB7bWFyZ2luOjJweCAwIDA7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtc2l6ZToxM3B4O21heC13aWR0aDo3MGNofQoKLmZpbHRlcnN7ZGlzcGxheTpmbGV4O2ZsZXgtd3JhcDp3cmFwO2dhcDoxMHB4O2FsaWduLWl0ZW1zOmNlbnRlcn0KLmZpbHRlcnMgc2VsZWN0LC5maWx0ZXJzIGlucHV0e3dpZHRoOmF1dG99Ci50YWJsZS13cmFwe292ZXJmbG93LXg6YXV0b30KdGFibGV7d2lkdGg6MTAwJTtib3JkZXItY29sbGFwc2U6Y29sbGFwc2U7bWluLXdpZHRoOjgyMHB4fQp0aHtmb250LXNpemU6MTEuNXB4O3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtsZXR0ZXItc3BhY2luZzouMDdlbTtjb2xvcjp2YXIoLS1tdXRlZCk7dGV4dC1hbGlnbjpsZWZ0O3BhZGRpbmc6MTBweCAxNHB4O2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZTIpO3doaXRlLXNwYWNlOm5vd3JhcH0KdGR7cGFkZGluZzoxMXB4IDE0cHg7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tbGluZSk7dmVydGljYWwtYWxpZ246bWlkZGxlfQp0ci5pcy1ibG9ja2VkIHRke2JhY2tncm91bmQ6Y29sb3ItbWl4KGluIHNyZ2IsdmFyKC0tbG9jay1iZykgNDUlLHRyYW5zcGFyZW50KX0KdHIuaXMtbmV3IHRke2FuaW1hdGlvbjpmbGFzaCAyLjVzIGVhc2Utb3V0fQpAa2V5ZnJhbWVzIGZsYXNoe2Zyb217YmFja2dyb3VuZDpjb2xvci1taXgoaW4gc3JnYix2YXIoLS1za3kpIDQ1JSx0cmFuc3BhcmVudCl9dG97YmFja2dyb3VuZDp0cmFuc3BhcmVudH19Ci5pdGVtc3tkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDoycHg7Zm9udC1zaXplOjEzLjVweH0KLml0ZW1zIC52e2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTIuNXB4fQouaXRlbXMgLmJhZHtjb2xvcjp2YXIoLS1sb2NrKTtmb250LXdlaWdodDo3MDB9Ci5jYnt3aWR0aDoxOXB4O2hlaWdodDoxOXB4O2FjY2VudC1jb2xvcjp2YXIoLS1hY2NlbnQpfQoubG9ja2NlbGx7Y29sb3I6dmFyKC0tbG9jayk7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcn0KLmxvY2tjZWxsIHN2Z3t3aWR0aDoxOHB4O2hlaWdodDoxOHB4fQoucm93LWFjdGlvbnN7ZGlzcGxheTpmbGV4O2dhcDo2cHg7ZmxleC13cmFwOndyYXB9Ci5lbXB0eXtwYWRkaW5nOjQwcHggMjBweDt0ZXh0LWFsaWduOmNlbnRlcjtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5lbXB0eSBzdmd7d2lkdGg6MTIwcHg7aGVpZ2h0OmF1dG87bWFyZ2luLWJvdHRvbToxMHB4fQoKLyogdmVuZGVkb3IgKi8KLnNlY3Rpb24tdGl0bGV7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6MTJweDtmbGV4LXdyYXA6d3JhcDttYXJnaW4tYmxvY2s6MjRweCAxMnB4fQouc2VjdGlvbi10aXRsZSBoMntmb250LXNpemU6MjZweH0KLmNvbm57ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoMywxZnIpO2dhcDoxNHB4fQoubWNhcmR7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MjBweDtwYWRkaW5nOjE2cHg7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MTBweH0KLm1jYXJkIC5sb2dve2hlaWdodDo0NHB4O2JvcmRlci1yYWRpdXM6MTJweDtkaXNwbGF5OmdyaWQ7cGxhY2UtaXRlbXM6Y2VudGVyO2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MThweH0KLm1jYXJkIC5ob3d7Zm9udC1zaXplOjEyLjVweDtjb2xvcjp2YXIoLS1tdXRlZCk7bWFyZ2luOjB9Ci5zdGF0ZXtmb250LXNpemU6MTNweDtmb250LXdlaWdodDo3MDA7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4fQouc3RhdGUub257Y29sb3I6dmFyKC0tb2spfSAuc3RhdGUub2Zme2NvbG9yOnZhcigtLW11dGVkKX0gLnN0YXRlLmVycntjb2xvcjp2YXIoLS1sb2NrKX0KLnN0YXRlIGl7d2lkdGg6OHB4O2hlaWdodDo4cHg7Ym9yZGVyLXJhZGl1czo1MCU7YmFja2dyb3VuZDpjdXJyZW50Q29sb3I7ZGlzcGxheTppbmxpbmUtYmxvY2t9Ci5jb3B5e2Rpc3BsYXk6ZmxleDtnYXA6NnB4fQouY29weSBpbnB1dHtmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6MTEuNXB4fQouZ3JpZDJ7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczoxZnIgMWZyO2dhcDoyMHB4O21hcmdpbi10b3A6MjBweH0KLnJ1bGV7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczphdXRvIDFmcjtnYXA6MTRweDthbGlnbi1pdGVtczpjZW50ZXI7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlMik7Ym9yZGVyOjFweCBkYXNoZWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czoxNnB4O3BhZGRpbmc6MTJweCAxNHB4fQoucnVsZSBzdmd7d2lkdGg6MTEwcHg7aGVpZ2h0OmF1dG99Ci5ydWxlIHB7bWFyZ2luOjA7Zm9udC1zaXplOjEzLjVweDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5ydWxlIGJ7Y29sb3I6dmFyKC0taW5rKX0KLmFkZHJvd3tkaXNwbGF5OmdyaWQ7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmciAxNTBweCBhdXRvO2dhcDo4cHg7YWxpZ24taXRlbXM6c3RhcnR9Ci50YWdze2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6OHB4O21heC1oZWlnaHQ6MjYwcHg7b3ZlcmZsb3c6YXV0b30KLnRhZ3tkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4O2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayk7Ym9yZGVyLXJhZGl1czoxMHB4O3BhZGRpbmc6NHB4IDRweCA0cHggMTBweDtmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6MTIuNXB4O2ZvbnQtd2VpZ2h0OjcwMH0KLnRhZyBzbWFsbHtmb250LWZhbWlseTp2YXIoLS1ib2R5KTtmb250LXdlaWdodDo2MDA7b3BhY2l0eTouOH0KLnRhZyBidXR0b257Ym9yZGVyOjA7YmFja2dyb3VuZDp0cmFuc3BhcmVudDtjb2xvcjppbmhlcml0O3dpZHRoOjI0cHg7aGVpZ2h0OjI0cHg7Ym9yZGVyLXJhZGl1czo2cHg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcn0KLnRhZyBidXR0b246aG92ZXJ7YmFja2dyb3VuZDpjb2xvci1taXgoaW4gc3JnYix2YXIoLS1sb2NrKSAxOCUsdHJhbnNwYXJlbnQpfQouc3RhY2t7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MTJweH0KLnJvd3tkaXNwbGF5OmZsZXg7Z2FwOjEwcHg7ZmxleC13cmFwOndyYXA7YWxpZ24taXRlbXM6ZW5kfQoucm93ID4gKntmbGV4OjE7bWluLXdpZHRoOjE1MHB4fQoKLyogbG9naW4gKi8KLmxvZ2lue21pbi1oZWlnaHQ6MTAwdmg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtwYWRkaW5nOjIwcHh9Ci5sb2dpbiAuY2FyZHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czoyNnB4O2JveC1zaGFkb3c6dmFyKC0tc2hhZG93KTt3aWR0aDoxMDAlO21heC13aWR0aDo0MjBweDtvdmVyZmxvdzpoaWRkZW59Ci5sb2dpbiAuYXJ0e2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDEzNWRlZyx2YXIoLS1iZzIpLHZhcigtLWljZSkpO3BhZGRpbmc6MjJweCAyNHB4IDhweH0KLmxvZ2luIC5hcnQgc3Zne3dpZHRoOjEwMCU7aGVpZ2h0OmF1dG99Ci5sb2dpbiBmb3Jte3BhZGRpbmc6MjJweCAyNHB4IDI2cHg7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MTJweH0KLmxvZ2luIGgxe2ZvbnQtc2l6ZTozMHB4O2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQouZXJye2NvbG9yOnZhcigtLWxvY2spO2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTMuNXB4O21pbi1oZWlnaHQ6MS4yZW19Ci5kZW1vLWhpbnR7Zm9udC1zaXplOjEyLjVweDtiYWNrZ3JvdW5kOnZhcigtLXdhcm4tYmcpO2NvbG9yOnZhcigtLXdhcm4pO3BhZGRpbmc6OHB4IDEycHg7Ym9yZGVyLXJhZGl1czoxMnB4fQoKLnRvYXN0e3Bvc2l0aW9uOmZpeGVkO2xlZnQ6NTAlO2JvdHRvbToyMnB4O3RyYW5zZm9ybTp0cmFuc2xhdGVYKC01MCUpO2JhY2tncm91bmQ6dmFyKC0taW5rKTtjb2xvcjp2YXIoLS1iZyk7cGFkZGluZzoxMHB4IDE4cHg7Ym9yZGVyLXJhZGl1czoxMnB4O2ZvbnQtd2VpZ2h0OjcwMDt6LWluZGV4OjYwO21heC13aWR0aDpjYWxjKDEwMCUgLSAzMnB4KX0KLm1vZGFse3Bvc2l0aW9uOmZpeGVkO2luc2V0OjA7ei1pbmRleDo1MDtiYWNrZ3JvdW5kOnJnYmEoNiwzMCw0OCwuNTUpO2Rpc3BsYXk6Z3JpZDtwbGFjZS1pdGVtczpjZW50ZXI7cGFkZGluZzoxNnB4fQouc2hlZXR7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXItcmFkaXVzOjIycHg7bWF4LXdpZHRoOjUyMHB4O3dpZHRoOjEwMCU7cGFkZGluZzoyMHB4O2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjEycHh9CgpAbWVkaWEgKG1heC13aWR0aDo5ODBweCl7CiAgLmhlcm8sLmdyaWQye2dyaWQtdGVtcGxhdGUtY29sdW1uczoxZnJ9CiAgLmhlcm8gc3Zne2Rpc3BsYXk6bm9uZX0KICAua3Bpc3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDIsMWZyKX0KICAuY29ubntncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyfQp9CkBtZWRpYSAobWF4LXdpZHRoOjUyMHB4KXsKICAud3JhcHtwYWRkaW5nLWlubGluZToxNnB4fQogIC5hZGRyb3d7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmcn0KICAucnVsZXtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyfQogIC51c2VyIHNtYWxse2Rpc3BsYXk6bm9uZX0KfQpAbWVkaWEgKHByZWZlcnMtcmVkdWNlZC1tb3Rpb246bm8tcHJlZmVyZW5jZSl7CiAgLnRydWNre2FuaW1hdGlvbjpkcml2ZSA2cyBlYXNlLWluLW91dCBpbmZpbml0ZX0KICBAa2V5ZnJhbWVzIGRyaXZlezAlLDEwMCV7dHJhbnNmb3JtOnRyYW5zbGF0ZVgoMCl9NTAle3RyYW5zZm9ybTp0cmFuc2xhdGVYKDE2cHgpfX0KfQouZ3JpZDIgPiAqe21pbi13aWR0aDowfQovKiBiYW5kZWphIG51ZXZhICovCi50YWJzYmlne2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDYsMWZyKTtnYXA6MTBweDttYXJnaW4tYm90dG9tOjE2cHh9Ci50YntkaXNwbGF5OmZsZXg7Z2FwOjEycHg7YWxpZ24taXRlbXM6Y2VudGVyO3RleHQtYWxpZ246bGVmdDtib3JkZXI6MnB4IHNvbGlkIHZhcigtLWxpbmUpO2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyLXJhZGl1czoxOHB4O3BhZGRpbmc6MTRweCAxNnB4O2NvbG9yOnZhcigtLWluayl9Ci50YiAudGItaWN7d2lkdGg6NDRweDtoZWlnaHQ6NDRweDtib3JkZXItcmFkaXVzOjEycHg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtmbGV4Om5vbmV9Ci50YiAudGItaWMgc3Zne3dpZHRoOjIycHg7aGVpZ2h0OjIycHh9Ci50YiBie2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtc2l6ZTozMHB4O2xpbmUtaGVpZ2h0OjE7ZGlzcGxheTpibG9jaztmb250LXZhcmlhbnQtbnVtZXJpYzp0YWJ1bGFyLW51bXN9Ci50YiAudGItbntmb250LXdlaWdodDo4MDA7ZGlzcGxheTpibG9ja30KLnRiIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTJweDtkaXNwbGF5OmJsb2NrO2xpbmUtaGVpZ2h0OjEuMn0KLnRiLXJlYWR5IC50Yi1pY3tiYWNrZ3JvdW5kOnZhcigtLWljZSk7Y29sb3I6dmFyKC0tYWNjZW50LXN0cm9uZyl9Ci50Yi13YWl0aW5nIC50Yi1pY3tiYWNrZ3JvdW5kOnZhcigtLXdhcm4tYmcpO2NvbG9yOnZhcigtLXdhcm4pfQoudGItcHJpbnRlZCAudGItaWN7YmFja2dyb3VuZDp2YXIoLS1vay1iZyk7Y29sb3I6dmFyKC0tb2spfQoudGItYmxvY2tlZCAudGItaWN7YmFja2dyb3VuZDp2YXIoLS1sb2NrLWJnKTtjb2xvcjp2YXIoLS1sb2NrKX0KLnRiW2FyaWEtcHJlc3NlZD0idHJ1ZSJde2JvcmRlci1jb2xvcjp2YXIoLS1hY2NlbnQpO2JveC1zaGFkb3c6MCAwIDAgM3B4IGNvbG9yLW1peChpbiBzcmdiLHZhcigtLWFjY2VudCkgMjIlLHRyYW5zcGFyZW50KX0KLnRiLXJlYWR5W2FyaWEtcHJlc3NlZD0idHJ1ZSJde2JhY2tncm91bmQ6Y29sb3ItbWl4KGluIHNyZ2IsdmFyKC0taWNlKSA0NSUsdmFyKC0tc3VyZmFjZSkpfQouY2hpcCAuY250e2Rpc3BsYXk6aW5saW5lLWJsb2NrO21pbi13aWR0aDoyMHB4O3BhZGRpbmc6MCA2cHg7Ym9yZGVyLXJhZGl1czo5OTlweDtiYWNrZ3JvdW5kOmNvbG9yLW1peChpbiBzcmdiLGN1cnJlbnRDb2xvciAxNSUsdHJhbnNwYXJlbnQpO2ZvbnQtc2l6ZToxMS41cHg7bWFyZ2luLWxlZnQ6NHB4fQouYWN0aW9uYmFye2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6MTBweDthbGlnbi1pdGVtczpjZW50ZXI7cGFkZGluZzoxMnB4IDIwcHg7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tbGluZSk7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlMil9Ci5kYXloZWFke3BhZGRpbmc6MTBweCAyMHB4O2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MTNweDt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7bGV0dGVyLXNwYWNpbmc6LjA2ZW07Y29sb3I6dmFyKC0tYWNjZW50LXN0cm9uZyk7YmFja2dyb3VuZDp2YXIoLS1iZyk7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tbGluZSl9Ci5vcm93e2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MzRweCAxMTBweCAxZnIgYXV0bztnYXA6MTRweDthbGlnbi1pdGVtczpjZW50ZXI7cGFkZGluZzoxMnB4IDIwcHg7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tbGluZSl9Ci5vcm93LnN0LXByaW50ZWR7b3BhY2l0eTouOH0KLm9yb3cuc3QtYmxvY2tlZHtiYWNrZ3JvdW5kOmNvbG9yLW1peChpbiBzcmdiLHZhcigtLWxvY2stYmcpIDQ1JSx0cmFuc3BhcmVudCl9Ci5vYy10aW1le2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjRweDthbGlnbi1pdGVtczpmbGV4LXN0YXJ0fQoub2MtdGltZSBie2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZToxOHB4fQoub2MtdG9we2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6OHB4O2FsaWduLWl0ZW1zOmJhc2VsaW5lO21hcmdpbi1ib3R0b206MnB4fQouY3VzdHtmb250LXdlaWdodDo4MDA7Zm9udC1zaXplOjE1LjVweH0KLmN1c3Q6OmFmdGVye2NvbnRlbnQ6IsK3IjttYXJnaW4tbGVmdDo4cHg7Y29sb3I6dmFyKC0tbXV0ZWQpfQoub2MtYWN0e2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47YWxpZ24taXRlbXM6ZmxleC1lbmQ7Z2FwOjhweH0KLm9yb3cuaXMtbmV3e2FuaW1hdGlvbjpmbGFzaCAyLjVzIGVhc2Utb3V0fQpAbWVkaWEgKG1heC13aWR0aDo4MjBweCl7CiAgLnRhYnNiaWd7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgyLDFmcil9CiAgLm9yb3d7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjI4cHggMWZyO30KICAub3JvdyAub2MtdGltZXtmbGV4LWRpcmVjdGlvbjpyb3c7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo4cHh9CiAgLm9yb3cgLm9jLW1haW4sLm9yb3cgLm9jLWFjdHtncmlkLWNvbHVtbjoyfQogIC5vYy1hY3R7YWxpZ24taXRlbXM6ZmxleC1zdGFydH0KfQoKLyogaW1wcmVzYXMgZW4gcm9qbyAoY29tbyBNZXJjYWRvIExpYnJlKSwgYmxvcXVlYWRhcyBlbiBncmlzICovCi50Yi1wcmludGVkIC50Yi1pY3tiYWNrZ3JvdW5kOnZhcigtLWxvY2stYmcpO2NvbG9yOnZhcigtLWxvY2spfQoudGItYmxvY2tlZCAudGItaWN7YmFja2dyb3VuZDojRTNFN0VDO2NvbG9yOiM0QTU1NjN9Ci5vcm93LnN0LXByaW50ZWR7b3BhY2l0eToxO2JhY2tncm91bmQ6I0ZGRjdGOH0KLm9yb3cuc3QtYmxvY2tlZHtiYWNrZ3JvdW5kOiNGM0Y1Rjd9Ci5vcm93LnN0LWJsb2NrZWQgLmxvY2tjZWxse2NvbG9yOiM0QTU1NjN9Ci5idG4tcmVwcmludHtiYWNrZ3JvdW5kOnZhcigtLWxvY2spO2NvbG9yOiNmZmZ9Ci5idG4tcmVwcmludDpob3ZlcntmaWx0ZXI6YnJpZ2h0bmVzcyguOTIpfQoKLnBpbGwuc2hpcHBlZHtiYWNrZ3JvdW5kOiNFM0U3RUM7Y29sb3I6IzM0NDE0Rn0KLm9yb3cuc3Qtc2hpcHBlZHtiYWNrZ3JvdW5kOiNGQUZCRkN9CgoudGItdG9kYXkgLnRiLWlje2JhY2tncm91bmQ6dmFyKC0taWNlKTtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KLnRiLXVwY29taW5nIC50Yi1pY3tiYWNrZ3JvdW5kOiNFREU5RkU7Y29sb3I6IzZEMjhEOX0KLnRiLXRvZGF5W2FyaWEtcHJlc3NlZD0idHJ1ZSJde2JhY2tncm91bmQ6Y29sb3ItbWl4KGluIHNyZ2IsdmFyKC0taWNlKSA0NSUsdmFyKC0tc3VyZmFjZSkpfQouc2hpcHR5cGV7Zm9udC1zaXplOjExcHg7Zm9udC13ZWlnaHQ6ODAwO3BhZGRpbmc6MnB4IDhweDtib3JkZXItcmFkaXVzOjZweDtiYWNrZ3JvdW5kOiNFRUYyRjY7Y29sb3I6IzM0NDE0Rn0KLnNoaXB0eXBlLnN0LWZsZXh7YmFja2dyb3VuZDojMTZBMzRBO2NvbG9yOiNmZmZ9Ci5zaGlwdHlwZS5zdC1jb2xlY3Rhe2JhY2tncm91bmQ6I0RCRUFGRTtjb2xvcjojMUU0MEFGfQouc2hpcHR5cGUuc3QtYWdlbmNpYXtiYWNrZ3JvdW5kOiNGRUYzQzc7Y29sb3I6IzkyNDAwRX0KLmRpc3BhdGNoe2Rpc3BsYXk6aW5saW5lLWJsb2NrO2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MTIuNXB4O2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpO2JhY2tncm91bmQ6dmFyKC0taWNlKTtib3JkZXItcmFkaXVzOjhweDtwYWRkaW5nOjJweCA4cHg7bWFyZ2luLWJvdHRvbTo0cHh9Ci5kaXNwYXRjaC5sYXRle2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayl9CkBtZWRpYSAobWF4LXdpZHRoOjExMDBweCl7LnRhYnNiaWd7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgzLDFmcil9fQpAbWVkaWEgKG1heC13aWR0aDo2NDBweCl7LnRhYnNiaWd7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgyLDFmcil9fQoKLmJsb2Nrbm97ZGlzcGxheTppbmxpbmUtYmxvY2s7YmFja2dyb3VuZDp2YXIoLS1pbmspO2NvbG9yOiNmZmY7Zm9udC13ZWlnaHQ6ODAwO2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2JvcmRlci1yYWRpdXM6OHB4O3BhZGRpbmc6MnB4IDlweDttYXJnaW4tcmlnaHQ6OHB4O2ZvbnQtc2l6ZToxNHB4fQouaXRlbXMgZW0uZmFsdGF7Zm9udC1zdHlsZTpub3JtYWw7YmFja2dyb3VuZDp2YXIoLS1sb2NrKTtjb2xvcjojZmZmO2JvcmRlci1yYWRpdXM6NXB4O3BhZGRpbmc6MCA1cHg7Zm9udC1zaXplOjExcHg7Zm9udC13ZWlnaHQ6ODAwO2xldHRlci1zcGFjaW5nOi4wNGVtfQoKLml0ZW1zIC5nb29ke2NvbG9yOnZhcigtLW9rKTtmb250LXdlaWdodDo3MDB9Ci5pdGVtcyBlbS50aWVuZXtmb250LXN0eWxlOm5vcm1hbDtiYWNrZ3JvdW5kOnZhcigtLW9rKTtjb2xvcjojZmZmO2JvcmRlci1yYWRpdXM6NXB4O3BhZGRpbmc6MCA1cHg7Zm9udC1zaXplOjExcHg7Zm9udC13ZWlnaHQ6ODAwO2xldHRlci1zcGFjaW5nOi4wNGVtfQoubm9wcmludHtkaXNwbGF5OmJsb2NrO21hcmdpbi10b3A6NnB4O2ZvbnQtd2VpZ2h0OjkwMDtjb2xvcjp2YXIoLS1pbmspO2ZvbnQtc2l6ZToxNXB4O2xldHRlci1zcGFjaW5nOi4wMmVtfQoKLyogVmVudGFzICovCi5zYWxlcy1rcGlze2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MS42ZnIgcmVwZWF0KDQsMWZyKTtnYXA6MTJweDttYXJnaW4tYm90dG9tOjE2cHh9Ci5rcGl7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTZweDtwYWRkaW5nOjE0cHggMTZweDtkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDo0cHg7Ym94LXNoYWRvdzp2YXIoLS1zaGFkb3cpfQoua3BpIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXdlaWdodDo3MDA7Zm9udC1zaXplOjEyLjVweDtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo2cHh9Ci5rcGkgYntmb250LWZhbWlseTp2YXIoLS1kaXNwbGF5KTtmb250LXNpemU6MjRweDtjb2xvcjp2YXIoLS1pbmspO2xpbmUtaGVpZ2h0OjEuMX0KLmtwaSBzcGFue2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTNweH0KLmtwaS1oZXJve2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDEzNWRlZywjRTNGNEZELCNmZmYpO2JvcmRlci1jb2xvcjp2YXIoLS1pY2UpfQoua3BpLWhlcm8gYntmb250LXNpemU6MzRweDtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KLmtwaS1oZXJvIHNwYW57Y29sb3I6dmFyKC0tb2spO2ZvbnQtd2VpZ2h0OjcwMH0KLmRvdHtkaXNwbGF5OmlubGluZS1ibG9jazt3aWR0aDoxMXB4O2hlaWdodDoxMXB4O2JvcmRlci1yYWRpdXM6M3B4O3ZlcnRpY2FsLWFsaWduOi0xcHg7bWFyZ2luLXJpZ2h0OjZweH0KLmxlZ2VuZHtkaXNwbGF5OmZsZXg7Z2FwOjE0cHg7ZmxleC13cmFwOndyYXA7Zm9udC1zaXplOjEzcHg7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOnZhcigtLWluayl9Ci5jaGFydHt3aWR0aDoxMDAlO2hlaWdodDphdXRvO2Rpc3BsYXk6YmxvY2t9Ci5jaGFydCAuY2gtYXh7Zm9udC1zaXplOjExcHg7ZmlsbDp2YXIoLS1tdXRlZCl9Ci5jaGFydCAuY2gtdmFse2ZvbnQtc2l6ZToxMnB4O2ZvbnQtd2VpZ2h0OjcwMDtmaWxsOnZhcigtLWluayl9Ci5jaGFydCAuY2gtZGF5e2ZvbnQtc2l6ZToxMnB4O2ZpbGw6dmFyKC0tbXV0ZWQpfQouY2hhcnQgLmNoLXRvZGF5e2ZpbGw6dmFyKC0tYWNjZW50LXN0cm9uZyk7Zm9udC13ZWlnaHQ6ODAwfQouY2hhcnQgLmNoLWhpdHtjdXJzb3I6cG9pbnRlcn0KLmNoYXJ0IC5jaC1oaXQ6aG92ZXJ7ZmlsbDpyZ2JhKDIyLDE0NywyMTEsLjA3KX0KLnNhbGVzLWdyaWR7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoMywxZnIpO2dhcDoxNHB4O21hcmdpbi10b3A6MTRweH0KLnNhbGVzLW1rIC5wYW5lbC1oZWFkIGgye2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXJ9Ci5jaC10aXB7cG9zaXRpb246Zml4ZWQ7ei1pbmRleDo1MDtiYWNrZ3JvdW5kOnZhcigtLWluayk7Y29sb3I6I2ZmZjtib3JkZXItcmFkaXVzOjEwcHg7cGFkZGluZzo4cHggMTFweDtmb250LXNpemU6MTIuNXB4O2xpbmUtaGVpZ2h0OjEuNTtwb2ludGVyLWV2ZW50czpub25lO2JveC1zaGFkb3c6dmFyKC0tc2hhZG93KTttYXgtd2lkdGg6MjgwcHh9Ci5jaC10aXAgYntkaXNwbGF5OmJsb2NrO21hcmdpbi1ib3R0b206MnB4O3RleHQtdHJhbnNmb3JtOmNhcGl0YWxpemV9Ci5jaC10YWJsZXttYXJnaW4tdG9wOjEwcHh9Ci5jaC10YWJsZSBzdW1tYXJ5e2N1cnNvcjpwb2ludGVyO2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpO2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTNweH0KQG1lZGlhIChtYXgtd2lkdGg6MTAwMHB4KXsuc2FsZXMta3Bpc3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDIsMWZyKX0ua3BpLWhlcm97Z3JpZC1jb2x1bW46MS8tMX0uc2FsZXMtZ3JpZHtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyfX0KLmNoYXJ0e3dpZHRoOjEwMCU7bWF4LXdpZHRoOjEwMCU7aGVpZ2h0OmF1dG99Ci5jaC1zbG90e3dpZHRoOjEwMCV9CgoucHAtd2Vla3tkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6OHB4O2ZvbnQtc2l6ZToxNHB4fQoucHAtdGFibGUgdGgubnVtLC5wcC10YWJsZSB0ZC5udW17dGV4dC1hbGlnbjpyaWdodDt3aGl0ZS1zcGFjZTpub3dyYXB9Ci5wcC10YWJsZSB0aCBzbWFsbHtkaXNwbGF5OmJsb2NrO2ZvbnQtd2VpZ2h0OjYwMDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5wcC10YWJsZSAucHAtbmFtZXtkaXNwbGF5OmJsb2NrO2ZvbnQtd2VpZ2h0OjcwMDtjb2xvcjp2YXIoLS1vayl9Ci5wcC10YWJsZSB0ZCBzbWFsbHtkaXNwbGF5OmJsb2NrfQoucHAtdGFibGUgLnplcm97Y29sb3I6dmFyKC0tbGluZSl9Ci5wcC10YWJsZSAucHAtdG90YWx7Zm9udC13ZWlnaHQ6ODAwO2ZvbnQtc2l6ZToxNXB4O2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQoucHAtdGFibGUgdGZvb3QgdGR7Ym9yZGVyLXRvcDoycHggc29saWQgdmFyKC0tbGluZSk7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlMil9Ci5wcC1ub3Rle2JhY2tncm91bmQ6dmFyKC0td2Fybi1iZyk7Y29sb3I6dmFyKC0td2Fybik7Ym9yZGVyLXJhZGl1czoxMHB4O3BhZGRpbmc6OHB4IDEycHg7Zm9udC1zaXplOjEzcHg7Zm9udC13ZWlnaHQ6NjAwO21hcmdpbjowIDAgMTBweH0KCi5wcC10YWJsZSAucHAtY2Fue2N1cnNvcjpwb2ludGVyfQoucHAtdGFibGUgLnBwLWNhbjpob3ZlciB0ZHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKX0KLnBwLXRhYmxlIC5wcC1hcnJvd3tkaXNwbGF5OmlubGluZS1ibG9jazt3aWR0aDoxNnB4O2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpO2ZvbnQtd2VpZ2h0OjkwMH0KLnBwLXRhYmxlIC5wcC1wdWIgLnBwLW5hbWV7ZGlzcGxheTppbmxpbmV9Ci5wcC10YWJsZSAucHAtc3Vie2Rpc3BsYXk6YmxvY2s7bWFyZ2luLWxlZnQ6MTZweH0KLnBwLXRhYmxlIC5wcC12YXIgdGR7YmFja2dyb3VuZDojRjdGQkZFO2ZvbnQtc2l6ZToxM3B4fQoucHAtdGFibGUgLnBwLXZuYW1le2Rpc3BsYXk6YmxvY2s7cGFkZGluZy1sZWZ0OjM0cHg7Y29sb3I6dmFyKC0tb2spO2ZvbnQtd2VpZ2h0OjYwMH0KLnBwLXRhYmxlIC5wcC12YXIgLnBwLXRvdGFse2ZvbnQtc2l6ZToxM3B4fQoudGItdW5ibG9ja2VkIC50Yi1pY3tiYWNrZ3JvdW5kOnZhcigtLXdhcm4tYmcpO2NvbG9yOnZhcigtLXdhcm4pfQpAbWVkaWEgKG1heC13aWR0aDoxMjgwcHgpey50YWJzYmlnIC50YiBzbWFsbHtkaXNwbGF5Om5vbmV9fQoKLyogUHJvZHVjdG9zIHZlbmRpZG9zIChzaW4gcHJlY2lvcykgKi8KLnV2LWtwaXN7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczoxLjNmciAxZnIgMWZyIDEuNmZyO2dhcDoxMnB4O21hcmdpbi1ib3R0b206MTJweH0KLnV2LW1re2Rpc3BsYXk6ZmxleDtnYXA6MThweDtmbGV4LXdyYXA6d3JhcDtmb250LXNpemU6MTRweDttYXJnaW46NHB4IDJweCAxNHB4O2NvbG9yOnZhcigtLWluayl9Ci51di1tayBzbWFsbHtjb2xvcjp2YXIoLS1tdXRlZCl9Ci51di1jYXJke21hcmdpbi1ib3R0b206MTRweH0KLnV2LWdyaWR7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczoxLjRmciAxZnI7Z2FwOjE0cHh9Ci51di1ncmlkID4gLnV2LWNhcmQ6b25seS1jaGlsZHtncmlkLWNvbHVtbjoxLy0xfQoudXYtaHtmb250LWZhbWlseTp2YXIoLS1kaXNwbGF5KTtmb250LXNpemU6MjBweDttYXJnaW46NnB4IDAgMTBweDtjb2xvcjp2YXIoLS1pbmspfQoudXYtaCBzbWFsbHtmb250LWZhbWlseTp2YXIoLS1ib2R5KTtmb250LXNpemU6MTNweDtjb2xvcjp2YXIoLS1tdXRlZCk7Zm9udC13ZWlnaHQ6NjAwO21hcmdpbi1sZWZ0OjhweH0KLmhie2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6bWlubWF4KDAsMS4zZnIpIG1pbm1heCgwLDFmcikgYXV0bztnYXA6MTJweDthbGlnbi1pdGVtczpjZW50ZXI7cGFkZGluZzo3cHggMDtib3JkZXItYm90dG9tOjFweCBkYXNoZWQgdmFyKC0tbGluZSl9Ci5oYjpsYXN0LWNoaWxke2JvcmRlci1ib3R0b206MH0KLmhiLWx7bWluLXdpZHRoOjB9Ci5oYi1uYW1le2Rpc3BsYXk6YmxvY2s7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOnZhcigtLWluayk7Zm9udC1zaXplOjEzLjVweDt3aGl0ZS1zcGFjZTpub3dyYXA7b3ZlcmZsb3c6aGlkZGVuO3RleHQtb3ZlcmZsb3c6ZWxsaXBzaXN9Ci5oYi1sIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTJweH0KLmhiLXRyYWNre2hlaWdodDoxMnB4O2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZTIpO2JvcmRlci1yYWRpdXM6NnB4O292ZXJmbG93OmhpZGRlbn0KLmhiLXRyYWNrIGl7ZGlzcGxheTpibG9jaztoZWlnaHQ6MTAwJTtib3JkZXItcmFkaXVzOjZweH0KLmhiLXZ7Zm9udC1zaXplOjE1cHg7Y29sb3I6dmFyKC0taW5rKTttaW4td2lkdGg6MzhweDt0ZXh0LWFsaWduOnJpZ2h0fQoucmt7Zm9udC1zdHlsZTpub3JtYWw7ZGlzcGxheTppbmxpbmUtZ3JpZDtwbGFjZS1pdGVtczpjZW50ZXI7d2lkdGg6MjBweDtoZWlnaHQ6MjBweDtib3JkZXItcmFkaXVzOjZweDtiYWNrZ3JvdW5kOnZhcigtLWljZSk7Y29sb3I6dmFyKC0tYWNjZW50LXN0cm9uZyk7Zm9udC1zaXplOjExLjVweDtmb250LXdlaWdodDo4MDA7bWFyZ2luLXJpZ2h0OjZweH0KQG1lZGlhIChtYXgtd2lkdGg6MTAwMHB4KXsudXYta3Bpc3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDIsMWZyKX0udXYtZ3JpZHtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyfX0KCi8qIFJlc3VtZW4gZGUgZW52w61vcyB5IDggc2VjY2lvbmVzICovCi50YWJzYmlne2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoNCwxZnIpfQoudGItd2VlayAudGItaWN7YmFja2dyb3VuZDp2YXIoLS1vay1iZyk7Y29sb3I6dmFyKC0tb2spfQoudGItYmxvY2tlZFByaW50ZWQgLnRiLWlje2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayl9Ci5zaGlwLXN1bXttYXJnaW4tYm90dG9tOjE0cHh9Ci5zcy10aWxlc3tkaXNwbGF5OmdyaWQ7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCg1LDFmcik7Z2FwOjEwcHg7bWFyZ2luLWJvdHRvbToxMnB4fQouc3MtdGlsZXtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1sZWZ0OjVweCBzb2xpZCB2YXIoLS1jKTtib3JkZXItcmFkaXVzOjEycHg7cGFkZGluZzoxMHB4IDEycHg7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKX0KLnNzLXRpbGUgc21hbGx7ZGlzcGxheTpibG9jaztjb2xvcjp2YXIoLS1tdXRlZCk7Zm9udC13ZWlnaHQ6NzAwO2ZvbnQtc2l6ZToxMi41cHh9Ci5zcy10aWxlIGJ7Zm9udC1mYW1pbHk6dmFyKC0tZGlzcGxheSk7Zm9udC1zaXplOjI4cHg7Y29sb3I6dmFyKC0taW5rKTtsaW5lLWhlaWdodDoxLjF9Ci5zcy10b3RhbHstLWM6dmFyKC0tYWNjZW50LXN0cm9uZyk7YmFja2dyb3VuZDpsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCNFM0Y0RkQsI2ZmZil9Ci5zcy10b3RhbCBie2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQouc3MtdGFibGUgdGQubnVtLC5zcy10YWJsZSB0aC5udW17dGV4dC1hbGlnbjpyaWdodH0KLnNzLXRhYmxlIC56ZXJve2NvbG9yOnZhcigtLWxpbmUpfQouc3MtdGFibGUgdGZvb3QgdGR7Ym9yZGVyLXRvcDoycHggc29saWQgdmFyKC0tbGluZSk7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlMil9CkBtZWRpYSAobWF4LXdpZHRoOjgwMHB4KXsuc3MtdGlsZXN7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgyLDFmcil9LnNzLXRvdGFse2dyaWQtY29sdW1uOjEvLTF9LnRhYnNiaWd7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgyLDFmcil9fQouZGlzcGF0Y2guZG9uZXtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKTtjb2xvcjp2YXIoLS1tdXRlZCk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKX0KLnNzLWN1dHtkaXNwbGF5OmJsb2NrO2ZvbnQtc2l6ZToxMi41cHg7Y29sb3I6dmFyKC0taW5rKTttYXJnaW4tdG9wOjJweH0KLnNzLWN1dCBzdHJvbmd7Y29sb3I6dmFyKC0tbG9jayl9Ci5zcy1jdXQgc21hbGx7Y29sb3I6dmFyKC0tbXV0ZWQpfQouc3MtY3V0Lm11dGVke2NvbG9yOnZhcigtLW11dGVkKX0KLnNzLWN1dCBzdHJvbmd7d2hpdGUtc3BhY2U6bm93cmFwfQoKLyogUmVzdW1lbiBkZSBlbnbDrW9zIGNvbXBhY3RvICovCi5zaGlwLXN1bXttYXJnaW46MCAwIDEycHg7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTJweDtwYWRkaW5nOjZweCAxMnB4fQouc3N4e2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7ZmxleC13cmFwOndyYXA7Z2FwOjZweCAxNnB4O2ZvbnQtc2l6ZToxM3B4O2NvbG9yOnZhcigtLWluayl9Ci5zc3gtdHtmb250LXdlaWdodDo4MDB9Ci5zc3gtaXtkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmJhc2VsaW5lO2dhcDo1cHg7d2hpdGUtc3BhY2U6bm93cmFwfQouc3N4LWkgaXt3aWR0aDo5cHg7aGVpZ2h0OjlweDtib3JkZXItcmFkaXVzOjNweDtiYWNrZ3JvdW5kOnZhcigtLWMpO2Rpc3BsYXk6aW5saW5lLWJsb2NrO2FsaWduLXNlbGY6Y2VudGVyfQouc3N4LWkgYntmb250LXNpemU6MTRweH0KLnNzeC1pIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTEuNXB4fQouc3N4LXRvdCBie2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQouc3N4LXN3e2Rpc3BsYXk6aW5saW5lLWZsZXg7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjhweDtvdmVyZmxvdzpoaWRkZW59Ci5zc3gtc3cgYnV0dG9ue2JvcmRlcjowO2JhY2tncm91bmQ6dHJhbnNwYXJlbnQ7cGFkZGluZzozcHggOXB4O2ZvbnQ6aW5oZXJpdDtmb250LXNpemU6MTJweDtmb250LXdlaWdodDo3MDA7Y29sb3I6dmFyKC0tbXV0ZWQpO2N1cnNvcjpwb2ludGVyfQouc3N4LXN3IGJ1dHRvblthcmlhLXByZXNzZWQ9InRydWUiXXtiYWNrZ3JvdW5kOnZhcigtLWFjY2VudCk7Y29sb3I6I2ZmZn0KLnNzeC1kZXQgc3VtbWFyeXtjdXJzb3I6cG9pbnRlcjtmb250LXNpemU6MTJweDtmb250LXdlaWdodDo3MDA7Y29sb3I6dmFyKC0tYWNjZW50LXN0cm9uZyk7bWFyZ2luLXRvcDoycHh9Ci5zc3gtZGV0IC5zcy10YWJsZXtmb250LXNpemU6MTIuNXB4O21hcmdpbi10b3A6NnB4fQouc3N4LWRldCAuc3MtdGFibGUgdGQsLnNzeC1kZXQgLnNzLXRhYmxlIHRoe3BhZGRpbmc6NHB4IDhweH0KLnNzeC1tb3Jle2JvcmRlcjowO2JhY2tncm91bmQ6bm9uZTtmb250OmluaGVyaXQ7Zm9udC1zaXplOjEycHg7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpO2N1cnNvcjpwb2ludGVyO3BhZGRpbmc6MnB4IDRweH0KLnNzeHtnYXA6NHB4IDE0cHh9Ci5zc3gtcnttYXJnaW4tbGVmdDphdXRvO2Rpc3BsYXk6aW5saW5lLWZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo4cHg7d2hpdGUtc3BhY2U6bm93cmFwfQouc3N4e2ZvbnQtc2l6ZToxMi41cHg7Z2FwOjRweCAxMnB4fQouc3N4LWFsbHtwYWRkaW5nLWxlZnQ6MTBweDtib3JkZXItbGVmdDoxcHggc29saWQgdmFyKC0tbGluZSk7Y29sb3I6dmFyKC0tbXV0ZWQpfQouc3N4LWFsbCBie2NvbG9yOnZhcigtLWluayl9Ci5zcy1zdW0gdGR7Ym9yZGVyLXRvcDoycHggc29saWQgdmFyKC0tbGluZSl9Ci8qIGZpbHRybyBkZSB2ZW5kZWRvcmVzIGNvbiBzZWxlY2Npw7NuIG3Dumx0aXBsZSAqLwoubXNlbHtwb3NpdGlvbjpyZWxhdGl2ZX0KLm1zZWwtYnRue2ZvbnQ6aW5oZXJpdDtjb2xvcjp2YXIoLS1pbmspO2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZTIpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czoxMnB4O3BhZGRpbmc6OHB4IDM0cHggOHB4IDEycHg7Y3Vyc29yOnBvaW50ZXI7d2hpdGUtc3BhY2U6bm93cmFwO3Bvc2l0aW9uOnJlbGF0aXZlO21pbi13aWR0aDoyMDBweDt0ZXh0LWFsaWduOmxlZnR9Ci5tc2VsLWJ0bjo6YWZ0ZXJ7Y29udGVudDonJztwb3NpdGlvbjphYnNvbHV0ZTtyaWdodDoxM3B4O3RvcDo1MCU7d2lkdGg6N3B4O2hlaWdodDo3cHg7Ym9yZGVyLXJpZ2h0OjJweCBzb2xpZCBjdXJyZW50Q29sb3I7Ym9yZGVyLWJvdHRvbToycHggc29saWQgY3VycmVudENvbG9yO3RyYW5zZm9ybTp0cmFuc2xhdGVZKC03MCUpIHJvdGF0ZSg0NWRlZyl9Ci5tc2VsLm9uIC5tc2VsLWJ0bntib3JkZXItY29sb3I6dmFyKC0tYWNjZW50KTtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKTtmb250LXdlaWdodDo3MDB9Ci5tc2VsLXBvcHtwb3NpdGlvbjphYnNvbHV0ZTt6LWluZGV4OjMwO3RvcDpjYWxjKDEwMCUgKyA2cHgpO2xlZnQ6MDttaW4td2lkdGg6MjQwcHg7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTJweDtib3gtc2hhZG93OjAgMTBweCAzMHB4IHJnYmEoMCwwLDAsLjE0KTtwYWRkaW5nOjZweH0KLm1zZWwtcG9wIGxhYmVse2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjEwcHg7cGFkZGluZzo4cHggMTBweDtib3JkZXItcmFkaXVzOjhweDtjdXJzb3I6cG9pbnRlcjt3aGl0ZS1zcGFjZTpub3dyYXB9Ci5tc2VsLXBvcCBsYWJlbDpob3ZlcntiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKX0KLm1zZWwtcG9wIGlucHV0e3dpZHRoOjE4cHg7aGVpZ2h0OjE4cHg7YWNjZW50LWNvbG9yOnZhcigtLWFjY2VudCk7bWFyZ2luOjB9Ci5tc2VsLWFsbHtib3JkZXItYm90dG9tOjFweCBzb2xpZCB2YXIoLS1saW5lKTttYXJnaW4tYm90dG9tOjRweDtmb250LXdlaWdodDo3MDB9Ci8qIGZpbHRybyBkZSBCbG9xdWVhZGFzIGltcHJlc2FzICovCi5icGZ7ZGlzcGxheTpmbGV4O2ZsZXgtd3JhcDp3cmFwO2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6OHB4O3BhZGRpbmc6MTBweCAxOHB4O2JvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLWxpbmUpfQouYnBmW2hpZGRlbl17ZGlzcGxheTpub25lfQouYnBmLXR7Zm9udC13ZWlnaHQ6NzAwO2ZvbnQtc2l6ZToxM3B4O2NvbG9yOnZhcigtLW11dGVkKX0KLmNoaXAtZmlsbFthcmlhLXByZXNzZWQ9InRydWUiXXtiYWNrZ3JvdW5kOiMxZjhmNGU7Ym9yZGVyLWNvbG9yOiMxZjhmNGU7Y29sb3I6I2ZmZn0KLndhcm5ib3h7YmFja2dyb3VuZDojZmZmNmUwO2JvcmRlcjoxcHggc29saWQgI2YwZDQ4YTtib3JkZXItcmFkaXVzOjEwcHg7cGFkZGluZzo4cHggMTBweDtjb2xvcjojNmI0ZTAwfQouYnBmLXNlcHt3aWR0aDoxcHg7aGVpZ2h0OjIycHg7YmFja2dyb3VuZDp2YXIoLS1saW5lKTttYXJnaW46MCA2cHh9CgoubGF0ZXRhZ3tkaXNwbGF5OmlubGluZS1ibG9jaztiYWNrZ3JvdW5kOiNmZGUyZTI7Y29sb3I6I2I0MjMxODtmb250LXdlaWdodDo3MDA7Zm9udC1zaXplOjEycHg7Ym9yZGVyLXJhZGl1czo2cHg7cGFkZGluZzoycHggOHB4O21hcmdpbjoycHggMH0KLnRiLWxhdGUgLnRiLWlje2JhY2tncm91bmQ6I2ZkZTJlMjtjb2xvcjojYjQyMzE4fQoKLyogY8OzZGlnb3MgZGUgZGV2b2x1Y2nDs24gTUwgKi8KLnJjb2Rlc3twb3NpdGlvbjpyZWxhdGl2ZTttYXJnaW4tbGVmdDphdXRvO2ZvbnQtc2l6ZToxM3B4fQoucmMtcGlsbHtkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4O2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXItcmFkaXVzOjk5OXB4O3BhZGRpbmc6M3B4IDEwcHg7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtc2l6ZToxMi41cHh9Ci5yYy1waWxsIHN2Z3t3aWR0aDoxNHB4O2hlaWdodDoxNHB4O2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQoucmMtcGlsbCBie2NvbG9yOnZhcigtLWluayl9Ci5yYy1waWxsOmhvdmVye2JvcmRlci1jb2xvcjp2YXIoLS1za3kpfQoucmMtcG9we3Bvc2l0aW9uOmFic29sdXRlO3JpZ2h0OjA7dG9wOmNhbGMoMTAwJSArIDZweCk7ei1pbmRleDozMDttaW4td2lkdGg6MjgwcHg7bWF4LXdpZHRoOm1pbigzNjBweCxjYWxjKDEwMHZ3IC0gMzJweCkpO2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjEycHg7Ym94LXNoYWRvdzp2YXIoLS1zaGFkb3cpO3BhZGRpbmc6OHB4IDEwcHg7ZGlzcGxheTpncmlkO2dhcDoycHh9Ci5yYy1wb3AtaHtmb250LXNpemU6MTEuNXB4O2NvbG9yOnZhcigtLW11dGVkKTtwYWRkaW5nOjJweCAycHggNnB4O2JvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLWxpbmUpO21hcmdpbi1ib3R0b206NHB4fQoucmMtcm93e2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjhweDtwYWRkaW5nOjNweCAycHh9Ci5yYy1yb3cgLnJjLW57ZmxleDoxO2ZvbnQtc2l6ZToxMi41cHh9Ci5yYy1ue2NvbG9yOnZhcigtLW11dGVkKTtmb250LXdlaWdodDo2MDB9Ci5yYy1jb2Rle2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZToxMi41cHg7bGV0dGVyLXNwYWNpbmc6LjA1ZW07Y29sb3I6dmFyKC0taW5rKTtiYWNrZ3JvdW5kOiNGRkY3QjM7Ym9yZGVyLXJhZGl1czo1cHg7cGFkZGluZzowIDVweH0KLnJjLW1pc3N7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtc3R5bGU6aXRhbGljO2ZvbnQtc2l6ZToxMnB4fQoucmMtZW1wdHl7Ym9yZGVyLXN0eWxlOmRhc2hlZH0KLnJjLWVkaXR7Ym9yZGVyOjA7YmFja2dyb3VuZDpub25lO2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpO2ZvbnQtc2l6ZToxMnB4O2ZvbnQtd2VpZ2h0OjcwMDtwYWRkaW5nOjJweCA2cHg7Ym9yZGVyLXJhZGl1czo5OTlweH0KLnJjLWVkaXQ6aG92ZXJ7YmFja2dyb3VuZDp2YXIoLS1pY2UpfQoucmMtZm9ybXtkaXNwbGF5OmlubGluZS1mbGV4O2dhcDo0cHg7YWxpZ24taXRlbXM6Y2VudGVyfQoucmMtZm9ybSBpbnB1dHt3aWR0aDoxMTBweDtwYWRkaW5nOjNweCA4cHg7Zm9udC1mYW1pbHk6dmFyKC0tbW9ubyk7Zm9udC1zaXplOjEzcHh9Ci5yYy1wYWdle21hcmdpbi10b3A6MjZweH0KLnJjLWhlcm97dGV4dC1hbGlnbjpjZW50ZXI7bWFyZ2luLWJvdHRvbToyMnB4fQoucmMtaGVybyBoMntmb250LXNpemU6MzBweDtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KLnJjLWhlcm8gcHttYXJnaW46NnB4IDAgMnB4O2ZvbnQtc2l6ZToxNnB4O3RleHQtdHJhbnNmb3JtOm5vbmV9Ci5yYy1oZXJvIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKX0KLnJjLWdyaWR7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoYXV0by1maWxsLG1pbm1heCgyMzBweCwxZnIpKTtnYXA6MTZweH0KLnJjLWNhcmR7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjZweDt0ZXh0LWFsaWduOmNlbnRlcjtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czoxOHB4O3BhZGRpbmc6MjJweCAxNnB4O2JveC1zaGFkb3c6dmFyKC0tc2hhZG93KTtwb3NpdGlvbjpyZWxhdGl2ZTtvdmVyZmxvdzpoaWRkZW59Ci5yYy1jYXJkOjpiZWZvcmV7Y29udGVudDoiIjtwb3NpdGlvbjphYnNvbHV0ZTtpbnNldDowIDAgYXV0byAwO2hlaWdodDo1cHg7YmFja2dyb3VuZDp2YXIoLS1tbCl9Ci5yYy1jYXJkLnJjLWVtcHR5e2JveC1zaGFkb3c6bm9uZTtib3JkZXItc3R5bGU6ZGFzaGVkfQoucmMtc2VsbGVye2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MTlweH0KLnJjLWFjY3tjb2xvcjp2YXIoLS1tdXRlZCk7bWFyZ2luLXRvcDotNnB4fQoucmMtYmlne2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZTozNHB4O2xldHRlci1zcGFjaW5nOi4xMmVtO2JhY2tncm91bmQ6I0ZGRjdCMztjb2xvcjp2YXIoLS1tbC1pbmspO2JvcmRlci1yYWRpdXM6MTJweDtwYWRkaW5nOjZweCAxNnB4O21hcmdpbjo2cHggMH0KLnJjLXdhaXR7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtc3R5bGU6aXRhbGljO21hcmdpbjoxNHB4IDB9CkBtZWRpYSAobWF4LXdpZHRoOjYwMHB4KXsucmMtaGVybyBoMntmb250LXNpemU6MjRweH0ucmMtYmlne2ZvbnQtc2l6ZToyOHB4fX0KCi5yYy1ob3didG57anVzdGlmeS1zZWxmOnN0YXJ0O2ZvbnQtd2VpZ2h0OjYwMDtjb2xvcjp2YXIoLS1tdXRlZCk7bWFyZ2luLXRvcDo0cHh9Ci5yYy1ob3dib3h7ZmxleC1iYXNpczoxMDAlfQoucmMtaGVscHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTJweDtwYWRkaW5nOjEwcHggMTRweDtmb250LXNpemU6MTMuNXB4fQoucmMtaGVscCBvbHttYXJnaW46NnB4IDAgMDtwYWRkaW5nLWxlZnQ6MjBweDtkaXNwbGF5OmdyaWQ7Z2FwOjRweH0KLnJjLWJte2Rpc3BsYXk6aW5saW5lLWJsb2NrO2JhY2tncm91bmQ6dmFyKC0tbWwpO2NvbG9yOnZhcigtLW1sLWluayk7Zm9udC13ZWlnaHQ6ODAwO3RleHQtZGVjb3JhdGlvbjpub25lO2JvcmRlci1yYWRpdXM6OHB4O3BhZGRpbmc6MnB4IDEwcHg7Y3Vyc29yOmdyYWJ9Ci5yYy1tb2RhbHtwb3NpdGlvbjpmaXhlZDtpbnNldDowO2JhY2tncm91bmQ6cmdiYSgxMiw0Myw2NCwuMzUpO2Rpc3BsYXk6Z3JpZDtwbGFjZS1pdGVtczpjZW50ZXI7ei1pbmRleDo1MDtwYWRkaW5nOjE2cHh9Ci5yYy1tb2RhbC1ib3h7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXItcmFkaXVzOjE4cHg7cGFkZGluZzoyMHB4O21heC13aWR0aDo0MjBweDt3aWR0aDoxMDAlO2Rpc3BsYXk6Z3JpZDtnYXA6MTRweDtib3gtc2hhZG93OnZhcigtLXNoYWRvdyl9Ci5yYy1waWNre2Rpc3BsYXk6Z3JpZDtnYXA6OHB4fQoucmMtcGljayBsYWJlbHtkaXNwbGF5OmZsZXg7Z2FwOjhweDthbGlnbi1pdGVtczpjZW50ZXI7cGFkZGluZzo4cHggMTBweDtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTBweDtjdXJzb3I6cG9pbnRlcn0KLnJjLXBpY2sgc21hbGx7Y29sb3I6dmFyKC0tbXV0ZWQpfQoKLnVuZG8tYnRue2Rpc3BsYXk6aW5saW5lLWZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo4cHg7YmFja2dyb3VuZDp2YXIoLS1pbmspO2NvbG9yOiNmZmY7Ym9yZGVyOjA7Ym9yZGVyLXJhZGl1czoxMnB4O3BhZGRpbmc6NnB4IDEycHggNnB4IDEwcHg7Zm9udC1zaXplOjEzcHg7bGluZS1oZWlnaHQ6MS4xNTt0ZXh0LWFsaWduOmxlZnQ7bWF4LXdpZHRoOjIzMHB4fQoudW5kby1idG4gc3BhbntkaXNwbGF5OmdyaWQ7bWluLXdpZHRoOjB9Ci51bmRvLWJ0biBzbWFsbHtmb250LXdlaWdodDo1MDA7b3BhY2l0eTouODt3aGl0ZS1zcGFjZTpub3dyYXA7b3ZlcmZsb3c6aGlkZGVuO3RleHQtb3ZlcmZsb3c6ZWxsaXBzaXM7Zm9udC1zaXplOjExLjVweH0KLnVuZG8tYnRuOmhvdmVyOm5vdCg6ZGlzYWJsZWQpe2JhY2tncm91bmQ6dmFyKC0tYWNjZW50LXN0cm9uZyl9Ci51bmRvLWJ0bjpkaXNhYmxlZHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKTtjb2xvcjp2YXIoLS1tdXRlZCk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtjdXJzb3I6ZGVmYXVsdH0KLnRiLXByaW50ZWQ3IC50Yi1pY3tiYWNrZ3JvdW5kOnZhcigtLW9rLWJnKTtjb2xvcjp2YXIoLS1vayl9CgoudGItdHJhbnNpdCAudGItaWN7YmFja2dyb3VuZDp2YXIoLS1pY2UpO2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQoKLnNzLXRvZGF5IHRke2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZTIpfQoKLnNzLTIgdGguc3MtZ3Jwe3RleHQtYWxpZ246Y2VudGVyO2JvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLWxpbmUpfQouc3MtMiAuc3MtYmx7Y29sb3I6dmFyKC0tbG9jayl9Ci5zcy0yIHRoLnNzLWJse2NvbG9yOnZhcigtLWxvY2spfQouc3MtZGF5cm93IHRke2JvcmRlci10b3A6MXB4IHNvbGlkIHZhcigtLWxpbmUpfQouc3Mtc2Vscm93IHRke2ZvbnQtc2l6ZToxMnB4O2NvbG9yOnZhcigtLW11dGVkKX0KLnNzLXNlbHJvdyAuc3Mtc3Vie3BhZGRpbmctbGVmdDoxNHB4fQouc3Mtbm90ZXtmb250LXNpemU6MTEuNXB4O3BhZGRpbmc6NnB4IDJweCAwfQoKLnBwLW1vcmV7ZGlzcGxheTpmbGV4O2p1c3RpZnktY29udGVudDpjZW50ZXI7bWFyZ2luLXRvcDoxMHB4fQoKLyogTUtQIEZsYXNoIOKAlCBjb2xvcmVzIGRlIE1lcmNhZG8gTGlicmUgKi8KLm1rcC1oZXJve2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjEycHg7ZmxleC13cmFwOndyYXA7bWFyZ2luLXRvcDoyMnB4O2JhY2tncm91bmQ6I0ZGRTYwMDtjb2xvcjojMkQzMjc3O2JvcmRlci1yYWRpdXM6MThweDtwYWRkaW5nOjE2cHggMjBweH0KLm1rcC1oZXJvIGgye2ZvbnQtc2l6ZToyNnB4O2NvbG9yOiMyRDMyNzd9Ci5ta3AtaGVybyBwe21hcmdpbjoycHggMCAwO2ZvbnQtc2l6ZToxNHB4fQoubWtwLWhlcm8gc2VsZWN0e2JhY2tncm91bmQ6I2ZmZjtib3JkZXItY29sb3I6I2UwY2MwMH0KLm1rcC1yZWZyZXNoe2JhY2tncm91bmQ6IzJEMzI3Nztjb2xvcjojZmZmO2JvcmRlcjowfQoubWtwLXRpbGVze2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDUsbWlubWF4KDAsMWZyKSk7Z2FwOjEwcHg7bWFyZ2luOjE0cHggMH0KLm1rcC10aWxle2Rpc3BsYXk6Z3JpZDtqdXN0aWZ5LWl0ZW1zOnN0YXJ0O2dhcDowO3RleHQtYWxpZ246bGVmdDtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czoxNHB4O3BhZGRpbmc6MTJweCAxNHB4O2N1cnNvcjpwb2ludGVyfQoubWtwLXRpbGUgYntmb250LWZhbWlseTp2YXIoLS1kaXNwbGF5KTtmb250LXNpemU6MzBweDtsaW5lLWhlaWdodDoxO2NvbG9yOiMyRDMyNzd9Ci5ta3AtdGlsZSBzcGFue2ZvbnQtd2VpZ2h0OjcwMH0KLm1rcC10aWxlIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTJweH0KLm1rcC10aWxlLm9ue2JvcmRlcjoycHggc29saWQgIzM0ODNGQTtiYWNrZ3JvdW5kOiNGMEY2RkZ9Ci5ta3AtbWtkb3RzIGl7ZGlzcGxheTppbmxpbmUtYmxvY2s7d2lkdGg6OXB4O2hlaWdodDo5cHg7Ym9yZGVyLXJhZGl1czo1MCU7bWFyZ2luOjAgMnB4IDAgNnB4O3ZlcnRpY2FsLWFsaWduOi0xcHh9Ci5ta3AtbWtkb3RzIGkubWx7YmFja2dyb3VuZDojRkZFNjAwO2JvcmRlcjoxcHggc29saWQgI0M5QjQwMH0ubWtwLW1rZG90cyBpLmZhe2JhY2tncm91bmQ6I0FBRDUwMH0ubWtwLW1rZG90cyBpLnBhe2JhY2tncm91bmQ6IzAwNzhDOH0KLm1rcC1ib2R5e2Rpc3BsYXk6Z3JpZDtnYXA6MTBweH0KLm1rcC1jYXJke2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItbGVmdDo1cHggc29saWQgIzM0ODNGQTtib3JkZXItcmFkaXVzOjE0cHg7cGFkZGluZzoxMnB4IDE0cHg7ZGlzcGxheTpncmlkO2dhcDo4cHh9Ci5ta3AtY2FyZC5ta3AtbWVke2JvcmRlci1sZWZ0LWNvbG9yOiNFODY2MUF9Ci5ta3AtY2FyZC5ta3AtZG9uZXtvcGFjaXR5Oi41fQoubWtwLWNhcmQtaHtkaXNwbGF5OmZsZXg7Z2FwOjEwcHg7YWxpZ24taXRlbXM6ZmxleC1zdGFydH0KLm1rcC1jYXJkLWggaW1ne3dpZHRoOjQ4cHg7aGVpZ2h0OjQ4cHg7b2JqZWN0LWZpdDpjb3Zlcjtib3JkZXItcmFkaXVzOjhweDtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpfQoubWtwLWNhcmQtaCBkaXZ7ZGlzcGxheTpncmlkO2dhcDoxcHg7bWluLXdpZHRoOjB9Ci5ta3AtY2FyZC1oIGF7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOiMyRDMyNzc7dGV4dC1kZWNvcmF0aW9uOm5vbmV9Ci5ta3AtY2FyZC1oIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTJweH0KLm1rcC1hY2N7ZGlzcGxheTppbmxpbmUtYmxvY2s7YmFja2dyb3VuZDojRkZFNjAwO2NvbG9yOiMyRDMyNzc7Zm9udC13ZWlnaHQ6NzAwO2JvcmRlci1yYWRpdXM6NnB4O3BhZGRpbmc6MCA2cHg7bWFyZ2luLXJpZ2h0OjZweH0KLm1rcC1kdWV7Y29sb3I6I0I0MjMxOCFpbXBvcnRhbnQ7Zm9udC13ZWlnaHQ6NzAwfQoubWtwLXF7bWFyZ2luOjA7Zm9udC1zaXplOjE1LjVweDtiYWNrZ3JvdW5kOiNGNUY1RjU7Ym9yZGVyLXJhZGl1czoxMHB4O3BhZGRpbmc6OHB4IDEycHh9Ci5ta3AtdGhyZWFke2Rpc3BsYXk6Z3JpZDtnYXA6NnB4O21heC1oZWlnaHQ6MjYwcHg7b3ZlcmZsb3c6YXV0bztwYWRkaW5nOjJweH0KLm1rcC1idWJ7bWF4LXdpZHRoOjgwJTtib3JkZXItcmFkaXVzOjEycHg7cGFkZGluZzo2cHggMTBweDtkaXNwbGF5OmdyaWQ7YmFja2dyb3VuZDojRjBGMEYwO2p1c3RpZnktc2VsZjpzdGFydH0KLm1rcC1idWIuc2VsbGVye2JhY2tncm91bmQ6I0UzRUVGRjtqdXN0aWZ5LXNlbGY6ZW5kfQoubWtwLWJ1Yi5tZWRpYXRvcntiYWNrZ3JvdW5kOiNGRkY0RDZ9Ci5ta3AtYnViIHNtYWxse2ZvbnQtc2l6ZToxMXB4O2NvbG9yOnZhcigtLW11dGVkKX0KLm1rcC1yZXBseXtkaXNwbGF5OmdyaWQ7Z2FwOjZweH0KLm1rcC1yZXBseSB0ZXh0YXJlYXt3aWR0aDoxMDAlO3Jlc2l6ZTp2ZXJ0aWNhbDtib3JkZXItcmFkaXVzOjEwcHh9Ci5ta3AtcmVwbHktYmFye2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7anVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW59Ci5ta3AtcmVwbHktYmFyIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTEuNXB4fQoubWtwLXNlbmR7YmFja2dyb3VuZDojMzQ4M0ZBO2NvbG9yOiNmZmY7Ym9yZGVyOjB9Ci5ta3Atc2VuZDpob3ZlcntiYWNrZ3JvdW5kOiMyOTY4Qzh9Ci5ta3AtZW1wdHl7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IGRhc2hlZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjE0cHg7cGFkZGluZzoyMnB4O3RleHQtYWxpZ246Y2VudGVyO2NvbG9yOnZhcigtLW11dGVkKX0KLm1rcC1lbXB0eS5zbXtwYWRkaW5nOjEwcHg7Zm9udC1zaXplOjEzcHh9Ci5ta3AtcGVybXtiYWNrZ3JvdW5kOiNGRkY4RDY7Ym9yZGVyOjFweCBzb2xpZCAjRThEMjAwO2NvbG9yOiMyRDMyNzc7Ym9yZGVyLXJhZGl1czoxMnB4O3BhZGRpbmc6MTJweCAxNHB4O2ZvbnQtc2l6ZToxNHB4fQoubWtwLXJldHN7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoMyxtaW5tYXgoMCwxZnIpKTtnYXA6MTJweH0KLm1rcC1yZXR7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTRweDtvdmVyZmxvdzpoaWRkZW59Ci5ta3AtcmV0IGgze2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpiYXNlbGluZTtnYXA6NnB4O3BhZGRpbmc6MTBweCAxNHB4O21hcmdpbjowO2ZvbnQtc2l6ZToxNnB4fQoubWtwLXJldCBoMyBpe2Rpc3BsYXk6aW5saW5lLWJsb2NrO3dpZHRoOjEycHg7aGVpZ2h0OjEycHg7Ym9yZGVyLXJhZGl1czo1MCV9Ci5ta3AtcmV0IGgzIGJ7Zm9udC1zaXplOjIycHh9Ci5ta3AtcmV0LW1sIGgze2JhY2tncm91bmQ6I0ZGRTYwMDtjb2xvcjojMkQzMjc3fS5ta3AtcmV0LW1sIGgzIGl7YmFja2dyb3VuZDojMkQzMjc3fQoubWtwLXJldC1mYSBoM3tiYWNrZ3JvdW5kOiNBQUQ1MDA7Y29sb3I6IzJGM0EwMH0ubWtwLXJldC1mYSBoMyBpe2JhY2tncm91bmQ6IzJGM0EwMH0KLm1rcC1yZXQtcGEgaDN7YmFja2dyb3VuZDojMDA3OEM4O2NvbG9yOiNmZmZ9Lm1rcC1yZXQtcGEgaDMgaXtiYWNrZ3JvdW5kOiNmZmZ9Ci5ta3AtcmV0ID4gZGl2LC5ta3AtcmV0IC5ta3AtcGVybXttYXJnaW46MTBweH0KLm1rcC1ycm93e2Rpc3BsYXk6ZmxleDtqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbjtnYXA6MTBweDtwYWRkaW5nOjhweCAxNHB4O2JvcmRlci10b3A6MXB4IHNvbGlkIHZhcigtLWxpbmUpO21hcmdpbjowIWltcG9ydGFudH0KLm1rcC1ycm93IGRpdntkaXNwbGF5OmdyaWQ7Z2FwOjFweH0KLm1rcC1ycm93IHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTJweH0KLm1rcC1wcmljZXtmb250LWZhbWlseTp2YXIoLS1kaXNwbGF5KTtmb250LXNpemU6MTdweDt3aGl0ZS1zcGFjZTpub3dyYXB9Ci5ta3AtdG9kYXl7ZGlzcGxheTppbmxpbmUtYmxvY2s7bWFyZ2luLWxlZnQ6NnB4O2JhY2tncm91bmQ6IzM0ODNGQTtjb2xvcjojZmZmO2JvcmRlci1yYWRpdXM6NnB4O3BhZGRpbmc6MCA2cHg7Zm9udC1zaXplOjExLjVweDtmb250LXdlaWdodDo3MDB9CkBtZWRpYSAobWF4LXdpZHRoOjkwMHB4KXsubWtwLXRpbGVze2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoMixtaW5tYXgoMCwxZnIpKX0ubWtwLXJldHN7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmcn19CgoubWtwLXNlbnR7Y29sb3I6IzAwQTY1MDtmb250LXdlaWdodDo3MDA7Zm9udC1zaXplOjE0cHh9CgovKiAtLS0tLS0tLS0tIFNvbCAicHJvY2VzYW5kbyIgYWwgaW1wcmltaXIgLS0tLS0tLS0tLSAqLwojc3VuTG9hZGVye3Bvc2l0aW9uOmZpeGVkO2luc2V0OjA7ei1pbmRleDo5OTk5O2Rpc3BsYXk6Z3JpZDtwbGFjZS1pdGVtczpjZW50ZXI7cGFkZGluZzoxNnB4O2JhY2tncm91bmQ6cmFkaWFsLWdyYWRpZW50KGNpcmNsZSBhdCA1MCUgNDIlLHJnYmEoMjU1LDIzNiwxNzAsLjU1KSxyZ2JhKDI1NSwyNDgsMjMwLC44MikgNDUlLHJnYmEoMjAsMzAsNTAsLjM1KSk7YmFja2Ryb3AtZmlsdGVyOmJsdXIoNXB4KTstd2Via2l0LWJhY2tkcm9wLWZpbHRlcjpibHVyKDVweCk7b3BhY2l0eTowO3RyYW5zaXRpb246b3BhY2l0eSAuM3MgZWFzZTtjdXJzb3I6cHJvZ3Jlc3N9CiNzdW5Mb2FkZXIub257b3BhY2l0eToxfQouc3VuLWNhcmR7dGV4dC1hbGlnbjpjZW50ZXI7bWF4LXdpZHRoOjQ2MHB4O3BhZGRpbmc6MjhweCAyOHB4IDI2cHg7Ym9yZGVyLXJhZGl1czoyOHB4O2JhY2tncm91bmQ6cmdiYSgyNTUsMjU1LDI1NSwuODgpO2JveC1zaGFkb3c6MCAyMHB4IDYwcHggcmdiYSgyNTUsMTU5LDI4LC4yOCksMCAycHggOHB4IHJnYmEoMCwwLDAsLjA2KTt0cmFuc2Zvcm06dHJhbnNsYXRlWSgxNHB4KSBzY2FsZSguOTYpO3RyYW5zaXRpb246dHJhbnNmb3JtIC40NXMgY3ViaWMtYmV6aWVyKC4yLDEuNCwuNCwxKX0KI3N1bkxvYWRlci5vbiAuc3VuLWNhcmR7dHJhbnNmb3JtOm5vbmV9Ci5zdW57d2lkdGg6MTUwcHg7aGVpZ2h0OjE1MHB4O2Rpc3BsYXk6YmxvY2s7bWFyZ2luOjAgYXV0byA2cHg7YW5pbWF0aW9uOnN1bkJvYiAyLjRzIGVhc2UtaW4tb3V0IGluZmluaXRlfQouc3VuLXJheXN7dHJhbnNmb3JtLW9yaWdpbjoxMDBweCAxMDBweDthbmltYXRpb246c3VuU3BpbiA3cyBsaW5lYXIgaW5maW5pdGV9Ci5zdW4tcmF5cyByZWN0e2FuaW1hdGlvbjpzdW5SYXkgMS42cyBlYXNlLWluLW91dCBpbmZpbml0ZX0KLnN1bi1yYXlzIHJlY3Q6bnRoLWNoaWxkKG9kZCl7YW5pbWF0aW9uLWRlbGF5Oi44c30KLnN1bi1nbG93e3RyYW5zZm9ybS1vcmlnaW46MTAwcHggMTAwcHg7YW5pbWF0aW9uOnN1blB1bHNlIDEuOHMgZWFzZS1pbi1vdXQgaW5maW5pdGV9Ci5zdW4tZmFjZXt0cmFuc2Zvcm0tb3JpZ2luOjEwMHB4IDEwMHB4O2FuaW1hdGlvbjpzdW5CbGluayA0cyBpbmZpbml0ZX0KLnN1bi1sMXtmb250LWZhbWlseTonUGFjaWZpY28nLGN1cnNpdmU7Zm9udC1zaXplOjI2cHg7bGluZS1oZWlnaHQ6MS4zO21hcmdpbjo2cHggMCA0cHg7YmFja2dyb3VuZDpsaW5lYXItZ3JhZGllbnQoOTBkZWcsI0ZGN0EwMCwjRkZCNjI3LCNGRjVFN0UsI0ZGN0EwMCk7YmFja2dyb3VuZC1zaXplOjMwMCUgMTAwJTstd2Via2l0LWJhY2tncm91bmQtY2xpcDp0ZXh0O2JhY2tncm91bmQtY2xpcDp0ZXh0O2NvbG9yOnRyYW5zcGFyZW50O2FuaW1hdGlvbjpzdW5TaGluZSA0cyBsaW5lYXIgaW5maW5pdGUsc3VuSW4gLjZzIC4xcyBib3RofQouc3VuLWwye2ZvbnQtZmFtaWx5OidCYWxvbyAyJyx2YXIoLS1kaXNwbGF5KSxzYW5zLXNlcmlmO2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTlweDtjb2xvcjojNkI0MjAwO21hcmdpbjowO2FuaW1hdGlvbjpzdW5JbiAuNnMgLjM1cyBib3RofQouc3VuLWwze2ZvbnQtZmFtaWx5OidCYWxvbyAyJyx2YXIoLS1kaXNwbGF5KSxzYW5zLXNlcmlmO2ZvbnQtd2VpZ2h0OjYwMDtmb250LXNpemU6MTZweDtjb2xvcjojQzA3MDAwO21hcmdpbjo0cHggMCAwO2FuaW1hdGlvbjpzdW5JbiAuNnMgLjZzIGJvdGh9Ci5zdW4tZG90cyBpe2ZvbnQtc3R5bGU6bm9ybWFsO2Rpc3BsYXk6aW5saW5lLWJsb2NrO2FuaW1hdGlvbjpzdW5Eb3QgMS4ycyBpbmZpbml0ZX0KLnN1bi1kb3RzIGk6bnRoLWNoaWxkKDIpe2FuaW1hdGlvbi1kZWxheTouMnN9LnN1bi1kb3RzIGk6bnRoLWNoaWxkKDMpe2FuaW1hdGlvbi1kZWxheTouNHN9CiNzdW5Mb2FkZXIuZG9uZSAuc3VuLXJheXN7YW5pbWF0aW9uLWR1cmF0aW9uOjEuMnN9CiNzdW5Mb2FkZXIuZG9uZSAuc3VuLWwye2NvbG9yOiMxRjhBNEN9CkBrZXlmcmFtZXMgc3VuU3Bpbnt0b3t0cmFuc2Zvcm06cm90YXRlKDM2MGRlZyl9fQpAa2V5ZnJhbWVzIHN1blJheXswJSwxMDAle29wYWNpdHk6MX01MCV7b3BhY2l0eTouNDV9fQpAa2V5ZnJhbWVzIHN1blB1bHNlezAlLDEwMCV7dHJhbnNmb3JtOnNjYWxlKDEpO29wYWNpdHk6LjM1fTUwJXt0cmFuc2Zvcm06c2NhbGUoMS4xOCk7b3BhY2l0eTouMTV9fQpAa2V5ZnJhbWVzIHN1bkJvYnswJSwxMDAle3RyYW5zZm9ybTp0cmFuc2xhdGVZKDApfTUwJXt0cmFuc2Zvcm06dHJhbnNsYXRlWSgtOHB4KX19CkBrZXlmcmFtZXMgc3VuQmxpbmt7MCUsOTIlLDEwMCV7dHJhbnNmb3JtOnNjYWxlWSgxKX05NSV7dHJhbnNmb3JtOnNjYWxlWSguMTUpfX0KQGtleWZyYW1lcyBzdW5TaGluZXt0b3tiYWNrZ3JvdW5kLXBvc2l0aW9uOjMwMCUgMH19CkBrZXlmcmFtZXMgc3VuSW57ZnJvbXtvcGFjaXR5OjA7dHJhbnNmb3JtOnRyYW5zbGF0ZVkoOHB4KX10b3tvcGFjaXR5OjE7dHJhbnNmb3JtOm5vbmV9fQpAa2V5ZnJhbWVzIHN1bkRvdHswJSwxMDAle29wYWNpdHk6LjI7dHJhbnNmb3JtOnRyYW5zbGF0ZVkoMCl9NDAle29wYWNpdHk6MTt0cmFuc2Zvcm06dHJhbnNsYXRlWSgtM3B4KX19CkBtZWRpYSAocHJlZmVycy1yZWR1Y2VkLW1vdGlvbjpyZWR1Y2UpeyNzdW5Mb2FkZXIgKnthbmltYXRpb24tZHVyYXRpb246MHMhaW1wb3J0YW50O2FuaW1hdGlvbi1pdGVyYXRpb24tY291bnQ6MSFpbXBvcnRhbnR9fQpAbWVkaWEgKG1heC13aWR0aDo0ODBweCl7LnN1bnt3aWR0aDoxMjBweDtoZWlnaHQ6MTIwcHh9LnN1bi1sMXtmb250LXNpemU6MjJweH19Ci5ub3RlLnByZXZwcmludHtjb2xvcjojQjQ1MzA5O2JhY2tncm91bmQ6I0ZGRjdFNjtib3JkZXItcmFkaXVzOjZweDtwYWRkaW5nOjJweCA2cHg7ZGlzcGxheTppbmxpbmUtYmxvY2s7bWFyZ2luLXRvcDo0cHh9Ci5ta3AtcmVhZGJhcntkaXNwbGF5OmZsZXg7anVzdGlmeS1jb250ZW50OmZsZXgtc3RhcnQ7bWFyZ2luLXRvcDo4cHh9Ci8qIC0tLS0gQ2hhdCBkZSBtZW5zYWplcyAoTUtQIEZsYXNoKSAtLS0tICovCi5jaGF0LWNhcmR7cGFkZGluZzowO2JvcmRlcjowO2JvcmRlci1yYWRpdXM6MjBweDtvdmVyZmxvdzpoaWRkZW47Z2FwOjA7Ym94LXNoYWRvdzowIDZweCAyMnB4IHJnYmEoNDUsNTAsMTE5LC4xMCk7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTthbmltYXRpb246Y2hhdEluIC40NXMgY3ViaWMtYmV6aWVyKC4yLC44LC4yNSwxLjE1KSBib3RoO2FuaW1hdGlvbi1kZWxheTp2YXIoLS1kLDBtcyl9Ci5jaGF0LWhlYWR7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6MTJweDtwYWRkaW5nOjEycHggMTZweDtiYWNrZ3JvdW5kOmxpbmVhci1ncmFkaWVudCgxMjBkZWcsI0ZGRjE1OSAwJSwjRkZFNjAwIDYwJSwjRkZENDAwIDEwMCUpO2NvbG9yOiMyRDMyNzd9Ci5jaGF0LWF2e2ZsZXg6bm9uZTt3aWR0aDo0NHB4O2hlaWdodDo0NHB4O2JvcmRlci1yYWRpdXM6NTAlO2Rpc3BsYXk6Z3JpZDtwbGFjZS1pdGVtczpjZW50ZXI7Zm9udC13ZWlnaHQ6ODAwO2ZvbnQtc2l6ZToxNnB4O2JhY2tncm91bmQ6IzJEMzI3Nztjb2xvcjojRkZFNjAwO2JveC1zaGFkb3c6MCAwIDAgM3B4IHJnYmEoMjU1LDI1NSwyNTUsLjcpfQouY2hhdC13aG97ZGlzcGxheTpncmlkO2dhcDoxcHg7bWluLXdpZHRoOjA7ZmxleDoxfQouY2hhdC13aG8gYntmb250LXNpemU6MTdweDtsaW5lLWhlaWdodDoxLjJ9Ci5jaGF0LXdobyBzbWFsbHtmb250LXNpemU6MTIuNXB4O2NvbG9yOiMzZDQyODI7d2hpdGUtc3BhY2U6bm93cmFwO292ZXJmbG93OmhpZGRlbjt0ZXh0LW92ZXJmbG93OmVsbGlwc2lzfQouY2hhdC1wcm9ke2ZvbnQtc3R5bGU6bm9ybWFsfQouY2hhdC11bnJlYWR7YmFja2dyb3VuZDojMzQ4M0ZBO2NvbG9yOiNmZmY7Ym9yZGVyLXJhZGl1czo5OTlweDtwYWRkaW5nOjAgN3B4O2ZvbnQtd2VpZ2h0OjcwMDthbmltYXRpb246Y2hhdFB1bHNlIDEuOHMgZWFzZS1pbi1vdXQgaW5maW5pdGV9Ci5jaGF0LW1re2ZsZXg6bm9uZTtkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4O2JhY2tncm91bmQ6IzJEMzI3Nztjb2xvcjojRkZFNjAwO2JvcmRlci1yYWRpdXM6OTk5cHg7cGFkZGluZzo1cHggMTFweCA1cHggOHB4O2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MTIuNXB4O2xldHRlci1zcGFjaW5nOi4ycHh9Ci5jaGF0LW1rIHN2Z3t3aWR0aDoxNnB4O2hlaWdodDoxNnB4O2ZpbGw6I0ZGRTYwMH0KLmNoYXQtdGhyZWFke21heC1oZWlnaHQ6MzQwcHg7cGFkZGluZzoxNnB4O2dhcDoxMHB4O2JhY2tncm91bmQ6cmFkaWFsLWdyYWRpZW50KGNpcmNsZSBhdCAyMCUgMTAlLHJnYmEoNTIsMTMxLDI1MCwuMDcpLHRyYW5zcGFyZW50IDQwJSkscmFkaWFsLWdyYWRpZW50KGNpcmNsZSBhdCA5MCUgOTAlLHJnYmEoMjU1LDIzMCwwLC4xMiksdHJhbnNwYXJlbnQgNDUlKSwjRjZGOEZDfQouY2hhdC10aHJlYWQgLm1rcC1idWJ7cG9zaXRpb246cmVsYXRpdmU7bWF4LXdpZHRoOjc4JTtwYWRkaW5nOjlweCAxM3B4IDZweDtib3JkZXItcmFkaXVzOjE4cHggMThweCAxOHB4IDZweDtiYWNrZ3JvdW5kOiNmZmY7Ym94LXNoYWRvdzowIDJweCA2cHggcmdiYSgyMCwzMCw2MCwuMDgpO2ZvbnQtc2l6ZToxNXB4O2xpbmUtaGVpZ2h0OjEuMzU7YW5pbWF0aW9uOmJ1YkluIC4zOHMgY3ViaWMtYmV6aWVyKC4yLC45LC4zLDEuMykgYm90aDthbmltYXRpb24tZGVsYXk6Y2FsYyh2YXIoLS1kLDBtcykgKyB2YXIoLS1pLDApICogNzBtcyArIDEyMG1zKTt0cmFuc2Zvcm0tb3JpZ2luOmJvdHRvbSBsZWZ0fQouY2hhdC10aHJlYWQgLm1rcC1idWIuc2VsbGVye2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDEzNWRlZywjMzQ4M0ZBLCMyOTY4QzgpO2NvbG9yOiNmZmY7Ym9yZGVyLXJhZGl1czoxOHB4IDE4cHggNnB4IDE4cHg7dHJhbnNmb3JtLW9yaWdpbjpib3R0b20gcmlnaHR9Ci5jaGF0LXRocmVhZCAubWtwLWJ1Yi5zZWxsZXIgc21hbGx7Y29sb3I6cmdiYSgyNTUsMjU1LDI1NSwuOCl9Ci5jaGF0LXRocmVhZCAubWtwLWJ1YiBzbWFsbHtqdXN0aWZ5LXNlbGY6ZW5kO2ZvbnQtc2l6ZToxMXB4O21hcmdpbi10b3A6MnB4fQouY2hhdC1jb21wb3Nle2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyIGF1dG87Z2FwOjhweDthbGlnbi1pdGVtczplbmQ7cGFkZGluZzoxMnB4IDE0cHg7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXItdG9wOjFweCBzb2xpZCB2YXIoLS1saW5lKX0KLmNoYXQtY29tcG9zZSB0ZXh0YXJlYXtib3JkZXItcmFkaXVzOjIycHg7cGFkZGluZzoxMXB4IDE2cHg7cmVzaXplOm5vbmU7bWluLWhlaWdodDo0NHB4O21heC1oZWlnaHQ6MTYwcHg7Zm9udC1zaXplOjE1cHg7bGluZS1oZWlnaHQ6MS4zNTtiYWNrZ3JvdW5kOiNGMkY0Rjg7Ym9yZGVyOjJweCBzb2xpZCB0cmFuc3BhcmVudDt0cmFuc2l0aW9uOmJvcmRlci1jb2xvciAuMnMsYmFja2dyb3VuZCAuMnMsYm94LXNoYWRvdyAuMnN9Ci5jaGF0LWNvbXBvc2UgdGV4dGFyZWE6Zm9jdXN7b3V0bGluZTowO2JhY2tncm91bmQ6I2ZmZjtib3JkZXItY29sb3I6IzM0ODNGQTtib3gtc2hhZG93OjAgMCAwIDRweCByZ2JhKDUyLDEzMSwyNTAsLjE1KX0KLmNoYXQtc2VuZHtkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4O2hlaWdodDo0NHB4O3BhZGRpbmc6MCAxOHB4O2JvcmRlci1yYWRpdXM6MjJweDtmb250LXdlaWdodDo4MDA7Zm9udC1zaXplOjE0LjVweDt0cmFuc2l0aW9uOnRyYW5zZm9ybSAuMTVzLGJveC1zaGFkb3cgLjJzfQouY2hhdC1zZW5kIHN2Z3t3aWR0aDoxOHB4O2hlaWdodDoxOHB4O2ZpbGw6I2ZmZjt0cmFuc2l0aW9uOnRyYW5zZm9ybSAuMjVzfQouY2hhdC1zZW5kOmhvdmVye3RyYW5zZm9ybTp0cmFuc2xhdGVZKC0xcHgpO2JveC1zaGFkb3c6MCA2cHggMTRweCByZ2JhKDUyLDEzMSwyNTAsLjM1KX0KLmNoYXQtc2VuZDpob3ZlciBzdmcsLmNoYXQtY29tcG9zZS50eXBpbmcgLmNoYXQtc2VuZCBzdmd7dHJhbnNmb3JtOnRyYW5zbGF0ZVgoM3B4KSByb3RhdGUoLTEyZGVnKX0KLmNoYXQtY29tcG9zZS50eXBpbmcgLmNoYXQtc2VuZHthbmltYXRpb246Y2hhdFB1bHNlIDEuNnMgZWFzZS1pbi1vdXQgaW5maW5pdGV9Ci5jaGF0LWZvb3R7Z3JpZC1jb2x1bW46MS8tMTtkaXNwbGF5OmZsZXg7anVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW47YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo4cHh9Ci5jaGF0LWZvb3Qgc21hbGx7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtc2l6ZToxMS41cHh9Ci5jaGF0LXJlYWR7Ym9yZGVyOjEuNXB4IHNvbGlkICNDRkUwRkY7YmFja2dyb3VuZDojRjBGNkZGO2NvbG9yOiMyOTY4Qzg7Zm9udC13ZWlnaHQ6NzAwO2ZvbnQtc2l6ZToxM3B4O2JvcmRlci1yYWRpdXM6OTk5cHg7cGFkZGluZzo2cHggMTRweDtjdXJzb3I6cG9pbnRlcjt0cmFuc2l0aW9uOmJhY2tncm91bmQgLjJzLHRyYW5zZm9ybSAuMTVzfQouY2hhdC1yZWFkOmhvdmVye2JhY2tncm91bmQ6I0UwRUNGRjt0cmFuc2Zvcm06dHJhbnNsYXRlWSgtMXB4KX0KLmNoYXQtY2FyZCAubWtwLXNlbnR7cGFkZGluZzoxMnB4IDE2cHh9CkBrZXlmcmFtZXMgY2hhdElue2Zyb217b3BhY2l0eTowO3RyYW5zZm9ybTp0cmFuc2xhdGVZKDE0cHgpIHNjYWxlKC45OCl9dG97b3BhY2l0eToxO3RyYW5zZm9ybTpub25lfX0KQGtleWZyYW1lcyBidWJJbntmcm9te29wYWNpdHk6MDt0cmFuc2Zvcm06c2NhbGUoLjYpIHRyYW5zbGF0ZVkoOHB4KX10b3tvcGFjaXR5OjE7dHJhbnNmb3JtOm5vbmV9fQpAa2V5ZnJhbWVzIGNoYXRQdWxzZXswJSwxMDAle2JveC1zaGFkb3c6MCAwIDAgMCByZ2JhKDUyLDEzMSwyNTAsLjQ1KX01MCV7Ym94LXNoYWRvdzowIDAgMCA2cHggcmdiYSg1MiwxMzEsMjUwLDApfX0KQG1lZGlhIChwcmVmZXJzLXJlZHVjZWQtbW90aW9uOnJlZHVjZSl7LmNoYXQtY2FyZCwuY2hhdC10aHJlYWQgLm1rcC1idWIsLmNoYXQtdW5yZWFkLC5jaGF0LWNvbXBvc2UudHlwaW5nIC5jaGF0LXNlbmR7YW5pbWF0aW9uOm5vbmUhaW1wb3J0YW50fX0KLyogQ2VsdWxhcjogZWwgY2hhdCB1c2EgdG9kbyBlbCBhbmNobyBkZSBsYSBwYW50YWxsYSAqLwpAbWVkaWEgKG1heC13aWR0aDo3MDBweCl7CiAgI21rcEJvZHksLm1rcC1ib2R5e3dpZHRoOjEwMCU7bWF4LXdpZHRoOm5vbmV9CiAgLm1rcC1ib2R5e21hcmdpbi1pbmxpbmU6LTEwcHh9CiAgLmNoYXQtY2FyZHtib3JkZXItcmFkaXVzOjE2cHg7d2lkdGg6MTAwJX0KICAuY2hhdC1oZWFke3BhZGRpbmc6MTBweCAxMnB4fQogIC5jaGF0LWF2e3dpZHRoOjM4cHg7aGVpZ2h0OjM4cHg7Zm9udC1zaXplOjE0cHh9CiAgLmNoYXQtbWt7Zm9udC1zaXplOjA7cGFkZGluZzo2cHh9CiAgLmNoYXQtbWsgc3Zne3dpZHRoOjE4cHg7aGVpZ2h0OjE4cHh9CiAgLmNoYXQtdGhyZWFke21heC1oZWlnaHQ6NTV2aDtwYWRkaW5nOjEycHggMTBweH0KICAuY2hhdC10aHJlYWQgLm1rcC1idWJ7bWF4LXdpZHRoOjg4JTtmb250LXNpemU6MTUuNXB4fQogIC5jaGF0LWNvbXBvc2V7cGFkZGluZzoxMHB4fQogIC5jaGF0LXNlbmQgc3BhbntkaXNwbGF5Om5vbmV9CiAgLmNoYXQtc2VuZHt3aWR0aDo0NnB4O3BhZGRpbmc6MDtqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyfQogIC5ta3AtdGlsZXN7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgzLG1pbm1heCgwLDFmcikpO2dhcDo2cHh9CiAgLm1rcC10aWxle3BhZGRpbmc6MTBweH0KICAubWtwLXRpbGUgYntmb250LXNpemU6MjRweH0KfQouY2hhdC1zaGlwe2Rpc3BsYXk6aW5saW5lLWJsb2NrO2JvcmRlci1yYWRpdXM6OTk5cHg7cGFkZGluZzowIDhweDttYXJnaW4tcmlnaHQ6NnB4O2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MTEuNXB4fQouY2hhdC1zaGlwLmZsZXh7YmFja2dyb3VuZDojMDBBNjUwO2NvbG9yOiNmZmZ9LmNoYXQtc2hpcC5hZ3tiYWNrZ3JvdW5kOiMyRDMyNzc7Y29sb3I6I0ZGRTYwMH0KLmNoYXQtdW5yZWFke21hcmdpbi1sZWZ0OjJweH0KLmNoYXQtc2FsZXtkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7Z2FwOjZweCAxNHB4O2FsaWduLWl0ZW1zOmNlbnRlcjtwYWRkaW5nOjlweCAxNnB4O2JhY2tncm91bmQ6I0ZGRkJFMDtib3JkZXItYm90dG9tOjFweCBzb2xpZCAjRjNFN0EwO2ZvbnQtc2l6ZToxMy41cHg7Y29sb3I6IzJEMzI3N30KLmNoYXQtc2FsZW5vIGJ7Zm9udC1mYW1pbHk6dmFyKC0tZGlzcGxheSk7bGV0dGVyLXNwYWNpbmc6LjNweH0KLmNoYXQtaXRlbXMgZW17Zm9udC1zdHlsZTpub3JtYWw7Y29sb3I6IzM0ODNGQTtmb250LXdlaWdodDo4MDB9CkBtZWRpYSAobWF4LXdpZHRoOjcwMHB4KXsuY2hhdC1zYWxle3BhZGRpbmc6OHB4IDEycHg7Zm9udC1zaXplOjEzcHh9fQoucS1kZWx7Ym9yZGVyOjEuNXB4IHNvbGlkICNGNEM3QzM7YmFja2dyb3VuZDojRkZGNUY0O2NvbG9yOiNCNDIzMTg7Zm9udC13ZWlnaHQ6NzAwO2ZvbnQtc2l6ZToxM3B4O2JvcmRlci1yYWRpdXM6OTk5cHg7cGFkZGluZzo2cHggMTRweDtjdXJzb3I6cG9pbnRlcjt0cmFuc2l0aW9uOmJhY2tncm91bmQgLjJzLHRyYW5zZm9ybSAuMTVzfQoucS1kZWw6aG92ZXJ7YmFja2dyb3VuZDojRkRFN0U1O3RyYW5zZm9ybTp0cmFuc2xhdGVZKC0xcHgpfQoucS1kZWwuYXJtZWR7YmFja2dyb3VuZDojQjQyMzE4O2NvbG9yOiNmZmY7Ym9yZGVyLWNvbG9yOiNCNDIzMTh9Ci5ta3AtY2FyZC5ta3AtZ29uZXt0cmFuc2l0aW9uOm9wYWNpdHkgLjNzLHRyYW5zZm9ybSAuM3M7b3BhY2l0eTowO3RyYW5zZm9ybTp0cmFuc2xhdGVYKDMwcHgpfQovKiBNS1AgRmxhc2ggwrcgQXRyYXNhZG9zICovCi5ta3AtdGlsZXN7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCg2LG1pbm1heCgwLDFmcikpfQoubWtwLXRpbGUtbGF0ZS5ob3R7Ym9yZGVyLWNvbG9yOiNFNTQ4NEQ7YmFja2dyb3VuZDojRkZGMUYxfS5ta3AtdGlsZS1sYXRlLmhvdCBie2NvbG9yOiNEMTJGMzV9Ci5ta3AtdGlsZS1sYXRlLndhcm17Ym9yZGVyLWNvbG9yOiNGNUE1MjQ7YmFja2dyb3VuZDojRkZGOEVCfS5ta3AtdGlsZS1sYXRlLndhcm0gYntjb2xvcjojQjI2QjAwfQoubWtwLXRpbGUtbGF0ZS5ob3Qub24sLm1rcC10aWxlLWxhdGUud2FybS5vbntib3JkZXItd2lkdGg6MnB4fQoubGF0ZS1ncnB7bWFyZ2luLWJvdHRvbToxNnB4fS5sYXRlLWdycCBoM3ttYXJnaW46NnB4IDJweCA4cHg7Zm9udC1zaXplOjE2cHh9LmxhdGUtZ3JwIGgzIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXdlaWdodDo1MDA7Zm9udC1zaXplOjEycHg7bWFyZ2luLWxlZnQ6NnB4fQoubGF0ZS1jYXJke2Rpc3BsYXk6Z3JpZDtnYXA6NXB4O2JvcmRlci1sZWZ0OjVweCBzb2xpZCAjRTU0ODREO2FuaW1hdGlvbjpjaGF0SW4gLjRzIGVhc2UgYm90aDthbmltYXRpb24tZGVsYXk6dmFyKC0tZCwwbXMpfQoubGF0ZS1jYXJkLndhcm57Ym9yZGVyLWxlZnQtY29sb3I6I0Y1QTUyNH0KLmxhdGUtaHtkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo4cHh9Ci5sYXRlLWZsYWd7Zm9udC13ZWlnaHQ6ODAwO2ZvbnQtc2l6ZToxM3B4O3BhZGRpbmc6M3B4IDEwcHg7Ym9yZGVyLXJhZGl1czo5OTlweDtiYWNrZ3JvdW5kOiNGRkUzRTM7Y29sb3I6I0I0MjMyQX0KLmxhdGUtY2FyZC53YXJuIC5sYXRlLWZsYWd7YmFja2dyb3VuZDojRkZGMENDO2NvbG9yOiM4QTUzMDA7YW5pbWF0aW9uOmNoYXRQdWxzZSAycyBlYXNlLWluLW91dCBpbmZpbml0ZX0KLmxhdGUta2luZHttYXJnaW4tbGVmdDphdXRvO2ZvbnQtc2l6ZToxM3B4fQoubGF0ZS13aHl7bWFyZ2luOjJweCAwO2ZvbnQtd2VpZ2h0OjYwMH0KLmxhdGUtY2FyZCBzbWFsbHtjb2xvcjp2YXIoLS1tdXRlZCk7Zm9udC1zaXplOjEyLjVweH0ubGF0ZS1jYXJkIHNtYWxsIGJ7Y29sb3I6dmFyKC0taW5rLCMxYjFkM2EpfQpAbWVkaWEgKG1heC13aWR0aDo5MDBweCl7Lm1rcC10aWxlc3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDIsbWlubWF4KDAsMWZyKSl9fQpAbWVkaWEgKG1heC13aWR0aDo3MDBweCl7Lm1rcC10aWxlc3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDMsbWlubWF4KDAsMWZyKSl9LmxhdGUta2luZHttYXJnaW4tbGVmdDowfX0KLmNoYXQtc2hpcC5sYXRlLW1rLWZhe2JhY2tncm91bmQ6I0U4RjdFQztjb2xvcjojMUU3QTNBO2JvcmRlci1jb2xvcjojQkZFNkNCfQouY2hhdC1zaGlwLmxhdGUtbWstcGF7YmFja2dyb3VuZDojRThGMEZGO2NvbG9yOiMxRDRFRDg7Ym9yZGVyLWNvbG9yOiNDNUQ2RkJ9Ci5ta3AtdGlsZXN7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCg1LG1pbm1heCgwLDFmcikpfQpAbWVkaWEgKG1heC13aWR0aDo5MDBweCl7Lm1rcC10aWxlc3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDIsbWlubWF4KDAsMWZyKSl9fQpAbWVkaWEgKG1heC13aWR0aDo3MDBweCl7Lm1rcC10aWxlc3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDMsbWlubWF4KDAsMWZyKSl9fQovKiBSZWNsYW1vcyB5IG1lZGlhY2lvbmVzIGNvbW8gY2hhdCAqLwouY2xhaW0tdGFne2Rpc3BsYXk6aW5saW5lLWJsb2NrO21hcmdpbi1yaWdodDo2cHg7cGFkZGluZzoycHggOXB4O2JvcmRlci1yYWRpdXM6OTk5cHg7Zm9udC13ZWlnaHQ6ODAwO2ZvbnQtc2l6ZToxMS41cHg7YmFja2dyb3VuZDojRkZFM0UzO2NvbG9yOiNCNDIzMkF9Ci5jbGFpbS10YWcubWVke2JhY2tncm91bmQ6I0VERTRGRjtjb2xvcjojNUIyREIzfQouY2xhaW0tZHVle2Rpc3BsYXk6aW5saW5lLWJsb2NrO3BhZGRpbmc6MnB4IDlweDtib3JkZXItcmFkaXVzOjk5OXB4O2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTEuNXB4O2JhY2tncm91bmQ6cmdiYSgyNTUsMjU1LDI1NSwuNzUpO2NvbG9yOiMyRDMyNzd9Ci5jbGFpbS1jaGF0Lm1lZCAuY2hhdC1oZWFke2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDEyMGRlZywjRkZGMTU5IDAlLCNGRkU2MDAgNTUlLCNFOUQ4RkYgMTAwJSl9Ci5jaGF0LXRocmVhZCAubWtwLWJ1Yi5tZWRpYXRvcntiYWNrZ3JvdW5kOiNGRkY3REI7Ym9yZGVyOjFweCBzb2xpZCAjRjVERThDO2p1c3RpZnktc2VsZjpjZW50ZXI7bWF4LXdpZHRoOjg4JTtib3JkZXItcmFkaXVzOjE0cHh9Ci5idWItd2hve2ZvbnQtc2l6ZToxMS41cHg7Y29sb3I6IzhBNTMwMDttYXJnaW4tYm90dG9tOjJweH0KLmNoYXQtbm9uZXtqdXN0aWZ5LXNlbGY6Y2VudGVyO3BhZGRpbmc6OHB4fQouY2hhdC1sb2FkaW5ne2p1c3RpZnktc2VsZjpzdGFydDtkaXNwbGF5OmZsZXg7Z2FwOjVweDtwYWRkaW5nOjEycHggMTRweDtiYWNrZ3JvdW5kOiNmZmY7Ym9yZGVyLXJhZGl1czoxOHB4O2JveC1zaGFkb3c6MCAycHggNnB4IHJnYmEoMjAsMzAsNjAsLjA4KX0KLmNoYXQtbG9hZGluZyBpe3dpZHRoOjhweDtoZWlnaHQ6OHB4O2JvcmRlci1yYWRpdXM6NTAlO2JhY2tncm91bmQ6IzlBQTVCRTthbmltYXRpb246ZG90QiAxcyBpbmZpbml0ZSBlYXNlLWluLW91dH0KLmNoYXQtbG9hZGluZyBpOm50aC1jaGlsZCgyKXthbmltYXRpb24tZGVsYXk6LjE1c30uY2hhdC1sb2FkaW5nIGk6bnRoLWNoaWxkKDMpe2FuaW1hdGlvbi1kZWxheTouM3N9CkBrZXlmcmFtZXMgZG90QnswJSw4MCUsMTAwJXt0cmFuc2Zvcm06dHJhbnNsYXRlWSgwKTtvcGFjaXR5Oi41fTQwJXt0cmFuc2Zvcm06dHJhbnNsYXRlWSgtNXB4KTtvcGFjaXR5OjF9fQouY2hhdC1zYWxle2ZsZXgtd3JhcDp3cmFwfQovKiBDZWx1bGFyOiBzaW4gZnJhbmphIGEgbGEgZGVyZWNoYSBuaSB6b29tIGFsIGVudHJhciAobmFkYSBwdWVkZSBzZXIgbcOhcyBhbmNobyBxdWUgbGEgcGFudGFsbGEpICovCmh0bWwsYm9keXttYXgtd2lkdGg6MTAwJTtvdmVyZmxvdy14OmNsaXB9CkBzdXBwb3J0cyBub3QgKG92ZXJmbG93OmNsaXApe2h0bWwsYm9keXtvdmVyZmxvdy14OmhpZGRlbn19CmltZyxzdmcsdmlkZW8sY2FudmFze21heC13aWR0aDoxMDAlfQpAbWVkaWEgKG1heC13aWR0aDo3NjBweCl7CiAgLnRvcCAud3JhcHtnYXA6OHB4fQogIC5uYXZ7b3JkZXI6MTA7ZmxleDoxIDEgMTAwJTttYXgtd2lkdGg6MTAwJTtvdmVyZmxvdy14OmF1dG87c2Nyb2xsYmFyLXdpZHRoOm5vbmU7LXdlYmtpdC1vdmVyZmxvdy1zY3JvbGxpbmc6dG91Y2g7Ym9yZGVyLXJhZGl1czoxNnB4fQogIC5uYXY6Oi13ZWJraXQtc2Nyb2xsYmFye2Rpc3BsYXk6bm9uZX0KICAubmF2IGJ1dHRvbntmbGV4Om5vbmU7d2hpdGUtc3BhY2U6bm93cmFwO3BhZGRpbmc6OHB4IDEzcHg7Zm9udC1zaXplOjE0cHh9CiAgLndyYXB7bWF4LXdpZHRoOjEwMCU7bWluLXdpZHRoOjB9CiAgLm1rcC1jYXJkLC5jaGF0LWNhcmQsLm1rcC1ib2R5LC5ta3AtdGlsZXN7bWluLXdpZHRoOjA7bWF4LXdpZHRoOjEwMCV9CiAgLmNoYXQtaXRlbXMsLmNoYXQtc2FsZSBiLC5ta3AtYnViIHNwYW57b3ZlcmZsb3ctd3JhcDphbnl3aGVyZX0KfQovKiBDZWx1bGFyOiBmcmFuamEgYW5nb3N0YSBhIGxhIGRlcmVjaGEgcGFyYSBkZXNsaXphciBjb24gZWwgZGVkbyBzaW4gdG9jYXIgbGFzIHRhcmpldGFzICovCkBtZWRpYSAobWF4LXdpZHRoOjc2MHB4KXsKICBtYWluLndyYXB7cGFkZGluZy1sZWZ0OjEycHg7cGFkZGluZy1yaWdodDozMHB4fQogIGJvZHk6OmFmdGVye2NvbnRlbnQ6IiI7cG9zaXRpb246Zml4ZWQ7dG9wOjA7Ym90dG9tOjA7cmlnaHQ6MDt3aWR0aDoyMnB4O3BvaW50ZXItZXZlbnRzOm5vbmU7ei1pbmRleDo1O2JvcmRlci1sZWZ0OjFweCBzb2xpZCByZ2JhKDQ1LDUwLDExOSwuMDgpOwogICAgYmFja2dyb3VuZDpsaW5lYXItZ3JhZGllbnQocmdiYSg0NSw1MCwxMTksLjI1KSxyZ2JhKDQ1LDUwLDExOSwuMjUpKSBjZW50ZXIvNHB4IDU2cHggbm8tcmVwZWF0LGxpbmVhci1ncmFkaWVudCg5MGRlZyxyZ2JhKDUyLDEzMSwyNTAsLjAzKSxyZ2JhKDUyLDEzMSwyNTAsLjA5KSl9Cn0KLyogTUtQIEZsYXNoOiB0YXJqZXRhcyBibGFuY2FzIGNvbiBmcmFuamEgZGUgY29sb3IgYXJyaWJhOyBsYSBzZWNjacOzbiBhY3R1YWwgcXVlZGEgZGVzdGFjYWRhICovCi5ta3AtdGlsZVtkYXRhLW12XXstLWM6IzJEMzI3Nztwb3NpdGlvbjpyZWxhdGl2ZTtvdmVyZmxvdzp2aXNpYmxlO2JhY2tncm91bmQ6I2ZmZjtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTZweDtwYWRkaW5nLXRvcDoxOHB4O3RyYW5zaXRpb246dHJhbnNmb3JtIC4xOHMsYm94LXNoYWRvdyAuMThzLG9wYWNpdHkgLjE4c30KLm1rcC10aWxlW2RhdGEtbXZdOjpiZWZvcmV7Y29udGVudDoiIjtwb3NpdGlvbjphYnNvbHV0ZTtsZWZ0OjA7cmlnaHQ6MDt0b3A6MDtoZWlnaHQ6NnB4O2JvcmRlci1yYWRpdXM6MTZweCAxNnB4IDAgMDtiYWNrZ3JvdW5kOmxpbmVhci1ncmFkaWVudCg5MGRlZyx2YXIoLS1jKSxjb2xvci1taXgoaW4gc3JnYix2YXIoLS1jKSA1NSUsI2ZmZikpfQoubWtwLXRpbGVbZGF0YS1tdj0icXVlc3Rpb25zIl17LS1jOiMzQjgyRjZ9Ci5ta3AtdGlsZVtkYXRhLW12PSJtZXNzYWdlcyJdey0tYzojMTBCOTgxfQoubWtwLXRpbGVbZGF0YS1tdj0iY2xhaW1zIl17LS1jOiM4QjVDRjZ9Ci5ta3AtdGlsZVtkYXRhLW12PSJsYXRlIl17LS1jOiNFRjQ0NDR9Ci5ta3AtdGlsZVtkYXRhLW12PSJsYXRlIl0ud2FybXstLWM6I0Y1OUUwQn0KLm1rcC10aWxlW2RhdGEtbXY9InJldHVybnMiXXstLWM6I0Y1OUUwQn0KLm1rcC10aWxlW2RhdGEtbXZdIGJ7Y29sb3I6dmFyKC0tYyl9Ci5ta3AtdGlsZS1sYXRlLmhvdCwubWtwLXRpbGUtbGF0ZS53YXJte2JhY2tncm91bmQ6I2ZmZjtib3JkZXItY29sb3I6dmFyKC0tbGluZSl9Ci5ta3AtdGlsZS1sYXRlLmhvdCBiOjphZnRlcntjb250ZW50OiIiO2Rpc3BsYXk6aW5saW5lLWJsb2NrO3dpZHRoOjhweDtoZWlnaHQ6OHB4O21hcmdpbi1sZWZ0OjhweDt2ZXJ0aWNhbC1hbGlnbjptaWRkbGU7Ym9yZGVyLXJhZGl1czo1MCU7YmFja2dyb3VuZDp2YXIoLS1jKTthbmltYXRpb246bGF0ZURvdCAxLjZzIGVhc2UtaW4tb3V0IGluZmluaXRlfQpAa2V5ZnJhbWVzIGxhdGVEb3R7MCUsMTAwJXtib3gtc2hhZG93OjAgMCAwIDAgY29sb3ItbWl4KGluIHNyZ2IsdmFyKC0tYykgNDUlLHRyYW5zcGFyZW50KX01MCV7Ym94LXNoYWRvdzowIDAgMCA2cHggdHJhbnNwYXJlbnR9fQoubWtwLXRpbGVbZGF0YS1tdl06aG92ZXJ7dHJhbnNmb3JtOnRyYW5zbGF0ZVkoLTJweCk7Ym94LXNoYWRvdzowIDhweCAxOHB4IHJnYmEoMjAsMzAsNjAsLjA4KX0KLm1rcC10aWxlcy5zZWwgLm1rcC10aWxlW2RhdGEtbXZdOm5vdCgub24pe29wYWNpdHk6LjcyfQoubWtwLXRpbGVzLnNlbCAubWtwLXRpbGVbZGF0YS1tdl06bm90KC5vbik6aG92ZXJ7b3BhY2l0eToxfQoubWtwLXRpbGVbZGF0YS1tdl0ub257Ym9yZGVyOjJweCBzb2xpZCB2YXIoLS1jKTtiYWNrZ3JvdW5kOmxpbmVhci1ncmFkaWVudCgxODBkZWcsY29sb3ItbWl4KGluIHNyZ2IsdmFyKC0tYykgNyUsI2ZmZiksI2ZmZiA3MCUpO3RyYW5zZm9ybTp0cmFuc2xhdGVZKC0zcHgpO2JveC1zaGFkb3c6MCAxMnB4IDI0cHggY29sb3ItbWl4KGluIHNyZ2IsdmFyKC0tYykgMjIlLHRyYW5zcGFyZW50KX0KLm1rcC10aWxlW2RhdGEtbXZdLm9uOjpiZWZvcmV7aGVpZ2h0OjhweDtsZWZ0Oi0xcHg7cmlnaHQ6LTFweDt0b3A6LTFweH0KLm1rcC10aWxlW2RhdGEtbXZdLm9uOjphZnRlcntjb250ZW50OiIiO3Bvc2l0aW9uOmFic29sdXRlO2xlZnQ6NTAlO2JvdHRvbTotMTBweDt0cmFuc2Zvcm06dHJhbnNsYXRlWCgtNTAlKTtib3JkZXI6OXB4IHNvbGlkIHRyYW5zcGFyZW50O2JvcmRlci1ib3R0b206MDtib3JkZXItdG9wLWNvbG9yOnZhcigtLWMpfQoubWtwLWhlcmV7cG9zaXRpb246YWJzb2x1dGU7dG9wOjE0cHg7cmlnaHQ6MTBweDtmb250LXN0eWxlOm5vcm1hbDtmb250LXNpemU6MTBweDtmb250LXdlaWdodDo4MDA7bGV0dGVyLXNwYWNpbmc6LjRweDt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7YmFja2dyb3VuZDp2YXIoLS1jKTtjb2xvcjojZmZmO3BhZGRpbmc6MnB4IDhweDtib3JkZXItcmFkaXVzOjk5OXB4fQoubWtwLXBpY2t7Ym9yZGVyLXN0eWxlOmRhc2hlZH0KQG1lZGlhIChtYXgtd2lkdGg6NzAwcHgpey5ta3AtaGVyZXt0b3A6MTJweDtyaWdodDo2cHg7Zm9udC1zaXplOjA7cGFkZGluZzoycHggNnB4fS5ta3AtaGVyZTo6YmVmb3Jle2NvbnRlbnQ6IkFxdcOtIjtmb250LXNpemU6OXB4fS5ta3AtdGlsZVtkYXRhLW12XXtwYWRkaW5nLXRvcDoxNnB4fX0KLyogQ2VsdWxhcjogYmFycmEgc3VwZXJpb3IgY29tcGFjdGEgeSBOTyBmaWphIChubyB0YXBhIGVsIGNvbnRlbmlkbyk7IGNoYXRzIHVuIHBvY28gbcOhcyBhbmdvc3RvcyAqLwpAbWVkaWEgKG1heC13aWR0aDo3NjBweCl7CiAgLnRvcHtwb3NpdGlvbjpzdGF0aWM7YmFja2Ryb3AtZmlsdGVyOm5vbmV9CiAgLnRvcCAud3JhcHtwYWRkaW5nLWJsb2NrOjZweDtnYXA6NnB4fQogIC5icmFuZHtmb250LXNpemU6MThweH0uYnJhbmQgaW1ne3dpZHRoOjI2cHg7aGVpZ2h0OjI2cHh9CiAgLmNsb2Nre3BhZGRpbmc6M3B4IDlweDtnYXA6NnB4fS5jbG9jayBie2ZvbnQtc2l6ZToxNHB4fS5jbG9jayBzbWFsbHtmb250LXNpemU6OXB4fQogIC51bmRvLWJ0bntwYWRkaW5nOjRweCA5cHg7Zm9udC1zaXplOjEycHh9CiAgLm5hdiBidXR0b257cGFkZGluZzo2cHggMTFweDtmb250LXNpemU6MTNweH0KICAjbWtwQm9keSAuY2hhdC1jYXJke3dpZHRoOmF1dG87bWF4LXdpZHRoOmNhbGMoMTAwJSAtIDE0cHgpO21hcmdpbi1yaWdodDoxNHB4fQp9Ci8qIE1lbnNhamVzIGRlbCBtZWRpYWRvciBkZSBNZXJjYWRvIExpYnJlLCBtw6FzIGNsYXJvcyAqLwoubWwtbXNne2Rpc3BsYXk6Z3JpZDtnYXA6MTBweDtsaW5lLWhlaWdodDoxLjQ1fQoubWwtbXNnIHB7bWFyZ2luOjB9Ci5tbC1vcHRze2xpc3Qtc3R5bGU6bm9uZTttYXJnaW46MDtwYWRkaW5nOjA7ZGlzcGxheTpncmlkO2dhcDo4cHh9Ci5tbC1vcHRzIGxpe2Rpc3BsYXk6ZmxleDtnYXA6MTBweDthbGlnbi1pdGVtczpmbGV4LXN0YXJ0O2JhY2tncm91bmQ6I2ZmZjtib3JkZXI6MXB4IHNvbGlkICNGMUUzQTY7Ym9yZGVyLXJhZGl1czoxMnB4O3BhZGRpbmc6MTBweCAxMnB4fQoubWwtbntmbGV4Om5vbmU7bWluLXdpZHRoOjI4cHg7aGVpZ2h0OjI4cHg7Ym9yZGVyLXJhZGl1czo1MCU7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtiYWNrZ3JvdW5kOiMyRDMyNzc7Y29sb3I6I0ZGRTYwMDtmb250LXdlaWdodDo4MDA7Zm9udC1zaXplOjEzcHh9Ci5tbC1vcHRzIGxpIGRpdntkaXNwbGF5OmdyaWQ7Z2FwOjJweH0KLm1sLW9wdHMgbGkgYntjb2xvcjojMkQzMjc3fQoubWwtb3B0cyBsaSBzbWFsbHtmb250LXNpemU6MTRweDtjb2xvcjp2YXIoLS1pbmssIzFiMWQzYSk7b3BhY2l0eTouODV9Ci5tbC1kZWFkbGluZXtiYWNrZ3JvdW5kOiNGRkYxRjE7Ym9yZGVyOjFweCBzb2xpZCAjRjVCNUI3O2NvbG9yOiM5RjFGMjQ7Ym9yZGVyLXJhZGl1czoxMHB4O3BhZGRpbmc6OHB4IDEycHg7Zm9udC13ZWlnaHQ6NjAwfQoubWwtY2hpcHtkaXNwbGF5OmlubGluZS1ibG9jaztiYWNrZ3JvdW5kOiMyRDMyNzc7Y29sb3I6I0ZGRTYwMDtib3JkZXItcmFkaXVzOjk5OXB4O3BhZGRpbmc6MnB4IDEwcHg7Zm9udC13ZWlnaHQ6ODAwO2ZvbnQtc2l6ZToxMi41cHh9Ci5tbC1oe2ZvbnQtd2VpZ2h0OjgwMDtjb2xvcjojMkQzMjc3fQovKiBOb3RpZmljYWNpb25lcyBkZSB2ZW50YXM6IGNhbXBhbmEgZmlqYSBhcnJpYmEgYSBsYSBkZXJlY2hhIGNvbiBsYXRpZG8gcm9qbyArIHBhbmVsIGxhdGVyYWwgKi8KLm50LWJlbGx7cG9zaXRpb246Zml4ZWQ7dG9wOjE0cHg7cmlnaHQ6MTZweDt6LWluZGV4OjYwO3dpZHRoOjUycHg7aGVpZ2h0OjUycHg7Ym9yZGVyLXJhZGl1czo1MCU7Ym9yZGVyOjA7YmFja2dyb3VuZDojZmZmO2NvbG9yOiNFMTFENDg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtjdXJzb3I6cG9pbnRlcjtib3gtc2hhZG93OjAgNnB4IDE4cHggcmdiYSgyMjUsMjksNzIsLjI4KTthbmltYXRpb246bnRCZWF0IDEuNnMgZWFzZS1pbi1vdXQgaW5maW5pdGV9Ci5udC1iZWxsIHN2Z3t3aWR0aDoyNnB4O2hlaWdodDoyNnB4O2ZpbGw6Y3VycmVudENvbG9yfQoubnQtYmVsbDo6YmVmb3Jle2NvbnRlbnQ6IiI7cG9zaXRpb246YWJzb2x1dGU7aW5zZXQ6MDtib3JkZXItcmFkaXVzOjUwJTtib3JkZXI6MnB4IHNvbGlkICNFMTFENDg7YW5pbWF0aW9uOm50UmluZyAxLjZzIGVhc2Utb3V0IGluZmluaXRlfQoubnQtYmVsbC5oYXN7YmFja2dyb3VuZDojRTExRDQ4O2NvbG9yOiNmZmZ9Ci5udC1iZWxsLm9ue2JveC1zaGFkb3c6MCAwIDAgNHB4IHJnYmEoMjI1LDI5LDcyLC4yNSksMCA2cHggMThweCByZ2JhKDIyNSwyOSw3MiwuMyl9Ci5udC1iZWxsIGJ7cG9zaXRpb246YWJzb2x1dGU7dG9wOi00cHg7cmlnaHQ6LTRweDttaW4td2lkdGg6MjJweDtoZWlnaHQ6MjJweDtwYWRkaW5nOjAgNnB4O2JvcmRlci1yYWRpdXM6OTk5cHg7YmFja2dyb3VuZDojRkZFNjAwO2NvbG9yOiMyRDMyNzc7Zm9udC1zaXplOjEycHg7Zm9udC13ZWlnaHQ6OTAwO2Rpc3BsYXk6Z3JpZDtwbGFjZS1pdGVtczpjZW50ZXI7Ym94LXNoYWRvdzowIDAgMCAycHggI2ZmZn0KQGtleWZyYW1lcyBudEJlYXR7MCUsNDAlLDEwMCV7dHJhbnNmb3JtOnNjYWxlKDEpfTE1JXt0cmFuc2Zvcm06c2NhbGUoMS4xNCl9Mjgle3RyYW5zZm9ybTpzY2FsZSgxLjA0KX19CkBrZXlmcmFtZXMgbnRSaW5nezAle3RyYW5zZm9ybTpzY2FsZSgxKTtvcGFjaXR5Oi43fTcwJSwxMDAle3RyYW5zZm9ybTpzY2FsZSgxLjYpO29wYWNpdHk6MH19CmJvZHkubnQtb24gLm50LWJlbGx7YW5pbWF0aW9uLXBsYXktc3RhdGU6cnVubmluZ30KLnRvcCAud3JhcHtwYWRkaW5nLXJpZ2h0Ojg0cHh9Ci5udC1wYW5lbHtwb3NpdGlvbjpmaXhlZDt0b3A6MDtyaWdodDowO2JvdHRvbTowO3otaW5kZXg6NTU7d2lkdGg6NDIwcHg7bWF4LXdpZHRoOjkydnc7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlLCNmZmYpO2JveC1zaGFkb3c6LTEycHggMCAzMnB4IHJnYmEoMjAsMzAsNjAsLjE2KTt0cmFuc2Zvcm06dHJhbnNsYXRlWCgxMDUlKTt0cmFuc2l0aW9uOnRyYW5zZm9ybSAuM3MgY3ViaWMtYmV6aWVyKC4yLC44LC4yLDEpO2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW59CmJvZHkubnQtb24gLm50LXBhbmVse3RyYW5zZm9ybTpub25lfQpAbWVkaWEgKG1pbi13aWR0aDoxMTAwcHgpe2JvZHkubnQtb257cGFkZGluZy1yaWdodDo0MjBweH1ib2R5Lm50LW9uIC5udC1wYW5lbHtib3gtc2hhZG93Oi0xcHggMCAwIHZhcigtLWxpbmUpfX0KLm50LWh7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbjtnYXA6MTBweDtwYWRkaW5nOjE4cHggODRweCAxNHB4IDE4cHg7YmFja2dyb3VuZDpsaW5lYXItZ3JhZGllbnQoMTIwZGVnLCNGRkYxNTksI0ZGRTYwMCk7Y29sb3I6IzJEMzI3N30KLm50LWggYntmb250LWZhbWlseTp2YXIoLS1kaXNwbGF5KTtmb250LXNpemU6MjJweDtkaXNwbGF5OmJsb2NrfQoubnQtaCBzbWFsbHtmb250LXNpemU6MTMuNXB4fQoubnQteHtib3JkZXI6MDtiYWNrZ3JvdW5kOnJnYmEoNDUsNTAsMTE5LC4xKTtjb2xvcjojMkQzMjc3O3dpZHRoOjM0cHg7aGVpZ2h0OjM0cHg7Ym9yZGVyLXJhZGl1czo1MCU7Zm9udC1zaXplOjE2cHg7Y3Vyc29yOnBvaW50ZXJ9Ci5udC1me2Rpc3BsYXk6ZmxleDtnYXA6NnB4O3BhZGRpbmc6MTBweCAxNHB4O2JvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLWxpbmUpO2ZsZXgtd3JhcDp3cmFwfQoubnQtZiBidXR0b257Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtiYWNrZ3JvdW5kOiNmZmY7Ym9yZGVyLXJhZGl1czo5OTlweDtwYWRkaW5nOjVweCAxMXB4O2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTNweDtjdXJzb3I6cG9pbnRlcjtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5udC1mIGJ1dHRvbiBlbXtmb250LXN0eWxlOm5vcm1hbDtvcGFjaXR5Oi43O21hcmdpbi1sZWZ0OjJweH0KLm50LWYgYnV0dG9uLm9ue2JhY2tncm91bmQ6IzJEMzI3Nztjb2xvcjojZmZmO2JvcmRlci1jb2xvcjojMkQzMjc3fQoubnQtbGlzdHtmbGV4OjE7b3ZlcmZsb3cteTphdXRvO3BhZGRpbmc6MTJweCAxNHB4IDMwcHg7ZGlzcGxheTpncmlkO2dhcDoxMHB4O2FsaWduLWNvbnRlbnQ6c3RhcnQ7YmFja2dyb3VuZDojRjZGOEZDfQoubnQtaXRlbXstLWM6IzJEMzI3NztiYWNrZ3JvdW5kOiNmZmY7Ym9yZGVyLXJhZGl1czoxNHB4O3BhZGRpbmc6MTJweCAxNHB4O2JvcmRlci1sZWZ0OjVweCBzb2xpZCB2YXIoLS1jKTtib3gtc2hhZG93OjAgMnB4IDhweCByZ2JhKDIwLDMwLDYwLC4wNik7ZGlzcGxheTpncmlkO2dhcDo2cHg7YW5pbWF0aW9uOmNoYXRJbiAuMzVzIGVhc2UgYm90aDthbmltYXRpb24tZGVsYXk6Y2FsYyh2YXIoLS1pKSAqIDQwbXMpfQoubnQtaXRlbS5tay1tbHstLWM6I0Y1QzQwMH0ubnQtaXRlbS5tay1mYXstLWM6IzRDQUY1MH0ubnQtaXRlbS5tay1wYXstLWM6IzI1NjNFQn0KLm50LWl0ZW0ubmV3e2JhY2tncm91bmQ6I0ZGRkJFQTtib3gtc2hhZG93OjAgMCAwIDJweCAjRkZFNjAwIGluc2V0LDAgMnB4IDhweCByZ2JhKDIwLDMwLDYwLC4wNil9Ci5udC10b3B7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6OHB4O2ZsZXgtd3JhcDp3cmFwO2ZvbnQtc2l6ZToxMi41cHh9Ci5udC1ta3tmb250LXdlaWdodDo4MDA7Y29sb3I6IzJEMzI3NztiYWNrZ3JvdW5kOmNvbG9yLW1peChpbiBzcmdiLHZhcigtLWMpIDIyJSwjZmZmKTtib3JkZXItcmFkaXVzOjk5OXB4O3BhZGRpbmc6MnB4IDlweH0KLm50LXNlbGxlcntmb250LXdlaWdodDo3MDA7Y29sb3I6dmFyKC0tbXV0ZWQpfQoubnQtYWdve21hcmdpbi1sZWZ0OmF1dG87Y29sb3I6dmFyKC0tbXV0ZWQpfQoubnQtbWFpbntkaXNwbGF5OmZsZXg7Z2FwOjEycHg7YWxpZ24taXRlbXM6ZmxleC1zdGFydDtqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2Vlbn0KLm50LXByb2R7ZGlzcGxheTpncmlkO2dhcDozcHg7Zm9udC1zaXplOjE0LjVweDtmb250LXdlaWdodDo2MDA7bWluLXdpZHRoOjB9Ci5udC1wcm9kIHNtYWxse2ZvbnQtd2VpZ2h0OjUwMDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5udC1wcm9kIGVte2ZvbnQtc3R5bGU6bm9ybWFsO2NvbG9yOiMzNDgzRkE7Zm9udC13ZWlnaHQ6ODAwfQoubnQtcHJpY2V7Zm9udC1mYW1pbHk6dmFyKC0tZGlzcGxheSk7Zm9udC1zaXplOjIxcHg7Y29sb3I6IzBGN0IzRjt3aGl0ZS1zcGFjZTpub3dyYXB9Ci5udC1pZHtjb2xvcjp2YXIoLS1tdXRlZCk7Zm9udC1zaXplOjEycHh9Ci5udC1lbXB0eXt0ZXh0LWFsaWduOmNlbnRlcjtjb2xvcjp2YXIoLS1tdXRlZCk7cGFkZGluZzozMHB4IDEwcHh9CkBtZWRpYSAobWF4LXdpZHRoOjc2MHB4KXsubnQtYmVsbHt0b3A6MTBweDtyaWdodDoxMHB4O3dpZHRoOjQ2cHg7aGVpZ2h0OjQ2cHh9Lm50LWJlbGwgc3Zne3dpZHRoOjIzcHg7aGVpZ2h0OjIzcHh9LnRvcCAud3JhcHtwYWRkaW5nLXJpZ2h0OjY2cHh9Lm50LXBhbmVse3dpZHRoOjEwMHZ3O21heC13aWR0aDoxMDB2d30ubnQtaHtwYWRkaW5nOjE0cHggNzBweCAxMnB4IDE0cHh9fQpAbWVkaWEgKHByZWZlcnMtcmVkdWNlZC1tb3Rpb246cmVkdWNlKXsubnQtYmVsbCwubnQtYmVsbDo6YmVmb3Jle2FuaW1hdGlvbjpub25lfX0KLm50LWltZ3tmbGV4Om5vbmU7d2lkdGg6NjRweDtoZWlnaHQ6NjRweDtib3JkZXItcmFkaXVzOjEycHg7b2JqZWN0LWZpdDpjb3ZlcjtiYWNrZ3JvdW5kOiNmZmY7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKX0KLm50LW5vaW1ne2Rpc3BsYXk6Z3JpZDtwbGFjZS1pdGVtczpjZW50ZXI7Zm9udC1zaXplOjI2cHg7YmFja2dyb3VuZDojRjFGNEZBfQoubnQtcHJvZHtmbGV4OjF9Ci5udC1ta3tkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4fQoubnQtbWsgaXt3aWR0aDo5cHg7aGVpZ2h0OjlweDtib3JkZXItcmFkaXVzOjUwJTtiYWNrZ3JvdW5kOnZhcigtLWMpfQoubnQtZmx5ey0tYzojMkQzMjc3O3Bvc2l0aW9uOmZpeGVkO2xlZnQ6MDt0b3A6MDt6LWluZGV4OjgwO3dpZHRoOjE0MHB4O3BhZGRpbmc6MTBweDtib3JkZXItcmFkaXVzOjE4cHg7YmFja2dyb3VuZDojZmZmO2JveC1zaGFkb3c6MCAxOHB4IDQwcHggcmdiYSgyMCwzMCw2MCwuMyk7ZGlzcGxheTpncmlkO2p1c3RpZnktaXRlbXM6Y2VudGVyO2dhcDo0cHg7cG9pbnRlci1ldmVudHM6bm9uZTtib3JkZXItdG9wOjVweCBzb2xpZCB2YXIoLS1jKX0KLm50LWZseS5tay1tbHstLWM6I0Y1QzQwMH0ubnQtZmx5Lm1rLWZhey0tYzojNENBRjUwfS5udC1mbHkubWstcGF7LS1jOiMyNTYzRUJ9Ci5udC1mbHkgaW1nLC5udC1mbHkgc3Bhbnt3aWR0aDoxMTBweDtoZWlnaHQ6MTEwcHg7Ym9yZGVyLXJhZGl1czoxMnB4O29iamVjdC1maXQ6Y292ZXI7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtmb250LXNpemU6NDhweDtiYWNrZ3JvdW5kOiNGMUY0RkF9Ci5udC1mbHkgYntmb250LWZhbWlseTp2YXIoLS1kaXNwbGF5KTtmb250LXNpemU6MjRweDtjb2xvcjojMEY3QjNGfQoubnQtZmx5IHNtYWxse2ZvbnQtc2l6ZToxMXB4O2ZvbnQtd2VpZ2h0OjcwMDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5udC1iZWxsLm50LWhpdHthbmltYXRpb246bnRIaXQgLjZzIGVhc2UsbnRCZWF0IDEuNnMgZWFzZS1pbi1vdXQgLjZzIGluZmluaXRlfQpAa2V5ZnJhbWVzIG50SGl0ezAle3RyYW5zZm9ybTpzY2FsZSgxKX0zMCV7dHJhbnNmb3JtOnNjYWxlKDEuMzUpIHJvdGF0ZSgtMTJkZWcpfTYwJXt0cmFuc2Zvcm06c2NhbGUoLjk1KSByb3RhdGUoOGRlZyl9MTAwJXt0cmFuc2Zvcm06c2NhbGUoMSl9fQovKiBGb3RvcyB5IGFyY2hpdm9zIGFkanVudG9zIGVuIGxvcyBjaGF0cyAqLwouYnViLWF0dHtkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7Z2FwOjZweDttYXJnaW46NHB4IDAgMnB4fQouYnViLWF0dCBpbWd7d2lkdGg6MTcwcHg7bWF4LXdpZHRoOjEwMCU7aGVpZ2h0OjE3MHB4O29iamVjdC1maXQ6Y292ZXI7Ym9yZGVyLXJhZGl1czoxMnB4O2Rpc3BsYXk6YmxvY2s7YmFja2dyb3VuZDojRUVGMUY2O2N1cnNvcjp6b29tLWluO3RyYW5zaXRpb246dHJhbnNmb3JtIC4xNXN9Ci5idWItYXR0IGltZzpob3Zlcnt0cmFuc2Zvcm06c2NhbGUoMS4wMyl9Ci5idWItZmlsZXtkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4O2JhY2tncm91bmQ6cmdiYSgyNTUsMjU1LDI1NSwuODUpO2NvbG9yOiMyRDMyNzc7Ym9yZGVyLXJhZGl1czoxMHB4O3BhZGRpbmc6NnB4IDEwcHg7Zm9udC13ZWlnaHQ6NzAwO2ZvbnQtc2l6ZToxM3B4O3RleHQtZGVjb3JhdGlvbjpub25lfQouYnViLWltZyBzcGFue2Rpc3BsYXk6bm9uZX0KLmJ1Yi1pbWcuYnJva2VuIGltZ3tkaXNwbGF5Om5vbmV9Ci5idWItaW1nLmJyb2tlbiBzcGFue2Rpc3BsYXk6aW5saW5lLWZsZXg7YmFja2dyb3VuZDpyZ2JhKDI1NSwyNTUsMjU1LC44NSk7Y29sb3I6IzJEMzI3Nztib3JkZXItcmFkaXVzOjEwcHg7cGFkZGluZzo2cHggMTBweDtmb250LXdlaWdodDo3MDA7Zm9udC1zaXplOjEzcHh9Ci8qIEJpbGxldGUgdmVyZGUgKHJlZW1wbGF6YSBsYSBjYW1wYW5hKSBjb24gbGF0aWRvIHZlcmRlICovCi5udC1iZWxsLm50LWNhc2h7d2lkdGg6NjRweDtoZWlnaHQ6NDRweDtib3JkZXItcmFkaXVzOjEycHg7YmFja2dyb3VuZDp0cmFuc3BhcmVudDtib3gtc2hhZG93Om5vbmU7YW5pbWF0aW9uOm50QmVhdCAxLjZzIGVhc2UtaW4tb3V0IGluZmluaXRlO2ZpbHRlcjpkcm9wLXNoYWRvdygwIDZweCAxMnB4IHJnYmEoMjIsMTYzLDc0LC4zNSkpfQoubnQtYmVsbC5udC1jYXNoIHN2Z3t3aWR0aDo2NHB4O2hlaWdodDozOHB4fQoubnQtYmVsbC5udC1jYXNoOjpiZWZvcmV7Ym9yZGVyLXJhZGl1czoxMnB4O2JvcmRlci1jb2xvcjojMjJDNTVFO2FuaW1hdGlvbjpudFJpbmdHIDEuNnMgZWFzZS1vdXQgaW5maW5pdGV9Ci5udC1iZWxsLm50LWNhc2guaGFzLC5udC1iZWxsLm50LWNhc2gub257YmFja2dyb3VuZDp0cmFuc3BhcmVudH0KLm50LWJlbGwubnQtY2FzaC5vbntmaWx0ZXI6ZHJvcC1zaGFkb3coMCAwIDAgIzIyQzU1RSkgZHJvcC1zaGFkb3coMCA2cHggMTRweCByZ2JhKDIyLDE2Myw3NCwuNTUpKX0KLm50LWJlbGwubnQtY2FzaCBie2JhY2tncm91bmQ6I0RDMjYyNjtjb2xvcjojZmZmO3RvcDotOHB4O3JpZ2h0Oi04cHh9CkBrZXlmcmFtZXMgbnRSaW5nR3swJXt0cmFuc2Zvcm06c2NhbGUoMSk7b3BhY2l0eTouNzU7Ym94LXNoYWRvdzowIDAgMCAwIHJnYmEoMzQsMTk3LDk0LC40NSl9NzAlLDEwMCV7dHJhbnNmb3JtOnNjYWxlKDEuMzUpO29wYWNpdHk6MDtib3gtc2hhZG93OjAgMCAwIDEwcHggcmdiYSgzNCwxOTcsOTQsMCl9fQoubnQtZmx5e3dpZHRoOjEyMHB4O3BhZGRpbmc6OHB4O2JvcmRlci1yYWRpdXM6MTZweDtib3gtc2hhZG93OjAgMTJweCAyOHB4IHJnYmEoMjAsMzAsNjAsLjI1KX0KLm50LWZseSBpbWcsLm50LWZseSBzcGFue3dpZHRoOjEwMHB4O2hlaWdodDoxMDBweH0KLm50LWZseSBie2NvbG9yOiMxNkEzNEE7Zm9udC1zaXplOjIycHh9Ci5udC1oYntkaXNwbGF5OmZsZXg7Z2FwOjZweH0KLm50LWNmZ3twYWRkaW5nOjEycHggMTZweDtib3JkZXItYm90dG9tOjFweCBzb2xpZCB2YXIoLS1saW5lKTtiYWNrZ3JvdW5kOiNGMEZERjQ7ZGlzcGxheTpncmlkO2dhcDo2cHh9Ci5udC1jZmcgc21hbGx7Y29sb3I6dmFyKC0tbXV0ZWQpfQoubnQtY2ZnIGRpdntkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7Z2FwOjZweCAxNHB4fQoubnQtY2ZnIGxhYmVse2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjZweDtmb250LXdlaWdodDo3MDA7Zm9udC1zaXplOjEzLjVweDtjdXJzb3I6cG9pbnRlcn0KLm50LXByaWNle2NvbG9yOiMxNkEzNEF9CkBtZWRpYSAobWF4LXdpZHRoOjc2MHB4KXsubnQtYmVsbC5udC1jYXNoe3dpZHRoOjU0cHg7aGVpZ2h0OjM4cHh9Lm50LWJlbGwubnQtY2FzaCBzdmd7d2lkdGg6NTRweDtoZWlnaHQ6MzJweH0ubnQtZmx5e3dpZHRoOjk2cHh9Lm50LWZseSBpbWcsLm50LWZseSBzcGFue3dpZHRoOjgwcHg7aGVpZ2h0OjgwcHh9fQovKiBQYW5lbCBkZSB2ZW50YXM6IG3DoXMgY29tcGFjdG8geSBzaW4gZGVzYm9yZGVzICovCi5udC1wYW5lbHt3aWR0aDozODBweDtvdmVyZmxvdzpoaWRkZW47Ym94LXNpemluZzpib3JkZXItYm94fQoubnQtcGFuZWwgKntib3gtc2l6aW5nOmJvcmRlci1ib3h9CkBtZWRpYSAobWluLXdpZHRoOjExMDBweCl7Ym9keS5udC1vbntwYWRkaW5nLXJpZ2h0OjM4MHB4fX0KLm50LWh7cGFkZGluZzoxNHB4IDkwcHggMTJweCAxNnB4fQoubnQtaCBie2ZvbnQtc2l6ZToxOXB4fS5udC1oIHNtYWxse2ZvbnQtc2l6ZToxMi41cHh9Ci5udC14e3dpZHRoOjMwcHg7aGVpZ2h0OjMwcHg7Zm9udC1zaXplOjE0cHh9Ci5udC1me2ZsZXgtd3JhcDpub3dyYXA7b3ZlcmZsb3cteDphdXRvO3Njcm9sbGJhci13aWR0aDpub25lO3BhZGRpbmc6OHB4IDEycHg7Z2FwOjVweH0KLm50LWY6Oi13ZWJraXQtc2Nyb2xsYmFye2Rpc3BsYXk6bm9uZX0KLm50LWYgYnV0dG9ue2ZsZXg6bm9uZTtwYWRkaW5nOjRweCAxMHB4O2ZvbnQtc2l6ZToxMnB4fQoubnQtbGlzdHtvdmVyZmxvdy14OmhpZGRlbjtwYWRkaW5nOjEwcHggMTJweCAzMHB4O2dhcDo4cHg7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOm1pbm1heCgwLDFmcil9Ci5udC1pdGVte21pbi13aWR0aDowO3BhZGRpbmc6MTBweCAxMnB4O2dhcDo0cHg7Ym9yZGVyLWxlZnQtd2lkdGg6NHB4fQoubnQtdG9we2ZvbnQtc2l6ZToxMS41cHg7ZmxleC13cmFwOm5vd3JhcDttaW4td2lkdGg6MH0KLm50LW1re3BhZGRpbmc6MXB4IDhweDt3aGl0ZS1zcGFjZTpub3dyYXB9Ci5udC1zZWxsZXJ7d2hpdGUtc3BhY2U6bm93cmFwO292ZXJmbG93OmhpZGRlbjt0ZXh0LW92ZXJmbG93OmVsbGlwc2lzO21pbi13aWR0aDowfQoubnQtYWdve3doaXRlLXNwYWNlOm5vd3JhcDtmbGV4Om5vbmV9Ci5udC1tYWlue2dhcDoxMHB4O21pbi13aWR0aDowfQoubnQtaW1ne3dpZHRoOjUycHg7aGVpZ2h0OjUycHg7Ym9yZGVyLXJhZGl1czoxMHB4fQoubnQtcHJvZHttaW4td2lkdGg6MDtmb250LXNpemU6MTNweDtsaW5lLWhlaWdodDoxLjN9Ci5udC1wcm9kIHNwYW57ZGlzcGxheTotd2Via2l0LWJveDstd2Via2l0LWxpbmUtY2xhbXA6Mjstd2Via2l0LWJveC1vcmllbnQ6dmVydGljYWw7b3ZlcmZsb3c6aGlkZGVufQoubnQtcHJvZCBzbWFsbHtmb250LXNpemU6MTEuNXB4fQoubnQtcHJpY2V7Zm9udC1zaXplOjE3cHg7ZmxleDpub25lfQoubnQtaWR7Zm9udC1zaXplOjExcHg7d2hpdGUtc3BhY2U6bm93cmFwO292ZXJmbG93OmhpZGRlbjt0ZXh0LW92ZXJmbG93OmVsbGlwc2lzfQpAbWVkaWEgKG1heC13aWR0aDo3NjBweCl7Lm50LXBhbmVse3dpZHRoOjEwMHZ3fX0KLm50LWJsa3tkaXNwbGF5OmJsb2NrO2ZvbnQtc2l6ZToxMXB4O2NvbG9yOiNEQzI2MjY7b3BhY2l0eTouNzt0ZXh0LWRlY29yYXRpb246bGluZS10aHJvdWdoO3RleHQtZGVjb3JhdGlvbi1jb2xvcjojREMyNjI2O2ZvbnQtd2VpZ2h0OjUwMDt3aGl0ZS1zcGFjZTpub3dyYXA7b3ZlcmZsb3c6aGlkZGVuO3RleHQtb3ZlcmZsb3c6ZWxsaXBzaXN9Ci8qIEZpbHRyb3M6IEFnZW5jaWEgeSBGbGV4IHNlcGFyYWRvcyB5IGNvbiBzdSBjb2xvciAqLwouY2hpcC1ncnB7ZGlzcGxheTppbmxpbmUtZmxleDtnYXA6NnB4O3BhZGRpbmc6M3B4O2JvcmRlcjoxcHggZGFzaGVkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6OTk5cHh9Ci5jaGlwLmNoaXAtbWwtYWdlbmNpYXtib3JkZXItY29sb3I6IzJEMzI3Nztjb2xvcjojMkQzMjc3fQouY2hpcC5jaGlwLW1sLWFnZW5jaWFbYXJpYS1wcmVzc2VkPSJ0cnVlIl17YmFja2dyb3VuZDojMkQzMjc3O2NvbG9yOiNGRkU2MDA7Ym9yZGVyLWNvbG9yOiMyRDMyNzd9Ci5jaGlwLmNoaXAtbWwtZmxleHtib3JkZXItY29sb3I6IzAwQTY1MDtjb2xvcjojMDA4NDNGfQouY2hpcC5jaGlwLW1sLWZsZXhbYXJpYS1wcmVzc2VkPSJ0cnVlIl17YmFja2dyb3VuZDojMDBBNjUwO2NvbG9yOiNmZmY7Ym9yZGVyLWNvbG9yOiMwMEE2NTB9Ci5jaGlwLmNoaXAtZmF7Ym9yZGVyLWNvbG9yOiM4REM2M0Y7Y29sb3I6IzRGN0YxMn0KLmNoaXAuY2hpcC1mYVthcmlhLXByZXNzZWQ9InRydWUiXXtiYWNrZ3JvdW5kOiM4REM2M0Y7Y29sb3I6I2ZmZjtib3JkZXItY29sb3I6IzhEQzYzRn0KLmNoaXAuY2hpcC1wYXtib3JkZXItY29sb3I6IzBCNUVENztjb2xvcjojMEI1RUQ3fQouY2hpcC5jaGlwLXBhW2FyaWEtcHJlc3NlZD0idHJ1ZSJde2JhY2tncm91bmQ6IzBCNUVENztjb2xvcjojZmZmO2JvcmRlci1jb2xvcjojMEI1RUQ3fQovKiBSZXN1bWVuIGRlIHBhcXVldGVzOiB0YXJqZXRhcyBwb3IgY2FuYWwsIG3DoXMgbGVnaWJsZSAqLwouc3N4Mi1oZWFke2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7ZmxleC13cmFwOndyYXA7Z2FwOjZweCAxMnB4O21hcmdpbi1ib3R0b206MTBweH0KLnNzeDItaGVhZCAuc3N4LXR7Zm9udC1zaXplOjE0cHh9Ci5zc3gye2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDQsbWlubWF4KDAsMWZyKSkgbWlubWF4KDAsMS4yNWZyKSBtaW5tYXgoMCwxZnIpO2dhcDoxMHB4fQouc3N4Mi1je3Bvc2l0aW9uOnJlbGF0aXZlO2JhY2tncm91bmQ6I2ZmZjtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTJweDtwYWRkaW5nOjEwcHggMTJweCAxMHB4O292ZXJmbG93OmhpZGRlbjttaW4td2lkdGg6MH0KLnNzeDItYzo6YmVmb3Jle2NvbnRlbnQ6IiI7cG9zaXRpb246YWJzb2x1dGU7aW5zZXQ6MCAwIGF1dG8gMDtoZWlnaHQ6NHB4O2JhY2tncm91bmQ6dmFyKC0tYyx2YXIoLS1saW5lKSl9Ci5zc3gyLW57Zm9udC1zaXplOjEycHg7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOnZhcigtLW11dGVkKTt3aGl0ZS1zcGFjZTpub3dyYXA7b3ZlcmZsb3c6aGlkZGVuO3RleHQtb3ZlcmZsb3c6ZWxsaXBzaXN9Ci5zc3gyLXZ7Zm9udC1zaXplOjI4cHg7Zm9udC13ZWlnaHQ6ODAwO2xpbmUtaGVpZ2h0OjEuMTU7Y29sb3I6dmFyKC0taW5rKTtmb250LXZhcmlhbnQtbnVtZXJpYzp0YWJ1bGFyLW51bXM7bWFyZ2luOjJweCAwIDRweH0KLnNzeDItY3V0e2Rpc3BsYXk6aW5saW5lLWJsb2NrO2ZvbnQtc2l6ZToxMnB4O2NvbG9yOnZhcigtLWluayk7YmFja2dyb3VuZDpjb2xvci1taXgoaW4gc3JnYix2YXIoLS1jKSAxMiUsI2ZmZik7Ym9yZGVyLXJhZGl1czo5OTlweDtwYWRkaW5nOjJweCA5cHg7d2hpdGUtc3BhY2U6bm93cmFwfQouc3N4Mi1jdXQgYntmb250LXdlaWdodDo4MDB9Ci5zc3gyLWN1dC5ub25le2JhY2tncm91bmQ6I2YyZjRmNztjb2xvcjp2YXIoLS1tdXRlZCl9Ci5zc3gyLXRvdHstLWM6dmFyKC0tYWNjZW50KTtiYWNrZ3JvdW5kOmNvbG9yLW1peChpbiBzcmdiLHZhcigtLWFjY2VudCkgNSUsI2ZmZil9Ci5zc3gyLXRvdCAuc3N4Mi12e2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQouc3N4Mi1iYXJ7aGVpZ2h0OjZweDtib3JkZXItcmFkaXVzOjk5cHg7YmFja2dyb3VuZDojZThlZGYzO292ZXJmbG93OmhpZGRlbjttYXJnaW46MnB4IDAgNXB4fQouc3N4Mi1iYXIgaXtkaXNwbGF5OmJsb2NrO2hlaWdodDoxMDAlO2JhY2tncm91bmQ6dmFyKC0tYWNjZW50KTtib3JkZXItcmFkaXVzOjk5cHh9Ci5zc3gyLXN1Yntmb250LXNpemU6MTJweDtjb2xvcjp2YXIoLS1tdXRlZCk7d2hpdGUtc3BhY2U6bm93cmFwO292ZXJmbG93OmhpZGRlbjt0ZXh0LW92ZXJmbG93OmVsbGlwc2lzfQouc3N4Mi1zdWIgYntjb2xvcjp2YXIoLS1pbmspfQouc3N4Mi1hbGx7LS1jOiM5OEEyQjN9Ci5zc3gyLWFsbCAuc3N4Mi12e2NvbG9yOnZhcigtLW11dGVkKX0KQG1lZGlhIChtYXgtd2lkdGg6MTEwMHB4KXsuc3N4MntncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDMsbWlubWF4KDAsMWZyKSl9fQpAbWVkaWEgKG1heC13aWR0aDo2MjBweCl7LnNzeDJ7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgyLG1pbm1heCgwLDFmcikpO2dhcDo4cHh9LnNzeDItdntmb250LXNpemU6MjRweH0uc3N4Mi1oZWFkIC5zc3gtcnttYXJnaW4tbGVmdDowfX0KLyogdGFibGEgcG9yIGN1ZW50YTogZW5jYWJlemFkb3MgY29uIGVsIGNvbG9yIGRlIGNhZGEgY2FuYWwgKi8KLnNzLXRhYmxlIHRoLnNzLWdycHtib3JkZXItYm90dG9tOjNweCBzb2xpZCB2YXIoLS1nYyx2YXIoLS1saW5lKSl9CkBtZWRpYSAobWF4LXdpZHRoOjYyMHB4KXsuc3N4Mi1zdWJ7d2hpdGUtc3BhY2U6bm9ybWFsfX0KLyogdmVyc2nDs24gY29tcGFjdGE6IHRhcmpldGFzIGNoaWNhcyBlbiB1bmEgbMOtbmVhICovCi5zc3gyLWhlYWR7bWFyZ2luLWJvdHRvbTo2cHh9Ci5zc3gyLWhlYWQgLnNzeC10e2ZvbnQtc2l6ZToxM3B4fQouc3N4MntkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7Z2FwOjZweH0KLnNzeDItY3tkaXNwbGF5OmdyaWQ7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOmF1dG8gYXV0bztncmlkLXRlbXBsYXRlLWFyZWFzOiJuIHYiICJ4IHgiO2FsaWduLWl0ZW1zOmNlbnRlcjtjb2x1bW4tZ2FwOjhweDtyb3ctZ2FwOjFweDtwYWRkaW5nOjVweCAxMHB4IDVweCAxMnB4O2JvcmRlci1yYWRpdXM6OXB4O2ZsZXg6MCAxIGF1dG99Ci5zc3gyLWM6OmJlZm9yZXtpbnNldDowIGF1dG8gMCAwO3dpZHRoOjRweDtoZWlnaHQ6YXV0b30KLnNzeDItbntncmlkLWFyZWE6bjtmb250LXNpemU6MTEuNXB4fQouc3N4Mi12e2dyaWQtYXJlYTp2O2ZvbnQtc2l6ZToxN3B4O21hcmdpbjowO2p1c3RpZnktc2VsZjplbmQ7bGluZS1oZWlnaHQ6MS4xfQouc3N4Mi1jdXQsLnNzeDItc3Vie2dyaWQtYXJlYTp4O2ZvbnQtc2l6ZToxMXB4O3BhZGRpbmc6MDtiYWNrZ3JvdW5kOm5vbmUhaW1wb3J0YW50O3doaXRlLXNwYWNlOm5vd3JhcH0KLnNzeDItY3V0Lm5vbmV7Y29sb3I6dmFyKC0tbXV0ZWQpfQouc3N4Mi1iYXJ7ZGlzcGxheTpub25lfQouc3N4Mi10b3QsLnNzeDItYWxse21hcmdpbi1sZWZ0OjB9CkBtZWRpYSAobWF4LXdpZHRoOjExMDBweCl7LnNzeDJ7ZGlzcGxheTpmbGV4fX0KQG1lZGlhIChtYXgtd2lkdGg6NjIwcHgpey5zc3gye2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDIsbWlubWF4KDAsMWZyKSk7Z2FwOjVweH0uc3N4Mi12e2ZvbnQtc2l6ZToxNnB4fS5zc3gyLWN7cGFkZGluZzo0cHggOHB4IDRweCAxMHB4fS5zc3gyLXN1Ynt3aGl0ZS1zcGFjZTpub3dyYXB9fQpAbWVkaWEgKG1heC13aWR0aDo2MjBweCl7LnNzeDItbntmb250LXNpemU6MTFweH19Ci8qIGHDum4gbcOhcyBjaGljbzogZGF0byBpbmZvcm1hdGl2byAqLwouc3N4Mi1oZWFke21hcmdpbi1ib3R0b206NHB4O2dhcDo0cHggMTBweH0KLnNzeDItaGVhZCAuc3N4LXR7Zm9udC1zaXplOjEycHh9Ci5zc3gyLWhlYWQgLnNzeC1tb3Jle2ZvbnQtc2l6ZToxMXB4O3BhZGRpbmc6MXB4IDNweH0KLnNzeDItaGVhZCAuc3N4LXN3IGJ1dHRvbntmb250LXNpemU6MTFweDtwYWRkaW5nOjJweCA3cHh9Ci5zc3gye2dhcDo0cHh9Ci5zc3gyLWN7cGFkZGluZzoycHggN3B4IDJweCA5cHg7Ym9yZGVyLXJhZGl1czo3cHg7Y29sdW1uLWdhcDo2cHg7cm93LWdhcDowfQouc3N4Mi1jOjpiZWZvcmV7d2lkdGg6M3B4fQouc3N4Mi1ue2ZvbnQtc2l6ZToxMC41cHh9Ci5zc3gyLXZ7Zm9udC1zaXplOjEzcHh9Ci5zc3gyLWN1dCwuc3N4Mi1zdWJ7Zm9udC1zaXplOjEwcHh9CkBtZWRpYSAobWF4LXdpZHRoOjYyMHB4KXsuc3N4MntnYXA6M3B4fS5zc3gyLXZ7Zm9udC1zaXplOjEyLjVweH0uc3N4Mi1ue2ZvbnQtc2l6ZToxMHB4fS5zc3gyLWN7cGFkZGluZzoycHggNnB4IDJweCA4cHh9fQpAbWVkaWEgKG1heC13aWR0aDo2MjBweCl7LnNzeDJ7ZGlzcGxheTpmbGV4O2ZsZXgtd3JhcDp3cmFwfS5zc3gyLWN7ZmxleDoxIDEgYXV0b319CkBtZWRpYSAobWF4LXdpZHRoOjYyMHB4KXsuc3N4Mi1je2ZsZXg6MCAxIGF1dG99fQovKiBQYXF1ZXRlczogc29sbyDDrWNvbm9zLCB1bmEgbMOtbmVhICovCi5zc3gyLWhlYWR7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtmbGV4LXdyYXA6d3JhcDtnYXA6NHB4IDhweDttYXJnaW4tYm90dG9tOjB9Ci5zc3gyLWhlYWQgLnNzeC10e2ZvbnQtc2l6ZToxMS41cHg7Zm9udC13ZWlnaHQ6ODAwO2NvbG9yOnZhcigtLW11dGVkKX0KLnNzeDN7ZGlzcGxheTppbmxpbmUtZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6M3B4O2FsaWduLWl0ZW1zOmNlbnRlcn0KLnNzeDMtY3tkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmJhc2VsaW5lO2dhcDozcHg7Zm9udC1zaXplOjExcHg7bGluZS1oZWlnaHQ6MTtwYWRkaW5nOjNweCA2cHggM3B4IDVweDtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1sZWZ0OjNweCBzb2xpZCB2YXIoLS1jLHZhcigtLWxpbmUpKTtib3JkZXItcmFkaXVzOjZweDtiYWNrZ3JvdW5kOiNmZmY7d2hpdGUtc3BhY2U6bm93cmFwO2N1cnNvcjpkZWZhdWx0fQouc3N4My1jIGJ7Zm9udC1zaXplOjEycHg7Zm9udC13ZWlnaHQ6ODAwO2NvbG9yOnZhcigtLWluayk7Zm9udC12YXJpYW50LW51bWVyaWM6dGFidWxhci1udW1zfQouc3N4My1jIHNtYWxse2ZvbnQtc2l6ZTo5LjVweDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5zc3gzLXRvdHstLWM6dmFyKC0tYWNjZW50KX0uc3N4My10b3QgYntjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KLnNzeDMtYWxsey0tYzojOThBMkIzfS5zc3gzLWFsbCBie2NvbG9yOnZhcigtLW11dGVkKX0KQG1lZGlhIChtYXgtd2lkdGg6NjIwcHgpey5zc3gyLWhlYWQgLnNzeC1ye21hcmdpbi1sZWZ0OjB9LnNzeDMtY3twYWRkaW5nOjJweCA1cHggMnB4IDRweH19Ci8qIENhbGN1bGFkb3IgZGUgZ2FuYW5jaWEgKi8KLnBmLWJhcntkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7Z2FwOjhweDthbGlnbi1pdGVtczpjZW50ZXI7bWFyZ2luLWJvdHRvbTo4cHh9Ci5wZi1iYXIgaW5wdXRbdHlwZT1zZWFyY2hde2ZsZXg6MSAxIDE4MHB4O21pbi13aWR0aDowO21heC13aWR0aDozMjBweH0KLnBmLXRhYnN7ZGlzcGxheTppbmxpbmUtZmxleDtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTBweDtvdmVyZmxvdzpoaWRkZW59Ci5wZi10YWJzIGJ1dHRvbntib3JkZXI6MDtiYWNrZ3JvdW5kOiNmZmY7cGFkZGluZzo2cHggMTJweDtmb250OmluaGVyaXQ7Zm9udC1zaXplOjEzcHg7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOnZhcigtLW11dGVkKTtjdXJzb3I6cG9pbnRlcjtkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4fQoucGYtdGFicyBidXR0b25bYXJpYS1wcmVzc2VkPSJ0cnVlIl17YmFja2dyb3VuZDp2YXIoLS1hY2NlbnQpO2NvbG9yOiNmZmZ9Ci5wZi1zdW17Zm9udC1zaXplOjEyLjVweDtjb2xvcjp2YXIoLS1tdXRlZCk7bWFyZ2luOjJweCAycHggOHB4fQoucGYtc3VtIGJ7Y29sb3I6dmFyKC0taW5rKX0KLnBmLXN1bSAubmVne2NvbG9yOiNDNjI4Mjh9Ci5wZi13cmFwe21heC1oZWlnaHQ6NjIwcHg7b3ZlcmZsb3c6YXV0bztib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTBweH0KLnBmLXRhYmxle3dpZHRoOjEwMCU7Ym9yZGVyLWNvbGxhcHNlOmNvbGxhcHNlO2ZvbnQtc2l6ZToxMi41cHh9Ci5wZi10YWJsZSB0aHtwb3NpdGlvbjpzdGlja3k7dG9wOjA7YmFja2dyb3VuZDojRjZGOEZCO3otaW5kZXg6MTtmb250LXNpemU6MTFweDt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7bGV0dGVyLXNwYWNpbmc6LjAzZW07Y29sb3I6dmFyKC0tbXV0ZWQpO3BhZGRpbmc6N3B4IDhweDt0ZXh0LWFsaWduOmxlZnQ7d2hpdGUtc3BhY2U6bm93cmFwfQoucGYtdGFibGUgdGgubnVtLC5wZi10YWJsZSB0ZC5udW17dGV4dC1hbGlnbjpyaWdodH0KLnBmLXRhYmxlIHRke3BhZGRpbmc6NnB4IDhweDtib3JkZXItdG9wOjFweCBzb2xpZCB2YXIoLS1saW5lKTt2ZXJ0aWNhbC1hbGlnbjptaWRkbGU7d2hpdGUtc3BhY2U6bm93cmFwfQoucGYtdGFibGUgdGQgc21hbGx7ZGlzcGxheTpibG9jaztmb250LXNpemU6MTAuNXB4O2NvbG9yOnZhcigtLW11dGVkKTttYXJnaW4tdG9wOjFweH0KLnBmLXByb2R7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6OHB4O21pbi13aWR0aDoyMjBweDttYXgtd2lkdGg6MzYwcHg7d2hpdGUtc3BhY2U6bm9ybWFsfQoucGYtcHJvZCBpbWd7d2lkdGg6MzRweDtoZWlnaHQ6MzRweDtvYmplY3QtZml0OmNvdmVyO2JvcmRlci1yYWRpdXM6NnB4O2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7ZmxleDpub25lfQoucGYtcHJvZCBie2Rpc3BsYXk6LXdlYmtpdC1ib3g7LXdlYmtpdC1saW5lLWNsYW1wOjI7LXdlYmtpdC1ib3gtb3JpZW50OnZlcnRpY2FsO292ZXJmbG93OmhpZGRlbjtmb250LXdlaWdodDo2MDA7Zm9udC1zaXplOjEyLjVweDtsaW5lLWhlaWdodDoxLjI1fQoucGYtcHJvZCBzbWFsbHt3aGl0ZS1zcGFjZTpub3JtYWx9Ci5wZi1pbntmb250OmluaGVyaXQ7Zm9udC1zaXplOjEyLjVweDtwYWRkaW5nOjRweCA2cHg7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjZweDt0ZXh0LWFsaWduOnJpZ2h0O2JhY2tncm91bmQ6I0ZGRkRGNX0KLnBmLWluOmZvY3Vze291dGxpbmU6MnB4IHNvbGlkIHZhcigtLWFjY2VudCk7Ym9yZGVyLWNvbG9yOnZhcigtLWFjY2VudCl9Ci5wZi10YWJsZSB0ZCBzbWFsbCAucGYtaW57ZGlzcGxheTppbmxpbmUtYmxvY2s7cGFkZGluZzoxcHggNHB4O2ZvbnQtc2l6ZToxMXB4O21hcmdpbi10b3A6MnB4fQoucGYtcmVzIGJ7Zm9udC1zaXplOjEzLjVweH0KLnBmLXJvdy5vayAucGYtcmVzIGJ7Y29sb3I6IzFCN0YzQn0ucGYtcm93LmxvdyAucGYtcmVzIGJ7Y29sb3I6I0IyNkEwMH0ucGYtcm93Lm5lZyAucGYtcmVzIGJ7Y29sb3I6I0M2MjgyOH0KLnBmLXJvdy5uZWd7YmFja2dyb3VuZDojRkZGNUY1fQoucGYtbm90ZXtmb250LXNpemU6MTEuNXB4O21hcmdpbjoxMHB4IDJweCAwO2xpbmUtaGVpZ2h0OjEuNX0KLnBmLWVycntjb2xvcjojQjI2QTAwfQpAbWVkaWEgKG1heC13aWR0aDo2MjBweCl7LnBmLWJhciBpbnB1dFt0eXBlPXNlYXJjaF17bWF4LXdpZHRoOm5vbmV9LnBmLXByb2R7bWluLXdpZHRoOjE3MHB4fS5wZi10YWJsZXtmb250LXNpemU6MTJweH19Ci5wZi1sdHtkaXNwbGF5OmlubGluZS1ibG9jaztmb250LXNpemU6OS41cHg7Zm9udC13ZWlnaHQ6ODAwO3BhZGRpbmc6MCA1cHg7Ym9yZGVyLXJhZGl1czo0cHg7bGluZS1oZWlnaHQ6MTVweH0KLnBmLWx0LmNsYXtiYWNrZ3JvdW5kOiNGRkYzQzQ7Y29sb3I6IzdBNUIwMH0ucGYtbHQucHJve2JhY2tncm91bmQ6I0UzRUNGRjtjb2xvcjojMkQzMjc3fQovKiBjYWxjdWxhZG9yOiBwZXLDrW9kbyB5IHRvdGFsZXMgKi8KLnBmLXBlcntkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo2cHggOHB4O21hcmdpbjoycHggMCA4cHh9Ci5wZi1wZXItbHtmb250LXNpemU6MTJweDtmb250LXdlaWdodDo3MDA7Y29sb3I6dmFyKC0tbXV0ZWQpfQoucGYtcHRhYnMgYnV0dG9ue3BhZGRpbmc6NHB4IDEwcHg7Zm9udC1zaXplOjEycHh9Ci5wZi1wZXIgaW5wdXRbdHlwZT1tb250aF0sLnBmLXBlciBpbnB1dFt0eXBlPWRhdGVde3dpZHRoOmF1dG87cGFkZGluZzo0cHggOHB4O2ZvbnQtc2l6ZToxMi41cHh9Ci5wZi1wZXItZHtmb250LXNpemU6MTJweH0KLnBmLWtwaXN7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoNCxtaW5tYXgoMCwxZnIpKTtnYXA6OHB4O21hcmdpbi1ib3R0b206OHB4fQoucGYta3Bpcz5kaXZ7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjEwcHg7cGFkZGluZzo3cHggMTBweDtiYWNrZ3JvdW5kOiNmZmY7bWluLXdpZHRoOjB9Ci5wZi1rcGlzIHNtYWxse2Rpc3BsYXk6YmxvY2s7Zm9udC1zaXplOjExcHg7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtd2VpZ2h0OjcwMH0KLnBmLWtwaXMgYntmb250LXNpemU6MTdweDtmb250LXZhcmlhbnQtbnVtZXJpYzp0YWJ1bGFyLW51bXN9Ci5wZi1rcGlzIHNwYW57ZGlzcGxheTpibG9jaztmb250LXNpemU6MTAuNXB4O2NvbG9yOnZhcigtLW11dGVkKX0KLnBmLWtwaXMgLnBvcyBie2NvbG9yOiMxQjdGM0J9LnBmLWtwaXMgLm5lZyBie2NvbG9yOiNDNjI4Mjh9Ci5wZi10YWJsZSB0ZC5wZi10b3R7YmFja2dyb3VuZDojRkFGQ0ZGfQpAbWVkaWEgKG1heC13aWR0aDo2MjBweCl7LnBmLWtwaXN7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgyLG1pbm1heCgwLDFmcikpfS5wZi1rcGlzIGJ7Zm9udC1zaXplOjE1cHh9fQoucGYtcHRhYnN7bWF4LXdpZHRoOjEwMCU7b3ZlcmZsb3cteDphdXRvfS5wZi1wdGFicyBidXR0b257d2hpdGUtc3BhY2U6bm93cmFwfQoucGYtcmV0e21hcmdpbi10b3A6MTJweDtib3JkZXItdG9wOjFweCBkYXNoZWQgdmFyKC0tbGluZSk7cGFkZGluZy10b3A6MTBweH0KLnBmLXJldC1oe2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6NHB4IDEwcHg7YWxpZ24taXRlbXM6YmFzZWxpbmU7bWFyZ2luLWJvdHRvbTo2cHg7Zm9udC1zaXplOjEzcHh9Ci5wZi1yZXQtbWt7Zm9udC1zaXplOjExLjVweCFpbXBvcnRhbnQ7bGluZS1oZWlnaHQ6MS42O2NvbG9yOnZhcigtLWluaykhaW1wb3J0YW50fQoucGYtcmV0LW1rIC5kb3R7ZGlzcGxheTppbmxpbmUtYmxvY2s7d2lkdGg6OHB4O2hlaWdodDo4cHg7Ym9yZGVyLXJhZGl1czoycHg7bWFyZ2luLXJpZ2h0OjRweH0KLnBmLWtwaXMgLnBmLXJldC1tayBie2ZvbnQtc2l6ZToxMnB4fQoucGYtcmV0IC5wZi1rcGlze2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoNSxtaW5tYXgoMCwxZnIpKX0KLnBmLWtwaXMgc3BhbiBie2ZvbnQtc2l6ZTppbmhlcml0fQpAbWVkaWEgKG1heC13aWR0aDo5MDBweCl7LnBmLXJldCAucGYta3Bpc3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDMsbWlubWF4KDAsMWZyKSl9fQpAbWVkaWEgKG1heC13aWR0aDo2MjBweCl7LnBmLXJldCAucGYta3Bpc3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDIsbWlubWF4KDAsMWZyKSl9fQouc2FsZXMtcGVye21hcmdpbjo2cHggMCAxMHB4fQoucGYtcmV2e2JvcmRlcjoxcHggZGFzaGVkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTBweDtwYWRkaW5nOjhweCAxMHB4O21hcmdpbi10b3A6MnB4O2ZvbnQtc2l6ZToxMi41cHh9Ci5wZi1yZXYtcm93e2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6NnB4IDIycHg7bWFyZ2luLXRvcDo2cHg7YWxpZ24taXRlbXM6Y2VudGVyfQoucGYtcmV2LXJvdyBpbnB1dHtwYWRkaW5nOjNweCA4cHg7Zm9udC1zaXplOjEyLjVweH0KLnBmLWtwaXMgc3BhbitzcGFue21hcmdpbi10b3A6MnB4fQoucGYtcmV0IC5wZi1rcGlze2dyaWQtdGVtcGxhdGUtY29sdW1uczptaW5tYXgoMCwuOGZyKSBtaW5tYXgoMCwxZnIpIG1pbm1heCgwLDEuM2ZyKSBtaW5tYXgoMCwxLjZmcil9Ci5wZi1rcGlzIGIubmVnY3tjb2xvcjojQzYyODI4fQoucGYtcmV0LW1re2ZvbnQtc2l6ZToxMi41cHg7bGluZS1oZWlnaHQ6MS4zNTttYXJnaW4tdG9wOjRweH0KLnBmLXJldC1sb3N0e2NvbG9yOiNDNjI4Mjg7Zm9udC1zaXplOjEycHg7cGFkZGluZy1sZWZ0OjE0cHh9Ci5wZi1yZXQtbG9zdCBie2ZvbnQtc2l6ZToxMi41cHghaW1wb3J0YW50fQoucGYtcmV0LW1rIGJ7Zm9udC1zaXplOjEyLjVweH0KQG1lZGlhIChtYXgtd2lkdGg6OTAwcHgpey5wZi1yZXQgLnBmLWtwaXN7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgyLG1pbm1heCgwLDFmcikpfX0KQG1lZGlhIChtYXgtd2lkdGg6NjIwcHgpey5wZi1yZXQgLnBmLWtwaXN7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOm1pbm1heCgwLDFmcil9fQoud2FybnRhZ3tkaXNwbGF5OmlubGluZS1ibG9jaztiYWNrZ3JvdW5kOiNmZmY0ZDY7Y29sb3I6IzhhNWEwMDtmb250LXdlaWdodDo3MDA7Zm9udC1zaXplOjEycHg7Ym9yZGVyLXJhZGl1czo2cHg7cGFkZGluZzoycHggOHB4O21hcmdpbjoycHggMH0KLnRiLXdhcm4gLnRiLWlje2JhY2tncm91bmQ6I2ZmZjRkNjtjb2xvcjojOGE1YTAwfQoudGIudGItYWxlcnQgLnRiLWlje2FuaW1hdGlvbjp0YlB1bHNlIDEuNnMgZWFzZS1pbi1vdXQgaW5maW5pdGV9CkBrZXlmcmFtZXMgdGJQdWxzZXswJSwxMDAle3RyYW5zZm9ybTpzY2FsZSgxKX01MCV7dHJhbnNmb3JtOnNjYWxlKDEuMTIpfX0KQG1lZGlhIChwcmVmZXJzLXJlZHVjZWQtbW90aW9uOnJlZHVjZSl7LnRiLnRiLWFsZXJ0IC50Yi1pY3thbmltYXRpb246bm9uZX19Cg==","app.js":"LyogRXRpcXVldGFIdWIg4oCUIGludGVyZmF6ICovCigoKSA9PiB7CmNvbnN0ICQgPSAocywgZWwgPSBkb2N1bWVudCkgPT4gZWwucXVlcnlTZWxlY3RvcihzKTsKY29uc3QgJCQgPSAocywgZWwgPSBkb2N1bWVudCkgPT4gWy4uLmVsLnF1ZXJ5U2VsZWN0b3JBbGwocyldOwpjb25zdCBlc2MgPSBzID0+IFN0cmluZyhzID8/ICcnKS5yZXBsYWNlKC9bJjw+IiddL2csIGMgPT4gKHsgJyYnOiAnJmFtcDsnLCAnPCc6ICcmbHQ7JywgJz4nOiAnJmd0OycsICciJzogJyZxdW90OycsICInIjogJyYjMzk7JyB9W2NdKSk7CmNvbnN0IE1LID0geyBtbDogJ01lcmNhZG8gTGlicmUnLCBmYTogJ0ZhbGFiZWxsYScsIHBhOiAnUGFyaXMnIH07CmNvbnN0IFNUQVRFID0geyByZWFkeTogJ0V0aXF1ZXRhIHBvciBpbXByaW1pcicsIHdhaXRpbmc6ICdFc3BlcmFuZG8gZXRpcXVldGEnLCBibG9ja2VkOiAnQmxvcXVlYWRhJywgcHJpbnRlZDogJ0V0aXF1ZXRhIGltcHJlc2EnLCBzaGlwcGVkOiAnRW52aWFkYScsIGVycm9yOiAnRXJyb3IgZW4gZXRpcXVldGEnLCBjYW5jZWxsZWQ6ICdDYW5jZWxhZGEnIH07CmNvbnN0IHN0b3JlID0geyBnZXQoaywgZCkgeyB0cnkgeyBjb25zdCB2ID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2VoOicgKyBrKTsgcmV0dXJuIHYgPT0gbnVsbCA/IGQgOiBKU09OLnBhcnNlKHYpOyB9IGNhdGNoIHsgcmV0dXJuIGQ7IH0gfSwgc2V0KGssIHYpIHsgdHJ5IHsgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2VoOicgKyBrLCBKU09OLnN0cmluZ2lmeSh2KSk7IH0gY2F0Y2gge30gfSB9OwoKY29uc3QgSSA9IHsKICBsb2NrOiAnPHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjIuMiI+PHJlY3QgeD0iNSIgeT0iMTEiIHdpZHRoPSIxNCIgaGVpZ2h0PSIxMCIgcng9IjIiLz48cGF0aCBkPSJNOCAxMVY4YTQgNCAwIDAxOCAwdjMiLz48L3N2Zz4nLAogIGNoZWNrOiAnPHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjMiPjxwYXRoIGQ9Ik01IDEybDUgNSA5LTEwIi8+PC9zdmc+JywKICBwcmludDogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyLjIiPjxwYXRoIGQ9Ik03IDlWM2gxMHY2TTcgMTdINHYtN2gxNnY3aC0zIi8+PHJlY3QgeD0iNyIgeT0iMTQiIHdpZHRoPSIxMCIgaGVpZ2h0PSI3Ii8+PC9zdmc+JywKICBjbG9jazogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyLjIiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjkiLz48cGF0aCBkPSJNMTIgN3Y1bDMgMiIvPjwvc3ZnPicsCiAgd2FybjogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyLjIiPjxwYXRoIGQ9Ik0xMiAzbDEwIDE4SDJ6Ii8+PHBhdGggZD0iTTEyIDEwdjVNMTIgMTh2LjUiLz48L3N2Zz4nLAogIGRvd246ICc8c3ZnIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMi40Ij48cGF0aCBkPSJNMTIgNHYxMW0wIDBsLTUtNW01IDVsNS01TTUgMjBoMTQiLz48L3N2Zz4nLAogIHN5bmM6ICc8c3ZnIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMi4yIj48cGF0aCBkPSJNMjAgMTFhOCA4IDAgMDAtMTQuOS0zTTQgNXY0aDRNNCAxM2E4IDggMCAwMDE0LjkgM00yMCAxOXYtNGgtNCIvPjwvc3ZnPicsCiAgeDogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiB3aWR0aD0iMTQiIGhlaWdodD0iMTQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjIuNiI+PHBhdGggZD0iTTYgNmwxMiAxMk0xOCA2TDYgMTgiLz48L3N2Zz4nLAogIGJveDogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIj48cmVjdCB4PSIzIiB5PSI0IiB3aWR0aD0iMTgiIGhlaWdodD0iMTYiIHJ4PSIzIi8+PHBhdGggZD0iTTMgOWgxOCIvPjwvc3ZnPicsCn07CmNvbnN0IHBpbGxJY29uID0geyBzaGlwcGVkOiBJLmNoZWNrLCByZWFkeTogSS5jaGVjaywgYmxvY2tlZDogSS5sb2NrLCBwcmludGVkOiBJLnByaW50LCB3YWl0aW5nOiBJLmNsb2NrLCBlcnJvcjogSS53YXJuLCBjYW5jZWxsZWQ6IEkueCB9OwoKbGV0IG1lID0gbnVsbCwgdGFiID0gbnVsbCwgb3JkZXJzID0gW10sIHNlbGxlcnMgPSBbXSwgc2VsZWN0ZWQgPSBuZXcgU2V0KCksIGtub3duUmVhZHkgPSBuZXcgU2V0KCksIGZpcnN0TG9hZCA9IHRydWU7CmNvbnN0IHVpID0geyBicGY6ICdhbGwnLCBiZGY6ICdhbGwnLCB1ZGY6ICdhbGwnLCB1YmY6ICdhbGwnLCBiYmY6ICdhbGwnLCBzaGlwRGF5OiAndG9kYXknLCB0YWI6ICd0b2RheScsIG1rOiAnYWxsJywgc2VsbGVyczogbmV3IFNldCgpLCBxOiAnJywgYWRtaW5TZWxsZXI6IHN0b3JlLmdldCgnYWRtaW5TZWxsZXInLCBudWxsKSB9OwoKZnVuY3Rpb24gdG9hc3QobXNnLCBtcyA9IDI4MDApIHsgY29uc3QgdCA9ICQoJyN0b2FzdCcpOyB0LnRleHRDb250ZW50ID0gbXNnOyB0LmhpZGRlbiA9IGZhbHNlOyBjbGVhclRpbWVvdXQodC5fdCk7IHQuX3QgPSBzZXRUaW1lb3V0KCgpID0+IHQuaGlkZGVuID0gdHJ1ZSwgbXMpOyB9Ci8vIE1pZW50cmFzIGxhIGFwcCBzZSBhY3R1YWxpemEgKHVub3Mgc2VndW5kb3MgYWwgcHVibGljYXIgdW5hIHZlcnNpw7NuIG51ZXZhKSBlbCBzZXJ2aWRvciByZXNwb25kZSA1MDMgInVwZGF0aW5nIjoKLy8gc2UgZXNwZXJhIHkgc2UgcmVpbnRlbnRhIHNvbGEsIGFzw60gbmFkYSBkZSBsbyBxdWUgaGFnYXMgc2UgcGllcmRlLgphc3luYyBmdW5jdGlvbiBzYWZlRmV0Y2gocGF0aCwgb3B0cykgewogIGNvbnN0IHQwID0gRGF0ZS5ub3coKTsgbGV0IHdhcm5lZCA9IGZhbHNlOwogIGZvciAoOzspIHsKICAgIGxldCByZXM7CiAgICB0cnkgeyByZXMgPSBhd2FpdCBmZXRjaChwYXRoLCBvcHRzKTsgfQogICAgY2F0Y2ggKGUpIHsgaWYgKERhdGUubm93KCkgLSB0MCA+IDE4MGUzKSB0aHJvdyBuZXcgRXJyb3IoJ1NpbiBjb25leGnDs24gY29uIGxhIGFwcCwgaW50ZW50YSBkZSBudWV2bycpOyBhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgNDAwMCkpOyBjb250aW51ZTsgfQogICAgaWYgKHJlcy5zdGF0dXMgPT09IDUwMyAmJiByZXMuaGVhZGVycy5nZXQoJ3gtZWgtdXBkYXRpbmcnKSAmJiBEYXRlLm5vdygpIC0gdDAgPCAxODBlMykgewogICAgICBpZiAoIXdhcm5lZCkgeyB3YXJuZWQgPSB0cnVlOyB0cnkgeyB0b2FzdCgnTGEgYXBwIHNlIGVzdMOhIGFjdHVhbGl6YW5kb+KApiB0dSBhY2Npw7NuIHNlIGhhcsOhIHNvbGEgZW4gdW5vcyBzZWd1bmRvcycsIDYwMDApOyB9IGNhdGNoIHt9IH0KICAgICAgYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDQwMDApKTsgY29udGludWU7CiAgICB9CiAgICByZXR1cm4gcmVzOwogIH0KfQphc3luYyBmdW5jdGlvbiBhcGkocGF0aCwgb3B0cyA9IHt9KSB7CiAgY29uc3QgcmVzID0gYXdhaXQgc2FmZUZldGNoKHBhdGgsIHsgY3JlZGVudGlhbHM6ICdzYW1lLW9yaWdpbicsIC4uLm9wdHMsIGhlYWRlcnM6IHsgJ2NvbnRlbnQtdHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJywgLi4uKG9wdHMuaGVhZGVycyB8fCB7fSkgfSwgYm9keTogb3B0cy5ib2R5ICYmIHR5cGVvZiBvcHRzLmJvZHkgIT09ICdzdHJpbmcnID8gSlNPTi5zdHJpbmdpZnkob3B0cy5ib2R5KSA6IG9wdHMuYm9keSB9KTsKICBpZiAocmVzLnN0YXR1cyA9PT0gNDAxICYmICFwYXRoLmluY2x1ZGVzKCcvbG9naW4nKSkgeyBtZSA9IG51bGw7IHJlbmRlckxvZ2luKCk7IHRocm93IG5ldyBFcnJvcignU2VzacOzbiB2ZW5jaWRhJyk7IH0KICBjb25zdCBjdCA9IHJlcy5oZWFkZXJzLmdldCgnY29udGVudC10eXBlJykgfHwgJyc7CiAgaWYgKCFyZXMub2spIHsgY29uc3QgZSA9IGN0LmluY2x1ZGVzKCdqc29uJykgPyAoYXdhaXQgcmVzLmpzb24oKSkuZXJyb3IgOiBhd2FpdCByZXMudGV4dCgpOyB0aHJvdyBuZXcgRXJyb3IoZSB8fCAnRXJyb3InKTsgfQogIHJldHVybiBjdC5pbmNsdWRlcygnanNvbicpID8gcmVzLmpzb24oKSA6IHJlczsKfQovLyByZWludGVudGEgc29sbyBjdWFuZG8gZmFsbGEgbGEgY29uZXhpw7NuIG8gZWwgc2Vydmlkb3IgZXN0w6Egb2N1cGFkbyAoNXh4KSwgbm8gY3VhbmRvIGVzIHVuIGVycm9yIHJlYWwgKDR4eCkKYXN5bmMgZnVuY3Rpb24gYXBpUmV0cnkocGF0aCwgb3B0cyA9IHt9LCB0cmllcyA9IDQpIHsKICBmb3IgKGxldCBpID0gMDsgOyBpKyspIHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHNhZmVGZXRjaChwYXRoLCB7IGNyZWRlbnRpYWxzOiAnc2FtZS1vcmlnaW4nLCAuLi5vcHRzLCBoZWFkZXJzOiB7ICdjb250ZW50LXR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSwgYm9keTogb3B0cy5ib2R5ICYmIHR5cGVvZiBvcHRzLmJvZHkgIT09ICdzdHJpbmcnID8gSlNPTi5zdHJpbmdpZnkob3B0cy5ib2R5KSA6IG9wdHMuYm9keSB9KTsKICAgICAgY29uc3QgY3QgPSByZXMuaGVhZGVycy5nZXQoJ2NvbnRlbnQtdHlwZScpIHx8ICcnOwogICAgICBpZiAocmVzLnN0YXR1cyA9PT0gNDAxKSB7IG1lID0gbnVsbDsgcmVuZGVyTG9naW4oKTsgdGhyb3cgT2JqZWN0LmFzc2lnbihuZXcgRXJyb3IoJ1Nlc2nDs24gdmVuY2lkYScpLCB7IGZpbmFsOiB0cnVlIH0pOyB9CiAgICAgIGlmIChyZXMub2spIHJldHVybiBjdC5pbmNsdWRlcygnanNvbicpID8gcmVzLmpzb24oKSA6IHJlczsKICAgICAgY29uc3QgZSA9IGN0LmluY2x1ZGVzKCdqc29uJykgPyAoYXdhaXQgcmVzLmpzb24oKS5jYXRjaCgoKSA9PiAoe30pKSkuZXJyb3IgOiAnJzsKICAgICAgaWYgKHJlcy5zdGF0dXMgPCA1MDAgfHwgaSA+PSB0cmllcyAtIDEpIHRocm93IE9iamVjdC5hc3NpZ24obmV3IEVycm9yKGUgfHwgJ0VsIHNlcnZpZG9yIG5vIHJlc3BvbmRpw7MsIGludGVudGEgZGUgbnVldm8nKSwgeyBmaW5hbDogdHJ1ZSB9KTsKICAgIH0gY2F0Y2ggKGVycikgeyBpZiAoZXJyLmZpbmFsIHx8IGkgPj0gdHJpZXMgLSAxKSB0aHJvdyBlcnI7IH0KICAgIGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCA4MDAgKiAoaSArIDEpKSk7CiAgfQp9CmZ1bmN0aW9uIHNlbGxlclFTKCkgeyByZXR1cm4gbWUudXNlci5yb2xlID09PSAnYWRtaW4nICYmIHVpLmFkbWluU2VsbGVyID8gYD9zZWxsZXJfaWQ9JHt1aS5hZG1pblNlbGxlcn1gIDogJyc7IH0KZnVuY3Rpb24gZm10VGltZShzKSB7IGlmICghcykgcmV0dXJuICcnOyBjb25zdCBkID0gbmV3IERhdGUocy5pbmNsdWRlcygnVCcpID8gcyA6IHMucmVwbGFjZSgnICcsICdUJykgKyAnWicpOyByZXR1cm4gZC50b0xvY2FsZVN0cmluZygnZXMtQ0wnLCB7IGRheTogJzItZGlnaXQnLCBtb250aDogJzItZGlnaXQnLCBob3VyOiAnMi1kaWdpdCcsIG1pbnV0ZTogJzItZGlnaXQnIH0pOyB9CgovLyAtLS0tLS0tLS0tIGlsdXN0cmFjaW9uZXMgLS0tLS0tLS0tLQpjb25zdCBIRVJPX1NWRyA9IGA8c3ZnIHZpZXdCb3g9IjAgMCA1MjAgMjMwIiBhcmlhLWhpZGRlbj0idHJ1ZSI+CjxyZWN0IHdpZHRoPSI1MjAiIGhlaWdodD0iMjMwIiByeD0iMjYiIGZpbGw9InZhcigtLWJnMikiLz4KPGcgZm9udC1mYW1pbHk9IkJhbG9vIDIsIHNhbnMtc2VyaWYiIGZvbnQtd2VpZ2h0PSI4MDAiIGZvbnQtc2l6ZT0iMTQiIHRleHQtYW5jaG9yPSJtaWRkbGUiPgo8cmVjdCB4PSIyMiIgeT0iMjYiIHdpZHRoPSIxMTIiIGhlaWdodD0iNDQiIHJ4PSIxMiIgZmlsbD0idmFyKC0tbWwpIi8+PHRleHQgeD0iNzgiIHk9IjUzIiBmaWxsPSJ2YXIoLS1tbC1pbmspIj5NZXJjYWRvIExpYnJlPC90ZXh0Pgo8cmVjdCB4PSIyMiIgeT0iOTMiIHdpZHRoPSIxMTIiIGhlaWdodD0iNDQiIHJ4PSIxMiIgZmlsbD0idmFyKC0tZmEpIi8+PHRleHQgeD0iNzgiIHk9IjEyMCIgZmlsbD0idmFyKC0tZmEtaW5rKSI+RmFsYWJlbGxhPC90ZXh0Pgo8cmVjdCB4PSIyMiIgeT0iMTYwIiB3aWR0aD0iMTEyIiBoZWlnaHQ9IjQ0IiByeD0iMTIiIGZpbGw9InZhcigtLXBhKSIvPjx0ZXh0IHg9Ijc4IiB5PSIxODciIGZpbGw9IiNmZmYiPlBhcmlzPC90ZXh0PjwvZz4KPGcgc3Ryb2tlPSJ2YXIoLS1za3kpIiBzdHJva2Utd2lkdGg9IjMiIGZpbGw9Im5vbmUiIHN0cm9rZS1kYXNoYXJyYXk9IjYgNyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48cGF0aCBkPSJNMTM0IDQ4IEMgMTc1IDQ4LCAxNzUgMTE1LCAyMTAgMTE1Ii8+PHBhdGggZD0iTTEzNCAxMTUgSDIxMCIvPjxwYXRoIGQ9Ik0xMzQgMTgyIEMgMTc1IDE4MiwgMTc1IDExNSwgMjEwIDExNSIvPjwvZz4KPHJlY3QgeD0iMjEwIiB5PSI3MCIgd2lkdGg9IjEwNCIgaGVpZ2h0PSI5MCIgcng9IjIwIiBmaWxsPSJ2YXIoLS1hY2NlbnQpIi8+CjxyZWN0IHg9IjIyNiIgeT0iODgiIHdpZHRoPSI3MiIgaGVpZ2h0PSIxMiIgcng9IjYiIGZpbGw9IiNmZmYiIG9wYWNpdHk9Ii45Ii8+PHJlY3QgeD0iMjI2IiB5PSIxMDciIHdpZHRoPSI1MiIgaGVpZ2h0PSIxMCIgcng9IjUiIGZpbGw9IiNmZmYiIG9wYWNpdHk9Ii42Ii8+CjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDIzMiwxMjYpIj48cmVjdCB3aWR0aD0iMjIiIGhlaWdodD0iMjIiIHJ4PSI2IiBmaWxsPSIjZmZmIi8+PHBhdGggZD0iTTYgMTFsNCA0IDctOCIgc3Ryb2tlPSJ2YXIoLS1vaykiIHN0cm9rZS13aWR0aD0iMyIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9nPgo8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyNjQsMTI2KSI+PHJlY3Qgd2lkdGg9IjIyIiBoZWlnaHQ9IjIyIiByeD0iNiIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjYiIHk9IjEwIiB3aWR0aD0iMTAiIGhlaWdodD0iOCIgcng9IjIiIGZpbGw9InZhcigtLWxvY2spIi8+PHBhdGggZD0iTTggMTBWOGEzIDMgMCAwMTYgMHYyIiBzdHJva2U9InZhcigtLWxvY2spIiBzdHJva2Utd2lkdGg9IjIiIGZpbGw9Im5vbmUiLz48L2c+CjxwYXRoIGQ9Ik0zMTQgMTE1IEgzNTYiIHN0cm9rZT0idmFyKC0tc2t5KSIgc3Ryb2tlLXdpZHRoPSIzIiBzdHJva2UtZGFzaGFycmF5PSI2IDciIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8cGF0aCBkPSJNMzYyIDk4IEw0MjQgNzAgTDQ4NiA5OCBWMTc4IEgzNjIgWiIgZmlsbD0idmFyKC0tc3VyZmFjZSkiIHN0cm9rZT0idmFyKC0tbGluZSkiIHN0cm9rZS13aWR0aD0iMiIvPgo8cmVjdCB4PSIzODgiIHk9IjEyNCIgd2lkdGg9IjcyIiBoZWlnaHQ9IjU0IiByeD0iNCIgZmlsbD0idmFyKC0taWNlKSIvPgo8ZyBmaWxsPSJ2YXIoLS1za3kpIj48cmVjdCB4PSIzOTYiIHk9IjE0NCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjE2IiByeD0iMiIvPjxyZWN0IHg9IjQyNCIgeT0iMTQ0IiB3aWR0aD0iMjQiIGhlaWdodD0iMTYiIHJ4PSIyIi8+PHJlY3QgeD0iNDEwIiB5PSIxMzAiIHdpZHRoPSIyNCIgaGVpZ2h0PSIxNCIgcng9IjIiLz48L2c+CjxnIGNsYXNzPSJ0cnVjayI+PHJlY3QgeD0iMzcyIiB5PSIxODgiIHdpZHRoPSI1OCIgaGVpZ2h0PSIyNCIgcng9IjUiIGZpbGw9InZhcigtLWFjY2VudC1zdHJvbmcpIi8+PHBhdGggZD0iTTQzMCAxOTQgaDE4IGwxMCAxMCB2OCBoLTI4eiIgZmlsbD0idmFyKC0tYWNjZW50KSIvPjxjaXJjbGUgY3g9IjM4OCIgY3k9IjIxNCIgcj0iNiIgZmlsbD0idmFyKC0taW5rKSIvPjxjaXJjbGUgY3g9IjQ0NiIgY3k9IjIxNCIgcj0iNiIgZmlsbD0idmFyKC0taW5rKSIvPjwvZz48L3N2Zz5gOwpjb25zdCBFTVBUWV9TVkcgPSBgPHN2ZyB2aWV3Qm94PSIwIDAgMTQwIDEwMCIgYXJpYS1oaWRkZW49InRydWUiPjxyZWN0IHg9IjIwIiB5PSIzMCIgd2lkdGg9IjEwMCIgaGVpZ2h0PSI2MiIgcng9IjEwIiBmaWxsPSJ2YXIoLS1pY2UpIi8+PHBhdGggZD0iTTIwIDQ2aDEwMCIgc3Ryb2tlPSJ2YXIoLS1za3kpIiBzdHJva2Utd2lkdGg9IjMiLz48cmVjdCB4PSIzNiIgeT0iNTgiIHdpZHRoPSI0MCIgaGVpZ2h0PSI3IiByeD0iMy41IiBmaWxsPSJ2YXIoLS1za3kpIi8+PHJlY3QgeD0iMzYiIHk9IjcxIiB3aWR0aD0iMjYiIGhlaWdodD0iNyIgcng9IjMuNSIgZmlsbD0idmFyKC0tc2t5KSIgb3BhY2l0eT0iLjYiLz48Y2lyY2xlIGN4PSIxMDQiIGN5PSIyMiIgcj0iMTQiIGZpbGw9InZhcigtLW9rKSIvPjxwYXRoIGQ9Ik05NyAyMmw1IDUgOS0xMCIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjMuNCIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+YDsKY29uc3QgUlVMRV9TVkcgPSBgPHN2ZyB2aWV3Qm94PSIwIDAgMTMwIDgwIiBhcmlhLWhpZGRlbj0idHJ1ZSI+PHJlY3QgeD0iNCIgeT0iMTAiIHdpZHRoPSI3OCIgaGVpZ2h0PSI2MiIgcng9IjEwIiBmaWxsPSJ2YXIoLS1zdXJmYWNlKSIgc3Ryb2tlPSJ2YXIoLS1saW5lKSIgc3Ryb2tlLXdpZHRoPSIyIi8+PHJlY3QgeD0iMTQiIHk9IjIyIiB3aWR0aD0iNDQiIGhlaWdodD0iOCIgcng9IjQiIGZpbGw9InZhcigtLW9rKSIvPjxyZWN0IHg9IjE0IiB5PSIzNiIgd2lkdGg9IjQ0IiBoZWlnaHQ9IjgiIHJ4PSI0IiBmaWxsPSJ2YXIoLS1vaykiLz48cmVjdCB4PSIxNCIgeT0iNTAiIHdpZHRoPSI0NCIgaGVpZ2h0PSI4IiByeD0iNCIgZmlsbD0idmFyKC0tbG9jaykiLz48cGF0aCBkPSJNODggNDFoMTQiIHN0cm9rZT0idmFyKC0tbXV0ZWQpIiBzdHJva2Utd2lkdGg9IjIuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PHBhdGggZD0iTTk4IDM2bDUgNS01IDUiIHN0cm9rZT0idmFyKC0tbXV0ZWQpIiBzdHJva2Utd2lkdGg9IjIuNSIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PHJlY3QgeD0iMTA2IiB5PSIyOCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjI2IiByeD0iNSIgZmlsbD0idmFyKC0tbG9jaykiLz48cmVjdCB4PSIxMTEiIHk9IjQwIiB3aWR0aD0iMTAiIGhlaWdodD0iOSIgcng9IjIiIGZpbGw9IiNmZmYiLz48cGF0aCBkPSJNMTEzIDQwdi0zYTMgMyAwIDAxNiAwdjMiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSJub25lIi8+PC9zdmc+YDsKCi8vIC0tLS0tLS0tLS0gbG9naW4gLS0tLS0tLS0tLQpmdW5jdGlvbiByZW5kZXJMb2dpbihkZW1vKSB7CiAgJCgnI2FwcCcpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJsb2dpbiI+PGRpdiBjbGFzcz0iY2FyZCI+CiAgICA8ZGl2IGNsYXNzPSJhcnQiPiR7SEVST19TVkd9PC9kaXY+CiAgICA8Zm9ybSBpZD0ibG9naW5Gb3JtIj4KICAgICAgPGgxPkV0aXF1ZXRhSHViPC9oMT4KICAgICAgPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjAiPkV0aXF1ZXRhcyBkZSBNZXJjYWRvIExpYnJlLCBGYWxhYmVsbGEgeSBQYXJpcyBlbiB1bmEgc29sYSBiYW5kZWphLjwvcD4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5Db3JyZW88aW5wdXQgdHlwZT0iZW1haWwiIGlkPSJsRW1haWwiIGF1dG9jb21wbGV0ZT0idXNlcm5hbWUiIHJlcXVpcmVkPjwvbGFiZWw+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+Q29udHJhc2XDsWE8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJsUGFzcyIgYXV0b2NvbXBsZXRlPSJjdXJyZW50LXBhc3N3b3JkIiByZXF1aXJlZD48L2xhYmVsPgogICAgICA8ZGl2IGNsYXNzPSJlcnIiIGlkPSJsRXJyIj48L2Rpdj4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiPkVudHJhcjwvYnV0dG9uPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUiIHR5cGU9ImJ1dHRvbiIgaWQ9ImZvcmdvdCI+wr9PbHZpZGFzdGUgdHUgY29udHJhc2XDsWE/PC9idXR0b24+CiAgICAgIDxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9Im1hcmdpbjowO2ZvbnQtc2l6ZToxMi41cHg7dGV4dC1hbGlnbjpjZW50ZXIiPsK/VGllbmVzIHVuYSBjbGF2ZSBkZSByZXNwYWxkbyAoUlNQLeKApik/IEVzY3LDrWJlbGEgZW4gQ29udHJhc2XDsWEuPC9wPgogICAgICAke2RlbW8gPyAnPGRpdiBjbGFzcz0iZGVtby1oaW50Ij5Nb2RvIGRlbW86IGVudHJhIGNvbiA8Yj5ib2RlZ2FAZGVtby5jbDwvYj4sIDxiPnZlbmRlZG9yMUBkZW1vLmNsPC9iPiBvIDxiPmFkbWluQGRlbW8uY2w8L2I+LCBjbGF2ZSA8Yj5kZW1vMTIzNDwvYj4uPC9kaXY+JyA6ICcnfQogICAgPC9mb3JtPjwvZGl2PjwvZGl2PmA7CiAgJCgnI2xvZ2luRm9ybScpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICBlLnByZXZlbnREZWZhdWx0KCk7CiAgICAkKCcjbEVycicpLnRleHRDb250ZW50ID0gJyc7CiAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvbG9naW4nLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGVtYWlsOiAkKCcjbEVtYWlsJykudmFsdWUsIHBhc3N3b3JkOiAkKCcjbFBhc3MnKS52YWx1ZSB9IH0pOyBib290KCk7IH0KICAgIGNhdGNoIChlcnIpIHsgJCgnI2xFcnInKS50ZXh0Q29udGVudCA9IGVyci5tZXNzYWdlOyB9CiAgfTsKICAkKCcjZm9yZ290Jykub25jbGljayA9ICgpID0+IHJlbmRlckZvcmdvdCgkKCcjbEVtYWlsJykudmFsdWUpOwp9CgovLyBSZWN1cGVyYXIgY29udHJhc2XDsWE6IGNvcnJlbyAtPiBjw7NkaWdvIGRlIDYgZMOtZ2l0b3MgLT4gZW50cmFyIG8gY2FtYmlhciBjb250cmFzZcOxYQpmdW5jdGlvbiByZW5kZXJGb3Jnb3QocHJlZmlsbCA9ICcnKSB7CiAgbGV0IGVtYWlsID0gcHJlZmlsbCwgY29kZSA9ICcnOwogIGNvbnN0IHNoZWxsID0gaW5uZXIgPT4geyAkKCcjYXBwJykuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9ImxvZ2luIj48ZGl2IGNsYXNzPSJjYXJkIj48ZGl2IGNsYXNzPSJhcnQiPiR7SEVST19TVkd9PC9kaXY+PGZvcm0gaWQ9ImZGb3JtIj4ke2lubmVyfTxkaXYgY2xhc3M9ImVyciIgaWQ9ImZFcnIiPjwvZGl2PjwvZm9ybT48L2Rpdj48L2Rpdj5gOyB9OwogIGNvbnN0IGJhY2sgPSAoKSA9PiB7IGNvbnN0IGIgPSAkKCcjZkJhY2snKTsgaWYgKGIpIGIub25jbGljayA9ICgpID0+IHJlbmRlckxvZ2luKCk7IH07CiAgY29uc3QgZXJyID0gbSA9PiB7ICQoJyNmRXJyJykudGV4dENvbnRlbnQgPSBtOyB9OwogIGZ1bmN0aW9uIHN0ZXBFbWFpbCgpIHsKICAgIHNoZWxsKGA8aDE+UmVjdXBlcmFyIGFjY2VzbzwvaDE+PHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjAiPkVzY3JpYmUgdHUgY29ycmVvIHkgdGUgZW52aWFyZW1vcyB1biBjw7NkaWdvIGRlIDYgZMOtZ2l0b3MuPC9wPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPkNvcnJlbzxpbnB1dCB0eXBlPSJlbWFpbCIgaWQ9ImZFbWFpbCIgYXV0b2NvbXBsZXRlPSJ1c2VybmFtZSIgcmVxdWlyZWQgdmFsdWU9IiR7ZXNjKGVtYWlsKX0iPjwvbGFiZWw+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgdHlwZT0ic3VibWl0Ij5FbnZpYXIgY8OzZGlnbzwvYnV0dG9uPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSIgdHlwZT0iYnV0dG9uIiBpZD0iZkJhY2siPlZvbHZlcjwvYnV0dG9uPmApOwogICAgYmFjaygpOwogICAgJCgnI2ZGb3JtJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpOyBlbWFpbCA9ICQoJyNmRW1haWwnKS52YWx1ZS50cmltKCk7CiAgICAgIGNvbnN0IGIgPSBlLnN1Ym1pdHRlcjsgaWYgKGIpIGIuZGlzYWJsZWQgPSB0cnVlOwogICAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvcGFzc3dvcmQvZm9yZ290JywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBlbWFpbCB9IH0pOyBzdGVwQ29kZSgpOyB9CiAgICAgIGNhdGNoICh4KSB7IGVycih4Lm1lc3NhZ2UpOyBpZiAoYikgYi5kaXNhYmxlZCA9IGZhbHNlOyB9CiAgICB9OwogIH0KICBmdW5jdGlvbiBzdGVwQ29kZSgpIHsKICAgIHNoZWxsKGA8aDE+UmV2aXNhIHR1IGNvcnJlbzwvaDE+PHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjAiPlNpIDxiPiR7ZXNjKGVtYWlsKX08L2I+IGVzdMOhIHJlZ2lzdHJhZG8sIHRlIGxsZWfDsyB1biBjw7NkaWdvIGRlIDYgZMOtZ2l0b3MuIFZlbmNlIGVuIDE1IG1pbnV0b3MuIFJldmlzYSB0YW1iacOpbiBsYSBjYXJwZXRhIGRlIHNwYW0uPC9wPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPkPDs2RpZ288aW5wdXQgdHlwZT0idGV4dCIgaWQ9ImZDb2RlIiBpbnB1dG1vZGU9Im51bWVyaWMiIGF1dG9jb21wbGV0ZT0ib25lLXRpbWUtY29kZSIgbWF4bGVuZ3RoPSI2IiBwYXR0ZXJuPSJbMC05XXs2fSIgcmVxdWlyZWQgc3R5bGU9ImZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZToyNHB4O2xldHRlci1zcGFjaW5nOjhweDt0ZXh0LWFsaWduOmNlbnRlciI+PC9sYWJlbD4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiPkNvbnRpbnVhcjwvYnV0dG9uPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUiIHR5cGU9ImJ1dHRvbiIgaWQ9ImZSZXNlbmQiPkVudmlhciBvdHJvIGPDs2RpZ288L2J1dHRvbj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUiIHR5cGU9ImJ1dHRvbiIgaWQ9ImZCYWNrIj5Wb2x2ZXI8L2J1dHRvbj5gKTsKICAgIGJhY2soKTsKICAgICQoJyNmQ29kZScpLmZvY3VzKCk7CiAgICAkKCcjZlJlc2VuZCcpLm9uY2xpY2sgPSBhc3luYyAoKSA9PiB7IHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9wYXNzd29yZC9mb3Jnb3QnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGVtYWlsIH0gfSk7IHRvYXN0KCdDw7NkaWdvIHJlZW52aWFkbycpOyB9IGNhdGNoICh4KSB7IGVycih4Lm1lc3NhZ2UpOyB9IH07CiAgICAkKCcjZkZvcm0nKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4gewogICAgICBlLnByZXZlbnREZWZhdWx0KCk7IGNvZGUgPSAkKCcjZkNvZGUnKS52YWx1ZS50cmltKCk7CiAgICAgIHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9wYXNzd29yZC9jaGVjaycsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgZW1haWwsIGNvZGUgfSB9KTsgc3RlcENob29zZSgpOyB9CiAgICAgIGNhdGNoICh4KSB7IGVycih4Lm1lc3NhZ2UpOyB9CiAgICB9OwogIH0KICBmdW5jdGlvbiBzdGVwQ2hvb3NlKCkgewogICAgc2hlbGwoYDxoMT5Dw7NkaWdvIGNvcnJlY3RvPC9oMT48cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJtYXJnaW46MCI+wr9RdcOpIHF1aWVyZXMgaGFjZXI/PC9wPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIHR5cGU9ImJ1dHRvbiIgaWQ9ImZMb2dpbiI+RW50cmFyIGFob3JhPC9idXR0b24+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tZ2hvc3QiIHR5cGU9ImJ1dHRvbiIgaWQ9ImZDaGFuZ2UiPkNhbWJpYXIgbWkgY29udHJhc2XDsWE8L2J1dHRvbj5gKTsKICAgICQoJyNmTG9naW4nKS5vbmNsaWNrID0gYXN5bmMgKCkgPT4geyB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvcGFzc3dvcmQvbG9naW4nLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGVtYWlsLCBjb2RlIH0gfSk7IGJvb3QoKTsgfSBjYXRjaCAoeCkgeyBlcnIoeC5tZXNzYWdlKTsgfSB9OwogICAgJCgnI2ZDaGFuZ2UnKS5vbmNsaWNrID0gc3RlcE5ldzsKICB9CiAgZnVuY3Rpb24gc3RlcE5ldygpIHsKICAgIHNoZWxsKGA8aDE+TnVldmEgY29udHJhc2XDsWE8L2gxPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPk51ZXZhIGNvbnRyYXNlw7FhIChtw61uaW1vIDgpPGlucHV0IHR5cGU9InBhc3N3b3JkIiBpZD0iZlAxIiBhdXRvY29tcGxldGU9Im5ldy1wYXNzd29yZCIgbWlubGVuZ3RoPSI4IiByZXF1aXJlZD48L2xhYmVsPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPlJlcMOtdGVsYTxpbnB1dCB0eXBlPSJwYXNzd29yZCIgaWQ9ImZQMiIgYXV0b2NvbXBsZXRlPSJuZXctcGFzc3dvcmQiIG1pbmxlbmd0aD0iOCIgcmVxdWlyZWQ+PC9sYWJlbD4KICAgICAgPGxhYmVsIGNsYXNzPSJzd2l0Y2giIHN0eWxlPSJmb250LXNpemU6MTNweCI+PGlucHV0IHR5cGU9ImNoZWNrYm94IiBpZD0iZlNob3ciPiBNb3N0cmFyIGNvbnRyYXNlw7FhPC9sYWJlbD4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiPkd1YXJkYXIgeSBlbnRyYXI8L2J1dHRvbj5gKTsKICAgICQoJyNmU2hvdycpLm9uY2hhbmdlID0gZSA9PiB7ICQoJyNmUDEnKS50eXBlID0gJCgnI2ZQMicpLnR5cGUgPSBlLnRhcmdldC5jaGVja2VkID8gJ3RleHQnIDogJ3Bhc3N3b3JkJzsgfTsKICAgICQoJyNmRm9ybScpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICAgIGUucHJldmVudERlZmF1bHQoKTsKICAgICAgaWYgKCQoJyNmUDEnKS52YWx1ZSAhPT0gJCgnI2ZQMicpLnZhbHVlKSByZXR1cm4gZXJyKCdMYXMgY29udHJhc2XDsWFzIG5vIGNvaW5jaWRlbicpOwogICAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvcGFzc3dvcmQvcmVzZXQnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGVtYWlsLCBjb2RlLCBwYXNzd29yZDogJCgnI2ZQMScpLnZhbHVlIH0gfSk7IHRvYXN0KCdDb250cmFzZcOxYSBhY3R1YWxpemFkYScpOyBib290KCk7IH0KICAgICAgY2F0Y2ggKHgpIHsgZXJyKHgubWVzc2FnZSk7IH0KICAgIH07CiAgfQogIHN0ZXBFbWFpbCgpOwp9CgpmdW5jdGlvbiByZW5kZXJTZXR1cCgpIHsKICAkKCcjYXBwJykuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9ImxvZ2luIj48ZGl2IGNsYXNzPSJjYXJkIj4KICAgIDxkaXYgY2xhc3M9ImFydCI+JHtIRVJPX1NWR308L2Rpdj4KICAgIDxmb3JtIGlkPSJzZXR1cEZvcm0iPgogICAgICA8aDE+QmllbnZlbmlkbzwvaDE+CiAgICAgIDxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9Im1hcmdpbjowIj5DcmVhIGxhIGN1ZW50YSBkZSBhZG1pbmlzdHJhZG9yLiBDb24gZWxsYSBhZ3JlZ2FzIHZlbmRlZG9yZXMsIHVzdWFyaW9zIHkgbGEgY29uZXhpw7NuIGEgTWVyY2FkbyBMaWJyZS48L3A+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+VHUgbm9tYnJlPGlucHV0IHR5cGU9InRleHQiIGlkPSJzTmFtZSIgcmVxdWlyZWQ+PC9sYWJlbD4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5Db3JyZW88aW5wdXQgdHlwZT0iZW1haWwiIGlkPSJzRW1haWwiIGF1dG9jb21wbGV0ZT0idXNlcm5hbWUiIHJlcXVpcmVkPjwvbGFiZWw+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+Q29udHJhc2XDsWEgKG3DrW5pbW8gOCk8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJzUGFzcyIgYXV0b2NvbXBsZXRlPSJuZXctcGFzc3dvcmQiIG1pbmxlbmd0aD0iOCIgcmVxdWlyZWQ+PC9sYWJlbD4KICAgICAgPGxhYmVsIGNsYXNzPSJzd2l0Y2giIHN0eWxlPSJmb250LXNpemU6MTNweCI+PGlucHV0IHR5cGU9ImNoZWNrYm94IiBpZD0ic1Nob3ciPiBNb3N0cmFyIGNvbnRyYXNlw7FhPC9sYWJlbD4KICAgICAgPGRpdiBjbGFzcz0iZXJyIiBpZD0ic0VyciI+PC9kaXY+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgdHlwZT0ic3VibWl0Ij5DcmVhciBhZG1pbmlzdHJhZG9yPC9idXR0b24+CiAgICA8L2Zvcm0+PC9kaXY+PC9kaXY+YDsKICAkKCcjc1Nob3cnKS5vbmNoYW5nZSA9IGUgPT4geyAkKCcjc1Bhc3MnKS50eXBlID0gZS50YXJnZXQuY2hlY2tlZCA/ICd0ZXh0JyA6ICdwYXNzd29yZCc7IH07CiAgJCgnI3NldHVwRm9ybScpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICBlLnByZXZlbnREZWZhdWx0KCk7CiAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvc2V0dXAnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IG5hbWU6ICQoJyNzTmFtZScpLnZhbHVlLCBlbWFpbDogJCgnI3NFbWFpbCcpLnZhbHVlLCBwYXNzd29yZDogJCgnI3NQYXNzJykudmFsdWUgfSB9KTsgYm9vdCgpOyB9CiAgICBjYXRjaCAoZXJyKSB7ICQoJyNzRXJyJykudGV4dENvbnRlbnQgPSBlcnIubWVzc2FnZTsgfQogIH07Cn0KCi8vIC0tLS0tLS0tLS0gZXN0cnVjdHVyYSAtLS0tLS0tLS0tCmZ1bmN0aW9uIHRhYnNGb3Iocm9sZSkgewogIGlmIChyb2xlID09PSAnc2VsbGVyJykgcmV0dXJuIFtbJ3RyYXknLCAnTWlzIGV0aXF1ZXRhcyddLCBbJ21rcCcsICdNS1AgRmxhc2gnXSwgWydzYWxlcycsICdBbsOhbGlzaXMgdmVudGFzJ10sIFsndW5pdHMnLCAnUHJvdmVlZG9yIEZ1bGZpbGxtZW50J10sIFsnc2VsbGVyJywgJ01pIGN1ZW50YSddXTsKICBpZiAocm9sZSA9PT0gJ2FnZW5jaWEnKSByZXR1cm4gW1snY29kZXMnLCAnQ8OzZGlnb3MgZGUgZGV2b2x1Y2nDs24nXV07CiAgaWYgKHJvbGUgPT09ICdmdWxmaWxsbWVudCcpIHJldHVybiBbWyd0cmF5JywgJ0JhbmRlamEgZGUgZXRpcXVldGFzJ10sIFsndW5pdHMnLCAnUHJvdmVlZG9yIEZ1bGZpbGxtZW50J10sIFsnc2VsbGVyc1ZpZXcnLCAnVmVuZGVkb3JlcyddXTsKICByZXR1cm4gW1sndHJheScsICdCYW5kZWphJ10sIFsnbWtwJywgJ01LUCBGbGFzaCddLCBbJ3NhbGVzJywgJ0Fuw6FsaXNpcyB2ZW50YXMnXSwgWyd1bml0cycsICdQcm92ZWVkb3IgRnVsZmlsbG1lbnQnXSwgWydzZWxsZXInLCAnVmVuZGVkb3JlcyddLCBbJ2FkbWluJywgJ1VzdWFyaW9zIHkgYWp1c3RlcyddXTsKfQpmdW5jdGlvbiByZW5kZXJTaGVsbCgpIHsKICBjb25zdCB0YWJzID0gdGFic0ZvcihtZS51c2VyLnJvbGUpOwogIGlmICghdGFiIHx8ICF0YWJzLnNvbWUodCA9PiB0WzBdID09PSB0YWIpKSB0YWIgPSBzdG9yZS5nZXQoJ3RhYicsIHRhYnNbMF1bMF0pOwogIGlmICghdGFicy5zb21lKHQgPT4gdFswXSA9PT0gdGFiKSkgdGFiID0gdGFic1swXVswXTsKICAkKCcjYXBwJykuaW5uZXJIVE1MID0gYAogIDxoZWFkZXIgY2xhc3M9InRvcCI+PGRpdiBjbGFzcz0id3JhcCI+CiAgICA8YSBjbGFzcz0iYnJhbmQiIGhyZWY9Ii8iPjxpbWcgc3JjPSIvbG9nby5zdmciIGFsdD0iIj5FdGlxdWV0YUh1YjwvYT4KICAgICR7dGFicy5sZW5ndGggPiAxID8gYDxuYXYgY2xhc3M9Im5hdiI+JHt0YWJzLm1hcCgoW2ssIG5dKSA9PiBgPGJ1dHRvbiBkYXRhLXRhYj0iJHtrfSIgYXJpYS1jdXJyZW50PSIke2sgPT09IHRhYn0iPiR7bn08L2J1dHRvbj5gKS5qb2luKCcnKX08L25hdj5gIDogJyd9CiAgICA8c3BhbiBjbGFzcz0ic3BhY2VyIj48L3NwYW4+CiAgICAke21lLnVzZXIucm9sZSA9PT0gJ2FnZW5jaWEnID8gJycgOiBgPHNwYW4gY2xhc3M9ImxpdmUiIGlkPSJsaXZlIj48aT48L2k+PHNwYW4+Q29uZWN0YW5kb+KApjwvc3Bhbj48L3NwYW4+CiAgICA8ZGl2IGNsYXNzPSJjbG9jayIgaWQ9ImNsb2NrIj4ke0kuY2xvY2sucmVwbGFjZSgnPHN2ZycsICc8c3ZnIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgc3R5bGU9ImNvbG9yOnZhcigtLWFjY2VudCkiJyl9PGRpdj48c21hbGw+Q29ydGUgJHtlc2MobWUuY3V0b2ZmKX08L3NtYWxsPjxiIGlkPSJjZCI+LS06LS06LS08L2I+PC9kaXY+PC9kaXY+YH0KICAgICR7bWUudXNlci5yb2xlID09PSAnYWdlbmNpYScgPyAnJyA6IGA8YnV0dG9uIGNsYXNzPSJ1bmRvLWJ0biIgaWQ9InVuZG9CdG4iIGRpc2FibGVkPjxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjIuNCIgYXJpYS1oaWRkZW49InRydWUiPjxwYXRoIGQ9Ik05IDE0TDQgOWw1LTUiLz48cGF0aCBkPSJNNCA5aDEwYTYgNiAwIDAxMCAxMmgtMyIvPjwvc3ZnPjxzcGFuPjxiPkRlc2hhY2VyPC9iPjxzbWFsbD5OYWRhIHF1ZSBkZXNoYWNlcjwvc21hbGw+PC9zcGFuPjwvYnV0dG9uPmB9CiAgICA8ZGl2IGNsYXNzPSJ1c2VyIj48ZGl2PjxiPiR7ZXNjKG1lLnNlbGxlcj8ubmFtZSB8fCBtZS51c2VyLm5hbWUpfTwvYj48c21hbGw+JHtlc2MobWUudXNlci5lbWFpbCl9PC9zbWFsbD48L2Rpdj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBpZD0ibXlBY2MiPk1pIGNsYXZlPC9idXR0b24+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgaWQ9ImxvZ291dCI+U2FsaXI8L2J1dHRvbj48L2Rpdj4KICA8L2Rpdj48L2hlYWRlcj4KICA8bWFpbiBjbGFzcz0id3JhcCIgaWQ9Im1haW4iPjwvbWFpbj5gOwogICQkKCcubmF2IGJ1dHRvbicpLmZvckVhY2goYiA9PiBiLm9uY2xpY2sgPSAoKSA9PiB7IHRhYiA9IGIuZGF0YXNldC50YWI7IHN0b3JlLnNldCgndGFiJywgdGFiKTsgJCQoJy5uYXYgYnV0dG9uJykuZm9yRWFjaCh4ID0+IHguc2V0QXR0cmlidXRlKCdhcmlhLWN1cnJlbnQnLCB4ID09PSBiKSk7IHJlbmRlclRhYigpOyB9KTsKICAkKCcjbXlBY2MnKS5vbmNsaWNrID0gKCkgPT4gcmVuZGVyTXlBY2NvdW50KCk7CiAgaWYgKCQoJyN1bmRvQnRuJykpIHsgJCgnI3VuZG9CdG4nKS5vbmNsaWNrID0gdW5kb0xhc3Q7IHJlZnJlc2hVbmRvKCk7IH0KICBpZiAobWUuaW1wZXJzb25hdGVkQnkpIHsKICAgIGNvbnN0IGJhciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpOwogICAgYmFyLnN0eWxlLmNzc1RleHQgPSAnYmFja2dyb3VuZDp2YXIoLS13YXJuLWJnKTtjb2xvcjp2YXIoLS13YXJuKTtmb250LXdlaWdodDo3MDA7cGFkZGluZzoxMHB4IDE2cHg7ZGlzcGxheTpmbGV4O2dhcDoxMnB4O2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyO2ZsZXgtd3JhcDp3cmFwJzsKICAgIGJhci5pbm5lckhUTUwgPSBgRXN0w6FzIHZpZW5kbyBsYSBjdWVudGEgZGUgJHtlc2MobWUudXNlci5uYW1lKX0gKCR7ZXNjKG1lLnVzZXIuZW1haWwpfSkgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IGJ0bi1zbSIgaWQ9InN0b3BJbXAiPlZvbHZlciBhIG1pIGN1ZW50YTwvYnV0dG9uPmA7CiAgICAkKCcjYXBwJykucHJlcGVuZChiYXIpOwogICAgJCgnI3N0b3BJbXAnKS5vbmNsaWNrID0gYXN5bmMgKCkgPT4geyBhd2FpdCBhcGkoJy9hcGkvaW1wZXJzb25hdGUvc3RvcCcsIHsgbWV0aG9kOiAnUE9TVCcgfSk7IGxvY2F0aW9uLmhyZWYgPSAnLyc7IH07CiAgfQogICQoJyNsb2dvdXQnKS5vbmNsaWNrID0gYXN5bmMgKCkgPT4geyBhd2FpdCBhcGkoJy9hcGkvbG9nb3V0JywgeyBtZXRob2Q6ICdQT1NUJyB9KS5jYXRjaCgoKSA9PiB7fSk7IGxvY2F0aW9uLnJlbG9hZCgpOyB9OwogIHN0YXJ0Q2xvY2soKTsgY29ubmVjdFN0cmVhbSgpOyByZW5kZXJUYWIoKTsgd2F0Y2hWZXJzaW9uKCk7IGluaXROb3RpZigpOwp9Ci8vIFNpIHNlIHB1YmxpY2EgdW5hIHZlcnNpw7NuIG51ZXZhIGRlIGxhIGFwcCwgbGEgcGFudGFsbGEgc2UgYWN0dWFsaXphIHNvbGEKZnVuY3Rpb24gd2F0Y2hWZXJzaW9uKCkgewogIGlmICh3YXRjaFZlcnNpb24uX2kpIHJldHVybjsKICBjb25zdCBjaGVjayA9IGFzeW5jICgpID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgdiB9ID0gYXdhaXQgZmV0Y2goJy9oZWFsdGgnLCB7IGNhY2hlOiAnbm8tc3RvcmUnIH0pLnRoZW4ociA9PiByLmpzb24oKSk7CiAgICAgIGlmICghd2F0Y2hWZXJzaW9uLnYpIHdhdGNoVmVyc2lvbi52ID0gdjsKICAgICAgZWxzZSBpZiAodiAmJiB2ICE9PSB3YXRjaFZlcnNpb24udiAmJiAhZG9jdW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQ6Zm9jdXMsIHRleHRhcmVhOmZvY3VzJykpIGxvY2F0aW9uLnJlbG9hZCgpOwogICAgfSBjYXRjaCB7fQogIH07CiAgY2hlY2soKTsgd2F0Y2hWZXJzaW9uLl9pID0gc2V0SW50ZXJ2YWwoY2hlY2ssIDYwMDAwKTsKfQovLyAtLS0tLS0tLS0tIE5PVElGSUNBQ0lPTkVTIERFIFZFTlRBUyAoYWRtaW4geSB2ZW5kZWRvcmVzOyBwYW5lbCBmaWpvIHF1ZSBubyBjYW1iaWEgYWwgbW92ZXJzZSBlbnRyZSBzZWNjaW9uZXMpIC0tLS0tLS0tLS0KY29uc3QgbnQgPSB7IGRhdGE6IG51bGwsIG9wZW46IGZhbHNlLCBmaWx0ZXI6ICdhbGwnLCBzZWVuOiAnJywgZmY6IGZhbHNlIH07CmZ1bmN0aW9uIGluaXROb3RpZigpIHsKICBpZiAoIVsnYWRtaW4nLCAnc2VsbGVyJywgJ2Z1bGZpbGxtZW50J10uaW5jbHVkZXMobWUudXNlci5yb2xlKSB8fCAkKCcjbnRCZWxsJykpIHJldHVybjsKICBudC5mZiA9IG1lLnVzZXIucm9sZSA9PT0gJ2Z1bGZpbGxtZW50JzsKICBudC5zZWVuID0gc3RvcmUuZ2V0KCdudFNlZW4nLCAnJykgfHwgbmV3IERhdGUoRGF0ZS5ub3coKSAtIDM2ZTUpLnRvSVNPU3RyaW5nKCk7CiAgbnQub3BlbiA9IHN0b3JlLmdldCgnbnRPcGVuJywgZmFsc2UpID09PSB0cnVlOwogIGNvbnN0IGJlbGwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTsKICBiZWxsLmlkID0gJ250QmVsbCc7IGJlbGwuY2xhc3NOYW1lID0gJ250LWJlbGwgbnQtY2FzaCc7IGJlbGwudGl0bGUgPSAnVmVudGFzJzsKICBiZWxsLmlubmVySFRNTCA9ICc8c3ZnIHZpZXdCb3g9IjAgMCA0OCAyOCIgYXJpYS1oaWRkZW49InRydWUiPjxyZWN0IHg9IjEuNSIgeT0iMS41IiB3aWR0aD0iNDUiIGhlaWdodD0iMjUiIHJ4PSI0IiBmaWxsPSIjMTZBMzRBIiBzdHJva2U9IiMwQjZCMkUiIHN0cm9rZS13aWR0aD0iMiIvPjxyZWN0IHg9IjUiIHk9IjUiIHdpZHRoPSIzOCIgaGVpZ2h0PSIxOCIgcng9IjIuNSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjQkJGN0QwIiBzdHJva2Utd2lkdGg9IjEuMiIgb3BhY2l0eT0iLjgiLz48Y2lyY2xlIGN4PSIyNCIgY3k9IjE0IiByPSI3LjIiIGZpbGw9IiMyMkM1NUUiIHN0cm9rZT0iI0JCRjdEMCIgc3Ryb2tlLXdpZHRoPSIxLjIiLz48dGV4dCB4PSIyNCIgeT0iMTguNiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1zaXplPSIxMi41IiBmb250LXdlaWdodD0iOTAwIiBmb250LWZhbWlseT0iQXJpYWwsc2Fucy1zZXJpZiIgZmlsbD0iI2ZmZiI+JDwvdGV4dD48Y2lyY2xlIGN4PSI5IiBjeT0iMTQiIHI9IjEuOCIgZmlsbD0iI0JCRjdEMCIvPjxjaXJjbGUgY3g9IjM5IiBjeT0iMTQiIHI9IjEuOCIgZmlsbD0iI0JCRjdEMCIvPjwvc3ZnPjxiIGlkPSJudENvdW50IiBoaWRkZW4+MDwvYj4nOwogIGNvbnN0IHBhbmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYXNpZGUnKTsKICBwYW5lbC5pZCA9ICdudFBhbmVsJzsgcGFuZWwuY2xhc3NOYW1lID0gJ250LXBhbmVsJzsKICBkb2N1bWVudC5ib2R5LmFwcGVuZChiZWxsLCBwYW5lbCk7CiAgYmVsbC5vbmNsaWNrID0gKCkgPT4gc2V0Tm90aWZPcGVuKCFudC5vcGVuKTsKICBwYW5lbC5vbmNsaWNrID0gZSA9PiB7CiAgICBpZiAoZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtbnRjbG9zZV0nKSkgcmV0dXJuIHNldE5vdGlmT3BlbihmYWxzZSk7CiAgICBjb25zdCBmID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtbnRmXScpOyBpZiAoZikgeyBudC5maWx0ZXIgPSBmLmRhdGFzZXQubnRmOyBkcmF3Tm90aWYoKTsgfQogICAgaWYgKGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLW50Y2ZnXScpKSB7IG50LmNmZyA9ICFudC5jZmc7IGRyYXdOb3RpZigpOyB9CiAgfTsKICBwYW5lbC5vbmNoYW5nZSA9IGFzeW5jIGUgPT4gewogICAgaWYgKCFlLnRhcmdldC5tYXRjaGVzKCdbZGF0YS1udHNlbF0nKSkgcmV0dXJuOwogICAgY29uc3QgaWRzID0gWy4uLnBhbmVsLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLW50c2VsXTpjaGVja2VkJyldLm1hcCh4ID0+IE51bWJlcih4LmRhdGFzZXQubnRzZWwpKTsKICAgIHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9ub3RpZmljYXRpb25zL3ByZWZzJywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBzZWxsZXJzOiBpZHMgfSB9KTsgbnQuZGF0YSA9IG51bGw7IGF3YWl0IGxvYWROb3RpZih0cnVlKTsgfSBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlKTsgfQogIH07CiAgc2V0Tm90aWZPcGVuKG50Lm9wZW4pOwogIGxvYWROb3RpZigpOyBzZXRJbnRlcnZhbChsb2FkTm90aWYsIDYwZTMpOwp9Ci8vIFZlbnRhIG51ZXZhOiBsYSBmb3RvIGNvbiBlbCBwcmVjaW8gY2FlIGVuIGPDoW1hcmEgbGVudGEgaGFzdGEgbGEgY2FtcGFuYQpmdW5jdGlvbiBmbHlUb0JlbGwoeCkgewogIGNvbnN0IGJlbGwgPSAkKCcjbnRCZWxsJyk7IGlmICghYmVsbCkgcmV0dXJuOwogIGNvbnN0IGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7CiAgZWwuY2xhc3NOYW1lID0gJ250LWZseSBtay0nICsgeC5tYXJrZXRwbGFjZTsKICBlbC5pbm5lckhUTUwgPSBgJHt4LnRodW1iID8gYDxpbWcgc3JjPSIke2VzYyh4LnRodW1iKX0iIGFsdD0iIj5gIDogJzxzcGFuPvCfm43vuI88L3NwYW4+J30ke250LmZmID8gYDxiPiske3gudW5pdHMgfHwgMX0gdS48L2I+YCA6IGA8Yj4rJHtNYXRoLnJvdW5kKHguYW1vdW50KS50b0xvY2FsZVN0cmluZygnZXMtQ0wnKX08L2I+YH08c21hbGw+JHtlc2MoTUtbeC5tYXJrZXRwbGFjZV0gfHwgJycpfTwvc21hbGw+YDsKICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGVsKTsKICAvLyBjYWUgc3VhdmUgcG9yIGVsIGNvc3RhZG8gaXpxdWllcmRvIChzaW4gdGFwYXIgZWwgY2VudHJvKSB5IGx1ZWdvIGVudHJhIGFsIGJpbGxldGUKICBjb25zdCBiID0gYmVsbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSwgVyA9IDEyMDsKICBjb25zdCBseCA9IDEwLCBleCA9IGIubGVmdCArIGIud2lkdGggLyAyIC0gVyAvIDIsIGV5ID0gYi50b3AgKyBiLmhlaWdodCAvIDIgLSBXIC8gMjsKICBjb25zdCBhbmltID0gZWwuYW5pbWF0ZShbCiAgICB7IHRyYW5zZm9ybTogYHRyYW5zbGF0ZSgke2x4fXB4LCAtMTcwcHgpIHNjYWxlKC45KSByb3RhdGUoLTZkZWcpYCwgb3BhY2l0eTogMCB9LAogICAgeyB0cmFuc2Zvcm06IGB0cmFuc2xhdGUoJHtseH1weCwgJHtpbm5lckhlaWdodCAqIC4xOH1weCkgc2NhbGUoLjkpIHJvdGF0ZSg0ZGVnKWAsIG9wYWNpdHk6IDEsIG9mZnNldDogLjI1IH0sCiAgICB7IHRyYW5zZm9ybTogYHRyYW5zbGF0ZSgke2x4ICsgNn1weCwgJHtpbm5lckhlaWdodCAqIC40Mn1weCkgc2NhbGUoLjkpIHJvdGF0ZSgtM2RlZylgLCBvcGFjaXR5OiAxLCBvZmZzZXQ6IC41NSB9LAogICAgeyB0cmFuc2Zvcm06IGB0cmFuc2xhdGUoJHtseCArIDMwfXB4LCAke2lubmVySGVpZ2h0ICogLjV9cHgpIHNjYWxlKC44KSByb3RhdGUoMGRlZylgLCBvcGFjaXR5OiAxLCBvZmZzZXQ6IC42NiB9LAogICAgeyB0cmFuc2Zvcm06IGB0cmFuc2xhdGUoJHtleH1weCwgJHtleX1weCkgc2NhbGUoLjIpIHJvdGF0ZSg4ZGVnKWAsIG9wYWNpdHk6IC4xNSB9CiAgXSwgeyBkdXJhdGlvbjogNDIwMCwgZWFzaW5nOiAnY3ViaWMtYmV6aWVyKC40LC4wNSwuMywxKScsIGZpbGw6ICdmb3J3YXJkcycgfSk7CiAgYW5pbS5vbmZpbmlzaCA9ICgpID0+IHsgZWwucmVtb3ZlKCk7IGJlbGwuY2xhc3NMaXN0LnJlbW92ZSgnbnQtaGl0Jyk7IHZvaWQgYmVsbC5vZmZzZXRXaWR0aDsgYmVsbC5jbGFzc0xpc3QuYWRkKCdudC1oaXQnKTsgfTsKfQpmdW5jdGlvbiBzZXROb3RpZk9wZW4odikgewogIG50Lm9wZW4gPSB2OyBzdG9yZS5zZXQoJ250T3BlbicsIHYpOwogIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LnRvZ2dsZSgnbnQtb24nLCB2KTsKICBpZiAodiAmJiBudC5kYXRhKSBtYXJrTm90aWZTZWVuKCk7CiAgZHJhd05vdGlmKCk7Cn0KZnVuY3Rpb24gbWFya05vdGlmU2VlbigpIHsgY29uc3QgdG9wID0gbnQuZGF0YT8uaXRlbXM/LlswXT8uYXQ7IGlmICh0b3AgJiYgdG9wID4gbnQuc2VlbikgeyBudC5zZWVuID0gdG9wOyBzdG9yZS5zZXQoJ250U2VlbicsIHRvcCk7IH0gfQphc3luYyBmdW5jdGlvbiBsb2FkTm90aWYocXVpZXQpIHsKICB0cnkgewogICAgY29uc3QgcHJldlRvcCA9IHF1aWV0ID8gbnVsbCA6IG50LmRhdGE/Lml0ZW1zPy5bMF0/LmF0OwogICAgbnQuZGF0YSA9IGF3YWl0IGFwaSgnL2FwaS9ub3RpZmljYXRpb25zJyk7CiAgICBjb25zdCBmcmVzaCA9IG50LmRhdGEuaXRlbXMuZmlsdGVyKHggPT4geC5hdCA+IChwcmV2VG9wIHx8IG50LnNlZW4pKTsKICAgIGlmIChwcmV2VG9wICYmIGZyZXNoLmxlbmd0aCkgZnJlc2guc2xpY2UoMCwgNCkucmV2ZXJzZSgpLmZvckVhY2goKHgsIGkpID0+IHNldFRpbWVvdXQoKCkgPT4gZmx5VG9CZWxsKHgpLCBpICogMTQwMCkpOwogICAgaWYgKHByZXZUb3AgJiYgZnJlc2gubGVuZ3RoKSB0b2FzdChudC5mZiA/IGDwn5OmICR7ZnJlc2gubGVuZ3RoID09PSAxID8gJ051ZXZhIHZlbnRhJyA6IGZyZXNoLmxlbmd0aCArICcgdmVudGFzIG51ZXZhcyd9OiAke2ZyZXNoLnJlZHVjZSgoYSwgeCkgPT4gYSArICh4LnVuaXRzIHx8IDEpLCAwKX0gdW5pZGFkZXNgIDogYPCfkrUgJHtmcmVzaC5sZW5ndGggPT09IDEgPyAnTnVldmEgdmVudGEnIDogZnJlc2gubGVuZ3RoICsgJyB2ZW50YXMgbnVldmFzJ306ICR7bW9uZXkoZnJlc2gucmVkdWNlKChhLCB4KSA9PiBhICsgeC5hbW91bnQsIDApKX1gLCA1MDAwKTsKICAgIGlmIChudC5vcGVuKSBtYXJrTm90aWZTZWVuKCk7CiAgICBkcmF3Tm90aWYoKTsKICB9IGNhdGNoIHt9Cn0KZnVuY3Rpb24gZHJhd05vdGlmKCkgewogIGNvbnN0IGJlbGwgPSAkKCcjbnRCZWxsJyksIHBhbmVsID0gJCgnI250UGFuZWwnKTsgaWYgKCFiZWxsIHx8ICFwYW5lbCkgcmV0dXJuOwogIGNvbnN0IGl0ZW1zID0gbnQuZGF0YT8uaXRlbXMgfHwgW107CiAgY29uc3QgdW5yZWFkID0gaXRlbXMuZmlsdGVyKHggPT4geC5hdCA+IG50LnNlZW4pLmxlbmd0aDsKICBjb25zdCBjID0gJCgnI250Q291bnQnKTsgYy5oaWRkZW4gPSAhdW5yZWFkOyBjLnRleHRDb250ZW50ID0gdW5yZWFkID4gOTkgPyAnOTkrJyA6IHVucmVhZDsKICBiZWxsLmNsYXNzTGlzdC50b2dnbGUoJ2hhcycsIHVucmVhZCA+IDApOyBiZWxsLmNsYXNzTGlzdC50b2dnbGUoJ29uJywgbnQub3Blbik7CiAgY29uc3QgbGlzdCA9IGl0ZW1zLmZpbHRlcih4ID0+IG50LmZpbHRlciA9PT0gJ2FsbCcgfHwgeC5tYXJrZXRwbGFjZSA9PT0gbnQuZmlsdGVyKTsKICBjb25zdCBjbnQgPSBrID0+IGl0ZW1zLmZpbHRlcih4ID0+IHgubWFya2V0cGxhY2UgPT09IGspLmxlbmd0aDsKICBjb25zdCBob3JhID0gZCA9PiBuZXcgRGF0ZShkKS50b0xvY2FsZVN0cmluZygnZXMtQ0wnLCB7IHdlZWtkYXk6ICdzaG9ydCcsIGRheTogJzItZGlnaXQnLCBtb250aDogJ3Nob3J0JywgaG91cjogJzItZGlnaXQnLCBtaW51dGU6ICcyLWRpZ2l0JyB9KTsKICBwYW5lbC5pbm5lckhUTUwgPSBgPGhlYWRlciBjbGFzcz0ibnQtaCI+PGRpdj48Yj7wn5K1IFZlbnRhczwvYj48c21hbGw+SG95OiA8c3Ryb25nPiR7bnQuZGF0YSA/IG50LmRhdGEudG9kYXkubiA6ICfigKYnfTwvc3Ryb25nPiB2ZW50YXMke250LmZmID8gJycgOiBgIMK3IDxzdHJvbmc+JHtudC5kYXRhID8gbW9uZXkobnQuZGF0YS50b2RheS50b3RhbCB8fCAwKSA6ICfigKYnfTwvc3Ryb25nPmB9PC9zbWFsbD48L2Rpdj48ZGl2IGNsYXNzPSJudC1oYiI+JHttZS51c2VyLnJvbGUgPT09ICdhZG1pbicgPyAnPGJ1dHRvbiBjbGFzcz0ibnQteCIgZGF0YS1udGNmZyB0aXRsZT0iRWxlZ2lyIG1pcyBjdWVudGFzIj7impk8L2J1dHRvbj4nIDogJyd9PGJ1dHRvbiBjbGFzcz0ibnQteCIgZGF0YS1udGNsb3NlIHRpdGxlPSJDZXJyYXIiPuKclTwvYnV0dG9uPjwvZGl2PjwvaGVhZGVyPgogICAgJHtudC5jZmcgJiYgbWUudXNlci5yb2xlID09PSAnYWRtaW4nID8gYDxkaXYgY2xhc3M9Im50LWNmZyI+PGI+TWlzIGN1ZW50YXM8L2I+PHNtYWxsPlNvbG8gdGUgbGxlZ2FuIGxhcyB2ZW50YXMgZGUgbGFzIGN1ZW50YXMgbWFyY2FkYXMuPC9zbWFsbD48ZGl2PiR7KG50LmRhdGE/LnNlbGxlcnMgfHwgW10pLm1hcCh4ID0+IGA8bGFiZWw+PGlucHV0IHR5cGU9ImNoZWNrYm94IiBkYXRhLW50c2VsPSIke3guaWR9IiAkeyhudC5kYXRhLm1pbmUgfHwgW10pLmluY2x1ZGVzKHguaWQpID8gJ2NoZWNrZWQnIDogJyd9PiAke2VzYyh4Lm5hbWUpfTwvbGFiZWw+YCkuam9pbignJyl9PC9kaXY+PC9kaXY+YCA6ICcnfQogICAgPGRpdiBjbGFzcz0ibnQtZiI+JHtbWydhbGwnLCAnVG9kYXMnLCBpdGVtcy5sZW5ndGhdLCBbJ21sJywgJ01lcmNhZG8gTGlicmUnLCBjbnQoJ21sJyldLCBbJ2ZhJywgJ0ZhbGFiZWxsYScsIGNudCgnZmEnKV0sIFsncGEnLCAnUGFyaXMnLCBjbnQoJ3BhJyldXS5tYXAoKFtrLCBuLCB2XSkgPT4gYDxidXR0b24gZGF0YS1udGY9IiR7a30iIGNsYXNzPSIke250LmZpbHRlciA9PT0gayA/ICdvbicgOiAnJ30gJHtrfSI+JHtufSA8ZW0+JHt2fTwvZW0+PC9idXR0b24+YCkuam9pbignJyl9PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJudC1saXN0Ij4keyFudC5kYXRhID8gJzxwIGNsYXNzPSJudC1lbXB0eSI+Q2FyZ2FuZG8gdmVudGFz4oCmPC9wPicgOiBsaXN0Lmxlbmd0aCA/IGxpc3QubWFwKCh4LCBpKSA9PiBgPGFydGljbGUgY2xhc3M9Im50LWl0ZW0gbWstJHt4Lm1hcmtldHBsYWNlfSAke3guYXQgPiBudC5zZWVuID8gJ25ldycgOiAnJ30iIHN0eWxlPSItLWk6JHtNYXRoLm1pbihpLCAxMCl9Ij4KICAgICAgPGRpdiBjbGFzcz0ibnQtdG9wIj48c3BhbiBjbGFzcz0ibnQtbWsiPjxpPjwvaT4ke01LW3gubWFya2V0cGxhY2VdIHx8IHgubWFya2V0cGxhY2V9PC9zcGFuPiR7bWUudXNlci5yb2xlICE9PSAnc2VsbGVyJyA/IGA8c3BhbiBjbGFzcz0ibnQtc2VsbGVyIj4ke2VzYyh4LnNlbGxlcil9PC9zcGFuPmAgOiAnJ308c3BhbiBjbGFzcz0ibnQtYWdvIiB0aXRsZT0iJHtlc2MoaG9yYSh4LmF0KSl9Ij4ke2Fnb1MoeC5hdCl9PC9zcGFuPjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJudC1tYWluIj4ke3gudGh1bWIgPyBgPGltZyBjbGFzcz0ibnQtaW1nIiBzcmM9IiR7ZXNjKHgudGh1bWIpfSIgYWx0PSIiIGxvYWRpbmc9ImxhenkiPmAgOiBgPHNwYW4gY2xhc3M9Im50LWltZyBudC1ub2ltZyI+8J+bje+4jzwvc3Bhbj5gfTxkaXYgY2xhc3M9Im50LXByb2QiPiR7KHguaXRlbXMubGVuZ3RoID8geC5pdGVtcyA6IFt7IG5hbWU6ICdWZW50YScsIHF0eTogeC51bml0cyB9XSkuc2xpY2UoMCwgMykubWFwKGl0ID0+IGA8c3Bhbj4ke2VzYyhpdC5uYW1lKX0ke2l0LnZhcmlhbnQgPyBgIDxzbWFsbD4ke2VzYyhpdC52YXJpYW50KX08L3NtYWxsPmAgOiAnJ30ke2l0LnF0eSA+IDEgPyBgIDxlbT7DlyR7aXQucXR5fTwvZW0+YCA6ICcnfTwvc3Bhbj5gKS5qb2luKCcnKX0ke3guaXRlbXMubGVuZ3RoID4gMyA/IGA8c21hbGw+KyR7eC5pdGVtcy5sZW5ndGggLSAzfSBwcm9kdWN0b3MgbcOhczwvc21hbGw+YCA6ICcnfSR7KHguYmxvY2tlZCB8fCBbXSkubWFwKGl0ID0+IGA8ZGVsIGNsYXNzPSJudC1ibGsiIHRpdGxlPSJQcm9kdWN0byBibG9xdWVhZG86IG5vIGxvIHRyYWJhamEgZWwgZnVsZmlsbG1lbnQiPiR7ZXNjKGl0Lm5hbWUpfSR7aXQucXR5ID4gMSA/IGAgw5cke2l0LnF0eX1gIDogJyd9PC9kZWw+YCkuam9pbignJyl9PC9kaXY+JHtudC5mZiA/ICcnIDogYDxiIGNsYXNzPSJudC1wcmljZSI+JHttb25leSh4LmFtb3VudCl9PC9iPmB9PC9kaXY+CiAgICAgIDxzbWFsbCBjbGFzcz0ibnQtaWQiPiR7bnQuZmYgPyAnJyA6IGBWZW50YSAjJHtlc2MoeC5leHRlcm5hbF9pZCl9IMK3IGB9JHtlc2MoaG9yYSh4LmF0KSl9PC9zbWFsbD48L2FydGljbGU+YCkuam9pbignJykgOiAnPHAgY2xhc3M9Im50LWVtcHR5Ij5TaW4gdmVudGFzIGVuIGxvcyDDumx0aW1vcyAzIGTDrWFzLjwvcD4nfTwvZGl2PmA7Cn0KZnVuY3Rpb24gcmVuZGVyVGFiKCkgeyAoeyBta3A6IHJlbmRlck1rcCwgY29kZXM6IHJlbmRlckNvZGVzUGFnZSwgdHJheTogcmVuZGVyVHJheSwgc2VsbGVyOiByZW5kZXJTZWxsZXIsIGFkbWluOiByZW5kZXJBZG1pbiwgc2VsbGVyc1ZpZXc6IHJlbmRlclNlbGxlcnNWaWV3LCBzYWxlczogcmVuZGVyU2FsZXMsIHVuaXRzOiByZW5kZXJVbml0cyB9KVt0YWJdKCk7IH0KCi8vIFJlc3VtZW4gdmlzdWFsIGRlIHVuaWRhZGVzIChzZWNjacOzbiBzaW4gcHJlY2lvcyk6IHRhcmpldGFzLCB1bmlkYWRlcyBwb3IgZMOtYSwgdG9wIHB1YmxpY2FjaW9uZXMgeSBwb3IgdmVuZGVkb3IKZnVuY3Rpb24gdW5pdHNWaXooZCwgcm93cywgZnJvbSwgdG8sIGFsbCkgewogIGNvbnN0IHVuaXRzID0gcm93cy5yZWR1Y2UoKGEsIHIpID0+IGEgKyByLnF0eSwgMCksIG9yZGVycyA9IHJvd3MucmVkdWNlKChhLCByKSA9PiBhICsgci5vcmRlcnMsIDApOwogIGNvbnN0IHRvcCA9IHJvd3NbMF07CiAgY29uc3QgbWtUb3QgPSBrID0+IHJvd3MucmVkdWNlKChhLCByKSA9PiBhICsgKHIuYnlNa1trXSB8fCAwKSwgMCk7CiAgY29uc3QgYmFyID0gKGxhYmVsLCB2YWx1ZSwgbWF4LCBjb2xvciwgc3ViKSA9PiBgPGRpdiBjbGFzcz0iaGIiPjxkaXYgY2xhc3M9ImhiLWwiPjxzcGFuIGNsYXNzPSJoYi1uYW1lIj4ke2xhYmVsfTwvc3Bhbj4ke3N1YiA/IGA8c21hbGw+JHtzdWJ9PC9zbWFsbD5gIDogJyd9PC9kaXY+PGRpdiBjbGFzcz0iaGItdHJhY2siPjxpIHN0eWxlPSJ3aWR0aDoke01hdGgubWF4KDIsIE1hdGgucm91bmQodmFsdWUgLyBtYXggKiAxMDApKX0lO2JhY2tncm91bmQ6JHtjb2xvcn0iPjwvaT48L2Rpdj48YiBjbGFzcz0iaGItdiI+JHt2YWx1ZS50b0xvY2FsZVN0cmluZygnZXMtQ0wnKX08L2I+PC9kaXY+YDsKICBjb25zdCB0b3AxMCA9IHJvd3Muc2xpY2UoMCwgMTApLCBtYXhUb3AgPSBNYXRoLm1heCgxLCAuLi50b3AxMC5tYXAociA9PiByLnF0eSkpOwogIGxldCBieVNlbGxlciA9ICcnOwogIGlmIChhbGwpIHsKICAgIGNvbnN0IG0gPSBuZXcgTWFwKCk7IHJvd3MuZm9yRWFjaChyID0+IG0uc2V0KHIuc2VsbGVyLCAobS5nZXQoci5zZWxsZXIpIHx8IDApICsgci5xdHkpKTsKICAgIGNvbnN0IGxpc3QgPSBbLi4ubS5lbnRyaWVzKCldLnNvcnQoKGEsIGIpID0+IGJbMV0gLSBhWzFdKSwgbXggPSBNYXRoLm1heCgxLCAuLi5saXN0Lm1hcCh4ID0+IHhbMV0pKTsKICAgIGJ5U2VsbGVyID0gYDxkaXYgY2xhc3M9InBhbmVsIHV2LWNhcmQiPjxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj5VbmlkYWRlcyBwb3IgdmVuZGVkb3I8L2gyPjwvZGl2PjxkaXYgY2xhc3M9InBhbmVsLWJvZHkiPiR7bGlzdC5tYXAoKFtuLCB2XSkgPT4gYmFyKGVzYyhuKSwgdiwgbXgsICd2YXIoLS1hY2NlbnQpJywgYCR7TWF0aC5yb3VuZCh2IC8gdW5pdHMgKiAxMDApfSUgZGVsIHRvdGFsYCkpLmpvaW4oJycpfTwvZGl2PjwvZGl2PmA7CiAgfQogIHJldHVybiBgPGRpdiBjbGFzcz0idXYiPgogICAgPGRpdiBjbGFzcz0idXYta3BpcyI+CiAgICAgIDxkaXYgY2xhc3M9ImtwaSBrcGktaGVybyI+PHNtYWxsPlVuaWRhZGVzIHZlbmRpZGFzPC9zbWFsbD48Yj4ke3VuaXRzLnRvTG9jYWxlU3RyaW5nKCdlcy1DTCcpfTwvYj48c3Bhbj4ke2VzYyhmbXREKGZyb20pKX0g4oCTICR7ZXNjKGZtdEQodG8pKX08L3NwYW4+PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9ImtwaSI+PHNtYWxsPlBlZGlkb3M8L3NtYWxsPjxiPiR7b3JkZXJzLnRvTG9jYWxlU3RyaW5nKCdlcy1DTCcpfTwvYj48c3Bhbj52ZW50YXMgY29uIGVzdG9zIHByb2R1Y3Rvczwvc3Bhbj48L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0ia3BpIj48c21hbGw+UHVibGljYWNpb25lcyB2ZW5kaWRhczwvc21hbGw+PGI+JHtyb3dzLmxlbmd0aC50b0xvY2FsZVN0cmluZygnZXMtQ0wnKX08L2I+PHNwYW4+ZGlzdGludGFzPC9zcGFuPjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJrcGkiPjxzbWFsbD7wn4+GIExhIG3DoXMgdmVuZGlkYTwvc21hbGw+PGIgc3R5bGU9ImZvbnQtc2l6ZToxN3B4O2xpbmUtaGVpZ2h0OjEuMjUiPiR7ZXNjKCh0b3A/Lm5hbWUgfHwgJ+KAlCcpLnNsaWNlKDAsIDQ4KSl9JHsodG9wPy5uYW1lIHx8ICcnKS5sZW5ndGggPiA0OCA/ICfigKYnIDogJyd9PC9iPjxzcGFuPiR7dG9wID8gdG9wLnF0eS50b0xvY2FsZVN0cmluZygnZXMtQ0wnKSArICcgdW5pZGFkZXMnIDogJyd9PC9zcGFuPjwvZGl2PgogICAgPC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJ1di1tayI+JHtbJ21sJywgJ2ZhJywgJ3BhJ10ubWFwKGsgPT4gYDxzcGFuPjxpIGNsYXNzPSJkb3QiIHN0eWxlPSJiYWNrZ3JvdW5kOiR7TUtfQ09MT1Jba119Ij48L2k+JHtNS1trXX0gPGI+JHtta1RvdChrKS50b0xvY2FsZVN0cmluZygnZXMtQ0wnKX08L2I+IHVuaWQuIDxzbWFsbD4oJHt1bml0cyA/IE1hdGgucm91bmQobWtUb3QoaykgLyB1bml0cyAqIDEwMCkgOiAwfSUpPC9zbWFsbD48L3NwYW4+YCkuam9pbignJyl9PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbCB1di1jYXJkIj48ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj48aDI+VW5pZGFkZXMgdmVuZGlkYXMgcG9yIGTDrWE8L2gyPjxkaXYgY2xhc3M9ImxlZ2VuZCI+JHtbJ21sJywgJ2ZhJywgJ3BhJ10ubWFwKGsgPT4gYDxzcGFuPjxpIGNsYXNzPSJkb3QiIHN0eWxlPSJiYWNrZ3JvdW5kOiR7TUtfQ09MT1Jba119Ij48L2k+JHtNS1trXX08L3NwYW4+YCkuam9pbignJyl9PC9kaXY+PC9kaXY+PGRpdiBjbGFzcz0icGFuZWwtYm9keSI+PGRpdiBjbGFzcz0iY2gtc2xvdCIgaWQ9InV2RGF5cyIgZGF0YS1oPSIyNDAiPjwvZGl2PjwvZGl2PjwvZGl2PgogICAgPGRpdiBjbGFzcz0idXYtZ3JpZCI+CiAgICAgIDxkaXYgY2xhc3M9InBhbmVsIHV2LWNhcmQiPjxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj5Ub3AgMTAgcHVibGljYWNpb25lczwvaDI+PHNwYW4gY2xhc3M9Im11dGVkIj5wb3IgdW5pZGFkZXM8L3NwYW4+PC9kaXY+PGRpdiBjbGFzcz0icGFuZWwtYm9keSI+JHt0b3AxMC5tYXAoKHIsIGkpID0+IGJhcihgPGVtIGNsYXNzPSJyayI+JHtpICsgMX08L2VtPiR7ZXNjKHIubmFtZSl9YCwgci5xdHksIG1heFRvcCwgTUtfQ09MT1Jbci5tYXJrZXRwbGFjZV0gfHwgJ3ZhcigtLWFjY2VudCknLCBgJHtNS1tyLm1hcmtldHBsYWNlXSB8fCAnJ30ke2FsbCA/ICcgwrcgJyArIGVzYyhyLnNlbGxlcikgOiAnJ31gKSkuam9pbignJyl9PC9kaXY+PC9kaXY+CiAgICAgICR7YnlTZWxsZXJ9CiAgICA8L2Rpdj4KICAgIDxkaXYgY2xhc3M9ImNoLXRpcCIgaWQ9ImNoVGlwMiIgaGlkZGVuPjwvZGl2PgogIDwvZGl2PmA7Cn0KZnVuY3Rpb24gZHJhd1VuaXRDaGFydHMoZCwgZnJvbSwgdG8pIHsKICBjb25zdCBlbCA9ICQoJyN1dkRheXMnKTsgaWYgKCFlbCkgcmV0dXJuOwogIGNvbnN0IGRheXMgPSBbXTsgZm9yIChsZXQgeCA9IG5ldyBEYXRlKGZyb20gKyAnVDEyOjAwOjAwJyk7IGlzbyh4KSA8PSB0byAmJiBkYXlzLmxlbmd0aCA8IDQwMDsgeC5zZXREYXRlKHguZ2V0RGF0ZSgpICsgMSkpIGRheXMucHVzaChpc28oeCkpOwogIC8vIGhhc3RhIDMxIGTDrWFzOiB1bmEgY29sdW1uYSBwb3IgZMOtYTsgbcOhczogcG9yIHNlbWFuYSAobHVuZXMpIG8gcG9yIG1lcwogIGNvbnN0IG1vZGUgPSBkYXlzLmxlbmd0aCA8PSAzMSA/ICdkYXknIDogZGF5cy5sZW5ndGggPD0gMTIwID8gJ3dlZWsnIDogJ21vbnRoJzsKICBjb25zdCBrZXlPZiA9IHggPT4geyBpZiAobW9kZSA9PT0gJ2RheScpIHJldHVybiB4OyBjb25zdCB0ID0gbmV3IERhdGUoeCArICdUMTI6MDA6MDAnKTsgaWYgKG1vZGUgPT09ICdtb250aCcpIHJldHVybiB4LnNsaWNlKDAsIDcpOyB0LnNldERhdGUodC5nZXREYXRlKCkgLSAoKHQuZ2V0RGF5KCkgKyA2KSAlIDcpKTsgcmV0dXJuIGlzbyh0KTsgfTsKICBjb25zdCBidWNrZXRzID0gWy4uLm5ldyBTZXQoZGF5cy5tYXAoa2V5T2YpKV07CiAgY29uc3QgdmFsID0gKGIsIGspID0+IGRheXMuZmlsdGVyKHggPT4ga2V5T2YoeCkgPT09IGIpLnJlZHVjZSgoYSwgeCkgPT4gYSArICgoZC5kYWlseSB8fCB7fSlbeF0/LltrXSB8fCAwKSwgMCk7CiAgY29uc3Qgc3RhY2tzID0gWydtbCcsICdmYScsICdwYSddLm1hcChrID0+ICh7IGtleTogaywgbGFiZWw6IE1LW2tdLCBjb2xvcjogTUtfQ09MT1Jba10sIHZhbHVlczogYnVja2V0cy5tYXAoYiA9PiAoeyBhbW91bnQ6IHZhbChiLCBrKSwgb3JkZXJzOiAwIH0pKSB9KSk7CiAgY29uc3QgTUVTID0gWydlbmUnLCAnZmViJywgJ21hcicsICdhYnInLCAnbWF5JywgJ2p1bicsICdqdWwnLCAnYWdvJywgJ3NlcCcsICdvY3QnLCAnbm92JywgJ2RpYyddOwogIGNvbnN0IGxhYmVsID0gYiA9PiBtb2RlID09PSAnbW9udGgnID8gTUVTWytiLnNsaWNlKDUsIDcpIC0gMV0gOiBtb2RlID09PSAnd2VlaycgPyBgc2VtICR7K2Iuc2xpY2UoOCl9LyR7K2Iuc2xpY2UoNSwgNyl9YCA6IG51bGw7CiAgY29uc3QgdGl0bGUgPSBiID0+IG1vZGUgPT09ICdtb250aCcgPyBgJHtNRVNbK2Iuc2xpY2UoNSwgNykgLSAxXX0gJHtiLnNsaWNlKDAsIDQpfWAgOiBtb2RlID09PSAnd2VlaycgPyBgU2VtYW5hIGRlbCAke2RheUxvbmcoYil9YCA6IGRheUxvbmcoYik7CiAgZWwuaW5uZXJIVE1MID0gY29sdW1uQ2hhcnQoYnVja2V0cywgc3RhY2tzLCB7IGhlaWdodDogMjQwLCB3aWR0aDogZWwuY2xpZW50V2lkdGggfHwgNjQwLCB1bml0czogdHJ1ZSwgdG9kYXk6IG1vZGUgPT09ICdkYXknID8gaXNvKG5ldyBEYXRlKCkpIDogbnVsbCwgbGFiZWw6IG1vZGUgPT09ICdkYXknID8gbnVsbCA6IGxhYmVsLCB0aXRsZSB9KTsKfQoKLy8gLS0tLS0tLS0tLSBQUk9EVUNUT1MgVkVORElET1MgKGNhbnRpZGFkZXMsIHNpbiBwcmVjaW9zKSBwYXJhIGVsIGZ1bGZpbGxtZW50IHkgZWwgYWRtaW5pc3RyYWRvciAtLS0tLS0tLS0tCmFzeW5jIGZ1bmN0aW9uIHJlbmRlclVuaXRzKCkgewogICQoJyNtYWluJykuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9InNlY3Rpb24tdGl0bGUiIHN0eWxlPSJtYXJnaW4tdG9wOjIycHgiPjxoMj5Qcm92ZWVkb3IgRnVsZmlsbG1lbnQ8L2gyPjxzcGFuIGNsYXNzPSJtdXRlZCI+Q2FudGlkYWRlcyBwb3IgcHVibGljYWNpw7NuIHkgdmFyaWFudGUgwrcgc2luIHByZWNpb3Mgwrcgc2luIGxvcyBwcm9kdWN0b3MgYmxvcXVlYWRvczwvc3Bhbj48c3BhbiBjbGFzcz0ic3BhY2VyIiBzdHlsZT0iZmxleDoxIj48L3NwYW4+PHNwYW4gaWQ9InVuaXRzUGljayI+PC9zcGFuPjwvZGl2PjxkaXYgY2xhc3M9InBhbmVsIiBpZD0icHJvZFBhbmVsIj48L2Rpdj5gOwogIHRyeSB7CiAgICBjb25zdCB7IHNlbGxlcnM6IGxpc3QgfSA9IGF3YWl0IGFwaSgnL2FwaS9zZWxsZXJzL2xpc3QnKTsKICAgIGNvbnN0IGN1ciA9IHN0b3JlLmdldCgndW5pdHNTZWxsZXInLCAnJyk7CiAgICAkKCcjdW5pdHNQaWNrJykuaW5uZXJIVE1MID0gYDxzZWxlY3QgaWQ9InVuaXRzU2VsIiBzdHlsZT0id2lkdGg6YXV0byI+PG9wdGlvbiB2YWx1ZT0iIj5Ub2RvcyBsb3MgdmVuZGVkb3Jlczwvb3B0aW9uPiR7bGlzdC5tYXAoeCA9PiBgPG9wdGlvbiB2YWx1ZT0iJHt4LmlkfSIgJHtTdHJpbmcoeC5pZCkgPT09IFN0cmluZyhjdXIpID8gJ3NlbGVjdGVkJyA6ICcnfT4ke2VzYyh4Lm5hbWUpfTwvb3B0aW9uPmApLmpvaW4oJycpfTwvc2VsZWN0PmA7CiAgICAkKCcjdW5pdHNTZWwnKS5vbmNoYW5nZSA9IGUgPT4geyBzdG9yZS5zZXQoJ3VuaXRzU2VsbGVyJywgZS50YXJnZXQudmFsdWUpOyByZW5kZXJQcm9kdWN0cygpOyB9OwogIH0gY2F0Y2gge30KICByZW5kZXJQcm9kdWN0cygpOwp9CgovLyAtLS0tLS0tLS0tIFZFTlRBUyAtLS0tLS0tLS0tCi8vIFBsYW5pbGxhIGRlIHByb2R1Y3RvcyB2ZW5kaWRvczogZmlqYSBkZSBsdW5lcyBhIGRvbWluZ287IHRhbWJpw6luIG1lcywgMzAgZMOtYXMsIGHDsW8gbyBmZWNoYXMgYSBlbGVjY2nDs24KY29uc3QgcHAgPSB7IG1vZGU6ICd3ZWVrJywgd2VlazogMCwgZnJvbTogJycsIHRvOiAnJywgcTogJycsIG9wZW46IG5ldyBTZXQoKSB9Owpjb25zdCBpc28gPSBkID0+IGAke2QuZ2V0RnVsbFllYXIoKX0tJHtTdHJpbmcoZC5nZXRNb250aCgpICsgMSkucGFkU3RhcnQoMiwgJzAnKX0tJHtTdHJpbmcoZC5nZXREYXRlKCkpLnBhZFN0YXJ0KDIsICcwJyl9YDsKZnVuY3Rpb24gcHBSYW5nZSgpIHsKICBjb25zdCB0ID0gbmV3IERhdGUoKTsgdC5zZXRIb3VycygxMiwgMCwgMCwgMCk7CiAgaWYgKHBwLm1vZGUgPT09ICd3ZWVrJykgeyBjb25zdCBtb24gPSBuZXcgRGF0ZSh0KTsgbW9uLnNldERhdGUodC5nZXREYXRlKCkgLSAoKHQuZ2V0RGF5KCkgKyA2KSAlIDcpICsgcHAud2VlayAqIDcpOyBjb25zdCBzdW4gPSBuZXcgRGF0ZShtb24pOyBzdW4uc2V0RGF0ZShtb24uZ2V0RGF0ZSgpICsgNik7IHJldHVybiBbaXNvKG1vbiksIGlzbyhzdW4pXTsgfQogIGlmIChwcC5tb2RlID09PSAnbW9udGgnKSByZXR1cm4gW2lzbyhuZXcgRGF0ZSh0LmdldEZ1bGxZZWFyKCksIHQuZ2V0TW9udGgoKSwgMSkpLCBpc28odCldOwogIGlmIChwcC5tb2RlID09PSAnMzAnKSB7IGNvbnN0IGYgPSBuZXcgRGF0ZSh0KTsgZi5zZXREYXRlKHQuZ2V0RGF0ZSgpIC0gMjkpOyByZXR1cm4gW2lzbyhmKSwgaXNvKHQpXTsgfQogIGlmIChwcC5tb2RlID09PSAneWVhcicpIHJldHVybiBbaXNvKG5ldyBEYXRlKHQuZ2V0RnVsbFllYXIoKSwgMCwgMSkpLCBpc28odCldOwogIHJldHVybiBbcHAuZnJvbSB8fCBpc28odCksIHBwLnRvIHx8IGlzbyh0KV07Cn0KY29uc3QgZm10RCA9IGQgPT4gbmV3IERhdGUoZCArICdUMTI6MDA6MDAnKS50b0xvY2FsZURhdGVTdHJpbmcoJ2VzLUNMJywgeyB3ZWVrZGF5OiAnc2hvcnQnLCBkYXk6ICdudW1lcmljJywgbW9udGg6ICdzaG9ydCcgfSkucmVwbGFjZSgnLicsICcnKTsKYXN5bmMgZnVuY3Rpb24gcmVuZGVyUHJvZHVjdHMoKSB7CiAgY29uc3QgYm94ID0gJCgnI3Byb2RQYW5lbCcpOyBpZiAoIWJveCkgcmV0dXJuOwogIGNvbnN0IGlzQWRtaW4gPSBtZS51c2VyLnJvbGUgPT09ICdhZG1pbic7CiAgY29uc3Qgbm9Nb25leSA9IHRhYiA9PT0gJ3VuaXRzJzsgLy8gc2VjY2nDs24gc2luIHByZWNpb3MgKGZ1bGZpbGxtZW50IC8gYWRtaW5pc3RyYWRvcikKICBjb25zdCBzaWQgPSBub01vbmV5ID8gc3RvcmUuZ2V0KCd1bml0c1NlbGxlcicsICcnKSA6IGlzQWRtaW4gPyBzdG9yZS5nZXQoJ3NhbGVzU2VsbGVyJywgJycpIDogJyc7CiAgY29uc3QgW2Zyb20sIHRvXSA9IHBwUmFuZ2UoKTsKICBjb25zdCBxcyA9IGBmcm9tPSR7ZnJvbX0mdG89JHt0b30ke3NpZCA/ICcmc2VsbGVyX2lkPScgKyBzaWQgOiAnJ30ke25vTW9uZXkgPyAnJm5vbW9uZXk9MScgOiAnJ31gOwogIGJveC5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz0icGFuZWwtaGVhZCIgc3R5bGU9ImZsZXgtd3JhcDp3cmFwO2dhcDoxMHB4Ij4ke25vTW9uZXkgPyAnJyA6ICc8aDI+UHJvZHVjdG9zIHZlbmRpZG9zPC9oMj4nfQogICAgPHNlbGVjdCBpZD0icHBNb2RlIiBzdHlsZT0id2lkdGg6YXV0byI+JHtbWyd3ZWVrJywgJ1NlbWFuYSAobHVuZXMgYSBkb21pbmdvKSddLCBbJ21vbnRoJywgJ0VzdGUgbWVzJ10sIFsnMzAnLCAnw5psdGltb3MgMzAgZMOtYXMnXSwgWyd5ZWFyJywgJ0VzdGUgYcOxbyddLCBbJ2N1c3RvbScsICdFbGVnaXIgZmVjaGFz4oCmJ11dLm1hcCgoW2ssIG5dKSA9PiBgPG9wdGlvbiB2YWx1ZT0iJHtrfSIgJHtwcC5tb2RlID09PSBrID8gJ3NlbGVjdGVkJyA6ICcnfT4ke259PC9vcHRpb24+YCkuam9pbignJyl9PC9zZWxlY3Q+CiAgICAke3BwLm1vZGUgPT09ICd3ZWVrJyA/IGA8c3BhbiBjbGFzcz0icHAtd2VlayI+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgaWQ9InBwUHJldiIgYXJpYS1sYWJlbD0iU2VtYW5hIGFudGVyaW9yIj7igLk8L2J1dHRvbj48Yj4ke2VzYyhmbXREKGZyb20pKX0g4oCTICR7ZXNjKGZtdEQodG8pKX08L2I+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgaWQ9InBwTmV4dCIgYXJpYS1sYWJlbD0iU2VtYW5hIHNpZ3VpZW50ZSIgJHtwcC53ZWVrID49IDAgPyAnZGlzYWJsZWQnIDogJyd9PuKAujwvYnV0dG9uPjwvc3Bhbj5gIDogJyd9CiAgICAke3BwLm1vZGUgPT09ICdjdXN0b20nID8gYDxzcGFuIGNsYXNzPSJwcC13ZWVrIj48aW5wdXQgdHlwZT0iZGF0ZSIgaWQ9InBwRnJvbSIgdmFsdWU9IiR7ZnJvbX0iIHN0eWxlPSJ3aWR0aDphdXRvIj4gYSA8aW5wdXQgdHlwZT0iZGF0ZSIgaWQ9InBwVG8iIHZhbHVlPSIke3RvfSIgc3R5bGU9IndpZHRoOmF1dG8iPjwvc3Bhbj5gIDogJyd9CiAgICA8aW5wdXQgdHlwZT0ic2VhcmNoIiBpZD0icHBRIiBwbGFjZWhvbGRlcj0iQnVzY2FyIHByb2R1Y3RvIG8gU0tVIiB2YWx1ZT0iJHtlc2MocHAucSl9IiBzdHlsZT0id2lkdGg6YXV0bzttaW4td2lkdGg6MTkwcHgiPgogICAgPHNwYW4gY2xhc3M9InNwYWNlciIgc3R5bGU9ImZsZXg6MSI+PC9zcGFuPgogICAgPGEgY2xhc3M9ImJ0biBidG4tcHJpbWFyeSBidG4tc20iIGlkPSJwcFhscyIgaHJlZj0iL2FwaS9zYWxlcy9wcm9kdWN0cy54bHN4PyR7cXN9Ij4ke0kuZG93bn1EZXNjYXJnYXIgRXhjZWw8L2E+PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbC1ib2R5IiBpZD0icHBCb2R5Ij48ZGl2IGNsYXNzPSJtdXRlZCI+Q2FyZ2FuZG8gcHJvZHVjdG9z4oCmPC9kaXY+PC9kaXY+YDsKICAkKCcjcHBNb2RlJykub25jaGFuZ2UgPSBlID0+IHsgcHAubW9kZSA9IGUudGFyZ2V0LnZhbHVlOyBwcC53ZWVrID0gMDsgaWYgKHBwLm1vZGUgPT09ICdjdXN0b20nICYmICFwcC5mcm9tKSB7IGNvbnN0IFtmLCB0XSA9IHBwUmFuZ2UoKTsgcHAuZnJvbSA9IGY7IHBwLnRvID0gdDsgfSByZW5kZXJQcm9kdWN0cygpOyB9OwogIGlmICgkKCcjcHBQcmV2JykpIHsgJCgnI3BwUHJldicpLm9uY2xpY2sgPSAoKSA9PiB7IHBwLndlZWstLTsgcmVuZGVyUHJvZHVjdHMoKTsgfTsgJCgnI3BwTmV4dCcpLm9uY2xpY2sgPSAoKSA9PiB7IGlmIChwcC53ZWVrIDwgMCkgeyBwcC53ZWVrKys7IHJlbmRlclByb2R1Y3RzKCk7IH0gfTsgfQogIGlmICgkKCcjcHBGcm9tJykpIHsgY29uc3QgY2ggPSAoKSA9PiB7IHBwLmZyb20gPSAkKCcjcHBGcm9tJykudmFsdWU7IHBwLnRvID0gJCgnI3BwVG8nKS52YWx1ZTsgcmVuZGVyUHJvZHVjdHMoKTsgfTsgJCgnI3BwRnJvbScpLm9uY2hhbmdlID0gY2g7ICQoJyNwcFRvJykub25jaGFuZ2UgPSBjaDsgfQogIGxldCBkOwogIHRyeSB7IGQgPSBhd2FpdCBhcGkoJy9hcGkvc2FsZXMvcHJvZHVjdHM/JyArIHFzKTsgfSBjYXRjaCAoZSkgeyAkKCcjcHBCb2R5JykuaW5uZXJIVE1MID0gZXNjKGUubWVzc2FnZSk7IHJldHVybjsgfQogIGNvbnN0IGRyYXcgPSAoKSA9PiB7CiAgICBpZiAoISQoJyNwcEJvZHknKSkgcmV0dXJuOwogICAgY29uc3QgcSA9IHBwLnEudG9Mb3dlckNhc2UoKTsKICAgIGNvbnN0IHJvd3MgPSBkLnJvd3MuZmlsdGVyKHIgPT4gIXEgfHwgW3IubmFtZSwgci5wdWJfaWQsIHIuc2VsbGVyLCAuLi5yLnZhcmlhbnRzLm1hcCh2ID0+IHYudmFyaWFudCArICcgJyArIHYuc2t1KV0uam9pbignICcpLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMocSkpOwogICAgY29uc3QgZGF5cyA9IFtdOyBmb3IgKGxldCB4ID0gbmV3IERhdGUoZnJvbSArICdUMTI6MDA6MDAnKTsgaXNvKHgpIDw9IHRvICYmIGRheXMubGVuZ3RoIDwgNDAwOyB4LnNldERhdGUoeC5nZXREYXRlKCkgKyAxKSkgZGF5cy5wdXNoKGlzbyh4KSk7CiAgICBjb25zdCB3ZWVrbHkgPSBkYXlzLmxlbmd0aCA8PSA3LCBhbGwgPSAhc2lkICYmIChpc0FkbWluIHx8IG5vTW9uZXkpOwogICAgY29uc3QgdG90ID0gayA9PiByb3dzLnJlZHVjZSgoYSwgcikgPT4gYSArICh0eXBlb2YgayA9PT0gJ2Z1bmN0aW9uJyA/IGsocikgOiByW2tdKSwgMCk7CiAgICBjb25zdCBoZWFkID0gYCR7YWxsID8gJzx0aD5WZW5kZWRvcjwvdGg+JyA6ICcnfTx0aD5QdWJsaWNhY2nDs248L3RoPjx0aD5JRCAvIFNLVTwvdGg+JHt3ZWVrbHkgPyBkYXlzLm1hcCh4ID0+IGA8dGggY2xhc3M9Im51bSI+JHtlc2MoZm10RCh4KS5zcGxpdCgnICcpWzBdLnJlcGxhY2UoJywnLCAnJykpfTxzbWFsbD4ke3guc2xpY2UoOCl9PC9zbWFsbD48L3RoPmApLmpvaW4oJycpIDogWydtbCcsICdmYScsICdwYSddLm1hcChrID0+IGA8dGggY2xhc3M9Im51bSI+PGkgY2xhc3M9ImRvdCIgc3R5bGU9ImJhY2tncm91bmQ6JHtNS19DT0xPUltrXX0iPjwvaT4ke01LW2tdfTwvdGg+YCkuam9pbignJyl9PHRoIGNsYXNzPSJudW0iPlRvdGFsPC90aD4ke25vTW9uZXkgPyAnPHRoIGNsYXNzPSJudW0iPlZlbnRhczwvdGg+JyA6ICc8dGggY2xhc3M9Im51bSI+TW9udG88L3RoPid9YDsKICAgIGNvbnN0IGNlbGxRID0gbiA9PiBuID8gYDxiPiR7bn08L2I+YCA6ICc8c3BhbiBjbGFzcz0iemVybyI+wrc8L3NwYW4+JzsKICAgIGNvbnN0IG51bXMgPSByID0+IGAke3dlZWtseSA/IGRheXMubWFwKHggPT4gYDx0ZCBjbGFzcz0ibnVtIj4ke2NlbGxRKHIuYnlEYXlbeF0gfHwgMCl9PC90ZD5gKS5qb2luKCcnKSA6IFsnbWwnLCAnZmEnLCAncGEnXS5tYXAoayA9PiBgPHRkIGNsYXNzPSJudW0iPiR7Y2VsbFEoci5ieU1rW2tdIHx8IDApfTwvdGQ+YCkuam9pbignJyl9PHRkIGNsYXNzPSJudW0gcHAtdG90YWwiPiR7ci5xdHl9PC90ZD48dGQgY2xhc3M9Im51bSI+JHtub01vbmV5ID8gci5vcmRlcnMgOiBtb25leShyLmFtb3VudCl9PC90ZD5gOwogICAgLy8gdW5hIGZpbGEgcG9yIHB1YmxpY2FjacOzbjsgY29uIGxhIGZsZWNoYSBzZSBkZXNwbGllZ2FuIHN1cyB2YXJpYW50ZXMKICAgIC8vIEVuIFZlbnRhcyBlbCBsaXN0YWRvIHBhcnRlIHJlY29naWRvIChzZSB2ZW4gbGFzIHByaW1lcmFzIDgpOyBjb24gZWwgYm90w7NuIHNlIGRlc3BsaWVnYSBjb21wbGV0bwogICAgY29uc3QgTElNID0gOCwgY29sbGFwc2VkID0gIW5vTW9uZXkgJiYgIXBwLmZ1bGwgJiYgIXEgJiYgcm93cy5sZW5ndGggPiBMSU07CiAgICBjb25zdCBzaG93biA9IGNvbGxhcHNlZCA/IHJvd3Muc2xpY2UoMCwgTElNKSA6IHJvd3M7CiAgICBjb25zdCBib2R5ID0gc2hvd24ubWFwKHIgPT4gewogICAgICAvLyBsYSBmaWxhIG11ZXN0cmEgbGEgcHVibGljYWNpw7NuIGNvbXBsZXRhICh0b2RhcyBzdXMgdmFyaWFudGVzIHN1bWFkYXMpOyBsYXMgdmFyaWFudGVzIHNvbG8gYWwgZGVzcGxlZ2FyCiAgICAgIGNvbnN0IGtleSA9IHIuc2VsbGVyICsgJ3wnICsgci5tYXJrZXRwbGFjZSArICd8JyArIChyLnB1Yl9pZCB8fCByLm5hbWUpLCBvcGVuID0gcHAub3Blbi5oYXMoa2V5KSwgbnYgPSByLnZhcmlhbnRzLmZpbHRlcih2ID0+IHYudmFyaWFudCB8fCB2LnNrdSkubGVuZ3RoLCBtYW55ID0gbnYgPiAwOwogICAgICBsZXQgaCA9IGA8dHIgY2xhc3M9InBwLXB1YiR7bWFueSA/ICcgcHAtY2FuJyA6ICcnfSIgJHttYW55ID8gYGRhdGEtcGs9IiR7ZXNjKGtleSl9ImAgOiAnJ30+JHthbGwgPyBgPHRkPiR7ZXNjKHIuc2VsbGVyKX08L3RkPmAgOiAnJ308dGQ+JHttYW55ID8gYDxzcGFuIGNsYXNzPSJwcC1hcnJvdyI+JHtvcGVuID8gJ+KWvicgOiAn4pa4J308L3NwYW4+YCA6ICc8c3BhbiBjbGFzcz0icHAtYXJyb3ciPjwvc3Bhbj4nfTxzcGFuIGNsYXNzPSJtayAke3IubWFya2V0cGxhY2V9IiBzdHlsZT0ibWFyZ2luLXJpZ2h0OjZweCI+JHtNS1tyLm1hcmtldHBsYWNlXSB8fCAnJ308L3NwYW4+PHNwYW4gY2xhc3M9InBwLW5hbWUiPiR7ZXNjKHIubmFtZSl9PC9zcGFuPiR7bWFueSA/IGA8c21hbGwgY2xhc3M9Im11dGVkIHBwLXN1YiI+JHtudn0gdmFyaWFudGUke252ID09PSAxID8gJycgOiAncyd9IHZlbmRpZGEke252ID09PSAxID8gJycgOiAncyd9IMK3ICR7b3BlbiA/ICd0b2NhIHBhcmEgb2N1bHRhcicgOiAndG9jYSBwYXJhIHZlcid9PC9zbWFsbD5gIDogJyd9PC90ZD48dGQgY2xhc3M9Im1vbm8iPiR7ZXNjKHIucHViX2lkIHx8ICcnKX08L3RkPiR7bnVtcyhyKX08L3RyPmA7CiAgICAgIGlmIChtYW55ICYmIG9wZW4pIGggKz0gci52YXJpYW50cy5tYXAodiA9PiBgPHRyIGNsYXNzPSJwcC12YXIiPiR7YWxsID8gJzx0ZD48L3RkPicgOiAnJ308dGQ+PHNwYW4gY2xhc3M9InBwLXZuYW1lIj4ke2VzYyh2LnZhcmlhbnQgfHwgJ1NpbiB2YXJpYW50ZScpfTwvc3Bhbj48L3RkPjx0ZCBjbGFzcz0ibW9ubyI+JHtlc2Modi5za3UgfHwgJycpfTwvdGQ+JHtudW1zKHYpfTwvdHI+YCkuam9pbignJyk7CiAgICAgIHJldHVybiBoOwogICAgfSkuam9pbignJyk7CiAgICBjb25zdCBmb290ID0gYDx0cj4ke2FsbCA/ICc8dGQ+PC90ZD4nIDogJyd9PHRkPjxiPlRvdGFsICgke3Jvd3MubGVuZ3RofSBwdWJsaWNhY2kke3Jvd3MubGVuZ3RoID09PSAxID8gJ8OzbicgOiAnb25lcyd9KTwvYj48L3RkPjx0ZD48L3RkPiR7d2Vla2x5ID8gZGF5cy5tYXAoeCA9PiBgPHRkIGNsYXNzPSJudW0iPjxiPiR7dG90KHIgPT4gci5ieURheVt4XSB8fCAwKX08L2I+PC90ZD5gKS5qb2luKCcnKSA6IFsnbWwnLCAnZmEnLCAncGEnXS5tYXAoayA9PiBgPHRkIGNsYXNzPSJudW0iPjxiPiR7dG90KHIgPT4gci5ieU1rW2tdIHx8IDApfTwvYj48L3RkPmApLmpvaW4oJycpfTx0ZCBjbGFzcz0ibnVtIHBwLXRvdGFsIj4ke3RvdCgncXR5Jyl9PC90ZD48dGQgY2xhc3M9Im51bSI+PGI+JHtub01vbmV5ID8gdG90KCdvcmRlcnMnKSA6IG1vbmV5KHRvdCgnYW1vdW50JykpfTwvYj48L3RkPjwvdHI+YDsKICAgIGNvbnN0IG5vdGUgPSBkLmhpc3RvcnlTaW5jZSAmJiBmcm9tIDwgZC5oaXN0b3J5U2luY2UgPyBgPHAgY2xhc3M9InBwLW5vdGUiPkVzdGFtb3MgdHJheWVuZG8gdHUgaGlzdG9yaWFsIGRlIHZlbnRhcyBkZSBhIHBvY28gKGhhc3RhIDEgYcOxbykuIFBvciBhaG9yYSBoYXkgZGF0b3MgY29tcGxldG9zIGRlc2RlIGVsICR7ZXNjKGZtdEQoZC5oaXN0b3J5U2luY2UpKX07IGVsIHJlc3RvIGFwYXJlY2Ugc29sbyBlbiBsYXMgcHLDs3hpbWFzIGhvcmFzLjwvcD5gIDogJyc7CiAgICBjb25zdCBjYW5PcGVuID0gciA9PiByLnZhcmlhbnRzLnNvbWUodiA9PiB2LnZhcmlhbnQgfHwgdi5za3UpOwogICAgY29uc3QgZXhwYW5kQnRuID0gcm93cy5zb21lKGNhbk9wZW4pID8gYDxkaXYgc3R5bGU9Im1hcmdpbjowIDAgOHB4Ij48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBpZD0icHBBbGwiPiR7cm93cy5maWx0ZXIoY2FuT3BlbikuZXZlcnkociA9PiBwcC5vcGVuLmhhcyhyLnNlbGxlciArICd8JyArIHIubWFya2V0cGxhY2UgKyAnfCcgKyAoci5wdWJfaWQgfHwgci5uYW1lKSkpID8gJ09jdWx0YXIgdmFyaWFudGVzJyA6ICdWZXIgdG9kYXMgbGFzIHZhcmlhbnRlcyd9PC9idXR0b24+PC9kaXY+YCA6ICcnOwogICAgY29uc3Qgdml6ID0gbm9Nb25leSAmJiByb3dzLmxlbmd0aCA/IHVuaXRzVml6KGQsIHJvd3MsIGZyb20sIHRvLCBhbGwpIDogJyc7CiAgICAkKCcjcHBCb2R5JykuaW5uZXJIVE1MID0gdml6ICsgbm90ZSArIGV4cGFuZEJ0biArIChyb3dzLmxlbmd0aCA/IGAke3ZpeiA/ICc8aDMgY2xhc3M9InV2LWgiPkRldGFsbGUgcG9yIHB1YmxpY2FjacOzbiA8c21hbGw+VG9jYSB1bmEgcHVibGljYWNpw7NuIHBhcmEgdmVyIHN1cyB2YXJpYW50ZXM8L3NtYWxsPjwvaDM+JyA6ICcnfTxkaXYgY2xhc3M9InRhYmxlLXdyYXAiPjx0YWJsZSBjbGFzcz0icHAtdGFibGUiPjx0aGVhZD48dHI+JHtoZWFkfTwvdHI+PC90aGVhZD48dGJvZHk+JHtib2R5fTwvdGJvZHk+PHRmb290PiR7Zm9vdH08L3Rmb290PjwvdGFibGU+PC9kaXY+YCA6IGA8ZGl2IGNsYXNzPSJlbXB0eSI+JHtxID8gJ05pbmfDum4gcHJvZHVjdG8gY29pbmNpZGUgY29uIGxhIGLDunNxdWVkYS4nIDogJ05vIGhheSBwcm9kdWN0b3MgdmVuZGlkb3MgZW4gZXN0YXMgZmVjaGFzLid9PC9kaXY+YCk7CiAgICBpZiAoIW5vTW9uZXkgJiYgIXEgJiYgcm93cy5sZW5ndGggPiBMSU0pICQoJyNwcEJvZHknKS5pbnNlcnRBZGphY2VudEhUTUwoJ2JlZm9yZWVuZCcsIGA8ZGl2IGNsYXNzPSJwcC1tb3JlIj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBpZD0icHBGdWxsIj4ke3BwLmZ1bGwgPyAnUmVjb2dlciBsaXN0YWRvIOKWtCcgOiBgVmVyIGxpc3RhZG8gY29tcGxldG8gKCR7cm93cy5sZW5ndGh9IHB1YmxpY2FjaW9uZXMpIOKWvmB9PC9idXR0b24+PC9kaXY+YCk7CiAgfTsKICBkcmF3KCk7CiAgaWYgKG5vTW9uZXkpIGRyYXdVbml0Q2hhcnRzKGQsIGZyb20sIHRvKTsKICAkKCcjcHBCb2R5Jykub25tb3VzZW1vdmUgPSBlID0+IHsKICAgIGNvbnN0IHRpcEVsID0gJCgnI2NoVGlwMicpOyBpZiAoIXRpcEVsKSByZXR1cm47CiAgICBjb25zdCBoID0gZS50YXJnZXQuY2xvc2VzdCgnLmNoLWhpdCcpOyBpZiAoIWgpIHsgdGlwRWwuaGlkZGVuID0gdHJ1ZTsgcmV0dXJuOyB9CiAgICBjb25zdCBbdCwgLi4ucmVzdF0gPSBoLmRhdGFzZXQudGlwLnNwbGl0KCd8Jyk7CiAgICB0aXBFbC5pbm5lckhUTUwgPSBgPGI+JHtlc2ModCl9PC9iPiR7cmVzdC5tYXAociA9PiBgPGRpdj4ke2VzYyhyKX08L2Rpdj5gKS5qb2luKCcnKX1gOyB0aXBFbC5oaWRkZW4gPSBmYWxzZTsKICAgIHRpcEVsLnN0eWxlLmxlZnQgPSBNYXRoLm1pbihlLmNsaWVudFggKyAxNCwgaW5uZXJXaWR0aCAtIHRpcEVsLm9mZnNldFdpZHRoIC0gOCkgKyAncHgnOyB0aXBFbC5zdHlsZS50b3AgPSAoZS5jbGllbnRZICsgMTQpICsgJ3B4JzsKICB9OwogICQoJyNwcEJvZHknKS5vbm1vdXNlbGVhdmUgPSAoKSA9PiB7IGNvbnN0IHQgPSAkKCcjY2hUaXAyJyk7IGlmICh0KSB0LmhpZGRlbiA9IHRydWU7IH07CiAgJCgnI3BwQm9keScpLm9uY2xpY2sgPSBlID0+IHsKICAgIGlmIChlLnRhcmdldC5jbG9zZXN0KCcjcHBGdWxsJykpIHsgcHAuZnVsbCA9ICFwcC5mdWxsOyBkcmF3KCk7IGlmICghcHAuZnVsbCkgJCgnI3Byb2RQYW5lbCcpPy5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiAnc3RhcnQnLCBiZWhhdmlvcjogJ3Ntb290aCcgfSk7IHJldHVybjsgfQogICAgaWYgKGUudGFyZ2V0LmNsb3Nlc3QoJyNwcEFsbCcpKSB7CiAgICAgIGNvbnN0IGtleXMgPSBkLnJvd3MuZmlsdGVyKHIgPT4gci52YXJpYW50cy5zb21lKHYgPT4gdi52YXJpYW50IHx8IHYuc2t1KSkubWFwKHIgPT4gci5zZWxsZXIgKyAnfCcgKyByLm1hcmtldHBsYWNlICsgJ3wnICsgKHIucHViX2lkIHx8IHIubmFtZSkpOwogICAgICBjb25zdCBhbGxPcGVuID0ga2V5cy5ldmVyeShrID0+IHBwLm9wZW4uaGFzKGspKTsKICAgICAga2V5cy5mb3JFYWNoKGsgPT4gYWxsT3BlbiA/IHBwLm9wZW4uZGVsZXRlKGspIDogcHAub3Blbi5hZGQoaykpOyBkcmF3KCk7IGlmIChub01vbmV5KSBkcmF3VW5pdENoYXJ0cyhkLCBmcm9tLCB0byk7IHJldHVybjsKICAgIH0KICAgIGNvbnN0IHRyID0gZS50YXJnZXQuY2xvc2VzdCgndHJbZGF0YS1wa10nKTsgaWYgKCF0cikgcmV0dXJuOwogICAgY29uc3QgayA9IHRyLmRhdGFzZXQucGs7IHBwLm9wZW4uaGFzKGspID8gcHAub3Blbi5kZWxldGUoaykgOiBwcC5vcGVuLmFkZChrKTsgZHJhdygpOyBpZiAobm9Nb25leSkgZHJhd1VuaXRDaGFydHMoZCwgZnJvbSwgdG8pOwogIH07CiAgJCgnI3BwUScpLm9uaW5wdXQgPSBlID0+IHsgcHAucSA9IGUudGFyZ2V0LnZhbHVlOyBkcmF3KCk7IGlmIChub01vbmV5KSBkcmF3VW5pdENoYXJ0cyhkLCBmcm9tLCB0byk7IH07Cn0KY29uc3QgTUtfQ09MT1IgPSB7IG1sOiAnI0M5OUEwMCcsIGZhOiAnIzRGOEYwMCcsIHBhOiAnIzAwNjhCOCcgfTsgLy8gY29sb3JlcyBkZSBjYWRhIG1hcmtldHBsYWNlICh2YWxpZGFkb3MgcGFyYSBkYWx0b25pc21vLCBjb24gZXRpcXVldGFzIHkgc2VwYXJhY2nDs24pCmNvbnN0IG1vbmV5ID0gbiA9PiAnJCcgKyBNYXRoLnJvdW5kKG4pLnRvTG9jYWxlU3RyaW5nKCdlcy1DTCcpOwpjb25zdCBtb25leVNob3J0ID0gbiA9PiBuID49IDFlNiA/ICckJyArIChuIC8gMWU2KS50b0ZpeGVkKDEpLnJlcGxhY2UoJy4nLCAnLCcpLnJlcGxhY2UoJywwJywgJycpICsgJyBNJyA6IG4gPj0gMWU0ID8gJyQnICsgTWF0aC5yb3VuZChuIC8gMWUzKSArICcgbWlsJyA6IG1vbmV5KG4pOwpjb25zdCBkYXlTaG9ydCA9IGQgPT4geyBjb25zdCB4ID0gbmV3IERhdGUoZCArICdUMTI6MDA6MDAnKTsgcmV0dXJuIHgudG9Mb2NhbGVEYXRlU3RyaW5nKCdlcy1DTCcsIHsgd2Vla2RheTogJ3Nob3J0JyB9KS5yZXBsYWNlKCcuJywgJycpICsgJyAnICsgeC5nZXREYXRlKCk7IH07CmNvbnN0IGRheUxvbmcgPSBkID0+IG5ldyBEYXRlKGQgKyAnVDEyOjAwOjAwJykudG9Mb2NhbGVEYXRlU3RyaW5nKCdlcy1DTCcsIHsgd2Vla2RheTogJ2xvbmcnLCBkYXk6ICdudW1lcmljJywgbW9udGg6ICdsb25nJyB9KTsKY29uc3QgbmljZU1heCA9IHYgPT4geyBpZiAodiA8PSAwKSByZXR1cm4gMTAwMDA7IGNvbnN0IHAgPSBNYXRoLnBvdygxMCwgTWF0aC5mbG9vcihNYXRoLmxvZzEwKHYpKSk7IGNvbnN0IGYgPSB2IC8gcDsgcmV0dXJuIChmIDw9IDEgPyAxIDogZiA8PSAyID8gMiA6IGYgPD0gMi41ID8gMi41IDogZiA8PSA1ID8gNSA6IDEwKSAqIHA7IH07CmZ1bmN0aW9uIGJhclBhdGgoeCwgeSwgdywgaCwgcikgewogIGlmIChoIDw9IDApIHJldHVybiAnJzsKICByID0gTWF0aC5taW4ociwgaCwgdyAvIDIpOwogIHJldHVybiBgTSR7eH0sJHt5ICsgaH1WJHt5ICsgcn1RJHt4fSwke3l9ICR7eCArIHJ9LCR7eX1IJHt4ICsgdyAtIHJ9USR7eCArIHd9LCR7eX0gJHt4ICsgd30sJHt5ICsgcn1WJHt5ICsgaH1aYDsKfQovLyBHcsOhZmljbyBkZSBjb2x1bW5hcyAodW5hIHNlcmllKSBvIGNvbHVtbmFzIGFwaWxhZGFzICh2YXJpYXMpLiBUb29sdGlwIHBvciBjb2x1bW5hLgpmdW5jdGlvbiBjb2x1bW5DaGFydChkYXlzLCBzdGFja3MsIHsgaGVpZ2h0ID0gMjMwLCB0b2RheSwgd2lkdGggPSA2NDAsIHVuaXRzID0gZmFsc2UsIGxhYmVsLCB0aXRsZSB9ID0ge30pIHsKICBjb25zdCBmbXRTID0gdW5pdHMgPyAobiA9PiBNYXRoLnJvdW5kKG4pLnRvTG9jYWxlU3RyaW5nKCdlcy1DTCcpKSA6IG1vbmV5U2hvcnQsIGZtdEwgPSB1bml0cyA/IChuID0+IGAke01hdGgucm91bmQobikudG9Mb2NhbGVTdHJpbmcoJ2VzLUNMJyl9IHVuaWQuYCkgOiBtb25leTsKICBjb25zdCBXID0gTWF0aC5tYXgoMjgwLCB3aWR0aCksIEggPSBoZWlnaHQsIEwgPSA0LCBSID0gNTIsIFQgPSAyNiwgQiA9IDMwOwogIGNvbnN0IHRvdGFscyA9IGRheXMubWFwKChfLCBpKSA9PiBzdGFja3MucmVkdWNlKChhLCBzKSA9PiBhICsgcy52YWx1ZXNbaV0uYW1vdW50LCAwKSk7CiAgY29uc3QgbWF4ID0gdW5pdHMgJiYgTWF0aC5tYXgoLi4udG90YWxzKSA8PSAwID8gMTAgOiBuaWNlTWF4KE1hdGgubWF4KC4uLnRvdGFscykgKiAxLjA4KTsKICBjb25zdCBzbG90ID0gKFcgLSBMIC0gUikgLyBkYXlzLmxlbmd0aCwgYncgPSBNYXRoLm1pbig1Niwgc2xvdCAqIDAuNTgpOwogIGNvbnN0IGNvbXBhY3QgPSBzbG90IDwgNzQ7IC8vIGNhamEgYW5nb3N0YSAoY2VsdWxhciAvIHRhcmpldGEgY2hpY2EpOiBtZW5vcyBldGlxdWV0YXMgcGFyYSBxdWUgbm8gc2UgZW5jaW1lbgogIGxldCBiZXN0SSA9IDA7IHRvdGFscy5mb3JFYWNoKCh0LCBpKSA9PiB7IGlmICh0ID4gdG90YWxzW2Jlc3RJXSkgYmVzdEkgPSBpOyB9KTsKICBjb25zdCB5ID0gdiA9PiBUICsgKEggLSBUIC0gQikgKiAoMSAtIHYgLyBtYXgpOwogIGxldCBnID0gJyc7CiAgZm9yIChjb25zdCBmIG9mIFswLjUsIDFdKSBnICs9IGA8bGluZSB4MT0iJHtMfSIgeDI9IiR7VyAtIFJ9IiB5MT0iJHt5KG1heCAqIGYpfSIgeTI9IiR7eShtYXggKiBmKX0iIHN0cm9rZT0idmFyKC0tbGluZSkiIHN0cm9rZS1kYXNoYXJyYXk9IjMgNCIvPjx0ZXh0IHg9IiR7VyAtIDJ9IiB5PSIke3kobWF4ICogZikgKyA0fSIgdGV4dC1hbmNob3I9ImVuZCIgY2xhc3M9ImNoLWF4Ij4ke2ZtdFMobWF4ICogZil9PC90ZXh0PmA7CiAgZyArPSBgPGxpbmUgeDE9IiR7TH0iIHgyPSIke1cgLSBSfSIgeTE9IiR7eSgwKX0iIHkyPSIke3koMCl9IiBzdHJva2U9InZhcigtLWxpbmUpIi8+YDsKICBkYXlzLmZvckVhY2goKGQsIGkpID0+IHsKICAgIGNvbnN0IHggPSBMICsgc2xvdCAqIGkgKyAoc2xvdCAtIGJ3KSAvIDI7CiAgICBsZXQgYWNjID0gMDsKICAgIGNvbnN0IHNlZ3MgPSBzdGFja3MuZmlsdGVyKHMgPT4gcy52YWx1ZXNbaV0uYW1vdW50ID4gMCk7CiAgICBzZWdzLmZvckVhY2goKHMsIGspID0+IHsKICAgICAgY29uc3QgdiA9IHMudmFsdWVzW2ldLmFtb3VudCwgeTEgPSB5KGFjYyArIHYpLCB5MCA9IHkoYWNjKTsKICAgICAgY29uc3QgdG9wID0gayA9PT0gc2Vncy5sZW5ndGggLSAxOwogICAgICBjb25zdCBoID0gTWF0aC5tYXgoMCwgeTAgLSB5MSAtIChrID4gMCA/IDIgOiAwKSk7IC8vIDJweCBkZSBzZXBhcmFjacOzbiBlbnRyZSBzZWdtZW50b3MKICAgICAgZyArPSB0b3AgPyBgPHBhdGggZD0iJHtiYXJQYXRoKHgsIHkxLCBidywgaCwgNCl9IiBmaWxsPSIke3MuY29sb3J9Ii8+YCA6IGA8cmVjdCB4PSIke3h9IiB5PSIke3kxfSIgd2lkdGg9IiR7Ynd9IiBoZWlnaHQ9IiR7aH0iIGZpbGw9IiR7cy5jb2xvcn0iLz5gOwogICAgICBhY2MgKz0gdjsKICAgIH0pOwogICAgY29uc3QgaXNUb2RheSA9IGQgPT09IHRvZGF5OwogICAgaWYgKHRvdGFsc1tpXSA+IDAgJiYgKCFjb21wYWN0IHx8IGlzVG9kYXkgfHwgaSA9PT0gYmVzdEkpKSB7IGNvbnN0IGxibCA9IGZtdFModG90YWxzW2ldKSwgaHcgPSBsYmwubGVuZ3RoICogMy42OyBjb25zdCBjeCA9IE1hdGgubWluKE1hdGgubWF4KHggKyBidyAvIDIsIEwgKyBodyksIFcgLSBSIC0gaHcgKyAzMCk7IGcgKz0gYDx0ZXh0IHg9IiR7Y3h9IiB5PSIke3kodG90YWxzW2ldKSAtIDd9IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBjbGFzcz0iY2gtdmFsJHtpc1RvZGF5ID8gJyBjaC10b2RheScgOiAnJ30iPiR7bGJsfTwvdGV4dD5gOyB9CiAgICBnICs9IGA8dGV4dCB4PSIke3ggKyBidyAvIDJ9IiB5PSIke0ggLSAxMH0iIHRleHQtYW5jaG9yPSJtaWRkbGUiIGNsYXNzPSJjaC1kYXkke2lzVG9kYXkgPyAnIGNoLXRvZGF5JyA6ICcnfSI+JHtsYWJlbCA/IGVzYyhsYWJlbChkKSkgOiBpc1RvZGF5ID8gJ0hveScgOiBjb21wYWN0ID8gZGF5U2hvcnQoZCkuc2xpY2UoMCwgMikgKyAnICcgKyBkLnNsaWNlKDgpLnJlcGxhY2UoL14wLywgJycpIDogZGF5U2hvcnQoZCl9PC90ZXh0PmA7CiAgICBjb25zdCB0aXAgPSBbdGl0bGUgPyB0aXRsZShkKSA6IGRheUxvbmcoZCksIC4uLnN0YWNrcy5tYXAocyA9PiBgJHtzLmxhYmVsfTogJHtmbXRMKHMudmFsdWVzW2ldLmFtb3VudCl9JHt1bml0cyA/ICcnIDogYCDCtyAke3MudmFsdWVzW2ldLm9yZGVyc30gdmVudGEke3MudmFsdWVzW2ldLm9yZGVycyA9PT0gMSA/ICcnIDogJ3MnfWB9YCksIHN0YWNrcy5sZW5ndGggPiAxID8gYFRvdGFsOiAke2ZtdEwodG90YWxzW2ldKX1gIDogJyddLmZpbHRlcihCb29sZWFuKS5qb2luKCd8Jyk7CiAgICBnICs9IGA8cmVjdCB4PSIke0wgKyBzbG90ICogaX0iIHk9IiR7VCAtIDIwfSIgd2lkdGg9IiR7c2xvdH0iIGhlaWdodD0iJHtIIC0gVCAtIEIgKyAyMH0iIGZpbGw9InRyYW5zcGFyZW50IiBjbGFzcz0iY2gtaGl0IiBkYXRhLXRpcD0iJHtlc2ModGlwKX0iLz5gOwogIH0pOwogIHJldHVybiBgPHN2ZyB2aWV3Qm94PSIwIDAgJHtXfSAke0h9IiB3aWR0aD0iJHtXfSIgaGVpZ2h0PSIke0h9IiBjbGFzcz0iY2hhcnQiIHJvbGU9ImltZyI+JHtnfTwvc3ZnPmA7Cn0KZnVuY3Rpb24gc2FsZXNUYWJsZShkYXlzLCBkLCBsYmwpIHsKICByZXR1cm4gYDxkZXRhaWxzIGNsYXNzPSJjaC10YWJsZSI+PHN1bW1hcnk+VmVyIHRhYmxhPC9zdW1tYXJ5PjxkaXYgY2xhc3M9InRhYmxlLXdyYXAiPjx0YWJsZT48dGhlYWQ+PHRyPjx0aD4ke2xibCA/ICdQZXLDrW9kbycgOiAnRMOtYSd9PC90aD4ke1snbWwnLCAnZmEnLCAncGEnXS5tYXAoayA9PiBgPHRoPiR7TUtba119PC90aD5gKS5qb2luKCcnKX08dGg+VG90YWw8L3RoPjwvdHI+PC90aGVhZD48dGJvZHk+CiAgICAke2RheXMubWFwKChkYXksIGkpID0+IGA8dHI+PHRkPiR7ZXNjKGxibCA/IGxibChpKSA6IGRheUxvbmcoZGF5KSl9PC90ZD4ke1snbWwnLCAnZmEnLCAncGEnXS5tYXAoayA9PiBgPHRkPiR7bW9uZXkoZC5zZXJpZXNba11baV0uYW1vdW50KX0gPHNwYW4gY2xhc3M9Im11dGVkIj4oJHtkLnNlcmllc1trXVtpXS5vcmRlcnN9KTwvc3Bhbj48L3RkPmApLmpvaW4oJycpfTx0ZD48Yj4ke21vbmV5KFsnbWwnLCAnZmEnLCAncGEnXS5yZWR1Y2UoKGEsIGspID0+IGEgKyBkLnNlcmllc1trXVtpXS5hbW91bnQsIDApKX08L2I+PC90ZD48L3RyPmApLmpvaW4oJycpfQogIDwvdGJvZHk+PC90YWJsZT48L2Rpdj48L2RldGFpbHM+YDsKfQovLyA9PT09PSBDYWxjdWxhZG9yIGRlIGdhbmFuY2lhIHJlYWwgcG9yIHB1YmxpY2FjacOzbiA9PT09PQovLyBUb2RvIHNlIGNhbGN1bGEgcG9yIHVuaWRhZCB5IE5FVE8gKHNpbiBJVkEpOiBwcmVjaW8vMSwxOSDiiJIgY29zdG8vMSwxOSDiiJIgY29taXNpw7NuLzEsMTkg4oiSIGVudsOtby8xLDE5IOKIkiBwdWJsaWNpZGFkLgovLyBFbCBUQUNPUyBkZSBNZXJjYWRvIExpYnJlIGVzIG5ldG8gKGdhc3RvIHNpbiBJVkEgc29icmUgdmVudGFzIGNvbiBJVkEpOiBwdWJsaWNpZGFkIG5ldGEgPSBUQUNPUyUgw5cgcHJlY2lvLgpjb25zdCBwZiA9IHsgbWs6IG51bGwsIHE6ICcnLCBkYXRhOiBudWxsLCBzaWQ6IG51bGwsIHNvcnQ6ICdzb2xkJywgcGVyOiAnMzAnLCBtb250aDogJycsIGZyb206ICcnLCB0bzogJycgfTsKLy8gcGVyw61vZG8gcGFyYSBsYXMgdW5pZGFkZXMgdmVuZGlkYXMgKHBvciBkZWZlY3RvLCDDumx0aW1vcyAzMCBkw61hcykKZnVuY3Rpb24gcGZSYW5nZSgpIHsKICBjb25zdCB0ID0gbmV3IERhdGUoKSwgdG9kYXkgPSBpc28odCksIGJhY2sgPSBuID0+IHsgY29uc3QgZCA9IG5ldyBEYXRlKCk7IGQuc2V0RGF0ZShkLmdldERhdGUoKSAtIG4pOyByZXR1cm4gaXNvKGQpOyB9OwogIGlmIChwZi5wZXIgPT09ICd0b2RheScpIHJldHVybiBbdG9kYXksIHRvZGF5XTsKICBpZiAocGYucGVyID09PSAnNycpIHJldHVybiBbYmFjayg2KSwgdG9kYXldOwogIGlmIChwZi5wZXIgPT09ICdtb250aCcpIHJldHVybiBbdG9kYXkuc2xpY2UoMCwgOCkgKyAnMDEnLCB0b2RheV07CiAgaWYgKHBmLnBlciA9PT0gJ3BpY2snICYmIC9eXGR7NH0tXGR7Mn0kLy50ZXN0KHBmLm1vbnRoKSkgeyBjb25zdCBbeSwgbV0gPSBwZi5tb250aC5zcGxpdCgnLScpLm1hcChOdW1iZXIpOyBjb25zdCBsYXN0ID0gbmV3IERhdGUoeSwgbSwgMCkuZ2V0RGF0ZSgpOyByZXR1cm4gW3BmLm1vbnRoICsgJy0wMScsIHBmLm1vbnRoICsgJy0nICsgU3RyaW5nKGxhc3QpLnBhZFN0YXJ0KDIsICcwJyldOyB9CiAgaWYgKHBmLnBlciA9PT0gJ3JhbmdlJyAmJiBwZi5mcm9tICYmIHBmLnRvKSByZXR1cm4gcGYuZnJvbSA8PSBwZi50byA/IFtwZi5mcm9tLCBwZi50b10gOiBbcGYudG8sIHBmLmZyb21dOwogIHJldHVybiBbYmFjaygyOSksIHRvZGF5XTsKfQpjb25zdCBwZlFzID0gc2lkID0+IHsgY29uc3QgW2YsIHRdID0gcGZSYW5nZSgpOyByZXR1cm4gYCR7c2lkID8gJ3NlbGxlcl9pZD0nICsgc2lkICsgJyYnIDogJyd9ZnJvbT0ke2Z9JnRvPSR7dH1gOyB9Owpjb25zdCBJVkEgPSAxLjE5OwpmdW5jdGlvbiBwZkNhbGMociwgc3YpIHsKICBjb25zdCBwcmljZSA9IHIucHJpY2UgfHwgMDsKICBpZiAoci5jb3N0X2tleSAmJiBwZi5kYXRhPy5zYXZlZD8uW3IubWsgKyAnfCcgKyByLmNvc3Rfa2V5XT8uY29zdCAhPSBudWxsICYmIHN2LmNvc3QgPT0gbnVsbCkgc3YgPSB7IC4uLnN2LCBjb3N0OiBwZi5kYXRhLnNhdmVkW3IubWsgKyAnfCcgKyByLmNvc3Rfa2V5XS5jb3N0IH07CiAgY29uc3QgY29zdCA9IHN2LmNvc3QgIT0gbnVsbCA/IHN2LmNvc3QgOiBudWxsOwogIGNvbnN0IGZlZVBjdCA9IHIubWsgPT09ICdtbCcgPyAocHJpY2UgPyAoci5mZWUgfHwgMCkgLyBwcmljZSAqIDEwMCA6IDApIDogKHN2LmZlZV9wY3QgIT0gbnVsbCA/IHN2LmZlZV9wY3QgOiByLmZlZV9wY3QgfHwgMCk7CiAgY29uc3QgZmVlID0gci5tayA9PT0gJ21sJyA/IChyLmZlZSB8fCAwKSA6IHByaWNlICogZmVlUGN0IC8gMTAwOwogIGNvbnN0IHNoaXAgPSBzdi5zaGlwICE9IG51bGwgPyBzdi5zaGlwIDogKHIuc2hpcCB8fCAwKTsKICBjb25zdCB0YWNvcyA9IHN2LnRhY29zICE9IG51bGwgPyBzdi50YWNvcyA6IChyLnRhY29zIHx8IDApOwogIGNvbnN0IGFkcyA9IHByaWNlICogdGFjb3MgLyAxMDA7CiAgY29uc3QgcG4gPSBwcmljZSAvIElWQTsKICBjb25zdCBwcm9maXQgPSBjb3N0ID09IG51bGwgPyBudWxsIDogcG4gLSBjb3N0IC8gSVZBIC0gZmVlIC8gSVZBIC0gc2hpcCAvIElWQSAtIGFkczsKICByZXR1cm4geyBwcmljZSwgY29zdCwgZmVlLCBmZWVQY3QsIHNoaXAsIHRhY29zLCBhZHMsIHBuLCBwcm9maXQsIG1hcmdpbjogcHJvZml0ID09IG51bGwgfHwgIXBuID8gbnVsbCA6IHByb2ZpdCAvIHBuICogMTAwIH07Cn0KYXN5bmMgZnVuY3Rpb24gcmVuZGVyUHJvZml0KGZvcmNlID0gZmFsc2UpIHsKICBjb25zdCBib3ggPSAkKCcjcHJvZml0UGFuZWwnKTsgaWYgKCFib3gpIHJldHVybjsKICBpZiAoYm94LmNvbnRhaW5zKGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQpICYmIGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQudGFnTmFtZSA9PT0gJ0lOUFVUJykgcmV0dXJuOyAvLyBubyBib3JyYXIgbG8gcXVlIHNlIGVzdMOhIGVzY3JpYmllbmRvCiAgY29uc3QgaXNBZG1pbiA9IG1lLnVzZXIucm9sZSA9PT0gJ2FkbWluJzsKICBjb25zdCBzaWQgPSBpc0FkbWluID8gc3RvcmUuZ2V0KCdzYWxlc1NlbGxlcicsICcnKSA6ICcnOwogIGlmIChpc0FkbWluICYmICFzaWQpIHsgYm94LmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj48aDI+8J+SsCBDYWxjdWxhZG9yIGRlIGdhbmFuY2lhPC9oMj48L2Rpdj48ZGl2IGNsYXNzPSJwYW5lbC1ib2R5Ij48ZGl2IGNsYXNzPSJlbXB0eSI+RWxpZ2UgdW4gdmVuZGVkb3IgYXJyaWJhIChlbiAiVG9kYXMgbGFzIGN1ZW50YXMiKSBwYXJhIHZlciBsYSBnYW5hbmNpYSByZWFsIGRlIGNhZGEgcHVibGljYWNpw7NuLjwvZGl2PjwvZGl2PmA7IHJldHVybjsgfQogIGlmICghcGYuZGF0YSB8fCBwZi5zaWQgIT09IHNpZCB8fCBmb3JjZSkgewogICAgaWYgKCFwZi5kYXRhIHx8IHBmLnNpZCAhPT0gc2lkKSBib3guaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj7wn5KwIENhbGN1bGFkb3IgZGUgZ2FuYW5jaWE8L2gyPjwvZGl2PjxkaXYgY2xhc3M9InBhbmVsLWJvZHkgbXV0ZWQiPkNhcmdhbmRvIHB1YmxpY2FjaW9uZXMsIGNvbWlzaW9uZXMsIGVudsOtb3MgeSBwdWJsaWNpZGFk4oCmPC9kaXY+YDsKICAgIHRyeSB7IHBmLmRhdGEgPSBhd2FpdCBhcGkoYC9hcGkvcHJvZml0PyR7cGZRcyhzaWQpfSR7Zm9yY2UgPyAnJnJlZnJlc2g9MScgOiAnJ31gKTsgcGYuc2lkID0gc2lkOyB9CiAgICBjYXRjaCAoZSkgeyBib3guaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj7wn5KwIENhbGN1bGFkb3IgZGUgZ2FuYW5jaWE8L2gyPjwvZGl2PjxkaXYgY2xhc3M9InBhbmVsLWJvZHkiPiR7ZXNjKGUubWVzc2FnZSl9PC9kaXY+YDsgcmV0dXJuOyB9CiAgICBjbGVhclRpbWVvdXQocGYuX3QpOyBwZi5fdCA9IHNldFRpbWVvdXQoKCkgPT4geyBpZiAodGFiID09PSAnc2FsZXMnKSByZWxvYWRQcm9maXQoKTsgfSwgcGYuZGF0YS5sb2FkaW5nID8gODAwMCA6IDEyMGUzKTsKICB9CiAgZHJhd1Byb2ZpdCgpOwp9CmFzeW5jIGZ1bmN0aW9uIHJlbG9hZFByb2ZpdCgpIHsKICBpZiAodGFiICE9PSAnc2FsZXMnIHx8ICEkKCcjcHJvZml0UGFuZWwnKSkgcmV0dXJuOwogIGNvbnN0IGJ1c3kgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50Py5jbGFzc0xpc3Q/LmNvbnRhaW5zKCdwZi1pbicpOwogIGlmICghYnVzeSkgeyB0cnkgeyBjb25zdCBkID0gYXdhaXQgYXBpKGAvYXBpL3Byb2ZpdD8ke3BmUXMocGYuc2lkKX1gKTsgZC5zYXZlZCA9IHsgLi4uZC5zYXZlZCwgLi4uKHBmLmRhdGE/LnNhdmVkIHx8IHt9KSB9OyBwZi5kYXRhID0gZDsgZHJhd1Byb2ZpdCgpOyB9IGNhdGNoIHsgLyogcmVpbnRlbnRhICovIH0gfQogIC8vIG1pZW50cmFzIGNhcmdhIHNlIGNvbnN1bHRhIHNlZ3VpZG87IGRlc3B1w6lzIGNhZGEgMiBtaW51dG9zIHBhcmEgdGVuZXIgbG9zIHByZWNpb3MgZGUgcHJvbW9jacOzbiBhbCBkw61hCiAgY2xlYXJUaW1lb3V0KHBmLl90KTsgcGYuX3QgPSBzZXRUaW1lb3V0KHJlbG9hZFByb2ZpdCwgYnVzeSB8fCBwZi5kYXRhPy5sb2FkaW5nID8gODAwMCA6IDEyMGUzKTsKfQpmdW5jdGlvbiBkcmF3UHJvZml0KCkgewogIGNvbnN0IGJveCA9ICQoJyNwcm9maXRQYW5lbCcpOyBpZiAoIWJveCB8fCAhcGYuZGF0YSkgcmV0dXJuOwogIGNvbnN0IGQgPSBwZi5kYXRhOwogIGNvbnN0IG1rcyA9IFsnbWwnLCAnZmEnLCAncGEnXS5maWx0ZXIoayA9PiBkLnJvd3Muc29tZShyID0+IHIubWsgPT09IGspKTsKICBpZiAoIW1rcy5pbmNsdWRlcyhwZi5taykpIHBmLm1rID0gbWtzWzBdIHx8ICdtbCc7CiAgY29uc3Qgc3ZPZiA9IHIgPT4gZC5zYXZlZFtyLm1rICsgJ3wnICsgci5rZXldIHx8IHt9OwogIGxldCByb3dzID0gZC5yb3dzLmZpbHRlcihyID0+IHIubWsgPT09IHBmLm1rKTsKICBpZiAocGYucSkgcm93cyA9IHJvd3MuZmlsdGVyKHIgPT4gW3IudGl0bGUsIHIuc2t1LCByLmlkXS5qb2luKCcgJykudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhwZi5xKSk7CiAgY29uc3Qgc29sZCA9IHIgPT4gci5tayA9PT0gJ21sJyA/IChyLnNvbGQgfHwgMCkgOiAoci51bml0czkwIHx8IDApOwogIHJvd3Muc29ydCgoYSwgYikgPT4gcGYuc29ydCA9PT0gJ3VuaXRzJyA/IChiLnVuaXRzIHx8IDApIC0gKGEudW5pdHMgfHwgMCkgOiBwZi5zb3J0ID09PSAnbWFyZ2luJyA/ICgocGZDYWxjKGEsIHN2T2YoYSkpLm1hcmdpbiA/PyAxZTkpIC0gKHBmQ2FsYyhiLCBzdk9mKGIpKS5tYXJnaW4gPz8gMWU5KSkgOiBzb2xkKGIpIC0gc29sZChhKSk7CiAgY29uc3QgYWxsID0gZC5yb3dzLmZpbHRlcihyID0+IHIubWsgPT09IHBmLm1rKSwgd2l0aENvc3QgPSBhbGwuZmlsdGVyKHIgPT4gcGZDYWxjKHIsIHN2T2YocikpLmNvc3QgIT0gbnVsbCk7CiAgY29uc3QgYXZnTSA9IHdpdGhDb3N0Lmxlbmd0aCA/IHdpdGhDb3N0LnJlZHVjZSgoYSwgcikgPT4gYSArIChwZkNhbGMociwgc3ZPZihyKSkubWFyZ2luIHx8IDApLCAwKSAvIHdpdGhDb3N0Lmxlbmd0aCA6IG51bGw7CiAgY29uc3QgbmVnID0gd2l0aENvc3QuZmlsdGVyKHIgPT4gKHBmQ2FsYyhyLCBzdk9mKHIpKS5wcm9maXQgfHwgMCkgPCAwKS5sZW5ndGg7CiAgLy8gdG90YWxlcyBkZWwgcGVyw61vZG8gKHVuaWRhZGVzIHZlbmRpZGFzIMOXIGNvc3RvIHkgw5cgZ2FuYW5jaWEgcG9yIHVuaWRhZCkKICBsZXQgdFUgPSAwLCB0U2FsZSA9IDAsIHRDb3N0ID0gMCwgdFByb2ZpdCA9IDAsIHRNaXNzaW5nID0gMDsKICBmb3IgKGNvbnN0IHIgb2YgYWxsKSB7IGNvbnN0IGMgPSBwZkNhbGMociwgc3ZPZihyKSksIHUgPSByLnVuaXRzIHx8IDA7IHRVICs9IHU7IHRTYWxlICs9IGMucHJpY2UgKiB1OyBpZiAoYy5jb3N0ID09IG51bGwpIHsgaWYgKHUpIHRNaXNzaW5nICs9IHU7IGNvbnRpbnVlOyB9IHRDb3N0ICs9IGMuY29zdCAqIHU7IHRQcm9maXQgKz0gYy5wcm9maXQgKiB1OyB9CiAgLy8gZ2FuYW5jaWEgcGVyZGlkYSBwb3IgZGV2b2x1Y2lvbmVzICh0b2RvcyBsb3MgbWFya2V0cGxhY2VzKTogZ2FuYW5jaWEvdSDDlyB1bmlkYWRlcyBkZXZ1ZWx0YXMgZGUgY2FkYSBwdWJsaWNhY2nDs247CiAgLy8gbGFzIGRldm9sdWNpb25lcyBxdWUgbm8gY2FsemFuIGNvbiB1bmEgcHVibGljYWNpw7NuIHNlIGVzdGltYW4gY29uIGVsIG1hcmdlbiBkZWwgbWFya2V0cGxhY2UKICBsZXQgcmV0TG9zdCA9IDAsIGFsbFByb2ZpdCA9IDA7IGNvbnN0IGxvc3RCeSA9IHt9OwogIGNvbnN0IG1rTSA9IHt9OwogIGZvciAoY29uc3QgciBvZiBkLnJvd3MpIHsgY29uc3QgYyA9IHBmQ2FsYyhyLCBzdk9mKHIpKTsgaWYgKGMuY29zdCA9PSBudWxsKSBjb250aW51ZTsgYWxsUHJvZml0ICs9IGMucHJvZml0ICogKHIudW5pdHMgfHwgMCk7IGNvbnN0IG0gPSBta01bci5ta10gfHw9IHsgcDogMCwgczogMCB9OyBtLnAgKz0gYy5wcm9maXQgKiAoci51bml0cyB8fCAxKTsgbS5zICs9IGMucHJpY2UgKiAoci51bml0cyB8fCAxKTsKICAgIGlmIChyLnJldF91bml0cykgeyByZXRMb3N0ICs9IGMucHJvZml0ICogci5yZXRfdW5pdHM7IGxvc3RCeVtyLm1rXSA9IChsb3N0Qnlbci5ta10gfHwgMCkgKyBjLnByb2ZpdCAqIHIucmV0X3VuaXRzOyB9IH0KICBmb3IgKGNvbnN0IFtrLCBsXSBvZiBPYmplY3QuZW50cmllcyhkLnJldF9sb29zZSB8fCB7fSkpIGlmIChta01ba10/LnMpIHsgY29uc3QgdiA9IGwuYW1vdW50ICogbWtNW2tdLnAgLyBta01ba10uczsgcmV0TG9zdCArPSB2OyBsb3N0Qnlba10gPSAobG9zdEJ5W2tdIHx8IDApICsgdjsgfQogIHJldExvc3QgPSBNYXRoLm1heCgwLCBNYXRoLnJvdW5kKHJldExvc3QpKTsKICAvLyBsb2fDrXN0aWNhIGludmVyc2EgKGNvbiBJVkEpOiBNZXJjYWRvIExpYnJlIGxhIHRyYWUgZGUgbGEgQVBJOyBGYWxhYmVsbGEgeSBQYXJpcyA9IG1vbnRvIHBvciBkZXZvbHVjacOzbiBxdWUgcG9uZSBlbCB2ZW5kZWRvcgogIGNvbnN0IHJldlBlciA9IGsgPT4gZC5zYXZlZFtrICsgJ3xSRVRfTE9HJ10/LnNoaXAgPz8gbnVsbDsKICBjb25zdCByZXZPZiA9IGsgPT4gIWQucmV0dXJucyA/IDAgOiBrID09PSAnbWwnID8gKGQucmV0dXJucy5ieS5tbC5yZXYgfHwgMCkgOiAocmV2UGVyKGspIHx8IDApICogKGQucmV0dXJucy5ieVtrXS5uIHx8IDApOwogIGNvbnN0IHJldk5ldCA9IE1hdGgucm91bmQoWydtbCcsICdmYScsICdwYSddLnJlZHVjZSgoYSwgaykgPT4gYSArIHJldk9mKGspLCAwKSAvIElWQSk7CiAgY29uc3QgW3BGcm9tLCBwVG9dID0gcGZSYW5nZSgpOwogIGNvbnN0IGZtdEQgPSB4ID0+IG5ldyBEYXRlKHggKyAnVDEyOjAwOjAwJykudG9Mb2NhbGVEYXRlU3RyaW5nKCdlcy1DTCcsIHsgZGF5OiAnbnVtZXJpYycsIG1vbnRoOiAnc2hvcnQnIH0pOwogIGNvbnN0IGlucCA9IChyLCBmLCB2LCBwaCwgdykgPT4gYDxpbnB1dCBjbGFzcz0icGYtaW4iIHR5cGU9Im51bWJlciIgaW5wdXRtb2RlPSJkZWNpbWFsIiBzdGVwPSJhbnkiIG1pbj0iMCIgZGF0YS1rPSIke2VzYyhyLmtleSl9IiBkYXRhLWY9IiR7Zn0iIHZhbHVlPSIke3YgPT0gbnVsbCA/ICcnIDogdn0iIHBsYWNlaG9sZGVyPSIke2VzYyhwaCl9IiBzdHlsZT0id2lkdGg6JHt3fXB4Ij5gOwogIGNvbnN0IHBjdCA9IG4gPT4gKE1hdGgucm91bmQobiAqIDEwKSAvIDEwKS50b0xvY2FsZVN0cmluZygnZXMtQ0wnKSArICclJzsKICBjb25zdCByb3dIdG1sID0gciA9PiB7CiAgICBjb25zdCBzdiA9IHN2T2YociksIGMgPSBwZkNhbGMociwgc3YpOwogICAgY29uc3QgY2xzID0gYy5wcm9maXQgPT0gbnVsbCA/ICcnIDogYy5tYXJnaW4gPCAwID8gJ25lZycgOiBjLm1hcmdpbiA8IDEwID8gJ2xvdycgOiAnb2snOwogICAgY29uc3QgdGlwID0gYy5wcm9maXQgPT0gbnVsbCA/ICcnIDogYFByZWNpbyBuZXRvICR7bW9uZXkoYy5wbil9IOKIkiBjb3N0byAke21vbmV5KGMuY29zdCAvIElWQSl9IOKIkiBjb21pc2nDs24gJHttb25leShjLmZlZSAvIElWQSl9IOKIkiBlbnbDrW8gJHttb25leShjLnNoaXAgLyBJVkEpfSDiiJIgcHVibGljaWRhZCAke21vbmV5KGMuYWRzKX0gKHRvZG8gc2luIElWQSlgOwogICAgcmV0dXJuIGA8dHIgY2xhc3M9InBmLXJvdyAke2Nsc30iIGRhdGEtY2s9IiR7ZXNjKHIuY29zdF9rZXkgfHwgJycpfSIgZGF0YS1yaz0iJHtlc2Moci5rZXkpfSI+CiAgICAgIDx0ZD48ZGl2IGNsYXNzPSJwZi1wcm9kIj4ke3IudGh1bWIgPyBgPGltZyBzcmM9IiR7ZXNjKHIudGh1bWIpfSIgYWx0PSIiIGxvYWRpbmc9ImxhenkiIG9uZXJyb3I9InRoaXMucmVtb3ZlKCkiPmAgOiAnJ308ZGl2PjxiIHRpdGxlPSIke2VzYyhyLnRpdGxlKX0iPiR7ZXNjKHIudGl0bGUpfTwvYj48c21hbGw+JHtyLmxpc3RpbmcgPyBgPHNwYW4gY2xhc3M9InBmLWx0ICR7ci5saXN0aW5nX3R5cGUgPT09ICdnb2xkX3BybycgPyAncHJvJyA6ICdjbGEnfSI+JHtlc2Moci5saXN0aW5nKX08L3NwYW4+IGAgOiAnJ30ke2VzYyhbci52YXJpYW50cyA+IDEgPyByLnZhcmlhbnRzICsgJyB2YXJpYW50ZXMnIDogJycsIHIuc2t1ICYmICgvIFNLVSQvLnRlc3Qoci5za3UpID8gci5za3UgOiAnU0tVICcgKyByLnNrdSksIHIubWsgPT09ICdtbCcgJiYgci52YXJpYW50cyA8PSAxID8gci5pZCA6ICcnLCByLmxvZ2lzdGljXS5maWx0ZXIoQm9vbGVhbikuam9pbignIMK3ICcpKX0ke3NvbGQocikgPyBgIMK3ICR7c29sZChyKS50b0xvY2FsZVN0cmluZygnZXMtQ0wnKX0gdmVuZGlkYXMke3IubWsgPT09ICdtbCcgPyAnIGVuIHRvdGFsJyA6ICcgKDkwIGTDrWFzKSd9YCA6ICcnfTwvc21hbGw+PC9kaXY+PC9kaXY+PC90ZD4KICAgICAgPHRkIGNsYXNzPSJudW0iPjxiPiR7bW9uZXkoYy5wcmljZSl9PC9iPiR7ci5yZWd1bGFyICYmIHIucmVndWxhciA+IGMucHJpY2UgPyBgPHNtYWxsPjxzPiR7bW9uZXkoci5yZWd1bGFyKX08L3M+IHByb21vPC9zbWFsbD5gIDogci5tayAhPT0gJ21sJyAmJiAhci5iYXNlID8gJycgOiByLmJhc2UgJiYgci5iYXNlID4gYy5wcmljZSA/IGA8c21hbGw+PHM+JHttb25leShyLmJhc2UpfTwvcz4gb2ZlcnRhPC9zbWFsbD5gIDogJyd9PC90ZD4KICAgICAgPHRkIGNsYXNzPSJudW0iPiR7aW5wKHIsICdjb3N0JywgYy5jb3N0LCAnY29uIElWQScsIDg4KX08L3RkPgogICAgICA8dGQgY2xhc3M9Im51bSI+JHtyLm1rID09PSAnbWwnID8gKHIuZmVlID09IG51bGwgPyAnPHNwYW4gY2xhc3M9Im11dGVkIj7igJQ8L3NwYW4+JyA6IGAke21vbmV5KGMuZmVlKX08c21hbGw+JHtwY3QoYy5mZWVQY3QpfTwvc21hbGw+YCkgOiBgJHttb25leShjLmZlZSl9PHNtYWxsPiR7aW5wKHIsICdmZWVfcGN0Jywgc3YuZmVlX3BjdCwgU3RyaW5nKHIuZmVlX3BjdCksIDUyKX0lPC9zbWFsbD5gfTwvdGQ+CiAgICAgIDx0ZCBjbGFzcz0ibnVtIj4ke3IubWsgPT09ICdtbCcgPyBgJHtzdi5zaGlwICE9IG51bGwgPyBpbnAociwgJ3NoaXAnLCBzdi5zaGlwLCAnJywgNjQpIDogci5zaGlwID09IG51bGwgPyAnPHNwYW4gY2xhc3M9Im11dGVkIj7igJQ8L3NwYW4+JyA6IG1vbmV5KGMuc2hpcCl9PHNtYWxsIHRpdGxlPSIke2VzYyhyLnNoaXBfc3JjIHx8ICcnKX0iPiR7ZXNjKHIuc2hpcF9zcmMgPT09ICdNZXJjYWRvIExpYnJlJyA/ICdsbyBjb2JyYSBNTCcgOiByLnNoaXBfc3JjIHx8ICcnKX08L3NtYWxsPmAgOiBpbnAociwgJ3NoaXAnLCBzdi5zaGlwLCAnMCcsIDcwKX08L3RkPgogICAgICA8dGQgY2xhc3M9Im51bSI+JHtpbnAociwgJ3RhY29zJywgc3YudGFjb3MsIHIudGFjb3MgIT0gbnVsbCA/IFN0cmluZyhNYXRoLnJvdW5kKHIudGFjb3MgKiAxMCkgLyAxMCkgOiAnMCcsIDUyKX08c21hbGw+JHtzdi50YWNvcyAhPSBudWxsID8gJ21hbnVhbCcgOiBlc2Moci50YWNvc19zcmMgfHwgJycpfTwvc21hbGw+PC90ZD4KICAgICAgPHRkIGNsYXNzPSJudW0gcGYtcmVzIiB0aXRsZT0iJHtlc2ModGlwKX0iPiR7Yy5wcm9maXQgPT0gbnVsbCA/ICc8c3BhbiBjbGFzcz0ibXV0ZWQiPnBvbiBlbCBjb3N0bzwvc3Bhbj4nIDogYDxiPiR7Yy5wcm9maXQgPCAwID8gJ+KIkicgKyBtb25leSgtYy5wcm9maXQpIDogbW9uZXkoYy5wcm9maXQpfTwvYj48c21hbGw+JHtwY3QoYy5tYXJnaW4pfSBtYXJnZW48L3NtYWxsPmB9PC90ZD4KICAgICAgPHRkIGNsYXNzPSJudW0gcGYtdSI+PGI+JHsoci51bml0cyB8fCAwKS50b0xvY2FsZVN0cmluZygnZXMtQ0wnKX08L2I+PC90ZD4KICAgICAgPHRkIGNsYXNzPSJudW0iPiR7Yy5jb3N0ID09IG51bGwgPyAnPHNwYW4gY2xhc3M9Im11dGVkIj7igJQ8L3NwYW4+JyA6IG1vbmV5KGMuY29zdCAqIChyLnVuaXRzIHx8IDApKX08L3RkPgogICAgICA8dGQgY2xhc3M9Im51bSBwZi1yZXMgcGYtdG90Ij4ke2MucHJvZml0ID09IG51bGwgPyAnPHNwYW4gY2xhc3M9Im11dGVkIj7igJQ8L3NwYW4+JyA6IGA8Yj4ke2MucHJvZml0ICogKHIudW5pdHMgfHwgMCkgPCAwID8gJ+KIkicgKyBtb25leSgtYy5wcm9maXQgKiAoci51bml0cyB8fCAwKSkgOiBtb25leShjLnByb2ZpdCAqIChyLnVuaXRzIHx8IDApKX08L2I+YH08L3RkPgogICAgPC90cj5gOwogIH07CiAgYm94LmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj48aDI+8J+SsCBDYWxjdWxhZG9yIGRlIGdhbmFuY2lhPC9oMj48c3BhbiBjbGFzcz0ibXV0ZWQiPkdhbmFuY2lhIG5ldGEgcmVhbCBwb3IgdW5pZGFkIChzaW4gSVZBKTwvc3Bhbj48L2Rpdj4KICAgIDxkaXYgY2xhc3M9InBhbmVsLWJvZHkiPgogICAgICA8ZGl2IGNsYXNzPSJwZi1iYXIiPgogICAgICAgIDxzcGFuIGNsYXNzPSJwZi10YWJzIj4ke21rcy5tYXAoayA9PiBgPGJ1dHRvbiBkYXRhLXBmbWs9IiR7a30iIGFyaWEtcHJlc3NlZD0iJHtwZi5tayA9PT0ga30iPjxpIGNsYXNzPSJkb3QiIHN0eWxlPSJiYWNrZ3JvdW5kOiR7TUtfQ09MT1Jba119Ij48L2k+JHtNS1trXX08L2J1dHRvbj5gKS5qb2luKCcnKSB8fCAnPHNwYW4gY2xhc3M9Im11dGVkIj5TaW4gcHVibGljYWNpb25lcyB0b2RhdsOtYTwvc3Bhbj4nfTwvc3Bhbj4KICAgICAgICA8aW5wdXQgdHlwZT0ic2VhcmNoIiBpZD0icGZRIiBwbGFjZWhvbGRlcj0iQnVzY2FyIHByb2R1Y3RvIG8gU0tVIiB2YWx1ZT0iJHtlc2MocGYucSl9Ij4KICAgICAgICA8c2VsZWN0IGlkPSJwZlNvcnQiIHN0eWxlPSJ3aWR0aDphdXRvIj48b3B0aW9uIHZhbHVlPSJzb2xkIiAke3BmLnNvcnQgPT09ICdzb2xkJyA/ICdzZWxlY3RlZCcgOiAnJ30+TcOhcyB2ZW5kaWRvczwvb3B0aW9uPjxvcHRpb24gdmFsdWU9InVuaXRzIiAke3BmLnNvcnQgPT09ICd1bml0cycgPyAnc2VsZWN0ZWQnIDogJyd9Pk3DoXMgdmVuZGlkb3MgZW4gZWwgcGVyw61vZG88L29wdGlvbj48b3B0aW9uIHZhbHVlPSJtYXJnaW4iICR7cGYuc29ydCA9PT0gJ21hcmdpbicgPyAnc2VsZWN0ZWQnIDogJyd9Pk1lbm9yIG1hcmdlbiBwcmltZXJvPC9vcHRpb24+PC9zZWxlY3Q+CiAgICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1naG9zdCBidG4tc20iIGlkPSJwZlJlZnJlc2giPiR7SS5zeW5jfUFjdHVhbGl6YXIgZGF0b3M8L2J1dHRvbj4KICAgICAgPC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9InBmLXBlciI+CiAgICAgICAgPHNwYW4gY2xhc3M9InBmLXBlci1sIj5QZXLDrW9kbzo8L3NwYW4+CiAgICAgICAgPHNwYW4gY2xhc3M9InBmLXRhYnMgcGYtcHRhYnMiPiR7W1sndG9kYXknLCAnSG95J10sIFsnNycsICc3IGTDrWFzJ10sIFsnMzAnLCAnMzAgZMOtYXMnXSwgWydtb250aCcsICdFc3RlIG1lcyddLCBbJ3BpY2snLCAnTWVzJ10sIFsncmFuZ2UnLCAnRmVjaGFzJ11dLm1hcCgoW2ssIG5dKSA9PiBgPGJ1dHRvbiBkYXRhLXBmcGVyPSIke2t9IiBhcmlhLXByZXNzZWQ9IiR7cGYucGVyID09PSBrfSI+JHtufTwvYnV0dG9uPmApLmpvaW4oJycpfTwvc3Bhbj4KICAgICAgICAke3BmLnBlciA9PT0gJ3BpY2snID8gYDxpbnB1dCB0eXBlPSJtb250aCIgaWQ9InBmTW9udGgiIHZhbHVlPSIke2VzYyhwZi5tb250aCB8fCBpc28obmV3IERhdGUoKSkuc2xpY2UoMCwgNykpfSI+YCA6ICcnfQogICAgICAgICR7cGYucGVyID09PSAncmFuZ2UnID8gYDxpbnB1dCB0eXBlPSJkYXRlIiBpZD0icGZGcm9tIiB2YWx1ZT0iJHtlc2MocGYuZnJvbSB8fCBwRnJvbSl9Ij4g4oCTIDxpbnB1dCB0eXBlPSJkYXRlIiBpZD0icGZUbyIgdmFsdWU9IiR7ZXNjKHBmLnRvIHx8IHBUbyl9Ij5gIDogJyd9CiAgICAgICAgPHNwYW4gY2xhc3M9Im11dGVkIHBmLXBlci1kIj4ke2VzYyhwRnJvbSA9PT0gcFRvID8gZm10RChwRnJvbSkgOiBmbXREKHBGcm9tKSArICcgYWwgJyArIGZtdEQocFRvKSl9PC9zcGFuPgogICAgICA8L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0icGYta3BpcyI+CiAgICAgICAgPGRpdj48c21hbGw+VW5pZGFkZXMgdmVuZGlkYXM8L3NtYWxsPjxiPiR7dFUudG9Mb2NhbGVTdHJpbmcoJ2VzLUNMJyl9PC9iPjwvZGl2PgogICAgICAgIDxkaXY+PHNtYWxsPlZlbnRhIChwcmVjaW8gYWN0dWFsKTwvc21hbGw+PGI+JHttb25leSh0U2FsZSl9PC9iPjwvZGl2PgogICAgICAgIDxkaXY+PHNtYWxsPkNvc3RvIHRvdGFsIChjb24gSVZBKTwvc21hbGw+PGI+JHttb25leSh0Q29zdCl9PC9iPjwvZGl2PgogICAgICAgIDxkaXYgY2xhc3M9IiR7dFByb2ZpdCA8IDAgPyAnbmVnJyA6ICdwb3MnfSI+PHNtYWxsPkdhbmFuY2lhIHRvdGFsIChuZXRhKTwvc21hbGw+PGI+JHt0UHJvZml0IDwgMCA/ICfiiJInICsgbW9uZXkoLXRQcm9maXQpIDogbW9uZXkodFByb2ZpdCl9PC9iPiR7dE1pc3NpbmcgPyBgPHNwYW4+JHt0TWlzc2luZ30gdS4gc2luIGNvc3RvIGNhcmdhZG8gbm8gc3VtYW48L3NwYW4+YCA6ICcnfTwvZGl2PgogICAgICA8L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0icGYtc3VtIj4ke3dpdGhDb3N0Lmxlbmd0aCA/IGBNYXJnZW4gcHJvbWVkaW8gPGIgY2xhc3M9IiR7YXZnTSA8IDAgPyAnbmVnJyA6ICcnfSI+JHtwY3QoYXZnTSl9PC9iPiDCtyBgIDogJyd9Q29zdG8gY2FyZ2FkbyBlbiA8Yj4ke3dpdGhDb3N0Lmxlbmd0aH08L2I+IGRlICR7YWxsLmxlbmd0aH0ke25lZyA/IGAgwrcgPGIgY2xhc3M9Im5lZyI+JHtuZWd9IGNvbiBww6lyZGlkYTwvYj5gIDogJyd9JHtkLmxvYWRpbmcgPyAnIMK3IDxzcGFuIGNsYXNzPSJtdXRlZCI+YWN0dWFsaXphbmRvIGRhdG9zIGRlbCBtYXJrZXRwbGFjZeKApjwvc3Bhbj4nIDogJyd9PC9kaXY+CiAgICAgICR7cm93cy5sZW5ndGggPyBgPGRpdiBjbGFzcz0idGFibGUtd3JhcCBwZi13cmFwIj48dGFibGUgY2xhc3M9InBmLXRhYmxlIj48dGhlYWQ+PHRyPjx0aD5QdWJsaWNhY2nDs248L3RoPjx0aCBjbGFzcz0ibnVtIj5QcmVjaW88L3RoPjx0aCBjbGFzcz0ibnVtIj5Db3N0byBjb24gSVZBPC90aD48dGggY2xhc3M9Im51bSI+Q29taXNpw7NuPC90aD48dGggY2xhc3M9Im51bSI+RW52w61vPC90aD48dGggY2xhc3M9Im51bSI+VEFDT1MgJTwvdGg+PHRoIGNsYXNzPSJudW0iPkdhbmFuY2lhIC8gdTwvdGg+PHRoIGNsYXNzPSJudW0iPlZlbmRpZGFzPC90aD48dGggY2xhc3M9Im51bSI+Q29zdG8gdG90YWw8L3RoPjx0aCBjbGFzcz0ibnVtIj5HYW5hbmNpYSB0b3RhbDwvdGg+PC90cj48L3RoZWFkPjx0Ym9keT4ke3Jvd3Muc2xpY2UoMCwgMzAwKS5tYXAocm93SHRtbCkuam9pbignJyl9PC90Ym9keT48L3RhYmxlPjwvZGl2PmAgOiBgPGRpdiBjbGFzcz0iZW1wdHkiPiR7ZC5sb2FkaW5nID8gJ1RyYXllbmRvIHR1cyBwdWJsaWNhY2lvbmVz4oCmJyA6ICdObyBoYXkgcHVibGljYWNpb25lcyBwYXJhIG1vc3RyYXIuJ308L2Rpdj5gfQogICAgICAke2QucmV0dXJucyA/ICgoKSA9PiB7IGNvbnN0IFIgPSBkLnJldHVybnMsIFQgPSBSLnRvdGFsOyByZXR1cm4gYDxkaXYgY2xhc3M9InBmLXJldCI+CiAgICAgICAgPGRpdiBjbGFzcz0icGYtcmV0LWgiPjxiPuKGqe+4jyBEZXZvbHVjaW9uZXMgZGVsIHBlcsOtb2RvPC9iPjxzcGFuIGNsYXNzPSJtdXRlZCI+JHtSLnN5bmNpbmcgJiYgIVIuc3luY2VkX2F0ID8gJ3RyYXllbmRvIGRldm9sdWNpb25lc+KApicgOiBlc2MocEZyb20gPT09IHBUbyA/IGZtdEQocEZyb20pIDogZm10RChwRnJvbSkgKyAnIGFsICcgKyBmbXREKHBUbykpfTwvc3Bhbj48L2Rpdj4KICAgICAgICA8ZGl2IGNsYXNzPSJwZi1rcGlzIj4KICAgICAgICAgIDxkaXY+PHNtYWxsPkRldm9sdWNpb25lczwvc21hbGw+PGI+JHtULm4udG9Mb2NhbGVTdHJpbmcoJ2VzLUNMJyl9PC9iPjxzcGFuPiR7VC51bml0cy50b0xvY2FsZVN0cmluZygnZXMtQ0wnKX0gdW5pZGFkZXM8L3NwYW4+PC9kaXY+CiAgICAgICAgICA8ZGl2IGNsYXNzPSJwZi1yZXQtbW9uZXkiPjxzbWFsbD5QbGF0YSBkZXZ1ZWx0YTwvc21hbGw+PGIgY2xhc3M9Im5lZ2MiPiR7bW9uZXkoVC5uZXQpfTwvYj48c3Bhbj5uZXRvIChzaW4gSVZBKTwvc3Bhbj48c3Bhbj48Yj4ke21vbmV5KFQuYW1vdW50KX08L2I+IGNvbiBJVkE8L3NwYW4+PC9kaXY+CiAgICAgICAgICA8ZGl2IGNsYXNzPSJuZWciPjxzbWFsbD5HYW5hbmNpYSBxdWUgdGUgcmVzdGFuPC9zbWFsbD48Yj7iiJIke21vbmV5KHJldExvc3QgKyByZXZOZXQpfTwvYj48c3Bhbj4ke21vbmV5KHJldExvc3QpfSBkZSBnYW5hbmNpYSBwZXJkaWRhICsgJHttb25leShyZXZOZXQpfSBkZSBsb2fDrXN0aWNhIGludmVyc2EgKG5ldG8pPC9zcGFuPjxzcGFuPkdhbmFuY2lhIGRlIHRvZG9zIGxvcyBtYXJrZXRwbGFjZXMgJHttb25leShhbGxQcm9maXQpfSDiiJIgJHttb25leShyZXRMb3N0ICsgcmV2TmV0KX0gPSA8Yj4ke2FsbFByb2ZpdCAtIHJldExvc3QgLSByZXZOZXQgPCAwID8gJ+KIkicgKyBtb25leShyZXRMb3N0ICsgcmV2TmV0IC0gYWxsUHJvZml0KSA6IG1vbmV5KGFsbFByb2ZpdCAtIHJldExvc3QgLSByZXZOZXQpfTwvYj48L3NwYW4+PC9kaXY+CiAgICAgICAgICA8ZGl2IGNsYXNzPSJwZi1yZXQtYnltayI+PHNtYWxsPlBvciBtYXJrZXRwbGFjZTwvc21hbGw+JHtbJ21sJywgJ2ZhJywgJ3BhJ10uZmlsdGVyKGsgPT4gUi5ieVtrXS5uIHx8IGQucm93cy5zb21lKHIgPT4gci5tayA9PT0gaykpLm1hcChrID0+IGA8ZGl2IGNsYXNzPSJwZi1yZXQtbWsiPjxkaXY+PGkgY2xhc3M9ImRvdCIgc3R5bGU9ImJhY2tncm91bmQ6JHtNS19DT0xPUltrXX0iPjwvaT4ke01LW2tdfTogPGI+JHtSLmJ5W2tdLm59PC9iPiBkZXZvbC4gwrcgPGI+JHttb25leShSLmJ5W2tdLmFtb3VudCAvIElWQSl9PC9iPiBkZXZ1ZWx0byBuZXRvPC9kaXY+PGRpdiBjbGFzcz0icGYtcmV0LWxvc3QiPkRlamFzdGUgZGUgZ2FuYXIgPGI+4oiSJHttb25leShNYXRoLnJvdW5kKGxvc3RCeVtrXSB8fCAwKSArIE1hdGgucm91bmQocmV2T2YoaykgLyBJVkEpKX08L2I+IG5ldG8ke3Jldk9mKGspID8gYCA8c21hbGw+KGluY2x1eWUgJHttb25leShyZXZPZihrKSAvIElWQSl9IGRlIGxvZ8Otc3RpY2EgaW52ZXJzYSk8L3NtYWxsPmAgOiAnJ308L2Rpdj48L2Rpdj5gKS5qb2luKCcnKSB8fCAn4oCUJ308L2Rpdj4KICAgICAgICA8L2Rpdj4KICAgICAgICA8ZGl2IGNsYXNzPSJwZi1yZXYiPgogICAgICAgICAgPGI+8J+amiBMb2fDrXN0aWNhIGludmVyc2E8L2I+IDxzcGFuIGNsYXNzPSJtdXRlZCI+KGxvIHF1ZSB0ZSBjb2JyYSBlbCBtYXJrZXRwbGFjZSBwb3IgdHJhZXIgZGUgdnVlbHRhIGVsIHByb2R1Y3RvOyBzZSByZXN0YSBkZSBsYSBnYW5hbmNpYSk8L3NwYW4+CiAgICAgICAgICA8ZGl2IGNsYXNzPSJwZi1yZXYtcm93Ij4KICAgICAgICAgICAgPHNwYW4+PGkgY2xhc3M9ImRvdCIgc3R5bGU9ImJhY2tncm91bmQ6JHtNS19DT0xPUi5tbH0iPjwvaT5NZXJjYWRvIExpYnJlOiA8Yj4ke21vbmV5KHJldk9mKCdtbCcpKX08L2I+IDxzbWFsbCBjbGFzcz0ibXV0ZWQiPmF1dG9tw6F0aWNvOiBzb2xvIGN1YW5kbyBNZXJjYWRvIExpYnJlIG5vIGN1YnJlIGxhIGRldm9sdWNpw7NuPC9zbWFsbD48L3NwYW4+CiAgICAgICAgICAgICR7WydmYScsICdwYSddLm1hcChrID0+IGA8c3Bhbj48aSBjbGFzcz0iZG90IiBzdHlsZT0iYmFja2dyb3VuZDoke01LX0NPTE9SW2tdfSI+PC9pPiR7TUtba119OiA8aW5wdXQgY2xhc3M9InBmLWluIHBmLXJ2IiB0eXBlPSJudW1iZXIiIGlucHV0bW9kZT0iZGVjaW1hbCIgbWluPSIwIiBzdGVwPSJhbnkiIGRhdGEtcnY9IiR7a30iIHZhbHVlPSIke3JldlBlcihrKSA/PyAnJ30iIHBsYWNlaG9sZGVyPSIkIHBvciBkZXZvbHVjacOzbiIgc3R5bGU9IndpZHRoOjEyMHB4Ij4gPHNtYWxsIGNsYXNzPSJtdXRlZCI+Y29uIElWQSDDlyAke1IuYnlba10ubn0gPSA8Yj4ke21vbmV5KHJldk9mKGspKX08L2I+PC9zbWFsbD48L3NwYW4+YCkuam9pbignJyl9CiAgICAgICAgICA8L2Rpdj4KICAgICAgICA8L2Rpdj4KICAgICAgPC9kaXY+YDsgfSkoKSA6ICcnfQogICAgICA8cCBjbGFzcz0ibXV0ZWQgcGYtbm90ZSI+RXNjcmliZSBlbCBjb3N0byBkZSBjYWRhIHByb2R1Y3RvIDxiPmNvbiBJVkE8L2I+OyBzZSBndWFyZGEgc29sby4gTGEgZ2FuYW5jaWEgZXMgbmV0YTogc2UgZGVzY3VlbnRhIGVsIElWQSBkZWwgcHJlY2lvLCBkZWwgY29zdG8sIGRlIGxhIGNvbWlzacOzbiB5IGRlbCBlbnbDrW8uIEVsIFRBQ09TIGRlIE1lcmNhZG8gTGlicmUgdmllbmUgbmV0byAoc2luIElWQSkgZGUgTWVyY2FkbyBBZHMsIMO6bHRpbW9zIDMwIGTDrWFzOyBwdWVkZXMgY29ycmVnaXJsbyBhIG1hbm8uIEVuIEZhbGFiZWxsYSB5IFBhcmlzIGxhIGNvbWlzacOzbiBlcyBsYSBxdWUgaW5mb3JtYSBlbCBtYXJrZXRwbGFjZSBvIHVuIHZhbG9yIGVzdGltYWRvIHF1ZSBwdWVkZXMgY2FtYmlhci4ke2QuZXJyb3JzPy5sZW5ndGggPyBgPGJyPjxzcGFuIGNsYXNzPSJwZi1lcnIiPuKaoCAke2QuZXJyb3JzLm1hcChlc2MpLmpvaW4oJyDCtyAnKX08L3NwYW4+YCA6ICcnfSR7ZC5wcmljZXNfYXQgPyBgPGJyPlByZWNpb3MgY29uIGxhIHByb21vY2nDs24gbcOhcyBiYXJhdGEgdmlnZW50ZSAoc2luIE1lbGkrKSwgYWN0dWFsaXphZG9zIGEgbGFzICR7ZXNjKG5ldyBEYXRlKGQucHJpY2VzX2F0KS50b0xvY2FsZVRpbWVTdHJpbmcoJ2VzLUNMJywgeyBob3VyOiAnbnVtZXJpYycsIG1pbnV0ZTogJzItZGlnaXQnIH0pKX07IHNlIHJldmlzYW4gc29sb3MgY2FkYSBwb2NvcyBtaW51dG9zLmAgOiAnJ308L3A+CiAgICA8L2Rpdj5gOwogIGJveC5vbmNsaWNrID0gZSA9PiB7CiAgICBjb25zdCBiID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtcGZta10nKTsgaWYgKGIpIHsgcGYubWsgPSBiLmRhdGFzZXQucGZtazsgZHJhd1Byb2ZpdCgpOyByZXR1cm47IH0KICAgIGlmIChlLnRhcmdldC5jbG9zZXN0KCcjcGZSZWZyZXNoJykpIHsgcmVuZGVyUHJvZml0KHRydWUpOyB0b2FzdCgnQWN0dWFsaXphbmRvIGNvbWlzaW9uZXMsIGVudsOtb3MgeSBwdWJsaWNpZGFk4oCmJyk7IH0KICAgIGNvbnN0IHBiID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtcGZwZXJdJyk7IGlmIChwYikgeyBwZi5wZXIgPSBwYi5kYXRhc2V0LnBmcGVyOyBpZiAocGYucGVyICE9PSAncGljaycgJiYgcGYucGVyICE9PSAncmFuZ2UnKSByZWxvYWRQcm9maXQoKTsgZWxzZSBkcmF3UHJvZml0KCk7IH0KICB9OwogICQoJyNwZlEnKS5vbmlucHV0ID0gZSA9PiB7IHBmLnEgPSBlLnRhcmdldC52YWx1ZS50cmltKCkudG9Mb3dlckNhc2UoKTsgY2xlYXJUaW1lb3V0KHBmLl9xdCk7IHBmLl9xdCA9IHNldFRpbWVvdXQoKCkgPT4geyBkcmF3UHJvZml0KCk7IGNvbnN0IHEgPSAkKCcjcGZRJyk7IHEuZm9jdXMoKTsgcS5zZXRTZWxlY3Rpb25SYW5nZShxLnZhbHVlLmxlbmd0aCwgcS52YWx1ZS5sZW5ndGgpOyB9LCAyNTApOyB9OwogICQoJyNwZlNvcnQnKS5vbmNoYW5nZSA9IGUgPT4geyBwZi5zb3J0ID0gZS50YXJnZXQudmFsdWU7IGRyYXdQcm9maXQoKTsgfTsKICBpZiAoJCgnI3BmTW9udGgnKSkgJCgnI3BmTW9udGgnKS5vbmNoYW5nZSA9IGUgPT4geyBwZi5tb250aCA9IGUudGFyZ2V0LnZhbHVlOyByZWxvYWRQcm9maXQoKTsgfTsKICBpZiAoJCgnI3BmRnJvbScpKSB7IGNvbnN0IHVwZCA9ICgpID0+IHsgcGYuZnJvbSA9ICQoJyNwZkZyb20nKS52YWx1ZTsgcGYudG8gPSAkKCcjcGZUbycpLnZhbHVlOyBpZiAocGYuZnJvbSAmJiBwZi50bykgcmVsb2FkUHJvZml0KCk7IH07ICQoJyNwZkZyb20nKS5vbmNoYW5nZSA9IHVwZDsgJCgnI3BmVG8nKS5vbmNoYW5nZSA9IHVwZDsgfQogIGJveC5vbmNoYW5nZSA9IGFzeW5jIGUgPT4gewogICAgY29uc3QgcnYgPSBlLnRhcmdldC5jbG9zZXN0KCcucGYtcnYnKTsKICAgIGlmIChydikgewogICAgICBjb25zdCBrID0gcnYuZGF0YXNldC5ydiwgdmFsID0gcnYudmFsdWUgPT09ICcnID8gbnVsbCA6IE51bWJlcihydi52YWx1ZSk7CiAgICAgIGQuc2F2ZWRbayArICd8UkVUX0xPRyddID0geyAuLi4oZC5zYXZlZFtrICsgJ3xSRVRfTE9HJ10gfHwge30pLCBzaGlwOiB2YWwgfTsKICAgICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL3Byb2ZpdC9zYXZlJywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBzZWxsZXJfaWQ6IHBmLnNpZCB8fCB1bmRlZmluZWQsIG1hcmtldHBsYWNlOiBrLCBrZXk6ICdSRVRfTE9HJywgc2hpcDogdmFsIH0gfSk7IH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IH0KICAgICAgZHJhd1Byb2ZpdCgpOyByZXR1cm47CiAgICB9CiAgICBjb25zdCBpID0gZS50YXJnZXQuY2xvc2VzdCgnLnBmLWluJyk7IGlmICghaSkgcmV0dXJuOwogICAgY29uc3QgciA9IGQucm93cy5maW5kKHggPT4geC5tayA9PT0gcGYubWsgJiYgeC5rZXkgPT09IGkuZGF0YXNldC5rKTsgaWYgKCFyKSByZXR1cm47CiAgICBjb25zdCBmID0gaS5kYXRhc2V0LmYsIHZhbCA9IGkudmFsdWUgPT09ICcnID8gbnVsbCA6IE51bWJlcihpLnZhbHVlKTsKICAgIGNvbnN0IGtleSA9IGYgPT09ICdjb3N0JyAmJiByLmNvc3Rfa2V5ID8gci5jb3N0X2tleSA6IHIua2V5OyAvLyBlbCBjb3N0byBlcyBkZWwgcHJvZHVjdG8gKHNpcnZlIHBhcmEgQ2zDoXNpY2EgeSBQcmVtaXVtKQogICAgY29uc3Qgc3YgPSB7IC4uLihkLnNhdmVkW3IubWsgKyAnfCcgKyBrZXldIHx8IHt9KSB9OwogICAgc3ZbZl0gPSB2YWw7CiAgICBkLnNhdmVkW3IubWsgKyAnfCcgKyBrZXldID0gc3Y7CiAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvcHJvZml0L3NhdmUnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IHNlbGxlcl9pZDogcGYuc2lkIHx8IHVuZGVmaW5lZCwgbWFya2V0cGxhY2U6IHIubWssIGtleSwgLi4uc3YgfSB9KTsgfSBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlKTsgfQogICAgaWYgKGYgPT09ICdjb3N0JyAmJiByLmNvc3Rfa2V5KSAkJCgnI3Byb2ZpdFBhbmVsIHRyW2RhdGEtY2tdJykuZm9yRWFjaCh0cjIgPT4geyBpZiAodHIyLmRhdGFzZXQuY2sgIT09IHIuY29zdF9rZXkgfHwgdHIyID09PSBpLmNsb3Nlc3QoJ3RyJykpIHJldHVybjsgY29uc3QgcjIgPSBkLnJvd3MuZmluZCh4ID0+IHgubWsgPT09IHBmLm1rICYmIHgua2V5ID09PSB0cjIuZGF0YXNldC5yayk7IGlmICghcjIpIHJldHVybjsgY29uc3QgdDIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd0Ym9keScpOyB0Mi5pbm5lckhUTUwgPSByb3dIdG1sKHIyKTsgdHIyLnJlcGxhY2VXaXRoKHQyLmZpcnN0RWxlbWVudENoaWxkKTsgfSk7CiAgICAvLyBzZSBhY3R1YWxpemEgc29sbyBsYSBmaWxhIChzaW4gcGVyZGVyIGVsIGZvY28gZGVsIHNpZ3VpZW50ZSBjYW1wbykKICAgIGNvbnN0IHRyID0gaS5jbG9zZXN0KCd0cicpOyBjb25zdCBuZXh0ID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudDsKICAgIGNvbnN0IHRtcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3Rib2R5Jyk7IHRtcC5pbm5lckhUTUwgPSByb3dIdG1sKHIpOyBjb25zdCBuciA9IHRtcC5maXJzdEVsZW1lbnRDaGlsZDsKICAgIGlmICghdHIuY29udGFpbnMobmV4dCkpIHRyLnJlcGxhY2VXaXRoKG5yKTsgZWxzZSB7IG5yLnF1ZXJ5U2VsZWN0b3JBbGwoJ3RkJykuZm9yRWFjaCgodGQsIGspID0+IHsgaWYgKCF0ZC5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpKSB0ci5jaGlsZHJlbltrXS5pbm5lckhUTUwgPSB0ZC5pbm5lckhUTUw7IH0pOyB9CiAgfTsKfQoKLy8gUGVyw61vZG8gZGUgbG9zIGdyw6FmaWNvcyBkZSB2ZW50YXMgKHBvciBkZWZlY3RvIMO6bHRpbW9zIDcgZMOtYXMpCmNvbnN0IHNwID0geyBwZXI6ICc3JywgbW9udGg6ICcnLCBmcm9tOiAnJywgdG86ICcnIH07CmZ1bmN0aW9uIHNwUmFuZ2UoKSB7CiAgY29uc3QgdCA9IG5ldyBEYXRlKCksIHRvZGF5ID0gaXNvKHQpLCBiYWNrID0gbiA9PiB7IGNvbnN0IGQgPSBuZXcgRGF0ZSgpOyBkLnNldERhdGUoZC5nZXREYXRlKCkgLSBuKTsgcmV0dXJuIGlzbyhkKTsgfTsKICBpZiAoc3AucGVyID09PSAndG9kYXknKSByZXR1cm4gW3RvZGF5LCB0b2RheV07CiAgaWYgKHNwLnBlciA9PT0gJzMwJykgcmV0dXJuIFtiYWNrKDI5KSwgdG9kYXldOwogIGlmIChzcC5wZXIgPT09ICdtb250aCcpIHJldHVybiBbdG9kYXkuc2xpY2UoMCwgOCkgKyAnMDEnLCB0b2RheV07CiAgaWYgKHNwLnBlciA9PT0gJ3BpY2snICYmIC9eXGR7NH0tXGR7Mn0kLy50ZXN0KHNwLm1vbnRoKSkgeyBjb25zdCBbeSwgbV0gPSBzcC5tb250aC5zcGxpdCgnLScpLm1hcChOdW1iZXIpOyBjb25zdCBsYXN0ID0gbmV3IERhdGUoeSwgbSwgMCkuZ2V0RGF0ZSgpOyByZXR1cm4gW3NwLm1vbnRoICsgJy0wMScsIHNwLm1vbnRoICsgJy0nICsgU3RyaW5nKGxhc3QpLnBhZFN0YXJ0KDIsICcwJyldOyB9CiAgaWYgKHNwLnBlciA9PT0gJ3JhbmdlJyAmJiBzcC5mcm9tICYmIHNwLnRvKSByZXR1cm4gc3AuZnJvbSA8PSBzcC50byA/IFtzcC5mcm9tLCBzcC50b10gOiBbc3AudG8sIHNwLmZyb21dOwogIHJldHVybiBbYmFjayg2KSwgdG9kYXldOwp9CmFzeW5jIGZ1bmN0aW9uIHJlbmRlclNhbGVzKGZvcmNlID0gZmFsc2UpIHsKICBjb25zdCBpc0FkbWluID0gbWUudXNlci5yb2xlID09PSAnYWRtaW4nOwogIGlmICghJCgnI3NhbGVzQm9keScpKSAkKCcjbWFpbicpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJzZWN0aW9uLXRpdGxlIiBzdHlsZT0ibWFyZ2luLXRvcDoyMnB4Ij48aDI+QW7DoWxpc2lzIHZlbnRhczwvaDI+PHNwYW4gY2xhc3M9Im11dGVkIiBpZD0ic2FsZXNTdWIiPnNlIGFjdHVhbGl6YSBzb2xhPC9zcGFuPjxzcGFuIGNsYXNzPSJzcGFjZXIiIHN0eWxlPSJmbGV4OjEiPjwvc3Bhbj48c3BhbiBpZD0ic2FsZXNQaWNrIj48L3NwYW4+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1naG9zdCBidG4tc20iIGlkPSJzYWxlc1JlZnJlc2giPiR7SS5zeW5jfUFjdHVhbGl6YXI8L2J1dHRvbj48L2Rpdj48ZGl2IGNsYXNzPSJwZi1wZXIgc2FsZXMtcGVyIiBpZD0ic2FsZXNQZXIiPjwvZGl2PjxkaXYgaWQ9InNhbGVzQm9keSI+PGRpdiBjbGFzcz0icGFuZWwiPjxkaXYgY2xhc3M9InBhbmVsLWJvZHkgbXV0ZWQiPkNhcmdhbmRvIHR1cyB2ZW50YXPigKY8L2Rpdj48L2Rpdj48L2Rpdj48ZGl2IGNsYXNzPSJjaC10aXAiIGlkPSJjaFRpcCIgaGlkZGVuPjwvZGl2PmA7CiAgJCgnI3NhbGVzUmVmcmVzaCcpLm9uY2xpY2sgPSBhc3luYyAoKSA9PiB7ICQoJyNzYWxlc1JlZnJlc2gnKS5kaXNhYmxlZCA9IHRydWU7IGF3YWl0IHJlbmRlclNhbGVzKHRydWUpOyBpZiAoJCgnI3NhbGVzUmVmcmVzaCcpKSAkKCcjc2FsZXNSZWZyZXNoJykuZGlzYWJsZWQgPSBmYWxzZTsgdG9hc3QoJ1ZlbnRhcyBhY3R1YWxpemFkYXMnKTsgfTsKICBjb25zdCBzaWQgPSBpc0FkbWluID8gc3RvcmUuZ2V0KCdzYWxlc1NlbGxlcicsICcnKSA6ICcnOwogIGxldCBkOwogIGNvbnN0IFtyRnJvbSwgclRvXSA9IHNwUmFuZ2UoKTsKICBjb25zdCBmbXREID0geCA9PiBuZXcgRGF0ZSh4ICsgJ1QxMjowMDowMCcpLnRvTG9jYWxlRGF0ZVN0cmluZygnZXMtQ0wnLCB7IGRheTogJ251bWVyaWMnLCBtb250aDogJ3Nob3J0JyB9KTsKICBjb25zdCBwZXJOYW1lID0geyB0b2RheTogJ0hveScsICc3JzogJ8OabHRpbW9zIDcgZMOtYXMnLCAnMzAnOiAnw5psdGltb3MgMzAgZMOtYXMnLCBtb250aDogJ0VzdGUgbWVzJywgcGljazogJ01lcycsIHJhbmdlOiAnUGVyw61vZG8nIH1bc3AucGVyXSB8fCAnUGVyw61vZG8nOwogICQoJyNzYWxlc1BlcicpLmlubmVySFRNTCA9IGA8c3BhbiBjbGFzcz0icGYtcGVyLWwiPlBlcsOtb2RvOjwvc3Bhbj4KICAgIDxzcGFuIGNsYXNzPSJwZi10YWJzIHBmLXB0YWJzIj4ke1tbJ3RvZGF5JywgJ0hveSddLCBbJzcnLCAnNyBkw61hcyddLCBbJzMwJywgJzMwIGTDrWFzJ10sIFsnbW9udGgnLCAnRXN0ZSBtZXMnXSwgWydwaWNrJywgJ01lcyddLCBbJ3JhbmdlJywgJ0ZlY2hhcyddXS5tYXAoKFtrLCBuXSkgPT4gYDxidXR0b24gZGF0YS1zcGVyPSIke2t9IiBhcmlhLXByZXNzZWQ9IiR7c3AucGVyID09PSBrfSI+JHtufTwvYnV0dG9uPmApLmpvaW4oJycpfTwvc3Bhbj4KICAgICR7c3AucGVyID09PSAncGljaycgPyBgPGlucHV0IHR5cGU9Im1vbnRoIiBpZD0ic3BNb250aCIgdmFsdWU9IiR7ZXNjKHNwLm1vbnRoIHx8IGlzbyhuZXcgRGF0ZSgpKS5zbGljZSgwLCA3KSl9Ij5gIDogJyd9CiAgICAke3NwLnBlciA9PT0gJ3JhbmdlJyA/IGA8aW5wdXQgdHlwZT0iZGF0ZSIgaWQ9InNwRnJvbSIgdmFsdWU9IiR7ZXNjKHNwLmZyb20gfHwgckZyb20pfSI+IOKAkyA8aW5wdXQgdHlwZT0iZGF0ZSIgaWQ9InNwVG8iIHZhbHVlPSIke2VzYyhzcC50byB8fCByVG8pfSI+YCA6ICcnfQogICAgPHNwYW4gY2xhc3M9Im11dGVkIHBmLXBlci1kIj4ke2VzYyhyRnJvbSA9PT0gclRvID8gZm10RChyRnJvbSkgOiBmbXREKHJGcm9tKSArICcgYWwgJyArIGZtdEQoclRvKSl9PC9zcGFuPmA7CiAgJCgnI3NhbGVzUGVyJykub25jbGljayA9IGUgPT4geyBjb25zdCBiID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtc3Blcl0nKTsgaWYgKCFiKSByZXR1cm47IHNwLnBlciA9IGIuZGF0YXNldC5zcGVyOyBpZiAoc3AucGVyID09PSAncGljaycgJiYgIXNwLm1vbnRoKSBzcC5tb250aCA9IGlzbyhuZXcgRGF0ZSgpKS5zbGljZSgwLCA3KTsgcmVuZGVyU2FsZXMoKTsgfTsKICBpZiAoJCgnI3NwTW9udGgnKSkgJCgnI3NwTW9udGgnKS5vbmNoYW5nZSA9IGUgPT4geyBzcC5tb250aCA9IGUudGFyZ2V0LnZhbHVlOyByZW5kZXJTYWxlcygpOyB9OwogIGlmICgkKCcjc3BGcm9tJykpIHsgY29uc3QgdXBkID0gKCkgPT4geyBzcC5mcm9tID0gJCgnI3NwRnJvbScpLnZhbHVlOyBzcC50byA9ICQoJyNzcFRvJykudmFsdWU7IGlmIChzcC5mcm9tICYmIHNwLnRvKSByZW5kZXJTYWxlcygpOyB9OyAkKCcjc3BGcm9tJykub25jaGFuZ2UgPSB1cGQ7ICQoJyNzcFRvJykub25jaGFuZ2UgPSB1cGQ7IH0KICB0cnkgeyBkID0gYXdhaXQgYXBpKGAvYXBpL3NhbGVzPyR7c2lkID8gJ3NlbGxlcl9pZD0nICsgc2lkICsgJyYnIDogJyd9ZnJvbT0ke3JGcm9tfSZ0bz0ke3JUb30ke2ZvcmNlID8gJyZyZWZyZXNoPTEnIDogJyd9YCk7IH0gY2F0Y2ggKGUpIHsgJCgnI3NhbGVzQm9keScpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJwYW5lbCI+PGRpdiBjbGFzcz0icGFuZWwtYm9keSI+JHtlc2MoZS5tZXNzYWdlKX08L2Rpdj48L2Rpdj5gOyByZXR1cm47IH0KICBpZiAodGFiICE9PSAnc2FsZXMnKSByZXR1cm47CiAgaWYgKGlzQWRtaW4pIHsKICAgICQoJyNzYWxlc1BpY2snKS5pbm5lckhUTUwgPSBgPHNlbGVjdCBpZD0ic2FsZXNTZWwiIHN0eWxlPSJ3aWR0aDphdXRvIj48b3B0aW9uIHZhbHVlPSIiPlRvZGFzIGxhcyBjdWVudGFzPC9vcHRpb24+JHtkLnNlbGxlcnMubWFwKHggPT4gYDxvcHRpb24gdmFsdWU9IiR7eC5pZH0iICR7U3RyaW5nKHguaWQpID09PSBTdHJpbmcoc2lkKSA/ICdzZWxlY3RlZCcgOiAnJ30+JHtlc2MoeC5uYW1lKX08L29wdGlvbj5gKS5qb2luKCcnKX08L3NlbGVjdD5gOwogICAgJCgnI3NhbGVzU2VsJykub25jaGFuZ2UgPSBlID0+IHsgc3RvcmUuc2V0KCdzYWxlc1NlbGxlcicsIGUudGFyZ2V0LnZhbHVlKTsgcmVuZGVyU2FsZXMoKTsgfTsKICB9CiAgY29uc3QgZGF5cyA9IGQuZGF5cywgbWtzID0gWydtbCcsICdmYScsICdwYSddLCBHID0gZC5ncm91cCB8fCAnZGF5JzsKICBjb25zdCBkYXlUb3RhbCA9IGkgPT4gbWtzLnJlZHVjZSgoYSwgaykgPT4gYSArIGQuc2VyaWVzW2tdW2ldLmFtb3VudCwgMCk7CiAgY29uc3QgZGF5T3JkZXJzID0gaSA9PiBta3MucmVkdWNlKChhLCBrKSA9PiBhICsgZC5zZXJpZXNba11baV0ub3JkZXJzLCAwKTsKICBjb25zdCB3ZWVrVG90YWwgPSBkYXlzLnJlZHVjZSgoYSwgXywgaSkgPT4gYSArIGRheVRvdGFsKGkpLCAwKSwgd2Vla09yZGVycyA9IGRheXMucmVkdWNlKChhLCBfLCBpKSA9PiBhICsgZGF5T3JkZXJzKGkpLCAwKTsKICBsZXQgYmVzdCA9IDA7IGRheXMuZm9yRWFjaCgoXywgaSkgPT4geyBpZiAoZGF5VG90YWwoaSkgPiBkYXlUb3RhbChiZXN0KSkgYmVzdCA9IGk7IH0pOwogIGNvbnN0IHRkVCA9IG1rcy5yZWR1Y2UoKGEsIGspID0+IGEgKyBkLnRkW2tdLmFtb3VudCwgMCksIHRkTyA9IG1rcy5yZWR1Y2UoKGEsIGspID0+IGEgKyBkLnRkW2tdLm9yZGVycywgMCksIHlkVCA9IG1rcy5yZWR1Y2UoKGEsIGspID0+IGEgKyBkLnlkW2tdLmFtb3VudCwgMCk7CiAgY29uc3QgdXAgPSB5ZFQgPiAwICYmIHRkVCA+IHlkVCA/IE1hdGgucm91bmQoKHRkVCAvIHlkVCAtIDEpICogMTAwKSA6IG51bGw7CiAgY29uc3QgY2hlZXIgPSB1cCA/IGDCoVZhcyAke3VwfSUgYXJyaWJhIGRlIGF5ZXIhIPCfmoBgIDogdGRPID8gYMKhWWEgbGxldmFzICR7dGRPfSB2ZW50YSR7dGRPID09PSAxID8gJycgOiAncyd9IGhveSFgIDogJ0VsIGTDrWEgcmVjacOpbiBlbXBpZXphOiB0dXMgdmVudGFzIGRlIGhveSBhcGFyZWNlbiBhcXXDrSc7CiAgY29uc3QgYk5hbWUgPSBpID0+IEcgPT09ICdkYXknID8gZGF5TG9uZyhkYXlzW2ldKS5zcGxpdCgnLCcpWzBdIDogRyA9PT0gJ3dlZWsnID8gJ3NlbWFuYSBkZWwgJyArIGZtdEQoZGF5c1tpXSkgOiBuZXcgRGF0ZShkYXlzW2ldICsgJ1QxMjowMDowMCcpLnRvTG9jYWxlRGF0ZVN0cmluZygnZXMtQ0wnLCB7IG1vbnRoOiAnbG9uZycgfSk7CiAgY29uc3QgYkxvbmcgPSBpID0+IEcgPT09ICdkYXknID8gZGF5TG9uZyhkYXlzW2ldKSA6IEcgPT09ICd3ZWVrJyA/IGBTZW1hbmEgJHtmbXREKGRheXNbaV0pfSBhbCAke2ZtdEQoZC5lbmRzW2ldKX1gIDogbmV3IERhdGUoZGF5c1tpXSArICdUMTI6MDA6MDAnKS50b0xvY2FsZURhdGVTdHJpbmcoJ2VzLUNMJywgeyBtb250aDogJ2xvbmcnLCB5ZWFyOiAnbnVtZXJpYycgfSk7CiAgY29uc3QgYlNob3J0ID0gaSA9PiBHID09PSAnd2VlaycgPyBmbXREKGRheXNbaV0pIDogbmV3IERhdGUoZGF5c1tpXSArICdUMTI6MDA6MDAnKS50b0xvY2FsZURhdGVTdHJpbmcoJ2VzLUNMJywgeyBtb250aDogJ3Nob3J0JyB9KS5yZXBsYWNlKCcuJywgJycpOwogIGNvbnN0IHBlclR4dCA9IHNwLnBlciA9PT0gJ3BpY2snID8gbmV3IERhdGUoKHNwLm1vbnRoIHx8IGlzbyhuZXcgRGF0ZSgpKS5zbGljZSgwLCA3KSkgKyAnLTE1VDEyOjAwOjAwJykudG9Mb2NhbGVEYXRlU3RyaW5nKCdlcy1DTCcsIHsgbW9udGg6ICdsb25nJywgeWVhcjogJ251bWVyaWMnIH0pIDogc3AucGVyID09PSAncmFuZ2UnID8gKGQuZnJvbSA9PT0gZC50byA/IGZtdEQoZC5mcm9tKSA6IGZtdEQoZC5mcm9tKSArICcgYWwgJyArIGZtdEQoZC50bykpIDogcGVyTmFtZS50b0xvd2VyQ2FzZSgpOwogIGlmICgkKCcjc2FsZXNTdWInKSkgJCgnI3NhbGVzU3ViJykudGV4dENvbnRlbnQgPSBgJHtwZXJOYW1lID09PSAnUGVyw61vZG8nIHx8IHNwLnBlciA9PT0gJ3BpY2snID8gcGVyVHh0LmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgcGVyVHh0LnNsaWNlKDEpIDogcGVyTmFtZX0ke0cgIT09ICdkYXknID8gKEcgPT09ICd3ZWVrJyA/ICcgwrcgcG9yIHNlbWFuYScgOiAnIMK3IHBvciBtZXMnKSA6ICcnfSDCtyBzZSBhY3R1YWxpemEgc29sYWA7CiAgY29uc3Qgc3RhY2tzID0gbWtzLm1hcChrID0+ICh7IGtleTogaywgbGFiZWw6IE1LW2tdLCBjb2xvcjogTUtfQ09MT1Jba10sIHZhbHVlczogZC5zZXJpZXNba10gfSkpOwogIGNvbnN0IG1rQ2FyZCA9IGsgPT4gewogICAgY29uc3Qgd2sgPSBkLnNlcmllc1trXS5yZWR1Y2UoKGEsIHgpID0+IGEgKyB4LmFtb3VudCwgMCksIG4gPSBkLnNlcmllc1trXS5yZWR1Y2UoKGEsIHgpID0+IGEgKyB4Lm9yZGVycywgMCk7CiAgICBjb25zdCBvbiA9IGQuY29ubmVjdGVkLmluY2x1ZGVzKGspIHx8IHdrID4gMDsKICAgIHJldHVybiBgPGRpdiBjbGFzcz0icGFuZWwgc2FsZXMtbWsiPjxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj48aSBjbGFzcz0iZG90IiBzdHlsZT0iYmFja2dyb3VuZDoke01LX0NPTE9SW2tdfSI+PC9pPiR7TUtba119PC9oMj48c3BhbiBjbGFzcz0ibXV0ZWQiPiR7b24gPyBgJHttb25leSh3ayl9IMK3ICR7bi50b0xvY2FsZVN0cmluZygnZXMtQ0wnKX0gdmVudGEke24gPT09IDEgPyAnJyA6ICdzJ30gwrcgJHtlc2MocGVyVHh0KX1gIDogJyd9PC9zcGFuPjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJwYW5lbC1ib2R5Ij4ke29uID8gYDxkaXYgY2xhc3M9ImNoLXNsb3QiIGRhdGEtbWs9IiR7a30iIGRhdGEtaD0iMjAwIj48L2Rpdj5gIDogYDxkaXYgY2xhc3M9ImVtcHR5Ij5Db25lY3RhICR7TUtba119IGVuICR7aXNBZG1pbiA/ICdWZW5kZWRvcmVzJyA6ICdNaSBjdWVudGEnfSBwYXJhIHZlciBhcXXDrSBzdXMgdmVudGFzLjwvZGl2PmB9PC9kaXY+PC9kaXY+YDsKICB9OwogICQoJyNzYWxlc0JvZHknKS5pbm5lckhUTUwgPSBgCiAgICA8ZGl2IGNsYXNzPSJzYWxlcy1rcGlzIj4KICAgICAgPGRpdiBjbGFzcz0ia3BpIGtwaS1oZXJvIj48c21hbGw+VmVuZGlzdGUgaG95PC9zbWFsbD48Yj4ke21vbmV5KHRkVCl9PC9iPjxzcGFuPiR7dGRPfSB2ZW50YSR7dGRPID09PSAxID8gJycgOiAncyd9IMK3ICR7ZXNjKGNoZWVyKX08L3NwYW4+PC9kaXY+CiAgICAgICR7bWtzLm1hcChrID0+IGA8ZGl2IGNsYXNzPSJrcGkiPjxzbWFsbD48aSBjbGFzcz0iZG90IiBzdHlsZT0iYmFja2dyb3VuZDoke01LX0NPTE9SW2tdfSI+PC9pPiR7TUtba119IGhveTwvc21hbGw+PGI+JHttb25leShkLnRkW2tdLmFtb3VudCl9PC9iPjxzcGFuPiR7ZC50ZFtrXS5vcmRlcnN9IHZlbnRhJHtkLnRkW2tdLm9yZGVycyA9PT0gMSA/ICcnIDogJ3MnfTwvc3Bhbj48L2Rpdj5gKS5qb2luKCcnKX0KICAgICAgPGRpdiBjbGFzcz0ia3BpIj48c21hbGw+JHtlc2MocGVyVHh0LmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgcGVyVHh0LnNsaWNlKDEpKX08L3NtYWxsPjxiPiR7bW9uZXkod2Vla1RvdGFsKX08L2I+PHNwYW4+JHt3ZWVrT3JkZXJzLnRvTG9jYWxlU3RyaW5nKCdlcy1DTCcpfSB2ZW50YXMke2RheXMubGVuZ3RoID4gMSAmJiBkYXlUb3RhbChiZXN0KSA+IDAgPyBgIMK3IG1lam9yICR7RyA9PT0gJ2RheScgPyAnZMOtYScgOiBHID09PSAnd2VlaycgPyAnc2VtYW5hJyA6ICdtZXMnfTogJHtlc2MoYk5hbWUoYmVzdCkpfSDwn4+GYCA6ICcnfTwvc3Bhbj48L2Rpdj4KICAgIDwvZGl2PgogICAgPGRpdiBjbGFzcz0icGFuZWwiPjxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj5Ub2RvcyBsb3MgbWFya2V0cGxhY2VzPC9oMj48ZGl2IGNsYXNzPSJsZWdlbmQiPiR7bWtzLm1hcChrID0+IGA8c3Bhbj48aSBjbGFzcz0iZG90IiBzdHlsZT0iYmFja2dyb3VuZDoke01LX0NPTE9SW2tdfSI+PC9pPiR7TUtba119PC9zcGFuPmApLmpvaW4oJycpfTwvZGl2PjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJwYW5lbC1ib2R5Ij48ZGl2IGNsYXNzPSJjaC1zbG90IiBkYXRhLW1rPSJhbGwiIGRhdGEtaD0iMjYwIj48L2Rpdj4ke3NhbGVzVGFibGUoZGF5cywgZCwgRyA9PT0gJ2RheScgPyBudWxsIDogYkxvbmcpfTwvZGl2PjwvZGl2PgogICAgPGRpdiBjbGFzcz0ic2FsZXMtZ3JpZCI+JHtta3MubWFwKG1rQ2FyZCkuam9pbignJyl9PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbCBwZi1wYW5lbCIgaWQ9InByb2ZpdFBhbmVsIiBzdHlsZT0ibWFyZ2luLXRvcDoxNHB4Ij48L2Rpdj4KICAgIDxkaXYgY2xhc3M9InBhbmVsIiBpZD0icHJvZFBhbmVsIiBzdHlsZT0ibWFyZ2luLXRvcDoxNHB4Ij48L2Rpdj4KICAgIDxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9ImZvbnQtc2l6ZToxMi41cHg7bWFyZ2luOjEwcHggMnB4Ij5Nb250b3MgcGFnYWRvcyBzZWfDum4gY2FkYSBtYXJrZXRwbGFjZSAoc2luIGNvc3RvIGRlIGVudsOtbyBlbiBNZXJjYWRvIExpYnJlKS4gTm8gaW5jbHV5ZSB2ZW50YXMgY2FuY2VsYWRhcy4ke2QudXBkYXRlZEF0ID8gJyBBY3R1YWxpemFkbyAnICsgZXNjKG5ldyBEYXRlKGQudXBkYXRlZEF0KS50b0xvY2FsZVRpbWVTdHJpbmcoJ2VzLUNMJywgeyBob3VyOiAnbnVtZXJpYycsIG1pbnV0ZTogJzItZGlnaXQnIH0pKSArICcuJyA6ICcnfTwvcD5gOwogIC8vIGxvcyBncsOhZmljb3Mgc2UgZGlidWphbiBhbCBhbmNobyByZWFsIGRlIHN1IGNhamE6IGVsIHRleHRvIHF1ZWRhIHNpZW1wcmUgZGVsIG1pc21vIHRhbWHDsW8geSBsZWdpYmxlCiAgY29uc3QgZHJhdyA9ICgpID0+ICQkKCcuY2gtc2xvdCcpLmZvckVhY2goZWwgPT4geyBjb25zdCB3ID0gZWwuY2xpZW50V2lkdGg7IGlmICghdyB8fCBlbC5fdyA9PT0gdykgcmV0dXJuOyBlbC5fdyA9IHc7IGVsLmlubmVySFRNTCA9IGNvbHVtbkNoYXJ0KGRheXMsIGVsLmRhdGFzZXQubWsgPT09ICdhbGwnID8gc3RhY2tzIDogW3N0YWNrcy5maW5kKHMgPT4gcy5rZXkgPT09IGVsLmRhdGFzZXQubWspXSwgeyBoZWlnaHQ6ICtlbC5kYXRhc2V0LmgsIHRvZGF5OiBHID09PSAnZGF5JyA/IGQudG9kYXkgOiBudWxsLCB3aWR0aDogdywgLi4uKEcgPT09ICdkYXknID8ge30gOiB7IGxhYmVsOiB4ID0+IGJTaG9ydChkYXlzLmluZGV4T2YoeCkpLCB0aXRsZTogeCA9PiBiTG9uZyhkYXlzLmluZGV4T2YoeCkpIH0pIH0pOyB9KTsKICBkcmF3KCk7CiAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHJlbmRlclNhbGVzLl9ycyB8fCAoKCkgPT4ge30pKTsgcmVuZGVyU2FsZXMuX3JzID0gKCkgPT4geyBpZiAodGFiID09PSAnc2FsZXMnKSBkcmF3KCk7IH07IHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCByZW5kZXJTYWxlcy5fcnMpOwogIGNvbnN0IHRpcEVsID0gJCgnI2NoVGlwJyk7CiAgJCgnI3NhbGVzQm9keScpLm9ubW91c2Vtb3ZlID0gZSA9PiB7CiAgICBjb25zdCBoID0gZS50YXJnZXQuY2xvc2VzdCgnLmNoLWhpdCcpOwogICAgaWYgKCFoKSB7IHRpcEVsLmhpZGRlbiA9IHRydWU7IHJldHVybjsgfQogICAgY29uc3QgW3QsIC4uLnJlc3RdID0gaC5kYXRhc2V0LnRpcC5zcGxpdCgnfCcpOwogICAgdGlwRWwuaW5uZXJIVE1MID0gYDxiPiR7ZXNjKHQpfTwvYj4ke3Jlc3QubWFwKHIgPT4gYDxkaXY+JHtlc2Mocil9PC9kaXY+YCkuam9pbignJyl9YDsKICAgIHRpcEVsLmhpZGRlbiA9IGZhbHNlOwogICAgY29uc3QgeCA9IE1hdGgubWluKGUuY2xpZW50WCArIDE0LCBpbm5lcldpZHRoIC0gdGlwRWwub2Zmc2V0V2lkdGggLSA4KTsKICAgIHRpcEVsLnN0eWxlLmxlZnQgPSB4ICsgJ3B4JzsgdGlwRWwuc3R5bGUudG9wID0gKGUuY2xpZW50WSArIDE0KSArICdweCc7CiAgfTsKICAkKCcjc2FsZXNCb2R5Jykub25tb3VzZWxlYXZlID0gKCkgPT4geyB0aXBFbC5oaWRkZW4gPSB0cnVlOyB9OwogIHJlbmRlclByb2R1Y3RzKCk7CiAgcmVuZGVyUHJvZml0KCk7CiAgY2xlYXJUaW1lb3V0KHJlbmRlclNhbGVzLl90KTsgcmVuZGVyU2FsZXMuX3QgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uIGFnYWluKCkgeyBpZiAodGFiICE9PSAnc2FsZXMnKSByZXR1cm47IGlmIChkb2N1bWVudC5hY3RpdmVFbGVtZW50Py5jbGFzc0xpc3Q/LmNvbnRhaW5zKCdwZi1pbicpKSB7IHJlbmRlclNhbGVzLl90ID0gc2V0VGltZW91dChhZ2FpbiwgNjBlMyk7IHJldHVybjsgfSByZW5kZXJTYWxlcygpOyB9LCA1ICogNjBlMyk7Cn0KCi8vIC0tLS0tLS0tLS0gVkVOREVET1JFUyAoc29sbyBsZWN0dXJhLCBwYXJhIGVsIGZ1bGZpbGxtZW50KSAtLS0tLS0tLS0tCmFzeW5jIGZ1bmN0aW9uIHJlbmRlclNlbGxlcnNWaWV3KCkgewogICQoJyNtYWluJykuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9InNlY3Rpb24tdGl0bGUiIHN0eWxlPSJtYXJnaW4tdG9wOjIycHgiPjxoMj5WZW5kZWRvcmVzPC9oMj48c3BhbiBjbGFzcz0ibXV0ZWQiPlNvbG8gbGVjdHVyYTogcXXDqSBtYXJrZXRwbGFjZXMgdGllbmUgY29uZWN0YWRvcyBjYWRhIHZlbmRlZG9yLjwvc3Bhbj48L2Rpdj48ZGl2IGNsYXNzPSJwYW5lbCI+PGRpdiBpZD0ic3ZCb2R5IiBjbGFzcz0icGFuZWwtYm9keSI+PGRpdiBjbGFzcz0ibXV0ZWQiPkNhcmdhbmRv4oCmPC9kaXY+PC9kaXY+PC9kaXY+YDsKICBjb25zdCB7IHNlbGxlcnM6IGxpc3QgfSA9IGF3YWl0IGFwaSgnL2FwaS9zZWxsZXJzL292ZXJ2aWV3Jyk7CiAgY29uc3QgY29ubiA9IGMgPT4gYDxzcGFuIGNsYXNzPSJtayAke2MubWFya2V0cGxhY2V9Ij4ke01LW2MubWFya2V0cGxhY2VdfTwvc3Bhbj4gPHNwYW4gY2xhc3M9Im5vdGUiIHN0eWxlPSJkaXNwbGF5OmlubGluZSI+JHtjLm9rID8gJ0NvbmVjdGFkbycgOiAnPGIgc3R5bGU9ImNvbG9yOnZhcigtLWxvY2spIj5Db24gcHJvYmxlbWFzPC9iPid9JHtjLmxhc3Rfc3luY19hdCA/ICcgwrcgcmV2aXNhZG8gJyArIGVzYyhmbXRUaW1lKGMubGFzdF9zeW5jX2F0KSkgOiAnJ308L3NwYW4+YDsKICAkKCcjc3ZCb2R5JykuaW5uZXJIVE1MID0gbGlzdC5sZW5ndGggPyBgPGRpdiBjbGFzcz0idGFibGUtd3JhcCI+PHRhYmxlIHN0eWxlPSJtaW4td2lkdGg6NTIwcHgiPjx0aGVhZD48dHI+PHRoPlZlbmRlZG9yPC90aD48dGg+TWFya2V0cGxhY2VzIGNvbmVjdGFkb3M8L3RoPjx0aD5Qb3IgaW1wcmltaXI8L3RoPjx0aD5Qcm9kdWN0b3MgYmxvcXVlYWRvczwvdGg+PC90cj48L3RoZWFkPjx0Ym9keT4KICAgICR7bGlzdC5tYXAocyA9PiBgPHRyPjx0ZD48Yj4ke2VzYyhzLm5hbWUpfTwvYj48L3RkPjx0ZD48ZGl2IGNsYXNzPSJzdGFjayIgc3R5bGU9ImdhcDo2cHgiPiR7cy5jb25uZWN0aW9ucy5tYXAoY29ubikuam9pbignJykgfHwgJzxzcGFuIGNsYXNzPSJtdXRlZCI+U2luIG1hcmtldHBsYWNlcyBjb25lY3RhZG9zPC9zcGFuPid9PC9kaXY+PC90ZD48dGQ+JHtzLnBlbmRpbmd9PC90ZD48dGQ+JHtzLmJsb2NrZWR9PC90ZD48L3RyPmApLmpvaW4oJycpfQogICAgPC90Ym9keT48L3RhYmxlPjwvZGl2PmAgOiBgPGRpdiBjbGFzcz0iZW1wdHkiPiR7RU1QVFlfU1ZHfTxkaXY+QcO6biBubyBoYXkgdmVuZGVkb3Jlcy48L2Rpdj48L2Rpdj5gOwp9CgpmdW5jdGlvbiBzdGFydENsb2NrKCkgewogIGNvbnN0IFtoaCwgbW1dID0gbWUuY3V0b2ZmLnNwbGl0KCc6JykubWFwKE51bWJlcik7CiAgY29uc3QgdGljayA9ICgpID0+IHsKICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCksIGN1dCA9IG5ldyBEYXRlKG5vdyk7IGN1dC5zZXRIb3VycyhoaCwgbW0sIDAsIDApOwogICAgY29uc3QgYyA9ICQoJyNjbG9jaycpOyBpZiAoIWMpIHJldHVybjsKICAgIGlmIChub3cgPj0gY3V0KSB7IGN1dC5zZXREYXRlKGN1dC5nZXREYXRlKCkgKyAxKTsgYy5jbGFzc0xpc3QuYWRkKCdsYXRlJyk7IH0gZWxzZSBjLmNsYXNzTGlzdC5yZW1vdmUoJ2xhdGUnKTsKICAgIGNvbnN0IGQgPSBNYXRoLmZsb29yKChjdXQgLSBub3cpIC8gMTAwMCk7CiAgICAkKCcjY2QnKS50ZXh0Q29udGVudCA9IFtNYXRoLmZsb29yKGQgLyAzNjAwKSwgTWF0aC5mbG9vcihkICUgMzYwMCAvIDYwKSwgZCAlIDYwXS5tYXAoeCA9PiBTdHJpbmcoeCkucGFkU3RhcnQoMiwgJzAnKSkuam9pbignOicpOwogIH07CiAgdGljaygpOyBjbGVhckludGVydmFsKHN0YXJ0Q2xvY2suX2kpOyBzdGFydENsb2NrLl9pID0gc2V0SW50ZXJ2YWwodGljaywgMTAwMCk7Cn0KCmxldCBlcyA9IG51bGwsIHJlZnJlc2hUID0gbnVsbDsKZnVuY3Rpb24gY29ubmVjdFN0cmVhbSgpIHsKICBpZiAoZXMpIGVzLmNsb3NlKCk7CiAgZXMgPSBuZXcgRXZlbnRTb3VyY2UoJy9hcGkvc3RyZWFtJyk7CiAgY29uc3QgbGl2ZSA9IG9uID0+IHsgY29uc3QgbCA9ICQoJyNsaXZlJyk7IGlmICghbCkgcmV0dXJuOyBsLmNsYXNzTGlzdC50b2dnbGUoJ29uJywgb24pOyBsLmxhc3RFbGVtZW50Q2hpbGQudGV4dENvbnRlbnQgPSBvbiA/ICdFbiB2aXZvJyA6ICdSZWNvbmVjdGFuZG/igKYnOyB9OwogIGVzLm9ub3BlbiA9ICgpID0+IGxpdmUodHJ1ZSk7CiAgZXMub25lcnJvciA9ICgpID0+IGxpdmUoZmFsc2UpOwogIGVzLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGV2ID0+IHsKICAgIGNvbnN0IGQgPSBKU09OLnBhcnNlKGV2LmRhdGEpOwogICAgY2xlYXJUaW1lb3V0KHJlZnJlc2hUKTsKICAgIHJlZnJlc2hUID0gc2V0VGltZW91dCgoKSA9PiB7IGlmIChkLnR5cGUgPT09ICdjb2RlcycpIHsgbG9hZENvZGVzKCk7IHJldHVybjsgfSBpZiAodGFiID09PSAndHJheScpIGxvYWRPcmRlcnMoKTsgZWxzZSBpZiAodGFiID09PSAnc2VsbGVyJyAmJiBbJ29yZGVyJywgJ2xhYmVsJywgJ2Jsb2NrbGlzdCcsICdjb25uZWN0aW9uJywgJ3ByaW50ZWQnXS5pbmNsdWRlcyhkLnR5cGUpKSBsb2FkU2VsbGVyT3JkZXJzKCk7IH0sIDYwMCk7CiAgfSk7Cn0KCgovLyAtLS0tLS0tLS0tIEPDs2RpZ29zIGRlIGF1dG9yaXphY2nDs24gZGUgZGV2b2x1Y2lvbmVzIGRlIE1lcmNhZG8gTGlicmUgKHVubyBudWV2byBjYWRhIGTDrWEpIC0tLS0tLS0tLS0KbGV0IGNvZGVzRGF0YSA9IG51bGw7CmNvbnN0IEtFWV9TVkcgPSAnPHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMi4yIiBhcmlhLWhpZGRlbj0idHJ1ZSI+PGNpcmNsZSBjeD0iOCIgY3k9IjE1IiByPSI0Ii8+PHBhdGggZD0iTTExIDEybDktOU0xNyA2bDMgM00xNSA4bDIgMiIvPjwvc3ZnPic7CmNvbnN0IGNvZGVEYXlTID0gZCA9PiBuZXcgRGF0ZShkICsgJ1QxMjowMDowMCcpLnRvTG9jYWxlRGF0ZVN0cmluZygnZXMtQ0wnLCB7IHdlZWtkYXk6ICdsb25nJywgZGF5OiAnbnVtZXJpYycsIG1vbnRoOiAnbG9uZycgfSk7CmFzeW5jIGZ1bmN0aW9uIGxvYWRDb2RlcygpIHsKICBpZiAobWUudXNlci5yb2xlID09PSAnZnVsZmlsbG1lbnQnKSByZXR1cm47CiAgdHJ5IHsgY29kZXNEYXRhID0gYXdhaXQgYXBpKCcvYXBpL3JldHVybi1jb2RlcycpOyB9IGNhdGNoIHsgcmV0dXJuOyB9CiAgaWYgKHRhYiA9PT0gJ2NvZGVzJykgZHJhd0NvZGVzUGFnZSgpOyBlbHNlIGRyYXdDb2Rlc1N0cmlwKCk7Cn0KLy8gVGlyYSBkaXNjcmV0YSBhcnJpYmEgZGUgbGEgYmFuZGVqYSAoYWRtaW4geSB2ZW5kZWRvcmVzKQpmdW5jdGlvbiBkcmF3Q29kZXNTdHJpcCgpIHsKICBjb25zdCBib3ggPSAkKCcjcmNvZGVzJyk7IGlmICghYm94IHx8ICFjb2Rlc0RhdGEpIHJldHVybjsKICBjb25zdCBkID0gY29kZXNEYXRhOwogIGlmICghZC5jb2Rlcy5sZW5ndGgpIHsgYm94LmhpZGRlbiA9IHRydWU7IHJldHVybjsgfQogIGJveC5oaWRkZW4gPSBmYWxzZTsKICBjb25zdCBkb25lID0gZC5jb2Rlcy5maWx0ZXIoYyA9PiBjLmNvZGUpLmxlbmd0aCwgb25lID0gZC5jb2Rlcy5sZW5ndGggPT09IDEgPyBkLmNvZGVzWzBdIDogbnVsbDsKICBjb25zdCB3YXNPcGVuID0gYm94LnF1ZXJ5U2VsZWN0b3IoJy5yYy1wb3AnKSAmJiAhYm94LnF1ZXJ5U2VsZWN0b3IoJy5yYy1wb3AnKS5oaWRkZW47CiAgY29uc3QgbGFiZWwgPSBvbmUgPyAob25lLmNvZGUgPyBgQ8OzZGlnbyBNTCBob3kgPGIgY2xhc3M9InJjLWNvZGUiPiR7ZXNjKG9uZS5jb2RlKX08L2I+YCA6ICdDw7NkaWdvIE1MIGhveTogPHNwYW4gY2xhc3M9InJjLW1pc3MiPnNpbiBjYXJnYXI8L3NwYW4+JykgOiBgQ8OzZGlnb3MgTUwgPGI+JHtkb25lfS8ke2QuY29kZXMubGVuZ3RofTwvYj5gOwogIGJveC5pbm5lckhUTUwgPSBgPGJ1dHRvbiB0eXBlPSJidXR0b24iIGNsYXNzPSJyYy1waWxsIiBkYXRhLXJjdG9nZ2xlIGFyaWEtZXhwYW5kZWQ9IiR7d2FzT3Blbn0iPiR7S0VZX1NWR308c3Bhbj4ke2xhYmVsfTwvc3Bhbj48L2J1dHRvbj4KICAgIDxkaXYgY2xhc3M9InJjLXBvcCIgJHt3YXNPcGVuID8gJycgOiAnaGlkZGVuJ30+PGRpdiBjbGFzcz0icmMtcG9wLWgiPkRldm9sdWNpb25lcyBNZXJjYWRvIExpYnJlIMK3ICR7ZXNjKGNvZGVEYXlTKGQuZGF5KSl9PC9kaXY+CiAgICAke2QuY29kZXMubWFwKGMgPT4gYDxkaXYgY2xhc3M9InJjLXJvdyI+PHNwYW4gY2xhc3M9InJjLW4iPiR7ZXNjKGMuc2VsbGVyKX08L3NwYW4+JHtjLmNvZGUgPyBgPGIgY2xhc3M9InJjLWNvZGUiPiR7ZXNjKGMuY29kZSl9PC9iPmAgOiAnPHNwYW4gY2xhc3M9InJjLW1pc3MiPnNpbiBjw7NkaWdvPC9zcGFuPid9JHtkLmNhbkVkaXQgPyBgPGJ1dHRvbiBjbGFzcz0icmMtZWRpdCIgZGF0YS1yYz0iJHtjLnNlbGxlcl9pZH0iPiR7Yy5jb2RlID8gJ0NhbWJpYXInIDogJ0FncmVnYXInfTwvYnV0dG9uPmAgOiAnJ308L2Rpdj5gKS5qb2luKCcnKX0KICAgICR7ZC5jYW5FZGl0ID8gJzxidXR0b24gY2xhc3M9InJjLWVkaXQgcmMtaG93YnRuIiBkYXRhLWhvdz7Cv0PDs21vIGNhcmdhcmxvIGVuIDEgY2xpYz88L2J1dHRvbj48ZGl2IGNsYXNzPSJyYy1ob3dib3giIGhpZGRlbj4nICsgYm9va21hcmtsZXRIZWxwKCkgKyAnPC9kaXY+JyA6ICcnfTwvZGl2PmA7CiAgYm94Lm9uY2xpY2sgPSBlID0+IHsKICAgIGlmIChlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1yY3RvZ2dsZV0nKSkgeyBjb25zdCBwb3AgPSBib3gucXVlcnlTZWxlY3RvcignLnJjLXBvcCcpOyBwb3AuaGlkZGVuID0gIXBvcC5oaWRkZW47IGJveC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1yY3RvZ2dsZV0nKS5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAhcG9wLmhpZGRlbik7IHJldHVybjsgfQogICAgaWYgKGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLWhvd10nKSkgeyBjb25zdCBoID0gYm94LnF1ZXJ5U2VsZWN0b3IoJy5yYy1ob3dib3gnKTsgaC5oaWRkZW4gPSAhaC5oaWRkZW47IHJldHVybjsgfQogICAgY29kZXNFZGl0Q2xpY2soZSk7CiAgfTsKICBpZiAoIWRyYXdDb2Rlc1N0cmlwLl9vdXRzaWRlKSB7IGRyYXdDb2Rlc1N0cmlwLl9vdXRzaWRlID0gdHJ1ZTsgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBlID0+IHsgY29uc3QgYnggPSAkKCcjcmNvZGVzJyk7IGNvbnN0IHBvcCA9IGJ4Py5xdWVyeVNlbGVjdG9yKCcucmMtcG9wJyk7IGlmIChwb3AgJiYgIXBvcC5oaWRkZW4gJiYgIWJ4LmNvbnRhaW5zKGUudGFyZ2V0KSkgeyBwb3AuaGlkZGVuID0gdHJ1ZTsgYngucXVlcnlTZWxlY3RvcignW2RhdGEtcmN0b2dnbGVdJyk/LnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICdmYWxzZScpOyB9IH0pOyB9Cn0KZnVuY3Rpb24gY29kZXNFZGl0Q2xpY2soZSkgewogIGNvbnN0IGIgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1yY10nKTsgaWYgKCFiKSByZXR1cm47CiAgY29uc3Qgc2lkID0gTnVtYmVyKGIuZGF0YXNldC5yYyksIGMgPSBjb2Rlc0RhdGEuY29kZXMuZmluZCh4ID0+IHguc2VsbGVyX2lkID09PSBzaWQpOwogIGNvbnN0IGNoaXAgPSBiLmNsb3Nlc3QoJy5yYy1yb3csIC5yYy1jYXJkJyk7CiAgY29uc3QgaG9sZGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZm9ybScpOyBob2xkZXIuY2xhc3NOYW1lID0gJ3JjLWZvcm0nOwogIGhvbGRlci5pbm5lckhUTUwgPSBgPGlucHV0IG1heGxlbmd0aD0iMzAiIHBsYWNlaG9sZGVyPSJDw7NkaWdvIGRlIGhveSIgdmFsdWU9IiR7ZXNjKGM/LmNvZGUgfHwgJycpfSIgYXJpYS1sYWJlbD0iQ8OzZGlnbyBkZSAke2VzYyhjPy5zZWxsZXIgfHwgJycpfSI+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IGJ0bi1zbSI+R3VhcmRhcjwvYnV0dG9uPmA7CiAgYi5yZXBsYWNlV2l0aChob2xkZXIpOwogIGNvbnN0IGlucCA9IGhvbGRlci5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpOyBpbnAuZm9jdXMoKTsgaW5wLnNlbGVjdCgpOwogIGhvbGRlci5vbnN1Ym1pdCA9IGFzeW5jIGV2ID0+IHsgZXYucHJldmVudERlZmF1bHQoKTsgdHJ5IHsgY29uc3QgcHJldiA9IGM/LmNvZGUgfHwgJyc7IGF3YWl0IGFwaSgnL2FwaS9yZXR1cm4tY29kZXMvJyArIHNpZCwgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBjb2RlOiBpbnAudmFsdWUgfSB9KTsgaWYgKHByZXYgIT09IGlucC52YWx1ZS50cmltKCkpIHsgYXdhaXQgYXBpKCcvYXBpL3VuZG8vY29kZScsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgbGFiZWw6ICdDw7NkaWdvIGRlICcgKyAoYz8uc2VsbGVyIHx8ICcnKSwgc2VsbGVyX2lkOiBzaWQsIHByZXYsIG5leHQ6IGlucC52YWx1ZS50cmltKCkgfSB9KS5jYXRjaCgoKSA9PiB7fSk7IHJlZnJlc2hVbmRvKCk7IH0gdG9hc3QoJ0PDs2RpZ28gZ3VhcmRhZG8nKTsgbG9hZENvZGVzKCk7IH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSwgNDAwMCk7IH0gfTsKICBpbnAub25rZXlkb3duID0gZXYgPT4geyBpZiAoZXYua2V5ID09PSAnRXNjYXBlJykgbG9hZENvZGVzKCk7IH07CiAgaWYgKGNoaXApIGNoaXAuY2xhc3NMaXN0LmFkZCgncmMtZWRpdGluZycpOwp9CgovLyBNYXJjYWRvciAiRW52aWFyIGPDs2RpZ28gYSBFdGlxdWV0YUh1YiI6IGVuIE1lcmNhZG8gTGlicmUgKFZlbnRhcykgbGVlIGVsICJDw7NkaWdvIGRlIGF1dG9yaXphY2nDs24gcGFyYSBob3kiIHkgbG8gYWJyZSBhcXXDrQpjb25zdCBCT09LTUFSS0xFVCA9IGBqYXZhc2NyaXB0OigoKT0+e2NvbnN0IHQ9ZG9jdW1lbnQuYm9keS5pbm5lclRleHQ7Y29uc3QgbT10Lm1hdGNoKC9hdXRvcml6YWNpW2/Ds11uIHBhcmEgaG95Oj9cXHMqKFtBLVowLTldezQsMTZ9KS9pKTtpZighbSl7YWxlcnQoJ05vIGVuY29udHLDqSBlbCBjw7NkaWdvLiBBYnJlIFZlbnRhcyBlbiBNZXJjYWRvIExpYnJlIHkgdnVlbHZlIGEgaW50ZW50YXIuJyk7cmV0dXJufWNvbnN0IHU9KGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5pbm5lckhUTUwubWF0Y2goLyJ1c2VySWQiOiIoXFxkKykiLyl8fFtdKVsxXXx8Jyc7d2luZG93Lm9wZW4oJyR7bG9jYXRpb24ub3JpZ2lufS9jb2RpZ28/Yz0nK21bMV0rJyZ1PScrdSwnX2JsYW5rJyl9KSgpYDsKZnVuY3Rpb24gYm9va21hcmtsZXRIZWxwKCkgewogIHJldHVybiBgPGRpdiBjbGFzcz0icmMtaGVscCI+PGI+Q2FyZ2FyIGVsIGPDs2RpZ28gZW4gMSBjbGljPC9iPjxvbD4KICAgIDxsaT5BcnJhc3RyYSBlc3RlIGJvdMOzbiBhIHR1IGJhcnJhIGRlIGZhdm9yaXRvczogPGEgY2xhc3M9InJjLWJtIiBocmVmPSIke2VzYyhCT09LTUFSS0xFVCl9IiBvbmNsaWNrPSJldmVudC5wcmV2ZW50RGVmYXVsdCgpO2FsZXJ0KCdBcnLDoXN0cmFsbyBhIGxhIGJhcnJhIGRlIGZhdm9yaXRvcyAobm8gbGUgaGFnYXMgY2xpYyBhcXXDrSkuJykiPkVudmlhciBjw7NkaWdvIGEgRXRpcXVldGFIdWI8L2E+PC9saT4KICAgIDxsaT5DYWRhIGTDrWEgYWJyZSA8Yj5WZW50YXM8L2I+IGVuIE1lcmNhZG8gTGlicmUgY29uIGxhIGN1ZW50YSBkZWwgdmVuZGVkb3IgeSBoYXogY2xpYyBlbiBlc2UgZmF2b3JpdG8uPC9saT4KICAgIDxsaT5FbCBjw7NkaWdvIHF1ZWRhIGd1YXJkYWRvIGFxdcOtIHkgbG8gdmVuIGxhIGFnZW5jaWEgeSBlbCBhZG1pbmlzdHJhZG9yLjwvbGk+PC9vbD48L2Rpdj5gOwp9CmFzeW5jIGZ1bmN0aW9uIHNhdmVDb2RlRnJvbUxpbmsoKSB7CiAgY29uc3QgcXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKGxvY2F0aW9uLnNlYXJjaCksIGNvZGUgPSAocXMuZ2V0KCdjJykgfHwgJycpLnRyaW0oKSwgbWx1ID0gKHFzLmdldCgndScpIHx8ICcnKS50cmltKCk7CiAgaGlzdG9yeS5yZXBsYWNlU3RhdGUobnVsbCwgJycsICcvJyk7CiAgaWYgKCFjb2RlKSByZXR1cm4gcmVuZGVyU2hlbGwoKTsKICBpZiAobWx1ICYmIFsnYWRtaW4nLCAnc2VsbGVyJ10uaW5jbHVkZXMobWUudXNlci5yb2xlKSkgewogICAgcmVuZGVyU2hlbGwoKTsKICAgIHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9yZXR1cm4tY29kZXMvYnktbWwnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IG1sX3VzZXJfaWQ6IG1sdSwgY29kZSB9IH0pOyB0b2FzdChgQ8OzZGlnbyAke2NvZGV9IGd1YXJkYWRvYCwgNDAwMCk7IGxvYWRDb2RlcygpOyByZXR1cm47IH0KICAgIGNhdGNoIChlcnIpIHsgaWYgKG1lLnVzZXIucm9sZSA9PT0gJ3NlbGxlcicpIHJldHVybiB0b2FzdChlcnIubWVzc2FnZSwgNTAwMCk7IH0KICB9IGVsc2UgcmVuZGVyU2hlbGwoKTsKICBpZiAobWUudXNlci5yb2xlID09PSAnc2VsbGVyJyAmJiBtZS5zZWxsZXIpIHsKICAgIHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9yZXR1cm4tY29kZXMvJyArIG1lLnNlbGxlci5pZCwgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBjb2RlIH0gfSk7IHRvYXN0KGBDw7NkaWdvICR7Y29kZX0gZ3VhcmRhZG8gcGFyYSAke21lLnNlbGxlci5uYW1lfWAsIDQwMDApOyBsb2FkQ29kZXMoKTsgfSBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlLCA1MDAwKTsgfQogICAgcmV0dXJuOwogIH0KICBpZiAobWUudXNlci5yb2xlICE9PSAnYWRtaW4nKSByZXR1cm4gdG9hc3QoJ1NvbG8gZWwgYWRtaW5pc3RyYWRvciBvIGVsIHZlbmRlZG9yIHB1ZWRlbiBjYXJnYXIgY8OzZGlnb3MnLCA0MDAwKTsKICBjb25zdCBkID0gYXdhaXQgYXBpKCcvYXBpL3JldHVybi1jb2RlcycpOwogIGNvbnN0IGRsZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpOyBkbGcuY2xhc3NOYW1lID0gJ3JjLW1vZGFsJzsKICBkbGcuaW5uZXJIVE1MID0gYDxmb3JtIGNsYXNzPSJyYy1tb2RhbC1ib3giPjxoMz7Cv0RlIHF1w6kgY3VlbnRhIGVzIGVsIGPDs2RpZ28gPHNwYW4gY2xhc3M9InJjLWNvZGUiPiR7ZXNjKGNvZGUpfTwvc3Bhbj4/PC9oMz4KICAgIDxkaXYgY2xhc3M9InJjLXBpY2siPiR7ZC5jb2Rlcy5tYXAoYyA9PiBgPGxhYmVsPjxpbnB1dCB0eXBlPSJyYWRpbyIgbmFtZT0icmNzIiB2YWx1ZT0iJHtjLnNlbGxlcl9pZH0iPiAke2VzYyhjLnNlbGxlcil9JHtjLmFjY291bnQgPyBgIDxzbWFsbD4ke2VzYyhjLmFjY291bnQpfTwvc21hbGw+YCA6ICcnfSR7Yy5jb2RlID8gYCA8c21hbGw+KGhveTogJHtlc2MoYy5jb2RlKX0pPC9zbWFsbD5gIDogJyd9PC9sYWJlbD5gKS5qb2luKCcnKX08L2Rpdj4KICAgIDxkaXYgY2xhc3M9InJvdy1hY3Rpb25zIj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiPkd1YXJkYXI8L2J1dHRvbj48YnV0dG9uIHR5cGU9ImJ1dHRvbiIgY2xhc3M9ImJ0biBidG4tbGluZSIgZGF0YS14PkNhbmNlbGFyPC9idXR0b24+PC9kaXY+PC9mb3JtPmA7CiAgZG9jdW1lbnQuYm9keS5hcHBlbmQoZGxnKTsKICBkbGcucXVlcnlTZWxlY3RvcignW2RhdGEteF0nKS5vbmNsaWNrID0gKCkgPT4gZGxnLnJlbW92ZSgpOwogIGRsZy5xdWVyeVNlbGVjdG9yKCdmb3JtJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgIGUucHJldmVudERlZmF1bHQoKTsKICAgIGNvbnN0IHYgPSBkbGcucXVlcnlTZWxlY3RvcignaW5wdXRbbmFtZT1yY3NdOmNoZWNrZWQnKTsgaWYgKCF2KSByZXR1cm4gdG9hc3QoJ0VsaWdlIGxhIGN1ZW50YScpOwogICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL3JldHVybi1jb2Rlcy8nICsgdi52YWx1ZSwgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBjb2RlIH0gfSk7IGRsZy5yZW1vdmUoKTsgdG9hc3QoJ0PDs2RpZ28gZ3VhcmRhZG8nKTsgbG9hZENvZGVzKCk7IH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSwgNDAwMCk7IH0KICB9Owp9Ci8vIFDDoWdpbmEgY29tcGxldGEgcGFyYSBsYSBhZ2VuY2lhICh5IHF1aWVuIGxhIGFicmEpCmZ1bmN0aW9uIHJlbmRlckNvZGVzUGFnZSgpIHsKICAkKCcjbWFpbicpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJyYy1wYWdlIiBpZD0icmNQYWdlIj48ZGl2IGNsYXNzPSJlbXB0eSI+Q2FyZ2FuZG8gY8OzZGlnb3PigKY8L2Rpdj48L2Rpdj5gOwogIGxvYWRDb2RlcygpOwp9CmZ1bmN0aW9uIGRyYXdDb2Rlc1BhZ2UoKSB7CiAgY29uc3QgYm94ID0gJCgnI3JjUGFnZScpOyBpZiAoIWJveCB8fCAhY29kZXNEYXRhKSByZXR1cm47CiAgY29uc3QgZCA9IGNvZGVzRGF0YTsKICBib3guaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9InJjLWhlcm8iPjxoMj5Dw7NkaWdvcyBkZSBhdXRvcml6YWNpw7NuIHBhcmEgaG95PC9oMj48cD5EZXZvbHVjaW9uZXMgZGUgTWVyY2FkbyBMaWJyZSDCtyA8Yj4ke2VzYyhjb2RlRGF5UyhkLmRheSkpfTwvYj48L3A+PHNtYWxsPkNhbWJpYW4gdG9kb3MgbG9zIGTDrWFzLiBFc3RhIHBhbnRhbGxhIHNlIGFjdHVhbGl6YSBzb2xhLjwvc21hbGw+PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJyYy1ncmlkIj4ke2QuY29kZXMubWFwKGMgPT4gYDxkaXYgY2xhc3M9InJjLWNhcmQgJHtjLmNvZGUgPyAnJyA6ICdyYy1lbXB0eSd9Ij4KICAgICAgPHNwYW4gY2xhc3M9InJjLXNlbGxlciI+JHtlc2MoYy5zZWxsZXIpfTwvc3Bhbj4ke2MuYWNjb3VudCA/IGA8c21hbGwgY2xhc3M9InJjLWFjYyI+JHtlc2MoYy5hY2NvdW50KX08L3NtYWxsPmAgOiAnJ30KICAgICAgJHtjLmNvZGUgPyBgPGIgY2xhc3M9InJjLWJpZyI+JHtlc2MoYy5jb2RlKX08L2I+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSByYy1jb3B5IiBkYXRhLWNvcHk9IiR7ZXNjKGMuY29kZSl9Ij5Db3BpYXI8L2J1dHRvbj5gIDogJzxzcGFuIGNsYXNzPSJyYy13YWl0Ij5Bw7puIG5vIGVzdMOhIGVsIGPDs2RpZ28gZGUgaG95PC9zcGFuPid9CiAgICAgICR7ZC5jYW5FZGl0ID8gYDxidXR0b24gY2xhc3M9InJjLWVkaXQiIGRhdGEtcmM9IiR7Yy5zZWxsZXJfaWR9Ij4ke2MuY29kZSA/ICdDYW1iaWFyJyA6ICcrIEFncmVnYXIgY8OzZGlnbyd9PC9idXR0b24+YCA6ICcnfQogICAgPC9kaXY+YCkuam9pbignJykgfHwgJzxkaXYgY2xhc3M9ImVtcHR5Ij5ObyBoYXkgY3VlbnRhcyBkZSBNZXJjYWRvIExpYnJlIGNvbmVjdGFkYXMuPC9kaXY+J308L2Rpdj5gOwogIGJveC5vbmNsaWNrID0gZSA9PiB7CiAgICBjb25zdCBjcCA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLWNvcHldJyk7CiAgICBpZiAoY3ApIHsgbmF2aWdhdG9yLmNsaXBib2FyZD8ud3JpdGVUZXh0KGNwLmRhdGFzZXQuY29weSkudGhlbigoKSA9PiB0b2FzdCgnQ8OzZGlnbyBjb3BpYWRvJykpLmNhdGNoKCgpID0+IHt9KTsgcmV0dXJuOyB9CiAgICBjb2Rlc0VkaXRDbGljayhlKTsKICB9Owp9Ci8vIENhbWJpYSBlbCBkw61hIGEgbWVkaWFub2NoZTogc2UgdnVlbHZlIGEgcGVkaXIgY2FkYSA1IG1pbnV0b3MgeSBhbCB2b2x2ZXIgYSBsYSBwZXN0YcOxYQpzZXRJbnRlcnZhbCgoKSA9PiB7IGlmIChtZSAmJiAhZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnJjLWZvcm0gaW5wdXQ6Zm9jdXMnKSkgbG9hZENvZGVzKCk7IH0sIDMwMDAwMCk7CmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3Zpc2liaWxpdHljaGFuZ2UnLCAoKSA9PiB7IGlmICghZG9jdW1lbnQuaGlkZGVuICYmIG1lKSBsb2FkQ29kZXMoKTsgfSk7CgoKLy8gLS0tLS0tLS0tLSBEZXNoYWNlcjogY2FkYSB1c3VhcmlvIGRlc2hhY2Ugc29sbyBsbyBxdWUgw6lsIGhpem8sIHVuIHBhc28gYSBsYSB2ZXogLS0tLS0tLS0tLQpsZXQgdW5kb0luZm8gPSB7IGxhYmVsOiBudWxsLCBjb3VudDogMCB9OwovLyBBbnRlcyBkZSB1bmEgYWNjacOzbjogZ3VhcmRhIGPDs21vIGVzdGFiYW4gbGFzIGV0aXF1ZXRhcy4gRGV2dWVsdmUgdW5hIGZ1bmNpw7NuIHF1ZSBzZSBsbGFtYSBjdWFuZG8gbGEgYWNjacOzbiB0ZXJtaW7Dsy4KYXN5bmMgZnVuY3Rpb24gcmVjb3JkT3JkZXJzKGxhYmVsLCBpZHMpIHsKICBsZXQgaWQgPSBudWxsOwogIHRyeSB7IGlkID0gKGF3YWl0IGFwaSgnL2FwaS91bmRvL2JlZ2luJywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBsYWJlbCwgaWRzIH0gfSkpLmlkOyB9IGNhdGNoIHt9CiAgcmV0dXJuIGFzeW5jICgpID0+IHsgaWYgKCFpZCkgcmV0dXJuOyB0cnkgeyBhd2FpdCBhcGkoYC9hcGkvdW5kby8ke2lkfS9kb25lYCwgeyBtZXRob2Q6ICdQT1NUJyB9KTsgfSBjYXRjaCB7fSByZWZyZXNoVW5kbygpOyB9Owp9CmFzeW5jIGZ1bmN0aW9uIHJlZnJlc2hVbmRvKCkgeyB0cnkgeyB1bmRvSW5mbyA9IGF3YWl0IGFwaSgnL2FwaS91bmRvJyk7IH0gY2F0Y2gge30gZHJhd1VuZG8oKTsgfQphc3luYyBmdW5jdGlvbiB1bmRvTGFzdCgpIHsKICBjb25zdCBiID0gJCgnI3VuZG9CdG4nKTsgaWYgKCF1bmRvSW5mby5sYWJlbCB8fCBiPy5kaXNhYmxlZCkgcmV0dXJuOwogIGlmIChiKSBiLmRpc2FibGVkID0gdHJ1ZTsKICB0cnkgewogICAgY29uc3QgciA9IGF3YWl0IGFwaSgnL2FwaS91bmRvL2xhc3QnLCB7IG1ldGhvZDogJ1BPU1QnIH0pOwogICAgdG9hc3Qoci5yZXN0b3JlZCA/IGBEZXNoZWNobzogJHtyLmxhYmVsfWAgKyAoci5za2lwcGVkID8gYCAoJHtyLnNraXBwZWR9IG5vIHNlIHRvY2Fyb24gcG9ycXVlIG90cmEgcGVyc29uYSBsYXMgY2FtYmnDsyBkZXNwdcOpcylgIDogJycpIDogYE5vIHNlIHB1ZG8gZGVzaGFjZXIgIiR7ci5sYWJlbH0iOiBvdHJhIHBlcnNvbmEgeWEgY2FtYmnDsyBlc2FzIGV0aXF1ZXRhc2AsIDQ1MDApOwogIH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSwgNDAwMCk7IH0KICBhd2FpdCByZWZyZXNoVW5kbygpOwogIGlmICh0YWIgPT09ICd0cmF5JykgbG9hZE9yZGVycygpOyBlbHNlIGlmICh0YWIgPT09ICdzZWxsZXInKSBsb2FkU2VsbGVyT3JkZXJzKCk7CiAgbG9hZENvZGVzKCk7Cn0KZnVuY3Rpb24gZHJhd1VuZG8oKSB7CiAgY29uc3QgYiA9ICQoJyN1bmRvQnRuJyk7IGlmICghYikgcmV0dXJuOwogIGIuZGlzYWJsZWQgPSAhdW5kb0luZm8ubGFiZWw7CiAgYi50aXRsZSA9IHVuZG9JbmZvLmxhYmVsID8gYERlc2hhY2VyOiAke3VuZG9JbmZvLmxhYmVsfSAoQ3RybCtaKWAgOiAnTm8gdGllbmVzIGFjY2lvbmVzIHBhcmEgZGVzaGFjZXInOwogIGIucXVlcnlTZWxlY3Rvcignc21hbGwnKS50ZXh0Q29udGVudCA9IHVuZG9JbmZvLmxhYmVsIHx8ICdOYWRhIHF1ZSBkZXNoYWNlcic7Cn0KZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIGUgPT4geyBpZiAoKGUuY3RybEtleSB8fCBlLm1ldGFLZXkpICYmICFlLnNoaWZ0S2V5ICYmIGUua2V5LnRvTG93ZXJDYXNlKCkgPT09ICd6JyAmJiAhZS50YXJnZXQuY2xvc2VzdCgnaW5wdXQsIHRleHRhcmVhLCBzZWxlY3QsIFtjb250ZW50ZWRpdGFibGVdJykgJiYgdW5kb0luZm8ubGFiZWwpIHsgZS5wcmV2ZW50RGVmYXVsdCgpOyB1bmRvTGFzdCgpOyB9IH0pOwoKCi8vIC0tLS0tLS0tLS0gTUtQIEZsYXNoOiBwcmVndW50YXMsIG1lbnNhamVzLCByZWNsYW1vcywgbWVkaWFjaW9uZXMgeSBkZXZvbHVjaW9uZXMgLS0tLS0tLS0tLQpjb25zdCBtayA9IHsgdmlldzogJ3F1ZXN0aW9ucycsIGRhdGE6IG51bGwsIGxvYWRpbmc6IGZhbHNlLCBoaWRkZW46IG5ldyBTZXQoKSwgc2VsbGVyOiBzdG9yZS5nZXQoJ21rcFNlbGxlcicsICcnKSB9Owpjb25zdCBhZ29TID0gZCA9PiB7IGlmICghZCkgcmV0dXJuICcnOyBjb25zdCBtID0gTWF0aC5yb3VuZCgoRGF0ZS5ub3coKSAtIG5ldyBEYXRlKGQpKSAvIDYwMDAwKTsgcmV0dXJuIG0gPCAxID8gJ3JlY2nDqW4nIDogbSA8IDYwID8gYGhhY2UgJHttfSBtaW5gIDogbSA8IDE0NDAgPyBgaGFjZSAke01hdGgucm91bmQobSAvIDYwKX0gaGAgOiBgaGFjZSAke01hdGgucm91bmQobSAvIDE0NDApfSBkYDsgfTsKY29uc3QgUEVSTV9NU0cgPSAnPGRpdiBjbGFzcz0ibWtwLXBlcm0iPjxiPkZhbHRhIGFjdGl2YXIgdW4gcGVybWlzbyBlbiBsYSBhcHAgZGUgTWVyY2FkbyBMaWJyZS48L2I+IEVudHJhIGEgZGV2ZWxvcGVycy5tZXJjYWRvbGlicmUuY2wg4oaSIE1pcyBhcGxpY2FjaW9uZXMg4oaSIEV0aXF1ZXRhSHViIOKGkiBFZGl0YXIg4oaSIFBlcm1pc29zIGZ1bmNpb25hbGVzIHkgYWN0aXZhIDxiPiJDb211bmljYWNpb25lcyBwcmUgeSBwb3N0IHZlbnRhIjwvYj4gKGxlY3R1cmEgeSBlc2NyaXR1cmEpLiBDdWFuZG8gbG8gZ3VhcmRlcywgZXN0YSBzZWNjacOzbiBzZSBsbGVuYSBzb2xhLjwvZGl2Pic7CmFzeW5jIGZ1bmN0aW9uIHJlbmRlck1rcChmb3JjZSA9IGZhbHNlKSB7CiAgaWYgKCEkKCcjbWtwQm9keScpKSB7CiAgICAkKCcjbWFpbicpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJta3AtaGVybyI+PGRpdj48aDI+TUtQIEZsYXNoPC9oMj48cD5Ub2RvIGxvIHF1ZSB0dXMgY29tcHJhZG9yZXMgZXNwZXJhbiBkZSB0aSwgZW4gdW4gc29sbyBsdWdhci48L3A+PC9kaXY+PHNwYW4gY2xhc3M9InNwYWNlciIgc3R5bGU9ImZsZXg6MSI+PC9zcGFuPjxzcGFuIGlkPSJta3BQaWNrIj48L3NwYW4+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1zbSBta3AtcmVmcmVzaCIgaWQ9Im1rcFJlZnJlc2giPkFjdHVhbGl6YXI8L2J1dHRvbj48L2Rpdj48ZGl2IGlkPSJta3BCb2R5Ij48ZGl2IGNsYXNzPSJlbXB0eSI+Q2FyZ2FuZG8gcHJlZ3VudGFzLCBtZW5zYWplcyB5IHJlY2xhbW9zIGRlIE1lcmNhZG8gTGlicmXigKYgKHB1ZWRlIHRhcmRhciB1bm9zIHNlZ3VuZG9zKTwvZGl2PjwvZGl2PmA7CiAgICAkKCcjbWtwUmVmcmVzaCcpLm9uY2xpY2sgPSAoKSA9PiByZW5kZXJNa3AodHJ1ZSk7CiAgfQogIGlmIChtay5sb2FkaW5nKSByZXR1cm47IG1rLmxvYWRpbmcgPSB0cnVlOwogIHRyeSB7IG1rLmRhdGEgPSBhd2FpdCBhcGkoYC9hcGkvbWtwL3N1bW1hcnk/JHttay5zZWxsZXIgPyAnc2VsbGVyX2lkPScgKyBtay5zZWxsZXIgKyAnJicgOiAnJ30ke2ZvcmNlID8gJ3JlZnJlc2g9MScgOiAnJ31gKTsgfQogIGNhdGNoIChlKSB7ICQoJyNta3BCb2R5JykuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9InBhbmVsIj48ZGl2IGNsYXNzPSJwYW5lbC1ib2R5Ij4ke2VzYyhlLm1lc3NhZ2UpfTwvZGl2PjwvZGl2PmA7IG1rLmxvYWRpbmcgPSBmYWxzZTsgcmV0dXJuOyB9CiAgbWsubG9hZGluZyA9IGZhbHNlOwogIGlmICh0YWIgIT09ICdta3AnKSByZXR1cm47CiAgaWYgKG1lLnVzZXIucm9sZSA9PT0gJ2FkbWluJyAmJiAkKCcjbWtwUGljaycpICYmICEkKCcjbWtwU2VsJykpIHsKICAgIGNvbnN0IHNsID0gYXdhaXQgYXBpKCcvYXBpL3NlbGxlcnMvbGlzdCcpLmNhdGNoKCgpID0+ICh7IHNlbGxlcnM6IFtdIH0pKTsKICAgICQoJyNta3BQaWNrJykuaW5uZXJIVE1MID0gYDxzZWxlY3QgaWQ9Im1rcFNlbCIgc3R5bGU9IndpZHRoOmF1dG8iPjxvcHRpb24gdmFsdWU9IiI+VG9kYXMgbGFzIGN1ZW50YXM8L29wdGlvbj4ke3NsLnNlbGxlcnMubWFwKHggPT4gYDxvcHRpb24gdmFsdWU9IiR7eC5pZH0iICR7U3RyaW5nKHguaWQpID09PSBTdHJpbmcobWsuc2VsbGVyKSA/ICdzZWxlY3RlZCcgOiAnJ30+JHtlc2MoeC5uYW1lKX08L29wdGlvbj5gKS5qb2luKCcnKX08L3NlbGVjdD5gOwogICAgJCgnI21rcFNlbCcpLm9uY2hhbmdlID0gZSA9PiB7IG1rLnNlbGxlciA9IGUudGFyZ2V0LnZhbHVlOyBzdG9yZS5zZXQoJ21rcFNlbGxlcicsIG1rLnNlbGxlcik7IHJlbmRlck1rcCgpOyB9OwogIH0KICBkcmF3TWtwKCk7CiAgY2xlYXJUaW1lb3V0KHJlbmRlck1rcC5fdCk7IHJlbmRlck1rcC5fdCA9IHNldFRpbWVvdXQoKCkgPT4geyBpZiAodGFiID09PSAnbWtwJyAmJiAhZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLm1rcC1ib2R5IHRleHRhcmVhOmZvY3VzJykpIHJlbmRlck1rcCgpOyB9LCBtay5kYXRhLmxvYWRpbmcgPyA4MDAwIDogMTIwZTMpOwp9Ci8vIGNsaWMgZnVlcmEgZGUgbG9zIHJlY3VhZHJvcyAoeSBmdWVyYSBkZWwgZGV0YWxsZSkgPSBkZXNtYXJjYXIgbGEgc2VjY2nDs24KZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBlID0+IHsKICBpZiAodGFiICE9PSAnbWtwJyB8fCAhbWsudmlldyB8fCAhJCgnI21rcEJvZHknKSkgcmV0dXJuOwogIGlmIChlLnRhcmdldC5jbG9zZXN0KCcubWtwLXRpbGVzLCAubWtwLWJvZHksIC5ta3AtaGVybywgLnRvcCwgYnV0dG9uLCBhLCBpbnB1dCwgdGV4dGFyZWEsIHNlbGVjdCwgZm9ybSwgbGFiZWwsIC50b2FzdCcpKSByZXR1cm47CiAgbWsudmlldyA9IG51bGw7IGRyYXdNa3AoKTsKfSk7CmZ1bmN0aW9uIG1rcExpc3RzKCkgewogIGNvbnN0IGQgPSBtay5kYXRhLCBBID0gZC5hY2NvdW50czsKICBjb25zdCB0YWcgPSBhID0+ICh7IC4uLmEgfSk7CiAgY29uc3QgcSA9IFtdLCBtID0gW10sIGMgPSBbXSwgbWQgPSBbXSwgciA9IFtdOwogIC8vIHNvbG8gc2UgbXVlc3RyYSAiZmFsdGEgcGVybWlzbyIgc2kgTklOR1VOQSBjdWVudGEgcHVkbyBsZWVyc2U7IHNpIGFsZ3VuYSBmYWxsYSwgc2UgYXZpc2EgYXBhcnRlCiAgY29uc3QgYWxsRXJyID0gayA9PiBBLmxlbmd0aCA+IDAgJiYgQS5ldmVyeShhID0+IGEuZXJyb3JzW2tdID09PSAncGVybWlzbycpOwogIGNvbnN0IGVyciA9IHsgcXVlc3Rpb25zOiBhbGxFcnIoJ3F1ZXN0aW9ucycpLCBtZXNzYWdlczogYWxsRXJyKCdtZXNzYWdlcycpLCBjbGFpbXM6IGFsbEVycignY2xhaW1zJyksIHJldHVybnM6IGFsbEVycigncmV0dXJucycpIH07CiAgZXJyLnBhcnRpYWwgPSBBLmZpbHRlcihhID0+IE9iamVjdC52YWx1ZXMoYS5lcnJvcnMgfHwge30pLmluY2x1ZGVzKCdwZXJtaXNvJykpLm1hcChhID0+IGEuc2VsbGVyKTsKICBmb3IgKGNvbnN0IGEgb2YgQSkgewogICAgYS5xdWVzdGlvbnMuZm9yRWFjaCh4ID0+IHsgaWYgKCFtay5oaWRkZW4uaGFzKCdxJyArIHguaWQpKSBxLnB1c2goeyAuLi54LCBhY2M6IGEgfSk7IH0pOwogICAgYS5tZXNzYWdlcy5mb3JFYWNoKHggPT4geyBpZiAoIW1rLmhpZGRlbi5oYXMoJ20nICsgeC5wYWNrX2lkKSkgbS5wdXNoKHsgLi4ueCwgYWNjOiBhIH0pOyB9KTsKICAgIGEuY2xhaW1zLmZvckVhY2goeCA9PiB7IGMucHVzaCh7IC4uLngsIGFjYzogYSB9KTsgaWYgKHguZGlzcHV0ZSkgbWQucHVzaCh7IC4uLngsIGFjYzogYSB9KTsgfSk7IC8vIFJlY2xhbW9zID0gdG9kb3MgbG9zIHF1ZSBoYXkgcXVlIGF0ZW5kZXIgKGluY2x1eWUgbG9zIHF1ZSBlc3TDoW4gZW4gbWVkaWFjacOzbikKICAgIGEucmV0dXJucy5mb3JFYWNoKHggPT4gci5wdXNoKHsgLi4ueCwgYWNjOiBhIH0pKTsKICB9CiAgZm9yIChjb25zdCBmIG9mIGQuZmFsYWJlbGxhKSBmLnJldHVybnMuZm9yRWFjaCh4ID0+IHIucHVzaCh7IC4uLngsIGFjYzogZiB9KSk7CiAgcmV0dXJuIHsgcSwgbSwgYywgbWQsIHIsIGVyciwgdGFnIH07Cn0KZnVuY3Rpb24gZHJhd01rcCgpIHsKICBjb25zdCBib3ggPSAkKCcjbWtwQm9keScpOyBpZiAoIWJveCB8fCAhbWsuZGF0YSkgcmV0dXJuOwogIGNvbnN0IEwgPSBta3BMaXN0cygpOwogIGNvbnN0IHJUb2RheSA9IEwuci5maWx0ZXIoeCA9PiB4LnRvZGF5KTsKICBjb25zdCByQnkgPSBrID0+IHJUb2RheS5maWx0ZXIoeCA9PiB4Lm1rID09PSBrKS5sZW5ndGg7CiAgY29uc3QgZCA9IG1rLmRhdGEsIGxhdGVOID0gKGQubGF0ZSB8fCBbXSkuZmlsdGVyKHggPT4geC5sZXZlbCA9PT0gJ2xhdGUnKS5sZW5ndGgsIHdhcm5OID0gKGQubGF0ZSB8fCBbXSkuZmlsdGVyKHggPT4geC5sZXZlbCA9PT0gJ3dhcm4nKS5sZW5ndGg7CiAgY29uc3QgdGlsZXMgPSBbCiAgICBbJ3F1ZXN0aW9ucycsICdQcmVndW50YXMnLCBMLnEubGVuZ3RoLCAnc2luIHJlc3BvbmRlcicsIEwuZXJyLnF1ZXN0aW9uc10sCiAgICBbJ21lc3NhZ2VzJywgJ01lbnNhamVzJywgTC5tLmxlbmd0aCwgJ3NpbiBsZWVyJywgTC5lcnIubWVzc2FnZXNdLAogICAgWydjbGFpbXMnLCAnUmVjbGFtb3MgeSBtZWRpYWNpb25lcycsIEwuYy5sZW5ndGgsIGAke0wuYy5sZW5ndGggLSBMLm1kLmxlbmd0aH0gcmVjbGFtb3MgwrcgJHtMLm1kLmxlbmd0aH0gbWVkaWFjaW9uZXNgLCBMLmVyci5jbGFpbXNdLAogIF07CiAgY29uc3QgYWNjTmFtZSA9IHggPT4gbWUudXNlci5yb2xlID09PSAnYWRtaW4nID8gYDxzcGFuIGNsYXNzPSJta3AtYWNjIj4ke2VzYyh4LmFjYy5zZWxsZXIpfTwvc3Bhbj5gIDogJyc7CiAgY29uc3QgcmVwbHlCb3ggPSAoa2luZCwgYXR0cnMsIG1heCwgcGgpID0+IGA8Zm9ybSBjbGFzcz0ibWtwLXJlcGx5IiBkYXRhLWtpbmQ9IiR7a2luZH0iICR7YXR0cnN9Pjx0ZXh0YXJlYSByb3dzPSIyIiBtYXhsZW5ndGg9IiR7bWF4fSIgcGxhY2Vob2xkZXI9IiR7cGh9Ij48L3RleHRhcmVhPjxkaXYgY2xhc3M9Im1rcC1yZXBseS1iYXIiPjxzbWFsbD48c3BhbiBjbGFzcz0ibWtwLWNudCI+MDwvc3Bhbj4vJHttYXh9PC9zbWFsbD48YnV0dG9uIGNsYXNzPSJidG4gYnRuLXNtIG1rcC1zZW5kIj5SZXNwb25kZXI8L2J1dHRvbj48L2Rpdj48L2Zvcm0+YDsKICBjb25zdCBwcm9kTGluZSA9IHBzID0+IChwcyB8fCBbXSkubWFwKHAgPT4gYCR7ZXNjKHAudGl0bGUgfHwgJycpfSR7cC5xdHkgPiAxID8gYCA8c21hbGw+w5cke3AucXR5fTwvc21hbGw+YCA6ICcnfWApLmpvaW4oJyDCtyAnKTsKICBsZXQgbGlzdCA9ICcnOwogIGlmIChtay52aWV3ID09PSAncXVlc3Rpb25zJykgbGlzdCA9IEwuZXJyLnF1ZXN0aW9ucyA/IFBFUk1fTVNHIDogTC5xLmxlbmd0aCA/IEwucS5tYXAoeCA9PiBgPGFydGljbGUgY2xhc3M9Im1rcC1jYXJkIj4KICAgICAgPGRpdiBjbGFzcz0ibWtwLWNhcmQtaCI+JHt4Lml0ZW0udGh1bWIgPyBgPGltZyBzcmM9IiR7ZXNjKHguaXRlbS50aHVtYil9IiBhbHQ9IiIgbG9hZGluZz0ibGF6eSI+YCA6ICcnfTxkaXY+PGEgaHJlZj0iJHtlc2MoeC5pdGVtLmxpbmsgfHwgJyMnKX0iIHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIj4ke2VzYyh4Lml0ZW0udGl0bGUgfHwgeC5pdGVtLmlkKX08L2E+PHNtYWxsPiR7YWNjTmFtZSh4KX0ke2Fnb1MoeC5kYXRlKX08L3NtYWxsPjwvZGl2PjwvZGl2PgogICAgICA8cCBjbGFzcz0ibWtwLXEiPuKAnCR7ZXNjKHgudGV4dCl94oCdPC9wPiR7cmVwbHlCb3goJ2Fuc3dlcicsIGBkYXRhLWNvbm49IiR7eC5hY2MuY29ubl9pZH0iIGRhdGEtaWQ9IiR7eC5pZH0iYCwgMjAwMCwgJ0VzY3JpYmUgdHUgcmVzcHVlc3Rh4oCmJyl9PGRpdiBjbGFzcz0ibWtwLXJlYWRiYXIiPjxidXR0b24gdHlwZT0iYnV0dG9uIiBjbGFzcz0icS1kZWwiIGRhdGEtcWRlbD0iJHt4LmlkfSIgZGF0YS1jb25uPSIke3guYWNjLmNvbm5faWR9IiB0aXRsZT0iRWxpbWluYSBsYSBwcmVndW50YSBzaW4gcmVzcG9uZGVybGEsIGFxdcOtIHkgZW4gTWVyY2FkbyBMaWJyZSI+8J+XkSBFbGltaW5hciBwcmVndW50YTwvYnV0dG9uPjwvZGl2PjwvYXJ0aWNsZT5gKS5qb2luKCcnKSA6ICc8ZGl2IGNsYXNzPSJta3AtZW1wdHkiPvCfjokgTm8gdGllbmVzIHByZWd1bnRhcyBwZW5kaWVudGVzLjwvZGl2Pic7CiAgY29uc3QgYXR0SHRtbCA9IChsaXN0LCBjb25uLCBraW5kLCByZWYpID0+IChsaXN0IHx8IFtdKS5sZW5ndGggPyBgPGRpdiBjbGFzcz0iYnViLWF0dCI+JHtsaXN0Lm1hcChhID0+IHsgY29uc3QgdSA9IGAvYXBpL21rcC9hdHQvJHtjb25ufS8ke2tpbmR9LyR7ZW5jb2RlVVJJQ29tcG9uZW50KHJlZil9LyR7ZW5jb2RlVVJJQ29tcG9uZW50KGEuZil9YDsgcmV0dXJuIC9wZGYvaS50ZXN0KGEudCArIGEubikgPyBgPGEgaHJlZj0iJHt1fSIgdGFyZ2V0PSJfYmxhbmsiIHJlbD0ibm9vcGVuZXIiIGNsYXNzPSJidWItZmlsZSI+8J+ThCAke2VzYyhhLm4gfHwgJ0FyY2hpdm8nKX08L2E+YCA6IGA8YSBocmVmPSIke3V9IiB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciIgdGl0bGU9IlZlciBlbiBncmFuZGUiIGNsYXNzPSJidWItaW1nIj48aW1nIHNyYz0iJHt1fSIgYWx0PSIiIGxvYWRpbmc9ImxhenkiIG9uZXJyb3I9InRoaXMucGFyZW50Tm9kZS5jbGFzc0xpc3QuYWRkKCdicm9rZW4nKSI+PHNwYW4+8J+TjiAke2VzYyhhLm4gfHwgJ0FyY2hpdm8gYWRqdW50bycpfTwvc3Bhbj48L2E+YDsgfSkuam9pbignJyl9PC9kaXY+YCA6ICcnOwogIGNvbnN0IGluaXRpYWxzID0gbiA9PiBlc2MoU3RyaW5nKG4gfHwgJ0MnKS50cmltKCkuc3BsaXQoL1xzKy8pLnNsaWNlKDAsIDIpLm1hcCh3ID0+IHdbMF0gfHwgJycpLmpvaW4oJycpLnRvVXBwZXJDYXNlKCkgfHwgJ0MnKTsKICBjb25zdCBtbEJhZGdlID0gJzxzcGFuIGNsYXNzPSJjaGF0LW1rIG1sIiB0aXRsZT0iQ29udmVyc2FjacOzbiBkZSBNZXJjYWRvIExpYnJlIj48c3ZnIHZpZXdCb3g9IjAgMCAyNCAyNCIgYXJpYS1oaWRkZW49InRydWUiPjxwYXRoIGQ9Ik00IDVoMTZhMiAyIDAgMCAxIDIgMnY4YTIgMiAwIDAgMS0yIDJoLTdsLTUgNHYtNEg0YTIgMiAwIDAgMS0yLTJWN2EyIDIgMCAwIDEgMi0yeiIvPjwvc3ZnPk1lcmNhZG8gTGlicmU8L3NwYW4+JzsKICBjb25zdCBzZW5kSWNvID0gJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBhcmlhLWhpZGRlbj0idHJ1ZSI+PHBhdGggZD0iTTMgMjAuNSAyMS41IDEyIDMgMy41bDIuOCA3LjJMMTUgMTJsLTkuMiAxLjN6Ii8+PC9zdmc+JzsKICBpZiAobWsudmlldyA9PT0gJ21lc3NhZ2VzJykgbGlzdCA9IEwuZXJyLm1lc3NhZ2VzID8gUEVSTV9NU0cgOiBMLm0ubGVuZ3RoID8gTC5tLm1hcCgoeCwgaSkgPT4gYDxhcnRpY2xlIGNsYXNzPSJta3AtY2FyZCBjaGF0LWNhcmQiIHN0eWxlPSItLWQ6JHtNYXRoLm1pbihpLCA4KSAqIDYwfW1zIj4KICAgICAgPGhlYWRlciBjbGFzcz0iY2hhdC1oZWFkIj48c3BhbiBjbGFzcz0iY2hhdC1hdiI+JHtpbml0aWFscyh4LmJ1eWVyKX08L3NwYW4+PGRpdiBjbGFzcz0iY2hhdC13aG8iPjxiPiR7ZXNjKHguYnV5ZXIgfHwgJ0NvbXByYWRvcicpfTwvYj48c21hbGw+JHthY2NOYW1lKHgpfSR7eC5zaGlwID8gYDxzcGFuIGNsYXNzPSJjaGF0LXNoaXAgJHt4LnNoaXAgPT09ICdGbGV4JyA/ICdmbGV4JyA6ICdhZyd9Ij4ke3guc2hpcCA9PT0gJ0ZsZXgnID8gJ+KaoSBNZXJjYWRvIExpYnJlIEZsZXgnIDogeC5zaGlwID09PSAnQWdlbmNpYScgPyAn8J+TpiBNZXJjYWRvIExpYnJlIEFnZW5jaWEnIDogJ01lcmNhZG8gTGlicmUgJyArIGVzYyh4LnNoaXApfTwvc3Bhbj5gIDogJyd9JHt4LnVucmVhZCA/IGA8c3BhbiBjbGFzcz0iY2hhdC11bnJlYWQiPiR7eC51bnJlYWR9IHNpbiBsZWVyPC9zcGFuPmAgOiAnJ308L3NtYWxsPjwvZGl2PiR7bWxCYWRnZX08L2hlYWRlcj4KICAgICAgPGRpdiBjbGFzcz0iY2hhdC1zYWxlIj48c3BhbiBjbGFzcz0iY2hhdC1zYWxlbm8iPlZlbnRhIDxiPiMke2VzYyh4LnBhY2tfaWQpfTwvYj48L3NwYW4+PHNwYW4gY2xhc3M9ImNoYXQtaXRlbXMiPvCfm43vuI8gJHsoeC5wcm9kdWN0cyAmJiB4LnByb2R1Y3RzLmxlbmd0aCA/IHgucHJvZHVjdHMgOiBbeyB0aXRsZTogeC5wcm9kdWN0LCBxdHk6IDEgfV0pLm1hcChwID0+IGA8Yj4ke2VzYyhwLnRpdGxlIHx8ICdQcm9kdWN0bycpfTwvYj4ke3AucXR5ID4gMSA/IGAgPGVtPsOXJHtwLnF0eX08L2VtPmAgOiAnJ31gKS5qb2luKCcgwrcgJyl9PC9zcGFuPjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJta3AtdGhyZWFkIGNoYXQtdGhyZWFkIj4ke3gudGhyZWFkLnNsaWNlKC02KS5tYXAoKHQsIGopID0+IGA8ZGl2IGNsYXNzPSJta3AtYnViICR7dC5mcm9tfSIgc3R5bGU9Ii0taToke2p9Ij4ke3QudGV4dCA/IGA8c3Bhbj4ke2VzYyh0LnRleHQpfTwvc3Bhbj5gIDogJyd9JHthdHRIdG1sKHQuYXR0LCB4LmFjYy5jb25uX2lkLCAnbXNnJywgeC5wYWNrX2lkKX08c21hbGw+JHthZ29TKHQuZGF0ZSl9JHt0LmZyb20gPT09ICdzZWxsZXInID8gJyDinJPinJMnIDogJyd9PC9zbWFsbD48L2Rpdj5gKS5qb2luKCcnKX08L2Rpdj4KICAgICAgPGZvcm0gY2xhc3M9Im1rcC1yZXBseSBjaGF0LWNvbXBvc2UiIGRhdGEta2luZD0ibWVzc2FnZSIgZGF0YS1jb25uPSIke3guYWNjLmNvbm5faWR9IiBkYXRhLXBhY2s9IiR7ZXNjKHgucGFja19pZCl9IiBkYXRhLWJ1eWVyPSIke2VzYyh4LmJ1eWVyX2lkIHx8ICcnKX0iPjx0ZXh0YXJlYSByb3dzPSIxIiBtYXhsZW5ndGg9IjM1MCIgcGxhY2Vob2xkZXI9IkVzY3JpYmUgdW4gbWVuc2FqZSBhbCBjb21wcmFkb3LigKYiPjwvdGV4dGFyZWE+PGJ1dHRvbiBjbGFzcz0ibWtwLXNlbmQgY2hhdC1zZW5kIiB0aXRsZT0iRW52aWFyIj4ke3NlbmRJY299PHNwYW4+RW52aWFyPC9zcGFuPjwvYnV0dG9uPjxkaXYgY2xhc3M9ImNoYXQtZm9vdCI+PHNtYWxsPjxzcGFuIGNsYXNzPSJta3AtY250Ij4wPC9zcGFuPi8zNTA8L3NtYWxsPjxidXR0b24gdHlwZT0iYnV0dG9uIiBjbGFzcz0iY2hhdC1yZWFkIiBkYXRhLW1hcmtyZWFkPSIke2VzYyh4LnBhY2tfaWQpfSIgZGF0YS1jb25uPSIke3guYWNjLmNvbm5faWR9IiB0aXRsZT0iUXVlZGEgY29tbyBsZcOtZG8gYXF1w60geSBlbiBNZXJjYWRvIExpYnJlIChhbCBjb21wcmFkb3IgbGUgYXBhcmVjZSB2aXN0byksIHNpbiByZXNwb25kZXIiPuKck+KckyBNYXJjYXIgY29tbyBsZcOtZG88L2J1dHRvbj48L2Rpdj48L2Zvcm0+PC9hcnRpY2xlPmApLmpvaW4oJycpIDogJzxkaXYgY2xhc3M9Im1rcC1lbXB0eSI+8J+OiSBObyB0aWVuZXMgbWVuc2FqZXMgc2luIGxlZXIuPC9kaXY+JzsKICBtay5jdCA9IG1rLmN0IHx8IHt9OyAvLyBjb252ZXJzYWNpw7NuIGRlIGNhZGEgcmVjbGFtbyAoc2UgY2FyZ2Egc29sYSkKICBjb25zdCBmRHVlID0gZCA9PiBuZXcgRGF0ZShkKS50b0xvY2FsZVN0cmluZygnZXMtQ0wnLCB7IGRheTogJzItZGlnaXQnLCBtb250aDogJ3Nob3J0JywgaG91cjogJzItZGlnaXQnLCBtaW51dGU6ICcyLWRpZ2l0JyB9KTsKICAvLyBNZW5zYWplIGRlIE1lcmNhZG8gTGlicmUgbcOhcyBjbGFybzogbmVncml0YXMsIG9wY2lvbmVzIG51bWVyYWRhcyAxKSAyKSAzKSB5IGVsIHBsYXpvIGRlc3RhY2FkbwogIGNvbnN0IGZtdE1sID0gcmF3ID0+IHsKICAgIGNvbnN0IGIgPSB0ID0+IGVzYyh0KS5yZXBsYWNlKC9cKlwqKC4rPylcKlwqL2csICc8Yj4kMTwvYj4nKS5yZXBsYWNlKC9cKlwqL2csICcnKTsKICAgIGNvbnN0IHQgPSBTdHJpbmcocmF3IHx8ICcnKS5yZXBsYWNlKC9ccysvZywgJyAnKS50cmltKCk7CiAgICBjb25zdCBzdGFydHMgPSBbXTsgbGV0IG4gPSAxLCBmcm9tID0gMDsKICAgIHdoaWxlICh0cnVlKSB7IGNvbnN0IHJlID0gbmV3IFJlZ0V4cCgnKF58XFxzKScgKyBuICsgJ1xcLlxccysoPz1cXFMpJywgJ2cnKTsgcmUubGFzdEluZGV4ID0gZnJvbTsgY29uc3QgbSA9IHJlLmV4ZWModCk7IGlmICghbSkgYnJlYWs7IHN0YXJ0cy5wdXNoKG0uaW5kZXggKyBtWzFdLmxlbmd0aCk7IGZyb20gPSBtLmluZGV4ICsgbVswXS5sZW5ndGg7IG4rKzsgfQogICAgaWYgKHN0YXJ0cy5sZW5ndGggPCAyKSByZXR1cm4gYDxzcGFuPiR7Yih0KX08L3NwYW4+YDsKICAgIGNvbnN0IGludHJvID0gdC5zbGljZSgwLCBzdGFydHNbMF0pLnRyaW0oKTsKICAgIGNvbnN0IG9wdHMgPSBzdGFydHMubWFwKChzdCwgaSkgPT4gdC5zbGljZShzdCwgc3RhcnRzW2kgKyAxXSA/PyB0Lmxlbmd0aCkucmVwbGFjZSgvXlxkK1wuXHMrLywgJycpLnRyaW0oKSk7CiAgICAvLyBlbCDDumx0aW1vIHB1bnRvIHN1ZWxlIHRyYWVyIGVsIGNpZXJyZSAoIlRlbsOpcyBoYXN0YeKApiIpOiBzZSBzZXBhcmEKICAgIGxldCBvdXRybyA9ICcnOyBjb25zdCBsYXN0ID0gb3B0c1tvcHRzLmxlbmd0aCAtIDFdOyBjb25zdCBjdXQgPSBsYXN0LnNlYXJjaCgvXC5ccysoPz0oVGVuw6lzfFRpZW5lc3xTaSBub3xSZWNvcmTDoXxSZWN1ZXJkYXxUZW4gZW4gY3VlbnRhfEltcG9ydGFudGUpXGIpLyk7CiAgICBpZiAoY3V0ID4gMCkgeyBvdXRybyA9IGxhc3Quc2xpY2UoY3V0ICsgMSkudHJpbSgpOyBvcHRzW29wdHMubGVuZ3RoIC0gMV0gPSBsYXN0LnNsaWNlKDAsIGN1dCArIDEpLnRyaW0oKTsgfQogICAgY29uc3Qgb3B0ID0gKG8sIGkpID0+IHsgY29uc3QgbSA9IG8ubWF0Y2goL15cKlwqKC4rPylcKlwqXHMqW+KAlOKAky1dP1xzKiguKikkLyk7IHJldHVybiBgPGxpPjxzcGFuIGNsYXNzPSJtbC1uIj4ke2kgKyAxfSk8L3NwYW4+PGRpdj4ke20gPyBgPGI+JHtlc2MobVsxXSl9PC9iPiR7bVsyXSA/IGA8c21hbGw+JHtiKG1bMl0pfTwvc21hbGw+YCA6ICcnfWAgOiBiKG8pfTwvZGl2PjwvbGk+YDsgfTsKICAgIHJldHVybiBgPGRpdiBjbGFzcz0ibWwtbXNnIj4keygoKSA9PiB7IGxldCBoID0gYihpbnRybykucmVwbGFjZSgvXHMqQW5hbGl6YW1vcyBlbCBjYXNvIHkgdGUgc3VnZXJpbW9zW146XSo6P1xzKiQvaSwgJycpLnJlcGxhY2UoLzxiPk5bw7p1XW1lcm8gZGUgcmVjbGFtYWNpW8Ozb11uOj88XC9iPjo/XHMqKFxkKylcLj8vaSwgJzwvcD48cD48c3BhbiBjbGFzcz0ibWwtY2hpcCI+UmVjbGFtbyBOwrAgJDE8L3NwYW4+Jyk7IHJldHVybiBoLnRyaW0oKSA/IGA8cD4ke2h9PC9wPmAgOiAnJzsgfSkoKX08cCBjbGFzcz0ibWwtaCI+T3BjaW9uZXMgcXVlIHRlIG9mcmVjZSBNZXJjYWRvIExpYnJlOjwvcD48b2wgY2xhc3M9Im1sLW9wdHMiPiR7b3B0cy5tYXAob3B0KS5qb2luKCcnKX08L29sPiR7b3V0cm8gPyBgPHAgY2xhc3M9Im1sLWRlYWRsaW5lIj7ij7MgJHtiKG91dHJvKX08L3A+YCA6ICcnfTwvZGl2PmA7CiAgfTsKICBjb25zdCBjbGFpbUJ1YnMgPSB4ID0+IHsgY29uc3QgdCA9IG1rLmN0W3guaWRdOyBpZiAoIXQpIHJldHVybiAnPGRpdiBjbGFzcz0iY2hhdC1sb2FkaW5nIj48aT48L2k+PGk+PC9pPjxpPjwvaT48L2Rpdj4nOyBpZiAodC5lcnIpIHJldHVybiBgPHNtYWxsIGNsYXNzPSJtdXRlZCI+JHtlc2ModC5lcnIpfTwvc21hbGw+YDsgcmV0dXJuIHQubGlzdC5sZW5ndGggPyB0Lmxpc3Quc2xpY2UoLTEyKS5tYXAoKG0sIGopID0+IGA8ZGl2IGNsYXNzPSJta3AtYnViICR7bS5mcm9tfSIgc3R5bGU9Ii0taToke2p9Ij4ke20uZnJvbSA9PT0gJ21lZGlhdG9yJyA/ICc8YiBjbGFzcz0iYnViLXdobyI+4pqW77iPIE1lcmNhZG8gTGlicmUgKG1lZGlhZG9yKTwvYj4nIDogJyd9JHttLnRleHQgPyBmbXRNbChtLnRleHQpIDogJyd9JHthdHRIdG1sKG0uYXR0LCB4LmFjYy5jb25uX2lkLCAnY2xhaW0nLCB4LmlkKX08c21hbGw+JHthZ29TKG0uZGF0ZSl9JHttLmZyb20gPT09ICdzZWxsZXInID8gJyDinJPinJMnIDogJyd9PC9zbWFsbD48L2Rpdj5gKS5qb2luKCcnKSA6ICc8c21hbGwgY2xhc3M9Im11dGVkIGNoYXQtbm9uZSI+QcO6biBubyBoYXkgbWVuc2FqZXMgZW4gZXN0ZSByZWNsYW1vLjwvc21hbGw+JzsgfTsKICBjb25zdCBjbGFpbUNhcmQgPSAoeCwgaSkgPT4gYDxhcnRpY2xlIGNsYXNzPSJta3AtY2FyZCBjaGF0LWNhcmQgY2xhaW0tY2hhdCAke3guZGlzcHV0ZSA/ICdtZWQnIDogJyd9IiBzdHlsZT0iLS1kOiR7TWF0aC5taW4oaSwgOCkgKiA2MH1tcyI+CiAgICAgIDxoZWFkZXIgY2xhc3M9ImNoYXQtaGVhZCI+PHNwYW4gY2xhc3M9ImNoYXQtYXYiPiR7aW5pdGlhbHMoeC5idXllcil9PC9zcGFuPjxkaXYgY2xhc3M9ImNoYXQtd2hvIj48Yj4ke2VzYyh4LmJ1eWVyIHx8ICdDb21wcmFkb3InKX08L2I+PHNtYWxsPiR7YWNjTmFtZSh4KX08c3BhbiBjbGFzcz0iY2xhaW0tdGFnICR7eC5kaXNwdXRlID8gJ21lZCcgOiAnJ30iPiR7eC5kaXNwdXRlID8gJ+Kalu+4jyBFbiBtZWRpYWNpw7NuJyA6ICfimqDvuI8gUmVjbGFtbyBhYmllcnRvJ308L3NwYW4+JHt4LmR1ZSA/IGA8c3BhbiBjbGFzcz0iY2xhaW0tZHVlIj7ij7MgUmVzcG9uZGVyIGFudGVzIGRlICR7ZXNjKGZEdWUoeC5kdWUpKX08L3NwYW4+YCA6ICcnfTwvc21hbGw+PC9kaXY+JHttbEJhZGdlfTwvaGVhZGVyPgogICAgICA8ZGl2IGNsYXNzPSJjaGF0LXNhbGUiPjxzcGFuIGNsYXNzPSJjaGF0LXNhbGVubyI+VmVudGEgPGI+IyR7ZXNjKHgucGFja19pZCB8fCB4Lm9yZGVyX2lkKX08L2I+PC9zcGFuPjxzcGFuIGNsYXNzPSJjaGF0LWl0ZW1zIj7wn5OMIDxiPiR7ZXNjKHgucmVhc29uIHx8ICdTaW4gbW90aXZvJyl9PC9iPjwvc3Bhbj4ke3gucHJvZHVjdHMgJiYgeC5wcm9kdWN0cy5sZW5ndGggPyBgPHNwYW4gY2xhc3M9ImNoYXQtaXRlbXMiPvCfm43vuI8gJHt4LnByb2R1Y3RzLm1hcChwID0+IGA8Yj4ke2VzYyhwLnRpdGxlIHx8ICdQcm9kdWN0bycpfTwvYj4ke3AucXR5ID4gMSA/IGAgPGVtPsOXJHtwLnF0eX08L2VtPmAgOiAnJ31gKS5qb2luKCcgwrcgJyl9JHt4LnRvdGFsID8gYCDCtyAke21vbmV5KHgudG90YWwpfWAgOiAnJ308L3NwYW4+YCA6ICcnfTwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJta3AtdGhyZWFkIGNoYXQtdGhyZWFkIiBpZD0iY3QtJHt4LmlkfSIgZGF0YS1jdGxvYWQ9IiR7eC5pZH0iIGRhdGEtY29ubj0iJHt4LmFjYy5jb25uX2lkfSI+JHtjbGFpbUJ1YnMoeCl9PC9kaXY+CiAgICAgIDxmb3JtIGNsYXNzPSJta3AtcmVwbHkgY2hhdC1jb21wb3NlIiBkYXRhLWtpbmQ9ImNsYWltIiBkYXRhLWNvbm49IiR7eC5hY2MuY29ubl9pZH0iIGRhdGEtaWQ9IiR7eC5pZH0iIGRhdGEtbWVkPSIke3guZGlzcHV0ZSA/IDEgOiAwfSI+PHRleHRhcmVhIHJvd3M9IjEiIG1heGxlbmd0aD0iMjAwMCIgcGxhY2Vob2xkZXI9IiR7eC5kaXNwdXRlID8gJ0VzY3JpYmUgYWwgbWVkaWFkb3IgZGUgTWVyY2FkbyBMaWJyZeKApicgOiAnUmVzcG9uZGUgYWwgY29tcHJhZG9y4oCmJ30iPjwvdGV4dGFyZWE+PGJ1dHRvbiBjbGFzcz0ibWtwLXNlbmQgY2hhdC1zZW5kIiB0aXRsZT0iRW52aWFyIj4ke3NlbmRJY299PHNwYW4+RW52aWFyPC9zcGFuPjwvYnV0dG9uPjxkaXYgY2xhc3M9ImNoYXQtZm9vdCI+PHNtYWxsPjxzcGFuIGNsYXNzPSJta3AtY250Ij4wPC9zcGFuPi8yMDAwIMK3ICR7eC5kaXNwdXRlID8gJ2xvIGxlZSBlbCBtZWRpYWRvcicgOiAnbG8gbGVlIGVsIGNvbXByYWRvcid9PC9zbWFsbD48L2Rpdj48L2Zvcm0+PC9hcnRpY2xlPmA7CiAgaWYgKG1rLnZpZXcgPT09ICdtZWRpYXRpb25zJykgbWsudmlldyA9ICdjbGFpbXMnOwogIGlmIChtay52aWV3ID09PSAnY2xhaW1zJykgbGlzdCA9IEwuZXJyLmNsYWltcyA/IFBFUk1fTVNHIDogTC5jLmxlbmd0aCA/IFsuLi5MLmNdLnNvcnQoKGEsIGIpID0+IChiLmRpc3B1dGUgPyAxIDogMCkgLSAoYS5kaXNwdXRlID8gMSA6IDApIHx8IFN0cmluZyhhLmR1ZSB8fCAnJykubG9jYWxlQ29tcGFyZShTdHJpbmcoYi5kdWUgfHwgJycpKSkubWFwKCh4LCBpKSA9PiBjbGFpbUNhcmQoeCwgaSkpLmpvaW4oJycpIDogJzxkaXYgY2xhc3M9Im1rcC1lbXB0eSI+8J+OiSBObyB0aWVuZXMgcmVjbGFtb3MgbmkgbWVkaWFjaW9uZXMgYWJpZXJ0b3MuPC9kaXY+JzsKICBpZiAobWsudmlldyA9PT0gJ2xhdGUnKSB7CiAgICBjb25zdCBMSyA9IHsgc2luX2VzY2FuZWFyOiAnU2luIGVzY2FuZWFyJywgbm9fZW50cmVnYWRvOiAnTm8gZW50cmVnYWRvJywgbm9fZGVzcGFjaGFkbzogJ05vIGRlc3BhY2hhZG8nIH07CiAgICBjb25zdCB3aHkgPSB4ID0+IHgubWsgPT09ICdmYScgfHwgeC5tayA9PT0gJ3BhJwogICAgICA/ICh4LmxldmVsID09PSAnd2FybicgPyBgWWEgc29uIG3DoXMgZGUgbGFzIDIwOjAwIHkgJHt4Lm1rID09PSAnZmEnID8gJ0ZhbGFiZWxsYSAvIGxhIGFnZW5jaWEnIDogJ1BhcmlzIC8gbGEgYWdlbmNpYSd9IGHDum4gbm8gbG8gZXNjYW5lYS5gIDogYFBhc8OzIHN1IGTDrWEgZGUgZGVzcGFjaG8geSAke3gubWsgPT09ICdmYScgPyAnRmFsYWJlbGxhJyA6ICdQYXJpcyd9IHRvZGF2w61hIG5vIGxvIHJlZ2lzdHJhIGNvbW8gZGVzcGFjaGFkby5gKQogICAgICA6IHguc2hpcCA9PT0gJ0ZsZXgnCiAgICAgID8gKHgua2luZCA9PT0gJ3Npbl9lc2NhbmVhcicgPyAoeC5sZXZlbCA9PT0gJ3dhcm4nID8gJ1lhIHNvbiBtw6FzIGRlIGxhcyAxOTowMCB5IGVsIGNvbmR1Y3RvciBhw7puIG5vIGVzY2FuZWEgbGEgZXRpcXVldGEuJyA6ICdFbCBjb25kdWN0b3IgbnVuY2EgZXNjYW5lw7MgbGEgZXRpcXVldGEgeSB5YSBwYXPDsyBlbCBwbGF6byBkZSBlbnRyZWdhICgyMzowMCkuJykgOiAnUGFzYXJvbiBsYXMgMjM6MDAgeSBlbCBjbGllbnRlIHRvZGF2w61hIG5vIGxvIHJlY2liZS4nKQogICAgICA6ICdQYXPDsyBsYSBob3JhIGzDrW1pdGUgeSB0b2RhdsOtYSBubyBzZSBlbnRyZWdhIGVuICcgKyAoeC5zaGlwID09PSAnQ29sZWN0YScgPyAnbGEgY29sZWN0YScgOiAnbGEgYWdlbmNpYScpICsgJy4nOwogICAgY29uc3QgZkR1ZSA9IGQgPT4gbmV3IERhdGUoZCkudG9Mb2NhbGVTdHJpbmcoJ2VzLUNMJywgeyB3ZWVrZGF5OiAnc2hvcnQnLCBkYXk6ICcyLWRpZ2l0JywgbW9udGg6ICdzaG9ydCcsIGhvdXI6ICcyLWRpZ2l0JywgbWludXRlOiAnMi1kaWdpdCcgfSk7CiAgICBjb25zdCBjYXJkID0gKHgsIGkpID0+IGA8YXJ0aWNsZSBjbGFzcz0ibWtwLWNhcmQgbGF0ZS1jYXJkICR7eC5sZXZlbH0iIHN0eWxlPSItLWQ6JHtNYXRoLm1pbihpLCA4KSAqIDUwfW1zIj4KICAgICAgPGRpdiBjbGFzcz0ibGF0ZS1oIj48c3BhbiBjbGFzcz0ibGF0ZS1mbGFnIj4ke3gubGV2ZWwgPT09ICd3YXJuJyA/ICfimqDvuI8gQWR2ZXJ0ZW5jaWEnIDogJ+KPsCBBdHJhc2Fkbyd9PC9zcGFuPjxzcGFuIGNsYXNzPSJjaGF0LXNoaXAgJHt4LnNoaXAgPT09ICdGbGV4JyA/ICdmbGV4JyA6ICdhZyd9IGxhdGUtbWstJHt4Lm1rfSI+JHt4Lm1rID09PSAnZmEnID8gJ/Cfn6IgRmFsYWJlbGxhJyA6IHgubWsgPT09ICdwYScgPyAn8J+UtSBQYXJpcycgOiB4LnNoaXAgPT09ICdGbGV4JyA/ICfimqEgTWVyY2FkbyBMaWJyZSBGbGV4JyA6ICfwn5OmIE1lcmNhZG8gTGlicmUgJyArIGVzYyh4LnNoaXApfTwvc3Bhbj48YiBjbGFzcz0ibGF0ZS1raW5kIj4ke0xLW3gua2luZF0gfHwgJyd9PC9iPjwvZGl2PgogICAgICA8cCBjbGFzcz0ibGF0ZS13aHkiPiR7d2h5KHgpfTwvcD4KICAgICAgPHNtYWxsPlZlbnRhIDxiPiMke2VzYyh4Lm9yZGVyX251bWJlcil9PC9iPiR7eC5jdXN0b21lciA/ICcgwrcgJyArIGVzYyh4LmN1c3RvbWVyKSA6ICcnfSDCtyAke3guc2hpcCA9PT0gJ0ZsZXgnID8gJ0VudHJlZ2EnIDogJ0Rlc3BhY2hvJ306ICR7ZXNjKHgubWsgPT09ICdtbCcgPyBmRHVlKHguZGlzcGF0Y2hfYnkpIDogU3RyaW5nKHguZGlzcGF0Y2hfYnkpLnNsaWNlKDAsIDE2KS5yZXBsYWNlKCdUJywgJyAnKSl9JHt4LnByaW50ZWQgPyAnIMK3IGV0aXF1ZXRhIGltcHJlc2EnIDogJyDCtyA8Yj5ldGlxdWV0YSBzaW4gaW1wcmltaXI8L2I+J308L3NtYWxsPgogICAgICA8c21hbGw+8J+bje+4jyAke3gucHJvZHVjdHMubWFwKHAgPT4gYCR7ZXNjKHAudGl0bGUgfHwgJ1Byb2R1Y3RvJyl9JHtwLnF0eSA+IDEgPyBgIDxlbT7DlyR7cC5xdHl9PC9lbT5gIDogJyd9YCkuam9pbignIMK3ICcpfTwvc21hbGw+PC9hcnRpY2xlPmA7CiAgICBjb25zdCBsYXRlID0gZC5sYXRlIHx8IFtdOwogICAgaWYgKCFsYXRlLmxlbmd0aCkgbGlzdCA9ICc8ZGl2IGNsYXNzPSJta3AtZW1wdHkiPvCfjokgTm8gaGF5IHBlZGlkb3MgYXRyYXNhZG9zLjwvZGl2Pic7CiAgICBlbHNlIHsKICAgICAgY29uc3QgYnlTZWxsZXIgPSB7fTsgbGF0ZS5mb3JFYWNoKHggPT4gKGJ5U2VsbGVyW3guc2VsbGVyXSA9IGJ5U2VsbGVyW3guc2VsbGVyXSB8fCBbXSkucHVzaCh4KSk7CiAgICAgIGxldCBpID0gMDsKICAgICAgbGlzdCA9IE9iamVjdC5rZXlzKGJ5U2VsbGVyKS5zb3J0KCkubWFwKG4gPT4gYDxzZWN0aW9uIGNsYXNzPSJsYXRlLWdycCI+PGgzPiR7ZXNjKG4pfSA8c21hbGw+JHtieVNlbGxlcltuXS5maWx0ZXIoeCA9PiB4LmxldmVsID09PSAnbGF0ZScpLmxlbmd0aH0gYXRyYXNhZG9zIMK3ICR7YnlTZWxsZXJbbl0uZmlsdGVyKHggPT4geC5sZXZlbCA9PT0gJ3dhcm4nKS5sZW5ndGh9IGFkdmVydGVuY2lhczwvc21hbGw+PC9oMz4ke2J5U2VsbGVyW25dLm1hcCh4ID0+IGNhcmQoeCwgaSsrKSkuam9pbignJyl9PC9zZWN0aW9uPmApLmpvaW4oJycpOwogICAgfQogIH0KICBpZiAobWsudmlldyA9PT0gJ3JldHVybnMnKSB7CiAgICBjb25zdCBncnAgPSAoaywgYXJyLCBleHRyYSkgPT4gYDxzZWN0aW9uIGNsYXNzPSJta3AtcmV0IG1rcC1yZXQtJHtrfSI+PGgzPjxpPjwvaT4ke01LW2tdfSA8Yj4ke2Fyci5maWx0ZXIoeCA9PiB4LnRvZGF5KS5sZW5ndGh9PC9iPiA8c21hbGw+cGFyYSBob3k8L3NtYWxsPiR7YXJyLmxlbmd0aCA+IGFyci5maWx0ZXIoeCA9PiB4LnRvZGF5KS5sZW5ndGggPyBgPHNtYWxsPiDCtyAke2Fyci5sZW5ndGggLSBhcnIuZmlsdGVyKHggPT4geC50b2RheSkubGVuZ3RofSBlbiBjYW1pbm88L3NtYWxsPmAgOiAnJ308L2gzPgogICAgICAke2V4dHJhIHx8IChhcnIubGVuZ3RoID8gYXJyLnNvcnQoKGEsIGIpID0+IGIudG9kYXkgLSBhLnRvZGF5KS5tYXAoeCA9PiBgPGRpdiBjbGFzcz0ibWtwLXJyb3ciPjxkaXY+PGI+JHtlc2MoeC5idXllciB8fCAnQ29tcHJhZG9yJyl9PC9iPiR7eC50b2RheSA/ICc8c3BhbiBjbGFzcz0ibWtwLXRvZGF5Ij5MbGVnYSBob3k8L3NwYW4+JyA6ICcnfTxzbWFsbD4ke21lLnVzZXIucm9sZSA9PT0gJ2FkbWluJyA/IGVzYyh4LmFjYy5zZWxsZXIpICsgJyDCtyAnIDogJyd9VmVudGEgIyR7ZXNjKHgub3JkZXJfaWQpfSR7eC5zaGlwX3N0YXR1cyA/ICcgwrcgJyArIGVzYyh4LnNoaXBfc3RhdHVzKSA6ICcnfTwvc21hbGw+PHNtYWxsPiR7cHJvZExpbmUoeC5wcm9kdWN0cyl9PC9zbWFsbD48L2Rpdj48YiBjbGFzcz0ibWtwLXByaWNlIj4ke21vbmV5KHgudG90YWwgfHwgMCl9PC9iPjwvZGl2PmApLmpvaW4oJycpIDogJzxkaXYgY2xhc3M9Im1rcC1lbXB0eSBzbSI+U2luIGRldm9sdWNpb25lcy48L2Rpdj4nKX08L3NlY3Rpb24+YDsKICAgIGxpc3QgPSBgPGRpdiBjbGFzcz0ibWtwLXJldHMiPiR7Z3JwKCdtbCcsIEwuci5maWx0ZXIoeCA9PiB4Lm1rID09PSAnbWwnKSwgTC5lcnIucmV0dXJucyA/IFBFUk1fTVNHIDogJycpfSR7Z3JwKCdmYScsIEwuci5maWx0ZXIoeCA9PiB4Lm1rID09PSAnZmEnKSl9JHtncnAoJ3BhJywgW10sICc8ZGl2IGNsYXNzPSJta3AtZW1wdHkgc20iPlBhcmlzIG5vIGluZm9ybWEgZGV2b2x1Y2lvbmVzIHBvciBzdSBjb25leGnDs247IHJldsOtc2FsYXMgZW4gZWwgU2VsbGVyIENlbnRlciBkZSBQYXJpcy48L2Rpdj4nKX08L2Rpdj5gOwogIH0KICBpZiAoIW1rLnZpZXcpIGxpc3QgPSAnPGRpdiBjbGFzcz0ibWtwLWVtcHR5IG1rcC1waWNrIj7wn5GGIFRvY2EgdW5hIHNlY2Npw7NuIGRlIGFycmliYSBwYXJhIHZlciBlbCBkZXRhbGxlLjwvZGl2Pic7CiAgYm94LmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJta3AtdGlsZXMgJHttay52aWV3ID8gJ3NlbCcgOiAnJ30iPiR7dGlsZXMubWFwKChbaywgbiwgdiwgc3ViLCBlXSkgPT4gYDxidXR0b24gY2xhc3M9Im1rcC10aWxlICR7bWsudmlldyA9PT0gayA/ICdvbicgOiAnJ30gJHt2ID4gMCAmJiAhZSA/ICdoYXMnIDogJyd9IiBkYXRhLW12PSIke2t9Ij48Yj4ke2UgPyAn4oCUJyA6IHZ9PC9iPjxzcGFuPiR7bn08L3NwYW4+PHNtYWxsPiR7ZSA/ICdmYWx0YSBwZXJtaXNvJyA6IHN1Yn08L3NtYWxsPiR7bWsudmlldyA9PT0gayA/ICc8ZW0gY2xhc3M9Im1rcC1oZXJlIj5Fc3TDoXMgYXF1w608L2VtPicgOiAnJ308L2J1dHRvbj5gKS5qb2luKCcnKX0KICAgICAgPGJ1dHRvbiBjbGFzcz0ibWtwLXRpbGUgbWtwLXRpbGUtbGF0ZSAke21rLnZpZXcgPT09ICdsYXRlJyA/ICdvbicgOiAnJ30gJHtsYXRlTiA/ICdob3QnIDogd2Fybk4gPyAnd2FybScgOiAnJ30iIGRhdGEtbXY9ImxhdGUiPjxiPiR7bGF0ZU4gKyB3YXJuTn08L2I+PHNwYW4+QXRyYXNhZG9zPC9zcGFuPjxzbWFsbD4ke2xhdGVOfSBhdHJhc2Fkb3MgwrcgJHt3YXJuTn0gYWR2ZXJ0Ljwvc21hbGw+JHttay52aWV3ID09PSAnbGF0ZScgPyAnPGVtIGNsYXNzPSJta3AtaGVyZSI+RXN0w6FzIGFxdcOtPC9lbT4nIDogJyd9PC9idXR0b24+CiAgICAgIDxidXR0b24gY2xhc3M9Im1rcC10aWxlIG1rcC10aWxlLXJldCAke21rLnZpZXcgPT09ICdyZXR1cm5zJyA/ICdvbicgOiAnJ30gJHtyVG9kYXkubGVuZ3RoID8gJ2hhcycgOiAnJ30iIGRhdGEtbXY9InJldHVybnMiPjxiPiR7clRvZGF5Lmxlbmd0aH08L2I+PHNwYW4+RGV2b2x1Y2lvbmVzIGhveTwvc3Bhbj48c21hbGwgY2xhc3M9Im1rcC1ta2RvdHMiPjxpIGNsYXNzPSJtbCI+PC9pPiR7ckJ5KCdtbCcpfSA8aSBjbGFzcz0iZmEiPjwvaT4ke3JCeSgnZmEnKX0gPGkgY2xhc3M9InBhIj48L2k+4oCUPC9zbWFsbD4ke21rLnZpZXcgPT09ICdyZXR1cm5zJyA/ICc8ZW0gY2xhc3M9Im1rcC1oZXJlIj5Fc3TDoXMgYXF1w608L2VtPicgOiAnJ308L2J1dHRvbj48L2Rpdj4KICAgIDxkaXYgY2xhc3M9Im1rcC1ib2R5Ij4ke2xpc3R9PC9kaXY+CiAgICAke0wuZXJyLnBhcnRpYWwubGVuZ3RoICYmICFMLmVyci5xdWVzdGlvbnMgPyBgPHAgY2xhc3M9Im1rcC1wZXJtIiBzdHlsZT0ibWFyZ2luLXRvcDoxMHB4Ij5ObyBzZSBwdWRvIGxlZXI6IDxiPiR7ZXNjKEwuZXJyLnBhcnRpYWwuam9pbignLCAnKSl9PC9iPi4gRXNhIGN1ZW50YSBkZWJlIHZvbHZlciBhIGNvbmVjdGFyc2UgYSBNZXJjYWRvIExpYnJlIChlbiBWZW5kZWRvcmVzIOKGkiBWb2x2ZXIgYSBhdXRvcml6YXIpLjwvcD5gIDogJyd9JHttay5kYXRhLmxvYWRpbmcgPyAnPHAgY2xhc3M9Im1rcC1wZXJtIiBzdHlsZT0ibWFyZ2luLXRvcDoxMHB4Ij5BbGd1bmFzIGN1ZW50YXMgdG9kYXbDrWEgc2UgZXN0w6FuIGNhcmdhbmRvIGRlc2RlIE1lcmNhZG8gTGlicmU7IGFwYXJlY2VuIHNvbGFzIGVuIHVub3Mgc2VndW5kb3MuPC9wPicgOiAnJ308cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTJweDttYXJnaW46MTBweCAycHgiPkFjdHVhbGl6YWRvICR7ZXNjKG5ldyBEYXRlKG1rLmRhdGEuYXQpLnRvTG9jYWxlVGltZVN0cmluZygnZXMtQ0wnLCB7IGhvdXI6ICcyLWRpZ2l0JywgbWludXRlOiAnMi1kaWdpdCcgfSkpfSDCtyBzZSBhY3R1YWxpemEgc29sYSBjYWRhIDIgbWludXRvcy48L3A+YDsKICBjb25zdCBsb2FkQ3QgPSBlbCA9PiB7IGNvbnN0IGlkID0gZWwuZGF0YXNldC5jdGxvYWQ7IGlmIChtay5jdFtpZF0gJiYgRGF0ZS5ub3coKSAtIG1rLmN0W2lkXS5hdCA8IDYwZTMgJiYgIW1rLmN0W2lkXS5lcnIpIHJldHVybjsgYXBpKGAvYXBpL21rcC9jbGFpbS8ke2VsLmRhdGFzZXQuY29ubn0vJHtpZH0vbWVzc2FnZXNgKS50aGVuKHIgPT4geyBtay5jdFtpZF0gPSB7IGF0OiBEYXRlLm5vdygpLCBsaXN0OiByLm1lc3NhZ2VzIHx8IFtdIH07IH0pLmNhdGNoKGVyciA9PiB7IG1rLmN0W2lkXSA9IHsgYXQ6IERhdGUubm93KCksIGxpc3Q6IFtdLCBlcnI6IGVyci5tZXNzYWdlIH07IH0pLnRoZW4oKCkgPT4geyBjb25zdCBjdXIgPSAkKCcjY3QtJyArIGlkKTsgaWYgKCFjdXIpIHJldHVybjsgY29uc3QgeCA9IEwuYy5maW5kKGMgPT4gU3RyaW5nKGMuaWQpID09PSBTdHJpbmcoaWQpKTsgaWYgKHgpIHsgY3VyLmlubmVySFRNTCA9IGNsYWltQnVicyh4KTsgY3VyLnNjcm9sbFRvcCA9IGN1ci5zY3JvbGxIZWlnaHQ7IH0gfSk7IH07CiAgYm94LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWN0bG9hZF0nKS5mb3JFYWNoKGVsID0+IHsgZWwuc2Nyb2xsVG9wID0gZWwuc2Nyb2xsSGVpZ2h0OyBsb2FkQ3QoZWwpOyB9KTsKICBib3gub25jbGljayA9IGFzeW5jIGUgPT4gewogICAgY29uc3QgcWQgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1xZGVsXScpOwogICAgaWYgKHFkKSB7CiAgICAgIC8vIGRvYmxlIHRvcXVlIHBhcmEgY29uZmlybWFyIChldml0YSBib3JyYXIgcG9yIGVycm9yKQogICAgICBpZiAoIXFkLmNsYXNzTGlzdC5jb250YWlucygnYXJtZWQnKSkgeyBxZC5jbGFzc0xpc3QuYWRkKCdhcm1lZCcpOyBxZC50ZXh0Q29udGVudCA9ICfCv1NlZ3Vybz8gVG9jYSBkZSBudWV2byBwYXJhIGVsaW1pbmFyJzsgY2xlYXJUaW1lb3V0KHFkLl90KTsgcWQuX3QgPSBzZXRUaW1lb3V0KCgpID0+IHsgcWQuY2xhc3NMaXN0LnJlbW92ZSgnYXJtZWQnKTsgcWQudGV4dENvbnRlbnQgPSAn8J+XkSBFbGltaW5hciBwcmVndW50YSc7IH0sIDQwMDApOyByZXR1cm47IH0KICAgICAgY2xlYXJUaW1lb3V0KHFkLl90KTsgcWQuZGlzYWJsZWQgPSB0cnVlOyBxZC50ZXh0Q29udGVudCA9ICdFbGltaW5hbmRv4oCmJzsKICAgICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL21rcC9xdWVzdGlvbi1kZWxldGUnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGNvbm5faWQ6IHFkLmRhdGFzZXQuY29ubiwgcXVlc3Rpb25faWQ6IHFkLmRhdGFzZXQucWRlbCB9IH0pOyBtay5oaWRkZW4uYWRkKCdxJyArIHFkLmRhdGFzZXQucWRlbCk7IHRvYXN0KCdQcmVndW50YSBlbGltaW5hZGEg4pyTICh0YW1iacOpbiBlbiBNZXJjYWRvIExpYnJlKScpOyBjb25zdCBjYXJkID0gcWQuY2xvc2VzdCgnLm1rcC1jYXJkJyk7IGNhcmQuY2xhc3NMaXN0LmFkZCgnbWtwLWdvbmUnKTsgc2V0VGltZW91dChkcmF3TWtwLCAzNTApOyB9CiAgICAgIGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UsIDUwMDApOyBxZC5kaXNhYmxlZCA9IGZhbHNlOyBxZC5jbGFzc0xpc3QucmVtb3ZlKCdhcm1lZCcpOyBxZC50ZXh0Q29udGVudCA9ICfwn5eRIEVsaW1pbmFyIHByZWd1bnRhJzsgfQogICAgICByZXR1cm47CiAgICB9CiAgICBjb25zdCBtciA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLW1hcmtyZWFkXScpOwogICAgaWYgKG1yKSB7CiAgICAgIG1yLmRpc2FibGVkID0gdHJ1ZTsgbXIudGV4dENvbnRlbnQgPSAnTWFyY2FuZG/igKYnOwogICAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvbWtwL3JlYWQnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGNvbm5faWQ6IG1yLmRhdGFzZXQuY29ubiwgcGFja19pZDogbXIuZGF0YXNldC5tYXJrcmVhZCB9IH0pOyBtay5oaWRkZW4uYWRkKCdtJyArIG1yLmRhdGFzZXQubWFya3JlYWQpOyB0b2FzdCgnTWVuc2FqZSBtYXJjYWRvIGNvbW8gbGXDrWRvIOKckycpOyBkcmF3TWtwKCk7IH0KICAgICAgY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSwgNTAwMCk7IG1yLmRpc2FibGVkID0gZmFsc2U7IG1yLnRleHRDb250ZW50ID0gJ+Kck+KckyBNYXJjYXIgY29tbyBsZcOtZG8nOyB9CiAgICAgIHJldHVybjsKICAgIH0KICAgIGNvbnN0IHQgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1tdl0nKTsgaWYgKHQpIHsgbWsudmlldyA9IHQuZGF0YXNldC5tdjsgZHJhd01rcCgpOyByZXR1cm47IH0KICAgIGNvbnN0IGN0ID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtY2xhaW10aHJlYWRdJyk7CiAgICBpZiAoY3QpIHsKICAgICAgY29uc3QgZWwgPSAkKCcjY3QtJyArIGN0LmRhdGFzZXQuY2xhaW10aHJlYWQpOyBlbC5oaWRkZW4gPSAhZWwuaGlkZGVuOyBpZiAoZWwuaGlkZGVuKSByZXR1cm47CiAgICAgIGVsLmlubmVySFRNTCA9ICc8c21hbGwgY2xhc3M9Im11dGVkIj5DYXJnYW5kb+KApjwvc21hbGw+JzsKICAgICAgdHJ5IHsgY29uc3QgciA9IGF3YWl0IGFwaShgL2FwaS9ta3AvY2xhaW0vJHtjdC5kYXRhc2V0LmNvbm59LyR7Y3QuZGF0YXNldC5jbGFpbXRocmVhZH0vbWVzc2FnZXNgKTsgZWwuaW5uZXJIVE1MID0gci5tZXNzYWdlcy5sZW5ndGggPyByLm1lc3NhZ2VzLm1hcCh0ID0+IGA8ZGl2IGNsYXNzPSJta3AtYnViICR7dC5mcm9tfSI+PHNwYW4+JHtlc2ModC50ZXh0IHx8ICcnKX08L3NwYW4+PHNtYWxsPiR7dC5mcm9tID09PSAnbWVkaWF0b3InID8gJ01lcmNhZG8gTGlicmUgwrcgJyA6ICcnfSR7YWdvUyh0LmRhdGUpfTwvc21hbGw+PC9kaXY+YCkuam9pbignJykgOiAnPHNtYWxsIGNsYXNzPSJtdXRlZCI+U2luIG1lbnNhamVzIHRvZGF2w61hLjwvc21hbGw+JzsgfQogICAgICBjYXRjaCAoZXJyKSB7IGVsLmlubmVySFRNTCA9IGA8c21hbGwgY2xhc3M9Im11dGVkIj4ke2VzYyhlcnIubWVzc2FnZSl9PC9zbWFsbD5gOyB9CiAgICB9CiAgfTsKICBib3gub25pbnB1dCA9IGUgPT4geyBjb25zdCBmID0gZS50YXJnZXQuY2xvc2VzdCgnLm1rcC1yZXBseScpOyBpZiAoIWYpIHJldHVybjsgZi5xdWVyeVNlbGVjdG9yKCcubWtwLWNudCcpLnRleHRDb250ZW50ID0gZS50YXJnZXQudmFsdWUubGVuZ3RoOyBpZiAoZi5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtY29tcG9zZScpKSB7IGNvbnN0IHQgPSBlLnRhcmdldDsgdC5zdHlsZS5oZWlnaHQgPSAnYXV0byc7IHQuc3R5bGUuaGVpZ2h0ID0gTWF0aC5taW4odC5zY3JvbGxIZWlnaHQsIDE2MCkgKyAncHgnOyBmLmNsYXNzTGlzdC50b2dnbGUoJ3R5cGluZycsICEhdC52YWx1ZS50cmltKCkpOyB9IH07CiAgYm94Lm9ua2V5ZG93biA9IGUgPT4geyBjb25zdCBmID0gZS50YXJnZXQuY2xvc2VzdCgnLmNoYXQtY29tcG9zZScpOyBpZiAoZiAmJiBlLmtleSA9PT0gJ0VudGVyJyAmJiAhZS5zaGlmdEtleSAmJiAhZS5pc0NvbXBvc2luZykgeyBlLnByZXZlbnREZWZhdWx0KCk7IGYucmVxdWVzdFN1Ym1pdCgpOyB9IH07CiAgYm94Lm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICBlLnByZXZlbnREZWZhdWx0KCk7CiAgICBjb25zdCBmID0gZS50YXJnZXQuY2xvc2VzdCgnLm1rcC1yZXBseScpOyBpZiAoIWYpIHJldHVybjsKICAgIGNvbnN0IHRleHQgPSBmLnF1ZXJ5U2VsZWN0b3IoJ3RleHRhcmVhJykudmFsdWUudHJpbSgpOyBpZiAoIXRleHQpIHJldHVybiB0b2FzdCgnRXNjcmliZSB1bmEgcmVzcHVlc3RhJyk7CiAgICBjb25zdCBiID0gZi5xdWVyeVNlbGVjdG9yKCdidXR0b24ubWtwLXNlbmQsIGJ1dHRvbjpub3QoW3R5cGU9YnV0dG9uXSknKTsgY29uc3QgYkh0bWwgPSBiLmlubmVySFRNTDsgYi5kaXNhYmxlZCA9IHRydWU7IGIudGV4dENvbnRlbnQgPSAnRW52aWFuZG/igKYnOwogICAgY29uc3QgayA9IGYuZGF0YXNldC5raW5kOwogICAgY29uc3QgYm9keSA9IGsgPT09ICdhbnN3ZXInID8geyBjb25uX2lkOiBmLmRhdGFzZXQuY29ubiwgcXVlc3Rpb25faWQ6IGYuZGF0YXNldC5pZCwgdGV4dCB9IDogayA9PT0gJ21lc3NhZ2UnID8geyBjb25uX2lkOiBmLmRhdGFzZXQuY29ubiwgcGFja19pZDogZi5kYXRhc2V0LnBhY2ssIGJ1eWVyX2lkOiBmLmRhdGFzZXQuYnV5ZXIsIHRleHQgfSA6IHsgY29ubl9pZDogZi5kYXRhc2V0LmNvbm4sIGNsYWltX2lkOiBmLmRhdGFzZXQuaWQsIHRvX21lZGlhdG9yOiBmLmRhdGFzZXQubWVkID09PSAnMScsIHRleHQgfTsKICAgIHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9ta3AvJyArIChrID09PSAnYW5zd2VyJyA/ICdhbnN3ZXInIDogayA9PT0gJ21lc3NhZ2UnID8gJ21lc3NhZ2UnIDogJ2NsYWltLXJlcGx5JyksIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHkgfSk7IHRvYXN0KCdSZXNwdWVzdGEgZW52aWFkYSDinJMnKTsgaWYgKGsgPT09ICdhbnN3ZXInKSBtay5oaWRkZW4uYWRkKCdxJyArIGYuZGF0YXNldC5pZCk7IGlmIChrID09PSAnbWVzc2FnZScpIG1rLmhpZGRlbi5hZGQoJ20nICsgZi5kYXRhc2V0LnBhY2spOyBpZiAoayA9PT0gJ2NsYWltJykgeyBjb25zdCB0aCA9ICQoJyNjdC0nICsgZi5kYXRhc2V0LmlkKTsgaWYgKG1rLmN0W2YuZGF0YXNldC5pZF0pIG1rLmN0W2YuZGF0YXNldC5pZF0ubGlzdC5wdXNoKHsgZnJvbTogJ3NlbGxlcicsIHRleHQsIGRhdGU6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSB9KTsgaWYgKHRoKSB7IHRoLmluc2VydEFkamFjZW50SFRNTCgnYmVmb3JlZW5kJywgYDxkaXYgY2xhc3M9Im1rcC1idWIgc2VsbGVyIj48c3Bhbj4ke2VzYyh0ZXh0KX08L3NwYW4+PHNtYWxsPmFob3JhIOKck+Kckzwvc21hbGw+PC9kaXY+YCk7IHRoLnNjcm9sbFRvcCA9IHRoLnNjcm9sbEhlaWdodDsgfSBjb25zdCB0YSA9IGYucXVlcnlTZWxlY3RvcigndGV4dGFyZWEnKTsgdGEudmFsdWUgPSAnJzsgdGEuc3R5bGUuaGVpZ2h0ID0gJyc7IGYuY2xhc3NMaXN0LnJlbW92ZSgndHlwaW5nJyk7IGYucXVlcnlTZWxlY3RvcignLm1rcC1jbnQnKS50ZXh0Q29udGVudCA9IDA7IGIuZGlzYWJsZWQgPSBmYWxzZTsgYi5pbm5lckhUTUwgPSBiSHRtbDsgcmV0dXJuOyB9CiAgICAgIGNvbnN0IGNhcmQgPSBmLmNsb3Nlc3QoJy5ta3AtY2FyZCcpOyBjYXJkLmNsYXNzTGlzdC5hZGQoJ21rcC1kb25lJyk7IGYub3V0ZXJIVE1MID0gJzxkaXYgY2xhc3M9Im1rcC1zZW50Ij7inJMgUmVzcHVlc3RhIGVudmlhZGE8L2Rpdj4nOyBzZXRUaW1lb3V0KCgpID0+IHsgaWYgKGsgIT09ICdjbGFpbScpIGRyYXdNa3AoKTsgfSwgMTUwMCk7IH0KICAgIGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UsIDUwMDApOyBiLmRpc2FibGVkID0gZmFsc2U7IGIuaW5uZXJIVE1MID0gYkh0bWw7IH0KICB9Owp9CgovLyAtLS0tLS0tLS0tIEJBTkRFSkEgKGZ1bGZpbGxtZW50KSAtLS0tLS0tLS0tCmNvbnN0IFRBQlMgPSBbCiAgWyd0b2RheScsICdQYXJhIGltcHJpbWlyIGhveScsICdTYWxlbiBob3kgKGluY2x1eWUgRmxleCknLCBJLnByaW50XSwKICBbJ3VwY29taW5nJywgJ1Byw7N4aW1vcyBkw61hcycsICdTZSBkZXNwYWNoYW4gbcOhcyBhZGVsYW50ZScsIEkuYm94XSwKICBbJ3VuYmxvY2tlZCcsICdEZXNibG9xdWVhZGFzJywgJ1BlZGlkb3MgaW5jb21wbGV0b3MgcG9yIGltcHJpbWlyJywgSS5wcmludF0sCiAgWyd3YWl0aW5nJywgJ0VzcGVyYW5kbyBldGlxdWV0YScsICdFbCBtYXJrZXRwbGFjZSBhw7puIG5vIGxhIGxpYmVyYScsIEkuY2xvY2tdLAogIFsncHJpbnRlZCcsICdFdGlxdWV0YXMgaW1wcmVzYXMnLCAnRGVsIGRlc3BhY2hvIGVuIGN1cnNvIChjYW1iaWEgYSBsYXMgMTU6MDApJywgSS5jaGVja10sCiAgWyd0cmFuc2l0JywgJ0VuIGNhbWlubycsICdJbXByZXNhcyBxdWUgYcO6biBubyBsbGVnYW4gYSBkZXN0aW5vJywgSS5ib3hdLAogIFsnYmxvY2tlZCcsICdCbG9xdWVhZGFzJywgJ051bWVyYWRhczogTsKwIDEsIDIsIDPigKYnLCBJLmxvY2tdLAogIFsnYmxvY2tlZFByaW50ZWQnLCAnQmxvcXVlYWRhcyBpbXByZXNhcycsICdEZWwgZGVzcGFjaG8gZW4gY3Vyc28sIHBvciByZWxsZW5hcicsIEkuYm94XSwKICBbJ3dhcm4nLCAnQWR2ZXJ0ZW5jaWEnLCAnUXVlZGFuIDMwIG1pbiBvIG1lbm9zIHBhcmEgc3UgcGxhem8nLCBJLmNsb2NrXSwKICBbJ2xhdGUnLCAnQXRyYXNhZGFzJywgJ05vIHNhbGllcm9uIGRlbnRybyBkZWwgcGxhem8nLCBJLndhcm5dLAogIFsncHJpbnRlZDcnLCAnSW1wcmVzYXMgNyBkw61hcycsICdUb2RvIGxvIGltcHJlc28sIGluY2x1c28gbG8geWEgZW52aWFkbycsIEkuY2hlY2tdLApdOwpjb25zdCBlbmRPZlRvZGF5ID0gKCkgPT4geyBjb25zdCBkID0gbmV3IERhdGUoKTsgZC5zZXRIb3VycygyMywgNTksIDU5LCA5OTkpOyByZXR1cm4gZDsgfTsKZnVuY3Rpb24gZGlzcGF0Y2hEYXRlKG8pIHsgY29uc3QgcyA9IG8uZGlzcGF0Y2hfYnk7IGlmICghcykgcmV0dXJuIG51bGw7IGNvbnN0IGQgPSBuZXcgRGF0ZShzLmluY2x1ZGVzKCdUJykgPyBzIDogcy5yZXBsYWNlKCcgJywgJ1QnKSk7IHJldHVybiBpc05hTihkKSA/IG51bGwgOiBkOyB9CmNvbnN0IGlzRm9yVG9kYXkgPSBvID0+IHsgY29uc3QgZCA9IGRpc3BhdGNoRGF0ZShvKTsgcmV0dXJuICFkIHx8IGQgPD0gZW5kT2ZUb2RheSgpOyB9OwovLyBsYXMgZGVzYmxvcXVlYWRhcyBxdWVkYW4gZW4gc3UgcHJvcGlhIHNlY2Npw7NuIGhhc3RhIHF1ZSBzZSBpbXByaW1lbgpjb25zdCBpc1VuYmxvY2tlZCA9IG8gPT4gQm9vbGVhbihvLnVuYmxvY2tlZF9ieSAmJiBvLmJsb2NrX25vKSAmJiBbJ3JlYWR5JywgJ3dhaXRpbmcnLCAnZXJyb3InXS5pbmNsdWRlcyhvLnN0YXRlKTsKLy8gaW1wcmVzYXMgZGUgcGVkaWRvcyBxdWUgdGVuw61hbiBwcm9kdWN0b3MgYmxvcXVlYWRvczogZWwgdmVuZGVkb3IgZGViZSBsbGV2YXIgbG8gcXVlIGZhbHRhCi8vIGN1YWxxdWllciBldGlxdWV0YSBpbXByZXNhIGNvbiBwcm9kdWN0b3MgYmxvcXVlYWRvcyB2YSBTT0xPIGEgIkJsb3F1ZWFkYXMgaW1wcmVzYXMiIChhdW5xdWUgbGEgaGF5YW4gaW1wcmVzbyBmdWVyYSBkZSBsYSBhcHApCi8vIHNvbG8gc2kgSE9ZIHRpZW5lIGFsZ8O6biBwcm9kdWN0byBibG9xdWVhZG8gKHNpIGVsIHZlbmRlZG9yIGxvIHNhY8OzIGRlIHN1IGxpc3RhLCB2dWVsdmUgYSAiRXRpcXVldGFzIGltcHJlc2FzIikKY29uc3QgaXNCbG9ja2VkUHJpbnRlZCA9IG8gPT4gKG8ubWlzc2luZ19pZHggfHwgW10pLmxlbmd0aCA+IDAgJiYgby5zdGF0ZSA9PT0gJ3ByaW50ZWQnOwpjb25zdCB3ZWVrU3RhcnQgPSAoKSA9PiB7IGNvbnN0IGQgPSBuZXcgRGF0ZSgpOyBkLnNldEhvdXJzKDAsIDAsIDAsIDApOyBkLnNldERhdGUoZC5nZXREYXRlKCkgLSAoKGQuZ2V0RGF5KCkgKyA2KSAlIDcpKTsgcmV0dXJuIGQ7IH07CmNvbnN0IHByaW50ZWRBdCA9IG8gPT4gby5wcmludGVkX2F0ID8gbmV3IERhdGUoby5wcmludGVkX2F0LnJlcGxhY2UoJyAnLCAnVCcpICsgJ1onKSA6IG51bGw7CmNvbnN0IGlzUHJpbnRlZDcgPSBvID0+IFsncHJpbnRlZCcsICdzaGlwcGVkJ10uaW5jbHVkZXMoby5zdGF0ZSkgJiYgcHJpbnRlZEF0KG8pID49IG5ldyBEYXRlKERhdGUubm93KCkgLSA3ICogODY0ZTUpOwpjb25zdCBpc1ByaW50ZWRUaGlzV2VlayA9IG8gPT4gWydwcmludGVkJywgJ3NoaXBwZWQnXS5pbmNsdWRlcyhvLnN0YXRlKSAmJiBwcmludGVkQXQobykgPj0gd2Vla1N0YXJ0KCk7Ci8vIGxhcyBibG9xdWVhZGFzIGltcHJlc2FzIHF1ZSBlbCBmdWxmaWxsbWVudCBzZXBhcsOzIGVuIHBhcnRlICh0ZW7DrWEgYWxnw7puIHByb2R1Y3RvKSB0YW1iacOpbiBjdWVudGFuIGVuICJFdGlxdWV0YXMgaW1wcmVzYXMiCi8vIHVuYSBldGlxdWV0YSBwdWVkZSBlc3RhciBlbiBtw6FzIGRlIHVuYSBzZWNjacOzbiAocC4gZWouICJJbXByZXNhcyBkZSBsYSBzZW1hbmEiIHkgIkJsb3F1ZWFkYXMgaW1wcmVzYXMiKQovLyAiRXRpcXVldGFzIGltcHJlc2FzIiB5ICJCbG9xdWVhZGFzIGltcHJlc2FzIiBtdWVzdHJhbiBsYXMgaW1wcmVzYXMgZGVsIGRlc3BhY2hvIGVuIGN1cnNvOiB0b2RhcyBsYXMgcXVlIHNlCi8vIGRlc3BhY2hhbiBlc2UgZMOtYSAoYXVucXVlIHNlIGhheWFuIGltcHJlc28gZMOtYXMgYW50ZXMpLiBBIGxhcyAxNTowMCBkZWwgZMOtYSBkZSBkZXNwYWNobyBzYWxlbiBkZSBhaMOtIChxdWVkYW4gZW4KLy8gIkltcHJlc2FzIDcgZMOtYXMiKSB5IGVtcGllemFuIGEganVudGFyc2UgbGFzIGRlbCBzaWd1aWVudGUgZMOtYSBkZSBkZXNwYWNoby4KY29uc3QgZGlzcERheSA9IG8gPT4geyBjb25zdCBkID0gZGlzcGF0Y2hEYXRlKG8pOyByZXR1cm4gZCA/IGlzbyhkKSA6IG51bGw7IH07CmxldCBfY3ljID0geyBrZXk6ICcnLCBkYXk6ICcnIH07CmZ1bmN0aW9uIHByaW50Q3ljbGVEYXkoKSB7CiAgY29uc3Qgbm93ID0gbmV3IERhdGUoKSwga2V5ID0gb3JkZXJzLmxlbmd0aCArICc6JyArIG5vdy5nZXRIb3VycygpICsgJzonICsgbm93LmdldERhdGUoKTsKICBpZiAoX2N5Yy5rZXkgPT09IGtleSAmJiBfY3ljLnNyYyA9PT0gb3JkZXJzKSByZXR1cm4gX2N5Yy5kYXk7CiAgY29uc3QgYmFzZSA9IG5ldyBEYXRlKG5vdyk7IGlmIChub3cuZ2V0SG91cnMoKSA+PSAxNSkgYmFzZS5zZXREYXRlKGJhc2UuZ2V0RGF0ZSgpICsgMSk7CiAgY29uc3QgYiA9IGlzbyhiYXNlKTsKICBjb25zdCBkYXkgPSBvcmRlcnMuZmlsdGVyKG8gPT4gWydwcmludGVkJywgJ3NoaXBwZWQnXS5pbmNsdWRlcyhvLnN0YXRlKSkubWFwKGRpc3BEYXkpLmZpbHRlcihkID0+IGQgJiYgZCA+PSBiKS5zb3J0KClbMF0gfHwgYjsKICBfY3ljID0geyBrZXksIGRheSwgc3JjOiBvcmRlcnMgfTsKICByZXR1cm4gZGF5Owp9CmNvbnN0IGluUHJpbnRDeWNsZSA9IG8gPT4gWydwcmludGVkJywgJ3NoaXBwZWQnXS5pbmNsdWRlcyhvLnN0YXRlKSAmJiBkaXNwRGF5KG8pID09PSBwcmludEN5Y2xlRGF5KCk7CmNvbnN0IGhhc01pc3NpbmcgPSBvID0+IChvLm1pc3NpbmdfaWR4IHx8IFtdKS5sZW5ndGggPiAwOwovLyBBdHJhc2FkYTogbG8gbWFyY2EgZWwgc2Vydmlkb3IgbyB5YSBwYXPDsyBzdSBwbGF6byBsw61taXRlIChzZSByZXZpc2EgY2FkYSBtaW51dG8gY29uIGxhIGhvcmEgYWN0dWFsKQpjb25zdCBsYXRlTm93ID0gbyA9PiBCb29sZWFuKG8ubGF0ZSkgfHwgQm9vbGVhbihvLmRsICYmIG5ldyBEYXRlKG8uZGwpIDwgbmV3IERhdGUoKSk7Ci8vIEFkdmVydGVuY2lhOiBjdWFscXVpZXIgcGFxdWV0ZSBhbCBxdWUgbGUgcXVlZGFuIDMwIG1pbnV0b3MgbyBtZW5vcyBwYXJhIHN1IHBsYXpvIGzDrW1pdGUKY29uc3QgbWluc0xlZnQgPSBvID0+IG8uZGwgPyBNYXRoLmNlaWwoKG5ldyBEYXRlKG8uZGwpIC0gRGF0ZS5ub3coKSkgLyA2MGUzKSA6IG51bGw7CmNvbnN0IGlzV2FybiA9IG8gPT4gIWxhdGVOb3cobykgJiYgby5kbCAhPSBudWxsICYmIG1pbnNMZWZ0KG8pIDw9IDMwOwpjb25zdCBpblRhYkZuID0gKG8sIHQpID0+IHQgPT09ICd0cmFuc2l0JyA/IG8uc3RhdGUgPT09ICdwcmludGVkJyA6IHQgPT09ICdwcmludGVkNycgPyBpc1ByaW50ZWQ3KG8pIDogdCA9PT0gJ2xhdGUnID8gbGF0ZU5vdyhvKSA6IHQgPT09ICd3YXJuJyA/IGlzV2FybihvKSA6IHQgPT09ICd3ZWVrJyA/IGlzUHJpbnRlZFRoaXNXZWVrKG8pIDogdCA9PT0gJ2Jsb2NrZWRQcmludGVkJyA/IChpblByaW50Q3ljbGUobykgJiYgaGFzTWlzc2luZyhvKSkgOiB0ID09PSAncHJpbnRlZCcgPyAoaW5QcmludEN5Y2xlKG8pICYmICghaGFzTWlzc2luZyhvKSB8fCBicEtpbmQobykgPT09ICdmaWxsJykpIDogdGFiT2YobykgPT09IHQ7CmNvbnN0IHRhYk9mID0gbyA9PiBpc1VuYmxvY2tlZChvKSA/ICd1bmJsb2NrZWQnIDogKG8uc3RhdGUgPT09ICdyZWFkeScgPyAoaXNGb3JUb2RheShvKSA/ICd0b2RheScgOiAndXBjb21pbmcnKSA6IG8uc3RhdGUgPT09ICdlcnJvcicgPyAnd2FpdGluZycgOiBvLnN0YXRlID09PSAnc2hpcHBlZCcgPyBudWxsIDogby5zdGF0ZSA9PT0gJ2NhbmNlbGxlZCcgPyBudWxsIDogby5zdGF0ZSk7Ci8vIHBhcmEgZXRpcXVldGFzIHlhIGltcHJlc2FzIG8gZW52aWFkYXM6IHNlIG1hbnRpZW5lIGN1w6FuZG8gaGFiw61hIHF1ZSBkZXNwYWNoYXJsYXMgKHNpbiAiYXRyYXNhZGEiKQpmdW5jdGlvbiBkaXNwYXRjaFBsYWluKG8pIHsKICBjb25zdCBkID0gZGlzcGF0Y2hEYXRlKG8pOyBpZiAoIWQpIHJldHVybiAnJzsKICBjb25zdCBoID0gaGhtbShkKSwgaG9yYSA9IGggPT09ICcyMzo1OScgfHwgaCA9PT0gJzAwOjAwJyA/ICcnIDogJyBhbnRlcyBkZSBsYXMgJyArIGFtcG0oZCk7CiAgY29uc3QgdCA9IG5ldyBEYXRlKCk7IHQuc2V0SG91cnMoMCwgMCwgMCwgMCk7IGNvbnN0IHggPSBuZXcgRGF0ZShkKTsgeC5zZXRIb3VycygwLCAwLCAwLCAwKTsKICBjb25zdCBkaWZmID0gTWF0aC5yb3VuZCgoeCAtIHQpIC8gODY0ZTUpOwogIGNvbnN0IGRpYSA9IGRpZmYgPT09IDAgPyAnaG95JyA6IGRpZmYgPT09IC0xID8gJ2F5ZXInIDogZGlmZiA9PT0gMSA/ICdtYcOxYW5hJyA6ICdlbCAnICsgZC50b0xvY2FsZURhdGVTdHJpbmcoJ2VzLUNMJywgeyB3ZWVrZGF5OiAnbG9uZycsIGRheTogJ251bWVyaWMnLCBtb250aDogJ3Nob3J0JyB9KTsKICByZXR1cm4gYERlc3BhY2hvOiAke2RpYX0ke2hvcmF9JHtta0RlYWRsaW5lKG8pfWA7Cn0KLy8gRmFsYWJlbGxhOiBzZSBtdWVzdHJhIGVsIHBsYXpvIHJlYWwgZGVsIG1hcmtldHBsYWNlIChsYSBhcHAgbG8gYWRlbGFudGEgdW4gZMOtYSkKZnVuY3Rpb24gbWtEZWFkbGluZShvKSB7CiAgaWYgKCFvLmRpc3BhdGNoX21rKSByZXR1cm4gJyc7CiAgY29uc3QgZCA9IG5ldyBEYXRlKG8uZGlzcGF0Y2hfbWsuaW5jbHVkZXMoJ1QnKSA/IG8uZGlzcGF0Y2hfbWsgOiBvLmRpc3BhdGNoX21rLnJlcGxhY2UoJyAnLCAnVCcpKTsgaWYgKGlzTmFOKGQpKSByZXR1cm4gJyc7CiAgcmV0dXJuIGAgwrcgcGxhem8gRmFsYWJlbGxhICR7ZC50b0xvY2FsZURhdGVTdHJpbmcoJ2VzLUNMJywgeyB3ZWVrZGF5OiAnc2hvcnQnLCBkYXk6ICdudW1lcmljJyB9KS5yZXBsYWNlKCcuJywgJycpfWA7Cn0KZnVuY3Rpb24gZGlzcGF0Y2hUZXh0KG8pIHsgY29uc3QgdCA9IGRpc3BhdGNoVGV4dDAobyk7IHJldHVybiB0ID8gdCArIG1rRGVhZGxpbmUobykgOiB0OyB9CmZ1bmN0aW9uIGRpc3BhdGNoVGV4dDAobykgewogIGNvbnN0IGQgPSBkaXNwYXRjaERhdGUobyk7IGlmICghZCkgcmV0dXJuICcnOwogIGNvbnN0IHRvZGF5ID0gbmV3IERhdGUoKTsgdG9kYXkuc2V0SG91cnMoMCwgMCwgMCwgMCk7CiAgY29uc3QgZGF5ID0gbmV3IERhdGUoZCk7IGRheS5zZXRIb3VycygwLCAwLCAwLCAwKTsKICBjb25zdCBkaWZmID0gTWF0aC5yb3VuZCgoZGF5IC0gdG9kYXkpIC8gODY0ZTUpOwogIGNvbnN0IGggPSBoaG1tKGQpOwogIGlmIChkaWZmIDwgMCkgcmV0dXJuIGBBdHJhc2FkYSDCtyBkZWLDrWEgc2FsaXIgZWwgJHtkLnRvTG9jYWxlRGF0ZVN0cmluZygnZXMtQ0wnLCB7IGRheTogJ251bWVyaWMnLCBtb250aDogJ3Nob3J0JyB9KX1gOwogIGlmIChkaWZmID09PSAwKSByZXR1cm4gaCA9PT0gJzIzOjU5JyB8fCBoID09PSAnMDA6MDAnID8gJ0Rlc3BhY2hhciBob3knIDogKGQgPCBuZXcgRGF0ZSgpID8gYERlc3BhY2hhciBob3kgwrcgY29ydGUgJHthbXBtKGQpfWAgOiBgRGVzcGFjaGFyIGhveSBhbnRlcyBkZSBsYXMgJHthbXBtKGQpfWApOwogIGlmIChkaWZmID09PSAxKSByZXR1cm4gYERlc3BhY2hhciBtYcOxYW5hJHtoID09PSAnMjM6NTknIHx8IGggPT09ICcwMDowMCcgPyAnJyA6ICcgYW50ZXMgZGUgbGFzICcgKyBhbXBtKGQpfWA7CiAgcmV0dXJuIGBEZXNwYWNoYXIgZWwgJHtkLnRvTG9jYWxlRGF0ZVN0cmluZygnZXMtQ0wnLCB7IHdlZWtkYXk6ICdsb25nJywgZGF5OiAnbnVtZXJpYycsIG1vbnRoOiAnc2hvcnQnIH0pfWA7Cn0KZnVuY3Rpb24gdHMobykgewogIGNvbnN0IHMgPSBvLnNvbGRfYXQgfHwgJyc7CiAgaWYgKHMpIHsgY29uc3QgZCA9IG5ldyBEYXRlKHMuaW5jbHVkZXMoJ1QnKSA/IHMgOiBzLnJlcGxhY2UoJyAnLCAnVCcpKTsgaWYgKCFpc05hTihkKSkgcmV0dXJuIGQ7IH0KICByZXR1cm4gbmV3IERhdGUoKG8uY3JlYXRlZF9hdCB8fCAnJykucmVwbGFjZSgnICcsICdUJykgKyAnWicpOwp9CmZ1bmN0aW9uIGRheUxhYmVsKGQpIHsKICBjb25zdCB0b2RheSA9IG5ldyBEYXRlKCk7IHRvZGF5LnNldEhvdXJzKDAsIDAsIDAsIDApOwogIGNvbnN0IHggPSBuZXcgRGF0ZShkKTsgeC5zZXRIb3VycygwLCAwLCAwLCAwKTsKICBjb25zdCBkaWZmID0gTWF0aC5yb3VuZCgodG9kYXkgLSB4KSAvIDg2NGU1KTsKICBjb25zdCBmID0gZC50b0xvY2FsZURhdGVTdHJpbmcoJ2VzLUNMJywgeyB3ZWVrZGF5OiAnbG9uZycsIGRheTogJ251bWVyaWMnLCBtb250aDogJ2xvbmcnIH0pOwogIHJldHVybiBkaWZmID09PSAwID8gYEhveSDCtyAke2Z9YCA6IGRpZmYgPT09IDEgPyBgQXllciDCtyAke2Z9YCA6IGYuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBmLnNsaWNlKDEpOwp9CmNvbnN0IGhobW0gPSBkID0+IGQudG9Mb2NhbGVUaW1lU3RyaW5nKCdlcy1DTCcsIHsgaG91cjogJzItZGlnaXQnLCBtaW51dGU6ICcyLWRpZ2l0JywgaG91ckN5Y2xlOiAnaDIzJyB9KTsKY29uc3QgYW1wbSA9IGQgPT4geyBjb25zdCBoID0gZC5nZXRIb3VycygpLCBtID0gU3RyaW5nKGQuZ2V0TWludXRlcygpKS5wYWRTdGFydCgyLCAnMCcpOyByZXR1cm4gYCR7aCAlIDEyIHx8IDEyfToke219ICR7aCA8IDEyID8gJ0FNJyA6ICdQTSd9YDsgfTsKCmZ1bmN0aW9uIHJlbmRlclRyYXkoKSB7CiAgaWYgKCF1aS50YWIgfHwgdWkudGFiID09PSAncmVhZHknKSB1aS50YWIgPSAndG9kYXknOwogICQoJyNtYWluJykuaW5uZXJIVE1MID0gYAogIDxkaXYgY2xhc3M9InNlY3Rpb24tdGl0bGUiIHN0eWxlPSJtYXJnaW4tdG9wOjIycHgiPjxoMj5FdGlxdWV0YXM8L2gyPjxzcGFuIGNsYXNzPSJtdXRlZCI+TGFzIG3DoXMgbnVldmFzIGFycmliYS4gU2UgYWN0dWFsaXphIHNvbGEuPC9zcGFuPjxkaXYgY2xhc3M9InJjb2RlcyIgaWQ9InJjb2RlcyIgaGlkZGVuPjwvZGl2PjwvZGl2PgogIDxkaXYgY2xhc3M9InNoaXAtc3VtIiBpZD0ic2hpcFN1bSI+PC9kaXY+CiAgPGRpdiBjbGFzcz0idGFic2JpZyIgaWQ9InRhYnNCaWciPjwvZGl2PgogIDxkaXYgY2xhc3M9InBhbmVsIj4KICAgIDxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPgogICAgICA8ZGl2IGNsYXNzPSJjaGlwcyIgaWQ9Im1rQ2hpcHMiPjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJtc2VsIiBpZD0ic2VsbGVyRiI+PGJ1dHRvbiB0eXBlPSJidXR0b24iIGNsYXNzPSJtc2VsLWJ0biIgYXJpYS1oYXNwb3B1cD0idHJ1ZSIgYXJpYS1leHBhbmRlZD0iZmFsc2UiPlRvZG9zIGxvcyB2ZW5kZWRvcmVzPC9idXR0b24+PGRpdiBjbGFzcz0ibXNlbC1wb3AiIGhpZGRlbj48L2Rpdj48L2Rpdj4KICAgICAgPGlucHV0IHR5cGU9InNlYXJjaCIgaWQ9InEiIHBsYWNlaG9sZGVyPSJCdXNjYXIgY2xpZW50ZSwgcGVkaWRvIG8gU0tVIiB2YWx1ZT0iJHtlc2ModWkucSl9IiBhcmlhLWxhYmVsPSJCdXNjYXIiIHN0eWxlPSJ3aWR0aDphdXRvO21pbi13aWR0aDoyMjBweCI+CiAgICAgIDxzcGFuIGNsYXNzPSJzcGFjZXIiIHN0eWxlPSJmbGV4OjEiPjwvc3Bhbj4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1naG9zdCBidG4tc20iIGlkPSJzeW5jTm93Ij4ke0kuc3luY31CdXNjYXIgcGVkaWRvcyBhaG9yYTwvYnV0dG9uPgogICAgPC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJicGYiIGlkPSJicEZpbHRlciIgaGlkZGVuPjwvZGl2PgogICAgPGRpdiBjbGFzcz0iYWN0aW9uYmFyIiBpZD0iYWN0aW9uYmFyIj48L2Rpdj4KICAgIDxkaXYgaWQ9Imxpc3QiPjwvZGl2PgogIDwvZGl2PmA7CiAgZHJhd0NvZGVzU3RyaXAoKTsgbG9hZENvZGVzKCk7CiAgJCgnI3N5bmNOb3cnKS5vbmNsaWNrID0gYXN5bmMgKCkgPT4geyBhd2FpdCBhcGkoJy9hcGkvc3luYycsIHsgbWV0aG9kOiAnUE9TVCcgfSk7IHRvYXN0KCdCdXNjYW5kbyBwZWRpZG9zIG51ZXZvcyBlbiBsb3MgbWFya2V0cGxhY2Vz4oCmJyk7IH07CiAgJCgnI3RhYnNCaWcnKS5vbmNsaWNrID0gZSA9PiB7IGNvbnN0IGIgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS10YWIyXScpOyBpZiAoIWIpIHJldHVybjsgdWkudGFiID0gYi5kYXRhc2V0LnRhYjI7IHNlbGVjdGVkLmNsZWFyKCk7IGRyYXdSb3dzKCk7IH07CiAgJCgnI21rQ2hpcHMnKS5vbmNsaWNrID0gZSA9PiB7IGNvbnN0IGIgPSBlLnRhcmdldC5jbG9zZXN0KCcuY2hpcCcpOyBpZiAoIWIpIHJldHVybjsgdWkubWsgPSBiLmRhdGFzZXQubWs7IGRyYXdSb3dzKCk7IH07CiAgLy8gZmlsdHJvIGRlIHZlbmRlZG9yZXM6IHNlIHB1ZWRlbiBtYXJjYXIgdmFyaW9zIGEgbGEgdmV6IChuaW5ndW5vIG1hcmNhZG8gPSB0b2RvcykKICBjb25zdCBzZkJveCA9ICQoJyNzZWxsZXJGJyk7CiAgc2ZCb3gucXVlcnlTZWxlY3RvcignLm1zZWwtYnRuJykub25jbGljayA9ICgpID0+IHsgY29uc3QgcG9wID0gc2ZCb3gucXVlcnlTZWxlY3RvcignLm1zZWwtcG9wJyk7IHBvcC5oaWRkZW4gPSAhcG9wLmhpZGRlbjsgc2ZCb3gucXVlcnlTZWxlY3RvcignLm1zZWwtYnRuJykuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgU3RyaW5nKCFwb3AuaGlkZGVuKSk7IH07CiAgc2ZCb3gucXVlcnlTZWxlY3RvcignLm1zZWwtcG9wJykub25jaGFuZ2UgPSBlID0+IHsKICAgIGNvbnN0IHYgPSBlLnRhcmdldC52YWx1ZTsgaWYgKCF2KSByZXR1cm47CiAgICBpZiAodiA9PT0gJ2FsbCcpIHVpLnNlbGxlcnMuY2xlYXIoKTsgZWxzZSBlLnRhcmdldC5jaGVja2VkID8gdWkuc2VsbGVycy5hZGQodikgOiB1aS5zZWxsZXJzLmRlbGV0ZSh2KTsKICAgIGRyYXdTZWxsZXJGaWx0ZXIoKTsgZHJhd1Jvd3MoKTsKICB9OwogIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZSA9PiB7IGlmICghZS50YXJnZXQuY2xvc2VzdCgnI3NlbGxlckYnKSkgeyBjb25zdCBwb3AgPSAkKCcjc2VsbGVyRiAubXNlbC1wb3AnKTsgaWYgKHBvcCkgcG9wLmhpZGRlbiA9IHRydWU7IH0gfSk7CiAgJCgnI3EnKS5vbmlucHV0ID0gZSA9PiB7IHVpLnEgPSBlLnRhcmdldC52YWx1ZS50cmltKCkudG9Mb3dlckNhc2UoKTsgZHJhd1Jvd3MoKTsgfTsKICAkKCcjbGlzdCcpLm9uY2hhbmdlID0gZSA9PiB7IGNvbnN0IGlkID0gZS50YXJnZXQuZGF0YXNldC5pZDsgaWYgKCFpZCkgcmV0dXJuOyBlLnRhcmdldC5jaGVja2VkID8gc2VsZWN0ZWQuYWRkKCtpZCkgOiBzZWxlY3RlZC5kZWxldGUoK2lkKTsgZHJhd0FjdGlvbmJhcigpOyB9OwogICQoJyNsaXN0Jykub25jbGljayA9IGFzeW5jIGUgPT4gewogICAgY29uc3QgYiA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLWFjdF0nKTsgaWYgKCFiKSByZXR1cm47CiAgICBjb25zdCBpZCA9ICtiLmRhdGFzZXQuaWQ7CiAgICBpZiAoYi5kYXRhc2V0LmFjdCA9PT0gJ3ByaW50JykgeyBpZiAobWUudXNlci5yb2xlID09PSAnc2VsbGVyJyAmJiAhY29uZmlybSgnU2kgbGEgaW1wcmltZXMgdMO6LCBxdWVkYSBjb21vIGltcHJlc2EgcG9yIHR1IHRpZW5kYSB5IGVsIGZ1bGZpbGxtZW50IGxhIHZlcsOhIGVuIHJvam8gY29tbyAiRXRpcXVldGEgaW1wcmVzYSIuIMK/SW1wcmltaXI/JykpIHJldHVybjsgaWYgKGRvd25sb2FkaW5nKSByZXR1cm47IGRvd25sb2FkaW5nID0gdHJ1ZTsgYi5kaXNhYmxlZCA9IHRydWU7IHNob3dTdW4oMSk7IGxldCBva0RsID0gZmFsc2U7CiAgICAgIHRyeSB7CiAgICAgICAgY29uc3QgZG9uZSA9IGF3YWl0IHJlY29yZE9yZGVycygnSW1wcmltaXIgZXRpcXVldGEnLCBbaWRdKTsKICAgICAgICBjb25zdCByZXMgPSBhd2FpdCBzYWZlRmV0Y2goYC9hcGkvb3JkZXJzLyR7aWR9L2xhYmVsLnBkZj9tYXJrPTFgLCB7IGNyZWRlbnRpYWxzOiAnc2FtZS1vcmlnaW4nIH0pOwogICAgICAgIGlmICghcmVzLm9rKSB7IGNvbnN0IGUgPSBhd2FpdCByZXMuanNvbigpLmNhdGNoKCgpID0+ICh7fSkpOyB0aHJvdyBuZXcgRXJyb3IoZS5lcnJvciB8fCAnTm8gc2UgcHVkbyBkZXNjYXJnYXIgbGEgZXRpcXVldGEnKTsgfQogICAgICAgIGNvbnN0IGJsb2IgPSBhd2FpdCByZXMuYmxvYigpOwogICAgICAgIGNvbnN0IG5hbWUgPSAocmVzLmhlYWRlcnMuZ2V0KCdjb250ZW50LWRpc3Bvc2l0aW9uJykgfHwgJycpLm1hdGNoKC9maWxlbmFtZT0iKFteIl0rKSIvKT8uWzFdIHx8IGBldGlxdWV0YS0ke2lkfS5wZGZgOwogICAgICAgIGNvbnN0IGEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7IGEuaHJlZiA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7IGEuZG93bmxvYWQgPSBuYW1lOyBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGEpOyBhLmNsaWNrKCk7IGEucmVtb3ZlKCk7CiAgICAgICAgc2V0VGltZW91dCgoKSA9PiBVUkwucmV2b2tlT2JqZWN0VVJMKGEuaHJlZiksIDYwMDAwKTsKICAgICAgICBva0RsID0gdHJ1ZTsgZG9uZSgpOyB0b2FzdCgnRXRpcXVldGEgZGVzY2FyZ2FkYSDCtyBwYXPDsyBhICJFdGlxdWV0YXMgaW1wcmVzYXMiJyk7CiAgICAgIH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSwgNTAwMCk7IGIuZGlzYWJsZWQgPSBmYWxzZTsgfQogICAgICBmaW5hbGx5IHsgaGlkZVN1bighb2tEbCk7IGRvd25sb2FkaW5nID0gZmFsc2U7IHNldFRpbWVvdXQobG9hZE9yZGVycywgNDAwKTsgfSB9CiAgICBpZiAoYi5kYXRhc2V0LmFjdCA9PT0gJ3JlcHJpbnQnKSB3aW5kb3cub3BlbihgL2FwaS9vcmRlcnMvJHtpZH0vbGFiZWwucGRmYCwgJ19ibGFuaycpOwogICAgaWYgKGIuZGF0YXNldC5hY3QgPT09ICdyZXRyeScpIHsgYi5kaXNhYmxlZCA9IHRydWU7IHRyeSB7IGF3YWl0IGFwaShgL2FwaS9vcmRlcnMvJHtpZH0vcmV0cnlgLCB7IG1ldGhvZDogJ1BPU1QnIH0pOyB0b2FzdCgnUmVpbnRlbnRhbmRv4oCmJyk7IGxvYWRPcmRlcnMoKTsgfSBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlKTsgfSB9CiAgICBpZiAoYi5kYXRhc2V0LmFjdCA9PT0gJ3VuYmxvY2snKSB7CiAgICAgIGlmICghY29uZmlybSgnwr9EZXNibG9xdWVhciBlc3RhIGV0aXF1ZXRhPyBQYXNhIGEgbGEgc2VjY2nDs24gIkRlc2Jsb3F1ZWFkYXMiLiBFbiBsYSBob2phIGRlbCBwZWRpZG8gc2FsZHLDoSBzdSBuw7ptZXJvIHkgcXVlZGFyw6FuIG1hcmNhZG9zIGNvbiAiRkFMVEEiIGxvcyBwcm9kdWN0b3MgcXVlIHNlIHJlbGxlbmFuIGFwYXJ0ZS4nKSkgcmV0dXJuOwogICAgICBiLmRpc2FibGVkID0gdHJ1ZTsgYi50ZXh0Q29udGVudCA9ICdEZXNibG9xdWVhbmRv4oCmJzsKICAgICAgdHJ5IHsgY29uc3QgcmVjID0gYXdhaXQgcmVjb3JkT3JkZXJzKCdEZXNibG9xdWVhciBldGlxdWV0YScsIFtpZF0pOyBhd2FpdCBhcGlSZXRyeShgL2FwaS9vcmRlcnMvJHtpZH0vdW5ibG9ja2AsIHsgbWV0aG9kOiAnUE9TVCcgfSk7IHJlYygpOyBtYXJrVW5ibG9ja2VkKFtpZF0pOyB0b2FzdCgnRXRpcXVldGEgZGVzYmxvcXVlYWRhIMK3IHBhc8OzIGEgIkRlc2Jsb3F1ZWFkYXMiJyk7IGxvYWRPcmRlcnMoKTsgfSBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlKTsgYi5kaXNhYmxlZCA9IGZhbHNlOyBiLmlubmVySFRNTCA9IGAke0kubG9ja31EZXNibG9xdWVhciBldGlxdWV0YWA7IH0KICAgIH0KICAgIGlmIChiLmRhdGFzZXQuYWN0ID09PSAncmVibG9jaycpIHsgdHJ5IHsgY29uc3QgcmVjID0gYXdhaXQgcmVjb3JkT3JkZXJzKCdWb2x2ZXIgYSBibG9xdWVhcicsIFtpZF0pOyBhd2FpdCBhcGkoYC9hcGkvb3JkZXJzLyR7aWR9L3JlYmxvY2tgLCB7IG1ldGhvZDogJ1BPU1QnIH0pOyByZWMoKTsgdG9hc3QoJ0V0aXF1ZXRhIGJsb3F1ZWFkYSBvdHJhIHZleicpOyBsb2FkT3JkZXJzKCk7IH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IH0gfQogICAgaWYgKGIuZGF0YXNldC5hY3QgPT09ICd1bnByaW50JykgeyBjb25zdCByZWMgPSBhd2FpdCByZWNvcmRPcmRlcnMoJ01hcmNhciBjb21vIG5vIGltcHJlc2EnLCBbaWRdKTsgYXdhaXQgYXBpKGAvYXBpL29yZGVycy8ke2lkfS91bnByaW50YCwgeyBtZXRob2Q6ICdQT1NUJyB9KTsgcmVjKCk7IHRvYXN0KCdWb2x2acOzIGEgIkV0aXF1ZXRhcyBwb3IgaW1wcmltaXIiJyk7IGxvYWRPcmRlcnMoKTsgfQogIH07CiAgJCgnI2FjdGlvbmJhcicpLm9uY2xpY2sgPSBhc3luYyBlID0+IHsKICAgIGNvbnN0IGIgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1idWxrXScpOyBpZiAoIWIpIHJldHVybjsKICAgIGlmIChiLmRhdGFzZXQuYnVsayA9PT0gJ2FsbCcpIHsgY29uc3QgaWRzID0gdmlzaWJsZSgpLmZpbHRlcihwcmludGFibGUpLm1hcChvID0+IG8uaWQpOyBpZiAoaWRzLmxlbmd0aCAmJiBzZWxsZXJPa1RvUHJpbnQoaWRzLmxlbmd0aCkpIGRvd25sb2FkQmF0Y2goaWRzKTsgfQogICAgaWYgKGIuZGF0YXNldC5idWxrID09PSAnc2VsJykgeyBjb25zdCBpZHMgPSBbLi4uc2VsZWN0ZWRdLmZpbHRlcihpZCA9PiBvcmRlcnMuc29tZShvID0+IG8uaWQgPT09IGlkICYmIHByaW50YWJsZShvKSkpOyBpZiAoaWRzLmxlbmd0aCAmJiBzZWxsZXJPa1RvUHJpbnQoaWRzLmxlbmd0aCkpIGRvd25sb2FkQmF0Y2goaWRzKTsgfQogICAgaWYgKGIuZGF0YXNldC5idWxrID09PSAnc2VsYWxsJykgeyB2aXNpYmxlKCkuZmlsdGVyKG8gPT4gdWkudGFiID09PSAnYmxvY2tlZCcgPyAoby5zdGF0ZSA9PT0gJ2Jsb2NrZWQnICYmIG8ub3duICE9PSBmYWxzZSkgOiAocHJpbnRhYmxlKG8pIHx8IChvLnN0YXRlID09PSAncHJpbnRlZCcgJiYgby5vd24gIT09IGZhbHNlKSkpLmZvckVhY2gobyA9PiBzZWxlY3RlZC5hZGQoby5pZCkpOyBkcmF3Um93cygpOyB9CiAgICBpZiAoYi5kYXRhc2V0LmJ1bGsgPT09ICd1bnByaW50JykgewogICAgICBjb25zdCBpZHMgPSBbLi4uc2VsZWN0ZWRdLmZpbHRlcihpZCA9PiBvcmRlcnMuZmluZChvID0+IG8uaWQgPT09IGlkICYmIG8uc3RhdGUgPT09ICdwcmludGVkJykpOwogICAgICBpZiAoIWlkcy5sZW5ndGggfHwgIWNvbmZpcm0oYMK/TWFyY2FyICR7aWRzLmxlbmd0aH0gZXRpcXVldGEke2lkcy5sZW5ndGggPT09IDEgPyAnJyA6ICdzJ30gY29tbyBOTyBpbXByZXNhJHtpZHMubGVuZ3RoID09PSAxID8gJycgOiAncyd9PyBWdWVsdmVuIGEgIlBhcmEgaW1wcmltaXIiLmApKSByZXR1cm47CiAgICAgIGIuZGlzYWJsZWQgPSB0cnVlOwogICAgICBjb25zdCByZWMgPSBhd2FpdCByZWNvcmRPcmRlcnMoYE1hcmNhciAke2lkcy5sZW5ndGh9IGNvbW8gbm8gaW1wcmVzYXNgLCBpZHMpOwogICAgICBsZXQgb2sgPSAwOyBmb3IgKGNvbnN0IGlkIG9mIGlkcykgeyB0cnkgeyBhd2FpdCBhcGkoYC9hcGkvb3JkZXJzLyR7aWR9L3VucHJpbnRgLCB7IG1ldGhvZDogJ1BPU1QnIH0pOyBvaysrOyB9IGNhdGNoIHt9IH0KICAgICAgcmVjKCk7IHNlbGVjdGVkLmNsZWFyKCk7IHRvYXN0KGAke29rfSBldGlxdWV0YSR7b2sgPT09IDEgPyAnJyA6ICdzJ30gdm9sdmllcm9uIGEgIlBhcmEgaW1wcmltaXIiYCk7IGxvYWRPcmRlcnMoKTsKICAgIH0KICAgIGlmIChiLmRhdGFzZXQuYnVsayA9PT0gJ3VuYmxvY2snKSB7CiAgICAgIGNvbnN0IGlkcyA9IFsuLi5zZWxlY3RlZF0uZmlsdGVyKGlkID0+IG9yZGVycy5maW5kKG8gPT4gby5pZCA9PT0gaWQgJiYgby5zdGF0ZSA9PT0gJ2Jsb2NrZWQnKSk7CiAgICAgIGlmICghaWRzLmxlbmd0aCB8fCAhY29uZmlybShgwr9EZXNibG9xdWVhciAke2lkcy5sZW5ndGh9IGV0aXF1ZXRhJHtpZHMubGVuZ3RoID09PSAxID8gJycgOiAncyd9PyBQYXNhbiBhIGxhIHNlY2Npw7NuICJEZXNibG9xdWVhZGFzIi4gRW4gbGEgaG9qYSBkZSBjYWRhIHBlZGlkbyBzYWxkcsOhIHN1IG7Dum1lcm8geSBxdWVkYXLDoW4gbWFyY2Fkb3MgY29uICJGQUxUQSIgbG9zIHByb2R1Y3RvcyBxdWUgc2UgcmVsbGVuYW4gYXBhcnRlLmApKSByZXR1cm47CiAgICAgIGIuZGlzYWJsZWQgPSB0cnVlOyBiLnRleHRDb250ZW50ID0gJ0Rlc2Jsb3F1ZWFuZG/igKYnOwogICAgICB0cnkgewogICAgICAgIGNvbnN0IHJlYyA9IGF3YWl0IHJlY29yZE9yZGVycyhgRGVzYmxvcXVlYXIgJHtpZHMubGVuZ3RofSBldGlxdWV0YXNgLCBpZHMpOwogICAgICAgIGNvbnN0IHIgPSBhd2FpdCBhcGlSZXRyeSgnL2FwaS9vcmRlcnMvdW5ibG9jay1idWxrJywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBpZHMgfSB9KTsKICAgICAgICByZWMoKTsgbWFya1VuYmxvY2tlZChpZHMpOyBzZWxlY3RlZC5jbGVhcigpOwogICAgICAgIHRvYXN0KGAke3IudW5ibG9ja2VkfSBldGlxdWV0YSR7ci51bmJsb2NrZWQgPT09IDEgPyAnJyA6ICdzJ30gZGVzYmxvcXVlYWRhJHtyLnVuYmxvY2tlZCA9PT0gMSA/ICcnIDogJ3MnfSDCtyBwYXNhcm9uIGEgIkRlc2Jsb3F1ZWFkYXMiYCk7IGxvYWRPcmRlcnMoKTsKICAgICAgfSBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlKTsgZHJhd0FjdGlvbmJhcigpOyB9CiAgICB9CiAgICBpZiAoYi5kYXRhc2V0LmJ1bGsgPT09ICdub25lJykgeyBzZWxlY3RlZC5jbGVhcigpOyBkcmF3Um93cygpOyB9CiAgfTsKICBsb2FkT3JkZXJzKCk7Cn0KCmFzeW5jIGZ1bmN0aW9uIGxvYWRPcmRlcnMoKSB7CiAgaWYgKHRhYiAhPT0gJ3RyYXknKSByZXR1cm47CiAgY29uc3QgZCA9IGF3YWl0IGFwaSgnL2FwaS9vcmRlcnM/dmlldz1hbGwnKTsKICBjb25zdCBwcmV2UmVhZHkgPSBuZXcgU2V0KG9yZGVycy5maWx0ZXIobyA9PiBvLnN0YXRlID09PSAncmVhZHknKS5tYXAobyA9PiBvLmlkKSk7CiAgb3JkZXJzID0gZC5vcmRlcnMuc29ydCgoYSwgYikgPT4gdHMoYikgLSB0cyhhKSk7CiAgc2VsbGVycyA9IGQuc2VsbGVyczsKICBkcmF3U2VsbGVyRmlsdGVyKCk7CiAgY29uc3QgZnJlc2ggPSBvcmRlcnMuZmlsdGVyKG8gPT4gby5zdGF0ZSA9PT0gJ3JlYWR5JyAmJiAhcHJldlJlYWR5LmhhcyhvLmlkKSkubWFwKG8gPT4gby5pZCk7CiAgZHJhd1Jvd3MoZmlyc3RMb2FkID8gW10gOiBmcmVzaCk7CiAgaWYgKCFmaXJzdExvYWQgJiYgZnJlc2gubGVuZ3RoKSB0b2FzdChgJHtmcmVzaC5sZW5ndGh9IGV0aXF1ZXRhJHtmcmVzaC5sZW5ndGggPiAxID8gJ3MnIDogJyd9IG51ZXZhJHtmcmVzaC5sZW5ndGggPiAxID8gJ3MnIDogJyd9IHBvciBpbXByaW1pcmApOwogIGZpcnN0TG9hZCA9IGZhbHNlOwogIC8vIGRlc2NhcmdhIGF1dG9tw6F0aWNhIGVsaW1pbmFkYTogbnVuY2Egc2UgZGVzY2FyZ2FuIG5pIG1hcmNhbiBldGlxdWV0YXMgc2luIHF1ZSBhbGd1aWVuIGhhZ2EgY2xpYwp9Cgpjb25zdCBzZWxsZXJPayA9IG8gPT4gIXVpLnNlbGxlcnMuc2l6ZSB8fCB1aS5zZWxsZXJzLmhhcyhTdHJpbmcoby5zZWxsZXJfaWQpKTsKZnVuY3Rpb24gZHJhd1NlbGxlckZpbHRlcigpIHsKICBjb25zdCBib3ggPSAkKCcjc2VsbGVyRicpOyBpZiAoIWJveCkgcmV0dXJuOwogIGZvciAoY29uc3QgaWQgb2YgWy4uLnVpLnNlbGxlcnNdKSBpZiAoIXNlbGxlcnMuc29tZShzID0+IFN0cmluZyhzLmlkKSA9PT0gaWQpKSB1aS5zZWxsZXJzLmRlbGV0ZShpZCk7CiAgY29uc3QgbiA9IHVpLnNlbGxlcnMuc2l6ZTsKICBib3gucXVlcnlTZWxlY3RvcignLm1zZWwtYnRuJykudGV4dENvbnRlbnQgPSAhbiA/ICdUb2RvcyBsb3MgdmVuZGVkb3JlcycgOiBuID09PSAxID8gKHNlbGxlcnMuZmluZChzID0+IHVpLnNlbGxlcnMuaGFzKFN0cmluZyhzLmlkKSkpPy5uYW1lIHx8ICcxIHZlbmRlZG9yJykgOiBgJHtufSB2ZW5kZWRvcmVzYDsKICBib3guY2xhc3NMaXN0LnRvZ2dsZSgnb24nLCBuID4gMCk7CiAgYm94LnF1ZXJ5U2VsZWN0b3IoJy5tc2VsLXBvcCcpLmlubmVySFRNTCA9IGA8bGFiZWwgY2xhc3M9Im1zZWwtYWxsIj48aW5wdXQgdHlwZT0iY2hlY2tib3giIHZhbHVlPSJhbGwiICR7IW4gPyAnY2hlY2tlZCcgOiAnJ30+IFRvZG9zIGxvcyB2ZW5kZWRvcmVzPC9sYWJlbD5gICsKICAgIHNlbGxlcnMubWFwKHMgPT4gYDxsYWJlbD48aW5wdXQgdHlwZT0iY2hlY2tib3giIHZhbHVlPSIke3MuaWR9IiAke3VpLnNlbGxlcnMuaGFzKFN0cmluZyhzLmlkKSkgPyAnY2hlY2tlZCcgOiAnJ30+ICR7ZXNjKHMubmFtZSl9PC9sYWJlbD5gKS5qb2luKCcnKTsKfQovLyBmaWx0cm8gZGUgbWFya2V0cGxhY2U6IGFkZW3DoXMgc2VwYXJhIE1lcmNhZG8gTGlicmUgQWdlbmNpYSB5IE1lcmNhZG8gTGlicmUgRmxleApjb25zdCBta01hdGNoID0gKG8sIGspID0+IGsgPT09ICdhbGwnIHx8IChrID09PSAnbWwtYWdlbmNpYScgPyBvLm1hcmtldHBsYWNlID09PSAnbWwnICYmIG8uc2hpcF90eXBlICE9PSAnRmxleCcgOiBrID09PSAnbWwtZmxleCcgPyBvLm1hcmtldHBsYWNlID09PSAnbWwnICYmIG8uc2hpcF90eXBlID09PSAnRmxleCcgOiBvLm1hcmtldHBsYWNlID09PSBrKTsKY29uc3QgbWF0Y2hlc0ZpbHRlcnMgPSBvID0+IG1rTWF0Y2gobywgdWkubWspICYmIHNlbGxlck9rKG8pICYmCiAgKCF1aS5xIHx8IG8ub3JkZXJfbnVtYmVyLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXModWkucSkgfHwgKG8uY3VzdG9tZXIgfHwgJycpLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXModWkucSkgfHwgby5pdGVtcy5zb21lKGkgPT4gW2kuc2t1LCBpLnB1Yl9pZCwgaS5uYW1lXS5qb2luKCcgJykudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyh1aS5xKSkpOwpjb25zdCB2aXNpYmxlSW4gPSB0ID0+IG9yZGVycy5maWx0ZXIobyA9PiBpblRhYkZuKG8sIHQpICYmIG1hdGNoZXNGaWx0ZXJzKG8pKTsKLy8gRW4gIlBvciBpbXByaW1pciIgdGFtYmnDqW4gc2UgcXVlZGFuIGxhcyBxdWUgc2UgaW1wcmltaWVyb24gZW4gbGFzIMO6bHRpbWFzIDEyIGhvcmFzLCBlbiByb2pvIGNvbiAiVm9sdmVyIGEgaW1wcmltaXIiCmNvbnN0IHByaW50ZWRSZWNlbnRseSA9IG8gPT4gby5zdGF0ZSA9PT0gJ3ByaW50ZWQnICYmIG8ucHJpbnRlZF9hdCAmJiBEYXRlLm5vdygpIC0gbmV3IERhdGUoby5wcmludGVkX2F0LnJlcGxhY2UoJyAnLCAnVCcpICsgJ1onKSA8IDEyICogMzYwMGUzOwovLyBCbG9xdWVhZGFzIGltcHJlc2FzOiDCv2VsIGZ1bGZpbGxtZW50IHRpZW5lIHF1ZSByZWxsZW5hciAodGllbmUgYWwgbWVub3MgdW4gcHJvZHVjdG8pIG8gbm8gbGUgdG9jYSBuYWRhPwpjb25zdCBicEtpbmQgPSBvID0+ICgoby5taXNzaW5nX2lkeCB8fCBbXSkubGVuZ3RoID49IChvLml0ZW1zIHx8IFtdKS5sZW5ndGggPyAnbm9uZScgOiAnZmlsbCcpOwpmdW5jdGlvbiB2aXNpYmxlKCkgewogIGlmICh1aS50YWIgPT09ICdibG9ja2VkUHJpbnRlZCcgJiYgdWkuYnBmICE9PSAnYWxsJykgcmV0dXJuIHZpc2libGVJbih1aS50YWIpLmZpbHRlcihvID0+IGJwS2luZChvKSA9PT0gdWkuYnBmKTsKICBpZiAodWkudGFiID09PSAnYmxvY2tlZCcpIHJldHVybiB2aXNpYmxlSW4odWkudGFiKS5maWx0ZXIobyA9PiAodWkuYmRmID09PSAnYWxsJyB8fCAodWkuYmRmID09PSAndG9kYXknKSA9PT0gaXNGb3JUb2RheShvKSkgJiYgKHVpLmJiZiA9PT0gJ2FsbCcgfHwgYnBLaW5kKG8pID09PSB1aS5iYmYpKTsKICBpZiAodWkudGFiID09PSAndW5ibG9ja2VkJykgcmV0dXJuIHZpc2libGVJbih1aS50YWIpLmZpbHRlcihvID0+ICh1aS51ZGYgPT09ICdhbGwnIHx8ICh1aS51ZGYgPT09ICd0b2RheScpID09PSBpc0ZvclRvZGF5KG8pKSAmJiAodWkudWJmID09PSAnYWxsJyB8fCBicEtpbmQobykgPT09IHVpLnViZikpOwogIC8vIGxhcyBpbXByZXNhcyBzYWxlbiBkZSAiUGFyYSBpbXByaW1pciBob3kiIHkgcXVlZGFuIHNvbG8gZW4gIkV0aXF1ZXRhcyBpbXByZXNhcyIgbyAiQmxvcXVlYWRhcyBpbXByZXNhcyIKICByZXR1cm4gdmlzaWJsZUluKHVpLnRhYik7Cn0KCmZ1bmN0aW9uIGl0ZW1zSFRNTChvKSB7CiAgY29uc3QgYmFkID0gbmV3IFNldChvLm1pc3NpbmdfaWR4IHx8IFtdKTsKICBjb25zdCBtaXhlZCA9IGJhZC5zaXplID4gMDsgLy8gcGVkaWRvIGNvbiBwcm9kdWN0b3MgYmxvcXVlYWRvczogcm9qbyA9IG5vIGxvIHRpZW5lIGVsIGZ1bGZpbGxtZW50LCB2ZXJkZSA9IHPDrSBsbyB0aWVuZQogIHJldHVybiBgPGRpdiBjbGFzcz0iaXRlbXMiPiR7by5pdGVtcy5tYXAoKGksIG4pID0+IGA8c3BhbiBjbGFzcz0iJHtiYWQuaGFzKG4pID8gJ2JhZCcgOiAnZ29vZCd9Ij4ke2JhZC5oYXMobikgPyAnPGVtIGNsYXNzPSJmYWx0YSI+RkFMVEE8L2VtPiAnIDogbWl4ZWQgPyAnPGVtIGNsYXNzPSJ0aWVuZSI+VElFTkU8L2VtPiAnIDogJyd9PGI+JHtlc2MoaS5xdHkpfcOXPC9iPiAke2VzYyhpLm5hbWUpfSR7aS52YXJpYW50ID8gYCA8c3BhbiBjbGFzcz0idiI+wrcgJHtlc2MoaS52YXJpYW50KX08L3NwYW4+YCA6ICcnfSA8c3BhbiBjbGFzcz0ibW9ubyB2Ij4ke2VzYyhpLnNrdSB8fCBpLnB1Yl9pZCl9PC9zcGFuPjwvc3Bhbj5gKS5qb2luKCcnKX08L2Rpdj5gOwp9CmZ1bmN0aW9uIHBpbGwobykgeyByZXR1cm4gYDxzcGFuIGNsYXNzPSJwaWxsICR7by5zdGF0ZX0iPiR7cGlsbEljb25bby5zdGF0ZV0gfHwgJyd9JHtTVEFURVtvLnN0YXRlXSB8fCBvLnN0YXRlfTwvc3Bhbj5gOyB9CgoKLy8gVGFibGEgZGUgY29udGVvIHBvciBjYW5hbDogcGFyYSBjYWRhIGNhbmFsLCAiRkYiID0gbGFzIHF1ZSBzZXBhcmEgZWwgZnVsZmlsbG1lbnQgeSAiQmxvcS4iID0gYmxvcXVlYWRhcyBhbCAxMDAlCi8vIChlbCB2ZW5kZWRvciBlbnbDrWEgdG9kbzsgZWwgZnVsZmlsbG1lbnQgbm8gc2VwYXJhIG5hZGEpCmNvbnN0IFNTX0NBVFMgPSBbWydjZScsICdDZW50cm8gZW52w61vIE1MJ10sIFsnZmxleCcsICdGbGV4J10sIFsnZmEnLCAnRmFsYWJlbGxhJ10sIFsncGEnLCAnUGFyaXMnXV07CmZ1bmN0aW9uIGNvdW50VGFibGUocm93cywgZmlyc3QpIHsKICBjb25zdCB6ID0gbiA9PiBuID8gbiA6ICc8c3BhbiBjbGFzcz0iemVybyI+wrc8L3NwYW4+JzsKICBjb25zdCBzdW0gPSAobywgaykgPT4gU1NfQ0FUUy5yZWR1Y2UoKGEsIFtjXSkgPT4gYSArICgob1trXSB8fCB7fSlbY10gfHwgMCksIDApOwogIHJldHVybiBgPGRpdiBjbGFzcz0idGFibGUtd3JhcCI+PHRhYmxlIGNsYXNzPSJzcy10YWJsZSBzcy0yIj48dGhlYWQ+CiAgICA8dHI+PHRoIHJvd3NwYW49IjIiPiR7Zmlyc3R9PC90aD4ke1NTX0NBVFMubWFwKChbaywgbl0pID0+IGA8dGggY29sc3Bhbj0iMiIgY2xhc3M9InNzLWdycCIgc3R5bGU9Ii0tZ2M6JHt7IGNlOiBNS19DT0xPUi5tbCwgZmxleDogJyMyMzk0NkEnLCBmYTogTUtfQ09MT1IuZmEsIHBhOiBNS19DT0xPUi5wYSB9W2tdfSI+JHt7IGNlOiAn8J+TpiAnLCBmbGV4OiAn4pqhICcsIGZhOiAn8J+bje+4jyAnLCBwYTogJ/Cfl7wgJyB9W2tdfSR7bn08L3RoPmApLmpvaW4oJycpfTx0aCBjb2xzcGFuPSIyIiBjbGFzcz0ic3MtZ3JwIj5Ub3RhbDwvdGg+PHRoIHJvd3NwYW49IjIiIGNsYXNzPSJudW0iPlRvZGFzPC90aD48L3RyPgogICAgPHRyPiR7U1NfQ0FUUy5jb25jYXQoW1sndCddXSkubWFwKCgpID0+ICc8dGggY2xhc3M9Im51bSIgdGl0bGU9IkxhcyBzZXBhcmEgZWwgZnVsZmlsbG1lbnQiPkZGPC90aD48dGggY2xhc3M9Im51bSBzcy1ibCIgdGl0bGU9IkJsb3F1ZWFkYXMgYWwgMTAwJTogZWwgZnVsZmlsbG1lbnQgbm8gc2VwYXJhIG5hZGEiPkJsb3EuPC90aD4nKS5qb2luKCcnKX08L3RyPjwvdGhlYWQ+PHRib2R5PgogICAgJHtyb3dzLm1hcChyID0+IGA8dHIgY2xhc3M9IiR7ci5jbHMgfHwgJyd9Ij48dGQ+JHtyLmxhYmVsfTwvdGQ+JHtTU19DQVRTLm1hcCgoW2NdKSA9PiBgPHRkIGNsYXNzPSJudW0iPiR7eigoci5mZiB8fCB7fSlbY10pfTwvdGQ+PHRkIGNsYXNzPSJudW0gc3MtYmwiPiR7eigoci5ibCB8fCB7fSlbY10pfTwvdGQ+YCkuam9pbignJyl9PHRkIGNsYXNzPSJudW0iPjxiPiR7c3VtKHIsICdmZicpfTwvYj48L3RkPjx0ZCBjbGFzcz0ibnVtIHNzLWJsIj48Yj4ke3N1bShyLCAnYmwnKSB8fCAnPHNwYW4gY2xhc3M9Inplcm8iPsK3PC9zcGFuPid9PC9iPjwvdGQ+PHRkIGNsYXNzPSJudW0iPiR7c3VtKHIsICdmZicpICsgc3VtKHIsICdibCcpfTwvdGQ+PC90cj5gKS5qb2luKCcnKX0KICA8L3Rib2R5PjwvdGFibGU+PC9kaXY+YDsKfQoKLy8gUmVnaXN0cm8gZGlhcmlvIGRlIHBhcXVldGVzIChwb3IgZMOtYSBkZSBkZXNwYWNobyk6IG5vIHNlIGJvcnJhLCBxdWVkYSB1biBoaXN0b3JpYWwgZMOtYSBhIGTDrWEKYXN5bmMgZnVuY3Rpb24gZHJhd1NoaXBIaXN0b3J5KCkgewogIGxldCBkOyB0cnkgeyBkID0gYXdhaXQgYXBpKCcvYXBpL3NoaXAtaGlzdG9yeT9kYXlzPTIxJyk7IH0gY2F0Y2ggeyByZXR1cm47IH0KICBjb25zdCBib3ggPSAkKCcjc2hpcEhpc3QnKTsgaWYgKCFib3gpIHJldHVybjsKICBjb25zdCBDQVRTID0gW1snY2UnLCAnQ2VudHJvIGVudsOtbyBNTCddLCBbJ2ZsZXgnLCAnRmxleCddLCBbJ2ZhJywgJ0ZhbGFiZWxsYSddLCBbJ3BhJywgJ1BhcmlzJ11dOwogIGNvbnN0IGRheVMgPSB4ID0+IGVzYyhuZXcgRGF0ZSh4ICsgJ1QxMjowMDowMCcpLnRvTG9jYWxlRGF0ZVN0cmluZygnZXMtQ0wnLCB7IHdlZWtkYXk6ICdzaG9ydCcsIGRheTogJ251bWVyaWMnLCBtb250aDogJ3Nob3J0JyB9KS5yZXBsYWNlKC9cLi9nLCAnJykpOwogIGNvbnN0IHJvd3MgPSBbXTsKICBmb3IgKGNvbnN0IHIgb2YgZC5kYXlzKSB7CiAgICBjb25zdCBob3kgPSByLmRheSA9PT0gaXNvKG5ldyBEYXRlKCkpOwogICAgcm93cy5wdXNoKHsgbGFiZWw6IGA8Yj4ke2RheVMoci5kYXkpfTwvYj4ke2hveSA/ICcgPHNtYWxsIGNsYXNzPSJtdXRlZCI+KGhveSk8L3NtYWxsPicgOiAnJ31gLCBmZjogci5mZiwgYmw6IHIuYmwsIGNsczogJ3NzLWRheXJvdycgKyAoaG95ID8gJyBzcy10b2RheScgOiAnJykgfSk7CiAgICBpZiAodWkuc2hpcE9wZW4pIE9iamVjdC5rZXlzKHIuc2VsbGVycykuc29ydCgpLmZvckVhY2gobiA9PiByb3dzLnB1c2goeyBsYWJlbDogYDxzcGFuIGNsYXNzPSJzcy1zdWIiPiR7ZXNjKG4pfTwvc3Bhbj5gLCAuLi5yLnNlbGxlcnNbbl0sIGNsczogJ3NzLXNlbHJvdycgfSkpOwogIH0KICBib3guaW5uZXJIVE1MID0gZC5kYXlzLmxlbmd0aCA/IGNvdW50VGFibGUocm93cywgJ0TDrWEgZGUgZGVzcGFjaG8nKSArIGA8ZGl2IGNsYXNzPSJtdXRlZCBzcy1ub3RlIj5GRiA9IGxhcyBzZXBhcmEgZWwgZnVsZmlsbG1lbnQgwrcgQmxvcS4gPSBibG9xdWVhZGFzIGFsIDEwMCUgKGxhcyBlbnbDrWEgZWwgdmVuZGVkb3IgY29tcGxldGFzKS4gJHt1aS5zaGlwT3BlbiA/ICcnIDogJ1RvY2EgIlBvciBjdWVudGEiIHBhcmEgdmVyIGVsIGRldGFsbGUgZGUgY2FkYSB2ZW5kZWRvci4nfTwvZGl2PmAgOiAnPGRpdiBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJwYWRkaW5nOjZweCAycHgiPkHDum4gbm8gaGF5IGhpc3RvcmlhbC48L2Rpdj4nOwp9CgovLyBSZXN1bWVuIGFycmliYTogY3XDoW50b3MgZW52w61vcyBzYWxlbiAoaG95IG8gZW4gZWwgcHLDs3hpbW8gZMOtYSBkZSBkZXNwYWNobykgcG9yIHRpcG8geSBwb3IgY3VlbnRhCmZ1bmN0aW9uIGRyYXdTaGlwU3VtbWFyeSgpIHsKICBjb25zdCBib3ggPSAkKCcjc2hpcFN1bScpOyBpZiAoIWJveCkgcmV0dXJuOwogIC8vIEVsIGNvbnRlbyBkZWwgZMOtYSBpbmNsdXllIGxvIHF1ZSB5YSBzYWxpw7MgKGVudmlhZGFzKSwgYXPDrSBlbCBuw7ptZXJvIGRlbCBkw61hIG5vIGJhamE7IHNlIHJlaW5pY2lhIGEgbGFzIDAwOjAwCiAgLy8gbGFzIGNhbmNlbGFkYXMgbm8gY3VlbnRhbiAoYXVucXVlIHlhIGVzdHV2aWVyYW4gaW1wcmVzYXMpCiAgY29uc3Qgb3BlbiA9IG9yZGVycy5maWx0ZXIobyA9PiBvLnN0YXRlICE9PSAnY2FuY2VsbGVkJyAmJiAhby5ta19jYW5jZWxsZWQpOwogIGNvbnN0IGRheU9mID0gbyA9PiB7IGNvbnN0IGQgPSBkaXNwYXRjaERhdGUobyk7IHJldHVybiBkID8gaXNvKGQpIDogaXNvKG5ldyBEYXRlKCkpOyB9OwogIGNvbnN0IHRvZGF5ID0gaXNvKG5ldyBEYXRlKCkpOwogIGNvbnN0IGNhdCA9IG8gPT4gby5tYXJrZXRwbGFjZSA9PT0gJ21sJyA/IChvLnNoaXBfdHlwZSA9PT0gJ0ZsZXgnID8gJ2ZsZXgnIDogJ2NlJykgOiBvLm1hcmtldHBsYWNlOwogIGNvbnN0IENBVFMgPSBbWydjZScsICdDZW50cm8gZW52w61vIE1MJywgTUtfQ09MT1IubWxdLCBbJ2ZsZXgnLCAnRmxleCcsICcjMjM5NDZBJ10sIFsnZmEnLCAnRmFsYWJlbGxhJywgTUtfQ09MT1IuZmFdLCBbJ3BhJywgJ1BhcmlzJywgTUtfQ09MT1IucGFdXTsKICAvLyBsbyBhdHJhc2FkbyBxdWUgYcO6biBubyBzYWxlIHNlIGN1ZW50YSBob3k7IGxvIHF1ZSB5YSBzYWxpw7MgKHAuIGVqLiB1biBGbGV4IHJldGlyYWRvIGF5ZXIgcXVlIGHDum4gbm8gc2UgZW50cmVnYSkgcXVlZGEgZW4gc3UgZMOtYQogIGNvbnN0IGVmZiA9IG8gPT4gKG8uc3RhdGUgIT09ICdzaGlwcGVkJyAmJiAhby5vdXQgJiYgZGF5T2YobykgPCB0b2RheSA/IHRvZGF5IDogZGF5T2YobykpOwogIC8vIENhZGEgY2FuYWwgdGllbmUgc3UgcHJvcGlvIHByw7N4aW1vIGTDrWEgZGUgZGVzcGFjaG8gKHAuIGVqLiBNTCBlbCBsdW5lcyB5IEZhbGFiZWxsYSBlbCBtYXJ0ZXMpOgogIC8vIGVuICJQcsOzeGltbyIgc2UgY3VlbnRhLCBwb3IgY2FuYWwsIGxvIHF1ZSB2ZW5jZSBlbiBzdSBzaWd1aWVudGUgZMOtYSBkZSBkZXNwYWNoby4KICBjb25zdCB0YXJnZXRPZiA9IHt9OwogIGZvciAoY29uc3QgW2tdIG9mIENBVFMpIHRhcmdldE9mW2tdID0gdWkuc2hpcERheSA9PT0gJ3RvZGF5JyA/IHRvZGF5IDogKG9wZW4uZmlsdGVyKG8gPT4gY2F0KG8pID09PSBrICYmIG8uc3RhdGUgIT09ICdzaGlwcGVkJykubWFwKGVmZikuZmlsdGVyKGQgPT4gZCA+IHRvZGF5KS5zb3J0KClbMF0gfHwgbnVsbCk7CiAgY29uc3QgbGlzdCA9IG9wZW4uZmlsdGVyKG8gPT4gdGFyZ2V0T2ZbY2F0KG8pXSAmJiBlZmYobykgPT09IHRhcmdldE9mW2NhdChvKV0pOwogIGNvbnN0IGNvdW50ID0gKGFyciwgaykgPT4gYXJyLmZpbHRlcihvID0+IGNhdChvKSA9PT0gaykubGVuZ3RoOwogIGNvbnN0IGNudEJ5ID0gYXJyID0+IHsgY29uc3QgciA9IHt9OyBhcnIuZm9yRWFjaChvID0+IHsgcltjYXQobyldID0gKHJbY2F0KG8pXSB8fCAwKSArIDE7IH0pOyByZXR1cm4gcjsgfTsKICBjb25zdCBkYXlTID0gZCA9PiBlc2MobmV3IERhdGUoZCArICdUMTI6MDA6MDAnKS50b0xvY2FsZURhdGVTdHJpbmcoJ2VzLUNMJywgeyB3ZWVrZGF5OiAnc2hvcnQnLCBkYXk6ICdudW1lcmljJyB9KS5yZXBsYWNlKC9cLi9nLCAnJykpOwogIC8vIFBhcmEgZWwgY29udGVvIGRlbCBmdWxmaWxsbWVudCBubyBjdWVudGFuIGxhcyBldGlxdWV0YXMgYmxvcXVlYWRhcyBhbCAxMDAlIChubyB0aWVuZSBuaW5ndW5vIGRlIHN1cyBwcm9kdWN0b3MpOwogIC8vIHPDrSBjdWVudGFuIGxhcyBxdWUgdGllbmVuIGFsIG1lbm9zIHVuIHByb2R1Y3RvIHF1ZSBlbCBmdWxmaWxsbWVudCB0aWVuZS4KICBjb25zdCBub25lRmYgPSBvID0+IChvLm1pc3NpbmdfaWR4IHx8IFtdKS5sZW5ndGggPiAwICYmIChvLm1pc3NpbmdfaWR4IHx8IFtdKS5sZW5ndGggPj0gKG8uaXRlbXMgfHwgW10pLmxlbmd0aDsKICBjb25zdCBmZiA9IGxpc3QuZmlsdGVyKG8gPT4gIW5vbmVGZihvKSk7CiAgY29uc3QgYnlTZWxsZXIgPSBbLi4ubmV3IFNldChsaXN0Lm1hcChvID0+IG8uc2VsbGVyKSldLnNvcnQoKS5tYXAobiA9PiBbbiwgZmYuZmlsdGVyKG8gPT4gby5zZWxsZXIgPT09IG4pLCBsaXN0LmZpbHRlcihvID0+IG8uc2VsbGVyID09PSBuKV0pOwogIGNvbnN0IGN1dFMgPSAoYXJyLCBrKSA9PiB7IGNvbnN0IHQgPSB0YXJnZXRPZltrXTsgaWYgKCF0KSByZXR1cm4gJyc7IGNvbnN0IGhzID0gYXJyLmZpbHRlcihvID0+IGNhdChvKSA9PT0gaykubWFwKGRpc3BhdGNoRGF0ZSkuZmlsdGVyKGQgPT4gZCAmJiBpc28oZCkgPT09IHQgJiYgIVsnMjM6NTknLCAnMDA6MDAnXS5pbmNsdWRlcyhoaG1tKGQpKSk7IGNvbnN0IGNudCA9IG5ldyBNYXAoKTsgaHMuZm9yRWFjaChkID0+IHsgY29uc3QgaCA9IGhobW0oZCk7IGNudC5zZXQoaCwgKGNudC5nZXQoaCkgfHwgeyBuOiAwLCBkIH0pICk7IGNudC5nZXQoaCkubisrOyB9KTsgY29uc3QgdG9wID0gWy4uLmNudC52YWx1ZXMoKV0uc29ydCgoYSwgYikgPT4gYi5uIC0gYS5uIHx8IGIuZCAtIGEuZClbMF07IHJldHVybiAodWkuc2hpcERheSA9PT0gJ3RvZGF5JyA/ICcnIDogZGF5Uyh0KSArICcgJykgKyAodG9wID8gYW1wbSh0b3AuZCkgOiAnJyk7IH07IC8vIGhvcmEgZGUgY29ydGUgPSBsYSBxdWUgdGllbmVuIGxhIG1heW9yw61hIGRlIGxhcyBldGlxdWV0YXMgZGVsIGTDrWEKICBjb25zdCBleGNsID0gbGlzdC5sZW5ndGggLSBmZi5sZW5ndGg7CiAgY29uc3QgZmZQcmludGVkID0gZmYuZmlsdGVyKG8gPT4gWydwcmludGVkJywgJ3NoaXBwZWQnXS5pbmNsdWRlcyhvLnN0YXRlKSkubGVuZ3RoOyAvLyBsYXMgaW1wcmVzYXMgc2lndWVuIGNvbnRhbmRvOiBzYWxlbiBpZ3VhbCBlc2UgZMOtYQogIGNvbnN0IElDT04gPSB7IGNlOiAn8J+TpicsIGZsZXg6ICfimqEnLCBmYTogJ/Cfm43vuI8nLCBwYTogJ/Cfl7wnIH07CiAgY29uc3QgcGN0ID0gZmYubGVuZ3RoID8gTWF0aC5yb3VuZChmZlByaW50ZWQgLyBmZi5sZW5ndGggKiAxMDApIDogMDsKICBib3guaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9InNzeDItaGVhZCI+CiAgICAgIDxzcGFuIGNsYXNzPSJzc3gtdCI+8J+amiAke3VpLnNoaXBEYXkgPT09ICd0b2RheScgPyAnSG95JyA6ICdQcsOzeGltbyd9PC9zcGFuPgogICAgICA8ZGl2IGNsYXNzPSJzc3gzIj4KICAgICAgJHtDQVRTLm1hcCgoW2ssIG4sIGNdKSA9PiB7IGNvbnN0IGN1dCA9IGN1dFMoZmYsIGspOyByZXR1cm4gYDxzcGFuIGNsYXNzPSJzc3gzLWMiIHN0eWxlPSItLWM6JHtjfSIgdGl0bGU9IiR7bn0ke2N1dCA/ICcgwrcgY29ydGUgJyArIGN1dCA6ICcnfSI+JHtJQ09OW2tdfTxiPiR7Y291bnQoZmYsIGspfTwvYj4ke2N1dCA/IGA8c21hbGw+4o+wJHtjdXQucmVwbGFjZSgvID8oW0FQXSlNL2ksIChtLCB4KSA9PiB4LnRvTG93ZXJDYXNlKCkpfTwvc21hbGw+YCA6ICcnfTwvc3Bhbj5gOyB9KS5qb2luKCcnKX0KICAgICAgPHNwYW4gY2xhc3M9InNzeDMtYyBzc3gzLXRvdCIgdGl0bGU9IkZ1bGZpbGxtZW50OiAke2ZmUHJpbnRlZH0gaW1wcmVzYXMgwrcgJHtmZi5sZW5ndGggLSBmZlByaW50ZWR9IHBvciBpbXByaW1pciI+8J+nujxiPiR7ZmYubGVuZ3RofTwvYj4ke2ZmLmxlbmd0aCAtIGZmUHJpbnRlZCA/IGA8c21hbGw+JHtmZi5sZW5ndGggLSBmZlByaW50ZWR9IGZhbHRhbjwvc21hbGw+YCA6ICc8c21hbGw+4pyTPC9zbWFsbD4nfTwvc3Bhbj4KICAgICAgPHNwYW4gY2xhc3M9InNzeDMtYyBzc3gzLWFsbCIgdGl0bGU9IlRvZGFzIGxhcyBldGlxdWV0YXMgZGVsIGTDrWEke2V4Y2wgPyBgIMK3ICR7ZXhjbH0gYmxvcXVlYWRhcyBhbCAxMDAlYCA6ICcnfSI+zqM8Yj4ke2xpc3QubGVuZ3RofTwvYj4ke2V4Y2wgPyBgPHNtYWxsPiR7ZXhjbH0gYmxvcS48L3NtYWxsPmAgOiAnJ308L3NwYW4+CiAgICA8L2Rpdj4KICAgICAgPHNwYW4gY2xhc3M9InNzeC1yIj4KICAgICAgPGJ1dHRvbiBjbGFzcz0ic3N4LW1vcmUiIGRhdGEtaGlzdD0iMSI+JHt1aS5zaGlwSGlzdCA/ICdPY3VsdGFyIGhpc3RvcmlhbCDilrQnIDogJ0hpc3RvcmlhbCBwb3IgZMOtYSDilr4nfTwvYnV0dG9uPgogICAgICAke2J5U2VsbGVyLmxlbmd0aCA/IGA8YnV0dG9uIGNsYXNzPSJzc3gtbW9yZSIgZGF0YS1tb3JlPSIxIj4ke3VpLnNoaXBPcGVuID8gJ09jdWx0YXIgY3VlbnRhcyDilrQnIDogJ1BvciBjdWVudGEg4pa+J308L2J1dHRvbj5gIDogJyd9CiAgICAgIDxzcGFuIGNsYXNzPSJzc3gtc3ciPjxidXR0b24gZGF0YS1zZD0idG9kYXkiIGFyaWEtcHJlc3NlZD0iJHt1aS5zaGlwRGF5ID09PSAndG9kYXknfSI+SG95PC9idXR0b24+PGJ1dHRvbiBkYXRhLXNkPSJuZXh0IiBhcmlhLXByZXNzZWQ9IiR7dWkuc2hpcERheSAhPT0gJ3RvZGF5J30iPlByw7N4aW1vPC9idXR0b24+PC9zcGFuPjwvc3Bhbj4KICAgIDwvZGl2PgogICAgJHtieVNlbGxlci5sZW5ndGggJiYgdWkuc2hpcE9wZW4gPyBgPGRpdiBjbGFzcz0ic3N4LWRldCI+JHtjb3VudFRhYmxlKGJ5U2VsbGVyLm1hcCgoW24sICwgYWxsXSkgPT4gKHsgbGFiZWw6IGVzYyhuKSwgZmY6IGNudEJ5KGFsbC5maWx0ZXIobyA9PiAhbm9uZUZmKG8pKSksIGJsOiBjbnRCeShhbGwuZmlsdGVyKG5vbmVGZikpIH0pKS5jb25jYXQoW3sgbGFiZWw6ICc8Yj5Ub3RhbDwvYj4nLCBmZjogY250QnkoZmYpLCBibDogY250QnkobGlzdC5maWx0ZXIobm9uZUZmKSksIGNsczogJ3NzLXN1bScgfV0pLCAnQ3VlbnRhJyl9PC9kaXY+YCA6ICcnfQogICAgJHt1aS5zaGlwSGlzdCA/IGA8ZGl2IGNsYXNzPSJzc3gtZGV0IiBpZD0ic2hpcEhpc3QiPjxkaXYgY2xhc3M9Im11dGVkIiBzdHlsZT0icGFkZGluZzo2cHggMnB4Ij5DYXJnYW5kbyBoaXN0b3JpYWzigKY8L2Rpdj48L2Rpdj5gIDogJyd9YDsKICBpZiAodWkuc2hpcEhpc3QpIGRyYXdTaGlwSGlzdG9yeSgpOwogIGJveC5vbmNsaWNrID0gZSA9PiB7IGlmIChlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1oaXN0XScpKSB7IHVpLnNoaXBIaXN0ID0gIXVpLnNoaXBIaXN0OyBkcmF3U2hpcFN1bW1hcnkoKTsgcmV0dXJuOyB9IGlmIChlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1tb3JlXScpKSB7IHVpLnNoaXBPcGVuID0gIXVpLnNoaXBPcGVuOyBkcmF3U2hpcFN1bW1hcnkoKTsgcmV0dXJuOyB9IGNvbnN0IGIgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1zZF0nKTsgaWYgKCFiKSByZXR1cm47IHVpLnNoaXBEYXkgPSBiLmRhdGFzZXQuc2Q7IGRyYXdTaGlwU3VtbWFyeSgpOyB9Owp9CgpmdW5jdGlvbiBkcmF3Um93cyhmcmVzaCA9IFtdKSB7CiAgaWYgKCEkKCcjdGFic0JpZycpKSByZXR1cm47CiAgZHJhd1NoaXBTdW1tYXJ5KCk7CiAgY29uc3QgaW5UYWIgPSB0ID0+IG9yZGVycy5maWx0ZXIobyA9PiBpblRhYkZuKG8sIHQpICYmIG1rTWF0Y2gobywgdWkubWspICYmIHNlbGxlck9rKG8pKTsKICBjb25zdCB0YWJzTGlzdCA9IFRBQlM7IC8vIHRvZGFzIGxhcyBzZWNjaW9uZXMgcGFyYSB0b2RvcyAoZWwgZnVsZmlsbG1lbnQgdGFtYmnDqW4gdmUgIkJsb3F1ZWFkYXMgaW1wcmVzYXMiKQogIGlmICghdGFic0xpc3Quc29tZSgoW2tdKSA9PiBrID09PSB1aS50YWIpKSB1aS50YWIgPSAndG9kYXknOwogICQoJyN0YWJzQmlnJykuaW5uZXJIVE1MID0gdGFic0xpc3QubWFwKChbaywgbiwgc3ViLCBpY10pID0+IGA8YnV0dG9uIGNsYXNzPSJ0YiB0Yi0ke2t9ICR7KGsgPT09ICd3YXJuJyB8fCBrID09PSAnbGF0ZScpICYmIGluVGFiKGspLmxlbmd0aCA/ICd0Yi1hbGVydCcgOiAnJ30iIGRhdGEtdGFiMj0iJHtrfSIgYXJpYS1wcmVzc2VkPSIke3VpLnRhYiA9PT0ga30iPjxzcGFuIGNsYXNzPSJ0Yi1pYyI+JHtpY308L3NwYW4+PHNwYW4+PGI+JHtpblRhYihrKS5sZW5ndGh9PC9iPjxzcGFuIGNsYXNzPSJ0Yi1uIj4ke259PC9zcGFuPjxzbWFsbD4ke3N1Yn08L3NtYWxsPjwvc3Bhbj48L2J1dHRvbj5gKS5qb2luKCcnKTsKICAvLyBsYXMgY2FudGlkYWRlcyByZXNwZXRhbiBlbCB2ZW5kZWRvciBlbGVnaWRvIHkgbGEgYsO6c3F1ZWRhCiAgY29uc3QgcU9rID0gbyA9PiAhdWkucSB8fCBvLm9yZGVyX251bWJlci50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHVpLnEpIHx8IChvLmN1c3RvbWVyIHx8ICcnKS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHVpLnEpIHx8IG8uaXRlbXMuc29tZShpID0+IFtpLnNrdSwgaS5wdWJfaWQsIGkubmFtZV0uam9pbignICcpLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXModWkucSkpOwogIGNvbnN0IG1rQ291bnQgPSBtayA9PiBvcmRlcnMuZmlsdGVyKG8gPT4gaW5UYWJGbihvLCB1aS50YWIpICYmIG1rTWF0Y2gobywgbWspICYmIHNlbGxlck9rKG8pICYmIHFPayhvKSkubGVuZ3RoOwogIGNvbnN0IGNoaXAgPSAoW2ssIG5dKSA9PiBgPGJ1dHRvbiBjbGFzcz0iY2hpcCBjaGlwLSR7a30iIGRhdGEtbWs9IiR7a30iIGFyaWEtcHJlc3NlZD0iJHt1aS5tayA9PT0ga30iPiR7bn0gPHNwYW4gY2xhc3M9ImNudCI+JHtta0NvdW50KGspfTwvc3Bhbj48L2J1dHRvbj5gOwogIGlmICh1aS5tayA9PT0gJ21sJykgdWkubWsgPSAnYWxsJzsgLy8gZWwgZmlsdHJvICJNZXJjYWRvIExpYnJlIiBzZSBxdWl0w7M6IGVzdMOhIHNlcGFyYWRvIGVuIEFnZW5jaWEgeSBGbGV4CiAgJCgnI21rQ2hpcHMnKS5pbm5lckhUTUwgPSBbWydhbGwnLCAnVG9kb3MnXV0ubWFwKGNoaXApLmpvaW4oJycpICsgYDxzcGFuIGNsYXNzPSJjaGlwLWdycCI+JHtbWydtbC1hZ2VuY2lhJywgJ/Cfk6YgTUwgQWdlbmNpYSddLCBbJ21sLWZsZXgnLCAn4pqhIE1MIEZsZXgnXV0ubWFwKGNoaXApLmpvaW4oJycpfTwvc3Bhbj5gICsgW1snZmEnLCAn8J+bje+4jyBGYWxhYmVsbGEnXSwgWydwYScsICfwn5e8IFBhcmlzJ11dLm1hcChjaGlwKS5qb2luKCcnKTsKICBjb25zdCBicCA9ICQoJyNicEZpbHRlcicpOwogIGlmIChicCkgewogICAgYnAuaGlkZGVuID0gIVsnYmxvY2tlZFByaW50ZWQnLCAnYmxvY2tlZCcsICd1bmJsb2NrZWQnXS5pbmNsdWRlcyh1aS50YWIpOwogICAgaWYgKHVpLnRhYiA9PT0gJ3VuYmxvY2tlZCcpIHsKICAgICAgLy8gRGVzYmxvcXVlYWRhczogc2VwYXJhciBsYXMgcXVlIHNlIGRlc3BhY2hhbiBob3kgZGUgbGFzIGRlIHByw7N4aW1vcyBkw61hcyAocGFyYSB0b2RvcyBsb3MgdXN1YXJpb3MpCiAgICAgIGNvbnN0IGJhc2UgPSB2aXNpYmxlSW4oJ3VuYmxvY2tlZCcpLCBuVG9kYXkgPSBiYXNlLmZpbHRlcihpc0ZvclRvZGF5KS5sZW5ndGg7CiAgICAgIGNvbnN0IGJ5RGF5ID0gYmFzZS5maWx0ZXIobyA9PiB1aS51ZGYgPT09ICdhbGwnIHx8ICh1aS51ZGYgPT09ICd0b2RheScpID09PSBpc0ZvclRvZGF5KG8pKSwgbkZpbGwgPSBieURheS5maWx0ZXIobyA9PiBicEtpbmQobykgPT09ICdmaWxsJykubGVuZ3RoOwogICAgICBicC5pbm5lckhUTUwgPSBgPHNwYW4gY2xhc3M9ImJwZi10Ij5EZXNwYWNobzo8L3NwYW4+YCArIFtbJ2FsbCcsICdUb2RhcycsIGJhc2UubGVuZ3RoXSwgWyd0b2RheScsICdEZXNwYWNoYXIgaG95JywgblRvZGF5XSwgWyduZXh0JywgJ1Byw7N4aW1vcyBkw61hcycsIGJhc2UubGVuZ3RoIC0gblRvZGF5XV0KICAgICAgICAubWFwKChbaywgbiwgY10pID0+IGA8YnV0dG9uIGNsYXNzPSJjaGlwICR7ayA9PT0gJ3RvZGF5JyA/ICdjaGlwLWZpbGwnIDogJyd9IiBkYXRhLXVkZj0iJHtrfSIgYXJpYS1wcmVzc2VkPSIke3VpLnVkZiA9PT0ga30iPiR7bn0gPHNwYW4gY2xhc3M9ImNudCI+JHtjfTwvc3Bhbj48L2J1dHRvbj5gKS5qb2luKCcnKSArCiAgICAgICAgYDxzcGFuIGNsYXNzPSJicGYtc2VwIj48L3NwYW4+PHNwYW4gY2xhc3M9ImJwZi10Ij5GdWxmaWxsbWVudDo8L3NwYW4+YCArIFtbJ2FsbCcsICdUb2RhcycsIGJ5RGF5Lmxlbmd0aF0sIFsnZmlsbCcsICdEZWJlIHJlbGxlbmFyJywgbkZpbGxdLCBbJ25vbmUnLCAnTmFkYSBwYXJhIHJlbGxlbmFyJywgYnlEYXkubGVuZ3RoIC0gbkZpbGxdXQogICAgICAgIC5tYXAoKFtrLCBuLCBjXSkgPT4gYDxidXR0b24gY2xhc3M9ImNoaXAgJHtrID09PSAnZmlsbCcgPyAnY2hpcC1maWxsJyA6ICcnfSIgZGF0YS11YmY9IiR7a30iIGFyaWEtcHJlc3NlZD0iJHt1aS51YmYgPT09IGt9Ij4ke259IDxzcGFuIGNsYXNzPSJjbnQiPiR7Y308L3NwYW4+PC9idXR0b24+YCkuam9pbignJyk7CiAgICAgIGJwLm9uY2xpY2sgPSBlID0+IHsgY29uc3QgYiA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLXVkZl0sW2RhdGEtdWJmXScpOyBpZiAoIWIpIHJldHVybjsgaWYgKGIuZGF0YXNldC51ZGYpIHVpLnVkZiA9IGIuZGF0YXNldC51ZGY7IGVsc2UgdWkudWJmID0gYi5kYXRhc2V0LnViZjsgZHJhd1Jvd3MoKTsgfTsKICAgIH0gZWxzZSBpZiAodWkudGFiID09PSAnYmxvY2tlZCcpIHsKICAgICAgLy8gQmxvcXVlYWRhczogc2VwYXJhciBsYXMgcXVlIHNlIGRlc3BhY2hhbiBob3kgZGUgbGFzIGRlIHByw7N4aW1vcyBkw61hcwogICAgICBjb25zdCBiYXNlID0gdmlzaWJsZUluKCdibG9ja2VkJyksIG5Ub2RheSA9IGJhc2UuZmlsdGVyKGlzRm9yVG9kYXkpLmxlbmd0aDsKICAgICAgY29uc3QgYnlEYXkgPSBiYXNlLmZpbHRlcihvID0+IHVpLmJkZiA9PT0gJ2FsbCcgfHwgKHVpLmJkZiA9PT0gJ3RvZGF5JykgPT09IGlzRm9yVG9kYXkobykpLCBuRmlsbCA9IGJ5RGF5LmZpbHRlcihvID0+IGJwS2luZChvKSA9PT0gJ2ZpbGwnKS5sZW5ndGg7CiAgICAgIGJwLmlubmVySFRNTCA9IGA8c3BhbiBjbGFzcz0iYnBmLXQiPkRlc3BhY2hvOjwvc3Bhbj5gICsgW1snYWxsJywgJ1RvZGFzJywgYmFzZS5sZW5ndGhdLCBbJ3RvZGF5JywgJ0Rlc3BhY2hhciBob3knLCBuVG9kYXldLCBbJ25leHQnLCAnUHLDs3hpbW9zIGTDrWFzJywgYmFzZS5sZW5ndGggLSBuVG9kYXldXQogICAgICAgIC5tYXAoKFtrLCBuLCBjXSkgPT4gYDxidXR0b24gY2xhc3M9ImNoaXAgJHtrID09PSAndG9kYXknID8gJ2NoaXAtZmlsbCcgOiAnJ30iIGRhdGEtYmRmPSIke2t9IiBhcmlhLXByZXNzZWQ9IiR7dWkuYmRmID09PSBrfSI+JHtufSA8c3BhbiBjbGFzcz0iY250Ij4ke2N9PC9zcGFuPjwvYnV0dG9uPmApLmpvaW4oJycpICsKICAgICAgICBgPHNwYW4gY2xhc3M9ImJwZi1zZXAiPjwvc3Bhbj48c3BhbiBjbGFzcz0iYnBmLXQiPkZ1bGZpbGxtZW50Ojwvc3Bhbj5gICsgW1snYWxsJywgJ1RvZGFzJywgYnlEYXkubGVuZ3RoXSwgWydmaWxsJywgJ0RlYmUgcmVsbGVuYXInLCBuRmlsbF0sIFsnbm9uZScsICdOYWRhIHBhcmEgZWwgZnVsZmlsbG1lbnQnLCBieURheS5sZW5ndGggLSBuRmlsbF1dCiAgICAgICAgLm1hcCgoW2ssIG4sIGNdKSA9PiBgPGJ1dHRvbiBjbGFzcz0iY2hpcCAke2sgPT09ICdmaWxsJyA/ICdjaGlwLWZpbGwnIDogJyd9IiBkYXRhLWJiZj0iJHtrfSIgYXJpYS1wcmVzc2VkPSIke3VpLmJiZiA9PT0ga30iPiR7bn0gPHNwYW4gY2xhc3M9ImNudCI+JHtjfTwvc3Bhbj48L2J1dHRvbj5gKS5qb2luKCcnKTsKICAgICAgYnAub25jbGljayA9IGUgPT4geyBjb25zdCBiID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtYmRmXSxbZGF0YS1iYmZdJyk7IGlmICghYikgcmV0dXJuOyBpZiAoYi5kYXRhc2V0LmJkZikgdWkuYmRmID0gYi5kYXRhc2V0LmJkZjsgZWxzZSB1aS5iYmYgPSBiLmRhdGFzZXQuYmJmOyBkcmF3Um93cygpOyB9OwogICAgfSBlbHNlIGlmICghYnAuaGlkZGVuKSB7CiAgICAgIGNvbnN0IGJhc2UgPSB2aXNpYmxlSW4oJ2Jsb2NrZWRQcmludGVkJyksIG5GaWxsID0gYmFzZS5maWx0ZXIobyA9PiBicEtpbmQobykgPT09ICdmaWxsJykubGVuZ3RoOwogICAgICBicC5pbm5lckhUTUwgPSBgPHNwYW4gY2xhc3M9ImJwZi10Ij5Nb3N0cmFyOjwvc3Bhbj5gICsgW1snYWxsJywgJ1RvZGFzJywgYmFzZS5sZW5ndGhdLCBbJ2ZpbGwnLCAnRWwgZnVsZmlsbG1lbnQgZGViZSByZWxsZW5hcicsIG5GaWxsXSwgWydub25lJywgJ05hZGEgcGFyYSBlbCBmdWxmaWxsbWVudCcsIGJhc2UubGVuZ3RoIC0gbkZpbGxdXQogICAgICAgIC5tYXAoKFtrLCBuLCBjXSkgPT4gYDxidXR0b24gY2xhc3M9ImNoaXAgJHtrID09PSAnZmlsbCcgPyAnY2hpcC1maWxsJyA6ICcnfSIgZGF0YS1icGY9IiR7a30iIGFyaWEtcHJlc3NlZD0iJHt1aS5icGYgPT09IGt9Ij4ke259IDxzcGFuIGNsYXNzPSJjbnQiPiR7Y308L3NwYW4+PC9idXR0b24+YCkuam9pbignJyk7CiAgICAgIGJwLm9uY2xpY2sgPSBlID0+IHsgY29uc3QgYiA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLWJwZl0nKTsgaWYgKCFiKSByZXR1cm47IHVpLmJwZiA9IGIuZGF0YXNldC5icGY7IGRyYXdSb3dzKCk7IH07CiAgICB9CiAgfQogIGNvbnN0IHJvd3MgPSB2aXNpYmxlKCk7CiAgaWYgKCFyb3dzLmxlbmd0aCkgewogICAgY29uc3QgbXNnID0geyB0b2RheTogJ05vIGhheSBldGlxdWV0YXMgcG9yIGltcHJpbWlyIHBhcmEgaG95LiBMYXMgdmVudGFzIG51ZXZhcyAoeSBsb3MgRmxleCBxdWUgZW50cmVuIGR1cmFudGUgZWwgZMOtYSkgYXBhcmVjZW4gYXF1w60gc29sYXMuJywgdXBjb21pbmc6ICdObyBoYXkgZXRpcXVldGFzIHBhcmEgbG9zIHByw7N4aW1vcyBkw61hcy4nLCB3YWl0aW5nOiAnTmluZ3VuYSB2ZW50YSBlc3TDoSBlc3BlcmFuZG8gZXRpcXVldGEuJywgcHJpbnRlZDogJ1RvZGF2w61hIG5vIGhheSBldGlxdWV0YXMgaW1wcmVzYXMgcGFyYSBlc3RlIGRlc3BhY2hvLicsIGJsb2NrZWQ6ICdObyBoYXkgcGVkaWRvcyBibG9xdWVhZG9zLicsIHVuYmxvY2tlZDogJ05vIGhheSBldGlxdWV0YXMgZGVzYmxvcXVlYWRhcyBwZW5kaWVudGVzLiBDdWFuZG8gZGVzYmxvcXVlZXMgdW5hLCBhcGFyZWNlIGFxdcOtIGhhc3RhIHF1ZSBzZSBpbXByaW1hLicsIHdlZWs6ICdFc3RhIHNlbWFuYSBhw7puIG5vIHNlIGltcHJpbWVuIGV0aXF1ZXRhcy4nLCBibG9ja2VkUHJpbnRlZDogJ05vIGhheSBldGlxdWV0YXMgYmxvcXVlYWRhcyBpbXByZXNhcyBwYXJhIGVzdGUgZGVzcGFjaG8uJywgcHJpbnRlZDc6ICdObyBoYXkgZXRpcXVldGFzIGltcHJlc2FzIGVuIGxvcyDDumx0aW1vcyA3IGTDrWFzLicsIHRyYW5zaXQ6ICdObyBoYXkgcGFxdWV0ZXMgZW4gY2FtaW5vOiB0b2RvIGxvIGltcHJlc28geWEgZnVlIHJlY2VwY2lvbmFkbyBvIGVudHJlZ2Fkby4nLCBsYXRlOiAnTm8gaGF5IHBhcXVldGVzIGF0cmFzYWRvcy4gQXF1w60gYXBhcmVjZW4gbG9zIHF1ZSBubyBzYWxpZXJvbiBhbnRlcyBkZWwgaG9yYXJpbyBkZWwgbWFya2V0cGxhY2UuJywgd2FybjogJ1RvZG8gYSB0aWVtcG8g8J+OiS4gQXF1w60gYXBhcmVjZSBjdWFscXVpZXIgcGFxdWV0ZSBhbCBxdWUgbGUgcXVlZGVuIDMwIG1pbnV0b3MgbyBtZW5vcyBwYXJhIHN1IHBsYXpvLCBwYXJhIGFsY2FuemFyIGEgc29sdWNpb25hcmxvLicgfVt1aS50YWJdOwogICAgJCgnI2xpc3QnKS5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz0iZW1wdHkiPiR7RU1QVFlfU1ZHfTxkaXY+JHttc2d9PC9kaXY+PC9kaXY+YDsKICAgIGRyYXdBY3Rpb25iYXIoKTsgcmV0dXJuOwogIH0KICBsZXQgbGFzdERheSA9ICcnLCBodG1sID0gJyc7CiAgZm9yIChjb25zdCBvIG9mIHJvd3MpIHsKICAgIGNvbnN0IGQgPSB0cyhvKSwgZGF5ID0gZGF5TGFiZWwoZCk7CiAgICBpZiAoZGF5ICE9PSBsYXN0RGF5KSB7IGh0bWwgKz0gYDxkaXYgY2xhc3M9ImRheWhlYWQiPiR7ZXNjKGRheSl9PC9kaXY+YDsgbGFzdERheSA9IGRheTsgfQogICAgY29uc3Qgc3QgPSBvLnN0YXRlOwogICAgbGV0IG5vdGUgPSAnJywgYnRuID0gJyc7CiAgICBjb25zdCBtaW5lID0gby5vd24gIT09IGZhbHNlOwogICAgaWYgKHN0ID09PSAncmVhZHknKSBidG4gPSBgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiBkYXRhLWFjdD0icHJpbnQiIGRhdGEtaWQ9IiR7by5pZH0iPiR7SS5wcmludH1JbXByaW1pcjwvYnV0dG9uPmA7CiAgICBpZiAoc3QgPT09ICdwcmludGVkJykgeyBub3RlID0gYDxzcGFuIGNsYXNzPSJub3RlIj5JbXByZXNhICR7ZXNjKGZtdFRpbWUoby5wcmludGVkX2F0KSl9JHtvLnByaW50ZWRfYnkgPyBgIMK3IDxiPkltcHJpbWnDszogJHtlc2Moby5wcmludGVkX2J5KX08L2I+YCA6ICcnfTwvc3Bhbj5gOyBidG4gPSBgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1yZXByaW50IiBkYXRhLWFjdD0icmVwcmludCIgZGF0YS1pZD0iJHtvLmlkfSI+JHtJLnByaW50fVZvbHZlciBhIGltcHJpbWlyPC9idXR0b24+YCArIChtaW5lID8gYDxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtYWN0PSJ1bnByaW50IiBkYXRhLWlkPSIke28uaWR9Ij5NYXJjYXIgY29tbyBubyBpbXByZXNhPC9idXR0b24+YCA6ICcnKTsgfQogICAgaWYgKHN0ID09PSAnc2hpcHBlZCcpIG5vdGUgPSBgPHNwYW4gY2xhc3M9Im5vdGUiPllhIHNhbGnDsyDCtyA8Yj5JbXByaW1pw7M6ICR7ZXNjKG8ucHJpbnRlZF9ieSB8fCAnTWFya2V0cGxhY2UnKX08L2I+PC9zcGFuPmA7CiAgICBpZiAoc3QgPT09ICd3YWl0aW5nJyB8fCBzdCA9PT0gJ2Vycm9yJykgeyBub3RlID0gYDxzcGFuIGNsYXNzPSJub3RlICR7c3QgPT09ICdlcnJvcicgPyAnYmFkJyA6ICcnfSI+JHtlc2Moby5lcnJvciB8fCBvLndhaXRpbmdfbm90ZSB8fCAnRWwgbWFya2V0cGxhY2UgYcO6biBubyBsaWJlcmEgbGEgZXRpcXVldGEnKX08L3NwYW4+YDsgYnRuID0gYDxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtYWN0PSJyZXRyeSIgZGF0YS1pZD0iJHtvLmlkfSI+UmVpbnRlbnRhcjwvYnV0dG9uPmA7IH0KICAgIGNvbnN0IG5vbmVGb3JGZiA9IChvLm1pc3NpbmdfaWR4IHx8IFtdKS5sZW5ndGggPiAwICYmIChvLm1pc3NpbmdfaWR4IHx8IFtdKS5sZW5ndGggPj0gby5pdGVtcy5sZW5ndGg7CiAgICBpZiAoc3QgPT09ICdibG9ja2VkJykgeyBub3RlID0gbm9uZUZvckZmID8gJzxzcGFuIGNsYXNzPSJub3ByaW50Ij5ST05HIFhJTiBOTyBJTVBSSU1JUiBFVElRVUVUQTwvc3Bhbj4nIDogJzxzcGFuIGNsYXNzPSJub3RlIj5UaWVuZSBwcm9kdWN0b3MgcXVlIG5vIHZhbiBhbCBmdWxmaWxsbWVudDogbWFuZGEgc29sbyBsb3MgbWFyY2Fkb3MgZW4gdmVyZGU8L3NwYW4+JzsgaWYgKG1pbmUpIGJ0biA9IGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIGRhdGEtYWN0PSJ1bmJsb2NrIiBkYXRhLWlkPSIke28uaWR9Ij4ke0kubG9ja31EZXNibG9xdWVhciBldGlxdWV0YTwvYnV0dG9uPmA7IH0KICAgIGlmIChvLnVuYmxvY2tlZF9ieSAmJiBvLmJsb2NrX25vICYmIHN0ICE9PSAnYmxvY2tlZCcpIHsKICAgICAgbm90ZSArPSBgPHNwYW4gY2xhc3M9Im5vdGUiPjxiPlBlZGlkbyBpbmNvbXBsZXRvPC9iPjogZWwgZnVsZmlsbG1lbnQgbWFuZGEgbG8gc3V5byB5IHNlIHJlbGxlbmEgbG8gbWFyY2FkbyAiRkFMVEEiIMK3IERlc2Jsb3F1ZcOzOiAke2VzYyhvLnVuYmxvY2tlZF9ieSl9PC9zcGFuPmA7CiAgICAgIGlmIChtaW5lICYmIFsncmVhZHknLCAnd2FpdGluZycsICdlcnJvciddLmluY2x1ZGVzKHN0KSkgYnRuICs9IGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWFjdD0icmVibG9jayIgZGF0YS1pZD0iJHtvLmlkfSI+Vm9sdmVyIGEgYmxvcXVlYXI8L2J1dHRvbj5gOwogICAgfQogICAgaWYgKG8ucHJldl9wcmludCAmJiBvLnByZXZfcHJpbnQuYXQpIG5vdGUgKz0gYDxzcGFuIGNsYXNzPSJub3RlIHByZXZwcmludCI+4oa6IFlhIGZ1ZSBpbXByZXNhIHBvciA8Yj4ke2VzYyhvLnByZXZfcHJpbnQuYnkgfHwgJ2FsZ3VpZW4nKX08L2I+IGVsICR7ZXNjKGZtdFRpbWUoby5wcmV2X3ByaW50LmF0KSl9PC9zcGFuPmA7CiAgICBpZiAoby5tbF9kb3dubG9hZGVkKSBub3RlICs9ICc8c3BhbiBjbGFzcz0ibm90ZSIgdGl0bGU9Ik1lcmNhZG8gTGlicmUgaW5kaWNhIHF1ZSBsYSBldGlxdWV0YSB5YSBzZSBkZXNjYXJnw7MgKGRlc2RlIE1lcmNhZG8gTGlicmUgdSBvdHJhIGhlcnJhbWllbnRhKS4gRW4gRXRpcXVldGFIdWIgc2lndWUgcG9yIGltcHJpbWlyLiI+4pOYIERlc2NhcmdhZGEgZW4gTWVyY2FkbyBMaWJyZTwvc3Bhbj4nOwogICAgaWYgKGxhdGVOb3cobykpIG5vdGUgPSBgPHNwYW4gY2xhc3M9ImxhdGV0YWciPkFUUkFTQURBJHtvLmxhdGVfbWwgPyAnIMK3IE1lcmNhZG8gTGlicmUgbGEgbWFyY2EgYXRyYXNhZGEnIDogJyd9JHtvLmRlYWRsaW5lIHx8IG8uZGwgPyAnIMK3IHBsYXpvICcgKyBlc2MoZm10VGltZShvLmRlYWRsaW5lIHx8IG8uZGwpKSA6ICcnfTwvc3Bhbj5gICsgbm90ZTsKICAgIGVsc2UgaWYgKGlzV2FybihvKSkgbm90ZSA9IGA8c3BhbiBjbGFzcz0id2FybnRhZyI+4o+zIEFEVkVSVEVOQ0lBIMK3IHF1ZWRhbiAke21pbnNMZWZ0KG8pfSBtaW4gwrcgcGxhem8gJHtlc2MoZm10VGltZShvLmRsKSl9PC9zcGFuPmAgKyBub3RlOwogICAgaHRtbCArPSBgPGRpdiBjbGFzcz0ib3JvdyBzdC0ke3N0fSAke2ZyZXNoLmluY2x1ZGVzKG8uaWQpID8gJ2lzLW5ldycgOiAnJ30iPgogICAgICA8ZGl2IGNsYXNzPSJvYy1jaGVjayI+JHtwcmludGFibGUobykgfHwgKHN0ID09PSAncHJpbnRlZCcgJiYgby5vd24gIT09IGZhbHNlKSA/IGA8aW5wdXQgdHlwZT0iY2hlY2tib3giIGNsYXNzPSJjYiIgZGF0YS1pZD0iJHtvLmlkfSIgJHtzZWxlY3RlZC5oYXMoby5pZCkgPyAnY2hlY2tlZCcgOiAnJ30gYXJpYS1sYWJlbD0iU2VsZWNjaW9uYXIgJHtlc2Moby5vcmRlcl9udW1iZXIpfSI+YCA6IHN0ID09PSAnYmxvY2tlZCcgPyAobWluZSA/IGA8aW5wdXQgdHlwZT0iY2hlY2tib3giIGNsYXNzPSJjYiIgZGF0YS1pZD0iJHtvLmlkfSIgJHtzZWxlY3RlZC5oYXMoby5pZCkgPyAnY2hlY2tlZCcgOiAnJ30gYXJpYS1sYWJlbD0iU2VsZWNjaW9uYXIgJHtlc2Moby5vcmRlcl9udW1iZXIpfSBwYXJhIGRlc2Jsb3F1ZWFyIj5gIDogYDxzcGFuIGNsYXNzPSJsb2NrY2VsbCI+JHtJLmxvY2t9PC9zcGFuPmApIDogJyd9PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9Im9jLXRpbWUiPjxiPiR7ZXNjKGFtcG0oZCkpfTwvYj48c3BhbiBjbGFzcz0ibWsgJHtvLm1hcmtldHBsYWNlfSI+JHtNS1tvLm1hcmtldHBsYWNlXSB8fCBvLm1hcmtldHBsYWNlfTwvc3Bhbj4ke28uc2hpcF90eXBlID8gYDxzcGFuIGNsYXNzPSJzaGlwdHlwZSBzdC0ke2VzYyhvLnNoaXBfdHlwZS50b0xvd2VyQ2FzZSgpKX0iPiR7ZXNjKG8uc2hpcF90eXBlKX08L3NwYW4+YCA6ICcnfTwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJvYy1tYWluIj4ke1sncmVhZHknLCAnd2FpdGluZycsICdlcnJvciddLmluY2x1ZGVzKHN0KSAmJiBkaXNwYXRjaFRleHQobykgPyBgPGRpdiBjbGFzcz0iZGlzcGF0Y2ggJHtkaXNwYXRjaFRleHQobykuc3RhcnRzV2l0aCgnQXRyYXNhZGEnKSA/ICdsYXRlJyA6ICcnfSI+JHtlc2MoZGlzcGF0Y2hUZXh0KG8pKX08L2Rpdj5gIDogZGlzcGF0Y2hQbGFpbihvKSA/IGA8ZGl2IGNsYXNzPSJkaXNwYXRjaCBkb25lIj4ke2VzYyhkaXNwYXRjaFBsYWluKG8pKX08L2Rpdj5gIDogJyd9PGRpdiBjbGFzcz0ib2MtdG9wIj4ke28uYmxvY2tfbm8gPyBgPHNwYW4gY2xhc3M9ImJsb2Nrbm8iIHRpdGxlPSJOw7ptZXJvIGRlbCBwZWRpZG8gaW5jb21wbGV0byI+TsKwICR7by5ibG9ja19ub308L3NwYW4+YCA6ICcnfSR7by5jdXN0b21lciA/IGA8c3BhbiBjbGFzcz0iY3VzdCI+JHtlc2Moby5jdXN0b21lcil9PC9zcGFuPmAgOiAnJ308Yj4ke2VzYyhvLnNlbGxlcil9PC9iPiA8c3BhbiBjbGFzcz0ibW9ubyBtdXRlZCI+IyR7ZXNjKG8ub3JkZXJfbnVtYmVyKX08L3NwYW4+PC9kaXY+JHtpdGVtc0hUTUwobyl9JHtub3RlfTwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJvYy1hY3QiPiR7cGlsbChvKX08ZGl2IGNsYXNzPSJyb3ctYWN0aW9ucyI+JHtidG59JHtvLnRyYWNrX3VybCA/IGA8YSBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgaHJlZj0iJHtlc2Moby50cmFja191cmwpfSIgdGFyZ2V0PSJfYmxhbmsiIHJlbD0ibm9vcGVuZXIiPlNlZ3VpciBlbnbDrW88L2E+YCA6ICcnfTwvZGl2PiR7by50cmFja2luZyA/IGA8c3BhbiBjbGFzcz0ibm90ZSBtb25vIj5OwrAgc2VndWltaWVudG8gJHtlc2Moby50cmFja2luZyl9PC9zcGFuPmAgOiAnJ308L2Rpdj4KICAgIDwvZGl2PmA7CiAgfQogICQoJyNsaXN0JykuaW5uZXJIVE1MID0gaHRtbDsKICBkcmF3QWN0aW9uYmFyKCk7Cn0KZnVuY3Rpb24gZHJhd0FjdGlvbmJhcigpIHsKICBjb25zdCBhYiA9ICQoJyNhY3Rpb25iYXInKTsgaWYgKCFhYikgcmV0dXJuOwogIGNvbnN0IFBSSU5URURfVEFCUyA9IFsncHJpbnRlZCcsICd0cmFuc2l0JywgJ2Jsb2NrZWRQcmludGVkJywgJ3ByaW50ZWQ3JywgJ2xhdGUnXTsKICBpZiAoUFJJTlRFRF9UQUJTLmluY2x1ZGVzKHVpLnRhYikpIHsKICAgIC8vIGVuIGxhcyBzZWNjaW9uZXMgZGUgaW1wcmVzYXM6IG1hcmNhciB2YXJpYXMgYSBsYSB2ZXogY29tbyAibm8gaW1wcmVzYXMiCiAgICBjb25zdCBuID0gdmlzaWJsZUluKHVpLnRhYikuZmlsdGVyKG8gPT4gby5zdGF0ZSA9PT0gJ3ByaW50ZWQnICYmIG8ub3duICE9PSBmYWxzZSkubGVuZ3RoLCBzID0gWy4uLnNlbGVjdGVkXS5maWx0ZXIoaWQgPT4gb3JkZXJzLmZpbmQobyA9PiBvLmlkID09PSBpZCAmJiBvLnN0YXRlID09PSAncHJpbnRlZCcpKS5sZW5ndGg7CiAgICBhYi5oaWRkZW4gPSAhbjsKICAgIGFiLmlubmVySFRNTCA9IG4gPyBgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIiBkYXRhLWJ1bGs9InVucHJpbnQiICR7cyA/ICcnIDogJ2Rpc2FibGVkJ30+TWFyY2FyIHNlbGVjY2lvbmFkYXMgY29tbyBubyBpbXByZXNhcyAoJHtzfSk8L2J1dHRvbj4KICAgICAgPHNwYW4gY2xhc3M9InNwYWNlciIgc3R5bGU9ImZsZXg6MSI+PC9zcGFuPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWJ1bGs9InNlbGFsbCI+U2VsZWNjaW9uYXIgdG9kYXM8L2J1dHRvbj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWJ1bGs9Im5vbmUiPlF1aXRhciBzZWxlY2Npw7NuPC9idXR0b24+YCA6ICcnOwogICAgcmV0dXJuOwogIH0KICBpZiAodWkudGFiID09PSAnYmxvY2tlZCcpIHsKICAgIC8vIGRlc2Jsb3F1ZWFyIHZhcmlhcyBhIGxhIHZleiAocmVzcGV0YSBsb3MgZmlsdHJvcyBkZSBtYXJrZXRwbGFjZSwgdmVuZGVkb3IgeSBiw7pzcXVlZGEpCiAgICBjb25zdCBuID0gdmlzaWJsZSgpLmZpbHRlcihvID0+IG8uc3RhdGUgPT09ICdibG9ja2VkJyAmJiBvLm93biAhPT0gZmFsc2UpLmxlbmd0aCwgcyA9IFsuLi5zZWxlY3RlZF0uZmlsdGVyKGlkID0+IG9yZGVycy5maW5kKG8gPT4gby5pZCA9PT0gaWQgJiYgby5zdGF0ZSA9PT0gJ2Jsb2NrZWQnKSkubGVuZ3RoOwogICAgYWIuaGlkZGVuID0gIW47CiAgICBhYi5pbm5lckhUTUwgPSBuID8gYDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgZGF0YS1idWxrPSJ1bmJsb2NrIiAke3MgPyAnJyA6ICdkaXNhYmxlZCd9PiR7SS5sb2NrfURlc2Jsb3F1ZWFyIHNlbGVjY2lvbmFkYXMgKCR7c30pPC9idXR0b24+CiAgICAgIDxzcGFuIGNsYXNzPSJzcGFjZXIiIHN0eWxlPSJmbGV4OjEiPjwvc3Bhbj4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1idWxrPSJzZWxhbGwiPlNlbGVjY2lvbmFyIHRvZGFzICgke259KTwvYnV0dG9uPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtYnVsaz0ibm9uZSI+UXVpdGFyIHNlbGVjY2nDs248L2J1dHRvbj5gIDogJyc7CiAgICByZXR1cm47CiAgfQogIGlmICghWyd0b2RheScsICd1cGNvbWluZycsICd1bmJsb2NrZWQnXS5pbmNsdWRlcyh1aS50YWIpKSB7IGFiLmlubmVySFRNTCA9ICcnOyBhYi5oaWRkZW4gPSB0cnVlOyByZXR1cm47IH0KICBhYi5oaWRkZW4gPSBmYWxzZTsKICAvLyB0b2RvcyBsb3MgdXN1YXJpb3MgdGllbmVuIGxvcyBtaXNtb3MgYm90b25lcyAoZWwgdmVuZGVkb3Igc29sbyBpbXByaW1lIGxhcyBzdXlhcykKICBjb25zdCBuID0gdmlzaWJsZSgpLmZpbHRlcihwcmludGFibGUpLmxlbmd0aCwgcyA9IFsuLi5zZWxlY3RlZF0uZmlsdGVyKGlkID0+IG9yZGVycy5zb21lKG8gPT4gby5pZCA9PT0gaWQgJiYgcHJpbnRhYmxlKG8pKSkubGVuZ3RoOwogIGFiLmlubmVySFRNTCA9IGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIGRhdGEtYnVsaz0iYWxsIiAke24gPyAnJyA6ICdkaXNhYmxlZCd9PiR7SS5kb3dufUltcHJpbWlyIHRvZGFzICgke259KTwvYnV0dG9uPgogICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIiBkYXRhLWJ1bGs9InNlbCIgJHtzID8gJycgOiAnZGlzYWJsZWQnfT5JbXByaW1pciBzZWxlY2Npb25hZGFzICgke3N9KTwvYnV0dG9uPgogICAgPHNwYW4gY2xhc3M9InNwYWNlciIgc3R5bGU9ImZsZXg6MSI+PC9zcGFuPgogICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1idWxrPSJzZWxhbGwiPlNlbGVjY2lvbmFyIHRvZGFzPC9idXR0b24+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1idWxrPSJub25lIj5RdWl0YXIgc2VsZWNjacOzbjwvYnV0dG9uPmA7Cn0KZnVuY3Rpb24gdXBkYXRlU2VsKCkgeyBkcmF3QWN0aW9uYmFyKCk7IH0KLy8gZXRpcXVldGFzIHF1ZSBlc3RlIHVzdWFyaW8gcHVlZGUgaW1wcmltaXIgZGUgdW5hIHZlegpmdW5jdGlvbiBwcmludGFibGUobykgeyByZXR1cm4gby5zdGF0ZSA9PT0gJ3JlYWR5JyAmJiAobWUudXNlci5yb2xlICE9PSAnc2VsbGVyJyB8fCBvLm93biAhPT0gZmFsc2UpOyB9CmZ1bmN0aW9uIHNlbGxlck9rVG9QcmludChuKSB7IHJldHVybiBtZS51c2VyLnJvbGUgIT09ICdzZWxsZXInIHx8IGNvbmZpcm0oYFNpIGxhcyBpbXByaW1lcyB0w7osICR7biA9PT0gMSA/ICdxdWVkYScgOiAncXVlZGFuJ30gY29tbyAke24gPT09IDEgPyAnaW1wcmVzYScgOiAnaW1wcmVzYXMnfSBwb3IgdHUgdGllbmRhIHkgZWwgZnVsZmlsbG1lbnQgJHtuID09PSAxID8gJ2xhJyA6ICdsYXMnfSB2ZXLDoSBlbiByb2pvIGNvbW8gIkV0aXF1ZXRhIGltcHJlc2EiLiDCv0ltcHJpbWlyICR7bn0/YCk7IH0KLy8gYWN0dWFsaXphIGxhIHBhbnRhbGxhIGFsIHRpcm8sIHNpbiBlc3BlcmFyIGEgcXVlIGVsIHNlcnZpZG9yIG1hbmRlIGxhIGxpc3RhIG51ZXZhCmZ1bmN0aW9uIG1hcmtVbmJsb2NrZWQoaWRzKSB7CiAgY29uc3Qgd2hvID0gbWUudXNlci5yb2xlID09PSAnYWRtaW4nID8gJ0FkbWluaXN0cmFkb3InIDogKG1lLnVzZXIubmFtZSB8fCAnVMO6Jyk7CiAgZm9yIChjb25zdCBvIG9mIG9yZGVycykgaWYgKGlkcy5pbmNsdWRlcyhvLmlkKSAmJiBvLnN0YXRlID09PSAnYmxvY2tlZCcpIHsgby5zdGF0ZSA9ICdyZWFkeSc7IG8udW5ibG9ja2VkX2J5ID0gby51bmJsb2NrZWRfYnkgfHwgd2hvOyB9CiAgZHJhd1Jvd3MoKTsKfQoKbGV0IGRvd25sb2FkaW5nID0gZmFsc2U7Ci8vIHBhbnRhbGxhIGRlICJwcm9jZXNhbmRvIjogdW4gc29sIGFuaW1hZG8gYWwgY2VudHJvIHF1ZSBubyBzZSB2YSBoYXN0YSBxdWUgdGVybWluYSBsYSBkZXNjYXJnYQpmdW5jdGlvbiBzaG93U3VuKG4pIHsKICBoaWRlU3VuKHRydWUpOwogIGNvbnN0IGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7CiAgZWwuaWQgPSAnc3VuTG9hZGVyJzsgZWwuc2V0QXR0cmlidXRlKCdyb2xlJywgJ3N0YXR1cycpOyBlbC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGl2ZScsICdwb2xpdGUnKTsKICBjb25zdCByYXlzID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogMTIgfSwgKF8sIGkpID0+IGA8cmVjdCB4PSI5NyIgeT0iOCIgd2lkdGg9IjYiIGhlaWdodD0iMjYiIHJ4PSIzIiB0cmFuc2Zvcm09InJvdGF0ZSgke2kgKiAzMH0gMTAwIDEwMCkiLz5gKS5qb2luKCcnKTsKICBlbC5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz0ic3VuLWNhcmQiPgogICAgPHN2ZyBjbGFzcz0ic3VuIiB2aWV3Qm94PSIwIDAgMjAwIDIwMCIgYXJpYS1oaWRkZW49InRydWUiPgogICAgICA8ZGVmcz48cmFkaWFsR3JhZGllbnQgaWQ9InN1bkciIGN4PSI1MCUiIGN5PSI0NSUiIHI9IjU1JSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjRkZGM0IwIi8+PHN0b3Agb2Zmc2V0PSIuNTUiIHN0b3AtY29sb3I9IiNGRkM5M0MiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNGRjlGMUMiLz48L3JhZGlhbEdyYWRpZW50PjwvZGVmcz4KICAgICAgPGcgY2xhc3M9InN1bi1yYXlzIiBmaWxsPSIjRkZCNjI3Ij4ke3JheXN9PC9nPgogICAgICA8Y2lyY2xlIGNsYXNzPSJzdW4tZ2xvdyIgY3g9IjEwMCIgY3k9IjEwMCIgcj0iNTQiIGZpbGw9IiNGRkQxNjYiIG9wYWNpdHk9Ii4zNSIvPgogICAgICA8Y2lyY2xlIGN4PSIxMDAiIGN5PSIxMDAiIHI9IjQ0IiBmaWxsPSJ1cmwoI3N1bkcpIi8+CiAgICAgIDxnIGNsYXNzPSJzdW4tZmFjZSIgZmlsbD0iIzdBNEIwMCI+PGNpcmNsZSBjeD0iODUiIGN5PSI5NCIgcj0iNC41Ii8+PGNpcmNsZSBjeD0iMTE1IiBjeT0iOTQiIHI9IjQuNSIvPjxwYXRoIGQ9Ik04NCAxMTAgcTE2IDE0IDMyIDAiIHN0cm9rZT0iIzdBNEIwMCIgc3Ryb2tlLXdpZHRoPSI0IiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48L2c+CiAgICAgIDxjaXJjbGUgY3g9Ijc0IiBjeT0iMTA2IiByPSI2IiBmaWxsPSIjRkY4QzY5IiBvcGFjaXR5PSIuNDUiLz48Y2lyY2xlIGN4PSIxMjYiIGN5PSIxMDYiIHI9IjYiIGZpbGw9IiNGRjhDNjkiIG9wYWNpdHk9Ii40NSIvPgogICAgPC9zdmc+CiAgICA8cCBjbGFzcz0ic3VuLWwxIj7CoUVyZXMgdW4gZ2VuaW8sIHZhcyBtdXkgYmllbiBob3khPC9wPgogICAgPHAgY2xhc3M9InN1bi1sMiI+RXN0b3kgcHJvY2VzYW5kbyAke24gPiAxID8gYHR1cyA8Yj4ke259PC9iPiBldGlxdWV0YXNgIDogJ3R1IGV0aXF1ZXRhJ308c3BhbiBjbGFzcz0ic3VuLWRvdHMiPjxpPi48L2k+PGk+LjwvaT48aT4uPC9pPjwvc3Bhbj48L3A+CiAgICA8cCBjbGFzcz0ic3VuLWwzIj5RdWUgdGVuZ2FzIHVuIGxpbmRvIGTDrWEg4piAPC9wPgogIDwvZGl2PmA7CiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChlbCk7CiAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IGVsLmNsYXNzTGlzdC5hZGQoJ29uJykpOwp9CmZ1bmN0aW9uIGhpZGVTdW4obm93KSB7CiAgY29uc3QgZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3VuTG9hZGVyJyk7IGlmICghZWwpIHJldHVybjsKICBpZiAobm93KSB7IGVsLnJlbW92ZSgpOyByZXR1cm47IH0KICBlbC5xdWVyeVNlbGVjdG9yKCcuc3VuLWwyJykuaW5uZXJIVE1MID0gJ8KhTGlzdG8hIFR1cyBldGlxdWV0YXMgc2UgZGVzY2FyZ2Fyb24nOwogIGVsLmNsYXNzTGlzdC5hZGQoJ2RvbmUnKTsKICBzZXRUaW1lb3V0KCgpID0+IHsgZWwuY2xhc3NMaXN0LnJlbW92ZSgnb24nKTsgc2V0VGltZW91dCgoKSA9PiBlbC5yZW1vdmUoKSwgMzUwKTsgfSwgMTEwMCk7Cn0KCmFzeW5jIGZ1bmN0aW9uIGRvd25sb2FkQmF0Y2goaWRzLCB7IHNpbGVudCA9IGZhbHNlIH0gPSB7fSkgewogIGlmICghaWRzLmxlbmd0aCB8fCBkb3dubG9hZGluZykgcmV0dXJuIDA7CiAgZG93bmxvYWRpbmcgPSB0cnVlOwogIGlmICghc2lsZW50KSBzaG93U3VuKGlkcy5sZW5ndGgpOwogIGxldCBva0RsID0gZmFsc2U7CiAgY29uc3QgcmVjID0gYXdhaXQgcmVjb3JkT3JkZXJzKGBJbXByaW1pciAke2lkcy5sZW5ndGh9IGV0aXF1ZXRhJHtpZHMubGVuZ3RoID09PSAxID8gJycgOiAncyd9YCwgaWRzKTsKICB0cnkgewogICAgY29uc3QgcmVzID0gYXdhaXQgc2FmZUZldGNoKCcvYXBpL2xhYmVscy9iYXRjaCcsIHsgbWV0aG9kOiAnUE9TVCcsIGNyZWRlbnRpYWxzOiAnc2FtZS1vcmlnaW4nLCBoZWFkZXJzOiB7ICdjb250ZW50LXR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSwgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBpZHMsIG1hcms6IHRydWUgfSkgfSk7CiAgICBpZiAoIXJlcy5vaykgeyBjb25zdCBlID0gYXdhaXQgcmVzLmpzb24oKS5jYXRjaCgoKSA9PiAoe30pKTsgdGhyb3cgbmV3IEVycm9yKGUuZXJyb3IgfHwgJ05vIHNlIHB1ZG8gZGVzY2FyZ2FyJyk7IH0KICAgIGNvbnN0IGJsb2IgPSBhd2FpdCByZXMuYmxvYigpOwogICAgY29uc3QgbmFtZSA9IChyZXMuaGVhZGVycy5nZXQoJ2NvbnRlbnQtZGlzcG9zaXRpb24nKSB8fCAnJykubWF0Y2goL2ZpbGVuYW1lPSIoW14iXSspIi8pPy5bMV0gfHwgJ2V0aXF1ZXRhcy5wZGYnOwogICAgY29uc3QgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTsgYS5ocmVmID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTsgYS5kb3dubG9hZCA9IG5hbWU7IGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoYSk7IGEuY2xpY2soKTsgYS5yZW1vdmUoKTsKICAgIHNldFRpbWVvdXQoKCkgPT4gVVJMLnJldm9rZU9iamVjdFVSTChhLmhyZWYpLCA2MDAwMCk7CiAgICBva0RsID0gdHJ1ZTsKICAgIGNvbnN0IG4gPSArcmVzLmhlYWRlcnMuZ2V0KCd4LWxhYmVsLWNvdW50JykgfHwgaWRzLmxlbmd0aDsKICAgIHRvYXN0KGAke259IGV0aXF1ZXRhJHtuID09PSAxID8gJycgOiAncyd9IGRlc2NhcmdhZGEke24gPT09IDEgPyAnJyA6ICdzJ30geSBtYXJjYWRhJHtuID09PSAxID8gJycgOiAncyd9IGNvbW8gaW1wcmVzYSR7biA9PT0gMSA/ICcnIDogJ3MnfWApOwogICAgc2VsZWN0ZWQuY2xlYXIoKTsKICAgIHJlYygpOwogICAgcmV0dXJuIG47CiAgfSBjYXRjaCAoZSkgeyBpZiAoIXNpbGVudCkgdG9hc3QoZS5tZXNzYWdlLCA1MDAwKTsgcmV0dXJuIDA7IH0KICBmaW5hbGx5IHsgaGlkZVN1bighb2tEbCk7IGRvd25sb2FkaW5nID0gZmFsc2U7IHNldFRpbWVvdXQobG9hZE9yZGVycywgNDAwKTsgfQp9Ci8vIGxhIGRlc2NhcmdhIGF1dG9tw6F0aWNhIGZ1ZSBlbGltaW5hZGEgcG9yIGNvbXBsZXRvIChwYXJhIHRvZG9zIGxvcyB1c3VhcmlvcykKdHJ5IHsgbG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oJ2VoOmF1dG8nKTsgfSBjYXRjaCB7fQoKLy8gLS0tLS0tLS0tLSBWRU5ERURPUiAtLS0tLS0tLS0tCmFzeW5jIGZ1bmN0aW9uIHJlbmRlclNlbGxlcigpIHsKICBjb25zdCBpc0FkbWluID0gbWUudXNlci5yb2xlID09PSAnYWRtaW4nOwogIGxldCBzZWxsZXJQaWNrZXIgPSAnJzsKICBpZiAoaXNBZG1pbikgewogICAgY29uc3QgZCA9IGF3YWl0IGFwaSgnL2FwaS9hZG1pbi9zZWxsZXJzJyk7CiAgICBzZWxsZXJzID0gZC5zZWxsZXJzOwogICAgaWYgKCFzZWxsZXJzLmxlbmd0aCkgeyAkKCcjbWFpbicpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJzZWN0aW9uLXRpdGxlIj48aDI+VmVuZGVkb3JlczwvaDI+PC9kaXY+PGRpdiBjbGFzcz0icGFuZWwiPjxkaXYgY2xhc3M9ImVtcHR5Ij4ke0VNUFRZX1NWR308ZGl2PlByaW1lcm8gY3JlYSBsb3MgdmVuZGVkb3JlcyBlbiBsYSBwZXN0YcOxYSBVc3Vhcmlvcy48L2Rpdj48L2Rpdj48L2Rpdj5gOyByZXR1cm47IH0KICAgIGlmICghc2VsbGVycy5zb21lKHMgPT4gcy5pZCA9PT0gdWkuYWRtaW5TZWxsZXIpKSB1aS5hZG1pblNlbGxlciA9IHNlbGxlcnNbMF0uaWQ7CiAgICBzZWxsZXJQaWNrZXIgPSBgPHNlbGVjdCBpZD0iYWRtaW5TZWxsZXIiIHN0eWxlPSJ3aWR0aDphdXRvIj4ke3NlbGxlcnMubWFwKHMgPT4gYDxvcHRpb24gdmFsdWU9IiR7cy5pZH0iICR7cy5pZCA9PT0gdWkuYWRtaW5TZWxsZXIgPyAnc2VsZWN0ZWQnIDogJyd9PiR7ZXNjKHMubmFtZSl9PC9vcHRpb24+YCkuam9pbignJyl9PC9zZWxlY3Q+YDsKICB9CiAgJCgnI21haW4nKS5pbm5lckhUTUwgPSBgCiAgPGRpdiBjbGFzcz0ic2VjdGlvbi10aXRsZSI+PGgyPiR7aXNBZG1pbiA/ICdDdWVudGEgZGVsIHZlbmRlZG9yJyA6ICdNaXMgbWFya2V0cGxhY2VzJ308L2gyPiR7c2VsbGVyUGlja2VyfTxzcGFuIGNsYXNzPSJzcGFjZXIiIHN0eWxlPSJmbGV4OjEiPjwvc3Bhbj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWdob3N0IiBpZD0ic1N5bmMiPiR7SS5zeW5jfVNpbmNyb25pemFyIGFob3JhPC9idXR0b24+PC9kaXY+CiAgPGRpdiBjbGFzcz0iY29ubiIgaWQ9ImNvbm4iPjwvZGl2PgogIDxkaXYgY2xhc3M9ImdyaWQyIj4KICAgIDxkaXYgY2xhc3M9InBhbmVsIj4KICAgICAgPGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+PGgyPlByb2R1Y3RvcyBxdWUgTk8gdmFuIGFsIGZ1bGZpbGxtZW50PC9oMj48L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0icGFuZWwtYm9keSBzdGFjayI+CiAgICAgICAgPGRpdiBjbGFzcz0icnVsZSI+JHtSVUxFX1NWR308cD48Yj5CYXN0YSB1biBwcm9kdWN0byBkZSBlc3RhIGxpc3RhIHBhcmEgYmxvcXVlYXIgZWwgcGVkaWRvIGNvbXBsZXRvLjwvYj4gRWwgZnVsZmlsbG1lbnQgbG8gdmVyw6EgY29uIGNhbmRhZG8geSBubyBwb2Ryw6EgZGVzY2FyZ2FyIHN1IGV0aXF1ZXRhLiBVc2EgZWwgSUQgZGUgcHVibGljYWNpw7NuIChNTEPigKYsIElEIGRlIEZhbGFiZWxsYSwgU0tVIE1L4oCmIGRlIFBhcmlzKSBvIHR1IFNLVSBkZSB2ZW5kZWRvci48L3A+PC9kaXY+CiAgICAgICAgPGZvcm0gY2xhc3M9ImFkZHJvdyIgaWQ9ImFkZEZvcm0iPgogICAgICAgICAgPHRleHRhcmVhIGlkPSJhZGRWYWwiIHJvd3M9IjIiIHBsYWNlaG9sZGVyPSJVbm8gbyB2YXJpb3MsIHNlcGFyYWRvcyBwb3IgY29tYSBvIHNhbHRvIGRlIGzDrW5lYSYjMTA7RWo6IE1MQzE0ODc3NjU0MzIsIExFTi1QT0wtMDEiIGFyaWEtbGFiZWw9IklEcyBvIFNLVXMiPjwvdGV4dGFyZWE+CiAgICAgICAgICA8c2VsZWN0IGlkPSJhZGRNayIgYXJpYS1sYWJlbD0iTWFya2V0cGxhY2UiPjxvcHRpb24gdmFsdWU9ImFueSI+VG9kb3MgbG9zIGNhbmFsZXM8L29wdGlvbj48b3B0aW9uIHZhbHVlPSJtbCI+U29sbyBNZXJjYWRvIExpYnJlPC9vcHRpb24+PG9wdGlvbiB2YWx1ZT0iZmEiPlNvbG8gRmFsYWJlbGxhPC9vcHRpb24+PG9wdGlvbiB2YWx1ZT0icGEiPlNvbG8gUGFyaXM8L29wdGlvbj48L3NlbGVjdD4KICAgICAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgdHlwZT0ic3VibWl0Ij4ke0kubG9ja31CbG9xdWVhcjwvYnV0dG9uPgogICAgICAgIDwvZm9ybT4KICAgICAgICA8aW5wdXQgdHlwZT0ic2VhcmNoIiBpZD0iYmxRIiBwbGFjZWhvbGRlcj0iQnVzY2FyIGVuIGxhIGxpc3RhIiBhcmlhLWxhYmVsPSJCdXNjYXIgYmxvcXVlYWRvcyI+CiAgICAgICAgPGRpdiBjbGFzcz0idGFncyIgaWQ9InRhZ3MiPjwvZGl2PgogICAgICA8L2Rpdj4KICAgIDwvZGl2PgogICAgPGRpdiBjbGFzcz0icGFuZWwiPgogICAgICA8ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj48aDI+UGVkaWRvcyByZWNpZW50ZXM8L2gyPjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJ0YWJsZS13cmFwIj48dGFibGUgc3R5bGU9Im1pbi13aWR0aDo1MjBweCI+PHRoZWFkPjx0cj48dGg+UGVkaWRvPC90aD48dGg+Q2FuYWw8L3RoPjx0aD5Qcm9kdWN0b3M8L3RoPjx0aD5Fc3RhZG88L3RoPjwvdHI+PC90aGVhZD48dGJvZHkgaWQ9Im15Um93cyI+PC90Ym9keT48L3RhYmxlPjwvZGl2PgogICAgPC9kaXY+CiAgPC9kaXY+YDsKICBpZiAoaXNBZG1pbikgJCgnI2FkbWluU2VsbGVyJykub25jaGFuZ2UgPSBlID0+IHsgdWkuYWRtaW5TZWxsZXIgPSArZS50YXJnZXQudmFsdWU7IHN0b3JlLnNldCgnYWRtaW5TZWxsZXInLCB1aS5hZG1pblNlbGxlcik7IHJlbmRlclNlbGxlcigpOyB9OwogICQoJyNzU3luYycpLm9uY2xpY2sgPSBhc3luYyAoKSA9PiB7IGF3YWl0IGFwaSgnL2FwaS9zeW5jJyArIHNlbGxlclFTKCksIHsgbWV0aG9kOiAnUE9TVCcgfSk7IHRvYXN0KCdTaW5jcm9uaXphbmRv4oCmJyk7IH07CiAgJCgnI2FkZEZvcm0nKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4gewogICAgZS5wcmV2ZW50RGVmYXVsdCgpOwogICAgdHJ5IHsgY29uc3QgciA9IGF3YWl0IGFwaSgnL2FwaS9ibG9ja2xpc3QnICsgc2VsbGVyUVMoKSwgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyB2YWx1ZTogJCgnI2FkZFZhbCcpLnZhbHVlLCBtYXJrZXRwbGFjZTogJCgnI2FkZE1rJykudmFsdWUgfSB9KTsgJCgnI2FkZFZhbCcpLnZhbHVlID0gJyc7IHRvYXN0KGAke3IuYWRkZWR9IGJsb3F1ZWFkbyR7ci5hZGRlZCA9PT0gMSA/ICcnIDogJ3MnfWApOyBsb2FkQmxvY2tsaXN0KCk7IH0KICAgIGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UpOyB9CiAgfTsKICAkKCcjYmxRJykub25pbnB1dCA9ICgpID0+IGRyYXdUYWdzKCk7CiAgJCgnI3RhZ3MnKS5vbmNsaWNrID0gYXN5bmMgZSA9PiB7IGNvbnN0IGIgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1ybV0nKTsgaWYgKCFiKSByZXR1cm47IGF3YWl0IGFwaShgL2FwaS9ibG9ja2xpc3QvJHtiLmRhdGFzZXQucm19JHtzZWxsZXJRUygpfWAsIHsgbWV0aG9kOiAnREVMRVRFJyB9KTsgdG9hc3QoJ0Rlc2Jsb3F1ZWFkbzogc3VzIHBlZGlkb3MgcGFzYW4gYWwgZnVsZmlsbG1lbnQnKTsgbG9hZEJsb2NrbGlzdCgpOyB9OwogICQoJyNteVJvd3MnKS5vbmNsaWNrID0gYXN5bmMgZSA9PiB7CiAgICBjb25zdCBiID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtdW5ibG9ja10nKTsgaWYgKCFiKSByZXR1cm47CiAgICBpZiAoIWNvbmZpcm0oJ8K/RGVzYmxvcXVlYXIgZXN0YSBldGlxdWV0YT8gUGFzYSBhIGxhIHNlY2Npw7NuICJEZXNibG9xdWVhZGFzIi4gRW4gbGEgaG9qYSBkZWwgcGVkaWRvIHNhbGRyw6Egc3UgbsO6bWVybyB5IHF1ZWRhcsOhbiBtYXJjYWRvcyBjb24gIkZBTFRBIiBsb3MgcHJvZHVjdG9zIHF1ZSBzZSByZWxsZW5hbiBhcGFydGUuJykpIHJldHVybjsKICAgIGIuZGlzYWJsZWQgPSB0cnVlOyBiLnRleHRDb250ZW50ID0gJ0Rlc2Jsb3F1ZWFuZG/igKYnOyB0cnkgeyBhd2FpdCBhcGlSZXRyeShgL2FwaS9vcmRlcnMvJHtiLmRhdGFzZXQudW5ibG9ja30vdW5ibG9ja2AsIHsgbWV0aG9kOiAnUE9TVCcgfSk7IHRvYXN0KCdFdGlxdWV0YSBkZXNibG9xdWVhZGEnKTsgbG9hZFNlbGxlck9yZGVycygpOyB9IGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UpOyBiLmRpc2FibGVkID0gZmFsc2U7IGIudGV4dENvbnRlbnQgPSAnRGVzYmxvcXVlYXIgZXRpcXVldGEnOyB9CiAgfTsKICBsb2FkQ29ubmVjdGlvbnMoKTsgbG9hZEJsb2NrbGlzdCgpOyBsb2FkU2VsbGVyT3JkZXJzKCk7CiAgaWYgKG5ldyBVUkxTZWFyY2hQYXJhbXMobG9jYXRpb24uc2VhcmNoKS5nZXQoJ2NvbmVjdGFkbycpID09PSAnbWwnKSB7IHRvYXN0KCdNZXJjYWRvIExpYnJlIGNvbmVjdGFkbycpOyBoaXN0b3J5LnJlcGxhY2VTdGF0ZShudWxsLCAnJywgJy8nKTsgfQp9Cgphc3luYyBmdW5jdGlvbiBsb2FkQ29ubmVjdGlvbnMoKSB7CiAgY29uc3QgeyBjb25uZWN0aW9ucyB9ID0gYXdhaXQgYXBpKCcvYXBpL2Nvbm5lY3Rpb25zJyArIHNlbGxlclFTKCkpOwogIGNvbnN0IGJ5ID0gT2JqZWN0LmZyb21FbnRyaWVzKGNvbm5lY3Rpb25zLm1hcChjID0+IFtjLm1hcmtldHBsYWNlLCBjXSkpOwogIGNvbnN0IHN0ID0gYyA9PiAhYyA/ICc8ZGl2IGNsYXNzPSJzdGF0ZSBvZmYiPjxpPjwvaT5TaW4gY29uZWN0YXI8L2Rpdj4nIDogYy5sYXN0X2Vycm9yID8gYDxkaXYgY2xhc3M9InN0YXRlIGVyciI+PGk+PC9pPkVycm9yOiAke2VzYyhjLmxhc3RfZXJyb3Iuc2xpY2UoMCwgMTIwKSl9PC9kaXY+YCA6IGA8ZGl2IGNsYXNzPSJzdGF0ZSBvbiI+PGk+PC9pPkNvbmVjdGFkbyR7Yy5hY2NvdW50X2xhYmVsID8gJyDCtyAnICsgZXNjKGMuYWNjb3VudF9sYWJlbCkgOiAnJ30ke2MubGFzdF9zeW5jX2F0ID8gJyDCtyByZXZpc2FkbyAnICsgZXNjKGZtdFRpbWUoYy5sYXN0X3N5bmNfYXQpKSA6ICcnfTwvZGl2PmA7CiAgY29uc3QgZGlzYyA9IGMgPT4gYyA/IGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWRlbD0iJHtjLmlkfSI+RGVzY29uZWN0YXI8L2J1dHRvbj5gIDogJyc7CiAgY29uc3QgbWwgPSBieS5tbCwgZmEgPSBieS5mYSwgcGEgPSBieS5wYTsKICAkKCcjY29ubicpLmlubmVySFRNTCA9IGAKICA8ZGl2IGNsYXNzPSJtY2FyZCI+PGRpdiBjbGFzcz0ibG9nbyIgc3R5bGU9ImJhY2tncm91bmQ6dmFyKC0tbWwpO2NvbG9yOnZhcigtLW1sLWluaykiPk1lcmNhZG8gTGlicmU8L2Rpdj4ke3N0KG1sKX0KICAgIDxwIGNsYXNzPSJob3ciPlRlIGxsZXZhIGEgTWVyY2FkbyBMaWJyZSBwYXJhIGF1dG9yaXphci4gTm8gY29tcGFydGVzIHR1IGNvbnRyYXNlw7FhLiBMYXMgZXRpcXVldGFzIGxsZWdhbiBhcGVuYXMgbGEgdmVudGEgcXVlZGEgbGlzdGEgcGFyYSBpbXByaW1pci48L3A+CiAgICA8cCBjbGFzcz0iaG93IHdhcm5ib3giPjxiPkltcG9ydGFudGU6PC9iPiBNZXJjYWRvIExpYnJlIGNvbmVjdGEgbGEgY3VlbnRhIHF1ZSBlc3TDqSA8Yj5hYmllcnRhIGVuIGVzdGUgbmF2ZWdhZG9yPC9iPi4gU2kgYXF1w60gZXN0w6EgYWJpZXJ0YSBvdHJhIGN1ZW50YSAocG9yIGVqZW1wbG8gbGEgZGUgb3RybyB2ZW5kZWRvciksIGNpZXJyYSBzZXNpw7NuIGVuIG1lcmNhZG9saWJyZS5jbCBhbnRlcywgbyB1c2EgZWwgbGluayBwYXJhIHF1ZSBlbCB2ZW5kZWRvciBjb25lY3RlIGRlc2RlIHN1IHByb3BpbyBjb21wdXRhZG9yLjwvcD4KICAgICR7bWUubWxDb25maWd1cmVkID8gYDxhIGNsYXNzPSJidG4gJHttbCA/ICdidG4tZ2hvc3QnIDogJ2J0bi1wcmltYXJ5J30iIGhyZWY9Ii9hdXRoL21sL3N0YXJ0JHtzZWxsZXJRUygpfSI+JHttbCA/ICdWb2x2ZXIgYSBhdXRvcml6YXInIDogJ0NvbmVjdGFyIGNvbiBNZXJjYWRvIExpYnJlJ308L2E+JHttZS51c2VyLnJvbGUgPT09ICdhZG1pbicgPyAnPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgaWQ9Im1sTGluayI+Q29waWFyIGxpbmsgcGFyYSBxdWUgZWwgdmVuZGVkb3IgY29uZWN0ZTwvYnV0dG9uPicgOiAnJ31gIDogJzxwIGNsYXNzPSJob3ciIHN0eWxlPSJjb2xvcjp2YXIoLS13YXJuKSI+RWwgYWRtaW5pc3RyYWRvciBkZWJlIGNvbmZpZ3VyYXIgbGEgYXBwIGRlIE1lcmNhZG8gTGlicmUgZW4gZWwgc2Vydmlkb3IuPC9wPid9JHtkaXNjKG1sKX08L2Rpdj4KICA8ZGl2IGNsYXNzPSJtY2FyZCI+PGRpdiBjbGFzcz0ibG9nbyIgc3R5bGU9ImJhY2tncm91bmQ6dmFyKC0tZmEpO2NvbG9yOnZhcigtLWZhLWluaykiPkZhbGFiZWxsYTwvZGl2PiR7c3QoZmEpfQogICAgPGZvcm0gaWQ9ImZhRm9ybSIgY2xhc3M9InN0YWNrIj4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5Vc3VhcmlvIEFQSSAoY29ycmVvIGRlbCBTZWxsZXIgQ2VudGVyKTxpbnB1dCB0eXBlPSJlbWFpbCIgaWQ9ImZhVXNlciIgdmFsdWU9IiR7ZXNjKGZhPy5hY2NvdW50X2xhYmVsIHx8ICcnKX0iIHJlcXVpcmVkPjwvbGFiZWw+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+QVBJIEtleTxpbnB1dCB0eXBlPSJwYXNzd29yZCIgaWQ9ImZhS2V5IiBwbGFjZWhvbGRlcj0iJHtmYSA/ICfigKLigKLigKLigKLigKLigKIgKGd1YXJkYWRhKScgOiAnU2VsbGVyIENlbnRlciDigLogTWkgY3VlbnRhIOKAuiBJbnRlZ3JhY2lvbmVzJ30iICR7ZmEgPyAnJyA6ICdyZXF1aXJlZCd9PjwvbGFiZWw+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+U2VsbGVyIElEPGlucHV0IHR5cGU9InRleHQiIGlkPSJmYVNpZCIgcGxhY2Vob2xkZXI9IkPDs2RpZ28gZGUgdGllbmRhLCBlai4gU0MxMjM0Ij48L2xhYmVsPgogICAgICA8bGFiZWwgY2xhc3M9InN3aXRjaCI+PGlucHV0IHR5cGU9ImNoZWNrYm94IiBpZD0iZmFBdXRvIiAke2ZhPy5zZXR0aW5ncz8uYXV0b1JlYWR5ID8gJ2NoZWNrZWQnIDogJyd9PiBNYXJjYXIgImxpc3RvIHBhcmEgZGVzcGFjaG8iIGF1dG9tw6F0aWNvPC9sYWJlbD4KICAgICAgPHAgY2xhc3M9ImhvdyI+RmFsYWJlbGxhIGdlbmVyYSBsYSBldGlxdWV0YSBzb2xvIGN1YW5kbyBlbCBwZWRpZG8gZXN0w6EgbGlzdG8gcGFyYSBkZXNwYWNoby4gQ29uIGVzdGEgb3BjacOzbiwgbGEgYXBwIGxvIG1hcmNhIHNvbGEgYXBlbmFzIGxsZWdhLjwvcD4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuICR7ZmEgPyAnYnRuLWdob3N0JyA6ICdidG4tcHJpbWFyeSd9IiB0eXBlPSJzdWJtaXQiPiR7ZmEgPyAnQWN0dWFsaXphcicgOiAnQ29uZWN0YXIgRmFsYWJlbGxhJ308L2J1dHRvbj4KICAgIDwvZm9ybT4KICAgICR7ZmE/LndlYmhvb2tfdXJsID8gYDxsYWJlbCBjbGFzcz0iZiI+QXZpc28gaW5zdGFudMOhbmVvICh3ZWJob29rLCBvcGNpb25hbCk8c3BhbiBjbGFzcz0iY29weSI+PGlucHV0IHR5cGU9InRleHQiIHJlYWRvbmx5IHZhbHVlPSIke2VzYyhmYS53ZWJob29rX3VybCl9Ij48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWNvcHk9IiR7ZXNjKGZhLndlYmhvb2tfdXJsKX0iPkNvcGlhcjwvYnV0dG9uPjwvc3Bhbj48L2xhYmVsPmAgOiAnJ30KICAgICR7ZGlzYyhmYSl9PC9kaXY+CiAgPGRpdiBjbGFzcz0ibWNhcmQiPjxkaXYgY2xhc3M9ImxvZ28iIHN0eWxlPSJiYWNrZ3JvdW5kOnZhcigtLXBhKTtjb2xvcjojZmZmIj5QYXJpczwvZGl2PiR7c3QocGEpfQogICAgPGZvcm0gaWQ9InBhRm9ybSIgY2xhc3M9InN0YWNrIj4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5BUEkgS2V5PGlucHV0IHR5cGU9InBhc3N3b3JkIiBpZD0icGFLZXkiIHBsYWNlaG9sZGVyPSIke3BhID8gJ+KAouKAouKAouKAouKAouKAoiAoZ3VhcmRhZGEpJyA6ICdTZWxsZXIgQ2VudGVyIFBhcmlzIOKAuiBNaSBjdWVudGEg4oC6IEludGVncmFjaW9uZXMnfSIgcmVxdWlyZWQ+PC9sYWJlbD4KICAgICAgPHAgY2xhc3M9ImhvdyI+UGFyaXMgZW50cmVnYSBsYSBBUEkgS2V5IGVuIE1pIGN1ZW50YSDigLogSW50ZWdyYWNpb25lcy4gU2kgbm8gYXBhcmVjZSwgc2UgcGlkZSBwb3IgdGlja2V0IGEgUGFyaXMuPC9wPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gJHtwYSA/ICdidG4tZ2hvc3QnIDogJ2J0bi1wcmltYXJ5J30iIHR5cGU9InN1Ym1pdCI+JHtwYSA/ICdBY3R1YWxpemFyJyA6ICdDb25lY3RhciBQYXJpcyd9PC9idXR0b24+CiAgICA8L2Zvcm0+JHtkaXNjKHBhKX08L2Rpdj5gOwogICQoJyNmYUZvcm0nKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4gewogICAgZS5wcmV2ZW50RGVmYXVsdCgpOwogICAgaWYgKGZhICYmICEkKCcjZmFLZXknKS52YWx1ZSkgeyBhd2FpdCBhcGkoYC9hcGkvY29ubmVjdGlvbnMvJHtmYS5pZH0vc2V0dGluZ3Mke3NlbGxlclFTKCl9YCwgeyBtZXRob2Q6ICdQQVRDSCcsIGJvZHk6IHsgYXV0b1JlYWR5OiAkKCcjZmFBdXRvJykuY2hlY2tlZCB9IH0pOyB0b2FzdCgnR3VhcmRhZG8nKTsgcmV0dXJuIGxvYWRDb25uZWN0aW9ucygpOyB9CiAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvY29ubmVjdGlvbnMvZmEnICsgc2VsbGVyUVMoKSwgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyB1c2VySWQ6ICQoJyNmYVVzZXInKS52YWx1ZSwgYXBpS2V5OiAkKCcjZmFLZXknKS52YWx1ZSwgc2VsbGVySWQ6ICQoJyNmYVNpZCcpLnZhbHVlLCBhdXRvUmVhZHk6ICQoJyNmYUF1dG8nKS5jaGVja2VkIH0gfSk7IHRvYXN0KCdGYWxhYmVsbGEgY29uZWN0YWRvJyk7IGxvYWRDb25uZWN0aW9ucygpOyB9CiAgICBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlLCA1MDAwKTsgfQogIH07CiAgJCgnI3BhRm9ybScpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICBlLnByZXZlbnREZWZhdWx0KCk7CiAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvY29ubmVjdGlvbnMvcGEnICsgc2VsbGVyUVMoKSwgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBhcGlLZXk6ICQoJyNwYUtleScpLnZhbHVlIH0gfSk7IHRvYXN0KCdQYXJpcyBjb25lY3RhZG8nKTsgbG9hZENvbm5lY3Rpb25zKCk7IH0KICAgIGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UsIDUwMDApOyB9CiAgfTsKICBpZiAoJCgnI21sTGluaycpKSAkKCcjbWxMaW5rJykub25jbGljayA9IGFzeW5jICgpID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgdXJsIH0gPSBhd2FpdCBhcGkoJy9hcGkvYWRtaW4vbWwtbGluaycgKyBzZWxsZXJRUygpLCB7IG1ldGhvZDogJ1BPU1QnIH0pOwogICAgICB0cnkgeyBhd2FpdCBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dCh1cmwpOyB0b2FzdCgnTGluayBjb3BpYWRvOiBlbnbDrWFzZWxvIGFsIHZlbmRlZG9yIChzaXJ2ZSBwb3IgNDggaG9yYXMpJywgNTAwMCk7IH0KICAgICAgY2F0Y2ggeyBwcm9tcHQoJ0NvcGlhIGVzdGUgbGluayB5IGVudsOtYXNlbG8gYWwgdmVuZGVkb3IgKHNpcnZlIHBvciA0OCBob3Jhcyk6JywgdXJsKTsgfQogICAgfSBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlKTsgfQogIH07CiAgJCgnI2Nvbm4nKS5vbmNsaWNrID0gYXN5bmMgZSA9PiB7CiAgICBjb25zdCBkID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtZGVsXScpOwogICAgaWYgKGQpIHsgZC5kaXNhYmxlZCA9IHRydWU7IGF3YWl0IGFwaShgL2FwaS9jb25uZWN0aW9ucy8ke2QuZGF0YXNldC5kZWx9JHtzZWxsZXJRUygpfWAsIHsgbWV0aG9kOiAnREVMRVRFJyB9KTsgdG9hc3QoJ0Rlc2NvbmVjdGFkbycpOyBsb2FkQ29ubmVjdGlvbnMoKTsgfQogICAgY29uc3QgYyA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLWNvcHldJyk7CiAgICBpZiAoYykgeyBlLnByZXZlbnREZWZhdWx0KCk7IHRyeSB7IGF3YWl0IG5hdmlnYXRvci5jbGlwYm9hcmQud3JpdGVUZXh0KGMuZGF0YXNldC5jb3B5KTsgdG9hc3QoJ0NvcGlhZG8nKTsgfSBjYXRjaCB7IGMucHJldmlvdXNFbGVtZW50U2libGluZy5zZWxlY3QoKTsgfSB9CiAgfTsKfQoKbGV0IGJsSXRlbXMgPSBbXTsKYXN5bmMgZnVuY3Rpb24gbG9hZEJsb2NrbGlzdCgpIHsgYmxJdGVtcyA9IChhd2FpdCBhcGkoJy9hcGkvYmxvY2tsaXN0JyArIHNlbGxlclFTKCkpKS5pdGVtczsgZHJhd1RhZ3MoKTsgfQpmdW5jdGlvbiBkcmF3VGFncygpIHsKICBjb25zdCBxID0gKCQoJyNibFEnKT8udmFsdWUgfHwgJycpLnRvTG93ZXJDYXNlKCk7CiAgY29uc3QgbGlzdCA9IGJsSXRlbXMuZmlsdGVyKGIgPT4gIXEgfHwgYi52YWx1ZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHEpKTsKICAkKCcjdGFncycpLmlubmVySFRNTCA9IGxpc3QubGVuZ3RoID8gbGlzdC5tYXAoYiA9PiBgPHNwYW4gY2xhc3M9InRhZyI+JHtlc2MoYi52YWx1ZSl9IDxzbWFsbD7CtyAke2IubWFya2V0cGxhY2UgPT09ICdhbnknID8gJ3RvZG9zJyA6IE1LW2IubWFya2V0cGxhY2VdfTwvc21hbGw+PGJ1dHRvbiBkYXRhLXJtPSIke2IuaWR9IiBhcmlhLWxhYmVsPSJRdWl0YXIgJHtlc2MoYi52YWx1ZSl9Ij4ke0kueH08L2J1dHRvbj48L3NwYW4+YCkuam9pbignJykKICAgIDogYDxzcGFuIGNsYXNzPSJtdXRlZCIgc3R5bGU9ImZvbnQtc2l6ZToxMy41cHgiPiR7YmxJdGVtcy5sZW5ndGggPyAnU2luIHJlc3VsdGFkb3MuJyA6ICdTaW4gcHJvZHVjdG9zIGJsb3F1ZWFkb3M6IHRvZG8gdmEgYWwgZnVsZmlsbG1lbnQuJ308L3NwYW4+YDsKfQphc3luYyBmdW5jdGlvbiBsb2FkU2VsbGVyT3JkZXJzKCkgewogIGlmICh0YWIgIT09ICdzZWxsZXInIHx8ICEkKCcjbXlSb3dzJykpIHJldHVybjsKICBsZXQgbGlzdDsKICBpZiAobWUudXNlci5yb2xlID09PSAnc2VsbGVyJykgbGlzdCA9IChhd2FpdCBhcGkoJy9hcGkvb3JkZXJzP3ZpZXc9YWxsJykpLm9yZGVycy5maWx0ZXIobyA9PiBvLnNlbGxlcl9pZCA9PT0gbWUuc2VsbGVyPy5pZCk7CiAgZWxzZSBsaXN0ID0gKGF3YWl0IGFwaSgnL2FwaS9vcmRlcnM/dmlldz1hbGwnKSkub3JkZXJzLmZpbHRlcihvID0+IG8uc2VsbGVyX2lkID09PSB1aS5hZG1pblNlbGxlcik7CiAgJCgnI215Um93cycpLmlubmVySFRNTCA9IGxpc3QubGVuZ3RoID8gbGlzdC5zbGljZSgwLCA2MCkubWFwKG8gPT4gYDx0cj48dGQgY2xhc3M9Im1vbm8iPiR7ZXNjKG8ub3JkZXJfbnVtYmVyKX08c3BhbiBjbGFzcz0ibm90ZSI+JHtlc2MoZm10VGltZShvLnNvbGRfYXQgfHwgby5jcmVhdGVkX2F0KSl9JHtvLmN1c3RvbWVyID8gJyDCtyAnICsgZXNjKG8uY3VzdG9tZXIpIDogJyd9PC9zcGFuPjwvdGQ+PHRkPjxzcGFuIGNsYXNzPSJtayAke28ubWFya2V0cGxhY2V9Ij4ke01LW28ubWFya2V0cGxhY2VdIHx8ICcnfTwvc3Bhbj48L3RkPjx0ZD4ke2l0ZW1zSFRNTChvKX08L3RkPjx0ZD4ke28uYmxvY2tfbm8gPyBgPHNwYW4gY2xhc3M9ImJsb2Nrbm8iPk7CsCAke28uYmxvY2tfbm99PC9zcGFuPmAgOiAnJ30ke3BpbGwobyl9JHtvLnN0YXRlID09PSAnYmxvY2tlZCcgJiYgby5vd24gIT09IGZhbHNlID8gYDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSBidG4tc20iIHN0eWxlPSJtYXJnaW4tdG9wOjZweCIgZGF0YS11bmJsb2NrPSIke28uaWR9Ij5EZXNibG9xdWVhciBldGlxdWV0YTwvYnV0dG9uPmAgOiAnJ30ke1sncHJpbnRlZCcsICdzaGlwcGVkJ10uaW5jbHVkZXMoby5zdGF0ZSkgJiYgby5wcmludGVkX2J5ID8gYDxzcGFuIGNsYXNzPSJub3RlIj5JbXByaW1pw7M6ICR7ZXNjKG8ucHJpbnRlZF9ieSl9PC9zcGFuPmAgOiAnJ30ke28ucHJldl9wcmludCAmJiBvLnByZXZfcHJpbnQuYXQgPyBgPHNwYW4gY2xhc3M9Im5vdGUgcHJldnByaW50Ij7ihrogWWEgZnVlIGltcHJlc2EgcG9yICR7ZXNjKG8ucHJldl9wcmludC5ieSB8fCAnYWxndWllbicpfSBlbCAke2VzYyhmbXRUaW1lKG8ucHJldl9wcmludC5hdCkpfTwvc3Bhbj5gIDogJyd9JHtvLnN0YXRlID09PSAnZXJyb3InIHx8IG8uc3RhdGUgPT09ICd3YWl0aW5nJyA/IGA8c3BhbiBjbGFzcz0ibm90ZSAke28uc3RhdGUgPT09ICdlcnJvcicgPyAnYmFkJyA6ICcnfSI+JHtlc2Moby5lcnJvciB8fCAnJyl9PC9zcGFuPmAgOiAnJ308L3RkPjwvdHI+YCkuam9pbignJykKICAgIDogYDx0cj48dGQgY29sc3Bhbj0iNCI+PGRpdiBjbGFzcz0iZW1wdHkiPkHDum4gbm8gaGF5IHBlZGlkb3MuIENvbmVjdGEgdHVzIG1hcmtldHBsYWNlcyB5IGFwYXJlY2Vyw6FuIGFxdcOtLjwvZGl2PjwvdGQ+PC90cj5gOwp9CgovLyAtLS0tLS0tLS0tIEFETUlOIC0tLS0tLS0tLS0KYXN5bmMgZnVuY3Rpb24gcmVuZGVyQWRtaW4oKSB7CiAgY29uc3QgW2QsIHN0XSA9IGF3YWl0IFByb21pc2UuYWxsKFthcGkoJy9hcGkvYWRtaW4vc2VsbGVycycpLCBhcGkoJy9hcGkvYWRtaW4vc2V0dGluZ3MnKV0pOwogIGNvbnN0IHNOYW1lID0gaWQgPT4gZC5zZWxsZXJzLmZpbmQocyA9PiBzLmlkID09PSBpZCk/Lm5hbWUgfHwgJyc7CiAgY29uc3Qgcm9sZU5hbWUgPSB7IGFkbWluOiAnQWRtaW5pc3RyYWRvcicsIGZ1bGZpbGxtZW50OiAnRnVsZmlsbG1lbnQnLCBzZWxsZXI6ICdWZW5kZWRvcicsIGFnZW5jaWE6ICdBZ2VuY2lhIChzb2xvIGPDs2RpZ29zIGRlIGRldm9sdWNpw7NuKScgfTsKICAkKCcjbWFpbicpLmlubmVySFRNTCA9IGAKICA8ZGl2IGNsYXNzPSJncmlkMiI+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbCI+PGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+PGgyPlZlbmRlZG9yZXM8L2gyPjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJwYW5lbC1ib2R5IHN0YWNrIj4KICAgICAgICA8Zm9ybSBjbGFzcz0icm93IiBpZD0ibmV3U2VsbGVyIj48bGFiZWwgY2xhc3M9ImYiPk5vbWJyZSBkZSBsYSB0aWVuZGE8aW5wdXQgdHlwZT0idGV4dCIgaWQ9Im5zTmFtZSIgcmVxdWlyZWQ+PC9sYWJlbD48YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIHR5cGU9InN1Ym1pdCIgc3R5bGU9ImZsZXg6MCI+QWdyZWdhcjwvYnV0dG9uPjwvZm9ybT4KICAgICAgICA8ZGl2IGNsYXNzPSJ0YWJsZS13cmFwIj48dGFibGUgc3R5bGU9Im1pbi13aWR0aDo0MjBweCI+PHRoZWFkPjx0cj48dGg+VmVuZGVkb3I8L3RoPjx0aD5NYXJrZXRwbGFjZXM8L3RoPjx0aD5CbG9xdWVhZG9zPC90aD48dGg+PC90aD48L3RyPjwvdGhlYWQ+PHRib2R5PgogICAgICAgICR7ZC5zZWxsZXJzLm1hcChzID0+IGA8dHI+PHRkPjxiPiR7ZXNjKHMubmFtZSl9PC9iPjwvdGQ+PHRkPiR7cy5jb25uZWN0aW9ucy5maWx0ZXIoYyA9PiBNS1tjLm1hcmtldHBsYWNlXSkubWFwKGMgPT4gYDxzcGFuIGNsYXNzPSJtayAke2MubWFya2V0cGxhY2V9IiB0aXRsZT0iJHtlc2MoYy5sYXN0X2Vycm9yIHx8ICdPSycpfSI+JHtNS1tjLm1hcmtldHBsYWNlXX0ke2MubGFzdF9lcnJvciA/ICcg4pqgJyA6ICcnfTwvc3Bhbj5gKS5qb2luKCcgJykgfHwgJzxzcGFuIGNsYXNzPSJtdXRlZCI+4oCUPC9zcGFuPid9PC90ZD48dGQ+JHtzLmJsb2NrZWR9PC90ZD48dGQ+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1kYW5nZXIgYnRuLXNtIiBkYXRhLWRlbHM9IiR7cy5pZH0iPkVsaW1pbmFyPC9idXR0b24+PC90ZD48L3RyPmApLmpvaW4oJycpIHx8ICc8dHI+PHRkIGNvbHNwYW49IjQiIGNsYXNzPSJtdXRlZCI+U2luIHZlbmRlZG9yZXM8L3RkPjwvdHI+J30KICAgICAgICA8L3Rib2R5PjwvdGFibGU+PC9kaXY+CiAgICAgIDwvZGl2PjwvZGl2PgogICAgPGRpdiBjbGFzcz0icGFuZWwiPjxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj5Vc3VhcmlvczwvaDI+PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9InBhbmVsLWJvZHkgc3RhY2siPgogICAgICAgIDxmb3JtIGNsYXNzPSJzdGFjayIgaWQ9Im5ld1VzZXIiPgogICAgICAgICAgPGRpdiBjbGFzcz0icm93Ij48bGFiZWwgY2xhc3M9ImYiPk5vbWJyZTxpbnB1dCB0eXBlPSJ0ZXh0IiBpZD0ibnVOYW1lIiByZXF1aXJlZD48L2xhYmVsPjxsYWJlbCBjbGFzcz0iZiI+Q29ycmVvPGlucHV0IHR5cGU9ImVtYWlsIiBpZD0ibnVFbWFpbCIgcmVxdWlyZWQ+PC9sYWJlbD48L2Rpdj4KICAgICAgICAgIDxkaXYgY2xhc3M9InJvdyI+PGxhYmVsIGNsYXNzPSJmIj5Sb2w8c2VsZWN0IGlkPSJudVJvbGUiPjxvcHRpb24gdmFsdWU9InNlbGxlciI+VmVuZGVkb3I8L29wdGlvbj48b3B0aW9uIHZhbHVlPSJmdWxmaWxsbWVudCI+RnVsZmlsbG1lbnQ8L29wdGlvbj48b3B0aW9uIHZhbHVlPSJhZG1pbiI+QWRtaW5pc3RyYWRvcjwvb3B0aW9uPjxvcHRpb24gdmFsdWU9ImFnZW5jaWEiPkFnZW5jaWEgKHNvbG8gY8OzZGlnb3MgZGUgZGV2b2x1Y2nDs24pPC9vcHRpb24+PC9zZWxlY3Q+PC9sYWJlbD4KICAgICAgICAgIDxsYWJlbCBjbGFzcz0iZiIgaWQ9Im51U2VsbGVyV3JhcCI+VGllbmRhPHNlbGVjdCBpZD0ibnVTZWxsZXIiPiR7ZC5zZWxsZXJzLm1hcChzID0+IGA8b3B0aW9uIHZhbHVlPSIke3MuaWR9Ij4ke2VzYyhzLm5hbWUpfTwvb3B0aW9uPmApLmpvaW4oJycpfTwvc2VsZWN0PjwvbGFiZWw+PC9kaXY+CiAgICAgICAgICA8ZGl2IGNsYXNzPSJyb3ciPjxsYWJlbCBjbGFzcz0iZiI+Q29udHJhc2XDsWEgaW5pY2lhbCAobcOtbi4gOCk8aW5wdXQgdHlwZT0idGV4dCIgaWQ9Im51UGFzcyIgbWlubGVuZ3RoPSI4IiByZXF1aXJlZD48L2xhYmVsPjxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgdHlwZT0ic3VibWl0IiBzdHlsZT0iZmxleDowIj5DcmVhciB1c3VhcmlvPC9idXR0b24+PC9kaXY+CiAgICAgICAgPC9mb3JtPgogICAgICAgIDxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9Im1hcmdpbjowO2ZvbnQtc2l6ZToxM3B4Ij48Yj5DbGF2ZSB0ZW1wb3JhbDo8L2I+IGNyZWEgdW5hIGNsYXZlIG51ZXZhIHF1ZSBsZSBkaWN0YXMgYWwgdmVuZGVkb3I7IGFsIGVudHJhciBkZWJlIGNhbWJpYXJsYS4gPGI+Q2xhdmUgZGUgcmVzcGFsZG86PC9iPiB1biBjw7NkaWdvIGRlIHVuIHNvbG8gdXNvIHF1ZSBlbCB2ZW5kZWRvciBndWFyZGEgcG9yIHNpIG9sdmlkYSBzdSBjbGF2ZS4gPGI+RW50cmFyIGNvbW86PC9iPiBhYnJlcyBzdSBjdWVudGEgc2luIHNhYmVyIHN1IGNsYXZlLCBwYXJhIGF5dWRhcmxvLjwvcD4KICAgICAgICA8ZGl2IGNsYXNzPSJ0YWJsZS13cmFwIj48dGFibGUgc3R5bGU9Im1pbi13aWR0aDo3NjBweCI+PHRoZWFkPjx0cj48dGg+VXN1YXJpbzwvdGg+PHRoPlJvbDwvdGg+PHRoPkFjY2VzbzwvdGg+PHRoPjwvdGg+PC90cj48L3RoZWFkPjx0Ym9keT4KICAgICAgICAke2QudXNlcnMubWFwKHUgPT4gYDx0cj48dGQ+PGI+JHtlc2ModS5uYW1lKX08L2I+PHNwYW4gY2xhc3M9Im5vdGUiPiR7ZXNjKHUuZW1haWwpfTwvc3Bhbj48L3RkPjx0ZD4ke3UuaWQgPT09IG1lLnVzZXIuaWQgPyByb2xlTmFtZVt1LnJvbGVdIDogYDxzZWxlY3QgZGF0YS1yb2xlPSIke3UuaWR9IiBzdHlsZT0id2lkdGg6YXV0bztwYWRkaW5nOjRweCA4cHgiIGFyaWEtbGFiZWw9IlJvbCI+JHtPYmplY3QuZW50cmllcyhyb2xlTmFtZSkuZmlsdGVyKChba10pID0+IGsgIT09ICdzZWxsZXInIHx8IHUuc2VsbGVyX2lkKS5tYXAoKFtrLCBuXSkgPT4gYDxvcHRpb24gdmFsdWU9IiR7a30iICR7dS5yb2xlID09PSBrID8gJ3NlbGVjdGVkJyA6ICcnfT4ke259PC9vcHRpb24+YCkuam9pbignJyl9PC9zZWxlY3Q+YH0ke3Uuc2VsbGVyX2lkID8gJyDCtyAnICsgZXNjKHNOYW1lKHUuc2VsbGVyX2lkKSkgOiAnJ308L3RkPjx0ZD4ke3UuaGFzX2JhY2t1cCA/ICc8c3BhbiBjbGFzcz0icGlsbCByZWFkeSIgc3R5bGU9Im1hcmdpbi10b3A6NHB4Ij5SZXNwYWxkbyBsaXN0bzwvc3Bhbj4nIDogJyd9JHt1Lm11c3RfY2hhbmdlID8gJyA8c3BhbiBjbGFzcz0icGlsbCB3YWl0aW5nIiBzdHlsZT0ibWFyZ2luLXRvcDo0cHgiPkRlYmUgY3JlYXIgY2xhdmUgbnVldmE8L3NwYW4+JyA6ICcnfTwvdGQ+PHRkPjxkaXYgY2xhc3M9InJvdy1hY3Rpb25zIj4KICAgICAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tZ2hvc3QgYnRuLXNtIiBkYXRhLWFjdD0idGVtcC1wYXNzd29yZCIgZGF0YS1pZD0iJHt1LmlkfSIgZGF0YS1uYW1lPSIke2VzYyh1Lm5hbWUpfSI+Q2xhdmUgdGVtcG9yYWw8L2J1dHRvbj4KICAgICAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtYWN0PSJiYWNrdXAtY29kZSIgZGF0YS1pZD0iJHt1LmlkfSIgZGF0YS1uYW1lPSIke2VzYyh1Lm5hbWUpfSI+Q2xhdmUgZGUgcmVzcGFsZG88L2J1dHRvbj4KICAgICAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtYWN0PSJzZW5kLWNvZGUiIGRhdGEtaWQ9IiR7dS5pZH0iIGRhdGEtbmFtZT0iJHtlc2ModS5uYW1lKX0iPkVudmlhciBjw7NkaWdvPC9idXR0b24+CiAgICAgICAgICAke3UuaWQgPT09IG1lLnVzZXIuaWQgPyAnJyA6IGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWFjdD0iaW1wZXJzb25hdGUiIGRhdGEtaWQ9IiR7dS5pZH0iIGRhdGEtbmFtZT0iJHtlc2ModS5uYW1lKX0iPkVudHJhciBjb21vPC9idXR0b24+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1kYW5nZXIgYnRuLXNtIiBkYXRhLWRlbHU9IiR7dS5pZH0iPkVsaW1pbmFyPC9idXR0b24+YH08L2Rpdj48L3RkPjwvdHI+YCkuam9pbignJyl9CiAgICAgICAgPC90Ym9keT48L3RhYmxlPjwvZGl2PgogICAgICA8L2Rpdj48L2Rpdj4KICA8L2Rpdj4KICA8ZGl2IGNsYXNzPSJwYW5lbCIgc3R5bGU9Im1hcmdpbi10b3A6MjBweCI+PGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+PGgyPkVubGFjZXMgw7p0aWxlczwvaDI+PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbC1ib2R5Ij48dWwgc3R5bGU9Imxpc3Qtc3R5bGU6bm9uZTttYXJnaW46MDtwYWRkaW5nOjAiPjxsaSBzdHlsZT0iZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MnB4O3BhZGRpbmc6MTBweCAwO2JvcmRlci10b3A6MXB4IHNvbGlkIHZhcigtLWxpbmUpIj48YSBocmVmPSJodHRwczovL2V0aXF1ZXRhaHViLWphdmkub25yZW5kZXIuY29tIiB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciIgc3R5bGU9ImZvbnQtd2VpZ2h0OjcwMCI+VHUgYXBwIEV0aXF1ZXRhSHViPC9hPjxzcGFuIGNsYXNzPSJtb25vIG11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEycHgiPmh0dHBzOi8vZXRpcXVldGFodWItamF2aS5vbnJlbmRlci5jb208L3NwYW4+PHNwYW4gY2xhc3M9Im11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEzcHgiPkVzdGEgbWlzbWEgYXBwLiBDb21ww6FydGVsYSBjb24gbG9zIHZlbmRlZG9yZXMgeSBlbCBmdWxmaWxsbWVudC48L3NwYW4+PC9saT48bGkgc3R5bGU9ImRpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjJweDtwYWRkaW5nOjEwcHggMDtib3JkZXItdG9wOjFweCBzb2xpZCB2YXIoLS1saW5lKSI+PGEgaHJlZj0iaHR0cHM6Ly9kZXZlbG9wZXJzLm1lcmNhZG9saWJyZS5jbC9kZXZjZW50ZXIiIHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIiBzdHlsZT0iZm9udC13ZWlnaHQ6NzAwIj5NZXJjYWRvIExpYnJlIERldmVsb3BlcnM8L2E+PHNwYW4gY2xhc3M9Im1vbm8gbXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTJweCI+aHR0cHM6Ly9kZXZlbG9wZXJzLm1lcmNhZG9saWJyZS5jbC9kZXZjZW50ZXI8L3NwYW4+PHNwYW4gY2xhc3M9Im11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEzcHgiPkRvbmRlIGVzdMOhIGxhIGFwbGljYWNpw7NuIEV0aXF1ZXRhSHViIHkgc3UgU2VjcmV0IEtleS4gRW50cmFzIGNvbiB0dSBjdWVudGEgbm9ybWFsIGRlIE1lcmNhZG8gTGlicmUuPC9zcGFuPjwvbGk+PGxpIHN0eWxlPSJkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDoycHg7cGFkZGluZzoxMHB4IDA7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tbGluZSkiPjxhIGhyZWY9Imh0dHBzOi8vZGFzaGJvYXJkLnJlbmRlci5jb20iIHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIiBzdHlsZT0iZm9udC13ZWlnaHQ6NzAwIj5SZW5kZXI8L2E+PHNwYW4gY2xhc3M9Im1vbm8gbXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTJweCI+aHR0cHM6Ly9kYXNoYm9hcmQucmVuZGVyLmNvbTwvc3Bhbj48c3BhbiBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTNweCI+RG9uZGUgdml2ZSBsYSBhcHAuIEFxdcOtIHNlIHB1YmxpY2EgY2FkYSB2ZXJzacOzbiBudWV2YSAoTWFudWFsIERlcGxveSkuPC9zcGFuPjwvbGk+PGxpIHN0eWxlPSJkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDoycHg7cGFkZGluZzoxMHB4IDA7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tbGluZSkiPjxhIGhyZWY9Imh0dHBzOi8vZ2l0aHViLmNvbS9lZHVhcmRvZGluYXJkaTk2LWJvb3AvZXRpcXVldGFodWIiIHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIiBzdHlsZT0iZm9udC13ZWlnaHQ6NzAwIj5HaXRIdWI8L2E+PHNwYW4gY2xhc3M9Im1vbm8gbXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTJweCI+aHR0cHM6Ly9naXRodWIuY29tL2VkdWFyZG9kaW5hcmRpOTYtYm9vcC9ldGlxdWV0YWh1Yjwvc3Bhbj48c3BhbiBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTNweCI+RWwgY8OzZGlnbyBkZSBsYSBhcHAgeSBlbCByZXNwYWxkbyBhdXRvbcOhdGljbyBjYWRhIDE1IG1pbnV0b3MuPC9zcGFuPjwvbGk+PGxpIHN0eWxlPSJkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDoycHg7cGFkZGluZzoxMHB4IDA7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tbGluZSkiPjxhIGhyZWY9Imh0dHBzOi8vYXBwLmJyZXZvLmNvbSIgdGFyZ2V0PSJfYmxhbmsiIHJlbD0ibm9vcGVuZXIiIHN0eWxlPSJmb250LXdlaWdodDo3MDAiPkJyZXZvPC9hPjxzcGFuIGNsYXNzPSJtb25vIG11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEycHgiPmh0dHBzOi8vYXBwLmJyZXZvLmNvbTwvc3Bhbj48c3BhbiBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTNweCI+RWwgc2VydmljaW8gcXVlIGVudsOtYSBsb3MgY29ycmVvcyBjb24gY8OzZGlnb3MgcGFyYSByZWN1cGVyYXIgY29udHJhc2XDsWEuPC9zcGFuPjwvbGk+PC91bD48L2Rpdj48L2Rpdj4KICA8ZGl2IGNsYXNzPSJwYW5lbCIgc3R5bGU9Im1hcmdpbi10b3A6MjBweCI+PGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+PGgyPkNvbmV4acOzbiBjb24gTWVyY2FkbyBMaWJyZTwvaDI+JHtzdC5tbF9jbGllbnRfaWQgJiYgc3QubWxfc2VjcmV0X3NldCA/ICc8c3BhbiBjbGFzcz0ic3RhdGUgb24iPjxpPjwvaT5Db25maWd1cmFkYTwvc3Bhbj4nIDogJzxzcGFuIGNsYXNzPSJzdGF0ZSBlcnIiPjxpPjwvaT5GYWx0YSBjb25maWd1cmFyPC9zcGFuPid9PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbC1ib2R5IHN0YWNrIj4KICAgICAgPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjAiPkNyZWEgdW5hIGFwbGljYWNpw7NuIGVuIDxhIGhyZWY9Imh0dHBzOi8vZGV2ZWxvcGVycy5tZXJjYWRvbGlicmUuY2wvZGV2Y2VudGVyIiB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciI+ZGV2ZWxvcGVycy5tZXJjYWRvbGlicmUuY2w8L2E+IGNvbiBlc3RvcyBkYXRvcyB5IHBlZ2EgYXF1w60gc3UgQXBwIElEIHkgU2VjcmV0IEtleS4gVW5hIHNvbGEgYXBwIHNpcnZlIHBhcmEgdG9kb3MgbG9zIHZlbmRlZG9yZXMuPC9wPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPlVSSSBkZSByZWRpcmVjdDxzcGFuIGNsYXNzPSJjb3B5Ij48aW5wdXQgdHlwZT0idGV4dCIgcmVhZG9ubHkgdmFsdWU9IiR7ZXNjKHN0Lm1sX3JlZGlyZWN0X3VyaSl9Ij48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWNvcHk9IiR7ZXNjKHN0Lm1sX3JlZGlyZWN0X3VyaSl9Ij5Db3BpYXI8L2J1dHRvbj48L3NwYW4+PC9sYWJlbD4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5VUkwgZGUgbm90aWZpY2FjaW9uZXMgKHTDs3BpY29zOiBvcmRlcnNfdjIgeSBzaGlwbWVudHMpPHNwYW4gY2xhc3M9ImNvcHkiPjxpbnB1dCB0eXBlPSJ0ZXh0IiByZWFkb25seSB2YWx1ZT0iJHtlc2Moc3QubWxfbm90aWZpY2F0aW9uc191cmwpfSI+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1jb3B5PSIke2VzYyhzdC5tbF9ub3RpZmljYXRpb25zX3VybCl9Ij5Db3BpYXI8L2J1dHRvbj48L3NwYW4+PC9sYWJlbD4KICAgICAgPGZvcm0gY2xhc3M9InJvdyIgaWQ9Im1sQ2ZnIj48bGFiZWwgY2xhc3M9ImYiPkFwcCBJRDxpbnB1dCB0eXBlPSJ0ZXh0IiBpZD0ibWxJZCIgdmFsdWU9IiR7ZXNjKHN0Lm1sX2NsaWVudF9pZCl9IiByZXF1aXJlZD48L2xhYmVsPjxsYWJlbCBjbGFzcz0iZiI+U2VjcmV0IEtleTxpbnB1dCB0eXBlPSJwYXNzd29yZCIgaWQ9Im1sU2VjcmV0IiBwbGFjZWhvbGRlcj0iJHtzdC5tbF9zZWNyZXRfc2V0ID8gJ+KAouKAouKAouKAouKAouKAoiAoZ3VhcmRhZGEpJyA6ICcnfSI+PC9sYWJlbD48YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIHR5cGU9InN1Ym1pdCIgc3R5bGU9ImZsZXg6MCI+R3VhcmRhcjwvYnV0dG9uPjwvZm9ybT4KICAgIDwvZGl2PjwvZGl2PgogIDxkaXYgY2xhc3M9InBhbmVsIiBzdHlsZT0ibWFyZ2luLXRvcDoyMHB4Ij48ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj48aDI+Q29ycmVvcyAocmVjdXBlcmFyIGNvbnRyYXNlw7FhKTwvaDI+JHtzdC5tYWlsX2tleV9zZXQgJiYgc3QubWFpbF9mcm9tID8gJzxzcGFuIGNsYXNzPSJzdGF0ZSBvbiI+PGk+PC9pPkFjdGl2YWRvPC9zcGFuPicgOiAnPHNwYW4gY2xhc3M9InN0YXRlIGVyciI+PGk+PC9pPlNpbiBjb25maWd1cmFyPC9zcGFuPid9PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbC1ib2R5IHN0YWNrIj4KICAgICAgPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjAiPlBhcmEgZW52aWFyIGxvcyBjw7NkaWdvcyBkZSA2IGTDrWdpdG9zIHNlIHVzYSA8YSBocmVmPSJodHRwczovL3d3dy5icmV2by5jb20iIHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIj5CcmV2bzwvYT4gKGdyYXRpcyBoYXN0YSAzMDAgY29ycmVvcyBhbCBkw61hKS4gQ3JlYSB1bmEgY3VlbnRhLCB2ZXJpZmljYSBlbCBjb3JyZW8gcmVtaXRlbnRlIHkgY29waWEgdW5hIEFQSSBLZXkgKENvbmZpZ3VyYWNpw7NuIOKAuiBTTVRQIHkgQVBJIOKAuiBBUEkgS2V5cykuPC9wPgogICAgICA8Zm9ybSBjbGFzcz0ic3RhY2siIGlkPSJtYWlsQ2ZnIj4KICAgICAgICA8ZGl2IGNsYXNzPSJyb3ciPjxsYWJlbCBjbGFzcz0iZiI+Q29ycmVvIHJlbWl0ZW50ZSAodmVyaWZpY2FkbyBlbiBCcmV2byk8aW5wdXQgdHlwZT0iZW1haWwiIGlkPSJtRnJvbSIgdmFsdWU9IiR7ZXNjKHN0Lm1haWxfZnJvbSB8fCAnJyl9IiByZXF1aXJlZD48L2xhYmVsPjxsYWJlbCBjbGFzcz0iZiI+Tm9tYnJlIHJlbWl0ZW50ZTxpbnB1dCB0eXBlPSJ0ZXh0IiBpZD0ibU5hbWUiIHZhbHVlPSIke2VzYyhzdC5tYWlsX2Zyb21fbmFtZSB8fCAnRXRpcXVldGFIdWInKX0iPjwvbGFiZWw+PC9kaXY+CiAgICAgICAgPGRpdiBjbGFzcz0icm93Ij48bGFiZWwgY2xhc3M9ImYiPkFQSSBLZXkgZGUgQnJldm88aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJtS2V5IiBwbGFjZWhvbGRlcj0iJHtzdC5tYWlsX2tleV9zZXQgPyAn4oCi4oCi4oCi4oCi4oCi4oCiIChndWFyZGFkYSknIDogJ3hrZXlzaWIt4oCmJ30iPjwvbGFiZWw+PGxhYmVsIGNsYXNzPSJmIj5FbnZpYXIgcHJ1ZWJhIGEgKG9wY2lvbmFsKTxpbnB1dCB0eXBlPSJlbWFpbCIgaWQ9Im1UZXN0IiB2YWx1ZT0iJHtlc2MobWUudXNlci5lbWFpbCl9Ij48L2xhYmVsPjwvZGl2PgogICAgICAgIDxkaXYgY2xhc3M9InJvdyIgc3R5bGU9Imp1c3RpZnktY29udGVudDpmbGV4LWVuZCI+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiIHN0eWxlPSJmbGV4OjAiPkd1YXJkYXI8L2J1dHRvbj48L2Rpdj4KICAgICAgPC9mb3JtPgogICAgPC9kaXY+PC9kaXY+CiAgPGRpdiBjbGFzcz0icGFuZWwiIGlkPSJia1BhbmVsIiBzdHlsZT0ibWFyZ2luLXRvcDoyMHB4Ij48ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj48aDI+UmVzcGFsZG8gaW5tZWRpYXRvIChxdWUgbm8gc2UgcGllcmRhIG5hZGEpPC9oMj4ke3N0LmJhY2t1cD8uY29uZmlndXJlZCA/IGA8c3BhbiBjbGFzcz0ic3RhdGUgb24iPjxpPjwvaT5BY3RpdmFkbyR7c3QuYmFja3VwLmxhc3RPa0F0ID8gJyDCtyDDumx0aW1vICcgKyBlc2MoZm10VGltZShzdC5iYWNrdXAubGFzdE9rQXQpKSA6ICcnfTwvc3Bhbj5gIDogJzxzcGFuIGNsYXNzPSJzdGF0ZSBlcnIiPjxpPjwvaT5TaW4gYWN0aXZhcjwvc3Bhbj4nfTwvZGl2PgogICAgPGRpdiBjbGFzcz0icGFuZWwtYm9keSBzdGFjayI+CiAgICAgIDxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9Im1hcmdpbjowIj5SZW5kZXIgKGVsIHNlcnZpZG9yIGdyYXRpcykgYSB2ZWNlcyByZWluaWNpYSBsYSBhcHAgeSBib3JyYSBsbyDDumx0aW1vIHF1ZSBzZSBoaXpvLiBDb24gZXN0bywgY2FkYSBjYW1iaW8gKGltcHJpbWlyLCBkZXNibG9xdWVhcuKApikgc2UgZ3VhcmRhIGVuIEdpdEh1YiBhIGxvcyBwb2NvcyBzZWd1bmRvcyB5IGFsIHJlaW5pY2lhciBubyBzZSBwaWVyZGUgbmFkYS48L3A+CiAgICAgIDxvbCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJtYXJnaW46MDtwYWRkaW5nLWxlZnQ6MThweCI+CiAgICAgICAgPGxpPkFicmUgPGEgaHJlZj0iaHR0cHM6Ly9naXRodWIuY29tL3NldHRpbmdzL3BlcnNvbmFsLWFjY2Vzcy10b2tlbnMvbmV3IiB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciI+R2l0SHViIOKAuiBGaW5lLWdyYWluZWQgdG9rZW4gbnVldm88L2E+LjwvbGk+CiAgICAgICAgPGxpPk5vbWJyZTogPGI+RXRpcXVldGFIdWIgcmVzcGFsZG88L2I+IMK3IEV4cGlyYWNpw7NuOiBsYSBtw6FzIGxhcmdhIChvIHNpbiB2ZW5jaW1pZW50bykuPC9saT4KICAgICAgICA8bGk+UmVwb3NpdG9yeSBhY2Nlc3M6IDxiPk9ubHkgc2VsZWN0IHJlcG9zaXRvcmllczwvYj4g4oC6IDxiPmV0aXF1ZXRhaHViPC9iPi48L2xpPgogICAgICAgIDxsaT5QZXJtaXNzaW9ucyDigLogUmVwb3NpdG9yeSBwZXJtaXNzaW9ucyDigLogPGI+Q29udGVudHM6IFJlYWQgYW5kIHdyaXRlPC9iPi48L2xpPgogICAgICAgIDxsaT5HZW5lcmF0ZSB0b2tlbiwgY8OzcGlhbG8geSBww6lnYWxvIGFxdcOtIGFiYWpvLjwvbGk+CiAgICAgIDwvb2w+CiAgICAgICR7c3QuYmFja3VwPy5sYXN0RXJyb3IgPyBgPHAgY2xhc3M9Im5vdGUgYmFkIiBzdHlsZT0ibWFyZ2luOjAiPsOabHRpbW8gZXJyb3I6ICR7ZXNjKHN0LmJhY2t1cC5sYXN0RXJyb3IpfTwvcD5gIDogJyd9CiAgICAgIDxmb3JtIGNsYXNzPSJyb3ciIGlkPSJnaENmZyI+PGxhYmVsIGNsYXNzPSJmIj5Ub2tlbiBkZSBHaXRIdWI8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJnaFRvayIgcGxhY2Vob2xkZXI9IiR7c3QuZ2hfdG9rZW5fc2V0ID8gJ+KAouKAouKAouKAouKAouKAoiAoZ3VhcmRhZG8pJyA6ICdnaXRodWJfcGF0X+KApid9IiBhdXRvY29tcGxldGU9Im9mZiI+PC9sYWJlbD48YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIHR5cGU9InN1Ym1pdCIgc3R5bGU9ImZsZXg6MCI+R3VhcmRhciB5IHJlc3BhbGRhciBhaG9yYTwvYnV0dG9uPjwvZm9ybT4KICAgIDwvZGl2PjwvZGl2PgogIDxkaXYgY2xhc3M9Im1vZGFsIiBpZD0iY29uZmlybSIgaGlkZGVuPjxkaXYgY2xhc3M9InNoZWV0Ij48aDMgaWQ9ImNmVGl0bGUiPsK/U2VndXJvPzwvaDM+PHAgY2xhc3M9Im11dGVkIiBpZD0iY2ZUZXh0IiBzdHlsZT0ibWFyZ2luOjAiPjwvcD48ZGl2IGlkPSJjZkV4dHJhIj48L2Rpdj48ZGl2IGNsYXNzPSJyb3ciIHN0eWxlPSJqdXN0aWZ5LWNvbnRlbnQ6ZmxleC1lbmQiPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSIgaWQ9ImNmTm8iIHN0eWxlPSJmbGV4OjAiPkNhbmNlbGFyPC9idXR0b24+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiBpZD0iY2ZZZXMiIHN0eWxlPSJmbGV4OjAiPkNvbmZpcm1hcjwvYnV0dG9uPjwvZGl2PjwvZGl2PjwvZGl2PmA7CiAgY29uc3Qgcm9sZSA9ICQoJyNudVJvbGUnKTsgY29uc3Qgc3luYyA9ICgpID0+ICQoJyNudVNlbGxlcldyYXAnKS5oaWRkZW4gPSByb2xlLnZhbHVlICE9PSAnc2VsbGVyJzsgcm9sZS5vbmNoYW5nZSA9IHN5bmM7IHN5bmMoKTsKICAkKCcjbmV3U2VsbGVyJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsgZS5wcmV2ZW50RGVmYXVsdCgpOyB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvYWRtaW4vc2VsbGVycycsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgbmFtZTogJCgnI25zTmFtZScpLnZhbHVlIH0gfSk7IHRvYXN0KCdWZW5kZWRvciBhZ3JlZ2FkbycpOyByZW5kZXJBZG1pbigpOyB9IGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UpOyB9IH07CiAgJCgnI25ld1VzZXInKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4geyBlLnByZXZlbnREZWZhdWx0KCk7IHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9hZG1pbi91c2VycycsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgbmFtZTogJCgnI251TmFtZScpLnZhbHVlLCBlbWFpbDogJCgnI251RW1haWwnKS52YWx1ZSwgcm9sZTogcm9sZS52YWx1ZSwgc2VsbGVyX2lkOiAkKCcjbnVTZWxsZXInKS52YWx1ZSwgcGFzc3dvcmQ6ICQoJyNudVBhc3MnKS52YWx1ZSB9IH0pOyB0b2FzdCgnVXN1YXJpbyBjcmVhZG8nKTsgcmVuZGVyQWRtaW4oKTsgfSBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlLCA0MDAwKTsgfSB9OwogIGNvbnN0IGNvbmZpcm1Cb3ggPSAodGl0bGUsIHRleHQsIGV4dHJhID0gJycpID0+IG5ldyBQcm9taXNlKHJlcyA9PiB7CiAgICAkKCcjY2ZUaXRsZScpLnRleHRDb250ZW50ID0gdGl0bGU7ICQoJyNjZlRleHQnKS50ZXh0Q29udGVudCA9IHRleHQ7ICQoJyNjZkV4dHJhJykuaW5uZXJIVE1MID0gZXh0cmE7ICQoJyNjb25maXJtJykuaGlkZGVuID0gZmFsc2U7CiAgICAkKCcjY2ZObycpLm9uY2xpY2sgPSAoKSA9PiB7ICQoJyNjb25maXJtJykuaGlkZGVuID0gdHJ1ZTsgcmVzKGZhbHNlKTsgfTsKICAgICQoJyNjZlllcycpLm9uY2xpY2sgPSAoKSA9PiB7ICQoJyNjb25maXJtJykuaGlkZGVuID0gdHJ1ZTsgcmVzKHRydWUpOyB9OwogIH0pOwogICQoJyNtYWlsQ2ZnJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgIGUucHJldmVudERlZmF1bHQoKTsKICAgIHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9hZG1pbi9zZXR0aW5ncycsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgbWFpbF9mcm9tOiAkKCcjbUZyb20nKS52YWx1ZSwgbWFpbF9mcm9tX25hbWU6ICQoJyNtTmFtZScpLnZhbHVlLCBtYWlsX2FwaV9rZXk6ICQoJyNtS2V5JykudmFsdWUsIHRlc3RfdG86ICQoJyNtVGVzdCcpLnZhbHVlIH0gfSk7IHRvYXN0KCQoJyNtVGVzdCcpLnZhbHVlID8gJ0d1YXJkYWRvLiBUZSBlbnZpYW1vcyB1biBjb3JyZW8gZGUgcHJ1ZWJhLicgOiAnR3VhcmRhZG8nKTsgcmVuZGVyQWRtaW4oKTsgfQogICAgY2F0Y2ggKHgpIHsgdG9hc3QoeC5tZXNzYWdlLCA1MDAwKTsgfQogIH07CiAgJCgnI2doQ2ZnJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgIGUucHJldmVudERlZmF1bHQoKTsgY29uc3QgdiA9ICQoJyNnaFRvaycpLnZhbHVlLnRyaW0oKTsgaWYgKCF2KSByZXR1cm4gdG9hc3QoJ1BlZ2EgZWwgdG9rZW4gZGUgR2l0SHViJyk7CiAgICBjb25zdCBiID0gZS50YXJnZXQucXVlcnlTZWxlY3RvcignYnV0dG9uJyk7IGIuZGlzYWJsZWQgPSB0cnVlOyBiLnRleHRDb250ZW50ID0gJ0d1YXJkYW5kbyByZXNwYWxkb+KApic7CiAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvYWRtaW4vc2V0dGluZ3MnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGdoX3Rva2VuOiB2IH0gfSk7IHRvYXN0KCfCoUxpc3RvISBSZXNwYWxkbyBpbm1lZGlhdG8gYWN0aXZhZG8nLCA1MDAwKTsgcmVuZGVyQWRtaW4oKTsgfQogICAgY2F0Y2ggKHgpIHsgdG9hc3QoeC5tZXNzYWdlLCA3MDAwKTsgYi5kaXNhYmxlZCA9IGZhbHNlOyBiLnRleHRDb250ZW50ID0gJ0d1YXJkYXIgeSByZXNwYWxkYXIgYWhvcmEnOyB9CiAgfTsKICAkKCcjbWxDZmcnKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4geyBlLnByZXZlbnREZWZhdWx0KCk7IGF3YWl0IGFwaSgnL2FwaS9hZG1pbi9zZXR0aW5ncycsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgbWxfY2xpZW50X2lkOiAkKCcjbWxJZCcpLnZhbHVlLCBtbF9jbGllbnRfc2VjcmV0OiAkKCcjbWxTZWNyZXQnKS52YWx1ZSB9IH0pOyB0b2FzdCgnTWVyY2FkbyBMaWJyZSBjb25maWd1cmFkbycpOyBtZS5tbENvbmZpZ3VyZWQgPSB0cnVlOyByZW5kZXJBZG1pbigpOyB9OwogICQoJyNtYWluJykub25jaGFuZ2UgPSBhc3luYyBlID0+IHsgY29uc3QgciA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLXJvbGVdJyk7IGlmICghcikgcmV0dXJuOyB0cnkgeyBhd2FpdCBhcGkoYC9hcGkvYWRtaW4vdXNlcnMvJHtyLmRhdGFzZXQucm9sZX0vcm9sZWAsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgcm9sZTogci52YWx1ZSB9IH0pOyB0b2FzdCgnUm9sIGFjdHVhbGl6YWRvIChkZWJlIHZvbHZlciBhIGluaWNpYXIgc2VzacOzbiknKTsgfSBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlKTsgcmVuZGVyQWRtaW4oKTsgfSB9OwogICQoJyNtYWluJykub25jbGljayA9IGFzeW5jIGUgPT4gewogICAgY29uc3QgY3AgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1jb3B5XScpOwogICAgaWYgKGNwKSB7IGUucHJldmVudERlZmF1bHQoKTsgdHJ5IHsgYXdhaXQgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQoY3AuZGF0YXNldC5jb3B5KTsgdG9hc3QoJ0NvcGlhZG8nKTsgfSBjYXRjaCB7IGNwLnByZXZpb3VzRWxlbWVudFNpYmxpbmcuc2VsZWN0KCk7IH0gcmV0dXJuOyB9CiAgICBjb25zdCBhY3QgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1hY3RdJyk7CiAgICBpZiAoYWN0KSB7CiAgICAgIGNvbnN0IGlkID0gYWN0LmRhdGFzZXQuaWQsIG5hbWUgPSBhY3QuZGF0YXNldC5uYW1lLCBraW5kID0gYWN0LmRhdGFzZXQuYWN0OwogICAgICBjb25zdCB0ZXh0cyA9IHsKICAgICAgICAndGVtcC1wYXNzd29yZCc6IFsnQ2xhdmUgdGVtcG9yYWwnLCBgU2UgcmVlbXBsYXphIGxhIGNsYXZlIGFjdHVhbCBkZSAke25hbWV9LiBBbCBlbnRyYXIgY29uIGxhIGNsYXZlIHRlbXBvcmFsIHRlbmRyw6EgcXVlIGNyZWFyIHVuYSBudWV2YS5gXSwKICAgICAgICAnYmFja3VwLWNvZGUnOiBbJ0NsYXZlIGRlIHJlc3BhbGRvJywgYFNlIGNyZWEgdW4gY8OzZGlnbyBkZSB1biBzb2xvIHVzbyBwYXJhICR7bmFtZX0uIFNpIHlhIHRlbsOtYSB1bm8sIGVsIGFudGVyaW9yIGRlamEgZGUgc2VydmlyLmBdLAogICAgICAgICdzZW5kLWNvZGUnOiBbJ0VudmlhciBjw7NkaWdvJywgYExlIGxsZWdhIGEgJHtuYW1lfSB1biBjw7NkaWdvIGRlIDYgZMOtZ2l0b3MgYSBzdSBjb3JyZW8gcGFyYSBlbnRyYXIgbyBjYW1iaWFyIHN1IGNsYXZlLmBdLAogICAgICAgICdpbXBlcnNvbmF0ZSc6IFsnRW50cmFyIGNvbW8gJyArIG5hbWUsICdWZXLDoXMgbGEgYXBwIGNvbW8gbGEgdmUgZXN0YSBwZXJzb25hLCBzaW4gbmVjZXNpdGFyIHN1IGNsYXZlLiBRdWVkYSByZWdpc3RyYWRvLiBQYXJhIHNhbGlyIGFwcmlldGEgIlZvbHZlciBhIG1pIGN1ZW50YSIuJ10sCiAgICAgIH07CiAgICAgIGlmICghYXdhaXQgY29uZmlybUJveCh0ZXh0c1traW5kXVswXSwgdGV4dHNba2luZF1bMV0pKSByZXR1cm47CiAgICAgIHRyeSB7CiAgICAgICAgY29uc3QgciA9IGF3YWl0IGFwaShgL2FwaS9hZG1pbi91c2Vycy8ke2lkfS8ke2tpbmR9YCwgeyBtZXRob2Q6ICdQT1NUJyB9KTsKICAgICAgICBpZiAoa2luZCA9PT0gJ2ltcGVyc29uYXRlJykgeyBsb2NhdGlvbi5ocmVmID0gJy8nOyByZXR1cm47IH0KICAgICAgICBpZiAoci5wYXNzd29yZCB8fCByLmNvZGUpIHsKICAgICAgICAgIGNvbnN0IHZhbCA9IHIucGFzc3dvcmQgfHwgci5jb2RlOwogICAgICAgICAgYXdhaXQgY29uZmlybUJveChraW5kID09PSAndGVtcC1wYXNzd29yZCcgPyAnQ2xhdmUgdGVtcG9yYWwgZGUgJyArIG5hbWUgOiAnQ2xhdmUgZGUgcmVzcGFsZG8gZGUgJyArIG5hbWUsCiAgICAgICAgICAgIGtpbmQgPT09ICd0ZW1wLXBhc3N3b3JkJyA/ICdEw61zZWxhIGFsIHVzdWFyaW8uIFNvbG8gc2UgbXVlc3RyYSBhaG9yYTsgYWwgZW50cmFyIHRlbmRyw6EgcXVlIGNyZWFyIHN1IHByb3BpYSBjbGF2ZS4nIDogJ1DDoXNhc2VsYSBhbCB1c3VhcmlvIHBhcmEgcXVlIGxhIGd1YXJkZSBlbiB1biBsdWdhciBzZWd1cm8uIFNpcnZlIHVuYSBzb2xhIHZleiwgZW4gZWwgY2FtcG8gQ29udHJhc2XDsWEuIFNvbG8gc2UgbXVlc3RyYSBhaG9yYS4nLAogICAgICAgICAgICBgPGRpdiBjbGFzcz0iY29weSI+PGlucHV0IHR5cGU9InRleHQiIHJlYWRvbmx5IHZhbHVlPSIke2VzYyh2YWwpfSIgc3R5bGU9ImZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZToyMHB4O3RleHQtYWxpZ246Y2VudGVyIj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWNvcHk9IiR7ZXNjKHZhbCl9Ij5Db3BpYXI8L2J1dHRvbj48L2Rpdj5gKTsKICAgICAgICB9IGVsc2UgdG9hc3Qoci5tZXNzYWdlIHx8ICdMaXN0bycpOwogICAgICAgIHJlbmRlckFkbWluKCk7CiAgICAgIH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSwgNTAwMCk7IH0KICAgICAgcmV0dXJuOwogICAgfQogICAgY29uc3QgcyA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLWRlbHNdJyksIHUgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1kZWx1XScpLCBwID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtcHddJyk7CiAgICBpZiAocyAmJiBhd2FpdCBjb25maXJtQm94KCdFbGltaW5hciB2ZW5kZWRvcicsICdTZSBib3JyYW4gc3VzIGNvbmV4aW9uZXMsIGJsb3F1ZW9zLCBwZWRpZG9zIHkgdXN1YXJpb3MuJykpIHsgYXdhaXQgYXBpKGAvYXBpL2FkbWluL3NlbGxlcnMvJHtzLmRhdGFzZXQuZGVsc31gLCB7IG1ldGhvZDogJ0RFTEVURScgfSk7IHRvYXN0KCdWZW5kZWRvciBlbGltaW5hZG8nKTsgcmVuZGVyQWRtaW4oKTsgfQogICAgaWYgKHUgJiYgYXdhaXQgY29uZmlybUJveCgnRWxpbWluYXIgdXN1YXJpbycsICdZYSBubyBwb2Ryw6EgZW50cmFyIGEgRXRpcXVldGFIdWIuJykpIHsgYXdhaXQgYXBpKGAvYXBpL2FkbWluL3VzZXJzLyR7dS5kYXRhc2V0LmRlbHV9YCwgeyBtZXRob2Q6ICdERUxFVEUnIH0pOyB0b2FzdCgnVXN1YXJpbyBlbGltaW5hZG8nKTsgcmVuZGVyQWRtaW4oKTsgfQogICAgaWYgKHAgJiYgYXdhaXQgY29uZmlybUJveCgnQ2FtYmlhciBjb250cmFzZcOxYScsICdFc2NyaWJlIGxhIG51ZXZhIGNvbnRyYXNlw7FhIChtw61uaW1vIDggY2FyYWN0ZXJlcykuJywgJzxpbnB1dCB0eXBlPSJ0ZXh0IiBpZD0iY2ZQdyIgbWlubGVuZ3RoPSI4Ij4nKSkgewogICAgICB0cnkgeyBhd2FpdCBhcGkoYC9hcGkvYWRtaW4vdXNlcnMvJHtwLmRhdGFzZXQucHd9L3Bhc3N3b3JkYCwgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBwYXNzd29yZDogJCgnI2NmUHcnKS52YWx1ZSB9IH0pOyB0b2FzdCgnQ29udHJhc2XDsWEgYWN0dWFsaXphZGEnKTsgfSBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlKTsgfQogICAgfQogIH07Cn0KCi8vIC0tLS0tLS0tLS0gbWkgY2xhdmUgLS0tLS0tLS0tLQpmdW5jdGlvbiByZW5kZXJNeUFjY291bnQoZm9yY2VkID0gZmFsc2UpIHsKICAkKCcjYXBwJykuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9ImxvZ2luIj48ZGl2IGNsYXNzPSJjYXJkIj48ZGl2IGNsYXNzPSJhcnQiPiR7SEVST19TVkd9PC9kaXY+PGZvcm0gaWQ9Im15Rm9ybSI+CiAgICA8aDE+JHtmb3JjZWQgPyAnQ3JlYSB0dSBjbGF2ZSBudWV2YScgOiAnTWkgY2xhdmUnfTwvaDE+CiAgICA8cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJtYXJnaW46MCI+JHtmb3JjZWQgPyAnRW50cmFzdGUgY29uIHVuYSBjbGF2ZSB0ZW1wb3JhbCBvIGRlIHJlc3BhbGRvLiBDcmVhIHR1IHByb3BpYSBjb250cmFzZcOxYSBwYXJhIHNlZ3Vpci4nIDogZXNjKG1lLnVzZXIuZW1haWwpfTwvcD4KICAgICR7Zm9yY2VkID8gJycgOiAnPGxhYmVsIGNsYXNzPSJmIj5Db250cmFzZcOxYSBhY3R1YWw8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJtQ3VyIiBhdXRvY29tcGxldGU9ImN1cnJlbnQtcGFzc3dvcmQiIHJlcXVpcmVkPjwvbGFiZWw+J30KICAgIDxsYWJlbCBjbGFzcz0iZiI+TnVldmEgY29udHJhc2XDsWEgKG3DrW5pbW8gOCk8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJtUDEiIGF1dG9jb21wbGV0ZT0ibmV3LXBhc3N3b3JkIiBtaW5sZW5ndGg9IjgiIHJlcXVpcmVkPjwvbGFiZWw+CiAgICA8bGFiZWwgY2xhc3M9ImYiPlJlcMOtdGVsYTxpbnB1dCB0eXBlPSJwYXNzd29yZCIgaWQ9Im1QMiIgYXV0b2NvbXBsZXRlPSJuZXctcGFzc3dvcmQiIG1pbmxlbmd0aD0iOCIgcmVxdWlyZWQ+PC9sYWJlbD4KICAgIDxsYWJlbCBjbGFzcz0ic3dpdGNoIiBzdHlsZT0iZm9udC1zaXplOjEzcHgiPjxpbnB1dCB0eXBlPSJjaGVja2JveCIgaWQ9Im1TaG93Ij4gTW9zdHJhciBjb250cmFzZcOxYTwvbGFiZWw+CiAgICA8ZGl2IGNsYXNzPSJlcnIiIGlkPSJtRXJyIj48L2Rpdj4KICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgdHlwZT0ic3VibWl0Ij5HdWFyZGFyPC9idXR0b24+CiAgICAke2ZvcmNlZCA/ICcnIDogJzxidXR0b24gY2xhc3M9ImJ0biBidG4tZ2hvc3QiIHR5cGU9ImJ1dHRvbiIgaWQ9Im1CYWNrdXAiPkNyZWFyIG1pIGNsYXZlIGRlIHJlc3BhbGRvPC9idXR0b24+PGRpdiBpZD0ibUJhY2t1cE91dCI+PC9kaXY+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIiB0eXBlPSJidXR0b24iIGlkPSJtQmFjayI+Vm9sdmVyPC9idXR0b24+J30KICA8L2Zvcm0+PC9kaXY+PC9kaXY+YDsKICAkKCcjbVNob3cnKS5vbmNoYW5nZSA9IGUgPT4geyAkJCgnI215Rm9ybSBpbnB1dFt0eXBlPXBhc3N3b3JkXSwgI215Rm9ybSBpbnB1dFtkYXRhLXB3XScpLmZvckVhY2goaSA9PiB7IGkuZGF0YXNldC5wdyA9IDE7IGkudHlwZSA9IGUudGFyZ2V0LmNoZWNrZWQgPyAndGV4dCcgOiAncGFzc3dvcmQnOyB9KTsgfTsKICAkKCcjbXlGb3JtJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgIGUucHJldmVudERlZmF1bHQoKTsKICAgIGlmICgkKCcjbVAxJykudmFsdWUgIT09ICQoJyNtUDInKS52YWx1ZSkgcmV0dXJuICgkKCcjbUVycicpLnRleHRDb250ZW50ID0gJ0xhcyBjb250cmFzZcOxYXMgbm8gY29pbmNpZGVuJyk7CiAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvbWUvcGFzc3dvcmQnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGN1cnJlbnQ6IGZvcmNlZCA/ICcnIDogJCgnI21DdXInKS52YWx1ZSwgcGFzc3dvcmQ6ICQoJyNtUDEnKS52YWx1ZSB9IH0pOyB0b2FzdCgnQ29udHJhc2XDsWEgZ3VhcmRhZGEnKTsgYm9vdCgpOyB9CiAgICBjYXRjaCAoeCkgeyAkKCcjbUVycicpLnRleHRDb250ZW50ID0geC5tZXNzYWdlOyB9CiAgfTsKICBpZiAoIWZvcmNlZCkgewogICAgJCgnI21CYWNrJykub25jbGljayA9ICgpID0+IGJvb3QoKTsKICAgICQoJyNtQmFja3VwJykub25jbGljayA9IGFzeW5jICgpID0+IHsKICAgICAgdHJ5IHsKICAgICAgICBjb25zdCByID0gYXdhaXQgYXBpKCcvYXBpL21lL2JhY2t1cC1jb2RlJywgeyBtZXRob2Q6ICdQT1NUJyB9KTsKICAgICAgICAkKCcjbUJhY2t1cE91dCcpLmlubmVySFRNTCA9IGA8cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTNweDttYXJnaW46MCAwIDZweCI+R3XDoXJkYWxhIGVuIHVuIGx1Z2FyIHNlZ3VybyAoZm90bywgcGFwZWwgbyBub3RhcyBkZWwgY2VsdWxhcikuIFNpcnZlIHVuYSBzb2xhIHZleiBlbiBlbCBjYW1wbyBDb250cmFzZcOxYSBzaSBvbHZpZGFzIHR1IGNsYXZlLiBTaSBjcmVhcyBvdHJhLCBlc3RhIGRlamEgZGUgc2VydmlyLjwvcD48aW5wdXQgdHlwZT0idGV4dCIgcmVhZG9ubHkgdmFsdWU9IiR7ZXNjKHIuY29kZSl9IiBzdHlsZT0iZm9udC1mYW1pbHk6dmFyKC0tbW9ubyk7Zm9udC1zaXplOjIwcHg7dGV4dC1hbGlnbjpjZW50ZXIiPmA7CiAgICAgIH0gY2F0Y2ggKHgpIHsgJCgnI21FcnInKS50ZXh0Q29udGVudCA9IHgubWVzc2FnZTsgfQogICAgfTsKICB9Cn0KCi8vIC0tLS0tLS0tLS0gaW5pY2lvIC0tLS0tLS0tLS0KYXN5bmMgZnVuY3Rpb24gYm9vdCgpIHsKICB0cnkgeyBtZSA9IGF3YWl0IGFwaSgnL2FwaS9tZScpOyB9CiAgY2F0Y2ggewogICAgY29uc3QgaCA9IGF3YWl0IGZldGNoKCcvYXBpL3NldHVwLXN0YXR1cycpLnRoZW4ociA9PiByLmpzb24oKSkuY2F0Y2goKCkgPT4gKHt9KSk7CiAgICByZXR1cm4gaC5uZWVkc1NldHVwID8gcmVuZGVyU2V0dXAoKSA6IHJlbmRlckxvZ2luKGguZGVtbyk7CiAgfQogIGZpcnN0TG9hZCA9IHRydWU7CiAgaWYgKG1lLm11c3RDaGFuZ2UpIHJldHVybiByZW5kZXJNeUFjY291bnQodHJ1ZSk7CiAgaWYgKGxvY2F0aW9uLnBhdGhuYW1lID09PSAnL2NvZGlnbycpIHJldHVybiBzYXZlQ29kZUZyb21MaW5rKCk7CiAgcmVuZGVyU2hlbGwoKTsKfQpib290KCk7Cn0pKCk7CgovLyBjYWRhIG1pbnV0bzogc2kgYWxnw7puIHBhcXVldGUgZW50cmEgZW4gIkFkdmVydGVuY2lhIiBvIHBhc2EgYSAiQXRyYXNhZGFzIiwgc2UgYWN0dWFsaXphIGxhIGJhbmRlamEKbGV0IF9hbGVydFNpZyA9ICcnOwpzZXRJbnRlcnZhbCgoKSA9PiB7CiAgdHJ5IHsKICAgIGlmICh0eXBlb2Ygb3JkZXJzID09PSAndW5kZWZpbmVkJyB8fCAhJCgnI3RhYnNCaWcnKSkgcmV0dXJuOwogICAgY29uc3Qgc2lnID0gb3JkZXJzLmZpbHRlcihvID0+IGlzV2FybihvKSB8fCBsYXRlTm93KG8pKS5tYXAobyA9PiBvLmlkICsgKGlzV2FybihvKSA/ICd3JyArIG1pbnNMZWZ0KG8pIDogJ2wnKSkuam9pbignLCcpOwogICAgaWYgKHNpZyA9PT0gX2FsZXJ0U2lnKSByZXR1cm47CiAgICBfYWxlcnRTaWcgPSBzaWc7CiAgICBpZiAoIWRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNtYWluIGlucHV0OmZvY3VzLCAjbWFpbiBzZWxlY3Q6Zm9jdXMnKSkgZHJhd1Jvd3MoKTsKICB9IGNhdGNoIHsgLyogbmFkYSAqLyB9Cn0sIDYwZTMpOwo=","index.html":"PCFkb2N0eXBlIGh0bWw+CjxodG1sIGxhbmc9ImVzIj4KPGhlYWQ+CjxtZXRhIGNoYXJzZXQ9InV0Zi04Ij4KPG1ldGEgbmFtZT0idmlld3BvcnQiIGNvbnRlbnQ9IndpZHRoPWRldmljZS13aWR0aCwgaW5pdGlhbC1zY2FsZT0xLCB2aWV3cG9ydC1maXQ9Y292ZXIiPgo8dGl0bGU+RXRpcXVldGFIdWI8L3RpdGxlPgo8bGluayByZWw9Imljb24iIGhyZWY9Ii9sb2dvLnN2ZyIgdHlwZT0iaW1hZ2Uvc3ZnK3htbCI+CjxsaW5rIHJlbD0icHJlY29ubmVjdCIgaHJlZj0iaHR0cHM6Ly9mb250cy5nb29nbGVhcGlzLmNvbSI+CjxsaW5rIHJlbD0ic3R5bGVzaGVldCIgaHJlZj0iaHR0cHM6Ly9mb250cy5nb29nbGVhcGlzLmNvbS9jc3MyP2ZhbWlseT1CYWxvbysyOndnaHRANjAwOzcwMDs4MDAmZmFtaWx5PVBhY2lmaWNvJmZhbWlseT1OdW5pdG8rU2FuczpvcHN6LHdnaHRANi4uMTIsNDAwOzYuLjEyLDYwMDs2Li4xMiw3MDAmZmFtaWx5PUpldEJyYWlucytNb25vOndnaHRANTAwOzcwMCZkaXNwbGF5PXN3YXAiPgo8bGluayByZWw9InN0eWxlc2hlZXQiIGhyZWY9Ii9hcHAuY3NzIj4KPC9oZWFkPgo8Ym9keT4KPGRpdiBpZD0iYXBwIj48ZGl2IHN0eWxlPSJtaW4taGVpZ2h0OjEwMHZoO2Rpc3BsYXk6Z3JpZDtwbGFjZS1pdGVtczpjZW50ZXI7Zm9udC1mYW1pbHk6c3lzdGVtLXVpLHNhbnMtc2VyaWY7Y29sb3I6IzBBNkZBNjtmb250LXdlaWdodDo3MDAiPkNhcmdhbmRvIEV0aXF1ZXRhSHVi4oCmIChsYSBwcmltZXJhIHZleiBwdWVkZSB0YXJkYXIgaGFzdGEgMSBtaW51dG8pPC9kaXY+PC9kaXY+CjxkaXYgY2xhc3M9InRvYXN0IiBpZD0idG9hc3QiIGhpZGRlbj48L2Rpdj4KPHNjcmlwdCBzcmM9Ii9hcHAuanMiPjwvc2NyaXB0Pgo8L2JvZHk+CjwvaHRtbD4K","logo.svg":"PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0MCA0MCI+PHJlY3QgeD0iNCIgeT0iOCIgd2lkdGg9IjMyIiBoZWlnaHQ9IjI2IiByeD0iNyIgZmlsbD0iIzE2OTNEMyIvPjxwYXRoIGQ9Ik00IDE2aDMyIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iMi41Ii8+PHJlY3QgeD0iMTAiIHk9IjIxIiB3aWR0aD0iMTIiIGhlaWdodD0iMyIgcng9IjEuNSIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjEwIiB5PSIyNiIgd2lkdGg9IjgiIGhlaWdodD0iMyIgcng9IjEuNSIgZmlsbD0iI0JGRTZGOCIvPjxjaXJjbGUgY3g9IjI5IiBjeT0iMjYiIHI9IjQiIGZpbGw9IiNmZmYiLz48L3N2Zz4K"};
__req('index', './start');
