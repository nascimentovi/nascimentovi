import type { LinhaTexto } from '../domain/textoBu';

type Worker = import('tesseract.js').Worker;

let workerPromise: Promise<Worker> | null = null;
let ouvinte: ((p: number, etapa: string) => void) | null = null;

const ETAPAS: Record<string, string> = {
  'loading tesseract core': 'Carregando motor de OCR',
  'initializing tesseract': 'Inicializando OCR',
  'loading language traineddata': 'Carregando idioma (português)',
  'initializing api': 'Preparando reconhecimento',
  'recognizing text': 'Reconhecendo texto',
};

function urlLocal(caminho: string): string {
  return new URL(`${import.meta.env.BASE_URL}${caminho}`, location.href).href;
}

/** Cria (uma única vez) o worker do Tesseract com arquivos locais — funciona offline. */
async function obterWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, OEM } = await import('tesseract.js');
      return createWorker('por', OEM.LSTM_ONLY, {
        workerPath: urlLocal('tesseract/worker.min.js'),
        corePath: urlLocal('tesseract/core'),
        langPath: urlLocal('tesseract/lang'),
        gzip: true,
        logger: (m) => ouvinte?.(m.progress, ETAPAS[m.status] ?? m.status),
      });
    })().catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

export interface ResultadoOcr {
  linhas: LinhaTexto[];
  confiancaGeral: number;
  texto: string;
}

/**
 * Executa o OCR e devolve as linhas com confiança. Para linhas com números,
 * usa a MENOR confiança entre as palavras numéricas (é o que importa para
 * contagem de votos e identificação da urna).
 */
export async function reconhecerTexto(
  imagem: HTMLCanvasElement,
  progresso?: (p: number, etapa: string) => void,
): Promise<ResultadoOcr> {
  ouvinte = progresso ?? null;
  try {
    const worker = await obterWorker();
    const { data } = await worker.recognize(imagem, {}, { blocks: true, text: true });
    const linhas: LinhaTexto[] = [];
    for (const bloco of data.blocks ?? []) {
      for (const par of bloco.paragraphs) {
        for (const linha of par.lines) {
          const texto = linha.text.replace(/\s+/g, ' ').trim();
          if (!texto) continue;
          const numericas = linha.words.filter((w) => /\d/.test(w.text));
          const confianca = numericas.length ? Math.min(...numericas.map((w) => w.confidence)) : linha.confidence;
          linhas.push({ texto, confianca });
        }
      }
    }
    return { linhas, confiancaGeral: Math.round(data.confidence), texto: data.text };
  } finally {
    ouvinte = null;
  }
}
