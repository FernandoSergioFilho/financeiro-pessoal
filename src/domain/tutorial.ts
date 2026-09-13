/**
 * O tutorial, como dado e não como tela.
 *
 * Fica aqui, e não dentro do componente, por dois motivos. O primeiro é que
 * texto longo no meio de JSX vira uma parede que ninguém revisa. O segundo é
 * que assim dá para **testar**: que todo capítulo tem título e conteúdo, que
 * nenhum ficou vazio, que os identificadores não se repetem. Um tutorial com
 * um buraco no meio é pior do que nenhum, porque quem procurou ali desiste.
 *
 * **A ordem é a de quem está aprendendo, não a do menu.** Começa pelo que a
 * pessoa vai fazer no primeiro minuto e termina no que ela vai querer no
 * segundo mês. O capítulo do cartão vem cedo de propósito: é onde o app faz
 * uma coisa que quase nenhum outro faz, e não entender isso é achar que os
 * números estão errados.
 */

export interface Passo {
  /** O que fazer, em uma frase que começa com verbo. */
  titulo: string;
  /** O detalhe que a frase não coube, quando existe. */
  detalhe?: string;
}

export interface Capitulo {
  id: string;
  emoji: string;
  titulo: string;
  /** Uma frase dizendo a quem este capítulo serve. */
  resumo: string;
  passos: Passo[];
  /** O que vale saber e não é um passo — a regra por trás, a pegadinha. */
  nota?: string;
}

