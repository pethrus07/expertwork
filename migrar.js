/**
 * Migração — importa o tenants.json ANTIGO (portal de créditos estático) para
 * a nova estrutura do Expert Work:
 *   tenants.json         → contas (login + senha em scrypt + cadastro da empresa)
 *   dados/<empresa>.json → ledger (recargas + ordens_de_servico)
 *
 * Os totais (saldo, resumo, gráficos) NÃO são copiados: passam a ser derivados
 * do ledger em tempo de request. As recargas são sintetizadas para reproduzir o
 * total_depositado que existia no arquivo antigo.
 *
 *   node migrar.js ["caminho/para/tenants.json antigo"]
 */
const fs = require('fs');
const path = require('path');
const store = require('./store');

const OLD = process.argv[2] ||
  'C:/Users/olive/OneDrive/Área de Trabalho/Projetos/Celiware/portal-creditos/tenants.json';

function synthRecargas(creditos, periodo) {
  const c = creditos || {};
  const dep = Number(c.total_depositado) || 0;
  const ult = c.ultima_recarga || {};
  const ultVal = Number(ult.valor) || 0;
  const ultData = ult.data || (periodo && periodo.fim) || null;
  const iniData = (periodo && periodo.inicio) || '2026-01-01';
  const recs = [];
  if (dep > ultVal && ultVal > 0) {
    recs.push({ id: 'REC-mig-1', data: iniData, valor: dep - ultVal, descricao: 'Recarga inicial (migração)' });
    recs.push({ id: 'REC-mig-2', data: ultData || iniData, valor: ultVal, descricao: 'Recarga' });
  } else if (dep > 0) {
    recs.push({ id: 'REC-mig-1', data: ultData || iniData, valor: dep, descricao: 'Recarga inicial (migração)' });
  }
  return recs;
}

if (!fs.existsSync(OLD)) {
  console.error('Arquivo antigo não encontrado:', OLD);
  console.error('Passe o caminho: node migrar.js "caminho/tenants.json"');
  process.exit(1);
}

const raw = fs.readFileSync(OLD, 'utf8').replace(/^﻿/, '');
const old = JSON.parse(raw);

const empresas = [];
const ledgers = {};

for (const [key, t] of Object.entries(old)) {
  if (!t || typeof t !== 'object') continue;
  const dash = (t.dados && t.dados.dashboard) || {};
  const id = store.idSeguro(key);
  const empresa = dash.empresa || { id: `EMP-${id}`, nome: key, cnpj: '', segmento: '', logo_url: '' };

  empresas.push({
    id,
    login: String(key).toLowerCase(),
    senha: store.hashSenha(t.senha || 'trocar123'),
    empresa,
    status: 1,
    criadoEm: new Date().toISOString(),
  });

  ledgers[id] = {
    recargas: synthRecargas(dash.creditos, dash.metadata && dash.metadata.periodo_referencia),
    ordens_de_servico: Array.isArray(dash.ordens_de_servico) ? dash.ordens_de_servico : [],
  };
}

const ROOT = __dirname;
fs.writeFileSync(path.join(ROOT, 'tenants.json'), `${JSON.stringify({ empresas }, null, 2)}\n`);
fs.mkdirSync(path.join(ROOT, 'dados'), { recursive: true });
for (const [id, led] of Object.entries(ledgers)) {
  fs.writeFileSync(path.join(ROOT, 'dados', `${id}.json`), `${JSON.stringify(led, null, 2)}\n`);
}

console.log(`Migração concluída: ${empresas.length} empresa(s).`);
for (const e of empresas) {
  const n = ledgers[e.id].ordens_de_servico.length;
  console.log(`  · ${e.login}  (${n} OS)  → dados/${e.id}.json`);
}
console.log('Senhas migradas do arquivo antigo (em scrypt). Login = nome de usuário da empresa.');
