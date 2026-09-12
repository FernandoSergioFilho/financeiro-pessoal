/**
 * A versão deste build, injetada em tempo de compilação (ver `vite.config.ts`).
 *
 * Serve para responder "estou vendo a versão nova?" sem adivinhação — a
 * pergunta que surgiu quando um botão recém-publicado não aparecia no celular
 * e não havia como saber se era defeito da tela ou cache antigo.
 */
declare const __VERSAO_DO_APP__: string;

export const VERSAO_DO_APP: string =
  typeof __VERSAO_DO_APP__ === 'string' ? __VERSAO_DO_APP__ : 'desenvolvimento';
