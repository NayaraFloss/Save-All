import crypto from "node:crypto";
import { consultar, transacao } from "../config/db.js";
import { ErroHttp } from "../utils/erros.js";
import { alimentoParaFront } from "../utils/mapeadores.js";
import { texto, numero, dataISO, extrasDe } from "../utils/validacao.js";
import {
  anexarLotes,
  atualizarLotesVigentes,
  entrarLote,
  substituirLotes,
  sincronizarAlimento,
  normalizarNome,
} from "../utils/estoque.js";

const SELECT = `SELECT a.*, l.nome AS nome_loja FROM alimentos a JOIN lojas l ON l.id = a.loja_id`;
// Junta a view de precificação dinâmica (RN01) só para ordenar: itens com faixa de
// alerta mais alta (mais perto de vencer) aparecem primeiro na vitrine (RN02/exibição).
const SELECT_ORDENADO_POR_VENCIMENTO = `
  SELECT a.*, l.nome AS nome_loja, v.faixa, v.percentual_prazo_consumido, v.vencido, v.preco_calculado
    FROM alimentos a
    JOIN lojas l ON l.id = a.loja_id
    LEFT JOIN visao_alimentos_desconto v ON v.alimento_id = a.id`;
// Peso de 1 unidade em kg (base do cálculo de CO2 e água). Vazio = não informado.
const pesoDoCorpo = (c) =>
  c.weightKg === undefined || c.weightKg === null || c.weightKg === ""
    ? null
    : numero(c.weightKg, { campo: "peso (kg)", min: 0.001, max: 1000 });
const CONHECIDOS = [
  "id",
  "name",
  "lojaId",
  "nomeLoja",
  "category",
  "dataFabricacao",
  "dataValidade",
  "precoOriginal",
  "precoComDesconto",
  "weightKg",
  "image",
  "status",
  "description",
  "quantity",
  "criadoEm",
  "lotes",
  "loteAdicionado",
];
const STATUS = ["active", "inactive", "sold_out"];
// "Misto" não é categoria de item (só existe no sorteio das sacolas)
const CATEGORIAS_ITEM = ["salgado", "doce"];
const categoriaItem = (v) => {
  const c = texto(v, { campo: "categoria", max: 40, obrigatorio: true });
  if (!CATEGORIAS_ITEM.includes(c))
    throw new ErroHttp(400, "Categoria inválida: use salgado ou doce.");
  return c;
};

export async function listar(req, res) {
  const params = [];
  const filtros = [];
  if (req.query.lojaId) {
    params.push(String(req.query.lojaId));
    filtros.push(`a.loja_id = $${params.length}`);
  }
  if (req.query.category && req.query.category !== "todos") {
    params.push(String(req.query.category));
    filtros.push(`a.categoria = $${params.length}`);
  }
  // Só itens de estabelecimentos com conta de acesso (os mesmos que aparecem na vitrine)
  filtros.push("l.usuario_id IS NOT NULL");
  const where = filtros.length ? `WHERE ${filtros.join(" AND ")}` : "";
  // Lote que venceu hoje: o item passa a valer o próximo lote (e a promoção dele).
  await atualizarLotesVigentes();
  // RN02: alimentos com alerta de vencimento mais avançado (faixa mais alta) têm
  // preferência e saem primeiro na lista; dentro da mesma faixa, os mais recentes.
  const { rows } = await consultar(
    `${SELECT_ORDENADO_POR_VENCIMENTO} ${where} ORDER BY COALESCE(v.faixa, 0) DESC, COALESCE(v.percentual_prazo_consumido, 0) DESC, a.criado_em DESC, a.id DESC`,
    params,
  );
  // O cliente vê sempre o preço vigente, calculado pela validade (RN01), não o gravado no cadastro.
  const comLotes = await anexarLotes(rows);
  res.json(
    comLotes.map((r) => ({
      ...alimentoParaFront(r),
      ...(r.preco_calculado != null
        ? { precoComDesconto: Number(r.preco_calculado) }
        : {}),
    })),
  );
}

