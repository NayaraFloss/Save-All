// Regra de pontos do programa de fidelidade SaveAll.
// Deve permanecer idêntica à regra aplicada no servidor (controladores/pedidos.js).
export const PONTOS_POR_REAL = 10        // a cada R$ 1,00 pago, 10 pontos
export const VALOR_PONTO = 0.005         // cada ponto equivale a R$ 0,005 (meio centavo)
export const BLOCO_REAIS = 5             // bloco usado nos exemplos (R$ 5,00)

export const pontosPorBloco = () => BLOCO_REAIS * PONTOS_POR_REAL
export const centavosPorPonto = () => VALOR_PONTO * 100
export const pontosGanhos = (totalPago) => Math.floor(Math.max(0, Number(totalPago) || 0) * PONTOS_POR_REAL)
export const descontoDosPontos = (pontos) => Math.max(0, Number(pontos) || 0) * VALOR_PONTO
