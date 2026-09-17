/* ═══════════════════════════════════════════════
   جم مارکت — سرور (نسخه ۴)
   اجرا: npm install  سپس  npm start  →  localhost:3000
   ═══════════════════════════════════════════════ */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads'); // عکس‌های آپلودی اینجا ذخیره می‌شوند
const TOKEN_TTL = 7 * 24 * 3600 * 1000;

/* ─── حساب مدیر (فقط بار اول ساخته می‌شود) ─── */
const ADMIN_USERNAME = 'adminjmff';
const ADMIN_PASSWORD = 'admin2026pass';

const RANKS = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'heroic', 'grandmaster'];
const IMG_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ─── داده‌های اولیه محصولات ─── */
const DEFAULT_GEMS = [
  { id: 'gem110',  amount: 110,  price: 220000,  special: true },
  { id: 'gem231',  amount: 231,  price: 240000,  special: true },
  { id: 'gem530',  amount: 530,  price: 1100000, special: false },
  { id: 'gem1060', amount: 1060, price: 2200000, special: false },
  { id: 'gem2180', amount: 2180, price: 4400000, special: false },
];
const DEFAULT_ACCOUNTS = [
  {id:'ac1',name:'اکانت هیرویک | فول کاراکتر',  rank:'heroic',     level:62,pid:'254178963',price:1950000,img:'https://picsum.photos/seed/gmk-hero1/640/400.jpg',special:true},
  {id:'ac2',name:'اکانت الماس ۴ | فول ایونت',    rank:'diamond',    level:71,pid:'214587301',price:950000, img:'https://picsum.photos/seed/gmk-dia2/640/400.jpg', special:false},
  {id:'ac3',name:'اکانت گرندماستر | کلکسیونر',  rank:'grandmaster',level:80,pid:'287340159',price:2750000,img:'https://picsum.photos/seed/gmk-gm3/640/400.jpg', special:true},
  {id:'ac4',name:'اکانت گلد ۳ | استارتر',       rank:'gold',       level:45,pid:'205396418',price:380000, img:'https://picsum.photos/seed/gmk-gold4/640/400.jpg',special:false},
  {id:'ac5',name:'اکانت پلاتینیوم ۱ | اسنایپر', rank:'platinum',   level:55,pid:'239651804',price:620000, img:'https://picsum.photos/seed/gmk-pl5/640/400.jpg', special:true},
  {id:'ac6',name:'اکانت برنز | اقتصادی',        rank:'bronze',     level:21,pid:'241058736',price:120000, img:'https://picsum.photos/seed/gmk-br6/640/400.jpg', special:false},
  {id:'ac7',name:'اکانت نقره ۴ | رش',           rank:'silver',     level:34,pid:'216843970',price:240000, img:'https://picsum.photos/seed/gmk-sil7/640/400.jpg', special:false},
  {id:'ac8',name:'اکانت الماس ۱ | ام‌کنترلر',   rank:'diamond',    level:68,pid:'295704613',price:1450000,img:'https://picsum.photos/seed/gmk-dia8/640/400.jpg', special:false},
  {id:'ac9',name:'اکانت پلاتینیوم ۳ | رشر',     rank:'platinum',   level:59,pid:'273891540',price:780000, img:'https://picsum.photos/seed/gmk-pl9/640/400.jpg', special:false},
];

/* ═══ بارگذاری و ذخیره دیتابیس ═══ */
let DB;
function load() {
  try { DB = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { DB = null; }
  if (!DB || typeof DB !== 'object') DB = {};
  if (!Array.isArray(DB.users)) DB.users = [];
  if (!DB.sessions || typeof DB.sessions !== 'object') DB.sessions = {};
  if (!Array.isArray(DB.gems) || !DB.gems.length) DB.gems = DEFAULT_GEMS.map(g => ({ ...g }));
  if (!Array.isArray(DB.accounts) || !DB.accounts.length) DB.accounts = DEFAULT_ACCOUNTS.map(a => ({ ...a }));
  const now = Date.now();
  for (const t of Object.keys(DB.sessions)) {
    if (!DB.sessions[t] || new Date(DB.sessions[t].exp).getTime() < now) delete DB.sessions[t];
  }
}
let saveT = null;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(DB, null, 2)); }
    catch (e) { console.error('خطا در ذخیره data.json:', e.message); }
  }, 60);
}
function saveNow() { try { fs.writeFileSync(DATA_FILE, JSON.stringify(DB, null, 2)); } catch (e) {} }

