/**
 * Estado da aplicação: carrega do repositório, aplica as ações do reducer e
 * devolve tudo para a árvore de componentes.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { Copia } from '../domain/backup.ts';
import { dividirRecorrente } from '../domain/divisao-recorrente.ts';
import { buildPurchase, type PurchaseDraft } from '../domain/installments.ts';
import type {
  Account,
  Category,
  Entry,
  FinanceData,
  ProjectedEntry,
  RecurringRule,
} from '../domain/types.ts';
import { LocalStorageRepository, type FinanceRepository } from '../data/repository.ts';
import { isCloudEnabled } from '../data/supabase.ts';
import { emptyData } from '../data/schema.ts';
import { demoData, initialData, newId } from '../data/seed.ts';
import { accountInUse, reducer } from './reducer.ts';
import { decidirDepoisDaSync, semearNaCarga } from './seeding.ts';
import { useCloud, type CloudApi, type CloudState } from './cloud.ts';

export type EntryDraft = Omit<Entry, 'id' | 'createdAt' | 'updatedAt'>;
export type RecurringDraft = Omit<RecurringRule, 'id' | 'createdAt' | 'updatedAt' | 'skippedDates'>;
export type AccountDraft = Omit<Account, 'id' | 'updatedAt'>;
export type CategoryDraft = Omit<Category, 'id' | 'updatedAt'>;

export interface FinanceApi {
  addEntry(draft: EntryDraft): Entry;
  /** Vários de uma vez, vindos da planilha. Devolve quantos entraram. */
  importEntries(drafts: readonly EntryDraft[]): number;
  updateEntry(id: string, patch: Partial<Entry>): void;
  deleteEntry(id: string): void;
  /** Transforma uma ocorrência prevista em lançamento gravado. */
  materialize(projection: ProjectedEntry, patch?: Partial<EntryDraft>): Entry;
  skipOccurrence(recurringId: string, date: string): void;

  addRecurring(draft: RecurringDraft): RecurringRule;
  updateRecurring(id: string, patch: Partial<RecurringRule>): void;
  deleteRecurring(id: string): void;
  /**
   * Muda a conta recorrente desta ocorrência em diante, sem tocar no passado.
   *
   * É o que a assinatura que mudou de preço pede: os meses que já passaram
   * foram pagos pelo valor antigo e continuam contando o valor antigo. O corte
   * em si está em `domain/divisao-recorrente.ts`; aqui é só a gravação.
   */
  mudarDaquiEmDiante(regra: RecurringRule, ocorrencia: string, draft: EntryDraft, entryId?: string): void;

  addPurchase(draft: PurchaseDraft): void;
  deletePurchase(id: string): void;

  addAccount(draft: AccountDraft): void;
  updateAccount(id: string, patch: Partial<Account>): void;
  deleteAccount(id: string): void;
  isAccountInUse(id: string): boolean;

  addCategory(draft: CategoryDraft): void;
  updateCategory(id: string, patch: Partial<Category>): void;
  deleteCategory(id: string): void;

  replaceData(data: FinanceData): void;
  loadDemo(): void;
  resetAll(): void;
  /** As cópias que o app guardou sozinho, para o caso de perda em massa. */
  copiasAutomaticas(): Promise<Copia[]>;
}

interface FinanceContextValue {
  data: FinanceData;
  loading: boolean;
  /** Este navegador recusou gravar: o usuário precisa saber, e usar o backup. */
  storageBlocked: boolean;
  api: FinanceApi;
  /** Sessão e sincronização. Desligadas quando o app roda só local. */
  cloud: CloudState;
  cloudApi: CloudApi;
}

const FinanceContext = createContext<FinanceContextValue | null>(null);

const defaultRepository = new LocalStorageRepository();

