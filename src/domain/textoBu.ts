/**
 * Interpretação do texto de um Boletim de Urna impresso — extraído de PDF
 * (pdf.js) ou de foto (OCR). O resultado vem acompanhado da confiança de
 * cada campo, para destacar na tela de revisão o que precisa ser conferido.
 */
import { cargoDoTitulo } from './cargos';
import { codigoPorNomeUnico, municipioPorCodigoTse } from './municipios';
import {
  apenasDigitos,
  dataIso,
  numeroCanonico,
  sanitizarNumeroOcr,
  sanitizarTexto,
  semAcento,
} from './normalizar';
import type { Boletim, MapaConfianca, ResultadoCargo } from './types';

export interface LinhaTexto {
  texto: string;
  /** Confiança 0–100 (100 para texto nativo de PDF). */
  confianca: number;
}

export interface ResultadoTexto {
  boletim: Boletim;
  confianca: MapaConfianca;
  avisos: string[];
  /** Confiança média dos campos extraídos (0–100). */
  qualidadeGeral: number;
  /** Quantos campos essenciais foram encontrados. */
  camposEncontrados: number;
}

const PARTIDOS = new Set([
  'PT', 'PL', 'MDB', 'PSDB', 'PSD', 'PP', 'UNIAO', 'PDT', 'PSB', 'REPUBLICANOS', 'NOVO', 'PSOL',
  'PCDOB', 'PC', 'DO', 'B', 'PV', 'REDE', 'PODE', 'PODEMOS', 'AVANTE', 'SOLIDARIEDADE', 'PSC', 'PTB',
  'PROS', 'PATRIOTA', 'PCO', 'PSTU', 'UP', 'PMB', 'DC', 'AGIR', 'PMN', 'PRTB', 'CIDADANIA',
  'MOBILIZA', 'PRD', 'PCB', 'DEM', 'PTC', 'PPL', 'PHS', 'PRP', 'PEN',
]);

/** Converte um token em número, tolerando confusões de OCR quando `ocr` = true. */
function tokenNumerico(tok: string, ocr: boolean): string | null {
  const t = tok.replace(/[.,]/g, '');
  if (/^\d+$/.test(t)) return t;
  if (!ocr || t.length === 0) return null;
  const parecidos = t.replace(/[^0-9OoQlI|!SsBZzG]/g, '');
  const digitos = t.replace(/\D/g, '');
  // Exige que o token seja majoritariamente "numérico" e tenha ao menos um dígito real.
  if (digitos.length >= 1 && parecidos.length === t.length && digitos.length / t.length >= 0.5) {
    return sanitizarNumeroOcr(t);
  }
  return null;
}

function numerosDaLinha(texto: string, ocr: boolean): string[] {
  return texto
    .split(/[\s:]+/)
    .map((t) => tokenNumerico(t, ocr))
    .filter((x): x is string => x !== null && x.length > 0);
}

interface Captado {
  valor: string;
  confianca: number;
}

