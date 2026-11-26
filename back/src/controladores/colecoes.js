// =====================================================================
// controladores/colecoes.js — CRUD GENÉRICO DE "COLEÇÕES"
// Uma mesma rota (/dados/:colecao) serve várias listas diferentes.
// Cada coleção tem um "adaptador" que sabe ler/gravar na sua tabela.
// =====================================================================

// Importa a função de consulta ao banco
import { consultar } from '../config/db.js'
// Importa o erro com código HTTP
import { ErroHttp } from '../utils/erros.js'
// Importa o tradutor de registro genérico (id + dados)
import { registroParaFront } from '../utils/mapeadores.js'
// Importa o adaptador das entidades sociais
import { adaptadorEntidades } from '../adaptadores/entidades.js'
// Importa o adaptador dos destinos de descarte
import { adaptadorDestinos } from '../adaptadores/destinos.js'
// Importa o adaptador das doações
import { adaptadorDoacoes } from '../adaptadores/doacoes.js'
// Importa o adaptador dos registros de descarte/doação
import { adaptadorRegistros } from '../adaptadores/registros.js'

// Coleções que o front guardava no localStorage.
// As quatro primeiras usam as tabelas que o banco já tinha (com seus gatilhos e views de relatório);
// os chamados de suporte não tinham tabela e ficam em suporte_chamados (id + dados jsonb).
// Lista com todos os perfis
const TODOS = ['cliente', 'loja', 'entidade', 'descarte', 'master']

// "Cardápio" de coleções: nome usado na URL -> quem cuida dela
const COLECOES = {
  // /dados/parceiros-sociais
  'parceiros-sociais': adaptadorEntidades, // entidades_sociais
  // /dados/parceiros-descarte
  'parceiros-descarte': adaptadorDestinos, // destinos_descarte
  // /dados/ofertas-doacao
  'ofertas-doacao': adaptadorDoacoes, // doacoes + termos_doacao + assinaturas_termo + transacao_itens
  // /dados/registros-descarte
  'registros-descarte': adaptadorRegistros, // registros_descarte (descartes) + doacoes (registros de doação)
  // /dados/chamados-suporte: coleção simples, configurada aqui mesmo (tabela, ordem, quem escreve, quem apaga, só o dono vê)
  'chamados-suporte': { tabela: 'suporte_chamados', ordem: 'criado_em DESC, id', podeEscrever: TODOS, podeRemover: ['master'], somenteDono: true }
// Fecha o objeto
}

// Regra para ids aceitos: letras, números e . _ : @ -, de 1 a 120 caracteres
export const ID_VALIDO = /^[A-Za-z0-9._:@-]{1,120}$/

// Descobre a coleção pedida na URL
const colecaoDe = (req) => {
  // Procura no cardápio
  const colecao = COLECOES[req.params.colecao]
  // Se não existe: erro 404
  if (!colecao) throw new ErroHttp(404, 'Coleção não encontrada.')
  // Devolve a coleção
  return colecao
// Fecha a função
}

// Lê e valida o id da URL
const idDe = (req) => {
  // Pega o id como texto
  const id = String(req.params.id || '')
  // Se não obedece à regra: erro 400
  if (!ID_VALIDO.test(id)) throw new ErroHttp(400, 'Identificador inválido.')
  // Devolve o id
  return id
// Fecha a função
}

// Lê e valida o corpo da requisição
const corpoDe = (req) => {
  // Pega o corpo
  const corpo = req.body
  // Precisa ser um objeto (e não uma lista): senão erro 400
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw new ErroHttp(400, 'Dados inválidos.')
  // Devolve o corpo
  return corpo
// Fecha a função
}

// --- Coleção simples em jsonb (chamados) -----------------------------------------
// Diz se o usuário só pode ver os próprios registros (coleção "somenteDono" e não é master)
const restrito = (colecao, req) => colecao.somenteDono && req.usuario.perfil !== 'master'

