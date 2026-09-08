/**
 * Persistência.
 *
 * A interface é assíncrona de propósito, mesmo que a implementação local
 * seja síncrona: quando os dados passarem a vir de um servidor, só esta
 * pasta muda — a UI já trata carregamento e escrita como operações que
 * podem demorar e falhar.
 */

import { motivoParaCopiar, quantidadeDeRegistros, type Copia, type MotivoDaCopia } from '../domain/backup.ts';
import type { FinanceData } from '../domain/types.ts';
import { emptyData, migrate } from './schema.ts';

export interface FinanceRepository {
  load(): Promise<FinanceData>;
  /**
   * `false` quando não foi possível gravar. Devolver em vez de lançar é
   * proposital: quem chama precisa poder avisar o usuário, e uma exceção
   * dentro de um efeito viraria rejeição não tratada — o app seguiria
   * parecendo que salvou.
   */
  save(data: FinanceData): Promise<boolean>;
  clear(): Promise<void>;
  /** As cópias automáticas guardadas, da mais nova para a mais velha. */
  copias?(): Promise<Copia[]>;
}

const STORAGE_KEY = 'financeiro-pessoal';

/**
 * Onde ficam as cópias automáticas. Duas, com propósitos diferentes — a regra
 * e o porquê estão em `domain/backup.ts`.
 */
const CHAVES_DE_COPIA: Record<MotivoDaCopia, string> = {
  rotina: `${STORAGE_KEY}:copia-rotina`,
  queda: `${STORAGE_KEY}:copia-queda`,
};

/** Guarda tudo no navegador. Sem conta, sem rede, sem servidor. */
export class LocalStorageRepository implements FinanceRepository {
  constructor(private readonly key: string = STORAGE_KEY) {}

  async load(): Promise<FinanceData> {
    try {
      const raw = window.localStorage.getItem(this.key);
      if (!raw) return emptyData();
      return migrate(JSON.parse(raw));
    } catch (error) {
      // Dado corrompido não pode derrubar o app: começa limpo e avisa no console.
      console.error('Não foi possível ler os dados salvos; começando do zero.', error);
      return emptyData();
    }
  }

  async save(data: FinanceData): Promise<boolean> {
    // O conteúdo anterior é lido antes de ser substituído: é ele que vira
    // cópia, e a cópia é do estado que estava certo, não do que acabou de
    // chegar.
    const anterior = this.lerCru();

    try {
      window.localStorage.setItem(this.key, JSON.stringify(data));
    } catch (error) {
      // Janela anônima, armazenamento desativado, cota cheia, ou o arquivo
      // aberto direto do disco em navegadores mais restritivos.
      console.error('Não foi possível salvar os dados neste navegador.', error);
      return false;
    }

    // Depois de gravar, e nunca antes: a cópia é um extra, e não pode ser o
    // motivo de os dados de verdade não caberem.
    if (anterior) this.talvezCopiar(anterior, data);
    return true;
  }

  async clear(): Promise<void> {
    try {
      window.localStorage.removeItem(this.key);
    } catch {
      // Nada a fazer: se não dá para escrever, também não dá para limpar.
    }
  }

  async copias(): Promise<Copia[]> {
    const lidas = (['queda', 'rotina'] as MotivoDaCopia[])
      .map((motivo) => this.lerCopia(motivo))
      .filter((copia): copia is Copia => copia !== null);
    return lidas.sort((a, b) => b.gravadaEm.localeCompare(a.gravadaEm));
  }

  private lerCru(): FinanceData | null {
    try {
      const raw = window.localStorage.getItem(this.key);
      return raw ? (migrate(JSON.parse(raw)) as FinanceData) : null;
    } catch {
      return null;
    }
  }

  private lerCopia(motivo: MotivoDaCopia): Copia | null {
    try {
      const raw = window.localStorage.getItem(CHAVES_DE_COPIA[motivo]);
      if (!raw) return null;
      const guardada = JSON.parse(raw) as { gravadaEm?: string; data?: unknown };
      if (!guardada.gravadaEm || !guardada.data) return null;
      const data = migrate(guardada.data);
      return { gravadaEm: guardada.gravadaEm, motivo, registros: quantidadeDeRegistros(data), data };
    } catch {
      // Cópia corrompida é o mesmo que cópia inexistente: não pode derrubar
      // a tela que só queria listá-la.
      return null;
    }
  }

  private talvezCopiar(anterior: FinanceData, novo: FinanceData): void {
    const agora = new Date().toISOString();
    const motivo = motivoParaCopiar(anterior, novo, this.lerCopia('rotina')?.gravadaEm ?? null, agora);
    if (!motivo) return;

    try {
      window.localStorage.setItem(
        CHAVES_DE_COPIA[motivo],
        JSON.stringify({ gravadaEm: agora, data: anterior }),
      );
    } catch (error) {
      // Sem espaço para a cópia: os dados de verdade já estão salvos, então
      // some com a de rotina (a menos preciosa) e tenta uma vez só.
      console.warn('Não foi possível guardar a cópia automática.', error);
      if (motivo === 'queda') {
        try {
          window.localStorage.removeItem(CHAVES_DE_COPIA.rotina);
          window.localStorage.setItem(
            CHAVES_DE_COPIA.queda,
            JSON.stringify({ gravadaEm: agora, data: anterior }),
          );
        } catch {
          // Desistir aqui é o certo: os dados atuais continuam salvos.
        }
      }
    }
  }
}
