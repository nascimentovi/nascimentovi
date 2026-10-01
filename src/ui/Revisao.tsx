import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { db } from '../db/database';
import { cargoCanonico, ORDEM_CARGOS } from '../domain/cargos';
import { dataIso, inteiroOuNulo, numeroCanonico, sanitizarTexto } from '../domain/normalizar';
import { ICONE_ENTRADA, ROTULO_ENTRADA, type Boletim, type Captura, type MapaConfianca } from '../domain/types';
import { validarBoletim } from '../domain/validacao';
import { ir, Topo, useFluxo } from './comum';

/* ---------------- Modelo editável (strings para os inputs) ---------------- */

interface CandEdit { id: string; numero: string; nome: string; votos: string; legenda?: boolean }
interface CargoEdit {
  id: string; cargo: string; candidatos: CandEdit[];
  votosNominais: string; votosLegenda: string; brancos: string; nulos: string; totalApurado: string;
}
interface Edit {
  municipio: string; zona: string; local: string; secao: string; codigoUe: string; codigoCarga: string;
  dataVotacao: string; eleitoresAptos: string; comparecimento: string; faltosos: string; cargos: CargoEdit[];
}

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
let seq = 0;
const novoId = (p: string) => `${p}${++seq}`;

/** Converte o boletim + mapa de confiança (por caminho) para o modelo editável (por id). */
function paraEdicao(b: Boletim, conf: MapaConfianca = {}): { edit: Edit; conf: MapaConfianca } {
  const c2: MapaConfianca = {};
  for (const k of ['municipio', 'zona', 'local', 'secao', 'codigoUe', 'codigoCarga', 'dataVotacao', 'eleitoresAptos', 'comparecimento', 'faltosos']) {
    if (conf[k] !== undefined) c2[k] = conf[k];
  }
  const cargos = b.cargos.map((c, i) => {
    const id = novoId('g');
    for (const f of ['votosNominais', 'votosLegenda', 'brancos', 'nulos', 'totalApurado']) {
      const v = conf[`cargos.${i}.${f}`];
      if (v !== undefined) c2[`${id}.${f}`] = v;
    }
    return {
      id,
      cargo: c.cargo,
      votosNominais: s(c.votosNominais),
      votosLegenda: s(c.votosLegenda),
      brancos: s(c.brancos),
      nulos: s(c.nulos),
      totalApurado: s(c.totalApurado),
      candidatos: c.candidatos.map((k, j) => {
        const kid = novoId('k');
        for (const f of ['numero', 'nome', 'votos']) {
          const v = conf[`cargos.${i}.candidatos.${j}.${f}`];
          if (v !== undefined) c2[`${kid}.${f}`] = v;
        }
        return { id: kid, numero: k.numero, nome: k.nome ?? '', votos: s(k.votos), legenda: k.legenda };
      }),
    };
  });
  return {
    edit: {
      municipio: b.municipio, zona: b.zona, local: b.local, secao: b.secao, codigoUe: b.codigoUe,
      codigoCarga: b.codigoCarga, dataVotacao: b.dataVotacao, eleitoresAptos: s(b.eleitoresAptos),
      comparecimento: s(b.comparecimento), faltosos: s(b.faltosos), cargos,
    },
    conf: c2,
  };
}

function paraBoletim(e: Edit, base: Boletim): Boletim {
  return {
    ...base,
    municipio: sanitizarTexto(e.municipio).toUpperCase(),
    zona: numeroCanonico(e.zona),
    local: numeroCanonico(e.local),
    secao: numeroCanonico(e.secao),
    codigoUe: e.codigoUe.replace(/\D/g, ''),
    codigoCarga: e.codigoCarga.replace(/\D/g, ''),
    dataVotacao: dataIso(e.dataVotacao),
    eleitoresAptos: inteiroOuNulo(e.eleitoresAptos),
    comparecimento: inteiroOuNulo(e.comparecimento),
    faltosos: inteiroOuNulo(e.faltosos),
    cargos: e.cargos.map((c) => ({
      cargo: cargoCanonico(c.cargo),
      votosNominais: inteiroOuNulo(c.votosNominais),
      votosLegenda: inteiroOuNulo(c.votosLegenda),
      brancos: inteiroOuNulo(c.brancos),
      nulos: inteiroOuNulo(c.nulos),
      totalApurado: inteiroOuNulo(c.totalApurado),
      candidatos: c.candidatos
        .filter((k) => k.numero.trim() || k.votos.trim())
        .map((k) => ({
          numero: numeroCanonico(k.numero),
          nome: sanitizarTexto(k.nome).toUpperCase() || undefined,
          votos: inteiroOuNulo(k.votos) ?? -1,
          ...(k.legenda ? { legenda: true } : {}),
        })),
    })),
  };
}