export const CAPITULOS: Capitulo[] = [
  {
    id: 'comecar',
    emoji: '🚀',
    titulo: 'Os primeiros cinco minutos',
    resumo: 'O mínimo para o app começar a responder alguma coisa.',
    passos: [
      {
        titulo: 'Cadastre suas contas em Ajustes',
        detalhe:
          'Conta corrente, poupança, dinheiro na carteira, cartões e investimentos. Em cada uma, '
          + 'ponha o saldo de hoje no campo de saldo inicial — é dali que toda conta parte. '
          + 'Nos cartões, preencha o dia de fechamento e o de vencimento: sem eles o app não sabe '
          + 'em que fatura cada compra cai.',
      },
      {
        titulo: 'Agrupe o cartão com a conta do mesmo banco',
        detalhe:
          'Ao cadastrar "Nubank cartão" tendo um "Nubank", o app oferece juntar os dois numa linha '
          + 'só. Os saldos continuam separados — o dinheiro que você tem e a fatura que você deve '
          + 'são coisas diferentes.',
      },
      {
        titulo: 'Lance o que se repete todo mês',
        detalhe:
          'Aluguel, escola, plano de saúde, assinaturas. Use "+ Novo lançamento" e a aba '
          + '"Recorrente". Cada uma é cadastrada uma vez e aparece sozinha todo mês, para sempre.',
      },
      {
        titulo: 'Importe o extrato do banco',
        detalhe:
          'Em Ajustes, "Importar do banco". É mais rápido do que digitar, e o app compara com o '
          + 'que você já lançou para não duplicar nada.',
      },
    ],
  },
  {
    id: 'lancar',
    emoji: '✏️',
    titulo: 'Lançar e confirmar',
    resumo: 'O dia a dia: registrar o que aconteceu e o que vai acontecer.',
    passos: [
      {
        titulo: 'Use o "+ Novo lançamento" para tudo',
        detalhe:
          'É a única porta, e tem três abas: Avulso (uma vez), Parcelado (uma compra que vira N '
          + 'parcelas) e Recorrente (a conta que volta todo mês).',
      },
      {
        titulo: 'Nada nasce pago',
        detalhe:
          'Todo lançamento entra como **em aberto**, mesmo com data no passado. O app nunca decide '
          + 'sozinho que o dinheiro saiu: quem diz que pagou é você, no ✓ da lista.',
      },
      {
        titulo: 'Confirme no ✓ redondo e verde',
        detalhe:
          'Ele é redondo e verde de propósito, para não se confundir com a caixinha quadrada de '
          + 'selecionar. No celular, arrastar a linha para o lado faz o mesmo.',
      },
      {
        titulo: 'Filtre por situação',
        detalhe:
          '"Confirmados" mostra o que de fato entrou e saiu; "Em aberto" mostra o que ainda está '
          + 'previsto. Todo número da tela respeita o filtro escolhido.',
      },
    ],
    nota:
      'Se você marcou muita coisa como paga por engano, Ajustes tem um "Desmarcar todos como '
      + 'pagos" que devolve tudo para "em aberto" de uma vez.',
  },
  {
    id: 'cartao',
    emoji: '💳',
    titulo: 'O cartão de crédito',
    resumo: 'A parte que o app faz diferente — e que, sem entender, parece erro.',
    passos: [
      {
        titulo: 'A compra aparece no mês em que a FATURA VENCE',
        detalhe:
          'Não no mês em que você comprou. Comprar dia 1º num cartão que fecha dia 1º é gastar um '
          + 'dinheiro que só sai dois meses depois, e é nesse mês que ele aparece. Este app é um '
          + 'fluxo de caixa: ele mostra quando o dinheiro sai da sua conta.',
      },
      {
        titulo: 'A etiqueta 💳 diz de quando é a compra',
        detalhe:
          'Na lista, a data grande é a do dinheiro saindo, e a etiqueta ao lado ("💳 15 set") diz '
          + 'quando a compra foi feita.',
      },
      {
        titulo: 'Ao lançar, o app avisa em que fatura cai',
        detalhe:
          'Escolhendo o cartão e a data, aparece "vai para a fatura que fecha em 01/10 e vence em '
          + '10/10". Compra feita no próprio dia do fechamento já é da fatura seguinte.',
      },
      {
        titulo: 'O saldo do cartão é o que você deve',
        detalhe:
          'Esse continua contando a partir da compra, e não do vencimento — é a dívida, e ela '
          + 'nasce quando você passa o cartão.',
      },
    ],
  },
  {
    id: 'importar',
    emoji: '🏦',
    titulo: 'Importar do banco',
    resumo: 'Cinco formatos, e nada entra sem você conferir.',
    passos: [
      {
        titulo: 'Mande CSV, planilha, PDF, print da tela ou texto colado',
        detalhe:
          'Em Ajustes, "Importar do banco". Extrato e fatura em PDF funcionam direto. Se o seu '
          + 'banco não exporta nada, copie a lista do aplicativo e use "Colar texto".',
      },
      {
        titulo: 'Confira linha por linha antes de importar',
        detalhe:
          'O que o app acha que já existe vem **desmarcado**. O que é novo vem marcado. Você '
          + 'decide o que entra.',
      },
      {
        titulo: 'Use a coluna "Vezes" para compras parceladas',
        detalhe:
          'Quando o banco escreve "Parcela 1/6" na descrição, o número já vem preenchido, e o app '
          + 'cria as seis parcelas nos meses seguintes.',
      },
    ],
    nota:
      'O PDF e a leitura de print não existem no arquivo `financeiro.html` avulso — eles pesam '
      + 'mais que o app inteiro. No site publicado funcionam normalmente.',
  },
  {
    id: 'painel',
    emoji: '◎',
    titulo: 'Ler o painel',
    resumo: 'O que cada número quer dizer, e qual deles decide o dia.',
    passos: [
      {
        titulo: '"Ainda posso gastar" é o número que importa',
        detalhe:
          'É o dinheiro que já estava nas contas, mais o que entra no período, menos o que já saiu '
          + 'e o que ainda vai sair. A conta de trás fica escrita embaixo, para você conferir.',
      },
      {
        titulo: '"Dinheiro disponível" é só o que dá para gastar',
        detalhe:
          'Conta corrente, poupança e carteira. O que está investido aparece ao lado, à parte — '
          + 'não é caixa deste mês.',
      },
      {
        titulo: 'O aviso vermelho diz em que dia o dinheiro acaba',
        detalhe:
          'Ele olha 90 dias à frente, independente do mês que você está vendo, e leva para os '
          + 'lançamentos daquele dia quando você toca nele.',
      },
      {
        titulo: 'Quase tudo no painel é clicável',
        detalhe:
          'Os cartões de Entradas e Saídas, o aviso de atrasados, cada fatura em aberto — todos '
          + 'levam para a lista já filtrada.',
      },
    ],
  },
  {
    id: 'analisar',
    emoji: '🔎',
    titulo: 'O botão Analisar',
    resumo: 'Quatro leituras diferentes dos mesmos números.',
    passos: [
      {
        titulo: 'Leitura — o fechamento do período',
        detalhe: 'Resultado, margem, o que fugiu do normal. Cada achado com o número que o sustenta.',
      },
      {
        titulo: 'O que fazer — onde há dinheiro a recuperar',
        detalhe:
          'Dinheiro parado rendendo zero, juros que você está pagando, tarifas, custo fixo subindo, '
          + 'assinaturas esquecidas. Cada um com o valor em reais por ano e o que fazer a respeito.',
      },
      {
        titulo: 'Números — a estatística crua',
        detalhe:
          'Doze meses por categoria: o típico, a tendência em reais por mês e a previsão. Serve '
          + 'para conferir a conclusão em vez de aceitá-la.',
      },
      {
        titulo: 'Levar a uma IA — o texto pronto para colar',
        detalhe:
          'O app monta o texto com os seus números organizados e você cola no ChatGPT ou no Claude. '
          + 'Ele não pergunta sozinho porque não tem servidor: a explicação inteira está na aba.',
      },
      {
        titulo: 'Ou configure uma chave e a resposta aparece aqui',
        detalhe:
          'Em Ajustes, "Perguntar a uma IA": colando uma chave do Google Gemini — que tem camada '
          + 'gratuita — o botão passa a perguntar e mostrar a resposta dentro do app. A chave fica '
          + 'só neste aparelho e não entra em backup nem na sincronização. Leia o aviso de lá antes: '
          + 'na camada gratuita o Google costuma usar o que você envia para treinar os modelos.',
      },
    ],
  },
  {
    id: 'investimentos',
    emoji: '📈',
    titulo: 'Investimentos',
    resumo: 'Aportar, resgatar e registrar o que rendeu.',
    passos: [
      {
        titulo: 'Cadastre a conta como tipo "Investimento"',
        detalhe: 'Corretora, Tesouro, CDB. Ela aparece na guia Investimentos, separada do caixa.',
      },
      {
        titulo: 'Aportar tira da conta e põe no investimento',
        detalhe: 'Sai do caixa do mês, como qualquer saída.',
      },
      {
        titulo: 'Rendimento NÃO conta como entrada do mês',
        detalhe:
          'O que o investimento rendeu engorda o patrimônio, mas não é dinheiro que entrou na sua '
          + 'conta. Ele vira caixa no dia em que você resgatar.',
      },
      {
        titulo: 'Cada conta mostra a conta que fecha',
        detalhe:
          'Abertura + aportado − resgatado + rendimento = saldo. É o que deixa conferir com o '
          + 'extrato da corretora.',
      },
    ],
  },
  {
    id: 'instalar',
    emoji: '📱',
    titulo: 'Instalar no celular ou tablet',
    resumo: 'Ele vira um app de verdade, com ícone na tela inicial e funcionando sem internet.',
    passos: [
      {
        titulo: 'Android: abra o site no Chrome e toque em "Instalar"',
        detalhe:
          'O próprio Chrome oferece. Se não oferecer, use o menu de três pontos → "Adicionar à tela '
          + 'inicial" ou "Instalar aplicativo".',
      },
      {
        titulo: 'iPhone e iPad: Safari → Compartilhar → "Adicionar à Tela de Início"',
        detalhe:
          'No iPhone só funciona pelo Safari — o Chrome do iPhone não instala. Depois de instalado, '
          + 'ele abre em tela cheia, sem a barra do navegador.',
      },
      {
        titulo: 'Depois de instalado, funciona sem internet',
        detalhe:
          'Os seus dados ficam no aparelho. A internet só é necessária para sincronizar entre '
          + 'aparelhos e para ler PDF ou print na importação.',
      },
      {
        titulo: 'Prefere um arquivo só?',
        detalhe:
          'Em Ajustes há como baixar o `financeiro.html`: um arquivo que abre com dois cliques, '
          + 'sem instalar nada e sem internet. Serve para guardar num pendrive.',
      },
    ],
    nota:
      'Instalado assim ele é um app de verdade — ícone, tela cheia, offline. Não é um APK: não '
      + 'passa pela Play Store nem precisa. Se um dia você quiser o APK mesmo, dá para gerar a '
      + 'partir deste site, mas não muda nada no uso.',
  },
  {
    id: 'seguranca',
    emoji: '🔒',
    titulo: 'Backup e sincronização',
    resumo: 'Onde os seus dados estão e como não perdê-los.',
    passos: [
      {
        titulo: 'Os dados ficam no seu aparelho',
        detalhe: 'Nada sai dele sozinho. Sem conta, sem servidor, sem ninguém olhando.',
      },
      {
        titulo: 'O app guarda cópias sozinho',
        detalhe:
          'Três: uma de rotina a cada 6 horas, uma antes de qualquer exclusão e uma antes de uma '
          + 'perda grande. Em Ajustes dá para ver, baixar e restaurar cada uma.',
      },
      {
        titulo: 'Baixe um backup de vez em quando',
        detalhe:
          'Em Ajustes, "Baixar backup". É um arquivo só, que restaura tudo. Limpar os dados do '
          + 'navegador apaga o app — o backup é o que protege disso.',
      },
      {
        titulo: 'Para usar em dois aparelhos, ligue a sincronização',
        detalhe:
          'Em Ajustes, entrando com e-mail e senha. Os dois aparelhos passam a ver a mesma '
          + 'carteira, e o que foi editado por último vence.',
      },
    ],
  },
];

/** O capítulo por id, para a tela abrir direto num assunto. */
export function capituloPorId(id: string): Capitulo | undefined {
  return CAPITULOS.find((c) => c.id === id);
}
