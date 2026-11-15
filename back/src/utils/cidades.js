export const CITIES = [
  'Pinhalzinho, SC',
  'Chapec\xF3, SC',
  'Florian\xF3polis, SC',
  'Porto Alegre, RS',
  'S\xE3o Paulo, SP',
]

export const storeBelongsToCity = (store, city) => {
  if (store.city && store.city.toLowerCase() === city.toLowerCase()) {
    return true
  }
  const cityNameOnly = city.split(',')[0].trim().toLowerCase()
  if (store.city && store.city.toLowerCase().includes(cityNameOnly)) {
    return true
  }
  if (store.address && store.address.toLowerCase().includes(cityNameOnly)) {
    return true
  }
  if (cityNameOnly === 'pinhalzinho') {
    const otherCities = [
      'chapec\xF3',
      'chapeco',
      'florian\xF3polis',
      'florianopolis',
      'porto alegre',
      's\xE3o paulo',
      'sao paulo',
    ]
    const isOther = otherCities.some(
      (c) =>
        (store.city && store.city.toLowerCase().includes(c)) ||
        (store.address && store.address.toLowerCase().includes(c)),
    )
    return !isOther
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