/* ---------------- Regras de confiança (seção 8.4 do escopo) ---------------- */

function regra(campo: string): { minimo: number; critico: boolean } {
  const f = campo.includes('.') ? campo.split('.').pop()! : campo;
  if (['zona', 'local', 'secao'].includes(f)) return { minimo: 95, critico: true };
  if (['eleitoresAptos', 'comparecimento', 'faltosos', 'codigoUe', 'codigoCarga', 'dataVotacao'].includes(f)) return { minimo: 90, critico: false };
  if (f === 'nome' || f === 'municipio' || f === 'cargo') return { minimo: 85, critico: false };
  return { minimo: 88, critico: false };
}

type Nivel = 'ok' | 'aviso' | 'baixa' | null;
function nivel(conf: number | undefined, campo: string): Nivel {
  if (conf === undefined) return null;
  if (conf >= regra(campo).minimo) return 'ok';
  return conf >= 50 ? 'aviso' : 'baixa';
}
/** Campos que exigem conferência explícita: críticos abaixo do mínimo e qualquer campo < 50%. */
function exigeConferencia(conf: number | undefined, campo: string): boolean {
  const n = nivel(conf, campo);
  return n === 'baixa' || (n === 'aviso' && regra(campo).critico);
}

/* ---------------- Tela ---------------- */

