/* ═══════════════════════════════════════════════════════════════════
   EXPERT WORK — API do admin geral (Celiware)
   Login interno com poder CROSS-TENANT: alcança qualquer OS de qualquer
   empresa. É por aqui que o dado nasce — recargas, OS e cadastro das
   empresas. Espelha os usuários internos do server.js do IndustriAlly,
   mas sem a barreira por responsável: o admin vê e edita tudo.
═══════════════════════════════════════════════════════════════════ */
const crypto = require('crypto');
const {
  sendJson, readBody, getToken,
  readTenants, writeTenants, readLedger, writeLedger, readConfig,
  hashSenha, verificarSenha, idSeguro,
} = require('./store');
const { creditosDerivados } = require('./credito');

// Admins internos da Celiware. EM PRODUÇÃO defina as senhas por variável de
// ambiente (ADMIN_PASS_*). Os valores abaixo são só para demonstração local.
const admins = [
  { id: 'adm-valdir', login: 'valdir', nome: 'Valdir · Celiware', senha: process.env.ADMIN_PASS_VALDIR || 'admin1234' },
  { id: 'adm-celiware', login: 'admin', nome: 'Admin Celiware', senha: process.env.ADMIN_PASS_ADMIN || 'admin1234' },
];

const sessions = new Map(); // token -> { adminId, login, nome }

function criarSessao(a) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { adminId: a.id, login: a.login, nome: a.nome, criadoEm: Date.now() });
  return token;
}
function adminLogado(req, res) {
  const token = getToken(req);
  if (!token || !sessions.has(token)) {
    sendJson(res, 401, { status: 0, message: 'Não autorizado.' });
    return null;
  }
  return sessions.get(token);
}

function toMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let s = String(value ?? '').replace(/[^\d,.-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const num = Number(s);
  return Number.isFinite(num) ? num : 0;
}
function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}
function novaOsId(ledger) {
  const ano = new Date().getFullYear();
  const ids = new Set((ledger.ordens_de_servico || []).map(o => String(o.id)));
  // Garante unicidade real (os IDs da base podem ter lacunas) — nunca colide.
  let seq = (ledger.ordens_de_servico || []).length + 1;
  let id;
  do {
    id = `OS-${ano}-${String(seq).padStart(3, '0')}`;
    seq++;
  } while (ids.has(id));
  return id;
}

// Resumo de uma empresa para a lista do admin (saldo derivado + contagem de OS).
async function resumoEmpresa(emp, cfg) {
  const ledger = await readLedger(emp.id);
  const cr = creditosDerivados(ledger, cfg);
  return {
    id: emp.id,
    login: emp.login,
    status: emp.status,
    empresa: emp.empresa || {},
    saldo: {
      disponivel: cr.total_disponivel,
      depositado: cr.total_depositado,
      utilizado: cr.total_utilizado,
      reservado: cr.saldo_reservado,
      moeda: cr.moeda,
    },
    totalOS: (ledger.ordens_de_servico || []).length,
  };
}

