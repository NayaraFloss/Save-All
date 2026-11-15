import { jsPDF } from 'jspdf'
import { servicoDoacoes } from './servicoDoacoes'
import { storeBelongsToCity } from 'src/utils/cidades'
import { armazem } from './armazemServidor'
import { useAppStore } from 'src/stores/estadoApp'
// Pedidos e lojas vêm do estadoApp (carregados da API); registros ESG vêm do servidor via armazem.
const pedidosCarregados = () => useAppStore().orders || []
const lojasCarregadas = () => useAppStore().stores || []
const MONTH_NAMES_PT = {
  '01': 'Janeiro',
  '02': 'Fevereiro',
  '03': 'Mar\xE7o',
  '04': 'Abril',
  '05': 'Maio',
  '06': 'Junho',
  '07': 'Julho',
  '08': 'Agosto',
  '09': 'Setembro',
  10: 'Outubro',
  11: 'Novembro',
  12: 'Dezembro',
}
const formatMonthLabel = (monthKey) => {
  if (!monthKey || monthKey === 'all') return 'Todos os Per\xEDodos'
  try {
    const str = typeof monthKey === 'string' ? monthKey : String(monthKey || '')
    if (!str || !str.includes('-')) return str || 'Todos os Per\xEDodos'
    const parts = str.split('-')
    if (parts.length === 2) {
      const [year, month] = parts
      const name = MONTH_NAMES_PT[month] || month
      return `${name} / ${year}`
    }
    return str
  } catch {
    return 'Todos os Per\xEDodos'
  }
}
const servicoRelatorioMensal = {
  /**
   * Agrega todos os eventos (vendas, doações, descartes) do ecossistema SaveAll.
   * RN06: Todo evento (venda, doação ou descarte) alimenta o Relatório Mensal.
   * Quando mode === 'client', apenas vendas com desconto (resgates) são retornadas.
   */
  getAllEvents(mode) {
    const events = []
    try {
      const orders = pedidosCarregados()
      if (orders.length) {
        orders.forEach((order) => {
          // Só pedido ENTREGUE conta como alimento resgatado (pendente, em preparo ou cancelado não evitou desperdício ainda)
          if (order.status !== 'delivered') return
          const orderDate = new Date(order.date || Date.now())
          const validDate = isNaN(orderDate.getTime()) ? /* @__PURE__ */ new Date() : orderDate
          const month = String(validDate.getMonth() + 1).padStart(2, '0')
          const year = String(validDate.getFullYear())
          const monthKey = `${year}-${month}`
          const itemsWeight = (order.items || []).reduce((sum, item) => {
            const qty = item.quantity || 1
            if (item.weightKg) return sum + item.weightKg * qty
            const price =
              item.price ||
              item.precoComDesconto ||
              (order.subtotal ? order.subtotal / (order.items.length || 1) : 6)
            const estimatedPerItem = Math.max(0.35, price * 0.1)
            return sum + qty * estimatedPerItem
          }, 0)
          const weightKg = Number((itemsWeight > 0 ? itemsWeight : 0.8).toFixed(1))
          const co2AvoidedKg = Number((weightKg * 2.5).toFixed(1))
          const waterSavedLitres = Math.round(weightKg * 130)
          const itemsText =
            (order.items || []).map((i) => `${i.quantity}x ${i.name}`).join(', ') ||
            'Alimentos com desconto'
          events.push({
            id: `venda-${order.id}`,
            type: 'venda',
            title: `Venda com Desconto #${order.id}`,
            category: 'Venda com Desconto',
            lojaId: order.lojaId,
            nomeLoja: order.nomeLoja || 'Padaria Parceira',
            clienteId: order.clienteId,
            nomeCliente: order.nomeCliente || 'Consumidor SaveAll',
            destinationName: order.nomeCliente || 'Consumidor SaveAll',
            destinationType: 'Consumidor Final',
            weightKg,
            quantity: (order.items || []).reduce((s, i) => s + (i.quantity || 1), 0),
            valueRs: order.total || 0,
            co2AvoidedKg,
            waterSavedLitres,
            date: validDate.toISOString(),
            dateFormatted: validDate.toLocaleDateString('pt-BR'),
            monthKey,
            monthLabel: formatMonthLabel(monthKey),
            status: order.status,
            notes: `Itens: ${itemsText}`,
          })
        })
      }
    } catch (e) {
      console.warn('Erro ao carregar vendas para o relat\xF3rio mensal:', e)
    }
    if (mode !== 'client') {
      try {
        const logs = armazem.colecao('esg_disposal_logs')
        if (logs.length) {
          logs.forEach((log) => {
            const logDate = new Date(log.date || Date.now())
            const validDate = isNaN(logDate.getTime()) ? /* @__PURE__ */ new Date() : logDate
            const month = String(validDate.getMonth() + 1).padStart(2, '0')
            const year = String(validDate.getFullYear())
            const monthKey = `${year}-${month}`
            const weightKg = Number((log.weightEstimatedKg || 1).toFixed(1))
            const co2AvoidedKg = Number((weightKg * 2.5).toFixed(1))
            const waterSavedLitres = Math.round(weightKg * 130)
            if (log.type === 'donation') {
              events.push({
                id: `doacao-${log.id}`,
                ofertaId: log.ofertaId || '',
                type: 'doacao',
                title: `Doa\xE7\xE3o Social - ${log.foodName || 'Excedente'}`,
                category: log.category || 'Panifica\xE7\xE3o',
                lojaId: log.lojaId || 'store-1',
                nomeLoja: log.nomeLoja || 'Dona Kiuda Caf\xE9',
                destinationName: log.recipientOrganization || 'Mesa Brasil Sesc',
                destinationType: 'Entidade Social (Lei 14.016)',
                weightKg,
                quantity: log.quantity || 1,
                valueRs: Number((weightKg * 18).toFixed(2)),
                // Valor social estimado R$ 18/kg
                co2AvoidedKg,
                waterSavedLitres,
                date: validDate.toISOString(),
                dateFormatted: validDate.toLocaleDateString('pt-BR'),
                monthKey,
                monthLabel: formatMonthLabel(monthKey),
                status: 'concluido',
                notes: `Assinado por: ${log.signatureName || 'Doador'} (doador)`,
              })
            } else {
              events.push({
                id: `descarte-${log.id}`,
                type: 'descarte',
                title: `Descarte Sustent\xE1vel - ${log.foodName || 'Res\xEDduo Org\xE2nico'}`,
                category: log.category || 'Org\xE2nico',
                lojaId: log.lojaId || 'store-1',
                nomeLoja: log.nomeLoja || 'Dona Kiuda Caf\xE9',
                destinationName: log.discardDestination || 'Adubo Org\xE2nico Pinhal',
                destinationType: log.discardDestinationType || 'Compostagem / Ra\xE7\xE3o',
                weightKg,
                quantity: log.quantity || 1,
                valueRs: 0,
                co2AvoidedKg,
                waterSavedLitres,
                date: validDate.toISOString(),
                dateFormatted: validDate.toLocaleDateString('pt-BR'),
                monthKey,
                monthLabel: formatMonthLabel(monthKey),
                status: 'compostado',
                notes: `Destino Ecol\xF3gico: ${log.discardDestination || 'Unidade de Compostagem'}`,
              })
            }
          })
        }
      } catch (e) {
        console.warn('Erro ao carregar esg_disposal_logs para relat\xF3rio mensal:', e)
      }
      try {
        const donationOffers = servicoDoacoes.getDonationOffers()
        donationOffers.forEach((offer) => {
          // S\xF3 doa\xE7\xE3o finalizada (entregue + certificado) entra nos relat\xF3rios; aguardando, aceita, recusada ou cancelada n\xE3o somam
          if (offer.status !== 'completed') return
          if (events.some((e) => e.id.includes(offer.id) || e.ofertaId === offer.id)) return
          const offerDate = new Date(offer.criadoEm || offer.respondedAt || Date.now())
          const validDate = isNaN(offerDate.getTime()) ? /* @__PURE__ */ new Date() : offerDate
          const month = String(validDate.getMonth() + 1).padStart(2, '0')
          const year = String(validDate.getFullYear())
          const monthKey = `${year}-${month}`
          const weightKg = Number((offer.weightEstimatedKg || 1).toFixed(1))
          const co2AvoidedKg = Number((weightKg * 2.5).toFixed(1))
          const waterSavedLitres = Math.round(weightKg * 130)
          events.push({
            id: `doacao-offer-${offer.id}`,
            type: 'doacao',
            title: `Doa\xE7\xE3o Social - ${offer.foodName}`,
            category: offer.category || 'Padaria',
            lojaId: offer.lojaId,
            nomeLoja: offer.nomeLoja || 'Estabelecimento Parceiro',
            destinationName: offer.recipientOrg || 'Entidade Social',
            destinationType: 'Entidade Social (Gov.br)',
            weightKg,
            quantity: offer.quantity || 1,
            valueRs: Number((weightKg * 18).toFixed(2)),
            co2AvoidedKg,
            waterSavedLitres,
            date: validDate.toISOString(),
            dateFormatted: validDate.toLocaleDateString('pt-BR'),
            monthKey,
            monthLabel: formatMonthLabel(monthKey),
            status: offer.status,
            notes: `M\xE9todo: ${offer.deliveryMethod === 'pickup_by_entity' ? 'Retirada pela Entidade' : 'Entrega pelo Estabelecimento'}`,
          })
        })
      } catch (e) {
        console.warn('Erro ao carregar donation offers para relat\xF3rio mensal:', e)
      }
    }
    // Dados de demonstração só quando o sistema ainda não tem nenhum pedido (nunca por causa de pedidos cancelados/pendentes)
    if (events.length === 0 && pedidosCarregados().length === 0) {
      const now = /* @__PURE__ */ new Date()
      const currentYear = now.getFullYear()
      const currentMonthNum = now.getMonth() + 1
      const currentMonthStr = String(currentMonthNum).padStart(2, '0')
      const currentMonthKey = `${currentYear}-${currentMonthStr}`
      const prevDate = new Date(currentYear, now.getMonth() - 1, 15)
      const prevMonthStr = String(prevDate.getMonth() + 1).padStart(2, '0')
      const prevMonthKey = `${prevDate.getFullYear()}-${prevMonthStr}`
      const seedEvents = [
        {
          id: 'venda-seed-1',
          type: 'venda',
          title: 'Venda com Desconto #ORD-8821',
          category: 'Venda com Desconto',
          lojaId: 'store-1',
          nomeLoja: 'Dona Kiuda Caf\xE9',
          clienteId: 'client-1',
          nomeCliente: 'Camila Silva',
          destinationName: 'Camila Silva',
          destinationType: 'Consumidor Final',
          weightKg: 2.4,
          quantity: 4,
          valueRs: 28.5,
          co2AvoidedKg: 6,
          waterSavedLitres: 312,
          date: new Date(
            currentYear,
            currentMonthNum - 1,
            Math.min(now.getDate(), 20),
            14,
            30,
          ).toISOString(),
          dateFormatted: `${String(Math.min(now.getDate(), 20)).padStart(2, '0')}/${currentMonthStr}/${currentYear}`,
          monthKey: currentMonthKey,
          monthLabel: formatMonthLabel(currentMonthKey),
          status: 'delivered',
          notes: 'Itens: 2x Croissant Franc\xEAs, 2x P\xE3o de Queijo Tradicional',
        },
        ...(mode === 'client'
          ? []
          : [
              {
                id: 'doacao-seed-1',
                type: 'doacao',
                title: 'Doa\xE7\xE3o Social - Cesta de P\xE3es e Tortas',
                category: 'Panifica\xE7\xE3o',
                lojaId: 'store-1',
                nomeLoja: 'Dona Kiuda Caf\xE9',
                destinationName: 'Mesa Brasil Sesc',
                destinationType: 'Entidade Social (Lei 14.016)',
                weightKg: 8.5,
                quantity: 12,
                valueRs: 153,
                co2AvoidedKg: 21.3,
                waterSavedLitres: 1105,
                date: new Date(
                  currentYear,
                  currentMonthNum - 1,
                  Math.min(now.getDate(), 18),
                  17,
                  15,
                ).toISOString(),
                dateFormatted: `${String(Math.min(now.getDate(), 18)).padStart(2, '0')}/${currentMonthStr}/${currentYear}`,
                monthKey: currentMonthKey,
                monthLabel: formatMonthLabel(currentMonthKey),
                status: 'concluido',
                notes: 'Termo Lei 14.016 assinado digitalmente com Valida\xE7\xE3o de Seguran\xE7a',
              },
              {
                id: 'descarte-seed-1',
                type: 'descarte',
                title: 'Descarte Sustent\xE1vel - Sobras de Caf\xE9 e Farinhas',
                category: 'Org\xE2nico',
                lojaId: 'store-1',
                nomeLoja: 'Dona Kiuda Caf\xE9',
                destinationName: 'Adubo Org\xE2nico Pinhal',
                destinationType: 'Compostagem / Ra\xE7\xE3o',
                weightKg: 5.2,
                quantity: 3,
                valueRs: 0,
                co2AvoidedKg: 13,
                waterSavedLitres: 676,
                date: new Date(
                  currentYear,
                  currentMonthNum - 1,
                  Math.min(now.getDate(), 16),
                  11,
                  0,
                ).toISOString(),
                dateFormatted: `${String(Math.min(now.getDate(), 16)).padStart(2, '0')}/${currentMonthStr}/${currentYear}`,
                monthKey: currentMonthKey,
                monthLabel: formatMonthLabel(currentMonthKey),
                status: 'compostado',
                notes: 'Destino Ecol\xF3gico: Usina de Compostagem BioPinhalzinho',
              },
            ]),
        {
          id: 'venda-seed-2',
          type: 'venda',
          title: 'Venda com Desconto #ORD-8804',
          category: 'Venda com Desconto',
          lojaId: 'store-2',
          nomeLoja: 'Padaria Central Pinhal',
          clienteId: 'client-2',
          nomeCliente: 'Marcos Vinicius',
          destinationName: 'Marcos Vinicius',
          destinationType: 'Consumidor Final',
          weightKg: 3.1,
          quantity: 5,
          valueRs: 34,
          co2AvoidedKg: 7.8,
          waterSavedLitres: 403,
          date: new Date(
            currentYear,
            currentMonthNum - 1,
            Math.min(now.getDate(), 14),
            18,
            45,
          ).toISOString(),
          dateFormatted: `${String(Math.min(now.getDate(), 14)).padStart(2, '0')}/${currentMonthStr}/${currentYear}`,
          monthKey: currentMonthKey,
          monthLabel: formatMonthLabel(currentMonthKey),
          status: 'delivered',
          notes: 'Itens: 1x Torta de Frango, 4x Brioche Artesanal',
        },
        ...(mode === 'client'
          ? []
          : [
              {
                id: 'doacao-seed-2',
                type: 'doacao',
                title: 'Doa\xE7\xE3o Social - Excedente de Frutas e L\xE1cteos',
                category: 'Hortifruti',
                lojaId: 'store-3',
                nomeLoja: 'Supermercado Compre Bem',
                destinationName: 'Lar dos Idosos S\xE3o Francisco',
                destinationType: 'Entidade Social (Lei 14.016)',
                weightKg: 14,
                quantity: 20,
                valueRs: 252,
                co2AvoidedKg: 35,
                waterSavedLitres: 1820,
                date: new Date(
                  currentYear,
                  currentMonthNum - 1,
                  Math.min(now.getDate(), 10),
                  10,
                  30,
                ).toISOString(),
                dateFormatted: `${String(Math.min(now.getDate(), 10)).padStart(2, '0')}/${currentMonthStr}/${currentYear}`,
                monthKey: currentMonthKey,
                monthLabel: formatMonthLabel(currentMonthKey),
                status: 'concluido',
                notes: 'Transporte refrigerado homologado',
              },
              {
                id: 'descarte-seed-2',
                type: 'descarte',
                title: 'Descarte Sustent\xE1vel - Cascas e Baga\xE7o',
                category: 'Org\xE2nico',
                lojaId: 'store-2',
                nomeLoja: 'Padaria Central Pinhal',
                destinationName: 'Biodigestor Rural Oeste',
                destinationType: 'Biodigestor / Biog\xE1s',
                weightKg: 7,
                quantity: 4,
                valueRs: 0,
                co2AvoidedKg: 17.5,
                waterSavedLitres: 910,
                date: new Date(
                  currentYear,
                  currentMonthNum - 1,
                  Math.min(now.getDate(), 7),
                  16,
                  20,
                ).toISOString(),
                dateFormatted: `${String(Math.min(now.getDate(), 7)).padStart(2, '0')}/${currentMonthStr}/${currentYear}`,
                monthKey: currentMonthKey,
                monthLabel: formatMonthLabel(currentMonthKey),
                status: 'compostado',
                notes: 'Gera\xE7\xE3o de biog\xE1s e biofertilizante agr\xEDcola',
              },
            ]),
        {
          id: 'venda-seed-prev-1',
          type: 'venda',
          title: 'Venda com Desconto #ORD-8710',
          category: 'Venda com Desconto',
          lojaId: 'store-1',
          nomeLoja: 'Dona Kiuda Caf\xE9',
          clienteId: 'client-1',
          nomeCliente: 'Camila Silva',
          destinationName: 'Camila Silva',
          destinationType: 'Consumidor Final',
          weightKg: 4.2,
          quantity: 6,
          valueRs: 42,
          co2AvoidedKg: 10.5,
          waterSavedLitres: 546,
          date: prevDate.toISOString(),
          dateFormatted: `15/${prevMonthStr}/${prevDate.getFullYear()}`,
          monthKey: prevMonthKey,
          monthLabel: formatMonthLabel(prevMonthKey),
          status: 'delivered',
          notes: 'Itens: P\xE3es e bolos diversos resgatados',
        },
      ]
      events.push(...seedEvents)
    }
    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return events
  },
  /**
   * Retorna lista de meses disponíveis encontrados nos eventos.
   */
  getAvailableMonths(mode) {
    const events = this.getAllEvents(mode)
    const monthsSet = /* @__PURE__ */ new Set()
    const now = /* @__PURE__ */ new Date()
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    monthsSet.add(currentMonthKey)
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const prevMonthKey = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`
    monthsSet.add(prevMonthKey)
    events.forEach((e) => {
      if (mode === 'client' && e.type !== 'venda') return
      if (e.monthKey) monthsSet.add(e.monthKey)
    })
    const sortedKeys = Array.from(monthsSet).sort().reverse()
    return [
      { key: 'all', label: 'Todos os Meses (Consolidado Hist\xF3rico)' },
      ...sortedKeys.map((key) => ({
        key,
        label: formatMonthLabel(key),
      })),
    ]
  },
  /**
   * Retorna lista de estabelecimentos que têm eventos registrados ou cadastrados.
   */
  getAvailableStores() {
    const storesMap = /* @__PURE__ */ new Map()
    lojasCarregadas().forEach((s) => {
      if (s.name) storesMap.set(s.name, s.name)
    })
    const events = this.getAllEvents()
    events.forEach((e) => {
      if (e.nomeLoja) storesMap.set(e.nomeLoja, e.nomeLoja)
    })
    return Array.from(storesMap.entries()).map(([name, label]) => ({
      id: name,
      name: label,
    }))
  },
  /**
   * Retorna o Relatório Mensal consolidado de acordo com os filtros solicitados.
   * - Master: total de todas as lojas, com filtro opcional por estabelecimento
   * - Estabelecimento: apenas o que ele evitou (vendas com desconto + doações + descartes)
   * - Consumidor (Cliente): apenas os registros de compras que ele realizou (sem descartes ou doações)
   */
  getConsolidatedReport(options) {
    const isClient = options?.mode === 'client' || !!options?.clienteId
    const allEvents = this.getAllEvents(options?.mode)
    const monthKey = options?.monthKey || 'all'
    // Vários meses de uma vez (ex.: escolhidos ao baixar o PDF); vazio = usa monthKey
    const monthKeys =
      Array.isArray(options?.monthKeys) && options.monthKeys.length ? options.monthKeys : null
    let filtered = allEvents
    if (isClient) {
      filtered = filtered.filter((e) => e.type === 'venda')
    }
    // Período por dias (dataInicio/dataFim no formato AAAA-MM-DD, pela data local do evento)
    const diaLocal = (iso) => {
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return ''
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    const dataInicio = options?.dataInicio || null
    const dataFim = options?.dataFim || dataInicio
    // Anos inteiros (ex.: ['2026'])
    const anos =
      Array.isArray(options?.anos) && options.anos.length ? options.anos.map(String) : null
    if (dataInicio) {
      filtered = filtered.filter((e) => {
        const dia = diaLocal(e.date)
        return dia >= dataInicio && dia <= dataFim
      })
    } else if (anos) {
      filtered = filtered.filter((e) => anos.includes(String(e.monthKey || '').slice(0, 4)))
    } else if (monthKeys) {
      filtered = filtered.filter((e) => monthKeys.includes(e.monthKey))
    } else if (monthKey && monthKey !== 'all') {
      filtered = filtered.filter((e) => e.monthKey === monthKey)
    }
    if (options?.storeIdOrName && options.storeIdOrName !== 'all') {
      const term = options.storeIdOrName.toLowerCase().trim()
      filtered = filtered.filter(
        (e) =>
          (e.nomeLoja && e.nomeLoja.toLowerCase().includes(term)) ||
          (e.lojaId && e.lojaId.toLowerCase() === term),
      )
    }
    // Filtro por cidade (master): usa a cidade/endere\xE7o de cada loja; loja sem cadastro segue a regra padr\xE3o do app
    if (options?.cityFilter && options.cityFilter !== 'all') {
      const lojas = lojasCarregadas()
      filtered = filtered.filter((e) => {
        const nome = String(e.nomeLoja || '')
          .toLowerCase()
          .trim()
        const loja = lojas.find(
          (l) =>
            (nome &&
              String(l.name || '')
                .toLowerCase()
                .trim() === nome) ||
            (e.lojaId && String(l.id || '').toLowerCase() === String(e.lojaId).toLowerCase()),
        )
        return storeBelongsToCity(loja || {}, options.cityFilter)
      })
    }
    if (options?.clienteId || options?.nomeCliente) {
      const cid = (options.clienteId || '').toLowerCase().trim()
      const cname = (options.nomeCliente || '').toLowerCase().trim()
      const clientMatched = filtered.filter((e) => {
        if (e.type !== 'venda') return false
        const eCid = (e.clienteId || '').toLowerCase().trim()
        const eCname = (e.nomeCliente || '').toLowerCase().trim()
        if (cid && (eCid === cid || eCname === cid)) return true
        if (cname && (eCname === cname || eCid === cname)) return true
        if (
          (cid === 'user-client-1' || cname.includes('camila')) &&
          (eCid === 'user-client-1' || eCname.includes('camila'))
        )
          return true
        return false
      })
      if (clientMatched.length > 0) {
        filtered = clientMatched
      } else {
        // Cliente sem compras entregues: impacto zero (antes aparecia a soma das compras de outras pessoas)
        filtered = []
      }
    }
    if (options?.type && !isClient) {
      filtered = filtered.filter((e) => e.type === options.type)
    }
    const salesEvents = filtered.filter((e) => e.type === 'venda')
    const donationsEvents = isClient ? [] : filtered.filter((e) => e.type === 'doacao')
    const disposalsEvents = isClient ? [] : filtered.filter((e) => e.type === 'descarte')
    const salesWeight = salesEvents.reduce((s, e) => s + e.weightKg, 0)
    const salesValue = salesEvents.reduce((s, e) => s + (e.valueRs || 0), 0)
    const donationsWeight = donationsEvents.reduce((s, e) => s + e.weightKg, 0)
    const donationsValue = donationsEvents.reduce((s, e) => s + (e.valueRs || 0), 0)
    const disposalsWeight = disposalsEvents.reduce((s, e) => s + e.weightKg, 0)
    const totalWeightKg = Number((salesWeight + donationsWeight + disposalsWeight).toFixed(1))
    const totalCo2AvoidedKg = Number((totalWeightKg * 2.5).toFixed(1))
    const totalWaterSavedLitres = Math.round(totalWeightKg * 130)
    const totalFinancialValueRs = Number((salesValue + donationsValue).toFixed(2))
    const safeTotalWeight = totalWeightKg > 0 ? totalWeightKg : 1
    const salesPercent = isClient
      ? totalWeightKg > 0
        ? 100
        : 0
      : Math.round((salesWeight / safeTotalWeight) * 100)
    const donationsPercent = isClient ? 0 : Math.round((donationsWeight / safeTotalWeight) * 100)
    const disposalsPercent = isClient ? 0 : Math.max(0, 100 - salesPercent - donationsPercent)
    const monthKeysOrdenadas = monthKeys ? [...monthKeys].sort().reverse() : null
    const diaBr = (dia) => dia.split('-').reverse().join('/')
    const anosOrdenados = anos ? [...anos].sort() : null
    let chavePeriodo
    let rotuloPeriodo
    if (dataInicio) {
      chavePeriodo = dataInicio === dataFim ? dataInicio : `${dataInicio}_a_${dataFim}`
      rotuloPeriodo =
        dataInicio === dataFim
          ? `Dia ${diaBr(dataInicio)}`
          : `De ${diaBr(dataInicio)} a ${diaBr(dataFim)}`
    } else if (anosOrdenados) {
      chavePeriodo = anosOrdenados.join('_')
      rotuloPeriodo =
        anosOrdenados.length === 1
          ? `Ano de ${anosOrdenados[0]}`
          : `Anos de ${anosOrdenados.join(', ')}`
    } else if (monthKeysOrdenadas) {
      chavePeriodo = monthKeysOrdenadas.join('_')
      rotuloPeriodo =
        monthKeysOrdenadas.length <= 2
          ? monthKeysOrdenadas.map(formatMonthLabel).join(' \xB7 ')
          : `${monthKeysOrdenadas.length} meses selecionados`
    } else {
      chavePeriodo = monthKey
      rotuloPeriodo = formatMonthLabel(monthKey)
    }
    return {
      monthKey: chavePeriodo,
      monthLabel: rotuloPeriodo,
      filterStoreName: options?.storeIdOrName !== 'all' ? options?.storeIdOrName : void 0,
      filterCity: options?.cityFilter && options.cityFilter !== 'all' ? options.cityFilter : void 0,
      filterClientName: options?.clienteId,
      totals: {
        totalEventsCount: filtered.length,
        totalWeightKg,
        totalCo2AvoidedKg,
        totalWaterSavedLitres,
        totalFinancialValueRs: isClient ? salesValue : totalFinancialValueRs,
        salesCount: salesEvents.length,
        salesWeightKg: Number(salesWeight.toFixed(1)),
        salesValueRs: Number(salesValue.toFixed(2)),
        donationsCount: isClient ? 0 : donationsEvents.length,
        donationsWeightKg: isClient ? 0 : Number(donationsWeight.toFixed(1)),
        donationsEstimatedValueRs: isClient ? 0 : Number(donationsValue.toFixed(2)),
        disposalsCount: isClient ? 0 : disposalsEvents.length,
        disposalsWeightKg: isClient ? 0 : Number(disposalsWeight.toFixed(1)),
      },
      percentages: {
        salesPercent: totalWeightKg > 0 ? salesPercent : 0,
        donationsPercent: isClient ? 0 : totalWeightKg > 0 ? donationsPercent : 0,
        disposalsPercent: isClient ? 0 : totalWeightKg > 0 ? disposalsPercent : 0,
      },
      events: filtered,
    }
  },
  /**
   * Emissão em PDF do Relatório Mensal Consolidado (RN06)
   */
  downloadPdfReport(report, audienceRole, entityName) {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    })
    const greenDark = [21, 128, 61]
    const textDark = [15, 23, 42]
    const textMuted = [71, 85, 105]
    let currentY = 18
    doc.setFillColor(greenDark[0], greenDark[1], greenDark[2])
    doc.rect(0, 0, 210, 8, 'F')
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(greenDark[0], greenDark[1], greenDark[2])
    doc.text('SAVEALL SUSTENTABILIDADE ALIMENTAR', 14, currentY)
    currentY += 6
    doc.setFontSize(11)
    doc.setTextColor(textDark[0], textDark[1], textDark[2])
    if (audienceRole === 'client') {
      doc.text('EXTRATO DE COMPRAS E ALIMENTOS RESGATADOS', 14, currentY)
    } else {
      doc.text('RELAT\xD3RIO MENSAL DE DESTINA\xC7\xC3O & IMPACTO', 14, currentY)
    }
    currentY += 5
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2])
    if (audienceRole === 'client') {
      doc.text(
        'Resgates Pessoais Sustent\xE1veis: Compras com Desconto e Combate ao Desperd\xEDcio de Alimentos',
        14,
        currentY,
      )
    } else {
      doc.text(
        'Auditoria de Destina\xE7\xE3o Sustent\xE1vel: Vendas com Desconto \xB7 Doa\xE7\xF5es Lei 14.016 \xB7 Descartes Ecol\xF3gicos',
        14,
        currentY,
      )
    }
    currentY += 4
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.5)
    doc.line(14, currentY, 196, currentY)
    currentY += 7
    doc.setFontSize(9)
    doc.setTextColor(textDark[0], textDark[1], textDark[2])
    doc.setFont('Helvetica', 'bold')
    doc.text('Per\xEDodo Avaliado:', 14, currentY)
    doc.setFont('Helvetica', 'normal')
    doc.text(report.monthLabel, 48, currentY)
    doc.setFont('Helvetica', 'bold')
    doc.text('Data de Emiss\xE3o:', 120, currentY)
    doc.setFont('Helvetica', 'normal')
    doc.text(/* @__PURE__ */ new Date().toLocaleString('pt-BR'), 152, currentY)
    currentY += 5.5
    doc.setFont('Helvetica', 'bold')
    const scopeLabel =
      audienceRole === 'master'
        ? '\xC2mbito da Auditoria:'
        : audienceRole === 'store'
          ? 'Estabelecimento Gerador:'
          : 'Consumidor Titular:'
    doc.text(scopeLabel, 14, currentY)
    doc.setFont('Helvetica', 'normal')
    const scopeValue =
      audienceRole === 'master'
        ? report.filterCity
          ? `Filtro por Cidade: ${report.filterCity}`
          : report.filterStoreName
            ? `Filtro por Estabelecimento: ${report.filterStoreName}`
            : 'Consolidado Rede Geral (Todas as Cidades)'
        : entityName
    doc.text(scopeValue, 56, currentY)
    currentY += 8
    doc.setFillColor(240, 253, 244)
    doc.roundedRect(14, currentY, 182, 28, 3, 3, 'F')
    doc.setDrawColor(187, 247, 208)
    doc.roundedRect(14, currentY, 182, 28, 3, 3, 'S')
    const boxY = currentY + 7
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(21, 128, 61)
    doc.text(
      audienceRole === 'client' ? 'ALIMENTO RESGATADO' : 'ALIMENTO SALVO/DESTINADO',
      20,
      boxY,
    )
    doc.setFontSize(13)
    doc.text(`${report.totals.totalWeightKg} kg`, 20, boxY + 7)
    doc.setFontSize(7.5)
    doc.setFont('Helvetica', 'normal')
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2])
    doc.text(
      audienceRole === 'client'
        ? `${report.totals.salesCount} compras computadas`
        : `${report.totals.totalEventsCount} eventos computados`,
      20,
      boxY + 13,
    )
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(2, 132, 199)
    doc.text('CO2e RETIDO FORA DO ATERRO', 68, boxY)
    doc.setFontSize(13)
    doc.text(`${report.totals.totalCo2AvoidedKg} kg`, 68, boxY + 7)
    doc.setFontSize(7.5)
    doc.setFont('Helvetica', 'normal')
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2])
    doc.text('Fator: 2.5 kg CO2e / kg', 68, boxY + 13)
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(14, 116, 144)
    doc.text('\xC1GUA POUPADA', 118, boxY)
    doc.setFontSize(13)
    doc.text(`${report.totals.totalWaterSavedLitres} L`, 118, boxY + 7)
    doc.setFontSize(7.5)
    doc.setFont('Helvetica', 'normal')
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2])
    doc.text('Pegada h\xEDdrica retida', 118, boxY + 13)
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(180, 83, 9)
    doc.text(audienceRole === 'client' ? 'ECONOMIA PESSOAL' : 'VALOR MOVIMENTADO', 158, boxY)
    doc.setFontSize(12)
    doc.text(
      `R$ ${(audienceRole === 'client' ? report.totals.salesValueRs : report.totals.totalFinancialValueRs).toFixed(2)}`,
      158,
      boxY + 7,
    )
    doc.setFontSize(7.5)
    doc.setFont('Helvetica', 'normal')
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2])
    doc.text(
      audienceRole === 'client' ? 'Economia em descontos' : 'Resgates e valor social',
      158,
      boxY + 13,
    )
    if (audienceRole === 'client') {
      currentY += 34
      doc.setFont('Helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(textDark[0], textDark[1], textDark[2])
      doc.text('RESUMO EXCLUSIVO DE RESGATES E COMPRAS DO CLIENTE', 14, currentY)
      currentY += 5
      doc.setFillColor(248, 250, 252)
      doc.roundedRect(14, currentY, 182, 22, 2, 2, 'F')
      doc.setDrawColor(226, 232, 240)
      doc.roundedRect(14, currentY, 182, 22, 2, 2, 'S')
      doc.setFontSize(8.5)
      doc.setTextColor(21, 128, 61)
      doc.text('Compras Sustent\xE1veis Realizadas', 20, currentY + 6)
      doc.setFontSize(11)
      doc.setTextColor(textDark[0], textDark[1], textDark[2])
      doc.text(
        `${report.totals.salesCount} Pedidos Conclu\xEDdos \xB7 ${report.totals.salesWeightKg} kg Resgatados`,
        20,
        currentY + 12.5,
      )
      doc.setFontSize(8)
      doc.setTextColor(textMuted[0], textMuted[1], textMuted[2])
      doc.text(
        `Total economizado com descontos: R$ ${report.totals.salesValueRs.toFixed(2)} \xB7 CO2e evitado: ${report.totals.totalCo2AvoidedKg} kg`,
        20,
        currentY + 18,
      )
    } else {
      currentY += 34
      doc.setFont('Helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(textDark[0], textDark[1], textDark[2])
      doc.text('DETALHAMENTO POR CANAL DE DESTINA\xC7\xC3O', 14, currentY)
      currentY += 5
      const colWidth = 58
      doc.setFillColor(248, 250, 252)
      doc.roundedRect(14, currentY, colWidth, 22, 2, 2, 'F')
      doc.setDrawColor(226, 232, 240)
      doc.roundedRect(14, currentY, colWidth, 22, 2, 2, 'S')
      doc.setFontSize(8)
      doc.setTextColor(21, 128, 61)
      doc.text('1. Vendas com Desconto', 18, currentY + 5.5)
      doc.setFontSize(10)
      doc.setTextColor(textDark[0], textDark[1], textDark[2])
      doc.text(`${report.totals.salesWeightKg} kg`, 18, currentY + 11.5)
      doc.setFontSize(7.5)
      doc.setTextColor(textMuted[0], textMuted[1], textMuted[2])
      doc.text(
        `${report.totals.salesCount} pedidos \xB7 R$ ${report.totals.salesValueRs.toFixed(2)}`,
        18,
        currentY + 17,
      )
      doc.setFillColor(248, 250, 252)
      doc.roundedRect(76, currentY, colWidth, 22, 2, 2, 'F')
      doc.setDrawColor(226, 232, 240)
      doc.roundedRect(76, currentY, colWidth, 22, 2, 2, 'S')
      doc.setFontSize(8)
      doc.setTextColor(2, 132, 199)
      doc.text('2. Doa\xE7\xF5es Sociais', 80, currentY + 5.5)
      doc.setFontSize(10)
      doc.setTextColor(textDark[0], textDark[1], textDark[2])
      doc.text(`${report.totals.donationsWeightKg} kg`, 80, currentY + 11.5)
      doc.setFontSize(7.5)
      doc.setTextColor(textMuted[0], textMuted[1], textMuted[2])
      doc.text(`${report.totals.donationsCount} doa\xE7\xF5es \xB7 Lei 14.016`, 80, currentY + 17)
      doc.setFillColor(248, 250, 252)
      doc.roundedRect(138, currentY, colWidth, 22, 2, 2, 'F')
      doc.setDrawColor(226, 232, 240)
      doc.roundedRect(138, currentY, colWidth, 22, 2, 2, 'S')
      doc.setFontSize(8)
      doc.setTextColor(217, 119, 6)
      doc.text('3. Descartes Sustent\xE1veis', 142, currentY + 5.5)
      doc.setFontSize(10)
      doc.setTextColor(textDark[0], textDark[1], textDark[2])
      doc.text(`${report.totals.disposalsWeightKg} kg`, 142, currentY + 11.5)
      doc.setFontSize(7.5)
      doc.setTextColor(textMuted[0], textMuted[1], textMuted[2])
      doc.text(`${report.totals.disposalsCount} descartes \xB7 Compostagem`, 142, currentY + 17)
    }
    currentY += 28
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(textDark[0], textDark[1], textDark[2])
    doc.text(
      audienceRole === 'client'
        ? 'EXTRATO ANAL\xCDTICO DE COMPRAS RESGATADAS NO PER\xCDODO'
        : 'EXTRATO ANAL\xCDTICO DE EVENTOS DO PER\xCDODO',
      14,
      currentY,
    )
    currentY += 4
    doc.setFillColor(241, 245, 249)
    doc.rect(14, currentY, 182, 6, 'F')
    doc.setFontSize(7.5)
    doc.setTextColor(textDark[0], textDark[1], textDark[2])
    doc.text('DATA', 16, currentY + 4.2)
    doc.text(audienceRole === 'client' ? 'STATUS' : 'TIPO', 36, currentY + 4.2)
    doc.text(
      audienceRole === 'client' ? 'ESTABELECIMENTO' : 'ESTABELECIMENTO / ORIGEM',
      58,
      currentY + 4.2,
    )
    doc.text(
      audienceRole === 'client' ? 'ITENS DA SACOLA / PEDIDO' : 'DESCRI\xC7\xC3O / DESTINO',
      106,
      currentY + 4.2,
    )
    doc.text('PESO', 162, currentY + 4.2)
    doc.text(audienceRole === 'client' ? 'ECONOMIA' : 'IMPACTO', 178, currentY + 4.2)
    currentY += 6
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(7)
    const eventsList =
      audienceRole === 'client' ? report.events.filter((e) => e.type === 'venda') : report.events
    const maxItems = Math.min(eventsList.length, 18)
    for (let i = 0; i < maxItems; i++) {
      const e = eventsList[i]
      if (currentY > 268) break
      const typeLabel =
        audienceRole === 'client'
          ? 'Compra'
          : e.type === 'venda'
            ? 'Venda'
            : e.type === 'doacao'
              ? 'Doa\xE7\xE3o'
              : 'Descarte'
      const storeText = (e.nomeLoja || '-').substring(0, 22)
      const descText =
        audienceRole === 'client'
          ? (e.notes ? e.notes.replace('Itens: ', '') : e.title).substring(0, 34)
          : `${e.title || ''} (${e.destinationName || ''})`.substring(0, 32)
      doc.setTextColor(textDark[0], textDark[1], textDark[2])
      doc.text(e.dateFormatted, 16, currentY + 3.8)
      if (e.type === 'venda') doc.setTextColor(21, 128, 61)
      else if (e.type === 'doacao') doc.setTextColor(2, 132, 199)
      else doc.setTextColor(217, 119, 6)
      doc.text(typeLabel, 36, currentY + 3.8)
      doc.setTextColor(textDark[0], textDark[1], textDark[2])
      doc.text(storeText, 58, currentY + 3.8)
      doc.text(descText, 106, currentY + 3.8)
      doc.text(`${e.weightKg} kg`, 162, currentY + 3.8)
      if (audienceRole === 'client' && e.valueRs) {
        doc.text(`R$ ${e.valueRs.toFixed(2)}`, 178, currentY + 3.8)
      } else {
        doc.text(`${e.co2AvoidedKg} kg CO2`, 178, currentY + 3.8)
      }
      currentY += 4.8
      doc.setDrawColor(241, 245, 249)
      doc.line(14, currentY, 196, currentY)
    }
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2])
    const footerText =
      audienceRole === 'client'
        ? `SaveAll Brasil \xB7 Extrato Pessoal de Compras Sustent\xE1veis \xB7 Emitido para ${entityName}`
        : `SaveAll Brasil \xB7 Relat\xF3rio Mensal em conformidade com ODS 12 e Lei Federal 14.016/2020 \xB7 Emitido para ${entityName}`
    doc.text(footerText, 14, 286)
    doc.text(`P\xE1gina 1 de 1 \xB7 Protocolo: REL-${Date.now().toString().slice(-8)}`, 150, 286)
    const safeFileName =
      audienceRole === 'client'
        ? `Relatorio_Compras_Cliente_${report.monthKey}_${entityName.replace(/\s+/g, '_')}.pdf`
        : `Relatorio_Mensal_${report.monthKey}_${entityName.replace(/\s+/g, '_')}.pdf`
    doc.save(safeFileName)
  },
}
export { formatMonthLabel, servicoRelatorioMensal }
