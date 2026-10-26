import {
  Mesh,
  MeshStandardMaterial,
  type Material,
  type Object3D,
} from 'three'

/**
 * Cores medidas na foto aérea oficial das torres já entregues do Grupo 12.
 * A fachada pronta é reboco claro quente e o vidro é cinza-azulado.
 * Fonte: https://chvn.com.br/wp-content/uploads/2026/09/12-2.png
 * Página: https://chvn.com.br/grupo-12-condominio-residencial-parque-firenze/
 */
export const GRUPO_12_FACADE = {
  plaster: '#E7DED4',
  plasterShade: '#C9C3BB',
  concrete: '#D5CEC4',
  frame: '#3C424C',
  glass: '#A8B3C2',
  balconyGlass: '#D2DAE2',
  band: '#F1EBE3',
} as const

export const GRUPO_12_DAYLIGHT = {
  sky: '#F3F6FB',
  ground: '#D8CFC3',
  sun: '#FFF3E4',
} as const

const MATERIAL_TINT: Record<
  string,
  { color: string; metalness?: number; roughness?: number }
> = {
  Fachada_branca: { color: GRUPO_12_FACADE.plaster, roughness: 0.74 },
  Fachada_cinza_clara: { color: GRUPO_12_FACADE.plasterShade, roughness: 0.78 },
  Fachada_cinza_escura: { color: '#8C8782', roughness: 0.8 },
  Concreto_novo: { color: GRUPO_12_FACADE.concrete, roughness: 0.86 },
  Faixa: { color: GRUPO_12_FACADE.band, roughness: 0.7 },
  Esquadria_escura: {
    color: GRUPO_12_FACADE.frame,
    metalness: 0.42,
    roughness: 0.38,
  },
  Vidro_fachada: {
    color: GRUPO_12_FACADE.glass,
    metalness: 0.62,
    roughness: 0.14,
  },
  Vidro_varanda: {
    color: GRUPO_12_FACADE.balconyGlass,
    metalness: 0.4,
    roughness: 0.16,
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
