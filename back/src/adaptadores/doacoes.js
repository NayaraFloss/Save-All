import { consultar, transacao } from "../config/db.js";
import { ErroHttp } from "../utils/erros.js";
import {
  sha256,
  limpar,
  extrasSem,
  textoOu,
  numeroOu,
  dataOu,
  momentoOu,
  horaOu,
  traduzir,
  montarInsert,
  montarUpdate,
  lojaDoUsuario,
  acharEntidade,
  garantirMesmaCidade,
} from "./comum.js";

// Consultas de doação do front (saveall_donation_offers) <-> doacoes
// (+ transacao_itens com o alimento, termos_doacao e assinaturas_termo, que os gatilhos do banco já usam).
//
// Situações: o banco aceita pending_inquiry, accepted, rejected, completed e expired.
// O front também usa "cancelada" e "entregue"; elas ficam em extras.statusFront.
const STATUS_BANCO = [
  "pending_inquiry",
  "accepted",
  "rejected",
  "completed",
  "expired",
];
const STATUS_FRONT_EXTRA = { cancelada: "expired", entregue: "accepted" };
export const statusParaBanco = (s) => {
  if (STATUS_BANCO.includes(s)) return { status: s, statusFront: null };
  if (STATUS_FRONT_EXTRA[s])
    return { status: STATUS_FRONT_EXTRA[s], statusFront: s };
  throw new ErroHttp(400, "Situação da doação inválida.");
};

const MAPEADOS = [
  "token",
  "lojaId",
  "nomeLoja",
  "storeCnpj",
  "storeAddress",
  "storePhone",
  "entidadeId",
  "recipientOrg",
  "recipientEmail",
  "recipientWhatsapp",
  "recipientCnpj",
  "recipientAddress",
  "foodId",
  "foodName",
  "category",
  "quantity",
  "weightEstimatedKg",
  "description",
  "dataValidade",
  "deliveryMethod",
  "status",
  "criadoEm",
  "inAppNotifiedAt",
  "respondedAt",
  "confirmedBy",
  "responseNote",
  "pickupEstimatedTime",
  "rejectionReason",
  "finalizadoEm",
  "termoId",
  "termoStatus",
];

export const SELECT_DOACAO = `
  SELECT d.*, l.nome AS l_nome, l.cnpj AS l_cnpj, l.endereco AS l_endereco, l.telefone AS l_telefone,
         e.nome AS e_nome, e.email AS e_email, e.whatsapp AS e_whatsapp, e.cnpj AS e_cnpj,
         e.endereco AS e_endereco, e.bairro AS e_bairro, e.cidade AS e_cidade, e.uf AS e_uf,
         t.id AS termo_id, t.status AS termo_status,
         (SELECT row_to_json(i) FROM transacao_itens i WHERE i.transacao_id = d.transacao_id ORDER BY i.id LIMIT 1) AS item
    FROM doacoes d
    LEFT JOIN lojas l ON l.id = d.loja_id
    LEFT JOIN entidades_sociais e ON e.id = d.entidade_id
    LEFT JOIN termos_doacao t ON t.doacao_id = d.id`;

export function doacaoParaFront(r) {
  const extras = { ...(r.extras || {}) };
  const statusFront = extras.statusFront;
  delete extras.statusFront;
  delete extras.log;
  delete extras.somenteRegistro;
  const item = r.item || null;
  return limpar({
    ...extras,
    id: r.id,
    token: r.token,
    lojaId: r.loja_id,
    nomeLoja: r.l_nome ?? extras.nomeLoja,
    storeCnpj: r.l_cnpj ?? extras.storeCnpj,
    storeAddress: r.l_endereco ?? extras.storeAddress,
    storePhone: r.l_telefone ?? extras.storePhone,
    entidadeId: r.entidade_id,
    recipientOrg: r.e_nome,
    recipientEmail: r.e_email,
    recipientWhatsapp: r.e_whatsapp,
    recipientCnpj: r.e_cnpj,
    recipientAddress: r.e_endereco
      ? `${r.e_endereco}${r.e_bairro ? ` - ${r.e_bairro}` : ""}, ${r.e_cidade}/${String(r.e_uf || "").trim()}`
      : null,
    foodId: item?.alimento_id ?? extras.foodId,
    foodName: item?.nome ?? extras.foodName,
    category: extras.category ?? item?.categoria,
    quantity: item?.quantidade ?? extras.quantity,
    weightEstimatedKg: item ? Number(item.kg) : extras.weightEstimatedKg,
    description: r.descricao,
    dataValidade: r.data_validade,
    deliveryMethod: r.forma_entrega,
    status: statusFront || r.status,
    criadoEm: r.criado_em,
    inAppNotifiedAt: r.notificado_em,
    respondedAt: r.respondido_em,
    confirmedBy: r.confirmado_por,
    responseNote: r.nota_resposta,
    pickupEstimatedTime: r.previsao_retirada
      ? String(r.previsao_retirada).slice(0, 5)
      : null,
    rejectionReason: r.motivo_rejeicao,
    finalizadoEm: r.concluida_em,
    termoId: r.termo_id,
    termoStatus: r.termo_status,
  });
}

