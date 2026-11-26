// =====================================================================
// controladores/lojas.js — LISTA DE LOJAS PARA OS CLIENTES
// =====================================================================

// Importa a função de consulta ao banco
import { consultar } from '../config/db.js'
// Importa o tradutor de loja (banco -> front)
import { lojaParaFront } from '../utils/mapeadores.js'

// Vitrine dos clientes: só estabelecimentos com conta de acesso (usuário dono).
// Lojas antigas sem dono (cadastros de exemplo) ficam de fora; o master vê todas em /master/lojas.
// Se o dono enviou uma foto da marca no perfil, ela é o logo da loja.
// Função chamada pela rota GET /stores
export async function listar(_req, res) {
  // Busca as lojas no banco
  const { rows } = await consultar(
    `SELECT l.*, u.avatar_url AS foto_do_dono -- pega tudo da loja + a foto do dono
       FROM lojas l -- da tabela lojas (apelido "l")
       JOIN usuarios u ON u.id = l.usuario_id -- junta com o usuário dono (só lojas que têm dono)
      ORDER BY l.cidade NULLS LAST, l.nome` // ordena por cidade (sem cidade vai para o fim) e depois por nome
  // Fecha a consulta
  )
  // Responde em JSON
  res.json(
    // Transforma cada linha
    rows.map((l) => {
      // Converte a foto do dono em texto (ou vazio)
      const foto = String(l.foto_do_dono || '')
      // É uma foto própria se for imagem embutida (data:) ou um link (http)
      const fotoPropria = foto.startsWith('data:') || foto.startsWith('http')
      // Converte para o front, usando a foto do dono como logo quando existir
      return lojaParaFront({ ...l, logo: fotoPropria ? foto : l.logo })
    // Fecha o map
    })
  // Fecha o res.json
  )
// Fecha a função
}
