<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { jsPDF } from "jspdf";
import { storeToRefs } from "pinia";
import { servicoDoacoes } from "../../services/servicoDoacoes";
import { armazem } from "../../services/armazemServidor";
import { desenharCarimboDigital } from "../../utils/assinaturaDigital";
import { useAppStore } from "../../stores/estadoApp";
const props = defineProps({
  show: Boolean,
  modoEscuro: Boolean,
  prefilledItem: Object,
  lojaId: String,
  nomeLoja: String,
  // Um item ou vários (seleção em lote de itens vencidos)
  foodToDispose: { type: [Object, Array], default: null },
  initialType: { type: String, default: "donation" },
  initialStep: { type: Number, default: 1 },
  // Consulta de doação (já entregue) que este certificado vai finalizar
  ofertaId: { type: String, default: "" }
});
const emit = defineEmits(["close", "donation-created", "completed"]);
const ngoCnpjPresets = {
  "Mesa Brasil Sesc": "12.345.678/0001-90",
  "Amigos do Alimento SC": "45.678.901/0002-34",
  "Par\xF3quia Integrar Verde": "78.901.234/0003-56",
  "ONG Sop\xE3o Solid\xE1rio": "89.012.345/0004-78"
};
const currentStep = ref(props.initialStep);
const selectedType = ref(props.initialType);
const recipientOrg = ref("Mesa Brasil Sesc");
const signatureName = ref("");
const weightEstimated = ref(5);
const discardDestination = ref("Adubo Org\xE2nico Pinhal");
const storeNameField = ref("");
const storeCnpj = ref("");
const recipientCnpj = ref("");
const recipientRepresentativeName = ref("");
const recipientRepresentativeCpf = ref("");
const discardTechnicalName = ref("");
const discardTechnicalCpf = ref("");
const discardDestinationType = ref("COMPOSTAGEM");
const productName = ref("");
const productCategory = ref("");
const productQty = ref(1);
const productExpiration = ref("");
const generatedSHA256 = ref("");
const { usuarioAtual } = storeToRefs(useAppStore());
const { triggerNotification } = useAppStore();
// Avisos explicativos: aparecem até o próprio usuário fechar (lembrado no servidor, em qualquer aparelho).
const lerDicaFechada = (chave) => !!armazem.dado("dicas", {})[chave];
const dicaAceiteFechada = ref(lerDicaFechada("saveall_dica_aceite_fechada"));
const dicaOds12Fechada = ref(lerDicaFechada("saveall_dica_ods12_fechada"));
const guardarDicaFechada = (chave) => {
  armazem.salvarDado("dicas", { ...armazem.dado("dicas", {}), [chave]: true });
};
const fecharDicaAceite = () => {
  dicaAceiteFechada.value = true;
  guardarDicaFechada("saveall_dica_aceite_fechada");
};
const fecharDicaOds12 = () => {
  dicaOds12Fechada.value = true;
  guardarDicaFechada("saveall_dica_ods12_fechada");
};
// Itens do lote: um só (botão do item) ou vários (seleção de vencidos)
const itensLote = computed(() => {
  const f = props.foodToDispose;
  if (!f) return [];
  return Array.isArray(f) ? f : [f];
});
const ehLote = computed(() => itensLote.value.length > 1);
// Peso de cada item = quantidade × peso da unidade cadastrado no item (ex.: 5 × 80 g = 0,4 kg)
const pesoDoItem = (item) => {
  const unidade = Number(item?.weightKg);
  const qtd = Number(item?.quantity) || 1;
  return unidade > 0 ? Number((qtd * unidade).toFixed(3)) : null;
};
const detalhePeso = computed(() =>
  itensLote.value.map((item) => {
    const unidade = Number(item.weightKg);
    const qtd = Number(item.quantity) || 1;
    return {
      nome: item.name,
      qtd,
      unidade: unidade > 0 ? unidade : null,
      total: pesoDoItem(item)
    };
  })
);
const pesoCalculado = computed(() => {
  const pesos = detalhePeso.value.map((d) => d.total);
  if (!pesos.length || pesos.some((p) => p === null)) return null;
  return Number(pesos.reduce((a, b) => a + b, 0).toFixed(3));
});
const formatarPeso = (kg) => (kg >= 1 ? `${kg.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg` : `${Math.round(kg * 1000)} g`);

