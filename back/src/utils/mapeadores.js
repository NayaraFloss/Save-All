// =====================================================================
// utils/mapeadores.js — "TRADUTORES" ENTRE BANCO E FRONT
// O banco usa nomes em português com_sublinhado (snake_case).
// O front usa nomes em inglês/camelCase. Estas funções convertem.
// =====================================================================

// Importa a função que descriptografa campos sensíveis e a lista desses campos
import { revelarExtras, CAMPOS_SENSIVEIS } from './criptografia.js'
// Importa o tradutor de perfil (ex.: 'loja' -> 'store')
import { perfilParaFront } from './perfis.js'

// Converte linhas do banco (snake_case, português) para o formato que o front já usa
// (camelCase, inglês). Campos nulos são omitidos, como no mock original.
// Remove do objeto todas as chaves cujo valor é null ou undefined
const semNulos = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined))

// Converte um usuário do banco para o formato do front
export const usuarioParaFront = (u) =>
  // Monta o objeto e tira os campos vazios
  semNulos({
    // Começa com os dados extras (descriptografados), e os campos abaixo sobrescrevem se repetirem
    ...revelarExtras(u.extras),
    // Código do usuário
    id: u.id,
    // Número sequencial do usuário
    idNumerico: u.id_numerico,
    // Data de criação da conta
    criadoEm: u.criado_em,
    // Nome
    name: u.nome,
    // E-mail
    email: u.email,
    // Perfil traduzido para o front
    role: perfilParaFront(u.perfil),
    // Pontos acumulados
    points: u.pontos,
    // Quanto o cliente já economizou
    valorTotalEconomizado: u.valor_economizado,
    // Lucro acumulado (lojas)
    lucroAcumulado: u.lucro_acumulado,
    // Endereço da foto de perfil
    urlAvatar: u.avatar_url,
    // Endereço
    address: u.endereco,
    // CPF ou CNPJ
    cpfCnpj: u.cpf_cnpj,
    // Data de nascimento
    dataNascimento: u.data_nascimento,
    // Se aceitou os termos de uso
    termosAceitos: u.termos_aceitos,
    // Se a conta foi verificada
    verificado: u.verificado,
    // Só lojas recebem estrelas
    // Nota média: só aparece se for loja
    rating: u.perfil === 'loja' ? u.nota : null,
    // Quantidade de avaliações: só para loja
    qtdAvaliacoes: u.perfil === 'loja' ? u.qtd_avaliacoes : null,
    // Quantidade de reclamações: não aparece para cliente
    qtdReclamacoes: u.perfil === 'cliente' ? null : u.qtd_reclamacoes,
    // Se está suspenso: não aparece para cliente
    suspenso: u.perfil === 'cliente' ? null : u.suspenso,
    // Motivo da suspensão
    motivoDesvinculo: u.motivo_desvinculo,
    // WhatsApp fica na coluna telefone (cadastros antigos podem ter só em extras)
    // Usa o telefone; se não houver, tenta o whatsapp guardado nos extras
    whatsapp: u.telefone || u.extras?.whatsapp
  // Fecha o objeto e o semNulos
  })

// Versão para listar usuários de outras pessoas (painel master): sem certificado digital.
export const usuarioSemSegredos = (u) => {
  // Converte normalmente
  const usuario = usuarioParaFront(u)
  // Apaga cada campo sensível (senha e arquivo do certificado)
  for (const campo of CAMPOS_SENSIVEIS) delete usuario[campo]
  // Devolve o usuário sem segredos
  return usuario
// Fecha a função
}

// Linha de uma coleção (tabela com id + dados jsonb) -> objeto do front
// Espalha o conteúdo de "dados" e acrescenta o id
export const registroParaFront = (r) => ({ ...(r.dados || {}), id: r.id })

