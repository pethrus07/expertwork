/**
 * Seed de demonstração — cria tenants.json + dados/<empresa>.json com dados
 * FICTÍCIOS para rodar/avaliar o Expert Work localmente.
 *
 *   npm run seed   (ou: node seed.js)
 *
 * Esses arquivos ficam fora do git (.gitignore): em produção recebem dados
 * reais de empresas (LGPD). Para trazer os dados já existentes do portal
 * antigo, use `npm run migrar` em vez do seed.
 */
const fs = require('fs');
const path = require('path');
const store = require('./store');

const ROOT = __dirname;

function os(cfg) {
  const {
    id, titulo, status, prioridade, tipo, categoria, area,
    abertura, conclusao, previsto, realizado, equipamento, local, horas,
  } = cfg;
  return {
    id, titulo, status, prioridade, tipo, categoria,
    data_abertura: abertura,
    data_conclusao: conclusao || null,
    creditos: {
      previsto,
      realizado: realizado || 0,
      status_credito: status === 'concluida' ? 'finalizado' : 'reservado',
    },
    local: local || 'Planta principal',
    equipamento: { nome: equipamento, tag_patrimonio: 'EQ-' + id.slice(-4), fabricante: '—', modelo: '—', setor: local || '—' },
    solicitante: { nome: 'Responsável de Manutenção', cargo: 'Encarregado' },
    sla: { prioridade, prazo_atendimento: prioridade === 'alta' ? '24 horas' : '72 horas', data_conclusao_prevista: conclusao || abertura, cumprido: status === 'concluida' },
    equipe: {
      responsavel: 'Equipe Celiware', supervisor: 'Eng. Responsável', area,
      qtd_profissionais: 2, horas_previstas: horas, horas_realizadas: status === 'concluida' ? horas : 0,
      profissionais: [
        { nome: 'Técnico A', funcao: 'Técnico ' + area, matricula: 'TEC-' + id.slice(-3), especialidade: area, horas: Math.round(horas / 2), lider: true },
        { nome: 'Técnico B', funcao: 'Auxiliar', matricula: 'AUX-' + id.slice(-3), especialidade: area, horas: Math.round(horas / 2), lider: false },
      ],
    },
    apontamentos: [
      { data: abertura, atividade: 'Diagnóstico', itens: [{ nome: 'Técnico A', funcao: 'Técnico ' + area, horas: Math.round(horas / 2) }], horas_dia: Math.round(horas / 2) },
    ],
    descricao: `Atendimento de ${titulo.toLowerCase()} solicitado pela equipe da planta.`,
    diagnostico: 'Diagnóstico registrado em campo.',
    servico_executado: ['Inspeção', 'Execução do serviço', 'Teste final'],
    materiais: [{ item: 'Material de consumo', quantidade: 1, unidade: 'kit' }],
    checklist: [],
    observacoes: status === 'concluida' ? 'Serviço concluído sem pendências.' : 'Em andamento.',
    timeline: [
      { data: abertura, hora: '08:00', marco: 'abertura', titulo: 'OS aberta', descricao: `Ordem registrada com prioridade ${prioridade}.` },
      ...(status === 'concluida' ? [{ data: conclusao, hora: '17:00', marco: 'conclusao', titulo: 'Serviço concluído', descricao: `Crédito realizado: R$ ${realizado}.` }] : []),
    ],
    fotos: [],
    conclusao: status === 'concluida'
      ? { data: conclusao, status: 'concluida', texto: 'Serviço concluído.', sla_cumprido: true, horas_realizadas: horas, credito_realizado: realizado }
      : null,
  };
}

