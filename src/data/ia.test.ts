import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MODELO_PADRAO, guardarChave, guardarModelo, lerChave, lerModelo, listarModelos,
  perguntar, temChave, traduzirErroDeIA,
} from './ia.ts';

/** Um localStorage de mentira, já que o ambiente de teste é Node. */
function memoria() {
  const mapa = new Map<string, string>();
  return {
    getItem: (k: string) => mapa.get(k) ?? null,
    setItem: (k: string, v: string) => { mapa.set(k, v); },
    removeItem: (k: string) => { mapa.delete(k); },
    mapa,
  };
}

let armazem = memoria();

beforeEach(() => {
  armazem = memoria();
  vi.stubGlobal('window', { localStorage: armazem });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('onde a chave mora', () => {
  it('guarda e lê, tirando espaço sobrando', () => {
    guardarChave('  AIza-exemplo  ');
    expect(lerChave()).toBe('AIza-exemplo');
    expect(temChave()).toBe(true);
  });

  it('guardar vazio apaga a chave', () => {
    guardarChave('AIza-exemplo');
    guardarChave('   ');
    expect(lerChave()).toBe('');
    expect(temChave()).toBe(false);
  });

  /*
   * A prova que importa. `FinanceData` é o que sincroniza para o Supabase e o
   * que entra em todo backup — uma chave ali viajaria para um servidor e para
   * dentro de arquivos que a pessoa manda por e-mail sem pensar.
   */
  it('a chave fica fora dos dados da carteira', () => {
    guardarChave('AIza-exemplo');
    expect([...armazem.mapa.keys()]).not.toContain('financeiro-pessoal');
    expect([...armazem.mapa.keys()].every((k) => k.includes('gemini'))).toBe(true);
  });

  it('sem armazenamento nenhum, não quebra — só não tem chave', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => { throw new Error('bloqueado'); },
        setItem: () => { throw new Error('bloqueado'); },
        removeItem: () => { throw new Error('bloqueado'); },
      },
    });
    expect(lerChave()).toBe('');
    expect(() => guardarChave('x')).not.toThrow();
  });

  it('o modelo tem um padrão e dá para trocar', () => {
    expect(lerModelo()).toBe(MODELO_PADRAO);
    guardarModelo('models/outro');
    expect(lerModelo()).toBe('models/outro');
  });
});

describe('traduzirErroDeIA', () => {
  /*
   * A mensagem crua do Google é em inglês e fala de API_KEY_INVALID. Quem está
   * tentando usar o app não deveria precisar procurar o que isso quer dizer.
   */
  it('chave errada vira instrução, não código', () => {
    const texto = traduzirErroDeIA(400, '{"error":{"message":"API key not valid"}}');
    expect(texto).toContain('copiou inteira');
    expect(texto).not.toContain('API_KEY');
  });

  it('limite da camada gratuita diz que se renova', () => {
    expect(traduzirErroDeIA(429, 'RESOURCE_EXHAUSTED')).toContain('renova');
  });

  it('modelo aposentado manda escolher outro', () => {
    expect(traduzirErroDeIA(404, 'not found')).toContain('Escolha outro');
  });

  it('erro do servidor não culpa o usuário', () => {
    expect(traduzirErroDeIA(503, 'unavailable')).toContain('Google');
  });
});

describe('listarModelos', () => {
  /*
   * Nome de modelo envelhece. Uma lista chumbada no código quebraria calada no
   * dia em que o Google aposentasse um — por isso o app pergunta.
   */
  it('fica só com os que sabem responder texto', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      models: [
        { name: 'models/gemini-flash-latest', displayName: 'Gemini Flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/text-embedding-004', displayName: 'Embedding', supportedGenerationMethods: ['embedContent'] },
        { name: 'models/imagen-3', displayName: 'Imagen', supportedGenerationMethods: ['generateContent'] },
      ],
    }), { status: 200 })));

    const modelos = await listarModelos('AIza');
    expect(modelos.map((m) => m.nome)).toEqual(['models/gemini-flash-latest']);
  });

  it('sem chave, não chama a rede', async () => {
    const rede = vi.fn();
    vi.stubGlobal('fetch', rede);
    await expect(listarModelos('')).rejects.toThrow(/Sem chave/);
    expect(rede).not.toHaveBeenCalled();
  });
});

describe('perguntar', () => {
  it('devolve o texto da resposta', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Você gastou demais em setembro.' }] } }],
    }), { status: 200 })));

    const r = await perguntar('oi', { chave: 'AIza', modelo: 'models/x' });
    expect(r.texto).toBe('Você gastou demais em setembro.');
  });

  it('junta as partes quando a resposta vem picada', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Parte 1. ' }, { text: 'Parte 2.' }] } }],
    }), { status: 200 })));

    expect((await perguntar('oi', { chave: 'AIza' })).texto).toBe('Parte 1. Parte 2.');
  });

  /*
   * O filtro de conteúdo do Google às vezes se engana com texto financeiro.
   * Devolver vazio faria a tela parecer quebrada.
   */
  it('bloqueio pelo filtro vira explicação', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      promptFeedback: { blockReason: 'SAFETY' },
    }), { status: 200 })));

    await expect(perguntar('oi', { chave: 'AIza' })).rejects.toThrow(/filtros de conteúdo/);
  });

  it('resposta vazia não passa por resposta', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }],
    }), { status: 200 })));

    await expect(perguntar('oi', { chave: 'AIza' })).rejects.toThrow(/cortada por tamanho/);
  });

  it('a chave vai na URL e o texto no corpo — e mais nada', async () => {
    const rede = vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'ok' }] } }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', rede);

    await perguntar('os meus números', { chave: 'AIza-secreta', modelo: 'models/x' });
    const [url, init] = rede.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('AIza-secreta');
    expect(url).toContain('models/x:generateContent');
    expect(JSON.parse(String(init.body))).toEqual({
      contents: [{ role: 'user', parts: [{ text: 'os meus números' }] }],
    });
  });
});