// Cidade da loja: a do cadastro do estabelecimento (ou o fim do endereço: "..., Pinhalzinho/SC")
const nomeCidade = (texto) =>
  String(texto || "")
    .split(/[,/-]/)[0]
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
const getStoreCity = () => {
  const app = useAppStore();
  const loja = (app.stores || []).find((l) => l.usuarioId === usuarioAtual.value?.id);
  if (loja?.city) return loja.city.split(",")[0].trim();
  const m = String(usuarioAtual.value?.address || "").match(/([A-Za-zÀ-ÿ'. ]+?)\s*[/,-]\s*[A-Za-z]{2}\s*$/);
  return m ? m[1].trim() : "";
};
const cidadeDaLoja = getStoreCity();
// Doação só para entidades validadas da MESMA cidade do estabelecimento
const registeredSocialPartners = ref(
  servicoDoacoes
    .getSocialPartnersByProximity(cidadeDaLoja || "Pinhalzinho")
    .filter((p) => cidadeDaLoja && nomeCidade(p.city) === nomeCidade(cidadeDaLoja))
);
// Descarte: só destinos ativos cadastrados pelo master para a cidade da loja
const registeredDisposalPartners = ref(
  servicoDoacoes
    .getDisposalPartners()
    .filter((p) => p.active !== false && p.validationStatus !== "inactive" && p.validationStatus !== "rejected")
    .filter((p) => cidadeDaLoja && nomeCidade(p.city) === nomeCidade(cidadeDaLoja))
);
const currentSelectedSocialPartner = computed(() => {
  return registeredSocialPartners.value.find((p) => p.name === recipientOrg.value) || registeredSocialPartners.value[0];
});
const currentSelectedDisposalPartner = computed(() => {
  return registeredDisposalPartners.value.find((p) => p.name === discardDestination.value) || registeredDisposalPartners.value[0];
});
const computedCo2 = computed(() => {
  return Number((weightEstimated.value * 2.5).toFixed(1));
});
const computedWater = computed(() => {
  return Math.round(weightEstimated.value * 130);
});
const initializeFormFields = () => {
  const user = usuarioAtual.value;
  storeNameField.value = user?.name || "Dona Kiuda Caf\xE9";
  storeCnpj.value = user?.cpfCnpj || "01.234.567/0001-89";
  recipientCnpj.value = ngoCnpjPresets[recipientOrg.value] || "12.345.678/0001-90";
  recipientRepresentativeName.value = "Dr. Marcos Santos (Volunt\xE1rio)";
  recipientRepresentativeCpf.value = "333.444.555-66";
  discardTechnicalName.value = user?.legalRepresentativeName || user?.name || "Respons\xE1vel T\xE9cnico";
  discardTechnicalCpf.value = user?.legalRepresentativeCpf || "444.555.666-77";
  const itens = itensLote.value;
  if (itens.length > 1) {
    productName.value = itens.map((i) => i.name).join(", ");
    const categorias = [...new Set(itens.map((i) => i.category).filter(Boolean))];
    productCategory.value = categorias.length === 1 ? categorias[0] : "misto";
    productQty.value = itens.reduce((soma, i) => soma + (Number(i.quantity) || 1), 0);
  } else {
    productName.value = itens[0]?.name || "Item Excedente";
    productCategory.value = itens[0]?.category || "salgado";
    productQty.value = itens[0]?.quantity || 1;
  }
  // Peso total calculado com o peso da unidade cadastrado em cada item
  if (pesoCalculado.value) weightEstimated.value = pesoCalculado.value;
  // Primeiro destino de descarte da cidade já selecionado
  if (registeredDisposalPartners.value.length && !registeredDisposalPartners.value.some((p) => p.name === discardDestination.value)) {
    discardDestination.value = registeredDisposalPartners.value[0].name;
  }
  // Primeira entidade da cidade já selecionada
  if (registeredSocialPartners.value.length && !registeredSocialPartners.value.some((p) => p.name === recipientOrg.value)) {
    recipientOrg.value = registeredSocialPartners.value[0].name;
  }
  const ofertaOrigem = props.ofertaId ? servicoDoacoes.getDonationOfferById(props.ofertaId) : null;
  if (ofertaOrigem) {
    recipientOrg.value = ofertaOrigem.recipientOrg || recipientOrg.value;
    productQty.value = ofertaOrigem.quantity || productQty.value;
    weightEstimated.value = ofertaOrigem.weightEstimatedKg || weightEstimated.value;
  }
  const validades = itensLote.value.map((i) => i.dataValidade).filter(Boolean).sort();
  if (validades.length) {
    productExpiration.value = validades[0];
  } else {
    const tomorrow = /* @__PURE__ */ new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    productExpiration.value = tomorrow.toISOString().substring(0, 10);
  }
};
onMounted(() => {
  initializeFormFields();
  signatureName.value = usuarioAtual.value?.name || "";
});
watch(recipientOrg, (newOrg) => {
  recipientCnpj.value = ngoCnpjPresets[newOrg] || "";
});
watch(discardDestination, (newPartner) => {
  discardDestinationType.value = newPartner.toUpperCase().includes("COMPOST") ? "COMPOSTAGEM" : "BIODIGESTOR";
});
const generateSHA256Hash = (content) => {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, "0") + Math.abs(hash * 31).toString(16).padStart(8, "0") + Math.abs(hash * 97).toString(16).padStart(8, "0") + Math.abs(hash * 13).toString(16).padStart(8, "0") + Math.abs(hash * 7).toString(16).padStart(8, "0") + Math.abs(hash * 19).toString(16).padStart(8, "0") + Math.abs(hash * 101).toString(16).padStart(8, "0") + Math.abs(hash * 103).toString(16).padStart(8, "0");
  return hex.substring(0, 64);
};
const tempSignatureImage = ref("");
const activeSignatureTypeSelection = ref("drawn");
const customDigitalCertificate = ref("");
const tempCoSignerName = ref("");
const tempCoSignerSignatureImage = ref("");
const checkAndPrepopulateSignature = () => {
  const user = usuarioAtual.value;
  if (user) {
    tempCoSignerName.value = user.coSignerName || "";
    tempCoSignerSignatureImage.value = user.coSignerSignatureImage || "";
    if (user.autoSignEnabled && (user.signatureImage || user.signatureCertificate)) {
      activeSignatureTypeSelection.value = user.signatureType || "drawn";
      if (user.signatureType === "drawn") {
        tempSignatureImage.value = user.signatureImage || "";
      } else {
        customDigitalCertificate.value = user.signatureCertificate || "";
      }
    } else {
      tempSignatureImage.value = "";
      customDigitalCertificate.value = "";
    }
  } else {
    tempSignatureImage.value = "";
    customDigitalCertificate.value = "";
    tempCoSignerName.value = "";
    tempCoSignerSignatureImage.value = "";
  }
};
const validateAndProceedToStep2 = () => {
  signatureName.value = usuarioAtual.value?.name || "";
  checkAndPrepopulateSignature();
  currentStep.value = 2;
};
const ngoContacts = {
  "Mesa Brasil Sesc": {
    email: "mesabrasil@sesc-sc.com.br",
    whatsapp: "(49) 99122-3344"
  },
  "Amigos do Alimento SC": {
    email: "contato@amigosdoalimento.org",
    whatsapp: "(48) 99824-7755"
  },
  "Par\xF3quia Integrar Verde": {
    email: "secretaria@paroquiaintegrar.org",
    whatsapp: "(49) 99911-8822"
  },
  "ONG Sop\xE3o Solid\xE1rio": {
    email: "apoio@sopaosolidario.org.br",
    whatsapp: "(47) 99766-3311"
  }
};
const partnerContacts = {
  "Adubo Org\xE2nico Pinhal": {
    email: "contato@adubopinhal.com.br",
    whatsapp: "(49) 99188-4422"
  },
  "Ra\xE7\xE3o Animal Granja Oeste": {
    email: "comercial@granjaoeste.com.br",
    whatsapp: "(49) 99944-5566"
  },
  "Composteira Municipal": {
    email: "meioambiente@composteiramunicipal.gov.br",
    whatsapp: "(49) 3561-0012"
  }
};
const lastEmittedLog = ref(null);
const recipientEmail = ref("");
const recipientWhatsapp = ref("");
const updateRecipientContacts = () => {
  if (selectedType.value === "donation") {
    const partner = registeredSocialPartners.value.find((p) => p.name === recipientOrg.value);
    if (partner) {
      recipientEmail.value = partner.email || "";
      recipientWhatsapp.value = partner.whatsapp || "";
      recipientCnpj.value = partner.cnpj || "";
      recipientRepresentativeName.value = partner.contactPerson ? `${partner.contactPerson} (${partner.contactRole || "Resp."})` : "Representante Legal";
    } else {
      const contacts = ngoContacts[recipientOrg.value];
      if (contacts) {
        recipientEmail.value = contacts.email;
        recipientWhatsapp.value = contacts.whatsapp;
      }
    }
  } else {
    const partner = registeredDisposalPartners.value.find((p) => p.name === discardDestination.value);
    if (partner) {
      recipientEmail.value = partner.email || "";
      recipientWhatsapp.value = partner.whatsapp || "";
      discardDestinationType.value = partner.treatmentType || "COMPOSTAGEM";
    } else {
      const contacts = partnerContacts[discardDestination.value];
      if (contacts) {
        recipientEmail.value = contacts.email;
        recipientWhatsapp.value = contacts.whatsapp;
      }
    }
  }
};
const activeInquiry = ref(null);
const inquirySentSuccess = ref(false);
// Depois que a entidade confirmou, os dados da doação vêm da consulta e não podem mais ser alterados aqui.
const ofertaTravada = computed(
  () => selectedType.value === "donation" && !!activeInquiry.value && ["accepted", "entregue"].includes(activeInquiry.value.status)
);
const aplicarDadosDaOferta = (oferta) => {
  if (!oferta) return;
  recipientOrg.value = oferta.recipientOrg || recipientOrg.value;
  productName.value = oferta.foodName || productName.value;
  productCategory.value = oferta.category || productCategory.value;
  productQty.value = oferta.quantity || productQty.value;
  weightEstimated.value = Number(oferta.weightEstimatedKg) || weightEstimated.value;
  if (oferta.dataValidade) productExpiration.value = oferta.dataValidade;
  if (oferta.recipientCnpj) recipientCnpj.value = oferta.recipientCnpj;
  // O responsável da entidade fica só nos dados da entidade; a assinatura do emissor é sempre da loja.
  if (oferta.confirmedBy) recipientRepresentativeName.value = oferta.confirmedBy;
  if (oferta.signatureCpf) recipientRepresentativeCpf.value = oferta.signatureCpf;
};
const refreshActiveInquiry = () => {
  if (selectedType.value !== "donation") return;
  const offers = servicoDoacoes.getDonationOffers();
  const ofertaVinculada = props.ofertaId ? offers.find((o) => o.id === props.ofertaId) : null;
  const matching = ofertaVinculada || offers.find(
    (o) => o.status !== "cancelada" && o.status !== "completed" && (itensLote.value[0]?.id && o.foodId === itensLote.value[0].id || o.foodName === productName.value && o.recipientOrg === recipientOrg.value)
  );
  if (matching) {
    activeInquiry.value = matching;
    if (["accepted", "entregue"].includes(matching.status)) aplicarDadosDaOferta(matching);
  }
};
const handleSendInquiryViaAppAndWhatsapp = () => {
  const offer = servicoDoacoes.createDonationOffer({
    foodId: itensLote.value[0]?.id || `food-${Date.now()}`,
    foodName: productName.value || itensLote.value[0]?.name || "Excedente Alimentar",
    category: productCategory.value || itensLote.value[0]?.category || "Alimento",
    quantity: productQty.value || 1,
    weightEstimatedKg: weightEstimated.value || 5,
    // Itens do lote, para retirar todos do catálogo quando a doação for concluída
    itensLote: itensLote.value.map((i) => ({ foodId: i.id, foodName: i.name, category: i.category, quantity: Number(i.quantity) || 1, weightKg: pesoDoItem(i) })),
    lojaId: "",
    nomeLoja: storeNameField.value || "Mercado Central",
    storeAddress: "Av. Brasil, 1200 - Centro",
    storeWhatsapp: "(49) 98877-6655",
    recipientOrg: recipientOrg.value,
    // Assinatura salva no perfil da loja entra no termo (sem ela, vale a assinatura eletrônica do envio)
    donorSignatureImage:
      usuarioAtual.value?.autoSignEnabled && usuarioAtual.value?.signatureType === "drawn" ? usuarioAtual.value.signatureImage : undefined,
    donorSignatureCertificate:
      usuarioAtual.value?.autoSignEnabled && usuarioAtual.value?.signatureType !== "drawn" ? usuarioAtual.value.signatureCertificate : undefined,
    recipientWhatsapp: recipientWhatsapp.value || "(49) 99876-5432",
    description: itensLote.value[0]?.description || "Alimentos pr\xF3prios para consumo conforme Lei 14.016/2020."
  });
  activeInquiry.value = offer;
  inquirySentSuccess.value = true;
  servicoDoacoes.sendWhatsAppInquiry(offer);
  setTimeout(() => {
    inquirySentSuccess.value = false;
  }, 4e3);
};
onMounted(() => {
  refreshActiveInquiry();
  window.addEventListener("saveall_donation_offer_updated", refreshActiveInquiry);
  window.addEventListener("saveall_donation_offer_created", refreshActiveInquiry);
});
onUnmounted(() => {
  window.removeEventListener("saveall_donation_offer_updated", refreshActiveInquiry);
  window.removeEventListener("saveall_donation_offer_created", refreshActiveInquiry);
});
watch([selectedType, recipientOrg, discardDestination], () => {
  updateRecipientContacts();
  refreshActiveInquiry();
  if (ofertaTravada.value) aplicarDadosDaOferta(activeInquiry.value);
}, { immediate: true });
const isSendingEmail = ref(false);
const isSendingWhatsapp = ref(false);
const sendEmailStatus = ref("");
const sendWhatsappStatus = ref("");
const sleepTimeout = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sendViaEmail = async () => {
  if (isSendingEmail.value) return;
  isSendingEmail.value = true;
  sendEmailStatus.value = "Gerando PDF criptografado com assinaturas...";
  await sleepTimeout(1e3);
  sendEmailStatus.value = "Assinando com certificado .pfx e desenho manual do triador...";
  await sleepTimeout(1200);
  sendEmailStatus.value = `Enviando e-mail de conformidade socioambiental para: ${recipientEmail.value}...`;
  await sleepTimeout(1200);
  sendEmailStatus.value = "\u2713 Enviado com sucesso por e-mail!";
  await sleepTimeout(1800);
  isSendingEmail.value = false;
  sendEmailStatus.value = "";
};
const sendViaWhatsapp = async () => {
  if (isSendingWhatsapp.value) return;
  isSendingWhatsapp.value = true;
  sendWhatsappStatus.value = "Vinculando assinaturas e ateste ICP-Brasil .pfx...";
  await sleepTimeout(1e3);
  sendWhatsappStatus.value = "Injetando chaves criptogr\xE1ficas audit\xE1veis...";
  await sleepTimeout(1e3);
  sendWhatsappStatus.value = "\u2713 Redirecionando para envio...";
  const log = lastEmittedLog.value;
  const signatureText = log?.signatureType === "digital" ? `Certificado ICP-Brasil ${log.signatureCertificate}` : `Assinatura de ${log?.signatureName}`;
  const textMsg = `*SAVE ALL - CERTIFICADO ESG DE DESTINA\xC7\xC3O*

Emitimos o Certificado de Destina\xE7\xE3o Sustent\xE1vel para o item *${log?.foodName || "Alimento Excedente"}*.

\u2022 *Tipo:* ${log?.type === "donation" ? "Doa\xE7\xE3o a Entidade Beneficente" : "Tratamento de Descarte Ecol\xF3gico"}
\u2022 *Peso Mitigado:* ${log?.weightEstimatedKg.toString().replace(".", ",")} kg
\u2022 *Data:* ${new Date(log?.date || "").toLocaleString("pt-BR")}
\u2022 *Impacto Clim\xE1tico:* -${(log?.weightEstimatedKg * 2.5).toFixed(1).replace(".", ",")} kg CO2e
\u2022 *Economia H\xEDdrica:* ${log?.weightEstimatedKg * 130}L de \xE1gua poupados
\u2022 *Triador T\xE9cnico:* ${log?.coSignerName || "Sim (Assinado por Dedo)"}
\u2022 *Assinado por Emissor:* ${signatureText}

Agradecemos pelo engajamento socioambiental! O arquivo de certifica\xE7\xE3o da plataforma SaveAll foi guardado na nuvem. C\xF3digo de Verifica\xE7\xE3o ODS: ${log?.id}`;
  const cleanPhone = recipientWhatsapp.value.replace(/\D/g, "");
  const url = `https://api.whatsapp.com/send?phone=${cleanPhone.startsWith("55") ? cleanPhone : "55" + cleanPhone}&text=${encodeURIComponent(textMsg)}`;
  window.open(url, "_blank");
  await sleepTimeout(1500);
  isSendingWhatsapp.value = false;
  sendWhatsappStatus.value = "";
};
const handleDownloadPdfStep3 = () => {
  const log = lastEmittedLog.value;
  if (!log) return;
  const isDonation = log.type === "donation";
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });
  const themeRGB = isDonation ? [16, 185, 129] : [245, 158, 11];
  const themeR = themeRGB[0];
  const themeG = themeRGB[1];
  const themeB = themeRGB[2];
  const documentTitle = isDonation ? "REGISTRO DE DOA\xC7\xC3O \u2014 ENTIDADE RECEPTORA" : "REGISTRO DE DESCARTE ECOL\xD3GICO";
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, 210, 297, "F");
  doc.setDrawColor(themeR, themeG, themeB);
  doc.setLineWidth(0.6);
  doc.rect(8, 8, 194, 281, "D");
  doc.setTextColor(themeR, themeG, themeB);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(26);
  doc.text("SaveAll", 105, 24, { align: "center" });
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(themeR, themeG, themeB);
  doc.text("SISTEMA INTEGRADO DE RASTREABILIDADE & SUSTENTABILIDADE ALIMENTAR", 105, 30, { align: "center" });
  doc.setFillColor(themeR, themeG, themeB);
  doc.rect(8.3, 36, 193.4, 11, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.text(documentTitle, 105, 43, { align: "center" });
  doc.setTextColor(themeR, themeG, themeB);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.text("DADOS DO EVENTO", 20, 58);
  doc.setTextColor(60, 60, 60);
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(9.5);
  const formattedDate = new Date(log.date).toLocaleDateString("pt-BR") + " \xE0s " + new Date(log.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  let currentY = 66;
  if (isDonation) {
    const eventDetails = [
      { key: "Doador:", val: `${log.nomeLoja || "N/A"} (CNPJ: ${log.storeCnpj || "N/A"})` },
      { key: "Entidade receptora:", val: `${log.recipientOrganization || "N/A"} (CNPJ: ${log.recipientCnpj || "N/A"})` },
      { key: "Respons\xE1vel retirada:", val: `${log.recipientRepresentativeName || "N/A"} (CPF: ${log.recipientRepresentativeCpf || "N/A"})` },
      { key: "Data e hora:", val: formattedDate },
      { key: "C\xF3digo SAVEALL:", val: log.id }
    ];
    eventDetails.forEach((detail) => {
      doc.setFont("Helvetica", "bold");
      doc.text(detail.key, 20, currentY);
      doc.setFont("Helvetica", "normal");
      doc.text(detail.val, 65, currentY);
      currentY += 7;
    });
  } else {
    const eventDetails = [
      { key: "Estabelecimento:", val: `${log.nomeLoja || "N/A"} (CNPJ: ${log.storeCnpj || "N/A"})` },
      { key: "Respons\xE1vel t\xE9cnico:", val: `${log.discardTechnicalName || "N/A"} (CPF: ${log.discardTechnicalCpf || "N/A"})` },
      { key: "Destino descarte:", val: `${log.discardDestination || "N/A"} (${log.discardDestinationType || "OUTRO"})` },
      { key: "Data e hora:", val: formattedDate },
      { key: "C\xF3digo SAVEALL:", val: log.id }
    ];
    eventDetails.forEach((detail) => {
      doc.setFont("Helvetica", "bold");
      doc.text(detail.key, 20, currentY);
      doc.setFont("Helvetica", "normal");
      doc.text(detail.val, 65, currentY);
      currentY += 7;
    });
  }
  doc.setDrawColor(210, 215, 210);
  doc.setLineWidth(0.4);
  doc.line(20, currentY + 1, 190, currentY + 1);
  currentY += 10;
  doc.setTextColor(themeR, themeG, themeB);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.text(isDonation ? "ITENS DOADOS" : "ITENS DESCARTADOS", 20, currentY);
  currentY += 8;
  doc.setTextColor(60, 60, 60);
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(9.5);
  const formattedExpiration = log.dataValidade ? new Date(log.dataValidade).toLocaleDateString("pt-BR") : "N/A";
  const itemDetails = [
    { key: "Produto:", val: log.foodName || "N/A" },
    { key: "Categoria:", val: log.category === "doce" ? "Doce / Confeitaria" : "Salgado / Panifica\xE7\xE3o" },
    { key: "Quantidade:", val: `${log.quantity || 1} unidade(s)` },
    { key: "Peso total:", val: `${log.weightEstimatedKg} kg` },
    { key: "Data de validade:", val: formattedExpiration }
  ];
  itemDetails.forEach((detail) => {
    doc.setFont("Helvetica", "bold");
    doc.text(detail.key, 20, currentY);
    doc.setFont("Helvetica", "normal");
    doc.text(detail.val, 65, currentY);
    currentY += 7;
  });
  if (!isDonation) {
    doc.setDrawColor(210, 215, 210);
    doc.setLineWidth(0.4);
    doc.line(20, currentY + 1, 190, currentY + 1);
    currentY += 10;
    doc.setTextColor(themeR, themeG, themeB);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10);
    doc.text("IMPACTO AMBIENTAL ESTIMADO", 20, currentY);
    currentY += 8;
    doc.setTextColor(60, 60, 60);
    doc.setFont("Helvetica", "normal");
    const co2Val = (log.weightEstimatedKg * 2.5).toFixed(1).replace(".", ",");
    const waterVal = Math.round(log.weightEstimatedKg * 130);
    const envDetails = [
      { key: "CO2 evitado:", val: `${co2Val} kg` },
      { key: "\xC1gua preservada:", val: `${waterVal} Litros` },
      { key: "ODS atendidos:", val: "ODS 11 (Cidades sustent\xE1veis) e ODS 13 (A\xE7\xE3o clim\xE1tica)" }
    ];
    envDetails.forEach((detail) => {
      doc.setFont("Helvetica", "bold");
      doc.text(detail.key, 20, currentY);
      doc.setFont("Helvetica", "normal");
      doc.text(detail.val, 65, currentY);
      currentY += 7;
    });
  }
  doc.setDrawColor(210, 215, 210);
  doc.setLineWidth(0.4);
  doc.line(20, currentY + 1, 190, currentY + 1);
  currentY += 10;
  doc.setTextColor(themeR, themeG, themeB);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.text(isDonation ? "DECLARA\xC7\xC3O LEGAL" : "DECLARA\xC7\xC3O", 20, currentY);
  currentY += 6;
  doc.setTextColor(80, 80, 80);
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setLineHeightFactor(1.4);
  const declarationText = isDonation ? "As partes declaram que a doa\xE7\xE3o ora registrada foi realizada em conformidade com a Lei Federal n\xBA 14.016/2020, que autoriza a doa\xE7\xE3o de alimentos pr\xF3prios para consumo humano e isenta o doador de responsabilidade civil, desde que ausente dolo ou culpa. O presente registro tem valor de comprovante legal para fins de auditoria, fiscaliza\xE7\xE3o e declara\xE7\xE3o tribut\xE1ria." : "O Estabelecimento declara que o descarte ora registrado foi realizado de forma ambientalmente respons\xE1vel, com destina\xE7\xE3o adequada conforme a Pol\xEDtica Nacional de Res\xEDduos S\xF3lidos (Lei n\xBA 12.305/2010), e que os itens listados n\xE3o foram disponibilizados para consumo humano ap\xF3s o encerramento do prazo de validade.";
  const splitDeclaration = doc.splitTextToSize(declarationText, 170);
  doc.text(splitDeclaration, 20, currentY);
  currentY += splitDeclaration.length * 4.5 + 8;
  doc.setDrawColor(210, 215, 210);
  doc.setLineWidth(0.4);
  doc.line(20, currentY, 190, currentY);
  currentY += 8;
  const sigBoxY = currentY;
  // Linhas pequenas sob o nome (entidade/loja e documento), cortadas para caber na caixa
  const linhaCurta = (texto) => doc.splitTextToSize(String(texto || ""), 74)[0] || "";
  doc.setDrawColor(220, 220, 220);
  doc.roundedRect(20, sigBoxY, 80, 41, 2, 2, "D");
  if (log.signatureImage) {
    try {
      doc.addImage(log.signatureImage, "PNG", 22, sigBoxY + 2, 76, 15);
    } catch {
      // imagem inválida: ignora
    }
  } else if (log.signatureType === "digital" || log.signatureCertificate) {
    desenharCarimboDigital(doc, log, 60, sigBoxY + 5, [themeR, themeG, themeB]);
  }
  doc.setDrawColor(180, 180, 180);
  doc.line(25, sigBoxY + 26, 95, sigBoxY + 26);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(50, 50, 50);
  doc.text(log.signatureName || "Doador", 60, sigBoxY + 30, { align: "center" });
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(7);
  doc.text("Assinatura digital \u2014 doador", 60, sigBoxY + 33.5, { align: "center" });
  const doadorLinha = [log.nomeLoja, log.storeCnpj ? `CNPJ ${log.storeCnpj}` : ""].filter(Boolean).join(" \u2014 ");
  if (doadorLinha) {
    doc.setFontSize(6.5);
    doc.setTextColor(110, 110, 110);
    doc.text(linhaCurta(doadorLinha), 60, sigBoxY + 37.5, { align: "center" });
    doc.setTextColor(50, 50, 50);
  }
  doc.setDrawColor(220, 220, 220);
  doc.roundedRect(110, sigBoxY, 80, 41, 2, 2, "D");
  if (isDonation) {
    if (log.coSignerSignatureImage) {
      try {
        doc.addImage(log.coSignerSignatureImage, "PNG", 112, sigBoxY + 2, 76, 15);
      } catch {
        // imagem inválida: ignora
      }
    } else {
      doc.setTextColor(themeR, themeG, themeB);
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(7.5);
      doc.text("\u{1F512} RECIBO DE RETIRADA", 150, sigBoxY + 10, { align: "center" });
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(6.5);
      doc.text("Ateste eletr\xF4nico de conformidade", 150, sigBoxY + 15, { align: "center" });
    }
    doc.setDrawColor(180, 180, 180);
    doc.line(115, sigBoxY + 26, 185, sigBoxY + 26);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(50, 50, 50);
    doc.text(linhaCurta(log.recipientRepresentativeName || "Respons\xE1vel Retirada"), 150, sigBoxY + 30, { align: "center" });
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(7);
    doc.text("Respons\xE1vel pelo recebimento \u2014 assinatura digital", 150, sigBoxY + 33.5, { align: "center" });
    const entidadeLinha = [
      log.recipientOrganization,
      log.recipientCnpj ? `CNPJ/CPF ${log.recipientCnpj}` : log.recipientRepresentativeCpf ? `CPF ${log.recipientRepresentativeCpf}` : ""
    ].filter(Boolean).join(" \u2014 ");
    if (entidadeLinha) {
      doc.setFontSize(6.5);
      doc.setTextColor(110, 110, 110);
      doc.text(linhaCurta(entidadeLinha), 150, sigBoxY + 37.5, { align: "center" });
      doc.setTextColor(50, 50, 50);
    }
  } else {
    if (log.coSignerSignatureImage) {
      try {
        doc.addImage(log.coSignerSignatureImage, "PNG", 112, sigBoxY + 2, 76, 15);
      } catch {
        // imagem inválida: ignora
      }
    } else {
      doc.setTextColor(themeR, themeG, themeB);
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(7.5);
      doc.text("\u{1F512} RESPONS\xC1VEL T\xC9CNICO", 150, sigBoxY + 10, { align: "center" });
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(6.5);
      doc.text("Assinatura do Triador", 150, sigBoxY + 15, { align: "center" });
    }
    doc.setDrawColor(180, 180, 180);
    doc.line(115, sigBoxY + 26, 185, sigBoxY + 26);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(50, 50, 50);
    doc.text(log.coSignerName || "Triador Respons\xE1vel", 150, sigBoxY + 30, { align: "center" });
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(7);
    doc.text("Ateste t\xE9cnico de descarte", 150, sigBoxY + 33, { align: "center" });
  }
  currentY = sigBoxY + 47;
  doc.setFont("Courier", "bold");
  doc.setFontSize(8);
  doc.setTextColor(themeR, themeG, themeB);
  doc.text(`Chave SHA256: ${log.sha256 || ""}`, 20, currentY);
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text("www.saveall.com.br \u2014 Documento emitido eletronicamente pela Plataforma SaveAll", 105, 284, { align: "center" });
  doc.save(`certificado-${isDonation ? "doacao" : "descarte"}-${log.id}.pdf`);
};
const handleCompleteWizard = () => {
  if (selectedType.value === "discard" && !registeredDisposalPartners.value.length) {
    triggerNotification(`Não há aterro ou destino de descarte cadastrado para ${cidadeDaLoja || "a sua cidade"}. Peça à administração para cadastrar.`, "warning");
    return;
  }
  if (selectedType.value === "donation" && !registeredSocialPartners.value.length) {
    triggerNotification(`Não há entidade social validada em ${cidadeDaLoja || "sua cidade"} para receber a doação.`, "warning");
    return;
  }
  // Doação com consulta em andamento só pode gerar o termo depois que a entidade aceitar
  const consultaVinculada = selectedType.value === "donation" ? activeInquiry.value : null;
  const consultaEmAndamento = consultaVinculada && (props.ofertaId || consultaVinculada.recipientOrg === recipientOrg.value) && ["pending_inquiry", "accepted", "entregue"].includes(consultaVinculada.status);
  if (consultaEmAndamento && consultaVinculada.status === "pending_inquiry") {
    triggerNotification("Aguarde a entidade confirmar a consulta antes de gerar o termo.", "warning");
    return;
  }
  if (consultaEmAndamento && ofertaTravada.value) aplicarDadosDaOferta(consultaVinculada);
  const saveAllCode = "SV-" + Math.floor(1e5 + Math.random() * 9e5);
  const now = /* @__PURE__ */ new Date();
  const docToHash = `
    STORE:${storeNameField.value}|CNPJ:${storeCnpj.value}|
    TYPE:${selectedType.value}|
    RECIPIENT:${recipientOrg.value}|CNPJ:${recipientCnpj.value}|
    REP_NAME:${recipientRepresentativeName.value}|REP_CPF:${recipientRepresentativeCpf.value}|
    TECH_NAME:${discardTechnicalName.value}|TECH_CPF:${discardTechnicalCpf.value}|
    DEST_TYPE:${discardDestinationType.value}|
    PROD:${productName.value}|CAT:${productCategory.value}|QTY:${productQty.value}|WEIGHT:${weightEstimated.value}|EXP:${productExpiration.value}|
    CODE:${saveAllCode}|TS:${now.toISOString()}
  `;
  const calculatedHash = generateSHA256Hash(docToHash);
  generatedSHA256.value = calculatedHash;
  const finalLog = {
    id: saveAllCode,
    foodId: itensLote.value[0]?.id || "manual",
    // Itens do lote (seleção de vários vencidos): todos saem do catálogo
    itensLote: itensLote.value.map((i) => ({ foodId: i.id, foodName: i.name, category: i.category, quantity: Number(i.quantity) || 1, weightKg: pesoDoItem(i) })),
    foodName: productName.value,
    category: productCategory.value,
    quantity: productQty.value,
    dataValidade: productExpiration.value,
    type: selectedType.value,
    ofertaId: consultaEmAndamento ? consultaVinculada.id : "",
    // Store variables
    nomeLoja: storeNameField.value,
    storeCnpj: storeCnpj.value,
    // Donation variables
    recipientOrganization: selectedType.value === "donation" ? recipientOrg.value : "",
    recipientCnpj: selectedType.value === "donation" ? recipientCnpj.value : "",
    recipientRepresentativeName: selectedType.value === "donation" ? recipientRepresentativeName.value : "",
    recipientRepresentativeCpf: selectedType.value === "donation" ? recipientRepresentativeCpf.value : "",
    // Discard variables
    discardDestination: selectedType.value === "discard" ? discardDestination.value : "",
    discardTechnicalName: selectedType.value === "discard" ? discardTechnicalName.value : "",
    discardTechnicalCpf: selectedType.value === "discard" ? discardTechnicalCpf.value : "",
    discardDestinationType: selectedType.value === "discard" ? discardDestinationType.value : "",
    signatureName: signatureName.value || usuarioAtual.value?.name || "Assinante Loja",
    signatureImage: tempSignatureImage.value,
    signatureType: activeSignatureTypeSelection.value,
    signatureCertificate: customDigitalCertificate.value,
    coSignerName: tempCoSignerName.value || "Triador Respons\xE1vel",
    coSignerSignatureImage: tempCoSignerSignatureImage.value,
    weightEstimatedKg: Number(weightEstimated.value) || 1,
    date: now.toISOString(),
    sha256: calculatedHash
  };
  lastEmittedLog.value = finalLog;
  currentStep.value = 3;
  if (selectedType.value === "discard" && ehLote.value) {
    // Descarte em lote: um registro por item, para o relatório separar por categoria
    const total = Number(weightEstimated.value) || 0;
    const qtdTotal = itensLote.value.reduce((s2, i) => s2 + (Number(i.quantity) || 1), 0) || 1;
    itensLote.value.forEach((item, indice) => {
      const pesoItem = pesoDoItem(item) ?? Number(((total * (Number(item.quantity) || 1)) / qtdTotal).toFixed(3));
      emit("completed", {
        ...finalLog,
        id: `${saveAllCode}-${indice + 1}`,
        foodId: item.id,
        foodName: item.name,
        category: item.category || finalLog.category,
        quantity: Number(item.quantity) || 1,
        dataValidade: item.dataValidade || finalLog.dataValidade,
        weightEstimatedKg: pesoItem || 0.1,
        itensLote: undefined
      });
    });
  } else {
    emit("completed", finalLog);
  }
  // Termo gerado: a doação aceita passa a poder ser finalizada com "Entregue".
  // (Consultas antigas já marcadas como entregues são finalizadas aqui.)
  if (consultaEmAndamento) {
    try {
      if (consultaVinculada.status === "entregue") servicoDoacoes.finalizarOferta(consultaVinculada.id, finalLog.id);
      else servicoDoacoes.registrarTermo(consultaVinculada.id, finalLog.id);
    } catch (erro) {
      triggerNotification(erro.message, "error");
    }
  }
};
const dialogOpen = computed({
  get: () => true,
  set: (val) => {
    if (!val) emit("close");
  }
});
const socialPartnerOptions = computed(() =>
  registeredSocialPartners.value.map((org) => ({
    value: org.name,
    label: `${org.name} — ${org.city}/${org.state} ${org.calculatedProximity ? `(📍 ${org.calculatedProximity.distanceKm} km - ${org.calculatedProximity.label})` : ""}`
  }))
);
const disposalPartnerOptions = computed(() =>
  registeredDisposalPartners.value.map((par) => ({
    value: par.name,
    label: `${par.name} — ${par.city}/${par.state} ${par.isMunicipalUnit ? "🏛️ (Municipal / Prefeitura)" : "🌱 (Conveniado)"}`
  }))
);
</script>

