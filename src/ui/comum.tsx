import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Captura, TipoEntrada } from '../domain/types';

/* ---------------- Roteamento por hash (funciona offline e em subdiretório) ---------------- */

export function useRota(): string {
  const [rota, setRota] = useState(() => location.hash.slice(1) || '/');
  useEffect(() => {
    const f = () => {
      setRota(location.hash.slice(1) || '/');
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return rota;
}

export function ir(rota: string): void {
  location.hash = rota;
}

export function voltar(padrao = '/'): void {
  if (history.length > 1) history.back();
  else ir(padrao);
}

export const ROTA_METODO: Record<TipoEntrada, string> = {
  qr_code: '/qr',
  pdf: '/pdf',
  arquivo_bu: '/pdf',
  ocr: '/foto',
  manual: '/',
};

/* ---------------- Fluxo de captura em andamento ---------------- */

export interface FluxoCtx {
  pendente: Captura | null;
  /** Envia uma captura: PDF passa pela revisão; QR vai direto à confirmação. */
  enviar: (c: Captura, revisar: boolean) => void;
  limpar: () => void;
  toast: (msg: string) => void;
}

export const Fluxo = createContext<FluxoCtx | null>(null);

export function useFluxo(): FluxoCtx {
  const c = useContext(Fluxo);
  if (!c) throw new Error('Fluxo fora do provedor');
  return c;
}

/* ---------------- Componentes de layout ---------------- */

export function Topo({ titulo, semVoltar, direita }: { titulo: string; semVoltar?: boolean; direita?: ReactNode }) {
  return (
    <header className="topo">
      {semVoltar ? <span style={{ minWidth: 64 }} /> : <button onClick={() => voltar()} aria-label="Voltar">‹ Voltar</button>}
      <h1>{titulo}</h1>
      {direita ?? <button onClick={() => ir('/ajuda')} aria-label="Ajuda">?</button>}
    </header>
  );
}

export function Modal({ children, aoFechar }: { children: ReactNode; aoFechar: () => void }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [aoFechar]);
  return (
    <div className="fundo" onClick={aoFechar}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function Progresso({ valor, etapa }: { valor: number; etapa?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, valor)) * 100);
  return (
    <div className="campo" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      {etapa && <span className="muted">🔄 {etapa}</span>}
      <div className="progresso"><div style={{ width: `${pct}%` }} /></div>
      <span className="muted">{pct}%</span>
    </div>
  );
}

/** Sinal sonoro e vibração de confirmação (quando suportados). */
export function sinalizar(tipo: 'ok' | 'aviso'): void {
  try {
    navigator.vibrate?.(tipo === 'ok' ? 120 : [80, 60, 80]);
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ac = new Ctx();
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.frequency.value = tipo === 'ok' ? 880 : 330;
    g.gain.value = 0.08;
    osc.connect(g).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + (tipo === 'ok' ? 0.15 : 0.35));
    osc.onended = () => void ac.close();
  } catch {
    /* sem áudio */
  }
}

export function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
