import { identificarLocal } from './locais';
import type { Boletim, ValidacoesEstruturais } from './types';

export interface ResultadoValidacao {
  /** Problemas que impedem a contabilização. */
  erros: string[];
  /** Inconsistências que não bloqueiam, mas são destacadas no dashboard. */
  alertas: string[];
  estruturais: ValidacoesEstruturais;
}

const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function validarBoletim(b: Boletim): ResultadoValidacao {
  const erros: string[] = [];
  const alertas: string[] = [];

  if (!b.zona) erros.push('Zona eleitoral não informada.');
  if (!b.secao) erros.push('Seção eleitoral não informada.');
  if (!b.dataVotacao) erros.push('Data da votação não informada.');
  if (!b.cargos.length) erros.push('Nenhum cargo com votos informado.');
  if (b.eleitoresAptos === null) erros.push('Eleitores aptos não informado.');
  if (b.comparecimento === null) erros.push('Comparecimento não informado.');

  const camposOk = erros.length === 0;

  const info = identificarLocal(b.codigoMunicipio, b.local, b.secao);
  if (info && !info.secaoConfere) {
    alertas.push(`Seção ${b.secao} não consta da relação de seções do local ${info.local} (${info.escola}).`);
  }

  let comparecimentoOk = true;
  if (b.eleitoresAptos !== null && b.comparecimento !== null) {
    if (b.comparecimento > b.eleitoresAptos) {
      comparecimentoOk = false;
      erros.push(`Comparecimento (${b.comparecimento}) maior que eleitores aptos (${b.eleitoresAptos}).`);
    }
    if (b.faltosos !== null && b.comparecimento + b.faltosos !== b.eleitoresAptos) {
      comparecimentoOk = false;
      alertas.push(
        `Comparecimento (${b.comparecimento}) + faltosos (${b.faltosos}) ≠ eleitores aptos (${b.eleitoresAptos}).`,
      );
    }
  }

  let votosOk = true;
  const vistos = new Set<string>();
  for (const c of b.cargos) {
    if (vistos.has(c.cargo)) erros.push(`Cargo ${c.cargo} informado mais de uma vez.`);
    vistos.add(c.cargo);
    const numeros = new Set<string>();
    for (const cand of c.candidatos) {
      const chave = `${cand.legenda ? 'L' : 'C'}${cand.numero}`;
      if (!cand.numero) erros.push(`${c.cargo}: candidato sem número.`);
      if (numeros.has(chave)) erros.push(`${c.cargo}: número ${cand.numero} repetido.`);
      numeros.add(chave);
      if (!Number.isInteger(cand.votos) || cand.votos < 0) erros.push(`${c.cargo}: votos inválidos para ${cand.numero}.`);
    }
    const somaNominais = soma(c.candidatos.filter((x) => !x.legenda).map((x) => x.votos));
    const somaLegenda = soma(c.candidatos.filter((x) => x.legenda).map((x) => x.votos));
    if (c.votosNominais !== null && somaNominais !== c.votosNominais) {
      votosOk = false;
      alertas.push(`${c.cargo}: soma dos candidatos (${somaNominais}) ≠ votos nominais (${c.votosNominais}).`);
    }
    if (c.totalApurado !== null) {
      const nominais = c.votosNominais ?? somaNominais;
      const legenda = c.votosLegenda ?? somaLegenda;
      const calc = nominais + legenda + (c.brancos ?? 0) + (c.nulos ?? 0);
      if (calc !== c.totalApurado) {
        votosOk = false;
        alertas.push(`${c.cargo}: nominais + legenda + brancos + nulos (${calc}) ≠ total apurado (${c.totalApurado}).`);
      }
      if (b.comparecimento !== null && c.totalApurado > b.comparecimento * 2) {
        votosOk = false;
        erros.push(`${c.cargo}: total apurado (${c.totalApurado}) incompatível com o comparecimento (${b.comparecimento}).`);
      } else if (b.comparecimento !== null && c.cargo !== 'SENADOR' && c.totalApurado !== b.comparecimento) {
        votosOk = false;
        alertas.push(`${c.cargo}: total apurado (${c.totalApurado}) ≠ comparecimento (${b.comparecimento}).`);
      }
    }
  }

  return {
    erros,
    alertas,
    estruturais: {
      total_votos_consistente: votosOk,
      comparecimento_consistente: comparecimentoOk,
      campos_obrigatorios_completos: camposOk,
    },
  };
}
