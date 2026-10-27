import { describe, expect, it } from 'vitest'
import { liveContractCode } from './liveBoard'

describe('liveContractCode', () => {
  it('mostra somente o número do contrato', () => {
    expect(liveContractCode('120164')).toBe('120164')
    expect(liveContractCode(' Daniel ')).toBe('')
    expect(liveContractCode('120164 · Daniel Pereira Nascimento')).toBe('')
    expect(liveContractCode('')).toBe('')
  })
})
