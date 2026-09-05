/**
 * Sessão na nuvem: quem está logado, qual carteira, e quando sincronizar.
 *
 * Fica separado do estado financeiro de propósito. Os lançamentos continuam
 * sendo a fonte da verdade local e não dependem de nada disto — se a nuvem
 * não estiver configurada, ou o usuário não entrar, o app funciona igual.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { highWaterMark } from '../domain/sync.ts';
import type { FinanceData } from '../domain/types.ts';
import { LocalStorageRepository } from '../data/repository.ts';
import { SupabaseRemote } from '../data/supabase-remote.ts';
import { SyncingRepository, type SyncState } from '../data/sync-repository.ts';
import {
  acceptInvite,
  createInvite,
  ensureWallet,
  getSupabase,
  isCloudEnabled,
  onAuthChange,
  sendMagicLink,
  signOut,
} from '../data/supabase.ts';

export type CloudStatus = 'off' | 'signed-out' | 'connecting' | 'ready' | 'error';

export interface CloudState {
  /** O app foi compilado com as chaves? Sem isso, tudo aqui fica desligado. */
  enabled: boolean;
  status: CloudStatus;
  email: string | null;
  walletId: string | null;
  error?: string;
  sync: SyncState;
}

export interface CloudApi {
  entrar(email: string): Promise<void>;
  sair(): Promise<void>;
  convidar(): Promise<string>;
  entrarComConvite(code: string): Promise<void>;
  sincronizarAgora(): void;
}

/** De quanto em quanto tempo buscar o que o outro aparelho lançou. */
const INTERVALO_MS = 60_000;
/** Espera depois da última tecla antes de enviar. */
const ESPERA_MS = 2_000;

export function useCloud(
  data: FinanceData,
  aplicar: (data: FinanceData) => void,
): [CloudState, CloudApi] {
  const enabled = isCloudEnabled();
  const [state, setState] = useState<CloudState>({
    enabled,
    status: enabled ? 'connecting' : 'off',
    email: null,
    walletId: null,
    sync: { status: 'idle', lastSyncedAt: null },
  });

  const repo = useRef<SyncingRepository | null>(null);
  const sincronizando = useRef(false);
  /** Marca dos dados que já foram enviados, para não sincronizar à toa. */
  const jaEnviado = useRef<string>('');
  /** O estado mais recente, para o temporizador não usar um retrato velho. */
  const dadosAtuais = useRef(data);
  dadosAtuais.current = data;

  const atualizar = useCallback((patch: Partial<CloudState>) => {
    setState((s) => ({ ...s, ...patch }));
  }, []);

  /* -------------------------------------------------- login e carteira */

  useEffect(() => {
    if (!enabled) return;

    let cancelado = false;

    const conectar = async (email: string | null) => {
      if (!email) {
        repo.current = null;
        if (!cancelado) atualizar({ status: 'signed-out', email: null, walletId: null });
        return;
      }
      try {
        const walletId = await ensureWallet();
        if (cancelado) return;
        repo.current = new SyncingRepository(new LocalStorageRepository(), new SupabaseRemote(walletId));
        repo.current.onStateChange((sync) => atualizar({ sync }));
        // Zerado para que a primeira sincronização mande tudo o que já existe
        // neste aparelho, em vez de só o que mudar daqui para frente.
        jaEnviado.current = '';
        atualizar({ status: 'ready', email, walletId, error: undefined });
      } catch (erro) {
        if (!cancelado) {
          atualizar({ status: 'error', email, error: erro instanceof Error ? erro.message : String(erro) });
        }
      }
    };

    void getSupabase()
      ?.auth.getSession()
      .then(({ data: sessao }) => conectar(sessao.session?.user.email ?? null));

    const parar = onAuthChange((user) => void conectar(user?.email ?? null));
    return () => {
      cancelado = true;
      parar();
    };
  }, [enabled, atualizar]);

  /* ------------------------------------------------------ sincronizar */

  const sincronizar = useCallback(async () => {
    const atual = repo.current;
    if (!atual || sincronizando.current) return;

    sincronizando.current = true;
    try {
      const merged = await atual.sync(dadosAtuais.current);
      if (merged) {
        jaEnviado.current = highWaterMark(merged);
        aplicar(merged);
      }
    } finally {
      sincronizando.current = false;
    }
  }, [aplicar]);

  // Depois que o usuário para de mexer, envia o que mudou.
  useEffect(() => {
    if (state.status !== 'ready') return;
    if (highWaterMark(data) === jaEnviado.current) return;

    const timer = setTimeout(() => void sincronizar(), ESPERA_MS);
    return () => clearTimeout(timer);
  }, [data, state.status, sincronizar]);

  // De tempos em tempos, e ao voltar a conexão, busca o que veio do outro lado.
  useEffect(() => {
    if (state.status !== 'ready') return;

    void sincronizar();
    const intervalo = setInterval(() => void sincronizar(), INTERVALO_MS);
    const aoVoltar = () => void sincronizar();
    window.addEventListener('online', aoVoltar);
    return () => {
      clearInterval(intervalo);
      window.removeEventListener('online', aoVoltar);
    };
  }, [state.status, sincronizar]);

  /* -------------------------------------------------------------- ações */

  const api: CloudApi = {
    async entrar(email) {
      await sendMagicLink(email);
    },
    async sair() {
      await signOut();
      repo.current = null;
      atualizar({ status: 'signed-out', email: null, walletId: null });
    },
    async convidar() {
      if (!state.walletId) throw new Error('Entre na sua conta antes de convidar alguém.');
      return createInvite(state.walletId);
    },
    async entrarComConvite(code) {
      const walletId = await acceptInvite(code);
      repo.current = new SyncingRepository(new LocalStorageRepository(), new SupabaseRemote(walletId));
      repo.current.onStateChange((sync) => atualizar({ sync }));
      jaEnviado.current = '';
      atualizar({ walletId, status: 'ready' });
    },
    sincronizarAgora() {
      void sincronizar();
    },
  };

  return [state, api];
}
