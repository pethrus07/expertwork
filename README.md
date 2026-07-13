# Expert Work · Portal de Créditos (Celiware)

![status](https://img.shields.io/badge/status-MVP%20funcional-6FCF97)
![runtime](https://img.shields.io/badge/runtime-Node.js%20puro-339933)
![front](https://img.shields.io/badge/front-SPA%20sem%20framework-F7DF1E)
![deps](https://img.shields.io/badge/depend%C3%AAncias-0-brightgreen)
![dados](https://img.shields.io/badge/dados-arquivos%20JSON-lightgrey)

> Plataforma multi-tenant onde cada **empresa cliente** acompanha, em tempo real, o saldo de créditos que contratou com a Celiware e todas as **Ordens de Serviço (OS)** executadas para ela; e um **painel admin** onde a Celiware lança recargas, abre/edita OS e administra tudo. Roda em **Node puro**, sem framework e **sem nenhuma dependência**. Mesma arquitetura do IndustriAlly.

---

## 1. Visão Geral e a Dor

Este projeto **nasceu como uma demonstração estática** — um `portal-creditos` de página única, servido pelo Apache, para mostrar ao cliente como ficaria um portal de acompanhamento. Nessa fase, o protótipo tinha três problemas que impediam virar produção:

- O login era conferido **no navegador** (`if (t.senha === p)`);
- Um único **`tenants.json` público** carregava **todos os clientes com as senhas em texto puro** — qualquer pessoa abria `dominio/tenants.json` e via os dados e as senhas de todos;
- Saldo, resumo e gráficos eram **escritos à mão** no JSON e podiam divergir da realidade.

**O Expert Work é a virada desse protótipo em sistema de verdade.** A mesma interface (que já estava boa) ganhou um **servidor Node** por trás: login server-side com token e senha em `scrypt`, cada empresa recebendo **apenas o próprio dado**, os números **calculados no servidor** e um **painel administrativo** para a Celiware operar. O que era uma tela bonita virou um produto multi-tenant seguro.

**Quem usa, e para quê?**
As **empresas** acessam para ver quanto têm, onde e como o crédito foi gasto, e o detalhe de cada OS (equipe, apontamentos, timeline, fotos). A **Celiware** acessa o painel admin para cadastrar recargas, abrir/editar OS de qualquer empresa e digitar a timeline — é por ali que todo o dado nasce.

**Também inclui:** exportação de OS e de **relatório consolidado em PDF**, **exportação CSV**, gráficos de consumo, **alertas de saldo baixo** para a Celiware, **notificações** ao cliente (mudança de status de OS e saldo baixo) e **sessões persistentes** — reiniciar o servidor não desloga ninguém, e o navegador reloga sozinho.

---

## 2. Arquitetura e Decisões Técnicas

| Camada | Escolha | Por quê | Alternativa | Impacto |
|---|---|---|---|---|
| **Runtime** | Node.js puro (módulo `http`) | Mesma stack do IndustriAlly; deploy leve, sem build | Express/Fastify | Zero dependências |
| **Contas** | `tenants.json` (login + senha **scrypt** + cadastro) | Separar credencial de dado operacional | Banco | Simples; migração futura isolada |
| **Núcleo** | `dados/<empresa>.json` — **um ledger por empresa** | OS são registros pesados; isola clientes fisicamente | 1 arquivo único | Arquivos pequenos, isolamento real |
| **Dashboard** | **Derivado** do ledger em runtime (`credito.js`) | O número não pode divergir da soma real | Campos manuais | Saldo sempre correto |
| **Auth** | Token opaco em sessão de memória; senha `scrypt` | Suficiente para o porte; hash nativo do `crypto` | JWT/OAuth | Menos superfície |
| **Multi-tenant** | Isolamento **server-side** por empresa | O front nunca escolhe o que vê | Filtro no front | Isolamento real |
| **Fotos** | Servidas atrás de cookie de sessão + checagem de dono | `<img>` não manda header, mas manda cookie | URL pública | Anexo do cliente protegido |

**Rotas (um só servidor):**

```
/        → Portal do cliente (login + dashboard de créditos e OS) · só leitura
/admin   → Painel do admin geral (Celiware) · cadastra e administra tudo
```

---

## 3. Destaque de Engenharia / "The Hard Part"

**O painel de créditos é derivado, não digitado.** A exigência do cliente foi clara: *"os cálculos precisam bater"*. Em vez de guardar `saldo_disponivel` como um campo (que envelhece e diverge), o Expert Work guarda só o **ledger** — recargas e OS — e **calcula o resto no servidor a cada request**:

```js
depositado = Σ recargas.valor
utilizado  = Σ creditos.realizado das OS concluídas
reservado  = Σ creditos.previsto das OS abertas/em andamento
disponível = depositado − utilizado − reservado
```

Quando a Celiware abre uma OS no admin, o crédito é **reservado**; quando conclui, vira **realizado**; e o saldo, o resumo por status e os gráficos de consumo da empresa **se atualizam sozinhos, sem nenhum job de sincronização**. É o mesmo princípio do IndustriAlly, onde a comissão do parceiro é derivada do estágio do lead — aqui, aplicado ao crédito.

O **segundo "hard part" foi a virada do protótipo**: trocar o login-no-navegador por **isolamento server-side** sem reescrever a interface. Hoje o `tenants.json` nunca sai do servidor, cada resposta é filtrada pela sessão, e até as **fotos** das OS só abrem para a empresa dona (o navegador manda um cookie de sessão que o servidor valida contra o ledger daquele cliente).

---

## 4. Estrutura

```
server.js     Servidor Node: roteamento, estáticos, guarda de arquivos e fotos
portal.js     API do cliente (/api/login, /api/portal, /api/portal/os/:id)
admin.js      API do admin  (/api/admin/*  — login + CRUD cross-tenant)
credito.js    Cálculos derivados do crédito (o "coração")
store.js      Lib compartilhada (JSON, senha scrypt, helpers HTTP)
index.html    Portal do cliente (SPA de um arquivo)
admin.html    Painel do admin geral (Celiware)
seed.js       Dados FICTÍCIOS de demonstração (npm run seed)
migrar.js     Importa o portal-creditos antigo para a nova estrutura
config.json   Moeda e parâmetros
```

Os dados (`tenants.json`, `dados/`, `fotos/`) ficam **fora do git** (ver `.gitignore`).

---

## 5. Como rodar (local)

Requer **Node 18+**. Sem `npm install` (zero dependências).

```bash
npm run seed     # dados fictícios de demonstração
# ou
npm run migrar   # importa os dados do portal-creditos antigo

npm start        # http://localhost:3000
```

- Portal do cliente: `http://localhost:3000/`
- Painel admin: `http://localhost:3000/admin`

**Credenciais demo:**

| Onde | Login | Senha |
|---|---|---|
| Admin (Celiware) | `valdir` ou `admin` | `admin1234` |
| Cliente (após `npm run seed`) | `metalcore` / `bevertech` | `demo123` |

> Em produção, defina as senhas de admin por variável de ambiente (`ADMIN_PASS_VALDIR`, `ADMIN_PASS_ADMIN`) e troque as senhas demo.

---

## 6. API

Autenticação por header `Authorization: Bearer <token>` (obtido no login).

| Rota | Método | Acesso | Faz |
|---|---|---|---|
| `/api/login` | POST | público | Login do cliente (empresa) |
| `/api/portal` | GET | cliente | Dashboard derivado do próprio tenant |
| `/api/portal/os/:id` | GET | cliente | Detalhe de uma OS do próprio tenant |
| `/api/admin/login` | POST | público | Login do admin |
| `/api/admin/empresas` | GET/POST | admin | Lista (com saldo) / cria empresa |
| `/api/admin/empresas/:id` | GET/PUT | admin | Ledger cru / edita cadastro |
| `/api/admin/empresas/:id/recargas` | POST | admin | Adiciona crédito |
| `/api/admin/empresas/:id/os` | POST | admin | Abre/cadastra OS |
| `/api/admin/empresas/:id/os/:osId` | PUT/DELETE | admin | Edita / exclui OS |
| `/api/admin/relatorio` | GET | admin | Relatório consolidado (KPIs, consumo, ranking, alertas) |

---

## 7. Deploy

Host que rode **Node 18+ como processo** com **disco gravável e persistente** (os JSON são escritos em runtime):

- **cPanel / Hostinger (Setup Node.js App):** startup file `server.js`, garantir escrita na pasta. Migra bem do `public_html` estático anterior.
- **VPS (Ubuntu):** `pm2 start server.js` + Nginx (reverse proxy) + Certbot (HTTPS).
- **PaaS (Railway/Render):** `node server.js` + **volume persistente** na pasta dos JSON.

---

## 8. Segurança & LGPD

- `tenants.json`, `dados/` e `fotos/` guardam **dados de clientes** (nome, CNPJ, contatos, fotos de OS) → ficam **fora do git**.
- Senhas em **scrypt** (nunca em texto puro) — corrige de vez o modelo do protótipo, em que o `tenants.json` público expunha tudo.
- Isolamento **server-side**: cada resposta é filtrada pela sessão; o front nunca escolhe o que aparece. As fotos exigem cookie de sessão e pertencer à empresa.

---

## 9. Roadmap (v2)

- Logo próprio da Expert Work (hoje usa o wordmark tipográfico).
- Fotos das OS são embutidas como data URI (redimensionadas no navegador) — migrar para armazenamento de objetos (disco/S3/R2) quando o volume crescer.
- Notificações por e-mail/WhatsApp (hoje o aviso é um sino dentro do portal).
- Migração opcional dos JSON para um banco (SQLite/D1) mantendo a mesma API.

---

<sub>Desenvolvido para a Celiware. Baseado na arquitetura do IndustriAlly (pethrus07/industrially).</sub>
