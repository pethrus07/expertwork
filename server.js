/* ═══════════════════════════════════════════════════════════════════
   EXPERT WORK — Servidor (Node puro, sem dependências)
   Mesma cartilha do IndustriAlly: um único processo serve as páginas como
   texto e expõe a API sob /api/*. Duas pontas sobre a mesma base:
     /        portal do cliente (empresa)  · só leitura
     /admin   painel do admin geral (Celiware) · cadastra tudo
═══════════════════════════════════════════════════════════════════ */
const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const { handlePortalApi, fotoAutorizada } = require('./portal');
const { handleAdminApi } = require('./admin');
const { sendJson, ROOT } = require('./store');

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = ROOT;

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

// Arquivos que NUNCA podem ser servidos como estáticos (dados + código).
const BLOQUEADOS = new Set([
  '/tenants.json', '/config.json',
  '/server.js', '/portal.js', '/admin.js', '/store.js', '/credito.js',
  '/seed.js', '/migrar.js', '/package.json',
]);

async function handleApi(req, res, pathname) {
  if (pathname.startsWith('/api/admin')) {
    await handleAdminApi(req, res, pathname);
    return;
  }
  if (pathname === '/api/health' && req.method === 'GET') {
    sendJson(res, 200, { ok: true });
    return;
  }
  // /api/login, /api/logout, /api/portal, /api/portal/os/:id
  await handlePortalApi(req, res, pathname);
}

async function serveStatic(req, res, pathname) {
  const routes = {
    '/': '/index.html',
    '/portal': '/index.html',
    '/admin': '/admin.html',
  };
  let requested = routes[pathname] || pathname;
  const decoded = decodeURIComponent(requested);

  if (BLOQUEADOS.has(decoded) || decoded.startsWith('/dados/')) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Arquivo não encontrado.');
    return;
  }

  // Fotos de OS: só para a empresa dona (checa cookie de sessão + ledger).
  if (decoded.startsWith('/fotos/')) {
    if (!(await fotoAutorizada(req, decoded))) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Arquivo não encontrado.');
      return;
    }
  }

  const filePath = path.normalize(path.join(ROOT_DIR, decoded));
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end('Acesso negado.');
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
    res.end(file);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Arquivo não encontrado.');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url.pathname);
      return;
    }
    await serveStatic(req, res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { erro: error.message || 'Erro interno.' });
  }
});

server.listen(PORT, () => {
  console.log(`Expert Work rodando em http://localhost:${PORT}`);
  console.log(`  Cliente: http://localhost:${PORT}/`);
  console.log(`  Admin:   http://localhost:${PORT}/admin`);
});
