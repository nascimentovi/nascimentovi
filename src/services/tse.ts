/**
 * Conferência da leitura do QR Code com o Boletim de Urna oficial publicado
 * pelo TSE em resultados.tse.jus.br ("arquivo-urna").
 *
 * Os identificadores necessários vêm do próprio QR: ano (DTPL), pleito
 * (PLEI), UF (UNFE), município (MUNI), zona (ZONA) e seção (SECA).
 *
 * 1. `.../arquivo-urna/{pleito}/dados/{uf}/{mun}/{zona}/{secao}/p{pleito}-{uf}-m{mun}-z{zona}-s{secao}-aux.json`
 *    lista os arquivos publicados da seção (por hash).
 * 2. `.../{hash}/{arquivo}.imgbu` é o texto do boletim impresso, que é
 *    interpretado e comparado voto a voto com o QR lido.
 */
import { lerConfig } from '../db/database';
import { compararBoletins } from '../domain/comparacao';
import { interpretarTextoBu, type LinhaTexto } from '../domain/textoBu';
import type { Boletim, ConferenciaTse } from '../domain/types';

export const CFG_TSE_BASE = 'tseBase';
export const CFG_TSE_EXIGIR = 'tseExigir';
export const TSE_BASE_PADRAO = 'https://resultados.tse.jus.br';
/** Em desenvolvimento, o Vite encaminha /tse para o TSE (evita bloqueio CORS). */
export const TSE_BASE_DEV = '/tse';
const TIMEOUT_MS = 20000;

export class ErroTse extends Error {
  constructor(
    message: string,
    /** true quando vale a pena tentar de novo (rede, BU ainda não publicado). */
    readonly temporario = true,
  ) {
    super(message);
  }
}

export async function baseTse(): Promise<string> {
  const padrao = import.meta.env.DEV ? TSE_BASE_DEV : TSE_BASE_PADRAO;
  return ((await lerConfig<string>(CFG_TSE_BASE, '')) || padrao).replace(/\/+$/, '');
}

export async function conferenciaTseExigida(): Promise<boolean> {
  return lerConfig(CFG_TSE_EXIGIR, true);
}

const pad = (s: string | undefined, n: number) => (s ?? '').replace(/\D/g, '').padStart(n, '0');

/** Monta a URL do índice (aux.json) da seção a partir dos dados do QR. */
export function urlIndiceSecao(b: Boletim, base: string): string {
  const ano = b.dataVotacao.slice(0, 4);
  const uf = (b.uf ?? '').toLowerCase();
  const faltando = [
    !/^\d{4}$/.test(ano) && 'data da eleição',
    !b.pleito && 'pleito (PLEI)',
    !uf && 'UF (UNFE)',
    !b.codigoMunicipio && 'município (MUNI)',
    !b.zona && 'zona',
    !b.secao && 'seção',
  ].filter(Boolean);
  if (faltando.length) {
    throw new ErroTse(`O QR Code não traz os dados necessários para consultar o TSE: ${faltando.join(', ')}.`, false);
  }
  const pleito = String(Number(b.pleito));
  const mun = pad(b.codigoMunicipio, 5);
  const zona = pad(b.zona, 4);
  const secao = pad(b.secao, 4);
  const dir = `${base}/oficial/ele${ano}/arquivo-urna/${pleito}/dados/${uf}/${mun}/${zona}/${secao}`;
  return `${dir}/p${pad(pleito, 6)}-${uf}-m${mun}-z${zona}-s${secao}-aux.json`;
}

interface IndiceSecao {
  st?: string;
  ds?: string;
  hashes?: { hash: string; st?: string; ds?: string; nmarq?: string[] }[];
}

async function buscar(url: string, tipo: 'json' | 'texto'): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let r: Response;
  try {
    r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
  } catch (e) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    throw new ErroTse(
      offline
        ? 'Sem conexão com a internet. A leitura só pode ser aceita após a consulta ao TSE.'
        : (e as Error).name === 'AbortError'
          ? 'O site do TSE não respondeu a tempo.'
          : 'Não foi possível acessar o site do TSE (rede indisponível ou acesso bloqueado pelo navegador — veja "Endereço do TSE" em Configurações).',
    );
  } finally {
    clearTimeout(t);
  }
  if (r.status === 404 || r.status === 403) {
    throw new ErroTse('O boletim desta seção ainda não foi publicado pelo TSE (ou os dados do QR não correspondem a uma seção oficial).');
  }
  if (!r.ok) throw new ErroTse(`O site do TSE respondeu com erro ${r.status}.`);
  if (tipo === 'json') {
    try {
      return await r.json();
    } catch {
      throw new ErroTse('Resposta inválida do TSE (índice da seção).');
    }
  }
  const bytes = new Uint8Array(await r.arrayBuffer());
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('iso-8859-1').decode(bytes);
  }
}

