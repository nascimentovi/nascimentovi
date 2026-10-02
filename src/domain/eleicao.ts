import type { Boletim } from './types';

export interface Eleicao {
  /** Chave de filtro: ano da eleição (ex.: "2024"). */
  chave: string;
  rotulo: string;
}

/**
 * Eleição do boletim pela data da votação. Eleições ordinárias ocorrem em anos
 * pares: gerais (presidente, governador…) em 2018, 2022, 2026…; municipais
 * (prefeito, vereador) em 2020, 2024, 2028…
 */
export function eleicaoDoBoletim(b: Pick<Boletim, 'dataVotacao'>): Eleicao | null {
  const ano = Number(b.dataVotacao?.slice(0, 4));
  if (!ano) return null;
  const tipo = ano % 2 === 1 ? 'suplementar' : ano % 4 === 0 ? 'municipais' : 'gerais';
  return { chave: String(ano), rotulo: `Eleições ${ano} – ${tipo}` };
}

/**
 * Turno do boletim: o QR Code traz o campo TURN; o arquivo .bu não traz, então
 * o turno é deduzido pela data (1º turno no início de outubro; 2º no fim de
 * outubro; em 2020, 15/11 e 29/11).
 */
export function turnoDoBoletim(b: Pick<Boletim, 'turno' | 'dataVotacao'>): '1' | '2' | null {
  if (b.turno === '1' || b.turno === '2') return b.turno;
  const m = b.dataVotacao?.match(/^\d{4}-(\d{2})-(\d{2})/);
  if (!m) return null;
  const mes = Number(m[1]);
  const dia = Number(m[2]);
  if (mes === 10) return dia <= 14 ? '1' : '2';
  if (mes === 11) return dia <= 20 ? '1' : '2';
  return null;
}
