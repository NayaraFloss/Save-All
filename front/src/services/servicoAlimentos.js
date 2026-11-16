import { api } from "./api";
const foodService = {
  async getAllFoods(lojaId, category) {
    try {
      let url = "/foods";
      const params = [];
      if (lojaId) params.push(`lojaId=${lojaId}`);
      if (category) params.push(`category=${category}`);
      if (params.length > 0) {
        url += `?${params.join("&")}`;
      }
      const response = await api.get(url);
      return response.data;
    } catch (error) {
      const msg = error.response?.data?.message || "Erro ao carregar os itens alimentares.";
      throw new Error(msg);
    }
  },
  async addFood(food) {
    try {
      const response = await api.post("/foods", food);
      return response.data;
    } catch (error) {
      const msg = error.response?.data?.message || "Erro ao cadastrar novo alimento excedente.";
      throw new Error(msg);
    }
  },
  async updateFood(id, data) {
    try {
      const response = await api.put(`/foods/${id}`, data);
      return response.data;
    } catch (error) {
      const msg = error.response?.data?.message || "Erro ao atualizar informa\xE7\xF5es do alimento.";
      throw new Error(msg);
    }
  },
  // Doação/descarte de vencidos: só os lotes vencidos saem; os lotes bons ficam no estoque.
  async baixarVencidos(id) {
    try {
      const response = await api.post(`/foods/${id}/baixar-vencidos`);
      return response.data;
    } catch (error) {
      const msg = error.response?.data?.message || "Erro ao dar baixa nos lotes vencidos.";
      throw new Error(msg);
    }
  },
  async removeFood(id) {
    try {
      const response = await api.delete(`/foods/${id}`);
      return response.data;
    } catch (error) {
      const msg = error.response?.data?.message || "Erro ao remover o alimento cadastrado.";
      throw new Error(msg);
    }
  }
};
export {
  foodService
};
