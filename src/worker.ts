// SPDX-License-Identifier: GPL-3.0-only
// Worker do Maia do ChessTactics Lab (ver README.md e LICENSE na raiz do repositório).
//
// Baixa o modelo Maia 3 e o runtime ONNX (WASM) uma vez, guarda os dois no Cache Storage (por isso os
// bots humanos funcionam sem conexão depois do primeiro uso) e roda a rede fora da thread principal.
// Recebe uma posição e um rating e devolve os lances prováveis (ver protocol.ts).
import * as ort from 'onnxruntime-web/wasm'
import { encodePosition, movePolicy } from './encoding'
import type { MaiaReply, MaiaRequest } from './protocol'

/** Nome do runtime ONNX (WASM), servido na mesma pasta do worker; definido na compilação (build.mjs). */
declare const __ORT_WASM__: string

const CACHE = 'chesstactics-maia-v1'
const MODEL = 'maia/maia3.onnx'
/** Tamanhos (modelo, runtime) para o progresso quando o servidor não informa o tamanho ou comprime a resposta. */
const EXPECTED_BYTES = [45_683_686, 14_239_897]

const reply = (msg: MaiaReply) => (self as unknown as { postMessage(m: MaiaReply): void }).postMessage(msg)

let session: ort.InferenceSession | null = null

/** Sem contexto seguro (http fora do localhost) não há Cache Storage: o bot funciona, mas baixa de novo a cada visita. */
const openCache = (): Promise<Cache | null> =>
  typeof caches === 'undefined' ? Promise.resolve(null) : caches.open(CACHE).catch(() => null)

async function load(base: string): Promise<void> {
  const cache = await openCache()
  const urls = [new URL(MODEL, base).href, new URL(__ORT_WASM__, self.location.href).href]
  const cached = await Promise.all(urls.map((u) => cache?.match(u)))
  const responses = await Promise.all(
    urls.map(async (u, i) => {
      if (cached[i]) return cached[i]
      const res = await fetch(u)
      if (!res.ok) throw new Error(`${res.status} ao baixar ${u}`)
      return res
    }),
  )

  // Com compressão, o Content-Length é o tamanho comprimido e não serve para medir o que já chegou.
  const sizeOf = (r: Response, i: number) =>
    (!r.headers.get('Content-Encoding') && Number(r.headers.get('Content-Length'))) || EXPECTED_BYTES[i]
  const total = responses.reduce((sum, r, i) => sum + (cached[i] ? 0 : sizeOf(r, i)), 0)
  let loaded = 0
  const buffers = await Promise.all(
    responses.map(async (res, i) => {
      if (cached[i] || !res.body) return new Uint8Array(await res.arrayBuffer())
      const chunks: Uint8Array[] = []
      const reader = res.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        loaded += value.length
        reply({ type: 'progress', loaded, total })
      }
      const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
      let at = 0
      for (const c of chunks) {
        bytes.set(c, at)
        at += c.length
      }
      // Cache cheio ou negado: segue sem guardar (baixa de novo na próxima visita).
      await cache?.put(urls[i], new Response(bytes, { headers: { 'Content-Length': String(bytes.length) } })).catch(() => undefined)
      return bytes
    }),
  )

  reply({ type: 'starting' })

  // Sobras de uma versão anterior do runtime (o nome do arquivo traz a versão).
  for (const old of (await cache?.keys()) ?? []) if (!urls.includes(old.url)) void cache?.delete(old)

  // Uma thread só: várias exigiriam SharedArrayBuffer (cabeçalhos COOP/COEP), como no Stockfish.
  ort.env.wasm.numThreads = 1
  ort.env.wasm.wasmBinary = buffers[1]
  session = await ort.InferenceSession.create(buffers[0])
}

self.onmessage = async ({ data }: MessageEvent<MaiaRequest>) => {
  if (data.type === 'init') {
    try {
      await load(data.base)
      reply({ type: 'ready' })
    } catch (e) {
      reply({ type: 'error', message: e instanceof Error ? e.message : String(e) })
    }
    return
  }
  try {
    if (!session) throw new Error('modelo não carregado')
    const { tokens, moves } = encodePosition(data.fen)
    if (moves.length === 0) return reply({ type: 'policy', id: data.id, moves: [] })
    const elo = Float32Array.from([data.elo])
    const out = await session.run({
      tokens: new ort.Tensor('float32', tokens, [1, 64, 12]),
      elo_self: new ort.Tensor('float32', elo, [1]),
      // O adversário é tratado como alguém da mesma faixa.
      elo_oppo: new ort.Tensor('float32', elo, [1]),
    })
    reply({ type: 'policy', id: data.id, moves: movePolicy(out.logits_move.data as Float32Array, moves) })
  } catch (e) {
    reply({ type: 'failed', id: data.id, message: e instanceof Error ? e.message : String(e) })
  }
}