/* ═══ رمزنگاری ═══ */
const hashPass = (pass, salt) => crypto.scryptSync(String(pass), salt, 64).toString('hex');
const newSalt  = () => crypto.randomBytes(16).toString('hex');
const newToken = () => crypto.randomBytes(32).toString('hex');
function safeEq(a, b) {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}
const faToEn = s => String(s == null ? '' : s).replace(/[۰-۹]/g, c => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[^0-9]/g, '');

/* ═══ نشست‌ها (کوکی) ═══ */
function parseCookies(req) {
  const out = {}; const h = req.headers.cookie;
  if (!h) return out;
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function currentUser(req) {
  const token = parseCookies(req).gm_token;
  if (!token) return null;
  const s = DB.sessions[token];
  if (!s || new Date(s.exp).getTime() < Date.now()) { if (s) delete DB.sessions[token]; return null; }
  return DB.users.find(u => u.id === s.uid) || null;
}
function startSession(res, user) {
  const token = newToken();
  DB.sessions[token] = { uid: user.id, exp: new Date(Date.now() + TOKEN_TTL).toISOString() };
  res.setHeader('Set-Cookie', `gm_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TOKEN_TTL / 1000}`);
  save();
}
function endSession(req, res) {
  const token = parseCookies(req).gm_token;
  if (token) { delete DB.sessions[token]; save(); }
  res.setHeader('Set-Cookie', 'gm_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

/* ═══ محدودیت تلاش ورود ═══ */
const attempts = new Map();
const aKey = (req, u) => (req.ip || 'x') + '|' + String(u || '').toLowerCase();
function rateOK(req, u) { const r = attempts.get(aKey(req, u)); return !(r && r.lock > Date.now()); }
function rateFail(req, u) {
  const r = attempts.get(aKey(req, u)) || { n: 0, lock: 0 };
  r.n++; if (r.n >= 5) { r.lock = Date.now() + 10 * 60 * 1000; r.n = 0; }
  attempts.set(aKey(req, u), r);
}
function rateClear(req, u) { attempts.delete(aKey(req, u)); }

/* ═══ ابزارها ═══ */
const vUser = u => typeof u === 'string' && /^[a-zA-Z0-9_]{3,20}$/.test(u);
const vPass = p => typeof p === 'string' && p.length >= 8 && p.length <= 64;
const findProduct = id => DB.gems.find(g => g.id === id) || DB.accounts.find(a => a.id === id);
const pubUser = u => ({ username: u.username, role: u.role, createdAt: u.createdAt });

/* حذف فایل عکس آپلودی وقتی دیگر هیچ اکانتی از آن استفاده نمی‌کند */
function unlinkUpload(img) {
  if (typeof img !== 'string' || !img.startsWith('/uploads/')) return;
  if (DB.accounts.some(a => a.img === img)) return;
  try { fs.unlinkSync(path.join(__dirname, 'public', img)); } catch (e) {}
}

function sanitizeState(state) {
  const cart = {};
  if (state && typeof state.cart === 'object') {
    for (const id in state.cart) {
      if (!findProduct(id)) continue;
      const q = Math.min(20, Math.max(1, parseInt(state.cart[id]) || 0));
      if (DB.accounts.some(a => a.id === id)) cart[id] = 1;
      else cart[id] = q;
    }
  }
  let favs = [];
  if (Array.isArray(state && state.favs)) {
    favs = [...new Set(state.favs)].filter(id => findProduct(id)).slice(0, 100);
  }
  return { cart, favs };
}
function mergeState(base, inc) {
  const cart = { ...((base && base.cart) || {}) };
  if (inc && typeof inc.cart === 'object') {
    for (const id in inc.cart) {
      if (DB.accounts.some(a => a.id === id)) { cart[id] = 1; continue; }
      if (DB.gems.some(g => g.id === id)) {
        cart[id] = Math.min(20, (cart[id] || 0) + Math.max(1, Math.min(20, +inc.cart[id] || 1)));
      }
    }
  }
  const favs = [...new Set([...((base && base.favs) || []), ...((inc && inc.favs) || [])])]
    .filter(id => findProduct(id));
  return { cart, favs };
}

/* ═══ اعتبارسنجی اکانت (مدل جدید: اسم، لول، آیدی، عکس، رنک، ویژه، قیمت) ═══ */
function validAccount(a) {
  if (!a || typeof a !== 'object') return 'اطلاعات اکانت نامعتبر است';
  if (typeof a.name !== 'string' || a.name.trim().length < 3 || a.name.trim().length > 90) return 'اسم اکانت باید ۳ تا ۹۰ کاراکتر باشد';
  if (!RANKS.includes(a.rank)) return 'رنک اکانت را انتخاب کن';
  if (!Number.isFinite(+a.level) || +a.level < 1 || +a.level > 999) return 'لول اکانت را درست وارد کنید';
  if (!/^\d{4,15}$/.test(faToEn(a.pid))) return 'آیدی بازی اکانت باید ۴ تا ۱۵ رقم باشد';
  if (!Number.isFinite(+a.price) || +a.price < 0) return 'قیمت نامعتبر است';
  const img = (typeof a.img === 'string' ? a.img : '').trim();
  if (!(/https?:\/\/.+/i.test(img) || /^\/uploads\/[a-f0-9]+\.(jpg|png|webp|gif)$/i.test(img))) return 'عکس اکانت را آپلود کن';
  return null;
}
function normAccount(a) {
  return {
    name: a.name.trim(), rank: a.rank, level: Math.round(+a.level),
    pid: faToEn(a.pid), price: Math.round(+a.price),
    img: a.img.trim(), special: !!a.special,
  };
}

/* ═══ ساخت اپ ═══ */
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});
app.use(express.json({ limit: '200kb' }));

const authRequired = (req, res, next) => {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'ابتدا وارد حساب خود شوید' });
  req.user = u; next();
};
const adminRequired = (req, res, next) => {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'ابتدا وارد شوید' });
  if (u.role !== 'admin') return res.status(403).json({ error: 'این بخش فقط برای مدیر سایت است' });
  req.user = u; next();
};

