import { ed25519 } from '@noble/curves/ed25519.js';
import { hexParaBytes } from './hash';

/**
 * Verifica a assinatura digital do QR Code do BU (campo ASSI).
 * Conforme o manual do TSE (seção 6.1): Ed25519 (EdDSA) sobre os BYTES do
 * hash da última parte (hashN), com a chave pública da UF/versão de chave.
 */
export function verificarAssinaturaBu(hashFinalHex: string, assinaturaHex: string, chavePublica: Uint8Array): boolean {
  try {
    return ed25519.verify(hexParaBytes(assinaturaHex), hexParaBytes(hashFinalHex), chavePublica);
  } catch {
    return false;
  }
}
