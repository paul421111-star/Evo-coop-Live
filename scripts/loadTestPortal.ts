/**
 * Simula associados com o portal aberto durante o sorteio: cada um consulta
 * o painel a cada 1s e o ranking a cada 3s, como o navegador faz.
 *
 * Uso (PowerShell):
 *   $env:ASSOCIATE_COOKIE = '<valor do cookie evo_associate>'
 *   $env:CLIENTS = '1000'; $env:SECONDS = '60'
 *   npx tsx scripts/loadTestPortal.ts
 */
import http from 'node:http'

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:3015'
const cookie = process.env.ASSOCIATE_COOKIE ?? ''
const clients = Number(process.env.CLIENTS ?? 1000)
const seconds = Number(process.env.SECONDS ?? 60)

if (!cookie) {
  console.error('Defina ASSOCIATE_COOKIE com o cookie evo_associate de um associado.')
  process.exit(1)
}

type Sample = { path: string; status: number; ms: number }
const samples: Sample[] = []
const errors = new Map<string, number>()
const stopAt = Date.now() + seconds * 1000

// node:http em vez de fetch: o fetch do Node põe "Cache-Control: no-cache" em
// pedidos condicionais e nunca recebe 304, ao contrário do navegador.
function hit(path: string, etags: Map<string, string>, agent: http.Agent) {
  const started = performance.now()
  const headers: Record<string, string> = {
    cookie: `evo_associate=${cookie}`,
    'accept-encoding': 'gzip',
  }
  const etag = etags.get(path)
  if (etag) headers['if-none-match'] = etag
  return new Promise<void>((resolve) => {
    const done = (status: number) => {
      samples.push({ path, status, ms: performance.now() - started })
      resolve()
    }
    const request = http.get(`${baseUrl}${path}`, { headers, agent }, (response) => {
      const next = response.headers.etag
      if (next) etags.set(path, next)
      response.resume()
      response.on('end', () => done(response.statusCode ?? 0))
      response.on('error', () => done(-1))
    })
    request.setTimeout(15_000, () => request.destroy(new Error('timeout')))
    request.on('error', (error: NodeJS.ErrnoException) => {
      const key = error.code ?? error.message
      errors.set(key, (errors.get(key) ?? 0) + 1)
      done(-1)
    })
  })
}

// TUNNEL=1 simula o túnel/proxy HTTPS da produção: poucas conexões
// reaproveitadas até o Node, em vez de uma por navegador.
const tunnelAgent =
  process.env.TUNNEL === '1'
    ? new http.Agent({ keepAlive: true, maxSockets: 128 })
    : null

async function associate() {
  const etags = new Map<string, string>()
  const agent = tunnelAgent ?? new http.Agent({ keepAlive: true, maxSockets: 2 })
  await new Promise((resolve) => setTimeout(resolve, Math.random() * 1000))
  let tick = 0
  while (Date.now() < stopAt) {
    const work = [hit('/api/public/portal/board', etags, agent)]
    if (tick % 3 === 0) work.push(hit('/api/public/portal', etags, agent))
    await Promise.all(work)
    tick += 1
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  if (!tunnelAgent) agent.destroy()
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}

console.log(`${clients} associados por ${seconds}s em ${baseUrl}…`)
await Promise.all(Array.from({ length: clients }, associate))

for (const path of ['/api/public/portal/board', '/api/public/portal']) {
  const list = samples.filter((sample) => sample.path === path)
  const byStatus = new Map<number, number>()
  for (const sample of list) {
    byStatus.set(sample.status, (byStatus.get(sample.status) ?? 0) + 1)
  }
  const ms = list.map((sample) => sample.ms)
  console.log(`\n${path}`)
  console.log(`  pedidos: ${list.length} (${(list.length / seconds).toFixed(0)}/s)`)
  console.log(`  status: ${[...byStatus].map(([s, n]) => `${s}=${n}`).join(' ')}`)
  console.log(
    `  tempo ms: p50=${percentile(ms, 50).toFixed(0)} p95=${percentile(ms, 95).toFixed(0)} p99=${percentile(ms, 99).toFixed(0)}`,
  )
}
if (errors.size) {
  console.log(`\nfalhas de rede: ${[...errors].map(([k, n]) => `${k}=${n}`).join(' ')}`)
}
const failures = samples.filter((sample) => sample.status !== 200 && sample.status !== 304)
process.exit(failures.length ? 1 : 0)
