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
 * **Dois toques: um começa, outro encerra.** Chegou a ser "segure para falar",
 * e voltou a ser toque por pedido de quem usa — é o gesto do botão de ditar do
 * próprio Claude, e não exige manter o dedo parado enquanto se pensa na frase.
 *
 * **O silêncio não encerra.** Esta é a parte que o navegador não entrega de
 * graça: o reconhecimento de fala fecha sozinho depois de alguns segundos sem
 * som, e fechava o ditado junto — quem parava para pensar no valor voltava e
 * já não estava mais gravando. Agora, quando ele fecha sozinho, o app abre de
 * novo na hora e **continua somando no mesmo texto**. Só o segundo toque
 * encerra de verdade. É assim que funciona o botão de áudio do Claude, e foi
 * pedido para ser assim aqui.
 *
 * Duas folgas continuam valendo, e não são do gesto, são do reconhecedor:
 *
 * - **Encerrar antes de o microfone abrir não perde a frase.** Entre o toque e
 *   o `onstart` há um intervalo — na primeira vez, o tempo inteiro de o
 *   navegador pedir permissão. Tocar em "Parar" nesse meio tempo só marca a
 *   intenção; o fechamento acontece quando o microfone de fato abriu.
 * - **Uma sobra de 400 ms depois de mandar parar.** Quem fala costuma tocar no
 *   botão junto com a última sílaba, e sem a sobra ela se perde.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type EstadoDoDitado = 'indisponivel' | 'parado' | 'ouvindo';

/** O que dizer a quem acabou de encerrar: um erro ou só uma dica. */
export interface RecadoDoDitado {
  texto: string;
  tom: 'erro' | 'dica';
}

/**
 * Quanto tempo o microfone fica aberto no mínimo, contado de quando ele abriu
 * de verdade. Sem isso, a última sílaba se perde.
 */
const MINIMO_OUVINDO = 400;

/**
 * Teto para o microfone aberto, contado do primeiro toque.
 *
 * Um ditado é uma frase; cinco minutos é folga de sobra até para quem para no
 * meio e pensa. O teto existe para o caso de a pessoa sair de perto com a
 * gravação ligada — num celular, um microfone esquecido aberto come bateria
 * em silêncio. Quando ele chega, o app encerra e **diz** que encerrou, em vez
 * de simplesmente parar de ouvir.
 */
const LIMITE_DE_FALA = 5 * 60 * 1000;

/**
 * Religar depois de o reconhecedor fechar sozinho é o normal. Religar e fechar
 * de novo na mesma hora, muitas vezes seguidas, é defeito — microfone perdido,
 * aba em segundo plano — e aí o laço precisa parar em vez de girar.
 */
const RECOMECOS_SEGUIDOS = 5;
const RAPIDO_DEMAIS = 300;

/**
 * Os dois jeitos de encerrar sem lançar nada, que pedem respostas diferentes.
 *
 * Quem ligou e desligou sem falar não produziu som nenhum. Quem falou e parou
 * cedo viu as palavras aparecerem na tela e sumirem — dizer a essa pessoa que
 * "não ouvi nada" seria desmentir o que ela acabou de ver.
 */
