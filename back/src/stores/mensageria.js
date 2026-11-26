// Store de mensagens: compõe avisos por perfil, acompanha novidades e sincroniza a leitura.
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAppStore } from './estadoApp'
import { foodService } from 'src/services/servicoAlimentos'
import { servicoDoacoes } from '../services/servicoDoacoes'
import { servicoMensageria } from '../services/servicoMensageria'
import { mensagensDoPerfil } from '../utils/mensageria'

const PESO_PRIORIDADE = { alta: 0, media: 1, informativa: 2 }

export const useMensageriaStore = defineStore('mensageria', () => {
  const app = useAppStore()
  const mensagens = ref([])
  const naoLidas = computed(() => mensagens.value.filter((m) => !m.lida).length)

  // Controle para avisar na tela só o que chegou depois da primeira carga.
  let usuarioAcompanhado = null
  let idsConhecidos = new Set()

  const ordenar = (lista) =>
    [...lista].sort(
      (a, b) =>
        Number(a.lida) - Number(b.lida) ||
        PESO_PRIORIDADE[a.prioridade] - PESO_PRIORIDADE[b.prioridade] ||
        new Date(b.criadaEm) - new Date(a.criadaEm),
    )

  // Recalcula as mensagens do perfil e identifica novidades sem repetir avisos já conhecidos.
  const atualizar = () => {
    const usuario = app.usuarioAtual
    if (!usuario?.id) {
      mensagens.value = []
      usuarioAcompanhado = null
      idsConhecidos = new Set()
      return
    }

    let ofertas = []
    if (usuario.role === 'institution') {
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
      cidade: app.selectedCity,
    })
    const lista = ordenar(servicoMensageria.montar(usuario.id, geradas))

    const primeiraCarga = usuarioAcompanhado !== usuario.id
    const novas = lista.filter((m) => !m.lida && !idsConhecidos.has(m.id))
    usuarioAcompanhado = usuario.id
    idsConhecidos = new Set(lista.map((m) => m.id))
    mensagens.value = lista

    if (!primeiraCarga && novas.length) {
      app.triggerNotification(
        novas.length === 1
          ? 'Você recebeu uma nova mensagem.'
          : `Você recebeu ${novas.length} novas mensagens.`,
        'success',
      )
    }
  }

  // Busca os alimentos de novo no servidor (sem tela de carregamento) e recalcula as mensagens.
  // Sem isso, quem já estava com o app aberto nunca veria o que a loja publicou depois.
  const assinatura = (lista) =>
    lista
      .map((f) => [f.id, f.precoComDesconto, f.quantity, f.status, f.dataValidade].join('|'))
      .join(';')
  let sincronizando = false
  // Atualiza os alimentos no servidor e recalcula as mensagens relacionadas ao catálogo.
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

  // Persiste a leitura de todas as mensagens e reflete a mudança imediatamente na interface.
  const marcarTodasLidas = () => {
    const usuario = app.usuarioAtual
    if (!usuario?.id) return
    servicoMensageria.marcarLidas(
      usuario.id,
      mensagens.value.map((m) => m.id),
    )
    mensagens.value = mensagens.value.map((m) => ({ ...m, lida: true }))
  }

  // Persiste a leitura de uma mensagem específica e atualiza a lista local.
  const marcarLida = (id) => {
    const usuario = app.usuarioAtual
    if (!usuario?.id) return
    servicoMensageria.marcarLidas(usuario.id, [id])
    mensagens.value = ordenar(mensagens.value.map((m) => (m.id === id ? { ...m, lida: true } : m)))
  }

  // Remove a mensagem dispensada do armazenamento e da lista exibida.
  const dispensar = (id) => {
    const usuario = app.usuarioAtual
    if (!usuario?.id) return
    servicoMensageria.dispensar(usuario.id, id)
    mensagens.value = mensagens.value.filter((m) => m.id !== id)
  }

  return { mensagens, naoLidas, atualizar, sincronizar, marcarLida, marcarTodasLidas, dispensar }
})
