import { describe, expect, it } from 'vitest';
import { buildPurchase, corrigirNomesDeParcelas, descricaoDaParcela, descricaoSemMarcaDeParcela, parcelasComNomeErrado, installmentLabel, purchaseProgress } from './installments.ts';
import type { Entry, FinanceData } from './types.ts';

function ids() {
  let n = 0;
  return () => `id${++n}`;
}

const draft = {
  description: 'Notebook',
  totalAmount: 450000,
  installments: 10,
  firstDate: '2026-03-15',
  accountId: 'cartao',
  categoryId: 'eletronicos',
};

describe('buildPurchase', () => {
  it('gera uma parcela por mês, na mesma data-base', () => {
    const { entries } = buildPurchase(draft, ids());
    expect(entries).toHaveLength(10);
    expect(entries.map((e) => e.date).slice(0, 3)).toEqual(['2026-03-15', '2026-04-15', '2026-05-15']);
    expect(entries.at(-1)!.date).toBe('2026-12-15');
  });

  it('mantém a soma das parcelas igual ao total da compra', () => {
    const { entries } = buildPurchase({ ...draft, totalAmount: 99999, installments: 7 }, ids());
    expect(entries.reduce((sum, e) => sum + e.amount, 0)).toBe(99999);
  });

  it('numera as parcelas e liga todas à mesma compra', () => {
    const { purchase, entries } = buildPurchase(draft, ids());
    expect(entries.map((e) => e.installmentNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(entries.every((e) => e.installmentTotal === 10)).toBe(true);
    expect(entries.every((e) => e.purchaseId === purchase.id)).toBe(true);
  });

  it('encolhe o dia nos meses curtos', () => {
    const { entries } = buildPurchase({ ...draft, firstDate: '2026-01-31', installments: 3 }, ids());
    expect(entries.map((e) => e.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  /*
   * Regressão. Antes, parcela com data no passado nascia "paga": o app
   * concluía sozinho que data vencida significa dinheiro que saiu. Não
   * significa — a compra pode ter sido cancelada, a fatura pode não ter sido
   * paga — e a pessoa via como quitado o que ainda devia. Quem diz que pagou
   * é quem pagou.
   */
  it('nenhuma parcela nasce paga, nem as de data já vencida', () => {
    const vencidas = buildPurchase({ ...draft, firstDate: '2020-01-10', installments: 3 }, ids());
    expect(vencidas.entries.every((e) => e.status === 'pending')).toBe(true);

    const futuras = buildPurchase({ ...draft, firstDate: '2099-01-10', installments: 3 }, ids());
    expect(futuras.entries.every((e) => e.status === 'pending')).toBe(true);
  });

  it('lança toda parcela como despesa na conta escolhida', () => {
    const { entries } = buildPurchase(draft, ids());
    expect(entries.every((e) => e.kind === 'expense' && e.accountId === 'cartao')).toBe(true);
  });
});

describe('purchaseProgress', () => {
  it('resume o quanto já foi pago e o que falta', () => {
    const { purchase, entries } = buildPurchase({ ...draft, totalAmount: 30000, installments: 3 }, ids());
    const mixed: Entry[] = entries.map((e, i) => ({ ...e, status: i === 0 ? 'settled' : 'pending' }));

    expect(purchaseProgress(purchase, mixed)).toEqual({
      paid: 1,
      total: 3,
      paidAmount: 10000,
      remainingAmount: 20000,
      nextDate: '2026-04-15',
    });
  });

  it('não aponta próxima parcela quando tudo está pago', () => {
    const { purchase, entries } = buildPurchase({ ...draft, installments: 2 }, ids());
    const paid: Entry[] = entries.map((e) => ({ ...e, status: 'settled' }));
    expect(purchaseProgress(purchase, paid).nextDate).toBeNull();
  });

  it('ignora lançamentos de outras compras', () => {
    const { purchase, entries } = buildPurchase({ ...draft, installments: 2 }, ids());
    const outro: Entry = { ...entries[0]!, id: 'x', purchaseId: 'outra', amount: 999999 };
    expect(purchaseProgress(purchase, [...entries, outro]).total).toBe(2);
  });
});

describe('installmentLabel', () => {
  it('descreve a posição da parcela', () => {
    const { entries } = buildPurchase(draft, ids());
    expect(installmentLabel(entries[2]!)).toBe('3/10');
  });

  it('devolve null para lançamento avulso', () => {
    const { entries } = buildPurchase(draft, ids());
    const avulso: Entry = { ...entries[0]!, installmentNumber: null, installmentTotal: null };
    expect(installmentLabel(avulso)).toBeNull();
  });
});

describe('descricaoSemMarcaDeParcela', () => {
  /*
   * O caso que motivou isto: o extrato do Nubank traz "Nina Saude Floripa -
   * Parcela 1/10". Guardado como nome da compra, as dez parcelas ficavam
   * chamadas "Parcela 1/10" — a segunda dizia 1/10 no nome e 2/10 na
   * etiqueta, contradizendo a si mesma.
   */
  it('tira a marca do banco e o traço que sobrou', () => {
    expect(descricaoSemMarcaDeParcela('Nina Saude Floripa - Parcela 1/10')).toBe('Nina Saude Floripa');
    expect(descricaoSemMarcaDeParcela('MAGAZINE LUIZA 2/10')).toBe('MAGAZINE LUIZA');
    expect(descricaoSemMarcaDeParcela('Loja X (4/8)')).toBe('Loja X');
    expect(descricaoSemMarcaDeParcela('Netshoes — parcelada 3 de 12')).toBe('Netshoes');
  });

  it('não mexe em quem não tem marca nenhuma', () => {
    expect(descricaoSemMarcaDeParcela('Geladeira')).toBe('Geladeira');
    expect(descricaoSemMarcaDeParcela('Assinatura 2026')).toBe('Assinatura 2026');
  });

  it('descrição que era só a marca não vira vazio', () => {
    expect(descricaoSemMarcaDeParcela('Parcela 1/10')).toBe('Parcela 1/10');
  });

  it('normaliza o espaço que sobra no meio', () => {
    expect(descricaoSemMarcaDeParcela('Loja  1/6  centro')).toBe('Loja centro');
  });
});

describe('descricaoDaParcela', () => {
  it('numera a partir do nome limpo, sem repetir a marca', () => {
    expect(descricaoDaParcela('Nina Saude Floripa - Parcela 1/10', 3, 10)).toBe('Nina Saude Floripa 3/10');
    expect(descricaoDaParcela('Geladeira', 1, 10)).toBe('Geladeira 1/10');
  });
});

describe('buildPurchase — nomes', () => {
  const ids = () => {
    let n = 0;
    return () => `id${(n += 1)}`;
  };
  const base = {
    description: 'Nina Saude Floripa - Parcela 1/10',
    totalAmount: 100000,
    installments: 10,
    firstDate: '2026-09-06',
    accountId: 'cartao',
    categoryId: null,
  };

  it('a compra fica com o nome do estabelecimento, sem o número', () => {
    expect(buildPurchase(base, ids()).purchase.description).toBe('Nina Saude Floripa');
  });

  it('cada parcela diz qual é, e bate com a própria etiqueta', () => {
    const { entries } = buildPurchase(base, ids());
    for (const entry of entries) {
      expect(entry.description).toBe(`Nina Saude Floripa ${entry.installmentNumber}/${entry.installmentTotal}`);
    }
  });

  it('nenhuma parcela repete o texto de outra', () => {
    const nomes = buildPurchase(base, ids()).entries.map((e) => e.description);
    expect(new Set(nomes).size).toBe(nomes.length);
  });
});

describe('corrigirNomesDeParcelas', () => {
  const STAMP = '2026-01-01T00:00:00.000Z';
  const AGORA = '2026-09-10T12:00:00.000Z';

  function carteiraComCompra(descricao: string, nomesDasParcelas: string[]): FinanceData {
    return {
      version: 2,
      accounts: [],
      categories: [],
      purchases: [
        {
          id: 'p1', description: descricao, totalAmount: 100000, installments: nomesDasParcelas.length,
          firstDate: '2026-09-06', accountId: 'a1', categoryId: null, createdAt: STAMP, updatedAt: STAMP,
        },
      ],
      entries: nomesDasParcelas.map((nome, i) => ({
        id: `e${i}`, date: '2026-09-06', description: nome, amount: 10000, kind: 'expense',
        accountId: 'a1', toAccountId: null, categoryId: null, status: 'pending',
        recurringId: null, occurrenceDate: null, purchaseId: 'p1',
        installmentNumber: i + 1, installmentTotal: nomesDasParcelas.length,
        createdAt: STAMP, updatedAt: STAMP,
      })) as Entry[],
      recurring: [],
      tombstones: [],
    };
  }

  /* O caso relatado: dez parcelas, todas chamadas "Parcela 1/10". */
  it('reescreve cada parcela com o próprio número', () => {
    const errado = 'Nina Saude Floripa - Parcela 1/10';
    const data = carteiraComCompra(errado, Array.from({ length: 10 }, () => errado));
    const { data: novo, parcelas, compras } = corrigirNomesDeParcelas(data, AGORA);

    expect(compras).toBe(1);
    expect(parcelas).toBe(10);
    expect(novo.purchases[0]!.description).toBe('Nina Saude Floripa');
    expect(novo.entries.map((e) => e.description)).toEqual(
      Array.from({ length: 10 }, (_, i) => `Nina Saude Floripa ${i + 1}/10`),
    );
  });

  it('carimba updatedAt só no que mudou — senão a sincronização reenvia à toa', () => {
    // A parcela 1 já se chamava "Loja 1/2" por coincidência: fica intacta.
    const data = carteiraComCompra('Loja 1/2', ['Loja 1/2', 'Loja 1/2']);
    const { data: novo, parcelas } = corrigirNomesDeParcelas(data, AGORA);

    expect(parcelas).toBe(1);
    expect(novo.entries[0]!.description).toBe('Loja 1/2');
    expect(novo.entries[0]!.updatedAt).toBe(STAMP);
    expect(novo.entries[1]!.description).toBe('Loja 2/2');
    expect(novo.entries[1]!.updatedAt).toBe(AGORA);
  });

  it('carteira já certa não é tocada', () => {
    const data = carteiraComCompra('Geladeira', ['Geladeira 1/2', 'Geladeira 2/2']);
    const resultado = corrigirNomesDeParcelas(data, AGORA);
    expect(resultado).toMatchObject({ parcelas: 0, compras: 0 });
    expect(resultado.data).toBe(data);
  });

  it('aplicar de novo não muda mais nada', () => {
    const errado = 'Nina - Parcela 1/3';
    const data = carteiraComCompra(errado, [errado, errado, errado]);
    const primeira = corrigirNomesDeParcelas(data, AGORA);
    const segunda = corrigirNomesDeParcelas(primeira.data, AGORA);
    expect(segunda.parcelas).toBe(0);
    expect(segunda.data).toBe(primeira.data);
  });

  it('lançamento avulso não é parcela e fica quieto', () => {
    const data = carteiraComCompra('Geladeira', ['Geladeira 1/1']);
    data.entries.push({
      id: 'solto', date: '2026-09-06', description: 'Padaria 2/10', amount: 500, kind: 'expense',
      accountId: 'a1', toAccountId: null, categoryId: null, status: 'pending',
      recurringId: null, occurrenceDate: null, purchaseId: null,
      installmentNumber: null, installmentTotal: null, createdAt: STAMP, updatedAt: STAMP,
    } as Entry);
    const { data: novo } = corrigirNomesDeParcelas(data, AGORA);
    expect(novo.entries.find((e) => e.id === 'solto')!.description).toBe('Padaria 2/10');
  });

  it('conta quantas estão erradas sem mexer em nada', () => {
    const errado = 'Nina - Parcela 1/3';
    const data = carteiraComCompra(errado, [errado, errado, errado]);
    expect(parcelasComNomeErrado(data)).toBe(3);
    expect(data.entries[1]!.description).toBe(errado); // intacta
  });
});
