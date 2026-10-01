import { describe, expect, it } from 'vitest';
import { CORPO_BU, gerarQrs } from '../test/fixtures';
import { ErroQr, interpretarQr, MontadorQr, separarPartes, validarHashes } from './qrbu';

describe('QR Code do Boletim de Urna', () => {
  it('monta partes lidas fora de ordem e interpreta o boletim', async () => {
    const qrs = await gerarQrs();
    const m = new MontadorQr();
    expect(m.adicionar(qrs[2]).completo).toBe(false);
    expect(m.adicionar(qrs[0]).lidas).toBe(2);
    expect(m.adicionar(qrs[1]).completo).toBe(true);

    const partes = m.ordenadas();
    expect((await validarHashes(partes)).valido).toBe(true);
    const { boletim: b } = interpretarQr(partes);
    expect(b.zona).toBe('75');
    expect(b.secao).toBe('182');
    expect(b.local).toBe('1015');
    expect(b.codigoUe).toBe('1787323');
    expect(b.codigoCarga).toBe('666070534576779579335458');
    expect(b.dataVotacao).toBe('2022-10-30');
    expect(b.eleitoresAptos).toBe(325);
    expect(b.comparecimento).toBe(278);
    expect(b.faltosos).toBe(47);
    expect(b.cargos.map((c) => c.cargo)).toEqual(['PRESIDENTE', 'GOVERNADOR']);
    expect(b.cargos[0].candidatos).toEqual([
      { numero: '13', votos: 45 },
      { numero: '22', votos: 225 },
    ]);
    expect(b.cargos[1]).toMatchObject({ votosNominais: 263, brancos: 7, nulos: 8, totalApurado: 278 });
    expect(b.assinaturaQr).toBe('ABCDEF0123');
  });

  it('detecta conteúdo adulterado pelo hash', async () => {
    const qrs = await gerarQrs();
    qrs[1] = qrs[1].replace('22:225', '22:999');
    const m = new MontadorQr();
    qrs.forEach((q) => m.adicionar(q));
    const r = await validarHashes(m.ordenadas());
    expect(r.valido).toBe(false);
    expect(r.detalhe).toContain('2/3');
  });

  it('aceita BU em um único QR', async () => {
    const [qr] = await gerarQrs([CORPO_BU.join(' ')]);
    const m = new MontadorQr();
    expect(m.adicionar(qr).completo).toBe(true);
    expect((await validarHashes(m.ordenadas())).valido).toBe(true);
  });

  it('rejeita QR que não é de boletim', () => {
    expect(() => new MontadorQr().adicionar('https://exemplo.com')).toThrow(ErroQr);
  });

  it('separa várias partes coladas em um único texto', async () => {
    const qrs = await gerarQrs();
    expect(separarPartes(qrs.join('\n'))).toEqual(qrs);
  });

  it('interpreta votos de legenda em cargo proporcional', async () => {
    const corpo = 'ZONA:1 SECA:2 LOCA:3 DTPL:20221002 APTS:100 COMP:90 FALT:10 CARG:6 TIPO:1 PART:13 1301:20 1302:10 LEGP:5 TOTP:35 PART:22 2201:40 LEGP:3 TOTP:43 NOMI:70 LEGC:8 BRAN:6 NULO:6 TOTC:90';
    const [qr] = await gerarQrs([corpo]);
    const m = new MontadorQr();
    m.adicionar(qr);
    const { boletim } = interpretarQr(m.ordenadas());
    const c = boletim.cargos[0];
    expect(c.cargo).toBe('DEPUTADO FEDERAL');
    expect(c.candidatos.filter((x) => x.legenda).map((x) => [x.numero, x.votos])).toEqual([['13', 5], ['22', 3]]);
    expect(c.votosLegenda).toBe(8);
  });
});
