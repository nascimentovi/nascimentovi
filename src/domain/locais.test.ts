import { describe, expect, it } from 'vitest';
import { identificarLocal } from './locais';
import { codigoPorNomeUnico } from './municipios';
import { interpretarQr, MontadorQr } from './qrbu';
import { interpretarTextoBu } from './textoBu';
import { validarBoletim } from './validacao';
import { QR_REAL_2022 } from '../test/fixtures';

describe('locais de votação de Conchal', () => {
  it('identifica escola e bairro pelo local do boletim real', () => {
    const m = new MontadorQr();
    m.adicionar(QR_REAL_2022);
    const b = interpretarQr(m.ordenadas()).boletim;
    expect(identificarLocal(b.codigoMunicipio, b.local, b.secao)).toMatchObject({
      local: '1015',
      escola: 'E.E. Padre Orestes Ladeira',
      bairro: 'Jardim Dulce Maria',
      secaoConfere: true,
    });
    expect(validarBoletim(b).alertas).toEqual([]);
  });

  it('deduz o local pela seção quando o boletim não traz o local', () => {
    expect(identificarLocal('63452', '', '0427')).toMatchObject({ local: '1040', bairro: 'Parque Industrial', deduzidoPelaSecao: true });
    expect(identificarLocal('63452', '', '9999')).toBeNull();
  });

  it('alerta quando a seção não pertence ao local informado', () => {
    const m = new MontadorQr();
    m.adicionar(QR_REAL_2022);
    const b = { ...interpretarQr(m.ordenadas()).boletim, local: '1023' };
    expect(validarBoletim(b).alertas).toContain('Seção 182 não consta da relação de seções do local 1023 (E.M.E.F. Alonso Ferreira de Camargo).');
  });

  it('não se aplica a outros municípios', () => {
    expect(identificarLocal('71072', '1015', '182')).toBeNull();
  });

  it('PDF/foto sem código do município: deduz o código pelo nome', () => {
    expect(codigoPorNomeUnico('Conchal')).toBe('63452');
    expect(codigoPorNomeUnico('Bom Jesus')).toBeNull(); // nome repetido em vários estados
    const r = interpretarTextoBu(
      ['Município: CONCHAL', 'Zona Eleitoral 0075 Seção Eleitoral 0458', 'Eleitores aptos 0300'].map((texto) => ({ texto, confianca: 90 })),
      { ocr: true },
    );
    expect(r.boletim.codigoMunicipio).toBe('63452');
    expect(identificarLocal(r.boletim.codigoMunicipio, r.boletim.local, r.boletim.secao)?.escola).toBe('E.M.E.F. Giácomo Corte');
  });
});
