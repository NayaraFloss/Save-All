// =====================================================================
// middlewares/erros.js — RESPOSTAS DE ERRO
// Transforma qualquer erro em uma resposta JSON { message } que o
// front-end sabe mostrar ao usuário.
// =====================================================================

// Importa as configurações (para saber se estamos em produção)
import { env } from '../config/env.js'

// Função usada quando ninguém respondeu à requisição: a rota não existe
export const naoEncontrado = (req, res) => {
  // Responde 404 com o método (GET, POST...) e o caminho que foi pedido
  res.status(404).json({ message: `Rota não encontrada: ${req.method} ${req.path}` })
// Fecha a função
}

// Formato de erro esperado pelo front: { message }
// Tratador de erros: o Express reconhece por ter 4 parâmetros (erro, req, res, next)
export const tratadorDeErros = (erro, _req, res, _next) => {
  // Corpo da requisição maior que o limite (10 MB): responde 413
  if (erro.type === 'entity.too.large') return res.status(413).json({ message: 'Arquivo/dados muito grandes.' })
  // O front mandou um JSON mal formatado: responde 400
  if (erro.type === 'entity.parse.failed') return res.status(400).json({ message: 'JSON inválido.' })
  // Erro criado por nós (ErroHttp) já tem código: usa ele e a mensagem
  if (erro.status) return res.status(erro.status).json({ message: erro.message })
  // Código 23505 do PostgreSQL = valor duplicado (ex.: e-mail já cadastrado): responde 409
  if (erro.code === '23505') return res.status(409).json({ message: 'Registro já existe.' })
  // Código 23503 = referência a um registro que não existe (chave estrangeira): responde 400
  if (erro.code === '23503') return res.status(400).json({ message: 'Referência inválida (registro relacionado não existe).' })
  // Regras de negócio do banco (gatilhos com RAISE, ex.: RN05) trazem a mensagem pronta;
  // CHECK de coluna (erro.constraint) recebe uma mensagem genérica.
  // Código 23514 = valor violou uma regra (CHECK) do banco
  if (erro.code === '23514') return res.status(400).json({ message: erro.constraint ? 'Valor fora do permitido.' : erro.message })
  // Qualquer outro erro inesperado: registra no terminal para o programador ver
  console.error('[erro]', erro)
  // Responde 500; em produção esconde os detalhes (segurança), em desenvolvimento mostra a mensagem real
  res.status(500).json({ message: env.producao ? 'Erro interno do servidor.' : erro.message })
// Fecha a função
}
