/**
 * O que o app já sabe sobre um nome de lançamento.
 *
 * Quem usa um controle financeiro digita as mesmas dez ou quinze coisas todos
 * os meses: "Mercado", "Gasolina", "Salário", "Luz". Repetir a cada vez a
 * categoria, a conta e muitas vezes o mesmo valor é trabalho que o app já tem
 * como fazer — ele tem o histórico inteiro na mão.
 *
 * **A memória é derivada, não guardada.** Nada de uma tabela nova de
 * "padrões": ela é lida dos lançamentos que já existem, na hora. Isso evita de
 * uma vez três problemas que uma tabela traria — migração de dados antigos,
 * mais uma coleção para sincronizar entre os aparelhos, e o padrão que
 * envelhece errado porque alguém editou o lançamento e ninguém atualizou o
 * padrão. Aqui, corrigir a categoria de um lançamento já corrige a sugestão.
 *
 * **O voto é por frequência, com o empate desfeito pelo mais recente.** Se o
 * mercado foi em "Alimentação" oito vezes e uma vez em "Casa", a sugestão é
 * Alimentação; se foi quatro e quatro, vale o que foi feito por último — é a
 * decisão mais nova sobre a mesma coisa.
 */

import { descricoesCasam, textoComparavel } from './similar.ts';
import type { Entry, EntryKind } from './types.ts';

/** Um nome já usado, para a lista de sugestões do campo de descrição. */
export interface NomeConhecido {
  /** Como foi escrito na vez mais recente — é o que o campo vai receber. */
  nome: string;
  /** Forma comparável, sem acento nem caixa. */
  chave: string;
  quantas: number;
  /** Data do lançamento mais recente com este nome. */
  ultima: string;
}

/** Quantos nomes a lista oferece. Mais do que isto ninguém lê, e pesa a tela. */
export const LIMITE_DE_NOMES = 200;

/**
 * Os nomes já usados, do mais repetido para o menos.
 *
 * A ordem importa porque o `<datalist>` do navegador mostra as primeiras
 * opções sem rolar: o que a pessoa lança toda semana tem de estar no topo.
 */
export function nomesConhecidos(
  entries: readonly Entry[],
  limite: number = LIMITE_DE_NOMES,
): NomeConhecido[] {
  const porChave = new Map<string, NomeConhecido>();

  for (const entry of entries) {
    const nome = entry.description.trim();
    if (!nome) continue;
    const chave = textoComparavel(nome);
    if (!chave) continue;

    const atual = porChave.get(chave);
    if (!atual) {
      porChave.set(chave, { nome, chave, quantas: 1, ultima: entry.date });
      continue;
    }
    atual.quantas += 1;
    // A grafia mais recente ganha: se a pessoa passou a escrever "Mercado do
    // mês", é esse texto que ela espera ver na lista, não o "mercado" de 2023.
    if (entry.date >= atual.ultima) {
      atual.ultima = entry.date;
      atual.nome = nome;
    }
  }

  return [...porChave.values()]
    .sort((a, b) => b.quantas - a.quantas || b.ultima.localeCompare(a.ultima) || a.chave.localeCompare(b.chave))
    .slice(0, limite);
}

/** O que foi lembrado sobre um nome, para preencher o formulário. */
export interface Lembranca {
  /** O nome como está gravado — serve para dizer de onde veio a sugestão. */
  nome: string;
  kind: EntryKind;
  accountId: string;
  categoryId: string | null;
  /** O valor do lançamento mais recente com este nome. */
  amount: number;
  /**
   * Todas as vezes foram o mesmo valor. Aluguel e assinatura são assim;
   * mercado não é. Só com isto verdadeiro é que preencher o valor ajuda em vez
   * de atrapalhar — um número errado já no campo é pior que um campo vazio.
   */
  valorEstavel: boolean;
  /** Quantos lançamentos entraram neste voto. */
  quantas: number;
  /** Data do mais recente deles. */
  ultima: string;
}

export interface Permitidos {
  /** Ids de conta que ainda existem e não estão arquivadas. */
  contas?: ReadonlySet<string>;
  /** Idem para categorias. */
  categorias?: ReadonlySet<string>;
}

/** Abaixo disto a busca por nome parecido acha qualquer coisa. */
const MINIMO_DE_LETRAS = 3;

/**
 * O padrão de um nome: tipo, conta, categoria e valor.
 *
 * Primeiro procura o nome **exato** (sem acento e sem caixa). Só se não houver
 * nenhum é que aceita o parecido — "Mercado" lembrando de "Mercado do mês" —,
 * porque o exato é sempre a resposta melhor quando existe.
 *
 * Devolve `null` quando não há histórico: a tela então não mexe em nada, que é
 * diferente de preencher com um palpite.
 */
export function lembrar(
  entries: readonly Entry[],
  descricao: string,
  permitidos: Permitidos = {},
): Lembranca | null {
  const alvo = textoComparavel(descricao);
  if (alvo.length < MINIMO_DE_LETRAS) return null;

  const exatos = entries.filter((e) => textoComparavel(e.description) === alvo);
  const achados = exatos.length > 0
    ? exatos
    : entries.filter((e) => descricoesCasam(e.description, descricao));
  if (achados.length === 0) return null;

  // Do mais recente para o mais antigo: o desempate por recência sai de graça
  // ao percorrer nesta ordem, e o "valor da última vez" é o primeiro da lista.
  const ordenados = [...achados].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );

  const kind = maisVotado(ordenados.map((e) => e.kind))!;
  // Misturar um estorno (entrada) com as compras (saídas) estragaria o voto da
  // conta e da categoria: daqui para baixo, só os do tipo que venceu.
  const doTipo = ordenados.filter((e) => e.kind === kind);

  const accountId = maisVotado(
    doTipo.map((e) => e.accountId).filter((id) => permitido(id, permitidos.contas)),
  ) ?? doTipo[0]!.accountId;

  const categoryId = maisVotado(
    doTipo
      .map((e) => e.categoryId ?? null)
      .filter((id): id is string => id !== null && permitido(id, permitidos.categorias)),
  ) ?? null;

  const valores = doTipo.map((e) => e.amount);

  return {
    nome: doTipo[0]!.description.trim(),
    kind,
    accountId,
    categoryId,
    amount: valores[0]!,
    valorEstavel: valores.every((v) => v === valores[0]),
    quantas: doTipo.length,
    ultima: doTipo[0]!.date,
  };
}

function permitido(id: string, permitidos: ReadonlySet<string> | undefined): boolean {
  return permitidos === undefined || permitidos.has(id);
}

/**
 * O valor mais frequente da lista; empate decidido por quem apareceu primeiro.
 *
 * Como quem chama passa a lista do mais recente para o mais antigo, "apareceu
 * primeiro" quer dizer "foi usado por último".
 */
function maisVotado<T>(valores: readonly T[]): T | null {
  const contagem = new Map<T, number>();
  for (const valor of valores) contagem.set(valor, (contagem.get(valor) ?? 0) + 1);

  let melhor: T | null = null;
  let melhorContagem = 0;
  for (const [valor, quantas] of contagem) {
    if (quantas > melhorContagem) {
      melhor = valor;
      melhorContagem = quantas;
    }
  }
  return melhor;
}
