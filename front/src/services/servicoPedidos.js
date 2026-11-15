import { api } from "./api";
const orderService = {
  async getOrders(clienteId, lojaId) {
    try {
      let url = "/orders";
      const params = [];
      if (clienteId) params.push(`clienteId=${clienteId}`);
      if (lojaId) params.push(`lojaId=${lojaId}`);
      if (params.length > 0) {
        url += `?${params.join("&")}`;
      }
      const response = await api.get(url);
      return response.data;
    } catch (error) {
      const msg = error.response?.data?.message || "Erro ao consultar hist\xF3rico de pedidos.";
      throw new Error(msg);
    }
  },
  async createOrder(order) {
    try {
      const response = await api.post("/orders", order);
      return response.data;
    } catch (error) {
      const msg = error.response?.data?.message || "Erro ao processar e enviar seu pedido.";
      throw new Error(msg);
    }
  },
  async updateOrderStatus(id, status, extraFields) {
    try {
      const response = await api.patch(`/orders/${id}`, { status, ...extraFields });
      return response.data;
    } catch (error) {
      const msg = error.response?.data?.message || "Erro ao atualizar situa\xE7\xE3o do pedido.";
      throw new Error(msg);
    }
  },
  async submitOrderEvaluation(id, evaluation) {
    try {
      const isFoodComplaint = evaluation.reclamacaoComida || evaluation.notaComida === 1;
      const response = await api.patch(`/orders/${id}`, {
        notaComida: evaluation.notaComida,
        comentarioComida: evaluation.comentarioComida || "",
        reclamacaoComida: isFoodComplaint,
        avaliadoEm: (/* @__PURE__ */ new Date()).toISOString()
      });
      return response.data;
    } catch (error) {
      const msg = error.response?.data?.message || "Erro ao enviar avalia\xE7\xE3o do pedido.";
      throw new Error(msg);
    }
  }
};
export {
  orderService
};
