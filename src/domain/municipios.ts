/**
 * Tabela oficial de municípios por código TSE (5.570 municípios), embutida
 * no app para funcionar offline. O QR Code do BU traz apenas o código (MUNI).
 */
import tabela from '../dados/municipiosTse.json';
import { numeroCanonico } from './normalizar';

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
