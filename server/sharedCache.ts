/**
 * Cache em memória com validade curta e uma única consulta em andamento por
 * chave: mil associados pedindo o mesmo painel no mesmo segundo geram uma
 * só ida ao banco. Uma consulta iniciada antes de `delete`/`clear` não grava
 * o resultado antigo de volta.
 */
export function createSharedCache<T>(ttlMs: number) {
  const entries = new Map<string, { value: T; expiresAt: number }>()
  const pending = new Map<string, Promise<T>>()
  let generation = 0

  return {
    async get(key: string, load: () => Promise<T>) {
      const cached = entries.get(key)
      if (cached && cached.expiresAt > Date.now()) return cached.value
      const running = pending.get(key)
      if (running) return running
      const startedAt = generation
      const promise = load()
        .then((value) => {
          if (startedAt === generation) {
            entries.set(key, { value, expiresAt: Date.now() + ttlMs })
          }
          return value
        })
        .finally(() => {
          if (pending.get(key) === promise) pending.delete(key)
        })
      pending.set(key, promise)
      return promise
    },
    set(key: string, value: T, expiresAt = Date.now() + ttlMs) {
      entries.set(key, { value, expiresAt })
    },
    delete(key: string) {
      generation += 1
      entries.delete(key)
      pending.delete(key)
    },
    clear() {
      generation += 1
      entries.clear()
      pending.clear()
    },
    purgeExpired() {
      const now = Date.now()
      for (const [key, cached] of entries) {
        if (cached.expiresAt <= now) entries.delete(key)
      }
    },
  }
}
