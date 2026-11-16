import { consultar } from '../config/db.js'
import { ErroHttp } from './erros.js'

// ---------------------------------------------------------------------------
// Estoque por lote (validade).
//
// Um item da loja (tabela "alimentos") continua sendo UM só item. Cada entrada de
// estoque com validade diferente vira um lote em "alimento_lotes".
//
// O item sempre reflete o lote que deve sair primeiro (o que vence antes e ainda não
// venceu): "quantidade" = soma de todos os lotes e "data_fabricacao"/"data_validade"
// = datas desse lote. Assim a precificação dinâmica (que lê essas datas do item)
// passa sozinha para a promoção do 2º lote quando o 1º acaba.
// ---------------------------------------------------------------------------

const VIEW_PRECO = `
  SELECT COALESCE(v.preco_calculado, a.preco_desconto) AS preco, COALESCE(v.vencido, FALSE) AS vencido
    FROM alimentos a LEFT JOIN visao_alimentos_desconto v ON v.alimento_id = a.id
   WHERE a.id = $1`

// Lotes ainda vendáveis primeiro (não vencidos), do que vence antes para o que vence depois.
const ORDEM_SAIDA = `ORDER BY (data_validade < CURRENT_DATE), data_validade ASC, data_fabricacao ASC NULLS LAST, id ASC`

export const normalizarNome = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

export const loteParaFront = (l) => ({
  id: l.id,
  quantity: l.quantidade,
  dataFabricacao: l.data_fabricacao,
  dataValidade: l.data_validade,
  // Lote com a validade já passada: continua no estoque até a loja doar ou descartar
  vencido: !!l.vencido
})

// Anexa "lotes" (ordem de saída) a cada linha de alimento.
export async function anexarLotes(rows, db) {
  if (!rows.length) return rows
  const { rows: lotes } = await consultar(
    `SELECT *, (data_validade < CURRENT_DATE) AS vencido
       FROM alimento_lotes WHERE alimento_id = ANY($1) AND quantidade > 0 ${ORDEM_SAIDA}`,
    [rows.map((r) => r.id)],
    db
  )
  const porItem = new Map()
  for (const l of lotes) {
    if (!porItem.has(l.alimento_id)) porItem.set(l.alimento_id, [])
    porItem.get(l.alimento_id).push(loteParaFront(l))
  }
  // Item antigo, sem nenhum lote gravado: trata o estoque dele como um lote único (pela validade do
  // próprio item), para vencidos/vendáveis funcionarem em TODAS as lojas, mesmo sem migração.
  const semLote = rows.filter((r) => !porItem.has(r.id) && Number(r.quantidade) > 0 && r.data_validade)
  if (semLote.length) {
    const { rows: venc } = await consultar(
      'SELECT id, (data_validade < CURRENT_DATE) AS vencido FROM alimentos WHERE id = ANY($1)',
      [semLote.map((r) => r.id)],
      db
    )
    const vencidoPorId = new Map(venc.map((v) => [v.id, v.vencido]))
    for (const r of semLote) {
      porItem.set(r.id, [
        loteParaFront({
          id: `item-${r.id}`,
          quantidade: Number(r.quantidade),
          data_fabricacao: r.data_fabricacao,
          data_validade: r.data_validade,
          vencido: vencidoPorId.get(r.id)
        })
      ])
    }
  }
  return rows.map((r) => {
    const lotesDoItem = porItem.get(r.id) || []
    const quantidadeVencida = lotesDoItem.filter((l) => l.vencido).reduce((s, l) => s + l.quantity, 0)
    const quantidadeTotal = lotesDoItem.reduce((s, l) => s + l.quantity, 0)
    return {
      ...r,
      lotes: lotesDoItem,
      // Sacolas que ainda podem ser vendidas x sacolas vencidas (separadas para doação/descarte)
      quantidadeVencida,
      quantidadeVendavel: Math.max(0, quantidadeTotal - quantidadeVencida)
    }
  })
}

// Item sem nenhum lote gravado (cadastrado antes do controle por lote): cria o lote único a partir
// do estoque e da validade do próprio item. Rodar dentro de transação, com o item já travado.
export async function garantirLote(db, alimentoId) {
  await consultar(
    `INSERT INTO alimento_lotes (alimento_id, quantidade, data_fabricacao, data_validade)
     SELECT a.id, a.quantidade, a.data_fabricacao, a.data_validade
       FROM alimentos a
      WHERE a.id = $1 AND a.quantidade > 0 AND a.data_validade IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM alimento_lotes l WHERE l.alimento_id = a.id)`,
    [alimentoId],
    db
  )
}

