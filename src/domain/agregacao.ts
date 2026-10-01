import { compararCargos } from './cargos';
import { numeroCanonico } from './normalizar';
import type { CadastroCandidato, Leitura } from './types';

export interface LinhaResultado {
  numero: string;
  nome: string;
  votos: number;
  legenda?: boolean;
  /** Sem nome conhecido (QR Code traz só o número). */
  semNome?: boolean;
}

export interface ResultadoAgregadoCargo {
  cargo: string;
  candidatos: LinhaResultado[];
  nominais: number;
  legenda: number;
  brancos: number;
  nulos: number;
  totalApurado: number;
  /** Votos válidos = nominais + legenda. */
  validos: number;
  urnas: number;
}

export interface Totais {
  urnas: number;
  eleitoresAptos: number;
  comparecimento: number;
  faltosos: number;
  /** Comparecimento / aptos (0–1). */
  taxaComparecimento: number;
  taxaAbstencao: number;
  cargos: ResultadoAgregadoCargo[];
  porOrigem: Record<string, number>;
  /** Registros ativos com inconsistências estruturais. */
  comAlertas: Leitura[];
}

export interface FiltroLeituras {
  municipio?: string;
  zona?: string;
  local?: string;
  de?: string; // ISO datetime
  ate?: string;
}

export function aplicarFiltro(leituras: Leitura[], f: FiltroLeituras): Leitura[] {
  return leituras.filter((l) => {
    if (f.municipio && l.municipio !== f.municipio) return false;
    if (f.zona && numeroCanonico(l.zona_eleitoral) !== numeroCanonico(f.zona)) return false;
    if (f.local && numeroCanonico(l.local_votacao) !== numeroCanonico(f.local)) return false;
    if (f.de && l.timestamp_leitura < f.de) return false;
    if (f.ate && l.timestamp_leitura > f.ate) return false;
    return true;
  });
}

/**
 * Consolida os votos de todas as leituras ATIVAS. Leituras excluídas (soft
 * delete) ficam fora — é assim que a exclusão "subtrai" os votos do total.
 */
export function agregar(leituras: Leitura[], cadastro: CadastroCandidato[] = []): Totais {
  const ativas = leituras.filter((l) => l.status === 'ativo');
  const nomesCadastro = new Map(cadastro.map((c) => [`${c.cargo}|${numeroCanonico(c.numero)}`, c.nome]));
  // Nomes lidos de PDF/OCR (inclusive de registros excluídos) completam os do QR, que só traz números.
  const nomesLidos = new Map<string, string>();
  for (const l of leituras) {
    for (const c of l.boletim.cargos) {
      for (const k of c.candidatos) {
        if (k.nome && !k.legenda) nomesLidos.set(`${c.cargo}|${numeroCanonico(k.numero)}`, k.nome);
      }
    }
  }
  const porCargo = new Map<string, ResultadoAgregadoCargo & { mapa: Map<string, LinhaResultado> }>();
  const porOrigem: Record<string, number> = {};
  let aptos = 0;
  let comp = 0;
  let falt = 0;

  for (const l of ativas) {
    const b = l.boletim;
    aptos += b.eleitoresAptos ?? 0;
    comp += b.comparecimento ?? 0;
    falt += b.faltosos ?? Math.max(0, (b.eleitoresAptos ?? 0) - (b.comparecimento ?? 0));
    porOrigem[l.tipo_entrada] = (porOrigem[l.tipo_entrada] ?? 0) + 1;

    for (const c of b.cargos) {
      let agg = porCargo.get(c.cargo);
      if (!agg) {
        agg = { cargo: c.cargo, candidatos: [], nominais: 0, legenda: 0, brancos: 0, nulos: 0, totalApurado: 0, validos: 0, urnas: 0, mapa: new Map() };
        porCargo.set(c.cargo, agg);
      }
      agg.urnas++;
      let somaNom = 0;
      let somaLeg = 0;
      for (const cand of c.candidatos) {
        const num = numeroCanonico(cand.numero);
        const chave = `${cand.legenda ? 'L' : ''}${num}`;
        let linha = agg.mapa.get(chave);
        if (!linha) {
          linha = { numero: num, nome: '', votos: 0, legenda: cand.legenda };
          agg.mapa.set(chave, linha);
        }
        linha.votos += cand.votos;
        if (cand.nome && !linha.nome) linha.nome = cand.nome;
        if (cand.legenda) somaLeg += cand.votos;
        else somaNom += cand.votos;
      }
      agg.nominais += somaNom;
      agg.legenda += somaLeg;
      agg.brancos += c.brancos ?? 0;
      agg.nulos += c.nulos ?? 0;
      agg.totalApurado += c.totalApurado ?? somaNom + somaLeg + (c.brancos ?? 0) + (c.nulos ?? 0);
    }
  }

  const cargos = [...porCargo.values()]
    .map(({ mapa, ...resto }) => {
      const candidatos = [...mapa.values()]
        .map((x) => {
          const chave = `${resto.cargo}|${x.numero}`;
          const nome = x.legenda ? `LEGENDA ${x.numero}` : nomesCadastro.get(chave) ?? (x.nome || nomesLidos.get(chave) || '');
          return { ...x, nome: nome || `CANDIDATO ${x.numero}`, semNome: !nome };
        })
        .sort((a, b) => b.votos - a.votos || Number(a.numero) - Number(b.numero));
      return { ...resto, candidatos, validos: resto.nominais + resto.legenda };
    })
    .sort((a, b) => compararCargos(a.cargo, b.cargo));

  return {
    urnas: ativas.length,
    eleitoresAptos: aptos,
    comparecimento: comp,
    faltosos: falt,
    taxaComparecimento: aptos ? comp / aptos : 0,
    taxaAbstencao: aptos ? falt / aptos : 0,
    cargos,
    porOrigem,
    comAlertas: ativas.filter((l) => l.validacao.alertas.length > 0),
  };
}
