import { describe, expect, it } from 'vitest';

import { addMonths, today } from './date.ts';
import {
  FIM_DOS_TEMPOS,
  INICIO_DOS_TEMPOS,
  ehPeriodoAtual,
  intervaloDoPeriodo,
  limiteDaPrevisao,
  mesesDoPeriodo,
  moverPeriodo,
  periodoDoMes,
  podeMover,
  rotuloCurto,
  rotuloDoPeriodo,
  trimestreDe,
  trocarGrao,
  type Periodo,
} from './period.ts';

const em = (grao: Periodo['grao'], ancora = '2026-09-08'): Periodo => ({ grao, ancora });

describe('intervaloDoPeriodo', () => {
  it('dia começa e termina no mesmo dia', () => {
    expect(intervaloDoPeriodo(em('dia'))).toEqual({ de: '2026-09-08', ate: '2026-09-08' });
  });

  it('mês vai do dia 1 ao último, respeitando fevereiro', () => {
    expect(intervaloDoPeriodo(em('mes', '2026-02-15'))).toEqual({ de: '2026-02-01', ate: '2026-02-28' });
    expect(intervaloDoPeriodo(em('mes', '2028-02-15'))).toEqual({ de: '2028-02-01', ate: '2028-02-29' });
  });

  it('trimestre pega os três meses certos', () => {
    expect(intervaloDoPeriodo(em('trimestre', '2026-01-05'))).toEqual({ de: '2026-01-01', ate: '2026-03-31' });
    expect(intervaloDoPeriodo(em('trimestre', '2026-09-08'))).toEqual({ de: '2026-07-01', ate: '2026-09-30' });
    expect(intervaloDoPeriodo(em('trimestre', '2026-12-31'))).toEqual({ de: '2026-10-01', ate: '2026-12-31' });
  });

  it('ano vai de janeiro a dezembro', () => {
    expect(intervaloDoPeriodo(em('ano', '2026-06-06'))).toEqual({ de: '2026-01-01', ate: '2026-12-31' });
  });

  // O motivo de "tudo" existir: era o que faltava para enxergar um lançamento
  // lançado para daqui a oito meses, ou de dois anos atrás.
  it('tudo abraça qualquer data', () => {
    expect(intervaloDoPeriodo(em('tudo'))).toEqual({ de: INICIO_DOS_TEMPOS, ate: FIM_DOS_TEMPOS });
  });

  it('livre usa as pontas informadas', () => {
    expect(intervaloDoPeriodo({ grao: 'livre', ancora: '2026-09-08', de: '2026-03-01', ate: '2026-05-31' }))
      .toEqual({ de: '2026-03-01', ate: '2026-05-31' });
  });

  it('livre com uma ponta só continua valendo', () => {
    expect(intervaloDoPeriodo({ grao: 'livre', ancora: '2026-09-08', de: '2026-03-01' }))
      .toEqual({ de: '2026-03-01', ate: FIM_DOS_TEMPOS });
    expect(intervaloDoPeriodo({ grao: 'livre', ancora: '2026-09-08', ate: '2026-03-01' }))
      .toEqual({ de: INICIO_DOS_TEMPOS, ate: '2026-03-01' });
  });

  it('livre com as datas trocadas se endireita em vez de não mostrar nada', () => {
    expect(intervaloDoPeriodo({ grao: 'livre', ancora: '2026-09-08', de: '2026-05-31', ate: '2026-03-01' }))
      .toEqual({ de: '2026-03-01', ate: '2026-05-31' });
  });
});

describe('moverPeriodo', () => {
  it('anda de dia em dia', () => {
    expect(moverPeriodo(em('dia', '2026-09-30'), 1).ancora).toBe('2026-10-01');
  });

  it('anda de mês em mês virando o ano', () => {
    expect(moverPeriodo(em('mes', '2026-12-15'), 1).ancora).toBe('2027-01-01');
  });

  it('anda de trimestre em trimestre', () => {
    expect(intervaloDoPeriodo(moverPeriodo(em('trimestre', '2026-09-08'), 1)))
      .toEqual({ de: '2026-10-01', ate: '2026-12-31' });
    expect(intervaloDoPeriodo(moverPeriodo(em('trimestre', '2026-09-08'), -1)))
      .toEqual({ de: '2026-04-01', ate: '2026-06-30' });
  });

  it('anda de ano em ano', () => {
    expect(intervaloDoPeriodo(moverPeriodo(em('ano', '2026-06-06'), -2)))
      .toEqual({ de: '2024-01-01', ate: '2024-12-31' });
  });

  it('tudo e livre não se movem — não há próximo "tudo"', () => {
    expect(moverPeriodo(em('tudo'), 1)).toEqual(em('tudo'));
    expect(podeMover(em('tudo'))).toBe(false);
    expect(podeMover(em('livre'))).toBe(false);
    expect(podeMover(em('mes'))).toBe(true);
  });
});

