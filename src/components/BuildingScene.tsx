import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, type ThreeEvent, useThree } from '@react-three/fiber'
import { Edges, Html, OrbitControls, useGLTF, useProgress } from '@react-three/drei'
import {
  CanvasTexture,
  Group,
  Mesh,
  type BufferGeometry,
  type Material,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import {
  SELECTED_UNIT_COLOR,
  STATUS_BY_ID,
  apartmentFloorCenterY,
  buildingFloors,
  type ApartmentStatus,
  type BuildingConfig,
} from '../config/building'

export type BuildingView = 'perspective' | 'front' | 'back' | 'east' | 'west'

/** Folga em metros para o realce aflorar além da fachada sem cobrir o vizinho. */
const FACADE_OVERHANG = 0.2

type Props = {
  config: BuildingConfig
  statuses: Record<string, ApartmentStatus>
  selectedId: string
  activeStatus: ApartmentStatus
  view: BuildingView
  showFloorScale: boolean
  highlightAvailability: boolean
  onSelect: (id: string) => void
  onActivate: (id: string) => void
}

/** Resolução da textura da régua de andares, em pixels por metro do modelo. */
const FLOOR_SCALE_PIXELS_PER_METER = 22

/** Maior afastamento horizontal ocupado pelos apartamentos da torre. */
function towerRadius(config: BuildingConfig) {
  return Object.values(config.unitPositions).reduce(
    (radius, position) =>
      Math.max(
        radius,
        Math.abs(position.x) + position.width / 2,
        Math.abs(position.z) + position.depth / 2,
      ),
    0,
  )
}

function viewPositions(config: BuildingConfig) {
  const centerY = config.cameraCenterY
  const distance = config.cameraDistance
  return {
    perspective: [distance * 0.68, centerY + 16, distance * 0.68],
    front: [0, centerY, distance],
    back: [0, centerY, -distance],
    east: [distance, centerY, 0],
    west: [-distance, centerY, 0],
  } satisfies Record<BuildingView, [number, number, number]>
}

function CameraController({
  view,
  config,
}: {
  view: BuildingView
  config: BuildingConfig
}) {
  const { camera } = useThree()
  const controls = useRef<OrbitControlsImpl>(null)
  const centerY = config.cameraCenterY

  // Só reenquadra ao trocar de prédio ou de vista: manter `positions` fora das
  // dependências preserva o zoom e o pan feitos pelo usuário entre renders.
  useEffect(() => {
    camera.position.set(...viewPositions(config)[view])
    camera.lookAt(0, centerY, 0)
    controls.current?.target.set(0, centerY, 0)
    controls.current?.update()
  }, [camera, centerY, config, view])

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={[0, centerY, 0]}
      enableDamping
      dampingFactor={0.07}
      minDistance={48}
      maxDistance={280}
      minPolarAngle={Math.PI * 0.12}
      maxPolarAngle={Math.PI * 0.88}
    />
  )
}

function BuildingModel({ config }: { config: BuildingConfig }) {
  const { scene } = useGLTF(config.towerModel)
  const model = useMemo(() => {
    const clone = scene.clone(true)
    clone.updateMatrixWorld(true)
    const geometriesByMaterial = new Map<
      string,
      { material: Material; geometries: BufferGeometry[] }
    >()

    clone.traverse((object) => {
      if (!(object instanceof Mesh)) return
      const isApartment =
        object.name.includes('_APTO_') || object.name.includes('/Apartamento_')
      if (!isApartment) return

      object.visible = false
      const isEvenExterior =
        object.name.includes('/Arquitetura/') &&
        /(Fachadas|Vidros|Caixilhos|Peitoris|Varanda|\/Fachada\/|Compartilhadas)/.test(
          object.name,
        )
      if (config.optimizeExteriorOnly && !isEvenExterior) return

      const material = Array.isArray(object.material)
        ? object.material[0]
        : object.material
      const geometry = object.geometry.index
        ? object.geometry.toNonIndexed()
        : object.geometry.clone()

      Object.keys(geometry.attributes).forEach((attribute) => {
        if (attribute !== 'position' && attribute !== 'normal') {
          geometry.deleteAttribute(attribute)
        }
      })
      geometry.applyMatrix4(object.matrixWorld)

      const batch = geometriesByMaterial.get(material.uuid) ?? {
        material,
        geometries: [] as BufferGeometry[],
      }
      batch.geometries.push(geometry)
      geometriesByMaterial.set(material.uuid, batch)
    })

    const optimizedApartments = new Group()
    optimizedApartments.name = 'APARTAMENTOS_OTIMIZADOS'
    geometriesByMaterial.forEach(({ material, geometries }) => {
      const merged = mergeGeometries(geometries, false)
      geometries.forEach((geometry) => geometry.dispose())
      if (!merged) return
      const mesh = new Mesh(merged, material)
      mesh.receiveShadow = true
      optimizedApartments.add(mesh)
    })
    clone.add(optimizedApartments)
    return clone
  }, [config.optimizeExteriorOnly, scene])

  return <primitive object={model} />
}

