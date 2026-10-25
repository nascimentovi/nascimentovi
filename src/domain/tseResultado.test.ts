import { describe, expect, it } from 'vitest';
import { comparar, interpretarConfig, interpretarResultado, numero, urlResultado } from './tseResultado';

// Recorte no formato do `-u.json` de 2026 (valores fictícios).
function arquivo(turno: string, cands: [string, string, string, string, string][], s: Record<string, string>) {
  return {
    ele: turno === '1' ? '6257' : '6258',
    t: turno,
    tpabr: 'uf',
    cdabr: 'SP',
    dt: '25/10/2026',
    ht: '19:42:10',
    and: 'p',
    s,
    e: { te: '1000', c: '800', a: '200' },
    v: { tv: '800', vv: '700', vvc: '700', vb: '40', tvn: '60' },
    carg: [
      {
        cd: '1',
        nmn: 'Presidente',
        agr: cands.map(([n, nm, sg, vap, pvap]) => ({
          tp: 'i',
          par: [{ n, sg, cand: [{ n, nm: nm.toUpperCase(), nmu: nm, vap, pvap, st: '' }] }],
        })),
      },
    ],
  };
}

describe('tseResultado', () => {
  it('monta a URL do resultado unificado', () => {
    expect(urlResultado('6258', 'sp')).toBe(
      'https://resultados.tse.jus.br/oficial/ele2026/6258/dados/sp/sp-c0001-e006258-u.json',
    );
  });

  it('converte números no formato do TSE', () => {
    expect(numero('47,03')).toBe(47.03);
    expect(numero('1234567')).toBe(1234567);
    expect(numero('1.234.567')).toBe(1234567);
    expect(numero('')).toBe(0);
    expect(numero(undefined)).toBe(0);
  });

  it('interpreta candidatos, seções e votos', () => {
    const r = interpretarResultado(
      arquivo('2', [['13', 'Fulano', 'AAA', '300', '42,86'], ['22', 'Beltrano', 'BBB', '400', '57,14']], {
        ts: '200',
        st: '50',
        pst: '25,00',
      }),
    );
    expect(r.abrangencia).toBe('sp');
    expect(r.candidatos.map((c) => c.numero)).toEqual(['22', '13']);
    expect(r.candidatos[0]).toMatchObject({ nome: 'Beltrano', partido: 'BBB', votos: 400, percentual: 57.14 });
    expect(r.percentualTotalizado).toBe(25);
    expect(r).toMatchObject({ eleitorado: 1000, comparecimento: 800, abstencao: 200, brancos: 40, nulos: 60 });
    expect(r.totalizacao).toBe('25/10/2026 19:42:10');
    expect(r.final).toBe(false);
  });

  it('calcula percentuais ausentes', () => {
    const r = interpretarResultado(
      arquivo('2', [['13', 'A', 'X', '350', ''], ['22', 'B', 'Y', '350', '']], { ts: '10', st: '4' }),
    );
    expect(r.percentualTotalizado).toBe(40);
    expect(r.candidatos.every((c) => c.percentual === 50)).toBe(true);
  });

  it('compara com o 1º turno pelo número do candidato', () => {
    const t2 = interpretarResultado(
      arquivo('2', [['13', 'A', 'X', '420', '60,00'], ['22', 'B', 'Y', '280', '40,00']], { ts: '1', st: '1' }),
    );
    const t1 = interpretarResultado(
      arquivo('1', [['13', 'A', 'X', '330', '47,14'], ['22', 'B', 'Y', '250', '35,71'], ['45', 'C', 'Z', '120', '17,14']], {
        ts: '1',
        st: '1',
      }),
    );
    const cmp = comparar(t2, t1);
    expect(cmp[0]).toMatchObject({ numero: '13', agora: 60, primeiroTurno: 47.14, votosPrimeiroTurno: 330 });
    expect(cmp[0].variacao).toBeCloseTo(12.86);
    expect(comparar(t2, undefined)[0].variacao).toBeNull();
  });

  it('lê os códigos de 1º e 2º turno do ele-c.json', () => {
    const cfg = {
      c: 'ele2026',
      pl: [
        { cd: '3220', e: [{ cd: '6257', nm: 'Eleição Geral Federal 2026', t: '1', cdt2: '6258' }] },
        { cd: '3221', e: [{ cd: '6300', nm: 'Eleição Suplementar', t: '1', cdt2: '' }] },
      ],
    };
    expect(interpretarConfig(cfg)).toEqual({ primeiroTurno: '6257', segundoTurno: '6258' });
    expect(interpretarConfig({})).toBeNull();
  });
});