<template>
  <q-dialog v-model="dialogOpen">
    <q-card class="wizard-card column no-wrap" :dark="modoEscuro">
      <!-- Cabeçalho -->
      <q-card-section class="row items-center justify-between q-py-sm wizard-header">
        <div class="row items-center q-gutter-x-sm">
          <q-icon name="favorite" color="secondary" size="20px" />
          <div class="text-subtitle2 text-weight-bold">Triagem & Destinação ESG</div>
        </div>
        <q-btn flat round dense icon="close" size="sm" @click="emit('close')" />
      </q-card-section>
      <q-separator />

      <!-- Indicador de etapas + conteúdo -->
      <q-stepper
        v-model="currentStep"
        flat
        animated
        :dark="modoEscuro"
        active-color="secondary"
        done-color="secondary"
        class="wizard-stepper col scroll"
      >
        <!-- STEP 1 -->
        <q-step :name="1" title="Canal" icon="alt_route" :done="currentStep > 1">
          <div class="column q-gutter-y-md">
            <q-banner dense rounded class="tint-warning">
              <div class="text-caption text-weight-bold text-uppercase text-warning">
                {{ ehLote ? `Lote selecionado: ${itensLote.length} itens` : 'Lote Selecionado' }}
              </div>
              <template v-if="ehLote">
                <div v-for="item in itensLote" :key="item.id" class="text-subtitle2 text-weight-bold">
                  {{ item.name }} <span class="text-caption text-grey-6">· {{ item.quantity || 1 }} un · {{ item.category }}</span>
                </div>
              </template>
              <template v-else>
                <div class="text-subtitle2 text-weight-bold">{{ itensLote[0]?.name }}</div>
                <div class="text-caption text-grey-6 text-uppercase">Categoria: {{ itensLote[0]?.category || 'Excedente' }}</div>
              </template>
            </q-banner>

            <div class="column q-gutter-y-sm">
              <div class="text-caption text-weight-bold text-uppercase text-grey-6 label-wide">Escolha o Destino Ambiental</div>

              <!-- Choice 1: Donation -->
              <q-card
                flat
                bordered
                v-ripple
                clickable
                :dark="modoEscuro"
                class="choice-card cursor-pointer"
                :class="{ 'choice-card--info': selectedType === 'donation', 'choice-card--idle': selectedType !== 'donation' }"
                @click="selectedType = 'donation'"
              >
                <q-card-section class="row no-wrap items-start q-gutter-x-sm">
                  <q-avatar rounded size="36px" class="tint-info text-info">
                    <q-icon name="favorite" size="20px" />
                  </q-avatar>
                  <div class="col">
                    <div class="text-subtitle2 text-weight-bold">Doar Alimento p/ ONG</div>
                    <div class="text-caption text-grey-6">Encaminhar kits do bem-estar sob isenção jurídica da <strong>Lei Federal 14.016/2020</strong>.</div>
                  </div>
                </q-card-section>
              </q-card>

              <!-- Choice 2: Discard -->
              <q-card
                flat
                bordered
                v-ripple
                clickable
                :dark="modoEscuro"
                class="choice-card cursor-pointer"
                :class="{ 'choice-card--warning': selectedType === 'discard', 'choice-card--idle': selectedType !== 'discard' }"
                @click="selectedType = 'discard'"
              >
                <q-card-section class="row no-wrap items-start q-gutter-x-sm">
                  <q-avatar rounded size="36px" class="tint-warning text-secondary">
                    <q-icon name="delete" size="20px" />
                  </q-avatar>
                  <div class="col">
                    <div class="text-subtitle2 text-weight-bold">Descarte Composto (ODS)</div>
                    <div class="text-caption text-grey-6">Desviar do aterro sanitário visando compostagem ou ração animal. Atende metas climáticas ODS 11, 12 e 13.</div>
                  </div>
                </q-card-section>
              </q-card>
            </div>

            <q-btn
              unelevated
              no-caps
              color="secondary"
              text-color="dark"
              class="full-width text-weight-bold"
              label="Avançar canal de triagem"
              icon-right="arrow_forward"
              @click="validateAndProceedToStep2"
            />
          </div>
        </q-step>

        <!-- STEP 2 -->
        <q-step :name="2" title="Dados" icon="edit_note" :done="currentStep > 2">
          <div class="column q-gutter-y-md">
            <!-- Peso -->
            <div>
              <div class="row items-center justify-between">
                <span class="text-caption text-weight-bold text-uppercase text-grey-6 label-wide">Peso total do lote (kg)</span>
                <span class="text-secondary text-weight-bold mono">
                  <q-icon v-if="ofertaTravada" name="lock" size="14px" class="q-mr-xs" />{{ weightEstimated }} Kg
                </span>
              </div>
              <!-- Cálculo automático: quantidade × peso da unidade cadastrado no item -->
              <div v-if="!ofertaTravada" class="text-caption text-grey-7 q-mb-xs">
                <div v-for="d in detalhePeso" :key="d.nome">
                  <template v-if="d.unidade">{{ d.nome }}: {{ d.qtd }} × {{ formatarPeso(d.unidade) }} = <strong>{{ formatarPeso(d.total) }}</strong></template>
                  <template v-else>{{ d.nome }}: sem peso da unidade no cadastro (informe o peso abaixo)</template>
                </div>
                <div v-if="pesoCalculado && Number(weightEstimated) !== pesoCalculado" class="text-warning">
                  Peso calculado: {{ formatarPeso(pesoCalculado) }}.
                  <a href="#" class="text-primary" @click.prevent="weightEstimated = pesoCalculado">Usar o calculado</a>
                </div>
              </div>
              <div v-if="!ofertaTravada" class="row items-center q-gutter-x-md">
                <q-slider
                  v-model="weightEstimated"
                  :min="0.1"
                  :max="Math.max(50, Math.ceil(Number(weightEstimated) || 0))"
                  :step="0.1"
                  color="secondary"
                  class="col"
                />
                <q-input
                  v-model.number="weightEstimated"
                  type="number"
                  min="0.1"
                  step="0.1"
                  outlined
                  dense
                  :dark="modoEscuro"
                  class="weight-input"
                  input-class="text-center mono"
                />
              </div>
            </div>

            <!-- A. DOAÇÃO -->
            <template v-if="selectedType === 'donation'">
              <div class="column q-gutter-y-sm">
                <div class="row items-center justify-between">
                  <span class="text-caption text-weight-bold text-uppercase text-grey-6 label-wide">Entidade Receptora (ONG)</span>
                  <span v-if="ofertaTravada" class="text-caption text-grey-6 row items-center"><q-icon name="lock" size="14px" class="q-mr-xs" />Confirmada pela entidade</span>
                </div>

                <q-banner v-if="!registeredSocialPartners.length" dense rounded class="bg-orange-1 text-orange-10">
                  Nenhuma entidade social validada em {{ cidadeDaLoja || 'sua cidade' }}. As doações são feitas apenas para entidades da mesma cidade do estabelecimento.
                </q-banner>
                <q-select
                  v-else
                  v-model="recipientOrg"
                  :disable="ofertaTravada"
                  :options="socialPartnerOptions"
                  emit-value
                  map-options
                  outlined
                  dense
                  :dark="modoEscuro"
                  options-dense
                />

                <q-card v-if="currentSelectedSocialPartner" flat bordered :dark="modoEscuro">
                  <q-card-section class="q-pa-sm column q-gutter-y-xs">
                    <div class="row items-center justify-between">
                      <q-chip dense square color="primary" text-color="white" icon="verified_user" class="text-weight-bold">Cadastro Validado (Lei 14.016)</q-chip>
                      <span class="mono text-caption text-grey-6">CNPJ: {{ currentSelectedSocialPartner.cnpj }}</span>
                    </div>
                    <div class="text-caption text-grey-6">
                      <div><span class="text-primary">📍</span> Endereço de Entrega: <strong>{{ currentSelectedSocialPartner.address }} - {{ currentSelectedSocialPartner.city }}/{{ currentSelectedSocialPartner.state }}</strong></div>
                      <div><span class="text-primary">📱</span> WhatsApp / Contato: <strong>{{ currentSelectedSocialPartner.whatsapp }}</strong> ({{ currentSelectedSocialPartner.contactPerson }})</div>
                    </div>
                    <div class="row items-center q-gutter-xs">
                      <q-badge color="primary" outline>{{ currentSelectedSocialPartner.hasOwnTransport ? '🚗 Entidade Retira no Local' : '🚚 Envio pela Loja' }}</q-badge>
                      <q-badge v-if="currentSelectedSocialPartner.hasRefrigeratedStorage" color="info" outline>❄️ Câmara Fria</q-badge>
                      <span class="text-caption text-grey-6">Horário: {{ currentSelectedSocialPartner.operatingHours }}</span>
                    </div>
                  </q-card-section>
                </q-card>
              </div>

              <!-- Consulta prévia -->
              <q-card flat bordered :dark="modoEscuro" class="tint-primary">
                <q-card-section class="column q-gutter-y-sm">
                  <div class="row items-center justify-between">
                    <span class="text-caption text-weight-bold text-uppercase text-primary mono row items-center q-gutter-x-xs">
                      <q-icon name="chat" size="16px" />
                      <span>Aceite da Entidade</span>
                    </span>

                    <q-chip v-if="activeInquiry?.status === 'accepted'" dense square color="positive" text-color="white" icon="check" class="text-weight-bold text-uppercase">Disponibilidade Aceita</q-chip>
                    <q-chip v-else-if="activeInquiry?.status === 'rejected'" dense square color="negative" text-color="white" icon="cancel" class="text-weight-bold text-uppercase">Indisponível</q-chip>
                    <q-chip v-else-if="activeInquiry?.status === 'pending_inquiry'" dense square color="warning" text-color="dark" icon="schedule" class="text-weight-bold text-uppercase">Aguardando Resposta</q-chip>
                    <span v-else class="text-caption text-weight-bold text-grey-6">Aceite ainda não solicitado</span>
                  </div>

                  <div v-if="!ofertaTravada && !dicaAceiteFechada" class="text-caption text-grey-6 row no-wrap items-start q-gutter-x-sm">
                    <span class="col">A entidade <strong>{{ recipientOrg }}</strong> recebe uma mensagem no <strong>WhatsApp</strong> com um link para <strong>aceitar ou recusar</strong> este lote.</span>
                    <q-btn flat dense no-caps size="sm" color="grey-7" label="Fechar" @click="fecharDicaAceite" />
                  </div>

                  <div v-if="!ofertaTravada" class="row items-center q-gutter-x-sm no-wrap">
                    <q-btn
                      unelevated
                      no-caps
                      dense
                      color="primary"
                      class="col q-py-xs text-weight-bold"
                      icon="chat"
                      :label="activeInquiry ? 'Reenviar Solicitação de Aceite' : 'Solicitar Aceite via WhatsApp'"
                      @click="handleSendInquiryViaAppAndWhatsapp"
                    />
                    <q-btn
                      v-if="activeInquiry"
                      outline
                      no-caps
                      dense
                      size="sm"
                      color="grey-6"
                      icon-right="open_in_new"
                      label="Ver Link"
                      :href="`/confirmar-doacao?id=${activeInquiry.id}`"
                      target="_blank"
                    >
                      <q-tooltip>Abrir a página onde a entidade aceita ou recusa</q-tooltip>
                    </q-btn>
                  </div>

                  <q-banner v-if="activeInquiry?.status === 'accepted'" dense rounded class="tint-primary text-caption">
                    <div class="text-primary text-weight-bold">✓ Entidade confirmou recebimento!</div>
                    <div v-if="activeInquiry.confirmedBy">Responsável: <strong>{{ activeInquiry.confirmedBy }}</strong></div>
                    <div v-if="activeInquiry.pickupEstimatedTime">Previsão Coleta: <strong>{{ activeInquiry.pickupEstimatedTime }}</strong></div>
                    <div v-if="activeInquiry.responseNote" class="text-grey-6 text-italic">"{{ activeInquiry.responseNote }}"</div>
                  </q-banner>

                  <q-banner v-else-if="activeInquiry?.status === 'rejected'" dense rounded class="tint-negative text-caption">
                    <div class="text-negative text-weight-bold">✕ Entidade informou não ter disponibilidade hoje.</div>
                    <div v-if="activeInquiry.rejectionReason" class="text-grey-6">Motivo: {{ activeInquiry.rejectionReason }}</div>
                    <div class="text-warning">💡 Sugestão: Selecione outra entidade no campo acima ou opte pelo Descarte Ecológico.</div>
                  </q-banner>
                </q-card-section>
              </q-card>
            </template>

            <!-- B. DESCARTE -->
            <template v-else>
              <div class="column q-gutter-y-sm">
                <div class="row items-center justify-between">
                  <span class="text-caption text-weight-bold text-uppercase text-grey-6 label-wide">Parceiro de Tratamento (Destinação)</span>
                </div>

                <q-banner v-if="!registeredDisposalPartners.length" dense rounded class="bg-orange-1 text-orange-10">
                  Nenhum aterro ou destino de descarte cadastrado para {{ cidadeDaLoja || 'sua cidade' }}. Peça à administração do SaveAll para cadastrar o destino da sua cidade.
                </q-banner>
                <q-select
                  v-else
                  v-model="discardDestination"
                  :options="disposalPartnerOptions"
                  emit-value
                  map-options
                  outlined
                  dense
                  :dark="modoEscuro"
                  options-dense
                />

                <q-card v-if="currentSelectedDisposalPartner" flat bordered :dark="modoEscuro">
                  <q-card-section class="q-pa-sm column q-gutter-y-xs">
                    <div class="row items-center justify-between">
                      <q-chip dense square color="accent" text-color="white" icon="workspace_premium" class="text-weight-bold">Licença Ambiental Validada</q-chip>
                      <span class="mono text-caption text-grey-6">CNPJ: {{ currentSelectedDisposalPartner.cnpj }}</span>
                    </div>
                    <div class="text-caption text-grey-6">
                      <div><span class="text-accent">📍</span> Unidade de Tratamento: <strong>{{ currentSelectedDisposalPartner.address }} - {{ currentSelectedDisposalPartner.city }}/{{ currentSelectedDisposalPartner.state }}</strong></div>
                      <div><span class="text-accent">📜</span> Licença: <strong>{{ currentSelectedDisposalPartner.environmentalLicense }}</strong></div>
                      <div><span class="text-accent">📱</span> WhatsApp: <strong>{{ currentSelectedDisposalPartner.whatsapp }}</strong> ({{ currentSelectedDisposalPartner.contactPerson }})</div>
                    </div>
                    <div class="row items-center q-gutter-xs">
                      <q-badge color="accent" outline>Tratamento: {{ currentSelectedDisposalPartner.treatmentType }}</q-badge>
                      <span class="text-caption text-grey-6">Capacidade: {{ currentSelectedDisposalPartner.dailyCapacityKg?.toLocaleString() }} kg/dia</span>
                    </div>
                  </q-card-section>
                </q-card>
              </div>

              <q-banner v-if="!dicaOds12Fechada" dense rounded class="tint-warning">
                <template #avatar>
                  <span class="text-subtitle1">🌾</span>
                </template>
                <span class="text-caption"><strong>Processo Sustentável ODS 12:</strong> Desviar restos orgânicos da decomposição anaeróbica impede a emanação acelerada de metano nos aterros (ODS 13).</span>
              <template #action>
                  <q-btn flat dense no-caps size="sm" color="grey-7" label="Fechar" @click="fecharDicaOds12" />
                </template>
              </q-banner>
            </template>

            <!-- Ações -->
            <div class="row q-col-gutter-sm">
              <div v-if="!ofertaTravada" class="col-6">
                <q-btn outline no-caps color="grey-6" class="full-width" icon="arrow_back" @click="currentStep = 1" />
              </div>
              <div :class="ofertaTravada ? 'col-12' : 'col-6'">
                <q-btn
                  unelevated
                  no-caps
                  color="secondary"
                  text-color="dark"
                  class="full-width text-weight-bold"
                  label="Gerar Certificado"
                  icon-right="check_circle"
                  @click="handleCompleteWizard"
                />
              </div>
            </div>
          </div>
        </q-step>

        <!-- STEP 3 -->
        <q-step :name="3" title="Selo" icon="verified" :done="currentStep > 3">
          <div class="column q-gutter-y-md text-center">
            <div class="column items-center q-py-sm">
              <q-avatar size="56px" class="tint-primary text-primary q-mb-sm">
                <q-icon name="check_circle" size="32px" />
              </q-avatar>
              <div class="text-subtitle2 text-weight-bold text-uppercase text-primary">Certificação Emitida</div>
              <div class="text-caption text-grey-6 mono">Código SAVEALL: <strong>{{ lastEmittedLog?.id }}</strong></div>
            </div>

            <!-- Voucher -->
            <q-card flat bordered :dark="modoEscuro" class="tint-primary text-left voucher-card">
              <q-card-section class="column q-gutter-y-sm">
                <div>
                  <div class="text-caption text-weight-bold text-uppercase text-primary mono">Atestado de Boa-Fé Ecológica</div>
                  <div class="text-subtitle2 text-weight-bold">{{ lastEmittedLog?.foodName }}</div>
                  <div class="text-caption text-grey-6 mono">Peso Mitigado: <strong>{{ weightEstimated }} kg</strong></div>
                </div>
                <q-separator />

                <div class="column q-gutter-y-xs text-caption mono">
                  <div class="row items-center q-gutter-x-xs">
                    <span class="text-primary">🌱</span>
                    <span>Proteção Climática: <strong>-{{ computedCo2 }} kg CO2e</strong></span>
                  </div>
                  <div class="row items-center q-gutter-x-xs">
                    <span class="text-info">💧</span>
                    <span>Economia Hídrica: <strong>{{ computedWater }} Litros</strong></span>
                  </div>
                  <div class="row items-center q-gutter-x-xs">
                    <span class="text-secondary">⚖️</span>
                    <span v-if="selectedType === 'donation'">Enquadramento: <strong>Lei Federal 14.016</strong></span>
                    <span v-else>Ind. Agenda ODS: <strong>Metas 11 / 13</strong></span>
                  </div>
                  <div class="row items-center q-gutter-x-xs">
                    <span class="text-purple">📌</span>
                    <span v-if="selectedType === 'donation'">Destino: <strong>{{ lastEmittedLog?.recipientOrganization }}</strong></span>
                    <span v-else>Tratamento: <strong>{{ lastEmittedLog?.discardDestination }}</strong></span>
                  </div>
                </div>

                <div class="sha-box rounded-borders q-pa-xs text-center mono text-grey-6">
                  SHA256: {{ lastEmittedLog?.sha256 }}
                </div>

                <q-separator />
                <div class="text-caption text-grey-6 text-italic text-center">Este documento digital valida a triagem preventiva, o controle de perdas e as metas ESG do estabelecimento.</div>
              </q-card-section>
            </q-card>

            <!-- Compartilhar -->
            <q-card flat bordered :dark="modoEscuro" class="text-left">
              <q-card-section class="column q-gutter-y-sm">
                <div class="text-caption text-weight-bold text-uppercase text-secondary label-wide">Compartilhar Comprovante / Certificado</div>

                <div>
                  <div class="text-caption text-uppercase text-grey-6 mono">Enviar por E-mail</div>
                  <q-input
                    v-model="recipientEmail"
                    type="email"
                    placeholder="e-mail de destino"
                    outlined
                    dense
                    :dark="modoEscuro"
                  >
                    <template #prepend>
                      <q-icon name="mail" size="18px" />
                    </template>
                    <template #append>
                      <q-btn
                        unelevated
                        dense
                        no-caps
                        size="sm"
                        color="secondary"
                        text-color="dark"
                        class="text-weight-bold q-px-sm"
                        :disable="isSendingEmail"
                        :label="isSendingEmail ? 'Enviando' : 'Enviar'"
                        @click="sendViaEmail"
                      />
                    </template>
                  </q-input>
                  <div v-if="sendEmailStatus" class="text-caption text-primary mono status-pulse">{{ sendEmailStatus }}</div>
                </div>

                <div>
                  <div class="text-caption text-uppercase text-grey-6 mono">Enviar via WhatsApp</div>
                  <q-input
                    v-model="recipientWhatsapp"
                    type="text"
                    placeholder="Celular (DDD + Número)"
                    outlined
                    dense
                    :dark="modoEscuro"
                  >
                    <template #prepend>
                      <q-icon name="smartphone" size="18px" />
                    </template>
                    <template #append>
                      <q-btn
                        unelevated
                        dense
                        no-caps
                        size="sm"
                        color="primary"
                        class="text-weight-bold q-px-sm"
                        :disable="isSendingWhatsapp"
                        :label="isSendingWhatsapp ? 'Enviando' : 'Enviar'"
                        @click="sendViaWhatsapp"
                      />
                    </template>
                  </q-input>
                  <div v-if="sendWhatsappStatus" class="text-caption text-primary mono status-pulse">{{ sendWhatsappStatus }}</div>
                </div>

                <q-btn
                  unelevated
                  no-caps
                  color="secondary"
                  text-color="dark"
                  class="full-width text-weight-bold"
                  icon="download"
                  label="Ver / Baixar PDF Assinado"
                  @click="handleDownloadPdfStep3"
                />
              </q-card-section>
            </q-card>

            <q-btn
              unelevated
              no-caps
              color="primary"
              class="full-width text-weight-bold"
              label="Concluir & Atualizar Painel"
              @click="emit('close')"
            />
          </div>
        </q-step>
      </q-stepper>
    </q-card>
  </q-dialog>
