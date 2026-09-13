/**
 * Falar com o Gemini a partir do navegador, com a chave do próprio usuário.
 *
 * **Onde a chave mora, e por que ali.** Numa entrada própria do `localStorage`,
 * como o tema — e **fora** do `FinanceData`. Isso não é detalhe de arrumação:
 * `FinanceData` é o que sincroniza para o Supabase e o que entra em todo
 * backup. Uma chave ali viajaria para um servidor e para dentro de arquivos
 * que a pessoa manda por e-mail sem pensar. Aqui ela fica no aparelho, e sai
 * dele só quando vai para o Google, que é o único destino que faz sentido.
 *
 * **Por que dá para chamar direto do navegador.** A API do Gemini aceita
 * chamada de página web com a chave na URL — é assim que ela foi desenhada.
 * Não há servidor no meio, e nada do texto passa por lugar nenhum além do
 * Google.
 *
 * **O que precisa estar dito na tela, e está.** Na camada gratuita, o Google
 * costuma usar o que é enviado para treinar os modelos; nos planos pagos, não.
 * O texto que o app monta leva totais, categorias, custo fixo e saldos —
 * nunca a descrição de um lançamento —, mas ainda assim é o retrato do
 * dinheiro de alguém. Quem decide é o dono dele, sabendo disso.
 *
 * **Os modelos não são uma lista fixa no código.** Nome de modelo envelhece, e
 * uma lista chumbada aqui quebraria calada no dia em que o Google aposentasse
 * um. O app pergunta à API quais existem e deixa escolher.
 */

const CHAVE = 'financeiro-pessoal:chave-gemini';
const MODELO = 'financeiro-pessoal:modelo-gemini';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** O que usar quando ainda não se escolheu nada — o mais barato e rápido. */
export const MODELO_PADRAO = 'models/gemini-flash-latest';

export function lerChave(): string {
  try {
    return window.localStorage.getItem(CHAVE) ?? '';
  } catch {
    // Janela anônima ou armazenamento bloqueado: sem chave, e a tela dirá.
    return '';
  }
}

export function guardarChave(chave: string): void {
  try {
    if (chave.trim() === '') window.localStorage.removeItem(CHAVE);
    else window.localStorage.setItem(CHAVE, chave.trim());
  } catch {
    // Nada a fazer: quem chama já trata o caso de a chave não persistir.
  }
}

export function lerModelo(): string {
  try {
    return window.localStorage.getItem(MODELO) || MODELO_PADRAO;
  } catch {
    return MODELO_PADRAO;
  }
}

export function guardarModelo(modelo: string): void {
  try {
    window.localStorage.setItem(MODELO, modelo);
  } catch {
    // Idem.
  }
}

export function temChave(): boolean {
  return lerChave() !== '';
}

export interface ModeloDisponivel {
  /** `models/gemini-flash-latest` — é o que a API espera de volta. */
  nome: string;
  /** "Gemini Flash Latest" — o que a pessoa lê. */
  rotulo: string;
}

/**
 * Traduz o erro da API para algo que diga o que fazer.
 *
 * A mensagem crua do Google é em inglês e fala de `API_KEY_INVALID` e
 * `RESOURCE_EXHAUSTED`. Quem está tentando usar o app não deveria precisar
 * procurar o que isso quer dizer.
 */
export function traduzirErroDeIA(status: number, corpo: string): string {
  const texto = corpo.toLowerCase();
  if (status === 400 && texto.includes('api key not valid')) {
    return 'Esta chave não foi aceita. Confira se copiou inteira, sem espaços no começo ou no fim.';
  }
  if (status === 403) {
    return (
      'O Google recusou a chave. Isso costuma ser restrição de origem na chave, ou a API '
      + 'Generative Language não estar ativada no projeto.'
    );
  }
  if (status === 429) {
    return (
      'Você bateu o limite da camada gratuita. Ela se renova sozinha — tente daqui a pouco, '
      + 'ou use um modelo mais leve.'
    );
  }
  if (status === 404) {
    return 'Este modelo não existe mais. Escolha outro na lista de Ajustes.';
  }
  if (status >= 500) return 'O serviço do Google respondeu com erro. Tente de novo em instantes.';
  return `O Google respondeu ${status}. ${corpo.slice(0, 200)}`;
}

async function aoFalhar(resposta: Response): Promise<never> {
  const corpo = await resposta.text().catch(() => '');
  throw new Error(traduzirErroDeIA(resposta.status, corpo));
}

/** Os modelos que a chave alcança e que sabem responder texto. */
export async function listarModelos(chave = lerChave()): Promise<ModeloDisponivel[]> {
  if (!chave) throw new Error('Sem chave configurada.');

  const resposta = await fetch(`${BASE}/models?key=${encodeURIComponent(chave)}`);
  if (!resposta.ok) await aoFalhar(resposta);

  const dados = (await resposta.json()) as {
    models?: { name?: string; displayName?: string; supportedGenerationMethods?: string[] }[];
  };

  return (dados.models ?? [])
    .filter((m) => m.name && (m.supportedGenerationMethods ?? []).includes('generateContent'))
    // Os de embedding e os de imagem não servem para perguntar nada.
    .filter((m) => !/embedding|aqa|imagen|veo|tts/i.test(m.name!))
    .map((m) => ({ nome: m.name!, rotulo: m.displayName || m.name!.replace('models/', '') }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo));
}

/** A chave funciona? Devolve a lista de modelos como prova. */
export async function testarChave(chave: string): Promise<ModeloDisponivel[]> {
  return listarModelos(chave);
}

export interface Resposta {
  texto: string;
  /** O modelo que de fato respondeu, para a tela poder dizer. */
  modelo: string;
}

/**
 * Faz a pergunta e devolve a resposta.
 *
 * `sinal` existe para a tela poder cancelar: a resposta leva de alguns segundos
 * a mais de um minuto, e quem fechou o diálogo não deve continuar pagando por
 * ela nem receber o resultado numa tela que não existe mais.
 */
export async function perguntar(
  texto: string,
  opcoes: { chave?: string; modelo?: string; sinal?: AbortSignal } = {},
): Promise<Resposta> {
  const chave = opcoes.chave ?? lerChave();
  const modelo = opcoes.modelo ?? lerModelo();
  if (!chave) throw new Error('Sem chave configurada.');

  const resposta = await fetch(
    `${BASE}/${modelo.replace(/^models\//, 'models/')}:generateContent?key=${encodeURIComponent(chave)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: texto }] }] }),
      signal: opcoes.sinal,
    },
  );
  if (!resposta.ok) await aoFalhar(resposta);

  const dados = (await resposta.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };

  if (dados.promptFeedback?.blockReason) {
    throw new Error(
      'O Google bloqueou este pedido pelos filtros de conteúdo dele. Isso costuma ser engano do '
      + 'filtro com texto financeiro; tente outro modelo ou outra pergunta.',
    );
  }

  const partes = dados.candidates?.[0]?.content?.parts ?? [];
  const saida = partes.map((p) => p.text ?? '').join('').trim();

  if (saida === '') {
    const motivo = dados.candidates?.[0]?.finishReason;
    throw new Error(
      motivo === 'MAX_TOKENS'
        ? 'A resposta foi cortada por tamanho antes de começar. Tente um modelo maior.'
        : 'O modelo respondeu vazio. Tente de novo, ou escolha outro modelo.',
    );
  }

  return { texto: saida, modelo };
}

/** Onde a pessoa cria a chave — dito num lugar só, para não divergir. */
export const ONDE_CRIAR_A_CHAVE = 'https://aistudio.google.com/apikey';
