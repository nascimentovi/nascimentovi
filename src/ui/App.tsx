import { useCallback, useMemo, useRef, useState } from 'react';
import type { Captura } from '../domain/types';
import { Ajuda } from './Ajuda';
import { Fluxo, ir, useRota, type FluxoCtx } from './comum';
import { Confirmacao } from './Confirmacao';
import { DetalheLeitura } from './DetalheLeitura';
import { Historico } from './Historico';
import { Inicio } from './Inicio';
import { LeitorPdf } from './LeitorPdf';
import { LeitorQr } from './LeitorQr';
import { Revisao } from './Revisao';

export function App() {
  const rota = useRota();
  const [pendente, setPendente] = useState<Captura | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const toast = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 3200);
  }, []);

  const ctx = useMemo<FluxoCtx>(
    () => ({
      pendente,
      enviar: (c, revisar) => {
        setPendente(c);
        ir(revisar ? '/revisar' : '/confirmar');
      },
      limpar: () => setPendente(null),
      toast,
    }),
    [pendente, toast],
  );

  let tela;
  const [, base, param] = rota.split('/');
  switch (`/${base}`) {
    case '/qr': tela = <LeitorQr />; break;
    case '/pdf': tela = <LeitorPdf />; break;
    case '/revisar': tela = <Revisao />; break;
    case '/confirmar': tela = <Confirmacao />; break;
    case '/historico': tela = <Historico />; break;
    case '/leitura': tela = <DetalheLeitura id={decodeURIComponent(param ?? '')} />; break;
    case '/ajuda': tela = <Ajuda />; break;
    default: tela = <Inicio />;
  }

  return (
    <Fluxo.Provider value={ctx}>
      {tela}
      {msg && <div className="toast" role="status">{msg}</div>}
    </Fluxo.Provider>
  );
}
