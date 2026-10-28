import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não configurada.')
}

const databaseUrl = process.env.DATABASE_URL
const needsSsl = /supabase\.co|pooler\.supabase\.com/i.test(databaseUrl)
// O pooler do Supabase usa certificado intermediário; o SSL do pg
// fica ligado sem validar a cadeia (sslmode=require na URL quebra isso).
const connectionString = databaseUrl
  .replace(/([?&])sslmode=[^&]*/g, '$1')
  .replace(/[?&]$/, '')
  .replace(/\?&/, '?')

export const pool = new Pool({
  connectionString,
  // Os associados leem do cache em memória, então poucas conexões bastam.
  // O pooler do Supabase recusa clientes acima do limite do plano; passar
  // disso derruba o portal em vez de enfileirar.
  max: Number(process.env.DATABASE_POOL_MAX ?? 30),
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
  keepAlive: true,
  ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
})

// Sem este ouvinte, uma conexão ociosa derrubada pelo pooler encerra o processo.
pool.on('error', (error) => {
  console.error('[db] conexão ociosa perdida; o pool abre outra', error.message)
})

export async function transaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>,
) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
