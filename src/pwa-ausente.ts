/**
 * Substituto de `virtual:pwa-register` para o build de arquivo único.
 *
 * O `financeiro.html` é aberto do disco e não tem service worker nenhum — não
 * há o que atualizar, e o módulo virtual do plugin nem existe naquele build.
 * Sem este substituto, a compilação falha ao não achar o módulo.
 */
export interface OpcoesDeRegistro {
  onNeedRefresh?: () => void;
  onRegisteredSW?: (url: string, registro: ServiceWorkerRegistration | undefined) => void;
}

export function registerSW(_opcoes?: OpcoesDeRegistro): (recarregar?: boolean) => Promise<void> {
  return async () => {};
}
