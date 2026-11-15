import { consultar } from '../config/db.js'
import { lojaParaFront } from '../utils/mapeadores.js'

// Vitrine dos clientes: só estabelecimentos com conta de acesso (usuário dono).
// Lojas antigas sem dono (cadastros de exemplo) ficam de fora; o master vê todas em /master/lojas.
// Se o dono enviou uma foto da marca no perfil, ela é o logo da loja.
export async function listar(_req, res) {
  const { rows } = await consultar(
    `SELECT l.*, u.avatar_url AS foto_do_dono
       FROM lojas l
       JOIN usuarios u ON u.id = l.usuario_id
      ORDER BY l.cidade NULLS LAST, l.nome`
  )
  res.json(
    rows.map((l) => {
      const foto = String(l.foto_do_dono || '')
      const fotoPropria = foto.startsWith('data:') || foto.startsWith('http')
      return lojaParaFront({ ...l, logo: fotoPropria ? foto : l.logo })
    })
  )
}
