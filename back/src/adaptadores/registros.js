import { consultar, transacao } from '../config/db.js'
import { ErroHttp } from '../utils/erros.js'
import { limpar, extrasSem, textoOu, numeroOu, momentoOu, traduzir, montarInsert, montarUpdate, lojaDoUsuario, acharEntidade, garantirMesmaCidade } from './comum.js'
import { tratamentoParaBanco } from './destinos.js'
import { gravarItem, assinarTermo } from './doacoes.js'

// Registros ESG do front (esg_disposal_logs) <-> tabelas do banco:
//  - descarte (type "discard")  -> registros_descarte (o gatilho cria a transação e o item)
//  - doação   (type "donation") -> doacoes: o registro fica em extras.log da doação.
//    Se veio de uma consulta (ofertaId), usa essa doação; senão cria uma doação já concluída.
const MAPEADOS_DESCARTE = [
  'type', 'lojaId', 'nomeLoja', 'foodId', 'foodName', 'category', 'quantity', 'weightEstimatedKg', 'discardDestination',
  'discardTechnicalName', 'signatureCertificate', 'gpsCoordinates', 'date'
]
const ASSINATURA = { digital: 'certificado_digital', certificado_digital: 'certificado_digital', drawn: 'desenho', desenho: 'desenho', govbr: 'govbr' }

const descarteParaFront = (r) =>
  limpar({
    ...(r.extras || {}),
    id: r.id,
    type: 'discard',
    lojaId: r.loja_id,
    nomeLoja: r.l_nome ?? r.extras?.nomeLoja,
    foodId: r.alimento_id,
    foodName: r.descricao_item,
    category: r.categoria,
    quantity: r.quantidade,
    weightEstimatedKg: Number(r.kg),
    discardDestination: r.dest_nome ?? r.extras?.discardDestination,
    discardDestinationType: r.extras?.discardDestinationType ?? r.tipo_destinacao,
    discardTechnicalName: r.responsavel_nome,
    signatureCertificate: r.certificado,
    gpsCoordinates: r.coordenadas_gps,
    date: r.criado_em
  })

const doacaoComoRegistro = (r) =>
  limpar({
    ...r.extras.log,
    id: r.extras.log.id || r.id,
    type: 'donation',
    ofertaId: r.id,
    lojaId: r.loja_id,
    nomeLoja: r.l_nome ?? r.extras.log.nomeLoja,
    recipientOrganization: r.e_nome ?? r.extras.log.recipientOrganization,
    recipientCnpj: r.e_cnpj ?? r.extras.log.recipientCnpj,
    date: r.extras.log.date || r.concluida_em || r.criado_em
  })

async function lojaPermitida(req, corpo, db) {
  if (req.usuario.perfil === 'loja') {
    const loja = await lojaDoUsuario(consultar, req.usuario.id, db)
    if (!loja) throw new ErroHttp(403, 'Seu usuário não possui um estabelecimento.')
    return loja.id
  }
  if (req.usuario.perfil === 'master') {
    const lojaId = textoOu(corpo.lojaId, null, 100)
    if (!lojaId) throw new ErroHttp(400, 'Informe o estabelecimento do registro.')
    return lojaId
  }
  throw new ErroHttp(403, 'Somente o estabelecimento registra doações e descartes.')
}

async function salvarDescarte(req, id, corpo) {
  return transacao(async (db) => {
    const lojaId = await lojaPermitida(req, corpo, db)
    const { rows: atual } = await consultar('SELECT * FROM registros_descarte WHERE id = $1 FOR UPDATE', [id], db)
    if (atual[0] && atual[0].loja_id !== lojaId && req.usuario.perfil !== 'master') throw new ErroHttp(403, 'Registro de outro estabelecimento.')

    let destino = null
    if (corpo.discardDestination) {
      const { rows } = await consultar(
        'SELECT id, nome, cidade, tipo_tratamento, ativo, status_validacao FROM destinos_descarte WHERE lower(nome) = lower($1) LIMIT 1',
        [String(corpo.discardDestination).trim()], db)
      destino = rows[0] || null
    }
    // Destino cadastrado pelo master, ativo e da MESMA cidade da loja
    if (!atual[0]) {
      if (!destino) throw new ErroHttp(400, 'Escolha um aterro ou destino de descarte cadastrado para a sua cidade.')
      if (destino.ativo === false || destino.status_validacao === 'unlinked' || destino.status_validacao === 'rejected') {
        throw new ErroHttp(400, `O destino ${destino.nome} está desativado.`)
      }
      await garantirMesmaCidade(consultar, lojaId, { nome: destino.nome, cidade: destino.cidade }, db)
    }
    const tipoFront = corpo.discardDestinationType || corpo.treatmentType
    const colunas = {
      loja_id: lojaId,
      destino_id: destino?.id || null,
      alimento_id: textoOu(corpo.foodId, null, 120),
      descricao_item: textoOu(corpo.foodName, 'Resíduo orgânico', 160),
      categoria: textoOu(corpo.category, 'sem_categoria', 60),
      quantidade: Math.max(1, Math.round(numeroOu(corpo.quantity, 1))),
      kg: Math.max(0.001, numeroOu(corpo.weightEstimatedKg, 0.1)),
      tipo_destinacao: tipoFront ? tratamentoParaBanco(tipoFront) : destino?.tipo_tratamento || 'OUTRO',
      motivo: textoOu(corpo.reason || corpo.motivo, null, 500),
      responsavel_nome: textoOu(corpo.discardTechnicalName || corpo.signatureName, null, 160),
      tipo_assinatura: ASSINATURA[corpo.signatureType] || null,
      certificado: textoOu(corpo.signatureCertificate, null, 500),
      coordenadas_gps: textoOu(corpo.gpsCoordinates, null, 80),
      extras: extrasSem(corpo, MAPEADOS_DESCARTE)
    }
    if (atual[0]) {
      const q = montarUpdate('registros_descarte', id, colunas)
      await consultar(q.sql, q.valores, db)
    } else {
      const q = montarInsert('registros_descarte', {
        id,
        ...colunas,
        destinacao_confirmada_em: new Date().toISOString(),
        criado_em: momentoOu(corpo.date) || new Date().toISOString()
      })
      await consultar(q.sql, q.valores, db)
    }
    return id
  })
}