/* ─── احراز هویت ─── */
app.post('/api/auth/register', (req, res) => {
  const { username, password, accept, localState } = req.body || {};
  if (!vUser(username)) return res.status(400).json({ error: 'نام کاربری باید ۳ تا ۲۰ کاراکتر لاتین باشد (حروف، اعداد و _)' });
  if (!vPass(password)) return res.status(400).json({ error: 'رمز عبور باید ۸ تا ۶۴ کاراکتر باشد' });
  if (!accept) return res.status(400).json({ error: 'پذیرش قوانین سایت الزامی است' });
  if (DB.users.some(u => u.username.toLowerCase() === username.toLowerCase()))
    return res.status(409).json({ error: 'این نام کاربری قبلاً ثبت شده است' });
  const salt = newSalt();
  const u = {
    id: 'u' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex'),
    username, passHash: hashPass(password, salt), salt,
    role: 'user', createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString(),
    state: mergeState(null, localState),
  };
  DB.users.push(u);
  startSession(res, u); save();
  res.json({ user: pubUser(u), state: sanitizeState(u.state) });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password, localState } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'نام کاربری و رمز عبور را وارد کنید' });
  if (!rateOK(req, username)) return res.status(429).json({ error: 'تلاش ناموفق زیاد؛ ۱۰ دقیقه دیگر دوباره امتحان کنید' });
  const u = DB.users.find(x => x.username.toLowerCase() === String(username).toLowerCase());
  const h = hashPass(password, u ? u.salt : 'salt-ثابت-نمونه');
  if (!u || !safeEq(h, u.passHash)) {
    rateFail(req, username);
    return res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است' });
  }
  rateClear(req, username);
  u.lastLogin = new Date().toISOString();
  u.state = mergeState(u.state, localState);
  startSession(res, u); save();
  res.json({ user: pubUser(u), state: sanitizeState(u.state) });
});

app.post('/api/auth/logout', (req, res) => { endSession(req, res); res.json({ ok: true }); });

app.get('/api/me', (req, res) => {
  const u = currentUser(req);
  if (!u) return res.json({ user: null, state: { cart: {}, favs: [] } });
  res.json({ user: pubUser(u), state: sanitizeState(u.state) });
});

app.put('/api/me/state', authRequired, (req, res) => {
  req.user.state = sanitizeState(req.body);
  save();
  res.json({ ok: true });
});

/* ─── محصولات (عمومی) ─── */
app.get('/api/products', (req, res) => res.json({ gems: DB.gems, accounts: DB.accounts }));

/* ─── پنل مدیریت: جم‌ها ─── */
app.put('/api/admin/gems', adminRequired, (req, res) => {
  const list = req.body && req.body.gems;
  if (!Array.isArray(list) || !list.length) return res.status(400).json({ error: 'داده ارسالی نامعتبر است' });
  for (const g of list) {
    if (!DB.gems.find(x => x.id === g.id)) continue;
    if (!Number.isFinite(+g.price) || +g.price < 0) return res.status(400).json({ error: 'قیمت واردشده نامعتبر است' });
  }
  DB.gems = DB.gems.map(g => {
    const inc = list.find(x => x.id === g.id);
    return inc ? { ...g, price: Math.round(+inc.price), special: !!inc.special } : g;
  });
  save();
  res.json({ ok: true, gems: DB.gems });
});

