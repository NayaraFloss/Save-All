import { consultar, transacao } from "../config/db.js";
import { env } from "../config/env.js";
import { ErroHttp } from "../utils/erros.js";
import { pedidoParaFront } from "../utils/mapeadores.js";
import { texto, numero, arredondar, extrasDe } from "../utils/validacao.js";
import {
  baixarEstoque,
  registrarSaidaDoPedido,
  devolverEstoqueDoPedido,
  sincronizarAlimento,
} from "../utils/estoque.js";

const FLUXO = ["pending", "accepted", "preparing", "delivery", "delivered"];
const VALOR_PONTO = 0.005; // R$ por ponto (mesma regra da tela de finalização)
const LIMITE_RECLAMACOES = 5;
const JANELA_AVALIACAO_MS = 60 * 60 * 1000; // 1 hora após a entrega

async function anexarItens(pedidos, db) {
  if (!pedidos.length) return [];
  const { rows } = await consultar(
    "SELECT * FROM pedido_itens WHERE pedido_id = ANY($1) ORDER BY id",
    [pedidos.map((p) => p.id)],
    db,
  );
  const porPedido = new Map();
  for (const i of rows) {
    if (!porPedido.has(i.pedido_id)) porPedido.set(i.pedido_id, []);
    porPedido.get(i.pedido_id).push(i);
  }
  // WhatsApp do cliente e da loja (cadastrados no perfil), para o botão "Avisar pelo WhatsApp"
  const contatos = await consultar(
    `SELECT id, COALESCE(NULLIF(telefone, ''), extras->>'whatsapp') AS whatsapp FROM usuarios
      WHERE id = ANY($1) AND COALESCE(NULLIF(telefone, ''), extras->>'whatsapp', '') <> ''`,
    [[...new Set(pedidos.map((p) => p.cliente_id).filter(Boolean))]],
    db,
  );
  const whatsappDoCliente = new Map(
    contatos.rows.map((r) => [r.id, r.whatsapp]),
  );
  const lojas = await consultar(
    `SELECT l.id, COALESCE(NULLIF(l.telefone, ''), NULLIF(u.telefone, ''), u.extras->>'whatsapp') AS whatsapp
       FROM lojas l LEFT JOIN usuarios u ON u.id = l.usuario_id
      WHERE l.id = ANY($1) AND COALESCE(NULLIF(l.telefone, ''), NULLIF(u.telefone, ''), u.extras->>'whatsapp', '') <> ''`,
    [[...new Set(pedidos.map((p) => p.loja_id).filter(Boolean))]],
    db,
  );
  const whatsappDaLoja = new Map(lojas.rows.map((r) => [r.id, r.whatsapp]));
  return pedidos.map((p) => ({
    ...pedidoParaFront(p, porPedido.get(p.id) || []),
    ...(whatsappDoCliente.has(p.cliente_id)
      ? { whatsappCliente: whatsappDoCliente.get(p.cliente_id) }
      : {}),
    ...(whatsappDaLoja.has(p.loja_id)
      ? { whatsappLoja: whatsappDaLoja.get(p.loja_id) }
      : {}),
  }));
}

// Um usuário de loja pode ser dono de mais de um estabelecimento: considera TODOS (antes só o primeiro aparecia).
async function lojasDoUsuario(usuarioId, db) {
  const { rows } = await consultar(
    "SELECT id FROM lojas WHERE usuario_id = $1",
    [usuarioId],
    db,
  );
  return rows.map((r) => r.id);
}

export async function listar(req, res) {
  const { id, perfil } = req.usuario;
  const filtros = [];
  const params = [];
  const add = (sql, valor) => {
    params.push(valor);
    filtros.push(sql.replace("?", `$${params.length}`));
  };

  if (perfil === "cliente") {
    add("cliente_id = ?", id);
  } else if (perfil === "loja") {
    const lojaIds = await lojasDoUsuario(id);
    if (!lojaIds.length) return res.json([]);
    params.push(lojaIds);
    filtros.push(`loja_id = ANY($${params.length})`);
  } else if (perfil === "master") {
    if (req.query.clienteId) add("cliente_id = ?", String(req.query.clienteId));
    if (req.query.lojaId) add("loja_id = ?", String(req.query.lojaId));
  } else {
    return res.json([]); // entidades e descarte não têm pedidos
  }

  const where = filtros.length ? `WHERE ${filtros.join(" AND ")}` : "";
  const { rows } = await consultar(
    `SELECT * FROM pedidos ${where} ORDER BY criado_em DESC LIMIT 500`,
    params,
  );
  res.json(await anexarItens(rows));
}

