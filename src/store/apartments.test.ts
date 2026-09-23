// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  EMPTY_STATUSES,
  normalizeStatuses,
  useApartmentStore,
} from './apartments'

describe('estado dos apartamentos', () => {
  beforeEach(() => {
    localStorage.clear()
    useApartmentStore.setState({
      statuses: { ...EMPTY_STATUSES },
      history: [],
    })
  })

  it('altera várias unidades em uma única operação e desfaz', () => {
    const ids = ['1201', '1202', '1203', '1204']
    useApartmentStore.getState().setStatus(ids, 'reserved')

    ids.forEach((id) => {
      expect(useApartmentStore.getState().statuses[id]).toBe('reserved')
    })

    useApartmentStore.getState().undo()
    ids.forEach((id) => {
      expect(useApartmentStore.getState().statuses[id]).toBe('none')
    })
  })

  it('normaliza dados parciais válidos para os 144 apartamentos', () => {
    const restored = normalizeStatuses({ '0101': 'sold', '3604': 'available' })
    expect(restored).not.toBeNull()
    expect(Object.keys(restored ?? {})).toHaveLength(144)
    expect(restored?.['0101']).toBe('sold')
    expect(restored?.['0202']).toBe('none')
  })

  it('rejeita ids e situações desconhecidos', () => {
    expect(normalizeStatuses({ '9999': 'sold' })).toBeNull()
    expect(normalizeStatuses({ '0101': 'unknown' })).toBeNull()
  })
})

