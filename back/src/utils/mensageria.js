// Regras e textos da central de mensagens do Save All.
// Cada função recebe os dados já carregados e devolve a lista de mensagens
// formais do perfil. Não grava nada: quem controla "lida" e "dispensada" é o
// serviço de mensageria. O código só usa dados, para poder ser testado.

import { storeBelongsToCity } from './cidades'

const HORA = 3600000

// Faixas de aviso de vencimento para a loja, em horas restantes.
export const FAIXAS_VENCIMENTO = [24, 12, 6]
// Descontos (em %) que viram anúncio de promoção para o cliente.
export const FAIXAS_DESCONTO = [70, 60, 50]
// Depois deste tempo sem resposta, a entidade recebe um lembrete.
export const HORAS_PARA_LEMBRETE_ENTIDADE = 2
// Itens vencidos há mais dias que isto deixam de gerar mensagem.
const DIAS_MAXIMOS_VENCIDO = 7
// Máximo de anúncios de promoção exibidos ao mesmo tempo.
const MAX_PROMOCOES = 8

const moeda = (valor) =>
  Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const normalizar = (texto) =>
  String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

// O prazo de validade vale até o fim do dia informado (mesma regra da precificação).
const fimDoDia = (dataValidade) => {
  const [ano, mes, dia] = String(dataValidade || '')
    .slice(0, 10)
    .split('-')
    .map(Number)
  if (!ano || !mes || !dia) return null
  return new Date(ano, mes - 1, dia, 23, 59, 59, 999)
}

const dataBr = (data) =>
  data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

export const horasParaVencer = (dataValidade, agora = new Date()) => {
  const fim = fimDoDia(dataValidade)
  return fim ? (fim.getTime() - agora.getTime()) / HORA : null
}

const descreverHoras = (horas) => {
  if (horas < 1) return 'menos de 1 hora'
  const h = Math.ceil(horas)
  return `aproximadamente ${h} ${h === 1 ? 'hora' : 'horas'}`
}

const descreverDecorrido = (horas) => {
  if (horas < 1) {
    const min = Math.max(1, Math.round(horas * 60))
    return `há ${min} ${min === 1 ? 'minuto' : 'minutos'}`
  }
  if (horas < 48) {
    const h = Math.floor(horas)
    return `há ${h} ${h === 1 ? 'hora' : 'horas'}`
  }
  const d = Math.floor(horas / 24)
  return `há ${d} dias`
}

const unidades = (qtd) => {
  const n = Number(qtd)
  return Number.isFinite(n) && n > 0 ? ` (${n} ${n === 1 ? 'unidade' : 'unidades'})` : ''
}

const itemAtivo = (food) =>
  food && food.status === 'active' && (food.quantity === undefined || Number(food.quantity) > 0)

// ---------------------------------------------------------------------------
// LOJA: itens próximos do vencimento ou já vencidos
// ---------------------------------------------------------------------------
export function mensagensLoja({ foods = [], lojaId, agora = new Date() } = {}) {
  const lista = []
  for (const food of foods) {
    if (!lojaId || food.lojaId !== lojaId || !itemAtivo(food)) continue
    const horas = horasParaVencer(food.dataValidade, agora)
    if (horas === null) continue
    const fim = fimDoDia(food.dataValidade)

    if (horas <= 0) {
      if (horas < -DIAS_MAXIMOS_VENCIDO * 24) continue
      lista.push({
        id: `loja-vencido-${food.id}`,
        tipo: 'vencido',
        prioridade: 'alta',
        icone: 'event_busy',
        titulo: 'Item com prazo de validade expirado',
        texto:
          `Prezado(a) lojista, informamos que o item “${food.name}”${unidades(food.quantity)} ` +
          `encontra-se com o prazo de validade expirado desde ${dataBr(fim)}. ` +
          'O produto deixou de ser ofertado na vitrine. Solicitamos que seja encaminhado ' +
          'para doação ou descarte, em conformidade com a Lei Federal nº 14.016/2020.',
        criadaEm: fim.toISOString(),
        acao: { rota: 'PainelLoja', rotulo: 'Abrir o catálogo' },
      })
      continue
    }

    const faixa = [...FAIXAS_VENCIMENTO].sort((a, b) => a - b).find((f) => horas <= f)
    if (!faixa) continue
    lista.push({
      id: `loja-vencimento-${food.id}-${faixa}h`,
      tipo: 'vencimento',
      prioridade: faixa <= 12 ? 'alta' : 'media',
      icone: 'schedule',
      titulo: 'Item próximo do vencimento',
      texto:
        `Prezado(a) lojista, informamos que o item “${food.name}”${unidades(food.quantity)} ` +
        `vence em ${descreverHoras(horas)}, ao término do dia ${dataBr(fim)}. ` +
        'Recomendamos a aplicação de condições promocionais ou o encaminhamento do produto ' +
        'para doação antes do fim do prazo de validade.',
      // Momento em que o item entrou nesta faixa de aviso.
      criadaEm: new Date(fim.getTime() - faixa * HORA).toISOString(),
      acao: { rota: 'PainelLoja', rotulo: 'Abrir o catálogo' },
    })
  }
  return lista
}

