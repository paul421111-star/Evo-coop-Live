import { describe, expect, it } from 'vitest'
import {
  buildAssociateCode,
  drawGroupsForBuilding,
  nextDrawGroup,
  parseAssociateCode,
  validateAssociateCode,
} from './drawGroups'

describe('grupos do sorteio Firenze', () => {
  it('monta o código com grupo e bolinha em quatro posições', () => {
    expect(buildAssociateCode('12', '01')).toBe('120001')
    expect(buildAssociateCode('12', '1000')).toBe('121000')
    expect(buildAssociateCode('17', '42')).toBe('170042')
  })

  it('indica o próximo grupo da mesma torre', () => {
    expect(nextDrawGroup('even', '12')).toBe('14')
    expect(nextDrawGroup('even', '18')).toBeUndefined()
    expect(nextDrawGroup('odd', '15')).toBe('17')
  })

  it('reconhece somente os grupos da torre correspondente', () => {
    expect(drawGroupsForBuilding('even')).toEqual(['12', '14', '16', '18'])
    expect(drawGroupsForBuilding('odd')).toEqual(['13', '15', '17'])
    expect(parseAssociateCode('even', '120001')).toEqual({
      group: '12',
      ball: '0001',
    })
    expect(validateAssociateCode('even', '130001')).toBe(false)
    expect(validateAssociateCode('odd', '130001')).toBe(true)
  })

  it('rejeita bolinhas fora da faixa de quatro dígitos', () => {
    expect(buildAssociateCode('12', '0')).toBeNull()
    expect(buildAssociateCode('12', '10000')).toBeNull()
    expect(buildAssociateCode('12', 'A1')).toBeNull()
  })
})
