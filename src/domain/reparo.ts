import { codigoPorNomeUnico, municipioPorCodigoTse } from './municipios';
import { interpretarTextoBu } from './textoBu';
import type { Leitura } from './types';

/**
 * Completa o município de um registro gravado sem ele (ex.: PDF "Via Digital"
 * lido antes da correção do leitor), a partir do nome ou do texto original do
 * boletim guardado em `dados_brutos`. Não altera votos. Devolve true se mudou.
 */
export function repararMunicipio(l: Leitura): boolean {
  if (l.boletim.codigoMunicipio) return false;
  let codigo = codigoPorNomeUnico(l.municipio || l.boletim.municipio);
  if (!codigo && l.dados_brutos) {
    const linhas = l.dados_brutos.split(/\r?\n/).map((texto) => ({ texto, confianca: 100 }));
    codigo = interpretarTextoBu(linhas, { ocr: l.tipo_entrada === 'ocr' }).boletim.codigoMunicipio ?? null;
  }
  const oficial = municipioPorCodigoTse(codigo);
  if (!codigo || !oficial) return false;
  l.boletim.codigoMunicipio = codigo;
  l.boletim.uf ??= oficial.uf;
  l.boletim.municipio = oficial.nome;
  l.municipio = oficial.nome;
  return true;
}
