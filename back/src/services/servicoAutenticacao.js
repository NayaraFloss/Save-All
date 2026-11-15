import { api } from "./api";

// O back-end devolve a sessão num cookie httpOnly (o navegador guarda e envia sozinho).
const authService = {
  async login(usernameOrEmail, passwordSecret) {
    try {
      const response = await api.post("/auth/login", { email: usernameOrEmail, password: passwordSecret });
      return response.data;
    } catch (error) {
      const msg = error.response?.data?.message || "Erro ao realizar login. Verifique suas credenciais.";
      throw new Error(msg);
    }
  },
  async register(username, email, passwordSecret, role, address, extraFields) {
    try {
      const response = await api.post("/auth/signup", { username, email, password: passwordSecret, role, address, ...extraFields });
      return response.data;
    } catch (error) {
      const msg = error.response?.data?.message || "Erro ao realizar o cadastro.";
      throw new Error(msg);
    }
  },
  // Sem sessão válida o back-end responde 401 e aqui devolvemos null.
  async getCurrentUser() {
    try {
      const response = await api.get("/auth/me");
      return response.data;
    } catch {
      return null;
    }
  },
  async updateProfile(userId, data) {
    try {
      const response = await api.put("/auth/update-profile", data);
      return response.data;
    } catch (error) {
      const msg = error.response?.data?.message || "Erro ao atualizar perfil.";
      throw new Error(msg);
    }
  },
  async logout() {
    try {
      await api.post("/auth/logout");
    } catch {
      // Sem conexão: o cookie expira sozinho no prazo do token.
    }
  }
};
export {
  authService
};
