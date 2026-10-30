/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CobrancaCalls } from './CobrancaCalls'

vi.mock('./CallAudioSetup', () => ({
  CallAudioSetup: () => null,
  loadCallAudioRouting: () => ({
    headsetInputId: '',
    headsetOutputId: '',
    ucaInputId: '',
    ucaOutputId: '',
  }),
}))

vi.mock('./TwilioCallButton', () => ({
  TwilioCallButton: ({ canGoLive }: { canGoLive?: boolean }) => (
    <button type="button">
      {canGoLive ? 'Pode ir ao ar' : 'Confira antes de ir ao ar'}
    </button>
  ),
}))

vi.mock('../api/client', () => ({
  api: {
    cobrancaCallPhones: vi.fn(async () => []),
    cobrancaVoiceStatus: vi.fn(async () => ({
      configured: true,
      hint: '',
      recordCalls: true,
    })),
    cobrancaVoiceLines: vi.fn(async () => ({
      lines: [
        {
          phone: '551150284594',
          assignedUserId: null,
          assignedUsername: '',
          inUse: false,
          claimedUsername: '',
        },
      ],
      staff: [{ id: 'ana', username: 'Ana' }],
    })),
    cobrancaCallRequests: vi.fn(async () => []),
    cobrancaCallContacts: vi.fn(async () => [
      {
        id: '1',
        associateCode: '120015',
        participant: 'Maria Souza',
        phone: '5511945922087',
        documentTail: '12345',
        documentNumber: '',
        birthDate: '1984-03-02',
        checked: false,
      },
    ]),
    cobrancaCallRecordings: vi.fn(async () => []),
  },
}))

afterEach(() => cleanup())

describe('CobrancaCalls', () => {
  it('mostra os dados da conferência e exige Conferido para ir ao ar', async () => {
    render(<CobrancaCalls building="even" group="12" />)
    expect(await screen.findByText('Contrato 120015')).toBeTruthy()
    expect(screen.getByText('Maria Souza')).toBeTruthy()
    expect(screen.getByText('finais 12345')).toBeTruthy()
    expect(screen.getByText('02/03/1984')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Conferido' })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Confira antes de ir ao ar' }),
    ).toBeTruthy()
    expect(screen.getByText('(11) 5028-4594')).toBeTruthy()
  })
})