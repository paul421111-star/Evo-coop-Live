/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BUILDING_CONFIGS } from '../config/building'
import { ApartmentGrid } from './ApartmentGrid'

const config = BUILDING_CONFIGS.even

function renderFloor(reservedFloors: number[]) {
  const statuses = Object.fromEntries(
    config.apartments
      .filter((apartment) => reservedFloors.includes(apartment.floor))
      .map((apartment) => [apartment.id, 'reserved' as const]),
  )
  render(
    <ApartmentGrid
      config={config}
      statuses={statuses}
      assignments={{}}
      selectedId=""
      floorFilter="all"
      endingFilter="all"
      statusFilter="all"
      onSelect={() => undefined}
      onActivate={() => undefined}
    />,
  )
}

afterEach(() => cleanup())

describe('andar completo', () => {
  it('marca o número do andar quando todas as unidades estão reservadas', () => {
    renderFloor([19])
    expect(screen.getByText('19º').className).toContain('is-complete')
    expect(screen.getByText('18º').className).not.toContain('is-complete')
  })

  it('não marca o andar se ainda falta uma unidade', () => {
    const statuses = Object.fromEntries(
      config.apartments
        .filter((apartment) => apartment.floor === 19 && apartment.id !== '191')
        .map((apartment) => [apartment.id, 'reserved' as const]),
    )
    render(
      <ApartmentGrid
        config={config}
        statuses={statuses}
        assignments={{}}
        selectedId=""
        floorFilter="all"
        endingFilter="all"
        statusFilter="all"
        onSelect={() => undefined}
        onActivate={() => undefined}
      />,
    )
    expect(screen.getByText('19º').className).not.toContain('is-complete')
  })
})
