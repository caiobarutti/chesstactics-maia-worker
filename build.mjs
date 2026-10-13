// SPDX-License-Identifier: GPL-3.0-only
// Compila o worker: um arquivo JavaScript (dist/maia-worker.js) e, ao lado dele, o runtime ONNX (WASM),
// copiado sem alteração do pacote onnxruntime-web.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
/** Pasta de um pacote instalado (o `package.json` nem sempre é exportado: sobe a partir da entrada). */
function packageDir(name) {
  let dir = dirname(require.resolve(name))
  for (;;) {
    try {
      if (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name === name) return dir
    } catch {
      // sem package.json nesta pasta
    }
    dir = dirname(dir)
  }
}
const ortDir = packageDir('onnxruntime-web')
const chessDir = packageDir('chess.js')
const ortVersion = JSON.parse(readFileSync(join(ortDir, 'package.json'), 'utf8')).version
const chessVersion = JSON.parse(readFileSync(join(chessDir, 'package.json'), 'utf8')).version
// A versão vai no nome: o worker guarda o runtime no cache do navegador pela URL.
const wasm = `ort-wasm-simd-threaded-${ortVersion}.wasm`

rmSync('dist', { recursive: true, force: true })
mkdirSync('dist')
await build({
  entryPoints: ['src/worker.ts'],
  outfile: 'dist/maia-worker.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  define: { __ORT_WASM__: JSON.stringify(wasm) },
  banner: {
    js: `/*! chesstactics-maia-worker ${pkg.version} | GPL-3.0-only | código-fonte: https://github.com/caiobarutti/chesstactics-maia-worker | inclui onnxruntime-web ${ortVersion} (MIT) e chess.js ${chessVersion} (BSD-2-Clause): ver THIRD-PARTY-LICENSES.txt */`,
  },
})
cpSync(join(ortDir, 'dist/ort-wasm-simd-threaded.wasm'), `dist/${wasm}`)
writeFileSync(
  'dist/THIRD-PARTY-LICENSES.txt',
  [
    // O pacote onnxruntime-web não traz o arquivo da licença: o texto (MIT, do repositório microsoft/onnxruntime) fica aqui.
    [`onnxruntime-web ${ortVersion}`, 'licenses/onnxruntime-web.txt'],
    [`chess.js ${chessVersion}`, join(chessDir, 'LICENSE')],
  ]
    .map(([name, file]) => `${name}\n${'='.repeat(name.length)}\n\n${readFileSync(file, 'utf8').trim()}\n`)
    .join('\n\n'),
)
console.log(`dist/maia-worker.js e dist/${wasm}`)
