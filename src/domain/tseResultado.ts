// Leitura dos arquivos de resultado publicados pelo TSE em resultados.tse.jus.br
// (estrutura de 2026: `dados/<abr>/<abr>-c0001-e<ele6>-u.json`, o "resultado unificado").
// Contagens chegam como texto e percentuais com vírgula decimal ("47,03").

export const BASE_TSE = 'https://resultados.tse.jus.br/oficial';
export const CICLO = 'ele2026';
export const CARGO_PRESIDENTE = '1';

/** Códigos usados se o `ele-c.json` não puder ser lido (eleição geral federal 2026). */
export const ELEICOES_PADRAO = { primeiroTurno: '6257', segundoTurno: '6258' };

export const UFS: { sigla: string; nome: string }[] = [
  { sigla: 'ac', nome: 'Acre' },
  { sigla: 'al', nome: 'Alagoas' },
  { sigla: 'ap', nome: 'Amapá' },
  { sigla: 'am', nome: 'Amazonas' },
  { sigla: 'ba', nome: 'Bahia' },
  { sigla: 'ce', nome: 'Ceará' },
  { sigla: 'df', nome: 'Distrito Federal' },
  { sigla: 'es', nome: 'Espírito Santo' },
  { sigla: 'go', nome: 'Goiás' },
  { sigla: 'ma', nome: 'Maranhão' },
  { sigla: 'mt', nome: 'Mato Grosso' },
  { sigla: 'ms', nome: 'Mato Grosso do Sul' },
  { sigla: 'mg', nome: 'Minas Gerais' },
  { sigla: 'pa', nome: 'Pará' },
  { sigla: 'pb', nome: 'Paraíba' },
  { sigla: 'pr', nome: 'Paraná' },
  { sigla: 'pe', nome: 'Pernambuco' },
  { sigla: 'pi', nome: 'Piauí' },
  { sigla: 'rj', nome: 'Rio de Janeiro' },
  { sigla: 'rn', nome: 'Rio Grande do Norte' },
  { sigla: 'rs', nome: 'Rio Grande do Sul' },
  { sigla: 'ro', nome: 'Rondônia' },
  { sigla: 'rr', nome: 'Roraima' },
  { sigla: 'sc', nome: 'Santa Catarina' },
  { sigla: 'sp', nome: 'São Paulo' },
  { sigla: 'se', nome: 'Sergipe' },
  { sigla: 'to', nome: 'Tocantins' },
  { sigla: 'zz', nome: 'Exterior' },
];

export function urlResultado(eleicao: string, abr: string, cargo = CARGO_PRESIDENTE): string {
  const ele6 = eleicao.padStart(6, '0');
  const c4 = cargo.padStart(4, '0');
  return `${BASE_TSE}/${CICLO}/${eleicao}/dados/${abr}/${abr}-c${c4}-e${ele6}-u.json`;
}

export const URL_CONFIG = `${BASE_TSE}/comum/config/ele-c.json`;

export interface CandidatoResultado {
  numero: string;
  nome: string;
  partido: string;
  votos: number;
  /** % dos votos válidos, 0–100. */
  percentual: number;
  situacao: string;
}

export interface Resultado {
  abrangencia: string;
  turno: string;
  secoesTotal: number;
  secoesTotalizadas: number;
  /** % de seções totalizadas, 0–100. */
  percentualTotalizado: number;
  eleitorado: number;
  comparecimento: number;
  abstencao: number;
  votosValidos: number;
  brancos: number;
  nulos: number;
  candidatos: CandidatoResultado[];
  /** Horário da última totalização, como publicado ("dd/mm/aaaa hh:mm:ss"). */
  totalizacao: string;
  final: boolean;
}

type Obj = Record<string, unknown>;

const ehObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const texto = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

export function numero(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = texto(v).trim();
  if (!s) return 0;
  // "47,03" → 47.03; "1.234.567" (milhar) → 1234567
  const normal =
    s.includes(',') || /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(normal);
  return Number.isFinite(n) ? n : 0;
}

/** Procura um bloco (`s`, `e`, `v`) na raiz ou dentro do cargo. */
function bloco(raiz: Obj, cargo: Obj | undefined, chave: string): Obj {
  if (ehObj(raiz[chave])) return raiz[chave] as Obj;
  if (cargo && ehObj(cargo[chave])) return cargo[chave] as Obj;
  return {};
}

