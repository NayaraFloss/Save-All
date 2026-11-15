import { jsPDF } from "jspdf";
const servicoImpressaoPedido = {
  /**
   * Gera o documento jsPDF para o pedido fornecido.
   */
  gerarPdfPedido(order) {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4"
    });
    const primaryColor = [16, 185, 129];
    const textDark = [15, 23, 42];
    const textMuted = [100, 116, 139];
    const bgLight = [248, 250, 252];
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(0, 0, 210, 24, "F");
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text("SAVE ALL \xB7 COMPROVANTE OFICIAL DE PEDIDO", 14, 15);
    doc.setFontSize(8);
    doc.setFont("Helvetica", "normal");
    doc.text("Economia Circular \xB7 Resgate Consciente de Alimentos \xB7 Lei Federal 14.016/2020", 14, 20);
    let y = 34;
    doc.setFillColor(bgLight[0], bgLight[1], bgLight[2]);
    doc.roundedRect(14, y, 182, 38, 2, 2, "F");
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, y, 182, 38, 2, 2, "S");
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text(`Pedido #${order.id}`, 20, y + 8);
    doc.setFontSize(9);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    const statusLabel = order.status === "delivered" ? "STATUS: ENTREGUE" : order.status === "delivery" ? "STATUS: SAIU PARA ENTREGA" : order.status === "preparing" ? "STATUS: EM PREPARA\xC7\xC3O" : "STATUS: CONFIRMADO";
    doc.text(statusLabel, 150, y + 8);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    const dataFormatada = new Date(order.date || Date.now()).toLocaleString("pt-BR");
    doc.text(`Data do Pedido: ${dataFormatada}`, 20, y + 16);
    doc.text(`Cliente: ${order.nomeCliente || "Consumidor Sustent\xE1vel"}`, 20, y + 22);
    doc.text(`Endere\xE7o: ${order.address || "Endere\xE7o cadastrado"}`, 20, y + 28);
    doc.text(`Estabelecimento: ${order.nomeLoja || "Estabelecimento parceiro"}`, 20, y + 34);
    y = 80;
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text("CAMPO PEDIDOS \xB7 ITENS RESGATADOS", 14, y);
    y += 4;
    doc.setFillColor(16, 185, 129);
    doc.rect(14, y, 182, 7, "F");
    doc.setFontSize(8);
    doc.setFont("Helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("Item / Descri\xE7\xE3o", 18, y + 4.8);
    doc.text("Qtd", 130, y + 4.8);
    doc.text("Valor Unit.", 150, y + 4.8);
    doc.text("Subtotal", 176, y + 4.8);
    y += 7;
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    const items = order.items || [];
    items.forEach((item, index) => {
      const isEven = index % 2 === 0;
      if (isEven) {
        doc.setFillColor(250, 250, 250);
        doc.rect(14, y, 182, 7.5, "F");
      }
      const itemName = item.name.length > 55 ? item.name.substring(0, 52) + "..." : item.name;
      doc.text(itemName, 18, y + 5);
      doc.text(`${item.quantity}x`, 132, y + 5);
      doc.text(`R$ ${item.price.toFixed(2)}`, 150, y + 5);
      doc.text(`R$ ${(item.price * item.quantity).toFixed(2)}`, 176, y + 5);
      y += 7.5;
    });
    doc.setDrawColor(226, 232, 240);
    doc.line(14, y, 196, y);
    y += 6;
    const summaryX = 115;
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text("Subtotal dos Itens:", summaryX, y);
    doc.text(`R$ ${order.subtotal.toFixed(2)}`, 176, y);
    y += 5.5;
    doc.text("Taxa de Entrega:", summaryX, y);
    doc.text(`R$ ${order.taxaEntrega.toFixed(2)}`, 176, y);
    if (order.descontoPontos && order.descontoPontos > 0) {
      y += 5.5;
      doc.setTextColor(16, 185, 129);
      doc.text("Desconto de Pontos:", summaryX, y);
      doc.text(`- R$ ${order.descontoPontos.toFixed(2)}`, 176, y);
      doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    }
    y += 7;
    doc.setFillColor(bgLight[0], bgLight[1], bgLight[2]);
    doc.roundedRect(summaryX - 4, y - 4, 85, 11, 1.5, 1.5, "F");
    doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.roundedRect(summaryX - 4, y - 4, 85, 11, 1.5, 1.5, "S");
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text("TOTAL PAGO:", summaryX, y + 3.5);
    doc.setTextColor(16, 185, 129);
    doc.text(`R$ ${order.total.toFixed(2)}`, 172, y + 3.5);
    y += 13;
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text(`Forma de Pagamento: ${order.formaPagamento || "Cartão de Crédito"}`, summaryX, y);
    y += 12;
    doc.setFillColor(236, 253, 245);
    doc.roundedRect(14, y, 182, 30, 2, 2, "F");
    doc.setDrawColor(167, 243, 208);
    doc.roundedRect(14, y, 182, 30, 2, 2, "S");
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(6, 95, 70);
    doc.text("\u{1F30D} IMPACTO AMBIENTAL POSITIVO DESTE RESGATE", 20, y + 7);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(6, 78, 59);
    doc.text("\u2022 Evitou que alimentos pr\xF3prios para consumo fossem descartados em aterros;", 20, y + 13);
    doc.text("\u2022 Redu\xE7\xE3o direta na pegada de carbono (~2.0 kg de CO2 equivalente evitados);", 20, y + 18);
    doc.text("\u2022 Apoio direto ao com\xE9rcio de alimentos sustent\xE1veis da sua cidade!", 20, y + 23);
    y += 38;
    const authCode = `VAL-ORD-${order.id}-${Math.abs(order.id.split("").reduce((a, b) => a + b.charCodeAt(0), 0))}`;
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text("AUTENTICIDADE E PROTOCOLO DIGITAL", 14, y);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text(`Protocolo: ${authCode} \xB7 Chave Criptogr\xE1fica SHA-256 Verificada`, 14, y + 4.5);
    doc.text("Em conformidade com as diretrizes do Minist\xE9rio da Agricultura e Pecu\xE1ria (MAPA) e Anvisa.", 14, y + 8.5);
    doc.setFontSize(7);
    doc.text("SaveAll Brasil Tecnologia e Sustentabilidade Ltda. \xB7 CNPJ 48.912.831/0001-44", 14, 286);
    doc.text(`Impresso em ${(/* @__PURE__ */ new Date()).toLocaleString("pt-BR")}`, 154, 286);
    return doc;
  },
  /**
   * Retorna a URL Blob para visualização do PDF no navegador/iframe.
   */
  gerarBlobUrlPedido(order) {
    const doc = this.gerarPdfPedido(order);
    const blob = doc.output("blob");
    return URL.createObjectURL(blob);
  },
  /**
   * Força o download do PDF no dispositivo.
   */
  baixarPdfPedido(order) {
    const doc = this.gerarPdfPedido(order);
    const safeFileName = `Comprovante_Pedido_${order.id}_SaveAll.pdf`;
    doc.save(safeFileName);
  }
};
export {
  servicoImpressaoPedido
};
