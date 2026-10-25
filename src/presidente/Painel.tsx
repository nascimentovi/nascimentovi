import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UFS, comparar, type Comparativo, type Resultado } from '../domain/tseResultado';
import {
  ABRANGENCIAS,
  baixarResultados,
  descobrirEleicoes,
  type Eleicoes,
  type Erros,
  type Resultados,
} from '../services/tseApuracao';

const INTERVALO_S = 45;

const fmtPct = (n: number, casas = 2) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) + '%';
const fmtInt = (n: number) => n.toLocaleString('pt-BR');
const fmtPp = (n: number) =>
  (n > 0 ? '+' : n < 0 ? '−' : '±') +
  Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) +
  ' p.p.';

type Ordem = 'nome' | 'apurado' | 'margem' | 'eleitorado';

export function Painel() {
  const [eleicoes, setEleicoes] = useState<Eleicoes | null>(null);
  const [atual, setAtual] = useState<Resultados>({});
  const [primeiro, setPrimeiro] = useState<Resultados>({});
  const [erros, setErros] = useState<Erros>({});
  const [carregando, setCarregando] = useState(false);
  const [ultima, setUltima] = useState<Date | null>(null);
  const [restante, setRestante] = useState(INTERVALO_S);
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<Ordem>('eleitorado');
  const emAndamento = useRef<AbortController | null>(null);
  const contagem = useRef(INTERVALO_S);

  const atualizar = useCallback(async (ele: Eleicoes) => {
    emAndamento.current?.abort();
    const ctrl = new AbortController();
    emAndamento.current = ctrl;
    setCarregando(true);
    const { resultados, erros } = await baixarResultados(ele.segundoTurno, ABRANGENCIAS, ctrl.signal);
    if (ctrl.signal.aborted) return;
    // Mantém o último dado bom de uma UF se a requisição desta rodada falhar.
    setAtual((ant) => ({ ...ant, ...resultados }));
    setErros(erros);
    setUltima(new Date());
    contagem.current = INTERVALO_S;
    setRestante(INTERVALO_S);
    setCarregando(false);
  }, []);

  // Descobre os códigos das eleições e carrega o 1º turno (definitivo) uma vez.
  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      const ele = await descobrirEleicoes(ctrl.signal);
      if (ctrl.signal.aborted) return;
      setEleicoes(ele);
      void atualizar(ele);
      const { resultados } = await baixarResultados(ele.primeiroTurno, ABRANGENCIAS, ctrl.signal);
      if (!ctrl.signal.aborted) setPrimeiro(resultados);
    })();
    return () => ctrl.abort();
  }, [atualizar]);

  // Contagem regressiva para a próxima atualização (pausa com a aba oculta).
  useEffect(() => {
    if (!eleicoes) return;
    const id = setInterval(() => {
      if (document.hidden || contagem.current <= 0) return;
      contagem.current -= 1;
      setRestante(contagem.current);
      // Fica em 0 até a atualização terminar, que reinicia a contagem.
      if (contagem.current === 0) void atualizar(eleicoes);
    }, 1000);
    return () => clearInterval(id);
  }, [eleicoes, atualizar]);

  const brasil = atual.br;
  // Cor e posição seguem o candidato (pelo número), nunca a colocação do momento.
  const numeros = useMemo(
    () => (brasil?.candidatos ?? []).map((c) => c.numero).sort((a, b) => Number(a) - Number(b)),
    [brasil],
  );

  const estados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const linhas = UFS.filter(
      (u) => !termo || u.nome.toLowerCase().includes(termo) || u.sigla.includes(termo),
    ).map((u) => ({ ...u, r: atual[u.sigla], p: primeiro[u.sigla] }));
    const margem = (r?: Resultado) =>
      r && r.candidatos.length >= 2 ? r.candidatos[0].percentual - r.candidatos[1].percentual : -1;
    linhas.sort((a, b) => {
      switch (ordem) {
        case 'apurado':
          return (b.r?.percentualTotalizado ?? -1) - (a.r?.percentualTotalizado ?? -1);
        case 'margem':
          return margem(a.r) - margem(b.r);
        case 'eleitorado':
          return (b.r?.eleitorado ?? 0) - (a.r?.eleitorado ?? 0);
        default:
          return a.nome.localeCompare(b.nome, 'pt-BR');
      }
    });
    return linhas;
  }, [atual, primeiro, busca, ordem]);

  return (
    <div className="pres">
      <header className="pres-topo">
        <div>
          <h1>Apuração · Presidente 2026</h1>
          <p className="pres-sub">2º turno, por estado, com o comparativo do 1º turno · dados oficiais do TSE</p>
        </div>
        <div className="pres-status" aria-live="polite">
          <span className={'pres-ponto' + (carregando ? ' ativo' : '')} aria-hidden />
          {carregando
            ? 'Atualizando…'
            : ultima
              ? `Atualizado às ${ultima.toLocaleTimeString('pt-BR')} · próxima em ${restante}s`
              : 'Carregando…'}
          <button
            type="button"
            className="pres-btn"
            disabled={!eleicoes || carregando}
            onClick={() => eleicoes && void atualizar(eleicoes)}
          >
            Atualizar
          </button>
        </div>
      </header>

      {erros.br && !brasil && (
        <div className="pres-aviso">
          Não foi possível ler o resultado nacional do 2º turno ({erros.br}). O painel tenta de novo a cada{' '}
          {INTERVALO_S}s.
        </div>
      )}

      {brasil && <CartaoBrasil r={brasil} p={primeiro.br} numeros={numeros} />}

      <section className="pres-estados">
        <div className="pres-filtros">
          <h2>Por estado</h2>
          <input
            type="search"
            placeholder="Buscar UF"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar estado"
          />
          <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} aria-label="Ordenar por">
            <option value="eleitorado">Maior eleitorado</option>
            <option value="nome">Nome</option>
            <option value="apurado">Mais apurado</option>
            <option value="margem">Disputa mais apertada</option>
          </select>
        </div>
        <Legenda r={brasil} numeros={numeros} />
        <ul className="pres-lista">
          {estados.map((u) => (
            <LinhaEstado key={u.sigla} sigla={u.sigla} nome={u.nome} r={u.r} p={u.p} numeros={numeros} erro={erros[u.sigla]} />
          ))}
        </ul>
      </section>

      <footer className="pres-rodape">
        Fonte: <a href="https://resultados.tse.jus.br/" target="_blank" rel="noreferrer">resultados.tse.jus.br</a>
        {eleicoes && ` · eleições ${eleicoes.primeiroTurno} (1º turno) e ${eleicoes.segundoTurno} (2º turno)`}
        {brasil?.totalizacao && ` · última totalização do TSE: ${brasil.totalizacao}`}. Percentuais sobre votos
        válidos. No 1º turno, o percentual é o do candidato entre todos os concorrentes.
      </footer>
    </div>
  );
}

