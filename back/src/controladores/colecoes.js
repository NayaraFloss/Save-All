import { consultar } from '../config/db.js'
import { ErroHttp } from '../utils/erros.js'
import { registroParaFront } from '../utils/mapeadores.js'
import { adaptadorEntidades } from '../adaptadores/entidades.js'
import { adaptadorDestinos } from '../adaptadores/destinos.js'
import { adaptadorDoacoes } from '../adaptadores/doacoes.js'
import { adaptadorRegistros } from '../adaptadores/registros.js'

// Coleções que o front guardava no localStorage.
// As quatro primeiras usam as tabelas que o banco já tinha (com seus gatilhos e views de relatório);
// os chamados de suporte não tinham tabela e ficam em suporte_chamados (id + dados jsonb).
const TODOS = ['cliente', 'loja', 'entidade', 'descarte', 'master']

const COLECOES = {
  'parceiros-sociais': adaptadorEntidades, // entidades_sociais
  'parceiros-descarte': adaptadorDestinos, // destinos_descarte
  'ofertas-doacao': adaptadorDoacoes, // doacoes + termos_doacao + assinaturas_termo + transacao_itens
  'registros-descarte': adaptadorRegistros, // registros_descarte (descartes) + doacoes (registros de doação)
  'chamados-suporte': { tabela: 'suporte_chamados', ordem: 'criado_em DESC, id', podeEscrever: TODOS, podeRemover: ['master'], somenteDono: true }
}

export const ID_VALIDO = /^[A-Za-z0-9._:@-]{1,120}$/

const colecaoDe = (req) => {
  const colecao = COLECOES[req.params.colecao]
  if (!colecao) throw new ErroHttp(404, 'Coleção não encontrada.')
  return colecao
}

const idDe = (req) => {
  const id = String(req.params.id || '')
  if (!ID_VALIDO.test(id)) throw new ErroHttp(400, 'Identificador inválido.')
  return id
}

const corpoDe = (req) => {
  const corpo = req.body
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw new ErroHttp(400, 'Dados inválidos.')
  return corpo
}

// --- Coleção simples em jsonb (chamados) -----------------------------------------
const restrito = (colecao, req) => colecao.somenteDono && req.usuario.perfil !== 'master'

const json = {
  async listar(colecao, req) {
    const params = []
    let where = ''
    if (restrito(colecao, req)) {
      params.push(req.usuario.id)
      where = 'WHERE criado_por = $1'
    }
    const { rows } = await consultar(`SELECT id, dados FROM ${colecao.tabela} ${where} ORDER BY ${colecao.ordem}`, params)
    return rows.map(registroParaFront)
  },
  async salvar(colecao, req, id, corpo) {
    const { id: _ignorado, ...dados } = corpo
    if (restrito(colecao, req)) {
      const { rows } = await consultar(`SELECT criado_por FROM ${colecao.tabela} WHERE id = $1`, [id])
      if (rows[0] && rows[0].criado_por !== req.usuario.id) throw new ErroHttp(403, 'Este registro pertence a outro usuário.')
    }
    const { rows } = await consultar(
      `INSERT INTO ${colecao.tabela} (id, dados, criado_por) VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (id) DO UPDATE SET dados = EXCLUDED.dados, atualizado_em = now()
       RETURNING id, dados`,
      [id, JSON.stringify(dados), req.usuario.id]
    )
    return registroParaFront(rows[0])
  },
  async remover(colecao, _req, id) {
    await consultar(`DELETE FROM ${colecao.tabela} WHERE id = $1`, [id])
  }
}

// --- Rotas ---------------------------------------------------------------------------
export async function listar(req, res) {
  const colecao = colecaoDe(req)
  res.json(colecao.tabela ? await json.listar(colecao, req) : await colecao.listar(req))
}

export async function salvar(req, res) {
  const colecao = colecaoDe(req)
  if (!colecao.podeEscrever.includes(req.usuario.perfil)) throw new ErroHttp(403, 'Você não tem permissão para alterar estes dados.')
  const id = idDe(req)
  const corpo = corpoDe(req)
  res.json(colecao.tabela ? await json.salvar(colecao, req, id, corpo) : await colecao.salvar(req, id, corpo))
}

export async function remover(req, res) {
  const colecao = colecaoDe(req)
  if (!colecao.podeRemover.includes(req.usuario.perfil)) throw new ErroHttp(403, 'Você não tem permissão para remover estes dados.')
  const id = idDe(req)
  if (colecao.tabela) await json.remover(colecao, req, id)
  else await colecao.remover(req, id)
  res.json({ success: true })
}
