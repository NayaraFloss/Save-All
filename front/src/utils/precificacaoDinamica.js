// Produto feito e vencendo no mesmo dia (mais fresco): desconto fixo o dia todo.
// O percentual é digitado pela loja; este é o valor padrão.
export const DESCONTO_PRODUTO_DO_DIA = 50

export const CONFIG_PRECIFICACAO_PADRAO = {
  ativo: true,
  descontoFaixa1: 10,
  descontoFaixa2: 25,
  descontoFaixa3: 50,
  descontoProdutoDia: DESCONTO_PRODUTO_DO_DIA,
}

export const LIMITES_PRECIFICACAO = {
  faixa1: {
    min: 5,
    max: 20,
    default: 10,
    name: 'Faixa 1 – Atenção',
    rangeStr: '50% a 69% do prazo',
  },
  faixa2: {
    min: 15,
    max: 40,
    default: 25,
    name: 'Faixa 2 – Alerta',
    rangeStr: '70% a 89% do prazo',
  },
  faixa3: {
    min: 30,
    max: 70,
    default: 50,
    name: 'Faixa 3 – Crítico',
    rangeStr: '90% a 99% do prazo',
  },
  produtoDia: {
    min: 0,
    max: 99,
    default: DESCONTO_PRODUTO_DO_DIA,
    name: 'Produto do Dia',
    rangeStr: 'feito e vencendo no mesmo dia',
  },
}

function paraDataLocal(valor, fimDoDia) {
  const texto = String(valor ?? '')
  if (/^\d{4}-\d{2}-\d{2}/.test(texto) && texto.length <= 10) {
    return new Date(`${texto}${fimDoDia ? 'T23:59:59.999' : 'T00:00:00'}`)
  }
  return new Date(valor)
}

/**
 * Calculates dynamic price based on elapsed shelf-life percentage.
 * Formula: % Consumido = (Dias decorridos desde a fabricação / Prazo total de validade) * 100
 */
