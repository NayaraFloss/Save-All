// Nomes dos perfis gravados no banco (em português) e a tradução para o
// nome que o front-end usa ("role"). O front continua falando inglês.
export const PERFIL = {
  CLIENTE: 'cliente',
  LOJA: 'loja',
  ENTIDADE: 'entidade',
  DESCARTE: 'descarte',
  MASTER: 'master'
}

const PARA_FRONT = {
  cliente: 'client',
  loja: 'store',
  entidade: 'institution',
  descarte: 'disposal',
  master: 'master'
}
const DO_FRONT = Object.fromEntries(Object.entries(PARA_FRONT).map(([pt, en]) => [en, pt]))

// banco -> front
export const perfilParaFront = (perfil) => PARA_FRONT[perfil] ?? perfil
// front -> banco (devolve null se o tipo não existe)
export const perfilDoFront = (role) => DO_FRONT[role] ?? null
