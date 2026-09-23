import { describe, expect, it } from 'vitest'
import {
  DECLINE_REASON_BY_ID,
  isDrawDeclineReason,
} from './drawDeclines'

describe('registros de quem não aceitou', () => {
  it('reconhece os três motivos do sorteio', () => {
    expect(isDrawDeclineReason('refused')).toBe(true)
    expect(isDrawDeclineReason('next-tower')).toBe(true)
    expect(isDrawDeclineReason('no-answer')).toBe(true)
    expect(isDrawDeclineReason('other')).toBe(false)
    expect(DECLINE_REASON_BY_ID['no-answer']).toBe('Não atendeu')
  })
})
