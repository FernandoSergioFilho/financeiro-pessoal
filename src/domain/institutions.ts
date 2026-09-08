/**
 * Contas agrupadas pelo banco a que pertencem.
 *
 * O pedido foi "não preciso de dois cadastros para o mesmo banco". Um cadastro
 * só, de verdade, não dá: o dinheiro que está na conta corrente e a fatura que
 * se deve no cartão são saldos diferentes, e somá-los produziria um número que
 * não existe em lugar nenhum. O que dá — e é o que resolve o incômodo — é
 * parar de mostrá-los como duas coisas sem relação: um grupo "Nubank" com a
 * conta e o cartão dentro, e o subtotal de quanto sobra ali depois de pagar a
 * fatura.
 */

import { chaveDeNome } from './text.ts';
import type { Account } from './types.ts';

export interface Instituicao {
  /** Como aparece na tela. */
  nome: string;
  contas: Account[];
  /** Grupo de uma conta só, sem instituição declarada: não vira cabeçalho. */
  avulsa: boolean;
}

/** O nome pelo qual a conta se agrupa: a instituição, ou ela mesma. */
export function instituicaoDaConta(conta: Account): string {
  return conta.institution?.trim() || conta.name;
}

/**
 * Agrupa preservando a ordem em que as contas foram cadastradas: a lista da
 * tela não pode se reorganizar sozinha a cada edição.
 */
export function agruparPorInstituicao(contas: readonly Account[]): Instituicao[] {
  const grupos = new Map<string, Instituicao>();

  for (const conta of contas) {
    const nome = instituicaoDaConta(conta);
    const chave = chaveDeNome(nome);
    const grupo = grupos.get(chave);
    if (grupo) {
      grupo.contas.push(conta);
      // Um grupo com duas contas é um banco, mesmo que a segunda tenha
      // chegado sem o campo preenchido.
      grupo.avulsa = false;
    } else {
      grupos.set(chave, { nome, contas: [conta], avulsa: !conta.institution?.trim() });
    }
  }

  return [...grupos.values()];
}

/** As instituições já usadas, para o formulário sugerir em vez de exigir digitar. */
export function instituicoesConhecidas(contas: readonly Account[]): string[] {
  // Vale a primeira grafia: se a pessoa escreveu "Nubank" e depois "nubank",
  // a lista mostra a que ela escolheu, não a última que passou por aqui.
  const vistas = new Map<string, string>();
  for (const conta of contas) {
    const nome = conta.institution?.trim();
    if (nome && !vistas.has(chaveDeNome(nome))) vistas.set(chaveDeNome(nome), nome);
  }
  return [...vistas.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/**
 * Palpite de instituição para uma conta nova, a partir do que já existe.
 *
 * "Nubank cartão" começa com as palavras de uma conta chamada "Nubank", então
 * quase certamente é do mesmo banco. É oferecido, nunca aplicado sozinho:
 * adivinhar e gravar calado é como o app acabou com contas repetidas antes.
 */
export function sugerirInstituicao(
  contas: readonly Account[],
  nome: string,
  { ignorar }: { ignorar?: string } = {},
): string | null {
  const palavras = chaveDeNome(nome).split(/\s+/).filter(Boolean);
  if (palavras.length < 2) return null;

  const candidatos = new Map<string, string>();
  for (const conta of contas) {
    if (conta.id === ignorar) continue;
    const declarada = conta.institution?.trim();
    if (declarada) candidatos.set(chaveDeNome(declarada), declarada);
    candidatos.set(chaveDeNome(conta.name), conta.name);
  }

  // Do prefixo mais longo para o mais curto: "Banco do Brasil" ganha de "Banco".
  for (let tamanho = palavras.length - 1; tamanho >= 1; tamanho -= 1) {
    const prefixo = palavras.slice(0, tamanho).join(' ');
    const achado = candidatos.get(prefixo);
    if (achado) return achado;
  }
  return null;
}
