export class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem)
    this.status = status
  }
}

// Permite usar async/await nas rotas sem try/catch em cada uma.
export const assincrono = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
