// =====================================================================
// utils/erros.js — FERRAMENTAS PARA ERROS
// =====================================================================

// Cria um tipo de erro novo que, além da mensagem, carrega um código HTTP (400, 401, 404...)
export class ErroHttp extends Error {
  // O "construtor" roda quando fazemos "new ErroHttp(404, 'texto')"
  constructor(status, mensagem) {
    // Chama o construtor do Error normal, guardando a mensagem
    super(mensagem)
    // Guarda o código HTTP dentro do erro
    this.status = status
  // Fecha o construtor
  }
// Fecha a classe
}

// Permite usar async/await nas rotas sem try/catch em cada uma.
// Recebe uma função de rota (fn) e devolve outra que, se der erro, entrega o erro ao "next" (o tratador de erros)
export const assincrono = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