function ordenar(cs: Comparativo[], numeros: string[]): Comparativo[] {
  return [...cs].sort((a, b) => numeros.indexOf(a.numero) - numeros.indexOf(b.numero));
}

const serie = (numeros: string[], n: string) => {
  const i = numeros.indexOf(n);
  return i < 0 ? 'var(--neutral-bar)' : `var(--cand-${Math.min(i, 1) + 1})`;
};

function Legenda({ r, numeros }: { r?: Resultado; numeros: string[] }) {
  if (!r) return null;
  return (
    <div className="pres-legenda">
      {numeros.map((n) => {
        const c = r.candidatos.find((x) => x.numero === n)!;
        return (
          <span key={n}>
            <i style={{ background: serie(numeros, n) }} aria-hidden /> {c.nome} ({c.numero})
          </span>
        );
      })}
    </div>
  );
}

function Barra({ cs, numeros }: { cs: Comparativo[]; numeros: string[] }) {
  return (
    <div className="pres-barra" role="img" aria-label={cs.map((c) => `${c.nome} ${fmtPct(c.agora)}`).join(', ')}>
      {cs.map((c) => (
        <span
          key={c.numero}
          style={{ flexBasis: `${c.agora}%`, background: serie(numeros, c.numero) }}
          title={`${c.nome}: ${fmtPct(c.agora)} · ${fmtInt(c.votosAgora)} votos`}
        />
      ))}
      <b className="pres-meio" aria-hidden />
    </div>
  );
}