export function calcularPrecificacaoDinamica(
  fabricationDateStr,
  expirationDateStr,
  precoOriginal,
  customConfig = {},
  referenceDate = new Date(),
) {
  const config = {
    ...CONFIG_PRECIFICACAO_PADRAO,
    ...customConfig,
  }

  // Clamp config values within platform allowed limits
  const f1 = Math.min(Math.max(config.descontoFaixa1, 5), 20)
  const f2 = Math.min(Math.max(config.descontoFaixa2, 15), 40)
  const f3 = Math.min(Math.max(config.descontoFaixa3, 30), 70)
  // Produto do Dia: percentual digitado pela loja (valor inválido volta ao padrão)
  const limiteDia = LIMITES_PRECIFICACAO.produtoDia
  const descontoDigitado =
    config.descontoProdutoDia === '' || config.descontoProdutoDia == null
      ? NaN
      : Number(config.descontoProdutoDia)
  const descontoDia = Number.isFinite(descontoDigitado)
    ? Math.min(Math.max(Math.round(descontoDigitado), limiteDia.min), limiteDia.max)
    : DESCONTO_PRODUTO_DO_DIA

  // Datas só com dia (AAAA-MM-DD): fabricação vale desde 00:00 e a validade vai até 23:59:59
  // do dia informado — assim um item feito e vencido no mesmo dia tem 24h de prazo.
  const fab = paraDataLocal(fabricationDateStr, false)
  const exp = paraDataLocal(expirationDateStr, true)
  const ref = new Date(referenceDate)

  // If invalid dates or fabrication >= expiration, fallback to 0% consumed
  let prazoTotalMs = exp.getTime() - fab.getTime()
  if (isNaN(prazoTotalMs) || prazoTotalMs <= 0) {
    prazoTotalMs = 24 * 60 * 60 * 1000 // default 1 day
  }

  let decorridoMs = ref.getTime() - fab.getTime()
  if (isNaN(decorridoMs) || decorridoMs < 0) {
    decorridoMs = 0
  }

  const prazoTotalDias = Math.max(0.1, prazoTotalMs / (1000 * 60 * 60 * 24))
  const diasDecorridos = decorridoMs / (1000 * 60 * 60 * 24)
  const diasRestantes = (exp.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24)

  let rawPercent = (decorridoMs / prazoTotalMs) * 100
  if (isNaN(rawPercent)) rawPercent = 0

  const percentualConsumido = Math.max(0, Math.round(rawPercent * 10) / 10)

  const mesmoDia =
    String(fabricationDateStr ?? '').slice(0, 10) !== '' &&
    String(fabricationDateStr).slice(0, 10) === String(expirationDateStr ?? '').slice(0, 10)
  let faixaIndex = 0
  let faixaNome = 'Faixa 0 – Normal'
  let faixaTag = 'Normal (Preço Cheio)'
  let faixaColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
  let percentualDesconto = 0
  let vencido = false
  let textoStatus = 'Em vitrine (Preço regular)'

  // O limite de validade vale SEMPRE (mesmo com a automação desligada): produto vencido não fica na vitrine.
  if (percentualConsumido >= 100 || diasRestantes <= 0) {
    faixaIndex = 4
    faixaNome = 'Faixa 4 – Limite (Vencimento)'
    faixaTag = 'Expirado / Limite Atingido'
    faixaColor = 'text-slate-400 bg-slate-800 border-slate-700'
    percentualDesconto = 100
    vencido = true
    textoStatus = 'Saiu da vitrine → Encaminhar para Doação ou Descarte'
  } else if (!config.ativo) {
    // Automação desligada: nenhum desconto automático (nem faixas, nem Produto do Dia)
    percentualDesconto = 0
  } else if (mesmoDia) {
    faixaIndex = 3
    faixaNome = 'Produto do Dia'
    faixaTag = `Feito hoje, vence hoje (${descontoDia}% fixo)`
    faixaColor = 'text-rose-400 bg-rose-500/10 border-rose-500/20'
    percentualDesconto = descontoDia
    textoStatus = `Em vitrine (Produto fresco do dia, desconto fixo de ${descontoDia}%)`
  } else if (percentualConsumido >= 90) {
    faixaIndex = 3
    faixaNome = 'Faixa 3 – Crítico'
    faixaTag = 'Atenção Crítica (Desconto Alto)'
    faixaColor = 'text-rose-400 bg-rose-500/10 border-rose-500/20'
    percentualDesconto = f3
    textoStatus = 'Em vitrine (Atenção máxima ao vencimento)'
  } else if (percentualConsumido >= 70) {
    faixaIndex = 2
    faixaNome = 'Faixa 2 – Alerta'
    faixaTag = 'Atenção Elevada (Desconto Médio)'
    faixaColor = 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    percentualDesconto = f2
    textoStatus = 'Em vitrine (Procurar liquidação)'
  } else if (percentualConsumido >= 50) {
    faixaIndex = 1
    faixaNome = 'Faixa 1 – Atenção'
    faixaTag = 'Meia Validade (Desconto Leve)'
    faixaColor = 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
    percentualDesconto = f1
    textoStatus = 'Em vitrine (Desconto inicial aplicado)'
  }

  const precoComDesconto = Math.max(0, precoOriginal * (1 - percentualDesconto / 100))
  const valorEconomizado = Math.max(0, precoOriginal - precoComDesconto)

  return {
    percentualConsumido,
    prazoTotalDias: Math.round(prazoTotalDias * 10) / 10,
    diasDecorridos: Math.round(diasDecorridos * 10) / 10,
    diasRestantes: Math.round(diasRestantes * 10) / 10,
    faixaIndex,
    faixaNome,
    faixaTag,
    faixaColor,
    percentualDesconto,
    precoOriginal,
    precoComDesconto: Math.round(precoComDesconto * 100) / 100,
    valorEconomizado: Math.round(valorEconomizado * 100) / 100,
    vencido,
    textoStatus,
  }
}

// ---------------------------------------------------------------------
// RN-02 – Sorteio ponderado de itens por valor informado pelo cliente.
// O cliente informa quanto quer gastar (mínimo R$ 5,00) e o sistema monta
// o pedido sorteando, entre TODAS as lojas, os itens que cabem nesse valor.
// O sorteio é ponderado: itens mais próximos do vencimento (faixa mais alta)
// têm preferência e saem primeiro, e lojas que vendem há mais tempo recebem
// um bônus de chance, para não concentrar tudo sempre nas mesmas lojas.
// ---------------------------------------------------------------------
export const VALOR_MINIMO_PEDIDO = 5

/**
 * @param {Array} itensDisponiveis - itens em vitrine (precisam de dataFabricacao,
 *   dataValidade, precoOriginal e id; opcionalmente diasDesdeUltimaVendaDaLoja).
 * @param {number} valorAlvo - valor em reais que o cliente quer gastar.
 * @param {object} [opcoes] - { tolerancia, dataReferencia }.
 */
