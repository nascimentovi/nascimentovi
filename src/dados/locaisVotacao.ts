/**
 * Locais de votação com escola, endereço, bairro e seções.
 * Conchal/SP (código TSE 63452) — conforme a relação de locais fornecida
 * pela organização (escola, código do local e seções).
 */
export interface LocalVotacao {
  local: string;
  escola: string;
  endereco: string;
  bairro: string;
  secoes: number[];
}

export const LOCAIS_POR_MUNICIPIO: Record<string, LocalVotacao[]> = {
  // CONCHAL
  '63452': [
    { local: '1015', escola: 'E.E. Padre Orestes Ladeira', endereco: 'Rua das Azaléias, 680', bairro: 'Jardim Dulce Maria', secoes: [26, 27, 28, 29, 30, 31, 32, 33, 34, 182] },
    { local: '1023', escola: 'E.M.E.F. Alonso Ferreira de Camargo', endereco: 'Rua Álvaro Ribeiro, 287', bairro: 'Centro', secoes: [35, 36, 37, 38, 39, 40, 41, 42, 131, 241] },
    { local: '1031', escola: 'E.M.E.F. Professora Maria Benedita Fernandes', endereco: 'Rua Guido Bordini, 280', bairro: 'Tujuguaba', secoes: [43, 44, 215, 432, 498] },
    { local: '1040', escola: 'E.M.E.F. Giácomo Corte', endereco: 'Rua Santa Catarina, 75', bairro: 'Parque Industrial', secoes: [136, 137, 143, 149, 156, 167, 174, 197, 321, 358, 389, 427, 458] },
    { local: '1058', escola: 'E.E. Padre Alberto Vellone', endereco: 'Rua Benedito Novo, 1054', bairro: 'Jardim Novo Horizonte', secoes: [212, 217, 225, 232, 246, 256, 268] },
    { local: '1066', escola: 'C.E.M.E.I. Vereador Gregório José Bechara', endereco: 'Rua Conde de Parnaíba, 355', bairro: 'Centro', secoes: [379, 386, 434, 456, 486] },
    { local: '1082', escola: 'E.E. Sebastião Gomes', endereco: 'Rua Victor Favretto, 250', bairro: 'Jardim Esperança', secoes: [278, 279, 289, 296, 305, 313, 342, 350, 357, 368] },
    { local: '1090', escola: 'E.E. Jardim Bela Vista', endereco: 'Rua dos Battel, 210', bairro: 'Jardim Bela Vista', secoes: [392, 411, 435, 454, 459, 471, 482, 493, 501] },
    { local: '1104', escola: 'E.M.E.F. Adelina Manara Ferreira de Mello', endereco: 'Av. Pref. Egydio Corte, 600', bairro: 'Conjunto Habitacional Pró-Moradia', secoes: [394, 422, 437] },
  ],
};