export async function criar(req, res) {
  const c = req.body || {};
  if (!Array.isArray(c.items) || c.items.length === 0)
    throw new ErroHttp(400, "O pedido precisa ter ao menos um item.");
  if (c.items.length > 50) throw new ErroHttp(400, "Itens demais no pedido.");
  const formasPagamento = [
    "Pix",
    "Cartão",
    "Cartão de Crédito",
    "Cartão de Débito",
    "Dinheiro",
    "Vale-Refeição",
    "Vale-Alimentação",
  ];
  const pagamento = texto(c.formaPagamento, {
    campo: "forma de pagamento",
    max: 30,
    obrigatorio: true,
  });
  if (!formasPagamento.includes(pagamento))
    throw new ErroHttp(400, "Forma de pagamento inválida.");

  const pedido = await transacao(async (db) => {
    const {
      rows: [cliente],
    } = await consultar(
      "SELECT id, nome, pontos, endereco FROM usuarios WHERE id = $1 FOR UPDATE",
      [req.usuario.id],
      db,
    );
    const {
      rows: [loja],
    } = await consultar(
      "SELECT id, nome, usuario_id, suspenso FROM lojas WHERE id = $1",
      [String(c.lojaId || "")],
      db,
    );
    if (!loja) throw new ErroHttp(400, "Estabelecimento não encontrado.");
    // Pedido só entra em loja que tem conta para recebê-lo (senão ele "some": nenhum login de loja o enxerga).
    if (!loja.usuario_id)
      throw new ErroHttp(
        409,
        "Este estabelecimento ainda não tem uma conta ativa para receber pedidos. Tente sortear novamente.",
      );
    if (loja.suspenso)
      throw new ErroHttp(
        409,
        "Este estabelecimento está temporariamente indisponível. Tente sortear novamente.",
      );

    // Preços e estoque vêm do banco (nunca do que o navegador enviou).
    const itens = [];
    let subtotal = 0;
    for (const bruto of c.items) {
      const quantidade = numero(bruto.quantity, {
        campo: "quantidade",
        min: 1,
        max: 99,
        inteiro: true,
      });
      const itemId = String(bruto.itemId || "");
      // Trava o item e põe o lote que sai primeiro (o que vence antes) como o vigente de hoje.
      await consultar(
        "SELECT id FROM alimentos WHERE id = $1 FOR UPDATE",
        [itemId],
        db,
      );
      await sincronizarAlimento(db, itemId);
      const {
        rows: [alimento],
      } = await consultar(
        `SELECT a.*, COALESCE(v.preco_calculado, a.preco_desconto) AS preco_vigente, COALESCE(v.vencido, FALSE) AS vencido
           FROM alimentos a LEFT JOIN visao_alimentos_desconto v ON v.alimento_id = a.id
          WHERE a.id = $1`,
        [itemId],
        db,
      );
      if (!alimento || alimento.loja_id !== loja.id)
        throw new ErroHttp(
          400,
          "Um dos itens não pertence a este estabelecimento.",
        );
      if (alimento.status !== "active")
        throw new ErroHttp(409, `"${alimento.nome}" não está mais disponível.`);
      if (alimento.vencido)
        throw new ErroHttp(
          409,
          `"${alimento.nome}" venceu e não pode mais ser vendido.`,
        );
      if (!(Number(alimento.preco_vigente) > 0))
        throw new ErroHttp(
          409,
          `"${alimento.nome}" ainda não tem preço definido pela loja.`,
        );
      // Desconta do estoque, sempre do lote que vence primeiro. Se o pedido passar do que
      // resta nesse lote, o restante sai do próximo lote, com o preço (promoção) dele.
      const porcoes = await baixarEstoque(db, alimento, quantidade);
      for (const porcao of porcoes) {
        itens.push({
          alimentoId: alimento.id,
          nome: alimento.nome,
          quantidade: porcao.quantidade,
          preco: porcao.preco,
          porcoes: [porcao],
        });
        subtotal += porcao.preco * porcao.quantidade;
      }
    }
    subtotal = arredondar(subtotal);

    const pontosUsados = numero(c.pontosUsados, {
      campo: "pontos usados",
      max: 1e7,
      inteiro: true,
      padrao: 0,
    });
    if (pontosUsados > cliente.pontos)
      throw new ErroHttp(400, "Pontos insuficientes.");
    const taxaEntrega = env.taxaEntrega;
    const desconto = Math.min(
      arredondar(pontosUsados * VALOR_PONTO),
      subtotal + taxaEntrega,
    );
    const total = arredondar(Math.max(0, subtotal + taxaEntrega - desconto));

    const extras = extrasDe(c, [
      "id",
      "clienteId",
      "nomeCliente",
      "lojaId",
      "nomeLoja",
      "items",
      "subtotal",
      "taxaEntrega",
      "descontoPontos",
      "pontosUsados",
      "total",
      "formaPagamento",
      "status",
      "address",
      "date",
    ]);
    const {
      rows: [p],
    } = await consultar(
      `INSERT INTO pedidos (cliente_id, nome_cliente, loja_id, nome_loja, subtotal, taxa_entrega, desconto_pontos, pontos_usados, total, forma_pagamento, status, endereco, extras)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11,$12::jsonb) RETURNING *`,
      [
        cliente.id,
        cliente.nome,
        loja.id,
        loja.nome,
        subtotal,
        taxaEntrega,
        desconto,
        pontosUsados,
        total,
        pagamento,
        texto(c.address, { campo: "endereço", max: 255 }) || cliente.endereco,
        JSON.stringify(extras),
      ],
      db,
    );
    // Aviso no console da API: mostra para qual loja o sorteio mandou o pedido (útil para testar o rodízio)
    console.log(
      `[pedido] ${p.id} -> loja ${loja.id} "${loja.nome}" | dono: ${loja.usuario_id ?? "SEM DONO"} | cliente: ${cliente.nome}`,
    );
    for (const i of itens) {
      await consultar(
        "INSERT INTO pedido_itens (pedido_id, alimento_id, nome, quantidade, preco) VALUES ($1,$2,$3,$4,$5)",
        [p.id, i.alimentoId, i.nome, i.quantidade, i.preco],
        db,
      );
      await registrarSaidaDoPedido(db, p.id, i.alimentoId, i.porcoes);
    }

    // Pontos do cliente: gasta os usados e ganha 10 por real pago (regra do front).
    // valorTotalEconomizado acumula o subtotal, como no comportamento original.
    await consultar(
      "UPDATE usuarios SET pontos = pontos - $1 + $2, valor_economizado = valor_economizado + $3 WHERE id = $4",
      [pontosUsados, Math.floor(total * 10), subtotal, cliente.id],
      db,
    );
    if (loja.usuario_id) {
      await consultar(
        "UPDATE usuarios SET lucro_acumulado = lucro_acumulado + $1 WHERE id = $2",
        [total, loja.usuario_id],
        db,
      );
    }
    return anexarItens([p], db).then((l) => l[0]);
  });
  res.status(201).json(pedido);
}