export function interpretarTextoBu(linhas: LinhaTexto[], opcoes: { ocr: boolean }): ResultadoTexto {
  const { ocr } = opcoes;
  const confianca: MapaConfianca = {};
  const avisos: string[] = [];
  const norm = linhas.map((l) => ({ ...l, n: semAcento(l.texto).replace(/\s+/g, ' ').trim() }));

  /**
   * Procura um rótulo e devolve o número que o segue (na mesma linha ou na
   * linha seguinte, quando o PDF separa rótulo e valor em colunas).
   */
  function campoNumerico(rotulo: RegExp, desde = 0, ate = norm.length): Captado | null {
    for (let i = desde; i < ate; i++) {
      const l = norm[i];
      const m = l.n.match(rotulo);
      if (!m || m.index === undefined) continue;
      const resto = l.n.slice(m.index + m[0].length);
      const nums = numerosDaLinha(resto.split(/[A-Z]{4,}/)[0] ?? '', ocr);
      if (nums.length) return { valor: nums[0], confianca: l.confianca };
      const prox = norm[i + 1];
      if (prox) {
        const n2 = numerosDaLinha(prox.n, ocr);
        if (n2.length && /^[\d\sOolISBZG.,:]+$/.test(prox.n)) return { valor: n2[0], confianca: prox.confianca };
      }
    }
    return null;
  }

  const set = (campo: string, c: Captado | null) => {
    if (c) confianca[campo] = Math.round(c.confianca);
    return c?.valor ?? '';
  };

  // Município: "Município 63452 - CONCHAL" ou "Município: CONCHAL"
  let municipio = '';
  let codigoMunicipio: string | undefined;
  for (const l of norm) {
    const m = l.n.match(/MUNICIPIO\s*:?\s*(\d{3,5})?\s*-?\s*([A-Z][A-Z' -]{1,60})/);
    if (m) {
      municipio = sanitizarTexto(m[2].replace(/\s+(ZONA|LOCAL|SECAO).*$/, ''));
      codigoMunicipio = m[1] ? numeroCanonico(m[1]) : undefined;
      confianca.municipio = Math.round(l.confianca);
      break;
    }
  }

  // Com o código TSE do município, o nome vem da tabela oficial (mais confiável que o texto lido).
  if (!codigoMunicipio && municipio) codigoMunicipio = codigoPorNomeUnico(municipio) ?? undefined;
  const oficial = municipioPorCodigoTse(codigoMunicipio);
  if (oficial) {
    municipio = oficial.nome;
    confianca.municipio = Math.max(confianca.municipio ?? 0, 99);
  }

  const zona = set('zona', campoNumerico(/ZONA(\s+ELEITORAL)?\s*:?/));
  const local = set('local', campoNumerico(/LOCAL(\s+DE\s+VOTACAO)?\s*:?/));
  const secao = set('secao', campoNumerico(/SECAO(\s+ELEITORAL)?\s*:?/));

  // Início da primeira seção de cargo — limita a busca dos campos de cabeçalho.
  const inicioCargos = norm.findIndex((l) => cargoDoTitulo(l.n) !== null);
  const fimCabecalho = inicioCargos < 0 ? norm.length : inicioCargos;

  const aptos = set('eleitoresAptos', campoNumerico(/ELEITORES\s+APTOS\s*:?/, 0, fimCabecalho) ?? campoNumerico(/ELEITORES\s+APTOS\s*:?/));
  const comparecimento = set('comparecimento', campoNumerico(/COMPARECIMENTO\s*:?/));
  const faltosos = set('faltosos', campoNumerico(/(ELEITORES\s+)?FALTOSOS\s*:?/));

  // Código da UE (8 dígitos)
  let codigoUe = '';
  for (const l of norm) {
    const m = l.n.match(/(IDENTIFICACAO|IDENT\.?)\s*(DA\s+)?U\.?E\.?\s*:?\s*([\dOolISBZG]{6,10})/) ?? l.n.match(/CODIGO\s+(DE\s+)?(IDENTIFICACAO\s+)?(DA\s+)?UE\s*:?\s*([\dOolISBZG]{6,10})/);
    if (m) {
      codigoUe = ocr ? sanitizarNumeroOcr(m[m.length - 1]) : apenasDigitos(m[m.length - 1]);
      confianca.codigoUe = Math.round(l.confianca);
      break;
    }
  }

  // Código de identificação da carga: "666.070.534.576.779.579.335.458"
  let codigoCarga = '';
  for (let i = 0; i < norm.length; i++) {
    if (!/CARGA/.test(norm[i].n)) continue;
    const alvo = `${norm[i].n} ${norm[i + 1]?.n ?? ''}`;
    const m = alvo.match(/(\d{3}[.\s]?){6,}\d{1,3}/);
    if (m) {
      codigoCarga = apenasDigitos(m[0]);
      confianca.codigoCarga = Math.round(norm[i].confianca);
      break;
    }
  }

  // Data: prioriza "abertura", depois qualquer data no cabeçalho.
  let data = '';
  for (const l of norm) {
    if (/ABERTURA/.test(l.n)) {
      const m = l.n.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
      if (m) {
        data = dataIso(m[0]);
        confianca.dataVotacao = Math.round(l.confianca);
        break;
      }
    }
  }
  if (!data) {
    for (const l of norm) {
      const m = l.n.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
      if (m) {
        data = dataIso(m[0]);
        confianca.dataVotacao = Math.round(l.confianca);
        break;
      }
    }
  }

  let turno: string | undefined;
  for (const l of norm) {
    const m = l.n.match(/([12])\s*[O°ºª]?\s*TURNO/);
    if (m) {
      turno = m[1];
      break;
    }
  }

  // Assinatura/hash impresso (sequência hexadecimal longa após "ASSINATURA" ou "HASH")
  let assinatura = '';
  for (let i = 0; i < norm.length; i++) {
    if (!/ASSINATURA|HASH|RESUMO/.test(norm[i].n)) continue;
    const bloco = [norm[i], norm[i + 1], norm[i + 2], norm[i + 3]]
      .filter(Boolean)
      .map((l) => l!.texto)
      .join(' ');
    const hexes = bloco.match(/[0-9A-Fa-f]{16,}/g);
    if (hexes) {
      assinatura = hexes.join('').toUpperCase().slice(0, 128);
      break;
    }
  }

  // ---------- Seções de cargo ----------
  const cargos: ResultadoCargo[] = [];
  let atual: ResultadoCargo | null = null;
  let idxCargo = -1;
  const caminho = (sufixo: string) => `cargos.${idxCargo}.${sufixo}`;

  for (const l of norm) {
    const titulo = cargoDoTitulo(l.n);
    if (titulo) {
      if (cargos.some((c) => c.cargo === titulo)) {
        // Repetição do título (quebra de página): continua no mesmo cargo.
        idxCargo = cargos.findIndex((c) => c.cargo === titulo);
        atual = cargos[idxCargo];
      } else {
        atual = { cargo: titulo, candidatos: [], votosNominais: null, votosLegenda: null, brancos: null, nulos: null, totalApurado: null };
        cargos.push(atual);
        idxCargo = cargos.length - 1;
        confianca[caminho('cargo')] = Math.round(l.confianca);
      }
      continue;
    }
    if (!atual) continue;
    const c: ResultadoCargo = atual;
    const nums = numerosDaLinha(l.n, ocr);
    const ultimo = nums.length ? Number(nums[nums.length - 1]) : null;
    const conf = Math.round(l.confianca);

    if (/TOTAL\s+APURADO/.test(l.n)) {
      if (ultimo !== null) { c.totalApurado = ultimo; confianca[caminho('totalApurado')] = conf; }
      continue;
    }
    if (/NOMINAIS/.test(l.n)) {
      if (ultimo !== null) { c.votosNominais = ultimo; confianca[caminho('votosNominais')] = conf; }
      continue;
    }
    if (/BRANCOS?\b/.test(l.n)) {
      if (ultimo !== null) { c.brancos = ultimo; confianca[caminho('brancos')] = conf; }
      continue;
    }
    if (/NULOS?\b/.test(l.n)) {
      if (ultimo !== null) { c.nulos = ultimo; confianca[caminho('nulos')] = conf; }
      continue;
    }
    if (/(TOTAL|VOTOS)\s+(DE\s+)?LEGENDA/.test(l.n)) {
      if (ultimo !== null) { c.votosLegenda = ultimo; confianca[caminho('votosLegenda')] = conf; }
      continue;
    }
    if (/APTOS|COMPARECIMENTO|FALTOSOS|NOME DO CANDIDATO|PARTIDO\s+VOTOS|CODIGO|ASSINATURA|PAGINA|^VOTOS$/.test(l.n)) continue;

    if (/LEGENDA/.test(l.n) && nums.length >= 2) {
      const numero = numeroCanonico(nums[0]);
      const j = c.candidatos.length;
      c.candidatos.push({ numero, nome: `LEGENDA ${numero}`, votos: Number(nums[nums.length - 1]), legenda: true });
      confianca[caminho(`candidatos.${j}.numero`)] = conf;
      confianca[caminho(`candidatos.${j}.votos`)] = conf;
      continue;
    }

    // Linha de candidato: precisa de número (2–5 dígitos) e votos.
    if (nums.length >= 2) {
      const candidatoNum = nums.slice(0, -1).find((n) => n.replace(/^0+/, '').length >= 2 && n.replace(/^0+/, '').length <= 5);
      if (!candidatoNum) continue;
      const nome = sanitizarTexto(
        l.texto
          .split(/\s+/)
          .filter((t) => /[A-Za-zÀ-ÿ]{2,}/.test(t) && tokenNumerico(t, ocr) === null)
          .filter((t) => !PARTIDOS.has(semAcento(t).replace(/[^A-Z]/g, '')))
          .join(' '),
      ).toUpperCase();
      const j = c.candidatos.length;
      c.candidatos.push({ numero: numeroCanonico(candidatoNum), nome: nome || undefined, votos: Number(nums[nums.length - 1]) });
      confianca[caminho(`candidatos.${j}.numero`)] = conf;
      confianca[caminho(`candidatos.${j}.votos`)] = conf;
      if (nome) confianca[caminho(`candidatos.${j}.nome`)] = conf;
    }
  }

  // Remove cargos sem nenhum dado (títulos soltos no texto).
  const cargosValidos = cargos.filter((c) => c.candidatos.length || c.totalApurado !== null || c.votosNominais !== null);
  if (cargosValidos.length !== cargos.length) {
    // Reindexa a confiança dos cargos mantidos.
    const mapa = new Map(cargos.map((c, i) => [i, cargosValidos.indexOf(c)]));
    for (const k of Object.keys(confianca)) {
      const m = k.match(/^cargos\.(\d+)\.(.*)$/);
      if (!m) continue;
      const novo = mapa.get(Number(m[1]));
      const v = confianca[k];
      delete confianca[k];
      if (novo !== undefined && novo >= 0) confianca[`cargos.${novo}.${m[2]}`] = v;
    }
  }

  const boletim: Boletim = {
    municipio,
    codigoMunicipio,
    zona: numeroCanonico(zona),
    local: numeroCanonico(local),
    secao: numeroCanonico(secao),
    codigoUe,
    codigoCarga,
    dataVotacao: data,
    turno,
    eleitoresAptos: aptos ? Number(aptos) : null,
    comparecimento: comparecimento ? Number(comparecimento) : null,
    faltosos: faltosos ? Number(faltosos) : null,
    cargos: cargosValidos,
    assinaturaQr: assinatura || undefined,
  };

  if (boletim.faltosos === null && boletim.eleitoresAptos !== null && boletim.comparecimento !== null) {
    boletim.faltosos = boletim.eleitoresAptos - boletim.comparecimento;
  }

  const essenciais = [boletim.zona, boletim.secao, boletim.local, boletim.eleitoresAptos, boletim.comparecimento];
  const camposEncontrados = essenciais.filter((x) => x !== null && x !== '').length + (cargosValidos.length ? 1 : 0);
  if (!boletim.zona || !boletim.secao) avisos.push('Não foi possível identificar zona e/ou seção — preencha manualmente.');
  if (!cargosValidos.length) avisos.push('Nenhuma seção de cargo (ex.: PRESIDENTE, GOVERNADOR) foi reconhecida.');

  const valores = Object.values(confianca);
  const qualidadeGeral = valores.length ? Math.round(valores.reduce((a, b) => a + b, 0) / valores.length) : 0;

  return { boletim, confianca, avisos, qualidadeGeral, camposEncontrados };
}
