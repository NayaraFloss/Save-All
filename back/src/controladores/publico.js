// =====================================================================
// controladores/publico.js — ROTAS SEM LOGIN
// Portal onde entidades sociais pedem credenciamento e o link que a
// entidade recebe para aceitar/recusar e avaliar uma doação.
// =====================================================================

// Importa o módulo de criptografia do Node (gera ids aleatórios)
import crypto from "node:crypto";
// Importa consulta e transação do banco
import { consultar, transacao } from "../config/db.js";
// Importa o erro com código HTTP
import { ErroHttp } from "../utils/erros.js";
// Importa o validador de texto
import { texto } from "../utils/validacao.js";

// Importa do adaptador de entidades:
import {
  // o tradutor de entidade (banco -> front)
  entidadeParaFront,
  // e o tradutor de entidade (front -> colunas do banco)
  colunasDeEntidade,
// de onde importar
} from "../adaptadores/entidades.js";
// Importa do adaptador de doações:
import {
  // o tradutor de doação (banco -> front)
  doacaoParaFront,
  // a busca de uma doação completa
  buscarDoacao,
  // a função que registra a assinatura do termo
  assinarTermo,
// de onde importar
} from "../adaptadores/doacoes.js";
// Importa ferramentas comuns:
import {
  // gera o "hash" SHA-256 (impressão digital de um texto)
  sha256,
  // traduz erros do banco em mensagens amigáveis
  traduzir,
  // monta um comando INSERT automaticamente
  montarInsert,
  // valida um horário (ou devolve null)
  horaOu,
// de onde importar
} from "../adaptadores/comum.js";
// Importa a função que recalcula a nota da loja
import { recalcularReputacao } from "./pedidos.js";

// Rotas sem login: portal de credenciamento de entidades (entidades_sociais)
// e link de confirmação de doação enviado à entidade (doacoes, pelo token).

// GET /publico/parceiros-sociais
export async function listarParceirosSociais(_req, res) {
  // Busca todas as entidades
  const { rows } = await consultar(
    // SQL: todas as entidades, das mais antigas para as mais novas
    "SELECT * FROM entidades_sociais ORDER BY criado_em, id",
  // Fecha a consulta
  );
  // O arquivo do termo assinado só aparece para quem está logado
  // Converte cada uma sem o arquivo e responde
  res.json(rows.map((r) => entidadeParaFront(r, { semArquivo: true })));
// Fecha a função
}

// POST /publico/parceiros-sociais — entidade pede credenciamento
export async function credenciarEntidade(req, res) {
  // Dados enviados (ou objeto vazio)
  const d = req.body || {};
  // Valida o nome da entidade (só para dar erro se estiver errado)
  texto(d.name, {
    // Nome do campo
    campo: "nome da entidade",
    // Mínimo 2
    min: 2,
    // Máximo 160
    max: 160,
    // Obrigatório
    obrigatorio: true,
  // Fecha a validação
  });
  // Gera um id curto, ex.: "soc-part-1a2b3c4d"
  const id = `soc-part-${crypto.randomUUID().slice(0, 8)}`;
  // A entidade nunca se aprova sozinha: situação definida pelo servidor
  // Converte os dados do front para colunas do banco
  const colunas = colunasDeEntidade({
    // Tudo que veio do formulário
    ...d,
    // Situação forçada: "aguardando análise"
    validationStatus: "pending_review",
    // Ainda não foi validada
    validatedAt: null,
    // Começa ativa
    active: true,
    // Observação: a enviada ou um texto padrão
    notes: d.notes || "Submetido via formulário público com assinatura Gov.br",
    // Nome do arquivo do termo: o enviado ou um padrão
    govSignatureFileName: d.govSignatureFileName || "termo_govbr_assinado.pdf",
    // Impressão digital do envio (id + CNPJ + arquivo + horário)
    govSignatureHash: sha256(
      // Texto que será "carimbado"
      `${id}|${d.cnpj || ""}|${d.govSignatureFileData || ""}|${Date.now()}`,
    // Fecha o sha256
    ),
  // Fecha o colunasDeEntidade
  });
  // Define os dados extras (sobrescreve os que viriam do formulário)
  colunas.extras = {
    // Veio do formulário público
    origin: "public_form",
    // Situação de seleção: em espera
    selectionStatus: "standby",
    // Marca a assinatura Gov.br como verificada
    govSignatureVerified: true,
    // Se o arquivo veio como texto, guarda também
    ...(typeof d.govSignatureFileData === "string"
      // Inclui o arquivo
      ? { govSignatureFileData: d.govSignatureFileData }
      // Senão, nada
      : {}),
  // Fecha os extras
  };
  // Tenta gravar
  try {
    // Monta o INSERT com o id e as colunas
    const q = montarInsert("entidades_sociais", { id, ...colunas });
    // Executa
    const { rows } = await consultar(q.sql, q.valores);
    // Responde 201 com a entidade criada (sem o arquivo)
    res.status(201).json(entidadeParaFront(rows[0], { semArquivo: true }));
  // Se der erro
  } catch (erro) {
    // Traduz o erro do banco em mensagem amigável
    throw traduzir(erro, {
      // Mensagem para CNPJ repetido
      duplicado:
        // Texto
        "Já existe uma entidade cadastrada com este CNPJ. Consulte o protocolo dela.",
    // Fecha o traduzir
    });
  // Fecha o catch
  }
// Fecha a função
}