export function FinanceProvider({
  children,
  repository = defaultRepository,
}: {
  children: ReactNode;
  repository?: FinanceRepository;
}) {
  const [data, dispatch] = useReducer(reducer, emptyData());
  const [loading, setLoading] = useState(true);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void repository.load().then((loaded) => {
      if (cancelled) return;
      // Contas e categorias prontas na primeira execução, em vez de uma tela
      // vazia que exige configurar tudo antes do primeiro uso — mas só no app
      // sem nuvem. A regra e o porquê estão em `seeding.ts`.
      const semear = semearNaCarga(loaded, isCloudEnabled());
      dispatch({ type: 'data/replace', data: semear ? initialData() : loaded });
      hydrated.current = true;
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [repository]);

  // Salva depois que o usuário para de mexer, para não gravar a cada tecla.
  useEffect(() => {
    if (!hydrated.current) return;
    const timer = setTimeout(() => {
      void repository.save(data).then((ok) => setStorageBlocked(!ok));
    }, 150);
    return () => clearTimeout(timer);
  }, [data, repository]);

  const aplicarDaNuvem = useCallback((next: FinanceData) => {
    dispatch({ type: 'data/replace', data: next });
  }, []);
  const [cloud, cloudApi] = useCloud(data, aplicarDaNuvem);

  // A semeadura adiada: depois que a primeira sincronização trouxe o que havia
  // na carteira, se ainda assim não veio nada, então é conta nova de verdade.
  const semeou = useRef(false);
  useEffect(() => {
    if (semeou.current || !hydrated.current) return;
    const decisao = decidirDepoisDaSync({ status: cloud.status, ultimaSync: cloud.sync.lastSyncedAt }, data);
    if (decisao === 'esperar') return;
    semeou.current = true; // decidido uma vez só, para não semear duas vezes
    // Aditiva, e nunca uma troca da carteira inteira: a decisão de semear
    // depende de três valores que chegam por caminhos diferentes (o estado da
    // nuvem, a data da última sincronização e os dados), e não há como garantir
    // que cheguem juntos. Com uma semeadura que só acrescenta o que falta pelo
    // nome, escapar por um triz deixou de poder apagar o que veio do servidor
    // ou criar um segundo jogo de contas e categorias. O porquê está em
    // `semearSemApagar`.
    if (decisao === 'semear') dispatch({ type: 'data/seed-missing' });
  }, [cloud.status, cloud.sync.lastSyncedAt, data]);

  const now = useCallback(() => new Date().toISOString(), []);

  const api = useMemo<FinanceApi>(() => {
    const makeEntry = (draft: EntryDraft): Entry => {
      const stamp = now();
      return { ...draft, id: newId(), createdAt: stamp, updatedAt: stamp };
    };

    return {
      addEntry(draft) {
        const entry = makeEntry(draft);
        dispatch({ type: 'entry/create', entry });
        return entry;
      },
      importEntries(drafts) {
        if (drafts.length === 0) return 0;
        dispatch({ type: 'entries/import', entries: drafts.map(makeEntry) });
        return drafts.length;
      },
      updateEntry(id, patch) {
        dispatch({ type: 'entry/update', id, patch, updatedAt: now() });
      },
      deleteEntry(id) {
        dispatch({ type: 'entry/delete', id, deletedAt: now() });
      },
      materialize(projection, patch) {
        const { id: _id, projected: _projected, ...rest } = projection;
        const entry = makeEntry({ ...rest, ...patch });
        dispatch({ type: 'entry/create', entry });
        return entry;
      },
      skipOccurrence(recurringId, date) {
        dispatch({ type: 'occurrence/skip', recurringId, date, updatedAt: now() });
      },

      addRecurring(draft) {
        const stamp = now();
        const rule: RecurringRule = { ...draft, id: newId(), skippedDates: [], createdAt: stamp, updatedAt: stamp };
        dispatch({ type: 'recurring/create', rule });
        return rule;
      },
      updateRecurring(id, patch) {
        dispatch({ type: 'recurring/update', id, patch, updatedAt: now() });
      },
      deleteRecurring(id) {
        dispatch({ type: 'recurring/delete', id, deletedAt: now() });
      },
      mudarDaquiEmDiante: () => undefined, // substituído abaixo, onde os dados são conhecidos

      addPurchase(draft) {
        const { purchase, entries } = buildPurchase(draft, newId, now());
        dispatch({ type: 'purchase/create', purchase, entries });
      },
      deletePurchase(id) {
        dispatch({ type: 'purchase/delete', id, deletedAt: now() });
      },

      addAccount(draft) {
        dispatch({ type: 'account/create', account: { ...draft, id: newId(), updatedAt: now() } });
      },
      updateAccount(id, patch) {
        dispatch({ type: 'account/update', id, patch, updatedAt: now() });
      },
      deleteAccount(id) {
        dispatch({ type: 'account/delete', id, deletedAt: now() });
      },
      isAccountInUse: () => false, // substituído abaixo, onde o estado atual é conhecido

      addCategory(draft) {
        dispatch({ type: 'category/create', category: { ...draft, id: newId(), updatedAt: now() } });
      },
      updateCategory(id, patch) {
        dispatch({ type: 'category/update', id, patch, updatedAt: now() });
      },
      deleteCategory(id) {
        dispatch({ type: 'category/delete', id, deletedAt: now() });
      },

      replaceData(next) {
        dispatch({ type: 'data/replace', data: next });
      },
      loadDemo() {
        dispatch({ type: 'data/replace', data: demoData() });
      },
      resetAll() {
        dispatch({ type: 'data/replace', data: initialData() });
      },
      copiasAutomaticas: () => repository.copias?.() ?? Promise.resolve([]),
    };
  }, [now, repository]);

  /**
   * O corte da recorrência, aplicado.
   *
   * Mora aqui, e não dentro do `api` acima, porque precisa dos dados de agora
   * — quais ocorrências já estão gravadas depois do corte. É o mesmo motivo
   * de `isAccountInUse` morar aqui.
   *
   * São vários despachos em vez de uma ação só: cada um deles já existe,
   * já é testado e já carimba o `updatedAt` que a sincronização usa. Uma ação
   * nova que fizesse tudo junto teria de repetir essas três coisas.
   */
  const mudarDaquiEmDiante = useCallback(
    (regra: RecurringRule, ocorrencia: string, draft: EntryDraft, entryId?: string) => {
      const stamp = now();
      const valores = {
        description: draft.description,
        amount: draft.amount,
        kind: draft.kind,
        accountId: draft.accountId,
        toAccountId: draft.toAccountId ?? null,
        categoryId: draft.categoryId ?? null,
      };
      const divisao = dividirRecorrente(regra, ocorrencia, draft.date, valores, data.entries);
      const regraDaqui = divisao.nova
        ? { ...divisao.nova, id: newId(), createdAt: stamp, updatedAt: stamp }
        : null;

      dispatch({ type: 'recurring/update', id: regra.id, patch: divisao.patchDaAnterior, updatedAt: stamp });
      if (regraDaqui) dispatch({ type: 'recurring/create', rule: regraDaqui });

      // O vínculo muda sempre; o valor, só no que ainda não foi confirmado.
      for (const alcancada of divisao.mover) {
        dispatch({
          type: 'entry/update',
          id: alcancada.id,
          patch: {
            ...(regraDaqui ? { recurringId: regraDaqui.id } : {}),
            ...(alcancada.atualizarValores ? valores : {}),
          },
          updatedAt: stamp,
        });
      }

      /*
       * A ocorrência editada vira lançamento gravado mesmo quando a regra já
       * diria tudo. É o que guarda o "já paguei" e a observação, que regra
       * nenhuma carrega — sem isto, marcar como pago e escolher "daqui em
       * diante" perderia a marca em silêncio.
       *
       * A `occurrenceDate` passa a ser o dia NOVO: é por ela que a projeção
       * reconhece o mês como já gravado, e a regra daqui projeta no dia novo.
       */
      const vinculo = {
        recurringId: regraDaqui?.id ?? regra.id,
        occurrenceDate: draft.date,
      };
      if (entryId) {
        dispatch({ type: 'entry/update', id: entryId, patch: { ...draft, ...vinculo }, updatedAt: stamp });
      } else {
        dispatch({
          type: 'entry/create',
          entry: { ...draft, ...vinculo, id: newId(), createdAt: stamp, updatedAt: stamp },
        });
      }
    },
    [data.entries, now],
  );

  const value = useMemo<FinanceContextValue>(
    () => ({
      data,
      loading,
      storageBlocked,
      api: { ...api, isAccountInUse: (id) => accountInUse(data, id), mudarDaquiEmDiante },
      cloud,
      cloudApi,
    }),
    [data, loading, storageBlocked, api, cloud, cloudApi, mudarDaquiEmDiante],
  );

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance(): FinanceContextValue {
  const context = useContext(FinanceContext);
  if (!context) throw new Error('useFinance precisa estar dentro de <FinanceProvider>.');
  return context;
}
