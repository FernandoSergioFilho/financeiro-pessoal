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
  onLimpar,
  onApagar,
  children,
}: {
  quantos: number;
  singular: string;
  plural: string;
  onLimpar: () => void;
  onApagar: () => void;
  children?: ReactNode;
}) {
  if (quantos === 0) return null;
  return (
    <div className="barra-selecao" role="status">
      <strong>
        {quantos} {quantos === 1 ? singular : plural} {quantos === 1 ? 'selecionada' : 'selecionadas'}
      </strong>
      {children}
      <span className="spacer" />
      <button type="button" className="btn sm ghost" onClick={onLimpar}>
        Limpar seleção
      </button>
      <button type="button" className="btn sm danger" onClick={onApagar}>
        Apagar {quantos === 1 ? 'a selecionada' : 'as selecionadas'}
      </button>
    </div>
  );
}
