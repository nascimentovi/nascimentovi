import { describe, expect, it } from 'vitest';
import { TEXTO_PDF } from '../test/fixtures';
import { interpretarTextoBu, type LinhaTexto } from './textoBu';

const linhas = (t: string, conf = 100): LinhaTexto[] => t.split('\n').map((texto) => ({ texto, confianca: conf }));

describe('interpretação de texto do BU (PDF/OCR)', () => {
  it('extrai identificação, eleitores e cargos do texto de PDF', () => {
    const r = interpretarTextoBu(linhas(TEXTO_PDF), { ocr: false });
    const b = r.boletim;
    expect(b).toMatchObject({
      municipio: 'CONCHAL',
      codigoMunicipio: '62910',
      zona: '75',
      local: '1015',
      secao: '182',
      codigoUe: '01787323',
      codigoCarga: '666070534576779579335458',
      dataVotacao: '2022-10-30',
      turno: '2',
      eleitoresAptos: 325,
      comparecimento: 278,
      faltosos: 47,
    });
    expect(b.cargos).toHaveLength(2);
    expect(b.cargos[0].candidatos).toEqual([
      { numero: '13', nome: 'LULA', votos: 45 },
      { numero: '22', nome: 'JAIR BOLSONARO', votos: 225 },
    ]);
    expect(b.cargos[1].candidatos[0]).toEqual({ numero: '10', nome: 'TARCÍSIO', votos: 223 });
    expect(b.cargos[1]).toMatchObject({ votosNominais: 263, brancos: 7, nulos: 8, totalApurado: 278 });
    expect(b.assinaturaQr).toHaveLength(128);
    expect(r.qualidadeGeral).toBe(100);
  });

  it('corrige confusões típicas de OCR em campos numéricos', () => {
    const texto = TEXTO_PDF.replace('Zona Eleitoral 0075', 'Zona Eleitoral 0O75').replace('JAIR BOLSONARO PL 22 0225', 'JAIR BOLSONARO PL 22 O22S');
    const r = interpretarTextoBu(linhas(texto, 70), { ocr: true });
    expect(r.boletim.zona).toBe('75');
    expect(r.boletim.cargos[0].candidatos[1].votos).toBe(225);
    expect(r.confianca.zona).toBe(70);
    expect(r.confianca['cargos.0.candidatos.1.votos']).toBe(70);
  });

  it('avisa quando não encontra zona/seção', () => {
    const r = interpretarTextoBu(linhas('texto qualquer\nsem dados'), { ocr: true });
    expect(r.avisos.length).toBeGreaterThan(0);
    expect(r.boletim.cargos).toHaveLength(0);
  });
});
