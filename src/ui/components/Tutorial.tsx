/**
 * O tutorial, em sanfona.
 *
 * Nove capítulos abertos de uma vez seriam uma parede de texto que ninguém lê.
 * Fechados, viram um índice: a pessoa vê os nove assuntos de relance e abre o
 * que é a dúvida dela. O primeiro nasce aberto para a tela não parecer uma
 * lista de links mortos.
 *
 * O conteúdo mora em `domain/tutorial.ts`, com um teste que cobra que nenhum
 * capítulo fique vazio — um tutorial com buraco no meio é pior do que nenhum.
 */

import { useState } from 'react';

import { CAPITULOS } from '../../domain/tutorial.ts';
import { Dialog } from './primitives.tsx';

export function TutorialDialog({ onClose }: { onClose: () => void }) {
  const [aberto, setAberto] = useState<string | null>(CAPITULOS[0]?.id ?? null);

  return (
    <Dialog
      title="Como usar o aplicativo"
      onClose={onClose}
      larga
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn primary" onClick={onClose}>
            Fechar
          </button>
        </>
      }
    >
      <p className="hint" style={{ marginTop: 0 }}>
        Toque num assunto para abrir. A ordem é a de quem está começando — mas dá para ir direto
        ao que interessa.
      </p>

      <div className="tutorial">
        {CAPITULOS.map((c) => {
          const estaAberto = aberto === c.id;
          return (
            <div key={c.id} className={`capitulo ${estaAberto ? 'aberto' : ''}`}>
              <button
                type="button"
                className="cabeca"
                aria-expanded={estaAberto}
                onClick={() => setAberto(estaAberto ? null : c.id)}
              >
                <span className="emoji" aria-hidden="true">{c.emoji}</span>
                <span className="texto">
                  <strong>{c.titulo}</strong>
                  <span className="dim">{c.resumo}</span>
                </span>
                <span className="seta" aria-hidden="true">{estaAberto ? '−' : '+'}</span>
              </button>

              {estaAberto && (
                <div className="corpo">
                  <ol>
                    {c.passos.map((p) => (
                      <li key={p.titulo}>
                        <strong>{p.titulo}</strong>
                        {p.detalhe && <span className="dim"> {p.detalhe}</span>}
                      </li>
                    ))}
                  </ol>
                  {c.nota && (
                    <p className="nota">
                      <strong>Vale saber:</strong> {c.nota}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}
