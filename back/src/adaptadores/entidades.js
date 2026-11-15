import { consultar } from "../config/db.js";
import { ErroHttp } from "../utils/erros.js";
import {
  SQL_NOME,
  SQL_DOCUMENTO,
  normalizarNome,
  somenteDigitos,
} from "../utils/duplicidade.js";
import {
  limpar,
  extrasSem,
  textoOu,
  momentoOu,
  validacaoParaBanco,
  validacaoParaFront,
  traduzir,
  montarInsert,
  montarUpdate,
} from "./comum.js";

// Entidades sociais do front (saveall_social_partners) <-> tabela entidades_sociais
const TIPOS_ORGANIZACAO = [
  "banco_de_alimentos",
  "ong",
  "associacao",
  "instituicao_religiosa",
  "instituicao_assistencial",
  "outro",
];
const MAPEADOS = [
  "name",
  "cnpj",
  "email",
  "whatsapp",
  "phone",
  "address",
  "neighborhood",
  "city",
  "state",
  "postalCode",
  "contactPerson",
  "contactRole",
  "acceptedCategories",
  "hasRefrigeratedStorage",
  "hasOwnTransport",
  "operatingHours",
  "validationStatus",
  "validatedAt",
  "active",
  "notes",
  "govSignatureFileName",
  "govSignatureHash",
  "organizationType",
  "applicationDate",
  "usuarioId",
];
const MENSAGENS = {
  duplicado: "Já existe uma entidade cadastrada com este CNPJ.",
  vinculado:
    "Esta entidade tem doações registradas. Desvincule em vez de excluir.",
};

export const entidadeParaFront = (r, { semArquivo = false } = {}) => {
  const extras = { ...(r.extras || {}) };
  if (semArquivo) delete extras.govSignatureFileData;
  return limpar({
    ...extras,
    id: r.id,
    name: r.nome,
    cnpj: r.cnpj,
    email: r.email,
    whatsapp: r.whatsapp,
    phone: r.telefone,
    address: r.endereco,
    neighborhood: r.bairro,
    city: r.cidade,
    state: r.uf ? String(r.uf).trim() : null,
    postalCode: r.cep,
    contactPerson: r.responsavel_legal,
    contactRole: r.cargo_responsavel,
    acceptedCategories: r.categorias_aceitas,
    hasRefrigeratedStorage: r.possui_refrigeracao,
    hasOwnTransport: r.possui_transporte,
    operatingHours: r.horario_funcionamento,
    validationStatus: validacaoParaFront(r.status_validacao),
    validatedAt: r.validado_em,
    active: r.ativo,
    notes: r.observacoes,
    govSignatureFileName: r.termo_adesao_arquivo,
    govSignatureHash: r.termo_adesao_hash,
    organizationType: r.tipo_organizacao,
    applicationDate: r.criado_em,
    usuarioId: r.usuario_id,
  });
};

export function colunasDeEntidade(d) {
  const nome = textoOu(d.name, null, 160);
  if (!nome) throw new ErroHttp(400, "Informe o nome da entidade.");
  const cnpj = textoOu(d.cnpj, null, 30);
  if (!cnpj) throw new ErroHttp(400, "Informe o CNPJ da entidade.");
  const status = validacaoParaBanco(d.validationStatus);
  return {
    nome,
    cnpj,
    tipo_organizacao: TIPOS_ORGANIZACAO.includes(d.organizationType)
      ? d.organizationType
      : "outro",
    responsavel_legal: textoOu(d.contactPerson, "Responsável Legal", 120),
    cargo_responsavel: textoOu(d.contactRole, null, 120),
    email: textoOu(d.email, null, 160),
    telefone: textoOu(d.phone, null, 30),
    whatsapp: textoOu(d.whatsapp, null, 30),
    endereco: textoOu(d.address, "Não informado", 255),
    bairro: textoOu(d.neighborhood, null, 120),
    cidade: textoOu(d.city, "Pinhalzinho", 120),
    uf: textoOu(d.state, "SC", 2).toUpperCase(),
    cep: textoOu(d.postalCode, null, 12),
    categorias_aceitas: Array.isArray(d.acceptedCategories)
      ? d.acceptedCategories.map((c) => String(c).slice(0, 60)).slice(0, 30)
      : [],
    possui_refrigeracao: !!d.hasRefrigeratedStorage,
    possui_transporte: !!d.hasOwnTransport,
    horario_funcionamento: textoOu(d.operatingHours, null, 200),
    status_validacao: status,
    validado_em:
      momentoOu(d.validatedAt) ||
      (status === "validated" ? new Date().toISOString() : null),
    ativo: status === "unlinked" ? false : d.active !== false,
    observacoes: textoOu(d.notes, null, 2000),
    termo_adesao_arquivo: textoOu(d.govSignatureFileName, null, 255),
    termo_adesao_hash: textoOu(d.govSignatureHash, null, 128),
    extras: extrasSem(d, MAPEADOS),
  };
}

export const adaptadorEntidades = {
  podeEscrever: ["loja", "entidade", "master"],
  podeRemover: ["loja", "master"],

  async listar() {
    const { rows } = await consultar(
      "SELECT * FROM entidades_sociais ORDER BY criado_em, id",
    );
    return rows.map((r) => entidadeParaFront(r));
  },

  async salvar(_req, id, corpo) {
    const colunas = colunasDeEntidade(corpo);
    try {
      const { rows: existe } = await consultar(
        "SELECT id, nome, cnpj FROM entidades_sociais WHERE id = $1",
        [id],
      );
      // Nome ou CNPJ não podem repetir os de outra entidade (ignora máscara, maiúsculas e acentos).
      // Em edição só confere se o nome ou o CNPJ mudaram, para não travar entidades antigas.
      const atual = existe[0];
      const mudou =
        !atual ||
        normalizarNome(atual.nome) !== normalizarNome(colunas.nome) ||
        somenteDigitos(atual.cnpj) !== somenteDigitos(colunas.cnpj);
      if (mudou) {
        const digitos = somenteDigitos(colunas.cnpj);
        const { rows: repetidas } = await consultar(
          `SELECT nome, cnpj, (${SQL_NOME("nome")} = $2) AS mesmo_nome
             FROM entidades_sociais
            WHERE id <> $1 AND (${SQL_NOME("nome")} = $2 OR ($3 <> '' AND ${SQL_DOCUMENTO("cnpj")} = $3))
            LIMIT 1`,
          [id, normalizarNome(colunas.nome), digitos],
        );
        if (repetidas[0]) {
          throw new ErroHttp(
            409,
            repetidas[0].mesmo_nome
              ? `Já existe uma entidade com o nome "${repetidas[0].nome}". Escolha outro nome.`
              : `Já existe uma entidade cadastrada com o CNPJ ${colunas.cnpj} (${repetidas[0].nome}).`,
          );
        }
      }
      const q = existe[0]
        ? montarUpdate("entidades_sociais", id, colunas)
        : montarInsert("entidades_sociais", { id, ...colunas });
      const { rows } = await consultar(q.sql, q.valores);
      return entidadeParaFront(rows[0]);
    } catch (erro) {
      throw traduzir(erro, MENSAGENS);
    }
  },

  async remover(_req, id) {
    try {
      await consultar("DELETE FROM entidades_sociais WHERE id = $1", [id]);
    } catch (erro) {
      throw traduzir(erro, MENSAGENS);
    }
  },
};
