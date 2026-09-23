import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, type ThreeEvent, useThree } from '@react-three/fiber'
import { Edges, Html, OrbitControls, useGLTF, useProgress } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import {
  APARTMENT_BY_ID,
  APARTMENTS,
  ENDING_MAP,
  STATUS_BY_ID,
  type ApartmentStatus,
} from '../config/building'

export type BuildingView = 'perspective' | 'front' | 'back' | 'east' | 'west'

type Props = {
  statuses: Record<string, ApartmentStatus>
  selectedId: string
  activeStatus: ApartmentStatus
  view: BuildingView
  onSelect: (id: string) => void
}

const VIEW_POSITIONS: Record<BuildingView, [number, number, number]> = {
  perspective: [146, 78, 146],
  front: [0, 64, 215],
  back: [0, 64, -215],
  east: [215, 64, 0],
  west: [-215, 64, 0],
}

function CameraController({ view }: { view: BuildingView }) {
  const { camera } = useThree()
  const controls = useRef<OrbitControlsImpl>(null)

  useEffect(() => {
    camera.position.set(...VIEW_POSITIONS[view])
    camera.lookAt(0, 62, 0)
    controls.current?.target.set(0, 62, 0)
    controls.current?.update()
  }, [camera, view])

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={[0, 62, 0]}
      enableDamping
      dampingFactor={0.07}
      minDistance={48}
      maxDistance={280}
      minPolarAngle={Math.PI * 0.12}
      maxPolarAngle={Math.PI * 0.88}
    />
  )
}

function BuildingModel() {
  const { scene } = useGLTF('/models/grupo15-parque-firenze.glb')
  const model = useMemo(() => scene.clone(true), [scene])

  useEffect(() => {
    model.traverse((object) => {
      object.castShadow = true
      object.receiveShadow = true
    })
  }, [model])

  return <primitive object={model} />
}

function ApartmentVolumes({
  statuses,
  selectedId,
  onSelect,
}: Pick<Props, 'statuses' | 'selectedId' | 'onSelect'>) {
  const [hoveredId, setHoveredId] = useState('')
  const selectedApartment = APARTMENT_BY_ID[selectedId]

  const handlePointer = (event: ThreeEvent<PointerEvent>, id: string) => {
    event.stopPropagation()
    setHoveredId(id)
  }

  return (
    <group>
      {APARTMENTS.map((apartment) => {
        const quadrant = ENDING_MAP[apartment.ending]
        const status = statuses[apartment.id] ?? 'none'
        const isSelected = selectedId === apartment.id
        const isHovered = hoveredId === apartment.id
        const isFilled = status !== 'none'
        const color = isFilled ? STATUS_BY_ID[status].color : '#38bdf8'
        const floorY = 9.76 + (apartment.floor - 1) * 3.05

        return (
          <mesh
            key={apartment.id}
            position={[quadrant.xSign * 8.05, floorY, quadrant.zSign * 6.45]}
            renderOrder={isSelected ? 12 : 10}
            onClick={(event) => {
              event.stopPropagation()
              onSelect(apartment.id)
            }}
            onPointerOver={(event) => handlePointer(event, apartment.id)}
            onPointerOut={(event) => {
              event.stopPropagation()
              setHoveredId('')
            }}
          >
            <boxGeometry args={[15.7, 2.78, 12.55]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={isFilled ? 0.27 : isHovered || isSelected ? 0.12 : 0.002}
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

      {selectedApartment && (
        <Html
          center
          position={[
            ENDING_MAP[selectedApartment.ending].xSign * 8.05,
            12 + (selectedApartment.floor - 1) * 3.05,
            ENDING_MAP[selectedApartment.ending].zSign * 6.45,
          ]}
          distanceFactor={90}
          style={{ pointerEvents: 'none' }}
        >
          <div className="scene-label">
            <strong>Apto {selectedApartment.id}</strong>
            <span>{STATUS_BY_ID[statuses[selectedId] ?? 'none'].label}</span>
          </div>
        </Html>
      )}
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
  return (
    <Canvas
      camera={{ position: VIEW_POSITIONS.perspective, fov: 38, near: 0.1, far: 700 }}
      dpr={[1, 1.75]}
      shadows
      gl={{ antialias: true, alpha: false }}
      onPointerMissed={() => undefined}
    >
      <color attach="background" args={['#08131f']} />
      <fog attach="fog" args={['#08131f', 190, 340]} />
      <ambientLight intensity={1.6} />
      <hemisphereLight args={['#dcefff', '#213044', 2.4]} />
      <directionalLight
        position={[70, 145, 85]}
        intensity={3.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={300}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={140}
        shadow-camera-bottom={-20}
      />

      <Suspense fallback={<LoadingModel />}>
        <BuildingModel />
      </Suspense>
      <ApartmentVolumes {...props} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.38, 0]} receiveShadow>
        <circleGeometry args={[90, 96]} />
        <meshStandardMaterial color="#0f2230" roughness={0.92} metalness={0.05} />
      </mesh>
      <gridHelper args={[180, 36, '#224357', '#142b3a']} position={[0, -0.36, 0]} />
      <CameraController view={props.view} />
    </Canvas>
  )
}

useGLTF.preload('/models/grupo15-parque-firenze.glb')

