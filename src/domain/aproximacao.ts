/**
 * Casar o que foi ouvido com um nome que já existe na carteira.
 *
 * O reconhecimento de fala escreve em português correto, e os nomes de
 * comércio não são português correto. Falar "comprão" devolve **comprão** — a
 * palavra do dicionário —, enquanto a carteira inteira tem **Komprão**, que é
 * o nome do mercado. São o mesmo lugar, soam igual, e para o app eram dois
 * lançamentos diferentes: a categoria não vinha, e a lista passava a ter duas
 * entradas para a mesma compra de todo sábado.
 *
 * **A comparação é por som, e só depois por letra.** Primeiro reduz os dois
 * nomes a uma forma fonética — onde `c`, `k` e `qu` viram a mesma coisa, `ç`,
 * `ss` e `z` também, e `h` some — e vê se batem. Isso resolve de uma vez
 * Komprão/comprão, açaí/assaí, farmácia/farmásia, e não depende de o erro ser
 * de uma letra só.
 *
 * Só se o som não bater é que entra a distância de edição, com folga
 * proporcional ao tamanho: nome curto não ganha folga nenhuma, porque com
 * três letras quase tudo fica perto de tudo.
 */

import { textoComparavel } from './similar.ts';
import type { NomeConhecido } from './memoria.ts';

/**
 * A forma como o nome soa, reduzida ao que distingue de verdade.
 *
 * Não é fonética de linguista: é o conjunto mínimo de trocas que o português
 * escrito faz sem mudar o som. A ordem das substituições importa — `ch` tem de
 * ser tratado antes de o `h` ser apagado, e o `c` antes de `e`/`i` antes de o
 * `c` geral virar `k`.
 */
export function chaveFonetica(valor: string): string {
  let texto = valor.toLowerCase();

  // O cedilha some na remoção de acentos (vira `c`), e `c` vira `k` logo
  // adiante — então ele tem de virar `s` antes disso.
  texto = texto.replace(/ç/g, 's');
  texto = textoComparavel(texto);

  texto = texto
    .replace(/ch/g, 'x')
    .replace(/lh/g, 'l')
    .replace(/nh/g, 'n')
    .replace(/ph/g, 'f')
    .replace(/qu([ei])/g, 'k$1')
    .replace(/q/g, 'k')
    .replace(/gu([ei])/g, 'g$1')
    .replace(/c([ei])/g, 's$1')
    .replace(/c/g, 'k')
    .replace(/ss/g, 's')
    .replace(/sc/g, 's')
    .replace(/z/g, 's')
    .replace(/w/g, 'v')
    .replace(/y/g, 'i')
    .replace(/h/g, '')
    // Letra dobrada não muda o som em português: "Bella" e "Bela".
    .replace(/(.)\1+/g, '$1');

  return texto.trim();
}

/** Distância de edição: quantas letras precisam mudar para um virar o outro. */
export function distancia(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Só duas linhas da matriz ficam vivas por vez.
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  let atual = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    atual[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      atual[j] = Math.min(anterior[j]! + 1, atual[j - 1]! + 1, anterior[j - 1]! + custo);
    }
    [anterior, atual] = [atual, anterior];
  }
  return anterior[b.length]!;
}

/**
 * Quantas letras de folga um nome deste tamanho pode ter.
 *
 * Nenhuma até cinco letras: com "luz" e "sul" a dois passos de distância, dar
 * folga a nome curto é trocar um nome certo por outro certo. De seis letras em
 * diante, uma a cada cinco, até três — o bastante para um erro de digitação ou
 * de transcrição, pouco para confundir "Mercado" com "Mercearia".
 */
export function folga(tamanho: number): number {
  if (tamanho < 6) return 0;
  return Math.min(3, Math.floor(tamanho / 5));
}

export interface NomeAproximado {
  /** O nome como já está escrito na carteira. */
  nome: string;
  /** `exato`: já era igual. `som`: soa igual. `parecido`: letras por perto. */
  motivo: 'exato' | 'som' | 'parecido';
}

/**
 * O nome já usado que corresponde ao que foi ouvido — se houver um.
 *
 * Devolve `null` quando nada chega perto, e aí o que foi ouvido vale como
 * está: inventar um nome parecido seria pior que aceitar um nome novo.
 *
 * Empate de distância é desfeito pelo mais usado, que `nomesConhecidos` já
 * entrega primeiro na lista.
 */
export function aproximarNome(
  ouvido: string,
  conhecidos: readonly NomeConhecido[],
): NomeAproximado | null {
  const alvo = textoComparavel(ouvido);
  if (!alvo) return null;

  const exato = conhecidos.find((c) => c.chave === alvo);
  if (exato) return { nome: exato.nome, motivo: 'exato' };

  const somDoAlvo = chaveFonetica(ouvido);
  if (somDoAlvo) {
    const porSom = conhecidos.find((c) => chaveFonetica(c.nome) === somDoAlvo);
    if (porSom) return { nome: porSom.nome, motivo: 'som' };
  }

  const limite = folga(alvo.length);
  if (limite === 0) return null;

  let melhor: NomeConhecido | null = null;
  let menor = limite + 1;
  for (const candidato of conhecidos) {
    // Tamanhos distantes demais não valem a conta: a diferença de tamanho já é
    // um piso para a distância.
    if (Math.abs(candidato.chave.length - alvo.length) > limite) continue;
    const quanto = distancia(alvo, candidato.chave);
    if (quanto < menor) {
      menor = quanto;
      melhor = candidato;
    }
  }
  return melhor ? { nome: melhor.nome, motivo: 'parecido' } : null;
}
