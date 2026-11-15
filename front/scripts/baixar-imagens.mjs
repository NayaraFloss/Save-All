// Baixa as fotos originais (Unsplash) para src/assets/images.
// Uso: npm run imagens
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const destino = fileURLToPath(new URL('../src/assets/images/', import.meta.url))

// [nome do arquivo, id da foto no Unsplash, largura]
const fotos = [
  ['loja-itaipu', '1509440159596-0249088772ff', 200],
  ['loja-villa', '1544816155-12df9643f363', 200],
  ['loja-kiuda', '1501339847302-ac426a4a7cbb', 200],
  ['loja-bonissima', '1517433456452-f9633a875f6f', 200],
  ['loja-central', '1495474472287-4d71bcdd2085', 200],
  ['loja-selecao', '1555507036-ab1f4038808a', 200],
  ['alimento-01', '1628824851008-b4b6ba5526ef', 400],
  ['alimento-02', '1551024601-bec78aea704b', 400],
  ['alimento-03', '1589301760014-d929f3979dbc', 400],
  ['alimento-04', '1576618148400-f54bed99fcfd', 400],
  ['alimento-05', '1587314168485-3236d6710814', 400],
  ['avatar-padrao', '1494790108377-be9c29b29330', 200],
  ['avatar-02', '1534528741775-53994a69daeb', 200],
  ['avatar-03', '1507003211169-0a1dd7228f2d', 200],
  ['avatar-04', '1593113598332-cd288d649433', 200],
  ['avatar-05', '1542601906990-b4d3fb778b09', 200],
  ['avatar-06', '1535713875002-d1d0cf377fde', 200],
  ['avatar-07', '1570295999919-56ceb5ecca61', 200],
  ['avatar-08', '1544005313-94ddf0286df2', 200],
  ['avatar-09', '1438761681033-6461ffad8d80', 200],
  ['avatar-10', '1554118811-1e0d58224f24', 200],
  ['avatar-documento', '1554774853-aae0a22c8aa4', 200]
]

await mkdir(destino, { recursive: true })
let ok = 0
for (const [nome, id, largura] of fotos) {
  const url = `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&q=80&w=${largura}`
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    await writeFile(`${destino}${nome}.jpg`, Buffer.from(await res.arrayBuffer()))
    ok++
    console.log('ok  ', nome)
  } catch (e) {
    console.log('erro', nome, e.message)
  }
}
console.log(`${ok}/${fotos.length} imagens baixadas`)
