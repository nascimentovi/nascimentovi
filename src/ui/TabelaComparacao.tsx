import type { DiferencaCampo } from '../domain/comparacao';

const RESUMO = new Set(['Zona', 'Local', 'Seção', 'Data', 'Comparecimento']);

export function TabelaComparacao({ diferencas, resumido }: { diferencas: DiferencaCampo[]; resumido?: boolean }) {
  const linhas = resumido ? diferencas.filter((d) => RESUMO.has(d.campo) || d.diverge) : diferencas;
  const divergentes = diferencas.filter((d) => d.diverge).length;
  return (
    <>
      <p className="muted" style={{ margin: '0 0 6px' }}>
        {divergentes ? `🔴 ${divergentes} campo(s) divergente(s)` : '✅ Nenhuma divergência nos campos presentes nas duas leituras'}
      </p>
      <div className="rolagem">
        <table className="tabela">
          <thead>
            <tr><th>Campo</th><th>Registro anterior</th><th>Leitura atual</th><th /></tr>
          </thead>
          <tbody>
            {linhas.map((d) => (
              <tr key={d.campo} className={d.diverge ? 'diverge' : ''}>
                <td>{d.campo}</td>
                <td className="n">{d.anterior}</td>
                <td className="n">{d.atual}</td>
                <td>{d.diverge ? '❌' : d.anterior === '—' || d.atual === '—' ? '–' : '✅'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
