// Dados que antes ficavam no localStorage agora ficam no back-end (PostgreSQL).
//
// Para não reescrever todas as telas, este módulo mantém uma cópia em memória do que
// veio do servidor: as leituras continuam síncronas (como era com o localStorage) e
// cada gravação envia ao servidor só o que mudou (PUT por registro, DELETE do que saiu).
// Nada é gravado no navegador: ao recarregar a página, tudo vem de novo da API.
import { Notify } from 'quasar'
import { api } from 'boot/axios'

// Nome antigo da chave -> rota da API
const COLECOES = {
  saveall_social_partners: '/dados/parceiros-sociais',
  saveall_disposal_partners: '/dados/parceiros-descarte',
  saveall_donation_offers: '/dados/ofertas-doacao',
  esg_disposal_logs: '/dados/registros-descarte',
  saveall_support_tickets: '/dados/chamados-suporte',
  saveall_users: '/master/usuarios',
  saveall_stores: '/master/lojas',
}
const COMUNS = [
  'saveall_social_partners',
  'saveall_disposal_partners',
  'saveall_donation_offers',
  'esg_disposal_logs',
  'saveall_support_tickets',
]
const POR_PERFIL = {
  master: ['saveall_users', 'saveall_stores'],
}

const copiar = (valor) => (valor === undefined ? undefined : JSON.parse(JSON.stringify(valor)))
const mensagemDe = (erro, padrao) => erro?.response?.data?.message || erro?.message || padrao

// --- Tradução dos nomes dos campos das entidades sociais ---
// Dentro do app os objetos continuam com os nomes antigos (name, city...), para não mexer
// em todas as telas. Na ida e na volta da API os campos são traduzidos para português,
// que é como ficam as colunas da tabela entidades_sociais.
// Campo que não estiver aqui passa sem alteração (o back-end guarda em "extras").
const CAMPOS_ENTIDADE = {
  name: 'nome',
  phone: 'telefone',
  address: 'endereco',
  neighborhood: 'bairro',
  city: 'cidade',
  state: 'estado',
  postalCode: 'cep',
  contactPerson: 'responsavel',
  contactRole: 'cargo_responsavel',
  acceptedCategories: 'categorias_aceitas',
  operatingHours: 'horario_funcionamento',
  notes: 'observacoes',
  govSignatureFileName: 'termo_govbr_nome_arquivo',
  govSignatureFileData: 'termo_govbr_arquivo',
  govSignatureHash: 'termo_govbr_hash',
  validationStatus: 'status_validacao',
  selectionStatus: 'status_selecao',
  validatedAt: 'validado_em',
  validatedBy: 'validado_por',
  rejectionReason: 'motivo_recusa',
  active: 'ativo',
  applicationDate: 'data_solicitacao',
  lastNotificationSentAt: 'ultima_notificacao_em',
  lastNotificationType: 'ultima_notificacao_tipo',
  receivingHoursStart: 'recebimento_inicio',
  receivingHoursEnd: 'recebimento_fim',
  receivingDays: 'dias_recebimento',
  beneficiariesCount: 'qtd_beneficiarios',
  hasRefrigeratedStorage: 'possui_refrigeracao',
  hasOwnTransport: 'possui_transporte_proprio',
  dailyCapacityKg: 'capacidade_diaria_kg',
  isMunicipalUnit: 'unidade_municipal',
  origin: 'origem',
}
const CAMPOS_ENTIDADE_INVERSO = Object.fromEntries(
  Object.entries(CAMPOS_ENTIDADE).map(([a, b]) => [b, a]),
)
const COLECAO_ENTIDADES = 'saveall_social_partners'

// Deixe false enquanto o back-end ainda recebe os nomes antigos (name, city...).
// Troque para true só depois que a API passar a usar os nomes em português (nome, cidade...).
const TRADUZIR_CAMPOS = false

const traduzir = (objeto, tabela) => {
  if (!TRADUZIR_CAMPOS) return objeto
  if (!objeto || typeof objeto !== 'object' || Array.isArray(objeto)) return objeto
  return Object.fromEntries(Object.entries(objeto).map(([k, v]) => [tabela[k] || k, v]))
}
const entidadeParaApi = (item) => traduzir(item, CAMPOS_ENTIDADE)
const entidadeDaApi = (item) => traduzir(item, CAMPOS_ENTIDADE_INVERSO)
// Só as entidades sociais são traduzidas; as outras coleções passam direto.
const paraApi = (chave, item) => (chave === COLECAO_ENTIDADES ? entidadeParaApi(item) : item)
const daApi = (chave, dado) =>
  chave !== COLECAO_ENTIDADES
    ? dado
    : Array.isArray(dado)
      ? dado.map(entidadeDaApi)
      : entidadeDaApi(dado)