// Doação/descarte de vencidos: tira SÓ os lotes com validade passada. Os lotes bons continuam
// no estoque. Devolve quantas sacolas saíram e quantas sobraram (0 = o item ficou sem estoque).
export async function removerLotesVencidos(db, alimentoId) {
  await garantirLote(db, alimentoId)
  const { rows } = await consultar(
    'DELETE FROM alimento_lotes WHERE alimento_id = $1 AND data_validade < CURRENT_DATE RETURNING quantidade',
    [alimentoId],
    db
  )
  const removidas = rows.reduce((s, l) => s + l.quantidade, 0)
  const restante = await sincronizarAlimento(db, alimentoId)
  return { removidas, restante }
}

// Recalcula o item a partir dos lotes: remove lotes zerados, soma o estoque e
// aponta o item para o lote que sai primeiro.
export async function sincronizarAlimento(db, alimentoId) {
  await consultar('DELETE FROM alimento_lotes WHERE alimento_id = $1 AND quantidade <= 0', [alimentoId], db)
  const { rows } = await consultar(`SELECT * FROM alimento_lotes WHERE alimento_id = $1 ${ORDEM_SAIDA}`, [alimentoId], db)
  const total = rows.reduce((s, l) => s + l.quantidade, 0)
  if (rows.length) {
    await consultar(
      'UPDATE alimentos SET quantidade = $1, data_fabricacao = $2, data_validade = $3 WHERE id = $4',
      [total, rows[0].data_fabricacao, rows[0].data_validade, alimentoId],
      db
    )
  } else {
    await consultar('UPDATE alimentos SET quantidade = 0 WHERE id = $1', [alimentoId], db)
  }
  return total
}

// Itens cujo lote "da vez" já venceu mas têm outro lote dentro do prazo: passam para o próximo.
// Chamado ao listar a vitrine, porque a virada do dia acontece sem ninguém salvar nada.
export async function atualizarLotesVigentes(db) {
  const { rows } = await consultar(
    `SELECT a.id FROM alimentos a
      WHERE a.data_validade < CURRENT_DATE
        AND EXISTS (SELECT 1 FROM alimento_lotes l WHERE l.alimento_id = a.id AND l.quantidade > 0 AND l.data_validade >= CURRENT_DATE)`,
    [],
    db
  )
  for (const r of rows) await sincronizarAlimento(db, r.id)
}

// Entrada de estoque: soma no lote de mesma validade/fabricação, ou cria um lote novo.
export async function entrarLote(db, alimentoId, { quantidade, dataFabricacao, dataValidade }) {
  if (!(quantidade >= 1)) throw new ErroHttp(400, 'Informe a quantidade do lote.')
  if (!dataValidade) throw new ErroHttp(400, 'Informe a data de validade do lote.')
  const { rowCount } = await consultar(
    `UPDATE alimento_lotes SET quantidade = quantidade + $1
      WHERE id = (SELECT id FROM alimento_lotes
                   WHERE alimento_id = $2 AND data_validade = $3 AND data_fabricacao IS NOT DISTINCT FROM $4::date
                   ORDER BY id LIMIT 1)`,
    [quantidade, alimentoId, dataValidade, dataFabricacao || null],
    db
  )
  if (!rowCount) {
    await consultar(
      'INSERT INTO alimento_lotes (alimento_id, quantidade, data_fabricacao, data_validade) VALUES ($1,$2,$3,$4)',
      [alimentoId, quantidade, dataFabricacao || null, dataValidade],
      db
    )
  }
  return sincronizarAlimento(db, alimentoId)
}

// Edição manual do estoque: a lista recebida passa a ser a lista de lotes do item.
// Lotes com a mesma validade/fabricação são somados; lotes com quantidade 0 somem.
export async function substituirLotes(db, alimentoId, lotes) {
  const mapa = new Map()
  for (const l of lotes) {
    const quantidade = Number(l.quantidade)
    if (!Number.isInteger(quantidade) || quantidade < 0) throw new ErroHttp(400, 'Quantidade de lote inválida.')
    if (!l.dataValidade) throw new ErroHttp(400, 'Informe a data de validade de cada lote.')
    if (l.dataFabricacao && l.dataValidade < l.dataFabricacao)
      throw new ErroHttp(400, 'A validade de um lote não pode ser anterior à fabricação.')
    const chave = `${l.dataFabricacao || ''}|${l.dataValidade}`
    const atual = mapa.get(chave)
    if (atual) atual.quantidade += quantidade
    else mapa.set(chave, { ...l, quantidade })
  }
  await consultar('DELETE FROM alimento_lotes WHERE alimento_id = $1', [alimentoId], db)
  for (const l of mapa.values()) {
    if (l.quantidade <= 0) continue
    await consultar(
      'INSERT INTO alimento_lotes (alimento_id, quantidade, data_fabricacao, data_validade) VALUES ($1,$2,$3,$4)',
      [alimentoId, l.quantidade, l.dataFabricacao || null, l.dataValidade],
      db
    )
  }
  return sincronizarAlimento(db, alimentoId)
}

