import type { BuildingKind, Ending } from './building'

export type SurroundingIcon =
  | 'tree'
  | 'forest'
  | 'building'
  | 'sunrise'
  | 'sunset'
  | 'park'
  | 'road'
  | 'water'
  | 'storage'
  | 'service-room'
  | 'gate'

export type EdgeLandmark =
  | 'sao-judas'
  | 'br-116'
  | 'main-gate'
  | 'bloco-b'
  | 'bloco-c'
  | 'blocos-gf'
  | 'sunrise'
  | 'sunset'

export type EdgeSide =
  | 'north'
  | 'northeast'
  | 'east'
  | 'south'
  | 'southwest'
  | 'west'

export type EdgeLandmarksConfig = Record<
  BuildingKind,
  Partial<Record<Ending, EdgeLandmark[]>>
>

export type SurroundingItem = {
  id: string
  label: string
  icon: SurroundingIcon
}

export type SurroundingsConfig = Record<
  BuildingKind,
  Partial<Record<Ending, SurroundingItem[]>>
>

export type SolarIllustration = 'sunrise' | 'sunset' | 'future-green'

export type SolarIllustrationsConfig = Record<
  BuildingKind,
  Partial<Record<Ending, SolarIllustration[]>>
>

export const SOLAR_ILLUSTRATION_OPTIONS: Array<{
  id: SolarIllustration
  label: string
  image: string
  icon: SurroundingIcon
}> = [
  {
    id: 'sunrise',
    label: 'Sol nascente',
    image: '/images/sol-nascente-realista.png',
    icon: 'sunrise',
  },
  {
    id: 'sunset',
    label: 'Sol poente',
    image: '/images/sol-poente-realista.png',
    icon: 'sunset',
  },
  {
    id: 'future-green',
    label: 'Futura área verde',
    image: '/images/futura-area-verde-realista.png',
    icon: 'park',
  },
]

export const SOLAR_ILLUSTRATION_BY_ID = Object.fromEntries(
  SOLAR_ILLUSTRATION_OPTIONS.map((option) => [option.id, option]),
) as Record<SolarIllustration, (typeof SOLAR_ILLUSTRATION_OPTIONS)[number]>

export const EDGE_LANDMARK_OPTIONS: Array<{
  id: EdgeLandmark
  label: string
  detail: string
  icon: SurroundingIcon
  side: EdgeSide
}> = [
  {
    id: 'sao-judas',
    label: 'Estrada São Judas',
    detail: 'Norte',
    icon: 'road',
    side: 'north',
  },
  {
    id: 'br-116',
    label: 'BR-116',
    detail: 'Rodovia Régis Bittencourt',
    icon: 'road',
    side: 'west',
  },
  {
    id: 'main-gate',
    label: 'Portaria principal',
    detail: 'Rua interna do condomínio',
    icon: 'gate',
    side: 'east',
  },
  {
    id: 'bloco-b',
    label: 'Bloco B',
    detail: 'Sul',
    icon: 'building',
    side: 'south',
  },
  {
    id: 'bloco-c',
    label: 'Bloco C',
    detail: 'Sul',
    icon: 'building',
    side: 'south',
  },
  {
    id: 'blocos-gf',
    label: 'Blocos G e F',
    detail: 'Oeste',
    icon: 'building',
    side: 'west',
  },
  {
    id: 'sunrise',
    label: 'Nascer do sol',
    detail: 'Nascente',
    icon: 'sunrise',
    side: 'northeast',
  },
  {
    id: 'sunset',
    label: 'Pôr do sol',
    detail: 'Poente',
    icon: 'sunset',
    side: 'southwest',
  },
]

export const EDGE_LANDMARK_IDS = EDGE_LANDMARK_OPTIONS.map(
  (option) => option.id,
) as EdgeLandmark[]

export const EDGE_LANDMARK_BY_ID = Object.fromEntries(
  EDGE_LANDMARK_OPTIONS.map((option) => [option.id, option]),
) as Record<EdgeLandmark, (typeof EDGE_LANDMARK_OPTIONS)[number]>

export const DEFAULT_EDGE_LANDMARKS: EdgeLandmarksConfig = {
  odd: {
    1: ['blocos-gf', 'sunset'],
    2: ['blocos-gf', 'bloco-c', 'sunset'],
    3: ['bloco-c', 'sunrise'],
    4: ['sunrise'],
  },
  even: {
    1: ['br-116', 'sunset'],
    2: ['br-116'],
    3: ['sao-judas'],
    4: ['sao-judas', 'sunrise'],
    5: ['main-gate', 'sunrise'],
    6: ['main-gate'],
    7: ['bloco-b'],
    8: ['bloco-b', 'sunset'],
  },
  'jardim-artes': {},
  'cond-iracema': {},
}

export function edgeLandmarksForBuilding(
  config: EdgeLandmarksConfig,
  building: BuildingKind,
): EdgeLandmark[] {
  const selected = new Set<EdgeLandmark>()
  for (const landmarks of Object.values(config[building] ?? {})) {
    for (const landmark of landmarks ?? []) selected.add(landmark)
  }
  return EDGE_LANDMARK_IDS.filter((id) => selected.has(id))
}

