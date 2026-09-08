/**
 * Quando criar as contas e categorias padrão.
 *
 * Parece detalhe, mas foi o que encheu a carteira de cadastros repetidos: a
 * semeadura acontecia sempre que o armazenamento **local** estava vazio, e com
 * sincronização ligada isso não quer dizer "usuário novo" — quer dizer
 * "aparelho novo". Como cada semeadura sorteia ids novos, todo navegador que
 * abrisse o app logado despejava mais um jogo de "Conta corrente" e
 * "Alimentação" na carteira compartilhada.
 *
 * A regra em função pura, longe do componente, para poder ser testada.
 */

interface Conteudo {
  accounts: readonly unknown[];
  entries: readonly unknown[];
}

/** Vazio para este fim é "sem conta e sem lançamento". */
function vazio(conteudo: Conteudo): boolean {
  return conteudo.accounts.length === 0 && conteudo.entries.length === 0;
}

/**
 * Na carga inicial, só semeia o app puramente local — aí não existe carteira
 * compartilhada para poluir, e a tela em branco seria pior.
 */
export function semearNaCarga(carregado: Conteudo, nuvemLigada: boolean): boolean {
  return !nuvemLigada && vazio(carregado);
}

export type DecisaoPosSync = 'esperar' | 'semear' | 'nao-precisa';

/**
 * Com nuvem, a semeadura espera a primeira sincronização terminar. Se veio
 * conteúdo, é conta antiga e não há nada a criar; se não veio nada, aí sim é
 * carteira nova de verdade.
 */
export function decidirDepoisDaSync(
  estado: { status: string; ultimaSync: string | null },
  atual: Conteudo,
): DecisaoPosSync {
  if (estado.status !== 'ready' || !estado.ultimaSync) return 'esperar';
  return vazio(atual) ? 'semear' : 'nao-precisa';
}
