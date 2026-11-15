import { IMAGES } from 'src/assets/images'
import { servicoDoacoes } from './servicoDoacoes'
import { jsPDF } from 'jspdf'
import { Notify } from 'quasar'
import { api } from './api'
import { armazem } from './armazemServidor'
import { foodService } from './servicoAlimentos'
import { useAppStore } from 'src/stores/estadoApp'
// Tudo aqui vem do back-end: usuários (/master/usuarios), lojas (/master/lojas),
// chamados (/dados/chamados-suporte). Pedidos e alimentos vêm do estadoApp.
const USERS_KEY = 'saveall_users'
const STORES_KEY = 'saveall_stores'
const TICKETS_KEY = 'saveall_support_tickets'

// Depois de moderar/excluir uma loja, o servidor muda os alimentos dela: atualiza a vitrine.
const atualizarVitrine = async () => {
  try {
    const app = useAppStore()
    app.foods = await foodService.getAllFoods()
  } catch {
    // a lista é recarregada na próxima entrada do painel
  }
}

const servicoMaster = {
  // === 1. CREDENCIAIS DO MASTER ADMIN ===
  // Dados do master logado (a senha nunca sai do servidor).
  getMasterCredentials() {
    const usuario = useAppStore().usuarioAtual || {}
    return {
      username: usuario.name || 'admin',
      email: usuario.email || '',
      lastUpdated: usuario.credenciaisAtualizadasEm || usuario.criadoEm || null,
    }
  },
  async updateMasterCredentials(newUsername, newPassword, newEmail) {
    try {
      const { data } = await api.put('/master/credenciais', {
        username: (newUsername || '').trim(),
        email: (newEmail || '').trim(),
        password: newPassword && newPassword.trim() ? newPassword.trim() : undefined,
      })
      const app = useAppStore()
      app.usuarioAtual = { ...app.usuarioAtual, ...data }
      await armazem.recarregar(USERS_KEY)
      return this.getMasterCredentials()
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Erro ao atualizar as credenciais.')
    }
  },
  // === 2. GESTÃO COMPLETA DE USUÁRIOS (CRUD) ===
  getAllUsers() {
    return armazem.colecao(USERS_KEY)
  },
  saveUser(userData) {
    const users = this.getAllUsers()
    if (userData.id) {
      const idx = users.findIndex((u) => u.id === userData.id)
      if (idx !== -1) {
        users[idx] = {
          ...users[idx],
          ...userData,
          criadoEm: users[idx].criadoEm || userData.criadoEm || '2026-01-15T09:20:00.000Z',
          idNumerico: users[idx].idNumerico || userData.idNumerico || idx + 1,
        }
        armazem.salvarColecao(USERS_KEY, users)
        return users[idx]
      }
    }
    const nextNumericId = users.reduce((max, u) => Math.max(max, u.idNumerico || 0), 0) + 1
    const newUser = {
      id: `user-${Date.now()}`,
      idNumerico: userData.idNumerico || nextNumericId,
      criadoEm: userData.criadoEm || /* @__PURE__ */ new Date().toISOString(),
      name: userData.name || 'Novo Usu\xE1rio',
      email: userData.email || `usuario_${Date.now()}@email.com`,
      role: userData.role || 'client',
      points: userData.points || 0,
      valorTotalEconomizado: userData.valorTotalEconomizado || 0,
      lucroAcumulado: userData.lucroAcumulado || 0,
      address: userData.address || 'Pinhalzinho, SC',
      cpfCnpj: userData.cpfCnpj || '',
      verificado: userData.verificado !== void 0 ? userData.verificado : true,
      // Só lojas recebem estrelas; clientes, entidades e descartes apenas avaliam
      rating:
        userData.role === 'store' ? (userData.rating !== void 0 ? userData.rating : 5) : void 0,
      qtdAvaliacoes: userData.role === 'store' ? userData.qtdAvaliacoes || 0 : void 0,
      qtdReclamacoes: userData.qtdReclamacoes || 0,
      suspenso: userData.suspenso || false,
      motivoDesvinculo: userData.motivoDesvinculo,
    }
    users.push(newUser)
    // O servidor gera uma senha temporária para o novo usuário: mostra ao master uma única vez.
    armazem.salvarColecao(USERS_KEY, users).then((respostas) => {
      const criado = respostas.find((r) => r.resposta?.senhaTemporaria)
      if (!criado) return
      Notify.create({
        message: `Senha temporária de ${criado.resposta.name}: ${criado.resposta.senhaTemporaria}`,
        caption: 'Anote e repasse ao usuário. Ela não será exibida novamente.',
        type: 'info',
        position: 'top',
        timeout: 0,
        actions: [{ label: 'OK', color: 'white' }],
      })
      const lista = armazem.colecao(USERS_KEY).map((u) => {
        if (u.id === criado.id) delete u.senhaTemporaria
        return u
      })
      armazem.substituirLocal(USERS_KEY, lista)
    })
    return newUser
  },
  deleteUser(userId) {
    const users = this.getAllUsers().filter((u) => u.id !== userId)
    armazem.salvarColecao(USERS_KEY, users)
  },
  toggleUserSuspension(userId, suspenso, reason) {
    const users = this.getAllUsers()
    const idx = users.findIndex((u) => u.id === userId)
    if (idx === -1) throw new Error('Usu\xE1rio n\xE3o encontrado.')
    users[idx].suspenso = suspenso
    users[idx].motivoDesvinculo = suspenso
      ? reason || 'Suspenso pela administra\xE7\xE3o Master por irregularidades.'
      : void 0
    armazem.salvarColecao(USERS_KEY, users)
    return users[idx]
  },
  toggleUserVerification(userId, verificado) {
    const users = this.getAllUsers()
    const idx = users.findIndex((u) => u.id === userId)
    if (idx === -1) throw new Error('Usu\xE1rio n\xE3o encontrado.')
    users[idx].verificado = verificado
    armazem.salvarColecao(USERS_KEY, users)
    return users[idx]
  },
  // === 3. GESTÃO E MODERAÇÃO DE ESTABELECIMENTOS / LOJAS ===
  getAllStores() {
    return armazem.colecao(STORES_KEY)
  },
  saveStore(storeData) {
    const stores = this.getAllStores()
    if (storeData.id) {
      const idx = stores.findIndex((s) => s.id === storeData.id)
      if (idx !== -1) {
        stores[idx] = { ...stores[idx], ...storeData }
        armazem.salvarColecao(STORES_KEY, stores)
        return stores[idx]
      }
    }
    const newStore = {
      id: `store-${Date.now()}`,
      name: storeData.name || 'Nova Panificadora',
      logo: storeData.logo || IMAGES.lojaItaipu,
      category: storeData.category || 'Padaria',
      rating: storeData.rating || 5,
      address: storeData.address || 'Pinhalzinho, SC',
    }
    stores.push(newStore)
    armazem.salvarColecao(STORES_KEY, stores)
    return newStore
  },
  // O servidor remove a loja, os alimentos dela e o usuário dono.
  deleteStore(lojaId) {
    const loja = this.getAllStores().find((s) => s.id === lojaId)
    const stores = this.getAllStores().filter((s) => s.id !== lojaId)
    armazem.salvarColecao(STORES_KEY, stores).then(atualizarVitrine)
    const users = this.getAllUsers().filter(
      (u) =>
        !(
          u.role === 'store' &&
          (u.id === loja?.usuarioId || u.id === `user-${lojaId}` || u.id === lojaId)
        ),
    )
    armazem.salvarColecao(USERS_KEY, users)
  },
  moderateStore(lojaId, action, reason) {
    if (action === 'delete') {
      this.deleteStore(lojaId)
      return
    }
    const stores = this.getAllStores()
    const storeIdx = stores.findIndex((s) => s.id === lojaId)
    if (storeIdx !== -1) {
      stores[storeIdx].suspenso = action === 'suspend'
      stores[storeIdx].motivoDesvinculo =
        action === 'suspend'
          ? reason ||
            'Desvinculado / Suspenso por avalia\xE7\xE3o insatisfat\xF3ria ou descumprimento de normas.'
          : void 0
      // O servidor também inativa/reativa os alimentos da loja e o acesso do dono.
      armazem.salvarColecao(STORES_KEY, stores).then(atualizarVitrine)
    }
    const users = this.getAllUsers()
    const storeUserIdx = users.findIndex(
      (u) =>
        u.role === 'store' &&
        (u.id === stores[storeIdx]?.usuarioId || u.id === `user-${lojaId}` || u.id === lojaId),
    )
    if (storeUserIdx !== -1) {
      users[storeUserIdx].suspenso = action === 'suspend'
      users[storeUserIdx].motivoDesvinculo =
        action === 'suspend'
          ? reason ||
            'Desvinculado / Suspenso por avalia\xE7\xE3o insatisfat\xF3ria ou descumprimento de normas.'
          : void 0
      armazem.salvarColecao(USERS_KEY, users)
    }
  },
  // === 4. CENTRAL DE TERMOS DE ADESÃO POR TIPO DE USUÁRIO ===
  getTermsAudits(roleFilter) {
    const users = this.getAllUsers()
    const socialPartners = servicoDoacoes.getSocialPartners()
    const disposalPartners = servicoDoacoes.getDisposalPartners()
    const terms = []
    users
      .filter((u) => u.role === 'client')
      .forEach((u) => {
        terms.push({
          id: `term-client-${u.id}`,
          userId: u.id,
          userName: u.name,
          userEmail: u.email,
          userRole: 'client',
          cpfCnpj: u.cpfCnpj || '000.000.000-00',
          termType: 'CONSUMIDOR_TERMOS_LGPD',
          termTitle: 'Termo de Uso, Prote\xE7\xE3o de Dados (LGPD) e Fidelidade Sustent\xE1vel',
          accepted: true,
          acceptedAt: '2026-01-15T10:00:00.000Z',
          ipAddress: '189.32.110.45 (Pinhalzinho/SC)',
          signatureType: 'checkbox_click',
          signatureHash: `sha256-lgpd-${u.id.substring(0, 8)}`,
          verifiedByMaster: true,
          notes: 'Aceite digital efetuado no primeiro acesso com valida\xE7\xE3o de CPF.',
        })
      })
    users
      .filter((u) => u.role === 'store')
      .forEach((u) => {
        terms.push({
          id: `term-store-${u.id}`,
          userId: u.id,
          userName: u.name,
          userEmail: u.email,
          userRole: 'store',
          cpfCnpj: u.cpfCnpj || '01.234.567/0001-89',
          termType: 'ESTABELECIMENTO_ADESAO_SANITARIO',
          termTitle:
            'Termo de Ades\xE3o Comercial, Responsabilidade Sanit\xE1ria e Doa\xE7\xE3o (Lei 14.016/2020)',
          accepted: true,
          acceptedAt: '2026-01-10T14:30:00.000Z',
          ipAddress: '177.67.201.88 (Chapec\xF3/SC)',
          signatureType: 'digital_hash',
          signatureHash: `sha256-anvisa-lei14016-${u.id}`,
          documentFileName: `termo_adesao_${String(u.name || u.id).toLowerCase().replace(/\s+/g, '_')}_assinado.pdf`,
          verifiedByMaster: u.verificado !== false,
          notes: 'Contrato comercial e sanit\xE1rio validado com alvar\xE1 sanit\xE1rio.',
        })
      })
    socialPartners.forEach((p) => {
      terms.push({
        id: `term-entity-${p.id}`,
        userId: p.id,
        userName: p.name,
        userEmail: p.email,
        userRole: 'institution',
        cpfCnpj: p.cnpj,
        termType: 'ENTIDADE_CREDENCIAMENTO_GOVBR',
        termTitle: 'Termo de Credenciamento e Responsabilidade Social com Assinatura Gov.br',
        accepted: p.validationStatus === 'validated',
        acceptedAt: p.validatedAt || p.applicationDate || '2026-02-01T10:00:00.000Z',
        ipAddress: 'Assinador ITI Oficial (assinador.iti.br)',
        signatureType: 'electronic_govbr',
        signatureHash: p.govSignatureHash || `govbr-iti-${p.id}`,
        documentFileName: p.govSignatureFileName || 'termo_credenciamento_govbr_assinado.pdf',
        verifiedByMaster: p.validationStatus === 'validated',
        notes: p.notes || 'Submetido com certificado ICP-Brasil / Gov.br Prata ou Ouro.',
      })
    })
    disposalPartners.forEach((d) => {
      terms.push({
        id: `term-disp-${d.id}`,
        userId: d.id,
        userName: d.name,
        userEmail: d.email,
        userRole: 'disposal',
        cpfCnpj: d.cnpj,
        termType: 'DESCARTE_LICENCA_AMBIENTAL',
        termTitle:
          'Termo de Destina\xE7\xE3o Ambiental e Licen\xE7a Ecol\xF3gica (Lei 12.305/2010)',
        accepted: d.validationStatus === 'validated',
        acceptedAt: d.validatedAt || '2026-01-05T08:00:00.000Z',
        ipAddress: 'Secretaria Municipal de Meio Ambiente',
        signatureType: 'digital_hash',
        // A licença ambiental é opcional no cadastro do destino: sem ela, o código usa o id
        signatureHash: `sha256-ambiental-${String(d.environmentalLicense || d.id).replace(/[^a-zA-Z0-9]/g, '')}`,
        documentFileName: `licenca_ambiental_${d.id}.pdf`,
        verifiedByMaster: true,
        notes: `Licen\xE7a: ${d.environmentalLicense || 'n\xE3o informada'} | Tratamento: ${d.treatmentType}`,
      })
    })
    // Termos de doação assinados pela loja e pela entidade (guardados aqui para auditoria)
    servicoDoacoes.getTermosAssinados().forEach((o) => {
      terms.push({
        id: `term-doacao-${o.id}`,
        offerId: o.id,
        userId: o.lojaId,
        userName: `${o.nomeLoja} → ${o.recipientOrg}`,
        userEmail: o.recipientEmail || '',
        userRole: 'donation',
        cpfCnpj: [o.storeCnpj, o.recipientCnpj].filter(Boolean).join(' / ') || '-',
        termType: 'DOACAO_TERMO_ASSINADO',
        termTitle: `Termo de Doação de Alimentos (Lei 14.016/2020) — ${o.foodName}`,
        accepted: true,
        acceptedAt: o.signatureSignedAt || o.respondedAt || o.criadoEm,
        ipAddress: 'Assinatura digital das duas partes (loja e entidade)',
        signatureType: 'donation_both',
        signatureHash: o.signatureHash || o.donorAuthCode || `doacao-${o.id}`,
        documentFileName: `Termo_Doacao_${o.id}.pdf`,
        verifiedByMaster: true,
        notes: `${o.weightEstimatedKg || 0} kg · situação: ${o.status === 'completed' ? 'entregue/finalizada' : o.status === 'entregue' ? 'entregue' : 'aceita, aguardando entrega'}`,
      })
    })
    if (roleFilter) {
      return terms.filter((t) => t.userRole === roleFilter)
    }
    return terms
  },
  verifyTermAudit(termId, verified, notes) {
    if (termId.startsWith('term-entity-')) {
      const partnerId = termId.replace('term-entity-', '')
      if (verified) {
        servicoDoacoes.approveSocialPartner(partnerId, notes)
      } else {
        servicoDoacoes.rejectSocialPartner(partnerId, notes)
      }
    }
  },
  downloadTermAuditPdf(term) {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    })
    const isGov = term.signatureType === 'electronic_govbr'
    const primaryR = isGov ? 26 : 15
    const primaryG = isGov ? 86 : 118
    const primaryB = isGov ? 160 : 110
    doc.setFillColor(primaryR, primaryG, primaryB)
    doc.rect(0, 0, 210, 24, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(13)
    doc.text('CERTID\xC3O DE RECEBIMENTO E AUDITORIA DE TERMO', 20, 14)
    doc.setFontSize(8)
    doc.setFont('Helvetica', 'normal')
    doc.text('SISTEMA SAVEALL SUSTENT\xC1VEL \u2014 REGISTRO CENTRAL DE CONFORMIDADE', 20, 19)
    let currentY = 32
    doc.setTextColor(71, 85, 105)
    doc.setFontSize(8.5)
    doc.text(`REGISTRO AUDITADO: ${term.id.toUpperCase()}`, 20, currentY)
    doc.text(
      `EMITIDO EM: ${/* @__PURE__ */ new Date().toLocaleDateString('pt-BR')} \xE0s ${/* @__PURE__ */ new Date().toLocaleTimeString('pt-BR')}`,
      120,
      currentY,
    )
    currentY += 6
    doc.setDrawColor(203, 213, 225)
    doc.setLineWidth(0.4)
    doc.line(20, currentY, 190, currentY)
    currentY += 8
    doc.setTextColor(primaryR, primaryG, primaryB)
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('1. DADOS DO TITULAR E CLASSIFICA\xC7\xC3O', 20, currentY)
    currentY += 7
    doc.setTextColor(51, 65, 85)
    doc.setFontSize(9)
    const formatRolePt = (role) => {
      switch (role) {
        case 'client':
          return 'Cliente'
        case 'store':
          return 'Estabelecimento'
        case 'institution':
          return 'Entidade Social'
        case 'disposal':
          return 'Descarte Sustent\xE1vel'
        case 'master':
          return 'Administrador Master'
        default:
          return role
      }
    }
    const rows = [
      { k: 'Nome / Raz\xE3o Social:', v: term.userName },
      { k: 'E-mail de Cadastro:', v: term.userEmail },
      { k: 'Perfil do Usu\xE1rio:', v: formatRolePt(term.userRole).toUpperCase() },
      { k: 'CPF / CNPJ:', v: term.cpfCnpj || 'N\xE3o informado' },
      { k: 'Tipo de Instrumento:', v: term.termTitle },
      { k: 'Data do Aceite Digital:', v: new Date(term.acceptedAt).toLocaleString('pt-BR') },
      { k: 'Origem / IP de Registro:', v: term.ipAddress || 'Servidor Central' },
    ]
    rows.forEach((r) => {
      doc.setFont('Helvetica', 'bold')
      doc.text(r.k, 20, currentY)
      doc.setFont('Helvetica', 'normal')
      doc.text(r.v, 70, currentY)
      currentY += 5.5
    })
    currentY += 4
    doc.line(20, currentY, 190, currentY)
    currentY += 8
    doc.setTextColor(primaryR, primaryG, primaryB)
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('2. CHAVE CRIPTOGR\xC1FICA E INTEGRIDADE', 20, currentY)
    currentY += 6
    doc.setFillColor(248, 250, 252)
    doc.roundedRect(20, currentY, 170, 22, 2, 2, 'F')
    doc.setTextColor(30, 41, 59)
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.text(
      `Modalidade de Assinatura: ${term.signatureType?.toUpperCase() || 'DIGITAL'}`,
      24,
      currentY + 6,
    )
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.text(`Hash SHA-256: ${term.signatureHash || 'sha256-verified-default'}`, 24, currentY + 11)
    doc.text(
      `Status de Valida\xE7\xE3o Master: ${term.verifiedByMaster ? 'HOMOLOGADO E ATIVO' : 'PENDENTE DE AUDITORIA'}`,
      24,
      currentY + 16,
    )
    currentY += 28
    doc.setTextColor(71, 85, 105)
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(8)
    const legalNotice =
      'Certificamos para os devidos fins de conformidade com a LGPD (Lei 13.709/2018), Marco Civil da Internet (Lei 12.965/2014) e Lei de Doa\xE7\xE3o de Alimentos (Lei 14.016/2020) que o usu\xE1rio anuiu expressamente aos termos supramencionados com identifica\xE7\xE3o inequ\xEDvoca.'
    const splitNotice = doc.splitTextToSize(legalNotice, 170)
    doc.text(splitNotice, 20, currentY)
    currentY += 20
    doc.setDrawColor(primaryR, primaryG, primaryB)
    doc.rect(20, currentY, 170, 18)
    doc.setTextColor(primaryR, primaryG, primaryB)
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.text(
      'AUTENTICA\xC7\xC3O ADMINISTRATIVA MASTER \u2014 PLATAFORMA SAVEALL SUSTENT\xC1VEL',
      24,
      currentY + 7,
    )
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.text(
      `Certificado digitalmente por Administrador Master | Protocolo: ${term.id}`,
      24,
      currentY + 12,
    )
    doc.save(
      `Certidao_Termo_${formatRolePt(term.userRole)}_${String(term.userName || 'termo').replace(/\s+/g, '_')}.pdf`,
    )
  },
  // === 5. CENTRAL DE SUPORTE E CHAMADOS ===
  getSupportTickets() {
    return armazem.colecao(TICKETS_KEY)
  },
  replySupportTicket(ticketId, replyText, newStatus = 'resolved') {
    const tickets = this.getSupportTickets()
    const idx = tickets.findIndex((t) => t.id === ticketId)
    if (idx === -1) throw new Error('Chamado n\xE3o encontrado.')
    tickets[idx].response = replyText
    tickets[idx].status = newStatus
    tickets[idx].respondedBy = this.getMasterCredentials().username
    tickets[idx].respondedAt = /* @__PURE__ */ new Date().toISOString()
    tickets[idx].updatedAt = /* @__PURE__ */ new Date().toISOString()
    armazem.salvarColecao(TICKETS_KEY, tickets)
    return tickets[idx]
  },
  createSupportTicket(ticket) {
    const tickets = this.getSupportTickets()
    const newTkt = {
      id: `tkt-${Date.now().toString().slice(-6)}`,
      criadoEm: /* @__PURE__ */ new Date().toISOString(),
      ...ticket,
    }
    tickets.unshift(newTkt)
    armazem.salvarColecao(TICKETS_KEY, tickets)
    return newTkt
  },
  deleteSupportTicket(ticketId) {
    const tickets = this.getSupportTickets().filter((t) => t.id !== ticketId)
    armazem.salvarColecao(TICKETS_KEY, tickets)
  },
  // === 6. TELEMETRIA E ESTATÍSTICAS MASTER ===
  getSystemMetrics() {
    const users = this.getAllUsers()
    const stores = this.getAllStores()
    const app = useAppStore()
    const orders = app.orders || []
    const foods = app.foods || []
    const socialPartners = servicoDoacoes.getSocialPartners()
    const donationOffers = servicoDoacoes.getDonationOffers()
    const tickets = this.getSupportTickets()
    const terms = this.getTermsAudits()
    const badRatedStores = stores.filter((s) => {
      const u = users.find(
        (usr) =>
          usr.role === 'store' &&
          (usr.id === `user-${s.id}` || usr.id === s.id || usr.name === s.name),
      )
      return s.rating < 3.5 || (u && u.qtdReclamacoes && u.qtdReclamacoes > 3) || (u && u.suspenso)
    })
    const totalDonatedKg = donationOffers
      .filter((o) => o.status === 'completed')
      .reduce((acc, o) => acc + (o.weightEstimatedKg || 0), 0)
    const totalOrderVolume = orders.reduce((acc, o) => acc + (o.total || 0), 0)
    return {
      totalUsers: users.length,
      usersByRole: {
        clients: users.filter((u) => u.role === 'client').length,
        stores: users.filter((u) => u.role === 'store').length,
        institutions: socialPartners.length,
        disposal: users.filter((u) => u.role === 'disposal').length,
      },
      totalStores: stores.length,
      badRatedStoresCount: badRatedStores.length,
      badRatedStoresList: badRatedStores,
      totalOrders: orders.length,
      totalOrderVolumeR$: totalOrderVolume,
      totalFoodsActive: foods.filter((f) => f.status === 'active').length,
      totalSocialPartners: socialPartners.length,
      pendingGovPartners: socialPartners.filter((p) => p.validationStatus === 'pending_review')
        .length,
      totalDonationsCount: donationOffers.length,
      totalDonatedKg,
      totalTermsSigned: terms.length,
      openTicketsCount: tickets.filter((t) => t.status === 'open' || t.status === 'in_progress')
        .length,
    }
  },
}
export { servicoMaster }