// Painel master: TODOS os itens lançados (de qualquer loja, ativos ou não, vencidos ou não),
// com a situação de validade e o dono da loja, para editar ou excluir.
export async function listarTodos(_req, res) {
  await atualizarLotesVigentes();
  const { rows } = await consultar(
    `SELECT a.*, l.nome AS nome_loja, l.cidade AS cidade_loja, l.usuario_id IS NOT NULL AS loja_com_dono,
            v.faixa, v.vencido, v.preco_calculado
       FROM alimentos a
       JOIN lojas l ON l.id = a.loja_id
       LEFT JOIN visao_alimentos_desconto v ON v.alimento_id = a.id
      ORDER BY a.criado_em DESC, a.id DESC`,
  );
  const comLotes = await anexarLotes(rows);
  res.json(
    comLotes.map((r) => ({
      ...alimentoParaFront(r),
      cidadeLoja: r.cidade_loja,
      lojaComDono: r.loja_com_dono,
      vencido: !!r.vencido,
      faixa: r.faixa ?? 0,
      precoVigente:
        r.preco_calculado != null ? Number(r.preco_calculado) : null,
    })),
  );
}

// A loja é sempre a do usuário logado (perfil loja). O master informa lojaId.
async function resolverLoja(req) {
  if (req.usuario.perfil === "loja") {
    const { rows } = await consultar(
      "SELECT id FROM lojas WHERE usuario_id = $1",
      [req.usuario.id],
    );
    if (!rows[0])
      throw new ErroHttp(
        400,
        "Seu usuário não possui um estabelecimento cadastrado.",
      );
    return rows[0].id;
  }
  const { rows } = await consultar("SELECT id FROM lojas WHERE id = $1", [
    String(req.body.lojaId || ""),
  ]);
  if (!rows[0]) throw new ErroHttp(400, "Estabelecimento não encontrado.");
  return rows[0].id;
}

async function carregarComPermissao(req, id) {
  const { rows } = await consultar(`${SELECT} WHERE a.id = $1`, [id]);
  const alimento = rows[0];
  if (!alimento) throw new ErroHttp(404, "Alimento não encontrado.");
  if (req.usuario.perfil !== "master") {
    const dono = await consultar(
      "SELECT 1 FROM lojas WHERE id = $1 AND usuario_id = $2",
      [alimento.loja_id, req.usuario.id],
    );
    if (!dono.rowCount)
      throw new ErroHttp(
        403,
        "Este alimento pertence a outro estabelecimento.",
      );
  }
  return alimento;
}

export async function criar(req, res) {
  const c = req.body || {};
  const lojaId = await resolverLoja(req);
  const status = c.status ?? "active";
  if (!STATUS.includes(status)) throw new ErroHttp(400, "Status inválido.");

  const nome = texto(c.name, { campo: "nome", max: 160, obrigatorio: true });
  const quantidade = numero(c.quantity, {
    campo: "quantidade",
    min: 1,
    max: 100000,
    inteiro: true,
    padrao: 1,
  });
  const dataFabricacao = dataISO(c.dataFabricacao, "dataFabricacao");
  const dataValidade = dataISO(c.dataValidade, "dataValidade");
  if (!dataValidade)
    throw new ErroHttp(400, "O campo data de validade é obrigatório.");
  if (dataFabricacao && dataValidade < dataFabricacao)
    throw new ErroHttp(400, "A validade não pode ser anterior à fabricação.");

  // Mesmo item (mesmo nome) na mesma loja: não cria outro, soma o lote no que já existe.
  const resultado = await transacao(async (db) => {
    await consultar(
      "SELECT id FROM lojas WHERE id = $1 FOR UPDATE",
      [lojaId],
      db,
    ); // evita 2 cadastros simultâneos do mesmo item
    const { rows: daLoja } = await consultar(
      "SELECT id, nome, status FROM alimentos WHERE loja_id = $1",
      [lojaId],
      db,
    );
    const existente = daLoja.find(
      (a) => normalizarNome(a.nome) === normalizarNome(nome),
    );

    if (existente) {
      const precoOriginal = numero(c.precoOriginal, {
        campo: "preço original",
        max: 100000,
        padrao: 0,
      });
      const precoDesconto = numero(c.precoComDesconto, {
        campo: "preço com desconto",
        max: 100000,
        padrao: 0,
      });
      await consultar(
        `UPDATE alimentos SET preco_original = CASE WHEN $1 > 0 THEN $1 ELSE preco_original END,
                              preco_desconto = CASE WHEN $2 > 0 THEN $2 ELSE preco_desconto END,
                              peso_unitario_kg = COALESCE($4::numeric, peso_unitario_kg),
                              status = CASE WHEN status = 'sold_out' THEN 'active' ELSE status END
          WHERE id = $3`,
        [precoOriginal, precoDesconto, existente.id, pesoDoCorpo(c)],
        db,
      );
      await entrarLote(db, existente.id, {
        quantidade,
        dataFabricacao,
        dataValidade,
      });
      return { id: existente.id, loteAdicionado: true };
    }

    const id = `food-${crypto.randomUUID()}`;
    await consultar(
      `INSERT INTO alimentos (id, loja_id, nome, categoria, data_fabricacao, data_validade, preco_original, preco_desconto, imagem, status, descricao, quantidade, extras, peso_unitario_kg)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14)`,
      [
        id,
        lojaId,
        nome,
        categoriaItem(c.category),
        dataFabricacao,
        dataValidade,
        numero(c.precoOriginal, {
          campo: "preço original",
          max: 100000,
          padrao: 0,
        }),
        numero(c.precoComDesconto, {
          campo: "preço com desconto",
          max: 100000,
          padrao: 0,
        }),
        texto(c.image, { campo: "imagem", max: 2_000_000 }),
        status,
        texto(c.description, { campo: "descrição", max: 1000 }),
        quantidade,
        JSON.stringify(extrasDe(c, CONHECIDOS)),
        pesoDoCorpo(c),
      ],
      db,
    );
    await entrarLote(db, id, {
      quantidade: 0 + quantidade,
      dataFabricacao,
      dataValidade,
    });
    return { id, loteAdicionado: false };
  });

  const { rows } = await consultar(`${SELECT} WHERE a.id = $1`, [resultado.id]);
  const [comLotes] = await anexarLotes(rows);
  res.status(resultado.loteAdicionado ? 200 : 201).json({
    ...alimentoParaFront(comLotes),
    loteAdicionado: resultado.loteAdicionado,
  });
}

