/**
 * Leitura do QR Code do Boletim de Urna (padrão TSE).
 *
 * O conteúdo de cada QR é uma sequência de pares `CHAVE:VALOR` separados por
 * espaço, por exemplo:
 *
 *   QRBU:1:1 VRQR:1.5 VRCH:20220930 ORIG:VOTA ORLC:LEG PROC:406 DTPL:20221030
 *   PLEI:407 TURN:2 FASE:O UNFE:SP MUNI:62910 ZONA:75 SECA:182 IDUE:1787323
 *   IDCA:666070534576779579335458 VERS:8.26.0.0 LOCA:1015 APTS:325 COMP:278
 *   FALT:47 ... IDEL:545 CARG:1 TIPO:0 VERC:202209 13:45 22:225 APTA:325
 *   NOMI:270 BRAN:5 NULO:3 TOTC:278 HASH:... ASSI:...
 *
 * Um boletim pode ser dividido em vários QR Codes (QRBU:i:n). Cada parte traz
 * um campo HASH (SHA-512) encadeado com o hash da parte anterior, o que
 * funciona como código verificador da integridade do conteúdo.
 */
import { cargoCanonico } from './cargos';
import { sha512Hex } from './hash';
import { apenasDigitos, dataIso, numeroCanonico } from './normalizar';
import type { Boletim, ResultadoCargo } from './types';

export interface ParteQr {
  indice: number;
  total: number;
  texto: string;
}

export class ErroQr extends Error {}

const CABECALHO = new Set(['QRBU', 'VRQR', 'VRCH']);

function tokens(texto: string): [string, string][] {
  return texto
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => {
      const i = t.indexOf(':');
      return i < 0 ? [t, ''] : [t.slice(0, i), t.slice(i + 1)];
    });
}

/** Identifica se o texto é de um QR Code de Boletim de Urna e qual parte. */
export function identificarParte(texto: string): ParteQr {
  const m = texto.trim().match(/^QRBU:(\d+):(\d+)(\s|$)/);
  if (!m) throw new ErroQr('O código lido não é um QR Code de Boletim de Urna (cabeçalho QRBU ausente).');
  const indice = Number(m[1]);
  const total = Number(m[2]);
  if (indice < 1 || total < 1 || indice > total) throw new ErroQr('Cabeçalho QRBU inválido.');
  return { indice, total, texto: texto.trim() };
}

/**
 * Separa uma parte do QR em "dados" (conteúdo do boletim, sem o cabeçalho
 * QRBU/VRQR/VRCH e sem o espaço antes de HASH), hash e assinatura.
 */
function separarSecoes(texto: string): { dados: string; hash: string; assinatura: string | null } | null {
  const semCabecalho = texto.trim().replace(/^QRBU:\S+\s+(VRQR:\S+\s+)?(VRCH:\S+\s+)?/, '');
  const i = semCabecalho.search(/(^|\s)HASH:/);
  if (i < 0) return null;
  const inicio = semCabecalho[i] === 'H' ? i : i + 1;
  const depois = semCabecalho.slice(inicio + 5).split(/\s+/);
  const assi = semCabecalho.match(/(?:^|\s)ASSI:([0-9A-Fa-f]+)/);
  return { dados: semCabecalho.slice(0, inicio).trimEnd(), hash: depois[0], assinatura: assi ? assi[1] : null };
}

export interface ResultadoHash {
  /** true = conferido, false = não confere, null = QR sem campo HASH. */
  valido: boolean | null;
  detalhe: string;
  /** Hash da última parte (é ele que o TSE assina) e a assinatura ASSI. */
  hashFinal?: string;
  assinatura?: string | null;
}

/**
 * Valida a cadeia de hashes SHA-512 das partes do QR Code, conforme o manual
 * "QR Code no Boletim de Urna" do TSE (seções 4 e 6.1):
 *
 *   HASH_1 = SHA-512(dados_1)
 *   HASH_i = SHA-512(conteúdo_(i-1) + " " + dados_i)
 *   conteúdo_(i-1) = "dados_1 HASH:HASH_1 dados_2 HASH:HASH_2 … dados_(i-1) HASH:HASH_(i-1)"
 *
 * em que dados_i é o conteúdo da parte sem o cabeçalho (QRBU/VRQR/VRCH).
 * Conferido com QR Code real de urna (2022) e com os exemplos do manual (2024).
 */
export async function validarHashes(partes: ParteQr[]): Promise<ResultadoHash> {
  let acumulado = '';
  let hashFinal = '';
  let assinatura: string | null = null;
  for (const p of partes) {
    const s = separarSecoes(p.texto);
    if (!s) return { valido: null, detalhe: `QR ${p.indice}/${p.total} não possui campo HASH.` };
    const base = acumulado ? `${acumulado} ${s.dados}` : s.dados;
    if ((await sha512Hex(base)) !== s.hash.toLowerCase()) {
      return { valido: false, detalhe: `Hash do QR ${p.indice}/${p.total} não confere com o conteúdo.` };
    }
    acumulado = `${base} HASH:${s.hash}`;
    hashFinal = s.hash;
    assinatura = s.assinatura ?? assinatura;
  }
  return { valido: true, detalhe: 'Hash SHA-512 de todas as partes conferido.', hashFinal, assinatura };
}

export interface BoletimQr {
  boletim: Boletim;
  /** Pares chave/valor brutos (sem os campos de cargos). */
  campos: Record<string, string>;
}