// Recalcula nota média e reclamações da loja e suspende quem passar do limite.
export async function recalcularReputacao(db, { lojaId }) {
  const motivo = (n) =>
    `Desvinculado por acumular ${n} reclamações de 1 estrela (limite máximo tolerado: ${LIMITE_RECLAMACOES}).`;
  if (lojaId) {
    const {
      rows: [r],
    } = await consultar(
      // Nota geral do estabelecimento: avaliações dos clientes (pedidos) + avaliações das entidades (doações entregues)
      `WITH notas AS (
         SELECT nota_comida AS nota, (COALESCE(reclamacao_comida, FALSE) OR nota_comida = 1) AS recl
           FROM pedidos WHERE loja_id = $1
         UNION ALL
         SELECT (extras->'avaliacaoEntidade'->>'notaComida')::int,
                (COALESCE((extras->'avaliacaoEntidade'->>'reclamacaoComida')::boolean, FALSE)
                 OR (extras->'avaliacaoEntidade'->>'notaComida')::int = 1)
           FROM doacoes WHERE loja_id = $1 AND extras ? 'avaliacaoEntidade'
       )
       SELECT ROUND(AVG(nota)::numeric, 1) AS media, COUNT(nota)::int AS qtd,
              COUNT(*) FILTER (WHERE recl)::int AS recl
         FROM notas`,
      [lojaId],
      db,
    );
    if (r.qtd > 0) {
      const {
        rows: [loja],
      } = await consultar(
        "UPDATE lojas SET nota = $1::numeric WHERE id = $2 RETURNING usuario_id",
        [r.media, lojaId],
        db,
      );
      if (loja?.usuario_id) {
        await consultar(
          `UPDATE usuarios SET nota = $1::numeric, qtd_avaliacoes = $2::int, qtd_reclamacoes = $3::int,
                  suspenso = suspenso OR ($3::int > $4::int),
                  motivo_desvinculo = CASE WHEN $3::int > $4::int THEN $5::text ELSE motivo_desvinculo END
            WHERE id = $6`,
          [
            r.media,
            r.qtd,
            r.recl,
            LIMITE_RECLAMACOES,
            motivo(r.recl),
            loja.usuario_id,
          ],
          db,
        );
      }
    }
  }
}

const CAMPOS_AVALIACAO = [
  "notaComida",
  "comentarioComida",
  "reclamacaoComida",
  "avaliadoEm",
];

