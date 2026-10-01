import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { db, lerConfig } from '../db/database';
import { agregar, aplicarFiltro, type FiltroLeituras, type ResultadoAgregadoCargo } from '../domain/agregacao';
import { comZeros, formatarNumero, formatarPct } from '../domain/normalizar';
import { ICONE_ENTRADA, ROTULO_ENTRADA, type TipoEntrada } from '../domain/types';
import { CFG_MUNICIPIOS, nomeMunicipio } from '../services/capturaQr';
import { descreverUrna } from '../services/registro';
import { ir, Topo } from './comum';

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

export function Dashboard() {
  const leituras = useLiveQuery(() => db.leituras.toArray(), []);
  const cadastro = useLiveQuery(() => db.candidatos.toArray(), []);
  const esperadas = useLiveQuery(() => lerConfig<number>('urnasEsperadas', 0), []);
  const municipios = useLiveQuery(() => lerConfig<Record<string, string>>(CFG_MUNICIPIOS, {}), []);
  const [filtro, setFiltro] = useState<FiltroLeituras>({});

  const ativas = useMemo(
    () => (leituras ?? []).filter((l) => l.status === 'ativo').map((l) => ({ ...l, municipio: nomeMunicipio(l, municipios ?? {}) })),
    [leituras, municipios],
  );
  const opcoes = useMemo(() => ({
    municipios: [...new Set(ativas.map((l) => l.municipio).filter(Boolean))].sort(),
    zonas: [...new Set(ativas.map((l) => l.zona_eleitoral))].sort((a, b) => Number(a) - Number(b)),
    locais: [...new Set(ativas.filter((l) => !filtro.zona || l.zona_eleitoral === filtro.zona).map((l) => l.local_votacao))].sort((a, b) => Number(a) - Number(b)),
  }), [ativas, filtro.zona]);
  // Registros excluídos entram só como fonte de nomes de candidatos (agregar() ignora seus votos).
  const tot = useMemo(
    () => agregar([...aplicarFiltro(ativas, filtro), ...(leituras ?? []).filter((l) => l.status !== 'ativo')], cadastro ?? []),
    [ativas, filtro, cadastro, leituras],
  );

  if (!leituras) return <Topo titulo="Dashboard de apuração" />;
  const filtrado = Object.values(filtro).some(Boolean);

  return (
    <>
      <Topo titulo="Dashboard de apuração" />
      <main className="conteudo">
        {ativas.length > 0 && (
          <div className="filtros" aria-label="Filtros">
            <select className="ent" value={filtro.municipio ?? ''} onChange={(e) => setFiltro({ ...filtro, municipio: e.target.value || undefined })} aria-label="Município">
              <option value="">Município</option>
              {opcoes.municipios.map((m) => <option key={m}>{m}</option>)}
            </select>
            <select className="ent" value={filtro.zona ?? ''} onChange={(e) => setFiltro({ ...filtro, zona: e.target.value || undefined, local: undefined })} aria-label="Zona">
              <option value="">Zona</option>
              {opcoes.zonas.map((z) => <option key={z} value={z}>{comZeros(z)}</option>)}
            </select>
            <select className="ent" value={filtro.local ?? ''} onChange={(e) => setFiltro({ ...filtro, local: e.target.value || undefined })} aria-label="Local">
              <option value="">Local</option>
              {opcoes.locais.map((z) => <option key={z} value={z}>{comZeros(z)}</option>)}
            </select>
          </div>
        )}
        {filtrado && <button className="btn link" onClick={() => setFiltro({})}>✕ Limpar filtros</button>}

        <div className="kpis">
          <Kpi
            rotulo="Urnas lidas"
            valor={esperadas ? `${formatarNumero(tot.urnas)} / ${formatarNumero(esperadas)}` : formatarNumero(tot.urnas)}
            sub={esperadas ? `${formatarPct(tot.urnas / esperadas)} das urnas` : 'Defina o total em Configurações'}
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

        <div className="acoes">
          <button className="btn primario" onClick={() => ir('/')}>➕ Ler próxima</button>
          <button className="btn" onClick={() => ir('/historico')}>🗂️ Histórico</button>
          <button className="btn" onClick={() => ir('/auditoria')}>🛡️ Auditoria</button>
          <button className="btn" onClick={() => ir('/config')}>👤 Nomes de candidatos</button>
        </div>
      </main>
    </>
  );
}
