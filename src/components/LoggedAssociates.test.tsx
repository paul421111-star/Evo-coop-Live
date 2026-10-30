/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoggedAssociates } from './LoggedAssociates'

vi.mock('../api/client', () => ({
  api: {
    loggedAssociates: vi.fn(async () => [
      {
        associateCode: '120112',
        participant: 'Ana Lima',
        since: '2026-10-30T12:08:00.000Z',
      },
    ]),
  },
}))

afterEach(() => cleanup())

describe('LoggedAssociates', () => {
  it('mostra o contrato e o horário de quem está logado', async () => {
    render(<LoggedAssociates building="even" drawGroup="12" />)
    const button = await screen.findByRole('button', { name: /Logados/ })
    expect(button.textContent).toContain('1')
    fireEvent.click(button)
    expect(screen.getByText('120112')).toBeTruthy()
    expect(screen.getByText('Ana Lima')).toBeTruthy()
    expect(screen.getByText(/Entrou às/)).toBeTruthy()
  })
})
