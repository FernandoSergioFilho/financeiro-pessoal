/**
 * A leitura do período, como um relatório de fechamento — e o texto para levar
 * a uma IA de fora.
 *
 * São duas abas porque são duas perguntas diferentes. A **leitura** responde
 * "o que aconteceu": é conta, sai na hora, sem internet, e dá o mesmo resultado
 * toda vez (o porquê de ser calculada e não gerada está em `domain/analise.ts`).
 * O **texto para IA** responde "e agora, o que eu faço": isso é conversa, e
 * conversa o app não tem como ter sozinho — então ele monta o texto e você
 * leva (`domain/prompt.ts` diz o que entra nele e o que fica de fora).
 */

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';

import { analisar, type Achado, type Tom } from '../../domain/analise.ts';
import { addMonthsToKey, monthEnd, monthKey, monthStart, today } from '../../domain/date.ts';
import { CONFIANCA_MINIMA, mediana, projetar, tendencia, variacao } from '../../domain/estatistica.ts';
import { comDataDeCaixa, quandoSai } from '../../domain/faturas.ts';
import {
  RENDIMENTO_PADRAO_AO_ANO, procurarOportunidades, resumirOportunidades,
} from '../../domain/oportunidades.ts';
import { formatMoney } from '../../domain/money.ts';
import { rotuloDoPeriodo, type Periodo } from '../../domain/period.ts';
import {
  MODELOS, montarPrompt, reunirDados, type ChaveDePrompt, type ModeloDePrompt,
} from '../../domain/prompt.ts';
import type { DisplayEntry } from '../../domain/types.ts';
import { useLookups } from '../../state/selectors.ts';
import { useFinance } from '../../state/store.tsx';
import { Dialog } from './primitives.tsx';

const EMOJI: Record<Tom, string> = {
  bom: '✅',
  atencao: '⚠️',
  ruim: '🔴',
  neutro: '📊',
};

const CLASSE: Record<Tom, string> = {
  bom: 'good',
  atencao: '',
  ruim: 'bad',
  neutro: 'muted',
};

