import { describe, expect, it } from 'vitest';
import { QR_REAL_2022 } from '../test/fixtures';
import { municipioPorCodigoTse, nomeMunicipioTse } from './municipios';
import { interpretarQr, MontadorQr } from './qrbu';

describe('tabela de municípios por código TSE', () => {
  it('traz os 5.570 municípios com UF', () => {
    expect(municipioPorCodigoTse('63452')).toEqual({ uf: 'SP', nome: 'CONCHAL' });
    expect(municipioPorCodigoTse('71072')).toEqual({ uf: 'SP', nome: 'SÃO PAULO' });
    expect(municipioPorCodigoTse('01120')).toEqual({ uf: 'AC', nome: 'ACRELÂNDIA' });
    expect(municipioPorCodigoTse('99999')).toBeNull();
    expect(nomeMunicipioTse('99999')).toBe('MUNICÍPIO 99999');
  });

  it('o QR real mostra o município pelo nome', () => {
    const m = new MontadorQr();
    m.adicionar(QR_REAL_2022);
    expect(interpretarQr(m.ordenadas()).boletim.municipio).toBe('CONCHAL');
  });
});
