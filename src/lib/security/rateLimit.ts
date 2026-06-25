// =============================================================================
// src/lib/security/rateLimit.ts
// Rate limiting best-effort em memória (janela deslizante), por chave.
// NOTA: em serverless cada instância tem sua própria memória, então isto é uma
// barreira de mitigação, não garantia rígida. Para produção em escala, troque
// por um store compartilhado (Upstash/Redis).
// =============================================================================

const buckets = new Map<string, number[]>();

export interface RateResult { ok: boolean; retryAfter: number }

/** Permite até `limit` chamadas por `windowMs` para a `key`. */
export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);

  if (arr.length >= limit) {
    buckets.set(key, arr);
    const retryAfter = Math.ceil((windowMs - (now - arr[0])) / 1000);
    return { ok: false, retryAfter: Math.max(retryAfter, 1) };
  }

  arr.push(now);
  buckets.set(key, arr);

  // Limpeza ocasional para não vazar memória.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t > windowMs)) buckets.delete(k);
    }
  }
  return { ok: true, retryAfter: 0 };
}

/** Extrai um IP aproximado do cliente a partir dos headers da requisição. */
export function clientIp(req: Request): string {
  const h = (n: string) => req.headers.get(n) || '';
  const fwd = h('x-forwarded-for').split(',')[0].trim();
  return fwd || h('x-real-ip').trim() || 'unknown';
}
