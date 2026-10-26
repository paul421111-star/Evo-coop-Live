import { Mesh, MeshStandardMaterial, Group } from 'three'
import { describe, expect, it } from 'vitest'
import { applyGrupo12Facade, GRUPO_12_FACADE } from './grupo12Palette'

describe('fachada do Grupo 12', () => {
  it('troca o vidro esverdeado pelo cinza-azulado da torre pronta e preserva o original', () => {
    const original = new MeshStandardMaterial({
      name: 'Vidro_fachada',
      color: '#29524d',
    })
    const mesh = new Mesh()
    mesh.material = original
    const root = new Group()
    root.add(mesh)

    applyGrupo12Facade(root)

    const next = mesh.material as MeshStandardMaterial
    expect(next).not.toBe(original)
    expect(next.color.getHexString()).toBe(
      GRUPO_12_FACADE.glass.slice(1).toLowerCase(),
    )
    expect(original.color.getHexString()).toBe('29524d')
  })

  it('não mexe em materiais de dentro do apartamento', () => {
    const sofa = new MeshStandardMaterial({ name: 'Sofa_azul', color: '#294057' })
    const mesh = new Mesh()
    mesh.material = sofa
    const root = new Group()
    root.add(mesh)

    applyGrupo12Facade(root)

    expect(mesh.material).toBe(sofa)
  })
})
