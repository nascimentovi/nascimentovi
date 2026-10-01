import Dexie, { type EntityTable } from 'dexie';
import type { CadastroCandidato, Exclusao, Leitura, TipoEntrada } from '../domain/types';

/** Tentativas descartadas (duplicatas, erros de validação) para auditoria. */
export interface Descarte {
  id?: number;
  timestamp: string;
  tipo_entrada: TipoEntrada;
  motivo: string;
  fingerprint: string | null;
  leitura_relacionada: string | null;
  resumo: string;
}

export interface Configuracao {
  chave: string;
  valor: unknown;
}

/**
 * Banco local (IndexedDB) — funciona 100% offline e persiste cada leitura
 * imediatamente (transações atômicas), preservando os dados se o app fechar.
 */
export class BancoApuracao extends Dexie {
  leituras!: EntityTable<Leitura, 'id'>;
  historico_exclusoes!: EntityTable<Exclusao, 'id'>;
  descartes!: EntityTable<Descarte, 'id'>;
  candidatos!: EntityTable<CadastroCandidato, 'chave'>;
  config!: EntityTable<Configuracao, 'chave'>;

  constructor(nome = 'apuracao-bu') {
    super(nome);
    this.version(1).stores({
      leituras:
        'id, fingerprint, chaveUrna, status, tipo_entrada, timestamp_leitura, codigo_carga, [zona_eleitoral+secao], [municipio+zona_eleitoral]',
      historico_exclusoes: '++id, leitura_id, timestamp_exclusao',
      descartes: '++id, timestamp, tipo_entrada',
      candidatos: 'chave, cargo',
      config: 'chave',
    });
  }
}

export const db = new BancoApuracao();

export async function lerConfig<T>(chave: string, padrao: T): Promise<T> {
  const r = await db.config.get(chave);
  return (r?.valor as T) ?? padrao;
}

export async function gravarConfig(chave: string, valor: unknown): Promise<void> {
  await db.config.put({ chave, valor });
}

/** Pede ao navegador armazenamento persistente (não é apagado sob pressão de espaço). */
export async function solicitarPersistencia(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* sem suporte */
  }
  return false;
}