const empresas = [
  {
    id: 'demo-metalcore',
    login: 'metalcore',
    senha: store.hashSenha('demo123'),
    empresa: { id: 'EMP-DEMO-1', nome: 'MetalCore Indústria S.A.', cnpj: '11.222.333/0001-44', segmento: 'Metalurgia', logo_url: '' },
    status: 1,
    criadoEm: '2026-06-01T12:00:00.000Z',
  },
  {
    id: 'demo-bevertech',
    login: 'bevertech',
    senha: store.hashSenha('demo123'),
    empresa: { id: 'EMP-DEMO-2', nome: 'BeverTech Bebidas', cnpj: '55.666.777/0001-88', segmento: 'Bebidas', logo_url: '' },
    status: 1,
    criadoEm: '2026-06-05T12:00:00.000Z',
  },
];

const ledgers = {
  'demo-metalcore': {
    recargas: [
      { id: 'REC-1', data: '2026-05-02', valor: 40000, descricao: 'Recarga inicial' },
      { id: 'REC-2', data: '2026-06-20', valor: 20000, descricao: 'Recarga' },
    ],
    ordens_de_servico: [
      os({ id: 'OS-2026-001', titulo: 'Compressor de ar', status: 'concluida', prioridade: 'alta', tipo: 'corretiva', categoria: 'Mecânica', area: 'Mecânica', abertura: '2026-05-10', conclusao: '2026-05-12', previsto: 8000, realizado: 7400, equipamento: 'Compressor Atlas', local: 'Linha 2', horas: 32 }),
      os({ id: 'OS-2026-002', titulo: 'Painel elétrico', status: 'concluida', prioridade: 'media', tipo: 'preventiva', categoria: 'Elétrica', area: 'Elétrica', abertura: '2026-05-20', conclusao: '2026-05-21', previsto: 5000, realizado: 5000, equipamento: 'Painel CCM', local: 'Subestação', horas: 16 }),
      os({ id: 'OS-2026-003', titulo: 'Célula robotizada', status: 'em_andamento', prioridade: 'alta', tipo: 'novo_projeto', categoria: 'Software / Automação', area: 'Automação', abertura: '2026-06-25', previsto: 12000, equipamento: 'Robô de solda', local: 'Linha 4', horas: 60 }),
      os({ id: 'OS-2026-004', titulo: 'Inspeção pneumática', status: 'aberta', prioridade: 'baixa', tipo: 'preventiva', categoria: 'Pneumática', area: 'Pneumática', abertura: '2026-07-01', previsto: 3000, equipamento: 'Rede de ar', local: 'Planta', horas: 12 }),
    ],
  },
  'demo-bevertech': {
    recargas: [
      { id: 'REC-1', data: '2026-06-10', valor: 30000, descricao: 'Recarga inicial' },
    ],
    ordens_de_servico: [
      os({ id: 'OS-2026-001', titulo: 'Envasadora automática', status: 'concluida', prioridade: 'alta', tipo: 'corretiva', categoria: 'Mecânica', area: 'Mecânica', abertura: '2026-06-15', conclusao: '2026-06-18', previsto: 9000, realizado: 9200, equipamento: 'Envasadora L1', local: 'Linha 1', horas: 40 }),
      os({ id: 'OS-2026-002', titulo: 'Sensores de nível', status: 'em_andamento', prioridade: 'media', tipo: 'melhoria', categoria: 'Software / Automação', area: 'Automação', abertura: '2026-07-02', previsto: 6000, equipamento: 'CLP de linha', local: 'Linha 1', horas: 24 }),
    ],
  },
};

fs.writeFileSync(path.join(ROOT, 'tenants.json'), `${JSON.stringify({ empresas }, null, 2)}\n`);
fs.mkdirSync(path.join(ROOT, 'dados'), { recursive: true });
for (const [id, led] of Object.entries(ledgers)) {
  fs.writeFileSync(path.join(ROOT, 'dados', `${id}.json`), `${JSON.stringify(led, null, 2)}\n`);
}

console.log('Seed criado: 2 empresas demo.');
console.log('  Cliente:  metalcore / demo123   ·   bevertech / demo123');
console.log('  Admin:    valdir / admin1234     ·   admin / admin1234');
