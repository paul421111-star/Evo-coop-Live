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

export type SurroundingItem = {
  id: string
  label: string
  icon: SurroundingIcon
}

export type SurroundingsConfig = Record<
  BuildingKind,
  Partial<Record<Ending, SurroundingItem[]>>
>

export type SolarIllustration = 'sunrise' | 'sunset'

export type SolarIllustrationsConfig = Record<
  BuildingKind,
  Partial<Record<Ending, SolarIllustration>>
>

export const SOLAR_ILLUSTRATION_OPTIONS: Array<{
  id: SolarIllustration
  label: string
  image: string
}> = [
  {
    id: 'sunrise',
    label: 'Sol nascente',
    image: '/images/sol-nascente-realista.png',
  },
  {
    id: 'sunset',
    label: 'Sol poente',
    image: '/images/sol-poente-realista.png',
  },
]

export const SOLAR_ILLUSTRATION_BY_ID = Object.fromEntries(
  SOLAR_ILLUSTRATION_OPTIONS.map((option) => [option.id, option]),
) as Record<SolarIllustration, (typeof SOLAR_ILLUSTRATION_OPTIONS)[number]>

export const DEFAULT_SOLAR_ILLUSTRATIONS: SolarIllustrationsConfig = {
  odd: { 1: 'sunset', 2: 'sunset', 3: 'sunrise', 4: 'sunrise' },
  even: {
    1: 'sunrise',
    2: 'sunrise',
    3: 'sunrise',
    4: 'sunset',
    5: 'sunset',
    6: 'sunset',
    7: 'sunset',
    8: 'sunrise',
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
    ],
    3: [
      item('even', 3, 1, 'Área de mata', 'forest'),
      item('even', 3, 2, 'Bloco C', 'building'),
      item('even', 3, 3, 'Sol nascente', 'sunrise'),
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
    ],
    7: [
      item('even', 7, 1, 'Futura área verde', 'park'),
      item('even', 7, 2, 'Blocos G e F', 'building'),
      item('even', 7, 3, 'Sol poente', 'sunset'),
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
  { id: 'water', label: 'Água/piscina' },
]
