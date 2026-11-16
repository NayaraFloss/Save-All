import { revelarExtras, CAMPOS_SENSIVEIS } from './criptografia.js'
import { perfilParaFront } from './perfis.js'

// Converte linhas do banco (snake_case, português) para o formato que o front já usa
// (camelCase, inglês). Campos nulos são omitidos, como no mock original.
const semNulos = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined))

export const usuarioParaFront = (u) =>
  semNulos({
    ...revelarExtras(u.extras),
    id: u.id,
    idNumerico: u.id_numerico,
    criadoEm: u.criado_em,
    name: u.nome,
    email: u.email,
    role: perfilParaFront(u.perfil),
    points: u.pontos,
    valorTotalEconomizado: u.valor_economizado,
    lucroAcumulado: u.lucro_acumulado,
    urlAvatar: u.avatar_url,
    address: u.endereco,
    cpfCnpj: u.cpf_cnpj,
    dataNascimento: u.data_nascimento,
    termosAceitos: u.termos_aceitos,
    verificado: u.verificado,
    // Só lojas recebem estrelas
    rating: u.perfil === 'loja' ? u.nota : null,
    qtdAvaliacoes: u.perfil === 'loja' ? u.qtd_avaliacoes : null,
    qtdReclamacoes: u.perfil === 'cliente' ? null : u.qtd_reclamacoes,
    suspenso: u.perfil === 'cliente' ? null : u.suspenso,
    motivoDesvinculo: u.motivo_desvinculo,
    // WhatsApp fica na coluna telefone (cadastros antigos podem ter só em extras)
    whatsapp: u.telefone || u.extras?.whatsapp
  })

// Versão para listar usuários de outras pessoas (painel master): sem certificado digital.
export const usuarioSemSegredos = (u) => {
  const usuario = usuarioParaFront(u)
  for (const campo of CAMPOS_SENSIVEIS) delete usuario[campo]
  return usuario
}

// Linha de uma coleção (tabela com id + dados jsonb) -> objeto do front
export const registroParaFront = (r) => ({ ...(r.dados || {}), id: r.id })

export const lojaParaFront = (l) =>
  semNulos({
    id: l.id,
    name: l.nome,
    logo: l.logo,
    category: l.categoria,
    rating: l.nota,
    address: l.endereco,
    city: l.cidade,
    usuarioId: l.usuario_id,
    razaoSocial: l.razao_social,
    cnpj: l.cnpj,
    phone: l.telefone,
    suspenso: l.suspenso,
    motivoDesvinculo: l.suspenso ? l.motivo_desvinculo : null
  })

// Espera a linha de "alimentos" com a coluna extra "nome_loja" (JOIN com lojas).
export const alimentoParaFront = (a) =>
  semNulos({
    ...(a.extras || {}),
    id: a.id,
    name: a.nome,
    lojaId: a.loja_id,
    nomeLoja: a.nome_loja,
    category: a.categoria,
    dataFabricacao: a.data_fabricacao,
    dataValidade: a.data_validade,
    precoOriginal: a.preco_original,
    precoComDesconto: a.preco_desconto,
    image: a.imagem,
    status: a.status,
    description: a.descricao,
    quantity: a.quantidade,
    // Peso de cada unidade (kg): usado no cálculo do peso da doação/descarte e do CO₂
    weightKg: a.peso_unitario_kg != null ? Number(a.peso_unitario_kg) : a.peso_kg != null ? Number(a.peso_kg) : null,
    lotes: a.lotes,
    quantidadeVencida: a.quantidadeVencida,
    quantidadeVendavel: a.quantidadeVendavel,
    criadoEm: a.criado_em
  })

export const pedidoParaFront = (p, itens = []) =>
  semNulos({
    ...(p.extras || {}),
    id: p.id,
    clienteId: p.cliente_id,
    nomeCliente: p.nome_cliente,
    lojaId: p.loja_id,
    nomeLoja: p.nome_loja,
    items: itens.map((i) => ({ itemId: i.alimento_id, name: i.nome, quantity: i.quantidade, price: i.preco })),
    subtotal: p.subtotal,
    taxaEntrega: p.taxa_entrega,
    descontoPontos: p.desconto_pontos,
    pontosUsados: p.pontos_usados,
    total: p.total,
    formaPagamento: p.forma_pagamento,
    status: p.status,
    address: p.endereco,
    notaComida: p.nota_comida,
    comentarioComida: p.comentario_comida,
    reclamacaoComida: p.avaliado_em ? p.reclamacao_comida : null,
    avaliadoEm: p.avaliado_em,
    entregueEm: p.entregue_em,
    date: p.criado_em
  })
