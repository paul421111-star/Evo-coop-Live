import { useEffect, useRef, useState } from 'react'
import { Phone, PhoneOff } from 'lucide-react'
import { Device } from '@twilio/voice-sdk'
import { api } from '../api/client'

type Props = {
  phone: string | null
  configured?: boolean | null
  hint?: string
}

type VoiceCall = {
  disconnect: () => void
  on: (event: string, listener: (detail?: any) => void) => void
}

function physicalDevice<T extends { deviceId: string; label: string }>(devices: T[]) {
  const inputs = devices.filter(
    (item) => item.deviceId !== 'default' && item.deviceId !== 'communications',
  )
  return (
    inputs.find((item) => /fifine/i.test(item.label)) ??
    inputs.find((item) => /headset|fone|headphone/i.test(item.label)) ??
    inputs[0]
  )
}

function waitForMicrophones(device: Device) {
  return new Promise<void>((resolve) => {
    const ready = () => (device.audio?.availableInputDevices.size ?? 0) > 0
    if (ready()) {
      resolve()
      return
    }
    const timer = window.setInterval(() => {
      if (!ready()) return
      window.clearInterval(timer)
      window.clearTimeout(giveUp)
      resolve()
    }, 100)
    const giveUp = window.setTimeout(() => {
      window.clearInterval(timer)
      resolve()
    }, 2000)
  })
}

