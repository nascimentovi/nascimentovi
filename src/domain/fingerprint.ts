import { compararCargos } from './cargos';
import { sha256Hex } from './hash';
import { numeroCanonico } from './normalizar';
import type { Boletim } from './types';

/**
 * Representação canônica dos votos: cargos em ordem fixa, candidatos por
 * número. Garante que QR, PDF e OCR do mesmo boletim gerem o mesmo texto.
 */
export function votosCanonicos(b: Boletim): string {
  return [...b.cargos]
    .sort((x, y) => compararCargos(x.cargo, y.cargo))
    .map((c) => {
      const cands = [...c.candidatos]
        .filter((x) => x.votos > 0)
        .sort((x, y) => Number(!!x.legenda) - Number(!!y.legenda) || Number(x.numero) - Number(y.numero))
        .map((x) => `${x.legenda ? 'L' : ''}${numeroCanonico(x.numero)}=${x.votos}`)
        .join(',');
      return `${c.cargo}[${cands};B=${c.brancos ?? 0};N=${c.nulos ?? 0}]`;
    })
    .join('');
}

/**
 * Chave que identifica unicamente a urna em uma votação (zona + seção + data).
 * Usada para detectar o mesmo boletim lido por formas diferentes, mesmo que
 * algum campo tenha sido lido com divergência.
 */
export function chaveUrna(b: Boletim): string {
  return `${numeroCanonico(b.zona)}|${numeroCanonico(b.secao)}|${b.dataVotacao}`;
}

/**
 * Fingerprint SHA-256 do boletim. Usa apenas campos presentes em todas as
 * formas de captura (QR, PDF, OCR, manual), para que o mesmo boletim gere o
 * mesmo hash independentemente da origem:
 * zona | local | seção | data | eleitores aptos | votos por cargo.
 * Código de carga e código da UE são conferidos à parte quando disponíveis.
 */
export async function gerarFingerprint(b: Boletim): Promise<string> {
  const componentes = [
    numeroCanonico(b.zona),
    numeroCanonico(b.local),
    numeroCanonico(b.secao),
    b.dataVotacao,
    String(b.eleitoresAptos ?? ''),
    votosCanonicos(b),
  ];
  return sha256Hex(componentes.join('|'));
}
