# ISP Analytics BI

Plataforma de Business Intelligence para Provedores de Internet brasileiros (ISPs). Integrada com IXC Soft, HubSoft, SGP e MK-Auth, centraliza métricas operacionais e financeiras em um painel único com sincronização automática.

**Produto Libernet** | Slug: `ISP` | Prefixo de chave: `BI-`

## Stack

- **Backend**: Node.js 20+ / Express 4 / ES Modules
- **Banco**: MongoDB 4.4 (compatível sem AVX)
- **Frontend**: React 18 / Vite 5 / Tailwind CSS
- **Infra**: Docker + Docker Compose
- **Auth**: JWT + bcryptjs
- **Scheduler**: node-cron
- **Logs**: Winston

## Quick Install

```bash
curl -fsSL https://saas.libernet.com.br/instalador/ispbi/install.sh -o ispbi.sh && bash ispbi.sh
```

### Requisitos

- Node.js 18+ (recomendado 20 LTS)
- Docker Engine 24+ e Docker Compose v2
- Ubuntu 20.04+ ou Debian 11+
- Mínimo 1GB RAM, 10GB disco

### Setup Manual

1. Clone o repositório
   ```bash
   git clone https://github.com/libernet/bi-isp.git
   cd bi-isp
   ```

2. Configure o ambiente
   ```bash
   cp backend/.env.example backend/.env
   nano backend/.env
   ```

3. Inicie os serviços
   ```bash
   ./manage.sh start
   ```

4. Inicialize o banco
   ```bash
   ./manage.sh bootstrap
   ```

5. Acesse: http://localhost:3001

## Variáveis de Ambiente

```bash
# MongoDB
MONGO_URI=mongodb://mongo:27017/isp_analytics

# API
API_PORT=3001
JWT_SECRET=<hex 64 chars gerado automaticamente>
NODE_ENV=production

# Licença Libernet
LICENSE_KEY=BI-XXXX-XXXX-XXXX-XXXX

# Admin (bootstrap)
ADMIN_EMAIL=admin@ispbi.local
ADMIN_PASS=admin123

# IXC Soft (por provedor)
IXC_MEUISP_URL=https://meuisp.ixcsoft.com.br
IXC_MEUISP_TOKEN=<token>

# HubSoft (por provedor)
HUBSOFT_MEUISP_URL=https://api.meuisp.hubsoft.com.br
HUBSOFT_MEUISP_CLIENT_ID=46
HUBSOFT_MEUISP_CLIENT_SECRET=<secret>
HUBSOFT_MEUISP_USERNAME=api@meuisp.com.br
HUBSOFT_MEUISP_PASSWORD="<senha>"

# SGP (por provedor)
SGP_MEUISP_URL=https://sgp.meuisp.com.br
SGP_MEUISP_TOKEN=<token>
SGP_MEUISP_APP=<app>

# MK-Auth (por provedor)
MKAUTH_MEUISP_URL=http://mkauth.local
MKAUTH_MEUISP_TOKEN=<token>
```

## API Endpoints

| Método | Endpoint | Auth | Descrição |
|--------|----------|------|-----------|
| POST | `/api/auth/login` | — | Login, retorna JWT |
| GET | `/api/auth/me` | JWT | Dados do usuário |
| GET | `/api/license/status` | — | Status da licença |
| POST | `/api/license/revalidate` | JWT admin | Força revalidação |
| GET | `/api/metrics/:providerId` | JWT | KPIs do provedor |
| GET | `/api/providers` | JWT | Lista provedores |
| POST | `/api/sync/:providerId` | JWT admin | Força sincronização |
| GET | `/api/sync/:providerId/status` | JWT | Status do sync |
| GET | `/health` | — | Health check |

## Conectores ERP

| ERP | Autenticação | Observação |
|-----|-------------|------------|
| IXC Soft | Basic Auth (base64) | Header `ixcsoft: listar` |
| HubSoft | OAuth2 password grant | `application/x-www-form-urlencoded` |
| SGP | Token + App no body | Token e App obrigatórios |
| MK-Auth | Token no header | Versão mínima 24.05 |

## Gestão

```bash
./manage.sh start              # inicia os serviços
./manage.sh stop               # para os serviços
./manage.sh restart            # reinicia a API
./manage.sh logs               # logs em tempo real
./manage.sh status             # status dos containers
./manage.sh sync hubsoft       # sync manual de um ERP
./manage.sh validate hubsoft   # testa credenciais
./manage.sh bootstrap          # recria admin + re-sync
./manage.sh update             # atualiza o sistema
./manage.sh backup             # backup do MongoDB
```

## Licenças Libernet

```
POST https://ispacs.libernet.com.br/api/license/validate
{ "license_key": "BI-XXXX-XXXX-XXXX-XXXX", "product": "ISP", "hostname": "<servidor>" }
```

| Status | Comportamento |
|--------|--------------|
| `active` | Acesso total |
| `expired` | Somente leitura + banner âmbar |
| `blocked` | Acesso bloqueado + banner vermelho |
| `unknown` | Somente leitura + banner âmbar |

Cache local de 24h. Grace period de 72h sem servidor.

## Troubleshooting

| Problema | Solução |
|---------|---------|
| MongoDB não conecta | CPU sem AVX: usar `mongo:4.4` |
| 401 HubSoft | Senha com `#`: colocar entre aspas duplas no `.env` |
| "Cannot GET /" | Copiar `frontend/dist/` para `backend/frontend-dist/` |
| "Failed to fetch" | `VITE_API_URL` deve ser vazia no `.env` do frontend |
| Licença 403 | Verificar LICENSE_KEY e conectividade com ispacs.libernet.com.br |
| `curl \| bash` sem input | Salvar o script e executar: `bash ispbi.sh` |

## Estrutura

```
bi-isp/
├── backend/
│   ├── src/
│   │   ├── api/           → auth.js, routes.js
│   │   ├── analytics/     → engine.js (KPIs, churn, snapshots)
│   │   ├── connectors/    → ixc/, hubsoft/, sgp/, mkauth/
│   │   ├── license/       → index.js, middleware.js, routes.js
│   │   ├── models/        → Provider, Customer, Invoice, ServiceOrder
│   │   ├── scheduler/     → cron jobs
│   │   ├── utils/         → logger
│   │   └── index.js       → entry point
│   ├── scripts/
│   │   └── bootstrap.js
│   ├── Dockerfile
│   └── docker-compose.yml
├── frontend/
│   ├── src/
│   │   ├── components/    → LicenseBanner
│   │   ├── context/       → AuthContext
│   │   ├── pages/         → Dashboard, Login
│   │   └── services/      → api.js
│   ├── index.html
│   └── vite.config.js
├── manage.sh
└── ispbi-install.sh
```

## Licenciamento

Produto comercial Libernet. Licenciado por número de clientes no ERP.

- **BI ISP Starter**: Até 1.000 clientes
- **BI ISP Pro**: Até 10.000 clientes
- **BI ISP Enterprise**: Ilimitado

## Suporte

- Email: suporte@libernet.com.br
- Docs: https://docs.libernet.com.br/bi-isp

---

*ISP Analytics BI v1.0 — Plataforma Libernet*