export const DEFAULT_SOLAR_ILLUSTRATIONS: SolarIllustrationsConfig = {
  odd: {
    1: ['sunset', 'future-green'],
    2: ['sunset'],
    3: ['sunrise'],
    4: ['sunrise', 'future-green'],
  },
  even: {
    1: ['sunrise', 'future-green'],
    2: ['sunrise'],
    3: ['sunrise'],
    4: ['sunset'],
    5: ['sunset'],
    6: ['sunset', 'future-green'],
    7: ['sunset', 'future-green'],
    8: ['sunrise', 'future-green'],
  },
  'jardim-artes': {},
  'cond-iracema': {},
}

const item = (
  building: BuildingKind,
  ending: Ending,
  order: number,
  label: string,
  icon: SurroundingIcon,
): SurroundingItem => ({
  id: `${building}-${ending}-${order}`,
  label,
  icon,
})

export const DEFAULT_SURROUNDINGS: SurroundingsConfig = {
  odd: {
    1: [
      item('odd', 1, 1, 'Futura área verde', 'park'),
      item('odd', 1, 2, 'Blocos G e F', 'building'),
      item('odd', 1, 3, 'Sol poente', 'sunset'),
    ],
    2: [
      item('odd', 2, 1, 'Blocos G e F', 'building'),
      item('odd', 2, 2, 'Bloco C', 'building'),
      item('odd', 2, 3, 'Sol poente', 'sunset'),
    ],
    3: [
      item('odd', 3, 1, 'Área de mata', 'forest'),
      item('odd', 3, 2, 'Bloco C', 'building'),
      item('odd', 3, 3, 'Sol nascente', 'sunrise'),
    ],
    4: [
      item('odd', 4, 1, 'Futura área verde', 'park'),
      item('odd', 4, 2, 'Área de mata', 'forest'),
      item('odd', 4, 3, 'Sol nascente', 'sunrise'),
    ],
  },
  even: {
    1: [
      item('even', 1, 1, 'Futura área verde', 'park'),
      item('even', 1, 2, 'Área de mata', 'forest'),
      item('even', 1, 3, 'Sol nascente', 'sunrise'),
    ],
    2: [
      item('even', 2, 1, 'Área de mata', 'forest'),
      item('even', 2, 2, 'Bloco C', 'building'),
      item('even', 2, 3, 'Sol nascente', 'sunrise'),
      item('even', 2, 4, 'Dependência de empregada', 'service-room'),
    ],
    3: [
      item('even', 3, 1, 'Área de mata', 'forest'),
      item('even', 3, 2, 'Bloco C', 'building'),
      item('even', 3, 3, 'Sol nascente', 'sunrise'),
      item('even', 3, 4, 'Dependência de empregada', 'service-room'),
    ],
    4: [
      item('even', 4, 1, 'Bloco C', 'building'),
      item('even', 4, 2, 'Blocos G e F', 'building'),
      item('even', 4, 3, 'Sol poente', 'sunset'),
    ],
    5: [
      item('even', 5, 1, 'Bloco C', 'building'),
      item('even', 5, 2, 'Blocos G e F', 'building'),
      item('even', 5, 3, 'Sol poente', 'sunset'),
    ],
    6: [
      item('even', 6, 1, 'Blocos G e F', 'building'),
      item('even', 6, 2, 'Futura área verde', 'park'),
      item('even', 6, 3, 'Sol poente', 'sunset'),
      item('even', 6, 4, 'Depósito', 'storage'),
    ],
    7: [
      item('even', 7, 1, 'Futura área verde', 'park'),
      item('even', 7, 2, 'Blocos G e F', 'building'),
      item('even', 7, 3, 'Sol poente', 'sunset'),
      item('even', 7, 4, 'Depósito', 'storage'),
    ],
    8: [
      item('even', 8, 1, 'Futura área verde', 'park'),
      item('even', 8, 2, 'Área de mata', 'forest'),
      item('even', 8, 3, 'Sol nascente', 'sunrise'),
    ],
  },
  'jardim-artes': {},
  'cond-iracema': {},
}

export const SURROUNDING_ICON_OPTIONS: Array<{
  id: SurroundingIcon
  label: string
}> = [
  { id: 'park', label: 'Área verde' },
  { id: 'forest', label: 'Mata' },
  { id: 'tree', label: 'Árvore' },
  { id: 'building', label: 'Prédio' },
  { id: 'sunrise', label: 'Sol nascente' },
  { id: 'sunset', label: 'Sol poente' },
  { id: 'road', label: 'Via/acesso' },
  { id: 'gate', label: 'Portaria/acesso' },
  { id: 'water', label: 'Água/piscina' },
  { id: 'storage', label: 'Depósito' },
  { id: 'service-room', label: 'Dependência de empregada' },
]