// ---------------------------------------------------------------------------
// CLIENTE: anúncio de promoções (descontos relevantes na cidade escolhida)
// ---------------------------------------------------------------------------
// Decide se um item vira anúncio de promoção e, se não vira, explica o motivo.
// Usada tanto para gerar as mensagens quanto para o diagnóstico.
const avaliarPromocao = (food, { lojas, cidade, agora }) => {
  const original = Number(food.precoOriginal)
  const atual = Number(food.precoComDesconto)
  const desconto = original > 0 && atual > 0 ? Math.round((1 - atual / original) * 100) : null
  const horas = horasParaVencer(food.dataValidade, agora)
  const loja = lojas.get(food.lojaId)
  const minimo = Math.min(...FAIXAS_DESCONTO)
  const resultado = (gera, motivo, faixa = null) => ({
    gera,
    motivo,
    desconto,
    horas,
    faixa,
    original,
    atual,
    loja,
  })

  if (!itemAtivo(food)) return resultado(false, 'item inativo ou sem estoque')
  if (!(original > 0) || !(atual > 0)) return resultado(false, 'item sem preço válido')
  if (atual >= original) return resultado(false, 'sem desconto no momento')
  if (horas !== null && horas <= 0) return resultado(false, 'item vencido (não é ofertado)')
  const faixa = [...FAIXAS_DESCONTO].sort((a, b) => b - a).find((f) => desconto >= f)
  if (!faixa)
    return resultado(false, `desconto de ${desconto}% (o mínimo para anunciar é ${minimo}%)`)
  if (cidade && loja && !storeBelongsToCity(loja, cidade)) {
    return resultado(
      false,
      `loja fora da cidade escolhida (${loja.city || loja.address || 'sem cidade'})`,
    )
  }
  return resultado(true, 'GERA ANÚNCIO DE PROMOÇÃO', faixa)
}

export function mensagensCliente({
  foods = [],
  stores = [],
  usuario,
  cidade,
  agora = new Date(),
} = {}) {
  const lojas = new Map(stores.map((s) => [s.id, s]))
  const nome = usuario?.name ? usuario.name : 'cliente'
  const promocoes = []

  for (const food of foods) {
    const a = avaliarPromocao(food, { lojas, cidade, agora })
    if (!a.gera) continue
    promocoes.push({
      desconto: a.desconto,
      mensagem: {
        id: `cliente-promocao-${food.id}-${a.faixa}`,
        tipo: 'promocao',
        prioridade: 'informativa',
        icone: 'local_offer',
        titulo: `Promoção de ${a.desconto}% de desconto`,
        texto:
          `Prezado(a) ${nome}, o estabelecimento ${food.nomeLoja || a.loja?.name || 'parceiro'} ` +
          `disponibilizou “${food.name}” com ${a.desconto}% de desconto, ` +
          `de ${moeda(a.original)} por ${moeda(a.atual)}. ` +
          'A oferta é válida enquanto durarem os estoques.',
        criadaEm: null, // definida na primeira vez em que a mensagem é exibida
        acao: { rota: 'ListaAlimentos', consulta: { lojaId: food.lojaId }, rotulo: 'Ver a oferta' },
      },
    })
  }

  return promocoes
    .sort((a, b) => b.desconto - a.desconto)
    .slice(0, MAX_PROMOCOES)
    .map((p) => p.mensagem)
}

