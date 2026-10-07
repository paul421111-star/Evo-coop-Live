import { describe, expect, it } from 'vitest'
import {
  isOfferDecisionOpen,
  offerDecisionUntil,
  choiceSourceAfterTurn,
  oppositeChoiceSource,
  rankAnticipators,
} from './anticipation'

describe('ranking dos antecipadores', () => {
  it('ordena pelo total de parcelas em ordem decrescente', () => {
    const [first] = rankAnticipators([
      {
        associateCode: '120010',
        participant: '',
        paidInstallments: 80,
        anticipatedInstallments: 10,
        offeredInstallments: 20,
      },
      {
        associateCode: '120020',
        participant: '',
        paidInstallments: 105,
        anticipatedInstallments: 0,
        offeredInstallments: 30,
      },
    ])
    expect(first.associateCode).toBe('120020')
    expect(first.totalInstallments).toBe(135)
  })

  it('desempata pelo menor número de contrato', () => {
    const ranked = rankAnticipators([
      {
        associateCode: '120023',
        participant: '',
        paidInstallments: 105,
        anticipatedInstallments: 0,
        offeredInstallments: 30,
      },
      {
        associateCode: '120009',
        participant: '',
        paidInstallments: 105,
        anticipatedInstallments: 10,
        offeredInstallments: 20,
      },
    ])
    expect(ranked.map((entry) => entry.associateCode)).toEqual([
      '120009',
      '120023',
    ])
  })

  it('alterna antecipador e sorteio', () => {
    expect(oppositeChoiceSource('anticipator')).toBe('draw')
    expect(oppositeChoiceSource('draw')).toBe('anticipator')
  })

  it('depois das vagas, contando abdicação, fica só no sorteio', () => {
    expect(choiceSourceAfterTurn('anticipator', 111, 112)).toBe('draw')
    expect(choiceSourceAfterTurn('draw', 111, 112)).toBe('anticipator')
    expect(choiceSourceAfterTurn('draw', 112, 112)).toBe('draw')
    expect(choiceSourceAfterTurn('anticipator', 112, 112, true)).toBe('draw')
    expect(choiceSourceAfterTurn('anticipator', 40, 112, true)).toBe(
      'anticipator',
    )
  })

  it('recua no ranking ao recusar as parcelas antecipadas', () => {
    const ranked = rankAnticipators([
      {
        associateCode: '120009',
        participant: '',
        paidInstallments: 105,
        anticipatedInstallments: 0,
        offeredInstallments: 0,
      },
      {
        associateCode: '120023',
        participant: '',
        paidInstallments: 105,
        anticipatedInstallments: 0,
        offeredInstallments: 30,
      },
    ])
    expect(ranked[0].associateCode).toBe('120023')
  })

  it('abre 24 horas para manter ou recusar a antecipação', () => {
    const selectedAt = '2026-09-25T12:00:00.000Z'
    expect(offerDecisionUntil(selectedAt)).toBe('2026-09-26T12:00:00.000Z')
    expect(
      isOfferDecisionOpen(selectedAt, Date.parse('2026-09-25T18:00:00.000Z')),
    ).toBe(true)
    expect(
      isOfferDecisionOpen(selectedAt, Date.parse('2026-09-26T12:00:01.000Z')),
    ).toBe(false)
  })

  it('usa o prazo definido pelo admin quando existir', () => {
    const selectedAt = '2026-09-25T12:00:00.000Z'
    const deadline = '2026-10-06T20:19:00.000Z'
    expect(offerDecisionUntil(selectedAt, deadline)).toBe(deadline)
    expect(
      isOfferDecisionOpen(
        selectedAt,
        Date.parse('2026-10-06T20:18:00.000Z'),
        deadline,
      ),
    ).toBe(true)
    expect(
      isOfferDecisionOpen(
        selectedAt,
        Date.parse('2026-10-06T20:19:01.000Z'),
        deadline,
      ),
    ).toBe(false)
  })
})
