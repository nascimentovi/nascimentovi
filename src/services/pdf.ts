// Build "legacy": compatível com navegadores móveis mais antigos.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { LinhaTexto } from '../domain/textoBu';
import { criarCanvas, detectarQrs } from './imagem';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export const TAMANHO_MAX_PDF = 50 * 1024 * 1024;

export interface ResultadoPdf {
  linhas: LinhaTexto[];
  qrs: string[];
  paginas: HTMLCanvasElement[];
  numPaginas: number;
}

export class ErroPdf extends Error {}

/** Confere tamanho e assinatura "%PDF-" do arquivo. */
export async function validarArquivoPdf(arquivo: File): Promise<ArrayBuffer> {
  if (arquivo.size === 0) throw new ErroPdf('Arquivo vazio.');
  if (arquivo.size > TAMANHO_MAX_PDF) throw new ErroPdf('Arquivo maior que 50 MB.');
  const buf = await arquivo.arrayBuffer();
  const cab = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(1024, buf.byteLength)));
  if (!cab.includes('%PDF-')) throw new ErroPdf('Arquivo inválido: não é um PDF.');
  return buf;
}

/**
 * Extrai o texto (reagrupado em linhas pela posição vertical) e procura
 * QR Codes nas páginas renderizadas.
 */
export async function processarPdf(
  buf: ArrayBuffer,
  progresso: (p: number, etapa: string) => void,
  cancelado: () => boolean,
): Promise<ResultadoPdf> {
  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  } catch (e) {
    throw new ErroPdf(`PDF corrompido ou protegido: ${(e as Error).message}`);
  }
  const linhas: LinhaTexto[] = [];
  const qrs = new Set<string>();
  const paginas: HTMLCanvasElement[] = [];
  const total = Math.min(doc.numPages, 10);

  for (let p = 1; p <= total; p++) {
    if (cancelado()) throw new ErroPdf('Processamento cancelado.');
    progresso((p - 1) / total, `Extraindo texto da página ${p} de ${total}`);
    const page = await doc.getPage(p);
    const conteudo = await page.getTextContent();
    const itens = conteudo.items
      .filter((i): i is typeof i & { str: string; transform: number[] } => 'str' in i && !!i.str.trim())
      .map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5] }));
    // Agrupa por linha (tolerância de 3 pt) e ordena da esquerda para a direita.
    itens.sort((a, b) => b.y - a.y || a.x - b.x);
    let grupo: typeof itens = [];
    const fechar = () => {
      if (!grupo.length) return;
      const texto = grupo.sort((a, b) => a.x - b.x).map((g) => g.s.trim()).join(' ');
      linhas.push({ texto, confianca: 100 });
      grupo = [];
    };
    for (const it of itens) {
      if (grupo.length && Math.abs(grupo[0].y - it.y) > 3) fechar();
      grupo.push(it);
    }
    fechar();

    progresso((p - 0.5) / total, `Procurando QR Code na página ${p}`);
    const vp = page.getViewport({ scale: 2.5 });
    const canvas = criarCanvas(vp.width, vp.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    paginas.push(canvas);
    for (const q of await detectarQrs(canvas)) qrs.add(q);
  }
  progresso(1, 'Concluído');
  return { linhas, qrs: [...qrs], paginas, numPaginas: doc.numPages };
}
