# Apuração BU — leitura e contabilização de Boletins de Urna

PWA (aplicativo web instalável, mobile-first) que lê Boletins de Urna (BU) por **QR Code**, **PDF**, **foto (OCR)** ou **digitação**, contabiliza os votos em um dashboard em tempo real e impede que o mesmo boletim seja contado duas vezes, qualquer que seja a forma de entrada. Funciona **100% offline**, sem login. Os dados ficam no próprio aparelho, em IndexedDB.

## Como rodar

```bash
npm install
npm run dev          # http://localhost:5173
npm run dev:https    # HTTPS com certificado local, para testar a câmera no celular pela rede
npm test             # testes unitários e de integração (Vitest)
npm run build        # gera dist/ (com service worker para uso offline)
npm run preview      # serve o build
```

Para publicar em subdiretório (ex.: GitHub Pages), use `BASE_PATH=/repo/ npm run build`.

> A câmera só funciona em **HTTPS** ou `localhost` (exigência dos navegadores).

Exemplos fictícios para testar estão em `docs/exemplos/`:

| Arquivo | Como usar |
|---|---|
| `qr-bu-exemplo.txt` | Leitor QR → "Digitar código" → colar o conteúdo (3 partes com hash válido). |
| `qr-bu-exemplo-3-partes.png` | Leitor QR → "QR de imagem", ou Foto |
| `bu-exemplo-secao-0182.pdf` | Upload de PDF (é o mesmo boletim do QR, então é detectado como duplicata) |
| `bu-exemplo-secao-0183.png` | Foto → Galeria (OCR de outra seção) |

## Funcionalidades

| Escopo | Implementação |
|---|---|
| Leitor de QR Code | Câmera traseira com `BarcodeDetector` nativo, quando existe, ou `jsQR`. Lanterna, se o aparelho suportar. Aceita BU dividido em vários QR (`QRBU:i:n`), lidos em qualquer ordem. Fallback: digitar/colar o conteúdo ou ler QR de uma imagem. |
| Checksum / código verificador | A cadeia de **HASH SHA-512** de cada parte do QR é recalculada e conferida. Se não confere, a leitura é rejeitada. |
| Upload de PDF | `pdf.js` (build legacy). Valida tamanho (≤ 50 MB) e assinatura `%PDF-`. Se o PDF tiver QR Code, ele é lido e validado; senão, o texto é extraído e interpretado. PDF digitalizado (só imagem) → oferece OCR. |
| Foto / OCR | `Tesseract.js` com modelo português **servido localmente**, sem CDN. Pré-processamento (auto-contraste + binarização de Otsu), rotação manual e correção EXIF. Antes do OCR, procura QR Code na foto. |
| Revisão | PDF/OCR/manual passam por uma tela editável com confiança por campo: verde ≥ mínimo, amarelo < mínimo, vermelho < 50%, com os mínimos da seção 8.4 do escopo. Zona, local e seção abaixo de 95%, e qualquer campo abaixo de 50%, só são aceitos depois de marcados como conferidos ou editados. Confusões de OCR (`O→0`, `l→1`, `S→5`…) são corrigidas nos campos numéricos. |
| Validação estrutural | Campos obrigatórios; comparecimento + faltosos = aptos; soma dos candidatos = nominais; nominais + legenda + brancos + nulos = total apurado; total por cargo × comparecimento. O que for inconsistente vira alerta no dashboard e na auditoria. |
| Duplicidade | Ver abaixo. |
| Dashboard | Urnas lidas (/ esperadas), aptos, comparecimento, abstenção, origem das leituras, alertas, resultados por cargo com barras e % (sobre válidos ou sobre o total), filtros por município, zona e local. Atualiza sozinho a cada leitura ou exclusão. |
| Histórico | Busca (zona/local/seção/município), filtros por status, origem e data, detalhe completo (dados, validações, fingerprint, histórico de tentativas, dados brutos) e exclusão. |
| Exclusão | **Soft delete**: o registro fica marcado como `deletado`, os votos saem do total (o dashboard soma só registros ativos) e a operação vai para `historico_exclusoes`, com motivo e snapshot. |
| Auditoria | Sumário de integridade, inconsistências, log de exclusões, leituras descartadas com motivo, exportação CSV (resultados e leituras) e backup JSON. |
| Offline | Service worker (vite-plugin-pwa) pré-carrega o app, o pdf.js e o motor/modelo do OCR. Cada leitura é gravada em transação no IndexedDB, então nada se perde se o app fechar. |

## Proteção contra duplicação

Toda captura, de qualquer origem, é convertida para o mesmo formato normalizado (`Boletim`, em `src/domain/types.ts`). Ao gravar, o boletim é comparado com os registros **ativos** em três níveis:

