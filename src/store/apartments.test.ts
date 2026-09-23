// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  EMPTY_STATUSES,
  normalizeAssignments,
  normalizeStatuses,
  useApartmentStore,
} from './apartments'

describe('estado dos apartamentos', () => {
  beforeEach(() => {
    localStorage.clear()
    useApartmentStore.setState({
      statuses: { ...EMPTY_STATUSES },
      assignments: {},
      auditLog: [],
      history: [],
    })
  })

  it('altera várias unidades em uma única operação e desfaz', () => {
    const ids = ['odd:121', 'odd:122', 'odd:123', 'odd:124']
    useApartmentStore.getState().setStatus(ids, 'reserved')

    ids.forEach((id) => {
      expect(useApartmentStore.getState().statuses[id]).toBe('reserved')
    })

    useApartmentStore.getState().undo()
    ids.forEach((id) => {
      expect(useApartmentStore.getState().statuses[id]).toBe('none')
    })
  })

  it('normaliza dados parciais para os dois tipos de prédio', () => {
    const restored = normalizeStatuses({
      'odd:11': 'sold',
      'even:288': 'available',
    })
    expect(restored).not.toBeNull()
    expect(Object.keys(restored ?? {})).toHaveLength(368)
    expect(restored?.['odd:11']).toBe('sold')
    expect(restored?.['even:288']).toBe('available')
    expect(restored?.['even:22']).toBe('none')
  })

  it('migra a numeração antiga salva no navegador', () => {
    const restored = normalizeStatuses({ '0101': 'sold', '3604': 'reserved' })
    expect(restored?.['odd:11']).toBe('sold')
    expect(restored?.['odd:364']).toBe('reserved')
  })

  it('rejeita ids e situações desconhecidos', () => {
    expect(normalizeStatuses({ '9999': 'sold' })).toBeNull()
    expect(normalizeStatuses({ '11': 'unknown' })).toBeNull()
  })

  it('registra a bolinha no apartamento e desfaz a operação completa', () => {
    useApartmentStore.getState().assignApartment('even:288', 'sold', {
      ball: '127',
      participant: 'Maria',
      assignedAt: '2026-09-23T12:00:00.000Z',
    })

    expect(useApartmentStore.getState().statuses['even:288']).toBe('sold')
    expect(useApartmentStore.getState().assignments['even:288']?.ball).toBe(
      '127',
    )

    useApartmentStore.getState().undo()
    expect(useApartmentStore.getState().statuses['even:288']).toBe('none')
    expect(useApartmentStore.getState().assignments['even:288']).toBeUndefined()
  })

  it('valida os dados de sorteio importados', () => {
    expect(
      normalizeAssignments({
        'odd:361': {
          ball: '42',
          participant: 'João',
          assignedAt: '2026-09-23T12:00:00.000Z',
        },
      })?.['odd:361'].participant,
    ).toBe('João')
    expect(normalizeAssignments({ 'odd:361': { ball: 42 } })).toBeNull()
  })

  it('audita inclusão, alteração justificada e remoção', () => {
    const store = useApartmentStore.getState()
    store.saveReservation(
      'odd:361',
      { ball: '15', participant: 'Ana' },
      'Paulo',
    )
    expect(useApartmentStore.getState().statuses['odd:361']).toBe('reserved')
    expect(useApartmentStore.getState().auditLog[0]).toMatchObject({
      action: 'created',
      actor: 'Paulo',
    })

    useApartmentStore
      .getState()
      .saveReservation(
        'odd:361',
        { ball: '16', participant: 'Ana' },
        'Operador',
        'Correção da bolinha',
      )
    expect(
      useApartmentStore.getState().assignments['odd:361'].lastJustification,
    ).toBe('Correção da bolinha')

    useApartmentStore
      .getState()
      .removeReservation('odd:361', 'Paulo', 'Solicitação do sorteado')
    expect(useApartmentStore.getState().statuses['odd:361']).toBe('none')
    expect(useApartmentStore.getState().auditLog.at(-1)).toMatchObject({
      action: 'removed',
      reason: 'Solicitação do sorteado',
    })
  })
})

