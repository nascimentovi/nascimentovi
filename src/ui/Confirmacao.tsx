import { useEffect, useRef, useState } from 'react';
import { comZeros, dataBr, formatarNumero } from '../domain/normalizar';
import { ICONE_ENTRADA, ROTULO_ENTRADA, type Captura, type Leitura } from '../domain/types';
import { prepararCaptura, registrarDescarte, salvarCaptura, type Preparo } from '../services/registro';
import { dataHora, ir, Modal, ROTA_METODO, sinalizar, Topo, useFluxo } from './comum';
import { TabelaComparacao } from './TabelaComparacao';

type Estado =
  | { fase: 'verificando' }
  | { fase: 'erro'; mensagens: string[]; preparo: Preparo | null }
  | { fase: 'duplicata'; preparo: Preparo }
  | { fase: 'salvo'; leitura: Leitura; alertas: string[] };

const MOTIVO: Record<string, string> = {
  fingerprint: 'Mesmo fingerprint (conteúdo idêntico)',
  codigo_carga: 'Mesmo código de identificação da carga',
  mesma_urna: 'Mesma urna (zona + seção + data)',
};

/**
 * Etapas 3–7 do fluxo principal: validação estrutural, verificação de
 * duplicata, contabilização e feedback ao usuário.
 */