const NAO_OUVI: RecadoDoDitado = {
  texto: 'Não ouvi nada. Toque em Ditar, fale, e toque em Parar quando terminar.',
  tom: 'dica',
};
const DEU_O_TEMPO: RecadoDoDitado = {
  texto: 'Encerrei depois de cinco minutos gravando. Toque em Ditar para recomeçar.',
  tom: 'dica',
};
const SE_PERDEU: RecadoDoDitado = {
  texto: 'O microfone fechou sozinho e não voltou. Toque em Ditar para tentar de novo.',
  tom: 'erro',
};
const PAROU_CEDO: RecadoDoDitado = {
  texto: 'Parou antes de a frase fechar. Fale a frase inteira antes de tocar em Parar.',
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
  /** Já mandaram encerrar? */
  soltou: boolean;
  /** O fechamento agendado, para não agendar dois. */
  relogio: ReturnType<typeof setTimeout> | null;
  /** O teto de cinco minutos. */
  teto: ReturnType<typeof setTimeout> | null;
  /** Veio algum texto? Se não veio, a tela explica o gesto. */
  ouviu: boolean;
  /** Quando o trecho atual do reconhecimento começou. */
  trechoDesde: number;
  /** Quantas vezes ele fechou e voltou sem nada acontecer no meio. */
  recomecos: number;
  /** Erro que não adianta religar: permissão negada, microfone ausente. */
  fatal: boolean;
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
  // Silêncio não é erro: o app religa o reconhecedor e segue ouvindo. Só
  // vira recado no fim, se não tiver vindo frase nenhuma.
  'no-speech': null,
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
  /** Primeiro toque: abre o microfone. */
  comecar: () => void;
  /** Segundo toque: fecha o microfone e entrega a frase. */
  parar: () => void;
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
    if (atual.teto) clearTimeout(atual.teto);
    // Antes do `abort`: senão o `onend` dele acharia que foi queda e religaria.
    atual.soltou = true;
    sessao.current = null;
    atual.reconhecedor.abort();
  }, []);

  useEffect(() => () => limpar(), [limpar]);

  const comecar = useCallback(() => {
    const Reconhecimento = construtor();
    if (!Reconhecimento) {
      setEstado('indisponivel');
      return;
    }
    // Começar com um ditado em andamento: o novo manda.
    limpar();
    setRecado(null);
    setParcial('');

    const reconhecedor = new Reconhecimento();
    reconhecedor.lang = 'pt-BR';
    // Verdadeiro, para o reconhecedor não encerrar na primeira pausa da fala.
    // Não basta: ele fecha sozinho de todo jeito depois de um tempo calado, e
    // é o `onend` abaixo que o levanta de novo.
    reconhecedor.continuous = true;
    reconhecedor.interimResults = true;
    reconhecedor.maxAlternatives = 1;

    const atual: Sessao = {
      reconhecedor, abriuEm: null, soltou: false, relogio: null, teto: null,
      ouviu: false, trechoDesde: Date.now(), recomecos: 0, fatal: false,
    };

    let completo = '';
    reconhecedor.onstart = () => {
      atual.trechoDesde = Date.now();
      if (atual.abriuEm !== null) return; // é um recomeço; o resto já foi feito
      atual.abriuEm = Date.now();
      atual.teto = setTimeout(() => {
        if (atual.soltou) return;
        setRecado(DEU_O_TEMPO);
        atual.soltou = true;
        encerrar(atual);
      }, LIMITE_DE_FALA);
      // Mandaram parar enquanto o microfone ainda abria — na primeira vez,
      // enquanto o navegador pedia permissão. A intenção estava guardada.
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
      if (texto) {
        atual.ouviu = true;
        // Veio som: o laço de proteção contra religar à toa se desfaz.
        atual.recomecos = 0;
      }
      setParcial(texto);
    };
    reconhecedor.onerror = (evento) => {
      // Permissão negada e microfone ausente não melhoram religando.
      if (evento.error === 'not-allowed' || evento.error === 'service-not-allowed'
        || evento.error === 'audio-capture') {
        atual.fatal = true;
      }
      const conhecido = evento.error in RECADOS;
      const achado = conhecido ? RECADOS[evento.error]! : null;
      if (conhecido) {
        if (achado) setRecado(achado);
        return;
      }
      setRecado({ texto: 'Não consegui ouvir. Tente de novo.', tom: 'erro' });
    };
    reconhecedor.onend = () => {
      /*
       * O reconhecedor fecha em dois casos, e eles pedem coisas opostas.
       *
       * Fechou porque mandaram parar: é o fim, entrega a frase. Fechou
       * sozinho — o que ele faz depois de alguns segundos calado, mesmo com
       * `continuous` ligado — e ninguém mandou parar: abre de novo, na hora,
       * guardando o que já foi dito. Para quem está falando, nada aconteceu.
       */
      if (!atual.soltou && !atual.fatal && sessao.current === atual) {
        atual.recomecos = Date.now() - atual.trechoDesde < RAPIDO_DEMAIS ? atual.recomecos + 1 : 0;
        if (atual.recomecos < RECOMECOS_SEGUIDOS) {
          try {
            reconhecedor.start();
            return;
          } catch {
            // Não voltou; cai no encerramento abaixo, com o recado.
          }
        }
        setRecado(SE_PERDEU);
      }

      if (atual.relogio) clearTimeout(atual.relogio);
      if (atual.teto) clearTimeout(atual.teto);
      if (sessao.current === atual) sessao.current = null;
      setEstado('parado');
      const texto = completo.trim();
      if (texto) {
        aoTexto.current(texto);
        return;
      }
      // Encerrou e não veio frase. Dizer o que fazer vale mais que o silêncio.
      setRecado((anterior) => anterior ?? (atual.ouviu ? PAROU_CEDO : NAO_OUVI));
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

  const parar = useCallback(() => {
    const atual = sessao.current;
    if (!atual || atual.soltou) return;
    atual.soltou = true;
    // Antes de o microfone abrir não há o que fechar: `onstart` fará isso.
    if (atual.abriuEm !== null) encerrar(atual);
  }, [encerrar]);

  return { estado, parcial, recado, comecar, parar };
}
