import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { interpretarQr, MontadorQr } from '../domain/qrbu';
import type { Boletim } from '../domain/types';
import { gerarQrs } from '../test/fixtures';
import { consultarBuTse, ErroTse, escolherArquivoBu, urlIndiceSecao } from './tse';

async function boletimQr(): Promise<Boletim> {
  const m = new MontadorQr();
  (await gerarQrs()).forEach((q) => m.adicionar(q));
  return interpretarQr(m.ordenadas()).boletim;
}

/** Texto no formato do boletim impresso (.imgbu) publicado pelo TSE. */
const IMGBU = (lula = '45') => `                 JUSTIÇA ELEITORAL
          TRIBUNAL REGIONAL ELEITORAL DE SÃO PAULO
           ELEIÇÃO GERAL FEDERAL 2º TURNO (30/10/2022)
                   BOLETIM DE URNA
Município        62910 - CONCHAL
Zona Eleitoral   0075
Local de Votação 1015
Seção Eleitoral  0182
Eleitores aptos  0325
Comparecimento   0278
Eleitores faltosos 0047
Código identificação UE  01787323
Data de abertura da UE 30/10/2022 08:00:01
----------------------------------------
                 PRESIDENTE
Nome do candidato             Partido   Votos
LULA                          PT 13     ${lula.padStart(4, '0')}
JAIR BOLSONARO                PL 22     0225
Votos nominais                          0270
Brancos                                 0005
Nulos                                   0003
Total apurado                           0278
----------------------------------------
                 GOVERNADOR
TARCÍSIO                      REPUBLICANOS 10 0223
FERNANDO HADDAD               PT 13     0040
Votos nominais                          0263
Brancos                                 0007
Nulos                                   0008
Total apurado                           0278
`;

const INDICE = {
  st: 'Totalizado',
  hashes: [
    { hash: 'antigo', st: 'Excluído', nmarq: ['o00407-6291000750182.imgbu'] },
    { hash: '3a4b5c', st: 'Totalizado', nmarq: ['o00407-6291000750182.bu', 'o00407-6291000750182.imgbu', 'o00407-6291000750182.rdv'] },
  ],
};

function mockFetch(respostas: Record<string, { status?: number; corpo: string }>) {
  const f = vi.fn(async (url: string) => {
    const r = respostas[url];
    if (!r) return new Response('nao encontrado', { status: 404 });
    return new Response(r.corpo, { status: r.status ?? 200 });
  });
  vi.stubGlobal('fetch', f);
  return f;
}

const BASE = 'https://resultados.tse.jus.br';
const URL_INDICE = `${BASE}/oficial/ele2022/arquivo-urna/407/dados/sp/62910/0075/0182/p000407-sp-m62910-z0075-s0182-aux.json`;
const URL_BU = `${BASE}/oficial/ele2022/arquivo-urna/407/dados/sp/62910/0075/0182/3a4b5c/o00407-6291000750182.imgbu`;

afterEach(() => vi.unstubAllGlobals());

describe('conferência com o BU oficial do TSE', () => {
  it('monta a URL da seção com os dados do QR', async () => {
    expect(urlIndiceSecao(await boletimQr(), BASE)).toBe(URL_INDICE);
  });

  it('exige pleito/UF/município no QR', async () => {
    const b = { ...(await boletimQr()), pleito: undefined };
    expect(() => urlIndiceSecao(b, BASE)).toThrow(ErroTse);
  });

  it('escolhe o arquivo totalizado e ignora os excluídos', () => {
    expect(escolherArquivoBu(INDICE)).toEqual({ hash: '3a4b5c', arquivo: 'o00407-6291000750182.imgbu' });
    expect(() => escolherArquivoBu({ hashes: [INDICE.hashes[0]] })).toThrow('ainda não publicou');
  });

  it('confere quando todos os votos coincidem', async () => {
    const f = mockFetch({ [URL_INDICE]: { corpo: JSON.stringify(INDICE) }, [URL_BU]: { corpo: IMGBU() } });
    const r = await consultarBuTse(await boletimQr(), BASE);
    expect(f).toHaveBeenCalledTimes(2);
    expect(r.status).toBe('conferido');
    expect(r.divergencias).toEqual([]);
    expect(r.url).toBe(URL_BU);
  });

  it('aponta divergência de votos entre QR e TSE', async () => {
    mockFetch({ [URL_INDICE]: { corpo: JSON.stringify(INDICE) }, [URL_BU]: { corpo: IMGBU('55') } });
    const r = await consultarBuTse(await boletimQr(), BASE);
    expect(r.status).toBe('divergente');
    expect(r.divergencias).toEqual([{ campo: 'PRESIDENTE · nº 13 (LULA)', qr: '45', tse: '55' }]);
  });

  it('BU não publicado (404) é erro temporário', async () => {
    mockFetch({});
    const e = await consultarBuTse(await boletimQr(), BASE).catch((x) => x);
    expect(e).toBeInstanceOf(ErroTse);
    expect(e.temporario).toBe(true);
    expect(e.message).toContain('ainda não foi publicado');
  });

  it('falha de rede vira ErroTse', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(consultarBuTse(await boletimQr(), BASE)).rejects.toThrow('Não foi possível acessar o site do TSE');
  });
});
