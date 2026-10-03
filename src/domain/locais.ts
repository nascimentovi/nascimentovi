import { LOCAIS_POR_MUNICIPIO, type LocalVotacao } from '../dados/locaisVotacao';
import { codigoPorNomeUnico } from './municipios';
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

interface LeituraMinima {
  boletim: { codigoMunicipio?: string; municipio?: string };
  municipio?: string;
  local_votacao?: string;
  secao: string;
}

/**
 * Código TSE do município de um registro. Boletins lidos por PDF/foto podem ter
 * só o nome (o código não foi reconhecido): usa o nome quando é único no país.
 */
export function codigoMunicipioDaLeitura(l: LeituraMinima): string {
  return numeroCanonico(l.boletim.codigoMunicipio) || codigoPorNomeUnico(l.municipio || l.boletim.municipio) || '';
}

/** Atalho para registros: usa o município, local e seção gravados. */
export function localDaLeitura(l: LeituraMinima): InfoLocal | null {
  return identificarLocal(codigoMunicipioDaLeitura(l), l.local_votacao, l.secao);
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
  /** Boletins do município cuja seção não consta da relação (não entram na contagem). */
  foraDaRelacao: { secao: string; local: string }[];
  /** Boletins sem município identificado (não entram na contagem). */
  semMunicipio: { secao: string; local: string }[];
}

/** Município de referência do contador de seções (Conchal/SP). */
export const MUNICIPIO_CONTADOR = '63452';

/**
 * Quantas seções do município já foram lidas e quantas faltam, pela relação
 * de locais e seções cadastrada. Cada seção conta uma vez, qualquer que seja
 * a forma de leitura. Recebe só os registros que devem contar (ex.: ativos da
 * eleição/turno escolhidos).
 */
export function progressoSecoes(leituras: LeituraMinima[], codigoMunicipio = MUNICIPIO_CONTADOR): ProgressoSecoes | null {
  const locais = LOCAIS_POR_MUNICIPIO[numeroCanonico(codigoMunicipio)];
  if (!locais) return null;
  const doMunicipio = leituras.filter((l) => codigoMunicipioDaLeitura(l) === numeroCanonico(codigoMunicipio));
  const lidas = new Set(doMunicipio.map((l) => Number(numeroCanonico(l.secao))));
  const todas = new Set(locais.flatMap((l) => l.secoes));
  const foraDaRelacao = doMunicipio
    .filter((l) => !todas.has(Number(numeroCanonico(l.secao))))
    .map((l) => ({ secao: numeroCanonico(l.secao), local: numeroCanonico(l.local_votacao) }));
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
  const semMunicipio = leituras
    .filter((l) => !codigoMunicipioDaLeitura(l))
    .map((l) => ({ secao: numeroCanonico(l.secao), local: numeroCanonico(l.local_votacao) }));
  return { total, lidas: lidasTotal, faltam: total - lidasTotal, porLocal, foraDaRelacao, semMunicipio };
}
