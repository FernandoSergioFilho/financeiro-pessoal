/**
 * Conta, sincronização e convite — tudo o que a versão online acrescentou
 * à interface, reunido num lugar só dentro de Ajustes.
 */

import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { formatDate } from '../../domain/date.ts';
import { useFinance } from '../../state/store.tsx';
import { diagnosticar, type Verificacao } from '../../data/diagnostico.ts';
import { SENHA_MINIMA, type Membro, type Pedido } from '../../data/supabase.ts';
import { Card, ConfirmDialog, Field, Segmented } from './primitives.tsx';

/** Frase curta do estado atual, para caber na barra superior. */
export function syncLabel(status: string, lastSyncedAt: string | null): string {
  switch (status) {
    case 'syncing':
      return 'Sincronizando…';
    case 'offline':
      return 'Sem conexão';
    case 'error':
      return 'Erro ao sincronizar';
    default:
      return lastSyncedAt ? `Sincronizado ${horaCurta(lastSyncedAt)}` : 'Sincronizado';
  }
}

function horaCurta(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date().toDateString() === d.toDateString();
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return hoje ? `às ${hora}` : `em ${formatDate(iso.slice(0, 10))}`;
}

/**
 * Versão curta do mesmo estado. Na barra de um celular, "Sincronizado às
 * 23:11" sozinho toma metade da largura e não sobra nada para o título da
 * página — que foi exatamente o que aconteceu.
 */
function syncCurto(status: string, lastSyncedAt: string | null): string {
  switch (status) {
    case 'offline':
      return 'Sem conexão';
    case 'error':
      return 'Erro';
    case 'syncing':
      return '';
    default:
      return lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
  }
}

