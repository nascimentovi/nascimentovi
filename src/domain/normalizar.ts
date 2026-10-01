/** Remove acentos e converte para maiúsculas. */
export function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

/** Mantém só dígitos e remove zeros à esquerda ("0075" → "75"). */
export function numeroCanonico(s: string | null | undefined): string {
  const d = (s ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return d;
}

/** Formata com zeros à esquerda para exibição ("75" → "0075"). */
export function comZeros(s: string, tamanho = 4): string {
  const d = numeroCanonico(s);
  return d ? d.padStart(tamanho, '0') : '';
}

export function apenasDigitos(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '');
}

/** Formata o código de carga em grupos de 3 dígitos (como impresso no BU). */
export function formatarCarga(s: string): string {
  const d = apenasDigitos(s);
  if (!d) return '';
  return d.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Converte datas "30/10/2022", "20221030" ou "2022-10-30" para ISO. */
export function dataIso(s: string | null | undefined): string {
  const t = (s ?? '').trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

export function dataBr(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/**
 * Corrige confusões típicas de OCR em campos numéricos
 * (O→0, l/I/|→1, S→5, B→8, Z→2, G→6) e remove o resto.
 */
export function sanitizarNumeroOcr(s: string): string {
  return s
    .replace(/[Oo°Q]/g, '0')
    .replace(/[lI|!iL]/g, '1')
    .replace(/[Ss$]/g, '5')
    .replace(/B/g, '8')
    .replace(/[Zz]/g, '2')
    .replace(/G/g, '6')
    .replace(/[^\d]/g, '');
}

/** Remove caracteres de controle e potencialmente perigosos de texto livre. */
export function sanitizarTexto(s: string): string {
  return s
    .replace(/[\u0000-\u001f\u007f<>{}`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export function inteiroOuNulo(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseInt(String(v).replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

export function formatarNumero(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('pt-BR');
}

export function formatarPct(n: number): string {
  return `${(n * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
