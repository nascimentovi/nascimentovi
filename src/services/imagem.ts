import jsQR from 'jsqr';

type Canvas = HTMLCanvasElement;

export function criarCanvas(w: number, h: number): Canvas {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function ctx2d(c: Canvas): CanvasRenderingContext2D {
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D indisponível neste navegador.');
  return ctx;
}

export const TIPOS_IMAGEM = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
export const TAMANHO_MAX_IMAGEM = 25 * 1024 * 1024;
export const LADO_MIN_IMAGEM = 600;

/** Carrega a foto respeitando a orientação EXIF. */
export async function carregarImagem(arquivo: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Não foi possível abrir a imagem. Use uma foto JPG ou PNG.');
  }
}

/** Desenha a imagem em um canvas, limitando o maior lado e aplicando rotação (graus). */
export function desenhar(img: CanvasImageSource & { width: number; height: number }, maxLado: number, rotacao = 0): Canvas {
  const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
  const w = img.width * escala;
  const h = img.height * escala;
  const gira = rotacao % 180 !== 0;
  const c = criarCanvas(gira ? h : w, gira ? w : h);
  const ctx = ctx2d(c);
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((rotacao * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  return c;
}

/**
 * Pré-processamento para OCR: tons de cinza, normalização de contraste
 * (auto-níveis entre os percentis 2% e 98%) e, opcionalmente, binarização
 * pelo método de Otsu — reduz sombras e reflexos da foto.
 */
export function preprocessar(origem: Canvas, binarizar = true): Canvas {
  const c = criarCanvas(origem.width, origem.height);
  const ctx = ctx2d(c);
  ctx.drawImage(origem, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const n = c.width * c.height;
  const cinza = new Uint8ClampedArray(n);
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const v = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000;
    cinza[i] = v;
    hist[cinza[i]]++;
  }
  const percentil = (p: number) => {
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= n * p) return v;
    }
    return 255;
  };
  const lo = percentil(0.02);
  const hi = Math.max(lo + 1, percentil(0.98));
  const histN = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    cinza[i] = ((cinza[i] - lo) * 255) / (hi - lo);
    histN[cinza[i]]++;
  }
  let limiar = -1;
  if (binarizar) {
    // Otsu
    let soma = 0;
    for (let v = 0; v < 256; v++) soma += v * histN[v];
    let somaB = 0;
    let wB = 0;
    let melhor = 0;
    for (let v = 0; v < 256; v++) {
      wB += histN[v];
      if (!wB) continue;
      const wF = n - wB;
      if (!wF) break;
      somaB += v * histN[v];
      const mB = somaB / wB;
      const mF = (soma - somaB) / wF;
      const entre = wB * wF * (mB - mF) ** 2;
      if (entre > melhor) {
        melhor = entre;
        limiar = v;
      }
    }
  }
  for (let i = 0; i < n; i++) {
    const v = limiar >= 0 ? (cinza[i] > limiar ? 255 : 0) : cinza[i];
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

interface BarcodeDetectorLike {
  detect(src: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

let detectorNativo: BarcodeDetectorLike | null | undefined;

/** BarcodeDetector nativo (Android/Chrome) é mais rápido; null se indisponível. */
export async function obterDetectorNativo(): Promise<BarcodeDetectorLike | null> {
  if (detectorNativo !== undefined) return detectorNativo;
  detectorNativo = null;
  const BD = (globalThis as unknown as { BarcodeDetector?: { new (o: unknown): BarcodeDetectorLike; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector;
  if (BD) {
    try {
      const formatos = await BD.getSupportedFormats();
      if (formatos.includes('qr_code')) detectorNativo = new BD({ formats: ['qr_code'] });
    } catch {
      /* ignora */
    }
  }
  return detectorNativo;
}

/** Lê um QR do quadro (usado no vídeo da câmera). */
export async function lerQrDoCanvas(c: Canvas): Promise<string | null> {
  const nativo = await obterDetectorNativo();
  if (nativo) {
    try {
      const r = await nativo.detect(c);
      if (r[0]?.rawValue) return r[0].rawValue;
      return null;
    } catch {
      /* cai para o jsQR */
    }
  }
  const ctx = ctx2d(c);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  return jsQR(img.data, c.width, c.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
}

/**
 * Encontra regiões que parecem QR Codes: reduz a imagem, marca pixels escuros,
 * dilata para unir os módulos e rotula componentes conexos. Devolve caixas
 * (com margem) nas coordenadas do canvas recebido.
 */
function regioesCandidatas(c: Canvas): [number, number, number, number][] {
  const LADO = 320;
  const p = desenhar(c, LADO);
  const { width: w, height: h } = p;
  const d = ctx2d(p).getImageData(0, 0, w, h).data;
  const escuro = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) escuro[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11 < 128 ? 1 : 0;
  // Dilatação 5×5
  const dil = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!escuro[y * w + x]) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy >= 0 && yy < h && xx >= 0 && xx < w) dil[yy * w + xx] = 1;
        }
      }
    }
  }
  const rot = new Int32Array(w * h);
  const caixas: [number, number, number, number][] = [];
  const fila: number[] = [];
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    if (!dil[i] || rot[i]) continue;
    n++;
    let x0 = w, y0 = h, x1 = 0, y1 = 0, area = 0;
    rot[i] = n;
    fila.push(i);
    while (fila.length) {
      const k = fila.pop()!;
      const x = k % w;
      const y = (k - x) / w;
      area++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (const v of [k - 1, k + 1, k - w, k + w]) {
        if (v < 0 || v >= w * h || rot[v] || !dil[v]) continue;
        if ((v === k - 1 && x === 0) || (v === k + 1 && x === w - 1)) continue;
        rot[v] = n;
        fila.push(v);
      }
    }
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    const razao = bw / bh;
    if (bw >= 20 && bh >= 20 && razao > 0.6 && razao < 1.6 && area / (bw * bh) > 0.5) {
      const esc = c.width / w;
      const m = 0.12 * Math.max(bw, bh);
      const X = Math.max(0, Math.floor((x0 - m) * esc));
      const Y = Math.max(0, Math.floor((y0 - m) * esc));
      caixas.push([X, Y, Math.min(c.width - X, Math.ceil((bw + 2 * m) * esc)), Math.min(c.height - Y, Math.ceil((bh + 2 * m) * esc))]);
    }
  }
  return caixas.slice(0, 20);
}

