# chesstactics-maia-worker

Programa que roda a rede **Maia 3** no navegador, num _Web Worker_: recebe uma posição de xadrez e um rating
e devolve os lances que um jogador daquela faixa provavelmente faria. É usado pelo ChessTactics Lab para os
bots "humanos", o sparring de aberturas e a preparação do repertório.

Licença: **GPL-3.0** (texto completo em `LICENSE`). Este programa é distribuído na esperança de ser útil,
mas SEM NENHUMA GARANTIA.

## Arquivos

| Arquivo | Conteúdo |
| :-- | :-- |
| `src/worker.ts` | O worker: baixa o modelo e o runtime ONNX, guarda os dois no cache do navegador e roda a rede |
| `src/encoding.ts` | Entrada e saída da rede: posição → tensor (64 × 12), lance → posição na saída, softmax entre os lances legais |
| `src/protocol.ts` | As mensagens que o worker recebe e devolve |
| `build.mjs` | Compilação (esbuild) |
| `model.json` | De onde vem o modelo: repositório, commit, caminho e SHA-256 |
| `scripts/model.mjs`, `scripts/smoke.ts` | Baixa o modelo e confere a codificação rodando a rede em Node |

## Como compilar

Precisa de Node ≥ 22.13.

```bash
npm ci
npm run build       # gera dist/
npm run typecheck
npm run model       # baixa o modelo (46 MB) para model/
npm run smoke       # roda a rede em Node e confere a codificação
```

O `package-lock.json` fixa as versões exatas das dependências. O `dist/` de cada versão é versionado junto
do código (quem usa o pacote não precisa compilar); a compilação o gera de novo:

| Arquivo | Conteúdo |
| :-- | :-- |
| `maia-worker.js` | O worker, com `onnxruntime-web` e `chess.js` embutidos |
| `ort-wasm-simd-threaded-<versão>.wasm` | Runtime ONNX, copiado sem alteração do pacote `onnxruntime-web` |
| `THIRD-PARTY-LICENSES.txt` | Licenças das duas bibliotecas embutidas |

## Como usar

Sirva os arquivos de `dist/` numa mesma pasta e o modelo em `<base>maia/maia3.onnx`. O único contato com o
worker é por mensagens (`postMessage`), descritas em `src/protocol.ts`:

```js
const worker = new Worker('/maia-worker/maia-worker.js', { type: 'module' })
worker.postMessage({ type: 'init', base: 'https://exemplo.com/' })   // carrega <base>maia/maia3.onnx
worker.postMessage({ type: 'policy', id: 1, fen: '<FEN>', elo: 1850 })
// resposta: { type: 'policy', id: 1, moves: [{ uci: 'e2e4', p: 0.41 }, ...] }
```

Antes de `ready`, o worker avisa o andamento do download (`progress`) e o início da rede (`starting`). O
rating é na escala do Lichess. O modelo e o runtime ficam no Cache Storage do navegador depois do primeiro
uso.

## O que ele usa

- **Modelo Maia 3** (`maia3.onnx`), dos autores do Maia (CSSLab, Universidade de Toronto), sob GPL-3.0. Não
  faz parte deste repositório: é servido como arquivo separado, sem modificação. A origem exata está em
  `model.json`, e há uma cópia do repositório de origem em
  <https://github.com/caiobarutti/maia-platform-frontend>.
- **onnxruntime-web** (Microsoft, MIT): executa o modelo.
- **chess.js** (Jeff Hlywa, BSD-2-Clause): gera os lances legais.
