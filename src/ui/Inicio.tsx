import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { formatarNumero } from '../domain/normalizar';
import { ir, Topo } from './comum';

const METODOS = [
  { rota: '/qr', icone: '📱', titulo: 'Ler QR Code', desc: 'Aponte para o QR Code do boletim de urna' },
  { rota: '/pdf', icone: '📄', titulo: 'Fazer upload de PDF', desc: 'Selecione o arquivo do boletim' },
  { rota: '/foto', icone: '📸', titulo: 'Tirar foto do boletim', desc: 'Fotografe o boletim impresso (OCR)' },
  { rota: '/manual', icone: '⌨️', titulo: 'Digitar manualmente', desc: 'Insira os dados do boletim' },
];

export function Inicio() {
  const resumo = useLiveQuery(async () => {
    const ativos = await db.leituras.where('status').equals('ativo').toArray();
    return { urnas: ativos.length, votantes: ativos.reduce((s, l) => s + (l.boletim.comparecimento ?? 0), 0) };
  });

  return (
    <>
      <Topo titulo="Contabilizar votos" semVoltar direita={<button onClick={() => ir('/config')} aria-label="Configurações">⚙️</button>} />
      <main className="conteudo">
        <div className="msg info">
          <strong>{formatarNumero(resumo?.urnas ?? 0)}</strong> urnas contabilizadas · <strong>{formatarNumero(resumo?.votantes ?? 0)}</strong> votantes
        </div>
        <h2>Escolha como enviar o boletim</h2>
        {METODOS.map((m) => (
          <button key={m.rota} className="metodo" onClick={() => ir(m.rota)}>
            <span className="icone" aria-hidden>{m.icone}</span>
            <span>
              <strong>{m.titulo}</strong>
              <span>{m.desc}</span>
            </span>
          </button>
        ))}
        <div className="acoes">
          <button className="btn primario" onClick={() => ir('/dashboard')}>📊 Dashboard</button>
          <button className="btn" onClick={() => ir('/historico')}>🗂️ Histórico</button>
        </div>
        <div className="acoes">
          <button className="btn" onClick={() => ir('/auditoria')}>🛡️ Auditoria</button>
          <button className="btn" onClick={() => ir('/config')}>⚙️ Configurações</button>
        </div>
      </main>
    </>
  );
}
