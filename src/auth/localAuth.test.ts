// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  authenticate,
  createOperator,
  getCurrentUser,
  logout,
} from './localAuth'

describe('autenticação pela API', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('autentica, restaura e encerra a sessão do administrador', async () => {
    const admin = { id: '1', username: 'Paulo', role: 'admin' as const }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(admin)))
      .mockResolvedValueOnce(new Response(JSON.stringify(admin)))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await authenticate('Paulo', 'segredo')
    expect(result?.role).toBe('admin')
    expect((await getCurrentUser())?.username).toBe('Paulo')
    await logout()
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('retorna nulo quando as credenciais são rejeitadas', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Credenciais inválidas.' }), {
          status: 401,
        }),
      ),
    )
    const admin = await authenticate('Paulo', 'incorreta')
    expect(admin).toBeNull()
  })

  it('cadastra um operador com conta individual', async () => {
    const operator = { id: '2', username: 'Maria', role: 'operator' as const }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(operator))),
    )
    const created = await createOperator('Maria', 'senha123')
    expect(created).toEqual(operator)
  })
})