/** true se os textos encontrados já formam todas as partes de um BU (QRBU:i:n). */
function todasPartes(achados: Set<string>): boolean {
  let total = 0;
  const idx = new Set<number>();
  for (const t of achados) {
    const m = t.match(/^QRBU:(\d+):(\d+)/);
    if (!m) continue;
    total = Number(m[2]);
    idx.add(Number(m[1]));
  }
  return total > 0 && idx.size >= total;
}

function lerRegiao(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const img = ctx.getImageData(x, y, w, h);
  return jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' });
}

/**
 * Procura TODOS os QR Codes de uma imagem (um BU pode ter vários). O jsQR
 * encontra um por vez: cada QR achado é apagado e a busca repete; depois a
 * imagem é varrida em blocos sobrepostos até reunir todas as partes.
 */
export async function detectarQrs(origem: Canvas, maximo = 8): Promise<string[]> {
  const achados = new Set<string>();
  const nativo = await obterDetectorNativo();
  if (nativo) {
    try {
      for (const r of await nativo.detect(origem)) if (r.rawValue) achados.add(r.rawValue);
    } catch {
      /* ignora */
    }
  }
  for (const lado of [1600, 1000]) {
    if (todasPartes(achados)) break;
    const c = desenhar(origem, lado);
    const ctx = ctx2d(c);
    for (let i = 0; i < maximo; i++) {
      const r = lerRegiao(ctx, 0, 0, c.width, c.height);
      if (!r) break;
      if (r.data) achados.add(r.data);
      // Apaga o QR encontrado (polígono ampliado em 15% para cobrir os padrões de localização).
      const cs = [r.location.topLeftCorner, r.location.topRightCorner, r.location.bottomRightCorner, r.location.bottomLeftCorner];
      const cx = cs.reduce((s, p) => s + p.x, 0) / 4;
      const cy = cs.reduce((s, p) => s + p.y, 0) / 4;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      cs.forEach((p, k) => {
        const x = cx + (p.x - cx) * 1.15;
        const y = cy + (p.y - cy) * 1.15;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fill();
    }
  }
  // Regiões candidatas: blocos escuros densos e quase quadrados, decodificados isoladamente.
  if (!todasPartes(achados)) {
    const c = desenhar(origem, 1600);
    const ctx = ctx2d(c);
    for (const [x, y, w, h] of regioesCandidatas(c)) {
      const r = lerRegiao(ctx, x, y, w, h);
      if (r?.data) achados.add(r.data);
    }
  }
  // Varredura em janelas sobrepostas (1/2 e 2/3 da imagem, passo de 1/3 da janela).
  if (!todasPartes(achados)) {
    const c = desenhar(origem, 1600);
    const ctx = ctx2d(c);
    for (const frac of [0.5, 0.67]) {
      const tw = Math.ceil(c.width * frac);
      const th = Math.ceil(c.height * frac);
      const passoX = Math.ceil(tw / 3);
      const passoY = Math.ceil(th / 3);
      for (let y = 0; y < c.height - th / 3; y += passoY) {
        for (let x = 0; x < c.width - tw / 3; x += passoX) {
          const r = lerRegiao(ctx, x, y, Math.min(tw, c.width - x), Math.min(th, c.height - y));
          if (r?.data) achados.add(r.data);
        }
      }
      if (todasPartes(achados)) break;
    }
  }
  return [...achados];
}
