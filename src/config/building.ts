export type BuildingKind = 'odd' | 'even'
export type Ending = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
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

export type UnitPosition = {
  label: string
  shortLabel: string
  x: number
  z: number
  width: number
  depth: number
}

export type BuildingConfig = {
  kind: BuildingKind
  label: string
  description: string
  floorCount: number
  endings: Ending[]
  apartments: Apartment[]
  apartmentById: Record<string, Apartment>
  towerModel: string
  floorModel?: string
  floorBaseY: number
  floorHeight: number
  unitPositions: Record<number, UnitPosition>
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

export function apartmentId(floor: number, ending: Ending): string {
  return `${floor}${ending}`
}

export function modelApartmentId(floor: number, ending: Ending): string {
  return `${String(floor).padStart(2, '0')}0${ending}`
}

function makeApartments(floorCount: number, endings: Ending[]): Apartment[] {
  return Array.from({ length: floorCount }, (_, index) => index + 1).flatMap(
    (floor) =>
      endings.map((ending) => ({
        id: apartmentId(floor, ending),
        floor,
        ending,
      })),
  )
}

function makeConfig(
  config: Omit<BuildingConfig, 'apartments' | 'apartmentById'>,
): BuildingConfig {
  const apartments = makeApartments(config.floorCount, config.endings)
  return {
    ...config,
    apartments,
    apartmentById: Object.fromEntries(
      apartments.map((apartment) => [apartment.id, apartment]),
    ),
  }
}

const ODD_UNIT_POSITIONS: Record<number, UnitPosition> = {
  1: {
    label: 'Fundos esquerda',
    shortLabel: 'TE',
    x: -8.45,
    z: -4.71,
    width: 16.8,
    depth: 9.4,
  },
  2: {
    label: 'Fundos direita',
    shortLabel: 'TD',
    x: 8.45,
    z: -4.71,
    width: 16.8,
    depth: 9.4,
  },
  3: {
    label: 'Frente esquerda',
    shortLabel: 'FE',
    x: -8.45,
    z: 4.71,
    width: 16.8,
    depth: 9.4,
  },
  4: {
    label: 'Frente direita',
    shortLabel: 'FD',
    x: 8.45,
    z: 4.71,
    width: 16.8,
    depth: 9.4,
  },
}

const EVEN_UNIT_POSITIONS: Record<number, UnitPosition> = {
  1: { label: 'Leste fundos', shortLabel: 'LF', x: 10.92, z: -3.78, width: 14.7, depth: 7.8 },
  2: { label: 'Leste frente', shortLabel: 'LE', x: 10.92, z: 3.78, width: 14.7, depth: 7.8 },
  3: { label: 'Frente direita', shortLabel: 'FD', x: 3.78, z: 10.92, width: 7.8, depth: 14.7 },
  4: { label: 'Frente esquerda', shortLabel: 'FE', x: -3.78, z: 10.92, width: 7.8, depth: 14.7 },
  5: { label: 'Oeste frente', shortLabel: 'OF', x: -10.92, z: 3.78, width: 14.7, depth: 7.8 },
  6: { label: 'Oeste fundos', shortLabel: 'OT', x: -10.92, z: -3.78, width: 14.7, depth: 7.8 },
  7: { label: 'Fundos esquerda', shortLabel: 'TE', x: -3.78, z: -10.92, width: 7.8, depth: 14.7 },
  8: { label: 'Fundos direita', shortLabel: 'TD', x: 3.78, z: -10.92, width: 7.8, depth: 14.7 },
}

export const BUILDING_CONFIGS: Record<BuildingKind, BuildingConfig> = {
  odd: makeConfig({
    kind: 'odd',
    label: 'Grupos ímpares',
    description: '36 andares · 4 apartamentos',
    floorCount: 36,
    endings: [1, 2, 3, 4],
    towerModel: '/models/Firenze_Grupo15_Torre_Completa.glb',
    floorBaseY: 9,
    floorHeight: 3,
    unitPositions: ODD_UNIT_POSITIONS,
  }),
  even: makeConfig({
    kind: 'even',
    label: 'Grupos pares',
    description: '28 andares · 8 apartamentos',
    floorCount: 28,
    endings: [1, 2, 3, 4, 5, 6, 7, 8],
    towerModel: '/models/Grupo_12_Torre_Completa_28_Andares.glb',
    floorModel: '/models/Grupo_12_Pavimento_8_Apartamentos.glb',
    floorBaseY: 12.2,
    floorHeight: 2.9,
    unitPositions: EVEN_UNIT_POSITIONS,
  }),
}

export const ALL_APARTMENTS = Object.values(BUILDING_CONFIGS).flatMap(
  ({ kind, apartments }) =>
    apartments.map((apartment) => ({
      ...apartment,
      storageId: `${kind}:${apartment.id}`,
    })),
)

export function apartmentStorageId(
  building: BuildingKind,
  id: string,
): string {
  return `${building}:${id}`
}

// Aliases mantidos para dados e testes do primeiro prédio.
export const FLOOR_COUNT = BUILDING_CONFIGS.odd.floorCount
export const ENDINGS = BUILDING_CONFIGS.odd.endings
export const APARTMENTS = BUILDING_CONFIGS.odd.apartments
export const APARTMENT_BY_ID = BUILDING_CONFIGS.odd.apartmentById

export const ENDING_MAP = Object.fromEntries(
  Object.entries(ODD_UNIT_POSITIONS).map(([ending, position]) => [
    ending,
    {
      label: position.label,
      shortLabel: position.shortLabel,
      xSign: Math.sign(position.x),
      zSign: Math.sign(position.z),
    },
  ]),
) as Record<1 | 2 | 3 | 4, {
  label: string
  shortLabel: string
  xSign: number
  zSign: number
}>

export const LEGACY_APARTMENTS: Apartment[] = Array.from(
  { length: FLOOR_COUNT },
  (_, index) => index + 1,
).flatMap((floor) =>
  ENDINGS.map((ending) => ({
    id: apartmentId(floor, ending),
    floor,
    ending,
  })),
)

export function isApartmentStatus(value: unknown): value is ApartmentStatus {
  return STATUS_OPTIONS.some((status) => status.id === value)
}

