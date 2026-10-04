import { useEffect, useRef, useState } from 'react';
import { interpretarTextoBu } from '../domain/textoBu';
import { capturaDeQr, montarDeTextos } from '../services/capturaQr';
import { carregarImagem, desenhar, detectarQrs, LADO_MIN_IMAGEM, preprocessar, TAMANHO_MAX_IMAGEM } from '../services/imagem';
import { reconhecerTexto } from '../services/ocr';
import { Progresso, Topo, useFluxo } from './comum';

interface Etapa { rotulo: string; v: number }

export function FotoOcr() {
  const { enviar } = useFluxo();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [img, setImg] = useState<ImageBitmap | null>(null);
  const [rotacao, setRotacao] = useState(0);
  const [previa, setPrevia] = useState('');
  const [etapas, setEtapas] = useState<Etapa[] | null>(null);
  const [erro, setErro] = useState('');
  const cancelado = useRef(false);

  useEffect(() => {
    if (!img) return;
    const c = desenhar(img, 900, rotacao);
    setPrevia(c.toDataURL('image/jpeg', 0.8));
  }, [img, rotacao]);

  async function escolher(f: File | undefined) {
    setErro('');
    if (!f) return;
    if (f.type && !f.type.startsWith('image/')) return setErro('Formato inválido: use uma foto JPG ou PNG.');
    if (f.size > TAMANHO_MAX_IMAGEM) return setErro('Imagem muito grande (máximo 500 MB).');
    try {
      const bmp = await carregarImagem(f);
      if (Math.max(bmp.width, bmp.height) < LADO_MIN_IMAGEM) {
        setErro(`Imagem muito pequena (${bmp.width}×${bmp.height}). Refotografe mais de perto, com o boletim ocupando a tela.`);
        return;
      }
      setArquivo(f);
      setImg(bmp);
      setRotacao(0);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  const passo = (i: number, v: number) =>
    setEtapas((es) => es && es.map((e, j) => (j === i ? { ...e, v } : j < i ? { ...e, v: 1 } : e)));

  async function analisar() {
    if (!img || !arquivo) return;
    cancelado.current = false;
    setErro('');
    setEtapas([
      { rotulo: 'Procurando QR Code', v: 0 },
      { rotulo: 'Pré-processando imagem', v: 0 },
      { rotulo: 'Reconhecendo texto (OCR)', v: 0 },
      { rotulo: 'Validando resultados', v: 0 },
    ]);
    try {
      const original = desenhar(img, 2600, rotacao);

      // 1) QR Code na foto → processa como leitura de QR (com verificação de hash).
      const qrs = await detectarQrs(original);
      passo(0, 1);
      if (cancelado.current) return;
      let avisoQr = '';
      if (qrs.length) {
        const m = montarDeTextos(qrs);
        if (m.completo) {
          enviar(await capturaDeQr(m, 'ocr', arquivo.name), false);
          return;
        }
        if (m.quantidadeTotal) avisoQr = `QR Code parcial na foto (${m.lidas.length} de ${m.quantidadeTotal} partes); dados obtidos por OCR.`;
      }

      // 2) Pré-processamento: contraste + binarização.
      const tratada = preprocessar(desenhar(img, 2200, rotacao));
      passo(1, 1);
      if (cancelado.current) return;

      // 3) OCR
      const r = await reconhecerTexto(tratada, (v) => passo(2, v));
      if (cancelado.current) return;
      passo(2, 1);

      // 4) Parsing
      const t = interpretarTextoBu(r.linhas, { ocr: true });
      passo(3, 1);
      const avisos = [...t.avisos];
      if (avisoQr) avisos.unshift(avisoQr);
      enviar(
        {
          tipo: 'ocr',
          boletim: t.boletim,
          confianca: t.confianca,
          qualidadeGeral: r.confiancaGeral,
          arquivoOriginal: arquivo.name,
          conteudoBruto: r.texto,
          avisos,
        },
        true,
      );
    } catch (e) {
      setEtapas(null);
      setErro(`Falha na análise: ${(e as Error).message}`);
    }
  }

  return (
    <>
      <Topo titulo="Fotografar boletim" />
      <main className="conteudo">
        {etapas ? (
          <section className="cartao">
            <h2>Analisando foto…</h2>
            {etapas.map((e) => (
              <div key={e.rotulo} style={{ marginTop: 10 }}>
                <Progresso valor={e.v} etapa={e.rotulo} />
              </div>
            ))}
            <p className="muted">Na primeira vez o motor de OCR é carregado (alguns segundos). Depois funciona offline.</p>
            <button className="btn" style={{ marginTop: 10 }} onClick={() => { cancelado.current = true; setEtapas(null); }}>Cancelar</button>
          </section>
        ) : (
          <>
            {previa ? (
              <section className="cartao">
                <img className="previa" src={previa} alt="Prévia da foto do boletim" />
                <div className="linha-acoes" style={{ marginTop: 10, justifyContent: 'center' }}>
                  <button className="btn pequeno" onClick={() => setRotacao((r) => (r + 270) % 360)}>⟲ Girar</button>
                  <button className="btn pequeno" onClick={() => setRotacao((r) => (r + 90) % 360)}>⟳ Girar</button>
                </div>
              </section>
            ) : (
              <div className="msg info">
                📸 Fotografe o boletim <strong>de frente</strong>, bem enquadrado e iluminado.
                <ul>
                  <li>Use a máxima iluminação possível</li>
                  <li>Evite reflexos e sombras</li>
                  <li>Se o boletim tiver QR Code, inclua-o na foto: ele é lido automaticamente</li>
                </ul>
              </div>
            )}
            {erro && <div className="msg erro" role="alert">❌ {erro}</div>}
            <div className="acoes">
              <label className="btn primario">
                📷 {previa ? 'Refotografar' : 'Tirar foto'}
                <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void escolher(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              <label className="btn">
                🖼️ Galeria
                <input type="file" accept="image/*" hidden onChange={(e) => { void escolher(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
            </div>
            {previa && <button className="btn primario" onClick={analisar}>🔎 Analisar foto</button>}
          </>
        )}
      </main>
    </>
  );
}