/* ─── آپلود عکس اکانت (فقط مدیر) ─── */
app.post('/api/admin/upload', adminRequired,
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], limit: '3mb' }),
  (req, res) => {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: 'فایلی دریافت نشد' });
    if (buf.length > 3 * 1024 * 1024) return res.status(413).json({ error: 'حجم عکس بیشتر از ۳ مگابایت است' });
    const mime = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const ext = IMG_TYPES[mime];
    if (!ext) return res.status(400).json({ error: 'فرمت عکس نامعتبر است (JPG، PNG، WEBP یا GIF)' });
    const name = crypto.randomBytes(9).toString('hex') + '.' + ext;
    fs.writeFile(path.join(UPLOAD_DIR, name), buf, err => {
      if (err) return res.status(500).json({ error: 'خطا در ذخیره فایل روی سرور' });
      res.json({ url: '/uploads/' + name });
    });
  });

/* ─── پنل مدیریت: اکانت‌ها ─── */
app.post('/api/admin/accounts', adminRequired, (req, res) => {
  const a = req.body || {};
  const err = validAccount(a);
  if (err) return res.status(400).json({ error: err });
  const acc = { id: 'ac' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'), ...normAccount(a) };
  DB.accounts.push(acc); save();
  res.json({ ok: true, account: acc });
});

app.put('/api/admin/accounts/:id', adminRequired, (req, res) => {
  const acc = DB.accounts.find(a => a.id === req.params.id);
  if (!acc) return res.status(404).json({ error: 'اکانت مورد نظر پیدا نشد' });
  const a = req.body || {};
  const err = validAccount(a);
  if (err) return res.status(400).json({ error: err });
  const oldImg = acc.img;
  Object.assign(acc, normAccount(a));
  if (oldImg !== acc.img) unlinkUpload(oldImg); // عکس قبلی اگر دیگر استفاده نشد حذف می‌شود
  save();
  res.json({ ok: true, account: acc });
});

app.delete('/api/admin/accounts/:id', adminRequired, (req, res) => {
  const id = req.params.id;
  const acc = DB.accounts.find(a => a.id === id);
  if (!acc) return res.status(404).json({ error: 'اکانت پیدا نشد' });
  DB.accounts = DB.accounts.filter(a => a.id !== id);
  unlinkUpload(acc.img);
  DB.users.forEach(u => {
    if (u.state) {
      if (u.state.cart) delete u.state.cart[id];
      if (Array.isArray(u.state.favs)) u.state.favs = u.state.favs.filter(f => f !== id);
    }
  });
  save();
  res.json({ ok: true });
});

/* ─── پنل مدیریت: کاربران ─── */
app.get('/api/admin/users', adminRequired, (req, res) => {
  res.json({
    users: DB.users
      .map(u => ({ username: u.username, role: u.role, createdAt: u.createdAt, lastLogin: u.lastLogin }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  });
});

/* ─── صفحات و فایل‌ها ─── */
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', (req, res) => res.status(404).json({ error: 'مسیر API یافت نشد' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'داده ارسالی نامعتبر است' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'حجم فایل بیشتر از ۳ مگابایت است' });
  console.error(err);
  res.status(500).json({ error: 'خطای داخلی سرور' });
});

/* ═══ راه‌اندازی ═══ */
load();
if (!DB.users.some(u => u.username === ADMIN_USERNAME && u.role === 'admin')) {
  const salt = newSalt();
  DB.users.push({
    id: 'admin', username: ADMIN_USERNAME, passHash: hashPass(ADMIN_PASSWORD, salt),
    salt, role: 'admin', createdAt: new Date().toISOString(), state: { cart: {}, favs: [] },
  });
  save();
}
process.on('SIGINT', () => { saveNow(); process.exit(0); });
process.on('SIGTERM', () => { saveNow(); process.exit(0); });

app.listen(PORT, () => {
  console.log('══════════════════════════════════════');
  console.log('  جم مارکت اجرا شد  →  http://localhost:' + PORT);
  console.log('  پنل مدیریت        →  http://localhost:' + PORT + '/admin');
  console.log('  عکس‌های آپلودی    →  public/uploads');
  console.log('══════════════════════════════════════');
});
