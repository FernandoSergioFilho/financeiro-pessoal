/**
 * Junta contas e categorias repetidas.
 *
 * A carteira sincronizada encheu de "Conta corrente" e "Alimentação" iguais
 * porque cada aparelho novo semeava seu próprio jogo de padrões, com ids
 * sorteados na hora. A semeadura já foi corrigida, mas as cópias que entraram
 * continuam lá — e apagar uma a uma na mão quebraria os lançamentos que
 * apontam para elas.
 *
 * Aqui a junção é uma função pura: escolhe um sobrevivente por nome, faz todo
 * mundo apontar para ele e marca os demais como apagados. A tela mostra o que
 * vai acontecer antes de aplicar.
 */

import { chaveDeNome } from './text.ts';
import type { Category, FinanceData, Tombstone } from './types.ts';

export interface GrupoJuntado {
  /** O nome como ficou — o do sobrevivente. */
  nome: string;
  /** Quantos cadastros existiam antes (2 ou mais). */
  quantidade: number;
}

export interface ResumoJuncao {
  contas: GrupoJuntado[];
  categorias: GrupoJuntado[];
  /** Lançamentos, recorrentes e parcelas que passaram a apontar para outro id. */
  registrosRemapeados: number;
}

export interface ResultadoJuncao {
  data: FinanceData;
  resumo: ResumoJuncao;
}

interface Nomeado {
  id: string;
  name: string;
  archived?: boolean;
  updatedAt: string;
}

/**
 * Quem fica: o mais antigo entre os que estão em uso; se nenhum tem uso, o
 * mais antigo de todos. Preferir o usado evita que a junção troque a cor e o
 * tipo que o usuário já tinha ajustado por um padrão recém-criado. Arquivado
 * só sobrevive se todos do grupo estiverem arquivados.
 */
function escolherSobrevivente<T extends Nomeado>(grupo: readonly T[], usos: ReadonlyMap<string, number>): T {
  const ordenado = [...grupo].sort((a, b) => {
    const arquivo = Number(a.archived ?? false) - Number(b.archived ?? false);
    if (arquivo !== 0) return arquivo;
    const uso = (usos.get(b.id) ?? 0) - (usos.get(a.id) ?? 0);
    if (uso !== 0) return uso; // quem tem mais uso primeiro
    return a.updatedAt.localeCompare(b.updatedAt);
  });
  return ordenado[0]!;
}

/** Agrupa por nome; grupos de um só são ignorados. */
function agrupar<T extends Nomeado>(lista: readonly T[], chave: (item: T) => string): T[][] {
  const mapa = new Map<string, T[]>();
  for (const item of lista) {
    const k = chave(item);
    const atual = mapa.get(k);
    if (atual) atual.push(item);
    else mapa.set(k, [item]);
  }
  return [...mapa.values()].filter((grupo) => grupo.length > 1);
}

/** Conta quantas vezes cada id aparece nos lançamentos, recorrentes e compras. */
function contarUsos(data: FinanceData): { contas: Map<string, number>; categorias: Map<string, number> } {
  const contas = new Map<string, number>();
  const categorias = new Map<string, number>();
  const somar = (mapa: Map<string, number>, id: string | null | undefined) => {
    if (id) mapa.set(id, (mapa.get(id) ?? 0) + 1);
  };

  for (const entry of data.entries) {
    somar(contas, entry.accountId);
    somar(contas, entry.toAccountId);
    somar(categorias, entry.categoryId);
  }
  for (const rule of data.recurring) {
    somar(contas, rule.accountId);
    somar(contas, rule.toAccountId);
    somar(categorias, rule.categoryId);
  }
  for (const purchase of data.purchases) {
    somar(contas, purchase.accountId);
    somar(categorias, purchase.categoryId);
  }
  return { contas, categorias };
}

/**
 * Categoria repetida é a de mesmo nome **e mesmo tipo**: "Outros" existe como
 * saída e como entrada, e são duas coisas diferentes.
 */
