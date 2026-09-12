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
  const [aba, setAba] = useState<'leitura' | 'ia'>('leitura');

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
          {aba === 'ia' && (
            <button type="button" className="btn primary" onClick={() => void copiar()}>
              📋 Copiar o texto
            </button>
          )}
          <button type="button" className={aba === 'ia' ? 'btn' : 'btn primary'} onClick={onClose}>
            Fechar
          </button>
        </>
      }
    >
      {/* O mesmo `.segmented` das outras telas: um controle novo aqui seria um
          jeito a mais de fazer a mesma coisa. */}
      <div className="segmented" style={{ marginBottom: 14 }}>
        <button type="button" aria-pressed={aba === 'leitura'} onClick={() => setAba('leitura')}>
          Leitura do período
        </button>
        <button type="button" aria-pressed={aba === 'ia'} onClick={() => setAba('ia')}>
          Perguntar a uma IA
        </button>
      </div>

      {aba === 'ia' ? (
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
          {texto.length.toLocaleString('pt-BR')} caracteres. Dá para editar antes de copiar.
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
