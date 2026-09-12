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
    .filter((l) => l !== '')
    .join('\n');
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