function chaveDeCategoria(categoria: Category): string {
  return `${categoria.kind}:${chaveDeNome(categoria.name)}`;
}

export function contarDuplicados(data: FinanceData): { contas: number; categorias: number } {
  const contas = agrupar(data.accounts, (a) => chaveDeNome(a.name)).reduce((t, g) => t + g.length - 1, 0);
  const categorias = agrupar(data.categories, chaveDeCategoria).reduce((t, g) => t + g.length - 1, 0);
  return { contas, categorias };
}

export function juntarDuplicados(data: FinanceData, agora: string): ResultadoJuncao {
  const usos = contarUsos(data);

  const gruposContas = agrupar(data.accounts, (a) => chaveDeNome(a.name));
  const gruposCategorias = agrupar(data.categories, chaveDeCategoria);

  // De cada id que sai para o id que fica.
  const trocaConta = new Map<string, string>();
  const trocaCategoria = new Map<string, string>();
  const resumo: ResumoJuncao = { contas: [], categorias: [], registrosRemapeados: 0 };

  for (const grupo of gruposContas) {
    const fica = escolherSobrevivente(grupo, usos.contas);
    for (const conta of grupo) if (conta.id !== fica.id) trocaConta.set(conta.id, fica.id);
    resumo.contas.push({ nome: fica.name, quantidade: grupo.length });
  }
  for (const grupo of gruposCategorias) {
    const fica = escolherSobrevivente(grupo, usos.categorias);
    for (const categoria of grupo) if (categoria.id !== fica.id) trocaCategoria.set(categoria.id, fica.id);
    resumo.categorias.push({ nome: fica.name, quantidade: grupo.length });
  }

  if (trocaConta.size === 0 && trocaCategoria.size === 0) return { data, resumo };

  const conta = (id: string) => trocaConta.get(id) ?? id;
  const contaOpcional = (id: string | null | undefined) => (id ? conta(id) : id);
  const categoria = (id: string | null | undefined) => (id ? (trocaCategoria.get(id) ?? id) : id);

  let remapeados = 0;
  const remapear = <T extends { accountId: string; toAccountId?: string | null; categoryId?: string | null; updatedAt: string }>(
    registro: T,
  ): T => {
    const accountId = conta(registro.accountId);
    const toAccountId = contaOpcional(registro.toAccountId);
    const categoryId = categoria(registro.categoryId);
    if (accountId === registro.accountId && toAccountId === registro.toAccountId && categoryId === registro.categoryId) {
      return registro;
    }
    remapeados += 1;
    return { ...registro, accountId, toAccountId, categoryId, updatedAt: agora };
  };

  const entries = data.entries.map(remapear);
  const recurring = data.recurring.map(remapear);
  const purchases = data.purchases.map((compra) => {
    const accountId = conta(compra.accountId);
    const categoryId = categoria(compra.categoryId);
    if (accountId === compra.accountId && categoryId === compra.categoryId) return compra;
    remapeados += 1;
    return { ...compra, accountId, categoryId, updatedAt: agora };
  });
  resumo.registrosRemapeados = remapeados;

  const apagados: Tombstone[] = [
    ...[...trocaConta.keys()].map((id) => ({ table: 'accounts' as const, id, deletedAt: agora })),
    ...[...trocaCategoria.keys()].map((id) => ({ table: 'categories' as const, id, deletedAt: agora })),
  ].filter((novo) => !data.tombstones.some((t) => t.table === novo.table && t.id === novo.id));

  return {
    data: {
      ...data,
      accounts: data.accounts.filter((a) => !trocaConta.has(a.id)),
      categories: data.categories.filter((c) => !trocaCategoria.has(c.id)),
      entries,
      recurring,
      purchases,
      tombstones: [...data.tombstones, ...apagados],
    },
    resumo,
  };
}
