# SaaS Ads Metrics — Facebook Ads Dashboard

> **Nota:** a pasta [`faculdade/`](faculdade/) é um projeto **separado e independente**
> (site pessoal de estudos), com `package.json`, banco e deploy próprios. Ela não faz
> parte deste dashboard e não é usada por ele — veja o [README dela](faculdade/README.md).

Dashboard de Métricas de Tráfego focado em Facebook Ads, construído com Next.js 15, Supabase e Meta Marketing API.

## Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 15 (App Router) |
| Linguagem | TypeScript |
| Estilização | Tailwind CSS + shadcn/ui |
| Gráficos | Recharts |
| Banco de Dados | Supabase (PostgreSQL) |
| API | Meta Marketing API (Graph API v19.0+) |

## Estrutura do Projeto

```
saas-ads-metrics/
├── schema.sql                          # Schema do Supabase (rode no SQL Editor)
├── .env.local                          # Variáveis de ambiente (NÃO commitar)
└── src/
    ├── app/
    │   ├── api/
    │   │   ├── sync/route.ts           # POST /api/sync — dispara sincronização
    │   │   └── insights/route.ts       # GET /api/insights — consulta dados
    │   └── page.tsx                    # Dashboard principal
    ├── lib/
    │   ├── meta-api.ts                 # Serviço de extração e sync com Meta API
    │   ├── utils.ts                    # Utilitários gerais
    │   └── supabase/
    │       ├── server.ts               # Cliente Supabase (service_role - server only)
    │       └── client.ts               # Cliente Supabase (anon - client side)
    └── types/
        └── meta.ts                     # Tipos TypeScript para Meta API + DB
```

## Configuração Inicial

### 1. Supabase

1. Crie um projeto em [supabase.com](https://supabase.com)
2. No SQL Editor do painel, rode o arquivo `schema.sql`
3. Em **Project Settings → API**, copie:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

### 2. Variáveis de Ambiente

Edite o arquivo `.env.local` na raiz do projeto:

```bash
# Facebook
FACEBOOK_ACCESS_TOKEN=seu_token_aqui
FACEBOOK_AD_ACCOUNT_ID=seu_account_id_aqui

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJh...
SUPABASE_SERVICE_ROLE_KEY=eyJh...

# Opcional: protege o endpoint /api/sync
SYNC_SECRET=um_segredo_forte_aqui
```

### 3. Rodar o projeto

```bash
npm run dev
```

## Como Usar a API de Sincronização

### Sincronizar métricas diárias por campanha (sem breakdown)

```bash
curl -X POST http://localhost:3000/api/sync \
  -H "Content-Type: application/json" \
  -d '{"dateStart":"2024-01-01","dateStop":"2024-01-31","level":"campaign"}'
```

### Sincronizar com breakdown por idade

```bash
curl -X POST http://localhost:3000/api/sync \
  -H "Content-Type: application/json" \
  -d '{"dateStart":"2024-01-01","dateStop":"2024-01-31","level":"campaign","breakdown":"age"}'
```

### Consultar dados sincronizados

```bash
curl "http://localhost:3000/api/insights?dateStart=2024-01-01&dateStop=2024-01-31&level=campaign"
```

## Métricas Disponíveis

| Métrica | Coluna | Descrição |
|---------|--------|-----------|
| Impressões | `impressions` | Total de vezes que o anúncio foi exibido |
| Cliques | `clicks` | Total de cliques |
| CTR | `ctr` | Click-Through Rate (%) |
| CPM | `cpm` | Custo por Mil Impressões |
| CPC | `cpc` | Custo por Clique |
| Gasto | `spend` | Valor total gasto |
| Conversões | `actions` | Array JSON de ações (JSON) |
| ROAS | `roas` | Return on Ad Spend |
| Frequência | `frequency` | Média de vezes que cada pessoa viu o anúncio |
| Alcance | `reach` | Pessoas únicas alcançadas |

## Breakdowns Suportados

- `age` — Faixa etária
- `gender` — Gênero
- `publisher_platform` — Plataforma (Facebook, Instagram, Audience Network)
- `platform_position` — Posicionamento
- `impression_device` — Dispositivo

## Comandos Úteis

```bash
npm run dev        # Desenvolvimento
npm run build      # Build de produção
npm run lint       # Lint do código
```

## Como Fazer o Deploy no Vercel

### 1. Criar o Repositório no GitHub
Como o Git local já está inicializado e configurado com a branch `main` e a origem `sc4uthwith4`, basta seguir estes passos:
1. Vá até o seu GitHub e crie um novo repositório chamado `saas-ads-metrics`.
2. Após criar, execute o seguinte comando no terminal do seu computador para enviar o código:
   ```bash
   git push -u origin main
   ```

### 2. Importar no Vercel
1. Vá para o painel do [Vercel](https://vercel.com) e clique em **Add New... → Project**.
2. Conecte sua conta do GitHub e importe o repositório `saas-ads-metrics`.
3. Nas configurações do projeto (antes de clicar em Deploy), abra a seção **Environment Variables** (Variáveis de Ambiente) e adicione as seguintes chaves do seu arquivo `.env.local`:
   - `FACEBOOK_ACCESS_TOKEN`
   - `FACEBOOK_AD_ACCOUNT_ID`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SYNC_SECRET` (segredo opcional para proteger o endpoint de sincronização)
4. Clique em **Deploy**. A plataforma do Vercel fará a compilação e disponibilizará seu dashboard online em poucos segundos.