function Variacao({ c }: { c: Comparativo }) {
  if (c.primeiroTurno === null || c.variacao === null) return <span className="pres-1t">1º turno: —</span>;
  const cls = c.variacao > 0.05 ? 'sobe' : c.variacao < -0.05 ? 'desce' : '';
  return (
    <span className="pres-1t" title={`1º turno: ${fmtInt(c.votosPrimeiroTurno ?? 0)} votos`}>
      1º turno {fmtPct(c.primeiroTurno, 1)} <em className={cls}>{c.variacao > 0 ? '▲' : c.variacao < 0 ? '▼' : ''} {fmtPp(c.variacao)}</em>
    </span>
  );
}

function CartaoBrasil({ r, p, numeros }: { r: Resultado; p?: Resultado; numeros: string[] }) {
  const cs = ordenar(comparar(r, p), numeros);
  const lider = r.candidatos[0];
  return (
    <section className="pres-cartao pres-br">
      <div className="pres-br-cab">
        <h2>Brasil</h2>
        <span className="pres-apurado">
          <strong>{fmtPct(r.percentualTotalizado)}</strong> das seções totalizadas
          <small> ({fmtInt(r.secoesTotalizadas)} de {fmtInt(r.secoesTotal)})</small>
        </span>
      </div>
      <div className="pres-progresso" aria-hidden>
        <span style={{ width: `${r.percentualTotalizado}%` }} />
      </div>
      <div className="pres-cands">
        {cs.map((c) => (
          <div key={c.numero} className="pres-cand">
            <div className="pres-cand-nome">
              <i style={{ background: serie(numeros, c.numero) }} aria-hidden />
              <span>
                {c.nome} <small>{c.partido} · {c.numero}</small>
              </span>
              {r.final && lider?.numero === c.numero && lider.situacao && <b className="pres-eleito">{lider.situacao}</b>}
            </div>
            <div className="pres-cand-pct">{fmtPct(c.agora)}</div>
            <div className="pres-cand-votos">{fmtInt(c.votosAgora)} votos</div>
            <Variacao c={c} />
          </div>
        ))}
      </div>
      <Barra cs={cs} numeros={numeros} />
      {cs.length >= 2 && r.votosValidos > 0 && (
        <p className="pres-dif">
          Diferença: <strong>{fmtInt(Math.abs(cs[0].votosAgora - cs[1].votosAgora))} votos</strong> (
          {fmtPp(Math.abs(cs[0].agora - cs[1].agora)).replace(/^[+−±]/, '')})
        </p>
      )}
      <dl className="pres-numeros">
        <div><dt>Comparecimento</dt><dd>{fmtInt(r.comparecimento)}</dd></div>
        <div><dt>Abstenção</dt><dd>{fmtInt(r.abstencao)}</dd></div>
        <div><dt>Brancos</dt><dd>{fmtInt(r.brancos)}</dd></div>
        <div><dt>Nulos</dt><dd>{fmtInt(r.nulos)}</dd></div>
      </dl>
    </section>
  );
}

function LinhaEstado(props: {
  sigla: string;
  nome: string;
  r?: Resultado;
  p?: Resultado;
  numeros: string[];
  erro?: string;
}) {
  const { sigla, nome, r, p, numeros, erro } = props;
  if (!r) {
    return (
      <li className="pres-cartao pres-uf vazio">
        <div className="pres-uf-cab">
          <span className="pres-sigla">{sigla.toUpperCase()}</span> {nome}
          <span className="pres-apurado">{erro ? `sem dados (${erro})` : 'carregando…'}</span>
        </div>
      </li>
    );
  }
  const cs = ordenar(comparar(r, p), numeros.length ? numeros : r.candidatos.map((c) => c.numero));
  const lider = r.votosValidos > 0 ? r.candidatos[0]?.numero : undefined;
  return (
    <li className="pres-cartao pres-uf">
      <div className="pres-uf-cab">
        <span className="pres-sigla">{sigla.toUpperCase()}</span> {nome}
        <span className="pres-apurado">
          <strong>{fmtPct(r.percentualTotalizado, 1)}</strong> apurado
        </span>
      </div>
      <Barra cs={cs} numeros={numeros} />
      <div className="pres-uf-cands">
        {cs.map((c) => (
          <div key={c.numero} className={c.numero === lider ? 'lider' : ''}>
            <span className="pres-uf-nome">
              <i style={{ background: serie(numeros, c.numero) }} aria-hidden />
              {c.nome}
            </span>
            <span className="pres-uf-pct">{fmtPct(c.agora)}</span>
            <Variacao c={c} />
          </div>
        ))}
      </div>
    </li>
  );
}
