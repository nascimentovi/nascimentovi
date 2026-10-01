const enc = new TextEncoder();

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexParaBytes(h: string): Uint8Array {
  const limpo = h.replace(/[^0-9a-fA-F]/g, '');
  const out = new Uint8Array(Math.floor(limpo.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(limpo.substr(i * 2, 2), 16);
  return out;
}

function concat(...partes: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = partes.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of partes) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export async function sha256Hex(texto: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(texto)));
}

export async function sha512Hex(...partes: (string | Uint8Array)[]): Promise<string> {
  const bytes = concat(...partes.map((p) => (typeof p === 'string' ? enc.encode(p) : p)));
  return hex(await crypto.subtle.digest('SHA-512', bytes));
}