const cache = new Map() // chave -> lista atual
const espelho = new Map() // chave -> Map(id -> JSON) do último estado conhecido
const filas = new Map() // chave -> Promise (as gravações de uma coleção saem em ordem)
let dadosUsuario = {}
const temporizadores = new Map()
let logado = false

const definir = (chave, lista) => {
  const copia = Array.isArray(lista) ? copiar(lista) : []
  cache.set(chave, copia)
  espelho.set(
    chave,
    new Map(copia.filter((i) => i?.id != null).map((i) => [String(i.id), JSON.stringify(i)])),
  )
}

// Coloca/atualiza um registro vindo do servidor sem gerar nova gravação.
const aplicar = (chave, item) => {
  if (!item?.id) return
  const lista = cache.get(chave) || []
  const indice = lista.findIndex((i) => i.id === item.id)
  if (indice === -1) lista.unshift(copiar(item))
  else lista[indice] = copiar(item)
  cache.set(chave, lista)
  if (!espelho.has(chave)) espelho.set(chave, new Map())
  espelho.get(chave).set(String(item.id), JSON.stringify(item))
}

const avisar = (mensagem) => {
  Notify.create({ message: mensagem, type: 'negative', position: 'top', timeout: 5000 })
}

const avisarAtualizacao = (chave) => {
  window.dispatchEvent(new CustomEvent('saveall_dados_atualizados', { detail: { chave } }))
}

