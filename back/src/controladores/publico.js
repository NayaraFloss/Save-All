import crypto from "node:crypto";
import { consultar, transacao } from "../config/db.js";
import { ErroHttp } from "../utils/erros.js";
import { texto } from "../utils/validacao.js";

import {
  entidadeParaFront,
  colunasDeEntidade,
} from "../adaptadores/entidades.js";
import {
  doacaoParaFront,
  buscarDoacao,
  assinarTermo,
} from "../adaptadores/doacoes.js";
import {
  sha256,
  traduzir,
  montarInsert,
  horaOu,
} from "../adaptadores/comum.js";
import { recalcularReputacao } from "./pedidos.js";

// Rotas sem login: portal de credenciamento de entidades (entidades_sociais)
// e link de confirmação de doação enviado à entidade (doacoes, pelo token).

export async function listarParceirosSociais(_req, res) {
  const { rows } = await consultar(
    "SELECT * FROM entidades_sociais ORDER BY criado_em, id",
  );
  // O arquivo do termo assinado só aparece para quem está logado
  res.json(rows.map((r) => entidadeParaFront(r, { semArquivo: true })));
}

export async function credenciarEntidade(req, res) {
  const d = req.body || {};
  texto(d.name, {
    campo: "nome da entidade",
    min: 2,
    max: 160,
    obrigatorio: true,
  });
  const id = `soc-part-${crypto.randomUUID().slice(0, 8)}`;
  // A entidade nunca se aprova sozinha: situação definida pelo servidor
  const colunas = colunasDeEntidade({
    ...d,
    validationStatus: "pending_review",
    validatedAt: null,
    active: true,
    notes: d.notes || "Submetido via formulário público com assinatura Gov.br",
    govSignatureFileName: d.govSignatureFileName || "termo_govbr_assinado.pdf",
    govSignatureHash: sha256(
      `${id}|${d.cnpj || ""}|${d.govSignatureFileData || ""}|${Date.now()}`,
    ),
  });
  colunas.extras = {
    origin: "public_form",
    selectionStatus: "standby",
    govSignatureVerified: true,
    ...(typeof d.govSignatureFileData === "string"
      ? { govSignatureFileData: d.govSignatureFileData }
      : {}),
  };
  try {
    const q = montarInsert("entidades_sociais", { id, ...colunas });
    const { rows } = await consultar(q.sql, q.valores);
    res.status(201).json(entidadeParaFront(rows[0], { semArquivo: true }));
  } catch (erro) {
    throw traduzir(erro, {
      duplicado:
        "Já existe uma entidade cadastrada com este CNPJ. Consulte o protocolo dela.",
    });
  }
}

export async function buscarOferta(req, res) {
  const doacao = await buscarDoacao("d.token = $1", [
    String(req.params.chave || ""),
  ]);
  if (!doacao) throw new ErroHttp(404, "Consulta de doação não encontrada.");
  res.json(doacaoParaFront(doacao));
}

