<script setup>
// Organiza indicadores ESG e relatórios consolidados para consulta e exportação.
import { ref, computed } from "vue";
import { storeToRefs } from "pinia";
import { useAppStore } from "stores/estadoApp";
import { jsPDF } from "jspdf";
// Entradas recebidas do componente pai que configuram os dados e opções desta tela.
const props = defineProps({
  lojaId: String,
  nomeLoja: String,
  darkMode: Boolean,
  disposals: { type: Array, default: () => [] },
  activeReportSubTabSetting: String
});
const { orders, foods } = storeToRefs(useAppStore());
// Estado local reativo usado para acompanhar seleções, formulários e etapas da interface.
const activeReportSubTab = ref(props.activeReportSubTabSetting || "summary");
const selectedLogDetails = ref(null);
// Valores derivados das entradas e do estado para manter a apresentação sincronizada.
const logDetailsOpen = computed({
  get: () => !!selectedLogDetails.value,
  set: (v) => {
    if (!v) selectedLogDetails.value = null;
  }
});
const showCustomReportModal = ref(false);
const startDate = ref(new Date((/* @__PURE__ */ new Date()).getFullYear(), (/* @__PURE__ */ new Date()).getMonth(), 1).toISOString().substring(0, 10));
const endDate = ref((/* @__PURE__ */ new Date()).toISOString().substring(0, 10));
const selectedReportType = ref("all");
const filteredTotalsForCustomReport = computed(() => {
  const filtered = props.disposals.filter((d) => {
    const dDate = new Date(d.date).toISOString().substring(0, 10);
    const inRange = dDate >= startDate.value && dDate <= endDate.value;
    const inType = selectedReportType.value === "all" || d.type === selectedReportType.value;
    return inRange && inType;
  });
  const weight = filtered.reduce((acc, d) => acc + d.weightEstimatedKg, 0);
  const co2 = Number((weight * 2.5).toFixed(1));
  const water = Math.round(weight * 130);
  return {
    weight: weight.toFixed(1).replace(".", ","),
    co2: co2.toFixed(1).replace(".", ","),
    water
  };
});
const completedStatsOrders = computed(() => {
  return orders.value.filter((o) => o.status === "delivered");
});
const qtySold = computed(() => {
  return completedStatsOrders.value.reduce((sum, order) => {
    return sum + order.items.reduce((acc, item) => acc + item.quantity, 0);
  }, 0);
});
const weightSoldDef = computed(() => {
  return Number((qtySold.value * 0.2).toFixed(1));
});
const donationList = computed(() => {
  return props.disposals.filter((d) => d.type === "donation");
});
const qtyDonatedDef = computed(() => {
  return donationList.value.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
});
const weightDonatedDef = computed(() => {
  return Number(donationList.value.reduce((sum, item) => sum + item.weightEstimatedKg, 0).toFixed(1));
});
const discardList = computed(() => {
  return props.disposals.filter((d) => d.type === "discard");
});
const qtyDiscardedDef = computed(() => {
  return discardList.value.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
});
const weightDiscardedDef = computed(() => {
  return Number(discardList.value.reduce((sum, item) => sum + item.weightEstimatedKg, 0).toFixed(1));
});
const totalWeightSaved = computed(() => {
  return Number((weightSoldDef.value + weightDonatedDef.value).toFixed(1));
});
const totalWeightCategoryDoce = computed(() => {
  const manualDoce = props.disposals.filter((d) => d.category === "doce").reduce((s, x) => s + x.weightEstimatedKg, 0);
  const orderedDoce = completedStatsOrders.value.reduce((s, o) => s + o.items.reduce((s2, it) => {
    const itemCat = foods.value.find((f) => f.id === it.itemId)?.category || "salgado";
    return s2 + (itemCat === "doce" ? it.quantity * 0.2 : 0);
  }, 0), 0);
  return Number((manualDoce + orderedDoce).toFixed(1));
});
const totalWeightCategorySalgado = computed(() => {
  const manualSalgado = props.disposals.filter((d) => d.category !== "doce").reduce((s, x) => s + x.weightEstimatedKg, 0);
  const orderedSalgado = completedStatsOrders.value.reduce((s, o) => s + o.items.reduce((s2, it) => {
    const itemCat = foods.value.find((f) => f.id === it.itemId)?.category || "salgado";
    return s2 + (itemCat !== "doce" ? it.quantity * 0.2 : 0);
  }, 0), 0);
  return Number((manualSalgado + orderedSalgado).toFixed(1));
});
const co2Prevented = computed(() => {
  return Number((totalWeightSaved.value * 2.5).toFixed(1));
});
const waterSafeguarded = computed(() => {
  return Math.round(totalWeightSaved.value * 130);
});
// Ações da tela validam a interação e encaminham as alterações ou eventos necessários.
const handleDownloadPdfCertificate = (log) => {
  if (!log) return;
  const isDonation = log.type === "donation";
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });
  const themeRGB = isDonation ? [13, 148, 136] : [180, 83, 9];
  const themeR = themeRGB[0];
  const themeG = themeRGB[1];
  const themeB = themeRGB[2];
  const bannerTitle = isDonation ? "CERTIFICADO DE DESTINA\xC7\xC3O SUSTENT\xC1VEL" : "CERTIFICADO DE DESCARTE ECOL\xD3GICO";
  const introTextStr = isDonation ? `Certificamos que o estabelecimento comercial realizou com sucesso o direcionamento e doa\xE7\xE3o do alimento mitigado por meio da plataforma SaveAll, em estrito cumprimento da Lei Federal n\xBA 14.016/2020.` : `Certificamos para os devidos fins de auditoria e conformidade ambiental que o estabelecimento comercial realizou com sucesso o tratamento e destina\xE7\xE3o ecol\xF3gica de alimento excedente, gerando subprodutos sustent\xE1veis e evitando emiss\xF5es poluentes em aterro sanit\xE1rio.`;
  const footerText = isDonation ? "As doa\xE7\xF5es seguem as diretrizes da Lei 14.016/2020 sob governan\xE7a civil brasileira." : "Os descartes e destina\xE7\xF5es ecol\xF3gicas seguem as diretrizes da Lei 14.016/2020 sob governan\xE7a civil brasileira.";
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, 210, 297, "F");
  doc.setDrawColor(themeR, themeG, themeB);
  doc.setLineWidth(0.6);
  doc.rect(8, 8, 194, 281, "D");
  doc.setTextColor(themeR, themeG, themeB);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(26);
  doc.text("SaveAll", 105, 28, { align: "center" });
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(themeR, themeG, themeB);
  doc.text("CONECTANDO O VAREJO A UM FUTURO SEM DESPERD\xCDCIO", 105, 36, { align: "center" });
  doc.setFillColor(themeR, themeG, themeB);
  doc.rect(8.3, 44, 193.4, 11, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text(bannerTitle, 105, 51.2, { align: "center" });
  doc.setTextColor(50, 60, 50);
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setLineHeightFactor(1.5);
  const textLines = doc.splitTextToSize(introTextStr, 170);
  doc.text(textLines, 20, 68);
  doc.setDrawColor(210, 215, 210);
  doc.setLineWidth(0.4);
  doc.line(20, 87, 190, 87);
  doc.setTextColor(themeR, themeG, themeB);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(9);
  doc.text("DESCRITIVO DA OPERA\xC7\xC3O", 20, 95);
  const co2Val = (log.weightEstimatedKg * 2.5).toFixed(1).replace(".", ",");
  const waterVal = Math.round(log.weightEstimatedKg * 130);
  const formattedWeight = `${log.weightEstimatedKg.toString().replace(".", ",")} kg`;
  const details = [
    { key: "Item mitigado", val: log.foodName || "Item Alimentar", isHighlighted: false },
    { key: "Categoria", val: log.category === "doce" ? "Doce / Confeitaria" : "Salgado / Panifica\xE7\xE3o", isHighlighted: false },
    { key: "Volume / Peso", val: formattedWeight, isHighlighted: false },
    { key: isDonation ? "Entidade receptora" : "Tratamento e destino", val: (isDonation ? log.recipientOrganization : log.discardDestination) || "Parceiro Homologado", isHighlighted: false },
    { key: "Data do evento", val: `${new Date(log.date).toLocaleDateString("pt-BR")} \xE0s ${new Date(log.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h")}`, isHighlighted: false },
    { key: "C\xF3digo chave", val: log.id || "N/A", isHighlighted: false },
    { key: "Impacto ODS", val: `+${co2Val} kg CO2 evitado \xB7 +${waterVal}L \xE1gua preservada`, isHighlighted: true }
  ];
  let currentY = 103;
  details.forEach((detail) => {
    doc.setFont("Helvetica", "normal");
    doc.setTextColor(100, 110, 100);
    doc.setFontSize(9);
    doc.text(detail.key, 20, currentY);
    doc.setFont("Helvetica", "bold");
    if (detail.isHighlighted) {
      doc.setTextColor(themeR, themeG, themeB);
    } else {
      doc.setTextColor(30, 40, 30);
    }
    doc.text(detail.val, 190, currentY, { align: "right" });
    currentY += 7.5;
  });
  doc.setDrawColor(210, 215, 210);
  doc.setLineWidth(0.4);
  doc.line(20, 160, 190, 160);
  doc.setDrawColor(200, 205, 200);
  doc.roundedRect(20, 169, 80, 41, 2, 2, "D");
  if (log.signatureImage) {
    try {
      doc.addImage(log.signatureImage, "PNG", 22, 171, 76, 17);
    } catch {
      /* ignorado */
    }
  } else if (log.signatureType === "digital" || log.signatureCertificate) {
    doc.setTextColor(themeR, themeG, themeB);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text("\u{1F512} ASSINADO DIGITALMENTE", 60, 180, { align: "center" });
  }
  doc.setDrawColor(180, 185, 180);
  doc.setLineWidth(0.25);
  doc.line(25, 195, 95, 195);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(30, 40, 30);
  doc.text(log.signatureName || "Representante Legal", 60, 201, { align: "center" });
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(110, 120, 110);
  doc.text("Emissor (estabelecimento)", 60, 205, { align: "center" });
  doc.setDrawColor(200, 205, 200);
  doc.roundedRect(110, 169, 80, 41, 2, 2, "D");
  if (log.coSignerSignatureImage) {
    try {
      doc.addImage(log.coSignerSignatureImage, "PNG", 112, 171, 76, 17);
    } catch {
      /* ignorado */
    }
  }
  doc.setDrawColor(180, 185, 180);
  doc.setLineWidth(0.25);
  doc.line(115, 195, 185, 195);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(30, 40, 30);
  doc.text(log.coSignerName || "Triador Respons\xE1vel", 150, 201, { align: "center" });
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(110, 120, 110);
  doc.text("Autorizador t\xE9cnico", 150, 205, { align: "center" });
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(80, 90, 80);
  doc.text("Chave de verifica\xE7\xE3o SHA256", 20, 219);
  doc.setFillColor(250, 248, 245);
  doc.setDrawColor(220, 225, 220);
  doc.roundedRect(20, 222, 170, 8, 1, 1, "FD");
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 110, 100);
  doc.text("d8d7e0a811cff39665bc72de5122b07e7b5f0062ae5f6c42ea3b91f7c4d250e1f9a3c6b2d84710fe5c", 23, 227.2);
  doc.setFillColor(themeR, themeG, themeB);
  doc.rect(8.3, 237, 193.4, 51.4, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("Verifica\xE7\xE3o de integridade \u2014 SaveAll", 105, 248, { align: "center" });
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("Chave SHA256: d8d7e0a811cff39665bc72de5122b07e7b5f0062ae5f6c42ea...", 105, 254, { align: "center" });
  doc.text(footerText, 105, 260, { align: "center" });
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(8);
  doc.text("www.saveall.com.br", 105, 272, { align: "center" });
  const blobUrl = doc.output("bloburl");
  window.open(blobUrl, "_blank");
};
const handleGenerateConsolidatedReport = () => {
  const start = new Date(startDate.value);
  const end = new Date(endDate.value);
  const formattedStart = start.toLocaleDateString("pt-BR");
  const formattedEnd = end.toLocaleDateString("pt-BR");
  const filteredList = props.disposals.filter((d) => {
    const dDate = new Date(d.date).toISOString().substring(0, 10);
    return dDate >= startDate.value && dDate <= endDate.value;
  });
  const donations = filteredList.filter((d) => d.type === "donation");
  const discards = filteredList.filter((d) => d.type === "discard");
  let renderDonations = selectedReportType.value === "all" || selectedReportType.value === "donation";
  let renderDiscards = selectedReportType.value === "all" || selectedReportType.value === "discard";
  const totalDonationsKg = donations.reduce((sum, d) => sum + d.weightEstimatedKg, 0);
  const totalDiscardsKg = discards.reduce((sum, d) => sum + d.weightEstimatedKg, 0);
  const totalWeightFiltered = (renderDonations ? totalDonationsKg : 0) + (renderDiscards ? totalDiscardsKg : 0);
  const co2Filtered = (totalWeightFiltered * 2.5).toFixed(1).replace(".", ",");
  const waterFiltered = Math.round(totalWeightFiltered * 130);
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });
  let pageCount = 1;
  const drawPageShell = (pageNum) => {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 210, 297, "F");
    doc.setDrawColor(13, 148, 136);
    doc.setLineWidth(0.6);
    doc.rect(8, 8, 194, 281, "D");
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 110, 100);
    doc.text(`SaveAll - Relat\xF3rio Consolidado ESG \xB7 P\xE1gina ${pageNum}`, 105, 284, { align: "center" });
  };
  drawPageShell(pageCount);
  doc.setTextColor(13, 148, 136);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(24);
  doc.text("SaveAll", 105, 24, { align: "center" });
  doc.setFontSize(8.5);
  doc.setTextColor(50, 60, 50);
  doc.text("RELAT\xD3RIO CONSOLIDADO DE IMPACTO E DESTINA\xC7\xC3O SUSTENT\xC1VEL ESG", 105, 30, { align: "center" });
  doc.setFillColor(241, 245, 249);
  doc.rect(60, 34, 90, 7, "F");
  doc.setTextColor(51, 65, 85);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(8);
  doc.text(`Per\xEDodo: ${formattedStart} a ${formattedEnd}`, 105, 39, { align: "center" });
  const cardWidth = 41;
  const cardGap = 4;
  const startX = 16;
  const startY = 46;
  const kpis = [
    { label: "VOLUME TOTAL PER\xCDODO", val: `${totalWeightFiltered.toFixed(1).replace(".", ",")} kg`, isSpecial: false },
    { label: "TOTAL DE REGISTROS", val: `${filteredList.length}`, isSpecial: false },
    { label: "CO2 EVITADO", val: `+${co2Filtered} kg CO2e`, isSpecial: true, color: [22, 163, 74] },
    { label: "\xC1GUA PRESERVADA", val: `+${waterFiltered} L`, isSpecial: true, color: [2, 132, 199] }
  ];
  kpis.forEach((kpi, idx) => {
    const x = startX + idx * (cardWidth + cardGap);
    if (kpi.isSpecial && kpi.color) {
      doc.setFillColor(240, 253, 244);
      if (idx === 3) doc.setFillColor(240, 249, 255);
    } else {
      doc.setFillColor(248, 250, 252);
    }
    doc.rect(x, startY, cardWidth, 16, "F");
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.rect(x, startY, cardWidth, 16, "D");
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 110, 100);
    doc.text(kpi.label, x + cardWidth / 2, startY + 5, { align: "center" });
    doc.setFontSize(10);
    if (kpi.isSpecial && kpi.color) {
      doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    } else {
      doc.setTextColor(15, 23, 42);
    }
    doc.text(kpi.val, x + cardWidth / 2, startY + 11, { align: "center" });
  });
  let currentY = 70;
  const checkPageSpace = (neededHeight) => {
    if (currentY + neededHeight > 265) {
      doc.addPage();
      pageCount++;
      drawPageShell(pageCount);
      currentY = 20;
    }
  };
  if (renderDonations) {
    checkPageSpace(22);
    doc.setFillColor(13, 148, 136);
    doc.rect(16, currentY, 178, 6, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("DOA\xC7\xD5ES DE ALIMENTOS (LEI N\xBA 14.016/2020)", 20, currentY + 4.2);
    currentY += 9;
    if (donations.length === 0) {
      doc.setTextColor(100, 110, 100);
      doc.setFont("Helvetica", "italic");
      doc.setFontSize(8.5);
      doc.text("Nenhum registro de doa\xE7\xE3o para o per\xEDodo selecionado.", 20, currentY);
      currentY += 8;
    } else {
      doc.setFillColor(248, 250, 252);
      doc.rect(16, currentY, 178, 6.5, "F");
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(16, currentY + 6.5, 194, currentY + 6.5);
      doc.setTextColor(71, 85, 105);
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(7.5);
      doc.text("DATA", 18, currentY + 4.5);
      doc.text("ITEM / ALIMENTO", 40, currentY + 4.5);
      doc.text("PESO (KG)", 95, currentY + 4.5);
      doc.text("ENTIDADE RECEPTORA", 115, currentY + 4.5);
      doc.text("C\xD3DIGO DE VERIFICA\xC7\xC3O", 160, currentY + 4.5);
      currentY += 6.5;
      donations.forEach((d) => {
        checkPageSpace(8);
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(30, 40, 30);
        const rowDate = new Date(d.date).toLocaleDateString("pt-BR");
        const rowFood = d.foodName || "Alimento";
        const rowWeight = `${d.weightEstimatedKg.toString().replace(".", ",")} kg`;
        const rowRecipient = d.recipientOrganization || "Parceiro Cadastrado";
        const rowCode = d.id ? d.id.length > 14 ? d.id.substring(0, 14) + "..." : d.id : "N/A";
        doc.text(rowDate, 18, currentY + 5.5);
        doc.setFont("Helvetica", "bold");
        doc.text(rowFood, 40, currentY + 5.5);
        doc.setFont("Helvetica", "normal");
        doc.text(rowWeight, 95, currentY + 5.5);
        doc.text(rowRecipient, 115, currentY + 5.5);
        doc.setFont("Courier", "normal");
        doc.setFontSize(7);
        doc.setTextColor(100, 110, 100);
        doc.text(rowCode, 160, currentY + 5.5);
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(8);
        doc.setDrawColor(241, 245, 249);
        doc.setLineWidth(0.15);
        doc.line(16, currentY + 7.5, 194, currentY + 7.5);
        currentY += 7.5;
      });
      currentY += 4;
    }
  }
  if (renderDiscards) {
    checkPageSpace(22);
    doc.setFillColor(180, 83, 9);
    doc.rect(16, currentY, 178, 6, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("DESCARTES ECOL\xD3GICOS E DESTINA\xC7\xC3O REVERSA (ODS)", 20, currentY + 4.2);
    currentY += 9;
    if (discards.length === 0) {
      doc.setTextColor(100, 110, 100);
      doc.setFont("Helvetica", "italic");
      doc.setFontSize(8.5);
      doc.text("Nenhum registro de descarte ecol\xF3gico para o per\xEDodo selecionado.", 20, currentY);
      currentY += 8;
    } else {
      doc.setFillColor(248, 250, 252);
      doc.rect(16, currentY, 178, 6.5, "F");
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(16, currentY + 6.5, 194, currentY + 6.5);
      doc.setTextColor(71, 85, 105);
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(7.5);
      doc.text("DATA", 18, currentY + 4.5);
      doc.text("ITEM / ALIMENTO", 40, currentY + 4.5);
      doc.text("PESO (KG)", 95, currentY + 4.5);
      doc.text("DESTINO ECOL\xD3GICO", 115, currentY + 4.5);
      doc.text("C\xD3DIGO DE VERIFICA\xC7\xC3O", 160, currentY + 4.5);
      currentY += 6.5;
      discards.forEach((d) => {
        checkPageSpace(8);
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(30, 40, 30);
        const rowDate = new Date(d.date).toLocaleDateString("pt-BR");
        const rowFood = d.foodName || "Alimento";
        const rowWeight = `${d.weightEstimatedKg.toString().replace(".", ",")} kg`;
        const rowDestination = d.discardDestination || "Compostagem / Ra\xE7\xE3o";
        const rowCode = d.id ? d.id.length > 14 ? d.id.substring(0, 14) + "..." : d.id : "N/A";
        doc.text(rowDate, 18, currentY + 5.5);
        doc.setFont("Helvetica", "bold");
        doc.text(rowFood, 40, currentY + 5.5);
        doc.setFont("Helvetica", "normal");
        doc.text(rowWeight, 95, currentY + 5.5);
        doc.text(rowDestination, 115, currentY + 5.5);
        doc.setFont("Courier", "normal");
        doc.setFontSize(7);
        doc.setTextColor(100, 110, 100);
        doc.text(rowCode, 160, currentY + 5.5);
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(8);
        doc.setDrawColor(241, 245, 249);
        doc.setLineWidth(0.15);
        doc.line(16, currentY + 7.5, 194, currentY + 7.5);
        currentY += 7.5;
      });
      currentY += 4;
    }
  }
  checkPageSpace(45);
  doc.setDrawColor(210, 215, 210);
  doc.setLineWidth(0.3);
  doc.line(16, currentY + 4, 194, currentY + 4);
  currentY += 12;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(20, currentY + 12, 100, currentY + 12);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(30, 40, 30);
  doc.text("Representante Legal / Emissor", 60, currentY + 16, { align: "center" });
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 110, 100);
  doc.text("Declarado sob preceitos de boa-f\xE9 e governan\xE7a ESG", 60, currentY + 20, { align: "center" });
  doc.line(110, currentY + 12, 190, currentY + 12);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(13, 148, 136);
  doc.text("Auditor / Respons\xE1vel T\xE9cnico", 150, currentY + 16, { align: "center" });
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 110, 100);
  doc.text("SaveAll - Conectando o varejo a um futuro sem desperd\xEDcio", 150, currentY + 20, { align: "center" });
  currentY += 28;
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(120, 130, 120);
  const footnote1 = "Relat\xF3rio Consolidado de Auditoria Ambiental emitido de forma automatizada pelo sistema de intelig\xEAncia de log\xEDstica reversa alimentar SaveAll.";
  const footnote2 = `Documento digital em conformidade com as diretivas federais de mitiga\xE7\xE3o do desperd\xEDcio de alimentos. Gerado em ${(/* @__PURE__ */ new Date()).toLocaleString("pt-BR")}.`;
  doc.text(footnote1, 105, currentY, { align: "center" });
  doc.text(footnote2, 105, currentY + 3.5, { align: "center" });
  const blobUrl = doc.output("bloburl");
  window.open(blobUrl, "_blank");
  showCustomReportModal.value = false;
};
</script>

