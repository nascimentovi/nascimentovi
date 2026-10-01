import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db, gravarConfig, lerConfig } from '../db/database';
import { cargoCanonico, ORDEM_CARGOS } from '../domain/cargos';
import { numeroCanonico, sanitizarTexto } from '../domain/normalizar';
import { CFG_MUNICIPIOS, CFG_PERMITIR_HASH } from '../services/capturaQr';
import { Topo, useFluxo } from './comum';

export function Configuracoes() {
  const { toast } = useFluxo();
  const [esperadas, setEsperadas] = useState('');
  const [dataEleicao, setDataEleicao] = useState('');
  const [permitirHash, setPermitirHash] = useState(false);
  const [municipios, setMunicipios] = useState<Record<string, string>>({});
  const candidatos = useLiveQuery(() => db.candidatos.orderBy('cargo').toArray(), []);
  const [novo, setNovo] = useState({ cargo: 'PRESIDENTE', numero: '', nome: '' });
  const [novoMun, setNovoMun] = useState({ codigo: '', nome: '' });

  useEffect(() => {
    void (async () => {
      setEsperadas(String((await lerConfig<number>('urnasEsperadas', 0)) || ''));
      setDataEleicao(await lerConfig('dataEleicao', ''));
      setPermitirHash(await lerConfig(CFG_PERMITIR_HASH, false));
      setMunicipios(await lerConfig(CFG_MUNICIPIOS, {}));
    })();
  }, []);

  async function salvarGerais() {
    await gravarConfig('urnasEsperadas', parseInt(esperadas, 10) || 0);
    await gravarConfig('dataEleicao', dataEleicao);
    await gravarConfig(CFG_PERMITIR_HASH, permitirHash);
    toast('Configurações salvas.');
  }

  async function addCandidato() {
    const numero = numeroCanonico(novo.numero);
    const nome = sanitizarTexto(novo.nome).toUpperCase();
    if (!numero || !nome) return;
    const cargo = cargoCanonico(novo.cargo);
    await db.candidatos.put({ chave: `${cargo}|${numero}`, cargo, numero, nome });
    setNovo({ ...novo, numero: '', nome: '' });
  }

  async function addMunicipio() {
    const codigo = numeroCanonico(novoMun.codigo);
    const nome = sanitizarTexto(novoMun.nome).toUpperCase();
    if (!codigo || !nome) return;
    const m = { ...municipios, [codigo]: nome };
    setMunicipios(m);
    await gravarConfig(CFG_MUNICIPIOS, m);
    setNovoMun({ codigo: '', nome: '' });
  }

  return (
    <>
      <Topo titulo="Configurações" />
      <main className="conteudo">
        <section className="cartao">
          <h2>Apuração</h2>
          <div className="grade">
            <div className="campo">
              <label htmlFor="esp">Total de urnas esperadas</label>
              <input id="esp" inputMode="numeric" value={esperadas} onChange={(e) => setEsperadas(e.target.value.replace(/\D/g, ''))} placeholder="ex.: 50" />
            </div>
            <div className="campo">
              <label htmlFor="dt">Data da eleição (padrão p/ digitação)</label>
              <input id="dt" type="date" value={dataEleicao} onChange={(e) => setDataEleicao(e.target.value)} />
            </div>
          </div>
          <label className="campo" style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <input type="checkbox" checked={permitirHash} onChange={(e) => setPermitirHash(e.target.checked)} />
            <span>Aceitar QR Code cujo hash não confere / ausente (fica marcado como “não verificado” na auditoria). <strong>Não recomendado.</strong></span>
          </label>
          <button className="btn primario" style={{ marginTop: 12 }} onClick={salvarGerais}>Salvar</button>
        </section>

        <section className="cartao">
          <h2>Nomes de candidatos</h2>
          <p className="muted">O QR Code do boletim traz apenas os números. Cadastre os nomes para exibi-los no dashboard.</p>
          <div className="grade tres">
            <select className="ent" value={novo.cargo} onChange={(e) => setNovo({ ...novo, cargo: e.target.value })} aria-label="Cargo">
              {ORDEM_CARGOS.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input className="ent" inputMode="numeric" placeholder="Número" value={novo.numero} onChange={(e) => setNovo({ ...novo, numero: e.target.value })} aria-label="Número" />
            <input className="ent" placeholder="Nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} aria-label="Nome" />
          </div>
          <button className="btn" style={{ marginTop: 8 }} onClick={addCandidato}>+ Adicionar</button>
          {!!candidatos?.length && (
            <table className="tabela" style={{ marginTop: 10 }}>
              <tbody>
                {candidatos.map((c) => (
                  <tr key={c.chave}>
                    <td>{c.cargo}</td><td>{c.numero}</td><td>{c.nome}</td>
                    <td><button className="btn link" onClick={() => db.candidatos.delete(c.chave)} aria-label="Remover">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="cartao">
          <h2>Nomes de municípios</h2>
          <p className="muted">O QR Code traz o código TSE do município (ex.: 62910). Associe ao nome.</p>
          <div className="grade">
            <input className="ent" inputMode="numeric" placeholder="Código TSE" value={novoMun.codigo} onChange={(e) => setNovoMun({ ...novoMun, codigo: e.target.value })} aria-label="Código" />
            <input className="ent" placeholder="Nome" value={novoMun.nome} onChange={(e) => setNovoMun({ ...novoMun, nome: e.target.value })} aria-label="Nome do município" />
          </div>
          <button className="btn" style={{ marginTop: 8 }} onClick={addMunicipio}>+ Adicionar</button>
          {Object.keys(municipios).length > 0 && (
            <table className="tabela" style={{ marginTop: 10 }}>
              <tbody>
                {Object.entries(municipios).map(([k, v]) => (
                  <tr key={k}>
                    <td>{k}</td><td>{v}</td>
                    <td>
                      <button className="btn link" aria-label="Remover" onClick={async () => {
                        const m = { ...municipios };
                        delete m[k];
                        setMunicipios(m);
                        await gravarConfig(CFG_MUNICIPIOS, m);
                      }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted">Vale para as próximas leituras de QR Code.</p>
        </section>
      </main>
    </>
  );
}
