// =====================================================================
// utils/perfis.js — TIPOS DE USUÁRIO
// Nomes dos perfis gravados no banco (em português) e a tradução para o
// nome que o front-end usa ("role"). O front continua falando inglês.
// =====================================================================

// Lista fixa com os nomes dos perfis, para não escrever texto solto pelo código
export const PERFIL = {
  // Consumidor que compra alimentos
  CLIENTE: 'cliente',
  // Estabelecimento (mercado, padaria...) que vende/doa
  LOJA: 'loja',
  // Entidade social (ONG, asilo...) que recebe doações
  ENTIDADE: 'entidade',
  // Empresa parceira de descarte/compostagem
  DESCARTE: 'descarte',
  // Administrador geral do sistema
  MASTER: 'master'
// Fecha o objeto
}

// Tabela de tradução: nome no banco -> nome no front
const PARA_FRONT = {
  // cliente vira client
  cliente: 'client',
  // loja vira store
  loja: 'store',
  // entidade vira institution
  entidade: 'institution',
  // descarte vira disposal
  descarte: 'disposal',
  // master continua master
  master: 'master'
// Fecha o objeto
}
// Cria a tabela ao contrário (front -> banco) invertendo cada par [pt, en] para [en, pt]
const DO_FRONT = Object.fromEntries(Object.entries(PARA_FRONT).map(([pt, en]) => [en, pt]))

// banco -> front
// Traduz um perfil do banco; se não existir na tabela, devolve o mesmo valor
export const perfilParaFront = (perfil) => PARA_FRONT[perfil] ?? perfil
// front -> banco (devolve null se o tipo não existe)
// Traduz um perfil do front; se não existir, devolve null
export const perfilDoFront = (role) => DO_FRONT[role] ?? null
