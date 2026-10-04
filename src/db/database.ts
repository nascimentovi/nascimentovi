import Dexie, { type EntityTable } from 'dexie';
import { municipioPorCodigoTse } from '../domain/municipios';
import { repararMunicipio } from '../domain/reparo';
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
    // v2: leituras antigas de QR guardavam "MUNICÍPIO <código>"; passa a usar o nome oficial.
    this.version(2).upgrade((tx) =>
      tx
        .table('leituras')
        .toCollection()
        .modify((l: Leitura) => {
          if (!l.municipio || l.municipio.startsWith('MUNICÍPIO ')) {
            const m = municipioPorCodigoTse(l.boletim?.codigoMunicipio);
            if (m) {
              l.municipio = m.nome;
              l.boletim.municipio = m.nome;
            }
          }
        }),
    );
    // v3: zera os dados de votação uma única vez (recomeçar os testes do zero).
    // Mantém candidatos e configurações (chaves públicas e nomes baixados do TSE).
    this.version(3).upgrade((tx) =>
      Promise.all([tx.table('leituras').clear(), tx.table('historico_exclusoes').clear(), tx.table('descartes').clear()]),
    );
    // v4: completa o município de registros gravados sem ele (PDF "Via Digital" lido antes
    // da correção do leitor), a partir do texto original guardado. Votos não mudam.
    this.version(4).upgrade((tx) =>
      tx
        .table('leituras')
        .toCollection()
        .modify((l: Leitura) => {
          repararMunicipio(l);
        }),
    );
    // v5: zera novamente os dados de votação (novo recomeço dos testes), uma única vez.
    this.version(5).upgrade((tx) =>
      Promise.all([tx.table('leituras').clear(), tx.table('historico_exclusoes').clear(), tx.table('descartes').clear()]),
    );
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
