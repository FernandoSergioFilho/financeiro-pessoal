/**
 * As telas que aparecem antes do aplicativo: entrar, e esperar a liberação.
 *
 * Existem porque o endereço publicado é aberto — qualquer um pode abri-lo. Quem
 * não entrou não vê lançamento nenhum, e quem se cadastrou não vê nada até o
 * dono liberar. Vale dizer o que estas telas NÃO são: a barreira de verdade
 * está no banco, nas políticas de acesso. Sem ser membro da carteira, o
 * servidor não devolve nem aceita um único registro, mesmo para quem chame a
 * API por fora do aplicativo. Isto aqui é a cara daquilo.
 */

import { useState } from 'react';

import { useFinance } from '../../state/store.tsx';
import { Diagnostico, LoginForm } from '../components/CloudPanel.tsx';

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="portao">
      <div className="portao-caixa">
        <div className="brand" style={{ padding: '0 0 4px' }}>
          <span className="brand-mark" aria-hidden="true">
            R$
          </span>
          <span className="brand-text">
            Financeiro
            <small>controle pessoal</small>
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Primeira tela de quem chega sem conta. */
export function EntrarPage() {
  const [mostrarAjuda, setMostrarAjuda] = useState(false);

  return (
    <Moldura>
      <div className="card">
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <LoginForm />
        </div>
      </div>

      {/* O diagnóstico fica recolhido: quem só quer entrar não precisa vê-lo,
          e quem está com a configuração quebrada precisa achá-lo em algum
          lugar — e este é o único lugar que essa pessoa consegue alcançar. */}
      {mostrarAjuda ? (
        <div className="card">
          <div className="card-body">
            <Diagnostico />
          </div>
        </div>
      ) : (
        <button type="button" className="btn ghost sm" onClick={() => setMostrarAjuda(true)}>
          Não consigo entrar
        </button>
      )}
    </Moldura>
  );
}

/** Cadastrou e está esperando o dono liberar — ou foi recusado. */
export function EsperandoPage({ recusado }: { recusado: boolean }) {
  const { cloud, cloudApi } = useFinance();
  const [conferindo, setConferindo] = useState(false);

  async function conferir() {
    setConferindo(true);
    try {
      await cloudApi.reconferirAcesso();
    } finally {
      setConferindo(false);
    }
  }

  return (
    <Moldura>
      <div className="card">
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="empty" style={{ padding: '20px 0 4px' }}>
            <span className="emoji" aria-hidden="true">
              {recusado ? '🚫' : '⏳'}
            </span>
            <h3>{recusado ? 'Acesso não liberado' : 'Esperando liberação'}</h3>
            <p>
              {recusado
                ? 'Esta conta não tem acesso a esta carteira. Se você acha que é engano, fale com quem administra.'
                : 'Sua conta foi criada e o pedido chegou para quem administra a carteira. Assim que for liberado, os lançamentos aparecem aqui.'}
            </p>
          </div>

          <div className="row wrap" style={{ justifyContent: 'center' }}>
            {!recusado && (
              <button type="button" className="btn primary" onClick={() => void conferir()} disabled={conferindo}>
                {conferindo ? 'Conferindo…' : 'Já liberou?'}
              </button>
            )}
            <button type="button" className="btn ghost" onClick={() => void cloudApi.sair()}>
              Sair
            </button>
          </div>

          <p className="hint" style={{ textAlign: 'center' }}>
            Entrou como {cloud.email}.
          </p>
        </div>
      </div>
    </Moldura>
  );
}
