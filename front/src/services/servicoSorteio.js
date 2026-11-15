import { IMAGES } from 'src/assets/images'
import { storeBelongsToCity } from 'src/utils/cidades'
import { calcularPrecificacaoDinamica } from 'src/utils/precificacaoDinamica'
import { armazem } from './armazemServidor'
// O rodízio de cada cliente fica no servidor (tabela dados_usuario, chave "rotacao_sorteio").
const CHAVE_ROTACAO = 'rotacao_sorteio'
class ServicoSorteio {
  getStorageState() {
    const estado = armazem.dado(CHAVE_ROTACAO, {})
    return {
      historicoPorCidade: estado.historicoPorCidade || {},
      totalSorteios: estado.totalSorteios || 0,
    }
  }
  saveStorageState(state) {
    armazem.salvarDado(CHAVE_ROTACAO, state)
  }
  /**
   * Identifica estabelecimentos pertencentes à cidade selecionada que oferecem produtos
   * ou atendimento para a categoria indicada (doce, salgado ou misto).
   * RN: A opção 'misto' só inclui padarias/estabelecimentos que têm ambas as opções (doce E salgado).
   */
  getEligibleStores(city, category, allStores, allFoods) {
    // Lojas e alimentos vêm sempre do servidor (passados pela tela a partir do estadoApp).
    // So sorteia estabelecimento que consegue receber o pedido: com conta de loja vinculada e nao suspenso
    const storeList = (allStores && allStores.length > 0 ? allStores : []).filter(
      (store) => store.usuarioId && !store.suspenso,
    )
    const foodList = allFoods && allFoods.length > 0 ? allFoods : []
    const cityStores = storeList.filter((store) => storeBelongsToCity(store, city))
    const baseStores = cityStores.length > 0 ? cityStores : storeList
    if (baseStores.length === 0) {
      return []
    }
    if (category === 'misto') {
      // Misto so existe no sorteio: vale para loja que tenha pelo menos um doce E um salgado disponiveis.
      const lojasCom = (tipo) =>
        new Set(
          foodList
            .filter((f) => f.category === tipo && f.status === 'active' && jaFabricado(f))
            .map((f) => f.lojaId),
        )
      const storesWithDoce = lojasCom('doce')
      const storesWithSalgado = lojasCom('salgado')
      return baseStores.filter(
        (store) => storesWithDoce.has(store.id) && storesWithSalgado.has(store.id),
      )
    }
    const storesWithCategory = new Set(
      foodList
        .filter(
          (f) =>
            (f.category === category || f.category === 'misto') &&
            f.status === 'active' &&
            jaFabricado(f),
        )
        .map((f) => f.lojaId),
    )
    const filtered = baseStores.filter((store) => storesWithCategory.has(store.id))
    return filtered.length > 0 ? filtered : baseStores
  }
  /**
   * Realiza o sorteio rotativo justo (Round-Robin):
   * - Cada estabelecimento é sorteado exatamente uma vez por ciclo.
   * - O cliente não escolhe a loja nem a comida específica.
   * - Quando todas as lojas da cidade tiverem sido sorteadas uma vez, o ciclo reinicia.
   */
  sortearEstabelecimento(params) {
    const { city, category, stores, foods } = params
    let eligibleStores = this.getEligibleStores(city, category, stores, foods)
    if (eligibleStores.length === 0) {
      eligibleStores = [
        {
          id: 'store-1',
          name: 'Panificadora & Confeitaria Itaipu',
          logo: IMAGES.lojaItaipu,
          category: 'Padaria',
          rating: 4.8,
          address: 'Avenida Rep\xFAblica, 1420 - Centro, Pinhalzinho/SC',
          city: 'Pinhalzinho, SC',
        },
      ]
    }
    const state = this.getStorageState()
    const cycleKey = `${city.trim().toLowerCase()}_${category}`
    let drawnStoreIds = state.historicoPorCidade[cycleKey] || []
    let remainingStores = eligibleStores.filter((store) => !drawnStoreIds.includes(store.id))
    let isNewCycle = false
    if (remainingStores.length === 0) {
      isNewCycle = true
      drawnStoreIds = []
      remainingStores = [...eligibleStores]
    }
    const randomIndex = Math.floor(Math.random() * remainingStores.length)
    const chosenStore = remainingStores[randomIndex] || eligibleStores[0]
    if (chosenStore && chosenStore.id) {
      drawnStoreIds.push(chosenStore.id)
      state.historicoPorCidade[cycleKey] = drawnStoreIds
      state.totalSorteios = (state.totalSorteios || 0) + 1
      this.saveStorageState(state)
    }
    const cyclePosition = drawnStoreIds.length
    const totalInCycle = eligibleStores.length
    const remainingInCycle = totalInCycle - cyclePosition
    return {
      drawnStore: chosenStore,
      category,
      city,
      isNewCycle,
      cyclePosition,
      totalInCycle,
      remainingInCycle,
    }
  }
  /**
   * Produtos reais de uma loja que podem entrar numa sacola: ativos, em estoque, não vencidos,
   * da categoria pedida e (opcionalmente) com preço dentro do orçamento.
   */
  listarCandidatos(params) {
    const { lojaId, categoria, alimentos, orcamento = Infinity, ignorarValidade = false } = params
    const aceitaCategoria = (item) =>
      categoria === 'misto' || item.category === categoria || item.category === 'misto'
    return (alimentos || [])
      .filter(
        (item) =>
          item.lojaId === lojaId &&
          item.status === 'active' &&
          jaFabricado(item) &&
          (item.quantity === void 0 || item.quantity > 0) &&
          aceitaCategoria(item),
      )
      .map((item) => {
        const calculo = calcularPrecificacaoDinamica(
          item.dataFabricacao,
          item.dataValidade,
          item.precoOriginal,
        )
        return {
          item,
          preco: Number(item.precoComDesconto),
          faixa: calculo.faixaIndex || 0,
          vencido: !!calculo.vencido,
        }
      })
      .filter(
        (candidato) =>
          (ignorarValidade || !candidato.vencido) &&
          candidato.preco > 0 &&
          candidato.preco <= orcamento,
      )
  }
  /**
   * Menor valor com que alguma loja elegível consegue montar uma sacola de verdade (com os produtos
   * que ela tem hoje). É o "pedido mínimo" mostrado ao cliente. Se todos os produtos estiverem com a validade
   * vencida, usa mesmo assim o menor preço cadastrado no banco. Retorna null se não houver produto nenhum.
   */
  calcularValorMinimo(params) {
    const { city, category, stores, foods } = params
    const lojas = this.getEligibleStores(city, category, stores, foods)
    const calcular = (ignorarValidade) => {
      let menor = null
      for (const loja of lojas) {
        const candidatos = this.listarCandidatos({
          lojaId: loja.id,
          categoria: category,
          alimentos: foods,
          ignorarValidade,
        })
        if (!candidatos.length) continue
        let minimoDaLoja = Math.min(...candidatos.map((c) => c.preco))
        if (category === 'misto') {
          const salgados = candidatos.filter((c) => c.item.category === 'salgado')
          const doces = candidatos.filter((c) => c.item.category === 'doce')
          if (salgados.length && doces.length) {
            minimoDaLoja =
              Math.min(...salgados.map((c) => c.preco)) + Math.min(...doces.map((c) => c.preco))
          }
        }
        if (menor === null || minimoDaLoja < menor) menor = minimoDaLoja
      }
      return menor === null ? null : Math.ceil(menor - 1e-9)
    }
    const minimo = calcular(false)
    return minimo !== null ? minimo : calcular(true)
  }
  /**
   * Maior sacola possível hoje: a loja elegível que, somando todos os produtos disponíveis dela
   * (respeitando o estoque), chega ao maior valor. Retorna { valor, loja } ou null se não houver produto.
   */
  calcularValorMaximo(params) {
    const { city, category, stores, foods } = params
    const MAX_UNIDADES_POR_PRODUTO = 20
    let melhor = null
    for (const loja of this.getEligibleStores(city, category, stores, foods)) {
      const candidatos = this.listarCandidatos({
        lojaId: loja.id,
        categoria: category,
        alimentos: foods,
      })
      if (!candidatos.length) continue
      const centavos = candidatos.reduce((soma, c) => {
        const unidades = Math.min(
          c.item.quantity === void 0 ? 1 : c.item.quantity,
          MAX_UNIDADES_POR_PRODUTO,
        )
        return soma + Math.round(c.preco * 100) * unidades
      }, 0)
      if (!melhor || centavos > melhor.centavos) melhor = { loja, centavos }
    }
    return melhor ? { valor: melhor.centavos / 100, loja: melhor.loja } : null
  }
  /**
   * Quando o cliente pede mais do que existe hoje: monta a sacola com a loja que tem mais alimentos,
   * levando tudo o que ela tem disponível (o máximo possível do dia).
   */
  sortearSacolaMaxima(params) {
    const { city, category, stores, foods } = params
    const maximo = this.calcularValorMaximo({ city, category, stores, foods })
    if (!maximo) {
      throw new Error('Não há alimentos disponíveis para montar uma sacola hoje.')
    }
    const sorteio = this.sortearEstabelecimento({ city, category, stores, foods })
    if (maximo.loja.id !== sorteio.drawnStore.id) {
      this.trocarLojaNoRodizio(city, category, sorteio.drawnStore.id, maximo.loja.id)
    }
    const sacola = this.montarSacola({
      lojaId: maximo.loja.id,
      categoria: category,
      valor: maximo.valor,
      alimentos: foods,
    })
    return {
      ...sorteio,
      drawnStore: maximo.loja,
      itens: sacola.itens,
      valorTotal: sacola.valorTotal,
    }
  }
  /**
   * Situação do estoque para a cidade e categoria: "ok" (há produto vendável), "vencidos"
   * (há produto cadastrado, mas todos com a validade vencida) ou "vazio" (nenhum produto).
   */
  diagnosticarEstoque(params) {
    const { city, category, stores, foods } = params
    let haProdutos = false
    for (const loja of this.getEligibleStores(city, category, stores, foods)) {
      if (this.listarCandidatos({ lojaId: loja.id, categoria: category, alimentos: foods }).length)
        return 'ok'
      if (
        this.listarCandidatos({
          lojaId: loja.id,
          categoria: category,
          alimentos: foods,
          ignorarValidade: true,
        }).length
      )
        haProdutos = true
    }
    return haProdutos ? 'vencidos' : 'vazio'
  }
  /**
   * Monta a Sacola Surpresa com produtos REAIS da loja sorteada, chegando o mais perto possível do valor
   * escolhido SEM ultrapassá-lo. O mesmo produto pode entrar mais de uma vez (até o estoque dele), então
   * uma loja com poucos produtos também consegue fechar valores como R$ 20 (ex.: 2 unidades de R$ 9,90).
   * Faz várias tentativas sorteadas (com preferência para o que está mais perto de vencer) e escolhe,
   * entre as que mais se aproximam do valor, uma ao acaso, para a sacola continuar sendo surpresa.
   */
  montarSacola(params) {
    const { lojaId, categoria, valor, alimentos, tolerancia = 1, tentativas = 300 } = params
    const orcamento = Number(valor)
    const MAX_UNIDADES_POR_PRODUTO = 20
    const base = this.listarCandidatos({ lojaId, categoria, alimentos, orcamento })
    if (!base.length) return { itens: [], valorTotal: 0 }

    const centavos = (n) => Math.round(n * 100)
    const orcamentoCent = centavos(orcamento)

    const sortearUm = (lista) => {
      const pesos = lista.map((c) => c.faixa + 1)
      let sorte = Math.random() * pesos.reduce((soma, peso) => soma + peso, 0)
      for (let i = 0; i < lista.length; i++) {
        sorte -= pesos[i]
        if (sorte <= 0) return lista[i]
      }
      return lista[lista.length - 1]
    }

    const umaTentativa = () => {
      // Cada candidato tem quantas unidades ainda podem entrar (estoque do produto).
      const restantes = new Map(
        base.map((c) => [
          c,
          Math.min(c.item.quantity === void 0 ? 1 : c.item.quantity, MAX_UNIDADES_POR_PRODUTO),
        ]),
      )
      const contagem = new Map()
      let acumulado = 0
      let pesoFaixa = 0
      const adicionar = (c) => {
        contagem.set(c, (contagem.get(c) || 0) + 1)
        restantes.set(c, restantes.get(c) - 1)
        acumulado += centavos(c.preco)
        pesoFaixa += c.faixa
      }
      const cabem = (filtro = () => true) =>
        base.filter(
          (c) =>
            restantes.get(c) > 0 && centavos(c.preco) <= orcamentoCent - acumulado && filtro(c),
        )
      // Misto: a sacola SEMPRE leva pelo menos um salgado e um doce; se o valor nao comporta os dois, nao serve
      if (categoria === 'misto') {
        for (const tipo of ['salgado', 'doce']) {
          const opcoes = cabem((c) => c.item.category === tipo)
          if (!opcoes.length) return null
          adicionar(sortearUm(opcoes))
        }
      }
      // Vai somando produtos até nada mais caber no valor escolhido
      for (let lista = cabem(); lista.length; lista = cabem()) adicionar(sortearUm(lista))
      return { contagem, acumulado, pesoFaixa }
    }

    const resultados = []
    for (let i = 0; i < tentativas; i++) {
      const tentativa = umaTentativa()
      if (tentativa) resultados.push(tentativa)
    }
    if (!resultados.length) return { itens: [], valorTotal: 0 }
    const melhorTotal = Math.max(...resultados.map((r) => r.acumulado))
    // Entre as sacolas que mais se aproximam do valor (até a tolerância), sorteia uma, favorecendo
    // as que usam produtos mais perto de vencer.
    const margem = Math.round(tolerancia * 100)
    const proximas = resultados.filter((r) => r.acumulado >= melhorTotal - margem)
    const escolhida = proximas[Math.floor(Math.random() * proximas.length)] || resultados[0]

    const escolhidos = []
    for (const [candidato, qtd] of escolhida.contagem) {
      for (let i = 0; i < qtd; i++) escolhidos.push(candidato.item)
    }
    return { itens: escolhidos, valorTotal: escolhida.acumulado / 100 }
  }
  /**
   * Sorteio completo: escolhe o estabelecimento (rodízio justo) e monta a sacola com os produtos dele.
   * Usa a loja sorteada se ela conseguir chegar perto do valor escolhido (a partir de 90%); senão tenta
   * as outras lojas elegíveis e, se nenhuma chegar, usa a que montar a sacola de maior valor.
   */
  sortearSacola(params) {
    const { city, category, valor, stores, foods } = params
    const sorteio = this.sortearEstabelecimento({ city, category, stores, foods })
    const outras = this.getEligibleStores(city, category, stores, foods)
      .filter((loja) => loja.id !== sorteio.drawnStore.id)
      .sort(() => Math.random() - 0.5)
    const bomSuficiente = Number(valor) * 0.9
    let melhor = null
    let escolhida = null
    for (const loja of [sorteio.drawnStore, ...outras]) {
      const sacola = this.montarSacola({
        lojaId: loja.id,
        categoria: category,
        valor,
        alimentos: foods,
      })
      if (!sacola.itens.length) continue
      if (sacola.valorTotal >= bomSuficiente) {
        escolhida = { loja, sacola }
        break
      }
      if (!melhor || sacola.valorTotal > melhor.sacola.valorTotal) melhor = { loja, sacola }
    }
    escolhida = escolhida || melhor
    if (!escolhida) {
      throw new Error(
        'Nenhum estabelecimento consegue montar uma sacola com esse valor agora. Tente um valor maior ou outra categoria.',
      )
    }
    // O rodízio deve contar a loja que realmente recebeu o pedido.
    if (escolhida.loja.id !== sorteio.drawnStore.id) {
      this.trocarLojaNoRodizio(city, category, sorteio.drawnStore.id, escolhida.loja.id)
    }
    return {
      ...sorteio,
      drawnStore: escolhida.loja,
      itens: escolhida.sacola.itens,
      valorTotal: escolhida.sacola.valorTotal,
    }
  }
  /** Troca, no histórico do ciclo, a loja sorteada pela que realmente montou a sacola. */
  trocarLojaNoRodizio(city, category, lojaIdAntiga, lojaIdNova) {
    const state = this.getStorageState()
    const cycleKey = `${city.trim().toLowerCase()}_${category}`
    const lista = (state.historicoPorCidade[cycleKey] || []).filter((id) => id !== lojaIdAntiga)
    if (!lista.includes(lojaIdNova)) lista.push(lojaIdNova)
    state.historicoPorCidade[cycleKey] = lista
    this.saveStorageState(state)
  }
  /**
   * Sacola excluída sem pagar: a loja volta para o rodízio (não "gasta" a vez dela) e o cliente
   * pode sortear de novo, inclusive a mesma loja.
   */
  devolverLojaAoRodizio(lojaId) {
    const state = this.getStorageState()
    for (const chave of Object.keys(state.historicoPorCidade)) {
      state.historicoPorCidade[chave] = state.historicoPorCidade[chave].filter(
        (id) => id !== lojaId,
      )
    }
    state.totalSorteios = Math.max(0, (state.totalSorteios || 0) - 1)
    this.saveStorageState(state)
  }
  /**
   * Retorna informações sobre o ciclo atual de uma cidade e categoria
   */
  getCycleStatus(city, category, stores, foods) {
    const eligibleStores = this.getEligibleStores(city, category, stores, foods)
    const state = this.getStorageState()
    const cycleKey = `${city.trim().toLowerCase()}_${category}`
    const drawnStoreIds = state.historicoPorCidade[cycleKey] || []
    const activeDrawnIds = drawnStoreIds.filter((id) => eligibleStores.some((s) => s.id === id))
    const currentPosition = activeDrawnIds.length
    const total = eligibleStores.length
    return {
      total,
      drawnCount: currentPosition,
      remainingCount: Math.max(0, total - currentPosition),
      isCompleted: currentPosition >= total && total > 0,
    }
  }
  /**
   * Reinicia o ciclo para testes se necessário
   */
  resetCycle(city, category) {
    const state = this.getStorageState()
    const cityNorm = city.trim().toLowerCase()
    if (category) {
      delete state.historicoPorCidade[`${cityNorm}_${category}`]
    } else {
      delete state.historicoPorCidade[`${cityNorm}_doce`]
      delete state.historicoPorCidade[`${cityNorm}_salgado`]
      delete state.historicoPorCidade[`${cityNorm}_misto`]
    }
    this.saveStorageState(state)
  }
}
// Item que ainda será fabricado (fabricação em data futura) não está disponível hoje
const jaFabricado = (item) => {
  const fab = String(item?.dataFabricacao || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fab)) return true
  const d = new Date()
  const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return fab <= hoje
}

const servicoSorteio = new ServicoSorteio()
export { servicoSorteio }
