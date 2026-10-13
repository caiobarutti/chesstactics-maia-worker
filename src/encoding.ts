// SPDX-License-Identifier: GPL-3.0-only
// Parte do worker do Maia do ChessTactics Lab (ver README.md e LICENSE na raiz do repositório).
//
// Entrada e saída da rede Maia 3: a posição vira um tensor (64 casas x 12 peças), sempre do ponto de
// vista de quem joga, e a saída é um valor por lance possível. Funções puras, sem a rede.
import { Chess } from 'chess.js'

/** Tamanho da saída da rede: 64 x 64 pares origem-destino mais as 256 promoções. */
export const MAIA_MOVES = 4352

const PIECES = 'PNBRQKpnbrqk'
const PROMOTIONS = 'qrbn'

const file = (sq: string): number => sq.charCodeAt(0) - 97
const rank = (sq: string): number => sq.charCodeAt(1) - 49

/**
 * Posição de um lance (UCI, do ponto de vista das Brancas) na saída da rede: origem x 64 + destino,
 * com a1 = 0 e h8 = 63; as promoções vêm depois, por coluna de origem, coluna de destino e peça.
 */
export function moveIndex(uci: string): number {
  const from = uci.slice(0, 2)
  const to = uci.slice(2, 4)
  if (uci.length === 5) return 4096 + (file(from) * 8 + file(to)) * 4 + PROMOTIONS.indexOf(uci[4])
  return (rank(from) * 8 + file(from)) * 64 + rank(to) * 8 + file(to)
}

const mirrorSquare = (sq: string): string => sq[0] + (9 - Number(sq[1]))
const mirrorUci = (uci: string): string => mirrorSquare(uci.slice(0, 2)) + mirrorSquare(uci.slice(2, 4)) + uci.slice(4)
const swapCase = (c: string): string => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())

export interface MaiaInput {
  /** Peças por casa, (64, 12), sempre do ponto de vista de quem joga (tabuleiro espelhado para as Pretas). */
  tokens: Float32Array
  /** Lances legais e a posição de cada um na saída da rede. */
  moves: { uci: string; index: number }[]
}

export function encodePosition(fen: string): MaiaInput {
  const black = fen.split(' ')[1] === 'b'
  let ranks = fen.split(' ')[0].split('/')
  if (black) ranks = ranks.reverse().map((r) => [...r].map((c) => (/\d/.test(c) ? c : swapCase(c))).join(''))

  const tokens = new Float32Array(64 * 12)
  ranks.forEach((row, i) => {
    const r = 7 - i
    let f = 0
    for (const c of row) {
      if (/\d/.test(c)) f += Number(c)
      else tokens[(r * 8 + f++) * 12 + PIECES.indexOf(c)] = 1
    }
  })

  const moves: MaiaInput['moves'] = []
  for (const m of new Chess(fen).moves({ verbose: true })) {
    const uci = m.from + m.to + (m.promotion ?? '')
    moves.push({ uci, index: moveIndex(black ? mirrorUci(uci) : uci) })
  }
  return { tokens, moves }
}

export interface MoveProb {
  uci: string
  p: number
}

/** Probabilidade de cada lance legal (softmax só entre os legais), do mais para o menos provável. */
export function movePolicy(logits: ArrayLike<number>, moves: MaiaInput['moves']): MoveProb[] {
  const max = Math.max(...moves.map((m) => logits[m.index]))
  const exp = moves.map((m) => Math.exp(logits[m.index] - max))
  const sum = exp.reduce((a, b) => a + b, 0)
  return moves.map((m, i) => ({ uci: m.uci, p: exp[i] / sum })).sort((a, b) => b.p - a.p)
}
