import { Suspense, useMemo, useState } from 'react'
import { Canvas, type ThreeEvent } from '@react-three/fiber'
import { Edges, Html, OrbitControls, useGLTF } from '@react-three/drei'
import { KeyRound } from 'lucide-react'
import { balconyKeyOffset } from './balconyKey'
import {
  SELECTED_UNIT_COLOR,
  STATUS_BY_ID,
  apartmentId,
  type ApartmentStatus,
  type BuildingConfig,
  type Ending,
} from '../config/building'
import { applyGrupo12Facade } from '../config/grupo12Palette'

type Props = {
  config: BuildingConfig
  floor: number
  selectedId: string
  statuses: Record<string, ApartmentStatus>
  modelUrl?: string
  endings?: Ending[]
  overlayY?: number
  highlightAvailability?: boolean
  sceneTheme?: 'dark' | 'light'
  locked?: boolean
  framed?: boolean
  onSelect: (id: string) => void
  onActivate: (id: string) => void
}

function FloorModel({ url, grupo12 }: { url: string; grupo12: boolean }) {
  const { scene } = useGLTF(url)
  const model = useMemo(() => {
    const clone = scene.clone(true)
    if (grupo12) applyGrupo12Facade(clone)
    return clone
  }, [grupo12, scene])
  return <primitive object={model} />
}

function PlanCore({
  config,
  overlayY,
}: {
  config: BuildingConfig
  overlayY: number
}) {
  const core = config.planCore
  if (!core) return null

  return (
    <group position={[core.x ?? 0, overlayY, core.z ?? 0]}>
      <mesh renderOrder={11}>
        <boxGeometry args={[core.width, 0.14, core.depth]} />
        <meshBasicMaterial
          color="#8fa9c4"
          transparent
          opacity={0.2}
          depthWrite={false}
          toneMapped={false}
        />
        <Edges color="#8fb6d6" linewidth={2} />
      </mesh>
    </group>
  )
}

function FloorUnits({
  config,
  floor,
  selectedId,
  statuses,
  endings,
  overlayY: configuredOverlayY,
  highlightAvailability = false,
  onSelect,
  onActivate,
}: Props) {
  const [hoveredId, setHoveredId] = useState('')
  const overlayY = configuredOverlayY ?? config.floorPlanY ?? 3.02
  const visibleEndings = endings ?? config.endings

  return (
    <group>
      {visibleEndings.map((ending) => {
        const id = apartmentId(floor, ending)
        const position = config.unitPositions[ending]
        const status = statuses[id] ?? 'none'
        const selected = selectedId === id
        const hovered = hoveredId === id
        const reserved = status === 'reserved'
        const color = selected
          ? SELECTED_UNIT_COLOR
          : reserved
            ? STATUS_BY_ID.reserved.color
            : status === 'none'
              ? highlightAvailability
                ? STATUS_BY_ID.available.color
                : '#38bdf8'
              : STATUS_BY_ID[status].color
        const balcony = balconyKeyOffset(position)

        return (
          <group key={id}>
            <mesh
              position={[position.x, overlayY, position.z]}
              renderOrder={12}
              onClick={(event) => {
                event.stopPropagation()
                onSelect(id)
              }}
              onDoubleClick={(event) => {
                event.stopPropagation()
                onActivate(id)
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
                  selected
                    ? 0.5
                    : reserved
                      ? 0.46
                      : status !== 'none'
                        ? 0.48
                        : highlightAvailability
                          ? hovered
                            ? 0.34
                            : 0.22
                          : hovered
                            ? 0.2
                            : 0.025
                }
                depthWrite={false}
                toneMapped={false}
              />
              {(selected || hovered) && (
                <Edges
                  color={selected ? SELECTED_UNIT_COLOR : '#7dd3fc'}
                  linewidth={2}
                />
              )}
            </mesh>
            {reserved && (
              <Html
                center
                position={[
                  position.x + balcony.x,
                  overlayY + 0.5,
                  position.z + balcony.z,
                ]}
                style={{ pointerEvents: 'none' }}
              >
                <span className="facade-key" aria-hidden="true">
                  <KeyRound size={14} />
                </span>
              </Html>
            )}
            <Html
              center
              position={[position.x, overlayY + 0.43, position.z]}
              style={{ pointerEvents: 'none' }}
            >
              <div
                className={`floor-unit-label ${selected ? 'is-selected' : ''} ${
                  reserved ? 'is-reserved' : ''
                }`}
                style={{ '--unit-color': color } as React.CSSProperties}
              >
                <strong>{id}</strong>
                <span>
                  {selected && status === 'none'
                    ? 'Selecionado'
                    : STATUS_BY_ID[status].shortLabel}
                </span>
                {config.extraSpaceByEnding?.[ending] && (
                  <em>+ {config.extraSpaceByEnding[ending]}</em>
                )}
              </div>
            </Html>
          </group>
        )
      })}
    </group>
  )
}

export function FloorPlanScene(props: Props) {
  const modelUrl = props.modelUrl ?? props.config.floorModel
  if (!modelUrl) return null
  const mapRotationY = props.config.mapRotationY ?? 0
  const biasX = props.framed ? -1.6 : 0
  const biasZ = props.framed ? 2.3 : 0

  return (
    <Canvas
      orthographic
      camera={{
        position: [0, 60, 0],
        rotation: [-Math.PI / 2, 0, 0],
        zoom: props.framed ? 10.15 : 11.5,
        near: 0.1,
        far: 150,
      }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: false }}
      style={{ pointerEvents: props.locked ? 'none' : 'auto' }}
    >
      <color
        attach="background"
        args={[props.sceneTheme === 'light' ? '#e7eef4' : '#0b1824']}
      />
      <ambientLight intensity={1.1} />
      <hemisphereLight args={['#ffffff', '#26394a', 1.4]} />
      <directionalLight position={[20, 40, 18]} intensity={1.8} />
      <group position={[biasX, 0, biasZ]} rotation={[0, mapRotationY, 0]}>
        <Suspense fallback={null}>
          <FloorModel url={modelUrl} grupo12={props.config.kind === 'even'} />
        </Suspense>
        <PlanCore
          config={props.config}
          overlayY={props.overlayY ?? props.config.floorPlanY ?? 3.02}
        />
        <FloorUnits {...props} />
      </group>
      <OrbitControls
        makeDefault
        target={[0, 0, 0]}
        enableRotate={false}
        enabled={!props.locked}
        enablePan={!props.locked}
        enableZoom={!props.locked}
        screenSpacePanning
        minZoom={8}
        maxZoom={28}
      />
    </Canvas>
  )
}

