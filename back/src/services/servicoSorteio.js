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
    const storeList = allStores && allStores.length > 0 ? allStores : []
    const foodList = allFoods && allFoods.length > 0 ? allFoods : []
    const cityStores = storeList.filter((store) => storeBelongsToCity(store, city))
    const baseStores = cityStores.length > 0 ? cityStores : storeList
    if (baseStores.length === 0) {
      return []
    }
    if (category === 'misto') {
      const storesWithDoce = new Set(
        foodList
          .filter((f) => (f.category === 'doce' || f.category === 'misto') && f.status === 'active')
          .map((f) => f.lojaId),
      )
      const storesWithSalgado = new Set(
        foodList
          .filter(
            (f) => (f.category === 'salgado' || f.category === 'misto') && f.status === 'active',
          )
          .map((f) => f.lojaId),
      )
      const storesWithBoth = baseStores.filter(
        (store) =>
          (storesWithDoce.has(store.id) && storesWithSalgado.has(store.id)) ||
          foodList.some(
            (f) => f.lojaId === store.id && f.category === 'misto' && f.status === 'active',
          ),
      )
      return storesWithBoth
    }
    const storesWithCategory = new Set(
      foodList
        .filter((f) => (f.category === category || f.category === 'misto') && f.status === 'active')
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
   * Monta a Sacola Surpresa com produtos REAIS da loja sorteada: sorteia (com preferência para o que está
   * mais perto de vencer) os produtos que cabem no valor escolhido. O pedido é validado depois pelo servidor.
   */
  montarSacola(params) {
    const { lojaId, categoria, valor, alimentos, tolerancia = 1 } = params
    const orcamento = Number(valor)
    let candidatos = this.listarCandidatos({ lojaId, categoria, alimentos, orcamento })
    const escolhidos = []
    let acumulado = 0
    const sortearUm = (lista) => {
      const pesos = lista.map((candidato) => candidato.faixa + 1)
      let sorte = Math.random() * pesos.reduce((soma, peso) => soma + peso, 0)
      for (let i = 0; i < lista.length; i++) {
        sorte -= pesos[i]
        if (sorte <= 0) return lista[i]
      }
      return lista[lista.length - 1]
    }
    const escolher = (candidato) => {
      escolhidos.push(candidato.item)
      acumulado += candidato.preco
      candidatos = candidatos.filter((c) => c !== candidato)
    }
    // Misto: garante pelo menos um salgado e um doce, quando houver
    if (categoria === 'misto') {
      for (const tipo of ['salgado', 'doce']) {
        const opcoes = candidatos.filter(
          (c) => c.item.category === tipo && c.preco <= orcamento - acumulado,
        )
        if (opcoes.length) escolher(sortearUm(opcoes))
      }
    }
    while (candidatos.length) {
      const restante = orcamento - acumulado
      if (restante < tolerancia) break
      const elegiveis = candidatos.filter((c) => c.preco <= restante + 1e-9)
      if (!elegiveis.length) break
      escolher(sortearUm(elegiveis))
    }
    return { itens: escolhidos, valorTotal: Math.round(acumulado * 100) / 100 }
  }
  /**
   * Sorteio completo: escolhe o estabelecimento (rodízio justo) e monta a sacola com os produtos dele.
   * Prefere uma loja que consiga chegar perto do valor escolhido; se nenhuma chegar, usa a que montar a maior sacola.
   */
  sortearSacola(params) {
    const { city, category, valor, stores, foods } = params
    const sorteio = this.sortearEstabelecimento({ city, category, stores, foods })
    const outras = this.getEligibleStores(city, category, stores, foods)
      .filter((loja) => loja.id !== sorteio.drawnStore.id)
      .sort(() => Math.random() - 0.5)
    const bomSuficiente = Number(valor) * 0.5
    let melhor = null
    for (const loja of [sorteio.drawnStore, ...outras]) {
      const sacola = this.montarSacola({
        lojaId: loja.id,
        categoria: category,
        valor,
        alimentos: foods,
      })
      if (!sacola.itens.length) continue
      if (sacola.valorTotal >= bomSuficiente) {
        return { ...sorteio, drawnStore: loja, itens: sacola.itens, valorTotal: sacola.valorTotal }
      }
      if (!melhor || sacola.valorTotal > melhor.sacola.valorTotal) melhor = { loja, sacola }
    }
    if (melhor) {
      return {
        ...sorteio,
        drawnStore: melhor.loja,
        itens: melhor.sacola.itens,
        valorTotal: melhor.sacola.valorTotal,
      }
    }
    throw new Error(
      'Nenhum estabelecimento consegue montar uma sacola com esse valor agora. Tente um valor maior ou outra categoria.',
    )
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
const servicoSorteio = new ServicoSorteio()
export { servicoSorteio }
