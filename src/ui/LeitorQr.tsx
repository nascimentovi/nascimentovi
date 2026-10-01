import { useCallback, useEffect, useRef, useState } from 'react';
import { MontadorQr, separarPartes } from '../domain/qrbu';
import { capturaDeQr } from '../services/capturaQr';
import { carregarImagem, desenhar, detectarQrs, lerQrDoCanvas } from '../services/imagem';
import { sinalizar, Topo, useFluxo } from './comum';

type EstadoCamera = 'iniciando' | 'ativa' | 'erro' | 'parada';

export function LeitorQr() {
  const { enviar } = useFluxo();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const montador = useRef(new MontadorQr());
  const ocupado = useRef(false);
  const ultimoErro = useRef('');
  const [estado, setEstado] = useState<EstadoCamera>('iniciando');
  const [erroCam, setErroCam] = useState('');
  const [erro, setErro] = useState('');
  const [partes, setPartes] = useState<{ lidas: number[]; total: number }>({ lidas: [], total: 0 });
  const [lanterna, setLanterna] = useState<boolean | null>(null);
  const [manual, setManual] = useState(false);
  const [texto, setTexto] = useState('');
  const [flash, setFlash] = useState(false);

  const pararCamera = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  /** Processa um texto de QR lido (câmera, imagem ou digitado). */
  const processar = useCallback(
    async (textos: string[], origemImagem?: string) => {
      if (ocupado.current) return;
      ocupado.current = true;
      try {
        let houveNova = false;
        let erroParte = '';
        for (const t of textos.flatMap(separarPartes)) {
          try {
            if (montador.current.adicionar(t).nova) houveNova = true;
          } catch (e) {
            erroParte = (e as Error).message;
          }
        }
        if (erroParte && !houveNova) {
          // QR que não é de boletim: avisa uma vez, sem perder as partes já lidas.
          if (ultimoErro.current !== erroParte) sinalizar('aviso');
          ultimoErro.current = erroParte;
          setErro(erroParte);
          return;
        }
        ultimoErro.current = '';
        setPartes({ lidas: montador.current.lidas, total: montador.current.quantidadeTotal });
        if (houveNova) {
          setErro('');
          setFlash(true);
          setTimeout(() => setFlash(false), 400);
          sinalizar('ok');
        }
        if (montador.current.completo) {
          const captura = await capturaDeQr(montador.current, 'qr_code', origemImagem);
          pararCamera();
          montador.current = new MontadorQr();
          enviar(captura, false);
        }
      } catch (e) {
        sinalizar('aviso');
        setErro((e as Error).message);
        montador.current.limpar();
        setPartes({ lidas: [], total: 0 });
      } finally {
        ocupado.current = false;
      }
    },
    [enviar, pararCamera],
  );

  // Inicia a câmera traseira
  useEffect(() => {
    if (manual) return;
    let cancelado = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador não permite acesso à câmera (é necessário HTTPS).');
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelado) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = s;
        const v = video.current!;
        v.srcObject = s;
        await v.play();
        const caps = s.getVideoTracks()[0].getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
        setLanterna(caps?.torch ? false : null);
        setEstado('ativa');
      } catch (e) {
        if (cancelado) return;
        setEstado('erro');
        setErroCam((e as Error).name === 'NotAllowedError' ? 'Permissão de câmera negada.' : (e as Error).message);
      }
    })();
    return () => {
      cancelado = true;
      pararCamera();
      setEstado('parada');
    };
  }, [manual, pararCamera]);

  // Laço de leitura dos quadros
  useEffect(() => {
    if (estado !== 'ativa') return;
    const canvas = document.createElement('canvas');
    let ativo = true;
    const ler = async () => {
      const v = video.current;
      if (!ativo || !v || v.readyState < 2) return;
      const escala = Math.min(1, 1080 / Math.max(v.videoWidth, v.videoHeight));
      canvas.width = v.videoWidth * escala;
      canvas.height = v.videoHeight * escala;
      canvas.getContext('2d', { willReadFrequently: true })!.drawImage(v, 0, 0, canvas.width, canvas.height);
      const r = await lerQrDoCanvas(canvas);
      if (r && ativo) await processar([r]);
    };
    const id = window.setInterval(() => void ler(), 180);
    return () => {
      ativo = false;
      window.clearInterval(id);
    };
  }, [estado, processar]);

  async function alternarLanterna() {
    const track = stream.current?.getVideoTracks()[0];
    if (!track) return;
    const novo = !lanterna;
    try {
      await track.applyConstraints({ advanced: [{ torch: novo } as MediaTrackConstraintSet] });
      setLanterna(novo);
    } catch {
      setLanterna(null);
    }
  }

  async function lerImagem(f: File | undefined) {
    if (!f) return;
    try {
      const img = await carregarImagem(f);
      const qrs = await detectarQrs(desenhar(img, 2400));
      if (!qrs.length) throw new Error('Nenhum QR Code encontrado na imagem.');
      await processar(qrs, f.name);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <>
      <Topo titulo="Leitor QR Code" />
      <main className="conteudo">
        {!manual && (
          <>
            <div className={`camera${flash ? ' sucesso' : ''}`}>
              <video ref={video} playsInline muted />
              <div className="mira" />
              <div className="dica">
                {estado === 'iniciando' && 'Abrindo câmera…'}
                {estado === 'ativa' && 'Aponte a câmera para o QR Code da urna'}
                {estado === 'erro' && erroCam}
              </div>
            </div>
            {lanterna !== null && (
              <button className="btn" onClick={alternarLanterna}>🔦 {lanterna ? 'Desligar' : 'Ligar'} lanterna</button>
            )}
          </>
        )}

        {partes.total > 1 && (
          <div className="cartao">
            <h3>Boletim com {partes.total} QR Codes</h3>
            <div className="partes">
              {Array.from({ length: partes.total }, (_, i) => (
                <span key={i} className={partes.lidas.includes(i + 1) ? 'lida' : ''}>{i + 1}</span>
              ))}
            </div>
            <p className="muted">Leia os QR Codes restantes (em qualquer ordem).</p>
            <button className="btn pequeno" onClick={() => { montador.current.limpar(); setPartes({ lidas: [], total: 0 }); }}>Recomeçar</button>
          </div>
        )}

        {erro && <div className="msg erro" role="alert">⚠️ {erro}</div>}

        {manual && (
          <div className="cartao">
            <h2>Digitar / colar conteúdo do QR Code</h2>
            <div className="campo">
              <label htmlFor="qrtexto">Conteúdo (uma parte por linha: QRBU:1:2 …)</label>
              <textarea id="qrtexto" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="QRBU:1:1 VRQR:1.5 VRCH:… HASH:…" />
            </div>
            <button className="btn primario" disabled={!texto.trim()} onClick={() => processar([texto])}>Processar</button>
          </div>
        )}

        <div className="acoes">
          <button className="btn" onClick={() => setManual(!manual)}>{manual ? '📷 Usar câmera' : '⌨️ Digitar código'}</button>
          <label className="btn">
            🖼️ QR de imagem
            <input type="file" accept="image/*" hidden onChange={(e) => { void lerImagem(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        </div>
      </main>
    </>
  );
}
