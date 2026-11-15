import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { consultar, transacao } from "../config/db.js";
import { ErroHttp } from "../utils/erros.js";
import {
  usuarioParaFront,
  usuarioSemSegredos,
  lojaParaFront,
} from "../utils/mapeadores.js";
import { texto, numero, extrasDe } from "../utils/validacao.js";
import { perfilDoFront } from "../utils/perfis.js";
import { CAMPOS_SENSIVEIS } from "../utils/criptografia.js";
import { garantirSemDuplicidade } from "../utils/duplicidade.js";

// Painel master: gestão de usuários, estabelecimentos e das próprias credenciais.
// (Antes tudo isso era feito em cima de cópias guardadas no localStorage.)

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID_USUARIO = /^user-[A-Za-z0-9_-]{1,100}$/;
const ID_LOJA = /^[A-Za-z0-9_-]{1,100}$/;

const emailValido = (valor) => {
  const email = texto(valor, {
    campo: "e-mail",
    max: 160,
    obrigatorio: true,
  }).toLowerCase();
  if (!EMAIL.test(email)) throw new ErroHttp(400, "E-mail inválido.");
  return email;
};

const traduzirErroBanco = (erro, mensagemFk) => {
  if (erro.code === "23505")
    return new ErroHttp(409, "Já existe um registro com este e-mail.");
  if (erro.code === "23503") return new ErroHttp(409, mensagemFk);
  return erro;
};

// Monta o UPDATE a partir de um mapa campo do front -> coluna
const montarSets = () => {
  const sets = [];
  const valores = [];
  const add = (coluna, valor) => {
    valores.push(valor);
    sets.push(`${coluna} = $${valores.length}`);
  };
  return { sets, valores, add };
};

// ============================ USUÁRIOS =====================================

const CONHECIDOS_USUARIO = [
  "id",
  "idNumerico",
  "criadoEm",
  "name",
  "email",
  "role",
  "points",
  "valorTotalEconomizado",
  "lucroAcumulado",
  "urlAvatar",
  "address",
  "cpfCnpj",
  "dataNascimento",
  "termosAceitos",
  "verificado",
  "rating",
  "qtdAvaliacoes",
  "qtdReclamacoes",
  "suspenso",
  "motivoDesvinculo",
  "password",
  "passwordHash",
  "senhaTemporaria",
  "whatsapp",
  ...CAMPOS_SENSIVEIS,
];

export async function listarUsuarios(_req, res) {
  const { rows } = await consultar(
    "SELECT * FROM usuarios ORDER BY criado_em, id",
  );
  res.json(rows.map(usuarioSemSegredos));
}

