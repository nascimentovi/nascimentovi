import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db/database';
import { comZeros, dataBr, formatarCarga, formatarNumero } from '../domain/normalizar';
import { ICONE_ENTRADA, ROTULO_ENTRADA } from '../domain/types';
import { dataHora, Topo } from './comum';
import { ExcluirModal } from './ExcluirModal';

const STATUS_EVENTO: Record<string, string> = {
  aceito: '✅ Aceito',
  rejeitado_duplicata: '⚠️ Rejeitado (duplicata)',
  substituido: '♻️ Substituição',
  excluido: '🗑️ Excluído',
};

const ok = (v: boolean | null) => (v === true ? '✅' : v === false ? '❌' : '—');

export function DetalheLeitura({ id }: { id: string }) {
  const l = useLiveQuery(() => db.leituras.get(id).then((r) => r ?? null), [id]);
  const [excluir, setExcluir] = useState(false);
  if (l === undefined) return <Topo titulo="Registro" />;
  if (l === null) {
    return (
      <>
        <Topo titulo="Registro" />
        <main className="conteudo"><div className="msg erro">Registro não encontrado.</div></main>
      </>
    );
  }
  const b = l.boletim;
  const v = l.validacao;

  return (
    <>
      <Topo titulo="Detalhe do registro" />
      <main className="conteudo">
        <div className={`msg ${l.status === 'ativo' ? 'ok' : 'erro'}`}>
          {l.status === 'ativo' ? '✅ ATIVO — votos contabilizados' : `❌ EXCLUÍDO em ${l.excluido_em ? dataHora(l.excluido_em) : '—'} — ${l.motivo_exclusao ?? ''}`}
        </div>

        <section className="cartao">
          <h2>Identificação da urna</h2>
          <dl className="dados">
            <dt>Município</dt><dd>{b.municipio || '—'}{b.uf ? ` / ${b.uf}` : ''}</dd>
            <dt>Zona</dt><dd>{comZeros(b.zona)}</dd>
            <dt>Local</dt><dd>{comZeros(b.local)}</dd>
            <dt>Seção</dt><dd>{comZeros(b.secao)}</dd>
            <dt>Código UE</dt><dd>{b.codigoUe || '—'}</dd>
            <dt>Data votação</dt><dd>{b.dataVotacao ? dataBr(b.dataVotacao) : '—'}{b.turno ? ` (${b.turno}º turno)` : ''}</dd>
            <dt>Eleitores aptos</dt><dd>{formatarNumero(b.eleitoresAptos)}</dd>
            <dt>Comparecimento</dt><dd>{formatarNumero(b.comparecimento)}</dd>
            <dt>Faltosos</dt><dd>{formatarNumero(b.faltosos)}</dd>
          </dl>
        </section>

        {b.cargos.map((c) => (
          <section className="cartao" key={c.cargo}>
            <h3>📊 {c.cargo}</h3>
            <table className="tabela">
              <thead><tr><th>Candidato</th><th>Nº</th><th className="n">Votos</th></tr></thead>
              <tbody>
                {c.candidatos.map((k) => (
                  <tr key={`${k.legenda ? 'L' : ''}${k.numero}`}><td>{k.nome ?? '—'}</td><td>{k.numero}</td><td className="n">{formatarNumero(k.votos)}</td></tr>
                ))}
                <tr><td>Votos nominais</td><td /><td className="n">{formatarNumero(c.votosNominais)}</td></tr>
                <tr><td>Brancos</td><td /><td className="n">{formatarNumero(c.brancos)}</td></tr>
                <tr><td>Nulos</td><td /><td className="n">{formatarNumero(c.nulos)}</td></tr>
                <tr><td><strong>Total apurado</strong></td><td /><td className="n"><strong>{formatarNumero(c.totalApurado)}</strong></td></tr>
              </tbody>
            </table>
          </section>
        ))}

        <section className="cartao">
          <h2>Origem e validação</h2>
          <dl className="dados">
            <dt>Origem</dt><dd>{ICONE_ENTRADA[l.tipo_entrada]} {ROTULO_ENTRADA[l.tipo_entrada]}</dd>
            {l.fonte_dados && <><dt>Arquivo</dt><dd>{l.fonte_dados}</dd></>}
            <dt>Lido em</dt><dd>{dataHora(l.timestamp_leitura)}</dd>
            {l.origem.qualidade_ocr != null && <><dt>Confiança</dt><dd>{l.origem.qualidade_ocr}%</dd></>}
            <dt>Correções manuais</dt><dd>{l.origem.correcoes_manuais ? 'Sim' : 'Não'}</dd>
            <dt>Hash QR conferido</dt><dd>{ok(v.checksum_valido)}</dd>
            <dt>Assinatura TSE</dt><dd>{v.assinatura_valida === true ? '✅ válida' : v.checksum_valido === null ? '—' : 'não verificada'}</dd>
            <dt>Totais consistentes</dt><dd>{ok(v.validacoes_estruturais.total_votos_consistente)}</dd>
            <dt>Comparecimento consistente</dt><dd>{ok(v.validacoes_estruturais.comparecimento_consistente)}</dd>
            <dt>Campos obrigatórios</dt><dd>{ok(v.validacoes_estruturais.campos_obrigatorios_completos)}</dd>
            {v.codigo_carga && <><dt>Código da carga</dt><dd className="mono">{formatarCarga(v.codigo_carga)}</dd></>}
            {v.assinatura_qr && <><dt>Assinatura/hash</dt><dd className="mono">{v.assinatura_qr}</dd></>}
            <dt>Fingerprint</dt><dd className="mono">{l.fingerprint}</dd>
          </dl>
          {v.alertas.length > 0 && (
            <div className="msg aviso" style={{ marginTop: 10 }}>
              <strong>Alertas</strong>
              <ul>{v.alertas.map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
          )}
        </section>

        <section className="cartao">
          <h2>Histórico de leituras deste boletim</h2>
          <table className="tabela">
            <tbody>
              {l.historico_leituras.map((e, i) => (
                <tr key={i}>
                  <td>{dataHora(e.timestamp)}</td>
                  <td>{ICONE_ENTRADA[e.tipo]} {ROTULO_ENTRADA[e.tipo]}</td>
                  <td>{STATUS_EVENTO[e.status] ?? e.status}{e.detalhe && <div className="muted">{e.detalhe}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {l.dados_brutos && (
          <details className="cartao">
            <summary>Dados brutos lidos</summary>
            <pre className="mono" style={{ whiteSpace: 'pre-wrap' }}>{l.dados_brutos}</pre>
          </details>
        )}

        {l.status === 'ativo' && <button className="btn perigo" onClick={() => setExcluir(true)}>🗑 Excluir registro</button>}
        {excluir && <ExcluirModal leitura={l} aoFechar={() => setExcluir(false)} />}
      </main>
    </>
  );
}
