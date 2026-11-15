import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAppStore } from './estadoApp'
import { foodService } from 'src/services/servicoAlimentos'
import { orderService } from 'src/services/servicoPedidos'
import { servicoDoacoes } from '../services/servicoDoacoes'
import { servicoMensageria } from '../services/servicoMensageria'
import { mensagensDoPerfil } from '../utils/mensageria'

const PESO_PRIORIDADE = { alta: 0, media: 1, informativa: 2 }

// Som curto para pedidos (respeita o sino: só toca com as notificações ligadas)
const tocarAviso = () => {
  try {
    const app = useAppStore()
    if (!app.notificationsEnabled) return
    const contexto = new (window.AudioContext || window.webkitAudioContext)()
    const tom = (frequencia, inicio) => {
      const osc = contexto.createOscillator()
      const volume = contexto.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(frequencia, contexto.currentTime + inicio)
      volume.gain.setValueAtTime(0.05, contexto.currentTime + inicio)
      osc.connect(volume)
      volume.connect(contexto.destination)
      osc.start(contexto.currentTime + inicio)
      osc.stop(contexto.currentTime + inicio + 0.15)
    }
    tom(660, 0)
    tom(880, 0.18)
  } catch {
    // navegador sem áudio: só a notificação visual
  }
}

export const useMensageriaStore = defineStore('mensageria', () => {
  const app = useAppStore()
  const mensagens = ref([])
  const naoLidas = computed(() => mensagens.value.filter((m) => !m.lida).length)

  // Controle para avisar na tela só o que chegou depois da primeira carga.
  let usuarioAcompanhado = null
  let idsConhecidos = new Set()
  // Pedidos: a primeira lista que chega do servidor é só a base (não vira aviso);
  // a partir dela, cada pedido novo ou mudança de situação gera notificação.
  let basePedidosPronta = false

  const ordenar = (lista) =>
    [...lista].sort(
      (a, b) =>
        Number(a.lida) - Number(b.lida) ||
        PESO_PRIORIDADE[a.prioridade] - PESO_PRIORIDADE[b.prioridade] ||
        new Date(b.criadaEm) - new Date(a.criadaEm),
    )

  const atualizar = () => {
    const usuario = app.usuarioAtual
    if (!usuario?.id) {
      mensagens.value = []
      usuarioAcompanhado = null
      idsConhecidos = new Set()
      basePedidosPronta = false
      return
    }

    let ofertas = []
    if (usuario.role === 'institution' || usuario.role === 'store') {
      try {
        ofertas = servicoDoacoes.getDonationOffers()
      } catch {
        ofertas = []
      }
    }

    const geradas = mensagensDoPerfil({
      usuario,
      foods: app.foods,
      stores: app.stores,
      ofertas,
      pedidos: app.orders,
      cidade: app.selectedCity,
    })
    const lista = ordenar(servicoMensageria.montar(usuario.id, geradas))

    const primeiraCarga = usuarioAcompanhado !== usuario.id
    if (primeiraCarga) basePedidosPronta = false
    const ehPedido = (m) => String(m.tipo).startsWith('pedido')
    // Enquanto os pedidos não chegaram do servidor, as mensagens deles não contam como novidade
    const pedidosSaoNovidade = basePedidosPronta
    if (app.pedidosCarregados) basePedidosPronta = true
    const novas = lista.filter(
      (m) => !m.lida && !idsConhecidos.has(m.id) && (!ehPedido(m) || pedidosSaoNovidade),
    )
    usuarioAcompanhado = usuario.id
    idsConhecidos = new Set(lista.map((m) => m.id))
    mensagens.value = lista

    if (!primeiraCarga && novas.length) {
      // Pedidos: cada novidade aparece com o próprio título (ex.: "Novo pedido #12", "Pedido a caminho")
      const dePedido = novas.filter((m) => ehPedido(m) || m.tipo === 'doacao-resposta')
      for (const m of dePedido) {
        app.triggerNotification(`${m.titulo}: ${m.texto}`, m.tipo === 'pedido-cancelado' ? 'warning' : 'success')
      }
      if (dePedido.length) tocarAviso()
      const outras = novas.length - dePedido.length
      if (outras) {
        app.triggerNotification(
          outras === 1 ? 'Você recebeu uma nova mensagem.' : `Você recebeu ${outras} novas mensagens.`,
          'success',
        )
      }
    }
  }

  // Busca os alimentos de novo no servidor (sem tela de carregamento) e recalcula as mensagens.
  // Sem isso, quem já estava com o app aberto nunca veria o que a loja publicou depois.
  const assinatura = (lista) =>
    lista
      .map((f) => [f.id, f.precoComDesconto, f.quantity, f.status, f.dataValidade].join('|'))
      .join(';')
  let sincronizando = false
  const sincronizar = async () => {
    const usuario = app.usuarioAtual
    const papelComAlimentos = usuario?.role === 'client' || usuario?.role === 'store'
    if (usuario?.id && papelComAlimentos && !sincronizando) {
      sincronizando = true
      try {
        const lista = await foodService.getAllFoods()
        if (assinatura(lista) !== assinatura(app.foods)) app.foods = lista
      } catch {
        // Sem conexão ou servidor indisponível: segue com a lista que já tem.
      } finally {
        sincronizando = false
      }
    }
    atualizar()
  }

  // Pedidos: busca de novo no servidor (sem tela de carregamento) para a loja ver pedidos novos
  // e o cliente ver cada mudança de situação, sem precisar recarregar a página.
  const assinaturaPedidos = (lista) => lista.map((p) => `${p.id}|${p.status}`).join(';')
  let buscandoPedidos = false
  const sincronizarPedidos = async () => {
    const usuario = app.usuarioAtual
    if (!usuario?.id || !['client', 'store'].includes(usuario.role) || buscandoPedidos) return
    buscandoPedidos = true
    try {
      const lista = await orderService.getOrders()
      if (assinaturaPedidos(lista) !== assinaturaPedidos(app.orders || [])) app.orders = lista
      // Loja: respostas das entidades às consultas de doação (aceite/recusa pelo link público)
      if (usuario.role === 'store') await servicoDoacoes.atualizarDoServidor()
    } catch {
      // Sem conexão: tenta de novo no próximo ciclo.
    } finally {
      buscandoPedidos = false
    }
    atualizar()
  }

  const marcarTodasLidas = () => {
    const usuario = app.usuarioAtual
    if (!usuario?.id) return
    servicoMensageria.marcarLidas(
      usuario.id,
      mensagens.value.map((m) => m.id),
    )
    mensagens.value = mensagens.value.map((m) => ({ ...m, lida: true }))
  }

  const marcarLida = (id) => {
    const usuario = app.usuarioAtual
    if (!usuario?.id) return
    servicoMensageria.marcarLidas(usuario.id, [id])
    mensagens.value = ordenar(mensagens.value.map((m) => (m.id === id ? { ...m, lida: true } : m)))
  }

  const dispensar = (id) => {
    const usuario = app.usuarioAtual
    if (!usuario?.id) return
    servicoMensageria.dispensar(usuario.id, id)
    mensagens.value = mensagens.value.filter((m) => m.id !== id)
  }

  return { mensagens, naoLidas, atualizar, sincronizar, sincronizarPedidos, marcarLida, marcarTodasLidas, dispensar }
})
