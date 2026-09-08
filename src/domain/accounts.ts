/**
 * O que segura uma conta, e como soltá-la.
 *
 * O app dizia só "tem lançamentos" e arquivava. Quando o usuário não achava
 * lançamento nenhum, não havia como saber quem estava mentindo — e havia dois
 * jeitos de a conta parecer vazia sem estar:
 *
 * 1. A tela de Lançamentos mostrava **um mês por vez**. Uma parcela marcada
 *    para daqui a oito meses, ou um lançamento de dois anos atrás, não aparecia
 *    em lugar nenhum e mesmo assim segurava a conta.
 * 2. Apagar as parcelas uma a uma deixava a **compra parcelada órfã**, sem
 *    nenhuma parcela, ainda apontando para a conta.
 *
 * Aqui a resposta passa a ser contada e nomeada, e existe o caminho de saída:
 * mover tudo para outra conta e então apagar.
 */

import type { FinanceData, TableName, Tombstone } from './types.ts';

export interface UsoDaConta {
  lancamentos: number;
  recorrentes: number;
  /** Compras parceladas que ainda têm parcela. */
  compras: number;
  /** Compras sem nenhuma parcela: sobra de quem apagou as parcelas uma a uma. */
  comprasOrfas: number;
  /** Quantos registros ao todo — zero significa que dá para apagar. */
  total: number;
}

export function usoDaConta(data: FinanceData, id: string): UsoDaConta {
  const lancamentos = data.entries.filter((e) => e.accountId === id || e.toAccountId === id).length;
  const recorrentes = data.recurring.filter((r) => r.accountId === id || r.toAccountId === id).length;

  const daConta = data.purchases.filter((p) => p.accountId === id);
  const comParcela = new Set(data.entries.map((e) => e.purchaseId).filter(Boolean) as string[]);
  const compras = daConta.filter((p) => comParcela.has(p.id)).length;
  const comprasOrfas = daConta.length - compras;

  return {
    lancamentos,
    recorrentes,
    compras,
    comprasOrfas,
    total: lancamentos + recorrentes + compras + comprasOrfas,
  };
}

/** Só some de vez quando nada mais aponta para ela. */
export function contaEmUso(data: FinanceData, id: string): boolean {
  return usoDaConta(data, id).total > 0;
}

/** "3 lançamentos e 1 conta recorrente" — para dizer o que está segurando. */
export function descreverUso(uso: UsoDaConta): string {
  const partes: string[] = [];
  const somar = (quantidade: number, um: string, varios: string) => {
    if (quantidade > 0) partes.push(`${quantidade} ${quantidade === 1 ? um : varios}`);
  };
  somar(uso.lancamentos, 'lançamento', 'lançamentos');
  somar(uso.recorrentes, 'conta recorrente', 'contas recorrentes');
  somar(uso.compras, 'compra parcelada', 'compras parceladas');
  somar(uso.comprasOrfas, 'compra parcelada sem parcelas', 'compras parceladas sem parcelas');

  if (partes.length === 0) return 'nada';
  if (partes.length === 1) return partes[0]!;
  return `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}`;
}

export interface ResultadoMudanca {
  data: FinanceData;
  /** Quantos registros mudaram de conta. */
  movidos: number;
  /**
   * Transferências que ligavam as duas contas e viraram nada: com as pontas
   * fundidas, seria dinheiro saindo e entrando no mesmo lugar.
   */
  transferenciasDescartadas: number;
}

/**
 * Move tudo o que aponta para `de` de modo a apontar para `para`.
 *
 * Não mexe nas contas em si: quem apaga é quem chamou, depois de ver que
 * sobrou zero. Assim a operação é conferível — o usuário vê o movimento
 * aparecer na outra conta antes de qualquer coisa sumir.
 */
export function moverConta(data: FinanceData, de: string, para: string, agora: string): ResultadoMudanca {
  if (de === para) return { data, movidos: 0, transferenciasDescartadas: 0 };

  const lapides: Tombstone[] = [];
  const enterrar = (table: TableName, id: string) => lapides.push({ table, id, deletedAt: agora });

  let movidos = 0;
  let transferenciasDescartadas = 0;

  const entries = data.entries.flatMap((entry) => {
    const daConta = entry.accountId === de;
    const paraConta = entry.toAccountId === de;
    if (!daConta && !paraConta) return [entry];

    const accountId = daConta ? para : entry.accountId;
    const toAccountId = paraConta ? para : entry.toAccountId;

    if (entry.kind === 'transfer' && accountId === toAccountId) {
      transferenciasDescartadas += 1;
      enterrar('entries', entry.id);
      return [];
    }

    movidos += 1;
    return [{ ...entry, accountId, toAccountId, updatedAt: agora }];
  });

  const recurring = data.recurring.flatMap((rule) => {
    const daConta = rule.accountId === de;
    const paraConta = rule.toAccountId === de;
    if (!daConta && !paraConta) return [rule];

    const accountId = daConta ? para : rule.accountId;
    const toAccountId = paraConta ? para : rule.toAccountId;

    if (rule.kind === 'transfer' && accountId === toAccountId) {
      transferenciasDescartadas += 1;
      enterrar('recurring', rule.id);
      return [];
    }

    movidos += 1;
    return [{ ...rule, accountId, toAccountId, updatedAt: agora }];
  });

  const purchases = data.purchases.map((purchase) => {
    if (purchase.accountId !== de) return purchase;
    movidos += 1;
    return { ...purchase, accountId: para, updatedAt: agora };
  });

  if (movidos === 0 && transferenciasDescartadas === 0) {
    return { data, movidos: 0, transferenciasDescartadas: 0 };
  }

  return {
    data: { ...data, entries, recurring, purchases, tombstones: [...data.tombstones, ...lapides] },
    movidos,
    transferenciasDescartadas,
  };
}

/**
 * Compras que ficaram sem nenhuma parcela.
 *
 * Elas não aparecem em lugar nenhum de útil — o andamento fica "0 de N" — e
 * continuam prendendo a conta. Limpar é o mesmo que apagar uma compra cujas
 * parcelas já foram todas apagadas à mão.
 */
export function limparComprasOrfas(data: FinanceData, agora: string): { data: FinanceData; removidas: number } {
  const comParcela = new Set(data.entries.map((e) => e.purchaseId).filter(Boolean) as string[]);
  const orfas = data.purchases.filter((p) => !comParcela.has(p.id));
  if (orfas.length === 0) return { data, removidas: 0 };

  return {
    data: {
      ...data,
      purchases: data.purchases.filter((p) => comParcela.has(p.id)),
      tombstones: [
        ...data.tombstones,
        ...orfas.map((p) => ({ table: 'purchases' as TableName, id: p.id, deletedAt: agora })),
      ],
    },
    removidas: orfas.length,
  };
}
