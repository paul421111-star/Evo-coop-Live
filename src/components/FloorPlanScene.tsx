import { Suspense, useMemo, useState } from 'react'
import { Canvas, type ThreeEvent } from '@react-three/fiber'
import { Edges, Html, OrbitControls, useGLTF } from '@react-three/drei'
import {
  STATUS_BY_ID,
  apartmentId,
  type ApartmentStatus,
  type BuildingConfig,
} from '../config/building'

type Props = {
  config: BuildingConfig
  floor: number
  selectedId: string
  statuses: Record<string, ApartmentStatus>
  onSelect: (id: string) => void
}

function FloorModel({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  const model = useMemo(() => scene.clone(true), [scene])
  return <primitive object={model} />
}

function FloorUnits({ config, floor, selectedId, statuses, onSelect }: Props) {
  const [hoveredId, setHoveredId] = useState('')

  return (
    <group>
      {config.endings.map((ending) => {
        const id = apartmentId(floor, ending)
        const position = config.unitPositions[ending]
        const status = statuses[id] ?? 'none'
        const selected = selectedId === id
        const hovered = hoveredId === id
        const color =
          status === 'none' ? '#38bdf8' : STATUS_BY_ID[status].color

        return (
          <group key={id}>
            <mesh
              position={[position.x, 3.02, position.z]}
              renderOrder={12}
              onClick={(event) => {
                event.stopPropagation()
                onSelect(id)
              }}
              onPointerOver={(event: ThreeEvent<PointerEvent>) => {
                event.stopPropagation()
                setHoveredId(id)
                document.body.style.cursor = 'pointer'
              }}
              onPointerOut={(event) => {
                event.stopPropagation()
                setHoveredId('')
                document.body.style.cursor = ''
              }}
            >
              <boxGeometry args={[position.width, 0.16, position.depth]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={
                  status !== 'none' ? 0.38 : selected || hovered ? 0.2 : 0.025
                }
                depthWrite={false}
                toneMapped={false}
              />
              {(selected || hovered) && (
                <Edges color={selected ? '#ffffff' : '#7dd3fc'} linewidth={2} />
              )}
            </mesh>
            <Html
              center
              position={[position.x, 3.45, position.z]}
              style={{ pointerEvents: 'none' }}
            >
              <div
                className={`floor-unit-label ${selected ? 'is-selected' : ''}`}
                style={{ '--unit-color': color } as React.CSSProperties}
              >
                <strong>{id}</strong>
                <span>{STATUS_BY_ID[status].shortLabel}</span>
              </div>
            </Html>
          </group>
        )
      })}
    </group>
  )
}

export function FloorPlanScene(props: Props) {
  if (!props.config.floorModel) return null

  return (
    <Canvas
      orthographic
      camera={{
        position: [0, 60, 0],
        rotation: [-Math.PI / 2, 0, 0],
        zoom: 14,
        near: 0.1,
        far: 150,
      }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: false }}
    >
      <color attach="background" args={['#0b1824']} />
      <ambientLight intensity={1.1} />
      <hemisphereLight args={['#ffffff', '#26394a', 1.4]} />
      <directionalLight position={[20, 40, 18]} intensity={1.8} />
      <Suspense fallback={null}>
        <FloorModel url={props.config.floorModel} />
      </Suspense>
      <FloorUnits {...props} />
      <OrbitControls
        makeDefault
        target={[0, 0, 0]}
        enableRotate={false}
        enablePan
        screenSpacePanning
        minZoom={8}
        maxZoom={28}
      />
    </Canvas>
  )
}

