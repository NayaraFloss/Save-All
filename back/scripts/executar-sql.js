// Alternativa ao pgAdmin: executa um arquivo .sql no banco do DATABASE_URL.
// Uso: npm run banco:criar
import fs from 'node:fs'
import { pool } from '../src/config/db.js'

const arquivo = process.argv[2] || 'database/saveall_pgadmin.sql'
try {
  await pool.query(fs.readFileSync(arquivo, 'utf8'))
  console.log(`OK: ${arquivo} executado.`)
} catch (e) {
  console.error('Falha ao executar o script:', e.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
