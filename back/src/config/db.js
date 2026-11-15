import pg from "pg";
import { env } from "./env.js";

// DATE vem como texto "AAAA-MM-DD" e NUMERIC como número (não como string).
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1700, (v) => parseFloat(v));

// Bancos na nuvem (Neon, Render, Supabase) exigem conexão criptografada (SSL).
// No computador (localhost) o SSL fica desligado, como antes.
const local = /@(localhost|127\.0\.0\.1)[:/]/.test(env.databaseUrl);
const sslNaUrl = /sslmode=/.test(env.databaseUrl);
export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: 10,
  ...(local || sslNaUrl ? {} : { ssl: { rejectUnauthorized: false } }),
});

// Sem este ouvinte, uma conexão ociosa derrubada pelo PostgreSQL (reinício do serviço,
// queda de rede, pgAdmin encerrando sessões) DERRUBA a API inteira. Com ele, só registra:
// o pool descarta a conexão ruim e abre outra na próxima consulta.
pool.on("error", (erro) => {
  console.error(
    "[banco] conexão com o PostgreSQL perdida (a API continua no ar):",
    erro.message,
  );
});

export const consultar = (sql, params = [], cliente = pool) =>
  cliente.query(sql, params);

// Executa várias consultas na mesma transação (COMMIT ou ROLLBACK automático).
export async function transacao(fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    const resultado = await fn(cliente);
    await cliente.query("COMMIT");
    return resultado;
  } catch (erro) {
    // Se a própria conexão caiu, o ROLLBACK também falha: não deixa esse erro esconder o original
    await cliente.query("ROLLBACK").catch(() => {});
    throw erro;
  } finally {
    cliente.release();
  }
}
