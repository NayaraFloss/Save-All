// Importa a instância HTTP configurada para realizar as requisições à API do projeto.
import { api } from "./api";

// Agrupa todas as operações disponíveis para consultar e alterar alimentos excedentes.
const foodService = {
  // Busca os alimentos cadastrados e permite filtrar por loja e categoria.
  async getAllFoods(lojaId, category) {
    try {
      // Define o caminho base da consulta e prepara a lista de parâmetros opcionais.
      let url = "/foods";
      const params = [];
      // Adiciona o identificador da loja somente quando ele foi informado.
      if (lojaId) params.push(`lojaId=${lojaId}`);
      // Adiciona a categoria somente quando ela foi informada.
      if (category) params.push(`category=${category}`);
      // Converte todos os filtros em parâmetros anexados à URL da requisição.
      if (params.length > 0) {
        url += `?${params.join("&")}`;
      }
      // Envia a consulta GET à API e aguarda a resposta.
      const response = await api.get(url);
      // Retorna a lista ou os dados dos alimentos enviados pelo servidor.
      return response.data;
    } catch (error) {
      // Extrai a mensagem da API ou usa uma mensagem padrão de carregamento.
      const msg = error.response?.data?.message || "Erro ao carregar os itens alimentares.";
      // Propaga uma exceção padronizada para o componente que chamou o serviço.
      throw new Error(msg);
    }
  },
  // Cadastra um novo alimento excedente no servidor.
  async addFood(food) {
    try {
      // Envia os dados do alimento no corpo de uma requisição POST.
      const response = await api.post("/foods", food);
      // Retorna o alimento criado, incluindo os dados gerados pela API.
      return response.data;
    } catch (error) {
      // Extrai a mensagem de cadastro da API ou usa uma mensagem padrão.
      const msg = error.response?.data?.message || "Erro ao cadastrar novo alimento excedente.";
      throw new Error(msg);
    }
  },
  // Atualiza os dados de um alimento existente identificado pelo seu ID.
  async updateFood(id, data) {
    try {
      // Envia os novos dados por PUT substituindo ou atualizando o registro informado.
      const response = await api.put(`/foods/${id}`, data);
      // Retorna o registro atualizado fornecido pela API.
      return response.data;
    } catch (error) {
      // Extrai o erro do servidor ou usa uma mensagem padrão de atualização.
      const msg = error.response?.data?.message || "Erro ao atualizar informa\xE7\xF5es do alimento.";
      throw new Error(msg);
    }
  },
  // Dá baixa somente nos lotes vencidos de um alimento.
  async baixarVencidos(id) {
    try {
      // Solicita à API que processe a doação ou o descarte dos lotes vencidos.
      const response = await api.post(`/foods/${id}/baixar-vencidos`);
      // Retorna o resultado da baixa, mantendo no estoque os lotes ainda válidos.
      return response.data;
    } catch (error) {
      // Extrai a mensagem da API ou usa uma mensagem padrão de baixa.
      const msg = error.response?.data?.message || "Erro ao dar baixa nos lotes vencidos.";
      throw new Error(msg);
    }
  },
  // Remove completamente o cadastro de um alimento pelo seu ID.
  async removeFood(id) {
    try {
      // Envia uma requisição DELETE para apagar o registro informado.
      const response = await api.delete(`/foods/${id}`);
      // Retorna a confirmação ou os dados finais enviados pela API.
      return response.data;
    } catch (error) {
      // Extrai a mensagem de exclusão da API ou usa uma mensagem padrão.
      const msg = error.response?.data?.message || "Erro ao remover o alimento cadastrado.";
      throw new Error(msg);
    }
  }
};

// Exporta o objeto de serviço para que telas e outros módulos possam utilizá-lo.
export {
  foodService
};
