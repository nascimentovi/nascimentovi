import { compararCargos } from './cargos';
import { dataBr, numeroCanonico } from './normalizar';
import type { Boletim } from './types';

export interface DiferencaCampo {
  campo: string;
  anterior: string;
  atual: string;
  /** true quando os valores divergem (e ambos estão presentes). */
  diverge: boolean;
}

const txt = (v: unknown) => (v === null || v === undefined || v === '' ? '' : String(v));

/** Compara dois boletins campo a campo (valores ausentes não contam como divergência). */
export function compararBoletins(a: Boletim, b: Boletim): DiferencaCampo[] {
  const linhas: DiferencaCampo[] = [];
  const add = (campo: string, x: unknown, y: unknown, norm: (s: string) => string = (s) => s) => {
    const ax = txt(x);
    const by = txt(y);
    linhas.push({ campo, anterior: ax || '—', atual: by || '—', diverge: !!ax && !!by && norm(ax) !== norm(by) });
  };
  add('Zona', a.zona, b.zona, numeroCanonico);
  add('Local', a.local, b.local, numeroCanonico);
  add('Seção', a.secao, b.secao, numeroCanonico);
  add('Data', a.dataVotacao && dataBr(a.dataVotacao), b.dataVotacao && dataBr(b.dataVotacao));
  add('Código UE', a.codigoUe, b.codigoUe, numeroCanonico);
  add('Código da carga', a.codigoCarga, b.codigoCarga, numeroCanonico);
  add('Eleitores aptos', a.eleitoresAptos, b.eleitoresAptos);
  add('Comparecimento', a.comparecimento, b.comparecimento);
  add('Faltosos', a.faltosos, b.faltosos);

  const cargos = new Set([...a.cargos.map((c) => c.cargo), ...b.cargos.map((c) => c.cargo)]);
  for (const cargo of [...cargos].sort(compararCargos)) {
    const ca = a.cargos.find((c) => c.cargo === cargo);
    const cb = b.cargos.find((c) => c.cargo === cargo);
    const chaves = new Set<string>();
    const mapa = (c?: typeof ca) =>
      new Map((c?.candidatos ?? []).map((x) => {
        const k = `${x.legenda ? 'L' : ''}${numeroCanonico(x.numero)}`;
        chaves.add(k);
        return [k, x] as const;
      }));
    const ma = mapa(ca);
    const mb = mapa(cb);
    for (const k of [...chaves].sort()) {
      const xa = ma.get(k);
      const xb = mb.get(k);
      const nome = xa?.nome || xb?.nome;
      const rotulo = `${cargo} · ${k.startsWith('L') ? `legenda ${k.slice(1)}` : `nº ${k}`}${nome && !k.startsWith('L') ? ` (${nome})` : ''}`;
      // Candidato ausente de um lado com 0 votos não é divergência real.
      const va = xa?.votos ?? (ca ? 0 : undefined);
      const vb = xb?.votos ?? (cb ? 0 : undefined);
      add(rotulo, va, vb);
    }
    add(`${cargo} · brancos`, ca?.brancos, cb?.brancos);
    add(`${cargo} · nulos`, ca?.nulos, cb?.nulos);
    add(`${cargo} · total apurado`, ca?.totalApurado, cb?.totalApurado);
  }
  return linhas;
}
