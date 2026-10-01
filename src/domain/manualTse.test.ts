import { describe, expect, it } from 'vitest';
import { CHAVE_PUBLICA_MANUAL, QR_MANUAL_SA, QR_MANUAL_SIMPLES, QRS_MANUAL_4_PARTES } from '../test/exemplosManual';
import { QR_REAL_2022 } from '../test/fixtures';
import { verificarAssinaturaBu } from './assinatura';
import { hexParaBytes } from './hash';
import { interpretarQr, MontadorQr, validarHashes } from './qrbu';
import { validarBoletim } from './validacao';

const chave = hexParaBytes(CHAVE_PUBLICA_MANUAL);

function montar(textos: string[]) {
  const m = new MontadorQr();
  textos.forEach((t) => m.adicionar(t));
  return m.ordenadas();
}

describe('exemplos oficiais do manual do TSE', () => {
  it('confere a cadeia de hash do BU em 4 QR Codes, lidos fora de ordem', async () => {
    const partes = montar([QRS_MANUAL_4_PARTES[2], QRS_MANUAL_4_PARTES[0], QRS_MANUAL_4_PARTES[3], QRS_MANUAL_4_PARTES[1]]);
    const r = await validarHashes(partes);
    expect(r.valido).toBe(true);
    expect(r.hashFinal).toMatch(/^27FF0E01/);
    expect(verificarAssinaturaBu(r.hashFinal!, r.assinatura!, chave)).toBe(true);
  });

  it('detecta alteração em uma parte intermediária', async () => {
    const alterado = [...QRS_MANUAL_4_PARTES];
    alterado[1] = alterado[1].replace('92008:6', '92008:7');
    const r = await validarHashes(montar(alterado));
    expect(r.valido).toBe(false);
    expect(r.detalhe).toContain('2/4');
  });

  it('interpreta o BU em 4 partes (vereador com legenda e prefeito)', () => {
    const { boletim: b } = interpretarQr(montar(QRS_MANUAL_4_PARTES));
    expect(b).toMatchObject({ uf: 'AC', zona: '9', secao: '22', local: '4', eleitoresAptos: 559, comparecimento: 504, faltosos: 55 });
    const ver = b.cargos.find((c) => c.cargo === 'VEREADOR')!;
    expect(ver).toMatchObject({ votosNominais: 499, votosLegenda: 5, brancos: 0, nulos: 0, totalApurado: 504 });
    const soma = ver.candidatos.filter((c) => !c.legenda).reduce((s, c) => s + c.votos, 0);
    expect(soma).toBe(499);
    const pref = b.cargos.find((c) => c.cargo === 'PREFEITO')!;
    expect(pref.candidatos.map((c) => [c.numero, c.votos])).toEqual([['91', 102], ['92', 105], ['93', 111], ['94', 95], ['95', 91]]);
    expect(validarBoletim(b).alertas).toEqual([]);
  });

  it('confere hash e assinatura do BU pequeno', async () => {
    const r = await validarHashes(montar([QR_MANUAL_SIMPLES]));
    expect(r.valido).toBe(true);
    expect(verificarAssinaturaBu(r.hashFinal!, r.assinatura!, chave)).toBe(true);
    // Chave de outra UF/versão não valida a assinatura.
    const outra = new Uint8Array(chave);
    outra[0] ^= 1;
    expect(verificarAssinaturaBu(r.hashFinal!, r.assinatura!, outra)).toBe(false);
  });

  it('interpreta o BU do Sistema de Apuração (sem LOCA/APTO/COMP)', async () => {
    const partes = montar([QR_MANUAL_SA]);
    expect((await validarHashes(partes)).valido).toBe(true);
    const { boletim: b } = interpretarQr(partes);
    expect(b).toMatchObject({ zona: '8', secao: '2', local: '', eleitoresAptos: 144, comparecimento: 2 });
    expect(validarBoletim(b).erros).toEqual([]);
  });

  it('QR real de 2022 continua conferindo', async () => {
    expect((await validarHashes(montar([QR_REAL_2022]))).valido).toBe(true);
  });
});
