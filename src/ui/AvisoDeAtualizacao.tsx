/**
 * Avisa quando existe uma versão nova publicada.
 *
 * Sem isto, atualizar era invisível e confuso: o service worker baixava a
 * versão nova e assumia, mas a página já aberta continuava executando o
 * JavaScript antigo — a mudança só aparecia no segundo recarregamento. Quem
 * estava usando via o app "não atualizar" e não tinha como saber por quê.
 *
 * A troca acontece quando a pessoa manda, e não sozinha, porque recarregar por
 * conta própria pode apagar um lançamento digitado pela metade.
 */

import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

export function AvisoDeAtualizacao() {
  const [temNova, setTemNova] = useState(false);
  const [atualizar, setAtualizar] = useState<(() => void) | null>(null);

  useEffect(() => {
    const aplicar = registerSW({
      onNeedRefresh() {
        setTemNova(true);
      },
    });
    // Guardado numa função, senão o `useState` chamaria a atualização na hora
    // de guardar — ele trata função como cálculo do próximo estado.
    setAtualizar(() => () => void aplicar(true));
  }, []);

  if (!temNova) return null;

  return (
    <div className="aviso-versao" role="status">
      <span>
        <strong>Nova versão disponível</strong>
        <br />
        <span className="dim">Seus lançamentos não se perdem ao atualizar.</span>
      </span>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn primary sm" onClick={() => atualizar?.()}>
          Atualizar
        </button>
        <button type="button" className="btn ghost sm" onClick={() => setTemNova(false)}>
          Depois
        </button>
      </div>
    </div>
  );
}
