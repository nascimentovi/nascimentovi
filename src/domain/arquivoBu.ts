/**
 * Leitura do arquivo binário do Boletim de Urna publicado pelo TSE
 * (extensão .bu, também baixado como .dat), codificado em ASN.1/DER.
 *
 * Estrutura (conforme a especificação ASN.1 do BU do TSE, conferida com um
 * arquivo real de 2024):
 *
 *   EntidadeEnvelopeGenerico ::= SEQUENCE {
 *     cabecalho, fase, identificacao [0], tipoEnvelope,
 *     conteudo OCTET STRING  -- contém a EntidadeBoletimUrna
 *   }
 *   EntidadeBoletimUrna ::= SEQUENCE {
 *     cabecalho, fase ENUM, urna SEQUENCE { …, correspondencia { identificacao, carga { numeroInternoUrna, …, codigoCarga } } },
 *     identificacaoSecao SEQUENCE { SEQUENCE { municipio, zona }, local, secao },
 *     dataHoraEmissao, [0] { dataHoraAbertura, dataHoraEncerramento } …,
 *     resultadosVotacaoPorEleicao SEQUENCE OF {
 *       idEleicao, qtdEleitoresAptos, …,
 *       resultadosVotacao SEQUENCE OF {
 *         tipoCargo ENUM, qtdComparecimento,
 *         totaisVotosCargo SEQUENCE OF {
 *           codigoCargo [1] cargo constitucional | [2] consulta, ordemImpressao,
 *           votosVotaveis SEQUENCE OF {
 *             [1] tipoVoto (1 nominal, 2 branco, 3 nulo, 4 legenda), [2] quantidadeVotos,
 *             [3] identificacaoVotavel { partido, codigo } OPTIONAL, ordem, assinatura
 *           }
 *         }
 *       }
 *     }, …
 *   }
 */
import { cargoCanonico } from './cargos';
import { nomeMunicipioTse, municipioPorCodigoTse } from './municipios';
import { dataIso } from './normalizar';
import type { Boletim, ResultadoCargo } from './types';

interface No {
  classe: number; // 0 universal, 1 application, 2 context, 3 private
  numero: number;
  construido: boolean;
  valor: Uint8Array;
  filhos: No[];
}

export class ErroArquivoBu extends Error {}

const SEQUENCE = 16;
const INTEGER = 2;
const ENUMERATED = 10;
const OCTET_STRING = 4;
const GENERAL_STRING = 27;

function lerNos(b: Uint8Array, inicio: number, fim: number, profundidade = 0): No[] {
  if (profundidade > 40) throw new ErroArquivoBu('Estrutura do arquivo muito profunda.');
  const nos: No[] = [];
  let i = inicio;
  while (i < fim) {
    if (i + 2 > fim) throw new ErroArquivoBu('Arquivo truncado.');
    const tag = b[i++];
    const classe = tag >> 6;
    const construido = ((tag >> 5) & 1) === 1;
    let numero = tag & 0x1f;
    if (numero === 0x1f) {
      numero = 0;
      while (i < fim && b[i] & 0x80) numero = (numero << 7) | (b[i++] & 0x7f);
      numero = (numero << 7) | (b[i++] & 0x7f);
    }
    let len = b[i++];
    if (len & 0x80) {
      const n = len & 0x7f;
      if (n === 0 || n > 4) throw new ErroArquivoBu('Comprimento inválido no arquivo.');
      len = 0;
      for (let k = 0; k < n; k++) len = len * 256 + b[i++];
    }
    if (i + len > fim) throw new ErroArquivoBu('Arquivo truncado ou corrompido.');
    const valor = b.subarray(i, i + len);
    nos.push({ classe, numero, construido, valor, filhos: construido ? lerNos(b, i, i + len, profundidade + 1) : [] });
    i += len;
  }
  return nos;
}

function inteiro(n: No | undefined): number | null {
  if (!n || n.construido || n.valor.length === 0 || n.valor.length > 6) return null;
  let v = 0;
  for (const byte of n.valor) v = v * 256 + byte;
  return v;
}

function texto(n: No | undefined): string {
  return n && !n.construido ? new TextDecoder('latin1').decode(n.valor) : '';
}