export async function atualizar(req, res) {
  const c = req.body || {};
  const { id: usuarioId, perfil } = req.usuario;

  const pedido = await transacao(async (db) => {
    const {
      rows: [p],
    } = await consultar(
      "SELECT * FROM pedidos WHERE id = $1 FOR UPDATE",
      [req.params.id],
      db,
    );
    if (!p) throw new ErroHttp(404, "Pedido não encontrado.");

    // --- quem pode mexer neste pedido
    const lojaIds =
      perfil === "loja" ? await lojasDoUsuario(usuarioId, db) : [];
    const ehCliente = perfil === "cliente" && p.cliente_id === usuarioId;
    const ehLoja = perfil === "loja" && lojaIds.includes(p.loja_id);
    const ehMaster = perfil === "master";
    if (!ehCliente && !ehLoja && !ehMaster)
      throw new ErroHttp(
        403,
        "Você não tem permissão para alterar este pedido.",
      );

    const sets = [];
    const valores = [];
    const add = (coluna, valor) => {
      valores.push(valor);
      sets.push(`${coluna} = $${valores.length}`);
    };
    let reputacao = null;

    // --- mudança de status
    if (c.status !== undefined && c.status !== p.status) {
      const novo = c.status;
      const de = FLUXO.indexOf(p.status);
      const para = FLUXO.indexOf(novo);
      if (novo === "cancelled") {
        // Só o cliente do pedido cancela, e apenas até o pedido sair para entrega.
        if (!ehCliente)
          throw new ErroHttp(
            403,
            "Somente o cliente que fez o pedido pode cancelá-lo.",
          );
        if (!["pending", "accepted", "preparing"].includes(p.status))
          throw new ErroHttp(
            400,
            "Este pedido já saiu para entrega e não pode mais ser cancelado.",
          );
      } else if (para === -1) {
        throw new ErroHttp(400, "Status inválido.");
      } else if (para <= de) {
        throw new ErroHttp(
          400,
          "O pedido não pode voltar para uma etapa anterior.",
        );
      } else if (ehCliente) {
        // O cliente só confirma o recebimento de um pedido que já saiu para entrega.
        if (!(p.status === "delivery" && novo === "delivered"))
          throw new ErroHttp(403, "Apenas a loja atualiza esta etapa.");
      }
      add("status", novo);
      // Pedido cancelado: o que saiu do estoque volta para o(s) lote(s) de origem.
      if (novo === "cancelled") {
        await devolverEstoqueDoPedido(db, p.id);
        // Registra quando e por quê (a loja vê o motivo no aviso de cancelamento).
        const motivo = texto(c.motivoCancelamento, {
          campo: "motivo do cancelamento",
          max: 300,
          obrigatorio: false,
        });
        valores.push(
          JSON.stringify({
            canceladoEm: new Date().toISOString(),
            canceladoPor: "cliente",
            ...(motivo ? { motivoCancelamento: motivo } : {}),
          }),
        );
        sets.push(
          `extras = COALESCE(extras, '{}'::jsonb) || $${valores.length}::jsonb`,
        );
      }
      if (novo === "delivered" && !p.entregue_em)
        add("entregue_em", new Date().toISOString());
    }

    // --- avaliação (somente o cliente do pedido, só depois de entregue, até 1h)
    if (CAMPOS_AVALIACAO.some((k) => c[k] !== undefined)) {
      if (!ehCliente)
        throw new ErroHttp(403, "Somente o cliente do pedido pode avaliá-lo.");
      if (p.status !== "delivered")
        throw new ErroHttp(
          400,
          "O pedido só pode ser avaliado depois de entregue.",
        );
      const entregue = p.entregue_em
        ? new Date(p.entregue_em).getTime()
        : new Date(p.criado_em).getTime();
      if (Date.now() - entregue > JANELA_AVALIACAO_MS) {
        throw new ErroHttp(
          400,
          "Após 1 hora da entrega, não é mais permitido avaliar o pedido.",
        );
      }
      const nota = (valor, campo) =>
        valor === undefined || valor === null
          ? null
          : numero(valor, { campo, min: 1, max: 5, inteiro: true });
      const notaComida = nota(c.notaComida, "nota da comida");
      if (c.notaComida !== undefined) add("nota_comida", notaComida);
      if (c.comentarioComida !== undefined)
        add(
          "comentario_comida",
          texto(c.comentarioComida, { campo: "comentário", max: 500 }),
        );
      if (c.reclamacaoComida !== undefined)
        add("reclamacao_comida", !!c.reclamacaoComida || notaComida === 1);
      add("avaliado_em", new Date().toISOString());
      reputacao = { lojaId: p.loja_id };
    }

    let atualizado = p;
    if (sets.length) {
      valores.push(p.id);
      const r = await consultar(
        `UPDATE pedidos SET ${sets.join(", ")} WHERE id = $${valores.length} RETURNING *`,
        valores,
        db,
      );
      atualizado = r.rows[0];
    }
    if (reputacao) await recalcularReputacao(db, reputacao);
    return (await anexarItens([atualizado], db))[0];
  });
  res.json(pedido);
}
