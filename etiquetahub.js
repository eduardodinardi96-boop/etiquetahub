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
  marketplace TEXT NOT NULL,
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

// Canales nuevos (Shopify, WooCommerce, Jumpseller…): la tabla connections tenía un CHECK solo con ml/fa/pa/demo
try {
  const c = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='connections'").get();
  if (c && /CHECK\s*\(\s*marketplace IN/i.test(c.sql)) {
    const cols = db.prepare('PRAGMA table_info(connections)').all().map(x => '"' + x.name + '"').join(',');
    const newSql = c.sql.replace(/CREATE TABLE\s+(IF NOT EXISTS\s+)?["`]?connections["`]?/i, 'CREATE TABLE connections__new').replace(/\s*CHECK\s*\(\s*marketplace IN \([^)]*\)\s*\)/i, '');
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      db.exec(newSql);
      db.exec(`INSERT INTO connections__new (${cols}) SELECT ${cols} FROM connections`);
      db.exec('DROP TABLE connections');
      db.exec('ALTER TABLE connections__new RENAME TO connections');
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; } finally { db.exec('PRAGMA foreign_keys = ON'); }
  }
} catch (e) { console.warn('[db] canales nuevos:', e.message); }

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
  const row = db.prepare(`SELECT u.id, u.email, u.name, u.role, u.seller_id, u.must_change, u.space_id, u.superadmin, s.expires_at, s.impersonator_id FROM sessions s
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

__defs["spaces"] = function (module, exports, require, __dirname) {
// Espacios: cada empresa que usa EtiquetaHub tiene su propio espacio (sus vendedores, usuarios, pedidos y ajustes).
// Nadie ve lo de otro espacio. El espacio 1 es el original (el del dueño de la app) y queda con todo prendido.
// Módulos: interruptores por espacio (fulfillment, MKP Flash, calculadora…). Prueba gratis de 14 días para espacios nuevos.
const db = require('./db');

const MODULES = {
  fulfillment: { name: 'Fulfillment', desc: 'Proveedor de fulfillment: bloqueo de etiquetas por producto, pedidos numerados, "Bloqueadas", "Desbloqueadas", usuarios de fulfillment y resumen de paquetes.', def: false },
  mkp: { name: 'MKP Flash', desc: 'Preguntas, mensajes, reclamos, devoluciones y atrasados de Mercado Libre y Falabella en un solo lugar.', def: true },
  sales: { name: 'Análisis ventas', desc: 'Gráficos de ventas por marketplace y planilla de productos vendidos.', def: true },
  profit: { name: 'Calculadora de ganancia', desc: 'Ganancia neta por publicación con comisión, envío, TACOS, devoluciones y logística inversa.', def: true },
  stock: { name: 'Control de stock', desc: 'Un solo stock por SKU para todas tus cuentas y marketplaces: cada venta descuenta y se actualiza en todas tus publicaciones. Bodegas compartidas o separadas; se activa recién cuando cargas las cantidades y las confirmas.', def: false },
  codes: { name: 'Códigos de devolución', desc: 'Código diario de autorización de devoluciones de Mercado Libre (y usuario "agencia").', def: true },
};
const TRIAL_DAYS = 14;

db.exec(`CREATE TABLE IF NOT EXISTS spaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  modules TEXT NOT NULL DEFAULT '{}',
  trial_until TEXT,
  paid_until TEXT,
  blocked INTEGER NOT NULL DEFAULT 0,
  phone TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)`);
for (const [t, c, def] of [['sellers', 'space_id', 'INTEGER NOT NULL DEFAULT 1'], ['users', 'space_id', 'INTEGER NOT NULL DEFAULT 1'], ['users', 'superadmin', 'INTEGER NOT NULL DEFAULT 0'], ['users', 'phone', 'TEXT']]) {
  const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(x => x.name);
  if (!cols.includes(c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`);
}
// Espacio original: todo prendido (incluido el fulfillment) y sin vencimiento
if (!db.prepare('SELECT id FROM spaces WHERE id=1').get()) {
  const all = Object.fromEntries(Object.keys(MODULES).map(k => [k, true]));
  db.prepare("INSERT INTO spaces (id, name, modules, paid_until) VALUES (1, 'Espacio principal', ?, '2099-12-31')").run(JSON.stringify(all));
}
// Dueño de la app: puede ver todos los espacios, extender plazos y entrar a cualquiera
// (varios correos separados por coma)
const OWNER = String(process.env.OWNER_EMAILS || process.env.OWNER_EMAIL || 'eduardo.dinardi96@gmail.com,chileshoesoficial@gmail.com').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
try { for (const e of OWNER) db.prepare('UPDATE users SET superadmin=1 WHERE lower(email)=? AND superadmin=0').run(e); } catch { /* sin usuarios aún */ }

const get = id => db.prepare('SELECT * FROM spaces WHERE id=?').get(Number(id) || 1);
function modulesOf(space) {
  let m = {}; try { m = JSON.parse(space?.modules || '{}'); } catch { m = {}; }
  // el espacio principal (el del dueño de la app) no usa el control de stock: siempre apagado
  return Object.fromEntries(Object.entries(MODULES).map(([k, v]) => [k, v.locked1 && space?.id === 1 ? false : k in m ? Boolean(m[k]) : v.def]));
}
const spaceOfUser = u => get(u?.space_id || 1);
const spaceOfSeller = sid => { const s = db.prepare('SELECT space_id FROM sellers WHERE id=?').get(Number(sid)); return s ? s.space_id : null; };
const has = (u, mod) => modulesOf(spaceOfUser(u))[mod];
// ¿el vendedor está en un espacio con el fulfillment prendido? (cache corto: se consulta en cada pedido)
const ffCache = new Map();
function ffOnForSeller(sid) {
  const c = ffCache.get(sid);
  if (c && Date.now() - c.at < 30e3) return c.on;
  const sp = spaceOfSeller(sid);
  const on = sp == null ? true : modulesOf(get(sp)).fulfillment;
  ffCache.set(sid, { at: Date.now(), on });
  return on;
}

// Vendedores que puede ver este usuario (su espacio; el vendedor, solo el suyo)
function sellerIds(u) {
  if (u.role === 'seller') return [u.seller_id];
  return db.prepare('SELECT id FROM sellers WHERE space_id=?').all(u.space_id || 1).map(r => r.id);
}
const canSeller = (u, sid) => sellerIds(u).includes(Number(sid));
// todos los vendedores del espacio del usuario (aunque sea vendedor): para vistas sin precios
const spaceSellerIds = u => db.prepare('SELECT id FROM sellers WHERE space_id=?').all(u.space_id || 1).map(r => r.id);
const inList = (ids, col) => ids.length ? { sql: `${col} IN (${ids.map(() => '?').join(',')})`, args: ids } : { sql: '0', args: [] };

// Estado del plan: activo (pagado o en prueba) o bloqueado
function status(space) {
  if (!space) return { active: false, reason: 'Espacio no encontrado' };
  const today = new Date().toISOString().slice(0, 10);
  if (space.blocked) return { active: false, reason: 'blocked', until: null };
  if (space.paid_until && space.paid_until >= today) return { active: true, kind: 'paid', until: space.paid_until };
  if (space.trial_until && space.trial_until >= today) return { active: true, kind: 'trial', until: space.trial_until, daysLeft: Math.max(0, Math.round((new Date(space.trial_until + 'T12:00:00Z') - new Date(today + 'T12:00:00Z')) / 864e5)) };
  return { active: false, reason: 'expired', until: space.trial_until || space.paid_until || null };
}

function setModules(spaceId, changes) {
  const sp = get(spaceId); if (!sp) throw new Error('Espacio no encontrado');
  const cur = modulesOf(sp);
  for (const [k, v] of Object.entries(changes || {})) if (k in MODULES && !(MODULES[k].locked1 && sp.id === 1)) cur[k] = Boolean(v);
  db.prepare('UPDATE spaces SET modules=? WHERE id=?').run(JSON.stringify(cur), sp.id);
  ffCache.clear();
  return cur;
}

// Registro: crea el espacio (14 días gratis), su primera empresa/vendedor y el usuario administrador
function register({ company, name, email, passHash, phone }) {
  const trial = new Date(Date.now() + TRIAL_DAYS * 864e5).toISOString().slice(0, 10);
  const mods = Object.fromEntries(Object.entries(MODULES).map(([k, v]) => [k, v.def])); // sin fulfillment
  db.exec('BEGIN');
  try {
    const spId = Number(db.prepare('INSERT INTO spaces (name, modules, trial_until, phone) VALUES (?,?,?,?)').run(company, JSON.stringify(mods), trial, phone || null).lastInsertRowid);
    db.prepare('INSERT INTO sellers (name, space_id) VALUES (?,?)').run(company, spId);
    const uid = Number(db.prepare("INSERT INTO users (email, name, role, pass_hash, space_id, phone) VALUES (?,?,'admin',?,?,?)").run(email, name, passHash, spId, phone || null).lastInsertRowid);
    db.exec('COMMIT');
    return { spaceId: spId, userId: uid, trial };
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

// Panel del dueño: todos los espacios
function list() {
  return db.prepare('SELECT * FROM spaces ORDER BY id').all().map(s => ({
    id: s.id, name: s.name, created_at: s.created_at, trial_until: s.trial_until, paid_until: s.paid_until, blocked: Boolean(s.blocked), phone: s.phone,
    plan: s.plan || null, mp_status: s.mp_status || null, mp_next: s.mp_next || null,
    modules: modulesOf(s), status: status(s),
    sellers: db.prepare('SELECT COUNT(*) n FROM sellers WHERE space_id=?').get(s.id).n,
    users: db.prepare('SELECT COUNT(*) n FROM users WHERE space_id=?').get(s.id).n,
    admin: db.prepare("SELECT id, name, email FROM users WHERE space_id=? AND role='admin' ORDER BY id LIMIT 1").get(s.id) || null,
    orders30: db.prepare("SELECT COUNT(*) n FROM orders WHERE seller_id IN (SELECT id FROM sellers WHERE space_id=?) AND created_at >= datetime('now','-30 day')").get(s.id).n,
  }));
}
// El dueño extiende o fija el plazo de un espacio, o lo bloquea / desbloquea
function setAccess(spaceId, { addDays, until, blocked }) {
  const sp = get(spaceId); if (!sp || (sp.id === 1 && blocked)) throw new Error('No se puede cambiar ese espacio');
  if (blocked !== undefined) db.prepare('UPDATE spaces SET blocked=? WHERE id=?').run(blocked ? 1 : 0, sp.id);
  if (until) db.prepare('UPDATE spaces SET paid_until=? WHERE id=?').run(String(until).slice(0, 10), sp.id);
  if (addDays) {
    const today = new Date().toISOString().slice(0, 10);
    const base = [sp.paid_until, sp.trial_until, today].filter(Boolean).sort().pop();
    const d = new Date(base + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + Number(addDays));
    db.prepare('UPDATE spaces SET paid_until=? WHERE id=?').run(d.toISOString().slice(0, 10), sp.id);
  }
  return get(sp.id);
}

module.exports = { spaceSellerIds, MODULES, TRIAL_DAYS, get, modulesOf, spaceOfUser, spaceOfSeller, has, ffOnForSeller, sellerIds, canSeller, inList, status, setModules, register, list, setAccess, OWNER };

};

__defs["billing"] = function (module, exports, require, __dirname) {
// Cobro de la app con Mercado Pago Suscripciones (cobro automático mensual con tarjeta).
// La empresa elige un plan → Mercado Pago le muestra su página de pago → al quedar "autorizada" la suscripción,
// la app extiende el plazo del espacio hasta el próximo cobro (+3 días de gracia). Si el cobro falla o la
// cancelan, el espacio se bloquea al vencer. No hace falta configurar webhooks: la app revisa el estado sola
// (al volver del pago, al abrir "Mi plan" y cada 3 horas); si se configura el webhook, se actualiza al instante.
const db = require('./db');
const cfg = require('./config');
const settings = require('./settings');
const { request } = require('./http');

const API = process.env.MP_API || 'https://api.mercadopago.com';
const GRACE_DAYS = 3;
const DEFAULT_PLANS = [
  { id: 'inicial', name: 'Inicial', price: 24990, orders: 300 },
  { id: 'pyme', name: 'Pyme', price: 49990, orders: 1500 },
  { id: 'pro', name: 'Pro', price: 89990, orders: 5000 },
  { id: 'grande', name: 'Grande', price: 149990, orders: 0 },
];
const IVA = 0.19;

for (const [c, def] of [['plan', 'TEXT'], ['mp_sub_id', 'TEXT'], ['mp_status', 'TEXT'], ['mp_next', 'TEXT'], ['mp_checked', 'INTEGER']]) {
  const cols = db.prepare('PRAGMA table_info(spaces)').all().map(x => x.name);
  if (!cols.includes(c)) db.exec(`ALTER TABLE spaces ADD COLUMN ${c} ${def}`);
}
db.exec(`CREATE TABLE IF NOT EXISTS billing_log (id INTEGER PRIMARY KEY AUTOINCREMENT, space_id INTEGER, kind TEXT, detail TEXT, amount REAL, at TEXT DEFAULT (datetime('now')))`);

const token = () => settings.get('mp_access_token') || '';
const configured = () => Boolean(token());
function plans() {
  try { const p = JSON.parse(settings.get('plans') || 'null'); if (Array.isArray(p) && p.length) return p; } catch { /* por defecto */ }
  return DEFAULT_PLANS;
}
function savePlans(list) {
  const clean = (list || []).map((p, i) => ({ id: String(p.id || p.name || 'plan' + i).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30) || 'plan' + i, name: String(p.name || '').trim().slice(0, 30), price: Math.max(0, Math.round(Number(p.price) || 0)), orders: Math.max(0, Math.round(Number(p.orders) || 0)) }))
    .filter(p => p.name && p.price > 0);
  if (!clean.length) throw new Error('Agrega al menos un plan con nombre y precio');
  settings.set('plans', JSON.stringify(clean));
  return clean;
}
const withIva = price => Math.round(price * (1 + IVA));
const mp = (method, path, body) => {
  if (!configured()) throw new Error('Mercado Pago aún no está configurado (Nube de empresas › Cobros)');
  return request(API + path, { method, headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }, { retries: 1 });
};
const log = (spaceId, kind, detail, amount = null) => db.prepare('INSERT INTO billing_log (space_id, kind, detail, amount) VALUES (?,?,?,?)').run(spaceId, kind, String(detail).slice(0, 300), amount);

// Crea la suscripción y devuelve el link de pago de Mercado Pago
async function subscribe(space, planId, payerEmail) {
  const p = plans().find(x => x.id === planId); if (!p) throw new Error('Plan no encontrado');
  // si tenía una suscripción anterior pendiente o activa, se cancela para no cobrar dos veces
  if (space.mp_sub_id && ['pending', 'authorized', 'paused'].includes(space.mp_status)) {
    try { await mp('PUT', `/preapproval/${space.mp_sub_id}`, { status: 'cancelled' }); } catch { /* ya no existe */ }
  }
  const r = await mp('POST', '/preapproval', {
    reason: `EtiquetaHub · Plan ${p.name} · ${space.name}`.slice(0, 120),
    external_reference: `eh-space-${space.id}-${p.id}`,
    payer_email: payerEmail,
    back_url: `${cfg.baseUrl}/?pago=1`,
    status: 'pending',
    auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: withIva(p.price), currency_id: 'CLP' },
  });
  db.prepare('UPDATE spaces SET mp_sub_id=?, mp_status=?, plan=? WHERE id=?').run(String(r.id), r.status || 'pending', p.id, space.id);
  log(space.id, 'suscripcion', `Inició suscripción plan ${p.name} (${withIva(p.price)} con IVA)`);
  return { url: r.init_point, id: r.id };
}

// Lee el estado real de la suscripción en Mercado Pago y ajusta el plazo del espacio
async function sync(spaceId) {
  const sp = db.prepare('SELECT * FROM spaces WHERE id=?').get(spaceId);
  if (!sp || !sp.mp_sub_id || !configured()) return sp;
  let r;
  try { r = await mp('GET', `/preapproval/${sp.mp_sub_id}`); } catch (e) { log(sp.id, 'error', e.message); return sp; }
  const status = r.status || sp.mp_status;
  const next = r.next_payment_date ? String(r.next_payment_date).slice(0, 10) : null;
  // pagado hasta: el próximo cobro + días de gracia (mientras la suscripción esté autorizada)
  if (status === 'authorized' && next) {
    const d = new Date(next + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + GRACE_DAYS);
    const until = d.toISOString().slice(0, 10);
    if (!sp.paid_until || until > sp.paid_until) {
      db.prepare('UPDATE spaces SET paid_until=? WHERE id=?').run(until, sp.id);
      log(sp.id, 'pago', `Suscripción al día: activo hasta ${until}`, r.auto_recurring?.transaction_amount || null);
    }
  }
  if (status !== sp.mp_status) log(sp.id, 'estado', `Suscripción ${sp.mp_status || '—'} → ${status}`);
  db.prepare('UPDATE spaces SET mp_status=?, mp_next=?, mp_checked=? WHERE id=?').run(status, next, Date.now(), sp.id);
  return db.prepare('SELECT * FROM spaces WHERE id=?').get(sp.id);
}

async function cancel(space) {
  if (!space.mp_sub_id) throw new Error('No tienes una suscripción activa');
  await mp('PUT', `/preapproval/${space.mp_sub_id}`, { status: 'cancelled' });
  db.prepare("UPDATE spaces SET mp_status='cancelled' WHERE id=?").run(space.id);
  log(space.id, 'cancelada', 'La empresa canceló su suscripción (sigue activa hasta la fecha pagada)');
}

// Aviso de Mercado Pago (webhook): se identifica la suscripción y se vuelve a leer desde Mercado Pago
async function notification(body, query) {
  const id = String(body?.data?.id || query.get('data.id') || query.get('id') || '');
  const type = String(body?.type || body?.topic || query.get('type') || query.get('topic') || '');
  if (!id) return;
  let subId = null;
  if (/preapproval/.test(type) && !/authorized_payment/.test(type)) subId = id;
  else if (/authorized_payment/.test(type)) { try { const p = await mp('GET', `/authorized_payments/${id}`); subId = p.preapproval_id; } catch { /* sin dato */ } }
  if (!subId) return;
  const sp = db.prepare('SELECT id FROM spaces WHERE mp_sub_id=?').get(String(subId));
  if (sp) await sync(sp.id);
}

// Revisión periódica de las suscripciones (cada 3 horas)
setInterval(async () => {
  if (!configured()) return;
  for (const s of db.prepare("SELECT id FROM spaces WHERE mp_sub_id IS NOT NULL AND mp_status IN ('pending','authorized','paused')").all()) { try { await sync(s.id); } catch { /* sigue */ } }
}, 3 * 3600e3).unref?.();

function info(space) {
  const p = plans();
  return { configured: configured(), plans: p.map(x => ({ ...x, total: withIva(x.price) })), current: space.plan || null, status: space.mp_status || null, next: space.mp_next || null, paid_until: space.paid_until || null };
}
const history = spaceId => db.prepare('SELECT kind, detail, amount, at FROM billing_log WHERE (? IS NULL OR space_id=?) ORDER BY id DESC LIMIT 100').all(spaceId ?? null, spaceId ?? null);

module.exports = { plans, savePlans, subscribe, sync, cancel, notification, info, history, configured, withIva };

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
const MK_NAME = { ...Object.fromEntries(Object.entries(require('./marketplaces').CATALOG).map(([k, v]) => [k, v.name.toUpperCase()])), demo: 'DEMO' };

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
  // Carrito (pack): el envío trae solo UNA de sus órdenes en order_id, así que se piden TODAS las órdenes del pack.
  // Si no, el paquete aparecería con menos productos de los que compró el cliente.
  const have = new Set(orders.map(o => String(o.id)));
  for (const packId of [...new Set(orders.map(o => o.pack_id).filter(Boolean))]) {
    try {
      const pk = await api(conn, `/packs/${packId}`);
      const missing = (pk?.orders || []).map(o => String(o.id || o)).filter(id => id && !have.has(id));
      for (const id of missing) { try { const o = await api(conn, `/orders/${id}`); if (o && o.status !== 'cancelled') { orders.push(o); have.add(id); } } catch { /* sigue */ } }
    } catch { /* sin acceso al pack: se usa el respaldo de abajo */ }
  }
  orders = orders.filter((o, i, a) => a.findIndex(x => String(x.id) === String(o.id)) === i);
  const items = [];
  for (const o of orders) for (const oi of o.order_items || []) {
    items.push({
      name: oi.item?.title, variant: variantText(oi.item || {}),
      sku: oi.item?.seller_sku || oi.item?.seller_custom_field || '', pub_id: oi.item?.id, qty: oi.quantity, up_id: oi.item?.user_product_id || undefined,
    });
  }
  // Respaldo: si el envío tiene más productos que las órdenes leídas, se agregan los que faltan desde el envío
  const shItems = Array.isArray(sh.shipping_items) ? sh.shipping_items : [];
  const shUnits = shItems.reduce((a, x) => a + Number(x.quantity || 1), 0), itUnits = items.reduce((a, x) => a + Number(x.qty || 1), 0);
  if (shUnits > itUnits) {
    const left = items.map(i => ({ ...i }));
    for (const si of shItems) {
      const k = left.findIndex(i => i.pub_id === si.id && (!si.user_product_id || !i.up_id || i.up_id === si.user_product_id) && i.qty > 0);
      if (k >= 0) { left[k].qty -= Number(si.quantity || 1); continue; }
      items.push({ name: si.description || 'Producto', variant: '', sku: '', pub_id: si.id, qty: Number(si.quantity || 1), up_id: si.user_product_id || undefined });
    }
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

// ---------- Control de stock ----------
// Publicaciones activas con su SKU y stock. ref = "MLC…" o "MLC…:variación". Las de Full las maneja Mercado Libre (full = true).
const skuOf = x => x?.seller_custom_field || (x?.attributes || []).find(a => a.id === 'SELLER_SKU')?.value_name || '';
async function stockListings(conn) {
  const uid = conn.creds.user_id, ids = [];
  for (const st of ['active', 'paused']) {
    let scroll = null;
    for (let i = 0; i < 100; i++) {
      const r = await api(conn, `/users/${uid}/items/search?status=${st}&search_type=scan&limit=100${scroll ? '&scroll_id=' + encodeURIComponent(scroll) : ''}`);
      ids.push(...(r?.results || [])); scroll = r?.scroll_id;
      if (!(r?.results || []).length || !scroll) break;
    }
  }
  const out = [];
  for (let i = 0; i < ids.length; i += 20) {
    const r = await api(conn, `/items?ids=${ids.slice(i, i + 20).join(',')}&include_attributes=all&attributes=id,title,available_quantity,variations,seller_custom_field,attributes,shipping,status`);
    for (const x of r || []) {
      const it = x?.body; if (!it || x.code !== 200) continue;
      const full = it.shipping?.logistic_type === 'fulfillment';
      if ((it.variations || []).length) for (const v of it.variations) {
        const name = (v.attribute_combinations || []).map(a => a.value_name).filter(Boolean).join(' / ');
        out.push({ ref: `${it.id}:${v.id}`, sku: skuOf(v) || '', title: it.title + (name ? ' · ' + name : ''), qty: v.available_quantity ?? null, full, paused: it.status === 'paused' });
      }
      else out.push({ ref: it.id, sku: skuOf(it), title: it.title, qty: it.available_quantity ?? null, full, paused: it.status === 'paused' });
    }
  }
  return out;
}
async function setStock(conn, ref, qty) {
  const [id, vid] = String(ref).split(':'), n = Math.max(0, qty);
  // Mercado Libre no acepta 0 en una publicación activa con variaciones únicas: se usa 0 igual (la pausa sola por falta de stock)
  if (vid) await apiSend(conn, 'PUT', `/items/${id}`, { variations: [{ id: Number(vid), available_quantity: n }] });
  else await apiSend(conn, 'PUT', `/items/${id}`, { available_quantity: n });
}

module.exports = { stockListings, setStock, raw: api, apiH, apiSend, itemIds, families, sales, debugOrder, refresh, authUrl, exchangeCode, whoAmI, listShipments, fetchLabel, fromNotification };

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
// ---------- Control de stock ----------
// Escritura (POST con XML): ProductUpdate cambia el stock de la unidad de negocio de Falabella Chile
async function callPost(creds, action, xml) {
  const p = { Action: action, Format: 'JSON', Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00'), UserID: creds.userId, Version: '1.0' };
  const qs = Object.keys(p).sort().map(k => `${enc(k)}=${enc(p[k])}`).join('&');
  const sig = crypto.createHmac('sha256', creds.apiKey).update(qs).digest('hex');
  const ua = `${creds.sellerId || 'SELLER'}/Node/22/PROPIA/${cfg.falabella.country}`;
  const r = await request(`${cfg.falabella.apiHost}/?${qs}&Signature=${sig}`, { method: 'POST', body: xml, headers: { 'user-agent': ua, accept: 'application/json', 'content-type': 'application/xml' } }, { retries: 0 });
  if (r?.ErrorResponse) { const h = r.ErrorResponse.Head || {}; throw new Error(`Falabella ${action}: ${h.ErrorMessage || 'error'} (${h.ErrorCode || '?'})`); }
  return r?.SuccessResponse || {};
}
async function stockListings(conn) {
  const out = [];
  for (let off = 0; off < 5000; off += 100) {
    const b = await call(conn.creds, 'GetProducts', { Filter: 'all', Limit: '100', Offset: String(off) });
    const ps = list(b.Products, 'Product');
    for (const p of ps) {
      const bu = list(p.BusinessUnits, 'BusinessUnit').find(x => /falabella/i.test(x?.BusinessUnit || '')) || {};
      const q = bu.Stock ?? p.Quantity ?? p.Stock;
      out.push({ ref: String(p.SellerSku), sku: String(p.SellerSku || ''), title: [p.Name, p.Variation].filter(Boolean).join(' · '), qty: q == null || q === '' ? null : Number(q) });
    }
    if (ps.length < 100) break;
  }
  return out;
}
const xmlEsc = s => String(s).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
async function setStock(conn, ref, qty) {
  const op = (cfg.falabella.country || 'FACL').toLowerCase();
  await callPost(conn.creds, 'ProductUpdate', `<?xml version="1.0" encoding="UTF-8" ?><Request><Product><SellerSku>${xmlEsc(ref)}</SellerSku><BusinessUnits><BusinessUnit><OperatorCode>${op}</OperatorCode><Stock>${Math.max(0, qty)}</Stock></BusinessUnit></BusinessUnits></Product></Request>`);
}

module.exports = { stockListings, setStock, list, call, refresh, debugOrder, sales, debugList, test, listShipments, fetchLabel, normalize, orderItems };

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
// ---------- Control de stock (API de stock de Paris: GET/POST /v2/stock, por SKU Marketplace "MK…") ----------
async function stockListings(conn) {
  const out = [];
  for (let offset = 0; offset < 20000; offset += 100) {
    const r = await api(conn, `/v2/stock?limit=100&offset=${offset}`);
    const list = r?.skus || r?.data || [];
    for (const x of list) {
      if (x.active === false) continue;
      out.push({ ref: String(x.sku), sku: String(x.sku_seller || x.skuSeller || x.sellerSku || '').trim(), title: x.title || x.sku, qty: x.quantity ?? x.availableStock ?? null, full: Boolean(x.isFulfillment) });
    }
    if (list.length < 100) break;
  }
  return out;
}
async function setStock(conn, ref, qty) {
  await api(conn, '/v2/stock', { method: 'POST', body: JSON.stringify({ skus: [{ sku: String(ref), quantity: Math.max(0, qty) }] }) });
}

module.exports = { stockListings, setStock, raw: api, flatten, refresh, debugOrder, sales, test, listShipments, fetchLabel };

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

__defs["marketplaces"] = function (module, exports, require, __dirname) {
// Catálogo único de canales de venta: marketplaces y tiendas propias.
// Cada canal define su nombre, color, comisión por defecto, si entrega etiqueta propia y su horario de despacho.
// Lo usan el servidor (ventas, calculadora, atrasos) y la pantalla (gráficos, filtros, conexiones).
const CATALOG = {
  ml: { name: 'Mercado Libre', short: 'ML', color: '#C99A00', icon: '🟡', kind: 'marketplace', fee: null, label: 'marketplace', cutoff: 'Flex 23:00 · Agencia según plazo de Mercado Libre' },
  fa: { name: 'Falabella', short: 'Falabella', color: '#4F8F00', icon: '🛍️', kind: 'marketplace', fee: 18, label: 'marketplace', cutoff: 'Fin del día de su plazo' },
  pa: { name: 'Paris', short: 'Paris', color: '#0068B8', icon: '🗼', kind: 'marketplace', fee: 18, label: 'marketplace', cutoff: 'Fin del día de despacho' },
  // tiendas propias: no entregan etiqueta de courier → EtiquetaHub genera su propia etiqueta 10x15
  sh: { name: 'Shopify', short: 'Shopify', color: '#008060', icon: '🛒', kind: 'store', fee: 3.5, label: 'own', cutoff: 'Según las horas de despacho que configures' },
  wc: { name: 'WooCommerce', short: 'Woo', color: '#7F54B3', icon: '🟣', kind: 'store', fee: 3.5, label: 'own', cutoff: 'Según las horas de despacho que configures' },
  js: { name: 'Jumpseller', short: 'Jumpseller', color: '#E4572E', icon: '🟠', kind: 'store', fee: 3.5, label: 'own', cutoff: 'Según las horas de despacho que configures' },
  // en preparación: sus APIs piden acceso de integrador o credenciales que se entregan a cada vendedor
  rp: { name: 'Ripley', short: 'Ripley', color: '#5B2C83', icon: '🟪', kind: 'marketplace', fee: 15, label: 'marketplace', soon: 'Ripley usa Mirakl (órdenes) y su SellerCenter (etiquetas). Se activa al obtener acceso de integrador y una cuenta para probar.' },
  wm: { name: 'Walmart / Lider', short: 'Lider', color: '#0071CE', icon: '🔵', kind: 'marketplace', fee: 15, label: 'marketplace', soon: 'Walmart Chile entrega Client ID y Secret Key a cada vendedor. Se activa al tener una cuenta para probar.' },
  so: { name: 'Sodimac', short: 'Sodimac', color: '#D7282F', icon: '🔴', kind: 'marketplace', fee: 15, label: 'marketplace', soon: 'Sodimac no publica su API: hay que pedir acceso de integrador.' },
  dr: { name: 'Dropi', short: 'Dropi', color: '#1F2937', icon: '⚫', kind: 'marketplace', fee: 0, label: 'marketplace', soon: 'Dropi entrega su API solo a integradores: hay que pedir acceso.' },
};
const ACTIVE = Object.keys(CATALOG).filter(k => !CATALOG[k].soon);
const name = k => (CATALOG[k] || {}).name || String(k || '').toUpperCase();
const isStore = k => (CATALOG[k] || {}).kind === 'store';
// para la pantalla (sin funciones)
const publicCatalog = () => Object.fromEntries(Object.entries(CATALOG).map(([k, v]) => [k, { ...v }]));

module.exports = { CATALOG, ACTIVE, name, isStore, publicCatalog };

};

__defs["connectors/store"] = function (module, exports, require, __dirname) {
// Utilidades comunes de las tiendas propias (Shopify, WooCommerce, Jumpseller):
// plazo de despacho según la hora de corte de la tienda y la etiqueta 10x15 que genera EtiquetaHub.
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const cfg = require('../config');

// Plazo de despacho: vendido antes de la hora de corte → sale ese día; después → el día hábil siguiente (fin del día)
function dispatchBy(soldAt, settings = {}) {
  const cut = /^\d{1,2}:\d{2}$/.test(settings.cutoff || '') ? settings.cutoff : '14:00';
  const d = new Date(soldAt || Date.now());
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: cfg.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const parts = Object.fromEntries(fmt.formatToParts(d).map(x => [x.type, x.value]));
  let day = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`);
  const hm = `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`;
  if (hm > cut.padStart(5, '0')) day.setUTCDate(day.getUTCDate() + 1);
  while ([0, 6].includes(day.getUTCDay()) && !settings.weekends) day.setUTCDate(day.getUTCDate() + 1); // sábado y domingo no se despacha
  return day.toISOString().slice(0, 10) + 'T23:59:00-03:00';
}

// ---- Código de barras Code 128 (B) para el número de pedido ----
const C128 = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112'];
function code128(text) {
  const s = String(text).replace(/[^\x20-\x7E]/g, '').slice(0, 30);
  const codes = [104]; let sum = 104;
  [...s].forEach((ch, i) => { const v = ch.charCodeAt(0) - 32; codes.push(v); sum += v * (i + 1); });
  codes.push(sum % 103, 106);
  return codes.map(c => C128[c]).join(''); // anchos alternados barra/espacio
}
function drawBarcode(page, text, x, y, w, h) {
  const pat = code128(text);
  const units = [...pat].reduce((a, n) => a + Number(n), 0);
  const u = w / units; let cx = x;
  [...pat].forEach((n, i) => { const bw = Number(n) * u; if (i % 2 === 0) page.drawRectangle({ x: cx, y, width: bw, height: h, color: rgb(0, 0, 0) }); cx += bw; });
}

const safe = t => String(t || '').normalize('NFC').replace(/[^\x20-\x7E -ÿ]/g, '');
function wrap(font, text, size, maxW) {
  const words = safe(text).split(/\s+/); const out = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (font.widthOfTextAtSize(t, size) > maxW && cur) { out.push(cur); cur = w; } else cur = t; }
  if (cur) out.push(cur); return out;
}

// Etiqueta de despacho 10x15 cm generada por EtiquetaHub (para tiendas que no entregan etiqueta de courier)
async function ownLabel({ store, orderNumber, sender, customer, address = {}, items = [], soldAt, carrier }) {
  const doc = await PDFDocument.create();
  const W = 283.46, H = 425.2, P = 14; // 100 x 150 mm
  const page = doc.addPage([W, H]);
  const b = await doc.embedFont(StandardFonts.HelveticaBold), r = await doc.embedFont(StandardFonts.Helvetica);
  let y = H - P;
  // encabezado
  page.drawRectangle({ x: 0, y: H - 34, width: W, height: 34, color: rgb(0, 0, 0) });
  page.drawText(safe(String(store || '').toUpperCase()), { x: P, y: H - 22, size: 12, font: b, color: rgb(1, 1, 1) });
  const pn = safe(`PEDIDO ${orderNumber}`); page.drawText(pn, { x: W - P - b.widthOfTextAtSize(pn, 11), y: H - 22, size: 11, font: b, color: rgb(1, 1, 1) });
  y = H - 52;
  // código de barras del pedido
  drawBarcode(page, String(orderNumber), P, y - 46, W - P * 2, 46);
  y -= 58;
  const on = safe(String(orderNumber)); page.drawText(on, { x: (W - r.widthOfTextAtSize(on, 9)) / 2, y, size: 9, font: r });
  y -= 14;
  page.drawLine({ start: { x: P, y }, end: { x: W - P, y }, thickness: 1.2, color: rgb(0, 0, 0) });
  y -= 14;
  // destinatario
  page.drawText('DESTINATARIO', { x: P, y, size: 8, font: b, color: rgb(0.3, 0.3, 0.3) }); y -= 17;
  for (const l of wrap(b, customer || 'Cliente', 15, W - P * 2).slice(0, 2)) { page.drawText(l, { x: P, y, size: 15, font: b }); y -= 17; }
  for (const l of wrap(r, address.line || '', 11, W - P * 2).slice(0, 3)) { page.drawText(l, { x: P, y, size: 11, font: r }); y -= 13; }
  const city = [address.comuna, address.region].filter(Boolean).join(', ');
  if (city) for (const l of wrap(b, city.toUpperCase(), 12, W - P * 2).slice(0, 2)) { page.drawText(l, { x: P, y, size: 12, font: b }); y -= 14; }
  if (address.zip) { page.drawText(safe('CP ' + address.zip), { x: P, y, size: 9, font: r }); y -= 12; }
  if (address.phone) { page.drawText(safe('Tel: ' + address.phone), { x: P, y, size: 10, font: r }); y -= 13; }
  if (address.notes) for (const l of wrap(r, 'Nota: ' + address.notes, 8.5, W - P * 2).slice(0, 2)) { page.drawText(l, { x: P, y, size: 8.5, font: r }); y -= 10; }
  y -= 4;
  page.drawLine({ start: { x: P, y }, end: { x: W - P, y }, thickness: 1.2, color: rgb(0, 0, 0) });
  y -= 13;
  // contenido
  page.drawText('CONTENIDO', { x: P, y, size: 8, font: b, color: rgb(0.3, 0.3, 0.3) });
  const units = items.reduce((a, i) => a + Number(i.qty || 1), 0);
  const ut = `${units} unidad${units === 1 ? '' : 'es'}`; page.drawText(ut, { x: W - P - b.widthOfTextAtSize(ut, 8), y, size: 8, font: b });
  y -= 13;
  for (const it of items) {
    if (y < 60) { page.drawText('… ver detalle del pedido', { x: P, y, size: 8, font: r }); y -= 10; break; }
    page.drawText(`${it.qty || 1}x`, { x: P, y, size: 10, font: b });
    const lines = wrap(r, [it.name, it.variant].filter(Boolean).join(' · '), 9, W - P * 2 - 24).slice(0, 2);
    for (const l of lines) { page.drawText(l, { x: P + 22, y, size: 9, font: r }); y -= 11; }
    y -= 2;
  }
  // remitente al pie
  page.drawLine({ start: { x: P, y: 44 }, end: { x: W - P, y: 44 }, thickness: 0.8, color: rgb(0, 0, 0) });
  page.drawText('REMITENTE', { x: P, y: 32, size: 7, font: b, color: rgb(0.3, 0.3, 0.3) });
  page.drawText(safe(sender || ''), { x: P, y: 20, size: 10, font: b });
  const dt = soldAt ? new Intl.DateTimeFormat('es-CL', { timeZone: cfg.timezone, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(soldAt)) : '';
  const meta = safe([carrier, dt].filter(Boolean).join(' · ')); page.drawText(meta, { x: W - P - r.widthOfTextAtSize(meta, 8), y: 20, size: 8, font: r });
  return Buffer.from(await doc.save());
}

const num = v => { const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };
module.exports = { dispatchBy, ownLabel, num, code128 };

};

__defs["connectors/shopify"] = function (module, exports, require, __dirname) {
// Shopify (tienda propia) — Admin REST API con un token de app personalizada (Configuración › Apps › Desarrollar apps).
// Shopify no entrega etiqueta de courier: EtiquetaHub genera una etiqueta 10x15 con los datos del pedido.
const cfg = require('../config');
const { request } = require('../http');
const store = require('./store');

const VER = '2025-07';
const host = c => String(c.shop || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
const base = c => `${process.env.SHOPIFY_API_BASE || 'https://' + host(c)}/admin/api/${VER}`; // SHOPIFY_API_BASE: solo para pruebas
const api = (conn, path, opts = {}) => request(base(conn.creds) + path, { ...opts, headers: { 'x-shopify-access-token': conn.creds.token, 'content-type': 'application/json', ...(opts.headers || {}) } });

async function test(conn) {
  if (!/\.myshopify\.com$/.test(host(conn.creds)) && !process.env.SHOPIFY_API_BASE) throw new Error('La dirección debe ser la de Shopify: mitienda.myshopify.com');
  const r = await api(conn, '/shop.json');
  return { sellerName: r?.shop?.name || host(conn.creds) };
}

const variantOf = li => (li.variant_title && li.variant_title !== 'Default Title' ? li.variant_title : '');
function toShipment(o, settings) {
  const a = o.shipping_address || {};
  const items = (o.line_items || []).filter(li => li.requires_shipping !== false).map(li => ({ name: li.title || li.name, variant: variantOf(li), sku: li.sku || '', pub_id: String(li.product_id || li.variant_id || ''), qty: Number(li.quantity || 1) }));
  const paid = ['paid', 'partially_paid', 'authorized', 'partially_refunded'].includes(o.financial_status);
  const cancelled = Boolean(o.cancelled_at) || ['voided', 'refunded'].includes(o.financial_status);
  return {
    external_id: String(o.id),
    order_number: String(o.name || o.order_number || o.id).replace(/^#/, ''),
    sold_at: o.created_at,
    items,
    labelReady: paid && !cancelled,
    cancelled,
    shipped: o.fulfillment_status === 'fulfilled',
    meta: {
      dispatch_by: store.dispatchBy(o.created_at, settings),
      customer: a.name || [a.first_name, a.last_name].filter(Boolean).join(' ') || [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(' '),
      address: { line: [a.address1, a.address2].filter(Boolean).join(', '), comuna: a.city || '', region: a.province || '', zip: a.zip || '', phone: a.phone || o.phone || o.customer?.phone || '', notes: o.note || '' },
      carrier: (o.shipping_lines || [])[0]?.title || '',
      status: o.financial_status, paid,
    },
  };
}

// páginas por id ascendente (since_id): no depende del encabezado Link
async function ordersSince(conn, fromISO, toISO, max = 5000) {
  const out = []; let since = 0;
  for (let i = 0; i < max / 250; i++) {
    const r = await api(conn, `/orders.json?status=any&limit=250&since_id=${since}&created_at_min=${encodeURIComponent(fromISO)}${toISO ? '&created_at_max=' + encodeURIComponent(toISO) : ''}`);
    const list = r?.orders || [];
    out.push(...list);
    if (list.length < 250) break;
    since = list[list.length - 1].id;
  }
  return out;
}

async function listShipments(conn) {
  const from = new Date(Date.now() - cfg.lookbackDays * 864e5).toISOString();
  return (await ordersSince(conn, from)).filter(o => o.shipping_address).map(o => toShipment(o, conn.settings))
    .filter(s => s.items.length && (s.labelReady || s.cancelled || s.shipped));
}
async function refresh(conn, order) {
  const r = await api(conn, `/orders/${encodeURIComponent(order.external_id)}.json`);
  return r?.order ? toShipment(r.order, conn.settings) : null;
}

async function fetchLabel(conn, order) {
  const m = JSON.parse(order.meta || '{}');
  return store.ownLabel({ store: conn.settings.sender || conn.row.account_label || 'Shopify', orderNumber: order.order_number, sender: [conn.settings.sender, conn.settings.senderAddress].filter(Boolean).join(' · ') || conn.row.account_label || '', customer: m.customer, address: m.address, items: JSON.parse(order.items || '[]'), soldAt: order.sold_at, carrier: m.carrier || conn.settings.carrier || '' });
}

async function sales(conn, fromISO, toISO) {
  return (await ordersSince(conn, fromISO, toISO, 20000))
    .filter(o => !o.cancelled_at && !['voided', 'refunded', 'pending', 'expired'].includes(o.financial_status))
    .map(o => {
      const items = (o.line_items || []).map(li => {
        const disc = (li.discount_allocations || []).reduce((a, d) => a + store.num(d.amount), 0);
        return { sku: li.sku || '', pub_id: String(li.product_id || ''), name: li.title || 'Producto', variant: variantOf(li), qty: Number(li.quantity || 1), amount: store.num(li.price) * Number(li.quantity || 1) - disc };
      });
      return { id: String(o.id), at: o.created_at, amount: store.num(o.current_total_price ?? o.total_price) || items.reduce((a, i) => a + i.amount, 0), units: items.reduce((a, i) => a + i.qty, 0) || 1, items };
    });
}

// Publicaciones activas (para la calculadora de ganancia y el control de stock)
async function listings(conn) {
  const out = []; let since = 0;
  for (let i = 0; i < 40; i++) {
    const r = await api(conn, `/products.json?status=active&limit=250&since_id=${since}&fields=id,title,variants,image,handle`);
    const ps = r?.products || [];
    for (const p of ps) for (const v of p.variants || []) out.push({ id: String(p.id), vid: String(v.id), inv: v.inventory_item_id ? String(v.inventory_item_id) : null, sku: v.sku || '', title: p.title, variant: v.title && v.title !== 'Default Title' ? v.title : '', price: store.num(v.price), stock: v.inventory_quantity ?? null, thumb: p.image?.src || '', url: `https://${host(conn.creds)}/products/${p.handle}` });
    if (ps.length < 250) break;
    since = ps[ps.length - 1].id;
  }
  return out;
}

// Devoluciones: reembolsos de productos (Shopify › Reembolsar)
async function returns(conn, fromISO) {
  const out = [];
  for (const o of await ordersSince(conn, fromISO, null, 20000)) {
    for (const rf of o.refunds || []) {
      const lines = rf.refund_line_items || [];
      if (!lines.length) continue;
      out.push({ rid: `${o.id}-${rf.id}`, at: rf.created_at, units: lines.reduce((a, l) => a + Number(l.quantity || 1), 0), amount: lines.reduce((a, l) => a + store.num(l.subtotal) + store.num(l.total_tax), 0), title: lines[0].line_item?.title || '', keys: lines.flatMap(l => [l.line_item?.sku, String(l.line_item?.product_id || ''), l.line_item?.title]) });
    }
  }
  return out;
}

// Control de stock: ref = "variante|artículo de inventario"; se escribe en la primera ubicación activa de la tienda
async function stockListings(conn) {
  return (await listings(conn)).filter(l => l.inv).map(l => ({ ref: `${l.vid}|${l.inv}`, sku: l.sku, title: l.title + (l.variant ? ' · ' + l.variant : ''), qty: l.stock }));
}
const locCache = new Map();
async function setStock(conn, ref, qty) {
  const inv = String(ref).split('|')[1]; if (!inv) throw new Error('Variante sin inventario');
  let loc = locCache.get(conn.row?.id);
  if (!loc) { const r = await api(conn, '/locations.json'); loc = (r?.locations || []).find(l => l.active)?.id; if (!loc) throw new Error('La tienda no tiene una ubicación activa'); locCache.set(conn.row?.id, loc); }
  await api(conn, '/inventory_levels/set.json', { method: 'POST', body: JSON.stringify({ location_id: loc, inventory_item_id: Number(inv), available: Math.max(0, qty) }) });
}

module.exports = { stockListings, setStock, returns, test, listShipments, refresh, fetchLabel, sales, listings, raw: api, toShipment };

};

__defs["connectors/woocommerce"] = function (module, exports, require, __dirname) {
// WooCommerce (tienda propia en WordPress) — REST API v3 con Clave de cliente y Secreto
// (WooCommerce › Ajustes › Avanzado › REST API, permiso Lectura/Escritura).
// WooCommerce no entrega etiqueta de courier: EtiquetaHub genera una etiqueta 10x15 con los datos del pedido.
const cfg = require('../config');
const { request } = require('../http');
const store = require('./store');

// Regiones de Chile tal como las guarda WooCommerce (CL-RM, CL-VS…)
const REG = { 'CL-AI': 'Aysén', 'CL-AN': 'Antofagasta', 'CL-AP': 'Arica y Parinacota', 'CL-AR': 'Araucanía', 'CL-AT': 'Atacama', 'CL-BI': 'Biobío', 'CL-CO': 'Coquimbo', 'CL-LI': "O'Higgins", 'CL-LL': 'Los Lagos', 'CL-LR': 'Los Ríos', 'CL-MA': 'Magallanes', 'CL-ML': 'Maule', 'CL-NB': 'Ñuble', 'CL-RM': 'Región Metropolitana', 'CL-TA': 'Tarapacá', 'CL-VS': 'Valparaíso' };
const site = c => String(c.url || '').trim().replace(/\/+$/, '').replace(/^(?!https?:\/\/)/, 'https://');
const api = (conn, path, opts = {}) => request(`${site(conn.creds)}/wp-json/wc/v3${path}`, { ...opts, headers: { authorization: 'Basic ' + Buffer.from(`${conn.creds.key}:${conn.creds.secret}`).toString('base64'), 'content-type': 'application/json' } }, opts.method ? { retries: 0 } : undefined);

async function test(conn) {
  if (!/^ck_/.test(conn.creds.key || '') || !/^cs_/.test(conn.creds.secret || '')) throw new Error('La clave empieza con ck_ y el secreto con cs_');
  await api(conn, '/orders?per_page=1');
  let name = null; try { name = (await request(`${site(conn.creds)}/wp-json/`))?.name || null; } catch { /* sin nombre */ }
  return { sellerName: name || site(conn.creds).replace(/^https?:\/\//, '') };
}

const variantOf = li => (li.meta_data || []).filter(m => m.display_key && !String(m.key).startsWith('_')).map(m => `${m.display_key}: ${String(m.display_value).replace(/<[^>]+>/g, '')}`).join(' · ');
function toShipment(o, settings) {
  const s = o.shipping && (o.shipping.address_1 || o.shipping.city) ? o.shipping : (o.billing || {});
  const at = o.date_created_gmt ? o.date_created_gmt + 'Z' : o.date_created;
  return {
    external_id: String(o.id),
    order_number: String(o.number || o.id),
    sold_at: at,
    items: (o.line_items || []).map(li => ({ name: li.name, variant: variantOf(li), sku: li.sku || '', pub_id: String(li.variation_id || li.product_id || ''), qty: Number(li.quantity || 1) })),
    labelReady: o.status === 'processing',
    cancelled: ['cancelled', 'refunded', 'failed'].includes(o.status),
    shipped: o.status === 'completed',
    meta: {
      dispatch_by: store.dispatchBy(at, settings),
      customer: [s.first_name, s.last_name].filter(Boolean).join(' ') || s.company || '',
      address: { line: [s.address_1, s.address_2].filter(Boolean).join(', '), comuna: s.city || '', region: REG[s.state] || s.state || '', zip: s.postcode || '', phone: s.phone || o.billing?.phone || '', notes: o.customer_note || '' },
      carrier: (o.shipping_lines || [])[0]?.method_title || '',
      status: o.status,
    },
  };
}

async function orders(conn, fromISO, toISO, maxPages = 50) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const r = await api(conn, `/orders?per_page=100&page=${page}&orderby=id&order=asc&after=${encodeURIComponent(fromISO)}${toISO ? '&before=' + encodeURIComponent(toISO) : ''}`);
    const list = Array.isArray(r) ? r : [];
    out.push(...list);
    if (list.length < 100) break;
  }
  return out;
}

async function listShipments(conn) {
  const from = new Date(Date.now() - cfg.lookbackDays * 864e5).toISOString();
  return (await orders(conn, from)).map(o => toShipment(o, conn.settings)).filter(s => s.items.length && (s.labelReady || s.cancelled || s.shipped));
}
async function refresh(conn, order) {
  const o = await api(conn, `/orders/${encodeURIComponent(order.external_id)}`);
  return o ? toShipment(o, conn.settings) : null;
}
async function fetchLabel(conn, order) {
  const m = JSON.parse(order.meta || '{}');
  return store.ownLabel({ store: conn.settings.sender || conn.row.account_label || 'WooCommerce', orderNumber: order.order_number, sender: [conn.settings.sender, conn.settings.senderAddress].filter(Boolean).join(' · ') || conn.row.account_label || '', customer: m.customer, address: m.address, items: JSON.parse(order.items || '[]'), soldAt: order.sold_at, carrier: m.carrier || conn.settings.carrier || '' });
}
async function sales(conn, fromISO, toISO) {
  return (await orders(conn, fromISO, toISO, 200)).filter(o => ['processing', 'completed', 'on-hold'].includes(o.status)).map(o => {
    const items = (o.line_items || []).map(li => ({ sku: li.sku || '', pub_id: String(li.product_id || ''), name: li.name || 'Producto', variant: variantOf(li), qty: Number(li.quantity || 1), amount: store.num(li.total) + store.num(li.total_tax) }));
    return { id: String(o.id), at: o.date_created_gmt ? o.date_created_gmt + 'Z' : o.date_created, amount: store.num(o.total) || items.reduce((a, i) => a + i.amount, 0), units: items.reduce((a, i) => a + i.qty, 0) || 1, items };
  });
}
async function listings(conn) {
  const out = [];
  for (let page = 1; page <= 40; page++) {
    const r = await api(conn, `/products?status=publish&per_page=100&page=${page}`);
    const ps = Array.isArray(r) ? r : [];
    for (const p of ps) out.push({ id: String(p.id), vid: null, sku: p.sku || '', title: p.name, variant: '', price: store.num(p.price), stock: p.manage_stock ? p.stock_quantity : null, thumb: p.images?.[0]?.src || '', url: p.permalink || '', type: p.type });
    if (ps.length < 100) break;
  }
  return out;
}

// Devoluciones: pedidos reembolsados (total o parcial)
async function returns(conn, fromISO) {
  const out = [];
  for (const o of await orders(conn, fromISO, null, 200)) {
    if (!(o.refunds || []).length && o.status !== 'refunded') continue;
    const amount = (o.refunds || []).reduce((a, r) => a + Math.abs(store.num(r.total)), 0) || store.num(o.total);
    const its = o.line_items || [];
    out.push({ rid: String(o.id), at: o.date_modified_gmt ? o.date_modified_gmt + 'Z' : o.date_created, units: o.status === 'refunded' ? its.reduce((a, i) => a + Number(i.quantity || 1), 0) : 1, amount, title: its[0]?.name || '', keys: its.flatMap(i => [i.sku, String(i.product_id || ''), i.name]) });
  }
  return out;
}

// Control de stock: productos simples y variaciones con su stock actual; ref = "producto" o "producto:variación"
async function stockListings(conn) {
  const out = [];
  for (const p of await listings(conn)) {
    if (p.type === 'variable') {
      for (let page = 1; page <= 10; page++) {
        const vs = await api(conn, `/products/${p.id}/variations?per_page=100&page=${page}`);
        for (const v of Array.isArray(vs) ? vs : []) out.push({ ref: `${p.id}:${v.id}`, sku: v.sku || '', title: p.title + ((v.attributes || []).length ? ' · ' + v.attributes.map(a => a.option).join(' / ') : ''), qty: v.manage_stock ? v.stock_quantity : null });
        if (!Array.isArray(vs) || vs.length < 100) break;
      }
    } else out.push({ ref: p.id, sku: p.sku, title: p.title, qty: p.stock });
  }
  return out;
}
async function setStock(conn, ref, qty) {
  const [pid, vid] = String(ref).split(':');
  await api(conn, vid ? `/products/${pid}/variations/${vid}` : `/products/${pid}`, { method: 'PUT', body: JSON.stringify({ manage_stock: true, stock_quantity: Math.max(0, qty) }) });
}

module.exports = { stockListings, setStock, returns, test, listShipments, refresh, fetchLabel, sales, listings, raw: api, toShipment };

};

__defs["connectors/jumpseller"] = function (module, exports, require, __dirname) {
// Jumpseller (tienda propia, muy usada en Chile) — API v1 con Login y Token
// (Admin › Configuración › Cuenta › API).
// Jumpseller no siempre entrega etiqueta de courier: EtiquetaHub genera una etiqueta 10x15 con los datos del pedido.
const cfg = require('../config');
const { request } = require('../http');
const store = require('./store');

const API = () => process.env.JUMPSELLER_API || 'https://api.jumpseller.com/v1';
const api = (conn, path, opts = {}) => request(`${API()}${path}${path.includes('?') ? '&' : '?'}login=${encodeURIComponent(conn.creds.login)}&authtoken=${encodeURIComponent(conn.creds.authtoken)}`, { ...opts, headers: { 'content-type': 'application/json' } }, opts.method ? { retries: 0 } : undefined);

async function test(conn) {
  const r = await api(conn, '/store/info.json').catch(async () => { await api(conn, '/orders.json?limit=1'); return null; });
  return { sellerName: r?.store?.name || r?.name || null };
}

const unwrap = x => x?.order || x;
const variantOf = p => (p.variants || p.options || []).map(o => [o.name, o.value].filter(Boolean).join(': ')).filter(Boolean).join(' · ');
function toShipment(raw, settings) {
  const o = unwrap(raw);
  const a = o.shipping_address || {};
  const st = String(o.status || '').toLowerCase();
  const ship = String(o.shipment_status || '').toLowerCase();
  return {
    external_id: String(o.id),
    order_number: String(o.id),
    sold_at: o.created_at,
    items: (o.products || []).map(p => ({ name: p.name, variant: variantOf(p), sku: p.sku || '', pub_id: String(p.id || ''), qty: Number(p.qty || p.quantity || 1) })),
    labelReady: st === 'paid',
    cancelled: ['canceled', 'cancelled', 'abandoned', 'refunded'].includes(st),
    shipped: ['in_transit', 'delivered', 'shipped'].includes(ship) || String(o.fulfillment_status || '').toLowerCase() === 'fulfilled',
    meta: {
      dispatch_by: store.dispatchBy(o.created_at, settings),
      customer: [a.name, a.surname].filter(Boolean).join(' ') || o.customer?.fullname || o.customer?.name || '',
      address: { line: [a.address, a.complement].filter(Boolean).join(', '), comuna: a.municipality || a.city || '', region: a.region || '', zip: a.postal || '', phone: o.customer?.phone || a.phone || '', notes: o.additional_information || '' },
      carrier: o.shipping_method_name || '',
      status: o.status, shipment_status: o.shipment_status || null,
    },
  };
}

// Jumpseller entrega los pedidos del más nuevo al más antiguo: se pagina hasta pasar la fecha de inicio
async function orders(conn, fromISO, toISO, maxPages = 60) {
  const from = new Date(fromISO).getTime(), to = toISO ? new Date(toISO).getTime() : Infinity, out = [];
  for (let page = 1; page <= maxPages; page++) {
    const r = await api(conn, `/orders.json?limit=100&page=${page}`);
    const list = (Array.isArray(r) ? r : []).map(unwrap);
    let older = false;
    for (const o of list) { const t = new Date(o.created_at).getTime(); if (t < from) { older = true; continue; } if (t <= to) out.push(o); }
    if (list.length < 100 || older) break;
  }
  return out;
}

async function listShipments(conn) {
  const from = new Date(Date.now() - cfg.lookbackDays * 864e5).toISOString();
  return (await orders(conn, from)).filter(o => o.shipping_address && !/retiro|pickup|retira/i.test(o.shipping_method_name || ''))
    .map(o => toShipment(o, conn.settings)).filter(s => s.items.length && (s.labelReady || s.cancelled || s.shipped));
}
async function refresh(conn, order) {
  const r = await api(conn, `/orders/${encodeURIComponent(order.external_id)}.json`);
  return r ? toShipment(r, conn.settings) : null;
}
async function fetchLabel(conn, order) {
  const m = JSON.parse(order.meta || '{}');
  return store.ownLabel({ store: conn.settings.sender || conn.row.account_label || 'Jumpseller', orderNumber: order.order_number, sender: [conn.settings.sender, conn.settings.senderAddress].filter(Boolean).join(' · ') || conn.row.account_label || '', customer: m.customer, address: m.address, items: JSON.parse(order.items || '[]'), soldAt: order.sold_at, carrier: m.carrier || conn.settings.carrier || '' });
}
async function sales(conn, fromISO, toISO) {
  return (await orders(conn, fromISO, toISO, 300)).filter(o => String(o.status).toLowerCase() === 'paid').map(o => {
    const items = (o.products || []).map(p => ({ sku: p.sku || '', pub_id: String(p.id || ''), name: p.name || 'Producto', variant: variantOf(p), qty: Number(p.qty || 1), amount: store.num(p.price) * Number(p.qty || 1) - store.num(p.discount) }));
    return { id: String(o.id), at: o.created_at, amount: store.num(o.total) || items.reduce((a, i) => a + i.amount, 0), units: items.reduce((a, i) => a + i.qty, 0) || 1, items };
  });
}
async function listings(conn) {
  const out = [];
  for (let page = 1; page <= 40; page++) {
    const r = await api(conn, `/products.json?limit=100&page=${page}`);
    const ps = (Array.isArray(r) ? r : []).map(x => x.product || x);
    for (const p of ps) {
      if (p.status && p.status !== 'available') continue;
      const vs = p.variants?.length ? p.variants.map(v => v.variant || v) : [null];
      for (const v of vs) out.push({ id: String(p.id), vid: v ? String(v.id) : null, sku: (v && v.sku) || p.sku || '', title: p.name, variant: v ? (v.options || []).map(o => o.value).join(' / ') : '', price: store.num(v?.price ?? p.price), stock: v ? v.stock : p.stock, thumb: p.images?.[0]?.url || '', url: p.permalink || '' });
    }
    if (ps.length < 100) break;
  }
  return out;
}

// Devoluciones: pedidos reembolsados
async function returns(conn, fromISO) {
  return (await orders(conn, fromISO, null, 300)).filter(o => /refund/i.test(o.status || '')).map(o => ({ rid: String(o.id), at: o.updated_at || o.created_at, units: (o.products || []).reduce((a, p) => a + Number(p.qty || 1), 0), amount: store.num(o.total), title: o.products?.[0]?.name || '', keys: (o.products || []).flatMap(p => [p.sku, String(p.id || ''), p.name]) }));
}

// Control de stock: ref = "producto" o "producto:variante"
async function stockListings(conn) {
  return (await listings(conn)).map(l => ({ ref: l.vid ? `${l.id}:${l.vid}` : l.id, sku: l.sku, title: l.title + (l.variant ? ' · ' + l.variant : ''), qty: l.stock == null ? null : Number(l.stock) }));
}
async function setStock(conn, ref, qty) {
  const [pid, vid] = String(ref).split(':'), n = Math.max(0, qty);
  if (vid) await api(conn, `/products/${pid}/variants/${vid}.json`, { method: 'PUT', body: JSON.stringify({ variant: { stock: n } }) });
  else await api(conn, `/products/${pid}.json`, { method: 'PUT', body: JSON.stringify({ product: { stock: n } }) });
}

module.exports = { stockListings, setStock, returns, test, listShipments, refresh, fetchLabel, sales, listings, raw: api, toShipment };

};

__defs["stock"] = function (module, exports, require, __dirname) {
// Control de stock integrado (módulo "stock", apagado por defecto; en el espacio principal no se puede prender).
// Bodegas: cada empresa (vendedor) del espacio queda en una bodega. Una bodega puede ser:
//   - "stock compartido": un solo stock por SKU para todas sus empresas (p. ej. 3 cuentas de ML + 3 de Paris de la misma persona)
//   - "stock separado": la misma bodega física, pero cada empresa con su propio stock (p. ej. 3 vendedores distintos en un solo galpón)
// Cada venta nueva descuenta el stock del SKU en su bodega y el nuevo stock se envía a TODAS las publicaciones de ese SKU
// en todas las cuentas de la bodega. Una cancelación lo devuelve. Con el "modo prueba" (por defecto) no se escribe nada
// en los marketplaces: solo se registra lo que se habría enviado.
const db = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS stock_bodegas (id INTEGER PRIMARY KEY AUTOINCREMENT, space_id INTEGER NOT NULL, name TEXT NOT NULL, shared INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS stock_seller_bodega (seller_id INTEGER PRIMARY KEY, bodega_id INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS stock_items (bodega_id INTEGER NOT NULL, owner INTEGER NOT NULL DEFAULT 0, sku TEXT NOT NULL COLLATE NOCASE, name TEXT, qty INTEGER, updated_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (bodega_id, owner, sku));
CREATE TABLE IF NOT EXISTS stock_links (connection_id INTEGER NOT NULL, ref TEXT NOT NULL, sku TEXT COLLATE NOCASE, title TEXT, mk_qty INTEGER, full INTEGER NOT NULL DEFAULT 0, sent_qty INTEGER, updated_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (connection_id, ref));
CREATE INDEX IF NOT EXISTS stock_links_sku ON stock_links (sku);
CREATE TABLE IF NOT EXISTS stock_moves (id INTEGER PRIMARY KEY AUTOINCREMENT, bodega_id INTEGER NOT NULL, owner INTEGER NOT NULL DEFAULT 0, sku TEXT NOT NULL, delta INTEGER NOT NULL, qty_after INTEGER, reason TEXT, order_id INTEGER, by TEXT, at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS stock_push (id INTEGER PRIMARY KEY AUTOINCREMENT, space_id INTEGER, connection_id INTEGER, ref TEXT, sku TEXT, qty INTEGER, status TEXT, detail TEXT, at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS stock_applied (order_id INTEGER PRIMARY KEY, lines TEXT NOT NULL, at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS stock_cfg (space_id INTEGER PRIMARY KEY, live INTEGER NOT NULL DEFAULT 0, imported_at TEXT);
`);

try { db.exec('ALTER TABLE stock_bodegas ADD COLUMN confirmed_at TEXT'); } catch { /* ya existe */ }
// Una bodega queda ACTIVA recién cuando su dueño carga las cantidades y las confirma (confirmed_at).
// Antes de eso no se descuenta nada ni se cambia nada en los marketplaces.
const spaces = () => require('./spaces');
const MKNAME = k => require('./marketplaces').name(k);
const norm = v => String(v || '').trim().toUpperCase();
const sellersOf = spaceId => db.prepare('SELECT id, name FROM sellers WHERE space_id=? ORDER BY name').all(spaceId);
const isOn = spaceId => Boolean(spaces().modulesOf(spaces().get(spaceId)).stock);
const cfgOf = spaceId => db.prepare('SELECT * FROM stock_cfg WHERE space_id=?').get(spaceId) || { space_id: spaceId, live: 0, imported_at: null };

// Cada empresa del espacio debe tener bodega (si no, se le crea una propia)
function ensure(spaceId) {
  for (const s of sellersOf(spaceId)) {
    if (db.prepare('SELECT 1 FROM stock_seller_bodega WHERE seller_id=?').get(s.id)) continue;
    const id = Number(db.prepare('INSERT INTO stock_bodegas (space_id, name, shared) VALUES (?,?,1)').run(spaceId, 'Bodega ' + s.name).lastInsertRowid);
    db.prepare('INSERT INTO stock_seller_bodega (seller_id, bodega_id) VALUES (?,?)').run(s.id, id);
  }
}
function bodegaOf(sellerId) {
  const r = db.prepare('SELECT b.* FROM stock_seller_bodega sb JOIN stock_bodegas b ON b.id=sb.bodega_id WHERE sb.seller_id=?').get(sellerId);
  return r || null;
}
const ownerKey = (b, sellerId) => (b.shared ? 0 : sellerId);
// empresas cuyo stock es el mismo que el de (bodega, dueño)
function sellersSharing(b, owner) {
  const all = db.prepare('SELECT seller_id FROM stock_seller_bodega WHERE bodega_id=?').all(b.id).map(r => r.seller_id);
  return b.shared ? all : all.filter(id => id === owner);
}

// ---------- vista ----------
function view(spaceId, onlySellers = null) {
  ensure(spaceId);
  const sel = sellersOf(spaceId).filter(s => !onlySellers || onlySellers.includes(s.id));
  const bodegas = db.prepare('SELECT * FROM stock_bodegas WHERE space_id=? ORDER BY id').all(spaceId).map(b => ({ ...b, shared: Boolean(b.shared), sellers: db.prepare('SELECT s.id, s.name FROM stock_seller_bodega sb JOIN sellers s ON s.id=sb.seller_id WHERE sb.bodega_id=? ORDER BY s.name').all(b.id) }))
    .filter(b => b.sellers.length && (!onlySellers || b.sellers.some(s => onlySellers.includes(s.id))));
  const conns = db.prepare(`SELECT id, seller_id, marketplace, account_label FROM connections WHERE marketplace <> 'demo' AND seller_id IN (${sel.map(() => '?').join(',') || 'NULL'})`).all(...sel.map(s => s.id));
  const connBy = new Map(conns.map(c => [c.id, c]));
  const links = conns.length ? db.prepare(`SELECT * FROM stock_links WHERE connection_id IN (${conns.map(() => '?').join(',')})`).all(...conns.map(c => c.id)) : [];
  const items = [];
  for (const b of bodegas) {
    const owners = b.shared ? [{ owner: 0, name: '' }] : b.sellers.filter(s => !onlySellers || onlySellers.includes(s.id)).map(s => ({ owner: s.id, name: s.name }));
    for (const o of owners) {
      const sids = sellersSharing(b, o.owner);
      const myLinks = links.filter(l => sids.includes(connBy.get(l.connection_id)?.seller_id));
      const rows = new Map(db.prepare('SELECT * FROM stock_items WHERE bodega_id=? AND owner=?').all(b.id, o.owner).map(r => [norm(r.sku), { sku: r.sku, name: r.name, qty: r.qty, updated_at: r.updated_at }]));
      for (const l of myLinks) if (l.sku && !rows.has(norm(l.sku))) rows.set(norm(l.sku), { sku: l.sku, name: l.title, qty: null });
      for (const [k, r] of rows) {
        const ls = myLinks.filter(l => norm(l.sku) === k).map(l => { const c = connBy.get(l.connection_id); return { conn: l.connection_id, mk: c.marketplace, account: c.account_label || '', seller_id: c.seller_id, ref: l.ref, title: l.title, mk_qty: l.mk_qty, full: Boolean(l.full), sent: l.sent_qty }; });
        items.push({ bodega_id: b.id, owner: o.owner, owner_name: o.name, sku: r.sku, name: r.name || ls[0]?.title || '', qty: r.qty, links: ls, diff: r.qty != null && ls.some(l => !l.full && l.mk_qty != null && l.mk_qty !== r.qty) });
      }
    }
  }
  items.sort((a, b) => String(a.name).localeCompare(String(b.name)) || String(a.sku).localeCompare(String(b.sku)));
  const noSku = links.filter(l => !l.sku).map(l => { const c = connBy.get(l.connection_id); return { mk: c.marketplace, account: c.account_label || '', ref: l.ref, title: l.title }; }).slice(0, 300);
  const c = cfgOf(spaceId);
  return {
    imported_at: c.imported_at, bodegas: bodegas.map(b => ({ ...b, active: Boolean(b.confirmed_at), missing: items.filter(i => i.bodega_id === b.id && i.qty == null && i.links.some(l => !l.full)).length, skus: items.filter(i => i.bodega_id === b.id).length })), sellers: sel, items, noSku,
    channels: conns.map(cn => ({ id: cn.id, seller_id: cn.seller_id, mk: cn.marketplace, name: MKNAME(cn.marketplace), account: cn.account_label || '', canRead: Boolean(require('./sync').connectors[cn.marketplace]?.stockListings), canWrite: Boolean(require('./sync').connectors[cn.marketplace]?.setStock), links: links.filter(l => l.connection_id === cn.id).length })),
    pushes: db.prepare('SELECT p.*, c.marketplace mk, c.account_label account FROM stock_push p LEFT JOIN connections c ON c.id=p.connection_id WHERE p.space_id=? ORDER BY p.id DESC LIMIT 60').all(spaceId),
    moves: db.prepare(`SELECT m.* FROM stock_moves m JOIN stock_bodegas b ON b.id=m.bodega_id WHERE b.space_id=? ORDER BY m.id DESC LIMIT 60`).all(spaceId),
  };
}

// ---------- traer publicaciones de todas las cuentas ----------
const importing = new Map();
async function importListings(spaceId) {
  if (importing.has(spaceId)) return importing.get(spaceId);
  const p = (async () => {
    ensure(spaceId);
    const sync = require('./sync');
    const res = [], fresh = new Set(); // SKU creados en esta lectura: se queda el menor stock entre cuentas
    for (const c of db.prepare(`SELECT * FROM connections WHERE marketplace <> 'demo' AND seller_id IN (SELECT id FROM sellers WHERE space_id=?)`).all(spaceId)) {
      const k = sync.connectors[c.marketplace];
      if (!k?.stockListings) { res.push({ mk: c.marketplace, account: c.account_label, error: `${MKNAME(c.marketplace)} todavía no permite leer el stock por su conexión` }); continue; }
      try {
        const list = await k.stockListings(sync.connObj(c));
        const up = db.prepare(`INSERT INTO stock_links (connection_id, ref, sku, title, mk_qty, full, updated_at) VALUES (?,?,?,?,?,?,datetime('now'))
          ON CONFLICT(connection_id, ref) DO UPDATE SET sku=excluded.sku, title=excluded.title, mk_qty=excluded.mk_qty, full=excluded.full, updated_at=excluded.updated_at`);
        const seen = new Set();
        for (const l of list) { up.run(c.id, String(l.ref), l.sku ? String(l.sku).trim() : '', String(l.title || '').slice(0, 200), l.qty == null ? null : Math.round(Number(l.qty)), l.full ? 1 : 0); seen.add(String(l.ref)); }
        // publicaciones que ya no existen
        for (const r of db.prepare('SELECT ref FROM stock_links WHERE connection_id=?').all(c.id)) if (!seen.has(r.ref)) db.prepare('DELETE FROM stock_links WHERE connection_id=? AND ref=?').run(c.id, r.ref);
        // SKU nuevos: el stock de partida es el MENOR que muestran los marketplaces (para no sobrevender)
        const b = bodegaOf(c.seller_id); const owner = ownerKey(b, c.seller_id);
        for (const l of list) {
          if (!l.sku || l.full || l.qty == null) continue;
          const cur = db.prepare('SELECT qty FROM stock_items WHERE bodega_id=? AND owner=? AND sku=?').get(b.id, owner, String(l.sku).trim());
          const fk = `${b.id}|${owner}|${norm(l.sku)}`;
          if (!cur) { db.prepare('INSERT INTO stock_items (bodega_id, owner, sku, name, qty) VALUES (?,?,?,?,?)').run(b.id, owner, String(l.sku).trim(), String(l.title || '').slice(0, 200), Math.round(Number(l.qty))); fresh.add(fk); }
          else if (fresh.has(fk) && Number(l.qty) < cur.qty) db.prepare('UPDATE stock_items SET qty=? WHERE bodega_id=? AND owner=? AND sku=?').run(Math.max(0, Math.round(Number(l.qty))), b.id, owner, String(l.sku).trim());
          else if (cur.qty == null) db.prepare('UPDATE stock_items SET qty=? WHERE bodega_id=? AND owner=? AND sku=?').run(Math.round(Number(l.qty)), b.id, owner, String(l.sku).trim());
        }
        res.push({ mk: c.marketplace, account: c.account_label, count: list.length, noSku: list.filter(l => !l.sku).length });
      } catch (e) { res.push({ mk: c.marketplace, account: c.account_label, error: String(e.message).slice(0, 200) }); }
    }
    db.prepare("INSERT INTO stock_cfg (space_id, imported_at) VALUES (?, datetime('now')) ON CONFLICT(space_id) DO UPDATE SET imported_at=excluded.imported_at").run(spaceId);
    return res;
  })().finally(() => importing.delete(spaceId));
  importing.set(spaceId, p);
  return p;
}

// ---------- cambios de stock y envío a los marketplaces ----------
function move(b, owner, sku, delta, reason, { orderId = null, by = 'EtiquetaHub', set = null } = {}) {
  const key = String(sku).trim();
  const cur = db.prepare('SELECT qty FROM stock_items WHERE bodega_id=? AND owner=? AND sku=?').get(b.id, owner, key);
  if (!cur && set == null) return null; // SKU sin stock cargado: no se toca
  const before = cur?.qty ?? 0;
  const after = set != null ? Math.max(0, Math.round(set)) : Math.max(0, before + delta);
  if (!cur) db.prepare('INSERT INTO stock_items (bodega_id, owner, sku, qty) VALUES (?,?,?,?)').run(b.id, owner, key, after);
  else db.prepare("UPDATE stock_items SET qty=?, updated_at=datetime('now') WHERE bodega_id=? AND owner=? AND sku=?").run(after, b.id, owner, key);
  db.prepare('INSERT INTO stock_moves (bodega_id, owner, sku, delta, qty_after, reason, order_id, by) VALUES (?,?,?,?,?,?,?,?)').run(b.id, owner, key, after - (cur ? before : 0), after, reason, orderId, by);
  schedulePush(b, owner, key);
  return after;
}

const pending = new Map(); // `${bodega}|${owner}|${sku}` -> timer (junta varios cambios seguidos en un solo envío)
function schedulePush(b, owner, sku) {
  const k = `${b.id}|${owner}|${norm(sku)}`;
  clearTimeout(pending.get(k));
  pending.set(k, setTimeout(() => { pending.delete(k); push(b, owner, sku).catch(e => console.warn('[stock] envío', e.message)); }, 3000));
}
async function push(b, owner, sku) {
  const row = db.prepare('SELECT qty FROM stock_items WHERE bodega_id=? AND owner=? AND sku=?').get(b.id, owner, sku);
  if (!row || row.qty == null) return;
  const bod = db.prepare('SELECT confirmed_at FROM stock_bodegas WHERE id=?').get(b.id);
  if (!bod?.confirmed_at) return; // bodega sin confirmar: no se envía nada
  const sync = require('./sync');
  const sids = sellersSharing(b, owner);
  if (!sids.length) return;
  const links = db.prepare(`SELECT l.*, c.marketplace mk FROM stock_links l JOIN connections c ON c.id=l.connection_id WHERE c.seller_id IN (${sids.map(() => '?').join(',')}) AND l.sku=? AND l.full=0`).all(...sids, sku);
  const log = db.prepare('INSERT INTO stock_push (space_id, connection_id, ref, sku, qty, status, detail) VALUES (?,?,?,?,?,?,?)');
  for (const l of links) {
    const k = sync.connectors[l.mk];
    if (!k?.setStock) { log.run(b.space_id, l.connection_id, l.ref, sku, row.qty, 'skip', `${MKNAME(l.mk)} aún no permite cambiar el stock por su conexión`); continue; }
    try {
      const c = db.prepare('SELECT * FROM connections WHERE id=?').get(l.connection_id);
      await k.setStock(sync.connObj(c), l.ref, row.qty);
      db.prepare("UPDATE stock_links SET sent_qty=?, mk_qty=?, updated_at=datetime('now') WHERE connection_id=? AND ref=?").run(row.qty, row.qty, l.connection_id, l.ref);
      log.run(b.space_id, l.connection_id, l.ref, sku, row.qty, 'ok', 'Actualizado');
    } catch (e) { log.run(b.space_id, l.connection_id, l.ref, sku, row.qty, 'error', String(e.message).slice(0, 300)); }
  }
  db.prepare('DELETE FROM stock_push WHERE space_id=? AND id NOT IN (SELECT id FROM stock_push WHERE space_id=? ORDER BY id DESC LIMIT 2000)').run(b.space_id, b.space_id);
}

// SKU de cada producto del pedido (si el marketplace no lo trae, se busca por la publicación)
function linesOf(order) {
  let items = []; try { items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items || []; } catch { items = []; }
  const out = new Map();
  for (const it of items) {
    let sku = String(it.sku || '').trim();
    if (!sku && it.pub_id) {
      const l = db.prepare("SELECT sku FROM stock_links WHERE connection_id=? AND (ref=? OR ref LIKE ? ) AND sku<>'' LIMIT 1").get(order.connection_id, String(it.pub_id), String(it.pub_id) + ':%');
      sku = l?.sku || '';
    }
    if (!sku) continue;
    out.set(norm(sku), { sku, qty: (out.get(norm(sku))?.qty || 0) + Number(it.qty || 1) });
  }
  return [...out.values()];
}
function spaceOfOrder(order) { return spaces().spaceOfSeller(order.seller_id); }

// Venta nueva: descuenta (una sola vez por pedido)
function onOrder(orderId) {
  try {
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(orderId); if (!o) return;
    const sp = spaceOfOrder(o); if (!sp || !isOn(sp)) return;
    if (db.prepare('SELECT 1 FROM stock_applied WHERE order_id=?').get(o.id)) return;
    // solo ventas hechas después de cargar el stock (al conectar una cuenta llegan pedidos de días anteriores)
    ensure(sp);
    const b = bodegaOf(o.seller_id); if (!b || !b.confirmed_at) return; // bodega sin confirmar: todavía no se descuenta
    // solo ventas hechas después de confirmar el stock (al conectar una cuenta llegan pedidos de días anteriores)
    if (o.sold_at && new Date(o.sold_at) < new Date(b.confirmed_at.replace(' ', 'T') + 'Z')) return;
    const owner = ownerKey(b, o.seller_id);
    const done = [];
    for (const l of linesOf(o)) { if (move(b, owner, l.sku, -l.qty, `Venta ${MKNAME(o.marketplace)} #${o.order_number}`, { orderId: o.id }) != null) done.push(l); }
    db.prepare('INSERT INTO stock_applied (order_id, lines) VALUES (?,?)').run(o.id, JSON.stringify({ b: b.id, owner, lines: done }));
  } catch (e) { console.warn('[stock] venta', e.message); }
}
// Cancelada: devuelve lo descontado
function onCancel(orderId) {
  try {
    const a = db.prepare('SELECT * FROM stock_applied WHERE order_id=?').get(orderId); if (!a) return;
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
    const d = JSON.parse(a.lines || '{}');
    const b = db.prepare('SELECT * FROM stock_bodegas WHERE id=?').get(d.b);
    if (b && b.confirmed_at && isOn(b.space_id)) for (const l of d.lines || []) move(b, d.owner, l.sku, l.qty, `Cancelada ${o ? MKNAME(o.marketplace) + ' #' + o.order_number : ''}`, { orderId });
    db.prepare('DELETE FROM stock_applied WHERE order_id=?').run(orderId);
    db.prepare("INSERT INTO stock_applied (order_id, lines) VALUES (?, '{\"cancelled\":true}')").run(orderId); // no se vuelve a descontar
  } catch (e) { console.warn('[stock] cancelada', e.message); }
}

// ---------- acciones del administrador ----------
function setQty(spaceId, bodegaId, owner, sku, qty, by) {
  const b = db.prepare('SELECT * FROM stock_bodegas WHERE id=? AND space_id=?').get(bodegaId, spaceId);
  if (!b) throw new Error('Bodega no encontrada');
  if (!String(sku || '').trim()) throw new Error('Falta el SKU');
  if (!isFinite(Number(qty)) || Number(qty) < 0) throw new Error('Cantidad no válida');
  return move(b, b.shared ? 0 : Number(owner), sku, 0, 'Ajuste manual', { by, set: Number(qty) });
}
// Pegar "SKU;cantidad" (una por línea)
function bulk(spaceId, bodegaId, owner, text, by) {
  let n = 0; const bad = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.trim().match(/^(.+?)[\s;,\t]+(-?\d+)$/);
    if (!line.trim()) continue;
    if (!m) { bad.push(line.trim()); continue; }
    setQty(spaceId, bodegaId, owner, m[1].trim(), Number(m[2]), by); n++;
  }
  return { n, bad: bad.slice(0, 20) };
}
function saveBodega(spaceId, { id, name, shared, sellers }) {
  const nm = String(name || '').trim().slice(0, 60); if (!nm) throw new Error('Escribe el nombre de la bodega');
  let bid = Number(id) || null;
  if (bid) {
    const cur = db.prepare('SELECT * FROM stock_bodegas WHERE id=? AND space_id=?').get(bid, spaceId); if (!cur) throw new Error('Bodega no encontrada');
    const before = db.prepare('SELECT seller_id FROM stock_seller_bodega WHERE bodega_id=? ORDER BY seller_id').all(bid).map(r => r.seller_id).join(',');
    const after = (sellers || []).map(Number).sort((a, b) => a - b).join(',');
    // si cambia quién comparte el stock, hay que volver a revisar y confirmar las cantidades
    const changed = Boolean(cur.shared) !== Boolean(shared) || before !== after;
    db.prepare(`UPDATE stock_bodegas SET name=?, shared=?${changed ? ', confirmed_at=NULL' : ''} WHERE id=?`).run(nm, shared ? 1 : 0, bid);
    if (changed) for (const sid of before.split(',').filter(Boolean)) if (!after.split(',').includes(sid)) db.prepare('DELETE FROM stock_seller_bodega WHERE seller_id=? AND bodega_id=?').run(Number(sid), bid);
  }
  else bid = Number(db.prepare('INSERT INTO stock_bodegas (space_id, name, shared) VALUES (?,?,?)').run(spaceId, nm, shared ? 1 : 0).lastInsertRowid);
  const valid = new Set(sellersOf(spaceId).map(s => s.id));
  for (const sid of (sellers || []).map(Number).filter(x => valid.has(x))) {
    const old = db.prepare('SELECT bodega_id FROM stock_seller_bodega WHERE seller_id=?').get(sid);
    if (old && old.bodega_id !== bid) db.prepare('UPDATE stock_bodegas SET confirmed_at=NULL WHERE id=?').run(old.bodega_id); // la bodega que deja también se revisa de nuevo
    db.prepare('INSERT INTO stock_seller_bodega (seller_id, bodega_id) VALUES (?,?) ON CONFLICT(seller_id) DO UPDATE SET bodega_id=excluded.bodega_id').run(sid, bid);
  }
  // bodegas que quedaron vacías se borran
  db.prepare('DELETE FROM stock_bodegas WHERE space_id=? AND id NOT IN (SELECT bodega_id FROM stock_seller_bodega)').run(spaceId);
  return bid;
}
// Confirmar las cantidades de una bodega: desde ahora cada venta descuenta y el stock se envía a todas sus publicaciones
async function confirm(spaceId, bodegaId) {
  const b = db.prepare('SELECT * FROM stock_bodegas WHERE id=? AND space_id=?').get(bodegaId, spaceId); if (!b) throw new Error('Bodega no encontrada');
  const v = view(spaceId).bodegas.find(x => x.id === b.id);
  if (!v || !v.skus) throw new Error('Primero trae las publicaciones y carga las cantidades');
  if (v.missing) throw new Error(`Faltan ${v.missing} SKU sin cantidad. Ponles cantidad (aunque sea 0) antes de confirmar.`);
  db.prepare("UPDATE stock_bodegas SET confirmed_at=datetime('now') WHERE id=?").run(b.id);
  const fresh = db.prepare('SELECT * FROM stock_bodegas WHERE id=?').get(b.id);
  let n = 0;
  for (const r of db.prepare('SELECT owner, sku FROM stock_items WHERE bodega_id=? AND qty IS NOT NULL').all(b.id)) { await push(fresh, r.owner, r.sku); n++; }
  return n;
}
function pause(spaceId, bodegaId) {
  if (!db.prepare('SELECT 1 FROM stock_bodegas WHERE id=? AND space_id=?').get(bodegaId, spaceId)) throw new Error('Bodega no encontrada');
  db.prepare('UPDATE stock_bodegas SET confirmed_at=NULL WHERE id=?').run(bodegaId);
}
// Enviar ahora el stock de la app a todas las publicaciones (p. ej. después de cargarlo)
async function pushAll(spaceId) {
  let n = 0;
  for (const r of db.prepare('SELECT i.*, b.space_id, b.shared FROM stock_items i JOIN stock_bodegas b ON b.id=i.bodega_id WHERE b.space_id=? AND i.qty IS NOT NULL').all(spaceId)) {
    await push({ id: r.bodega_id, space_id: r.space_id, shared: r.shared }, r.owner, r.sku); n++;
  }
  return n;
}

module.exports = { isOn, view, importListings, onOrder, onCancel, setQty, bulk, saveBodega, confirm, pause, pushAll, ensure };

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
  sh: require('./connectors/shopify'),
  wc: require('./connectors/woocommerce'),
  js: require('./connectors/jumpseller'),
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
  // espacio sin fulfillment: no hay bloqueo de etiquetas por producto
  if (!require('./spaces').ffOnForSeller(order.seller_id)) return [];
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
      ownLabel: require('./marketplaces').CATALOG[order.marketplace]?.label === 'own',
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

const MKNAME = Object.fromEntries(Object.entries(require('./marketplaces').CATALOG).map(([k, v]) => [k, v.name]));
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
    require('./stock').onOrder(id); // control de stock (si el espacio lo tiene prendido)
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
  if (state === 'cancelled' && existing.state !== 'cancelled') require('./stock').onCancel(existing.id);
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
const KEEP_DAYS = 400;
// filtro por vendedor: un id, una lista de ids (todos los de un espacio) o null (sin filtro)
function sidF(sellerId, col) {
  if (Array.isArray(sellerId)) return sellerId.length ? { sql: ` AND ${col} IN (${sellerId.map(() => '?').join(',')})`, args: sellerId.map(Number) } : { sql: ' AND 0', args: [] };
  return sellerId ? { sql: ` AND ${col} = ?`, args: [sellerId] } : { sql: '', args: [] };
}      // se guarda algo más de un año
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
    for (const row of db.prepare("SELECT * FROM connections WHERE marketplace <> 'demo'").all()) {
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
  const f = sidF(sellerId, 'seller_id');
  const rows = db.prepare(`SELECT day, marketplace, SUM(amount) amount, COUNT(*) orders, SUM(units) units FROM sales WHERE day >= ?${f.sql} GROUP BY day, marketplace`).all(lo, ...f.args);
  const sum = (mk, a, b) => rows.filter(r => r.marketplace === mk && r.day >= a && r.day <= b).reduce((x, r) => ({ amount: x.amount + (r.amount || 0), orders: x.orders + r.orders, units: x.units + (r.units || 0) }), { amount: 0, orders: 0, units: 0 });
  const series = {}, td = {}, yd = {};
  const fc = sidF(sellerId, 'seller_id');
  const conns = db.prepare(`SELECT DISTINCT marketplace FROM connections WHERE marketplace <> 'demo'${fc.sql}`).all(...fc.args).map(r => r.marketplace);
  // solo los canales que el vendedor tiene conectados (o con ventas en el período): sin gráficos vacíos
  const ACTIVE = require('./marketplaces').ACTIVE;
  const withData = new Set(rows.filter(r => r.amount > 0).map(r => r.marketplace));
  const mks = ACTIVE.filter(mk => conns.includes(mk) || withData.has(mk));
  for (const mk of mks) {
    series[mk] = buckets.map(b => { const x = sum(mk, b.from, b.to); return { day: b.from, to: b.to, amount: Math.round(x.amount), orders: x.orders, units: x.units }; });
    const a = sum(mk, t0, t0), y = sum(mk, yest, yest);
    td[mk] = { amount: Math.round(a.amount), orders: a.orders }; yd[mk] = { amount: Math.round(y.amount), orders: y.orders };
  }
  return { mks, from, to, group, days: buckets.map(b => b.from), ends: buckets.map(b => b.to), today: t0, td, yd, series, connected: conns, updatedAt: lastRun || null };
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
  const ffOn = require('./spaces').ffOnForSeller;
  for (const b of db.prepare('SELECT seller_id, marketplace, value FROM blocklist').all()) {
    if (!ffOn(b.seller_id)) continue; // espacio sin fulfillment: nada bloqueado
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
  { const f = sidF(sellerId, 'i.seller_id'); where += f.sql; args.push(...f.args); }
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
  const fc2 = sidF(sellerId, 'c.seller_id');
  const conns = db.prepare(`SELECT c.id FROM connections c WHERE c.marketplace <> 'demo'${fc2.sql}`).all(...fc2.args);
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
  const single = Boolean(sellerId) && !Array.isArray(sellerId);
  const days = daysBetween(from, to);
  const weekly = days.length <= 7;
  const MKN = { ml: 'Mercado Libre', fa: 'Falabella', pa: 'Paris' };
  const header = [
    ...(single ? [] : [{ label: 'Vendedor' }]),
    { label: 'Publicación' }, { label: 'Marketplace' }, { label: 'ID publicación' }, { label: 'Variante' }, { label: 'SKU' },
    ...(weekly ? days.map(d => ({ label: `${WD[new Date(d + 'T12:00:00Z').getUTCDay()]} ${d.slice(8)}/${d.slice(5, 7)}` })) : [{ label: 'Mercado Libre' }, { label: 'Falabella' }, { label: 'Paris' }]),
    { label: 'Total unidades' }, { label: 'Ventas' }, ...(noMoney ? [] : [{ label: 'Monto', money: true }]),
  ];
  const nums = r => [...(weekly ? days.map(d => r.byDay[d] || 0) : [r.byMk.ml || 0, r.byMk.fa || 0, r.byMk.pa || 0]), r.qty, r.orders, ...(noMoney ? [] : [r.amount])];
  const rows = [];
  for (const p of data.rows) {
    // fila de la publicación (en negrita) y debajo sus variantes
    const vs = p.variants.filter(v => v.variant || v.sku);
    rows.push({ bold: true, cells: [...(single ? [] : [p.seller]), p.name, MKN[p.marketplace] || '', p.pub_id, vs.length ? `${vs.length} variante${vs.length === 1 ? '' : 's'}` : '', '', ...nums(p)] });
    if (vs.length) for (const v of vs) rows.push({ cells: [...(single ? [] : ['']), '', '', '', '   ' + (v.variant || 'Sin variante'), v.sku, ...nums(v)] });
  }
  const widths = [...(single ? [] : [18]), 46, 14, 16, 30, 18, ...(weekly ? days.map(() => 10) : [14, 12, 10]), 14, 10, 14];
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
    for (const row of db.prepare("SELECT * FROM connections WHERE marketplace <> 'demo'").all()) {
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
  const mine = new Set(require('./spaces').sellerIds(user)); // solo las cuentas de su espacio
  rows = rows.filter(r => mine.has(r.seller_id));
  if (only) rows = rows.filter(r => r.seller_id === only);
  const res = await Promise.all(rows.map(r => getAcc(r, force).then(d => ({ r, d }))));
  const accounts = res.filter(x => x.r.marketplace === 'ml' && x.d).map(x => x.d).sort((a, b) => a.seller.localeCompare(b.seller));
  const faAcc = res.filter(x => x.r.marketplace === 'fa' && x.d).map(x => x.d).sort((a, b) => a.seller.localeCompare(b.seller));
  const ats = rows.map(r => accCache.get(r.id)?.at).filter(Boolean);
  const late = (await lateCached(only)).filter(x => mine.has(x.seller_id));
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
  if (o.marketplace !== 'ml') {
    // Falabella / Paris: el día de despacho, desde las 20:00 sin que la agencia o el marketplace lo escanee → advertencia; al día siguiente → atrasado
    const v = String(m.dispatch_by), pd = new Date(v.includes('T') ? v : v.replace(' ', 'T'));
    const today = chileDay(now), dday = isNaN(pd) ? v.slice(0, 10) : chileDay(pd), h = chileHour(now);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dday) || dday > today) return null;
    const ship = require('./marketplaces').name(o.marketplace);
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
  const rows = db.prepare(`SELECT o.*, s.name AS seller FROM orders o JOIN sellers s ON s.id=o.seller_id WHERE o.marketplace <> 'demo' AND o.state NOT IN ('shipped','cancelled')${only ? ' AND o.seller_id=?' : ''}`).all(...(only ? [only] : []));
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
  if (!require('./spaces').canSeller(user, row.seller_id)) throw Object.assign(new Error('No permitido'), { status: 403 });
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

const CACHE_V = 10; // sube cuando cambia el cálculo, para rehacer la caché
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

// Tiendas propias (Shopify, WooCommerce, Jumpseller): precio del catálogo de la tienda; comisión = pasarela de pago (editable)
async function storeListings(conn, mk, sellerId, errors) {
  const c = require('./sync').connectors[mk];
  const cat = require('./marketplaces').CATALOG[mk];
  let list = [];
  try { list = await c.listings(conn); } catch (e) { errors.push(`${cat.name} productos: ` + String(e.message).slice(0, 140)); }
  const sold = new Map(soldProducts(sellerId, mk).map(s => [String(s.sku || s.key).toUpperCase(), s]));
  const rows = [], seen = new Set();
  for (const p of list) {
    const k = String(p.sku || p.vid || p.id).toUpperCase(); seen.add(k);
    const s = sold.get(k);
    rows.push({ mk, key: p.sku || p.vid || p.id, id: p.id, sku: p.sku || '', title: p.title, thumb: p.thumb || '', price: p.price || Math.round(s?.avg || 0), fee: null, fee_pct: cat.fee, fee_src: 'pasarela de pago (editable)', ship: 0, ship_src: 'editable', tacos: null, tacos_src: 'editable', units90: s?.units90 || 0, url: p.url || '' });
  }
  for (const [k, s] of sold) if (!seen.has(k)) rows.push({ mk, key: s.key, id: s.id, sku: s.sku, title: s.title, thumb: '', price: Math.round(s.avg), fee: null, fee_pct: cat.fee, fee_src: 'pasarela de pago (editable)', ship: 0, ship_src: 'editable', tacos: null, tacos_src: 'editable', units90: s.units90 });
  return rows;
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
  const conns = db.prepare("SELECT * FROM connections WHERE seller_id=? AND marketplace <> 'demo'").all(sellerId);
  const errors = [], rows = [];
  for (const c of conns) {
    const conn = sync.connObj(c);
    try {
      if (c.marketplace === 'ml') rows.push(...await mlListings(conn, errors));
      if (c.marketplace === 'fa') rows.push(...await faListings(conn, sellerId, errors));
      if (c.marketplace === 'pa') rows.push(...await paListings(conn, sellerId, errors));
      if (require('./marketplaces').isStore(c.marketplace)) rows.push(...await storeListings(conn, c.marketplace, sellerId, errors));
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
  if (!require('./marketplaces').ACTIVE.includes(mk) || !key) throw new Error('Datos incompletos');
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

// Tiendas propias (Shopify, WooCommerce, Jumpseller): pedidos reembolsados
async function syncStore(conn, mk, sellerId, connector) {
  const list = await connector.returns(conn, new Date(Date.now() - DAYS * 864e5).toISOString());
  for (const r of list) upsert(mk, String(r.rid), sellerId, dayOf(r.at) || chileDay(new Date()), r.units || 1, r.amount || 0, 'returned', r.title || '', 1, r.keys || []);
}

const running = new Map();
function refresh(sellerId, maxAgeMs = 30 * 60e3) {
  if (running.has(sellerId)) return running.get(sellerId);
  const last = db.prepare('SELECT at FROM returns_sync_v3 WHERE seller_id=?').get(sellerId)?.at || 0;
  if (Date.now() - last < maxAgeMs) return null;
  const p = (async () => {
    const sync = require('./sync');
    const conns = db.prepare("SELECT * FROM connections WHERE seller_id=? AND marketplace <> 'demo'").all(sellerId);
    for (const c of conns) {
      const conn = sync.connObj(c);
      try {
        if (c.marketplace === 'ml') await syncMl(conn, sellerId);
        if (c.marketplace === 'fa') await syncFa(conn, sellerId);
        if (c.marketplace === 'pa') await syncPa(conn, sellerId);
        if (sync.connectors[c.marketplace]?.returns) await syncStore(conn, c.marketplace, sellerId, sync.connectors[c.marketplace]);
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
  const by = Object.fromEntries(require('./marketplaces').ACTIVE.map(k => [k, { n: 0, units: 0, amount: 0, rev: 0 }]));
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
const spaces = require('./spaces');
require('./billing'); // columnas de cobro y revisión periódica de suscripciones
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
  if (pref) { try { const mine = new Set(spaces.sellerIds(user)); return JSON.parse(pref.value).filter(id => mine.has(Number(id))); } catch {} }
  const key = String(user.name || '').trim().toLowerCase().split(/\s+/)[0].slice(0, 4);
  const mine = new Set(spaces.sellerIds(user));
  if ((user.space_id || 1) !== 1) return [...mine]; // empresas nuevas: todas sus cuentas
  return key.length >= 3 ? db.prepare('SELECT id, name FROM sellers').all().filter(x => mine.has(x.id)).filter(x => x.name.toLowerCase().split(/\s+/).some(w => w.startsWith(key))).map(x => x.id) : [];
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
  if (user.role === 'admin') { const id = Number(url.searchParams.get('seller_id')); return id && spaces.canSeller(user, id) ? id : null; }
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
  const sp = ev && ev.sellerId ? spaces.spaceOfSeller(ev.sellerId) : null;
  for (const c of clients) if (!sp || (c.user.space_id || 1) === sp) c.res.write(msg); // cada espacio recibe solo sus avisos
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
    const r = db.prepare('INSERT INTO users (email,name,role,pass_hash,space_id,superadmin) VALUES (?,?,?,?,1,1)').run(String(b.email).trim(), String(b.name).trim(), 'admin', sec.hashPassword(String(b.password)));
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
  // Webhook Mercado Pago (suscripciones de la app): se vuelve a leer la suscripción desde Mercado Pago
  if (p === '/webhooks/mp' && m === 'POST') {
    const body = await readBody(req).catch(() => ({}));
    ok(res);
    require('./billing').notification(body, url.searchParams).catch(e => console.warn('[mercado pago]', e.message));
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

  // Registro de una empresa nueva: crea su espacio (14 días gratis) y el primer usuario como administrador
  if (p === '/api/register' && m === 'POST') {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const rk = 'reg|' + ip;
    if (recovery.loginBlocked(rk)) return fail(res, 429, 'Demasiados registros desde esta conexión. Intenta más tarde.');
    const b = await readBody(req);
    const company = String(b.company || '').trim().slice(0, 80), name = String(b.name || '').trim().slice(0, 80);
    const email = String(b.email || '').trim().toLowerCase(), phone = String(b.phone || '').replace(/[^\d+]/g, '').slice(0, 16);
    if (!company || !name) return fail(res, 400, 'Escribe el nombre de tu empresa y tu nombre');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, 'Escribe un correo válido');
    if (String(b.password || '').length < 8) return fail(res, 400, 'La contraseña debe tener al menos 8 caracteres');
    if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) return fail(res, 400, 'Ese correo ya tiene cuenta. Inicia sesión o recupera tu contraseña.');
    recovery.loginFailed(rk); recovery.loginFailed(rk); // máx. 4 registros por conexión cada 15 minutos
    const r = spaces.register({ company, name, email, passHash: sec.hashPassword(String(b.password)), phone });
    sync.logEvent(null, 'registro', `Nueva empresa registrada: ${company} (${email}) · prueba hasta ${r.trial}`);
    setSessionCookie(res, sec.createSession(r.userId));
    return ok(res, { ok: true, trial_until: r.trial });
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
      if (dup) return send(res, 409, `Esa cuenta de Mercado Libre${dup.account_label ? ' (' + dup.account_label + ')' : ''} ya está conectada ${spaces.spaceOfSeller(dup.seller_id) === spaces.spaceOfSeller(Number(sellerId)) ? 'al vendedor ' + dup.name : 'a otra empresa en EtiquetaHub'}. Cierra sesión en Mercado Libre, entra con la cuenta correcta de este vendedor y vuelve a conectar desde EtiquetaHub.`);
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

  // ----- espacio del usuario: plan vigente, módulos y vendedores que puede ver -----
  const space = spaces.spaceOfUser(user);
  const spaceSt = spaces.status(space);
  const mods = spaces.modulesOf(space);
  const isOwner = Boolean(user.superadmin) || Boolean(user.impersonator_id && db.prepare('SELECT superadmin FROM users WHERE id=?').get(user.impersonator_id)?.superadmin);
  const sids = spaces.sellerIds(user);          // sobre los que puede actuar (vendedor: el suyo)
  const vis = spaces.spaceSellerIds(user);      // los que puede ver (todo su espacio)
  if (!spaceSt.active && !isOwner && !p.startsWith('/api/billing') && !['/api/me', '/api/logout', '/api/me/password', '/api/stream', '/api/impersonate/stop', '/api/undo'].includes(p)) {
    return fail(res, 402, spaceSt.reason === 'blocked' ? 'Tu espacio está suspendido. Escríbenos para reactivarlo.' : 'Tu prueba gratis terminó. Escríbenos para activar tu plan.');
  }
  const modOff = name => fail(res, 403, `El módulo "${spaces.MODULES[name].name}" está apagado en tu espacio (Usuarios y ajustes › Módulos).`);
  if (p.startsWith('/api/mkp/') && !mods.mkp) return modOff('mkp');
  if (p === '/api/sales' && !mods.sales) return modOff('sales');
  if (p.startsWith('/api/profit') && !mods.profit) return modOff('profit');
  if (p.startsWith('/api/return-codes') && !mods.codes) return modOff('codes');
  if (p.startsWith('/api/blocklist') && !mods.fulfillment) return modOff('fulfillment');
  if ((p.startsWith('/api/admin/debug/') || p.startsWith('/api/admin/settings')) && !isOwner) return fail(res, 403, 'Solo el dueño de la app');

  // "Agencia" (p. ej. Agencia Jimmy): solo puede ver los códigos de devolución de Mercado Libre
  if (user.role === 'agencia' && !['/api/undo', '/api/me', '/api/me/password', '/api/me/backup-code', '/api/return-codes', '/api/stream', '/api/impersonate/stop'].includes(p)) return fail(res, 403, 'Este usuario solo puede ver los códigos de devolución');

  // ----- códigos de autorización de devoluciones de Mercado Libre (uno nuevo cada día) -----
  if (p === '/api/return-codes' && m === 'GET') {
    if (user.role === 'fulfillment') return fail(res, 403, 'No permitido');
    const day = chileDay(new Date());
    let sellers = db.prepare(`SELECT s.id, s.name, (SELECT c.account_label FROM connections c WHERE c.seller_id=s.id AND c.marketplace='ml' ORDER BY c.id DESC LIMIT 1) AS account
      FROM sellers s WHERE EXISTS (SELECT 1 FROM connections c WHERE c.seller_id=s.id AND c.marketplace='ml') ORDER BY s.name`).all();
    sellers = sellers.filter(x => sids.includes(x.id));
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
    if (!conn || !sids.includes(conn.seller_id)) return fail(res, 404, 'Esa cuenta de Mercado Libre no está conectada a EtiquetaHub');
    byMl.sid = conn.seller_id;
  }
  const rc = byMl ? [null, String(byMl.sid)] : p.match(/^\/api\/return-codes\/(\d+)$/);
  if (rc && m === 'POST') {
    const sid = Number(rc[1]);
    if (!(['admin', 'seller'].includes(user.role) && sids.includes(sid))) return fail(res, 403, 'No permitido');
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
    return ok(res, { user: { id: user.id, email: user.email, name: user.name, role: user.role }, mustChange: Boolean(user.must_change) && !user.impersonator_id, impersonatedBy: imp?.name || null, seller, cutoff: cfg.cutoff, demo: cfg.demo, mlConfigured: Boolean(settings.mlClientId()),
      space: { id: space.id, name: space.name, status: spaceSt, modules: mods }, owner: isOwner, mailConfigured: recovery.mailConfigured(),
      // canales de venta: catálogo y los que tiene conectados el espacio (o el vendedor) para no mostrar gráficos vacíos
      catalog: require('./marketplaces').publicCatalog(),
      mks: (() => { const ids = user.role === 'seller' ? [user.seller_id] : vis; const f = spaces.inList(ids, 'seller_id'); const c = new Set(db.prepare(`SELECT DISTINCT marketplace FROM connections WHERE marketplace <> 'demo' AND ${f.sql}`).all(...f.args).map(r => r.marketplace)); return require('./marketplaces').ACTIVE.filter(k => c.has(k)); })() });
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
    { const f = spaces.inList(vis, 'seller_id'); where.push(f.sql); args.push(...f.args); }
    if (view === 'pending') where.push("state NOT IN ('printed','cancelled','shipped')");
    if (view === 'printed') where.push("state = 'printed' AND printed_at >= datetime('now','-1 day')");
    // lo que ya fue entregado y escaneado por el marketplace (en tránsito / entregado) sale de la app
    // las enviadas solo vienen si se imprimieron en los últimos 7 días (sección "Impresas 7 días")
    if (view === 'all') where.push("(state <> 'shipped' OR printed_at >= datetime('now','-7 day'))");
    if (view === 'all') where.push("(created_at >= datetime('now','-7 day') OR state NOT IN ('printed','cancelled','shipped') OR printed_at >= datetime('now','-8 day') OR (block_no IS NOT NULL AND printed_at >= datetime('now','-30 day')))");
    const rows = db.prepare(`SELECT * FROM orders ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 1000`).all(...args);
    const sellers = db.prepare('SELECT id, name FROM sellers WHERE space_id=? ORDER BY name').all(user.space_id || 1);
    return ok(res, { orders: rows.map(o => orderView(o, user)), sellers });
  }

  const lab = p.match(/^\/api\/orders\/(\d+)\/label\.pdf$/);
  if (lab && m === 'GET') {
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(Number(lab[1]));
    if (!o || !vis.includes(o.seller_id)) return fail(res, 404, 'Pedido no encontrado'); // cualquier usuario de su espacio puede imprimir cualquier etiqueta; queda registrado quién la imprimió
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
    const rows = ids.map(Number).filter(Boolean).map(id => db.prepare('SELECT * FROM orders WHERE id=?').get(id)).filter(o => o && vis.includes(o.seller_id)); // todos pueden imprimir etiquetas de cualquier vendedor
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
      if (!o || !vis.includes(o.seller_id) || (user.role === 'seller' && o.seller_id !== user.seller_id)) continue;
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
    if (!o || !vis.includes(o.seller_id) || (user.role === 'seller' && o.seller_id !== user.seller_id)) return fail(res, 404, 'Pedido no encontrado');
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
    if (!o || !vis.includes(o.seller_id) || (user.role === 'seller' && ret[2] === 'unprint' && o.seller_id !== user.seller_id)) return fail(res, 404, 'Pedido no encontrado');
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
    } else for (const c of db.prepare('SELECT id, seller_id FROM connections').all()) if (vis.includes(c.seller_id)) sync.syncConnection(c.id);
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
    // Tiendas propias: Shopify, WooCommerce, Jumpseller (EtiquetaHub genera la etiqueta)
    const st = p.match(/^\/api\/connections\/(sh|wc|js)$/);
    if (st && m === 'POST') {
      const mk = st[1], b = await readBody(req), t = v => String(v || '').trim();
      const creds = mk === 'sh' ? { shop: t(b.shop).toLowerCase(), token: t(b.token) } : mk === 'wc' ? { url: t(b.url), key: t(b.key), secret: t(b.secret) } : { login: t(b.login), authtoken: t(b.authtoken) };
      if (Object.values(creds).some(v => !v)) return fail(res, 400, 'Completa todos los datos de la tienda');
      const probe = { creds, settings: {}, row: {}, saveCreds(c) { probe.creds = c; } };
      let info;
      try { info = await sync.connectors[mk].test(probe); } catch (e) {
        const msg = /HTTP 40[13]/.test(e.message) ? 'el token o las claves no son correctos (o les faltan permisos)' : /HTTP 404/.test(e.message) ? 'no se encontró la tienda en esa dirección' : /fetch failed|ENOTFOUND|timeout/i.test(e.message) ? 'no se pudo llegar a la tienda (revisa la dirección)' : e.message;
        return fail(res, 400, `${require('./marketplaces').name(mk)} rechazó los datos: ${msg}`);
      }
      const settings = { cutoff: /^\d{1,2}:\d{2}$/.test(b.cutoff || '') ? b.cutoff : '14:00', weekends: Boolean(b.weekends), sender: t(b.sender) || info?.sellerName || '', senderAddress: t(b.senderAddress) };
      const id = upsertConnection(sellerId, mk, probe.creds, { label: info?.sellerName || creds.shop || creds.url || creds.login, settings });
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
        // tiendas propias: hora de corte, sábado/domingo y remitente de la etiqueta
        if ('cutoff' in b && /^\d{1,2}:\d{2}$/.test(b.cutoff)) s.cutoff = b.cutoff;
        if ('weekends' in b) s.weekends = Boolean(b.weekends);
        if ('sender' in b) s.sender = String(b.sender || '').trim().slice(0, 80);
        if ('senderAddress' in b) s.senderAddress = String(b.senderAddress || '').trim().slice(0, 120);
        db.prepare('UPDATE connections SET settings=? WHERE id=?').run(JSON.stringify(s), c.id);
        if (s.autoReady || require('./marketplaces').isStore(c.marketplace)) sync.syncConnection(c.id);
        return ok(res);
      }
    }
    if (p === '/api/blocklist' && m === 'GET') {
      return ok(res, { items: db.prepare('SELECT id, marketplace, value, note, created_at FROM blocklist WHERE seller_id=? ORDER BY created_at DESC').all(sellerId) });
    }
    if (p === '/api/blocklist' && m === 'POST') {
      const b = await readBody(req);
      const values = String(b.value || '').split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
      const mk = ['any', ...require('./marketplaces').ACTIVE].includes(b.marketplace) ? b.marketplace : 'any';
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
  // ----- Control de stock (módulo "stock"; en el espacio principal siempre apagado) -----
  if (p.startsWith('/api/stock')) {
    if (!['admin', 'seller'].includes(user.role)) return fail(res, 403, 'No permitido');
    if (!mods.stock) return modOff('stock');
    const stock = require('./stock');
    const only = user.role === 'seller' ? [user.seller_id] : null;
    const adminOnly = () => (user.role === 'admin' ? null : fail(res, 403, 'Solo el administrador del espacio'));
    try {
      if (p === '/api/stock' && m === 'GET') return ok(res, stock.view(space.id, only));
      if (m === 'POST') {
        const b = await readBody(req);
        if (p === '/api/stock/import') { if (adminOnly()) return; return ok(res, { result: await stock.importListings(space.id) }); }
        if (p === '/api/stock/confirm') { if (adminOnly()) return; return ok(res, { n: await stock.confirm(space.id, Number(b.bodega_id)) }); }
        if (p === '/api/stock/pause') { if (adminOnly()) return; stock.pause(space.id, Number(b.bodega_id)); return ok(res); }
        if (p === '/api/stock/bodega') { if (adminOnly()) return; return ok(res, { id: stock.saveBodega(space.id, b) }); }
        if (p === '/api/stock/push-all') { if (adminOnly()) return; return ok(res, { n: await stock.pushAll(space.id) }); }
        // un vendedor solo cambia el stock de su propia bodega
        const okOwner = () => { if (user.role !== 'seller') return true; const r = db.prepare('SELECT 1 FROM stock_seller_bodega WHERE seller_id=? AND bodega_id=?').get(user.seller_id, Number(b.bodega_id)); return Boolean(r); };
        if (p === '/api/stock/set') { if (!okOwner()) return fail(res, 403, 'No es tu bodega'); return ok(res, { qty: stock.setQty(space.id, Number(b.bodega_id), user.role === 'seller' ? user.seller_id : Number(b.owner || 0), b.sku, b.qty, user.name || user.email) }); }
        if (p === '/api/stock/bulk') { if (!okOwner()) return fail(res, 403, 'No es tu bodega'); return ok(res, stock.bulk(space.id, Number(b.bodega_id), user.role === 'seller' ? user.seller_id : Number(b.owner || 0), b.text, user.name || user.email)); }
      }
    } catch (e) { return fail(res, 400, e.message); }
    return fail(res, 404, 'No encontrado');
  }

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
    const rows = db.prepare("SELECT * FROM orders WHERE state <> 'cancelled' AND created_at >= datetime('now', ?)" + (user.role === 'seller' ? ' AND seller_id = ?' : '')).all(`-${days + 15} day`, ...(user.role === 'seller' ? [user.seller_id] : [])).filter(o => vis.includes(o.seller_id));
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
    if (user.role === 'fulfillment') return ok(res, sales.feed(vis, 80, { noMoney: true }));
    return ok(res, { ...sales.feed(notifSellers(user)), mine: notifSellers(user), sellers: user.role === 'admin' ? db.prepare('SELECT id, name FROM sellers WHERE space_id=? ORDER BY name').all(user.space_id || 1) : [] });
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
    let sid = user.role === 'seller' ? user.seller_id : (Number(url.searchParams.get('seller_id')) || null);
    if (sid && !sids.includes(sid)) sid = null;
    const sellersList = user.role === 'admin' ? db.prepare('SELECT id, name FROM sellers WHERE space_id=? ORDER BY name').all(user.space_id || 1) : [];
    return ok(res, { ...sales.summary(sid || sids, url.searchParams.get('from'), url.searchParams.get('to')), sellers: sellersList, seller_id: sid });
  }

  // Calculador de ganancia por publicación (vendedor: lo suyo; administrador: el vendedor que elija)
  if (p === '/api/profit' && m === 'GET') {
    if (user.role === 'fulfillment') return fail(res, 403, 'No permitido');
    const sid = user.role === 'seller' ? user.seller_id : Number(url.searchParams.get('seller_id')) || null;
    if (!sid || !sids.includes(sid)) return ok(res, { rows: [], saved: {}, errors: [], need_seller: true });
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
    if (!sid || !sids.includes(sid)) return fail(res, 400, 'Elige un vendedor');
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
    let sid = user.role === 'seller' && !noMoney ? user.seller_id : (Number(url.searchParams.get('seller_id')) || null);
    if (sid && !vis.includes(sid)) return fail(res, 403, 'No permitido');
    if (!sid) sid = vis; // todas las cuentas de su espacio
    if (p.endsWith('.xlsx')) {
      const sname = sid && !Array.isArray(sid) ? db.prepare('SELECT name FROM sellers WHERE id=?').get(sid)?.name : null;
      const file = `productos-vendidos-${(sname || 'todas').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${from}-al-${to}.xlsx`;
      return send(res, 200, sales.productsXlsx(sid, from, to, sname, { noMoney }), { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': `attachment; filename="${file}"` });
    }
    const out = sales.products(sid, from, to, { excludeBlocked: noMoney });
    if (noMoney) for (const r of out.rows) { delete r.amount; for (const v of r.variants) delete v.amount; }
    return ok(res, out);
  }

  if (p === '/api/sellers/list' && m === 'GET') return ok(res, { sellers: db.prepare('SELECT id, name FROM sellers WHERE space_id=? ORDER BY name').all(user.space_id || 1) });

  // ----- vendedores (solo lectura) para fulfillment y administrador -----
  if (p === '/api/sellers/overview' && m === 'GET') {
    if (user.role === 'seller') return fail(res, 403, 'No permitido');
    const MKN = { ml: 'Mercado Libre', fa: 'Falabella', pa: 'Paris' };
    const sellersList = db.prepare('SELECT id, name FROM sellers WHERE space_id=? ORDER BY name').all(user.space_id || 1).map(s => ({
      id: s.id, name: s.name,
      connections: db.prepare('SELECT marketplace, account_label, last_sync_at, last_error FROM connections WHERE seller_id=?').all(s.id)
        .filter(c => MKN[c.marketplace]).map(c => ({ marketplace: c.marketplace, account_label: c.account_label, last_sync_at: c.last_sync_at, ok: !c.last_error })),
      blocked: db.prepare('SELECT COUNT(*) n FROM blocklist WHERE seller_id=?').get(s.id).n,
      pending: db.prepare("SELECT COUNT(*) n FROM orders WHERE seller_id=? AND state='ready'").get(s.id).n,
    }));
    return ok(res, { sellers: sellersList });
  }

  // ----- módulos del espacio (los prende o apaga el administrador del espacio) -----
  if (p === '/api/space' && m === 'GET') {
    return ok(res, { space: { id: space.id, name: space.name, status: spaceSt, modules: mods }, catalog: spaces.MODULES, canEdit: user.role === 'admin' });
  }
  if (p === '/api/space' && m === 'POST') {
    if (user.role !== 'admin') return fail(res, 403, 'Solo el administrador del espacio');
    const b = await readBody(req);
    if (b.name !== undefined && String(b.name).trim()) db.prepare('UPDATE spaces SET name=? WHERE id=?').run(String(b.name).trim().slice(0, 80), space.id);
    const modules = b.modules ? spaces.setModules(space.id, b.modules) : mods;
    sync.logEvent(null, 'admin', `${user.name} cambió los módulos de ${space.name}: ${Object.entries(b.modules || {}).map(([k, v]) => k + (v ? ' prendido' : ' apagado')).join(', ')}`);
    sync.bus.emit('change', { type: 'space', sellerId: null });
    return ok(res, { modules });
  }

  // ----- Mi plan (cobro con Mercado Pago): lo ve y paga el administrador de cada empresa -----
  if (p.startsWith('/api/billing')) {
    const billing = require('./billing');
    if (user.role !== 'admin') return fail(res, 403, 'Solo el administrador de la empresa');
    try {
      if (p === '/api/billing' && m === 'GET') {
        let sp = space;
        if (sp.mp_sub_id && (url.searchParams.get('check') === '1' || Date.now() - (sp.mp_checked || 0) > 60e3)) sp = await billing.sync(sp.id) || sp;
        return ok(res, { ...billing.info(sp), space_status: spaces.status(sp), space_id: sp.id });
      }
      if (p === '/api/billing/subscribe' && m === 'POST') {
        if (space.id === 1) return fail(res, 400, 'Tu espacio principal no paga');
        const b = await readBody(req);
        const u = db.prepare('SELECT email FROM users WHERE id=?').get(user.id);
        return ok(res, await billing.subscribe(space, String(b.plan || ''), String(b.email || u.email).trim()));
      }
      if (p === '/api/billing/cancel' && m === 'POST') { await billing.cancel(space); return ok(res); }
    } catch (e) { return fail(res, 400, String(e.message).replace(/HTTP \d+ en \S+: /, '').slice(0, 300)); }
    return fail(res, 404, 'No encontrado');
  }

  // ----- panel del dueño de la app: todos los espacios -----
  if (p.startsWith('/api/owner/')) {
    if (!isOwner) return fail(res, 403, 'Solo el dueño de la app');
    if (p === '/api/owner/spaces' && m === 'GET') return ok(res, { spaces: spaces.list(), catalog: spaces.MODULES });
    // Cobros: Access Token de Mercado Pago (lo pega el dueño) y los planes con sus precios
    if (p === '/api/owner/billing' && m === 'GET') {
      const billing = require('./billing');
      let account = null;
      if (billing.configured()) { try { const r = await require('./http').request((process.env.MP_API || 'https://api.mercadopago.com') + '/users/me', { headers: { authorization: `Bearer ${settings.get('mp_access_token')}` } }, { retries: 0 }); account = { nickname: r.nickname, email: r.email, site: r.site_id }; } catch (e) { account = { error: 'Mercado Pago rechazó el Access Token' }; } }
      return ok(res, { configured: billing.configured(), account, plans: billing.plans().map(x => ({ ...x, total: billing.withIva(x.price) })), history: billing.history(null), webhook_url: `${cfg.baseUrl}/webhooks/mp` });
    }
    if (p === '/api/owner/billing' && m === 'POST') {
      const billing = require('./billing');
      const b = await readBody(req);
      try {
        if (b.mp_access_token) {
          const t = String(b.mp_access_token).trim();
          if (!/^(APP_USR|TEST)-/.test(t)) return fail(res, 400, 'El Access Token de Mercado Pago empieza con APP_USR-');
          const r = await require('./http').request((process.env.MP_API || 'https://api.mercadopago.com') + '/users/me', { headers: { authorization: `Bearer ${t}` } }, { retries: 0 }).catch(() => null);
          if (!r) return fail(res, 400, 'Mercado Pago rechazó ese Access Token. Revisa que lo copiaste completo.');
          settings.set('mp_access_token', t);
          sync.logEvent(null, 'owner', `${user.name} configuró Mercado Pago (${r.nickname || r.email || ''})`);
        }
        if (b.plans) billing.savePlans(b.plans);
      } catch (e) { return fail(res, 400, e.message); }
      return ok(res);
    }
    const os = p.match(/^\/api\/owner\/spaces\/(\d+)(\/enter)?$/);
    if (os && m === 'POST' && !os[2]) {
      const b = await readBody(req);
      try {
        const sp = spaces.setAccess(Number(os[1]), { addDays: Number(b.addDays) || 0, until: b.until || null, blocked: b.blocked });
        if (b.modules) spaces.setModules(sp.id, b.modules);
        sync.logEvent(null, 'owner', `${user.name} actualizó el espacio ${sp.name}${b.addDays ? ' (+' + b.addDays + ' días)' : ''}${b.until ? ' (hasta ' + b.until + ')' : ''}${b.blocked !== undefined ? (b.blocked ? ' (suspendido)' : ' (reactivado)') : ''}`);
        return ok(res, { space: spaces.list().find(x => x.id === sp.id) });
      } catch (e) { return fail(res, 400, e.message); }
    }
    if (os && m === 'POST' && os[2]) {
      // entrar al espacio como su administrador (para ayudarle); "Volver a mi cuenta" deja todo como estaba
      const target = db.prepare("SELECT id, email FROM users WHERE space_id=? AND role='admin' ORDER BY id LIMIT 1").get(Number(os[1]));
      if (!target) return fail(res, 404, 'Ese espacio no tiene administrador');
      if (target.id === user.id) return fail(res, 400, 'Ya estás en ese espacio');
      sync.logEvent(null, 'owner', `${user.name} entró al espacio ${os[1]} como ${target.email}`);
      setSessionCookie(res, sec.createSession(target.id, user.impersonator_id || user.id));
      return ok(res);
    }
    return fail(res, 404, 'No encontrado');
  }

  // ----- administración -----
  if (p.startsWith('/api/admin/')) {
    if (user.role !== 'admin') return fail(res, 403, 'Solo administrador');
    if (p === '/api/admin/sellers' && m === 'GET') {
      const sellers = db.prepare('SELECT id, name, created_at FROM sellers WHERE space_id=? ORDER BY name').all(user.space_id || 1).map(s => ({
        ...s,
        connections: db.prepare('SELECT id, marketplace, last_error, last_sync_at FROM connections WHERE seller_id=?').all(s.id),
        blocked: db.prepare('SELECT COUNT(*) n FROM blocklist WHERE seller_id=?').get(s.id).n,
      }));
      const users = db.prepare('SELECT id, email, name, role, seller_id, must_change, (backup_hash IS NOT NULL) AS has_backup FROM users WHERE space_id=? ORDER BY role, name').all(user.space_id || 1);
      return ok(res, { sellers, users });
    }
    // Recuperar etiquetas que se imprimieron pero cuyo registro se perdió: quedan impresas (y desbloqueadas)
    if (p === '/api/admin/restore-printed' && m === 'POST') {
      const b = await readBody(req);
      let n = 0;
      for (const it of (b.items || []).slice(0, 500)) {
        const o = db.prepare('SELECT * FROM orders WHERE id=?').get(Number(it.id));
        if (!o || !vis.includes(o.seller_id) || !['ready', 'waiting', 'error'].includes(o.state)) continue;
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
      return ok(res, { id: Number(db.prepare('INSERT INTO sellers (name, space_id) VALUES (?,?)').run(String(name).trim(), user.space_id || 1).lastInsertRowid) });
    }
    const sd = p.match(/^\/api\/admin\/sellers\/(\d+)$/);
    if (sd && m === 'DELETE') { if (!vis.includes(Number(sd[1]))) return fail(res, 404, 'Vendedor no encontrado'); db.prepare('DELETE FROM sellers WHERE id=?').run(Number(sd[1])); return ok(res); }
    if (p === '/api/admin/users' && m === 'POST') {
      const b = await readBody(req);
      const role = ['admin', 'fulfillment', 'seller', 'agencia'].includes(b.role) ? b.role : null;
      if (!role || !b.email || !b.name || String(b.password || '').length < 8) return fail(res, 400, 'Completa nombre, correo, rol y una contraseña de al menos 8 caracteres');
      if (role === 'seller' && !b.seller_id) return fail(res, 400, 'Elige a qué vendedor pertenece');
      if (role === 'seller' && !vis.includes(Number(b.seller_id))) return fail(res, 400, 'Ese vendedor no es de tu espacio');
      if (role === 'fulfillment' && !mods.fulfillment) return fail(res, 400, 'Prende el módulo Fulfillment para crear usuarios de fulfillment');
      try {
        db.prepare('INSERT INTO users (email, name, role, seller_id, pass_hash, space_id) VALUES (?,?,?,?,?,?)').run(String(b.email).trim(), String(b.name).trim(), role, role === 'seller' ? Number(b.seller_id) : null, sec.hashPassword(String(b.password)), user.space_id || 1);
      } catch { return fail(res, 400, 'Ese correo ya existe'); }
      return ok(res);
    }
    const ua = p.match(/^\/api\/admin\/users\/(\d+)\/(temp-password|send-code|impersonate|backup-code)$/);
    if (ua && m === 'POST') {
      const target = db.prepare('SELECT id, email, name, role, space_id FROM users WHERE id=?').get(Number(ua[1]));
      if (!target || (target.space_id !== (user.space_id || 1) && !isOwner)) return fail(res, 404, 'Usuario no encontrado');
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
      if (!sid || !vis.includes(sid)) return fail(res, 400, 'Elige un vendedor');
      const exp = Date.now() + 48 * 3600e3;
      return ok(res, { url: `${cfg.baseUrl}/auth/ml/link?s=${sid}&e=${exp}&g=${sec.sign(`mllink:${sid}:${exp}`)}` });
    }
    // cambiar el rol de un usuario (p. ej. dar permisos de administrador a la cuenta de un vendedor)
    const ur = p.match(/^\/api\/admin\/users\/(\d+)\/role$/);
    if (ur && m === 'POST') {
      const b = await readBody(req);
      const role = ['admin', 'fulfillment', 'seller', 'agencia'].includes(b.role) ? b.role : null;
      const target = db.prepare('SELECT id, email, role, seller_id, space_id FROM users WHERE id=?').get(Number(ur[1]));
      if (!target || !role || target.space_id !== (user.space_id || 1)) return fail(res, 400, 'Usuario o rol inválido');
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
      if (db.prepare('SELECT space_id FROM users WHERE id=?').get(Number(ud[1]))?.space_id !== (user.space_id || 1)) return fail(res, 404, 'Usuario no encontrado');
      db.prepare('DELETE FROM users WHERE id=?').run(Number(ud[1])); return ok(res);
    }
    if (ud && m === 'POST' && ud[2]) {
      const { password } = await readBody(req);
      if (String(password || '').length < 8) return fail(res, 400, 'La contraseña debe tener al menos 8 caracteres');
      if (db.prepare('SELECT space_id FROM users WHERE id=?').get(Number(ud[1]))?.space_id !== (user.space_id || 1)) return fail(res, 404, 'Usuario no encontrado');
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

global.__EH_PUBLIC = {"app.css":"OnJvb3R7CiAgLS1iZzojRUFGNUZDOyAtLWJnMjojRDhFREY5OyAtLXN1cmZhY2U6I0ZGRkZGRjsgLS1zdXJmYWNlMjojRjRGQUZFOwogIC0taW5rOiMwQzJCNDA7IC0tbXV0ZWQ6IzU1NzI4NzsgLS1saW5lOiNDOUUyRjI7CiAgLS1hY2NlbnQ6IzE2OTNEMzsgLS1hY2NlbnQtc3Ryb25nOiMwQTZGQTY7IC0tc2t5OiM3RkNERjI7IC0taWNlOiNCRkU2Rjg7CiAgLS1vazojMjM5NDZBOyAtLW9rLWJnOiNEREY0RUE7IC0tbG9jazojQzgzRTU1OyAtLWxvY2stYmc6I0ZCRTNFODsgLS13YXJuOiNCNzc5MEY7IC0td2Fybi1iZzojRkNGMEQ2OwogIC0tbWw6I0ZGRTYwMDsgLS1tbC1pbms6IzJEMzI3NzsgLS1mYTojQUFENTAwOyAtLWZhLWluazojMkYzQTAwOyAtLXBhOiMwMDc4Qzg7IC0tcGEtaW5rOiNGRkZGRkY7CiAgLS1zaGFkb3c6MCAxMHB4IDMwcHggLTE0cHggcmdiYSgxMiw3MCwxMTAsLjM1KTsKICAtLWRpc3BsYXk6IkJhbG9vIDIiLCJUcmVidWNoZXQgTVMiLHN5c3RlbS11aSxzYW5zLXNlcmlmOwogIC0tYm9keToiTnVuaXRvIFNhbnMiLHN5c3RlbS11aSwtYXBwbGUtc3lzdGVtLCJTZWdvZSBVSSIsc2Fucy1zZXJpZjsKICAtLW1vbm86IkpldEJyYWlucyBNb25vIix1aS1tb25vc3BhY2UsTWVubG8sQ29uc29sYXMsbW9ub3NwYWNlOwogIGNvbG9yLXNjaGVtZTpsaWdodDsKfQoqe2JveC1zaXppbmc6Ym9yZGVyLWJveH0KaHRtbCxib2R5e21hcmdpbjowfQpib2R5e2JhY2tncm91bmQ6dmFyKC0tYmcpO2NvbG9yOnZhcigtLWluayk7Zm9udC1mYW1pbHk6dmFyKC0tYm9keSk7Zm9udC1zaXplOjE1cHg7bGluZS1oZWlnaHQ6MS41O21pbi1oZWlnaHQ6MTAwdmh9Ci53cmFwe21heC13aWR0aDoxMjQwcHg7bWFyZ2luOjAgYXV0bztwYWRkaW5nLWlubGluZToyMHB4O3BhZGRpbmctYmxvY2s6MCA2MHB4fQpoMSxoMixoM3tmb250LWZhbWlseTp2YXIoLS1kaXNwbGF5KTtsaW5lLWhlaWdodDoxLjE7dGV4dC13cmFwOmJhbGFuY2U7bWFyZ2luOjB9CmJ1dHRvbntmb250OmluaGVyaXQ7Y3Vyc29yOnBvaW50ZXI7Y29sb3I6aW5oZXJpdH0KYXtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KYnV0dG9uOmZvY3VzLXZpc2libGUsaW5wdXQ6Zm9jdXMtdmlzaWJsZSxzZWxlY3Q6Zm9jdXMtdmlzaWJsZSx0ZXh0YXJlYTpmb2N1cy12aXNpYmxlLGE6Zm9jdXMtdmlzaWJsZXtvdXRsaW5lOjNweCBzb2xpZCB2YXIoLS1za3kpO291dGxpbmUtb2Zmc2V0OjJweH0KLm1vbm97Zm9udC1mYW1pbHk6dmFyKC0tbW9ubyk7Zm9udC1zaXplOi44NmVtfQoubXV0ZWR7Y29sb3I6dmFyKC0tbXV0ZWQpfQpbaGlkZGVuXXtkaXNwbGF5Om5vbmUhaW1wb3J0YW50fQoKLyogYmFycmEgc3VwZXJpb3IgKi8KLnRvcHtwb3NpdGlvbjpzdGlja3k7dG9wOjA7ei1pbmRleDoyMDtiYWNrZ3JvdW5kOmNvbG9yLW1peChpbiBzcmdiLHZhcigtLWJnKSA4OCUsdHJhbnNwYXJlbnQpO2JhY2tkcm9wLWZpbHRlcjpibHVyKDhweCk7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tbGluZSl9Ci50b3AgLndyYXB7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6MTRweDtmbGV4LXdyYXA6d3JhcDtwYWRkaW5nLWJsb2NrOjEwcHh9Ci5icmFuZHtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDoxMHB4O2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MjJweDtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKTt0ZXh0LWRlY29yYXRpb246bm9uZX0KLmJyYW5kIGltZ3t3aWR0aDozMnB4O2hlaWdodDozMnB4fQoubmF2e2Rpc3BsYXk6ZmxleDtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czo5OTlweDtwYWRkaW5nOjRweDtnYXA6NHB4fQoubmF2IGJ1dHRvbntib3JkZXI6MDtiYWNrZ3JvdW5kOnRyYW5zcGFyZW50O2NvbG9yOnZhcigtLW11dGVkKTtwYWRkaW5nOjdweCAxNXB4O2JvcmRlci1yYWRpdXM6OTk5cHg7Zm9udC13ZWlnaHQ6NzAwfQoubmF2IGJ1dHRvblthcmlhLWN1cnJlbnQ9InRydWUiXXtiYWNrZ3JvdW5kOnZhcigtLWFjY2VudCk7Y29sb3I6I2ZmZn0KLnNwYWNlcntmbGV4OjF9Ci5saXZle2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjZweDtmb250LXNpemU6MTIuNXB4O2ZvbnQtd2VpZ2h0OjcwMDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5saXZlIGl7d2lkdGg6OXB4O2hlaWdodDo5cHg7Ym9yZGVyLXJhZGl1czo1MCU7YmFja2dyb3VuZDp2YXIoLS1tdXRlZCl9Ci5saXZlLm9ue2NvbG9yOnZhcigtLW9rKX0gLmxpdmUub24gaXtiYWNrZ3JvdW5kOnZhcigtLW9rKTtib3gtc2hhZG93OjAgMCAwIDRweCBjb2xvci1taXgoaW4gc3JnYix2YXIoLS1vaykgMjUlLHRyYW5zcGFyZW50KX0KLmNsb2Nre2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjEwcHg7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTRweDtwYWRkaW5nOjVweCAxMnB4fQouY2xvY2sgYntmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6MTdweDtmb250LXZhcmlhbnQtbnVtZXJpYzp0YWJ1bGFyLW51bXN9Ci5jbG9jayBzbWFsbHtjb2xvcjp2YXIoLS1tdXRlZCk7ZGlzcGxheTpibG9jaztsaW5lLWhlaWdodDoxLjE7Zm9udC1zaXplOjEwLjVweDt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7bGV0dGVyLXNwYWNpbmc6LjA2ZW19Ci5jbG9jay5sYXRlIGJ7Y29sb3I6dmFyKC0tbG9jayl9Ci51c2Vye2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjhweDtmb250LXNpemU6MTMuNXB4fQoudXNlciBie2Rpc3BsYXk6YmxvY2s7bGluZS1oZWlnaHQ6MS4xfQoudXNlciBzbWFsbHtjb2xvcjp2YXIoLS1tdXRlZCl9CgovKiBlbGVtZW50b3MgKi8KLmJ0bnt0ZXh0LWRlY29yYXRpb246bm9uZTtib3JkZXI6MDtib3JkZXItcmFkaXVzOjEzcHg7cGFkZGluZzo5cHggMTVweDtmb250LXdlaWdodDo3MDA7ZGlzcGxheTppbmxpbmUtZmxleDtnYXA6OHB4O2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyO3doaXRlLXNwYWNlOm5vd3JhcH0KLmJ0biBzdmd7d2lkdGg6MThweDtoZWlnaHQ6MThweDtmbGV4Om5vbmV9Ci5idG4tcHJpbWFyeXtiYWNrZ3JvdW5kOnZhcigtLWFjY2VudCk7Y29sb3I6I2ZmZn0KLmJ0bi1wcmltYXJ5OmhvdmVye2JhY2tncm91bmQ6dmFyKC0tYWNjZW50LXN0cm9uZyl9Ci5idG4tZ2hvc3R7YmFja2dyb3VuZDp2YXIoLS1pY2UpO2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQouYnRuLWxpbmV7YmFja2dyb3VuZDp0cmFuc3BhcmVudDtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2NvbG9yOnZhcigtLWluayl9Ci5idG4tZGFuZ2Vye2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayl9Ci5idG46ZGlzYWJsZWR7b3BhY2l0eTouNDU7Y3Vyc29yOm5vdC1hbGxvd2VkfQouYnRuLXNte3BhZGRpbmc6NnB4IDEwcHg7Zm9udC1zaXplOjEzcHg7Ym9yZGVyLXJhZGl1czoxMHB4fQpzZWxlY3QsaW5wdXRbdHlwZT10ZXh0XSxpbnB1dFt0eXBlPWVtYWlsXSxpbnB1dFt0eXBlPXBhc3N3b3JkXSxpbnB1dFt0eXBlPXNlYXJjaF0sdGV4dGFyZWF7Zm9udDppbmhlcml0O2NvbG9yOnZhcigtLWluayk7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlMik7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjEycHg7cGFkZGluZzo4cHggMTJweDttaW4td2lkdGg6MDt3aWR0aDoxMDAlfQp0ZXh0YXJlYXtyZXNpemU6dmVydGljYWw7bWluLWhlaWdodDo3MHB4fQpsYWJlbC5me2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjRweDtmb250LXNpemU6MTIuNXB4O2ZvbnQtd2VpZ2h0OjcwMDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5jaGlwc3tkaXNwbGF5OmZsZXg7Z2FwOjZweDtmbGV4LXdyYXA6d3JhcH0KLmNoaXB7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKTtjb2xvcjp2YXIoLS1pbmspO3BhZGRpbmc6NnB4IDEycHg7Ym9yZGVyLXJhZGl1czo5OTlweDtmb250LXdlaWdodDo2MDA7Zm9udC1zaXplOjEzcHh9Ci5jaGlwW2FyaWEtcHJlc3NlZD0idHJ1ZSJde2JhY2tncm91bmQ6dmFyKC0tYWNjZW50KTtib3JkZXItY29sb3I6dmFyKC0tYWNjZW50KTtjb2xvcjojZmZmfQouc3dpdGNoe2Rpc3BsYXk6aW5saW5lLWZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDoxMHB4O2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTRweDtjdXJzb3I6cG9pbnRlcjt1c2VyLXNlbGVjdDpub25lfQouc3dpdGNoIGlucHV0e2FwcGVhcmFuY2U6bm9uZTt3aWR0aDo0NHB4O2hlaWdodDoyNnB4O2JvcmRlci1yYWRpdXM6OTk5cHg7YmFja2dyb3VuZDp2YXIoLS1saW5lKTtwb3NpdGlvbjpyZWxhdGl2ZTt0cmFuc2l0aW9uOmJhY2tncm91bmQgLjJzO2N1cnNvcjpwb2ludGVyO21hcmdpbjowO2ZsZXg6bm9uZX0KLnN3aXRjaCBpbnB1dDo6YWZ0ZXJ7Y29udGVudDoiIjtwb3NpdGlvbjphYnNvbHV0ZTt0b3A6M3B4O2xlZnQ6M3B4O3dpZHRoOjIwcHg7aGVpZ2h0OjIwcHg7Ym9yZGVyLXJhZGl1czo1MCU7YmFja2dyb3VuZDojZmZmO3RyYW5zaXRpb246bGVmdCAuMnM7Ym94LXNoYWRvdzowIDFweCAzcHggcmdiYSgwLDAsMCwuMjUpfQouc3dpdGNoIGlucHV0OmNoZWNrZWR7YmFja2dyb3VuZDp2YXIoLS1vayl9Ci5zd2l0Y2ggaW5wdXQ6Y2hlY2tlZDo6YWZ0ZXJ7bGVmdDoyMXB4fQoKLnBhbmVse2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjIycHg7Ym94LXNoYWRvdzp2YXIoLS1zaGFkb3cpfQoucGFuZWwtaGVhZHtkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7Z2FwOjEycHg7YWxpZ24taXRlbXM6Y2VudGVyO3BhZGRpbmc6MTZweCAyMHB4O2JvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLWxpbmUpfQoucGFuZWwtaGVhZCBoMntmb250LXNpemU6MjNweDttYXJnaW4tcmlnaHQ6YXV0b30KLnBhbmVsLWJvZHl7cGFkZGluZzoxNnB4IDIwcHh9Ci5wYW5lbC1mb290e2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6MTBweDthbGlnbi1pdGVtczpjZW50ZXI7cGFkZGluZzoxNHB4IDIwcHg7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tbGluZSk7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtc2l6ZToxMy41cHh9CgoubWt7ZGlzcGxheTppbmxpbmUtZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Zm9udC13ZWlnaHQ6NzAwO2ZvbnQtc2l6ZToxMnB4O3BhZGRpbmc6M3B4IDlweDtib3JkZXItcmFkaXVzOjhweDt3aGl0ZS1zcGFjZTpub3dyYXB9Ci5tay5tbHtiYWNrZ3JvdW5kOnZhcigtLW1sKTtjb2xvcjp2YXIoLS1tbC1pbmspfSAubWsuZmF7YmFja2dyb3VuZDp2YXIoLS1mYSk7Y29sb3I6dmFyKC0tZmEtaW5rKX0gLm1rLnBhe2JhY2tncm91bmQ6dmFyKC0tcGEpO2NvbG9yOnZhcigtLXBhLWluayl9Ci5waWxse2Rpc3BsYXk6aW5saW5lLWZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo2cHg7Ym9yZGVyLXJhZGl1czo5OTlweDtwYWRkaW5nOjRweCAxMHB4O2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTIuNXB4O3doaXRlLXNwYWNlOm5vd3JhcH0KLnBpbGwgc3Zne3dpZHRoOjE0cHg7aGVpZ2h0OjE0cHh9Ci5waWxsLnJlYWR5e2JhY2tncm91bmQ6dmFyKC0tb2stYmcpO2NvbG9yOnZhcigtLW9rKX0KLnBpbGwuYmxvY2tlZHtiYWNrZ3JvdW5kOiNFM0U3RUM7Y29sb3I6IzRBNTU2M30KLnBpbGwucHJpbnRlZHtiYWNrZ3JvdW5kOnZhcigtLWxvY2stYmcpO2NvbG9yOnZhcigtLWxvY2spfQoucGlsbC53YWl0aW5ne2JhY2tncm91bmQ6dmFyKC0td2Fybi1iZyk7Y29sb3I6dmFyKC0td2Fybil9Ci5waWxsLmVycm9ye2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayl9Ci5waWxsLmNhbmNlbGxlZHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKTtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5ub3Rle2Rpc3BsYXk6YmxvY2s7Zm9udC1zaXplOjEycHg7Y29sb3I6dmFyKC0tbXV0ZWQpO21hcmdpbi10b3A6NHB4O21heC13aWR0aDozNGNofQoubm90ZS5iYWR7Y29sb3I6dmFyKC0tbG9jayl9CgovKiBow6lyb2UgKi8KLmhlcm97ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczoxLjFmciAuOWZyO2dhcDoyNHB4O2FsaWduLWl0ZW1zOmNlbnRlcjtwYWRkaW5nLWJsb2NrOjI0cHggNnB4fQouaGVybyBoMXtmb250LXNpemU6Y2xhbXAoMjhweCwzLjZ2dyw0MHB4KTtmb250LXdlaWdodDo4MDB9Ci5oZXJvIGgxIGVte2ZvbnQtc3R5bGU6bm9ybWFsO2NvbG9yOnZhcigtLWFjY2VudCl9Ci5oZXJvIHB7Y29sb3I6dmFyKC0tbXV0ZWQpO21heC13aWR0aDo1NmNoO21hcmdpbjoxMHB4IDAgMH0KLmhlcm8gc3Zne3dpZHRoOjEwMCU7aGVpZ2h0OmF1dG87bWF4LWhlaWdodDoyMTBweH0KCi8qIGtwaXMgKi8KLmtwaXN7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoNCwxZnIpO2dhcDoxNHB4O21hcmdpbi1ibG9jazoxOHB4fQoua3Bpe2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjE4cHg7cGFkZGluZzoxNHB4IDE2cHg7ZGlzcGxheTpmbGV4O2dhcDoxMnB4O2FsaWduLWl0ZW1zOmNlbnRlcn0KLmtwaSAuaWN7d2lkdGg6NDJweDtoZWlnaHQ6NDJweDtib3JkZXItcmFkaXVzOjEycHg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtmbGV4Om5vbmV9Ci5rcGkgLmljIHN2Z3t3aWR0aDoyMnB4O2hlaWdodDoyMnB4fQoua3BpLm9rIC5pY3tiYWNrZ3JvdW5kOnZhcigtLW9rLWJnKTtjb2xvcjp2YXIoLS1vayl9Ci5rcGkud2FpdCAuaWN7YmFja2dyb3VuZDp2YXIoLS13YXJuLWJnKTtjb2xvcjp2YXIoLS13YXJuKX0KLmtwaS5sb2NrIC5pY3tiYWNrZ3JvdW5kOnZhcigtLWxvY2stYmcpO2NvbG9yOnZhcigtLWxvY2spfQoua3BpLmRvbmUgLmlje2JhY2tncm91bmQ6dmFyKC0taWNlKTtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KLmtwaSBie2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtc2l6ZToyOHB4O2xpbmUtaGVpZ2h0OjE7ZGlzcGxheTpibG9jaztmb250LXZhcmlhbnQtbnVtZXJpYzp0YWJ1bGFyLW51bXN9Ci5rcGkgc3Bhbntjb2xvcjp2YXIoLS1tdXRlZCk7Zm9udC1zaXplOjEzcHh9CgouYXV0b2JhcntkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7Z2FwOjE0cHg7YWxpZ24taXRlbXM6Y2VudGVyO2p1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuO2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDEyMGRlZyx2YXIoLS1iZzIpLHZhcigtLXN1cmZhY2UpKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MThweDtwYWRkaW5nOjE0cHggMThweDttYXJnaW4tYm90dG9tOjE2cHh9Ci5hdXRvYmFyIHB7bWFyZ2luOjJweCAwIDA7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtc2l6ZToxM3B4O21heC13aWR0aDo3MGNofQoKLmZpbHRlcnN7ZGlzcGxheTpmbGV4O2ZsZXgtd3JhcDp3cmFwO2dhcDoxMHB4O2FsaWduLWl0ZW1zOmNlbnRlcn0KLmZpbHRlcnMgc2VsZWN0LC5maWx0ZXJzIGlucHV0e3dpZHRoOmF1dG99Ci50YWJsZS13cmFwe292ZXJmbG93LXg6YXV0b30KdGFibGV7d2lkdGg6MTAwJTtib3JkZXItY29sbGFwc2U6Y29sbGFwc2U7bWluLXdpZHRoOjgyMHB4fQp0aHtmb250LXNpemU6MTEuNXB4O3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtsZXR0ZXItc3BhY2luZzouMDdlbTtjb2xvcjp2YXIoLS1tdXRlZCk7dGV4dC1hbGlnbjpsZWZ0O3BhZGRpbmc6MTBweCAxNHB4O2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZTIpO3doaXRlLXNwYWNlOm5vd3JhcH0KdGR7cGFkZGluZzoxMXB4IDE0cHg7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tbGluZSk7dmVydGljYWwtYWxpZ246bWlkZGxlfQp0ci5pcy1ibG9ja2VkIHRke2JhY2tncm91bmQ6Y29sb3ItbWl4KGluIHNyZ2IsdmFyKC0tbG9jay1iZykgNDUlLHRyYW5zcGFyZW50KX0KdHIuaXMtbmV3IHRke2FuaW1hdGlvbjpmbGFzaCAyLjVzIGVhc2Utb3V0fQpAa2V5ZnJhbWVzIGZsYXNoe2Zyb217YmFja2dyb3VuZDpjb2xvci1taXgoaW4gc3JnYix2YXIoLS1za3kpIDQ1JSx0cmFuc3BhcmVudCl9dG97YmFja2dyb3VuZDp0cmFuc3BhcmVudH19Ci5pdGVtc3tkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDoycHg7Zm9udC1zaXplOjEzLjVweH0KLml0ZW1zIC52e2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTIuNXB4fQouaXRlbXMgLmJhZHtjb2xvcjp2YXIoLS1sb2NrKTtmb250LXdlaWdodDo3MDB9Ci5jYnt3aWR0aDoxOXB4O2hlaWdodDoxOXB4O2FjY2VudC1jb2xvcjp2YXIoLS1hY2NlbnQpfQoubG9ja2NlbGx7Y29sb3I6dmFyKC0tbG9jayk7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcn0KLmxvY2tjZWxsIHN2Z3t3aWR0aDoxOHB4O2hlaWdodDoxOHB4fQoucm93LWFjdGlvbnN7ZGlzcGxheTpmbGV4O2dhcDo2cHg7ZmxleC13cmFwOndyYXB9Ci5lbXB0eXtwYWRkaW5nOjQwcHggMjBweDt0ZXh0LWFsaWduOmNlbnRlcjtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5lbXB0eSBzdmd7d2lkdGg6MTIwcHg7aGVpZ2h0OmF1dG87bWFyZ2luLWJvdHRvbToxMHB4fQoKLyogdmVuZGVkb3IgKi8KLnNlY3Rpb24tdGl0bGV7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6MTJweDtmbGV4LXdyYXA6d3JhcDttYXJnaW4tYmxvY2s6MjRweCAxMnB4fQouc2VjdGlvbi10aXRsZSBoMntmb250LXNpemU6MjZweH0KLmNvbm57ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoMywxZnIpO2dhcDoxNHB4fQoubWNhcmR7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MjBweDtwYWRkaW5nOjE2cHg7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MTBweH0KLm1jYXJkIC5sb2dve2hlaWdodDo0NHB4O2JvcmRlci1yYWRpdXM6MTJweDtkaXNwbGF5OmdyaWQ7cGxhY2UtaXRlbXM6Y2VudGVyO2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MThweH0KLm1jYXJkIC5ob3d7Zm9udC1zaXplOjEyLjVweDtjb2xvcjp2YXIoLS1tdXRlZCk7bWFyZ2luOjB9Ci5zdGF0ZXtmb250LXNpemU6MTNweDtmb250LXdlaWdodDo3MDA7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4fQouc3RhdGUub257Y29sb3I6dmFyKC0tb2spfSAuc3RhdGUub2Zme2NvbG9yOnZhcigtLW11dGVkKX0gLnN0YXRlLmVycntjb2xvcjp2YXIoLS1sb2NrKX0KLnN0YXRlIGl7d2lkdGg6OHB4O2hlaWdodDo4cHg7Ym9yZGVyLXJhZGl1czo1MCU7YmFja2dyb3VuZDpjdXJyZW50Q29sb3I7ZGlzcGxheTppbmxpbmUtYmxvY2t9Ci5jb3B5e2Rpc3BsYXk6ZmxleDtnYXA6NnB4fQouY29weSBpbnB1dHtmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6MTEuNXB4fQouZ3JpZDJ7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczoxZnIgMWZyO2dhcDoyMHB4O21hcmdpbi10b3A6MjBweH0KLnJ1bGV7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczphdXRvIDFmcjtnYXA6MTRweDthbGlnbi1pdGVtczpjZW50ZXI7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlMik7Ym9yZGVyOjFweCBkYXNoZWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czoxNnB4O3BhZGRpbmc6MTJweCAxNHB4fQoucnVsZSBzdmd7d2lkdGg6MTEwcHg7aGVpZ2h0OmF1dG99Ci5ydWxlIHB7bWFyZ2luOjA7Zm9udC1zaXplOjEzLjVweDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5ydWxlIGJ7Y29sb3I6dmFyKC0taW5rKX0KLmFkZHJvd3tkaXNwbGF5OmdyaWQ7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmciAxNTBweCBhdXRvO2dhcDo4cHg7YWxpZ24taXRlbXM6c3RhcnR9Ci50YWdze2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6OHB4O21heC1oZWlnaHQ6MjYwcHg7b3ZlcmZsb3c6YXV0b30KLnRhZ3tkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4O2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayk7Ym9yZGVyLXJhZGl1czoxMHB4O3BhZGRpbmc6NHB4IDRweCA0cHggMTBweDtmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6MTIuNXB4O2ZvbnQtd2VpZ2h0OjcwMH0KLnRhZyBzbWFsbHtmb250LWZhbWlseTp2YXIoLS1ib2R5KTtmb250LXdlaWdodDo2MDA7b3BhY2l0eTouOH0KLnRhZyBidXR0b257Ym9yZGVyOjA7YmFja2dyb3VuZDp0cmFuc3BhcmVudDtjb2xvcjppbmhlcml0O3dpZHRoOjI0cHg7aGVpZ2h0OjI0cHg7Ym9yZGVyLXJhZGl1czo2cHg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcn0KLnRhZyBidXR0b246aG92ZXJ7YmFja2dyb3VuZDpjb2xvci1taXgoaW4gc3JnYix2YXIoLS1sb2NrKSAxOCUsdHJhbnNwYXJlbnQpfQouc3RhY2t7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MTJweH0KLnJvd3tkaXNwbGF5OmZsZXg7Z2FwOjEwcHg7ZmxleC13cmFwOndyYXA7YWxpZ24taXRlbXM6ZW5kfQoucm93ID4gKntmbGV4OjE7bWluLXdpZHRoOjE1MHB4fQoKLyogbG9naW4gKi8KLmxvZ2lue21pbi1oZWlnaHQ6MTAwdmg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtwYWRkaW5nOjIwcHh9Ci5sb2dpbiAuY2FyZHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czoyNnB4O2JveC1zaGFkb3c6dmFyKC0tc2hhZG93KTt3aWR0aDoxMDAlO21heC13aWR0aDo0MjBweDtvdmVyZmxvdzpoaWRkZW59Ci5sb2dpbiAuYXJ0e2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDEzNWRlZyx2YXIoLS1iZzIpLHZhcigtLWljZSkpO3BhZGRpbmc6MjJweCAyNHB4IDhweH0KLmxvZ2luIC5hcnQgc3Zne3dpZHRoOjEwMCU7aGVpZ2h0OmF1dG99Ci5sb2dpbiBmb3Jte3BhZGRpbmc6MjJweCAyNHB4IDI2cHg7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MTJweH0KLmxvZ2luIGgxe2ZvbnQtc2l6ZTozMHB4O2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQouZXJye2NvbG9yOnZhcigtLWxvY2spO2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTMuNXB4O21pbi1oZWlnaHQ6MS4yZW19Ci5kZW1vLWhpbnR7Zm9udC1zaXplOjEyLjVweDtiYWNrZ3JvdW5kOnZhcigtLXdhcm4tYmcpO2NvbG9yOnZhcigtLXdhcm4pO3BhZGRpbmc6OHB4IDEycHg7Ym9yZGVyLXJhZGl1czoxMnB4fQoKLnRvYXN0e3Bvc2l0aW9uOmZpeGVkO2xlZnQ6NTAlO2JvdHRvbToyMnB4O3RyYW5zZm9ybTp0cmFuc2xhdGVYKC01MCUpO2JhY2tncm91bmQ6dmFyKC0taW5rKTtjb2xvcjp2YXIoLS1iZyk7cGFkZGluZzoxMHB4IDE4cHg7Ym9yZGVyLXJhZGl1czoxMnB4O2ZvbnQtd2VpZ2h0OjcwMDt6LWluZGV4OjYwO21heC13aWR0aDpjYWxjKDEwMCUgLSAzMnB4KX0KLm1vZGFse3Bvc2l0aW9uOmZpeGVkO2luc2V0OjA7ei1pbmRleDo1MDtiYWNrZ3JvdW5kOnJnYmEoNiwzMCw0OCwuNTUpO2Rpc3BsYXk6Z3JpZDtwbGFjZS1pdGVtczpjZW50ZXI7cGFkZGluZzoxNnB4fQouc2hlZXR7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXItcmFkaXVzOjIycHg7bWF4LXdpZHRoOjUyMHB4O3dpZHRoOjEwMCU7cGFkZGluZzoyMHB4O2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjEycHh9CgpAbWVkaWEgKG1heC13aWR0aDo5ODBweCl7CiAgLmhlcm8sLmdyaWQye2dyaWQtdGVtcGxhdGUtY29sdW1uczoxZnJ9CiAgLmhlcm8gc3Zne2Rpc3BsYXk6bm9uZX0KICAua3Bpc3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDIsMWZyKX0KICAuY29ubntncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyfQp9CkBtZWRpYSAobWF4LXdpZHRoOjUyMHB4KXsKICAud3JhcHtwYWRkaW5nLWlubGluZToxNnB4fQogIC5hZGRyb3d7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmcn0KICAucnVsZXtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyfQogIC51c2VyIHNtYWxse2Rpc3BsYXk6bm9uZX0KfQpAbWVkaWEgKHByZWZlcnMtcmVkdWNlZC1tb3Rpb246bm8tcHJlZmVyZW5jZSl7CiAgLnRydWNre2FuaW1hdGlvbjpkcml2ZSA2cyBlYXNlLWluLW91dCBpbmZpbml0ZX0KICBAa2V5ZnJhbWVzIGRyaXZlezAlLDEwMCV7dHJhbnNmb3JtOnRyYW5zbGF0ZVgoMCl9NTAle3RyYW5zZm9ybTp0cmFuc2xhdGVYKDE2cHgpfX0KfQouZ3JpZDIgPiAqe21pbi13aWR0aDowfQovKiBiYW5kZWphIG51ZXZhICovCi50YWJzYmlne2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDYsMWZyKTtnYXA6MTBweDttYXJnaW4tYm90dG9tOjE2cHh9Ci50YntkaXNwbGF5OmZsZXg7Z2FwOjEycHg7YWxpZ24taXRlbXM6Y2VudGVyO3RleHQtYWxpZ246bGVmdDtib3JkZXI6MnB4IHNvbGlkIHZhcigtLWxpbmUpO2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyLXJhZGl1czoxOHB4O3BhZGRpbmc6MTRweCAxNnB4O2NvbG9yOnZhcigtLWluayl9Ci50YiAudGItaWN7d2lkdGg6NDRweDtoZWlnaHQ6NDRweDtib3JkZXItcmFkaXVzOjEycHg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtmbGV4Om5vbmV9Ci50YiAudGItaWMgc3Zne3dpZHRoOjIycHg7aGVpZ2h0OjIycHh9Ci50YiBie2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtc2l6ZTozMHB4O2xpbmUtaGVpZ2h0OjE7ZGlzcGxheTpibG9jaztmb250LXZhcmlhbnQtbnVtZXJpYzp0YWJ1bGFyLW51bXN9Ci50YiAudGItbntmb250LXdlaWdodDo4MDA7ZGlzcGxheTpibG9ja30KLnRiIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTJweDtkaXNwbGF5OmJsb2NrO2xpbmUtaGVpZ2h0OjEuMn0KLnRiLXJlYWR5IC50Yi1pY3tiYWNrZ3JvdW5kOnZhcigtLWljZSk7Y29sb3I6dmFyKC0tYWNjZW50LXN0cm9uZyl9Ci50Yi13YWl0aW5nIC50Yi1pY3tiYWNrZ3JvdW5kOnZhcigtLXdhcm4tYmcpO2NvbG9yOnZhcigtLXdhcm4pfQoudGItcHJpbnRlZCAudGItaWN7YmFja2dyb3VuZDp2YXIoLS1vay1iZyk7Y29sb3I6dmFyKC0tb2spfQoudGItYmxvY2tlZCAudGItaWN7YmFja2dyb3VuZDp2YXIoLS1sb2NrLWJnKTtjb2xvcjp2YXIoLS1sb2NrKX0KLnRiW2FyaWEtcHJlc3NlZD0idHJ1ZSJde2JvcmRlci1jb2xvcjp2YXIoLS1hY2NlbnQpO2JveC1zaGFkb3c6MCAwIDAgM3B4IGNvbG9yLW1peChpbiBzcmdiLHZhcigtLWFjY2VudCkgMjIlLHRyYW5zcGFyZW50KX0KLnRiLXJlYWR5W2FyaWEtcHJlc3NlZD0idHJ1ZSJde2JhY2tncm91bmQ6Y29sb3ItbWl4KGluIHNyZ2IsdmFyKC0taWNlKSA0NSUsdmFyKC0tc3VyZmFjZSkpfQouY2hpcCAuY250e2Rpc3BsYXk6aW5saW5lLWJsb2NrO21pbi13aWR0aDoyMHB4O3BhZGRpbmc6MCA2cHg7Ym9yZGVyLXJhZGl1czo5OTlweDtiYWNrZ3JvdW5kOmNvbG9yLW1peChpbiBzcmdiLGN1cnJlbnRDb2xvciAxNSUsdHJhbnNwYXJlbnQpO2ZvbnQtc2l6ZToxMS41cHg7bWFyZ2luLWxlZnQ6NHB4fQouYWN0aW9uYmFye2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6MTBweDthbGlnbi1pdGVtczpjZW50ZXI7cGFkZGluZzoxMnB4IDIwcHg7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tbGluZSk7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlMil9Ci5kYXloZWFke3BhZGRpbmc6MTBweCAyMHB4O2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MTNweDt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7bGV0dGVyLXNwYWNpbmc6LjA2ZW07Y29sb3I6dmFyKC0tYWNjZW50LXN0cm9uZyk7YmFja2dyb3VuZDp2YXIoLS1iZyk7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tbGluZSl9Ci5vcm93e2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MzRweCAxMTBweCAxZnIgYXV0bztnYXA6MTRweDthbGlnbi1pdGVtczpjZW50ZXI7cGFkZGluZzoxMnB4IDIwcHg7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tbGluZSl9Ci5vcm93LnN0LXByaW50ZWR7b3BhY2l0eTouOH0KLm9yb3cuc3QtYmxvY2tlZHtiYWNrZ3JvdW5kOmNvbG9yLW1peChpbiBzcmdiLHZhcigtLWxvY2stYmcpIDQ1JSx0cmFuc3BhcmVudCl9Ci5vYy10aW1le2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjRweDthbGlnbi1pdGVtczpmbGV4LXN0YXJ0fQoub2MtdGltZSBie2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZToxOHB4fQoub2MtdG9we2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6OHB4O2FsaWduLWl0ZW1zOmJhc2VsaW5lO21hcmdpbi1ib3R0b206MnB4fQouY3VzdHtmb250LXdlaWdodDo4MDA7Zm9udC1zaXplOjE1LjVweH0KLmN1c3Q6OmFmdGVye2NvbnRlbnQ6IsK3IjttYXJnaW4tbGVmdDo4cHg7Y29sb3I6dmFyKC0tbXV0ZWQpfQoub2MtYWN0e2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47YWxpZ24taXRlbXM6ZmxleC1lbmQ7Z2FwOjhweH0KLm9yb3cuaXMtbmV3e2FuaW1hdGlvbjpmbGFzaCAyLjVzIGVhc2Utb3V0fQpAbWVkaWEgKG1heC13aWR0aDo4MjBweCl7CiAgLnRhYnNiaWd7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgyLDFmcil9CiAgLm9yb3d7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjI4cHggMWZyO30KICAub3JvdyAub2MtdGltZXtmbGV4LWRpcmVjdGlvbjpyb3c7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo4cHh9CiAgLm9yb3cgLm9jLW1haW4sLm9yb3cgLm9jLWFjdHtncmlkLWNvbHVtbjoyfQogIC5vYy1hY3R7YWxpZ24taXRlbXM6ZmxleC1zdGFydH0KfQoKLyogaW1wcmVzYXMgZW4gcm9qbyAoY29tbyBNZXJjYWRvIExpYnJlKSwgYmxvcXVlYWRhcyBlbiBncmlzICovCi50Yi1wcmludGVkIC50Yi1pY3tiYWNrZ3JvdW5kOnZhcigtLWxvY2stYmcpO2NvbG9yOnZhcigtLWxvY2spfQoudGItYmxvY2tlZCAudGItaWN7YmFja2dyb3VuZDojRTNFN0VDO2NvbG9yOiM0QTU1NjN9Ci5vcm93LnN0LXByaW50ZWR7b3BhY2l0eToxO2JhY2tncm91bmQ6I0ZGRjdGOH0KLm9yb3cuc3QtYmxvY2tlZHtiYWNrZ3JvdW5kOiNGM0Y1Rjd9Ci5vcm93LnN0LWJsb2NrZWQgLmxvY2tjZWxse2NvbG9yOiM0QTU1NjN9Ci5idG4tcmVwcmludHtiYWNrZ3JvdW5kOnZhcigtLWxvY2spO2NvbG9yOiNmZmZ9Ci5idG4tcmVwcmludDpob3ZlcntmaWx0ZXI6YnJpZ2h0bmVzcyguOTIpfQoKLnBpbGwuc2hpcHBlZHtiYWNrZ3JvdW5kOiNFM0U3RUM7Y29sb3I6IzM0NDE0Rn0KLm9yb3cuc3Qtc2hpcHBlZHtiYWNrZ3JvdW5kOiNGQUZCRkN9CgoudGItdG9kYXkgLnRiLWlje2JhY2tncm91bmQ6dmFyKC0taWNlKTtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KLnRiLXVwY29taW5nIC50Yi1pY3tiYWNrZ3JvdW5kOiNFREU5RkU7Y29sb3I6IzZEMjhEOX0KLnRiLXRvZGF5W2FyaWEtcHJlc3NlZD0idHJ1ZSJde2JhY2tncm91bmQ6Y29sb3ItbWl4KGluIHNyZ2IsdmFyKC0taWNlKSA0NSUsdmFyKC0tc3VyZmFjZSkpfQouc2hpcHR5cGV7Zm9udC1zaXplOjExcHg7Zm9udC13ZWlnaHQ6ODAwO3BhZGRpbmc6MnB4IDhweDtib3JkZXItcmFkaXVzOjZweDtiYWNrZ3JvdW5kOiNFRUYyRjY7Y29sb3I6IzM0NDE0Rn0KLnNoaXB0eXBlLnN0LWZsZXh7YmFja2dyb3VuZDojMTZBMzRBO2NvbG9yOiNmZmZ9Ci5zaGlwdHlwZS5zdC1jb2xlY3Rhe2JhY2tncm91bmQ6I0RCRUFGRTtjb2xvcjojMUU0MEFGfQouc2hpcHR5cGUuc3QtYWdlbmNpYXtiYWNrZ3JvdW5kOiNGRUYzQzc7Y29sb3I6IzkyNDAwRX0KLmRpc3BhdGNoe2Rpc3BsYXk6aW5saW5lLWJsb2NrO2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MTIuNXB4O2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpO2JhY2tncm91bmQ6dmFyKC0taWNlKTtib3JkZXItcmFkaXVzOjhweDtwYWRkaW5nOjJweCA4cHg7bWFyZ2luLWJvdHRvbTo0cHh9Ci5kaXNwYXRjaC5sYXRle2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayl9CkBtZWRpYSAobWF4LXdpZHRoOjExMDBweCl7LnRhYnNiaWd7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgzLDFmcil9fQpAbWVkaWEgKG1heC13aWR0aDo2NDBweCl7LnRhYnNiaWd7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgyLDFmcil9fQoKLmJsb2Nrbm97ZGlzcGxheTppbmxpbmUtYmxvY2s7YmFja2dyb3VuZDp2YXIoLS1pbmspO2NvbG9yOiNmZmY7Zm9udC13ZWlnaHQ6ODAwO2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2JvcmRlci1yYWRpdXM6OHB4O3BhZGRpbmc6MnB4IDlweDttYXJnaW4tcmlnaHQ6OHB4O2ZvbnQtc2l6ZToxNHB4fQouaXRlbXMgZW0uZmFsdGF7Zm9udC1zdHlsZTpub3JtYWw7YmFja2dyb3VuZDp2YXIoLS1sb2NrKTtjb2xvcjojZmZmO2JvcmRlci1yYWRpdXM6NXB4O3BhZGRpbmc6MCA1cHg7Zm9udC1zaXplOjExcHg7Zm9udC13ZWlnaHQ6ODAwO2xldHRlci1zcGFjaW5nOi4wNGVtfQoKLml0ZW1zIC5nb29ke2NvbG9yOnZhcigtLW9rKTtmb250LXdlaWdodDo3MDB9Ci5pdGVtcyBlbS50aWVuZXtmb250LXN0eWxlOm5vcm1hbDtiYWNrZ3JvdW5kOnZhcigtLW9rKTtjb2xvcjojZmZmO2JvcmRlci1yYWRpdXM6NXB4O3BhZGRpbmc6MCA1cHg7Zm9udC1zaXplOjExcHg7Zm9udC13ZWlnaHQ6ODAwO2xldHRlci1zcGFjaW5nOi4wNGVtfQoubm9wcmludHtkaXNwbGF5OmJsb2NrO21hcmdpbi10b3A6NnB4O2ZvbnQtd2VpZ2h0OjkwMDtjb2xvcjp2YXIoLS1pbmspO2ZvbnQtc2l6ZToxNXB4O2xldHRlci1zcGFjaW5nOi4wMmVtfQoKLyogVmVudGFzICovCi5zYWxlcy1rcGlze2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MS42ZnIgcmVwZWF0KDQsMWZyKTtnYXA6MTJweDttYXJnaW4tYm90dG9tOjE2cHh9Ci5rcGl7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTZweDtwYWRkaW5nOjE0cHggMTZweDtkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDo0cHg7Ym94LXNoYWRvdzp2YXIoLS1zaGFkb3cpfQoua3BpIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXdlaWdodDo3MDA7Zm9udC1zaXplOjEyLjVweDtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo2cHh9Ci5rcGkgYntmb250LWZhbWlseTp2YXIoLS1kaXNwbGF5KTtmb250LXNpemU6MjRweDtjb2xvcjp2YXIoLS1pbmspO2xpbmUtaGVpZ2h0OjEuMX0KLmtwaSBzcGFue2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTNweH0KLmtwaS1oZXJve2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDEzNWRlZywjRTNGNEZELCNmZmYpO2JvcmRlci1jb2xvcjp2YXIoLS1pY2UpfQoua3BpLWhlcm8gYntmb250LXNpemU6MzRweDtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KLmtwaS1oZXJvIHNwYW57Y29sb3I6dmFyKC0tb2spO2ZvbnQtd2VpZ2h0OjcwMH0KLmRvdHtkaXNwbGF5OmlubGluZS1ibG9jazt3aWR0aDoxMXB4O2hlaWdodDoxMXB4O2JvcmRlci1yYWRpdXM6M3B4O3ZlcnRpY2FsLWFsaWduOi0xcHg7bWFyZ2luLXJpZ2h0OjZweH0KLmxlZ2VuZHtkaXNwbGF5OmZsZXg7Z2FwOjE0cHg7ZmxleC13cmFwOndyYXA7Zm9udC1zaXplOjEzcHg7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOnZhcigtLWluayl9Ci5jaGFydHt3aWR0aDoxMDAlO2hlaWdodDphdXRvO2Rpc3BsYXk6YmxvY2t9Ci5jaGFydCAuY2gtYXh7Zm9udC1zaXplOjExcHg7ZmlsbDp2YXIoLS1tdXRlZCl9Ci5jaGFydCAuY2gtdmFse2ZvbnQtc2l6ZToxMnB4O2ZvbnQtd2VpZ2h0OjcwMDtmaWxsOnZhcigtLWluayl9Ci5jaGFydCAuY2gtZGF5e2ZvbnQtc2l6ZToxMnB4O2ZpbGw6dmFyKC0tbXV0ZWQpfQouY2hhcnQgLmNoLXRvZGF5e2ZpbGw6dmFyKC0tYWNjZW50LXN0cm9uZyk7Zm9udC13ZWlnaHQ6ODAwfQouY2hhcnQgLmNoLWhpdHtjdXJzb3I6cG9pbnRlcn0KLmNoYXJ0IC5jaC1oaXQ6aG92ZXJ7ZmlsbDpyZ2JhKDIyLDE0NywyMTEsLjA3KX0KLnNhbGVzLWdyaWR7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoMywxZnIpO2dhcDoxNHB4O21hcmdpbi10b3A6MTRweH0KLnNhbGVzLW1rIC5wYW5lbC1oZWFkIGgye2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXJ9Ci5jaC10aXB7cG9zaXRpb246Zml4ZWQ7ei1pbmRleDo1MDtiYWNrZ3JvdW5kOnZhcigtLWluayk7Y29sb3I6I2ZmZjtib3JkZXItcmFkaXVzOjEwcHg7cGFkZGluZzo4cHggMTFweDtmb250LXNpemU6MTIuNXB4O2xpbmUtaGVpZ2h0OjEuNTtwb2ludGVyLWV2ZW50czpub25lO2JveC1zaGFkb3c6dmFyKC0tc2hhZG93KTttYXgtd2lkdGg6MjgwcHh9Ci5jaC10aXAgYntkaXNwbGF5OmJsb2NrO21hcmdpbi1ib3R0b206MnB4O3RleHQtdHJhbnNmb3JtOmNhcGl0YWxpemV9Ci5jaC10YWJsZXttYXJnaW4tdG9wOjEwcHh9Ci5jaC10YWJsZSBzdW1tYXJ5e2N1cnNvcjpwb2ludGVyO2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpO2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTNweH0KQG1lZGlhIChtYXgtd2lkdGg6MTAwMHB4KXsuc2FsZXMta3Bpc3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDIsMWZyKX0ua3BpLWhlcm97Z3JpZC1jb2x1bW46MS8tMX0uc2FsZXMtZ3JpZHtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyfX0KLmNoYXJ0e3dpZHRoOjEwMCU7bWF4LXdpZHRoOjEwMCU7aGVpZ2h0OmF1dG99Ci5jaC1zbG90e3dpZHRoOjEwMCV9CgoucHAtd2Vla3tkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6OHB4O2ZvbnQtc2l6ZToxNHB4fQoucHAtdGFibGUgdGgubnVtLC5wcC10YWJsZSB0ZC5udW17dGV4dC1hbGlnbjpyaWdodDt3aGl0ZS1zcGFjZTpub3dyYXB9Ci5wcC10YWJsZSB0aCBzbWFsbHtkaXNwbGF5OmJsb2NrO2ZvbnQtd2VpZ2h0OjYwMDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5wcC10YWJsZSAucHAtbmFtZXtkaXNwbGF5OmJsb2NrO2ZvbnQtd2VpZ2h0OjcwMDtjb2xvcjp2YXIoLS1vayl9Ci5wcC10YWJsZSB0ZCBzbWFsbHtkaXNwbGF5OmJsb2NrfQoucHAtdGFibGUgLnplcm97Y29sb3I6dmFyKC0tbGluZSl9Ci5wcC10YWJsZSAucHAtdG90YWx7Zm9udC13ZWlnaHQ6ODAwO2ZvbnQtc2l6ZToxNXB4O2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQoucHAtdGFibGUgdGZvb3QgdGR7Ym9yZGVyLXRvcDoycHggc29saWQgdmFyKC0tbGluZSk7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlMil9Ci5wcC1ub3Rle2JhY2tncm91bmQ6dmFyKC0td2Fybi1iZyk7Y29sb3I6dmFyKC0td2Fybik7Ym9yZGVyLXJhZGl1czoxMHB4O3BhZGRpbmc6OHB4IDEycHg7Zm9udC1zaXplOjEzcHg7Zm9udC13ZWlnaHQ6NjAwO21hcmdpbjowIDAgMTBweH0KCi5wcC10YWJsZSAucHAtY2Fue2N1cnNvcjpwb2ludGVyfQoucHAtdGFibGUgLnBwLWNhbjpob3ZlciB0ZHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKX0KLnBwLXRhYmxlIC5wcC1hcnJvd3tkaXNwbGF5OmlubGluZS1ibG9jazt3aWR0aDoxNnB4O2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpO2ZvbnQtd2VpZ2h0OjkwMH0KLnBwLXRhYmxlIC5wcC1wdWIgLnBwLW5hbWV7ZGlzcGxheTppbmxpbmV9Ci5wcC10YWJsZSAucHAtc3Vie2Rpc3BsYXk6YmxvY2s7bWFyZ2luLWxlZnQ6MTZweH0KLnBwLXRhYmxlIC5wcC12YXIgdGR7YmFja2dyb3VuZDojRjdGQkZFO2ZvbnQtc2l6ZToxM3B4fQoucHAtdGFibGUgLnBwLXZuYW1le2Rpc3BsYXk6YmxvY2s7cGFkZGluZy1sZWZ0OjM0cHg7Y29sb3I6dmFyKC0tb2spO2ZvbnQtd2VpZ2h0OjYwMH0KLnBwLXRhYmxlIC5wcC12YXIgLnBwLXRvdGFse2ZvbnQtc2l6ZToxM3B4fQoudGItdW5ibG9ja2VkIC50Yi1pY3tiYWNrZ3JvdW5kOnZhcigtLXdhcm4tYmcpO2NvbG9yOnZhcigtLXdhcm4pfQpAbWVkaWEgKG1heC13aWR0aDoxMjgwcHgpey50YWJzYmlnIC50YiBzbWFsbHtkaXNwbGF5Om5vbmV9fQoKLyogUHJvZHVjdG9zIHZlbmRpZG9zIChzaW4gcHJlY2lvcykgKi8KLnV2LWtwaXN7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczoxLjNmciAxZnIgMWZyIDEuNmZyO2dhcDoxMnB4O21hcmdpbi1ib3R0b206MTJweH0KLnV2LW1re2Rpc3BsYXk6ZmxleDtnYXA6MThweDtmbGV4LXdyYXA6d3JhcDtmb250LXNpemU6MTRweDttYXJnaW46NHB4IDJweCAxNHB4O2NvbG9yOnZhcigtLWluayl9Ci51di1tayBzbWFsbHtjb2xvcjp2YXIoLS1tdXRlZCl9Ci51di1jYXJke21hcmdpbi1ib3R0b206MTRweH0KLnV2LWdyaWR7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczoxLjRmciAxZnI7Z2FwOjE0cHh9Ci51di1ncmlkID4gLnV2LWNhcmQ6b25seS1jaGlsZHtncmlkLWNvbHVtbjoxLy0xfQoudXYtaHtmb250LWZhbWlseTp2YXIoLS1kaXNwbGF5KTtmb250LXNpemU6MjBweDttYXJnaW46NnB4IDAgMTBweDtjb2xvcjp2YXIoLS1pbmspfQoudXYtaCBzbWFsbHtmb250LWZhbWlseTp2YXIoLS1ib2R5KTtmb250LXNpemU6MTNweDtjb2xvcjp2YXIoLS1tdXRlZCk7Zm9udC13ZWlnaHQ6NjAwO21hcmdpbi1sZWZ0OjhweH0KLmhie2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6bWlubWF4KDAsMS4zZnIpIG1pbm1heCgwLDFmcikgYXV0bztnYXA6MTJweDthbGlnbi1pdGVtczpjZW50ZXI7cGFkZGluZzo3cHggMDtib3JkZXItYm90dG9tOjFweCBkYXNoZWQgdmFyKC0tbGluZSl9Ci5oYjpsYXN0LWNoaWxke2JvcmRlci1ib3R0b206MH0KLmhiLWx7bWluLXdpZHRoOjB9Ci5oYi1uYW1le2Rpc3BsYXk6YmxvY2s7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOnZhcigtLWluayk7Zm9udC1zaXplOjEzLjVweDt3aGl0ZS1zcGFjZTpub3dyYXA7b3ZlcmZsb3c6aGlkZGVuO3RleHQtb3ZlcmZsb3c6ZWxsaXBzaXN9Ci5oYi1sIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTJweH0KLmhiLXRyYWNre2hlaWdodDoxMnB4O2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZTIpO2JvcmRlci1yYWRpdXM6NnB4O292ZXJmbG93OmhpZGRlbn0KLmhiLXRyYWNrIGl7ZGlzcGxheTpibG9jaztoZWlnaHQ6MTAwJTtib3JkZXItcmFkaXVzOjZweH0KLmhiLXZ7Zm9udC1zaXplOjE1cHg7Y29sb3I6dmFyKC0taW5rKTttaW4td2lkdGg6MzhweDt0ZXh0LWFsaWduOnJpZ2h0fQoucmt7Zm9udC1zdHlsZTpub3JtYWw7ZGlzcGxheTppbmxpbmUtZ3JpZDtwbGFjZS1pdGVtczpjZW50ZXI7d2lkdGg6MjBweDtoZWlnaHQ6MjBweDtib3JkZXItcmFkaXVzOjZweDtiYWNrZ3JvdW5kOnZhcigtLWljZSk7Y29sb3I6dmFyKC0tYWNjZW50LXN0cm9uZyk7Zm9udC1zaXplOjExLjVweDtmb250LXdlaWdodDo4MDA7bWFyZ2luLXJpZ2h0OjZweH0KQG1lZGlhIChtYXgtd2lkdGg6MTAwMHB4KXsudXYta3Bpc3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDIsMWZyKX0udXYtZ3JpZHtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyfX0KCi8qIFJlc3VtZW4gZGUgZW52w61vcyB5IDggc2VjY2lvbmVzICovCi50YWJzYmlne2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoNCwxZnIpfQoudGItd2VlayAudGItaWN7YmFja2dyb3VuZDp2YXIoLS1vay1iZyk7Y29sb3I6dmFyKC0tb2spfQoudGItYmxvY2tlZFByaW50ZWQgLnRiLWlje2JhY2tncm91bmQ6dmFyKC0tbG9jay1iZyk7Y29sb3I6dmFyKC0tbG9jayl9Ci5zaGlwLXN1bXttYXJnaW4tYm90dG9tOjE0cHh9Ci5zcy10aWxlc3tkaXNwbGF5OmdyaWQ7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCg1LDFmcik7Z2FwOjEwcHg7bWFyZ2luLWJvdHRvbToxMnB4fQouc3MtdGlsZXtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1sZWZ0OjVweCBzb2xpZCB2YXIoLS1jKTtib3JkZXItcmFkaXVzOjEycHg7cGFkZGluZzoxMHB4IDEycHg7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKX0KLnNzLXRpbGUgc21hbGx7ZGlzcGxheTpibG9jaztjb2xvcjp2YXIoLS1tdXRlZCk7Zm9udC13ZWlnaHQ6NzAwO2ZvbnQtc2l6ZToxMi41cHh9Ci5zcy10aWxlIGJ7Zm9udC1mYW1pbHk6dmFyKC0tZGlzcGxheSk7Zm9udC1zaXplOjI4cHg7Y29sb3I6dmFyKC0taW5rKTtsaW5lLWhlaWdodDoxLjF9Ci5zcy10b3RhbHstLWM6dmFyKC0tYWNjZW50LXN0cm9uZyk7YmFja2dyb3VuZDpsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCNFM0Y0RkQsI2ZmZil9Ci5zcy10b3RhbCBie2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQouc3MtdGFibGUgdGQubnVtLC5zcy10YWJsZSB0aC5udW17dGV4dC1hbGlnbjpyaWdodH0KLnNzLXRhYmxlIC56ZXJve2NvbG9yOnZhcigtLWxpbmUpfQouc3MtdGFibGUgdGZvb3QgdGR7Ym9yZGVyLXRvcDoycHggc29saWQgdmFyKC0tbGluZSk7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlMil9CkBtZWRpYSAobWF4LXdpZHRoOjgwMHB4KXsuc3MtdGlsZXN7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgyLDFmcil9LnNzLXRvdGFse2dyaWQtY29sdW1uOjEvLTF9LnRhYnNiaWd7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgyLDFmcil9fQouZGlzcGF0Y2guZG9uZXtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKTtjb2xvcjp2YXIoLS1tdXRlZCk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKX0KLnNzLWN1dHtkaXNwbGF5OmJsb2NrO2ZvbnQtc2l6ZToxMi41cHg7Y29sb3I6dmFyKC0taW5rKTttYXJnaW4tdG9wOjJweH0KLnNzLWN1dCBzdHJvbmd7Y29sb3I6dmFyKC0tbG9jayl9Ci5zcy1jdXQgc21hbGx7Y29sb3I6dmFyKC0tbXV0ZWQpfQouc3MtY3V0Lm11dGVke2NvbG9yOnZhcigtLW11dGVkKX0KLnNzLWN1dCBzdHJvbmd7d2hpdGUtc3BhY2U6bm93cmFwfQoKLyogUmVzdW1lbiBkZSBlbnbDrW9zIGNvbXBhY3RvICovCi5zaGlwLXN1bXttYXJnaW46MCAwIDEycHg7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTJweDtwYWRkaW5nOjZweCAxMnB4fQouc3N4e2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7ZmxleC13cmFwOndyYXA7Z2FwOjZweCAxNnB4O2ZvbnQtc2l6ZToxM3B4O2NvbG9yOnZhcigtLWluayl9Ci5zc3gtdHtmb250LXdlaWdodDo4MDB9Ci5zc3gtaXtkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmJhc2VsaW5lO2dhcDo1cHg7d2hpdGUtc3BhY2U6bm93cmFwfQouc3N4LWkgaXt3aWR0aDo5cHg7aGVpZ2h0OjlweDtib3JkZXItcmFkaXVzOjNweDtiYWNrZ3JvdW5kOnZhcigtLWMpO2Rpc3BsYXk6aW5saW5lLWJsb2NrO2FsaWduLXNlbGY6Y2VudGVyfQouc3N4LWkgYntmb250LXNpemU6MTRweH0KLnNzeC1pIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTEuNXB4fQouc3N4LXRvdCBie2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQouc3N4LXN3e2Rpc3BsYXk6aW5saW5lLWZsZXg7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjhweDtvdmVyZmxvdzpoaWRkZW59Ci5zc3gtc3cgYnV0dG9ue2JvcmRlcjowO2JhY2tncm91bmQ6dHJhbnNwYXJlbnQ7cGFkZGluZzozcHggOXB4O2ZvbnQ6aW5oZXJpdDtmb250LXNpemU6MTJweDtmb250LXdlaWdodDo3MDA7Y29sb3I6dmFyKC0tbXV0ZWQpO2N1cnNvcjpwb2ludGVyfQouc3N4LXN3IGJ1dHRvblthcmlhLXByZXNzZWQ9InRydWUiXXtiYWNrZ3JvdW5kOnZhcigtLWFjY2VudCk7Y29sb3I6I2ZmZn0KLnNzeC1kZXQgc3VtbWFyeXtjdXJzb3I6cG9pbnRlcjtmb250LXNpemU6MTJweDtmb250LXdlaWdodDo3MDA7Y29sb3I6dmFyKC0tYWNjZW50LXN0cm9uZyk7bWFyZ2luLXRvcDoycHh9Ci5zc3gtZGV0IC5zcy10YWJsZXtmb250LXNpemU6MTIuNXB4O21hcmdpbi10b3A6NnB4fQouc3N4LWRldCAuc3MtdGFibGUgdGQsLnNzeC1kZXQgLnNzLXRhYmxlIHRoe3BhZGRpbmc6NHB4IDhweH0KLnNzeC1tb3Jle2JvcmRlcjowO2JhY2tncm91bmQ6bm9uZTtmb250OmluaGVyaXQ7Zm9udC1zaXplOjEycHg7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpO2N1cnNvcjpwb2ludGVyO3BhZGRpbmc6MnB4IDRweH0KLnNzeHtnYXA6NHB4IDE0cHh9Ci5zc3gtcnttYXJnaW4tbGVmdDphdXRvO2Rpc3BsYXk6aW5saW5lLWZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo4cHg7d2hpdGUtc3BhY2U6bm93cmFwfQouc3N4e2ZvbnQtc2l6ZToxMi41cHg7Z2FwOjRweCAxMnB4fQouc3N4LWFsbHtwYWRkaW5nLWxlZnQ6MTBweDtib3JkZXItbGVmdDoxcHggc29saWQgdmFyKC0tbGluZSk7Y29sb3I6dmFyKC0tbXV0ZWQpfQouc3N4LWFsbCBie2NvbG9yOnZhcigtLWluayl9Ci5zcy1zdW0gdGR7Ym9yZGVyLXRvcDoycHggc29saWQgdmFyKC0tbGluZSl9Ci8qIGZpbHRybyBkZSB2ZW5kZWRvcmVzIGNvbiBzZWxlY2Npw7NuIG3Dumx0aXBsZSAqLwoubXNlbHtwb3NpdGlvbjpyZWxhdGl2ZX0KLm1zZWwtYnRue2ZvbnQ6aW5oZXJpdDtjb2xvcjp2YXIoLS1pbmspO2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZTIpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czoxMnB4O3BhZGRpbmc6OHB4IDM0cHggOHB4IDEycHg7Y3Vyc29yOnBvaW50ZXI7d2hpdGUtc3BhY2U6bm93cmFwO3Bvc2l0aW9uOnJlbGF0aXZlO21pbi13aWR0aDoyMDBweDt0ZXh0LWFsaWduOmxlZnR9Ci5tc2VsLWJ0bjo6YWZ0ZXJ7Y29udGVudDonJztwb3NpdGlvbjphYnNvbHV0ZTtyaWdodDoxM3B4O3RvcDo1MCU7d2lkdGg6N3B4O2hlaWdodDo3cHg7Ym9yZGVyLXJpZ2h0OjJweCBzb2xpZCBjdXJyZW50Q29sb3I7Ym9yZGVyLWJvdHRvbToycHggc29saWQgY3VycmVudENvbG9yO3RyYW5zZm9ybTp0cmFuc2xhdGVZKC03MCUpIHJvdGF0ZSg0NWRlZyl9Ci5tc2VsLm9uIC5tc2VsLWJ0bntib3JkZXItY29sb3I6dmFyKC0tYWNjZW50KTtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKTtmb250LXdlaWdodDo3MDB9Ci5tc2VsLXBvcHtwb3NpdGlvbjphYnNvbHV0ZTt6LWluZGV4OjMwO3RvcDpjYWxjKDEwMCUgKyA2cHgpO2xlZnQ6MDttaW4td2lkdGg6MjQwcHg7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTJweDtib3gtc2hhZG93OjAgMTBweCAzMHB4IHJnYmEoMCwwLDAsLjE0KTtwYWRkaW5nOjZweH0KLm1zZWwtcG9wIGxhYmVse2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjEwcHg7cGFkZGluZzo4cHggMTBweDtib3JkZXItcmFkaXVzOjhweDtjdXJzb3I6cG9pbnRlcjt3aGl0ZS1zcGFjZTpub3dyYXB9Ci5tc2VsLXBvcCBsYWJlbDpob3ZlcntiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKX0KLm1zZWwtcG9wIGlucHV0e3dpZHRoOjE4cHg7aGVpZ2h0OjE4cHg7YWNjZW50LWNvbG9yOnZhcigtLWFjY2VudCk7bWFyZ2luOjB9Ci5tc2VsLWFsbHtib3JkZXItYm90dG9tOjFweCBzb2xpZCB2YXIoLS1saW5lKTttYXJnaW4tYm90dG9tOjRweDtmb250LXdlaWdodDo3MDB9Ci8qIGZpbHRybyBkZSBCbG9xdWVhZGFzIGltcHJlc2FzICovCi5icGZ7ZGlzcGxheTpmbGV4O2ZsZXgtd3JhcDp3cmFwO2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6OHB4O3BhZGRpbmc6MTBweCAxOHB4O2JvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLWxpbmUpfQouYnBmW2hpZGRlbl17ZGlzcGxheTpub25lfQouYnBmLXR7Zm9udC13ZWlnaHQ6NzAwO2ZvbnQtc2l6ZToxM3B4O2NvbG9yOnZhcigtLW11dGVkKX0KLmNoaXAtZmlsbFthcmlhLXByZXNzZWQ9InRydWUiXXtiYWNrZ3JvdW5kOiMxZjhmNGU7Ym9yZGVyLWNvbG9yOiMxZjhmNGU7Y29sb3I6I2ZmZn0KLndhcm5ib3h7YmFja2dyb3VuZDojZmZmNmUwO2JvcmRlcjoxcHggc29saWQgI2YwZDQ4YTtib3JkZXItcmFkaXVzOjEwcHg7cGFkZGluZzo4cHggMTBweDtjb2xvcjojNmI0ZTAwfQouYnBmLXNlcHt3aWR0aDoxcHg7aGVpZ2h0OjIycHg7YmFja2dyb3VuZDp2YXIoLS1saW5lKTttYXJnaW46MCA2cHh9CgoubGF0ZXRhZ3tkaXNwbGF5OmlubGluZS1ibG9jaztiYWNrZ3JvdW5kOiNmZGUyZTI7Y29sb3I6I2I0MjMxODtmb250LXdlaWdodDo3MDA7Zm9udC1zaXplOjEycHg7Ym9yZGVyLXJhZGl1czo2cHg7cGFkZGluZzoycHggOHB4O21hcmdpbjoycHggMH0KLnRiLWxhdGUgLnRiLWlje2JhY2tncm91bmQ6I2ZkZTJlMjtjb2xvcjojYjQyMzE4fQoKLyogY8OzZGlnb3MgZGUgZGV2b2x1Y2nDs24gTUwgKi8KLnJjb2Rlc3twb3NpdGlvbjpyZWxhdGl2ZTttYXJnaW4tbGVmdDphdXRvO2ZvbnQtc2l6ZToxM3B4fQoucmMtcGlsbHtkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4O2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXItcmFkaXVzOjk5OXB4O3BhZGRpbmc6M3B4IDEwcHg7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtc2l6ZToxMi41cHh9Ci5yYy1waWxsIHN2Z3t3aWR0aDoxNHB4O2hlaWdodDoxNHB4O2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQoucmMtcGlsbCBie2NvbG9yOnZhcigtLWluayl9Ci5yYy1waWxsOmhvdmVye2JvcmRlci1jb2xvcjp2YXIoLS1za3kpfQoucmMtcG9we3Bvc2l0aW9uOmFic29sdXRlO3JpZ2h0OjA7dG9wOmNhbGMoMTAwJSArIDZweCk7ei1pbmRleDozMDttaW4td2lkdGg6MjgwcHg7bWF4LXdpZHRoOm1pbigzNjBweCxjYWxjKDEwMHZ3IC0gMzJweCkpO2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjEycHg7Ym94LXNoYWRvdzp2YXIoLS1zaGFkb3cpO3BhZGRpbmc6OHB4IDEwcHg7ZGlzcGxheTpncmlkO2dhcDoycHh9Ci5yYy1wb3AtaHtmb250LXNpemU6MTEuNXB4O2NvbG9yOnZhcigtLW11dGVkKTtwYWRkaW5nOjJweCAycHggNnB4O2JvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLWxpbmUpO21hcmdpbi1ib3R0b206NHB4fQoucmMtcm93e2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjhweDtwYWRkaW5nOjNweCAycHh9Ci5yYy1yb3cgLnJjLW57ZmxleDoxO2ZvbnQtc2l6ZToxMi41cHh9Ci5yYy1ue2NvbG9yOnZhcigtLW11dGVkKTtmb250LXdlaWdodDo2MDB9Ci5yYy1jb2Rle2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZToxMi41cHg7bGV0dGVyLXNwYWNpbmc6LjA1ZW07Y29sb3I6dmFyKC0taW5rKTtiYWNrZ3JvdW5kOiNGRkY3QjM7Ym9yZGVyLXJhZGl1czo1cHg7cGFkZGluZzowIDVweH0KLnJjLW1pc3N7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtc3R5bGU6aXRhbGljO2ZvbnQtc2l6ZToxMnB4fQoucmMtZW1wdHl7Ym9yZGVyLXN0eWxlOmRhc2hlZH0KLnJjLWVkaXR7Ym9yZGVyOjA7YmFja2dyb3VuZDpub25lO2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpO2ZvbnQtc2l6ZToxMnB4O2ZvbnQtd2VpZ2h0OjcwMDtwYWRkaW5nOjJweCA2cHg7Ym9yZGVyLXJhZGl1czo5OTlweH0KLnJjLWVkaXQ6aG92ZXJ7YmFja2dyb3VuZDp2YXIoLS1pY2UpfQoucmMtZm9ybXtkaXNwbGF5OmlubGluZS1mbGV4O2dhcDo0cHg7YWxpZ24taXRlbXM6Y2VudGVyfQoucmMtZm9ybSBpbnB1dHt3aWR0aDoxMTBweDtwYWRkaW5nOjNweCA4cHg7Zm9udC1mYW1pbHk6dmFyKC0tbW9ubyk7Zm9udC1zaXplOjEzcHh9Ci5yYy1wYWdle21hcmdpbi10b3A6MjZweH0KLnJjLWhlcm97dGV4dC1hbGlnbjpjZW50ZXI7bWFyZ2luLWJvdHRvbToyMnB4fQoucmMtaGVybyBoMntmb250LXNpemU6MzBweDtjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KLnJjLWhlcm8gcHttYXJnaW46NnB4IDAgMnB4O2ZvbnQtc2l6ZToxNnB4O3RleHQtdHJhbnNmb3JtOm5vbmV9Ci5yYy1oZXJvIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKX0KLnJjLWdyaWR7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoYXV0by1maWxsLG1pbm1heCgyMzBweCwxZnIpKTtnYXA6MTZweH0KLnJjLWNhcmR7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjZweDt0ZXh0LWFsaWduOmNlbnRlcjtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czoxOHB4O3BhZGRpbmc6MjJweCAxNnB4O2JveC1zaGFkb3c6dmFyKC0tc2hhZG93KTtwb3NpdGlvbjpyZWxhdGl2ZTtvdmVyZmxvdzpoaWRkZW59Ci5yYy1jYXJkOjpiZWZvcmV7Y29udGVudDoiIjtwb3NpdGlvbjphYnNvbHV0ZTtpbnNldDowIDAgYXV0byAwO2hlaWdodDo1cHg7YmFja2dyb3VuZDp2YXIoLS1tbCl9Ci5yYy1jYXJkLnJjLWVtcHR5e2JveC1zaGFkb3c6bm9uZTtib3JkZXItc3R5bGU6ZGFzaGVkfQoucmMtc2VsbGVye2ZvbnQtZmFtaWx5OnZhcigtLWRpc3BsYXkpO2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MTlweH0KLnJjLWFjY3tjb2xvcjp2YXIoLS1tdXRlZCk7bWFyZ2luLXRvcDotNnB4fQoucmMtYmlne2ZvbnQtZmFtaWx5OnZhcigtLW1vbm8pO2ZvbnQtc2l6ZTozNHB4O2xldHRlci1zcGFjaW5nOi4xMmVtO2JhY2tncm91bmQ6I0ZGRjdCMztjb2xvcjp2YXIoLS1tbC1pbmspO2JvcmRlci1yYWRpdXM6MTJweDtwYWRkaW5nOjZweCAxNnB4O21hcmdpbjo2cHggMH0KLnJjLXdhaXR7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtc3R5bGU6aXRhbGljO21hcmdpbjoxNHB4IDB9CkBtZWRpYSAobWF4LXdpZHRoOjYwMHB4KXsucmMtaGVybyBoMntmb250LXNpemU6MjRweH0ucmMtYmlne2ZvbnQtc2l6ZToyOHB4fX0KCi5yYy1ob3didG57anVzdGlmeS1zZWxmOnN0YXJ0O2ZvbnQtd2VpZ2h0OjYwMDtjb2xvcjp2YXIoLS1tdXRlZCk7bWFyZ2luLXRvcDo0cHh9Ci5yYy1ob3dib3h7ZmxleC1iYXNpczoxMDAlfQoucmMtaGVscHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTJweDtwYWRkaW5nOjEwcHggMTRweDtmb250LXNpemU6MTMuNXB4fQoucmMtaGVscCBvbHttYXJnaW46NnB4IDAgMDtwYWRkaW5nLWxlZnQ6MjBweDtkaXNwbGF5OmdyaWQ7Z2FwOjRweH0KLnJjLWJte2Rpc3BsYXk6aW5saW5lLWJsb2NrO2JhY2tncm91bmQ6dmFyKC0tbWwpO2NvbG9yOnZhcigtLW1sLWluayk7Zm9udC13ZWlnaHQ6ODAwO3RleHQtZGVjb3JhdGlvbjpub25lO2JvcmRlci1yYWRpdXM6OHB4O3BhZGRpbmc6MnB4IDEwcHg7Y3Vyc29yOmdyYWJ9Ci5yYy1tb2RhbHtwb3NpdGlvbjpmaXhlZDtpbnNldDowO2JhY2tncm91bmQ6cmdiYSgxMiw0Myw2NCwuMzUpO2Rpc3BsYXk6Z3JpZDtwbGFjZS1pdGVtczpjZW50ZXI7ei1pbmRleDo1MDtwYWRkaW5nOjE2cHh9Ci5yYy1tb2RhbC1ib3h7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXItcmFkaXVzOjE4cHg7cGFkZGluZzoyMHB4O21heC13aWR0aDo0MjBweDt3aWR0aDoxMDAlO2Rpc3BsYXk6Z3JpZDtnYXA6MTRweDtib3gtc2hhZG93OnZhcigtLXNoYWRvdyl9Ci5yYy1waWNre2Rpc3BsYXk6Z3JpZDtnYXA6OHB4fQoucmMtcGljayBsYWJlbHtkaXNwbGF5OmZsZXg7Z2FwOjhweDthbGlnbi1pdGVtczpjZW50ZXI7cGFkZGluZzo4cHggMTBweDtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTBweDtjdXJzb3I6cG9pbnRlcn0KLnJjLXBpY2sgc21hbGx7Y29sb3I6dmFyKC0tbXV0ZWQpfQoKLnVuZG8tYnRue2Rpc3BsYXk6aW5saW5lLWZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo4cHg7YmFja2dyb3VuZDp2YXIoLS1pbmspO2NvbG9yOiNmZmY7Ym9yZGVyOjA7Ym9yZGVyLXJhZGl1czoxMnB4O3BhZGRpbmc6NnB4IDEycHggNnB4IDEwcHg7Zm9udC1zaXplOjEzcHg7bGluZS1oZWlnaHQ6MS4xNTt0ZXh0LWFsaWduOmxlZnQ7bWF4LXdpZHRoOjIzMHB4fQoudW5kby1idG4gc3BhbntkaXNwbGF5OmdyaWQ7bWluLXdpZHRoOjB9Ci51bmRvLWJ0biBzbWFsbHtmb250LXdlaWdodDo1MDA7b3BhY2l0eTouODt3aGl0ZS1zcGFjZTpub3dyYXA7b3ZlcmZsb3c6aGlkZGVuO3RleHQtb3ZlcmZsb3c6ZWxsaXBzaXM7Zm9udC1zaXplOjExLjVweH0KLnVuZG8tYnRuOmhvdmVyOm5vdCg6ZGlzYWJsZWQpe2JhY2tncm91bmQ6dmFyKC0tYWNjZW50LXN0cm9uZyl9Ci51bmRvLWJ0bjpkaXNhYmxlZHtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UyKTtjb2xvcjp2YXIoLS1tdXRlZCk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtjdXJzb3I6ZGVmYXVsdH0KLnRiLXByaW50ZWQ3IC50Yi1pY3tiYWNrZ3JvdW5kOnZhcigtLW9rLWJnKTtjb2xvcjp2YXIoLS1vayl9CgoudGItdHJhbnNpdCAudGItaWN7YmFja2dyb3VuZDp2YXIoLS1pY2UpO2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQoKLnNzLXRvZGF5IHRke2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZTIpfQoKLnNzLTIgdGguc3MtZ3Jwe3RleHQtYWxpZ246Y2VudGVyO2JvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLWxpbmUpfQouc3MtMiAuc3MtYmx7Y29sb3I6dmFyKC0tbG9jayl9Ci5zcy0yIHRoLnNzLWJse2NvbG9yOnZhcigtLWxvY2spfQouc3MtZGF5cm93IHRke2JvcmRlci10b3A6MXB4IHNvbGlkIHZhcigtLWxpbmUpfQouc3Mtc2Vscm93IHRke2ZvbnQtc2l6ZToxMnB4O2NvbG9yOnZhcigtLW11dGVkKX0KLnNzLXNlbHJvdyAuc3Mtc3Vie3BhZGRpbmctbGVmdDoxNHB4fQouc3Mtbm90ZXtmb250LXNpemU6MTEuNXB4O3BhZGRpbmc6NnB4IDJweCAwfQoKLnBwLW1vcmV7ZGlzcGxheTpmbGV4O2p1c3RpZnktY29udGVudDpjZW50ZXI7bWFyZ2luLXRvcDoxMHB4fQoKLyogTUtQIEZsYXNoIOKAlCBjb2xvcmVzIGRlIE1lcmNhZG8gTGlicmUgKi8KLm1rcC1oZXJve2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjEycHg7ZmxleC13cmFwOndyYXA7bWFyZ2luLXRvcDoyMnB4O2JhY2tncm91bmQ6I0ZGRTYwMDtjb2xvcjojMkQzMjc3O2JvcmRlci1yYWRpdXM6MThweDtwYWRkaW5nOjE2cHggMjBweH0KLm1rcC1oZXJvIGgye2ZvbnQtc2l6ZToyNnB4O2NvbG9yOiMyRDMyNzd9Ci5ta3AtaGVybyBwe21hcmdpbjoycHggMCAwO2ZvbnQtc2l6ZToxNHB4fQoubWtwLWhlcm8gc2VsZWN0e2JhY2tncm91bmQ6I2ZmZjtib3JkZXItY29sb3I6I2UwY2MwMH0KLm1rcC1yZWZyZXNoe2JhY2tncm91bmQ6IzJEMzI3Nztjb2xvcjojZmZmO2JvcmRlcjowfQoubWtwLXRpbGVze2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDUsbWlubWF4KDAsMWZyKSk7Z2FwOjEwcHg7bWFyZ2luOjE0cHggMH0KLm1rcC10aWxle2Rpc3BsYXk6Z3JpZDtqdXN0aWZ5LWl0ZW1zOnN0YXJ0O2dhcDowO3RleHQtYWxpZ246bGVmdDtiYWNrZ3JvdW5kOnZhcigtLXN1cmZhY2UpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czoxNHB4O3BhZGRpbmc6MTJweCAxNHB4O2N1cnNvcjpwb2ludGVyfQoubWtwLXRpbGUgYntmb250LWZhbWlseTp2YXIoLS1kaXNwbGF5KTtmb250LXNpemU6MzBweDtsaW5lLWhlaWdodDoxO2NvbG9yOiMyRDMyNzd9Ci5ta3AtdGlsZSBzcGFue2ZvbnQtd2VpZ2h0OjcwMH0KLm1rcC10aWxlIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTJweH0KLm1rcC10aWxlLm9ue2JvcmRlcjoycHggc29saWQgIzM0ODNGQTtiYWNrZ3JvdW5kOiNGMEY2RkZ9Ci5ta3AtbWtkb3RzIGl7ZGlzcGxheTppbmxpbmUtYmxvY2s7d2lkdGg6OXB4O2hlaWdodDo5cHg7Ym9yZGVyLXJhZGl1czo1MCU7bWFyZ2luOjAgMnB4IDAgNnB4O3ZlcnRpY2FsLWFsaWduOi0xcHh9Ci5ta3AtbWtkb3RzIGkubWx7YmFja2dyb3VuZDojRkZFNjAwO2JvcmRlcjoxcHggc29saWQgI0M5QjQwMH0ubWtwLW1rZG90cyBpLmZhe2JhY2tncm91bmQ6I0FBRDUwMH0ubWtwLW1rZG90cyBpLnBhe2JhY2tncm91bmQ6IzAwNzhDOH0KLm1rcC1ib2R5e2Rpc3BsYXk6Z3JpZDtnYXA6MTBweH0KLm1rcC1jYXJke2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItbGVmdDo1cHggc29saWQgIzM0ODNGQTtib3JkZXItcmFkaXVzOjE0cHg7cGFkZGluZzoxMnB4IDE0cHg7ZGlzcGxheTpncmlkO2dhcDo4cHh9Ci5ta3AtY2FyZC5ta3AtbWVke2JvcmRlci1sZWZ0LWNvbG9yOiNFODY2MUF9Ci5ta3AtY2FyZC5ta3AtZG9uZXtvcGFjaXR5Oi41fQoubWtwLWNhcmQtaHtkaXNwbGF5OmZsZXg7Z2FwOjEwcHg7YWxpZ24taXRlbXM6ZmxleC1zdGFydH0KLm1rcC1jYXJkLWggaW1ne3dpZHRoOjQ4cHg7aGVpZ2h0OjQ4cHg7b2JqZWN0LWZpdDpjb3Zlcjtib3JkZXItcmFkaXVzOjhweDtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpfQoubWtwLWNhcmQtaCBkaXZ7ZGlzcGxheTpncmlkO2dhcDoxcHg7bWluLXdpZHRoOjB9Ci5ta3AtY2FyZC1oIGF7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOiMyRDMyNzc7dGV4dC1kZWNvcmF0aW9uOm5vbmV9Ci5ta3AtY2FyZC1oIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTJweH0KLm1rcC1hY2N7ZGlzcGxheTppbmxpbmUtYmxvY2s7YmFja2dyb3VuZDojRkZFNjAwO2NvbG9yOiMyRDMyNzc7Zm9udC13ZWlnaHQ6NzAwO2JvcmRlci1yYWRpdXM6NnB4O3BhZGRpbmc6MCA2cHg7bWFyZ2luLXJpZ2h0OjZweH0KLm1rcC1kdWV7Y29sb3I6I0I0MjMxOCFpbXBvcnRhbnQ7Zm9udC13ZWlnaHQ6NzAwfQoubWtwLXF7bWFyZ2luOjA7Zm9udC1zaXplOjE1LjVweDtiYWNrZ3JvdW5kOiNGNUY1RjU7Ym9yZGVyLXJhZGl1czoxMHB4O3BhZGRpbmc6OHB4IDEycHh9Ci5ta3AtdGhyZWFke2Rpc3BsYXk6Z3JpZDtnYXA6NnB4O21heC1oZWlnaHQ6MjYwcHg7b3ZlcmZsb3c6YXV0bztwYWRkaW5nOjJweH0KLm1rcC1idWJ7bWF4LXdpZHRoOjgwJTtib3JkZXItcmFkaXVzOjEycHg7cGFkZGluZzo2cHggMTBweDtkaXNwbGF5OmdyaWQ7YmFja2dyb3VuZDojRjBGMEYwO2p1c3RpZnktc2VsZjpzdGFydH0KLm1rcC1idWIuc2VsbGVye2JhY2tncm91bmQ6I0UzRUVGRjtqdXN0aWZ5LXNlbGY6ZW5kfQoubWtwLWJ1Yi5tZWRpYXRvcntiYWNrZ3JvdW5kOiNGRkY0RDZ9Ci5ta3AtYnViIHNtYWxse2ZvbnQtc2l6ZToxMXB4O2NvbG9yOnZhcigtLW11dGVkKX0KLm1rcC1yZXBseXtkaXNwbGF5OmdyaWQ7Z2FwOjZweH0KLm1rcC1yZXBseSB0ZXh0YXJlYXt3aWR0aDoxMDAlO3Jlc2l6ZTp2ZXJ0aWNhbDtib3JkZXItcmFkaXVzOjEwcHh9Ci5ta3AtcmVwbHktYmFye2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7anVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW59Ci5ta3AtcmVwbHktYmFyIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTEuNXB4fQoubWtwLXNlbmR7YmFja2dyb3VuZDojMzQ4M0ZBO2NvbG9yOiNmZmY7Ym9yZGVyOjB9Ci5ta3Atc2VuZDpob3ZlcntiYWNrZ3JvdW5kOiMyOTY4Qzh9Ci5ta3AtZW1wdHl7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IGRhc2hlZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjE0cHg7cGFkZGluZzoyMnB4O3RleHQtYWxpZ246Y2VudGVyO2NvbG9yOnZhcigtLW11dGVkKX0KLm1rcC1lbXB0eS5zbXtwYWRkaW5nOjEwcHg7Zm9udC1zaXplOjEzcHh9Ci5ta3AtcGVybXtiYWNrZ3JvdW5kOiNGRkY4RDY7Ym9yZGVyOjFweCBzb2xpZCAjRThEMjAwO2NvbG9yOiMyRDMyNzc7Ym9yZGVyLXJhZGl1czoxMnB4O3BhZGRpbmc6MTJweCAxNHB4O2ZvbnQtc2l6ZToxNHB4fQoubWtwLXJldHN7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoMyxtaW5tYXgoMCwxZnIpKTtnYXA6MTJweH0KLm1rcC1yZXR7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTRweDtvdmVyZmxvdzpoaWRkZW59Ci5ta3AtcmV0IGgze2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpiYXNlbGluZTtnYXA6NnB4O3BhZGRpbmc6MTBweCAxNHB4O21hcmdpbjowO2ZvbnQtc2l6ZToxNnB4fQoubWtwLXJldCBoMyBpe2Rpc3BsYXk6aW5saW5lLWJsb2NrO3dpZHRoOjEycHg7aGVpZ2h0OjEycHg7Ym9yZGVyLXJhZGl1czo1MCV9Ci5ta3AtcmV0IGgzIGJ7Zm9udC1zaXplOjIycHh9Ci5ta3AtcmV0LW1sIGgze2JhY2tncm91bmQ6I0ZGRTYwMDtjb2xvcjojMkQzMjc3fS5ta3AtcmV0LW1sIGgzIGl7YmFja2dyb3VuZDojMkQzMjc3fQoubWtwLXJldC1mYSBoM3tiYWNrZ3JvdW5kOiNBQUQ1MDA7Y29sb3I6IzJGM0EwMH0ubWtwLXJldC1mYSBoMyBpe2JhY2tncm91bmQ6IzJGM0EwMH0KLm1rcC1yZXQtcGEgaDN7YmFja2dyb3VuZDojMDA3OEM4O2NvbG9yOiNmZmZ9Lm1rcC1yZXQtcGEgaDMgaXtiYWNrZ3JvdW5kOiNmZmZ9Ci5ta3AtcmV0ID4gZGl2LC5ta3AtcmV0IC5ta3AtcGVybXttYXJnaW46MTBweH0KLm1rcC1ycm93e2Rpc3BsYXk6ZmxleDtqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbjtnYXA6MTBweDtwYWRkaW5nOjhweCAxNHB4O2JvcmRlci10b3A6MXB4IHNvbGlkIHZhcigtLWxpbmUpO21hcmdpbjowIWltcG9ydGFudH0KLm1rcC1ycm93IGRpdntkaXNwbGF5OmdyaWQ7Z2FwOjFweH0KLm1rcC1ycm93IHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTJweH0KLm1rcC1wcmljZXtmb250LWZhbWlseTp2YXIoLS1kaXNwbGF5KTtmb250LXNpemU6MTdweDt3aGl0ZS1zcGFjZTpub3dyYXB9Ci5ta3AtdG9kYXl7ZGlzcGxheTppbmxpbmUtYmxvY2s7bWFyZ2luLWxlZnQ6NnB4O2JhY2tncm91bmQ6IzM0ODNGQTtjb2xvcjojZmZmO2JvcmRlci1yYWRpdXM6NnB4O3BhZGRpbmc6MCA2cHg7Zm9udC1zaXplOjExLjVweDtmb250LXdlaWdodDo3MDB9CkBtZWRpYSAobWF4LXdpZHRoOjkwMHB4KXsubWtwLXRpbGVze2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoMixtaW5tYXgoMCwxZnIpKX0ubWtwLXJldHN7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOjFmcn19CgoubWtwLXNlbnR7Y29sb3I6IzAwQTY1MDtmb250LXdlaWdodDo3MDA7Zm9udC1zaXplOjE0cHh9CgovKiAtLS0tLS0tLS0tIFNvbCAicHJvY2VzYW5kbyIgYWwgaW1wcmltaXIgLS0tLS0tLS0tLSAqLwojc3VuTG9hZGVye3Bvc2l0aW9uOmZpeGVkO2luc2V0OjA7ei1pbmRleDo5OTk5O2Rpc3BsYXk6Z3JpZDtwbGFjZS1pdGVtczpjZW50ZXI7cGFkZGluZzoxNnB4O2JhY2tncm91bmQ6cmFkaWFsLWdyYWRpZW50KGNpcmNsZSBhdCA1MCUgNDIlLHJnYmEoMjU1LDIzNiwxNzAsLjU1KSxyZ2JhKDI1NSwyNDgsMjMwLC44MikgNDUlLHJnYmEoMjAsMzAsNTAsLjM1KSk7YmFja2Ryb3AtZmlsdGVyOmJsdXIoNXB4KTstd2Via2l0LWJhY2tkcm9wLWZpbHRlcjpibHVyKDVweCk7b3BhY2l0eTowO3RyYW5zaXRpb246b3BhY2l0eSAuM3MgZWFzZTtjdXJzb3I6cHJvZ3Jlc3N9CiNzdW5Mb2FkZXIub257b3BhY2l0eToxfQouc3VuLWNhcmR7dGV4dC1hbGlnbjpjZW50ZXI7bWF4LXdpZHRoOjQ2MHB4O3BhZGRpbmc6MjhweCAyOHB4IDI2cHg7Ym9yZGVyLXJhZGl1czoyOHB4O2JhY2tncm91bmQ6cmdiYSgyNTUsMjU1LDI1NSwuODgpO2JveC1zaGFkb3c6MCAyMHB4IDYwcHggcmdiYSgyNTUsMTU5LDI4LC4yOCksMCAycHggOHB4IHJnYmEoMCwwLDAsLjA2KTt0cmFuc2Zvcm06dHJhbnNsYXRlWSgxNHB4KSBzY2FsZSguOTYpO3RyYW5zaXRpb246dHJhbnNmb3JtIC40NXMgY3ViaWMtYmV6aWVyKC4yLDEuNCwuNCwxKX0KI3N1bkxvYWRlci5vbiAuc3VuLWNhcmR7dHJhbnNmb3JtOm5vbmV9Ci5zdW57d2lkdGg6MTUwcHg7aGVpZ2h0OjE1MHB4O2Rpc3BsYXk6YmxvY2s7bWFyZ2luOjAgYXV0byA2cHg7YW5pbWF0aW9uOnN1bkJvYiAyLjRzIGVhc2UtaW4tb3V0IGluZmluaXRlfQouc3VuLXJheXN7dHJhbnNmb3JtLW9yaWdpbjoxMDBweCAxMDBweDthbmltYXRpb246c3VuU3BpbiA3cyBsaW5lYXIgaW5maW5pdGV9Ci5zdW4tcmF5cyByZWN0e2FuaW1hdGlvbjpzdW5SYXkgMS42cyBlYXNlLWluLW91dCBpbmZpbml0ZX0KLnN1bi1yYXlzIHJlY3Q6bnRoLWNoaWxkKG9kZCl7YW5pbWF0aW9uLWRlbGF5Oi44c30KLnN1bi1nbG93e3RyYW5zZm9ybS1vcmlnaW46MTAwcHggMTAwcHg7YW5pbWF0aW9uOnN1blB1bHNlIDEuOHMgZWFzZS1pbi1vdXQgaW5maW5pdGV9Ci5zdW4tZmFjZXt0cmFuc2Zvcm0tb3JpZ2luOjEwMHB4IDEwMHB4O2FuaW1hdGlvbjpzdW5CbGluayA0cyBpbmZpbml0ZX0KLnN1bi1sMXtmb250LWZhbWlseTonUGFjaWZpY28nLGN1cnNpdmU7Zm9udC1zaXplOjI2cHg7bGluZS1oZWlnaHQ6MS4zO21hcmdpbjo2cHggMCA0cHg7YmFja2dyb3VuZDpsaW5lYXItZ3JhZGllbnQoOTBkZWcsI0ZGN0EwMCwjRkZCNjI3LCNGRjVFN0UsI0ZGN0EwMCk7YmFja2dyb3VuZC1zaXplOjMwMCUgMTAwJTstd2Via2l0LWJhY2tncm91bmQtY2xpcDp0ZXh0O2JhY2tncm91bmQtY2xpcDp0ZXh0O2NvbG9yOnRyYW5zcGFyZW50O2FuaW1hdGlvbjpzdW5TaGluZSA0cyBsaW5lYXIgaW5maW5pdGUsc3VuSW4gLjZzIC4xcyBib3RofQouc3VuLWwye2ZvbnQtZmFtaWx5OidCYWxvbyAyJyx2YXIoLS1kaXNwbGF5KSxzYW5zLXNlcmlmO2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTlweDtjb2xvcjojNkI0MjAwO21hcmdpbjowO2FuaW1hdGlvbjpzdW5JbiAuNnMgLjM1cyBib3RofQouc3VuLWwze2ZvbnQtZmFtaWx5OidCYWxvbyAyJyx2YXIoLS1kaXNwbGF5KSxzYW5zLXNlcmlmO2ZvbnQtd2VpZ2h0OjYwMDtmb250LXNpemU6MTZweDtjb2xvcjojQzA3MDAwO21hcmdpbjo0cHggMCAwO2FuaW1hdGlvbjpzdW5JbiAuNnMgLjZzIGJvdGh9Ci5zdW4tZG90cyBpe2ZvbnQtc3R5bGU6bm9ybWFsO2Rpc3BsYXk6aW5saW5lLWJsb2NrO2FuaW1hdGlvbjpzdW5Eb3QgMS4ycyBpbmZpbml0ZX0KLnN1bi1kb3RzIGk6bnRoLWNoaWxkKDIpe2FuaW1hdGlvbi1kZWxheTouMnN9LnN1bi1kb3RzIGk6bnRoLWNoaWxkKDMpe2FuaW1hdGlvbi1kZWxheTouNHN9CiNzdW5Mb2FkZXIuZG9uZSAuc3VuLXJheXN7YW5pbWF0aW9uLWR1cmF0aW9uOjEuMnN9CiNzdW5Mb2FkZXIuZG9uZSAuc3VuLWwye2NvbG9yOiMxRjhBNEN9CkBrZXlmcmFtZXMgc3VuU3Bpbnt0b3t0cmFuc2Zvcm06cm90YXRlKDM2MGRlZyl9fQpAa2V5ZnJhbWVzIHN1blJheXswJSwxMDAle29wYWNpdHk6MX01MCV7b3BhY2l0eTouNDV9fQpAa2V5ZnJhbWVzIHN1blB1bHNlezAlLDEwMCV7dHJhbnNmb3JtOnNjYWxlKDEpO29wYWNpdHk6LjM1fTUwJXt0cmFuc2Zvcm06c2NhbGUoMS4xOCk7b3BhY2l0eTouMTV9fQpAa2V5ZnJhbWVzIHN1bkJvYnswJSwxMDAle3RyYW5zZm9ybTp0cmFuc2xhdGVZKDApfTUwJXt0cmFuc2Zvcm06dHJhbnNsYXRlWSgtOHB4KX19CkBrZXlmcmFtZXMgc3VuQmxpbmt7MCUsOTIlLDEwMCV7dHJhbnNmb3JtOnNjYWxlWSgxKX05NSV7dHJhbnNmb3JtOnNjYWxlWSguMTUpfX0KQGtleWZyYW1lcyBzdW5TaGluZXt0b3tiYWNrZ3JvdW5kLXBvc2l0aW9uOjMwMCUgMH19CkBrZXlmcmFtZXMgc3VuSW57ZnJvbXtvcGFjaXR5OjA7dHJhbnNmb3JtOnRyYW5zbGF0ZVkoOHB4KX10b3tvcGFjaXR5OjE7dHJhbnNmb3JtOm5vbmV9fQpAa2V5ZnJhbWVzIHN1bkRvdHswJSwxMDAle29wYWNpdHk6LjI7dHJhbnNmb3JtOnRyYW5zbGF0ZVkoMCl9NDAle29wYWNpdHk6MTt0cmFuc2Zvcm06dHJhbnNsYXRlWSgtM3B4KX19CkBtZWRpYSAocHJlZmVycy1yZWR1Y2VkLW1vdGlvbjpyZWR1Y2UpeyNzdW5Mb2FkZXIgKnthbmltYXRpb24tZHVyYXRpb246MHMhaW1wb3J0YW50O2FuaW1hdGlvbi1pdGVyYXRpb24tY291bnQ6MSFpbXBvcnRhbnR9fQpAbWVkaWEgKG1heC13aWR0aDo0ODBweCl7LnN1bnt3aWR0aDoxMjBweDtoZWlnaHQ6MTIwcHh9LnN1bi1sMXtmb250LXNpemU6MjJweH19Ci5ub3RlLnByZXZwcmludHtjb2xvcjojQjQ1MzA5O2JhY2tncm91bmQ6I0ZGRjdFNjtib3JkZXItcmFkaXVzOjZweDtwYWRkaW5nOjJweCA2cHg7ZGlzcGxheTppbmxpbmUtYmxvY2s7bWFyZ2luLXRvcDo0cHh9Ci5ta3AtcmVhZGJhcntkaXNwbGF5OmZsZXg7anVzdGlmeS1jb250ZW50OmZsZXgtc3RhcnQ7bWFyZ2luLXRvcDo4cHh9Ci8qIC0tLS0gQ2hhdCBkZSBtZW5zYWplcyAoTUtQIEZsYXNoKSAtLS0tICovCi5jaGF0LWNhcmR7cGFkZGluZzowO2JvcmRlcjowO2JvcmRlci1yYWRpdXM6MjBweDtvdmVyZmxvdzpoaWRkZW47Z2FwOjA7Ym94LXNoYWRvdzowIDZweCAyMnB4IHJnYmEoNDUsNTAsMTE5LC4xMCk7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTthbmltYXRpb246Y2hhdEluIC40NXMgY3ViaWMtYmV6aWVyKC4yLC44LC4yNSwxLjE1KSBib3RoO2FuaW1hdGlvbi1kZWxheTp2YXIoLS1kLDBtcyl9Ci5jaGF0LWhlYWR7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6MTJweDtwYWRkaW5nOjEycHggMTZweDtiYWNrZ3JvdW5kOmxpbmVhci1ncmFkaWVudCgxMjBkZWcsI0ZGRjE1OSAwJSwjRkZFNjAwIDYwJSwjRkZENDAwIDEwMCUpO2NvbG9yOiMyRDMyNzd9Ci5jaGF0LWF2e2ZsZXg6bm9uZTt3aWR0aDo0NHB4O2hlaWdodDo0NHB4O2JvcmRlci1yYWRpdXM6NTAlO2Rpc3BsYXk6Z3JpZDtwbGFjZS1pdGVtczpjZW50ZXI7Zm9udC13ZWlnaHQ6ODAwO2ZvbnQtc2l6ZToxNnB4O2JhY2tncm91bmQ6IzJEMzI3Nztjb2xvcjojRkZFNjAwO2JveC1zaGFkb3c6MCAwIDAgM3B4IHJnYmEoMjU1LDI1NSwyNTUsLjcpfQouY2hhdC13aG97ZGlzcGxheTpncmlkO2dhcDoxcHg7bWluLXdpZHRoOjA7ZmxleDoxfQouY2hhdC13aG8gYntmb250LXNpemU6MTdweDtsaW5lLWhlaWdodDoxLjJ9Ci5jaGF0LXdobyBzbWFsbHtmb250LXNpemU6MTIuNXB4O2NvbG9yOiMzZDQyODI7d2hpdGUtc3BhY2U6bm93cmFwO292ZXJmbG93OmhpZGRlbjt0ZXh0LW92ZXJmbG93OmVsbGlwc2lzfQouY2hhdC1wcm9ke2ZvbnQtc3R5bGU6bm9ybWFsfQouY2hhdC11bnJlYWR7YmFja2dyb3VuZDojMzQ4M0ZBO2NvbG9yOiNmZmY7Ym9yZGVyLXJhZGl1czo5OTlweDtwYWRkaW5nOjAgN3B4O2ZvbnQtd2VpZ2h0OjcwMDthbmltYXRpb246Y2hhdFB1bHNlIDEuOHMgZWFzZS1pbi1vdXQgaW5maW5pdGV9Ci5jaGF0LW1re2ZsZXg6bm9uZTtkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4O2JhY2tncm91bmQ6IzJEMzI3Nztjb2xvcjojRkZFNjAwO2JvcmRlci1yYWRpdXM6OTk5cHg7cGFkZGluZzo1cHggMTFweCA1cHggOHB4O2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MTIuNXB4O2xldHRlci1zcGFjaW5nOi4ycHh9Ci5jaGF0LW1rIHN2Z3t3aWR0aDoxNnB4O2hlaWdodDoxNnB4O2ZpbGw6I0ZGRTYwMH0KLmNoYXQtdGhyZWFke21heC1oZWlnaHQ6MzQwcHg7cGFkZGluZzoxNnB4O2dhcDoxMHB4O2JhY2tncm91bmQ6cmFkaWFsLWdyYWRpZW50KGNpcmNsZSBhdCAyMCUgMTAlLHJnYmEoNTIsMTMxLDI1MCwuMDcpLHRyYW5zcGFyZW50IDQwJSkscmFkaWFsLWdyYWRpZW50KGNpcmNsZSBhdCA5MCUgOTAlLHJnYmEoMjU1LDIzMCwwLC4xMiksdHJhbnNwYXJlbnQgNDUlKSwjRjZGOEZDfQouY2hhdC10aHJlYWQgLm1rcC1idWJ7cG9zaXRpb246cmVsYXRpdmU7bWF4LXdpZHRoOjc4JTtwYWRkaW5nOjlweCAxM3B4IDZweDtib3JkZXItcmFkaXVzOjE4cHggMThweCAxOHB4IDZweDtiYWNrZ3JvdW5kOiNmZmY7Ym94LXNoYWRvdzowIDJweCA2cHggcmdiYSgyMCwzMCw2MCwuMDgpO2ZvbnQtc2l6ZToxNXB4O2xpbmUtaGVpZ2h0OjEuMzU7YW5pbWF0aW9uOmJ1YkluIC4zOHMgY3ViaWMtYmV6aWVyKC4yLC45LC4zLDEuMykgYm90aDthbmltYXRpb24tZGVsYXk6Y2FsYyh2YXIoLS1kLDBtcykgKyB2YXIoLS1pLDApICogNzBtcyArIDEyMG1zKTt0cmFuc2Zvcm0tb3JpZ2luOmJvdHRvbSBsZWZ0fQouY2hhdC10aHJlYWQgLm1rcC1idWIuc2VsbGVye2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDEzNWRlZywjMzQ4M0ZBLCMyOTY4QzgpO2NvbG9yOiNmZmY7Ym9yZGVyLXJhZGl1czoxOHB4IDE4cHggNnB4IDE4cHg7dHJhbnNmb3JtLW9yaWdpbjpib3R0b20gcmlnaHR9Ci5jaGF0LXRocmVhZCAubWtwLWJ1Yi5zZWxsZXIgc21hbGx7Y29sb3I6cmdiYSgyNTUsMjU1LDI1NSwuOCl9Ci5jaGF0LXRocmVhZCAubWtwLWJ1YiBzbWFsbHtqdXN0aWZ5LXNlbGY6ZW5kO2ZvbnQtc2l6ZToxMXB4O21hcmdpbi10b3A6MnB4fQouY2hhdC1jb21wb3Nle2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyIGF1dG87Z2FwOjhweDthbGlnbi1pdGVtczplbmQ7cGFkZGluZzoxMnB4IDE0cHg7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtib3JkZXItdG9wOjFweCBzb2xpZCB2YXIoLS1saW5lKX0KLmNoYXQtY29tcG9zZSB0ZXh0YXJlYXtib3JkZXItcmFkaXVzOjIycHg7cGFkZGluZzoxMXB4IDE2cHg7cmVzaXplOm5vbmU7bWluLWhlaWdodDo0NHB4O21heC1oZWlnaHQ6MTYwcHg7Zm9udC1zaXplOjE1cHg7bGluZS1oZWlnaHQ6MS4zNTtiYWNrZ3JvdW5kOiNGMkY0Rjg7Ym9yZGVyOjJweCBzb2xpZCB0cmFuc3BhcmVudDt0cmFuc2l0aW9uOmJvcmRlci1jb2xvciAuMnMsYmFja2dyb3VuZCAuMnMsYm94LXNoYWRvdyAuMnN9Ci5jaGF0LWNvbXBvc2UgdGV4dGFyZWE6Zm9jdXN7b3V0bGluZTowO2JhY2tncm91bmQ6I2ZmZjtib3JkZXItY29sb3I6IzM0ODNGQTtib3gtc2hhZG93OjAgMCAwIDRweCByZ2JhKDUyLDEzMSwyNTAsLjE1KX0KLmNoYXQtc2VuZHtkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4O2hlaWdodDo0NHB4O3BhZGRpbmc6MCAxOHB4O2JvcmRlci1yYWRpdXM6MjJweDtmb250LXdlaWdodDo4MDA7Zm9udC1zaXplOjE0LjVweDt0cmFuc2l0aW9uOnRyYW5zZm9ybSAuMTVzLGJveC1zaGFkb3cgLjJzfQouY2hhdC1zZW5kIHN2Z3t3aWR0aDoxOHB4O2hlaWdodDoxOHB4O2ZpbGw6I2ZmZjt0cmFuc2l0aW9uOnRyYW5zZm9ybSAuMjVzfQouY2hhdC1zZW5kOmhvdmVye3RyYW5zZm9ybTp0cmFuc2xhdGVZKC0xcHgpO2JveC1zaGFkb3c6MCA2cHggMTRweCByZ2JhKDUyLDEzMSwyNTAsLjM1KX0KLmNoYXQtc2VuZDpob3ZlciBzdmcsLmNoYXQtY29tcG9zZS50eXBpbmcgLmNoYXQtc2VuZCBzdmd7dHJhbnNmb3JtOnRyYW5zbGF0ZVgoM3B4KSByb3RhdGUoLTEyZGVnKX0KLmNoYXQtY29tcG9zZS50eXBpbmcgLmNoYXQtc2VuZHthbmltYXRpb246Y2hhdFB1bHNlIDEuNnMgZWFzZS1pbi1vdXQgaW5maW5pdGV9Ci5jaGF0LWZvb3R7Z3JpZC1jb2x1bW46MS8tMTtkaXNwbGF5OmZsZXg7anVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW47YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo4cHh9Ci5jaGF0LWZvb3Qgc21hbGx7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtc2l6ZToxMS41cHh9Ci5jaGF0LXJlYWR7Ym9yZGVyOjEuNXB4IHNvbGlkICNDRkUwRkY7YmFja2dyb3VuZDojRjBGNkZGO2NvbG9yOiMyOTY4Qzg7Zm9udC13ZWlnaHQ6NzAwO2ZvbnQtc2l6ZToxM3B4O2JvcmRlci1yYWRpdXM6OTk5cHg7cGFkZGluZzo2cHggMTRweDtjdXJzb3I6cG9pbnRlcjt0cmFuc2l0aW9uOmJhY2tncm91bmQgLjJzLHRyYW5zZm9ybSAuMTVzfQouY2hhdC1yZWFkOmhvdmVye2JhY2tncm91bmQ6I0UwRUNGRjt0cmFuc2Zvcm06dHJhbnNsYXRlWSgtMXB4KX0KLmNoYXQtY2FyZCAubWtwLXNlbnR7cGFkZGluZzoxMnB4IDE2cHh9CkBrZXlmcmFtZXMgY2hhdElue2Zyb217b3BhY2l0eTowO3RyYW5zZm9ybTp0cmFuc2xhdGVZKDE0cHgpIHNjYWxlKC45OCl9dG97b3BhY2l0eToxO3RyYW5zZm9ybTpub25lfX0KQGtleWZyYW1lcyBidWJJbntmcm9te29wYWNpdHk6MDt0cmFuc2Zvcm06c2NhbGUoLjYpIHRyYW5zbGF0ZVkoOHB4KX10b3tvcGFjaXR5OjE7dHJhbnNmb3JtOm5vbmV9fQpAa2V5ZnJhbWVzIGNoYXRQdWxzZXswJSwxMDAle2JveC1zaGFkb3c6MCAwIDAgMCByZ2JhKDUyLDEzMSwyNTAsLjQ1KX01MCV7Ym94LXNoYWRvdzowIDAgMCA2cHggcmdiYSg1MiwxMzEsMjUwLDApfX0KQG1lZGlhIChwcmVmZXJzLXJlZHVjZWQtbW90aW9uOnJlZHVjZSl7LmNoYXQtY2FyZCwuY2hhdC10aHJlYWQgLm1rcC1idWIsLmNoYXQtdW5yZWFkLC5jaGF0LWNvbXBvc2UudHlwaW5nIC5jaGF0LXNlbmR7YW5pbWF0aW9uOm5vbmUhaW1wb3J0YW50fX0KLyogQ2VsdWxhcjogZWwgY2hhdCB1c2EgdG9kbyBlbCBhbmNobyBkZSBsYSBwYW50YWxsYSAqLwpAbWVkaWEgKG1heC13aWR0aDo3MDBweCl7CiAgI21rcEJvZHksLm1rcC1ib2R5e3dpZHRoOjEwMCU7bWF4LXdpZHRoOm5vbmV9CiAgLm1rcC1ib2R5e21hcmdpbi1pbmxpbmU6LTEwcHh9CiAgLmNoYXQtY2FyZHtib3JkZXItcmFkaXVzOjE2cHg7d2lkdGg6MTAwJX0KICAuY2hhdC1oZWFke3BhZGRpbmc6MTBweCAxMnB4fQogIC5jaGF0LWF2e3dpZHRoOjM4cHg7aGVpZ2h0OjM4cHg7Zm9udC1zaXplOjE0cHh9CiAgLmNoYXQtbWt7Zm9udC1zaXplOjA7cGFkZGluZzo2cHh9CiAgLmNoYXQtbWsgc3Zne3dpZHRoOjE4cHg7aGVpZ2h0OjE4cHh9CiAgLmNoYXQtdGhyZWFke21heC1oZWlnaHQ6NTV2aDtwYWRkaW5nOjEycHggMTBweH0KICAuY2hhdC10aHJlYWQgLm1rcC1idWJ7bWF4LXdpZHRoOjg4JTtmb250LXNpemU6MTUuNXB4fQogIC5jaGF0LWNvbXBvc2V7cGFkZGluZzoxMHB4fQogIC5jaGF0LXNlbmQgc3BhbntkaXNwbGF5Om5vbmV9CiAgLmNoYXQtc2VuZHt3aWR0aDo0NnB4O3BhZGRpbmc6MDtqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyfQogIC5ta3AtdGlsZXN7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgzLG1pbm1heCgwLDFmcikpO2dhcDo2cHh9CiAgLm1rcC10aWxle3BhZGRpbmc6MTBweH0KICAubWtwLXRpbGUgYntmb250LXNpemU6MjRweH0KfQouY2hhdC1zaGlwe2Rpc3BsYXk6aW5saW5lLWJsb2NrO2JvcmRlci1yYWRpdXM6OTk5cHg7cGFkZGluZzowIDhweDttYXJnaW4tcmlnaHQ6NnB4O2ZvbnQtd2VpZ2h0OjgwMDtmb250LXNpemU6MTEuNXB4fQouY2hhdC1zaGlwLmZsZXh7YmFja2dyb3VuZDojMDBBNjUwO2NvbG9yOiNmZmZ9LmNoYXQtc2hpcC5hZ3tiYWNrZ3JvdW5kOiMyRDMyNzc7Y29sb3I6I0ZGRTYwMH0KLmNoYXQtdW5yZWFke21hcmdpbi1sZWZ0OjJweH0KLmNoYXQtc2FsZXtkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7Z2FwOjZweCAxNHB4O2FsaWduLWl0ZW1zOmNlbnRlcjtwYWRkaW5nOjlweCAxNnB4O2JhY2tncm91bmQ6I0ZGRkJFMDtib3JkZXItYm90dG9tOjFweCBzb2xpZCAjRjNFN0EwO2ZvbnQtc2l6ZToxMy41cHg7Y29sb3I6IzJEMzI3N30KLmNoYXQtc2FsZW5vIGJ7Zm9udC1mYW1pbHk6dmFyKC0tZGlzcGxheSk7bGV0dGVyLXNwYWNpbmc6LjNweH0KLmNoYXQtaXRlbXMgZW17Zm9udC1zdHlsZTpub3JtYWw7Y29sb3I6IzM0ODNGQTtmb250LXdlaWdodDo4MDB9CkBtZWRpYSAobWF4LXdpZHRoOjcwMHB4KXsuY2hhdC1zYWxle3BhZGRpbmc6OHB4IDEycHg7Zm9udC1zaXplOjEzcHh9fQoucS1kZWx7Ym9yZGVyOjEuNXB4IHNvbGlkICNGNEM3QzM7YmFja2dyb3VuZDojRkZGNUY0O2NvbG9yOiNCNDIzMTg7Zm9udC13ZWlnaHQ6NzAwO2ZvbnQtc2l6ZToxM3B4O2JvcmRlci1yYWRpdXM6OTk5cHg7cGFkZGluZzo2cHggMTRweDtjdXJzb3I6cG9pbnRlcjt0cmFuc2l0aW9uOmJhY2tncm91bmQgLjJzLHRyYW5zZm9ybSAuMTVzfQoucS1kZWw6aG92ZXJ7YmFja2dyb3VuZDojRkRFN0U1O3RyYW5zZm9ybTp0cmFuc2xhdGVZKC0xcHgpfQoucS1kZWwuYXJtZWR7YmFja2dyb3VuZDojQjQyMzE4O2NvbG9yOiNmZmY7Ym9yZGVyLWNvbG9yOiNCNDIzMTh9Ci5ta3AtY2FyZC5ta3AtZ29uZXt0cmFuc2l0aW9uOm9wYWNpdHkgLjNzLHRyYW5zZm9ybSAuM3M7b3BhY2l0eTowO3RyYW5zZm9ybTp0cmFuc2xhdGVYKDMwcHgpfQovKiBNS1AgRmxhc2ggwrcgQXRyYXNhZG9zICovCi5ta3AtdGlsZXN7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCg2LG1pbm1heCgwLDFmcikpfQoubWtwLXRpbGUtbGF0ZS5ob3R7Ym9yZGVyLWNvbG9yOiNFNTQ4NEQ7YmFja2dyb3VuZDojRkZGMUYxfS5ta3AtdGlsZS1sYXRlLmhvdCBie2NvbG9yOiNEMTJGMzV9Ci5ta3AtdGlsZS1sYXRlLndhcm17Ym9yZGVyLWNvbG9yOiNGNUE1MjQ7YmFja2dyb3VuZDojRkZGOEVCfS5ta3AtdGlsZS1sYXRlLndhcm0gYntjb2xvcjojQjI2QjAwfQoubWtwLXRpbGUtbGF0ZS5ob3Qub24sLm1rcC10aWxlLWxhdGUud2FybS5vbntib3JkZXItd2lkdGg6MnB4fQoubGF0ZS1ncnB7bWFyZ2luLWJvdHRvbToxNnB4fS5sYXRlLWdycCBoM3ttYXJnaW46NnB4IDJweCA4cHg7Zm9udC1zaXplOjE2cHh9LmxhdGUtZ3JwIGgzIHNtYWxse2NvbG9yOnZhcigtLW11dGVkKTtmb250LXdlaWdodDo1MDA7Zm9udC1zaXplOjEycHg7bWFyZ2luLWxlZnQ6NnB4fQoubGF0ZS1jYXJke2Rpc3BsYXk6Z3JpZDtnYXA6NXB4O2JvcmRlci1sZWZ0OjVweCBzb2xpZCAjRTU0ODREO2FuaW1hdGlvbjpjaGF0SW4gLjRzIGVhc2UgYm90aDthbmltYXRpb24tZGVsYXk6dmFyKC0tZCwwbXMpfQoubGF0ZS1jYXJkLndhcm57Ym9yZGVyLWxlZnQtY29sb3I6I0Y1QTUyNH0KLmxhdGUtaHtkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo4cHh9Ci5sYXRlLWZsYWd7Zm9udC13ZWlnaHQ6ODAwO2ZvbnQtc2l6ZToxM3B4O3BhZGRpbmc6M3B4IDEwcHg7Ym9yZGVyLXJhZGl1czo5OTlweDtiYWNrZ3JvdW5kOiNGRkUzRTM7Y29sb3I6I0I0MjMyQX0KLmxhdGUtY2FyZC53YXJuIC5sYXRlLWZsYWd7YmFja2dyb3VuZDojRkZGMENDO2NvbG9yOiM4QTUzMDA7YW5pbWF0aW9uOmNoYXRQdWxzZSAycyBlYXNlLWluLW91dCBpbmZpbml0ZX0KLmxhdGUta2luZHttYXJnaW4tbGVmdDphdXRvO2ZvbnQtc2l6ZToxM3B4fQoubGF0ZS13aHl7bWFyZ2luOjJweCAwO2ZvbnQtd2VpZ2h0OjYwMH0KLmxhdGUtY2FyZCBzbWFsbHtjb2xvcjp2YXIoLS1tdXRlZCk7Zm9udC1zaXplOjEyLjVweH0ubGF0ZS1jYXJkIHNtYWxsIGJ7Y29sb3I6dmFyKC0taW5rLCMxYjFkM2EpfQpAbWVkaWEgKG1heC13aWR0aDo5MDBweCl7Lm1rcC10aWxlc3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDIsbWlubWF4KDAsMWZyKSl9fQpAbWVkaWEgKG1heC13aWR0aDo3MDBweCl7Lm1rcC10aWxlc3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDMsbWlubWF4KDAsMWZyKSl9LmxhdGUta2luZHttYXJnaW4tbGVmdDowfX0KLmNoYXQtc2hpcC5sYXRlLW1rLWZhe2JhY2tncm91bmQ6I0U4RjdFQztjb2xvcjojMUU3QTNBO2JvcmRlci1jb2xvcjojQkZFNkNCfQouY2hhdC1zaGlwLmxhdGUtbWstcGF7YmFja2dyb3VuZDojRThGMEZGO2NvbG9yOiMxRDRFRDg7Ym9yZGVyLWNvbG9yOiNDNUQ2RkJ9Ci5ta3AtdGlsZXN7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCg1LG1pbm1heCgwLDFmcikpfQpAbWVkaWEgKG1heC13aWR0aDo5MDBweCl7Lm1rcC10aWxlc3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDIsbWlubWF4KDAsMWZyKSl9fQpAbWVkaWEgKG1heC13aWR0aDo3MDBweCl7Lm1rcC10aWxlc3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDMsbWlubWF4KDAsMWZyKSl9fQovKiBSZWNsYW1vcyB5IG1lZGlhY2lvbmVzIGNvbW8gY2hhdCAqLwouY2xhaW0tdGFne2Rpc3BsYXk6aW5saW5lLWJsb2NrO21hcmdpbi1yaWdodDo2cHg7cGFkZGluZzoycHggOXB4O2JvcmRlci1yYWRpdXM6OTk5cHg7Zm9udC13ZWlnaHQ6ODAwO2ZvbnQtc2l6ZToxMS41cHg7YmFja2dyb3VuZDojRkZFM0UzO2NvbG9yOiNCNDIzMkF9Ci5jbGFpbS10YWcubWVke2JhY2tncm91bmQ6I0VERTRGRjtjb2xvcjojNUIyREIzfQouY2xhaW0tZHVle2Rpc3BsYXk6aW5saW5lLWJsb2NrO3BhZGRpbmc6MnB4IDlweDtib3JkZXItcmFkaXVzOjk5OXB4O2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTEuNXB4O2JhY2tncm91bmQ6cmdiYSgyNTUsMjU1LDI1NSwuNzUpO2NvbG9yOiMyRDMyNzd9Ci5jbGFpbS1jaGF0Lm1lZCAuY2hhdC1oZWFke2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDEyMGRlZywjRkZGMTU5IDAlLCNGRkU2MDAgNTUlLCNFOUQ4RkYgMTAwJSl9Ci5jaGF0LXRocmVhZCAubWtwLWJ1Yi5tZWRpYXRvcntiYWNrZ3JvdW5kOiNGRkY3REI7Ym9yZGVyOjFweCBzb2xpZCAjRjVERThDO2p1c3RpZnktc2VsZjpjZW50ZXI7bWF4LXdpZHRoOjg4JTtib3JkZXItcmFkaXVzOjE0cHh9Ci5idWItd2hve2ZvbnQtc2l6ZToxMS41cHg7Y29sb3I6IzhBNTMwMDttYXJnaW4tYm90dG9tOjJweH0KLmNoYXQtbm9uZXtqdXN0aWZ5LXNlbGY6Y2VudGVyO3BhZGRpbmc6OHB4fQouY2hhdC1sb2FkaW5ne2p1c3RpZnktc2VsZjpzdGFydDtkaXNwbGF5OmZsZXg7Z2FwOjVweDtwYWRkaW5nOjEycHggMTRweDtiYWNrZ3JvdW5kOiNmZmY7Ym9yZGVyLXJhZGl1czoxOHB4O2JveC1zaGFkb3c6MCAycHggNnB4IHJnYmEoMjAsMzAsNjAsLjA4KX0KLmNoYXQtbG9hZGluZyBpe3dpZHRoOjhweDtoZWlnaHQ6OHB4O2JvcmRlci1yYWRpdXM6NTAlO2JhY2tncm91bmQ6IzlBQTVCRTthbmltYXRpb246ZG90QiAxcyBpbmZpbml0ZSBlYXNlLWluLW91dH0KLmNoYXQtbG9hZGluZyBpOm50aC1jaGlsZCgyKXthbmltYXRpb24tZGVsYXk6LjE1c30uY2hhdC1sb2FkaW5nIGk6bnRoLWNoaWxkKDMpe2FuaW1hdGlvbi1kZWxheTouM3N9CkBrZXlmcmFtZXMgZG90QnswJSw4MCUsMTAwJXt0cmFuc2Zvcm06dHJhbnNsYXRlWSgwKTtvcGFjaXR5Oi41fTQwJXt0cmFuc2Zvcm06dHJhbnNsYXRlWSgtNXB4KTtvcGFjaXR5OjF9fQouY2hhdC1zYWxle2ZsZXgtd3JhcDp3cmFwfQovKiBDZWx1bGFyOiBzaW4gZnJhbmphIGEgbGEgZGVyZWNoYSBuaSB6b29tIGFsIGVudHJhciAobmFkYSBwdWVkZSBzZXIgbcOhcyBhbmNobyBxdWUgbGEgcGFudGFsbGEpICovCmh0bWwsYm9keXttYXgtd2lkdGg6MTAwJTtvdmVyZmxvdy14OmNsaXB9CkBzdXBwb3J0cyBub3QgKG92ZXJmbG93OmNsaXApe2h0bWwsYm9keXtvdmVyZmxvdy14OmhpZGRlbn19CmltZyxzdmcsdmlkZW8sY2FudmFze21heC13aWR0aDoxMDAlfQpAbWVkaWEgKG1heC13aWR0aDo3NjBweCl7CiAgLnRvcCAud3JhcHtnYXA6OHB4fQogIC5uYXZ7b3JkZXI6MTA7ZmxleDoxIDEgMTAwJTttYXgtd2lkdGg6MTAwJTtvdmVyZmxvdy14OmF1dG87c2Nyb2xsYmFyLXdpZHRoOm5vbmU7LXdlYmtpdC1vdmVyZmxvdy1zY3JvbGxpbmc6dG91Y2g7Ym9yZGVyLXJhZGl1czoxNnB4fQogIC5uYXY6Oi13ZWJraXQtc2Nyb2xsYmFye2Rpc3BsYXk6bm9uZX0KICAubmF2IGJ1dHRvbntmbGV4Om5vbmU7d2hpdGUtc3BhY2U6bm93cmFwO3BhZGRpbmc6OHB4IDEzcHg7Zm9udC1zaXplOjE0cHh9CiAgLndyYXB7bWF4LXdpZHRoOjEwMCU7bWluLXdpZHRoOjB9CiAgLm1rcC1jYXJkLC5jaGF0LWNhcmQsLm1rcC1ib2R5LC5ta3AtdGlsZXN7bWluLXdpZHRoOjA7bWF4LXdpZHRoOjEwMCV9CiAgLmNoYXQtaXRlbXMsLmNoYXQtc2FsZSBiLC5ta3AtYnViIHNwYW57b3ZlcmZsb3ctd3JhcDphbnl3aGVyZX0KfQovKiBDZWx1bGFyOiBmcmFuamEgYW5nb3N0YSBhIGxhIGRlcmVjaGEgcGFyYSBkZXNsaXphciBjb24gZWwgZGVkbyBzaW4gdG9jYXIgbGFzIHRhcmpldGFzICovCkBtZWRpYSAobWF4LXdpZHRoOjc2MHB4KXsKICBtYWluLndyYXB7cGFkZGluZy1sZWZ0OjEycHg7cGFkZGluZy1yaWdodDozMHB4fQogIGJvZHk6OmFmdGVye2NvbnRlbnQ6IiI7cG9zaXRpb246Zml4ZWQ7dG9wOjA7Ym90dG9tOjA7cmlnaHQ6MDt3aWR0aDoyMnB4O3BvaW50ZXItZXZlbnRzOm5vbmU7ei1pbmRleDo1O2JvcmRlci1sZWZ0OjFweCBzb2xpZCByZ2JhKDQ1LDUwLDExOSwuMDgpOwogICAgYmFja2dyb3VuZDpsaW5lYXItZ3JhZGllbnQocmdiYSg0NSw1MCwxMTksLjI1KSxyZ2JhKDQ1LDUwLDExOSwuMjUpKSBjZW50ZXIvNHB4IDU2cHggbm8tcmVwZWF0LGxpbmVhci1ncmFkaWVudCg5MGRlZyxyZ2JhKDUyLDEzMSwyNTAsLjAzKSxyZ2JhKDUyLDEzMSwyNTAsLjA5KSl9Cn0KLyogTUtQIEZsYXNoOiB0YXJqZXRhcyBibGFuY2FzIGNvbiBmcmFuamEgZGUgY29sb3IgYXJyaWJhOyBsYSBzZWNjacOzbiBhY3R1YWwgcXVlZGEgZGVzdGFjYWRhICovCi5ta3AtdGlsZVtkYXRhLW12XXstLWM6IzJEMzI3Nztwb3NpdGlvbjpyZWxhdGl2ZTtvdmVyZmxvdzp2aXNpYmxlO2JhY2tncm91bmQ6I2ZmZjtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTZweDtwYWRkaW5nLXRvcDoxOHB4O3RyYW5zaXRpb246dHJhbnNmb3JtIC4xOHMsYm94LXNoYWRvdyAuMThzLG9wYWNpdHkgLjE4c30KLm1rcC10aWxlW2RhdGEtbXZdOjpiZWZvcmV7Y29udGVudDoiIjtwb3NpdGlvbjphYnNvbHV0ZTtsZWZ0OjA7cmlnaHQ6MDt0b3A6MDtoZWlnaHQ6NnB4O2JvcmRlci1yYWRpdXM6MTZweCAxNnB4IDAgMDtiYWNrZ3JvdW5kOmxpbmVhci1ncmFkaWVudCg5MGRlZyx2YXIoLS1jKSxjb2xvci1taXgoaW4gc3JnYix2YXIoLS1jKSA1NSUsI2ZmZikpfQoubWtwLXRpbGVbZGF0YS1tdj0icXVlc3Rpb25zIl17LS1jOiMzQjgyRjZ9Ci5ta3AtdGlsZVtkYXRhLW12PSJtZXNzYWdlcyJdey0tYzojMTBCOTgxfQoubWtwLXRpbGVbZGF0YS1tdj0iY2xhaW1zIl17LS1jOiM4QjVDRjZ9Ci5ta3AtdGlsZVtkYXRhLW12PSJsYXRlIl17LS1jOiNFRjQ0NDR9Ci5ta3AtdGlsZVtkYXRhLW12PSJsYXRlIl0ud2FybXstLWM6I0Y1OUUwQn0KLm1rcC10aWxlW2RhdGEtbXY9InJldHVybnMiXXstLWM6I0Y1OUUwQn0KLm1rcC10aWxlW2RhdGEtbXZdIGJ7Y29sb3I6dmFyKC0tYyl9Ci5ta3AtdGlsZS1sYXRlLmhvdCwubWtwLXRpbGUtbGF0ZS53YXJte2JhY2tncm91bmQ6I2ZmZjtib3JkZXItY29sb3I6dmFyKC0tbGluZSl9Ci5ta3AtdGlsZS1sYXRlLmhvdCBiOjphZnRlcntjb250ZW50OiIiO2Rpc3BsYXk6aW5saW5lLWJsb2NrO3dpZHRoOjhweDtoZWlnaHQ6OHB4O21hcmdpbi1sZWZ0OjhweDt2ZXJ0aWNhbC1hbGlnbjptaWRkbGU7Ym9yZGVyLXJhZGl1czo1MCU7YmFja2dyb3VuZDp2YXIoLS1jKTthbmltYXRpb246bGF0ZURvdCAxLjZzIGVhc2UtaW4tb3V0IGluZmluaXRlfQpAa2V5ZnJhbWVzIGxhdGVEb3R7MCUsMTAwJXtib3gtc2hhZG93OjAgMCAwIDAgY29sb3ItbWl4KGluIHNyZ2IsdmFyKC0tYykgNDUlLHRyYW5zcGFyZW50KX01MCV7Ym94LXNoYWRvdzowIDAgMCA2cHggdHJhbnNwYXJlbnR9fQoubWtwLXRpbGVbZGF0YS1tdl06aG92ZXJ7dHJhbnNmb3JtOnRyYW5zbGF0ZVkoLTJweCk7Ym94LXNoYWRvdzowIDhweCAxOHB4IHJnYmEoMjAsMzAsNjAsLjA4KX0KLm1rcC10aWxlcy5zZWwgLm1rcC10aWxlW2RhdGEtbXZdOm5vdCgub24pe29wYWNpdHk6LjcyfQoubWtwLXRpbGVzLnNlbCAubWtwLXRpbGVbZGF0YS1tdl06bm90KC5vbik6aG92ZXJ7b3BhY2l0eToxfQoubWtwLXRpbGVbZGF0YS1tdl0ub257Ym9yZGVyOjJweCBzb2xpZCB2YXIoLS1jKTtiYWNrZ3JvdW5kOmxpbmVhci1ncmFkaWVudCgxODBkZWcsY29sb3ItbWl4KGluIHNyZ2IsdmFyKC0tYykgNyUsI2ZmZiksI2ZmZiA3MCUpO3RyYW5zZm9ybTp0cmFuc2xhdGVZKC0zcHgpO2JveC1zaGFkb3c6MCAxMnB4IDI0cHggY29sb3ItbWl4KGluIHNyZ2IsdmFyKC0tYykgMjIlLHRyYW5zcGFyZW50KX0KLm1rcC10aWxlW2RhdGEtbXZdLm9uOjpiZWZvcmV7aGVpZ2h0OjhweDtsZWZ0Oi0xcHg7cmlnaHQ6LTFweDt0b3A6LTFweH0KLm1rcC10aWxlW2RhdGEtbXZdLm9uOjphZnRlcntjb250ZW50OiIiO3Bvc2l0aW9uOmFic29sdXRlO2xlZnQ6NTAlO2JvdHRvbTotMTBweDt0cmFuc2Zvcm06dHJhbnNsYXRlWCgtNTAlKTtib3JkZXI6OXB4IHNvbGlkIHRyYW5zcGFyZW50O2JvcmRlci1ib3R0b206MDtib3JkZXItdG9wLWNvbG9yOnZhcigtLWMpfQoubWtwLWhlcmV7cG9zaXRpb246YWJzb2x1dGU7dG9wOjE0cHg7cmlnaHQ6MTBweDtmb250LXN0eWxlOm5vcm1hbDtmb250LXNpemU6MTBweDtmb250LXdlaWdodDo4MDA7bGV0dGVyLXNwYWNpbmc6LjRweDt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7YmFja2dyb3VuZDp2YXIoLS1jKTtjb2xvcjojZmZmO3BhZGRpbmc6MnB4IDhweDtib3JkZXItcmFkaXVzOjk5OXB4fQoubWtwLXBpY2t7Ym9yZGVyLXN0eWxlOmRhc2hlZH0KQG1lZGlhIChtYXgtd2lkdGg6NzAwcHgpey5ta3AtaGVyZXt0b3A6MTJweDtyaWdodDo2cHg7Zm9udC1zaXplOjA7cGFkZGluZzoycHggNnB4fS5ta3AtaGVyZTo6YmVmb3Jle2NvbnRlbnQ6IkFxdcOtIjtmb250LXNpemU6OXB4fS5ta3AtdGlsZVtkYXRhLW12XXtwYWRkaW5nLXRvcDoxNnB4fX0KLyogQ2VsdWxhcjogYmFycmEgc3VwZXJpb3IgY29tcGFjdGEgeSBOTyBmaWphIChubyB0YXBhIGVsIGNvbnRlbmlkbyk7IGNoYXRzIHVuIHBvY28gbcOhcyBhbmdvc3RvcyAqLwpAbWVkaWEgKG1heC13aWR0aDo3NjBweCl7CiAgLnRvcHtwb3NpdGlvbjpzdGF0aWM7YmFja2Ryb3AtZmlsdGVyOm5vbmV9CiAgLnRvcCAud3JhcHtwYWRkaW5nLWJsb2NrOjZweDtnYXA6NnB4fQogIC5icmFuZHtmb250LXNpemU6MThweH0uYnJhbmQgaW1ne3dpZHRoOjI2cHg7aGVpZ2h0OjI2cHh9CiAgLmNsb2Nre3BhZGRpbmc6M3B4IDlweDtnYXA6NnB4fS5jbG9jayBie2ZvbnQtc2l6ZToxNHB4fS5jbG9jayBzbWFsbHtmb250LXNpemU6OXB4fQogIC51bmRvLWJ0bntwYWRkaW5nOjRweCA5cHg7Zm9udC1zaXplOjEycHh9CiAgLm5hdiBidXR0b257cGFkZGluZzo2cHggMTFweDtmb250LXNpemU6MTNweH0KICAjbWtwQm9keSAuY2hhdC1jYXJke3dpZHRoOmF1dG87bWF4LXdpZHRoOmNhbGMoMTAwJSAtIDE0cHgpO21hcmdpbi1yaWdodDoxNHB4fQp9Ci8qIE1lbnNhamVzIGRlbCBtZWRpYWRvciBkZSBNZXJjYWRvIExpYnJlLCBtw6FzIGNsYXJvcyAqLwoubWwtbXNne2Rpc3BsYXk6Z3JpZDtnYXA6MTBweDtsaW5lLWhlaWdodDoxLjQ1fQoubWwtbXNnIHB7bWFyZ2luOjB9Ci5tbC1vcHRze2xpc3Qtc3R5bGU6bm9uZTttYXJnaW46MDtwYWRkaW5nOjA7ZGlzcGxheTpncmlkO2dhcDo4cHh9Ci5tbC1vcHRzIGxpe2Rpc3BsYXk6ZmxleDtnYXA6MTBweDthbGlnbi1pdGVtczpmbGV4LXN0YXJ0O2JhY2tncm91bmQ6I2ZmZjtib3JkZXI6MXB4IHNvbGlkICNGMUUzQTY7Ym9yZGVyLXJhZGl1czoxMnB4O3BhZGRpbmc6MTBweCAxMnB4fQoubWwtbntmbGV4Om5vbmU7bWluLXdpZHRoOjI4cHg7aGVpZ2h0OjI4cHg7Ym9yZGVyLXJhZGl1czo1MCU7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtiYWNrZ3JvdW5kOiMyRDMyNzc7Y29sb3I6I0ZGRTYwMDtmb250LXdlaWdodDo4MDA7Zm9udC1zaXplOjEzcHh9Ci5tbC1vcHRzIGxpIGRpdntkaXNwbGF5OmdyaWQ7Z2FwOjJweH0KLm1sLW9wdHMgbGkgYntjb2xvcjojMkQzMjc3fQoubWwtb3B0cyBsaSBzbWFsbHtmb250LXNpemU6MTRweDtjb2xvcjp2YXIoLS1pbmssIzFiMWQzYSk7b3BhY2l0eTouODV9Ci5tbC1kZWFkbGluZXtiYWNrZ3JvdW5kOiNGRkYxRjE7Ym9yZGVyOjFweCBzb2xpZCAjRjVCNUI3O2NvbG9yOiM5RjFGMjQ7Ym9yZGVyLXJhZGl1czoxMHB4O3BhZGRpbmc6OHB4IDEycHg7Zm9udC13ZWlnaHQ6NjAwfQoubWwtY2hpcHtkaXNwbGF5OmlubGluZS1ibG9jaztiYWNrZ3JvdW5kOiMyRDMyNzc7Y29sb3I6I0ZGRTYwMDtib3JkZXItcmFkaXVzOjk5OXB4O3BhZGRpbmc6MnB4IDEwcHg7Zm9udC13ZWlnaHQ6ODAwO2ZvbnQtc2l6ZToxMi41cHh9Ci5tbC1oe2ZvbnQtd2VpZ2h0OjgwMDtjb2xvcjojMkQzMjc3fQovKiBOb3RpZmljYWNpb25lcyBkZSB2ZW50YXM6IGNhbXBhbmEgZmlqYSBhcnJpYmEgYSBsYSBkZXJlY2hhIGNvbiBsYXRpZG8gcm9qbyArIHBhbmVsIGxhdGVyYWwgKi8KLm50LWJlbGx7cG9zaXRpb246Zml4ZWQ7dG9wOjE0cHg7cmlnaHQ6MTZweDt6LWluZGV4OjYwO3dpZHRoOjUycHg7aGVpZ2h0OjUycHg7Ym9yZGVyLXJhZGl1czo1MCU7Ym9yZGVyOjA7YmFja2dyb3VuZDojZmZmO2NvbG9yOiNFMTFENDg7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtjdXJzb3I6cG9pbnRlcjtib3gtc2hhZG93OjAgNnB4IDE4cHggcmdiYSgyMjUsMjksNzIsLjI4KTthbmltYXRpb246bnRCZWF0IDEuNnMgZWFzZS1pbi1vdXQgaW5maW5pdGV9Ci5udC1iZWxsIHN2Z3t3aWR0aDoyNnB4O2hlaWdodDoyNnB4O2ZpbGw6Y3VycmVudENvbG9yfQoubnQtYmVsbDo6YmVmb3Jle2NvbnRlbnQ6IiI7cG9zaXRpb246YWJzb2x1dGU7aW5zZXQ6MDtib3JkZXItcmFkaXVzOjUwJTtib3JkZXI6MnB4IHNvbGlkICNFMTFENDg7YW5pbWF0aW9uOm50UmluZyAxLjZzIGVhc2Utb3V0IGluZmluaXRlfQoubnQtYmVsbC5oYXN7YmFja2dyb3VuZDojRTExRDQ4O2NvbG9yOiNmZmZ9Ci5udC1iZWxsLm9ue2JveC1zaGFkb3c6MCAwIDAgNHB4IHJnYmEoMjI1LDI5LDcyLC4yNSksMCA2cHggMThweCByZ2JhKDIyNSwyOSw3MiwuMyl9Ci5udC1iZWxsIGJ7cG9zaXRpb246YWJzb2x1dGU7dG9wOi00cHg7cmlnaHQ6LTRweDttaW4td2lkdGg6MjJweDtoZWlnaHQ6MjJweDtwYWRkaW5nOjAgNnB4O2JvcmRlci1yYWRpdXM6OTk5cHg7YmFja2dyb3VuZDojRkZFNjAwO2NvbG9yOiMyRDMyNzc7Zm9udC1zaXplOjEycHg7Zm9udC13ZWlnaHQ6OTAwO2Rpc3BsYXk6Z3JpZDtwbGFjZS1pdGVtczpjZW50ZXI7Ym94LXNoYWRvdzowIDAgMCAycHggI2ZmZn0KQGtleWZyYW1lcyBudEJlYXR7MCUsNDAlLDEwMCV7dHJhbnNmb3JtOnNjYWxlKDEpfTE1JXt0cmFuc2Zvcm06c2NhbGUoMS4xNCl9Mjgle3RyYW5zZm9ybTpzY2FsZSgxLjA0KX19CkBrZXlmcmFtZXMgbnRSaW5nezAle3RyYW5zZm9ybTpzY2FsZSgxKTtvcGFjaXR5Oi43fTcwJSwxMDAle3RyYW5zZm9ybTpzY2FsZSgxLjYpO29wYWNpdHk6MH19CmJvZHkubnQtb24gLm50LWJlbGx7YW5pbWF0aW9uLXBsYXktc3RhdGU6cnVubmluZ30KLnRvcCAud3JhcHtwYWRkaW5nLXJpZ2h0Ojg0cHh9Ci5udC1wYW5lbHtwb3NpdGlvbjpmaXhlZDt0b3A6MDtyaWdodDowO2JvdHRvbTowO3otaW5kZXg6NTU7d2lkdGg6NDIwcHg7bWF4LXdpZHRoOjkydnc7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlLCNmZmYpO2JveC1zaGFkb3c6LTEycHggMCAzMnB4IHJnYmEoMjAsMzAsNjAsLjE2KTt0cmFuc2Zvcm06dHJhbnNsYXRlWCgxMDUlKTt0cmFuc2l0aW9uOnRyYW5zZm9ybSAuM3MgY3ViaWMtYmV6aWVyKC4yLC44LC4yLDEpO2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW59CmJvZHkubnQtb24gLm50LXBhbmVse3RyYW5zZm9ybTpub25lfQpAbWVkaWEgKG1pbi13aWR0aDoxMTAwcHgpe2JvZHkubnQtb257cGFkZGluZy1yaWdodDo0MjBweH1ib2R5Lm50LW9uIC5udC1wYW5lbHtib3gtc2hhZG93Oi0xcHggMCAwIHZhcigtLWxpbmUpfX0KLm50LWh7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbjtnYXA6MTBweDtwYWRkaW5nOjE4cHggODRweCAxNHB4IDE4cHg7YmFja2dyb3VuZDpsaW5lYXItZ3JhZGllbnQoMTIwZGVnLCNGRkYxNTksI0ZGRTYwMCk7Y29sb3I6IzJEMzI3N30KLm50LWggYntmb250LWZhbWlseTp2YXIoLS1kaXNwbGF5KTtmb250LXNpemU6MjJweDtkaXNwbGF5OmJsb2NrfQoubnQtaCBzbWFsbHtmb250LXNpemU6MTMuNXB4fQoubnQteHtib3JkZXI6MDtiYWNrZ3JvdW5kOnJnYmEoNDUsNTAsMTE5LC4xKTtjb2xvcjojMkQzMjc3O3dpZHRoOjM0cHg7aGVpZ2h0OjM0cHg7Ym9yZGVyLXJhZGl1czo1MCU7Zm9udC1zaXplOjE2cHg7Y3Vyc29yOnBvaW50ZXJ9Ci5udC1me2Rpc3BsYXk6ZmxleDtnYXA6NnB4O3BhZGRpbmc6MTBweCAxNHB4O2JvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLWxpbmUpO2ZsZXgtd3JhcDp3cmFwfQoubnQtZiBidXR0b257Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtiYWNrZ3JvdW5kOiNmZmY7Ym9yZGVyLXJhZGl1czo5OTlweDtwYWRkaW5nOjVweCAxMXB4O2ZvbnQtd2VpZ2h0OjcwMDtmb250LXNpemU6MTNweDtjdXJzb3I6cG9pbnRlcjtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5udC1mIGJ1dHRvbiBlbXtmb250LXN0eWxlOm5vcm1hbDtvcGFjaXR5Oi43O21hcmdpbi1sZWZ0OjJweH0KLm50LWYgYnV0dG9uLm9ue2JhY2tncm91bmQ6IzJEMzI3Nztjb2xvcjojZmZmO2JvcmRlci1jb2xvcjojMkQzMjc3fQoubnQtbGlzdHtmbGV4OjE7b3ZlcmZsb3cteTphdXRvO3BhZGRpbmc6MTJweCAxNHB4IDMwcHg7ZGlzcGxheTpncmlkO2dhcDoxMHB4O2FsaWduLWNvbnRlbnQ6c3RhcnQ7YmFja2dyb3VuZDojRjZGOEZDfQoubnQtaXRlbXstLWM6IzJEMzI3NztiYWNrZ3JvdW5kOiNmZmY7Ym9yZGVyLXJhZGl1czoxNHB4O3BhZGRpbmc6MTJweCAxNHB4O2JvcmRlci1sZWZ0OjVweCBzb2xpZCB2YXIoLS1jKTtib3gtc2hhZG93OjAgMnB4IDhweCByZ2JhKDIwLDMwLDYwLC4wNik7ZGlzcGxheTpncmlkO2dhcDo2cHg7YW5pbWF0aW9uOmNoYXRJbiAuMzVzIGVhc2UgYm90aDthbmltYXRpb24tZGVsYXk6Y2FsYyh2YXIoLS1pKSAqIDQwbXMpfQoubnQtaXRlbS5tay1tbHstLWM6I0Y1QzQwMH0ubnQtaXRlbS5tay1mYXstLWM6IzRDQUY1MH0ubnQtaXRlbS5tay1wYXstLWM6IzI1NjNFQn0KLm50LWl0ZW0ubmV3e2JhY2tncm91bmQ6I0ZGRkJFQTtib3gtc2hhZG93OjAgMCAwIDJweCAjRkZFNjAwIGluc2V0LDAgMnB4IDhweCByZ2JhKDIwLDMwLDYwLC4wNil9Ci5udC10b3B7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6OHB4O2ZsZXgtd3JhcDp3cmFwO2ZvbnQtc2l6ZToxMi41cHh9Ci5udC1ta3tmb250LXdlaWdodDo4MDA7Y29sb3I6IzJEMzI3NztiYWNrZ3JvdW5kOmNvbG9yLW1peChpbiBzcmdiLHZhcigtLWMpIDIyJSwjZmZmKTtib3JkZXItcmFkaXVzOjk5OXB4O3BhZGRpbmc6MnB4IDlweH0KLm50LXNlbGxlcntmb250LXdlaWdodDo3MDA7Y29sb3I6dmFyKC0tbXV0ZWQpfQoubnQtYWdve21hcmdpbi1sZWZ0OmF1dG87Y29sb3I6dmFyKC0tbXV0ZWQpfQoubnQtbWFpbntkaXNwbGF5OmZsZXg7Z2FwOjEycHg7YWxpZ24taXRlbXM6ZmxleC1zdGFydDtqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2Vlbn0KLm50LXByb2R7ZGlzcGxheTpncmlkO2dhcDozcHg7Zm9udC1zaXplOjE0LjVweDtmb250LXdlaWdodDo2MDA7bWluLXdpZHRoOjB9Ci5udC1wcm9kIHNtYWxse2ZvbnQtd2VpZ2h0OjUwMDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5udC1wcm9kIGVte2ZvbnQtc3R5bGU6bm9ybWFsO2NvbG9yOiMzNDgzRkE7Zm9udC13ZWlnaHQ6ODAwfQoubnQtcHJpY2V7Zm9udC1mYW1pbHk6dmFyKC0tZGlzcGxheSk7Zm9udC1zaXplOjIxcHg7Y29sb3I6IzBGN0IzRjt3aGl0ZS1zcGFjZTpub3dyYXB9Ci5udC1pZHtjb2xvcjp2YXIoLS1tdXRlZCk7Zm9udC1zaXplOjEycHh9Ci5udC1lbXB0eXt0ZXh0LWFsaWduOmNlbnRlcjtjb2xvcjp2YXIoLS1tdXRlZCk7cGFkZGluZzozMHB4IDEwcHh9CkBtZWRpYSAobWF4LXdpZHRoOjc2MHB4KXsubnQtYmVsbHt0b3A6MTBweDtyaWdodDoxMHB4O3dpZHRoOjQ2cHg7aGVpZ2h0OjQ2cHh9Lm50LWJlbGwgc3Zne3dpZHRoOjIzcHg7aGVpZ2h0OjIzcHh9LnRvcCAud3JhcHtwYWRkaW5nLXJpZ2h0OjY2cHh9Lm50LXBhbmVse3dpZHRoOjEwMHZ3O21heC13aWR0aDoxMDB2d30ubnQtaHtwYWRkaW5nOjE0cHggNzBweCAxMnB4IDE0cHh9fQpAbWVkaWEgKHByZWZlcnMtcmVkdWNlZC1tb3Rpb246cmVkdWNlKXsubnQtYmVsbCwubnQtYmVsbDo6YmVmb3Jle2FuaW1hdGlvbjpub25lfX0KLm50LWltZ3tmbGV4Om5vbmU7d2lkdGg6NjRweDtoZWlnaHQ6NjRweDtib3JkZXItcmFkaXVzOjEycHg7b2JqZWN0LWZpdDpjb3ZlcjtiYWNrZ3JvdW5kOiNmZmY7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKX0KLm50LW5vaW1ne2Rpc3BsYXk6Z3JpZDtwbGFjZS1pdGVtczpjZW50ZXI7Zm9udC1zaXplOjI2cHg7YmFja2dyb3VuZDojRjFGNEZBfQoubnQtcHJvZHtmbGV4OjF9Ci5udC1ta3tkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4fQoubnQtbWsgaXt3aWR0aDo5cHg7aGVpZ2h0OjlweDtib3JkZXItcmFkaXVzOjUwJTtiYWNrZ3JvdW5kOnZhcigtLWMpfQoubnQtZmx5ey0tYzojMkQzMjc3O3Bvc2l0aW9uOmZpeGVkO2xlZnQ6MDt0b3A6MDt6LWluZGV4OjgwO3dpZHRoOjE0MHB4O3BhZGRpbmc6MTBweDtib3JkZXItcmFkaXVzOjE4cHg7YmFja2dyb3VuZDojZmZmO2JveC1zaGFkb3c6MCAxOHB4IDQwcHggcmdiYSgyMCwzMCw2MCwuMyk7ZGlzcGxheTpncmlkO2p1c3RpZnktaXRlbXM6Y2VudGVyO2dhcDo0cHg7cG9pbnRlci1ldmVudHM6bm9uZTtib3JkZXItdG9wOjVweCBzb2xpZCB2YXIoLS1jKX0KLm50LWZseS5tay1tbHstLWM6I0Y1QzQwMH0ubnQtZmx5Lm1rLWZhey0tYzojNENBRjUwfS5udC1mbHkubWstcGF7LS1jOiMyNTYzRUJ9Ci5udC1mbHkgaW1nLC5udC1mbHkgc3Bhbnt3aWR0aDoxMTBweDtoZWlnaHQ6MTEwcHg7Ym9yZGVyLXJhZGl1czoxMnB4O29iamVjdC1maXQ6Y292ZXI7ZGlzcGxheTpncmlkO3BsYWNlLWl0ZW1zOmNlbnRlcjtmb250LXNpemU6NDhweDtiYWNrZ3JvdW5kOiNGMUY0RkF9Ci5udC1mbHkgYntmb250LWZhbWlseTp2YXIoLS1kaXNwbGF5KTtmb250LXNpemU6MjRweDtjb2xvcjojMEY3QjNGfQoubnQtZmx5IHNtYWxse2ZvbnQtc2l6ZToxMXB4O2ZvbnQtd2VpZ2h0OjcwMDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5udC1iZWxsLm50LWhpdHthbmltYXRpb246bnRIaXQgLjZzIGVhc2UsbnRCZWF0IDEuNnMgZWFzZS1pbi1vdXQgLjZzIGluZmluaXRlfQpAa2V5ZnJhbWVzIG50SGl0ezAle3RyYW5zZm9ybTpzY2FsZSgxKX0zMCV7dHJhbnNmb3JtOnNjYWxlKDEuMzUpIHJvdGF0ZSgtMTJkZWcpfTYwJXt0cmFuc2Zvcm06c2NhbGUoLjk1KSByb3RhdGUoOGRlZyl9MTAwJXt0cmFuc2Zvcm06c2NhbGUoMSl9fQovKiBGb3RvcyB5IGFyY2hpdm9zIGFkanVudG9zIGVuIGxvcyBjaGF0cyAqLwouYnViLWF0dHtkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7Z2FwOjZweDttYXJnaW46NHB4IDAgMnB4fQouYnViLWF0dCBpbWd7d2lkdGg6MTcwcHg7bWF4LXdpZHRoOjEwMCU7aGVpZ2h0OjE3MHB4O29iamVjdC1maXQ6Y292ZXI7Ym9yZGVyLXJhZGl1czoxMnB4O2Rpc3BsYXk6YmxvY2s7YmFja2dyb3VuZDojRUVGMUY2O2N1cnNvcjp6b29tLWluO3RyYW5zaXRpb246dHJhbnNmb3JtIC4xNXN9Ci5idWItYXR0IGltZzpob3Zlcnt0cmFuc2Zvcm06c2NhbGUoMS4wMyl9Ci5idWItZmlsZXtkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4O2JhY2tncm91bmQ6cmdiYSgyNTUsMjU1LDI1NSwuODUpO2NvbG9yOiMyRDMyNzc7Ym9yZGVyLXJhZGl1czoxMHB4O3BhZGRpbmc6NnB4IDEwcHg7Zm9udC13ZWlnaHQ6NzAwO2ZvbnQtc2l6ZToxM3B4O3RleHQtZGVjb3JhdGlvbjpub25lfQouYnViLWltZyBzcGFue2Rpc3BsYXk6bm9uZX0KLmJ1Yi1pbWcuYnJva2VuIGltZ3tkaXNwbGF5Om5vbmV9Ci5idWItaW1nLmJyb2tlbiBzcGFue2Rpc3BsYXk6aW5saW5lLWZsZXg7YmFja2dyb3VuZDpyZ2JhKDI1NSwyNTUsMjU1LC44NSk7Y29sb3I6IzJEMzI3Nztib3JkZXItcmFkaXVzOjEwcHg7cGFkZGluZzo2cHggMTBweDtmb250LXdlaWdodDo3MDA7Zm9udC1zaXplOjEzcHh9Ci8qIEJpbGxldGUgdmVyZGUgKHJlZW1wbGF6YSBsYSBjYW1wYW5hKSBjb24gbGF0aWRvIHZlcmRlICovCi5udC1iZWxsLm50LWNhc2h7d2lkdGg6NjRweDtoZWlnaHQ6NDRweDtib3JkZXItcmFkaXVzOjEycHg7YmFja2dyb3VuZDp0cmFuc3BhcmVudDtib3gtc2hhZG93Om5vbmU7YW5pbWF0aW9uOm50QmVhdCAxLjZzIGVhc2UtaW4tb3V0IGluZmluaXRlO2ZpbHRlcjpkcm9wLXNoYWRvdygwIDZweCAxMnB4IHJnYmEoMjIsMTYzLDc0LC4zNSkpfQoubnQtYmVsbC5udC1jYXNoIHN2Z3t3aWR0aDo2NHB4O2hlaWdodDozOHB4fQoubnQtYmVsbC5udC1jYXNoOjpiZWZvcmV7Ym9yZGVyLXJhZGl1czoxMnB4O2JvcmRlci1jb2xvcjojMjJDNTVFO2FuaW1hdGlvbjpudFJpbmdHIDEuNnMgZWFzZS1vdXQgaW5maW5pdGV9Ci5udC1iZWxsLm50LWNhc2guaGFzLC5udC1iZWxsLm50LWNhc2gub257YmFja2dyb3VuZDp0cmFuc3BhcmVudH0KLm50LWJlbGwubnQtY2FzaC5vbntmaWx0ZXI6ZHJvcC1zaGFkb3coMCAwIDAgIzIyQzU1RSkgZHJvcC1zaGFkb3coMCA2cHggMTRweCByZ2JhKDIyLDE2Myw3NCwuNTUpKX0KLm50LWJlbGwubnQtY2FzaCBie2JhY2tncm91bmQ6I0RDMjYyNjtjb2xvcjojZmZmO3RvcDotOHB4O3JpZ2h0Oi04cHh9CkBrZXlmcmFtZXMgbnRSaW5nR3swJXt0cmFuc2Zvcm06c2NhbGUoMSk7b3BhY2l0eTouNzU7Ym94LXNoYWRvdzowIDAgMCAwIHJnYmEoMzQsMTk3LDk0LC40NSl9NzAlLDEwMCV7dHJhbnNmb3JtOnNjYWxlKDEuMzUpO29wYWNpdHk6MDtib3gtc2hhZG93OjAgMCAwIDEwcHggcmdiYSgzNCwxOTcsOTQsMCl9fQoubnQtZmx5e3dpZHRoOjEyMHB4O3BhZGRpbmc6OHB4O2JvcmRlci1yYWRpdXM6MTZweDtib3gtc2hhZG93OjAgMTJweCAyOHB4IHJnYmEoMjAsMzAsNjAsLjI1KX0KLm50LWZseSBpbWcsLm50LWZseSBzcGFue3dpZHRoOjEwMHB4O2hlaWdodDoxMDBweH0KLm50LWZseSBie2NvbG9yOiMxNkEzNEE7Zm9udC1zaXplOjIycHh9Ci5udC1oYntkaXNwbGF5OmZsZXg7Z2FwOjZweH0KLm50LWNmZ3twYWRkaW5nOjEycHggMTZweDtib3JkZXItYm90dG9tOjFweCBzb2xpZCB2YXIoLS1saW5lKTtiYWNrZ3JvdW5kOiNGMEZERjQ7ZGlzcGxheTpncmlkO2dhcDo2cHh9Ci5udC1jZmcgc21hbGx7Y29sb3I6dmFyKC0tbXV0ZWQpfQoubnQtY2ZnIGRpdntkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7Z2FwOjZweCAxNHB4fQoubnQtY2ZnIGxhYmVse2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjZweDtmb250LXdlaWdodDo3MDA7Zm9udC1zaXplOjEzLjVweDtjdXJzb3I6cG9pbnRlcn0KLm50LXByaWNle2NvbG9yOiMxNkEzNEF9CkBtZWRpYSAobWF4LXdpZHRoOjc2MHB4KXsubnQtYmVsbC5udC1jYXNoe3dpZHRoOjU0cHg7aGVpZ2h0OjM4cHh9Lm50LWJlbGwubnQtY2FzaCBzdmd7d2lkdGg6NTRweDtoZWlnaHQ6MzJweH0ubnQtZmx5e3dpZHRoOjk2cHh9Lm50LWZseSBpbWcsLm50LWZseSBzcGFue3dpZHRoOjgwcHg7aGVpZ2h0OjgwcHh9fQovKiBQYW5lbCBkZSB2ZW50YXM6IG3DoXMgY29tcGFjdG8geSBzaW4gZGVzYm9yZGVzICovCi5udC1wYW5lbHt3aWR0aDozODBweDtvdmVyZmxvdzpoaWRkZW47Ym94LXNpemluZzpib3JkZXItYm94fQoubnQtcGFuZWwgKntib3gtc2l6aW5nOmJvcmRlci1ib3h9CkBtZWRpYSAobWluLXdpZHRoOjExMDBweCl7Ym9keS5udC1vbntwYWRkaW5nLXJpZ2h0OjM4MHB4fX0KLm50LWh7cGFkZGluZzoxNHB4IDkwcHggMTJweCAxNnB4fQoubnQtaCBie2ZvbnQtc2l6ZToxOXB4fS5udC1oIHNtYWxse2ZvbnQtc2l6ZToxMi41cHh9Ci5udC14e3dpZHRoOjMwcHg7aGVpZ2h0OjMwcHg7Zm9udC1zaXplOjE0cHh9Ci5udC1me2ZsZXgtd3JhcDpub3dyYXA7b3ZlcmZsb3cteDphdXRvO3Njcm9sbGJhci13aWR0aDpub25lO3BhZGRpbmc6OHB4IDEycHg7Z2FwOjVweH0KLm50LWY6Oi13ZWJraXQtc2Nyb2xsYmFye2Rpc3BsYXk6bm9uZX0KLm50LWYgYnV0dG9ue2ZsZXg6bm9uZTtwYWRkaW5nOjRweCAxMHB4O2ZvbnQtc2l6ZToxMnB4fQoubnQtbGlzdHtvdmVyZmxvdy14OmhpZGRlbjtwYWRkaW5nOjEwcHggMTJweCAzMHB4O2dhcDo4cHg7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOm1pbm1heCgwLDFmcil9Ci5udC1pdGVte21pbi13aWR0aDowO3BhZGRpbmc6MTBweCAxMnB4O2dhcDo0cHg7Ym9yZGVyLWxlZnQtd2lkdGg6NHB4fQoubnQtdG9we2ZvbnQtc2l6ZToxMS41cHg7ZmxleC13cmFwOm5vd3JhcDttaW4td2lkdGg6MH0KLm50LW1re3BhZGRpbmc6MXB4IDhweDt3aGl0ZS1zcGFjZTpub3dyYXB9Ci5udC1zZWxsZXJ7d2hpdGUtc3BhY2U6bm93cmFwO292ZXJmbG93OmhpZGRlbjt0ZXh0LW92ZXJmbG93OmVsbGlwc2lzO21pbi13aWR0aDowfQoubnQtYWdve3doaXRlLXNwYWNlOm5vd3JhcDtmbGV4Om5vbmV9Ci5udC1tYWlue2dhcDoxMHB4O21pbi13aWR0aDowfQoubnQtaW1ne3dpZHRoOjUycHg7aGVpZ2h0OjUycHg7Ym9yZGVyLXJhZGl1czoxMHB4fQoubnQtcHJvZHttaW4td2lkdGg6MDtmb250LXNpemU6MTNweDtsaW5lLWhlaWdodDoxLjN9Ci5udC1wcm9kIHNwYW57ZGlzcGxheTotd2Via2l0LWJveDstd2Via2l0LWxpbmUtY2xhbXA6Mjstd2Via2l0LWJveC1vcmllbnQ6dmVydGljYWw7b3ZlcmZsb3c6aGlkZGVufQoubnQtcHJvZCBzbWFsbHtmb250LXNpemU6MTEuNXB4fQoubnQtcHJpY2V7Zm9udC1zaXplOjE3cHg7ZmxleDpub25lfQoubnQtaWR7Zm9udC1zaXplOjExcHg7d2hpdGUtc3BhY2U6bm93cmFwO292ZXJmbG93OmhpZGRlbjt0ZXh0LW92ZXJmbG93OmVsbGlwc2lzfQpAbWVkaWEgKG1heC13aWR0aDo3NjBweCl7Lm50LXBhbmVse3dpZHRoOjEwMHZ3fX0KLm50LWJsa3tkaXNwbGF5OmJsb2NrO2ZvbnQtc2l6ZToxMXB4O2NvbG9yOiNEQzI2MjY7b3BhY2l0eTouNzt0ZXh0LWRlY29yYXRpb246bGluZS10aHJvdWdoO3RleHQtZGVjb3JhdGlvbi1jb2xvcjojREMyNjI2O2ZvbnQtd2VpZ2h0OjUwMDt3aGl0ZS1zcGFjZTpub3dyYXA7b3ZlcmZsb3c6aGlkZGVuO3RleHQtb3ZlcmZsb3c6ZWxsaXBzaXN9Ci8qIEZpbHRyb3M6IEFnZW5jaWEgeSBGbGV4IHNlcGFyYWRvcyB5IGNvbiBzdSBjb2xvciAqLwouY2hpcC1ncnB7ZGlzcGxheTppbmxpbmUtZmxleDtnYXA6NnB4O3BhZGRpbmc6M3B4O2JvcmRlcjoxcHggZGFzaGVkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6OTk5cHh9Ci5jaGlwLmNoaXAtbWwtYWdlbmNpYXtib3JkZXItY29sb3I6IzJEMzI3Nztjb2xvcjojMkQzMjc3fQouY2hpcC5jaGlwLW1sLWFnZW5jaWFbYXJpYS1wcmVzc2VkPSJ0cnVlIl17YmFja2dyb3VuZDojMkQzMjc3O2NvbG9yOiNGRkU2MDA7Ym9yZGVyLWNvbG9yOiMyRDMyNzd9Ci5jaGlwLmNoaXAtbWwtZmxleHtib3JkZXItY29sb3I6IzAwQTY1MDtjb2xvcjojMDA4NDNGfQouY2hpcC5jaGlwLW1sLWZsZXhbYXJpYS1wcmVzc2VkPSJ0cnVlIl17YmFja2dyb3VuZDojMDBBNjUwO2NvbG9yOiNmZmY7Ym9yZGVyLWNvbG9yOiMwMEE2NTB9Ci5jaGlwLmNoaXAtZmF7Ym9yZGVyLWNvbG9yOiM4REM2M0Y7Y29sb3I6IzRGN0YxMn0KLmNoaXAuY2hpcC1mYVthcmlhLXByZXNzZWQ9InRydWUiXXtiYWNrZ3JvdW5kOiM4REM2M0Y7Y29sb3I6I2ZmZjtib3JkZXItY29sb3I6IzhEQzYzRn0KLmNoaXAuY2hpcC1wYXtib3JkZXItY29sb3I6IzBCNUVENztjb2xvcjojMEI1RUQ3fQouY2hpcC5jaGlwLXBhW2FyaWEtcHJlc3NlZD0idHJ1ZSJde2JhY2tncm91bmQ6IzBCNUVENztjb2xvcjojZmZmO2JvcmRlci1jb2xvcjojMEI1RUQ3fQovKiBSZXN1bWVuIGRlIHBhcXVldGVzOiB0YXJqZXRhcyBwb3IgY2FuYWwsIG3DoXMgbGVnaWJsZSAqLwouc3N4Mi1oZWFke2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7ZmxleC13cmFwOndyYXA7Z2FwOjZweCAxMnB4O21hcmdpbi1ib3R0b206MTBweH0KLnNzeDItaGVhZCAuc3N4LXR7Zm9udC1zaXplOjE0cHh9Ci5zc3gye2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDQsbWlubWF4KDAsMWZyKSkgbWlubWF4KDAsMS4yNWZyKSBtaW5tYXgoMCwxZnIpO2dhcDoxMHB4fQouc3N4Mi1je3Bvc2l0aW9uOnJlbGF0aXZlO2JhY2tncm91bmQ6I2ZmZjtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTJweDtwYWRkaW5nOjEwcHggMTJweCAxMHB4O292ZXJmbG93OmhpZGRlbjttaW4td2lkdGg6MH0KLnNzeDItYzo6YmVmb3Jle2NvbnRlbnQ6IiI7cG9zaXRpb246YWJzb2x1dGU7aW5zZXQ6MCAwIGF1dG8gMDtoZWlnaHQ6NHB4O2JhY2tncm91bmQ6dmFyKC0tYyx2YXIoLS1saW5lKSl9Ci5zc3gyLW57Zm9udC1zaXplOjEycHg7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOnZhcigtLW11dGVkKTt3aGl0ZS1zcGFjZTpub3dyYXA7b3ZlcmZsb3c6aGlkZGVuO3RleHQtb3ZlcmZsb3c6ZWxsaXBzaXN9Ci5zc3gyLXZ7Zm9udC1zaXplOjI4cHg7Zm9udC13ZWlnaHQ6ODAwO2xpbmUtaGVpZ2h0OjEuMTU7Y29sb3I6dmFyKC0taW5rKTtmb250LXZhcmlhbnQtbnVtZXJpYzp0YWJ1bGFyLW51bXM7bWFyZ2luOjJweCAwIDRweH0KLnNzeDItY3V0e2Rpc3BsYXk6aW5saW5lLWJsb2NrO2ZvbnQtc2l6ZToxMnB4O2NvbG9yOnZhcigtLWluayk7YmFja2dyb3VuZDpjb2xvci1taXgoaW4gc3JnYix2YXIoLS1jKSAxMiUsI2ZmZik7Ym9yZGVyLXJhZGl1czo5OTlweDtwYWRkaW5nOjJweCA5cHg7d2hpdGUtc3BhY2U6bm93cmFwfQouc3N4Mi1jdXQgYntmb250LXdlaWdodDo4MDB9Ci5zc3gyLWN1dC5ub25le2JhY2tncm91bmQ6I2YyZjRmNztjb2xvcjp2YXIoLS1tdXRlZCl9Ci5zc3gyLXRvdHstLWM6dmFyKC0tYWNjZW50KTtiYWNrZ3JvdW5kOmNvbG9yLW1peChpbiBzcmdiLHZhcigtLWFjY2VudCkgNSUsI2ZmZil9Ci5zc3gyLXRvdCAuc3N4Mi12e2NvbG9yOnZhcigtLWFjY2VudC1zdHJvbmcpfQouc3N4Mi1iYXJ7aGVpZ2h0OjZweDtib3JkZXItcmFkaXVzOjk5cHg7YmFja2dyb3VuZDojZThlZGYzO292ZXJmbG93OmhpZGRlbjttYXJnaW46MnB4IDAgNXB4fQouc3N4Mi1iYXIgaXtkaXNwbGF5OmJsb2NrO2hlaWdodDoxMDAlO2JhY2tncm91bmQ6dmFyKC0tYWNjZW50KTtib3JkZXItcmFkaXVzOjk5cHh9Ci5zc3gyLXN1Yntmb250LXNpemU6MTJweDtjb2xvcjp2YXIoLS1tdXRlZCk7d2hpdGUtc3BhY2U6bm93cmFwO292ZXJmbG93OmhpZGRlbjt0ZXh0LW92ZXJmbG93OmVsbGlwc2lzfQouc3N4Mi1zdWIgYntjb2xvcjp2YXIoLS1pbmspfQouc3N4Mi1hbGx7LS1jOiM5OEEyQjN9Ci5zc3gyLWFsbCAuc3N4Mi12e2NvbG9yOnZhcigtLW11dGVkKX0KQG1lZGlhIChtYXgtd2lkdGg6MTEwMHB4KXsuc3N4MntncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDMsbWlubWF4KDAsMWZyKSl9fQpAbWVkaWEgKG1heC13aWR0aDo2MjBweCl7LnNzeDJ7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgyLG1pbm1heCgwLDFmcikpO2dhcDo4cHh9LnNzeDItdntmb250LXNpemU6MjRweH0uc3N4Mi1oZWFkIC5zc3gtcnttYXJnaW4tbGVmdDowfX0KLyogdGFibGEgcG9yIGN1ZW50YTogZW5jYWJlemFkb3MgY29uIGVsIGNvbG9yIGRlIGNhZGEgY2FuYWwgKi8KLnNzLXRhYmxlIHRoLnNzLWdycHtib3JkZXItYm90dG9tOjNweCBzb2xpZCB2YXIoLS1nYyx2YXIoLS1saW5lKSl9CkBtZWRpYSAobWF4LXdpZHRoOjYyMHB4KXsuc3N4Mi1zdWJ7d2hpdGUtc3BhY2U6bm9ybWFsfX0KLyogdmVyc2nDs24gY29tcGFjdGE6IHRhcmpldGFzIGNoaWNhcyBlbiB1bmEgbMOtbmVhICovCi5zc3gyLWhlYWR7bWFyZ2luLWJvdHRvbTo2cHh9Ci5zc3gyLWhlYWQgLnNzeC10e2ZvbnQtc2l6ZToxM3B4fQouc3N4MntkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7Z2FwOjZweH0KLnNzeDItY3tkaXNwbGF5OmdyaWQ7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOmF1dG8gYXV0bztncmlkLXRlbXBsYXRlLWFyZWFzOiJuIHYiICJ4IHgiO2FsaWduLWl0ZW1zOmNlbnRlcjtjb2x1bW4tZ2FwOjhweDtyb3ctZ2FwOjFweDtwYWRkaW5nOjVweCAxMHB4IDVweCAxMnB4O2JvcmRlci1yYWRpdXM6OXB4O2ZsZXg6MCAxIGF1dG99Ci5zc3gyLWM6OmJlZm9yZXtpbnNldDowIGF1dG8gMCAwO3dpZHRoOjRweDtoZWlnaHQ6YXV0b30KLnNzeDItbntncmlkLWFyZWE6bjtmb250LXNpemU6MTEuNXB4fQouc3N4Mi12e2dyaWQtYXJlYTp2O2ZvbnQtc2l6ZToxN3B4O21hcmdpbjowO2p1c3RpZnktc2VsZjplbmQ7bGluZS1oZWlnaHQ6MS4xfQouc3N4Mi1jdXQsLnNzeDItc3Vie2dyaWQtYXJlYTp4O2ZvbnQtc2l6ZToxMXB4O3BhZGRpbmc6MDtiYWNrZ3JvdW5kOm5vbmUhaW1wb3J0YW50O3doaXRlLXNwYWNlOm5vd3JhcH0KLnNzeDItY3V0Lm5vbmV7Y29sb3I6dmFyKC0tbXV0ZWQpfQouc3N4Mi1iYXJ7ZGlzcGxheTpub25lfQouc3N4Mi10b3QsLnNzeDItYWxse21hcmdpbi1sZWZ0OjB9CkBtZWRpYSAobWF4LXdpZHRoOjExMDBweCl7LnNzeDJ7ZGlzcGxheTpmbGV4fX0KQG1lZGlhIChtYXgtd2lkdGg6NjIwcHgpey5zc3gye2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDIsbWlubWF4KDAsMWZyKSk7Z2FwOjVweH0uc3N4Mi12e2ZvbnQtc2l6ZToxNnB4fS5zc3gyLWN7cGFkZGluZzo0cHggOHB4IDRweCAxMHB4fS5zc3gyLXN1Ynt3aGl0ZS1zcGFjZTpub3dyYXB9fQpAbWVkaWEgKG1heC13aWR0aDo2MjBweCl7LnNzeDItbntmb250LXNpemU6MTFweH19Ci8qIGHDum4gbcOhcyBjaGljbzogZGF0byBpbmZvcm1hdGl2byAqLwouc3N4Mi1oZWFke21hcmdpbi1ib3R0b206NHB4O2dhcDo0cHggMTBweH0KLnNzeDItaGVhZCAuc3N4LXR7Zm9udC1zaXplOjEycHh9Ci5zc3gyLWhlYWQgLnNzeC1tb3Jle2ZvbnQtc2l6ZToxMXB4O3BhZGRpbmc6MXB4IDNweH0KLnNzeDItaGVhZCAuc3N4LXN3IGJ1dHRvbntmb250LXNpemU6MTFweDtwYWRkaW5nOjJweCA3cHh9Ci5zc3gye2dhcDo0cHh9Ci5zc3gyLWN7cGFkZGluZzoycHggN3B4IDJweCA5cHg7Ym9yZGVyLXJhZGl1czo3cHg7Y29sdW1uLWdhcDo2cHg7cm93LWdhcDowfQouc3N4Mi1jOjpiZWZvcmV7d2lkdGg6M3B4fQouc3N4Mi1ue2ZvbnQtc2l6ZToxMC41cHh9Ci5zc3gyLXZ7Zm9udC1zaXplOjEzcHh9Ci5zc3gyLWN1dCwuc3N4Mi1zdWJ7Zm9udC1zaXplOjEwcHh9CkBtZWRpYSAobWF4LXdpZHRoOjYyMHB4KXsuc3N4MntnYXA6M3B4fS5zc3gyLXZ7Zm9udC1zaXplOjEyLjVweH0uc3N4Mi1ue2ZvbnQtc2l6ZToxMHB4fS5zc3gyLWN7cGFkZGluZzoycHggNnB4IDJweCA4cHh9fQpAbWVkaWEgKG1heC13aWR0aDo2MjBweCl7LnNzeDJ7ZGlzcGxheTpmbGV4O2ZsZXgtd3JhcDp3cmFwfS5zc3gyLWN7ZmxleDoxIDEgYXV0b319CkBtZWRpYSAobWF4LXdpZHRoOjYyMHB4KXsuc3N4Mi1je2ZsZXg6MCAxIGF1dG99fQovKiBQYXF1ZXRlczogc29sbyDDrWNvbm9zLCB1bmEgbMOtbmVhICovCi5zc3gyLWhlYWR7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtmbGV4LXdyYXA6d3JhcDtnYXA6NHB4IDhweDttYXJnaW4tYm90dG9tOjB9Ci5zc3gyLWhlYWQgLnNzeC10e2ZvbnQtc2l6ZToxMS41cHg7Zm9udC13ZWlnaHQ6ODAwO2NvbG9yOnZhcigtLW11dGVkKX0KLnNzeDN7ZGlzcGxheTppbmxpbmUtZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6M3B4O2FsaWduLWl0ZW1zOmNlbnRlcn0KLnNzeDMtY3tkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmJhc2VsaW5lO2dhcDozcHg7Zm9udC1zaXplOjExcHg7bGluZS1oZWlnaHQ6MTtwYWRkaW5nOjNweCA2cHggM3B4IDVweDtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1sZWZ0OjNweCBzb2xpZCB2YXIoLS1jLHZhcigtLWxpbmUpKTtib3JkZXItcmFkaXVzOjZweDtiYWNrZ3JvdW5kOiNmZmY7d2hpdGUtc3BhY2U6bm93cmFwO2N1cnNvcjpkZWZhdWx0fQouc3N4My1jIGJ7Zm9udC1zaXplOjEycHg7Zm9udC13ZWlnaHQ6ODAwO2NvbG9yOnZhcigtLWluayk7Zm9udC12YXJpYW50LW51bWVyaWM6dGFidWxhci1udW1zfQouc3N4My1jIHNtYWxse2ZvbnQtc2l6ZTo5LjVweDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5zc3gzLXRvdHstLWM6dmFyKC0tYWNjZW50KX0uc3N4My10b3QgYntjb2xvcjp2YXIoLS1hY2NlbnQtc3Ryb25nKX0KLnNzeDMtYWxsey0tYzojOThBMkIzfS5zc3gzLWFsbCBie2NvbG9yOnZhcigtLW11dGVkKX0KQG1lZGlhIChtYXgtd2lkdGg6NjIwcHgpey5zc3gyLWhlYWQgLnNzeC1ye21hcmdpbi1sZWZ0OjB9LnNzeDMtY3twYWRkaW5nOjJweCA1cHggMnB4IDRweH19Ci8qIENhbGN1bGFkb3IgZGUgZ2FuYW5jaWEgKi8KLnBmLWJhcntkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7Z2FwOjhweDthbGlnbi1pdGVtczpjZW50ZXI7bWFyZ2luLWJvdHRvbTo4cHh9Ci5wZi1iYXIgaW5wdXRbdHlwZT1zZWFyY2hde2ZsZXg6MSAxIDE4MHB4O21pbi13aWR0aDowO21heC13aWR0aDozMjBweH0KLnBmLXRhYnN7ZGlzcGxheTppbmxpbmUtZmxleDtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTBweDtvdmVyZmxvdzpoaWRkZW59Ci5wZi10YWJzIGJ1dHRvbntib3JkZXI6MDtiYWNrZ3JvdW5kOiNmZmY7cGFkZGluZzo2cHggMTJweDtmb250OmluaGVyaXQ7Zm9udC1zaXplOjEzcHg7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOnZhcigtLW11dGVkKTtjdXJzb3I6cG9pbnRlcjtkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NnB4fQoucGYtdGFicyBidXR0b25bYXJpYS1wcmVzc2VkPSJ0cnVlIl17YmFja2dyb3VuZDp2YXIoLS1hY2NlbnQpO2NvbG9yOiNmZmZ9Ci5wZi1zdW17Zm9udC1zaXplOjEyLjVweDtjb2xvcjp2YXIoLS1tdXRlZCk7bWFyZ2luOjJweCAycHggOHB4fQoucGYtc3VtIGJ7Y29sb3I6dmFyKC0taW5rKX0KLnBmLXN1bSAubmVne2NvbG9yOiNDNjI4Mjh9Ci5wZi13cmFwe21heC1oZWlnaHQ6NjIwcHg7b3ZlcmZsb3c6YXV0bztib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTBweH0KLnBmLXRhYmxle3dpZHRoOjEwMCU7Ym9yZGVyLWNvbGxhcHNlOmNvbGxhcHNlO2ZvbnQtc2l6ZToxMi41cHh9Ci5wZi10YWJsZSB0aHtwb3NpdGlvbjpzdGlja3k7dG9wOjA7YmFja2dyb3VuZDojRjZGOEZCO3otaW5kZXg6MTtmb250LXNpemU6MTFweDt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7bGV0dGVyLXNwYWNpbmc6LjAzZW07Y29sb3I6dmFyKC0tbXV0ZWQpO3BhZGRpbmc6N3B4IDhweDt0ZXh0LWFsaWduOmxlZnQ7d2hpdGUtc3BhY2U6bm93cmFwfQoucGYtdGFibGUgdGgubnVtLC5wZi10YWJsZSB0ZC5udW17dGV4dC1hbGlnbjpyaWdodH0KLnBmLXRhYmxlIHRke3BhZGRpbmc6NnB4IDhweDtib3JkZXItdG9wOjFweCBzb2xpZCB2YXIoLS1saW5lKTt2ZXJ0aWNhbC1hbGlnbjptaWRkbGU7d2hpdGUtc3BhY2U6bm93cmFwfQoucGYtdGFibGUgdGQgc21hbGx7ZGlzcGxheTpibG9jaztmb250LXNpemU6MTAuNXB4O2NvbG9yOnZhcigtLW11dGVkKTttYXJnaW4tdG9wOjFweH0KLnBmLXByb2R7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6OHB4O21pbi13aWR0aDoyMjBweDttYXgtd2lkdGg6MzYwcHg7d2hpdGUtc3BhY2U6bm9ybWFsfQoucGYtcHJvZCBpbWd7d2lkdGg6MzRweDtoZWlnaHQ6MzRweDtvYmplY3QtZml0OmNvdmVyO2JvcmRlci1yYWRpdXM6NnB4O2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7ZmxleDpub25lfQoucGYtcHJvZCBie2Rpc3BsYXk6LXdlYmtpdC1ib3g7LXdlYmtpdC1saW5lLWNsYW1wOjI7LXdlYmtpdC1ib3gtb3JpZW50OnZlcnRpY2FsO292ZXJmbG93OmhpZGRlbjtmb250LXdlaWdodDo2MDA7Zm9udC1zaXplOjEyLjVweDtsaW5lLWhlaWdodDoxLjI1fQoucGYtcHJvZCBzbWFsbHt3aGl0ZS1zcGFjZTpub3JtYWx9Ci5wZi1pbntmb250OmluaGVyaXQ7Zm9udC1zaXplOjEyLjVweDtwYWRkaW5nOjRweCA2cHg7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjZweDt0ZXh0LWFsaWduOnJpZ2h0O2JhY2tncm91bmQ6I0ZGRkRGNX0KLnBmLWluOmZvY3Vze291dGxpbmU6MnB4IHNvbGlkIHZhcigtLWFjY2VudCk7Ym9yZGVyLWNvbG9yOnZhcigtLWFjY2VudCl9Ci5wZi10YWJsZSB0ZCBzbWFsbCAucGYtaW57ZGlzcGxheTppbmxpbmUtYmxvY2s7cGFkZGluZzoxcHggNHB4O2ZvbnQtc2l6ZToxMXB4O21hcmdpbi10b3A6MnB4fQoucGYtcmVzIGJ7Zm9udC1zaXplOjEzLjVweH0KLnBmLXJvdy5vayAucGYtcmVzIGJ7Y29sb3I6IzFCN0YzQn0ucGYtcm93LmxvdyAucGYtcmVzIGJ7Y29sb3I6I0IyNkEwMH0ucGYtcm93Lm5lZyAucGYtcmVzIGJ7Y29sb3I6I0M2MjgyOH0KLnBmLXJvdy5uZWd7YmFja2dyb3VuZDojRkZGNUY1fQoucGYtbm90ZXtmb250LXNpemU6MTEuNXB4O21hcmdpbjoxMHB4IDJweCAwO2xpbmUtaGVpZ2h0OjEuNX0KLnBmLWVycntjb2xvcjojQjI2QTAwfQpAbWVkaWEgKG1heC13aWR0aDo2MjBweCl7LnBmLWJhciBpbnB1dFt0eXBlPXNlYXJjaF17bWF4LXdpZHRoOm5vbmV9LnBmLXByb2R7bWluLXdpZHRoOjE3MHB4fS5wZi10YWJsZXtmb250LXNpemU6MTJweH19Ci5wZi1sdHtkaXNwbGF5OmlubGluZS1ibG9jaztmb250LXNpemU6OS41cHg7Zm9udC13ZWlnaHQ6ODAwO3BhZGRpbmc6MCA1cHg7Ym9yZGVyLXJhZGl1czo0cHg7bGluZS1oZWlnaHQ6MTVweH0KLnBmLWx0LmNsYXtiYWNrZ3JvdW5kOiNGRkYzQzQ7Y29sb3I6IzdBNUIwMH0ucGYtbHQucHJve2JhY2tncm91bmQ6I0UzRUNGRjtjb2xvcjojMkQzMjc3fQovKiBjYWxjdWxhZG9yOiBwZXLDrW9kbyB5IHRvdGFsZXMgKi8KLnBmLXBlcntkaXNwbGF5OmZsZXg7ZmxleC13cmFwOndyYXA7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo2cHggOHB4O21hcmdpbjoycHggMCA4cHh9Ci5wZi1wZXItbHtmb250LXNpemU6MTJweDtmb250LXdlaWdodDo3MDA7Y29sb3I6dmFyKC0tbXV0ZWQpfQoucGYtcHRhYnMgYnV0dG9ue3BhZGRpbmc6NHB4IDEwcHg7Zm9udC1zaXplOjEycHh9Ci5wZi1wZXIgaW5wdXRbdHlwZT1tb250aF0sLnBmLXBlciBpbnB1dFt0eXBlPWRhdGVde3dpZHRoOmF1dG87cGFkZGluZzo0cHggOHB4O2ZvbnQtc2l6ZToxMi41cHh9Ci5wZi1wZXItZHtmb250LXNpemU6MTJweH0KLnBmLWtwaXN7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoNCxtaW5tYXgoMCwxZnIpKTtnYXA6OHB4O21hcmdpbi1ib3R0b206OHB4fQoucGYta3Bpcz5kaXZ7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjEwcHg7cGFkZGluZzo3cHggMTBweDtiYWNrZ3JvdW5kOiNmZmY7bWluLXdpZHRoOjB9Ci5wZi1rcGlzIHNtYWxse2Rpc3BsYXk6YmxvY2s7Zm9udC1zaXplOjExcHg7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtd2VpZ2h0OjcwMH0KLnBmLWtwaXMgYntmb250LXNpemU6MTdweDtmb250LXZhcmlhbnQtbnVtZXJpYzp0YWJ1bGFyLW51bXN9Ci5wZi1rcGlzIHNwYW57ZGlzcGxheTpibG9jaztmb250LXNpemU6MTAuNXB4O2NvbG9yOnZhcigtLW11dGVkKX0KLnBmLWtwaXMgLnBvcyBie2NvbG9yOiMxQjdGM0J9LnBmLWtwaXMgLm5lZyBie2NvbG9yOiNDNjI4Mjh9Ci5wZi10YWJsZSB0ZC5wZi10b3R7YmFja2dyb3VuZDojRkFGQ0ZGfQpAbWVkaWEgKG1heC13aWR0aDo2MjBweCl7LnBmLWtwaXN7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgyLG1pbm1heCgwLDFmcikpfS5wZi1rcGlzIGJ7Zm9udC1zaXplOjE1cHh9fQoucGYtcHRhYnN7bWF4LXdpZHRoOjEwMCU7b3ZlcmZsb3cteDphdXRvfS5wZi1wdGFicyBidXR0b257d2hpdGUtc3BhY2U6bm93cmFwfQoucGYtcmV0e21hcmdpbi10b3A6MTJweDtib3JkZXItdG9wOjFweCBkYXNoZWQgdmFyKC0tbGluZSk7cGFkZGluZy10b3A6MTBweH0KLnBmLXJldC1oe2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6NHB4IDEwcHg7YWxpZ24taXRlbXM6YmFzZWxpbmU7bWFyZ2luLWJvdHRvbTo2cHg7Zm9udC1zaXplOjEzcHh9Ci5wZi1yZXQtbWt7Zm9udC1zaXplOjExLjVweCFpbXBvcnRhbnQ7bGluZS1oZWlnaHQ6MS42O2NvbG9yOnZhcigtLWluaykhaW1wb3J0YW50fQoucGYtcmV0LW1rIC5kb3R7ZGlzcGxheTppbmxpbmUtYmxvY2s7d2lkdGg6OHB4O2hlaWdodDo4cHg7Ym9yZGVyLXJhZGl1czoycHg7bWFyZ2luLXJpZ2h0OjRweH0KLnBmLWtwaXMgLnBmLXJldC1tayBie2ZvbnQtc2l6ZToxMnB4fQoucGYtcmV0IC5wZi1rcGlze2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoNSxtaW5tYXgoMCwxZnIpKX0KLnBmLWtwaXMgc3BhbiBie2ZvbnQtc2l6ZTppbmhlcml0fQpAbWVkaWEgKG1heC13aWR0aDo5MDBweCl7LnBmLXJldCAucGYta3Bpc3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDMsbWlubWF4KDAsMWZyKSl9fQpAbWVkaWEgKG1heC13aWR0aDo2MjBweCl7LnBmLXJldCAucGYta3Bpc3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDIsbWlubWF4KDAsMWZyKSl9fQouc2FsZXMtcGVye21hcmdpbjo2cHggMCAxMHB4fQoucGYtcmV2e2JvcmRlcjoxcHggZGFzaGVkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6MTBweDtwYWRkaW5nOjhweCAxMHB4O21hcmdpbi10b3A6MnB4O2ZvbnQtc2l6ZToxMi41cHh9Ci5wZi1yZXYtcm93e2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6NnB4IDIycHg7bWFyZ2luLXRvcDo2cHg7YWxpZ24taXRlbXM6Y2VudGVyfQoucGYtcmV2LXJvdyBpbnB1dHtwYWRkaW5nOjNweCA4cHg7Zm9udC1zaXplOjEyLjVweH0KLnBmLWtwaXMgc3BhbitzcGFue21hcmdpbi10b3A6MnB4fQoucGYtcmV0IC5wZi1rcGlze2dyaWQtdGVtcGxhdGUtY29sdW1uczptaW5tYXgoMCwuOGZyKSBtaW5tYXgoMCwxZnIpIG1pbm1heCgwLDEuM2ZyKSBtaW5tYXgoMCwxLjZmcil9Ci5wZi1rcGlzIGIubmVnY3tjb2xvcjojQzYyODI4fQoucGYtcmV0LW1re2ZvbnQtc2l6ZToxMi41cHg7bGluZS1oZWlnaHQ6MS4zNTttYXJnaW4tdG9wOjRweH0KLnBmLXJldC1sb3N0e2NvbG9yOiNDNjI4Mjg7Zm9udC1zaXplOjEycHg7cGFkZGluZy1sZWZ0OjE0cHh9Ci5wZi1yZXQtbG9zdCBie2ZvbnQtc2l6ZToxMi41cHghaW1wb3J0YW50fQoucGYtcmV0LW1rIGJ7Zm9udC1zaXplOjEyLjVweH0KQG1lZGlhIChtYXgtd2lkdGg6OTAwcHgpey5wZi1yZXQgLnBmLWtwaXN7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgyLG1pbm1heCgwLDFmcikpfX0KQG1lZGlhIChtYXgtd2lkdGg6NjIwcHgpey5wZi1yZXQgLnBmLWtwaXN7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOm1pbm1heCgwLDFmcil9fQoud2FybnRhZ3tkaXNwbGF5OmlubGluZS1ibG9jaztiYWNrZ3JvdW5kOiNmZmY0ZDY7Y29sb3I6IzhhNWEwMDtmb250LXdlaWdodDo3MDA7Zm9udC1zaXplOjEycHg7Ym9yZGVyLXJhZGl1czo2cHg7cGFkZGluZzoycHggOHB4O21hcmdpbjoycHggMH0KLnRiLXdhcm4gLnRiLWlje2JhY2tncm91bmQ6I2ZmZjRkNjtjb2xvcjojOGE1YTAwfQoudGIudGItYWxlcnQgLnRiLWlje2FuaW1hdGlvbjp0YlB1bHNlIDEuNnMgZWFzZS1pbi1vdXQgaW5maW5pdGV9CkBrZXlmcmFtZXMgdGJQdWxzZXswJSwxMDAle3RyYW5zZm9ybTpzY2FsZSgxKX01MCV7dHJhbnNmb3JtOnNjYWxlKDEuMTIpfX0KQG1lZGlhIChwcmVmZXJzLXJlZHVjZWQtbW90aW9uOnJlZHVjZSl7LnRiLnRiLWFsZXJ0IC50Yi1pY3thbmltYXRpb246bm9uZX19Ci8qIGNvbnRyYXNlw7FhIGNvbiBib3TDs24gZGUgb2pvICovCi5wdy13cmFwe3Bvc2l0aW9uOnJlbGF0aXZlO2Rpc3BsYXk6YmxvY2t9Ci5wdy13cmFwIGlucHV0e3dpZHRoOjEwMCU7cGFkZGluZy1yaWdodDo0NHB4fQoucHctZXlle3Bvc2l0aW9uOmFic29sdXRlO3JpZ2h0OjZweDt0b3A6NTAlO3RyYW5zZm9ybTp0cmFuc2xhdGVZKC01MCUpO2JvcmRlcjowO2JhY2tncm91bmQ6dHJhbnNwYXJlbnQ7Y29sb3I6dmFyKC0tbXV0ZWQpO2N1cnNvcjpwb2ludGVyO3BhZGRpbmc6NnB4O2JvcmRlci1yYWRpdXM6OHB4O2Rpc3BsYXk6ZmxleH0KLnB3LWV5ZTpob3Zlcntjb2xvcjp2YXIoLS1hY2NlbnQpO2JhY2tncm91bmQ6dmFyKC0taWNlKX0KLyogcmVnaXN0cm8gKi8KLnJlZy1jdGF7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6NnB4O2FsaWduLWl0ZW1zOnN0cmV0Y2g7Ym9yZGVyLXRvcDoxcHggZGFzaGVkIHZhcigtLWxpbmUpO3BhZGRpbmctdG9wOjEycHg7bWFyZ2luLXRvcDo0cHg7dGV4dC1hbGlnbjpjZW50ZXI7Zm9udC1zaXplOjEzcHg7Y29sb3I6dmFyKC0tbXV0ZWQpfQoudHJpYWwtYmFye2JhY2tncm91bmQ6I0U4RjdFRTtjb2xvcjojMTQ1MzJEO2ZvbnQtd2VpZ2h0OjcwMDtwYWRkaW5nOjhweCAxNnB4O3RleHQtYWxpZ246Y2VudGVyO2ZvbnQtc2l6ZToxMy41cHh9Ci8qIG3Ds2R1bG9zIChpbnRlcnJ1cHRvcmVzKSAqLwoubW9kc3tkaXNwbGF5OmdyaWQ7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdChhdXRvLWZpbGwsbWlubWF4KDI4MHB4LDFmcikpO2dhcDoxMHB4fQoubW9ke2Rpc3BsYXk6ZmxleDtnYXA6MTJweDthbGlnbi1pdGVtczpjZW50ZXI7anVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW47Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjEycHg7cGFkZGluZzoxMHB4IDEycHg7YmFja2dyb3VuZDp2YXIoLS1zdXJmYWNlKTtjdXJzb3I6cG9pbnRlcn0KLm1vZC5vbntib3JkZXItY29sb3I6dmFyKC0tYWNjZW50KTtiYWNrZ3JvdW5kOnZhcigtLWljZSl9Ci5tb2QtdHtkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDoycHg7bWluLXdpZHRoOjB9Ci5tb2QtdCBzbWFsbHtjb2xvcjp2YXIoLS1tdXRlZCk7Zm9udC1zaXplOjEycHg7bGluZS1oZWlnaHQ6MS4zNX0KLnRnbHtwb3NpdGlvbjpyZWxhdGl2ZTtmbGV4OjAgMCBhdXRvO3dpZHRoOjQ2cHg7aGVpZ2h0OjI2cHh9Ci50Z2wgaW5wdXR7cG9zaXRpb246YWJzb2x1dGU7aW5zZXQ6MDtvcGFjaXR5OjA7bWFyZ2luOjA7Y3Vyc29yOnBvaW50ZXI7ei1pbmRleDoxfQoudGdsIGl7cG9zaXRpb246YWJzb2x1dGU7aW5zZXQ6MDtib3JkZXItcmFkaXVzOjk5cHg7YmFja2dyb3VuZDojQ0JENUUxO3RyYW5zaXRpb246YmFja2dyb3VuZCAuMnN9Ci50Z2wgaTo6YWZ0ZXJ7Y29udGVudDonJztwb3NpdGlvbjphYnNvbHV0ZTt0b3A6M3B4O2xlZnQ6M3B4O3dpZHRoOjIwcHg7aGVpZ2h0OjIwcHg7Ym9yZGVyLXJhZGl1czo1MCU7YmFja2dyb3VuZDojZmZmO2JveC1zaGFkb3c6MCAxcHggM3B4IHJnYmEoMCwwLDAsLjI1KTt0cmFuc2l0aW9uOnRyYW5zZm9ybSAuMnN9Ci50Z2wgaW5wdXQ6Y2hlY2tlZCtpe2JhY2tncm91bmQ6dmFyKC0tYWNjZW50KX0KLnRnbCBpbnB1dDpjaGVja2VkK2k6OmFmdGVye3RyYW5zZm9ybTp0cmFuc2xhdGVYKDIwcHgpfQoudGdsIGlucHV0OmZvY3VzLXZpc2libGUraXtvdXRsaW5lOjJweCBzb2xpZCB2YXIoLS1hY2NlbnQpO291dGxpbmUtb2Zmc2V0OjJweH0KLnRnbCBpbnB1dDpkaXNhYmxlZCtpe29wYWNpdHk6LjV9Ci5zcC1tb2RzIHRke2JvcmRlci10b3A6MCFpbXBvcnRhbnQ7cGFkZGluZy10b3A6MCFpbXBvcnRhbnQ7Zm9udC1zaXplOjEyLjVweH0KLnNwLW1vZHtkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NHB4O21hcmdpbjoycHggOHB4IDJweCAwO3BhZGRpbmc6M3B4IDlweDtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRpdXM6OTlweDtjdXJzb3I6cG9pbnRlcjtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5zcC1tb2Qub257Ym9yZGVyLWNvbG9yOnZhcigtLWFjY2VudCk7Y29sb3I6dmFyKC0taW5rKTtiYWNrZ3JvdW5kOnZhcigtLWljZSl9Ci5zcC1tb2QgaW5wdXR7bWFyZ2luOjB9Ci5uYXYgYnV0dG9ue3doaXRlLXNwYWNlOm5vd3JhcH0KQG1lZGlhIChtaW4td2lkdGg6OTAwcHgpIGFuZCAobWF4LXdpZHRoOjE0MDBweCl7Lm5hdiBidXR0b257cGFkZGluZzo3cHggMTFweH19Ci8qIE1pIHBsYW4gKi8KLnBsYW4tbm93e2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjJweDtwYWRkaW5nOjEwcHggMTJweDtib3JkZXItcmFkaXVzOjEycHg7YmFja2dyb3VuZDojRkZGNkUwO2NvbG9yOiM3QTRGMDB9Ci5wbGFuLW5vdy5va3tiYWNrZ3JvdW5kOiNFOEY3RUU7Y29sb3I6IzE0NTMyRH0ucGxhbi1ub3cuYmFke2JhY2tncm91bmQ6I0ZERTJFMjtjb2xvcjojOUIxQzFDfQoucGxhbi1ub3cgc3Bhbntmb250LXNpemU6MTNweH0KLnBsYW5ze2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KGF1dG8tZmlsbCxtaW5tYXgoMTgwcHgsMWZyKSk7Z2FwOjEwcHg7bWFyZ2luLXRvcDoxMnB4fQoucGxhbntkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDo0cHg7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjE0cHg7cGFkZGluZzoxMnB4O2JhY2tncm91bmQ6dmFyKC0tc3VyZmFjZSl9Ci5wbGFuLmN1cntib3JkZXItY29sb3I6dmFyKC0tb2spO2JveC1zaGFkb3c6MCAwIDAgMnB4ICNCQkY3RDAgaW5zZXR9Ci5wbGFuLXByaWNle2ZvbnQtc2l6ZToyMnB4O2ZvbnQtd2VpZ2h0OjgwMDtjb2xvcjp2YXIoLS1pbmspfS5wbGFuLXByaWNlIHNtYWxse2ZvbnQtc2l6ZToxMnB4O2ZvbnQtd2VpZ2h0OjYwMDtjb2xvcjp2YXIoLS1tdXRlZCl9Ci5wbGFuLW9yZGVyc3tmb250LXNpemU6MTIuNXB4O21hcmdpbjoycHggMCA2cHh9CiNwbFJvd3MgaW5wdXR7cGFkZGluZzo1cHggOHB4O2ZvbnQtc2l6ZToxM3B4fQojYmtQbGFuIC5wbGFuc3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KGF1dG8tZmlsbCxtaW5tYXgoMTUwcHgsMWZyKSl9Ci5zdG9yZS1vcHRze2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyIDFmcjtnYXA6OHB4IDEycHg7cGFkZGluZzoxMHB4O2JvcmRlcjoxcHggZGFzaGVkIHZhcigtLWxpbmUsI2RkZCk7Ym9yZGVyLXJhZGl1czoxMHB4fQouc3RvcmUtb3B0cyAuc3dpdGNoe2dyaWQtY29sdW1uOjEvLTF9CkBtZWRpYSAobWF4LXdpZHRoOjU2MHB4KXsuc3RvcmUtb3B0c3tncmlkLXRlbXBsYXRlLWNvbHVtbnM6MWZyfX0KLnNvb24tY2FyZCBzdW1tYXJ5e2N1cnNvcjpwb2ludGVyO3BhZGRpbmc6NHB4IDB9Ci5zb29uLWNhcmQgLmhvd3ttYXJnaW46OHB4IDB9Ci8qIGNvbnRyb2wgZGUgc3RvY2sgKi8KLm1vZC1sb2Nre29wYWNpdHk6LjZ9Lm1vZC1uYXtkaXNwbGF5OmlubGluZS1ibG9jazt3aGl0ZS1zcGFjZTpub3dyYXA7Zm9udC1zdHlsZTpub3JtYWw7Zm9udC1zaXplOjExcHg7Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOiM4YTVhMDA7YmFja2dyb3VuZDojZmZmM2Q2O2JvcmRlci1yYWRpdXM6NnB4O3BhZGRpbmc6MXB4IDZweDttYXJnaW4tbGVmdDo2cHh9Ci5ta3AtdGlsZS1zdG9jayBie2ZvbnQtc2l6ZToyMnB4fQouc3RvY2stYm94e2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjEycHh9Ci5zdGstbW9kZXtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDoxNHB4O2p1c3RpZnktY29udGVudDpzcGFjZS1iZXR3ZWVuO3BhZGRpbmc6MTJweCAxNnB4O2JvcmRlci1yYWRpdXM6MTRweDtib3JkZXI6MXB4IHNvbGlkICNlN2Q5YTg7YmFja2dyb3VuZDojZmZmYWYwfQouc3RrLW1vZGUubGl2ZXtib3JkZXItY29sb3I6I2JmZTZjYjtiYWNrZ3JvdW5kOiNlZmZhZjJ9LnN0ay1tb2RlIHNtYWxse2Rpc3BsYXk6YmxvY2s7Y29sb3I6dmFyKC0tbXV0ZWQsIzY2Nyk7Zm9udC1zaXplOjEyLjVweDttYXJnaW4tdG9wOjJweH0KLnRnbC1yb3d7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6OHB4O2ZvbnQtd2VpZ2h0OjcwMDt3aGl0ZS1zcGFjZTpub3dyYXB9Ci5zdGstYmFye2Rpc3BsYXk6ZmxleDtmbGV4LXdyYXA6d3JhcDtnYXA6OHB4O2FsaWduLWl0ZW1zOmNlbnRlcn0KLnN0ay10YWJsZSB0ZHt2ZXJ0aWNhbC1hbGlnbjptaWRkbGV9LnN0ay1pbnt3aWR0aDo4NHB4O3RleHQtYWxpZ246cmlnaHQ7Zm9udC13ZWlnaHQ6NzAwfS5zdGstaW4uc2F2ZWR7b3V0bGluZToycHggc29saWQgIzIzOTQ2QX0KLnN0ay1jaHtkaXNwbGF5OmlubGluZS1mbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6NXB4O2ZvbnQtc2l6ZToxMnB4O3BhZGRpbmc6MnB4IDhweDtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUsI2UzZThlZik7Ym9yZGVyLXJhZGl1czo5OTlweDttYXJnaW46MnB4IDJweCAycHggMDt3aGl0ZS1zcGFjZTpub3dyYXB9Ci5zdGstY2guZnVsbHtvcGFjaXR5Oi42fS5zdGstY2ggc21hbGx7Y29sb3I6dmFyKC0tbXV0ZWQsIzY2Nyl9Ci5zdGstZGlmZiB0ZHtiYWNrZ3JvdW5kOiNmZmZiZWF9LnN0ay13YXJue2NvbG9yOiNhMzViMDA7Zm9udC1zaXplOjEycHg7bWFyZ2luLWxlZnQ6NnB4fQouc3RrLXNlYyBzdW1tYXJ5e2N1cnNvcjpwb2ludGVyO3BhZGRpbmc6MTJweCAxNnB4fS5zdGstc2VjW29wZW5dIHN1bW1hcnl7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tbGluZSwjZTNlOGVmKX0KLnN0ay1jaHJvd3twYWRkaW5nOjRweCAwO2ZvbnQtc2l6ZToxM3B4fS5zdGstY2hyb3cgLm5lZ3tjb2xvcjojYzI0MTBjfS5zdGstY2hyb3cgLnBvc3tjb2xvcjojMTU4MDNkfQouc3RrLWJvZHN7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoYXV0by1maWxsLG1pbm1heCgyNjBweCwxZnIpKTtnYXA6MTBweH0KLnN0ay1ib2R7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6OHB4O3BhZGRpbmc6MTJweDtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUsI2UzZThlZik7Ym9yZGVyLXJhZGl1czoxMnB4fS5zdGstYm9kLm5ld3tib3JkZXItc3R5bGU6ZGFzaGVkfQouc3RrLXNlbHtkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDozcHg7Zm9udC1zaXplOjEzcHg7bWF4LWhlaWdodDoxNjBweDtvdmVyZmxvdzphdXRvfQouc3RrLXN0YXJ0IG9se21hcmdpbjo2cHggMCAwIDE4cHg7cGFkZGluZzowO2ZvbnQtc2l6ZToxMy41cHg7bGluZS1oZWlnaHQ6MS41NX0KLnN0ay1ib2RzLXN0e2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjhweH0K","app.js":"LyogRXRpcXVldGFIdWIg4oCUIGludGVyZmF6ICovCigoKSA9PiB7CmNvbnN0ICQgPSAocywgZWwgPSBkb2N1bWVudCkgPT4gZWwucXVlcnlTZWxlY3RvcihzKTsKY29uc3QgJCQgPSAocywgZWwgPSBkb2N1bWVudCkgPT4gWy4uLmVsLnF1ZXJ5U2VsZWN0b3JBbGwocyldOwpjb25zdCBlc2MgPSBzID0+IFN0cmluZyhzID8/ICcnKS5yZXBsYWNlKC9bJjw+IiddL2csIGMgPT4gKHsgJyYnOiAnJmFtcDsnLCAnPCc6ICcmbHQ7JywgJz4nOiAnJmd0OycsICciJzogJyZxdW90OycsICInIjogJyYjMzk7JyB9W2NdKSk7CmNvbnN0IE1LID0geyBtbDogJ01lcmNhZG8gTGlicmUnLCBmYTogJ0ZhbGFiZWxsYScsIHBhOiAnUGFyaXMnIH07CmNvbnN0IE1LX0lDT04gPSB7IG1sOiAn8J+foScsIGZhOiAn8J+bje+4jycsIHBhOiAn8J+XvCcgfTsKbGV0IENBVCA9IHt9OyAvLyBjYXTDoWxvZ28gZGUgY2FuYWxlcyBkZSB2ZW50YSAobG8gZW50cmVnYSBlbCBzZXJ2aWRvcikKLy8gY2FuYWxlcyBxdWUgdGllbmUgY29uZWN0YWRvcyBlbCBlc3BhY2lvIChvIGVsIHZlbmRlZG9yKTogc29sbyBlc29zIHNlIG11ZXN0cmFuIChzaW4gZ3LDoWZpY29zIHZhY8Otb3MpCmNvbnN0IE1LUyA9ICgpID0+IChtZSAmJiBBcnJheS5pc0FycmF5KG1lLm1rcykgPyBtZS5ta3MgOiBbJ21sJywgJ2ZhJywgJ3BhJ10pOwovLyBjYW5hbGVzIGEgbW9zdHJhciBlbiB1bmEgdmlzdGE6IGxvcyBjb25lY3RhZG9zICsgbG9zIHF1ZSBhcGFyZXpjYW4gZW4gbG9zIGRhdG9zCmNvbnN0IG1rTGlzdCA9ICguLi5oYXZlKSA9PiB7IGNvbnN0IGggPSBuZXcgU2V0KGhhdmUuZmxhdCgpLmZpbHRlcihCb29sZWFuKSk7IHJldHVybiBPYmplY3Qua2V5cyhNSykuZmlsdGVyKGsgPT4gTUtTKCkuaW5jbHVkZXMoaykgfHwgaC5oYXMoaykpOyB9OwpmdW5jdGlvbiBhcHBseUNhdGFsb2cobSkgewogIGlmICghbSB8fCAhbS5jYXRhbG9nKSByZXR1cm47CiAgQ0FUID0gbS5jYXRhbG9nOwogIGxldCBjc3MgPSAnJzsKICBmb3IgKGNvbnN0IFtrLCB2XSBvZiBPYmplY3QuZW50cmllcyhDQVQpKSB7CiAgICBpZiAodi5zb29uKSBjb250aW51ZTsKICAgIE1LW2tdID0gdi5uYW1lOyBNS19DT0xPUltrXSA9IHYuY29sb3I7IE1LX0lDT05ba10gPSB2Lmljb247CiAgICBpZiAoIVsnbWwnLCAnZmEnLCAncGEnXS5pbmNsdWRlcyhrKSkgY3NzICs9IGAubWsuJHtrfXtiYWNrZ3JvdW5kOiR7di5jb2xvcn0yMjtjb2xvcjoke3YuY29sb3J9fS5jaGF0LXNoaXAubGF0ZS1tay0ke2t9e2JhY2tncm91bmQ6JHt2LmNvbG9yfTE4O2NvbG9yOiR7di5jb2xvcn07Ym9yZGVyLWNvbG9yOiR7di5jb2xvcn01NX0ubWtwLW1rZG90cyBpLiR7a317YmFja2dyb3VuZDoke3YuY29sb3J9fWA7CiAgfQogIGxldCBzdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdta0NzcycpOyBpZiAoIXN0KSB7IHN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3R5bGUnKTsgc3QuaWQgPSAnbWtDc3MnOyBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0KTsgfQogIHN0LnRleHRDb250ZW50ID0gY3NzOwp9CmNvbnN0IFNUQVRFID0geyByZWFkeTogJ0V0aXF1ZXRhIHBvciBpbXByaW1pcicsIHdhaXRpbmc6ICdFc3BlcmFuZG8gZXRpcXVldGEnLCBibG9ja2VkOiAnQmxvcXVlYWRhJywgcHJpbnRlZDogJ0V0aXF1ZXRhIGltcHJlc2EnLCBzaGlwcGVkOiAnRW52aWFkYScsIGVycm9yOiAnRXJyb3IgZW4gZXRpcXVldGEnLCBjYW5jZWxsZWQ6ICdDYW5jZWxhZGEnIH07CmNvbnN0IHN0b3JlID0geyBnZXQoaywgZCkgeyB0cnkgeyBjb25zdCB2ID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2VoOicgKyBrKTsgcmV0dXJuIHYgPT0gbnVsbCA/IGQgOiBKU09OLnBhcnNlKHYpOyB9IGNhdGNoIHsgcmV0dXJuIGQ7IH0gfSwgc2V0KGssIHYpIHsgdHJ5IHsgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2VoOicgKyBrLCBKU09OLnN0cmluZ2lmeSh2KSk7IH0gY2F0Y2gge30gfSB9OwoKY29uc3QgSSA9IHsKICBsb2NrOiAnPHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjIuMiI+PHJlY3QgeD0iNSIgeT0iMTEiIHdpZHRoPSIxNCIgaGVpZ2h0PSIxMCIgcng9IjIiLz48cGF0aCBkPSJNOCAxMVY4YTQgNCAwIDAxOCAwdjMiLz48L3N2Zz4nLAogIGNoZWNrOiAnPHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjMiPjxwYXRoIGQ9Ik01IDEybDUgNSA5LTEwIi8+PC9zdmc+JywKICBwcmludDogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyLjIiPjxwYXRoIGQ9Ik03IDlWM2gxMHY2TTcgMTdINHYtN2gxNnY3aC0zIi8+PHJlY3QgeD0iNyIgeT0iMTQiIHdpZHRoPSIxMCIgaGVpZ2h0PSI3Ii8+PC9zdmc+JywKICBjbG9jazogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyLjIiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjkiLz48cGF0aCBkPSJNMTIgN3Y1bDMgMiIvPjwvc3ZnPicsCiAgd2FybjogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyLjIiPjxwYXRoIGQ9Ik0xMiAzbDEwIDE4SDJ6Ii8+PHBhdGggZD0iTTEyIDEwdjVNMTIgMTh2LjUiLz48L3N2Zz4nLAogIGRvd246ICc8c3ZnIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMi40Ij48cGF0aCBkPSJNMTIgNHYxMW0wIDBsLTUtNW01IDVsNS01TTUgMjBoMTQiLz48L3N2Zz4nLAogIHN5bmM6ICc8c3ZnIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMi4yIj48cGF0aCBkPSJNMjAgMTFhOCA4IDAgMDAtMTQuOS0zTTQgNXY0aDRNNCAxM2E4IDggMCAwMDE0LjkgM00yMCAxOXYtNGgtNCIvPjwvc3ZnPicsCiAgeDogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiB3aWR0aD0iMTQiIGhlaWdodD0iMTQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjIuNiI+PHBhdGggZD0iTTYgNmwxMiAxMk0xOCA2TDYgMTgiLz48L3N2Zz4nLAogIGJveDogJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIj48cmVjdCB4PSIzIiB5PSI0IiB3aWR0aD0iMTgiIGhlaWdodD0iMTYiIHJ4PSIzIi8+PHBhdGggZD0iTTMgOWgxOCIvPjwvc3ZnPicsCn07CmNvbnN0IHBpbGxJY29uID0geyBzaGlwcGVkOiBJLmNoZWNrLCByZWFkeTogSS5jaGVjaywgYmxvY2tlZDogSS5sb2NrLCBwcmludGVkOiBJLnByaW50LCB3YWl0aW5nOiBJLmNsb2NrLCBlcnJvcjogSS53YXJuLCBjYW5jZWxsZWQ6IEkueCB9OwoKbGV0IG1lID0gbnVsbCwgdGFiID0gbnVsbCwgb3JkZXJzID0gW10sIHNlbGxlcnMgPSBbXSwgc2VsZWN0ZWQgPSBuZXcgU2V0KCksIGtub3duUmVhZHkgPSBuZXcgU2V0KCksIGZpcnN0TG9hZCA9IHRydWU7CmNvbnN0IHVpID0geyBicGY6ICdhbGwnLCBiZGY6ICdhbGwnLCB1ZGY6ICdhbGwnLCB1YmY6ICdhbGwnLCBiYmY6ICdhbGwnLCBzaGlwRGF5OiAndG9kYXknLCB0YWI6ICd0b2RheScsIG1rOiAnYWxsJywgc2VsbGVyczogbmV3IFNldCgpLCBxOiAnJywgYWRtaW5TZWxsZXI6IHN0b3JlLmdldCgnYWRtaW5TZWxsZXInLCBudWxsKSB9OwoKZnVuY3Rpb24gdG9hc3QobXNnLCBtcyA9IDI4MDApIHsgY29uc3QgdCA9ICQoJyN0b2FzdCcpOyB0LnRleHRDb250ZW50ID0gbXNnOyB0LmhpZGRlbiA9IGZhbHNlOyBjbGVhclRpbWVvdXQodC5fdCk7IHQuX3QgPSBzZXRUaW1lb3V0KCgpID0+IHQuaGlkZGVuID0gdHJ1ZSwgbXMpOyB9Ci8vIE1pZW50cmFzIGxhIGFwcCBzZSBhY3R1YWxpemEgKHVub3Mgc2VndW5kb3MgYWwgcHVibGljYXIgdW5hIHZlcnNpw7NuIG51ZXZhKSBlbCBzZXJ2aWRvciByZXNwb25kZSA1MDMgInVwZGF0aW5nIjoKLy8gc2UgZXNwZXJhIHkgc2UgcmVpbnRlbnRhIHNvbGEsIGFzw60gbmFkYSBkZSBsbyBxdWUgaGFnYXMgc2UgcGllcmRlLgphc3luYyBmdW5jdGlvbiBzYWZlRmV0Y2gocGF0aCwgb3B0cykgewogIGNvbnN0IHQwID0gRGF0ZS5ub3coKTsgbGV0IHdhcm5lZCA9IGZhbHNlOwogIGZvciAoOzspIHsKICAgIGxldCByZXM7CiAgICB0cnkgeyByZXMgPSBhd2FpdCBmZXRjaChwYXRoLCBvcHRzKTsgfQogICAgY2F0Y2ggKGUpIHsgaWYgKERhdGUubm93KCkgLSB0MCA+IDE4MGUzKSB0aHJvdyBuZXcgRXJyb3IoJ1NpbiBjb25leGnDs24gY29uIGxhIGFwcCwgaW50ZW50YSBkZSBudWV2bycpOyBhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgNDAwMCkpOyBjb250aW51ZTsgfQogICAgaWYgKHJlcy5zdGF0dXMgPT09IDUwMyAmJiByZXMuaGVhZGVycy5nZXQoJ3gtZWgtdXBkYXRpbmcnKSAmJiBEYXRlLm5vdygpIC0gdDAgPCAxODBlMykgewogICAgICBpZiAoIXdhcm5lZCkgeyB3YXJuZWQgPSB0cnVlOyB0cnkgeyB0b2FzdCgnTGEgYXBwIHNlIGVzdMOhIGFjdHVhbGl6YW5kb+KApiB0dSBhY2Npw7NuIHNlIGhhcsOhIHNvbGEgZW4gdW5vcyBzZWd1bmRvcycsIDYwMDApOyB9IGNhdGNoIHt9IH0KICAgICAgYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDQwMDApKTsgY29udGludWU7CiAgICB9CiAgICByZXR1cm4gcmVzOwogIH0KfQphc3luYyBmdW5jdGlvbiBhcGkocGF0aCwgb3B0cyA9IHt9KSB7CiAgY29uc3QgcmVzID0gYXdhaXQgc2FmZUZldGNoKHBhdGgsIHsgY3JlZGVudGlhbHM6ICdzYW1lLW9yaWdpbicsIC4uLm9wdHMsIGhlYWRlcnM6IHsgJ2NvbnRlbnQtdHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJywgLi4uKG9wdHMuaGVhZGVycyB8fCB7fSkgfSwgYm9keTogb3B0cy5ib2R5ICYmIHR5cGVvZiBvcHRzLmJvZHkgIT09ICdzdHJpbmcnID8gSlNPTi5zdHJpbmdpZnkob3B0cy5ib2R5KSA6IG9wdHMuYm9keSB9KTsKICBpZiAocmVzLnN0YXR1cyA9PT0gNDAxICYmICFwYXRoLmluY2x1ZGVzKCcvbG9naW4nKSkgeyBtZSA9IG51bGw7IHJlbmRlckxvZ2luKCk7IHRocm93IG5ldyBFcnJvcignU2VzacOzbiB2ZW5jaWRhJyk7IH0KICBjb25zdCBjdCA9IHJlcy5oZWFkZXJzLmdldCgnY29udGVudC10eXBlJykgfHwgJyc7CiAgaWYgKHJlcy5zdGF0dXMgPT09IDQwMikgeyBjb25zdCBlID0gY3QuaW5jbHVkZXMoJ2pzb24nKSA/IChhd2FpdCByZXMuanNvbigpKS5lcnJvciA6ICcnOyByZW5kZXJCbG9ja2VkKGUpOyB0aHJvdyBuZXcgRXJyb3IoZSB8fCAnUGxhbiB2ZW5jaWRvJyk7IH0KICBpZiAoIXJlcy5vaykgeyBjb25zdCBlID0gY3QuaW5jbHVkZXMoJ2pzb24nKSA/IChhd2FpdCByZXMuanNvbigpKS5lcnJvciA6IGF3YWl0IHJlcy50ZXh0KCk7IHRocm93IG5ldyBFcnJvcihlIHx8ICdFcnJvcicpOyB9CiAgcmV0dXJuIGN0LmluY2x1ZGVzKCdqc29uJykgPyByZXMuanNvbigpIDogcmVzOwp9Ci8vIHJlaW50ZW50YSBzb2xvIGN1YW5kbyBmYWxsYSBsYSBjb25leGnDs24gbyBlbCBzZXJ2aWRvciBlc3TDoSBvY3VwYWRvICg1eHgpLCBubyBjdWFuZG8gZXMgdW4gZXJyb3IgcmVhbCAoNHh4KQphc3luYyBmdW5jdGlvbiBhcGlSZXRyeShwYXRoLCBvcHRzID0ge30sIHRyaWVzID0gNCkgewogIGZvciAobGV0IGkgPSAwOyA7IGkrKykgewogICAgdHJ5IHsKICAgICAgY29uc3QgcmVzID0gYXdhaXQgc2FmZUZldGNoKHBhdGgsIHsgY3JlZGVudGlhbHM6ICdzYW1lLW9yaWdpbicsIC4uLm9wdHMsIGhlYWRlcnM6IHsgJ2NvbnRlbnQtdHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9LCBib2R5OiBvcHRzLmJvZHkgJiYgdHlwZW9mIG9wdHMuYm9keSAhPT0gJ3N0cmluZycgPyBKU09OLnN0cmluZ2lmeShvcHRzLmJvZHkpIDogb3B0cy5ib2R5IH0pOwogICAgICBjb25zdCBjdCA9IHJlcy5oZWFkZXJzLmdldCgnY29udGVudC10eXBlJykgfHwgJyc7CiAgICAgIGlmIChyZXMuc3RhdHVzID09PSA0MDEpIHsgbWUgPSBudWxsOyByZW5kZXJMb2dpbigpOyB0aHJvdyBPYmplY3QuYXNzaWduKG5ldyBFcnJvcignU2VzacOzbiB2ZW5jaWRhJyksIHsgZmluYWw6IHRydWUgfSk7IH0KICAgICAgaWYgKHJlcy5vaykgcmV0dXJuIGN0LmluY2x1ZGVzKCdqc29uJykgPyByZXMuanNvbigpIDogcmVzOwogICAgICBjb25zdCBlID0gY3QuaW5jbHVkZXMoJ2pzb24nKSA/IChhd2FpdCByZXMuanNvbigpLmNhdGNoKCgpID0+ICh7fSkpKS5lcnJvciA6ICcnOwogICAgICBpZiAocmVzLnN0YXR1cyA8IDUwMCB8fCBpID49IHRyaWVzIC0gMSkgdGhyb3cgT2JqZWN0LmFzc2lnbihuZXcgRXJyb3IoZSB8fCAnRWwgc2Vydmlkb3Igbm8gcmVzcG9uZGnDsywgaW50ZW50YSBkZSBudWV2bycpLCB7IGZpbmFsOiB0cnVlIH0pOwogICAgfSBjYXRjaCAoZXJyKSB7IGlmIChlcnIuZmluYWwgfHwgaSA+PSB0cmllcyAtIDEpIHRocm93IGVycjsgfQogICAgYXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDgwMCAqIChpICsgMSkpKTsKICB9Cn0KLy8gbcOzZHVsb3MgZGVsIGVzcGFjaW8gKGZ1bGZpbGxtZW50LCBNS1AgRmxhc2gsIHZlbnRhcywgY2FsY3VsYWRvcmEsIGPDs2RpZ29zKTogc2kgbm8gdmllbmVuLCB0b2RvIHByZW5kaWRvCmNvbnN0IE0gPSBrID0+ICFtZSB8fCAhbWUuc3BhY2UgfHwgIW1lLnNwYWNlLm1vZHVsZXMgfHwgbWUuc3BhY2UubW9kdWxlc1trXSAhPT0gZmFsc2U7CmZ1bmN0aW9uIHNlbGxlclFTKCkgeyByZXR1cm4gbWUudXNlci5yb2xlID09PSAnYWRtaW4nICYmIHVpLmFkbWluU2VsbGVyID8gYD9zZWxsZXJfaWQ9JHt1aS5hZG1pblNlbGxlcn1gIDogJyc7IH0KZnVuY3Rpb24gZm10VGltZShzKSB7IGlmICghcykgcmV0dXJuICcnOyBjb25zdCBkID0gbmV3IERhdGUocy5pbmNsdWRlcygnVCcpID8gcyA6IHMucmVwbGFjZSgnICcsICdUJykgKyAnWicpOyByZXR1cm4gZC50b0xvY2FsZVN0cmluZygnZXMtQ0wnLCB7IGRheTogJzItZGlnaXQnLCBtb250aDogJzItZGlnaXQnLCBob3VyOiAnMi1kaWdpdCcsIG1pbnV0ZTogJzItZGlnaXQnIH0pOyB9CgovLyAtLS0tLS0tLS0tIGlsdXN0cmFjaW9uZXMgLS0tLS0tLS0tLQpjb25zdCBIRVJPX1NWRyA9IGA8c3ZnIHZpZXdCb3g9IjAgMCA1MjAgMjMwIiBhcmlhLWhpZGRlbj0idHJ1ZSI+CjxyZWN0IHdpZHRoPSI1MjAiIGhlaWdodD0iMjMwIiByeD0iMjYiIGZpbGw9InZhcigtLWJnMikiLz4KPGcgZm9udC1mYW1pbHk9IkJhbG9vIDIsIHNhbnMtc2VyaWYiIGZvbnQtd2VpZ2h0PSI4MDAiIGZvbnQtc2l6ZT0iMTQiIHRleHQtYW5jaG9yPSJtaWRkbGUiPgo8cmVjdCB4PSIyMiIgeT0iMjYiIHdpZHRoPSIxMTIiIGhlaWdodD0iNDQiIHJ4PSIxMiIgZmlsbD0idmFyKC0tbWwpIi8+PHRleHQgeD0iNzgiIHk9IjUzIiBmaWxsPSJ2YXIoLS1tbC1pbmspIj5NZXJjYWRvIExpYnJlPC90ZXh0Pgo8cmVjdCB4PSIyMiIgeT0iOTMiIHdpZHRoPSIxMTIiIGhlaWdodD0iNDQiIHJ4PSIxMiIgZmlsbD0idmFyKC0tZmEpIi8+PHRleHQgeD0iNzgiIHk9IjEyMCIgZmlsbD0idmFyKC0tZmEtaW5rKSI+RmFsYWJlbGxhPC90ZXh0Pgo8cmVjdCB4PSIyMiIgeT0iMTYwIiB3aWR0aD0iMTEyIiBoZWlnaHQ9IjQ0IiByeD0iMTIiIGZpbGw9InZhcigtLXBhKSIvPjx0ZXh0IHg9Ijc4IiB5PSIxODciIGZpbGw9IiNmZmYiPlBhcmlzPC90ZXh0PjwvZz4KPGcgc3Ryb2tlPSJ2YXIoLS1za3kpIiBzdHJva2Utd2lkdGg9IjMiIGZpbGw9Im5vbmUiIHN0cm9rZS1kYXNoYXJyYXk9IjYgNyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48cGF0aCBkPSJNMTM0IDQ4IEMgMTc1IDQ4LCAxNzUgMTE1LCAyMTAgMTE1Ii8+PHBhdGggZD0iTTEzNCAxMTUgSDIxMCIvPjxwYXRoIGQ9Ik0xMzQgMTgyIEMgMTc1IDE4MiwgMTc1IDExNSwgMjEwIDExNSIvPjwvZz4KPHJlY3QgeD0iMjEwIiB5PSI3MCIgd2lkdGg9IjEwNCIgaGVpZ2h0PSI5MCIgcng9IjIwIiBmaWxsPSJ2YXIoLS1hY2NlbnQpIi8+CjxyZWN0IHg9IjIyNiIgeT0iODgiIHdpZHRoPSI3MiIgaGVpZ2h0PSIxMiIgcng9IjYiIGZpbGw9IiNmZmYiIG9wYWNpdHk9Ii45Ii8+PHJlY3QgeD0iMjI2IiB5PSIxMDciIHdpZHRoPSI1MiIgaGVpZ2h0PSIxMCIgcng9IjUiIGZpbGw9IiNmZmYiIG9wYWNpdHk9Ii42Ii8+CjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDIzMiwxMjYpIj48cmVjdCB3aWR0aD0iMjIiIGhlaWdodD0iMjIiIHJ4PSI2IiBmaWxsPSIjZmZmIi8+PHBhdGggZD0iTTYgMTFsNCA0IDctOCIgc3Ryb2tlPSJ2YXIoLS1vaykiIHN0cm9rZS13aWR0aD0iMyIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9nPgo8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyNjQsMTI2KSI+PHJlY3Qgd2lkdGg9IjIyIiBoZWlnaHQ9IjIyIiByeD0iNiIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjYiIHk9IjEwIiB3aWR0aD0iMTAiIGhlaWdodD0iOCIgcng9IjIiIGZpbGw9InZhcigtLWxvY2spIi8+PHBhdGggZD0iTTggMTBWOGEzIDMgMCAwMTYgMHYyIiBzdHJva2U9InZhcigtLWxvY2spIiBzdHJva2Utd2lkdGg9IjIiIGZpbGw9Im5vbmUiLz48L2c+CjxwYXRoIGQ9Ik0zMTQgMTE1IEgzNTYiIHN0cm9rZT0idmFyKC0tc2t5KSIgc3Ryb2tlLXdpZHRoPSIzIiBzdHJva2UtZGFzaGFycmF5PSI2IDciIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8cGF0aCBkPSJNMzYyIDk4IEw0MjQgNzAgTDQ4NiA5OCBWMTc4IEgzNjIgWiIgZmlsbD0idmFyKC0tc3VyZmFjZSkiIHN0cm9rZT0idmFyKC0tbGluZSkiIHN0cm9rZS13aWR0aD0iMiIvPgo8cmVjdCB4PSIzODgiIHk9IjEyNCIgd2lkdGg9IjcyIiBoZWlnaHQ9IjU0IiByeD0iNCIgZmlsbD0idmFyKC0taWNlKSIvPgo8ZyBmaWxsPSJ2YXIoLS1za3kpIj48cmVjdCB4PSIzOTYiIHk9IjE0NCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjE2IiByeD0iMiIvPjxyZWN0IHg9IjQyNCIgeT0iMTQ0IiB3aWR0aD0iMjQiIGhlaWdodD0iMTYiIHJ4PSIyIi8+PHJlY3QgeD0iNDEwIiB5PSIxMzAiIHdpZHRoPSIyNCIgaGVpZ2h0PSIxNCIgcng9IjIiLz48L2c+CjxnIGNsYXNzPSJ0cnVjayI+PHJlY3QgeD0iMzcyIiB5PSIxODgiIHdpZHRoPSI1OCIgaGVpZ2h0PSIyNCIgcng9IjUiIGZpbGw9InZhcigtLWFjY2VudC1zdHJvbmcpIi8+PHBhdGggZD0iTTQzMCAxOTQgaDE4IGwxMCAxMCB2OCBoLTI4eiIgZmlsbD0idmFyKC0tYWNjZW50KSIvPjxjaXJjbGUgY3g9IjM4OCIgY3k9IjIxNCIgcj0iNiIgZmlsbD0idmFyKC0taW5rKSIvPjxjaXJjbGUgY3g9IjQ0NiIgY3k9IjIxNCIgcj0iNiIgZmlsbD0idmFyKC0taW5rKSIvPjwvZz48L3N2Zz5gOwpjb25zdCBFTVBUWV9TVkcgPSBgPHN2ZyB2aWV3Qm94PSIwIDAgMTQwIDEwMCIgYXJpYS1oaWRkZW49InRydWUiPjxyZWN0IHg9IjIwIiB5PSIzMCIgd2lkdGg9IjEwMCIgaGVpZ2h0PSI2MiIgcng9IjEwIiBmaWxsPSJ2YXIoLS1pY2UpIi8+PHBhdGggZD0iTTIwIDQ2aDEwMCIgc3Ryb2tlPSJ2YXIoLS1za3kpIiBzdHJva2Utd2lkdGg9IjMiLz48cmVjdCB4PSIzNiIgeT0iNTgiIHdpZHRoPSI0MCIgaGVpZ2h0PSI3IiByeD0iMy41IiBmaWxsPSJ2YXIoLS1za3kpIi8+PHJlY3QgeD0iMzYiIHk9IjcxIiB3aWR0aD0iMjYiIGhlaWdodD0iNyIgcng9IjMuNSIgZmlsbD0idmFyKC0tc2t5KSIgb3BhY2l0eT0iLjYiLz48Y2lyY2xlIGN4PSIxMDQiIGN5PSIyMiIgcj0iMTQiIGZpbGw9InZhcigtLW9rKSIvPjxwYXRoIGQ9Ik05NyAyMmw1IDUgOS0xMCIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjMuNCIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+YDsKY29uc3QgUlVMRV9TVkcgPSBgPHN2ZyB2aWV3Qm94PSIwIDAgMTMwIDgwIiBhcmlhLWhpZGRlbj0idHJ1ZSI+PHJlY3QgeD0iNCIgeT0iMTAiIHdpZHRoPSI3OCIgaGVpZ2h0PSI2MiIgcng9IjEwIiBmaWxsPSJ2YXIoLS1zdXJmYWNlKSIgc3Ryb2tlPSJ2YXIoLS1saW5lKSIgc3Ryb2tlLXdpZHRoPSIyIi8+PHJlY3QgeD0iMTQiIHk9IjIyIiB3aWR0aD0iNDQiIGhlaWdodD0iOCIgcng9IjQiIGZpbGw9InZhcigtLW9rKSIvPjxyZWN0IHg9IjE0IiB5PSIzNiIgd2lkdGg9IjQ0IiBoZWlnaHQ9IjgiIHJ4PSI0IiBmaWxsPSJ2YXIoLS1vaykiLz48cmVjdCB4PSIxNCIgeT0iNTAiIHdpZHRoPSI0NCIgaGVpZ2h0PSI4IiByeD0iNCIgZmlsbD0idmFyKC0tbG9jaykiLz48cGF0aCBkPSJNODggNDFoMTQiIHN0cm9rZT0idmFyKC0tbXV0ZWQpIiBzdHJva2Utd2lkdGg9IjIuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PHBhdGggZD0iTTk4IDM2bDUgNS01IDUiIHN0cm9rZT0idmFyKC0tbXV0ZWQpIiBzdHJva2Utd2lkdGg9IjIuNSIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PHJlY3QgeD0iMTA2IiB5PSIyOCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjI2IiByeD0iNSIgZmlsbD0idmFyKC0tbG9jaykiLz48cmVjdCB4PSIxMTEiIHk9IjQwIiB3aWR0aD0iMTAiIGhlaWdodD0iOSIgcng9IjIiIGZpbGw9IiNmZmYiLz48cGF0aCBkPSJNMTEzIDQwdi0zYTMgMyAwIDAxNiAwdjMiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSJub25lIi8+PC9zdmc+YDsKCi8vIC0tLS0tLS0tLS0gbG9naW4gLS0tLS0tLS0tLQpmdW5jdGlvbiByZW5kZXJMb2dpbihkZW1vKSB7CiAgJCgnI2FwcCcpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJsb2dpbiI+PGRpdiBjbGFzcz0iY2FyZCI+CiAgICA8ZGl2IGNsYXNzPSJhcnQiPiR7SEVST19TVkd9PC9kaXY+CiAgICA8Zm9ybSBpZD0ibG9naW5Gb3JtIj4KICAgICAgPGgxPkV0aXF1ZXRhSHViPC9oMT4KICAgICAgPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjAiPkV0aXF1ZXRhcyBkZSBNZXJjYWRvIExpYnJlLCBGYWxhYmVsbGEgeSBQYXJpcyBlbiB1bmEgc29sYSBiYW5kZWphLjwvcD4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5Db3JyZW88aW5wdXQgdHlwZT0iZW1haWwiIGlkPSJsRW1haWwiIGF1dG9jb21wbGV0ZT0idXNlcm5hbWUiIHJlcXVpcmVkPjwvbGFiZWw+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+Q29udHJhc2XDsWE8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJsUGFzcyIgYXV0b2NvbXBsZXRlPSJjdXJyZW50LXBhc3N3b3JkIiByZXF1aXJlZD48L2xhYmVsPgogICAgICA8ZGl2IGNsYXNzPSJlcnIiIGlkPSJsRXJyIj48L2Rpdj4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiPkVudHJhcjwvYnV0dG9uPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUiIHR5cGU9ImJ1dHRvbiIgaWQ9ImZvcmdvdCI+wr9PbHZpZGFzdGUgdHUgY29udHJhc2XDsWE/PC9idXR0b24+CiAgICAgIDxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9Im1hcmdpbjowO2ZvbnQtc2l6ZToxMi41cHg7dGV4dC1hbGlnbjpjZW50ZXIiPsK/VGllbmVzIHVuYSBjbGF2ZSBkZSByZXNwYWxkbyAoUlNQLeKApik/IEVzY3LDrWJlbGEgZW4gQ29udHJhc2XDsWEuPC9wPgogICAgICA8ZGl2IGNsYXNzPSJyZWctY3RhIj48c3Bhbj7Cv1R1IGVtcHJlc2EgYcO6biBubyB1c2EgRXRpcXVldGFIdWI/PC9zcGFuPjxidXR0b24gY2xhc3M9ImJ0biBidG4tZ2hvc3QiIHR5cGU9ImJ1dHRvbiIgaWQ9InRvUmVnaXN0ZXIiPkNyZWFyIGN1ZW50YSDCtyAxNCBkw61hcyBncmF0aXM8L2J1dHRvbj48L2Rpdj4KICAgICAgJHtkZW1vID8gJzxkaXYgY2xhc3M9ImRlbW8taGludCI+TW9kbyBkZW1vOiBlbnRyYSBjb24gPGI+Ym9kZWdhQGRlbW8uY2w8L2I+LCA8Yj52ZW5kZWRvcjFAZGVtby5jbDwvYj4gbyA8Yj5hZG1pbkBkZW1vLmNsPC9iPiwgY2xhdmUgPGI+ZGVtbzEyMzQ8L2I+LjwvZGl2PicgOiAnJ30KICAgIDwvZm9ybT48L2Rpdj48L2Rpdj5gOwogICQoJyNsb2dpbkZvcm0nKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4gewogICAgZS5wcmV2ZW50RGVmYXVsdCgpOwogICAgJCgnI2xFcnInKS50ZXh0Q29udGVudCA9ICcnOwogICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL2xvZ2luJywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBlbWFpbDogJCgnI2xFbWFpbCcpLnZhbHVlLCBwYXNzd29yZDogJCgnI2xQYXNzJykudmFsdWUgfSB9KTsgYm9vdCgpOyB9CiAgICBjYXRjaCAoZXJyKSB7ICQoJyNsRXJyJykudGV4dENvbnRlbnQgPSBlcnIubWVzc2FnZTsgfQogIH07CiAgJCgnI2ZvcmdvdCcpLm9uY2xpY2sgPSAoKSA9PiByZW5kZXJGb3Jnb3QoJCgnI2xFbWFpbCcpLnZhbHVlKTsKICAkKCcjdG9SZWdpc3RlcicpLm9uY2xpY2sgPSAoKSA9PiByZW5kZXJSZWdpc3RlcigpOwp9CgovLyBSZWdpc3RybyBkZSB1bmEgZW1wcmVzYSBudWV2YTogY3JlYSBzdSBlc3BhY2lvIGNvbiAxNCBkw61hcyBncmF0aXM7IHF1aWVuIHNlIHJlZ2lzdHJhIHF1ZWRhIGNvbW8gYWRtaW5pc3RyYWRvcgpmdW5jdGlvbiByZW5kZXJSZWdpc3RlcigpIHsKICAkKCcjYXBwJykuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9ImxvZ2luIj48ZGl2IGNsYXNzPSJjYXJkIj48ZGl2IGNsYXNzPSJhcnQiPiR7SEVST19TVkd9PC9kaXY+PGZvcm0gaWQ9InJlZ0Zvcm0iPgogICAgPGgxPkNyZWEgdHUgY3VlbnRhPC9oMT4KICAgIDxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9Im1hcmdpbjowIj5DZW50cmFsaXphIGxhcyBldGlxdWV0YXMsIHZlbnRhcyB5IG1lbnNhamVzIGRlIE1lcmNhZG8gTGlicmUsIEZhbGFiZWxsYSB5IFBhcmlzIGRlIHRvZGFzIHR1cyBlbXByZXNhcy4gPGI+MTQgZMOtYXMgZ3JhdGlzPC9iPiwgc2luIHRhcmpldGEuPC9wPgogICAgPGxhYmVsIGNsYXNzPSJmIj5Ob21icmUgZGUgdHUgZW1wcmVzYSB1IG9yZ2FuaXphY2nDs248aW5wdXQgdHlwZT0idGV4dCIgaWQ9InJDb21wYW55IiBhdXRvY29tcGxldGU9Im9yZ2FuaXphdGlvbiIgcmVxdWlyZWQgbWF4bGVuZ3RoPSI4MCI+PC9sYWJlbD4KICAgIDxsYWJlbCBjbGFzcz0iZiI+VHUgbm9tYnJlPGlucHV0IHR5cGU9InRleHQiIGlkPSJyTmFtZSIgYXV0b2NvbXBsZXRlPSJuYW1lIiByZXF1aXJlZCBtYXhsZW5ndGg9IjgwIj48L2xhYmVsPgogICAgPGxhYmVsIGNsYXNzPSJmIj5Db3JyZW88aW5wdXQgdHlwZT0iZW1haWwiIGlkPSJyRW1haWwiIGF1dG9jb21wbGV0ZT0iZW1haWwiIHJlcXVpcmVkPjwvbGFiZWw+CiAgICA8bGFiZWwgY2xhc3M9ImYiPldoYXRzQXBwIChvcGNpb25hbCk8aW5wdXQgdHlwZT0idGVsIiBpZD0iclBob25lIiBhdXRvY29tcGxldGU9InRlbCIgcGxhY2Vob2xkZXI9Iis1NiA5IDEyMzQgNTY3OCI+PC9sYWJlbD4KICAgIDxsYWJlbCBjbGFzcz0iZiI+Q29udHJhc2XDsWEgKG3DrW5pbW8gOCk8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJyUGFzcyIgYXV0b2NvbXBsZXRlPSJuZXctcGFzc3dvcmQiIG1pbmxlbmd0aD0iOCIgcmVxdWlyZWQ+PC9sYWJlbD4KICAgIDxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9Im1hcmdpbjowO2ZvbnQtc2l6ZToxMi41cHgiPlF1ZWRhcsOhcyBjb21vIDxiPmFkbWluaXN0cmFkb3I8L2I+IGRlIHR1IGVtcHJlc2E6IGRlc3B1w6lzIGFncmVnYXMgYSB0dSBlcXVpcG8geSBjb25lY3RhcyB0dXMgbWFya2V0cGxhY2VzLjwvcD4KICAgIDxkaXYgY2xhc3M9ImVyciIgaWQ9InJFcnIiPjwvZGl2PgogICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiPkNyZWFyIG1pIGN1ZW50YTwvYnV0dG9uPgogICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIiB0eXBlPSJidXR0b24iIGlkPSJyQmFjayI+WWEgdGVuZ28gY3VlbnRhPC9idXR0b24+CiAgPC9mb3JtPjwvZGl2PjwvZGl2PmA7CiAgJCgnI3JCYWNrJykub25jbGljayA9ICgpID0+IHJlbmRlckxvZ2luKCk7CiAgJCgnI3JlZ0Zvcm0nKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4gewogICAgZS5wcmV2ZW50RGVmYXVsdCgpOyAkKCcjckVycicpLnRleHRDb250ZW50ID0gJyc7CiAgICBjb25zdCBiID0gZS5zdWJtaXR0ZXI7IGlmIChiKSBiLmRpc2FibGVkID0gdHJ1ZTsKICAgIHRyeSB7CiAgICAgIGF3YWl0IGFwaSgnL2FwaS9yZWdpc3RlcicsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgY29tcGFueTogJCgnI3JDb21wYW55JykudmFsdWUsIG5hbWU6ICQoJyNyTmFtZScpLnZhbHVlLCBlbWFpbDogJCgnI3JFbWFpbCcpLnZhbHVlLCBwaG9uZTogJCgnI3JQaG9uZScpLnZhbHVlLCBwYXNzd29yZDogJCgnI3JQYXNzJykudmFsdWUgfSB9KTsKICAgICAgdG9hc3QoJ8KhQ3VlbnRhIGNyZWFkYSEgRW1waWV6YSBhZ3JlZ2FuZG8gdHVzIGVtcHJlc2FzIHkgY29uZWN0YW5kbyB0dXMgbWFya2V0cGxhY2VzLicsIDYwMDApOwogICAgICBzdG9yZS5zZXQoJ3RhYicsICdhZG1pbicpOyB0YWIgPSBudWxsOyBib290KCk7CiAgICB9IGNhdGNoIChlcnIpIHsgJCgnI3JFcnInKS50ZXh0Q29udGVudCA9IGVyci5tZXNzYWdlOyBpZiAoYikgYi5kaXNhYmxlZCA9IGZhbHNlOyB9CiAgfTsKfQoKLy8gQm90w7NuIGRlIG9qbyBlbiB0b2RvcyBsb3MgY2FtcG9zIGRlIGNvbnRyYXNlw7FhOiBtdWVzdHJhIHUgb2N1bHRhIGxvIHF1ZSBlc2NyaWJlcwpjb25zdCBFWUUgPSAnPHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMiIgYXJpYS1oaWRkZW49InRydWUiPjxwYXRoIGQ9Ik0yIDEyczMuNi03IDEwLTcgMTAgNyAxMCA3LTMuNiA3LTEwIDdTMiAxMiAyIDEyeiIvPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjMiLz48L3N2Zz4nOwpjb25zdCBFWUVfT0ZGID0gJzxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjIiIGFyaWEtaGlkZGVuPSJ0cnVlIj48cGF0aCBkPSJNMyAzbDE4IDE4Ii8+PHBhdGggZD0iTTEwLjYgNS4xQTEwLjQgMTAuNCAwIDAxMTIgNWM2LjQgMCAxMCA3IDEwIDdhMTcuNiAxNy42IDAgMDEtMy4yIDQuMU02LjYgNi42QzMuOCA4LjQgMiAxMiAyIDEyczMuNiA3IDEwIDdhOS43IDkuNyAwIDAwNS40LTEuNiIvPjxwYXRoIGQ9Ik05LjkgOS45YTMgMyAwIDAwNC4yIDQuMiIvPjwvc3ZnPic7CmZ1bmN0aW9uIGFkZEV5ZXMocm9vdCA9IGRvY3VtZW50KSB7CiAgcm9vdC5xdWVyeVNlbGVjdG9yQWxsKCdpbnB1dFt0eXBlPXBhc3N3b3JkXTpub3QoW2RhdGEtZXllXSknKS5mb3JFYWNoKGlucCA9PiB7CiAgICBpbnAuZGF0YXNldC5leWUgPSAnMSc7CiAgICBjb25zdCB3cmFwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpOyB3cmFwLmNsYXNzTmFtZSA9ICdwdy13cmFwJzsKICAgIGlucC5wYXJlbnROb2RlLmluc2VydEJlZm9yZSh3cmFwLCBpbnApOyB3cmFwLmFwcGVuZENoaWxkKGlucCk7CiAgICBjb25zdCBiID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7IGIudHlwZSA9ICdidXR0b24nOyBiLmNsYXNzTmFtZSA9ICdwdy1leWUnOyBiLmlubmVySFRNTCA9IEVZRTsgYi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCAnTW9zdHJhciBjb250cmFzZcOxYScpOyBiLnRhYkluZGV4ID0gLTE7CiAgICBiLm9uY2xpY2sgPSBlID0+IHsgZS5wcmV2ZW50RGVmYXVsdCgpOyBjb25zdCBzaG93ID0gaW5wLnR5cGUgPT09ICdwYXNzd29yZCc7IGlucC50eXBlID0gc2hvdyA/ICd0ZXh0JyA6ICdwYXNzd29yZCc7IGIuaW5uZXJIVE1MID0gc2hvdyA/IEVZRV9PRkYgOiBFWUU7IGIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgc2hvdyA/ICdPY3VsdGFyIGNvbnRyYXNlw7FhJyA6ICdNb3N0cmFyIGNvbnRyYXNlw7FhJyk7IGlucC5mb2N1cygpOyB9OwogICAgd3JhcC5hcHBlbmRDaGlsZChiKTsKICB9KTsKfQpuZXcgTXV0YXRpb25PYnNlcnZlcigoKSA9PiBhZGRFeWVzKCkpLm9ic2VydmUoZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSB9KTsKCi8vIFJlY3VwZXJhciBjb250cmFzZcOxYTogY29ycmVvIC0+IGPDs2RpZ28gZGUgNiBkw61naXRvcyAtPiBlbnRyYXIgbyBjYW1iaWFyIGNvbnRyYXNlw7FhCmZ1bmN0aW9uIHJlbmRlckZvcmdvdChwcmVmaWxsID0gJycpIHsKICBsZXQgZW1haWwgPSBwcmVmaWxsLCBjb2RlID0gJyc7CiAgY29uc3Qgc2hlbGwgPSBpbm5lciA9PiB7ICQoJyNhcHAnKS5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz0ibG9naW4iPjxkaXYgY2xhc3M9ImNhcmQiPjxkaXYgY2xhc3M9ImFydCI+JHtIRVJPX1NWR308L2Rpdj48Zm9ybSBpZD0iZkZvcm0iPiR7aW5uZXJ9PGRpdiBjbGFzcz0iZXJyIiBpZD0iZkVyciI+PC9kaXY+PC9mb3JtPjwvZGl2PjwvZGl2PmA7IH07CiAgY29uc3QgYmFjayA9ICgpID0+IHsgY29uc3QgYiA9ICQoJyNmQmFjaycpOyBpZiAoYikgYi5vbmNsaWNrID0gKCkgPT4gcmVuZGVyTG9naW4oKTsgfTsKICBjb25zdCBlcnIgPSBtID0+IHsgJCgnI2ZFcnInKS50ZXh0Q29udGVudCA9IG07IH07CiAgZnVuY3Rpb24gc3RlcEVtYWlsKCkgewogICAgc2hlbGwoYDxoMT5SZWN1cGVyYXIgYWNjZXNvPC9oMT48cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJtYXJnaW46MCI+RXNjcmliZSB0dSBjb3JyZW8geSB0ZSBlbnZpYXJlbW9zIHVuIGPDs2RpZ28gZGUgNiBkw61naXRvcy48L3A+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+Q29ycmVvPGlucHV0IHR5cGU9ImVtYWlsIiBpZD0iZkVtYWlsIiBhdXRvY29tcGxldGU9InVzZXJuYW1lIiByZXF1aXJlZCB2YWx1ZT0iJHtlc2MoZW1haWwpfSI+PC9sYWJlbD4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiPkVudmlhciBjw7NkaWdvPC9idXR0b24+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIiB0eXBlPSJidXR0b24iIGlkPSJmQmFjayI+Vm9sdmVyPC9idXR0b24+YCk7CiAgICBiYWNrKCk7CiAgICAkKCcjZkZvcm0nKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4gewogICAgICBlLnByZXZlbnREZWZhdWx0KCk7IGVtYWlsID0gJCgnI2ZFbWFpbCcpLnZhbHVlLnRyaW0oKTsKICAgICAgY29uc3QgYiA9IGUuc3VibWl0dGVyOyBpZiAoYikgYi5kaXNhYmxlZCA9IHRydWU7CiAgICAgIHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9wYXNzd29yZC9mb3Jnb3QnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGVtYWlsIH0gfSk7IHN0ZXBDb2RlKCk7IH0KICAgICAgY2F0Y2ggKHgpIHsgZXJyKHgubWVzc2FnZSk7IGlmIChiKSBiLmRpc2FibGVkID0gZmFsc2U7IH0KICAgIH07CiAgfQogIGZ1bmN0aW9uIHN0ZXBDb2RlKCkgewogICAgc2hlbGwoYDxoMT5SZXZpc2EgdHUgY29ycmVvPC9oMT48cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJtYXJnaW46MCI+U2kgPGI+JHtlc2MoZW1haWwpfTwvYj4gZXN0w6EgcmVnaXN0cmFkbywgdGUgbGxlZ8OzIHVuIGPDs2RpZ28gZGUgNiBkw61naXRvcy4gVmVuY2UgZW4gMTUgbWludXRvcy4gUmV2aXNhIHRhbWJpw6luIGxhIGNhcnBldGEgZGUgc3BhbS48L3A+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+Q8OzZGlnbzxpbnB1dCB0eXBlPSJ0ZXh0IiBpZD0iZkNvZGUiIGlucHV0bW9kZT0ibnVtZXJpYyIgYXV0b2NvbXBsZXRlPSJvbmUtdGltZS1jb2RlIiBtYXhsZW5ndGg9IjYiIHBhdHRlcm49IlswLTldezZ9IiByZXF1aXJlZCBzdHlsZT0iZm9udC1mYW1pbHk6dmFyKC0tbW9ubyk7Zm9udC1zaXplOjI0cHg7bGV0dGVyLXNwYWNpbmc6OHB4O3RleHQtYWxpZ246Y2VudGVyIj48L2xhYmVsPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIHR5cGU9InN1Ym1pdCI+Q29udGludWFyPC9idXR0b24+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSIgdHlwZT0iYnV0dG9uIiBpZD0iZlJlc2VuZCI+RW52aWFyIG90cm8gY8OzZGlnbzwvYnV0dG9uPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSIgdHlwZT0iYnV0dG9uIiBpZD0iZkJhY2siPlZvbHZlcjwvYnV0dG9uPmApOwogICAgYmFjaygpOwogICAgJCgnI2ZDb2RlJykuZm9jdXMoKTsKICAgICQoJyNmUmVzZW5kJykub25jbGljayA9IGFzeW5jICgpID0+IHsgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL3Bhc3N3b3JkL2ZvcmdvdCcsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgZW1haWwgfSB9KTsgdG9hc3QoJ0PDs2RpZ28gcmVlbnZpYWRvJyk7IH0gY2F0Y2ggKHgpIHsgZXJyKHgubWVzc2FnZSk7IH0gfTsKICAgICQoJyNmRm9ybScpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICAgIGUucHJldmVudERlZmF1bHQoKTsgY29kZSA9ICQoJyNmQ29kZScpLnZhbHVlLnRyaW0oKTsKICAgICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL3Bhc3N3b3JkL2NoZWNrJywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBlbWFpbCwgY29kZSB9IH0pOyBzdGVwQ2hvb3NlKCk7IH0KICAgICAgY2F0Y2ggKHgpIHsgZXJyKHgubWVzc2FnZSk7IH0KICAgIH07CiAgfQogIGZ1bmN0aW9uIHN0ZXBDaG9vc2UoKSB7CiAgICBzaGVsbChgPGgxPkPDs2RpZ28gY29ycmVjdG88L2gxPjxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9Im1hcmdpbjowIj7Cv1F1w6kgcXVpZXJlcyBoYWNlcj88L3A+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgdHlwZT0iYnV0dG9uIiBpZD0iZkxvZ2luIj5FbnRyYXIgYWhvcmE8L2J1dHRvbj4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1naG9zdCIgdHlwZT0iYnV0dG9uIiBpZD0iZkNoYW5nZSI+Q2FtYmlhciBtaSBjb250cmFzZcOxYTwvYnV0dG9uPmApOwogICAgJCgnI2ZMb2dpbicpLm9uY2xpY2sgPSBhc3luYyAoKSA9PiB7IHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9wYXNzd29yZC9sb2dpbicsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgZW1haWwsIGNvZGUgfSB9KTsgYm9vdCgpOyB9IGNhdGNoICh4KSB7IGVycih4Lm1lc3NhZ2UpOyB9IH07CiAgICAkKCcjZkNoYW5nZScpLm9uY2xpY2sgPSBzdGVwTmV3OwogIH0KICBmdW5jdGlvbiBzdGVwTmV3KCkgewogICAgc2hlbGwoYDxoMT5OdWV2YSBjb250cmFzZcOxYTwvaDE+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+TnVldmEgY29udHJhc2XDsWEgKG3DrW5pbW8gOCk8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJmUDEiIGF1dG9jb21wbGV0ZT0ibmV3LXBhc3N3b3JkIiBtaW5sZW5ndGg9IjgiIHJlcXVpcmVkPjwvbGFiZWw+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+UmVww610ZWxhPGlucHV0IHR5cGU9InBhc3N3b3JkIiBpZD0iZlAyIiBhdXRvY29tcGxldGU9Im5ldy1wYXNzd29yZCIgbWlubGVuZ3RoPSI4IiByZXF1aXJlZD48L2xhYmVsPgogICAgICA8bGFiZWwgY2xhc3M9InN3aXRjaCIgc3R5bGU9ImZvbnQtc2l6ZToxM3B4Ij48aW5wdXQgdHlwZT0iY2hlY2tib3giIGlkPSJmU2hvdyI+IE1vc3RyYXIgY29udHJhc2XDsWE8L2xhYmVsPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIHR5cGU9InN1Ym1pdCI+R3VhcmRhciB5IGVudHJhcjwvYnV0dG9uPmApOwogICAgJCgnI2ZTaG93Jykub25jaGFuZ2UgPSBlID0+IHsgJCgnI2ZQMScpLnR5cGUgPSAkKCcjZlAyJykudHlwZSA9IGUudGFyZ2V0LmNoZWNrZWQgPyAndGV4dCcgOiAncGFzc3dvcmQnOyB9OwogICAgJCgnI2ZGb3JtJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpOwogICAgICBpZiAoJCgnI2ZQMScpLnZhbHVlICE9PSAkKCcjZlAyJykudmFsdWUpIHJldHVybiBlcnIoJ0xhcyBjb250cmFzZcOxYXMgbm8gY29pbmNpZGVuJyk7CiAgICAgIHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9wYXNzd29yZC9yZXNldCcsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgZW1haWwsIGNvZGUsIHBhc3N3b3JkOiAkKCcjZlAxJykudmFsdWUgfSB9KTsgdG9hc3QoJ0NvbnRyYXNlw7FhIGFjdHVhbGl6YWRhJyk7IGJvb3QoKTsgfQogICAgICBjYXRjaCAoeCkgeyBlcnIoeC5tZXNzYWdlKTsgfQogICAgfTsKICB9CiAgc3RlcEVtYWlsKCk7Cn0KCmZ1bmN0aW9uIHJlbmRlclNldHVwKCkgewogICQoJyNhcHAnKS5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz0ibG9naW4iPjxkaXYgY2xhc3M9ImNhcmQiPgogICAgPGRpdiBjbGFzcz0iYXJ0Ij4ke0hFUk9fU1ZHfTwvZGl2PgogICAgPGZvcm0gaWQ9InNldHVwRm9ybSI+CiAgICAgIDxoMT5CaWVudmVuaWRvPC9oMT4KICAgICAgPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjAiPkNyZWEgbGEgY3VlbnRhIGRlIGFkbWluaXN0cmFkb3IuIENvbiBlbGxhIGFncmVnYXMgdmVuZGVkb3JlcywgdXN1YXJpb3MgeSBsYSBjb25leGnDs24gYSBNZXJjYWRvIExpYnJlLjwvcD4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5UdSBub21icmU8aW5wdXQgdHlwZT0idGV4dCIgaWQ9InNOYW1lIiByZXF1aXJlZD48L2xhYmVsPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPkNvcnJlbzxpbnB1dCB0eXBlPSJlbWFpbCIgaWQ9InNFbWFpbCIgYXV0b2NvbXBsZXRlPSJ1c2VybmFtZSIgcmVxdWlyZWQ+PC9sYWJlbD4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5Db250cmFzZcOxYSAobcOtbmltbyA4KTxpbnB1dCB0eXBlPSJwYXNzd29yZCIgaWQ9InNQYXNzIiBhdXRvY29tcGxldGU9Im5ldy1wYXNzd29yZCIgbWlubGVuZ3RoPSI4IiByZXF1aXJlZD48L2xhYmVsPgogICAgICA8bGFiZWwgY2xhc3M9InN3aXRjaCIgc3R5bGU9ImZvbnQtc2l6ZToxM3B4Ij48aW5wdXQgdHlwZT0iY2hlY2tib3giIGlkPSJzU2hvdyI+IE1vc3RyYXIgY29udHJhc2XDsWE8L2xhYmVsPgogICAgICA8ZGl2IGNsYXNzPSJlcnIiIGlkPSJzRXJyIj48L2Rpdj4KICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiPkNyZWFyIGFkbWluaXN0cmFkb3I8L2J1dHRvbj4KICAgIDwvZm9ybT48L2Rpdj48L2Rpdj5gOwogICQoJyNzU2hvdycpLm9uY2hhbmdlID0gZSA9PiB7ICQoJyNzUGFzcycpLnR5cGUgPSBlLnRhcmdldC5jaGVja2VkID8gJ3RleHQnIDogJ3Bhc3N3b3JkJzsgfTsKICAkKCcjc2V0dXBGb3JtJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgIGUucHJldmVudERlZmF1bHQoKTsKICAgIHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9zZXR1cCcsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgbmFtZTogJCgnI3NOYW1lJykudmFsdWUsIGVtYWlsOiAkKCcjc0VtYWlsJykudmFsdWUsIHBhc3N3b3JkOiAkKCcjc1Bhc3MnKS52YWx1ZSB9IH0pOyBib290KCk7IH0KICAgIGNhdGNoIChlcnIpIHsgJCgnI3NFcnInKS50ZXh0Q29udGVudCA9IGVyci5tZXNzYWdlOyB9CiAgfTsKfQoKLy8gLS0tLS0tLS0tLSBlc3RydWN0dXJhIC0tLS0tLS0tLS0KZnVuY3Rpb24gdGFic0Zvcihyb2xlKSB7CiAgLy8gbGFzIHNlY2Npb25lcyBkZXBlbmRlbiBkZSBsb3MgbcOzZHVsb3MgcHJlbmRpZG9zIGVuIGVsIGVzcGFjaW8gKFVzdWFyaW9zIHkgYWp1c3RlcyDigLogTcOzZHVsb3MpCiAgY29uc3Qgb24gPSAoW2tdKSA9PiAoayAhPT0gJ21rcCcgfHwgTSgnbWtwJykgfHwgTSgnc3RvY2snKSkgJiYgKGsgIT09ICdzYWxlcycgfHwgTSgnc2FsZXMnKSB8fCBNKCdwcm9maXQnKSkgJiYgKGsgIT09ICd1bml0cycgfHwgTSgnZnVsZmlsbG1lbnQnKSkgJiYgKGsgIT09ICdjb2RlcycgfHwgTSgnY29kZXMnKSk7CiAgY29uc3QgZmYgPSBNKCdmdWxmaWxsbWVudCcpOwogIGlmIChyb2xlID09PSAnc2VsbGVyJykgcmV0dXJuIFtbJ3RyYXknLCAnTWlzIGV0aXF1ZXRhcyddLCBbJ21rcCcsICdNS1AgRmxhc2gnXSwgWydzYWxlcycsICdBbsOhbGlzaXMgdmVudGFzJ10sIFsndW5pdHMnLCAnUHJvdmVlZG9yIEZ1bGZpbGxtZW50J10sIFsnc2VsbGVyJywgJ01pIGN1ZW50YSddXS5maWx0ZXIob24pOwogIGlmIChyb2xlID09PSAnYWdlbmNpYScpIHJldHVybiBbWydjb2RlcycsICdDw7NkaWdvcyBkZSBkZXZvbHVjacOzbiddXTsKICBpZiAocm9sZSA9PT0gJ2Z1bGZpbGxtZW50JykgcmV0dXJuIFtbJ3RyYXknLCAnQmFuZGVqYSBkZSBldGlxdWV0YXMnXSwgWyd1bml0cycsICdQcm92ZWVkb3IgRnVsZmlsbG1lbnQnXSwgWydzZWxsZXJzVmlldycsICdWZW5kZWRvcmVzJ11dOwogIHJldHVybiBbWyd0cmF5JywgJ0JhbmRlamEnXSwgWydta3AnLCAnTUtQIEZsYXNoJ10sIFsnc2FsZXMnLCAnQW7DoWxpc2lzIHZlbnRhcyddLCBbJ3VuaXRzJywgJ1Byb3ZlZWRvciBGdWxmaWxsbWVudCddLCBbJ3NlbGxlcicsIGZmID8gJ1ZlbmRlZG9yZXMnIDogJ0VtcHJlc2FzJ10sIFsnYWRtaW4nLCAnVXN1YXJpb3MgeSBhanVzdGVzJ10sIC4uLihtZS5vd25lciA/IFtbJ2Nsb3VkJywgJ+KYge+4jyBOdWJlIGRlIGVtcHJlc2FzJ11dIDogW10pXS5maWx0ZXIob24pOwp9Ci8vIFBsYW4gdmVuY2lkbyBvIHN1c3BlbmRpZG86IHBhbnRhbGxhIGNvbiBlbCBhdmlzbyAoZWwgZHVlw7FvIGRlIGxhIGFwcCBwdWVkZSBleHRlbmRlciBlbCBwbGF6bykKZnVuY3Rpb24gcmVuZGVyQmxvY2tlZChtc2cpIHsKICAkKCcjYXBwJykuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9ImxvZ2luIj48ZGl2IGNsYXNzPSJjYXJkIj48ZGl2IGNsYXNzPSJhcnQiPiR7SEVST19TVkd9PC9kaXY+PGRpdiBjbGFzcz0ic3RhY2siIHN0eWxlPSJwYWRkaW5nOjI0cHgiPgogICAgPGgxPiR7ZXNjKG1lPy5zcGFjZT8ubmFtZSB8fCAnRXRpcXVldGFIdWInKX08L2gxPgogICAgPHAgc3R5bGU9Im1hcmdpbjowO2ZvbnQtc2l6ZToxNnB4Ij48Yj4ke2VzYyhtc2cgfHwgJ1R1IHBydWViYSBncmF0aXMgdGVybWluw7MuJyl9PC9iPjwvcD4KICAgIDxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9Im1hcmdpbjowIj5UdXMgZGF0b3MsIGNvbmV4aW9uZXMgeSBldGlxdWV0YXMgcXVlZGFuIGd1YXJkYWRvcy4gQXBlbmFzIHNlIGFjdGl2ZSB0dSBwbGFuLCB0b2RvIHZ1ZWx2ZSBhIGZ1bmNpb25hciBpZ3VhbC48L3A+CiAgICAke21lPy51c2VyPy5yb2xlID09PSAnYWRtaW4nID8gJzxkaXYgaWQ9ImJrUGxhbiI+PC9kaXY+JyA6ICc8cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJtYXJnaW46MCI+UMOtZGVsZSBhbCBhZG1pbmlzdHJhZG9yIGRlIHR1IGVtcHJlc2EgcXVlIGFjdGl2ZSBlbCBwbGFuLjwvcD4nfQogICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIiBpZD0iYmtPdXQiPlNhbGlyPC9idXR0b24+PC9kaXY+PC9kaXY+PC9kaXY+YDsKICBpZiAoJCgnI2JrUGxhbicpKSBkcmF3TXlQbGFuKCQoJyNia1BsYW4nKSwgdHJ1ZSkudGhlbigoKSA9PiB7IGlmIChuZXcgVVJMU2VhcmNoUGFyYW1zKGxvY2F0aW9uLnNlYXJjaCkuZ2V0KCdwYWdvJykpIHsgaGlzdG9yeS5yZXBsYWNlU3RhdGUobnVsbCwgJycsICcvJyk7IH0gfSk7CiAgJCgnI2JrT3V0Jykub25jbGljayA9IGFzeW5jICgpID0+IHsgYXdhaXQgZmV0Y2goJy9hcGkvbG9nb3V0JywgeyBtZXRob2Q6ICdQT1NUJyB9KS5jYXRjaCgoKSA9PiB7fSk7IGxvY2F0aW9uLnJlbG9hZCgpOyB9Owp9CmZ1bmN0aW9uIHJlbmRlclNoZWxsKCkgewogIGNvbnN0IHRhYnMgPSB0YWJzRm9yKG1lLnVzZXIucm9sZSk7CiAgaWYgKCF0YWIgfHwgIXRhYnMuc29tZSh0ID0+IHRbMF0gPT09IHRhYikpIHRhYiA9IHN0b3JlLmdldCgndGFiJywgdGFic1swXVswXSk7CiAgaWYgKCF0YWJzLnNvbWUodCA9PiB0WzBdID09PSB0YWIpKSB0YWIgPSB0YWJzWzBdWzBdOwogICQoJyNhcHAnKS5pbm5lckhUTUwgPSBgCiAgPGhlYWRlciBjbGFzcz0idG9wIj48ZGl2IGNsYXNzPSJ3cmFwIj4KICAgIDxhIGNsYXNzPSJicmFuZCIgaHJlZj0iLyI+PGltZyBzcmM9Ii9sb2dvLnN2ZyIgYWx0PSIiPkV0aXF1ZXRhSHViPC9hPgogICAgJHt0YWJzLmxlbmd0aCA+IDEgPyBgPG5hdiBjbGFzcz0ibmF2Ij4ke3RhYnMubWFwKChbaywgbl0pID0+IGA8YnV0dG9uIGRhdGEtdGFiPSIke2t9IiBhcmlhLWN1cnJlbnQ9IiR7ayA9PT0gdGFifSI+JHtufTwvYnV0dG9uPmApLmpvaW4oJycpfTwvbmF2PmAgOiAnJ30KICAgIDxzcGFuIGNsYXNzPSJzcGFjZXIiPjwvc3Bhbj4KICAgICR7bWUudXNlci5yb2xlID09PSAnYWdlbmNpYScgPyAnJyA6IGA8c3BhbiBjbGFzcz0ibGl2ZSIgaWQ9ImxpdmUiPjxpPjwvaT48c3Bhbj5Db25lY3RhbmRv4oCmPC9zcGFuPjwvc3Bhbj4KICAgIDxkaXYgY2xhc3M9ImNsb2NrIiBpZD0iY2xvY2siPiR7SS5jbG9jay5yZXBsYWNlKCc8c3ZnJywgJzxzdmcgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBzdHlsZT0iY29sb3I6dmFyKC0tYWNjZW50KSInKX08ZGl2PjxzbWFsbD5Db3J0ZSAke2VzYyhtZS5jdXRvZmYpfTwvc21hbGw+PGIgaWQ9ImNkIj4tLTotLTotLTwvYj48L2Rpdj48L2Rpdj5gfQogICAgJHttZS51c2VyLnJvbGUgPT09ICdhZ2VuY2lhJyA/ICcnIDogYDxidXR0b24gY2xhc3M9InVuZG8tYnRuIiBpZD0idW5kb0J0biIgZGlzYWJsZWQ+PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3IiIHN0cm9rZS13aWR0aD0iMi40IiBhcmlhLWhpZGRlbj0idHJ1ZSI+PHBhdGggZD0iTTkgMTRMNCA5bDUtNSIvPjxwYXRoIGQ9Ik00IDloMTBhNiA2IDAgMDEwIDEyaC0zIi8+PC9zdmc+PHNwYW4+PGI+RGVzaGFjZXI8L2I+PHNtYWxsPk5hZGEgcXVlIGRlc2hhY2VyPC9zbWFsbD48L3NwYW4+PC9idXR0b24+YH0KICAgIDxkaXYgY2xhc3M9InVzZXIiPjxkaXY+PGI+JHtlc2MobWUuc2VsbGVyPy5uYW1lIHx8IG1lLnVzZXIubmFtZSl9PC9iPjxzbWFsbD4ke2VzYyhtZS51c2VyLmVtYWlsKX08L3NtYWxsPjwvZGl2PjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGlkPSJteUFjYyI+TWkgY2xhdmU8L2J1dHRvbj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBpZD0ibG9nb3V0Ij5TYWxpcjwvYnV0dG9uPjwvZGl2PgogIDwvZGl2PjwvaGVhZGVyPgogIDxtYWluIGNsYXNzPSJ3cmFwIiBpZD0ibWFpbiI+PC9tYWluPmA7CiAgJCQoJy5uYXYgYnV0dG9uJykuZm9yRWFjaChiID0+IGIub25jbGljayA9ICgpID0+IHsgdGFiID0gYi5kYXRhc2V0LnRhYjsgc3RvcmUuc2V0KCd0YWInLCB0YWIpOyAkJCgnLm5hdiBidXR0b24nKS5mb3JFYWNoKHggPT4geC5zZXRBdHRyaWJ1dGUoJ2FyaWEtY3VycmVudCcsIHggPT09IGIpKTsgcmVuZGVyVGFiKCk7IH0pOwogICQoJyNteUFjYycpLm9uY2xpY2sgPSAoKSA9PiByZW5kZXJNeUFjY291bnQoKTsKICBpZiAoJCgnI3VuZG9CdG4nKSkgeyAkKCcjdW5kb0J0bicpLm9uY2xpY2sgPSB1bmRvTGFzdDsgcmVmcmVzaFVuZG8oKTsgfQogIGlmIChtZS5pbXBlcnNvbmF0ZWRCeSkgewogICAgY29uc3QgYmFyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7CiAgICBiYXIuc3R5bGUuY3NzVGV4dCA9ICdiYWNrZ3JvdW5kOnZhcigtLXdhcm4tYmcpO2NvbG9yOnZhcigtLXdhcm4pO2ZvbnQtd2VpZ2h0OjcwMDtwYWRkaW5nOjEwcHggMTZweDtkaXNwbGF5OmZsZXg7Z2FwOjEycHg7YWxpZ24taXRlbXM6Y2VudGVyO2p1c3RpZnktY29udGVudDpjZW50ZXI7ZmxleC13cmFwOndyYXAnOwogICAgYmFyLmlubmVySFRNTCA9IGBFc3TDoXMgdmllbmRvIGxhIGN1ZW50YSBkZSAke2VzYyhtZS51c2VyLm5hbWUpfSAoJHtlc2MobWUudXNlci5lbWFpbCl9KSA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkgYnRuLXNtIiBpZD0ic3RvcEltcCI+Vm9sdmVyIGEgbWkgY3VlbnRhPC9idXR0b24+YDsKICAgICQoJyNhcHAnKS5wcmVwZW5kKGJhcik7CiAgICAkKCcjc3RvcEltcCcpLm9uY2xpY2sgPSBhc3luYyAoKSA9PiB7IGF3YWl0IGFwaSgnL2FwaS9pbXBlcnNvbmF0ZS9zdG9wJywgeyBtZXRob2Q6ICdQT1NUJyB9KTsgbG9jYXRpb24uaHJlZiA9ICcvJzsgfTsKICB9CiAgY29uc3Qgc3QgPSBtZS5zcGFjZT8uc3RhdHVzOwogIGlmIChzdCAmJiBzdC5raW5kID09PSAndHJpYWwnICYmICFtZS5pbXBlcnNvbmF0ZWRCeSkgewogICAgY29uc3QgYmFyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7CiAgICBiYXIuY2xhc3NOYW1lID0gJ3RyaWFsLWJhcic7CiAgICBiYXIuaW5uZXJIVE1MID0gYPCfjoEgUHJ1ZWJhIGdyYXRpczogJHtzdC5kYXlzTGVmdCA9PT0gMCA/ICdob3kgZXMgdHUgw7psdGltbyBkw61hJyA6IHN0LmRheXNMZWZ0ID09PSAxID8gJ3RlIHF1ZWRhIDEgZMOtYScgOiAndGUgcXVlZGFuICcgKyBzdC5kYXlzTGVmdCArICcgZMOtYXMnfSAoaGFzdGEgZWwgJHtlc2MobmV3IERhdGUoc3QudW50aWwgKyAnVDEyOjAwOjAwJykudG9Mb2NhbGVEYXRlU3RyaW5nKCdlcy1DTCcsIHsgZGF5OiAnbnVtZXJpYycsIG1vbnRoOiAnbG9uZycgfSkpfSkuYDsKICAgICQoJyNhcHAnKS5wcmVwZW5kKGJhcik7CiAgfQogICQoJyNsb2dvdXQnKS5vbmNsaWNrID0gYXN5bmMgKCkgPT4geyBhd2FpdCBhcGkoJy9hcGkvbG9nb3V0JywgeyBtZXRob2Q6ICdQT1NUJyB9KS5jYXRjaCgoKSA9PiB7fSk7IGxvY2F0aW9uLnJlbG9hZCgpOyB9OwogIHN0YXJ0Q2xvY2soKTsgY29ubmVjdFN0cmVhbSgpOyByZW5kZXJUYWIoKTsgd2F0Y2hWZXJzaW9uKCk7IGluaXROb3RpZigpOwp9Ci8vIFNpIHNlIHB1YmxpY2EgdW5hIHZlcnNpw7NuIG51ZXZhIGRlIGxhIGFwcCwgbGEgcGFudGFsbGEgc2UgYWN0dWFsaXphIHNvbGEKZnVuY3Rpb24gd2F0Y2hWZXJzaW9uKCkgewogIGlmICh3YXRjaFZlcnNpb24uX2kpIHJldHVybjsKICBjb25zdCBjaGVjayA9IGFzeW5jICgpID0+IHsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgdiB9ID0gYXdhaXQgZmV0Y2goJy9oZWFsdGgnLCB7IGNhY2hlOiAnbm8tc3RvcmUnIH0pLnRoZW4ociA9PiByLmpzb24oKSk7CiAgICAgIGlmICghd2F0Y2hWZXJzaW9uLnYpIHdhdGNoVmVyc2lvbi52ID0gdjsKICAgICAgZWxzZSBpZiAodiAmJiB2ICE9PSB3YXRjaFZlcnNpb24udiAmJiAhZG9jdW1lbnQucXVlcnlTZWxlY3RvcignaW5wdXQ6Zm9jdXMsIHRleHRhcmVhOmZvY3VzJykpIGxvY2F0aW9uLnJlbG9hZCgpOwogICAgfSBjYXRjaCB7fQogIH07CiAgY2hlY2soKTsgd2F0Y2hWZXJzaW9uLl9pID0gc2V0SW50ZXJ2YWwoY2hlY2ssIDYwMDAwKTsKfQovLyAtLS0tLS0tLS0tIE5PVElGSUNBQ0lPTkVTIERFIFZFTlRBUyAoYWRtaW4geSB2ZW5kZWRvcmVzOyBwYW5lbCBmaWpvIHF1ZSBubyBjYW1iaWEgYWwgbW92ZXJzZSBlbnRyZSBzZWNjaW9uZXMpIC0tLS0tLS0tLS0KY29uc3QgbnQgPSB7IGRhdGE6IG51bGwsIG9wZW46IGZhbHNlLCBmaWx0ZXI6ICdhbGwnLCBzZWVuOiAnJywgZmY6IGZhbHNlIH07CmZ1bmN0aW9uIGluaXROb3RpZigpIHsKICBpZiAoIVsnYWRtaW4nLCAnc2VsbGVyJywgJ2Z1bGZpbGxtZW50J10uaW5jbHVkZXMobWUudXNlci5yb2xlKSB8fCAkKCcjbnRCZWxsJykpIHJldHVybjsKICBudC5mZiA9IG1lLnVzZXIucm9sZSA9PT0gJ2Z1bGZpbGxtZW50JzsKICBudC5zZWVuID0gc3RvcmUuZ2V0KCdudFNlZW4nLCAnJykgfHwgbmV3IERhdGUoRGF0ZS5ub3coKSAtIDM2ZTUpLnRvSVNPU3RyaW5nKCk7CiAgbnQub3BlbiA9IHN0b3JlLmdldCgnbnRPcGVuJywgZmFsc2UpID09PSB0cnVlOwogIGNvbnN0IGJlbGwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTsKICBiZWxsLmlkID0gJ250QmVsbCc7IGJlbGwuY2xhc3NOYW1lID0gJ250LWJlbGwgbnQtY2FzaCc7IGJlbGwudGl0bGUgPSAnVmVudGFzJzsKICBiZWxsLmlubmVySFRNTCA9ICc8c3ZnIHZpZXdCb3g9IjAgMCA0OCAyOCIgYXJpYS1oaWRkZW49InRydWUiPjxyZWN0IHg9IjEuNSIgeT0iMS41IiB3aWR0aD0iNDUiIGhlaWdodD0iMjUiIHJ4PSI0IiBmaWxsPSIjMTZBMzRBIiBzdHJva2U9IiMwQjZCMkUiIHN0cm9rZS13aWR0aD0iMiIvPjxyZWN0IHg9IjUiIHk9IjUiIHdpZHRoPSIzOCIgaGVpZ2h0PSIxOCIgcng9IjIuNSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjQkJGN0QwIiBzdHJva2Utd2lkdGg9IjEuMiIgb3BhY2l0eT0iLjgiLz48Y2lyY2xlIGN4PSIyNCIgY3k9IjE0IiByPSI3LjIiIGZpbGw9IiMyMkM1NUUiIHN0cm9rZT0iI0JCRjdEMCIgc3Ryb2tlLXdpZHRoPSIxLjIiLz48dGV4dCB4PSIyNCIgeT0iMTguNiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1zaXplPSIxMi41IiBmb250LXdlaWdodD0iOTAwIiBmb250LWZhbWlseT0iQXJpYWwsc2Fucy1zZXJpZiIgZmlsbD0iI2ZmZiI+JDwvdGV4dD48Y2lyY2xlIGN4PSI5IiBjeT0iMTQiIHI9IjEuOCIgZmlsbD0iI0JCRjdEMCIvPjxjaXJjbGUgY3g9IjM5IiBjeT0iMTQiIHI9IjEuOCIgZmlsbD0iI0JCRjdEMCIvPjwvc3ZnPjxiIGlkPSJudENvdW50IiBoaWRkZW4+MDwvYj4nOwogIGNvbnN0IHBhbmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYXNpZGUnKTsKICBwYW5lbC5pZCA9ICdudFBhbmVsJzsgcGFuZWwuY2xhc3NOYW1lID0gJ250LXBhbmVsJzsKICBkb2N1bWVudC5ib2R5LmFwcGVuZChiZWxsLCBwYW5lbCk7CiAgYmVsbC5vbmNsaWNrID0gKCkgPT4gc2V0Tm90aWZPcGVuKCFudC5vcGVuKTsKICBwYW5lbC5vbmNsaWNrID0gZSA9PiB7CiAgICBpZiAoZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtbnRjbG9zZV0nKSkgcmV0dXJuIHNldE5vdGlmT3BlbihmYWxzZSk7CiAgICBjb25zdCBmID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtbnRmXScpOyBpZiAoZikgeyBudC5maWx0ZXIgPSBmLmRhdGFzZXQubnRmOyBkcmF3Tm90aWYoKTsgfQogICAgaWYgKGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLW50Y2ZnXScpKSB7IG50LmNmZyA9ICFudC5jZmc7IGRyYXdOb3RpZigpOyB9CiAgfTsKICBwYW5lbC5vbmNoYW5nZSA9IGFzeW5jIGUgPT4gewogICAgaWYgKCFlLnRhcmdldC5tYXRjaGVzKCdbZGF0YS1udHNlbF0nKSkgcmV0dXJuOwogICAgY29uc3QgaWRzID0gWy4uLnBhbmVsLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLW50c2VsXTpjaGVja2VkJyldLm1hcCh4ID0+IE51bWJlcih4LmRhdGFzZXQubnRzZWwpKTsKICAgIHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9ub3RpZmljYXRpb25zL3ByZWZzJywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBzZWxsZXJzOiBpZHMgfSB9KTsgbnQuZGF0YSA9IG51bGw7IGF3YWl0IGxvYWROb3RpZih0cnVlKTsgfSBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlKTsgfQogIH07CiAgc2V0Tm90aWZPcGVuKG50Lm9wZW4pOwogIGxvYWROb3RpZigpOyBzZXRJbnRlcnZhbChsb2FkTm90aWYsIDYwZTMpOwp9Ci8vIFZlbnRhIG51ZXZhOiBsYSBmb3RvIGNvbiBlbCBwcmVjaW8gY2FlIGVuIGPDoW1hcmEgbGVudGEgaGFzdGEgbGEgY2FtcGFuYQpmdW5jdGlvbiBmbHlUb0JlbGwoeCkgewogIGNvbnN0IGJlbGwgPSAkKCcjbnRCZWxsJyk7IGlmICghYmVsbCkgcmV0dXJuOwogIGNvbnN0IGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7CiAgZWwuY2xhc3NOYW1lID0gJ250LWZseSBtay0nICsgeC5tYXJrZXRwbGFjZTsKICBlbC5pbm5lckhUTUwgPSBgJHt4LnRodW1iID8gYDxpbWcgc3JjPSIke2VzYyh4LnRodW1iKX0iIGFsdD0iIj5gIDogJzxzcGFuPvCfm43vuI88L3NwYW4+J30ke250LmZmID8gYDxiPiske3gudW5pdHMgfHwgMX0gdS48L2I+YCA6IGA8Yj4rJHtNYXRoLnJvdW5kKHguYW1vdW50KS50b0xvY2FsZVN0cmluZygnZXMtQ0wnKX08L2I+YH08c21hbGw+JHtlc2MoTUtbeC5tYXJrZXRwbGFjZV0gfHwgJycpfTwvc21hbGw+YDsKICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGVsKTsKICAvLyBjYWUgc3VhdmUgcG9yIGVsIGNvc3RhZG8gaXpxdWllcmRvIChzaW4gdGFwYXIgZWwgY2VudHJvKSB5IGx1ZWdvIGVudHJhIGFsIGJpbGxldGUKICBjb25zdCBiID0gYmVsbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSwgVyA9IDEyMDsKICBjb25zdCBseCA9IDEwLCBleCA9IGIubGVmdCArIGIud2lkdGggLyAyIC0gVyAvIDIsIGV5ID0gYi50b3AgKyBiLmhlaWdodCAvIDIgLSBXIC8gMjsKICBjb25zdCBhbmltID0gZWwuYW5pbWF0ZShbCiAgICB7IHRyYW5zZm9ybTogYHRyYW5zbGF0ZSgke2x4fXB4LCAtMTcwcHgpIHNjYWxlKC45KSByb3RhdGUoLTZkZWcpYCwgb3BhY2l0eTogMCB9LAogICAgeyB0cmFuc2Zvcm06IGB0cmFuc2xhdGUoJHtseH1weCwgJHtpbm5lckhlaWdodCAqIC4xOH1weCkgc2NhbGUoLjkpIHJvdGF0ZSg0ZGVnKWAsIG9wYWNpdHk6IDEsIG9mZnNldDogLjI1IH0sCiAgICB7IHRyYW5zZm9ybTogYHRyYW5zbGF0ZSgke2x4ICsgNn1weCwgJHtpbm5lckhlaWdodCAqIC40Mn1weCkgc2NhbGUoLjkpIHJvdGF0ZSgtM2RlZylgLCBvcGFjaXR5OiAxLCBvZmZzZXQ6IC41NSB9LAogICAgeyB0cmFuc2Zvcm06IGB0cmFuc2xhdGUoJHtseCArIDMwfXB4LCAke2lubmVySGVpZ2h0ICogLjV9cHgpIHNjYWxlKC44KSByb3RhdGUoMGRlZylgLCBvcGFjaXR5OiAxLCBvZmZzZXQ6IC42NiB9LAogICAgeyB0cmFuc2Zvcm06IGB0cmFuc2xhdGUoJHtleH1weCwgJHtleX1weCkgc2NhbGUoLjIpIHJvdGF0ZSg4ZGVnKWAsIG9wYWNpdHk6IC4xNSB9CiAgXSwgeyBkdXJhdGlvbjogNDIwMCwgZWFzaW5nOiAnY3ViaWMtYmV6aWVyKC40LC4wNSwuMywxKScsIGZpbGw6ICdmb3J3YXJkcycgfSk7CiAgYW5pbS5vbmZpbmlzaCA9ICgpID0+IHsgZWwucmVtb3ZlKCk7IGJlbGwuY2xhc3NMaXN0LnJlbW92ZSgnbnQtaGl0Jyk7IHZvaWQgYmVsbC5vZmZzZXRXaWR0aDsgYmVsbC5jbGFzc0xpc3QuYWRkKCdudC1oaXQnKTsgfTsKfQpmdW5jdGlvbiBzZXROb3RpZk9wZW4odikgewogIG50Lm9wZW4gPSB2OyBzdG9yZS5zZXQoJ250T3BlbicsIHYpOwogIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LnRvZ2dsZSgnbnQtb24nLCB2KTsKICBpZiAodiAmJiBudC5kYXRhKSBtYXJrTm90aWZTZWVuKCk7CiAgZHJhd05vdGlmKCk7Cn0KZnVuY3Rpb24gbWFya05vdGlmU2VlbigpIHsgY29uc3QgdG9wID0gbnQuZGF0YT8uaXRlbXM/LlswXT8uYXQ7IGlmICh0b3AgJiYgdG9wID4gbnQuc2VlbikgeyBudC5zZWVuID0gdG9wOyBzdG9yZS5zZXQoJ250U2VlbicsIHRvcCk7IH0gfQphc3luYyBmdW5jdGlvbiBsb2FkTm90aWYocXVpZXQpIHsKICB0cnkgewogICAgY29uc3QgcHJldlRvcCA9IHF1aWV0ID8gbnVsbCA6IG50LmRhdGE/Lml0ZW1zPy5bMF0/LmF0OwogICAgbnQuZGF0YSA9IGF3YWl0IGFwaSgnL2FwaS9ub3RpZmljYXRpb25zJyk7CiAgICBjb25zdCBmcmVzaCA9IG50LmRhdGEuaXRlbXMuZmlsdGVyKHggPT4geC5hdCA+IChwcmV2VG9wIHx8IG50LnNlZW4pKTsKICAgIGlmIChwcmV2VG9wICYmIGZyZXNoLmxlbmd0aCkgZnJlc2guc2xpY2UoMCwgNCkucmV2ZXJzZSgpLmZvckVhY2goKHgsIGkpID0+IHNldFRpbWVvdXQoKCkgPT4gZmx5VG9CZWxsKHgpLCBpICogMTQwMCkpOwogICAgaWYgKHByZXZUb3AgJiYgZnJlc2gubGVuZ3RoKSB0b2FzdChudC5mZiA/IGDwn5OmICR7ZnJlc2gubGVuZ3RoID09PSAxID8gJ051ZXZhIHZlbnRhJyA6IGZyZXNoLmxlbmd0aCArICcgdmVudGFzIG51ZXZhcyd9OiAke2ZyZXNoLnJlZHVjZSgoYSwgeCkgPT4gYSArICh4LnVuaXRzIHx8IDEpLCAwKX0gdW5pZGFkZXNgIDogYPCfkrUgJHtmcmVzaC5sZW5ndGggPT09IDEgPyAnTnVldmEgdmVudGEnIDogZnJlc2gubGVuZ3RoICsgJyB2ZW50YXMgbnVldmFzJ306ICR7bW9uZXkoZnJlc2gucmVkdWNlKChhLCB4KSA9PiBhICsgeC5hbW91bnQsIDApKX1gLCA1MDAwKTsKICAgIGlmIChudC5vcGVuKSBtYXJrTm90aWZTZWVuKCk7CiAgICBkcmF3Tm90aWYoKTsKICB9IGNhdGNoIHt9Cn0KZnVuY3Rpb24gZHJhd05vdGlmKCkgewogIGNvbnN0IGJlbGwgPSAkKCcjbnRCZWxsJyksIHBhbmVsID0gJCgnI250UGFuZWwnKTsgaWYgKCFiZWxsIHx8ICFwYW5lbCkgcmV0dXJuOwogIGNvbnN0IGl0ZW1zID0gbnQuZGF0YT8uaXRlbXMgfHwgW107CiAgY29uc3QgdW5yZWFkID0gaXRlbXMuZmlsdGVyKHggPT4geC5hdCA+IG50LnNlZW4pLmxlbmd0aDsKICBjb25zdCBjID0gJCgnI250Q291bnQnKTsgYy5oaWRkZW4gPSAhdW5yZWFkOyBjLnRleHRDb250ZW50ID0gdW5yZWFkID4gOTkgPyAnOTkrJyA6IHVucmVhZDsKICBiZWxsLmNsYXNzTGlzdC50b2dnbGUoJ2hhcycsIHVucmVhZCA+IDApOyBiZWxsLmNsYXNzTGlzdC50b2dnbGUoJ29uJywgbnQub3Blbik7CiAgY29uc3QgbGlzdCA9IGl0ZW1zLmZpbHRlcih4ID0+IG50LmZpbHRlciA9PT0gJ2FsbCcgfHwgeC5tYXJrZXRwbGFjZSA9PT0gbnQuZmlsdGVyKTsKICBjb25zdCBjbnQgPSBrID0+IGl0ZW1zLmZpbHRlcih4ID0+IHgubWFya2V0cGxhY2UgPT09IGspLmxlbmd0aDsKICBjb25zdCBob3JhID0gZCA9PiBuZXcgRGF0ZShkKS50b0xvY2FsZVN0cmluZygnZXMtQ0wnLCB7IHdlZWtkYXk6ICdzaG9ydCcsIGRheTogJzItZGlnaXQnLCBtb250aDogJ3Nob3J0JywgaG91cjogJzItZGlnaXQnLCBtaW51dGU6ICcyLWRpZ2l0JyB9KTsKICBwYW5lbC5pbm5lckhUTUwgPSBgPGhlYWRlciBjbGFzcz0ibnQtaCI+PGRpdj48Yj7wn5K1IFZlbnRhczwvYj48c21hbGw+SG95OiA8c3Ryb25nPiR7bnQuZGF0YSA/IG50LmRhdGEudG9kYXkubiA6ICfigKYnfTwvc3Ryb25nPiB2ZW50YXMke250LmZmID8gJycgOiBgIMK3IDxzdHJvbmc+JHtudC5kYXRhID8gbW9uZXkobnQuZGF0YS50b2RheS50b3RhbCB8fCAwKSA6ICfigKYnfTwvc3Ryb25nPmB9PC9zbWFsbD48L2Rpdj48ZGl2IGNsYXNzPSJudC1oYiI+JHttZS51c2VyLnJvbGUgPT09ICdhZG1pbicgPyAnPGJ1dHRvbiBjbGFzcz0ibnQteCIgZGF0YS1udGNmZyB0aXRsZT0iRWxlZ2lyIG1pcyBjdWVudGFzIj7impk8L2J1dHRvbj4nIDogJyd9PGJ1dHRvbiBjbGFzcz0ibnQteCIgZGF0YS1udGNsb3NlIHRpdGxlPSJDZXJyYXIiPuKclTwvYnV0dG9uPjwvZGl2PjwvaGVhZGVyPgogICAgJHtudC5jZmcgJiYgbWUudXNlci5yb2xlID09PSAnYWRtaW4nID8gYDxkaXYgY2xhc3M9Im50LWNmZyI+PGI+TWlzIGN1ZW50YXM8L2I+PHNtYWxsPlNvbG8gdGUgbGxlZ2FuIGxhcyB2ZW50YXMgZGUgbGFzIGN1ZW50YXMgbWFyY2FkYXMuPC9zbWFsbD48ZGl2PiR7KG50LmRhdGE/LnNlbGxlcnMgfHwgW10pLm1hcCh4ID0+IGA8bGFiZWw+PGlucHV0IHR5cGU9ImNoZWNrYm94IiBkYXRhLW50c2VsPSIke3guaWR9IiAkeyhudC5kYXRhLm1pbmUgfHwgW10pLmluY2x1ZGVzKHguaWQpID8gJ2NoZWNrZWQnIDogJyd9PiAke2VzYyh4Lm5hbWUpfTwvbGFiZWw+YCkuam9pbignJyl9PC9kaXY+PC9kaXY+YCA6ICcnfQogICAgPGRpdiBjbGFzcz0ibnQtZiI+JHtbWydhbGwnLCAnVG9kYXMnLCBpdGVtcy5sZW5ndGhdLCAuLi5ta0xpc3QoaXRlbXMubWFwKHggPT4geC5tYXJrZXRwbGFjZSkpLm1hcChrID0+IFtrLCBNS1trXSwgY250KGspXSldLm1hcCgoW2ssIG4sIHZdKSA9PiBgPGJ1dHRvbiBkYXRhLW50Zj0iJHtrfSIgY2xhc3M9IiR7bnQuZmlsdGVyID09PSBrID8gJ29uJyA6ICcnfSAke2t9Ij4ke259IDxlbT4ke3Z9PC9lbT48L2J1dHRvbj5gKS5qb2luKCcnKX08L2Rpdj4KICAgIDxkaXYgY2xhc3M9Im50LWxpc3QiPiR7IW50LmRhdGEgPyAnPHAgY2xhc3M9Im50LWVtcHR5Ij5DYXJnYW5kbyB2ZW50YXPigKY8L3A+JyA6IGxpc3QubGVuZ3RoID8gbGlzdC5tYXAoKHgsIGkpID0+IGA8YXJ0aWNsZSBjbGFzcz0ibnQtaXRlbSBtay0ke3gubWFya2V0cGxhY2V9ICR7eC5hdCA+IG50LnNlZW4gPyAnbmV3JyA6ICcnfSIgc3R5bGU9Ii0taToke01hdGgubWluKGksIDEwKX0iPgogICAgICA8ZGl2IGNsYXNzPSJudC10b3AiPjxzcGFuIGNsYXNzPSJudC1tayI+PGk+PC9pPiR7TUtbeC5tYXJrZXRwbGFjZV0gfHwgeC5tYXJrZXRwbGFjZX08L3NwYW4+JHttZS51c2VyLnJvbGUgIT09ICdzZWxsZXInID8gYDxzcGFuIGNsYXNzPSJudC1zZWxsZXIiPiR7ZXNjKHguc2VsbGVyKX08L3NwYW4+YCA6ICcnfTxzcGFuIGNsYXNzPSJudC1hZ28iIHRpdGxlPSIke2VzYyhob3JhKHguYXQpKX0iPiR7YWdvUyh4LmF0KX08L3NwYW4+PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9Im50LW1haW4iPiR7eC50aHVtYiA/IGA8aW1nIGNsYXNzPSJudC1pbWciIHNyYz0iJHtlc2MoeC50aHVtYil9IiBhbHQ9IiIgbG9hZGluZz0ibGF6eSI+YCA6IGA8c3BhbiBjbGFzcz0ibnQtaW1nIG50LW5vaW1nIj7wn5uN77iPPC9zcGFuPmB9PGRpdiBjbGFzcz0ibnQtcHJvZCI+JHsoeC5pdGVtcy5sZW5ndGggPyB4Lml0ZW1zIDogW3sgbmFtZTogJ1ZlbnRhJywgcXR5OiB4LnVuaXRzIH1dKS5zbGljZSgwLCAzKS5tYXAoaXQgPT4gYDxzcGFuPiR7ZXNjKGl0Lm5hbWUpfSR7aXQudmFyaWFudCA/IGAgPHNtYWxsPiR7ZXNjKGl0LnZhcmlhbnQpfTwvc21hbGw+YCA6ICcnfSR7aXQucXR5ID4gMSA/IGAgPGVtPsOXJHtpdC5xdHl9PC9lbT5gIDogJyd9PC9zcGFuPmApLmpvaW4oJycpfSR7eC5pdGVtcy5sZW5ndGggPiAzID8gYDxzbWFsbD4rJHt4Lml0ZW1zLmxlbmd0aCAtIDN9IHByb2R1Y3RvcyBtw6FzPC9zbWFsbD5gIDogJyd9JHsoeC5ibG9ja2VkIHx8IFtdKS5tYXAoaXQgPT4gYDxkZWwgY2xhc3M9Im50LWJsayIgdGl0bGU9IlByb2R1Y3RvIGJsb3F1ZWFkbzogbm8gbG8gdHJhYmFqYSBlbCBmdWxmaWxsbWVudCI+JHtlc2MoaXQubmFtZSl9JHtpdC5xdHkgPiAxID8gYCDDlyR7aXQucXR5fWAgOiAnJ308L2RlbD5gKS5qb2luKCcnKX08L2Rpdj4ke250LmZmID8gJycgOiBgPGIgY2xhc3M9Im50LXByaWNlIj4ke21vbmV5KHguYW1vdW50KX08L2I+YH08L2Rpdj4KICAgICAgPHNtYWxsIGNsYXNzPSJudC1pZCI+JHtudC5mZiA/ICcnIDogYFZlbnRhICMke2VzYyh4LmV4dGVybmFsX2lkKX0gwrcgYH0ke2VzYyhob3JhKHguYXQpKX08L3NtYWxsPjwvYXJ0aWNsZT5gKS5qb2luKCcnKSA6ICc8cCBjbGFzcz0ibnQtZW1wdHkiPlNpbiB2ZW50YXMgZW4gbG9zIMO6bHRpbW9zIDMgZMOtYXMuPC9wPid9PC9kaXY+YDsKfQpmdW5jdGlvbiByZW5kZXJUYWIoKSB7ICh7IGNsb3VkOiByZW5kZXJDbG91ZCwgbWtwOiByZW5kZXJNa3AsIGNvZGVzOiByZW5kZXJDb2Rlc1BhZ2UsIHRyYXk6IHJlbmRlclRyYXksIHNlbGxlcjogcmVuZGVyU2VsbGVyLCBhZG1pbjogcmVuZGVyQWRtaW4sIHNlbGxlcnNWaWV3OiByZW5kZXJTZWxsZXJzVmlldywgc2FsZXM6IHJlbmRlclNhbGVzLCB1bml0czogcmVuZGVyVW5pdHMgfSlbdGFiXSgpOyB9CgovLyBSZXN1bWVuIHZpc3VhbCBkZSB1bmlkYWRlcyAoc2VjY2nDs24gc2luIHByZWNpb3MpOiB0YXJqZXRhcywgdW5pZGFkZXMgcG9yIGTDrWEsIHRvcCBwdWJsaWNhY2lvbmVzIHkgcG9yIHZlbmRlZG9yCmZ1bmN0aW9uIHVuaXRzVml6KGQsIHJvd3MsIGZyb20sIHRvLCBhbGwpIHsKICBjb25zdCB1bml0cyA9IHJvd3MucmVkdWNlKChhLCByKSA9PiBhICsgci5xdHksIDApLCBvcmRlcnMgPSByb3dzLnJlZHVjZSgoYSwgcikgPT4gYSArIHIub3JkZXJzLCAwKTsKICBjb25zdCB0b3AgPSByb3dzWzBdOwogIGNvbnN0IG1rVG90ID0gayA9PiByb3dzLnJlZHVjZSgoYSwgcikgPT4gYSArIChyLmJ5TWtba10gfHwgMCksIDApOwogIGNvbnN0IHV2TWtzID0gbWtMaXN0KHJvd3MuZmxhdE1hcChyID0+IE9iamVjdC5rZXlzKHIuYnlNayB8fCB7fSkuZmlsdGVyKGsgPT4gci5ieU1rW2tdKSkpOwogIGNvbnN0IGJhciA9IChsYWJlbCwgdmFsdWUsIG1heCwgY29sb3IsIHN1YikgPT4gYDxkaXYgY2xhc3M9ImhiIj48ZGl2IGNsYXNzPSJoYi1sIj48c3BhbiBjbGFzcz0iaGItbmFtZSI+JHtsYWJlbH08L3NwYW4+JHtzdWIgPyBgPHNtYWxsPiR7c3VifTwvc21hbGw+YCA6ICcnfTwvZGl2PjxkaXYgY2xhc3M9ImhiLXRyYWNrIj48aSBzdHlsZT0id2lkdGg6JHtNYXRoLm1heCgyLCBNYXRoLnJvdW5kKHZhbHVlIC8gbWF4ICogMTAwKSl9JTtiYWNrZ3JvdW5kOiR7Y29sb3J9Ij48L2k+PC9kaXY+PGIgY2xhc3M9ImhiLXYiPiR7dmFsdWUudG9Mb2NhbGVTdHJpbmcoJ2VzLUNMJyl9PC9iPjwvZGl2PmA7CiAgY29uc3QgdG9wMTAgPSByb3dzLnNsaWNlKDAsIDEwKSwgbWF4VG9wID0gTWF0aC5tYXgoMSwgLi4udG9wMTAubWFwKHIgPT4gci5xdHkpKTsKICBsZXQgYnlTZWxsZXIgPSAnJzsKICBpZiAoYWxsKSB7CiAgICBjb25zdCBtID0gbmV3IE1hcCgpOyByb3dzLmZvckVhY2gociA9PiBtLnNldChyLnNlbGxlciwgKG0uZ2V0KHIuc2VsbGVyKSB8fCAwKSArIHIucXR5KSk7CiAgICBjb25zdCBsaXN0ID0gWy4uLm0uZW50cmllcygpXS5zb3J0KChhLCBiKSA9PiBiWzFdIC0gYVsxXSksIG14ID0gTWF0aC5tYXgoMSwgLi4ubGlzdC5tYXAoeCA9PiB4WzFdKSk7CiAgICBieVNlbGxlciA9IGA8ZGl2IGNsYXNzPSJwYW5lbCB1di1jYXJkIj48ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj48aDI+VW5pZGFkZXMgcG9yIHZlbmRlZG9yPC9oMj48L2Rpdj48ZGl2IGNsYXNzPSJwYW5lbC1ib2R5Ij4ke2xpc3QubWFwKChbbiwgdl0pID0+IGJhcihlc2MobiksIHYsIG14LCAndmFyKC0tYWNjZW50KScsIGAke01hdGgucm91bmQodiAvIHVuaXRzICogMTAwKX0lIGRlbCB0b3RhbGApKS5qb2luKCcnKX08L2Rpdj48L2Rpdj5gOwogIH0KICByZXR1cm4gYDxkaXYgY2xhc3M9InV2Ij4KICAgIDxkaXYgY2xhc3M9InV2LWtwaXMiPgogICAgICA8ZGl2IGNsYXNzPSJrcGkga3BpLWhlcm8iPjxzbWFsbD5VbmlkYWRlcyB2ZW5kaWRhczwvc21hbGw+PGI+JHt1bml0cy50b0xvY2FsZVN0cmluZygnZXMtQ0wnKX08L2I+PHNwYW4+JHtlc2MoZm10RChmcm9tKSl9IOKAkyAke2VzYyhmbXREKHRvKSl9PC9zcGFuPjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJrcGkiPjxzbWFsbD5QZWRpZG9zPC9zbWFsbD48Yj4ke29yZGVycy50b0xvY2FsZVN0cmluZygnZXMtQ0wnKX08L2I+PHNwYW4+dmVudGFzIGNvbiBlc3RvcyBwcm9kdWN0b3M8L3NwYW4+PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9ImtwaSI+PHNtYWxsPlB1YmxpY2FjaW9uZXMgdmVuZGlkYXM8L3NtYWxsPjxiPiR7cm93cy5sZW5ndGgudG9Mb2NhbGVTdHJpbmcoJ2VzLUNMJyl9PC9iPjxzcGFuPmRpc3RpbnRhczwvc3Bhbj48L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0ia3BpIj48c21hbGw+8J+PhiBMYSBtw6FzIHZlbmRpZGE8L3NtYWxsPjxiIHN0eWxlPSJmb250LXNpemU6MTdweDtsaW5lLWhlaWdodDoxLjI1Ij4ke2VzYygodG9wPy5uYW1lIHx8ICfigJQnKS5zbGljZSgwLCA0OCkpfSR7KHRvcD8ubmFtZSB8fCAnJykubGVuZ3RoID4gNDggPyAn4oCmJyA6ICcnfTwvYj48c3Bhbj4ke3RvcCA/IHRvcC5xdHkudG9Mb2NhbGVTdHJpbmcoJ2VzLUNMJykgKyAnIHVuaWRhZGVzJyA6ICcnfTwvc3Bhbj48L2Rpdj4KICAgIDwvZGl2PgogICAgPGRpdiBjbGFzcz0idXYtbWsiPiR7dXZNa3MubWFwKGsgPT4gYDxzcGFuPjxpIGNsYXNzPSJkb3QiIHN0eWxlPSJiYWNrZ3JvdW5kOiR7TUtfQ09MT1Jba119Ij48L2k+JHtNS1trXX0gPGI+JHtta1RvdChrKS50b0xvY2FsZVN0cmluZygnZXMtQ0wnKX08L2I+IHVuaWQuIDxzbWFsbD4oJHt1bml0cyA/IE1hdGgucm91bmQobWtUb3QoaykgLyB1bml0cyAqIDEwMCkgOiAwfSUpPC9zbWFsbD48L3NwYW4+YCkuam9pbignJyl9PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbCB1di1jYXJkIj48ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj48aDI+VW5pZGFkZXMgdmVuZGlkYXMgcG9yIGTDrWE8L2gyPjxkaXYgY2xhc3M9ImxlZ2VuZCI+JHt1dk1rcy5tYXAoayA9PiBgPHNwYW4+PGkgY2xhc3M9ImRvdCIgc3R5bGU9ImJhY2tncm91bmQ6JHtNS19DT0xPUltrXX0iPjwvaT4ke01LW2tdfTwvc3Bhbj5gKS5qb2luKCcnKX08L2Rpdj48L2Rpdj48ZGl2IGNsYXNzPSJwYW5lbC1ib2R5Ij48ZGl2IGNsYXNzPSJjaC1zbG90IiBpZD0idXZEYXlzIiBkYXRhLWg9IjI0MCI+PC9kaXY+PC9kaXY+PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJ1di1ncmlkIj4KICAgICAgPGRpdiBjbGFzcz0icGFuZWwgdXYtY2FyZCI+PGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+PGgyPlRvcCAxMCBwdWJsaWNhY2lvbmVzPC9oMj48c3BhbiBjbGFzcz0ibXV0ZWQiPnBvciB1bmlkYWRlczwvc3Bhbj48L2Rpdj48ZGl2IGNsYXNzPSJwYW5lbC1ib2R5Ij4ke3RvcDEwLm1hcCgociwgaSkgPT4gYmFyKGA8ZW0gY2xhc3M9InJrIj4ke2kgKyAxfTwvZW0+JHtlc2Moci5uYW1lKX1gLCByLnF0eSwgbWF4VG9wLCBNS19DT0xPUltyLm1hcmtldHBsYWNlXSB8fCAndmFyKC0tYWNjZW50KScsIGAke01LW3IubWFya2V0cGxhY2VdIHx8ICcnfSR7YWxsID8gJyDCtyAnICsgZXNjKHIuc2VsbGVyKSA6ICcnfWApKS5qb2luKCcnKX08L2Rpdj48L2Rpdj4KICAgICAgJHtieVNlbGxlcn0KICAgIDwvZGl2PgogICAgPGRpdiBjbGFzcz0iY2gtdGlwIiBpZD0iY2hUaXAyIiBoaWRkZW4+PC9kaXY+CiAgPC9kaXY+YDsKfQpmdW5jdGlvbiBkcmF3VW5pdENoYXJ0cyhkLCBmcm9tLCB0bykgewogIGNvbnN0IGVsID0gJCgnI3V2RGF5cycpOyBpZiAoIWVsKSByZXR1cm47CiAgY29uc3QgZGF5cyA9IFtdOyBmb3IgKGxldCB4ID0gbmV3IERhdGUoZnJvbSArICdUMTI6MDA6MDAnKTsgaXNvKHgpIDw9IHRvICYmIGRheXMubGVuZ3RoIDwgNDAwOyB4LnNldERhdGUoeC5nZXREYXRlKCkgKyAxKSkgZGF5cy5wdXNoKGlzbyh4KSk7CiAgLy8gaGFzdGEgMzEgZMOtYXM6IHVuYSBjb2x1bW5hIHBvciBkw61hOyBtw6FzOiBwb3Igc2VtYW5hIChsdW5lcykgbyBwb3IgbWVzCiAgY29uc3QgbW9kZSA9IGRheXMubGVuZ3RoIDw9IDMxID8gJ2RheScgOiBkYXlzLmxlbmd0aCA8PSAxMjAgPyAnd2VlaycgOiAnbW9udGgnOwogIGNvbnN0IGtleU9mID0geCA9PiB7IGlmIChtb2RlID09PSAnZGF5JykgcmV0dXJuIHg7IGNvbnN0IHQgPSBuZXcgRGF0ZSh4ICsgJ1QxMjowMDowMCcpOyBpZiAobW9kZSA9PT0gJ21vbnRoJykgcmV0dXJuIHguc2xpY2UoMCwgNyk7IHQuc2V0RGF0ZSh0LmdldERhdGUoKSAtICgodC5nZXREYXkoKSArIDYpICUgNykpOyByZXR1cm4gaXNvKHQpOyB9OwogIGNvbnN0IGJ1Y2tldHMgPSBbLi4ubmV3IFNldChkYXlzLm1hcChrZXlPZikpXTsKICBjb25zdCB2YWwgPSAoYiwgaykgPT4gZGF5cy5maWx0ZXIoeCA9PiBrZXlPZih4KSA9PT0gYikucmVkdWNlKChhLCB4KSA9PiBhICsgKChkLmRhaWx5IHx8IHt9KVt4XT8uW2tdIHx8IDApLCAwKTsKICBjb25zdCBzdGFja3MgPSBta0xpc3QoT2JqZWN0LnZhbHVlcyhkLmRhaWx5IHx8IHt9KS5mbGF0TWFwKHggPT4gT2JqZWN0LmtleXMoeCkuZmlsdGVyKGsgPT4geFtrXSkpKS5tYXAoayA9PiAoeyBrZXk6IGssIGxhYmVsOiBNS1trXSwgY29sb3I6IE1LX0NPTE9SW2tdLCB2YWx1ZXM6IGJ1Y2tldHMubWFwKGIgPT4gKHsgYW1vdW50OiB2YWwoYiwgayksIG9yZGVyczogMCB9KSkgfSkpOwogIGNvbnN0IE1FUyA9IFsnZW5lJywgJ2ZlYicsICdtYXInLCAnYWJyJywgJ21heScsICdqdW4nLCAnanVsJywgJ2FnbycsICdzZXAnLCAnb2N0JywgJ25vdicsICdkaWMnXTsKICBjb25zdCBsYWJlbCA9IGIgPT4gbW9kZSA9PT0gJ21vbnRoJyA/IE1FU1srYi5zbGljZSg1LCA3KSAtIDFdIDogbW9kZSA9PT0gJ3dlZWsnID8gYHNlbSAkeytiLnNsaWNlKDgpfS8keytiLnNsaWNlKDUsIDcpfWAgOiBudWxsOwogIGNvbnN0IHRpdGxlID0gYiA9PiBtb2RlID09PSAnbW9udGgnID8gYCR7TUVTWytiLnNsaWNlKDUsIDcpIC0gMV19ICR7Yi5zbGljZSgwLCA0KX1gIDogbW9kZSA9PT0gJ3dlZWsnID8gYFNlbWFuYSBkZWwgJHtkYXlMb25nKGIpfWAgOiBkYXlMb25nKGIpOwogIGVsLmlubmVySFRNTCA9IGNvbHVtbkNoYXJ0KGJ1Y2tldHMsIHN0YWNrcywgeyBoZWlnaHQ6IDI0MCwgd2lkdGg6IGVsLmNsaWVudFdpZHRoIHx8IDY0MCwgdW5pdHM6IHRydWUsIHRvZGF5OiBtb2RlID09PSAnZGF5JyA/IGlzbyhuZXcgRGF0ZSgpKSA6IG51bGwsIGxhYmVsOiBtb2RlID09PSAnZGF5JyA/IG51bGwgOiBsYWJlbCwgdGl0bGUgfSk7Cn0KCi8vIC0tLS0tLS0tLS0gUFJPRFVDVE9TIFZFTkRJRE9TIChjYW50aWRhZGVzLCBzaW4gcHJlY2lvcykgcGFyYSBlbCBmdWxmaWxsbWVudCB5IGVsIGFkbWluaXN0cmFkb3IgLS0tLS0tLS0tLQphc3luYyBmdW5jdGlvbiByZW5kZXJVbml0cygpIHsKICAkKCcjbWFpbicpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJzZWN0aW9uLXRpdGxlIiBzdHlsZT0ibWFyZ2luLXRvcDoyMnB4Ij48aDI+UHJvdmVlZG9yIEZ1bGZpbGxtZW50PC9oMj48c3BhbiBjbGFzcz0ibXV0ZWQiPkNhbnRpZGFkZXMgcG9yIHB1YmxpY2FjacOzbiB5IHZhcmlhbnRlIMK3IHNpbiBwcmVjaW9zIMK3IHNpbiBsb3MgcHJvZHVjdG9zIGJsb3F1ZWFkb3M8L3NwYW4+PHNwYW4gY2xhc3M9InNwYWNlciIgc3R5bGU9ImZsZXg6MSI+PC9zcGFuPjxzcGFuIGlkPSJ1bml0c1BpY2siPjwvc3Bhbj48L2Rpdj48ZGl2IGNsYXNzPSJwYW5lbCIgaWQ9InByb2RQYW5lbCI+PC9kaXY+YDsKICB0cnkgewogICAgY29uc3QgeyBzZWxsZXJzOiBsaXN0IH0gPSBhd2FpdCBhcGkoJy9hcGkvc2VsbGVycy9saXN0Jyk7CiAgICBjb25zdCBjdXIgPSBzdG9yZS5nZXQoJ3VuaXRzU2VsbGVyJywgJycpOwogICAgJCgnI3VuaXRzUGljaycpLmlubmVySFRNTCA9IGA8c2VsZWN0IGlkPSJ1bml0c1NlbCIgc3R5bGU9IndpZHRoOmF1dG8iPjxvcHRpb24gdmFsdWU9IiI+VG9kb3MgbG9zIHZlbmRlZG9yZXM8L29wdGlvbj4ke2xpc3QubWFwKHggPT4gYDxvcHRpb24gdmFsdWU9IiR7eC5pZH0iICR7U3RyaW5nKHguaWQpID09PSBTdHJpbmcoY3VyKSA/ICdzZWxlY3RlZCcgOiAnJ30+JHtlc2MoeC5uYW1lKX08L29wdGlvbj5gKS5qb2luKCcnKX08L3NlbGVjdD5gOwogICAgJCgnI3VuaXRzU2VsJykub25jaGFuZ2UgPSBlID0+IHsgc3RvcmUuc2V0KCd1bml0c1NlbGxlcicsIGUudGFyZ2V0LnZhbHVlKTsgcmVuZGVyUHJvZHVjdHMoKTsgfTsKICB9IGNhdGNoIHt9CiAgcmVuZGVyUHJvZHVjdHMoKTsKfQoKLy8gLS0tLS0tLS0tLSBWRU5UQVMgLS0tLS0tLS0tLQovLyBQbGFuaWxsYSBkZSBwcm9kdWN0b3MgdmVuZGlkb3M6IGZpamEgZGUgbHVuZXMgYSBkb21pbmdvOyB0YW1iacOpbiBtZXMsIDMwIGTDrWFzLCBhw7FvIG8gZmVjaGFzIGEgZWxlY2Npw7NuCmNvbnN0IHBwID0geyBtb2RlOiAnd2VlaycsIHdlZWs6IDAsIGZyb206ICcnLCB0bzogJycsIHE6ICcnLCBvcGVuOiBuZXcgU2V0KCkgfTsKY29uc3QgaXNvID0gZCA9PiBgJHtkLmdldEZ1bGxZZWFyKCl9LSR7U3RyaW5nKGQuZ2V0TW9udGgoKSArIDEpLnBhZFN0YXJ0KDIsICcwJyl9LSR7U3RyaW5nKGQuZ2V0RGF0ZSgpKS5wYWRTdGFydCgyLCAnMCcpfWA7CmZ1bmN0aW9uIHBwUmFuZ2UoKSB7CiAgY29uc3QgdCA9IG5ldyBEYXRlKCk7IHQuc2V0SG91cnMoMTIsIDAsIDAsIDApOwogIGlmIChwcC5tb2RlID09PSAnd2VlaycpIHsgY29uc3QgbW9uID0gbmV3IERhdGUodCk7IG1vbi5zZXREYXRlKHQuZ2V0RGF0ZSgpIC0gKCh0LmdldERheSgpICsgNikgJSA3KSArIHBwLndlZWsgKiA3KTsgY29uc3Qgc3VuID0gbmV3IERhdGUobW9uKTsgc3VuLnNldERhdGUobW9uLmdldERhdGUoKSArIDYpOyByZXR1cm4gW2lzbyhtb24pLCBpc28oc3VuKV07IH0KICBpZiAocHAubW9kZSA9PT0gJ21vbnRoJykgcmV0dXJuIFtpc28obmV3IERhdGUodC5nZXRGdWxsWWVhcigpLCB0LmdldE1vbnRoKCksIDEpKSwgaXNvKHQpXTsKICBpZiAocHAubW9kZSA9PT0gJzMwJykgeyBjb25zdCBmID0gbmV3IERhdGUodCk7IGYuc2V0RGF0ZSh0LmdldERhdGUoKSAtIDI5KTsgcmV0dXJuIFtpc28oZiksIGlzbyh0KV07IH0KICBpZiAocHAubW9kZSA9PT0gJ3llYXInKSByZXR1cm4gW2lzbyhuZXcgRGF0ZSh0LmdldEZ1bGxZZWFyKCksIDAsIDEpKSwgaXNvKHQpXTsKICByZXR1cm4gW3BwLmZyb20gfHwgaXNvKHQpLCBwcC50byB8fCBpc28odCldOwp9CmNvbnN0IGZtdEQgPSBkID0+IG5ldyBEYXRlKGQgKyAnVDEyOjAwOjAwJykudG9Mb2NhbGVEYXRlU3RyaW5nKCdlcy1DTCcsIHsgd2Vla2RheTogJ3Nob3J0JywgZGF5OiAnbnVtZXJpYycsIG1vbnRoOiAnc2hvcnQnIH0pLnJlcGxhY2UoJy4nLCAnJyk7CmFzeW5jIGZ1bmN0aW9uIHJlbmRlclByb2R1Y3RzKCkgewogIGNvbnN0IGJveCA9ICQoJyNwcm9kUGFuZWwnKTsgaWYgKCFib3gpIHJldHVybjsKICBjb25zdCBpc0FkbWluID0gbWUudXNlci5yb2xlID09PSAnYWRtaW4nOwogIGNvbnN0IG5vTW9uZXkgPSB0YWIgPT09ICd1bml0cyc7IC8vIHNlY2Npw7NuIHNpbiBwcmVjaW9zIChmdWxmaWxsbWVudCAvIGFkbWluaXN0cmFkb3IpCiAgY29uc3Qgc2lkID0gbm9Nb25leSA/IHN0b3JlLmdldCgndW5pdHNTZWxsZXInLCAnJykgOiBpc0FkbWluID8gc3RvcmUuZ2V0KCdzYWxlc1NlbGxlcicsICcnKSA6ICcnOwogIGNvbnN0IFtmcm9tLCB0b10gPSBwcFJhbmdlKCk7CiAgY29uc3QgcXMgPSBgZnJvbT0ke2Zyb219JnRvPSR7dG99JHtzaWQgPyAnJnNlbGxlcl9pZD0nICsgc2lkIDogJyd9JHtub01vbmV5ID8gJyZub21vbmV5PTEnIDogJyd9YDsKICBib3guaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9InBhbmVsLWhlYWQiIHN0eWxlPSJmbGV4LXdyYXA6d3JhcDtnYXA6MTBweCI+JHtub01vbmV5ID8gJycgOiAnPGgyPlByb2R1Y3RvcyB2ZW5kaWRvczwvaDI+J30KICAgIDxzZWxlY3QgaWQ9InBwTW9kZSIgc3R5bGU9IndpZHRoOmF1dG8iPiR7W1snd2VlaycsICdTZW1hbmEgKGx1bmVzIGEgZG9taW5nbyknXSwgWydtb250aCcsICdFc3RlIG1lcyddLCBbJzMwJywgJ8OabHRpbW9zIDMwIGTDrWFzJ10sIFsneWVhcicsICdFc3RlIGHDsW8nXSwgWydjdXN0b20nLCAnRWxlZ2lyIGZlY2hhc+KApiddXS5tYXAoKFtrLCBuXSkgPT4gYDxvcHRpb24gdmFsdWU9IiR7a30iICR7cHAubW9kZSA9PT0gayA/ICdzZWxlY3RlZCcgOiAnJ30+JHtufTwvb3B0aW9uPmApLmpvaW4oJycpfTwvc2VsZWN0PgogICAgJHtwcC5tb2RlID09PSAnd2VlaycgPyBgPHNwYW4gY2xhc3M9InBwLXdlZWsiPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGlkPSJwcFByZXYiIGFyaWEtbGFiZWw9IlNlbWFuYSBhbnRlcmlvciI+4oC5PC9idXR0b24+PGI+JHtlc2MoZm10RChmcm9tKSl9IOKAkyAke2VzYyhmbXREKHRvKSl9PC9iPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGlkPSJwcE5leHQiIGFyaWEtbGFiZWw9IlNlbWFuYSBzaWd1aWVudGUiICR7cHAud2VlayA+PSAwID8gJ2Rpc2FibGVkJyA6ICcnfT7igLo8L2J1dHRvbj48L3NwYW4+YCA6ICcnfQogICAgJHtwcC5tb2RlID09PSAnY3VzdG9tJyA/IGA8c3BhbiBjbGFzcz0icHAtd2VlayI+PGlucHV0IHR5cGU9ImRhdGUiIGlkPSJwcEZyb20iIHZhbHVlPSIke2Zyb219IiBzdHlsZT0id2lkdGg6YXV0byI+IGEgPGlucHV0IHR5cGU9ImRhdGUiIGlkPSJwcFRvIiB2YWx1ZT0iJHt0b30iIHN0eWxlPSJ3aWR0aDphdXRvIj48L3NwYW4+YCA6ICcnfQogICAgPGlucHV0IHR5cGU9InNlYXJjaCIgaWQ9InBwUSIgcGxhY2Vob2xkZXI9IkJ1c2NhciBwcm9kdWN0byBvIFNLVSIgdmFsdWU9IiR7ZXNjKHBwLnEpfSIgc3R5bGU9IndpZHRoOmF1dG87bWluLXdpZHRoOjE5MHB4Ij4KICAgIDxzcGFuIGNsYXNzPSJzcGFjZXIiIHN0eWxlPSJmbGV4OjEiPjwvc3Bhbj4KICAgIDxhIGNsYXNzPSJidG4gYnRuLXByaW1hcnkgYnRuLXNtIiBpZD0icHBYbHMiIGhyZWY9Ii9hcGkvc2FsZXMvcHJvZHVjdHMueGxzeD8ke3FzfSI+JHtJLmRvd259RGVzY2FyZ2FyIEV4Y2VsPC9hPjwvZGl2PgogICAgPGRpdiBjbGFzcz0icGFuZWwtYm9keSIgaWQ9InBwQm9keSI+PGRpdiBjbGFzcz0ibXV0ZWQiPkNhcmdhbmRvIHByb2R1Y3Rvc+KApjwvZGl2PjwvZGl2PmA7CiAgJCgnI3BwTW9kZScpLm9uY2hhbmdlID0gZSA9PiB7IHBwLm1vZGUgPSBlLnRhcmdldC52YWx1ZTsgcHAud2VlayA9IDA7IGlmIChwcC5tb2RlID09PSAnY3VzdG9tJyAmJiAhcHAuZnJvbSkgeyBjb25zdCBbZiwgdF0gPSBwcFJhbmdlKCk7IHBwLmZyb20gPSBmOyBwcC50byA9IHQ7IH0gcmVuZGVyUHJvZHVjdHMoKTsgfTsKICBpZiAoJCgnI3BwUHJldicpKSB7ICQoJyNwcFByZXYnKS5vbmNsaWNrID0gKCkgPT4geyBwcC53ZWVrLS07IHJlbmRlclByb2R1Y3RzKCk7IH07ICQoJyNwcE5leHQnKS5vbmNsaWNrID0gKCkgPT4geyBpZiAocHAud2VlayA8IDApIHsgcHAud2VlaysrOyByZW5kZXJQcm9kdWN0cygpOyB9IH07IH0KICBpZiAoJCgnI3BwRnJvbScpKSB7IGNvbnN0IGNoID0gKCkgPT4geyBwcC5mcm9tID0gJCgnI3BwRnJvbScpLnZhbHVlOyBwcC50byA9ICQoJyNwcFRvJykudmFsdWU7IHJlbmRlclByb2R1Y3RzKCk7IH07ICQoJyNwcEZyb20nKS5vbmNoYW5nZSA9IGNoOyAkKCcjcHBUbycpLm9uY2hhbmdlID0gY2g7IH0KICBsZXQgZDsKICB0cnkgeyBkID0gYXdhaXQgYXBpKCcvYXBpL3NhbGVzL3Byb2R1Y3RzPycgKyBxcyk7IH0gY2F0Y2ggKGUpIHsgJCgnI3BwQm9keScpLmlubmVySFRNTCA9IGVzYyhlLm1lc3NhZ2UpOyByZXR1cm47IH0KICBjb25zdCBkcmF3ID0gKCkgPT4gewogICAgaWYgKCEkKCcjcHBCb2R5JykpIHJldHVybjsKICAgIGNvbnN0IHEgPSBwcC5xLnRvTG93ZXJDYXNlKCk7CiAgICBjb25zdCByb3dzID0gZC5yb3dzLmZpbHRlcihyID0+ICFxIHx8IFtyLm5hbWUsIHIucHViX2lkLCByLnNlbGxlciwgLi4uci52YXJpYW50cy5tYXAodiA9PiB2LnZhcmlhbnQgKyAnICcgKyB2LnNrdSldLmpvaW4oJyAnKS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHEpKTsKICAgIGNvbnN0IGRheXMgPSBbXTsgZm9yIChsZXQgeCA9IG5ldyBEYXRlKGZyb20gKyAnVDEyOjAwOjAwJyk7IGlzbyh4KSA8PSB0byAmJiBkYXlzLmxlbmd0aCA8IDQwMDsgeC5zZXREYXRlKHguZ2V0RGF0ZSgpICsgMSkpIGRheXMucHVzaChpc28oeCkpOwogICAgY29uc3Qgd2Vla2x5ID0gZGF5cy5sZW5ndGggPD0gNywgYWxsID0gIXNpZCAmJiAoaXNBZG1pbiB8fCBub01vbmV5KTsKICAgIGNvbnN0IHBwTWtzID0gbWtMaXN0KGQucm93cy5mbGF0TWFwKHIgPT4gT2JqZWN0LmtleXMoci5ieU1rIHx8IHt9KS5maWx0ZXIoayA9PiByLmJ5TWtba10pKSk7CiAgICBjb25zdCB0b3QgPSBrID0+IHJvd3MucmVkdWNlKChhLCByKSA9PiBhICsgKHR5cGVvZiBrID09PSAnZnVuY3Rpb24nID8gayhyKSA6IHJba10pLCAwKTsKICAgIGNvbnN0IGhlYWQgPSBgJHthbGwgPyAnPHRoPlZlbmRlZG9yPC90aD4nIDogJyd9PHRoPlB1YmxpY2FjacOzbjwvdGg+PHRoPklEIC8gU0tVPC90aD4ke3dlZWtseSA/IGRheXMubWFwKHggPT4gYDx0aCBjbGFzcz0ibnVtIj4ke2VzYyhmbXREKHgpLnNwbGl0KCcgJylbMF0ucmVwbGFjZSgnLCcsICcnKSl9PHNtYWxsPiR7eC5zbGljZSg4KX08L3NtYWxsPjwvdGg+YCkuam9pbignJykgOiBwcE1rcy5tYXAoayA9PiBgPHRoIGNsYXNzPSJudW0iPjxpIGNsYXNzPSJkb3QiIHN0eWxlPSJiYWNrZ3JvdW5kOiR7TUtfQ09MT1Jba119Ij48L2k+JHtNS1trXX08L3RoPmApLmpvaW4oJycpfTx0aCBjbGFzcz0ibnVtIj5Ub3RhbDwvdGg+JHtub01vbmV5ID8gJzx0aCBjbGFzcz0ibnVtIj5WZW50YXM8L3RoPicgOiAnPHRoIGNsYXNzPSJudW0iPk1vbnRvPC90aD4nfWA7CiAgICBjb25zdCBjZWxsUSA9IG4gPT4gbiA/IGA8Yj4ke259PC9iPmAgOiAnPHNwYW4gY2xhc3M9Inplcm8iPsK3PC9zcGFuPic7CiAgICBjb25zdCBudW1zID0gciA9PiBgJHt3ZWVrbHkgPyBkYXlzLm1hcCh4ID0+IGA8dGQgY2xhc3M9Im51bSI+JHtjZWxsUShyLmJ5RGF5W3hdIHx8IDApfTwvdGQ+YCkuam9pbignJykgOiBwcE1rcy5tYXAoayA9PiBgPHRkIGNsYXNzPSJudW0iPiR7Y2VsbFEoci5ieU1rW2tdIHx8IDApfTwvdGQ+YCkuam9pbignJyl9PHRkIGNsYXNzPSJudW0gcHAtdG90YWwiPiR7ci5xdHl9PC90ZD48dGQgY2xhc3M9Im51bSI+JHtub01vbmV5ID8gci5vcmRlcnMgOiBtb25leShyLmFtb3VudCl9PC90ZD5gOwogICAgLy8gdW5hIGZpbGEgcG9yIHB1YmxpY2FjacOzbjsgY29uIGxhIGZsZWNoYSBzZSBkZXNwbGllZ2FuIHN1cyB2YXJpYW50ZXMKICAgIC8vIEVuIFZlbnRhcyBlbCBsaXN0YWRvIHBhcnRlIHJlY29naWRvIChzZSB2ZW4gbGFzIHByaW1lcmFzIDgpOyBjb24gZWwgYm90w7NuIHNlIGRlc3BsaWVnYSBjb21wbGV0bwogICAgY29uc3QgTElNID0gOCwgY29sbGFwc2VkID0gIW5vTW9uZXkgJiYgIXBwLmZ1bGwgJiYgIXEgJiYgcm93cy5sZW5ndGggPiBMSU07CiAgICBjb25zdCBzaG93biA9IGNvbGxhcHNlZCA/IHJvd3Muc2xpY2UoMCwgTElNKSA6IHJvd3M7CiAgICBjb25zdCBib2R5ID0gc2hvd24ubWFwKHIgPT4gewogICAgICAvLyBsYSBmaWxhIG11ZXN0cmEgbGEgcHVibGljYWNpw7NuIGNvbXBsZXRhICh0b2RhcyBzdXMgdmFyaWFudGVzIHN1bWFkYXMpOyBsYXMgdmFyaWFudGVzIHNvbG8gYWwgZGVzcGxlZ2FyCiAgICAgIGNvbnN0IGtleSA9IHIuc2VsbGVyICsgJ3wnICsgci5tYXJrZXRwbGFjZSArICd8JyArIChyLnB1Yl9pZCB8fCByLm5hbWUpLCBvcGVuID0gcHAub3Blbi5oYXMoa2V5KSwgbnYgPSByLnZhcmlhbnRzLmZpbHRlcih2ID0+IHYudmFyaWFudCB8fCB2LnNrdSkubGVuZ3RoLCBtYW55ID0gbnYgPiAwOwogICAgICBsZXQgaCA9IGA8dHIgY2xhc3M9InBwLXB1YiR7bWFueSA/ICcgcHAtY2FuJyA6ICcnfSIgJHttYW55ID8gYGRhdGEtcGs9IiR7ZXNjKGtleSl9ImAgOiAnJ30+JHthbGwgPyBgPHRkPiR7ZXNjKHIuc2VsbGVyKX08L3RkPmAgOiAnJ308dGQ+JHttYW55ID8gYDxzcGFuIGNsYXNzPSJwcC1hcnJvdyI+JHtvcGVuID8gJ+KWvicgOiAn4pa4J308L3NwYW4+YCA6ICc8c3BhbiBjbGFzcz0icHAtYXJyb3ciPjwvc3Bhbj4nfTxzcGFuIGNsYXNzPSJtayAke3IubWFya2V0cGxhY2V9IiBzdHlsZT0ibWFyZ2luLXJpZ2h0OjZweCI+JHtNS1tyLm1hcmtldHBsYWNlXSB8fCAnJ308L3NwYW4+PHNwYW4gY2xhc3M9InBwLW5hbWUiPiR7ZXNjKHIubmFtZSl9PC9zcGFuPiR7bWFueSA/IGA8c21hbGwgY2xhc3M9Im11dGVkIHBwLXN1YiI+JHtudn0gdmFyaWFudGUke252ID09PSAxID8gJycgOiAncyd9IHZlbmRpZGEke252ID09PSAxID8gJycgOiAncyd9IMK3ICR7b3BlbiA/ICd0b2NhIHBhcmEgb2N1bHRhcicgOiAndG9jYSBwYXJhIHZlcid9PC9zbWFsbD5gIDogJyd9PC90ZD48dGQgY2xhc3M9Im1vbm8iPiR7ZXNjKHIucHViX2lkIHx8ICcnKX08L3RkPiR7bnVtcyhyKX08L3RyPmA7CiAgICAgIGlmIChtYW55ICYmIG9wZW4pIGggKz0gci52YXJpYW50cy5tYXAodiA9PiBgPHRyIGNsYXNzPSJwcC12YXIiPiR7YWxsID8gJzx0ZD48L3RkPicgOiAnJ308dGQ+PHNwYW4gY2xhc3M9InBwLXZuYW1lIj4ke2VzYyh2LnZhcmlhbnQgfHwgJ1NpbiB2YXJpYW50ZScpfTwvc3Bhbj48L3RkPjx0ZCBjbGFzcz0ibW9ubyI+JHtlc2Modi5za3UgfHwgJycpfTwvdGQ+JHtudW1zKHYpfTwvdHI+YCkuam9pbignJyk7CiAgICAgIHJldHVybiBoOwogICAgfSkuam9pbignJyk7CiAgICBjb25zdCBmb290ID0gYDx0cj4ke2FsbCA/ICc8dGQ+PC90ZD4nIDogJyd9PHRkPjxiPlRvdGFsICgke3Jvd3MubGVuZ3RofSBwdWJsaWNhY2kke3Jvd3MubGVuZ3RoID09PSAxID8gJ8OzbicgOiAnb25lcyd9KTwvYj48L3RkPjx0ZD48L3RkPiR7d2Vla2x5ID8gZGF5cy5tYXAoeCA9PiBgPHRkIGNsYXNzPSJudW0iPjxiPiR7dG90KHIgPT4gci5ieURheVt4XSB8fCAwKX08L2I+PC90ZD5gKS5qb2luKCcnKSA6IHBwTWtzLm1hcChrID0+IGA8dGQgY2xhc3M9Im51bSI+PGI+JHt0b3QociA9PiByLmJ5TWtba10gfHwgMCl9PC9iPjwvdGQ+YCkuam9pbignJyl9PHRkIGNsYXNzPSJudW0gcHAtdG90YWwiPiR7dG90KCdxdHknKX08L3RkPjx0ZCBjbGFzcz0ibnVtIj48Yj4ke25vTW9uZXkgPyB0b3QoJ29yZGVycycpIDogbW9uZXkodG90KCdhbW91bnQnKSl9PC9iPjwvdGQ+PC90cj5gOwogICAgY29uc3Qgbm90ZSA9IGQuaGlzdG9yeVNpbmNlICYmIGZyb20gPCBkLmhpc3RvcnlTaW5jZSA/IGA8cCBjbGFzcz0icHAtbm90ZSI+RXN0YW1vcyB0cmF5ZW5kbyB0dSBoaXN0b3JpYWwgZGUgdmVudGFzIGRlIGEgcG9jbyAoaGFzdGEgMSBhw7FvKS4gUG9yIGFob3JhIGhheSBkYXRvcyBjb21wbGV0b3MgZGVzZGUgZWwgJHtlc2MoZm10RChkLmhpc3RvcnlTaW5jZSkpfTsgZWwgcmVzdG8gYXBhcmVjZSBzb2xvIGVuIGxhcyBwcsOzeGltYXMgaG9yYXMuPC9wPmAgOiAnJzsKICAgIGNvbnN0IGNhbk9wZW4gPSByID0+IHIudmFyaWFudHMuc29tZSh2ID0+IHYudmFyaWFudCB8fCB2LnNrdSk7CiAgICBjb25zdCBleHBhbmRCdG4gPSByb3dzLnNvbWUoY2FuT3BlbikgPyBgPGRpdiBzdHlsZT0ibWFyZ2luOjAgMCA4cHgiPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGlkPSJwcEFsbCI+JHtyb3dzLmZpbHRlcihjYW5PcGVuKS5ldmVyeShyID0+IHBwLm9wZW4uaGFzKHIuc2VsbGVyICsgJ3wnICsgci5tYXJrZXRwbGFjZSArICd8JyArIChyLnB1Yl9pZCB8fCByLm5hbWUpKSkgPyAnT2N1bHRhciB2YXJpYW50ZXMnIDogJ1ZlciB0b2RhcyBsYXMgdmFyaWFudGVzJ308L2J1dHRvbj48L2Rpdj5gIDogJyc7CiAgICBjb25zdCB2aXogPSBub01vbmV5ICYmIHJvd3MubGVuZ3RoID8gdW5pdHNWaXooZCwgcm93cywgZnJvbSwgdG8sIGFsbCkgOiAnJzsKICAgICQoJyNwcEJvZHknKS5pbm5lckhUTUwgPSB2aXogKyBub3RlICsgZXhwYW5kQnRuICsgKHJvd3MubGVuZ3RoID8gYCR7dml6ID8gJzxoMyBjbGFzcz0idXYtaCI+RGV0YWxsZSBwb3IgcHVibGljYWNpw7NuIDxzbWFsbD5Ub2NhIHVuYSBwdWJsaWNhY2nDs24gcGFyYSB2ZXIgc3VzIHZhcmlhbnRlczwvc21hbGw+PC9oMz4nIDogJyd9PGRpdiBjbGFzcz0idGFibGUtd3JhcCI+PHRhYmxlIGNsYXNzPSJwcC10YWJsZSI+PHRoZWFkPjx0cj4ke2hlYWR9PC90cj48L3RoZWFkPjx0Ym9keT4ke2JvZHl9PC90Ym9keT48dGZvb3Q+JHtmb290fTwvdGZvb3Q+PC90YWJsZT48L2Rpdj5gIDogYDxkaXYgY2xhc3M9ImVtcHR5Ij4ke3EgPyAnTmluZ8O6biBwcm9kdWN0byBjb2luY2lkZSBjb24gbGEgYsO6c3F1ZWRhLicgOiAnTm8gaGF5IHByb2R1Y3RvcyB2ZW5kaWRvcyBlbiBlc3RhcyBmZWNoYXMuJ308L2Rpdj5gKTsKICAgIGlmICghbm9Nb25leSAmJiAhcSAmJiByb3dzLmxlbmd0aCA+IExJTSkgJCgnI3BwQm9keScpLmluc2VydEFkamFjZW50SFRNTCgnYmVmb3JlZW5kJywgYDxkaXYgY2xhc3M9InBwLW1vcmUiPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGlkPSJwcEZ1bGwiPiR7cHAuZnVsbCA/ICdSZWNvZ2VyIGxpc3RhZG8g4pa0JyA6IGBWZXIgbGlzdGFkbyBjb21wbGV0byAoJHtyb3dzLmxlbmd0aH0gcHVibGljYWNpb25lcykg4pa+YH08L2J1dHRvbj48L2Rpdj5gKTsKICB9OwogIGRyYXcoKTsKICBpZiAobm9Nb25leSkgZHJhd1VuaXRDaGFydHMoZCwgZnJvbSwgdG8pOwogICQoJyNwcEJvZHknKS5vbm1vdXNlbW92ZSA9IGUgPT4gewogICAgY29uc3QgdGlwRWwgPSAkKCcjY2hUaXAyJyk7IGlmICghdGlwRWwpIHJldHVybjsKICAgIGNvbnN0IGggPSBlLnRhcmdldC5jbG9zZXN0KCcuY2gtaGl0Jyk7IGlmICghaCkgeyB0aXBFbC5oaWRkZW4gPSB0cnVlOyByZXR1cm47IH0KICAgIGNvbnN0IFt0LCAuLi5yZXN0XSA9IGguZGF0YXNldC50aXAuc3BsaXQoJ3wnKTsKICAgIHRpcEVsLmlubmVySFRNTCA9IGA8Yj4ke2VzYyh0KX08L2I+JHtyZXN0Lm1hcChyID0+IGA8ZGl2PiR7ZXNjKHIpfTwvZGl2PmApLmpvaW4oJycpfWA7IHRpcEVsLmhpZGRlbiA9IGZhbHNlOwogICAgdGlwRWwuc3R5bGUubGVmdCA9IE1hdGgubWluKGUuY2xpZW50WCArIDE0LCBpbm5lcldpZHRoIC0gdGlwRWwub2Zmc2V0V2lkdGggLSA4KSArICdweCc7IHRpcEVsLnN0eWxlLnRvcCA9IChlLmNsaWVudFkgKyAxNCkgKyAncHgnOwogIH07CiAgJCgnI3BwQm9keScpLm9ubW91c2VsZWF2ZSA9ICgpID0+IHsgY29uc3QgdCA9ICQoJyNjaFRpcDInKTsgaWYgKHQpIHQuaGlkZGVuID0gdHJ1ZTsgfTsKICAkKCcjcHBCb2R5Jykub25jbGljayA9IGUgPT4gewogICAgaWYgKGUudGFyZ2V0LmNsb3Nlc3QoJyNwcEZ1bGwnKSkgeyBwcC5mdWxsID0gIXBwLmZ1bGw7IGRyYXcoKTsgaWYgKCFwcC5mdWxsKSAkKCcjcHJvZFBhbmVsJyk/LnNjcm9sbEludG9WaWV3KHsgYmxvY2s6ICdzdGFydCcsIGJlaGF2aW9yOiAnc21vb3RoJyB9KTsgcmV0dXJuOyB9CiAgICBpZiAoZS50YXJnZXQuY2xvc2VzdCgnI3BwQWxsJykpIHsKICAgICAgY29uc3Qga2V5cyA9IGQucm93cy5maWx0ZXIociA9PiByLnZhcmlhbnRzLnNvbWUodiA9PiB2LnZhcmlhbnQgfHwgdi5za3UpKS5tYXAociA9PiByLnNlbGxlciArICd8JyArIHIubWFya2V0cGxhY2UgKyAnfCcgKyAoci5wdWJfaWQgfHwgci5uYW1lKSk7CiAgICAgIGNvbnN0IGFsbE9wZW4gPSBrZXlzLmV2ZXJ5KGsgPT4gcHAub3Blbi5oYXMoaykpOwogICAgICBrZXlzLmZvckVhY2goayA9PiBhbGxPcGVuID8gcHAub3Blbi5kZWxldGUoaykgOiBwcC5vcGVuLmFkZChrKSk7IGRyYXcoKTsgaWYgKG5vTW9uZXkpIGRyYXdVbml0Q2hhcnRzKGQsIGZyb20sIHRvKTsgcmV0dXJuOwogICAgfQogICAgY29uc3QgdHIgPSBlLnRhcmdldC5jbG9zZXN0KCd0cltkYXRhLXBrXScpOyBpZiAoIXRyKSByZXR1cm47CiAgICBjb25zdCBrID0gdHIuZGF0YXNldC5wazsgcHAub3Blbi5oYXMoaykgPyBwcC5vcGVuLmRlbGV0ZShrKSA6IHBwLm9wZW4uYWRkKGspOyBkcmF3KCk7IGlmIChub01vbmV5KSBkcmF3VW5pdENoYXJ0cyhkLCBmcm9tLCB0byk7CiAgfTsKICAkKCcjcHBRJykub25pbnB1dCA9IGUgPT4geyBwcC5xID0gZS50YXJnZXQudmFsdWU7IGRyYXcoKTsgaWYgKG5vTW9uZXkpIGRyYXdVbml0Q2hhcnRzKGQsIGZyb20sIHRvKTsgfTsKfQpjb25zdCBNS19DT0xPUiA9IHsgbWw6ICcjQzk5QTAwJywgZmE6ICcjNEY4RjAwJywgcGE6ICcjMDA2OEI4JyB9OyAvLyBjb2xvcmVzIGRlIGNhZGEgbWFya2V0cGxhY2UgKHZhbGlkYWRvcyBwYXJhIGRhbHRvbmlzbW8sIGNvbiBldGlxdWV0YXMgeSBzZXBhcmFjacOzbikKY29uc3QgbW9uZXkgPSBuID0+ICckJyArIE1hdGgucm91bmQobikudG9Mb2NhbGVTdHJpbmcoJ2VzLUNMJyk7CmNvbnN0IG1vbmV5U2hvcnQgPSBuID0+IG4gPj0gMWU2ID8gJyQnICsgKG4gLyAxZTYpLnRvRml4ZWQoMSkucmVwbGFjZSgnLicsICcsJykucmVwbGFjZSgnLDAnLCAnJykgKyAnIE0nIDogbiA+PSAxZTQgPyAnJCcgKyBNYXRoLnJvdW5kKG4gLyAxZTMpICsgJyBtaWwnIDogbW9uZXkobik7CmNvbnN0IGRheVNob3J0ID0gZCA9PiB7IGNvbnN0IHggPSBuZXcgRGF0ZShkICsgJ1QxMjowMDowMCcpOyByZXR1cm4geC50b0xvY2FsZURhdGVTdHJpbmcoJ2VzLUNMJywgeyB3ZWVrZGF5OiAnc2hvcnQnIH0pLnJlcGxhY2UoJy4nLCAnJykgKyAnICcgKyB4LmdldERhdGUoKTsgfTsKY29uc3QgZGF5TG9uZyA9IGQgPT4gbmV3IERhdGUoZCArICdUMTI6MDA6MDAnKS50b0xvY2FsZURhdGVTdHJpbmcoJ2VzLUNMJywgeyB3ZWVrZGF5OiAnbG9uZycsIGRheTogJ251bWVyaWMnLCBtb250aDogJ2xvbmcnIH0pOwpjb25zdCBuaWNlTWF4ID0gdiA9PiB7IGlmICh2IDw9IDApIHJldHVybiAxMDAwMDsgY29uc3QgcCA9IE1hdGgucG93KDEwLCBNYXRoLmZsb29yKE1hdGgubG9nMTAodikpKTsgY29uc3QgZiA9IHYgLyBwOyByZXR1cm4gKGYgPD0gMSA/IDEgOiBmIDw9IDIgPyAyIDogZiA8PSAyLjUgPyAyLjUgOiBmIDw9IDUgPyA1IDogMTApICogcDsgfTsKZnVuY3Rpb24gYmFyUGF0aCh4LCB5LCB3LCBoLCByKSB7CiAgaWYgKGggPD0gMCkgcmV0dXJuICcnOwogIHIgPSBNYXRoLm1pbihyLCBoLCB3IC8gMik7CiAgcmV0dXJuIGBNJHt4fSwke3kgKyBofVYke3kgKyByfVEke3h9LCR7eX0gJHt4ICsgcn0sJHt5fUgke3ggKyB3IC0gcn1RJHt4ICsgd30sJHt5fSAke3ggKyB3fSwke3kgKyByfVYke3kgKyBofVpgOwp9Ci8vIEdyw6FmaWNvIGRlIGNvbHVtbmFzICh1bmEgc2VyaWUpIG8gY29sdW1uYXMgYXBpbGFkYXMgKHZhcmlhcykuIFRvb2x0aXAgcG9yIGNvbHVtbmEuCmZ1bmN0aW9uIGNvbHVtbkNoYXJ0KGRheXMsIHN0YWNrcywgeyBoZWlnaHQgPSAyMzAsIHRvZGF5LCB3aWR0aCA9IDY0MCwgdW5pdHMgPSBmYWxzZSwgbGFiZWwsIHRpdGxlIH0gPSB7fSkgewogIGNvbnN0IGZtdFMgPSB1bml0cyA/IChuID0+IE1hdGgucm91bmQobikudG9Mb2NhbGVTdHJpbmcoJ2VzLUNMJykpIDogbW9uZXlTaG9ydCwgZm10TCA9IHVuaXRzID8gKG4gPT4gYCR7TWF0aC5yb3VuZChuKS50b0xvY2FsZVN0cmluZygnZXMtQ0wnKX0gdW5pZC5gKSA6IG1vbmV5OwogIGNvbnN0IFcgPSBNYXRoLm1heCgyODAsIHdpZHRoKSwgSCA9IGhlaWdodCwgTCA9IDQsIFIgPSA1MiwgVCA9IDI2LCBCID0gMzA7CiAgY29uc3QgdG90YWxzID0gZGF5cy5tYXAoKF8sIGkpID0+IHN0YWNrcy5yZWR1Y2UoKGEsIHMpID0+IGEgKyBzLnZhbHVlc1tpXS5hbW91bnQsIDApKTsKICBjb25zdCBtYXggPSB1bml0cyAmJiBNYXRoLm1heCguLi50b3RhbHMpIDw9IDAgPyAxMCA6IG5pY2VNYXgoTWF0aC5tYXgoLi4udG90YWxzKSAqIDEuMDgpOwogIGNvbnN0IHNsb3QgPSAoVyAtIEwgLSBSKSAvIGRheXMubGVuZ3RoLCBidyA9IE1hdGgubWluKDU2LCBzbG90ICogMC41OCk7CiAgY29uc3QgY29tcGFjdCA9IHNsb3QgPCA3NDsgLy8gY2FqYSBhbmdvc3RhIChjZWx1bGFyIC8gdGFyamV0YSBjaGljYSk6IG1lbm9zIGV0aXF1ZXRhcyBwYXJhIHF1ZSBubyBzZSBlbmNpbWVuCiAgbGV0IGJlc3RJID0gMDsgdG90YWxzLmZvckVhY2goKHQsIGkpID0+IHsgaWYgKHQgPiB0b3RhbHNbYmVzdEldKSBiZXN0SSA9IGk7IH0pOwogIGNvbnN0IHkgPSB2ID0+IFQgKyAoSCAtIFQgLSBCKSAqICgxIC0gdiAvIG1heCk7CiAgbGV0IGcgPSAnJzsKICBmb3IgKGNvbnN0IGYgb2YgWzAuNSwgMV0pIGcgKz0gYDxsaW5lIHgxPSIke0x9IiB4Mj0iJHtXIC0gUn0iIHkxPSIke3kobWF4ICogZil9IiB5Mj0iJHt5KG1heCAqIGYpfSIgc3Ryb2tlPSJ2YXIoLS1saW5lKSIgc3Ryb2tlLWRhc2hhcnJheT0iMyA0Ii8+PHRleHQgeD0iJHtXIC0gMn0iIHk9IiR7eShtYXggKiBmKSArIDR9IiB0ZXh0LWFuY2hvcj0iZW5kIiBjbGFzcz0iY2gtYXgiPiR7Zm10UyhtYXggKiBmKX08L3RleHQ+YDsKICBnICs9IGA8bGluZSB4MT0iJHtMfSIgeDI9IiR7VyAtIFJ9IiB5MT0iJHt5KDApfSIgeTI9IiR7eSgwKX0iIHN0cm9rZT0idmFyKC0tbGluZSkiLz5gOwogIGRheXMuZm9yRWFjaCgoZCwgaSkgPT4gewogICAgY29uc3QgeCA9IEwgKyBzbG90ICogaSArIChzbG90IC0gYncpIC8gMjsKICAgIGxldCBhY2MgPSAwOwogICAgY29uc3Qgc2VncyA9IHN0YWNrcy5maWx0ZXIocyA9PiBzLnZhbHVlc1tpXS5hbW91bnQgPiAwKTsKICAgIHNlZ3MuZm9yRWFjaCgocywgaykgPT4gewogICAgICBjb25zdCB2ID0gcy52YWx1ZXNbaV0uYW1vdW50LCB5MSA9IHkoYWNjICsgdiksIHkwID0geShhY2MpOwogICAgICBjb25zdCB0b3AgPSBrID09PSBzZWdzLmxlbmd0aCAtIDE7CiAgICAgIGNvbnN0IGggPSBNYXRoLm1heCgwLCB5MCAtIHkxIC0gKGsgPiAwID8gMiA6IDApKTsgLy8gMnB4IGRlIHNlcGFyYWNpw7NuIGVudHJlIHNlZ21lbnRvcwogICAgICBnICs9IHRvcCA/IGA8cGF0aCBkPSIke2JhclBhdGgoeCwgeTEsIGJ3LCBoLCA0KX0iIGZpbGw9IiR7cy5jb2xvcn0iLz5gIDogYDxyZWN0IHg9IiR7eH0iIHk9IiR7eTF9IiB3aWR0aD0iJHtid30iIGhlaWdodD0iJHtofSIgZmlsbD0iJHtzLmNvbG9yfSIvPmA7CiAgICAgIGFjYyArPSB2OwogICAgfSk7CiAgICBjb25zdCBpc1RvZGF5ID0gZCA9PT0gdG9kYXk7CiAgICBpZiAodG90YWxzW2ldID4gMCAmJiAoIWNvbXBhY3QgfHwgaXNUb2RheSB8fCBpID09PSBiZXN0SSkpIHsgY29uc3QgbGJsID0gZm10Uyh0b3RhbHNbaV0pLCBodyA9IGxibC5sZW5ndGggKiAzLjY7IGNvbnN0IGN4ID0gTWF0aC5taW4oTWF0aC5tYXgoeCArIGJ3IC8gMiwgTCArIGh3KSwgVyAtIFIgLSBodyArIDMwKTsgZyArPSBgPHRleHQgeD0iJHtjeH0iIHk9IiR7eSh0b3RhbHNbaV0pIC0gN30iIHRleHQtYW5jaG9yPSJtaWRkbGUiIGNsYXNzPSJjaC12YWwke2lzVG9kYXkgPyAnIGNoLXRvZGF5JyA6ICcnfSI+JHtsYmx9PC90ZXh0PmA7IH0KICAgIGcgKz0gYDx0ZXh0IHg9IiR7eCArIGJ3IC8gMn0iIHk9IiR7SCAtIDEwfSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgY2xhc3M9ImNoLWRheSR7aXNUb2RheSA/ICcgY2gtdG9kYXknIDogJyd9Ij4ke2xhYmVsID8gZXNjKGxhYmVsKGQpKSA6IGlzVG9kYXkgPyAnSG95JyA6IGNvbXBhY3QgPyBkYXlTaG9ydChkKS5zbGljZSgwLCAyKSArICcgJyArIGQuc2xpY2UoOCkucmVwbGFjZSgvXjAvLCAnJykgOiBkYXlTaG9ydChkKX08L3RleHQ+YDsKICAgIGNvbnN0IHRpcCA9IFt0aXRsZSA/IHRpdGxlKGQpIDogZGF5TG9uZyhkKSwgLi4uc3RhY2tzLm1hcChzID0+IGAke3MubGFiZWx9OiAke2ZtdEwocy52YWx1ZXNbaV0uYW1vdW50KX0ke3VuaXRzID8gJycgOiBgIMK3ICR7cy52YWx1ZXNbaV0ub3JkZXJzfSB2ZW50YSR7cy52YWx1ZXNbaV0ub3JkZXJzID09PSAxID8gJycgOiAncyd9YH1gKSwgc3RhY2tzLmxlbmd0aCA+IDEgPyBgVG90YWw6ICR7Zm10TCh0b3RhbHNbaV0pfWAgOiAnJ10uZmlsdGVyKEJvb2xlYW4pLmpvaW4oJ3wnKTsKICAgIGcgKz0gYDxyZWN0IHg9IiR7TCArIHNsb3QgKiBpfSIgeT0iJHtUIC0gMjB9IiB3aWR0aD0iJHtzbG90fSIgaGVpZ2h0PSIke0ggLSBUIC0gQiArIDIwfSIgZmlsbD0idHJhbnNwYXJlbnQiIGNsYXNzPSJjaC1oaXQiIGRhdGEtdGlwPSIke2VzYyh0aXApfSIvPmA7CiAgfSk7CiAgcmV0dXJuIGA8c3ZnIHZpZXdCb3g9IjAgMCAke1d9ICR7SH0iIHdpZHRoPSIke1d9IiBoZWlnaHQ9IiR7SH0iIGNsYXNzPSJjaGFydCIgcm9sZT0iaW1nIj4ke2d9PC9zdmc+YDsKfQpmdW5jdGlvbiBzYWxlc1RhYmxlKGRheXMsIGQsIGxibCkgewogIHJldHVybiBgPGRldGFpbHMgY2xhc3M9ImNoLXRhYmxlIj48c3VtbWFyeT5WZXIgdGFibGE8L3N1bW1hcnk+PGRpdiBjbGFzcz0idGFibGUtd3JhcCI+PHRhYmxlPjx0aGVhZD48dHI+PHRoPiR7bGJsID8gJ1BlcsOtb2RvJyA6ICdEw61hJ308L3RoPiR7T2JqZWN0LmtleXMoZC5zZXJpZXMpLm1hcChrID0+IGA8dGg+JHtNS1trXX08L3RoPmApLmpvaW4oJycpfTx0aD5Ub3RhbDwvdGg+PC90cj48L3RoZWFkPjx0Ym9keT4KICAgICR7ZGF5cy5tYXAoKGRheSwgaSkgPT4gYDx0cj48dGQ+JHtlc2MobGJsID8gbGJsKGkpIDogZGF5TG9uZyhkYXkpKX08L3RkPiR7T2JqZWN0LmtleXMoZC5zZXJpZXMpLm1hcChrID0+IGA8dGQ+JHttb25leShkLnNlcmllc1trXVtpXS5hbW91bnQpfSA8c3BhbiBjbGFzcz0ibXV0ZWQiPigke2Quc2VyaWVzW2tdW2ldLm9yZGVyc30pPC9zcGFuPjwvdGQ+YCkuam9pbignJyl9PHRkPjxiPiR7bW9uZXkoT2JqZWN0LmtleXMoZC5zZXJpZXMpLnJlZHVjZSgoYSwgaykgPT4gYSArIGQuc2VyaWVzW2tdW2ldLmFtb3VudCwgMCkpfTwvYj48L3RkPjwvdHI+YCkuam9pbignJyl9CiAgPC90Ym9keT48L3RhYmxlPjwvZGl2PjwvZGV0YWlscz5gOwp9Ci8vID09PT09IENhbGN1bGFkb3IgZGUgZ2FuYW5jaWEgcmVhbCBwb3IgcHVibGljYWNpw7NuID09PT09Ci8vIFRvZG8gc2UgY2FsY3VsYSBwb3IgdW5pZGFkIHkgTkVUTyAoc2luIElWQSk6IHByZWNpby8xLDE5IOKIkiBjb3N0by8xLDE5IOKIkiBjb21pc2nDs24vMSwxOSDiiJIgZW52w61vLzEsMTkg4oiSIHB1YmxpY2lkYWQuCi8vIEVsIFRBQ09TIGRlIE1lcmNhZG8gTGlicmUgZXMgbmV0byAoZ2FzdG8gc2luIElWQSBzb2JyZSB2ZW50YXMgY29uIElWQSk6IHB1YmxpY2lkYWQgbmV0YSA9IFRBQ09TJSDDlyBwcmVjaW8uCmNvbnN0IHBmID0geyBtazogbnVsbCwgcTogJycsIGRhdGE6IG51bGwsIHNpZDogbnVsbCwgc29ydDogJ3NvbGQnLCBwZXI6ICczMCcsIG1vbnRoOiAnJywgZnJvbTogJycsIHRvOiAnJyB9OwovLyBwZXLDrW9kbyBwYXJhIGxhcyB1bmlkYWRlcyB2ZW5kaWRhcyAocG9yIGRlZmVjdG8sIMO6bHRpbW9zIDMwIGTDrWFzKQpmdW5jdGlvbiBwZlJhbmdlKCkgewogIGNvbnN0IHQgPSBuZXcgRGF0ZSgpLCB0b2RheSA9IGlzbyh0KSwgYmFjayA9IG4gPT4geyBjb25zdCBkID0gbmV3IERhdGUoKTsgZC5zZXREYXRlKGQuZ2V0RGF0ZSgpIC0gbik7IHJldHVybiBpc28oZCk7IH07CiAgaWYgKHBmLnBlciA9PT0gJ3RvZGF5JykgcmV0dXJuIFt0b2RheSwgdG9kYXldOwogIGlmIChwZi5wZXIgPT09ICc3JykgcmV0dXJuIFtiYWNrKDYpLCB0b2RheV07CiAgaWYgKHBmLnBlciA9PT0gJ21vbnRoJykgcmV0dXJuIFt0b2RheS5zbGljZSgwLCA4KSArICcwMScsIHRvZGF5XTsKICBpZiAocGYucGVyID09PSAncGljaycgJiYgL15cZHs0fS1cZHsyfSQvLnRlc3QocGYubW9udGgpKSB7IGNvbnN0IFt5LCBtXSA9IHBmLm1vbnRoLnNwbGl0KCctJykubWFwKE51bWJlcik7IGNvbnN0IGxhc3QgPSBuZXcgRGF0ZSh5LCBtLCAwKS5nZXREYXRlKCk7IHJldHVybiBbcGYubW9udGggKyAnLTAxJywgcGYubW9udGggKyAnLScgKyBTdHJpbmcobGFzdCkucGFkU3RhcnQoMiwgJzAnKV07IH0KICBpZiAocGYucGVyID09PSAncmFuZ2UnICYmIHBmLmZyb20gJiYgcGYudG8pIHJldHVybiBwZi5mcm9tIDw9IHBmLnRvID8gW3BmLmZyb20sIHBmLnRvXSA6IFtwZi50bywgcGYuZnJvbV07CiAgcmV0dXJuIFtiYWNrKDI5KSwgdG9kYXldOwp9CmNvbnN0IHBmUXMgPSBzaWQgPT4geyBjb25zdCBbZiwgdF0gPSBwZlJhbmdlKCk7IHJldHVybiBgJHtzaWQgPyAnc2VsbGVyX2lkPScgKyBzaWQgKyAnJicgOiAnJ31mcm9tPSR7Zn0mdG89JHt0fWA7IH07CmNvbnN0IElWQSA9IDEuMTk7CmZ1bmN0aW9uIHBmQ2FsYyhyLCBzdikgewogIGNvbnN0IHByaWNlID0gci5wcmljZSB8fCAwOwogIGlmIChyLmNvc3Rfa2V5ICYmIHBmLmRhdGE/LnNhdmVkPy5bci5tayArICd8JyArIHIuY29zdF9rZXldPy5jb3N0ICE9IG51bGwgJiYgc3YuY29zdCA9PSBudWxsKSBzdiA9IHsgLi4uc3YsIGNvc3Q6IHBmLmRhdGEuc2F2ZWRbci5tayArICd8JyArIHIuY29zdF9rZXldLmNvc3QgfTsKICBjb25zdCBjb3N0ID0gc3YuY29zdCAhPSBudWxsID8gc3YuY29zdCA6IG51bGw7CiAgY29uc3QgZmVlUGN0ID0gci5tayA9PT0gJ21sJyA/IChwcmljZSA/IChyLmZlZSB8fCAwKSAvIHByaWNlICogMTAwIDogMCkgOiAoc3YuZmVlX3BjdCAhPSBudWxsID8gc3YuZmVlX3BjdCA6IHIuZmVlX3BjdCB8fCAwKTsKICBjb25zdCBmZWUgPSByLm1rID09PSAnbWwnID8gKHIuZmVlIHx8IDApIDogcHJpY2UgKiBmZWVQY3QgLyAxMDA7CiAgY29uc3Qgc2hpcCA9IHN2LnNoaXAgIT0gbnVsbCA/IHN2LnNoaXAgOiAoci5zaGlwIHx8IDApOwogIGNvbnN0IHRhY29zID0gc3YudGFjb3MgIT0gbnVsbCA/IHN2LnRhY29zIDogKHIudGFjb3MgfHwgMCk7CiAgY29uc3QgYWRzID0gcHJpY2UgKiB0YWNvcyAvIDEwMDsKICBjb25zdCBwbiA9IHByaWNlIC8gSVZBOwogIGNvbnN0IHByb2ZpdCA9IGNvc3QgPT0gbnVsbCA/IG51bGwgOiBwbiAtIGNvc3QgLyBJVkEgLSBmZWUgLyBJVkEgLSBzaGlwIC8gSVZBIC0gYWRzOwogIHJldHVybiB7IHByaWNlLCBjb3N0LCBmZWUsIGZlZVBjdCwgc2hpcCwgdGFjb3MsIGFkcywgcG4sIHByb2ZpdCwgbWFyZ2luOiBwcm9maXQgPT0gbnVsbCB8fCAhcG4gPyBudWxsIDogcHJvZml0IC8gcG4gKiAxMDAgfTsKfQphc3luYyBmdW5jdGlvbiByZW5kZXJQcm9maXQoZm9yY2UgPSBmYWxzZSkgewogIGNvbnN0IGJveCA9ICQoJyNwcm9maXRQYW5lbCcpOyBpZiAoIWJveCkgcmV0dXJuOwogIGlmIChib3guY29udGFpbnMoZG9jdW1lbnQuYWN0aXZlRWxlbWVudCkgJiYgZG9jdW1lbnQuYWN0aXZlRWxlbWVudC50YWdOYW1lID09PSAnSU5QVVQnKSByZXR1cm47IC8vIG5vIGJvcnJhciBsbyBxdWUgc2UgZXN0w6EgZXNjcmliaWVuZG8KICBjb25zdCBpc0FkbWluID0gbWUudXNlci5yb2xlID09PSAnYWRtaW4nOwogIGNvbnN0IHNpZCA9IGlzQWRtaW4gPyBzdG9yZS5nZXQoJ3NhbGVzU2VsbGVyJywgJycpIDogJyc7CiAgaWYgKGlzQWRtaW4gJiYgIXNpZCkgeyBib3guaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj7wn5KwIENhbGN1bGFkb3IgZGUgZ2FuYW5jaWE8L2gyPjwvZGl2PjxkaXYgY2xhc3M9InBhbmVsLWJvZHkiPjxkaXYgY2xhc3M9ImVtcHR5Ij5FbGlnZSB1biB2ZW5kZWRvciBhcnJpYmEgKGVuICJUb2RhcyBsYXMgY3VlbnRhcyIpIHBhcmEgdmVyIGxhIGdhbmFuY2lhIHJlYWwgZGUgY2FkYSBwdWJsaWNhY2nDs24uPC9kaXY+PC9kaXY+YDsgcmV0dXJuOyB9CiAgaWYgKCFwZi5kYXRhIHx8IHBmLnNpZCAhPT0gc2lkIHx8IGZvcmNlKSB7CiAgICBpZiAoIXBmLmRhdGEgfHwgcGYuc2lkICE9PSBzaWQpIGJveC5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+PGgyPvCfkrAgQ2FsY3VsYWRvciBkZSBnYW5hbmNpYTwvaDI+PC9kaXY+PGRpdiBjbGFzcz0icGFuZWwtYm9keSBtdXRlZCI+Q2FyZ2FuZG8gcHVibGljYWNpb25lcywgY29taXNpb25lcywgZW52w61vcyB5IHB1YmxpY2lkYWTigKY8L2Rpdj5gOwogICAgdHJ5IHsgcGYuZGF0YSA9IGF3YWl0IGFwaShgL2FwaS9wcm9maXQ/JHtwZlFzKHNpZCl9JHtmb3JjZSA/ICcmcmVmcmVzaD0xJyA6ICcnfWApOyBwZi5zaWQgPSBzaWQ7IH0KICAgIGNhdGNoIChlKSB7IGJveC5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+PGgyPvCfkrAgQ2FsY3VsYWRvciBkZSBnYW5hbmNpYTwvaDI+PC9kaXY+PGRpdiBjbGFzcz0icGFuZWwtYm9keSI+JHtlc2MoZS5tZXNzYWdlKX08L2Rpdj5gOyByZXR1cm47IH0KICAgIGNsZWFyVGltZW91dChwZi5fdCk7IHBmLl90ID0gc2V0VGltZW91dCgoKSA9PiB7IGlmICh0YWIgPT09ICdzYWxlcycpIHJlbG9hZFByb2ZpdCgpOyB9LCBwZi5kYXRhLmxvYWRpbmcgPyA4MDAwIDogMTIwZTMpOwogIH0KICBkcmF3UHJvZml0KCk7Cn0KYXN5bmMgZnVuY3Rpb24gcmVsb2FkUHJvZml0KCkgewogIGlmICh0YWIgIT09ICdzYWxlcycgfHwgISQoJyNwcm9maXRQYW5lbCcpKSByZXR1cm47CiAgY29uc3QgYnVzeSA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ/LmNsYXNzTGlzdD8uY29udGFpbnMoJ3BmLWluJyk7CiAgaWYgKCFidXN5KSB7IHRyeSB7IGNvbnN0IGQgPSBhd2FpdCBhcGkoYC9hcGkvcHJvZml0PyR7cGZRcyhwZi5zaWQpfWApOyBkLnNhdmVkID0geyAuLi5kLnNhdmVkLCAuLi4ocGYuZGF0YT8uc2F2ZWQgfHwge30pIH07IHBmLmRhdGEgPSBkOyBkcmF3UHJvZml0KCk7IH0gY2F0Y2ggeyAvKiByZWludGVudGEgKi8gfSB9CiAgLy8gbWllbnRyYXMgY2FyZ2Egc2UgY29uc3VsdGEgc2VndWlkbzsgZGVzcHXDqXMgY2FkYSAyIG1pbnV0b3MgcGFyYSB0ZW5lciBsb3MgcHJlY2lvcyBkZSBwcm9tb2Npw7NuIGFsIGTDrWEKICBjbGVhclRpbWVvdXQocGYuX3QpOyBwZi5fdCA9IHNldFRpbWVvdXQocmVsb2FkUHJvZml0LCBidXN5IHx8IHBmLmRhdGE/LmxvYWRpbmcgPyA4MDAwIDogMTIwZTMpOwp9CmZ1bmN0aW9uIGRyYXdQcm9maXQoKSB7CiAgY29uc3QgYm94ID0gJCgnI3Byb2ZpdFBhbmVsJyk7IGlmICghYm94IHx8ICFwZi5kYXRhKSByZXR1cm47CiAgY29uc3QgZCA9IHBmLmRhdGE7CiAgY29uc3QgbWtzID0gT2JqZWN0LmtleXMoTUspLmZpbHRlcihrID0+IGQucm93cy5zb21lKHIgPT4gci5tayA9PT0gaykpOwogIGlmICghbWtzLmluY2x1ZGVzKHBmLm1rKSkgcGYubWsgPSBta3NbMF0gfHwgJ21sJzsKICBjb25zdCBzdk9mID0gciA9PiBkLnNhdmVkW3IubWsgKyAnfCcgKyByLmtleV0gfHwge307CiAgbGV0IHJvd3MgPSBkLnJvd3MuZmlsdGVyKHIgPT4gci5tayA9PT0gcGYubWspOwogIGlmIChwZi5xKSByb3dzID0gcm93cy5maWx0ZXIociA9PiBbci50aXRsZSwgci5za3UsIHIuaWRdLmpvaW4oJyAnKS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHBmLnEpKTsKICBjb25zdCBzb2xkID0gciA9PiByLm1rID09PSAnbWwnID8gKHIuc29sZCB8fCAwKSA6IChyLnVuaXRzOTAgfHwgMCk7CiAgcm93cy5zb3J0KChhLCBiKSA9PiBwZi5zb3J0ID09PSAndW5pdHMnID8gKGIudW5pdHMgfHwgMCkgLSAoYS51bml0cyB8fCAwKSA6IHBmLnNvcnQgPT09ICdtYXJnaW4nID8gKChwZkNhbGMoYSwgc3ZPZihhKSkubWFyZ2luID8/IDFlOSkgLSAocGZDYWxjKGIsIHN2T2YoYikpLm1hcmdpbiA/PyAxZTkpKSA6IHNvbGQoYikgLSBzb2xkKGEpKTsKICBjb25zdCBhbGwgPSBkLnJvd3MuZmlsdGVyKHIgPT4gci5tayA9PT0gcGYubWspLCB3aXRoQ29zdCA9IGFsbC5maWx0ZXIociA9PiBwZkNhbGMociwgc3ZPZihyKSkuY29zdCAhPSBudWxsKTsKICBjb25zdCBhdmdNID0gd2l0aENvc3QubGVuZ3RoID8gd2l0aENvc3QucmVkdWNlKChhLCByKSA9PiBhICsgKHBmQ2FsYyhyLCBzdk9mKHIpKS5tYXJnaW4gfHwgMCksIDApIC8gd2l0aENvc3QubGVuZ3RoIDogbnVsbDsKICBjb25zdCBuZWcgPSB3aXRoQ29zdC5maWx0ZXIociA9PiAocGZDYWxjKHIsIHN2T2YocikpLnByb2ZpdCB8fCAwKSA8IDApLmxlbmd0aDsKICAvLyB0b3RhbGVzIGRlbCBwZXLDrW9kbyAodW5pZGFkZXMgdmVuZGlkYXMgw5cgY29zdG8geSDDlyBnYW5hbmNpYSBwb3IgdW5pZGFkKQogIGxldCB0VSA9IDAsIHRTYWxlID0gMCwgdENvc3QgPSAwLCB0UHJvZml0ID0gMCwgdE1pc3NpbmcgPSAwOwogIGZvciAoY29uc3QgciBvZiBhbGwpIHsgY29uc3QgYyA9IHBmQ2FsYyhyLCBzdk9mKHIpKSwgdSA9IHIudW5pdHMgfHwgMDsgdFUgKz0gdTsgdFNhbGUgKz0gYy5wcmljZSAqIHU7IGlmIChjLmNvc3QgPT0gbnVsbCkgeyBpZiAodSkgdE1pc3NpbmcgKz0gdTsgY29udGludWU7IH0gdENvc3QgKz0gYy5jb3N0ICogdTsgdFByb2ZpdCArPSBjLnByb2ZpdCAqIHU7IH0KICAvLyBnYW5hbmNpYSBwZXJkaWRhIHBvciBkZXZvbHVjaW9uZXMgKHRvZG9zIGxvcyBtYXJrZXRwbGFjZXMpOiBnYW5hbmNpYS91IMOXIHVuaWRhZGVzIGRldnVlbHRhcyBkZSBjYWRhIHB1YmxpY2FjacOzbjsKICAvLyBsYXMgZGV2b2x1Y2lvbmVzIHF1ZSBubyBjYWx6YW4gY29uIHVuYSBwdWJsaWNhY2nDs24gc2UgZXN0aW1hbiBjb24gZWwgbWFyZ2VuIGRlbCBtYXJrZXRwbGFjZQogIGxldCByZXRMb3N0ID0gMCwgYWxsUHJvZml0ID0gMDsgY29uc3QgbG9zdEJ5ID0ge307CiAgY29uc3QgbWtNID0ge307CiAgZm9yIChjb25zdCByIG9mIGQucm93cykgeyBjb25zdCBjID0gcGZDYWxjKHIsIHN2T2YocikpOyBpZiAoYy5jb3N0ID09IG51bGwpIGNvbnRpbnVlOyBhbGxQcm9maXQgKz0gYy5wcm9maXQgKiAoci51bml0cyB8fCAwKTsgY29uc3QgbSA9IG1rTVtyLm1rXSB8fD0geyBwOiAwLCBzOiAwIH07IG0ucCArPSBjLnByb2ZpdCAqIChyLnVuaXRzIHx8IDEpOyBtLnMgKz0gYy5wcmljZSAqIChyLnVuaXRzIHx8IDEpOwogICAgaWYgKHIucmV0X3VuaXRzKSB7IHJldExvc3QgKz0gYy5wcm9maXQgKiByLnJldF91bml0czsgbG9zdEJ5W3IubWtdID0gKGxvc3RCeVtyLm1rXSB8fCAwKSArIGMucHJvZml0ICogci5yZXRfdW5pdHM7IH0gfQogIGZvciAoY29uc3QgW2ssIGxdIG9mIE9iamVjdC5lbnRyaWVzKGQucmV0X2xvb3NlIHx8IHt9KSkgaWYgKG1rTVtrXT8ucykgeyBjb25zdCB2ID0gbC5hbW91bnQgKiBta01ba10ucCAvIG1rTVtrXS5zOyByZXRMb3N0ICs9IHY7IGxvc3RCeVtrXSA9IChsb3N0Qnlba10gfHwgMCkgKyB2OyB9CiAgcmV0TG9zdCA9IE1hdGgubWF4KDAsIE1hdGgucm91bmQocmV0TG9zdCkpOwogIC8vIGxvZ8Otc3RpY2EgaW52ZXJzYSAoY29uIElWQSk6IE1lcmNhZG8gTGlicmUgbGEgdHJhZSBkZSBsYSBBUEk7IEZhbGFiZWxsYSB5IFBhcmlzID0gbW9udG8gcG9yIGRldm9sdWNpw7NuIHF1ZSBwb25lIGVsIHZlbmRlZG9yCiAgY29uc3QgcmV2UGVyID0gayA9PiBkLnNhdmVkW2sgKyAnfFJFVF9MT0cnXT8uc2hpcCA/PyBudWxsOwogIGNvbnN0IHJldk9mID0gayA9PiAhZC5yZXR1cm5zID8gMCA6IGsgPT09ICdtbCcgPyAoZC5yZXR1cm5zLmJ5Lm1sLnJldiB8fCAwKSA6IChyZXZQZXIoaykgfHwgMCkgKiAoZC5yZXR1cm5zLmJ5W2tdLm4gfHwgMCk7CiAgY29uc3QgcmV2TmV0ID0gTWF0aC5yb3VuZChPYmplY3Qua2V5cyhkLnJldHVybnM/LmJ5IHx8IHt9KS5yZWR1Y2UoKGEsIGspID0+IGEgKyByZXZPZihrKSwgMCkgLyBJVkEpOwogIGNvbnN0IFtwRnJvbSwgcFRvXSA9IHBmUmFuZ2UoKTsKICBjb25zdCBmbXREID0geCA9PiBuZXcgRGF0ZSh4ICsgJ1QxMjowMDowMCcpLnRvTG9jYWxlRGF0ZVN0cmluZygnZXMtQ0wnLCB7IGRheTogJ251bWVyaWMnLCBtb250aDogJ3Nob3J0JyB9KTsKICBjb25zdCBpbnAgPSAociwgZiwgdiwgcGgsIHcpID0+IGA8aW5wdXQgY2xhc3M9InBmLWluIiB0eXBlPSJudW1iZXIiIGlucHV0bW9kZT0iZGVjaW1hbCIgc3RlcD0iYW55IiBtaW49IjAiIGRhdGEtaz0iJHtlc2Moci5rZXkpfSIgZGF0YS1mPSIke2Z9IiB2YWx1ZT0iJHt2ID09IG51bGwgPyAnJyA6IHZ9IiBwbGFjZWhvbGRlcj0iJHtlc2MocGgpfSIgc3R5bGU9IndpZHRoOiR7d31weCI+YDsKICBjb25zdCBwY3QgPSBuID0+IChNYXRoLnJvdW5kKG4gKiAxMCkgLyAxMCkudG9Mb2NhbGVTdHJpbmcoJ2VzLUNMJykgKyAnJSc7CiAgY29uc3Qgcm93SHRtbCA9IHIgPT4gewogICAgY29uc3Qgc3YgPSBzdk9mKHIpLCBjID0gcGZDYWxjKHIsIHN2KTsKICAgIGNvbnN0IGNscyA9IGMucHJvZml0ID09IG51bGwgPyAnJyA6IGMubWFyZ2luIDwgMCA/ICduZWcnIDogYy5tYXJnaW4gPCAxMCA/ICdsb3cnIDogJ29rJzsKICAgIGNvbnN0IHRpcCA9IGMucHJvZml0ID09IG51bGwgPyAnJyA6IGBQcmVjaW8gbmV0byAke21vbmV5KGMucG4pfSDiiJIgY29zdG8gJHttb25leShjLmNvc3QgLyBJVkEpfSDiiJIgY29taXNpw7NuICR7bW9uZXkoYy5mZWUgLyBJVkEpfSDiiJIgZW52w61vICR7bW9uZXkoYy5zaGlwIC8gSVZBKX0g4oiSIHB1YmxpY2lkYWQgJHttb25leShjLmFkcyl9ICh0b2RvIHNpbiBJVkEpYDsKICAgIHJldHVybiBgPHRyIGNsYXNzPSJwZi1yb3cgJHtjbHN9IiBkYXRhLWNrPSIke2VzYyhyLmNvc3Rfa2V5IHx8ICcnKX0iIGRhdGEtcms9IiR7ZXNjKHIua2V5KX0iPgogICAgICA8dGQ+PGRpdiBjbGFzcz0icGYtcHJvZCI+JHtyLnRodW1iID8gYDxpbWcgc3JjPSIke2VzYyhyLnRodW1iKX0iIGFsdD0iIiBsb2FkaW5nPSJsYXp5IiBvbmVycm9yPSJ0aGlzLnJlbW92ZSgpIj5gIDogJyd9PGRpdj48YiB0aXRsZT0iJHtlc2Moci50aXRsZSl9Ij4ke2VzYyhyLnRpdGxlKX08L2I+PHNtYWxsPiR7ci5saXN0aW5nID8gYDxzcGFuIGNsYXNzPSJwZi1sdCAke3IubGlzdGluZ190eXBlID09PSAnZ29sZF9wcm8nID8gJ3BybycgOiAnY2xhJ30iPiR7ZXNjKHIubGlzdGluZyl9PC9zcGFuPiBgIDogJyd9JHtlc2MoW3IudmFyaWFudHMgPiAxID8gci52YXJpYW50cyArICcgdmFyaWFudGVzJyA6ICcnLCByLnNrdSAmJiAoLyBTS1UkLy50ZXN0KHIuc2t1KSA/IHIuc2t1IDogJ1NLVSAnICsgci5za3UpLCByLm1rID09PSAnbWwnICYmIHIudmFyaWFudHMgPD0gMSA/IHIuaWQgOiAnJywgci5sb2dpc3RpY10uZmlsdGVyKEJvb2xlYW4pLmpvaW4oJyDCtyAnKSl9JHtzb2xkKHIpID8gYCDCtyAke3NvbGQocikudG9Mb2NhbGVTdHJpbmcoJ2VzLUNMJyl9IHZlbmRpZGFzJHtyLm1rID09PSAnbWwnID8gJyBlbiB0b3RhbCcgOiAnICg5MCBkw61hcyknfWAgOiAnJ308L3NtYWxsPjwvZGl2PjwvZGl2PjwvdGQ+CiAgICAgIDx0ZCBjbGFzcz0ibnVtIj48Yj4ke21vbmV5KGMucHJpY2UpfTwvYj4ke3IucmVndWxhciAmJiByLnJlZ3VsYXIgPiBjLnByaWNlID8gYDxzbWFsbD48cz4ke21vbmV5KHIucmVndWxhcil9PC9zPiBwcm9tbzwvc21hbGw+YCA6IHIubWsgIT09ICdtbCcgJiYgIXIuYmFzZSA/ICcnIDogci5iYXNlICYmIHIuYmFzZSA+IGMucHJpY2UgPyBgPHNtYWxsPjxzPiR7bW9uZXkoci5iYXNlKX08L3M+IG9mZXJ0YTwvc21hbGw+YCA6ICcnfTwvdGQ+CiAgICAgIDx0ZCBjbGFzcz0ibnVtIj4ke2lucChyLCAnY29zdCcsIGMuY29zdCwgJ2NvbiBJVkEnLCA4OCl9PC90ZD4KICAgICAgPHRkIGNsYXNzPSJudW0iPiR7ci5tayA9PT0gJ21sJyA/IChyLmZlZSA9PSBudWxsID8gJzxzcGFuIGNsYXNzPSJtdXRlZCI+4oCUPC9zcGFuPicgOiBgJHttb25leShjLmZlZSl9PHNtYWxsPiR7cGN0KGMuZmVlUGN0KX08L3NtYWxsPmApIDogYCR7bW9uZXkoYy5mZWUpfTxzbWFsbD4ke2lucChyLCAnZmVlX3BjdCcsIHN2LmZlZV9wY3QsIFN0cmluZyhyLmZlZV9wY3QpLCA1Mil9JTwvc21hbGw+YH08L3RkPgogICAgICA8dGQgY2xhc3M9Im51bSI+JHtyLm1rID09PSAnbWwnID8gYCR7c3Yuc2hpcCAhPSBudWxsID8gaW5wKHIsICdzaGlwJywgc3Yuc2hpcCwgJycsIDY0KSA6IHIuc2hpcCA9PSBudWxsID8gJzxzcGFuIGNsYXNzPSJtdXRlZCI+4oCUPC9zcGFuPicgOiBtb25leShjLnNoaXApfTxzbWFsbCB0aXRsZT0iJHtlc2Moci5zaGlwX3NyYyB8fCAnJyl9Ij4ke2VzYyhyLnNoaXBfc3JjID09PSAnTWVyY2FkbyBMaWJyZScgPyAnbG8gY29icmEgTUwnIDogci5zaGlwX3NyYyB8fCAnJyl9PC9zbWFsbD5gIDogaW5wKHIsICdzaGlwJywgc3Yuc2hpcCwgJzAnLCA3MCl9PC90ZD4KICAgICAgPHRkIGNsYXNzPSJudW0iPiR7aW5wKHIsICd0YWNvcycsIHN2LnRhY29zLCByLnRhY29zICE9IG51bGwgPyBTdHJpbmcoTWF0aC5yb3VuZChyLnRhY29zICogMTApIC8gMTApIDogJzAnLCA1Mil9PHNtYWxsPiR7c3YudGFjb3MgIT0gbnVsbCA/ICdtYW51YWwnIDogZXNjKHIudGFjb3Nfc3JjIHx8ICcnKX08L3NtYWxsPjwvdGQ+CiAgICAgIDx0ZCBjbGFzcz0ibnVtIHBmLXJlcyIgdGl0bGU9IiR7ZXNjKHRpcCl9Ij4ke2MucHJvZml0ID09IG51bGwgPyAnPHNwYW4gY2xhc3M9Im11dGVkIj5wb24gZWwgY29zdG88L3NwYW4+JyA6IGA8Yj4ke2MucHJvZml0IDwgMCA/ICfiiJInICsgbW9uZXkoLWMucHJvZml0KSA6IG1vbmV5KGMucHJvZml0KX08L2I+PHNtYWxsPiR7cGN0KGMubWFyZ2luKX0gbWFyZ2VuPC9zbWFsbD5gfTwvdGQ+CiAgICAgIDx0ZCBjbGFzcz0ibnVtIHBmLXUiPjxiPiR7KHIudW5pdHMgfHwgMCkudG9Mb2NhbGVTdHJpbmcoJ2VzLUNMJyl9PC9iPjwvdGQ+CiAgICAgIDx0ZCBjbGFzcz0ibnVtIj4ke2MuY29zdCA9PSBudWxsID8gJzxzcGFuIGNsYXNzPSJtdXRlZCI+4oCUPC9zcGFuPicgOiBtb25leShjLmNvc3QgKiAoci51bml0cyB8fCAwKSl9PC90ZD4KICAgICAgPHRkIGNsYXNzPSJudW0gcGYtcmVzIHBmLXRvdCI+JHtjLnByb2ZpdCA9PSBudWxsID8gJzxzcGFuIGNsYXNzPSJtdXRlZCI+4oCUPC9zcGFuPicgOiBgPGI+JHtjLnByb2ZpdCAqIChyLnVuaXRzIHx8IDApIDwgMCA/ICfiiJInICsgbW9uZXkoLWMucHJvZml0ICogKHIudW5pdHMgfHwgMCkpIDogbW9uZXkoYy5wcm9maXQgKiAoci51bml0cyB8fCAwKSl9PC9iPmB9PC90ZD4KICAgIDwvdHI+YDsKICB9OwogIGJveC5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+PGgyPvCfkrAgQ2FsY3VsYWRvciBkZSBnYW5hbmNpYTwvaDI+PHNwYW4gY2xhc3M9Im11dGVkIj5HYW5hbmNpYSBuZXRhIHJlYWwgcG9yIHVuaWRhZCAoc2luIElWQSk8L3NwYW4+PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbC1ib2R5Ij4KICAgICAgPGRpdiBjbGFzcz0icGYtYmFyIj4KICAgICAgICA8c3BhbiBjbGFzcz0icGYtdGFicyI+JHtta3MubWFwKGsgPT4gYDxidXR0b24gZGF0YS1wZm1rPSIke2t9IiBhcmlhLXByZXNzZWQ9IiR7cGYubWsgPT09IGt9Ij48aSBjbGFzcz0iZG90IiBzdHlsZT0iYmFja2dyb3VuZDoke01LX0NPTE9SW2tdfSI+PC9pPiR7TUtba119PC9idXR0b24+YCkuam9pbignJykgfHwgJzxzcGFuIGNsYXNzPSJtdXRlZCI+U2luIHB1YmxpY2FjaW9uZXMgdG9kYXbDrWE8L3NwYW4+J308L3NwYW4+CiAgICAgICAgPGlucHV0IHR5cGU9InNlYXJjaCIgaWQ9InBmUSIgcGxhY2Vob2xkZXI9IkJ1c2NhciBwcm9kdWN0byBvIFNLVSIgdmFsdWU9IiR7ZXNjKHBmLnEpfSI+CiAgICAgICAgPHNlbGVjdCBpZD0icGZTb3J0IiBzdHlsZT0id2lkdGg6YXV0byI+PG9wdGlvbiB2YWx1ZT0ic29sZCIgJHtwZi5zb3J0ID09PSAnc29sZCcgPyAnc2VsZWN0ZWQnIDogJyd9Pk3DoXMgdmVuZGlkb3M8L29wdGlvbj48b3B0aW9uIHZhbHVlPSJ1bml0cyIgJHtwZi5zb3J0ID09PSAndW5pdHMnID8gJ3NlbGVjdGVkJyA6ICcnfT5Nw6FzIHZlbmRpZG9zIGVuIGVsIHBlcsOtb2RvPC9vcHRpb24+PG9wdGlvbiB2YWx1ZT0ibWFyZ2luIiAke3BmLnNvcnQgPT09ICdtYXJnaW4nID8gJ3NlbGVjdGVkJyA6ICcnfT5NZW5vciBtYXJnZW4gcHJpbWVybzwvb3B0aW9uPjwvc2VsZWN0PgogICAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tZ2hvc3QgYnRuLXNtIiBpZD0icGZSZWZyZXNoIj4ke0kuc3luY31BY3R1YWxpemFyIGRhdG9zPC9idXR0b24+CiAgICAgIDwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJwZi1wZXIiPgogICAgICAgIDxzcGFuIGNsYXNzPSJwZi1wZXItbCI+UGVyw61vZG86PC9zcGFuPgogICAgICAgIDxzcGFuIGNsYXNzPSJwZi10YWJzIHBmLXB0YWJzIj4ke1tbJ3RvZGF5JywgJ0hveSddLCBbJzcnLCAnNyBkw61hcyddLCBbJzMwJywgJzMwIGTDrWFzJ10sIFsnbW9udGgnLCAnRXN0ZSBtZXMnXSwgWydwaWNrJywgJ01lcyddLCBbJ3JhbmdlJywgJ0ZlY2hhcyddXS5tYXAoKFtrLCBuXSkgPT4gYDxidXR0b24gZGF0YS1wZnBlcj0iJHtrfSIgYXJpYS1wcmVzc2VkPSIke3BmLnBlciA9PT0ga30iPiR7bn08L2J1dHRvbj5gKS5qb2luKCcnKX08L3NwYW4+CiAgICAgICAgJHtwZi5wZXIgPT09ICdwaWNrJyA/IGA8aW5wdXQgdHlwZT0ibW9udGgiIGlkPSJwZk1vbnRoIiB2YWx1ZT0iJHtlc2MocGYubW9udGggfHwgaXNvKG5ldyBEYXRlKCkpLnNsaWNlKDAsIDcpKX0iPmAgOiAnJ30KICAgICAgICAke3BmLnBlciA9PT0gJ3JhbmdlJyA/IGA8aW5wdXQgdHlwZT0iZGF0ZSIgaWQ9InBmRnJvbSIgdmFsdWU9IiR7ZXNjKHBmLmZyb20gfHwgcEZyb20pfSI+IOKAkyA8aW5wdXQgdHlwZT0iZGF0ZSIgaWQ9InBmVG8iIHZhbHVlPSIke2VzYyhwZi50byB8fCBwVG8pfSI+YCA6ICcnfQogICAgICAgIDxzcGFuIGNsYXNzPSJtdXRlZCBwZi1wZXItZCI+JHtlc2MocEZyb20gPT09IHBUbyA/IGZtdEQocEZyb20pIDogZm10RChwRnJvbSkgKyAnIGFsICcgKyBmbXREKHBUbykpfTwvc3Bhbj4KICAgICAgPC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9InBmLWtwaXMiPgogICAgICAgIDxkaXY+PHNtYWxsPlVuaWRhZGVzIHZlbmRpZGFzPC9zbWFsbD48Yj4ke3RVLnRvTG9jYWxlU3RyaW5nKCdlcy1DTCcpfTwvYj48L2Rpdj4KICAgICAgICA8ZGl2PjxzbWFsbD5WZW50YSAocHJlY2lvIGFjdHVhbCk8L3NtYWxsPjxiPiR7bW9uZXkodFNhbGUpfTwvYj48L2Rpdj4KICAgICAgICA8ZGl2PjxzbWFsbD5Db3N0byB0b3RhbCAoY29uIElWQSk8L3NtYWxsPjxiPiR7bW9uZXkodENvc3QpfTwvYj48L2Rpdj4KICAgICAgICA8ZGl2IGNsYXNzPSIke3RQcm9maXQgPCAwID8gJ25lZycgOiAncG9zJ30iPjxzbWFsbD5HYW5hbmNpYSB0b3RhbCAobmV0YSk8L3NtYWxsPjxiPiR7dFByb2ZpdCA8IDAgPyAn4oiSJyArIG1vbmV5KC10UHJvZml0KSA6IG1vbmV5KHRQcm9maXQpfTwvYj4ke3RNaXNzaW5nID8gYDxzcGFuPiR7dE1pc3Npbmd9IHUuIHNpbiBjb3N0byBjYXJnYWRvIG5vIHN1bWFuPC9zcGFuPmAgOiAnJ308L2Rpdj4KICAgICAgPC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9InBmLXN1bSI+JHt3aXRoQ29zdC5sZW5ndGggPyBgTWFyZ2VuIHByb21lZGlvIDxiIGNsYXNzPSIke2F2Z00gPCAwID8gJ25lZycgOiAnJ30iPiR7cGN0KGF2Z00pfTwvYj4gwrcgYCA6ICcnfUNvc3RvIGNhcmdhZG8gZW4gPGI+JHt3aXRoQ29zdC5sZW5ndGh9PC9iPiBkZSAke2FsbC5sZW5ndGh9JHtuZWcgPyBgIMK3IDxiIGNsYXNzPSJuZWciPiR7bmVnfSBjb24gcMOpcmRpZGE8L2I+YCA6ICcnfSR7ZC5sb2FkaW5nID8gJyDCtyA8c3BhbiBjbGFzcz0ibXV0ZWQiPmFjdHVhbGl6YW5kbyBkYXRvcyBkZWwgbWFya2V0cGxhY2XigKY8L3NwYW4+JyA6ICcnfTwvZGl2PgogICAgICAke3Jvd3MubGVuZ3RoID8gYDxkaXYgY2xhc3M9InRhYmxlLXdyYXAgcGYtd3JhcCI+PHRhYmxlIGNsYXNzPSJwZi10YWJsZSI+PHRoZWFkPjx0cj48dGg+UHVibGljYWNpw7NuPC90aD48dGggY2xhc3M9Im51bSI+UHJlY2lvPC90aD48dGggY2xhc3M9Im51bSI+Q29zdG8gY29uIElWQTwvdGg+PHRoIGNsYXNzPSJudW0iPkNvbWlzacOzbjwvdGg+PHRoIGNsYXNzPSJudW0iPkVudsOtbzwvdGg+PHRoIGNsYXNzPSJudW0iPlRBQ09TICU8L3RoPjx0aCBjbGFzcz0ibnVtIj5HYW5hbmNpYSAvIHU8L3RoPjx0aCBjbGFzcz0ibnVtIj5WZW5kaWRhczwvdGg+PHRoIGNsYXNzPSJudW0iPkNvc3RvIHRvdGFsPC90aD48dGggY2xhc3M9Im51bSI+R2FuYW5jaWEgdG90YWw8L3RoPjwvdHI+PC90aGVhZD48dGJvZHk+JHtyb3dzLnNsaWNlKDAsIDMwMCkubWFwKHJvd0h0bWwpLmpvaW4oJycpfTwvdGJvZHk+PC90YWJsZT48L2Rpdj5gIDogYDxkaXYgY2xhc3M9ImVtcHR5Ij4ke2QubG9hZGluZyA/ICdUcmF5ZW5kbyB0dXMgcHVibGljYWNpb25lc+KApicgOiAnTm8gaGF5IHB1YmxpY2FjaW9uZXMgcGFyYSBtb3N0cmFyLid9PC9kaXY+YH0KICAgICAgJHtkLnJldHVybnMgPyAoKCkgPT4geyBjb25zdCBSID0gZC5yZXR1cm5zLCBUID0gUi50b3RhbDsgcmV0dXJuIGA8ZGl2IGNsYXNzPSJwZi1yZXQiPgogICAgICAgIDxkaXYgY2xhc3M9InBmLXJldC1oIj48Yj7ihqnvuI8gRGV2b2x1Y2lvbmVzIGRlbCBwZXLDrW9kbzwvYj48c3BhbiBjbGFzcz0ibXV0ZWQiPiR7Ui5zeW5jaW5nICYmICFSLnN5bmNlZF9hdCA/ICd0cmF5ZW5kbyBkZXZvbHVjaW9uZXPigKYnIDogZXNjKHBGcm9tID09PSBwVG8gPyBmbXREKHBGcm9tKSA6IGZtdEQocEZyb20pICsgJyBhbCAnICsgZm10RChwVG8pKX08L3NwYW4+PC9kaXY+CiAgICAgICAgPGRpdiBjbGFzcz0icGYta3BpcyI+CiAgICAgICAgICA8ZGl2PjxzbWFsbD5EZXZvbHVjaW9uZXM8L3NtYWxsPjxiPiR7VC5uLnRvTG9jYWxlU3RyaW5nKCdlcy1DTCcpfTwvYj48c3Bhbj4ke1QudW5pdHMudG9Mb2NhbGVTdHJpbmcoJ2VzLUNMJyl9IHVuaWRhZGVzPC9zcGFuPjwvZGl2PgogICAgICAgICAgPGRpdiBjbGFzcz0icGYtcmV0LW1vbmV5Ij48c21hbGw+UGxhdGEgZGV2dWVsdGE8L3NtYWxsPjxiIGNsYXNzPSJuZWdjIj4ke21vbmV5KFQubmV0KX08L2I+PHNwYW4+bmV0byAoc2luIElWQSk8L3NwYW4+PHNwYW4+PGI+JHttb25leShULmFtb3VudCl9PC9iPiBjb24gSVZBPC9zcGFuPjwvZGl2PgogICAgICAgICAgPGRpdiBjbGFzcz0ibmVnIj48c21hbGw+R2FuYW5jaWEgcXVlIHRlIHJlc3Rhbjwvc21hbGw+PGI+4oiSJHttb25leShyZXRMb3N0ICsgcmV2TmV0KX08L2I+PHNwYW4+JHttb25leShyZXRMb3N0KX0gZGUgZ2FuYW5jaWEgcGVyZGlkYSArICR7bW9uZXkocmV2TmV0KX0gZGUgbG9nw61zdGljYSBpbnZlcnNhIChuZXRvKTwvc3Bhbj48c3Bhbj5HYW5hbmNpYSBkZSB0b2RvcyBsb3MgbWFya2V0cGxhY2VzICR7bW9uZXkoYWxsUHJvZml0KX0g4oiSICR7bW9uZXkocmV0TG9zdCArIHJldk5ldCl9ID0gPGI+JHthbGxQcm9maXQgLSByZXRMb3N0IC0gcmV2TmV0IDwgMCA/ICfiiJInICsgbW9uZXkocmV0TG9zdCArIHJldk5ldCAtIGFsbFByb2ZpdCkgOiBtb25leShhbGxQcm9maXQgLSByZXRMb3N0IC0gcmV2TmV0KX08L2I+PC9zcGFuPjwvZGl2PgogICAgICAgICAgPGRpdiBjbGFzcz0icGYtcmV0LWJ5bWsiPjxzbWFsbD5Qb3IgbWFya2V0cGxhY2U8L3NtYWxsPiR7T2JqZWN0LmtleXMoUi5ieSkuZmlsdGVyKGsgPT4gTUtba10gJiYgKFIuYnlba10ubiB8fCBkLnJvd3Muc29tZShyID0+IHIubWsgPT09IGspKSkubWFwKGsgPT4gYDxkaXYgY2xhc3M9InBmLXJldC1tayI+PGRpdj48aSBjbGFzcz0iZG90IiBzdHlsZT0iYmFja2dyb3VuZDoke01LX0NPTE9SW2tdfSI+PC9pPiR7TUtba119OiA8Yj4ke1IuYnlba10ubn08L2I+IGRldm9sLiDCtyA8Yj4ke21vbmV5KFIuYnlba10uYW1vdW50IC8gSVZBKX08L2I+IGRldnVlbHRvIG5ldG88L2Rpdj48ZGl2IGNsYXNzPSJwZi1yZXQtbG9zdCI+RGVqYXN0ZSBkZSBnYW5hciA8Yj7iiJIke21vbmV5KE1hdGgucm91bmQobG9zdEJ5W2tdIHx8IDApICsgTWF0aC5yb3VuZChyZXZPZihrKSAvIElWQSkpfTwvYj4gbmV0byR7cmV2T2YoaykgPyBgIDxzbWFsbD4oaW5jbHV5ZSAke21vbmV5KHJldk9mKGspIC8gSVZBKX0gZGUgbG9nw61zdGljYSBpbnZlcnNhKTwvc21hbGw+YCA6ICcnfTwvZGl2PjwvZGl2PmApLmpvaW4oJycpIHx8ICfigJQnfTwvZGl2PgogICAgICAgIDwvZGl2PgogICAgICAgIDxkaXYgY2xhc3M9InBmLXJldiI+CiAgICAgICAgICA8Yj7wn5qaIExvZ8Otc3RpY2EgaW52ZXJzYTwvYj4gPHNwYW4gY2xhc3M9Im11dGVkIj4obG8gcXVlIHRlIGNvYnJhIGVsIG1hcmtldHBsYWNlIHBvciB0cmFlciBkZSB2dWVsdGEgZWwgcHJvZHVjdG87IHNlIHJlc3RhIGRlIGxhIGdhbmFuY2lhKTwvc3Bhbj4KICAgICAgICAgIDxkaXYgY2xhc3M9InBmLXJldi1yb3ciPgogICAgICAgICAgICA8c3Bhbj48aSBjbGFzcz0iZG90IiBzdHlsZT0iYmFja2dyb3VuZDoke01LX0NPTE9SLm1sfSI+PC9pPk1lcmNhZG8gTGlicmU6IDxiPiR7bW9uZXkocmV2T2YoJ21sJykpfTwvYj4gPHNtYWxsIGNsYXNzPSJtdXRlZCI+YXV0b23DoXRpY286IHNvbG8gY3VhbmRvIE1lcmNhZG8gTGlicmUgbm8gY3VicmUgbGEgZGV2b2x1Y2nDs248L3NtYWxsPjwvc3Bhbj4KICAgICAgICAgICAgJHtPYmplY3Qua2V5cyhSLmJ5KS5maWx0ZXIoayA9PiBrICE9PSAnbWwnICYmIE1LW2tdICYmIChSLmJ5W2tdLm4gfHwgZC5yb3dzLnNvbWUociA9PiByLm1rID09PSBrKSkpLm1hcChrID0+IGA8c3Bhbj48aSBjbGFzcz0iZG90IiBzdHlsZT0iYmFja2dyb3VuZDoke01LX0NPTE9SW2tdfSI+PC9pPiR7TUtba119OiA8aW5wdXQgY2xhc3M9InBmLWluIHBmLXJ2IiB0eXBlPSJudW1iZXIiIGlucHV0bW9kZT0iZGVjaW1hbCIgbWluPSIwIiBzdGVwPSJhbnkiIGRhdGEtcnY9IiR7a30iIHZhbHVlPSIke3JldlBlcihrKSA/PyAnJ30iIHBsYWNlaG9sZGVyPSIkIHBvciBkZXZvbHVjacOzbiIgc3R5bGU9IndpZHRoOjEyMHB4Ij4gPHNtYWxsIGNsYXNzPSJtdXRlZCI+Y29uIElWQSDDlyAke1IuYnlba10ubn0gPSA8Yj4ke21vbmV5KHJldk9mKGspKX08L2I+PC9zbWFsbD48L3NwYW4+YCkuam9pbignJyl9CiAgICAgICAgICA8L2Rpdj4KICAgICAgICA8L2Rpdj4KICAgICAgPC9kaXY+YDsgfSkoKSA6ICcnfQogICAgICA8cCBjbGFzcz0ibXV0ZWQgcGYtbm90ZSI+RXNjcmliZSBlbCBjb3N0byBkZSBjYWRhIHByb2R1Y3RvIDxiPmNvbiBJVkE8L2I+OyBzZSBndWFyZGEgc29sby4gTGEgZ2FuYW5jaWEgZXMgbmV0YTogc2UgZGVzY3VlbnRhIGVsIElWQSBkZWwgcHJlY2lvLCBkZWwgY29zdG8sIGRlIGxhIGNvbWlzacOzbiB5IGRlbCBlbnbDrW8uIEVsIFRBQ09TIGRlIE1lcmNhZG8gTGlicmUgdmllbmUgbmV0byAoc2luIElWQSkgZGUgTWVyY2FkbyBBZHMsIMO6bHRpbW9zIDMwIGTDrWFzOyBwdWVkZXMgY29ycmVnaXJsbyBhIG1hbm8uIEVuIEZhbGFiZWxsYSB5IFBhcmlzIGxhIGNvbWlzacOzbiBlcyBsYSBxdWUgaW5mb3JtYSBlbCBtYXJrZXRwbGFjZSBvIHVuIHZhbG9yIGVzdGltYWRvIHF1ZSBwdWVkZXMgY2FtYmlhci4ke2QuZXJyb3JzPy5sZW5ndGggPyBgPGJyPjxzcGFuIGNsYXNzPSJwZi1lcnIiPuKaoCAke2QuZXJyb3JzLm1hcChlc2MpLmpvaW4oJyDCtyAnKX08L3NwYW4+YCA6ICcnfSR7ZC5wcmljZXNfYXQgPyBgPGJyPlByZWNpb3MgY29uIGxhIHByb21vY2nDs24gbcOhcyBiYXJhdGEgdmlnZW50ZSAoc2luIE1lbGkrKSwgYWN0dWFsaXphZG9zIGEgbGFzICR7ZXNjKG5ldyBEYXRlKGQucHJpY2VzX2F0KS50b0xvY2FsZVRpbWVTdHJpbmcoJ2VzLUNMJywgeyBob3VyOiAnbnVtZXJpYycsIG1pbnV0ZTogJzItZGlnaXQnIH0pKX07IHNlIHJldmlzYW4gc29sb3MgY2FkYSBwb2NvcyBtaW51dG9zLmAgOiAnJ308L3A+CiAgICA8L2Rpdj5gOwogIGJveC5vbmNsaWNrID0gZSA9PiB7CiAgICBjb25zdCBiID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtcGZta10nKTsgaWYgKGIpIHsgcGYubWsgPSBiLmRhdGFzZXQucGZtazsgZHJhd1Byb2ZpdCgpOyByZXR1cm47IH0KICAgIGlmIChlLnRhcmdldC5jbG9zZXN0KCcjcGZSZWZyZXNoJykpIHsgcmVuZGVyUHJvZml0KHRydWUpOyB0b2FzdCgnQWN0dWFsaXphbmRvIGNvbWlzaW9uZXMsIGVudsOtb3MgeSBwdWJsaWNpZGFk4oCmJyk7IH0KICAgIGNvbnN0IHBiID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtcGZwZXJdJyk7IGlmIChwYikgeyBwZi5wZXIgPSBwYi5kYXRhc2V0LnBmcGVyOyBpZiAocGYucGVyICE9PSAncGljaycgJiYgcGYucGVyICE9PSAncmFuZ2UnKSByZWxvYWRQcm9maXQoKTsgZWxzZSBkcmF3UHJvZml0KCk7IH0KICB9OwogICQoJyNwZlEnKS5vbmlucHV0ID0gZSA9PiB7IHBmLnEgPSBlLnRhcmdldC52YWx1ZS50cmltKCkudG9Mb3dlckNhc2UoKTsgY2xlYXJUaW1lb3V0KHBmLl9xdCk7IHBmLl9xdCA9IHNldFRpbWVvdXQoKCkgPT4geyBkcmF3UHJvZml0KCk7IGNvbnN0IHEgPSAkKCcjcGZRJyk7IHEuZm9jdXMoKTsgcS5zZXRTZWxlY3Rpb25SYW5nZShxLnZhbHVlLmxlbmd0aCwgcS52YWx1ZS5sZW5ndGgpOyB9LCAyNTApOyB9OwogICQoJyNwZlNvcnQnKS5vbmNoYW5nZSA9IGUgPT4geyBwZi5zb3J0ID0gZS50YXJnZXQudmFsdWU7IGRyYXdQcm9maXQoKTsgfTsKICBpZiAoJCgnI3BmTW9udGgnKSkgJCgnI3BmTW9udGgnKS5vbmNoYW5nZSA9IGUgPT4geyBwZi5tb250aCA9IGUudGFyZ2V0LnZhbHVlOyByZWxvYWRQcm9maXQoKTsgfTsKICBpZiAoJCgnI3BmRnJvbScpKSB7IGNvbnN0IHVwZCA9ICgpID0+IHsgcGYuZnJvbSA9ICQoJyNwZkZyb20nKS52YWx1ZTsgcGYudG8gPSAkKCcjcGZUbycpLnZhbHVlOyBpZiAocGYuZnJvbSAmJiBwZi50bykgcmVsb2FkUHJvZml0KCk7IH07ICQoJyNwZkZyb20nKS5vbmNoYW5nZSA9IHVwZDsgJCgnI3BmVG8nKS5vbmNoYW5nZSA9IHVwZDsgfQogIGJveC5vbmNoYW5nZSA9IGFzeW5jIGUgPT4gewogICAgY29uc3QgcnYgPSBlLnRhcmdldC5jbG9zZXN0KCcucGYtcnYnKTsKICAgIGlmIChydikgewogICAgICBjb25zdCBrID0gcnYuZGF0YXNldC5ydiwgdmFsID0gcnYudmFsdWUgPT09ICcnID8gbnVsbCA6IE51bWJlcihydi52YWx1ZSk7CiAgICAgIGQuc2F2ZWRbayArICd8UkVUX0xPRyddID0geyAuLi4oZC5zYXZlZFtrICsgJ3xSRVRfTE9HJ10gfHwge30pLCBzaGlwOiB2YWwgfTsKICAgICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL3Byb2ZpdC9zYXZlJywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBzZWxsZXJfaWQ6IHBmLnNpZCB8fCB1bmRlZmluZWQsIG1hcmtldHBsYWNlOiBrLCBrZXk6ICdSRVRfTE9HJywgc2hpcDogdmFsIH0gfSk7IH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IH0KICAgICAgZHJhd1Byb2ZpdCgpOyByZXR1cm47CiAgICB9CiAgICBjb25zdCBpID0gZS50YXJnZXQuY2xvc2VzdCgnLnBmLWluJyk7IGlmICghaSkgcmV0dXJuOwogICAgY29uc3QgciA9IGQucm93cy5maW5kKHggPT4geC5tayA9PT0gcGYubWsgJiYgeC5rZXkgPT09IGkuZGF0YXNldC5rKTsgaWYgKCFyKSByZXR1cm47CiAgICBjb25zdCBmID0gaS5kYXRhc2V0LmYsIHZhbCA9IGkudmFsdWUgPT09ICcnID8gbnVsbCA6IE51bWJlcihpLnZhbHVlKTsKICAgIGNvbnN0IGtleSA9IGYgPT09ICdjb3N0JyAmJiByLmNvc3Rfa2V5ID8gci5jb3N0X2tleSA6IHIua2V5OyAvLyBlbCBjb3N0byBlcyBkZWwgcHJvZHVjdG8gKHNpcnZlIHBhcmEgQ2zDoXNpY2EgeSBQcmVtaXVtKQogICAgY29uc3Qgc3YgPSB7IC4uLihkLnNhdmVkW3IubWsgKyAnfCcgKyBrZXldIHx8IHt9KSB9OwogICAgc3ZbZl0gPSB2YWw7CiAgICBkLnNhdmVkW3IubWsgKyAnfCcgKyBrZXldID0gc3Y7CiAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvcHJvZml0L3NhdmUnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IHNlbGxlcl9pZDogcGYuc2lkIHx8IHVuZGVmaW5lZCwgbWFya2V0cGxhY2U6IHIubWssIGtleSwgLi4uc3YgfSB9KTsgfSBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlKTsgfQogICAgaWYgKGYgPT09ICdjb3N0JyAmJiByLmNvc3Rfa2V5KSAkJCgnI3Byb2ZpdFBhbmVsIHRyW2RhdGEtY2tdJykuZm9yRWFjaCh0cjIgPT4geyBpZiAodHIyLmRhdGFzZXQuY2sgIT09IHIuY29zdF9rZXkgfHwgdHIyID09PSBpLmNsb3Nlc3QoJ3RyJykpIHJldHVybjsgY29uc3QgcjIgPSBkLnJvd3MuZmluZCh4ID0+IHgubWsgPT09IHBmLm1rICYmIHgua2V5ID09PSB0cjIuZGF0YXNldC5yayk7IGlmICghcjIpIHJldHVybjsgY29uc3QgdDIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd0Ym9keScpOyB0Mi5pbm5lckhUTUwgPSByb3dIdG1sKHIyKTsgdHIyLnJlcGxhY2VXaXRoKHQyLmZpcnN0RWxlbWVudENoaWxkKTsgfSk7CiAgICAvLyBzZSBhY3R1YWxpemEgc29sbyBsYSBmaWxhIChzaW4gcGVyZGVyIGVsIGZvY28gZGVsIHNpZ3VpZW50ZSBjYW1wbykKICAgIGNvbnN0IHRyID0gaS5jbG9zZXN0KCd0cicpOyBjb25zdCBuZXh0ID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudDsKICAgIGNvbnN0IHRtcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3Rib2R5Jyk7IHRtcC5pbm5lckhUTUwgPSByb3dIdG1sKHIpOyBjb25zdCBuciA9IHRtcC5maXJzdEVsZW1lbnRDaGlsZDsKICAgIGlmICghdHIuY29udGFpbnMobmV4dCkpIHRyLnJlcGxhY2VXaXRoKG5yKTsgZWxzZSB7IG5yLnF1ZXJ5U2VsZWN0b3JBbGwoJ3RkJykuZm9yRWFjaCgodGQsIGspID0+IHsgaWYgKCF0ZC5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpKSB0ci5jaGlsZHJlbltrXS5pbm5lckhUTUwgPSB0ZC5pbm5lckhUTUw7IH0pOyB9CiAgfTsKfQoKLy8gUGVyw61vZG8gZGUgbG9zIGdyw6FmaWNvcyBkZSB2ZW50YXMgKHBvciBkZWZlY3RvIMO6bHRpbW9zIDcgZMOtYXMpCmNvbnN0IHNwID0geyBwZXI6ICc3JywgbW9udGg6ICcnLCBmcm9tOiAnJywgdG86ICcnIH07CmZ1bmN0aW9uIHNwUmFuZ2UoKSB7CiAgY29uc3QgdCA9IG5ldyBEYXRlKCksIHRvZGF5ID0gaXNvKHQpLCBiYWNrID0gbiA9PiB7IGNvbnN0IGQgPSBuZXcgRGF0ZSgpOyBkLnNldERhdGUoZC5nZXREYXRlKCkgLSBuKTsgcmV0dXJuIGlzbyhkKTsgfTsKICBpZiAoc3AucGVyID09PSAndG9kYXknKSByZXR1cm4gW3RvZGF5LCB0b2RheV07CiAgaWYgKHNwLnBlciA9PT0gJzMwJykgcmV0dXJuIFtiYWNrKDI5KSwgdG9kYXldOwogIGlmIChzcC5wZXIgPT09ICdtb250aCcpIHJldHVybiBbdG9kYXkuc2xpY2UoMCwgOCkgKyAnMDEnLCB0b2RheV07CiAgaWYgKHNwLnBlciA9PT0gJ3BpY2snICYmIC9eXGR7NH0tXGR7Mn0kLy50ZXN0KHNwLm1vbnRoKSkgeyBjb25zdCBbeSwgbV0gPSBzcC5tb250aC5zcGxpdCgnLScpLm1hcChOdW1iZXIpOyBjb25zdCBsYXN0ID0gbmV3IERhdGUoeSwgbSwgMCkuZ2V0RGF0ZSgpOyByZXR1cm4gW3NwLm1vbnRoICsgJy0wMScsIHNwLm1vbnRoICsgJy0nICsgU3RyaW5nKGxhc3QpLnBhZFN0YXJ0KDIsICcwJyldOyB9CiAgaWYgKHNwLnBlciA9PT0gJ3JhbmdlJyAmJiBzcC5mcm9tICYmIHNwLnRvKSByZXR1cm4gc3AuZnJvbSA8PSBzcC50byA/IFtzcC5mcm9tLCBzcC50b10gOiBbc3AudG8sIHNwLmZyb21dOwogIHJldHVybiBbYmFjayg2KSwgdG9kYXldOwp9CmFzeW5jIGZ1bmN0aW9uIHJlbmRlclNhbGVzKGZvcmNlID0gZmFsc2UpIHsKICBjb25zdCBpc0FkbWluID0gbWUudXNlci5yb2xlID09PSAnYWRtaW4nOwogIGlmICghJCgnI3NhbGVzQm9keScpKSAkKCcjbWFpbicpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJzZWN0aW9uLXRpdGxlIiBzdHlsZT0ibWFyZ2luLXRvcDoyMnB4Ij48aDI+QW7DoWxpc2lzIHZlbnRhczwvaDI+PHNwYW4gY2xhc3M9Im11dGVkIiBpZD0ic2FsZXNTdWIiPnNlIGFjdHVhbGl6YSBzb2xhPC9zcGFuPjxzcGFuIGNsYXNzPSJzcGFjZXIiIHN0eWxlPSJmbGV4OjEiPjwvc3Bhbj48c3BhbiBpZD0ic2FsZXNQaWNrIj48L3NwYW4+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1naG9zdCBidG4tc20iIGlkPSJzYWxlc1JlZnJlc2giPiR7SS5zeW5jfUFjdHVhbGl6YXI8L2J1dHRvbj48L2Rpdj48ZGl2IGNsYXNzPSJwZi1wZXIgc2FsZXMtcGVyIiBpZD0ic2FsZXNQZXIiPjwvZGl2PjxkaXYgaWQ9InNhbGVzQm9keSI+PGRpdiBjbGFzcz0icGFuZWwiPjxkaXYgY2xhc3M9InBhbmVsLWJvZHkgbXV0ZWQiPkNhcmdhbmRvIHR1cyB2ZW50YXPigKY8L2Rpdj48L2Rpdj48L2Rpdj48ZGl2IGNsYXNzPSJjaC10aXAiIGlkPSJjaFRpcCIgaGlkZGVuPjwvZGl2PmA7CiAgJCgnI3NhbGVzUmVmcmVzaCcpLm9uY2xpY2sgPSBhc3luYyAoKSA9PiB7ICQoJyNzYWxlc1JlZnJlc2gnKS5kaXNhYmxlZCA9IHRydWU7IGF3YWl0IHJlbmRlclNhbGVzKHRydWUpOyBpZiAoJCgnI3NhbGVzUmVmcmVzaCcpKSAkKCcjc2FsZXNSZWZyZXNoJykuZGlzYWJsZWQgPSBmYWxzZTsgdG9hc3QoJ1ZlbnRhcyBhY3R1YWxpemFkYXMnKTsgfTsKICBjb25zdCBzaWQgPSBpc0FkbWluID8gc3RvcmUuZ2V0KCdzYWxlc1NlbGxlcicsICcnKSA6ICcnOwogIGxldCBkOwogIGNvbnN0IFtyRnJvbSwgclRvXSA9IHNwUmFuZ2UoKTsKICBjb25zdCBmbXREID0geCA9PiBuZXcgRGF0ZSh4ICsgJ1QxMjowMDowMCcpLnRvTG9jYWxlRGF0ZVN0cmluZygnZXMtQ0wnLCB7IGRheTogJ251bWVyaWMnLCBtb250aDogJ3Nob3J0JyB9KTsKICBjb25zdCBwZXJOYW1lID0geyB0b2RheTogJ0hveScsICc3JzogJ8OabHRpbW9zIDcgZMOtYXMnLCAnMzAnOiAnw5psdGltb3MgMzAgZMOtYXMnLCBtb250aDogJ0VzdGUgbWVzJywgcGljazogJ01lcycsIHJhbmdlOiAnUGVyw61vZG8nIH1bc3AucGVyXSB8fCAnUGVyw61vZG8nOwogICQoJyNzYWxlc1BlcicpLmlubmVySFRNTCA9IGA8c3BhbiBjbGFzcz0icGYtcGVyLWwiPlBlcsOtb2RvOjwvc3Bhbj4KICAgIDxzcGFuIGNsYXNzPSJwZi10YWJzIHBmLXB0YWJzIj4ke1tbJ3RvZGF5JywgJ0hveSddLCBbJzcnLCAnNyBkw61hcyddLCBbJzMwJywgJzMwIGTDrWFzJ10sIFsnbW9udGgnLCAnRXN0ZSBtZXMnXSwgWydwaWNrJywgJ01lcyddLCBbJ3JhbmdlJywgJ0ZlY2hhcyddXS5tYXAoKFtrLCBuXSkgPT4gYDxidXR0b24gZGF0YS1zcGVyPSIke2t9IiBhcmlhLXByZXNzZWQ9IiR7c3AucGVyID09PSBrfSI+JHtufTwvYnV0dG9uPmApLmpvaW4oJycpfTwvc3Bhbj4KICAgICR7c3AucGVyID09PSAncGljaycgPyBgPGlucHV0IHR5cGU9Im1vbnRoIiBpZD0ic3BNb250aCIgdmFsdWU9IiR7ZXNjKHNwLm1vbnRoIHx8IGlzbyhuZXcgRGF0ZSgpKS5zbGljZSgwLCA3KSl9Ij5gIDogJyd9CiAgICAke3NwLnBlciA9PT0gJ3JhbmdlJyA/IGA8aW5wdXQgdHlwZT0iZGF0ZSIgaWQ9InNwRnJvbSIgdmFsdWU9IiR7ZXNjKHNwLmZyb20gfHwgckZyb20pfSI+IOKAkyA8aW5wdXQgdHlwZT0iZGF0ZSIgaWQ9InNwVG8iIHZhbHVlPSIke2VzYyhzcC50byB8fCByVG8pfSI+YCA6ICcnfQogICAgPHNwYW4gY2xhc3M9Im11dGVkIHBmLXBlci1kIj4ke2VzYyhyRnJvbSA9PT0gclRvID8gZm10RChyRnJvbSkgOiBmbXREKHJGcm9tKSArICcgYWwgJyArIGZtdEQoclRvKSl9PC9zcGFuPmA7CiAgJCgnI3NhbGVzUGVyJykub25jbGljayA9IGUgPT4geyBjb25zdCBiID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtc3Blcl0nKTsgaWYgKCFiKSByZXR1cm47IHNwLnBlciA9IGIuZGF0YXNldC5zcGVyOyBpZiAoc3AucGVyID09PSAncGljaycgJiYgIXNwLm1vbnRoKSBzcC5tb250aCA9IGlzbyhuZXcgRGF0ZSgpKS5zbGljZSgwLCA3KTsgcmVuZGVyU2FsZXMoKTsgfTsKICBpZiAoJCgnI3NwTW9udGgnKSkgJCgnI3NwTW9udGgnKS5vbmNoYW5nZSA9IGUgPT4geyBzcC5tb250aCA9IGUudGFyZ2V0LnZhbHVlOyByZW5kZXJTYWxlcygpOyB9OwogIGlmICgkKCcjc3BGcm9tJykpIHsgY29uc3QgdXBkID0gKCkgPT4geyBzcC5mcm9tID0gJCgnI3NwRnJvbScpLnZhbHVlOyBzcC50byA9ICQoJyNzcFRvJykudmFsdWU7IGlmIChzcC5mcm9tICYmIHNwLnRvKSByZW5kZXJTYWxlcygpOyB9OyAkKCcjc3BGcm9tJykub25jaGFuZ2UgPSB1cGQ7ICQoJyNzcFRvJykub25jaGFuZ2UgPSB1cGQ7IH0KICB0cnkgeyBkID0gYXdhaXQgYXBpKGAvYXBpL3NhbGVzPyR7c2lkID8gJ3NlbGxlcl9pZD0nICsgc2lkICsgJyYnIDogJyd9ZnJvbT0ke3JGcm9tfSZ0bz0ke3JUb30ke2ZvcmNlID8gJyZyZWZyZXNoPTEnIDogJyd9YCk7IH0gY2F0Y2ggKGUpIHsgJCgnI3NhbGVzQm9keScpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJwYW5lbCI+PGRpdiBjbGFzcz0icGFuZWwtYm9keSI+JHtlc2MoZS5tZXNzYWdlKX08L2Rpdj48L2Rpdj5gOyByZXR1cm47IH0KICBpZiAodGFiICE9PSAnc2FsZXMnKSByZXR1cm47CiAgaWYgKGlzQWRtaW4pIHsKICAgICQoJyNzYWxlc1BpY2snKS5pbm5lckhUTUwgPSBgPHNlbGVjdCBpZD0ic2FsZXNTZWwiIHN0eWxlPSJ3aWR0aDphdXRvIj48b3B0aW9uIHZhbHVlPSIiPlRvZGFzIGxhcyBjdWVudGFzPC9vcHRpb24+JHtkLnNlbGxlcnMubWFwKHggPT4gYDxvcHRpb24gdmFsdWU9IiR7eC5pZH0iICR7U3RyaW5nKHguaWQpID09PSBTdHJpbmcoc2lkKSA/ICdzZWxlY3RlZCcgOiAnJ30+JHtlc2MoeC5uYW1lKX08L29wdGlvbj5gKS5qb2luKCcnKX08L3NlbGVjdD5gOwogICAgJCgnI3NhbGVzU2VsJykub25jaGFuZ2UgPSBlID0+IHsgc3RvcmUuc2V0KCdzYWxlc1NlbGxlcicsIGUudGFyZ2V0LnZhbHVlKTsgcmVuZGVyU2FsZXMoKTsgfTsKICB9CiAgY29uc3QgZGF5cyA9IGQuZGF5cywgbWtzID0gKGQubWtzIHx8IFsnbWwnLCAnZmEnLCAncGEnXSkuZmlsdGVyKGsgPT4gZC5zZXJpZXNba10pLCBHID0gZC5ncm91cCB8fCAnZGF5JzsKICBjb25zdCBkYXlUb3RhbCA9IGkgPT4gbWtzLnJlZHVjZSgoYSwgaykgPT4gYSArIGQuc2VyaWVzW2tdW2ldLmFtb3VudCwgMCk7CiAgY29uc3QgZGF5T3JkZXJzID0gaSA9PiBta3MucmVkdWNlKChhLCBrKSA9PiBhICsgZC5zZXJpZXNba11baV0ub3JkZXJzLCAwKTsKICBjb25zdCB3ZWVrVG90YWwgPSBkYXlzLnJlZHVjZSgoYSwgXywgaSkgPT4gYSArIGRheVRvdGFsKGkpLCAwKSwgd2Vla09yZGVycyA9IGRheXMucmVkdWNlKChhLCBfLCBpKSA9PiBhICsgZGF5T3JkZXJzKGkpLCAwKTsKICBsZXQgYmVzdCA9IDA7IGRheXMuZm9yRWFjaCgoXywgaSkgPT4geyBpZiAoZGF5VG90YWwoaSkgPiBkYXlUb3RhbChiZXN0KSkgYmVzdCA9IGk7IH0pOwogIGNvbnN0IHRkVCA9IG1rcy5yZWR1Y2UoKGEsIGspID0+IGEgKyBkLnRkW2tdLmFtb3VudCwgMCksIHRkTyA9IG1rcy5yZWR1Y2UoKGEsIGspID0+IGEgKyBkLnRkW2tdLm9yZGVycywgMCksIHlkVCA9IG1rcy5yZWR1Y2UoKGEsIGspID0+IGEgKyBkLnlkW2tdLmFtb3VudCwgMCk7CiAgY29uc3QgdXAgPSB5ZFQgPiAwICYmIHRkVCA+IHlkVCA/IE1hdGgucm91bmQoKHRkVCAvIHlkVCAtIDEpICogMTAwKSA6IG51bGw7CiAgY29uc3QgY2hlZXIgPSB1cCA/IGDCoVZhcyAke3VwfSUgYXJyaWJhIGRlIGF5ZXIhIPCfmoBgIDogdGRPID8gYMKhWWEgbGxldmFzICR7dGRPfSB2ZW50YSR7dGRPID09PSAxID8gJycgOiAncyd9IGhveSFgIDogJ0VsIGTDrWEgcmVjacOpbiBlbXBpZXphOiB0dXMgdmVudGFzIGRlIGhveSBhcGFyZWNlbiBhcXXDrSc7CiAgY29uc3QgYk5hbWUgPSBpID0+IEcgPT09ICdkYXknID8gZGF5TG9uZyhkYXlzW2ldKS5zcGxpdCgnLCcpWzBdIDogRyA9PT0gJ3dlZWsnID8gJ3NlbWFuYSBkZWwgJyArIGZtdEQoZGF5c1tpXSkgOiBuZXcgRGF0ZShkYXlzW2ldICsgJ1QxMjowMDowMCcpLnRvTG9jYWxlRGF0ZVN0cmluZygnZXMtQ0wnLCB7IG1vbnRoOiAnbG9uZycgfSk7CiAgY29uc3QgYkxvbmcgPSBpID0+IEcgPT09ICdkYXknID8gZGF5TG9uZyhkYXlzW2ldKSA6IEcgPT09ICd3ZWVrJyA/IGBTZW1hbmEgJHtmbXREKGRheXNbaV0pfSBhbCAke2ZtdEQoZC5lbmRzW2ldKX1gIDogbmV3IERhdGUoZGF5c1tpXSArICdUMTI6MDA6MDAnKS50b0xvY2FsZURhdGVTdHJpbmcoJ2VzLUNMJywgeyBtb250aDogJ2xvbmcnLCB5ZWFyOiAnbnVtZXJpYycgfSk7CiAgY29uc3QgYlNob3J0ID0gaSA9PiBHID09PSAnd2VlaycgPyBmbXREKGRheXNbaV0pIDogbmV3IERhdGUoZGF5c1tpXSArICdUMTI6MDA6MDAnKS50b0xvY2FsZURhdGVTdHJpbmcoJ2VzLUNMJywgeyBtb250aDogJ3Nob3J0JyB9KS5yZXBsYWNlKCcuJywgJycpOwogIGNvbnN0IHBlclR4dCA9IHNwLnBlciA9PT0gJ3BpY2snID8gbmV3IERhdGUoKHNwLm1vbnRoIHx8IGlzbyhuZXcgRGF0ZSgpKS5zbGljZSgwLCA3KSkgKyAnLTE1VDEyOjAwOjAwJykudG9Mb2NhbGVEYXRlU3RyaW5nKCdlcy1DTCcsIHsgbW9udGg6ICdsb25nJywgeWVhcjogJ251bWVyaWMnIH0pIDogc3AucGVyID09PSAncmFuZ2UnID8gKGQuZnJvbSA9PT0gZC50byA/IGZtdEQoZC5mcm9tKSA6IGZtdEQoZC5mcm9tKSArICcgYWwgJyArIGZtdEQoZC50bykpIDogcGVyTmFtZS50b0xvd2VyQ2FzZSgpOwogIGlmICgkKCcjc2FsZXNTdWInKSkgJCgnI3NhbGVzU3ViJykudGV4dENvbnRlbnQgPSBgJHtwZXJOYW1lID09PSAnUGVyw61vZG8nIHx8IHNwLnBlciA9PT0gJ3BpY2snID8gcGVyVHh0LmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgcGVyVHh0LnNsaWNlKDEpIDogcGVyTmFtZX0ke0cgIT09ICdkYXknID8gKEcgPT09ICd3ZWVrJyA/ICcgwrcgcG9yIHNlbWFuYScgOiAnIMK3IHBvciBtZXMnKSA6ICcnfSDCtyBzZSBhY3R1YWxpemEgc29sYWA7CiAgY29uc3Qgc3RhY2tzID0gbWtzLm1hcChrID0+ICh7IGtleTogaywgbGFiZWw6IE1LW2tdLCBjb2xvcjogTUtfQ09MT1Jba10sIHZhbHVlczogZC5zZXJpZXNba10gfSkpOwogIGNvbnN0IG1rQ2FyZCA9IGsgPT4gewogICAgY29uc3Qgd2sgPSBkLnNlcmllc1trXS5yZWR1Y2UoKGEsIHgpID0+IGEgKyB4LmFtb3VudCwgMCksIG4gPSBkLnNlcmllc1trXS5yZWR1Y2UoKGEsIHgpID0+IGEgKyB4Lm9yZGVycywgMCk7CiAgICBjb25zdCBvbiA9IGQuY29ubmVjdGVkLmluY2x1ZGVzKGspIHx8IHdrID4gMDsKICAgIHJldHVybiBgPGRpdiBjbGFzcz0icGFuZWwgc2FsZXMtbWsiPjxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj48aSBjbGFzcz0iZG90IiBzdHlsZT0iYmFja2dyb3VuZDoke01LX0NPTE9SW2tdfSI+PC9pPiR7TUtba119PC9oMj48c3BhbiBjbGFzcz0ibXV0ZWQiPiR7b24gPyBgJHttb25leSh3ayl9IMK3ICR7bi50b0xvY2FsZVN0cmluZygnZXMtQ0wnKX0gdmVudGEke24gPT09IDEgPyAnJyA6ICdzJ30gwrcgJHtlc2MocGVyVHh0KX1gIDogJyd9PC9zcGFuPjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJwYW5lbC1ib2R5Ij4ke29uID8gYDxkaXYgY2xhc3M9ImNoLXNsb3QiIGRhdGEtbWs9IiR7a30iIGRhdGEtaD0iMjAwIj48L2Rpdj5gIDogYDxkaXYgY2xhc3M9ImVtcHR5Ij5Db25lY3RhICR7TUtba119IGVuICR7aXNBZG1pbiA/ICdWZW5kZWRvcmVzJyA6ICdNaSBjdWVudGEnfSBwYXJhIHZlciBhcXXDrSBzdXMgdmVudGFzLjwvZGl2PmB9PC9kaXY+PC9kaXY+YDsKICB9OwogICQoJyNzYWxlc0JvZHknKS5pbm5lckhUTUwgPSBgCiAgICA8ZGl2IGNsYXNzPSJzYWxlcy1rcGlzIj4KICAgICAgPGRpdiBjbGFzcz0ia3BpIGtwaS1oZXJvIj48c21hbGw+VmVuZGlzdGUgaG95PC9zbWFsbD48Yj4ke21vbmV5KHRkVCl9PC9iPjxzcGFuPiR7dGRPfSB2ZW50YSR7dGRPID09PSAxID8gJycgOiAncyd9IMK3ICR7ZXNjKGNoZWVyKX08L3NwYW4+PC9kaXY+CiAgICAgICR7bWtzLm1hcChrID0+IGA8ZGl2IGNsYXNzPSJrcGkiPjxzbWFsbD48aSBjbGFzcz0iZG90IiBzdHlsZT0iYmFja2dyb3VuZDoke01LX0NPTE9SW2tdfSI+PC9pPiR7TUtba119IGhveTwvc21hbGw+PGI+JHttb25leShkLnRkW2tdLmFtb3VudCl9PC9iPjxzcGFuPiR7ZC50ZFtrXS5vcmRlcnN9IHZlbnRhJHtkLnRkW2tdLm9yZGVycyA9PT0gMSA/ICcnIDogJ3MnfTwvc3Bhbj48L2Rpdj5gKS5qb2luKCcnKX0KICAgICAgPGRpdiBjbGFzcz0ia3BpIj48c21hbGw+JHtlc2MocGVyVHh0LmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgcGVyVHh0LnNsaWNlKDEpKX08L3NtYWxsPjxiPiR7bW9uZXkod2Vla1RvdGFsKX08L2I+PHNwYW4+JHt3ZWVrT3JkZXJzLnRvTG9jYWxlU3RyaW5nKCdlcy1DTCcpfSB2ZW50YXMke2RheXMubGVuZ3RoID4gMSAmJiBkYXlUb3RhbChiZXN0KSA+IDAgPyBgIMK3IG1lam9yICR7RyA9PT0gJ2RheScgPyAnZMOtYScgOiBHID09PSAnd2VlaycgPyAnc2VtYW5hJyA6ICdtZXMnfTogJHtlc2MoYk5hbWUoYmVzdCkpfSDwn4+GYCA6ICcnfTwvc3Bhbj48L2Rpdj4KICAgIDwvZGl2PgogICAgPGRpdiBjbGFzcz0icGFuZWwiPjxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj5Ub2RvcyBsb3MgbWFya2V0cGxhY2VzPC9oMj48ZGl2IGNsYXNzPSJsZWdlbmQiPiR7bWtzLm1hcChrID0+IGA8c3Bhbj48aSBjbGFzcz0iZG90IiBzdHlsZT0iYmFja2dyb3VuZDoke01LX0NPTE9SW2tdfSI+PC9pPiR7TUtba119PC9zcGFuPmApLmpvaW4oJycpfTwvZGl2PjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJwYW5lbC1ib2R5Ij4ke21rcy5sZW5ndGggPyBgPGRpdiBjbGFzcz0iY2gtc2xvdCIgZGF0YS1taz0iYWxsIiBkYXRhLWg9IjI2MCI+PC9kaXY+JHtzYWxlc1RhYmxlKGRheXMsIGQsIEcgPT09ICdkYXknID8gbnVsbCA6IGJMb25nKX1gIDogYDxkaXYgY2xhc3M9ImVtcHR5Ij5Bw7puIG5vIGhheSBjYW5hbGVzIGRlIHZlbnRhIGNvbmVjdGFkb3MuIENvbsOpY3RhbG9zIGVuICR7aXNBZG1pbiA/ICdWZW5kZWRvcmVzJyA6ICdNaSBjdWVudGEnfTogTWVyY2FkbyBMaWJyZSwgRmFsYWJlbGxhLCBQYXJpcywgU2hvcGlmeSwgV29vQ29tbWVyY2UgbyBKdW1wc2VsbGVyLjwvZGl2PmB9PC9kaXY+PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJzYWxlcy1ncmlkIj4ke21rcy5tYXAobWtDYXJkKS5qb2luKCcnKX08L2Rpdj4KICAgIDxkaXYgY2xhc3M9InBhbmVsIHBmLXBhbmVsIiBpZD0icHJvZml0UGFuZWwiIHN0eWxlPSJtYXJnaW4tdG9wOjE0cHgiPjwvZGl2PgogICAgPGRpdiBjbGFzcz0icGFuZWwiIGlkPSJwcm9kUGFuZWwiIHN0eWxlPSJtYXJnaW4tdG9wOjE0cHgiPjwvZGl2PgogICAgPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEyLjVweDttYXJnaW46MTBweCAycHgiPk1vbnRvcyBwYWdhZG9zIHNlZ8O6biBjYWRhIG1hcmtldHBsYWNlIChzaW4gY29zdG8gZGUgZW52w61vIGVuIE1lcmNhZG8gTGlicmUpLiBObyBpbmNsdXllIHZlbnRhcyBjYW5jZWxhZGFzLiR7ZC51cGRhdGVkQXQgPyAnIEFjdHVhbGl6YWRvICcgKyBlc2MobmV3IERhdGUoZC51cGRhdGVkQXQpLnRvTG9jYWxlVGltZVN0cmluZygnZXMtQ0wnLCB7IGhvdXI6ICdudW1lcmljJywgbWludXRlOiAnMi1kaWdpdCcgfSkpICsgJy4nIDogJyd9PC9wPmA7CiAgLy8gbG9zIGdyw6FmaWNvcyBzZSBkaWJ1amFuIGFsIGFuY2hvIHJlYWwgZGUgc3UgY2FqYTogZWwgdGV4dG8gcXVlZGEgc2llbXByZSBkZWwgbWlzbW8gdGFtYcOxbyB5IGxlZ2libGUKICBjb25zdCBkcmF3ID0gKCkgPT4gJCQoJy5jaC1zbG90JykuZm9yRWFjaChlbCA9PiB7IGNvbnN0IHcgPSBlbC5jbGllbnRXaWR0aDsgaWYgKCF3IHx8IGVsLl93ID09PSB3KSByZXR1cm47IGVsLl93ID0gdzsgZWwuaW5uZXJIVE1MID0gY29sdW1uQ2hhcnQoZGF5cywgZWwuZGF0YXNldC5tayA9PT0gJ2FsbCcgPyBzdGFja3MgOiBbc3RhY2tzLmZpbmQocyA9PiBzLmtleSA9PT0gZWwuZGF0YXNldC5tayldLCB7IGhlaWdodDogK2VsLmRhdGFzZXQuaCwgdG9kYXk6IEcgPT09ICdkYXknID8gZC50b2RheSA6IG51bGwsIHdpZHRoOiB3LCAuLi4oRyA9PT0gJ2RheScgPyB7fSA6IHsgbGFiZWw6IHggPT4gYlNob3J0KGRheXMuaW5kZXhPZih4KSksIHRpdGxlOiB4ID0+IGJMb25nKGRheXMuaW5kZXhPZih4KSkgfSkgfSk7IH0pOwogIGRyYXcoKTsKICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigncmVzaXplJywgcmVuZGVyU2FsZXMuX3JzIHx8ICgoKSA9PiB7fSkpOyByZW5kZXJTYWxlcy5fcnMgPSAoKSA9PiB7IGlmICh0YWIgPT09ICdzYWxlcycpIGRyYXcoKTsgfTsgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHJlbmRlclNhbGVzLl9ycyk7CiAgY29uc3QgdGlwRWwgPSAkKCcjY2hUaXAnKTsKICAkKCcjc2FsZXNCb2R5Jykub25tb3VzZW1vdmUgPSBlID0+IHsKICAgIGNvbnN0IGggPSBlLnRhcmdldC5jbG9zZXN0KCcuY2gtaGl0Jyk7CiAgICBpZiAoIWgpIHsgdGlwRWwuaGlkZGVuID0gdHJ1ZTsgcmV0dXJuOyB9CiAgICBjb25zdCBbdCwgLi4ucmVzdF0gPSBoLmRhdGFzZXQudGlwLnNwbGl0KCd8Jyk7CiAgICB0aXBFbC5pbm5lckhUTUwgPSBgPGI+JHtlc2ModCl9PC9iPiR7cmVzdC5tYXAociA9PiBgPGRpdj4ke2VzYyhyKX08L2Rpdj5gKS5qb2luKCcnKX1gOwogICAgdGlwRWwuaGlkZGVuID0gZmFsc2U7CiAgICBjb25zdCB4ID0gTWF0aC5taW4oZS5jbGllbnRYICsgMTQsIGlubmVyV2lkdGggLSB0aXBFbC5vZmZzZXRXaWR0aCAtIDgpOwogICAgdGlwRWwuc3R5bGUubGVmdCA9IHggKyAncHgnOyB0aXBFbC5zdHlsZS50b3AgPSAoZS5jbGllbnRZICsgMTQpICsgJ3B4JzsKICB9OwogICQoJyNzYWxlc0JvZHknKS5vbm1vdXNlbGVhdmUgPSAoKSA9PiB7IHRpcEVsLmhpZGRlbiA9IHRydWU7IH07CiAgcmVuZGVyUHJvZHVjdHMoKTsKICByZW5kZXJQcm9maXQoKTsKICBjbGVhclRpbWVvdXQocmVuZGVyU2FsZXMuX3QpOyByZW5kZXJTYWxlcy5fdCA9IHNldFRpbWVvdXQoZnVuY3Rpb24gYWdhaW4oKSB7IGlmICh0YWIgIT09ICdzYWxlcycpIHJldHVybjsgaWYgKGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ/LmNsYXNzTGlzdD8uY29udGFpbnMoJ3BmLWluJykpIHsgcmVuZGVyU2FsZXMuX3QgPSBzZXRUaW1lb3V0KGFnYWluLCA2MGUzKTsgcmV0dXJuOyB9IHJlbmRlclNhbGVzKCk7IH0sIDUgKiA2MGUzKTsKfQoKLy8gLS0tLS0tLS0tLSBWRU5ERURPUkVTIChzb2xvIGxlY3R1cmEsIHBhcmEgZWwgZnVsZmlsbG1lbnQpIC0tLS0tLS0tLS0KYXN5bmMgZnVuY3Rpb24gcmVuZGVyU2VsbGVyc1ZpZXcoKSB7CiAgJCgnI21haW4nKS5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz0ic2VjdGlvbi10aXRsZSIgc3R5bGU9Im1hcmdpbi10b3A6MjJweCI+PGgyPlZlbmRlZG9yZXM8L2gyPjxzcGFuIGNsYXNzPSJtdXRlZCI+U29sbyBsZWN0dXJhOiBxdcOpIG1hcmtldHBsYWNlcyB0aWVuZSBjb25lY3RhZG9zIGNhZGEgdmVuZGVkb3IuPC9zcGFuPjwvZGl2PjxkaXYgY2xhc3M9InBhbmVsIj48ZGl2IGlkPSJzdkJvZHkiIGNsYXNzPSJwYW5lbC1ib2R5Ij48ZGl2IGNsYXNzPSJtdXRlZCI+Q2FyZ2FuZG/igKY8L2Rpdj48L2Rpdj48L2Rpdj5gOwogIGNvbnN0IHsgc2VsbGVyczogbGlzdCB9ID0gYXdhaXQgYXBpKCcvYXBpL3NlbGxlcnMvb3ZlcnZpZXcnKTsKICBjb25zdCBjb25uID0gYyA9PiBgPHNwYW4gY2xhc3M9Im1rICR7Yy5tYXJrZXRwbGFjZX0iPiR7TUtbYy5tYXJrZXRwbGFjZV19PC9zcGFuPiA8c3BhbiBjbGFzcz0ibm90ZSIgc3R5bGU9ImRpc3BsYXk6aW5saW5lIj4ke2Mub2sgPyAnQ29uZWN0YWRvJyA6ICc8YiBzdHlsZT0iY29sb3I6dmFyKC0tbG9jaykiPkNvbiBwcm9ibGVtYXM8L2I+J30ke2MubGFzdF9zeW5jX2F0ID8gJyDCtyByZXZpc2FkbyAnICsgZXNjKGZtdFRpbWUoYy5sYXN0X3N5bmNfYXQpKSA6ICcnfTwvc3Bhbj5gOwogICQoJyNzdkJvZHknKS5pbm5lckhUTUwgPSBsaXN0Lmxlbmd0aCA/IGA8ZGl2IGNsYXNzPSJ0YWJsZS13cmFwIj48dGFibGUgc3R5bGU9Im1pbi13aWR0aDo1MjBweCI+PHRoZWFkPjx0cj48dGg+VmVuZGVkb3I8L3RoPjx0aD5NYXJrZXRwbGFjZXMgY29uZWN0YWRvczwvdGg+PHRoPlBvciBpbXByaW1pcjwvdGg+PHRoPlByb2R1Y3RvcyBibG9xdWVhZG9zPC90aD48L3RyPjwvdGhlYWQ+PHRib2R5PgogICAgJHtsaXN0Lm1hcChzID0+IGA8dHI+PHRkPjxiPiR7ZXNjKHMubmFtZSl9PC9iPjwvdGQ+PHRkPjxkaXYgY2xhc3M9InN0YWNrIiBzdHlsZT0iZ2FwOjZweCI+JHtzLmNvbm5lY3Rpb25zLm1hcChjb25uKS5qb2luKCcnKSB8fCAnPHNwYW4gY2xhc3M9Im11dGVkIj5TaW4gbWFya2V0cGxhY2VzIGNvbmVjdGFkb3M8L3NwYW4+J308L2Rpdj48L3RkPjx0ZD4ke3MucGVuZGluZ308L3RkPjx0ZD4ke3MuYmxvY2tlZH08L3RkPjwvdHI+YCkuam9pbignJyl9CiAgICA8L3Rib2R5PjwvdGFibGU+PC9kaXY+YCA6IGA8ZGl2IGNsYXNzPSJlbXB0eSI+JHtFTVBUWV9TVkd9PGRpdj5Bw7puIG5vIGhheSB2ZW5kZWRvcmVzLjwvZGl2PjwvZGl2PmA7Cn0KCmZ1bmN0aW9uIHN0YXJ0Q2xvY2soKSB7CiAgY29uc3QgW2hoLCBtbV0gPSBtZS5jdXRvZmYuc3BsaXQoJzonKS5tYXAoTnVtYmVyKTsKICBjb25zdCB0aWNrID0gKCkgPT4gewogICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKSwgY3V0ID0gbmV3IERhdGUobm93KTsgY3V0LnNldEhvdXJzKGhoLCBtbSwgMCwgMCk7CiAgICBjb25zdCBjID0gJCgnI2Nsb2NrJyk7IGlmICghYykgcmV0dXJuOwogICAgaWYgKG5vdyA+PSBjdXQpIHsgY3V0LnNldERhdGUoY3V0LmdldERhdGUoKSArIDEpOyBjLmNsYXNzTGlzdC5hZGQoJ2xhdGUnKTsgfSBlbHNlIGMuY2xhc3NMaXN0LnJlbW92ZSgnbGF0ZScpOwogICAgY29uc3QgZCA9IE1hdGguZmxvb3IoKGN1dCAtIG5vdykgLyAxMDAwKTsKICAgICQoJyNjZCcpLnRleHRDb250ZW50ID0gW01hdGguZmxvb3IoZCAvIDM2MDApLCBNYXRoLmZsb29yKGQgJSAzNjAwIC8gNjApLCBkICUgNjBdLm1hcCh4ID0+IFN0cmluZyh4KS5wYWRTdGFydCgyLCAnMCcpKS5qb2luKCc6Jyk7CiAgfTsKICB0aWNrKCk7IGNsZWFySW50ZXJ2YWwoc3RhcnRDbG9jay5faSk7IHN0YXJ0Q2xvY2suX2kgPSBzZXRJbnRlcnZhbCh0aWNrLCAxMDAwKTsKfQoKbGV0IGVzID0gbnVsbCwgcmVmcmVzaFQgPSBudWxsOwpmdW5jdGlvbiBjb25uZWN0U3RyZWFtKCkgewogIGlmIChlcykgZXMuY2xvc2UoKTsKICBlcyA9IG5ldyBFdmVudFNvdXJjZSgnL2FwaS9zdHJlYW0nKTsKICBjb25zdCBsaXZlID0gb24gPT4geyBjb25zdCBsID0gJCgnI2xpdmUnKTsgaWYgKCFsKSByZXR1cm47IGwuY2xhc3NMaXN0LnRvZ2dsZSgnb24nLCBvbik7IGwubGFzdEVsZW1lbnRDaGlsZC50ZXh0Q29udGVudCA9IG9uID8gJ0VuIHZpdm8nIDogJ1JlY29uZWN0YW5kb+KApic7IH07CiAgZXMub25vcGVuID0gKCkgPT4gbGl2ZSh0cnVlKTsKICBlcy5vbmVycm9yID0gKCkgPT4gbGl2ZShmYWxzZSk7CiAgZXMuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgZXYgPT4gewogICAgY29uc3QgZCA9IEpTT04ucGFyc2UoZXYuZGF0YSk7CiAgICBjbGVhclRpbWVvdXQocmVmcmVzaFQpOwogICAgcmVmcmVzaFQgPSBzZXRUaW1lb3V0KCgpID0+IHsgaWYgKGQudHlwZSA9PT0gJ2NvZGVzJykgeyBsb2FkQ29kZXMoKTsgcmV0dXJuOyB9IGlmICh0YWIgPT09ICd0cmF5JykgbG9hZE9yZGVycygpOyBlbHNlIGlmICh0YWIgPT09ICdzZWxsZXInICYmIFsnb3JkZXInLCAnbGFiZWwnLCAnYmxvY2tsaXN0JywgJ2Nvbm5lY3Rpb24nLCAncHJpbnRlZCddLmluY2x1ZGVzKGQudHlwZSkpIGxvYWRTZWxsZXJPcmRlcnMoKTsgfSwgNjAwKTsKICB9KTsKfQoKCi8vIC0tLS0tLS0tLS0gQ8OzZGlnb3MgZGUgYXV0b3JpemFjacOzbiBkZSBkZXZvbHVjaW9uZXMgZGUgTWVyY2FkbyBMaWJyZSAodW5vIG51ZXZvIGNhZGEgZMOtYSkgLS0tLS0tLS0tLQpsZXQgY29kZXNEYXRhID0gbnVsbDsKY29uc3QgS0VZX1NWRyA9ICc8c3ZnIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyLjIiIGFyaWEtaGlkZGVuPSJ0cnVlIj48Y2lyY2xlIGN4PSI4IiBjeT0iMTUiIHI9IjQiLz48cGF0aCBkPSJNMTEgMTJsOS05TTE3IDZsMyAzTTE1IDhsMiAyIi8+PC9zdmc+JzsKY29uc3QgY29kZURheVMgPSBkID0+IG5ldyBEYXRlKGQgKyAnVDEyOjAwOjAwJykudG9Mb2NhbGVEYXRlU3RyaW5nKCdlcy1DTCcsIHsgd2Vla2RheTogJ2xvbmcnLCBkYXk6ICdudW1lcmljJywgbW9udGg6ICdsb25nJyB9KTsKYXN5bmMgZnVuY3Rpb24gbG9hZENvZGVzKCkgewogIGlmIChtZS51c2VyLnJvbGUgPT09ICdmdWxmaWxsbWVudCcgfHwgIU0oJ2NvZGVzJykpIHJldHVybjsKICB0cnkgeyBjb2Rlc0RhdGEgPSBhd2FpdCBhcGkoJy9hcGkvcmV0dXJuLWNvZGVzJyk7IH0gY2F0Y2ggeyByZXR1cm47IH0KICBpZiAodGFiID09PSAnY29kZXMnKSBkcmF3Q29kZXNQYWdlKCk7IGVsc2UgZHJhd0NvZGVzU3RyaXAoKTsKfQovLyBUaXJhIGRpc2NyZXRhIGFycmliYSBkZSBsYSBiYW5kZWphIChhZG1pbiB5IHZlbmRlZG9yZXMpCmZ1bmN0aW9uIGRyYXdDb2Rlc1N0cmlwKCkgewogIGNvbnN0IGJveCA9ICQoJyNyY29kZXMnKTsgaWYgKCFib3ggfHwgIWNvZGVzRGF0YSkgcmV0dXJuOwogIGNvbnN0IGQgPSBjb2Rlc0RhdGE7CiAgaWYgKCFkLmNvZGVzLmxlbmd0aCkgeyBib3guaGlkZGVuID0gdHJ1ZTsgcmV0dXJuOyB9CiAgYm94LmhpZGRlbiA9IGZhbHNlOwogIGNvbnN0IGRvbmUgPSBkLmNvZGVzLmZpbHRlcihjID0+IGMuY29kZSkubGVuZ3RoLCBvbmUgPSBkLmNvZGVzLmxlbmd0aCA9PT0gMSA/IGQuY29kZXNbMF0gOiBudWxsOwogIGNvbnN0IHdhc09wZW4gPSBib3gucXVlcnlTZWxlY3RvcignLnJjLXBvcCcpICYmICFib3gucXVlcnlTZWxlY3RvcignLnJjLXBvcCcpLmhpZGRlbjsKICBjb25zdCBsYWJlbCA9IG9uZSA/IChvbmUuY29kZSA/IGBDw7NkaWdvIE1MIGhveSA8YiBjbGFzcz0icmMtY29kZSI+JHtlc2Mob25lLmNvZGUpfTwvYj5gIDogJ0PDs2RpZ28gTUwgaG95OiA8c3BhbiBjbGFzcz0icmMtbWlzcyI+c2luIGNhcmdhcjwvc3Bhbj4nKSA6IGBDw7NkaWdvcyBNTCA8Yj4ke2RvbmV9LyR7ZC5jb2Rlcy5sZW5ndGh9PC9iPmA7CiAgYm94LmlubmVySFRNTCA9IGA8YnV0dG9uIHR5cGU9ImJ1dHRvbiIgY2xhc3M9InJjLXBpbGwiIGRhdGEtcmN0b2dnbGUgYXJpYS1leHBhbmRlZD0iJHt3YXNPcGVufSI+JHtLRVlfU1ZHfTxzcGFuPiR7bGFiZWx9PC9zcGFuPjwvYnV0dG9uPgogICAgPGRpdiBjbGFzcz0icmMtcG9wIiAke3dhc09wZW4gPyAnJyA6ICdoaWRkZW4nfT48ZGl2IGNsYXNzPSJyYy1wb3AtaCI+RGV2b2x1Y2lvbmVzIE1lcmNhZG8gTGlicmUgwrcgJHtlc2MoY29kZURheVMoZC5kYXkpKX08L2Rpdj4KICAgICR7ZC5jb2Rlcy5tYXAoYyA9PiBgPGRpdiBjbGFzcz0icmMtcm93Ij48c3BhbiBjbGFzcz0icmMtbiI+JHtlc2MoYy5zZWxsZXIpfTwvc3Bhbj4ke2MuY29kZSA/IGA8YiBjbGFzcz0icmMtY29kZSI+JHtlc2MoYy5jb2RlKX08L2I+YCA6ICc8c3BhbiBjbGFzcz0icmMtbWlzcyI+c2luIGPDs2RpZ288L3NwYW4+J30ke2QuY2FuRWRpdCA/IGA8YnV0dG9uIGNsYXNzPSJyYy1lZGl0IiBkYXRhLXJjPSIke2Muc2VsbGVyX2lkfSI+JHtjLmNvZGUgPyAnQ2FtYmlhcicgOiAnQWdyZWdhcid9PC9idXR0b24+YCA6ICcnfTwvZGl2PmApLmpvaW4oJycpfQogICAgJHtkLmNhbkVkaXQgPyAnPGJ1dHRvbiBjbGFzcz0icmMtZWRpdCByYy1ob3didG4iIGRhdGEtaG93PsK/Q8OzbW8gY2FyZ2FybG8gZW4gMSBjbGljPzwvYnV0dG9uPjxkaXYgY2xhc3M9InJjLWhvd2JveCIgaGlkZGVuPicgKyBib29rbWFya2xldEhlbHAoKSArICc8L2Rpdj4nIDogJyd9PC9kaXY+YDsKICBib3gub25jbGljayA9IGUgPT4gewogICAgaWYgKGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLXJjdG9nZ2xlXScpKSB7IGNvbnN0IHBvcCA9IGJveC5xdWVyeVNlbGVjdG9yKCcucmMtcG9wJyk7IHBvcC5oaWRkZW4gPSAhcG9wLmhpZGRlbjsgYm94LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXJjdG9nZ2xlXScpLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICFwb3AuaGlkZGVuKTsgcmV0dXJuOyB9CiAgICBpZiAoZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtaG93XScpKSB7IGNvbnN0IGggPSBib3gucXVlcnlTZWxlY3RvcignLnJjLWhvd2JveCcpOyBoLmhpZGRlbiA9ICFoLmhpZGRlbjsgcmV0dXJuOyB9CiAgICBjb2Rlc0VkaXRDbGljayhlKTsKICB9OwogIGlmICghZHJhd0NvZGVzU3RyaXAuX291dHNpZGUpIHsgZHJhd0NvZGVzU3RyaXAuX291dHNpZGUgPSB0cnVlOyBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGUgPT4geyBjb25zdCBieCA9ICQoJyNyY29kZXMnKTsgY29uc3QgcG9wID0gYng/LnF1ZXJ5U2VsZWN0b3IoJy5yYy1wb3AnKTsgaWYgKHBvcCAmJiAhcG9wLmhpZGRlbiAmJiAhYnguY29udGFpbnMoZS50YXJnZXQpKSB7IHBvcC5oaWRkZW4gPSB0cnVlOyBieC5xdWVyeVNlbGVjdG9yKCdbZGF0YS1yY3RvZ2dsZV0nKT8uc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgJ2ZhbHNlJyk7IH0gfSk7IH0KfQpmdW5jdGlvbiBjb2Rlc0VkaXRDbGljayhlKSB7CiAgY29uc3QgYiA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLXJjXScpOyBpZiAoIWIpIHJldHVybjsKICBjb25zdCBzaWQgPSBOdW1iZXIoYi5kYXRhc2V0LnJjKSwgYyA9IGNvZGVzRGF0YS5jb2Rlcy5maW5kKHggPT4geC5zZWxsZXJfaWQgPT09IHNpZCk7CiAgY29uc3QgY2hpcCA9IGIuY2xvc2VzdCgnLnJjLXJvdywgLnJjLWNhcmQnKTsKICBjb25zdCBob2xkZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdmb3JtJyk7IGhvbGRlci5jbGFzc05hbWUgPSAncmMtZm9ybSc7CiAgaG9sZGVyLmlubmVySFRNTCA9IGA8aW5wdXQgbWF4bGVuZ3RoPSIzMCIgcGxhY2Vob2xkZXI9IkPDs2RpZ28gZGUgaG95IiB2YWx1ZT0iJHtlc2MoYz8uY29kZSB8fCAnJyl9IiBhcmlhLWxhYmVsPSJDw7NkaWdvIGRlICR7ZXNjKGM/LnNlbGxlciB8fCAnJyl9Ij48YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkgYnRuLXNtIj5HdWFyZGFyPC9idXR0b24+YDsKICBiLnJlcGxhY2VXaXRoKGhvbGRlcik7CiAgY29uc3QgaW5wID0gaG9sZGVyLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0Jyk7IGlucC5mb2N1cygpOyBpbnAuc2VsZWN0KCk7CiAgaG9sZGVyLm9uc3VibWl0ID0gYXN5bmMgZXYgPT4geyBldi5wcmV2ZW50RGVmYXVsdCgpOyB0cnkgeyBjb25zdCBwcmV2ID0gYz8uY29kZSB8fCAnJzsgYXdhaXQgYXBpKCcvYXBpL3JldHVybi1jb2Rlcy8nICsgc2lkLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGNvZGU6IGlucC52YWx1ZSB9IH0pOyBpZiAocHJldiAhPT0gaW5wLnZhbHVlLnRyaW0oKSkgeyBhd2FpdCBhcGkoJy9hcGkvdW5kby9jb2RlJywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBsYWJlbDogJ0PDs2RpZ28gZGUgJyArIChjPy5zZWxsZXIgfHwgJycpLCBzZWxsZXJfaWQ6IHNpZCwgcHJldiwgbmV4dDogaW5wLnZhbHVlLnRyaW0oKSB9IH0pLmNhdGNoKCgpID0+IHt9KTsgcmVmcmVzaFVuZG8oKTsgfSB0b2FzdCgnQ8OzZGlnbyBndWFyZGFkbycpOyBsb2FkQ29kZXMoKTsgfSBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlLCA0MDAwKTsgfSB9OwogIGlucC5vbmtleWRvd24gPSBldiA9PiB7IGlmIChldi5rZXkgPT09ICdFc2NhcGUnKSBsb2FkQ29kZXMoKTsgfTsKICBpZiAoY2hpcCkgY2hpcC5jbGFzc0xpc3QuYWRkKCdyYy1lZGl0aW5nJyk7Cn0KCi8vIE1hcmNhZG9yICJFbnZpYXIgY8OzZGlnbyBhIEV0aXF1ZXRhSHViIjogZW4gTWVyY2FkbyBMaWJyZSAoVmVudGFzKSBsZWUgZWwgIkPDs2RpZ28gZGUgYXV0b3JpemFjacOzbiBwYXJhIGhveSIgeSBsbyBhYnJlIGFxdcOtCmNvbnN0IEJPT0tNQVJLTEVUID0gYGphdmFzY3JpcHQ6KCgpPT57Y29uc3QgdD1kb2N1bWVudC5ib2R5LmlubmVyVGV4dDtjb25zdCBtPXQubWF0Y2goL2F1dG9yaXphY2lbb8OzXW4gcGFyYSBob3k6P1xccyooW0EtWjAtOV17NCwxNn0pL2kpO2lmKCFtKXthbGVydCgnTm8gZW5jb250csOpIGVsIGPDs2RpZ28uIEFicmUgVmVudGFzIGVuIE1lcmNhZG8gTGlicmUgeSB2dWVsdmUgYSBpbnRlbnRhci4nKTtyZXR1cm59Y29uc3QgdT0oZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmlubmVySFRNTC5tYXRjaCgvInVzZXJJZCI6IihcXGQrKSIvKXx8W10pWzFdfHwnJzt3aW5kb3cub3BlbignJHtsb2NhdGlvbi5vcmlnaW59L2NvZGlnbz9jPScrbVsxXSsnJnU9Jyt1LCdfYmxhbmsnKX0pKClgOwpmdW5jdGlvbiBib29rbWFya2xldEhlbHAoKSB7CiAgcmV0dXJuIGA8ZGl2IGNsYXNzPSJyYy1oZWxwIj48Yj5DYXJnYXIgZWwgY8OzZGlnbyBlbiAxIGNsaWM8L2I+PG9sPgogICAgPGxpPkFycmFzdHJhIGVzdGUgYm90w7NuIGEgdHUgYmFycmEgZGUgZmF2b3JpdG9zOiA8YSBjbGFzcz0icmMtYm0iIGhyZWY9IiR7ZXNjKEJPT0tNQVJLTEVUKX0iIG9uY2xpY2s9ImV2ZW50LnByZXZlbnREZWZhdWx0KCk7YWxlcnQoJ0FycsOhc3RyYWxvIGEgbGEgYmFycmEgZGUgZmF2b3JpdG9zIChubyBsZSBoYWdhcyBjbGljIGFxdcOtKS4nKSI+RW52aWFyIGPDs2RpZ28gYSBFdGlxdWV0YUh1YjwvYT48L2xpPgogICAgPGxpPkNhZGEgZMOtYSBhYnJlIDxiPlZlbnRhczwvYj4gZW4gTWVyY2FkbyBMaWJyZSBjb24gbGEgY3VlbnRhIGRlbCB2ZW5kZWRvciB5IGhheiBjbGljIGVuIGVzZSBmYXZvcml0by48L2xpPgogICAgPGxpPkVsIGPDs2RpZ28gcXVlZGEgZ3VhcmRhZG8gYXF1w60geSBsbyB2ZW4gbGEgYWdlbmNpYSB5IGVsIGFkbWluaXN0cmFkb3IuPC9saT48L29sPjwvZGl2PmA7Cn0KYXN5bmMgZnVuY3Rpb24gc2F2ZUNvZGVGcm9tTGluaygpIHsKICBjb25zdCBxcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMobG9jYXRpb24uc2VhcmNoKSwgY29kZSA9IChxcy5nZXQoJ2MnKSB8fCAnJykudHJpbSgpLCBtbHUgPSAocXMuZ2V0KCd1JykgfHwgJycpLnRyaW0oKTsKICBoaXN0b3J5LnJlcGxhY2VTdGF0ZShudWxsLCAnJywgJy8nKTsKICBpZiAoIWNvZGUpIHJldHVybiByZW5kZXJTaGVsbCgpOwogIGlmIChtbHUgJiYgWydhZG1pbicsICdzZWxsZXInXS5pbmNsdWRlcyhtZS51c2VyLnJvbGUpKSB7CiAgICByZW5kZXJTaGVsbCgpOwogICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL3JldHVybi1jb2Rlcy9ieS1tbCcsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgbWxfdXNlcl9pZDogbWx1LCBjb2RlIH0gfSk7IHRvYXN0KGBDw7NkaWdvICR7Y29kZX0gZ3VhcmRhZG9gLCA0MDAwKTsgbG9hZENvZGVzKCk7IHJldHVybjsgfQogICAgY2F0Y2ggKGVycikgeyBpZiAobWUudXNlci5yb2xlID09PSAnc2VsbGVyJykgcmV0dXJuIHRvYXN0KGVyci5tZXNzYWdlLCA1MDAwKTsgfQogIH0gZWxzZSByZW5kZXJTaGVsbCgpOwogIGlmIChtZS51c2VyLnJvbGUgPT09ICdzZWxsZXInICYmIG1lLnNlbGxlcikgewogICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL3JldHVybi1jb2Rlcy8nICsgbWUuc2VsbGVyLmlkLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGNvZGUgfSB9KTsgdG9hc3QoYEPDs2RpZ28gJHtjb2RlfSBndWFyZGFkbyBwYXJhICR7bWUuc2VsbGVyLm5hbWV9YCwgNDAwMCk7IGxvYWRDb2RlcygpOyB9IGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UsIDUwMDApOyB9CiAgICByZXR1cm47CiAgfQogIGlmIChtZS51c2VyLnJvbGUgIT09ICdhZG1pbicpIHJldHVybiB0b2FzdCgnU29sbyBlbCBhZG1pbmlzdHJhZG9yIG8gZWwgdmVuZGVkb3IgcHVlZGVuIGNhcmdhciBjw7NkaWdvcycsIDQwMDApOwogIGNvbnN0IGQgPSBhd2FpdCBhcGkoJy9hcGkvcmV0dXJuLWNvZGVzJyk7CiAgY29uc3QgZGxnID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7IGRsZy5jbGFzc05hbWUgPSAncmMtbW9kYWwnOwogIGRsZy5pbm5lckhUTUwgPSBgPGZvcm0gY2xhc3M9InJjLW1vZGFsLWJveCI+PGgzPsK/RGUgcXXDqSBjdWVudGEgZXMgZWwgY8OzZGlnbyA8c3BhbiBjbGFzcz0icmMtY29kZSI+JHtlc2MoY29kZSl9PC9zcGFuPj88L2gzPgogICAgPGRpdiBjbGFzcz0icmMtcGljayI+JHtkLmNvZGVzLm1hcChjID0+IGA8bGFiZWw+PGlucHV0IHR5cGU9InJhZGlvIiBuYW1lPSJyY3MiIHZhbHVlPSIke2Muc2VsbGVyX2lkfSI+ICR7ZXNjKGMuc2VsbGVyKX0ke2MuYWNjb3VudCA/IGAgPHNtYWxsPiR7ZXNjKGMuYWNjb3VudCl9PC9zbWFsbD5gIDogJyd9JHtjLmNvZGUgPyBgIDxzbWFsbD4oaG95OiAke2VzYyhjLmNvZGUpfSk8L3NtYWxsPmAgOiAnJ308L2xhYmVsPmApLmpvaW4oJycpfTwvZGl2PgogICAgPGRpdiBjbGFzcz0icm93LWFjdGlvbnMiPjxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSI+R3VhcmRhcjwvYnV0dG9uPjxidXR0b24gdHlwZT0iYnV0dG9uIiBjbGFzcz0iYnRuIGJ0bi1saW5lIiBkYXRhLXg+Q2FuY2VsYXI8L2J1dHRvbj48L2Rpdj48L2Zvcm0+YDsKICBkb2N1bWVudC5ib2R5LmFwcGVuZChkbGcpOwogIGRsZy5xdWVyeVNlbGVjdG9yKCdbZGF0YS14XScpLm9uY2xpY2sgPSAoKSA9PiBkbGcucmVtb3ZlKCk7CiAgZGxnLnF1ZXJ5U2VsZWN0b3IoJ2Zvcm0nKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4gewogICAgZS5wcmV2ZW50RGVmYXVsdCgpOwogICAgY29uc3QgdiA9IGRsZy5xdWVyeVNlbGVjdG9yKCdpbnB1dFtuYW1lPXJjc106Y2hlY2tlZCcpOyBpZiAoIXYpIHJldHVybiB0b2FzdCgnRWxpZ2UgbGEgY3VlbnRhJyk7CiAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvcmV0dXJuLWNvZGVzLycgKyB2LnZhbHVlLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGNvZGUgfSB9KTsgZGxnLnJlbW92ZSgpOyB0b2FzdCgnQ8OzZGlnbyBndWFyZGFkbycpOyBsb2FkQ29kZXMoKTsgfSBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlLCA0MDAwKTsgfQogIH07Cn0KLy8gUMOhZ2luYSBjb21wbGV0YSBwYXJhIGxhIGFnZW5jaWEgKHkgcXVpZW4gbGEgYWJyYSkKZnVuY3Rpb24gcmVuZGVyQ29kZXNQYWdlKCkgewogICQoJyNtYWluJykuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9InJjLXBhZ2UiIGlkPSJyY1BhZ2UiPjxkaXYgY2xhc3M9ImVtcHR5Ij5DYXJnYW5kbyBjw7NkaWdvc+KApjwvZGl2PjwvZGl2PmA7CiAgbG9hZENvZGVzKCk7Cn0KZnVuY3Rpb24gZHJhd0NvZGVzUGFnZSgpIHsKICBjb25zdCBib3ggPSAkKCcjcmNQYWdlJyk7IGlmICghYm94IHx8ICFjb2Rlc0RhdGEpIHJldHVybjsKICBjb25zdCBkID0gY29kZXNEYXRhOwogIGJveC5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz0icmMtaGVybyI+PGgyPkPDs2RpZ29zIGRlIGF1dG9yaXphY2nDs24gcGFyYSBob3k8L2gyPjxwPkRldm9sdWNpb25lcyBkZSBNZXJjYWRvIExpYnJlIMK3IDxiPiR7ZXNjKGNvZGVEYXlTKGQuZGF5KSl9PC9iPjwvcD48c21hbGw+Q2FtYmlhbiB0b2RvcyBsb3MgZMOtYXMuIEVzdGEgcGFudGFsbGEgc2UgYWN0dWFsaXphIHNvbGEuPC9zbWFsbD48L2Rpdj4KICAgIDxkaXYgY2xhc3M9InJjLWdyaWQiPiR7ZC5jb2Rlcy5tYXAoYyA9PiBgPGRpdiBjbGFzcz0icmMtY2FyZCAke2MuY29kZSA/ICcnIDogJ3JjLWVtcHR5J30iPgogICAgICA8c3BhbiBjbGFzcz0icmMtc2VsbGVyIj4ke2VzYyhjLnNlbGxlcil9PC9zcGFuPiR7Yy5hY2NvdW50ID8gYDxzbWFsbCBjbGFzcz0icmMtYWNjIj4ke2VzYyhjLmFjY291bnQpfTwvc21hbGw+YCA6ICcnfQogICAgICAke2MuY29kZSA/IGA8YiBjbGFzcz0icmMtYmlnIj4ke2VzYyhjLmNvZGUpfTwvYj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIHJjLWNvcHkiIGRhdGEtY29weT0iJHtlc2MoYy5jb2RlKX0iPkNvcGlhcjwvYnV0dG9uPmAgOiAnPHNwYW4gY2xhc3M9InJjLXdhaXQiPkHDum4gbm8gZXN0w6EgZWwgY8OzZGlnbyBkZSBob3k8L3NwYW4+J30KICAgICAgJHtkLmNhbkVkaXQgPyBgPGJ1dHRvbiBjbGFzcz0icmMtZWRpdCIgZGF0YS1yYz0iJHtjLnNlbGxlcl9pZH0iPiR7Yy5jb2RlID8gJ0NhbWJpYXInIDogJysgQWdyZWdhciBjw7NkaWdvJ308L2J1dHRvbj5gIDogJyd9CiAgICA8L2Rpdj5gKS5qb2luKCcnKSB8fCAnPGRpdiBjbGFzcz0iZW1wdHkiPk5vIGhheSBjdWVudGFzIGRlIE1lcmNhZG8gTGlicmUgY29uZWN0YWRhcy48L2Rpdj4nfTwvZGl2PmA7CiAgYm94Lm9uY2xpY2sgPSBlID0+IHsKICAgIGNvbnN0IGNwID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtY29weV0nKTsKICAgIGlmIChjcCkgeyBuYXZpZ2F0b3IuY2xpcGJvYXJkPy53cml0ZVRleHQoY3AuZGF0YXNldC5jb3B5KS50aGVuKCgpID0+IHRvYXN0KCdDw7NkaWdvIGNvcGlhZG8nKSkuY2F0Y2goKCkgPT4ge30pOyByZXR1cm47IH0KICAgIGNvZGVzRWRpdENsaWNrKGUpOwogIH07Cn0KLy8gQ2FtYmlhIGVsIGTDrWEgYSBtZWRpYW5vY2hlOiBzZSB2dWVsdmUgYSBwZWRpciBjYWRhIDUgbWludXRvcyB5IGFsIHZvbHZlciBhIGxhIHBlc3Rhw7FhCnNldEludGVydmFsKCgpID0+IHsgaWYgKG1lICYmICFkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucmMtZm9ybSBpbnB1dDpmb2N1cycpKSBsb2FkQ29kZXMoKTsgfSwgMzAwMDAwKTsKZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigndmlzaWJpbGl0eWNoYW5nZScsICgpID0+IHsgaWYgKCFkb2N1bWVudC5oaWRkZW4gJiYgbWUpIGxvYWRDb2RlcygpOyB9KTsKCgovLyAtLS0tLS0tLS0tIERlc2hhY2VyOiBjYWRhIHVzdWFyaW8gZGVzaGFjZSBzb2xvIGxvIHF1ZSDDqWwgaGl6bywgdW4gcGFzbyBhIGxhIHZleiAtLS0tLS0tLS0tCmxldCB1bmRvSW5mbyA9IHsgbGFiZWw6IG51bGwsIGNvdW50OiAwIH07Ci8vIEFudGVzIGRlIHVuYSBhY2Npw7NuOiBndWFyZGEgY8OzbW8gZXN0YWJhbiBsYXMgZXRpcXVldGFzLiBEZXZ1ZWx2ZSB1bmEgZnVuY2nDs24gcXVlIHNlIGxsYW1hIGN1YW5kbyBsYSBhY2Npw7NuIHRlcm1pbsOzLgphc3luYyBmdW5jdGlvbiByZWNvcmRPcmRlcnMobGFiZWwsIGlkcykgewogIGxldCBpZCA9IG51bGw7CiAgdHJ5IHsgaWQgPSAoYXdhaXQgYXBpKCcvYXBpL3VuZG8vYmVnaW4nLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGxhYmVsLCBpZHMgfSB9KSkuaWQ7IH0gY2F0Y2gge30KICByZXR1cm4gYXN5bmMgKCkgPT4geyBpZiAoIWlkKSByZXR1cm47IHRyeSB7IGF3YWl0IGFwaShgL2FwaS91bmRvLyR7aWR9L2RvbmVgLCB7IG1ldGhvZDogJ1BPU1QnIH0pOyB9IGNhdGNoIHt9IHJlZnJlc2hVbmRvKCk7IH07Cn0KYXN5bmMgZnVuY3Rpb24gcmVmcmVzaFVuZG8oKSB7IHRyeSB7IHVuZG9JbmZvID0gYXdhaXQgYXBpKCcvYXBpL3VuZG8nKTsgfSBjYXRjaCB7fSBkcmF3VW5kbygpOyB9CmFzeW5jIGZ1bmN0aW9uIHVuZG9MYXN0KCkgewogIGNvbnN0IGIgPSAkKCcjdW5kb0J0bicpOyBpZiAoIXVuZG9JbmZvLmxhYmVsIHx8IGI/LmRpc2FibGVkKSByZXR1cm47CiAgaWYgKGIpIGIuZGlzYWJsZWQgPSB0cnVlOwogIHRyeSB7CiAgICBjb25zdCByID0gYXdhaXQgYXBpKCcvYXBpL3VuZG8vbGFzdCcsIHsgbWV0aG9kOiAnUE9TVCcgfSk7CiAgICB0b2FzdChyLnJlc3RvcmVkID8gYERlc2hlY2hvOiAke3IubGFiZWx9YCArIChyLnNraXBwZWQgPyBgICgke3Iuc2tpcHBlZH0gbm8gc2UgdG9jYXJvbiBwb3JxdWUgb3RyYSBwZXJzb25hIGxhcyBjYW1iacOzIGRlc3B1w6lzKWAgOiAnJykgOiBgTm8gc2UgcHVkbyBkZXNoYWNlciAiJHtyLmxhYmVsfSI6IG90cmEgcGVyc29uYSB5YSBjYW1iacOzIGVzYXMgZXRpcXVldGFzYCwgNDUwMCk7CiAgfSBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlLCA0MDAwKTsgfQogIGF3YWl0IHJlZnJlc2hVbmRvKCk7CiAgaWYgKHRhYiA9PT0gJ3RyYXknKSBsb2FkT3JkZXJzKCk7IGVsc2UgaWYgKHRhYiA9PT0gJ3NlbGxlcicpIGxvYWRTZWxsZXJPcmRlcnMoKTsKICBsb2FkQ29kZXMoKTsKfQpmdW5jdGlvbiBkcmF3VW5kbygpIHsKICBjb25zdCBiID0gJCgnI3VuZG9CdG4nKTsgaWYgKCFiKSByZXR1cm47CiAgYi5kaXNhYmxlZCA9ICF1bmRvSW5mby5sYWJlbDsKICBiLnRpdGxlID0gdW5kb0luZm8ubGFiZWwgPyBgRGVzaGFjZXI6ICR7dW5kb0luZm8ubGFiZWx9IChDdHJsK1opYCA6ICdObyB0aWVuZXMgYWNjaW9uZXMgcGFyYSBkZXNoYWNlcic7CiAgYi5xdWVyeVNlbGVjdG9yKCdzbWFsbCcpLnRleHRDb250ZW50ID0gdW5kb0luZm8ubGFiZWwgfHwgJ05hZGEgcXVlIGRlc2hhY2VyJzsKfQpkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgZSA9PiB7IGlmICgoZS5jdHJsS2V5IHx8IGUubWV0YUtleSkgJiYgIWUuc2hpZnRLZXkgJiYgZS5rZXkudG9Mb3dlckNhc2UoKSA9PT0gJ3onICYmICFlLnRhcmdldC5jbG9zZXN0KCdpbnB1dCwgdGV4dGFyZWEsIHNlbGVjdCwgW2NvbnRlbnRlZGl0YWJsZV0nKSAmJiB1bmRvSW5mby5sYWJlbCkgeyBlLnByZXZlbnREZWZhdWx0KCk7IHVuZG9MYXN0KCk7IH0gfSk7CgoKLy8gLS0tLS0tLS0tLSBNS1AgRmxhc2g6IHByZWd1bnRhcywgbWVuc2FqZXMsIHJlY2xhbW9zLCBtZWRpYWNpb25lcyB5IGRldm9sdWNpb25lcyAtLS0tLS0tLS0tCmNvbnN0IG1rID0geyB2aWV3OiAncXVlc3Rpb25zJywgZGF0YTogbnVsbCwgbG9hZGluZzogZmFsc2UsIGhpZGRlbjogbmV3IFNldCgpLCBzZWxsZXI6IHN0b3JlLmdldCgnbWtwU2VsbGVyJywgJycpIH07CmNvbnN0IGFnb1MgPSBkID0+IHsgaWYgKCFkKSByZXR1cm4gJyc7IGNvbnN0IG0gPSBNYXRoLnJvdW5kKChEYXRlLm5vdygpIC0gbmV3IERhdGUoZCkpIC8gNjAwMDApOyByZXR1cm4gbSA8IDEgPyAncmVjacOpbicgOiBtIDwgNjAgPyBgaGFjZSAke219IG1pbmAgOiBtIDwgMTQ0MCA/IGBoYWNlICR7TWF0aC5yb3VuZChtIC8gNjApfSBoYCA6IGBoYWNlICR7TWF0aC5yb3VuZChtIC8gMTQ0MCl9IGRgOyB9Owpjb25zdCBQRVJNX01TRyA9ICc8ZGl2IGNsYXNzPSJta3AtcGVybSI+PGI+RmFsdGEgYWN0aXZhciB1biBwZXJtaXNvIGVuIGxhIGFwcCBkZSBNZXJjYWRvIExpYnJlLjwvYj4gRW50cmEgYSBkZXZlbG9wZXJzLm1lcmNhZG9saWJyZS5jbCDihpIgTWlzIGFwbGljYWNpb25lcyDihpIgRXRpcXVldGFIdWIg4oaSIEVkaXRhciDihpIgUGVybWlzb3MgZnVuY2lvbmFsZXMgeSBhY3RpdmEgPGI+IkNvbXVuaWNhY2lvbmVzIHByZSB5IHBvc3QgdmVudGEiPC9iPiAobGVjdHVyYSB5IGVzY3JpdHVyYSkuIEN1YW5kbyBsbyBndWFyZGVzLCBlc3RhIHNlY2Npw7NuIHNlIGxsZW5hIHNvbGEuPC9kaXY+JzsKYXN5bmMgZnVuY3Rpb24gcmVuZGVyTWtwKGZvcmNlID0gZmFsc2UpIHsKICBpZiAoIU0oJ21rcCcpICYmIE0oJ3N0b2NrJykpIHsKICAgICQoJyNtYWluJykuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9Im1rcC1oZXJvIj48ZGl2PjxoMj7wn5OmIENvbnRyb2wgZGUgc3RvY2s8L2gyPjxwPlVuIHNvbG8gc3RvY2sgcG9yIFNLVSBwYXJhIHRvZGFzIHR1cyBjdWVudGFzIHkgbWFya2V0cGxhY2VzLjwvcD48L2Rpdj48L2Rpdj48ZGl2IGlkPSJzdG9ja0JveCIgY2xhc3M9InN0b2NrLWJveCI+PGRpdiBjbGFzcz0iZW1wdHkiPkNhcmdhbmRv4oCmPC9kaXY+PC9kaXY+YDsKICAgIHJldHVybiBkcmF3U3RvY2soKTsKICB9CiAgaWYgKCEkKCcjbWtwQm9keScpKSB7CiAgICAkKCcjbWFpbicpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJta3AtaGVybyI+PGRpdj48aDI+TUtQIEZsYXNoPC9oMj48cD5Ub2RvIGxvIHF1ZSB0dXMgY29tcHJhZG9yZXMgZXNwZXJhbiBkZSB0aSwgZW4gdW4gc29sbyBsdWdhci48L3A+PC9kaXY+PHNwYW4gY2xhc3M9InNwYWNlciIgc3R5bGU9ImZsZXg6MSI+PC9zcGFuPjxzcGFuIGlkPSJta3BQaWNrIj48L3NwYW4+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1zbSBta3AtcmVmcmVzaCIgaWQ9Im1rcFJlZnJlc2giPkFjdHVhbGl6YXI8L2J1dHRvbj48L2Rpdj48ZGl2IGlkPSJta3BCb2R5Ij48ZGl2IGNsYXNzPSJlbXB0eSI+Q2FyZ2FuZG8gcHJlZ3VudGFzLCBtZW5zYWplcyB5IHJlY2xhbW9zIGRlIE1lcmNhZG8gTGlicmXigKYgKHB1ZWRlIHRhcmRhciB1bm9zIHNlZ3VuZG9zKTwvZGl2PjwvZGl2PmA7CiAgICAkKCcjbWtwUmVmcmVzaCcpLm9uY2xpY2sgPSAoKSA9PiByZW5kZXJNa3AodHJ1ZSk7CiAgfQogIGlmIChtay5sb2FkaW5nKSByZXR1cm47IG1rLmxvYWRpbmcgPSB0cnVlOwogIHRyeSB7IG1rLmRhdGEgPSBhd2FpdCBhcGkoYC9hcGkvbWtwL3N1bW1hcnk/JHttay5zZWxsZXIgPyAnc2VsbGVyX2lkPScgKyBtay5zZWxsZXIgKyAnJicgOiAnJ30ke2ZvcmNlID8gJ3JlZnJlc2g9MScgOiAnJ31gKTsgfQogIGNhdGNoIChlKSB7ICQoJyNta3BCb2R5JykuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9InBhbmVsIj48ZGl2IGNsYXNzPSJwYW5lbC1ib2R5Ij4ke2VzYyhlLm1lc3NhZ2UpfTwvZGl2PjwvZGl2PmA7IG1rLmxvYWRpbmcgPSBmYWxzZTsgcmV0dXJuOyB9CiAgbWsubG9hZGluZyA9IGZhbHNlOwogIGlmICh0YWIgIT09ICdta3AnKSByZXR1cm47CiAgaWYgKG1lLnVzZXIucm9sZSA9PT0gJ2FkbWluJyAmJiAkKCcjbWtwUGljaycpICYmICEkKCcjbWtwU2VsJykpIHsKICAgIGNvbnN0IHNsID0gYXdhaXQgYXBpKCcvYXBpL3NlbGxlcnMvbGlzdCcpLmNhdGNoKCgpID0+ICh7IHNlbGxlcnM6IFtdIH0pKTsKICAgICQoJyNta3BQaWNrJykuaW5uZXJIVE1MID0gYDxzZWxlY3QgaWQ9Im1rcFNlbCIgc3R5bGU9IndpZHRoOmF1dG8iPjxvcHRpb24gdmFsdWU9IiI+VG9kYXMgbGFzIGN1ZW50YXM8L29wdGlvbj4ke3NsLnNlbGxlcnMubWFwKHggPT4gYDxvcHRpb24gdmFsdWU9IiR7eC5pZH0iICR7U3RyaW5nKHguaWQpID09PSBTdHJpbmcobWsuc2VsbGVyKSA/ICdzZWxlY3RlZCcgOiAnJ30+JHtlc2MoeC5uYW1lKX08L29wdGlvbj5gKS5qb2luKCcnKX08L3NlbGVjdD5gOwogICAgJCgnI21rcFNlbCcpLm9uY2hhbmdlID0gZSA9PiB7IG1rLnNlbGxlciA9IGUudGFyZ2V0LnZhbHVlOyBzdG9yZS5zZXQoJ21rcFNlbGxlcicsIG1rLnNlbGxlcik7IHJlbmRlck1rcCgpOyB9OwogIH0KICBkcmF3TWtwKCk7CiAgY2xlYXJUaW1lb3V0KHJlbmRlck1rcC5fdCk7IHJlbmRlck1rcC5fdCA9IHNldFRpbWVvdXQoKCkgPT4geyBpZiAodGFiID09PSAnbWtwJyAmJiBtay52aWV3ICE9PSAnc3RvY2snICYmICFkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcubWtwLWJvZHkgdGV4dGFyZWE6Zm9jdXMnKSkgcmVuZGVyTWtwKCk7IH0sIG1rLmRhdGEubG9hZGluZyA/IDgwMDAgOiAxMjBlMyk7Cn0KLy8gY2xpYyBmdWVyYSBkZSBsb3MgcmVjdWFkcm9zICh5IGZ1ZXJhIGRlbCBkZXRhbGxlKSA9IGRlc21hcmNhciBsYSBzZWNjacOzbgpkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGUgPT4gewogIGlmICh0YWIgIT09ICdta3AnIHx8ICFtay52aWV3IHx8ICEkKCcjbWtwQm9keScpKSByZXR1cm47CiAgaWYgKG1rLnZpZXcgPT09ICdzdG9jaycpIHJldHVybjsKICBpZiAoZS50YXJnZXQuY2xvc2VzdCgnLm1rcC10aWxlcywgLm1rcC1ib2R5LCAubWtwLWhlcm8sIC50b3AsIGJ1dHRvbiwgYSwgaW5wdXQsIHRleHRhcmVhLCBzZWxlY3QsIGZvcm0sIGxhYmVsLCAudG9hc3QnKSkgcmV0dXJuOwogIG1rLnZpZXcgPSBudWxsOyBkcmF3TWtwKCk7Cn0pOwovLyAtLS0tLS0tLS0tIENvbnRyb2wgZGUgc3RvY2sgLS0tLS0tLS0tLQpjb25zdCBzdGsgPSB7IHE6ICcnLCBib2RlZ2E6ICcnLCBvcGVuOiBuZXcgU2V0KCksIGQ6IG51bGwgfTsKYXN5bmMgZnVuY3Rpb24gZHJhd1N0b2NrKCkgewogIGNvbnN0IGJveCA9ICQoJyNzdG9ja0JveCcpOyBpZiAoIWJveCkgcmV0dXJuOwogIGxldCBkOyB0cnkgeyBkID0gc3RrLmQgPSBhd2FpdCBhcGkoJy9hcGkvc3RvY2snKTsgfSBjYXRjaCAoZSkgeyBib3guaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9ImVtcHR5Ij4ke2VzYyhlLm1lc3NhZ2UpfTwvZGl2PmA7IHJldHVybjsgfQogIGNvbnN0IGFkbWluID0gbWUudXNlci5yb2xlID09PSAnYWRtaW4nOwogIGNvbnN0IHNoYXJlZCA9IGlkID0+IGQuYm9kZWdhcy5maW5kKGIgPT4gYi5pZCA9PT0gaWQpPy5zaGFyZWQ7CiAgY29uc3QgYk5hbWUgPSBpZCA9PiBkLmJvZGVnYXMuZmluZChiID0+IGIuaWQgPT09IGlkKT8ubmFtZSB8fCAnJzsKICBjb25zdCBxID0gc3RrLnEudG9Mb3dlckNhc2UoKTsKICBjb25zdCBpdGVtcyA9IGQuaXRlbXMuZmlsdGVyKGkgPT4gKCFzdGsuYm9kZWdhIHx8IFN0cmluZyhpLmJvZGVnYV9pZCkgPT09IHN0ay5ib2RlZ2EpICYmICghcSB8fCBbaS5za3UsIGkubmFtZSwgaS5vd25lcl9uYW1lXS5qb2luKCcgJykudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxKSkpOwogIGNvbnN0IGNoaXAgPSBsID0+IGA8c3BhbiBjbGFzcz0ic3RrLWNoICR7bC5mdWxsID8gJ2Z1bGwnIDogJyd9ICR7bC5ta19xdHkgIT0gbnVsbCAmJiAhbC5mdWxsID8gJycgOiAnJ30iIHRpdGxlPSIke2VzYyhsLnRpdGxlKX0ke2wuYWNjb3VudCA/ICcgwrcgJyArIGVzYyhsLmFjY291bnQpIDogJyd9Ij48aSBjbGFzcz0iZG90IiBzdHlsZT0iYmFja2dyb3VuZDoke01LX0NPTE9SW2wubWtdIHx8ICcjODg4J30iPjwvaT4ke2VzYyhNS1tsLm1rXSB8fCBsLm1rKX0ke2wuYWNjb3VudCA/IGAgPHNtYWxsPiR7ZXNjKGwuYWNjb3VudCl9PC9zbWFsbD5gIDogJyd9IDxiPiR7bC5mdWxsID8gJ0Z1bGwnIDogbC5ta19xdHkgPz8gJ+KAlCd9PC9iPjwvc3Bhbj5gOwogIGNvbnN0IHN0ID0gcyA9PiAoeyBvazogJ+KchScsIGVycm9yOiAn4pqg77iPJywgcHJldmlldzogJ/Cfp6onLCBza2lwOiAn4o+4JyB9KVtzXSB8fCAnJzsKICBjb25zdCBmbXQgPSB0ID0+IHQgPyBuZXcgRGF0ZSh0LnJlcGxhY2UoJyAnLCAnVCcpICsgJ1onKS50b0xvY2FsZVN0cmluZygnZXMtQ0wnLCB7IGRheTogJzItZGlnaXQnLCBtb250aDogJ3Nob3J0JywgaG91cjogJzItZGlnaXQnLCBtaW51dGU6ICcyLWRpZ2l0JyB9KSA6ICcnOwogIGJveC5pbm5lckhUTUwgPSBgCiAgICA8ZGl2IGNsYXNzPSJzdGstYm9kcy1zdCI+JHtkLmJvZGVnYXMubWFwKGIgPT4gYDxkaXYgY2xhc3M9InN0ay1tb2RlICR7Yi5hY3RpdmUgPyAnbGl2ZScgOiAndGVzdCd9Ij4KICAgICAgPGRpdj48Yj4ke2IuYWN0aXZlID8gJ/Cfn6InIDogJ+KPuCd9ICR7ZXNjKGIubmFtZSl9IMK3ICR7Yi5hY3RpdmUgPyAnU3RvY2sgYWN0aXZvJyA6ICdTaW4gY29uZmlybWFyJ308L2I+PHNtYWxsPiR7Yi5hY3RpdmUKICAgICAgICA/IGBDYWRhIHZlbnRhIGRlc2N1ZW50YSB5IHNlIGFjdHVhbGl6YSBhbCBpbnN0YW50ZSBlbiB0b2RhcyBsYXMgcHVibGljYWNpb25lcyBkZSAke2Iuc2VsbGVycy5sZW5ndGggPiAxID8gKGIuc2hhcmVkID8gJ3N1cyAnICsgYi5zZWxsZXJzLmxlbmd0aCArICcgZW1wcmVzYXMgKHN0b2NrIGNvbXBhcnRpZG8pJyA6ICdjYWRhIGVtcHJlc2EgKHN0b2NrIHNlcGFyYWRvKScpIDogZXNjKGIuc2VsbGVyc1swXT8ubmFtZSB8fCAnJyl9LmAKICAgICAgICA6ICFiLnNrdXMgPyAnUHJpbWVybyB0b2NhICJUcmFlciBwdWJsaWNhY2lvbmVzIHkgc3RvY2siLicgOiBiLm1pc3NpbmcgPyBgRmFsdGFuIDxiPiR7Yi5taXNzaW5nfTwvYj4gU0tVIHNpbiBjYW50aWRhZC4gQ8OhcmdhbG9zIHkgbHVlZ28gY29uZmlybWE6IHJlY2nDqW4gYWjDrSBzZSBhY3RpdmEuYCA6ICdSZXZpc2EgbGFzIGNhbnRpZGFkZXMgeSBjb25mw61ybWFsYXM6IHJlY2nDqW4gYWjDrSBzZSBhY3RpdmEuIE1pZW50cmFzIHRhbnRvIG5vIHNlIGRlc2N1ZW50YSBuaSBzZSBjYW1iaWEgbmFkYSBlbiB0dXMgbWFya2V0cGxhY2VzLid9PC9zbWFsbD48L2Rpdj4KICAgICAgJHthZG1pbiA/IChiLmFjdGl2ZSA/IGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLXN0a3BhdXNlPSIke2IuaWR9Ij5QYXVzYXI8L2J1dHRvbj5gIDogYDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSBidG4tc20iIGRhdGEtc3RrY29uZj0iJHtiLmlkfSI+4pyTIENvbmZpcm1hciBjYW50aWRhZGVzIHkgYWN0aXZhcjwvYnV0dG9uPmApIDogJyd9CiAgICA8L2Rpdj5gKS5qb2luKCcnKX08L2Rpdj4KICAgIDxkaXYgY2xhc3M9InN0ay1iYXIiPgogICAgICAke2FkbWluID8gYDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSBidG4tc20iIGlkPSJzdGtJbXBvcnQiPuKfsyBUcmFlciBwdWJsaWNhY2lvbmVzIHkgc3RvY2s8L2J1dHRvbj5gIDogJyd9CiAgICAgIDxzZWxlY3QgaWQ9InN0a0IiIHN0eWxlPSJ3aWR0aDphdXRvIj48b3B0aW9uIHZhbHVlPSIiPlRvZGFzIGxhcyBib2RlZ2FzPC9vcHRpb24+JHtkLmJvZGVnYXMubWFwKGIgPT4gYDxvcHRpb24gdmFsdWU9IiR7Yi5pZH0iICR7U3RyaW5nKGIuaWQpID09PSBzdGsuYm9kZWdhID8gJ3NlbGVjdGVkJyA6ICcnfT4ke2VzYyhiLm5hbWUpfTwvb3B0aW9uPmApLmpvaW4oJycpfTwvc2VsZWN0PgogICAgICA8aW5wdXQgdHlwZT0ic2VhcmNoIiBpZD0ic3RrUSIgcGxhY2Vob2xkZXI9IkJ1c2NhciBTS1UgbyBwcm9kdWN0byIgdmFsdWU9IiR7ZXNjKHN0ay5xKX0iIHN0eWxlPSJmbGV4OjE7bWluLXdpZHRoOjE2MHB4Ij4KICAgICAgPHNtYWxsIGNsYXNzPSJtdXRlZCI+JHtkLmltcG9ydGVkX2F0ID8gJ1B1YmxpY2FjaW9uZXMgbGXDrWRhczogJyArIGZtdChkLmltcG9ydGVkX2F0KSA6ICdBw7puIG5vIHNlIGxlZW4gbGFzIHB1YmxpY2FjaW9uZXMnfTwvc21hbGw+CiAgICA8L2Rpdj4KICAgICR7IWQuaW1wb3J0ZWRfYXQgJiYgYWRtaW4gPyBgPGRpdiBjbGFzcz0icGFuZWwgc3RrLXN0YXJ0Ij48ZGl2IGNsYXNzPSJwYW5lbC1ib2R5Ij48Yj5QYXJhIGVtcGV6YXI6PC9iPjxvbD48bGk+QXJtYSB0dXMgYm9kZWdhcyBhYmFqbyAocXVpw6luIGNvbXBhcnRlIHN0b2NrIGNvbiBxdWnDqW4pLjwvbGk+PGxpPlRvY2EgPGI+IlRyYWVyIHB1YmxpY2FjaW9uZXMgeSBzdG9jayI8L2I+OiBsYSBhcHAgbGVlIHRvZGFzIHR1cyBwdWJsaWNhY2lvbmVzIHkgdG9tYSBjb21vIHN0b2NrIGRlIHBhcnRpZGEgZWwgPGI+bWVub3I8L2I+IHF1ZSBtdWVzdHJlbiB0dXMgbWFya2V0cGxhY2VzIHBhcmEgY2FkYSBTS1UgKGFzw60gbm8gc29icmV2ZW5kZXMpLjwvbGk+PGxpPlJldmlzYSB5IGNvcnJpZ2UgbGFzIGNhbnRpZGFkZXMuIExhcyBwdWJsaWNhY2lvbmVzIHNlIHVuZW4gcG9yIDxiPlNLVTwvYj46IHVzYSBlbCBtaXNtbyBTS1UgZW4gdG9kYXMgdHVzIGN1ZW50YXMuPC9saT48bGk+VG9jYSA8Yj4iQ29uZmlybWFyIGNhbnRpZGFkZXMgeSBhY3RpdmFyIjwvYj46IHJlY2nDqW4gYWjDrSBsYSBhcHAgZW1waWV6YSBhIGRlc2NvbnRhciBjYWRhIHZlbnRhIHkgYSBhY3R1YWxpemFyIHR1cyBwdWJsaWNhY2lvbmVzLjwvbGk+PC9vbD48L2Rpdj48L2Rpdj5gIDogJyd9CiAgICA8ZGl2IGNsYXNzPSJwYW5lbCI+PGRpdiBjbGFzcz0idGFibGUtd3JhcCI+PHRhYmxlIGNsYXNzPSJzdGstdGFibGUiPjx0aGVhZD48dHI+PHRoPlNLVTwvdGg+PHRoPlByb2R1Y3RvPC90aD4ke2QuYm9kZWdhcy5sZW5ndGggPiAxID8gJzx0aD5Cb2RlZ2E8L3RoPicgOiAnJ308dGggY2xhc3M9Im51bSI+U3RvY2s8L3RoPjx0aD5QdWJsaWNhY2lvbmVzIChzdG9jayBxdWUgbXVlc3RyYSBjYWRhIHVuYSk8L3RoPjwvdHI+PC90aGVhZD48dGJvZHk+CiAgICAgICR7aXRlbXMuc2xpY2UoMCwgNjAwKS5tYXAoaSA9PiBgPHRyIGNsYXNzPSIke2kuZGlmZiA/ICdzdGstZGlmZicgOiAnJ30iPjx0ZCBjbGFzcz0ibW9ubyI+JHtlc2MoaS5za3UpfTwvdGQ+PHRkPiR7ZXNjKGkubmFtZSB8fCAnJyl9JHtpLm93bmVyX25hbWUgPyBgPHNtYWxsIGNsYXNzPSJtdXRlZCI+IMK3ICR7ZXNjKGkub3duZXJfbmFtZSl9PC9zbWFsbD5gIDogJyd9PC90ZD4ke2QuYm9kZWdhcy5sZW5ndGggPiAxID8gYDx0ZD48c21hbGw+JHtlc2MoYk5hbWUoaS5ib2RlZ2FfaWQpKX08L3NtYWxsPjwvdGQ+YCA6ICcnfQogICAgICAgIDx0ZCBjbGFzcz0ibnVtIj48aW5wdXQgY2xhc3M9InN0ay1pbiIgdHlwZT0ibnVtYmVyIiBtaW49IjAiIHN0ZXA9IjEiIHZhbHVlPSIke2kucXR5ID8/ICcnfSIgcGxhY2Vob2xkZXI9IuKAlCIgZGF0YS1iPSIke2kuYm9kZWdhX2lkfSIgZGF0YS1vPSIke2kub3duZXJ9IiBkYXRhLXNrdT0iJHtlc2MoaS5za3UpfSI+PC90ZD4KICAgICAgICA8dGQ+JHtpLmxpbmtzLmxlbmd0aCA/IGkubGlua3MubWFwKGNoaXApLmpvaW4oJyAnKSA6ICc8c21hbGwgY2xhc3M9Im11dGVkIj5zaW4gcHVibGljYWNpb25lcyBjb24gZXN0ZSBTS1U8L3NtYWxsPid9JHtpLmRpZmYgPyAnPHNtYWxsIGNsYXNzPSJzdGstd2FybiI+4pqgIGFsZ8O6biBtYXJrZXRwbGFjZSBtdWVzdHJhIG90cm8gc3RvY2s8L3NtYWxsPicgOiAnJ308L3RkPjwvdHI+YCkuam9pbignJykgfHwgYDx0cj48dGQgY29sc3Bhbj0iNSIgY2xhc3M9Im11dGVkIj4ke2QuaW1wb3J0ZWRfYXQgPyAnU2luIHByb2R1Y3RvcyBjb24gU0tVLicgOiAnVG9jYSAiVHJhZXIgcHVibGljYWNpb25lcyB5IHN0b2NrIiBwYXJhIGVtcGV6YXIuJ308L3RkPjwvdHI+YH0KICAgIDwvdGJvZHk+PC90YWJsZT48L2Rpdj4ke2l0ZW1zLmxlbmd0aCA+IDYwMCA/IGA8cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJwYWRkaW5nOjhweCI+TW9zdHJhbmRvIDYwMCBkZSAke2l0ZW1zLmxlbmd0aH06IHVzYSBlbCBidXNjYWRvci48L3A+YCA6ICcnfTwvZGl2PgogICAgPGRldGFpbHMgY2xhc3M9InBhbmVsIHN0ay1zZWMiPjxzdW1tYXJ5PjxiPkNhcmdhciBzdG9jayBwZWdhbmRvIHVuYSBsaXN0YTwvYj4gPHNtYWxsIGNsYXNzPSJtdXRlZCI+U0tVO2NhbnRpZGFkLCB1bm8gcG9yIGzDrW5lYTwvc21hbGw+PC9zdW1tYXJ5PjxkaXYgY2xhc3M9InBhbmVsLWJvZHkgc3RhY2siPgogICAgICA8c2VsZWN0IGlkPSJzdGtCdWxrQiI+JHtkLmJvZGVnYXMubWFwKGIgPT4gYi5zaGFyZWQgPyBgPG9wdGlvbiB2YWx1ZT0iJHtiLmlkfXwwIj4ke2VzYyhiLm5hbWUpfTwvb3B0aW9uPmAgOiBiLnNlbGxlcnMubWFwKHMgPT4gYDxvcHRpb24gdmFsdWU9IiR7Yi5pZH18JHtzLmlkfSI+JHtlc2MoYi5uYW1lKX0gwrcgJHtlc2Mocy5uYW1lKX08L29wdGlvbj5gKS5qb2luKCcnKSkuam9pbignJyl9PC9zZWxlY3Q+CiAgICAgIDx0ZXh0YXJlYSBpZD0ic3RrQnVsayIgcm93cz0iNSIgcGxhY2Vob2xkZXI9IlBDVk5FMTAyOzI1JiMxMDtQQ1ZCTDEwMjsxOCI+PC90ZXh0YXJlYT48YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkgYnRuLXNtIiBpZD0ic3RrQnVsa0dvIiBzdHlsZT0iYWxpZ24tc2VsZjpmbGV4LXN0YXJ0Ij5DYXJnYXI8L2J1dHRvbj48L2Rpdj48L2RldGFpbHM+CiAgICAke2FkbWluID8gYDxkZXRhaWxzIGNsYXNzPSJwYW5lbCBzdGstc2VjIiAke2QuYm9kZWdhcy5zb21lKGIgPT4gYi5zZWxsZXJzLmxlbmd0aCA+IDEpID8gJycgOiAnb3Blbid9PjxzdW1tYXJ5PjxiPkJvZGVnYXM8L2I+IDxzbWFsbCBjbGFzcz0ibXV0ZWQiPiR7ZC5ib2RlZ2FzLmxlbmd0aH0gwrcgcXXDqSBlbXByZXNhcyBjb21wYXJ0ZW4gc3RvY2s8L3NtYWxsPjwvc3VtbWFyeT48ZGl2IGNsYXNzPSJwYW5lbC1ib2R5Ij4KICAgICAgPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luLXRvcDowO2ZvbnQtc2l6ZToxM3B4Ij48Yj5TdG9jayBjb21wYXJ0aWRvOjwvYj4gdW4gc29sbyBzdG9jayBwb3IgU0tVIHBhcmEgdG9kYXMgbGFzIGVtcHJlc2FzIGRlIGxhIGJvZGVnYSAocG9yIGVqZW1wbG8sIHVuYSBwZXJzb25hIGNvbiAzIGN1ZW50YXMgZGUgTWVyY2FkbyBMaWJyZSB5IDMgZGUgUGFyaXMpLjxicj48Yj5TdG9jayBzZXBhcmFkbzo8L2I+IGxhIG1pc21hIGJvZGVnYSBmw61zaWNhLCBwZXJvIGNhZGEgZW1wcmVzYSBjb24gc3UgcHJvcGlvIHN0b2NrIChwb3IgZWplbXBsbywgMyB2ZW5kZWRvcmVzIGRpc3RpbnRvcyBlbiB1biBtaXNtbyBnYWxww7NuKS48L3A+CiAgICAgIDxkaXYgY2xhc3M9InN0ay1ib2RzIj4ke2QuYm9kZWdhcy5tYXAoYiA9PiBgPGZvcm0gY2xhc3M9InN0ay1ib2QiIGRhdGEtYmlkPSIke2IuaWR9Ij48aW5wdXQgbmFtZT0ibmFtZSIgdmFsdWU9IiR7ZXNjKGIubmFtZSl9IiBtYXhsZW5ndGg9IjYwIj48bGFiZWwgY2xhc3M9InN3aXRjaCI+PGlucHV0IHR5cGU9ImNoZWNrYm94IiBuYW1lPSJzaGFyZWQiICR7Yi5zaGFyZWQgPyAnY2hlY2tlZCcgOiAnJ30+IFN0b2NrIGNvbXBhcnRpZG88L2xhYmVsPjxkaXYgY2xhc3M9InN0ay1zZWwiPiR7ZC5zZWxsZXJzLm1hcChzID0+IGA8bGFiZWw+PGlucHV0IHR5cGU9ImNoZWNrYm94IiBuYW1lPSJzIiB2YWx1ZT0iJHtzLmlkfSIgJHtiLnNlbGxlcnMuc29tZSh4ID0+IHguaWQgPT09IHMuaWQpID8gJ2NoZWNrZWQnIDogJyd9PiAke2VzYyhzLm5hbWUpfTwvbGFiZWw+YCkuam9pbignJyl9PC9kaXY+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1naG9zdCBidG4tc20iPkd1YXJkYXI8L2J1dHRvbj48L2Zvcm0+YCkuam9pbignJyl9CiAgICAgICAgPGZvcm0gY2xhc3M9InN0ay1ib2QgbmV3IiBkYXRhLWJpZD0iIj48aW5wdXQgbmFtZT0ibmFtZSIgcGxhY2Vob2xkZXI9Ik51ZXZhIGJvZGVnYSAoZWouIEJvZGVnYSBjZW50cmFsKSIgbWF4bGVuZ3RoPSI2MCI+PGxhYmVsIGNsYXNzPSJzd2l0Y2giPjxpbnB1dCB0eXBlPSJjaGVja2JveCIgbmFtZT0ic2hhcmVkIiBjaGVja2VkPiBTdG9jayBjb21wYXJ0aWRvPC9sYWJlbD48ZGl2IGNsYXNzPSJzdGstc2VsIj4ke2Quc2VsbGVycy5tYXAocyA9PiBgPGxhYmVsPjxpbnB1dCB0eXBlPSJjaGVja2JveCIgbmFtZT0icyIgdmFsdWU9IiR7cy5pZH0iPiAke2VzYyhzLm5hbWUpfTwvbGFiZWw+YCkuam9pbignJyl9PC9kaXY+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IGJ0bi1zbSI+Q3JlYXIgYm9kZWdhPC9idXR0b24+PC9mb3JtPjwvZGl2PgogICAgICA8cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTJweCI+VW5hIGVtcHJlc2EgZXN0w6EgZW4gdW5hIHNvbGEgYm9kZWdhOiBhbCBtYXJjYXJsYSBlbiBvdHJhLCBzZSBjYW1iaWEuIExhcyBib2RlZ2FzIHF1ZSBxdWVkYW4gc2luIGVtcHJlc2FzIHNlIGJvcnJhbi48L3A+PC9kaXY+PC9kZXRhaWxzPmAgOiAnJ30KICAgIDxkZXRhaWxzIGNsYXNzPSJwYW5lbCBzdGstc2VjIj48c3VtbWFyeT48Yj5DdWVudGFzIGNvbmVjdGFkYXM8L2I+IDxzbWFsbCBjbGFzcz0ibXV0ZWQiPiR7ZC5jaGFubmVscy5sZW5ndGh9PC9zbWFsbD48L3N1bW1hcnk+PGRpdiBjbGFzcz0icGFuZWwtYm9keSI+JHtkLmNoYW5uZWxzLm1hcChjID0+IGA8ZGl2IGNsYXNzPSJzdGstY2hyb3ciPjxpIGNsYXNzPSJkb3QiIHN0eWxlPSJiYWNrZ3JvdW5kOiR7TUtfQ09MT1JbYy5ta10gfHwgJyM4ODgnfSI+PC9pPjxiPiR7ZXNjKGMubmFtZSl9PC9iPiAke2VzYyhjLmFjY291bnQpfSDCtyAke2MubGlua3N9IHB1YmxpY2FjaW9uZXMgJHtjLmNhbldyaXRlID8gJycgOiBgPHNtYWxsIGNsYXNzPSJzdGstd2FybiI+JHtjLmNhblJlYWQgPyAnc29sbyBsZWN0dXJhJyA6ICd0b2RhdsOtYSBubyBzZSBwdWVkZSBzaW5jcm9uaXphciBzdSBzdG9jayd9PC9zbWFsbD5gfTwvZGl2PmApLmpvaW4oJycpIHx8ICc8c3BhbiBjbGFzcz0ibXV0ZWQiPlNpbiBjdWVudGFzIGNvbmVjdGFkYXM8L3NwYW4+J30KICAgICAgPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEycHgiPkxhcyBwdWJsaWNhY2lvbmVzIGRlIDxiPkZ1bGw8L2I+IGRlIE1lcmNhZG8gTGlicmUgbm8gc2UgdG9jYW46IGVzZSBzdG9jayBsbyBtYW5lamEgTWVyY2FkbyBMaWJyZSBlbiBzdSBib2RlZ2EuPC9wPjwvZGl2PjwvZGV0YWlscz4KICAgICR7ZC5ub1NrdS5sZW5ndGggPyBgPGRldGFpbHMgY2xhc3M9InBhbmVsIHN0ay1zZWMiPjxzdW1tYXJ5PjxiPlB1YmxpY2FjaW9uZXMgc2luIFNLVTwvYj4gPHNtYWxsIGNsYXNzPSJzdGstd2FybiI+JHtkLm5vU2t1Lmxlbmd0aH0gbm8gc2UgcHVlZGVuIHNpbmNyb25pemFyPC9zbWFsbD48L3N1bW1hcnk+PGRpdiBjbGFzcz0icGFuZWwtYm9keSI+PHAgY2xhc3M9Im11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEzcHg7bWFyZ2luLXRvcDowIj5Qb25sZXMgU0tVIGVuIGVsIG1hcmtldHBsYWNlIChlbCBtaXNtbyBlbiB0b2RhcyB0dXMgY3VlbnRhcykgeSB2dWVsdmUgYSB0cmFlciBsYXMgcHVibGljYWNpb25lcy48L3A+JHtkLm5vU2t1Lm1hcCh4ID0+IGA8ZGl2IGNsYXNzPSJzdGstY2hyb3ciPjxpIGNsYXNzPSJkb3QiIHN0eWxlPSJiYWNrZ3JvdW5kOiR7TUtfQ09MT1JbeC5ta10gfHwgJyM4ODgnfSI+PC9pPiR7ZXNjKE1LW3gubWtdIHx8IHgubWspfSA8c21hbGw+JHtlc2MoeC5hY2NvdW50KX08L3NtYWxsPiDCtyAke2VzYyh4LnRpdGxlKX0gPHNtYWxsIGNsYXNzPSJtb25vIj4ke2VzYyh4LnJlZil9PC9zbWFsbD48L2Rpdj5gKS5qb2luKCcnKX08L2Rpdj48L2RldGFpbHM+YCA6ICcnfQogICAgPGRldGFpbHMgY2xhc3M9InBhbmVsIHN0ay1zZWMiPjxzdW1tYXJ5PjxiPkVudsOtb3MgYSBsb3MgbWFya2V0cGxhY2VzPC9iPiA8c21hbGwgY2xhc3M9Im11dGVkIj7Dumx0aW1vcyBjYW1iaW9zIGVudmlhZG9zIGEgdHVzIHB1YmxpY2FjaW9uZXM8L3NtYWxsPjwvc3VtbWFyeT48ZGl2IGNsYXNzPSJwYW5lbC1ib2R5Ij4ke2QucHVzaGVzLm1hcCh4ID0+IGA8ZGl2IGNsYXNzPSJzdGstY2hyb3ciPiR7c3QoeC5zdGF0dXMpfSA8c21hbGw+JHtlc2MoZm10KHguYXQpKX08L3NtYWxsPiDCtyA8YiBjbGFzcz0ibW9ubyI+JHtlc2MoeC5za3UpfTwvYj4g4oaSICR7eC5xdHl9IGVuICR7ZXNjKE1LW3gubWtdIHx8IHgubWsgfHwgJycpfSA8c21hbGw+JHtlc2MoeC5hY2NvdW50IHx8ICcnKX08L3NtYWxsPiA8c21hbGwgY2xhc3M9Im11dGVkIj4ke2VzYyh4LmRldGFpbCB8fCAnJyl9PC9zbWFsbD48L2Rpdj5gKS5qb2luKCcnKSB8fCAnPHNwYW4gY2xhc3M9Im11dGVkIj5Ub2RhdsOtYSBuYWRhLjwvc3Bhbj4nfTwvZGl2PjwvZGV0YWlscz4KICAgIDxkZXRhaWxzIGNsYXNzPSJwYW5lbCBzdGstc2VjIj48c3VtbWFyeT48Yj5Nb3ZpbWllbnRvczwvYj4gPHNtYWxsIGNsYXNzPSJtdXRlZCI+dmVudGFzLCBjYW5jZWxhY2lvbmVzIHkgYWp1c3Rlczwvc21hbGw+PC9zdW1tYXJ5PjxkaXYgY2xhc3M9InBhbmVsLWJvZHkiPiR7ZC5tb3Zlcy5tYXAoeCA9PiBgPGRpdiBjbGFzcz0ic3RrLWNocm93Ij48c21hbGw+JHtlc2MoZm10KHguYXQpKX08L3NtYWxsPiDCtyA8YiBjbGFzcz0ibW9ubyI+JHtlc2MoeC5za3UpfTwvYj4gPGIgY2xhc3M9IiR7eC5kZWx0YSA8IDAgPyAnbmVnJyA6ICdwb3MnfSI+JHt4LmRlbHRhID4gMCA/ICcrJyA6ICcnfSR7eC5kZWx0YX08L2I+IOKGkiAke3gucXR5X2FmdGVyfSDCtyAke2VzYyh4LnJlYXNvbiB8fCAnJyl9IDxzbWFsbCBjbGFzcz0ibXV0ZWQiPiR7ZXNjKHguYnkgfHwgJycpfTwvc21hbGw+PC9kaXY+YCkuam9pbignJykgfHwgJzxzcGFuIGNsYXNzPSJtdXRlZCI+VG9kYXbDrWEgbmFkYS48L3NwYW4+J308L2Rpdj48L2RldGFpbHM+YDsKICBjb25zdCByZSA9ICgpID0+IGRyYXdTdG9jaygpOwogICQoJyNzdGtRJykub25pbnB1dCA9IGUgPT4geyBzdGsucSA9IGUudGFyZ2V0LnZhbHVlOyBjbGVhclRpbWVvdXQoc3RrLl90KTsgc3RrLl90ID0gc2V0VGltZW91dCgoKSA9PiB7IGNvbnN0IHBvcyA9IGUudGFyZ2V0LnNlbGVjdGlvblN0YXJ0OyByZSgpLnRoZW4oKCkgPT4geyBjb25zdCBpID0gJCgnI3N0a1EnKTsgaWYgKGkpIHsgaS5mb2N1cygpOyBpLnNldFNlbGVjdGlvblJhbmdlKHBvcywgcG9zKTsgfSB9KTsgfSwgMzUwKTsgfTsKICAkKCcjc3RrQicpLm9uY2hhbmdlID0gZSA9PiB7IHN0ay5ib2RlZ2EgPSBlLnRhcmdldC52YWx1ZTsgcmUoKTsgfTsKICBib3gub25jbGljayA9IGFzeW5jIGUgPT4gewogICAgY29uc3QgYyA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLXN0a2NvbmZdJyksIHB6ID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtc3RrcGF1c2VdJyk7CiAgICBpZiAoYykgewogICAgICBjb25zdCBiID0gZC5ib2RlZ2FzLmZpbmQoeCA9PiBTdHJpbmcoeC5pZCkgPT09IGMuZGF0YXNldC5zdGtjb25mKTsKICAgICAgY29uc3QgbiA9IGQuaXRlbXMuZmlsdGVyKGkgPT4gaS5ib2RlZ2FfaWQgPT09IGIuaWQpLnJlZHVjZSgoYSwgaSkgPT4gYSArIGkubGlua3MuZmlsdGVyKGwgPT4gIWwuZnVsbCkubGVuZ3RoLCAwKTsKICAgICAgaWYgKCFjb25maXJtKGDCv0NvbmZpcm1hciBlbCBzdG9jayBkZSAiJHtiLm5hbWV9Ij9cblxuJHtiLnNrdXN9IFNLVSDCtyAke259IHB1YmxpY2FjaW9uZXMuXG5cbkRlc2RlIGFob3JhOlxu4oCiIGxhIGFwcCBlbnZpYXLDoSBlc3RhcyBjYW50aWRhZGVzIGEgdG9kYXMgZXNhcyBwdWJsaWNhY2lvbmVzO1xu4oCiIGNhZGEgdmVudGEgZGVzY29udGFyw6EgZWwgc3RvY2sgeSBsbyBhY3R1YWxpemFyw6EgZW4gdG9kb3MgdHVzIG1hcmtldHBsYWNlcy5gKSkgcmV0dXJuOwogICAgICBjLmRpc2FibGVkID0gdHJ1ZTsgYy50ZXh0Q29udGVudCA9ICdBY3RpdmFuZG/igKYnOwogICAgICB0cnkgeyBjb25zdCByID0gYXdhaXQgYXBpKCcvYXBpL3N0b2NrL2NvbmZpcm0nLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGJvZGVnYV9pZDogYi5pZCB9IH0pOyB0b2FzdChgU3RvY2sgYWN0aXZvIGVuICIke2IubmFtZX0iOiAke3Iubn0gU0tVIGVudmlhZG9zIGEgdHVzIHB1YmxpY2FjaW9uZXNgLCA2MDAwKTsgfSBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlLCA2MDAwKTsgfQogICAgICByZXR1cm4gcmUoKTsKICAgIH0KICAgIGlmIChweikgeyBpZiAoIWNvbmZpcm0oJ8K/UGF1c2FyIGVzdGEgYm9kZWdhPyBMYXMgdmVudGFzIGRlamFyw6FuIGRlIGRlc2NvbnRhciBzdG9jayBoYXN0YSBxdWUgbGEgdnVlbHZhcyBhIGNvbmZpcm1hci4nKSkgcmV0dXJuOyB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvc3RvY2svcGF1c2UnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IGJvZGVnYV9pZDogTnVtYmVyKHB6LmRhdGFzZXQuc3RrcGF1c2UpIH0gfSk7IHRvYXN0KCdCb2RlZ2EgZW4gcGF1c2EnKTsgfSBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlLCA1MDAwKTsgfSByZXR1cm4gcmUoKTsgfQogIH07CiAgaWYgKCQoJyNzdGtJbXBvcnQnKSkgJCgnI3N0a0ltcG9ydCcpLm9uY2xpY2sgPSBhc3luYyBlID0+IHsKICAgIGNvbnN0IGIgPSBlLnRhcmdldDsgYi5kaXNhYmxlZCA9IHRydWU7IGIudGV4dENvbnRlbnQgPSAnTGV5ZW5kbyBwdWJsaWNhY2lvbmVz4oCmIChwdWVkZSB0YXJkYXIgdW4gcGFyIGRlIG1pbnV0b3MpJzsKICAgIHRyeSB7IGNvbnN0IHIgPSBhd2FpdCBhcGkoJy9hcGkvc3RvY2svaW1wb3J0JywgeyBtZXRob2Q6ICdQT1NUJyB9KTsgY29uc3QgZXJycyA9IHIucmVzdWx0LmZpbHRlcih4ID0+IHguZXJyb3IpOyB0b2FzdChgTGlzdG86ICR7ci5yZXN1bHQuZmlsdGVyKHggPT4gIXguZXJyb3IpLnJlZHVjZSgoYSwgeCkgPT4gYSArIHguY291bnQsIDApfSBwdWJsaWNhY2lvbmVzIGxlw61kYXMke2VycnMubGVuZ3RoID8gJyDCtyAnICsgZXJycy5tYXAoeCA9PiAoTUtbeC5ta10gfHwgeC5taykgKyAnOiAnICsgeC5lcnJvcikuam9pbignIMK3ICcpIDogJyd9YCwgODAwMCk7IH0KICAgIGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UsIDYwMDApOyB9CiAgICByZSgpOwogIH07CiAgYm94Lm9uY2hhbmdlID0gYXN5bmMgZSA9PiB7CiAgICBjb25zdCBpID0gZS50YXJnZXQuY2xvc2VzdCgnLnN0ay1pbicpOyBpZiAoIWkpIHJldHVybjsKICAgIHRyeSB7IGNvbnN0IHIgPSBhd2FpdCBhcGkoJy9hcGkvc3RvY2svc2V0JywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBib2RlZ2FfaWQ6IGkuZGF0YXNldC5iLCBvd25lcjogaS5kYXRhc2V0Lm8sIHNrdTogaS5kYXRhc2V0LnNrdSwgcXR5OiBpLnZhbHVlIH0gfSk7IGkudmFsdWUgPSByLnF0eTsgaS5jbGFzc0xpc3QuYWRkKCdzYXZlZCcpOyBzZXRUaW1lb3V0KCgpID0+IGkuY2xhc3NMaXN0LnJlbW92ZSgnc2F2ZWQnKSwgMTIwMCk7IHRvYXN0KGAke2kuZGF0YXNldC5za3V9OiBzdG9jayAke3IucXR5fSR7ZC5ib2RlZ2FzLmZpbmQoYiA9PiBTdHJpbmcoYi5pZCkgPT09IGkuZGF0YXNldC5iKT8uYWN0aXZlID8gJyDCtyBhY3R1YWxpemFuZG8gcHVibGljYWNpb25lcycgOiAnJ31gKTsgfQogICAgY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSwgNTAwMCk7IH0KICB9OwogICQoJyNzdGtCdWxrR28nKS5vbmNsaWNrID0gYXN5bmMgKCkgPT4gewogICAgY29uc3QgW2IsIG9dID0gJCgnI3N0a0J1bGtCJykudmFsdWUuc3BsaXQoJ3wnKTsKICAgIHRyeSB7IGNvbnN0IHIgPSBhd2FpdCBhcGkoJy9hcGkvc3RvY2svYnVsaycsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgYm9kZWdhX2lkOiBiLCBvd25lcjogbywgdGV4dDogJCgnI3N0a0J1bGsnKS52YWx1ZSB9IH0pOyB0b2FzdChgJHtyLm59IFNLVSBjYXJnYWRvcyR7ci5iYWQubGVuZ3RoID8gJyDCtyBubyBzZSBlbnRlbmRpZXJvbjogJyArIHIuYmFkLmpvaW4oJywgJykgOiAnJ31gLCA2MDAwKTsgcmUoKTsgfSBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlLCA1MDAwKTsgfQogIH07CiAgYm94LnF1ZXJ5U2VsZWN0b3JBbGwoJ2Zvcm0uc3RrLWJvZCcpLmZvckVhY2goZiA9PiBmLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICBlLnByZXZlbnREZWZhdWx0KCk7CiAgICBjb25zdCBzZWxsZXJzID0gWy4uLmYucXVlcnlTZWxlY3RvckFsbCgnaW5wdXRbbmFtZT1zXTpjaGVja2VkJyldLm1hcCh4ID0+IHgudmFsdWUpOwogICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL3N0b2NrL2JvZGVnYScsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgaWQ6IGYuZGF0YXNldC5iaWQgfHwgbnVsbCwgbmFtZTogZi5lbGVtZW50cy5uYW1lLnZhbHVlLCBzaGFyZWQ6IGYuZWxlbWVudHMuc2hhcmVkLmNoZWNrZWQsIHNlbGxlcnMgfSB9KTsgdG9hc3QoJ0JvZGVnYSBndWFyZGFkYScpOyByZSgpOyB9IGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UsIDUwMDApOyB9CiAgfSk7Cn0KZnVuY3Rpb24gbWtwTGlzdHMoKSB7CiAgY29uc3QgZCA9IG1rLmRhdGEsIEEgPSBkLmFjY291bnRzOwogIGNvbnN0IHRhZyA9IGEgPT4gKHsgLi4uYSB9KTsKICBjb25zdCBxID0gW10sIG0gPSBbXSwgYyA9IFtdLCBtZCA9IFtdLCByID0gW107CiAgLy8gc29sbyBzZSBtdWVzdHJhICJmYWx0YSBwZXJtaXNvIiBzaSBOSU5HVU5BIGN1ZW50YSBwdWRvIGxlZXJzZTsgc2kgYWxndW5hIGZhbGxhLCBzZSBhdmlzYSBhcGFydGUKICBjb25zdCBhbGxFcnIgPSBrID0+IEEubGVuZ3RoID4gMCAmJiBBLmV2ZXJ5KGEgPT4gYS5lcnJvcnNba10gPT09ICdwZXJtaXNvJyk7CiAgY29uc3QgZXJyID0geyBxdWVzdGlvbnM6IGFsbEVycigncXVlc3Rpb25zJyksIG1lc3NhZ2VzOiBhbGxFcnIoJ21lc3NhZ2VzJyksIGNsYWltczogYWxsRXJyKCdjbGFpbXMnKSwgcmV0dXJuczogYWxsRXJyKCdyZXR1cm5zJykgfTsKICBlcnIucGFydGlhbCA9IEEuZmlsdGVyKGEgPT4gT2JqZWN0LnZhbHVlcyhhLmVycm9ycyB8fCB7fSkuaW5jbHVkZXMoJ3Blcm1pc28nKSkubWFwKGEgPT4gYS5zZWxsZXIpOwogIGZvciAoY29uc3QgYSBvZiBBKSB7CiAgICBhLnF1ZXN0aW9ucy5mb3JFYWNoKHggPT4geyBpZiAoIW1rLmhpZGRlbi5oYXMoJ3EnICsgeC5pZCkpIHEucHVzaCh7IC4uLngsIGFjYzogYSB9KTsgfSk7CiAgICBhLm1lc3NhZ2VzLmZvckVhY2goeCA9PiB7IGlmICghbWsuaGlkZGVuLmhhcygnbScgKyB4LnBhY2tfaWQpKSBtLnB1c2goeyAuLi54LCBhY2M6IGEgfSk7IH0pOwogICAgYS5jbGFpbXMuZm9yRWFjaCh4ID0+IHsgYy5wdXNoKHsgLi4ueCwgYWNjOiBhIH0pOyBpZiAoeC5kaXNwdXRlKSBtZC5wdXNoKHsgLi4ueCwgYWNjOiBhIH0pOyB9KTsgLy8gUmVjbGFtb3MgPSB0b2RvcyBsb3MgcXVlIGhheSBxdWUgYXRlbmRlciAoaW5jbHV5ZSBsb3MgcXVlIGVzdMOhbiBlbiBtZWRpYWNpw7NuKQogICAgYS5yZXR1cm5zLmZvckVhY2goeCA9PiByLnB1c2goeyAuLi54LCBhY2M6IGEgfSkpOwogIH0KICBmb3IgKGNvbnN0IGYgb2YgZC5mYWxhYmVsbGEpIGYucmV0dXJucy5mb3JFYWNoKHggPT4gci5wdXNoKHsgLi4ueCwgYWNjOiBmIH0pKTsKICByZXR1cm4geyBxLCBtLCBjLCBtZCwgciwgZXJyLCB0YWcgfTsKfQpmdW5jdGlvbiBkcmF3TWtwKCkgewogIGNvbnN0IGJveCA9ICQoJyNta3BCb2R5Jyk7IGlmICghYm94IHx8ICFtay5kYXRhKSByZXR1cm47CiAgY29uc3QgTCA9IG1rcExpc3RzKCk7CiAgY29uc3QgclRvZGF5ID0gTC5yLmZpbHRlcih4ID0+IHgudG9kYXkpOwogIGNvbnN0IHJCeSA9IGsgPT4gclRvZGF5LmZpbHRlcih4ID0+IHgubWsgPT09IGspLmxlbmd0aDsKICBjb25zdCBkID0gbWsuZGF0YSwgbGF0ZU4gPSAoZC5sYXRlIHx8IFtdKS5maWx0ZXIoeCA9PiB4LmxldmVsID09PSAnbGF0ZScpLmxlbmd0aCwgd2Fybk4gPSAoZC5sYXRlIHx8IFtdKS5maWx0ZXIoeCA9PiB4LmxldmVsID09PSAnd2FybicpLmxlbmd0aDsKICBjb25zdCB0aWxlcyA9IFsKICAgIFsncXVlc3Rpb25zJywgJ1ByZWd1bnRhcycsIEwucS5sZW5ndGgsICdzaW4gcmVzcG9uZGVyJywgTC5lcnIucXVlc3Rpb25zXSwKICAgIFsnbWVzc2FnZXMnLCAnTWVuc2FqZXMnLCBMLm0ubGVuZ3RoLCAnc2luIGxlZXInLCBMLmVyci5tZXNzYWdlc10sCiAgICBbJ2NsYWltcycsICdSZWNsYW1vcyB5IG1lZGlhY2lvbmVzJywgTC5jLmxlbmd0aCwgYCR7TC5jLmxlbmd0aCAtIEwubWQubGVuZ3RofSByZWNsYW1vcyDCtyAke0wubWQubGVuZ3RofSBtZWRpYWNpb25lc2AsIEwuZXJyLmNsYWltc10sCiAgXTsKICBjb25zdCBhY2NOYW1lID0geCA9PiBtZS51c2VyLnJvbGUgPT09ICdhZG1pbicgPyBgPHNwYW4gY2xhc3M9Im1rcC1hY2MiPiR7ZXNjKHguYWNjLnNlbGxlcil9PC9zcGFuPmAgOiAnJzsKICBjb25zdCByZXBseUJveCA9IChraW5kLCBhdHRycywgbWF4LCBwaCkgPT4gYDxmb3JtIGNsYXNzPSJta3AtcmVwbHkiIGRhdGEta2luZD0iJHtraW5kfSIgJHthdHRyc30+PHRleHRhcmVhIHJvd3M9IjIiIG1heGxlbmd0aD0iJHttYXh9IiBwbGFjZWhvbGRlcj0iJHtwaH0iPjwvdGV4dGFyZWE+PGRpdiBjbGFzcz0ibWtwLXJlcGx5LWJhciI+PHNtYWxsPjxzcGFuIGNsYXNzPSJta3AtY250Ij4wPC9zcGFuPi8ke21heH08L3NtYWxsPjxidXR0b24gY2xhc3M9ImJ0biBidG4tc20gbWtwLXNlbmQiPlJlc3BvbmRlcjwvYnV0dG9uPjwvZGl2PjwvZm9ybT5gOwogIGNvbnN0IHByb2RMaW5lID0gcHMgPT4gKHBzIHx8IFtdKS5tYXAocCA9PiBgJHtlc2MocC50aXRsZSB8fCAnJyl9JHtwLnF0eSA+IDEgPyBgIDxzbWFsbD7DlyR7cC5xdHl9PC9zbWFsbD5gIDogJyd9YCkuam9pbignIMK3ICcpOwogIGxldCBsaXN0ID0gJyc7CiAgaWYgKG1rLnZpZXcgPT09ICdxdWVzdGlvbnMnKSBsaXN0ID0gTC5lcnIucXVlc3Rpb25zID8gUEVSTV9NU0cgOiBMLnEubGVuZ3RoID8gTC5xLm1hcCh4ID0+IGA8YXJ0aWNsZSBjbGFzcz0ibWtwLWNhcmQiPgogICAgICA8ZGl2IGNsYXNzPSJta3AtY2FyZC1oIj4ke3guaXRlbS50aHVtYiA/IGA8aW1nIHNyYz0iJHtlc2MoeC5pdGVtLnRodW1iKX0iIGFsdD0iIiBsb2FkaW5nPSJsYXp5Ij5gIDogJyd9PGRpdj48YSBocmVmPSIke2VzYyh4Lml0ZW0ubGluayB8fCAnIycpfSIgdGFyZ2V0PSJfYmxhbmsiIHJlbD0ibm9vcGVuZXIiPiR7ZXNjKHguaXRlbS50aXRsZSB8fCB4Lml0ZW0uaWQpfTwvYT48c21hbGw+JHthY2NOYW1lKHgpfSR7YWdvUyh4LmRhdGUpfTwvc21hbGw+PC9kaXY+PC9kaXY+CiAgICAgIDxwIGNsYXNzPSJta3AtcSI+4oCcJHtlc2MoeC50ZXh0KX3igJ08L3A+JHtyZXBseUJveCgnYW5zd2VyJywgYGRhdGEtY29ubj0iJHt4LmFjYy5jb25uX2lkfSIgZGF0YS1pZD0iJHt4LmlkfSJgLCAyMDAwLCAnRXNjcmliZSB0dSByZXNwdWVzdGHigKYnKX08ZGl2IGNsYXNzPSJta3AtcmVhZGJhciI+PGJ1dHRvbiB0eXBlPSJidXR0b24iIGNsYXNzPSJxLWRlbCIgZGF0YS1xZGVsPSIke3guaWR9IiBkYXRhLWNvbm49IiR7eC5hY2MuY29ubl9pZH0iIHRpdGxlPSJFbGltaW5hIGxhIHByZWd1bnRhIHNpbiByZXNwb25kZXJsYSwgYXF1w60geSBlbiBNZXJjYWRvIExpYnJlIj7wn5eRIEVsaW1pbmFyIHByZWd1bnRhPC9idXR0b24+PC9kaXY+PC9hcnRpY2xlPmApLmpvaW4oJycpIDogJzxkaXYgY2xhc3M9Im1rcC1lbXB0eSI+8J+OiSBObyB0aWVuZXMgcHJlZ3VudGFzIHBlbmRpZW50ZXMuPC9kaXY+JzsKICBjb25zdCBhdHRIdG1sID0gKGxpc3QsIGNvbm4sIGtpbmQsIHJlZikgPT4gKGxpc3QgfHwgW10pLmxlbmd0aCA/IGA8ZGl2IGNsYXNzPSJidWItYXR0Ij4ke2xpc3QubWFwKGEgPT4geyBjb25zdCB1ID0gYC9hcGkvbWtwL2F0dC8ke2Nvbm59LyR7a2luZH0vJHtlbmNvZGVVUklDb21wb25lbnQocmVmKX0vJHtlbmNvZGVVUklDb21wb25lbnQoYS5mKX1gOyByZXR1cm4gL3BkZi9pLnRlc3QoYS50ICsgYS5uKSA/IGA8YSBocmVmPSIke3V9IiB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciIgY2xhc3M9ImJ1Yi1maWxlIj7wn5OEICR7ZXNjKGEubiB8fCAnQXJjaGl2bycpfTwvYT5gIDogYDxhIGhyZWY9IiR7dX0iIHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIiB0aXRsZT0iVmVyIGVuIGdyYW5kZSIgY2xhc3M9ImJ1Yi1pbWciPjxpbWcgc3JjPSIke3V9IiBhbHQ9IiIgbG9hZGluZz0ibGF6eSIgb25lcnJvcj0idGhpcy5wYXJlbnROb2RlLmNsYXNzTGlzdC5hZGQoJ2Jyb2tlbicpIj48c3Bhbj7wn5OOICR7ZXNjKGEubiB8fCAnQXJjaGl2byBhZGp1bnRvJyl9PC9zcGFuPjwvYT5gOyB9KS5qb2luKCcnKX08L2Rpdj5gIDogJyc7CiAgY29uc3QgaW5pdGlhbHMgPSBuID0+IGVzYyhTdHJpbmcobiB8fCAnQycpLnRyaW0oKS5zcGxpdCgvXHMrLykuc2xpY2UoMCwgMikubWFwKHcgPT4gd1swXSB8fCAnJykuam9pbignJykudG9VcHBlckNhc2UoKSB8fCAnQycpOwogIGNvbnN0IG1sQmFkZ2UgPSAnPHNwYW4gY2xhc3M9ImNoYXQtbWsgbWwiIHRpdGxlPSJDb252ZXJzYWNpw7NuIGRlIE1lcmNhZG8gTGlicmUiPjxzdmcgdmlld0JveD0iMCAwIDI0IDI0IiBhcmlhLWhpZGRlbj0idHJ1ZSI+PHBhdGggZD0iTTQgNWgxNmEyIDIgMCAwIDEgMiAydjhhMiAyIDAgMCAxLTIgMmgtN2wtNSA0di00SDRhMiAyIDAgMCAxLTItMlY3YTIgMiAwIDAgMSAyLTJ6Ii8+PC9zdmc+TWVyY2FkbyBMaWJyZTwvc3Bhbj4nOwogIGNvbnN0IHNlbmRJY28gPSAnPHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGFyaWEtaGlkZGVuPSJ0cnVlIj48cGF0aCBkPSJNMyAyMC41IDIxLjUgMTIgMyAzLjVsMi44IDcuMkwxNSAxMmwtOS4yIDEuM3oiLz48L3N2Zz4nOwogIGlmIChtay52aWV3ID09PSAnbWVzc2FnZXMnKSBsaXN0ID0gTC5lcnIubWVzc2FnZXMgPyBQRVJNX01TRyA6IEwubS5sZW5ndGggPyBMLm0ubWFwKCh4LCBpKSA9PiBgPGFydGljbGUgY2xhc3M9Im1rcC1jYXJkIGNoYXQtY2FyZCIgc3R5bGU9Ii0tZDoke01hdGgubWluKGksIDgpICogNjB9bXMiPgogICAgICA8aGVhZGVyIGNsYXNzPSJjaGF0LWhlYWQiPjxzcGFuIGNsYXNzPSJjaGF0LWF2Ij4ke2luaXRpYWxzKHguYnV5ZXIpfTwvc3Bhbj48ZGl2IGNsYXNzPSJjaGF0LXdobyI+PGI+JHtlc2MoeC5idXllciB8fCAnQ29tcHJhZG9yJyl9PC9iPjxzbWFsbD4ke2FjY05hbWUoeCl9JHt4LnNoaXAgPyBgPHNwYW4gY2xhc3M9ImNoYXQtc2hpcCAke3guc2hpcCA9PT0gJ0ZsZXgnID8gJ2ZsZXgnIDogJ2FnJ30iPiR7eC5zaGlwID09PSAnRmxleCcgPyAn4pqhIE1lcmNhZG8gTGlicmUgRmxleCcgOiB4LnNoaXAgPT09ICdBZ2VuY2lhJyA/ICfwn5OmIE1lcmNhZG8gTGlicmUgQWdlbmNpYScgOiAnTWVyY2FkbyBMaWJyZSAnICsgZXNjKHguc2hpcCl9PC9zcGFuPmAgOiAnJ30ke3gudW5yZWFkID8gYDxzcGFuIGNsYXNzPSJjaGF0LXVucmVhZCI+JHt4LnVucmVhZH0gc2luIGxlZXI8L3NwYW4+YCA6ICcnfTwvc21hbGw+PC9kaXY+JHttbEJhZGdlfTwvaGVhZGVyPgogICAgICA8ZGl2IGNsYXNzPSJjaGF0LXNhbGUiPjxzcGFuIGNsYXNzPSJjaGF0LXNhbGVubyI+VmVudGEgPGI+IyR7ZXNjKHgucGFja19pZCl9PC9iPjwvc3Bhbj48c3BhbiBjbGFzcz0iY2hhdC1pdGVtcyI+8J+bje+4jyAkeyh4LnByb2R1Y3RzICYmIHgucHJvZHVjdHMubGVuZ3RoID8geC5wcm9kdWN0cyA6IFt7IHRpdGxlOiB4LnByb2R1Y3QsIHF0eTogMSB9XSkubWFwKHAgPT4gYDxiPiR7ZXNjKHAudGl0bGUgfHwgJ1Byb2R1Y3RvJyl9PC9iPiR7cC5xdHkgPiAxID8gYCA8ZW0+w5cke3AucXR5fTwvZW0+YCA6ICcnfWApLmpvaW4oJyDCtyAnKX08L3NwYW4+PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9Im1rcC10aHJlYWQgY2hhdC10aHJlYWQiPiR7eC50aHJlYWQuc2xpY2UoLTYpLm1hcCgodCwgaikgPT4gYDxkaXYgY2xhc3M9Im1rcC1idWIgJHt0LmZyb219IiBzdHlsZT0iLS1pOiR7an0iPiR7dC50ZXh0ID8gYDxzcGFuPiR7ZXNjKHQudGV4dCl9PC9zcGFuPmAgOiAnJ30ke2F0dEh0bWwodC5hdHQsIHguYWNjLmNvbm5faWQsICdtc2cnLCB4LnBhY2tfaWQpfTxzbWFsbD4ke2Fnb1ModC5kYXRlKX0ke3QuZnJvbSA9PT0gJ3NlbGxlcicgPyAnIOKck+KckycgOiAnJ308L3NtYWxsPjwvZGl2PmApLmpvaW4oJycpfTwvZGl2PgogICAgICA8Zm9ybSBjbGFzcz0ibWtwLXJlcGx5IGNoYXQtY29tcG9zZSIgZGF0YS1raW5kPSJtZXNzYWdlIiBkYXRhLWNvbm49IiR7eC5hY2MuY29ubl9pZH0iIGRhdGEtcGFjaz0iJHtlc2MoeC5wYWNrX2lkKX0iIGRhdGEtYnV5ZXI9IiR7ZXNjKHguYnV5ZXJfaWQgfHwgJycpfSI+PHRleHRhcmVhIHJvd3M9IjEiIG1heGxlbmd0aD0iMzUwIiBwbGFjZWhvbGRlcj0iRXNjcmliZSB1biBtZW5zYWplIGFsIGNvbXByYWRvcuKApiI+PC90ZXh0YXJlYT48YnV0dG9uIGNsYXNzPSJta3Atc2VuZCBjaGF0LXNlbmQiIHRpdGxlPSJFbnZpYXIiPiR7c2VuZEljb308c3Bhbj5FbnZpYXI8L3NwYW4+PC9idXR0b24+PGRpdiBjbGFzcz0iY2hhdC1mb290Ij48c21hbGw+PHNwYW4gY2xhc3M9Im1rcC1jbnQiPjA8L3NwYW4+LzM1MDwvc21hbGw+PGJ1dHRvbiB0eXBlPSJidXR0b24iIGNsYXNzPSJjaGF0LXJlYWQiIGRhdGEtbWFya3JlYWQ9IiR7ZXNjKHgucGFja19pZCl9IiBkYXRhLWNvbm49IiR7eC5hY2MuY29ubl9pZH0iIHRpdGxlPSJRdWVkYSBjb21vIGxlw61kbyBhcXXDrSB5IGVuIE1lcmNhZG8gTGlicmUgKGFsIGNvbXByYWRvciBsZSBhcGFyZWNlIHZpc3RvKSwgc2luIHJlc3BvbmRlciI+4pyT4pyTIE1hcmNhciBjb21vIGxlw61kbzwvYnV0dG9uPjwvZGl2PjwvZm9ybT48L2FydGljbGU+YCkuam9pbignJykgOiAnPGRpdiBjbGFzcz0ibWtwLWVtcHR5Ij7wn46JIE5vIHRpZW5lcyBtZW5zYWplcyBzaW4gbGVlci48L2Rpdj4nOwogIG1rLmN0ID0gbWsuY3QgfHwge307IC8vIGNvbnZlcnNhY2nDs24gZGUgY2FkYSByZWNsYW1vIChzZSBjYXJnYSBzb2xhKQogIGNvbnN0IGZEdWUgPSBkID0+IG5ldyBEYXRlKGQpLnRvTG9jYWxlU3RyaW5nKCdlcy1DTCcsIHsgZGF5OiAnMi1kaWdpdCcsIG1vbnRoOiAnc2hvcnQnLCBob3VyOiAnMi1kaWdpdCcsIG1pbnV0ZTogJzItZGlnaXQnIH0pOwogIC8vIE1lbnNhamUgZGUgTWVyY2FkbyBMaWJyZSBtw6FzIGNsYXJvOiBuZWdyaXRhcywgb3BjaW9uZXMgbnVtZXJhZGFzIDEpIDIpIDMpIHkgZWwgcGxhem8gZGVzdGFjYWRvCiAgY29uc3QgZm10TWwgPSByYXcgPT4gewogICAgY29uc3QgYiA9IHQgPT4gZXNjKHQpLnJlcGxhY2UoL1wqXCooLis/KVwqXCovZywgJzxiPiQxPC9iPicpLnJlcGxhY2UoL1wqXCovZywgJycpOwogICAgY29uc3QgdCA9IFN0cmluZyhyYXcgfHwgJycpLnJlcGxhY2UoL1xzKy9nLCAnICcpLnRyaW0oKTsKICAgIGNvbnN0IHN0YXJ0cyA9IFtdOyBsZXQgbiA9IDEsIGZyb20gPSAwOwogICAgd2hpbGUgKHRydWUpIHsgY29uc3QgcmUgPSBuZXcgUmVnRXhwKCcoXnxcXHMpJyArIG4gKyAnXFwuXFxzKyg/PVxcUyknLCAnZycpOyByZS5sYXN0SW5kZXggPSBmcm9tOyBjb25zdCBtID0gcmUuZXhlYyh0KTsgaWYgKCFtKSBicmVhazsgc3RhcnRzLnB1c2gobS5pbmRleCArIG1bMV0ubGVuZ3RoKTsgZnJvbSA9IG0uaW5kZXggKyBtWzBdLmxlbmd0aDsgbisrOyB9CiAgICBpZiAoc3RhcnRzLmxlbmd0aCA8IDIpIHJldHVybiBgPHNwYW4+JHtiKHQpfTwvc3Bhbj5gOwogICAgY29uc3QgaW50cm8gPSB0LnNsaWNlKDAsIHN0YXJ0c1swXSkudHJpbSgpOwogICAgY29uc3Qgb3B0cyA9IHN0YXJ0cy5tYXAoKHN0LCBpKSA9PiB0LnNsaWNlKHN0LCBzdGFydHNbaSArIDFdID8/IHQubGVuZ3RoKS5yZXBsYWNlKC9eXGQrXC5ccysvLCAnJykudHJpbSgpKTsKICAgIC8vIGVsIMO6bHRpbW8gcHVudG8gc3VlbGUgdHJhZXIgZWwgY2llcnJlICgiVGVuw6lzIGhhc3Rh4oCmIik6IHNlIHNlcGFyYQogICAgbGV0IG91dHJvID0gJyc7IGNvbnN0IGxhc3QgPSBvcHRzW29wdHMubGVuZ3RoIC0gMV07IGNvbnN0IGN1dCA9IGxhc3Quc2VhcmNoKC9cLlxzKyg/PShUZW7DqXN8VGllbmVzfFNpIG5vfFJlY29yZMOhfFJlY3VlcmRhfFRlbiBlbiBjdWVudGF8SW1wb3J0YW50ZSlcYikvKTsKICAgIGlmIChjdXQgPiAwKSB7IG91dHJvID0gbGFzdC5zbGljZShjdXQgKyAxKS50cmltKCk7IG9wdHNbb3B0cy5sZW5ndGggLSAxXSA9IGxhc3Quc2xpY2UoMCwgY3V0ICsgMSkudHJpbSgpOyB9CiAgICBjb25zdCBvcHQgPSAobywgaSkgPT4geyBjb25zdCBtID0gby5tYXRjaCgvXlwqXCooLis/KVwqXCpccypb4oCU4oCTLV0/XHMqKC4qKSQvKTsgcmV0dXJuIGA8bGk+PHNwYW4gY2xhc3M9Im1sLW4iPiR7aSArIDF9KTwvc3Bhbj48ZGl2PiR7bSA/IGA8Yj4ke2VzYyhtWzFdKX08L2I+JHttWzJdID8gYDxzbWFsbD4ke2IobVsyXSl9PC9zbWFsbD5gIDogJyd9YCA6IGIobyl9PC9kaXY+PC9saT5gOyB9OwogICAgcmV0dXJuIGA8ZGl2IGNsYXNzPSJtbC1tc2ciPiR7KCgpID0+IHsgbGV0IGggPSBiKGludHJvKS5yZXBsYWNlKC9ccypBbmFsaXphbW9zIGVsIGNhc28geSB0ZSBzdWdlcmltb3NbXjpdKjo/XHMqJC9pLCAnJykucmVwbGFjZSgvPGI+TlvDunVdbWVybyBkZSByZWNsYW1hY2lbw7NvXW46PzxcL2I+Oj9ccyooXGQrKVwuPy9pLCAnPC9wPjxwPjxzcGFuIGNsYXNzPSJtbC1jaGlwIj5SZWNsYW1vIE7CsCAkMTwvc3Bhbj4nKTsgcmV0dXJuIGgudHJpbSgpID8gYDxwPiR7aH08L3A+YCA6ICcnOyB9KSgpfTxwIGNsYXNzPSJtbC1oIj5PcGNpb25lcyBxdWUgdGUgb2ZyZWNlIE1lcmNhZG8gTGlicmU6PC9wPjxvbCBjbGFzcz0ibWwtb3B0cyI+JHtvcHRzLm1hcChvcHQpLmpvaW4oJycpfTwvb2w+JHtvdXRybyA/IGA8cCBjbGFzcz0ibWwtZGVhZGxpbmUiPuKPsyAke2Iob3V0cm8pfTwvcD5gIDogJyd9PC9kaXY+YDsKICB9OwogIGNvbnN0IGNsYWltQnVicyA9IHggPT4geyBjb25zdCB0ID0gbWsuY3RbeC5pZF07IGlmICghdCkgcmV0dXJuICc8ZGl2IGNsYXNzPSJjaGF0LWxvYWRpbmciPjxpPjwvaT48aT48L2k+PGk+PC9pPjwvZGl2Pic7IGlmICh0LmVycikgcmV0dXJuIGA8c21hbGwgY2xhc3M9Im11dGVkIj4ke2VzYyh0LmVycil9PC9zbWFsbD5gOyByZXR1cm4gdC5saXN0Lmxlbmd0aCA/IHQubGlzdC5zbGljZSgtMTIpLm1hcCgobSwgaikgPT4gYDxkaXYgY2xhc3M9Im1rcC1idWIgJHttLmZyb219IiBzdHlsZT0iLS1pOiR7an0iPiR7bS5mcm9tID09PSAnbWVkaWF0b3InID8gJzxiIGNsYXNzPSJidWItd2hvIj7impbvuI8gTWVyY2FkbyBMaWJyZSAobWVkaWFkb3IpPC9iPicgOiAnJ30ke20udGV4dCA/IGZtdE1sKG0udGV4dCkgOiAnJ30ke2F0dEh0bWwobS5hdHQsIHguYWNjLmNvbm5faWQsICdjbGFpbScsIHguaWQpfTxzbWFsbD4ke2Fnb1MobS5kYXRlKX0ke20uZnJvbSA9PT0gJ3NlbGxlcicgPyAnIOKck+KckycgOiAnJ308L3NtYWxsPjwvZGl2PmApLmpvaW4oJycpIDogJzxzbWFsbCBjbGFzcz0ibXV0ZWQgY2hhdC1ub25lIj5Bw7puIG5vIGhheSBtZW5zYWplcyBlbiBlc3RlIHJlY2xhbW8uPC9zbWFsbD4nOyB9OwogIGNvbnN0IGNsYWltQ2FyZCA9ICh4LCBpKSA9PiBgPGFydGljbGUgY2xhc3M9Im1rcC1jYXJkIGNoYXQtY2FyZCBjbGFpbS1jaGF0ICR7eC5kaXNwdXRlID8gJ21lZCcgOiAnJ30iIHN0eWxlPSItLWQ6JHtNYXRoLm1pbihpLCA4KSAqIDYwfW1zIj4KICAgICAgPGhlYWRlciBjbGFzcz0iY2hhdC1oZWFkIj48c3BhbiBjbGFzcz0iY2hhdC1hdiI+JHtpbml0aWFscyh4LmJ1eWVyKX08L3NwYW4+PGRpdiBjbGFzcz0iY2hhdC13aG8iPjxiPiR7ZXNjKHguYnV5ZXIgfHwgJ0NvbXByYWRvcicpfTwvYj48c21hbGw+JHthY2NOYW1lKHgpfTxzcGFuIGNsYXNzPSJjbGFpbS10YWcgJHt4LmRpc3B1dGUgPyAnbWVkJyA6ICcnfSI+JHt4LmRpc3B1dGUgPyAn4pqW77iPIEVuIG1lZGlhY2nDs24nIDogJ+KaoO+4jyBSZWNsYW1vIGFiaWVydG8nfTwvc3Bhbj4ke3guZHVlID8gYDxzcGFuIGNsYXNzPSJjbGFpbS1kdWUiPuKPsyBSZXNwb25kZXIgYW50ZXMgZGUgJHtlc2MoZkR1ZSh4LmR1ZSkpfTwvc3Bhbj5gIDogJyd9PC9zbWFsbD48L2Rpdj4ke21sQmFkZ2V9PC9oZWFkZXI+CiAgICAgIDxkaXYgY2xhc3M9ImNoYXQtc2FsZSI+PHNwYW4gY2xhc3M9ImNoYXQtc2FsZW5vIj5WZW50YSA8Yj4jJHtlc2MoeC5wYWNrX2lkIHx8IHgub3JkZXJfaWQpfTwvYj48L3NwYW4+PHNwYW4gY2xhc3M9ImNoYXQtaXRlbXMiPvCfk4wgPGI+JHtlc2MoeC5yZWFzb24gfHwgJ1NpbiBtb3Rpdm8nKX08L2I+PC9zcGFuPiR7eC5wcm9kdWN0cyAmJiB4LnByb2R1Y3RzLmxlbmd0aCA/IGA8c3BhbiBjbGFzcz0iY2hhdC1pdGVtcyI+8J+bje+4jyAke3gucHJvZHVjdHMubWFwKHAgPT4gYDxiPiR7ZXNjKHAudGl0bGUgfHwgJ1Byb2R1Y3RvJyl9PC9iPiR7cC5xdHkgPiAxID8gYCA8ZW0+w5cke3AucXR5fTwvZW0+YCA6ICcnfWApLmpvaW4oJyDCtyAnKX0ke3gudG90YWwgPyBgIMK3ICR7bW9uZXkoeC50b3RhbCl9YCA6ICcnfTwvc3Bhbj5gIDogJyd9PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9Im1rcC10aHJlYWQgY2hhdC10aHJlYWQiIGlkPSJjdC0ke3guaWR9IiBkYXRhLWN0bG9hZD0iJHt4LmlkfSIgZGF0YS1jb25uPSIke3guYWNjLmNvbm5faWR9Ij4ke2NsYWltQnVicyh4KX08L2Rpdj4KICAgICAgPGZvcm0gY2xhc3M9Im1rcC1yZXBseSBjaGF0LWNvbXBvc2UiIGRhdGEta2luZD0iY2xhaW0iIGRhdGEtY29ubj0iJHt4LmFjYy5jb25uX2lkfSIgZGF0YS1pZD0iJHt4LmlkfSIgZGF0YS1tZWQ9IiR7eC5kaXNwdXRlID8gMSA6IDB9Ij48dGV4dGFyZWEgcm93cz0iMSIgbWF4bGVuZ3RoPSIyMDAwIiBwbGFjZWhvbGRlcj0iJHt4LmRpc3B1dGUgPyAnRXNjcmliZSBhbCBtZWRpYWRvciBkZSBNZXJjYWRvIExpYnJl4oCmJyA6ICdSZXNwb25kZSBhbCBjb21wcmFkb3LigKYnfSI+PC90ZXh0YXJlYT48YnV0dG9uIGNsYXNzPSJta3Atc2VuZCBjaGF0LXNlbmQiIHRpdGxlPSJFbnZpYXIiPiR7c2VuZEljb308c3Bhbj5FbnZpYXI8L3NwYW4+PC9idXR0b24+PGRpdiBjbGFzcz0iY2hhdC1mb290Ij48c21hbGw+PHNwYW4gY2xhc3M9Im1rcC1jbnQiPjA8L3NwYW4+LzIwMDAgwrcgJHt4LmRpc3B1dGUgPyAnbG8gbGVlIGVsIG1lZGlhZG9yJyA6ICdsbyBsZWUgZWwgY29tcHJhZG9yJ308L3NtYWxsPjwvZGl2PjwvZm9ybT48L2FydGljbGU+YDsKICBpZiAobWsudmlldyA9PT0gJ21lZGlhdGlvbnMnKSBtay52aWV3ID0gJ2NsYWltcyc7CiAgaWYgKG1rLnZpZXcgPT09ICdjbGFpbXMnKSBsaXN0ID0gTC5lcnIuY2xhaW1zID8gUEVSTV9NU0cgOiBMLmMubGVuZ3RoID8gWy4uLkwuY10uc29ydCgoYSwgYikgPT4gKGIuZGlzcHV0ZSA/IDEgOiAwKSAtIChhLmRpc3B1dGUgPyAxIDogMCkgfHwgU3RyaW5nKGEuZHVlIHx8ICcnKS5sb2NhbGVDb21wYXJlKFN0cmluZyhiLmR1ZSB8fCAnJykpKS5tYXAoKHgsIGkpID0+IGNsYWltQ2FyZCh4LCBpKSkuam9pbignJykgOiAnPGRpdiBjbGFzcz0ibWtwLWVtcHR5Ij7wn46JIE5vIHRpZW5lcyByZWNsYW1vcyBuaSBtZWRpYWNpb25lcyBhYmllcnRvcy48L2Rpdj4nOwogIGlmIChtay52aWV3ID09PSAnbGF0ZScpIHsKICAgIGNvbnN0IExLID0geyBzaW5fZXNjYW5lYXI6ICdTaW4gZXNjYW5lYXInLCBub19lbnRyZWdhZG86ICdObyBlbnRyZWdhZG8nLCBub19kZXNwYWNoYWRvOiAnTm8gZGVzcGFjaGFkbycgfTsKICAgIGNvbnN0IHdoeSA9IHggPT4gQ0FUW3gubWtdPy5raW5kID09PSAnc3RvcmUnCiAgICAgID8gKHgubGV2ZWwgPT09ICd3YXJuJyA/IGBZYSBzb24gbcOhcyBkZSBsYXMgMjA6MDAgeSBlbCBwZWRpZG8gZGUgJHtNS1t4Lm1rXX0gYcO6biBubyBzZSBtYXJjYSBjb21vIGVudmlhZG8uYCA6IGBQYXPDsyBzdSBkw61hIGRlIGRlc3BhY2hvIHkgZWwgcGVkaWRvIHNpZ3VlIHNpbiBtYXJjYXJzZSBjb21vIGVudmlhZG8gZW4gJHtNS1t4Lm1rXX0uYCkKICAgICAgOiB4Lm1rICE9PSAnbWwnCiAgICAgID8gKHgubGV2ZWwgPT09ICd3YXJuJyA/IGBZYSBzb24gbcOhcyBkZSBsYXMgMjA6MDAgeSAke01LW3gubWtdIHx8IHgubWt9IC8gbGEgYWdlbmNpYSBhw7puIG5vIGxvIGVzY2FuZWEuYCA6IGBQYXPDsyBzdSBkw61hIGRlIGRlc3BhY2hvIHkgJHtNS1t4Lm1rXSB8fCB4Lm1rfSB0b2RhdsOtYSBubyBsbyByZWdpc3RyYSBjb21vIGRlc3BhY2hhZG8uYCkKICAgICAgOiB4LnNoaXAgPT09ICdGbGV4JwogICAgICA/ICh4LmtpbmQgPT09ICdzaW5fZXNjYW5lYXInID8gKHgubGV2ZWwgPT09ICd3YXJuJyA/ICdZYSBzb24gbcOhcyBkZSBsYXMgMTk6MDAgeSBlbCBjb25kdWN0b3IgYcO6biBubyBlc2NhbmVhIGxhIGV0aXF1ZXRhLicgOiAnRWwgY29uZHVjdG9yIG51bmNhIGVzY2FuZcOzIGxhIGV0aXF1ZXRhIHkgeWEgcGFzw7MgZWwgcGxhem8gZGUgZW50cmVnYSAoMjM6MDApLicpIDogJ1Bhc2Fyb24gbGFzIDIzOjAwIHkgZWwgY2xpZW50ZSB0b2RhdsOtYSBubyBsbyByZWNpYmUuJykKICAgICAgOiAnUGFzw7MgbGEgaG9yYSBsw61taXRlIHkgdG9kYXbDrWEgbm8gc2UgZW50cmVnYSBlbiAnICsgKHguc2hpcCA9PT0gJ0NvbGVjdGEnID8gJ2xhIGNvbGVjdGEnIDogJ2xhIGFnZW5jaWEnKSArICcuJzsKICAgIGNvbnN0IGZEdWUgPSBkID0+IG5ldyBEYXRlKGQpLnRvTG9jYWxlU3RyaW5nKCdlcy1DTCcsIHsgd2Vla2RheTogJ3Nob3J0JywgZGF5OiAnMi1kaWdpdCcsIG1vbnRoOiAnc2hvcnQnLCBob3VyOiAnMi1kaWdpdCcsIG1pbnV0ZTogJzItZGlnaXQnIH0pOwogICAgY29uc3QgY2FyZCA9ICh4LCBpKSA9PiBgPGFydGljbGUgY2xhc3M9Im1rcC1jYXJkIGxhdGUtY2FyZCAke3gubGV2ZWx9IiBzdHlsZT0iLS1kOiR7TWF0aC5taW4oaSwgOCkgKiA1MH1tcyI+CiAgICAgIDxkaXYgY2xhc3M9ImxhdGUtaCI+PHNwYW4gY2xhc3M9ImxhdGUtZmxhZyI+JHt4LmxldmVsID09PSAnd2FybicgPyAn4pqg77iPIEFkdmVydGVuY2lhJyA6ICfij7AgQXRyYXNhZG8nfTwvc3Bhbj48c3BhbiBjbGFzcz0iY2hhdC1zaGlwICR7eC5zaGlwID09PSAnRmxleCcgPyAnZmxleCcgOiAnYWcnfSBsYXRlLW1rLSR7eC5ta30iPiR7eC5tayA9PT0gJ2ZhJyA/ICfwn5+iIEZhbGFiZWxsYScgOiB4Lm1rID09PSAncGEnID8gJ/CflLUgUGFyaXMnIDogeC5tayAhPT0gJ21sJyA/IChNS19JQ09OW3gubWtdIHx8ICfwn5OmJykgKyAnICcgKyBlc2MoTUtbeC5ta10gfHwgeC5taykgOiB4LnNoaXAgPT09ICdGbGV4JyA/ICfimqEgTWVyY2FkbyBMaWJyZSBGbGV4JyA6ICfwn5OmIE1lcmNhZG8gTGlicmUgJyArIGVzYyh4LnNoaXApfTwvc3Bhbj48YiBjbGFzcz0ibGF0ZS1raW5kIj4ke0xLW3gua2luZF0gfHwgJyd9PC9iPjwvZGl2PgogICAgICA8cCBjbGFzcz0ibGF0ZS13aHkiPiR7d2h5KHgpfTwvcD4KICAgICAgPHNtYWxsPlZlbnRhIDxiPiMke2VzYyh4Lm9yZGVyX251bWJlcil9PC9iPiR7eC5jdXN0b21lciA/ICcgwrcgJyArIGVzYyh4LmN1c3RvbWVyKSA6ICcnfSDCtyAke3guc2hpcCA9PT0gJ0ZsZXgnID8gJ0VudHJlZ2EnIDogJ0Rlc3BhY2hvJ306ICR7ZXNjKHgubWsgPT09ICdtbCcgPyBmRHVlKHguZGlzcGF0Y2hfYnkpIDogU3RyaW5nKHguZGlzcGF0Y2hfYnkpLnNsaWNlKDAsIDE2KS5yZXBsYWNlKCdUJywgJyAnKSl9JHt4LnByaW50ZWQgPyAnIMK3IGV0aXF1ZXRhIGltcHJlc2EnIDogJyDCtyA8Yj5ldGlxdWV0YSBzaW4gaW1wcmltaXI8L2I+J308L3NtYWxsPgogICAgICA8c21hbGw+8J+bje+4jyAke3gucHJvZHVjdHMubWFwKHAgPT4gYCR7ZXNjKHAudGl0bGUgfHwgJ1Byb2R1Y3RvJyl9JHtwLnF0eSA+IDEgPyBgIDxlbT7DlyR7cC5xdHl9PC9lbT5gIDogJyd9YCkuam9pbignIMK3ICcpfTwvc21hbGw+PC9hcnRpY2xlPmA7CiAgICBjb25zdCBsYXRlID0gZC5sYXRlIHx8IFtdOwogICAgaWYgKCFsYXRlLmxlbmd0aCkgbGlzdCA9ICc8ZGl2IGNsYXNzPSJta3AtZW1wdHkiPvCfjokgTm8gaGF5IHBlZGlkb3MgYXRyYXNhZG9zLjwvZGl2Pic7CiAgICBlbHNlIHsKICAgICAgY29uc3QgYnlTZWxsZXIgPSB7fTsgbGF0ZS5mb3JFYWNoKHggPT4gKGJ5U2VsbGVyW3guc2VsbGVyXSA9IGJ5U2VsbGVyW3guc2VsbGVyXSB8fCBbXSkucHVzaCh4KSk7CiAgICAgIGxldCBpID0gMDsKICAgICAgbGlzdCA9IE9iamVjdC5rZXlzKGJ5U2VsbGVyKS5zb3J0KCkubWFwKG4gPT4gYDxzZWN0aW9uIGNsYXNzPSJsYXRlLWdycCI+PGgzPiR7ZXNjKG4pfSA8c21hbGw+JHtieVNlbGxlcltuXS5maWx0ZXIoeCA9PiB4LmxldmVsID09PSAnbGF0ZScpLmxlbmd0aH0gYXRyYXNhZG9zIMK3ICR7YnlTZWxsZXJbbl0uZmlsdGVyKHggPT4geC5sZXZlbCA9PT0gJ3dhcm4nKS5sZW5ndGh9IGFkdmVydGVuY2lhczwvc21hbGw+PC9oMz4ke2J5U2VsbGVyW25dLm1hcCh4ID0+IGNhcmQoeCwgaSsrKSkuam9pbignJyl9PC9zZWN0aW9uPmApLmpvaW4oJycpOwogICAgfQogIH0KICBpZiAobWsudmlldyA9PT0gJ3JldHVybnMnKSB7CiAgICBjb25zdCBncnAgPSAoaywgYXJyLCBleHRyYSkgPT4gYDxzZWN0aW9uIGNsYXNzPSJta3AtcmV0IG1rcC1yZXQtJHtrfSI+PGgzPjxpPjwvaT4ke01LW2tdfSA8Yj4ke2Fyci5maWx0ZXIoeCA9PiB4LnRvZGF5KS5sZW5ndGh9PC9iPiA8c21hbGw+cGFyYSBob3k8L3NtYWxsPiR7YXJyLmxlbmd0aCA+IGFyci5maWx0ZXIoeCA9PiB4LnRvZGF5KS5sZW5ndGggPyBgPHNtYWxsPiDCtyAke2Fyci5sZW5ndGggLSBhcnIuZmlsdGVyKHggPT4geC50b2RheSkubGVuZ3RofSBlbiBjYW1pbm88L3NtYWxsPmAgOiAnJ308L2gzPgogICAgICAke2V4dHJhIHx8IChhcnIubGVuZ3RoID8gYXJyLnNvcnQoKGEsIGIpID0+IGIudG9kYXkgLSBhLnRvZGF5KS5tYXAoeCA9PiBgPGRpdiBjbGFzcz0ibWtwLXJyb3ciPjxkaXY+PGI+JHtlc2MoeC5idXllciB8fCAnQ29tcHJhZG9yJyl9PC9iPiR7eC50b2RheSA/ICc8c3BhbiBjbGFzcz0ibWtwLXRvZGF5Ij5MbGVnYSBob3k8L3NwYW4+JyA6ICcnfTxzbWFsbD4ke21lLnVzZXIucm9sZSA9PT0gJ2FkbWluJyA/IGVzYyh4LmFjYy5zZWxsZXIpICsgJyDCtyAnIDogJyd9VmVudGEgIyR7ZXNjKHgub3JkZXJfaWQpfSR7eC5zaGlwX3N0YXR1cyA/ICcgwrcgJyArIGVzYyh4LnNoaXBfc3RhdHVzKSA6ICcnfTwvc21hbGw+PHNtYWxsPiR7cHJvZExpbmUoeC5wcm9kdWN0cyl9PC9zbWFsbD48L2Rpdj48YiBjbGFzcz0ibWtwLXByaWNlIj4ke21vbmV5KHgudG90YWwgfHwgMCl9PC9iPjwvZGl2PmApLmpvaW4oJycpIDogJzxkaXYgY2xhc3M9Im1rcC1lbXB0eSBzbSI+U2luIGRldm9sdWNpb25lcy48L2Rpdj4nKX08L3NlY3Rpb24+YDsKICAgIGxpc3QgPSBgPGRpdiBjbGFzcz0ibWtwLXJldHMiPiR7Z3JwKCdtbCcsIEwuci5maWx0ZXIoeCA9PiB4Lm1rID09PSAnbWwnKSwgTC5lcnIucmV0dXJucyA/IFBFUk1fTVNHIDogJycpfSR7Z3JwKCdmYScsIEwuci5maWx0ZXIoeCA9PiB4Lm1rID09PSAnZmEnKSl9JHtncnAoJ3BhJywgW10sICc8ZGl2IGNsYXNzPSJta3AtZW1wdHkgc20iPlBhcmlzIG5vIGluZm9ybWEgZGV2b2x1Y2lvbmVzIHBvciBzdSBjb25leGnDs247IHJldsOtc2FsYXMgZW4gZWwgU2VsbGVyIENlbnRlciBkZSBQYXJpcy48L2Rpdj4nKX08L2Rpdj5gOwogIH0KICBpZiAobWsudmlldyA9PT0gJ3N0b2NrJykgbGlzdCA9ICc8ZGl2IGlkPSJzdG9ja0JveCIgY2xhc3M9InN0b2NrLWJveCI+PGRpdiBjbGFzcz0iZW1wdHkiPkNhcmdhbmRvIHN0b2Nr4oCmPC9kaXY+PC9kaXY+JzsKICBpZiAoIW1rLnZpZXcpIGxpc3QgPSAnPGRpdiBjbGFzcz0ibWtwLWVtcHR5IG1rcC1waWNrIj7wn5GGIFRvY2EgdW5hIHNlY2Npw7NuIGRlIGFycmliYSBwYXJhIHZlciBlbCBkZXRhbGxlLjwvZGl2Pic7CiAgYm94LmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJta3AtdGlsZXMgJHttay52aWV3ID8gJ3NlbCcgOiAnJ30iPiR7dGlsZXMubWFwKChbaywgbiwgdiwgc3ViLCBlXSkgPT4gYDxidXR0b24gY2xhc3M9Im1rcC10aWxlICR7bWsudmlldyA9PT0gayA/ICdvbicgOiAnJ30gJHt2ID4gMCAmJiAhZSA/ICdoYXMnIDogJyd9IiBkYXRhLW12PSIke2t9Ij48Yj4ke2UgPyAn4oCUJyA6IHZ9PC9iPjxzcGFuPiR7bn08L3NwYW4+PHNtYWxsPiR7ZSA/ICdmYWx0YSBwZXJtaXNvJyA6IHN1Yn08L3NtYWxsPiR7bWsudmlldyA9PT0gayA/ICc8ZW0gY2xhc3M9Im1rcC1oZXJlIj5Fc3TDoXMgYXF1w608L2VtPicgOiAnJ308L2J1dHRvbj5gKS5qb2luKCcnKX0KICAgICAgPGJ1dHRvbiBjbGFzcz0ibWtwLXRpbGUgbWtwLXRpbGUtbGF0ZSAke21rLnZpZXcgPT09ICdsYXRlJyA/ICdvbicgOiAnJ30gJHtsYXRlTiA/ICdob3QnIDogd2Fybk4gPyAnd2FybScgOiAnJ30iIGRhdGEtbXY9ImxhdGUiPjxiPiR7bGF0ZU4gKyB3YXJuTn08L2I+PHNwYW4+QXRyYXNhZG9zPC9zcGFuPjxzbWFsbD4ke2xhdGVOfSBhdHJhc2Fkb3MgwrcgJHt3YXJuTn0gYWR2ZXJ0Ljwvc21hbGw+JHttay52aWV3ID09PSAnbGF0ZScgPyAnPGVtIGNsYXNzPSJta3AtaGVyZSI+RXN0w6FzIGFxdcOtPC9lbT4nIDogJyd9PC9idXR0b24+CiAgICAgIDxidXR0b24gY2xhc3M9Im1rcC10aWxlIG1rcC10aWxlLXJldCAke21rLnZpZXcgPT09ICdyZXR1cm5zJyA/ICdvbicgOiAnJ30gJHtyVG9kYXkubGVuZ3RoID8gJ2hhcycgOiAnJ30iIGRhdGEtbXY9InJldHVybnMiPjxiPiR7clRvZGF5Lmxlbmd0aH08L2I+PHNwYW4+RGV2b2x1Y2lvbmVzIGhveTwvc3Bhbj48c21hbGwgY2xhc3M9Im1rcC1ta2RvdHMiPjxpIGNsYXNzPSJtbCI+PC9pPiR7ckJ5KCdtbCcpfSA8aSBjbGFzcz0iZmEiPjwvaT4ke3JCeSgnZmEnKX0gPGkgY2xhc3M9InBhIj48L2k+4oCUPC9zbWFsbD4ke21rLnZpZXcgPT09ICdyZXR1cm5zJyA/ICc8ZW0gY2xhc3M9Im1rcC1oZXJlIj5Fc3TDoXMgYXF1w608L2VtPicgOiAnJ308L2J1dHRvbj4ke00oJ3N0b2NrJykgPyBgPGJ1dHRvbiBjbGFzcz0ibWtwLXRpbGUgbWtwLXRpbGUtc3RvY2sgJHttay52aWV3ID09PSAnc3RvY2snID8gJ29uJyA6ICcnfSIgZGF0YS1tdj0ic3RvY2siPjxiPvCfk6Y8L2I+PHNwYW4+U3RvY2s8L3NwYW4+PHNtYWxsPnVuIHNvbG8gc3RvY2sgZW4gdG9kYXMgdHVzIGN1ZW50YXM8L3NtYWxsPiR7bWsudmlldyA9PT0gJ3N0b2NrJyA/ICc8ZW0gY2xhc3M9Im1rcC1oZXJlIj5Fc3TDoXMgYXF1w608L2VtPicgOiAnJ308L2J1dHRvbj5gIDogJyd9PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJta3AtYm9keSI+JHtsaXN0fTwvZGl2PgogICAgJHtMLmVyci5wYXJ0aWFsLmxlbmd0aCAmJiAhTC5lcnIucXVlc3Rpb25zID8gYDxwIGNsYXNzPSJta3AtcGVybSIgc3R5bGU9Im1hcmdpbi10b3A6MTBweCI+Tm8gc2UgcHVkbyBsZWVyOiA8Yj4ke2VzYyhMLmVyci5wYXJ0aWFsLmpvaW4oJywgJykpfTwvYj4uIEVzYSBjdWVudGEgZGViZSB2b2x2ZXIgYSBjb25lY3RhcnNlIGEgTWVyY2FkbyBMaWJyZSAoZW4gVmVuZGVkb3JlcyDihpIgVm9sdmVyIGEgYXV0b3JpemFyKS48L3A+YCA6ICcnfSR7bWsuZGF0YS5sb2FkaW5nID8gJzxwIGNsYXNzPSJta3AtcGVybSIgc3R5bGU9Im1hcmdpbi10b3A6MTBweCI+QWxndW5hcyBjdWVudGFzIHRvZGF2w61hIHNlIGVzdMOhbiBjYXJnYW5kbyBkZXNkZSBNZXJjYWRvIExpYnJlOyBhcGFyZWNlbiBzb2xhcyBlbiB1bm9zIHNlZ3VuZG9zLjwvcD4nIDogJyd9PHAgY2xhc3M9Im11dGVkIiBzdHlsZT0iZm9udC1zaXplOjEycHg7bWFyZ2luOjEwcHggMnB4Ij5BY3R1YWxpemFkbyAke2VzYyhuZXcgRGF0ZShtay5kYXRhLmF0KS50b0xvY2FsZVRpbWVTdHJpbmcoJ2VzLUNMJywgeyBob3VyOiAnMi1kaWdpdCcsIG1pbnV0ZTogJzItZGlnaXQnIH0pKX0gwrcgc2UgYWN0dWFsaXphIHNvbGEgY2FkYSAyIG1pbnV0b3MuPC9wPmA7CiAgaWYgKG1rLnZpZXcgPT09ICdzdG9jaycpIGRyYXdTdG9jaygpOwogIGNvbnN0IGxvYWRDdCA9IGVsID0+IHsgY29uc3QgaWQgPSBlbC5kYXRhc2V0LmN0bG9hZDsgaWYgKG1rLmN0W2lkXSAmJiBEYXRlLm5vdygpIC0gbWsuY3RbaWRdLmF0IDwgNjBlMyAmJiAhbWsuY3RbaWRdLmVycikgcmV0dXJuOyBhcGkoYC9hcGkvbWtwL2NsYWltLyR7ZWwuZGF0YXNldC5jb25ufS8ke2lkfS9tZXNzYWdlc2ApLnRoZW4ociA9PiB7IG1rLmN0W2lkXSA9IHsgYXQ6IERhdGUubm93KCksIGxpc3Q6IHIubWVzc2FnZXMgfHwgW10gfTsgfSkuY2F0Y2goZXJyID0+IHsgbWsuY3RbaWRdID0geyBhdDogRGF0ZS5ub3coKSwgbGlzdDogW10sIGVycjogZXJyLm1lc3NhZ2UgfTsgfSkudGhlbigoKSA9PiB7IGNvbnN0IGN1ciA9ICQoJyNjdC0nICsgaWQpOyBpZiAoIWN1cikgcmV0dXJuOyBjb25zdCB4ID0gTC5jLmZpbmQoYyA9PiBTdHJpbmcoYy5pZCkgPT09IFN0cmluZyhpZCkpOyBpZiAoeCkgeyBjdXIuaW5uZXJIVE1MID0gY2xhaW1CdWJzKHgpOyBjdXIuc2Nyb2xsVG9wID0gY3VyLnNjcm9sbEhlaWdodDsgfSB9KTsgfTsKICBib3gucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtY3Rsb2FkXScpLmZvckVhY2goZWwgPT4geyBlbC5zY3JvbGxUb3AgPSBlbC5zY3JvbGxIZWlnaHQ7IGxvYWRDdChlbCk7IH0pOwogIGJveC5vbmNsaWNrID0gYXN5bmMgZSA9PiB7CiAgICBjb25zdCBxZCA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLXFkZWxdJyk7CiAgICBpZiAocWQpIHsKICAgICAgLy8gZG9ibGUgdG9xdWUgcGFyYSBjb25maXJtYXIgKGV2aXRhIGJvcnJhciBwb3IgZXJyb3IpCiAgICAgIGlmICghcWQuY2xhc3NMaXN0LmNvbnRhaW5zKCdhcm1lZCcpKSB7IHFkLmNsYXNzTGlzdC5hZGQoJ2FybWVkJyk7IHFkLnRleHRDb250ZW50ID0gJ8K/U2VndXJvPyBUb2NhIGRlIG51ZXZvIHBhcmEgZWxpbWluYXInOyBjbGVhclRpbWVvdXQocWQuX3QpOyBxZC5fdCA9IHNldFRpbWVvdXQoKCkgPT4geyBxZC5jbGFzc0xpc3QucmVtb3ZlKCdhcm1lZCcpOyBxZC50ZXh0Q29udGVudCA9ICfwn5eRIEVsaW1pbmFyIHByZWd1bnRhJzsgfSwgNDAwMCk7IHJldHVybjsgfQogICAgICBjbGVhclRpbWVvdXQocWQuX3QpOyBxZC5kaXNhYmxlZCA9IHRydWU7IHFkLnRleHRDb250ZW50ID0gJ0VsaW1pbmFuZG/igKYnOwogICAgICB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvbWtwL3F1ZXN0aW9uLWRlbGV0ZScsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgY29ubl9pZDogcWQuZGF0YXNldC5jb25uLCBxdWVzdGlvbl9pZDogcWQuZGF0YXNldC5xZGVsIH0gfSk7IG1rLmhpZGRlbi5hZGQoJ3EnICsgcWQuZGF0YXNldC5xZGVsKTsgdG9hc3QoJ1ByZWd1bnRhIGVsaW1pbmFkYSDinJMgKHRhbWJpw6luIGVuIE1lcmNhZG8gTGlicmUpJyk7IGNvbnN0IGNhcmQgPSBxZC5jbG9zZXN0KCcubWtwLWNhcmQnKTsgY2FyZC5jbGFzc0xpc3QuYWRkKCdta3AtZ29uZScpOyBzZXRUaW1lb3V0KGRyYXdNa3AsIDM1MCk7IH0KICAgICAgY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSwgNTAwMCk7IHFkLmRpc2FibGVkID0gZmFsc2U7IHFkLmNsYXNzTGlzdC5yZW1vdmUoJ2FybWVkJyk7IHFkLnRleHRDb250ZW50ID0gJ/Cfl5EgRWxpbWluYXIgcHJlZ3VudGEnOyB9CiAgICAgIHJldHVybjsKICAgIH0KICAgIGNvbnN0IG1yID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtbWFya3JlYWRdJyk7CiAgICBpZiAobXIpIHsKICAgICAgbXIuZGlzYWJsZWQgPSB0cnVlOyBtci50ZXh0Q29udGVudCA9ICdNYXJjYW5kb+KApic7CiAgICAgIHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9ta3AvcmVhZCcsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgY29ubl9pZDogbXIuZGF0YXNldC5jb25uLCBwYWNrX2lkOiBtci5kYXRhc2V0Lm1hcmtyZWFkIH0gfSk7IG1rLmhpZGRlbi5hZGQoJ20nICsgbXIuZGF0YXNldC5tYXJrcmVhZCk7IHRvYXN0KCdNZW5zYWplIG1hcmNhZG8gY29tbyBsZcOtZG8g4pyTJyk7IGRyYXdNa3AoKTsgfQogICAgICBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlLCA1MDAwKTsgbXIuZGlzYWJsZWQgPSBmYWxzZTsgbXIudGV4dENvbnRlbnQgPSAn4pyT4pyTIE1hcmNhciBjb21vIGxlw61kbyc7IH0KICAgICAgcmV0dXJuOwogICAgfQogICAgY29uc3QgdCA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLW12XScpOyBpZiAodCkgeyBtay52aWV3ID0gdC5kYXRhc2V0Lm12OyBkcmF3TWtwKCk7IHJldHVybjsgfQogICAgY29uc3QgY3QgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1jbGFpbXRocmVhZF0nKTsKICAgIGlmIChjdCkgewogICAgICBjb25zdCBlbCA9ICQoJyNjdC0nICsgY3QuZGF0YXNldC5jbGFpbXRocmVhZCk7IGVsLmhpZGRlbiA9ICFlbC5oaWRkZW47IGlmIChlbC5oaWRkZW4pIHJldHVybjsKICAgICAgZWwuaW5uZXJIVE1MID0gJzxzbWFsbCBjbGFzcz0ibXV0ZWQiPkNhcmdhbmRv4oCmPC9zbWFsbD4nOwogICAgICB0cnkgeyBjb25zdCByID0gYXdhaXQgYXBpKGAvYXBpL21rcC9jbGFpbS8ke2N0LmRhdGFzZXQuY29ubn0vJHtjdC5kYXRhc2V0LmNsYWltdGhyZWFkfS9tZXNzYWdlc2ApOyBlbC5pbm5lckhUTUwgPSByLm1lc3NhZ2VzLmxlbmd0aCA/IHIubWVzc2FnZXMubWFwKHQgPT4gYDxkaXYgY2xhc3M9Im1rcC1idWIgJHt0LmZyb219Ij48c3Bhbj4ke2VzYyh0LnRleHQgfHwgJycpfTwvc3Bhbj48c21hbGw+JHt0LmZyb20gPT09ICdtZWRpYXRvcicgPyAnTWVyY2FkbyBMaWJyZSDCtyAnIDogJyd9JHthZ29TKHQuZGF0ZSl9PC9zbWFsbD48L2Rpdj5gKS5qb2luKCcnKSA6ICc8c21hbGwgY2xhc3M9Im11dGVkIj5TaW4gbWVuc2FqZXMgdG9kYXbDrWEuPC9zbWFsbD4nOyB9CiAgICAgIGNhdGNoIChlcnIpIHsgZWwuaW5uZXJIVE1MID0gYDxzbWFsbCBjbGFzcz0ibXV0ZWQiPiR7ZXNjKGVyci5tZXNzYWdlKX08L3NtYWxsPmA7IH0KICAgIH0KICB9OwogIGJveC5vbmlucHV0ID0gZSA9PiB7IGNvbnN0IGYgPSBlLnRhcmdldC5jbG9zZXN0KCcubWtwLXJlcGx5Jyk7IGlmICghZikgcmV0dXJuOyBmLnF1ZXJ5U2VsZWN0b3IoJy5ta3AtY250JykudGV4dENvbnRlbnQgPSBlLnRhcmdldC52YWx1ZS5sZW5ndGg7IGlmIChmLmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1jb21wb3NlJykpIHsgY29uc3QgdCA9IGUudGFyZ2V0OyB0LnN0eWxlLmhlaWdodCA9ICdhdXRvJzsgdC5zdHlsZS5oZWlnaHQgPSBNYXRoLm1pbih0LnNjcm9sbEhlaWdodCwgMTYwKSArICdweCc7IGYuY2xhc3NMaXN0LnRvZ2dsZSgndHlwaW5nJywgISF0LnZhbHVlLnRyaW0oKSk7IH0gfTsKICBib3gub25rZXlkb3duID0gZSA9PiB7IGNvbnN0IGYgPSBlLnRhcmdldC5jbG9zZXN0KCcuY2hhdC1jb21wb3NlJyk7IGlmIChmICYmIGUua2V5ID09PSAnRW50ZXInICYmICFlLnNoaWZ0S2V5ICYmICFlLmlzQ29tcG9zaW5nKSB7IGUucHJldmVudERlZmF1bHQoKTsgZi5yZXF1ZXN0U3VibWl0KCk7IH0gfTsKICBib3gub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgIGUucHJldmVudERlZmF1bHQoKTsKICAgIGNvbnN0IGYgPSBlLnRhcmdldC5jbG9zZXN0KCcubWtwLXJlcGx5Jyk7IGlmICghZikgcmV0dXJuOwogICAgY29uc3QgdGV4dCA9IGYucXVlcnlTZWxlY3RvcigndGV4dGFyZWEnKS52YWx1ZS50cmltKCk7IGlmICghdGV4dCkgcmV0dXJuIHRvYXN0KCdFc2NyaWJlIHVuYSByZXNwdWVzdGEnKTsKICAgIGNvbnN0IGIgPSBmLnF1ZXJ5U2VsZWN0b3IoJ2J1dHRvbi5ta3Atc2VuZCwgYnV0dG9uOm5vdChbdHlwZT1idXR0b25dKScpOyBjb25zdCBiSHRtbCA9IGIuaW5uZXJIVE1MOyBiLmRpc2FibGVkID0gdHJ1ZTsgYi50ZXh0Q29udGVudCA9ICdFbnZpYW5kb+KApic7CiAgICBjb25zdCBrID0gZi5kYXRhc2V0LmtpbmQ7CiAgICBjb25zdCBib2R5ID0gayA9PT0gJ2Fuc3dlcicgPyB7IGNvbm5faWQ6IGYuZGF0YXNldC5jb25uLCBxdWVzdGlvbl9pZDogZi5kYXRhc2V0LmlkLCB0ZXh0IH0gOiBrID09PSAnbWVzc2FnZScgPyB7IGNvbm5faWQ6IGYuZGF0YXNldC5jb25uLCBwYWNrX2lkOiBmLmRhdGFzZXQucGFjaywgYnV5ZXJfaWQ6IGYuZGF0YXNldC5idXllciwgdGV4dCB9IDogeyBjb25uX2lkOiBmLmRhdGFzZXQuY29ubiwgY2xhaW1faWQ6IGYuZGF0YXNldC5pZCwgdG9fbWVkaWF0b3I6IGYuZGF0YXNldC5tZWQgPT09ICcxJywgdGV4dCB9OwogICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL21rcC8nICsgKGsgPT09ICdhbnN3ZXInID8gJ2Fuc3dlcicgOiBrID09PSAnbWVzc2FnZScgPyAnbWVzc2FnZScgOiAnY2xhaW0tcmVwbHknKSwgeyBtZXRob2Q6ICdQT1NUJywgYm9keSB9KTsgdG9hc3QoJ1Jlc3B1ZXN0YSBlbnZpYWRhIOKckycpOyBpZiAoayA9PT0gJ2Fuc3dlcicpIG1rLmhpZGRlbi5hZGQoJ3EnICsgZi5kYXRhc2V0LmlkKTsgaWYgKGsgPT09ICdtZXNzYWdlJykgbWsuaGlkZGVuLmFkZCgnbScgKyBmLmRhdGFzZXQucGFjayk7IGlmIChrID09PSAnY2xhaW0nKSB7IGNvbnN0IHRoID0gJCgnI2N0LScgKyBmLmRhdGFzZXQuaWQpOyBpZiAobWsuY3RbZi5kYXRhc2V0LmlkXSkgbWsuY3RbZi5kYXRhc2V0LmlkXS5saXN0LnB1c2goeyBmcm9tOiAnc2VsbGVyJywgdGV4dCwgZGF0ZTogbmV3IERhdGUoKS50b0lTT1N0cmluZygpIH0pOyBpZiAodGgpIHsgdGguaW5zZXJ0QWRqYWNlbnRIVE1MKCdiZWZvcmVlbmQnLCBgPGRpdiBjbGFzcz0ibWtwLWJ1YiBzZWxsZXIiPjxzcGFuPiR7ZXNjKHRleHQpfTwvc3Bhbj48c21hbGw+YWhvcmEg4pyT4pyTPC9zbWFsbD48L2Rpdj5gKTsgdGguc2Nyb2xsVG9wID0gdGguc2Nyb2xsSGVpZ2h0OyB9IGNvbnN0IHRhID0gZi5xdWVyeVNlbGVjdG9yKCd0ZXh0YXJlYScpOyB0YS52YWx1ZSA9ICcnOyB0YS5zdHlsZS5oZWlnaHQgPSAnJzsgZi5jbGFzc0xpc3QucmVtb3ZlKCd0eXBpbmcnKTsgZi5xdWVyeVNlbGVjdG9yKCcubWtwLWNudCcpLnRleHRDb250ZW50ID0gMDsgYi5kaXNhYmxlZCA9IGZhbHNlOyBiLmlubmVySFRNTCA9IGJIdG1sOyByZXR1cm47IH0KICAgICAgY29uc3QgY2FyZCA9IGYuY2xvc2VzdCgnLm1rcC1jYXJkJyk7IGNhcmQuY2xhc3NMaXN0LmFkZCgnbWtwLWRvbmUnKTsgZi5vdXRlckhUTUwgPSAnPGRpdiBjbGFzcz0ibWtwLXNlbnQiPuKckyBSZXNwdWVzdGEgZW52aWFkYTwvZGl2Pic7IHNldFRpbWVvdXQoKCkgPT4geyBpZiAoayAhPT0gJ2NsYWltJykgZHJhd01rcCgpOyB9LCAxNTAwKTsgfQogICAgY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSwgNTAwMCk7IGIuZGlzYWJsZWQgPSBmYWxzZTsgYi5pbm5lckhUTUwgPSBiSHRtbDsgfQogIH07Cn0KCi8vIC0tLS0tLS0tLS0gQkFOREVKQSAoZnVsZmlsbG1lbnQpIC0tLS0tLS0tLS0KY29uc3QgVEFCUyA9IFsKICBbJ3RvZGF5JywgJ1BhcmEgaW1wcmltaXIgaG95JywgJ1NhbGVuIGhveSAoaW5jbHV5ZSBGbGV4KScsIEkucHJpbnRdLAogIFsndXBjb21pbmcnLCAnUHLDs3hpbW9zIGTDrWFzJywgJ1NlIGRlc3BhY2hhbiBtw6FzIGFkZWxhbnRlJywgSS5ib3hdLAogIFsndW5ibG9ja2VkJywgJ0Rlc2Jsb3F1ZWFkYXMnLCAnUGVkaWRvcyBpbmNvbXBsZXRvcyBwb3IgaW1wcmltaXInLCBJLnByaW50XSwKICBbJ3dhaXRpbmcnLCAnRXNwZXJhbmRvIGV0aXF1ZXRhJywgJ0VsIG1hcmtldHBsYWNlIGHDum4gbm8gbGEgbGliZXJhJywgSS5jbG9ja10sCiAgWydwcmludGVkJywgJ0V0aXF1ZXRhcyBpbXByZXNhcycsICdEZWwgZGVzcGFjaG8gZW4gY3Vyc28gKGNhbWJpYSBhIGxhcyAxNTowMCknLCBJLmNoZWNrXSwKICBbJ3RyYW5zaXQnLCAnRW4gY2FtaW5vJywgJ0ltcHJlc2FzIHF1ZSBhw7puIG5vIGxsZWdhbiBhIGRlc3Rpbm8nLCBJLmJveF0sCiAgWydibG9ja2VkJywgJ0Jsb3F1ZWFkYXMnLCAnTnVtZXJhZGFzOiBOwrAgMSwgMiwgM+KApicsIEkubG9ja10sCiAgWydibG9ja2VkUHJpbnRlZCcsICdCbG9xdWVhZGFzIGltcHJlc2FzJywgJ0RlbCBkZXNwYWNobyBlbiBjdXJzbywgcG9yIHJlbGxlbmFyJywgSS5ib3hdLAogIFsnd2FybicsICdBZHZlcnRlbmNpYScsICdRdWVkYW4gMzAgbWluIG8gbWVub3MgcGFyYSBzdSBwbGF6bycsIEkuY2xvY2tdLAogIFsnbGF0ZScsICdBdHJhc2FkYXMnLCAnTm8gc2FsaWVyb24gZGVudHJvIGRlbCBwbGF6bycsIEkud2Fybl0sCiAgWydwcmludGVkNycsICdJbXByZXNhcyA3IGTDrWFzJywgJ1RvZG8gbG8gaW1wcmVzbywgaW5jbHVzbyBsbyB5YSBlbnZpYWRvJywgSS5jaGVja10sCl07CmNvbnN0IGVuZE9mVG9kYXkgPSAoKSA9PiB7IGNvbnN0IGQgPSBuZXcgRGF0ZSgpOyBkLnNldEhvdXJzKDIzLCA1OSwgNTksIDk5OSk7IHJldHVybiBkOyB9OwpmdW5jdGlvbiBkaXNwYXRjaERhdGUobykgeyBjb25zdCBzID0gby5kaXNwYXRjaF9ieTsgaWYgKCFzKSByZXR1cm4gbnVsbDsgY29uc3QgZCA9IG5ldyBEYXRlKHMuaW5jbHVkZXMoJ1QnKSA/IHMgOiBzLnJlcGxhY2UoJyAnLCAnVCcpKTsgcmV0dXJuIGlzTmFOKGQpID8gbnVsbCA6IGQ7IH0KY29uc3QgaXNGb3JUb2RheSA9IG8gPT4geyBjb25zdCBkID0gZGlzcGF0Y2hEYXRlKG8pOyByZXR1cm4gIWQgfHwgZCA8PSBlbmRPZlRvZGF5KCk7IH07Ci8vIGxhcyBkZXNibG9xdWVhZGFzIHF1ZWRhbiBlbiBzdSBwcm9waWEgc2VjY2nDs24gaGFzdGEgcXVlIHNlIGltcHJpbWVuCmNvbnN0IGlzVW5ibG9ja2VkID0gbyA9PiBCb29sZWFuKG8udW5ibG9ja2VkX2J5ICYmIG8uYmxvY2tfbm8pICYmIFsncmVhZHknLCAnd2FpdGluZycsICdlcnJvciddLmluY2x1ZGVzKG8uc3RhdGUpOwovLyBpbXByZXNhcyBkZSBwZWRpZG9zIHF1ZSB0ZW7DrWFuIHByb2R1Y3RvcyBibG9xdWVhZG9zOiBlbCB2ZW5kZWRvciBkZWJlIGxsZXZhciBsbyBxdWUgZmFsdGEKLy8gY3VhbHF1aWVyIGV0aXF1ZXRhIGltcHJlc2EgY29uIHByb2R1Y3RvcyBibG9xdWVhZG9zIHZhIFNPTE8gYSAiQmxvcXVlYWRhcyBpbXByZXNhcyIgKGF1bnF1ZSBsYSBoYXlhbiBpbXByZXNvIGZ1ZXJhIGRlIGxhIGFwcCkKLy8gc29sbyBzaSBIT1kgdGllbmUgYWxnw7puIHByb2R1Y3RvIGJsb3F1ZWFkbyAoc2kgZWwgdmVuZGVkb3IgbG8gc2Fjw7MgZGUgc3UgbGlzdGEsIHZ1ZWx2ZSBhICJFdGlxdWV0YXMgaW1wcmVzYXMiKQpjb25zdCBpc0Jsb2NrZWRQcmludGVkID0gbyA9PiAoby5taXNzaW5nX2lkeCB8fCBbXSkubGVuZ3RoID4gMCAmJiBvLnN0YXRlID09PSAncHJpbnRlZCc7CmNvbnN0IHdlZWtTdGFydCA9ICgpID0+IHsgY29uc3QgZCA9IG5ldyBEYXRlKCk7IGQuc2V0SG91cnMoMCwgMCwgMCwgMCk7IGQuc2V0RGF0ZShkLmdldERhdGUoKSAtICgoZC5nZXREYXkoKSArIDYpICUgNykpOyByZXR1cm4gZDsgfTsKY29uc3QgcHJpbnRlZEF0ID0gbyA9PiBvLnByaW50ZWRfYXQgPyBuZXcgRGF0ZShvLnByaW50ZWRfYXQucmVwbGFjZSgnICcsICdUJykgKyAnWicpIDogbnVsbDsKY29uc3QgaXNQcmludGVkNyA9IG8gPT4gWydwcmludGVkJywgJ3NoaXBwZWQnXS5pbmNsdWRlcyhvLnN0YXRlKSAmJiBwcmludGVkQXQobykgPj0gbmV3IERhdGUoRGF0ZS5ub3coKSAtIDcgKiA4NjRlNSk7CmNvbnN0IGlzUHJpbnRlZFRoaXNXZWVrID0gbyA9PiBbJ3ByaW50ZWQnLCAnc2hpcHBlZCddLmluY2x1ZGVzKG8uc3RhdGUpICYmIHByaW50ZWRBdChvKSA+PSB3ZWVrU3RhcnQoKTsKLy8gbGFzIGJsb3F1ZWFkYXMgaW1wcmVzYXMgcXVlIGVsIGZ1bGZpbGxtZW50IHNlcGFyw7MgZW4gcGFydGUgKHRlbsOtYSBhbGfDum4gcHJvZHVjdG8pIHRhbWJpw6luIGN1ZW50YW4gZW4gIkV0aXF1ZXRhcyBpbXByZXNhcyIKLy8gdW5hIGV0aXF1ZXRhIHB1ZWRlIGVzdGFyIGVuIG3DoXMgZGUgdW5hIHNlY2Npw7NuIChwLiBlai4gIkltcHJlc2FzIGRlIGxhIHNlbWFuYSIgeSAiQmxvcXVlYWRhcyBpbXByZXNhcyIpCi8vICJFdGlxdWV0YXMgaW1wcmVzYXMiIHkgIkJsb3F1ZWFkYXMgaW1wcmVzYXMiIG11ZXN0cmFuIGxhcyBpbXByZXNhcyBkZWwgZGVzcGFjaG8gZW4gY3Vyc286IHRvZGFzIGxhcyBxdWUgc2UKLy8gZGVzcGFjaGFuIGVzZSBkw61hIChhdW5xdWUgc2UgaGF5YW4gaW1wcmVzbyBkw61hcyBhbnRlcykuIEEgbGFzIDE1OjAwIGRlbCBkw61hIGRlIGRlc3BhY2hvIHNhbGVuIGRlIGFow60gKHF1ZWRhbiBlbgovLyAiSW1wcmVzYXMgNyBkw61hcyIpIHkgZW1waWV6YW4gYSBqdW50YXJzZSBsYXMgZGVsIHNpZ3VpZW50ZSBkw61hIGRlIGRlc3BhY2hvLgpjb25zdCBkaXNwRGF5ID0gbyA9PiB7IGNvbnN0IGQgPSBkaXNwYXRjaERhdGUobyk7IHJldHVybiBkID8gaXNvKGQpIDogbnVsbDsgfTsKbGV0IF9jeWMgPSB7IGtleTogJycsIGRheTogJycgfTsKZnVuY3Rpb24gcHJpbnRDeWNsZURheSgpIHsKICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLCBrZXkgPSBvcmRlcnMubGVuZ3RoICsgJzonICsgbm93LmdldEhvdXJzKCkgKyAnOicgKyBub3cuZ2V0RGF0ZSgpOwogIGlmIChfY3ljLmtleSA9PT0ga2V5ICYmIF9jeWMuc3JjID09PSBvcmRlcnMpIHJldHVybiBfY3ljLmRheTsKICBjb25zdCBiYXNlID0gbmV3IERhdGUobm93KTsgaWYgKG5vdy5nZXRIb3VycygpID49IDE1KSBiYXNlLnNldERhdGUoYmFzZS5nZXREYXRlKCkgKyAxKTsKICBjb25zdCBiID0gaXNvKGJhc2UpOwogIGNvbnN0IGRheSA9IG9yZGVycy5maWx0ZXIobyA9PiBbJ3ByaW50ZWQnLCAnc2hpcHBlZCddLmluY2x1ZGVzKG8uc3RhdGUpKS5tYXAoZGlzcERheSkuZmlsdGVyKGQgPT4gZCAmJiBkID49IGIpLnNvcnQoKVswXSB8fCBiOwogIF9jeWMgPSB7IGtleSwgZGF5LCBzcmM6IG9yZGVycyB9OwogIHJldHVybiBkYXk7Cn0KY29uc3QgaW5QcmludEN5Y2xlID0gbyA9PiBbJ3ByaW50ZWQnLCAnc2hpcHBlZCddLmluY2x1ZGVzKG8uc3RhdGUpICYmIGRpc3BEYXkobykgPT09IHByaW50Q3ljbGVEYXkoKTsKY29uc3QgaGFzTWlzc2luZyA9IG8gPT4gKG8ubWlzc2luZ19pZHggfHwgW10pLmxlbmd0aCA+IDA7Ci8vIEF0cmFzYWRhOiBsbyBtYXJjYSBlbCBzZXJ2aWRvciBvIHlhIHBhc8OzIHN1IHBsYXpvIGzDrW1pdGUgKHNlIHJldmlzYSBjYWRhIG1pbnV0byBjb24gbGEgaG9yYSBhY3R1YWwpCmNvbnN0IGxhdGVOb3cgPSBvID0+IEJvb2xlYW4oby5sYXRlKSB8fCBCb29sZWFuKG8uZGwgJiYgbmV3IERhdGUoby5kbCkgPCBuZXcgRGF0ZSgpKTsKLy8gQWR2ZXJ0ZW5jaWE6IGN1YWxxdWllciBwYXF1ZXRlIGFsIHF1ZSBsZSBxdWVkYW4gMzAgbWludXRvcyBvIG1lbm9zIHBhcmEgc3UgcGxhem8gbMOtbWl0ZQpjb25zdCBtaW5zTGVmdCA9IG8gPT4gby5kbCA/IE1hdGguY2VpbCgobmV3IERhdGUoby5kbCkgLSBEYXRlLm5vdygpKSAvIDYwZTMpIDogbnVsbDsKY29uc3QgaXNXYXJuID0gbyA9PiAhbGF0ZU5vdyhvKSAmJiBvLmRsICE9IG51bGwgJiYgbWluc0xlZnQobykgPD0gMzA7CmNvbnN0IGluVGFiRm4gPSAobywgdCkgPT4gdCA9PT0gJ3RyYW5zaXQnID8gby5zdGF0ZSA9PT0gJ3ByaW50ZWQnIDogdCA9PT0gJ3ByaW50ZWQ3JyA/IGlzUHJpbnRlZDcobykgOiB0ID09PSAnbGF0ZScgPyBsYXRlTm93KG8pIDogdCA9PT0gJ3dhcm4nID8gaXNXYXJuKG8pIDogdCA9PT0gJ3dlZWsnID8gaXNQcmludGVkVGhpc1dlZWsobykgOiB0ID09PSAnYmxvY2tlZFByaW50ZWQnID8gKGluUHJpbnRDeWNsZShvKSAmJiBoYXNNaXNzaW5nKG8pKSA6IHQgPT09ICdwcmludGVkJyA/IChpblByaW50Q3ljbGUobykgJiYgKCFoYXNNaXNzaW5nKG8pIHx8IGJwS2luZChvKSA9PT0gJ2ZpbGwnKSkgOiB0YWJPZihvKSA9PT0gdDsKY29uc3QgdGFiT2YgPSBvID0+IGlzVW5ibG9ja2VkKG8pID8gJ3VuYmxvY2tlZCcgOiAoby5zdGF0ZSA9PT0gJ3JlYWR5JyA/IChpc0ZvclRvZGF5KG8pID8gJ3RvZGF5JyA6ICd1cGNvbWluZycpIDogby5zdGF0ZSA9PT0gJ2Vycm9yJyA/ICd3YWl0aW5nJyA6IG8uc3RhdGUgPT09ICdzaGlwcGVkJyA/IG51bGwgOiBvLnN0YXRlID09PSAnY2FuY2VsbGVkJyA/IG51bGwgOiBvLnN0YXRlKTsKLy8gcGFyYSBldGlxdWV0YXMgeWEgaW1wcmVzYXMgbyBlbnZpYWRhczogc2UgbWFudGllbmUgY3XDoW5kbyBoYWLDrWEgcXVlIGRlc3BhY2hhcmxhcyAoc2luICJhdHJhc2FkYSIpCmZ1bmN0aW9uIGRpc3BhdGNoUGxhaW4obykgewogIGNvbnN0IGQgPSBkaXNwYXRjaERhdGUobyk7IGlmICghZCkgcmV0dXJuICcnOwogIGNvbnN0IGggPSBoaG1tKGQpLCBob3JhID0gaCA9PT0gJzIzOjU5JyB8fCBoID09PSAnMDA6MDAnID8gJycgOiAnIGFudGVzIGRlIGxhcyAnICsgYW1wbShkKTsKICBjb25zdCB0ID0gbmV3IERhdGUoKTsgdC5zZXRIb3VycygwLCAwLCAwLCAwKTsgY29uc3QgeCA9IG5ldyBEYXRlKGQpOyB4LnNldEhvdXJzKDAsIDAsIDAsIDApOwogIGNvbnN0IGRpZmYgPSBNYXRoLnJvdW5kKCh4IC0gdCkgLyA4NjRlNSk7CiAgY29uc3QgZGlhID0gZGlmZiA9PT0gMCA/ICdob3knIDogZGlmZiA9PT0gLTEgPyAnYXllcicgOiBkaWZmID09PSAxID8gJ21hw7FhbmEnIDogJ2VsICcgKyBkLnRvTG9jYWxlRGF0ZVN0cmluZygnZXMtQ0wnLCB7IHdlZWtkYXk6ICdsb25nJywgZGF5OiAnbnVtZXJpYycsIG1vbnRoOiAnc2hvcnQnIH0pOwogIHJldHVybiBgRGVzcGFjaG86ICR7ZGlhfSR7aG9yYX0ke21rRGVhZGxpbmUobyl9YDsKfQovLyBGYWxhYmVsbGE6IHNlIG11ZXN0cmEgZWwgcGxhem8gcmVhbCBkZWwgbWFya2V0cGxhY2UgKGxhIGFwcCBsbyBhZGVsYW50YSB1biBkw61hKQpmdW5jdGlvbiBta0RlYWRsaW5lKG8pIHsKICBpZiAoIW8uZGlzcGF0Y2hfbWspIHJldHVybiAnJzsKICBjb25zdCBkID0gbmV3IERhdGUoby5kaXNwYXRjaF9tay5pbmNsdWRlcygnVCcpID8gby5kaXNwYXRjaF9tayA6IG8uZGlzcGF0Y2hfbWsucmVwbGFjZSgnICcsICdUJykpOyBpZiAoaXNOYU4oZCkpIHJldHVybiAnJzsKICByZXR1cm4gYCDCtyBwbGF6byBGYWxhYmVsbGEgJHtkLnRvTG9jYWxlRGF0ZVN0cmluZygnZXMtQ0wnLCB7IHdlZWtkYXk6ICdzaG9ydCcsIGRheTogJ251bWVyaWMnIH0pLnJlcGxhY2UoJy4nLCAnJyl9YDsKfQpmdW5jdGlvbiBkaXNwYXRjaFRleHQobykgeyBjb25zdCB0ID0gZGlzcGF0Y2hUZXh0MChvKTsgcmV0dXJuIHQgPyB0ICsgbWtEZWFkbGluZShvKSA6IHQ7IH0KZnVuY3Rpb24gZGlzcGF0Y2hUZXh0MChvKSB7CiAgY29uc3QgZCA9IGRpc3BhdGNoRGF0ZShvKTsgaWYgKCFkKSByZXR1cm4gJyc7CiAgY29uc3QgdG9kYXkgPSBuZXcgRGF0ZSgpOyB0b2RheS5zZXRIb3VycygwLCAwLCAwLCAwKTsKICBjb25zdCBkYXkgPSBuZXcgRGF0ZShkKTsgZGF5LnNldEhvdXJzKDAsIDAsIDAsIDApOwogIGNvbnN0IGRpZmYgPSBNYXRoLnJvdW5kKChkYXkgLSB0b2RheSkgLyA4NjRlNSk7CiAgY29uc3QgaCA9IGhobW0oZCk7CiAgaWYgKGRpZmYgPCAwKSByZXR1cm4gYEF0cmFzYWRhIMK3IGRlYsOtYSBzYWxpciBlbCAke2QudG9Mb2NhbGVEYXRlU3RyaW5nKCdlcy1DTCcsIHsgZGF5OiAnbnVtZXJpYycsIG1vbnRoOiAnc2hvcnQnIH0pfWA7CiAgaWYgKGRpZmYgPT09IDApIHJldHVybiBoID09PSAnMjM6NTknIHx8IGggPT09ICcwMDowMCcgPyAnRGVzcGFjaGFyIGhveScgOiAoZCA8IG5ldyBEYXRlKCkgPyBgRGVzcGFjaGFyIGhveSDCtyBjb3J0ZSAke2FtcG0oZCl9YCA6IGBEZXNwYWNoYXIgaG95IGFudGVzIGRlIGxhcyAke2FtcG0oZCl9YCk7CiAgaWYgKGRpZmYgPT09IDEpIHJldHVybiBgRGVzcGFjaGFyIG1hw7FhbmEke2ggPT09ICcyMzo1OScgfHwgaCA9PT0gJzAwOjAwJyA/ICcnIDogJyBhbnRlcyBkZSBsYXMgJyArIGFtcG0oZCl9YDsKICByZXR1cm4gYERlc3BhY2hhciBlbCAke2QudG9Mb2NhbGVEYXRlU3RyaW5nKCdlcy1DTCcsIHsgd2Vla2RheTogJ2xvbmcnLCBkYXk6ICdudW1lcmljJywgbW9udGg6ICdzaG9ydCcgfSl9YDsKfQpmdW5jdGlvbiB0cyhvKSB7CiAgY29uc3QgcyA9IG8uc29sZF9hdCB8fCAnJzsKICBpZiAocykgeyBjb25zdCBkID0gbmV3IERhdGUocy5pbmNsdWRlcygnVCcpID8gcyA6IHMucmVwbGFjZSgnICcsICdUJykpOyBpZiAoIWlzTmFOKGQpKSByZXR1cm4gZDsgfQogIHJldHVybiBuZXcgRGF0ZSgoby5jcmVhdGVkX2F0IHx8ICcnKS5yZXBsYWNlKCcgJywgJ1QnKSArICdaJyk7Cn0KZnVuY3Rpb24gZGF5TGFiZWwoZCkgewogIGNvbnN0IHRvZGF5ID0gbmV3IERhdGUoKTsgdG9kYXkuc2V0SG91cnMoMCwgMCwgMCwgMCk7CiAgY29uc3QgeCA9IG5ldyBEYXRlKGQpOyB4LnNldEhvdXJzKDAsIDAsIDAsIDApOwogIGNvbnN0IGRpZmYgPSBNYXRoLnJvdW5kKCh0b2RheSAtIHgpIC8gODY0ZTUpOwogIGNvbnN0IGYgPSBkLnRvTG9jYWxlRGF0ZVN0cmluZygnZXMtQ0wnLCB7IHdlZWtkYXk6ICdsb25nJywgZGF5OiAnbnVtZXJpYycsIG1vbnRoOiAnbG9uZycgfSk7CiAgcmV0dXJuIGRpZmYgPT09IDAgPyBgSG95IMK3ICR7Zn1gIDogZGlmZiA9PT0gMSA/IGBBeWVyIMK3ICR7Zn1gIDogZi5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGYuc2xpY2UoMSk7Cn0KY29uc3QgaGhtbSA9IGQgPT4gZC50b0xvY2FsZVRpbWVTdHJpbmcoJ2VzLUNMJywgeyBob3VyOiAnMi1kaWdpdCcsIG1pbnV0ZTogJzItZGlnaXQnLCBob3VyQ3ljbGU6ICdoMjMnIH0pOwpjb25zdCBhbXBtID0gZCA9PiB7IGNvbnN0IGggPSBkLmdldEhvdXJzKCksIG0gPSBTdHJpbmcoZC5nZXRNaW51dGVzKCkpLnBhZFN0YXJ0KDIsICcwJyk7IHJldHVybiBgJHtoICUgMTIgfHwgMTJ9OiR7bX0gJHtoIDwgMTIgPyAnQU0nIDogJ1BNJ31gOyB9OwoKZnVuY3Rpb24gcmVuZGVyVHJheSgpIHsKICBpZiAoIXVpLnRhYiB8fCB1aS50YWIgPT09ICdyZWFkeScpIHVpLnRhYiA9ICd0b2RheSc7CiAgJCgnI21haW4nKS5pbm5lckhUTUwgPSBgCiAgPGRpdiBjbGFzcz0ic2VjdGlvbi10aXRsZSIgc3R5bGU9Im1hcmdpbi10b3A6MjJweCI+PGgyPkV0aXF1ZXRhczwvaDI+PHNwYW4gY2xhc3M9Im11dGVkIj5MYXMgbcOhcyBudWV2YXMgYXJyaWJhLiBTZSBhY3R1YWxpemEgc29sYS48L3NwYW4+PGRpdiBjbGFzcz0icmNvZGVzIiBpZD0icmNvZGVzIiBoaWRkZW4+PC9kaXY+PC9kaXY+CiAgPGRpdiBjbGFzcz0ic2hpcC1zdW0iIGlkPSJzaGlwU3VtIj48L2Rpdj4KICA8ZGl2IGNsYXNzPSJ0YWJzYmlnIiBpZD0idGFic0JpZyI+PC9kaXY+CiAgPGRpdiBjbGFzcz0icGFuZWwiPgogICAgPGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+CiAgICAgIDxkaXYgY2xhc3M9ImNoaXBzIiBpZD0ibWtDaGlwcyI+PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9Im1zZWwiIGlkPSJzZWxsZXJGIj48YnV0dG9uIHR5cGU9ImJ1dHRvbiIgY2xhc3M9Im1zZWwtYnRuIiBhcmlhLWhhc3BvcHVwPSJ0cnVlIiBhcmlhLWV4cGFuZGVkPSJmYWxzZSI+JHtNKCdmdWxmaWxsbWVudCcpID8gJ1RvZG9zIGxvcyB2ZW5kZWRvcmVzJyA6ICdUb2RhcyBsYXMgZW1wcmVzYXMnfTwvYnV0dG9uPjxkaXYgY2xhc3M9Im1zZWwtcG9wIiBoaWRkZW4+PC9kaXY+PC9kaXY+CiAgICAgIDxpbnB1dCB0eXBlPSJzZWFyY2giIGlkPSJxIiBwbGFjZWhvbGRlcj0iQnVzY2FyIGNsaWVudGUsIHBlZGlkbyBvIFNLVSIgdmFsdWU9IiR7ZXNjKHVpLnEpfSIgYXJpYS1sYWJlbD0iQnVzY2FyIiBzdHlsZT0id2lkdGg6YXV0bzttaW4td2lkdGg6MjIwcHgiPgogICAgICA8c3BhbiBjbGFzcz0ic3BhY2VyIiBzdHlsZT0iZmxleDoxIj48L3NwYW4+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tZ2hvc3QgYnRuLXNtIiBpZD0ic3luY05vdyI+JHtJLnN5bmN9QnVzY2FyIHBlZGlkb3MgYWhvcmE8L2J1dHRvbj4KICAgIDwvZGl2PgogICAgPGRpdiBjbGFzcz0iYnBmIiBpZD0iYnBGaWx0ZXIiIGhpZGRlbj48L2Rpdj4KICAgIDxkaXYgY2xhc3M9ImFjdGlvbmJhciIgaWQ9ImFjdGlvbmJhciI+PC9kaXY+CiAgICA8ZGl2IGlkPSJsaXN0Ij48L2Rpdj4KICA8L2Rpdj5gOwogIGRyYXdDb2Rlc1N0cmlwKCk7IGxvYWRDb2RlcygpOwogICQoJyNzeW5jTm93Jykub25jbGljayA9IGFzeW5jICgpID0+IHsgYXdhaXQgYXBpKCcvYXBpL3N5bmMnLCB7IG1ldGhvZDogJ1BPU1QnIH0pOyB0b2FzdCgnQnVzY2FuZG8gcGVkaWRvcyBudWV2b3MgZW4gbG9zIG1hcmtldHBsYWNlc+KApicpOyB9OwogICQoJyN0YWJzQmlnJykub25jbGljayA9IGUgPT4geyBjb25zdCBiID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtdGFiMl0nKTsgaWYgKCFiKSByZXR1cm47IHVpLnRhYiA9IGIuZGF0YXNldC50YWIyOyBzZWxlY3RlZC5jbGVhcigpOyBkcmF3Um93cygpOyB9OwogICQoJyNta0NoaXBzJykub25jbGljayA9IGUgPT4geyBjb25zdCBiID0gZS50YXJnZXQuY2xvc2VzdCgnLmNoaXAnKTsgaWYgKCFiKSByZXR1cm47IHVpLm1rID0gYi5kYXRhc2V0Lm1rOyBkcmF3Um93cygpOyB9OwogIC8vIGZpbHRybyBkZSB2ZW5kZWRvcmVzOiBzZSBwdWVkZW4gbWFyY2FyIHZhcmlvcyBhIGxhIHZleiAobmluZ3VubyBtYXJjYWRvID0gdG9kb3MpCiAgY29uc3Qgc2ZCb3ggPSAkKCcjc2VsbGVyRicpOwogIHNmQm94LnF1ZXJ5U2VsZWN0b3IoJy5tc2VsLWJ0bicpLm9uY2xpY2sgPSAoKSA9PiB7IGNvbnN0IHBvcCA9IHNmQm94LnF1ZXJ5U2VsZWN0b3IoJy5tc2VsLXBvcCcpOyBwb3AuaGlkZGVuID0gIXBvcC5oaWRkZW47IHNmQm94LnF1ZXJ5U2VsZWN0b3IoJy5tc2VsLWJ0bicpLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsIFN0cmluZyghcG9wLmhpZGRlbikpOyB9OwogIHNmQm94LnF1ZXJ5U2VsZWN0b3IoJy5tc2VsLXBvcCcpLm9uY2hhbmdlID0gZSA9PiB7CiAgICBjb25zdCB2ID0gZS50YXJnZXQudmFsdWU7IGlmICghdikgcmV0dXJuOwogICAgaWYgKHYgPT09ICdhbGwnKSB1aS5zZWxsZXJzLmNsZWFyKCk7IGVsc2UgZS50YXJnZXQuY2hlY2tlZCA/IHVpLnNlbGxlcnMuYWRkKHYpIDogdWkuc2VsbGVycy5kZWxldGUodik7CiAgICBkcmF3U2VsbGVyRmlsdGVyKCk7IGRyYXdSb3dzKCk7CiAgfTsKICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGUgPT4geyBpZiAoIWUudGFyZ2V0LmNsb3Nlc3QoJyNzZWxsZXJGJykpIHsgY29uc3QgcG9wID0gJCgnI3NlbGxlckYgLm1zZWwtcG9wJyk7IGlmIChwb3ApIHBvcC5oaWRkZW4gPSB0cnVlOyB9IH0pOwogICQoJyNxJykub25pbnB1dCA9IGUgPT4geyB1aS5xID0gZS50YXJnZXQudmFsdWUudHJpbSgpLnRvTG93ZXJDYXNlKCk7IGRyYXdSb3dzKCk7IH07CiAgJCgnI2xpc3QnKS5vbmNoYW5nZSA9IGUgPT4geyBjb25zdCBpZCA9IGUudGFyZ2V0LmRhdGFzZXQuaWQ7IGlmICghaWQpIHJldHVybjsgZS50YXJnZXQuY2hlY2tlZCA/IHNlbGVjdGVkLmFkZCgraWQpIDogc2VsZWN0ZWQuZGVsZXRlKCtpZCk7IGRyYXdBY3Rpb25iYXIoKTsgfTsKICAkKCcjbGlzdCcpLm9uY2xpY2sgPSBhc3luYyBlID0+IHsKICAgIGNvbnN0IGIgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1hY3RdJyk7IGlmICghYikgcmV0dXJuOwogICAgY29uc3QgaWQgPSArYi5kYXRhc2V0LmlkOwogICAgaWYgKGIuZGF0YXNldC5hY3QgPT09ICdwcmludCcpIHsgaWYgKG1lLnVzZXIucm9sZSA9PT0gJ3NlbGxlcicgJiYgIWNvbmZpcm0oJ1NpIGxhIGltcHJpbWVzIHTDuiwgcXVlZGEgY29tbyBpbXByZXNhIHBvciB0dSB0aWVuZGEgeSBlbCBmdWxmaWxsbWVudCBsYSB2ZXLDoSBlbiByb2pvIGNvbW8gIkV0aXF1ZXRhIGltcHJlc2EiLiDCv0ltcHJpbWlyPycpKSByZXR1cm47IGlmIChkb3dubG9hZGluZykgcmV0dXJuOyBkb3dubG9hZGluZyA9IHRydWU7IGIuZGlzYWJsZWQgPSB0cnVlOyBzaG93U3VuKDEpOyBsZXQgb2tEbCA9IGZhbHNlOwogICAgICB0cnkgewogICAgICAgIGNvbnN0IGRvbmUgPSBhd2FpdCByZWNvcmRPcmRlcnMoJ0ltcHJpbWlyIGV0aXF1ZXRhJywgW2lkXSk7CiAgICAgICAgY29uc3QgcmVzID0gYXdhaXQgc2FmZUZldGNoKGAvYXBpL29yZGVycy8ke2lkfS9sYWJlbC5wZGY/bWFyaz0xYCwgeyBjcmVkZW50aWFsczogJ3NhbWUtb3JpZ2luJyB9KTsKICAgICAgICBpZiAoIXJlcy5vaykgeyBjb25zdCBlID0gYXdhaXQgcmVzLmpzb24oKS5jYXRjaCgoKSA9PiAoe30pKTsgdGhyb3cgbmV3IEVycm9yKGUuZXJyb3IgfHwgJ05vIHNlIHB1ZG8gZGVzY2FyZ2FyIGxhIGV0aXF1ZXRhJyk7IH0KICAgICAgICBjb25zdCBibG9iID0gYXdhaXQgcmVzLmJsb2IoKTsKICAgICAgICBjb25zdCBuYW1lID0gKHJlcy5oZWFkZXJzLmdldCgnY29udGVudC1kaXNwb3NpdGlvbicpIHx8ICcnKS5tYXRjaCgvZmlsZW5hbWU9IihbXiJdKykiLyk/LlsxXSB8fCBgZXRpcXVldGEtJHtpZH0ucGRmYDsKICAgICAgICBjb25zdCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpOyBhLmhyZWYgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpOyBhLmRvd25sb2FkID0gbmFtZTsgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChhKTsgYS5jbGljaygpOyBhLnJlbW92ZSgpOwogICAgICAgIHNldFRpbWVvdXQoKCkgPT4gVVJMLnJldm9rZU9iamVjdFVSTChhLmhyZWYpLCA2MDAwMCk7CiAgICAgICAgb2tEbCA9IHRydWU7IGRvbmUoKTsgdG9hc3QoJ0V0aXF1ZXRhIGRlc2NhcmdhZGEgwrcgcGFzw7MgYSAiRXRpcXVldGFzIGltcHJlc2FzIicpOwogICAgICB9IGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UsIDUwMDApOyBiLmRpc2FibGVkID0gZmFsc2U7IH0KICAgICAgZmluYWxseSB7IGhpZGVTdW4oIW9rRGwpOyBkb3dubG9hZGluZyA9IGZhbHNlOyBzZXRUaW1lb3V0KGxvYWRPcmRlcnMsIDQwMCk7IH0gfQogICAgaWYgKGIuZGF0YXNldC5hY3QgPT09ICdyZXByaW50Jykgd2luZG93Lm9wZW4oYC9hcGkvb3JkZXJzLyR7aWR9L2xhYmVsLnBkZmAsICdfYmxhbmsnKTsKICAgIGlmIChiLmRhdGFzZXQuYWN0ID09PSAncmV0cnknKSB7IGIuZGlzYWJsZWQgPSB0cnVlOyB0cnkgeyBhd2FpdCBhcGkoYC9hcGkvb3JkZXJzLyR7aWR9L3JldHJ5YCwgeyBtZXRob2Q6ICdQT1NUJyB9KTsgdG9hc3QoJ1JlaW50ZW50YW5kb+KApicpOyBsb2FkT3JkZXJzKCk7IH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IH0gfQogICAgaWYgKGIuZGF0YXNldC5hY3QgPT09ICd1bmJsb2NrJykgewogICAgICBpZiAoIWNvbmZpcm0oJ8K/RGVzYmxvcXVlYXIgZXN0YSBldGlxdWV0YT8gUGFzYSBhIGxhIHNlY2Npw7NuICJEZXNibG9xdWVhZGFzIi4gRW4gbGEgaG9qYSBkZWwgcGVkaWRvIHNhbGRyw6Egc3UgbsO6bWVybyB5IHF1ZWRhcsOhbiBtYXJjYWRvcyBjb24gIkZBTFRBIiBsb3MgcHJvZHVjdG9zIHF1ZSBzZSByZWxsZW5hbiBhcGFydGUuJykpIHJldHVybjsKICAgICAgYi5kaXNhYmxlZCA9IHRydWU7IGIudGV4dENvbnRlbnQgPSAnRGVzYmxvcXVlYW5kb+KApic7CiAgICAgIHRyeSB7IGNvbnN0IHJlYyA9IGF3YWl0IHJlY29yZE9yZGVycygnRGVzYmxvcXVlYXIgZXRpcXVldGEnLCBbaWRdKTsgYXdhaXQgYXBpUmV0cnkoYC9hcGkvb3JkZXJzLyR7aWR9L3VuYmxvY2tgLCB7IG1ldGhvZDogJ1BPU1QnIH0pOyByZWMoKTsgbWFya1VuYmxvY2tlZChbaWRdKTsgdG9hc3QoJ0V0aXF1ZXRhIGRlc2Jsb3F1ZWFkYSDCtyBwYXPDsyBhICJEZXNibG9xdWVhZGFzIicpOyBsb2FkT3JkZXJzKCk7IH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IGIuZGlzYWJsZWQgPSBmYWxzZTsgYi5pbm5lckhUTUwgPSBgJHtJLmxvY2t9RGVzYmxvcXVlYXIgZXRpcXVldGFgOyB9CiAgICB9CiAgICBpZiAoYi5kYXRhc2V0LmFjdCA9PT0gJ3JlYmxvY2snKSB7IHRyeSB7IGNvbnN0IHJlYyA9IGF3YWl0IHJlY29yZE9yZGVycygnVm9sdmVyIGEgYmxvcXVlYXInLCBbaWRdKTsgYXdhaXQgYXBpKGAvYXBpL29yZGVycy8ke2lkfS9yZWJsb2NrYCwgeyBtZXRob2Q6ICdQT1NUJyB9KTsgcmVjKCk7IHRvYXN0KCdFdGlxdWV0YSBibG9xdWVhZGEgb3RyYSB2ZXonKTsgbG9hZE9yZGVycygpOyB9IGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UpOyB9IH0KICAgIGlmIChiLmRhdGFzZXQuYWN0ID09PSAndW5wcmludCcpIHsgY29uc3QgcmVjID0gYXdhaXQgcmVjb3JkT3JkZXJzKCdNYXJjYXIgY29tbyBubyBpbXByZXNhJywgW2lkXSk7IGF3YWl0IGFwaShgL2FwaS9vcmRlcnMvJHtpZH0vdW5wcmludGAsIHsgbWV0aG9kOiAnUE9TVCcgfSk7IHJlYygpOyB0b2FzdCgnVm9sdmnDsyBhICJFdGlxdWV0YXMgcG9yIGltcHJpbWlyIicpOyBsb2FkT3JkZXJzKCk7IH0KICB9OwogICQoJyNhY3Rpb25iYXInKS5vbmNsaWNrID0gYXN5bmMgZSA9PiB7CiAgICBjb25zdCBiID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtYnVsa10nKTsgaWYgKCFiKSByZXR1cm47CiAgICBpZiAoYi5kYXRhc2V0LmJ1bGsgPT09ICdhbGwnKSB7IGNvbnN0IGlkcyA9IHZpc2libGUoKS5maWx0ZXIocHJpbnRhYmxlKS5tYXAobyA9PiBvLmlkKTsgaWYgKGlkcy5sZW5ndGggJiYgc2VsbGVyT2tUb1ByaW50KGlkcy5sZW5ndGgpKSBkb3dubG9hZEJhdGNoKGlkcyk7IH0KICAgIGlmIChiLmRhdGFzZXQuYnVsayA9PT0gJ3NlbCcpIHsgY29uc3QgaWRzID0gWy4uLnNlbGVjdGVkXS5maWx0ZXIoaWQgPT4gb3JkZXJzLnNvbWUobyA9PiBvLmlkID09PSBpZCAmJiBwcmludGFibGUobykpKTsgaWYgKGlkcy5sZW5ndGggJiYgc2VsbGVyT2tUb1ByaW50KGlkcy5sZW5ndGgpKSBkb3dubG9hZEJhdGNoKGlkcyk7IH0KICAgIGlmIChiLmRhdGFzZXQuYnVsayA9PT0gJ3NlbGFsbCcpIHsgdmlzaWJsZSgpLmZpbHRlcihvID0+IHVpLnRhYiA9PT0gJ2Jsb2NrZWQnID8gKG8uc3RhdGUgPT09ICdibG9ja2VkJyAmJiBvLm93biAhPT0gZmFsc2UpIDogKHByaW50YWJsZShvKSB8fCAoby5zdGF0ZSA9PT0gJ3ByaW50ZWQnICYmIG8ub3duICE9PSBmYWxzZSkpKS5mb3JFYWNoKG8gPT4gc2VsZWN0ZWQuYWRkKG8uaWQpKTsgZHJhd1Jvd3MoKTsgfQogICAgaWYgKGIuZGF0YXNldC5idWxrID09PSAndW5wcmludCcpIHsKICAgICAgY29uc3QgaWRzID0gWy4uLnNlbGVjdGVkXS5maWx0ZXIoaWQgPT4gb3JkZXJzLmZpbmQobyA9PiBvLmlkID09PSBpZCAmJiBvLnN0YXRlID09PSAncHJpbnRlZCcpKTsKICAgICAgaWYgKCFpZHMubGVuZ3RoIHx8ICFjb25maXJtKGDCv01hcmNhciAke2lkcy5sZW5ndGh9IGV0aXF1ZXRhJHtpZHMubGVuZ3RoID09PSAxID8gJycgOiAncyd9IGNvbW8gTk8gaW1wcmVzYSR7aWRzLmxlbmd0aCA9PT0gMSA/ICcnIDogJ3MnfT8gVnVlbHZlbiBhICJQYXJhIGltcHJpbWlyIi5gKSkgcmV0dXJuOwogICAgICBiLmRpc2FibGVkID0gdHJ1ZTsKICAgICAgY29uc3QgcmVjID0gYXdhaXQgcmVjb3JkT3JkZXJzKGBNYXJjYXIgJHtpZHMubGVuZ3RofSBjb21vIG5vIGltcHJlc2FzYCwgaWRzKTsKICAgICAgbGV0IG9rID0gMDsgZm9yIChjb25zdCBpZCBvZiBpZHMpIHsgdHJ5IHsgYXdhaXQgYXBpKGAvYXBpL29yZGVycy8ke2lkfS91bnByaW50YCwgeyBtZXRob2Q6ICdQT1NUJyB9KTsgb2srKzsgfSBjYXRjaCB7fSB9CiAgICAgIHJlYygpOyBzZWxlY3RlZC5jbGVhcigpOyB0b2FzdChgJHtva30gZXRpcXVldGEke29rID09PSAxID8gJycgOiAncyd9IHZvbHZpZXJvbiBhICJQYXJhIGltcHJpbWlyImApOyBsb2FkT3JkZXJzKCk7CiAgICB9CiAgICBpZiAoYi5kYXRhc2V0LmJ1bGsgPT09ICd1bmJsb2NrJykgewogICAgICBjb25zdCBpZHMgPSBbLi4uc2VsZWN0ZWRdLmZpbHRlcihpZCA9PiBvcmRlcnMuZmluZChvID0+IG8uaWQgPT09IGlkICYmIG8uc3RhdGUgPT09ICdibG9ja2VkJykpOwogICAgICBpZiAoIWlkcy5sZW5ndGggfHwgIWNvbmZpcm0oYMK/RGVzYmxvcXVlYXIgJHtpZHMubGVuZ3RofSBldGlxdWV0YSR7aWRzLmxlbmd0aCA9PT0gMSA/ICcnIDogJ3MnfT8gUGFzYW4gYSBsYSBzZWNjacOzbiAiRGVzYmxvcXVlYWRhcyIuIEVuIGxhIGhvamEgZGUgY2FkYSBwZWRpZG8gc2FsZHLDoSBzdSBuw7ptZXJvIHkgcXVlZGFyw6FuIG1hcmNhZG9zIGNvbiAiRkFMVEEiIGxvcyBwcm9kdWN0b3MgcXVlIHNlIHJlbGxlbmFuIGFwYXJ0ZS5gKSkgcmV0dXJuOwogICAgICBiLmRpc2FibGVkID0gdHJ1ZTsgYi50ZXh0Q29udGVudCA9ICdEZXNibG9xdWVhbmRv4oCmJzsKICAgICAgdHJ5IHsKICAgICAgICBjb25zdCByZWMgPSBhd2FpdCByZWNvcmRPcmRlcnMoYERlc2Jsb3F1ZWFyICR7aWRzLmxlbmd0aH0gZXRpcXVldGFzYCwgaWRzKTsKICAgICAgICBjb25zdCByID0gYXdhaXQgYXBpUmV0cnkoJy9hcGkvb3JkZXJzL3VuYmxvY2stYnVsaycsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgaWRzIH0gfSk7CiAgICAgICAgcmVjKCk7IG1hcmtVbmJsb2NrZWQoaWRzKTsgc2VsZWN0ZWQuY2xlYXIoKTsKICAgICAgICB0b2FzdChgJHtyLnVuYmxvY2tlZH0gZXRpcXVldGEke3IudW5ibG9ja2VkID09PSAxID8gJycgOiAncyd9IGRlc2Jsb3F1ZWFkYSR7ci51bmJsb2NrZWQgPT09IDEgPyAnJyA6ICdzJ30gwrcgcGFzYXJvbiBhICJEZXNibG9xdWVhZGFzImApOyBsb2FkT3JkZXJzKCk7CiAgICAgIH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IGRyYXdBY3Rpb25iYXIoKTsgfQogICAgfQogICAgaWYgKGIuZGF0YXNldC5idWxrID09PSAnbm9uZScpIHsgc2VsZWN0ZWQuY2xlYXIoKTsgZHJhd1Jvd3MoKTsgfQogIH07CiAgbG9hZE9yZGVycygpOwp9Cgphc3luYyBmdW5jdGlvbiBsb2FkT3JkZXJzKCkgewogIGlmICh0YWIgIT09ICd0cmF5JykgcmV0dXJuOwogIGNvbnN0IGQgPSBhd2FpdCBhcGkoJy9hcGkvb3JkZXJzP3ZpZXc9YWxsJyk7CiAgY29uc3QgcHJldlJlYWR5ID0gbmV3IFNldChvcmRlcnMuZmlsdGVyKG8gPT4gby5zdGF0ZSA9PT0gJ3JlYWR5JykubWFwKG8gPT4gby5pZCkpOwogIG9yZGVycyA9IGQub3JkZXJzLnNvcnQoKGEsIGIpID0+IHRzKGIpIC0gdHMoYSkpOwogIHNlbGxlcnMgPSBkLnNlbGxlcnM7CiAgZHJhd1NlbGxlckZpbHRlcigpOwogIGNvbnN0IGZyZXNoID0gb3JkZXJzLmZpbHRlcihvID0+IG8uc3RhdGUgPT09ICdyZWFkeScgJiYgIXByZXZSZWFkeS5oYXMoby5pZCkpLm1hcChvID0+IG8uaWQpOwogIGRyYXdSb3dzKGZpcnN0TG9hZCA/IFtdIDogZnJlc2gpOwogIGlmICghZmlyc3RMb2FkICYmIGZyZXNoLmxlbmd0aCkgdG9hc3QoYCR7ZnJlc2gubGVuZ3RofSBldGlxdWV0YSR7ZnJlc2gubGVuZ3RoID4gMSA/ICdzJyA6ICcnfSBudWV2YSR7ZnJlc2gubGVuZ3RoID4gMSA/ICdzJyA6ICcnfSBwb3IgaW1wcmltaXJgKTsKICBmaXJzdExvYWQgPSBmYWxzZTsKICAvLyBkZXNjYXJnYSBhdXRvbcOhdGljYSBlbGltaW5hZGE6IG51bmNhIHNlIGRlc2NhcmdhbiBuaSBtYXJjYW4gZXRpcXVldGFzIHNpbiBxdWUgYWxndWllbiBoYWdhIGNsaWMKfQoKY29uc3Qgc2VsbGVyT2sgPSBvID0+ICF1aS5zZWxsZXJzLnNpemUgfHwgdWkuc2VsbGVycy5oYXMoU3RyaW5nKG8uc2VsbGVyX2lkKSk7CmZ1bmN0aW9uIGRyYXdTZWxsZXJGaWx0ZXIoKSB7CiAgY29uc3QgYm94ID0gJCgnI3NlbGxlckYnKTsgaWYgKCFib3gpIHJldHVybjsKICBmb3IgKGNvbnN0IGlkIG9mIFsuLi51aS5zZWxsZXJzXSkgaWYgKCFzZWxsZXJzLnNvbWUocyA9PiBTdHJpbmcocy5pZCkgPT09IGlkKSkgdWkuc2VsbGVycy5kZWxldGUoaWQpOwogIGNvbnN0IG4gPSB1aS5zZWxsZXJzLnNpemU7CiAgYm94LnF1ZXJ5U2VsZWN0b3IoJy5tc2VsLWJ0bicpLnRleHRDb250ZW50ID0gIW4gPyAoTSgnZnVsZmlsbG1lbnQnKSA/ICdUb2RvcyBsb3MgdmVuZGVkb3JlcycgOiAnVG9kYXMgbGFzIGVtcHJlc2FzJykgOiBuID09PSAxID8gKHNlbGxlcnMuZmluZChzID0+IHVpLnNlbGxlcnMuaGFzKFN0cmluZyhzLmlkKSkpPy5uYW1lIHx8ICcxJykgOiBgJHtufSAke00oJ2Z1bGZpbGxtZW50JykgPyAndmVuZGVkb3JlcycgOiAnZW1wcmVzYXMnfWA7CiAgYm94LmNsYXNzTGlzdC50b2dnbGUoJ29uJywgbiA+IDApOwogIGJveC5xdWVyeVNlbGVjdG9yKCcubXNlbC1wb3AnKS5pbm5lckhUTUwgPSBgPGxhYmVsIGNsYXNzPSJtc2VsLWFsbCI+PGlucHV0IHR5cGU9ImNoZWNrYm94IiB2YWx1ZT0iYWxsIiAkeyFuID8gJ2NoZWNrZWQnIDogJyd9PiAke00oJ2Z1bGZpbGxtZW50JykgPyAnVG9kb3MgbG9zIHZlbmRlZG9yZXMnIDogJ1RvZGFzIGxhcyBlbXByZXNhcyd9PC9sYWJlbD5gICsKICAgIHNlbGxlcnMubWFwKHMgPT4gYDxsYWJlbD48aW5wdXQgdHlwZT0iY2hlY2tib3giIHZhbHVlPSIke3MuaWR9IiAke3VpLnNlbGxlcnMuaGFzKFN0cmluZyhzLmlkKSkgPyAnY2hlY2tlZCcgOiAnJ30+ICR7ZXNjKHMubmFtZSl9PC9sYWJlbD5gKS5qb2luKCcnKTsKfQovLyBmaWx0cm8gZGUgbWFya2V0cGxhY2U6IGFkZW3DoXMgc2VwYXJhIE1lcmNhZG8gTGlicmUgQWdlbmNpYSB5IE1lcmNhZG8gTGlicmUgRmxleApjb25zdCBta01hdGNoID0gKG8sIGspID0+IGsgPT09ICdhbGwnIHx8IChrID09PSAnbWwtYWdlbmNpYScgPyBvLm1hcmtldHBsYWNlID09PSAnbWwnICYmIG8uc2hpcF90eXBlICE9PSAnRmxleCcgOiBrID09PSAnbWwtZmxleCcgPyBvLm1hcmtldHBsYWNlID09PSAnbWwnICYmIG8uc2hpcF90eXBlID09PSAnRmxleCcgOiBvLm1hcmtldHBsYWNlID09PSBrKTsKY29uc3QgbWF0Y2hlc0ZpbHRlcnMgPSBvID0+IG1rTWF0Y2gobywgdWkubWspICYmIHNlbGxlck9rKG8pICYmCiAgKCF1aS5xIHx8IG8ub3JkZXJfbnVtYmVyLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXModWkucSkgfHwgKG8uY3VzdG9tZXIgfHwgJycpLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXModWkucSkgfHwgby5pdGVtcy5zb21lKGkgPT4gW2kuc2t1LCBpLnB1Yl9pZCwgaS5uYW1lXS5qb2luKCcgJykudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyh1aS5xKSkpOwpjb25zdCB2aXNpYmxlSW4gPSB0ID0+IG9yZGVycy5maWx0ZXIobyA9PiBpblRhYkZuKG8sIHQpICYmIG1hdGNoZXNGaWx0ZXJzKG8pKTsKLy8gRW4gIlBvciBpbXByaW1pciIgdGFtYmnDqW4gc2UgcXVlZGFuIGxhcyBxdWUgc2UgaW1wcmltaWVyb24gZW4gbGFzIMO6bHRpbWFzIDEyIGhvcmFzLCBlbiByb2pvIGNvbiAiVm9sdmVyIGEgaW1wcmltaXIiCmNvbnN0IHByaW50ZWRSZWNlbnRseSA9IG8gPT4gby5zdGF0ZSA9PT0gJ3ByaW50ZWQnICYmIG8ucHJpbnRlZF9hdCAmJiBEYXRlLm5vdygpIC0gbmV3IERhdGUoby5wcmludGVkX2F0LnJlcGxhY2UoJyAnLCAnVCcpICsgJ1onKSA8IDEyICogMzYwMGUzOwovLyBCbG9xdWVhZGFzIGltcHJlc2FzOiDCv2VsIGZ1bGZpbGxtZW50IHRpZW5lIHF1ZSByZWxsZW5hciAodGllbmUgYWwgbWVub3MgdW4gcHJvZHVjdG8pIG8gbm8gbGUgdG9jYSBuYWRhPwpjb25zdCBicEtpbmQgPSBvID0+ICgoby5taXNzaW5nX2lkeCB8fCBbXSkubGVuZ3RoID49IChvLml0ZW1zIHx8IFtdKS5sZW5ndGggPyAnbm9uZScgOiAnZmlsbCcpOwpmdW5jdGlvbiB2aXNpYmxlKCkgewogIGlmICh1aS50YWIgPT09ICdibG9ja2VkUHJpbnRlZCcgJiYgdWkuYnBmICE9PSAnYWxsJykgcmV0dXJuIHZpc2libGVJbih1aS50YWIpLmZpbHRlcihvID0+IGJwS2luZChvKSA9PT0gdWkuYnBmKTsKICBpZiAodWkudGFiID09PSAnYmxvY2tlZCcpIHJldHVybiB2aXNpYmxlSW4odWkudGFiKS5maWx0ZXIobyA9PiAodWkuYmRmID09PSAnYWxsJyB8fCAodWkuYmRmID09PSAndG9kYXknKSA9PT0gaXNGb3JUb2RheShvKSkgJiYgKHVpLmJiZiA9PT0gJ2FsbCcgfHwgYnBLaW5kKG8pID09PSB1aS5iYmYpKTsKICBpZiAodWkudGFiID09PSAndW5ibG9ja2VkJykgcmV0dXJuIHZpc2libGVJbih1aS50YWIpLmZpbHRlcihvID0+ICh1aS51ZGYgPT09ICdhbGwnIHx8ICh1aS51ZGYgPT09ICd0b2RheScpID09PSBpc0ZvclRvZGF5KG8pKSAmJiAodWkudWJmID09PSAnYWxsJyB8fCBicEtpbmQobykgPT09IHVpLnViZikpOwogIC8vIGxhcyBpbXByZXNhcyBzYWxlbiBkZSAiUGFyYSBpbXByaW1pciBob3kiIHkgcXVlZGFuIHNvbG8gZW4gIkV0aXF1ZXRhcyBpbXByZXNhcyIgbyAiQmxvcXVlYWRhcyBpbXByZXNhcyIKICByZXR1cm4gdmlzaWJsZUluKHVpLnRhYik7Cn0KCmZ1bmN0aW9uIGl0ZW1zSFRNTChvKSB7CiAgY29uc3QgYmFkID0gbmV3IFNldChvLm1pc3NpbmdfaWR4IHx8IFtdKTsKICBjb25zdCBtaXhlZCA9IGJhZC5zaXplID4gMDsgLy8gcGVkaWRvIGNvbiBwcm9kdWN0b3MgYmxvcXVlYWRvczogcm9qbyA9IG5vIGxvIHRpZW5lIGVsIGZ1bGZpbGxtZW50LCB2ZXJkZSA9IHPDrSBsbyB0aWVuZQogIHJldHVybiBgPGRpdiBjbGFzcz0iaXRlbXMiPiR7by5pdGVtcy5tYXAoKGksIG4pID0+IGA8c3BhbiBjbGFzcz0iJHtiYWQuaGFzKG4pID8gJ2JhZCcgOiAnZ29vZCd9Ij4ke2JhZC5oYXMobikgPyAnPGVtIGNsYXNzPSJmYWx0YSI+RkFMVEE8L2VtPiAnIDogbWl4ZWQgPyAnPGVtIGNsYXNzPSJ0aWVuZSI+VElFTkU8L2VtPiAnIDogJyd9PGI+JHtlc2MoaS5xdHkpfcOXPC9iPiAke2VzYyhpLm5hbWUpfSR7aS52YXJpYW50ID8gYCA8c3BhbiBjbGFzcz0idiI+wrcgJHtlc2MoaS52YXJpYW50KX08L3NwYW4+YCA6ICcnfSA8c3BhbiBjbGFzcz0ibW9ubyB2Ij4ke2VzYyhpLnNrdSB8fCBpLnB1Yl9pZCl9PC9zcGFuPjwvc3Bhbj5gKS5qb2luKCcnKX08L2Rpdj5gOwp9CmZ1bmN0aW9uIHBpbGwobykgeyByZXR1cm4gYDxzcGFuIGNsYXNzPSJwaWxsICR7by5zdGF0ZX0iPiR7cGlsbEljb25bby5zdGF0ZV0gfHwgJyd9JHtTVEFURVtvLnN0YXRlXSB8fCBvLnN0YXRlfTwvc3Bhbj5gOyB9CgoKLy8gVGFibGEgZGUgY29udGVvIHBvciBjYW5hbDogcGFyYSBjYWRhIGNhbmFsLCAiRkYiID0gbGFzIHF1ZSBzZXBhcmEgZWwgZnVsZmlsbG1lbnQgeSAiQmxvcS4iID0gYmxvcXVlYWRhcyBhbCAxMDAlCi8vIChlbCB2ZW5kZWRvciBlbnbDrWEgdG9kbzsgZWwgZnVsZmlsbG1lbnQgbm8gc2VwYXJhIG5hZGEpCi8vIGNhdGVnb3LDrWFzIGRlbCBjb250ZW8gZGUgcGFxdWV0ZXM6IE1MIHNlIHNlcGFyYSBlbiBDZW50cm8gZGUgZW52w61vIHkgRmxleDsgZWwgcmVzdG8sIHVuIGNhbmFsIHBvciBjb2x1bW5hIChzb2xvIGxvcyBjb25lY3RhZG9zKQpmdW5jdGlvbiBzaGlwQ2F0cyhoYXZlID0gW10pIHsKICBjb25zdCBsID0gbWtMaXN0KGhhdmUpOwogIHJldHVybiBbLi4uKGwuaW5jbHVkZXMoJ21sJykgPyBbWydjZScsICdDZW50cm8gZW52w61vIE1MJywgTUtfQ09MT1IubWwsICfwn5OmJ10sIFsnZmxleCcsICdGbGV4JywgJyMyMzk0NkEnLCAn4pqhJ11dIDogW10pLCAuLi5sLmZpbHRlcihrID0+IGsgIT09ICdtbCcpLm1hcChrID0+IFtrLCBNS1trXSwgTUtfQ09MT1Jba10sIE1LX0lDT05ba10gfHwgJ/Cfk6YnXSldOwp9CmxldCBTU19DQVRTID0gc2hpcENhdHMoKTsKZnVuY3Rpb24gY291bnRUYWJsZShyb3dzLCBmaXJzdCkgewogIFNTX0NBVFMgPSBzaGlwQ2F0cyhyb3dzLmZsYXRNYXAociA9PiBbLi4uT2JqZWN0LmtleXMoci5mZiB8fCB7fSksIC4uLk9iamVjdC5rZXlzKHIuYmwgfHwge30pXSkubWFwKGsgPT4gKGsgPT09ICdjZScgfHwgayA9PT0gJ2ZsZXgnID8gJ21sJyA6IGspKSk7CiAgY29uc3QgeiA9IG4gPT4gbiA/IG4gOiAnPHNwYW4gY2xhc3M9Inplcm8iPsK3PC9zcGFuPic7CiAgY29uc3Qgc3VtID0gKG8sIGspID0+IFNTX0NBVFMucmVkdWNlKChhLCBbY10pID0+IGEgKyAoKG9ba10gfHwge30pW2NdIHx8IDApLCAwKTsKICByZXR1cm4gYDxkaXYgY2xhc3M9InRhYmxlLXdyYXAiPjx0YWJsZSBjbGFzcz0ic3MtdGFibGUgc3MtMiI+PHRoZWFkPgogICAgPHRyPjx0aCByb3dzcGFuPSIyIj4ke2ZpcnN0fTwvdGg+JHtTU19DQVRTLm1hcCgoW2ssIG5dKSA9PiBgPHRoIGNvbHNwYW49IjIiIGNsYXNzPSJzcy1ncnAiIHN0eWxlPSItLWdjOiR7KFNTX0NBVFMuZmluZCh4ID0+IHhbMF0gPT09IGspIHx8IFtdKVsyXX0iPiR7KFNTX0NBVFMuZmluZCh4ID0+IHhbMF0gPT09IGspIHx8IFtdKVszXSB8fCAnJ30gJHtufTwvdGg+YCkuam9pbignJyl9PHRoIGNvbHNwYW49IjIiIGNsYXNzPSJzcy1ncnAiPlRvdGFsPC90aD48dGggcm93c3Bhbj0iMiIgY2xhc3M9Im51bSI+VG9kYXM8L3RoPjwvdHI+CiAgICA8dHI+JHtTU19DQVRTLmNvbmNhdChbWyd0J11dKS5tYXAoKCkgPT4gJzx0aCBjbGFzcz0ibnVtIiB0aXRsZT0iTGFzIHNlcGFyYSBlbCBmdWxmaWxsbWVudCI+RkY8L3RoPjx0aCBjbGFzcz0ibnVtIHNzLWJsIiB0aXRsZT0iQmxvcXVlYWRhcyBhbCAxMDAlOiBlbCBmdWxmaWxsbWVudCBubyBzZXBhcmEgbmFkYSI+QmxvcS48L3RoPicpLmpvaW4oJycpfTwvdHI+PC90aGVhZD48dGJvZHk+CiAgICAke3Jvd3MubWFwKHIgPT4gYDx0ciBjbGFzcz0iJHtyLmNscyB8fCAnJ30iPjx0ZD4ke3IubGFiZWx9PC90ZD4ke1NTX0NBVFMubWFwKChbY10pID0+IGA8dGQgY2xhc3M9Im51bSI+JHt6KChyLmZmIHx8IHt9KVtjXSl9PC90ZD48dGQgY2xhc3M9Im51bSBzcy1ibCI+JHt6KChyLmJsIHx8IHt9KVtjXSl9PC90ZD5gKS5qb2luKCcnKX08dGQgY2xhc3M9Im51bSI+PGI+JHtzdW0ociwgJ2ZmJyl9PC9iPjwvdGQ+PHRkIGNsYXNzPSJudW0gc3MtYmwiPjxiPiR7c3VtKHIsICdibCcpIHx8ICc8c3BhbiBjbGFzcz0iemVybyI+wrc8L3NwYW4+J308L2I+PC90ZD48dGQgY2xhc3M9Im51bSI+JHtzdW0ociwgJ2ZmJykgKyBzdW0ociwgJ2JsJyl9PC90ZD48L3RyPmApLmpvaW4oJycpfQogIDwvdGJvZHk+PC90YWJsZT48L2Rpdj5gOwp9CgovLyBSZWdpc3RybyBkaWFyaW8gZGUgcGFxdWV0ZXMgKHBvciBkw61hIGRlIGRlc3BhY2hvKTogbm8gc2UgYm9ycmEsIHF1ZWRhIHVuIGhpc3RvcmlhbCBkw61hIGEgZMOtYQphc3luYyBmdW5jdGlvbiBkcmF3U2hpcEhpc3RvcnkoKSB7CiAgbGV0IGQ7IHRyeSB7IGQgPSBhd2FpdCBhcGkoJy9hcGkvc2hpcC1oaXN0b3J5P2RheXM9MjEnKTsgfSBjYXRjaCB7IHJldHVybjsgfQogIGNvbnN0IGJveCA9ICQoJyNzaGlwSGlzdCcpOyBpZiAoIWJveCkgcmV0dXJuOwogIGNvbnN0IGRheVMgPSB4ID0+IGVzYyhuZXcgRGF0ZSh4ICsgJ1QxMjowMDowMCcpLnRvTG9jYWxlRGF0ZVN0cmluZygnZXMtQ0wnLCB7IHdlZWtkYXk6ICdzaG9ydCcsIGRheTogJ251bWVyaWMnLCBtb250aDogJ3Nob3J0JyB9KS5yZXBsYWNlKC9cLi9nLCAnJykpOwogIGNvbnN0IHJvd3MgPSBbXTsKICBmb3IgKGNvbnN0IHIgb2YgZC5kYXlzKSB7CiAgICBjb25zdCBob3kgPSByLmRheSA9PT0gaXNvKG5ldyBEYXRlKCkpOwogICAgcm93cy5wdXNoKHsgbGFiZWw6IGA8Yj4ke2RheVMoci5kYXkpfTwvYj4ke2hveSA/ICcgPHNtYWxsIGNsYXNzPSJtdXRlZCI+KGhveSk8L3NtYWxsPicgOiAnJ31gLCBmZjogci5mZiwgYmw6IHIuYmwsIGNsczogJ3NzLWRheXJvdycgKyAoaG95ID8gJyBzcy10b2RheScgOiAnJykgfSk7CiAgICBpZiAodWkuc2hpcE9wZW4pIE9iamVjdC5rZXlzKHIuc2VsbGVycykuc29ydCgpLmZvckVhY2gobiA9PiByb3dzLnB1c2goeyBsYWJlbDogYDxzcGFuIGNsYXNzPSJzcy1zdWIiPiR7ZXNjKG4pfTwvc3Bhbj5gLCAuLi5yLnNlbGxlcnNbbl0sIGNsczogJ3NzLXNlbHJvdycgfSkpOwogIH0KICBib3guaW5uZXJIVE1MID0gZC5kYXlzLmxlbmd0aCA/IGNvdW50VGFibGUocm93cywgJ0TDrWEgZGUgZGVzcGFjaG8nKSArIGA8ZGl2IGNsYXNzPSJtdXRlZCBzcy1ub3RlIj5GRiA9IGxhcyBzZXBhcmEgZWwgZnVsZmlsbG1lbnQgwrcgQmxvcS4gPSBibG9xdWVhZGFzIGFsIDEwMCUgKGxhcyBlbnbDrWEgZWwgdmVuZGVkb3IgY29tcGxldGFzKS4gJHt1aS5zaGlwT3BlbiA/ICcnIDogJ1RvY2EgIlBvciBjdWVudGEiIHBhcmEgdmVyIGVsIGRldGFsbGUgZGUgY2FkYSB2ZW5kZWRvci4nfTwvZGl2PmAgOiAnPGRpdiBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJwYWRkaW5nOjZweCAycHgiPkHDum4gbm8gaGF5IGhpc3RvcmlhbC48L2Rpdj4nOwp9CgovLyBSZXN1bWVuIGFycmliYTogY3XDoW50b3MgZW52w61vcyBzYWxlbiAoaG95IG8gZW4gZWwgcHLDs3hpbW8gZMOtYSBkZSBkZXNwYWNobykgcG9yIHRpcG8geSBwb3IgY3VlbnRhCmZ1bmN0aW9uIGRyYXdTaGlwU3VtbWFyeSgpIHsKICBjb25zdCBib3ggPSAkKCcjc2hpcFN1bScpOyBpZiAoIWJveCkgcmV0dXJuOwogIC8vIEVsIGNvbnRlbyBkZWwgZMOtYSBpbmNsdXllIGxvIHF1ZSB5YSBzYWxpw7MgKGVudmlhZGFzKSwgYXPDrSBlbCBuw7ptZXJvIGRlbCBkw61hIG5vIGJhamE7IHNlIHJlaW5pY2lhIGEgbGFzIDAwOjAwCiAgLy8gbGFzIGNhbmNlbGFkYXMgbm8gY3VlbnRhbiAoYXVucXVlIHlhIGVzdHV2aWVyYW4gaW1wcmVzYXMpCiAgY29uc3Qgb3BlbiA9IG9yZGVycy5maWx0ZXIobyA9PiBvLnN0YXRlICE9PSAnY2FuY2VsbGVkJyAmJiAhby5ta19jYW5jZWxsZWQpOwogIGNvbnN0IGRheU9mID0gbyA9PiB7IGNvbnN0IGQgPSBkaXNwYXRjaERhdGUobyk7IHJldHVybiBkID8gaXNvKGQpIDogaXNvKG5ldyBEYXRlKCkpOyB9OwogIGNvbnN0IHRvZGF5ID0gaXNvKG5ldyBEYXRlKCkpOwogIGNvbnN0IGNhdCA9IG8gPT4gby5tYXJrZXRwbGFjZSA9PT0gJ21sJyA/IChvLnNoaXBfdHlwZSA9PT0gJ0ZsZXgnID8gJ2ZsZXgnIDogJ2NlJykgOiBvLm1hcmtldHBsYWNlOwogIGNvbnN0IENBVFMgPSBzaGlwQ2F0cyhvcGVuLm1hcChvID0+IG8ubWFya2V0cGxhY2UpKTsKICAvLyBsbyBhdHJhc2FkbyBxdWUgYcO6biBubyBzYWxlIHNlIGN1ZW50YSBob3k7IGxvIHF1ZSB5YSBzYWxpw7MgKHAuIGVqLiB1biBGbGV4IHJldGlyYWRvIGF5ZXIgcXVlIGHDum4gbm8gc2UgZW50cmVnYSkgcXVlZGEgZW4gc3UgZMOtYQogIGNvbnN0IGVmZiA9IG8gPT4gKG8uc3RhdGUgIT09ICdzaGlwcGVkJyAmJiAhby5vdXQgJiYgZGF5T2YobykgPCB0b2RheSA/IHRvZGF5IDogZGF5T2YobykpOwogIC8vIENhZGEgY2FuYWwgdGllbmUgc3UgcHJvcGlvIHByw7N4aW1vIGTDrWEgZGUgZGVzcGFjaG8gKHAuIGVqLiBNTCBlbCBsdW5lcyB5IEZhbGFiZWxsYSBlbCBtYXJ0ZXMpOgogIC8vIGVuICJQcsOzeGltbyIgc2UgY3VlbnRhLCBwb3IgY2FuYWwsIGxvIHF1ZSB2ZW5jZSBlbiBzdSBzaWd1aWVudGUgZMOtYSBkZSBkZXNwYWNoby4KICBjb25zdCB0YXJnZXRPZiA9IHt9OwogIGZvciAoY29uc3QgW2tdIG9mIENBVFMpIHRhcmdldE9mW2tdID0gdWkuc2hpcERheSA9PT0gJ3RvZGF5JyA/IHRvZGF5IDogKG9wZW4uZmlsdGVyKG8gPT4gY2F0KG8pID09PSBrICYmIG8uc3RhdGUgIT09ICdzaGlwcGVkJykubWFwKGVmZikuZmlsdGVyKGQgPT4gZCA+IHRvZGF5KS5zb3J0KClbMF0gfHwgbnVsbCk7CiAgY29uc3QgbGlzdCA9IG9wZW4uZmlsdGVyKG8gPT4gdGFyZ2V0T2ZbY2F0KG8pXSAmJiBlZmYobykgPT09IHRhcmdldE9mW2NhdChvKV0pOwogIGNvbnN0IGNvdW50ID0gKGFyciwgaykgPT4gYXJyLmZpbHRlcihvID0+IGNhdChvKSA9PT0gaykubGVuZ3RoOwogIGNvbnN0IGNudEJ5ID0gYXJyID0+IHsgY29uc3QgciA9IHt9OyBhcnIuZm9yRWFjaChvID0+IHsgcltjYXQobyldID0gKHJbY2F0KG8pXSB8fCAwKSArIDE7IH0pOyByZXR1cm4gcjsgfTsKICBjb25zdCBkYXlTID0gZCA9PiBlc2MobmV3IERhdGUoZCArICdUMTI6MDA6MDAnKS50b0xvY2FsZURhdGVTdHJpbmcoJ2VzLUNMJywgeyB3ZWVrZGF5OiAnc2hvcnQnLCBkYXk6ICdudW1lcmljJyB9KS5yZXBsYWNlKC9cLi9nLCAnJykpOwogIC8vIFBhcmEgZWwgY29udGVvIGRlbCBmdWxmaWxsbWVudCBubyBjdWVudGFuIGxhcyBldGlxdWV0YXMgYmxvcXVlYWRhcyBhbCAxMDAlIChubyB0aWVuZSBuaW5ndW5vIGRlIHN1cyBwcm9kdWN0b3MpOwogIC8vIHPDrSBjdWVudGFuIGxhcyBxdWUgdGllbmVuIGFsIG1lbm9zIHVuIHByb2R1Y3RvIHF1ZSBlbCBmdWxmaWxsbWVudCB0aWVuZS4KICBjb25zdCBub25lRmYgPSBvID0+IChvLm1pc3NpbmdfaWR4IHx8IFtdKS5sZW5ndGggPiAwICYmIChvLm1pc3NpbmdfaWR4IHx8IFtdKS5sZW5ndGggPj0gKG8uaXRlbXMgfHwgW10pLmxlbmd0aDsKICBjb25zdCBmZiA9IGxpc3QuZmlsdGVyKG8gPT4gIW5vbmVGZihvKSk7CiAgY29uc3QgYnlTZWxsZXIgPSBbLi4ubmV3IFNldChsaXN0Lm1hcChvID0+IG8uc2VsbGVyKSldLnNvcnQoKS5tYXAobiA9PiBbbiwgZmYuZmlsdGVyKG8gPT4gby5zZWxsZXIgPT09IG4pLCBsaXN0LmZpbHRlcihvID0+IG8uc2VsbGVyID09PSBuKV0pOwogIGNvbnN0IGN1dFMgPSAoYXJyLCBrKSA9PiB7IGNvbnN0IHQgPSB0YXJnZXRPZltrXTsgaWYgKCF0KSByZXR1cm4gJyc7IGNvbnN0IGhzID0gYXJyLmZpbHRlcihvID0+IGNhdChvKSA9PT0gaykubWFwKGRpc3BhdGNoRGF0ZSkuZmlsdGVyKGQgPT4gZCAmJiBpc28oZCkgPT09IHQgJiYgIVsnMjM6NTknLCAnMDA6MDAnXS5pbmNsdWRlcyhoaG1tKGQpKSk7IGNvbnN0IGNudCA9IG5ldyBNYXAoKTsgaHMuZm9yRWFjaChkID0+IHsgY29uc3QgaCA9IGhobW0oZCk7IGNudC5zZXQoaCwgKGNudC5nZXQoaCkgfHwgeyBuOiAwLCBkIH0pICk7IGNudC5nZXQoaCkubisrOyB9KTsgY29uc3QgdG9wID0gWy4uLmNudC52YWx1ZXMoKV0uc29ydCgoYSwgYikgPT4gYi5uIC0gYS5uIHx8IGIuZCAtIGEuZClbMF07IHJldHVybiAodWkuc2hpcERheSA9PT0gJ3RvZGF5JyA/ICcnIDogZGF5Uyh0KSArICcgJykgKyAodG9wID8gYW1wbSh0b3AuZCkgOiAnJyk7IH07IC8vIGhvcmEgZGUgY29ydGUgPSBsYSBxdWUgdGllbmVuIGxhIG1heW9yw61hIGRlIGxhcyBldGlxdWV0YXMgZGVsIGTDrWEKICBjb25zdCBleGNsID0gbGlzdC5sZW5ndGggLSBmZi5sZW5ndGg7CiAgY29uc3QgZmZQcmludGVkID0gZmYuZmlsdGVyKG8gPT4gWydwcmludGVkJywgJ3NoaXBwZWQnXS5pbmNsdWRlcyhvLnN0YXRlKSkubGVuZ3RoOyAvLyBsYXMgaW1wcmVzYXMgc2lndWVuIGNvbnRhbmRvOiBzYWxlbiBpZ3VhbCBlc2UgZMOtYQogIGNvbnN0IElDT04gPSBPYmplY3QuZnJvbUVudHJpZXMoQ0FUUy5tYXAoeCA9PiBbeFswXSwgeFszXV0pKTsKICBjb25zdCBwY3QgPSBmZi5sZW5ndGggPyBNYXRoLnJvdW5kKGZmUHJpbnRlZCAvIGZmLmxlbmd0aCAqIDEwMCkgOiAwOwogIGJveC5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz0ic3N4Mi1oZWFkIj4KICAgICAgPHNwYW4gY2xhc3M9InNzeC10Ij7wn5qaICR7dWkuc2hpcERheSA9PT0gJ3RvZGF5JyA/ICdIb3knIDogJ1Byw7N4aW1vJ308L3NwYW4+CiAgICAgIDxkaXYgY2xhc3M9InNzeDMiPgogICAgICAke0NBVFMubWFwKChbaywgbiwgY10pID0+IHsgY29uc3QgY3V0ID0gY3V0UyhmZiwgayk7IHJldHVybiBgPHNwYW4gY2xhc3M9InNzeDMtYyIgc3R5bGU9Ii0tYzoke2N9IiB0aXRsZT0iJHtufSR7Y3V0ID8gJyDCtyBjb3J0ZSAnICsgY3V0IDogJyd9Ij4ke0lDT05ba119PGI+JHtjb3VudChmZiwgayl9PC9iPiR7Y3V0ID8gYDxzbWFsbD7ij7Ake2N1dC5yZXBsYWNlKC8gPyhbQVBdKU0vaSwgKG0sIHgpID0+IHgudG9Mb3dlckNhc2UoKSl9PC9zbWFsbD5gIDogJyd9PC9zcGFuPmA7IH0pLmpvaW4oJycpfQogICAgICA8c3BhbiBjbGFzcz0ic3N4My1jIHNzeDMtdG90IiB0aXRsZT0iJHtNKCdmdWxmaWxsbWVudCcpID8gJ0Z1bGZpbGxtZW50JyA6ICdQYXF1ZXRlcyd9OiAke2ZmUHJpbnRlZH0gaW1wcmVzYXMgwrcgJHtmZi5sZW5ndGggLSBmZlByaW50ZWR9IHBvciBpbXByaW1pciI+8J+nujxiPiR7ZmYubGVuZ3RofTwvYj4ke2ZmLmxlbmd0aCAtIGZmUHJpbnRlZCA/IGA8c21hbGw+JHtmZi5sZW5ndGggLSBmZlByaW50ZWR9IGZhbHRhbjwvc21hbGw+YCA6ICc8c21hbGw+4pyTPC9zbWFsbD4nfTwvc3Bhbj4KICAgICAgPHNwYW4gY2xhc3M9InNzeDMtYyBzc3gzLWFsbCIgdGl0bGU9IlRvZGFzIGxhcyBldGlxdWV0YXMgZGVsIGTDrWEke2V4Y2wgPyBgIMK3ICR7ZXhjbH0gYmxvcXVlYWRhcyBhbCAxMDAlYCA6ICcnfSI+zqM8Yj4ke2xpc3QubGVuZ3RofTwvYj4ke2V4Y2wgPyBgPHNtYWxsPiR7ZXhjbH0gYmxvcS48L3NtYWxsPmAgOiAnJ308L3NwYW4+CiAgICA8L2Rpdj4KICAgICAgPHNwYW4gY2xhc3M9InNzeC1yIj4KICAgICAgPGJ1dHRvbiBjbGFzcz0ic3N4LW1vcmUiIGRhdGEtaGlzdD0iMSI+JHt1aS5zaGlwSGlzdCA/ICdPY3VsdGFyIGhpc3RvcmlhbCDilrQnIDogJ0hpc3RvcmlhbCBwb3IgZMOtYSDilr4nfTwvYnV0dG9uPgogICAgICAke2J5U2VsbGVyLmxlbmd0aCA/IGA8YnV0dG9uIGNsYXNzPSJzc3gtbW9yZSIgZGF0YS1tb3JlPSIxIj4ke3VpLnNoaXBPcGVuID8gJ09jdWx0YXIgY3VlbnRhcyDilrQnIDogJ1BvciBjdWVudGEg4pa+J308L2J1dHRvbj5gIDogJyd9CiAgICAgIDxzcGFuIGNsYXNzPSJzc3gtc3ciPjxidXR0b24gZGF0YS1zZD0idG9kYXkiIGFyaWEtcHJlc3NlZD0iJHt1aS5zaGlwRGF5ID09PSAndG9kYXknfSI+SG95PC9idXR0b24+PGJ1dHRvbiBkYXRhLXNkPSJuZXh0IiBhcmlhLXByZXNzZWQ9IiR7dWkuc2hpcERheSAhPT0gJ3RvZGF5J30iPlByw7N4aW1vPC9idXR0b24+PC9zcGFuPjwvc3Bhbj4KICAgIDwvZGl2PgogICAgJHtieVNlbGxlci5sZW5ndGggJiYgdWkuc2hpcE9wZW4gPyBgPGRpdiBjbGFzcz0ic3N4LWRldCI+JHtjb3VudFRhYmxlKGJ5U2VsbGVyLm1hcCgoW24sICwgYWxsXSkgPT4gKHsgbGFiZWw6IGVzYyhuKSwgZmY6IGNudEJ5KGFsbC5maWx0ZXIobyA9PiAhbm9uZUZmKG8pKSksIGJsOiBjbnRCeShhbGwuZmlsdGVyKG5vbmVGZikpIH0pKS5jb25jYXQoW3sgbGFiZWw6ICc8Yj5Ub3RhbDwvYj4nLCBmZjogY250QnkoZmYpLCBibDogY250QnkobGlzdC5maWx0ZXIobm9uZUZmKSksIGNsczogJ3NzLXN1bScgfV0pLCAnQ3VlbnRhJyl9PC9kaXY+YCA6ICcnfQogICAgJHt1aS5zaGlwSGlzdCA/IGA8ZGl2IGNsYXNzPSJzc3gtZGV0IiBpZD0ic2hpcEhpc3QiPjxkaXYgY2xhc3M9Im11dGVkIiBzdHlsZT0icGFkZGluZzo2cHggMnB4Ij5DYXJnYW5kbyBoaXN0b3JpYWzigKY8L2Rpdj48L2Rpdj5gIDogJyd9YDsKICBpZiAodWkuc2hpcEhpc3QpIGRyYXdTaGlwSGlzdG9yeSgpOwogIGJveC5vbmNsaWNrID0gZSA9PiB7IGlmIChlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1oaXN0XScpKSB7IHVpLnNoaXBIaXN0ID0gIXVpLnNoaXBIaXN0OyBkcmF3U2hpcFN1bW1hcnkoKTsgcmV0dXJuOyB9IGlmIChlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1tb3JlXScpKSB7IHVpLnNoaXBPcGVuID0gIXVpLnNoaXBPcGVuOyBkcmF3U2hpcFN1bW1hcnkoKTsgcmV0dXJuOyB9IGNvbnN0IGIgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1zZF0nKTsgaWYgKCFiKSByZXR1cm47IHVpLnNoaXBEYXkgPSBiLmRhdGFzZXQuc2Q7IGRyYXdTaGlwU3VtbWFyeSgpOyB9Owp9CgpmdW5jdGlvbiBkcmF3Um93cyhmcmVzaCA9IFtdKSB7CiAgaWYgKCEkKCcjdGFic0JpZycpKSByZXR1cm47CiAgZHJhd1NoaXBTdW1tYXJ5KCk7CiAgY29uc3QgaW5UYWIgPSB0ID0+IG9yZGVycy5maWx0ZXIobyA9PiBpblRhYkZuKG8sIHQpICYmIG1rTWF0Y2gobywgdWkubWspICYmIHNlbGxlck9rKG8pKTsKICAvLyB0b2RhcyBsYXMgc2VjY2lvbmVzIHBhcmEgdG9kb3M7IHNpbiBlbCBtw7NkdWxvIEZ1bGZpbGxtZW50IG5vIGhheSBibG9xdWVhZGFzIG5pIGRlc2Jsb3F1ZWFkYXMKICBjb25zdCB0YWJzTGlzdCA9IE0oJ2Z1bGZpbGxtZW50JykgPyBUQUJTIDogVEFCUy5maWx0ZXIoKFtrXSkgPT4gIVsndW5ibG9ja2VkJywgJ2Jsb2NrZWQnLCAnYmxvY2tlZFByaW50ZWQnXS5pbmNsdWRlcyhrKSk7CiAgaWYgKCF0YWJzTGlzdC5zb21lKChba10pID0+IGsgPT09IHVpLnRhYikpIHVpLnRhYiA9ICd0b2RheSc7CiAgJCgnI3RhYnNCaWcnKS5pbm5lckhUTUwgPSB0YWJzTGlzdC5tYXAoKFtrLCBuLCBzdWIsIGljXSkgPT4gYDxidXR0b24gY2xhc3M9InRiIHRiLSR7a30gJHsoayA9PT0gJ3dhcm4nIHx8IGsgPT09ICdsYXRlJykgJiYgaW5UYWIoaykubGVuZ3RoID8gJ3RiLWFsZXJ0JyA6ICcnfSIgZGF0YS10YWIyPSIke2t9IiBhcmlhLXByZXNzZWQ9IiR7dWkudGFiID09PSBrfSI+PHNwYW4gY2xhc3M9InRiLWljIj4ke2ljfTwvc3Bhbj48c3Bhbj48Yj4ke2luVGFiKGspLmxlbmd0aH08L2I+PHNwYW4gY2xhc3M9InRiLW4iPiR7bn08L3NwYW4+PHNtYWxsPiR7c3VifTwvc21hbGw+PC9zcGFuPjwvYnV0dG9uPmApLmpvaW4oJycpOwogIC8vIGxhcyBjYW50aWRhZGVzIHJlc3BldGFuIGVsIHZlbmRlZG9yIGVsZWdpZG8geSBsYSBiw7pzcXVlZGEKICBjb25zdCBxT2sgPSBvID0+ICF1aS5xIHx8IG8ub3JkZXJfbnVtYmVyLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXModWkucSkgfHwgKG8uY3VzdG9tZXIgfHwgJycpLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXModWkucSkgfHwgby5pdGVtcy5zb21lKGkgPT4gW2kuc2t1LCBpLnB1Yl9pZCwgaS5uYW1lXS5qb2luKCcgJykudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyh1aS5xKSk7CiAgY29uc3QgbWtDb3VudCA9IG1rID0+IG9yZGVycy5maWx0ZXIobyA9PiBpblRhYkZuKG8sIHVpLnRhYikgJiYgbWtNYXRjaChvLCBtaykgJiYgc2VsbGVyT2sobykgJiYgcU9rKG8pKS5sZW5ndGg7CiAgY29uc3QgY2hpcCA9IChbaywgbl0pID0+IGA8YnV0dG9uIGNsYXNzPSJjaGlwIGNoaXAtJHtrfSIgZGF0YS1taz0iJHtrfSIgYXJpYS1wcmVzc2VkPSIke3VpLm1rID09PSBrfSI+JHtufSA8c3BhbiBjbGFzcz0iY250Ij4ke21rQ291bnQoayl9PC9zcGFuPjwvYnV0dG9uPmA7CiAgaWYgKHVpLm1rID09PSAnbWwnKSB1aS5tayA9ICdhbGwnOyAvLyBlbCBmaWx0cm8gIk1lcmNhZG8gTGlicmUiIHNlIHF1aXTDszogZXN0w6Egc2VwYXJhZG8gZW4gQWdlbmNpYSB5IEZsZXgKICAvLyBzb2xvIGxvcyBjYW5hbGVzIGNvbmVjdGFkb3MgKG8gY29uIHBlZGlkb3MgZW4gbGEgYmFuZGVqYSkKICBjb25zdCB0cmF5TWtzID0gbWtMaXN0KG9yZGVycy5tYXAobyA9PiBvLm1hcmtldHBsYWNlKSk7CiAgaWYgKHVpLm1rICE9PSAnYWxsJyAmJiAhdHJheU1rcy5pbmNsdWRlcyhTdHJpbmcodWkubWspLnNwbGl0KCctJylbMF0pKSB1aS5tayA9ICdhbGwnOwogICQoJyNta0NoaXBzJykuaW5uZXJIVE1MID0gW1snYWxsJywgJ1RvZG9zJ11dLm1hcChjaGlwKS5qb2luKCcnKSArICh0cmF5TWtzLmluY2x1ZGVzKCdtbCcpID8gYDxzcGFuIGNsYXNzPSJjaGlwLWdycCI+JHtbWydtbC1hZ2VuY2lhJywgJ/Cfk6YgTUwgQWdlbmNpYSddLCBbJ21sLWZsZXgnLCAn4pqhIE1MIEZsZXgnXV0ubWFwKGNoaXApLmpvaW4oJycpfTwvc3Bhbj5gIDogJycpICsgdHJheU1rcy5maWx0ZXIoayA9PiBrICE9PSAnbWwnKS5tYXAoayA9PiBbaywgYCR7TUtfSUNPTltrXSB8fCAnJ30gJHtNS1trXX1gXSkubWFwKGNoaXApLmpvaW4oJycpOwogIGNvbnN0IGJwID0gJCgnI2JwRmlsdGVyJyk7CiAgaWYgKGJwKSB7CiAgICBicC5oaWRkZW4gPSAhWydibG9ja2VkUHJpbnRlZCcsICdibG9ja2VkJywgJ3VuYmxvY2tlZCddLmluY2x1ZGVzKHVpLnRhYik7CiAgICBpZiAodWkudGFiID09PSAndW5ibG9ja2VkJykgewogICAgICAvLyBEZXNibG9xdWVhZGFzOiBzZXBhcmFyIGxhcyBxdWUgc2UgZGVzcGFjaGFuIGhveSBkZSBsYXMgZGUgcHLDs3hpbW9zIGTDrWFzIChwYXJhIHRvZG9zIGxvcyB1c3VhcmlvcykKICAgICAgY29uc3QgYmFzZSA9IHZpc2libGVJbigndW5ibG9ja2VkJyksIG5Ub2RheSA9IGJhc2UuZmlsdGVyKGlzRm9yVG9kYXkpLmxlbmd0aDsKICAgICAgY29uc3QgYnlEYXkgPSBiYXNlLmZpbHRlcihvID0+IHVpLnVkZiA9PT0gJ2FsbCcgfHwgKHVpLnVkZiA9PT0gJ3RvZGF5JykgPT09IGlzRm9yVG9kYXkobykpLCBuRmlsbCA9IGJ5RGF5LmZpbHRlcihvID0+IGJwS2luZChvKSA9PT0gJ2ZpbGwnKS5sZW5ndGg7CiAgICAgIGJwLmlubmVySFRNTCA9IGA8c3BhbiBjbGFzcz0iYnBmLXQiPkRlc3BhY2hvOjwvc3Bhbj5gICsgW1snYWxsJywgJ1RvZGFzJywgYmFzZS5sZW5ndGhdLCBbJ3RvZGF5JywgJ0Rlc3BhY2hhciBob3knLCBuVG9kYXldLCBbJ25leHQnLCAnUHLDs3hpbW9zIGTDrWFzJywgYmFzZS5sZW5ndGggLSBuVG9kYXldXQogICAgICAgIC5tYXAoKFtrLCBuLCBjXSkgPT4gYDxidXR0b24gY2xhc3M9ImNoaXAgJHtrID09PSAndG9kYXknID8gJ2NoaXAtZmlsbCcgOiAnJ30iIGRhdGEtdWRmPSIke2t9IiBhcmlhLXByZXNzZWQ9IiR7dWkudWRmID09PSBrfSI+JHtufSA8c3BhbiBjbGFzcz0iY250Ij4ke2N9PC9zcGFuPjwvYnV0dG9uPmApLmpvaW4oJycpICsKICAgICAgICBgPHNwYW4gY2xhc3M9ImJwZi1zZXAiPjwvc3Bhbj48c3BhbiBjbGFzcz0iYnBmLXQiPkZ1bGZpbGxtZW50Ojwvc3Bhbj5gICsgW1snYWxsJywgJ1RvZGFzJywgYnlEYXkubGVuZ3RoXSwgWydmaWxsJywgJ0RlYmUgcmVsbGVuYXInLCBuRmlsbF0sIFsnbm9uZScsICdOYWRhIHBhcmEgcmVsbGVuYXInLCBieURheS5sZW5ndGggLSBuRmlsbF1dCiAgICAgICAgLm1hcCgoW2ssIG4sIGNdKSA9PiBgPGJ1dHRvbiBjbGFzcz0iY2hpcCAke2sgPT09ICdmaWxsJyA/ICdjaGlwLWZpbGwnIDogJyd9IiBkYXRhLXViZj0iJHtrfSIgYXJpYS1wcmVzc2VkPSIke3VpLnViZiA9PT0ga30iPiR7bn0gPHNwYW4gY2xhc3M9ImNudCI+JHtjfTwvc3Bhbj48L2J1dHRvbj5gKS5qb2luKCcnKTsKICAgICAgYnAub25jbGljayA9IGUgPT4geyBjb25zdCBiID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtdWRmXSxbZGF0YS11YmZdJyk7IGlmICghYikgcmV0dXJuOyBpZiAoYi5kYXRhc2V0LnVkZikgdWkudWRmID0gYi5kYXRhc2V0LnVkZjsgZWxzZSB1aS51YmYgPSBiLmRhdGFzZXQudWJmOyBkcmF3Um93cygpOyB9OwogICAgfSBlbHNlIGlmICh1aS50YWIgPT09ICdibG9ja2VkJykgewogICAgICAvLyBCbG9xdWVhZGFzOiBzZXBhcmFyIGxhcyBxdWUgc2UgZGVzcGFjaGFuIGhveSBkZSBsYXMgZGUgcHLDs3hpbW9zIGTDrWFzCiAgICAgIGNvbnN0IGJhc2UgPSB2aXNpYmxlSW4oJ2Jsb2NrZWQnKSwgblRvZGF5ID0gYmFzZS5maWx0ZXIoaXNGb3JUb2RheSkubGVuZ3RoOwogICAgICBjb25zdCBieURheSA9IGJhc2UuZmlsdGVyKG8gPT4gdWkuYmRmID09PSAnYWxsJyB8fCAodWkuYmRmID09PSAndG9kYXknKSA9PT0gaXNGb3JUb2RheShvKSksIG5GaWxsID0gYnlEYXkuZmlsdGVyKG8gPT4gYnBLaW5kKG8pID09PSAnZmlsbCcpLmxlbmd0aDsKICAgICAgYnAuaW5uZXJIVE1MID0gYDxzcGFuIGNsYXNzPSJicGYtdCI+RGVzcGFjaG86PC9zcGFuPmAgKyBbWydhbGwnLCAnVG9kYXMnLCBiYXNlLmxlbmd0aF0sIFsndG9kYXknLCAnRGVzcGFjaGFyIGhveScsIG5Ub2RheV0sIFsnbmV4dCcsICdQcsOzeGltb3MgZMOtYXMnLCBiYXNlLmxlbmd0aCAtIG5Ub2RheV1dCiAgICAgICAgLm1hcCgoW2ssIG4sIGNdKSA9PiBgPGJ1dHRvbiBjbGFzcz0iY2hpcCAke2sgPT09ICd0b2RheScgPyAnY2hpcC1maWxsJyA6ICcnfSIgZGF0YS1iZGY9IiR7a30iIGFyaWEtcHJlc3NlZD0iJHt1aS5iZGYgPT09IGt9Ij4ke259IDxzcGFuIGNsYXNzPSJjbnQiPiR7Y308L3NwYW4+PC9idXR0b24+YCkuam9pbignJykgKwogICAgICAgIGA8c3BhbiBjbGFzcz0iYnBmLXNlcCI+PC9zcGFuPjxzcGFuIGNsYXNzPSJicGYtdCI+RnVsZmlsbG1lbnQ6PC9zcGFuPmAgKyBbWydhbGwnLCAnVG9kYXMnLCBieURheS5sZW5ndGhdLCBbJ2ZpbGwnLCAnRGViZSByZWxsZW5hcicsIG5GaWxsXSwgWydub25lJywgJ05hZGEgcGFyYSBlbCBmdWxmaWxsbWVudCcsIGJ5RGF5Lmxlbmd0aCAtIG5GaWxsXV0KICAgICAgICAubWFwKChbaywgbiwgY10pID0+IGA8YnV0dG9uIGNsYXNzPSJjaGlwICR7ayA9PT0gJ2ZpbGwnID8gJ2NoaXAtZmlsbCcgOiAnJ30iIGRhdGEtYmJmPSIke2t9IiBhcmlhLXByZXNzZWQ9IiR7dWkuYmJmID09PSBrfSI+JHtufSA8c3BhbiBjbGFzcz0iY250Ij4ke2N9PC9zcGFuPjwvYnV0dG9uPmApLmpvaW4oJycpOwogICAgICBicC5vbmNsaWNrID0gZSA9PiB7IGNvbnN0IGIgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1iZGZdLFtkYXRhLWJiZl0nKTsgaWYgKCFiKSByZXR1cm47IGlmIChiLmRhdGFzZXQuYmRmKSB1aS5iZGYgPSBiLmRhdGFzZXQuYmRmOyBlbHNlIHVpLmJiZiA9IGIuZGF0YXNldC5iYmY7IGRyYXdSb3dzKCk7IH07CiAgICB9IGVsc2UgaWYgKCFicC5oaWRkZW4pIHsKICAgICAgY29uc3QgYmFzZSA9IHZpc2libGVJbignYmxvY2tlZFByaW50ZWQnKSwgbkZpbGwgPSBiYXNlLmZpbHRlcihvID0+IGJwS2luZChvKSA9PT0gJ2ZpbGwnKS5sZW5ndGg7CiAgICAgIGJwLmlubmVySFRNTCA9IGA8c3BhbiBjbGFzcz0iYnBmLXQiPk1vc3RyYXI6PC9zcGFuPmAgKyBbWydhbGwnLCAnVG9kYXMnLCBiYXNlLmxlbmd0aF0sIFsnZmlsbCcsICdFbCBmdWxmaWxsbWVudCBkZWJlIHJlbGxlbmFyJywgbkZpbGxdLCBbJ25vbmUnLCAnTmFkYSBwYXJhIGVsIGZ1bGZpbGxtZW50JywgYmFzZS5sZW5ndGggLSBuRmlsbF1dCiAgICAgICAgLm1hcCgoW2ssIG4sIGNdKSA9PiBgPGJ1dHRvbiBjbGFzcz0iY2hpcCAke2sgPT09ICdmaWxsJyA/ICdjaGlwLWZpbGwnIDogJyd9IiBkYXRhLWJwZj0iJHtrfSIgYXJpYS1wcmVzc2VkPSIke3VpLmJwZiA9PT0ga30iPiR7bn0gPHNwYW4gY2xhc3M9ImNudCI+JHtjfTwvc3Bhbj48L2J1dHRvbj5gKS5qb2luKCcnKTsKICAgICAgYnAub25jbGljayA9IGUgPT4geyBjb25zdCBiID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtYnBmXScpOyBpZiAoIWIpIHJldHVybjsgdWkuYnBmID0gYi5kYXRhc2V0LmJwZjsgZHJhd1Jvd3MoKTsgfTsKICAgIH0KICB9CiAgY29uc3Qgcm93cyA9IHZpc2libGUoKTsKICBpZiAoIXJvd3MubGVuZ3RoKSB7CiAgICBjb25zdCBtc2cgPSB7IHRvZGF5OiAnTm8gaGF5IGV0aXF1ZXRhcyBwb3IgaW1wcmltaXIgcGFyYSBob3kuIExhcyB2ZW50YXMgbnVldmFzICh5IGxvcyBGbGV4IHF1ZSBlbnRyZW4gZHVyYW50ZSBlbCBkw61hKSBhcGFyZWNlbiBhcXXDrSBzb2xhcy4nLCB1cGNvbWluZzogJ05vIGhheSBldGlxdWV0YXMgcGFyYSBsb3MgcHLDs3hpbW9zIGTDrWFzLicsIHdhaXRpbmc6ICdOaW5ndW5hIHZlbnRhIGVzdMOhIGVzcGVyYW5kbyBldGlxdWV0YS4nLCBwcmludGVkOiAnVG9kYXbDrWEgbm8gaGF5IGV0aXF1ZXRhcyBpbXByZXNhcyBwYXJhIGVzdGUgZGVzcGFjaG8uJywgYmxvY2tlZDogJ05vIGhheSBwZWRpZG9zIGJsb3F1ZWFkb3MuJywgdW5ibG9ja2VkOiAnTm8gaGF5IGV0aXF1ZXRhcyBkZXNibG9xdWVhZGFzIHBlbmRpZW50ZXMuIEN1YW5kbyBkZXNibG9xdWVlcyB1bmEsIGFwYXJlY2UgYXF1w60gaGFzdGEgcXVlIHNlIGltcHJpbWEuJywgd2VlazogJ0VzdGEgc2VtYW5hIGHDum4gbm8gc2UgaW1wcmltZW4gZXRpcXVldGFzLicsIGJsb2NrZWRQcmludGVkOiAnTm8gaGF5IGV0aXF1ZXRhcyBibG9xdWVhZGFzIGltcHJlc2FzIHBhcmEgZXN0ZSBkZXNwYWNoby4nLCBwcmludGVkNzogJ05vIGhheSBldGlxdWV0YXMgaW1wcmVzYXMgZW4gbG9zIMO6bHRpbW9zIDcgZMOtYXMuJywgdHJhbnNpdDogJ05vIGhheSBwYXF1ZXRlcyBlbiBjYW1pbm86IHRvZG8gbG8gaW1wcmVzbyB5YSBmdWUgcmVjZXBjaW9uYWRvIG8gZW50cmVnYWRvLicsIGxhdGU6ICdObyBoYXkgcGFxdWV0ZXMgYXRyYXNhZG9zLiBBcXXDrSBhcGFyZWNlbiBsb3MgcXVlIG5vIHNhbGllcm9uIGFudGVzIGRlbCBob3JhcmlvIGRlbCBtYXJrZXRwbGFjZS4nLCB3YXJuOiAnVG9kbyBhIHRpZW1wbyDwn46JLiBBcXXDrSBhcGFyZWNlIGN1YWxxdWllciBwYXF1ZXRlIGFsIHF1ZSBsZSBxdWVkZW4gMzAgbWludXRvcyBvIG1lbm9zIHBhcmEgc3UgcGxhem8sIHBhcmEgYWxjYW56YXIgYSBzb2x1Y2lvbmFybG8uJyB9W3VpLnRhYl07CiAgICAkKCcjbGlzdCcpLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJlbXB0eSI+JHtFTVBUWV9TVkd9PGRpdj4ke21zZ308L2Rpdj48L2Rpdj5gOwogICAgZHJhd0FjdGlvbmJhcigpOyByZXR1cm47CiAgfQogIGxldCBsYXN0RGF5ID0gJycsIGh0bWwgPSAnJzsKICBmb3IgKGNvbnN0IG8gb2Ygcm93cykgewogICAgY29uc3QgZCA9IHRzKG8pLCBkYXkgPSBkYXlMYWJlbChkKTsKICAgIGlmIChkYXkgIT09IGxhc3REYXkpIHsgaHRtbCArPSBgPGRpdiBjbGFzcz0iZGF5aGVhZCI+JHtlc2MoZGF5KX08L2Rpdj5gOyBsYXN0RGF5ID0gZGF5OyB9CiAgICBjb25zdCBzdCA9IG8uc3RhdGU7CiAgICBsZXQgbm90ZSA9ICcnLCBidG4gPSAnJzsKICAgIGNvbnN0IG1pbmUgPSBvLm93biAhPT0gZmFsc2U7CiAgICBpZiAoc3QgPT09ICdyZWFkeScpIGJ0biA9IGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIGRhdGEtYWN0PSJwcmludCIgZGF0YS1pZD0iJHtvLmlkfSI+JHtJLnByaW50fUltcHJpbWlyPC9idXR0b24+YDsKICAgIGlmIChzdCA9PT0gJ3ByaW50ZWQnKSB7IG5vdGUgPSBgPHNwYW4gY2xhc3M9Im5vdGUiPkltcHJlc2EgJHtlc2MoZm10VGltZShvLnByaW50ZWRfYXQpKX0ke28ucHJpbnRlZF9ieSA/IGAgwrcgPGI+SW1wcmltacOzOiAke2VzYyhvLnByaW50ZWRfYnkpfTwvYj5gIDogJyd9PC9zcGFuPmA7IGJ0biA9IGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXJlcHJpbnQiIGRhdGEtYWN0PSJyZXByaW50IiBkYXRhLWlkPSIke28uaWR9Ij4ke0kucHJpbnR9Vm9sdmVyIGEgaW1wcmltaXI8L2J1dHRvbj5gICsgKG1pbmUgPyBgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1hY3Q9InVucHJpbnQiIGRhdGEtaWQ9IiR7by5pZH0iPk1hcmNhciBjb21vIG5vIGltcHJlc2E8L2J1dHRvbj5gIDogJycpOyB9CiAgICBpZiAoc3QgPT09ICdzaGlwcGVkJykgbm90ZSA9IGA8c3BhbiBjbGFzcz0ibm90ZSI+WWEgc2FsacOzIMK3IDxiPkltcHJpbWnDszogJHtlc2Moby5wcmludGVkX2J5IHx8ICdNYXJrZXRwbGFjZScpfTwvYj48L3NwYW4+YDsKICAgIGlmIChzdCA9PT0gJ3dhaXRpbmcnIHx8IHN0ID09PSAnZXJyb3InKSB7IG5vdGUgPSBgPHNwYW4gY2xhc3M9Im5vdGUgJHtzdCA9PT0gJ2Vycm9yJyA/ICdiYWQnIDogJyd9Ij4ke2VzYyhvLmVycm9yIHx8IG8ud2FpdGluZ19ub3RlIHx8ICdFbCBtYXJrZXRwbGFjZSBhw7puIG5vIGxpYmVyYSBsYSBldGlxdWV0YScpfTwvc3Bhbj5gOyBidG4gPSBgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1hY3Q9InJldHJ5IiBkYXRhLWlkPSIke28uaWR9Ij5SZWludGVudGFyPC9idXR0b24+YDsgfQogICAgY29uc3Qgbm9uZUZvckZmID0gKG8ubWlzc2luZ19pZHggfHwgW10pLmxlbmd0aCA+IDAgJiYgKG8ubWlzc2luZ19pZHggfHwgW10pLmxlbmd0aCA+PSBvLml0ZW1zLmxlbmd0aDsKICAgIGlmIChzdCA9PT0gJ2Jsb2NrZWQnKSB7IG5vdGUgPSBub25lRm9yRmYgPyAnPHNwYW4gY2xhc3M9Im5vcHJpbnQiPlJPTkcgWElOIE5PIElNUFJJTUlSIEVUSVFVRVRBPC9zcGFuPicgOiAnPHNwYW4gY2xhc3M9Im5vdGUiPlRpZW5lIHByb2R1Y3RvcyBxdWUgbm8gdmFuIGFsIGZ1bGZpbGxtZW50OiBtYW5kYSBzb2xvIGxvcyBtYXJjYWRvcyBlbiB2ZXJkZTwvc3Bhbj4nOyBpZiAobWluZSkgYnRuID0gYDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgZGF0YS1hY3Q9InVuYmxvY2siIGRhdGEtaWQ9IiR7by5pZH0iPiR7SS5sb2NrfURlc2Jsb3F1ZWFyIGV0aXF1ZXRhPC9idXR0b24+YDsgfQogICAgaWYgKG8udW5ibG9ja2VkX2J5ICYmIG8uYmxvY2tfbm8gJiYgc3QgIT09ICdibG9ja2VkJykgewogICAgICBub3RlICs9IGA8c3BhbiBjbGFzcz0ibm90ZSI+PGI+UGVkaWRvIGluY29tcGxldG88L2I+OiBlbCBmdWxmaWxsbWVudCBtYW5kYSBsbyBzdXlvIHkgc2UgcmVsbGVuYSBsbyBtYXJjYWRvICJGQUxUQSIgwrcgRGVzYmxvcXVlw7M6ICR7ZXNjKG8udW5ibG9ja2VkX2J5KX08L3NwYW4+YDsKICAgICAgaWYgKG1pbmUgJiYgWydyZWFkeScsICd3YWl0aW5nJywgJ2Vycm9yJ10uaW5jbHVkZXMoc3QpKSBidG4gKz0gYDxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtYWN0PSJyZWJsb2NrIiBkYXRhLWlkPSIke28uaWR9Ij5Wb2x2ZXIgYSBibG9xdWVhcjwvYnV0dG9uPmA7CiAgICB9CiAgICBpZiAoby5wcmV2X3ByaW50ICYmIG8ucHJldl9wcmludC5hdCkgbm90ZSArPSBgPHNwYW4gY2xhc3M9Im5vdGUgcHJldnByaW50Ij7ihrogWWEgZnVlIGltcHJlc2EgcG9yIDxiPiR7ZXNjKG8ucHJldl9wcmludC5ieSB8fCAnYWxndWllbicpfTwvYj4gZWwgJHtlc2MoZm10VGltZShvLnByZXZfcHJpbnQuYXQpKX08L3NwYW4+YDsKICAgIGlmIChvLm1sX2Rvd25sb2FkZWQpIG5vdGUgKz0gJzxzcGFuIGNsYXNzPSJub3RlIiB0aXRsZT0iTWVyY2FkbyBMaWJyZSBpbmRpY2EgcXVlIGxhIGV0aXF1ZXRhIHlhIHNlIGRlc2NhcmfDsyAoZGVzZGUgTWVyY2FkbyBMaWJyZSB1IG90cmEgaGVycmFtaWVudGEpLiBFbiBFdGlxdWV0YUh1YiBzaWd1ZSBwb3IgaW1wcmltaXIuIj7ik5ggRGVzY2FyZ2FkYSBlbiBNZXJjYWRvIExpYnJlPC9zcGFuPic7CiAgICBpZiAobGF0ZU5vdyhvKSkgbm90ZSA9IGA8c3BhbiBjbGFzcz0ibGF0ZXRhZyI+QVRSQVNBREEke28ubGF0ZV9tbCA/ICcgwrcgTWVyY2FkbyBMaWJyZSBsYSBtYXJjYSBhdHJhc2FkYScgOiAnJ30ke28uZGVhZGxpbmUgfHwgby5kbCA/ICcgwrcgcGxhem8gJyArIGVzYyhmbXRUaW1lKG8uZGVhZGxpbmUgfHwgby5kbCkpIDogJyd9PC9zcGFuPmAgKyBub3RlOwogICAgZWxzZSBpZiAoaXNXYXJuKG8pKSBub3RlID0gYDxzcGFuIGNsYXNzPSJ3YXJudGFnIj7ij7MgQURWRVJURU5DSUEgwrcgcXVlZGFuICR7bWluc0xlZnQobyl9IG1pbiDCtyBwbGF6byAke2VzYyhmbXRUaW1lKG8uZGwpKX08L3NwYW4+YCArIG5vdGU7CiAgICBodG1sICs9IGA8ZGl2IGNsYXNzPSJvcm93IHN0LSR7c3R9ICR7ZnJlc2guaW5jbHVkZXMoby5pZCkgPyAnaXMtbmV3JyA6ICcnfSI+CiAgICAgIDxkaXYgY2xhc3M9Im9jLWNoZWNrIj4ke3ByaW50YWJsZShvKSB8fCAoc3QgPT09ICdwcmludGVkJyAmJiBvLm93biAhPT0gZmFsc2UpID8gYDxpbnB1dCB0eXBlPSJjaGVja2JveCIgY2xhc3M9ImNiIiBkYXRhLWlkPSIke28uaWR9IiAke3NlbGVjdGVkLmhhcyhvLmlkKSA/ICdjaGVja2VkJyA6ICcnfSBhcmlhLWxhYmVsPSJTZWxlY2Npb25hciAke2VzYyhvLm9yZGVyX251bWJlcil9Ij5gIDogc3QgPT09ICdibG9ja2VkJyA/IChtaW5lID8gYDxpbnB1dCB0eXBlPSJjaGVja2JveCIgY2xhc3M9ImNiIiBkYXRhLWlkPSIke28uaWR9IiAke3NlbGVjdGVkLmhhcyhvLmlkKSA/ICdjaGVja2VkJyA6ICcnfSBhcmlhLWxhYmVsPSJTZWxlY2Npb25hciAke2VzYyhvLm9yZGVyX251bWJlcil9IHBhcmEgZGVzYmxvcXVlYXIiPmAgOiBgPHNwYW4gY2xhc3M9ImxvY2tjZWxsIj4ke0kubG9ja308L3NwYW4+YCkgOiAnJ308L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0ib2MtdGltZSI+PGI+JHtlc2MoYW1wbShkKSl9PC9iPjxzcGFuIGNsYXNzPSJtayAke28ubWFya2V0cGxhY2V9Ij4ke01LW28ubWFya2V0cGxhY2VdIHx8IG8ubWFya2V0cGxhY2V9PC9zcGFuPiR7by5zaGlwX3R5cGUgPyBgPHNwYW4gY2xhc3M9InNoaXB0eXBlIHN0LSR7ZXNjKG8uc2hpcF90eXBlLnRvTG93ZXJDYXNlKCkpfSI+JHtlc2Moby5zaGlwX3R5cGUpfTwvc3Bhbj5gIDogJyd9PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9Im9jLW1haW4iPiR7WydyZWFkeScsICd3YWl0aW5nJywgJ2Vycm9yJ10uaW5jbHVkZXMoc3QpICYmIGRpc3BhdGNoVGV4dChvKSA/IGA8ZGl2IGNsYXNzPSJkaXNwYXRjaCAke2Rpc3BhdGNoVGV4dChvKS5zdGFydHNXaXRoKCdBdHJhc2FkYScpID8gJ2xhdGUnIDogJyd9Ij4ke2VzYyhkaXNwYXRjaFRleHQobykpfTwvZGl2PmAgOiBkaXNwYXRjaFBsYWluKG8pID8gYDxkaXYgY2xhc3M9ImRpc3BhdGNoIGRvbmUiPiR7ZXNjKGRpc3BhdGNoUGxhaW4obykpfTwvZGl2PmAgOiAnJ308ZGl2IGNsYXNzPSJvYy10b3AiPiR7by5ibG9ja19ubyA/IGA8c3BhbiBjbGFzcz0iYmxvY2tubyIgdGl0bGU9Ik7Dum1lcm8gZGVsIHBlZGlkbyBpbmNvbXBsZXRvIj5OwrAgJHtvLmJsb2NrX25vfTwvc3Bhbj5gIDogJyd9JHtvLmN1c3RvbWVyID8gYDxzcGFuIGNsYXNzPSJjdXN0Ij4ke2VzYyhvLmN1c3RvbWVyKX08L3NwYW4+YCA6ICcnfTxiPiR7ZXNjKG8uc2VsbGVyKX08L2I+IDxzcGFuIGNsYXNzPSJtb25vIG11dGVkIj4jJHtlc2Moby5vcmRlcl9udW1iZXIpfTwvc3Bhbj48L2Rpdj4ke2l0ZW1zSFRNTChvKX0ke25vdGV9PC9kaXY+CiAgICAgIDxkaXYgY2xhc3M9Im9jLWFjdCI+JHtwaWxsKG8pfTxkaXYgY2xhc3M9InJvdy1hY3Rpb25zIj4ke2J0bn0ke28udHJhY2tfdXJsID8gYDxhIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBocmVmPSIke2VzYyhvLnRyYWNrX3VybCl9IiB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciI+U2VndWlyIGVudsOtbzwvYT5gIDogJyd9PC9kaXY+JHtvLnRyYWNraW5nID8gYDxzcGFuIGNsYXNzPSJub3RlIG1vbm8iPk7CsCBzZWd1aW1pZW50byAke2VzYyhvLnRyYWNraW5nKX08L3NwYW4+YCA6ICcnfTwvZGl2PgogICAgPC9kaXY+YDsKICB9CiAgJCgnI2xpc3QnKS5pbm5lckhUTUwgPSBodG1sOwogIGRyYXdBY3Rpb25iYXIoKTsKfQpmdW5jdGlvbiBkcmF3QWN0aW9uYmFyKCkgewogIGNvbnN0IGFiID0gJCgnI2FjdGlvbmJhcicpOyBpZiAoIWFiKSByZXR1cm47CiAgY29uc3QgUFJJTlRFRF9UQUJTID0gWydwcmludGVkJywgJ3RyYW5zaXQnLCAnYmxvY2tlZFByaW50ZWQnLCAncHJpbnRlZDcnLCAnbGF0ZSddOwogIGlmIChQUklOVEVEX1RBQlMuaW5jbHVkZXModWkudGFiKSkgewogICAgLy8gZW4gbGFzIHNlY2Npb25lcyBkZSBpbXByZXNhczogbWFyY2FyIHZhcmlhcyBhIGxhIHZleiBjb21vICJubyBpbXByZXNhcyIKICAgIGNvbnN0IG4gPSB2aXNpYmxlSW4odWkudGFiKS5maWx0ZXIobyA9PiBvLnN0YXRlID09PSAncHJpbnRlZCcgJiYgby5vd24gIT09IGZhbHNlKS5sZW5ndGgsIHMgPSBbLi4uc2VsZWN0ZWRdLmZpbHRlcihpZCA9PiBvcmRlcnMuZmluZChvID0+IG8uaWQgPT09IGlkICYmIG8uc3RhdGUgPT09ICdwcmludGVkJykpLmxlbmd0aDsKICAgIGFiLmhpZGRlbiA9ICFuOwogICAgYWIuaW5uZXJIVE1MID0gbiA/IGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUiIGRhdGEtYnVsaz0idW5wcmludCIgJHtzID8gJycgOiAnZGlzYWJsZWQnfT5NYXJjYXIgc2VsZWNjaW9uYWRhcyBjb21vIG5vIGltcHJlc2FzICgke3N9KTwvYnV0dG9uPgogICAgICA8c3BhbiBjbGFzcz0ic3BhY2VyIiBzdHlsZT0iZmxleDoxIj48L3NwYW4+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtYnVsaz0ic2VsYWxsIj5TZWxlY2Npb25hciB0b2RhczwvYnV0dG9uPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtYnVsaz0ibm9uZSI+UXVpdGFyIHNlbGVjY2nDs248L2J1dHRvbj5gIDogJyc7CiAgICByZXR1cm47CiAgfQogIGlmICh1aS50YWIgPT09ICdibG9ja2VkJykgewogICAgLy8gZGVzYmxvcXVlYXIgdmFyaWFzIGEgbGEgdmV6IChyZXNwZXRhIGxvcyBmaWx0cm9zIGRlIG1hcmtldHBsYWNlLCB2ZW5kZWRvciB5IGLDunNxdWVkYSkKICAgIGNvbnN0IG4gPSB2aXNpYmxlKCkuZmlsdGVyKG8gPT4gby5zdGF0ZSA9PT0gJ2Jsb2NrZWQnICYmIG8ub3duICE9PSBmYWxzZSkubGVuZ3RoLCBzID0gWy4uLnNlbGVjdGVkXS5maWx0ZXIoaWQgPT4gb3JkZXJzLmZpbmQobyA9PiBvLmlkID09PSBpZCAmJiBvLnN0YXRlID09PSAnYmxvY2tlZCcpKS5sZW5ndGg7CiAgICBhYi5oaWRkZW4gPSAhbjsKICAgIGFiLmlubmVySFRNTCA9IG4gPyBgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiBkYXRhLWJ1bGs9InVuYmxvY2siICR7cyA/ICcnIDogJ2Rpc2FibGVkJ30+JHtJLmxvY2t9RGVzYmxvcXVlYXIgc2VsZWNjaW9uYWRhcyAoJHtzfSk8L2J1dHRvbj4KICAgICAgPHNwYW4gY2xhc3M9InNwYWNlciIgc3R5bGU9ImZsZXg6MSI+PC9zcGFuPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWJ1bGs9InNlbGFsbCI+U2VsZWNjaW9uYXIgdG9kYXMgKCR7bn0pPC9idXR0b24+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1idWxrPSJub25lIj5RdWl0YXIgc2VsZWNjacOzbjwvYnV0dG9uPmAgOiAnJzsKICAgIHJldHVybjsKICB9CiAgaWYgKCFbJ3RvZGF5JywgJ3VwY29taW5nJywgJ3VuYmxvY2tlZCddLmluY2x1ZGVzKHVpLnRhYikpIHsgYWIuaW5uZXJIVE1MID0gJyc7IGFiLmhpZGRlbiA9IHRydWU7IHJldHVybjsgfQogIGFiLmhpZGRlbiA9IGZhbHNlOwogIC8vIHRvZG9zIGxvcyB1c3VhcmlvcyB0aWVuZW4gbG9zIG1pc21vcyBib3RvbmVzIChlbCB2ZW5kZWRvciBzb2xvIGltcHJpbWUgbGFzIHN1eWFzKQogIGNvbnN0IG4gPSB2aXNpYmxlKCkuZmlsdGVyKHByaW50YWJsZSkubGVuZ3RoLCBzID0gWy4uLnNlbGVjdGVkXS5maWx0ZXIoaWQgPT4gb3JkZXJzLnNvbWUobyA9PiBvLmlkID09PSBpZCAmJiBwcmludGFibGUobykpKS5sZW5ndGg7CiAgYWIuaW5uZXJIVE1MID0gYDxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgZGF0YS1idWxrPSJhbGwiICR7biA/ICcnIDogJ2Rpc2FibGVkJ30+JHtJLmRvd259SW1wcmltaXIgdG9kYXMgKCR7bn0pPC9idXR0b24+CiAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUiIGRhdGEtYnVsaz0ic2VsIiAke3MgPyAnJyA6ICdkaXNhYmxlZCd9PkltcHJpbWlyIHNlbGVjY2lvbmFkYXMgKCR7c30pPC9idXR0b24+CiAgICA8c3BhbiBjbGFzcz0ic3BhY2VyIiBzdHlsZT0iZmxleDoxIj48L3NwYW4+CiAgICA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWJ1bGs9InNlbGFsbCI+U2VsZWNjaW9uYXIgdG9kYXM8L2J1dHRvbj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWJ1bGs9Im5vbmUiPlF1aXRhciBzZWxlY2Npw7NuPC9idXR0b24+YDsKfQpmdW5jdGlvbiB1cGRhdGVTZWwoKSB7IGRyYXdBY3Rpb25iYXIoKTsgfQovLyBldGlxdWV0YXMgcXVlIGVzdGUgdXN1YXJpbyBwdWVkZSBpbXByaW1pciBkZSB1bmEgdmV6CmZ1bmN0aW9uIHByaW50YWJsZShvKSB7IHJldHVybiBvLnN0YXRlID09PSAncmVhZHknICYmIChtZS51c2VyLnJvbGUgIT09ICdzZWxsZXInIHx8IG8ub3duICE9PSBmYWxzZSk7IH0KZnVuY3Rpb24gc2VsbGVyT2tUb1ByaW50KG4pIHsgcmV0dXJuIG1lLnVzZXIucm9sZSAhPT0gJ3NlbGxlcicgfHwgY29uZmlybShgU2kgbGFzIGltcHJpbWVzIHTDuiwgJHtuID09PSAxID8gJ3F1ZWRhJyA6ICdxdWVkYW4nfSBjb21vICR7biA9PT0gMSA/ICdpbXByZXNhJyA6ICdpbXByZXNhcyd9IHBvciB0dSB0aWVuZGEgeSBlbCBmdWxmaWxsbWVudCAke24gPT09IDEgPyAnbGEnIDogJ2xhcyd9IHZlcsOhIGVuIHJvam8gY29tbyAiRXRpcXVldGEgaW1wcmVzYSIuIMK/SW1wcmltaXIgJHtufT9gKTsgfQovLyBhY3R1YWxpemEgbGEgcGFudGFsbGEgYWwgdGlybywgc2luIGVzcGVyYXIgYSBxdWUgZWwgc2Vydmlkb3IgbWFuZGUgbGEgbGlzdGEgbnVldmEKZnVuY3Rpb24gbWFya1VuYmxvY2tlZChpZHMpIHsKICBjb25zdCB3aG8gPSBtZS51c2VyLnJvbGUgPT09ICdhZG1pbicgPyAnQWRtaW5pc3RyYWRvcicgOiAobWUudXNlci5uYW1lIHx8ICdUw7onKTsKICBmb3IgKGNvbnN0IG8gb2Ygb3JkZXJzKSBpZiAoaWRzLmluY2x1ZGVzKG8uaWQpICYmIG8uc3RhdGUgPT09ICdibG9ja2VkJykgeyBvLnN0YXRlID0gJ3JlYWR5Jzsgby51bmJsb2NrZWRfYnkgPSBvLnVuYmxvY2tlZF9ieSB8fCB3aG87IH0KICBkcmF3Um93cygpOwp9CgpsZXQgZG93bmxvYWRpbmcgPSBmYWxzZTsKLy8gcGFudGFsbGEgZGUgInByb2Nlc2FuZG8iOiB1biBzb2wgYW5pbWFkbyBhbCBjZW50cm8gcXVlIG5vIHNlIHZhIGhhc3RhIHF1ZSB0ZXJtaW5hIGxhIGRlc2NhcmdhCmZ1bmN0aW9uIHNob3dTdW4obikgewogIGhpZGVTdW4odHJ1ZSk7CiAgY29uc3QgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTsKICBlbC5pZCA9ICdzdW5Mb2FkZXInOyBlbC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnc3RhdHVzJyk7IGVsLnNldEF0dHJpYnV0ZSgnYXJpYS1saXZlJywgJ3BvbGl0ZScpOwogIGNvbnN0IHJheXMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiAxMiB9LCAoXywgaSkgPT4gYDxyZWN0IHg9Ijk3IiB5PSI4IiB3aWR0aD0iNiIgaGVpZ2h0PSIyNiIgcng9IjMiIHRyYW5zZm9ybT0icm90YXRlKCR7aSAqIDMwfSAxMDAgMTAwKSIvPmApLmpvaW4oJycpOwogIGVsLmlubmVySFRNTCA9IGA8ZGl2IGNsYXNzPSJzdW4tY2FyZCI+CiAgICA8c3ZnIGNsYXNzPSJzdW4iIHZpZXdCb3g9IjAgMCAyMDAgMjAwIiBhcmlhLWhpZGRlbj0idHJ1ZSI+CiAgICAgIDxkZWZzPjxyYWRpYWxHcmFkaWVudCBpZD0ic3VuRyIgY3g9IjUwJSIgY3k9IjQ1JSIgcj0iNTUlIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiNGRkYzQjAiLz48c3RvcCBvZmZzZXQ9Ii41NSIgc3RvcC1jb2xvcj0iI0ZGQzkzQyIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iI0ZGOUYxQyIvPjwvcmFkaWFsR3JhZGllbnQ+PC9kZWZzPgogICAgICA8ZyBjbGFzcz0ic3VuLXJheXMiIGZpbGw9IiNGRkI2MjciPiR7cmF5c308L2c+CiAgICAgIDxjaXJjbGUgY2xhc3M9InN1bi1nbG93IiBjeD0iMTAwIiBjeT0iMTAwIiByPSI1NCIgZmlsbD0iI0ZGRDE2NiIgb3BhY2l0eT0iLjM1Ii8+CiAgICAgIDxjaXJjbGUgY3g9IjEwMCIgY3k9IjEwMCIgcj0iNDQiIGZpbGw9InVybCgjc3VuRykiLz4KICAgICAgPGcgY2xhc3M9InN1bi1mYWNlIiBmaWxsPSIjN0E0QjAwIj48Y2lyY2xlIGN4PSI4NSIgY3k9Ijk0IiByPSI0LjUiLz48Y2lyY2xlIGN4PSIxMTUiIGN5PSI5NCIgcj0iNC41Ii8+PHBhdGggZD0iTTg0IDExMCBxMTYgMTQgMzIgMCIgc3Ryb2tlPSIjN0E0QjAwIiBzdHJva2Utd2lkdGg9IjQiIGZpbGw9Im5vbmUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjwvZz4KICAgICAgPGNpcmNsZSBjeD0iNzQiIGN5PSIxMDYiIHI9IjYiIGZpbGw9IiNGRjhDNjkiIG9wYWNpdHk9Ii40NSIvPjxjaXJjbGUgY3g9IjEyNiIgY3k9IjEwNiIgcj0iNiIgZmlsbD0iI0ZGOEM2OSIgb3BhY2l0eT0iLjQ1Ii8+CiAgICA8L3N2Zz4KICAgIDxwIGNsYXNzPSJzdW4tbDEiPsKhRXJlcyB1biBnZW5pbywgdmFzIG11eSBiaWVuIGhveSE8L3A+CiAgICA8cCBjbGFzcz0ic3VuLWwyIj5Fc3RveSBwcm9jZXNhbmRvICR7biA+IDEgPyBgdHVzIDxiPiR7bn08L2I+IGV0aXF1ZXRhc2AgOiAndHUgZXRpcXVldGEnfTxzcGFuIGNsYXNzPSJzdW4tZG90cyI+PGk+LjwvaT48aT4uPC9pPjxpPi48L2k+PC9zcGFuPjwvcD4KICAgIDxwIGNsYXNzPSJzdW4tbDMiPlF1ZSB0ZW5nYXMgdW4gbGluZG8gZMOtYSDimIA8L3A+CiAgPC9kaXY+YDsKICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGVsKTsKICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4gZWwuY2xhc3NMaXN0LmFkZCgnb24nKSk7Cn0KZnVuY3Rpb24gaGlkZVN1bihub3cpIHsKICBjb25zdCBlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdW5Mb2FkZXInKTsgaWYgKCFlbCkgcmV0dXJuOwogIGlmIChub3cpIHsgZWwucmVtb3ZlKCk7IHJldHVybjsgfQogIGVsLnF1ZXJ5U2VsZWN0b3IoJy5zdW4tbDInKS5pbm5lckhUTUwgPSAnwqFMaXN0byEgVHVzIGV0aXF1ZXRhcyBzZSBkZXNjYXJnYXJvbic7CiAgZWwuY2xhc3NMaXN0LmFkZCgnZG9uZScpOwogIHNldFRpbWVvdXQoKCkgPT4geyBlbC5jbGFzc0xpc3QucmVtb3ZlKCdvbicpOyBzZXRUaW1lb3V0KCgpID0+IGVsLnJlbW92ZSgpLCAzNTApOyB9LCAxMTAwKTsKfQoKYXN5bmMgZnVuY3Rpb24gZG93bmxvYWRCYXRjaChpZHMsIHsgc2lsZW50ID0gZmFsc2UgfSA9IHt9KSB7CiAgaWYgKCFpZHMubGVuZ3RoIHx8IGRvd25sb2FkaW5nKSByZXR1cm4gMDsKICBkb3dubG9hZGluZyA9IHRydWU7CiAgaWYgKCFzaWxlbnQpIHNob3dTdW4oaWRzLmxlbmd0aCk7CiAgbGV0IG9rRGwgPSBmYWxzZTsKICBjb25zdCByZWMgPSBhd2FpdCByZWNvcmRPcmRlcnMoYEltcHJpbWlyICR7aWRzLmxlbmd0aH0gZXRpcXVldGEke2lkcy5sZW5ndGggPT09IDEgPyAnJyA6ICdzJ31gLCBpZHMpOwogIHRyeSB7CiAgICBjb25zdCByZXMgPSBhd2FpdCBzYWZlRmV0Y2goJy9hcGkvbGFiZWxzL2JhdGNoJywgeyBtZXRob2Q6ICdQT1NUJywgY3JlZGVudGlhbHM6ICdzYW1lLW9yaWdpbicsIGhlYWRlcnM6IHsgJ2NvbnRlbnQtdHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9LCBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGlkcywgbWFyazogdHJ1ZSB9KSB9KTsKICAgIGlmICghcmVzLm9rKSB7IGNvbnN0IGUgPSBhd2FpdCByZXMuanNvbigpLmNhdGNoKCgpID0+ICh7fSkpOyB0aHJvdyBuZXcgRXJyb3IoZS5lcnJvciB8fCAnTm8gc2UgcHVkbyBkZXNjYXJnYXInKTsgfQogICAgY29uc3QgYmxvYiA9IGF3YWl0IHJlcy5ibG9iKCk7CiAgICBjb25zdCBuYW1lID0gKHJlcy5oZWFkZXJzLmdldCgnY29udGVudC1kaXNwb3NpdGlvbicpIHx8ICcnKS5tYXRjaCgvZmlsZW5hbWU9IihbXiJdKykiLyk/LlsxXSB8fCAnZXRpcXVldGFzLnBkZic7CiAgICBjb25zdCBhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpOyBhLmhyZWYgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpOyBhLmRvd25sb2FkID0gbmFtZTsgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChhKTsgYS5jbGljaygpOyBhLnJlbW92ZSgpOwogICAgc2V0VGltZW91dCgoKSA9PiBVUkwucmV2b2tlT2JqZWN0VVJMKGEuaHJlZiksIDYwMDAwKTsKICAgIG9rRGwgPSB0cnVlOwogICAgY29uc3QgbiA9ICtyZXMuaGVhZGVycy5nZXQoJ3gtbGFiZWwtY291bnQnKSB8fCBpZHMubGVuZ3RoOwogICAgdG9hc3QoYCR7bn0gZXRpcXVldGEke24gPT09IDEgPyAnJyA6ICdzJ30gZGVzY2FyZ2FkYSR7biA9PT0gMSA/ICcnIDogJ3MnfSB5IG1hcmNhZGEke24gPT09IDEgPyAnJyA6ICdzJ30gY29tbyBpbXByZXNhJHtuID09PSAxID8gJycgOiAncyd9YCk7CiAgICBzZWxlY3RlZC5jbGVhcigpOwogICAgcmVjKCk7CiAgICByZXR1cm4gbjsKICB9IGNhdGNoIChlKSB7IGlmICghc2lsZW50KSB0b2FzdChlLm1lc3NhZ2UsIDUwMDApOyByZXR1cm4gMDsgfQogIGZpbmFsbHkgeyBoaWRlU3VuKCFva0RsKTsgZG93bmxvYWRpbmcgPSBmYWxzZTsgc2V0VGltZW91dChsb2FkT3JkZXJzLCA0MDApOyB9Cn0KLy8gbGEgZGVzY2FyZ2EgYXV0b23DoXRpY2EgZnVlIGVsaW1pbmFkYSBwb3IgY29tcGxldG8gKHBhcmEgdG9kb3MgbG9zIHVzdWFyaW9zKQp0cnkgeyBsb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbSgnZWg6YXV0bycpOyB9IGNhdGNoIHt9CgovLyAtLS0tLS0tLS0tIFZFTkRFRE9SIC0tLS0tLS0tLS0KYXN5bmMgZnVuY3Rpb24gcmVuZGVyU2VsbGVyKCkgewogIGNvbnN0IGlzQWRtaW4gPSBtZS51c2VyLnJvbGUgPT09ICdhZG1pbic7CiAgbGV0IHNlbGxlclBpY2tlciA9ICcnOwogIGlmIChpc0FkbWluKSB7CiAgICBjb25zdCBkID0gYXdhaXQgYXBpKCcvYXBpL2FkbWluL3NlbGxlcnMnKTsKICAgIHNlbGxlcnMgPSBkLnNlbGxlcnM7CiAgICBpZiAoIXNlbGxlcnMubGVuZ3RoKSB7ICQoJyNtYWluJykuaW5uZXJIVE1MID0gYDxkaXYgY2xhc3M9InNlY3Rpb24tdGl0bGUiPjxoMj5WZW5kZWRvcmVzPC9oMj48L2Rpdj48ZGl2IGNsYXNzPSJwYW5lbCI+PGRpdiBjbGFzcz0iZW1wdHkiPiR7RU1QVFlfU1ZHfTxkaXY+UHJpbWVybyBjcmVhICR7TSgnZnVsZmlsbG1lbnQnKSA/ICdsb3MgdmVuZGVkb3JlcycgOiAndHVzIGVtcHJlc2FzJ30gZW4gbGEgcGVzdGHDsWEgVXN1YXJpb3MgeSBhanVzdGVzLjwvZGl2PjwvZGl2PjwvZGl2PmA7IHJldHVybjsgfQogICAgaWYgKCFzZWxsZXJzLnNvbWUocyA9PiBzLmlkID09PSB1aS5hZG1pblNlbGxlcikpIHVpLmFkbWluU2VsbGVyID0gc2VsbGVyc1swXS5pZDsKICAgIHNlbGxlclBpY2tlciA9IGA8c2VsZWN0IGlkPSJhZG1pblNlbGxlciIgc3R5bGU9IndpZHRoOmF1dG8iPiR7c2VsbGVycy5tYXAocyA9PiBgPG9wdGlvbiB2YWx1ZT0iJHtzLmlkfSIgJHtzLmlkID09PSB1aS5hZG1pblNlbGxlciA/ICdzZWxlY3RlZCcgOiAnJ30+JHtlc2Mocy5uYW1lKX08L29wdGlvbj5gKS5qb2luKCcnKX08L3NlbGVjdD5gOwogIH0KICAkKCcjbWFpbicpLmlubmVySFRNTCA9IGAKICA8ZGl2IGNsYXNzPSJzZWN0aW9uLXRpdGxlIj48aDI+JHtpc0FkbWluID8gKE0oJ2Z1bGZpbGxtZW50JykgPyAnQ3VlbnRhIGRlbCB2ZW5kZWRvcicgOiAnTWFya2V0cGxhY2VzIGRlIGxhIGVtcHJlc2EnKSA6ICdNaXMgbWFya2V0cGxhY2VzJ308L2gyPiR7c2VsbGVyUGlja2VyfTxzcGFuIGNsYXNzPSJzcGFjZXIiIHN0eWxlPSJmbGV4OjEiPjwvc3Bhbj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWdob3N0IiBpZD0ic1N5bmMiPiR7SS5zeW5jfVNpbmNyb25pemFyIGFob3JhPC9idXR0b24+PC9kaXY+CiAgPGRpdiBjbGFzcz0iY29ubiIgaWQ9ImNvbm4iPjwvZGl2PgogIDxkaXYgY2xhc3M9IiR7TSgnZnVsZmlsbG1lbnQnKSA/ICdncmlkMicgOiAnJ30iPgogICAgJHtNKCdmdWxmaWxsbWVudCcpID8gYDxkaXYgY2xhc3M9InBhbmVsIj4KICAgICAgPGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+PGgyPlByb2R1Y3RvcyBxdWUgTk8gdmFuIGFsIGZ1bGZpbGxtZW50PC9oMj48L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0icGFuZWwtYm9keSBzdGFjayI+CiAgICAgICAgPGRpdiBjbGFzcz0icnVsZSI+JHtSVUxFX1NWR308cD48Yj5CYXN0YSB1biBwcm9kdWN0byBkZSBlc3RhIGxpc3RhIHBhcmEgYmxvcXVlYXIgZWwgcGVkaWRvIGNvbXBsZXRvLjwvYj4gRWwgZnVsZmlsbG1lbnQgbG8gdmVyw6EgY29uIGNhbmRhZG8geSBubyBwb2Ryw6EgZGVzY2FyZ2FyIHN1IGV0aXF1ZXRhLiBVc2EgZWwgSUQgZGUgcHVibGljYWNpw7NuIChNTEPigKYsIElEIGRlIEZhbGFiZWxsYSwgU0tVIE1L4oCmIGRlIFBhcmlzKSBvIHR1IFNLVSBkZSB2ZW5kZWRvci48L3A+PC9kaXY+CiAgICAgICAgPGZvcm0gY2xhc3M9ImFkZHJvdyIgaWQ9ImFkZEZvcm0iPgogICAgICAgICAgPHRleHRhcmVhIGlkPSJhZGRWYWwiIHJvd3M9IjIiIHBsYWNlaG9sZGVyPSJVbm8gbyB2YXJpb3MsIHNlcGFyYWRvcyBwb3IgY29tYSBvIHNhbHRvIGRlIGzDrW5lYSYjMTA7RWo6IE1MQzE0ODc3NjU0MzIsIExFTi1QT0wtMDEiIGFyaWEtbGFiZWw9IklEcyBvIFNLVXMiPjwvdGV4dGFyZWE+CiAgICAgICAgICA8c2VsZWN0IGlkPSJhZGRNayIgYXJpYS1sYWJlbD0iTWFya2V0cGxhY2UiPjxvcHRpb24gdmFsdWU9ImFueSI+VG9kb3MgbG9zIGNhbmFsZXM8L29wdGlvbj48b3B0aW9uIHZhbHVlPSJtbCI+U29sbyBNZXJjYWRvIExpYnJlPC9vcHRpb24+PG9wdGlvbiB2YWx1ZT0iZmEiPlNvbG8gRmFsYWJlbGxhPC9vcHRpb24+PG9wdGlvbiB2YWx1ZT0icGEiPlNvbG8gUGFyaXM8L29wdGlvbj4ke1snc2gnLCAnd2MnLCAnanMnXS5tYXAoayA9PiBgPG9wdGlvbiB2YWx1ZT0iJHtrfSI+U29sbyAke01LW2tdfTwvb3B0aW9uPmApLmpvaW4oJycpfTwvc2VsZWN0PgogICAgICAgICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiPiR7SS5sb2NrfUJsb3F1ZWFyPC9idXR0b24+CiAgICAgICAgPC9mb3JtPgogICAgICAgIDxpbnB1dCB0eXBlPSJzZWFyY2giIGlkPSJibFEiIHBsYWNlaG9sZGVyPSJCdXNjYXIgZW4gbGEgbGlzdGEiIGFyaWEtbGFiZWw9IkJ1c2NhciBibG9xdWVhZG9zIj4KICAgICAgICA8ZGl2IGNsYXNzPSJ0YWdzIiBpZD0idGFncyI+PC9kaXY+CiAgICAgIDwvZGl2PgogICAgPC9kaXY+YCA6ICcnfQogICAgPGRpdiBjbGFzcz0icGFuZWwiPgogICAgICA8ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj48aDI+UGVkaWRvcyByZWNpZW50ZXM8L2gyPjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJ0YWJsZS13cmFwIj48dGFibGUgc3R5bGU9Im1pbi13aWR0aDo1MjBweCI+PHRoZWFkPjx0cj48dGg+UGVkaWRvPC90aD48dGg+Q2FuYWw8L3RoPjx0aD5Qcm9kdWN0b3M8L3RoPjx0aD5Fc3RhZG88L3RoPjwvdHI+PC90aGVhZD48dGJvZHkgaWQ9Im15Um93cyI+PC90Ym9keT48L3RhYmxlPjwvZGl2PgogICAgPC9kaXY+CiAgPC9kaXY+YDsKICBpZiAoaXNBZG1pbikgJCgnI2FkbWluU2VsbGVyJykub25jaGFuZ2UgPSBlID0+IHsgdWkuYWRtaW5TZWxsZXIgPSArZS50YXJnZXQudmFsdWU7IHN0b3JlLnNldCgnYWRtaW5TZWxsZXInLCB1aS5hZG1pblNlbGxlcik7IHJlbmRlclNlbGxlcigpOyB9OwogICQoJyNzU3luYycpLm9uY2xpY2sgPSBhc3luYyAoKSA9PiB7IGF3YWl0IGFwaSgnL2FwaS9zeW5jJyArIHNlbGxlclFTKCksIHsgbWV0aG9kOiAnUE9TVCcgfSk7IHRvYXN0KCdTaW5jcm9uaXphbmRv4oCmJyk7IH07CiAgaWYgKCQoJyNhZGRGb3JtJykpICQoJyNhZGRGb3JtJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgIGUucHJldmVudERlZmF1bHQoKTsKICAgIHRyeSB7IGNvbnN0IHIgPSBhd2FpdCBhcGkoJy9hcGkvYmxvY2tsaXN0JyArIHNlbGxlclFTKCksIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgdmFsdWU6ICQoJyNhZGRWYWwnKS52YWx1ZSwgbWFya2V0cGxhY2U6ICQoJyNhZGRNaycpLnZhbHVlIH0gfSk7ICQoJyNhZGRWYWwnKS52YWx1ZSA9ICcnOyB0b2FzdChgJHtyLmFkZGVkfSBibG9xdWVhZG8ke3IuYWRkZWQgPT09IDEgPyAnJyA6ICdzJ31gKTsgbG9hZEJsb2NrbGlzdCgpOyB9CiAgICBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlKTsgfQogIH07CiAgaWYgKCQoJyNibFEnKSkgJCgnI2JsUScpLm9uaW5wdXQgPSAoKSA9PiBkcmF3VGFncygpOwogIGlmICgkKCcjdGFncycpKSAkKCcjdGFncycpLm9uY2xpY2sgPSBhc3luYyBlID0+IHsgY29uc3QgYiA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLXJtXScpOyBpZiAoIWIpIHJldHVybjsgYXdhaXQgYXBpKGAvYXBpL2Jsb2NrbGlzdC8ke2IuZGF0YXNldC5ybX0ke3NlbGxlclFTKCl9YCwgeyBtZXRob2Q6ICdERUxFVEUnIH0pOyB0b2FzdCgnRGVzYmxvcXVlYWRvOiBzdXMgcGVkaWRvcyBwYXNhbiBhbCBmdWxmaWxsbWVudCcpOyBsb2FkQmxvY2tsaXN0KCk7IH07CiAgJCgnI215Um93cycpLm9uY2xpY2sgPSBhc3luYyBlID0+IHsKICAgIGNvbnN0IGIgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS11bmJsb2NrXScpOyBpZiAoIWIpIHJldHVybjsKICAgIGlmICghY29uZmlybSgnwr9EZXNibG9xdWVhciBlc3RhIGV0aXF1ZXRhPyBQYXNhIGEgbGEgc2VjY2nDs24gIkRlc2Jsb3F1ZWFkYXMiLiBFbiBsYSBob2phIGRlbCBwZWRpZG8gc2FsZHLDoSBzdSBuw7ptZXJvIHkgcXVlZGFyw6FuIG1hcmNhZG9zIGNvbiAiRkFMVEEiIGxvcyBwcm9kdWN0b3MgcXVlIHNlIHJlbGxlbmFuIGFwYXJ0ZS4nKSkgcmV0dXJuOwogICAgYi5kaXNhYmxlZCA9IHRydWU7IGIudGV4dENvbnRlbnQgPSAnRGVzYmxvcXVlYW5kb+KApic7IHRyeSB7IGF3YWl0IGFwaVJldHJ5KGAvYXBpL29yZGVycy8ke2IuZGF0YXNldC51bmJsb2NrfS91bmJsb2NrYCwgeyBtZXRob2Q6ICdQT1NUJyB9KTsgdG9hc3QoJ0V0aXF1ZXRhIGRlc2Jsb3F1ZWFkYScpOyBsb2FkU2VsbGVyT3JkZXJzKCk7IH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IGIuZGlzYWJsZWQgPSBmYWxzZTsgYi50ZXh0Q29udGVudCA9ICdEZXNibG9xdWVhciBldGlxdWV0YSc7IH0KICB9OwogIGxvYWRDb25uZWN0aW9ucygpOyBpZiAoTSgnZnVsZmlsbG1lbnQnKSkgbG9hZEJsb2NrbGlzdCgpOyBsb2FkU2VsbGVyT3JkZXJzKCk7CiAgaWYgKG5ldyBVUkxTZWFyY2hQYXJhbXMobG9jYXRpb24uc2VhcmNoKS5nZXQoJ2NvbmVjdGFkbycpID09PSAnbWwnKSB7IHRvYXN0KCdNZXJjYWRvIExpYnJlIGNvbmVjdGFkbycpOyBoaXN0b3J5LnJlcGxhY2VTdGF0ZShudWxsLCAnJywgJy8nKTsgfQp9CgovLyBUaWVuZGFzIHByb3BpYXM6IGRhdG9zIHBhcmEgY29uZWN0YXJsYXMgKGxvcyBzZWNyZXRvcyBudW5jYSBzZSBtdWVzdHJhbiBkZSB2dWVsdGEpCmNvbnN0IFNUT1JFUyA9IFsKICBbJ3NoJywgW1snc2hvcCcsICdEaXJlY2Npw7NuIGRlIGxhIHRpZW5kYScsICd0ZXh0JywgJ21pdGllbmRhLm15c2hvcGlmeS5jb20nXSwgWyd0b2tlbicsICdUb2tlbiBkZSBhY2Nlc28gZGUgbGEgYXBwJywgJ3Bhc3N3b3JkJywgJ3NocGF0X+KApiddXSwKICAgICdFbiBTaG9waWZ5OiBDb25maWd1cmFjacOzbiDigLogQXBwcyB5IGNhbmFsZXMgZGUgdmVudGEg4oC6IERlc2Fycm9sbGFyIGFwcHMg4oC6IENyZWFyIHVuYSBhcHAuIEVuICJDb25maWd1cmFyIGFsY2FuY2VzIGRlIGxhIEFQSSBkZSBBZG1pbiIgbWFyY2EgPGI+cmVhZF9vcmRlcnMsIHJlYWRfcHJvZHVjdHMsIHJlYWRfaW52ZW50b3J5PC9iPiAoeSA8Yj53cml0ZV9pbnZlbnRvcnk8L2I+IHNpIHVzYXLDoXMgZWwgY29udHJvbCBkZSBzdG9jayksIGluc3TDoWxhbGEgeSBjb3BpYSBlbCA8Yj50b2tlbiBkZSBhY2Nlc288L2I+IChzZSBtdWVzdHJhIHVuYSBzb2xhIHZleikuJ10sCiAgWyd3YycsIFtbJ3VybCcsICdEaXJlY2Npw7NuIGRlIGxhIHRpZW5kYScsICd0ZXh0JywgJ2h0dHBzOi8vbWl0aWVuZGEuY2wnXSwgWydrZXknLCAnQ2xhdmUgZGUgY2xpZW50ZScsICdwYXNzd29yZCcsICdja1/igKYnXSwgWydzZWNyZXQnLCAnQ2xhdmUgc2VjcmV0YScsICdwYXNzd29yZCcsICdjc1/igKYnXV0sCiAgICAnRW4gV29yZFByZXNzOiBXb29Db21tZXJjZSDigLogQWp1c3RlcyDigLogQXZhbnphZG8g4oC6IEFQSSBSRVNUIOKAuiA8Yj5Bw7FhZGlyIGNsYXZlPC9iPiwgY29uIHBlcm1pc28gPGI+TGVjdHVyYS9Fc2NyaXR1cmE8L2I+LiBDb3BpYSBsYSBjbGF2ZSBkZSBjbGllbnRlIChja1/igKYpIHkgbGEgc2VjcmV0YSAoY3Nf4oCmKS4gTGEgdGllbmRhIGRlYmUgdGVuZXIgaHR0cHMuJ10sCiAgWydqcycsIFtbJ2xvZ2luJywgJ0xvZ2luIGRlIGxhIEFQSScsICd0ZXh0JywgJ0PDs2RpZ28gIkxvZ2luIiddLCBbJ2F1dGh0b2tlbicsICdUb2tlbiBkZSBsYSBBUEknLCAncGFzc3dvcmQnLCAnQ8OzZGlnbyAiVG9rZW4iJ11dLAogICAgJ0VuIEp1bXBzZWxsZXI6IENvbmZpZ3VyYWNpw7NuIOKAuiBDdWVudGEgKG8gQ29uZmlndXJhY2nDs24g4oC6IEFQSSkuIENvcGlhIGVsIDxiPkxvZ2luPC9iPiB5IGVsIDxiPlRva2VuPC9iPiBkZSBsYSBBUEkuJ10sCl07CmFzeW5jIGZ1bmN0aW9uIGxvYWRDb25uZWN0aW9ucygpIHsKICBjb25zdCB7IGNvbm5lY3Rpb25zIH0gPSBhd2FpdCBhcGkoJy9hcGkvY29ubmVjdGlvbnMnICsgc2VsbGVyUVMoKSk7CiAgY29uc3QgYnkgPSBPYmplY3QuZnJvbUVudHJpZXMoY29ubmVjdGlvbnMubWFwKGMgPT4gW2MubWFya2V0cGxhY2UsIGNdKSk7CiAgY29uc3Qgc3QgPSBjID0+ICFjID8gJzxkaXYgY2xhc3M9InN0YXRlIG9mZiI+PGk+PC9pPlNpbiBjb25lY3RhcjwvZGl2PicgOiBjLmxhc3RfZXJyb3IgPyBgPGRpdiBjbGFzcz0ic3RhdGUgZXJyIj48aT48L2k+RXJyb3I6ICR7ZXNjKGMubGFzdF9lcnJvci5zbGljZSgwLCAxMjApKX08L2Rpdj5gIDogYDxkaXYgY2xhc3M9InN0YXRlIG9uIj48aT48L2k+Q29uZWN0YWRvJHtjLmFjY291bnRfbGFiZWwgPyAnIMK3ICcgKyBlc2MoYy5hY2NvdW50X2xhYmVsKSA6ICcnfSR7Yy5sYXN0X3N5bmNfYXQgPyAnIMK3IHJldmlzYWRvICcgKyBlc2MoZm10VGltZShjLmxhc3Rfc3luY19hdCkpIDogJyd9PC9kaXY+YDsKICBjb25zdCBkaXNjID0gYyA9PiBjID8gYDxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtZGVsPSIke2MuaWR9Ij5EZXNjb25lY3RhcjwvYnV0dG9uPmAgOiAnJzsKICBjb25zdCBtbCA9IGJ5Lm1sLCBmYSA9IGJ5LmZhLCBwYSA9IGJ5LnBhOwogICQoJyNjb25uJykuaW5uZXJIVE1MID0gYAogIDxkaXYgY2xhc3M9Im1jYXJkIj48ZGl2IGNsYXNzPSJsb2dvIiBzdHlsZT0iYmFja2dyb3VuZDp2YXIoLS1tbCk7Y29sb3I6dmFyKC0tbWwtaW5rKSI+TWVyY2FkbyBMaWJyZTwvZGl2PiR7c3QobWwpfQogICAgPHAgY2xhc3M9ImhvdyI+VGUgbGxldmEgYSBNZXJjYWRvIExpYnJlIHBhcmEgYXV0b3JpemFyLiBObyBjb21wYXJ0ZXMgdHUgY29udHJhc2XDsWEuIExhcyBldGlxdWV0YXMgbGxlZ2FuIGFwZW5hcyBsYSB2ZW50YSBxdWVkYSBsaXN0YSBwYXJhIGltcHJpbWlyLjwvcD4KICAgIDxwIGNsYXNzPSJob3cgd2FybmJveCI+PGI+SW1wb3J0YW50ZTo8L2I+IE1lcmNhZG8gTGlicmUgY29uZWN0YSBsYSBjdWVudGEgcXVlIGVzdMOpIDxiPmFiaWVydGEgZW4gZXN0ZSBuYXZlZ2Fkb3I8L2I+LiBTaSBhcXXDrSBlc3TDoSBhYmllcnRhIG90cmEgY3VlbnRhIChwb3IgZWplbXBsbyBsYSBkZSBvdHJvIHZlbmRlZG9yKSwgY2llcnJhIHNlc2nDs24gZW4gbWVyY2Fkb2xpYnJlLmNsIGFudGVzLCBvIHVzYSBlbCBsaW5rIHBhcmEgcXVlIGVsIHZlbmRlZG9yIGNvbmVjdGUgZGVzZGUgc3UgcHJvcGlvIGNvbXB1dGFkb3IuPC9wPgogICAgJHttZS5tbENvbmZpZ3VyZWQgPyBgPGEgY2xhc3M9ImJ0biAke21sID8gJ2J0bi1naG9zdCcgOiAnYnRuLXByaW1hcnknfSIgaHJlZj0iL2F1dGgvbWwvc3RhcnQke3NlbGxlclFTKCl9Ij4ke21sID8gJ1ZvbHZlciBhIGF1dG9yaXphcicgOiAnQ29uZWN0YXIgY29uIE1lcmNhZG8gTGlicmUnfTwvYT4ke21lLnVzZXIucm9sZSA9PT0gJ2FkbWluJyA/ICc8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBpZD0ibWxMaW5rIj5Db3BpYXIgbGluayBwYXJhIHF1ZSBlbCB2ZW5kZWRvciBjb25lY3RlPC9idXR0b24+JyA6ICcnfWAgOiAnPHAgY2xhc3M9ImhvdyIgc3R5bGU9ImNvbG9yOnZhcigtLXdhcm4pIj5FbCBhZG1pbmlzdHJhZG9yIGRlYmUgY29uZmlndXJhciBsYSBhcHAgZGUgTWVyY2FkbyBMaWJyZSBlbiBlbCBzZXJ2aWRvci48L3A+J30ke2Rpc2MobWwpfTwvZGl2PgogIDxkaXYgY2xhc3M9Im1jYXJkIj48ZGl2IGNsYXNzPSJsb2dvIiBzdHlsZT0iYmFja2dyb3VuZDp2YXIoLS1mYSk7Y29sb3I6dmFyKC0tZmEtaW5rKSI+RmFsYWJlbGxhPC9kaXY+JHtzdChmYSl9CiAgICA8Zm9ybSBpZD0iZmFGb3JtIiBjbGFzcz0ic3RhY2siPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPlVzdWFyaW8gQVBJIChjb3JyZW8gZGVsIFNlbGxlciBDZW50ZXIpPGlucHV0IHR5cGU9ImVtYWlsIiBpZD0iZmFVc2VyIiB2YWx1ZT0iJHtlc2MoZmE/LmFjY291bnRfbGFiZWwgfHwgJycpfSIgcmVxdWlyZWQ+PC9sYWJlbD4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5BUEkgS2V5PGlucHV0IHR5cGU9InBhc3N3b3JkIiBpZD0iZmFLZXkiIHBsYWNlaG9sZGVyPSIke2ZhID8gJ+KAouKAouKAouKAouKAouKAoiAoZ3VhcmRhZGEpJyA6ICdTZWxsZXIgQ2VudGVyIOKAuiBNaSBjdWVudGEg4oC6IEludGVncmFjaW9uZXMnfSIgJHtmYSA/ICcnIDogJ3JlcXVpcmVkJ30+PC9sYWJlbD4KICAgICAgPGxhYmVsIGNsYXNzPSJmIj5TZWxsZXIgSUQ8aW5wdXQgdHlwZT0idGV4dCIgaWQ9ImZhU2lkIiBwbGFjZWhvbGRlcj0iQ8OzZGlnbyBkZSB0aWVuZGEsIGVqLiBTQzEyMzQiPjwvbGFiZWw+CiAgICAgIDxsYWJlbCBjbGFzcz0ic3dpdGNoIj48aW5wdXQgdHlwZT0iY2hlY2tib3giIGlkPSJmYUF1dG8iICR7ZmE/LnNldHRpbmdzPy5hdXRvUmVhZHkgPyAnY2hlY2tlZCcgOiAnJ30+IE1hcmNhciAibGlzdG8gcGFyYSBkZXNwYWNobyIgYXV0b23DoXRpY288L2xhYmVsPgogICAgICA8cCBjbGFzcz0iaG93Ij5GYWxhYmVsbGEgZ2VuZXJhIGxhIGV0aXF1ZXRhIHNvbG8gY3VhbmRvIGVsIHBlZGlkbyBlc3TDoSBsaXN0byBwYXJhIGRlc3BhY2hvLiBDb24gZXN0YSBvcGNpw7NuLCBsYSBhcHAgbG8gbWFyY2Egc29sYSBhcGVuYXMgbGxlZ2EuPC9wPgogICAgICA8YnV0dG9uIGNsYXNzPSJidG4gJHtmYSA/ICdidG4tZ2hvc3QnIDogJ2J0bi1wcmltYXJ5J30iIHR5cGU9InN1Ym1pdCI+JHtmYSA/ICdBY3R1YWxpemFyJyA6ICdDb25lY3RhciBGYWxhYmVsbGEnfTwvYnV0dG9uPgogICAgPC9mb3JtPgogICAgJHtmYT8ud2ViaG9va191cmwgPyBgPGxhYmVsIGNsYXNzPSJmIj5BdmlzbyBpbnN0YW50w6FuZW8gKHdlYmhvb2ssIG9wY2lvbmFsKTxzcGFuIGNsYXNzPSJjb3B5Ij48aW5wdXQgdHlwZT0idGV4dCIgcmVhZG9ubHkgdmFsdWU9IiR7ZXNjKGZhLndlYmhvb2tfdXJsKX0iPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtY29weT0iJHtlc2MoZmEud2ViaG9va191cmwpfSI+Q29waWFyPC9idXR0b24+PC9zcGFuPjwvbGFiZWw+YCA6ICcnfQogICAgJHtkaXNjKGZhKX08L2Rpdj4KICA8ZGl2IGNsYXNzPSJtY2FyZCI+PGRpdiBjbGFzcz0ibG9nbyIgc3R5bGU9ImJhY2tncm91bmQ6dmFyKC0tcGEpO2NvbG9yOiNmZmYiPlBhcmlzPC9kaXY+JHtzdChwYSl9CiAgICA8Zm9ybSBpZD0icGFGb3JtIiBjbGFzcz0ic3RhY2siPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPkFQSSBLZXk8aW5wdXQgdHlwZT0icGFzc3dvcmQiIGlkPSJwYUtleSIgcGxhY2Vob2xkZXI9IiR7cGEgPyAn4oCi4oCi4oCi4oCi4oCi4oCiIChndWFyZGFkYSknIDogJ1NlbGxlciBDZW50ZXIgUGFyaXMg4oC6IE1pIGN1ZW50YSDigLogSW50ZWdyYWNpb25lcyd9IiByZXF1aXJlZD48L2xhYmVsPgogICAgICA8cCBjbGFzcz0iaG93Ij5QYXJpcyBlbnRyZWdhIGxhIEFQSSBLZXkgZW4gTWkgY3VlbnRhIOKAuiBJbnRlZ3JhY2lvbmVzLiBTaSBubyBhcGFyZWNlLCBzZSBwaWRlIHBvciB0aWNrZXQgYSBQYXJpcy48L3A+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biAke3BhID8gJ2J0bi1naG9zdCcgOiAnYnRuLXByaW1hcnknfSIgdHlwZT0ic3VibWl0Ij4ke3BhID8gJ0FjdHVhbGl6YXInIDogJ0NvbmVjdGFyIFBhcmlzJ308L2J1dHRvbj4KICAgIDwvZm9ybT4ke2Rpc2MocGEpfTwvZGl2PgogICR7U1RPUkVTLm1hcCgoW2ssIGZpZWxkcywgaG93XSkgPT4geyBjb25zdCBjID0gYnlba10sIGNzID0gYz8uc2V0dGluZ3MgfHwge307IHJldHVybiBgPGRpdiBjbGFzcz0ibWNhcmQiPjxkaXYgY2xhc3M9ImxvZ28iIHN0eWxlPSJiYWNrZ3JvdW5kOiR7TUtfQ09MT1Jba119O2NvbG9yOiNmZmYiPiR7TUtfSUNPTltrXSB8fCAnJ30gJHtNS1trXX08L2Rpdj4ke3N0KGMpfQogICAgPGZvcm0gY2xhc3M9InN0YWNrIiBkYXRhLXN0b3JlPSIke2t9Ij4KICAgICAgJHtmaWVsZHMubWFwKChbaWQsIGxhYmVsLCB0eXBlLCBwaF0pID0+IGA8bGFiZWwgY2xhc3M9ImYiPiR7bGFiZWx9PGlucHV0IHR5cGU9IiR7dHlwZX0iIG5hbWU9IiR7aWR9IiBwbGFjZWhvbGRlcj0iJHtjICYmIHR5cGUgPT09ICdwYXNzd29yZCcgPyAn4oCi4oCi4oCi4oCi4oCi4oCiIChndWFyZGFkbyknIDogZXNjKHBoKX0iICR7YyA/ICcnIDogJ3JlcXVpcmVkJ30+PC9sYWJlbD5gKS5qb2luKCcnKX0KICAgICAgPHAgY2xhc3M9ImhvdyI+JHtob3d9PC9wPgogICAgICA8ZGl2IGNsYXNzPSJzdG9yZS1vcHRzIj4KICAgICAgICA8bGFiZWwgY2xhc3M9ImYiPkhvcmEgZGUgY29ydGUgZGUgZGVzcGFjaG88aW5wdXQgdHlwZT0idGltZSIgbmFtZT0iY3V0b2ZmIiB2YWx1ZT0iJHtlc2MoY3MuY3V0b2ZmIHx8ICcxNDowMCcpfSI+PC9sYWJlbD4KICAgICAgICA8bGFiZWwgY2xhc3M9InN3aXRjaCI+PGlucHV0IHR5cGU9ImNoZWNrYm94IiBuYW1lPSJ3ZWVrZW5kcyIgJHtjcy53ZWVrZW5kcyA/ICdjaGVja2VkJyA6ICcnfT4gVGFtYmnDqW4gZGVzcGFjaG8gc8OhYmFkbyB5IGRvbWluZ288L2xhYmVsPgogICAgICAgIDxsYWJlbCBjbGFzcz0iZiI+UmVtaXRlbnRlIGVuIGxhIGV0aXF1ZXRhPGlucHV0IHR5cGU9InRleHQiIG5hbWU9InNlbmRlciIgbWF4bGVuZ3RoPSI4MCIgdmFsdWU9IiR7ZXNjKGNzLnNlbmRlciB8fCAnJyl9IiBwbGFjZWhvbGRlcj0iTm9tYnJlIGRlIHR1IHRpZW5kYSI+PC9sYWJlbD4KICAgICAgICA8bGFiZWwgY2xhc3M9ImYiPkRpcmVjY2nDs24gZGVsIHJlbWl0ZW50ZSAob3BjaW9uYWwpPGlucHV0IHR5cGU9InRleHQiIG5hbWU9InNlbmRlckFkZHJlc3MiIG1heGxlbmd0aD0iMTIwIiB2YWx1ZT0iJHtlc2MoY3Muc2VuZGVyQWRkcmVzcyB8fCAnJyl9IiBwbGFjZWhvbGRlcj0iQ2FsbGUgMTIzLCBDb211bmEiPjwvbGFiZWw+CiAgICAgIDwvZGl2PgogICAgICA8cCBjbGFzcz0iaG93Ij7wn4+377iPICR7TUtba119IG5vIGVudHJlZ2EgZXRpcXVldGEgZGUgY291cmllcjogPGI+RXRpcXVldGFIdWIgZ2VuZXJhIHVuYSBldGlxdWV0YSAxMHgxNTwvYj4gY29uIGVsIGNsaWVudGUsIGxhIGRpcmVjY2nDs24sIGxvcyBwcm9kdWN0b3MgeSB1biBjw7NkaWdvIGRlIGJhcnJhcyBkZWwgcGVkaWRvLiBQZWRpZG8gcGFnYWRvIGFudGVzIGRlIGxhIGhvcmEgZGUgY29ydGUgPSBzZSBkZXNwYWNoYSBlc2UgZMOtYTsgZGVzcHXDqXMsIGVsIGTDrWEgaMOhYmlsIHNpZ3VpZW50ZSAoYXPDrSBzZSBjYWxjdWxhbiBsb3MgYXRyYXNhZG9zKS48L3A+CiAgICAgIDxidXR0b24gY2xhc3M9ImJ0biAke2MgPyAnYnRuLWdob3N0JyA6ICdidG4tcHJpbWFyeSd9IiB0eXBlPSJzdWJtaXQiPiR7YyA/ICdHdWFyZGFyJyA6ICdDb25lY3RhciAnICsgTUtba119PC9idXR0b24+CiAgICA8L2Zvcm0+JHtkaXNjKGMpfTwvZGl2PmA7IH0pLmpvaW4oJycpfQogIDxkZXRhaWxzIGNsYXNzPSJtY2FyZCBzb29uLWNhcmQiPjxzdW1tYXJ5PjxiPlByw7N4aW1hbWVudGU8L2I+IMK3ICR7T2JqZWN0LnZhbHVlcyhDQVQpLmZpbHRlcih2ID0+IHYuc29vbikubWFwKHYgPT4gdi5uYW1lKS5qb2luKCcsICcpfTwvc3VtbWFyeT4KICAgICR7T2JqZWN0LmVudHJpZXMoQ0FUKS5maWx0ZXIoKFssIHZdKSA9PiB2LnNvb24pLm1hcCgoW2ssIHZdKSA9PiBgPHAgY2xhc3M9ImhvdyI+PHNwYW4gY2xhc3M9Im1rIiBzdHlsZT0iYmFja2dyb3VuZDoke3YuY29sb3J9MjI7Y29sb3I6JHt2LmNvbG9yfSI+JHt2Lmljb259ICR7ZXNjKHYubmFtZSl9PC9zcGFuPiAke2VzYyh2LnNvb24pfTwvcD5gKS5qb2luKCcnKX0KICAgIDxwIGNsYXNzPSJob3ciPsK/VmVuZGVzIGVuIGFsZ3VubyBkZSBlc3Rvcz8gRXNjcsOtYmVub3M6IGNvbiB0dXMgY3JlZGVuY2lhbGVzIGRlIHBydWViYSBsbyBkZWphbW9zIGZ1bmNpb25hbmRvIGNvbiBsYXMgbWlzbWFzIGZ1bmNpb25lcyAoZXRpcXVldGFzLCBhdHJhc2Fkb3MsIHZlbnRhcywgZ2FuYW5jaWEgeSBkZXZvbHVjaW9uZXMpLjwvcD4KICA8L2RldGFpbHM+YDsKICAkJCgnI2Nvbm4gZm9ybVtkYXRhLXN0b3JlXScpLmZvckVhY2goZiA9PiBmLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICBlLnByZXZlbnREZWZhdWx0KCk7CiAgICBjb25zdCBrID0gZi5kYXRhc2V0LnN0b3JlLCBjID0gYnlba10sIHYgPSBPYmplY3QuZnJvbUVudHJpZXMobmV3IEZvcm1EYXRhKGYpLmVudHJpZXMoKSk7CiAgICBjb25zdCBvcHRzID0geyBjdXRvZmY6IHYuY3V0b2ZmLCB3ZWVrZW5kczogZi53ZWVrZW5kcy5jaGVja2VkLCBzZW5kZXI6IHYuc2VuZGVyLCBzZW5kZXJBZGRyZXNzOiB2LnNlbmRlckFkZHJlc3MgfTsKICAgIGNvbnN0IGNyZWRzID0gU1RPUkVTLmZpbmQoeCA9PiB4WzBdID09PSBrKVsxXS5tYXAoeCA9PiB4WzBdKTsKICAgIGNvbnN0IGJ0biA9IGYucXVlcnlTZWxlY3RvcignYnV0dG9uW3R5cGU9c3VibWl0XScpOyBidG4uZGlzYWJsZWQgPSB0cnVlOwogICAgdHJ5IHsKICAgICAgaWYgKGMgJiYgY3JlZHMuZXZlcnkobiA9PiAhdltuXSkpIHsgYXdhaXQgYXBpKGAvYXBpL2Nvbm5lY3Rpb25zLyR7Yy5pZH0vc2V0dGluZ3Mke3NlbGxlclFTKCl9YCwgeyBtZXRob2Q6ICdQQVRDSCcsIGJvZHk6IG9wdHMgfSk7IHRvYXN0KCdHdWFyZGFkbycpOyB9CiAgICAgIGVsc2UgeyBhd2FpdCBhcGkoYC9hcGkvY29ubmVjdGlvbnMvJHtrfSR7c2VsbGVyUVMoKX1gLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IC4uLnYsIC4uLm9wdHMgfSB9KTsgdG9hc3QoYCR7TUtba119IGNvbmVjdGFkbzogdHJheWVuZG8gcGVkaWRvc+KApmAsIDQwMDApOyB9CiAgICAgIHRyeSB7IG1lID0gYXdhaXQgYXBpKCcvYXBpL21lJyk7IGFwcGx5Q2F0YWxvZyhtZSk7IH0gY2F0Y2ggeyAvKiBzaWd1ZSAqLyB9CiAgICAgIGxvYWRDb25uZWN0aW9ucygpOwogICAgfSBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlLCA2MDAwKTsgYnRuLmRpc2FibGVkID0gZmFsc2U7IH0KICB9KTsKICAkKCcjZmFGb3JtJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgIGUucHJldmVudERlZmF1bHQoKTsKICAgIGlmIChmYSAmJiAhJCgnI2ZhS2V5JykudmFsdWUpIHsgYXdhaXQgYXBpKGAvYXBpL2Nvbm5lY3Rpb25zLyR7ZmEuaWR9L3NldHRpbmdzJHtzZWxsZXJRUygpfWAsIHsgbWV0aG9kOiAnUEFUQ0gnLCBib2R5OiB7IGF1dG9SZWFkeTogJCgnI2ZhQXV0bycpLmNoZWNrZWQgfSB9KTsgdG9hc3QoJ0d1YXJkYWRvJyk7IHJldHVybiBsb2FkQ29ubmVjdGlvbnMoKTsgfQogICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL2Nvbm5lY3Rpb25zL2ZhJyArIHNlbGxlclFTKCksIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgdXNlcklkOiAkKCcjZmFVc2VyJykudmFsdWUsIGFwaUtleTogJCgnI2ZhS2V5JykudmFsdWUsIHNlbGxlcklkOiAkKCcjZmFTaWQnKS52YWx1ZSwgYXV0b1JlYWR5OiAkKCcjZmFBdXRvJykuY2hlY2tlZCB9IH0pOyB0b2FzdCgnRmFsYWJlbGxhIGNvbmVjdGFkbycpOyBsb2FkQ29ubmVjdGlvbnMoKTsgfQogICAgY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSwgNTAwMCk7IH0KICB9OwogICQoJyNwYUZvcm0nKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4gewogICAgZS5wcmV2ZW50RGVmYXVsdCgpOwogICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL2Nvbm5lY3Rpb25zL3BhJyArIHNlbGxlclFTKCksIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgYXBpS2V5OiAkKCcjcGFLZXknKS52YWx1ZSB9IH0pOyB0b2FzdCgnUGFyaXMgY29uZWN0YWRvJyk7IGxvYWRDb25uZWN0aW9ucygpOyB9CiAgICBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlLCA1MDAwKTsgfQogIH07CiAgaWYgKCQoJyNtbExpbmsnKSkgJCgnI21sTGluaycpLm9uY2xpY2sgPSBhc3luYyAoKSA9PiB7CiAgICB0cnkgewogICAgICBjb25zdCB7IHVybCB9ID0gYXdhaXQgYXBpKCcvYXBpL2FkbWluL21sLWxpbmsnICsgc2VsbGVyUVMoKSwgeyBtZXRob2Q6ICdQT1NUJyB9KTsKICAgICAgdHJ5IHsgYXdhaXQgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQodXJsKTsgdG9hc3QoJ0xpbmsgY29waWFkbzogZW52w61hc2VsbyBhbCB2ZW5kZWRvciAoc2lydmUgcG9yIDQ4IGhvcmFzKScsIDUwMDApOyB9CiAgICAgIGNhdGNoIHsgcHJvbXB0KCdDb3BpYSBlc3RlIGxpbmsgeSBlbnbDrWFzZWxvIGFsIHZlbmRlZG9yIChzaXJ2ZSBwb3IgNDggaG9yYXMpOicsIHVybCk7IH0KICAgIH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IH0KICB9OwogICQoJyNjb25uJykub25jbGljayA9IGFzeW5jIGUgPT4gewogICAgY29uc3QgZCA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLWRlbF0nKTsKICAgIGlmIChkKSB7IGQuZGlzYWJsZWQgPSB0cnVlOyBhd2FpdCBhcGkoYC9hcGkvY29ubmVjdGlvbnMvJHtkLmRhdGFzZXQuZGVsfSR7c2VsbGVyUVMoKX1gLCB7IG1ldGhvZDogJ0RFTEVURScgfSk7IHRvYXN0KCdEZXNjb25lY3RhZG8nKTsgbG9hZENvbm5lY3Rpb25zKCk7IH0KICAgIGNvbnN0IGMgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1jb3B5XScpOwogICAgaWYgKGMpIHsgZS5wcmV2ZW50RGVmYXVsdCgpOyB0cnkgeyBhd2FpdCBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dChjLmRhdGFzZXQuY29weSk7IHRvYXN0KCdDb3BpYWRvJyk7IH0gY2F0Y2ggeyBjLnByZXZpb3VzRWxlbWVudFNpYmxpbmcuc2VsZWN0KCk7IH0gfQogIH07Cn0KCmxldCBibEl0ZW1zID0gW107CmFzeW5jIGZ1bmN0aW9uIGxvYWRCbG9ja2xpc3QoKSB7IGJsSXRlbXMgPSAoYXdhaXQgYXBpKCcvYXBpL2Jsb2NrbGlzdCcgKyBzZWxsZXJRUygpKSkuaXRlbXM7IGRyYXdUYWdzKCk7IH0KZnVuY3Rpb24gZHJhd1RhZ3MoKSB7CiAgY29uc3QgcSA9ICgkKCcjYmxRJyk/LnZhbHVlIHx8ICcnKS50b0xvd2VyQ2FzZSgpOwogIGNvbnN0IGxpc3QgPSBibEl0ZW1zLmZpbHRlcihiID0+ICFxIHx8IGIudmFsdWUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxKSk7CiAgJCgnI3RhZ3MnKS5pbm5lckhUTUwgPSBsaXN0Lmxlbmd0aCA/IGxpc3QubWFwKGIgPT4gYDxzcGFuIGNsYXNzPSJ0YWciPiR7ZXNjKGIudmFsdWUpfSA8c21hbGw+wrcgJHtiLm1hcmtldHBsYWNlID09PSAnYW55JyA/ICd0b2RvcycgOiBNS1tiLm1hcmtldHBsYWNlXX08L3NtYWxsPjxidXR0b24gZGF0YS1ybT0iJHtiLmlkfSIgYXJpYS1sYWJlbD0iUXVpdGFyICR7ZXNjKGIudmFsdWUpfSI+JHtJLnh9PC9idXR0b24+PC9zcGFuPmApLmpvaW4oJycpCiAgICA6IGA8c3BhbiBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTMuNXB4Ij4ke2JsSXRlbXMubGVuZ3RoID8gJ1NpbiByZXN1bHRhZG9zLicgOiAnU2luIHByb2R1Y3RvcyBibG9xdWVhZG9zOiB0b2RvIHZhIGFsIGZ1bGZpbGxtZW50Lid9PC9zcGFuPmA7Cn0KYXN5bmMgZnVuY3Rpb24gbG9hZFNlbGxlck9yZGVycygpIHsKICBpZiAodGFiICE9PSAnc2VsbGVyJyB8fCAhJCgnI215Um93cycpKSByZXR1cm47CiAgbGV0IGxpc3Q7CiAgaWYgKG1lLnVzZXIucm9sZSA9PT0gJ3NlbGxlcicpIGxpc3QgPSAoYXdhaXQgYXBpKCcvYXBpL29yZGVycz92aWV3PWFsbCcpKS5vcmRlcnMuZmlsdGVyKG8gPT4gby5zZWxsZXJfaWQgPT09IG1lLnNlbGxlcj8uaWQpOwogIGVsc2UgbGlzdCA9IChhd2FpdCBhcGkoJy9hcGkvb3JkZXJzP3ZpZXc9YWxsJykpLm9yZGVycy5maWx0ZXIobyA9PiBvLnNlbGxlcl9pZCA9PT0gdWkuYWRtaW5TZWxsZXIpOwogICQoJyNteVJvd3MnKS5pbm5lckhUTUwgPSBsaXN0Lmxlbmd0aCA/IGxpc3Quc2xpY2UoMCwgNjApLm1hcChvID0+IGA8dHI+PHRkIGNsYXNzPSJtb25vIj4ke2VzYyhvLm9yZGVyX251bWJlcil9PHNwYW4gY2xhc3M9Im5vdGUiPiR7ZXNjKGZtdFRpbWUoby5zb2xkX2F0IHx8IG8uY3JlYXRlZF9hdCkpfSR7by5jdXN0b21lciA/ICcgwrcgJyArIGVzYyhvLmN1c3RvbWVyKSA6ICcnfTwvc3Bhbj48L3RkPjx0ZD48c3BhbiBjbGFzcz0ibWsgJHtvLm1hcmtldHBsYWNlfSI+JHtNS1tvLm1hcmtldHBsYWNlXSB8fCAnJ308L3NwYW4+PC90ZD48dGQ+JHtpdGVtc0hUTUwobyl9PC90ZD48dGQ+JHtvLmJsb2NrX25vID8gYDxzcGFuIGNsYXNzPSJibG9ja25vIj5OwrAgJHtvLmJsb2NrX25vfTwvc3Bhbj5gIDogJyd9JHtwaWxsKG8pfSR7by5zdGF0ZSA9PT0gJ2Jsb2NrZWQnICYmIG8ub3duICE9PSBmYWxzZSA/IGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkgYnRuLXNtIiBzdHlsZT0ibWFyZ2luLXRvcDo2cHgiIGRhdGEtdW5ibG9jaz0iJHtvLmlkfSI+RGVzYmxvcXVlYXIgZXRpcXVldGE8L2J1dHRvbj5gIDogJyd9JHtbJ3ByaW50ZWQnLCAnc2hpcHBlZCddLmluY2x1ZGVzKG8uc3RhdGUpICYmIG8ucHJpbnRlZF9ieSA/IGA8c3BhbiBjbGFzcz0ibm90ZSI+SW1wcmltacOzOiAke2VzYyhvLnByaW50ZWRfYnkpfTwvc3Bhbj5gIDogJyd9JHtvLnByZXZfcHJpbnQgJiYgby5wcmV2X3ByaW50LmF0ID8gYDxzcGFuIGNsYXNzPSJub3RlIHByZXZwcmludCI+4oa6IFlhIGZ1ZSBpbXByZXNhIHBvciAke2VzYyhvLnByZXZfcHJpbnQuYnkgfHwgJ2FsZ3VpZW4nKX0gZWwgJHtlc2MoZm10VGltZShvLnByZXZfcHJpbnQuYXQpKX08L3NwYW4+YCA6ICcnfSR7by5zdGF0ZSA9PT0gJ2Vycm9yJyB8fCBvLnN0YXRlID09PSAnd2FpdGluZycgPyBgPHNwYW4gY2xhc3M9Im5vdGUgJHtvLnN0YXRlID09PSAnZXJyb3InID8gJ2JhZCcgOiAnJ30iPiR7ZXNjKG8uZXJyb3IgfHwgJycpfTwvc3Bhbj5gIDogJyd9PC90ZD48L3RyPmApLmpvaW4oJycpCiAgICA6IGA8dHI+PHRkIGNvbHNwYW49IjQiPjxkaXYgY2xhc3M9ImVtcHR5Ij5Bw7puIG5vIGhheSBwZWRpZG9zLiBDb25lY3RhIHR1cyBtYXJrZXRwbGFjZXMgeSBhcGFyZWNlcsOhbiBhcXXDrS48L2Rpdj48L3RkPjwvdHI+YDsKfQoKLy8gLS0tLS0tLS0tLSBBRE1JTiAtLS0tLS0tLS0tCmFzeW5jIGZ1bmN0aW9uIHJlbmRlckFkbWluKCkgewogIC8vIGxhIGNvbmZpZ3VyYWNpw7NuIGRlIGxhIHBsYXRhZm9ybWEgKGFwcCBkZSBNZXJjYWRvIExpYnJlLCBjb3JyZW9zLCByZXNwYWxkbykgZXMgc29sbyBkZWwgZHVlw7FvIGRlIGxhIGFwcAogIGNvbnN0IGQgPSBhd2FpdCBhcGkoJy9hcGkvYWRtaW4vc2VsbGVycycpLCBzdCA9IHt9OwogIGNvbnN0IGZmID0gTSgnZnVsZmlsbG1lbnQnKTsKICBjb25zdCBzTmFtZSA9IGlkID0+IGQuc2VsbGVycy5maW5kKHMgPT4gcy5pZCA9PT0gaWQpPy5uYW1lIHx8ICcnOwogIGNvbnN0IHJvbGVOYW1lID0geyBhZG1pbjogJ0FkbWluaXN0cmFkb3InLCAuLi4oTSgnZnVsZmlsbG1lbnQnKSA/IHsgZnVsZmlsbG1lbnQ6ICdGdWxmaWxsbWVudCcgfSA6IHt9KSwgc2VsbGVyOiBNKCdmdWxmaWxsbWVudCcpID8gJ1ZlbmRlZG9yJyA6ICdVc3VhcmlvIGRlIGVtcHJlc2EnLCAuLi4oTSgnY29kZXMnKSA/IHsgYWdlbmNpYTogJ0FnZW5jaWEgKHNvbG8gY8OzZGlnb3MgZGUgZGV2b2x1Y2nDs24pJyB9IDoge30pIH07CiAgJCgnI21haW4nKS5pbm5lckhUTUwgPSBgCiAgPGRpdiBjbGFzcz0iZ3JpZDIiPgogICAgPGRpdiBjbGFzcz0icGFuZWwiPjxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj4ke2ZmID8gJ1ZlbmRlZG9yZXMnIDogJ0VtcHJlc2FzJ308L2gyPjwvZGl2PgogICAgICA8ZGl2IGNsYXNzPSJwYW5lbC1ib2R5IHN0YWNrIj4KICAgICAgICAke2ZmID8gJycgOiAnPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjA7Zm9udC1zaXplOjEzcHgiPkFncmVnYSBjYWRhIGVtcHJlc2EgbyB0aWVuZGEgcXVlIHZlbmRlIGVuIGxvcyBtYXJrZXRwbGFjZXMuIERlc3B1w6lzIGNvbmVjdGEgc3VzIGN1ZW50YXMgZW4gbGEgcGVzdGHDsWEgPGI+RW1wcmVzYXM8L2I+LjwvcD4nfQogICAgICAgIDxmb3JtIGNsYXNzPSJyb3ciIGlkPSJuZXdTZWxsZXIiPjxsYWJlbCBjbGFzcz0iZiI+JHtmZiA/ICdOb21icmUgZGUgbGEgdGllbmRhJyA6ICdOb21icmUgZGUgbGEgZW1wcmVzYSd9PGlucHV0IHR5cGU9InRleHQiIGlkPSJuc05hbWUiIHJlcXVpcmVkPjwvbGFiZWw+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiIHN0eWxlPSJmbGV4OjAiPkFncmVnYXI8L2J1dHRvbj48L2Zvcm0+CiAgICAgICAgPGRpdiBjbGFzcz0idGFibGUtd3JhcCI+PHRhYmxlIHN0eWxlPSJtaW4td2lkdGg6NDIwcHgiPjx0aGVhZD48dHI+PHRoPiR7ZmYgPyAnVmVuZGVkb3InIDogJ0VtcHJlc2EnfTwvdGg+PHRoPk1hcmtldHBsYWNlczwvdGg+JHtmZiA/ICc8dGg+QmxvcXVlYWRvczwvdGg+JyA6ICcnfTx0aD48L3RoPjwvdHI+PC90aGVhZD48dGJvZHk+CiAgICAgICAgJHtkLnNlbGxlcnMubWFwKHMgPT4gYDx0cj48dGQ+PGI+JHtlc2Mocy5uYW1lKX08L2I+PC90ZD48dGQ+JHtzLmNvbm5lY3Rpb25zLmZpbHRlcihjID0+IE1LW2MubWFya2V0cGxhY2VdKS5tYXAoYyA9PiBgPHNwYW4gY2xhc3M9Im1rICR7Yy5tYXJrZXRwbGFjZX0iIHRpdGxlPSIke2VzYyhjLmxhc3RfZXJyb3IgfHwgJ09LJyl9Ij4ke01LW2MubWFya2V0cGxhY2VdfSR7Yy5sYXN0X2Vycm9yID8gJyDimqAnIDogJyd9PC9zcGFuPmApLmpvaW4oJyAnKSB8fCAnPHNwYW4gY2xhc3M9Im11dGVkIj7igJQ8L3NwYW4+J308L3RkPiR7ZmYgPyBgPHRkPiR7cy5ibG9ja2VkfTwvdGQ+YCA6ICcnfTx0ZD48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWRhbmdlciBidG4tc20iIGRhdGEtZGVscz0iJHtzLmlkfSI+RWxpbWluYXI8L2J1dHRvbj48L3RkPjwvdHI+YCkuam9pbignJykgfHwgJzx0cj48dGQgY29sc3Bhbj0iNCIgY2xhc3M9Im11dGVkIj5TaW4gdmVuZGVkb3JlczwvdGQ+PC90cj4nfQogICAgICAgIDwvdGJvZHk+PC90YWJsZT48L2Rpdj4KICAgICAgPC9kaXY+PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbCI+PGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+PGgyPlVzdWFyaW9zPC9oMj48L2Rpdj4KICAgICAgPGRpdiBjbGFzcz0icGFuZWwtYm9keSBzdGFjayI+CiAgICAgICAgPGZvcm0gY2xhc3M9InN0YWNrIiBpZD0ibmV3VXNlciI+CiAgICAgICAgICA8ZGl2IGNsYXNzPSJyb3ciPjxsYWJlbCBjbGFzcz0iZiI+Tm9tYnJlPGlucHV0IHR5cGU9InRleHQiIGlkPSJudU5hbWUiIHJlcXVpcmVkPjwvbGFiZWw+PGxhYmVsIGNsYXNzPSJmIj5Db3JyZW88aW5wdXQgdHlwZT0iZW1haWwiIGlkPSJudUVtYWlsIiByZXF1aXJlZD48L2xhYmVsPjwvZGl2PgogICAgICAgICAgPGRpdiBjbGFzcz0icm93Ij48bGFiZWwgY2xhc3M9ImYiPlJvbDxzZWxlY3QgaWQ9Im51Um9sZSI+PG9wdGlvbiB2YWx1ZT0ic2VsbGVyIj4ke2ZmID8gJ1ZlbmRlZG9yJyA6ICdVc3VhcmlvIGRlIHVuYSBlbXByZXNhJ308L29wdGlvbj4ke2ZmID8gJzxvcHRpb24gdmFsdWU9ImZ1bGZpbGxtZW50Ij5GdWxmaWxsbWVudDwvb3B0aW9uPicgOiAnJ308b3B0aW9uIHZhbHVlPSJhZG1pbiI+QWRtaW5pc3RyYWRvcjwvb3B0aW9uPiR7TSgnY29kZXMnKSA/ICc8b3B0aW9uIHZhbHVlPSJhZ2VuY2lhIj5BZ2VuY2lhIChzb2xvIGPDs2RpZ29zIGRlIGRldm9sdWNpw7NuKTwvb3B0aW9uPicgOiAnJ308L3NlbGVjdD48L2xhYmVsPgogICAgICAgICAgPGxhYmVsIGNsYXNzPSJmIiBpZD0ibnVTZWxsZXJXcmFwIj4ke2ZmID8gJ1RpZW5kYScgOiAnRW1wcmVzYSd9PHNlbGVjdCBpZD0ibnVTZWxsZXIiPiR7ZC5zZWxsZXJzLm1hcChzID0+IGA8b3B0aW9uIHZhbHVlPSIke3MuaWR9Ij4ke2VzYyhzLm5hbWUpfTwvb3B0aW9uPmApLmpvaW4oJycpfTwvc2VsZWN0PjwvbGFiZWw+PC9kaXY+CiAgICAgICAgICA8ZGl2IGNsYXNzPSJyb3ciPjxsYWJlbCBjbGFzcz0iZiI+Q29udHJhc2XDsWEgaW5pY2lhbCAobcOtbi4gOCk8aW5wdXQgdHlwZT0idGV4dCIgaWQ9Im51UGFzcyIgbWlubGVuZ3RoPSI4IiByZXF1aXJlZD48L2xhYmVsPjxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgdHlwZT0ic3VibWl0IiBzdHlsZT0iZmxleDowIj5DcmVhciB1c3VhcmlvPC9idXR0b24+PC9kaXY+CiAgICAgICAgPC9mb3JtPgogICAgICAgIDxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9Im1hcmdpbjowO2ZvbnQtc2l6ZToxM3B4Ij48Yj5DbGF2ZSB0ZW1wb3JhbDo8L2I+IGNyZWEgdW5hIGNsYXZlIG51ZXZhIHF1ZSBsZSBkaWN0YXMgYWwgdmVuZGVkb3I7IGFsIGVudHJhciBkZWJlIGNhbWJpYXJsYS4gPGI+Q2xhdmUgZGUgcmVzcGFsZG86PC9iPiB1biBjw7NkaWdvIGRlIHVuIHNvbG8gdXNvIHF1ZSBlbCB2ZW5kZWRvciBndWFyZGEgcG9yIHNpIG9sdmlkYSBzdSBjbGF2ZS4gPGI+RW50cmFyIGNvbW86PC9iPiBhYnJlcyBzdSBjdWVudGEgc2luIHNhYmVyIHN1IGNsYXZlLCBwYXJhIGF5dWRhcmxvLjwvcD4KICAgICAgICA8ZGl2IGNsYXNzPSJ0YWJsZS13cmFwIj48dGFibGUgc3R5bGU9Im1pbi13aWR0aDo3NjBweCI+PHRoZWFkPjx0cj48dGg+VXN1YXJpbzwvdGg+PHRoPlJvbDwvdGg+PHRoPkFjY2VzbzwvdGg+PHRoPjwvdGg+PC90cj48L3RoZWFkPjx0Ym9keT4KICAgICAgICAke2QudXNlcnMubWFwKHUgPT4gYDx0cj48dGQ+PGI+JHtlc2ModS5uYW1lKX08L2I+PHNwYW4gY2xhc3M9Im5vdGUiPiR7ZXNjKHUuZW1haWwpfTwvc3Bhbj48L3RkPjx0ZD4ke3UuaWQgPT09IG1lLnVzZXIuaWQgPyByb2xlTmFtZVt1LnJvbGVdIDogYDxzZWxlY3QgZGF0YS1yb2xlPSIke3UuaWR9IiBzdHlsZT0id2lkdGg6YXV0bztwYWRkaW5nOjRweCA4cHgiIGFyaWEtbGFiZWw9IlJvbCI+JHtPYmplY3QuZW50cmllcyhyb2xlTmFtZSkuZmlsdGVyKChba10pID0+IGsgIT09ICdzZWxsZXInIHx8IHUuc2VsbGVyX2lkKS5tYXAoKFtrLCBuXSkgPT4gYDxvcHRpb24gdmFsdWU9IiR7a30iICR7dS5yb2xlID09PSBrID8gJ3NlbGVjdGVkJyA6ICcnfT4ke259PC9vcHRpb24+YCkuam9pbignJyl9PC9zZWxlY3Q+YH0ke3Uuc2VsbGVyX2lkID8gJyDCtyAnICsgZXNjKHNOYW1lKHUuc2VsbGVyX2lkKSkgOiAnJ308L3RkPjx0ZD4ke3UuaGFzX2JhY2t1cCA/ICc8c3BhbiBjbGFzcz0icGlsbCByZWFkeSIgc3R5bGU9Im1hcmdpbi10b3A6NHB4Ij5SZXNwYWxkbyBsaXN0bzwvc3Bhbj4nIDogJyd9JHt1Lm11c3RfY2hhbmdlID8gJyA8c3BhbiBjbGFzcz0icGlsbCB3YWl0aW5nIiBzdHlsZT0ibWFyZ2luLXRvcDo0cHgiPkRlYmUgY3JlYXIgY2xhdmUgbnVldmE8L3NwYW4+JyA6ICcnfTwvdGQ+PHRkPjxkaXYgY2xhc3M9InJvdy1hY3Rpb25zIj4KICAgICAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tZ2hvc3QgYnRuLXNtIiBkYXRhLWFjdD0idGVtcC1wYXNzd29yZCIgZGF0YS1pZD0iJHt1LmlkfSIgZGF0YS1uYW1lPSIke2VzYyh1Lm5hbWUpfSI+Q2xhdmUgdGVtcG9yYWw8L2J1dHRvbj4KICAgICAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtYWN0PSJiYWNrdXAtY29kZSIgZGF0YS1pZD0iJHt1LmlkfSIgZGF0YS1uYW1lPSIke2VzYyh1Lm5hbWUpfSI+Q2xhdmUgZGUgcmVzcGFsZG88L2J1dHRvbj4KICAgICAgICAgIDxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtYWN0PSJzZW5kLWNvZGUiIGRhdGEtaWQ9IiR7dS5pZH0iIGRhdGEtbmFtZT0iJHtlc2ModS5uYW1lKX0iPkVudmlhciBjw7NkaWdvPC9idXR0b24+CiAgICAgICAgICAke3UuaWQgPT09IG1lLnVzZXIuaWQgPyAnJyA6IGA8YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWFjdD0iaW1wZXJzb25hdGUiIGRhdGEtaWQ9IiR7dS5pZH0iIGRhdGEtbmFtZT0iJHtlc2ModS5uYW1lKX0iPkVudHJhciBjb21vPC9idXR0b24+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1kYW5nZXIgYnRuLXNtIiBkYXRhLWRlbHU9IiR7dS5pZH0iPkVsaW1pbmFyPC9idXR0b24+YH08L2Rpdj48L3RkPjwvdHI+YCkuam9pbignJyl9CiAgICAgICAgPC90Ym9keT48L3RhYmxlPjwvZGl2PgogICAgICA8L2Rpdj48L2Rpdj4KICA8L2Rpdj4KICAke21lLnNwYWNlICYmIG1lLnNwYWNlLmlkICE9PSAxID8gJzxkaXYgY2xhc3M9InBhbmVsIiBzdHlsZT0ibWFyZ2luLXRvcDoyMHB4IiBpZD0ibXlQbGFuIj48ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj48aDI+8J+SsyBNaSBwbGFuPC9oMj48L2Rpdj48ZGl2IGNsYXNzPSJwYW5lbC1ib2R5IG11dGVkIj5DYXJnYW5kb+KApjwvZGl2PjwvZGl2PicgOiAnJ30KICA8ZGl2IGNsYXNzPSJwYW5lbCIgc3R5bGU9Im1hcmdpbi10b3A6MjBweCIgaWQ9InNwTW9kcyI+PGRpdiBjbGFzcz0icGFuZWwtaGVhZCI+PGgyPuKame+4jyBNw7NkdWxvcyBkZSAke2VzYyhtZS5zcGFjZT8ubmFtZSB8fCAndHUgZXNwYWNpbycpfTwvaDI+PC9kaXY+PGRpdiBjbGFzcz0icGFuZWwtYm9keSBtdXRlZCI+Q2FyZ2FuZG/igKY8L2Rpdj48L2Rpdj4KICA8ZGl2IGNsYXNzPSJtb2RhbCIgaWQ9ImNvbmZpcm0iIGhpZGRlbj48ZGl2IGNsYXNzPSJzaGVldCI+PGgzIGlkPSJjZlRpdGxlIj7Cv1NlZ3Vybz88L2gzPjxwIGNsYXNzPSJtdXRlZCIgaWQ9ImNmVGV4dCIgc3R5bGU9Im1hcmdpbjowIj48L3A+PGRpdiBpZD0iY2ZFeHRyYSI+PC9kaXY+PGRpdiBjbGFzcz0icm93IiBzdHlsZT0ianVzdGlmeS1jb250ZW50OmZsZXgtZW5kIj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUiIGlkPSJjZk5vIiBzdHlsZT0iZmxleDowIj5DYW5jZWxhcjwvYnV0dG9uPjxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgaWQ9ImNmWWVzIiBzdHlsZT0iZmxleDowIj5Db25maXJtYXI8L2J1dHRvbj48L2Rpdj48L2Rpdj48L2Rpdj5gOwogIGNvbnN0IHJvbGUgPSAkKCcjbnVSb2xlJyk7IGNvbnN0IHN5bmMgPSAoKSA9PiAkKCcjbnVTZWxsZXJXcmFwJykuaGlkZGVuID0gcm9sZS52YWx1ZSAhPT0gJ3NlbGxlcic7IHJvbGUub25jaGFuZ2UgPSBzeW5jOyBzeW5jKCk7CiAgJCgnI25ld1NlbGxlcicpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7IGUucHJldmVudERlZmF1bHQoKTsgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL2FkbWluL3NlbGxlcnMnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IG5hbWU6ICQoJyNuc05hbWUnKS52YWx1ZSB9IH0pOyB0b2FzdCgnVmVuZGVkb3IgYWdyZWdhZG8nKTsgcmVuZGVyQWRtaW4oKTsgfSBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlKTsgfSB9OwogICQoJyNuZXdVc2VyJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsgZS5wcmV2ZW50RGVmYXVsdCgpOyB0cnkgeyBhd2FpdCBhcGkoJy9hcGkvYWRtaW4vdXNlcnMnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IG5hbWU6ICQoJyNudU5hbWUnKS52YWx1ZSwgZW1haWw6ICQoJyNudUVtYWlsJykudmFsdWUsIHJvbGU6IHJvbGUudmFsdWUsIHNlbGxlcl9pZDogJCgnI251U2VsbGVyJykudmFsdWUsIHBhc3N3b3JkOiAkKCcjbnVQYXNzJykudmFsdWUgfSB9KTsgdG9hc3QoJ1VzdWFyaW8gY3JlYWRvJyk7IHJlbmRlckFkbWluKCk7IH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSwgNDAwMCk7IH0gfTsKICBjb25zdCBjb25maXJtQm94ID0gKHRpdGxlLCB0ZXh0LCBleHRyYSA9ICcnKSA9PiBuZXcgUHJvbWlzZShyZXMgPT4gewogICAgJCgnI2NmVGl0bGUnKS50ZXh0Q29udGVudCA9IHRpdGxlOyAkKCcjY2ZUZXh0JykudGV4dENvbnRlbnQgPSB0ZXh0OyAkKCcjY2ZFeHRyYScpLmlubmVySFRNTCA9IGV4dHJhOyAkKCcjY29uZmlybScpLmhpZGRlbiA9IGZhbHNlOwogICAgJCgnI2NmTm8nKS5vbmNsaWNrID0gKCkgPT4geyAkKCcjY29uZmlybScpLmhpZGRlbiA9IHRydWU7IHJlcyhmYWxzZSk7IH07CiAgICAkKCcjY2ZZZXMnKS5vbmNsaWNrID0gKCkgPT4geyAkKCcjY29uZmlybScpLmhpZGRlbiA9IHRydWU7IHJlcyh0cnVlKTsgfTsKICB9KTsKICBkcmF3U3BhY2VNb2R1bGVzKCk7IGRyYXdNeVBsYW4oJCgnI215UGxhbicpKTsKICAkKCcjbWFpbicpLm9uY2hhbmdlID0gYXN5bmMgZSA9PiB7IGNvbnN0IHIgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1yb2xlXScpOyBpZiAoIXIpIHJldHVybjsgdHJ5IHsgYXdhaXQgYXBpKGAvYXBpL2FkbWluL3VzZXJzLyR7ci5kYXRhc2V0LnJvbGV9L3JvbGVgLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IHJvbGU6IHIudmFsdWUgfSB9KTsgdG9hc3QoJ1JvbCBhY3R1YWxpemFkbyAoZGViZSB2b2x2ZXIgYSBpbmljaWFyIHNlc2nDs24pJyk7IH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IHJlbmRlckFkbWluKCk7IH0gfTsKICAkKCcjbWFpbicpLm9uY2xpY2sgPSBhc3luYyBlID0+IHsKICAgIGNvbnN0IGNwID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtY29weV0nKTsKICAgIGlmIChjcCkgeyBlLnByZXZlbnREZWZhdWx0KCk7IHRyeSB7IGF3YWl0IG5hdmlnYXRvci5jbGlwYm9hcmQud3JpdGVUZXh0KGNwLmRhdGFzZXQuY29weSk7IHRvYXN0KCdDb3BpYWRvJyk7IH0gY2F0Y2ggeyBjcC5wcmV2aW91c0VsZW1lbnRTaWJsaW5nLnNlbGVjdCgpOyB9IHJldHVybjsgfQogICAgY29uc3QgYWN0ID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtYWN0XScpOwogICAgaWYgKGFjdCkgewogICAgICBjb25zdCBpZCA9IGFjdC5kYXRhc2V0LmlkLCBuYW1lID0gYWN0LmRhdGFzZXQubmFtZSwga2luZCA9IGFjdC5kYXRhc2V0LmFjdDsKICAgICAgY29uc3QgdGV4dHMgPSB7CiAgICAgICAgJ3RlbXAtcGFzc3dvcmQnOiBbJ0NsYXZlIHRlbXBvcmFsJywgYFNlIHJlZW1wbGF6YSBsYSBjbGF2ZSBhY3R1YWwgZGUgJHtuYW1lfS4gQWwgZW50cmFyIGNvbiBsYSBjbGF2ZSB0ZW1wb3JhbCB0ZW5kcsOhIHF1ZSBjcmVhciB1bmEgbnVldmEuYF0sCiAgICAgICAgJ2JhY2t1cC1jb2RlJzogWydDbGF2ZSBkZSByZXNwYWxkbycsIGBTZSBjcmVhIHVuIGPDs2RpZ28gZGUgdW4gc29sbyB1c28gcGFyYSAke25hbWV9LiBTaSB5YSB0ZW7DrWEgdW5vLCBlbCBhbnRlcmlvciBkZWphIGRlIHNlcnZpci5gXSwKICAgICAgICAnc2VuZC1jb2RlJzogWydFbnZpYXIgY8OzZGlnbycsIGBMZSBsbGVnYSBhICR7bmFtZX0gdW4gY8OzZGlnbyBkZSA2IGTDrWdpdG9zIGEgc3UgY29ycmVvIHBhcmEgZW50cmFyIG8gY2FtYmlhciBzdSBjbGF2ZS5gXSwKICAgICAgICAnaW1wZXJzb25hdGUnOiBbJ0VudHJhciBjb21vICcgKyBuYW1lLCAnVmVyw6FzIGxhIGFwcCBjb21vIGxhIHZlIGVzdGEgcGVyc29uYSwgc2luIG5lY2VzaXRhciBzdSBjbGF2ZS4gUXVlZGEgcmVnaXN0cmFkby4gUGFyYSBzYWxpciBhcHJpZXRhICJWb2x2ZXIgYSBtaSBjdWVudGEiLiddLAogICAgICB9OwogICAgICBpZiAoIWF3YWl0IGNvbmZpcm1Cb3godGV4dHNba2luZF1bMF0sIHRleHRzW2tpbmRdWzFdKSkgcmV0dXJuOwogICAgICB0cnkgewogICAgICAgIGNvbnN0IHIgPSBhd2FpdCBhcGkoYC9hcGkvYWRtaW4vdXNlcnMvJHtpZH0vJHtraW5kfWAsIHsgbWV0aG9kOiAnUE9TVCcgfSk7CiAgICAgICAgaWYgKGtpbmQgPT09ICdpbXBlcnNvbmF0ZScpIHsgbG9jYXRpb24uaHJlZiA9ICcvJzsgcmV0dXJuOyB9CiAgICAgICAgaWYgKHIucGFzc3dvcmQgfHwgci5jb2RlKSB7CiAgICAgICAgICBjb25zdCB2YWwgPSByLnBhc3N3b3JkIHx8IHIuY29kZTsKICAgICAgICAgIGF3YWl0IGNvbmZpcm1Cb3goa2luZCA9PT0gJ3RlbXAtcGFzc3dvcmQnID8gJ0NsYXZlIHRlbXBvcmFsIGRlICcgKyBuYW1lIDogJ0NsYXZlIGRlIHJlc3BhbGRvIGRlICcgKyBuYW1lLAogICAgICAgICAgICBraW5kID09PSAndGVtcC1wYXNzd29yZCcgPyAnRMOtc2VsYSBhbCB1c3VhcmlvLiBTb2xvIHNlIG11ZXN0cmEgYWhvcmE7IGFsIGVudHJhciB0ZW5kcsOhIHF1ZSBjcmVhciBzdSBwcm9waWEgY2xhdmUuJyA6ICdQw6FzYXNlbGEgYWwgdXN1YXJpbyBwYXJhIHF1ZSBsYSBndWFyZGUgZW4gdW4gbHVnYXIgc2VndXJvLiBTaXJ2ZSB1bmEgc29sYSB2ZXosIGVuIGVsIGNhbXBvIENvbnRyYXNlw7FhLiBTb2xvIHNlIG11ZXN0cmEgYWhvcmEuJywKICAgICAgICAgICAgYDxkaXYgY2xhc3M9ImNvcHkiPjxpbnB1dCB0eXBlPSJ0ZXh0IiByZWFkb25seSB2YWx1ZT0iJHtlc2ModmFsKX0iIHN0eWxlPSJmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6MjBweDt0ZXh0LWFsaWduOmNlbnRlciI+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1jb3B5PSIke2VzYyh2YWwpfSI+Q29waWFyPC9idXR0b24+PC9kaXY+YCk7CiAgICAgICAgfSBlbHNlIHRvYXN0KHIubWVzc2FnZSB8fCAnTGlzdG8nKTsKICAgICAgICByZW5kZXJBZG1pbigpOwogICAgICB9IGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UsIDUwMDApOyB9CiAgICAgIHJldHVybjsKICAgIH0KICAgIGNvbnN0IHMgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1kZWxzXScpLCB1ID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtZGVsdV0nKSwgcCA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLXB3XScpOwogICAgaWYgKHMgJiYgYXdhaXQgY29uZmlybUJveCgnRWxpbWluYXIgdmVuZGVkb3InLCAnU2UgYm9ycmFuIHN1cyBjb25leGlvbmVzLCBibG9xdWVvcywgcGVkaWRvcyB5IHVzdWFyaW9zLicpKSB7IGF3YWl0IGFwaShgL2FwaS9hZG1pbi9zZWxsZXJzLyR7cy5kYXRhc2V0LmRlbHN9YCwgeyBtZXRob2Q6ICdERUxFVEUnIH0pOyB0b2FzdCgnVmVuZGVkb3IgZWxpbWluYWRvJyk7IHJlbmRlckFkbWluKCk7IH0KICAgIGlmICh1ICYmIGF3YWl0IGNvbmZpcm1Cb3goJ0VsaW1pbmFyIHVzdWFyaW8nLCAnWWEgbm8gcG9kcsOhIGVudHJhciBhIEV0aXF1ZXRhSHViLicpKSB7IGF3YWl0IGFwaShgL2FwaS9hZG1pbi91c2Vycy8ke3UuZGF0YXNldC5kZWx1fWAsIHsgbWV0aG9kOiAnREVMRVRFJyB9KTsgdG9hc3QoJ1VzdWFyaW8gZWxpbWluYWRvJyk7IHJlbmRlckFkbWluKCk7IH0KICAgIGlmIChwICYmIGF3YWl0IGNvbmZpcm1Cb3goJ0NhbWJpYXIgY29udHJhc2XDsWEnLCAnRXNjcmliZSBsYSBudWV2YSBjb250cmFzZcOxYSAobcOtbmltbyA4IGNhcmFjdGVyZXMpLicsICc8aW5wdXQgdHlwZT0idGV4dCIgaWQ9ImNmUHciIG1pbmxlbmd0aD0iOCI+JykpIHsKICAgICAgdHJ5IHsgYXdhaXQgYXBpKGAvYXBpL2FkbWluL3VzZXJzLyR7cC5kYXRhc2V0LnB3fS9wYXNzd29yZGAsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgcGFzc3dvcmQ6ICQoJyNjZlB3JykudmFsdWUgfSB9KTsgdG9hc3QoJ0NvbnRyYXNlw7FhIGFjdHVhbGl6YWRhJyk7IH0gY2F0Y2ggKGVycikgeyB0b2FzdChlcnIubWVzc2FnZSk7IH0KICAgIH0KICB9Owp9CgovLyAtLS0tLS0tLS0tIE5VQkUgREUgRU1QUkVTQVMgKHNvbG8gZHVlw7FvcyBkZSBsYSBhcHApOiB0b2RhcyBsYXMgZW1wcmVzYXMgcmVnaXN0cmFkYXMgeSBsYSBjb25maWd1cmFjacOzbiBnZW5lcmFsIC0tLS0tLS0tLS0KYXN5bmMgZnVuY3Rpb24gcmVuZGVyQ2xvdWQoKSB7CiAgaWYgKCFtZS5vd25lcikgeyB0YWIgPSAndHJheSc7IHJldHVybiByZW5kZXJUYWIoKTsgfQogICQoJyNtYWluJykuaW5uZXJIVE1MID0gJzxkaXYgY2xhc3M9InBhbmVsIiBzdHlsZT0ibWFyZ2luLXRvcDoyMHB4Ij48ZGl2IGNsYXNzPSJwYW5lbC1ib2R5IG11dGVkIj5DYXJnYW5kb+KApjwvZGl2PjwvZGl2Pic7CiAgY29uc3Qgc3QgPSBhd2FpdCBhcGkoJy9hcGkvYWRtaW4vc2V0dGluZ3MnKTsKICAkKCcjbWFpbicpLmlubmVySFRNTCA9IGAKICA8ZGl2IGNsYXNzPSJzZWN0aW9uLXRpdGxlIiBzdHlsZT0ibWFyZ2luLXRvcDoyMnB4Ij48aDI+4piB77iPIE51YmUgZGUgZW1wcmVzYXM8L2gyPjxzcGFuIGNsYXNzPSJtdXRlZCI+VG9kYXMgbGFzIGVtcHJlc2FzIHF1ZSB1c2FuIEV0aXF1ZXRhSHViIMK3IHNvbG8gbGEgdmVuIGxvcyBkdWXDsW9zIGRlIGxhIGFwcDwvc3Bhbj48L2Rpdj4KICA8ZGl2IGNsYXNzPSJwYW5lbCIgaWQ9Im93bmVyU3BhY2VzIj48ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj48aDI+RW1wcmVzYXMgcmVnaXN0cmFkYXM8L2gyPjwvZGl2PjxkaXYgY2xhc3M9InBhbmVsLWJvZHkgbXV0ZWQiPkNhcmdhbmRv4oCmPC9kaXY+PC9kaXY+CiAgPGRpdiBjbGFzcz0icGFuZWwgc3RhY2siIHN0eWxlPSJtYXJnaW4tdG9wOjIwcHgiIGlkPSJvd25lckJpbGxpbmciPjxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj7wn5KzIENvYnJvcyBjb24gTWVyY2FkbyBQYWdvPC9oMj48L2Rpdj48ZGl2IGNsYXNzPSJwYW5lbC1ib2R5IHN0YWNrIG11dGVkIj5DYXJnYW5kb+KApjwvZGl2PjwvZGl2PgogIDxkaXYgY2xhc3M9InBhbmVsIiBzdHlsZT0ibWFyZ2luLXRvcDoyMHB4Ij48ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj48aDI+RW5sYWNlcyDDunRpbGVzPC9oMj48L2Rpdj4KICAgIDxkaXYgY2xhc3M9InBhbmVsLWJvZHkiPjx1bCBzdHlsZT0ibGlzdC1zdHlsZTpub25lO21hcmdpbjowO3BhZGRpbmc6MCI+PGxpIHN0eWxlPSJkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDoycHg7cGFkZGluZzoxMHB4IDA7Ym9yZGVyLXRvcDoxcHggc29saWQgdmFyKC0tbGluZSkiPjxhIGhyZWY9Imh0dHBzOi8vZXRpcXVldGFodWItamF2aS5vbnJlbmRlci5jb20iIHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIiBzdHlsZT0iZm9udC13ZWlnaHQ6NzAwIj5UdSBhcHAgRXRpcXVldGFIdWI8L2E+PHNwYW4gY2xhc3M9Im1vbm8gbXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTJweCI+aHR0cHM6Ly9ldGlxdWV0YWh1Yi1qYXZpLm9ucmVuZGVyLmNvbTwvc3Bhbj48c3BhbiBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTNweCI+RXN0YSBtaXNtYSBhcHAuIENvbXDDoXJ0ZWxhIGNvbiBsb3MgdmVuZGVkb3JlcyB5IGVsIGZ1bGZpbGxtZW50Ljwvc3Bhbj48L2xpPjxsaSBzdHlsZT0iZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6MnB4O3BhZGRpbmc6MTBweCAwO2JvcmRlci10b3A6MXB4IHNvbGlkIHZhcigtLWxpbmUpIj48YSBocmVmPSJodHRwczovL2RldmVsb3BlcnMubWVyY2Fkb2xpYnJlLmNsL2RldmNlbnRlciIgdGFyZ2V0PSJfYmxhbmsiIHJlbD0ibm9vcGVuZXIiIHN0eWxlPSJmb250LXdlaWdodDo3MDAiPk1lcmNhZG8gTGlicmUgRGV2ZWxvcGVyczwvYT48c3BhbiBjbGFzcz0ibW9ubyBtdXRlZCIgc3R5bGU9ImZvbnQtc2l6ZToxMnB4Ij5odHRwczovL2RldmVsb3BlcnMubWVyY2Fkb2xpYnJlLmNsL2RldmNlbnRlcjwvc3Bhbj48c3BhbiBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTNweCI+RG9uZGUgZXN0w6EgbGEgYXBsaWNhY2nDs24gRXRpcXVldGFIdWIgeSBzdSBTZWNyZXQgS2V5LiBFbnRyYXMgY29uIHR1IGN1ZW50YSBub3JtYWwgZGUgTWVyY2FkbyBMaWJyZS48L3NwYW4+PC9saT48bGkgc3R5bGU9ImRpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjJweDtwYWRkaW5nOjEwcHggMDtib3JkZXItdG9wOjFweCBzb2xpZCB2YXIoLS1saW5lKSI+PGEgaHJlZj0iaHR0cHM6Ly9kYXNoYm9hcmQucmVuZGVyLmNvbSIgdGFyZ2V0PSJfYmxhbmsiIHJlbD0ibm9vcGVuZXIiIHN0eWxlPSJmb250LXdlaWdodDo3MDAiPlJlbmRlcjwvYT48c3BhbiBjbGFzcz0ibW9ubyBtdXRlZCIgc3R5bGU9ImZvbnQtc2l6ZToxMnB4Ij5odHRwczovL2Rhc2hib2FyZC5yZW5kZXIuY29tPC9zcGFuPjxzcGFuIGNsYXNzPSJtdXRlZCIgc3R5bGU9ImZvbnQtc2l6ZToxM3B4Ij5Eb25kZSB2aXZlIGxhIGFwcC4gQXF1w60gc2UgcHVibGljYSBjYWRhIHZlcnNpw7NuIG51ZXZhIChNYW51YWwgRGVwbG95KS48L3NwYW4+PC9saT48bGkgc3R5bGU9ImRpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjJweDtwYWRkaW5nOjEwcHggMDtib3JkZXItdG9wOjFweCBzb2xpZCB2YXIoLS1saW5lKSI+PGEgaHJlZj0iaHR0cHM6Ly9naXRodWIuY29tL2VkdWFyZG9kaW5hcmRpOTYtYm9vcC9ldGlxdWV0YWh1YiIgdGFyZ2V0PSJfYmxhbmsiIHJlbD0ibm9vcGVuZXIiIHN0eWxlPSJmb250LXdlaWdodDo3MDAiPkdpdEh1YjwvYT48c3BhbiBjbGFzcz0ibW9ubyBtdXRlZCIgc3R5bGU9ImZvbnQtc2l6ZToxMnB4Ij5odHRwczovL2dpdGh1Yi5jb20vZWR1YXJkb2RpbmFyZGk5Ni1ib29wL2V0aXF1ZXRhaHViPC9zcGFuPjxzcGFuIGNsYXNzPSJtdXRlZCIgc3R5bGU9ImZvbnQtc2l6ZToxM3B4Ij5FbCBjw7NkaWdvIGRlIGxhIGFwcCB5IGVsIHJlc3BhbGRvIGF1dG9tw6F0aWNvIGNhZGEgMTUgbWludXRvcy48L3NwYW4+PC9saT48bGkgc3R5bGU9ImRpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47Z2FwOjJweDtwYWRkaW5nOjEwcHggMDtib3JkZXItdG9wOjFweCBzb2xpZCB2YXIoLS1saW5lKSI+PGEgaHJlZj0iaHR0cHM6Ly9hcHAuYnJldm8uY29tIiB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciIgc3R5bGU9ImZvbnQtd2VpZ2h0OjcwMCI+QnJldm88L2E+PHNwYW4gY2xhc3M9Im1vbm8gbXV0ZWQiIHN0eWxlPSJmb250LXNpemU6MTJweCI+aHR0cHM6Ly9hcHAuYnJldm8uY29tPC9zcGFuPjxzcGFuIGNsYXNzPSJtdXRlZCIgc3R5bGU9ImZvbnQtc2l6ZToxM3B4Ij5FbCBzZXJ2aWNpbyBxdWUgZW52w61hIGxvcyBjb3JyZW9zIGNvbiBjw7NkaWdvcyBwYXJhIHJlY3VwZXJhciBjb250cmFzZcOxYS48L3NwYW4+PC9saT48L3VsPjwvZGl2PjwvZGl2PgogIDxkaXYgY2xhc3M9InBhbmVsIiBzdHlsZT0ibWFyZ2luLXRvcDoyMHB4Ij48ZGl2IGNsYXNzPSJwYW5lbC1oZWFkIj48aDI+Q29uZXhpw7NuIGNvbiBNZXJjYWRvIExpYnJlPC9oMj4ke3N0Lm1sX2NsaWVudF9pZCAmJiBzdC5tbF9zZWNyZXRfc2V0ID8gJzxzcGFuIGNsYXNzPSJzdGF0ZSBvbiI+PGk+PC9pPkNvbmZpZ3VyYWRhPC9zcGFuPicgOiAnPHNwYW4gY2xhc3M9InN0YXRlIGVyciI+PGk+PC9pPkZhbHRhIGNvbmZpZ3VyYXI8L3NwYW4+J308L2Rpdj4KICAgIDxkaXYgY2xhc3M9InBhbmVsLWJvZHkgc3RhY2siPgogICAgICA8cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJtYXJnaW46MCI+Q3JlYSB1bmEgYXBsaWNhY2nDs24gZW4gPGEgaHJlZj0iaHR0cHM6Ly9kZXZlbG9wZXJzLm1lcmNhZG9saWJyZS5jbC9kZXZjZW50ZXIiIHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIj5kZXZlbG9wZXJzLm1lcmNhZG9saWJyZS5jbDwvYT4gY29uIGVzdG9zIGRhdG9zIHkgcGVnYSBhcXXDrSBzdSBBcHAgSUQgeSBTZWNyZXQgS2V5LiBVbmEgc29sYSBhcHAgc2lydmUgcGFyYSB0b2RvcyBsb3MgdmVuZGVkb3Jlcy48L3A+CiAgICAgIDxsYWJlbCBjbGFzcz0iZiI+VVJJIGRlIHJlZGlyZWN0PHNwYW4gY2xhc3M9ImNvcHkiPjxpbnB1dCB0eXBlPSJ0ZXh0IiByZWFkb25seSB2YWx1ZT0iJHtlc2Moc3QubWxfcmVkaXJlY3RfdXJpKX0iPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtY29weT0iJHtlc2Moc3QubWxfcmVkaXJlY3RfdXJpKX0iPkNvcGlhcjwvYnV0dG9uPjwvc3Bhbj48L2xhYmVsPgogICAgICA8bGFiZWwgY2xhc3M9ImYiPlVSTCBkZSBub3RpZmljYWNpb25lcyAodMOzcGljb3M6IG9yZGVyc192MiB5IHNoaXBtZW50cyk8c3BhbiBjbGFzcz0iY29weSI+PGlucHV0IHR5cGU9InRleHQiIHJlYWRvbmx5IHZhbHVlPSIke2VzYyhzdC5tbF9ub3RpZmljYXRpb25zX3VybCl9Ij48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWNvcHk9IiR7ZXNjKHN0Lm1sX25vdGlmaWNhdGlvbnNfdXJsKX0iPkNvcGlhcjwvYnV0dG9uPjwvc3Bhbj48L2xhYmVsPgogICAgICA8Zm9ybSBjbGFzcz0icm93IiBpZD0ibWxDZmciPjxsYWJlbCBjbGFzcz0iZiI+QXBwIElEPGlucHV0IHR5cGU9InRleHQiIGlkPSJtbElkIiB2YWx1ZT0iJHtlc2Moc3QubWxfY2xpZW50X2lkKX0iIHJlcXVpcmVkPjwvbGFiZWw+PGxhYmVsIGNsYXNzPSJmIj5TZWNyZXQgS2V5PGlucHV0IHR5cGU9InBhc3N3b3JkIiBpZD0ibWxTZWNyZXQiIHBsYWNlaG9sZGVyPSIke3N0Lm1sX3NlY3JldF9zZXQgPyAn4oCi4oCi4oCi4oCi4oCi4oCiIChndWFyZGFkYSknIDogJyd9Ij48L2xhYmVsPjxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgdHlwZT0ic3VibWl0IiBzdHlsZT0iZmxleDowIj5HdWFyZGFyPC9idXR0b24+PC9mb3JtPgogICAgPC9kaXY+PC9kaXY+CiAgPGRpdiBjbGFzcz0icGFuZWwiIHN0eWxlPSJtYXJnaW4tdG9wOjIwcHgiPjxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj5Db3JyZW9zIChyZWN1cGVyYXIgY29udHJhc2XDsWEpPC9oMj4ke3N0Lm1haWxfa2V5X3NldCAmJiBzdC5tYWlsX2Zyb20gPyAnPHNwYW4gY2xhc3M9InN0YXRlIG9uIj48aT48L2k+QWN0aXZhZG88L3NwYW4+JyA6ICc8c3BhbiBjbGFzcz0ic3RhdGUgZXJyIj48aT48L2k+U2luIGNvbmZpZ3VyYXI8L3NwYW4+J308L2Rpdj4KICAgIDxkaXYgY2xhc3M9InBhbmVsLWJvZHkgc3RhY2siPgogICAgICA8cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJtYXJnaW46MCI+UGFyYSBlbnZpYXIgbG9zIGPDs2RpZ29zIGRlIDYgZMOtZ2l0b3Mgc2UgdXNhIDxhIGhyZWY9Imh0dHBzOi8vd3d3LmJyZXZvLmNvbSIgdGFyZ2V0PSJfYmxhbmsiIHJlbD0ibm9vcGVuZXIiPkJyZXZvPC9hPiAoZ3JhdGlzIGhhc3RhIDMwMCBjb3JyZW9zIGFsIGTDrWEpLiBDcmVhIHVuYSBjdWVudGEsIHZlcmlmaWNhIGVsIGNvcnJlbyByZW1pdGVudGUgeSBjb3BpYSB1bmEgQVBJIEtleSAoQ29uZmlndXJhY2nDs24g4oC6IFNNVFAgeSBBUEkg4oC6IEFQSSBLZXlzKS48L3A+CiAgICAgIDxmb3JtIGNsYXNzPSJzdGFjayIgaWQ9Im1haWxDZmciPgogICAgICAgIDxkaXYgY2xhc3M9InJvdyI+PGxhYmVsIGNsYXNzPSJmIj5Db3JyZW8gcmVtaXRlbnRlICh2ZXJpZmljYWRvIGVuIEJyZXZvKTxpbnB1dCB0eXBlPSJlbWFpbCIgaWQ9Im1Gcm9tIiB2YWx1ZT0iJHtlc2Moc3QubWFpbF9mcm9tIHx8ICcnKX0iIHJlcXVpcmVkPjwvbGFiZWw+PGxhYmVsIGNsYXNzPSJmIj5Ob21icmUgcmVtaXRlbnRlPGlucHV0IHR5cGU9InRleHQiIGlkPSJtTmFtZSIgdmFsdWU9IiR7ZXNjKHN0Lm1haWxfZnJvbV9uYW1lIHx8ICdFdGlxdWV0YUh1YicpfSI+PC9sYWJlbD48L2Rpdj4KICAgICAgICA8ZGl2IGNsYXNzPSJyb3ciPjxsYWJlbCBjbGFzcz0iZiI+QVBJIEtleSBkZSBCcmV2bzxpbnB1dCB0eXBlPSJwYXNzd29yZCIgaWQ9Im1LZXkiIHBsYWNlaG9sZGVyPSIke3N0Lm1haWxfa2V5X3NldCA/ICfigKLigKLigKLigKLigKLigKIgKGd1YXJkYWRhKScgOiAneGtleXNpYi3igKYnfSI+PC9sYWJlbD48bGFiZWwgY2xhc3M9ImYiPkVudmlhciBwcnVlYmEgYSAob3BjaW9uYWwpPGlucHV0IHR5cGU9ImVtYWlsIiBpZD0ibVRlc3QiIHZhbHVlPSIke2VzYyhtZS51c2VyLmVtYWlsKX0iPjwvbGFiZWw+PC9kaXY+CiAgICAgICAgPGRpdiBjbGFzcz0icm93IiBzdHlsZT0ianVzdGlmeS1jb250ZW50OmZsZXgtZW5kIj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIHR5cGU9InN1Ym1pdCIgc3R5bGU9ImZsZXg6MCI+R3VhcmRhcjwvYnV0dG9uPjwvZGl2PgogICAgICA8L2Zvcm0+CiAgICA8L2Rpdj48L2Rpdj4KICA8ZGl2IGNsYXNzPSJwYW5lbCIgaWQ9ImJrUGFuZWwiIHN0eWxlPSJtYXJnaW4tdG9wOjIwcHgiPjxkaXYgY2xhc3M9InBhbmVsLWhlYWQiPjxoMj5SZXNwYWxkbyBpbm1lZGlhdG8gKHF1ZSBubyBzZSBwaWVyZGEgbmFkYSk8L2gyPiR7c3QuYmFja3VwPy5jb25maWd1cmVkID8gYDxzcGFuIGNsYXNzPSJzdGF0ZSBvbiI+PGk+PC9pPkFjdGl2YWRvJHtzdC5iYWNrdXAubGFzdE9rQXQgPyAnIMK3IMO6bHRpbW8gJyArIGVzYyhmbXRUaW1lKHN0LmJhY2t1cC5sYXN0T2tBdCkpIDogJyd9PC9zcGFuPmAgOiAnPHNwYW4gY2xhc3M9InN0YXRlIGVyciI+PGk+PC9pPlNpbiBhY3RpdmFyPC9zcGFuPid9PC9kaXY+CiAgICA8ZGl2IGNsYXNzPSJwYW5lbC1ib2R5IHN0YWNrIj4KICAgICAgPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjAiPlJlbmRlciAoZWwgc2Vydmlkb3IgZ3JhdGlzKSBhIHZlY2VzIHJlaW5pY2lhIGxhIGFwcCB5IGJvcnJhIGxvIMO6bHRpbW8gcXVlIHNlIGhpem8uIENvbiBlc3RvLCBjYWRhIGNhbWJpbyAoaW1wcmltaXIsIGRlc2Jsb3F1ZWFy4oCmKSBzZSBndWFyZGEgZW4gR2l0SHViIGEgbG9zIHBvY29zIHNlZ3VuZG9zIHkgYWwgcmVpbmljaWFyIG5vIHNlIHBpZXJkZSBuYWRhLjwvcD4KICAgICAgPG9sIGNsYXNzPSJtdXRlZCIgc3R5bGU9Im1hcmdpbjowO3BhZGRpbmctbGVmdDoxOHB4Ij4KICAgICAgICA8bGk+QWJyZSA8YSBocmVmPSJodHRwczovL2dpdGh1Yi5jb20vc2V0dGluZ3MvcGVyc29uYWwtYWNjZXNzLXRva2Vucy9uZXciIHRhcmdldD0iX2JsYW5rIiByZWw9Im5vb3BlbmVyIj5HaXRIdWIg4oC6IEZpbmUtZ3JhaW5lZCB0b2tlbiBudWV2bzwvYT4uPC9saT4KICAgICAgICA8bGk+Tm9tYnJlOiA8Yj5FdGlxdWV0YUh1YiByZXNwYWxkbzwvYj4gwrcgRXhwaXJhY2nDs246IGxhIG3DoXMgbGFyZ2EgKG8gc2luIHZlbmNpbWllbnRvKS48L2xpPgogICAgICAgIDxsaT5SZXBvc2l0b3J5IGFjY2VzczogPGI+T25seSBzZWxlY3QgcmVwb3NpdG9yaWVzPC9iPiDigLogPGI+ZXRpcXVldGFodWI8L2I+LjwvbGk+CiAgICAgICAgPGxpPlBlcm1pc3Npb25zIOKAuiBSZXBvc2l0b3J5IHBlcm1pc3Npb25zIOKAuiA8Yj5Db250ZW50czogUmVhZCBhbmQgd3JpdGU8L2I+LjwvbGk+CiAgICAgICAgPGxpPkdlbmVyYXRlIHRva2VuLCBjw7NwaWFsbyB5IHDDqWdhbG8gYXF1w60gYWJham8uPC9saT4KICAgICAgPC9vbD4KICAgICAgJHtzdC5iYWNrdXA/Lmxhc3RFcnJvciA/IGA8cCBjbGFzcz0ibm90ZSBiYWQiIHN0eWxlPSJtYXJnaW46MCI+w5psdGltbyBlcnJvcjogJHtlc2Moc3QuYmFja3VwLmxhc3RFcnJvcil9PC9wPmAgOiAnJ30KICAgICAgPGZvcm0gY2xhc3M9InJvdyIgaWQ9ImdoQ2ZnIj48bGFiZWwgY2xhc3M9ImYiPlRva2VuIGRlIEdpdEh1YjxpbnB1dCB0eXBlPSJwYXNzd29yZCIgaWQ9ImdoVG9rIiBwbGFjZWhvbGRlcj0iJHtzdC5naF90b2tlbl9zZXQgPyAn4oCi4oCi4oCi4oCi4oCi4oCiIChndWFyZGFkbyknIDogJ2dpdGh1Yl9wYXRf4oCmJ30iIGF1dG9jb21wbGV0ZT0ib2ZmIj48L2xhYmVsPjxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgdHlwZT0ic3VibWl0IiBzdHlsZT0iZmxleDowIj5HdWFyZGFyIHkgcmVzcGFsZGFyIGFob3JhPC9idXR0b24+PC9mb3JtPgogICAgPC9kaXY+PC9kaXY+CiAgPGRpdiBjbGFzcz0ibW9kYWwiIGlkPSJjb25maXJtIiBoaWRkZW4+PGRpdiBjbGFzcz0ic2hlZXQiPjxoMyBpZD0iY2ZUaXRsZSI+wr9TZWd1cm8/PC9oMz48cCBjbGFzcz0ibXV0ZWQiIGlkPSJjZlRleHQiIHN0eWxlPSJtYXJnaW46MCI+PC9wPjxkaXYgaWQ9ImNmRXh0cmEiPjwvZGl2PjxkaXYgY2xhc3M9InJvdyIgc3R5bGU9Imp1c3RpZnktY29udGVudDpmbGV4LWVuZCI+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIiBpZD0iY2ZObyIgc3R5bGU9ImZsZXg6MCI+Q2FuY2VsYXI8L2J1dHRvbj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLXByaW1hcnkiIGlkPSJjZlllcyIgc3R5bGU9ImZsZXg6MCI+Q29uZmlybWFyPC9idXR0b24+PC9kaXY+PC9kaXY+PC9kaXY+YDsKICBpZiAoJCgnI21haWxDZmcnKSkgJCgnI21haWxDZmcnKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4gewogICAgZS5wcmV2ZW50RGVmYXVsdCgpOwogICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL2FkbWluL3NldHRpbmdzJywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBtYWlsX2Zyb206ICQoJyNtRnJvbScpLnZhbHVlLCBtYWlsX2Zyb21fbmFtZTogJCgnI21OYW1lJykudmFsdWUsIG1haWxfYXBpX2tleTogJCgnI21LZXknKS52YWx1ZSwgdGVzdF90bzogJCgnI21UZXN0JykudmFsdWUgfSB9KTsgdG9hc3QoJCgnI21UZXN0JykudmFsdWUgPyAnR3VhcmRhZG8uIFRlIGVudmlhbW9zIHVuIGNvcnJlbyBkZSBwcnVlYmEuJyA6ICdHdWFyZGFkbycpOyByZW5kZXJDbG91ZCgpOyB9CiAgICBjYXRjaCAoeCkgeyB0b2FzdCh4Lm1lc3NhZ2UsIDUwMDApOyB9CiAgfTsKICBpZiAoJCgnI2doQ2ZnJykpICQoJyNnaENmZycpLm9uc3VibWl0ID0gYXN5bmMgZSA9PiB7CiAgICBlLnByZXZlbnREZWZhdWx0KCk7IGNvbnN0IHYgPSAkKCcjZ2hUb2snKS52YWx1ZS50cmltKCk7IGlmICghdikgcmV0dXJuIHRvYXN0KCdQZWdhIGVsIHRva2VuIGRlIEdpdEh1YicpOwogICAgY29uc3QgYiA9IGUudGFyZ2V0LnF1ZXJ5U2VsZWN0b3IoJ2J1dHRvbicpOyBiLmRpc2FibGVkID0gdHJ1ZTsgYi50ZXh0Q29udGVudCA9ICdHdWFyZGFuZG8gcmVzcGFsZG/igKYnOwogICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL2FkbWluL3NldHRpbmdzJywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBnaF90b2tlbjogdiB9IH0pOyB0b2FzdCgnwqFMaXN0byEgUmVzcGFsZG8gaW5tZWRpYXRvIGFjdGl2YWRvJywgNTAwMCk7IHJlbmRlckNsb3VkKCk7IH0KICAgIGNhdGNoICh4KSB7IHRvYXN0KHgubWVzc2FnZSwgNzAwMCk7IGIuZGlzYWJsZWQgPSBmYWxzZTsgYi50ZXh0Q29udGVudCA9ICdHdWFyZGFyIHkgcmVzcGFsZGFyIGFob3JhJzsgfQogIH07CiAgaWYgKCQoJyNtbENmZycpKSAkKCcjbWxDZmcnKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4geyBlLnByZXZlbnREZWZhdWx0KCk7IGF3YWl0IGFwaSgnL2FwaS9hZG1pbi9zZXR0aW5ncycsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgbWxfY2xpZW50X2lkOiAkKCcjbWxJZCcpLnZhbHVlLCBtbF9jbGllbnRfc2VjcmV0OiAkKCcjbWxTZWNyZXQnKS52YWx1ZSB9IH0pOyB0b2FzdCgnTWVyY2FkbyBMaWJyZSBjb25maWd1cmFkbycpOyBtZS5tbENvbmZpZ3VyZWQgPSB0cnVlOyByZW5kZXJDbG91ZCgpOyB9OwogICQoJyNtYWluJykub25jbGljayA9IGFzeW5jIGUgPT4gewogICAgY29uc3QgY3AgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1jb3B5XScpOwogICAgaWYgKGNwKSB7IGUucHJldmVudERlZmF1bHQoKTsgdHJ5IHsgYXdhaXQgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQoY3AuZGF0YXNldC5jb3B5KTsgdG9hc3QoJ0NvcGlhZG8nKTsgfSBjYXRjaCB7IGNwLnByZXZpb3VzRWxlbWVudFNpYmxpbmcuc2VsZWN0KCk7IH0gfQogIH07CiAgZHJhd093bmVyU3BhY2VzKCk7IGRyYXdPd25lckJpbGxpbmcoKTsKfQoKLy8gLS0tLS0tLS0tLSBNaSBwbGFuOiBzdXNjcmlwY2nDs24gbWVuc3VhbCBjb24gTWVyY2FkbyBQYWdvIC0tLS0tLS0tLS0KY29uc3QgZm10RGF5ID0geCA9PiB4ID8gbmV3IERhdGUoeCArICdUMTI6MDA6MDAnKS50b0xvY2FsZURhdGVTdHJpbmcoJ2VzLUNMJywgeyBkYXk6ICdudW1lcmljJywgbW9udGg6ICdsb25nJywgeWVhcjogJ251bWVyaWMnIH0pIDogJyc7CmFzeW5jIGZ1bmN0aW9uIGRyYXdNeVBsYW4oYm94LCBjaGVjayA9IGZhbHNlKSB7CiAgaWYgKCFib3gpIHJldHVybjsKICBjb25zdCBib2R5ID0gYm94LnF1ZXJ5U2VsZWN0b3IoJy5wYW5lbC1ib2R5JykgfHwgYm94OwogIGxldCBkOyB0cnkgeyBkID0gYXdhaXQgYXBpKCcvYXBpL2JpbGxpbmcnICsgKGNoZWNrID8gJz9jaGVjaz0xJyA6ICcnKSk7IH0gY2F0Y2ggKGUpIHsgYm9keS50ZXh0Q29udGVudCA9IGUubWVzc2FnZTsgcmV0dXJuOyB9CiAgYm9keS5jbGFzc0xpc3QucmVtb3ZlKCdtdXRlZCcpOwogIGNvbnN0IHN0ID0gZC5zcGFjZV9zdGF0dXMsIGN1ciA9IGQucGxhbnMuZmluZChwID0+IHAuaWQgPT09IGQuY3VycmVudCk7CiAgY29uc3QgYWN0aXZlID0gZC5zdGF0dXMgPT09ICdhdXRob3JpemVkJzsKICBjb25zdCBoZWFkID0gYWN0aXZlCiAgICA/IGA8ZGl2IGNsYXNzPSJwbGFuLW5vdyBvayI+PGI+UGxhbiAke2VzYyhjdXI/Lm5hbWUgfHwgJycpfSBhY3Rpdm88L2I+PHNwYW4+U2UgY29icmEgc29sbyBjYWRhIG1lcyBjb24gTWVyY2FkbyBQYWdvJHtkLm5leHQgPyAnIMK3IHByw7N4aW1vIGNvYnJvIGVsICcgKyBlc2MoZm10RGF5KGQubmV4dCkpIDogJyd9Ljwvc3Bhbj48L2Rpdj5gCiAgICA6IHN0LmtpbmQgPT09ICd0cmlhbCcgPyBgPGRpdiBjbGFzcz0icGxhbi1ub3ciPjxiPlBydWViYSBncmF0aXM8L2I+PHNwYW4+JHtzdC5kYXlzTGVmdCA9PT0gMCA/ICdIb3kgZXMgdHUgw7psdGltbyBkw61hJyA6ICdUZSBxdWVkYW4gJyArIHN0LmRheXNMZWZ0ICsgJyBkw61hcyd9LiBFbGlnZSB1biBwbGFuIHBhcmEgc2VndWlyIHVzYW5kbyBFdGlxdWV0YUh1YiBzaW4gY29ydGVzLjwvc3Bhbj48L2Rpdj5gCiAgICA6IHN0LmFjdGl2ZSA/IGA8ZGl2IGNsYXNzPSJwbGFuLW5vdyBvayI+PGI+QWN0aXZvIGhhc3RhIGVsICR7ZXNjKGZtdERheShzdC51bnRpbCkpfTwvYj48c3Bhbj4ke2Quc3RhdHVzID09PSAnY2FuY2VsbGVkJyA/ICdDYW5jZWxhc3RlIGxhIHN1c2NyaXBjacOzbjogbm8gc2Ugdm9sdmVyw6EgYSBjb2JyYXIuJyA6IGQuc3RhdHVzID09PSAncGVuZGluZycgPyAnVGllbmVzIHVuIHBhZ28gcGVuZGllbnRlIGVuIE1lcmNhZG8gUGFnby4nIDogJyd9PC9zcGFuPjwvZGl2PmAKICAgIDogYDxkaXYgY2xhc3M9InBsYW4tbm93IGJhZCI+PGI+JHtzdC5yZWFzb24gPT09ICdibG9ja2VkJyA/ICdFc3BhY2lvIHN1c3BlbmRpZG8nIDogJ1R1IHBsYW4gdmVuY2nDsyd9PC9iPjxzcGFuPkVsaWdlIHVuIHBsYW4geSBwYWdhIGNvbiBNZXJjYWRvIFBhZ28gcGFyYSByZWFjdGl2YXIgdG9kbyBhbCBpbnN0YW50ZS48L3NwYW4+PC9kaXY+YDsKICBib2R5LmlubmVySFRNTCA9IGhlYWQgKyAoIWQuY29uZmlndXJlZCA/ICc8cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJtYXJnaW46MTBweCAwIDAiPkxvcyBwYWdvcyBlbiBsw61uZWEgYcO6biBubyBlc3TDoW4gZGlzcG9uaWJsZXMuIEVzY3LDrWJlbm9zIHBhcmEgYWN0aXZhciB0dSBwbGFuLjwvcD4nIDogYAogICAgPGRpdiBjbGFzcz0icGxhbnMiPiR7ZC5wbGFucy5tYXAocCA9PiBgPGRpdiBjbGFzcz0icGxhbiAke3AuaWQgPT09IGQuY3VycmVudCAmJiBhY3RpdmUgPyAnY3VyJyA6ICcnfSI+PGI+JHtlc2MocC5uYW1lKX08L2I+CiAgICAgIDxkaXYgY2xhc3M9InBsYW4tcHJpY2UiPiR7bW9uZXkocC5wcmljZSl9PHNtYWxsPiArIElWQSAvIG1lczwvc21hbGw+PC9kaXY+PHNtYWxsIGNsYXNzPSJtdXRlZCI+JHttb25leShwLnRvdGFsKX0gY29uIElWQTwvc21hbGw+CiAgICAgIDxzcGFuIGNsYXNzPSJwbGFuLW9yZGVycyI+JHtwLm9yZGVycyA/ICdIYXN0YSAnICsgcC5vcmRlcnMudG9Mb2NhbGVTdHJpbmcoJ2VzLUNMJykgKyAnIHBlZGlkb3MgYWwgbWVzJyA6ICdQZWRpZG9zIGlsaW1pdGFkb3MnfTwvc3Bhbj4KICAgICAgJHtwLmlkID09PSBkLmN1cnJlbnQgJiYgYWN0aXZlID8gJzxzcGFuIGNsYXNzPSJwaWxsIHJlYWR5Ij5UdSBwbGFuPC9zcGFuPicgOiBgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IGJ0bi1zbSIgZGF0YS1zdWI9IiR7ZXNjKHAuaWQpfSI+JHthY3RpdmUgPyAnQ2FtYmlhciBhIGVzdGUgcGxhbicgOiAnU3VzY3JpYmlybWUnfTwvYnV0dG9uPmB9PC9kaXY+YCkuam9pbignJyl9PC9kaXY+CiAgICA8cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJtYXJnaW46MTBweCAwIDA7Zm9udC1zaXplOjEyLjVweCI+UGFnYXMgY29uIHRhcmpldGEgZGUgY3LDqWRpdG8gbyBkw6liaXRvIGVuIGxhIHDDoWdpbmEgc2VndXJhIGRlIE1lcmNhZG8gUGFnby4gRWwgY29icm8gc2UgcmVwaXRlIHNvbG8gY2FkYSBtZXMgeSBwdWVkZXMgY2FuY2VsYXJsbyBjdWFuZG8gcXVpZXJhcy4ke2FjdGl2ZSA/ICcgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1jYW5jZWw+Q2FuY2VsYXIgc3VzY3JpcGNpw7NuPC9idXR0b24+JyA6ICcnfTwvcD5gKTsKICBib2R5Lm9uY2xpY2sgPSBhc3luYyBlID0+IHsKICAgIGNvbnN0IGIgPSBlLnRhcmdldC5jbG9zZXN0KCdbZGF0YS1zdWJdJyk7CiAgICBpZiAoYikgewogICAgICBiLmRpc2FibGVkID0gdHJ1ZTsgYi50ZXh0Q29udGVudCA9ICdBYnJpZW5kbyBNZXJjYWRvIFBhZ2/igKYnOwogICAgICB0cnkgeyBjb25zdCByID0gYXdhaXQgYXBpKCcvYXBpL2JpbGxpbmcvc3Vic2NyaWJlJywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBwbGFuOiBiLmRhdGFzZXQuc3ViIH0gfSk7IGxvY2F0aW9uLmhyZWYgPSByLnVybDsgfQogICAgICBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlLCA2MDAwKTsgYi5kaXNhYmxlZCA9IGZhbHNlOyBiLnRleHRDb250ZW50ID0gJ1N1c2NyaWJpcm1lJzsgfQogICAgICByZXR1cm47CiAgICB9CiAgICBpZiAoZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtY2FuY2VsXScpKSB7CiAgICAgIGlmICghY29uZmlybSgnwr9DYW5jZWxhciBsYSBzdXNjcmlwY2nDs24/IE5vIHNlIHZvbHZlcsOhIGEgY29icmFyLiBUdSBlbXByZXNhIHNpZ3VlIGFjdGl2YSBoYXN0YSBsYSBmZWNoYSB5YSBwYWdhZGEuJykpIHJldHVybjsKICAgICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL2JpbGxpbmcvY2FuY2VsJywgeyBtZXRob2Q6ICdQT1NUJyB9KTsgdG9hc3QoJ1N1c2NyaXBjacOzbiBjYW5jZWxhZGEnKTsgZHJhd015UGxhbihib3gpOyB9IGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UsIDUwMDApOyB9CiAgICB9CiAgfTsKfQovLyAtLS0tLS0tLS0tIE51YmUgZGUgZW1wcmVzYXM6IGNvYnJvcyBjb24gTWVyY2FkbyBQYWdvIChBY2Nlc3MgVG9rZW4geSBwbGFuZXMpIC0tLS0tLS0tLS0KYXN5bmMgZnVuY3Rpb24gZHJhd093bmVyQmlsbGluZygpIHsKICBjb25zdCBib3ggPSAkKCcjb3duZXJCaWxsaW5nJyk7IGlmICghYm94KSByZXR1cm47CiAgbGV0IGQ7IHRyeSB7IGQgPSBhd2FpdCBhcGkoJy9hcGkvb3duZXIvYmlsbGluZycpOyB9IGNhdGNoIChlKSB7IGJveC5xdWVyeVNlbGVjdG9yKCcucGFuZWwtYm9keScpLnRleHRDb250ZW50ID0gZS5tZXNzYWdlOyByZXR1cm47IH0KICBib3gucXVlcnlTZWxlY3RvcignLnBhbmVsLWhlYWQnKS5pbm5lckhUTUwgPSBgPGgyPvCfkrMgQ29icm9zIGNvbiBNZXJjYWRvIFBhZ288L2gyPiR7ZC5jb25maWd1cmVkICYmIGQuYWNjb3VudCAmJiAhZC5hY2NvdW50LmVycm9yID8gYDxzcGFuIGNsYXNzPSJzdGF0ZSBvbiI+PGk+PC9pPkNvbmVjdGFkbyDCtyAke2VzYyhkLmFjY291bnQubmlja25hbWUgfHwgZC5hY2NvdW50LmVtYWlsIHx8ICcnKX08L3NwYW4+YCA6IGQuYWNjb3VudD8uZXJyb3IgPyBgPHNwYW4gY2xhc3M9InN0YXRlIGVyciI+PGk+PC9pPiR7ZXNjKGQuYWNjb3VudC5lcnJvcil9PC9zcGFuPmAgOiAnPHNwYW4gY2xhc3M9InN0YXRlIGVyciI+PGk+PC9pPlNpbiBjb25maWd1cmFyPC9zcGFuPid9YDsKICBjb25zdCBib2R5ID0gYm94LnF1ZXJ5U2VsZWN0b3IoJy5wYW5lbC1ib2R5Jyk7IGJvZHkuY2xhc3NMaXN0LnJlbW92ZSgnbXV0ZWQnKTsKICBib2R5LmlubmVySFRNTCA9IGAKICAgIDxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9Im1hcmdpbjowIj5MYXMgZW1wcmVzYXMgcGFnYW4gc3UgcGxhbiBjb24gdGFyamV0YSBlbiBNZXJjYWRvIFBhZ28geSBlbCBjb2JybyBzZSByZXBpdGUgc29sbyBjYWRhIG1lcy4gTGEgcGxhdGEgbGxlZ2EgYSB0dSBjdWVudGEgZGUgTWVyY2FkbyBQYWdvLjwvcD4KICAgIDxmb3JtIGNsYXNzPSJyb3ciIGlkPSJtcFRvayI+PGxhYmVsIGNsYXNzPSJmIj5BY2Nlc3MgVG9rZW4gZGUgcHJvZHVjY2nDs24gKGVtcGllemEgY29uIEFQUF9VU1ItKTxpbnB1dCB0eXBlPSJwYXNzd29yZCIgaWQ9Im1wVG9rSW4iIGF1dG9jb21wbGV0ZT0ib2ZmIiBwbGFjZWhvbGRlcj0iJHtkLmNvbmZpZ3VyZWQgPyAn4oCi4oCi4oCi4oCi4oCi4oCiIChndWFyZGFkbyknIDogJ0FQUF9VU1It4oCmJ30iPjwvbGFiZWw+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiIHN0eWxlPSJmbGV4OjAiPkd1YXJkYXI8L2J1dHRvbj48L2Zvcm0+CiAgICA8bGFiZWwgY2xhc3M9ImYiPlVSTCBkZSBub3RpZmljYWNpb25lcyAoV2ViaG9va3Mg4oC6IGV2ZW50byAiUGxhbmVzIHkgc3VzY3JpcGNpb25lcyIpPHNwYW4gY2xhc3M9ImNvcHkiPjxpbnB1dCB0eXBlPSJ0ZXh0IiByZWFkb25seSB2YWx1ZT0iJHtlc2MoZC53ZWJob29rX3VybCl9Ij48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWNvcHk9IiR7ZXNjKGQud2ViaG9va191cmwpfSI+Q29waWFyPC9idXR0b24+PC9zcGFuPjwvbGFiZWw+CiAgICA8aDMgc3R5bGU9Im1hcmdpbjoxNHB4IDAgNnB4O2ZvbnQtc2l6ZToxNXB4Ij5QbGFuZXMgKHByZWNpbyBuZXRvLCBzaW4gSVZBKTwvaDM+CiAgICA8ZGl2IGNsYXNzPSJ0YWJsZS13cmFwIj48dGFibGUgc3R5bGU9Im1pbi13aWR0aDo1MjBweCI+PHRoZWFkPjx0cj48dGg+Tm9tYnJlPC90aD48dGg+UHJlY2lvIG1lbnN1YWwgKyBJVkE8L3RoPjx0aD5QZWRpZG9zIGFsIG1lcyAoMCA9IHNpbiBsw61taXRlKTwvdGg+PHRoPkNvbiBJVkE8L3RoPjx0aD48L3RoPjwvdHI+PC90aGVhZD48dGJvZHkgaWQ9InBsUm93cyI+CiAgICAke2QucGxhbnMubWFwKHAgPT4gYDx0cj48dGQ+PGlucHV0IHR5cGU9InRleHQiIGRhdGEtcGY9Im5hbWUiIHZhbHVlPSIke2VzYyhwLm5hbWUpfSI+PC90ZD48dGQ+PGlucHV0IHR5cGU9Im51bWJlciIgZGF0YS1wZj0icHJpY2UiIHZhbHVlPSIke3AucHJpY2V9IiBtaW49IjAiPjwvdGQ+PHRkPjxpbnB1dCB0eXBlPSJudW1iZXIiIGRhdGEtcGY9Im9yZGVycyIgdmFsdWU9IiR7cC5vcmRlcnN9IiBtaW49IjAiPjwvdGQ+PHRkIGNsYXNzPSJtdXRlZCI+JHttb25leShwLnRvdGFsKX08L3RkPjx0ZD48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLXBscm0+UXVpdGFyPC9idXR0b24+PC90ZD48L3RyPmApLmpvaW4oJycpfQogICAgPC90Ym9keT48L3RhYmxlPjwvZGl2PgogICAgPGRpdiBjbGFzcz0icm93IiBzdHlsZT0ianVzdGlmeS1jb250ZW50OmZsZXgtZW5kO2dhcDo4cHgiPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSIgaWQ9InBsQWRkIiBzdHlsZT0iZmxleDowIj4rIEFncmVnYXIgcGxhbjwvYnV0dG9uPjxidXR0b24gY2xhc3M9ImJ0biBidG4tcHJpbWFyeSIgaWQ9InBsU2F2ZSIgc3R5bGU9ImZsZXg6MCI+R3VhcmRhciBwbGFuZXM8L2J1dHRvbj48L2Rpdj4KICAgICR7ZC5oaXN0b3J5Lmxlbmd0aCA/IGA8ZGV0YWlscyBzdHlsZT0ibWFyZ2luLXRvcDoxMHB4Ij48c3VtbWFyeT5IaXN0b3JpYWwgZGUgY29icm9zICgke2QuaGlzdG9yeS5sZW5ndGh9KTwvc3VtbWFyeT48ZGl2IGNsYXNzPSJ0YWJsZS13cmFwIj48dGFibGU+PHRib2R5PiR7ZC5oaXN0b3J5Lm1hcChoID0+IGA8dHI+PHRkIGNsYXNzPSJub3RlIj4ke2VzYyhmbXRUaW1lKGguYXQpKX08L3RkPjx0ZD4ke2VzYyhoLmRldGFpbCl9PC90ZD48L3RyPmApLmpvaW4oJycpfTwvdGJvZHk+PC90YWJsZT48L2Rpdj48L2RldGFpbHM+YCA6ICcnfWA7CiAgJCgnI21wVG9rJykub25zdWJtaXQgPSBhc3luYyBlID0+IHsKICAgIGUucHJldmVudERlZmF1bHQoKTsgY29uc3QgdiA9ICQoJyNtcFRva0luJykudmFsdWUudHJpbSgpOyBpZiAoIXYpIHJldHVybiB0b2FzdCgnUGVnYSBlbCBBY2Nlc3MgVG9rZW4nKTsKICAgIHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9vd25lci9iaWxsaW5nJywgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogeyBtcF9hY2Nlc3NfdG9rZW46IHYgfSB9KTsgdG9hc3QoJ8KhTWVyY2FkbyBQYWdvIGNvbmVjdGFkbyEnLCA1MDAwKTsgZHJhd093bmVyQmlsbGluZygpOyB9IGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UsIDYwMDApOyB9CiAgfTsKICAkKCcjcGxBZGQnKS5vbmNsaWNrID0gKCkgPT4geyBjb25zdCB0ciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3RyJyk7IHRyLmlubmVySFRNTCA9ICc8dGQ+PGlucHV0IHR5cGU9InRleHQiIGRhdGEtcGY9Im5hbWUiIHBsYWNlaG9sZGVyPSJOb21icmUiPjwvdGQ+PHRkPjxpbnB1dCB0eXBlPSJudW1iZXIiIGRhdGEtcGY9InByaWNlIiBtaW49IjAiPjwvdGQ+PHRkPjxpbnB1dCB0eXBlPSJudW1iZXIiIGRhdGEtcGY9Im9yZGVycyIgbWluPSIwIiB2YWx1ZT0iMCI+PC90ZD48dGQ+PC90ZD48dGQ+PGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1saW5lIGJ0bi1zbSIgZGF0YS1wbHJtPlF1aXRhcjwvYnV0dG9uPjwvdGQ+JzsgJCgnI3BsUm93cycpLmFwcGVuZCh0cik7IH07CiAgJCgnI3BsUm93cycpLm9uY2xpY2sgPSBlID0+IHsgY29uc3QgYiA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLXBscm1dJyk7IGlmIChiKSBiLmNsb3Nlc3QoJ3RyJykucmVtb3ZlKCk7IH07CiAgJCgnI3BsU2F2ZScpLm9uY2xpY2sgPSBhc3luYyAoKSA9PiB7CiAgICBjb25zdCBwbGFucyA9IFsuLi4kKCcjcGxSb3dzJykucXVlcnlTZWxlY3RvckFsbCgndHInKV0ubWFwKHRyID0+ICh7IG5hbWU6IHRyLnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXBmPW5hbWVdJykudmFsdWUsIHByaWNlOiB0ci5xdWVyeVNlbGVjdG9yKCdbZGF0YS1wZj1wcmljZV0nKS52YWx1ZSwgb3JkZXJzOiB0ci5xdWVyeVNlbGVjdG9yKCdbZGF0YS1wZj1vcmRlcnNdJykudmFsdWUgfSkpOwogICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL293bmVyL2JpbGxpbmcnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IHBsYW5zIH0gfSk7IHRvYXN0KCdQbGFuZXMgZ3VhcmRhZG9zJyk7IGRyYXdPd25lckJpbGxpbmcoKTsgfSBjYXRjaCAoZXJyKSB7IHRvYXN0KGVyci5tZXNzYWdlLCA1MDAwKTsgfQogIH07Cn0KCi8vIC0tLS0tLS0tLS0gTcOzZHVsb3MgZGVsIGVzcGFjaW8gKGludGVycnVwdG9yZXMpIC0tLS0tLS0tLS0KYXN5bmMgZnVuY3Rpb24gZHJhd1NwYWNlTW9kdWxlcygpIHsKICBjb25zdCBib3ggPSAkKCcjc3BNb2RzJyk7IGlmICghYm94KSByZXR1cm47CiAgbGV0IGQ7IHRyeSB7IGQgPSBhd2FpdCBhcGkoJy9hcGkvc3BhY2UnKTsgfSBjYXRjaCAoZSkgeyBib3gucXVlcnlTZWxlY3RvcignLnBhbmVsLWJvZHknKS50ZXh0Q29udGVudCA9IGUubWVzc2FnZTsgcmV0dXJuOyB9CiAgY29uc3QgYm9keSA9IGJveC5xdWVyeVNlbGVjdG9yKCcucGFuZWwtYm9keScpOwogIGJvZHkuY2xhc3NMaXN0LnJlbW92ZSgnbXV0ZWQnKTsKICBib2R5LmlubmVySFRNTCA9IGA8cCBjbGFzcz0ibXV0ZWQiIHN0eWxlPSJtYXJnaW46MCAwIDEwcHg7Zm9udC1zaXplOjEzcHgiPlByZW5kZSBzb2xvIGxvIHF1ZSB1c2EgdHUgZW1wcmVzYS4gTG8gcXVlIGFwYWd1ZXMgZGVzYXBhcmVjZSBkZSBsYSBhcHAgcGFyYSB0b2RvcyBsb3MgdXN1YXJpb3MgZGUgZXN0ZSBlc3BhY2lvOyB0dXMgZGF0b3Mgbm8gc2UgYm9ycmFuIHkgdnVlbHZlbiBhbCBwcmVuZGVybG8uPC9wPgogICAgPGRpdiBjbGFzcz0ibW9kcyI+JHtPYmplY3QuZW50cmllcyhkLmNhdGFsb2cpLm1hcCgoW2ssIGNdKSA9PiB7IGNvbnN0IGxvY2sgPSBjLmxvY2tlZDEgJiYgZC5zcGFjZS5pZCA9PT0gMTsgcmV0dXJuIGA8bGFiZWwgY2xhc3M9Im1vZCAke2Quc3BhY2UubW9kdWxlc1trXSA/ICdvbicgOiAnJ30gJHtsb2NrID8gJ21vZC1sb2NrJyA6ICcnfSI+PHNwYW4gY2xhc3M9Im1vZC10Ij48Yj4ke2VzYyhjLm5hbWUpfSR7bG9jayA/ICcgPGVtIGNsYXNzPSJtb2QtbmEiPk5vIGRpc3BvbmlibGUgZW4gZXN0ZSBlc3BhY2lvPC9lbT4nIDogJyd9PC9iPjxzbWFsbD4ke2VzYyhjLmRlc2MpfTwvc21hbGw+PC9zcGFuPgogICAgICA8c3BhbiBjbGFzcz0idGdsIj48aW5wdXQgdHlwZT0iY2hlY2tib3giIGRhdGEtbW9kPSIke2t9IiAke2Quc3BhY2UubW9kdWxlc1trXSA/ICdjaGVja2VkJyA6ICcnfSAke2QuY2FuRWRpdCAmJiAhbG9jayA/ICcnIDogJ2Rpc2FibGVkJ30+PGk+PC9pPjwvc3Bhbj48L2xhYmVsPmA7IH0pLmpvaW4oJycpfTwvZGl2PmA7CiAgYm9keS5vbmNoYW5nZSA9IGFzeW5jIGUgPT4gewogICAgY29uc3QgaSA9IGUudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLW1vZF0nKTsgaWYgKCFpKSByZXR1cm47CiAgICBjb25zdCBrID0gaS5kYXRhc2V0Lm1vZCwgb24gPSBpLmNoZWNrZWQ7CiAgICBpZiAoayA9PT0gJ2Z1bGZpbGxtZW50JyAmJiAhb24gJiYgIWNvbmZpcm0oJ8K/QXBhZ2FyIGVsIGZ1bGZpbGxtZW50PyBMYXMgZXRpcXVldGFzIGRlamFuIGRlIGJsb3F1ZWFyc2UgcG9yIHByb2R1Y3RvIHkgZGVzYXBhcmVjZW4gbGFzIHNlY2Npb25lcyBkZSBibG9xdWVhZGFzIHkgZGVsIHByb3ZlZWRvciBkZSBmdWxmaWxsbWVudC4gVHVzIGxpc3RhcyBkZSBwcm9kdWN0b3MgYmxvcXVlYWRvcyBxdWVkYW4gZ3VhcmRhZGFzIHBvciBzaSBsbyB2dWVsdmVzIGEgcHJlbmRlci4nKSkgeyBpLmNoZWNrZWQgPSB0cnVlOyByZXR1cm47IH0KICAgIHRyeSB7CiAgICAgIGNvbnN0IHIgPSBhd2FpdCBhcGkoJy9hcGkvc3BhY2UnLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IG1vZHVsZXM6IHsgW2tdOiBvbiB9IH0gfSk7CiAgICAgIG1lLnNwYWNlLm1vZHVsZXMgPSByLm1vZHVsZXM7IHRvYXN0KGAke2QuY2F0YWxvZ1trXS5uYW1lfSAke29uID8gJ3ByZW5kaWRvJyA6ICdhcGFnYWRvJ31gKTsKICAgICAgcmVuZGVyU2hlbGwoKTsgLy8gbWVuw7ogeSBzZWNjaW9uZXMgc2UgYWp1c3RhbiBhbCB0aXJvCiAgICB9IGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UsIDQwMDApOyBpLmNoZWNrZWQgPSAhb247IH0KICB9Owp9Ci8vIC0tLS0tLS0tLS0gUGFuZWwgZGVsIGR1ZcOxbyBkZSBsYSBhcHA6IGVtcHJlc2FzIHJlZ2lzdHJhZGFzLCBwbGF6b3MgeSBtw7NkdWxvcyAtLS0tLS0tLS0tCmFzeW5jIGZ1bmN0aW9uIGRyYXdPd25lclNwYWNlcygpIHsKICBjb25zdCBib3ggPSAkKCcjb3duZXJTcGFjZXMnKTsgaWYgKCFib3gpIHJldHVybjsKICBsZXQgZDsgdHJ5IHsgZCA9IGF3YWl0IGFwaSgnL2FwaS9vd25lci9zcGFjZXMnKTsgfSBjYXRjaCAoZSkgeyBib3gucXVlcnlTZWxlY3RvcignLnBhbmVsLWJvZHknKS50ZXh0Q29udGVudCA9IGUubWVzc2FnZTsgcmV0dXJuOyB9CiAgY29uc3QgYm9keSA9IGJveC5xdWVyeVNlbGVjdG9yKCcucGFuZWwtYm9keScpOyBib2R5LmNsYXNzTGlzdC5yZW1vdmUoJ211dGVkJyk7CiAgY29uc3QgZmQgPSB4ID0+IHggPyBuZXcgRGF0ZSh4ICsgJ1QxMjowMDowMCcpLnRvTG9jYWxlRGF0ZVN0cmluZygnZXMtQ0wnLCB7IGRheTogJ251bWVyaWMnLCBtb250aDogJ3Nob3J0JywgeWVhcjogJ251bWVyaWMnIH0pIDogJ+KAlCc7CiAgY29uc3Qgc3RUeHQgPSBzID0+IChzLm1wX3N0YXR1cyA9PT0gJ2F1dGhvcml6ZWQnID8gYDxzcGFuIGNsYXNzPSJwaWxsIHJlYWR5IiBzdHlsZT0ibWFyZ2luLWJvdHRvbTo0cHgiPvCfkrMgJHtlc2Mocy5wbGFuIHx8ICcnKX0ke3MubXBfbmV4dCA/ICcgwrcgY29icmEgJyArIGVzYyhmZChzLm1wX25leHQpKSA6ICcnfTwvc3Bhbj48YnI+YCA6IHMubXBfc3RhdHVzID09PSAncGVuZGluZycgPyAnPHNwYW4gY2xhc3M9InBpbGwgd2FpdGluZyIgc3R5bGU9Im1hcmdpbi1ib3R0b206NHB4Ij7wn5KzIHBhZ28gcGVuZGllbnRlPC9zcGFuPjxicj4nIDogcy5tcF9zdGF0dXMgPT09ICdjYW5jZWxsZWQnID8gJzxzcGFuIGNsYXNzPSJwaWxsIGVycm9yIiBzdHlsZT0ibWFyZ2luLWJvdHRvbTo0cHgiPvCfkrMgY2FuY2Vsw7M8L3NwYW4+PGJyPicgOiAnJykgKyAocy5zdGF0dXMuYWN0aXZlID8gKHMuc3RhdHVzLmtpbmQgPT09ICd0cmlhbCcgPyBgPHNwYW4gY2xhc3M9InBpbGwgd2FpdGluZyI+UHJ1ZWJhIMK3ICR7cy5zdGF0dXMuZGF5c0xlZnR9IGTDrWFzPC9zcGFuPmAgOiBgPHNwYW4gY2xhc3M9InBpbGwgcmVhZHkiPkFjdGl2byBoYXN0YSAke2VzYyhmZChzLnN0YXR1cy51bnRpbCkpfTwvc3Bhbj5gKSA6IChzLmJsb2NrZWQgPyAnPHNwYW4gY2xhc3M9InBpbGwgZXJyb3IiPlN1c3BlbmRpZG88L3NwYW4+JyA6ICc8c3BhbiBjbGFzcz0icGlsbCBlcnJvciI+VmVuY2lkbzwvc3Bhbj4nKSk7CiAgYm9keS5pbm5lckhUTUwgPSBgPHAgY2xhc3M9Im11dGVkIiBzdHlsZT0ibWFyZ2luOjAgMCAxMHB4O2ZvbnQtc2l6ZToxM3B4Ij5DYWRhIGVtcHJlc2EgcXVlIHNlIHJlZ2lzdHJhIHJlY2liZSAkezE0fSBkw61hcyBncmF0aXMuIEFxdcOtIGxlIGRhcyBtw6FzIHRpZW1wbywgbGEgc3VzcGVuZGVzIG8gZW50cmFzIGEgc3UgZXNwYWNpbyBwYXJhIGF5dWRhcmxhLjwvcD4KICAgIDxkaXYgY2xhc3M9InRhYmxlLXdyYXAiPjx0YWJsZSBzdHlsZT0ibWluLXdpZHRoOjg2MHB4Ij48dGhlYWQ+PHRyPjx0aD5FbXByZXNhPC90aD48dGg+QWRtaW5pc3RyYWRvcjwvdGg+PHRoPkVzdGFkbzwvdGg+PHRoPlVzbzwvdGg+PHRoPkRhciBtw6FzIHRpZW1wbzwvdGg+PHRoPjwvdGg+PC90cj48L3RoZWFkPjx0Ym9keT4KICAgICR7ZC5zcGFjZXMubWFwKHMgPT4gYDx0ciBkYXRhLXNwPSIke3MuaWR9Ij48dGQ+PGI+JHtlc2Mocy5uYW1lKX08L2I+PHNwYW4gY2xhc3M9Im5vdGUiPkRlc2RlICR7ZXNjKGZtdFRpbWUocy5jcmVhdGVkX2F0KSl9JHtzLnBob25lID8gJyDCtyAnICsgZXNjKHMucGhvbmUpIDogJyd9PC9zcGFuPjwvdGQ+CiAgICAgIDx0ZD4ke3MuYWRtaW4gPyBgJHtlc2Mocy5hZG1pbi5uYW1lKX08c3BhbiBjbGFzcz0ibm90ZSI+JHtlc2Mocy5hZG1pbi5lbWFpbCl9PC9zcGFuPmAgOiAn4oCUJ308L3RkPgogICAgICA8dGQ+JHtzdFR4dChzKX08L3RkPgogICAgICA8dGQgY2xhc3M9Im5vdGUiPiR7cy5zZWxsZXJzfSBlbXByZXNhJHtzLnNlbGxlcnMgPT09IDEgPyAnJyA6ICdzJ30gwrcgJHtzLnVzZXJzfSB1c3VhcmlvJHtzLnVzZXJzID09PSAxID8gJycgOiAncyd9IMK3ICR7cy5vcmRlcnMzMH0gcGVkaWRvcyBlbiAzMCBkw61hcyR7cy5tb2R1bGVzLmZ1bGZpbGxtZW50ID8gJyDCtyBmdWxmaWxsbWVudCcgOiAnJ308L3RkPgogICAgICA8dGQ+JHtzLmlkID09PSAxID8gJzxzcGFuIGNsYXNzPSJtdXRlZCI+VHUgZXNwYWNpbzwvc3Bhbj4nIDogYDxkaXYgY2xhc3M9InJvdy1hY3Rpb25zIj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWFkZD0iNyI+KzcgZMOtYXM8L2J1dHRvbj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUgYnRuLXNtIiBkYXRhLWFkZD0iMzAiPiszMCBkw61hczwvYnV0dG9uPjxidXR0b24gY2xhc3M9ImJ0biBidG4tbGluZSBidG4tc20iIGRhdGEtdW50aWw+SGFzdGEgZmVjaGHigKY8L2J1dHRvbj48L2Rpdj5gfTwvdGQ+CiAgICAgIDx0ZD4ke3MuaWQgPT09IDEgPyAnJyA6IGA8ZGl2IGNsYXNzPSJyb3ctYWN0aW9ucyI+JHtzLmFkbWluID8gJzxidXR0b24gY2xhc3M9ImJ0biBidG4tZ2hvc3QgYnRuLXNtIiBkYXRhLWVudGVyPkVudHJhcjwvYnV0dG9uPicgOiAnJ308YnV0dG9uIGNsYXNzPSJidG4gJHtzLmJsb2NrZWQgPyAnYnRuLXByaW1hcnknIDogJ2J0bi1kYW5nZXInfSBidG4tc20iIGRhdGEtYmxvY2s9IiR7cy5ibG9ja2VkID8gMCA6IDF9Ij4ke3MuYmxvY2tlZCA/ICdSZWFjdGl2YXInIDogJ1N1c3BlbmRlcid9PC9idXR0b24+PC9kaXY+YH08L3RkPjwvdHI+CiAgICAgIDx0ciBjbGFzcz0ic3AtbW9kcyIgZGF0YS1zcD0iJHtzLmlkfSI+PHRkIGNvbHNwYW49IjYiPjxzcGFuIGNsYXNzPSJtdXRlZCI+TcOzZHVsb3M6PC9zcGFuPiAke09iamVjdC5lbnRyaWVzKGQuY2F0YWxvZykubWFwKChbaywgY10pID0+IGA8bGFiZWwgY2xhc3M9InNwLW1vZCAke3MubW9kdWxlc1trXSA/ICdvbicgOiAnJ30iICR7Yy5sb2NrZWQxICYmIHMuaWQgPT09IDEgPyAndGl0bGU9Ik5vIGRpc3BvbmlibGUgZW4gZWwgZXNwYWNpbyBwcmluY2lwYWwiJyA6ICcnfT48aW5wdXQgdHlwZT0iY2hlY2tib3giIGRhdGEtb3Ntb2Q9IiR7a30iICR7cy5tb2R1bGVzW2tdID8gJ2NoZWNrZWQnIDogJyd9ICR7Yy5sb2NrZWQxICYmIHMuaWQgPT09IDEgPyAnZGlzYWJsZWQnIDogJyd9PiAke2VzYyhjLm5hbWUpfSR7Yy5sb2NrZWQxICYmIHMuaWQgPT09IDEgPyAnIPCflJInIDogJyd9PC9sYWJlbD5gKS5qb2luKCcnKX08L3RkPjwvdHI+YCkuam9pbignJyl9CiAgICA8L3Rib2R5PjwvdGFibGU+PC9kaXY+YDsKICBib2R5Lm9uY2hhbmdlID0gYXN5bmMgZSA9PiB7CiAgICBjb25zdCBpID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtb3Ntb2RdJyk7IGlmICghaSkgcmV0dXJuOyBjb25zdCBpZCA9IGkuY2xvc2VzdCgnW2RhdGEtc3BdJykuZGF0YXNldC5zcDsKICAgIHRyeSB7IGF3YWl0IGFwaShgL2FwaS9vd25lci9zcGFjZXMvJHtpZH1gLCB7IG1ldGhvZDogJ1BPU1QnLCBib2R5OiB7IG1vZHVsZXM6IHsgW2kuZGF0YXNldC5vc21vZF06IGkuY2hlY2tlZCB9IH0gfSk7IHRvYXN0KGAke2QuY2F0YWxvZ1tpLmRhdGFzZXQub3Ntb2RdLm5hbWV9ICR7aS5jaGVja2VkID8gJ3ByZW5kaWRvJyA6ICdhcGFnYWRvJ31gKTsgaWYgKE51bWJlcihpZCkgPT09IG1lLnNwYWNlPy5pZCkgeyBtZS5zcGFjZS5tb2R1bGVzW2kuZGF0YXNldC5vc21vZF0gPSBpLmNoZWNrZWQ7IH0gZHJhd093bmVyU3BhY2VzKCk7IH0KICAgIGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UsIDQwMDApOyBpLmNoZWNrZWQgPSAhaS5jaGVja2VkOyB9CiAgfTsKICBib2R5Lm9uY2xpY2sgPSBhc3luYyBlID0+IHsKICAgIGNvbnN0IHRyID0gZS50YXJnZXQuY2xvc2VzdCgnW2RhdGEtc3BdJyk7IGlmICghdHIpIHJldHVybjsgY29uc3QgaWQgPSB0ci5kYXRhc2V0LnNwOwogICAgY29uc3QgYiA9IGUudGFyZ2V0LmNsb3Nlc3QoJ2J1dHRvbicpOyBpZiAoIWIpIHJldHVybjsKICAgIGxldCBwYXlsb2FkID0gbnVsbDsKICAgIGlmIChiLmRhdGFzZXQuYWRkKSBwYXlsb2FkID0geyBhZGREYXlzOiBOdW1iZXIoYi5kYXRhc2V0LmFkZCkgfTsKICAgIGlmIChiLmhhc0F0dHJpYnV0ZSgnZGF0YS11bnRpbCcpKSB7IGNvbnN0IHYgPSBwcm9tcHQoJ8K/SGFzdGEgcXXDqSBmZWNoYSBxdWVkYSBhY3RpdmE/IChBQUFBLU1NLUREKScsIGlzbyhuZXcgRGF0ZShEYXRlLm5vdygpICsgMzAgKiA4NjRlNSkpKTsgaWYgKCF2IHx8ICEvXlxkezR9LVxkezJ9LVxkezJ9JC8udGVzdCh2KSkgcmV0dXJuOyBwYXlsb2FkID0geyB1bnRpbDogdiB9OyB9CiAgICBpZiAoYi5kYXRhc2V0LmJsb2NrICE9PSB1bmRlZmluZWQpIHsgaWYgKGIuZGF0YXNldC5ibG9jayA9PT0gJzEnICYmICFjb25maXJtKCfCv1N1c3BlbmRlciBlc3RhIGVtcHJlc2E/IE5vIHBvZHLDoSB1c2FyIGxhIGFwcCBoYXN0YSBxdWUgbGEgcmVhY3RpdmVzLicpKSByZXR1cm47IHBheWxvYWQgPSB7IGJsb2NrZWQ6IGIuZGF0YXNldC5ibG9jayA9PT0gJzEnIH07IH0KICAgIGlmIChiLmhhc0F0dHJpYnV0ZSgnZGF0YS1lbnRlcicpKSB7IHRyeSB7IGF3YWl0IGFwaShgL2FwaS9vd25lci9zcGFjZXMvJHtpZH0vZW50ZXJgLCB7IG1ldGhvZDogJ1BPU1QnIH0pOyBsb2NhdGlvbi5ocmVmID0gJy8nOyB9IGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UpOyB9IHJldHVybjsgfQogICAgaWYgKCFwYXlsb2FkKSByZXR1cm47CiAgICB0cnkgeyBhd2FpdCBhcGkoYC9hcGkvb3duZXIvc3BhY2VzLyR7aWR9YCwgeyBtZXRob2Q6ICdQT1NUJywgYm9keTogcGF5bG9hZCB9KTsgdG9hc3QoJ0xpc3RvJyk7IGRyYXdPd25lclNwYWNlcygpOyB9IGNhdGNoIChlcnIpIHsgdG9hc3QoZXJyLm1lc3NhZ2UsIDQwMDApOyB9CiAgfTsKfQoKLy8gLS0tLS0tLS0tLSBtaSBjbGF2ZSAtLS0tLS0tLS0tCmZ1bmN0aW9uIHJlbmRlck15QWNjb3VudChmb3JjZWQgPSBmYWxzZSkgewogICQoJyNhcHAnKS5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz0ibG9naW4iPjxkaXYgY2xhc3M9ImNhcmQiPjxkaXYgY2xhc3M9ImFydCI+JHtIRVJPX1NWR308L2Rpdj48Zm9ybSBpZD0ibXlGb3JtIj4KICAgIDxoMT4ke2ZvcmNlZCA/ICdDcmVhIHR1IGNsYXZlIG51ZXZhJyA6ICdNaSBjbGF2ZSd9PC9oMT4KICAgIDxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9Im1hcmdpbjowIj4ke2ZvcmNlZCA/ICdFbnRyYXN0ZSBjb24gdW5hIGNsYXZlIHRlbXBvcmFsIG8gZGUgcmVzcGFsZG8uIENyZWEgdHUgcHJvcGlhIGNvbnRyYXNlw7FhIHBhcmEgc2VndWlyLicgOiBlc2MobWUudXNlci5lbWFpbCl9PC9wPgogICAgJHtmb3JjZWQgPyAnJyA6ICc8bGFiZWwgY2xhc3M9ImYiPkNvbnRyYXNlw7FhIGFjdHVhbDxpbnB1dCB0eXBlPSJwYXNzd29yZCIgaWQ9Im1DdXIiIGF1dG9jb21wbGV0ZT0iY3VycmVudC1wYXNzd29yZCIgcmVxdWlyZWQ+PC9sYWJlbD4nfQogICAgPGxhYmVsIGNsYXNzPSJmIj5OdWV2YSBjb250cmFzZcOxYSAobcOtbmltbyA4KTxpbnB1dCB0eXBlPSJwYXNzd29yZCIgaWQ9Im1QMSIgYXV0b2NvbXBsZXRlPSJuZXctcGFzc3dvcmQiIG1pbmxlbmd0aD0iOCIgcmVxdWlyZWQ+PC9sYWJlbD4KICAgIDxsYWJlbCBjbGFzcz0iZiI+UmVww610ZWxhPGlucHV0IHR5cGU9InBhc3N3b3JkIiBpZD0ibVAyIiBhdXRvY29tcGxldGU9Im5ldy1wYXNzd29yZCIgbWlubGVuZ3RoPSI4IiByZXF1aXJlZD48L2xhYmVsPgogICAgPGxhYmVsIGNsYXNzPSJzd2l0Y2giIHN0eWxlPSJmb250LXNpemU6MTNweCI+PGlucHV0IHR5cGU9ImNoZWNrYm94IiBpZD0ibVNob3ciPiBNb3N0cmFyIGNvbnRyYXNlw7FhPC9sYWJlbD4KICAgIDxkaXYgY2xhc3M9ImVyciIgaWQ9Im1FcnIiPjwvZGl2PgogICAgPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1wcmltYXJ5IiB0eXBlPSJzdWJtaXQiPkd1YXJkYXI8L2J1dHRvbj4KICAgICR7Zm9yY2VkID8gJycgOiAnPGJ1dHRvbiBjbGFzcz0iYnRuIGJ0bi1naG9zdCIgdHlwZT0iYnV0dG9uIiBpZD0ibUJhY2t1cCI+Q3JlYXIgbWkgY2xhdmUgZGUgcmVzcGFsZG88L2J1dHRvbj48ZGl2IGlkPSJtQmFja3VwT3V0Ij48L2Rpdj48YnV0dG9uIGNsYXNzPSJidG4gYnRuLWxpbmUiIHR5cGU9ImJ1dHRvbiIgaWQ9Im1CYWNrIj5Wb2x2ZXI8L2J1dHRvbj4nfQogIDwvZm9ybT48L2Rpdj48L2Rpdj5gOwogICQoJyNtU2hvdycpLm9uY2hhbmdlID0gZSA9PiB7ICQkKCcjbXlGb3JtIGlucHV0W3R5cGU9cGFzc3dvcmRdLCAjbXlGb3JtIGlucHV0W2RhdGEtcHddJykuZm9yRWFjaChpID0+IHsgaS5kYXRhc2V0LnB3ID0gMTsgaS50eXBlID0gZS50YXJnZXQuY2hlY2tlZCA/ICd0ZXh0JyA6ICdwYXNzd29yZCc7IH0pOyB9OwogICQoJyNteUZvcm0nKS5vbnN1Ym1pdCA9IGFzeW5jIGUgPT4gewogICAgZS5wcmV2ZW50RGVmYXVsdCgpOwogICAgaWYgKCQoJyNtUDEnKS52YWx1ZSAhPT0gJCgnI21QMicpLnZhbHVlKSByZXR1cm4gKCQoJyNtRXJyJykudGV4dENvbnRlbnQgPSAnTGFzIGNvbnRyYXNlw7FhcyBubyBjb2luY2lkZW4nKTsKICAgIHRyeSB7IGF3YWl0IGFwaSgnL2FwaS9tZS9wYXNzd29yZCcsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHsgY3VycmVudDogZm9yY2VkID8gJycgOiAkKCcjbUN1cicpLnZhbHVlLCBwYXNzd29yZDogJCgnI21QMScpLnZhbHVlIH0gfSk7IHRvYXN0KCdDb250cmFzZcOxYSBndWFyZGFkYScpOyBib290KCk7IH0KICAgIGNhdGNoICh4KSB7ICQoJyNtRXJyJykudGV4dENvbnRlbnQgPSB4Lm1lc3NhZ2U7IH0KICB9OwogIGlmICghZm9yY2VkKSB7CiAgICAkKCcjbUJhY2snKS5vbmNsaWNrID0gKCkgPT4gYm9vdCgpOwogICAgJCgnI21CYWNrdXAnKS5vbmNsaWNrID0gYXN5bmMgKCkgPT4gewogICAgICB0cnkgewogICAgICAgIGNvbnN0IHIgPSBhd2FpdCBhcGkoJy9hcGkvbWUvYmFja3VwLWNvZGUnLCB7IG1ldGhvZDogJ1BPU1QnIH0pOwogICAgICAgICQoJyNtQmFja3VwT3V0JykuaW5uZXJIVE1MID0gYDxwIGNsYXNzPSJtdXRlZCIgc3R5bGU9ImZvbnQtc2l6ZToxM3B4O21hcmdpbjowIDAgNnB4Ij5HdcOhcmRhbGEgZW4gdW4gbHVnYXIgc2VndXJvIChmb3RvLCBwYXBlbCBvIG5vdGFzIGRlbCBjZWx1bGFyKS4gU2lydmUgdW5hIHNvbGEgdmV6IGVuIGVsIGNhbXBvIENvbnRyYXNlw7FhIHNpIG9sdmlkYXMgdHUgY2xhdmUuIFNpIGNyZWFzIG90cmEsIGVzdGEgZGVqYSBkZSBzZXJ2aXIuPC9wPjxpbnB1dCB0eXBlPSJ0ZXh0IiByZWFkb25seSB2YWx1ZT0iJHtlc2Moci5jb2RlKX0iIHN0eWxlPSJmb250LWZhbWlseTp2YXIoLS1tb25vKTtmb250LXNpemU6MjBweDt0ZXh0LWFsaWduOmNlbnRlciI+YDsKICAgICAgfSBjYXRjaCAoeCkgeyAkKCcjbUVycicpLnRleHRDb250ZW50ID0geC5tZXNzYWdlOyB9CiAgICB9OwogIH0KfQoKLy8gLS0tLS0tLS0tLSBpbmljaW8gLS0tLS0tLS0tLQphc3luYyBmdW5jdGlvbiBib290KCkgewogIHRyeSB7IG1lID0gYXdhaXQgYXBpKCcvYXBpL21lJyk7IGFwcGx5Q2F0YWxvZyhtZSk7IH0KICBjYXRjaCB7CiAgICBjb25zdCBoID0gYXdhaXQgZmV0Y2goJy9hcGkvc2V0dXAtc3RhdHVzJykudGhlbihyID0+IHIuanNvbigpKS5jYXRjaCgoKSA9PiAoe30pKTsKICAgIHJldHVybiBoLm5lZWRzU2V0dXAgPyByZW5kZXJTZXR1cCgpIDogcmVuZGVyTG9naW4oaC5kZW1vKTsKICB9CiAgZmlyc3RMb2FkID0gdHJ1ZTsKICBpZiAobWUubXVzdENoYW5nZSkgcmV0dXJuIHJlbmRlck15QWNjb3VudCh0cnVlKTsKICBpZiAobWUuc3BhY2UgJiYgbWUuc3BhY2Uuc3RhdHVzICYmICFtZS5zcGFjZS5zdGF0dXMuYWN0aXZlICYmICFtZS5vd25lcikgcmV0dXJuIHJlbmRlckJsb2NrZWQobWUuc3BhY2Uuc3RhdHVzLnJlYXNvbiA9PT0gJ2Jsb2NrZWQnID8gJ1R1IGVzcGFjaW8gZXN0w6Egc3VzcGVuZGlkby4gRXNjcsOtYmVub3MgcGFyYSByZWFjdGl2YXJsby4nIDogJ1R1IHBydWViYSBncmF0aXMgdGVybWluw7MuIEVzY3LDrWJlbm9zIHBhcmEgYWN0aXZhciB0dSBwbGFuLicpOwogIGlmIChsb2NhdGlvbi5wYXRobmFtZSA9PT0gJy9jb2RpZ28nKSByZXR1cm4gc2F2ZUNvZGVGcm9tTGluaygpOwogIGlmIChuZXcgVVJMU2VhcmNoUGFyYW1zKGxvY2F0aW9uLnNlYXJjaCkuZ2V0KCdwYWdvJykpIHsKICAgIC8vIHZ1ZWx2ZSBkZSBNZXJjYWRvIFBhZ286IHNlIHJldmlzYSBlbCBwYWdvIGFsIHRpcm8KICAgIGhpc3RvcnkucmVwbGFjZVN0YXRlKG51bGwsICcnLCAnLycpOwogICAgdHJ5IHsgYXdhaXQgYXBpKCcvYXBpL2JpbGxpbmc/Y2hlY2s9MScpOyBtZSA9IGF3YWl0IGFwaSgnL2FwaS9tZScpOyBhcHBseUNhdGFsb2cobWUpOyB0b2FzdCgnwqFHcmFjaWFzISBSZXZpc2Ftb3MgdHUgcGFnbyBjb24gTWVyY2FkbyBQYWdvLiBTaSB5YSBzZSBhcHJvYsOzLCB0dSBwbGFuIHF1ZWTDsyBhY3Rpdm8uJywgNzAwMCk7IH0gY2F0Y2ggeyAvKiBzZSByZXZpc2EgZGVzcHXDqXMgKi8gfQogICAgaWYgKG1lLnNwYWNlICYmIG1lLnNwYWNlLnN0YXR1cyAmJiAhbWUuc3BhY2Uuc3RhdHVzLmFjdGl2ZSAmJiAhbWUub3duZXIpIHJldHVybiByZW5kZXJCbG9ja2VkKCdUdSBwYWdvIGHDum4gbm8gc2UgY29uZmlybWEuIFNpIHlhIHBhZ2FzdGUsIGVzcGVyYSB1bm9zIG1pbnV0b3MgeSB2dWVsdmUgYSBlbnRyYXIuJyk7CiAgICBzdG9yZS5zZXQoJ3RhYicsICdhZG1pbicpOyB0YWIgPSBudWxsOwogIH0KICByZW5kZXJTaGVsbCgpOwp9CmJvb3QoKTsKfSkoKTsKCi8vIGNhZGEgbWludXRvOiBzaSBhbGfDum4gcGFxdWV0ZSBlbnRyYSBlbiAiQWR2ZXJ0ZW5jaWEiIG8gcGFzYSBhICJBdHJhc2FkYXMiLCBzZSBhY3R1YWxpemEgbGEgYmFuZGVqYQpsZXQgX2FsZXJ0U2lnID0gJyc7CnNldEludGVydmFsKCgpID0+IHsKICB0cnkgewogICAgaWYgKHR5cGVvZiBvcmRlcnMgPT09ICd1bmRlZmluZWQnIHx8ICEkKCcjdGFic0JpZycpKSByZXR1cm47CiAgICBjb25zdCBzaWcgPSBvcmRlcnMuZmlsdGVyKG8gPT4gaXNXYXJuKG8pIHx8IGxhdGVOb3cobykpLm1hcChvID0+IG8uaWQgKyAoaXNXYXJuKG8pID8gJ3cnICsgbWluc0xlZnQobykgOiAnbCcpKS5qb2luKCcsJyk7CiAgICBpZiAoc2lnID09PSBfYWxlcnRTaWcpIHJldHVybjsKICAgIF9hbGVydFNpZyA9IHNpZzsKICAgIGlmICghZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI21haW4gaW5wdXQ6Zm9jdXMsICNtYWluIHNlbGVjdDpmb2N1cycpKSBkcmF3Um93cygpOwogIH0gY2F0Y2ggeyAvKiBuYWRhICovIH0KfSwgNjBlMyk7Cg==","index.html":"PCFkb2N0eXBlIGh0bWw+CjxodG1sIGxhbmc9ImVzIj4KPGhlYWQ+CjxtZXRhIGNoYXJzZXQ9InV0Zi04Ij4KPG1ldGEgbmFtZT0idmlld3BvcnQiIGNvbnRlbnQ9IndpZHRoPWRldmljZS13aWR0aCwgaW5pdGlhbC1zY2FsZT0xLCB2aWV3cG9ydC1maXQ9Y292ZXIiPgo8dGl0bGU+RXRpcXVldGFIdWI8L3RpdGxlPgo8bGluayByZWw9Imljb24iIGhyZWY9Ii9sb2dvLnN2ZyIgdHlwZT0iaW1hZ2Uvc3ZnK3htbCI+CjxsaW5rIHJlbD0icHJlY29ubmVjdCIgaHJlZj0iaHR0cHM6Ly9mb250cy5nb29nbGVhcGlzLmNvbSI+CjxsaW5rIHJlbD0ic3R5bGVzaGVldCIgaHJlZj0iaHR0cHM6Ly9mb250cy5nb29nbGVhcGlzLmNvbS9jc3MyP2ZhbWlseT1CYWxvbysyOndnaHRANjAwOzcwMDs4MDAmZmFtaWx5PVBhY2lmaWNvJmZhbWlseT1OdW5pdG8rU2FuczpvcHN6LHdnaHRANi4uMTIsNDAwOzYuLjEyLDYwMDs2Li4xMiw3MDAmZmFtaWx5PUpldEJyYWlucytNb25vOndnaHRANTAwOzcwMCZkaXNwbGF5PXN3YXAiPgo8bGluayByZWw9InN0eWxlc2hlZXQiIGhyZWY9Ii9hcHAuY3NzIj4KPC9oZWFkPgo8Ym9keT4KPGRpdiBpZD0iYXBwIj48ZGl2IHN0eWxlPSJtaW4taGVpZ2h0OjEwMHZoO2Rpc3BsYXk6Z3JpZDtwbGFjZS1pdGVtczpjZW50ZXI7Zm9udC1mYW1pbHk6c3lzdGVtLXVpLHNhbnMtc2VyaWY7Y29sb3I6IzBBNkZBNjtmb250LXdlaWdodDo3MDAiPkNhcmdhbmRvIEV0aXF1ZXRhSHVi4oCmIChsYSBwcmltZXJhIHZleiBwdWVkZSB0YXJkYXIgaGFzdGEgMSBtaW51dG8pPC9kaXY+PC9kaXY+CjxkaXYgY2xhc3M9InRvYXN0IiBpZD0idG9hc3QiIGhpZGRlbj48L2Rpdj4KPHNjcmlwdCBzcmM9Ii9hcHAuanMiPjwvc2NyaXB0Pgo8L2JvZHk+CjwvaHRtbD4K","logo.svg":"PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0MCA0MCI+PHJlY3QgeD0iNCIgeT0iOCIgd2lkdGg9IjMyIiBoZWlnaHQ9IjI2IiByeD0iNyIgZmlsbD0iIzE2OTNEMyIvPjxwYXRoIGQ9Ik00IDE2aDMyIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iMi41Ii8+PHJlY3QgeD0iMTAiIHk9IjIxIiB3aWR0aD0iMTIiIGhlaWdodD0iMyIgcng9IjEuNSIgZmlsbD0iI2ZmZiIvPjxyZWN0IHg9IjEwIiB5PSIyNiIgd2lkdGg9IjgiIGhlaWdodD0iMyIgcng9IjEuNSIgZmlsbD0iI0JGRTZGOCIvPjxjaXJjbGUgY3g9IjI5IiBjeT0iMjYiIHI9IjQiIGZpbGw9IiNmZmYiLz48L3N2Zz4K"};
__req('index', './start');