export async function salvarUsuario(req, res) {
  const id = String(req.params.id || "");
  if (!ID_USUARIO.test(id))
    throw new ErroHttp(400, "Identificador de usuário inválido.");
  const c = req.body || {};
  const proprio = id === req.usuario.id;

  const { rows: existentes } = await consultar(
    "SELECT * FROM usuarios WHERE id = $1",
    [id],
  );
  const atual = existentes[0];

  let perfil = atual?.perfil;
  if (c.role !== undefined) {
    const novo = perfilDoFront(c.role === "admin" ? "master" : c.role);
    if (!novo) throw new ErroHttp(400, "Tipo de conta inválido.");
    if (proprio && novo !== atual.perfil)
      throw new ErroHttp(400, "Você não pode alterar o seu próprio perfil.");
    if (novo === "master" && atual?.perfil !== "master")
      throw new ErroHttp(400, "Não é permitido criar outro master.");
    perfil = novo;
  }
  if (proprio && c.suspenso)
    throw new ErroHttp(400, "Você não pode suspender a sua própria conta.");
  // Nome e CPF/CNPJ não podem repetir os de outra conta
  await garantirSemDuplicidade({
    nome: c.name,
    cpfCnpj: c.cpfCnpj,
    usuarioId: id,
  });

  const extras = extrasDe(c, CONHECIDOS_USUARIO);
  const nota = (valor) =>
    valor === null || valor === ""
      ? null
      : numero(valor, { campo: "nota", max: 5 });
  const inteiro = (valor, campo) =>
    numero(valor, { campo, max: 1e9, inteiro: true, padrao: 0 });
  const dinheiro = (valor, campo) =>
    numero(valor, { campo, max: 1e9, padrao: 0 });

  try {
    if (!atual) {
      // Usuário novo criado pelo master: recebe uma senha temporária, se nenhuma for informada.
      perfil ??= "cliente";
      const senhaTemporaria = c.password
        ? null
        : crypto.randomBytes(6).toString("base64url");
      const senha = String(c.password || senhaTemporaria);
      if (senha.length < 6)
        throw new ErroHttp(400, "A senha precisa ter pelo menos 6 caracteres.");
      const cliente = perfil === "cliente";
      const nome =
        texto(c.name, { campo: "nome", min: 2, max: 120 }) || "Novo Usuário";
      const endereco =
        texto(c.address, { campo: "endereço", max: 255 }) || "Pinhalzinho, SC";

      const usuario = await transacao(async (db) => {
        const { rows } = await consultar(
          `INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pontos, endereco, cpf_cnpj, verificado, nota,
                                 qtd_avaliacoes, suspenso, motivo_desvinculo, extras)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$11,$12,$13::jsonb) RETURNING *`,
          [
            id,
            nome,
            c.email ? emailValido(c.email) : `usuario_${Date.now()}@email.com`,
            await bcrypt.hash(senha, 10),
            perfil,
            c.points !== undefined ? inteiro(c.points, "pontos") : 0,
            endereco,
            texto(c.cpfCnpj, { campo: "CPF/CNPJ", max: 30 }),
            c.verificado !== undefined ? !!c.verificado : true,
            perfil !== "loja"
              ? null
              : c.rating !== undefined
                ? nota(c.rating)
                : 5,
            !!c.suspenso,
            c.suspenso
              ? texto(c.motivoDesvinculo, { campo: "motivo", max: 500 })
              : null,
            JSON.stringify(extras),
          ],
          db,
        );
        // Mesma convenção do cadastro: a loja tem o id do usuário sem o prefixo "user-".
        if (perfil === "loja") {
          await consultar(
            `INSERT INTO lojas (id, usuario_id, nome, logo, categoria, nota, endereco)
             VALUES ($1,$2,$3,'lojaKiuda','Café & Alimentação',5,$4) ON CONFLICT (id) DO NOTHING`,
            [id.replace("user-", ""), id, nome, endereco],
            db,
          );
        }
        return rows[0];
      });
      return res.status(201).json({
        ...usuarioSemSegredos(usuario),
        ...(senhaTemporaria ? { senhaTemporaria } : {}),
      });
    }

    const { sets, valores, add } = montarSets();
    if (c.name !== undefined)
      add(
        "nome",
        texto(c.name, { campo: "nome", min: 2, max: 120, obrigatorio: true }),
      );
    if (c.email !== undefined) add("email", emailValido(c.email));
    if (perfil !== atual.perfil) add("perfil", perfil);
    if (c.points !== undefined) add("pontos", inteiro(c.points, "pontos"));
    if (c.valorTotalEconomizado !== undefined)
      add(
        "valor_economizado",
        dinheiro(c.valorTotalEconomizado, "valor economizado"),
      );
    if (c.lucroAcumulado !== undefined)
      add("lucro_acumulado", dinheiro(c.lucroAcumulado, "lucro acumulado"));
    if (c.urlAvatar !== undefined)
      add(
        "avatar_url",
        texto(c.urlAvatar, { campo: "avatar", max: 2_000_000 }),
      );
    if (c.address !== undefined)
      add("endereco", texto(c.address, { campo: "endereço", max: 255 }));
    if (c.cpfCnpj !== undefined)
      add("cpf_cnpj", texto(c.cpfCnpj, { campo: "CPF/CNPJ", max: 30 }));
    if (c.whatsapp !== undefined)
      add(
        "telefone",
        String(c.whatsapp || "")
          .replace(/\D/g, "")
          .slice(0, 15) || null,
      );
    if (c.dataNascimento !== undefined)
      add(
        "data_nascimento",
        c.dataNascimento ? String(c.dataNascimento).slice(0, 10) : null,
      );
    if (c.termosAceitos !== undefined) add("termos_aceitos", !!c.termosAceitos);
    if (c.verificado !== undefined) add("verificado", !!c.verificado);
    if (c.suspenso !== undefined) {
      add("suspenso", !!c.suspenso);
      add(
        "motivo_desvinculo",
        c.suspenso
          ? texto(c.motivoDesvinculo, { campo: "motivo", max: 500 })
          : null,
      );
    }
    if (perfil !== "cliente") {
      if (perfil === "loja" && c.rating !== undefined)
        add("nota", nota(c.rating));
      if (c.qtdAvaliacoes !== undefined)
        add("qtd_avaliacoes", inteiro(c.qtdAvaliacoes, "avaliações"));
      if (c.qtdReclamacoes !== undefined)
        add("qtd_reclamacoes", inteiro(c.qtdReclamacoes, "reclamações"));
    }
    if (c.password) {
      if (String(c.password).length < 6)
        throw new ErroHttp(400, "A senha precisa ter pelo menos 6 caracteres.");
      add("senha_hash", await bcrypt.hash(String(c.password), 10));
    }
    if (Object.keys(extras).length) {
      valores.push(JSON.stringify(extras));
      sets.push(
        `extras = COALESCE(extras, '{}'::jsonb) || $${valores.length}::jsonb`,
      );
    }
    if (!sets.length) return res.json(usuarioSemSegredos(atual));

    valores.push(id);
    const { rows } = await consultar(
      `UPDATE usuarios SET ${sets.join(", ")} WHERE id = $${valores.length} RETURNING *`,
      valores,
    );
    if (
      rows[0].perfil === "loja" &&
      (c.name !== undefined || c.address !== undefined)
    ) {
      await consultar(
        "UPDATE lojas SET nome = $1, endereco = $2 WHERE usuario_id = $3",
        [rows[0].nome, rows[0].endereco, id],
      );
    }
    // A foto exibida aos clientes é lojas.logo: acompanha a foto do usuário da loja.
    if (rows[0].perfil === "loja" && c.urlAvatar !== undefined) {
      await consultar(
        "UPDATE lojas SET logo = COALESCE(NULLIF($1, ''), logo) WHERE usuario_id = $2",
        [rows[0].avatar_url, id],
      );
    }
    res.json(usuarioSemSegredos(rows[0]));
  } catch (erro) {
    throw traduzirErroBanco(erro, "Registro relacionado não encontrado.");
  }
}