// Converte uma loja do banco para o formato do front
export const lojaParaFront = (l) =>
  // Monta o objeto sem nulos
  semNulos({
    // Código da loja
    id: l.id,
    // Nome
    name: l.nome,
    // Logotipo
    logo: l.logo,
    // Categoria (mercado, padaria...)
    category: l.categoria,
    // Nota média
    rating: l.nota,
    // Endereço
    address: l.endereco,
    // Cidade
    city: l.cidade,
    // Código do usuário dono da loja
    usuarioId: l.usuario_id,
    // Razão social
    razaoSocial: l.razao_social,
    // CNPJ
    cnpj: l.cnpj,
    // Telefone
    phone: l.telefone,
    // Se está suspensa
    suspenso: l.suspenso,
    // Motivo: só mostra se estiver suspensa
    motivoDesvinculo: l.suspenso ? l.motivo_desvinculo : null
  // Fecha o objeto
  })

// Espera a linha de "alimentos" com a coluna extra "nome_loja" (JOIN com lojas).
// Converte um alimento do banco para o formato do front
export const alimentoParaFront = (a) =>
  // Monta o objeto sem nulos
  semNulos({
    // Começa com os dados extras do alimento
    ...(a.extras || {}),
    // Código
    id: a.id,
    // Nome
    name: a.nome,
    // Loja dona do alimento
    lojaId: a.loja_id,
    // Nome da loja (vem do JOIN)
    nomeLoja: a.nome_loja,
    // Categoria
    category: a.categoria,
    // Data de fabricação
    dataFabricacao: a.data_fabricacao,
    // Data de validade
    dataValidade: a.data_validade,
    // Preço cheio
    precoOriginal: a.preco_original,
    // Preço com desconto
    precoComDesconto: a.preco_desconto,
    // Imagem
    image: a.imagem,
    // Situação (disponível, esgotado...)
    status: a.status,
    // Descrição
    description: a.descricao,
    // Quantidade em estoque
    quantity: a.quantidade,
    // Peso de cada unidade (kg): usado no cálculo do peso da doação/descarte e do CO₂
    // Usa peso_unitario_kg; se não tiver, usa peso_kg; se nenhum, null
    weightKg: a.peso_unitario_kg != null ? Number(a.peso_unitario_kg) : a.peso_kg != null ? Number(a.peso_kg) : null,
    // Lista de lotes (cada lote com sua validade)
    lotes: a.lotes,
    // Quantas unidades estão vencidas
    quantidadeVencida: a.quantidadeVencida,
    // Quantas unidades ainda podem ser vendidas
    quantidadeVendavel: a.quantidadeVendavel,
    // Data em que foi cadastrado
    criadoEm: a.criado_em
  // Fecha o objeto
  })

// Converte um pedido do banco (e seus itens) para o formato do front
export const pedidoParaFront = (p, itens = []) =>
  // Monta o objeto sem nulos
  semNulos({
    // Começa com os dados extras do pedido
    ...(p.extras || {}),
    // Código do pedido
    id: p.id,
    // Código do cliente
    clienteId: p.cliente_id,
    // Nome do cliente
    nomeCliente: p.nome_cliente,
    // Código da loja
    lojaId: p.loja_id,
    // Nome da loja
    nomeLoja: p.nome_loja,
    // Converte cada item do pedido para o formato do front
    items: itens.map((i) => ({ itemId: i.alimento_id, name: i.nome, quantity: i.quantidade, price: i.preco })),
    // Soma dos itens
    subtotal: p.subtotal,
    // Taxa de entrega
    taxaEntrega: p.taxa_entrega,
    // Desconto conseguido com pontos
    descontoPontos: p.desconto_pontos,
    // Quantos pontos foram usados
    pontosUsados: p.pontos_usados,
    // Valor final
    total: p.total,
    // Forma de pagamento
    formaPagamento: p.forma_pagamento,
    // Situação do pedido
    status: p.status,
    // Endereço de entrega
    address: p.endereco,
    // Nota dada à comida
    notaComida: p.nota_comida,
    // Comentário sobre a comida
    comentarioComida: p.comentario_comida,
    // Reclamação: só aparece se o pedido já foi avaliado
    reclamacaoComida: p.avaliado_em ? p.reclamacao_comida : null,
    // Quando foi avaliado
    avaliadoEm: p.avaliado_em,
    // Quando foi entregue
    entregueEm: p.entregue_em,
    // Data de criação do pedido
    date: p.criado_em
  // Fecha o objeto
  })