export async function buscarDoacao(where, params, db) {
  const { rows } = await consultar(
    `${SELECT_DOACAO} WHERE ${where}`,
    params,
    db,
  );
  return rows[0] || null;
}

// Alimento da doação, na transação criada pelo gatilho (é o que alimenta os relatórios)
export async function gravarItem(db, transacaoId, d) {
  if (!transacaoId) return;
  const quantidade = Math.max(1, Math.round(numeroOu(d.quantity, 1)));
  const kg = Math.max(0, numeroOu(d.weightEstimatedKg, 0));
  const nome = textoOu(d.foodName, "Alimento doado", 160);
  const categoria = textoOu(d.category, "sem_categoria", 60);
  const { rows } = await consultar(
    "SELECT id FROM transacao_itens WHERE transacao_id = $1 ORDER BY id LIMIT 1",
    [transacaoId],
    db,
  );
  if (rows[0]) {
    await consultar(
      "UPDATE transacao_itens SET nome = $1, categoria = $2, quantidade = $3, kg = $4, alimento_id = $5 WHERE id = $6",
      [
        nome,
        categoria,
        quantidade,
        kg,
        textoOu(d.foodId, null, 120),
        rows[0].id,
      ],
      db,
    );
  } else {
    await consultar(
      "INSERT INTO transacao_itens (transacao_id, alimento_id, nome, categoria, quantidade, kg, valor) VALUES ($1,$2,$3,$4,$5,$6,0)",
      [
        transacaoId,
        textoOu(d.foodId, null, 120),
        nome,
        categoria,
        quantidade,
        kg,
      ],
      db,
    );
  }
}

// Assinatura de uma das partes no termo da doação (o gatilho marca o termo como "assinado" com as duas)
export async function assinarTermo(
  db,
  doacaoId,
  { parte, nome, documento, tipo, certificado, imagem },
) {
  const { rows } = await consultar(
    "SELECT id FROM termos_doacao WHERE doacao_id = $1",
    [doacaoId],
    db,
  );
  if (!rows[0]) return;
  const momento = new Date().toISOString();
  await consultar(
    `INSERT INTO assinaturas_termo (termo_id, parte, assinante_nome, assinante_documento, tipo_assinatura, certificado, imagem_assinatura, hash_sha256, assinado_em)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (termo_id, parte) DO NOTHING`,
    [
      rows[0].id,
      parte,
      textoOu(
        nome,
        parte === "doador" ? "Estabelecimento doador" : "Entidade receptora",
        160,
      ),
      textoOu(documento, null, 30),
      tipo,
      textoOu(certificado, null, 500),
      imagem || null,
      sha256(
        `${doacaoId}|${parte}|${nome}|${documento}|${momento}|${imagem || certificado || ""}`,
      ),
      momento,
    ],
    db,
  );
}

async function assinaturaDoador(db, doacao) {
  const { rows } = await consultar(
    `SELECT l.nome, l.cnpj, u.extras FROM lojas l LEFT JOIN usuarios u ON u.id = l.usuario_id WHERE l.id = $1`,
    [doacao.loja_id],
    db,
  );
  const loja = rows[0] || {};
  const extras = loja.extras || {};
  const digital =
    extras.signatureType === "digital" || !!extras.signatureCertificate;
  await assinarTermo(db, doacao.id, {
    parte: "doador",
    nome: loja.nome,
    documento: loja.cnpj,
    tipo: digital ? "certificado_digital" : "desenho",
    certificado: extras.signatureCertificate,
    imagem: digital ? null : extras.signatureImage,
  });
}

