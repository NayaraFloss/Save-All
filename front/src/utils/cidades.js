// Cidades atendidas pelo SaveAll (região de Pinhalzinho/SC)
export const CITIES = [
  'Pinhalzinho, SC',
  'Saudades, SC',
  'Nova Erechim, SC',
  'Chapec\xF3, SC',
]

const semAcento = (t) =>
  String(t || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

// A loja pertence à cidade? Compara pela cidade cadastrada da loja e, se faltar, pelo endereço.
// Loja sem cidade e sem outra cidade no endereço conta como Pinhalzinho (cidade principal).
export const storeBelongsToCity = (store, city) => {
  const nome = semAcento(String(city || '').split(',')[0].trim())
  if (!nome) return false
  const cidadeLoja = semAcento(String(store?.city || '').split(',')[0].trim())
  if (cidadeLoja) return cidadeLoja === nome
  const endereco = semAcento(store?.address)
  if (endereco.includes(nome)) return true
  if (nome === 'pinhalzinho') {
    const outras = CITIES.map((c) => semAcento(c.split(',')[0].trim())).filter((c) => c !== 'pinhalzinho')
    return !outras.some((c) => endereco.includes(c))
  }
  return false
}

const normalizeText = (t) =>
  String(t || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

// "Chapecó, SC" -> "Chapecó"
export const getCityName = (city) =>
  String(city || '')
    .split(',')[0]
    .trim()

// O endereço informado pertence à cidade do pedido?
export const addressMatchesCity = (address, city) => {
  const name = normalizeText(getCityName(city))
  if (!name) return true
  return normalizeText(address).includes(name)
}

// O endereço cita alguma OUTRA cidade conhecida?
export const addressMentionsOtherCity = (address, city) => {
  return CITIES.filter((c) => c !== city).some((c) => addressMatchesCity(address, c))
}

// "Chapecó, SC" -> "Chapecó/SC" (formato usado nos endereços)
export const cityToAddressSuffix = (city) => String(city || '').replace(/,\s*/, '/')

// Cidades com pelo menos um produto à venda no banco (loja da cidade com alimento ativo e em estoque).
// Enquanto lojas/alimentos não carregarem, devolve a lista completa para o seletor não ficar vazio.
export const cidadesComAlimentos = (lojas, alimentos) => {
  if (!lojas?.length || !alimentos?.length) return CITIES
  const comAlimentos = CITIES.filter((cidade) =>
    lojas.some(
      (loja) =>
        storeBelongsToCity(loja, cidade) &&
        alimentos.some(
          (alimento) =>
            alimento.lojaId === loja.id &&
            alimento.status === 'active' &&
            (alimento.quantity === undefined || alimento.quantity > 0),
        ),
    ),
  )
  return comAlimentos.length ? comAlimentos : CITIES
}
