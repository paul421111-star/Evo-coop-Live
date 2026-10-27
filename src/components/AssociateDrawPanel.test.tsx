/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AssociateDrawPanel } from './AssociateDrawPanel'

vi.mock('../api/client', () => ({
  api: {
    portalDrawBoard: vi.fn(async () => ({
      building: 'even',
      drawGroup: '12',
      blockLabel: 'Bloco D',
      title: 'Grupo 12',
      status: 'active',
      source: 'anticipator',
      associateCode: '120112',
      focusApartment: '191',
      updatedAt: '2026-10-27T12:00:00.000Z',
      reserved: [
        {
          apartmentId: '281',
          code: '120164',
          source: 'draw',
          at: '2026-10-27T12:00:00.000Z',
        },
      ],
      declined: [],
    })),
  },
}))

afterEach(() => cleanup())

describe('AssociateDrawPanel', () => {
  it('mostra o contrato da vez e o apartamento definido, sem nome', async () => {
    render(<AssociateDrawPanel />)
    expect((await screen.findAllByText('120112')).length).toBe(2)
    expect(screen.getByText('Antecipador')).toBeTruthy()
    expect(document.querySelector('.draw-unit.is-current')?.textContent).toBe(
      '120112',
    )
    expect(document.querySelector('.draw-unit.is-defined')?.textContent).toBe(
      '120164',
    )
    expect(screen.queryByText(/Daniel/)).toBeNull()
  })
})