export const armazem = {
  // Carrega do servidor tudo o que o perfil usa. Chamado após login / ao abrir o app.
  async carregar(usuario) {
    this.limpar()
    if (!usuario) return
    logado = true
    const perfil = usuario.role === 'admin' ? 'master' : usuario.role
    const chaves = [...COMUNS, ...(POR_PERFIL[perfil] || [])]
    await Promise.allSettled([
      ...chaves.map((chave) => this.recarregar(chave)),
      api
        .get('/me/dados')
        .then((r) => {
          dadosUsuario = r.data || {}
        })
        .catch(() => {
          dadosUsuario = {}
        }),
    ])
  },

  limpar() {
    logado = false
    cache.clear()
    espelho.clear()
    filas.clear()
    dadosUsuario = {}
    for (const t of temporizadores.values()) clearTimeout(t)
    temporizadores.clear()
  },

  async recarregar(chave) {
    const url = COLECOES[chave]
    if (!url) return []
    try {
      const { data } = await api.get(url)
      definir(chave, daApi(chave, data))
    } catch (erro) {
      console.warn(`[armazem] não foi possível carregar ${chave}:`, mensagemDe(erro))
      if (!cache.has(chave)) definir(chave, [])
    }
    avisarAtualizacao(chave)
    return this.colecao(chave)
  },

  // Leitura síncrona: devolve uma cópia (como o JSON.parse do localStorage fazia).
  colecao(chave) {
    return copiar(cache.get(chave) || [])
  },

  // Grava a lista inteira: envia ao servidor só os registros novos/alterados e remove os que saíram.
  // Devolve uma Promise com as respostas do servidor ([{ id, resposta }]).
  salvarColecao(chave, lista) {
    const url = COLECOES[chave]
    if (!url) return Promise.resolve([])
    const nova = (copiar(lista) || []).filter((item) => {
      if (item?.id != null) return true
      console.warn(`[armazem] registro sem id ignorado em ${chave}`, item)
      return false
    })
    const anterior = espelho.get(chave) || new Map()
    const alterados = nova.filter((item) => anterior.get(String(item.id)) !== JSON.stringify(item))
    const idsNovos = new Set(nova.map((item) => String(item.id)))
    const removidos = [...anterior.keys()].filter((id) => !idsNovos.has(id))
    definir(chave, nova)
    if (!alterados.length && !removidos.length) return Promise.resolve([])

    const tarefa = (filas.get(chave) || Promise.resolve())
      .catch(() => {})
      .then(async () => {
        const respostas = []
        for (const item of alterados) {
          const { data } = await api.put(
            `${url}/${encodeURIComponent(item.id)}`,
            paraApi(chave, item),
          )
          respostas.push({ id: item.id, resposta: daApi(chave, data) })
        }
        for (const id of removidos) await api.delete(`${url}/${encodeURIComponent(id)}`)
        // Usa a versão salva pelo servidor, se o registro não mudou de novo nesse meio tempo.
        for (const { id, resposta } of respostas) {
          const enviado = alterados.find((i) => i.id === id)
          if (espelho.get(chave)?.get(String(id)) === JSON.stringify(enviado))
            aplicar(chave, resposta)
        }
        return respostas
      })
      .catch(async (erro) => {
        const mensagem = mensagemDe(erro, 'Não foi possível salvar no servidor.')
        avisar(mensagem)
        await this.recarregar(chave) // volta a tela para o que realmente está no banco
        // Lista vazia com a mensagem: quem aguarda a gravação sabe que o servidor recusou
        const falha = []
        falha.erro = mensagem
        return falha
      })
    filas.set(chave, tarefa)
    return tarefa
  },

  // Troca a cópia local sem enviar nada ao servidor (ex.: esconder um dado só da tela).
  substituirLocal(chave, lista) {
    definir(chave, lista)
  },

  // --- Preferências e estado de tela do usuário (tabela dados_usuario) ---
  dado(chave, padrao) {
    const valor = dadosUsuario[chave]
    return copiar(valor === undefined ? padrao : valor)
  },

  salvarDado(chave, valor) {
    dadosUsuario[chave] = copiar(valor)
    if (!logado) return
    // Agrupa gravações seguidas (ex.: várias mensagens marcadas como lidas)
    clearTimeout(temporizadores.get(chave))
    temporizadores.set(
      chave,
      setTimeout(() => {
        temporizadores.delete(chave)
        api.put(`/me/dados/${chave}`, { valor: dadosUsuario[chave] }).catch((erro) => {
          console.warn(`[armazem] não foi possível salvar ${chave}:`, mensagemDe(erro))
        })
      }, 400),
    )
  },

  // --- Rotas públicas (sem login) ---
  async carregarParceirosPublicos() {
    try {
      const { data } = await api.get('/publico/parceiros-sociais')
      definir(COLECAO_ENTIDADES, daApi(COLECAO_ENTIDADES, data))
    } catch (erro) {
      console.warn('[armazem] não foi possível carregar as entidades:', mensagemDe(erro))
    }
    return this.colecao('saveall_social_partners')
  },

  async credenciarEntidade(dados) {
    try {
      const { data } = await api.post('/publico/parceiros-sociais', entidadeParaApi(dados))
      const entidade = entidadeDaApi(data)
      aplicar(COLECAO_ENTIDADES, entidade)
      return copiar(entidade)
    } catch (erro) {
      throw new Error(mensagemDe(erro, 'Não foi possível enviar o credenciamento.'))
    }
  },

  async buscarOfertaPublica(chaveOuToken) {
    try {
      const { data } = await api.get(`/publico/ofertas-doacao/${encodeURIComponent(chaveOuToken)}`)
      aplicar('saveall_donation_offers', data)
      return copiar(data)
    } catch {
      return null
    }
  },

  async responderOfertaPublica(chaveOuToken, resposta) {
    try {
      const { data } = await api.post(
        `/publico/ofertas-doacao/${encodeURIComponent(chaveOuToken)}/resposta`,
        resposta,
      )
      aplicar('saveall_donation_offers', data)
      return copiar(data)
    } catch (erro) {
      throw new Error(mensagemDe(erro, 'Não foi possível registrar a resposta.'))
    }
  },

  // Avaliação dos produtos pela entidade (link enviado após a entrega; vale por 1 hora)
  async avaliarOfertaPublica(chaveOuToken, avaliacao) {
    try {
      const { data } = await api.post(
        `/publico/ofertas-doacao/${encodeURIComponent(chaveOuToken)}/avaliacao`,
        avaliacao,
      )
      aplicar('saveall_donation_offers', data)
      return copiar(data)
    } catch (erro) {
      throw new Error(mensagemDe(erro, 'Não foi possível registrar a avaliação.'))
    }
  },
}
