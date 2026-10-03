import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { db, lerConfig } from '../db/database';
import { agregar, aplicarFiltro, type FiltroLeituras, type ResultadoAgregadoCargo } from '../domain/agregacao';
import { eleicaoDoBoletim, turnoDoBoletim } from '../domain/eleicao';
import { localDaLeitura, progressoSecoes, type ProgressoSecoes } from '../domain/locais';
import { comZeros, formatarNumero, formatarPct } from '../domain/normalizar';
import { ICONE_ENTRADA, ROTULO_ENTRADA, type TipoEntrada } from '../domain/types';
import { descreverUrna } from '../services/registro';

function Kpi({ rotulo, valor, sub, medidor }: { rotulo: string; valor: string; sub?: string; medidor?: number }) {
  return (
    <div className="kpi">
      <div className="rot">{rotulo}</div>
      <div className="val">{valor}</div>
      {sub && <div className="sub">{sub}</div>}
      {medidor !== undefined && (
        <div className="medidor" aria-hidden><div style={{ width: `${Math.min(100, medidor * 100)}%` }} /></div>
      )}
    </div>
  );
}

function CartaoCargo({ c }: { c: ResultadoAgregadoCargo }) {
  const [base, setBase] = useState<'validos' | 'total'>('validos');
  const denom = base === 'validos' ? c.validos : c.totalApurado;
  const max = Math.max(1, ...c.candidatos.map((x) => x.votos), base === 'total' ? Math.max(c.brancos, c.nulos) : 0);
  const pct = (v: number) => (denom ? v / denom : 0);
  const linha = (chave: string, nome: string, sub: string, votos: number, neutra = false, comPct = true) => (
    <tr key={chave}>
      <td>
        <div className="nome">{nome} {sub && <span className="num">{sub}</span>}</div>
        <div className={`barra${neutra ? ' neutra' : ''}`} title={`${nome}: ${formatarNumero(votos)} votos${comPct ? ` (${formatarPct(pct(votos))})` : ''}`}>
          <div style={{ width: `${(votos / max) * 100}%` }} />
        </div>
      </td>
      <td className="votos">{formatarNumero(votos)}</td>
      <td className="pct">{comPct ? formatarPct(pct(votos)) : '—'}</td>
    </tr>
  );
  return (
    <section className="cartao">
      <div className="cab-cargo">
        <h2>🗳️ {c.cargo}</h2>
        <div className="alternar" role="group" aria-label="Base do percentual">
          <button className={base === 'validos' ? 'ativo' : ''} onClick={() => setBase('validos')}>% válidos</button>
          <button className={base === 'total' ? 'ativo' : ''} onClick={() => setBase('total')}>% total</button>
        </div>
      </div>
      <table className="resultado">
        <tbody>
          {c.candidatos.map((x) => linha(`${x.legenda ? 'L' : ''}${x.numero}`, x.nome, x.legenda || x.semNome ? '' : `nº ${x.numero}`, x.votos))}
          <tr className="sep"><td colSpan={3} /></tr>
          {linha('b', 'Brancos', '', c.brancos, true, base === 'total')}
          {linha('n', 'Nulos', '', c.nulos, true, base === 'total')}
        </tbody>
      </table>
      <p className="muted" style={{ marginBottom: 0 }}>
        Válidos: {formatarNumero(c.validos)} · Total apurado: {formatarNumero(c.totalApurado)} · {c.urnas} urna(s)
      </p>
    </section>
  );
}

