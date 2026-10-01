/**
 * Dados públicos do TSE para aplicativos de leitura do QR Code do BU
 * (manual "QR Code no Boletim de Urna", seções 6.2 e 7):
 *
 * - chave pública Ed25519 por versão de chave/UF, para verificar a assinatura;
 * - arquivo de complemento com os nomes de município, cargos e candidatos.
 *
 * Ambos são opcionais: sem internet (ou se o servidor não responder) a
 * leitura segue normalmente, e o que foi baixado fica em cache no aparelho.
 */
import { gravarConfig, lerConfig } from '../db/database';
import { cargoCanonico } from '../domain/cargos';

const SERVIDORES = ['https://qrcodenobu.tse.jus.br', 'http://qrcodenobu.tse.jus.br'];
const TIMEOUT_MS = 4000;
/** Após uma falha de rede, não tenta de novo por 2 minutos (não atrasa as leituras). */
const ESPERA_APOS_FALHA_MS = 2 * 60 * 1000;
let indisponivelAte = 0;

/** Página em HTTPS não pode buscar HTTP (conteúdo misto): usa só HTTPS. */
function servidores(): string[] {
  return typeof location !== 'undefined' && location.protocol === 'https:' ? SERVIDORES.slice(0, 1) : SERVIDORES;
}

/** Para testes: esquece falhas anteriores. */
export function reiniciarDisponibilidade(): void {
  indisponivelAte = 0;
}

type Campos = Record<string, string>;

async function baixar(caminho: string): Promise<Response | null> {
  if (Date.now() < indisponivelAte) return null;
  let falhaDeRede = true;
  for (const base of servidores()) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(`${base}${caminho}`, { signal: ctrl.signal });
      falhaDeRede = false;
      if (r.ok) return r;
    } catch {
      /* tenta o próximo endereço */
    } finally {
      clearTimeout(t);
    }
  }
  if (falhaDeRede) indisponivelAte = Date.now() + ESPERA_APOS_FALHA_MS;
  return null;
}

const FASE_LETRA: Record<string, string> = { O: 'o', S: 's', T: 't' };
const FASE_EXTENSO: Record<string, string> = { O: 'oficial', S: 'simulado', T: 'treinamento' };

/** Caminho da chave pública: /tse.qrcodebu/{VRCH}/{LEGAL|COMUNITARIA}/{fase}{uf}qrcode.pub */
export function caminhoChave(c: Campos): string | null {
  const fase = FASE_LETRA[c.FASE ?? ''];
  if (!c.VRCH || !c.UNFE || !fase) return null;
  const tipo = c.ORLC === 'COM' ? 'COMUNITARIA' : 'LEGAL';
  return `/tse.qrcodebu/${c.VRCH}/${tipo}/${fase}${c.UNFE.toLowerCase()}qrcode.pub`;
}

/** Chave pública Ed25519 (32 bytes) — do cache ou baixada do TSE. */
export async function obterChavePublica(c: Campos): Promise<Uint8Array | null> {
  const caminho = caminhoChave(c);
  if (!caminho) return null;
  const cache = await lerConfig<number[] | null>(`chave:${caminho}`, null);
  if (cache?.length === 32) return new Uint8Array(cache);
  const r = await baixar(caminho);
  if (!r) return null;
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length !== 32) return null;
  await gravarConfig(`chave:${caminho}`, Array.from(bytes));
  return bytes;
}

/** Caminho do complemento: /json-bu/{fase}/{processo}/{f}{pleito:5}{uf}{municipio:5}-qbu.js */
export function caminhoComplemento(c: Campos): string | null {
  const fase = FASE_LETRA[c.FASE ?? ''];
  if (!fase || !c.PROC || !c.PLEI || !c.UNFE || !c.MUNI) return null;
  const p5 = (s: string) => s.replace(/\D/g, '').padStart(5, '0');
  return `/json-bu/${FASE_EXTENSO[c.FASE]}/${Number(c.PROC)}/${fase}${p5(c.PLEI)}${c.UNFE.toLowerCase()}${p5(c.MUNI)}-qbu.js`;
}

export interface Complemento {
  municipio: string | null;
  /** Nome por `${CARGO canônico}|${número}` (inclui a sigla do partido). */
  candidatos: Record<string, string>;
}

interface JsonComplemento {
  processoEleitoral?: {
    municipio?: { nome?: string };
    eleicoes?: {
      partidosPorCargos?: {
        cargo?: { codigo?: number };
        candidaturasPorPartidos?: {
          partido?: { sigla?: string; numero?: number };
          candidaturas?: { numero?: number; titular?: { nome?: string } }[];
        }[];
      }[];
    }[];
  };
}

/** Extrai nomes do arquivo de complemento (formato da seção 7.1 do manual). */
export function interpretarComplemento(texto: string): Complemento | null {
  const i = texto.indexOf('{');
  const f = texto.lastIndexOf('}');
  if (i < 0 || f < i) return null;
  let json: JsonComplemento;
  try {
    json = JSON.parse(texto.slice(i, f + 1));
  } catch {
    return null;
  }
  const pe = json.processoEleitoral;
  if (!pe) return null;
  const candidatos: Record<string, string> = {};
  for (const el of pe.eleicoes ?? []) {
    for (const pc of el.partidosPorCargos ?? []) {
      if (pc.cargo?.codigo === undefined) continue;
      const cargo = cargoCanonico(String(pc.cargo.codigo));
      for (const cp of pc.candidaturasPorPartidos ?? []) {
        const sigla = cp.partido?.sigla;
        for (const cand of cp.candidaturas ?? []) {
          if (cand.numero === undefined || !cand.titular?.nome) continue;
          candidatos[`${cargo}|${cand.numero}`] = `${cand.titular.nome.toUpperCase()}${sigla ? ` (${sigla})` : ''}`;
        }
      }
    }
  }
  return { municipio: pe.municipio?.nome?.toUpperCase() ?? null, candidatos };
}

/** Nomes do município e dos candidatos — do cache ou baixados do TSE. */
export async function obterComplemento(c: Campos): Promise<Complemento | null> {
  const caminho = caminhoComplemento(c);
  if (!caminho) return null;
  const cache = await lerConfig<Complemento | null>(`complemento:${caminho}`, null);
  if (cache) return cache;
  const r = await baixar(caminho);
  if (!r) return null;
  const comp = interpretarComplemento(await r.text());
  if (comp) await gravarConfig(`complemento:${caminho}`, comp);
  return comp;
}
