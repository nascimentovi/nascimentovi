import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { BancoApuracao } from '../db/database';
import { agregar } from '../domain/agregacao';
import { interpretarQr, MontadorQr } from '../domain/qrbu';
import { interpretarTextoBu } from '../domain/textoBu';
import type { Captura } from '../domain/types';
import { gerarQrs, TEXTO_PDF } from '../test/fixtures';
import { ErroRegistro, excluirLeitura, prepararCaptura, registrarDescarte, salvarCaptura } from './registro';

let db: BancoApuracao;
let n = 0;

beforeEach(async () => {
  db = new BancoApuracao(`teste-${n++}`);
  await db.open();
});

async function capturaQr(): Promise<Captura> {
  const m = new MontadorQr();
  (await gerarQrs()).forEach((q) => m.adicionar(q));
  return { tipo: 'qr_code', boletim: interpretarQr(m.ordenadas()).boletim, checksumValido: true };
}

function capturaPdf(texto = TEXTO_PDF): Captura {
  const r = interpretarTextoBu(texto.split('\n').map((t) => ({ texto: t, confianca: 100 })), { ocr: false });
  return { tipo: 'pdf', boletim: r.boletim, arquivoOriginal: 'bu.pdf' };
}

describe('registro e proteção contra duplicação', () => {
  it('QR, PDF e OCR do mesmo boletim geram o mesmo fingerprint', async () => {
    const qr = await prepararCaptura(await capturaQr(), db);
    const pdf = await prepararCaptura(capturaPdf(), db);
    const ocrCap = capturaPdf();
    ocrCap.tipo = 'ocr';
    ocrCap.boletim.codigoCarga = ''; // OCR muitas vezes não lê a carga
    const ocr = await prepararCaptura(ocrCap, db);
    expect(pdf.fingerprint).toBe(qr.fingerprint);
    expect(ocr.fingerprint).toBe(qr.fingerprint);
  });

  it('contabiliza a 1ª leitura e rejeita a mesma urna por outra origem', async () => {
    const qr = await capturaQr();
    const p1 = await prepararCaptura(qr, db);
    expect(p1.duplicata).toBeNull();
    expect(p1.validacao.erros).toEqual([]);
    await salvarCaptura(qr, p1, {}, db);

    const pdf = capturaPdf();
    const p2 = await prepararCaptura(pdf, db);
    expect(p2.duplicata?.motivo).toBe('fingerprint');
    expect(p2.duplicata?.divergente).toBe(false);
    await expect(salvarCaptura(pdf, p2, {}, db)).rejects.toThrow(ErroRegistro);
    await registrarDescarte(pdf, p2, 'Duplicata descartada', db);

    const leituras = await db.leituras.toArray();
    expect(leituras).toHaveLength(1);
    expect(leituras[0].historico_leituras.map((e) => e.status)).toEqual(['aceito', 'rejeitado_duplicata']);
    expect(await db.descartes.count()).toBe(1);
    expect(agregar(leituras).cargos[0].candidatos[0]).toMatchObject({ numero: '22', votos: 225 });
  });

  it('identifica a mesma urna com votos divergentes (possível alteração)', async () => {
    const qr = await capturaQr();
    await salvarCaptura(qr, await prepararCaptura(qr, db), {}, db);
    const alterado = capturaPdf(TEXTO_PDF.replace('LULA PT 13 0045', 'LULA PT 13 0055').replace('666.070', '777.070'));
    const p = await prepararCaptura(alterado, db);
    expect(p.duplicata?.motivo).toBe('mesma_urna');
    expect(p.duplicata?.divergente).toBe(true);
    expect(p.duplicata?.diferencas.filter((d) => d.diverge).map((d) => d.campo)).toEqual([
      'Código da carga',
      'PRESIDENTE · nº 13 (LULA)',
    ]);
  });

  it('exclusão é soft delete, remove os votos e libera nova leitura', async () => {
    const qr = await capturaQr();
    const reg = await salvarCaptura(qr, await prepararCaptura(qr, db), {}, db);
    expect(agregar(await db.leituras.toArray()).urnas).toBe(1);

    await excluirLeitura(reg.id, 'Lido por engano', db);
    const todas = await db.leituras.toArray();
    expect(todas).toHaveLength(1);
    expect(todas[0].status).toBe('deletado');
    const tot = agregar(todas);
    expect(tot.urnas).toBe(0);
    expect(tot.cargos).toHaveLength(0);
    const log = await db.historico_exclusoes.toArray();
    expect(log[0]).toMatchObject({ leitura_id: reg.id, motivo: 'Lido por engano' });
    await expect(excluirLeitura(reg.id, 'x', db)).rejects.toThrow('já está excluído');

    // Após excluir, o mesmo boletim pode ser lido novamente.
    const p = await prepararCaptura(capturaPdf(), db);
    expect(p.duplicata).toBeNull();
    await salvarCaptura(capturaPdf(), p, {}, db);
    expect(agregar(await db.leituras.toArray()).urnas).toBe(1);
  });

  it('substituição exclui o registro anterior e contabiliza o novo', async () => {
    const qr = await capturaQr();
    const antigo = await salvarCaptura(qr, await prepararCaptura(qr, db), {}, db);
    const novo = capturaPdf(TEXTO_PDF.replace('LULA PT 13 0045', 'LULA PT 13 0046'));
    const p = await prepararCaptura(novo, db);
    await salvarCaptura(novo, p, { substituirId: antigo.id }, db);
    const t = agregar(await db.leituras.toArray());
    expect(t.urnas).toBe(1);
    expect(t.cargos[0].candidatos.find((c) => c.numero === '13')?.votos).toBe(46);
    expect((await db.leituras.get(antigo.id))?.status).toBe('deletado');
  });

  it('bloqueia boletim sem campos obrigatórios', async () => {
    const c: Captura = { tipo: 'manual', boletim: { ...(await capturaQr()).boletim, zona: '' } };
    const p = await prepararCaptura(c, db);
    expect(p.validacao.erros).toContain('Zona eleitoral não informada.');
    await expect(salvarCaptura(c, p, {}, db)).rejects.toThrow(ErroRegistro);
  });
});
