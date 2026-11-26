// =====================================================================
// config/env.js — LÊ AS CONFIGURAÇÕES DO ARQUIVO .env
// O .env guarda segredos (senha do banco, chaves). Aqui conferimos se
// estão todos lá e juntamos tudo num objeto chamado "env".
// =====================================================================

// Carrega o arquivo .env e coloca cada linha dele em process.env
import 'dotenv/config'

// Cria a função "obrigatoria": busca uma variável e reclama se ela não existir
const obrigatoria = (nome) => {
  // Pega o valor da variável com aquele nome (ex.: process.env.JWT_SECRET)
  const valor = process.env[nome]
  // Se estiver vazia, para o programa com uma mensagem explicando o que falta
  if (!valor) throw new Error(`Variável de ambiente ${nome} não definida. Copie .env.example para .env e preencha.`)
  // Se existir, devolve o valor
  return valor
// Fecha a função
}

// Lê a chave secreta usada para assinar os tokens de login (obrigatória)
const jwtSecret = obrigatoria('JWT_SECRET')
// Se a chave for curta demais (menos de 16 letras), para o programa: seria fácil de adivinhar
if (jwtSecret.length < 16) throw new Error('JWT_SECRET precisa ter pelo menos 16 caracteres.')

// Chave de 32 bytes (base64) para criptografar o certificado digital guardado no banco.
// Lê a chave de criptografia (obrigatória)
const chaveCriptografia = obrigatoria('CHAVE_CRIPTOGRAFIA')
// Converte de base64 para bytes e confere se tem exatamente 32 bytes (exigência do AES-256)
if (Buffer.from(chaveCriptografia, 'base64').length !== 32) {
  // Se não tiver, para o programa e ensina como gerar uma chave correta
  throw new Error('CHAVE_CRIPTOGRAFIA inválida: precisa ter 32 bytes em base64. Gere com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"')
// Fecha o if
}

// Junta todas as configurações num objeto só e exporta para o resto do projeto usar
export const env = {
  // Porta onde a API vai rodar; se não tiver no .env, usa 3001
  porta: Number(process.env.PORT || 3001),
  // Endereço completo do banco de dados (obrigatório)
  databaseUrl: obrigatoria('DATABASE_URL'),
  // Chave secreta dos tokens (lida lá em cima)
  jwtSecret,
  // Chave de criptografia (lida lá em cima)
  chaveCriptografia,
  // Quanto tempo o login dura; se não tiver no .env, usa 7 dias
  jwtExpira: process.env.JWT_EXPIRES || '7d',
  // Lista de sites liberados no CORS: separa por vírgula, tira espaços e remove itens vazios
  corsOrigens: (process.env.CORS_ORIGIN || 'http://localhost:9000').split(',').map((s) => s.trim()).filter(Boolean),
  // Valor da taxa de entrega em reais; se não tiver no .env, usa 10
  taxaEntrega: Number(process.env.TAXA_ENTREGA ?? 10),
  // Verdadeiro se estiver rodando em produção (no ar para o público)
  producao: process.env.NODE_ENV === 'production'
// Fecha o objeto env
}
