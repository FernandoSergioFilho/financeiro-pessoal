import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './ui/App.tsx';
import { AvisoDeAtualizacao } from './ui/AvisoDeAtualizacao.tsx';
import { ErrorBoundary } from './ui/ErrorBoundary.tsx';
import { FinanceProvider } from './state/store.tsx';
import './ui/styles/app.css';

const container = document.getElementById('root');
if (!container) throw new Error('Elemento #root não encontrado.');

createRoot(container).render(
  <StrictMode>
    {/* Por fora do provedor: um erro ao carregar os dados também precisa cair
        numa tela com explicação, e não numa página em branco. */}
    <ErrorBoundary>
      <FinanceProvider>
        <App />
      </FinanceProvider>
      {/* Fora do App de propósito: o aviso precisa aparecer também na tela de
          entrar e na de espera, que ficam antes do portão. */}
      <AvisoDeAtualizacao />
    </ErrorBoundary>
  </StrictMode>,
);
