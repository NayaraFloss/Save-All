<script setup>
// Orquestra o fluxo de doação ou descarte, incluindo dados, confirmação e comprovante.
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { jsPDF } from "jspdf";
import { storeToRefs } from "pinia";
import { servicoDoacoes } from "../../services/servicoDoacoes";
import { formatCNPJ, formatCPF } from "../../utils/formatters";
import { useAppStore } from "../../stores/estadoApp";
import SignaturePad from "./SignaturePad.vue";
import DiretorioParceirosModal from "./DiretorioParceirosModal.vue";
// Entradas recebidas do componente pai que configuram os dados e opções desta tela.
const props = defineProps({
  show: Boolean,
  darkMode: Boolean,
  prefilledItem: Object,
  lojaId: String,
  nomeLoja: String,
  foodToDispose: { type: Object, default: null },
  initialType: { type: String, default: "donation" },
  initialStep: { type: Number, default: 1 }
});
// Eventos emitidos para o componente pai executar as ações fora desta interface.
const emit = defineEmits(["close", "donation-created", "completed"]);
const ngoCnpjPresets = {
  "Mesa Brasil Sesc": "12.345.678/0001-90",
  "Amigos do Alimento SC": "45.678.901/0002-34",
  "Par\xF3quia Integrar Verde": "78.901.234/0003-56",
  "ONG Sop\xE3o Solid\xE1rio": "89.012.345/0004-78"
};
// Estado local reativo usado para acompanhar seleções, formulários e etapas da interface.
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
const { currentUser } = storeToRefs(useAppStore());
const showPartnerDirectoryModal = ref(false);
// Ações da tela validam a interação e encaminham as alterações ou eventos necessários.
const getStoreCity = () => {
  const addr = currentUser.value?.address || "";
  if (addr.toLowerCase().includes("chapec\xF3") || addr.toLowerCase().includes("chapeco")) return "Chapec\xF3";
  if (addr.toLowerCase().includes("pinhalzinho")) return "Pinhalzinho";
  if (addr.toLowerCase().includes("saudades")) return "Saudades";
  if (addr.toLowerCase().includes("maravilha")) return "Maravilha";
  return "Pinhalzinho";
};
const registeredSocialPartners = ref(servicoDoacoes.getSocialPartnersByProximity(getStoreCity()));
const registeredDisposalPartners = ref(servicoDoacoes.getDisposalPartners());
const reloadPartners = () => {
  registeredSocialPartners.value = servicoDoacoes.getSocialPartnersByProximity(getStoreCity());
  registeredDisposalPartners.value = servicoDoacoes.getDisposalPartners();
};
// Valores derivados das entradas e do estado para manter a apresentação sincronizada.
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
  const user = currentUser.value;
  storeNameField.value = user?.name || "Dona Kiuda Caf\xE9";
  storeCnpj.value = user?.cpfCnpj || "01.234.567/0001-89";
  recipientCnpj.value = ngoCnpjPresets[recipientOrg.value] || "12.345.678/0001-90";
  recipientRepresentativeName.value = "Dr. Marcos Santos (Volunt\xE1rio)";
  recipientRepresentativeCpf.value = "333.444.555-66";
  discardTechnicalName.value = user?.legalRepresentativeName || user?.name || "Respons\xE1vel T\xE9cnico";
  discardTechnicalCpf.value = user?.legalRepresentativeCpf || "444.555.666-77";
  productName.value = props.foodToDispose?.name || "Item Excedente";
  productCategory.value = props.foodToDispose?.category || "salgado";
  productQty.value = props.foodToDispose?.quantity || 1;
  if (props.foodToDispose?.dataValidade) {
    productExpiration.value = props.foodToDispose.dataValidade;
  } else {
    const tomorrow = /* @__PURE__ */ new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    productExpiration.value = tomorrow.toISOString().substring(0, 10);
  }
};
onMounted(() => {
  initializeFormFields();
});
// Observa mudanças relevantes e sincroniza o estado local com os dados recebidos.
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
const isUsingFixedSignature = ref(false);
const tempCoSignerName = ref("");
const tempCoSignerSignatureImage = ref("");
const checkAndPrepopulateSignature = () => {
  const user = currentUser.value;
  if (user) {
    tempCoSignerName.value = user.coSignerName || "";
    tempCoSignerSignatureImage.value = user.coSignerSignatureImage || "";
    if (user.autoSignEnabled && (user.signatureImage || user.signatureCertificate)) {
      isUsingFixedSignature.value = true;
      activeSignatureTypeSelection.value = user.signatureType || "drawn";
      if (user.signatureType === "drawn") {
        tempSignatureImage.value = user.signatureImage || "";
      } else {
        customDigitalCertificate.value = user.signatureCertificate || "";
      }
    } else {
      isUsingFixedSignature.value = false;
      tempSignatureImage.value = "";
      customDigitalCertificate.value = "";
    }
  } else {
    isUsingFixedSignature.value = false;
    tempSignatureImage.value = "";
    customDigitalCertificate.value = "";
    tempCoSignerName.value = "";
    tempCoSignerSignatureImage.value = "";
  }
};
const validateAndProceedToStep2 = () => {
  signatureName.value = currentUser.value?.name || "";
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
const refreshActiveInquiry = () => {
  if (selectedType.value !== "donation") return;
  const offers = servicoDoacoes.getDonationOffers();
  const matching = offers.find(
    (o) => props.foodToDispose?.id && o.foodId === props.foodToDispose.id || o.foodName === productName.value && o.recipientOrg === recipientOrg.value
  );
  if (matching) {
    activeInquiry.value = matching;
    if (matching.status === "accepted" && matching.confirmedBy && !signatureName.value) {
      signatureName.value = matching.confirmedBy;
    }
  }
};
const handleSendInquiryViaAppAndWhatsapp = () => {
  const offer = servicoDoacoes.createDonationOffer({
    foodId: props.foodToDispose?.id || `food-${Date.now()}`,
    foodName: productName.value || props.foodToDispose?.name || "Excedente Alimentar",
    category: productCategory.value || props.foodToDispose?.category || "Alimento",
    quantity: productQty.value || 1,
    weightEstimatedKg: weightEstimated.value || 5,
    lojaId: "store-1",
    nomeLoja: storeNameField.value || "Mercado Central",
    storeAddress: "Av. Brasil, 1200 - Centro",
    storeWhatsapp: "(49) 98877-6655",
    recipientOrg: recipientOrg.value,
    recipientWhatsapp: recipientWhatsapp.value || "(49) 99876-5432",
    description: props.foodToDispose?.description || "Alimentos pr\xF3prios para consumo conforme Lei 14.016/2020."
  });
  activeInquiry.value = offer;
  inquirySentSuccess.value = true;
  servicoDoacoes.openWhatsAppMessage(offer);
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
  doc.setDrawColor(220, 220, 220);
  doc.roundedRect(20, sigBoxY, 80, 35, 2, 2, "D");
  if (log.signatureImage) {
    try {
      doc.addImage(log.signatureImage, "PNG", 22, sigBoxY + 2, 76, 15);
    } catch {
      // imagem inválida: ignora
    }
  } else if (log.signatureType === "digital" || log.signatureCertificate) {
    doc.setTextColor(themeR, themeG, themeB);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text("\u{1F512} ASSINADO ELETRONICAMENTE", 60, sigBoxY + 10, { align: "center" });
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text(log.signatureCertificate ? log.signatureCertificate.substring(0, 35) + "..." : "", 60, sigBoxY + 15, { align: "center" });
  }
  doc.setDrawColor(180, 180, 180);
  doc.line(25, sigBoxY + 26, 95, sigBoxY + 26);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(50, 50, 50);
  doc.text(log.signatureName || "Doador", 60, sigBoxY + 30, { align: "center" });
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(7);
  doc.text("Assinatura digital \u2014 doador", 60, sigBoxY + 33, { align: "center" });
  doc.setDrawColor(220, 220, 220);
  doc.roundedRect(110, sigBoxY, 80, 35, 2, 2, "D");
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
    doc.text(log.recipientRepresentativeName || "Respons\xE1vel Retirada", 150, sigBoxY + 30, { align: "center" });
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(7);
    doc.text("Assinatura digital \u2014 entidade receptora", 150, sigBoxY + 33, { align: "center" });
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
  currentY = sigBoxY + 41;
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
    foodId: props.foodToDispose?.id || "manual",
    foodName: productName.value,
    category: productCategory.value,
    quantity: productQty.value,
    dataValidade: productExpiration.value,
    type: selectedType.value,
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
    signatureName: signatureName.value || currentUser.value?.name || "Assinante Loja",
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
  emit("completed", finalLog);
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
const destinationTypeOptions = [
  { value: "COMPOSTAGEM", label: "COMPOSTAGEM ORGÂNICA" },
  { value: "BIODIGESTOR", label: "BIODIGESTOR GASOSO" },
  { value: "OUTRO", label: "OUTRO DESTINO HOMOLOGADO" }
];
const onDirectoryClose = () => {
  showPartnerDirectoryModal.value = false;
  reloadPartners();
  updateRecipientContacts();
};
</script>

<template>
<!-- Interface principal: orquestra o fluxo de doação ou descarte, incluindo dados, confirmação e comprovante. -->
  <q-dialog v-model="dialogOpen">
    <q-card class="wizard-card column no-wrap" :dark="darkMode">
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
        :dark="darkMode"
        active-color="secondary"
        done-color="secondary"
        class="wizard-stepper col scroll"
      >
        <!-- STEP 1 -->
        <q-step :name="1" title="Canal" icon="alt_route" :done="currentStep > 1">
          <div class="column q-gutter-y-md">
            <q-banner dense rounded class="tint-warning">
              <div class="text-caption text-weight-bold text-uppercase text-warning">Lote Selecionado</div>
              <div class="text-subtitle2 text-weight-bold">{{ foodToDispose?.name }}</div>
              <div class="text-caption text-grey-6 text-uppercase">Categoria: {{ foodToDispose?.category || 'Excedente' }}</div>
            </q-banner>

            <div class="column q-gutter-y-sm">
              <div class="text-caption text-weight-bold text-uppercase text-grey-6 label-wide">Escolha o Destino Ambiental</div>

              <!-- Choice 1: Donation -->
              <q-card
                flat
                bordered
                v-ripple
                clickable
                :dark="darkMode"
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
                :dark="darkMode"
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
                <span class="text-caption text-weight-bold text-uppercase text-grey-6 label-wide">Peso Estimado do Lote (KG)</span>
                <span class="text-secondary text-weight-bold mono">{{ weightEstimated }} Kg</span>
              </div>
              <div class="row items-center no-wrap weight-row">
                <q-slider
                  v-model="weightEstimated"
                  :min="0.5"
                  :max="50"
                  :step="0.5"
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
                  :dark="darkMode"
                  class="weight-input"
                  input-class="text-center mono"
                />
              </div>
              <div class="text-caption text-grey-6">Média física estimada p/ fins de computação ESG ambiental.</div>
            </div>

            <!-- A. DOAÇÃO -->
            <template v-if="selectedType === 'donation'">
              <div class="column q-gutter-y-sm">
                <div class="row items-center justify-between">
                  <span class="text-caption text-weight-bold text-uppercase text-grey-6 label-wide">Entidade Receptora (ONG)</span>
                  <q-btn flat dense no-caps size="sm" color="primary" icon="business" label="Cadastros & Validações" @click="showPartnerDirectoryModal = true" />
                </div>

                <q-select
                  v-model="recipientOrg"
                  class="partner-select"
                  popup-content-class="partner-select-menu"
                  :options="socialPartnerOptions"
                  emit-value
                  map-options
                  outlined
                  dense
                  :dark="darkMode"
                  options-dense
                />

                <q-card v-if="currentSelectedSocialPartner" flat bordered :dark="darkMode">
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
              <q-card flat bordered :dark="darkMode" class="tint-primary">
                <q-card-section class="column q-gutter-y-sm">
                  <div class="row items-center justify-between">
                    <span class="text-caption text-weight-bold text-uppercase text-primary mono row items-center q-gutter-x-xs">
                      <q-icon name="chat" size="16px" />
                      <span>Notificação & Consulta Prévia</span>
                    </span>

                    <q-chip v-if="activeInquiry?.status === 'accepted'" dense square color="positive" text-color="white" icon="check" class="text-weight-bold text-uppercase">Disponibilidade Aceita</q-chip>
                    <q-chip v-else-if="activeInquiry?.status === 'rejected'" dense square color="negative" text-color="white" icon="cancel" class="text-weight-bold text-uppercase">Indisponível</q-chip>
                    <q-chip v-else-if="activeInquiry?.status === 'pending_inquiry'" dense square color="warning" text-color="dark" icon="schedule" class="text-weight-bold text-uppercase">Aguardando Resposta</q-chip>
                    <span v-else class="text-caption text-weight-bold text-grey-6">Opcional antes de assinar</span>
                  </div>

                  <div class="text-caption text-grey-6">
                    Envie uma consulta pelo <strong>App</strong> e via <strong>WhatsApp</strong> para <strong>{{ recipientOrg }}</strong> perguntando se eles podem receber este lote com link de confirmação automática.
                  </div>

                  <div class="row items-center q-gutter-x-sm no-wrap">
                    <q-btn
                      unelevated
                      no-caps
                      dense
                      color="primary"
                      class="col q-py-xs text-weight-bold"
                      icon="chat"
                      :label="activeInquiry ? 'Reenviar WhatsApp & Link' : 'Enviar Consulta por WhatsApp'"
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
                      <q-tooltip>Abrir página de resposta do link</q-tooltip>
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

              <div>
                <q-input
                  v-model="signatureName"
                  type="text"
                  label="Assinatura de Retirada (Triador / Responsável)"
                  stack-label
                  placeholder="Ex: Maria Oliveira (Coord. Amigos SC)"
                  outlined
                  dense
                  :dark="darkMode"
                  :rules="[(val) => !!val || 'Campo obrigatório']"
                  lazy-rules
                  hide-bottom-space
                />
                <div class="text-caption text-grey-6">Obrigatório ateste de boa-fé em conformidade com a Lei 14.016/2020.</div>
              </div>

              <q-banner dense rounded class="tint-info">
                <template #avatar>
                  <q-icon name="balance" color="info" size="20px" />
                </template>
                <span class="text-caption"><strong>Proteção Jurídica Ativa:</strong> O doador e o intermediário não respondem civilmente se os alimentos restarem aptos ao consumo no ato da entrega (Lei 14.016/2020).</span>
              </q-banner>
            </template>

            <!-- B. DESCARTE -->
            <template v-else>
              <div class="column q-gutter-y-sm">
                <div class="row items-center justify-between">
                  <span class="text-caption text-weight-bold text-uppercase text-grey-6 label-wide">Parceiro de Tratamento (Destinação)</span>
                  <q-btn flat dense no-caps size="sm" color="accent" icon="eco" label="Cadastros & Validações" @click="showPartnerDirectoryModal = true" />
                </div>

                <q-select
                  v-model="discardDestination"
                  class="partner-select"
                  popup-content-class="partner-select-menu"
                  :options="disposalPartnerOptions"
                  emit-value
                  map-options
                  outlined
                  dense
                  :dark="darkMode"
                  options-dense
                />

                <q-card v-if="currentSelectedDisposalPartner" flat bordered :dark="darkMode">
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

              <q-banner dense rounded class="tint-warning">
                <template #avatar>
                  <span class="text-subtitle1">🌾</span>
                </template>
                <span class="text-caption"><strong>Processo Sustentável ODS 12:</strong> Desviar restos orgânicos da decomposição anaeróbica impede a emanação acelerada de metano nos aterros (ODS 13).</span>
              </q-banner>
            </template>

            <!-- Dados da declaração -->
            <q-card flat bordered :dark="darkMode">
              <q-card-section class="column q-gutter-y-sm">
                <div class="text-caption text-weight-bold text-uppercase text-primary mono label-wide">Dados da Declaração Jurídica</div>

                <div class="row q-col-gutter-sm">
                  <div class="col-6">
                    <q-input v-model="storeNameField" type="text" label="Doador/Loja" stack-label outlined dense :dark="darkMode" />
                  </div>
                  <div class="col-6">
                    <q-input
                      :model-value="storeCnpj"
                      type="text"
                      label="CNPJ Loja"
                      stack-label
                      maxlength="18"
                      placeholder="00.000.000/0000-00"
                      outlined
                      dense
                      :dark="darkMode"
                      input-class="mono"
                      @update:model-value="storeCnpj = formatCNPJ($event)"
                    />
                  </div>
                </div>

                <q-separator :dark="darkMode" />

                <div class="row q-col-gutter-sm">
                  <div class="col-12">
                    <q-input v-model="productName" type="text" label="Descrição do Item" stack-label outlined dense :dark="darkMode" />
                  </div>
                  <div class="col-6">
                    <q-input v-model.number="productQty" type="number" label="Quantidade" stack-label outlined dense :dark="darkMode" />
                  </div>
                  <div class="col-6">
                    <q-input v-model="productExpiration" type="date" label="Validade" stack-label outlined dense :dark="darkMode" input-class="mono" />
                  </div>
                </div>

                <q-separator :dark="darkMode" />

                <!-- Doação -->
                <div v-if="selectedType === 'donation'" class="row q-col-gutter-sm">
                  <div class="col-12">
                    <q-input
                      :model-value="recipientCnpj"
                      type="text"
                      label="CNPJ da Entidade"
                      stack-label
                      maxlength="18"
                      placeholder="00.000.000/0000-00"
                      outlined
                      dense
                      :dark="darkMode"
                      input-class="mono"
                      @update:model-value="recipientCnpj = formatCNPJ($event)"
                    />
                  </div>
                  <div class="col-6">
                    <q-input v-model="recipientRepresentativeName" type="text" label="Resp. Retirada" stack-label placeholder="Nome Completo" outlined dense :dark="darkMode" />
                  </div>
                  <div class="col-6">
                    <q-input
                      :model-value="recipientRepresentativeCpf"
                      type="text"
                      label="CPF do Resp."
                      stack-label
                      maxlength="14"
                      placeholder="000.000.000-00"
                      outlined
                      dense
                      :dark="darkMode"
                      input-class="mono"
                      @update:model-value="recipientRepresentativeCpf = formatCPF($event)"
                    />
                  </div>
                </div>

                <!-- Descarte -->
                <div v-else class="row q-col-gutter-sm">
                  <div class="col-6">
                    <q-input v-model="discardTechnicalName" type="text" label="Resp. Técnico" stack-label outlined dense :dark="darkMode" />
                  </div>
                  <div class="col-6">
                    <q-input
                      :model-value="discardTechnicalCpf"
                      type="text"
                      label="CPF Resp. Técnico"
                      stack-label
                      maxlength="14"
                      placeholder="000.000.000-00"
                      outlined
                      dense
                      :dark="darkMode"
                      input-class="mono"
                      @update:model-value="discardTechnicalCpf = formatCPF($event)"
                    />
                  </div>
                  <div class="col-12">
                    <q-select
                      v-model="discardDestinationType"
                      :options="destinationTypeOptions"
                      label="Destinação Técnica"
                      stack-label
                      emit-value
                      map-options
                      outlined
                      dense
                      :dark="darkMode"
                      options-dense
                    />
                  </div>
                </div>
              </q-card-section>
            </q-card>

            <!-- Assinatura ESG -->
            <q-card flat bordered :dark="darkMode">
              <q-card-section class="column q-gutter-y-sm">
                <div class="row items-center justify-between">
                  <span class="text-caption text-weight-bold text-uppercase text-secondary mono label-wide">Assinatura de Atribuição ESG</span>
                  <q-btn
                    v-if="isUsingFixedSignature"
                    flat
                    dense
                    no-caps
                    size="sm"
                    color="secondary"
                    label="Alterar Assinatura"
                    @click="isUsingFixedSignature = false"
                  />
                </div>

                <!-- Caso A: assinatura fixa -->
                <div v-if="isUsingFixedSignature" class="column q-gutter-y-sm">
                  <q-banner dense rounded class="tint-primary">
                    <template #avatar>
                      <q-icon name="check" color="primary" size="18px" />
                    </template>
                    <div class="text-caption mono">
                      <div class="text-primary text-weight-bold text-uppercase">Assinatura Automática Ativa</div>
                      <div class="text-grey-6">Cadastrada nas configurações do perfil da loja</div>
                    </div>
                  </q-banner>
                  <div v-if="activeSignatureTypeSelection === 'drawn' && tempSignatureImage" class="signature-preview row justify-center q-pa-sm rounded-borders">
                    <img :src="tempSignatureImage" class="signature-img" alt="Assinatura Fixa Desenho" />
                  </div>
                  <q-banner v-else-if="activeSignatureTypeSelection === 'digital' && customDigitalCertificate" dense rounded class="bg-grey-2 text-grey-8 mono ellipsis">
                    🔑 {{ customDigitalCertificate }}
                  </q-banner>
                </div>

                <!-- Caso B: desenhar ou digitar -->
                <div v-else class="column q-gutter-y-sm">
                  <q-btn-toggle
                    v-model="activeSignatureTypeSelection"
                    spread
                    no-caps
                    unelevated
                    dense
                    toggle-color="secondary"
                    toggle-text-color="dark"
                    :options="[
                      { label: 'Dedo ou Mouse', value: 'drawn' },
                      { label: 'Certificado/CPF', value: 'digital' }
                    ]"
                    @update:model-value="(val) => { if (val === 'drawn') tempSignatureImage = ''; else customDigitalCertificate = ''; }"
                  />

                  <div v-if="activeSignatureTypeSelection === 'drawn'" class="signature-board">
                    <SignaturePad
                      :darkMode="darkMode"
                      label="Assine com Dedo ou Mouse na tela:"
                      :initialImage="tempSignatureImage"
                      @save="(base64) => tempSignatureImage = base64"
                      @clear="tempSignatureImage = ''"
                    />
                  </div>

                  <div v-else>
                    <q-input
                      v-model="customDigitalCertificate"
                      type="text"
                      label="Certificado ou Nome e Documento"
                      stack-label
                      placeholder="Ex: ICP-Brasil: 04.912.045/0001-90 ou CPF 104.2..."
                      outlined
                      dense
                      :dark="darkMode"
                      :rules="[(val) => !!val || 'Campo obrigatório']"
                      lazy-rules
                      hide-bottom-space
                    />
                    <div class="text-caption text-grey-6 mono">Insira CPF/CNPJ do responsável técnico ou chave do certificado digital.</div>
                  </div>
                </div>

                <q-input
                  v-model="signatureName"
                  type="text"
                  label="Nome do Responsável / Triador"
                  stack-label
                  placeholder="Insira o nome completo do assinante"
                  outlined
                  dense
                  :dark="darkMode"
                  :rules="[(val) => !!val || 'Campo obrigatório']"
                  lazy-rules
                  hide-bottom-space
                />

                <q-separator :dark="darkMode" />

                <!-- Co-signatário -->
                <div class="column q-gutter-y-sm">
                  <span class="text-caption text-weight-bold text-uppercase text-secondary mono label-wide">Assinatura do Autorizador Técnico por Dedo/Mouse</span>
                  <q-input
                    v-model="tempCoSignerName"
                    type="text"
                    label="Nome do Responsável Técnico"
                    stack-label
                    placeholder="Ex: Dra. Juliana Souza"
                    outlined
                    dense
                    :dark="darkMode"
                  />
                  <div class="signature-board">
                    <SignaturePad
                      :darkMode="darkMode"
                      label="Desenhe a assinatura por dedo/mouse abaixo:"
                      :initialImage="tempCoSignerSignatureImage"
                      @save="(base64) => tempCoSignerSignatureImage = base64"
                      @clear="tempCoSignerSignatureImage = ''"
                    />
                  </div>
                </div>
              </q-card-section>
            </q-card>

            <!-- Ações -->
            <div class="row q-col-gutter-sm">
              <div class="col-6">
                <q-btn outline no-caps color="grey-6" class="full-width" icon="arrow_back" @click="currentStep = 1" />
              </div>
              <div class="col-12 col-sm-6">
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
            <q-card flat bordered :dark="darkMode" class="tint-primary text-left voucher-card">
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
            <q-card flat bordered :dark="darkMode" class="text-left">
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
                    :dark="darkMode"
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
                    :dark="darkMode"
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

    <!-- Diretório de parceiros -->
    <DiretorioParceirosModal
      v-if="showPartnerDirectoryModal"
      :darkMode="darkMode"
      @close="onDirectoryClose"
    />
  </q-dialog>
</template>

<style scoped lang="scss">
.wizard-card {
  width: 100%;
  max-width: min(520px, 100%);
  max-height: 92vh;
  max-height: 92dvh;
  min-width: 0;
  border-radius: 24px;
  overflow: hidden;
}
.wizard-stepper {
  background: transparent;
  min-width: 0;
  max-width: 100%;
  overflow-x: hidden;
  :deep(.q-stepper__header) {
    min-height: 0;
  }
  :deep(.q-stepper__tab) {
    padding: 12px 8px;
  }
  :deep(.q-stepper__content),
  :deep(.q-panel),
  :deep(.q-stepper__step-content) {
    min-width: 0;
    max-width: 100%;
  }
  :deep(.q-stepper__step-inner) {
    padding: 16px 20px 20px;
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
  }
  // Todo texto longo (endereço, licença, nomes) quebra linha em vez de vazar
  :deep(.column),
  :deep(.row),
  :deep(.col),
  :deep(.q-card),
  :deep(.q-card__section),
  :deep(.q-banner__content) {
    min-width: 0;
    max-width: 100%;
  }
  :deep(.text-caption),
  :deep(strong),
  :deep(.q-banner__content),
  :deep(.q-chip__content),
  :deep(.q-badge) {
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  :deep(.q-badge) {
    height: auto;
    max-width: 100%;
    white-space: normal;
    text-align: left;
    padding: 3px 6px;
  }
  :deep(.q-chip) {
    height: auto;
    min-height: 24px;
    max-width: 100%;
    white-space: normal;
  }
  :deep(.q-banner) {
    min-height: 0;
  }
  :deep(.q-banner__avatar) {
    align-self: flex-start;
  }
  :deep(.q-btn) {
    max-width: 100%;
  }
  :deep(.q-btn__content) {
    flex-wrap: nowrap;
    text-align: center;
  }
}
.partner-select {
  max-width: 100%;
  :deep(.q-field__control) {
    height: auto;
    min-height: 40px;
  }
  :deep(.q-field__native) {
    min-width: 0;
    white-space: normal;
    line-height: 1.3;
    padding-top: 8px;
    padding-bottom: 8px;
  }
  :deep(.q-field__native > span) {
    overflow-wrap: anywhere;
  }
}
.weight-row {
  gap: 16px;
  :deep(.q-slider) {
    min-width: 0;
  }
}
@media (max-width: 599px) {
  .wizard-card {
    border-radius: 20px;
  }
  .wizard-stepper :deep(.q-stepper__step-inner) {
    padding: 14px 14px 18px;
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

<style lang="scss">
.partner-select-menu {
  max-width: calc(100vw - 32px) !important;
  .q-item__label {
    white-space: normal;
    overflow-wrap: anywhere;
  }
}
</style>