// GET /publico/ofertas-doacao/:chave — abre a doação pelo link
export async function buscarOferta(req, res) {
  // Busca a doação cujo token é igual à chave da URL
  const doacao = await buscarDoacao("d.token = $1", [
    // $1 = chave da URL
    String(req.params.chave || ""),
  // Fecha a busca
  ]);
  // Se não achou: 404
  if (!doacao) throw new ErroHttp(404, "Consulta de doação não encontrada.");
  // Responde no formato do front
  res.json(doacaoParaFront(doacao));
// Fecha a função
}

// POST /publico/ofertas-doacao/:chave/resposta — entidade aceita ou recusa
export async function responderOferta(req, res) {
  // Dados enviados
  const r = req.body || {};
  // A resposta precisa ser "accepted" (aceita) ou "rejected" (recusada)
  if (!["accepted", "rejected"].includes(r.status))
    // Senão erro 400
    throw new ErroHttp(400, "Resposta inválida.");
  // Pega a imagem da assinatura, se veio
  const assinatura =
    // Se é um texto não vazio
    typeof r.signatureImage === "string" && r.signatureImage
      // Usa ela
      ? r.signatureImage
      // Senão, nada
      : undefined;
  // Se a assinatura for grande demais
  if (assinatura && assinatura.length > 2_000_000)
    // Erro 413
    throw new ErroHttp(413, "Assinatura muito grande.");

  // Transação: tudo é gravado junto ou nada é
  const id = await transacao(async (db) => {
    // Busca a doação e a "tranca" (FOR UPDATE) para ninguém alterar ao mesmo tempo
    const { rows } = await consultar(
      // SQL
      "SELECT * FROM doacoes WHERE token = $1 FOR UPDATE",
      // $1 = chave
      [String(req.params.chave || "")],
      // Conexão da transação
      db,
    // Fecha a consulta
    );
    // Doação encontrada
    const atual = rows[0];
    // Se não existe: 404
    if (!atual) throw new ErroHttp(404, "Consulta de doação não encontrada.");
    // Se já não está aguardando resposta (ou a loja mudou o status manualmente)
    if (atual.status !== "pending_inquiry" || atual.extras?.statusFront) {
      // Erro 409 (conflito)
      throw new ErroHttp(
        // Código
        409,
        // Mensagem
        "Esta consulta não está mais aguardando resposta (pode ter sido cancelada pela loja ou já respondida).",
      // Fecha o erro
      );
    // Fecha o if
    }
    // Data e hora de agora, em texto padrão ISO
    const momento = new Date().toISOString();
    // Nome de quem confirmou (opcional, até 160)
    const confirmadoPor = texto(r.confirmedBy, {
      // Nome do campo
      campo: "responsável",
      // Máximo
      max: 160,
    // Fecha a validação
    });
    // Documento de reserva: o CNPJ do cadastro da entidade (usado só se o CPF não vier)
    // Busca o CNPJ da entidade
    const { rows: cadastro } = await consultar(
      // SQL
      "SELECT cnpj FROM entidades_sociais WHERE id = $1",
      // $1 = entidade da doação
      [atual.entidade_id],
      // Conexão
      db,
    // Fecha a consulta
    );
    // Documento: o do cadastro; se não houver, o enviado
    // CPF digitado pelo responsável (sem checar dígitos verificadores: aceita como veio);
    // se não informou, usa o documento do cadastro da entidade
    const cpf =
      texto(r.signatureCpf, { campo: "documento", max: 20 }) ||
      texto(cadastro[0]?.cnpj, { campo: "documento", max: 20 });
    // Copia os extras atuais
    const extras = { ...(atual.extras || {}) };
    // Se veio assinatura desenhada
    if (assinatura) {
      // Acrescenta os dados da assinatura
      Object.assign(extras, {
        // Imagem
        signatureImage: assinatura,
        // Documento
        signatureCpf: cpf || undefined,
        // Quando assinou
        signatureSignedAt: momento,
        // Impressão digital da assinatura (prova de que não foi alterada)
        signatureHash: sha256(
          // Texto carimbado
          `${atual.id}|${confirmadoPor}|${cpf}|${momento}|${assinatura}`,
        // Fecha o sha256
        ),
      // Fecha o Object.assign
      });
    // Fecha o if
    }
    // Grava a resposta na doação
    await consultar(
      `UPDATE doacoes SET status = $1, respondido_em = $2, confirmado_por = $3, nota_resposta = $4, -- novos valores
              previsao_retirada = $5, motivo_rejeicao = $6, extras = $7::jsonb WHERE id = $8`, // ... da doação $8
      // Valores
      [
        // $1 status
        r.status,
        // $2 quando respondeu
        momento,
        // $3 quem confirmou
        confirmadoPor ||
          // se não informou e aceitou, um nome padrão; se recusou, null
          (r.status === "accepted" ? "Representante da Entidade" : null),
        // $4 observação
        texto(r.responseNote, { campo: "observação", max: 1000 }) || null,
        // $5 horário previsto de retirada
        horaOu(r.pickupEstimatedTime),
        // $6 motivo da recusa
        texto(r.rejectionReason, { campo: "motivo", max: 500 }) ||
          // se recusou sem motivo, usa um padrão
          (r.status === "rejected"
            // texto padrão
            ? "Indisponibilidade de recebimento/armazenamento"
            // se aceitou, null
            : null),
        // $7 extras
        JSON.stringify(extras),
        // $8 id da doação
        atual.id,
      // Fecha a lista
      ],
      // Conexão
      db,
    // Fecha a consulta
    );
    // Se aceitou, registra a assinatura do termo pelo lado de quem recebe
    if (r.status === "accepted") {
      // Assina o termo
      await assinarTermo(db, atual.id, {
        // Quem assina: o receptor
        parte: "receptor",
        // Nome
        nome: confirmadoPor || "Representante da Entidade",
        // Documento
        documento: cpf,
        // Tipo: desenho (se houve imagem) ou Gov.br
        tipo: assinatura ? "desenho" : "govbr",
        // Imagem da assinatura
        imagem: assinatura,
      // Fecha os dados
      });
    // Fecha o if
    }
    // Devolve o id da doação
    return atual.id;
  // Fecha a transação
  });
  // Busca a doação atualizada e responde
  res.json(doacaoParaFront(await buscarDoacao("d.id = $1", [id])));
// Fecha a função
}