const ehSeq = (n: No | undefined) => !!n && n.classe === 0 && n.numero === SEQUENCE;
const ehUniv = (n: No | undefined, num: number) => !!n && n.classe === 0 && n.numero === num;
const ctx = (n: No, num: number) => n.filhos.find((f) => f.classe === 2 && f.numero === num);

/** Percorre a árvore (em profundidade) procurando o primeiro nó que satisfaz o critério. */
function procurar(nos: No[], criterio: (n: No) => boolean): No | undefined {
  for (const n of nos) {
    if (criterio(n)) return n;
    const r = procurar(n.filhos, criterio);
    if (r) return r;
  }
  return undefined;
}

function todos(nos: No[], criterio: (n: No) => boolean, out: No[] = []): No[] {
  for (const n of nos) {
    if (criterio(n)) out.push(n);
    todos(n.filhos, criterio, out);
  }
  return out;
}

/** SEQUENCE { SEQUENCE { municipio, zona }, local, secao } */
function ehIdentificacaoSecao(n: No): boolean {
  const [mz, local, secao] = n.filhos;
  return (
    n.filhos.length === 3 &&
    ehSeq(mz) && mz.filhos.length === 2 && mz.filhos.every((f) => ehUniv(f, INTEGER)) &&
    ehUniv(local, INTEGER) && ehUniv(secao, INTEGER)
  );
}

/** Resultado de votação: SEQUENCE { ENUM tipoCargo, INTEGER comparecimento, SEQUENCE OF totais } */
function ehResultadoVotacao(n: No): boolean {
  const [tipo, comp, totais] = n.filhos;
  return ehSeq(n) && ehUniv(tipo, ENUMERATED) && ehUniv(comp, INTEGER) && ehSeq(totais);
}

/** Verifica se os bytes parecem um arquivo de BU (SEQUENCE DER). */
export function pareceArquivoBu(bytes: Uint8Array): boolean {
  return bytes.length > 64 && bytes[0] === 0x30 && (bytes[1] & 0x80) !== 0;
}

export interface ArquivoBu {
  boletim: Boletim;
  codigoCarga: string;
  versaoSoftware: string;
}

