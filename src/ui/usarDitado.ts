/**
 * Ditar em vez de digitar.
 *
 * O reconhecimento de fala é do próprio navegador — nada é enviado para
 * servidor deste app, não há chave de API nem custo, e funciona no Chrome e no
 * Edge do computador e do Android. É o único jeito de ditar sem mandar áudio
 * para um serviço pago.
 *
 * **O que este arquivo faz e o que não faz.** Aqui só se liga e desliga o
 * microfone e se junta o texto reconhecido. Entender a frase — achar o valor, a
 * data, a conta — é de `domain/fala.ts`, que é função pura e tem teste. Esta
 * camada não tem como ser testada no Vitest (o ambiente é Node, sem navegador),
 * então ela é deliberadamente burra: se algo aqui errar, erra na hora e à
 * vista.
 *
 * **Privacidade.** Em Chrome e Edge o áudio vai para os servidores do
 * fabricante do navegador para ser transcrito — é assim que a API funciona em
 * todos os sites que a usam. A tela diz isso antes de o microfone ligar.
 *
 * **Segurar para falar.** O microfone abre enquanto o botão está pressionado e
 * fecha quando se solta. É o gesto do rádio e dos aplicativos de mensagem, e
 * tem uma vantagem concreta sobre ligar e desligar com dois toques: não existe
 * o caso de esquecer o microfone aberto. Quem solta, encerrou.
 *
 * Duas folgas fazem isso funcionar na prática:
 *
 * - **Soltar antes de o microfone abrir não perde a frase.** Entre o toque e o
 *   `onstart` há um intervalo — na primeira vez, o tempo inteiro de o navegador
 *   pedir permissão. Soltar nesse meio tempo só marca a intenção; o fechamento
 *   acontece quando o microfone de fato abriu.
 * - **Uma sobra de 400 ms depois de soltar.** Quem fala solta o botão junto com
 *   a última sílaba, e sem a sobra ela se perde.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type EstadoDoDitado = 'indisponivel' | 'parado' | 'ouvindo';

/** O que dizer a quem acabou de soltar o botão: um erro ou só uma dica. */
export interface RecadoDoDitado {
  texto: string;
  tom: 'erro' | 'dica';
}

/**
 * Quanto tempo o microfone fica aberto no mínimo, contado de quando ele abriu
 * de verdade. Sem isso, a última sílaba se perde — e um toque sem querer
 * devolveria um erro em vez de nada.
 */
const MINIMO_OUVINDO = 400;

/**
 * Os dois jeitos de soltar sem lançar nada, que pedem respostas diferentes.
 *
 * Quem só tocou não ouviu nem o próprio eco: não houve som nenhum. Quem falou
 * e soltou cedo viu as palavras aparecerem na tela e sumirem — dizer a essa
 * pessoa que "não ouvi nada" seria desmentir o que ela acabou de ver.
 */
const NAO_OUVI: RecadoDoDitado = {
  texto: 'Não ouvi nada. Segure o botão enquanto fala e solte quando terminar.',
  tom: 'dica',
};
const SOLTOU_CEDO: RecadoDoDitado = {
  texto: 'Soltou antes de a frase fechar. Segure o botão até terminar de falar.',
  tom: 'dica',
};

interface ResultadoDaFala {
  readonly length: number;
  item(indice: number): { readonly 0: { transcript: string }; readonly isFinal: boolean };
}

interface EventoDeFala {
  resultIndex: number;
  results: ResultadoDaFala & { [indice: number]: { 0: { transcript: string }; isFinal: boolean } };
}

interface Reconhecedor {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult: ((evento: EventoDeFala) => void) | null;
  onerror: ((evento: { error: string }) => void) | null;
  onend: (() => void) | null;
}

/** Uma sessão de fala: o reconhecedor e o que se sabe sobre ela até agora. */
interface Sessao {
  reconhecedor: Reconhecedor;
  /** Quando o microfone abriu de fato; `null` enquanto não abriu. */
  abriuEm: number | null;
  /** O botão já foi solto? */
  soltou: boolean;
  /** O fechamento agendado, para não agendar dois. */
  relogio: ReturnType<typeof setTimeout> | null;
  /** Veio algum texto? Se não veio, a tela explica o gesto. */
  ouviu: boolean;
}

type ConstrutorDeReconhecedor = new () => Reconhecedor;

function construtor(): ConstrutorDeReconhecedor | null {
  if (typeof window === 'undefined') return null;
  const janela = window as unknown as {
    SpeechRecognition?: ConstrutorDeReconhecedor;
    webkitSpeechRecognition?: ConstrutorDeReconhecedor;
  };
  return janela.SpeechRecognition ?? janela.webkitSpeechRecognition ?? null;
}

/** Dá para ditar neste navegador? */
export function ditadoDisponivel(): boolean {
  return construtor() !== null;
}

const RECADOS: Record<string, RecadoDoDitado | null> = {
  'not-allowed': { texto: 'O navegador não liberou o microfone. Autorize no cadeado da barra de endereço.', tom: 'erro' },
  'service-not-allowed': { texto: 'O navegador não liberou o microfone. Autorize no cadeado da barra de endereço.', tom: 'erro' },
  'no-speech': NAO_OUVI,
  'audio-capture': { texto: 'Não achei microfone neste aparelho.', tom: 'erro' },
  network: { texto: 'O reconhecimento de fala precisa de internet.', tom: 'erro' },
  // Interrompido de propósito (outro ditado começou): não há o que dizer.
  aborted: null,
};