export function AnaliseDialog({
  periodo,
  entradas,
  onClose,
}: {
  periodo: Periodo;
  entradas: readonly DisplayEntry[];
  onClose: () => void;
}) {
  const { data } = useFinance();
  const { categories, accounts } = useLookups();
  const analise = useMemo(() => analisar(data, entradas, categories), [data, entradas, categories]);
  const [aba, setAba] = useState<'leitura' | 'oportunidades' | 'numeros' | 'ia'>('leitura');

  /*
   * O texto e o botão de copiar moram aqui, e não dentro do painel, para que o
   * botão possa ficar no rodapé do diálogo. Embaixo do campo ele nascia fora da
   * tela: o texto tem catorze linhas, e a ação principal exigia rolar até o fim
   * para ser descoberta.
   */
  const [escolhido, setEscolhido] = useState<ChaveDePrompt>('diagnostico');
  const [texto, setTexto] = useState('');
  const [copiado, setCopiado] = useState<'nao' | 'sim' | 'falhou'>('nao');
  const campo = useRef<HTMLTextAreaElement>(null);

  const modelo = MODELOS.find((m) => m.chave === escolhido) ?? MODELOS[0]!;
  const dados = useMemo(
    () => reunirDados(data, entradas, categories, accounts, periodo),
    [data, entradas, categories, accounts, periodo],
  );

  // O texto é estado, e não só `useMemo`, porque dá para editar antes de colar.
  // Trocar de pergunta reescreve — inclusive por cima do que foi editado, que é
  // o que a pessoa espera ao escolher outra pergunta.
  useEffect(() => {
    setTexto(montarPrompt(modelo, dados));
    setCopiado('nao');
  }, [modelo, dados]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado('sim');
    } catch {
      // Sem permissão de área de transferência: deixa o texto selecionado para
      // o copiar do próprio aparelho terminar o serviço.
      campo.current?.select();
      setCopiado('falhou');
    }
  }

  return (
    <Dialog
      title={`Análise de ${rotuloDoPeriodo(periodo).toLowerCase()}`}
      onClose={onClose}
      larga
      footer={
        <>
          {aba === 'ia' && copiado === 'sim' && <span className="good">Copiado — agora cole no chat.</span>}
          {aba === 'ia' && copiado === 'falhou' && (
            <span className="dim">
              Este navegador não deixou copiar sozinho. O texto está selecionado: use o copiar do aparelho.
            </span>
          )}
          <span className="spacer" />
          {/* Copiar **e** abrir o chat, nessa ordem: copiar sozinho deixava a
              pessoa com o texto na mão e sem saber para onde levá-lo, que era
              metade da estranheza da tela. */}
          {aba === 'ia' && (
            <>
              {/* Rótulos curtos: no celular "Copiar e abrir o Claude" quebrava em
                  quatro linhas e o rodapé virava um bloco. Os três copiam — os
                  dois da direita também abrem o chat, e a linha acima do campo
                  diz isso. */}
              <button type="button" className="btn primary" onClick={() => void copiar()}>
                📋 Copiar
              </button>
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  await copiar();
                  window.open('https://claude.ai/new', '_blank', 'noopener,noreferrer');
                }}
              >
                Claude ↗
              </button>
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  await copiar();
                  window.open('https://chatgpt.com/', '_blank', 'noopener,noreferrer');
                }}
              >
                ChatGPT ↗
              </button>
            </>
          )}
          <button type="button" className={aba === 'ia' ? 'btn' : 'btn primary'} onClick={onClose}>
            Fechar
          </button>
        </>
      }
    >
      {/* O mesmo `.segmented` das outras telas: um controle novo aqui seria um
          jeito a mais de fazer a mesma coisa. */}
      {/* Duas linhas no celular, e não rolagem lateral: são quatro abas, e a
          quarta ficaria fora da tela. Quem não sabe que ela existe não rola
          para procurá-la — foi a varredura de CSS que cobrou isto. */}
      <div className="segmented duas-linhas" style={{ marginBottom: 14 }}>
        <button type="button" aria-pressed={aba === 'leitura'} onClick={() => setAba('leitura')}>
          Leitura
        </button>
        <button type="button" aria-pressed={aba === 'oportunidades'} onClick={() => setAba('oportunidades')}>
          O que fazer
        </button>
        <button type="button" aria-pressed={aba === 'numeros'} onClick={() => setAba('numeros')}>
          Números
        </button>
        <button type="button" aria-pressed={aba === 'ia'} onClick={() => setAba('ia')}>
          Levar a uma IA
        </button>
      </div>

      {aba === 'oportunidades' ? (
        <PainelDeOportunidades />
      ) : aba === 'numeros' ? (
        <PainelDeNumeros />
      ) : aba === 'ia' ? (
        <PainelDeIA
          modelo={modelo}
          escolhido={escolhido}
          onEscolher={setEscolhido}
          texto={texto}
          onTexto={(t) => {
            setTexto(t);
            setCopiado('nao');
          }}
          campo={campo}
        />
      ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {analise.indicadores.length > 0 && (
          <div className="grid contadores">
            {analise.indicadores.map((indicador) => (
              <div key={indicador.rotulo} className="card stat">
                <span className="stat-label">{indicador.rotulo}</span>
                <span className={`stat-value sm num ${CLASSE[indicador.tom]}`}>{indicador.valor}</span>
                <span className="stat-hint">{indicador.detalhe}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {analise.achados.map((item) => (
            <Leitura key={item.id} achado={item} />
          ))}
        </div>

        <p className="hint">
          Calculado aqui no seu aparelho, a partir dos seus lançamentos — nada é enviado para lugar nenhum, e o
          resultado é o mesmo toda vez. Quanto mais meses fechados, mais a análise consegue dizer sobre o que é
          normal para você: hoje são {analise.mesesDeHistorico}.
        </p>
      </div>
      )}
    </Dialog>
  );
}

function Leitura({ achado }: { achado: Achado }) {
  return (
    <div className="banner" style={{ alignItems: 'flex-start' }}>
      <span className="emoji" aria-hidden="true">
        {EMOJI[achado.tom]}
      </span>
      <span>
        <strong>{achado.titulo}</strong>
        <br />
        <span className="dim">{achado.texto}</span>
      </span>
    </div>
  );
}

/**
 * "O que fazer": os achados com valor em reais e caminho concreto.
 *
 * A régua está em `domain/oportunidades.ts` e vale repetir: nada aparece aqui
 * sem um número e uma ação. Um painel cheio de "considere revisar seus gastos"
 * ensina a pessoa a ignorar a tela.
 */
function PainelDeOportunidades() {
  const { data } = useFinance();
  const { accounts, categories } = useLookups();
  const [taxa, setTaxa] = useState(RENDIMENTO_PADRAO_AO_ANO);

  const achados = useMemo(
    () => procurarOportunidades({ data, contas: accounts, categorias: categories, rendimentoAoAno: taxa }),
    [data, accounts, categories, taxa],
  );

  // Dois totais, e não um: o que se para de perder e o que se passa a ganhar
  // respondem coisas diferentes. Somá-los daria um número grande que não quer
  // dizer nada — e o compromisso das parcelas não entra em nenhum dos dois.
  const { vazando, ganhando } = resumirOportunidades(achados);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {achados.length === 0 ? (
        <div className="banner">
          <span className="emoji" aria-hidden="true">👌</span>
          <span>
            <strong>Nada gritando por atenção</strong>
            <br />
            <span className="dim">
              Não achei dinheiro parado, juros, tarifas nem custo fixo subindo. Com mais meses de
              histórico a busca fica mais fina.
            </span>
          </span>
        </div>
      ) : (
        <>
          <div className="grid cols-2 keep">
            {vazando > 0 && (
              <div className="card stat">
                <span className="stat-label">Vazando por ano</span>
                <span className="stat-value num bad">{formatMoney(vazando)}</span>
                <span className="stat-hint">Juros, tarifas e contas que subiram — parar de perder é certo</span>
              </div>
            )}
            {ganhando > 0 && (
              <div className="card stat">
                <span className="stat-label">Deixando de ganhar</span>
                <span className="stat-value num">{formatMoney(ganhando)}</span>
                <span className="stat-hint">Dinheiro parado que renderia, à taxa lá embaixo</span>
              </div>
            )}
          </div>

          {achados.map((o) => (
            <div key={o.id} className={`banner ${o.tipo === 'vazamento' ? 'warn' : ''}`} style={{ alignItems: 'flex-start' }}>
              <span className="emoji" aria-hidden="true">
                {o.tipo === 'vazamento' ? '🔴' : o.tipo === 'ganho' ? '💤' : 'ℹ️'}
              </span>
              <span>
                <strong>{o.titulo}</strong>{' '}
                <span className="num" style={{ fontWeight: 620 }}>· {formatMoney(o.porAno)}/ano</span>
                <br />
                <span className="dim">{o.texto}</span>
                <br />
                <span style={{ display: 'inline-block', marginTop: 4 }}>{o.acao}</span>
              </span>
            </div>
          ))}
        </>
      )}

      {/* A única coisa aqui que não sai dos lançamentos, e por isso editável:
          a taxa envelhece, e a régua de cada um é diferente. */}
      <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
        <span className="hint" style={{ margin: 0 }}>Quanto rende o dinheiro parado, ao ano:</span>
        <input
          type="number"
          className="input sm"
          style={{ width: '5rem' }}
          min={0}
          max={100}
          step={0.5}
          value={(taxa * 100).toFixed(1)}
          onChange={(e) => setTaxa(Math.max(0, Number(e.target.value)) / 100)}
          aria-label="Rendimento anual usado nas contas"
        />
        <span className="hint" style={{ margin: 0 }}>
          % — é o único número que não vem dos seus lançamentos.
        </span>
      </div>
    </div>
  );
}

/**
 * "Números": a estatística crua, sem conclusão.
 *
 * Existe separada do "o que fazer" porque são duas leituras diferentes. Aqui
 * ninguém aconselha nada: é a série, a mediana, a tendência e o quanto cada
 * categoria balança — o material de quem quer conferir a conclusão em vez de
 * aceitá-la.
 */
function PainelDeNumeros() {
  const { data } = useFinance();
  const { accounts, categories } = useLookups();

  const linhas = useMemo(() => {
    const comCaixa = comDataDeCaixa(accounts, data.entries) as DisplayEntry[];
    const atual = monthKey(today());
    const meses = Array.from({ length: 12 }, (_, i) => addMonthsToKey(atual, -(12 - i)));

    const porCategoria = new Map<string, number[]>();
    for (const mes of meses) {
      const doMes = comCaixa.filter((e) => {
        const sai = quandoSai(e);
        return e.kind === 'expense' && sai >= monthStart(mes) && sai <= monthEnd(mes);
      });
      const somas = new Map<string, number>();
      for (const e of doMes) {
        const chave = e.categoryId ?? '';
        somas.set(chave, (somas.get(chave) ?? 0) + e.amount);
      }
      for (const c of [...categories.map((c) => c.id), '']) {
        const lista = porCategoria.get(c) ?? [];
        lista.push(somas.get(c) ?? 0);
        porCategoria.set(c, lista);
      }
    }

    const nome = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Sem categoria';
    return [...porCategoria.entries()]
      .map(([id, serie]) => ({
        id,
        nome: nome(id),
        tipico: mediana(serie) ?? 0,
        tendencia: tendencia(serie),
        variacao: variacao(serie),
        proximo: projetar(serie),
      }))
      .filter((l) => l.tipico > 0)
      .sort((a, b) => b.tipico - a.tipico);
  }, [data.entries, accounts, categories]);

  if (linhas.length === 0) {
    return <p className="hint">Ainda não há meses fechados suficientes para calcular nada.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p className="hint" style={{ margin: 0 }}>
        Doze meses, por categoria. O <strong>típico</strong> é a mediana e não a média: um mês com a
        compra grande levanta a média e faz o app dizer que você gasta o que não gasta.
      </p>
      <div className="table-wrap">
        <table className="table tabela-numeros">
          <thead>
            <tr>
              <th>Categoria</th>
              <th className="right">Típico/mês</th>
              <th className="right">Tendência</th>
              <th className="right">Previsibilidade</th>
              <th className="right">Próximo mês</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id}>
                <td data-rotulo="Categoria">{l.nome}</td>
                <td className="right num" data-rotulo="Típico">{formatMoney(l.tipico)}</td>
                <td className="right num" data-rotulo="Tendência">
                  {l.tendencia && l.tendencia.confianca >= CONFIANCA_MINIMA ? (
                    <span className={l.tendencia.porMes > 0 ? 'bad' : 'good'}>
                      {l.tendencia.porMes > 0 ? '+' : ''}{formatMoney(l.tendencia.porMes)}/mês
                    </span>
                  ) : (
                    <span className="dim">varia demais</span>
                  )}
                </td>
                <td className="right" data-rotulo="Previsibilidade">
                  {l.variacao === null ? '—' : l.variacao < 0.15 ? 'alta' : l.variacao < 0.5 ? 'média' : 'baixa'}
                </td>
                <td className="right num" data-rotulo="Próximo">
                  {l.proximo === null ? '—' : formatMoney(l.proximo)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint" style={{ margin: 0 }}>
        <strong>Tendência</strong> é a reta que melhor atravessa os doze meses — comparar dois meses
        seguidos é ler ruído. Quando a reta não descreve a série, está escrito "varia demais" em vez
        de um número inventado.
      </p>
    </div>
  );
}

/**
 * A aba que monta o texto para colar numa IA.
 *
 * Três decisões que a tela precisa acertar:
 *
 * 1. **O aviso de privacidade vem antes do texto**, não depois. Colar isto num
 *    chat manda os seus números para a empresa que o opera; quem decide é você,
 *    mas decidindo antes de ver o botão, não depois de apertá-lo.
 * 2. **O texto fica à vista, num campo que dá para editar.** Um botão "copiar"
 *    que entrega um texto invisível pede confiança cega logo onde ela custa
 *    caro — e editar antes de colar é legítimo.
 * 3. **Copiar tem plano B.** A área de transferência é negada em `file://` e em
 *    parte dos navegadores de celular; quando falha, o campo é selecionado e a
 *    tela diz para usar o copiar do próprio aparelho, em vez de fingir sucesso.
 */
function PainelDeIA({
  modelo,
  escolhido,
  onEscolher,
  texto,
  onTexto,
  campo,
}: {
  modelo: ModeloDePrompt;
  escolhido: ChaveDePrompt;
  onEscolher: (chave: ChaveDePrompt) => void;
  texto: string;
  onTexto: (texto: string) => void;
  campo: RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* A explicação que faltava, e que fazia a tela parecer quebrada. Quem não
          sabe que o app não tem servidor não tem como entender por que ele não
          pergunta sozinho — e conclui, com razão, que o botão está com defeito. */}
      <div className="banner" style={{ alignItems: 'flex-start' }}>
        <span className="emoji" aria-hidden="true">💡</span>
        <span>
          <strong>Por que você precisa colar, em vez de o app perguntar sozinho</strong>
          <br />
          <span className="dim">
            Este app não tem servidor: é uma página que roda inteira dentro do seu navegador — é
            isso que o faz funcionar offline e não custar nada. Para perguntar a uma IA sozinho ele
            precisaria de uma chave de API, e uma chave dentro de uma página aberta é pública:
            qualquer pessoa que abrisse o site poderia copiá-la e gastar na conta de quem a
            colocou lá. Então o app faz a parte que sabe fazer — junta e organiza os seus números —
            e você leva.
            <br />
            <strong>Dá para mudar isso:</strong> se você quiser usar uma chave sua, guardada só
            neste aparelho, a resposta passa a aparecer aqui mesmo. É só pedir.
          </span>
        </span>
      </div>

      <div className="banner warn" style={{ alignItems: 'flex-start' }}>
        <span className="emoji" aria-hidden="true">🔒</span>
        <span>
          <strong>Este texto sai do seu aparelho quando você colar</strong>
          <br />
          <span className="dim">
            Vão os totais, as categorias, o custo fixo, as parcelas e os saldos — <strong>nenhuma
            descrição de lançamento</strong>, nenhum nome de quem te pagou ou de onde você comprou.
            Ainda assim, é o retrato do seu dinheiro indo para a empresa que opera o chat. O app não
            manda nada sozinho: quem cola é você.
          </span>
        </span>
      </div>

      <div>
        <span className="label">O que você quer perguntar</span>
        <div className="lista-perguntas">
          {MODELOS.map((m) => (
            <button
              key={m.chave}
              type="button"
              className={`pergunta ${m.chave === escolhido ? 'escolhida' : ''}`}
              aria-pressed={m.chave === escolhido}
              onClick={() => onEscolher(m.chave)}
            >
              <strong>{m.titulo}</strong>
              <span className="dim">{m.descricao}</span>
            </button>
          ))}
        </div>
      </div>

      {modelo.aCompletar && (
        <div className="banner" style={{ alignItems: 'flex-start' }}>
          <span className="emoji" aria-hidden="true">✏️</span>
          <span>
            <strong>Falta completar antes de colar</strong>
            <br />
            <span className="dim">{modelo.aCompletar}</span>
          </span>
        </div>
      )}

      <div>
        <span className="label">O texto, pronto para colar</span>
        {/* À vista, e num campo que dá para editar: um botão "copiar" que
            entrega texto invisível pede confiança cega logo onde ela custa
            caro — e ajustar antes de colar é legítimo. */}
        <textarea
          ref={campo}
          className="input"
          style={{ minHeight: '14rem', fontFamily: 'ui-monospace, monospace', fontSize: '0.78rem' }}
          value={texto}
          onChange={(e) => onTexto(e.target.value)}
          spellCheck={false}
        />
        <p className="hint">
          {texto.length.toLocaleString('pt-BR')} caracteres. Dá para editar antes de copiar.{' '}
          <strong>Claude ↗</strong> e <strong>ChatGPT ↗</strong> copiam e já abrem o chat numa aba
          nova — é só colar lá.
        </p>
      </div>
    </div>
  );
}

/** O botão que abre a análise, para a barra de ações do painel. */
export function BotaoDeAnalise({
  periodo,
  entradas,
}: {
  periodo: Periodo;
  entradas: readonly DisplayEntry[];
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" className="btn sm" onClick={() => setAberto(true)}>
        🔎 Analisar
      </button>
      {aberto && <AnaliseDialog periodo={periodo} entradas={entradas} onClose={() => setAberto(false)} />}
    </>
  );
}