export async function removerUsuario(req, res) {
  const id = String(req.params.id || "");
  if (id === req.usuario.id)
    throw new ErroHttp(400, "Você não pode excluir a sua própria conta.");
  try {
    await transacao(async (db) => {
      const { rows } = await consultar(
        "SELECT id, perfil FROM usuarios WHERE id = $1",
        [id],
        db,
      );
      if (!rows[0]) return; // já não existe: nada a fazer
      if (rows[0].perfil === "master")
        throw new ErroHttp(400, "A conta master não pode ser excluída.");
      if (rows[0].perfil === "loja") {
        const { rows: lojas } = await consultar(
          "SELECT id FROM lojas WHERE usuario_id = $1",
          [id],
          db,
        );
        for (const loja of lojas) {
          await consultar(
            "DELETE FROM alimentos WHERE loja_id = $1",
            [loja.id],
            db,
          );
          await consultar(
            "DELETE FROM faixas_desconto WHERE loja_id = $1",
            [loja.id],
            db,
          );
          await consultar("DELETE FROM lojas WHERE id = $1", [loja.id], db);
        }
      }
      await consultar("DELETE FROM usuarios WHERE id = $1", [id], db);
    });
  } catch (erro) {
    throw traduzirErroBanco(
      erro,
      "Este usuário tem pedidos ou registros vinculados. Suspenda a conta em vez de excluir.",
    );
  }
  res.json({ success: true });
}

// Credenciais do próprio master (nome de exibição, e-mail de login e senha).
export async function atualizarCredenciais(req, res) {
  const c = req.body || {};
  if (c.username)
    await garantirSemDuplicidade({
      nome: c.username,
      usuarioId: req.usuario.id,
    });
  const { sets, valores, add } = montarSets();
  if (c.username !== undefined && c.username !== "")
    add("nome", texto(c.username, { campo: "usuário", min: 2, max: 120 }));
  if (c.email !== undefined && c.email !== "")
    add("email", emailValido(c.email));
  if (c.password) {
    if (String(c.password).length < 6)
      throw new ErroHttp(400, "A senha precisa ter pelo menos 6 caracteres.");
    add("senha_hash", await bcrypt.hash(String(c.password), 10));
  }
  sets.push(
    `extras = COALESCE(extras, '{}'::jsonb) || jsonb_build_object('credenciaisAtualizadasEm', now())`,
  );
  valores.push(req.usuario.id);
  try {
    const { rows } = await consultar(
      `UPDATE usuarios SET ${sets.join(", ")} WHERE id = $${valores.length} RETURNING *`,
      valores,
    );
    res.json(usuarioParaFront(rows[0]));
  } catch (erro) {
    throw traduzirErroBanco(erro, "Não foi possível atualizar as credenciais.");
  }
}

// ========================== ESTABELECIMENTOS ================================

export async function listarLojas(_req, res) {
  const { rows } = await consultar(
    "SELECT * FROM lojas ORDER BY cidade NULLS LAST, nome",
  );
  res.json(rows.map(lojaParaFront));
}

