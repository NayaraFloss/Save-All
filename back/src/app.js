// =====================================================================
// app.js — MONTA O APLICATIVO EXPRESS
// Express é a biblioteca que recebe as requisições (pedidos) do front
// e devolve respostas. Aqui ligamos as proteções e as rotas.
// =====================================================================

// Importa o Express, o "motor" do servidor web
import express from 'express'
// Importa o CORS: decide quais sites (front-ends) podem chamar esta API
import cors from 'cors'
// Importa o Helmet: adiciona cabeçalhos de segurança nas respostas
import helmet from 'helmet'
// Importa as configurações vindas do .env
import { env } from './config/env.js'
// Importa a lista de todas as rotas (endereços) da API
import rotas from './rotas/index.js'
// Importa as funções que respondem "rota não existe" e que tratam erros
import { naoEncontrado, tratadorDeErros } from './middlewares/erros.js'

// Cria o aplicativo e o exporta para o servidor.js poder usá-lo
export const app = express()

// Esconde o cabeçalho "X-Powered-By: Express" (não contar ao mundo qual tecnologia usamos)
app.disable('x-powered-by')
// Em produção a API fica atrás de proxies (Vercel -> Render). Confiar neles faz o
// limite de tentativas de login enxergar o IP real de cada visitante.
// Se estiver em produção, confia em até 2 "intermediários" para descobrir o IP verdadeiro
if (env.producao) app.set('trust proxy', 2)
// Liga o Helmet em todas as respostas
app.use(helmet())
// Liga o CORS com as regras abaixo
app.use(
  // Abre o objeto de configurações do CORS
  cors({
    // Para cada pedido: se não tiver origem (ex.: Postman) ou se a origem estiver na lista do .env, libera; senão bloqueia
    origin: (origem, cb) => (!origem || env.corsOrigens.includes(origem) ? cb(null, true) : cb(null, false)),
    // Tipos de requisição permitidos: ler, criar, substituir, alterar parte e apagar
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    // Cabeçalhos que o front pode enviar: tipo do conteúdo e autorização (token)
    allowedHeaders: ['Content-Type', 'Authorization'],
    // Permite o envio do cookie de sessão pelo front (axios withCredentials)
    credentials: true
  // Fecha as configurações do CORS
  })
// Fecha o app.use
)
// Cadastro pode levar fotos/certificado em base64.
// Faz o Express entender corpo em JSON e aceita até 10 MB por requisição
app.use(express.json({ limit: '10mb' }))

// Respostas da API nunca devem ficar em cache (nem no CDN da Vercel): são dados por usuário
// Para tudo que começa com /v1, roda esta função antes
app.use('/v1', (_req, res, next) => {
  // Coloca o cabeçalho "não guarde esta resposta em cache"
  res.set('Cache-Control', 'no-store')
  // Passa a vez para a próxima etapa (a rota de verdade)
  next()
// Fecha a função
})

// O front usa baseURL ".../v1"
// Todas as rotas ficam debaixo de /v1 (ex.: /v1/auth/login)
app.use('/v1', rotas)

// Se nenhuma rota respondeu, devolve erro 404 "rota não encontrada"
app.use(naoEncontrado)
// Se alguma rota deu erro, este tratador transforma o erro numa resposta organizada
app.use(tratadorDeErros)
