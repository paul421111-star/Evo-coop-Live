import {
  Mesh,
  MeshStandardMaterial,
  type Material,
  type Object3D,
} from 'three'

/**
 * Torres entregues do Grupo 12: tinta branca e fachada de vidro azul-cinza.
 * Fonte: https://chvn.com.br/wp-content/uploads/2026/09/12-2.png
 * Página: https://chvn.com.br/grupo-12-condominio-residencial-parque-firenze/
 */
export const GRUPO_12_FACADE = {
  plaster: '#F7F8F8',
  plasterShade: '#E4E8EC',
  concrete: '#D5DADF',
  frame: '#3E4A58',
  glass: '#4A6278',
  balconyGlass: '#6D879C',
  band: '#F7F8F8',
} as const

export const GRUPO_12_DAYLIGHT = {
  sky: '#E7EEF6',
  ground: '#C9D3DC',
  sun: '#F5F8FC',
} as const

const MATERIAL_TINT: Record<
  string,
  { color: string; metalness?: number; roughness?: number }
> = {
  Fachada_branca: { color: GRUPO_12_FACADE.plaster, roughness: 0.84 },
  Fachada_cinza_clara: { color: GRUPO_12_FACADE.plasterShade, roughness: 0.8 },
  Fachada_cinza_escura: { color: '#5C6E80', roughness: 0.72 },
  Concreto_novo: { color: GRUPO_12_FACADE.concrete, roughness: 0.86 },
  Faixa: { color: GRUPO_12_FACADE.band, roughness: 0.8 },
  Esquadria_escura: {
    color: GRUPO_12_FACADE.frame,
    metalness: 0.28,
    roughness: 0.46,
  },
  Vidro_fachada: {
    color: GRUPO_12_FACADE.glass,
    metalness: 0.04,
    roughness: 0.46,
  },
  Vidro_varanda: {
    color: GRUPO_12_FACADE.balconyGlass,
    metalness: 0.04,
    roughness: 0.4,
  },
  Sombra: { color: '#2C3238', roughness: 0.9 },
}

/** Recolore a fachada do Grupo 12 sem alterar o material original do arquivo. */
export function applyGrupo12Facade(root: Object3D) {
  const replacements = new Map<string, Material>()

  const tint = (material: Material) => {
    const cached = replacements.get(material.uuid)
    if (cached) return cached
    if (!(material instanceof MeshStandardMaterial)) return material
    const spec = MATERIAL_TINT[material.name]
    if (!spec) return material
    const next = material.clone()
    next.color.set(spec.color)
    next.emissive.set('#000000')
    if (material.name.startsWith('Vidro_')) next.envMapIntensity = 0.15
    if (spec.metalness !== undefined) next.metalness = spec.metalness
    if (spec.roughness !== undefined) next.roughness = spec.roughness
    next.name = material.name
    replacements.set(material.uuid, next)
    return next
  }

  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const source = object.material
    object.material = Array.isArray(source) ? source.map(tint) : tint(source)
  })
}
