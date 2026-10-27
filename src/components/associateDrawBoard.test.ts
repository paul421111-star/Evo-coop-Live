import { describe, expect, it } from 'vitest'
import {
  describeDrawApartment,
  drawBoardStats,
  drawBoardSubtitle,
  drawUnitPresentation,
} from './associateDrawBoard'

describe('painel do associado', () => {
  it('mostra o contrato na unidade definida e nunca um nome', () => {
    expect(
      drawUnitPresentation({
        exists: true,
        unitId: '191',
        reservedCode: '120164',
        currentCode: '120200',
        focused: true,
      }),
    ).toEqual({ state: 'defined', text: '120164' })
    expect(
      drawUnitPresentation({
        exists: true,
        unitId: '192',
        reservedCode: '120164 · Daniel',
        currentCode: '120200',
        focused: false,
      }).text,
    ).toBe('192')
  })

  it('destaca a unidade que o operador está escolhendo', () => {
    expect(
      drawUnitPresentation({
        exists: true,
        unitId: '191',
        reservedCode: '',
        currentCode: '120112',
        focused: true,
      }),
    ).toEqual({ state: 'current', text: '120112' })
  })

  it('resume a escolha sem contar unidade vazia como definida', () => {
    expect(
      drawBoardStats({ total: 224, reserved: 105, declined: 7 }),
    ).toMatchObject({
      calls: 112,
      available: 119,
      defined: 105,
      declined: 7,
      blocked: 0,
      percent: 47,
    })
    expect(describeDrawApartment('191')).toBe('19º andar · Final 1')
  })

  it('não repete grupo e bloco que já estão no título', () => {
    expect(
      drawBoardSubtitle({
        title: 'Antecipação · Firenze pares · Grupo 12 · Bloco D',
        blockLabel: 'Bloco D',
        drawGroup: '12',
      }),
    ).toBe('Antecipação · Firenze pares · Grupo 12 · Bloco D')
  })
})