export function interpretarResultado(json: unknown, cargo = CARGO_PRESIDENTE): Resultado {
  if (!ehObj(json)) throw new Error('Resposta do TSE em formato inesperado');
  const cargos = lista(json.carg).filter(ehObj);
  const c = cargos.find((x) => texto(x.cd) === cargo) ?? cargos[0];

  const candidatos: CandidatoResultado[] = [];
  for (const agr of lista(c?.agr).filter(ehObj)) {
    for (const par of lista(agr.par).filter(ehObj)) {
      for (const cand of lista(par.cand).filter(ehObj)) {
        candidatos.push({
          numero: texto(cand.n),
          nome: texto(cand.nmu) || texto(cand.nm),
          partido: texto(par.sg),
          votos: numero(cand.vap),
          percentual: numero(cand.pvapn ?? cand.pvap),
          situacao: texto(cand.st),
        });
      }
    }
  }

  const s = bloco(json, c, 's');
  const e = bloco(json, c, 'e');
  const v = bloco(json, c, 'v');

  const secoesTotal = numero(s.ts);
  const secoesTotalizadas = numero(s.st);
  const votosValidos = numero(v.vv) || numero(v.vvc) || candidatos.reduce((t, x) => t + x.votos, 0);

  // Percentual ausente ou zerado com votos apurados: calcula sobre os válidos.
  if (votosValidos > 0) {
    for (const x of candidatos) {
      if (!x.percentual && x.votos) x.percentual = (x.votos / votosValidos) * 100;
    }
  }
  candidatos.sort((a, b) => b.votos - a.votos || a.numero.localeCompare(b.numero));

  return {
    abrangencia: texto(json.cdabr).toLowerCase(),
    turno: texto(json.t),
    secoesTotal,
    secoesTotalizadas,
    percentualTotalizado:
      numero(s.pstn ?? s.pst) || (secoesTotal ? (secoesTotalizadas / secoesTotal) * 100 : 0),
    eleitorado: numero(e.te),
    comparecimento: numero(e.c),
    abstencao: numero(e.a),
    votosValidos,
    brancos: numero(v.vb),
    nulos: numero(v.tvn) || numero(v.vn),
    candidatos,
    totalizacao: [texto(json.dt), texto(json.ht)].filter(Boolean).join(' '),
    final: texto(json.and) === 'f',
  };
}

/**
 * Lê no `ele-c.json` os códigos de 1º e 2º turno da eleição geral federal de 2026.
 * O 2º turno aparece no campo `cdt2` da eleição de 1º turno.
 */
export function interpretarConfig(json: unknown): { primeiroTurno: string; segundoTurno: string } | null {
  const achadas: Obj[] = [];
  const visitar = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(visitar);
    else if (ehObj(v)) {
      if (v.cd !== undefined && v.cdt2 !== undefined && texto(v.cdt2)) achadas.push(v);
      Object.values(v).forEach(visitar);
    }
  };
  visitar(json);
  const federal =
    achadas.find((x) => /federal/i.test(texto(x.nm))) ??
    achadas.find((x) => texto(x.cd) === ELEICOES_PADRAO.primeiroTurno) ??
    achadas[0];
  if (!federal) return null;
  return { primeiroTurno: texto(federal.cd), segundoTurno: texto(federal.cdt2) };
}

export interface Comparativo {
  numero: string;
  nome: string;
  partido: string;
  agora: number;
  votosAgora: number;
  primeiroTurno: number | null;
  votosPrimeiroTurno: number | null;
  /** Diferença em pontos percentuais (agora − 1º turno). */
  variacao: number | null;
}

/** Junta os candidatos do 2º turno com o desempenho deles no 1º turno, pelo número. */
export function comparar(atual: Resultado, primeiro: Resultado | undefined): Comparativo[] {
  return atual.candidatos.map((c) => {
    const antes = primeiro?.candidatos.find((x) => x.numero === c.numero);
    return {
      numero: c.numero,
      nome: c.nome,
      partido: c.partido,
      agora: c.percentual,
      votosAgora: c.votos,
      primeiroTurno: antes ? antes.percentual : null,
      votosPrimeiroTurno: antes ? antes.votos : null,
      variacao: antes ? c.percentual - antes.percentual : null,
    };
  });
}
