import { Topo } from './comum';

export function Ajuda() {
  return (
    <>
      <Topo titulo="Ajuda" />
      <main className="conteudo">
        <section className="cartao">
          <h2>Como funciona</h2>
          <ol>
            <li><strong>📱 QR Code</strong>: aponte a câmera para o QR Code do Boletim de Urna. Se o boletim tiver vários QR Codes, leia todos (em qualquer ordem). O hash SHA-512 de cada parte é conferido antes de aceitar.</li>
            <li><strong>📄 PDF</strong>: envie o PDF do boletim. Se houver QR Code no arquivo, ele é usado; senão, o texto é extraído e você revisa os dados.</li>
            <li><strong>📸 Foto</strong>: fotografe o boletim impresso. Se houver QR Code na foto, ele é lido; senão, o OCR reconhece o texto e você confere os campos destacados.</li>
            <li><strong>⌨️ Manual</strong>: digite os dados quando nada mais funcionar.</li>
          </ol>
        </section>
        <section className="cartao">
          <h2>Proteção contra duplicidade</h2>
          <p>Cada boletim gera um <em>fingerprint</em> (SHA-256 de zona, local, seção, data, eleitores aptos e votos). O mesmo boletim lido por QR, PDF ou foto gera o mesmo fingerprint e só é contado uma vez.</p>
          <p>Também é detectado como duplicata um boletim com o mesmo código de carga ou da mesma urna (zona + seção + data) — nesse caso a tela mostra as diferenças, que podem indicar erro de leitura ou alteração.</p>
        </section>
        <section className="cartao">
          <h2>Exclusão</h2>
          <p>Excluir um registro não o apaga: ele fica marcado como excluído, os votos saem do total e a operação vai para o log de auditoria.</p>
        </section>
        <section className="cartao">
          <h2>Offline</h2>
          <p>Depois de aberto uma vez, o aplicativo funciona sem internet (inclusive o OCR). Os dados ficam salvos no próprio aparelho — use “Auditoria → Backup” para guardar uma cópia.</p>
        </section>
      </main>
    </>
  );
}
