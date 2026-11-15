import { api } from "./api";
const storeService = {
  async getStores() {
    try {
      const response = await api.get("/stores");
      return response.data;
    } catch (error) {
      const msg = error.response?.data?.message || "Erro ao carregar estabelecimentos.";
      throw new Error(msg);
    }
  }
};
export {
  storeService
};