export async function atualizar(req, res) {
  const c = req.body || {};
  await carregarComPermissao(req, req.params.id);

  const sets = [];
  const valores = [];
  const add = (coluna, valor) => {
    valores.push(valor);
    sets.push(`${coluna} = $${valores.length}`);
  };
  if (c.name !== undefined)
    add("nome", texto(c.name, { campo: "nome", max: 160, obrigatorio: true }));
  if (c.category !== undefined) add("categoria", categoriaItem(c.category));
  if (c.precoOriginal !== undefined)
    add(
      "preco_original",
      numero(c.precoOriginal, { campo: "preço original", max: 100000 }),
    );
  if (c.weightKg !== undefined) add("peso_unitario_kg", pesoDoCorpo(c));
  if (c.precoComDesconto !== undefined)
    add(
      "preco_desconto",
      numero(c.precoComDesconto, { campo: "preço com desconto", max: 100000 }),
    );
  if (c.image !== undefined)
    add("imagem", texto(c.image, { campo: "imagem", max: 2_000_000 }));
  if (c.description !== undefined)
    add("descricao", texto(c.description, { campo: "descrição", max: 1000 }));
  if (c.status !== undefined) {
    if (!STATUS.includes(c.status)) throw new ErroHttp(400, "Status inválido.");
    add("status", c.status);
  }
  const extras = extrasDe(c, CONHECIDOS);
  if (Object.keys(extras).length) {
    valores.push(JSON.stringify(extras));
    sets.push(`extras = extras || $${valores.length}::jsonb`);
  }
  await transacao(async (db) => {
    if (sets.length) {
      valores.push(req.params.id);
      await consultar(
        `UPDATE alimentos SET ${sets.join(", ")} WHERE id = $${valores.length}`,
        valores,
        db,
      );
    }
    // Estoque e validade só mudam por lotes (o item mostra sempre o lote que vence primeiro).
    if (Array.isArray(c.lotes)) {
      const lotes = c.lotes.map((l) => ({
        quantidade: l.quantity ?? l.quantidade,
        dataFabricacao: dataISO(l.dataFabricacao, "dataFabricacao"),
        dataValidade: dataISO(l.dataValidade, "dataValidade"),
      }));
      await substituirLotes(db, req.params.id, lotes);
    } else if (
      c.quantity !== undefined ||
      c.dataValidade !== undefined ||
      c.dataFabricacao !== undefined
    ) {
      // Compatibilidade: edição simples de item com um único lote.
      const { rows: lotes } = await consultar(
        "SELECT * FROM alimento_lotes WHERE alimento_id = $1 AND quantidade > 0",
        [req.params.id],
        db,
      );
      if (lotes.length > 1)
        throw new ErroHttp(
          400,
          "Este item tem mais de um lote: edite o estoque pela lista de lotes.",
        );
      const base = lotes[0];
      await substituirLotes(db, req.params.id, [
        {
          quantidade:
            c.quantity !== undefined
              ? numero(c.quantity, {
                  campo: "quantidade",
                  max: 100000,
                  inteiro: true,
                })
              : (base?.quantidade ?? 0),
          dataFabricacao:
            c.dataFabricacao !== undefined
              ? dataISO(c.dataFabricacao, "dataFabricacao")
              : (base?.data_fabricacao ?? null),
          dataValidade:
            c.dataValidade !== undefined
              ? dataISO(c.dataValidade, "dataValidade")
              : base?.data_validade,
        },
      ]);
    }
  });
  const { rows } = await consultar(`${SELECT} WHERE a.id = $1`, [
    req.params.id,
  ]);
  res.json(alimentoParaFront((await anexarLotes(rows))[0]));
}

