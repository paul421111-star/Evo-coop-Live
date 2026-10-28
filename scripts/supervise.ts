/**
 * Mantém o servidor no ar durante o evento: se o processo cair, sobe de novo.
 * Reinícios seguidos esperam mais (até 30s) para não martelar o banco.
 */
import { spawn } from 'node:child_process'

const entry = process.argv[2] ?? 'server/index.ts'
let restarts = 0
let stopping = false
let startedAt = 0

function start() {
  startedAt = Date.now()
  const child = spawn(process.execPath, ['--import', 'tsx', entry], {
    stdio: 'inherit',
    env: process.env,
  })
  const stop = () => {
    stopping = true
    child.kill('SIGTERM')
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  child.on('exit', (code, signal) => {
    process.off('SIGINT', stop)
    process.off('SIGTERM', stop)
    if (stopping) process.exit(code ?? 0)
    if (Date.now() - startedAt > 60_000) restarts = 0
    restarts += 1
    const wait = Math.min(30_000, 1_000 * 2 ** (restarts - 1))
    console.error(
      `[supervisor] servidor parou (${signal ?? code}); religando em ${wait / 1000}s`,
    )
    setTimeout(start, wait)
  })
}

start()
