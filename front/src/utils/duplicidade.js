// Mesma regra do servidor: nome e CPF/CNPJ não podem se repetir entre contas e estabelecimentos.
// A comparação ignora maiúsculas, acentos e espaços extras.
export const normalizarNome = (nome) =>
  String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

export const somenteDigitos = (v) => String(v || '').replace(/\D/g, '')

// Devolve a mensagem do primeiro conflito, ou "" se estiver tudo certo.
// usuarioId / lojaId: o próprio registro (e a loja do próprio usuário) não contam como repetição.
export function conflitoDeCadastro(
  { nome, documento, usuarioId = null, lojaId = null },
  usuarios = [],
  lojas = [],
) {
  const n = normalizarNome(nome)
  if (n) {
    const usuario = usuarios.find((u) => u.id !== usuarioId && normalizarNome(u.name) === n)
    const loja = lojas.find(
      (l) =>
        l.id !== lojaId &&
        (!usuarioId || l.usuarioId !== usuarioId) &&
        normalizarNome(l.name) === n,
    )
    const repetido = usuario || loja
    if (repetido)
      return `Já existe uma conta ou estabelecimento com o nome "${repetido.name}". Escolha outro nome.`
  }
  const d = somenteDigitos(documento)
  if (d) {
    const usuario = usuarios.find((u) => u.id !== usuarioId && somenteDigitos(u.cpfCnpj) === d)
    const loja = lojas.find(
      (l) =>
        l.id !== lojaId &&
        (!usuarioId || l.usuarioId !== usuarioId) &&
        somenteDigitos(l.cnpj) === d,
    )
    if (usuario || loja)
      return `Já existe uma conta cadastrada com o ${d.length > 11 ? 'CNPJ' : 'CPF'} ${documento}.`
  }
  return ''
}

// CNPJ válido: 14 números, não todos iguais, e com os dois dígitos verificadores corretos.
export function cnpjValido(valor) {
  const d = somenteDigitos(valor)
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false
  const calc = (base) => {
    let soma = 0
    let peso = base.length - 7
    for (const n of base) {
      soma += Number(n) * peso--
      if (peso < 2) peso = 9
    }
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }
  return calc(d.slice(0, 12)) === Number(d[12]) && calc(d.slice(0, 13)) === Number(d[13])
}

// Entidade social: nome ou CNPJ não podem repetir os de outra entidade.
// id: a própria entidade (na edição ela não conta como repetição).
export function conflitoDeEntidade({ nome, cnpj, id = null }, entidades = []) {
  const outras = entidades.filter((e) => e.id !== id)
  const n = normalizarNome(nome)
  if (n) {
    const igual = outras.find((e) => normalizarNome(e.name) === n)
    if (igual) return `Já existe uma entidade com o nome "${igual.name}". Escolha outro nome.`
  }
  const d = somenteDigitos(cnpj)
  if (d) {
    const igual = outras.find((e) => somenteDigitos(e.cnpj) === d)
    if (igual) return `Já existe uma entidade cadastrada com o CNPJ ${cnpj} (${igual.name}).`
  }
  return ''
}
