<script setup>
import { rolarPara } from "../utils/rolagem";
import { IMAGES } from 'src/assets/images'
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useAppStore } from "../stores/estadoApp";
import { servicoMaster } from "../services/servicoMaster";
import { servicoDoacoes } from "../services/servicoDoacoes";
import { storeToRefs } from "pinia";
import RelatorioMensalView from "../components/RelatorioMensalView.vue";
import ConfiguracaoWhatsapp from "../components/ConfiguracaoWhatsapp.vue";
import EnviarWhatsappDialog from "../components/EnviarWhatsappDialog.vue";
import { normalizarTelefone } from "../utils/whatsapp";
import { conflitoDeCadastro } from "../utils/duplicidade";
import CaixaInfoMaster from "../components/master/CaixaInfoMaster.vue";
import { roleColor } from "../components/master/utilitariosMaster";
const appStore = useAppStore();
const { triggerNotification } = appStore;
// Botão Início do cabeçalho: volta à primeira aba do painel
watch(() => appStore.inicioSinal, () => {
  activeTab.value = "overview";
});
const { modoEscuro } = storeToRefs(appStore);
const activeTab = ref("overview");
const systemMetrics = ref(null);
const allUsers = ref([]);
const allStores = ref([]);
const allEntities = ref([]);
const allTerms = ref([]);
const loadMasterData = () => {
  systemMetrics.value = servicoMaster.getSystemMetrics();
  allUsers.value = servicoMaster.getAllUsers();
  allStores.value = servicoMaster.getAllStores();
  allEntities.value = servicoDoacoes.getSocialPartners();
  allTerms.value = servicoMaster.getTermsAudits();
};
// Quando o servidor devolve dados novos (ou recusa uma alteração), a tela se atualiza.
onMounted(() => {
  loadMasterData();
  window.addEventListener("saveall_dados_atualizados", loadMasterData);
});
onUnmounted(() => {
  window.removeEventListener("saveall_dados_atualizados", loadMasterData);
});
const userSearch = ref("");
const userRoleFilter = ref("all");
const filteredUsers = computed(() => {
  return allUsers.value.filter((u) => {
    const matchQuery = !userSearch.value || u.name.toLowerCase().includes(userSearch.value.toLowerCase()) || u.email.toLowerCase().includes(userSearch.value.toLowerCase()) || u.cpfCnpj && u.cpfCnpj.includes(userSearch.value);
    const matchRole = userRoleFilter.value === "all" || u.role === userRoleFilter.value;
    return matchQuery && matchRole;
  });
});
const expandedUserIds = ref({});
const toggleUserExpand = (id) => {
  expandedUserIds.value[id] = !expandedUserIds.value[id];
};
const areAllUsersExpanded = computed(() => {
  if (filteredUsers.value.length === 0) return false;
  return filteredUsers.value.every((u) => !!expandedUserIds.value[u.id]);
});
const toggleAllUsers = () => {
  const shouldExpand = !areAllUsersExpanded.value;
  const newMap = {};
  filteredUsers.value.forEach((u) => {
    newMap[u.id] = shouldExpand;
  });
  expandedUserIds.value = newMap;
};
const getRoleLabel = (role) => {
  switch (role) {
    case "client":
      return "Cliente";
    case "store":
      return "Estabelecimento";
    case "institution":
      return "Entidade Social";
    case "disposal":
      return "Descarte Sustent\xE1vel";
    case "master":
      return "Admin Master";
    default:
      return role;
  }
};
const getUserNumericId = (user) => {
  if (user.idNumerico && typeof user.idNumerico === "number" && user.idNumerico > 0) {
    return user.idNumerico;
  }
  const predefined = {
    "user-client-1": 1,
    "user-store-1": 2,
    "user-institution-1": 5,
    "user-disposal-1": 6,
    "user-master": 7
  };
  if (predefined[user.id]) return predefined[user.id];
  const digits = user.id.replace(/\D/g, "");
  if (digits.length > 0) {
    const parsed = parseInt(digits.slice(-4), 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  const idx = allUsers.value.findIndex((u) => u.id === user.id);
  return idx !== -1 ? idx + 1 : 1;
};
const formatUserCreatedAt = (user) => {
  if (user.criadoEm) {
    const d = new Date(user.criadoEm);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("pt-BR");
    }
  }
  const dates = {
    "user-client-1": "15/01/2026",
    "user-store-1": "10/01/2026",
    "user-institution-1": "05/01/2026",
    "user-disposal-1": "20/02/2026",
    "user-master": "01/01/2026"
  };
  return dates[user.id] || "15/01/2026";
};
const showUserModal = ref(false);
const editingUser = ref(null);
const openCreateUserModal = () => {
  editingUser.value = {
    name: "",
    email: "",
    role: "client",
    address: "Pinhalzinho, SC",
    cpfCnpj: "",
    points: 0,
    verificado: true,
    suspenso: false
  };
  showUserModal.value = true;
};
const openEditUserModal = (user) => {
  editingUser.value = { ...user };
  showUserModal.value = true;
};
const saveUserModal = () => {
  if (!editingUser.value || !editingUser.value.name || !editingUser.value.email) {
    triggerNotification("Preencha os campos obrigat\xF3rios do usu\xE1rio.", "warning");
    return;
  }
  // Nome ou CPF/CNPJ igual ao de outra conta: avisa e não salva
  const conflito = conflitoDeCadastro(
    { nome: editingUser.value.name, documento: editingUser.value.cpfCnpj, usuarioId: editingUser.value.id || "__novo__" },
    allUsers.value,
    allStores.value
  );
  if (conflito) {
    triggerNotification(conflito, "error");
    return;
  }
  servicoMaster.saveUser(editingUser.value);
  triggerNotification(`Usu\xE1rio "${editingUser.value.name}" salvo com sucesso!`, "success");
  showUserModal.value = false;
  loadMasterData();
};
const confirmationModal = ref({
  isOpen: false,
  title: "",
  message: "",
  detail: "",
  confirmText: "Confirmar",
  cancelText: "Cancelar",
  type: "warning",
  requireReason: false,
  reasonPlaceholder: "",
  reasonText: "",
  // Aviso opcional para a entidade (ex.: desvinculação)
  notificar: null,
  enviarAviso: false,
  canalAviso: "whatsapp",
  avisoWhatsapp: "",
  avisoAssunto: "",
  avisoCorpo: "",
  avisoEditado: false,
  onConfirm: () => {
  }
});
const openConfirmation = (opts) => {
  confirmationModal.value = {
    isOpen: true,
    title: opts.title,
    message: opts.message,
    detail: opts.detail || "",
    confirmText: opts.confirmText || "Confirmar",
    cancelText: opts.cancelText || "Cancelar",
    type: opts.type || "warning",
    requireReason: opts.requireReason || false,
    reasonPlaceholder: opts.reasonPlaceholder || "Motivo ou observa\xE7\xE3o...",
    reasonText: opts.initialReason || "",
    notificar: opts.notificar || null,
    enviarAviso: false,
    canalAviso: "whatsapp",
    avisoWhatsapp: "",
    avisoAssunto: "",
    avisoCorpo: "",
    avisoEditado: false,
    onConfirm: opts.onConfirm
  };
  if (opts.notificar) gerarAvisoDaConfirmacao();
};
// Monta a mensagem de aviso com o motivo atual (não sobrescreve se a pessoa já editou o texto)
const gerarAvisoDaConfirmacao = () => {
  const m = confirmationModal.value;
  if (!m.notificar || m.avisoEditado) return;
  const msg = servicoDoacoes.generateUnlinkNotification(m.notificar.entidade, m.reasonText);
  m.avisoWhatsapp = msg.whatsappText;
  m.avisoAssunto = msg.emailSubject;
  m.avisoCorpo = msg.emailBody;
};
const telefoneDoAviso = computed(() => {
  const ent = confirmationModal.value.notificar?.entidade;
  return ent ? normalizarTelefone(ent.whatsapp || ent.phone) : "";
});
// Abre o WhatsApp/e-mail com o aviso pronto. Roda direto no clique de confirmação (senão o navegador bloqueia a janela).
const enviarAvisoDaConfirmacao = () => {
  const m = confirmationModal.value;
  const ent = m.notificar?.entidade;
  if (!m.enviarAviso || !ent) return;
  if (m.canalAviso === "whatsapp") {
    const telefone = telefoneDoAviso.value;
    if (!telefone) {
      triggerNotification(`O WhatsApp de "${ent.name}" está vazio ou inválido. A entidade foi desvinculada, mas o aviso não foi aberto.`, "warning");
      return;
    }
    const janela = window.open(`https://api.whatsapp.com/send?phone=${telefone}&text=${encodeURIComponent(m.avisoWhatsapp)}`, "_blank");
    if (!janela) {
      triggerNotification("O navegador bloqueou a janela do WhatsApp. Permita pop-ups e envie o aviso manualmente.", "warning");
      return;
    }
    janela.opener = null;
    servicoDoacoes.recordEntityNotification(ent.id, "whatsapp");
    triggerNotification(`WhatsApp aberto com o aviso de desvinculação para ${ent.name}. É só tocar em enviar!`, "success");
  } else {
    const emailTo = ent.email;
    if (!emailTo) {
      triggerNotification(`A entidade "${ent.name}" não tem e-mail cadastrado. Ela foi desvinculada, mas o aviso não foi aberto.`, "warning");
      return;
    }
    window.location.href = `mailto:${emailTo}?subject=${encodeURIComponent(m.avisoAssunto)}&body=${encodeURIComponent(m.avisoCorpo)}`;
    servicoDoacoes.recordEntityNotification(ent.id, "email");
    triggerNotification(`Cliente de e-mail aberto para ${emailTo}!`, "success");
  }
};
const executeConfirmation = () => {
  enviarAvisoDaConfirmacao();
  if (confirmationModal.value.onConfirm) {
    confirmationModal.value.onConfirm(confirmationModal.value.reasonText);
  }
  confirmationModal.value.isOpen = false;
};
const deleteUserConfirm = (user) => {
  openConfirmation({
    title: `Excluir usu\xE1rio "${user.name}"?`,
    message: `Confirma a remo\xE7\xE3o definitiva do usu\xE1rio (${user.email})? Seus acessos ser\xE3o revogados imediatamente.`,
    confirmText: "Sim, Excluir Usu\xE1rio",
    cancelText: "Cancelar",
    type: "danger",
    onConfirm: () => {
      servicoMaster.deleteUser(user.id);
      triggerNotification(`Usu\xE1rio "${user.name}" removido com sucesso.`, "success");
      loadMasterData();
    }
  });
};
const toggleUserSuspension = (user) => {
  const willSuspend = !user.suspenso;
  if (willSuspend) {
    openConfirmation({
      title: `Suspender acesso de "${user.name}"?`,
      message: "O usu\xE1rio n\xE3o conseguir\xE1 acessar o sistema enquanto estiver suspenso.",
      confirmText: "Suspender Acesso",
      cancelText: "Cancelar",
      type: "warning",
      requireReason: true,
      initialReason: "Suspenso pela administra\xE7\xE3o Master.",
      onConfirm: (reason) => {
        servicoMaster.toggleUserSuspension(user.id, true, reason || "Suspenso pela administra\xE7\xE3o");
        triggerNotification(`Usu\xE1rio ${user.name} suspenso.`, "warning");
        loadMasterData();
      }
    });
  } else {
    servicoMaster.toggleUserSuspension(user.id, false);
    triggerNotification(`Acesso de ${user.name} restabelecido com sucesso!`, "success");
    loadMasterData();
  }
};
const storeSearch = ref("");
const storeFilter = ref("all");
const isStoreSuspended = (store) => {
  const userStore = allUsers.value.find((u) => u.role === "store" && (u.id === `user-${store.id}` || u.id === store.id || u.name === store.name));
  return store.suspenso === true || userStore?.suspenso === true;
};
const countSuspendedStores = computed(() => {
  return allStores.value.filter((s) => isStoreSuspended(s)).length;
});
const filteredStores = computed(() => {
  return allStores.value.filter((s) => {
    const userStore = allUsers.value.find((u) => u.role === "store" && (u.id === `user-${s.id}` || u.id === s.id || u.name === s.name));
    const matchQuery = !storeSearch.value || s.name.toLowerCase().includes(storeSearch.value.toLowerCase()) || s.address.toLowerCase().includes(storeSearch.value.toLowerCase());
    if (!matchQuery) return false;
    if (storeFilter.value === "bad_rating") {
      return s.rating < 3.5 || userStore?.qtdReclamacoes && userStore.qtdReclamacoes > 2;
    }
    if (storeFilter.value === "suspended") {
      return isStoreSuspended(s);
    }
    return true;
  });
});
const showStoreModal = ref(false);
const editingStore = ref(null);
const openCreateStoreModal = () => {
  // Campos vazios: o que não for preenchido recebe um valor padrão ao salvar (servicoMaster.saveStore)
  editingStore.value = {
    name: "",
    category: "",
    rating: "",
    address: "",
    logo: ""
  };
  showStoreModal.value = true;
};
const openEditStoreModal = (store) => {
  editingStore.value = { ...store };
  showStoreModal.value = true;
};
const saveStoreModal = () => {
  if (!editingStore.value || !editingStore.value.name) {
    triggerNotification("Preencha o nome do estabelecimento.", "warning");
    return;
  }
  // Nome ou CNPJ igual ao de outra loja ou conta (o dono da própria loja não conta): avisa e não salva
  const loja = editingStore.value;
  const conflito = conflitoDeCadastro(
    {
      nome: loja.name,
      documento: loja.cnpj,
      lojaId: loja.id || "__nova__",
      usuarioId: loja.usuarioId || (loja.id ? `user-${loja.id}` : null)
    },
    allUsers.value,
    allStores.value
  );
  if (conflito) {
    triggerNotification(conflito, "error");
    return;
  }
  servicoMaster.saveStore(editingStore.value);
  triggerNotification(`Estabelecimento "${editingStore.value.name}" atualizado!`, "success");
  showStoreModal.value = false;
  loadMasterData();
};
const removeStoreModeration = (store) => {
  openConfirmation({
    title: `Desvincular "${store.name}"?`,
    message: "Esta a\xE7\xE3o desvincular\xE1 o estabelecimento e suspender\xE1 seus produtos do cat\xE1logo p\xFAblico de ofertas da SaveAll.",
    detail: "O estabelecimento poder\xE1 ser reativado a qualquer momento pela modera\xE7\xE3o Master.",
    confirmText: "Sim, Desvincular Loja",
    cancelText: "Cancelar",
    type: "warning",
    requireReason: true,
    reasonPlaceholder: "Motivo da suspens\xE3o/desvincula\xE7\xE3o...",
    initialReason: "Desvinculada por baixa avalia\xE7\xE3o e \xEDndice elevado de reclama\xE7\xF5es sanit\xE1rias/qualidade.",
    onConfirm: (reason) => {
      servicoMaster.moderateStore(store.id, "suspend", reason || "Desvinculada pela modera\xE7\xE3o Master.");
      triggerNotification(`Loja "${store.name}" desvinculada e suspensa com sucesso.`, "warning");
      loadMasterData();
    }
  });
};
const reinstateStoreModeration = (store) => {
  openConfirmation({
    title: `Reativar "${store.name}"?`,
    message: "Deseja restabelecer o v\xEDnculo deste estabelecimento e reativar suas ofertas na plataforma?",
    confirmText: "Reativar Estabelecimento",
    cancelText: "Voltar",
    type: "info",
    onConfirm: () => {
      servicoMaster.moderateStore(store.id, "restore");
      triggerNotification(`Loja "${store.name}" reativada com sucesso!`, "success");
      loadMasterData();
    }
  });
};
const deleteStorePermanent = (store) => {
  openConfirmation({
    title: `Excluir permanentemente "${store.name}"?`,
    message: `ATEN\xC7\xC3O: Deseja excluir em definitivo o estabelecimento "${store.name}", removendo seus produtos e registros do sistema?`,
    detail: "Esta opera\xE7\xE3o \xE9 definitiva e irrevers\xEDvel.",
    confirmText: "Sim, Remover Definitivamente",
    cancelText: "Cancelar",
    type: "danger",
    onConfirm: () => {
      servicoMaster.deleteStore(store.id);
      triggerNotification(`Loja "${store.name}" removida definitivamente do sistema.`, "success");
      loadMasterData();
    }
  });
};
const entitySearch = ref("");
const entityStatusFilter = ref("all");
const showEntityModal = ref(false);
const editingEntity = ref(null);
const showDecisionModal = ref(false);
const whatsappAbertoNaDecisao = ref(false);
const decisionEntity = ref(null);
const decisionMode = ref("accept");
const decisionReason = ref("Documenta\xE7\xE3o ou assinatura digital Gov.br pendente de adequa\xE7\xE3o ou termo ileg\xEDvel.");
const customWhatsAppText = ref("");
const customEmailSubject = ref("");
const customEmailBody = ref("");
const copiedMsgType = ref(null);
const activeMessageTab = ref("whatsapp");
const pendingEntities = computed(() => {
  return allEntities.value.filter((e) => e.validationStatus === "pending_review");
});
const pendingEntitiesCount = computed(() => {
  return pendingEntities.value.length;
});
const countPendingEntities = computed(() => allEntities.value.filter((e) => e.validationStatus === "pending_review").length);
const countValidatedEntities = computed(() => allEntities.value.filter((e) => e.validationStatus === "validated").length);
const countRejectedEntities = computed(() => allEntities.value.filter((e) => e.validationStatus === "rejected").length);
const countInactiveEntities = computed(() => allEntities.value.filter((e) => e.validationStatus === "inactive" || !e.active && e.validationStatus !== "rejected").length);
const goToPendingEntities = () => {
  activeTab.value = "entities";
  entityStatusFilter.value = "pending";
  rolarPara(0);
};
const filteredEntities = computed(() => {
  return allEntities.value.filter((e) => {
    const matchSearch = !entitySearch.value || e.name.toLowerCase().includes(entitySearch.value.toLowerCase()) || e.cnpj.includes(entitySearch.value) || e.city.toLowerCase().includes(entitySearch.value.toLowerCase()) || e.contactPerson && e.contactPerson.toLowerCase().includes(entitySearch.value.toLowerCase());
    const matchStatus = entityStatusFilter.value === "all" || entityStatusFilter.value === "pending" && e.validationStatus === "pending_review" || entityStatusFilter.value === "validated" && e.validationStatus === "validated" || entityStatusFilter.value === "rejected" && e.validationStatus === "rejected" || entityStatusFilter.value === "inactive" && (e.validationStatus === "inactive" || !e.active && e.validationStatus !== "rejected");
    return matchSearch && matchStatus;
  });
});
const expandedEntityIds = ref({});
const toggleEntityExpand = (id) => {
  expandedEntityIds.value[id] = !expandedEntityIds.value[id];
};
const areAllFilteredEntitiesExpanded = computed(() => {
  if (filteredEntities.value.length === 0) return false;
  return filteredEntities.value.every((e) => !!expandedEntityIds.value[e.id]);
});
const toggleAllFilteredEntities = () => {
  const shouldExpand = !areAllFilteredEntitiesExpanded.value;
  filteredEntities.value.forEach((e) => {
    expandedEntityIds.value[e.id] = shouldExpand;
  });
};
const expandedStoreIds = ref({});
const toggleStoreExpand = (id) => {
  expandedStoreIds.value[id] = !expandedStoreIds.value[id];
};
const areAllStoresExpanded = computed(() => {
  if (filteredStores.value.length === 0) return false;
  return filteredStores.value.every((s) => !!expandedStoreIds.value[s.id]);
});
const toggleAllStores = () => {
  const shouldExpand = !areAllStoresExpanded.value;
  filteredStores.value.forEach((s) => {
    expandedStoreIds.value[s.id] = shouldExpand;
  });
};
const openCreateEntityModal = () => {
  editingEntity.value = {
    name: "",
    cnpj: "",
    contactPerson: "",
    email: "",
    whatsapp: "",
    phone: "",
    address: "Pinhalzinho, SC",
    city: "Pinhalzinho",
    state: "SC",
    beneficiariesCount: 50,
    receivingHoursStart: "08:00",
    receivingHoursEnd: "17:00",
    receivingDays: ["Segunda", "Ter\xE7a", "Quarta", "Quinta", "Sexta"],
    validationStatus: "validated",
    govSignatureHash: `govbr-iti-${Date.now().toString().slice(-6)}`,
    govSignatureFileName: "termo_credenciamento_govbr.pdf"
  };
  showEntityModal.value = true;
};
const openEditEntityModal = (entity) => {
  editingEntity.value = { ...entity };
  showEntityModal.value = true;
};
const saveEntityModal = () => {
  if (!editingEntity.value || !editingEntity.value.name || !editingEntity.value.cnpj) {
    triggerNotification("Preencha os dados obrigat\xF3rios da entidade.", "warning");
    return;
  }
  servicoDoacoes.saveSocialPartner(editingEntity.value);
  triggerNotification(`Entidade "${editingEntity.value.name}" salva com sucesso!`, "success");
  showEntityModal.value = false;
  loadMasterData();
};
const openDecisionModal = (entity, mode) => {
  decisionEntity.value = entity;
  decisionMode.value = mode;
  decisionReason.value = mode === "reject" ? entity.rejectionReason || "Documenta\xE7\xE3o ou assinatura digital Gov.br com diverg\xEAncia cadastral ou arquivo ileg\xEDvel." : "";
  const generated = servicoDoacoes.generateApprovalNotification(entity, mode === "accept", decisionReason.value);
  customWhatsAppText.value = generated.whatsappText;
  customEmailSubject.value = generated.emailSubject;
  customEmailBody.value = generated.emailBody;
  activeMessageTab.value = "whatsapp";
  whatsappAbertoNaDecisao.value = false;
  showDecisionModal.value = true;
};
const updateDecisionReason = () => {
  if (!decisionEntity.value) return;
  const generated = servicoDoacoes.generateApprovalNotification(
    decisionEntity.value,
    decisionMode.value === "accept",
    decisionReason.value
  );
  customWhatsAppText.value = generated.whatsappText;
  customEmailSubject.value = generated.emailSubject;
  customEmailBody.value = generated.emailBody;
};
// Abre o WhatsApp com a mensagem pronta para a entidade. Precisa rodar direto no clique,
// senão o navegador bloqueia a nova aba. Devolve true se abriu.
const abrirWhatsappDaDecisao = () => {
  const entidade = decisionEntity.value;
  if (!entidade) return false;
  const telefone = normalizarTelefone(entidade.whatsapp || entidade.phone);
  if (!telefone) {
    triggerNotification(`O WhatsApp de "${entidade.name}" está vazio ou inválido. Corrija o cadastro e envie a mensagem manualmente.`, "warning");
    return false;
  }
  const waUrl = `https://api.whatsapp.com/send?phone=${telefone}&text=${encodeURIComponent(customWhatsAppText.value)}`;
  const janela = window.open(waUrl, "_blank");
  if (!janela) {
    triggerNotification("O navegador bloqueou a janela do WhatsApp. Permita pop-ups ou use \"Copiar Texto WhatsApp\".", "warning");
    return false;
  }
  janela.opener = null;
  whatsappAbertoNaDecisao.value = true;
  servicoDoacoes.recordEntityNotification(entidade.id, "whatsapp");
  triggerNotification(`WhatsApp aberto com a mensagem para ${entidade.name}. É só tocar em enviar!`, "success");
  return true;
};
const sendWhatsAppMessage = () => {
  abrirWhatsappDaDecisao();
};
const copyWhatsAppMessage = () => {
  navigator.clipboard.writeText(customWhatsAppText.value);
  copiedMsgType.value = "whatsapp";
  triggerNotification("Mensagem personalizada de WhatsApp copiada!", "success");
  setTimeout(() => copiedMsgType.value = null, 2500);
};
const sendEmailMessage = () => {
  if (!decisionEntity.value) return;
  const emailTo = decisionEntity.value.email || "contato@entidade.org.br";
  const mailtoUrl = `mailto:${emailTo}?subject=${encodeURIComponent(customEmailSubject.value)}&body=${encodeURIComponent(customEmailBody.value)}`;
  window.location.href = mailtoUrl;
  servicoDoacoes.recordEntityNotification(decisionEntity.value.id, "email");
  triggerNotification(`Cliente de e-mail aberto para ${emailTo}!`, "success");
};
const copyEmailMessage = () => {
  const fullMail = `Assunto: ${customEmailSubject.value}

${customEmailBody.value}`;
  navigator.clipboard.writeText(fullMail);
  copiedMsgType.value = "email";
  triggerNotification("Assunto e corpo do e-mail copiados!", "success");
  setTimeout(() => copiedMsgType.value = null, 2500);
};
const confirmDecisionInSystem = () => {
  if (!decisionEntity.value) return;
  if (decisionMode.value === "accept") {
    // Abre o WhatsApp primeiro (precisa ser direto no clique) se ainda não foi aberto.
    const jaAbriu = whatsappAbertoNaDecisao.value || abrirWhatsappDaDecisao();
    servicoDoacoes.approveSocialPartner(decisionEntity.value.id, "Homologado via auditoria do Administrador Master");
    triggerNotification(
      jaAbriu
        ? `Entidade "${decisionEntity.value.name}" HOMOLOGADA e aviso pelo WhatsApp preparado!`
        : `Entidade "${decisionEntity.value.name}" HOMOLOGADA. O aviso no WhatsApp não foi aberto.`,
      jaAbriu ? "success" : "warning"
    );
  } else {
    servicoDoacoes.rejectSocialPartner(decisionEntity.value.id, decisionReason.value);
    servicoDoacoes.recordEntityNotification(decisionEntity.value.id, "both");
    triggerNotification(`Entidade "${decisionEntity.value.name}" RECUSADA com envio de justificativa.`, "warning");
  }
  showDecisionModal.value = false;
  loadMasterData();
};
const deleteEntity = (entity) => {
  openConfirmation({
    title: `Remover entidade "${entity.name}"?`,
    message: `Confirma a remo\xE7\xE3o definitiva da entidade social ${entity.name} do sistema SaveAll?`,
    detail: "Esta a\xE7\xE3o remover\xE1 o credenciamento e registros associados.",
    confirmText: "Sim, Remover Entidade",
    cancelText: "Cancelar",
    type: "danger",
    onConfirm: () => {
      servicoDoacoes.deleteSocialPartner(entity.id);
      triggerNotification(`Entidade "${entity.name}" exclu\xEDda com sucesso.`, "success");
      loadMasterData();
    }
  });
};
const unlinkEntity = (entity) => {
  openConfirmation({
    title: `Desvincular "${entity.name}"?`,
    message: `Confirma a desvincula\xE7\xE3o da entidade homologada "${entity.name}"? Ela n\xE3o receber\xE1 novas doa\xE7\xF5es at\xE9 que seja reativada.`,
    confirmText: "Sim, Desvincular",
    cancelText: "Cancelar",
    type: "warning",
    requireReason: true,
    reasonPlaceholder: "Motivo da desvincula\xE7\xE3o (ex: descumprimento de prazos, solicita\xE7\xE3o pr\xF3pria)...",
    initialReason: "Desvinculada pela administra\xE7\xE3o Master.",
    notificar: { entidade: entity },
    onConfirm: (reason) => {
      servicoDoacoes.unlinkSocialPartner(entity.id, reason);
      triggerNotification(`Entidade "${entity.name}" desvinculada com sucesso.`, "warning");
      loadMasterData();
    }
  });
};
const reinstateEntity = (entity) => {
  openConfirmation({
    title: `Reativar "${entity.name}"?`,
    message: `Deseja reativar o v\xEDnculo e homologa\xE7\xE3o da entidade "${entity.name}" para recebimento de doa\xE7\xF5es?`,
    confirmText: "Reativar Entidade",
    cancelText: "Voltar",
    type: "info",
    onConfirm: () => {
      servicoDoacoes.reinstateSocialPartner(entity.id);
      triggerNotification(`Entidade "${entity.name}" reativada com sucesso!`, "success");
      loadMasterData();
    }
  });
};
const reopenEntityReview = (entity) => {
  openConfirmation({
    title: `Reabrir an\xE1lise de "${entity.name}"?`,
    message: `Deseja retornar esta entidade recusada para a fila de homologa\xE7\xE3o ("Aguardando An\xE1lise")?`,
    confirmText: "Reabrir An\xE1lise",
    cancelText: "Voltar",
    type: "info",
    onConfirm: () => {
      servicoDoacoes.reopenSocialPartnerReview(entity.id);
      triggerNotification(`Entidade "${entity.name}" enviada para a fila de homologa\xE7\xE3o ("Aguardando An\xE1lise").`, "info");
      loadMasterData();
    }
  });
};
const downloadEntityTerm = (entity) => {
  servicoDoacoes.downloadSocialPartnerPdf(entity);
  triggerNotification(`Termo Gov.br de "${entity.name}" baixado em PDF! Voc\xEA pode valid\xE1-lo no validador oficial ITI.`, "success");
};
const selectedTermRole = ref("all");
const termSearch = ref("");
const filteredTerms = computed(() => {
  return allTerms.value.filter((t) => {
    const matchRole = selectedTermRole.value === "all" || t.userRole === selectedTermRole.value;
    const matchQuery = !termSearch.value || t.userName.toLowerCase().includes(termSearch.value.toLowerCase()) || t.termTitle.toLowerCase().includes(termSearch.value.toLowerCase()) || t.cpfCnpj && t.cpfCnpj.includes(termSearch.value);
    return matchRole && matchQuery;
  });
});
const downloadTermPdf = (term) => {
  servicoMaster.downloadTermAuditPdf(term);
  triggerNotification(`Certid\xE3o de termo de ${term.userName} gerada em PDF!`, "success");
};
const masterCreds = ref(servicoMaster.getMasterCredentials());
const settingsUsername = ref(masterCreds.value.username);
const settingsEmail = ref(masterCreds.value.email || "admin@saveall.com");
const settingsNewPassword = ref("");
const settingsConfirmPassword = ref("");
const settingsSuccess = ref(false);
// WhatsApp: mensagens prontas para estabelecimentos e clientes
const configuracaoWhatsappRef = ref(null);
const salvarWhatsappMaster = async () => {
  const ok = await configuracaoWhatsappRef.value?.salvar();
  if (ok) triggerNotification("Configuração do WhatsApp salva.", "success");
};
const mostrarWhatsapp = ref(false);
const destinatarioWhatsapp = ref(null);
// O WhatsApp da loja é o número cadastrado pelo usuário dono dela
const whatsappDaLoja = (store) => {
  const dono = allUsers.value.find((u) => u.id === store.usuarioId || u.id === `user-${store.id}`);
  return normalizarTelefone(dono?.whatsapp);
};
const abrirWhatsappUsuario = (user) => {
  destinatarioWhatsapp.value = {
    nome: user.name,
    telefone: user.whatsapp,
    motivo: user.suspenso ? user.motivoDesvinculo : "",
    loja: user.role === "store"
  };
  mostrarWhatsapp.value = true;
};
const abrirWhatsappLoja = (store) => {
  destinatarioWhatsapp.value = {
    nome: store.name,
    telefone: whatsappDaLoja(store),
    motivo: store.suspenso ? store.motivoDesvinculo : "",
    loja: true
  };
  mostrarWhatsapp.value = true;
};
const saveMasterSettings = async () => {
  if (!settingsUsername.value.trim()) {
    triggerNotification("O nome de usu\xE1rio do Master \xE9 obrigat\xF3rio.", "warning");
    return;
  }
  if (settingsNewPassword.value) {
    if (settingsNewPassword.value !== settingsConfirmPassword.value) {
      triggerNotification("A confirma\xE7\xE3o de senha n\xE3o confere.", "error");
      return;
    }
    if (settingsNewPassword.value.length < 6) {
      triggerNotification("A nova senha deve ter no m\xEDnimo 6 caracteres.", "warning");
      return;
    }
  }
  try {
    masterCreds.value = await servicoMaster.updateMasterCredentials(settingsUsername.value, settingsNewPassword.value || void 0, settingsEmail.value);
  } catch (err) {
    triggerNotification(err.message, "error");
    return;
  }
  settingsNewPassword.value = "";
  settingsConfirmPassword.value = "";
  settingsSuccess.value = true;
  setTimeout(() => {
    settingsSuccess.value = false;
  }, 4e3);
  triggerNotification("Configura\xE7\xF5es e credenciais do Master salvas com sucesso!", "success");
  loadMasterData();
};
</script>


<template>
  <q-page class="painel-master" :class="modoEscuro ? 'bg-dark text-white' : 'bg-grey-1 text-grey-10'">
    <!-- TOP HEADER -->
    <div class="m-header row items-center justify-between no-wrap q-px-md q-py-sm q-gutter-x-sm" :class="modoEscuro ? 'bg-dark' : 'bg-white'">
      <!-- Title and Master Badge -->
      <div class="row items-center no-wrap q-gutter-x-sm col">
        <div class="m-icon-box m-tone-amber text-amber-8">
          <q-icon name="workspace_premium" size="22px" />
        </div>
        <div class="col ellipsis">
          <div class="row items-center q-gutter-x-sm">
            <div class="text-subtitle1 text-weight-bold ellipsis">Painel de Controle Master</div>
            <q-badge color="amber-2" text-color="amber-10" class="text-weight-bolder text-uppercase">
              Super Admin
            </q-badge>
          </div>
          <div class="text-caption text-grey-7 ellipsis">
            Acesso Irrestrito • Usuário: <span class="text-amber-9 text-weight-bold m-mono">{{ masterCreds.username }}</span>
          </div>
        </div>
      </div>

      <!-- Action buttons -->
      <div class="row items-center no-wrap q-gutter-x-sm">
        <q-btn
          id="btn-refresh-master"
          outline
          dense
          no-caps
          color="grey-7"
          class="q-px-sm text-weight-bold"
          @click="loadMasterData(); triggerNotification('Dados atualizados!', 'success')"
        >
          <q-icon name="refresh" size="18px" />
          <span class="gt-xs q-ml-xs">Atualizar</span>
          <q-tooltip>Atualizar dados</q-tooltip>
        </q-btn>

      </div>
    </div>

    <!-- Configurações: engrenagem na barra verde (igual à loja e ao cliente) -->
    <Teleport to="#header-slot-actions" defer>
      <q-btn
        id="btn-master-settings"
        flat
        round
        dense
        icon="settings"
        :class="{ 'm-gear-ativa': activeTab === 'settings' }"
        @click="activeTab = activeTab === 'settings' ? 'overview' : 'settings'"
      >
        <q-tooltip>{{ activeTab === 'settings' ? 'Fechar configurações' : 'Configurações' }}</q-tooltip>
      </q-btn>
    </Teleport>

    <!-- NAVIGATION TABS -->
    <q-tabs
      v-model="activeTab"
      dense
      no-caps
      inline-label
      outside-arrows
      mobile-arrows
      align="center"
      active-color="amber-9"
      indicator-color="amber-8"
      class="m-tabs text-grey-7"
      :class="modoEscuro ? 'bg-dark' : 'bg-white'"
    >
      <q-tab id="tab-master-overview" name="overview" icon="auto_awesome" label="Visão Geral" />

      <q-tab id="tab-master-users" name="users" icon="group" label="Usuários">
        <q-badge color="grey-3" text-color="grey-9" class="q-ml-xs text-weight-bold">{{ allUsers.length }}</q-badge>
      </q-tab>

      <q-tab id="tab-master-stores" name="stores" icon="storefront" label="Estabelecimentos">
        <q-badge v-if="systemMetrics?.badRatedStoresCount" color="negative" class="q-ml-xs m-pulse">
          {{ systemMetrics.badRatedStoresCount }}
        </q-badge>
      </q-tab>

      <q-tab id="tab-master-entities" name="entities" icon="volunteer_activism">
        <span class="q-ml-xs">Entidades</span>
        <span class="gt-xs q-ml-xs">Sociais</span>
        <q-badge v-if="pendingEntitiesCount > 0" color="negative" class="q-ml-xs text-weight-bolder m-pulse">
          {{ pendingEntitiesCount }}
        </q-badge>
        <q-badge v-else color="grey-3" text-color="grey-9" class="q-ml-xs text-weight-bold">{{ allEntities.length }}</q-badge>
      </q-tab>

      <q-tab id="tab-master-terms" name="terms" icon="fact_check" label="Termos">
        <q-badge color="green-1" text-color="green-9" class="q-ml-xs text-weight-bold">{{ allTerms.length }}</q-badge>
      </q-tab>

      <q-tab id="tab-master-reports" name="reports" icon="description" label="Relatório Mensal" class="text-positive" />
    </q-tabs>
    <q-separator />

    <!-- MAIN BODY CONTENT -->
    <q-tab-panels v-model="activeTab" class="m-panels bg-transparent">

      <!-- ========================================================================= -->
      <!-- TAB 1: VISÃO GERAL / TELEMETRIA (Métricas e Acesso Rápido Principais)    -->
      <!-- ========================================================================= -->
      <q-tab-panel name="overview" class="m-container q-pa-md">
        <div class="column q-gutter-y-md">

          <!-- Metrics Grid (Principal) -->
          <div class="m-secao-titulo row items-center no-wrap">
            <q-icon name="insights" size="18px" class="q-mr-sm text-grey-7" />
            <span class="text-caption text-weight-bold text-uppercase text-grey-7">Indicadores da plataforma</span>
          </div>
          <div class="row q-col-gutter-sm">

            <div class="col-6 col-sm-4 col-lg">
              <q-card flat bordered class="m-clickable full-height" @click="activeTab = 'users'">
                <q-card-section class="q-pa-md q-gutter-y-xs">
                  <div class="row items-center justify-between no-wrap text-grey-7 text-caption text-weight-medium">
                    <span>Usuários Totais</span>
                    <q-icon name="group" size="18px" color="positive" />
                  </div>
                  <div class="text-h5 text-weight-bold text-positive">
                    {{ systemMetrics?.totalUsers || 0 }}
                  </div>
                  <div class="m-tiny text-grey-7">
                    {{ systemMetrics?.usersByRole?.clients || 0 }} clientes • {{ systemMetrics?.usersByRole?.stores || 0 }} lojas
                  </div>
                </q-card-section>
              </q-card>
            </div>

            <div class="col-6 col-sm-4 col-lg">
              <q-card flat bordered class="m-clickable full-height" @click="activeTab = 'stores'">
                <q-card-section class="q-pa-md q-gutter-y-xs">
                  <div class="row items-center justify-between no-wrap text-grey-7 text-caption text-weight-medium">
                    <span>Padarias & Lojas</span>
                    <q-icon name="storefront" size="18px" color="blue-7" />
                  </div>
                  <div class="text-h5 text-weight-bold text-blue-7">
                    {{ systemMetrics?.totalStores || 0 }}
                  </div>
                  <div class="m-tiny text-grey-7">
                    {{ systemMetrics?.badRatedStoresCount || 0 }} em observação
                  </div>
                </q-card-section>
              </q-card>
            </div>

            <div class="col-6 col-sm-4 col-lg">
              <q-card
                flat
                bordered
                class="m-clickable full-height"
                :class="pendingEntitiesCount > 0 ? 'm-tone-amber' : ''"
                @click="goToPendingEntities"
              >
                <q-card-section class="q-pa-md q-gutter-y-xs">
                  <div class="row items-center justify-between no-wrap text-grey-7 text-caption text-weight-medium">
                    <span>Entidades Sociais</span>
                    <q-icon
                      name="volunteer_activism"
                      size="18px"
                      :color="pendingEntitiesCount > 0 ? 'amber-9' : 'pink-5'"
                      :class="pendingEntitiesCount > 0 ? 'm-pulse' : ''"
                    />
                  </div>
                  <div class="text-h5 text-weight-bold" :class="pendingEntitiesCount > 0 ? 'text-amber-10' : 'text-pink-6'">
                    {{ allEntities.length }}
                  </div>
                  <div class="row items-center justify-between m-tiny">
                    <span v-if="pendingEntitiesCount > 0" class="text-amber-10 text-weight-bold row items-center q-gutter-x-xs">
                      <span class="m-dot bg-amber-8 m-pulse"></span>
                      <span>{{ pendingEntitiesCount }} aguardando aceite</span>
                    </span>
                    <span v-else class="text-grey-7">
                      100% analisadas
                    </span>
                    <span class="text-amber-9 text-weight-bold">Ver →</span>
                  </div>
                </q-card-section>
                <q-tooltip>Clique para gerenciar e homologar entidades sociais</q-tooltip>
              </q-card>
            </div>

            <div class="col-6 col-sm-4 col-lg">
              <q-card flat bordered class="m-clickable full-height" @click="activeTab = 'terms'">
                <q-card-section class="q-pa-md q-gutter-y-xs">
                  <div class="row items-center justify-between no-wrap text-grey-7 text-caption text-weight-medium">
                    <span>Termos Assinados</span>
                    <q-icon name="fact_check" size="18px" color="amber-9" />
                  </div>
                  <div class="text-h5 text-weight-bold text-amber-9">
                    {{ systemMetrics?.totalTermsSigned || 0 }}
                  </div>
                  <div class="m-tiny text-grey-7">
                    100% auditáveis com hash
                  </div>
                </q-card-section>
              </q-card>
            </div>

            <div class="col-6 col-sm-4 col-lg">
              <q-card flat bordered class="full-height">
                <q-card-section class="q-pa-md q-gutter-y-xs">
                  <div class="row items-center justify-between no-wrap text-grey-7 text-caption text-weight-medium">
                    <span>Doações Salvas</span>
                    <q-icon name="verified_user" size="18px" color="indigo-6" />
                  </div>
                  <div class="text-h5 text-weight-bold text-indigo-6">
                    {{ systemMetrics?.totalDonatedKg || 0 }} kg
                  </div>
                  <div class="m-tiny text-grey-7">
                    {{ systemMetrics?.totalDonationsCount || 0 }} lotes salvos
                  </div>
                </q-card-section>
              </q-card>
            </div>

          </div>

          <!-- Gestão da plataforma -->
          <div class="m-secao-titulo row items-center no-wrap">
            <q-icon name="dashboard_customize" size="18px" class="q-mr-sm text-grey-7" />
            <span class="text-caption text-weight-bold text-uppercase text-grey-7">Gestão da plataforma</span>
          </div>
          <div class="row q-col-gutter-md">

            <!-- Card 2: Moderação de Lojas -->
            <div class="col-12 col-md-6 col-lg-3">
              <q-card flat bordered class="full-height">
                <q-card-section class="q-gutter-y-sm">
                  <div class="row items-center justify-between">
                    <div class="m-icon-box m-tone-red text-pink-6">
                      <q-icon name="storefront" size="22px" />
                    </div>
                    <span class="text-caption text-weight-bold text-negative">Moderação Crítica</span>
                  </div>
                  <div>
                    <div class="text-subtitle1 text-weight-bold">Controle de Estabelecimentos</div>
                    <div class="text-caption text-grey-7 q-mt-xs">
                      Monitore estabelecimentos com nota inferior a 3.5 ou denúncias de clientes e desvincule com um clique.
                    </div>
                  </div>
                  <q-btn
                    unelevated
                    no-caps
                    color="grey-3"
                    text-color="grey-9"
                    class="full-width text-weight-bold"
                    label="Gerenciar Estabelecimentos →"
                    @click="activeTab = 'stores'"
                  />
                </q-card-section>
              </q-card>
            </div>

            <!-- Card 1: Homologação de Entidades -->
            <div class="col-12 col-md-6 col-lg-3">
              <q-card flat bordered class="full-height" :class="pendingEntitiesCount > 0 ? 'm-tone-amber' : ''">
                <q-card-section class="q-gutter-y-sm">
                  <div class="row items-center justify-between">
                    <div class="m-icon-box m-tone-red text-pink-6">
                      <q-icon name="volunteer_activism" size="22px" />
                    </div>
                    <q-badge v-if="pendingEntitiesCount > 0" color="amber-7" text-color="dark" class="text-weight-bolder text-uppercase m-pulse">
                      {{ pendingEntitiesCount }} Pendente(s)
                    </q-badge>
                    <span v-else class="text-caption text-weight-bold text-positive">Homologações em dia</span>
                  </div>
                  <div>
                    <div class="text-subtitle1 text-weight-bold">Entidades Sociais</div>
                    <div class="text-caption text-grey-7 q-mt-xs">
                      Homologue instituições com termos Gov.br e notifique os responsáveis automaticamente por WhatsApp e E-mail.
                    </div>
                  </div>
                  <q-btn
                    id="btn-overview-goto-entities"
                    unelevated
                    no-caps
                    class="full-width text-weight-bold"
                    :color="pendingEntitiesCount > 0 ? 'amber-8' : 'grey-3'"
                    :text-color="pendingEntitiesCount > 0 ? 'dark' : 'grey-9'"
                    :label="(pendingEntitiesCount > 0 ? `Avaliar ${pendingEntitiesCount} Pendência(s)` : 'Gerenciar Entidades') + ' →'"
                    @click="goToPendingEntities"
                  />
                </q-card-section>
              </q-card>
            </div>

            <!-- Card 0: Relatório Mensal RN06 (Total Geral e Filtro por Estabelecimento) -->
            <div class="col-12 col-md-6 col-lg-3">
              <q-card flat bordered class="m-tone-green full-height">
                <q-card-section class="q-gutter-y-sm">
                  <div class="row items-center justify-between">
                    <div class="m-icon-box m-tone-green text-positive">
                      <q-icon name="description" size="22px" />
                    </div>
                    <q-badge color="positive" class="text-weight-bold text-uppercase m-mono">Mensal</q-badge>
                  </div>
                  <div>
                    <div class="text-subtitle1 text-weight-bold">Relatório Mensal</div>
                    <div class="text-caption text-grey-7 q-mt-xs">
                      Total de todas as lojas consolidado e filtro dinâmico por estabelecimento. Vendas, doações e descartes.
                    </div>
                  </div>
                  <q-btn
                    id="btn-overview-goto-reports"
                    unelevated
                    no-caps
                    color="positive"
                    class="full-width text-weight-bold"
                    label="Ver Relatório Mensal →"
                    @click="activeTab = 'reports'"
                  />
                </q-card-section>
              </q-card>
            </div>

            <!-- Card 3: Central de Termos -->
            <div class="col-12 col-md-6 col-lg-3">
              <q-card flat bordered class="full-height">
                <q-card-section class="q-gutter-y-sm">
                  <div class="row items-center justify-between">
                    <div class="m-icon-box m-tone-amber text-amber-9">
                      <q-icon name="fact_check" size="22px" />
                    </div>
                    <span class="text-caption text-weight-bold text-amber-9">Jurídico & LGPD</span>
                  </div>
                  <div>
                    <div class="text-subtitle1 text-weight-bold">Central de Termos & Aceites</div>
                    <div class="text-caption text-grey-7 q-mt-xs">
                      Visualize os termos recebidos por cada tipo de usuário (Consumidor, Padaria, Entidade, Descarte).
                    </div>
                  </div>
                  <q-btn
                    unelevated
                    no-caps
                    color="grey-3"
                    text-color="grey-9"
                    class="full-width text-weight-bold"
                    label="Auditar Termos e Certidões →"
                    @click="activeTab = 'terms'"
                  />
                </q-card-section>
              </q-card>
            </div>

          </div>
        </div>
      </q-tab-panel>

      <!-- ========================================================================= -->
      <!-- TAB 2: GESTÃO DE USUÁRIOS (CRUD COMPLETO)                                 -->
      <!-- ========================================================================= -->
      <q-tab-panel name="users" class="m-container q-pa-md">
        <div class="column q-gutter-y-md">

          <!-- Header & Action Bar -->
          <div class="row items-center justify-between q-col-gutter-sm">
            <div class="text-h6 text-weight-bold">Usuários do Sistema</div>

            <q-btn
              id="btn-add-user"
              unelevated
              no-caps
              color="positive"
              icon="add"
              label="Novo Usuário"
              class="text-weight-bold"
              @click="openCreateUserModal"
            />
          </div>

          <!-- Filters -->
          <div class="column q-gutter-y-sm full-width">
            <!-- Campo de Busca em largura total -->
            <q-input
              v-model="userSearch"
              outlined
              dense
              clearable
              :bg-color="modoEscuro ? 'dark' : 'white'"
              placeholder="Buscar por nome, e-mail ou CPF/CNPJ..."
            >
              <template #prepend>
                <q-icon name="search" size="18px" />
              </template>
            </q-input>

            <!-- Filtros de Papel/Perfil de Usuários -->
            <div class="row items-center q-gutter-xs">
              <q-btn
                v-for="roleOption in [
                  { id: 'all', label: 'Todos' },
                  { id: 'client', label: 'Clientes' },
                  { id: 'store', label: 'Lojas' },
                  { id: 'institution', label: 'Entidades' },
                  { id: 'disposal', label: 'Descarte' }
                ]"
                :key="roleOption.id"
                no-caps
                dense
                class="q-px-md text-weight-bold"
                :unelevated="userRoleFilter === roleOption.id"
                :outline="userRoleFilter !== roleOption.id"
                :color="userRoleFilter === roleOption.id ? 'amber-8' : 'grey-7'"
                :text-color="userRoleFilter === roleOption.id ? 'dark' : undefined"
                :label="roleOption.label"
                @click="userRoleFilter = roleOption.id"
              />
            </div>
          </div>

          <!-- Controls: Contador e Botão de Alternar Expansão de Todos -->
          <div class="row items-center justify-between q-col-gutter-sm">
            <span class="text-caption text-grey-7 text-weight-medium">
              Exibindo <strong>{{ filteredUsers.length }}</strong> {{ filteredUsers.length === 1 ? 'usuário' : 'usuários' }} • Clique para ver detalhes e editar
            </span>
            <q-btn
              outline
              dense
              no-caps
              color="grey-7"
              class="q-px-sm text-weight-bold"
              :label="areAllUsersExpanded ? 'Recolher Todos' : 'Expandir Todos'"
              @click="toggleAllUsers"
            />
          </div>

          <!-- LISTA DE USUÁRIOS E CLIENTES -->
          <div class="column q-gutter-y-sm">
            <q-card
              v-for="user in filteredUsers"
              :key="user.id"
              flat
              bordered
              class="m-item"
              :class="[expandedUserIds[user.id] ? 'm-tone-amber' : '', user.suspenso ? 'm-border-red' : '']"
            >
              <!-- CABEÇALHO COMPACTO -->
              <q-item clickable class="q-pa-md" @click="toggleUserExpand(user.id)">
                <q-item-section avatar>
                  <q-avatar size="40px">
                    <img :src="user.urlAvatar || IMAGES.avatar02" alt="avatar" />
                  </q-avatar>
                </q-item-section>

                <q-item-section>
                  <q-item-label class="row items-center no-wrap q-gutter-x-xs">
                    <span class="text-subtitle2 text-weight-bold ellipsis">{{ user.name }}</span>
                    <q-icon v-if="user.role === 'master'" name="workspace_premium" color="amber-8" size="16px">
                      <q-tooltip>Super Admin Master</q-tooltip>
                    </q-icon>
                    <q-badge v-if="user.suspenso" color="negative" outline class="text-weight-bold">
                      Suspenso
                    </q-badge>
                  </q-item-label>

                  <!-- TIPO DE USUÁRIO E AVALIAÇÃO -->
                  <q-item-label class="row items-center q-gutter-xs q-mt-xs">
                    <q-chip dense outline :color="roleColor(user.role)" class="text-weight-bold text-uppercase q-ma-none">
                      {{ getRoleLabel(user.role) }}
                    </q-chip>

                    <!-- Avaliação: apenas para lojas -->
                    <q-chip
                      v-if="user.role !== 'client'"
                      dense
                      outline
                      color="amber-9"
                      icon="star"
                      class="text-weight-bold q-ma-none"
                    >
                      <span>{{ user.rating !== undefined ? user.rating.toFixed(1) : '5.0' }}</span>
                      <span class="m-tiny text-grey-7 q-ml-xs text-weight-regular">({{ user.qtdAvaliacoes || 0 }})</span>
                      <q-tooltip>Avaliações recebidas</q-tooltip>
                    </q-chip>
                    <!-- Selo de Cliente -->
                    <q-chip
                      v-else
                      dense
                      outline
                      color="grey-7"
                      icon="shopping_bag"
                      class="q-ma-none"
                    >
                      Consumidor / Avaliador
                      <q-tooltip>Clientes não possuem estrelas; eles avaliam os estabelecimentos</q-tooltip>
                    </q-chip>
                  </q-item-label>
                </q-item-section>

                <!-- Indicador de Expansão -->
                <q-item-section side>
                  <q-btn
                    flat
                    dense
                    round
                    :color="expandedUserIds[user.id] ? 'amber-8' : 'grey-7'"
                    icon="expand_more"
                    class="m-chevron"
                    :class="{ 'm-chevron--open': expandedUserIds[user.id] }"
                  />
                </q-item-section>

                <q-tooltip>{{ expandedUserIds[user.id] ? 'Clique para recolher detalhes' : 'Clique para ver dados completos e editar' }}</q-tooltip>
              </q-item>

              <!-- DETALHES COMPLETOS -->
              <div v-if="expandedUserIds[user.id]" class="m-subpanel">
                <q-separator />
                <div class="q-pa-md column q-gutter-y-md">
                  <!-- Barra de Ações com o Botão de Editar e Status -->
                  <div class="row items-center justify-between q-col-gutter-sm">
                    <div class="text-caption text-grey-7 row items-center q-gutter-x-sm">
                      <span>ID: <strong class="m-mono">{{ getUserNumericId(user) }}</strong></span>
                      <span>•</span>
                      <span>Criado em: <strong>{{ formatUserCreatedAt(user) }}</strong></span>
                    </div>

                    <!-- Ações Administrativas -->
                    <div class="row items-center q-gutter-sm">
                      <q-btn
                        v-if="user.role !== 'master'"
                        outline
                        no-caps
                        color="positive"
                        icon="chat"
                        label="WhatsApp"
                        class="text-weight-bold"
                        :disable="!normalizarTelefone(user.whatsapp)"
                        @click.stop="abrirWhatsappUsuario(user)"
                      >
                        <q-tooltip>{{ normalizarTelefone(user.whatsapp) ? 'Enviar mensagem pronta pelo WhatsApp' : 'Usuário sem WhatsApp cadastrado' }}</q-tooltip>
                      </q-btn>
                      <q-btn
                        unelevated
                        no-caps
                        color="blue-7"
                        icon="edit"
                        label="Editar Usuário"
                        class="text-weight-bold"
                        @click.stop="openEditUserModal(user)"
                      >
                        <q-tooltip>Editar Dados do Usuário</q-tooltip>
                      </q-btn>

                      <q-btn
                        v-if="user.role !== 'master'"
                        outline
                        no-caps
                        :color="user.suspenso ? 'positive' : 'amber-9'"
                        icon="gpp_maybe"
                        :label="user.suspenso ? 'Reativar Usuário' : 'Suspender Usuário'"
                        class="text-weight-bold"
                        @click.stop="toggleUserSuspension(user)"
                      >
                        <q-tooltip>{{ user.suspenso ? 'Reativar Conta' : 'Suspender Conta' }}</q-tooltip>
                      </q-btn>

                      <q-btn
                        v-if="user.role !== 'master'"
                        outline
                        dense
                        color="negative"
                        icon="delete"
                        class="q-pa-xs"
                        @click.stop="deleteUserConfirm(user)"
                      >
                        <q-tooltip>Excluir Usuário Permanentemente</q-tooltip>
                      </q-btn>
                    </div>
                  </div>

                  <!-- Grid com as demais informações estruturadas -->
                  <div class="row q-col-gutter-sm">

                    <!-- Box 1: E-mail & Contato -->
                    <div class="col-12 col-sm-6 col-lg-3">
                      <CaixaInfoMaster icon="mail" icon-color="blue-7" title="E-mail & Login">
                        <div class="m-mono text-weight-bold text-body2 break-word">{{ user.email }}</div>
                        <div class="m-tiny text-grey-7">Acesso verificado</div>
                      </CaixaInfoMaster>
                    </div>

                    <!-- Box 2: Documento Fiscal -->
                    <div class="col-12 col-sm-6 col-lg-3">
                      <CaixaInfoMaster icon="description" icon-color="positive" title="CPF / CNPJ">
                        <div class="m-mono text-weight-bold text-body2">{{ user.cpfCnpj || 'Não cadastrado' }}</div>
                        <div class="m-tiny text-grey-7">Identificação Nacional</div>
                      </CaixaInfoMaster>
                    </div>

                    <!-- Box 3: Pontos & Recompensas -->
                    <div class="col-12 col-sm-6 col-lg-3">
                      <CaixaInfoMaster icon="military_tech" icon-color="amber-9" title="Pontos Acumulados">
                        <div class="text-weight-bold text-body2">
                          <span>{{ user.points || 0 }}</span>
                          <span class="text-caption text-amber-9 text-weight-regular q-ml-xs">pontos</span>
                        </div>
                        <div class="m-tiny text-grey-7">Resgates e engajamento</div>
                      </CaixaInfoMaster>
                    </div>

                    <!-- Box 4: Endereço & Localização -->
                    <div class="col-12 col-sm-6 col-lg-3">
                      <CaixaInfoMaster icon="place" icon-color="negative" title="Endereço Cadastrado">
                        <div class="text-weight-medium text-body2 ellipsis">
                          {{ user.address || 'Não cadastrado' }}
                          <q-tooltip>{{ user.address || 'Não cadastrado' }}</q-tooltip>
                        </div>
                        <div class="m-tiny text-grey-7">Base de entrega / atuação</div>
                      </CaixaInfoMaster>
                    </div>

                    <!-- Box 5: Certificado Digital A1 (se for estabelecimento ou tiver arquivo) -->
                    <div v-if="user.role === 'store' || user.pfxFileName" class="col-12">
                      <CaixaInfoMaster icon="verified_user" icon-color="positive" title="Certificado Digital A1" class="m-tone-green">
                        <template #title-side>
                          <q-badge :color="user.pfxFileName ? 'positive' : 'green-1'" :text-color="user.pfxFileName ? 'white' : 'green-9'" class="text-weight-bold text-uppercase">
                            {{ user.pfxFileName ? 'A1 Anexado & Homologado' : 'Certificado A1 Ativo' }}
                          </q-badge>
                        </template>
                        <div class="row items-center justify-between q-col-gutter-sm">
                          <span class="m-mono text-weight-bold ellipsis text-body2">
                            📋 {{ user.pfxFileName || 'certificado_a1_estabelecimento.pfx' }}
                          </span>
                          <span class="m-tiny m-mono text-grey-7">
                            {{ user.signatureCertificate || 'Assinatura Digital Lei 14.016 / e-CNPJ' }}
                          </span>
                        </div>
                      </CaixaInfoMaster>
                    </div>

                  </div>

                  <!-- Alerta de Suspensão se houver -->
                  <q-banner v-if="user.suspenso && user.suspendedReason" dense rounded class="m-tone-red text-negative">
                    <template #avatar>
                      <q-icon name="warning" color="negative" size="18px" />
                    </template>
                    <span class="text-caption"><strong>Motivo da suspensão:</strong> {{ user.suspendedReason }}</span>
                  </q-banner>
                </div>
              </div>
            </q-card>

            <!-- Estado Vazio se nenhum usuário coincidir com o filtro -->
            <q-card v-if="filteredUsers.length === 0" flat bordered class="m-dashed text-center q-pa-xl">
              <q-icon name="group" size="32px" color="grey-5" />
              <div class="text-subtitle2 text-weight-bold q-mt-sm">Nenhum usuário encontrado</div>
              <div class="text-caption text-grey-7">Tente ajustar a busca ou os filtros de perfil acima.</div>
            </q-card>
          </div>

        </div>
      </q-tab-panel>

      <!-- ========================================================================= -->
      <!-- TAB 3: ESTABELECIMENTOS & MODERAÇÃO DE NOTAS BAIXAS                       -->
      <!-- ========================================================================= -->
      <q-tab-panel name="stores" class="m-container q-pa-md">
        <div class="column q-gutter-y-md">

          <div class="row items-center justify-between q-col-gutter-sm">
            <div class="text-h6 text-weight-bold">Moderação & Gestão de Estabelecimentos</div>

            <q-btn
              unelevated
              no-caps
              color="blue-7"
              icon="add"
              label="Cadastrar Novo Estabelecimento"
              class="text-weight-bold"
              @click="openCreateStoreModal"
            />
          </div>

          <!-- Filters -->
          <div class="column q-gutter-y-sm full-width">
            <q-input
              v-model="storeSearch"
              outlined
              dense
              clearable
              :bg-color="modoEscuro ? 'dark' : 'white'"
              placeholder="Buscar por nome da panificadora ou endereço..."
            >
              <template #prepend>
                <q-icon name="search" size="18px" />
              </template>
            </q-input>

            <div class="row items-center q-gutter-xs">
              <q-btn
                no-caps
                dense
                class="q-px-md text-weight-bold"
                :unelevated="storeFilter === 'all'"
                :outline="storeFilter !== 'all'"
                :color="storeFilter === 'all' ? 'amber-8' : 'grey-7'"
                :text-color="storeFilter === 'all' ? 'dark' : undefined"
                :label="`Todas (${allStores.length})`"
                @click="storeFilter = 'all'"
              />

              <q-btn
                no-caps
                dense
                icon="warning_amber"
                class="q-px-md text-weight-bold"
                color="negative"
                :unelevated="storeFilter === 'bad_rating'"
                :outline="storeFilter !== 'bad_rating'"
                label="Avaliações Baixas (&lt; 3.5)"
                @click="storeFilter = 'bad_rating'"
              />

              <q-btn
                no-caps
                dense
                icon="gpp_maybe"
                class="q-px-md text-weight-bold"
                :unelevated="storeFilter === 'suspended'"
                :outline="storeFilter !== 'suspended'"
                :color="storeFilter === 'suspended' ? 'amber-8' : 'grey-7'"
                :text-color="storeFilter === 'suspended' ? 'dark' : undefined"
                :label="`Desvinculadas / Suspensas (${countSuspendedStores})`"
                @click="storeFilter = 'suspended'"
              />

              <q-btn
                outline
                no-caps
                dense
                color="grey-7"
                class="q-px-md text-weight-bold"
                :label="areAllStoresExpanded ? 'Recolher Todas' : 'Expandir Todas'"
                @click="toggleAllStores"
              />
            </div>
          </div>

          <!-- Stores Accordion -->
          <div class="column q-gutter-y-sm">
            <q-card v-if="filteredStores.length === 0" flat bordered class="q-pa-lg text-center text-caption text-grey-7">
              Nenhum estabelecimento encontrado para os filtros selecionados.
            </q-card>

            <q-card
              v-for="store in filteredStores"
              :key="store.id"
              flat
              bordered
              class="m-item"
              :class="expandedStoreIds[store.id]
                ? 'm-tone-amber'
                : (isStoreSuspended(store) ? 'm-tone-amber' : (store.rating < 3.5 ? 'm-tone-red' : ''))"
            >
              <!-- Store Header -->
              <q-item clickable class="q-pa-md" @click="toggleStoreExpand(store.id)">
                <q-item-section avatar>
                  <q-avatar square size="40px" class="m-rounded">
                    <img :src="store.logo" alt="logo" />
                  </q-avatar>
                </q-item-section>

                <q-item-section>
                  <q-item-label class="row items-center q-gutter-sm">
                    <span class="text-subtitle2 text-weight-bold">{{ store.name }}</span>

                    <!-- Rating badge -->
                    <q-badge
                      :color="store.rating < 3.5 ? 'red-1' : 'amber-1'"
                      :text-color="store.rating < 3.5 ? 'red-10' : 'amber-10'"
                      class="text-weight-bold"
                    >
                      <q-icon name="star" size="12px" class="q-mr-xs" />
                      <span>{{ store.rating.toFixed(1) }}</span>
                    </q-badge>

                    <!-- Suspended Badge -->
                    <q-badge v-if="isStoreSuspended(store)" color="amber-2" text-color="amber-10" class="text-weight-bold">
                      <q-icon name="gpp_maybe" size="12px" class="q-mr-xs" />
                      <span>Desvinculada</span>
                    </q-badge>

                    <span v-else-if="store.rating < 3.5" class="m-tiny text-negative text-weight-bold text-uppercase row items-center q-gutter-x-xs">
                      <q-icon name="warning_amber" size="12px" />
                      <span>Baixa Avaliação</span>
                    </span>
                  </q-item-label>
                  <q-item-label caption>
                    {{ expandedStoreIds[store.id] ? 'Clique para recolher detalhes' : 'Clique para visualizar endereço, contatos e ações' }}
                  </q-item-label>
                </q-item-section>

                <!-- Right Indicator & Chevron -->
                <q-item-section side>
                  <div class="row items-center no-wrap q-gutter-x-sm">
                    <q-btn
                      unelevated
                      dense
                      no-caps
                      color="amber-8"
                      text-color="dark"
                      icon="edit"
                      label="Editar"
                      class="q-px-sm text-weight-bold"
                      @click.stop="openEditStoreModal(store)"
                    >
                      <q-tooltip>Editar dados e informações do estabelecimento</q-tooltip>
                    </q-btn>

                    <q-btn
                      flat
                      dense
                      round
                      :color="expandedStoreIds[store.id] ? 'amber-8' : 'grey-7'"
                      icon="expand_more"
                      class="m-chevron"
                      :class="{ 'm-chevron--open': expandedStoreIds[store.id] }"
                    />
                  </div>
                </q-item-section>

                <q-tooltip>{{ expandedStoreIds[store.id] ? 'Clique para recolher detalhes' : 'Clique para ver todas as informações da empresa' }}</q-tooltip>
              </q-item>

              <!-- Complete Details -->
              <div v-if="expandedStoreIds[store.id]" class="m-subpanel">
                <q-separator />
                <div class="q-pa-md column q-gutter-y-md">
                  <div class="row q-col-gutter-sm">
                    <!-- Box 1: Categoria & Localização -->
                    <div class="col-12 col-sm-6">
                      <CaixaInfoMaster icon="storefront" icon-color="amber-9" title="Categoria & Local">
                        <div class="text-weight-bold text-body2">
                          {{ store.category || 'Padaria & Confeitaria' }}
                        </div>
                        <div class="text-caption text-grey-7 row items-center no-wrap q-gutter-x-xs">
                          <q-icon name="place" size="14px" color="grey-6" />
                          <span>{{ store.address }}</span>
                        </div>
                      </CaixaInfoMaster>
                    </div>

                    <!-- Box 2: Desempenho & Avaliação -->
                    <div class="col-12 col-sm-6">
                      <CaixaInfoMaster icon="star" icon-color="amber-9" title="Nota & Satisfação">
                        <div class="text-weight-bold text-amber-10 text-body2">
                          Nota: {{ store.rating.toFixed(1) }} de 5.0 estrelas
                        </div>
                        <div class="m-tiny text-grey-7">
                          Critério: Notas abaixo de 3.5 exigem intervenção da moderação.
                        </div>
                      </CaixaInfoMaster>
                    </div>
                  </div>

                  <!-- Moderation notice if suspended -->
                  <q-banner v-if="isStoreSuspended(store)" dense rounded class="m-tone-amber">
                    <div class="text-caption text-weight-bold text-amber-10 row items-center q-gutter-x-xs">
                      <q-icon name="gpp_maybe" color="amber-9" size="16px" />
                      <span>Estabelecimento Desvinculado / Suspenso</span>
                    </div>
                    <div class="m-tiny text-amber-10 q-mt-xs">
                      {{ store.motivoDesvinculo || 'Esta loja foi desvinculada pela moderação e seus produtos estão pausados no catálogo da SaveAll.' }}
                    </div>
                  </q-banner>

                  <!-- Moderation notice if low rating -->
                  <q-banner v-else-if="store.rating < 3.5" dense rounded class="m-tone-red">
                    <div class="text-caption text-weight-bold text-negative row items-center q-gutter-x-xs">
                      <q-icon name="error_outline" size="16px" />
                      <span>Alerta de Qualidade</span>
                    </div>
                    <div class="m-tiny text-negative q-mt-xs">
                      Estabelecimento com média de avaliação inferior ao limite seguro de 3.5 estrelas. Você pode desvincular ou excluir.
                    </div>
                  </q-banner>

                  <q-separator />

                  <!-- Action Buttons -->
                  <div class="row items-center justify-between q-col-gutter-sm">
                    <q-btn
                      unelevated
                      no-caps
                      color="blue-7"
                      icon="edit"
                      label="Editar Empresa"
                      class="text-weight-bold"
                      @click.stop="openEditStoreModal(store)"
                    />

                    <div class="row items-center q-gutter-sm">
                      <q-btn
                        outline
                        no-caps
                        color="positive"
                        icon="chat"
                        label="WhatsApp"
                        class="text-weight-bold"
                        :disable="!whatsappDaLoja(store)"
                        @click.stop="abrirWhatsappLoja(store)"
                      >
                        <q-tooltip>{{ whatsappDaLoja(store) ? 'Enviar mensagem pronta pelo WhatsApp' : 'Estabelecimento sem WhatsApp cadastrado' }}</q-tooltip>
                      </q-btn>
                      <q-btn
                        v-if="!isStoreSuspended(store)"
                        outline
                        no-caps
                        color="amber-9"
                        icon="gpp_maybe"
                        label="Desvincular"
                        class="text-weight-bold"
                        @click.stop="removeStoreModeration(store)"
                      >
                        <q-tooltip>Desvincular e Suspender Loja</q-tooltip>
                      </q-btn>

                      <q-btn
                        v-else
                        outline
                        no-caps
                        color="positive"
                        icon="check_circle"
                        label="Reativar Loja"
                        class="text-weight-bold"
                        @click.stop="reinstateStoreModeration(store)"
                      >
                        <q-tooltip>Reativar e Vincular Loja Novamente</q-tooltip>
                      </q-btn>

                      <q-btn
                        outline
                        no-caps
                        color="negative"
                        icon="delete"
                        label="Remover"
                        class="text-weight-bold"
                        @click.stop="deleteStorePermanent(store)"
                      >
                        <q-tooltip>Remover Definitivamente</q-tooltip>
                      </q-btn>
                    </div>
                  </div>

                </div>
              </div>
            </q-card>
          </div>

        </div>
      </q-tab-panel>

      <!-- ========================================================================= -->
      <!-- TAB 4: ENTIDADES SOCIAIS & TERMOS GOV.BR                                  -->
      <!-- ========================================================================= -->
      <q-tab-panel name="entities" class="m-container q-pa-md">
        <div class="column q-gutter-y-md">

          <div class="row items-center justify-between q-col-gutter-sm">
            <div class="text-subtitle1 text-weight-bold">Gestão & Homologação de Entidades Sociais</div>

            <div class="row items-center q-gutter-sm">
              <!-- Button indicating pending entities waiting for acceptance or rejection -->
              <q-btn
                v-if="pendingEntitiesCount > 0"
                id="btn-entities-pending"
                unelevated
                no-caps
                color="amber-8"
                text-color="dark"
                icon="volunteer_activism"
                class="text-weight-bolder"
                :class="entityStatusFilter === 'pending' ? 'm-ring-amber' : ''"
                :label="`${pendingEntitiesCount} ${pendingEntitiesCount === 1 ? 'Pendente' : 'Pendentes'} (Aceite/Recusa)`"
                @click="entityStatusFilter = 'pending'"
              >
                <q-tooltip>Filtrar entidades aguardando homologação do Master</q-tooltip>
              </q-btn>

              <q-btn
                unelevated
                no-caps
                color="pink-6"
                icon="add"
                label="Cadastrar Entidade Manualmente"
                class="text-weight-bold"
                @click="openCreateEntityModal"
              />
            </div>
          </div>

          <!-- Search Bar & Filters -->
          <div class="column q-gutter-y-sm full-width">
            <q-input
              v-model="entitySearch"
              outlined
              dense
              clearable
              :bg-color="modoEscuro ? 'dark' : 'white'"
              placeholder="Buscar por nome da entidade, CNPJ, responsável ou cidade..."
            >
              <template #prepend>
                <q-icon name="search" size="18px" />
              </template>
            </q-input>

            <!-- Status Filter Pills -->
            <div class="row items-center q-gutter-xs">
              <q-btn
                no-caps
                dense
                class="q-px-md text-weight-bold"
                :unelevated="entityStatusFilter === 'all'"
                :flat="entityStatusFilter !== 'all'"
                :color="entityStatusFilter === 'all' ? 'grey-9' : 'grey-7'"
                :label="`Todas (${allEntities.length})`"
                @click="entityStatusFilter = 'all'"
              />
              <q-btn
                no-caps
                dense
                class="q-px-md text-weight-bold"
                :unelevated="entityStatusFilter === 'pending'"
                :flat="entityStatusFilter !== 'pending'"
                :color="entityStatusFilter === 'pending' ? 'amber-8' : 'amber-10'"
                :text-color="entityStatusFilter === 'pending' ? 'dark' : undefined"
                :label="`Aguardando (${countPendingEntities})`"
                @click="entityStatusFilter = 'pending'"
              />
              <q-btn
                no-caps
                dense
                class="q-px-md text-weight-bold"
                :unelevated="entityStatusFilter === 'validated'"
                :flat="entityStatusFilter !== 'validated'"
                :color="entityStatusFilter === 'validated' ? 'positive' : 'green-9'"
                :label="`Homologadas (${countValidatedEntities})`"
                @click="entityStatusFilter = 'validated'"
              />
              <q-btn
                no-caps
                dense
                class="q-px-md text-weight-bold"
                :unelevated="entityStatusFilter === 'rejected'"
                :flat="entityStatusFilter !== 'rejected'"
                :color="entityStatusFilter === 'rejected' ? 'negative' : 'red-9'"
                :label="`Recusadas (${countRejectedEntities})`"
                @click="entityStatusFilter = 'rejected'"
              />
              <q-btn
                v-if="countInactiveEntities > 0"
                no-caps
                dense
                icon="gpp_maybe"
                class="q-px-md text-weight-bold"
                :unelevated="entityStatusFilter === 'inactive'"
                :flat="entityStatusFilter !== 'inactive'"
                :color="entityStatusFilter === 'inactive' ? 'amber-9' : 'amber-10'"
                :label="`Desvinculadas (${countInactiveEntities})`"
                @click="entityStatusFilter = 'inactive'"
              />

              <q-btn
                outline
                no-caps
                dense
                color="grey-7"
                class="q-px-md text-weight-bold"
                :label="areAllFilteredEntitiesExpanded ? 'Recolher Todos' : 'Expandir Todos'"
                @click="toggleAllFilteredEntities"
              />
            </div>
          </div>

          <!-- Entities List -->
          <div class="column q-gutter-y-sm">
            <q-card v-if="filteredEntities.length === 0" flat bordered class="q-pa-lg text-center text-caption text-grey-7">
              Nenhuma entidade encontrada para os filtros selecionados.
            </q-card>

            <q-card
              v-for="entity in filteredEntities"
              :key="entity.id"
              flat
              bordered
              class="m-item"
              :class="expandedEntityIds[entity.id] ? 'm-tone-amber' : ''"
            >
              <!-- Card Header -->
              <q-item clickable class="q-pa-md" @click="toggleEntityExpand(entity.id)">
                <q-item-section avatar>
                  <div
                    class="m-icon-box"
                    :class="entity.validationStatus === 'validated' ? 'm-tone-green text-positive' : entity.validationStatus === 'rejected' ? 'm-tone-red text-negative' : 'm-tone-amber text-amber-9'"
                  >
                    <q-icon name="apartment" size="22px" />
                  </div>
                </q-item-section>

                <q-item-section>
                  <q-item-label class="text-subtitle2 text-weight-bold ellipsis">
                    {{ entity.name }}
                  </q-item-label>

                  <q-item-label class="row items-center q-gutter-sm q-mt-xs">
                    <q-badge
                      :color="entity.validationStatus === 'validated' ? 'positive' : (entity.validationStatus === 'rejected' ? 'negative' : 'amber-8')"
                      :text-color="entity.validationStatus === 'validated' || entity.validationStatus === 'rejected' ? 'white' : 'dark'"
                      class="text-weight-bold text-uppercase"
                      :class="entity.validationStatus === 'validated' || entity.validationStatus === 'rejected' || entity.validationStatus === 'inactive' ? '' : 'm-pulse'"
                    >
                      {{
                        entity.validationStatus === 'validated' ? 'Homologada / Ativa' :
                        (entity.validationStatus === 'rejected' ? 'Recusada' :
                        (entity.validationStatus === 'inactive' ? 'Desvinculada' : 'Aguardando Análise'))
                      }}
                    </q-badge>

                    <q-badge v-if="entity.origin === 'public_form'" color="blue-1" text-color="blue-9" class="text-weight-medium m-mono">
                      Formulário Público
                    </q-badge>

                    <span class="m-tiny text-grey-7 row items-center no-wrap q-gutter-x-xs">
                      <q-icon name="place" size="12px" color="grey-6" />
                      <span>{{ entity.city }}/{{ entity.state || 'SC' }}</span>
                    </span>
                  </q-item-label>
                </q-item-section>

                <!-- Right Indicator & Chevron -->
                <q-item-section side>
                  <q-btn
                    flat
                    dense
                    round
                    :color="expandedEntityIds[entity.id] ? 'amber-8' : 'grey-7'"
                    icon="expand_more"
                    class="m-chevron"
                    :class="{ 'm-chevron--open': expandedEntityIds[entity.id] }"
                  />
                </q-item-section>

                <q-tooltip>{{ expandedEntityIds[entity.id] ? 'Clique para recolher detalhes' : 'Clique para ver todas as informações' }}</q-tooltip>
              </q-item>

              <!-- Complete Details -->
              <div v-if="expandedEntityIds[entity.id]" class="m-subpanel">
                <q-separator />
                <div class="q-pa-md column q-gutter-y-md">
                  <!-- Card Subheader with Protocol & Actions -->
                  <div class="row items-center justify-between q-col-gutter-sm">
                    <div class="col-12 col-lg column q-gutter-y-xs">
                      <div class="row items-center q-gutter-x-sm text-caption text-grey-7 m-mono">
                        <span>Protocolo: <strong class="text-positive">#{{ entity.id.toUpperCase() }}</strong></span>
                        <span v-if="entity.rejectionReason" class="text-negative text-weight-medium">
                          • Motivo Recusa: {{ entity.rejectionReason }}
                        </span>
                        <span v-else-if="entity.validationStatus === 'inactive'" class="text-amber-10 text-weight-medium">
                          • Status: Desvinculada
                        </span>
                      </div>
                      <div v-if="entity.lastNotificationSentAt" class="m-tiny text-blue-8 row items-center q-gutter-x-xs">
                        <q-icon name="send" size="12px" color="blue-7" />
                        <span>Notificado em {{ new Date(entity.lastNotificationSentAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }}</span>
                      </div>
                    </div>

                    <!-- Action buttons -->
                    <div class="col-12 col-lg-auto row items-center q-gutter-sm">
                      <!-- SE AGUARDANDO (pending_review): Exibir Aceitar e Recusar -->
                      <template v-if="entity.validationStatus === 'pending_review'">
                        <q-btn
                          unelevated
                          no-caps
                          color="positive"
                          icon="check_circle"
                          label="Aceitar Entidade"
                          class="text-weight-bold"
                          @click.stop="openDecisionModal(entity, 'accept')"
                        >
                          <q-tooltip>Aceitar Entidade e Enviar Notificações (WhatsApp/E-mail)</q-tooltip>
                        </q-btn>

                        <q-btn
                          outline
                          no-caps
                          color="negative"
                          icon="cancel"
                          label="Recusar"
                          class="text-weight-bold"
                          @click.stop="openDecisionModal(entity, 'reject')"
                        >
                          <q-tooltip>Recusar Entidade e Enviar Notificação com Motivo</q-tooltip>
                        </q-btn>
                      </template>

                      <!-- SE HOMOLOGADA (validated): Somente DESVINCULAR -->
                      <template v-else-if="entity.validationStatus === 'validated'">
                        <q-btn
                          outline
                          no-caps
                          color="amber-9"
                          icon="gpp_maybe"
                          label="Desvincular"
                          class="text-weight-bold"
                          @click.stop="unlinkEntity(entity)"
                        >
                          <q-tooltip>Desvincular entidade homologada</q-tooltip>
                        </q-btn>
                      </template>

                      <!-- SE DESVINCULADA (inactive): Permitir Reativar -->
                      <template v-else-if="entity.validationStatus === 'inactive'">
                        <q-btn
                          unelevated
                          no-caps
                          color="positive"
                          icon="check_circle"
                          label="Reativar Entidade"
                          class="text-weight-bold"
                          @click.stop="reinstateEntity(entity)"
                        >
                          <q-tooltip>Reativar e homologar entidade desvinculada</q-tooltip>
                        </q-btn>
                      </template>

                      <!-- SE RECUSADA (rejected): Não exibir aceitar nem recusar -->
                      <template v-else-if="entity.validationStatus === 'rejected'">
                        <q-chip dense outline color="negative" icon="cancel" class="text-weight-bold q-ma-none">
                          Recusada
                        </q-chip>
                        <q-btn
                          outline
                          no-caps
                          color="grey-7"
                          icon="restart_alt"
                          label="Reabrir Análise"
                          class="text-weight-bold"
                          @click.stop="reopenEntityReview(entity)"
                        >
                          <q-tooltip>Retornar para a fila de homologação</q-tooltip>
                        </q-btn>
                      </template>

                      <!-- Download Term -->
                      <q-btn
                        outline
                        no-caps
                        color="blue-7"
                        icon="download"
                        label="Baixar Termo"
                        class="text-weight-bold"
                        @click.stop="downloadEntityTerm(entity)"
                      >
                        <q-tooltip>Baixar Termo de Adesão Gov.br em PDF para conferir ou verificar online</q-tooltip>
                      </q-btn>

                      <!-- Verify Online ITI Gov.br Link -->
                      <q-btn
                        outline
                        no-caps
                        color="positive"
                        icon="open_in_new"
                        href="https://validar.iti.gov.br"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-weight-bold"
                        @click.stop
                      >
                        <span class="gt-xs q-ml-xs">Verificar Assinatura Online</span>
                        <q-tooltip>Abrir Validador Oficial Gov.br (validar.iti.gov.br) para validar o PDF baixado</q-tooltip>
                      </q-btn>

                      <!-- Edit -->
                      <q-btn
                        outline
                        dense
                        color="grey-7"
                        icon="edit"
                        class="q-pa-xs"
                        @click.stop="openEditEntityModal(entity)"
                      >
                        <q-tooltip>Editar Dados da Entidade</q-tooltip>
                      </q-btn>

                      <!-- Delete -->
                      <q-btn
                        outline
                        dense
                        color="negative"
                        icon="delete"
                        class="q-pa-xs"
                        @click.stop="deleteEntity(entity)"
                      >
                        <q-tooltip>Excluir Entidade</q-tooltip>
                      </q-btn>
                    </div>
                  </div>

                  <q-separator />

                  <!-- Moderation Status Notice if Inactive or Rejected -->
                  <q-banner v-if="entity.validationStatus === 'inactive'" dense rounded class="m-tone-amber">
                    <div class="text-caption text-weight-bold text-amber-10 row items-center q-gutter-x-xs">
                      <q-icon name="gpp_maybe" color="amber-9" size="16px" />
                      <span>Entidade Social Desvinculada</span>
                    </div>
                    <div class="m-tiny text-amber-10 q-mt-xs">
                      {{ entity.notes || 'Esta entidade foi desvinculada pela moderação Master e está com recebimento de doações pausado.' }}
                    </div>
                  </q-banner>
                  <q-banner v-else-if="entity.validationStatus === 'rejected'" dense rounded class="m-tone-red">
                    <div class="text-caption text-weight-bold text-negative row items-center q-gutter-x-xs">
                      <q-icon name="cancel" size="16px" />
                      <span>Entidade Recusada na Homologação</span>
                    </div>
                    <div class="m-tiny text-negative q-mt-xs">
                      Motivo da recusa: {{ entity.rejectionReason || 'Documentação ou assinatura Gov.br pendente de adequação.' }}
                    </div>
                  </q-banner>

                  <!-- Structured 4-Box Information Grid -->
                  <div class="row q-col-gutter-sm">

                    <!-- Box 1: Identificação & Localização -->
                    <div class="col-12 col-sm-6 col-lg-4">
                      <CaixaInfoMaster icon="apartment" icon-color="blue-7" title="Identificação & Local">
                        <div class="m-mono text-weight-bold text-body2">CNPJ: {{ entity.cnpj }}</div>
                        <div class="text-caption text-grey-7 row items-center no-wrap q-gutter-x-xs">
                          <q-icon name="place" size="12px" color="grey-6" />
                          <span class="ellipsis">{{ entity.city }}/{{ entity.state || 'SC' }}</span>
                        </div>
                        <div class="m-tiny text-grey-7 ellipsis">
                          {{ entity.address || 'Endereço não detalhado' }}
                          <q-tooltip>{{ entity.address }}</q-tooltip>
                        </div>
                      </CaixaInfoMaster>
                    </div>

                    <!-- Box 2: Responsável & Contatos -->
                    <div class="col-12 col-sm-6 col-lg-4">
                      <CaixaInfoMaster icon="group" icon-color="positive" title="Responsável & Contatos">
                        <div class="text-weight-bold text-body2 ellipsis">
                          {{ entity.contactPerson || entity.responsibleName || 'Responsável não informado' }}
                          <q-tooltip>{{ entity.contactPerson }}</q-tooltip>
                        </div>
                        <div class="text-caption text-grey-7 row items-center no-wrap q-gutter-x-xs">
                          <q-icon name="phone" size="12px" color="positive" />
                          <span>{{ entity.whatsapp || entity.phone || 'Sem telefone' }}</span>
                        </div>
                        <div class="m-tiny text-grey-7 row items-center no-wrap q-gutter-x-xs">
                          <q-icon name="mail" size="12px" color="blue-5" />
                          <span class="ellipsis">{{ entity.email || 'Sem e-mail' }}</span>
                          <q-tooltip>{{ entity.email }}</q-tooltip>
                        </div>
                      </CaixaInfoMaster>
                    </div>

                    <!-- Box 3: Escala de Recebimento & Beneficiários -->
                    <div class="col-12 col-sm-6 col-lg-4">
                      <CaixaInfoMaster icon="shopping_bag" icon-color="amber-9" title="Escala & Capacidade">
                        <div class="text-weight-bold text-amber-10 text-body2">
                          {{ entity.beneficiariesCount || 50 }} pessoas / famílias atendidas
                        </div>
                        <div class="text-caption text-grey-7">
                          Horário: <strong>{{ entity.operatingHours || (entity.receivingHoursStart ? `${entity.receivingHoursStart} às ${entity.receivingHoursEnd}` : '08:00 às 17:00') }}</strong>
                        </div>
                        <div class="m-tiny text-grey-7">
                          Dias: {{ entity.receivingDays?.join(', ') || 'Segunda a Sexta' }}
                        </div>
                      </CaixaInfoMaster>
                    </div>

                  </div>
                </div>
              </div>
            </q-card>
          </div>

        </div>
      </q-tab-panel>

      <!-- ========================================================================= -->
      <!-- TAB 5: CENTRAL DE TERMOS POR TIPO DE USUÁRIO                              -->
      <!-- ========================================================================= -->
      <q-tab-panel name="terms" class="m-container q-pa-md">
        <div class="column q-gutter-y-md">

          <div class="text-h6 text-weight-bold">Central de Termos de Adesão por Tipo de Usuário</div>

          <!-- Role Pill Filter Tabs -->
          <q-card flat bordered class="q-pa-xs">
            <div class="row items-center q-gutter-xs">
              <q-btn
                no-caps
                dense
                class="q-px-md text-weight-bold"
                :unelevated="selectedTermRole === 'all'"
                :flat="selectedTermRole !== 'all'"
                :color="selectedTermRole === 'all' ? 'amber-8' : 'grey-7'"
                :text-color="selectedTermRole === 'all' ? 'dark' : undefined"
                :label="`Todos os Termos (${allTerms.length})`"
                @click="selectedTermRole = 'all'"
              />

              <q-btn
                no-caps
                dense
                icon="shopping_bag"
                class="q-px-md text-weight-bold"
                :unelevated="selectedTermRole === 'client'"
                :flat="selectedTermRole !== 'client'"
                :color="selectedTermRole === 'client' ? 'positive' : 'grey-7'"
                label="1. Consumidor (LGPD & Fidelidade)"
                @click="selectedTermRole = 'client'"
              />

              <q-btn
                no-caps
                dense
                icon="storefront"
                class="q-px-md text-weight-bold"
                :unelevated="selectedTermRole === 'store'"
                :flat="selectedTermRole !== 'store'"
                :color="selectedTermRole === 'store' ? 'blue-7' : 'grey-7'"
                label="2. Estabelecimento (Sanitário & Doação)"
                @click="selectedTermRole = 'store'"
              />

              <q-btn
                no-caps
                dense
                icon="volunteer_activism"
                class="q-px-md text-weight-bold"
                :unelevated="selectedTermRole === 'institution'"
                :flat="selectedTermRole !== 'institution'"
                :color="selectedTermRole === 'institution' ? 'pink-6' : 'grey-7'"
                label="3. Entidade Social (Gov.br)"
                @click="selectedTermRole = 'institution'"
              />

              <q-btn
                no-caps
                dense
                icon="recycling"
                class="q-px-md text-weight-bold"
                :unelevated="selectedTermRole === 'disposal'"
                :flat="selectedTermRole !== 'disposal'"
                :color="selectedTermRole === 'disposal' ? 'teal-6' : 'grey-7'"
                label="4. Descarte (Compostagem)"
                @click="selectedTermRole = 'disposal'"
              />
            </div>
          </q-card>

          <!-- Search Bar -->
          <q-input
            v-model="termSearch"
            outlined
            dense
            clearable
            :bg-color="modoEscuro ? 'dark' : 'white'"
            placeholder="Filtrar por nome do assinante, CPF/CNPJ ou tipo de termo..."
          >
            <template #prepend>
              <q-icon name="search" size="18px" />
            </template>
          </q-input>

          <!-- Terms Cards -->
          <div class="column q-gutter-y-sm">
            <q-card
              v-for="term in filteredTerms"
              :key="term.id"
              flat
              bordered
            >
              <q-card-section class="q-gutter-y-sm">
                <div class="row items-center justify-between q-col-gutter-sm">
                  <div class="col-12 col-md column q-gutter-y-xs">
                    <div class="row items-center q-gutter-sm">
                      <q-badge :color="roleColor(term.userRole)" class="text-weight-bold text-uppercase">
                        {{ getRoleLabel(term.userRole) }}
                      </q-badge>
                      <div class="text-subtitle2 text-weight-bold">{{ term.termTitle }}</div>
                    </div>

                    <div class="row items-center q-gutter-x-md text-caption text-grey-7">
                      <span class="text-weight-medium">Titular: {{ term.userName }}</span>
                      <span class="m-mono">CPF/CNPJ: {{ term.cpfCnpj }}</span>
                      <span>E-mail: {{ term.userEmail }}</span>
                      <span>Aceite em: {{ new Date(term.acceptedAt).toLocaleString('pt-BR') }}</span>
                      <span>Origem: {{ term.ipAddress }}</span>
                    </div>
                  </div>

                  <!-- Action Buttons -->
                  <div class="col-12 col-md-auto row items-center q-gutter-sm">
                    <q-btn
                      v-if="term.signatureType === 'electronic_govbr'"
                      outline
                      no-caps
                      color="positive"
                      icon="open_in_new"
                      href="https://validar.iti.gov.br"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-weight-bold"
                    >
                      <span class="gt-xs q-ml-xs">Validar no ITI ↗</span>
                      <q-tooltip>Abrir Validador Oficial Gov.br (validar.iti.gov.br)</q-tooltip>
                    </q-btn>

                    <q-btn
                      unelevated
                      no-caps
                      color="amber-8"
                      text-color="dark"
                      icon="download"
                      label="Baixar Certidão (PDF)"
                      class="text-weight-bold"
                      @click="downloadTermPdf(term)"
                    />
                  </div>
                </div>

                <q-separator />

                <!-- Hash & Integrity Footer -->
                <div class="row items-center justify-between q-col-gutter-sm m-tiny">
                  <div class="m-mono text-grey-7 row items-center no-wrap q-gutter-x-xs ellipsis">
                    <span class="text-grey-5">Hash:</span>
                    <span class="ellipsis">{{ term.signatureHash }}</span>
                  </div>

                  <div class="row items-center q-gutter-x-sm">
                    <span class="text-grey-7">{{ term.notes }}</span>
                    <q-badge color="green-1" text-color="green-9" class="text-weight-bold">
                      <q-icon name="check" size="12px" class="q-mr-xs" />
                      <span>Homologado</span>
                    </q-badge>
                  </div>
                </div>
              </q-card-section>
            </q-card>
          </div>

        </div>
      </q-tab-panel>

      <!-- ========================================================================= -->
      <!-- TAB: RELATÓRIO MENSAL DE DESTINAÇÃO & SUSTENTABILIDADE (RN06)             -->
      <!-- ========================================================================= -->
      <q-tab-panel name="reports" class="m-container q-pa-md">
        <RelatorioMensalView mode="master" />
      </q-tab-panel>

      <!-- ========================================================================= -->
      <!-- TAB 7: CONFIGURAÇÕES DO MASTER (ALTERAR LOGIN E SENHA)                    -->
      <!-- ========================================================================= -->
      <q-tab-panel name="settings" class="m-container q-pa-md">
        <div class="column q-gutter-y-md">
          <div class="row items-center">
            <q-btn
              outline
              no-caps
              dense
              color="grey-7"
              icon="arrow_back"
              label="Voltar à Visão Geral"
              class="q-px-sm text-weight-bold"
              @click="activeTab = 'overview'"
            />
          </div>

          <div class="text-center">
            <div class="m-icon-box m-tone-amber text-amber-9 inline-block q-mb-sm">
              <q-icon name="vpn_key" size="26px" />
            </div>
            <div class="text-h6 text-weight-bold">Credenciais do Administrador Master</div>
            <div class="text-caption text-grey-7">
              Altere seu nome de usuário (login) e defina uma nova senha de superadministrador.
            </div>
          </div>

          <q-banner v-if="settingsSuccess" dense rounded class="m-tone-green text-positive text-center text-weight-bold">
            ✓ Credenciais do Master atualizadas com sucesso no banco de dados!
          </q-banner>

          <div class="m-config-grid">
          <q-card flat bordered>
            <q-form class="q-pa-lg column q-gutter-y-md" @submit.prevent="saveMasterSettings">

              <!-- Username / Login -->
              <q-input
                v-model="settingsUsername"
                outlined
                dense
                label="Nome de Usuário (Login)"
                placeholder="admin"
                hint="Este é o usuário que você digita na tela de login."
                input-class="m-mono text-weight-bold"
                lazy-rules
                :rules="[(v) => !!v || 'Informe o nome de usuário']"
              >
                <template #prepend>
                  <q-icon name="workspace_premium" color="amber-8" size="20px" />
                </template>
              </q-input>

              <!-- Email -->
              <q-input
                v-model="settingsEmail"
                type="email"
                outlined
                dense
                label="E-mail Administrativo"
                placeholder="admin@saveall.com"
              >
                <template #prepend>
                  <q-icon name="mail" size="20px" />
                </template>
              </q-input>

              <!-- Nova Senha -->
              <q-input
                v-model="settingsNewPassword"
                type="password"
                outlined
                dense
                label="Nova Senha (deixe em branco se não quiser alterar)"
                placeholder="Digite a nova senha (ex: admin123)"
              >
                <template #prepend>
                  <q-icon name="lock" size="20px" />
                </template>
              </q-input>

              <!-- Confirmar Senha -->
              <q-input
                v-if="settingsNewPassword"
                v-model="settingsConfirmPassword"
                type="password"
                outlined
                dense
                label="Confirmar Nova Senha"
                placeholder="Repita a nova senha"
              >
                <template #prepend>
                  <q-icon name="check_circle" color="positive" size="20px" />
                </template>
              </q-input>

              <!-- Save Button -->
              <q-btn
                id="btn-save-master-creds"
                type="submit"
                unelevated
                no-caps
                color="amber-8"
                text-color="dark"
                class="full-width text-weight-bold text-uppercase"
                label="Salvar Novas Credenciais Master"
              />
            </q-form>
          </q-card>

          <!-- WhatsApp: mensagens prontas para estabelecimentos e clientes -->
          <q-card flat bordered>
            <q-card-section class="q-pa-lg column q-gutter-y-md">
              <ConfiguracaoWhatsapp ref="configuracaoWhatsappRef" />
              <q-btn
                id="btn-save-master-whatsapp"
                unelevated
                no-caps
                color="positive"
                icon="check"
                class="full-width text-weight-bold"
                label="Salvar WhatsApp"
                type="button"
                @click="salvarWhatsappMaster"
              />
            </q-card-section>
          </q-card>
          </div>

        </div>
      </q-tab-panel>

    </q-tab-panels>

    <EnviarWhatsappDialog v-model="mostrarWhatsapp" :destinatario="destinatarioWhatsapp" />

    <!-- ========================================================================= -->
    <!-- MODAL: CRIAR / EDITAR USUÁRIO                                             -->
    <!-- ========================================================================= -->
    <q-dialog v-model="showUserModal" persistent>
      <q-card v-if="editingUser" class="m-dialog-card">
        <q-card-section class="row items-center no-wrap q-gutter-x-sm">
          <div class="m-icon-box m-tone-blue text-blue-7">
            <q-icon name="group" size="18px" />
          </div>
          <div class="col">
            <div class="text-subtitle1 text-weight-bold">
              {{ editingUser.id ? 'Editar Usuário' : 'Novo Usuário' }}
            </div>
            <div class="text-caption text-grey-7">
              Altere dados cadastrais, perfil de acesso e privilégios.
            </div>
          </div>
          <q-btn flat round dense icon="close" color="grey-7" @click="showUserModal = false" />
        </q-card-section>
        <q-separator />

        <q-card-section class="m-dialog-scroll q-gutter-y-md">
          <q-input
            v-model="editingUser.name"
            outlined
            dense
            stack-label
            label="Nome Completo / Razão Social"
            placeholder="Ex: João da Silva"
          />

          <div class="row q-col-gutter-sm">
            <div class="col-12 col-sm-6">
              <q-input
                v-model="editingUser.email"
                type="email"
                outlined
                dense
                stack-label
                label="E-mail"
                placeholder="usuario@email.com"
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-select
                v-model="editingUser.role"
                outlined
                dense
                stack-label
                emit-value
                map-options
                label="Perfil de Acesso (Role)"
                :options="[
                  { value: 'client', label: 'Cliente / Consumidor' },
                  { value: 'store', label: 'Loja / Padaria' },
                  { value: 'institution', label: 'Entidade Social' },
                  { value: 'disposal', label: 'Unidade de Descarte' },
                  { value: 'master', label: 'Administrador Master' }
                ]"
              />
            </div>
          </div>

          <div class="row q-col-gutter-sm">
            <div class="col-12 col-sm-6">
              <q-input
                v-model="editingUser.cpfCnpj"
                outlined
                dense
                stack-label
                label="CPF ou CNPJ"
                placeholder="000.000.000-00"
                input-class="m-mono"
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-input
                v-model.number="editingUser.points"
                type="number"
                outlined
                dense
                stack-label
                label="Pontos de Sustentabilidade"
              />
            </div>
          </div>

          <q-input
            v-model="editingUser.address"
            outlined
            dense
            stack-label
            label="Endereço Completo"
            placeholder="Rua, Número, Bairro, Cidade - UF"
          />

          <div class="m-subpanel rounded-borders q-pa-sm row items-center q-gutter-md">
            <q-checkbox v-model="editingUser.verificado" dense color="positive" label="Selo de Verificado" class="text-weight-medium" />
            <q-checkbox v-model="editingUser.suspenso" dense color="negative" label="Suspenso do Sistema" class="text-weight-medium text-negative" />
          </div>
        </q-card-section>

        <q-separator />
        <q-card-actions align="right" class="q-pa-md q-gutter-x-sm">
          <q-btn outline no-caps color="grey-7" label="Cancelar" class="text-weight-bold" @click="showUserModal = false" />
          <q-btn unelevated no-caps color="blue-7" icon="check_circle" label="Salvar Usuário" class="text-weight-bold" @click="saveUserModal" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ========================================================================= -->
    <!-- MODAL: CRIAR / EDITAR ESTABELECIMENTO                                     -->
    <!-- ========================================================================= -->
    <q-dialog v-model="showStoreModal" persistent>
      <q-card v-if="editingStore" class="m-dialog-card">
        <q-card-section class="row items-center no-wrap q-gutter-x-sm">
          <div class="m-icon-box m-tone-amber text-amber-9">
            <q-icon name="storefront" size="18px" />
          </div>
          <div class="col">
            <div class="text-subtitle1 text-weight-bold">
              {{ editingStore.id ? 'Editar Estabelecimento' : 'Novo Estabelecimento' }}
            </div>
            <div class="text-caption text-grey-7">
              {{ editingStore.id ? 'Atualize o nome, categoria, nota pública e endereço.' : 'Preencha os dados do novo estabelecimento.' }}
            </div>
          </div>
          <q-btn flat round dense icon="close" color="grey-7" @click="showStoreModal = false" />
        </q-card-section>
        <q-separator />

        <q-card-section class="m-dialog-scroll q-gutter-y-md">
          <q-input
            v-model="editingStore.name"
            outlined
            dense
            stack-label
            label="Nome da Padaria / Estabelecimento"
            placeholder="Ex: Panificadora & Confeitaria Central"
          />

          <div class="row q-col-gutter-sm">
            <div class="col-12 col-sm-6">
              <q-input
                v-model="editingStore.category"
                outlined
                dense
                stack-label
                label="Categoria"
                placeholder="Padaria, Confeitaria..."
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-input
                v-model.number="editingStore.rating"
                type="number"
                step="0.1"
                min="0"
                max="5"
                outlined
                dense
                stack-label
                label="Nota de Avaliação (0.0 a 5.0)"
                placeholder="Ex: 5.0"
              />
            </div>
          </div>

          <q-input
            v-model="editingStore.address"
            outlined
            dense
            stack-label
            label="Endereço Comercial"
            placeholder="Avenida República, 1420 - Centro"
          />

          <q-input
            v-model="editingStore.logo"
            outlined
            dense
            stack-label
            label="URL do Logo / Foto da Fachada"
            placeholder="Opcional: endereço (URL) da imagem"
          />
        </q-card-section>

        <q-separator />
        <q-card-actions align="right" class="q-pa-md q-gutter-x-sm">
          <q-btn outline no-caps color="grey-7" label="Cancelar" class="text-weight-bold" @click="showStoreModal = false" />
          <q-btn unelevated no-caps color="amber-8" text-color="dark" icon="check_circle" label="Salvar Estabelecimento" class="text-weight-bold" @click="saveStoreModal" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ========================================================================= -->
    <!-- MODAL: CRIAR / EDITAR ENTIDADE SOCIAL                                     -->
    <!-- ========================================================================= -->
    <q-dialog v-model="showEntityModal" persistent>
      <q-card v-if="editingEntity" class="m-dialog-card">
        <q-card-section class="row items-center no-wrap q-gutter-x-sm">
          <div class="m-icon-box m-tone-red text-pink-6">
            <q-icon name="volunteer_activism" size="18px" />
          </div>
          <div class="col">
            <div class="text-subtitle1 text-weight-bold">
              {{ editingEntity.id ? 'Editar Entidade Social' : 'Cadastrar Nova Entidade Social' }}
            </div>
            <div class="text-caption text-grey-7">
              Gerencie ONGs parceiras receptoras de doações.
            </div>
          </div>
          <q-btn flat round dense icon="close" color="grey-7" @click="showEntityModal = false" />
        </q-card-section>
        <q-separator />

        <q-card-section class="m-dialog-scroll q-gutter-y-md">
          <q-input
            v-model="editingEntity.name"
            outlined
            dense
            stack-label
            label="Razão Social / Nome da ONG"
            placeholder="Ex: Associação de Apoio Social"
          />

          <div class="row q-col-gutter-sm">
            <div class="col-12 col-sm-6">
              <q-input
                v-model="editingEntity.cnpj"
                outlined
                dense
                stack-label
                label="CNPJ"
                placeholder="00.000.000/0001-00"
                input-class="m-mono"
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-input
                v-model="editingEntity.responsibleName"
                outlined
                dense
                stack-label
                label="Responsável Legal"
                placeholder="Nome do coordenador"
              />
            </div>
          </div>

          <div class="row q-col-gutter-sm">
            <div class="col-12 col-sm-6">
              <q-input
                v-model="editingEntity.phone"
                outlined
                dense
                stack-label
                label="WhatsApp de Notificação"
                placeholder="(49) 99999-9999"
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-input
                v-model="editingEntity.email"
                type="email"
                outlined
                dense
                stack-label
                label="E-mail"
                placeholder="ong@email.org"
              />
            </div>
          </div>

          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <q-input
                v-model="editingEntity.receivingHoursStart"
                type="time"
                outlined
                dense
                stack-label
                label="Horário Início"
              />
            </div>
            <div class="col-6">
              <q-input
                v-model="editingEntity.receivingHoursEnd"
                type="time"
                outlined
                dense
                stack-label
                label="Horário Término"
              />
            </div>
          </div>

          <q-input
            v-model="editingEntity.address"
            outlined
            dense
            stack-label
            label="Endereço da Sede"
            placeholder="Rua, Número, Bairro, Cidade - UF"
          />
        </q-card-section>

        <q-separator />
        <q-card-actions align="right" class="q-pa-md q-gutter-x-sm">
          <q-btn outline no-caps color="grey-7" label="Cancelar" class="text-weight-bold" @click="showEntityModal = false" />
          <q-btn unelevated no-caps color="pink-6" icon="check_circle" label="Salvar Entidade" class="text-weight-bold" @click="saveEntityModal" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ========================================================================= -->
    <!-- MODAL: DECISÃO MASTER (ACEITAR / RECUSAR ENTIDADE + WHATSAPP & E-MAIL)    -->
    <!-- ========================================================================= -->
    <q-dialog v-model="showDecisionModal" persistent>
      <q-card v-if="decisionEntity" class="m-dialog-card m-dialog-card--lg">

        <!-- Modal Header -->
        <q-card-section class="row items-start no-wrap">
          <div class="col q-gutter-y-xs">
            <div class="row items-center q-gutter-x-sm">
              <q-badge
                :color="decisionMode === 'accept' ? 'green-1' : 'red-1'"
                :text-color="decisionMode === 'accept' ? 'green-9' : 'red-9'"
                class="text-weight-bold text-uppercase"
              >
                {{ decisionMode === 'accept' ? '✓ Homologar & Aceitar' : '✕ Recusar Credenciamento' }}
              </q-badge>
              <span class="text-caption m-mono text-grey-7">#{{ decisionEntity.id.toUpperCase() }}</span>
            </div>
            <div class="text-subtitle1 text-weight-bold">
              {{ decisionMode === 'accept' ? `Aprovar Credenciamento: ${decisionEntity.name}` : `Recusar Credenciamento: ${decisionEntity.name}` }}
            </div>
          </div>
          <q-btn flat round dense icon="close" color="grey-7" @click="showDecisionModal = false" />
        </q-card-section>
        <q-separator />

        <q-card-section class="m-dialog-scroll q-gutter-y-md">

          <!-- Entity Summary Ribbon -->
          <div class="m-subpanel rounded-borders q-pa-sm row q-col-gutter-sm">
            <div class="col-6 col-sm-4">
              <div class="m-tiny text-grey-7">Entidade</div>
              <div class="text-weight-bold text-caption ellipsis">{{ decisionEntity.name }}</div>
            </div>
            <div class="col-6 col-sm-4">
              <div class="m-tiny text-grey-7">CNPJ</div>
              <div class="text-weight-bold text-caption m-mono">{{ decisionEntity.cnpj }}</div>
            </div>
            <div class="col-6 col-sm-4">
              <div class="m-tiny text-grey-7">Responsável</div>
              <div class="text-weight-bold text-caption ellipsis">{{ decisionEntity.contactPerson || decisionEntity.responsibleName || 'Não informado' }}</div>
            </div>
            <div class="col-6 col-sm-4">
              <div class="m-tiny text-grey-7">WhatsApp</div>
              <div class="text-weight-bold text-caption text-positive m-mono">{{ decisionEntity.whatsapp || decisionEntity.phone || 'Não informado' }}</div>
            </div>
            <div class="col-6 col-sm-4">
              <div class="m-tiny text-grey-7">E-mail</div>
              <div class="text-weight-bold text-caption ellipsis">{{ decisionEntity.email || 'Não informado' }}</div>
            </div>
            <div class="col-6 col-sm-4">
              <div class="m-tiny text-grey-7">Cidade / UF</div>
              <div class="text-weight-bold text-caption">{{ decisionEntity.city }}/{{ decisionEntity.state || 'SC' }}</div>
            </div>
          </div>

          <!-- If Reject Mode: Reason Input with presets -->
          <div v-if="decisionMode === 'reject'" class="m-tone-red rounded-borders q-pa-sm q-gutter-y-sm">
            <div class="row items-center justify-between text-caption">
              <span class="text-weight-bold text-negative">Motivo da Não Aprovação / Ajustes Necessários:</span>
              <span class="m-tiny text-grey-7">Aparecerá automaticamente nas mensagens</span>
            </div>

            <!-- Preset chips -->
            <div class="row items-center q-gutter-xs">
              <q-chip
                clickable
                dense
                outline
                color="grey-7"
                label="Sem assinatura Gov.br"
                @click="decisionReason = 'Termo anexado sem assinatura digital Gov.br/ICP-Brasil válida.'; updateDecisionReason()"
              />
              <q-chip
                clickable
                dense
                outline
                color="grey-7"
                label="Divergência de CNPJ"
                @click="decisionReason = 'Divergência entre o CNPJ informado e o cadastro na Receita Federal.'; updateDecisionReason()"
              />
              <q-chip
                clickable
                dense
                outline
                color="grey-7"
                label="PDF Ilegível"
                @click="decisionReason = 'Arquivo PDF ilegível ou corrompido. Solicitamos reenvio do termo.'; updateDecisionReason()"
              />
              <q-chip
                clickable
                dense
                outline
                color="grey-7"
                label="Horário incompatível"
                @click="decisionReason = 'Horários declarados incompatíveis com a escala de perecibilidade de panificação.'; updateDecisionReason()"
              />
            </div>

            <q-input
              :model-value="decisionReason"
              type="textarea"
              rows="2"
              outlined
              dense
              :bg-color="modoEscuro ? 'dark' : 'white'"
              placeholder="Digite o motivo específico da recusa..."
              @update:model-value="(v) => { decisionReason = v; updateDecisionReason() }"
            />
          </div>

          <!-- Notification Message Tabs -->
          <div class="column q-gutter-y-sm">
            <q-tabs
              v-model="activeMessageTab"
              dense
              no-caps
              inline-label
              align="left"
              active-color="primary"
              class="text-grey-7"
            >
              <q-tab name="whatsapp" icon="phone" label="Mensagem WhatsApp" />
              <q-tab name="email" icon="mail" label="Mensagem E-mail" />
            </q-tabs>
            <q-separator />

            <q-tab-panels v-model="activeMessageTab" class="bg-transparent">
              <!-- TAB CONTENT: WHATSAPP -->
              <q-tab-panel name="whatsapp" class="q-pa-none q-gutter-y-sm">
                <div class="m-subpanel rounded-borders q-pa-sm q-gutter-y-sm">
                  <div class="row items-center justify-between text-caption">
                    <span class="text-positive text-weight-medium row items-center q-gutter-x-xs">
                      <q-icon name="phone" size="14px" />
                      <span>Destinatário: {{ decisionEntity.whatsapp || decisionEntity.phone }} ({{ decisionEntity.contactPerson || decisionEntity.responsibleName }})</span>
                    </span>
                    <span class="m-tiny text-grey-7">Você pode editar antes de enviar</span>
                  </div>

                  <q-input
                    v-model="customWhatsAppText"
                    type="textarea"
                    rows="7"
                    outlined
                    dense
                    :bg-color="modoEscuro ? 'dark' : 'white'"
                  />
                </div>

                <!-- WhatsApp Actions -->
                <div class="row items-center justify-between q-col-gutter-sm">
                  <q-btn
                    outline
                    no-caps
                    color="grey-7"
                    :icon="copiedMsgType === 'whatsapp' ? 'check' : 'description'"
                    :label="copiedMsgType === 'whatsapp' ? 'Copiado com Sucesso!' : 'Copiar Texto WhatsApp'"
                    class="text-weight-bold"
                    @click="copyWhatsAppMessage"
                  />

                  <q-btn
                    unelevated
                    no-caps
                    color="positive"
                    icon="send"
                    label="Abrir WhatsApp com Mensagem Pronta"
                    class="text-weight-bold"
                    @click="sendWhatsAppMessage"
                  />
                </div>
              </q-tab-panel>

              <!-- TAB CONTENT: EMAIL -->
              <q-tab-panel name="email" class="q-pa-none q-gutter-y-sm">
                <div class="column q-gutter-y-sm">
                  <q-input
                    v-model="customEmailSubject"
                    outlined
                    dense
                    stack-label
                    :label="`Destinatário: ${decisionEntity.email || 'contato@entidade.org.br'}`"
                    placeholder="Assunto do e-mail..."
                    input-class="text-weight-medium"
                  />

                  <q-input
                    v-model="customEmailBody"
                    type="textarea"
                    rows="7"
                    outlined
                    stack-label
                    label="Corpo do E-mail"
                  />
                </div>

                <!-- Email Actions -->
                <div class="row items-center justify-between q-col-gutter-sm">
                  <q-btn
                    outline
                    no-caps
                    color="grey-7"
                    :icon="copiedMsgType === 'email' ? 'check' : 'description'"
                    :label="copiedMsgType === 'email' ? 'E-mail Copiado!' : 'Copiar Assunto e Corpo'"
                    class="text-weight-bold"
                    @click="copyEmailMessage"
                  />

                  <q-btn
                    unelevated
                    no-caps
                    color="blue-7"
                    icon="send"
                    label="Abrir no Cliente de E-mail (mailto:)"
                    class="text-weight-bold"
                    @click="sendEmailMessage"
                  />
                </div>
              </q-tab-panel>
            </q-tab-panels>
          </div>
        </q-card-section>

        <!-- Confirmation & Save Footer -->
        <q-separator />
        <q-card-actions align="between" class="q-pa-md">
          <q-btn outline no-caps color="grey-7" label="Cancelar" class="text-weight-bold" @click="showDecisionModal = false" />

          <q-btn
            unelevated
            no-caps
            :color="decisionMode === 'accept' ? 'positive' : 'negative'"
            :icon="decisionMode === 'accept' ? 'check_circle' : 'cancel'"
            :label="decisionMode === 'accept' ? 'Confirmar Homologação no Sistema' : 'Confirmar Recusa no Sistema'"
            class="text-weight-bold"
            @click="confirmDecisionInSystem"
          />
        </q-card-actions>

      </q-card>
    </q-dialog>

    <!-- ========================================================================= -->
    <!-- MODAL DE CONFIRMAÇÃO SEGURO (Substitui confirm/prompt bloqueados em iFrame) -->
    <!-- ========================================================================= -->
    <q-dialog v-model="confirmationModal.isOpen">
      <q-card class="m-dialog-card m-dialog-card--sm">
        <q-card-section class="row items-start no-wrap q-gutter-x-md">
          <div
            class="m-icon-box"
            :class="confirmationModal.type === 'danger' ? 'm-tone-red text-negative' : confirmationModal.type === 'info' ? 'm-tone-blue text-blue-7' : 'm-tone-amber text-amber-9'"
          >
            <q-icon
              :name="confirmationModal.type === 'danger' ? 'delete' : confirmationModal.type === 'info' ? 'check_circle' : 'warning_amber'"
              size="24px"
            />
          </div>

          <div class="col q-gutter-y-xs">
            <div class="text-subtitle1 text-weight-bold">
              {{ confirmationModal.title }}
            </div>
            <div class="text-caption text-grey-7">
              {{ confirmationModal.message }}
            </div>
            <div v-if="confirmationModal.detail" class="m-tiny text-grey-7 text-italic">
              {{ confirmationModal.detail }}
            </div>
          </div>
        </q-card-section>

        <!-- Optional Reason Input -->
        <q-card-section v-if="confirmationModal.requireReason" class="q-pt-none">
          <q-input
            v-model="confirmationModal.reasonText"
            type="textarea"
            rows="2"
            outlined
            dense
            stack-label
            label="Motivo / Justificativa da Moderação:"
            :placeholder="confirmationModal.reasonPlaceholder"
            @update:model-value="gerarAvisoDaConfirmacao"
          />
        </q-card-section>

        <!-- Aviso opcional para a entidade -->
        <q-card-section v-if="confirmationModal.notificar" class="q-pt-none q-gutter-y-sm">
          <q-toggle
            id="toggle-enviar-aviso-entidade"
            v-model="confirmationModal.enviarAviso"
            color="positive"
            label="Deseja enviar uma mensagem para a entidade avisando da desvinculação?"
          />
          <template v-if="confirmationModal.enviarAviso">
            <q-btn-toggle
              v-model="confirmationModal.canalAviso"
              no-caps
              unelevated
              spread
              toggle-color="positive"
              color="grey-3"
              text-color="grey-8"
              :options="[
                { label: 'WhatsApp', value: 'whatsapp', icon: 'chat' },
                { label: 'E-mail', value: 'email', icon: 'mail' }
              ]"
            />
            <q-banner
              v-if="confirmationModal.canalAviso === 'whatsapp' && !telefoneDoAviso"
              dense
              rounded
              class="bg-orange-1 text-orange-10 text-caption"
            >
              Esta entidade não tem um WhatsApp válido cadastrado. Escolha o e-mail ou corrija o cadastro.
            </q-banner>
            <q-banner
              v-if="confirmationModal.canalAviso === 'email' && !confirmationModal.notificar.entidade.email"
              dense
              rounded
              class="bg-orange-1 text-orange-10 text-caption"
            >
              Esta entidade não tem e-mail cadastrado. Escolha o WhatsApp ou corrija o cadastro.
            </q-banner>
            <q-input
              v-if="confirmationModal.canalAviso === 'whatsapp'"
              v-model="confirmationModal.avisoWhatsapp"
              type="textarea"
              rows="7"
              outlined
              dense
              stack-label
              label="Mensagem de WhatsApp (editável)"
              @update:model-value="confirmationModal.avisoEditado = true"
            />
            <template v-else>
              <q-input
                v-model="confirmationModal.avisoAssunto"
                outlined
                dense
                stack-label
                label="Assunto do e-mail"
                @update:model-value="confirmationModal.avisoEditado = true"
              />
              <q-input
                v-model="confirmationModal.avisoCorpo"
                type="textarea"
                rows="7"
                outlined
                dense
                stack-label
                label="Mensagem do e-mail (editável)"
                @update:model-value="confirmationModal.avisoEditado = true"
              />
            </template>
            <div class="text-caption text-grey-7">
              Ao confirmar, a entidade é desvinculada e o aplicativo de {{ confirmationModal.canalAviso === 'whatsapp' ? 'WhatsApp' : 'e-mail' }} abre com a mensagem pronta para você enviar.
            </div>
          </template>
        </q-card-section>

        <!-- Action buttons -->
        <q-separator />
        <q-card-actions align="right" class="q-pa-md q-gutter-x-sm">
          <q-btn
            outline
            no-caps
            color="grey-7"
            :label="confirmationModal.cancelText"
            class="text-weight-bold"
            @click="confirmationModal.isOpen = false"
          />

          <q-btn
            unelevated
            no-caps
            icon="check"
            :color="confirmationModal.type === 'danger' ? 'negative' : confirmationModal.type === 'info' ? 'blue-7' : 'amber-9'"
            :label="confirmationModal.confirmText"
            class="text-weight-bold"
            @click="executeConfirmation"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

  </q-page>
