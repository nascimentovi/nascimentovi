import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { db } from '../db/database';
import { comZeros, formatarNumero, semAcento } from '../domain/normalizar';
import { ICONE_ENTRADA, ROTULO_ENTRADA, type Leitura, type TipoEntrada } from '../domain/types';
import { dataHora, ir, Topo } from './comum';
import { ExcluirModal } from './ExcluirModal';

export function Historico() {
  const leituras = useLiveQuery(() => db.leituras.orderBy('timestamp_leitura').reverse().toArray(), []);
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState<'todos' | 'ativo' | 'deletado'>('todos');
  const [origem, setOrigem] = useState<TipoEntrada | ''>('');
  const [data, setData] = useState('');
  const [excluir, setExcluir] = useState<Leitura | null>(null);

  const lista = useMemo(() => {
    const termos = semAcento(busca).split(/\s+/).filter(Boolean);
    return (leituras ?? []).filter((l) => {
      if (status !== 'todos' && l.status !== status) return false;
      if (origem && l.tipo_entrada !== origem) return false;
      if (data && new Date(l.timestamp_leitura).toLocaleDateString('sv') !== data) return false;
      if (!termos.length) return true;
      const alvo = semAcento(
        `${l.municipio} zona ${l.zona_eleitoral} ${comZeros(l.zona_eleitoral)} local ${l.local_votacao} ${comZeros(l.local_votacao)} secao ${l.secao} ${comZeros(l.secao)} ${l.codigo_ue}`,
      );
      return termos.every((t) => alvo.includes(t));
    });
  }, [leituras, busca, status, origem, data]);

  return (
    <>
      <Topo titulo="Histórico de leituras" />
      <main className="conteudo">
        <input className="ent" type="search" placeholder="🔍 Buscar por zona, local, seção, município…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
        <div className="filtros">
          <select className="ent" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status">
            <option value="todos">Todos</option>
            <option value="ativo">Ativos</option>
            <option value="deletado">Excluídos</option>
          </select>
          <select className="ent" value={origem} onChange={(e) => setOrigem(e.target.value as TipoEntrada | '')} aria-label="Origem">
            <option value="">Origem</option>
            {(Object.keys(ROTULO_ENTRADA) as TipoEntrada[]).map((t) => <option key={t} value={t}>{ROTULO_ENTRADA[t]}</option>)}
          </select>
          <input className="ent" type="date" value={data} onChange={(e) => setData(e.target.value)} aria-label="Data da leitura" />
        </div>
        <p className="muted" style={{ margin: 0 }}>{lista.length} registro(s)</p>

        {lista.map((l) => (
          <article key={l.id} className={`item${l.status === 'deletado' ? ' excluido' : ''}`}>
            <div className="titulo">
              <span>{l.status === 'ativo' ? '✅' : '❌'} Zona {comZeros(l.zona_eleitoral)} | Local {comZeros(l.local_votacao)}</span>
              <span className={`etiqueta ${l.status === 'ativo' ? 'ok' : 'bad'}`}>{l.status === 'ativo' ? 'ATIVO' : 'EXCLUÍDO'}</span>
            </div>
            <div className="muted">
              Seção {comZeros(l.secao)} • {dataHora(l.timestamp_leitura)} • {ICONE_ENTRADA[l.tipo_entrada]} {ROTULO_ENTRADA[l.tipo_entrada]}
              {l.municipio && <> • {l.municipio}</>}
            </div>
            {l.status === 'ativo' ? (
              <div>
                {formatarNumero(l.boletim.comparecimento)} votantes
                {l.validacao.alertas.length > 0 && <span className="etiqueta warn" style={{ marginLeft: 8 }}>⚠️ inconsistência</span>}
                {l.origem.correcoes_manuais && <span className="etiqueta" style={{ marginLeft: 8 }}>✏️ corrigido</span>}
              </div>
            ) : (
              <div className="muted">Excluído em {l.excluido_em ? dataHora(l.excluido_em) : '—'} ({l.motivo_exclusao})</div>
            )}
            <div className="linha-acoes">
              <button className="btn pequeno" onClick={() => ir(`/leitura/${encodeURIComponent(l.id)}`)}>👁 Detalhe</button>
              {l.status === 'ativo' && <button className="btn pequeno" onClick={() => setExcluir(l)}>🗑 Excluir</button>}
            </div>
          </article>
        ))}

        <button className="btn primario" onClick={() => ir('/')}>📊 Voltar à apuração</button>
        {excluir && <ExcluirModal leitura={excluir} aoFechar={() => setExcluir(null)} />}
      </main>
    </>
  );
}