async function salvarDoacao(req, id, corpo) {
  return transacao(async (db) => {
    const lojaId = await lojaPermitida(req, corpo, db)
    const log = { ...corpo, id }
    // 1) Registro de uma consulta de doação já existente
    let { rows } = await consultar(
      `SELECT * FROM doacoes WHERE id = $1 OR extras->'log'->>'id' = $2 LIMIT 1 FOR UPDATE`, [corpo.ofertaId || '', id], db)
    if (rows[0]) {
      if (rows[0].loja_id !== lojaId && req.usuario.perfil !== 'master') throw new ErroHttp(403, 'Doação de outro estabelecimento.')
      await consultar(`UPDATE doacoes SET extras = extras || jsonb_build_object('log', $1::jsonb) WHERE id = $2`, [JSON.stringify(log), rows[0].id], db)
      return rows[0].id
    }
    // 2) Doação direta (sem consulta): cria a doação já concluída
    const entidade = await acharEntidade(consultar, { cnpj: corpo.recipientCnpj, nome: corpo.recipientOrganization }, db)
    if (!entidade) throw new ErroHttp(400, 'Entidade social não encontrada no cadastro.')
    await garantirMesmaCidade(consultar, lojaId, entidade, db)
    const agora = momentoOu(corpo.date) || new Date().toISOString()
    const q = montarInsert('doacoes', {
      id,
      loja_id: lojaId,
      entidade_id: entidade.id,
      descricao: textoOu(corpo.foodName, 'Doação direta', 160),
      data_validade: corpo.dataValidade ? String(corpo.dataValidade).slice(0, 10) : null,
      status: 'completed',
      concluida_em: agora,
      criado_em: agora,
      confirmado_por: textoOu(corpo.recipientRepresentativeName, null, 160),
      extras: { somenteRegistro: true, log }
    })
    const registro = (await consultar(q.sql, q.valores, db)).rows[0]
    await gravarItem(db, registro.transacao_id, corpo)
    await assinarTermo(db, registro.id, {
      parte: 'doador',
      nome: corpo.signatureName || corpo.nomeLoja,
      documento: corpo.storeCnpj,
      tipo: ASSINATURA[corpo.signatureType] || 'desenho',
      certificado: corpo.signatureCertificate,
      imagem: corpo.signatureImage
    })
    if (corpo.recipientRepresentativeName) {
      await assinarTermo(db, registro.id, {
        parte: 'receptor',
        nome: corpo.recipientRepresentativeName,
        documento: corpo.recipientRepresentativeCpf,
        tipo: 'desenho'
      })
    }
    return registro.id
  })
}

export const adaptadorRegistros = {
  podeEscrever: ['loja', 'master'],
  podeRemover: ['master'],

  async listar(req) {
    const params = []
    let filtroD = ''
    let filtroR = ''
    if (req.usuario.perfil === 'loja') {
      const loja = await lojaDoUsuario(consultar, req.usuario.id)
      if (!loja) return []
      params.push(loja.id)
      filtroR = 'WHERE r.loja_id = $1'
      filtroD = 'AND d.loja_id = $1'
    }
    const [descartes, doacoes] = await Promise.all([
      consultar(
        `SELECT r.*, l.nome AS l_nome, dd.nome AS dest_nome FROM registros_descarte r
           LEFT JOIN lojas l ON l.id = r.loja_id LEFT JOIN destinos_descarte dd ON dd.id = r.destino_id ${filtroR}`, params),
      consultar(
        `SELECT d.*, l.nome AS l_nome, e.nome AS e_nome, e.cnpj AS e_cnpj FROM doacoes d
           LEFT JOIN lojas l ON l.id = d.loja_id LEFT JOIN entidades_sociais e ON e.id = d.entidade_id
          WHERE d.extras ? 'log' ${filtroD}`, params)
    ])
    return [...descartes.rows.map(descarteParaFront), ...doacoes.rows.map(doacaoComoRegistro)]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
  },

  async salvar(req, id, corpo) {
    try {
      if (corpo.type === 'donation') await salvarDoacao(req, id, corpo)
      else await salvarDescarte(req, id, corpo)
      const lista = await this.listar(req)
      return lista.find((r) => r.id === id) || { ...corpo, id }
    } catch (erro) {
      throw traduzir(erro, { duplicado: 'Já existe um registro com este código.' })
    }
  },

  async remover(_req, id) {
    await transacao(async (db) => {
      const { rows } = await consultar('SELECT transacao_id FROM registros_descarte WHERE id = $1', [id], db)
      if (rows[0]) {
        await consultar('DELETE FROM registros_descarte WHERE id = $1', [id], db)
        if (rows[0].transacao_id) {
          await consultar('DELETE FROM transacao_itens WHERE transacao_id = $1', [rows[0].transacao_id], db)
          await consultar('DELETE FROM transacoes WHERE id = $1', [rows[0].transacao_id], db)
        }
        return
      }
      // Registro de doação: tira só o registro; a doação continua no histórico
      await consultar(`UPDATE doacoes SET extras = extras - 'log' WHERE extras->'log'->>'id' = $1 OR id = $1`, [id], db)
    })
  }
}
