import { describe, expect, it } from 'vitest';

import type { DisplayEntry, Entry } from '../domain/types.ts';
import { csvToEntries, entriesToCsv, parseCsv, parseDataCsv, type ImportContext } from './exchange.ts';

/* ------------------------------------------------------------- montagem */

const CONTAS = new Map([
  ['conta corrente', 'acc-1'],
  ['cartao de credito', 'acc-2'],
]);
const CATEGORIAS = new Map([
  ['alimentacao', 'cat-1'],
  ['moradia', 'cat-2'],
]);

const chave = (v: string) =>
  v.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function contexto(idsExistentes: string[] = []): ImportContext {
  return {
    contaPorNome: (nome) => CONTAS.get(chave(nome)),
    categoriaPorNome: (nome) => CATEGORIAS.get(chave(nome)),
    idsExistentes: new Set(idsExistentes),
  };
}

const NOMES = {
  accountName: (id: string | null | undefined) =>
    id === 'acc-1' ? 'Conta corrente' : id === 'acc-2' ? 'Cartão de crédito' : '—',
  categoryName: (id: string | null | undefined) =>
    id === 'cat-1' ? 'Alimentação' : id === 'cat-2' ? 'Moradia' : 'Sem categoria',
};

function lancamento(patch: Partial<Entry> = {}): Entry {
  return {
    id: 'e1',
    date: '2026-09-07',
    description: 'Supermercado',
    amount: 12345,
    kind: 'expense',
    accountId: 'acc-1',
    categoryId: 'cat-1',
    status: 'settled',
    createdAt: '2026-09-07T10:00:00.000Z',
    updatedAt: '2026-09-07T10:00:00.000Z',
    ...patch,
  };
}

const cabecalho = 'Data;Descrição;Categoria;Conta;Destino;Tipo;Situação;Valor;Parcela;Recorrente;ID';

/* --------------------------------------------------------------- leitura */

describe('parseCsv', () => {
  it('separa por ponto e vírgula', () => {
    expect(parseCsv('a;b;c')).toEqual([['a', 'b', 'c']]);
  });

  it('respeita o separador dentro de aspas — senão as colunas embaralham', () => {
    const linhas = parseCsv('Data;Descrição\n2026-09-07;"Padaria; a da esquina"');
    expect(linhas[1]).toEqual(['2026-09-07', 'Padaria; a da esquina']);
  });

  it('entende aspas dobradas e quebra de linha dentro da célula', () => {
    const linhas = parseCsv('A;B\r\n1;"diz ""oi""\ne pula"');
    expect(linhas[1]).toEqual(['1', 'diz "oi"\ne pula']);
  });

  it('ignora o BOM que o Excel escreve', () => {
    expect(parseCsv('﻿Data;Valor')[0]).toEqual(['Data', 'Valor']);
  });

  it('descarta linhas em branco no fim do arquivo', () => {
    expect(parseCsv('a;b\r\n1;2\r\n\r\n')).toHaveLength(2);
  });
});

describe('parseDataCsv', () => {
  it('aceita o formato que o app exporta', () => {
    expect(parseDataCsv('2026-09-07')).toBe('2026-09-07');
  });

  // O Excel reformata a coluna de data ao abrir e salvar; recusar isso
  // quebraria justamente o caminho que o usuário percorre.
  it('aceita o formato que o Excel devolve', () => {
    expect(parseDataCsv('07/09/2026')).toBe('2026-09-07');
    expect(parseDataCsv('7/9/2026')).toBe('2026-09-07');
  });

  it('recusa data impossível', () => {
    expect(parseDataCsv('31/02/2026')).toBeNull();
    expect(parseDataCsv('amanhã')).toBeNull();
  });
});

/* ------------------------------------------------------------ importação */

