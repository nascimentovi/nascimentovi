import { type BancoApuracao, db as dbPadrao } from '../db/database';
import { compararBoletins, type DiferencaCampo } from '../domain/comparacao';
import { chaveUrna, gerarFingerprint } from '../domain/fingerprint';
import { apenasDigitos, comZeros, dataBr, numeroCanonico } from '../domain/normalizar';
import { ROTULO_ENTRADA, type Captura, type EventoLeitura, type Leitura } from '../domain/types';
import { validarBoletim, type ResultadoValidacao } from '../domain/validacao';

export type MotivoDuplicata = 'fingerprint' | 'codigo_carga' | 'mesma_urna';

export interface Duplicata {
  registro: Leitura;
  motivo: MotivoDuplicata;
  diferencas: DiferencaCampo[];
  /** Há divergência em algum campo presente nos dois registros (possível alteração). */
  divergente: boolean;
}

export interface Preparo {
  fingerprint: string;
  chaveUrna: string;
  validacao: ResultadoValidacao;
  duplicata: Duplicata | null;
}

export class ErroRegistro extends Error {}

const agora = () => new Date().toISOString();

function novoId(): string {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function descreverUrna(l: Pick<Leitura, 'zona_eleitoral' | 'local_votacao' | 'secao'>): string {
  return `Zona ${comZeros(l.zona_eleitoral)} | Local ${comZeros(l.local_votacao)} | Seção ${comZeros(l.secao)}`;
}

/** Procura, entre os registros ATIVOS, um boletim equivalente ao capturado. */
export async function buscarDuplicata(captura: Captura, fingerprint: string, db: BancoApuracao = dbPadrao): Promise<Duplicata | null> {
  const b = captura.boletim;
  const ativos = (l: Leitura) => l.status === 'ativo';
  const montar = (registro: Leitura, motivo: MotivoDuplicata): Duplicata => {
    const diferencas = compararBoletins(registro.boletim, b);
    return { registro, motivo, diferencas, divergente: diferencas.some((d) => d.diverge) };
  };

  // 1) Mesmo fingerprint — mesmo boletim, mesmo conteúdo (de qualquer origem).
  const porFp = (await db.leituras.where('fingerprint').equals(fingerprint).toArray()).find(ativos);
  if (porFp) return montar(porFp, 'fingerprint');

  // 2) Mesmo código de identificação da carga (quando disponível).
  const carga = apenasDigitos(b.codigoCarga);
  if (carga) {
    const porCarga = (await db.leituras.where('codigo_carga').equals(carga).toArray()).find(ativos);
    if (porCarga) return montar(porCarga, 'codigo_carga');
  }

  // 3) Mesma urna (zona + seção, mesma data) com conteúdo diferente: possível alteração.
  const mesmaSecao = await db.leituras
    .where('[zona_eleitoral+secao]')
    .equals([numeroCanonico(b.zona), numeroCanonico(b.secao)])
    .toArray();
  const porUrna = mesmaSecao.find(
    (l) => ativos(l) && (!l.boletim.dataVotacao || !b.dataVotacao || l.boletim.dataVotacao === b.dataVotacao),
  );
  if (porUrna) return montar(porUrna, 'mesma_urna');
  return null;
}

/** Valida e verifica duplicidade, sem gravar nada. */
export async function prepararCaptura(captura: Captura, db: BancoApuracao = dbPadrao): Promise<Preparo> {
  const fingerprint = await gerarFingerprint(captura.boletim);
  const validacao = validarBoletim(captura.boletim);
  const duplicata = await buscarDuplicata(captura, fingerprint, db);
  return { fingerprint, chaveUrna: chaveUrna(captura.boletim), validacao, duplicata };
}

function montarLeitura(captura: Captura, preparo: Preparo): Leitura {
  const b = captura.boletim;
  const ts = agora();
  return {
    id: novoId(),
    fingerprint: preparo.fingerprint,
    chaveUrna: preparo.chaveUrna,
    timestamp_leitura: ts,
    status: 'ativo',
    tipo_entrada: captura.tipo,
    fonte_dados: captura.arquivoOriginal ?? null,
    municipio: b.municipio,
    zona_eleitoral: numeroCanonico(b.zona),
    local_votacao: numeroCanonico(b.local),
    secao: numeroCanonico(b.secao),
    codigo_ue: apenasDigitos(b.codigoUe),
    codigo_carga: apenasDigitos(b.codigoCarga),
    boletim: b,
    origem: {
      tipo: captura.tipo,
      qualidade_ocr: captura.qualidadeGeral ?? null,
      arquivo_original: captura.arquivoOriginal ?? null,
      correcoes_manuais: false,
    },
    validacao: {
      checksum_valido: captura.checksumValido ?? null,
      assinatura_qr: b.assinaturaQr ?? null,
      codigo_carga: apenasDigitos(b.codigoCarga),
      validacoes_estruturais: preparo.validacao.estruturais,
      alertas: [...preparo.validacao.alertas, ...(captura.avisos ?? [])],
    },
    confianca: captura.confianca,
    dados_brutos: captura.conteudoBruto ?? null,
    historico_leituras: [{ timestamp: ts, tipo: captura.tipo, status: 'aceito' }],
  };
}

export interface OpcoesSalvar {
  /** Exclui (soft delete) o registro anterior e contabiliza a nova leitura no lugar. */
  substituirId?: string;
  correcoesManuais?: boolean;
}

/**
 * Grava a leitura e a contabiliza. A verificação de duplicidade é repetida
 * dentro da transação para impedir dupla contagem mesmo com cliques repetidos.
 */
export async function salvarCaptura(
  captura: Captura,
  preparo: Preparo,
  opcoes: OpcoesSalvar = {},
  db: BancoApuracao = dbPadrao,
): Promise<Leitura> {
  if (preparo.validacao.erros.length) throw new ErroRegistro(preparo.validacao.erros.join(' '));
  const leitura = montarLeitura(captura, preparo);
  leitura.origem.correcoes_manuais = !!(opcoes.correcoesManuais || captura.correcoesManuais);

  await db.transaction('rw', db.leituras, db.historico_exclusoes, async () => {
    const dup = await buscarDuplicata(captura, preparo.fingerprint, db);
    if (dup && dup.registro.id !== opcoes.substituirId) {
      throw new ErroRegistro(
        `Este boletim já foi processado via ${ROTULO_ENTRADA[dup.registro.tipo_entrada]} em ${new Date(dup.registro.timestamp_leitura).toLocaleString('pt-BR')}.`,
      );
    }
    if (opcoes.substituirId) {
      await excluirNaTransacao(db, opcoes.substituirId, `Substituído por nova leitura via ${ROTULO_ENTRADA[captura.tipo]} (${leitura.id})`, 'substituido');
      leitura.historico_leituras.unshift({
        timestamp: leitura.timestamp_leitura,
        tipo: captura.tipo,
        status: 'substituido',
        detalhe: `Substitui o registro ${opcoes.substituirId}`,
      });
    }
    await db.leituras.add(leitura);
  });
  return leitura;
}

/** Registra uma tentativa descartada (ex.: duplicata) no histórico e na auditoria. */
export async function registrarDescarte(
  captura: Captura,
  preparo: Preparo | null,
  motivo: string,
  db: BancoApuracao = dbPadrao,
): Promise<void> {
  const b = captura.boletim;
  await db.transaction('rw', db.leituras, db.descartes, async () => {
    const relacionada = preparo?.duplicata?.registro.id ?? null;
    if (relacionada) {
      const reg = await db.leituras.get(relacionada);
      if (reg) {
        const ev: EventoLeitura = { timestamp: agora(), tipo: captura.tipo, status: 'rejeitado_duplicata', detalhe: motivo };
        await db.leituras.update(relacionada, { historico_leituras: [...reg.historico_leituras, ev] });
      }
    }
    await db.descartes.add({
      timestamp: agora(),
      tipo_entrada: captura.tipo,
      motivo,
      fingerprint: preparo?.fingerprint ?? null,
      leitura_relacionada: relacionada,
      resumo: `Zona ${comZeros(b.zona)} | Seção ${comZeros(b.secao)}${b.dataVotacao ? ` | ${dataBr(b.dataVotacao)}` : ''}`,
    });
  });
}

async function excluirNaTransacao(db: BancoApuracao, id: string, motivo: string, status: EventoLeitura['status']): Promise<Leitura> {
  const reg = await db.leituras.get(id);
  if (!reg) throw new ErroRegistro('Registro não encontrado.');
  if (reg.status === 'deletado') throw new ErroRegistro('Registro já está excluído.');
  const ts = agora();
  await db.historico_exclusoes.add({
    leitura_id: id,
    timestamp_exclusao: ts,
    fingerprint_excluido: reg.fingerprint,
    motivo,
    dados_antes_exclusao: JSON.stringify(reg),
  });
  const atualizado: Partial<Leitura> = {
    status: 'deletado',
    excluido_em: ts,
    motivo_exclusao: motivo,
    historico_leituras: [...reg.historico_leituras, { timestamp: ts, tipo: reg.tipo_entrada, status, detalhe: motivo }],
  };
  await db.leituras.update(id, atualizado);
  return { ...reg, ...atualizado } as Leitura;
}

/**
 * Exclusão manual (soft delete): o registro permanece no banco marcado como
 * "deletado", deixa de ser somado no dashboard e a operação vai para o log.
 */
export async function excluirLeitura(id: string, motivo = 'Exclusão manual do usuário', db: BancoApuracao = dbPadrao): Promise<Leitura> {
  return db.transaction('rw', db.leituras, db.historico_exclusoes, () => excluirNaTransacao(db, id, motivo || 'Exclusão manual do usuário', 'excluido'));
}
