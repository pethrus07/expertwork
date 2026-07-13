/* ═══════════════════════════════════════════════════════════════════
   EXPERT WORK — Biblioteca compartilhada (dados + senha + HTTP)
   Mesmo padrão do IndustriAlly: Node puro, arquivos JSON lidos/gravados
   por request. Contas em tenants.json; o ledger de cada empresa em
   dados/<id>.json (um arquivo por empresa → isolamento físico).
═══════════════════════════════════════════════════════════════════ */
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const TENANTS_FILE = path.join(ROOT, 'tenants.json');
const CONFIG_FILE = path.join(ROOT, 'config.json');
const DADOS_DIR = path.join(ROOT, 'dados');

/* ─────────────────────────── JSON store ─────────────────────────── */
async function readJson(file, fallback) {
  try {
    const data = await fs.readFile(file, 'utf8');
    return JSON.parse(data.replace(/^﻿/, ''));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJson(file, data) {
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function readConfig() {
  return readJson(CONFIG_FILE, { moeda: 'BRL', versaoApi: '1.0', reservaStatuses: ['aberta', 'em_andamento'] });
}

async function readTenants() {
  const db = await readJson(TENANTS_FILE, { empresas: [] });
  if (!Array.isArray(db.empresas)) throw new Error('tenants.json precisa conter uma lista "empresas".');
  return db;
}
async function writeTenants(db) {
  await writeJson(TENANTS_FILE, db);
}

function idSeguro(tenantId) {
  return String(tenantId).replace(/[^a-zA-Z0-9._-]/g, '_');
}
function ledgerPath(tenantId) {
  return path.join(DADOS_DIR, `${idSeguro(tenantId)}.json`);
}
async function readLedger(tenantId) {
  return readJson(ledgerPath(tenantId), { recargas: [], ordens_de_servico: [] });
}
async function writeLedger(tenantId, ledger) {
  await fs.mkdir(DADOS_DIR, { recursive: true });
  await writeJson(ledgerPath(tenantId), ledger);
}

/* ─────────────────────────── Senha (scrypt) ─────────────────────────── */
function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(senha), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
function verificarSenha(senha, armazenada) {
  const parts = String(armazenada || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return String(senha) === String(armazenada); // compat. com seed em texto puro
  }
  const [, salt, hash] = parts;
  const teste = crypto.scryptSync(String(senha), salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(teste, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ─────────────────────────── HTTP helpers ─────────────────────────── */
function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 20_000_000) { // OS podem carregar fotos (data URI) além de timeline/apontamentos
        req.destroy();
        reject(new Error('Payload muito grande.'));
      }
    });
    req.on('end', () => {
      if (!body) { resolve({}); return; }
      try { resolve(JSON.parse(body)); } catch { reject(new Error('JSON inválido.')); }
    });
  });
}

function getToken(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

module.exports = {
  ROOT, TENANTS_FILE, DADOS_DIR,
  readJson, writeJson, readConfig,
  readTenants, writeTenants, readLedger, writeLedger, ledgerPath, idSeguro,
  hashSenha, verificarSenha,
  sendJson, readBody, getToken,
};