function ApartmentVolumes({
  config,
  statuses,
  selectedId,
  highlightAvailability,
  onSelect,
  onActivate,
}: Pick<
  Props,
  | 'config'
  | 'statuses'
  | 'selectedId'
  | 'highlightAvailability'
  | 'onSelect'
  | 'onActivate'
>) {
  const [hoveredId, setHoveredId] = useState('')

  return (
    <group>
      {config.apartments.map((apartment) => {
        const position = config.unitPositions[apartment.ending]
        const status = statuses[apartment.id] ?? 'none'
        const isSelected = selectedId === apartment.id
        const isHovered = hoveredId === apartment.id
        const isFilled = status !== 'none'
        const color = isFilled
          ? STATUS_BY_ID[status].color
          : isSelected
            ? SELECTED_UNIT_COLOR
            : highlightAvailability
              ? STATUS_BY_ID.available.color
              : '#38bdf8'
        const opacity = isFilled
          ? highlightAvailability
            ? 0.5
            : 0.38
          : isSelected
            ? 0.42
            : highlightAvailability
              ? isHovered
                ? 0.3
                : 0.17
              : isHovered
                ? 0.12
                : 0.001

        // A caixa cresce só para fora da torre: a face interna continua no
        // lugar e a externa passa a aflorar pouco além da fachada.
        const outwardX = Math.sign(position.x) * FACADE_OVERHANG
        const outwardZ = Math.sign(position.z) * FACADE_OVERHANG

        return (
          <mesh
            key={apartment.id}
            position={[
              position.x + outwardX,
              apartmentFloorCenterY(config, apartment.floor),
              position.z + outwardZ,
            ]}
            renderOrder={isSelected ? 12 : 10}
            onClick={(event) => {
              event.stopPropagation()
              onSelect(apartment.id)
            }}
            onDoubleClick={(event) => {
              event.stopPropagation()
              onActivate(apartment.id)
            }}
            onPointerOver={(event: ThreeEvent<PointerEvent>) => {
              event.stopPropagation()
              setHoveredId(apartment.id)
              document.body.style.cursor = 'pointer'
            }}
            onPointerOut={(event) => {
              event.stopPropagation()
              setHoveredId('')
              document.body.style.cursor = ''
            }}
          >
            <boxGeometry
              args={[
                position.width + FACADE_OVERHANG * 2,
                config.floorHeight * 0.94,
                position.depth + FACADE_OVERHANG * 2,
              ]}
            />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={opacity}
              depthWrite={false}
              toneMapped={false}
            />
            {(isSelected || isHovered) && (
              <Edges
                color={isSelected ? SELECTED_UNIT_COLOR : '#7dd3fc'}
                linewidth={isSelected ? 2 : 1}
              />
            )}
            {isSelected && (
              <Edges
                color={SELECTED_UNIT_COLOR}
                linewidth={1}
                depthTest={false}
                transparent
                opacity={0.55}
                renderOrder={30}
              />
            )}
          </mesh>
        )
      })}
    </group>
  )
}

function SelectedApartmentLabel({
  config,
  statuses,
  selectedId,
}: Pick<Props, 'config' | 'statuses' | 'selectedId'>) {
  const apartment = config.apartmentById[selectedId]
  if (!apartment) return null
  const position = config.unitPositions[apartment.ending]

  return (
    <Html
      center
      position={[
        position.x,
        apartmentFloorCenterY(config, apartment.floor) +
          config.floorHeight / 2 +
          1.2,
        position.z,
      ]}
      distanceFactor={90}
      style={{ pointerEvents: 'none' }}
    >
      <div className="scene-label">
        <strong>Apto {apartment.id}</strong>
        <span>{STATUS_BY_ID[statuses[selectedId] ?? 'none'].label}</span>
      </div>
    </Html>
  )
}

