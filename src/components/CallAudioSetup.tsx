import { useEffect, useRef, useState } from 'react'
import { Headphones, RefreshCw, Volume2 } from 'lucide-react'

export type CallAudioRouting = {
  headsetInputId: string
  headsetOutputId: string
  ucaInputId: string
  ucaOutputId: string
}

export const EMPTY_CALL_AUDIO_ROUTING: CallAudioRouting = {
  headsetInputId: '',
  headsetOutputId: '',
  ucaInputId: '',
  ucaOutputId: '',
}

export const CALL_AUDIO_ROUTING_KEY = 'evo-coop-call-audio-routing'

export function loadCallAudioRouting(): CallAudioRouting {
  try {
    return {
      ...EMPTY_CALL_AUDIO_ROUTING,
      ...JSON.parse(window.localStorage.getItem(CALL_AUDIO_ROUTING_KEY) ?? '{}'),
    }
  } catch {
    return EMPTY_CALL_AUDIO_ROUTING
  }
}

type Props = {
  value: CallAudioRouting
  onChange: (routing: CallAudioRouting) => void
  disabled?: boolean
}

type Meter = 'headset' | 'uca'

function isUca(device: MediaDeviceInfo) {
  return /uca|usb audio codec|behringer/i.test(device.label)
}

function isHeadset(device: MediaDeviceInfo) {
  return /fifine|headset|fone|headphone|el-1641/i.test(device.label)
}

function preferred(
  devices: MediaDeviceInfo[],
  type: 'headset' | 'uca',
  current: string,
) {
  if (devices.some((device) => device.deviceId === current)) return current
  const physical = devices.filter(
    (device) =>
      device.deviceId !== 'default' && device.deviceId !== 'communications',
  )
  if (type === 'uca') {
    return physical.find(isUca)?.deviceId ?? ''
  }
  return (
    physical.find(isHeadset)?.deviceId ??
    physical.find((device) => !isUca(device))?.deviceId ??
    devices.find((device) => device.deviceId === 'default')?.deviceId ??
    ''
  )
}

function deviceLabel(device: MediaDeviceInfo, index: number) {
  return device.label || `Dispositivo ${index + 1}`
}