/** Converte as partes (já ordenadas e completas) em um Boletim normalizado. */
export function interpretarQr(partes: ParteQr[]): BoletimQr {
  const campos: Record<string, string> = {};
  const cargos: ResultadoCargo[] = [];
  let atual: ResultadoCargo | null = null;
  let partidoAtual: string | null = null;
  let hashFinal = '';

  partes.forEach((p, idx) => {
    for (const [chave, valor] of tokens(p.texto)) {
      if (idx > 0 && CABECALHO.has(chave)) continue;
      if (chave === 'HASH') {
        hashFinal = valor;
        continue;
      }
      if (chave === 'CARG') {
        atual = {
          cargo: cargoCanonico(valor),
          candidatos: [],
          votosNominais: null,
          votosLegenda: null,
          brancos: null,
          nulos: null,
          totalApurado: null,
        };
        cargos.push(atual);
        partidoAtual = null;
        continue;
      }
      if (atual) {
        const c: ResultadoCargo = atual;
        if (/^\d+$/.test(chave)) {
          c.candidatos.push({ numero: numeroCanonico(chave), votos: Number(valor) || 0 });
          continue;
        }
        switch (chave) {
          case 'PART':
            partidoAtual = numeroCanonico(valor);
            continue;
          case 'LEGP':
            if (partidoAtual) {
              c.candidatos.push({ numero: partidoAtual, nome: `LEGENDA ${partidoAtual}`, votos: Number(valor) || 0, legenda: true });
              c.votosLegenda = (c.votosLegenda ?? 0) + (Number(valor) || 0);
            }
            continue;
          case 'NOMI':
            c.votosNominais = Number(valor);
            continue;
          case 'LEGC':
            c.votosLegenda = Number(valor);
            continue;
          case 'BRAN':
            c.brancos = Number(valor);
            continue;
          case 'NULO':
            c.nulos = Number(valor);
            continue;
          case 'TOTC':
            c.totalApurado = Number(valor);
            continue;
          case 'APTA':
            if (!campos.APTA) campos.APTA = valor;
            continue;
          case 'TIPO':
          case 'VERC':
          case 'APTS':
          case 'APTT':
          case 'CSEC':
          case 'TOTP':
            continue;
        }
      }
      if (!(chave in campos)) campos[chave] = valor;
    }
  });

  if (!campos.ZONA || !campos.SECA) throw new ErroQr('QR Code sem identificação de zona/seção.');
  if (!cargos.length) throw new ErroQr('QR Code sem resultados de votação (nenhum cargo encontrado).');

  // APTO = total de aptos (originários + transferidos); BU do Sistema de Apuração não traz APTO.
  const aptos = campos.APTO ?? campos.APTS ?? campos.APTA;
  const boletim: Boletim = {
    uf: campos.UNFE,
    municipio: campos.MUNI ? `MUNICÍPIO ${campos.MUNI}` : '',
    codigoMunicipio: campos.MUNI ? numeroCanonico(campos.MUNI) : undefined,
    zona: numeroCanonico(campos.ZONA),
    local: numeroCanonico(campos.LOCA),
    secao: numeroCanonico(campos.SECA),
    codigoUe: apenasDigitos(campos.IDUE),
    codigoCarga: apenasDigitos(campos.IDCA),
    dataVotacao: dataIso(campos.DTPL ?? campos.DTAB),
    turno: campos.TURN,
    eleitoresAptos: aptos !== undefined ? Number(aptos) : null,
    comparecimento: campos.COMP !== undefined ? Number(campos.COMP) : null,
    faltosos: campos.FALT !== undefined ? Number(campos.FALT) : null,
    cargos,
    assinaturaQr: campos.ASSI || hashFinal || undefined,
    versaoSoftware: campos.VERS,
    fase: campos.FASE,
    pleito: campos.PLEI ? numeroCanonico(campos.PLEI) : undefined,
  };
  // Alguns QR não trazem COMP/FALT no cabeçalho: deriva do total do 1º cargo.
  if (boletim.comparecimento === null && cargos[0]?.totalApurado != null) {
    boletim.comparecimento = cargos[0].totalApurado;
  }
  if (boletim.faltosos === null && boletim.eleitoresAptos !== null && boletim.comparecimento !== null) {
    boletim.faltosos = boletim.eleitoresAptos - boletim.comparecimento;
  }
  return { boletim, campos };
}

/**
 * Acumula as partes de um BU dividido em vários QR Codes, lidos em qualquer
 * ordem, até que todas estejam disponíveis.
 */
export class MontadorQr {
  private partes = new Map<number, ParteQr>();
  private total = 0;

  adicionar(texto: string): { parte: ParteQr; nova: boolean; completo: boolean; lidas: number; total: number } {
    const parte = identificarParte(texto);
    if (this.total && parte.total !== this.total) {
      // QR de outro boletim (quantidade de partes diferente): recomeça.
      this.limpar();
    }
    this.total = parte.total;
    const existente = this.partes.get(parte.indice);
    const nova = !existente;
    if (existente && existente.texto !== parte.texto) {
      // Mesma posição com conteúdo diferente: é outro boletim, recomeça.
      this.limpar();
      this.total = parte.total;
    }
    this.partes.set(parte.indice, parte);
    return { parte, nova: nova || existente?.texto !== parte.texto, completo: this.completo, lidas: this.partes.size, total: this.total };
  }

  get completo(): boolean {
    return this.total > 0 && this.partes.size === this.total;
  }

  get lidas(): number[] {
    return [...this.partes.keys()].sort((a, b) => a - b);
  }

  get quantidadeTotal(): number {
    return this.total;
  }

  ordenadas(): ParteQr[] {
    return [...this.partes.values()].sort((a, b) => a.indice - b.indice);
  }

  limpar(): void {
    this.partes.clear();
    this.total = 0;
  }
}

/** Separa um texto colado com várias partes (uma por linha ou concatenadas). */
export function separarPartes(texto: string): string[] {
  return texto
    .split(/(?=QRBU:\d+:\d+)/)
    .map((s) => s.trim())
    .filter(Boolean);
}
