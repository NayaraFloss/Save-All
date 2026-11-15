import { env } from "./config/env.js";
import { pool } from "./config/db.js";
import { app } from "./app.js";

const servidor = app.listen(env.porta, async () => {
  try {
    await pool.query("SELECT 1");
    console.log(
      `API Save All em http://localhost:${env.porta}/v1  (banco conectado)`,
    );
  } catch (e) {
    console.error("Não foi possível conectar ao PostgreSQL:", e.message);
    console.error(
      "Confira DATABASE_URL no .env e se o script database/saveall_pgadmin.sql foi executado.",
    );
  }
});

// Erros que escapariam de todos os tratamentos: em vez de a API cair (e o app ficar
// "zerado" com ERR_CONNECTION_REFUSED), registra o erro completo no terminal e segue no ar.
process.on("unhandledRejection", (erro) => {
  console.error("[erro não tratado] promessa rejeitada:", erro?.stack || erro);
});
process.on("uncaughtException", (erro) => {
  console.error("[erro não tratado] exceção:", erro?.stack || erro);
});

const encerrar = () =>
  servidor.close(() => pool.end().then(() => process.exit(0)));
process.on("SIGINT", encerrar);
process.on("SIGTERM", encerrar);
