import { liveContractCode } from './liveBoard'

export type DrawBoardUnitState = 'empty' | 'available' | 'current' | 'defined'

/** O painel do associado só mostra o contrato. Nome não entra na célula. */
export function drawUnitPresentation(input: {
  exists: boolean
  unitId: string
  reservedCode: string
  currentCode: string
  focused: boolean
}): { state: DrawBoardUnitState; text: string } {
  if (!input.exists) return { state: 'empty', text: '—' }
  const reserved = liveContractCode(input.reservedCode)
  if (reserved) return { state: 'defined', text: reserved }
  if (input.focused) {
    const current = liveContractCode(input.currentCode)
    return { state: 'current', text: current || input.unitId }
  }
  return { state: 'available', text: input.unitId }
}

export function drawBoardStats(input: {
  total: number
  reserved: number
  declined: number
}) {
  const defined = Math.max(0, input.reserved)
  const declined = Math.max(0, input.declined)
  const total = Math.max(0, input.total)
  return {
    total,
    calls: defined + declined,
    available: Math.max(0, total - defined),
    defined,
    declined,
    blocked: 0,
    percent: total === 0 ? 0 : Math.round((defined / total) * 100),
  }
}

/** O título da sessão já traz grupo e bloco. Não repetir o que já está escrito. */
export function drawBoardSubtitle(input: {
  title: string
  blockLabel: string
  drawGroup: string
}) {
  const title = input.title.trim()
  const block = input.blockLabel.trim()
  const group = input.drawGroup.trim() ? `Grupo ${input.drawGroup.trim()}` : ''
  const extras = [block, group].filter(
    (part) => part && !title.toLowerCase().includes(part.toLowerCase()),
  )
  return [title || 'Sorteio', ...extras].filter(Boolean).join(' · ')
}

export function describeDrawApartment(id: string) {
  if (!/^\d{2,4}$/.test(id)) return ''
  const ending = id.slice(-1)
  const floor = Number(id.slice(0, -1))
  if (!Number.isInteger(floor)) return ''
  return `${floor}º andar · Final ${ending}`
}
