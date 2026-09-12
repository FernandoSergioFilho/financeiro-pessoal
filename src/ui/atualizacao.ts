/**
 * Procurar versão nova sob demanda.
 *
 * O aviso automático já procura de hora em hora e ao voltar do segundo plano
 * (ver `AvisoDeAtualizacao.tsx`). Este caminho existe para o momento em que a
 * pessoa está desconfiada — "o botão novo não apareceu" — e quer uma resposta
 * agora, em vez de esperar. Ele devolve uma frase para a tela mostrar, porque
 * um botão que parece não fazer nada é pior que nenhum botão.
 */
export async function procurarAtualizacao(): Promise<string> {
  // O `financeiro.html` aberto do disco não tem service worker nenhum, e
  // perguntar por um lá devolve erro de segurança — que a mensagem de falha
  // traduziria como "falta internet", o que é mentira.
  if (window.location.protocol === 'file:') {
    return 'Esta é a cópia de arquivo único, que não se atualiza sozinha: para trocar de versão, baixe o financeiro.html novo.';
  }

  if (!('serviceWorker' in navigator)) {
    return 'Este navegador não guarda o app para uso offline, então ele já abre sempre na versão mais nova.';
  }

  try {
    const registro = await navigator.serviceWorker.getRegistration();
    if (!registro) {
      return 'O app ainda não foi guardado para uso offline neste aparelho — você já está na versão mais nova.';
    }

    await registro.update();
    // `installing` e `waiting` são os dois estados em que uma versão nova já
    // existe: uma baixando, outra pronta esperando a troca.
    if (registro.installing || registro.waiting) {
      return 'Versão nova encontrada. O aviso para atualizar vai aparecer no alto da tela em instantes.';
    }
    return 'Você já está na versão mais nova.';
  } catch {
    return 'Não deu para verificar agora — provavelmente falta internet. Tente de novo daqui a pouco.';
  }
}
