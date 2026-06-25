// =============================================================================
// src/lib/ai/tools.ts
// Declarações de ferramentas (function calling) do Gemini + registro de execução.
//
// READ  → executadas automaticamente pela IA durante a conversa.
// WRITE → NUNCA executadas direto: viram "ação pendente" que o usuário confirma.
// =============================================================================

import {
  listCampaigns, findCampaignByName, getRealtimeInsights,
  pauseCampaign, activateCampaign, updateCampaignBudget, createCampaign,
  listAdSets, listAds, getAdDetails, getInsightsByLevel,
  setAdStatus, setAdSetStatus, updateAdSetBudget,
  VALID_OBJECTIVES, type MetaActionResult,
} from '@/lib/meta/actions';

// Schema no formato aceito pelo Gemini (subset OpenAPI, types em MAIÚSCULAS).
export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'OBJECT';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
}

export type ToolKind = 'read' | 'write';

export interface ToolDefinition {
  kind: ToolKind;
  declaration: GeminiFunctionDeclaration;
  /** executa a ação de fato (Meta API) */
  execute: (args: Record<string, unknown>) => Promise<MetaActionResult>;
  /** para ações de escrita: texto do card de confirmação */
  confirm?: (args: Record<string, unknown>) => { title: string; description: string; danger?: boolean };
}

