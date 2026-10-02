import { ir, Topo } from './comum';
import { PainelApuracao } from './PainelApuracao';

const METODOS = [
  { rota: '/qr', icone: '📱', titulo: 'Ler QR Code', desc: 'Aponte para o QR Code do boletim de urna' },
  { rota: '/pdf', icone: '📄', titulo: 'Upload de arquivo', desc: 'PDF ou arquivo do boletim de urna do TSE (.bu / .dat)' },
  { rota: '/foto', icone: '📸', titulo: 'Foto do boletim', desc: 'Tire uma foto ou envie uma imagem do boletim' },
];

export function Inicio() {
  return (
    <>
      <Topo titulo="Contabilizar votos" semVoltar />
      <main className="conteudo">
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
        <button className="btn" onClick={() => ir('/historico')}>🗂️ Histórico de leituras</button>

        <h2 style={{ marginTop: 8 }}>📊 Apuração</h2>
        <PainelApuracao />
      </main>
    </>
  );
}
