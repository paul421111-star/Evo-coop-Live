import { describe, expect, it, vi } from 'vitest'
import { createSharedCache } from './sharedCache'

describe('createSharedCache', () => {
  it('serve mil pedidos simultâneos com uma única consulta', async () => {
    const cache = createSharedCache<number>(1000)
    const load = vi.fn(async () => 42)
    const results = await Promise.all(
      Array.from({ length: 1000 }, () => cache.get('board', load)),
    )
    expect(load).toHaveBeenCalledTimes(1)
    expect(results.every((value) => value === 42)).toBe(true)
  })

  it('consulta de novo depois da validade', async () => {
    vi.useFakeTimers()
    try {
      const cache = createSharedCache<number>(1000)
      const load = vi.fn(async () => 1)
      await cache.get('board', load)
      vi.advanceTimersByTime(1001)
      await cache.get('board', load)
      expect(load).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('não grava resultado antigo depois de invalidar', async () => {
    const cache = createSharedCache<string>(60_000)
    let release: (value: string) => void = () => undefined
    const slow = cache.get(
      'board',
      () => new Promise<string>((resolve) => (release = resolve)),
    )
    cache.delete('board')
    release('antigo')
    await slow
    const fresh = await cache.get('board', async () => 'novo')
    expect(fresh).toBe('novo')
  })

  it('não guarda falhas', async () => {
    const cache = createSharedCache<number>(60_000)
    await expect(
      cache.get('board', async () => {
        throw new Error('banco fora')
      }),
    ).rejects.toThrow('banco fora')
    expect(await cache.get('board', async () => 7)).toBe(7)
  })
})