describe('trocarGrao', () => {
  it('mantém o ano ao trocar de mês para trimestre', () => {
    expect(intervaloDoPeriodo(trocarGrao(em('mes', '2026-09-08'), 'trimestre')))
      .toEqual({ de: '2026-07-01', ate: '2026-09-30' });
  });

  it('saindo de "tudo" volta para hoje, não para o ano zero', () => {
    const virou = trocarGrao(em('tudo'), 'mes');
    expect(virou.ancora).toBe(today());
  });

  it('trocar para livre já vem com as pontas do período que estava aberto', () => {
    const livre = trocarGrao(em('ano', '2026-06-06'), 'livre');
    expect(livre).toMatchObject({ grao: 'livre', de: '2026-01-01', ate: '2026-12-31' });
  });

  it('de "tudo" para livre não propõe o ano zero como data inicial', () => {
    const livre = trocarGrao(em('tudo'), 'livre');
    expect(livre.de).not.toBe(INICIO_DOS_TEMPOS);
  });
});

describe('rótulos', () => {
  it('escreve cada granularidade do jeito que se lê', () => {
    expect(rotuloDoPeriodo(em('dia'))).toBe('08/09/2026');
    expect(rotuloDoPeriodo(em('mes'))).toBe('Setembro de 2026');
    expect(rotuloDoPeriodo(em('trimestre'))).toBe('3º tri de 2026');
    expect(rotuloDoPeriodo(em('ano'))).toBe('2026');
    expect(rotuloDoPeriodo(em('tudo'))).toBe('Tudo');
  });

  it('descreve o intervalo livre pelas pontas que tem', () => {
    expect(rotuloDoPeriodo({ grao: 'livre', ancora: '2026-09-08', de: '2026-03-01', ate: '2026-05-31' }))
      .toBe('01/03/2026 a 31/05/2026');
    expect(rotuloDoPeriodo({ grao: 'livre', ancora: '2026-09-08', de: '2026-03-01' })).toBe('A partir de 01/03/2026');
    expect(rotuloDoPeriodo({ grao: 'livre', ancora: '2026-09-08', ate: '2026-03-01' })).toBe('Até 01/03/2026');
  });

  it('encurta o que precisa caber no celular', () => {
    expect(rotuloCurto(em('mes'))).toBe('set/26');
    expect(rotuloCurto(em('dia'))).toBe('08 set');
    expect(rotuloCurto(em('trimestre'))).toBe('3º tri/26');
  });
});

describe('ehPeriodoAtual', () => {
  it('reconhece o período que contém hoje', () => {
    expect(ehPeriodoAtual({ grao: 'mes', ancora: today() })).toBe(true);
    expect(ehPeriodoAtual(em('mes', '1999-01-01'))).toBe(false);
  });

  it('"tudo" sempre contém hoje, então não oferece o botão de voltar', () => {
    expect(ehPeriodoAtual(em('tudo'))).toBe(true);
  });
});

describe('mesesDoPeriodo', () => {
  it('lista os meses cobertos, inclusive virando o ano', () => {
    expect(mesesDoPeriodo({ grao: 'livre', ancora: '2026-01-01', de: '2026-11-10', ate: '2027-02-03' }))
      .toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });

  it('um dia cobre um mês só', () => {
    expect(mesesDoPeriodo(em('dia'))).toEqual(['2026-09']);
  });

  it('não tenta enumerar dez mil anos quando o período é "tudo"', () => {
    expect(mesesDoPeriodo(em('tudo'))).toEqual([]);
  });
});

describe('trimestreDe', () => {
  it('vai de 1 a 4', () => {
    expect(['2026-01-01', '2026-04-01', '2026-07-01', '2026-10-01'].map(trimestreDe)).toEqual([1, 2, 3, 4]);
  });
});

describe('periodoDoMes', () => {
  it('nasce ancorado no dia 1 daquele mês', () => {
    expect(periodoDoMes('2026-09')).toEqual({ grao: 'mes', ancora: '2026-09-01' });
  });
});

describe('limiteDaPrevisao', () => {
  // A regra que impede o período "Tudo" de pedir 8.000 anos de recorrentes.
  it('corta o fim da janela no horizonte de dois anos', () => {
    expect(limiteDaPrevisao(FIM_DOS_TEMPOS, '2026-09-08')).toBe('2028-09-08');
  });

  it('não estica uma janela que já termina antes', () => {
    expect(limiteDaPrevisao('2026-10-31', '2026-09-08')).toBe('2026-10-31');
  });

  it('usa hoje quando ninguém informa a data', () => {
    expect(limiteDaPrevisao(FIM_DOS_TEMPOS)).toBe(addMonths(today(), 24));
  });
});
