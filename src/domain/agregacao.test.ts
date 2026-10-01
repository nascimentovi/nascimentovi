import { describe, expect, it } from 'vitest';
import { agregar } from './agregacao';
import type { Boletim, Leitura } from './types';

function leitura(id: string, status: Leitura['status'], b: Partial<Boletim>): Leitura {
  const boletim: Boletim = {
    municipio: 'X', zona: '1', local: '1', secao: id, codigoUe: '', codigoCarga: '', dataVotacao: '2022-10-30',
    eleitoresAptos: 100, comparecimento: 80, faltosos: 20, cargos: [], ...b,
  };
  return {
    id, status, boletim, fingerprint: id, chaveUrna: id, timestamp_leitura: '', tipo_entrada: 'qr_code', fonte_dados: null,
    municipio: 'X', zona_eleitoral: '1', local_votacao: '1', secao: id, codigo_ue: '', codigo_carga: '',
    origem: { tipo: 'qr_code', qualidade_ocr: null, arquivo_original: null, correcoes_manuais: false },
    validacao: { checksum_valido: true, assinatura_qr: null, codigo_carga: '', alertas: [], validacoes_estruturais: { total_votos_consistente: true, comparecimento_consistente: true, campos_obrigatorios_completos: true } },
    dados_brutos: null, historico_leituras: [],
  };
}

const pres = (a: number, b: number, nome?: string) => ({
  cargo: 'PRESIDENTE', votosNominais: a + b, brancos: 1, nulos: 2, totalApurado: a + b + 3,
  candidatos: [{ numero: '13', votos: a, nome }, { numero: '22', votos: b }],
});

describe('agregação do dashboard', () => {
  it('soma apenas registros ativos e calcula comparecimento/abstenção', () => {
    const t = agregar([
      leitura('1', 'ativo', { cargos: [pres(10, 20)] }),
      leitura('2', 'ativo', { cargos: [pres(5, 5)] }),
      leitura('3', 'deletado', { cargos: [pres(1000, 1000, 'FULANO')] }),
    ]);
    expect(t.urnas).toBe(2);
    expect(t.eleitoresAptos).toBe(200);
    expect(t.taxaComparecimento).toBeCloseTo(0.8);
    expect(t.taxaAbstencao).toBeCloseTo(0.2);
    const c = t.cargos[0];
    expect(c.candidatos.map((x) => [x.numero, x.votos])).toEqual([['22', 25], ['13', 15]]);
    expect(c).toMatchObject({ brancos: 2, nulos: 4, validos: 40, totalApurado: 46 });
    // Nome conhecido por outra leitura (mesmo excluída) é reaproveitado; votos não.
    expect(c.candidatos.find((x) => x.numero === '13')?.nome).toBe('FULANO');
    expect(c.candidatos.find((x) => x.numero === '22')).toMatchObject({ nome: 'CANDIDATO 22', semNome: true });
  });

  it('cadastro de candidatos tem prioridade sobre nomes lidos', () => {
    const t = agregar([leitura('1', 'ativo', { cargos: [pres(1, 2, 'LIDO')] })], [{ chave: 'PRESIDENTE|13', cargo: 'PRESIDENTE', numero: '13', nome: 'CADASTRADO' }]);
    expect(t.cargos[0].candidatos.find((x) => x.numero === '13')?.nome).toBe('CADASTRADO');
  });
});
