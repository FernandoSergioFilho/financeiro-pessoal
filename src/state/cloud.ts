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
  aprovarPedido,
  getSupabase,
  isCloudEnabled,
  membros,
  meuAcesso,
  onAuthChange,
  pedidosPendentes,
  recusarPedido,
  removerMembro,
  signIn,
  signOut,
  signUp,
  souDono,
  type Membro,
  type Pedido,
} from '../data/supabase.ts';

/**
 * `pending` e `rejected` são quem se cadastrou e ainda não foi liberado pelo
 * dono. Nesses dois estados não existe repositório de sincronização: não há
 * carteira para sincronizar com.
 */
export type CloudStatus = 'off' | 'signed-out' | 'connecting' | 'ready' | 'pending' | 'rejected' | 'error';

export interface CloudState {
  /** O app foi compilado com as chaves? Sem isso, tudo aqui fica desligado. */
  enabled: boolean;
  status: CloudStatus;
  email: string | null;
  walletId: string | null;
  /** Só o dono libera cadastros novos; a tela esconde o que ele não pode usar. */
  dono: boolean;
  error?: string;
  sync: SyncState;
}

export interface CloudApi {
  entrar(email: string, senha: string): Promise<void>;
  criarConta(email: string, senha: string): Promise<void>;
  sair(): Promise<void>;
  sincronizarAgora(): void;
  /** Tenta de novo o `meu_acesso()` — usado pelo botão "Já liberou?". */
  reconferirAcesso(): Promise<void>;
  pedidos(): Promise<Pedido[]>;
  membros(): Promise<Membro[]>;
  aprovar(userId: string): Promise<void>;
  recusar(userId: string): Promise<void>;
  remover(userId: string): Promise<void>;
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
    dono: false,
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

  /** Guardado para o botão "Já liberou?" poder repetir a checagem. */
  const conectarRef = useRef<(email: string | null) => Promise<void>>(async () => {});

  useEffect(() => {
    if (!enabled) return;

    let cancelado = false;

    const conectar = async (email: string | null) => {
      if (!email) {
        repo.current = null;
        if (!cancelado) atualizar({ status: 'signed-out', email: null, walletId: null, dono: false });
        return;
      }
      try {
        const acesso = await meuAcesso();
        if (cancelado) return;

        // Cadastrado e ainda não liberado: sem carteira, não há o que
        // sincronizar. O app mostra a tela de espera.
        if (acesso.situacao !== 'liberado' || !acesso.walletId) {
          repo.current = null;
          atualizar({
            status: acesso.situacao === 'rejected' ? 'rejected' : 'pending',
            email,
            walletId: null,
            dono: false,
            error: undefined,
          });
          return;
        }

        repo.current = new SyncingRepository(new LocalStorageRepository(), new SupabaseRemote(acesso.walletId));
        repo.current.onStateChange((sync) => atualizar({ sync }));
        // Zerado para que a primeira sincronização mande tudo o que já existe
        // neste aparelho, em vez de só o que mudar daqui para frente.
        jaEnviado.current = '';
        const dono = await souDono();
        if (cancelado) return;
        atualizar({ status: 'ready', email, walletId: acesso.walletId, dono, error: undefined });
      } catch (erro) {
        // Sem rede, `meu_acesso()` falha. O app segue aberto e local — travar
        // aqui deixaria o atalho instalado no celular inútil offline.
        if (!cancelado) {
          atualizar({ status: 'error', email, error: erro instanceof Error ? erro.message : String(erro) });
        }
      }
    };
    conectarRef.current = conectar;

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
    async entrar(email, senha) {
      await signIn(email, senha);
    },
    async criarConta(email, senha) {
      await signUp(email, senha);
    },
    async sair() {
      await signOut();
      repo.current = null;
      atualizar({ status: 'signed-out', email: null, walletId: null, dono: false });
    },
    sincronizarAgora() {
      void sincronizar();
    },
    async reconferirAcesso() {
      await conectarRef.current(state.email);
    },
    pedidos: pedidosPendentes,
    membros,
    async aprovar(userId) {
      await aprovarPedido(userId);
    },
    async recusar(userId) {
      await recusarPedido(userId);
    },
    async remover(userId) {
      await removerMembro(userId);
    },
  };

  return [state, api];
}
