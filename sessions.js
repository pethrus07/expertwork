/* ═══════════════════════════════════════════════════════════════════
   EXPERT WORK — Sessões persistentes
   Guarda as sessões (cliente e admin) em .sessions.json para sobreviverem
   ao restart do servidor. Poda tokens expirados (TTL) ao carregar; grava
   com debounce para não escrever a cada request.
═══════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '.sessions.json');
const TTL = 1000 * 60 * 60 * 24 * 7; // 7 dias

function loadAll() {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    const now = Date.now();
    const out = { portal: new Map(), admin: new Map() };
    for (const scope of ['portal', 'admin']) {
      for (const [tok, s] of Object.entries(j[scope] || {})) {
        if (!s || (s.criadoEm && now - s.criadoEm > TTL)) continue; // poda expirados
        out[scope].set(tok, s);
      }
    }
    return out;
  } catch {
    return { portal: new Map(), admin: new Map() };
  }
}

const stores = loadAll();
let timer = null;
function persist() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    const obj = { portal: Object.fromEntries(stores.portal), admin: Object.fromEntries(stores.admin) };
    fs.writeFile(FILE, JSON.stringify(obj), () => {});
  }, 150);
}

function store(scope) {
  const m = stores[scope];
  return {
    get: k => m.get(k),
    has: k => m.has(k),
    set: (k, v) => { m.set(k, v); persist(); return v; },
    delete: k => { const r = m.delete(k); persist(); return r; },
  };
}

module.exports = { portal: store('portal'), admin: store('admin') };