// Tabela para o Console: mostra, item por item, se vira promoção e por quê.
export function diagnosticarPromocoes({
  foods = [],
  stores = [],
  cidade,
  agora = new Date(),
} = {}) {
  const lojas = new Map(stores.map((s) => [s.id, s]))
  return foods.map((food) => {
    const a = avaliarPromocao(food, { lojas, cidade, agora })
    return {
      item: food.name,
      loja: food.nomeLoja,
      'preço cheio': a.original || '-',
      'preço atual': a.atual || '-',
      desconto: a.desconto === null ? '-' : `${a.desconto}%`,
      validade: food.dataValidade,
      'horas p/ vencer': a.horas === null ? '-' : Math.round(a.horas),
      resultado: a.motivo,
    }
  })
}

// Texto exibido quando a central está vazia, explicando o que gera mensagens.
export function dicaDaCentral({ usuario, cidade } = {}) {
  const minimo = Math.min(...FAIXAS_DESCONTO)
  const maximoHoras = Math.max(...FAIXAS_VENCIMENTO)
  switch (usuario?.role) {
    case 'client':
      return `Você será avisado(a) quando houver itens com ${minimo}% ou mais de desconto${cidade ? ` em ${cidade}` : ''}.`
    case 'store':
      return `Você será avisado(a) quando algum item estiver a ${maximoHoras} horas do vencimento ou vencido.`
    case 'institution':
      return 'Você será avisado(a) quando um estabelecimento propuser uma doação à sua entidade.'
    default:
      return 'Não há mensagens para o seu perfil.'
  }
}

// ---------------------------------------------------------------------------
// ENTIDADE: ofertas de doação aguardando aceite
// ---------------------------------------------------------------------------
const mesmaEntidade = (nomeOferta, nomeUsuario) => {
  const a = normalizar(nomeOferta)
  const b = normalizar(nomeUsuario)
  if (!a || !b) return false
  return a === b || (Math.min(a.length, b.length) >= 6 && (a.includes(b) || b.includes(a)))
}

export function mensagensEntidade({ ofertas = [], usuario, agora = new Date() } = {}) {
  const lista = []
  for (const oferta of ofertas) {
    if (oferta.status !== 'pending_inquiry') continue
    if (!mesmaEntidade(oferta.recipientOrg, usuario?.name)) continue

    const criada = new Date(oferta.criadoEm)
    const horas = Number.isNaN(criada.getTime()) ? 0 : (agora.getTime() - criada.getTime()) / HORA
    const lembrete = horas >= HORAS_PARA_LEMBRETE_ENTIDADE
    const peso = Number(oferta.weightEstimatedKg)
    const pesoTexto = peso > 0 ? `, com peso estimado de ${peso.toLocaleString('pt-BR')} kg` : ''
    const validade = fimDoDia(oferta.dataValidade)
    const validadeTexto = validade ? ` O produto possui validade até ${dataBr(validade)}.` : ''

    lista.push({
      id: `entidade-oferta-${oferta.id}-${lembrete ? 'lembrete' : 'nova'}`,
      tipo: lembrete ? 'doacao-lembrete' : 'doacao-nova',
      prioridade: lembrete ? 'alta' : 'media',
      icone: 'volunteer_activism',
      titulo: lembrete ? 'Doação aguardando a sua resposta' : 'Nova oferta de doação',
      texto:
        `Prezados(as), o estabelecimento ${oferta.nomeLoja} propôs a doação de ` +
        `“${oferta.foodName}”${unidades(oferta.quantity)}${pesoTexto}, ` +
        `registrada ${descreverDecorrido(horas)}.${validadeTexto} ` +
        'Solicitamos a gentileza de aceitar ou recusar a oferta, a fim de que o alimento ' +
        'possa ser aproveitado dentro do prazo de validade.',
      criadaEm: Number.isNaN(criada.getTime()) ? null : criada.toISOString(),
      acao: { rota: 'PainelEntidade', rotulo: 'Responder à oferta' },
    })
  }
  return lista
}

// Escolhe as regras conforme o perfil do usuário.
export function mensagensDoPerfil({
  usuario,
  foods,
  stores,
  ofertas,
  cidade,
  agora = new Date(),
} = {}) {
  switch (usuario?.role) {
    case 'client':
      return mensagensCliente({ foods, stores, usuario, cidade, agora })
    case 'store':
      return mensagensLoja({ foods, lojaId: String(usuario.id || '').replace('user-', ''), agora })
    case 'institution':
      return mensagensEntidade({ ofertas, usuario, agora })
    default:
      return []
  }
}
