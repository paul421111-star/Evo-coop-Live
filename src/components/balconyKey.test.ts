import { describe, expect, it } from 'vitest'
import { BUILDING_CONFIGS } from '../config/building'
import { balconyKeyOffset } from './balconyKey'

describe('balconyKeyOffset', () => {
  it('coloca a chave na lateral externa, não no centro da janela', () => {
    const front = BUILDING_CONFIGS.even.unitPositions[1]
    const back = BUILDING_CONFIGS.even.unitPositions[2]
    const frontKey = balconyKeyOffset(front)
    const backKey = balconyKeyOffset(back)

    expect(front.z).toBeLessThan(0)
    expect(frontKey.z).toBeLessThan(-front.depth / 2)
    expect(backKey.z).toBeGreaterThan(back.depth / 2)
    expect(Math.sign(frontKey.x)).toBe(Math.sign(front.x))
    expect(Math.sign(backKey.x)).toBe(Math.sign(back.x))
  })
})