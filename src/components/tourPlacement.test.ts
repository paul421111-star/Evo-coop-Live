import { describe, expect, it } from 'vitest'
import { placeTourCard } from './tourPlacement'

const viewport = { width: 1280, height: 800 }

describe('placeTourCard', () => {
  it('põe o cartão abaixo quando há espaço', () => {
    const placement = placeTourCard(
      { top: 40, left: 100, right: 600, bottom: 200 },
      viewport,
      240,
    )
    expect(placement.side).toBe('below')
    expect(placement.card.top).toBe(226)
  })

  it('põe acima quando o alvo está no fim da tela', () => {
    const placement = placeTourCard(
      { top: 520, left: 100, right: 600, bottom: 760 },
      viewport,
      240,
    )
    expect(placement.side).toBe('above')
    expect(placement.card.top).toBeGreaterThanOrEqual(12)
  })

  it('alvo maior que a tela: destaque recortado e cartão dentro da tela', () => {
    const placement = placeTourCard(
      { top: -300, left: 0, right: 1280, bottom: 1900 },
      viewport,
      260,
    )
    expect(placement.side).toBe('inside')
    expect(placement.focus.top).toBe(12)
    expect(placement.focus.top + placement.focus.height).toBe(788)
    expect(placement.card.top).toBeGreaterThanOrEqual(12)
    expect(placement.card.top + 260).toBeLessThanOrEqual(800)
  })

  it('no celular o cartão não passa da largura da tela', () => {
    const placement = placeTourCard(
      { top: 100, left: 300, right: 370, bottom: 160 },
      { width: 375, height: 700 },
      240,
    )
    expect(placement.card.left + placement.card.width).toBeLessThanOrEqual(375 - 12)
  })
})
