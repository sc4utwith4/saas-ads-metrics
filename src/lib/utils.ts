// =============================================================================
// src/lib/utils.ts
// Utilitários gerais do projeto
// =============================================================================
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Combina classes Tailwind sem conflitos */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formata número como moeda (BRL) */
export function formatCurrency(value: number, currency = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}

/** Formata número como percentual */
export function formatPercent(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}%`;
}

/** Formata número grande com abreviação (K, M, B) */
export function formatCompact(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

/** Retorna a data de hoje no formato YYYY-MM-DD */
export function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

/** Retorna a data N dias atrás no formato YYYY-MM-DD */
export function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}
