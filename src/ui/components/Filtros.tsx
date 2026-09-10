/**
 * A barra de busca que Lançamentos, Fixas e Parcelas compartilham.
 *
 * As três listas fazem a mesma pergunta, então respondem com os mesmos
 * controles, na mesma ordem e com os mesmos rótulos. A regra de casamento é
 * pura e está em `domain/filtros.ts`.
 */

import type { ReactNode } from 'react';

import { filtroEstaVazio, type FiltroBasico } from '../../domain/filtros.ts';
import { useLookups } from '../../state/selectors.ts';

export function BarraDeFiltros({
  valor,
  onChange,
  placeholder = 'Buscar por descrição…',
  children,
}: {
  valor: FiltroBasico;
  onChange: (filtro: FiltroBasico) => void;
  placeholder?: string;
  /** Controles próprios da tela, à direita dos comuns. */
  children?: ReactNode;
}) {
  const { accounts, categories } = useLookups();
  const mexeu = !filtroEstaVazio(valor);

  return (
    <div className="row wrap filtros">
      <input
        className="input busca"
        type="search"
        placeholder={placeholder}
        value={valor.busca}
        onChange={(event) => onChange({ ...valor, busca: event.target.value })}
        aria-label={placeholder}
      />
      <select
        className="input select"
        value={valor.accountId}
        onChange={(event) => onChange({ ...valor, accountId: event.target.value })}
        aria-label="Filtrar por conta"
      >
        <option value="">Todas as contas</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.institution ? `${account.institution} · ${account.name}` : account.name}
          </option>
        ))}
      </select>
      <select
        className="input select"
        value={valor.categoryId}
        onChange={(event) => onChange({ ...valor, categoryId: event.target.value })}
        aria-label="Filtrar por categoria"
      >
        <option value="">Todas as categorias</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.emoji} {category.name}
          </option>
        ))}
      </select>
      {children}
      {mexeu && (
        <button type="button" className="btn sm ghost" onClick={() => onChange({ busca: '', accountId: '', categoryId: '' })}>
          Limpar
        </button>
      )}
    </div>
  );
}

/** "3 de 18" — para a tela dizer que está mostrando um recorte, e não tudo. */
export function ContagemFiltrada({
  mostrando,
  total,
  singular,
  plural,
}: {
  mostrando: number;
  total: number;
  singular: string;
  plural: string;
}) {
  return (
    <span className="dim num" style={{ fontSize: '0.82rem' }}>
      {mostrando === total
        ? `${total} ${total === 1 ? singular : plural}`
        : `${mostrando} de ${total} ${total === 1 ? singular : plural}`}
    </span>
  );
}
