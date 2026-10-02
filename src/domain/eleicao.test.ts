import { describe, expect, it } from 'vitest';
import { eleicaoDoBoletim, turnoDoBoletim } from './eleicao';

describe('eleição e turno do boletim', () => {
  it('classifica a eleição pelo ano', () => {
    expect(eleicaoDoBoletim({ dataVotacao: '2022-10-30' })).toEqual({ chave: '2022', rotulo: 'Eleições 2022 – gerais' });
    expect(eleicaoDoBoletim({ dataVotacao: '2024-10-06' })).toEqual({ chave: '2024', rotulo: 'Eleições 2024 – municipais' });
    expect(eleicaoDoBoletim({ dataVotacao: '2023-04-02' })?.rotulo).toBe('Eleições 2023 – suplementar');
    expect(eleicaoDoBoletim({ dataVotacao: '' })).toBeNull();
  });

  it('usa o turno do QR e, sem ele, deduz pela data', () => {
    expect(turnoDoBoletim({ turno: '2', dataVotacao: '2022-10-02' })).toBe('2');
    expect(turnoDoBoletim({ dataVotacao: '2022-10-02' })).toBe('1');
    expect(turnoDoBoletim({ dataVotacao: '2022-10-30' })).toBe('2');
    expect(turnoDoBoletim({ dataVotacao: '2024-10-06' })).toBe('1');
    expect(turnoDoBoletim({ dataVotacao: '2024-10-27' })).toBe('2');
    expect(turnoDoBoletim({ dataVotacao: '2020-11-15' })).toBe('1');
    expect(turnoDoBoletim({ dataVotacao: '2020-11-29' })).toBe('2');
    expect(turnoDoBoletim({ dataVotacao: '2023-04-02' })).toBeNull();
  });
});
