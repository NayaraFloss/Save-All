// =====================================================================
// utils/validacao.js — CONFERE OS DADOS QUE CHEGAM DO FRONT
// =====================================================================

// Importa o erro com código HTTP
import { ErroHttp } from './erros.js'

// Valida um texto: recebe o valor e as regras (nome do campo, mínimo, máximo, se é obrigatório)
export const texto = (valor, { campo, min = 0, max = 500, obrigatorio = false } = {}) => {
  // Se o valor está vazio
  if (valor === undefined || valor === null || valor === '') {
    // E era obrigatório: erro 400
    if (obrigatorio) throw new ErroHttp(400, `O campo ${campo} é obrigatório.`)
    // Se não era obrigatório, devolve null
    return null
  // Fecha o if
  }
  // Transforma em texto e tira espaços das pontas
  const s = String(valor).trim()
  // Se ficou menor que o mínimo (ou vazio sendo obrigatório): erro 400
  if (s.length < min || (obrigatorio && s.length === 0)) throw new ErroHttp(400, `O campo ${campo} é obrigatório.`)
  // Se passou do máximo: erro 400
  if (s.length > max) throw new ErroHttp(400, `O campo ${campo} excede ${max} caracteres.`)
  // Devolve o texto limpo
  return s
// Fecha a função
}

// Valida um número: mínimo, máximo (1e7 = 10 milhões), se precisa ser inteiro e um valor padrão
export const numero = (valor, { campo, min = 0, max = 1e7, inteiro = false, padrao } = {}) => {
  // Se o valor está vazio
  if (valor === undefined || valor === null || valor === '') {
    // Se existe um padrão, usa ele
    if (padrao !== undefined) return padrao
    // Senão, erro 400
    throw new ErroHttp(400, `O campo ${campo} é obrigatório.`)
  // Fecha o if
  }
  // Converte para número
  const n = Number(valor)
  // Se não é um número válido, está fora dos limites ou deveria ser inteiro e não é
  if (!Number.isFinite(n) || n < min || n > max || (inteiro && !Number.isInteger(n))) {
    // Erro 400
    throw new ErroHttp(400, `Valor inválido para ${campo}.`)
  // Fecha o if
  }
  // Devolve o número
  return n
// Fecha a função
}

// Valida uma data no formato AAAA-MM-DD
export const dataISO = (valor, campo) => {
  // Se vazio, devolve null
  if (valor === undefined || valor === null || valor === '') return null
  // Pega só os 10 primeiros caracteres
  const s = String(valor).slice(0, 10)
  // Se não tem o formato 0000-00-00 ou não é uma data real: erro 400
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw new ErroHttp(400, `Data inválida em ${campo}.`)
  // Devolve a data em texto
  return s
// Fecha a função
}

// Arredonda para 2 casas decimais (o EPSILON corrige erros de conta como 1.005)
export const arredondar = (n) => Math.round((n + Number.EPSILON) * 100) / 100

// Separa de "corpo" os campos extras (que não têm coluna própria).
// Fica só com os campos que NÃO estão na lista "conhecidos" e que têm valor
export const extrasDe = (corpo, conhecidos) =>
  // Transforma em lista de pares, filtra e volta a ser objeto
  Object.fromEntries(Object.entries(corpo || {}).filter(([k, v]) => !conhecidos.includes(k) && v !== undefined))
