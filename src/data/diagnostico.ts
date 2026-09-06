/**
 * Diagnóstico da configuração da nuvem.
 *
 * Existe porque "não funciona" é impossível de resolver à distância: cada
 * peça (chaves, tabelas, funções, permissões) falha com uma mensagem
 * diferente e exige uma correção diferente. Aqui cada uma é testada em
 * separado, na ordem em que dependem uma da outra, e o resultado diz o que
 * fazer — não só que deu errado.
 */

import { getSupabase, isCloudEnabled, traduzirErro } from './supabase.ts';

export type Situacao = 'ok' | 'falha' | 'pulado';

export interface Verificacao {
  nome: string;
  situacao: Situacao;
  detalhe: string;
  /** O que fazer a respeito, quando falhou. */
  comoResolver?: string;
}

const PAINEL = 'no painel do Supabase';

/** Um pedido sem resposta trava o diagnóstico inteiro em "Verificando…". */
const LIMITE_MS = 8_000;

class SemResposta extends Error {
  constructor() {
    super('O servidor não respondeu a tempo.');
  }
}

function comTempoLimite<T>(promessa: PromiseLike<T>): Promise<T> {
  return Promise.race([
    Promise.resolve(promessa),
    new Promise<never>((_, rejeitar) => setTimeout(() => rejeitar(new SemResposta()), LIMITE_MS)),
  ]);
}

export async function diagnosticar(): Promise<Verificacao[]> {
  const resultado: Verificacao[] = [];
  const supabase = getSupabase();

  if (!isCloudEnabled() || !supabase) {
    return [
      {
        nome: 'Chaves do Supabase',
        situacao: 'falha',
        detalhe: 'Esta cópia do aplicativo foi compilada sem as chaves.',
        comoResolver: 'Use o endereço publicado, ou preencha o .env.production e refaça o build.',
      },
    ];
  }
  resultado.push({ nome: 'Chaves do Supabase', situacao: 'ok', detalhe: 'Presentes no aplicativo.' });

  /* ------------------------------------------------- 1. o servidor responde */

  try {
    const { error } = await comTempoLimite(supabase.from('records').select('record_id').limit(1));
    if (error) throw new Error(error.message);
    resultado.push({
      nome: 'Tabelas no banco',
      situacao: 'ok',
      detalhe: 'A tabela de lançamentos existe e responde.',
    });
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    resultado.push({
      nome: 'Tabelas no banco',
      situacao: 'falha',
      detalhe: traduzirErro(msg),
      comoResolver:
        erro instanceof SemResposta || msg.toLowerCase().includes('fetch')
          ? 'Verifique a conexão. Se estiver online, o projeto pode estar suspenso por inatividade — abra o painel do Supabase para acordá-lo.'
          : `Rode o supabase/schema.sql no SQL Editor, ${PAINEL}.`,
    });
    return resultado; // sem tabelas, o resto não faz sentido
  }

  /* ------------------------------------------------------------ 2. sessão */

  const { data: sessao } = await comTempoLimite(supabase.auth.getSession());
  if (!sessao.session) {
    resultado.push({
      nome: 'Sua conta',
      situacao: 'falha',
      detalhe: 'Você não está logado.',
      comoResolver: 'Entre ou crie uma conta acima.',
    });
    return resultado;
  }
  resultado.push({
    nome: 'Sua conta',
    situacao: 'ok',
    detalhe: `Logado como ${sessao.session.user.email}.`,
  });

  /* ---------------------------------------------- 3. a situação do acesso */

  // Chamar de verdade, e não só conferir que a função existe: um corpo de
  // função plpgsql não é validado na criação, então "existe" já enganou uma
  // vez — o convite antigo só quebrava na hora de usar.
  let liberado = false;
  try {
    const { data, error } = await comTempoLimite(supabase.rpc('meu_acesso'));
    if (error) throw new Error(error.message);
    const linha = (Array.isArray(data) ? data[0] : data) as { situacao?: string } | undefined;
    liberado = linha?.situacao === 'liberado';
    resultado.push({
      nome: 'Seu acesso',
      situacao: liberado ? 'ok' : 'falha',
      detalhe: liberado
        ? 'Liberado: você é da carteira.'
        : linha?.situacao === 'rejected'
          ? 'Esta conta foi recusada.'
          : 'Cadastro feito, esperando alguém liberar.',
      comoResolver: liberado ? undefined : 'Peça para quem administra a carteira liberar o seu acesso em Ajustes.',
    });
  } catch (erro) {
    resultado.push({
      nome: 'Seu acesso',
      situacao: 'falha',
      detalhe: traduzirErro(erro instanceof Error ? erro.message : String(erro)),
      comoResolver: `Rode o supabase/schema.sql atualizado, ${PAINEL}.`,
    });
    return resultado;
  }

  /* ------------------------------------------------ 4. gravar de verdade */

  if (!liberado) {
    resultado.push({
      nome: 'Ler e gravar',
      situacao: 'pulado',
      detalhe: 'Depende de o acesso estar liberado.',
    });
    return resultado;
  }

  try {
    const { error } = await comTempoLimite(supabase.from('records').select('record_id').limit(1));
    if (error) throw new Error(error.message);
    resultado.push({
      nome: 'Ler e gravar',
      situacao: 'ok',
      detalhe: 'A carteira responde e aceita a sua chave.',
    });
  } catch (erro) {
    resultado.push({
      nome: 'Ler e gravar',
      situacao: 'falha',
      detalhe: traduzirErro(erro instanceof Error ? erro.message : String(erro)),
      comoResolver: `Rode o supabase/schema.sql atualizado, ${PAINEL}.`,
    });
  }

  return resultado;
}
