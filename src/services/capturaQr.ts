import { gravarConfig, lerConfig } from '../db/database';
import { interpretarQr, MontadorQr, separarPartes, validarHashes } from '../domain/qrbu';
import type { Boletim, Captura, Leitura, TipoEntrada } from '../domain/types';

export const CFG_PERMITIR_HASH = 'permitirHashNaoVerificado';
export const CFG_MUNICIPIOS = 'municipios';

export class ErroCaptura extends Error {}

/**
 * Converte as partes completas de QR Code em uma Captura validada.
 * A cadeia de HASH funciona como código verificador: se não conferir, a
 * leitura é rejeitada (salvo se o usuário habilitou o modo tolerante).
 */
export async function capturaDeQr(montador: MontadorQr, tipo: TipoEntrada = 'qr_code', arquivo?: string): Promise<Captura> {
  const partes = montador.ordenadas();
  const hash = await validarHashes(partes);
  const permitir = await lerConfig(CFG_PERMITIR_HASH, false);
  const avisos: string[] = [];
  if (hash.valido === false) {
    if (!permitir) throw new ErroCaptura(`Código verificador inválido: ${hash.detalhe} Leia o QR Code novamente.`);
    avisos.push(`Hash não conferido: ${hash.detalhe}`);
  } else if (hash.valido === null) {
    if (!permitir) throw new ErroCaptura(`${hash.detalhe} Não é possível verificar a integridade.`);
    avisos.push(hash.detalhe);
  }
  const { boletim } = interpretarQr(partes);
  const municipios = await lerConfig<Record<string, string>>(CFG_MUNICIPIOS, {});
  if (boletim.codigoMunicipio && municipios[boletim.codigoMunicipio]) boletim.municipio = municipios[boletim.codigoMunicipio];
  if (boletim.fase && boletim.fase !== 'O') {
    avisos.push(`Boletim de urna em fase "${boletim.fase === 'S' ? 'simulado' : boletim.fase === 'T' ? 'treinamento' : boletim.fase}" (não oficial).`);
  }
  return {
    tipo,
    boletim,
    checksumValido: hash.valido,
    conteudoBruto: partes.map((p) => p.texto).join('\n'),
    arquivoOriginal: arquivo,
    avisos,
    qualidadeGeral: tipo === 'qr_code' ? null : 100,
  };
}

/** Monta a partir de textos já lidos (ex.: vários QR em um PDF ou texto colado). */
export function montarDeTextos(textos: string[]): MontadorQr {
  const m = new MontadorQr();
  for (const t of textos.flatMap(separarPartes)) {
    try {
      m.adicionar(t);
    } catch {
      /* ignora QR que não é de boletim */
    }
  }
  return m;
}

/**
 * PDF/OCR trazem código e nome do município ("62910 - CONCHAL"); o QR traz só
 * o código. Guarda a associação para exibir o mesmo nome nas duas origens.
 */
export async function aprenderMunicipio(b: Boletim): Promise<void> {
  if (!b.codigoMunicipio || !b.municipio || b.municipio.startsWith('MUNICÍPIO ')) return;
  const mapa = await lerConfig<Record<string, string>>(CFG_MUNICIPIOS, {});
  if (mapa[b.codigoMunicipio]) return;
  await gravarConfig(CFG_MUNICIPIOS, { ...mapa, [b.codigoMunicipio]: b.municipio });
}

/** Nome do município para exibição/filtro, resolvendo o código do QR pelo cadastro. */
export function nomeMunicipio(l: Leitura, mapa: Record<string, string>): string {
  const cod = l.boletim.codigoMunicipio;
  return (cod && mapa[cod]) || l.municipio;
}