export async function salvarLoja(req, res) {
  const id = String(req.params.id || "");
  if (!ID_LOJA.test(id))
    throw new ErroHttp(400, "Identificador de estabelecimento inválido.");
  const c = req.body || {};
  // O nome do estabelecimento não pode repetir o de outra loja ou conta (o dono da própria loja não conta)
  if (c.name !== undefined || c.cnpj) {
    const { rows: dono } = await consultar(
      "SELECT usuario_id FROM lojas WHERE id = $1",
      [id],
    );
    await garantirSemDuplicidade({
      nome: c.name,
      cpfCnpj: c.cnpj,
      usuarioId: dono[0]?.usuario_id || null,
      lojaId: id,
    });
  }

  const loja = await transacao(async (db) => {
    const { rows: existentes } = await consultar(
      "SELECT * FROM lojas WHERE id = $1 FOR UPDATE",
      [id],
      db,
    );
    const atual = existentes[0];

    if (!atual) {
      const { rows } = await consultar(
        `INSERT INTO lojas (id, usuario_id, nome, logo, categoria, nota, endereco, cidade)
         VALUES ($1, NULL, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          id,
          texto(c.name, { campo: "nome", min: 2, max: 160 }) ||
            "Nova Panificadora",
          texto(c.logo, { campo: "logo", max: 2_000_000 }) || "lojaItaipu",
          texto(c.category, { campo: "categoria", max: 60 }) || "Padaria",
          c.rating !== undefined && c.rating !== null
            ? numero(c.rating, { campo: "nota", max: 5 })
            : 5,
          texto(c.address, { campo: "endereço", max: 255 }) ||
            "Pinhalzinho, SC",
          texto(c.city, { campo: "cidade", max: 120 }),
        ],
        db,
      );
      return rows[0];
    }

    const { sets, valores, add } = montarSets();
    if (c.name !== undefined)
      add(
        "nome",
        texto(c.name, { campo: "nome", min: 2, max: 160, obrigatorio: true }),
      );
    if (c.logo !== undefined)
      add("logo", texto(c.logo, { campo: "logo", max: 2_000_000 }));
    if (c.category !== undefined)
      add("categoria", texto(c.category, { campo: "categoria", max: 60 }));
    if (c.rating !== undefined)
      add(
        "nota",
        c.rating === null ? null : numero(c.rating, { campo: "nota", max: 5 }),
      );
    if (c.address !== undefined)
      add("endereco", texto(c.address, { campo: "endereço", max: 255 }));
    if (c.city !== undefined)
      add("cidade", texto(c.city, { campo: "cidade", max: 120 }));
    const mudouSuspensao =
      c.suspenso !== undefined && !!c.suspenso !== !!atual.suspenso;
    if (c.suspenso !== undefined) {
      add("suspenso", !!c.suspenso);
      add(
        "motivo_desvinculo",
        c.suspenso
          ? texto(c.motivoDesvinculo, { campo: "motivo", max: 500 })
          : null,
      );
    }
    let linha = atual;
    if (sets.length) {
      valores.push(id);
      const { rows } = await consultar(
        `UPDATE lojas SET ${sets.join(", ")} WHERE id = $${valores.length} RETURNING *`,
        valores,
        db,
      );
      linha = rows[0];
    }
    // Suspender tira os alimentos da vitrine e bloqueia o acesso do dono; restaurar devolve os dois.
    if (mudouSuspensao) {
      await consultar(
        `UPDATE alimentos SET status = $1 WHERE loja_id = $2`,
        [linha.suspenso ? "inactive" : "active", id],
        db,
      );
      if (linha.usuario_id) {
        await consultar(
          "UPDATE usuarios SET suspenso = $1, motivo_desvinculo = $2 WHERE id = $3",
          [
            linha.suspenso,
            linha.suspenso ? linha.motivo_desvinculo : null,
            linha.usuario_id,
          ],
          db,
        );
      }
    }
    return linha;
  });
  res.json(lojaParaFront(loja));
}

export async function removerLoja(req, res) {
  const id = String(req.params.id || "");
  try {
    await transacao(async (db) => {
      const { rows } = await consultar(
        "SELECT id, usuario_id FROM lojas WHERE id = $1",
        [id],
        db,
      );
      if (!rows[0]) return; // já não existe
      await consultar("DELETE FROM alimentos WHERE loja_id = $1", [id], db);
      await consultar(
        "DELETE FROM faixas_desconto WHERE loja_id = $1",
        [id],
        db,
      );
      await consultar("DELETE FROM lojas WHERE id = $1", [id], db);
      if (rows[0].usuario_id) {
        await consultar(
          `DELETE FROM usuarios WHERE id = $1 AND perfil = 'loja'`,
          [rows[0].usuario_id],
          db,
        );
      }
    });
  } catch (erro) {
    throw traduzirErroBanco(
      erro,
      "Este estabelecimento tem pedidos vinculados. Suspenda em vez de excluir.",
    );
  }
  res.json({ success: true });
}
