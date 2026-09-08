import { describe, expect, it } from 'vitest';

import { descobrirSeparador, lerCsvDeBanco, lerDataDeBanco } from './banco-csv.ts';

/* Os dois formatos que o Nubank exporta hoje, escritos como ele escreve. */
const EXTRATO_NUBANK = `Data,Valor,Identificador,Descrição
07/09/2026,-92.00,6a1b2c3d-0001,Compra no débito - SUPERMERCADO SAO JOAO
05/09/2026,7800.00,6a1b2c3d-0002,Transferência recebida - EMPRESA LTDA
10/09/2026,-2450.00,6a1b2c3d-0003,Pagamento de boleto - IMOBILIARIA`;

const FATURA_NUBANK = `date,title,amount
2026-09-03,Ifood *Ifood,64.90
2026-09-05,Uber *Trip,23.40
2026-09-08,Netflix.com,55.90`;

describe('descobrirSeparador', () => {
  it('acha a vírgula do Nubank', () => {
    expect(descobrirSeparador(EXTRATO_NUBANK)).toBe(',');
  });

  it('acha o ponto e vírgula de quem exporta para o Excel brasileiro', () => {
    expect(descobrirSeparador('Data;Descrição;Valor\n07/09/2026;Padaria;-12,50')).toBe(';');
  });

  // Contar ocorrências não bastaria: a descrição tem quatro vírgulas e o
  // arquivo é de ponto e vírgula.
  it('não se engana com vírgulas dentro da descrição', () => {
    const csv = 'Data;Descrição;Valor\n07/09/2026;Loja, filial 3, centro, SP;-12,50\n08/09/2026;Outra, coisa, aqui, ok;-9,90';
    expect(descobrirSeparador(csv)).toBe(';');
  });
});

describe('lerDataDeBanco', () => {
  it('entende ISO, brasileira e com hora junto', () => {
    expect(lerDataDeBanco('2026-09-07')).toBe('2026-09-07');
    expect(lerDataDeBanco('07/09/2026')).toBe('2026-09-07');
    expect(lerDataDeBanco('07-09-2026')).toBe('2026-09-07');
    expect(lerDataDeBanco('2026-09-07T14:32:00')).toBe('2026-09-07');
  });

  it('recusa o que não é data, em vez de inventar uma', () => {
    expect(lerDataDeBanco('')).toBeNull();
    expect(lerDataDeBanco('setembro')).toBeNull();
    expect(lerDataDeBanco('32/09/2026')).toBeNull();
  });
});

describe('lerCsvDeBanco', () => {
  it('lê o extrato do Nubank com sinal e tudo', () => {
    const { linhas, problemas, formato } = lerCsvDeBanco(EXTRATO_NUBANK);
    expect(problemas).toEqual([]);
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toMatchObject({
      data: '2026-09-07',
      valor: -9200,
      identificador: '6a1b2c3d-0001',
    });
    expect(linhas[1]!.valor).toBe(780000);
    expect(formato).toMatchObject({ separador: ',', colunaData: 'Data', colunaValor: 'Valor' });
  });

  it('lê a fatura do cartão, que vem em inglês e sem identificador', () => {
    const { linhas, problemas, formato } = lerCsvDeBanco(FATURA_NUBANK);
    expect(problemas).toEqual([]);
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toMatchObject({ data: '2026-09-03', descricao: 'Ifood *Ifood', valor: 6490 });
    expect(formato?.colunaIdentificador).toBeNull();
  });

  it('entende ponto e vírgula com centavos por vírgula', () => {
    const { linhas } = lerCsvDeBanco('Data;Histórico;Valor\n07/09/2026;Padaria;-12,50');
    expect(linhas[0]).toMatchObject({ data: '2026-09-07', descricao: 'Padaria', valor: -1250 });
  });

  it('aceita a descrição entre aspas com o separador dentro', () => {
    const { linhas } = lerCsvDeBanco('Data,Descrição,Valor\n07/09/2026,"Loja, filial 3",-12.50');
    expect(linhas[0]!.descricao).toBe('Loja, filial 3');
  });

  it('diz quais colunas faltam, em vez de importar lixo', () => {
    const { linhas, problemas } = lerCsvDeBanco('Coluna A,Coluna B\n1,2');
    expect(linhas).toEqual([]);
    expect(problemas[0]!.motivo).toMatch(/data/);
    expect(problemas[0]!.motivo).toMatch(/Coluna A/); // mostra o cabeçalho de verdade
  });

  it('pula a linha ruim e importa o resto, dizendo qual pulou', () => {
    const csv = `Data,Descrição,Valor
07/09/2026,Padaria,-12.50
data errada,Coisa,-9.90
09/09/2026,Farmácia,-33.00`;
    const { linhas, problemas } = lerCsvDeBanco(csv);
    expect(linhas).toHaveLength(2);
    expect(problemas).toHaveLength(1);
    expect(problemas[0]!.linha).toBe(3);
  });

  it('recusa valor zero — não é lançamento nenhum', () => {
    const { linhas, problemas } = lerCsvDeBanco('Data,Descrição,Valor\n07/09/2026,Estorno,0.00');
    expect(linhas).toEqual([]);
    expect(problemas).toHaveLength(1);
  });

  it('arquivo vazio não vira importação vazia calada', () => {
    expect(lerCsvDeBanco('').problemas).toHaveLength(1);
  });

  it('engole o BOM que o Excel escreve no começo do arquivo', () => {
    const { linhas } = lerCsvDeBanco('﻿Data,Descrição,Valor\n07/09/2026,Padaria,-12.50');
    expect(linhas).toHaveLength(1);
  });
});