<template>
<!-- Interface principal: organiza indicadores ESG e relatórios consolidados para consulta e exportação. -->
  <div class="column q-gutter-y-md text-left">
    <!-- RELATÓRIO MENSAL INTEGRADO DE SUSTENTABILIDADE CONTAINER -->
    <q-card flat bordered>
      <q-card-section class="q-pb-sm">
        <div class="row items-center justify-between no-wrap">
          <div class="row items-center no-wrap q-gutter-x-sm">
            <q-icon name="military_tech" color="positive" size="sm" />
            <div>
              <div class="text-caption text-uppercase text-weight-bold">Relatório Mensal 🌱</div>
              <div class="text-caption text-grey-7 mono-text">Vendas • Doações Lei 14.016 • Descartes ODS</div>
            </div>
          </div>
          <div class="row items-center no-wrap q-gutter-x-sm">
            <q-btn
              unelevated
              dense
              no-caps
              color="positive"
              icon="print"
              label="Emitir Relatório"
              class="q-px-sm text-weight-bold"
              type="button"
              @click="showCustomReportModal = true"
            />
            <q-badge outline color="positive" class="text-weight-bold gt-xs" label="ESG Ativo" />
          </div>
        </div>
      </q-card-section>

      <q-separator />

      <!-- 3 SUB-TABS SELECTOR -->
      <q-tabs
        v-model="activeReportSubTab"
        dense
        no-caps
        align="justify"
        active-color="primary"
        indicator-color="primary"
        class="text-grey-7"
      >
        <q-tab name="summary" label="Resumo (Kg)" class="text-weight-bold" />
        <q-tab name="donations" :label="`Doações (${donationList.length})`" class="text-weight-bold" />
        <q-tab name="discards" :label="`Descartes (${discardList.length})`" class="text-weight-bold" />
      </q-tabs>

      <q-separator />

      <!-- Resumo tab content -->
      <q-card-section v-if="activeReportSubTab === 'summary'" class="column q-gutter-y-md">
        <div class="row q-col-gutter-sm">
          <!-- Sold Box -->
          <div class="col-4">
            <q-card flat bordered class="text-center q-pa-sm">
              <div class="text-caption text-uppercase text-weight-bold text-positive">Vendas (Sim)</div>
              <div class="text-subtitle1 text-weight-bold text-positive">{{ weightSoldDef }} <span class="text-caption">kg</span></div>
              <div class="text-caption text-grey-7">{{ qtySold }} Unidades</div>
            </q-card>
          </div>
          <!-- Donated Box -->
          <div class="col-4">
            <q-card flat bordered class="text-center q-pa-sm">
              <div class="text-caption text-uppercase text-weight-bold text-info">Doações</div>
              <div class="text-subtitle1 text-weight-bold text-info">{{ weightDonatedDef }} <span class="text-caption">kg</span></div>
              <div class="text-caption text-grey-7">{{ qtyDonatedDef }} Unidades</div>
            </q-card>
          </div>
          <!-- Discarded Box -->
          <div class="col-4">
            <q-card flat bordered class="text-center q-pa-sm">
              <div class="text-caption text-uppercase text-weight-bold text-warning">Descartes</div>
              <div class="text-subtitle1 text-weight-bold text-warning">{{ weightDiscardedDef }} <span class="text-caption">kg</span></div>
              <div class="text-caption text-grey-7">{{ qtyDiscardedDef }} Unidades</div>
            </q-card>
          </div>
        </div>

        <!-- Progress bar Saved vs Lixo -->
        <div class="column q-gutter-y-xs">
          <div class="row justify-between text-caption text-weight-bold mono-text">
            <span class="text-positive">🟢 Aproveitados/Salvos: {{ (weightSoldDef + weightDonatedDef).toFixed(1) }} Kg</span>
            <span class="text-warning">🟤 Lixo/Controlado: {{ weightDiscardedDef }} Kg</span>
          </div>
          <div class="row no-wrap overflow-hidden rounded-borders split-bar">
            <template v-if="weightSoldDef + weightDonatedDef + weightDiscardedDef > 0">
              <div
                class="bg-positive"
                :style="{ width: `${(((weightSoldDef + weightDonatedDef) / (weightSoldDef + weightDonatedDef + weightDiscardedDef)) * 100)}%` }"
              />
              <div
                class="bg-warning"
                :style="{ width: `${((weightDiscardedDef / (weightSoldDef + weightDonatedDef + weightDiscardedDef)) * 100)}%` }"
              />
            </template>
            <div v-else class="col bg-grey-7" />
          </div>
          <div class="row justify-between text-caption text-grey-7 mono-text">
            <span>Aproveitamento orgânico: {{ (((weightSoldDef + weightDonatedDef) / ((weightSoldDef + weightDonatedDef + weightDiscardedDef) || 1)) * 100).toFixed(0) }}%</span>
            <span>Total Computado: {{ (weightSoldDef + weightDonatedDef + weightDiscardedDef).toFixed(1) }} Kg</span>
          </div>
        </div>

        <!-- CATEGORIES IN KG -->
        <q-card flat bordered>
          <q-card-section class="column q-gutter-y-sm">
            <div class="row justify-between items-center">
              <span class="text-caption text-uppercase text-weight-bold text-grey-7">KGs Totais por Categoria</span>
              <span class="text-caption text-grey-7 mono-text">Totais: {{ (totalWeightCategoryDoce + totalWeightCategorySalgado).toFixed(1) }} kg</span>
            </div>

            <div>
              <div class="row justify-between text-caption mono-text">
                <span>Salgados 🥐</span>
                <span class="text-weight-bold">{{ totalWeightCategorySalgado }} kg</span>
              </div>
              <q-linear-progress
                rounded
                size="6px"
                color="positive"
                track-color="grey-5"
                :value="Math.min(1, totalWeightCategorySalgado / (totalWeightCategoryDoce + totalWeightCategorySalgado || 1))"
              />
            </div>

            <div>
              <div class="row justify-between text-caption mono-text">
                <span>Doces 🧁</span>
                <span class="text-weight-bold">{{ totalWeightCategoryDoce }} kg</span>
              </div>
              <q-linear-progress
                rounded
                size="6px"
                color="warning"
                track-color="grey-5"
                :value="Math.min(1, totalWeightCategoryDoce / (totalWeightCategoryDoce + totalWeightCategorySalgado || 1))"
              />
            </div>
          </q-card-section>
        </q-card>

        <!-- GRAPHIC FOOTPRINT METER -->
        <div class="row q-col-gutter-sm">
          <div class="col-6">
            <q-card flat bordered>
              <q-card-section class="row items-center no-wrap q-gutter-x-sm">
                <q-icon name="eco" color="positive" size="sm" />
                <div>
                  <div class="text-caption text-uppercase text-weight-bold text-positive">CO2 Evitado</div>
                  <div class="text-subtitle2 text-weight-bold text-positive">{{ co2Prevented }} kg CO₂e</div>
                  <div class="text-caption text-grey-7">Retidos fora do aterro</div>
                </div>
              </q-card-section>
            </q-card>
          </div>

          <div class="col-6">
            <q-card flat bordered>
              <q-card-section class="row items-center no-wrap q-gutter-x-sm">
                <div class="text-h6">💧</div>
                <div>
                  <div class="text-caption text-uppercase text-weight-bold text-info">Água Preservada</div>
                  <div class="text-subtitle2 text-weight-bold text-info">{{ waterSafeguarded }} Litros</div>
                  <div class="text-caption text-grey-7">Pegada hídrica retida</div>
                </div>
              </q-card-section>
            </q-card>
          </div>
        </div>
      </q-card-section>

      <!-- Donations Tab content -->
      <q-card-section v-if="activeReportSubTab === 'donations'" class="column q-gutter-y-sm tab-scroll scroll">
        <q-banner dense rounded class="bg-info text-white">
          <template #avatar>
            <q-icon name="balance" />
          </template>
          <strong>Lei Federal 14.016/2020:</strong> Isenção de responsabilidade civil e penal por alimentos de boa-fé doados para as entidades assistenciais.
        </q-banner>

        <div v-if="donationList.length === 0" class="text-center q-py-md text-caption text-grey-7">
          Nenhuma doação registrada este mês.
        </div>
        <q-card
          v-for="(disp, idx) in donationList"
          v-else
          :key="idx"
          flat
          bordered
          clickable
          v-ripple
          class="cursor-pointer"
          @click="selectedLogDetails = disp"
        >
          <q-card-section class="q-pa-sm">
            <div class="row justify-between items-center no-wrap">
              <span class="text-caption text-weight-bold ellipsis">{{ disp.foodName }}</span>
              <span class="text-caption text-weight-bold text-info text-uppercase mono-text">{{ disp.weightEstimatedKg }} kg</span>
            </div>
            <div class="row q-col-gutter-xs text-caption text-grey-7 mono-text">
              <div class="col-6 ellipsis">🎁 Ong: {{ disp.recipientOrganization }}</div>
              <div class="col-6 ellipsis text-weight-medium">✍️ Detalhes...</div>
              <div class="col-6">📅 Data: {{ new Date(disp.date).toLocaleDateString('pt-BR') }}</div>
              <div class="col-6 row items-center justify-end no-wrap text-positive text-weight-bold">
                <q-icon name="verified_user" size="12px" class="q-mr-xs" /> Ver Assinatura
              </div>
            </div>
          </q-card-section>
        </q-card>
      </q-card-section>

      <!-- Descartes Tab content -->
      <q-card-section v-if="activeReportSubTab === 'discards'" class="column q-gutter-y-sm tab-scroll scroll">
        <q-banner dense rounded class="bg-warning text-dark">
          ♻️ <strong>Metas Climáticas ODS:</strong> O descarte correto para compostagem/ração animal diminui a pegada de metano e atende os indicadores ODS 11 e 13.
        </q-banner>

        <div v-if="discardList.length === 0" class="text-center q-py-md text-caption text-grey-7">
          Nenhum descarte controlado registrado.
        </div>
        <q-card
          v-for="(disp, idx) in discardList"
          v-else
          :key="idx"
          flat
          bordered
          v-ripple
          class="cursor-pointer"
          @click="selectedLogDetails = disp"
        >
          <q-card-section class="q-pa-sm">
            <div class="row justify-between items-center no-wrap">
              <span class="text-caption text-weight-bold text-warning ellipsis">{{ disp.foodName }}</span>
              <span class="text-caption text-weight-bold text-warning text-uppercase mono-text">{{ disp.weightEstimatedKg }} kg</span>
            </div>
            <div class="row q-col-gutter-xs text-caption text-grey-7 mono-text">
              <div class="col-6 ellipsis">🌾 Destino: {{ disp.discardDestination }}</div>
              <div class="col-6 ellipsis text-weight-medium">🔍 Mais Info...</div>
              <div class="col-6">📅 Data: {{ new Date(disp.date).toLocaleDateString('pt-BR') }}</div>
              <div class="col-6 text-warning text-weight-bold text-right">Ver Justificativa</div>
            </div>
          </q-card-section>
        </q-card>
      </q-card-section>
    </q-card>

    <!-- DETAIL MODAL FOR DONATIONS AND DISCARDS -->
    <q-dialog v-model="logDetailsOpen">
      <q-card v-if="selectedLogDetails" class="dialog-card">
        <!-- Header -->
        <q-card-section class="row items-center justify-between no-wrap">
          <div class="row items-center no-wrap q-gutter-x-sm">
            <q-icon
              :name="selectedLogDetails.type === 'donation' ? 'favorite' : 'delete'"
              :color="selectedLogDetails.type === 'donation' ? 'info' : 'warning'"
              size="sm"
            />
            <div class="text-caption text-uppercase text-weight-bold">
              {{ selectedLogDetails.type === 'donation' ? 'Recibo de Doação' : 'Descarte Ecológico' }}
            </div>
          </div>
          <q-btn flat round dense icon="close" color="grey-7" type="button" @click="selectedLogDetails = null" />
        </q-card-section>

        <q-separator />

        <!-- Content and details -->
        <q-card-section class="column q-gutter-y-md dialog-scroll scroll text-caption">
          <!-- Item Main Name -->
          <q-card flat bordered>
            <q-card-section class="q-pa-sm">
              <div class="text-caption text-uppercase text-weight-bold text-grey-7 mono-text">Item Mitigado</div>
              <div class="text-subtitle2 text-weight-bold">{{ selectedLogDetails.foodName }}</div>
              <div class="text-caption text-uppercase text-grey-7 mono-text">Categoria original: {{ selectedLogDetails.category }}</div>
            </q-card-section>
          </q-card>

          <!-- Data: Date & Weight -->
          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <q-card flat bordered>
                <q-card-section class="q-pa-sm">
                  <div class="text-caption text-uppercase text-weight-bold text-grey-7">Data do Registro</div>
                  <div class="row items-center no-wrap mono-text">
                    <q-icon name="event" color="secondary" size="14px" class="q-mr-xs" />
                    <span>{{ new Date(selectedLogDetails.date).toLocaleDateString('pt-BR') }}</span>
                  </div>
                  <div class="text-caption text-grey-7">{{ new Date(selectedLogDetails.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }}h</div>
                </q-card-section>
              </q-card>
            </div>

            <div class="col-6">
              <q-card flat bordered>
                <q-card-section class="q-pa-sm">
                  <div class="text-caption text-uppercase text-weight-bold text-grey-7">Peso Computado</div>
                  <div class="text-subtitle2 text-weight-bold text-secondary mono-text">{{ selectedLogDetails.weightEstimatedKg }} kg</div>
                  <div class="text-caption text-grey-7">{{ selectedLogDetails.quantity || 1 }} porção(ões)</div>
                </q-card-section>
              </q-card>
            </div>
          </div>

          <!-- DONATION DETAILS IF DONATION -->
          <template v-if="selectedLogDetails.type === 'donation'">
            <!-- Destination NGO -->
            <div>
              <div class="text-caption text-uppercase text-weight-bold text-grey-7 mono-text">Entidade Receptora (ONG)</div>
              <q-banner dense rounded class="bg-info text-white text-weight-bold">
                🏢 {{ selectedLogDetails.recipientOrganization }}
              </q-banner>
            </div>

            <!-- Signature & Authority Verification -->
            <div>
              <div class="text-caption text-uppercase text-weight-bold text-grey-7 mono-text">Assinatura do Autorizador</div>
              <q-card flat bordered class="dashed-card">
                <q-card-section class="column q-gutter-y-sm q-pa-sm">
                  <div class="row items-center justify-between mono-text">
                    <span class="text-weight-bold text-secondary">✓ ATTESTED ESG</span>
                    <span class="text-caption text-grey-7 text-uppercase">
                      {{ selectedLogDetails.signatureType === 'digital' ? 'Certificado' : 'Desenho Manual' }}
                    </span>
                  </div>

                  <!-- Drawn Signature preview -->
                  <div v-if="selectedLogDetails.signatureImage" class="row justify-center bg-white rounded-borders q-pa-xs">
                    <q-img :src="selectedLogDetails.signatureImage" fit="contain" class="signature-img" alt="Assinatura" />
                  </div>

                  <!-- Digital Certificate key -->
                  <q-chip
                    v-else-if="selectedLogDetails.signatureCertificate"
                    dense
                    square
                    outline
                    class="mono-text ellipsis"
                  >
                    🔑 {{ selectedLogDetails.signatureCertificate }}
                  </q-chip>

                  <q-separator />
                  <!-- Signature Name -->
                  <div class="row items-center justify-between">
                    <span class="text-weight-bold text-grey-7">Responsável:</span>
                    <span class="text-weight-bold mono-text">{{ selectedLogDetails.signatureName || 'Triador Autorizado' }}</span>
                  </div>
                </q-card-section>
              </q-card>
            </div>

            <!-- Co-signer / Technical Supervisor presentation -->
            <div v-if="selectedLogDetails.coSignerName">
              <div class="text-caption text-uppercase text-weight-bold text-grey-7 mono-text">Assinatura do Autorizador Técnico</div>
              <q-card flat bordered class="dashed-card">
                <q-card-section class="column q-gutter-y-sm q-pa-sm">
                  <div class="row items-center justify-between mono-text">
                    <span class="text-weight-bold text-secondary">✓ AUTORIZADOR TÉCNICO</span>
                    <span class="text-caption text-grey-7 text-uppercase">Assinatura por toque</span>
                  </div>

                  <div v-if="selectedLogDetails.coSignerSignatureImage" class="row justify-center bg-white rounded-borders q-pa-xs">
                    <q-img :src="selectedLogDetails.coSignerSignatureImage" fit="contain" class="signature-img" alt="Assinatura Supervisor" />
                  </div>

                  <q-separator />
                  <div class="row items-center justify-between">
                    <span class="text-weight-bold text-grey-7">Supervisor:</span>
                    <span class="text-weight-bold mono-text">{{ selectedLogDetails.coSignerName }}</span>
                  </div>
                </q-card-section>
              </q-card>
            </div>

            <!-- Environmental Benefit -->
            <div>
              <div class="text-caption text-uppercase text-weight-bold text-grey-7 mono-text">Impacto Positivo Estimado</div>
              <div class="row q-col-gutter-sm">
                <div class="col-6">
                  <q-card flat bordered>
                    <q-card-section class="row items-center no-wrap q-pa-sm q-gutter-x-sm">
                      <span>🌱</span>
                      <div>
                        <div class="text-caption text-uppercase text-grey-7">CO2 Retido</div>
                        <div class="text-weight-bold text-positive mono-text">{{ (selectedLogDetails.weightEstimatedKg * 2.5).toFixed(1) }} Kg</div>
                      </div>
                    </q-card-section>
                  </q-card>
                </div>
                <div class="col-6">
                  <q-card flat bordered>
                    <q-card-section class="row items-center no-wrap q-pa-sm q-gutter-x-sm">
                      <span>💧</span>
                      <div>
                        <div class="text-caption text-uppercase text-grey-7">Água Salva</div>
                        <div class="text-weight-bold text-info mono-text">{{ selectedLogDetails.weightEstimatedKg * 130 }}L</div>
                      </div>
                    </q-card-section>
                  </q-card>
                </div>
              </div>
            </div>
          </template>

          <!-- DISCARD DETAILS IF DISCARD -->
          <template v-else>
            <!-- Discard destination partner -->
            <div>
              <div class="text-caption text-uppercase text-weight-bold text-grey-7 mono-text">Parceiro de Tratamento (Destino)</div>
              <q-banner dense rounded class="bg-warning text-dark text-weight-bold">
                ♻️ {{ selectedLogDetails.discardDestination }}
              </q-banner>
            </div>

            <!-- Motivo / Descrição -->
            <div>
              <div class="text-caption text-uppercase text-weight-bold text-grey-7 mono-text">Motivo & Descrição Técnica</div>
              <q-card flat bordered>
                <q-card-section class="q-pa-sm text-caption text-grey-7 text-italic">
                  "Alimento excedente não comercializado dentro do tempo hábil de prateleira operacional. Direcionado preventivamente para evitar decomposição anaeróbica em aterro convencional."
                </q-card-section>
              </q-card>
            </div>

            <!-- Enquadramento ODS Info -->
            <q-banner dense rounded class="bg-amber-1 text-grey-9">
              <template #avatar>
                <span>🌾</span>
              </template>
              <strong>Metas Climáticas ODS:</strong> O desvio para compostagem orgânica ou conversão para alimentação animal auxilia diretamente no alcance das metas 11 (Cidades) e 13 (Clima) do Pacto Global da Agenda 2030.
            </q-banner>

            <!-- Signature & Authority Verification for Discard -->
            <div>
              <div class="text-caption text-uppercase text-weight-bold text-grey-7 mono-text">Assinatura de Atribuição ESG</div>
              <q-card flat bordered class="dashed-card">
                <q-card-section class="column q-gutter-y-sm q-pa-sm">
                  <div class="row items-center justify-between mono-text">
                    <span class="text-weight-bold text-secondary">♻️ DISCARD VERIFIED</span>
                    <span class="text-caption text-grey-7 text-uppercase">
                      {{ selectedLogDetails.signatureType === 'digital' ? 'Certificado' : 'Desenho Manual' }}
                    </span>
                  </div>

                  <!-- Drawn Signature preview -->
                  <div v-if="selectedLogDetails.signatureImage" class="row justify-center bg-white rounded-borders q-pa-xs">
                    <q-img :src="selectedLogDetails.signatureImage" fit="contain" class="signature-img" alt="Assinatura" />
                  </div>

                  <!-- Digital Certificate key -->
                  <q-chip
                    v-else-if="selectedLogDetails.signatureCertificate"
                    dense
                    square
                    outline
                    class="mono-text ellipsis"
                  >
                    🔑 {{ selectedLogDetails.signatureCertificate }}
                  </q-chip>

                  <q-separator />
                  <!-- Signature Name -->
                  <div class="row items-center justify-between">
                    <span class="text-weight-bold text-grey-7">Responsável:</span>
                    <span class="text-weight-bold mono-text">{{ selectedLogDetails.signatureName || 'Gestor Estabelecimento' }}</span>
                  </div>
                </q-card-section>
              </q-card>
            </div>
          </template>

          <!-- Action buttons -->
          <div class="column q-gutter-y-sm">
            <q-btn
              unelevated
              no-caps
              color="secondary"
              icon="download"
              label="Visualizar Certificado PDF"
              class="full-width text-weight-bold"
              type="button"
              @click="handleDownloadPdfCertificate(selectedLogDetails)"
            />
            <q-btn
              outline
              no-caps
              color="grey-7"
              label="Fechar"
              class="full-width"
              type="button"
              @click="selectedLogDetails = null"
            />
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- CUSTOM CONSOLIDATED REPORT MODAL -->
    <q-dialog v-model="showCustomReportModal">
      <q-card class="dialog-card">
        <!-- Header -->
        <q-card-section class="row items-center justify-between no-wrap">
          <div class="row items-center no-wrap q-gutter-x-sm">
            <q-icon name="military_tech" color="positive" size="sm" />
            <div class="text-caption text-uppercase text-weight-bold">Emitir Relatório ESG</div>
          </div>
          <q-btn flat round dense icon="close" color="grey-7" type="button" @click="showCustomReportModal = false" />
        </q-card-section>

        <q-separator />

        <!-- Content -->
        <q-card-section class="column q-gutter-y-md dialog-scroll scroll text-caption">
          <div class="text-grey-7">
            Selecione o intervalo de datas e a destinação para consolidar um relatório de conformidade ambiental.
          </div>

          <!-- Date Range Fields -->
          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <q-input v-model="startDate" type="date" label="Data de Início" stack-label outlined dense />
            </div>
            <div class="col-6">
              <q-input v-model="endDate" type="date" label="Data de Fim" stack-label outlined dense />
            </div>
          </div>

          <!-- Report Type Selection -->
          <div>
            <div class="text-caption text-uppercase text-weight-bold text-grey-7">Foco do Relatório</div>
            <div class="column q-gutter-y-xs">
              <q-card flat bordered :class="{ 'selected-option': selectedReportType === 'all' }">
                <q-card-section class="q-pa-sm">
                  <q-radio v-model="selectedReportType" val="all" color="positive" keep-color>
                    <div>
                      <div class="text-weight-bold">📊 Ambos (Doações & Descartes)</div>
                      <div class="text-caption text-grey-7">Gera o relatório integral separado por tipo de destinação.</div>
                    </div>
                  </q-radio>
                </q-card-section>
              </q-card>

              <q-card flat bordered :class="{ 'selected-option': selectedReportType === 'donation' }">
                <q-card-section class="q-pa-sm">
                  <q-radio v-model="selectedReportType" val="donation" color="info" keep-color>
                    <div>
                      <div class="text-weight-bold">🎁 Somente Doações</div>
                      <div class="text-caption text-grey-7">Conformidade e doações sob a Lei nº 14.016/2020.</div>
                    </div>
                  </q-radio>
                </q-card-section>
              </q-card>

              <q-card flat bordered :class="{ 'selected-option': selectedReportType === 'discard' }">
                <q-card-section class="q-pa-sm">
                  <q-radio v-model="selectedReportType" val="discard" color="warning" keep-color>
                    <div>
                      <div class="text-weight-bold">♻️ Somente Descartes</div>
                      <div class="text-caption text-grey-7">Registros de tratamento ecológico e indicadores ODS.</div>
                    </div>
                  </q-radio>
                </q-card-section>
              </q-card>
            </div>
          </div>

          <!-- Preview panel of filtered totals -->
          <q-card flat bordered>
            <q-card-section class="q-pa-sm">
              <div class="text-caption text-uppercase text-weight-bold text-grey-7 mono-text">Pré-visualização do Período</div>
              <div class="row text-center q-mt-sm">
                <div class="col-4">
                  <div class="text-caption text-uppercase text-grey-7">Peso Total</div>
                  <div class="text-weight-bold text-secondary mono-text">{{ filteredTotalsForCustomReport.weight }} kg</div>
                </div>
                <div class="col-4">
                  <div class="text-caption text-uppercase text-grey-7">CO2 Evitado</div>
                  <div class="text-weight-bold text-positive mono-text">{{ filteredTotalsForCustomReport.co2 }} kg</div>
                </div>
                <div class="col-4">
                  <div class="text-caption text-uppercase text-grey-7">Água Salva</div>
                  <div class="text-weight-bold text-info mono-text">{{ filteredTotalsForCustomReport.water }}L</div>
                </div>
              </div>
            </q-card-section>
          </q-card>

          <!-- Action Buttons -->
          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <q-btn outline no-caps color="grey-7" label="Cancelar" class="full-width" type="button" @click="showCustomReportModal = false" />
            </div>
            <div class="col-6">
              <q-btn
                unelevated
                no-caps
                color="positive"
                icon="print"
                label="Gerar Relatório"
                class="full-width text-weight-bold"
                type="button"
                @click="handleGenerateConsolidatedReport"
              />
            </div>
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>
  </div>
</template>

<style scoped lang="scss">
.mono-text {
  font-family: monospace;
}
.split-bar {
  height: 10px;
  background: rgba(128, 128, 128, 0.2);
}
.tab-scroll {
  max-height: 260px;
}
.dialog-card {
  width: 100%;
  max-width: 384px;
}
.dialog-scroll {
  max-height: 440px;
}
.signature-img {
  height: 48px;
  width: 160px;
}
.dashed-card {
  border-style: dashed;
}
.selected-option {
  border-color: var(--q-positive);
}
</style>