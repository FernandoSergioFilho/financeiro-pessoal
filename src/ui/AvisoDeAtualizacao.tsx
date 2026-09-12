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
 *
 * **Procurar a versão nova é metade do trabalho, e era a metade que faltava.**
 * O registro sozinho só olha uma vez, quando a página carrega. Num app
 * instalado no celular isso pode não acontecer por dias: ele fica suspenso em
 * segundo plano e volta do jeito que estava. O resultado apareceu no uso real
 * — um botão publicado há dias simplesmente não existia no celular, e não era
 * defeito da tela, era a versão velha ainda rodando. Agora o app procura de
 * hora em hora e, principalmente, toda vez que volta para a frente.
 */

import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

/** De quanto em quanto tempo procurar, com o app aberto. */
const INTERVALO_DE_BUSCA = 60 * 60 * 1000;

export function AvisoDeAtualizacao() {
  const [temNova, setTemNova] = useState(false);
  const [atualizar, setAtualizar] = useState<(() => void) | null>(null);

  useEffect(() => {
    let relogio: ReturnType<typeof setInterval> | undefined;
    let aoVoltar: (() => void) | undefined;

    const aplicar = registerSW({
      onNeedRefresh() {
        setTemNova(true);
      },
      onRegisteredSW(_url, registro) {
        if (!registro) return;

        const procurar = () => {
          // Sem rede não adianta perguntar, e o erro apareceria no console a
          // cada hora sem nada a fazer a respeito.
          if (navigator.onLine === false) return;
          void registro.update().catch(() => {
            // Falhou a busca: a próxima tentativa resolve. Não há o que
            // dizer a quem está usando.
          });
        };

        relogio = setInterval(procurar, INTERVALO_DE_BUSCA);

        // O momento que mais importa: o app volta do segundo plano. É quando
        // a pessoa abre para lançar alguma coisa, e quando ela repararia que
        // falta um botão.
        aoVoltar = () => {
          if (document.visibilityState === 'visible') procurar();
        };
        document.addEventListener('visibilitychange', aoVoltar);
      },
    });
    // Guardado numa função, senão o `useState` chamaria a atualização na hora
    // de guardar — ele trata função como cálculo do próximo estado.
    setAtualizar(() => () => void aplicar(true));

    return () => {
      if (relogio) clearInterval(relogio);
      if (aoVoltar) document.removeEventListener('visibilitychange', aoVoltar);
    };
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