1. **Fingerprint** = `SHA-256(zona | local | seção | data | eleitores aptos | votos canônicos)`. Os votos são serializados com os cargos em ordem fixa e os candidatos ordenados por número, então o mesmo boletim lido por QR, PDF ou foto gera o **mesmo** hash.
2. **Código de identificação da carga**: quando presente nas duas leituras.
3. **Mesma urna** (zona + seção + data) com conteúdo diferente: também é tratado como duplicata, e a tela destaca os campos **divergentes** (possível alteração ou erro de leitura).

Na tela de duplicata, o usuário pode **Descartar** (fica registrado no histórico do boletim e na auditoria), **Ver registro**, **Comparar detalhes** ou **Substituir registro anterior**. A substituição exclui o anterior (soft delete, com log) e contabiliza a nova leitura no lugar, de modo que os votos nunca são somados duas vezes. A verificação é repetida dentro da transação de gravação para evitar dupla contagem por cliques repetidos.

### Desvios em relação ao pseudocódigo do escopo, e por quê

- **Campos do fingerprint**: o escopo inclui código da carga, código da UE e nome do município. Na prática, o OCR muitas vezes não lê o código da carga, e o QR traz o *código* do município, não o nome. Com esses campos, o mesmo boletim geraria hashes diferentes conforme a origem. Por isso o fingerprint usa apenas campos presentes em todas as formas, e carga e urna são conferidas separadamente (níveis 2 e 3 acima).
- **"Forçar novo"** foi implementado como **substituir**, porque contabilizar a mesma urna duas vezes contraria o objetivo do sistema.
- **Tabela `votos_por_cargo`**: os totais são recalculados a partir das leituras ativas em vez de mantidos por incremento e decremento. O resultado é o mesmo, mas não há risco de o total divergir dos registros após uma exclusão. Com 10.000 leituras, o cálculo leva poucos milissegundos.
- **SQLite → IndexedDB** (via Dexie): é o banco nativo do navegador, funciona offline e em iOS/Android sem plugin nativo. Os nomes de tabelas e campos seguem o escopo (`leituras`, `historico_exclusoes`, `status`, `tipo_entrada`, `fingerprint`…), mais `descartes`, `candidatos` e `config`.
- **Câmera da foto**: usa a câmera nativa do aparelho (`<input capture>`), que tira fotos em resolução bem maior que o vídeo do navegador, o que melhora o OCR.

## Observações importantes

- **Formato do QR Code**: segue a especificação pública do TSE (pares `CHAVE:VALOR`; `CARG` abre cada cargo; números de candidato como chave). O hash é verificado aceitando as variações de representação do hash anterior (bytes ou hexadecimal). Conferido com QR Code real de urna do 2º turno de 2022 (o hash é o SHA-512 do conteúdo sem o cabeçalho `QRBU/VRQR/VRCH`). Se um QR real for rejeitado por hash, o cálculo precisa ser ajustado no código (`src/domain/qrbu.ts`).
- **Assinatura digital (campo `ASSI`)**: é armazenada, mas não é verificada contra a chave pública do TSE (previsto para a v3.0 no escopo).
- **Nomes de candidatos e municípios**: o QR traz só números. Os nomes vêm de leituras por PDF/OCR e são reaproveitados automaticamente.
- **Layout do BU impresso**: o parser de PDF/OCR é tolerante (rótulos sem acento e em qualquer caixa, valor na mesma linha ou na seguinte), mas foi testado com boletins de exemplo, não com toda variação real. A revisão antes de aceitar é a camada final de validação.
- **Compatibilidade**: o build é gerado para Safari 14+ e Chrome 87+. Versões muito antigas (iOS 12) não suportam partes do pdf.js e do Tesseract.

## Estrutura

```
src/
  domain/           regras puras (testadas)
    qrbu.ts           parser do QR do BU, montagem multi-parte, verificação de hash
    textoBu.ts        parser do texto de PDF/OCR com confiança por campo
    fingerprint.ts    fingerprint SHA-256 e chave da urna
    validacao.ts      validações estruturais
    comparacao.ts     comparação campo a campo (duplicatas)
    agregacao.ts      totais do dashboard
  db/database.ts    IndexedDB (Dexie): leituras, historico_exclusoes, descartes, candidatos, config
  services/
    registro.ts       duplicidade, gravação, descarte, soft delete
    capturaQr.ts      QR → captura validada
    pdf.ts | ocr.ts | imagem.ts   pdf.js, Tesseract.js, pré-processamento e detecção de QR
    exportacao.ts     CSV/JSON
  ui/               telas React (início, QR, PDF, foto, revisão, confirmação/duplicata,
                    dashboard, histórico, detalhe, auditoria, ajuda)
scripts/copy-ocr-assets.mjs   copia o worker, o núcleo WASM e o modelo `por` do Tesseract para public/
```