async function handleAdminApi(req, res, pathname) {
  if (req.method === 'OPTIONS') { sendJson(res, 204, {}); return; }

  const rest = pathname.replace(/^\/api\/admin\/?/, '');
  const seg = rest.split('/').filter(Boolean).map(decodeURIComponent);

  /* ---- LOGIN (admin) ---- */
  if (seg[0] === 'login' && req.method === 'POST') {
    const body = await readBody(req);
    const login = String(body.login || body.usuario || body.email || '').trim().toLowerCase();
    const senha = String(body.senha || body.password || '');
    const admin = admins.find(a => a.login.toLowerCase() === login && verificarSenha(senha, a.senha));
    if (!admin) { sendJson(res, 401, { status: 0, message: 'Usuário ou senha inválidos.' }); return; }
    const token = criarSessao(admin);
    sendJson(res, 200, { status: 1, token, admin: { id: admin.id, login: admin.login, nome: admin.nome } });
    return;
  }

  if (seg[0] === 'logout' && req.method === 'POST') {
    const token = getToken(req);
    if (token) sessions.delete(token);
    sendJson(res, 200, { status: 1 });
    return;
  }

  // Todas as rotas abaixo exigem admin logado.
  const sess = adminLogado(req, res);
  if (!sess) return;

  try {
    /* ---- EMPRESAS ---- */
    if (seg[0] === 'empresas') {
      const cfg = await readConfig();
      const db = await readTenants();

      // GET /empresas  → lista com saldo derivado
      if (seg.length === 1 && req.method === 'GET') {
        const lista = [];
        for (const emp of db.empresas) lista.push(await resumoEmpresa(emp, cfg));
        sendJson(res, 200, { status: 1, empresas: lista });
        return;
      }

      // POST /empresas → cria empresa (conta + ledger vazio)
      if (seg.length === 1 && req.method === 'POST') {
        const body = await readBody(req);
        const nome = String(body.nome || (body.empresa && body.empresa.nome) || '').trim();
        const loginRaw = String(body.login || body.email || '').trim().toLowerCase();
        const senha = String(body.senha || body.password || '');
        if (!nome) return sendJson(res, 400, { status: 0, message: 'Informe o nome da empresa.' });
        if (!loginRaw) return sendJson(res, 400, { status: 0, message: 'Informe o login (usuário/e-mail).' });
        if (senha.length < 6) return sendJson(res, 400, { status: 0, message: 'A senha precisa ter ao menos 6 caracteres.' });
        if (db.empresas.some(e => String(e.login).toLowerCase() === loginRaw)) {
          return sendJson(res, 409, { status: 0, message: 'Já existe uma empresa com esse login.' });
        }
        const id = idSeguro(body.id || loginRaw.split('@')[0]);
        if (db.empresas.some(e => String(e.id) === id)) {
          return sendJson(res, 409, { status: 0, message: 'Já existe uma empresa com esse identificador.' });
        }
        const emp = {
          id,
          login: loginRaw,
          senha: hashSenha(senha),
          empresa: {
            id: String(body.empresaId || `EMP-${id}`),
            nome,
            cnpj: String(body.cnpj || (body.empresa && body.empresa.cnpj) || ''),
            segmento: String(body.segmento || (body.empresa && body.empresa.segmento) || ''),
            logo_url: String(body.logo_url || (body.empresa && body.empresa.logo_url) || ''),
          },
          status: 1,
          criadoEm: new Date().toISOString(),
        };
        db.empresas.push(emp);
        await writeTenants(db);
        await writeLedger(id, { recargas: [], ordens_de_servico: [] });
        sendJson(res, 201, { status: 1, empresa: await resumoEmpresa(emp, cfg) });
        return;
      }

      // Rotas por empresa: /empresas/:id...
      const emp = db.empresas.find(e => String(e.id) === String(seg[1]));
      if (!emp) return sendJson(res, 404, { status: 0, message: 'Empresa não encontrada.' });

      // GET /empresas/:id → conta (sem senha) + ledger cru (para edição)
      if (seg.length === 2 && req.method === 'GET') {
        const ledger = await readLedger(emp.id);
        const { senha, ...conta } = emp;
        sendJson(res, 200, { status: 1, empresa: conta, ledger, saldo: (await resumoEmpresa(emp, cfg)).saldo });
        return;
      }

      // PUT /empresas/:id → atualiza cadastro (e senha opcional)
      if (seg.length === 2 && req.method === 'PUT') {
        const body = await readBody(req);
        emp.empresa = {
          ...emp.empresa,
          nome: String(body.nome || (body.empresa && body.empresa.nome) || emp.empresa.nome),
          cnpj: String(body.cnpj ?? (body.empresa && body.empresa.cnpj) ?? emp.empresa.cnpj),
          segmento: String(body.segmento ?? (body.empresa && body.empresa.segmento) ?? emp.empresa.segmento),
          logo_url: String(body.logo_url ?? (body.empresa && body.empresa.logo_url) ?? emp.empresa.logo_url),
        };
        if (body.status !== undefined) emp.status = Number(body.status) ? 1 : 0;
        if (body.senha && String(body.senha).length >= 6) emp.senha = hashSenha(String(body.senha));
        await writeTenants(db);
        sendJson(res, 200, { status: 1, empresa: await resumoEmpresa(emp, cfg) });
        return;
      }

      // POST /empresas/:id/recargas → adiciona crédito
      if (seg.length === 3 && seg[2] === 'recargas' && req.method === 'POST') {
        const body = await readBody(req);
        const valor = toMoney(body.valor);
        if (!(valor > 0)) return sendJson(res, 400, { status: 0, message: 'Informe um valor de recarga maior que zero.' });
        const ledger = await readLedger(emp.id);
        if (!Array.isArray(ledger.recargas)) ledger.recargas = [];
        const recarga = {
          id: `REC-${Date.now()}`,
          data: String(body.data || hojeISO()),
          valor,
          descricao: String(body.descricao || 'Recarga de créditos'),
          lancadoPor: sess.login,
        };
        ledger.recargas.push(recarga);
        await writeLedger(emp.id, ledger);
        sendJson(res, 201, { status: 1, recarga, saldo: (await resumoEmpresa(emp, cfg)).saldo });
        return;
      }

      // POST /empresas/:id/os → abre/cadastra uma OS
      if (seg.length === 3 && seg[2] === 'os' && req.method === 'POST') {
        const body = await readBody(req);
        const titulo = String(body.titulo || '').trim();
        if (!titulo) return sendJson(res, 400, { status: 0, message: 'Informe o título da OS.' });
        const ledger = await readLedger(emp.id);
        if (!Array.isArray(ledger.ordens_de_servico)) ledger.ordens_de_servico = [];
        const previsto = toMoney(body.previsto ?? (body.creditos && body.creditos.previsto));
        const realizado = toMoney(body.realizado ?? (body.creditos && body.creditos.realizado));
        const os = {
          id: String(body.id || novaOsId(ledger)),
          titulo,
          status: String(body.status || 'aberta'),
          prioridade: String(body.prioridade || 'media'),
          tipo: String(body.tipo || 'corretiva'),
          categoria: String(body.categoria || ''),
          data_abertura: String(body.data_abertura || hojeISO()),
          data_conclusao: body.data_conclusao || null,
          creditos: {
            previsto,
            realizado,
            status_credito: String(body.status_credito || (realizado > 0 ? 'finalizado' : 'reservado')),
          },
          local: String(body.local || ''),
          equipamento: body.equipamento || {},
          solicitante: body.solicitante || {},
          sla: body.sla || {},
          equipe: body.equipe || {},
          apontamentos: Array.isArray(body.apontamentos) ? body.apontamentos : [],
          descricao: String(body.descricao || ''),
          diagnostico: String(body.diagnostico || ''),
          servico_executado: Array.isArray(body.servico_executado) ? body.servico_executado : [],
          materiais: Array.isArray(body.materiais) ? body.materiais : [],
          checklist: Array.isArray(body.checklist) ? body.checklist : [],
          observacoes: String(body.observacoes || ''),
          timeline: Array.isArray(body.timeline) ? body.timeline : [],
          fotos: Array.isArray(body.fotos) ? body.fotos : [],
          conclusao: body.conclusao || null,
          criadoEm: new Date().toISOString(),
        };
        ledger.ordens_de_servico.push(os);
        await writeLedger(emp.id, ledger);
        sendJson(res, 201, { status: 1, os, saldo: (await resumoEmpresa(emp, cfg)).saldo });
        return;
      }

      // PUT /empresas/:id/os/:osId → edita a OS (merge)
      if (seg.length === 4 && seg[2] === 'os' && req.method === 'PUT') {
        const body = await readBody(req);
        const ledger = await readLedger(emp.id);
        const i = (ledger.ordens_de_servico || []).findIndex(o => String(o.id) === String(seg[3]));
        if (i < 0) return sendJson(res, 404, { status: 0, message: 'OS não encontrada.' });
        const atual = ledger.ordens_de_servico[i];
        const merged = { ...atual, ...body, id: atual.id };
        if (body.creditos) merged.creditos = { ...atual.creditos, ...body.creditos };
        ledger.ordens_de_servico[i] = merged;
        await writeLedger(emp.id, ledger);
        sendJson(res, 200, { status: 1, os: merged, saldo: (await resumoEmpresa(emp, cfg)).saldo });
        return;
      }

      // DELETE /empresas/:id/os/:osId → remove a OS
      if (seg.length === 4 && seg[2] === 'os' && req.method === 'DELETE') {
        const ledger = await readLedger(emp.id);
        const antes = (ledger.ordens_de_servico || []).length;
        ledger.ordens_de_servico = (ledger.ordens_de_servico || []).filter(o => String(o.id) !== String(seg[3]));
        if (ledger.ordens_de_servico.length === antes) return sendJson(res, 404, { status: 0, message: 'OS não encontrada.' });
        await writeLedger(emp.id, ledger);
        sendJson(res, 200, { status: 1, saldo: (await resumoEmpresa(emp, cfg)).saldo });
        return;
      }
    }

    sendJson(res, 404, { status: 0, message: 'Endpoint admin não encontrado.' });
  } catch (err) {
    sendJson(res, 400, { status: 0, message: err.message || 'Erro na operação.' });
  }
}

module.exports = { handleAdminApi, sessions };
