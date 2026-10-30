import { describe, expect, it } from 'vitest'
import {
  isOfferDecisionOpen,
  offerDecisionUntil,
  choiceSourceAfterTurn,
  delinquentGate,
  turnCallLabel,
  callPositions,
  oppositeChoiceSource,
  rankAnticipators,
} from './anticipation'

describe('inadimplente no sorteio', () => {
  it('só acessa o portal quando o administrador permite a entrada', () => {
    expect(delinquentGate(true, true, false)).toBe('watch')
    expect(delinquentGate(true, false, false)).toBe('blocked')
  })

  it('participa quando o administrador libera, ou quando não está inadimplente', () => {
    expect(delinquentGate(true, false, true)).toBe('participate')
    expect(delinquentGate(false, false, false)).toBe('participate')
  })
})

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

  it('numera a chamada atual de antecipador e de sorteio', () => {
    expect(
      turnCallLabel({
        source: 'anticipator',
        anticipatorTurnsUsed: 0,
        drawReservations: 0,
        awaitingNext: false,
      }),
    ).toBe('1º antecipador')
    expect(
      turnCallLabel({
        source: 'draw',
        anticipatorTurnsUsed: 1,
        drawReservations: 0,
        awaitingNext: false,
      }),
    ).toBe('1º sorteado')
    expect(
      turnCallLabel({
        source: 'draw',
        anticipatorTurnsUsed: 1,
        drawReservations: 1,
        awaitingNext: true,
      }),
    ).toBe('1º sorteado')
    expect(
      turnCallLabel({
        source: 'anticipator',
        anticipatorTurnsUsed: 1,
        drawReservations: 1,
        awaitingNext: false,
      }),
    ).toBe('2º antecipador')
    expect(
      turnCallLabel({
        source: 'draw',
        anticipatorTurnsUsed: 112,
        drawReservations: 112,
        awaitingNext: false,
      }),
    ).toBe('113º sorteado')
  })

  it('quem abdica fora da vez sai da numeração e o suplente sobe', () => {
    const positions = callPositions([
      { id: 'a', status: 'waiting' },
      { id: 'b', status: 'abdicated' },
      { id: 'c', status: 'waiting' },
      { id: 'd', status: 'declined' },
      { id: 'e', status: 'waiting' },
    ])
    expect(positions.has('b')).toBe(false)
    expect(positions.get('a')).toBe(1)
    expect(positions.get('c')).toBe(2)
    expect(positions.get('d')).toBe(3)
    expect(positions.get('e')).toBe(4)
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