/** Contador de seções lidas × faltantes (Conchal), com o detalhe por local. */
function ContadorSecoes({ p }: { p: ProgressoSecoes }) {
  const pct = p.total ? p.lidas / p.total : 0;
  return (
    <section className="cartao contador">
      <h2>📋 Seções de Conchal</h2>
      <div className="contador-nums">
        <div><span className="val">{p.lidas}</span><span className="rot">lidas</span></div>
        <div><span className="val">{p.faltam}</span><span className="rot">faltam</span></div>
        <div><span className="val">{p.total}</span><span className="rot">total</span></div>
      </div>
      <div className="medidor grande" role="progressbar" aria-valuenow={p.lidas} aria-valuemin={0} aria-valuemax={p.total} aria-label="Seções lidas">
        <div style={{ width: `${pct * 100}%` }} />
      </div>
      <p className="muted" style={{ margin: '4px 0 0' }}>{formatarPct(pct)} das seções apuradas</p>
      <details>
        <summary>Ver por local de votação</summary>
        <ul className="lista-locais">
          {p.porLocal.map((l) => (
            <li key={l.local}>
              <div className="titulo-local">
                <span><strong>{l.local}</strong> – {l.escola} <span className="muted">({l.bairro})</span></span>
                <span className={`etiqueta ${l.faltantes.length ? '' : 'ok'}`}>{l.lidas.length}/{l.total}</span>
              </div>
              <div className="medidor"><div style={{ width: `${(l.lidas.length / l.total) * 100}%` }} /></div>
              <div className="muted">
                {l.faltantes.length ? <>Faltam: {l.faltantes.join(', ')}</> : '✅ Todas as seções lidas'}
              </div>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/** Valor de filtro que significa "todas as eleições / todos os turnos". */
const TODOS = '*';

/** Painel de apuração (totais, filtros e resultados por cargo), exibido na tela inicial. */
export function PainelApuracao() {
  const leituras = useLiveQuery(() => db.leituras.toArray(), []);
  const cadastro = useLiveQuery(() => db.candidatos.toArray(), []);
  const esperadas = useLiveQuery(() => lerConfig<number>('urnasEsperadas', 0), []);
  const [filtro, setFiltro] = useState<FiltroLeituras>({});

  const ativas = useMemo(() => (leituras ?? []).filter((l) => l.status === 'ativo'), [leituras]);
  // Eleição e turno: por padrão, os mais recentes lidos (não faz sentido somar eleições/turnos diferentes).
  const eleicoes = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of ativas) {
      const e = eleicaoDoBoletim(l.boletim);
      if (e) m.set(e.chave, e.rotulo);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([chave, rotulo]) => ({ chave, rotulo }));
  }, [ativas]);
  const eleicaoEf = filtro.eleicao === TODOS ? undefined : (filtro.eleicao ?? eleicoes[0]?.chave);
  const naEleicao = useMemo(() => ativas.filter((l) => !eleicaoEf || eleicaoDoBoletim(l.boletim)?.chave === eleicaoEf), [ativas, eleicaoEf]);
  const turnos = useMemo(
    () => [...new Set(naEleicao.map((l) => turnoDoBoletim(l.boletim)).filter((t): t is '1' | '2' => !!t))].sort().reverse(),
    [naEleicao],
  );
  // Com "todas as eleições", o padrão também é todos os turnos.
  const turnoPadrao = filtro.eleicao === TODOS ? undefined : turnos[0];
  const turnoEf = filtro.turno === TODOS ? undefined : (filtro.turno ?? turnoPadrao);
  const base = useMemo(() => naEleicao.filter((l) => !turnoEf || turnoDoBoletim(l.boletim) === turnoEf), [naEleicao, turnoEf]);
  const filtroEf: FiltroLeituras = { ...filtro, eleicao: eleicaoEf, turno: turnoEf };

  // Contador de seções de Conchal: considera a eleição e o turno escolhidos.
  const progresso = useMemo(() => progressoSecoes(base), [base]);

  // Opções em cascata: município → bairro → local de votação → seção.
  const opcoes = useMemo(() => {
    const ordenar = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
    const noMunicipio = base.filter((l) => !filtro.municipio || l.municipio === filtro.municipio);
    const noBairro = noMunicipio.filter((l) => !filtro.bairro || localDaLeitura(l)?.bairro === filtro.bairro);
    const noLocal = noBairro.filter((l) => !filtro.local || l.local_votacao === filtro.local);
    const escolas = new Map(noBairro.map((l) => [l.local_votacao, localDaLeitura(l)?.escola]));
    return {
      municipios: [...new Set(base.map((l) => l.municipio).filter(Boolean))].sort(),
      bairros: [...new Set(noMunicipio.map((l) => localDaLeitura(l)?.bairro ?? ''))].filter(Boolean).sort(),
      locais: ordenar(noBairro.map((l) => l.local_votacao)).map((local) => ({ local, escola: escolas.get(local) })),
      secoes: ordenar(noLocal.map((l) => l.secao)),
    };
  }, [base, filtro.municipio, filtro.bairro, filtro.local]);
  // Registros excluídos entram só como fonte de nomes de candidatos (agregar() ignora seus votos).
  const tot = useMemo(
    () => agregar([...aplicarFiltro(ativas, filtroEf), ...(leituras ?? []).filter((l) => l.status !== 'ativo')], cadastro ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ativas, JSON.stringify(filtroEf), cadastro, leituras],
  );

  if (!leituras) return null;
  const filtrado = Object.values(filtro).some(Boolean);

  return (
    <>
        {ativas.length > 0 && (
          <div className="filtros par" aria-label="Eleição e turno">
            <select className="ent" value={filtro.eleicao ?? ''} onChange={(e) => setFiltro({ eleicao: e.target.value || undefined })} aria-label="Eleição">
              {eleicoes.map((e, i) => <option key={e.chave} value={i === 0 ? '' : e.chave}>{e.rotulo}</option>)}
              {eleicoes.length > 1 && <option value={TODOS}>Todas as eleições</option>}
            </select>
            <select className="ent" value={filtro.turno ?? ''} onChange={(e) => setFiltro({ eleicao: filtro.eleicao, turno: e.target.value || undefined })} aria-label="Turno">
              {turnos.map((t) => <option key={t} value={!filtro.turno && t === turnoPadrao ? '' : t}>{t}º turno</option>)}
              <option value={!filtro.turno && !turnoPadrao ? '' : TODOS}>{turnos.length ? 'Todos os turnos' : 'Turno não identificado'}</option>
            </select>
          </div>
        )}
        {ativas.length > 0 && (
          <div className={`filtros duas${opcoes.bairros.length ? ' com-bairro' : ''}`} aria-label="Filtros">
            <select className="ent" value={filtro.municipio ?? ''} onChange={(e) => setFiltro({ eleicao: filtro.eleicao, turno: filtro.turno, municipio: e.target.value || undefined })} aria-label="Município">
              <option value="">Município</option>
              {opcoes.municipios.map((m) => <option key={m}>{m}</option>)}
            </select>
            {opcoes.bairros.length > 0 && (
              <select className="ent" value={filtro.bairro ?? ''} onChange={(e) => setFiltro({ eleicao: filtro.eleicao, turno: filtro.turno, municipio: filtro.municipio, bairro: e.target.value || undefined })} aria-label="Bairro">
                <option value="">Bairro</option>
                {opcoes.bairros.map((b) => <option key={b}>{b}</option>)}
              </select>
            )}
            <select className="ent largo" value={filtro.local ?? ''} onChange={(e) => setFiltro({ ...filtro, local: e.target.value || undefined, secao: undefined })} aria-label="Local de votação">
              <option value="">Local de votação</option>
              {opcoes.locais.map(({ local, escola }) => <option key={local} value={local}>{comZeros(local)}{escola ? ` – ${escola}` : ''}</option>)}
            </select>
            <select className="ent largo" value={filtro.secao ?? ''} onChange={(e) => setFiltro({ ...filtro, secao: e.target.value || undefined })} aria-label="Seção">
              <option value="">Seção</option>
              {opcoes.secoes.map((z) => <option key={z} value={z}>Seção {comZeros(z)}</option>)}
            </select>
          </div>
        )}
        {filtrado && <button className="btn link" onClick={() => setFiltro({})}>✕ Limpar filtros</button>}

        {progresso && <ContadorSecoes p={progresso} />}

        <div className="kpis">
          <Kpi
            rotulo="Urnas lidas"
            valor={esperadas ? `${formatarNumero(tot.urnas)} / ${formatarNumero(esperadas)}` : formatarNumero(tot.urnas)}
            sub={esperadas ? `${formatarPct(tot.urnas / esperadas)} das urnas` : undefined}
            medidor={esperadas ? tot.urnas / esperadas : undefined}
          />
          <Kpi rotulo="Eleitores aptos" valor={formatarNumero(tot.eleitoresAptos)} />
          <Kpi rotulo="Comparecimento" valor={formatarPct(tot.taxaComparecimento)} sub={`${formatarNumero(tot.comparecimento)} votantes`} medidor={tot.taxaComparecimento} />
          <Kpi rotulo="Abstenção" valor={formatarPct(tot.taxaAbstencao)} sub={`${formatarNumero(tot.faltosos)} faltosos`} medidor={tot.taxaAbstencao} />
        </div>

        {tot.urnas > 0 && (
          <p className="muted" style={{ margin: 0 }}>
            Origem: {(Object.entries(tot.porOrigem) as [TipoEntrada, number][]).map(([t, n]) => `${ICONE_ENTRADA[t]} ${ROTULO_ENTRADA[t]}: ${n}`).join(' · ')}
          </p>
        )}

        {tot.comAlertas.length > 0 && (
          <div className="msg aviso">
            <strong>⚠️ {tot.comAlertas.length} urna(s) com inconsistências</strong>
            <ul>
              {tot.comAlertas.slice(0, 5).map((l) => (
                <li key={l.id}>
                  <a href={`#/leitura/${encodeURIComponent(l.id)}`}>{descreverUrna(l)}</a>: {l.validacao.alertas[0]}
                </li>
              ))}
            </ul>
          </div>
        )}

        {tot.urnas === 0 ? (
          <div className="msg info">Nenhuma urna contabilizada{filtrado ? ' com esses filtros' : ' ainda'}.</div>
        ) : (
          tot.cargos.map((c) => <CartaoCargo key={c.cargo} c={c} />)
        )}

    </>
  );
}
