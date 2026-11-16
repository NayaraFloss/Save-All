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
// "Rua X, 120 - Centro, Xanxerê/SC" -> "Xanxerê, SC" (mesma regra do servidor). null se o endereço não termina em "Cidade/UF".
export const cidadeNoEndereco = (endereco) => {
  const m = String(endereco || '')
    .trim()
    .match(/([A-Za-zÀ-ÿ'. ]+?)\s*[/,-]\s*([A-Za-z]{2})\s*$/)
  if (!m) return null
  const cidade = m[1].trim()
  return cidade.length >= 2 ? `${cidade}, ${m[2].toUpperCase()}` : null
}

const nomeDaCidade = (c) => semAcento(String(c || '').split(',')[0].split('/')[0].trim())

// Cidade da loja no formato "Cidade, UF": a cadastrada; se faltar, a do fim do endereço; sem nenhuma, a principal (Pinhalzinho).
export const cidadeDaLoja = (loja) => {
  const cadastrada = String(loja?.city || '').trim()
  if (cadastrada) {
    const m = cadastrada.match(/^(.+?)\s*[/,-]\s*([A-Za-z]{2})$/)
    return m ? `${m[1].trim()}, ${m[2].toUpperCase()}` : `${cadastrada}, SC`
  }
  return cidadeNoEndereco(loja?.address) || CITIES[0]
}

// Cidades atendidas = cidades que têm loja cadastrada. As conhecidas (CITIES) vêm primeiro, na ordem de sempre;
// uma cidade nova (ex.: Xanxerê) entra sozinha, em ordem alfabética, assim que uma loja dela se cadastra.
// Enquanto as lojas não carregam, devolve a lista padrão para o seletor não ficar vazio.
export const cidadesDasLojas = (lojas) => {
  if (!lojas?.length) return CITIES
  const achadas = new Map()
  lojas.forEach((loja) => {
    const cidade = cidadeDaLoja(loja)
    const chave = nomeDaCidade(cidade)
    if (!achadas.has(chave)) achadas.set(chave, cidade)
  })
  const conhecidas = CITIES.filter((c) => achadas.has(nomeDaCidade(c)))
  const novas = [...achadas.entries()]
    .filter(([chave]) => !CITIES.some((c) => nomeDaCidade(c) === chave))
    .map(([, cidade]) => cidade)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const lista = [...conhecidas, ...novas]
  return lista.length ? lista : CITIES
}

export const storeBelongsToCity = (store, city) => {
  const nome = semAcento(String(city || '').split(',')[0].trim())
  if (!nome) return false
  const cidadeLoja = semAcento(String(store?.city || '').split(',')[0].trim())
  if (cidadeLoja) return cidadeLoja === nome
  // Sem cidade cadastrada: vale a cidade do fim do endereço ("... Xanxerê/SC"), se houver
  const doEndereco = cidadeNoEndereco(store?.address)
  if (doEndereco) return nomeDaCidade(doEndereco) === nome
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
  if (!lojas?.length || !alimentos?.length) return cidadesDasLojas(lojas)
  const comAlimentos = cidadesDasLojas(lojas).filter((cidade) =>
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
  return comAlimentos.length ? comAlimentos : cidadesDasLojas(lojas)
}
