import 'dotenv/config'

const obrigatoria = (nome) => {
  const valor = process.env[nome]
  if (!valor) throw new Error(`Variável de ambiente ${nome} não definida. Copie .env.example para .env e preencha.`)
  return valor
}

const jwtSecret = obrigatoria('JWT_SECRET')
if (jwtSecret.length < 16) throw new Error('JWT_SECRET precisa ter pelo menos 16 caracteres.')

// Chave de 32 bytes (base64) para criptografar o certificado digital guardado no banco.
const chaveCriptografia = obrigatoria('CHAVE_CRIPTOGRAFIA')
if (Buffer.from(chaveCriptografia, 'base64').length !== 32) {
  throw new Error('CHAVE_CRIPTOGRAFIA inválida: precisa ter 32 bytes em base64. Gere com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"')
}

export const env = {
  porta: Number(process.env.PORT || 3001),
  databaseUrl: obrigatoria('DATABASE_URL'),
  jwtSecret,
  chaveCriptografia,
  jwtExpira: process.env.JWT_EXPIRES || '7d',
  corsOrigens: (process.env.CORS_ORIGIN || 'http://localhost:9000').split(',').map((s) => s.trim()).filter(Boolean),
  taxaEntrega: Number(process.env.TAXA_ENTREGA ?? 10),
  producao: process.env.NODE_ENV === 'production'
}