/** Decodifica o arquivo .bu/.dat do TSE em um Boletim normalizado. */
export function interpretarArquivoBu(bytes: Uint8Array): ArquivoBu {
  if (!pareceArquivoBu(bytes)) throw new ErroArquivoBu('O arquivo não é um Boletim de Urna do TSE (.bu).');
  let raiz = lerNos(bytes, 0, bytes.length);
  // Envelope genérico: o boletim fica dentro de um OCTET STRING.
  const envelope = raiz[0];
  const conteudo = envelope?.filhos.find((f) => ehUniv(f, OCTET_STRING) && f.valor[0] === 0x30 && f.valor.length > 64);
  if (conteudo) raiz = lerNos(conteudo.valor, 0, conteudo.valor.length);
  const bu = raiz[0];
  if (!ehSeq(bu)) throw new ErroArquivoBu('Estrutura do Boletim de Urna não reconhecida.');

  // Fase: 1 simulado, 2 oficial, 3 treinamento (2º elemento do boletim).
  const faseNum = inteiro(bu.filhos.find((f) => ehUniv(f, ENUMERATED)));
  const fase = faseNum === 2 ? 'O' : faseNum === 1 ? 'S' : faseNum === 3 ? 'T' : undefined;

  // Identificação da seção: a do boletim (filho direto); a da urna pode trazer local 1.
  const ident = bu.filhos.find(ehIdentificacaoSecao) ?? procurar(bu.filhos, ehIdentificacaoSecao);
  if (!ident) throw new ErroArquivoBu('Identificação da seção não encontrada no arquivo.');
  const municipio = String(inteiro(ident.filhos[0].filhos[0]) ?? '');
  const zona = String(inteiro(ident.filhos[0].filhos[1]) ?? '');
  const local = String(inteiro(ident.filhos[1]) ?? '');
  const secao = String(inteiro(ident.filhos[2]) ?? '');

  // Datas (GeneralString "AAAAMMDDThhmmss"): abertura da urna = data da votação.
  const datas = todos(bu.filhos, (n) => ehUniv(n, GENERAL_STRING) && /^\d{8}T\d{6}$/.test(texto(n))).map(texto);
  const abertura = bu.filhos.find((f) => f.classe === 2 && f.filhos.length >= 2 && f.filhos.every((x) => /^\d{8}T\d{6}$/.test(texto(x))));
  const dataVotacao = dataIso((abertura ? texto(abertura.filhos[0]) : datas[datas.length - 1] ?? '').slice(0, 8));

  const codigoCarga = todos(bu.filhos, (n) => ehUniv(n, GENERAL_STRING) && /^\d{24}$/.test(texto(n))).map(texto)[0] ?? '';
  const versaoSoftware = todos(bu.filhos, (n) => ehUniv(n, GENERAL_STRING) && / - /.test(texto(n))).map(texto)[0] ?? '';
  // Número interno da urna: 1º inteiro da carga (SEQUENCE que contém o código da carga).
  const carga = procurar(bu.filhos, (n) => ehSeq(n) && n.filhos.some((f) => /^\d{24}$/.test(texto(f))) && ehUniv(n.filhos[0], INTEGER));
  const codigoUe = carga ? String(inteiro(carga.filhos[0]) ?? '') : '';

  // Resultados por eleição.
  const cargos: ResultadoCargo[] = [];
  let aptos: number | null = null;
  let comparecimento = 0;
  const eleicoes = todos(bu.filhos, (n) => ehSeq(n) && ehUniv(n.filhos[0], INTEGER) && n.filhos.some((f) => ehSeq(f) && f.filhos.length > 0 && f.filhos.every(ehResultadoVotacao)));
  if (!eleicoes.length) throw new ErroArquivoBu('O arquivo não contém resultados de votação.');
  for (const el of eleicoes) {
    const aptosEleicao = inteiro(el.filhos[1]);
    if (aptosEleicao !== null) aptos = Math.max(aptos ?? 0, aptosEleicao);
    const resultados = el.filhos.find((f) => ehSeq(f) && f.filhos.every(ehResultadoVotacao))!;
    for (const rv of resultados.filhos) {
      comparecimento = Math.max(comparecimento, inteiro(rv.filhos[1]) ?? 0);
      for (const tc of rv.filhos[2].filhos) {
        const codigoNo = tc.filhos[0];
        const codigoCargo = codigoNo && codigoNo.classe === 2 ? inteiro(codigoNo) : null;
        const votaveis = tc.filhos.find((f) => ehSeq(f));
        if (codigoCargo === null || !votaveis) continue;
        const cargo: ResultadoCargo = {
          cargo: cargoCanonico(String(codigoCargo)),
          candidatos: [],
          votosNominais: 0,
          votosLegenda: 0,
          brancos: 0,
          nulos: 0,
          totalApurado: 0,
        };
        for (const v of votaveis.filhos) {
          const tipo = inteiro(ctx(v, 1));
          const qtd = inteiro(ctx(v, 2)) ?? 0;
          const id = ctx(v, 3);
          const partido = id ? inteiro(id.filhos[0]) : null;
          const codigo = id ? inteiro(id.filhos[1]) : null;
          cargo.totalApurado! += qtd;
          if (tipo === 1 && codigo !== null) {
            cargo.candidatos.push({ numero: String(codigo), votos: qtd });
            cargo.votosNominais! += qtd;
          } else if (tipo === 4 && (partido ?? codigo) !== null) {
            const p = String(partido ?? codigo);
            cargo.candidatos.push({ numero: p, nome: `LEGENDA ${p}`, votos: qtd, legenda: true });
            cargo.votosLegenda! += qtd;
          } else if (tipo === 2) {
            cargo.brancos! += qtd;
          } else if (tipo === 3) {
            cargo.nulos! += qtd;
          }
        }
        cargos.push(cargo);
      }
    }
  }

  const oficial = municipioPorCodigoTse(municipio);
  const boletim: Boletim = {
    uf: oficial?.uf,
    municipio: nomeMunicipioTse(municipio),
    codigoMunicipio: municipio,
    zona,
    local,
    secao,
    codigoUe,
    codigoCarga,
    dataVotacao,
    eleitoresAptos: aptos,
    comparecimento,
    faltosos: aptos !== null ? aptos - comparecimento : null,
    cargos,
    versaoSoftware: versaoSoftware || undefined,
    fase,
  };
  return { boletim, codigoCarga, versaoSoftware };
}
