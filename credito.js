/* ═══════════════════════════════════════════════════════════════════
   EXPERT WORK — Cálculos derivados do crédito
   O dashboard que a empresa vê NÃO é armazenado: é calculado aqui a partir
   do ledger (recargas + ordens_de_servico). Espelha a ideia do IndustriAlly,
   onde a comissão é derivada do estágio do lead — nunca um campo manual que
   pode divergir. É a exigência do cliente: "os cálculos precisam bater".

   Regra do saldo:
     depositado  = Σ recargas.valor
     utilizado   = Σ creditos.realizado das OS concluídas
     reservado   = Σ creditos.previsto das OS abertas/em andamento
     bruto       = depositado − utilizado
     disponível  = bruto − reservado
═══════════════════════════════════════════════════════════════════ */

// OS que "seguram" crédito (previsto) mas ainda não consumiram.
const RESERVA_STATUS = ['aberta', 'em_andamento'];

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function ultimaRecarga(recargas) {
  if (!Array.isArray(recargas) || !recargas.length) return { data: null, valor: 0 };
  const ord = recargas.slice().sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
  return { data: ord[0].data || null, valor: n(ord[0].valor) };
}

function creditosDerivados(ledger, cfg) {
  const recargas = Array.isArray(ledger.recargas) ? ledger.recargas : [];
  const oss = Array.isArray(ledger.ordens_de_servico) ? ledger.ordens_de_servico : [];
  const reservaStatus = (cfg && Array.isArray(cfg.reservaStatuses)) ? cfg.reservaStatuses : RESERVA_STATUS;

  const total_depositado = recargas.reduce((s, r) => s + n(r.valor), 0);

  const total_utilizado = oss
    .filter(o => o.status === 'concluida')
    .reduce((s, o) => s + n(o.creditos && o.creditos.realizado), 0);

  const saldo_reservado = oss
    .filter(o => reservaStatus.includes(o.status))
    .reduce((s, o) => s + n(o.creditos && o.creditos.previsto), 0);

  const saldo_bruto_atual = total_depositado - total_utilizado;
  const total_disponivel = saldo_bruto_atual - saldo_reservado;

  return {
    total_depositado,
    total_utilizado,
    total_previsto: saldo_reservado,
    saldo_bruto_atual,
    saldo_reservado,
    total_disponivel,
    moeda: (cfg && cfg.moeda) || 'BRL',
    ultima_recarga: ultimaRecarga(recargas),
  };
}

function resumoOS(oss) {
  const por_status = { solicitada: 0, aberta: 0, em_andamento: 0, concluida: 0, cancelada: 0 };
  const por_prioridade = { alta: 0, media: 0, baixa: 0 };
  let horas_realizadas_total = 0;

  for (const o of oss) {
    if (por_status[o.status] === undefined) por_status[o.status] = 0;
    por_status[o.status]++;

    const p = String(o.prioridade || '').toLowerCase();
    if (por_prioridade[p] !== undefined) por_prioridade[p]++;

    const h = n(o.equipe && o.equipe.horas_realizadas) || n(o.conclusao && o.conclusao.horas_realizadas);
    horas_realizadas_total += h;
  }

  return { total: oss.length, por_status, por_prioridade, horas_realizadas_total };
}

const ROTULO_TIPO = {
  corretiva: 'Corretiva', preventiva: 'Preventiva', preditiva: 'Preditiva',
  melhoria: 'Melhoria', novo_projeto: 'Novo projeto', instalacao: 'Instalação',
};
function rotuloTipo(t) {
  const k = String(t || '').toLowerCase();
  return ROTULO_TIPO[k] || (t ? String(t) : 'Outros');
}

// Agrupa OS concluídas por `chave(o)`, somando o crédito realizado.
function agrupaConsumo(oss, chave) {
  const mapa = new Map();
  let total = 0;
  for (const o of oss) {
    if (o.status !== 'concluida') continue;
    const val = n(o.creditos && o.creditos.realizado);
    const k = chave(o) || 'Outros';
    const cur = mapa.get(k) || { tipo: k, valor_consumido: 0, quantidade_os: 0, percentual: 0 };
    cur.valor_consumido += val;
    cur.quantidade_os++;
    mapa.set(k, cur);
    total += val;
  }
  const arr = [...mapa.values()].sort((a, b) => b.valor_consumido - a.valor_consumido);
  if (total > 0 && arr.length) {
    let acc = 0;
    for (const it of arr) {
      it.percentual = Math.round((it.valor_consumido / total) * 1000) / 10;
      acc += it.percentual;
    }
    // Corrige o resíduo de arredondamento no maior item → a legenda soma sempre 100,0%.
    arr[0].percentual = Math.round((arr[0].percentual + (100 - acc)) * 10) / 10;
  } else {
    for (const it of arr) it.percentual = 0;
  }
  return arr;
}

function graficos(oss) {
  return {
    consumo_por_servico: agrupaConsumo(oss, o => o.categoria || (o.equipe && o.equipe.area) || 'Outros'),
    consumo_por_tipo_os: agrupaConsumo(oss, o => rotuloTipo(o.tipo)),
  };
}

function agendamentosProximos(oss, limite = 5) {
  return oss
    .filter(o => ['solicitada', 'aberta', 'em_andamento'].includes(o.status))
    .sort((a, b) => String(a.data_abertura || '').localeCompare(String(b.data_abertura || '')))
    .slice(0, limite)
    .map(o => ({ os_id: o.id }));
}

function periodoReferencia(oss) {
  const aberturas = oss.map(o => o.data_abertura).filter(Boolean).sort();
  const todas = oss.flatMap(o => [o.data_abertura, o.data_conclusao]).filter(Boolean).sort();
  return {
    inicio: aberturas[0] || null,
    fim: todas.length ? todas[todas.length - 1] : null,
  };
}

/* Monta o objeto `dashboard` exatamente no formato que o front do cliente
   (index.html) já consome — só que com os números derivados do ledger. */
function montarDashboard(empresa, ledger, cfg) {
  const oss = Array.isArray(ledger.ordens_de_servico) ? ledger.ordens_de_servico : [];
  return {
    empresa,
    creditos: creditosDerivados(ledger, cfg),
    resumo_os: resumoOS(oss),
    graficos: graficos(oss),
    agendamentos_proximos: agendamentosProximos(oss),
    ordens_de_servico: oss,
    metadata: {
      periodo_referencia: periodoReferencia(oss),
      gerado_em: new Date().toISOString(),
      versao_api: (cfg && cfg.versaoApi) || '1.0',
    },
  };
}

module.exports = {
  montarDashboard,
  creditosDerivados,
  resumoOS,
  graficos,
  RESERVA_STATUS,
};
