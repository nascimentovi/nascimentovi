import { db } from '../db/database';
import { agregar } from '../domain/agregacao';
import { comZeros } from '../domain/normalizar';
import { ROTULO_ENTRADA } from '../domain/types';

function baixar(nome: string, conteudo: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const csv = (linhas: (string | number | null | undefined)[][]) =>
  '﻿' + linhas.map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');

const carimbo = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

/** Resultados consolidados por cargo/candidato (CSV compatível com Excel pt-BR). */
export async function exportarResultadosCsv() {
  const tot = agregar(await db.leituras.toArray(), await db.candidatos.toArray());
  const linhas: (string | number)[][] = [['Cargo', 'Número', 'Candidato', 'Votos']];
  for (const c of tot.cargos) {
    for (const x of c.candidatos) linhas.push([c.cargo, x.numero, x.nome, x.votos]);
    linhas.push([c.cargo, '', 'BRANCOS', c.brancos], [c.cargo, '', 'NULOS', c.nulos], [c.cargo, '', 'TOTAL APURADO', c.totalApurado]);
  }
  linhas.push([], ['Urnas', tot.urnas], ['Eleitores aptos', tot.eleitoresAptos], ['Comparecimento', tot.comparecimento], ['Faltosos', tot.faltosos]);
  baixar(`resultados-${carimbo()}.csv`, csv(linhas), 'text/csv;charset=utf-8');
}

/** Uma linha por leitura (ativa ou excluída), para conferência. */
export async function exportarLeiturasCsv() {
  const ls = await db.leituras.orderBy('timestamp_leitura').toArray();
  const linhas: (string | number | null)[][] = [
    ['ID', 'Status', 'Lido em', 'Origem', 'Município', 'Zona', 'Local', 'Seção', 'Código UE', 'Aptos', 'Comparecimento', 'Faltosos', 'Hash conferido', 'Alertas', 'Excluído em', 'Motivo exclusão', 'Fingerprint'],
  ];
  for (const l of ls) {
    linhas.push([
      l.id, l.status, l.timestamp_leitura, ROTULO_ENTRADA[l.tipo_entrada], l.municipio, comZeros(l.zona_eleitoral), comZeros(l.local_votacao), comZeros(l.secao), l.codigo_ue,
      l.boletim.eleitoresAptos, l.boletim.comparecimento, l.boletim.faltosos,
      l.validacao.checksum_valido === null ? '' : l.validacao.checksum_valido ? 'sim' : 'não',
      l.validacao.alertas.join(' | '), l.excluido_em ?? '', l.motivo_exclusao ?? '', l.fingerprint,
    ]);
  }
  baixar(`leituras-${carimbo()}.csv`, csv(linhas), 'text/csv;charset=utf-8');
}

/** Cópia de segurança completa do banco local (JSON). */
export async function exportarBackupJson() {
  const dados = {
    versao: 1,
    gerado_em: new Date().toISOString(),
    leituras: await db.leituras.toArray(),
    historico_exclusoes: await db.historico_exclusoes.toArray(),
    descartes: await db.descartes.toArray(),
    candidatos: await db.candidatos.toArray(),
    config: await db.config.toArray(),
  };
  baixar(`backup-apuracao-${carimbo()}.json`, JSON.stringify(dados, null, 2), 'application/json');
}