export function Confirmacao() {
  const { pendente, limpar, toast } = useFluxo();
  const [captura, setCaptura] = useState<Captura | null>(pendente);
  const [estado, setEstado] = useState<Estado>({ fase: 'verificando' });
  const [comparar, setComparar] = useState(false);
  const [confirmarSubst, setConfirmarSubst] = useState(false);
  const executado = useRef(false);

  async function salvar(c: Captura, preparo: Preparo, substituirId?: string) {
    try {
      const leitura = await salvarCaptura(c, preparo, { substituirId });
      sinalizar('ok');
      limpar();
      setEstado({ fase: 'salvo', leitura, alertas: leitura.validacao.alertas });
    } catch (e) {
      sinalizar('aviso');
      setEstado({ fase: 'erro', mensagens: [(e as Error).message], preparo });
    }
  }

  /** Validação estrutural, duplicidade e gravação. */
  async function verificar(c: Captura) {
    setCaptura(c);
    setEstado({ fase: 'verificando' });
    try {
      const preparo = await prepararCaptura(c);
      if (preparo.validacao.erros.length) {
        sinalizar('aviso');
        setEstado({ fase: 'erro', mensagens: preparo.validacao.erros, preparo });
      } else if (preparo.duplicata) {
        sinalizar('aviso');
        setEstado({ fase: 'duplicata', preparo });
      } else {
        await salvar(c, preparo);
      }
    } catch (e) {
      setEstado({ fase: 'erro', mensagens: [(e as Error).message], preparo: null });
    }
  }

  useEffect(() => {
    if (executado.current) return;
    executado.current = true;
    if (!captura) {
      ir('/');
      return;
    }
    void verificar(captura);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!captura) return null;
  const b = captura.boletim;
  const metodo = ROTA_METODO[captura.tipo];

  if (estado.fase === 'verificando') {
    return (
      <>
        <Topo titulo="Verificando…" semVoltar />
        <main className="conteudo"><div className="msg info">🔄 Validando e verificando duplicidade…</div></main>
      </>
    );
  }

  if (estado.fase === 'erro') {
    const editavel = captura.tipo !== 'qr_code';
    return (
      <>
        <Topo titulo="Não contabilizado" semVoltar />
        <main className="conteudo">
          <div className="msg erro" role="alert">
            <strong>❌ O boletim não pôde ser contabilizado</strong>
            <ul>{estado.mensagens.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
          <div className="acoes">
            <button
              className="btn"
              onClick={async () => {
                await registrarDescarte(captura, estado.preparo, `Erro de validação: ${estado.mensagens.join(' ')}`);
                limpar();
                ir(metodo);
              }}
            >
              Descartar
            </button>
            {editavel ? (
              <button className="btn primario" onClick={() => ir('/revisar')}>✏️ Corrigir dados</button>
            ) : (
              <button className="btn primario" onClick={() => { limpar(); ir(metodo); }}>Ler novamente</button>
            )}
          </div>
        </main>
      </>
    );
  }

  if (estado.fase === 'duplicata') {
    const d = estado.preparo.duplicata!;
    const r = d.registro;
    return (
      <>
        <Topo titulo="Boletim já processado" semVoltar />
        <main className="conteudo">
          <div className={`msg ${d.divergente ? 'erro' : 'aviso'}`} role="alert">
            <strong>⚠️ Este boletim já foi contabilizado!</strong>
            {d.divergente && (
              <p style={{ margin: '6px 0 0' }}>
                🔴 <strong>Há divergências</strong> entre a leitura atual e o registro existente — possível alteração ou erro de leitura. Compare os detalhes.
              </p>
            )}
          </div>
          <section className="cartao">
            <dl className="dados">
              <dt>Urna</dt><dd>Zona {comZeros(r.zona_eleitoral)} | Local {comZeros(r.local_votacao)} | Seção {comZeros(r.secao)}</dd>
              {r.codigo_ue && <><dt>Código UE</dt><dd>{r.codigo_ue}</dd></>}
              <dt>Processado via</dt><dd>{ICONE_ENTRADA[r.tipo_entrada]} {ROTULO_ENTRADA[r.tipo_entrada]}</dd>
              <dt>Em</dt><dd>{dataHora(r.timestamp_leitura)}</dd>
              <dt>Tentativa atual</dt><dd>{ICONE_ENTRADA[captura.tipo]} {ROTULO_ENTRADA[captura.tipo]}</dd>
              <dt>Critério</dt><dd>{MOTIVO[d.motivo]}</dd>
              <dt>Votantes</dt><dd>{formatarNumero(r.boletim.comparecimento)} processados</dd>
            </dl>
          </section>
          <section className="cartao">
            <h3>Comparação</h3>
            <TabelaComparacao diferencas={d.diferencas} resumido={!comparar} />
            <button className="btn link" onClick={() => setComparar(!comparar)}>{comparar ? 'Mostrar resumo' : '🔍 Comparar todos os detalhes'}</button>
          </section>
          <div className="acoes">
            <button
              className="btn"
              onClick={async () => {
                await registrarDescarte(captura, estado.preparo, `Duplicata (${MOTIVO[d.motivo]})${d.divergente ? ' com divergências' : ''}`);
                limpar();
                toast('Leitura duplicada descartada.');
                ir(metodo);
              }}
            >
              🗑️ Descartar
            </button>
            <button className="btn" onClick={() => ir(`/leitura/${encodeURIComponent(r.id)}`)}>👁 Ver registro</button>
          </div>
          <button className="btn aviso" onClick={() => setConfirmarSubst(true)}>♻️ Substituir registro anterior*</button>
          <p className="muted">
            *Só use se tiver certeza de que a leitura atual é a correta: o registro anterior será excluído (soft delete, com log de auditoria) e esta leitura será contabilizada no lugar. Os votos nunca são somados duas vezes.
          </p>
          {confirmarSubst && (
            <Modal aoFechar={() => setConfirmarSubst(false)}>
              <h2>♻️ Substituir registro?</h2>
              <p>O registro lido via {ROTULO_ENTRADA[r.tipo_entrada]} em {dataHora(r.timestamp_leitura)} será excluído e substituído pela leitura atual ({ROTULO_ENTRADA[captura.tipo]}).</p>
              <div className="acoes">
                <button className="btn" onClick={() => setConfirmarSubst(false)}>Cancelar</button>
                <button className="btn perigo" onClick={() => { setConfirmarSubst(false); void salvar(captura, estado.preparo, r.id); }}>Confirmar</button>
              </div>
            </Modal>
          )}
        </main>
      </>
    );
  }

  // Sucesso
  const l = estado.leitura;
  return (
    <>
      <Topo titulo="Contabilizado" semVoltar />
      <main className="conteudo">
        <div className="sucesso-grande" aria-hidden>✅</div>
        <div className="msg ok" role="status">
          <strong>Urna #{comZeros(l.secao)} contabilizada</strong> — Zona {comZeros(l.zona_eleitoral)} | Local {comZeros(l.local_votacao)}
          {b.dataVotacao && <> · {dataBr(b.dataVotacao)}</>}
        </div>
        {l.validacao.checksum_valido === true && <div className="msg ok">🔐 Código verificador (hash) do QR Code conferido.</div>}
        {l.validacao.assinatura_valida === true && <div className="msg ok">✍️ Assinatura digital do TSE válida.</div>}
        {l.validacao.checksum_valido === true && l.validacao.assinatura_valida == null && (
          <div className="msg info">✍️ Assinatura digital do TSE não verificada (chave pública indisponível sem internet).</div>
        )}
        {estado.alertas.length > 0 && (
          <div className="msg aviso">
            <strong>Inconsistências registradas (aparecem no dashboard):</strong>
            <ul>{estado.alertas.map((a) => <li key={a}>{a}</li>)}</ul>
          </div>
        )}
        <section className="cartao">
          <h3>Resumo dos votos lidos</h3>
          <dl className="dados" style={{ marginBottom: 10 }}>
            <dt>Eleitores aptos</dt><dd>{formatarNumero(b.eleitoresAptos)}</dd>
            <dt>Comparecimento</dt><dd>{formatarNumero(b.comparecimento)}</dd>
            <dt>Faltosos</dt><dd>{formatarNumero(b.faltosos)}</dd>
          </dl>
          {b.cargos.map((c) => (
            <div key={c.cargo} style={{ marginBottom: 8 }}>
              <strong>{c.cargo}</strong>
              <div className="muted">
                {c.candidatos.map((k) => `${k.nome ? `${k.nome} ` : ''}(${k.numero}): ${k.votos}`).join(' · ')}
                {' · '}Brancos: {c.brancos ?? 0} · Nulos: {c.nulos ?? 0}
              </div>
            </div>
          ))}
        </section>
        <button className="btn primario" onClick={() => ir(metodo)}>➡️ Ler próximo</button>
        <div className="acoes">
          <button className="btn" onClick={() => ir('/')}>📊 Apuração</button>
          <button className="btn" onClick={() => ir('/historico')}>🗂️ Histórico</button>
        </div>
      </main>
    </>
  );
}
