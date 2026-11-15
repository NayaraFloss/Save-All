import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { env } from './config/env.js'
import rotas from './rotas/index.js'
import { naoEncontrado, tratadorDeErros } from './middlewares/erros.js'

export const app = express()

app.disable('x-powered-by')
// Em produção a API fica atrás de proxies (Vercel -> Render). Confiar neles faz o
// limite de tentativas de login enxergar o IP real de cada visitante.
if (env.producao) app.set('trust proxy', 2)
app.use(helmet())
app.use(
  cors({
    origin: (origem, cb) => (!origem || env.corsOrigens.includes(origem) ? cb(null, true) : cb(null, false)),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    // Permite o envio do cookie de sessão pelo front (axios withCredentials)
    credentials: true
  })
)
// Cadastro pode levar fotos/certificado em base64.
app.use(express.json({ limit: '10mb' }))

// Respostas da API nunca devem ficar em cache (nem no CDN da Vercel): são dados por usuário
app.use('/v1', (_req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

// O front usa baseURL ".../v1"
app.use('/v1', rotas)

app.use(naoEncontrado)
app.use(tratadorDeErros)
