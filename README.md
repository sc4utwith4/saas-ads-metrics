# Ads Metrics

Plataforma SaaS para gestores de tráfego acompanharem e operarem contas de Facebook e Instagram Ads. Junta um dashboard de métricas da Meta, um portal de leitura para o cliente final e um assistente de IA que **analisa e executa ações reais** na conta de anúncios, sempre com confirmação do usuário.

**[Aplicação em produção →](https://saas-ads-metrics.vercel.app)** · acesso por login · [documento técnico (PDF)](Entrega-Ads-Metrics.pdf)

![Next.js](https://img.shields.io/badge/Next.js_16-000000?logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?logo=tailwindcss&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini_2.5-8E75B2?logo=googlegemini&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?logo=vercel&logoColor=white)

## Funcionalidades

- **Dashboard ao vivo** com gasto, impressões, cliques, CTR, CPM, CPC, conversões e ROAS, batendo com os números do Gerenciador de Anúncios
- **Multi-conta:** conecta várias contas de anúncio pela interface e troca a conta ativa sem redeploy
- **Dois perfis:** o administrador opera tudo; o cliente acessa um portal isolado, só de leitura, com os dados da própria conta
- **Assistente de IA com tool use:** 16 ferramentas sobre a Meta Marketing API. As de leitura rodam sozinhas; as de escrita (pausar, ativar, ajustar orçamento, criar campanha) passam por um card de confirmação, e campanhas novas nascem pausadas
- **IA multimodal:** analisa criativos (imagem), áudios e PDFs enviados no chat
- **Detecção de anomalias:** compara os últimos 7 dias com os 7 anteriores por campanha e classifica em crítico, atenção ou oportunidade
- **Relatório semanal automático** gerado pela IA toda segunda-feira via Vercel Cron
- **Sincronização** de métricas diárias e breakdowns (idade, gênero, plataforma, posicionamento, dispositivo) para o banco

## Arquitetura

```
                    ┌───────────────────────────── Next.js 16 (Vercel) ─────────────────────────────┐
  navegador ──────▶ │ proxy.ts  sessão Supabase + roteamento por papel (admin → app, cliente → portal)│
                    │                                                                               │
                    │ App Router (RSC)            Route Handlers /api                               │
                    │  ├─ (app)/  dashboard,       ├─ insights, insights/live, anomalies            │
                    │  │  campanhas, anúncios,     ├─ ai/chat ──▶ loop de tool use ──▶ ai/execute   │
                    │  │  assistente, relatórios   ├─ meta/connections (multi-conta)                │
                    │  └─ portal/  visão cliente   ├─ client/*  (escopo da conta do cliente)        │
                    │                              └─ cron/*    (CRON_SECRET)                       │
                    └──────────────┬──────────────────────────┬──────────────────────┬──────────────┘
                                   │                          │                      │
                          Supabase (Postgres + Auth)   Meta Marketing API      Gemini 2.5 Flash
                          RLS em todas as tabelas      Graph API               retry + fallback
```

**Decisões que valem destaque:**

- **Menor privilégio por padrão.** Só é admin quem tem `role = 'admin'` explícito no `app_metadata`; qualquer outro usuário logado é tratado como cliente. O roteamento por papel acontece no `proxy.ts`, antes de qualquer página.
- **Chaves só no servidor.** O cliente `service_role` do Supabase existe apenas em código de servidor. Tokens da Meta são guardados na tabela `meta_connections`, acessível só pelo backend, e mascarados na interface.
- **IA que age com freio.** O modelo nunca recebe permissão de escrita direta: ele propõe a ação, o frontend mostra o card e só `/api/ai/execute` executa depois do clique. O assistente do cliente é somente leitura e restrito à conta dele.
- **Headers de segurança** (CSP, HSTS, X-Frame-Options, Permissions-Policy) em `next.config.ts`, **rate limiting** nas rotas de IA e endpoints de cron que exigem segredo em produção.
- **Schema versionado** em `schema.sql` + `migrations/`, com RLS em todas as tabelas.

## Estrutura

```
src/
├── proxy.ts                 # sessão + autorização por papel
├── app/
│   ├── (app)/               # telas do admin e portal do cliente
│   ├── login/
│   └── api/                 # route handlers (insights, ai, meta, clients, cron, reports, sync)
├── components/              # UI (dashboard, portal, assistente, conexões, relatórios)
└── lib/
    ├── ai/                  # cliente Gemini, ferramentas, contexto, relatório semanal
    ├── meta/                # credenciais, ações de escrita, visão geral
    ├── meta-api.ts          # extração e sincronização de insights
    ├── insights/anomalies.ts
    ├── security/rateLimit.ts
    └── supabase/            # clientes server (service_role) e browser (anon)
migrations/                  # 002–005: conversas, relatórios, conexões, perfis
schema.sql                   # tabelas base: campanhas, conjuntos, anúncios, insights, logs
```

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # veja as variáveis abaixo
npm run dev
```

No SQL Editor do Supabase, rode `schema.sql` e depois os arquivos de `migrations/` em ordem.

| Variável | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cliente do navegador |
| `SUPABASE_SERVICE_ROLE_KEY` | operações de servidor (nunca exposta ao browser) |
| `GEMINI_API_KEY` | assistente e relatórios |
| `FACEBOOK_ACCESS_TOKEN` / `FACEBOOK_AD_ACCOUNT_ID` | conta padrão, se nenhuma conexão estiver ativa |
| `META_API_VERSION` | versão da Graph API (opcional) |
| `CRON_SECRET` | protege `/api/cron/*` |
| `SYNC_SECRET` | camada extra no `/api/sync` (opcional) |

## Roadmap

- Login com Facebook (OAuth) no lugar de colar o token
- Criação completa de anúncio (público + criativo)
- Rate limiting com store compartilhado (Redis) para escalar entre instâncias serverless
