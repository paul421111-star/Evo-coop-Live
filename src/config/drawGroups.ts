import type { BuildingKind } from './building'

export type DrawGroup = '12' | '13' | '14' | '15' | '16' | '17' | '18'

export const DRAW_GROUPS_BY_BUILDING: Record<BuildingKind, DrawGroup[]> = {
  odd: ['13', '15', '17'],
  even: ['12', '14', '16', '18'],
  'jardim-artes': [],
  'cond-iracema': [],
}

export function drawGroupsForBuilding(building: BuildingKind): DrawGroup[] {
  return DRAW_GROUPS_BY_BUILDING[building]
}

export function isDrawGroup(
  building: BuildingKind,
  value: unknown,
): value is DrawGroup {
  return DRAW_GROUPS_BY_BUILDING[building].includes(value as DrawGroup)
}

export function nextDrawGroup(
  building: BuildingKind,
  current: DrawGroup,
): DrawGroup | undefined {
  const groups = DRAW_GROUPS_BY_BUILDING[building]
  const index = groups.indexOf(current)
  return index >= 0 ? groups[index + 1] : undefined
}

export function buildAssociateCode(
  group: DrawGroup,
  ball: string,
): string | null {
  if (!/^\d{1,4}$/.test(ball.trim())) return null
  const value = Number(ball)
  if (value < 1 || value > 9999) return null
  return `${group}${String(value).padStart(4, '0')}`
}

export function parseAssociateCode(
  building: BuildingKind,
  code: string,
): { group: DrawGroup; ball: string } | null {
  if (!/^\d{6}$/.test(code)) return null
  const group = code.slice(0, 2) as DrawGroup
  if (!DRAW_GROUPS_BY_BUILDING[building].includes(group)) return null
  return { group, ball: code.slice(2) }
}

export function validateAssociateCode(
  building: BuildingKind,
  code: string,
): boolean {
  const groups = DRAW_GROUPS_BY_BUILDING[building]
  return groups.length === 0 || parseAssociateCode(building, code) !== null
}
