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
 *
 * **O texto de uma entrada antiga pode ser corrigido; o `id`, não.** Quando o
 * app volta atrás numa decisão, a entrada que anunciou a decisão antiga passa
 * a mentir para quem abrir o histórico. Aconteceu com o "segure para falar",
 * que durou uma versão: a entrada que o anunciava foi reescrita, e a volta
 * atrás ganhou entrada própria. Reescrever o texto não confunde o app, porque
 * ele só compara `id`.
 */

export interface Novidade {
  /** Identificador estável. Depois de publicado, nunca muda. */
  id: string;
  /** `YYYY-MM-DD` da publicação, só para a tela mostrar. */
  data: string;
  titulo: string;
  itens: string[];
}

/**
 * Da mais recente para a mais antiga.
 *
 * É esta lista que o histórico dos Ajustes mostra por inteiro, e por isso ela
 * desce até o primeiro dia do app. As entradas antigas foram escritas a partir
 * do que cada publicação mudou na tela — mudança interna, teste e arrumação de
 * código não entram, porque não é disso que o histórico fala.
 */
export const NOVIDADES: Novidade[] = [
  {
    id: '2026-11-12-memoria-sem-a-conta',
    data: '2026-11-12',
    titulo: 'O nome lembra a categoria, e não a conta',
    itens: [
      'Escrever um nome já usado continua trazendo de volta a **categoria** e o tipo — e o valor, quando aquele nome sempre teve o mesmo valor.',
      '**A conta deixou de ser preenchida.** O mesmo mercado é pago ora num cartão, ora noutro, e errar o cartão mexe no saldo de duas contas sem você pedir. Quando você **dita** a frase, porém, "no Nubank" continua valendo: ali você disse qual é.',
    ],
  },
  {
    id: '2026-11-11-historico-de-alteracoes',
    data: '2026-11-11',
    titulo: 'Histórico de alterações nos Ajustes',
    itens: [
      'No fim de **Ajustes** há agora o histórico completo: tudo o que mudou no app desde o primeiro dia, do mais recente para o mais antigo.',
    ],
  },
  {
    id: '2026-11-11-dois-toques-para-ditar',
    data: '2026-11-11',
    titulo: 'Ditar com dois toques',
    itens: [
      'Para ditar, **toque uma vez para começar** e **outra para parar**, como no botão de ditar do Claude. Por uma versão foi preciso segurar o botão; não é mais.',
    ],
  },
  {
    // Esta entrada anunciava também o "segure para falar", que durou uma
    // versão. O texto daquele item saiu daqui para o histórico não contradizer
    // o app; o `id` fica, que é a âncora de quem já leu.
    id: '2026-11-11-segurar-para-falar',
    data: '2026-11-11',
    titulo: 'Aviso do que mudou, a cada atualização',
    itens: [
      'O app passou a abrir uma janela contando o que mudou toda vez que se atualiza.',
    ],
  },
  {
    id: '2026-11-11-ditado-e-memoria',
    data: '2026-11-11',
    titulo: 'Ditar o lançamento, e lembrar o padrão de cada nome',
    itens: [
      'Em **+ Novo lançamento → Avulso** tem um botão de microfone. "Paguei o mercado quarenta e cinco reais ontem no Nubank" vira valor, data, nome, tipo e conta, e o app mostra o que entendeu antes de você confirmar.',
      'O campo **Descrição** passou a oferecer os nomes que você já usou. Ao escolher um, voltam a categoria e o tipo — e o valor, quando aquele nome sempre teve o mesmo valor.',
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
  {
    id: '2026-10-04-fatura-no-disponivel',
    data: '2026-10-04',
    titulo: 'A fatura que já venceu sai do dinheiro disponível',
    itens: [
      'O "dinheiro disponível" e o gráfico do saldo discordavam: um descontava a fatura do cartão no dia do vencimento e o outro não. Agora contam a mesma história.',
    ],
  },
  {
    id: '2026-09-24-atrasado-por-caixa',
    data: '2026-09-24',
    titulo: '"Atrasado" passa a ser pela data em que o dinheiro sai',
    itens: [
      'Uma compra no cartão feita mês passado aparecia como atrasada, mesmo com a fatura ainda por vencer. Agora só atrasa quando a fatura vence.',
    ],
  },
  {
    id: '2026-09-18-filtros-que-se-combinam',
    data: '2026-09-18',
    titulo: 'Filtros que se combinam, e um painel que mostra o que você pediu',
    itens: [
      'Em **Lançamentos**, tipo e situação passam a valer juntos: dá para pedir "saídas **e** atrasados".',
      'No **Painel**, um segundo filtro escolhe entre ver tudo, só os números, só os gráficos ou só os lançamentos.',
      'O resultado de "Procurar atualização" aparece ao lado do botão, e não no alto da página onde ninguém via.',
    ],
  },
  {
    id: '2026-09-17-sincronizacao-confiavel',
    data: '2026-09-17',
    titulo: 'O que você apaga fica apagado, e as categorias param de duplicar',
    itens: [
      'Abrir o app em outro navegador criava um segundo jogo de contas e categorias. Não cria mais.',
      'E o que um aparelho apagava voltava quando o outro sincronizava. Também não volta mais.',
    ],
  },
  {
    id: '2026-09-13-ia-com-chave',
    data: '2026-09-13',
    titulo: 'Perguntar à IA dentro do app',
    itens: [
      'Com uma chave do Google Gemini guardada em **Ajustes**, a resposta aparece dentro do app — em **Painel → 🔎 Analisar → Levar a uma IA**.',
      'A chave fica só no aparelho: não entra em backup nem na sincronização.',
    ],
  },
  {
    id: '2026-09-13-tutorial-e-estatistica',
    data: '2026-09-13',
    titulo: 'Tutorial, estatísticas que viram ação e um guia de investimentos',
    itens: [
      'Um tutorial no primeiro cartão de **Ajustes**, para começar sem adivinhar.',
      'As estatísticas passaram a apontar o que fazer com elas, em vez de só mostrar números.',
      'Investimentos ganharam guia próprio: aportar, retirar e registrar rendimento.',
    ],
  },
  {
    id: '2026-09-13-saldo-no-que-posso-gastar',
    data: '2026-09-13',
    titulo: 'O dinheiro que já existe entra no "quanto ainda posso gastar"',
    itens: [
      'Antes a conta ignorava o saldo que você já tinha, e o número vinha menor do que a realidade.',
      'Os recortes das listas passaram a se chamar **confirmados** e **em aberto**, que é como se fala.',
    ],
  },
  {
    id: '2026-09-12-importar-do-banco',
    data: '2026-09-12',
    titulo: 'Importar do banco em cinco formatos',
    itens: [
      'CSV, planilha, PDF, print da tela e texto colado — inclusive a fatura do Santander, que vem em duas colunas.',
    ],
  },
  {
    id: '2026-09-12-fluxo-de-caixa',
    data: '2026-09-12',
    titulo: 'O app assume que é um fluxo de caixa',
    itens: [
      'A pergunta que ele responde é quando o dinheiro entra e quando sai. O que não seguia isso foi corrigido.',
      'No cartão, a compra passa a pesar no mês em que **a fatura vence** — e a compra feita no próprio dia do fechamento já é da fatura seguinte, como diz a fatura.',
    ],
  },
  {
    id: '2026-09-12-ia-para-levar',
    data: '2026-09-12',
    titulo: 'Levar os números a uma IA',
    itens: [
      'O app monta o texto com os seus totais e você cola num chat. Sem chave e sem custo.',
    ],
  },
  {
    id: '2026-09-12-copia-antes-de-apagar',
    data: '2026-09-12',
    titulo: 'Cópia automática antes de qualquer exclusão',
    itens: [
      'O app guarda sozinho uma cópia antes de apagar qualquer coisa, e não só antes das perdas grandes.',
      'Dá para apagar vários lançamentos de uma vez, sem confundir apagar com dispensar.',
    ],
  },
  {
    id: '2026-09-11-lote-nas-fixas',
    data: '2026-09-11',
    titulo: 'Apagar em lote as contas fixas e as compras parceladas',
    itens: [
      'O que já dava nos lançamentos passou a valer também nas duas outras listas.',
    ],
  },
  {
    id: '2026-09-10-cara-nova',
    data: '2026-09-10',
    titulo: 'Cara nova, e marcar pago arrastando',
    itens: [
      'Branco, azul e roxo, com tema claro e escuro.',
      'No celular, arrastar a linha para o lado marca como pago.',
      'Cada parcela passou a levar o próprio número no nome: "Geladeira 3/10".',
    ],
  },
  {
    id: '2026-09-10-quanto-posso-gastar',
    data: '2026-09-10',
    titulo: '"Quanto ainda posso gastar", e busca nas listas',
    itens: [
      'O painel responde direto quanto sobra, e quanto é por dia no resto do período.',
      'Cada número clicado leva à lista que o explica.',
      'Nada nasce pago: o lançamento entra como previsto e você confirma quando pagar.',
    ],
  },
  {
    id: '2026-09-08-relatorio-do-periodo',
    data: '2026-09-08',
    titulo: 'O período lido como um relatório de fechamento',
    itens: [
      'Entradas, saídas, o que ainda vai sair e o saldo do período, na ordem em que se lê um fechamento.',
      'A conta e o cartão do mesmo banco aparecem agrupados — sem somar o que não se soma.',
    ],
  },
  {
    id: '2026-09-08-csv-e-repetidos',
    data: '2026-09-08',
    titulo: 'Importar o CSV do banco sem deixar entrar nada duas vezes',
    itens: [
      'E, ao lançar à mão, o app pergunta antes de gravar o que já parece estar lançado.',
      'Dois gráficos novos: para onde o dinheiro foi, e como o saldo anda no período.',
    ],
  },
  {
    id: '2026-09-07-senha-e-recuperacao',
    data: '2026-09-07',
    titulo: 'Trocar a senha, e recuperar por e-mail',
    itens: [
      'Dá para trocar a senha estando logado, e recuperar o acesso por e-mail quando ela se perde.',
    ],
  },
  {
    id: '2026-09-05-sincronizar',
    data: '2026-09-05',
    titulo: 'A mesma carteira em todos os aparelhos',
    itens: [
      'Com login, o que se lança no celular aparece no computador e no aparelho de quem divide a carteira.',
      'O app ficou instalável: dá para pôr na tela inicial do celular e abrir como aplicativo, inclusive sem internet.',
    ],
  },
  {
    id: '2026-09-05-o-comeco',
    data: '2026-09-05',
    titulo: 'O começo',
    itens: [
      'Lançamentos avulsos, compras parceladas e contas que se repetem; contas, cartões e categorias; e tudo guardado no próprio aparelho.',
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
