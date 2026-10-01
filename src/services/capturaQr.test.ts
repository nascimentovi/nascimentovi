import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/database';
import { hexParaBytes } from '../domain/hash';
import { CHAVE_PUBLICA_MANUAL, QR_MANUAL_SIMPLES } from '../test/exemplosManual';
import { capturaDeQr, ErroCaptura, montarDeTextos } from './capturaQr';
import { caminhoChave, caminhoComplemento, interpretarComplemento, reiniciarDisponibilidade } from './tseQr';

const CAMINHO_CHAVE = '/tse.qrcodebu/20240507/LEGAL/sacqrcode.pub';
const CAMINHO_COMP = '/json-bu/simulado/1000/s01100ac01120-qbu.js';

const COMPLEMENTO = JSON.stringify({
  assinatura: 'x',
  processoEleitoral: {
    codigo: 1000,
    municipio: { numero: 1120, nome: 'Rio Branco' },
    eleicoes: [
      {
        codigo: 1101,
        partidosPorCargos: [
          {
            cargo: { codigo: 11 },
            candidaturasPorPartidos: [
              { partido: { sigla: 'PRM', numero: 92 }, candidaturas: [{ numero: 92, titular: { nome: 'Forró' } }] },
            ],
          },
          {
            cargo: { codigo: 13 },
            candidaturasPorPartidos: [
              { partido: { sigla: 'PProf', numero: 93 }, candidaturas: [{ numero: 93001, titular: { nome: 'Garçom' } }] },
            ],
          },
        ],
      },
    ],
  },
});

function servidor(respostas: Record<string, Uint8Array | string>) {
  const f = vi.fn(async (url: string) => {
    const caminho = url.replace(/^https?:\/\/qrcodenobu\.tse\.jus\.br/, '');
    const r = respostas[caminho];
    return r === undefined ? new Response('', { status: 404 }) : new Response(r as BodyInit);
  });
  vi.stubGlobal('fetch', f);
  return f;
}

beforeEach(async () => {
  await db.config.clear();
  reiniciarDisponibilidade();
});
afterEach(() => vi.unstubAllGlobals());

describe('leitura do QR Code com dados públicos do TSE', () => {
  it('monta os endereços conforme o manual', () => {
    const campos = { VRCH: '20240507', ORLC: 'LEG', FASE: 'S', UNFE: 'AC', PROC: '1000', PLEI: '1100', MUNI: '1120' };
    expect(caminhoChave(campos)).toBe(CAMINHO_CHAVE);
    expect(caminhoComplemento(campos)).toBe(CAMINHO_COMP);
  });

  it('verifica a assinatura e completa os nomes dos candidatos', async () => {
    servidor({ [CAMINHO_CHAVE]: hexParaBytes(CHAVE_PUBLICA_MANUAL), [CAMINHO_COMP]: COMPLEMENTO });
    const c = await capturaDeQr(montarDeTextos([QR_MANUAL_SIMPLES]));
    expect(c.checksumValido).toBe(true);
    expect(c.assinaturaValida).toBe(true);
    // O nome do município vem da tabela oficial de códigos TSE (1120 = Acrelândia/AC).
    expect(c.boletim.municipio).toBe('ACRELÂNDIA');
    const pref = c.boletim.cargos.find((x) => x.cargo === 'PREFEITO')!;
    expect(pref.candidatos[0]).toMatchObject({ numero: '92', nome: 'FORRÓ (PRM)', votos: 1 });
    const ver = c.boletim.cargos.find((x) => x.cargo === 'VEREADOR')!;
    expect(ver.candidatos.find((k) => k.numero === '93001')?.nome).toBe('GARÇOM (PProf)');
  });

  it('rejeita assinatura que não confere com a chave do TSE', async () => {
    const errada = hexParaBytes(CHAVE_PUBLICA_MANUAL);
    errada[5] ^= 0xff;
    servidor({ [CAMINHO_CHAVE]: errada });
    await expect(capturaDeQr(montarDeTextos([QR_MANUAL_SIMPLES]))).rejects.toThrow(ErroCaptura);
  });

  it('sem internet: aceita a leitura com assinatura "não verificada"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const c = await capturaDeQr(montarDeTextos([QR_MANUAL_SIMPLES]));
    expect(c.checksumValido).toBe(true);
    expect(c.assinaturaValida).toBeNull();
    expect(c.boletim.cargos.length).toBe(2);
  });

  it('usa a chave e os nomes do cache depois de baixados (offline)', async () => {
    servidor({ [CAMINHO_CHAVE]: hexParaBytes(CHAVE_PUBLICA_MANUAL), [CAMINHO_COMP]: COMPLEMENTO });
    await capturaDeQr(montarDeTextos([QR_MANUAL_SIMPLES]));
    const f = vi.fn(async () => { throw new TypeError('offline'); });
    vi.stubGlobal('fetch', f);
    const c = await capturaDeQr(montarDeTextos([QR_MANUAL_SIMPLES]));
    expect(f).not.toHaveBeenCalled();
    expect(c.assinaturaValida).toBe(true);
    expect(c.boletim.cargos.find((x) => x.cargo === 'PREFEITO')!.candidatos[0].nome).toBe('FORRÓ (PRM)');
  });

  it('ignora complemento inválido', () => {
    expect(interpretarComplemento('nada')).toBeNull();
  });
});
