import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BUILDING_CONFIGS, type BuildingKind, type Ending } from './building'

type Node = {
  name?: string
  mesh?: number
  children?: number[]
  matrix?: number[]
  translation?: number[]
  rotation?: number[]
  scale?: number[]
}

type Gltf = {
  nodes: Node[]
  meshes: { primitives: { attributes: { POSITION: number } }[] }[]
  accessors: { min?: number[]; max?: number[] }[]
  scenes: { nodes: number[] }[]
}

type Matrix = number[]

const IDENTITY: Matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

function multiply(a: Matrix, b: Matrix): Matrix {
  const out = new Array<number>(16).fill(0)
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row] * b[column * 4 + k]
      out[column * 4 + row] = sum
    }
  }
  return out
}

function localMatrix(node: Node): Matrix {
  if (node.matrix) return node.matrix
  const [tx, ty, tz] = node.translation ?? [0, 0, 0]
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = node.scale ?? [1, 1, 1]
  const xx = qx * (qx + qx)
  const xy = qx * (qy + qy)
  const xz = qx * (qz + qz)
  const yy = qy * (qy + qy)
  const yz = qy * (qz + qz)
  const zz = qz * (qz + qz)
  const wx = qw * (qx + qx)
  const wy = qw * (qy + qy)
  const wz = qw * (qz + qz)
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ]
}

function readGltf(modelUrl: string): Gltf {
  const buffer = readFileSync(`public${modelUrl}`)
  const jsonLength = buffer.readUInt32LE(12)
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'))
}

/**
 * Centro horizontal de cada final, medido na geometria do modelo. Os nós de
 * apartamento são nomeados com andar e final (`..._APTO_3601`, `Apartamento_2901`).
 */
function endingCenters(modelUrl: string) {
  const gltf = readGltf(modelUrl)
  const centers = new Map<Ending, { x: number; z: number }>()

  const growBounds = (
    meshIndex: number,
    matrix: Matrix,
    bounds: { min: number[]; max: number[] },
  ) => {
    for (const primitive of gltf.meshes[meshIndex].primitives) {
      const accessor = gltf.accessors[primitive.attributes.POSITION]
      if (!accessor.min || !accessor.max) continue
      for (const x of [accessor.min[0], accessor.max[0]]) {
        for (const y of [accessor.min[1], accessor.max[1]]) {
          for (const z of [accessor.min[2], accessor.max[2]]) {
            const point = [
              matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
              matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
              matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
            ]
            for (let axis = 0; axis < 3; axis += 1) {
              bounds.min[axis] = Math.min(bounds.min[axis], point[axis])
              bounds.max[axis] = Math.max(bounds.max[axis], point[axis])
            }
          }
        }
      }
    }
  }

  const collect = (
    nodeIndex: number,
    matrix: Matrix,
    bounds: { min: number[]; max: number[] },
  ) => {
    const node = gltf.nodes[nodeIndex]
    const world = multiply(matrix, localMatrix(node))
    if (node.mesh !== undefined) growBounds(node.mesh, world, bounds)
    for (const child of node.children ?? []) collect(child, world, bounds)
  }

  const walk = (nodeIndex: number, matrix: Matrix) => {
    const node = gltf.nodes[nodeIndex]
    const world = multiply(matrix, localMatrix(node))
    const apartment = /(?:apartamento_|_apto_)(\d+)$/i.exec(node.name ?? '')

    if (apartment) {
      const ending = Number(apartment[1].slice(-2)) as Ending
      if (!centers.has(ending)) {
        const bounds = {
          min: [Infinity, Infinity, Infinity],
          max: [-Infinity, -Infinity, -Infinity],
        }
        collect(nodeIndex, matrix, bounds)
        centers.set(ending, {
          x: (bounds.min[0] + bounds.max[0]) / 2,
          z: (bounds.min[2] + bounds.max[2]) / 2,
        })
      }
      return
    }

    for (const child of node.children ?? []) walk(child, world)
  }

  for (const root of gltf.scenes[0].nodes) walk(root, IDENTITY)
  return centers
}

describe('posições dos finais nos modelos 3D', () => {
  const kinds = Object.keys(BUILDING_CONFIGS) as BuildingKind[]

  it.each(kinds)('%s marca cada final sobre o apartamento real', (kind) => {
    const config = BUILDING_CONFIGS[kind]
    const centers = endingCenters(config.towerModel)

    expect(centers.size).toBe(config.endings.length)
    for (const ending of config.endings) {
      const center = centers.get(ending)
      const position = config.unitPositions[ending]
      expect(center, `final ${ending} ausente no modelo`).toBeDefined()
      expect(position.x).toBeCloseTo(center!.x, 1)
      expect(position.z).toBeCloseTo(center!.z, 1)
    }
  })
})
