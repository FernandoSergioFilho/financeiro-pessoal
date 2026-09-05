/** Dinheiro em centavos: formatação e leitura do que o usuário digita. */

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const PLAIN = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatMoney(cents: number): string {
  return BRL.format(cents / 100);
}

/** Sem o símbolo, para campos de formulário e colunas alinhadas. */
export function formatAmount(cents: number): string {
  return PLAIN.format(cents / 100);
}

/** Com sinal explícito — usado onde entrada e saída aparecem lado a lado. */
export function formatSigned(cents: number): string {
  const sign = cents > 0 ? '+' : cents < 0 ? '−' : '';
  return `${sign}${BRL.format(Math.abs(cents) / 100)}`;
}

/** `R$ 1.2 mil` — só para rótulos de eixo, onde o valor exato atrapalha. */
export function formatCompact(cents: number): string {
  const value = Math.abs(cents) / 100;
  const sign = cents < 0 ? '−' : '';
  if (value >= 1000) return `${sign}${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} mil`;
  return `${sign}${Math.round(value)}`;
}

/**
 * Lê o valor digitado aceitando as duas convenções que aparecem na prática:
 * `1.234,56` (brasileira) e `1234.56` (teclado numérico / colado de planilha).
 * Retorna `null` quando não há número reconhecível.
 */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[R$\s ]/g, '').trim();
  if (!cleaned) return null;

  const negative = /^-/.test(cleaned);
  const digitsOnly = cleaned.replace(/^-/, '');
  if (!/^[\d.,]+$/.test(digitsOnly)) return null;

  const lastComma = digitsOnly.lastIndexOf(',');
  const lastDot = digitsOnly.lastIndexOf('.');
  let normalized: string;

  if (lastComma === -1 && lastDot === -1) {
    normalized = digitsOnly;
  } else if (lastComma > lastDot) {
    // Vírgula é o separador decimal: os pontos são milhares.
    normalized = digitsOnly.replace(/\./g, '').replace(',', '.');
  } else {
    // Ponto é o separador decimal — a menos que seja separador de milhar
    // (`1.234`), o que se reconhece por três dígitos depois dele.
    const decimals = digitsOnly.length - lastDot - 1;
    normalized =
      decimals === 3 && !digitsOnly.includes(',')
        ? digitsOnly.replace(/\./g, '')
        : digitsOnly.replace(/,/g, '');
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) * (negative ? -1 : 1);
}

/**
 * Divide um total em N parcelas inteiras em centavos que somam exatamente o
 * total. O resto vai nas primeiras parcelas, como fazem as maquininhas:
 * R$ 100,00 em 3x = 33,34 + 33,33 + 33,33.
 */
export function splitInstallments(total: number, count: number): number[] {
  if (count < 1) throw new Error('A compra precisa de ao menos uma parcela.');
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}
