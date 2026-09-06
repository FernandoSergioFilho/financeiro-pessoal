/**
 * Conta, sincronização e convite — tudo o que a versão online acrescentou
 * à interface, reunido num lugar só dentro de Ajustes.
 */

import { useState, type FormEvent } from 'react';

import { formatDate } from '../../domain/date.ts';
import { useFinance } from '../../state/store.tsx';
import { diagnosticar, type Verificacao } from '../../data/diagnostico.ts';
import { SENHA_MINIMA } from '../../data/supabase.ts';
import { Card, Dialog, Field, Segmented } from './primitives.tsx';

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

function LoginForm() {
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

/* ---------------------------------------------------------------- convite */

function InviteDialog({ onClose }: { onClose: () => void }) {
  const { cloudApi } = useFinance();
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  const [gerando, setGerando] = useState(false);

  async function gerar() {
    setErro('');
    setGerando(true);
    try {
      setCodigo(await cloudApi.convidar());
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gerar o convite.');
    } finally {
      setGerando(false);
    }
  }

  return (
    <Dialog
      title="Convidar para a carteira"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Fechar
          </button>
        </>
      }
    >
      <p className="muted" style={{ fontSize: '0.88rem' }}>
        A outra pessoa entra com o e-mail dela e digita este código em Ajustes. A partir daí vocês dois
        enxergam e editam os mesmos lançamentos.
      </p>

      {codigo ? (
        <div className="banner">
          <span className="emoji" aria-hidden="true">🔑</span>
          <span>
            <strong className="num" style={{ fontSize: '1.3rem', letterSpacing: '0.12em' }}>
              {codigo}
            </strong>
            <br />
            <span className="dim">Vale por 7 dias e só pode ser usado uma vez.</span>
          </span>
        </div>
      ) : (
        <button type="button" className="btn primary" onClick={() => void gerar()} disabled={gerando}>
          {gerando ? 'Gerando…' : 'Gerar código de convite'}
        </button>
      )}

      {erro && <p className="error">{erro}</p>}
    </Dialog>
  );
}

function AceitarConvite() {
  const { cloudApi } = useFinance();
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setErro('');
    try {
      await cloudApi.entrarComConvite(codigo);
      setOk(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível usar o convite.');
    }
  }

  if (ok) return <p className="hint">Pronto: vocês agora dividem a mesma carteira.</p>;

  return (
    // Mesmo bloco de ajuste: no celular o campo fica com a largura toda em vez
    // de dividir a linha com o botão e mostrar meia palavra.
    <form onSubmit={submit} className="setting top">
      <div className="setting-text form-narrow">
        <input
          className="input num"
          placeholder="Código do convite"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          style={{ letterSpacing: '0.1em' }}
          aria-label="Código do convite"
        />
        {erro && <span className="error">{erro}</span>}
      </div>
      <button type="submit" className="btn" disabled={!codigo.trim()}>
        Entrar na carteira
      </button>
    </form>
  );
}

/* ------------------------------------------------------------ diagnóstico */

function Diagnostico() {
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
  const [convidando, setConvidando] = useState(false);

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

      {cloud.status === 'signed-out' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <LoginForm />
          <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: 0 }} />
          <Diagnostico />
        </div>
      )}

      {cloud.status === 'error' && (
        <div className="banner warn">
          <span className="emoji" aria-hidden="true">⚠️</span>
          <span>
            <strong>Não foi possível preparar a sincronização</strong>
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

          <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: 0 }} />

          <div className="setting">
            <div className="setting-text">
              <div className="title">Dividir a carteira</div>
              <div className="dim">
                Gere um código para outra pessoa enxergar e editar os mesmos lançamentos.
              </div>
            </div>
            <button type="button" className="btn sm" onClick={() => setConvidando(true)}>
              Convidar
            </button>
          </div>

          <AceitarConvite />

          <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: 0 }} />

          <Diagnostico />
        </div>
      )}

      {convidando && <InviteDialog onClose={() => setConvidando(false)} />}
    </Card>
  );
}
