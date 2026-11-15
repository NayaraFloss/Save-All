// Exemplo de assinatura com certificado digital (formato de carimbo estilo ICP-Brasil).
// Os dados do certificado vêm do perfil da loja; o carimbo apenas organiza essas informações.

export const CERTIFICADO_EXEMPLO = 'e-CNPJ A1 · ICP-Brasil · EXEMPLO · Série 4F2A9C71'

const limpar = (texto) =>
  String(texto || '')
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '') // tira emojis, que o PDF não desenha
    .replace(/\s+/g, ' ')
    .trim()

const cortar = (texto, max) => (texto.length > max ? `${texto.slice(0, max - 3)}...` : texto)

export const detalhesAssinaturaDigital = (log) => {
  const data = new Date(log?.date)
  const hash = String(log?.sha256 || '').toUpperCase()
  return {
    titular: limpar(log?.signatureName || log?.nomeLoja) || 'Titular do certificado',
    cnpj: limpar(log?.storeCnpj),
    certificado: limpar(log?.signatureCertificate) || CERTIFICADO_EXEMPLO,
    algoritmo: 'SHA-256 com RSA 2048',
    assinadoEm: Number.isNaN(data.getTime()) ? '' : data.toLocaleString('pt-BR'),
    impressao: hash ? `${hash.slice(0, 8)}:${hash.slice(8, 16)}:${hash.slice(16, 24)}` : '',
  }
}

// Desenha o carimbo no PDF (jsPDF), centralizado em centroX, a partir da altura y.
export const desenharCarimboDigital = (doc, log, centroX, y, cor) => {
  const d = detalhesAssinaturaDigital(log)
  doc.setTextColor(cor[0], cor[1], cor[2])
  doc.setFont('Helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.text('ASSINADO DIGITALMENTE', centroX, y, { align: 'center' })
  doc.setFont('Helvetica', 'normal')
  doc.setFontSize(6.3)
  doc.setTextColor(70, 80, 70)
  const linhas = [
    `Titular: ${cortar(d.titular, 48)}`,
    d.cnpj ? `CNPJ: ${d.cnpj}` : '',
    `Cert.: ${cortar(d.certificado, 56)}`,
    `${d.algoritmo}${d.assinadoEm ? ` - ${d.assinadoEm}` : ''}`,
    d.impressao ? `Impressao: ${d.impressao}` : '',
  ].filter(Boolean)
  linhas.forEach((linha, i) => doc.text(linha, centroX, y + 4 + i * 3.5, { align: 'center' }))
}