// Saída por pedido: tira SEMPRE do lote que vence primeiro; se ele acabar, completa com o próximo.
// Devolve as "porções" retiradas, cada uma com o preço vigente do lote de onde saiu
// (o preço de cada lote é lido da própria view de precificação dinâmica).
// Deve rodar dentro da transação do pedido, com a linha do item já travada (FOR UPDATE).
export async function baixarEstoque(db, alimento, quantidade) {
  await garantirLote(db, alimento.id)
  await sincronizarAlimento(db, alimento.id)
  const { rows: lotes } = await consultar(
    `SELECT * FROM alimento_lotes
      WHERE alimento_id = $1 AND quantidade > 0 AND data_validade >= CURRENT_DATE
      ORDER BY data_validade ASC, data_fabricacao ASC NULLS LAST, id ASC
        FOR UPDATE`,
    [alimento.id],
    db
  )
  const disponivel = lotes.reduce((s, l) => s + l.quantidade, 0)
  if (disponivel < quantidade) {
    throw new ErroHttp(409, `Estoque insuficiente de "${alimento.nome}" (restam ${disponivel}).`)
  }

  const porcoes = []
  let restante = quantidade
  for (const lote of lotes) {
    if (restante <= 0) break
    const tirar = Math.min(lote.quantidade, restante)

    // Aponta o item para este lote só para ler o preço dele; no fim, a sincronização
    // devolve o item para o lote que sai primeiro.
    await consultar('UPDATE alimentos SET data_fabricacao = $1, data_validade = $2 WHERE id = $3', [
      lote.data_fabricacao,
      lote.data_validade,
      alimento.id
    ], db)
    const {
      rows: [v]
    } = await consultar(VIEW_PRECO, [alimento.id], db)
    if (v.vencido) throw new ErroHttp(409, `"${alimento.nome}" venceu e não pode mais ser vendido.`)
    if (!(Number(v.preco) > 0)) throw new ErroHttp(409, `"${alimento.nome}" ainda não tem preço definido pela loja.`)

    await consultar('UPDATE alimento_lotes SET quantidade = quantidade - $1 WHERE id = $2', [tirar, lote.id], db)
    porcoes.push({
      quantidade: tirar,
      preco: Number(v.preco),
      dataFabricacao: lote.data_fabricacao,
      dataValidade: lote.data_validade
    })
    restante -= tirar
  }
  await sincronizarAlimento(db, alimento.id)
  return porcoes
}

// Guarda de quais lotes saiu cada porção do pedido.
export async function registrarSaidaDoPedido(db, pedidoId, alimentoId, porcoes) {
  for (const p of porcoes) {
    await consultar(
      'INSERT INTO pedido_item_lotes (pedido_id, alimento_id, data_fabricacao, data_validade, quantidade) VALUES ($1,$2,$3,$4,$5)',
      [String(pedidoId), alimentoId, p.dataFabricacao, p.dataValidade, p.quantidade],
      db
    )
  }
}

// Pedido cancelado: devolve cada porção ao lote de onde saiu (ou recria o lote).
export async function devolverEstoqueDoPedido(db, pedidoId) {
  const { rows } = await consultar('SELECT * FROM pedido_item_lotes WHERE pedido_id = $1', [String(pedidoId)], db)
  for (const r of rows) {
    const existe = await consultar('SELECT 1 FROM alimentos WHERE id = $1 FOR UPDATE', [r.alimento_id], db)
    if (!existe.rowCount) continue // item removido do catálogo depois da venda
    await entrarLote(db, r.alimento_id, {
      quantidade: r.quantidade,
      dataFabricacao: r.data_fabricacao,
      dataValidade: r.data_validade
    })
  }
  await consultar('DELETE FROM pedido_item_lotes WHERE pedido_id = $1', [String(pedidoId)], db)
}
