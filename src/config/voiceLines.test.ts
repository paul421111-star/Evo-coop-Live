import { describe, expect, it } from 'vitest'
import { pickVoiceLine, type VoiceLineState } from './voiceLines'

const now = 1_000_000

function line(partial: Partial<VoiceLineState> & { phone: string }): VoiceLineState {
  return {
    assignedUserId: null,
    claimedBy: null,
    claimedAt: null,
    ...partial,
  }
}

describe('pickVoiceLine', () => {
  it('prefere a linha vinculada ao usuário', () => {
    const chosen = pickVoiceLine(
      [
        line({ phone: '551150284594' }),
        line({ phone: '551151963698', assignedUserId: 'ana' }),
      ],
      'ana',
      now,
    )
    expect(chosen).toBe('551151963698')
  })

  it('usa uma linha livre quando o usuário não tem número próprio', () => {
    const chosen = pickVoiceLine(
      [
        line({ phone: '551151963698', assignedUserId: 'ana' }),
        line({ phone: '551150284594' }),
      ],
      'paulo',
      now,
    )
    expect(chosen).toBe('551150284594')
  })

  it('não pega linha vinculada a outra pessoa nem linha em ligação', () => {
    const chosen = pickVoiceLine(
      [
        line({
          phone: '551151963698',
          claimedBy: 'maria',
          claimedAt: now - 10_000,
        }),
        line({ phone: '551150284594', assignedUserId: 'ana' }),
      ],
      'paulo',
      now,
    )
    expect(chosen).toBeNull()
  })

  it('libera a linha quando a ligação ficou sem sinal', () => {
    const chosen = pickVoiceLine(
      [
        line({
          phone: '551150284594',
          claimedBy: 'maria',
          claimedAt: now - 120_000,
        }),
      ],
      'paulo',
      now,
    )
    expect(chosen).toBe('551150284594')
  })
})