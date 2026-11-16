import { ref, watch, computed } from 'vue'
import { defineStore } from 'pinia'
import { Notify, Dark } from 'quasar'
import { authService } from 'src/services/servicoAutenticacao'
import { foodService } from 'src/services/servicoAlimentos'
import { orderService } from 'src/services/servicoPedidos'
import { storeService } from 'src/services/servicoLojas'
import { canEvaluateOrder } from 'src/utils/utilitariosAvaliacaoPedido'
import { CITIES, storeBelongsToCity, cidadesComAlimentos, cidadesDasLojas } from 'src/utils/cidades'
import { armazem } from 'src/services/armazemServidor'

export const useAppStore = defineStore('app', () => {
  // Router do Quasar (injetado pelo boot "app-init")
  let appRouter = null
  const setAppRouter = (r) => {
    appRouter = r
  }

  // O usuário vem do login (token); lojas e alimentos vêm do back-end (initApp).
  const usuarioAtual = ref(null)
  const stores = ref([])
  const foods = ref([])
  const editingFood = ref(null)
  const setEditingFood = (item) => {
    editingFood.value = item
  }
  const orders = ref([])
  // Vira true depois que os pedidos do usuário chegaram do servidor pela primeira vez
  // (a central de mensagens só avisa pedidos novos/mudanças a partir daí).
  const pedidosCarregados = ref(false)
  const cart = ref([])
  const cartStoreId = ref(null)
  const cartStoreName = ref(null)
  // Sacola Surpresa montada com o máximo disponível (o cliente pediu mais do que há hoje)
  const sacolaMaxima = ref(null)
  const marcarSacolaMaxima = (pedido, maximo) => {
    sacolaMaxima.value = { pedido, maximo }
  }
  // Cada clique no botão Início incrementa o sinal; os painéis o observam para voltar à primeira tela
  const inicioSinal = ref(0)
  const pedirInicio = () => {
    inicioSinal.value += 1
  }
  // Pedido recém-entregue a ser avaliado: a janela de avaliação abre em qualquer tela (ver LayoutPrincipal).
  // Abre SEMPRE que há um pedido entregue ainda não oferecido para avaliação (mesmo que o app tenha sido
  // aberto depois da entrega). A pessoa pode escolher não avaliar; a lista de pedidos já oferecidos fica
  // salva no servidor para a janela não reaparecer em outro aparelho nem depois de recarregar.
  const pedidoParaAvaliar = ref(null)
  const avaliacoesOferecidas = () => armazem.dado('avaliacoesOferecidas', []).map(String)
  const marcarAvaliacaoOferecida = (id) => {
    const lista = avaliacoesOferecidas()
    if (!lista.includes(String(id))) {
      armazem.salvarDado('avaliacoesOferecidas', [...lista, String(id)].slice(-200))
    }
  }
  const abrirAvaliacao = (pedido) => {
    if (pedido) pedidoParaAvaliar.value = pedido
  }
  // Pedidos que a pessoa já fechou nesta sessão: nunca reabrem sozinhos, mesmo que a lista de
  // "oferecidas" salva no servidor seja recarregada antes de a gravação terminar.
  const avaliacoesFechadasSessao = new Set()
  const fecharAvaliacao = () => {
    const atual = pedidoParaAvaliar.value
    pedidoParaAvaliar.value = null
    if (atual) {
      avaliacoesFechadasSessao.add(String(atual.id))
      try {
        marcarAvaliacaoOferecida(atual.id)
      } catch (erro) {
        console.warn('[avaliacao] não foi possível registrar a oferta:', erro)
      }
    }
  }
  const detectarEntregas = (lista) => {
    if (pedidoParaAvaliar.value) return
    const oferecidas = avaliacoesOferecidas()
    const pendente = (lista || []).find(
      (ord) =>
        ord.status === 'delivered' &&
        !ord.notaComida &&
        canEvaluateOrder(ord) &&
        !oferecidas.includes(String(ord.id)) &&
        !avaliacoesFechadasSessao.has(String(ord.id)),
    )
    if (pendente) pedidoParaAvaliar.value = pendente
  }
  // Qualquer atualização da lista de pedidos (polling do layout ou da central de mensagens) passa por aqui
  watch(orders, (lista) => {
    if (usuarioAtual.value?.role === 'client') detectarEntregas(lista)
  })
  const loading = ref(false)
  const error = ref(null)
  const currentScreen = ref('welcome')
  // Preferências: valores padrão até o login; depois vêm do servidor (tabela dados_usuario).
  const modoEscuro = ref(false)
  const notificationsEnabled = ref(true)
  const selectedCity = ref('Pinhalzinho, SC')
  const salvarPreferencias = () => {
    if (!usuarioAtual.value) return
    armazem.salvarDado('preferencias', {
      modoEscuro: modoEscuro.value,
      notificacoes: notificationsEnabled.value,
      cidade: selectedCity.value,
    })
  }
  const aplicarPreferencias = () => {
    const prefs = armazem.dado('preferencias', {})
    if (typeof prefs.modoEscuro === 'boolean') modoEscuro.value = prefs.modoEscuro
    if (typeof prefs.notificacoes === 'boolean') notificationsEnabled.value = prefs.notificacoes
    if (typeof prefs.cidade === 'string' && prefs.cidade) selectedCity.value = prefs.cidade
  }
  // Busca no servidor os dados do usuário (coleções e preferências) antes de abrir as telas.
  const carregarDadosDoUsuario = async (user) => {
    await armazem.carregar(user)
    aplicarPreferencias()
  }
  const setSelectedCity = (city) => {
    selectedCity.value = city
    salvarPreferencias()
    triggerNotification(`Cidade alterada para ${city} \u{1F4CD}`, 'success')
  }
  watch(
    modoEscuro,
    (val) => {
      Dark.set(val)
    },
    { immediate: true },
  )
  // Com as notificações desligadas (sino da barra), avisos de sucesso e atenção não aparecem.
  // Erros continuam visíveis, senão a pessoa não saberia por que algo não funcionou.
  const triggerNotification = (message, type = 'success', forcar = false) => {
    if (!notificationsEnabled.value && type !== 'error' && !forcar) return
    Notify.create({
      message,
      type: type === 'error' ? 'negative' : type === 'warning' ? 'warning' : 'positive',
      position: 'top',
      timeout: 4000,
    })
  }
  const screenToRoute = {
    welcome: '/',
    login: '/login',
    signup: '/cadastro',
    dashboard: '/painel-consumidor',
    'order-status': '/status-pedido',
    stores: '/lista-lojas',
    foods: '/lista-alimentos',
    'address-select': '/selecao-endereco',
    checkout: '/finalizar-pedido',
    'store-dashboard': '/painel-loja',
    'store-add-item': '/adicionar-item-loja',
    'institution-dashboard': '/painel-entidade',
    'disposal-dashboard': '/painel-descarte',
    'master-dashboard': '/painel-master',
  }
  const setScreen = (screen) => {
    currentScreen.value = screen
    error.value = null
    const routePath = screenToRoute[screen]
    if (routePath && appRouter) {
      appRouter.push(routePath).catch(() => {})
    }
  }
  const alternarModoEscuro = () => {
    modoEscuro.value = !modoEscuro.value
    salvarPreferencias()
    triggerNotification(`Modo ${modoEscuro.value ? 'Escuro' : 'Claro'} ativado!`, 'success')
  }
  const toggleNotifications = () => {
    notificationsEnabled.value = !notificationsEnabled.value
    salvarPreferencias()
    // Só confirma ao ativar; ao silenciar, nenhum aviso aparece.
    if (notificationsEnabled.value)
      triggerNotification('Notifica\xE7\xF5es ativadas \u{1F514}', 'success')
  }
  const HOME_SCREENS = {
    master: 'master-dashboard',
    admin: 'master-dashboard',
    client: 'dashboard',
    store: 'store-dashboard',
    institution: 'institution-dashboard',
    disposal: 'disposal-dashboard',
  }
  const goHome = (role) => {
    const screen = HOME_SCREENS[role]
    if (screen) setScreen(screen)
  }
  // Recarrega lojas e alimentos sem tela de carregamento. Usado ao entrar com outra conta
  // (uma loja cadastrada depois que o app abriu não estaria na lista) e quando aparece
  // alimento de uma loja que ainda não está na lista.
  const recarregarLojas = async () => {
    try {
      stores.value = await storeService.getStores()
    } catch (err) {
      console.warn('Não foi possível atualizar as lojas:', err)
    }
  }
  const recarregarCatalogo = async () => {
    try {
      const [storeList, foodList] = await Promise.all([
        storeService.getStores(),
        foodService.getAllFoods(),
      ])
      stores.value = storeList
      foods.value = foodList
    } catch (err) {
      console.warn('Não foi possível atualizar o catálogo:', err)
    }
  }
  const initApp = async () => {
    loading.value = true
    try {
      const user = await authService.getCurrentUser()
      if (user) {
        await carregarDadosDoUsuario(user)
        usuarioAtual.value = user
        goHome(user.role)
      }
      const storeList = await storeService.getStores()
      stores.value = storeList
      const foodList = await foodService.getAllFoods()
      foods.value = foodList
    } catch (err) {
      console.error('Initialization error:', err)
    } finally {
      loading.value = false
    }
  }
  watch(usuarioAtual, (user) => {
    if (user) {
      loadOrders()
    } else {
      orders.value = []
      pedidosCarregados.value = false
    }
  })
  const login = async (email, pass) => {
    loading.value = true
    error.value = null
    try {
      const data = await authService.login(email, pass)
      await Promise.all([carregarDadosDoUsuario(data.user), recarregarCatalogo()])
      usuarioAtual.value = data.user
      triggerNotification(`Bem-vindo de volta, ${data.user.name}!`, 'success')
      goHome(data.user.role)
    } catch (err) {
      error.value = err.message
      triggerNotification(err.message, 'error')
      throw err
    } finally {
      loading.value = false
    }
  }
  const signup = async (name, email, pass, role, address, extraFields) => {
    loading.value = true
    error.value = null
    try {
      const data = await authService.register(name, email, pass, role, address, extraFields)
      await Promise.all([carregarDadosDoUsuario(data.user), recarregarCatalogo()])
      usuarioAtual.value = data.user
      triggerNotification('Cadastro realizado com sucesso! Seja bem-vindo.', 'success')
      goHome(role)
    } catch (err) {
      error.value = err.message
      triggerNotification(err.message, 'error')
      throw err
    } finally {
      loading.value = false
    }
  }
  const logout = () => {
    authService.logout()
    armazem.limpar()
    usuarioAtual.value = null
    pedidoParaAvaliar.value = null
    clearCart()
    setScreen('welcome')
    triggerNotification('Sess\xE3o encerrada com sucesso.', 'success')
  }
  const updateProfile = async (data) => {
    if (!usuarioAtual.value) return false
    loading.value = true
    const anterior = usuarioAtual.value
    try {
      const updatedUser = { ...usuarioAtual.value, ...data, termosAceitos: true }
      usuarioAtual.value = updatedUser
      // Taxas de entrega da loja: reflete na lista de estabelecimentos usada pelo checkout
      if (data.deliveryConfig && updatedUser.role === 'store') {
        const ownStoreId = String(updatedUser.id).replace('user-', '')
        const ownStore = stores.value.find((s) => s.id === ownStoreId)
        if (ownStore) ownStore.deliveryConfig = data.deliveryConfig
      }
      const updated = await authService.updateProfile(updatedUser.id, {
        ...data,
        id: updatedUser.id,
      })
      if (updated) {
        usuarioAtual.value = { ...updatedUser, ...updated }
      }
      triggerNotification('Perfil atualizado com sucesso! \u2705', 'success')
      return true
    } catch (err) {
      // O servidor recusou (ex.: nome ou CPF/CNPJ já usado por outra conta): desfaz e avisa
      usuarioAtual.value = anterior
      triggerNotification(err.message || 'N\xE3o foi poss\xEDvel salvar o perfil.', 'error')
      return false
    } finally {
      loading.value = false
    }
  }
  const addToCart = (item) => {
    // Um pedido é sempre de um estabelecimento: itens de outra loja começam um pedido novo
    if (cartStoreId.value && cartStoreId.value !== item.lojaId && cart.value.length > 0) {
      triggerNotification(
        `Os itens de ${cartStoreName.value || 'outra loja'} foram retirados: um pedido \xE9 de um estabelecimento por vez.`,
        'info',
      )
      cart.value = []
      cartStoreId.value = null
      cartStoreName.value = null
    }
    if (cart.value.length === 0) {
      cartStoreId.value = item.lojaId
      cartStoreName.value = item.nomeLoja
    }
    const exists = cart.value.find((i) => i.itemId === item.id)
    if (exists) {
      exists.quantity += 1
    } else {
      cart.value.push({
        itemId: item.id,
        name: item.name,
        quantity: 1,
        price: item.calc?.precoComDesconto ?? item.precoComDesconto,
        ...(item.surpresa ? { surpresa: true } : {}),
      })
    }
    // Sacola surpresa: não revela o nome dos produtos sorteados
    if (!item.surpresa) triggerNotification(`${item.name} adicionado \xE0 sacola!`, 'success')
  }
  const removeFromCart = (itemId) => {
    cart.value = cart.value.filter((i) => i.itemId !== itemId)
    if (cart.value.length === 0) {
      cartStoreId.value = null
      cartStoreName.value = null
    }
  }
  const updateCartQty = (itemId, qty) => {
    if (qty <= 0) {
      removeFromCart(itemId)
      return
    }
    const item = cart.value.find((i) => i.itemId === itemId)
    if (item) {
      item.quantity = qty
    }
  }
  const clearCart = () => {
    cart.value = []
    cartStoreId.value = null
    cartStoreName.value = null
    sacolaMaxima.value = null
  }
  const getCartSubtotal = () => {
    return cart.value.reduce((acc, item) => acc + item.price * item.quantity, 0)
  }
  const loadFoods = async (lojaId, cat) => {
    loading.value = true
    try {
      const list = await foodService.getAllFoods(lojaId, cat)
      foods.value = list
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }
  // Devolve true só se o item foi realmente salvo no servidor.
  const addNewFoodItem = async (food) => {
    loading.value = true
    try {
      await foodService.addFood(food)
    } catch (err) {
      triggerNotification(err.message, 'error')
      loading.value = false
      return false
    }
    try {
      foods.value = await foodService.getAllFoods()
      triggerNotification(
        'Alimento anunciado com sucesso! Reduzindo o desperd\xEDcio \u{1F331}',
        'success',
      )
    } catch (err) {
      // O item já foi salvo; só a atualização da lista falhou.
      triggerNotification(
        `O item foi salvo, mas n\xE3o foi poss\xEDvel atualizar a lista: ${err.message}`,
        'warning',
      )
    } finally {
      loading.value = false
    }
    return true
  }
  const removeFoodItem = async (id) => {
    loading.value = true
    try {
      await foodService.removeFood(id)
      const list = await foodService.getAllFoods()
      foods.value = list
      triggerNotification('Item removido com sucesso.', 'success')
    } catch (err) {
      triggerNotification(err.message, 'error')
    } finally {
      loading.value = false
    }
  }
  // Doação/descarte de vencidos: tira só os lotes vencidos e mantém o estoque bom.
  const baixarVencidosDoItem = async (id) => {
    loading.value = true
    try {
      await foodService.baixarVencidos(id)
      foods.value = await foodService.getAllFoods()
      triggerNotification('Lotes vencidos retirados do estoque.', 'success')
    } catch (err) {
      triggerNotification(err.message, 'error')
    } finally {
      loading.value = false
    }
  }
  // Devolve true só se a alteração foi realmente salva no servidor.
  const updateFoodItem = async (id, data) => {
    loading.value = true
    let salvo = null
    try {
      salvo = await foodService.updateFood(id, data)
    } catch (err) {
      triggerNotification(err.message, 'error')
      loading.value = false
      return false
    }
    try {
      foods.value = await foodService.getAllFoods()
      const lotes = salvo?.lotes?.length
      triggerNotification(
        lotes
          ? `Item atualizado com sucesso (${lotes} ${lotes === 1 ? 'lote' : 'lotes'} em estoque).`
          : 'Item atualizado com sucesso.',
        'success',
      )
    } catch (err) {
      triggerNotification(
        `A altera\xE7\xE3o foi salva, mas n\xE3o foi poss\xEDvel atualizar a lista: ${err.message}`,
        'warning',
      )
    } finally {
      loading.value = false
    }
    // Devolve o item como o servidor gravou (quem só testa "if (salvou)" continua funcionando)
    return salvo || true
  }
  const loadOrders = async () => {
    if (!usuarioAtual.value) return
    loading.value = true
    try {
      const isClient = usuarioAtual.value.role === 'client'
      const isStore = usuarioAtual.value.role === 'store'
      let list = await orderService.getOrders(
        isClient ? usuarioAtual.value.id : void 0,
        isStore ? usuarioAtual.value.id.replace('user-', '') : void 0,
      )
      orders.value = list
      pedidosCarregados.value = true
    } catch (err) {
      console.error('Error loading orders:', err)
    } finally {
      loading.value = false
    }
  }
  const submitOrder = async (formaPagamento, pontosUsados, descontoPontos, deliveryFeeOverride) => {
    if (!usuarioAtual.value) throw new Error('\xC9 necess\xE1rio estar logado.')
    if (cart.value.length === 0) throw new Error('Sua sacola est\xE1 vazia.')
    if (!cartStoreId.value || !cartStoreName.value) throw new Error('Erro de estabelecimento.')
    loading.value = true
    try {
      const subtotal = getCartSubtotal()
      const taxaEntrega = Number.isFinite(Number(deliveryFeeOverride))
        ? Number(deliveryFeeOverride)
        : 10
      const total = Math.max(0, subtotal + taxaEntrega - descontoPontos)
      const payload = {
        clienteId: usuarioAtual.value.id,
        nomeCliente: usuarioAtual.value.name,
        lojaId: cartStoreId.value,
        nomeLoja: cartStoreName.value,
        items: cart.value,
        // Sacola Surpresa: a visão do cliente esconde a loja e os produtos
        ...(cart.value.length > 0 && cart.value.every((item) => item.surpresa) ? { surpresa: true } : {}),
        subtotal,
        taxaEntrega,
        descontoPontos,
        pontosUsados,
        total,
        formaPagamento,
        address: usuarioAtual.value.address || '',
      }
      const result = await orderService.createOrder(payload)
      clearCart()
      const freshUser = await authService.getCurrentUser()
      if (freshUser) {
        usuarioAtual.value = freshUser
      }
      await loadOrders()
      triggerNotification(
        'Pedido feito com sucesso! Obrigado por ajudar o planeta \u{1F331}',
        'success',
      )
      return result
    } catch (err) {
      triggerNotification(err.message, 'error')
      throw err
    } finally {
      loading.value = false
    }
  }
  const updateOrderStatus = async (id, newStatus, extraFields) => {
    loading.value = true
    try {
      await orderService.updateOrderStatus(id, newStatus, extraFields)
      await loadOrders()
      triggerNotification(
        newStatus === 'cancelled'
          ? 'Pedido cancelado. A loja foi avisada.'
          : `Status do pedido atualizado para: ${newStatus}`,
        newStatus === 'cancelled' ? 'info' : 'success',
      )
      const freshUser = await authService.getCurrentUser()
      if (freshUser) {
        usuarioAtual.value = freshUser
      }
      return true
    } catch (err) {
      triggerNotification(err.message, 'error')
      return false
    } finally {
      loading.value = false
    }
  }
  const submitOrderEvaluation = async (id, evaluation) => {
    const targetOrder = orders.value.find((o) => o.id === id)
    if (targetOrder && !canEvaluateOrder(targetOrder)) {
      const errorMsg = 'Ap\xF3s 1 hora da entrega, n\xE3o \xE9 mais permitido avaliar o pedido.'
      triggerNotification(errorMsg, 'error')
      throw new Error(errorMsg)
    }
    loading.value = true
    try {
      const updatedOrder = await orderService.submitOrderEvaluation(id, evaluation)
      await loadOrders()
      const freshUser = await authService.getCurrentUser()
      if (freshUser) {
        usuarioAtual.value = freshUser
      }
      // Avaliação enviada: fecha o pop-up global na hora (o pedido já tem nota e não é oferecido de novo)
      if (pedidoParaAvaliar.value && String(pedidoParaAvaliar.value.id) === String(id)) fecharAvaliacao()
      triggerNotification(
        'Avalia\xE7\xE3o enviada com sucesso! Obrigado pelo feedback \u{1F331}',
        'success',
      )
      return updatedOrder
    } catch (err) {
      triggerNotification(err.message, 'error')
      throw err
    } finally {
      loading.value = false
    }
  }

  // Só aparecem cidades com alimentos à venda (conforme o banco); se a cidade escolhida deixar de ter, troca para a primeira disponível
  // Cidades atendidas = onde há loja cadastrada (cresce sozinha quando uma loja de cidade nova se cadastra)
  const cidadesAtendidas = computed(() => cidadesDasLojas(stores.value))
  const cidadesDisponiveis = computed(() => cidadesComAlimentos(stores.value, foods.value))
  watch(cidadesDisponiveis, (lista) => {
    if (lista.length && !lista.includes(selectedCity.value)) setSelectedCity(lista[0])
  })

  return {
    sacolaMaxima,
    marcarSacolaMaxima,
    pedidoParaAvaliar,
    abrirAvaliacao,
    fecharAvaliacao,
    inicioSinal,
    pedirInicio,
    usuarioAtual,
    stores,
    foods,
    orders,
    pedidosCarregados,
    recarregarLojas,
    recarregarCatalogo,
    cart,
    cartStoreId,
    cartStoreName,
    loading,
    error,
    currentScreen,
    modoEscuro,
    notificationsEnabled,
    selectedCity,
    setSelectedCity,
    CITIES,
    cidadesAtendidas,
    cidadesDisponiveis,
    storeBelongsToCity,
    setScreen,
    setAppRouter,
    alternarModoEscuro,
    toggleNotifications,
    login,
    signup,
    logout,
    updateProfile,
    addToCart,
    removeFromCart,
    updateCartQty,
    clearCart,
    getCartSubtotal,
    loadFoods,
    addNewFoodItem,
    removeFoodItem,
    baixarVencidosDoItem,
    updateFoodItem,
    editingFood,
    setEditingFood,
    loadOrders,
    submitOrder,
    updateOrderStatus,
    submitOrderEvaluation,
    triggerNotification,
    initApp,
  }
})
