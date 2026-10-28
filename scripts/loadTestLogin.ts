/**
 * Simula N associados entrando no portal no mesmo instante: cada um pede o
 * desafio, responde e envia contrato + CPF. Usa contratos inexistentes (o
 * banco é consultado de verdade, mas nenhuma sessão é criada) e IPs distintos
 * pelo cabeçalho X-Forwarded-For, como chegariam pelo túnel.
 *
 * Uso: $env:CLIENTS = '1000'; npx tsx scripts/loadTestLogin.ts
 */
import http from 'node:http'

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:3015'
const clients = Number(process.env.CLIENTS ?? 1000)

function request(
  method: string,
  path: string,
  ip: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const payload = body ? JSON.stringify(body) : undefined
  return new Promise((resolve) => {
    const req = http.request(
      `${baseUrl}${path}`,
      {
        method,
        headers: {
          'x-forwarded-for': ip,
          ...(payload
            ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
            : {}),
        },
      },
      (response) => {
        let text = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => (text += chunk))
        response.on('end', () => {
          let json: Record<string, unknown>
          try {
            json = JSON.parse(text)
          } catch {
            json = {}
          }
          resolve({ status: response.statusCode ?? 0, json })
        })
      },
    )
    req.setTimeout(30_000, () => req.destroy(new Error('timeout')))
    req.on('error', () => resolve({ status: -1, json: {} }))
    if (payload) req.write(payload)
    req.end()
  })
}

const results: { status: number; ms: number }[] = []

async function login(index: number) {
  const ip = `10.${(index >> 16) & 255}.${(index >> 8) & 255}.${index & 255}`
  const started = performance.now()
  const challenge = await request('GET', '/api/public/portal/challenge', ip)
  const match = /(\d+)\s*\+\s*(\d+)/.exec(String(challenge.json.question ?? ''))
  if (challenge.status !== 200 || !match) {
    results.push({ status: challenge.status, ms: performance.now() - started })
    return
  }
  const access = await request('POST', '/api/public/portal/access', ip, {
    associateCode: String(990000 + (index % 9999)).padStart(6, '0'),
    documentTail: '00000',
    challengeId: challenge.json.id,
    answer: Number(match[1]) + Number(match[2]),
  })
  results.push({ status: access.status, ms: performance.now() - started })
}

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0
}

console.log(`${clients} logins simultâneos em ${baseUrl}…`)
const started = performance.now()
await Promise.all(Array.from({ length: clients }, (_, index) => login(index)))
const total = performance.now() - started
const byStatus = new Map<number, number>()
for (const result of results) byStatus.set(result.status, (byStatus.get(result.status) ?? 0) + 1)
const ms = results.map((result) => result.ms)
console.log(`  concluídos em ${(total / 1000).toFixed(1)}s`)
console.log(`  status: ${[...byStatus].map(([s, n]) => `${s}=${n}`).join(' ')} (401 = contrato inexistente, esperado)`)
console.log(`  tempo ms: p50=${percentile(ms, 50).toFixed(0)} p95=${percentile(ms, 95).toFixed(0)} p99=${percentile(ms, 99).toFixed(0)}`)
process.exit(results.every((result) => result.status === 401) ? 0 : 1)
