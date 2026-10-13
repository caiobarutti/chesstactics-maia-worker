// SPDX-License-Identifier: GPL-3.0-only
// Teste de fumaça: roda o Maia 3 fora do navegador e confere a codificação da posição.
// Uso: npm run smoke (precisa do modelo: npm run model)
import { readFileSync } from 'node:fs'
import * as ort from 'onnxruntime-web'
import { MAIA_MOVES, encodePosition, moveIndex, movePolicy } from '../src/encoding.ts'

const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(`FALHOU: ${msg}`)
  console.log(`ok  ${msg}`)
}

// A posição de cada lance na saída da rede é uma fórmula (não uma tabela copiada): confere os cantos.
assert(moveIndex('a1a1') === 0 && moveIndex('a1b1') === 1 && moveIndex('a1a2') === 8 && moveIndex('h8h8') === 4095, 'lances comuns: origem x 64 + destino')
assert(moveIndex('a7a8q') === 4096 && moveIndex('a7b8q') === 4100 && moveIndex('h7h8n') === MAIA_MOVES - 1, 'promoções depois dos lances comuns')

const session = await ort.InferenceSession.create(readFileSync('model/maia3.onnx'))

async function policy(fen: string, elo: number) {
  const { tokens, moves } = encodePosition(fen)
  const out = await session.run({
    tokens: new ort.Tensor('float32', tokens, [1, 64, 12]),
    elo_self: new ort.Tensor('float32', Float32Array.from([elo]), [1]),
    elo_oppo: new ort.Tensor('float32', Float32Array.from([elo]), [1]),
  })
  assert(out.logits_move.data.length === MAIA_MOVES, `saída com ${MAIA_MOVES} lances`)
  return movePolicy(out.logits_move.data as Float32Array, moves)
}
const show = (p: { uci: string; p: number }[]) => p.slice(0, 5).map((m) => `${m.uci} ${(m.p * 100).toFixed(0)}%`).join('  ')

const elo = 1850
const start = await policy('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', elo)
console.log('    inicial:', show(start))
assert(['e2e4', 'd2d4'].includes(start[0].uci), 'posição inicial: e4 ou d4')
assert(Math.abs(start.reduce((a, m) => a + m.p, 0) - 1) < 1e-6, 'as probabilidades dos lances legais somam 1')

const reply = await policy('rnbqkbnr/pppppppp/8/8/4P3/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1', elo)
console.log('    1. e4:', show(reply))
assert(['e7e5', 'c7c5'].includes(reply[0].uci), 'Pretas (tabuleiro espelhado): e5 ou c5 contra 1. e4')

// Dama pendurada em d5, vez das Pretas: quem captura é a dama de d8.
const hang = await policy('rnbqkbnr/ppp1pppp/8/3Q4/8/8/PPPP1PPP/RNB1KBNR b KQkq - 0 1', elo)
console.log('    dama pendurada:', show(hang))
assert(hang[0].uci === 'd8d5', 'captura a dama pendurada')

const mate = await policy('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', elo)
console.log('    mate em 1:', show(mate))
assert(mate[0].uci === 'a1a8', 'mate do corredor')

const promo = await policy('8/4P1k1/8/8/8/8/6K1/8 w - - 0 1', elo)
console.log('    promoção:', show(promo))
assert(promo[0].uci === 'e7e8q', 'promove a dama')

const weak = await policy('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 3 3', 1100)
const strong = await policy('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 3 3', 2000)
const defends = (p: { uci: string; p: number }[]) =>
  p.filter((m) => ['g8f6', 'd8f6', 'd8e7', 'g8h6'].includes(m.uci)).reduce((a, m) => a + m.p, 0)
console.log(`    mate do pastor defendido: 1100 ${(defends(weak) * 100).toFixed(0)}% · 2000 ${(defends(strong) * 100).toFixed(0)}%`)
assert(defends(strong) >= defends(weak), 'rating maior defende mais o mate do pastor')
console.log('Worker do Maia: tudo certo.')
