import crypto from 'node:crypto'
import { ErroHttp } from '../utils/erros.js'

// Utilitários dos adaptadores: convertem os objetos do front (em inglês, como o app
// sempre usou) para as colunas das tabelas do banco (em português) e vice-versa.
// Campos do front que não têm coluna própria ficam na coluna "extras" (jsonb).

export const sha256 = (conteudo) => crypto.createHash('sha256').update(String(conteudo)).digest('hex')

export const somenteDigitos = (v) => String(v || '').replace(/\D/g, '')

// Remove null/undefined para o objeto do front ficar igual ao que ele mesmo gravaria
export const limpar = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined))

export const extrasSem = (corpo, mapeados) => {
  const extras = {}
  for (const [k, v] of Object.entries(corpo || {})) {
    if (k === 'id' || mapeados.includes(k) || v === undefined) continue
    extras[k] = v
  }
  return extras
}

export const textoOu = (v, padrao = null, max = 500) => {
  if (v === undefined || v === null) return padrao
  const s = String(v).trim()
  return s ? s.slice(0, max) : padrao
}

export const numeroOu = (v, padrao = null) => {
  const n = Number(v)
  return v === '' || v === null || v === undefined || !Number.isFinite(n) ? padrao : n
}

export const dataOu = (v) => {
  const s = String(v || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : null
}

export const momentoOu = (v) => {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export const horaOu = (v) => {
  const s = String(v || '').trim()
  return /^\d{1,2}:\d{2}(:\d{2})?$/.test(s) ? s : null
}

// Situação de validação: o front chama de "inactive" o que o banco chama de "unlinked"
const VALIDACAO_PARA_BANCO = { inactive: 'unlinked', unlinked: 'unlinked', pending_review: 'pending_review', validated: 'validated', rejected: 'rejected' }
export const validacaoParaBanco = (v) => VALIDACAO_PARA_BANCO[v] || 'pending_review'
export const validacaoParaFront = (v) => (v === 'unlinked' ? 'inactive' : v)

// Erros de banco mais comuns viram mensagens claras
export function traduzir(erro, mensagens = {}) {
  if (erro instanceof ErroHttp) return erro
  if (erro.code === '23505') return new ErroHttp(409, mensagens.duplicado || 'Já existe um registro com estes dados.')
  if (erro.code === '23503') return new ErroHttp(409, mensagens.vinculado || 'Registro vinculado a outros dados.')
  if (erro.code === '23514' && !erro.constraint) return new ErroHttp(400, erro.message)
  if (erro.code === '23514') return new ErroHttp(400, mensagens.regra || 'Valor fora do permitido.')
  if (erro.code === '23502') return new ErroHttp(400, `Campo obrigatório não informado (${erro.column}).`)
  return erro
}

// Monta INSERT/UPDATE a partir de um objeto { coluna: valor }
export function montarInsert(tabela, colunas) {
  const nomes = Object.keys(colunas)
  const marcas = nomes.map((n, i) => (n === 'extras' ? `$${i + 1}::jsonb` : `$${i + 1}`))
  return {
    sql: `INSERT INTO ${tabela} (${nomes.join(', ')}) VALUES (${marcas.join(', ')}) RETURNING *`,
    valores: nomes.map((n) => (n === 'extras' ? JSON.stringify(colunas[n]) : colunas[n]))
  }
}

export function montarUpdate(tabela, id, colunas) {
  const nomes = Object.keys(colunas)
  const sets = nomes.map((n, i) => (n === 'extras' ? `${n} = $${i + 1}::jsonb` : `${n} = $${i + 1}`))
  return {
    sql: `UPDATE ${tabela} SET ${sets.join(', ')} WHERE id = $${nomes.length + 1} RETURNING *`,
    valores: [...nomes.map((n) => (n === 'extras' ? JSON.stringify(colunas[n]) : colunas[n])), id]
  }
}

// A loja do usuário logado (perfil loja)
export async function lojaDoUsuario(consultar, usuarioId, db) {
  const { rows } = await consultar('SELECT id, nome, cnpj, endereco, telefone FROM lojas WHERE usuario_id = $1', [usuarioId], db)
  return rows[0] || null
}

// Procura a entidade social por id, CNPJ ou nome
export async function acharEntidade(consultar, { id, cnpj, nome }, db) {
  if (id) {
    const { rows } = await consultar('SELECT * FROM entidades_sociais WHERE id = $1', [String(id)], db)
    if (rows[0]) return rows[0]
  }
  const digitos = somenteDigitos(cnpj)
  if (digitos) {
    const { rows } = await consultar(
      `SELECT * FROM entidades_sociais WHERE regexp_replace(cnpj, '\\D', '', 'g') = $1 LIMIT 1`, [digitos], db)
    if (rows[0]) return rows[0]
  }
  if (nome) {
    const { rows } = await consultar('SELECT * FROM entidades_sociais WHERE lower(nome) = lower($1) LIMIT 1', [String(nome).trim()], db)
    if (rows[0]) return rows[0]
  }
  return null
}

// Doação só para entidades da MESMA cidade do estabelecimento
// (lojas.cidade = "Pinhalzinho, SC"; entidades_sociais.cidade = "Pinhalzinho")
const nomeDaCidade = (texto) =>
  String(texto || '')
    .split(/[,/-]/)[0]
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

export async function garantirMesmaCidade(consultar, lojaId, entidade, db) {
  if (!lojaId || !entidade) return
  const { rows } = await consultar('SELECT cidade FROM lojas WHERE id = $1', [lojaId], db)
  const cidadeLoja = nomeDaCidade(rows[0]?.cidade)
  const cidadeEntidade = nomeDaCidade(entidade.cidade)
  if (cidadeLoja && cidadeEntidade && cidadeLoja !== cidadeEntidade) {
    throw new ErroHttp(
      400,
      `Só é permitido usar entidades e destinos da mesma cidade do estabelecimento (${rows[0].cidade.split(',')[0].trim()}). ${entidade.nome} é de ${entidade.cidade}.`
    )
  }
}