export function Revisao() {
  const { pendente, enviar, toast } = useFluxo();
  const [captura, setCaptura] = useState<Captura | null>(pendente);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [conf, setConf] = useState<MapaConfianca>({});
  const [conferidos, setConferidos] = useState<Set<string>>(new Set());
  const [alterado, setAlterado] = useState(false);
  const [tentou, setTentou] = useState(false);
  const cadastro = useLiveQuery(() => db.candidatos.toArray(), []);

  useEffect(() => {
    if (pendente) {
      setCaptura(pendente);
      const r = paraEdicao(pendente.boletim, pendente.confianca);
      setEdit(r.edit);
      setConf(r.conf);
    } else {
      ir('/');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const boletim = useMemo(() => (edit && captura ? paraBoletim(edit, captura.boletim) : null), [edit, captura]);
  const validacao = useMemo(() => (boletim ? validarBoletim(boletim) : null), [boletim]);
  const nomesCadastro = useMemo(() => new Map((cadastro ?? []).map((c) => [`${c.cargo}|${c.numero}`, c.nome])), [cadastro]);

  if (!edit || !captura || !boletim || !validacao) return <Topo titulo="Revisar dados" />;

  const pendentesConferencia = Object.entries(conf).filter(([k, v]) => exigeConferencia(v, k) && !conferidos.has(k)).map(([k]) => k);
  const ehOcr = captura.tipo === 'ocr';

  const marcar = (k: string) => {
    setAlterado(true);
    setConferidos((c) => new Set(c).add(k));
  };
  const atualizar = (fn: (e: Edit) => void) => {
    const novo = structuredClone(edit);
    fn(novo);
    setEdit(novo);
  };

  function campo({ k, rotulo, valor, aoMudar, tipo = 'text', modo }: { k: string; rotulo: string; valor: string; aoMudar: (v: string) => void; tipo?: string; modo?: 'numeric' | 'text' }) {
    const c = conf[k];
    const n = conferidos.has(k) ? 'ok' : nivel(c, k);
    const precisa = exigeConferencia(c, k) && !conferidos.has(k);
    return (
      <div className={`campo${n ? ` conf-${n}` : ''}`}>
        <label htmlFor={k}>
          {rotulo}
          {c !== undefined && <span className={`selo ${n}`}>{conferidos.has(k) ? '✓ conferido' : `${c}%`}</span>}
        </label>
        <input id={k} type={tipo} inputMode={modo} value={valor} onChange={(e) => { aoMudar(e.target.value); marcar(k); }} />
        {precisa && (
          <label className="conferir">
            <input type="checkbox" onChange={() => setConferidos((x) => new Set(x).add(k))} /> Conferi este valor no boletim
          </label>
        )}
      </div>
    );
  }

  function aceitar() {
    setTentou(true);
    if (pendentesConferencia.length || validacao!.erros.length) {
      toast('Corrija os campos destacados antes de continuar.');
      return;
    }
    enviar({ ...captura!, boletim: boletim!, correcoesManuais: alterado || captura!.correcoesManuais }, false);
  }

  return (
    <>
      <Topo titulo={`Revisar dados · ${ROTULO_ENTRADA[captura.tipo]}`} />
      <main className="conteudo">
        <div className="msg info">
          {ICONE_ENTRADA[captura.tipo]} {captura.arquivoOriginal ?? ROTULO_ENTRADA[captura.tipo]}
          {captura.qualidadeGeral != null && <> · Confiança geral: <strong>{captura.qualidadeGeral}%</strong></>}
          <br />
          Confira os dados reconhecidos. Campos em <strong>amarelo</strong> têm confiança abaixo do mínimo e em{' '}
          <strong>vermelho</strong> abaixo de 50%.
        </div>
        {ehOcr && (captura.qualidadeGeral ?? 100) < 60 && (
          <div className="msg erro">⚠️ Confiança geral baixa ({captura.qualidadeGeral}%). Confira os campos com atenção ou tire uma nova foto com mais luz e o boletim bem enquadrado.</div>
        )}
        {captura.avisos?.map((a) => <div key={a} className="msg aviso">⚠️ {a}</div>)}

        <section className="cartao">
          <h2>Identificação da urna</h2>
          <div className="grade">
            {campo({ k: "municipio", rotulo: "Município", valor: edit.municipio, aoMudar: (v) => atualizar((e) => (e.municipio = v)) })}
            {campo({ k: "dataVotacao", rotulo: "Data da votação", tipo: "date", valor: edit.dataVotacao, aoMudar: (v) => atualizar((e) => (e.dataVotacao = v)) })}
          </div>
          <div className="grade tres" style={{ marginTop: 10 }}>
            {campo({ k: "zona", rotulo: "Zona", modo: "numeric", valor: edit.zona, aoMudar: (v) => atualizar((e) => (e.zona = v)) })}
            {campo({ k: "local", rotulo: "Local", modo: "numeric", valor: edit.local, aoMudar: (v) => atualizar((e) => (e.local = v)) })}
            {campo({ k: "secao", rotulo: "Seção", modo: "numeric", valor: edit.secao, aoMudar: (v) => atualizar((e) => (e.secao = v)) })}
          </div>
          <div className="grade" style={{ marginTop: 10 }}>
            {campo({ k: "codigoUe", rotulo: "Código UE", modo: "numeric", valor: edit.codigoUe, aoMudar: (v) => atualizar((e) => (e.codigoUe = v)) })}
            {campo({ k: "codigoCarga", rotulo: "Código da carga", modo: "numeric", valor: edit.codigoCarga, aoMudar: (v) => atualizar((e) => (e.codigoCarga = v)) })}
          </div>
        </section>

        <section className="cartao">
          <h2>Eleitores</h2>
          <div className="grade tres">
            {campo({ k: "eleitoresAptos", rotulo: "Aptos", modo: "numeric", valor: edit.eleitoresAptos, aoMudar: (v) => atualizar((e) => (e.eleitoresAptos = v)) })}
            {campo({ k: "comparecimento", rotulo: "Comparecimento", modo: "numeric", valor: edit.comparecimento, aoMudar: (v) => atualizar((e) => (e.comparecimento = v)) })}
            {campo({ k: "faltosos", rotulo: "Faltosos", modo: "numeric", valor: edit.faltosos, aoMudar: (v) => atualizar((e) => (e.faltosos = v)) })}
          </div>
        </section>

        {edit.cargos.map((g, gi) => (
          <section className="cartao" key={g.id}>
            <div className="cab-cargo">
              <select className="ent" style={{ maxWidth: 220, fontWeight: 700 }} value={g.cargo} aria-label="Cargo" onChange={(e) => { atualizar((x) => (x.cargos[gi].cargo = e.target.value)); setAlterado(true); }}>
                {[...new Set([...ORDEM_CARGOS, g.cargo])].map((c) => <option key={c} value={c}>📊 {c}</option>)}
              </select>
              <button className="btn pequeno" onClick={() => { atualizar((x) => x.cargos.splice(gi, 1)); setAlterado(true); }}>Remover cargo</button>
            </div>
            {g.candidatos.map((k, ki) => (
              <div className="cand" key={k.id} style={{ marginBottom: 6 }}>
                {campo({ k: `${k.id}.numero`, rotulo: k.legenda ? 'Legenda' : 'Número', modo: "numeric", valor: k.numero, aoMudar: (v) => atualizar((x) => (x.cargos[gi].candidatos[ki].numero = v)) })}
                <div className={`campo${nivel(conf[`${k.id}.nome`], 'nome') && !conferidos.has(`${k.id}.nome`) ? ` conf-${nivel(conf[`${k.id}.nome`], 'nome')}` : ''}`}>
                  <label htmlFor={`${k.id}.nome`}>Nome {conf[`${k.id}.nome`] !== undefined && <span className={`selo ${nivel(conf[`${k.id}.nome`], 'nome')}`}>{conf[`${k.id}.nome`]}%</span>}</label>
                  <input
                    id={`${k.id}.nome`}
                    value={k.nome}
                    placeholder={nomesCadastro.get(`${cargoCanonico(g.cargo)}|${numeroCanonico(k.numero)}`) ?? 'opcional'}
                    onChange={(e) => { atualizar((x) => (x.cargos[gi].candidatos[ki].nome = e.target.value)); marcar(`${k.id}.nome`); }}
                  />
                </div>
                {campo({ k: `${k.id}.votos`, rotulo: "Votos", modo: "numeric", valor: k.votos, aoMudar: (v) => atualizar((x) => (x.cargos[gi].candidatos[ki].votos = v)) })}
                <button className="remover" aria-label="Remover candidato" onClick={() => { atualizar((x) => x.cargos[gi].candidatos.splice(ki, 1)); setAlterado(true); }}>✕</button>
              </div>
            ))}
            <button className="btn pequeno" onClick={() => atualizar((x) => x.cargos[gi].candidatos.push({ id: novoId('k'), numero: '', nome: '', votos: '' }))}>+ Candidato</button>
            <div className="grade" style={{ marginTop: 10 }}>
              {campo({ k: `${g.id}.votosNominais`, rotulo: "Votos nominais", modo: "numeric", valor: g.votosNominais, aoMudar: (v) => atualizar((x) => (x.cargos[gi].votosNominais = v)) })}
              {campo({ k: `${g.id}.totalApurado`, rotulo: "Total apurado", modo: "numeric", valor: g.totalApurado, aoMudar: (v) => atualizar((x) => (x.cargos[gi].totalApurado = v)) })}
              {campo({ k: `${g.id}.brancos`, rotulo: "Brancos", modo: "numeric", valor: g.brancos, aoMudar: (v) => atualizar((x) => (x.cargos[gi].brancos = v)) })}
              {campo({ k: `${g.id}.nulos`, rotulo: "Nulos", modo: "numeric", valor: g.nulos, aoMudar: (v) => atualizar((x) => (x.cargos[gi].nulos = v)) })}
            </div>
          </section>
        ))}
        <button
          className="btn"
          onClick={() => {
            const usado = new Set(edit.cargos.map((g) => g.cargo));
            const prox = ORDEM_CARGOS.find((c) => !usado.has(c)) ?? 'OUTRO';
            atualizar((x) => x.cargos.push({ id: novoId('g'), cargo: prox, candidatos: [{ id: novoId('k'), numero: '', nome: '', votos: '' }], votosNominais: '', votosLegenda: '', brancos: '', nulos: '', totalApurado: '' }));
          }}
        >
          + Adicionar cargo
        </button>

        {(tentou || validacao.alertas.length > 0) && (validacao.erros.length > 0 || validacao.alertas.length > 0 || pendentesConferencia.length > 0) && (
          <div className={`msg ${validacao.erros.length || pendentesConferencia.length ? 'erro' : 'aviso'}`} role="alert">
            <strong>Validação estrutural</strong>
            <ul>
              {pendentesConferencia.length > 0 && <li>{pendentesConferencia.length} campo(s) com confiança baixa aguardam conferência.</li>}
              {validacao.erros.map((x) => <li key={x}>{x}</li>)}
              {validacao.alertas.map((x) => <li key={x}>⚠️ {x}</li>)}
            </ul>
          </div>
        )}

        <div className="acoes">
          {ehOcr ? (
            <button className="btn" onClick={() => ir('/foto')}>📷 Nova foto</button>
          ) : (
            <button className="btn" onClick={() => ir('/')}>Cancelar</button>
          )}
          <button className="btn primario" onClick={aceitar}>✅ Aceitar</button>
        </div>
      </main>
    </>
  );
}
