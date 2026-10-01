import { useState } from 'react';
import type { Leitura } from '../domain/types';
import { comZeros, formatarNumero } from '../domain/normalizar';
import { excluirLeitura } from '../services/registro';
import { dataHora, Modal, useFluxo } from './comum';

/** Confirmação de exclusão (soft delete) mostrando os votos que serão removidos. */
export function ExcluirModal({ leitura, aoFechar, aoExcluir }: { leitura: Leitura; aoFechar: () => void; aoExcluir?: () => void }) {
  const { toast } = useFluxo();
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const b = leitura.boletim;
  return (
    <Modal aoFechar={aoFechar}>
      <h2>🗑️ Excluir registro</h2>
      <p style={{ margin: 0 }}>Tem certeza que deseja excluir este registro?</p>
      <div className="msg info">
        Zona {comZeros(leitura.zona_eleitoral)} | Local {comZeros(leitura.local_votacao)}<br />
        Seção {comZeros(leitura.secao)} • Lido em {dataHora(leitura.timestamp_leitura)}
      </div>
      <div className="msg aviso">
        <strong>⚠️ Os seguintes votos serão removidos da contabilização:</strong>
        <ul>
          <li>Comparecimento: {formatarNumero(b.comparecimento)} votantes</li>
          {b.cargos.map((c) => (
            <li key={c.cargo}>
              <strong>{c.cargo}</strong>: {c.candidatos.map((k) => `${k.nome ?? `nº ${k.numero}`}: ${k.votos}`).join(' · ')} · Brancos: {c.brancos ?? 0} · Nulos: {c.nulos ?? 0}
            </li>
          ))}
        </ul>
      </div>
      <div className="campo">
        <label htmlFor="motivo">Motivo (registrado no log de auditoria)</label>
        <input id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: leitura de boletim errado" />
      </div>
      {erro && <div className="msg erro">{erro}</div>}
      <div className="acoes">
        <button className="btn" onClick={aoFechar}>Cancelar</button>
        <button
          className="btn perigo"
          onClick={async () => {
            try {
              await excluirLeitura(leitura.id, motivo.trim() || 'Exclusão manual do usuário');
              toast('✅ Registro excluído. Dashboard atualizado.');
              aoFechar();
              aoExcluir?.();
            } catch (e) {
              setErro((e as Error).message);
            }
          }}
        >
          Confirmar exclusão
        </button>
      </div>
    </Modal>
  );
}
