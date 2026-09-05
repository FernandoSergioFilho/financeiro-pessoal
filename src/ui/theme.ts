/**
 * Tema claro/escuro.
 *
 * A preferência mora numa chave própria do `localStorage`, separada dos dados
 * financeiros: restaurar um backup de outro computador não deve arrastar junto
 * o tema de quem exportou.
 */

import { useCallback, useEffect, useState } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'financeiro-pessoal:tema';

function read(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    // Navegador com armazenamento bloqueado: segue o sistema.
    return 'system';
  }
}

export function useTheme(): [ThemeChoice, (theme: ThemeChoice) => void] {
  const [theme, setTheme] = useState<ThemeChoice>(read);

  useEffect(() => {
    // Sem `data-theme` o CSS cai na consulta `prefers-color-scheme`, que é
    // exatamente o comportamento "do sistema".
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);

    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Não poder lembrar a escolha não é motivo para quebrar a tela.
    }
  }, [theme]);

  return [theme, useCallback((next: ThemeChoice) => setTheme(next), [])];
}
