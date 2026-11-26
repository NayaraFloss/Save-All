// Alternativa ao pgAdmin: executa um arquivo .sql no banco do DATABASE_URL.
// Uso: npm run banco:criar

// Importa o módulo de arquivos do Node.js (para ler o .sql)
import fs from 'node:fs'
// Importa o pool de conexões com o banco
import { pool } from '../src/config/db.js'

// Usa o arquivo informado no terminal; se nenhum for informado, usa o script principal do banco
const arquivo = process.argv[2] || 'database/saveall_pgadmin.sql'
// Tenta executar
try {
  // Lê o arquivo inteiro como texto e manda o banco executar
  await pool.query(fs.readFileSync(arquivo, 'utf8'))
  // Avisa que deu certo
  console.log(`OK: ${arquivo} executado.`)
// Se deu erro
} catch (e) {
  // Mostra o motivo
  console.error('Falha ao executar o script:', e.message)
  // Marca que o programa terminou com falha (código 1)
  process.exitCode = 1
// Sempre, no final
} finally {
  // Fecha as conexões com o banco para o programa poder terminar
  await pool.end()
// Fecha o finally
}
