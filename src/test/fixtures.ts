import { hexParaBytes, sha512Hex } from '../domain/hash';

/** Conteúdo (sem HASH) de um BU de exemplo, dividido em partes. */
export const CORPO_BU = [
  'ORIG:VOTA ORLC:LEG PROC:407 DTPL:20221030 PLEI:407 TURN:2 FASE:O UNFE:SP MUNI:62910 ZONA:75 SECA:182 IDUE:1787323 IDCA:666070534576779579335458 VERS:8.26.0.0 LOCA:1015 APTS:325 COMP:278 FALT:47 DTAB:20221030 HRAB:080001 DTFC:20221030 HRFC:170059',
  'IDEL:545 CARG:1 TIPO:0 VERC:202209 13:45 22:225 APTA:325 NOMI:270 BRAN:5 NULO:3 TOTC:278',
  'IDEL:546 CARG:3 TIPO:0 VERC:202209 10:223 13:40 APTA:325 NOMI:263 BRAN:7 NULO:8 TOTC:278',
];

/** Gera o texto dos QR Codes com cabeçalho e cadeia de HASH SHA-512. */
export async function gerarQrs(corpos: string[] = CORPO_BU, assinatura = 'ABCDEF0123'): Promise<string[]> {
  const out: string[] = [];
  let anterior: string | null = null;
  for (let i = 0; i < corpos.length; i++) {
    const conteudo = `QRBU:${i + 1}:${corpos.length} VRQR:1.5 VRCH:20220930 ${corpos[i]} `;
    const hash: string = anterior ? await sha512Hex(hexParaBytes(anterior), conteudo) : await sha512Hex(conteudo);
    let texto = `${conteudo}HASH:${hash.toUpperCase()}`;
    if (i === corpos.length - 1) texto += ` ASSI:${assinatura}`;
    out.push(texto);
    anterior = hash;
  }
  return out;
}

/** Texto de um BU como extraído de PDF (linhas). */
export const TEXTO_PDF = `Justiça Eleitoral
Tribunal Regional Eleitoral de São Paulo
Eleições Gerais 2022 - 2º Turno
Boletim de Urna
Município 62910 - CONCHAL
Zona Eleitoral 0075 Local de Votação 1015 Seção Eleitoral 0182
Eleitores aptos 0325
Código identificação UE 01787323
Data de abertura da UE 30/10/2022 08:00:01
Data de fechamento da UE 30/10/2022 17:00:59
Comparecimento 0278
Eleitores faltosos 0047
PRESIDENTE
Nome do candidato Partido Votos
LULA PT 13 0045
JAIR BOLSONARO PL 22 0225
Votos Nominais 0270
Brancos 0005
Nulos 0003
Total Apurado 0278
GOVERNADOR
Nome do candidato Partido Votos
TARCÍSIO REPUBLICANOS 10 0223
FERNANDO HADDAD PT 13 0040
Votos Nominais 0263
Brancos 0007
Nulos 0008
Total Apurado 0278
Código de identificação da carga 666.070.534.576.779.579.335.458
ASSINATURA QR CODE
434ABDE4D60C4601209F0C5B3957BEE6ED306497B4B27DDC7C36553CCB3A6F4F
995BF9117464A2BAF47897CADE53098D5515C6DB219ACE2E83CCAA4D2054D903`;
