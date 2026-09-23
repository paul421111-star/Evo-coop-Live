export const FLOOR_COUNT = 36
export const ENDINGS = [1, 2, 3, 4] as const

export type Ending = (typeof ENDINGS)[number]
export type ApartmentStatus =
  | 'none'
  | 'available'
  | 'interest'
  | 'reserved'
  | 'sold'
  | 'blocked'

export type Apartment = {
  id: string
  floor: number
  ending: Ending
}

export type Quadrant = {
  label: string
  shortLabel: string
  xSign: -1 | 1
  zSign: -1 | 1
}

export const STATUS_OPTIONS: ReadonlyArray<{
  id: ApartmentStatus
  label: string
  shortLabel: string
  color: string
}> = [
  { id: 'none', label: 'Sem marcação', shortLabel: 'Livre', color: '#64748b' },
  { id: 'available', label: 'Disponível', shortLabel: 'Disp.', color: '#22c55e' },
  { id: 'interest', label: 'Em interesse', shortLabel: 'Interesse', color: '#38bdf8' },
  { id: 'reserved', label: 'Reservado', shortLabel: 'Reserva', color: '#f59e0b' },
  { id: 'sold', label: 'Vendido', shortLabel: 'Vendido', color: '#f43f5e' },
  { id: 'blocked', label: 'Bloqueado', shortLabel: 'Bloq.', color: '#a78bfa' },
]

export const STATUS_BY_ID = Object.fromEntries(
  STATUS_OPTIONS.map((status) => [status.id, status]),
) as Record<ApartmentStatus, (typeof STATUS_OPTIONS)[number]>

// A orientação fica centralizada aqui para ser ajustada quando a planta oficial
// confirmar a numeração dos quadrantes.
export const ENDING_MAP: Record<Ending, Quadrant> = {
  1: { label: 'Frente esquerda', shortLabel: 'FE', xSign: -1, zSign: 1 },
  2: { label: 'Frente direita', shortLabel: 'FD', xSign: 1, zSign: 1 },
  3: { label: 'Fundos direita', shortLabel: 'TD', xSign: 1, zSign: -1 },
  4: { label: 'Fundos esquerda', shortLabel: 'TE', xSign: -1, zSign: -1 },
}

export function apartmentId(floor: number, ending: Ending): string {
  return `${String(floor).padStart(2, '0')}0${ending}`
}

export const APARTMENTS: Apartment[] = Array.from(
  { length: FLOOR_COUNT },
  (_, index) => index + 1,
).flatMap((floor) =>
  ENDINGS.map((ending) => ({
    id: apartmentId(floor, ending),
    floor,
    ending,
  })),
)

export const APARTMENT_BY_ID = Object.fromEntries(
  APARTMENTS.map((apartment) => [apartment.id, apartment]),
) as Record<string, Apartment>

export function isApartmentStatus(value: unknown): value is ApartmentStatus {
  return STATUS_OPTIONS.some((status) => status.id === value)
}

