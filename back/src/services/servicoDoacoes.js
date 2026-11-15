import { jsPDF } from 'jspdf'
import { armazem } from './armazemServidor'
const STORAGE_KEY = 'saveall_donation_offers'
const SOCIAL_PARTNERS_KEY = 'saveall_social_partners'
const DISPOSAL_PARTNERS_KEY = 'saveall_disposal_partners'
// Os cadastros iniciais (entidades, unidades de descarte e exemplos) agora são inseridos
// pelo script database/migracao_sem_localstorage.sql do back-end.
const servicoDoacoes = {
  // === SOCIAL ENTITY PARTNERS DIRECTORY ===
  // Lista carregada do servidor (tabela parceiros_sociais)
  getSocialPartners() {
    return armazem.colecao(SOCIAL_PARTNERS_KEY)
  },
  getSocialPartnerById(id) {
    const list = this.getSocialPartners()
    return list.find((p) => p.id === id || p.name === id || p.cnpj === id) || null
  },
  saveSocialPartner(partner) {
    const list = this.getSocialPartners()
    if (partner.id) {
      const index = list.findIndex((p) => p.id === partner.id)
      if (index !== -1) {
        list[index] = { ...list[index], ...partner }
        armazem.salvarColecao(SOCIAL_PARTNERS_KEY, list)
        return list[index]
      }
    }
    const newPartner = {
      id: `soc-part-${Date.now().toString().slice(-6)}`,
      name: partner.name || 'Nova Entidade',
      cnpj: partner.cnpj || '',
      email: partner.email || '',
      whatsapp: partner.whatsapp || '',
      phone: partner.phone || '',
      address: partner.address || '',
      neighborhood: partner.neighborhood || '',
      city: partner.city || 'Pinhalzinho',
      state: partner.state || 'SC',
      postalCode: partner.postalCode || '',
      contactPerson: partner.contactPerson || 'Respons\xE1vel',
      contactRole: partner.contactRole || 'Coordenador',
      acceptedCategories: partner.acceptedCategories || ['Padaria', 'Hortifr\xFAti'],
      hasRefrigeratedStorage: partner.hasRefrigeratedStorage || false,
      hasOwnTransport: partner.hasOwnTransport || false,
      operatingHours: partner.operatingHours || '08:00 \xE0s 18:00',
      validationStatus: partner.validationStatus || 'validated',
      validatedAt: /* @__PURE__ */ new Date().toISOString(),
      notes: partner.notes || '',
      active: true,
    }
    list.push(newPartner)
    armazem.salvarColecao(SOCIAL_PARTNERS_KEY, list)
    return newPartner
  },
  deleteSocialPartner(id) {
    const list = this.getSocialPartners().filter((p) => p.id !== id)
    armazem.salvarColecao(SOCIAL_PARTNERS_KEY, list)
  },
  // Approve / select social partner (handpicked selection)
  approveSocialPartner(id, notes) {
    const list = this.getSocialPartners()
    const index = list.findIndex((p) => p.id === id)
    if (index === -1) throw new Error('Entidade n\xE3o encontrada')
    list[index].validationStatus = 'validated'
    list[index].selectionStatus = 'selected'
    list[index].validatedAt = /* @__PURE__ */ new Date().toISOString()
    list[index].validatedBy = 'Administrador Master'
    list[index].rejectionReason = void 0
    if (notes) list[index].notes = notes
    armazem.salvarColecao(SOCIAL_PARTNERS_KEY, list)
    window.dispatchEvent(new CustomEvent('saveall_social_partners_updated'))
    return list[index]
  },
  // Reject social partner
  rejectSocialPartner(id, reason) {
    const list = this.getSocialPartners()
    const index = list.findIndex((p) => p.id === id)
    if (index === -1) throw new Error('Entidade n\xE3o encontrada')
    list[index].validationStatus = 'rejected'
    list[index].selectionStatus = 'rejected'
    list[index].rejectionReason =
      reason || 'Documenta\xE7\xE3o ou assinatura Gov.br pendente de adequa\xE7\xE3o'
    list[index].notes = `Recusado: ${list[index].rejectionReason}`
    armazem.salvarColecao(SOCIAL_PARTNERS_KEY, list)
    window.dispatchEvent(new CustomEvent('saveall_social_partners_updated'))
    return list[index]
  },
  // Unlink / suspend an already homologated social partner
  unlinkSocialPartner(id, reason) {
    const list = this.getSocialPartners()
    const index = list.findIndex((p) => p.id === id)
    if (index === -1) throw new Error('Entidade n\xE3o encontrada')
    list[index].validationStatus = 'inactive'
    list[index].active = false
    list[index].notes = reason
      ? `Desvinculada: ${reason}`
      : 'Desvinculada pela administra\xE7\xE3o Master'
    armazem.salvarColecao(SOCIAL_PARTNERS_KEY, list)
    window.dispatchEvent(new CustomEvent('saveall_social_partners_updated'))
    return list[index]
  },
  // Reinstate unlinked social partner
  reinstateSocialPartner(id) {
    const list = this.getSocialPartners()
    const index = list.findIndex((p) => p.id === id)
    if (index === -1) throw new Error('Entidade n\xE3o encontrada')
    list[index].validationStatus = 'validated'
    list[index].active = true
    list[index].notes = 'Reativada e homologada pela administra\xE7\xE3o Master'
    armazem.salvarColecao(SOCIAL_PARTNERS_KEY, list)
    window.dispatchEvent(new CustomEvent('saveall_social_partners_updated'))
    return list[index]
  },
  // Reopen rejected partner for re-review
  reopenSocialPartnerReview(id) {
    const list = this.getSocialPartners()
    const index = list.findIndex((p) => p.id === id)
    if (index === -1) throw new Error('Entidade n\xE3o encontrada')
    list[index].validationStatus = 'pending_review'
    list[index].selectionStatus = 'standby'
    list[index].rejectionReason = void 0
    list[index].notes = 'Reaberta para nova auditoria da administra\xE7\xE3o Master'
    armazem.salvarColecao(SOCIAL_PARTNERS_KEY, list)
    window.dispatchEvent(new CustomEvent('saveall_social_partners_updated'))
    return list[index]
  },
  recordEntityNotification(id, type) {
    const list = this.getSocialPartners()
    const index = list.findIndex((p) => p.id === id)
    if (index !== -1) {
      list[index].lastNotificationSentAt = /* @__PURE__ */ new Date().toISOString()
      list[index].lastNotificationType = type
      armazem.salvarColecao(SOCIAL_PARTNERS_KEY, list)
    }
    return list[index]
  },
  // Find partner by CNPJ, Protocol ID or Name
  findSocialPartner(query) {
    if (!query || !query.trim()) return void 0
    const cleanQ = query.trim().toLowerCase()
    const digitsQ = cleanQ.replace(/\D/g, '')
    const list = this.getSocialPartners()
    return list.find((p) => {
      const pCnpjDigits = (p.cnpj || '').replace(/\D/g, '')
      const pPhoneDigits = (p.whatsapp || p.phone || '').replace(/\D/g, '')
      const pId = (p.id || '').toLowerCase()
      const pName = (p.name || '').toLowerCase()
      return (
        (digitsQ && pCnpjDigits === digitsQ) ||
        (digitsQ && digitsQ.length >= 8 && pCnpjDigits.includes(digitsQ)) ||
        (digitsQ && digitsQ.length >= 8 && pPhoneDigits === digitsQ) ||
        pId === cleanQ ||
        pId.includes(cleanQ) ||
        pName === cleanQ ||
        pName.includes(cleanQ)
      )
    })
  },
  // Aviso de desvinculação: mensagem pronta (WhatsApp e e-mail) para a entidade, com o motivo informado
  generateUnlinkNotification(partner, reason) {
    const entityName = partner.name || 'Entidade Parceira'
    const contactPerson = partner.contactPerson || partner.responsibleName || 'Respons\xE1vel Legal'
    const protocol = (partner.id || '').toUpperCase()
    const motivo = (reason || '').trim() || 'Desvinculada pela administra\xE7\xE3o Master.'
    const whatsappText = `⚠️ *SAVEALL SUSTENT\xC1VEL — AVISO DE DESVINCULA\xC7\xC3O* ⚠️

Ol\xE1, *${contactPerson}*. Informamos que a entidade *${entityName}* (Protocolo #${protocol}) foi *desvinculada* da plataforma SaveAll pela Administra\xE7\xE3o Master.

\u{1F4CC} *Motivo informado:*
"${motivo}"

A partir de agora, a entidade n\xE3o receber\xE1 novos avisos de doa\xE7\xF5es at\xE9 que seja reativada. Caso queira esclarecer a situa\xE7\xE3o ou solicitar a reativa\xE7\xE3o, basta responder esta mensagem.

_Administra\xE7\xE3o Master — SaveAll Sustent\xE1vel_`
    const emailSubject = `[SaveAll] Aviso de desvincula\xE7\xE3o - ${entityName}`
    const emailBody = `Prezado(a) ${contactPerson},

Comunicamos que a entidade ${entityName} (Protocolo #${protocol}) foi desvinculada da plataforma SaveAll Sustent\xE1vel pela Administra\xE7\xE3o Master.

MOTIVO INFORMADO:
${motivo}

A partir desta data, a entidade n\xE3o receber\xE1 novos avisos de doa\xE7\xF5es at\xE9 que seja reativada. Caso queira esclarecer a situa\xE7\xE3o ou solicitar a reativa\xE7\xE3o, basta responder este e-mail.

Atenciosamente,
Administra\xE7\xE3o Master — SaveAll Sustent\xE1vel`
    return { whatsappText, emailSubject, emailBody }
  },
  // Dynamic Notification Message Generator with all Entity variables
  generateApprovalNotification(partner, isAccepted, customReason) {
    const entityName = partner.name || 'Entidade Parceira'
    const contactPerson = partner.contactPerson || partner.responsibleName || 'Respons\xE1vel Legal'
    const cnpj = partner.cnpj || 'N\xE3o informado'
    const city = partner.city || 'Pinhalzinho'
    const state = partner.state || 'SC'
    const whatsapp = partner.whatsapp || partner.phone || '(49) 99999-9999'
    const email = partner.email || 'contato@entidade.org.br'
    const hours =
      partner.operatingHours ||
      (partner.receivingHoursStart && partner.receivingHoursEnd
        ? `${partner.receivingHoursStart} \xE0s ${partner.receivingHoursEnd} (${partner.receivingDays?.join(', ') || 'Seg a Sex'})`
        : '08:00 \xE0s 18:00 (Seg a Sex)')
    const protocol = partner.id.toUpperCase()
    const reason =
      customReason ||
      partner.rejectionReason ||
      'Diverg\xEAncia de documenta\xE7\xE3o ou assinatura Gov.br pendente de valida\xE7\xE3o.'
    if (isAccepted) {
      const whatsappText = `\u{1F31F} *SAVEALL SUSTENT\xC1VEL \u2014 CREDENCIAMENTO APROVADO!* \u{1F31F}

Ol\xE1, *${contactPerson}*! \xC9 com grande satisfa\xE7\xE3o que informamos que a entidade *${entityName}* (CNPJ: ${cnpj}) foi *HOMOLOGADA E APROVADA* para participar do recebimento de doa\xE7\xF5es de alimentos e excedentes de panifica\xE7\xE3o pelo *SaveAll* em *${city}/${state}*.

\u{1F4CB} *Resumo do Cadastro Homologado:*
\u2022 *Entidade:* ${entityName}
\u2022 *Respons\xE1vel:* ${contactPerson}
\u2022 *Hor\xE1rios Cadastrados:* ${hours}
\u2022 *Protocolo de Homologa\xE7\xE3o:* #${protocol}
\u2022 *Termo Jur\xEDdico:* Assinatura Gov.br verificada com sucesso \u2713 (Lei n\xBA 14.016/2020)

\u{1F35E} *Como funciona a partir de agora:*
Os estabelecimentos e padarias parceiras de ${city} e regi\xE3o j\xE1 t\xEAm acesso ao perfil da sua entidade. Assim que houver lotes de alimentos dispon\xEDveis (p\xE3es, cucas, fatias de bolo, salgados do dia), voc\xEA receber\xE1 um aviso instant\xE2neo aqui no WhatsApp com o link seguro para aceitar o recebimento.

Agradecemos imensamente pela nobre parceria no combate ao desperd\xEDcio e aux\xEDlio \xE0s fam\xEDlias atendidas!

Equipe SaveAll`
      const emailSubject = `[SaveAll] Parab\xE9ns! Credenciamento Homologado para Doa\xE7\xF5es de Alimentos - ${entityName}`
      const emailBody = `Prezado(a) ${contactPerson},

Temos a satisfa\xE7\xE3o de comunicar que o cadastro e o Termo de Credenciamento da entidade ${entityName} (CNPJ: ${cnpj}) foram auditados e APROVADOS pela Administra\xE7\xE3o Master da plataforma SaveAll Sustent\xE1vel.

DADOS DA HOMOLOGA\xC7\xC3O:
\u2022 Entidade Benefici\xE1ria: ${entityName}
\u2022 Respons\xE1vel / Signat\xE1rio: ${contactPerson}
\u2022 Munic\xEDpio / UF: ${city}/${state}
\u2022 Escala de Recebimento: ${hours}
\u2022 Protocolo Master: #${protocol}
\u2022 Termo de Responsabilidade: Assinatura Gov.br Homologada (Lei Federal n\xBA 14.016/2020)

A partir deste momento, sua institui\xE7\xE3o est\xE1 ativa no ecossistema e apta a receber lotes de doa\xE7\xF5es de panifica\xE7\xE3o e produtos artesanais das padarias da regi\xE3o. Os alertas de lotes ser\xE3o enviados em tempo real para o WhatsApp cadastrado (${whatsapp}) e para este e-mail.

Seja muito bem-vindo(a) \xE0 nossa rede de solidariedade e combate ao desperd\xEDcio!

Atenciosamente,
Administra\xE7\xE3o Master \u2014 SaveAll Sustent\xE1vel`
      return {
        isAccepted: true,
        entityName,
        contactPerson,
        cnpj,
        city,
        state,
        whatsapp,
        email,
        hours,
        protocol,
        whatsappText,
        emailSubject,
        emailBody,
      }
    } else {
      const whatsappText = `\u26A0\uFE0F *SAVEALL SUSTENT\xC1VEL \u2014 RETORNO SOBRE O CREDENCIAMENTO* \u26A0\uFE0F

Ol\xE1, *${contactPerson}*. Informamos que a solicita\xE7\xE3o de credenciamento da entidade *${entityName}* (CNPJ: ${cnpj}) passou por auditoria pela nossa Administra\xE7\xE3o Master e *N\xC3O FOI APROVADA* no momento.

\u{1F4CC} *Motivo informado pela Administra\xE7\xE3o:*
"${reason}"

\u{1F4CB} *Dados da Solicita\xE7\xE3o:*
\u2022 *Entidade:* ${entityName}
\u2022 *Respons\xE1vel:* ${contactPerson}
\u2022 *Cidade:* ${city}/${state}
\u2022 *Protocolo:* #${protocol}

\u{1F504} *Como regularizar:*
Voc\xEA pode corrigir as informa\xE7\xF5es ou atualizar o Termo Gov.br assinado digitalmente e reenviar atrav\xE9s do link oficial:
\u{1F449} https://saveall.app/credenciamento-entidade

Ficamos \xE0 disposi\xE7\xE3o para esclarecer d\xFAvidas e auxiliar na regulariza\xE7\xE3o.

_Administra\xE7\xE3o Master \u2014 SaveAll Sustent\xE1vel_`
      const emailSubject = `[SaveAll] Atualiza\xE7\xE3o sobre o Credenciamento Social - ${entityName}`
      const emailBody = `Prezado(a) ${contactPerson},

Agradecemos pelo envio do formul\xE1rio de credenciamento e do Termo de Ades\xE3o da entidade ${entityName} (CNPJ: ${cnpj}).

Ap\xF3s an\xE1lise documental e cadastral pela Administra\xE7\xE3o Master do SaveAll, comunicamos que a solicita\xE7\xE3o foi indeferida pelo seguinte motivo:

MOTIVO DA N\xC3O APROVA\xC7\xC3O:
${reason}

DADOS DA SOLICITA\xC7\xC3O:
\u2022 Entidade: ${entityName}
\u2022 Respons\xE1vel: ${contactPerson}
\u2022 Munic\xEDpio / UF: ${city}/${state}
\u2022 Protocolo: #${protocol}

Para regularizar o cadastro e poder participar dos recebimentos de alimentos excedentes, solicitamos a revis\xE3o dos itens acima e o reenvio pelo portal de credenciamento:
https://saveall.app/credenciamento-entidade

Permanecemos \xE0 disposi\xE7\xE3o para suporte.

Atenciosamente,
Administra\xE7\xE3o Master \u2014 SaveAll Sustent\xE1vel`
      return {
        isAccepted: false,
        entityName,
        contactPerson,
        cnpj,
        city,
        state,
        whatsapp,
        email,
        hours,
        protocol,
        reason,
        whatsappText,
        emailSubject,
        emailBody,
      }
    }
  },
  // Public Form application submission with Gov.br attachment
  // Formulário público (sem login): o servidor gera o protocolo e grava como "aguardando análise".
  async submitPublicEntityApplication(partnerData) {
    const newPartner = await armazem.credenciarEntidade(partnerData)
    window.dispatchEvent(new CustomEvent('saveall_social_partners_updated', { detail: newPartner }))
    return newPartner
  },
  // Distance / Proximity Calculator between Cities
  calculateProximity(storeCity, partnerCity) {
    const sCity = (storeCity || 'Pinhalzinho').trim().toLowerCase()
    const pCity = (partnerCity || '').trim().toLowerCase()
    if (sCity === pCity || pCity.includes(sCity) || sCity.includes(pCity)) {
      return {
        distanceKm: 1.5,
        label: 'Mesma Cidade (Mais Pr\xF3xima)',
        isSameCity: true,
        badgeColor:
          'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
      }
    }
    const distanceMatrix = {
      pinhalzinho: {
        saudades: 12,
        'nova erechim': 11,
        modelo: 14,
        '\xE1guas frias': 18,
        'sul brasil': 16,
        maravilha: 28,
        'coronel freitas': 32,
        'chapec\xF3': 52,
        chapeco: 52,
        xaxim: 58,
        'xanxer\xEA': 85,
        xanxere: 85,
        's\xE3o miguel do oeste': 74,
        'sao miguel do oeste': 74,
        'florian\xF3polis': 580,
        florianopolis: 580,
      },
      'chapec\xF3': {
        pinhalzinho: 52,
        'coronel freitas': 24,
        xaxim: 28,
        'xanxer\xEA': 45,
        xanxere: 45,
        maravilha: 80,
        saudades: 64,
        'florian\xF3polis': 550,
        florianopolis: 550,
      },
    }
    const dist = distanceMatrix[sCity]?.[pCity] || distanceMatrix[pCity]?.[sCity] || 45
    if (dist <= 15) {
      return {
        distanceKm: dist,
        label: `Microrregi\xE3o (~${dist} km)`,
        isSameCity: false,
        badgeColor: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/30',
      }
    } else if (dist <= 60) {
      return {
        distanceKm: dist,
        label: `Regi\xE3o Oeste (~${dist} km)`,
        isSameCity: false,
        badgeColor: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
      }
    } else {
      return {
        distanceKm: dist,
        label: `Regional (${dist} km)`,
        isSameCity: false,
        badgeColor: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30',
      }
    }
  },
  // Get social partners sorted by proximity to store
  getSocialPartnersByProximity(storeCity = 'Pinhalzinho', onlyValidated = true) {
    let list = this.getSocialPartners()
    if (onlyValidated) {
      list = list.filter((p) => p.validationStatus === 'validated' && p.active)
    }
    const enhanced = list.map((p) => {
      const prox = this.calculateProximity(storeCity, p.city)
      return {
        ...p,
        distanceKm: prox.distanceKm,
        proximityLabel: prox.label,
        isSameCity: prox.isSameCity,
        badgeColor: prox.badgeColor,
      }
    })
    return enhanced.sort((a, b) => a.distanceKm - b.distanceKm)
  },
  // Generate blank or prefilled Termo de Credenciamento para Assinatura Gov.br
  downloadCredenciamentoGovPdf(data) {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    })
    const primaryR = 16
    const primaryG = 120
    const primaryB = 80
    doc.setFillColor(primaryR, primaryG, primaryB)
    doc.rect(0, 0, 210, 24, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(13)
    doc.text('TERMO DE CREDENCIAMENTO E ADES\xC3O \u2014 ENTIDADE BENEFICI\xC1RIA', 20, 14)
    doc.setFontSize(8)
    doc.setFont('Helvetica', 'normal')
    doc.text('PROGRAMA DE DOA\xC7\xC3O DE ALIMENTOS \u2014 LEI FEDERAL N\xBA 14.016/2020', 20, 19)
    let currentY = 32
    doc.setTextColor(71, 85, 105)
    doc.setFontSize(8.5)
    doc.text('DOCUMENTO OFICIAL PARA ASSINATURA ELETR\xD4NICA GOV.BR', 20, currentY)
    doc.text(`EMITIDO EM: ${/* @__PURE__ */ new Date().toLocaleDateString('pt-BR')}`, 140, currentY)
    currentY += 6
    doc.setDrawColor(203, 213, 225)
    doc.setLineWidth(0.4)
    doc.line(20, currentY, 190, currentY)
    currentY += 8
    doc.setTextColor(primaryR, primaryG, primaryB)
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('1. DADOS DA INSTITUI\xC7\xC3O CANDIDATA', 20, currentY)
    currentY += 7
    doc.setTextColor(51, 65, 85)
    doc.setFontSize(9)
    const rows = [
      {
        k: 'Raz\xE3o Social / Nome:',
        v: data.name || '____________________________________________________',
      },
      { k: 'CNPJ:', v: data.cnpj || '_____________________________' },
      {
        k: 'Respons\xE1vel Legal:',
        v: `${data.contactPerson || '____________________'} (${data.contactRole || 'Cargo'})`,
      },
      {
        k: 'Endere\xE7o Completo:',
        v: `${data.address || '__________________________________'}, ${data.city || 'Pinhalzinho'} - ${data.state || 'SC'}`,
      },
      {
        k: 'WhatsApp / Telefone:',
        v: `${data.whatsapp || '_______________'} / ${data.email || '_______________'}`,
      },
      {
        k: 'Dias e Hor\xE1rios de Recebimento:',
        v: data.operatingHours || 'Segunda a Sexta, das 08:00 \xE0s 18:00',
      },
      {
        k: 'Segmento Habilitado:',
        v: 'Padaria & Panifica\xE7\xE3o (P\xE3es, Broas, Cucas, Bolos e Salgados)',
      },
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
    doc.text('2. TERMO DE COMPROMISSO E CONFORMIDADE SANIT\xC1RIA (LEI 14.016/2020)', 20, currentY)
    currentY += 6
    doc.setTextColor(71, 85, 105)
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(8)
    const declText =
      'A Entidade Benefici\xE1ria acima qualificada, por meio de seu representante legal, DECLARA para todos os fins de direito que:\n1. Atua sem fins lucrativos na assist\xEAncia social ou distribui\xE7\xE3o gratuita de alimentos a pessoas em situa\xE7\xE3o de vulnerabilidade.\n2. Compromete-se a conferir a integridade sanit\xE1ria dos alimentos no momento da entrega/retirada, mantendo transporte e armazenamento adequados.\n3. N\xE3o comercializar\xE1 em nenhuma hip\xF3tese os alimentos recebidos em doa\xE7\xE3o.\n4. Est\xE1 ciente de que o estabelecimento doador responde civil e administrativamente exclusivamente na hip\xF3tese de dolo comprovado (art. 3\xBA da Lei 14.016/2020).'
    const splitDecl = doc.splitTextToSize(declText, 170)
    doc.text(splitDecl, 20, currentY)
    currentY += splitDecl.length * 4.2 + 8
    doc.setFillColor(241, 245, 249)
    doc.roundedRect(20, currentY, 170, 22, 2, 2, 'F')
    doc.setTextColor(30, 41, 59)
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.text('PASSO OBRIGAT\xD3RIO: ASSINATURA ELETR\xD4NICA NO GOV.BR', 24, currentY + 6)
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.text(
      '1. Acesse o Assinador Oficial: https://assinador.iti.br (ou app Gov.br).',
      24,
      currentY + 11,
    )
    doc.text(
      '2. Fa\xE7a o upload deste PDF e conclua a assinatura digital com sua conta Gov.br (Prata ou Ouro).',
      24,
      currentY + 15,
    )
    doc.text(
      '3. Fa\xE7a o upload do arquivo assinado de volta no formul\xE1rio de credenciamento.',
      24,
      currentY + 19,
    )
    currentY += 30
    doc.setDrawColor(203, 213, 225)
    doc.rect(20, currentY, 170, 26)
    doc.setTextColor(148, 163, 184)
    doc.setFontSize(8)
    doc.text('ESPA\xC7O RESERVADO PARA O CARIMBO DIGITAL DE ASSINATURA GOV.BR', 35, currentY + 14)
    doc.save(
      `Termo_Credenciamento_${(data.name || 'Entidade').replace(/\s+/g, '_')}_Para_GovBr.pdf`,
    )
  },
  // Download certified signed Termo Gov.br for social partner
  downloadSocialPartnerPdf(entity) {
    if (
      entity.govSignatureFileData &&
      entity.govSignatureFileData.startsWith('data:application/pdf;base64,') &&
      entity.govSignatureFileData.length > 500 &&
      !entity.govSignatureFileData.includes('JVBERi0xLjQKJcTl8uXr...')
    ) {
      const link = document.createElement('a')
      link.href = entity.govSignatureFileData
      link.download =
        entity.govSignatureFileName ||
        `Termo_GovBr_${entity.name.replace(/\s+/g, '_')}_Assinado.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      return
    }
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    })
    const primaryR = 16
    const primaryG = 120
    const primaryB = 80
    doc.setFillColor(primaryR, primaryG, primaryB)
    doc.rect(0, 0, 210, 24, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('TERMO DE CREDENCIAMENTO E ADES\xC3O HOMOLOGADO \u2014 GOV.BR', 15, 13)
    doc.setFontSize(8)
    doc.setFont('Helvetica', 'normal')
    doc.text(
      'PROGRAMA DE DOA\xC7\xC3O DE ALIMENTOS \u2014 LEI FEDERAL N\xBA 14.016/2020 | LEI N\xBA 14.063/2020',
      15,
      18,
    )
    let currentY = 32
    doc.setTextColor(71, 85, 105)
    doc.setFontSize(8)
    doc.text(`REGISTRO AUDITADO: #${entity.id.toUpperCase()}`, 15, currentY)
    doc.text(
      `HOMOLOGA\xC7\xC3O: ${new Date(entity.validatedAt || entity.applicationDate || Date.now()).toLocaleDateString('pt-BR')}`,
      140,
      currentY,
    )
    currentY += 5
    doc.setDrawColor(203, 213, 225)
    doc.setLineWidth(0.4)
    doc.line(15, currentY, 195, currentY)
    currentY += 7
    doc.setTextColor(primaryR, primaryG, primaryB)
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.text('1. DADOS DA ENTIDADE BENEFICI\xC1RIA CREDENCIADA', 15, currentY)
    currentY += 6
    doc.setTextColor(51, 65, 85)
    doc.setFontSize(8.5)
    const rows = [
      { k: 'Raz\xE3o Social / Nome:', v: entity.name },
      { k: 'CNPJ:', v: entity.cnpj },
      {
        k: 'Representante Legal:',
        v: `${entity.contactPerson || entity.responsibleName || 'Respons\xE1vel'} (${entity.contactRole || 'Representante Legal'})`,
      },
      {
        k: 'Endere\xE7o:',
        v: `${entity.address || ''}, ${entity.city || 'Pinhalzinho'} - ${entity.state || 'SC'}`,
      },
      {
        k: 'WhatsApp / Contato:',
        v: `${entity.whatsapp || entity.phone || 'N\xE3o informado'} | ${entity.email || 'N\xE3o informado'}`,
      },
      {
        k: 'Capacidade Atendida:',
        v: `${entity.beneficiariesCount || 50} pessoas/fam\xEDlias em vulnerabilidade`,
      },
      {
        k: 'Hor\xE1rios de Recebimento:',
        v:
          entity.operatingHours ||
          (entity.receivingHoursStart
            ? `${entity.receivingHoursStart} \xE0s ${entity.receivingHoursEnd}`
            : '08:00 \xE0s 18:00'),
      },
      {
        k: 'Segmentos Autorizados:',
        v: entity.acceptedCategories?.length
          ? entity.acceptedCategories.join(', ')
          : 'Padaria, Panifica\xE7\xE3o, Refei\xE7\xF5es, Hortifr\xFAti',
      },
    ]
    rows.forEach((r) => {
      doc.setFont('Helvetica', 'bold')
      doc.text(r.k, 15, currentY)
      doc.setFont('Helvetica', 'normal')
      doc.text(String(r.v), 65, currentY)
      currentY += 5
    })
    currentY += 3
    doc.setDrawColor(203, 213, 225)
    doc.line(15, currentY, 195, currentY)
    currentY += 7
    doc.setTextColor(primaryR, primaryG, primaryB)
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.text('2. TERMO DE COMPROMISSO E CONFORMIDADE SANIT\xC1RIA (LEI 14.016/2020)', 15, currentY)
    currentY += 5.5
    doc.setTextColor(71, 85, 105)
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(7.5)
    const declText =
      'A Entidade Benefici\xE1ria acima qualificada, por meio de seu representante legal identificado abaixo, anui aos seguintes termos:\n1. Declara atuar estritamente sem fins lucrativos na assist\xEAncia social e distribui\xE7\xE3o gratuita de alimentos a indiv\xEDduos ou fam\xEDlias em vulnerabilidade alimentar.\n2. Compromete-se a inspecionar a integridade sensorial e sanit\xE1ria dos alimentos no momento da retirada ou entrega, mantendo condi\xE7\xF5es apropriadas de armazenamento e consumo.\n3. \xC9 expressamente vedada a comercializa\xE7\xE3o, cobran\xE7a ou permuta dos alimentos doados em qualquer circunst\xE2ncia.\n4. Reconhece que os estabelecimentos doadores e a plataforma SaveAll respondem civil e penalmente somente em caso de dolo comprovado (art. 3\xBA da Lei Federal n\xBA 14.016/2020).'
    const splitDecl = doc.splitTextToSize(declText, 180)
    doc.text(splitDecl, 15, currentY)
    currentY += splitDecl.length * 3.8 + 6
    doc.setDrawColor(16, 120, 80)
    doc.setFillColor(240, 253, 244)
    doc.roundedRect(15, currentY, 180, 48, 3, 3, 'FD')
    doc.setTextColor(22, 101, 52)
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(9)
    doc.text(
      'CARIMBO DE ASSINATURA ELETR\xD4NICA QUALIFICADA / AVAN\xC7ADA (ICP-BRASIL / GOV.BR)',
      20,
      currentY + 6.5,
    )
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(30, 41, 59)
    const sigDetails = [
      `Signat\xE1rio: ${entity.contactPerson || entity.responsibleName || 'Representante Legal Cadastrado'}`,
      `Documento/V\xEDnculo: CNPJ ${entity.cnpj} (Entidade Social Credenciada)`,
      `Data e Hora do Carimbo: ${new Date(entity.validatedAt || entity.applicationDate || '2026-02-01T10:00:00Z').toLocaleString('pt-BR')}`,
      `Hash SHA-256 da Assinatura: ${entity.govSignatureHash || 'a7b8c9d0e1f234567890abcdef1234567890abcdef1234567890abcdef123456'}`,
      `Arquivo do Termo: ${entity.govSignatureFileName || 'termo_credenciamento_govbr_assinado.pdf'}`,
      `Padr\xE3o Criptogr\xE1fico: Assinatura Eletr\xF4nica ICP-Brasil / Gov.br (Lei Federal n\xBA 14.063/2020)`,
    ]
    let sigY = currentY + 12
    sigDetails.forEach((s) => {
      doc.text(`\u2022 ${s}`, 20, sigY)
      sigY += 4.2
    })
    doc.save(`Termo_GovBr_${entity.name.replace(/\s+/g, '_')}_Assinado.pdf`)
  },
  // === DISPOSAL PARTNERS DIRECTORY ===
  // Lista carregada do servidor (tabela parceiros_descarte)
  getDisposalPartners() {
    return armazem.colecao(DISPOSAL_PARTNERS_KEY)
  },
  getDisposalPartnerById(id) {
    const list = this.getDisposalPartners()
    return list.find((p) => p.id === id || p.name === id || p.cnpj === id) || null
  },
  saveDisposalPartner(partner) {
    const list = this.getDisposalPartners()
    if (partner.id) {
      const index = list.findIndex((p) => p.id === partner.id)
      if (index !== -1) {
        list[index] = { ...list[index], ...partner }
        armazem.salvarColecao(DISPOSAL_PARTNERS_KEY, list)
        return list[index]
      }
    }
    const newPartner = {
      id: `disp-part-${Date.now().toString().slice(-6)}`,
      name: partner.name || 'Nova Unidade de Descarte',
      cnpj: partner.cnpj || '',
      environmentalLicense: partner.environmentalLicense || 'IMA/SC-PENDENTE',
      treatmentType: partner.treatmentType || 'COMPOSTAGEM',
      address: partner.address || '',
      neighborhood: partner.neighborhood || '',
      city: partner.city || 'Pinhalzinho',
      state: partner.state || 'SC',
      postalCode: partner.postalCode || '',
      whatsapp: partner.whatsapp || '',
      email: partner.email || '',
      contactPerson: partner.contactPerson || 'Respons\xE1vel T\xE9cnico',
      dailyCapacityKg: partner.dailyCapacityKg || 2e3,
      operatingHours: partner.operatingHours || '08:00 \xE0s 17:00',
      validationStatus: partner.validationStatus || 'validated',
      validatedAt: /* @__PURE__ */ new Date().toISOString(),
      notes: partner.notes || '',
      active: true,
    }
    list.push(newPartner)
    armazem.salvarColecao(DISPOSAL_PARTNERS_KEY, list)
    return newPartner
  },
  deleteDisposalPartner(id) {
    const list = this.getDisposalPartners().filter((p) => p.id !== id)
    armazem.salvarColecao(DISPOSAL_PARTNERS_KEY, list)
  },
  // === DONATION OFFERS & INQUIRIES ===
  // Lista carregada do servidor (tabela ofertas_doacao)
  getDonationOffers() {
    return armazem.colecao(STORAGE_KEY)
  },
  getDonationOfferById(id) {
    const offers = this.getDonationOffers()
    return offers.find((o) => o.id === id || o.token === id) || null
  },
  createDonationOffer(data) {
    const offers = this.getDonationOffers()
    const id = `don-off-${Date.now().toString().slice(-6)}`
    const token = `tok-${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 6)}`
    const matchedPartner = this.getSocialPartners().find(
      (p) => p.name === data.recipientOrg || p.id === data.recipientOrg,
    )
    const newOffer = {
      id,
      token,
      lojaId: data.lojaId || 'store-1',
      nomeLoja: data.nomeLoja || 'Dona Kiuda Caf\xE9',
      storeCnpj: data.storeCnpj || '01.234.567/0001-89',
      storeAddress: data.storeAddress || 'Av. Brasil, 450 - Centro, Pinhalzinho/SC',
      storePhone: data.storePhone || '(49) 98877-6655',
      recipientOrg: matchedPartner?.name || data.recipientOrg || 'Mesa Brasil Sesc',
      recipientEmail: matchedPartner?.email || data.recipientEmail || 'mesabrasil@sesc-sc.com.br',
      recipientWhatsapp: matchedPartner?.whatsapp || data.recipientWhatsapp || '(49) 99122-3344',
      recipientCnpj: matchedPartner?.cnpj || data.recipientCnpj || '12.345.678/0001-90',
      recipientAddress: matchedPartner?.address
        ? `${matchedPartner.address}, ${matchedPartner.city}/${matchedPartner.state}`
        : data.recipientAddress,
      foodId: data.foodId,
      foodName: data.foodName || 'Alimento Excedente',
      category: data.category || 'Padaria',
      quantity: data.quantity || 1,
      weightEstimatedKg: data.weightEstimatedKg || 1,
      dataValidade: data.dataValidade,
      description: data.description || '',
      deliveryMethod:
        data.deliveryMethod ||
        (matchedPartner?.hasOwnTransport ? 'pickup_by_entity' : 'store_delivery'),
      status: 'pending_inquiry',
      criadoEm: /* @__PURE__ */ new Date().toISOString(),
      inAppNotifiedAt: /* @__PURE__ */ new Date().toISOString(),
    }
    offers.unshift(newOffer)
    armazem.salvarColecao(STORAGE_KEY, offers)
    window.dispatchEvent(new CustomEvent('saveall_donation_offer_created', { detail: newOffer }))
    return newOffer
  },
  // Resposta da entidade (link público): o servidor valida a situação e calcula o hash da assinatura.
  async updateDonationResponse(id, response) {
    const oferta = this.getDonationOfferById(id)
    const chave = oferta?.token || oferta?.id || id
    const updated = await armazem.responderOfertaPublica(chave, response)
    window.dispatchEvent(new CustomEvent('saveall_donation_offer_updated', { detail: updated }))
    return updated
  },
  downloadDonationPdf(offer) {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    })
    const themeR = 5
    const themeG = 150
    const themeB = 105
    doc.setFillColor(themeR, themeG, themeB)
    doc.rect(0, 0, 210, 24, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(14)
    doc.text('TERMO DE DOA\xC7\xC3O DE ALIMENTOS', 20, 15)
    doc.setFontSize(8.5)
    doc.setFont('Helvetica', 'normal')
    doc.text('LEI FEDERAL N\xBA 14.016/2020 \u2014 COMBATE AO DESPERD\xCDCIO DE ALIMENTOS', 20, 20)
    let currentY = 32
    doc.setTextColor(100, 116, 139)
    doc.setFontSize(8)
    doc.text(`REGISTRO DIGITAL N\xBA: ${offer.id.toUpperCase()}`, 20, currentY)
    const dateFormatted = offer.respondedAt
      ? new Date(offer.respondedAt).toLocaleString('pt-BR')
      : new Date(offer.criadoEm).toLocaleString('pt-BR')
    doc.text(`DATA/HORA: ${dateFormatted}`, 130, currentY)
    currentY += 8
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.4)
    doc.line(20, currentY, 190, currentY)
    currentY += 8
    doc.setTextColor(themeR, themeG, themeB)
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('1. IDENTIFICA\xC7\xC3O DAS PARTES & CADASTRO VALIDADO', 20, currentY)
    currentY += 7
    doc.setTextColor(51, 65, 85)
    doc.setFontSize(9)
    doc.setFont('Helvetica', 'bold')
    doc.text('Estabelecimento Doador:', 20, currentY)
    doc.setFont('Helvetica', 'normal')
    doc.text(
      `${offer.nomeLoja} ${offer.storeCnpj ? `(CNPJ: ${offer.storeCnpj})` : ''}`,
      68,
      currentY,
    )
    currentY += 5.5
    if (offer.storeAddress) {
      doc.setFont('Helvetica', 'bold')
      doc.text('Endere\xE7o Origem:', 20, currentY)
      doc.setFont('Helvetica', 'normal')
      doc.text(offer.storeAddress, 68, currentY)
      currentY += 5.5
    }
    doc.setFont('Helvetica', 'bold')
    doc.text('Entidade Benefici\xE1ria:', 20, currentY)
    doc.setFont('Helvetica', 'normal')
    doc.text(
      `${offer.recipientOrg} ${offer.recipientCnpj ? `(CNPJ: ${offer.recipientCnpj})` : ''}`,
      68,
      currentY,
    )
    currentY += 5.5
    if (offer.recipientAddress) {
      doc.setFont('Helvetica', 'bold')
      doc.text('Endere\xE7o Destino:', 20, currentY)
      doc.setFont('Helvetica', 'normal')
      doc.text(offer.recipientAddress, 68, currentY)
      currentY += 5.5
    }
    if (offer.confirmedBy) {
      doc.setFont('Helvetica', 'bold')
      doc.text('Respons\xE1vel Recebedor:', 20, currentY)
      doc.setFont('Helvetica', 'normal')
      doc.text(
        `${offer.confirmedBy} ${offer.signatureCpf ? `(CPF/Doc: ${offer.signatureCpf})` : ''}`,
        68,
        currentY,
      )
      currentY += 5.5
    }
    currentY += 4
    doc.setDrawColor(226, 232, 240)
    doc.line(20, currentY, 190, currentY)
    currentY += 8
    doc.setTextColor(themeR, themeG, themeB)
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('2. ALIMENTOS DOADOS & RASTREABILIDADE', 20, currentY)
    currentY += 7
    doc.setTextColor(51, 65, 85)
    doc.setFontSize(9)
    const items = [
      { k: 'Descri\xE7\xE3o do Alimento:', v: offer.foodName },
      { k: 'Categoria / Tipo:', v: offer.category },
      { k: 'Quantidade:', v: `${offer.quantity} unidade(s)` },
      { k: 'Peso L\xEDquido Estimado:', v: `${offer.weightEstimatedKg} kg` },
      {
        k: 'Validade Indicada:',
        v: offer.dataValidade
          ? new Date(offer.dataValidade).toLocaleDateString('pt-BR')
          : 'Consumo Imediato',
      },
    ]
    items.forEach((it) => {
      doc.setFont('Helvetica', 'bold')
      doc.text(it.k, 20, currentY)
      doc.setFont('Helvetica', 'normal')
      doc.text(it.v, 68, currentY)
      currentY += 5.5
    })
    if (offer.description) {
      doc.setFont('Helvetica', 'bold')
      doc.text('Observa\xE7\xF5es:', 20, currentY)
      doc.setFont('Helvetica', 'normal')
      const descLines = doc.splitTextToSize(offer.description, 120)
      doc.text(descLines, 68, currentY)
      currentY += descLines.length * 5
    }
    currentY += 4
    doc.setDrawColor(226, 232, 240)
    doc.line(20, currentY, 190, currentY)
    currentY += 8
    doc.setTextColor(themeR, themeG, themeB)
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('3. RESPALDO E PROTE\xC7\xC3O JUR\xCDDICA (LEI 14.016/2020)', 20, currentY)
    currentY += 6
    doc.setTextColor(71, 85, 105)
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(8)
    const legalText =
      'O presente termo atesta que a doa\xE7\xE3o foi realizada a t\xEDtulo gratuito de alimentos pr\xF3prios para consumo humano, em conformidade com a Lei Federal n\xBA 14.016/2020. O doador e eventuais intermedi\xE1rios respondem perante a esfera civil e administrativa exclusivamente na hip\xF3tese comprovada de dolo. A entidade benefici\xE1ria declara ter conferido os itens e recebido em perfeito estado para distribui\xE7\xE3o gratuita.'
    const splitLegal = doc.splitTextToSize(legalText, 170)
    doc.text(splitLegal, 20, currentY)
    currentY += splitLegal.length * 4 + 8
    doc.setDrawColor(226, 232, 240)
    doc.line(20, currentY, 190, currentY)
    currentY += 7
    doc.setTextColor(themeR, themeG, themeB)
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('4. ATESTE E ASSINATURA DIGITAL DO DONAT\xC1RIO', 20, currentY)
    currentY += 6
    if (offer.signatureImage) {
      try {
        doc.addImage(offer.signatureImage, 'PNG', 20, currentY, 50, 20)
      } catch (err) {
        console.warn('Erro ao embutir imagem de assinatura no PDF:', err)
      }
      currentY += 22
    }
    doc.setTextColor(51, 65, 85)
    doc.setFontSize(8.5)
    doc.setFont('Helvetica', 'bold')
    doc.text(
      `Assinado por: ${offer.confirmedBy || 'Representante Legal da Entidade'}`,
      20,
      currentY,
    )
    currentY += 4.5
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(100, 116, 139)
    doc.text(`Entidade: ${offer.recipientOrg}`, 20, currentY)
    currentY += 4
    doc.text(
      `Data/Hora da Assinatura: ${offer.signatureSignedAt ? new Date(offer.signatureSignedAt).toLocaleString('pt-BR') : dateFormatted}`,
      20,
      currentY,
    )
    currentY += 4
    if (offer.signatureHash) {
      doc.text(`Chave Criptogr\xE1fica SHA-256: ${offer.signatureHash}`, 20, currentY)
      currentY += 4
    }
    doc.save(`Termo_Doacao_${offer.id}_${offer.recipientOrg.replace(/\s+/g, '_')}.pdf`)
  },
  downloadDisposalCertificatePdf(disposalLog) {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    })
    const themeR = 13
    const themeG = 148
    const themeB = 136
    doc.setFillColor(themeR, themeG, themeB)
    doc.rect(0, 0, 210, 24, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(13)
    doc.text('CERTIFICADO DE DESTINA\xC7\xC3O ECOL\xD3GICA DE RES\xCDDUOS', 20, 15)
    doc.setFontSize(8)
    doc.setFont('Helvetica', 'normal')
    doc.text(
      'POL\xCDTICA NACIONAL DE RES\xCDDUOS S\xD3LIDOS \u2014 LEI FEDERAL N\xBA 12.305/2010',
      20,
      20,
    )
    let currentY = 32
    doc.setTextColor(100, 116, 139)
    doc.setFontSize(8)
    doc.text(`CERTIFICADO N\xBA: ${disposalLog.id.toUpperCase()}`, 20, currentY)
    doc.text(
      `DATA: ${new Date(disposalLog.date || Date.now()).toLocaleString('pt-BR')}`,
      130,
      currentY,
    )
    currentY += 8
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.4)
    doc.line(20, currentY, 190, currentY)
    currentY += 8
    doc.setTextColor(themeR, themeG, themeB)
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('1. GERADOR E DESTINAT\xC1RIO REGULAMENTADO', 20, currentY)
    currentY += 7
    doc.setTextColor(51, 65, 85)
    doc.setFontSize(9)
    doc.text(`Gerador: ${disposalLog.nomeLoja || 'Estabelecimento Parceiro'}`, 20, currentY)
    currentY += 5.5
    doc.text(
      `Destino / Usina: ${disposalLog.discardDestination || 'Unidade de Compostagem'}`,
      20,
      currentY,
    )
    currentY += 5.5
    if (disposalLog.discardDestinationType) {
      doc.text(`Processo de Tratamento: ${disposalLog.discardDestinationType}`, 20, currentY)
      currentY += 5.5
    }
    currentY += 4
    doc.line(20, currentY, 190, currentY)
    currentY += 8
    doc.setTextColor(themeR, themeG, themeB)
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('2. CARACTERIZA\xC7\xC3O DO RES\xCDDUO ORG\xC2NICO', 20, currentY)
    currentY += 7
    doc.setTextColor(51, 65, 85)
    doc.setFontSize(9)
    doc.text(`Item / Mat\xE9ria Org\xE2nica: ${disposalLog.foodName}`, 20, currentY)
    currentY += 5.5
    doc.text(`Categoria: ${disposalLog.category || 'Org\xE2nico'}`, 20, currentY)
    currentY += 5.5
    doc.text(`Peso Total: ${disposalLog.weightEstimatedKg} kg`, 20, currentY)
    currentY += 5.5
    doc.text(
      `CO2 Evitado: ${(disposalLog.weightEstimatedKg * 2.5).toFixed(1)} kg CO2e`,
      20,
      currentY,
    )
    currentY += 5.5
    currentY += 6
    doc.line(20, currentY, 190, currentY)
    currentY += 8
    doc.setTextColor(themeR, themeG, themeB)
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('3. RESPALDO AMBIENTAL & RASTREABILIDADE', 20, currentY)
    currentY += 6
    doc.setTextColor(71, 85, 105)
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(8)
    const textEnv =
      'Este documento certifica a destina\xE7\xE3o ecologicamente adequada de res\xEDduos org\xE2nicos para processamento biol\xF3gico (compostagem, alimenta\xE7\xE3o animal ou biog\xE1s), impedindo seu envio a aterros sanit\xE1rios e promovendo a economia circular.'
    const splitEnv = doc.splitTextToSize(textEnv, 170)
    doc.text(splitEnv, 20, currentY)
    currentY += splitEnv.length * 4 + 8
    doc.save(`Certificado_Descarte_${disposalLog.id}.pdf`)
  },
  // === CICLO DA DOACAO: aguardando -> aceita -> entregue -> finalizada (certificado) | cancelada ===
  // Cancela a consulta (sem resposta, ou aceita e ainda n\xE3o entregue) para o alimento poder ser doado a outra entidade.
  cancelarOferta(id, motivo = '') {
    const ofertas = this.getDonationOffers()
    const indice = ofertas.findIndex((o) => o.id === id || o.token === id)
    if (indice === -1) throw new Error('Oferta n\xE3o encontrada')
    const statusAtual = ofertas[indice].status
    if (statusAtual !== 'pending_inquiry' && statusAtual !== 'accepted') {
      throw new Error(
        'S\xF3 \xE9 poss\xEDvel cancelar consultas aguardando resposta ou aceitas e ainda n\xE3o entregues.',
      )
    }
    ofertas[indice] = {
      ...ofertas[indice],
      status: 'cancelada',
      canceladoEm: /* @__PURE__ */ new Date().toISOString(),
      motivoCancelamento:
        (motivo || '').trim() ||
        (statusAtual === 'pending_inquiry'
          ? 'Sem resposta da entidade'
          : 'Cancelada pela loja antes da entrega'),
    }
    armazem.salvarColecao(STORAGE_KEY, ofertas)
    window.dispatchEvent(
      new CustomEvent('saveall_donation_offer_updated', { detail: ofertas[indice] }),
    )
    return ofertas[indice]
  },
  // O termo de doa\xE7\xE3o (e certificado) precisa ser gerado antes de a doa\xE7\xE3o ser finalizada.
  registrarTermo(id, certificadoId) {
    const ofertas = this.getDonationOffers()
    const indice = ofertas.findIndex((o) => o.id === id || o.token === id)
    if (indice === -1) throw new Error('Oferta n\xE3o encontrada')
    if (ofertas[indice].status !== 'accepted') {
      throw new Error(
        'S\xF3 \xE9 poss\xEDvel gerar o termo de uma doa\xE7\xE3o aceita pela entidade.',
      )
    }
    ofertas[indice] = {
      ...ofertas[indice],
      termoEmitidoEm: /* @__PURE__ */ new Date().toISOString(),
      certificadoId: certificadoId || '',
    }
    armazem.salvarColecao(STORAGE_KEY, ofertas)
    window.dispatchEvent(
      new CustomEvent('saveall_donation_offer_updated', { detail: ofertas[indice] }),
    )
    return ofertas[indice]
  },
  // A loja confirma que os alimentos foram entregues \xE0 entidade. Exige o termo j\xE1 gerado e finaliza a doa\xE7\xE3o.
  marcarEntregue(id) {
    const ofertas = this.getDonationOffers()
    const indice = ofertas.findIndex((o) => o.id === id || o.token === id)
    if (indice === -1) throw new Error('Oferta n\xE3o encontrada')
    if (ofertas[indice].status !== 'accepted') {
      throw new Error(
        'S\xF3 \xE9 poss\xEDvel marcar como entregue uma doa\xE7\xE3o aceita pela entidade.',
      )
    }
    if (!ofertas[indice].termoEmitidoEm) {
      throw new Error('Gere o termo de doa\xE7\xE3o antes de finalizar.')
    }
    const agora = /* @__PURE__ */ new Date().toISOString()
    ofertas[indice] = {
      ...ofertas[indice],
      status: 'completed',
      entregueEm: agora,
      finalizadoEm: agora,
    }
    armazem.salvarColecao(STORAGE_KEY, ofertas)
    window.dispatchEvent(
      new CustomEvent('saveall_donation_offer_updated', { detail: ofertas[indice] }),
    )
    return ofertas[indice]
  },
  // Chamado quando o certificado \xE9 gerado: a doa\xE7\xE3o fica finalizada (e passa a somar nos gr\xE1ficos e relat\xF3rios).
  finalizarOferta(id, certificadoId) {
    const ofertas = this.getDonationOffers()
    const indice = ofertas.findIndex((o) => o.id === id || o.token === id)
    if (indice === -1) throw new Error('Oferta n\xE3o encontrada')
    if (ofertas[indice].status !== 'entregue') {
      throw new Error('Marque a doa\xE7\xE3o como entregue antes de finaliz\xE1-la.')
    }
    ofertas[indice] = {
      ...ofertas[indice],
      status: 'completed',
      finalizadoEm: /* @__PURE__ */ new Date().toISOString(),
      certificadoId: certificadoId || '',
    }
    armazem.salvarColecao(STORAGE_KEY, ofertas)
    window.dispatchEvent(
      new CustomEvent('saveall_donation_offer_updated', { detail: ofertas[indice] }),
    )
    return ofertas[indice]
  },
  markCompleted(id) {
    const offers = this.getDonationOffers()
    const index = offers.findIndex((o) => o.id === id || o.token === id)
    if (index !== -1) {
      offers[index].status = 'completed'
      armazem.salvarColecao(STORAGE_KEY, offers)
      window.dispatchEvent(
        new CustomEvent('saveall_donation_offer_updated', { detail: offers[index] }),
      )
      return offers[index]
    }
    throw new Error('Oferta n\xE3o encontrada')
  },
  getConfirmationUrl(offerId) {
    const origin = window.location.origin
    const pathname = window.location.pathname
    return `${origin}${pathname}#/confirmar-doacao?id=${offerId}`
  },
  buildWhatsAppMessage(offer) {
    // O link leva o token da oferta (não dá para adivinhar como o id sequencial)
    const confirmationLink = this.getConfirmationUrl(offer.token || offer.id)
    const weightStr = offer.weightEstimatedKg.toString().replace('.', ',')
    return (
      `*SAVE ALL \u2014 CONSULTA DE DISPONIBILIDADE PARA DOA\xC7\xC3O*

Ol\xE1, *${offer.recipientOrg}*! \u{1F44B}

O estabelecimento *${offer.nomeLoja}* possui uma doa\xE7\xE3o de alimentos dispon\xEDvel e gostaria de saber se voc\xEAs podem estar recebendo hoje:

\u{1F4E6} *Item Ofertado:* ${offer.foodName}
\u{1F3F7}\uFE0F *Categoria:* ${offer.category}
\u2696\uFE0F *Peso Estimado:* ${weightStr} kg (${offer.quantity} unid)
\u{1F4CD} *Endere\xE7o de Retirada:* ${offer.storeAddress || 'Consulte o estabelecimento'}
` +
      (offer.recipientAddress
        ? `\u{1F3E2} *Destino Cadastrado:* ${offer.recipientAddress}
`
        : '') +
      `\u{1F33F} *Conformidade:* Lei Federal n\xBA 14.016/2020 (Combate ao Desperd\xEDcio)

\u{1F449} *POR FAVOR, CONFIRME SE PODEM RECEBER E ASSINE CLICANDO NO LINK:*
${confirmationLink}

Ao clicar no link, sua resposta e assinatura digital s\xE3o registradas em tempo real. Obrigado!`
    )
  },
  sendWhatsAppInquiry(offer) {
    const textMsg = this.buildWhatsAppMessage(offer)
    const phone = (offer.recipientWhatsapp || '49991223344').replace(/\D/g, '')
    const cleanPhone = phone.startsWith('55') ? phone : `55${phone}`
    const url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(textMsg)}`
    const offers = this.getDonationOffers()
    const idx = offers.findIndex((o) => o.id === offer.id)
    if (idx !== -1) {
      offers[idx].whatsappSentAt = /* @__PURE__ */ new Date().toISOString()
      armazem.salvarColecao(STORAGE_KEY, offers)
    }
    window.open(url, '_blank')
  },
}
export { servicoDoacoes }