export function sortearItensPorValor(itensDisponiveis, valorAlvo, opcoes = {}) {
  const tolerancia = opcoes.tolerancia ?? 1 // quanto pode faltar pra bater o valor-alvo
  const dataReferencia = opcoes.dataReferencia ?? new Date()

  if (!(Number(valorAlvo) >= VALOR_MINIMO_PEDIDO)) {
    return {
      itensSelecionados: [],
      valorTotal: 0,
      erro: `O valor mínimo para um pedido é de R$ ${VALOR_MINIMO_PEDIDO.toFixed(2)}.`,
    }
  }

  // Calcula o preço e a faixa de vencimento de cada item no momento do sorteio,
  // e descarta os que já venceram ou não cabem no valor informado.
  let pool = itensDisponiveis
    .map((item) => {
      const calc = calcularPrecificacaoDinamica(
        item.dataFabricacao,
        item.dataValidade,
        Number(item.precoOriginal) || 0,
        item.configPrecificacaoDinamica || {},
        dataReferencia,
      )
      return { item, calc }
    })
    .filter(
      ({ calc }) =>
        !calc.vencido && calc.precoComDesconto > 0 && calc.precoComDesconto <= Number(valorAlvo),
    )

  const itensSelecionados = []
  let valorAcumulado = 0

  while (pool.length) {
    const restante = Number(valorAlvo) - valorAcumulado
    if (restante < tolerancia) break

    const elegiveis = pool.filter(({ calc }) => calc.precoComDesconto <= restante)
    if (!elegiveis.length) break

    // Peso = quanto mais perto do vencimento (faixaIndex maior), mais chance de ser
    // sorteado primeiro; lojas sem vender há mais tempo ganham um bônus de até 2x.
    const pesos = elegiveis.map(({ item, calc }) => {
      const pesoFaixa = calc.faixaIndex + 1
      const diasSemVender = item.diasDesdeUltimaVendaDaLoja ?? 0
      const pesoRotatividade = 1 + Math.min(diasSemVender, 10) / 10
      return pesoFaixa * pesoRotatividade
    })
    const pesoTotal = pesos.reduce((soma, p) => soma + p, 0)

    let sorteio = Math.random() * pesoTotal
    let indiceEscolhido = 0
    for (let i = 0; i < pesos.length; i++) {
      sorteio -= pesos[i]
      if (sorteio <= 0) {
        indiceEscolhido = i
        break
      }
    }

    const escolhido = elegiveis[indiceEscolhido]
    itensSelecionados.push({ ...escolhido.item, calc: escolhido.calc })
    valorAcumulado += escolhido.calc.precoComDesconto
    pool = pool.filter(({ item }) => item.id !== escolhido.item.id)
  }

  return {
    itensSelecionados,
    valorTotal: Math.round(valorAcumulado * 100) / 100,
    erro: itensSelecionados.length
      ? null
      : 'Nenhum item disponível dentro do valor informado no momento.',
  }
}

/**
 * Ordena uma lista de itens para exibição, colocando primeiro os que estão
 * com alerta de vencimento mais avançado (faixa mais alta = mais urgente).
 */
export function ordenarPorUrgenciaDeVencimento(itensDisponiveis, dataReferencia = new Date()) {
  return [...itensDisponiveis]
    .map((item) => ({
      item,
      calc: calcularPrecificacaoDinamica(
        item.dataFabricacao,
        item.dataValidade,
        Number(item.precoOriginal) || 0,
        item.configPrecificacaoDinamica || {},
        dataReferencia,
      ),
    }))
    .filter(({ calc }) => !calc.vencido)
    .sort(
      (a, b) =>
        b.calc.faixaIndex - a.calc.faixaIndex || a.calc.diasRestantes - b.calc.diasRestantes,
    )
    .map(({ item, calc }) => ({ ...item, calc }))
}

/**
 * Formata uma data (AAAA-MM-DD ou ISO) em dd/mm/aaaa sem deslocar o dia por fuso horário.
 * `new Date('2026-11-16')` é lido como UTC e, no Brasil (UTC-3), aparecia como 15/11.
 */
export function formatarDataBR(valor) {
  if (!valor) return 'N/A'
  const texto = String(valor)
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto)
  if (m && texto.length <= 10) return `${m[3]}/${m[2]}/${m[1]}`
  const d = new Date(valor)
  return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString('pt-BR')
}
