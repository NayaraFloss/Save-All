import { env } from '../config/env.js'

export const naoEncontrado = (req, res) => {
  res.status(404).json({ message: `Rota não encontrada: ${req.method} ${req.path}` })
}

// Formato de erro esperado pelo front: { message }
export const tratadorDeErros = (erro, _req, res, _next) => {
  if (erro.type === 'entity.too.large') return res.status(413).json({ message: 'Arquivo/dados muito grandes.' })
  if (erro.type === 'entity.parse.failed') return res.status(400).json({ message: 'JSON inválido.' })
  if (erro.status) return res.status(erro.status).json({ message: erro.message })
  if (erro.code === '23505') return res.status(409).json({ message: 'Registro já existe.' })
  if (erro.code === '23503') return res.status(400).json({ message: 'Referência inválida (registro relacionado não existe).' })
  // Regras de negócio do banco (gatilhos com RAISE, ex.: RN05) trazem a mensagem pronta;
  // CHECK de coluna (erro.constraint) recebe uma mensagem genérica.
  if (erro.code === '23514') return res.status(400).json({ message: erro.constraint ? 'Valor fora do permitido.' : erro.message })
  console.error('[erro]', erro)
  res.status(500).json({ message: env.producao ? 'Erro interno do servidor.' : erro.message })
}
