/**
 * Tabela oficial de municípios por código TSE (5.570 municípios), embutida
 * no app para funcionar offline. O QR Code do BU traz apenas o código (MUNI).
 */
import tabela from '../dados/municipiosTse.json';
import { numeroCanonico, semAcento } from './normalizar';

const MUNICIPIOS = tabela as unknown as Record<string, [uf: string, nome: string]>;

export function municipioPorCodigoTse(codigo: string | null | undefined): { uf: string; nome: string } | null {
  const c = numeroCanonico(codigo);
  const m = c ? MUNICIPIOS[c] : undefined;
  return m ? { uf: m[0], nome: m[1] } : null;
}

/** Nome do município pelo código TSE, ou um rótulo com o código se não constar da tabela. */
export function nomeMunicipioTse(codigo: string | null | undefined): string {
  return municipioPorCodigoTse(codigo)?.nome ?? (numeroCanonico(codigo) ? `MUNICÍPIO ${numeroCanonico(codigo)}` : '');
}

let porNome: Map<string, string | null> | null = null;

/** Código TSE pelo nome do município, quando o nome é único no país (senão null). */
export function codigoPorNomeUnico(nome: string | null | undefined): string | null {
  if (!porNome) {
    porNome = new Map();
    for (const [codigo, [, n]] of Object.entries(MUNICIPIOS)) {
      const k = semAcento(n);
      porNome.set(k, porNome.has(k) ? null : codigo);
    }
  }
  return porNome.get(semAcento((nome ?? '').trim())) ?? null;
}