export async function responderOferta(req, res) {
  const r = req.body || {};
  if (!["accepted", "rejected"].includes(r.status))
    throw new ErroHttp(400, "Resposta inválida.");
  const assinatura =
    typeof r.signatureImage === "string" && r.signatureImage
      ? r.signatureImage
      : undefined;
  if (assinatura && assinatura.length > 2_000_000)
    throw new ErroHttp(413, "Assinatura muito grande.");

  const id = await transacao(async (db) => {
    const { rows } = await consultar(
      "SELECT * FROM doacoes WHERE token = $1 FOR UPDATE",
      [String(req.params.chave || "")],
      db,
    );
    const atual = rows[0];
    if (!atual) throw new ErroHttp(404, "Consulta de doação não encontrada.");
    if (atual.status !== "pending_inquiry" || atual.extras?.statusFront) {
      throw new ErroHttp(
        409,
        "Esta consulta não está mais aguardando resposta (pode ter sido cancelada pela loja ou já respondida).",
      );
    }
    const momento = new Date().toISOString();
    const confirmadoPor = texto(r.confirmedBy, {
      campo: "responsável",
      max: 160,
    });
    // O documento (CNPJ ou CPF) é o do cadastro da entidade: não depende do que vier no pedido
    const { rows: cadastro } = await consultar(
      "SELECT cnpj FROM entidades_sociais WHERE id = $1",
      [atual.entidade_id],
      db,
    );
    const cpf =
      texto(cadastro[0]?.cnpj, { campo: "documento", max: 20 }) ||
      texto(r.signatureCpf, { campo: "documento", max: 20 });
    const extras = { ...(atual.extras || {}) };
    if (assinatura) {
      Object.assign(extras, {
        signatureImage: assinatura,
        signatureCpf: cpf || undefined,
        signatureSignedAt: momento,
        signatureHash: sha256(
          `${atual.id}|${confirmadoPor}|${cpf}|${momento}|${assinatura}`,
        ),
      });
    }
    await consultar(
      `UPDATE doacoes SET status = $1, respondido_em = $2, confirmado_por = $3, nota_resposta = $4,
              previsao_retirada = $5, motivo_rejeicao = $6, extras = $7::jsonb WHERE id = $8`,
      [
        r.status,
        momento,
        confirmadoPor ||
          (r.status === "accepted" ? "Representante da Entidade" : null),
        texto(r.responseNote, { campo: "observação", max: 1000 }) || null,
        horaOu(r.pickupEstimatedTime),
        texto(r.rejectionReason, { campo: "motivo", max: 500 }) ||
          (r.status === "rejected"
            ? "Indisponibilidade de recebimento/armazenamento"
            : null),
        JSON.stringify(extras),
        atual.id,
      ],
      db,
    );
    if (r.status === "accepted") {
      await assinarTermo(db, atual.id, {
        parte: "receptor",
        nome: confirmadoPor || "Representante da Entidade",
        documento: cpf,
        tipo: assinatura ? "desenho" : "govbr",
        imagem: assinatura,
      });
    }
    return atual.id;
  });
  res.json(doacaoParaFront(await buscarDoacao("d.id = $1", [id])));
}

// Avaliação dos produtos recebidos pela entidade (link enviado após a entrega).
// Mesmas regras da avaliação do cliente: nota de 1 a 5, motivo obrigatório abaixo de 3 estrelas,
// reclamação automática com 1 estrela e prazo de 1 hora depois da entrega. Conta na nota geral da loja.
const UMA_HORA_MS = 60 * 60 * 1000;
export async function avaliarOferta(req, res) {
  const r = req.body || {};
  const nota = Number(r.notaComida);
  if (!Number.isInteger(nota) || nota < 1 || nota > 5)
    throw new ErroHttp(400, "Informe a nota de 1 a 5 estrelas.");
  const comentario = texto(r.comentarioComida, {
    campo: "comentário",
    max: 1000,
  });
  if (nota < 3 && !comentario)
    throw new ErroHttp(
      400,
      "Nota abaixo de 3 estrelas: informe o motivo da avaliação.",
    );
  const avaliador = texto(r.avaliadoPor, { campo: "responsável", max: 160 });

  const id = await transacao(async (db) => {
    const { rows } = await consultar(
      "SELECT * FROM doacoes WHERE token = $1 FOR UPDATE",
      [String(req.params.chave || "")],
      db,
    );
    const atual = rows[0];
    if (!atual) throw new ErroHttp(404, "Doação não encontrada.");
    if (atual.status !== "completed" || !atual.concluida_em) {
      throw new ErroHttp(
        409,
        "A avaliação só fica disponível depois que o estabelecimento registra a entrega.",
      );
    }
    if (Date.now() - new Date(atual.concluida_em).getTime() > UMA_HORA_MS) {
      throw new ErroHttp(
        403,
        "Prazo de avaliação encerrado: ela só pode ser enviada até 1 hora depois da entrega.",
      );
    }
    const extras = {
      ...(atual.extras || {}),
      avaliacaoEntidade: {
        notaComida: nota,
        comentarioComida: comentario || "",
        reclamacaoComida: !!r.reclamacaoComida || nota === 1,
        avaliadoPor:
          avaliador || atual.confirmado_por || "Representante da Entidade",
        avaliadoEm: new Date().toISOString(),
      },
    };
    await consultar(
      "UPDATE doacoes SET extras = $1::jsonb WHERE id = $2",
      [JSON.stringify(extras), atual.id],
      db,
    );
    await recalcularReputacao(db, { lojaId: atual.loja_id });
    return atual.id;
  });
  res.json(doacaoParaFront(await buscarDoacao("d.id = $1", [id])));
}