export const adaptadorDoacoes = {
  podeEscrever: ["loja", "entidade", "master"],
  podeRemover: ["master"],

  async listar(req) {
    const params = [];
    let filtro = `NOT (d.extras ? 'somenteRegistro')`;
    if (req.usuario.perfil === "loja") {
      const loja = await lojaDoUsuario(consultar, req.usuario.id);
      if (!loja) return [];
      params.push(loja.id);
      filtro += ` AND d.loja_id = $1`;
    }
    const { rows } = await consultar(
      `${SELECT_DOACAO} WHERE ${filtro} ORDER BY d.criado_em DESC`,
      params,
    );
    return rows.map(doacaoParaFront);
  },

  async salvar(req, id, corpo) {
    const { perfil, id: usuarioId } = req.usuario;
    const { status, statusFront } = statusParaBanco(
      corpo.status || "pending_inquiry",
    );
    try {
      const salvo = await transacao(async (db) => {
        const { rows: existentes } = await consultar(
          "SELECT * FROM doacoes WHERE id = $1 FOR UPDATE",
          [id],
          db,
        );
        const atual = existentes[0];

        let lojaId = textoOu(corpo.lojaId, null, 100);
        if (perfil === "loja") {
          const loja = await lojaDoUsuario(consultar, usuarioId, db);
          if (!loja)
            throw new ErroHttp(
              403,
              "Seu usuário não possui um estabelecimento.",
            );
          if (atual && atual.loja_id !== loja.id)
            throw new ErroHttp(403, "Esta doação é de outro estabelecimento.");
          lojaId = loja.id;
        } else if (perfil === "entidade" && !atual) {
          throw new ErroHttp(
            403,
            "Somente o estabelecimento cria consultas de doação.",
          );
        }

        const entidade = await acharEntidade(
          consultar,
          {
            id: corpo.entidadeId,
            cnpj: corpo.recipientCnpj,
            nome: corpo.recipientOrg,
          },
          db,
        );
        if (!entidade && !atual)
          throw new ErroHttp(
            400,
            "Entidade social não encontrada no cadastro.",
          );
        // Nova consulta (ou troca de entidade): só entidades da mesma cidade da loja
        if (entidade && (!atual || entidade.id !== atual.entidade_id)) {
          await garantirMesmaCidade(consultar, lojaId || atual?.loja_id, entidade, db);
        }

        const extras = {
          ...extrasSem(corpo, MAPEADOS),
          ...(atual?.extras?.log ? { log: atual.extras.log } : {}),
        };
        // Campos gravados pela entidade (link público) pertencem ao servidor: a loja não pode apagá-los com uma cópia antiga
        for (const campo of [
          "signatureImage",
          "signatureCpf",
          "signatureSignedAt",
          "signatureHash",
          "avaliacaoEntidade",
        ]) {
          if (atual?.extras?.[campo] !== undefined)
            extras[campo] = atual.extras[campo];
        }
        if (statusFront) extras.statusFront = statusFront;
        // Guarda o que o front mostra mesmo sem coluna própria
        for (const campo of [
          "foodId",
          "foodName",
          "category",
          "quantity",
          "weightEstimatedKg",
        ]) {
          if (corpo[campo] !== undefined) extras[campo] = corpo[campo];
        }

        const colunas = {
          descricao:
            textoOu(corpo.description, null, 2000) ??
            textoOu(corpo.foodName, null, 160),
          data_validade: dataOu(corpo.dataValidade),
          forma_entrega:
            corpo.deliveryMethod === "store_delivery"
              ? "store_delivery"
              : "pickup_by_entity",
          status,
          respondido_em: momentoOu(corpo.respondedAt),
          confirmado_por: textoOu(corpo.confirmedBy, null, 160),
          nota_resposta: textoOu(corpo.responseNote, null, 1000),
          previsao_retirada: horaOu(corpo.pickupEstimatedTime),
          motivo_rejeicao: textoOu(corpo.rejectionReason, null, 500),
          concluida_em:
            status === "completed"
              ? atual?.concluida_em ||
                momentoOu(corpo.finalizadoEm) ||
                new Date().toISOString()
              : null,
          extras,
        };

        let registro;
        if (atual) {
          if (entidade && entidade.id !== atual.entidade_id)
            colunas.entidade_id = entidade.id;
          const q = montarUpdate("doacoes", id, colunas);
          registro = (await consultar(q.sql, q.valores, db)).rows[0];
        } else {
          if (!lojaId)
            throw new ErroHttp(400, "Informe o estabelecimento da doação.");
          const novo = {
            id,
            loja_id: lojaId,
            entidade_id: entidade.id,
            notificado_em:
              momentoOu(corpo.inAppNotifiedAt) || new Date().toISOString(),
            criado_em: momentoOu(corpo.criadoEm) || new Date().toISOString(),
            ...colunas,
          };
          if (corpo.token) novo.token = textoOu(corpo.token, null, 100);
          const q = montarInsert("doacoes", novo);
          registro = (await consultar(q.sql, q.valores, db)).rows[0];
        }
        await gravarItem(db, registro.transacao_id, corpo);
        if (status === "completed" && atual?.status !== "completed")
          await assinaturaDoador(db, registro);
        return registro.id;
      });
      return doacaoParaFront(await buscarDoacao("d.id = $1", [salvo]));
    } catch (erro) {
      throw traduzir(erro, {
        duplicado: "Já existe uma consulta de doação com este código.",
      });
    }
  },

  async remover(_req, id) {
    await transacao(async (db) => {
      const { rows } = await consultar(
        "SELECT transacao_id FROM doacoes WHERE id = $1",
        [id],
        db,
      );
      if (!rows[0]) return;
      await consultar(
        "DELETE FROM assinaturas_termo WHERE termo_id IN (SELECT id FROM termos_doacao WHERE doacao_id = $1)",
        [id],
        db,
      );
      await consultar(
        "DELETE FROM termos_doacao WHERE doacao_id = $1",
        [id],
        db,
      );
      await consultar("DELETE FROM doacoes WHERE id = $1", [id], db);
      if (rows[0].transacao_id) {
        await consultar(
          "DELETE FROM transacao_itens WHERE transacao_id = $1",
          [rows[0].transacao_id],
          db,
        );
        await consultar(
          "DELETE FROM transacoes WHERE id = $1",
          [rows[0].transacao_id],
          db,
        );
      }
    });
  },
};