export interface Ditado {
  estado: EstadoDoDitado;
  /** O que está sendo ouvido agora, para a tela mostrar enquanto se fala. */
  parcial: string;
  recado: RecadoDoDitado | null;
  /** O botão foi pressionado: abre o microfone. */
  pressionar: () => void;
  /** O botão foi solto: fecha o microfone e entrega a frase. */
  soltar: () => void;
}

/**
 * `onTexto` recebe a frase inteira quando o microfone fecha.
 *
 * Fica numa ref porque o reconhecedor é criado uma vez e viveria com a versão
 * antiga da função: o formulário muda a cada tecla, e o texto cairia num estado
 * velho.
 */
export function usarDitado(onTexto: (texto: string) => void): Ditado {
  const [estado, setEstado] = useState<EstadoDoDitado>(() => (ditadoDisponivel() ? 'parado' : 'indisponivel'));
  const [parcial, setParcial] = useState('');
  const [recado, setRecado] = useState<RecadoDoDitado | null>(null);
  const sessao = useRef<Sessao | null>(null);
  const aoTexto = useRef(onTexto);
  aoTexto.current = onTexto;

  const encerrar = useCallback((atual: Sessao) => {
    if (atual.relogio) return; // já agendado
    const aberto = atual.abriuEm === null ? 0 : Date.now() - atual.abriuEm;
    atual.relogio = setTimeout(() => {
      atual.relogio = null;
      try {
        atual.reconhecedor.stop();
      } catch {
        // Já tinha encerrado por conta própria; nada a fazer.
      }
    }, Math.max(0, MINIMO_OUVINDO - aberto));
  }, []);

  const limpar = useCallback(() => {
    const atual = sessao.current;
    if (!atual) return;
    if (atual.relogio) clearTimeout(atual.relogio);
    atual.reconhecedor.abort();
    sessao.current = null;
  }, []);

  useEffect(() => () => limpar(), [limpar]);

  const pressionar = useCallback(() => {
    const Reconhecimento = construtor();
    if (!Reconhecimento) {
      setEstado('indisponivel');
      return;
    }
    // Pressionar com um ditado em andamento: o novo manda.
    limpar();
    setRecado(null);
    setParcial('');

    const reconhecedor = new Reconhecimento();
    reconhecedor.lang = 'pt-BR';
    // Uma frase por vez: o lançamento é uma frase, e `continuous` deixaria o
    // microfone aberto esperando a próxima, gastando bateria sem precisar.
    reconhecedor.continuous = false;
    reconhecedor.interimResults = true;
    reconhecedor.maxAlternatives = 1;

    const atual: Sessao = { reconhecedor, abriuEm: null, soltou: false, relogio: null, ouviu: false };

    let completo = '';
    reconhecedor.onstart = () => {
      atual.abriuEm = Date.now();
      // Soltou enquanto o microfone ainda abria — na primeira vez, enquanto o
      // navegador pedia permissão. A intenção estava guardada; agora vale.
      if (atual.soltou) encerrar(atual);
    };
    reconhecedor.onresult = (evento) => {
      let emAndamento = '';
      for (let i = evento.resultIndex; i < evento.results.length; i += 1) {
        const resultado = evento.results[i]!;
        if (resultado.isFinal) completo += `${resultado[0].transcript} `;
        else emAndamento += resultado[0].transcript;
      }
      const texto = (completo + emAndamento).trim();
      if (texto) atual.ouviu = true;
      setParcial(texto);
    };
    reconhecedor.onerror = (evento) => {
      const achado = evento.error in RECADOS ? RECADOS[evento.error]! : null;
      setRecado(achado ?? (evento.error === 'aborted' ? null : { texto: 'Não consegui ouvir. Tente de novo.', tom: 'erro' }));
    };
    reconhecedor.onend = () => {
      if (atual.relogio) clearTimeout(atual.relogio);
      if (sessao.current === atual) sessao.current = null;
      setEstado('parado');
      const texto = completo.trim();
      if (texto) {
        aoTexto.current(texto);
        return;
      }
      // Soltou e não veio frase: quase sempre é o toque curto de quem ainda
      // não sabe que precisa segurar. Dizer isso vale mais que o silêncio.
      setRecado((anterior) => anterior ?? (atual.ouviu ? SOLTOU_CEDO : NAO_OUVI));
    };

    try {
      reconhecedor.start();
      sessao.current = atual;
      setEstado('ouvindo');
    } catch {
      // `start()` numa instância já iniciada lança; nada a fazer além de
      // deixar a tela como estava.
      setEstado('parado');
    }
  }, [encerrar, limpar]);

  const soltar = useCallback(() => {
    const atual = sessao.current;
    if (!atual || atual.soltou) return;
    atual.soltou = true;
    // Antes de o microfone abrir não há o que fechar: `onstart` fará isso.
    if (atual.abriuEm !== null) encerrar(atual);
  }, [encerrar]);

  return { estado, parcial, recado, pressionar, soltar };
}
