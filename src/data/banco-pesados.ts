/**
 * Os dois leitores caros: PDF e imagem.
 *
 * Ficam num arquivo à parte, carregado **sob demanda**, porque custam mais do
 * que o app inteiro. O `financeiro.html` tem 640 kB; só o pdf.js tem mais do
 * que isso, e o reconhecimento de texto baixa alguns megabytes de modelo de
 * idioma. Nada disso pode pesar na abertura de quem só quer ver o saldo — então
 * o `import()` acontece no clique, e não no carregamento.
 *
 * **O que cada um consegue ler, dito sem otimismo:**
 *
 * - **PDF**: extratos e faturas gerados pelo banco, que são PDF de texto. O PDF
 *   que é foto de papel digitalizado não tem texto nenhum dentro, e para esse o
 *   caminho é a leitura de imagem — o leitor detecta e diz isso.
 * - **Imagem**: print da tela do aplicativo do banco. Texto de tela é limpo e
 *   de alto contraste, que é o melhor caso possível para reconhecimento; ainda
 *   assim ele **erra**, e erra em dígito, que é o pior lugar. Por isso o
 *   resultado nunca é gravado direto: cai na mesma tela de conferência linha a
 *   linha, e é ali que a pessoa confirma.
 *
 * O `src/data/banco-pesados-ausente.ts` é o substituto do build de arquivo
 * único, onde estes dois não existem — inliná-los faria o `financeiro.html`
 * passar de 20 MB para nada, já que quem abre um arquivo solto do disco tem o
 * CSV à mão.
 */

/** O texto de um PDF, uma string por linha visual da página. */
export async function textoDoPdf(arquivo: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  // O worker é o mesmo arquivo do pacote, servido pelo próprio site: não há
  // CDN no caminho, e nada do extrato sai do navegador.
  pdfjs.GlobalWorkerOptions.workerSrc = (
    await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  ).default;

  const doc = await pdfjs.getDocument({ data: arquivo }).promise;
  const paginas: string[] = [];

  for (let n = 1; n <= doc.numPages; n += 1) {
    const pagina = await doc.getPage(n);
    const conteudo = await pagina.getTextContent();
    paginas.push(agruparEmLinhas(conteudo.items as ItemDeTexto[]));
  }

  const texto = paginas.join('\n');
  if (texto.replace(/\s/g, '') === '') {
    throw new Error(
      'Este PDF não tem texto dentro — é uma imagem digitalizada. Mande o print ou a foto '
      + 'direto como imagem, que o app tenta ler por reconhecimento de texto.',
    );
  }
  return texto;
}

interface ItemDeTexto {
  str: string;
  /** `[a, b, c, d, x, y]`, onde 4 e 5 são a posição na página. */
  transform: number[];
  /** Largura do pedaço na página, usada para achar as colunas. */
  width?: number;
}

/**
 * Parece um lançamento? Data, **nome**, e valor com centavos, nessa ordem.
 *
 * Exigir o nome fecha a porta para "02/04 15,77" — a coluna de parcela ao lado
 * da de valor — passar por lançamento e transformar o vão entre descrição e
 * valor num corte de coluna.
 *
 * Na prática a prova por faixa, logo abaixo, já barra esse caso sozinha: as
 * duas guardas se cobrem, e foi com as duas ausentes que a fatura saiu partida
 * em três. Fica assim mesmo, porque "um lançamento tem nome" é verdade por si,
 * e não uma defesa contra um caso específico.
 */
const PARECE_LANCAMENTO = /\d{1,2}[/.-]\d{1,2}\s.*[A-Za-zÀ-ÿ]{3}.*\d,\d{2}/;

/**
 * Onde a página se divide em colunas.
 *
 * A fatura do Santander imprime **duas colunas de lançamentos lado a lado**, e
 * agrupar só pela altura funde as duas numa linha só:
 *
 *     16/07 JIM COM* PAULA CRISTI -0,02   18/07 IFD*RAIA DROGASIL 02/04 15,77
 *     └───────── um lançamento ────────┘  └───────── outro lançamento ───────┘
 *
 * O resultado seria um lançamento com a data de um e o valor do outro — pior do
 * que não importar, porque parece certo.
 *
 * A detecção é geral, e não uma regra para um banco: procura faixas verticais
 * onde **nenhum** texto da página aparece, largas o bastante para serem um
 * vão de coluna. O que impede o falso positivo é a prova seguinte: um corte só
 * vale se os dois lados, sozinhos, tiverem linhas que parecem lançamento. O vão
 * entre a descrição e o valor também é vazio, mas cortar ali deixaria datas de
 * um lado e números do outro — e nenhum dos dois passa na prova.
 */
