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
      codigoMunicipio: '63452',
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

  it('lê o BU "Via Digital" (município em duas linhas e legenda por partido)', () => {
    const texto = `Justiça Eleitoral
Boletim de Urna
Eleições Municipais 2020
1º Turno
(15/11/2020)
Município 63452
CONCHAL
Zona Eleitoral 0075
Local de Votação 1058
Seção Eleitoral 0246
Eleitores aptos 0389
Comparecimento 0302
Eleitores faltosos 0087
Data de abertura da UE 15/11/2020
------------------------VEREADOR------------------------
Partido: 11 - PP
Nome do candidato Num cand Votos
PAQUEIRO 11000 0006
JUNINHO 11111 0006
Votos de legenda 0000
Total do partido 0012
Partido: 12 - PDT
CHICA 12000 0005
Votos de legenda 0003
Total do partido 0008
Eleitores aptos 0389
Total de votos Nominais 0017
Total de votos de Legenda 0003
Brancos 0001
Nulos 0001
Total Apurado 0022
-------------------------PREFEITO-------------------------
VANDO MAGNUSSON 45 0136
Total de votos Nominais 0136`;
    const b = interpretarTextoBu(linhas(texto), { ocr: false }).boletim;
    expect(b).toMatchObject({ municipio: 'CONCHAL', codigoMunicipio: '63452', zona: '75', local: '1058', secao: '246', dataVotacao: '2020-11-15', turno: '1' });
    const ver = b.cargos[0];
    expect(ver).toMatchObject({ cargo: 'VEREADOR', votosNominais: 17, votosLegenda: 3, brancos: 1, nulos: 1, totalApurado: 22 });
    expect(ver.candidatos.filter((c) => c.legenda)).toEqual([{ numero: '12', nome: 'LEGENDA 12', votos: 3, legenda: true }]);
    expect(ver.candidatos.filter((c) => !c.legenda).map((c) => c.numero)).toEqual(['11000', '11111', '12000']);
    expect(b.cargos[1].candidatos).toEqual([{ numero: '45', nome: 'VANDO MAGNUSSON', votos: 136 }]);
  });
});
