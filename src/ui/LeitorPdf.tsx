import { useRef, useState } from 'react';
import { interpretarArquivoBu, pareceArquivoBu } from '../domain/arquivoBu';
import { interpretarTextoBu, type LinhaTexto } from '../domain/textoBu';
import { capturaDeQr, montarDeTextos } from '../services/capturaQr';
import { preprocessar } from '../services/imagem';
import { reconhecerTexto } from '../services/ocr';
import type { ResultadoPdf } from '../services/pdf';
import { Progresso, Topo, useFluxo } from './comum';

function tamanho(b: number) {
  return b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;
}

export function LeitorPdf() {
  const { enviar } = useFluxo();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [prog, setProg] = useState<{ v: number; etapa: string } | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [semTexto, setSemTexto] = useState<ResultadoPdf | null>(null);
  const cancelado = useRef(false);

  function escolher(f: File | undefined) {
    setErro('');
    setAviso('');
    setSemTexto(null);
    if (!f) return;
    if (!/\.(pdf|bu|dat)$/i.test(f.name) && f.type !== 'application/pdf') {
      setErro('Arquivo inválido: selecione um PDF ou o arquivo do boletim de urna (.bu ou .dat).');
      return;
    }
    setArquivo(f);
  }

  async function continuar() {
    if (!arquivo) return;
    cancelado.current = false;
    setErro('');
    setAviso('');
    try {
      setProg({ v: 0, etapa: 'Validando arquivo' });

      // Arquivo binário do BU publicado pelo TSE (.bu/.dat): dados oficiais, contabiliza direto.
      const bytes = new Uint8Array(await arquivo.arrayBuffer());
      const cabecalho = new TextDecoder().decode(bytes.subarray(0, 8));
      if (!cabecalho.includes('%PDF') && pareceArquivoBu(bytes)) {
        const { boletim } = interpretarArquivoBu(bytes);
        const avisos = boletim.fase && boletim.fase !== 'O' ? [`Boletim de urna em fase "${boletim.fase === 'S' ? 'simulado' : 'treinamento'}" (não oficial).`] : [];
        setProg({ v: 1, etapa: 'Boletim de urna lido' });
        enviar({ tipo: 'arquivo_bu', boletim, arquivoOriginal: arquivo.name, avisos, checksumValido: null }, false);
        return;
      }

      // pdf.js é carregado sob demanda (mantém o app inicial leve).
      const { processarPdf, validarArquivoPdf } = await import('../services/pdf');
      const buf = await validarArquivoPdf(arquivo);
      const r = await processarPdf(buf, (v, etapa) => setProg({ v: v * 0.9, etapa }), () => cancelado.current);
      if (cancelado.current) return;

      // 1) QR Code dentro do PDF → processado como QR (validação por hash).
      if (r.qrs.length) {
        const m = montarDeTextos(r.qrs);
        if (m.completo) {
          setProg({ v: 1, etapa: 'QR Code encontrado no PDF' });
          enviar(await capturaDeQr(m, 'pdf', arquivo.name), false);
          return;
        }
        if (m.quantidadeTotal) setAviso(`Foram encontradas apenas ${m.lidas.length} de ${m.quantidadeTotal} partes do QR Code; usando o texto do PDF.`);
      }

      // 2) Texto do PDF.
      setProg({ v: 0.95, etapa: 'Detectando estrutura do boletim' });
      const t = interpretarTextoBu(r.linhas, { ocr: false });
      if (t.camposEncontrados >= 3) {
        enviar(
          {
            tipo: 'pdf',
            boletim: t.boletim,
            confianca: t.confianca,
            qualidadeGeral: t.qualidadeGeral,
            arquivoOriginal: arquivo.name,
            conteudoBruto: r.linhas.map((l) => l.texto).join('\n'),
            avisos: t.avisos,
          },
          true,
        );
        return;
      }
      setProg(null);
      setSemTexto(r);
    } catch (e) {
      setProg(null);
      setErro((e as Error).message);
    }
  }

  /** PDF digitalizado (imagem): oferece OCR sobre as páginas renderizadas. */
  async function usarOcr() {
    if (!semTexto || !arquivo) return;
    cancelado.current = false;
    try {
      const linhas: LinhaTexto[] = [];
      let soma = 0;
      for (let i = 0; i < semTexto.paginas.length; i++) {
        const base = i / semTexto.paginas.length;
        const r = await reconhecerTexto(preprocessar(semTexto.paginas[i]), (v, etapa) =>
          setProg({ v: base + v / semTexto.paginas.length, etapa: `Página ${i + 1}: ${etapa}` }),
        );
        if (cancelado.current) return;
        linhas.push(...r.linhas);
        soma += r.confiancaGeral;
      }
      const t = interpretarTextoBu(linhas, { ocr: true });
      enviar(
        {
          tipo: 'ocr',
          boletim: t.boletim,
          confianca: t.confianca,
          qualidadeGeral: Math.round(soma / Math.max(1, semTexto.paginas.length)),
          arquivoOriginal: arquivo.name,
          conteudoBruto: linhas.map((l) => l.texto).join('\n'),
          avisos: [...t.avisos, 'PDF digitalizado processado por OCR.'],
        },
        true,
      );
    } catch (e) {
      setProg(null);
      setErro((e as Error).message);
    }
  }

  return (
    <>
      <Topo titulo="Upload de arquivo" />
      <main className="conteudo">
        {prog ? (
          <section className="cartao">
            <h2>Processando arquivo…</h2>
            <Progresso valor={prog.v} etapa={prog.etapa} />
            <button className="btn" style={{ marginTop: 12 }} onClick={() => { cancelado.current = true; setProg(null); }}>Cancelar</button>
          </section>
        ) : (
          <>
            <h2>Selecione o arquivo do boletim</h2>
            <label
              className={`soltar${arrastando ? ' ativo' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(e) => { e.preventDefault(); setArrastando(false); escolher(e.dataTransfer.files[0]); }}
            >
              <div style={{ fontSize: '2rem' }}>📁</div>
              {arquivo ? (
                <p>📄 <strong>{arquivo.name}</strong> ({tamanho(arquivo.size)})</p>
              ) : (
                <p>Arraste o arquivo aqui ou toque para selecionar</p>
              )}
              <span className="btn pequeno">Selecionar arquivo</span>
              <input type="file" accept="application/pdf,.pdf,.bu,.dat,application/octet-stream" hidden onChange={(e) => { escolher(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            <p className="muted">
              Aceita <strong>PDF</strong> (máx. 50 MB; se tiver o QR Code do boletim, ele é lido e validado) ou o{' '}
              <strong>arquivo do boletim de urna do TSE</strong> (.bu ou .dat, baixado no site de resultados do TSE).
            </p>
          </>
        )}

        {aviso && <div className="msg aviso">⚠️ {aviso}</div>}
        {erro && <div className="msg erro" role="alert">❌ {erro}</div>}
        {semTexto && !prog && (
          <div className="msg aviso">
            <strong>Não foi possível extrair os dados do texto do PDF.</strong>
            <p style={{ margin: '6px 0' }}>O arquivo parece ser digitalizado (imagem). Você pode processá-lo com OCR.</p>
            <button className="btn primario" onClick={usarOcr}>🔎 Processar com OCR</button>
          </div>
        )}

        {!prog && (
          <div className="acoes">
            <button className="btn" onClick={() => history.back()}>Cancelar</button>
            <button className="btn primario" disabled={!arquivo} onClick={continuar}>Continuar</button>
          </div>
        )}
      </main>
    </>
  );
}
