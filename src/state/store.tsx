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
import { emptyData } from '../data/schema.ts';
import { demoData, initialData, newId } from '../data/seed.ts';
import { accountInUse, reducer } from './reducer.ts';

export type EntryDraft = Omit<Entry, 'id' | 'createdAt' | 'updatedAt'>;
export type RecurringDraft = Omit<RecurringRule, 'id' | 'createdAt' | 'updatedAt' | 'skippedDates'>;
export type AccountDraft = Omit<Account, 'id' | 'updatedAt'>;
export type CategoryDraft = Omit<Category, 'id' | 'updatedAt'>;

export interface FinanceApi {
  addEntry(draft: EntryDraft): Entry;
  updateEntry(id: string, patch: Partial<Entry>): void;
  deleteEntry(id: string): void;
  /** Transforma uma ocorrência prevista em lançamento gravado. */
  materialize(projection: ProjectedEntry, patch?: Partial<EntryDraft>): Entry;
  skipOccurrence(recurringId: string, date: string): void;

  addRecurring(draft: RecurringDraft): RecurringRule;
  updateRecurring(id: string, patch: Partial<RecurringRule>): void;
  deleteRecurring(id: string): void;

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
}

interface FinanceContextValue {
  data: FinanceData;
  loading: boolean;
  /** Este navegador recusou gravar: o usuário precisa saber, e usar o backup. */
  storageBlocked: boolean;
  api: FinanceApi;
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
      // Primeira execução: entrega contas e categorias prontas em vez de
      // uma tela vazia que exige configurar tudo antes do primeiro uso.
      const isFirstRun = loaded.accounts.length === 0 && loaded.entries.length === 0;
      dispatch({ type: 'data/replace', data: isFirstRun ? initialData() : loaded });
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
    };
  }, [now]);

  const value = useMemo<FinanceContextValue>(
    () => ({
      data,
      loading,
      storageBlocked,
      api: { ...api, isAccountInUse: (id) => accountInUse(data, id) },
    }),
    [data, loading, storageBlocked, api],
  );

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance(): FinanceContextValue {
  const context = useContext(FinanceContext);
  if (!context) throw new Error('useFinance precisa estar dentro de <FinanceProvider>.');
  return context;
}
