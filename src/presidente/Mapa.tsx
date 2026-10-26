import { useState, type MouseEvent } from 'react';
import { UFS, type Resultado } from '../domain/tseResultado';
import { MAPA_ALTURA, MAPA_LARGURA, MAPA_UFS } from '../dados/mapaBrasil';
import type { Resultados } from '../services/tseApuracao';

type Modo = 'votacao' | 'apuracao';

// Faixas de vantagem (p.p.) e de apuração (%), com a opacidade de cada uma.
const FAIXAS_MARGEM = [0, 2, 5, 10, 20];
const FAIXAS_APURADO = [0, 20, 40, 60, 80];
const OPACIDADES = [0.22, 0.4, 0.6, 0.8, 1];

const faixa = (valor: number, limites: number[]) => {
  let i = 0;
  while (i + 1 < limites.length && valor >= limites[i + 1]) i++;
  return i;
};

const fmtPct = (n: number, casas = 1) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) + '%';

const NOMES = Object.fromEntries(UFS.map((u) => [u.sigla, u.nome]));

interface Props {
  atual: Resultados;
  numeros: string[];
  serie: (numeros: string[], n: string) => string;
}

export function Mapa({ atual, numeros, serie }: Props) {
  const [modo, setModo] = useState<Modo>('votacao');
  const [dica, setDica] = useState<{ uf: string; x: number; y: number; esquerda: boolean } | null>(null);

  const preenchimento = (r?: Resultado): { fill: string; opacity: number } => {
    if (!r) return { fill: 'var(--surface-2)', opacity: 1 };
    if (modo === 'apuracao') {
      return { fill: 'var(--accent)', opacity: OPACIDADES[faixa(r.percentualTotalizado, FAIXAS_APURADO)] };
    }
    const [a, b] = r.candidatos;
    if (!a || r.votosValidos === 0) return { fill: 'var(--neutral-bar)', opacity: 0.35 };
    const margem = a.percentual - (b?.percentual ?? 0);
    return { fill: serie(numeros, a.numero), opacity: OPACIDADES[faixa(margem, FAIXAS_MARGEM)] };
  };

  const rotulo = (r?: Resultado) => {
    if (!r) return '';
    if (modo === 'apuracao') return fmtPct(r.percentualTotalizado, 0);
    return r.votosValidos > 0 && r.candidatos[0] ? fmtPct(r.candidatos[0].percentual, 0) : '';
  };

  const mostrar = (uf: string) => (e: MouseEvent) => {
    const caixa = (e.currentTarget as SVGElement).closest('.pres-mapa-area')!.getBoundingClientRect();
    const x = e.clientX - caixa.left;
    setDica({ uf, x, y: e.clientY - caixa.top, esquerda: x > caixa.width / 2 });
  };

  const rd = dica ? atual[dica.uf] : undefined;
  const nomeCand = (n: string) => atual.br?.candidatos.find((c) => c.numero === n)?.nome ?? n;

  return (
    <section className="pres-cartao pres-mapa">
      <div className="pres-filtros">
        <h2>Mapa</h2>
        <div className="pres-abas" role="tablist" aria-label="O que o mapa mostra">
          <button type="button" role="tab" aria-selected={modo === 'votacao'} onClick={() => setModo('votacao')}>
            Quem lidera
          </button>
          <button type="button" role="tab" aria-selected={modo === 'apuracao'} onClick={() => setModo('apuracao')}>
            % apurado
          </button>
        </div>
      </div>

      <div className="pres-mapa-area" onMouseLeave={() => setDica(null)}>
        <svg
          viewBox={`0 0 ${MAPA_LARGURA} ${MAPA_ALTURA}`}
          role="img"
          aria-label={
            modo === 'votacao'
              ? 'Mapa do Brasil por estado, colorido pelo candidato que lidera e pela vantagem'
              : 'Mapa do Brasil por estado, colorido pelo percentual de seções apuradas'
          }
        >
          <g className="pres-mapa-ufs">
            {Object.entries(MAPA_UFS).map(([uf, g]) => {
              const { fill, opacity } = preenchimento(atual[uf]);
              return (
                <path
                  key={uf}
                  d={g.d}
                  style={{ fill, fillOpacity: opacity }}
                  className={dica?.uf === uf ? 'ativo' : ''}
                  onMouseMove={mostrar(uf)}
                  onClick={mostrar(uf)}
                >
                  <title>{NOMES[uf]}</title>
                </path>
              );
            })}
          </g>
          <g className="pres-mapa-rotulos" aria-hidden>
            {Object.entries(MAPA_UFS).map(([uf, g]) => {
              const [lx, ly] = g.fora ?? [g.x, g.y];
              const txt = rotulo(atual[uf]);
              return (
                <g key={uf}>
                  {g.fora && <line x1={g.x} y1={g.y} x2={lx - 4} y2={ly - 4} />}
                  <text x={lx} y={ly} textAnchor={g.fora ? 'start' : 'middle'}>
                    <tspan className="uf">{uf.toUpperCase()}</tspan>
                    {txt &&
                      (g.fora ? (
                        <tspan className="pct" dx="4">{txt}</tspan>
                      ) : (
                        <tspan className="pct" x={lx} dy="13">{txt}</tspan>
                      ))}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {dica && (
          <div
            className="pres-dica"
            style={{ left: dica.x, top: dica.y }}
            data-lado={dica.esquerda ? 'esquerda' : 'direita'}
          >
            <strong>{NOMES[dica.uf]}</strong>
            {rd ? (
              <>
                <span className="pres-dica-ap">{fmtPct(rd.percentualTotalizado, 2)} apurado</span>
                {[...rd.candidatos]
                  .sort((a, b) => numeros.indexOf(a.numero) - numeros.indexOf(b.numero))
                  .map((c) => (
                    <span key={c.numero} className="pres-dica-cand">
                      <i style={{ background: serie(numeros, c.numero) }} aria-hidden />
                      {nomeCand(c.numero)} <b>{fmtPct(c.percentual, 2)}</b>
                    </span>
                  ))}
              </>
            ) : (
              <span className="pres-dica-ap">sem dados</span>
            )}
          </div>
        )}
      </div>

      {modo === 'votacao' ? (
        <div className="pres-mapa-legenda">
          {numeros.map((n) => (
            <div key={n} className="pres-escala">
              <span className="pres-escala-nome">{nomeCand(n)} à frente por</span>
              <span className="pres-escala-cores">
                {OPACIDADES.map((o, i) => (
                  <span key={i}>
                    <i style={{ background: serie(numeros, n), opacity: o }} />
                    <small>{i === 0 ? '< 2' : i === OPACIDADES.length - 1 ? '20+' : FAIXAS_MARGEM[i]}</small>
                  </span>
                ))}
              </span>
            </div>
          ))}
          <small className="pres-escala-nota">Vantagem em pontos percentuais. O número no mapa é o % do líder no estado.</small>
        </div>
      ) : (
        <div className="pres-mapa-legenda">
          <div className="pres-escala">
            <span className="pres-escala-nome">Seções apuradas</span>
            <span className="pres-escala-cores">
              {OPACIDADES.map((o, i) => (
                <span key={i}>
                  <i style={{ background: 'var(--accent)', opacity: o }} />
                  <small>{FAIXAS_APURADO[i]}%+</small>
                </span>
              ))}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