// Avaliação dos produtos recebidos pela entidade (link enviado após a entrega).
// Mesmas regras da avaliação do cliente: nota de 1 a 5, motivo obrigatório abaixo de 3 estrelas,
// reclamação automática com 1 estrela e prazo de 1 hora depois da entrega. Conta na nota geral da loja.
// Uma hora em milissegundos
const UMA_HORA_MS = 60 * 60 * 1000;
// POST /publico/ofertas-doacao/:chave/avaliacao
export async function avaliarOferta(req, res) {
  // Dados enviados
  const r = req.body || {};
  // Converte a nota para número
  const nota = Number(r.notaComida);
  // A nota precisa ser inteira, entre 1 e 5
  if (!Number.isInteger(nota) || nota < 1 || nota > 5)
    // Senão erro 400
    throw new ErroHttp(400, "Informe a nota de 1 a 5 estrelas.");
  // Comentário (opcional, até 1000)
  const comentario = texto(r.comentarioComida, {
    // Nome do campo
    campo: "comentário",
    // Máximo
    max: 1000,
  // Fecha a validação
  });
  // Nota baixa (1 ou 2) sem comentário
  if (nota < 3 && !comentario)
    // Erro 400
    throw new ErroHttp(
      // Código
      400,
      // Mensagem
      "Nota abaixo de 3 estrelas: informe o motivo da avaliação.",
    // Fecha o erro
    );
  // Nome de quem avaliou (opcional)
  const avaliador = texto(r.avaliadoPor, { campo: "responsável", max: 160 });

  // Transação
  const id = await transacao(async (db) => {
    // Busca e tranca a doação pelo token
    const { rows } = await consultar(
      // SQL
      "SELECT * FROM doacoes WHERE token = $1 FOR UPDATE",
      // $1 = chave
      [String(req.params.chave || "")],
      // Conexão
      db,
    // Fecha a consulta
    );
    // Doação encontrada
    const atual = rows[0];
    // Não existe: 404
    if (!atual) throw new ErroHttp(404, "Doação não encontrada.");
    // Se a doação ainda não foi concluída/entregue
    if (atual.status !== "completed" || !atual.concluida_em) {
      // Erro 409
      throw new ErroHttp(
        // Código
        409,
        // Mensagem
        "A avaliação só fica disponível depois que o estabelecimento registra a entrega.",
      // Fecha o erro
      );
    // Fecha o if
    }
    // Se já passou mais de 1 hora desde a entrega
    if (Date.now() - new Date(atual.concluida_em).getTime() > UMA_HORA_MS) {
      // Erro 403
      throw new ErroHttp(
        // Código
        403,
        // Mensagem
        "Prazo de avaliação encerrado: ela só pode ser enviada até 1 hora depois da entrega.",
      // Fecha o erro
      );
    // Fecha o if
    }
    // Monta os novos extras com a avaliação
    const extras = {
      // Mantém os extras atuais
      ...(atual.extras || {}),
      // Acrescenta a avaliação da entidade
      avaliacaoEntidade: {
        // Nota
        notaComida: nota,
        // Comentário (ou vazio)
        comentarioComida: comentario || "",
        // É reclamação se marcou ou se deu 1 estrela
        reclamacaoComida: nota === 1 || (!!r.reclamacaoComida && nota <= 2),
        // Quem avaliou
        avaliadoPor:
          // O informado, ou quem confirmou a doação, ou um nome padrão
          avaliador || atual.confirmado_por || "Representante da Entidade",
        // Quando avaliou
        avaliadoEm: new Date().toISOString(),
      // Fecha a avaliação
      },
    // Fecha os extras
    };
    // Grava os extras
    await consultar(
      // SQL
      "UPDATE doacoes SET extras = $1::jsonb WHERE id = $2",
      // $1 extras, $2 id
      [JSON.stringify(extras), atual.id],
      // Conexão
      db,
    // Fecha a consulta
    );
    // Recalcula a nota da loja, já que entrou uma avaliação nova
    await recalcularReputacao(db, { lojaId: atual.loja_id });
    // Devolve o id
    return atual.id;
  // Fecha a transação
  });
  // Busca a doação atualizada e responde
  res.json(doacaoParaFront(await buscarDoacao("d.id = $1", [id])));
// Fecha a função
}
