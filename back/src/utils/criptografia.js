import crypto from 'node:crypto'
import { env } from '../config/env.js'

// Criptografia em repouso (AES-256-GCM) para dados sensíveis guardados em usuarios.extras.
// Formato gravado:  enc:v1:<iv>:<tag de autenticação>:<dados>   (tudo em base64)
const PREFIXO = 'enc:v1:'
const chave = Buffer.from(env.chaveCriptografia, 'base64')

// Campos de "extras" que nunca ficam em texto puro no banco.
// (Para proteger outro campo, basta incluí-lo aqui.)
export const CAMPOS_SENSIVEIS = ['pfxPassword', 'pfxFileData']

export const estaCriptografado = (valor) => typeof valor === 'string' && valor.startsWith(PREFIXO)

export function criptografar(texto) {
  if (typeof texto !== 'string' || texto === '' || estaCriptografado(texto)) return texto
  const iv = crypto.randomBytes(12)
  const cifra = crypto.createCipheriv('aes-256-gcm', chave, iv)
  const dados = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()])
  return `${PREFIXO}${iv.toString('base64')}:${cifra.getAuthTag().toString('base64')}:${dados.toString('base64')}`
}

export function descriptografar(valor) {
  if (!estaCriptografado(valor)) return valor // valor antigo, ainda em texto puro
  try {
    const [iv, tag, dados] = valor.slice(PREFIXO.length).split(':').map((p) => Buffer.from(p, 'base64'))
    const decifra = crypto.createDecipheriv('aes-256-gcm', chave, iv)
    decifra.setAuthTag(tag)
    return Buffer.concat([decifra.update(dados), decifra.final()]).toString('utf8')
  } catch {
    // Chave errada ou dado adulterado: não derruba a requisição, apenas não revela o valor.
    console.error('[criptografia] não foi possível descriptografar um campo (CHAVE_CRIPTOGRAFIA alterada?)')
    return ''
  }
}

// Criptografa os campos sensíveis de um objeto "extras" antes de gravar.
export const protegerExtras = (extras) => {
  const saida = { ...extras }
  for (const campo of CAMPOS_SENSIVEIS) if (campo in saida) saida[campo] = criptografar(saida[campo])
  return saida
}

// Descriptografa os campos sensíveis para devolver ao dono da conta.
export const revelarExtras = (extras) => {
  const saida = { ...(extras || {}) }
  for (const campo of CAMPOS_SENSIVEIS) if (campo in saida) saida[campo] = descriptografar(saida[campo])
  return saida
}