/** Escolhe o arquivo .imgbu (texto do BU) entre os publicados da seção. */
export function escolherArquivoBu(indice: IndiceSecao): { hash: string; arquivo: string } {
  const candidatos = (indice.hashes ?? []).filter((h) => h.nmarq?.some((n) => n.endsWith('.imgbu')));
  // Prefere o boletim já totalizado/recebido; descarta os excluídos/rejeitados.
  const ordenados = [...candidatos].sort((a, b) => peso(b.st ?? b.ds) - peso(a.st ?? a.ds));
  const h = ordenados[0];
  if (!h || peso(h.st ?? h.ds) < 0) throw new ErroTse('O TSE ainda não publicou o boletim desta seção.');
  return { hash: h.hash, arquivo: h.nmarq!.find((n) => n.endsWith('.imgbu'))! };
}

function peso(st?: string): number {
  const s = (st ?? '').toLowerCase();
  if (/exclu|rejeit|cancel|substitu/.test(s)) return -1;
  if (/totaliz/.test(s)) return 3;
  if (/receb|instal/.test(s)) return 2;
  return 1;
}

/** Campos comparados entre QR e TSE: identificação da urna, eleitores e votos. */
function campoRelevante(campo: string): boolean {
  return ['Zona', 'Seção', 'Eleitores aptos', 'Comparecimento', 'Faltosos'].includes(campo) || campo.includes(' · ');
}

/** Compara o boletim lido no QR com o texto do BU oficial do TSE. */
export function conferirComTextoTse(qr: Boletim, textoBu: string, url: string): ConferenciaTse {
  const linhas: LinhaTexto[] = textoBu.split(/\r?\n/).map((texto) => ({ texto, confianca: 100 }));
  const tse = interpretarTextoBu(linhas, { ocr: false }).boletim;
  if (!tse.cargos.length) throw new ErroTse('Não foi possível interpretar o boletim publicado pelo TSE.', false);
  // Só compara cargos presentes nos dois (o .imgbu pode trazer cargos de outra eleição do mesmo pleito).
  const cargosQr = new Set(qr.cargos.map((c) => c.cargo));
  const tseFiltrado: Boletim = { ...tse, cargos: tse.cargos.filter((c) => cargosQr.has(c.cargo)) };
  const faltam = qr.cargos.filter((c) => !tseFiltrado.cargos.some((t) => t.cargo === c.cargo)).map((c) => c.cargo);

  const divergencias = compararBoletins(qr, tseFiltrado)
    .filter((d) => campoRelevante(d.campo))
    // Cargo ausente no TSE já é reportado abaixo, sem listar cada candidato.
    .filter((d) => !faltam.some((c) => d.campo.startsWith(`${c} · `)))
    .filter((d) => d.diverge || (d.campo.includes(' · ') && d.anterior !== '—' && d.anterior !== '0' && d.atual === '—'))
    .map((d) => ({ campo: d.campo, qr: d.anterior, tse: d.atual }));
  for (const c of faltam) divergencias.push({ campo: c, qr: 'presente', tse: 'ausente no BU do TSE' });

  return {
    status: divergencias.length ? 'divergente' : 'conferido',
    consultado_em: new Date().toISOString(),
    url,
    divergencias,
  };
}

/** Consulta o TSE e confere o boletim lido. Lança ErroTse se não for possível consultar. */
export async function consultarBuTse(qr: Boletim, base?: string): Promise<ConferenciaTse> {
  const raiz = base ?? (await baseTse());
  const urlIndice = urlIndiceSecao(qr, raiz);
  const indice = (await buscar(urlIndice, 'json')) as IndiceSecao;
  const { hash, arquivo } = escolherArquivoBu(indice);
  const urlBu = `${urlIndice.slice(0, urlIndice.lastIndexOf('/'))}/${hash}/${arquivo}`;
  const texto = (await buscar(urlBu, 'texto')) as string;
  return conferirComTextoTse(qr, texto, urlBu);
}
