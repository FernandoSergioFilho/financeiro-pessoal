/**
 * A janela de "o que mudou", depois que o app se atualizou.
 *
 * O texto e a regra de o que mostrar estão em `src/novidades.ts`; aqui é a
 * tela e a única parte com estado: lembrar o que já foi lido.
 *
 * **Quem está abrindo o app pela primeira vez não vê nada.** Mostrar "o que
 * mudou" para quem nunca viu a versão anterior é contar uma história sem
 * começo. Nesse caso o app só anota em silêncio onde a pessoa entrou, para
 * que a *próxima* atualização tenha o que comparar.
 */

import { useEffect, useRef, useState } from 'react';

import {
  CHAVE_DE_NOVIDADES, NOVIDADES, novidadesNaoVistas, pedacosDoTexto, type Novidade,
} from '../novidades.ts';
import { formatDate } from '../domain/date.ts';
import { useFinance } from '../state/store.tsx';
import { Card, Dialog } from './components/primitives.tsx';

/** Quantas entradas o histórico mostra antes de alguém pedir o resto. */
const QUANTAS_DE_INICIO = 3;

function lerUltimaVista(): string | null {
  try {
    return localStorage.getItem(CHAVE_DE_NOVIDADES);
  } catch {
    // Navegador com armazenamento bloqueado: sem memória do que foi lido, o
    // aviso simplesmente não aparece — melhor que aparecer toda vez.
    return 'sem-armazenamento';
  }
}

function guardarUltimaVista(): void {
  try {
    const topo = NOVIDADES[0]?.id;
    if (topo) localStorage.setItem(CHAVE_DE_NOVIDADES, topo);
  } catch {
    // Nada a fazer; ver acima.
  }
}

/** A lista em si, igual na janela e no histórico dos Ajustes. */
function ListaDeNovidades({ novidades }: { novidades: readonly Novidade[] }) {
  return (
    <div className="novidades">
      {novidades.map((novidade) => (
        <section key={novidade.id}>
          <h3>
            {novidade.titulo}
            <span className="dim num"> · {formatDate(novidade.data)}</span>
          </h3>
          <ul>
            {novidade.itens.map((item) => (
              <li key={item}>
                {pedacosDoTexto(item).map((pedaco, i) =>
                  pedaco.forte ? <strong key={i}>{pedaco.texto}</strong> : <span key={i}>{pedaco.texto}</span>,
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** A janela que aparece sozinha depois de o app se atualizar. */
export function DialogoDeNovidades({
  novidades,
  onClose,
}: {
  novidades: readonly Novidade[];
  onClose: () => void;
}) {
  return (
    <Dialog
      title={novidades.length > 1 ? 'O que mudou' : 'O que mudou nesta versão'}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn primary" onClick={onClose}>
            Entendi
          </button>
        </>
      }
    >
      <ListaDeNovidades novidades={novidades} />
      <p className="hint">Seus dados não mudam de lugar com a atualização.</p>
    </Dialog>
  );
}

/**
 * O histórico inteiro, no fim dos Ajustes.
 *
 * **Começa recolhido nas três últimas.** A lista desce até o primeiro dia do
 * app, e despejá-la inteira numa página que já é longa empurraria para fora da
 * tela tudo o que está acima dela. Quem quer o histórico pede por ele — e aí
 * recebe tudo, sem paginar, porque a pergunta que leva alguém aqui é "quando
 * foi que isso mudou?", e ela se responde rolando.
 */
export function HistoricoDeAlteracoes() {
  const [tudo, setTudo] = useState(false);
  const mostradas = tudo ? NOVIDADES : NOVIDADES.slice(0, QUANTAS_DE_INICIO);
  const faltam = NOVIDADES.length - mostradas.length;

  return (
    <Card title="Histórico de alterações">
      {/* Com a margem padrão o texto encosta no título da primeira alteração
          e os dois viram um bloco só. */}
      <p className="hint" style={{ margin: '0 0 14px' }}>
        Tudo o que mudou no app, do mais recente para o mais antigo.{' '}
        <span className="num">{NOVIDADES.length}</span> alterações desde{' '}
        {formatDate(NOVIDADES[NOVIDADES.length - 1]?.data ?? NOVIDADES[0]!.data)}.
      </p>
      <ListaDeNovidades novidades={mostradas} />
      {faltam > 0 && (
        <button
          type="button"
          className="btn"
          style={{ marginTop: 14 }}
          onClick={() => setTudo(true)}
        >
          Mostrar as {faltam} anteriores
        </button>
      )}
    </Card>
  );
}

/** Decide sozinho se há o que contar, e conta uma vez só. */
export function AvisoDeNovidades() {
  const { data, loading } = useFinance();
  const [fila, setFila] = useState<Novidade[] | null>(null);
  // A decisão é de uma vez só: `data` muda a cada digitação, e sem isto a
  // janela voltaria a aparecer no meio de um lançamento.
  const decidiu = useRef(false);

  useEffect(() => {
    if (loading || decidiu.current) return;
    decidiu.current = true;

    const ultima = lerUltimaVista();
    const estreando = ultima === null && data.entries.length === 0;
    const novas = novidadesNaoVistas(NOVIDADES, ultima);
    if (estreando || novas.length === 0) {
      guardarUltimaVista();
      return;
    }
    setFila(novas);
  }, [loading, data.entries.length]);

  if (!fila) return null;

  return (
    <DialogoDeNovidades
      novidades={fila}
      onClose={() => {
        guardarUltimaVista();
        setFila(null);
      }}
    />
  );
}