/** Selo discreto na barra superior; some quando o app roda só local. */
export function SyncBadge() {
  const { cloud, cloudApi } = useFinance();
  if (!cloud.enabled || cloud.status !== 'ready') return null;

  const { status, lastSyncedAt } = cloud.sync;
  const tone = status === 'offline' || status === 'error' ? 'bad' : status === 'syncing' ? 'dim' : 'muted';
  const completo = syncLabel(status, lastSyncedAt);
  const icone = status === 'syncing' ? '⟳' : status === 'offline' ? '⚠' : '✓';

  return (
    <button
      type="button"
      className={`btn ghost sm sync-badge ${tone}`}
      onClick={cloudApi.sincronizarAgora}
      title={`${completo} — toque para sincronizar agora`}
      aria-label={`${completo}. Sincronizar agora`}
    >
      <span aria-hidden="true">{icone}</span>
      {/* O mesmo texto em duas versões; o CSS escolhe pela largura da tela. */}
      <span className="so-estreito" aria-hidden="true">
        {syncCurto(status, lastSyncedAt)}
      </span>
      <span className="so-largo" aria-hidden="true">
        {completo}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ login */

export function LoginForm() {
  const { cloudApi } = useFinance();
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setErro('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErro('Digite um e-mail válido.');
    if (senha.length < SENHA_MINIMA) {
      return setErro(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
    }

    setEnviando(true);
    try {
      if (modo === 'entrar') await cloudApi.entrar(email, senha);
      else await cloudApi.criarConta(email, senha);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível entrar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    // `noValidate` de propósito: os campos mantêm o `type` certo para o
    // teclado do celular, mas a mensagem que aparece é a nossa, em português.
    // `form-narrow` porque campo de e-mail e senha esticados na largura de um
    // monitor ficam desconfortáveis de ler e de mirar.
    <form onSubmit={submit} noValidate className="form-narrow" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p className="muted" style={{ fontSize: '0.88rem' }}>
        Entre para ver os mesmos lançamentos no celular e no computador.
      </p>

      <Segmented
        options={[
          { value: 'entrar', label: 'Entrar' },
          { value: 'criar', label: 'Criar conta' },
        ]}
        value={modo}
        onChange={(next) => {
          setModo(next);
          setErro('');
        }}
      />

      <Field label="Seu e-mail">
        {(id) => (
          <input
            id={id}
            type="email"
            className="input"
            autoComplete="email"
            placeholder="voce@exemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
      </Field>

      <Field
        label="Senha"
        error={erro}
        hint={modo === 'criar' ? `Pelo menos ${SENHA_MINIMA} caracteres.` : undefined}
      >
        {(id) => (
          <input
            id={id}
            type="password"
            className="input"
            // Diz ao gerenciador de senhas se é para guardar uma nova ou
            // preencher a que já existe.
            autoComplete={modo === 'criar' ? 'new-password' : 'current-password'}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        )}
      </Field>

      <div className="row">
        <button type="submit" className="btn primary" disabled={enviando}>
          {enviando ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------- liberar o acesso */

/**
 * A fila de quem se cadastrou e está esperando, com a lista de quem já está
 * dentro. Só o dono da carteira enxerga isto — e é o banco que garante:
 * as funções recusam qualquer outro, então esconder aqui é conveniência,
 * não segurança.
 */
function Aprovacoes() {
  const { cloud, cloudApi } = useFinance();
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const [pessoas, setPessoas] = useState<Membro[]>([]);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState('');
  const [removendo, setRemovendo] = useState<Membro | null>(null);

  const recarregar = useCallback(async () => {
    setErro('');
    try {
      const [fila, lista] = await Promise.all([cloudApi.pedidos(), cloudApi.membros()]);
      setPedidos(fila);
      setPessoas(lista);
    } catch (e) {
      setPedidos([]);
      setErro(e instanceof Error ? e.message : 'Não foi possível ler os pedidos.');
    }
  }, [cloudApi]);

  useEffect(() => {
    if (cloud.dono) void recarregar();
  }, [cloud.dono, recarregar]);

  if (!cloud.dono) return null;

  async function decidir(userId: string, acao: 'aprovar' | 'recusar') {
    setOcupado(userId);
    setErro('');
    try {
      await (acao === 'aprovar' ? cloudApi.aprovar(userId) : cloudApi.recusar(userId));
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível concluir.');
    } finally {
      setOcupado('');
    }
  }

  async function remover(membro: Membro) {
    setRemovendo(null);
    setOcupado(membro.userId);
    try {
      await cloudApi.remover(membro.userId);
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível remover.');
    } finally {
      setOcupado('');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="setting">
        <div className="setting-text">
          <div className="title">
            Pedidos de acesso
            {pedidos && pedidos.length > 0 && <span className="tag pendente-aviso">{pedidos.length}</span>}
          </div>
          <div className="dim">
            Quem se cadastra no site fica esperando aqui e não enxerga nada até você liberar.
          </div>
        </div>
        <button type="button" className="btn sm" onClick={() => void recarregar()}>
          Atualizar
        </button>
      </div>

      {pedidos === null ? (
        <p className="hint">Carregando…</p>
      ) : pedidos.length === 0 ? (
        <p className="hint">Ninguém esperando.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pedidos.map((pedido) => (
            <div key={pedido.userId} className="setting">
              <div className="setting-text">
                <div className="title trunc" title={pedido.email}>
                  {pedido.email}
                </div>
                <div className="dim">Pediu em {formatDate(pedido.pedidoEm.slice(0, 10))}</div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="btn sm primary"
                  disabled={ocupado === pedido.userId}
                  onClick={() => void decidir(pedido.userId, 'aprovar')}
                >
                  Liberar
                </button>
                <button
                  type="button"
                  className="btn sm ghost"
                  disabled={ocupado === pedido.userId}
                  onClick={() => void decidir(pedido.userId, 'recusar')}
                >
                  Recusar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {pessoas.length > 1 && (
        <>
          <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: 0 }} />
          <div className="setting-text">
            <div className="title">Quem está na carteira</div>
          </div>
          {pessoas.map((pessoa) => (
            <div key={pessoa.userId} className="setting">
              <div className="setting-text">
                <div className="title trunc" title={pessoa.email}>
                  {pessoa.email}
                </div>
                <div className="dim">{pessoa.dono ? 'Dono' : `Desde ${formatDate(pessoa.desde.slice(0, 10))}`}</div>
              </div>
              {!pessoa.dono && (
                <button
                  type="button"
                  className="btn sm ghost"
                  disabled={ocupado === pessoa.userId}
                  onClick={() => setRemovendo(pessoa)}
                >
                  Tirar acesso
                </button>
              )}
            </div>
          ))}
        </>
      )}

      {erro && <p className="error">{erro}</p>}

      {removendo && (
        <ConfirmDialog
          title="Tirar o acesso"
          confirmLabel="Tirar acesso"
          message={`${removendo.email} deixa de enxergar e editar os lançamentos. Os lançamentos que essa pessoa criou continuam na carteira.`}
          onConfirm={() => void remover(removendo)}
          onCancel={() => setRemovendo(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------ diagnóstico */

export function Diagnostico() {
  const [itens, setItens] = useState<Verificacao[] | null>(null);
  const [rodando, setRodando] = useState(false);

  async function verificar() {
    setRodando(true);
    try {
      setItens(await diagnosticar());
    } finally {
      setRodando(false);
    }
  }

  const icone = (s: Verificacao['situacao']) => (s === 'ok' ? '✅' : s === 'falha' ? '❌' : '⏭️');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="setting">
        <div className="setting-text">
          <div className="title">Verificar configuração</div>
          <div className="dim">Testa cada peça em separado e diz o que falta.</div>
        </div>
        <button type="button" className="btn sm" onClick={() => void verificar()} disabled={rodando}>
          {rodando ? 'Verificando…' : 'Verificar'}
        </button>
      </div>

      {itens && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {itens.map((item) => (
            <div key={item.nome} style={{ fontSize: '0.84rem' }}>
              <div>
                <span aria-hidden="true">{icone(item.situacao)}</span>{' '}
                <strong>{item.nome}</strong>
              </div>
              <div className="dim" style={{ paddingLeft: 22 }}>{item.detalhe}</div>
              {item.comoResolver && (
                <div className="bad" style={{ paddingLeft: 22 }}>→ {item.comoResolver}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ painel */

export function CloudPanel() {
  const { cloud, cloudApi } = useFinance();

  if (!cloud.enabled) {
    return (
      <Card title="Sincronizar entre aparelhos">
        <p className="muted" style={{ fontSize: '0.88rem' }}>
          Esta cópia do aplicativo roda só neste aparelho. Para ver os mesmos lançamentos no celular e no
          computador, use a versão publicada na web.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Conta e sincronização">
      {cloud.status === 'connecting' && <p className="dim">Conectando…</p>}

      {cloud.status === 'error' && (
        <div className="banner warn">
          <span className="emoji" aria-hidden="true">⚠️</span>
          <span>
            <strong>Não foi possível falar com o servidor</strong>
            <br />
            <span className="dim">{cloud.error}</span>
            <br />
            <span className="dim">Seus lançamentos continuam salvos neste aparelho.</span>
          </span>
        </div>
      )}

      {cloud.status === 'ready' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="setting">
            <div className="setting-text">
              {/* O e-mail não quebra em pedaços: fica numa linha só e, se não
                  couber, termina em reticências. */}
              <div className="title trunc" title={cloud.email ?? undefined}>
                {cloud.email}
              </div>
              <div className="dim">
                {syncLabel(cloud.sync.status, cloud.sync.lastSyncedAt)}
                {cloud.sync.status === 'offline' && ' — o que você lançar sobe quando a conexão voltar'}
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn sm" onClick={cloudApi.sincronizarAgora}>
                Sincronizar agora
              </button>
              <button type="button" className="btn sm ghost" onClick={() => void cloudApi.sair()}>
                Sair
              </button>
            </div>
          </div>

          {cloud.dono && (
            <>
              <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: 0 }} />
              <Aprovacoes />
            </>
          )}

          <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: 0 }} />

          <Diagnostico />
        </div>
      )}
    </Card>
  );
}
