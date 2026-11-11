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
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type EstadoDoDitado = 'indisponivel' | 'parado' | 'ouvindo';

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
  onresult: ((evento: EventoDeFala) => void) | null;
  onerror: ((evento: { error: string }) => void) | null;
  onend: (() => void) | null;
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

const RECADOS: Record<string, string> = {
  'not-allowed': 'O navegador não liberou o microfone. Autorize no cadeado da barra de endereço.',
  'service-not-allowed': 'O navegador não liberou o microfone. Autorize no cadeado da barra de endereço.',
  'no-speech': 'Não ouvi nada. Toque e fale logo em seguida.',
  'audio-capture': 'Não achei microfone neste aparelho.',
  network: 'O reconhecimento de fala precisa de internet.',
  aborted: '',
};

export interface Ditado {
  estado: EstadoDoDitado;
  /** O que está sendo ouvido agora, para a tela mostrar enquanto se fala. */
  parcial: string;
  erro: string;
  comecar: () => void;
  parar: () => void;
}

/**
 * `onTexto` recebe a frase inteira quando a pessoa para de falar.
 *
 * Fica numa ref porque o reconhecedor é criado uma vez e viveria com a versão
 * antiga da função: o formulário muda a cada tecla, e o texto cairia num estado
 * velho.
 */
export function usarDitado(onTexto: (texto: string) => void): Ditado {
  const [estado, setEstado] = useState<EstadoDoDitado>(() => (ditadoDisponivel() ? 'parado' : 'indisponivel'));
  const [parcial, setParcial] = useState('');
  const [erro, setErro] = useState('');
  const reconhecedor = useRef<Reconhecedor | null>(null);
  const aoTexto = useRef(onTexto);
  aoTexto.current = onTexto;

  useEffect(() => () => reconhecedor.current?.abort(), []);

  const comecar = useCallback(() => {
    const Reconhecimento = construtor();
    if (!Reconhecimento) {
      setEstado('indisponivel');
      return;
    }
    reconhecedor.current?.abort();
    setErro('');
    setParcial('');

    const instancia = new Reconhecimento();
    instancia.lang = 'pt-BR';
    // Uma frase por vez: o lançamento é uma frase, e `continuous` deixaria o
    // microfone aberto esperando a próxima, gastando bateria sem precisar.
    instancia.continuous = false;
    instancia.interimResults = true;
    instancia.maxAlternatives = 1;

    let completo = '';
    instancia.onresult = (evento) => {
      let emAndamento = '';
      for (let i = evento.resultIndex; i < evento.results.length; i += 1) {
        const resultado = evento.results[i]!;
        if (resultado.isFinal) completo += `${resultado[0].transcript} `;
        else emAndamento += resultado[0].transcript;
      }
      setParcial((completo + emAndamento).trim());
    };
    instancia.onerror = (evento) => {
      setErro(RECADOS[evento.error] ?? 'Não consegui ouvir. Tente de novo.');
    };
    instancia.onend = () => {
      setEstado('parado');
      const texto = completo.trim();
      if (texto) aoTexto.current(texto);
    };

    try {
      instancia.start();
      reconhecedor.current = instancia;
      setEstado('ouvindo');
    } catch {
      // `start()` numa instância já iniciada lança; nada a fazer além de
      // deixar a tela como estava.
      setEstado('parado');
    }
  }, []);

  const parar = useCallback(() => {
    reconhecedor.current?.stop();
  }, []);

  return { estado, parcial, erro, comecar, parar };
}
