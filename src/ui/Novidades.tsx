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
  CHAVE_DE_NOVIDADES, LIMITE_DE_NOVIDADES, NOVIDADES, novidadesNaoVistas, pedacosDoTexto,
  type Novidade,
} from '../novidades.ts';
import { formatDate } from '../domain/date.ts';
import { useFinance } from '../state/store.tsx';
import { Dialog } from './components/primitives.tsx';

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

/** A janela em si, também usada pelo botão "Ver o que mudou" dos Ajustes. */
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
      <p className="hint">Seus dados não mudam de lugar com a atualização.</p>
    </Dialog>
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

/** O que mostrar quando se pede para rever, em vez de esperar atualizar. */
export function todasAsNovidades(): Novidade[] {
  return NOVIDADES.slice(0, LIMITE_DE_NOVIDADES);
}
