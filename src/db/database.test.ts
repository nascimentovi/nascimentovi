import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { BancoApuracao } from './database';

describe('migração v3: zera os dados de votação', () => {
  it('apaga leituras, exclusões e descartes e mantém candidatos e configurações', async () => {
    const nome = 'migracao-v3';
    // Banco como estava no aparelho antes da atualização (versão 2).
    const antigo = new Dexie(nome);
    antigo.version(2).stores({
      leituras: 'id, fingerprint, chaveUrna, status, tipo_entrada, timestamp_leitura, codigo_carga, [zona_eleitoral+secao], [municipio+zona_eleitoral]',
      historico_exclusoes: '++id, leitura_id, timestamp_exclusao',
      descartes: '++id, timestamp, tipo_entrada',
      candidatos: 'chave, cargo',
      config: 'chave',
    });
    await antigo.table('leituras').add({ id: 'x', fingerprint: 'f', status: 'ativo', municipio: 'CONCHAL', boletim: {} });
    await antigo.table('historico_exclusoes').add({ leitura_id: 'x', timestamp_exclusao: 't' });
    await antigo.table('descartes').add({ timestamp: 't', tipo_entrada: 'qr_code' });
    await antigo.table('candidatos').add({ chave: 'PREFEITO|15', cargo: 'PREFEITO', numero: '15', nome: 'FULANO' });
    await antigo.table('config').add({ chave: 'chave:/x.pub', valor: [1, 2, 3] });
    antigo.close();

    const db = new BancoApuracao(nome);
    await db.open();
    expect(await db.leituras.count()).toBe(0);
    expect(await db.historico_exclusoes.count()).toBe(0);
    expect(await db.descartes.count()).toBe(0);
    expect(await db.candidatos.count()).toBe(1);
    expect(await db.config.get('chave:/x.pub')).toMatchObject({ valor: [1, 2, 3] });
    // Depois da migração, novas leituras ficam normalmente (a limpeza não se repete).
    await db.leituras.add({ id: 'y' } as never);
    db.close();
    const reaberto = new BancoApuracao(nome);
    await reaberto.open();
    expect(await reaberto.leituras.count()).toBe(1);
    reaberto.close();
  });
});