export function CallAudioSetup({ value, onChange, disabled = false }: Props) {
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([])
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([])
  const [message, setMessage] = useState('')
  const [meters, setMeters] = useState<Record<Meter, number>>({
    headset: 0,
    uca: 0,
  })
  const testingRef = useRef<MediaStream[]>([])
  const valueRef = useRef(value)
  valueRef.current = value

  const update = (next: CallAudioRouting) => {
    onChange(next)
    window.localStorage.setItem(CALL_AUDIO_ROUTING_KEY, JSON.stringify(next))
  }

  const enumerate = async (requestPermission = false) => {
    setMessage('')
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        throw new Error('Abra esta tela por HTTPS para selecionar o áudio.')
      }
      if (requestPermission) {
        const permission = await navigator.mediaDevices.getUserMedia({ audio: true })
        permission.getTracks().forEach((track) => track.stop())
      }
      const devices = await navigator.mediaDevices.enumerateDevices()
      const nextInputs = devices.filter((device) => device.kind === 'audioinput')
      const nextOutputs = devices.filter((device) => device.kind === 'audiooutput')
      setInputs(nextInputs)
      setOutputs(nextOutputs)
      const current = valueRef.current
      const next = {
        headsetInputId: preferred(nextInputs, 'headset', current.headsetInputId),
        headsetOutputId: preferred(nextOutputs, 'headset', current.headsetOutputId),
        ucaInputId: preferred(nextInputs, 'uca', current.ucaInputId),
        ucaOutputId: preferred(nextOutputs, 'uca', current.ucaOutputId),
      }
      if (JSON.stringify(next) !== JSON.stringify(current)) update(next)
      if (requestPermission) {
        setMessage(
          next.ucaInputId && next.ucaOutputId
            ? 'Headset e UCA222 identificados.'
            : 'Selecione manualmente a entrada e a saída da UCA222.',
        )
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível listar o áudio.')
    }
  }

  useEffect(() => {
    void enumerate(false)
    const changed = () => void enumerate(false)
    navigator.mediaDevices?.addEventListener('devicechange', changed)
    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', changed)
      testingRef.current.forEach((stream) =>
        stream.getTracks().forEach((track) => track.stop()),
      )
    }
  }, [])

  const testInput = async (deviceId: string, meter: Meter) => {
    if (!deviceId) return
    setMessage('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: deviceId },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
      testingRef.current.push(stream)
      const context = new AudioContext()
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      context.createMediaStreamSource(stream).connect(analyser)
      const samples = new Uint8Array(analyser.frequencyBinCount)
      const started = performance.now()
      const draw = () => {
        analyser.getByteFrequencyData(samples)
        const peak = Math.max(...samples) / 255
        setMeters((current) => ({ ...current, [meter]: peak }))
        if (performance.now() - started < 4000) {
          window.requestAnimationFrame(draw)
          return
        }
        stream.getTracks().forEach((track) => track.stop())
        testingRef.current = testingRef.current.filter((item) => item !== stream)
        void context.close()
        setMeters((current) => ({ ...current, [meter]: 0 }))
      }
      draw()
    } catch {
      setMessage('Não foi possível abrir esta entrada de áudio.')
    }
  }

  const testOutput = async (deviceId: string) => {
    if (!deviceId) return
    setMessage('')
    const context = new AudioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const destination = context.createMediaStreamDestination()
    const audio = new Audio()
    try {
      gain.gain.value = 0.08
      oscillator.frequency.value = 660
      oscillator.connect(gain).connect(destination)
      audio.srcObject = destination.stream
      const sinkAudio = audio as HTMLAudioElement & {
        setSinkId?: (id: string) => Promise<void>
      }
      if (!sinkAudio.setSinkId) {
        throw new Error('Este navegador não permite escolher a saída.')
      }
      await sinkAudio.setSinkId(deviceId)
      await audio.play()
      oscillator.start()
      oscillator.stop(context.currentTime + 0.5)
      await new Promise((resolve) => window.setTimeout(resolve, 650))
      audio.pause()
      setMessage('Tom de teste reproduzido.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'A saída não respondeu.')
    } finally {
      audio.srcObject = null
      void context.close()
    }
  }

  const field = (
    label: string,
    key: keyof CallAudioRouting,
    devices: MediaDeviceInfo[],
    test: () => void,
    meter?: Meter,
  ) => (
    <label>
      <span>{label}</span>
      <select
        value={value[key]}
        disabled={disabled}
        onChange={(event) => update({ ...value, [key]: event.target.value })}
      >
        <option value="">Selecione…</option>
        {devices.map((device, index) => (
          <option key={device.deviceId} value={device.deviceId}>
            {deviceLabel(device, index)}
          </option>
        ))}
      </select>
      <button type="button" disabled={disabled || !value[key]} onClick={test}>
        {meter ? <Headphones size={14} /> : <Volume2 size={14} />}
        Testar
      </button>
      {meter && (
        <span className="call-audio-meter" aria-label={`Nível ${label}`}>
          <i style={{ width: `${Math.round(meters[meter] * 100)}%` }} />
        </span>
      )}
    </label>
  )

  return (
    <section className="call-audio-setup">
      <header>
        <div>
          <strong>Controle de áudio da live</strong>
          <small>
            Toda ligação começa privada. A UCA222 só é aberta ao colocar no ar.
          </small>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => void enumerate(true)}
        >
          <RefreshCw size={14} /> Detectar dispositivos
        </button>
      </header>
      <div className="call-audio-device-grid">
        {field('Microfone do headset', 'headsetInputId', inputs, () =>
          void testInput(value.headsetInputId, 'headset'), 'headset')}
        {field('Fone do headset', 'headsetOutputId', outputs, () =>
          void testOutput(value.headsetOutputId))}
        {field('Entrada da UCA222', 'ucaInputId', inputs, () =>
          void testInput(value.ucaInputId, 'uca'), 'uca')}
        {field('Saída da UCA222', 'ucaOutputId', outputs, () =>
          void testOutput(value.ucaOutputId))}
      </div>
      {message && <small className="call-audio-message">{message}</small>}
      <details className="call-audio-checklist">
        <summary>Ensaio obrigatório antes da live</summary>
        <ol>
          <li>Deixe o monitor direto da UCA222 desligado.</li>
          <li>
            Confirme que o canal do associado não retorna ao AUX que alimenta a
            entrada da UCA222.
          </li>
          <li>
            Faça uma ligação de teste e confirme que a verificação privada sai
            somente no headset.
          </li>
          <li>
            Coloque no ar e confira lapelas no celular e associado no
            headset, mesa e live privada.
          </li>
          <li>
            Segure o talkback, solte, volte ao privado e confira a gravação do
            contrato.
          </li>
        </ol>
      </details>
    </section>
  )
}