/** Régua desenhada em uma textura única, em vez de um rótulo DOM por andar. */
function floorScaleTexture(
  config: BuildingConfig,
  selectedFloor: number | null,
  bounds: { top: number; bottom: number; width: number },
) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bounds.width * FLOOR_SCALE_PIXELS_PER_METER)
  canvas.height = Math.round(
    (bounds.top - bounds.bottom) * FLOOR_SCALE_PIXELS_PER_METER,
  )

  const context = canvas.getContext('2d')
  if (!context) return null

  const tickEnd = canvas.width - 6
  const tickStart = canvas.width - 30
  context.textAlign = 'right'
  context.textBaseline = 'middle'

  for (const floor of buildingFloors(config)) {
    const label = floor === 0 ? 'T' : String(floor)
    const strong = floor === config.floorCount || floor % 5 === 0
    const active = floor === selectedFloor
    const y =
      (bounds.top - apartmentFloorCenterY(config, floor)) *
      FLOOR_SCALE_PIXELS_PER_METER

    context.fillStyle = active ? '#3fbfb4' : strong ? '#b9d1e0' : '#6f8798'
    context.fillRect(active || strong ? tickStart : tickStart + 10, y - 1, tickEnd - (active || strong ? tickStart : tickStart + 10), 2)

    context.font = `${active || strong ? 700 : 600} 30px 'Manrope', 'Segoe UI', sans-serif`
    if (active) {
      const width = context.measureText(label).width + 18
      context.beginPath()
      context.roundRect(tickStart - 12 - width, y - 20, width, 40, 10)
      context.fill()
      context.fillStyle = '#04222a'
    }
    context.fillText(label, tickStart - 21, y + 1)
  }

  const texture = new CanvasTexture(canvas)
  texture.anisotropy = 4
  return texture
}

function FloorScale({
  config,
  selectedFloor,
}: {
  config: BuildingConfig
  selectedFloor: number | null
}) {
  const group = useRef<Group>(null)
  const radius = useMemo(() => towerRadius(config) + 6, [config])

  const bounds = useMemo(() => {
    const floors = buildingFloors(config)
    const top =
      apartmentFloorCenterY(config, floors[floors.length - 1]) +
      config.floorHeight
    const bottom = apartmentFloorCenterY(config, floors[0]) - config.floorHeight
    return { top, bottom, width: 6 }
  }, [config])

  const texture = useMemo(
    () => floorScaleTexture(config, selectedFloor, bounds),
    [config, selectedFloor, bounds],
  )

  useEffect(() => () => texture?.dispose(), [texture])

  // A régua orbita junto com a câmera para ficar sempre à esquerda da tela,
  // encostada na face da torre que está voltada para quem observa.
  useFrame(({ camera }) => {
    if (!group.current) return
    const angle = Math.atan2(camera.position.x, camera.position.z)
    group.current.rotation.y = angle
    group.current.position.set(-Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
  })

  if (!texture) return null

  return (
    <group ref={group}>
      <mesh position={[0, (bounds.top + bounds.bottom) / 2, 0]} renderOrder={20}>
        <planeGeometry args={[bounds.width, bounds.top - bounds.bottom]} />
        <meshBasicMaterial
          map={texture}
          transparent
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

function LoadingModel() {
  const { progress } = useProgress()
  return (
    <Html center>
      <div className="model-loading">
        <span />
        Carregando prédio {Math.round(progress)}%
      </div>
    </Html>
  )
}

export function BuildingScene(props: Props) {
  const positions = viewPositions(props.config)
  const selectedApartment = props.config.apartmentById[props.selectedId]
  const selectedFloorY = selectedApartment
    ? apartmentFloorCenterY(props.config, selectedApartment.floor) -
      props.config.floorHeight / 2
    : 0

  return (
    <Canvas
      camera={{ position: positions.perspective, fov: 38, near: 0.1, far: 700 }}
      dpr={[1, 1.75]}
      shadows
      gl={{ antialias: true, alpha: false }}
      onPointerMissed={() => undefined}
    >
      <color attach="background" args={['#08131f']} />
      <fog attach="fog" args={['#08131f', 190, 340]} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#dcefff', '#213044', 0.9]} />
      <directionalLight
        position={[70, 145, 85]}
        intensity={2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={300}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={140}
        shadow-camera-bottom={-20}
      />

      <Suspense fallback={<LoadingModel />}>
        <BuildingModel config={props.config} />
        <SelectedApartmentLabel
          config={props.config}
          statuses={props.statuses}
          selectedId={props.selectedId}
        />
      </Suspense>
      <ApartmentVolumes
        config={props.config}
        statuses={props.statuses}
        selectedId={props.selectedId}
        highlightAvailability={props.highlightAvailability}
        onSelect={props.onSelect}
        onActivate={props.onActivate}
      />
      {props.showFloorScale && (
        <FloorScale
          config={props.config}
          selectedFloor={selectedApartment?.floor ?? null}
        />
      )}
      {selectedApartment && (
        <mesh position={[0, selectedFloorY + 0.03, 0]} renderOrder={15}>
          <boxGeometry args={[38, 0.12, 28]} />
          <meshBasicMaterial
            color="#38bdf8"
            transparent
            opacity={0.22}
            depthWrite={false}
            toneMapped={false}
          />
          <Edges color="#7dd3fc" />
        </mesh>
      )}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.38, 0]} receiveShadow>
        <circleGeometry args={[90, 96]} />
        <meshStandardMaterial color="#0f2230" roughness={0.92} metalness={0.05} />
      </mesh>
      <gridHelper args={[180, 36, '#224357', '#142b3a']} position={[0, -0.36, 0]} />
      <CameraController view={props.view} config={props.config} />
    </Canvas>
  )
}

