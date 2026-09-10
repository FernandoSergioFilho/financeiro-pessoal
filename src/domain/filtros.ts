/**
 * O filtro de busca que as três listas compartilham.
 *
 * Lançamentos, contas recorrentes e compras parceladas fazem a mesma pergunta
 * — "onde está aquele daquela conta, daquela categoria, cuja descrição tinha
 * tal palavra?" — e antes cada tela respondia à sua maneira, ou não respondia.
 * A regra fica aqui, testada uma vez, em vez de repetida em três lugares com
 * três comportamentos ligeiramente diferentes.
 */

import { textoComparavel } from './similar.ts';

export interface FiltroBasico {
  /** Texto livre, casado contra a descrição sem acento nem caixa. */
  busca: string;
  /** Vazio = todas. */
  accountId: string;
  categoryId: string;
}

export const FILTRO_VAZIO: FiltroBasico = { busca: '', accountId: '', categoryId: '' };

export function filtroEstaVazio(filtro: FiltroBasico): boolean {
  return !filtro.busca.trim() && !filtro.accountId && !filtro.categoryId;
}

export interface Filtravel {
  description: string;
  accountId: string;
  /** A outra ponta de uma transferência também conta como "desta conta". */
  toAccountId?: string | null;
  categoryId?: string | null;
}

export function casaComFiltro(alvo: Filtravel, filtro: FiltroBasico): boolean {
  if (filtro.accountId && alvo.accountId !== filtro.accountId && alvo.toAccountId !== filtro.accountId) {
    return false;
  }
  if (filtro.categoryId && (alvo.categoryId ?? '') !== filtro.categoryId) return false;

  const termo = textoComparavel(filtro.busca);
  if (!termo) return true;
  // Por palavras digitadas, não pela frase inteira: quem escreve "netflix
  // assinatura" está procurando as duas coisas, em qualquer ordem.
  const alvoTexto = textoComparavel(alvo.description);
  return termo.split(' ').every((palavra) => alvoTexto.includes(palavra));
}
