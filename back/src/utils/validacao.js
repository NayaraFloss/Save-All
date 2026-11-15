import { ErroHttp } from './erros.js'

export const texto = (valor, { campo, min = 0, max = 500, obrigatorio = false } = {}) => {
  if (valor === undefined || valor === null || valor === '') {
    if (obrigatorio) throw new ErroHttp(400, `O campo ${campo} é obrigatório.`)
    return null
  }
  const s = String(valor).trim()
  if (s.length < min || (obrigatorio && s.length === 0)) throw new ErroHttp(400, `O campo ${campo} é obrigatório.`)
  if (s.length > max) throw new ErroHttp(400, `O campo ${campo} excede ${max} caracteres.`)
  return s
}

export const numero = (valor, { campo, min = 0, max = 1e7, inteiro = false, padrao } = {}) => {
  if (valor === undefined || valor === null || valor === '') {
    if (padrao !== undefined) return padrao
    throw new ErroHttp(400, `O campo ${campo} é obrigatório.`)
  }
  const n = Number(valor)
  if (!Number.isFinite(n) || n < min || n > max || (inteiro && !Number.isInteger(n))) {
    throw new ErroHttp(400, `Valor inválido para ${campo}.`)
  }
  return n
}

export const dataISO = (valor, campo) => {
  if (valor === undefined || valor === null || valor === '') return null
  const s = String(valor).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw new ErroHttp(400, `Data inválida em ${campo}.`)
  return s
}

export const arredondar = (n) => Math.round((n + Number.EPSILON) * 100) / 100

// Separa de "corpo" os campos extras (que não têm coluna própria).
export const extrasDe = (corpo, conhecidos) =>
  Object.fromEntries(Object.entries(corpo || {}).filter(([k, v]) => !conhecidos.includes(k) && v !== undefined))
