// SPDX-License-Identifier: GPL-3.0-only
// Baixa o modelo Maia 3 para model/maia3.onnx (usado pelo `npm run smoke`). A origem exata está em model.json.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const source = JSON.parse(readFileSync('model.json', 'utf8'))
const url = `${source.repository.replace('github.com', 'raw.githubusercontent.com')}/${source.commit}/${source.path}`
const file = 'model/maia3.onnx'
const sha256 = (data) => createHash('sha256').update(data).digest('hex')

if (existsSync(file) && sha256(readFileSync(file)) === source.sha256) {
  console.log(`Modelo já está em ${file}`)
} else {
  console.log('Baixando o modelo do Maia (46 MB)…')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Falha ao baixar o modelo: ${res.status}`)
  const data = Buffer.from(await res.arrayBuffer())
  if (sha256(data) !== source.sha256) throw new Error('O modelo baixado não confere com o esperado.')
  mkdirSync('model', { recursive: true })
  writeFileSync(file, data)
  console.log(`Modelo salvo em ${file}`)
}
