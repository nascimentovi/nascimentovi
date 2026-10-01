import { gravarConfig, lerConfig } from '../db/database';
import { verificarAssinaturaBu } from '../domain/assinatura';
import { interpretarQr, MontadorQr, separarPartes, validarHashes } from '../domain/qrbu';
import type { Boletim, Captura, Leitura, TipoEntrada } from '../domain/types';
import { obterChavePublica, obterComplemento } from './tseQr';

export const CFG_MUNICIPIOS = 'municipios';

export class ErroCaptura extends Error {}

/**
 * Converte as partes completas de QR Code em uma Captura validada.
 *
 * - Código verificador (cadeia de HASH SHA-512): obrigatório; se não conferir,
 *   a leitura é rejeitada.
 * - Assinatura digital do TSE (ASSI, Ed25519): verificada quando a chave
 *   pública está disponível (baixada do TSE ou em cache). Assinatura inválida
 *   rejeita a leitura; sem a chave (ex.: offline) a leitura segue marcada
 *   como "não verificada".
 * - Nomes de município e candidatos: completados pelo arquivo do TSE, quando
 *   disponível. Nunca impede a leitura.
 */
export async function capturaDeQr(montador: MontadorQr, tipo: TipoEntrada = 'qr_code', arquivo?: string): Promise<Captura> {
  const partes = montador.ordenadas();
  const hash = await validarHashes(partes);
  if (hash.valido === false) throw new ErroCaptura(`Código verificador inválido: ${hash.detalhe} Leia o QR Code novamente.`);
  if (hash.valido === null) throw new ErroCaptura(`${hash.detalhe} Não é possível verificar a integridade.`);

  const { boletim, campos } = interpretarQr(partes);
  const avisos: string[] = [];

  // Chave pública e nomes são buscados em paralelo (do cache, quando já baixados).
  const [chave, comp] = await Promise.all([
    hash.assinatura ? obterChavePublica(campos).catch(() => null) : Promise.resolve(null),
    obterComplemento(campos).catch(() => null),
  ]);

  let assinaturaValida: boolean | null = null;
  if (hash.assinatura && hash.hashFinal) {
    if (chave) {
      assinaturaValida = verificarAssinaturaBu(hash.hashFinal, hash.assinatura, chave);
      if (!assinaturaValida) {
        throw new ErroCaptura('Assinatura digital do TSE inválida: este QR Code não foi gerado por uma urna oficial ou foi alterado.');
      }
    }
  }

  if (comp) {
    if (comp.municipio) boletim.municipio = comp.municipio;
    for (const c of boletim.cargos) {
      for (const k of c.candidatos) {
        const nome = comp.candidatos[`${c.cargo}|${Number(k.numero)}`];
        if (nome && !k.legenda) k.nome = nome;
      }
    }
  }
  const municipios = await lerConfig<Record<string, string>>(CFG_MUNICIPIOS, {});
  if (!comp?.municipio && boletim.codigoMunicipio && municipios[boletim.codigoMunicipio]) {
    boletim.municipio = municipios[boletim.codigoMunicipio];
  }
  if (boletim.fase && boletim.fase !== 'O') {
    avisos.push(`Boletim de urna em fase "${boletim.fase === 'S' ? 'simulado' : boletim.fase === 'T' ? 'treinamento' : boletim.fase}" (não oficial).`);
  }
  return {
    tipo,
    boletim,
    checksumValido: hash.valido,
    assinaturaValida,
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
