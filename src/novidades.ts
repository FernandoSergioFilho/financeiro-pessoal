/**
 * O que mudou em cada versão, para o app contar depois de se atualizar.
 *
 * O app se atualiza sozinho e em silêncio: num dia o botão está ali, no outro
 * tem um botão a mais e ninguém avisou. Quem usa descobre por acaso, ou nunca
 * descobre — foi o que aconteceu com o ditado e com a memória dos nomes, que
 * ficaram dias no ar sem ninguém saber. É o mesmo problema que o Chrome e o
 * Edge resolvem com a tela de "o que há de novo" depois de reiniciar.
 *
 * **O texto viaja junto com o código que ele descreve.** Nada é buscado da
 * rede: a lista está dentro do build, então a versão que acabou de entrar é a
 * única que pode falar sobre si mesma, e não existe o caso de o aviso
 * descrever uma versão que não é a que está rodando.
 *
 * **Como manter.** Ao publicar algo que se vê, acrescente uma entrada no topo.
 * O `id` nunca muda depois de publicado — é por ele que o app sabe o que já
 * foi lido. Escreva para quem usa, não para quem programa: o que ficou
 * possível fazer, e onde. Correção interna, teste e refatoração não entram.
 */

export interface Novidade {
  /** Identificador estável. Depois de publicado, nunca muda. */
  id: string;
  /** `YYYY-MM-DD` da publicação, só para a tela mostrar. */
  data: string;
  titulo: string;
  itens: string[];
}

/** Da mais recente para a mais antiga. */
export const NOVIDADES: Novidade[] = [
  {
    id: '2026-11-11-segurar-para-falar',
    data: '2026-11-11',
    titulo: 'Segurar para falar, e este aviso',
    itens: [
      'O botão de ditar agora funciona como rádio: **segure enquanto fala** e solte quando terminar. Não tem mais como esquecer o microfone aberto.',
      'Toda vez que o app se atualizar, esta janela aparece contando o que mudou. Dá para rever a qualquer momento em **Ajustes**, no fim da página.',
    ],
  },
  {
    id: '2026-11-11-ditado-e-memoria',
    data: '2026-11-11',
    titulo: 'Ditar o lançamento, e lembrar o padrão de cada nome',
    itens: [
      'Em **+ Novo lançamento → Avulso** tem um botão de microfone. "Paguei o mercado quarenta e cinco reais ontem no Nubank" vira valor, data, nome, tipo e conta, e o app mostra o que entendeu antes de você confirmar.',
      'O campo **Descrição** passou a oferecer os nomes que você já usou. Ao escolher um, voltam a categoria, a conta e o tipo — e o valor, quando aquele nome sempre teve o mesmo valor.',
      'O que você escolher com a própria mão nunca é sobrescrito pelo que o app lembra.',
    ],
  },
  {
    id: '2026-10-12-parte-das-parcelas',
    data: '2026-10-12',
    titulo: 'Lançar só parte das parcelas',
    itens: [
      'Dá para cadastrar uma compra que já está na metade: 12 parcelas no total, lançando da 6ª em diante. As etiquetas saem 6/12, como na fatura do banco.',
      'E dá para digitar **o valor da parcela** em vez do total da compra.',
    ],
  },
  {
    id: '2026-10-12-ordem-da-fatura',
    data: '2026-10-12',
    titulo: 'Dentro da fatura, a ordem é a das compras',
    itens: [
      'As compras de uma mesma fatura apareciam em ordem alfabética. Agora seguem a data em que foram feitas, como no extrato do cartão.',
    ],
  },
  {
    id: '2026-10-04-marcar-varios',
    data: '2026-10-04',
    titulo: 'Marcar vários como pago de uma vez',
    itens: [
      'Selecione vários lançamentos e confirme todos num botão só, do mesmo jeito que já dava para apagar vários.',
    ],
  },
];

/** Onde fica guardado o que já foi lido. */
export const CHAVE_DE_NOVIDADES = 'financeiro-pessoal:novidades-vistas';

/**
 * Quantas entradas mostrar de uma vez, no máximo.
 *
 * Só importa para quem ficou muitas versões sem atualizar. Uma janela com dez
 * novidades não é lida por ninguém; as cinco mais recentes, sim.
 */
export const LIMITE_DE_NOVIDADES = 5;

/**
 * O que esta pessoa ainda não leu.
 *
 * `ultimaVista` é o `id` da entrada mais recente que ela já viu.
 *
 * - **Sem nada guardado** — primeira vez que o app roda com este recurso —,
 *   mostra só a mais nova: despejar o histórico inteiro em quem só queria
 *   lançar uma despesa seria trocar um silêncio por um atropelo.
 * - **Com um `id` que não está mais na lista**, não mostra nada. É o caso de
 *   quem ficou tantas versões sem abrir que a marca dele já saiu daqui, e aí
 *   não há como saber o que falta: repetir avisos já lidos incomoda mais do
 *   que pular um. Quem quiser ver está a um toque em Ajustes.
 */
export function novidadesNaoVistas(
  todas: readonly Novidade[],
  ultimaVista: string | null,
): Novidade[] {
  if (todas.length === 0) return [];
  if (ultimaVista === null) return todas.slice(0, 1);

  const onde = todas.findIndex((n) => n.id === ultimaVista);
  if (onde === -1) return [];
  return todas.slice(0, onde).slice(0, LIMITE_DE_NOVIDADES);
}

export function pedacosDoTexto(texto: string): { texto: string; forte: boolean }[] {
  return texto
    .split('**')
    .map((pedaco, i) => ({ texto: pedaco, forte: i % 2 === 1 }))
    .filter((pedaco) => pedaco.texto !== '');
}
