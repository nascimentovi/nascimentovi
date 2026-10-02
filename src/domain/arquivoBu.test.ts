import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ErroArquivoBu, interpretarArquivoBu } from './arquivoBu';
import { identificarLocal } from './locais';
import { validarBoletim } from './validacao';

const ARQUIVO = new Uint8Array(readFileSync(new URL('../test/arquivos/bu-conchal-2024-secao-0493.bu', import.meta.url)));

describe('arquivo binário do BU (.bu/.dat) do TSE', () => {
  it('decodifica o boletim real de Conchal, seção 493 (1º turno de 2024)', () => {
    const { boletim: b, codigoCarga } = interpretarArquivoBu(ARQUIVO);
    expect(b).toMatchObject({
      uf: 'SP',
      municipio: 'CONCHAL',
      codigoMunicipio: '63452',
      zona: '75',
      local: '1090',
      secao: '493',
      dataVotacao: '2024-10-06',
      eleitoresAptos: 339,
      comparecimento: 254,
      faltosos: 85,
      codigoUe: '1833013',
      fase: 'O',
      versaoSoftware: '9.30.0.0 - Tupiniquim',
    });
    expect(codigoCarga).toBe('827686144546275273251707');
    expect(b.cargos.map((c) => c.cargo)).toEqual(['VEREADOR', 'PREFEITO']);

    const pref = b.cargos[1];
    expect(pref.candidatos).toEqual([{ numero: '15', votos: 119 }, { numero: '22', votos: 113 }]);
    expect(pref).toMatchObject({ votosNominais: 232, brancos: 16, nulos: 6, totalApurado: 254 });

    const ver = b.cargos[0];
    expect(ver).toMatchObject({ brancos: 20, nulos: 3, votosLegenda: 8, totalApurado: 254 });
    expect(ver.votosNominais! + ver.votosLegenda! + ver.brancos! + ver.nulos!).toBe(254);
    expect(ver.candidatos.filter((c) => c.legenda).map((c) => [c.numero, c.votos])).toEqual([['10', 1], ['15', 1], ['22', 4], ['27', 1], ['55', 1]]);

    expect(validarBoletim(b)).toMatchObject({ erros: [], alertas: [] });
    expect(identificarLocal(b.codigoMunicipio, b.local, b.secao)).toMatchObject({ escola: 'E.E. Jardim Bela Vista', secaoConfere: true });
  });

  it('recusa arquivos que não são BU', () => {
    expect(() => interpretarArquivoBu(new TextEncoder().encode('%PDF-1.4 qualquer coisa'.repeat(10)))).toThrow(ErroArquivoBu);
    expect(() => interpretarArquivoBu(ARQUIVO.slice(0, 500))).toThrow(ErroArquivoBu);
  });
});
