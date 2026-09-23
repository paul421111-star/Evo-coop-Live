import { describe, expect, it } from 'vitest'
import {
  APARTMENTS,
  BUILDING_CONFIGS,
  ENDING_MAP,
  FLOOR_COUNT,
  apartmentId,
} from './building'

describe('configuração do edifício', () => {
  it('gera 144 apartamentos únicos em 36 andares', () => {
    expect(FLOOR_COUNT).toBe(36)
    expect(APARTMENTS).toHaveLength(144)
    expect(new Set(APARTMENTS.map(({ id }) => id))).toHaveLength(144)
    expect(APARTMENTS.at(0)?.id).toBe('11')
    expect(APARTMENTS.at(-1)?.id).toBe('364')
  })

  it('gera 224 apartamentos para os grupos pares', () => {
    const even = BUILDING_CONFIGS.even
    expect(even.floorCount).toBe(28)
    expect(even.endings).toHaveLength(8)
    expect(even.apartments).toHaveLength(224)
    expect(even.apartments.at(-1)?.id).toBe('288')
  })

  it('forma identificadores de andar e final', () => {
    expect(apartmentId(36, 1)).toBe('361')
    expect(apartmentId(12, 3)).toBe('123')
    expect(apartmentId(1, 1)).toBe('11')
  })

  it('mapeia os quatro finais em quadrantes distintos', () => {
    const quadrants = Object.values(ENDING_MAP).map(
      ({ xSign, zSign }) => `${xSign}:${zSign}`,
    )
    expect(new Set(quadrants)).toHaveLength(4)
  })
})

