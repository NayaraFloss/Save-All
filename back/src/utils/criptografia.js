// =====================================================================
// utils/criptografia.js — PROTEGE DADOS SENSÍVEIS NO BANCO
// Embaralha (criptografa) a senha e o arquivo do certificado digital
// antes de salvar, e desembaralha quando o dono precisa ver.
// =====================================================================

// Importa o módulo de criptografia que já vem com o Node.js
import crypto from 'node:crypto'
// Importa as configurações (precisamos da chave de criptografia)
import { env } from '../config/env.js'

// Criptografia em repouso (AES-256-GCM) para dados sensíveis guardados em usuarios.extras.
// Formato gravado:  enc:v1:<iv>:<tag de autenticação>:<dados>   (tudo em base64)
// Texto que marca o início de um valor criptografado (para reconhecer depois)
const PREFIXO = 'enc:v1:'
// Converte a chave do .env (base64) em bytes, formato que o algoritmo exige
const chave = Buffer.from(env.chaveCriptografia, 'base64')

// Campos de "extras" que nunca ficam em texto puro no banco.
// (Para proteger outro campo, basta incluí-lo aqui.)
// pfxPassword = senha do certificado; pfxFileData = arquivo do certificado
export const CAMPOS_SENSIVEIS = ['pfxPassword', 'pfxFileData']

// Diz se um valor já está criptografado: é texto e começa com o prefixo
export const estaCriptografado = (valor) => typeof valor === 'string' && valor.startsWith(PREFIXO)

// Função que criptografa um texto
export function criptografar(texto) {
  // Se não for texto, se for vazio ou se já estiver criptografado, devolve sem mexer
  if (typeof texto !== 'string' || texto === '' || estaCriptografado(texto)) return texto
  // Gera 12 bytes aleatórios (IV): faz o mesmo texto virar um resultado diferente a cada vez
  const iv = crypto.randomBytes(12)
  // Prepara o "cifrador" com o algoritmo AES-256-GCM, a chave e o IV
  const cifra = crypto.createCipheriv('aes-256-gcm', chave, iv)
  // Criptografa o texto e junta os pedaços num só bloco de bytes
  const dados = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()])
  // Monta o texto final: prefixo + IV + etiqueta de autenticidade + dados, tudo em base64 separado por ":"
  return `${PREFIXO}${iv.toString('base64')}:${cifra.getAuthTag().toString('base64')}:${dados.toString('base64')}`
// Fecha a função
}

// Função que desfaz a criptografia
export function descriptografar(valor) {
  // Se não está criptografado, devolve como está
  if (!estaCriptografado(valor)) return valor // valor antigo, ainda em texto puro
  // Tenta descriptografar
  try {
    // Tira o prefixo, separa por ":" e converte cada parte de base64 para bytes
    const [iv, tag, dados] = valor.slice(PREFIXO.length).split(':').map((p) => Buffer.from(p, 'base64'))
    // Prepara o "decifrador" com o mesmo algoritmo, chave e IV
    const decifra = crypto.createDecipheriv('aes-256-gcm', chave, iv)
    // Informa a etiqueta: se o dado foi alterado, a descriptografia falha
    decifra.setAuthTag(tag)
    // Descriptografa, junta os pedaços e transforma de volta em texto
    return Buffer.concat([decifra.update(dados), decifra.final()]).toString('utf8')
  // Se falhar
  } catch {
    // Chave errada ou dado adulterado: não derruba a requisição, apenas não revela o valor.
    // Avisa no terminal
    console.error('[criptografia] não foi possível descriptografar um campo (CHAVE_CRIPTOGRAFIA alterada?)')
    // Devolve texto vazio
    return ''
  // Fecha o catch
  }
// Fecha a função
}

// Criptografa os campos sensíveis de um objeto "extras" antes de gravar.
export const protegerExtras = (extras) => {
  // Faz uma cópia do objeto para não alterar o original
  const saida = { ...extras }
  // Para cada campo sensível: se existir na cópia, troca pelo valor criptografado
  for (const campo of CAMPOS_SENSIVEIS) if (campo in saida) saida[campo] = criptografar(saida[campo])
  // Devolve a cópia protegida
  return saida
// Fecha a função
}

// Descriptografa os campos sensíveis para devolver ao dono da conta.
export const revelarExtras = (extras) => {
  // Faz uma cópia (se extras for vazio/nulo, começa com objeto vazio)
  const saida = { ...(extras || {}) }
  // Para cada campo sensível: se existir, troca pelo valor descriptografado
  for (const campo of CAMPOS_SENSIVEIS) if (campo in saida) saida[campo] = descriptografar(saida[campo])
  // Devolve a cópia legível
  return saida
// Fecha a função
}
