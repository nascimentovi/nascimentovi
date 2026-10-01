import { semAcento } from './normalizar';

/** Códigos de cargo usados no QR Code do Boletim de Urna (campo CARG). */
export const CARGOS_POR_CODIGO: Record<string, string> = {
  '1': 'PRESIDENTE',
  '2': 'VICE-PRESIDENTE',
  '3': 'GOVERNADOR',
  '4': 'VICE-GOVERNADOR',
  '5': 'SENADOR',
  '6': 'DEPUTADO FEDERAL',
  '7': 'DEPUTADO ESTADUAL',
  '8': 'DEPUTADO DISTRITAL',
  '9': '1º SUPLENTE',
  '10': '2º SUPLENTE',
  '11': 'PREFEITO',
  '12': 'VICE-PREFEITO',
  '13': 'VEREADOR',
};

/** Ordem de exibição no dashboard. */
export const ORDEM_CARGOS = [
  'PRESIDENTE',
  'GOVERNADOR',
  'SENADOR',
  'DEPUTADO FEDERAL',
  'DEPUTADO ESTADUAL',
  'DEPUTADO DISTRITAL',
  'PREFEITO',
  'VEREADOR',
];

const SINONIMOS: [RegExp, string][] = [
  [/^PRESIDENTE/, 'PRESIDENTE'],
  [/^GOVERNADOR/, 'GOVERNADOR'],
  [/^SENADOR/, 'SENADOR'],
  [/^DEP(UTADO)?\.?\s*FEDERAL/, 'DEPUTADO FEDERAL'],
  [/^DEP(UTADO)?\.?\s*ESTADUAL/, 'DEPUTADO ESTADUAL'],
  [/^DEP(UTADO)?\.?\s*DISTRITAL/, 'DEPUTADO DISTRITAL'],
  [/^PREFEITO/, 'PREFEITO'],
  [/^VEREADOR/, 'VEREADOR'],
];

/** Converte código numérico ou texto livre para o nome canônico do cargo. */
export function cargoCanonico(entrada: string): string {
  const t = semAcento(entrada).trim();
  if (/^\d+$/.test(t)) return CARGOS_POR_CODIGO[String(Number(t))] ?? `CARGO ${t}`;
  for (const [re, nome] of SINONIMOS) if (re.test(t)) return nome;
  return t;
}

/** Identifica se uma linha de texto é o título de uma seção de cargo. */
export function cargoDoTitulo(linha: string): string | null {
  const t = semAcento(linha).replace(/[^A-Z\s.]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [re, nome] of SINONIMOS) {
    // Títulos de seção são curtos: "PRESIDENTE", "DEPUTADO FEDERAL"
    if (re.test(t) && t.length <= nome.length + 4) return nome;
  }
  return null;
}

export function compararCargos(a: string, b: string): number {
  const ia = ORDEM_CARGOS.indexOf(a);
  const ib = ORDEM_CARGOS.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
}
