// SPDX-License-Identifier: GPL-3.0-only
// Parte do worker do Maia do ChessTactics Lab (ver README.md e LICENSE na raiz do repositório).
//
// Mensagens que o worker entende e devolve (por `postMessage`). É a única forma de falar com ele:
// quem o usa manda uma posição e um rating e recebe os lances prováveis.

export type MaiaRequest =
  /** Carrega o modelo. `base` é a URL de onde `maia/maia3.onnx` é servido. */
  | { type: 'init'; base: string }
  /** Lances de um jogador de rating `elo` (escala do Lichess) na posição `fen`. */
  | { type: 'policy'; id: number; fen: string; elo: number }

export type MaiaReply =
  | { type: 'progress'; loaded: number; total: number }
  /** Arquivos em mãos (baixados ou do cache): falta iniciar a rede. */
  | { type: 'starting' }
  | { type: 'ready' }
  | { type: 'error'; message: string }
  /** Lances legais com a probabilidade de cada um, do mais para o menos provável. */
  | { type: 'policy'; id: number; moves: { uci: string; p: number }[] }
  | { type: 'failed'; id: number; message: string }