describe('csvToEntries', () => {
  it('lê uma linha completa', () => {
    const csv = `${cabecalho}\n07/09/2026;Padaria;Alimentação;Conta corrente;;Saída;Efetivado;-28,00;;;`;
    const r = csvToEntries(csv, contexto());

    expect(r.problemas).toEqual([]);
    expect(r.novos).toHaveLength(1);
    expect(r.novos[0]).toMatchObject({
      date: '2026-09-07',
      description: 'Padaria',
      // Guardado sempre positivo: o sinal mora no `kind`.
      amount: 2800,
      kind: 'expense',
      accountId: 'acc-1',
      categoryId: 'cat-1',
      status: 'settled',
    });
  });

  it('deduz o tipo pelo sinal quando a coluna Tipo está vazia', () => {
    const csv = `${cabecalho}\n07/09/2026;Salário;;Conta corrente;;;;5.000,00;;;\n07/09/2026;Luz;;Conta corrente;;;;-210,50;;;`;
    const r = csvToEntries(csv, contexto());

    expect(r.problemas).toEqual([]);
    expect(r.novos.map((n) => [n.kind, n.amount])).toEqual([
      ['income', 500000],
      ['expense', 21050],
    ]);
  });

  it('aceita nome de conta e categoria sem acento e em outra caixa', () => {
    const csv = `${cabecalho}\n07/09/2026;Feira;ALIMENTACAO;conta corrente;;Saída;Efetivado;-30,00;;;`;
    const r = csvToEntries(csv, contexto());
    expect(r.problemas).toEqual([]);
    expect(r.novos[0]).toMatchObject({ accountId: 'acc-1', categoryId: 'cat-1' });
  });

  it('deixa sem categoria quando a coluna está vazia', () => {
    const csv = `${cabecalho}\n07/09/2026;Diversos;;Conta corrente;;Saída;Efetivado;-10,00;;;`;
    expect(csvToEntries(csv, contexto()).novos[0]?.categoryId).toBeNull();
  });

  it('encontra as colunas pelo cabeçalho, em qualquer ordem', () => {
    const csv = 'Valor;Data;Descrição;Conta\n-15,00;07/09/2026;Café;Conta corrente';
    const r = csvToEntries(csv, contexto());
    expect(r.problemas).toEqual([]);
    expect(r.novos[0]).toMatchObject({ description: 'Café', amount: 1500, kind: 'expense' });
  });

  it('lê a transferência com a conta de destino', () => {
    const csv = `${cabecalho}\n07/09/2026;Pagamento;;Conta corrente;Cartão de crédito;Transferência;Efetivado;500,00;;;`;
    const r = csvToEntries(csv, contexto());
    expect(r.problemas).toEqual([]);
    expect(r.novos[0]).toMatchObject({ kind: 'transfer', accountId: 'acc-1', toAccountId: 'acc-2' });
  });

  /* ---- o que faz o reenvio do próprio arquivo ser seguro ---- */

  it('ignora as linhas cujo ID o aplicativo já tem', () => {
    const csv = `${cabecalho}\n07/09/2026;Padaria;;Conta corrente;;Saída;Efetivado;-28,00;;;e1`;
    const r = csvToEntries(csv, contexto(['e1']));
    expect(r.novos).toHaveLength(0);
    expect(r.jaExistiam).toBe(1);
  });

  it('ignora ocorrência de conta recorrente sem lançamento gravado', () => {
    const csv = `${cabecalho}\n07/09/2026;Aluguel;Moradia;Conta corrente;;Saída;Previsto;-1.800,00;;Sim;`;
    const r = csvToEntries(csv, contexto());
    expect(r.novos).toHaveLength(0);
    expect(r.recorrentes).toBe(1);
  });

  it('exportar e reenviar sem mexer não traz nada de novo', () => {
    const entries: DisplayEntry[] = [
      lancamento({ id: 'e1' }),
      lancamento({ id: 'e2', description: 'Aluguel', categoryId: 'cat-2', recurringId: 'r1' }),
      // Uma projeção: sai sem ID e marcada como recorrente.
      { ...lancamento({ id: 'r1:2026-10-10', recurringId: 'r1' }), projected: true },
    ];
    const csv = entriesToCsv(entries, NOMES);
    const r = csvToEntries(csv, contexto(['e1', 'e2']));

    expect(r.problemas).toEqual([]);
    expect(r.novos).toEqual([]);
    expect(r.jaExistiam).toBe(2);
    expect(r.recorrentes).toBe(1);
  });

  it('traz só as linhas acrescentadas à planilha exportada', () => {
    const csv = `${entriesToCsv([lancamento({ id: 'e1' })], NOMES)}\r\n08/09/2026;Cinema;;Conta corrente;;Saída;Efetivado;-64,00;;;`;
    const r = csvToEntries(csv, contexto(['e1']));

    expect(r.jaExistiam).toBe(1);
    expect(r.novos).toHaveLength(1);
    expect(r.novos[0]).toMatchObject({ description: 'Cinema', amount: 6400 });
  });

  /* ---- erros: cada linha ruim é relatada, e o resto continua ---- */

  it('relata o problema com o número da linha e importa o resto', () => {
    const csv = [
      cabecalho,
      '07/09/2026;Boa;;Conta corrente;;Saída;Efetivado;-10,00;;;',
      '99/99/2026;Data ruim;;Conta corrente;;Saída;Efetivado;-10,00;;;',
      '07/09/2026;Conta que não existe;;Poupança;;Saída;Efetivado;-10,00;;;',
      '07/09/2026;Outra boa;;Conta corrente;;Saída;Efetivado;-20,00;;;',
    ].join('\n');
    const r = csvToEntries(csv, contexto());

    expect(r.novos.map((n) => n.description)).toEqual(['Boa', 'Outra boa']);
    expect(r.problemas.map((p) => p.linha)).toEqual([3, 4]);
    expect(r.problemas[1]?.motivo).toContain('Poupança');
  });

  it('recusa valor vazio ou zero em vez de gravar um lançamento sem efeito', () => {
    const csv = `${cabecalho}\n07/09/2026;Sem valor;;Conta corrente;;Saída;Efetivado;;;;\n07/09/2026;Zero;;Conta corrente;;Saída;Efetivado;0,00;;;`;
    const r = csvToEntries(csv, contexto());
    expect(r.novos).toHaveLength(0);
    expect(r.problemas).toHaveLength(2);
  });

  it('recusa categoria inexistente em vez de criar uma parecida', () => {
    const csv = `${cabecalho}\n07/09/2026;Feira;Alimentaçao e bebida;Conta corrente;;Saída;Efetivado;-10,00;;;`;
    const r = csvToEntries(csv, contexto());
    expect(r.novos).toHaveLength(0);
    expect(r.problemas[0]?.motivo).toContain('não existe');
  });

  it('recusa transferência sem destino válido', () => {
    const csv = `${cabecalho}\n07/09/2026;Pagamento;;Conta corrente;;Transferência;Efetivado;100,00;;;\n07/09/2026;Igual;;Conta corrente;Conta corrente;Transferência;Efetivado;100,00;;;`;
    const r = csvToEntries(csv, contexto());
    expect(r.novos).toHaveLength(0);
    expect(r.problemas).toHaveLength(2);
  });

  it('explica quando o cabeçalho não é o da planilha', () => {
    const r = csvToEntries('Coluna A;Coluna B\n1;2', contexto());
    expect(r.novos).toHaveLength(0);
    expect(r.problemas[0]?.motivo).toContain('Data, Descrição e Valor');
  });

  it('não quebra com arquivo vazio', () => {
    const r = csvToEntries('', contexto());
    expect(r.novos).toHaveLength(0);
    expect(r.problemas).toHaveLength(1);
  });
});