const money = (n: unknown) => `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ---------------------------------------------------------------------------
// REGISTRO DE FERRAMENTAS
// ---------------------------------------------------------------------------
export const TOOLS: Record<string, ToolDefinition> = {
  // ---- LEITURA -----------------------------------------------------------
  list_campaigns: {
    kind: 'read',
    declaration: {
      name: 'list_campaigns',
      description: 'Lista as campanhas da conta de anúncios com status atual, objetivo e orçamento diário. Use para descobrir o ID de uma campanha ou ter um panorama da conta.',
      parameters: { type: 'OBJECT', properties: {} },
    },
    execute: () => listCampaigns(),
  },

  find_campaign: {
    kind: 'read',
    declaration: {
      name: 'find_campaign',
      description: 'Encontra campanhas pelo nome (busca parcial, sem diferenciar maiúsculas). Use para localizar o ID de uma campanha quando o usuário menciona o nome dela.',
      parameters: {
        type: 'OBJECT',
        properties: { name: { type: 'STRING', description: 'Parte do nome da campanha a procurar.' } },
        required: ['name'],
      },
    },
    execute: (a) => findCampaignByName(String(a.name ?? '')),
  },

  get_realtime_insights: {
    kind: 'read',
    declaration: {
      name: 'get_realtime_insights',
      description: 'Busca métricas ATUALIZADAS direto da Meta API (gasto, impressões, cliques, CTR, CPM, CPC, conversões) de uma campanha específica ou da conta inteira. Use quando o usuário pedir dados de "agora", "hoje" ou recentes que podem não estar no banco local.',
      parameters: {
        type: 'OBJECT',
        properties: {
          campaign_id: { type: 'STRING', description: 'ID da campanha. Deixe vazio para métricas da conta inteira.' },
          date_preset: { type: 'STRING', description: 'Período: today, yesterday, last_7d, last_14d, last_30d, this_month.', enum: ['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'this_month'] },
        },
      },
    },
    execute: (a) => getRealtimeInsights(
      a.campaign_id ? String(a.campaign_id) : null,
      a.date_preset ? String(a.date_preset) : 'last_7d',
    ),
  },

  // ---- ESCRITA (confirmação obrigatória) --------------------------------
  pause_campaign: {
    kind: 'write',
    declaration: {
      name: 'pause_campaign',
      description: 'Pausa uma campanha (interrompe os gastos). Requer o ID da campanha — use list_campaigns ou find_campaign antes se não tiver o ID.',
      parameters: {
        type: 'OBJECT',
        properties: {
          campaign_id: { type: 'STRING', description: 'ID da campanha a pausar.' },
          campaign_name: { type: 'STRING', description: 'Nome da campanha (para exibir na confirmação).' },
        },
        required: ['campaign_id'],
      },
    },
    confirm: (a) => ({
      title: 'Pausar campanha',
      description: `A campanha "${a.campaign_name ?? a.campaign_id}" será **pausada** e parará de gastar imediatamente.`,
      danger: true,
    }),
    execute: (a) => pauseCampaign(String(a.campaign_id)),
  },

  activate_campaign: {
    kind: 'write',
    declaration: {
      name: 'activate_campaign',
      description: 'Reativa (liga) uma campanha que estava pausada. Requer o ID da campanha.',
      parameters: {
        type: 'OBJECT',
        properties: {
          campaign_id: { type: 'STRING', description: 'ID da campanha a reativar.' },
          campaign_name: { type: 'STRING', description: 'Nome da campanha (para exibir na confirmação).' },
        },
        required: ['campaign_id'],
      },
    },
    confirm: (a) => ({
      title: 'Reativar campanha',
      description: `A campanha "${a.campaign_name ?? a.campaign_id}" será **reativada** e voltará a gastar o orçamento configurado.`,
    }),
    execute: (a) => activateCampaign(String(a.campaign_id)),
  },

  update_budget: {
    kind: 'write',
    declaration: {
      name: 'update_budget',
      description: 'Altera o orçamento DIÁRIO de uma campanha. Valor na moeda da conta (reais). Use para escalar (aumentar) ou reduzir gastos. Requer o ID da campanha.',
      parameters: {
        type: 'OBJECT',
        properties: {
          campaign_id: { type: 'STRING', description: 'ID da campanha.' },
          campaign_name: { type: 'STRING', description: 'Nome da campanha (para exibir na confirmação).' },
          daily_budget: { type: 'NUMBER', description: 'Novo orçamento diário em reais (ex: 50 = R$ 50,00/dia).' },
        },
        required: ['campaign_id', 'daily_budget'],
      },
    },
    confirm: (a) => ({
      title: 'Alterar orçamento diário',
      description: `O orçamento diário da campanha "${a.campaign_name ?? a.campaign_id}" será alterado para **${money(a.daily_budget)}/dia**.`,
    }),
    execute: (a) => updateCampaignBudget(String(a.campaign_id), Number(a.daily_budget)),
  },

  create_campaign: {
    kind: 'write',
    declaration: {
      name: 'create_campaign',
      description: 'Cria uma nova campanha na conta. Por segurança ela é criada SEMPRE PAUSADA — o usuário ativa depois. Não cria conjuntos de anúncios nem criativos (apenas a estrutura da campanha).',
      parameters: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: 'Nome da nova campanha.' },
          objective: { type: 'STRING', description: 'Objetivo ODAX da campanha.', enum: [...VALID_OBJECTIVES] },
          daily_budget: { type: 'NUMBER', description: 'Orçamento diário em reais (opcional).' },
        },
        required: ['name', 'objective'],
      },
    },
    confirm: (a) => ({
      title: 'Criar nova campanha',
      description: `Será criada a campanha **"${a.name}"** (objetivo: ${a.objective})${a.daily_budget ? `, orçamento ${money(a.daily_budget)}/dia` : ''}. Ela nasce **pausada** por segurança.`,
    }),
    execute: (a) => createCampaign({
      name: String(a.name),
      objective: String(a.objective),
      dailyBudget: a.daily_budget ? Number(a.daily_budget) : undefined,
    }),
  },

  // ---- LEITURA: conjuntos, anúncios e criativos -------------------------
  list_adsets: {
    kind: 'read',
    declaration: {
      name: 'list_adsets',
      description: 'Lista os conjuntos de anúncios (ad sets) com status, orçamento e meta de otimização. Pode filtrar por campanha. Use para ver a estrutura interna de uma campanha.',
      parameters: {
        type: 'OBJECT',
        properties: { campaign_id: { type: 'STRING', description: 'ID da campanha para filtrar (opcional; vazio = conta toda).' } },
      },
    },
    execute: (a) => listAdSets(a.campaign_id ? String(a.campaign_id) : undefined),
  },

  list_ads: {
    kind: 'read',
    declaration: {
      name: 'list_ads',
      description: 'Lista os anúncios (ads) com nome e status. Pode filtrar por conjunto (adset_id) ou por campanha (campaign_id). Use para descobrir o ID de um anúncio antes de analisá-lo ou agir sobre ele.',
      parameters: {
        type: 'OBJECT',
        properties: {
          campaign_id: { type: 'STRING', description: 'ID da campanha para filtrar (opcional).' },
          adset_id: { type: 'STRING', description: 'ID do conjunto de anúncios para filtrar (opcional).' },
        },
      },
    },
    execute: (a) => listAds({
      campaignId: a.campaign_id ? String(a.campaign_id) : undefined,
      adsetId: a.adset_id ? String(a.adset_id) : undefined,
    }),
  },

  get_ad_details: {
    kind: 'read',
    declaration: {
      name: 'get_ad_details',
      description: 'Retorna o DETALHE COMPLETO de um anúncio: o criativo (texto principal, título/headline, CTA, link, URL da imagem) E as métricas do período (impressões, cliques, CTR, CPC, gasto, conversões). Use isto para fazer a análise individual de um anúncio (copy + performance). Requer o ad_id (obtenha com list_ads).',
      parameters: {
        type: 'OBJECT',
        properties: {
          ad_id: { type: 'STRING', description: 'ID do anúncio.' },
          date_preset: { type: 'STRING', description: 'Período das métricas.', enum: ['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'this_month'] },
        },
        required: ['ad_id'],
      },
    },
    execute: (a) => getAdDetails(String(a.ad_id), a.date_preset ? String(a.date_preset) : 'last_7d'),
  },

  get_ad_insights: {
    kind: 'read',
    declaration: {
      name: 'get_ad_insights',
      description: 'Métricas detalhadas POR NÍVEL de um objeto. Ex.: para ver o desempenho de CADA anúncio de uma campanha, passe object_id = ID da campanha e level = "ad". Cada linha traz ad_id/ad_name. Ótimo para comparar anúncios entre si.',
      parameters: {
        type: 'OBJECT',
        properties: {
          object_id: { type: 'STRING', description: 'ID da campanha, conjunto ou anúncio.' },
          level: { type: 'STRING', description: 'Nível de detalhamento das métricas.', enum: ['campaign', 'adset', 'ad'] },
          date_preset: { type: 'STRING', description: 'Período.', enum: ['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'this_month'] },
        },
        required: ['object_id', 'level'],
      },
    },
    execute: (a) => getInsightsByLevel(
      String(a.object_id),
      (['campaign', 'adset', 'ad'].includes(String(a.level)) ? String(a.level) : 'ad') as 'campaign' | 'adset' | 'ad',
      a.date_preset ? String(a.date_preset) : 'last_7d',
    ),
  },

  // ---- ESCRITA: conjuntos e anúncios (confirmação obrigatória) ----------
  pause_ad: {
    kind: 'write',
    declaration: {
      name: 'pause_ad',
      description: 'Pausa um anúncio individual (para de rodar/gastar). Requer o ad_id — use list_ads antes se não tiver.',
      parameters: {
        type: 'OBJECT',
        properties: {
          ad_id: { type: 'STRING', description: 'ID do anúncio a pausar.' },
          ad_name: { type: 'STRING', description: 'Nome do anúncio (para a confirmação).' },
        },
        required: ['ad_id'],
      },
    },
    confirm: (a) => ({
      title: 'Pausar anúncio',
      description: `O anúncio "${a.ad_name ?? a.ad_id}" será **pausado** e parará de rodar imediatamente.`,
      danger: true,
    }),
    execute: (a) => setAdStatus(String(a.ad_id), 'PAUSED'),
  },

  activate_ad: {
    kind: 'write',
    declaration: {
      name: 'activate_ad',
      description: 'Reativa (liga) um anúncio que estava pausado. Requer o ad_id.',
      parameters: {
        type: 'OBJECT',
        properties: {
          ad_id: { type: 'STRING', description: 'ID do anúncio a reativar.' },
          ad_name: { type: 'STRING', description: 'Nome do anúncio (para a confirmação).' },
        },
        required: ['ad_id'],
      },
    },
    confirm: (a) => ({
      title: 'Reativar anúncio',
      description: `O anúncio "${a.ad_name ?? a.ad_id}" será **reativado** e voltará a rodar.`,
    }),
    execute: (a) => setAdStatus(String(a.ad_id), 'ACTIVE'),
  },

  pause_adset: {
    kind: 'write',
    declaration: {
      name: 'pause_adset',
      description: 'Pausa um conjunto de anúncios inteiro (todos os anúncios dele param). Requer o adset_id — use list_adsets antes se não tiver.',
      parameters: {
        type: 'OBJECT',
        properties: {
          adset_id: { type: 'STRING', description: 'ID do conjunto a pausar.' },
          adset_name: { type: 'STRING', description: 'Nome do conjunto (para a confirmação).' },
        },
        required: ['adset_id'],
      },
    },
    confirm: (a) => ({
      title: 'Pausar conjunto de anúncios',
      description: `O conjunto "${a.adset_name ?? a.adset_id}" será **pausado** (todos os anúncios dentro dele param).`,
      danger: true,
    }),
    execute: (a) => setAdSetStatus(String(a.adset_id), 'PAUSED'),
  },

  activate_adset: {
    kind: 'write',
    declaration: {
      name: 'activate_adset',
      description: 'Reativa (liga) um conjunto de anúncios que estava pausado. Requer o adset_id.',
      parameters: {
        type: 'OBJECT',
        properties: {
          adset_id: { type: 'STRING', description: 'ID do conjunto a reativar.' },
          adset_name: { type: 'STRING', description: 'Nome do conjunto (para a confirmação).' },
        },
        required: ['adset_id'],
      },
    },
    confirm: (a) => ({
      title: 'Reativar conjunto de anúncios',
      description: `O conjunto "${a.adset_name ?? a.adset_id}" será **reativado**.`,
    }),
    execute: (a) => setAdSetStatus(String(a.adset_id), 'ACTIVE'),
  },

  update_adset_budget: {
    kind: 'write',
    declaration: {
      name: 'update_adset_budget',
      description: 'Altera o orçamento DIÁRIO de um conjunto de anúncios (quando o orçamento é controlado no nível do conjunto, não da campanha). Valor em reais. Requer o adset_id.',
      parameters: {
        type: 'OBJECT',
        properties: {
          adset_id: { type: 'STRING', description: 'ID do conjunto.' },
          adset_name: { type: 'STRING', description: 'Nome do conjunto (para a confirmação).' },
          daily_budget: { type: 'NUMBER', description: 'Novo orçamento diário em reais (ex: 30 = R$ 30,00/dia).' },
        },
        required: ['adset_id', 'daily_budget'],
      },
    },
    confirm: (a) => ({
      title: 'Alterar orçamento do conjunto',
      description: `O orçamento diário do conjunto "${a.adset_name ?? a.adset_id}" será alterado para **${money(a.daily_budget)}/dia**.`,
    }),
    execute: (a) => updateAdSetBudget(String(a.adset_id), Number(a.daily_budget)),
  },
};

/** Todas as declarações no formato que o Gemini espera. */
export function allFunctionDeclarations(): GeminiFunctionDeclaration[] {
  return Object.values(TOOLS).map((t) => t.declaration);
}

export function getTool(name: string): ToolDefinition | undefined {
  return TOOLS[name];
}
