import { LOCAIS_POR_MUNICIPIO, type LocalVotacao } from '../dados/locaisVotacao';
import { numeroCanonico } from './normalizar';

export interface InfoLocal extends LocalVotacao {
  /** A seção do boletim consta da lista de seções desse local. */
  secaoConfere: boolean;
  /** O local foi deduzido pela seção (o boletim não trazia o número do local). */
  deduzidoPelaSecao: boolean;
}

/**
 * Identifica escola e bairro do boletim pelo município + local de votação;
 * sem o local (ex.: BU do Sistema de Apuração ou OCR), deduz pela seção.
 */
export function identificarLocal(codigoMunicipio: string | null | undefined, local: string | null | undefined, secao: string | null | undefined): InfoLocal | null {
  const locais = LOCAIS_POR_MUNICIPIO[numeroCanonico(codigoMunicipio)];
  if (!locais) return null;
  const nSecao = Number(numeroCanonico(secao));
  const l = numeroCanonico(local);
  if (l) {
    const achado = locais.find((x) => x.local === l);
    return achado ? { ...achado, secaoConfere: achado.secoes.includes(nSecao), deduzidoPelaSecao: false } : null;
  }
  const porSecao = nSecao ? locais.find((x) => x.secoes.includes(nSecao)) : undefined;
  return porSecao ? { ...porSecao, secaoConfere: true, deduzidoPelaSecao: true } : null;
}

/** Atalho para registros: usa o código do município, local e seção gravados. */
export function localDaLeitura(l: { boletim: { codigoMunicipio?: string }; local_votacao: string; secao: string }): InfoLocal | null {
  return identificarLocal(l.boletim.codigoMunicipio, l.local_votacao, l.secao);
}

export interface ProgressoLocal {
  local: string;
  escola: string;
  bairro: string;
  total: number;
  lidas: number[];
  faltantes: number[];
}

export interface ProgressoSecoes {
  total: number;
  lidas: number;
  faltam: number;
  porLocal: ProgressoLocal[];
}

/** Município de referência do contador de seções (Conchal/SP). */
export const MUNICIPIO_CONTADOR = '63452';

/**
 * Quantas seções do município já foram lidas e quantas faltam, pela relação
 * de locais e seções cadastrada. Cada seção conta uma vez, qualquer que seja
 * a forma de leitura. Recebe só os registros que devem contar (ex.: ativos da
 * eleição/turno escolhidos).
 */
export function progressoSecoes(
  leituras: { boletim: { codigoMunicipio?: string }; secao: string }[],
  codigoMunicipio = MUNICIPIO_CONTADOR,
): ProgressoSecoes | null {
  const locais = LOCAIS_POR_MUNICIPIO[numeroCanonico(codigoMunicipio)];
  if (!locais) return null;
  const lidas = new Set(
    leituras
      .filter((l) => numeroCanonico(l.boletim.codigoMunicipio) === numeroCanonico(codigoMunicipio))
      .map((l) => Number(numeroCanonico(l.secao))),
  );
  const porLocal = locais.map((l) => ({
    local: l.local,
    escola: l.escola,
    bairro: l.bairro,
    total: l.secoes.length,
    lidas: l.secoes.filter((s) => lidas.has(s)),
    faltantes: l.secoes.filter((s) => !lidas.has(s)),
  }));
  const total = porLocal.reduce((n, l) => n + l.total, 0);
  const lidasTotal = porLocal.reduce((n, l) => n + l.lidas.length, 0);
  return { total, lidas: lidasTotal, faltam: total - lidasTotal, porLocal };
}
