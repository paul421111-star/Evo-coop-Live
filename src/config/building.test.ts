import { describe, expect, it } from 'vitest'
import {
  APARTMENTS,
  ENDING_MAP,
  FLOOR_COUNT,
  apartmentId,
} from './building'

describe('configuração do edifício', () => {
  it('gera 144 apartamentos únicos em 36 andares', () => {
    expect(FLOOR_COUNT).toBe(36)
    expect(APARTMENTS).toHaveLength(144)
    expect(new Set(APARTMENTS.map(({ id }) => id))).toHaveLength(144)
    expect(APARTMENTS.at(0)?.id).toBe('0101')
    expect(APARTMENTS.at(-1)?.id).toBe('3604')
  })

  it('forma identificadores de andar e final', () => {
    expect(apartmentId(12, 3)).toBe('1203')
    expect(apartmentId(1, 1)).toBe('0101')
  })

  it('mapeia os quatro finais em quadrantes distintos', () => {
    const quadrants = Object.values(ENDING_MAP).map(
      ({ xSign, zSign }) => `${xSign}:${zSign}`,
    )
    expect(new Set(quadrants)).toHaveLength(4)
  })
})

