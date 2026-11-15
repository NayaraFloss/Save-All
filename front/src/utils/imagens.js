// Prepara uma imagem escolhida pelo usuário (ex.: foto da marca da loja) antes de salvar:
// encaixa a imagem inteira num quadrado e comprime, para ocupar poucos KB no banco.
export const TIPOS_IMAGEM_ACEITOS = ['image/png', 'image/jpeg', 'image/webp']
export const TAMANHO_MAXIMO_ORIGINAL = 5 * 1024 * 1024 // 5 MB

// Calcula onde desenhar a imagem para ela caber inteira, centralizada, num quadrado de "lado" px.
export const calcularEncaixe = (largura, altura, lado) => {
  const escala = lado / Math.max(largura, altura)
  const larguraFinal = Math.round(largura * escala)
  const alturaFinal = Math.round(altura * escala)
  return {
    x: Math.round((lado - larguraFinal) / 2),
    y: Math.round((lado - alturaFinal) / 2),
    largura: larguraFinal,
    altura: alturaFinal,
  }
}

const lerArquivo = (arquivo) =>
  new Promise((resolver, rejeitar) => {
    const leitor = new FileReader()
    leitor.onload = () => resolver(leitor.result)
    leitor.onerror = () => rejeitar(new Error('Não foi possível ler o arquivo.'))
    leitor.readAsDataURL(arquivo)
  })

const carregarImagem = (url) =>
  new Promise((resolver, rejeitar) => {
    const imagem = new Image()
    imagem.onload = () => resolver(imagem)
    imagem.onerror = () => rejeitar(new Error('O arquivo escolhido não é uma imagem válida.'))
    imagem.src = url
  })

// Devolve a imagem como texto (data URL JPEG) pronta para salvar.
export const prepararImagemQuadrada = async (arquivo, lado = 256, qualidade = 0.85) => {
  if (!TIPOS_IMAGEM_ACEITOS.includes(arquivo.type)) {
    throw new Error('Use uma imagem nos formatos PNG, JPG ou WEBP.')
  }
  if (arquivo.size > TAMANHO_MAXIMO_ORIGINAL) {
    throw new Error('A imagem deve ter no máximo 5 MB.')
  }
  const imagem = await carregarImagem(await lerArquivo(arquivo))
  const encaixe = calcularEncaixe(imagem.width, imagem.height, lado)
  const tela = document.createElement('canvas')
  tela.width = lado
  tela.height = lado
  const contexto = tela.getContext('2d')
  contexto.fillStyle = '#ffffff'
  contexto.fillRect(0, 0, lado, lado)
  contexto.drawImage(imagem, encaixe.x, encaixe.y, encaixe.largura, encaixe.altura)
  return tela.toDataURL('image/jpeg', qualidade)
}
