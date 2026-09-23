import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, type ThreeEvent, useThree } from '@react-three/fiber'
import { Edges, Html, OrbitControls, useGLTF, useProgress } from '@react-three/drei'
import { Group, Mesh, type BufferGeometry, type Material } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import {
  STATUS_BY_ID,
  type ApartmentStatus,
  type BuildingConfig,
} from '../config/building'

export type BuildingView = 'perspective' | 'front' | 'back' | 'east' | 'west'

type Props = {
  config: BuildingConfig
  statuses: Record<string, ApartmentStatus>
  selectedId: string
  activeStatus: ApartmentStatus
  view: BuildingView
  onSelect: (id: string) => void
}

function viewPositions(config: BuildingConfig) {
  const centerY = config.kind === 'even' ? 52 : 62
  const distance = config.kind === 'even' ? 170 : 215
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
  const positions = viewPositions(config)
  const centerY = config.kind === 'even' ? 52 : 62

  useEffect(() => {
    camera.position.set(...positions[view])
    camera.lookAt(0, centerY, 0)
    controls.current?.target.set(0, centerY, 0)
    controls.current?.update()
  }, [camera, centerY, positions, view])

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
      if (config.kind === 'even' && !isEvenExterior) return

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
  }, [config.kind, scene])

  return <primitive object={model} />
}

function ApartmentVolumes({
  config,
  statuses,
  selectedId,
  onSelect,
}: Pick<Props, 'config' | 'statuses' | 'selectedId' | 'onSelect'>) {
  const [hoveredId, setHoveredId] = useState('')

  return (
    <group>
      {config.apartments.map((apartment) => {
        const position = config.unitPositions[apartment.ending]
        const status = statuses[apartment.id] ?? 'none'
        const isSelected = selectedId === apartment.id
        const isHovered = hoveredId === apartment.id
        const isFilled = status !== 'none'
        const color = isFilled ? STATUS_BY_ID[status].color : '#38bdf8'

        return (
          <mesh
            key={apartment.id}
            position={[
              position.x,
              config.floorBaseY +
                1.4 +
                (apartment.floor - 1) * config.floorHeight,
              position.z,
            ]}
            renderOrder={isSelected ? 12 : 10}
            onClick={(event) => {
              event.stopPropagation()
              onSelect(apartment.id)
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
              args={[position.width, config.floorHeight * 0.94, position.depth]}
            />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={isFilled ? 0.25 : isHovered || isSelected ? 0.1 : 0.001}
              depthWrite={false}
              depthTest={!isFilled && !isSelected}
              toneMapped={false}
            />
            {(isSelected || isHovered) && (
              <Edges
                color={isSelected ? '#ffffff' : '#7dd3fc'}
                linewidth={isSelected ? 2 : 1}
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
        config.floorBaseY +
          config.floorHeight +
          1.2 +
          (apartment.floor - 1) * config.floorHeight,
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
    ? props.config.floorBaseY +
      (selectedApartment.floor - 1) * props.config.floorHeight
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
        onSelect={props.onSelect}
      />
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

