// Cálculos do "Resumo da loja" (tela Início): produtos vendidos, lucro faturado,
// doações e descartes por dia. Fica separado do visual para poder ser testado.

const chave = (valor) => {
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return null
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

// Lista os últimos N dias (do mais antigo até hoje).
export function diasRecentes(qtd, hoje = new Date()) {
  const dias = []
  for (let i = qtd - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - i)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    dias.push({ chave: chave(d), rotulo: `${dd}/${mm}` })
  }
  return dias
}

const soma = (lista) => lista.reduce((s, v) => s + v, 0)
const arredonda = (v, casas) => Math.round(v * 10 ** casas) / 10 ** casas

export function resumoLoja({ orders, disposals, dias = 7, hoje = new Date() } = {}) {
  // Aceita listas ausentes (null/undefined) enquanto os dados ainda carregam.
  orders = Array.isArray(orders) ? orders : []
  disposals = Array.isArray(disposals) ? disposals : []
  const eixo = diasRecentes(dias, hoje)
  const posicao = Object.fromEntries(eixo.map((d, i) => [d.chave, i]))
  const zeros = () => eixo.map(() => 0)
  const vendidos = zeros()
  const faturado = zeros()
  const doacao = zeros()
  const descarte = zeros()

  // Só conta pedido entregue. Faturado = valor dos produtos (sem a taxa de entrega).
  for (const o of orders) {
    if (o.status !== 'delivered') continue
    const i = posicao[chave(o.deliveredAt || o.date)]
    if (i === undefined) continue
    vendidos[i] += (o.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0)
    faturado[i] += Number(o.subtotal) || 0
  }

  for (const d of disposals) {
    const i = posicao[chave(d.date)]
    if (i === undefined) continue
    const kg = Number(d.weightEstimatedKg) || 0
    if (d.type === 'donation') doacao[i] += kg
    else if (d.type === 'discard') descarte[i] += kg
  }

  return {
    rotulos: eixo.map((d) => d.rotulo),
    vendidos: { serie: vendidos, total: soma(vendidos) },
    faturado: { serie: faturado.map((v) => arredonda(v, 2)), total: arredonda(soma(faturado), 2) },
    doacao: { serie: doacao.map((v) => arredonda(v, 2)), total: arredonda(soma(doacao), 1) },
    descarte: { serie: descarte.map((v) => arredonda(v, 2)), total: arredonda(soma(descarte), 1) },
  }
}
