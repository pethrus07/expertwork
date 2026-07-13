/* ═══════════════════════════════════════════════════════════════════
   EXPERT WORK — API do cliente (empresa)
   A empresa faz login e vê SÓ o próprio tenant. O que ela recebe é a
   projeção derivada do ledger (dashboard calculado no servidor). Espelha
   o portal do parceiro do IndustriAlly: só leitura, filtrado server-side.
═══════════════════════════════════════════════════════════════════ */
const crypto = require('crypto');
const {
  sendJson, readBody, getToken,
  readTenants, readLedger, readConfig, verificarSenha,
} = require('./store');
const { montarDashboard } = require('./credito');

const sessions = new Map(); // token -> { tenantId, criadoEm }

function criarSessao(tenantId) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { tenantId: String(tenantId), criadoEm: Date.now() });
  return token;
}

/* Cookie de sessão — necessário para autorizar as <img> das fotos (uma tag
   <img> não envia header Authorization, mas envia cookies same-origin). */
function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  const m = raw.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
function tenantIdDoCookie(req) {
  const tok = getCookie(req, 'ew_sess');
  const s = tok && sessions.get(tok);
  return s ? s.tenantId : null;
}
// Só autoriza a foto se a empresa logada tiver uma OS que referencia o arquivo.
async function fotoAutorizada(req, requestPath) {
  const tenantId = tenantIdDoCookie(req);
  if (!tenantId) return false;
  const base = String(requestPath).split('/').pop().toLowerCase();
  const ledger = await readLedger(tenantId);
  return (ledger.ordens_de_servico || []).some(o =>
    Array.isArray(o.fotos) && o.fotos.some(f => String(f.src || '').split('/').pop().toLowerCase() === base)
  );
}

// Empresa dona do token (ou responde 401). Isolamento server-side.
async function empresaLogada(req, res) {
  const token = getToken(req);
  if (!token || !sessions.has(token)) {
    sendJson(res, 401, { status: 0, message: 'Não autorizado.' });
    return null;
  }
  const { tenantId } = sessions.get(token);
  const db = await readTenants();
  const emp = db.empresas.find(e => String(e.id) === String(tenantId) && Number(e.status) !== 0);
  if (!emp) {
    sessions.delete(token);
    sendJson(res, 401, { status: 0, message: 'Sessão inválida.' });
    return null;
  }
  return emp;
}

async function payloadEmpresa(emp) {
  const cfg = await readConfig();
  const ledger = await readLedger(emp.id);
  const dashboard = montarDashboard(emp.empresa || {}, ledger, cfg);
  return {
    user: { id: emp.id, login: emp.login, nome: (emp.empresa && emp.empresa.nome) || emp.login },
    dashboard,
  };
}

async function handlePortalApi(req, res, pathname) {
  if (req.method === 'OPTIONS') { sendJson(res, 204, {}); return; }

  /* ---- LOGIN do cliente ---- */
  if (pathname === '/api/login' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const login = String(body.login || body.usuario || body.email || '').trim().toLowerCase();
      const senha = String(body.senha || body.password || '');
      const db = await readTenants();
      const emp = db.empresas.find(e =>
        (String(e.login).toLowerCase() === login || String(e.id).toLowerCase() === login) &&
        Number(e.status) !== 0
      );
      if (!emp || !verificarSenha(senha, emp.senha)) {
        sendJson(res, 401, { status: 0, message: 'Usuário ou senha inválidos.' });
        return;
      }
      const token = criarSessao(emp.id);
      res.setHeader('Set-Cookie', `ew_sess=${token}; Path=/; HttpOnly; SameSite=Strict`);
      sendJson(res, 200, { status: 1, token, ...(await payloadEmpresa(emp)) });
    } catch (err) {
      sendJson(res, 400, { status: 0, message: err.message || 'Falha no login.' });
    }
    return;
  }

  /* ---- DASHBOARD (dados do próprio tenant) ---- */
  if (pathname === '/api/portal' && req.method === 'GET') {
    const emp = await empresaLogada(req, res);
    if (!emp) return;
    sendJson(res, 200, { status: 1, ...(await payloadEmpresa(emp)) });
    return;
  }

  /* ---- DETALHE DE UMA OS do próprio tenant ---- */
  if (pathname.startsWith('/api/portal/os/') && req.method === 'GET') {
    const emp = await empresaLogada(req, res);
    if (!emp) return;
    const id = decodeURIComponent(pathname.replace('/api/portal/os/', '').split('/')[0]);
    const ledger = await readLedger(emp.id);
    const os = (ledger.ordens_de_servico || []).find(o => String(o.id) === id);
    if (!os) { sendJson(res, 404, { status: 0, message: 'OS não encontrada.' }); return; }
    sendJson(res, 200, { status: 1, os });
    return;
  }

  /* ---- LOGOUT ---- */
  if (pathname === '/api/logout' && req.method === 'POST') {
    const token = getToken(req) || getCookie(req, 'ew_sess');
    if (token) sessions.delete(token);
    res.setHeader('Set-Cookie', 'ew_sess=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
    sendJson(res, 200, { status: 1 });
    return;
  }

  sendJson(res, 404, { status: 0, message: 'Endpoint não encontrado.' });
}

module.exports = { handlePortalApi, sessions, fotoAutorizada };