export function acharColunas(itens: readonly ItemDeTexto[]): number[] {
  const pontos = itens
    .filter((i) => i.str && i.str.trim() !== '')
    .map((i) => ({ de: i.transform[4] ?? 0, ate: (i.transform[4] ?? 0) + (i.width ?? i.str.length * 4) }));
  if (pontos.length < 10) return [];

  const inicio = Math.min(...pontos.map((p) => p.de));
  const fim = Math.max(...pontos.map((p) => p.ate));
  const largura = fim - inicio;
  if (largura <= 0) return [];

  // Um vão de coluna é largo; o espaço entre duas palavras não é.
  const minimo = Math.max(18, largura * 0.04);

  const ocupado = new Uint8Array(Math.ceil(largura) + 2);
  for (const p of pontos) {
    for (let x = Math.floor(p.de - inicio); x <= Math.ceil(p.ate - inicio); x += 1) {
      if (x >= 0 && x < ocupado.length) ocupado[x] = 1;
    }
  }

  const candidatos: number[] = [];
  let vazioDesde = -1;
  for (let x = 0; x < ocupado.length; x += 1) {
    if (ocupado[x] === 0) {
      if (vazioDesde === -1) vazioDesde = x;
    } else {
      if (vazioDesde !== -1 && x - vazioDesde >= minimo) {
        candidatos.push(inicio + (vazioDesde + x) / 2);
      }
      vazioDesde = -1;
    }
  }

  /*
   * A prova, faixa a faixa e não metade a metade.
   *
   * Olhar "tudo à esquerda" contra "tudo à direita" deixava passar um corte
   * ruim dentro da segunda coluna: a esquerda continuava cheia de lançamentos
   * completos e carregava a aprovação. O que vale é a **faixa** que o corte
   * cria — dela para a fronteira anterior, e dela para o fim.
   */
  const aceitos: number[] = [];
  let anterior = -Infinity;
  for (const corte of candidatos) {
    const faixa = itens.filter((i) => {
      const x = i.transform[4] ?? 0;
      return x >= anterior && x < corte;
    });
    const resto = itens.filter((i) => (i.transform[4] ?? 0) >= corte);
    if (quantosLancamentos(faixa) >= 2 && quantosLancamentos(resto) >= 2) {
      aceitos.push(corte);
      anterior = corte;
    }
  }
  return aceitos;
}

function quantosLancamentos(itens: readonly ItemDeTexto[]): number {
  return emLinhas(itens, 3).filter((l) => PARECE_LANCAMENTO.test(l)).length;
}

/** Agrupa por altura e ordena cada linha pela horizontal. */
function emLinhas(itens: readonly ItemDeTexto[], tolerancia: number): string[] {
  const linhas: { y: number; itens: { x: number; str: string }[] }[] = [];
  for (const item of itens) {
    if (!item.str || item.str.trim() === '') continue;
    const x = item.transform[4] ?? 0;
    const y = item.transform[5] ?? 0;
    const existente = linhas.find((l) => Math.abs(l.y - y) <= tolerancia);
    if (existente) existente.itens.push({ x, str: item.str });
    else linhas.push({ y, itens: [{ x, str: item.str }] });
  }
  return linhas
    // De cima para baixo: no PDF o y cresce para cima, ao contrário da leitura.
    .sort((a, b) => b.y - a.y)
    .map((linha) =>
      linha.itens
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((l) => l !== '');
}

/**
 * Junta os pedaços de texto do PDF em linhas.
 *
 * O PDF não guarda linhas: guarda pedacinhos de texto com uma posição cada. A
 * data, a descrição e o valor de um mesmo lançamento são três itens separados,
 * e sem reagrupar por altura eles chegariam como três "linhas" diferentes —
 * nenhuma delas com data e valor juntos, que é o que o leitor precisa.
 *
 * A tolerância existe porque o mesmo texto raramente está no mesmo pixel: fonte
 * de tamanhos diferentes na mesma linha desloca a base em alguns décimos.
 */
export function agruparEmLinhas(itens: readonly ItemDeTexto[], tolerancia = 3): string {
  const colunas = acharColunas(itens);
  if (colunas.length === 0) return emLinhas(itens, tolerancia).join('\n');

  // Coluna por coluna, inteira, antes de passar para a seguinte — que é como
  // se lê uma página de jornal, e como a fatura foi diagramada.
  const limites = [-Infinity, ...colunas, Infinity];
  const partes: string[] = [];
  for (let c = 0; c < limites.length - 1; c += 1) {
    const daColuna = itens.filter((i) => {
      const x = i.transform[4] ?? 0;
      return x >= limites[c]! && x < limites[c + 1]!;
    });
    partes.push(...emLinhas(daColuna, tolerancia));
  }
  return partes.join('\n');
}

/**
 * O texto de uma imagem, por reconhecimento óptico.
 *
 * `aoProgredir` recebe de 0 a 1: o reconhecimento leva de alguns segundos a
 * mais de um minuto no celular, e uma tela parada nesse tempo parece travada.
 */
export async function textoDaImagem(
  arquivo: File | Blob,
  aoProgredir?: (fracao: number) => void,
): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  // O modelo de português vem da rede na primeira vez e fica no cache do
  // navegador. Quem chama avisa disso antes de começar.
  const worker = await createWorker('por', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') aoProgredir?.(m.progress);
    },
  });
  try {
    const { data } = await worker.recognize(arquivo);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
