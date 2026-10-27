import { describe, expect, it, vi } from 'vitest'
import type { CallAudioRouting } from './CallAudioSetup'
import { applyCallAudioRoute } from './callAudioRouting'

const routing: CallAudioRouting = {
  headsetInputId: 'headset-mic',
  headsetOutputId: 'headset-fone',
  ucaInputId: 'uca-in',
  ucaOutputId: 'uca-out',
}

function audioMock() {
  const events: string[] = []
  return {
    events,
    audio: {
      setInputDevice: vi.fn(async (id: string) => {
        events.push(`in:${id}`)
      }),
      speakerDevices: {
        set: vi.fn(async (ids: string | string[]) => {
          events.push(`out:${Array.isArray(ids) ? ids.join('+') : ids}`)
        }),
      },
    },
  }
}

describe('roteamento da chamada ao vivo', () => {
  it('fecha a mesa antes de voltar o microfone da atendente', async () => {
    const mock = audioMock()
    await applyCallAudioRoute(mock.audio, routing, 'private')
    expect(mock.events).toEqual(['out:headset-fone', 'in:headset-mic'])
  })

  it('envia lapelas antes de abrir a voz do convidado na mesa', async () => {
    const mock = audioMock()
    await applyCallAudioRoute(mock.audio, routing, 'onAir')
    expect(mock.events).toEqual([
      'in:uca-in',
      'out:headset-fone+uca-out',
    ])
  })

  it('troca somente a entrada durante o talkback', async () => {
    const mock = audioMock()
    await applyCallAudioRoute(mock.audio, routing, 'talkback')
    expect(mock.events).toEqual(['in:headset-mic'])
  })

  it('impede colocar no ar sem a UCA222 completa', async () => {
    const mock = audioMock()
    await expect(
      applyCallAudioRoute(mock.audio, { ...routing, ucaOutputId: '' }, 'onAir'),
    ).rejects.toThrow('UCA222')
    expect(mock.events).toEqual([])
  })
})
