/**
 * A tela onde a chave do Gemini é colada, testada e guardada.
 *
 * **O aviso vem antes do campo, e não depois.** Quem já colou a chave e
 * perguntou não tem mais o que decidir. As duas coisas que mudam a decisão —
 * que na camada gratuita o Google costuma usar o enviado para treinar, e que a
 * chave fica legível para quem pegar o aparelho desbloqueado — estão acima da
 * caixa de texto, escritas sem enfeite.
 *
 * **Testar não é opcional na prática.** Uma chave colada errada só falha na
 * hora de perguntar, num diálogo diferente, e aí ninguém liga uma coisa à
 * outra. O botão "Testar" pergunta à API quais modelos existem: prova que a
 * chave funciona **e** preenche a lista de escolha, de uma vez.
 */

import { useEffect, useState } from 'react';

import {
  MODELO_PADRAO, ONDE_CRIAR_A_CHAVE, guardarChave, guardarModelo, lerChave, lerModelo,
  listarModelos, type ModeloDisponivel,
} from '../../data/ia.ts';
import { Card } from './primitives.tsx';

export function ChaveDeIA() {
  const [chave, setChave] = useState(lerChave());
  const [modelo, setModelo] = useState(lerModelo());
  const [mostrar, setMostrar] = useState(false);
  const [modelos, setModelos] = useState<ModeloDisponivel[]>([]);
  const [estado, setEstado] = useState<'parado' | 'testando' | 'ok' | 'erro'>('parado');
  const [recado, setRecado] = useState('');
  // Guardar a chave não muda nada visível nesta tela, e quem acabou de guardar
  // fica sem saber o que fazer com ela. O caminho é de três passos e nenhum
  // deles tem a palavra "IA" no rótulo; então ele é dito aqui, na hora.
  const [ondeUsar, setOndeUsar] = useState(false);

  // Com uma chave já guardada, a lista se preenche sozinha: sem isso o seletor
  // de modelo nasce vazio em quem já configurou tudo da última vez.
  useEffect(() => {
    if (!lerChave()) return;
    listarModelos()
      .then((lista) => setModelos(lista))
      .catch(() => undefined);
  }, []);

  async function testar() {
    setEstado('testando');
    setRecado('');
    try {
      const lista = await listarModelos(chave.trim());
      guardarChave(chave);
      setModelos(lista);
      // Se o modelo guardado não existe mais, cai no primeiro que existe.
      if (!lista.some((m) => m.nome === modelo)) {
        const escolhido = lista.find((m) => m.nome === MODELO_PADRAO)?.nome ?? lista[0]?.nome;
        if (escolhido) {
          setModelo(escolhido);
          guardarModelo(escolhido);
        }
      }
      setEstado('ok');
      setRecado(`Funcionou. ${lista.length} modelos disponíveis com esta chave.`);
      setOndeUsar(true);
    } catch (e: unknown) {
      setEstado('erro');
      setRecado(e instanceof Error ? e.message : 'Não consegui falar com o Google.');
    }
  }

  function apagar() {
    guardarChave('');
    setChave('');
    setModelos([]);
    setEstado('parado');
    setRecado('Chave apagada deste aparelho.');
  }

  const guardada = lerChave() !== '';

  return (
    <Card title="Perguntar a uma IA">
      <div className="setting-text">
        <div className="dim">
          Sem chave, o app monta o texto e você cola num chat. Com uma chave do Google Gemini, a
          resposta aparece dentro do app. A chave é sua, fica só neste aparelho, e você pode
          apagá-la quando quiser.
        </div>
      </div>

      {/* O que muda a decisão vem antes do campo. Depois de colada e usada,
          não há mais o que decidir. */}
      <div className="banner warn" style={{ alignItems: 'flex-start', marginTop: 10 }}>
        <span className="emoji" aria-hidden="true">⚠️</span>
        <span>
          <strong>Duas coisas para saber antes</strong>
          <br />
          <span className="dim">
            <strong>1.</strong> A camada gratuita do Gemini é de verdade gratuita, mas o Google
            costuma <strong>usar o que você envia para treinar os modelos dele</strong> — nos planos
            pagos, não. O texto leva os seus totais, categorias, custo fixo e saldos, e{' '}
            <strong>nunca a descrição de um lançamento</strong>; ainda assim, é o retrato do seu
            dinheiro. Confira os termos atuais antes de decidir.
            <br />
            <strong>2.</strong> A chave fica guardada neste navegador, legível para quem pegar o
            aparelho desbloqueado. Dá para revogá-la a qualquer momento no site do Google, e aí ela
            não serve mais para ninguém.
          </span>
        </span>
      </div>

      <p className="hint" style={{ marginTop: 10 }}>
        Crie a chave em{' '}
        <a href={ONDE_CRIAR_A_CHAVE} target="_blank" rel="noopener noreferrer">
          aistudio.google.com/apikey ↗
        </a>{' '}
        — é de graça, entra com a sua conta Google e leva um minuto.
      </p>

      <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
        <input
          className="input"
          style={{ flex: '1 1 16rem', fontFamily: 'ui-monospace, monospace' }}
          type={mostrar ? 'text' : 'password'}
          placeholder="Cole aqui a chave que começa com AIza…"
          value={chave}
          onChange={(e) => { setChave(e.target.value); setEstado('parado'); }}
          autoComplete="off"
          spellCheck={false}
          aria-label="Chave da API do Gemini"
        />
        <button type="button" className="btn" onClick={() => setMostrar((m) => !m)}>
          {mostrar ? '🙈 Esconder' : '👁 Mostrar'}
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={chave.trim() === '' || estado === 'testando'}
          onClick={() => void testar()}
        >
          {estado === 'testando' ? 'Testando…' : 'Testar e guardar'}
        </button>
        {guardada && (
          <button type="button" className="btn danger" onClick={apagar}>
            Apagar
          </button>
        )}
      </div>

      {recado && (
        <p className={estado === 'erro' ? 'error' : 'hint'} style={{ marginTop: 8 }}>
          {estado === 'ok' ? '✅ ' : ''}{recado}
        </p>
      )}

      {(ondeUsar || guardada) && estado !== 'erro' && (
        <div className="banner ok" style={{ alignItems: 'flex-start', marginTop: 10 }}>
          <span className="emoji" aria-hidden="true">✨</span>
          <span>
            <strong>Onde a resposta aparece</strong>
            <br />
            <span className="dim">
              No <strong>Painel</strong>, toque em <strong>🔎 Analisar</strong> (na barra de
              ações, ao lado do período). Abre um diálogo com quatro abas — vá na última,{' '}
              <strong>Levar a uma IA</strong>. Escolha uma das perguntas prontas e toque em{' '}
              <strong>✨ Perguntar agora</strong>. A resposta aparece ali mesmo, no topo do
              diálogo.
            </span>
          </span>
        </div>
      )}

      {modelos.length > 0 && (
        <div className="row wrap" style={{ gap: 8, marginTop: 10, alignItems: 'center' }}>
          <span className="hint" style={{ margin: 0 }}>Modelo:</span>
          <select
            className="input"
            style={{ flex: '1 1 14rem' }}
            value={modelo}
            onChange={(e) => { setModelo(e.target.value); guardarModelo(e.target.value); }}
            aria-label="Modelo do Gemini"
          >
            {modelos.map((m) => (
              <option key={m.nome} value={m.nome}>{m.rotulo}</option>
            ))}
          </select>
          <span className="hint" style={{ margin: 0 }}>
            Os "Flash" são rápidos e cabem melhor no limite grátis.
          </span>
        </div>
      )}

      <p className="hint" style={{ marginTop: 10 }}>
        A chave não entra em backup nem na sincronização — ela fica fora dos dados da carteira de
        propósito, para não viajar para servidor nenhum nem para dentro de um arquivo que você
        mande por e-mail.
      </p>
    </Card>
  );
}