// Funções para coleções simples (tabela com id + dados em JSON)
const json = {
  // Lista os registros
  async listar(colecao, req) {
    // Lista de parâmetros do SQL
    const params = []
    // Filtro do SQL (começa vazio)
    let where = ''
    // Se for restrito
    if (restrito(colecao, req)) {
      // Adiciona o id do usuário como $1
      params.push(req.usuario.id)
      // Filtra só os registros criados por ele
      where = 'WHERE criado_por = $1'
    // Fecha o if
    }
    // Busca id e dados na tabela, com o filtro e a ordem da coleção
    const { rows } = await consultar(`SELECT id, dados FROM ${colecao.tabela} ${where} ORDER BY ${colecao.ordem}`, params)
    // Converte cada linha para o formato do front
    return rows.map(registroParaFront)
  // Fecha listar
  },
  // Cria ou atualiza um registro
  async salvar(colecao, req, id, corpo) {
    // Separa o "id" do corpo (é ignorado) e fica com o resto em "dados"
    const { id: _ignorado, ...dados } = corpo
    // Se for restrito, confere se o registro é dele
    if (restrito(colecao, req)) {
      // Busca quem criou o registro
      const { rows } = await consultar(`SELECT criado_por FROM ${colecao.tabela} WHERE id = $1`, [id])
      // Se existe e é de outra pessoa: erro 403
      if (rows[0] && rows[0].criado_por !== req.usuario.id) throw new ErroHttp(403, 'Este registro pertence a outro usuário.')
    // Fecha o if
    }
    // Insere ou atualiza
    const { rows } = await consultar(
      `INSERT INTO ${colecao.tabela} (id, dados, criado_por) VALUES ($1, $2::jsonb, $3) -- tenta inserir
       ON CONFLICT (id) DO UPDATE SET dados = EXCLUDED.dados, atualizado_em = now() -- se o id já existe, atualiza
       RETURNING id, dados`, // devolve o que foi gravado
      // $1 id, $2 dados em JSON, $3 quem criou
      [id, JSON.stringify(dados), req.usuario.id]
    // Fecha a consulta
    )
    // Devolve no formato do front
    return registroParaFront(rows[0])
  // Fecha salvar
  },
  // Apaga um registro
  async remover(colecao, _req, id) {
    // DELETE pelo id
    await consultar(`DELETE FROM ${colecao.tabela} WHERE id = $1`, [id])
  // Fecha remover
  }
// Fecha o objeto json
}

// --- Rotas ---------------------------------------------------------------------------
// GET /dados/:colecao
export async function listar(req, res) {
  // Descobre a coleção
  const colecao = colecaoDe(req)
  // Se tem "tabela", é simples (usa json.listar); senão usa o adaptador próprio
  res.json(colecao.tabela ? await json.listar(colecao, req) : await colecao.listar(req))
// Fecha a função
}

// PUT /dados/:colecao/:id
export async function salvar(req, res) {
  // Descobre a coleção
  const colecao = colecaoDe(req)
  // Se o perfil não pode escrever nessa coleção: erro 403
  if (!colecao.podeEscrever.includes(req.usuario.perfil)) throw new ErroHttp(403, 'Você não tem permissão para alterar estes dados.')
  // Lê o id
  const id = idDe(req)
  // Lê o corpo
  const corpo = corpoDe(req)
  // Salva pelo caminho simples ou pelo adaptador, e responde
  res.json(colecao.tabela ? await json.salvar(colecao, req, id, corpo) : await colecao.salvar(req, id, corpo))
// Fecha a função
}

// DELETE /dados/:colecao/:id
export async function remover(req, res) {
  // Descobre a coleção
  const colecao = colecaoDe(req)
  // Se o perfil não pode apagar: erro 403
  if (!colecao.podeRemover.includes(req.usuario.perfil)) throw new ErroHttp(403, 'Você não tem permissão para remover estes dados.')
  // Lê o id
  const id = idDe(req)
  // Coleção simples: apaga direto
  if (colecao.tabela) await json.remover(colecao, req, id)
  // Senão: deixa o adaptador apagar
  else await colecao.remover(req, id)
  // Responde sucesso
  res.json({ success: true })
// Fecha a função
}
