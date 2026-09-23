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
    expect(BUILDING_CONFIGS.odd.floorModel).toContain('Pavimento_Tipo')
  })

  it('gera 224 apartamentos para Firenze pares', () => {
    const even = BUILDING_CONFIGS.even
    expect(even.floorCount).toBe(28)
    expect(even.endings).toHaveLength(8)
    expect(even.apartments).toHaveLength(224)
    expect(even.apartments.at(-1)?.id).toBe('288')
  })

  it('gera 108 apartamentos para o Jardim das Artes', () => {
    const jardim = BUILDING_CONFIGS['jardim-artes']
    expect(jardim.floorCount).toBe(27)
    expect(jardim.endings).toHaveLength(4)
    expect(jardim.apartments).toHaveLength(108)
    expect(jardim.apartments.at(-1)?.id).toBe('274')
    expect(jardim.floorModel).toContain('Grupo_11_Pavimento')
  })

  it('gera térreo com 7 e 28 pavimentos com 8 no Cond. Iracema', () => {
    const iracema = BUILDING_CONFIGS['cond-iracema']
    expect(iracema.apartments).toHaveLength(231)
    expect(iracema.apartmentById['01']).toBeDefined()
    expect(iracema.apartmentById['07']).toBeDefined()
    expect(iracema.apartmentById['08']).toBeUndefined()
    expect(iracema.apartmentById['288']).toBeDefined()
    expect(iracema.groundFloorModel).toContain('Terreo_7_Apartamentos')
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

  it('posiciona os finais ímpares em sentido horário na planta', () => {
    const positions = BUILDING_CONFIGS.odd.unitPositions
    expect(positions[1].x).toBeLessThan(0)
    expect(positions[1].z).toBeLessThan(0)
    expect(positions[2].x).toBeGreaterThan(0)
    expect(positions[2].z).toBeLessThan(0)
    expect(positions[3].x).toBeGreaterThan(0)
    expect(positions[3].z).toBeGreaterThan(0)
    expect(positions[4].x).toBeLessThan(0)
    expect(positions[4].z).toBeGreaterThan(0)
  })
})

