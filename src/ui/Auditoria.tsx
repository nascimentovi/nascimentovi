import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { comZeros } from '../domain/normalizar';
import { ICONE_ENTRADA, ROTULO_ENTRADA, type Leitura } from '../domain/types';
import { exportarBackupJson, exportarLeiturasCsv, exportarResultadosCsv } from '../services/exportacao';
import { descreverUrna } from '../services/registro';
import { dataHora, Topo } from './comum';

export function Auditoria() {
  const dados = useLiveQuery(async () => ({
    leituras: await db.leituras.toArray(),
    exclusoes: await db.historico_exclusoes.orderBy('timestamp_exclusao').reverse().toArray(),
    descartes: await db.descartes.orderBy('timestamp').reverse().toArray(),
  }), []);
  if (!dados) return <Topo titulo="Validação e auditoria" />;

  const ativos = dados.leituras.filter((l) => l.status === 'ativo');
  const excluidos = dados.leituras.filter((l) => l.status === 'deletado');
  const inconsistentes = ativos.filter((l) => l.validacao.alertas.length);
  const semHash = ativos.filter((l) => l.validacao.checksum_valido === false);
  const corrigidos = ativos.filter((l) => l.origem.correcoes_manuais);
  const porId = new Map<string, Leitura>(dados.leituras.map((l) => [l.id, l]));

  return (
    <>
      <Topo titulo="Validação e auditoria" />
      <main className="conteudo">
        <section className="cartao">
          <h2>Sumário de integridade</h2>
          <table className="tabela">
            <tbody>
              <tr><td>✅ Registros válidos (ativos)</td><td className="n">{ativos.length}</td></tr>
              <tr><td>🗑️ Registros excluídos</td><td className="n">{excluidos.length}</td></tr>
              <tr><td>🚫 Leituras descartadas</td><td className="n">{dados.descartes.length}</td></tr>
              <tr><td>⚠️ Possíveis inconsistências</td><td className="n">{inconsistentes.length}</td></tr>
              <tr><td>✏️ Com correção manual</td><td className="n">{corrigidos.length}</td></tr>
              <tr><td>🔓 Hash do QR não conferido</td><td className="n">{semHash.length}</td></tr>
            </tbody>
          </table>
        </section>

        {inconsistentes.length > 0 && (
          <section className="cartao">
            <h2>⚠️ Inconsistências</h2>
            {inconsistentes.map((l) => (
              <div key={l.id} style={{ marginBottom: 8 }}>
                <a href={`#/leitura/${encodeURIComponent(l.id)}`}>{descreverUrna(l)}</a>
                <ul className="muted" style={{ margin: '2px 0 0', paddingLeft: 18 }}>{l.validacao.alertas.map((a) => <li key={a}>{a}</li>)}</ul>
              </div>
            ))}
          </section>
        )}

        <section className="cartao">
          <h2>Log de exclusões</h2>
          {dados.exclusoes.length === 0 ? <p className="muted">Nenhuma exclusão.</p> : (
            <div className="rolagem">
              <table className="tabela">
                <thead><tr><th>Quando</th><th>Urna</th><th>Motivo</th></tr></thead>
                <tbody>
                  {dados.exclusoes.map((e) => {
                    const l = porId.get(e.leitura_id);
                    return (
                      <tr key={e.id}>
                        <td>{dataHora(e.timestamp_exclusao)}</td>
                        <td>{l ? <a href={`#/leitura/${encodeURIComponent(l.id)}`}>Z{comZeros(l.zona_eleitoral)} S{comZeros(l.secao)}</a> : e.leitura_id}</td>
                        <td>{e.motivo}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="cartao">
          <h2>Leituras descartadas</h2>
          {dados.descartes.length === 0 ? <p className="muted">Nenhum descarte.</p> : (
            <div className="rolagem">
              <table className="tabela">
                <thead><tr><th>Quando</th><th>Origem</th><th>Boletim</th><th>Motivo</th></tr></thead>
                <tbody>
                  {dados.descartes.map((d) => (
                    <tr key={d.id}>
                      <td>{dataHora(d.timestamp)}</td>
                      <td>{ICONE_ENTRADA[d.tipo_entrada]} {ROTULO_ENTRADA[d.tipo_entrada]}</td>
                      <td>{d.leitura_relacionada ? <a href={`#/leitura/${encodeURIComponent(d.leitura_relacionada)}`}>{d.resumo}</a> : d.resumo}</td>
                      <td>{d.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="cartao">
          <h2>Exportar</h2>
          <div className="acoes uma">
            <button className="btn" onClick={exportarResultadosCsv}>📊 Resultados consolidados (CSV)</button>
            <button className="btn" onClick={exportarLeiturasCsv}>🗂️ Todas as leituras (CSV)</button>
            <button className="btn" onClick={exportarBackupJson}>💾 Backup completo (JSON)</button>
          </div>
        </section>
      </main>
    </>
  );
}
