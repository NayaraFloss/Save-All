// Sacola Surpresa: o cliente nunca vê o nome da padaria nem os produtos sorteados.
// Só a loja enxerga o mix para separar e enviar. Esta função gera a "visão do cliente" do pedido.
export const NOME_LOJA_OCULTA = 'Padaria parceira'

export const ocultarSurpresa = (pedido) => {
  if (!pedido || !pedido.surpresa) return pedido
  const unidades = (pedido.items || []).reduce((soma, i) => soma + (Number(i.quantity) || 0), 0)
  return {
    ...pedido,
    nomeLoja: NOME_LOJA_OCULTA,
    items: [
      {
        itemId: 'sacola-surpresa',
        name: `Sacola Surpresa (${unidades} ${unidades === 1 ? 'produto' : 'produtos'})`,
        quantity: 1,
        price: Number(pedido.subtotal) || 0,
      },
    ],
  }
}
