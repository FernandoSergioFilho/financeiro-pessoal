/**
 * Rede de segurança para erro durante o desenho da tela.
 *
 * Existe por um defeito real: apagar a data de um lançamento fazia uma função
 * de data lançar exceção no meio da renderização, e o React desmonta a árvore
 * inteira quando isso acontece sem ninguém para segurar. O resultado era a
 * tela ficar em branco, sem explicação e sem saída — num aplicativo de
 * dinheiro, o pior jeito possível de falhar.
 *
 * O defeito daquele caso está corrigido na origem. Isto aqui é para o próximo:
 * transforma "a tela sumiu" em uma mensagem com um caminho de volta, e diz o
 * que mais importa saber na hora — que os lançamentos continuam gravados.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  erro: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { erro: null };

  static getDerivedStateFromError(erro: Error): State {
    return { erro };
  }

  override componentDidCatch(erro: Error, info: ErrorInfo): void {
    // O console é o único lugar onde dá para ver o rastro depois: não há
    // servidor de erros, e não vai haver — seria mandar dado financeiro para
    // fora só para achar defeito.
    console.error('Erro na interface:', erro, info.componentStack);
  }

  override render(): ReactNode {
    const { erro } = this.state;
    if (!erro) return this.props.children;

    return (
      <div className="portao">
        <div className="portao-caixa">
          <div className="card">
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="empty" style={{ padding: '12px 0 0' }}>
                <span className="emoji" aria-hidden="true">
                  😕
                </span>
                <h3>Alguma coisa quebrou nesta tela</h3>
                <p>
                  Seus lançamentos continuam salvos neste aparelho — nada se perdeu. Voltar costuma
                  resolver.
                </p>
              </div>

              <div className="row wrap" style={{ justifyContent: 'center' }}>
                <button type="button" className="btn primary" onClick={() => this.setState({ erro: null })}>
                  Tentar de novo
                </button>
                <button type="button" className="btn" onClick={() => window.location.reload()}>
                  Recarregar
                </button>
              </div>

              <details>
                <summary className="dim" style={{ fontSize: '0.82rem', cursor: 'pointer' }}>
                  Detalhes do erro
                </summary>
                <p className="hint" style={{ marginTop: 8, wordBreak: 'break-word' }}>
                  {erro.message}
                </p>
              </details>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