export async function remover(req, res) {
  await carregarComPermissao(req, req.params.id);
  await consultar("DELETE FROM alimentos WHERE id = $1", [req.params.id]);
  res.json({ success: true });
}

// RN02 – Sorteio ponderado de itens por valor informado pelo cliente.
// O cliente informa quanto quer gastar (mínimo R$ 5,00, sem teto) e o sistema monta
// o pedido sorteando, entre TODAS as lojas, os itens que cabem nesse valor. Itens
// mais perto do vencimento (faixa mais alta) têm preferência e saem primeiro.
export const VALOR_MINIMO_PEDIDO = 5;

export async function sortearPorValor(req, res) {
  const valorAlvo = numero(req.query.valorAlvo ?? req.body?.valorAlvo, {
    campo: "valorAlvo",
    max: 100000,
  });
  const tolerancia = numero(req.query.tolerancia ?? req.body?.tolerancia, {
    campo: "tolerancia",
    max: 1000,
    padrao: 1,
  });

  if (valorAlvo < VALOR_MINIMO_PEDIDO) {
    throw new ErroHttp(
      400,
      `O valor mínimo para um pedido é de R$ ${VALOR_MINIMO_PEDIDO.toFixed(2)}.`,
    );
  }

  await atualizarLotesVigentes();
  const { rows } = await consultar(
    `SELECT v.alimento_id, v.loja_id, v.nome, v.categoria, v.quantidade, v.preco_original,
            v.preco_calculado, v.faixa, v.percentual_prazo_consumido, v.vencido, l.nome AS nome_loja
       FROM visao_alimentos_desconto v
       JOIN alimentos a ON a.id = v.alimento_id
       JOIN lojas l ON l.id = v.loja_id
      WHERE a.status = 'active' AND a.quantidade > 0 AND v.vencido = FALSE AND v.preco_calculado > 0 AND v.preco_calculado <= $1`,
    [valorAlvo],
  );

  let pool = rows;
  const itensSelecionados = [];
  let valorAcumulado = 0;

  while (pool.length) {
    const restante = valorAlvo - valorAcumulado;
    if (restante < tolerancia) break;

    const elegiveis = pool.filter((r) => Number(r.preco_calculado) <= restante);
    if (!elegiveis.length) break;

    // Peso: faixa mais alta (mais perto de vencer) pesa mais no sorteio.
    const pesos = elegiveis.map((r) => Number(r.faixa) + 1);
    const pesoTotal = pesos.reduce((soma, p) => soma + p, 0);

    let sorteio = Math.random() * pesoTotal;
    let indiceEscolhido = 0;
    for (let i = 0; i < pesos.length; i++) {
      sorteio -= pesos[i];
      if (sorteio <= 0) {
        indiceEscolhido = i;
        break;
      }
    }

    const escolhido = elegiveis[indiceEscolhido];
    itensSelecionados.push({
      id: escolhido.alimento_id,
      name: escolhido.nome,
      lojaId: escolhido.loja_id,
      nomeLoja: escolhido.nome_loja,
      category: escolhido.categoria,
      precoOriginal: Number(escolhido.preco_original),
      precoComDesconto: Number(escolhido.preco_calculado),
      faixa: Number(escolhido.faixa),
      percentualPrazoConsumido: Number(escolhido.percentual_prazo_consumido),
    });
    valorAcumulado += Number(escolhido.preco_calculado);
    pool = pool.filter((r) => r.alimento_id !== escolhido.alimento_id);
  }

  res.json({
    itensSelecionados,
    valorTotal: Math.round(valorAcumulado * 100) / 100,
    erro: itensSelecionados.length
      ? null
      : "Nenhum item disponível dentro do valor informado no momento.",
  });
}
