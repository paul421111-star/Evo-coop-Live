import type { BuildingKind } from './building'
import type { DrawGroup } from './drawGroups'

export type ProjectKind = 'firenze' | 'jardim-artes' | 'cond-iracema'
export type BlockCode = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

export type EventWorkspace = {
  project: ProjectKind
  building: BuildingKind
  group: DrawGroup
  block: BlockCode
}

export const BLOCKS: BlockCode[] = ['A', 'B', 'C', 'D', 'E', 'F']

export const PROJECTS: Array<{
  id: ProjectKind
  name: string
  location: string
  image: string
  groups: DrawGroup[]
  defaultBlock: BlockCode
  deliveryLabel: string
}> = [
  {
    id: 'firenze',
    name: 'Parque Firenze',
    location: 'Embu das Artes/SP',
    image: '/projects/parque-firenze.png',
    groups: ['12', '13', '14', '15', '16', '17', '18'],
    defaultBlock: 'D',
    deliveryLabel: 'Entrega atual: Bloco D',
  },
  {
    id: 'jardim-artes',
    name: 'Jardim das Artes',
    location: 'Embu das Artes/SP',
    image: '/projects/jardim-das-artes.png',
    groups: ['11'],
    defaultBlock: 'E',
    deliveryLabel: 'Entrega atual: Bloco E',
  },
  {
    id: 'cond-iracema',
    name: 'Recanto da Iracema',
    location: 'Taboão da Serra/SP',
    image: '/projects/recanto-iracema.png',
    groups: ['19'],
    defaultBlock: 'A',
    deliveryLabel: 'Entrega atual: Bloco A',
  },
]

export function buildingForProjectGroup(
  project: ProjectKind,
  group: DrawGroup,
): BuildingKind {
  if (project === 'jardim-artes') return 'jardim-artes'
  if (project === 'cond-iracema') return 'cond-iracema'
  return ['12', '14', '16', '18'].includes(group) ? 'even' : 'odd'
}

export function liveEventTitle(group: DrawGroup, block: BlockCode): string {
  return `Live de Sorteio Grupo ${group} ${block}`
}

export function projectForBuilding(building: BuildingKind): ProjectKind {
  if (building === 'jardim-artes') return 'jardim-artes'
  if (building === 'cond-iracema') return 'cond-iracema'
  return 'firenze'
}
