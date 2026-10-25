import {
  ELEICOES_PADRAO,
  UFS,
  URL_CONFIG,
  interpretarConfig,
  interpretarResultado,
  urlResultado,
  type Resultado,
} from '../domain/tseResultado';

export const ABRANGENCIAS = ['br', ...UFS.map((u) => u.sigla)];

export interface Eleicoes {
  primeiroTurno: string;
  segundoTurno: string;
}

async function baixarJson(url: string, sinal?: AbortSignal): Promise<unknown> {
  // `no-cache` revalida com ETag: o TSE responde 304 enquanto o arquivo não muda.
  const r = await fetch(url, { cache: 'no-cache', signal: sinal });
  if (!r.ok) throw new Error(r.status === 404 ? 'ainda não publicado' : `HTTP ${r.status}`);
  return r.json();
}

export async function descobrirEleicoes(sinal?: AbortSignal): Promise<Eleicoes> {
  try {
    return interpretarConfig(await baixarJson(URL_CONFIG, sinal)) ?? ELEICOES_PADRAO;
  } catch {
    return ELEICOES_PADRAO;
  }
}

export type Resultados = Record<string, Resultado>;
export type Erros = Record<string, string>;

/** Baixa o resultado de várias abrangências com no máximo `paralelo` requisições simultâneas. */
export async function baixarResultados(
  eleicao: string,
  abrangencias: string[],
  sinal?: AbortSignal,
  paralelo = 6,
): Promise<{ resultados: Resultados; erros: Erros }> {
  const resultados: Resultados = {};
  const erros: Erros = {};
  const fila = [...abrangencias];
  const trabalhador = async () => {
    for (let abr = fila.shift(); abr; abr = fila.shift()) {
      try {
        resultados[abr] = interpretarResultado(await baixarJson(urlResultado(eleicao, abr), sinal));
      } catch (e) {
        if (sinal?.aborted) return;
        erros[abr] = e instanceof Error ? e.message : String(e);
      }
    }
  };
  await Promise.all(Array.from({ length: paralelo }, trabalhador));
  return { resultados, erros };
}