export function TwilioCallButton({
  phone,
  configured: knownConfigured,
  hint: knownHint = '',
}: Props) {
  const [fetchedConfigured, setConfigured] = useState<boolean | null>(null)
  const [fetchedHint, setHint] = useState('')
  const configured =
    knownConfigured === undefined ? fetchedConfigured : knownConfigured
  const hint = knownConfigured === undefined ? fetchedHint : knownHint
  const [busy, setBusy] = useState(false)
  const [live, setLive] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const callRef = useRef<VoiceCall | null>(null)
  const deviceRef = useRef<Device | null>(null)
  const cancelledRef = useRef(false)
  const microphoneRef = useRef('padrão do navegador')
  const mediaConnectedRef = useRef(false)

  useEffect(() => {
    if (knownConfigured !== undefined) return
    let cancelled = false
    void api
      .cobrancaVoiceStatus()
      .then(({ configured: ready, hint: message }) => {
        if (cancelled) return
        setConfigured(ready)
        setHint(message)
      })
      .catch(() => {
        if (!cancelled) setConfigured(false)
      })
    return () => {
      cancelled = true
    }
  }, [knownConfigured])

  useEffect(() => {
    setNotice('')
    setError('')
  }, [phone])

  useEffect(
    () => () => {
      callRef.current?.disconnect()
      deviceRef.current?.destroy()
    },
    [],
  )

  const destination = phone ? `+${phone.replace(/\D/g, '')}` : ''
  const unavailable =
    configured === false
      ? hint || 'A Twilio ainda não está configurada.'
      : !destination
        ? 'Este contato não possui número identificado.'
        : undefined

  const finish = (message: string, failed = false) => {
    setLive(false)
    setBusy(false)
    if (failed) {
      setError(message)
      setNotice('')
    } else {
      setNotice(message)
      setError('')
    }
    deviceRef.current?.destroy()
    deviceRef.current = null
    callRef.current = null
  }

  const call = async () => {
    if (!destination || configured !== true || live) return
    cancelledRef.current = false
    mediaConnectedRef.current = false
    setBusy(true)
    setError('')
    setNotice('Conectando o headset…')
    try {
      if (Device.audioContext?.state === 'suspended') {
        void Device.audioContext.resume()
      }
      const { token, iceServers } = await api.cobrancaVoiceToken()
      const preview = await navigator.mediaDevices.getUserMedia({ audio: true })
      preview.getTracks().forEach((track) => track.stop())
      const device = new Device(token, {
        edge: ['sao-paulo', 'ashburn'],
        forceAggressiveIceNomination: true,
      })
      deviceRef.current = device
      device.on('error', (deviceError) => {
        finish(
          deviceError.message || 'O navegador não conseguiu usar o microfone.',
          true,
        )
      })
      if (Device.audioContext?.state === 'suspended') {
        await Device.audioContext.resume()
      }
      await waitForMicrophones(device)
      const inputs = device.audio
        ? [...device.audio.availableInputDevices.values()]
        : []
      const microphone =
        physicalDevice(inputs) ??
        device.audio?.availableInputDevices.get('default')
      microphoneRef.current = microphone?.label || 'microfone padrão do Windows'
      if (device.audio && microphone) {
        await device.audio.setInputDevice(microphone.deviceId)
      }
      const outputs = device.audio
        ? [...device.audio.availableOutputDevices.values()]
        : []
      const speaker =
        physicalDevice(outputs) ??
        device.audio?.availableOutputDevices.get('default')
      if (device.audio && speaker) {
        await device.audio.speakerDevices.set(speaker.deviceId).catch(() => undefined)
      }
      setNotice(`Microfone da ligação: ${microphoneRef.current}.`)
      const current = (await device.connect({
        params: { To: destination },
        rtcConfiguration:
          iceServers.length > 0
            ? { iceServers, iceTransportPolicy: 'relay' }
            : undefined,
      })) as VoiceCall
      if (cancelledRef.current) {
        current.disconnect()
        device.destroy()
        return
      }
      callRef.current = current
      current.on('ringing', () => {
        setNotice(`Chamando o associado. Microfone: ${microphoneRef.current}.`)
      })
      current.on('accept', () => {
        setBusy(false)
        setLive(true)
        setNotice(`Em chamada. Microfone: ${microphoneRef.current}.`)
      })
      current.on('sample', (sample) => {
        if (
          sample &&
          (Number(sample.bytesSent) > 0 || Number(sample.bytesReceived) > 0)
        ) {
          mediaConnectedRef.current = true
        }
      })
      current.on('warning', (name) => {
        if (name === 'audio-input-level') {
          setError('O microfone não está enviando som.')
        } else if (name === 'audio-output-level') {
          setError('O fone não está recebendo o som da ligação.')
        } else if (name === 'ice-connectivity-lost') {
          setError('A rede bloqueou o áudio entre o computador e a Twilio.')
        }
      })
      current.on('disconnect', () =>
        finish(
          mediaConnectedRef.current
            ? 'A ligação foi encerrada.'
            : 'A rede não abriu o canal de áudio da Twilio. Libere WebRTC/TURN nesta rede.',
          !mediaConnectedRef.current,
        ),
      )
      current.on('cancel', () => finish('A ligação foi cancelada.', true))
      current.on('reject', () => finish('O associado não atendeu.', true))
    } catch (callError) {
      finish(
        callError instanceof Error
          ? callError.message
          : 'Não foi possível realizar a ligação.',
        true,
      )
    }
  }

  return (
    <form
      className="twilio-call is-compact"
      onSubmit={(event) => {
        event.preventDefault()
        if (live || busy) {
          cancelledRef.current = true
          callRef.current?.disconnect()
          if (!callRef.current) finish('A ligação foi cancelada.')
          return
        }
        if (Device.audioContext?.state === 'suspended') {
          void Device.audioContext.resume()
        }
        void call()
      }}
    >
      <button
        type="submit"
        className={live || busy ? 'is-stop' : ''}
        disabled={!live && !busy && (configured !== true || !destination)}
        title={unavailable}
      >
        {live || busy ? <PhoneOff size={15} /> : <Phone size={15} />}
        {live ? 'Desligar' : busy ? 'Cancelar' : 'Ligar'}
      </button>
      {(error || notice || unavailable) && (
        <small className={error || unavailable ? 'is-error' : ''}>
          {error || unavailable || notice}
        </small>
      )}
    </form>
  )
}
