/**
 * Seleção em lote para as listas de cadastro.
 *
 * A caixa de cada linha e a barra que aparece quando há algo selecionado.
 * Duas decisões que valem explicar:
 *
 * - **"Todos" é o que está na tela**, e não o que existe no banco. Com filtros
 *   ligados, um "selecionar tudo" que pegasse também o escondido seria uma
 *   armadilha: a pessoa vê três linhas, marca a caixa do cabeçalho e apaga
 *   trinta.
 * - **A barra diz o número o tempo todo.** É o que separa "apaguei o que
 *   queria" de "apaguei sem saber quanto".
 */

import type { ReactNode } from 'react';

export function useSelecaoVisivel(selecionados: ReadonlySet<string>, visiveis: readonly string[]) {
  const naTela = visiveis.filter((id) => selecionados.has(id));
  return {
    quantos: naTela.length,
    todosMarcados: visiveis.length > 0 && naTela.length === visiveis.length,
    algunsMarcados: naTela.length > 0 && naTela.length < visiveis.length,
  };
}

export function CaixaDeSelecao({
  marcada,
  rotulo,
  onChange,
}: {
  marcada: boolean;
  rotulo: string;
  onChange: () => void;
}) {
  return (
    <input
      type="checkbox"
      className="check-selecao"
      checked={marcada}
      aria-label={rotulo}
      // A linha inteira abre a edição; a caixa faz outra coisa.
      onClick={(event) => event.stopPropagation()}
      onChange={onChange}
    />
  );
}

export function CaixaDeCabecalho({
  todosMarcados,
  algunsMarcados,
  onChange,
}: {
  todosMarcados: boolean;
  algunsMarcados: boolean;
  onChange: () => void;
}) {
  return (
    <input
      type="checkbox"
      className="check-selecao"
      checked={todosMarcados}
      // O traço do meio diz "parte marcada" — sem ele, uma seleção parcial
      // parece nenhuma seleção.
      ref={(el) => {
        if (el) el.indeterminate = algunsMarcados;
      }}
      aria-label={todosMarcados ? 'Desmarcar todos os visíveis' : 'Selecionar todos os visíveis'}
      onClick={(event) => event.stopPropagation()}
      onChange={onChange}
    />
  );
}

export function BarraDeSelecao({
  quantos,
  singular,
  plural,
  // "conta selecionada" mas "lançamento selecionado": sem isto a barra saía
  // escrita "3 lançamentos selecionadas".
  genero = 'f',
  /**
   * Manter a barra na tela mesmo sem nada marcado.
   *
   * Nas listas que têm caixa no cabeçalho, a barra pode sumir quando não há
   * seleção — o "marcar todos" continua alcançável. Onde o marcar-todos mora
   * **dentro** da barra, sumir com ela seria um beco: não dá para marcar tudo
   * sem antes marcar um à mão. Foi exatamente o que aconteceu em Lançamentos.
   */
  sempreVisivel = false,
  onLimpar,
  onApagar,
  children,
}: {
  quantos: number;
  singular: string;
  plural: string;
  genero?: 'f' | 'm';
  sempreVisivel?: boolean;
  onLimpar: () => void;
  onApagar: () => void;
  children?: ReactNode;
}) {
  if (quantos === 0 && !sempreVisivel) return null;
  const marcado = `selecionad${genero === 'f' ? 'a' : 'o'}${quantos === 1 ? '' : 's'}`;
  const artigo = genero === 'f' ? (quantos === 1 ? 'a' : 'as') : quantos === 1 ? 'o' : 'os';

  return (
    <div className="barra-selecao" role="status">
      <strong>
        {quantos === 0 ? (
          <span className="dim">Toque nas linhas para selecionar</span>
        ) : (
          <>
            {quantos} {quantos === 1 ? singular : plural} {marcado}
          </>
        )}
      </strong>
      {children}
      <span className="spacer" />
      {quantos > 0 && (
        <button type="button" className="btn sm ghost" onClick={onLimpar}>
          Limpar seleção
        </button>
      )}
      <button type="button" className="btn sm danger" disabled={quantos === 0} onClick={onApagar}>
        {quantos === 0 ? 'Apagar' : `Apagar ${artigo} ${marcado}`}
      </button>
    </div>
  );
}
