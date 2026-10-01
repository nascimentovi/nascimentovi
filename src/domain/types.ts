/** Origem da captura de um boletim. */
export type TipoEntrada = 'qr_code' | 'pdf' | 'ocr' | 'manual';

export const ROTULO_ENTRADA: Record<TipoEntrada, string> = {
  qr_code: 'QR Code',
  pdf: 'PDF',
  ocr: 'Foto (OCR)',
  manual: 'Digitação manual',
};

export const ICONE_ENTRADA: Record<TipoEntrada, string> = {
  qr_code: '📱',
  pdf: '📄',
  ocr: '📸',
  manual: '⌨️',
};

export interface VotoCandidato {
  /** Número do candidato (ou da legenda/partido em votações proporcionais). */
  numero: string;
  /** Nome do candidato, quando disponível (o QR Code do BU traz apenas números). */
  nome?: string;
  votos: number;
  /** Voto de legenda (número do partido) em cargos proporcionais. */
  legenda?: boolean;
}

export interface ResultadoCargo {
  /** Nome canônico do cargo (ex.: PRESIDENTE). */
  cargo: string;
  candidatos: VotoCandidato[];
  votosNominais: number | null;
  votosLegenda?: number | null;
  brancos: number | null;
  nulos: number | null;
  totalApurado: number | null;
}

/**
 * Representação normalizada de um Boletim de Urna, independente da origem
 * (QR Code, PDF, OCR ou digitação). É sobre ela que se calcula o fingerprint.
 */
export interface Boletim {
  uf?: string;
  municipio: string;
  codigoMunicipio?: string;
  zona: string;
  local: string;
  secao: string;
  codigoUe: string;
  codigoCarga: string;
  /** Data da votação em ISO (AAAA-MM-DD). */
  dataVotacao: string;
  turno?: string;
  eleitoresAptos: number | null;
  comparecimento: number | null;
  faltosos: number | null;
  cargos: ResultadoCargo[];
  /** Hash/assinatura do QR Code (campos HASH/ASSI). */
  assinaturaQr?: string;
  versaoSoftware?: string;
  /** Fase da urna no QR: O = oficial, S = simulado, T = treinamento. */
  fase?: string;
  /** Código do pleito no TSE (campo PLEI do QR) — usado para consultar o BU oficial. */
  pleito?: string;
}

/** Resultado da conferência da leitura com o BU oficial publicado pelo TSE. */
export interface ConferenciaTse {
  status: 'conferido' | 'divergente';
  consultado_em: string;
  url: string;
  /** Campos divergentes entre o QR lido e o BU do TSE. */
  divergencias: { campo: string; qr: string; tse: string }[];
  /** Contabilizado apesar de divergências, por decisão do operador. */
  aceito_com_divergencia?: boolean;
}

/** Confiança (0–100) de cada campo extraído por PDF/OCR; chave = caminho do campo. */
export type MapaConfianca = Record<string, number>;

export interface Captura {
  tipo: TipoEntrada;
  boletim: Boletim;
  confianca?: MapaConfianca;
  qualidadeGeral?: number | null;
  arquivoOriginal?: string;
  /** Conteúdo bruto lido (texto do QR, texto extraído do PDF/OCR). */
  conteudoBruto?: string;
  checksumValido?: boolean | null;
  avisos?: string[];
  /** Usuário alterou algum campo na revisão. */
  correcoesManuais?: boolean;
  /** Dados vieram de QR Code do BU (câmera, imagem, PDF ou foto). */
  origemQr?: boolean;
  /** Conferência com o BU oficial do TSE (leituras de QR Code). */
  tse?: ConferenciaTse;
}

export interface ValidacoesEstruturais {
  total_votos_consistente: boolean;
  comparecimento_consistente: boolean;
  campos_obrigatorios_completos: boolean;
}

export interface EventoLeitura {
  timestamp: string;
  tipo: TipoEntrada;
  status: 'aceito' | 'rejeitado_duplicata' | 'substituido' | 'excluido';
  detalhe?: string;
}

export type StatusLeitura = 'ativo' | 'deletado';

/** Registro persistido de uma leitura (tabela `leituras`). */
export interface Leitura {
  id: string;
  fingerprint: string;
  /** Chave de identificação da urna (zona|seção|data) usada na detecção cruzada. */
  chaveUrna: string;
  timestamp_leitura: string;
  status: StatusLeitura;
  tipo_entrada: TipoEntrada;
  fonte_dados: string | null;

  // Campos desnormalizados para busca/índices
  municipio: string;
  zona_eleitoral: string;
  local_votacao: string;
  secao: string;
  codigo_ue: string;
  codigo_carga: string;

  boletim: Boletim;
  origem: {
    tipo: TipoEntrada;
    qualidade_ocr: number | null;
    arquivo_original: string | null;
    correcoes_manuais: boolean;
  };
  validacao: {
    checksum_valido: boolean | null;
    assinatura_qr: string | null;
    codigo_carga: string;
    validacoes_estruturais: ValidacoesEstruturais;
    alertas: string[];
    /** Conferência com o BU oficial do TSE (ausente quando não se aplica). */
    tse?: ConferenciaTse;
  };
  confianca?: MapaConfianca;
  dados_brutos: string | null;
  historico_leituras: EventoLeitura[];
  excluido_em?: string;
  motivo_exclusao?: string;
}

/** Tabela `historico_exclusoes` (log de auditoria). */
export interface Exclusao {
  id?: number;
  leitura_id: string;
  timestamp_exclusao: string;
  fingerprint_excluido: string;
  motivo: string;
  dados_antes_exclusao: string;
}

/** Tabela `candidatos`: nomes cadastrados para números lidos via QR Code. */
export interface CadastroCandidato {
  chave: string; // `${cargo}|${numero}`
  cargo: string;
  numero: string;
  nome: string;
}
