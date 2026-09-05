/**
 * Aritmética de datas sobre strings `YYYY-MM-DD`.
 *
 * Usar `Date` aqui traria fuso horário para dentro do domínio: um
 * `new Date('2026-01-31')` é UTC e, a oeste de Greenwich, imprime dia 30.
 * Como o app só precisa de dias-calendário, a conta é feita nos inteiros.
 */

export interface YMD {
  year: number;
  month: number; // 1-12
  day: number;
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseISO(iso: string): YMD {
  const m = ISO_RE.exec(iso);
  if (!m) throw new Error(`Data inválida: ${iso}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function toISO({ year, month, day }: YMD): string {
  const p = (n: number, size = 2) => String(n).padStart(size, '0');
  return `${p(year, 4)}-${p(month)}-${p(day)}`;
}

export function isValidISO(iso: string): boolean {
  if (!ISO_RE.test(iso)) return false;
  const { year, month, day } = parseISO(iso);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Hoje no fuso local, como `YYYY-MM-DD`. */
export function today(): string {
  const now = new Date();
  return toISO({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() });
}

export function addDays(iso: string, days: number): string {
  const { year, month, day } = parseISO(iso);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return toISO({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
}

/**
 * Soma meses preservando o dia sempre que ele existir no mês de destino.
 *
 * 31/01 + 1 mês = 28/02, mas 31/01 + 3 meses = 30/04 e não 28/04: por isso a
 * projeção de recorrentes sempre parte da data inicial, nunca da ocorrência
 * anterior — encadear o clamp faria o dia "derreter" mês a mês.
 */
export function addMonths(iso: string, months: number): string {
  const { year, month, day } = parseISO(iso);
  const total = (year * 12 + (month - 1)) + months;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  return toISO({ year: newYear, month: newMonth, day: Math.min(day, daysInMonth(newYear, newMonth)) });
}

export function addYears(iso: string, years: number): string {
  return addMonths(iso, years * 12);
}

/** `YYYY-MM` — chave de agrupamento mensal. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function monthStart(key: string): string {
  return `${key}-01`;
}

export function monthEnd(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${key}-${String(daysInMonth(y!, m!)).padStart(2, '0')}`;
}

export function addMonthsToKey(key: string, months: number): string {
  return monthKey(addMonths(monthStart(key), months));
}

export function currentMonthKey(): string {
  return monthKey(today());
}

const MONTH_NAMES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export function formatMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const name = MONTH_NAMES[(m ?? 1) - 1] ?? '';
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${y}`;
}

/** `05/09/2026` */
export function formatDate(iso: string): string {
  const { year, month, day } = parseISO(iso);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

/** `05 set` — para listas densas, onde o ano é redundante. */
export function formatDayMonth(iso: string): string {
  const { month, day } = parseISO(iso);
  const short = MONTH_NAMES[month - 1]?.slice(0, 3) ?? '';
  return `${String(day).padStart(2, '0')} ${short}`;
}

/** Dia da semana, 0 = domingo. */
export function weekday(iso: string): number {
  const { year, month, day } = parseISO(iso);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}
