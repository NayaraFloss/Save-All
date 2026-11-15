export const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Retorna o timestamp de entrega do pedido.
 * Utiliza entregueEm prioritariamente, ou date se já estiver como delivered.
 */
export const getOrderDeliveryTimestamp = (order) => {
  if (!order) return null;
  const timeStr = order.entregueEm || (order.status === 'delivered' ? order.date : null);
  if (!timeStr) return null;
  const ts = new Date(timeStr).getTime();
  return isNaN(ts) ? null : ts;
};

/**
 * Verifica se o pedido foi entregue há no máximo 1 hora.
 * Regra do usuário: "após 1 hora entregue, nao deixe mais avaliar"
 */
export const isWithinOneHourOfDelivery = (order) => {
  if (!order || order.status !== 'delivered') return false;
  const deliveryTs = getOrderDeliveryTimestamp(order);
  if (!deliveryTs) return false;
  const diff = Date.now() - deliveryTs;
  return diff >= 0 && diff <= ONE_HOUR_MS;
};

/**
 * Retorna os minutos restantes dentro da janela de 1 hora para avaliar.
 */
export const getRemainingRatingMinutes = (order) => {
  if (!order || order.status !== 'delivered') return 0;
  const deliveryTs = getOrderDeliveryTimestamp(order);
  if (!deliveryTs) return 0;
  const diff = Date.now() - deliveryTs;
  const remaining = ONE_HOUR_MS - diff;
  return Math.max(0, Math.floor(remaining / (60 * 1000)));
};

/**
 * Verifica se a avaliação deste pedido ainda é permitida.
 */
export const canEvaluateOrder = (order) => {
  if (!order || order.status !== 'delivered') return false;
  return isWithinOneHourOfDelivery(order);
};