</template>

<style scoped lang="scss">
@use '../components/master/master-compartilhado.scss';

.painel-master {
  min-height: 100%;
}
.m-header {
  position: sticky;
  top: 0;
  z-index: 30;
  border-bottom: 1px solid rgba(128, 128, 128, 0.25);
}
// Conteúdo em largura total, com respiro lateral que cresce no monitor
.m-container {
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
}
@media (min-width: 1024px) {
  .m-container { padding-left: 24px !important; padding-right: 24px !important; }
}
// Configurações: uma coluna no celular, duas no notebook/monitor
.m-config-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
}
@media (min-width: 1024px) {
  .m-config-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.m-gear-ativa {
  background: rgba(255, 255, 255, 0.25);
}
.m-narrow {
  max-width: 576px;
  margin: 0 auto;
}
.m-icon-box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border-radius: 12px;
}
.m-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.m-clickable {
  cursor: pointer;
  transition: border-color 0.2s;
  &:hover {
    border-color: rgba(128, 128, 128, 0.7);
  }
}
.m-item {
  overflow: hidden;
}
.m-border-red {
  border-color: rgba(229, 57, 53, 0.35);
}
.m-subpanel {
  background: rgba(128, 128, 128, 0.07);
}
.m-rounded {
  border-radius: 12px;
  border: 1px solid rgba(128, 128, 128, 0.3);
  img {
    object-fit: cover;
  }
}
.m-ring-amber {
  box-shadow: 0 0 0 3px rgba(255, 167, 38, 0.4);
}
.m-chevron {
  transition: transform 0.3s;
  &--open {
    transform: rotate(180deg);
  }
}
.break-word {
  word-break: break-all;
}
.m-dialog-card {
  width: 512px;
  max-width: 94vw;
  border-radius: 16px;
  &--lg {
    width: 672px;
  }
  &--sm {
    width: 448px;
  }
}
.m-dialog-scroll {
  max-height: 70vh;
  overflow-y: auto;
}
.m-panels {
  :deep(.q-panel) {
    overflow: visible;
  }
}

.m-secao-titulo {
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.3);
}
</style>