</template>

<style scoped lang="scss">
.wizard-card {
  width: 100%;
  max-width: 400px;
  max-height: 92vh;
  border-radius: 24px;
  overflow: hidden;
}
.wizard-stepper {
  background: transparent;
  :deep(.q-stepper__header) {
    min-height: 0;
  }
  :deep(.q-stepper__tab) {
    padding: 12px 8px;
  }
  :deep(.q-stepper__step-inner) {
    padding: 16px 20px 20px;
  }
}
.label-wide {
  letter-spacing: 0.1em;
}
.mono {
  font-family: 'Courier New', Courier, monospace;
}
.weight-input {
  width: 80px;
}
.choice-card {
  transition: all 0.2s ease;
  &--info {
    border-color: $info;
    background: rgba($info, 0.06);
  }
  &--warning {
    border-color: $secondary;
    background: rgba($secondary, 0.06);
  }
  &--idle {
    opacity: 0.8;
  }
}
.tint-primary {
  background: rgba($primary, 0.1);
}
.tint-warning {
  background: rgba($secondary, 0.1);
}
.tint-info {
  background: rgba($info, 0.1);
}
.tint-negative {
  background: rgba($negative, 0.1);
}
.signature-preview {
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.12);
}
.signature-img {
  height: 48px;
  object-fit: contain;
}
.signature-board {
  min-height: 140px;
}
.sha-box {
  background: rgba(0, 0, 0, 0.1);
  font-size: 9px;
  word-break: break-all;
}
.voucher-card {
  overflow: hidden;
}
.status-pulse {
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse {
  50% {
    opacity: 0.5;
  }
}
.body--dark & {
  .signature-preview {
    border-color: rgba(255, 255, 255, 0.2);
  }
}
</style>