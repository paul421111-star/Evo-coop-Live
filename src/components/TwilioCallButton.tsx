import { useEffect, useRef, useState } from 'react'
import { Headphones, Mic, Phone, PhoneOff, Radio, Undo2 } from 'lucide-react'
import { Device } from '@twilio/voice-sdk'
import { api } from '../api/client'
import {
  loadCallAudioRouting,
  type CallAudioRouting,
} from './CallAudioSetup'
import {
  applyCallAudioRoute,
  type RoutedCallMode,
} from './callAudioRouting'

type Props = {
  phone: string | null
  associateCode?: string
  building?: string
  recordCalls?: boolean
  onRecorded?: () => void
  configured?: boolean | null
  hint?: string
  audioRouting?: CallAudioRouting
  locked?: boolean
  onActiveChange?: (active: boolean) => void
}

type CallMode =
  | 'idle'
  | 'connecting'
  | 'private'
  | 'onAir'
  | 'talkback'
  | 'switching'

type VoiceCall = {
  parameters?: Record<string, string>
  disconnect: () => void
  on: (event: string, listener: (detail?: any) => void) => void
}

let activeBrowserCall = ''

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
  associateCode = '',
  building = '',
  recordCalls = false,
  onRecorded,
  configured: knownConfigured,
  hint: knownHint = '',
  audioRouting = loadCallAudioRouting(),
  locked = false,
  onActiveChange,
}: Props) {
  const [fetchedConfigured, setConfigured] = useState<boolean | null>(null)
  const [fetchedHint, setHint] = useState('')
  const configured =
    knownConfigured === undefined ? fetchedConfigured : knownConfigured
  const hint = knownConfigured === undefined ? fetchedHint : knownHint
  const [busy, setBusy] = useState(false)
  const [live, setLive] = useState(false)
  const [mode, setMode] = useState<CallMode>('idle')
  const [inputLevel, setInputLevel] = useState(0)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const callRef = useRef<VoiceCall | null>(null)
  const deviceRef = useRef<Device | null>(null)
  const cancelledRef = useRef(false)
  const microphoneRef = useRef('padrão do navegador')
  const mediaConnectedRef = useRef(false)
  const switchingRef = useRef(false)
  const routedModeRef = useRef<RoutedCallMode>('private')
  const desiredModeRef = useRef<RoutedCallMode>('private')
  const talkbackHeldRef = useRef(false)

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
      if (activeBrowserCall === callOwner) activeBrowserCall = ''
      onActiveChange?.(false)
    },
    [],
  )

  useEffect(() => {
    const releaseTalkback = () => {
      if (!talkbackHeldRef.current) return
      talkbackHeldRef.current = false
      desiredModeRef.current = 'onAir'
      void setCallRoute('onAir')
    }
    window.addEventListener('pointerup', releaseTalkback)
    window.addEventListener('pointercancel', releaseTalkback)
    window.addEventListener('blur', releaseTalkback)
    return () => {
      window.removeEventListener('pointerup', releaseTalkback)
      window.removeEventListener('pointercancel', releaseTalkback)
      window.removeEventListener('blur', releaseTalkback)
    }
  }, [audioRouting])

  const destination = phone ? `+${phone.replace(/\D/g, '')}` : ''
  const callOwner = associateCode || destination
  const unavailable =
    configured === false
      ? hint || 'A Twilio ainda não está configurada.'
      : !destination
        ? 'Este contato não possui número identificado.'
        : locked
          ? 'Já existe outra ligação ativa neste computador.'
          : !audioRouting.headsetInputId || !audioRouting.headsetOutputId
            ? 'Selecione o microfone e o fone do headset antes de ligar.'
        : undefined

  const finish = (message: string, failed = false) => {
    setLive(false)
    setBusy(false)
    setMode('idle')
    setInputLevel(0)
    if (failed) {
      setError(message)
      setNotice('')
    } else {
      setNotice(message)
      setError('')
    }
    const device = deviceRef.current
    if (device?.audio) {
      void device.audio
        .unsetInputDevice()
        .catch(() => undefined)
        .finally(() => device.destroy())
    } else {
      device?.destroy()
    }
    deviceRef.current = null
    callRef.current = null
    switchingRef.current = false
    talkbackHeldRef.current = false
    if (activeBrowserCall === callOwner) activeBrowserCall = ''
    onActiveChange?.(false)
  }

  const setCallRoute = async (target: RoutedCallMode) => {
    desiredModeRef.current = target
    if (switchingRef.current) return
    const device = deviceRef.current
    if (!device?.audio) return
    switchingRef.current = true
    try {
      while (desiredModeRef.current !== routedModeRef.current) {
        const next = desiredModeRef.current
        setMode('switching')
        await applyCallAudioRoute(device.audio, audioRouting, next)
        routedModeRef.current = next
        setMode(next)
        setError('')
      }
    } catch (routeError) {
      desiredModeRef.current = 'private'
      try {
        await applyCallAudioRoute(device.audio, audioRouting, 'private')
        routedModeRef.current = 'private'
        setMode('private')
        setError(
          `${routeError instanceof Error ? routeError.message : 'A troca de áudio falhou.'} A ligação voltou ao privado.`,
        )
      } catch {
        callRef.current?.disconnect()
        finish('Os dispositivos de áudio foram desconectados.', true)
      }
    } finally {
      switchingRef.current = false
      if (desiredModeRef.current !== routedModeRef.current) {
        void setCallRoute(desiredModeRef.current)
      }
    }
  }

  const call = async () => {
    if (activeBrowserCall && activeBrowserCall !== callOwner) {
      setError('Já existe outra ligação ativa neste navegador.')
      return
    }
    if (
      !destination ||
      configured !== true ||
      live ||
      locked ||
      !audioRouting.headsetInputId ||
      !audioRouting.headsetOutputId
    ) {
      return
    }
    cancelledRef.current = false
    mediaConnectedRef.current = false
    setBusy(true)
    setMode('connecting')
    setError('')
    setNotice('Conectando o headset…')
    activeBrowserCall = callOwner
    onActiveChange?.(true)
    try {
      if (Device.audioContext?.state === 'suspended') {
        void Device.audioContext.resume()
      }
      const { token, iceServers } = await api.cobrancaVoiceToken()
      if (!navigator.mediaDevices?.getUserMedia) {
        finish(
          'O microfone só abre em https://localhost:4173. Abra a cobrança por esse endereço.',
          true,
        )
        return
      }
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
      device.audio?.on('inputVolume', (volume) => {
        setInputLevel(Math.min(1, Math.max(0, Number(volume) || 0)))
      })
      device.audio?.on('deviceChange', (lostDevices: MediaDeviceInfo[]) => {
        const lost = new Set(lostDevices.map((item) => item.deviceId))
        if (
          lost.has(audioRouting.headsetInputId) ||
          lost.has(audioRouting.headsetOutputId)
        ) {
          callRef.current?.disconnect()
          finish('O headset foi desconectado e a ligação foi encerrada.', true)
          return
        }
        if (
          routedModeRef.current !== 'private' &&
          (lost.has(audioRouting.ucaInputId) ||
            lost.has(audioRouting.ucaOutputId))
        ) {
          setNotice('A UCA222 foi desconectada. A ligação voltou ao privado.')
          void setCallRoute('private')
        }
      })
      if (Device.audioContext?.state === 'suspended') {
        await Device.audioContext.resume()
      }
      await waitForMicrophones(device)
      const microphone = device.audio?.availableInputDevices.get(
        audioRouting.headsetInputId,
      )
      if (!microphone) {
        throw new Error(
          'O microfone escolhido não está conectado. Detecte os dispositivos novamente.',
        )
      }
      microphoneRef.current = microphone?.label || 'microfone padrão do Windows'
      if (device.audio && microphone) {
        await device.audio.setInputDevice(microphone.deviceId)
      }
      const speaker = device.audio?.availableOutputDevices.get(
        audioRouting.headsetOutputId,
      )
      if (!speaker) {
        throw new Error(
          'O fone escolhido não está conectado. Detecte os dispositivos novamente.',
        )
      }
      if (device.audio && speaker) {
        await device.audio.speakerDevices.set(speaker.deviceId).catch(() => undefined)
      }
      setNotice(`Microfone da ligação: ${microphoneRef.current}.`)
      const current = (await device.connect({
        params: {
          To: destination,
          Record: recordCalls ? '1' : '0',
        },
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
      const rememberRecording = async () => {
        const callSid = current.parameters?.CallSid
        if (!recordCalls || !callSid || !associateCode || !building) return
        await api.saveCallRecording({
          building,
          associateCode,
          phone: destination,
          callSid,
        })
        return callSid
      }
      current.on('ringing', () => {
        setNotice(`Chamando o associado. Microfone: ${microphoneRef.current}.`)
      })
      current.on('accept', () => {
        setBusy(false)
        setLive(true)
        routedModeRef.current = 'private'
        desiredModeRef.current = 'private'
        setMode('private')
        setNotice(
          recordCalls
            ? `Em chamada e gravando. Microfone: ${microphoneRef.current}.`
            : `Em chamada. Microfone: ${microphoneRef.current}.`,
        )
        void rememberRecording().catch(() => undefined)
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
      current.on('disconnect', () => {
        const callSid = current.parameters?.CallSid
        finish(
          mediaConnectedRef.current
            ? recordCalls
              ? 'A ligação foi encerrada. A gravação fica neste contrato.'
              : 'A ligação foi encerrada.'
            : 'A rede não abriu o canal de áudio da Twilio. Libere WebRTC/TURN nesta rede.',
          !mediaConnectedRef.current,
        )
        if (!recordCalls || !callSid) return
        void (async () => {
          try {
            await api.saveCallRecording({
              building,
              associateCode,
              phone: destination,
              callSid,
            })
            for (let attempt = 0; attempt < 8; attempt += 1) {
              const saved = await api.syncCallRecording(callSid)
              if (saved.recordingSid) break
              await new Promise((resolve) => window.setTimeout(resolve, 5000))
            }
            onRecorded?.()
          } catch {
            onRecorded?.()
          }
        })()
      })
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
      className={`twilio-call is-compact mode-${mode}`}
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
        disabled={!live && !busy && Boolean(unavailable)}
        title={unavailable}
      >
        {live || busy ? <PhoneOff size={15} /> : <Phone size={15} />}
        {live ? 'Desligar' : busy ? 'Cancelar' : 'Ligar'}
      </button>
      {live && (
        <div className="twilio-live-controls">
          <span className={`twilio-mode is-${mode}`}>
            {mode === 'private' && <Headphones size={14} />}
            {mode === 'onAir' && <Radio size={14} />}
            {mode === 'talkback' && <Mic size={14} />}
            {mode === 'switching' && <Undo2 size={14} />}
            {mode === 'private'
              ? 'Conversa privada'
              : mode === 'onAir'
                ? 'Associado no ar'
                : mode === 'talkback'
                  ? 'Falando só com convidado'
                  : 'Trocando áudio…'}
          </span>
          <span className="twilio-input-meter" aria-label="Nível enviado à ligação">
            <i style={{ width: `${Math.round(inputLevel * 100)}%` }} />
          </span>
          {mode === 'private' ? (
            <button
              type="button"
              className="is-on-air"
              onClick={() => void setCallRoute('onAir')}
            >
              <Radio size={14} /> Colocar no ar
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={mode === 'switching'}
                onClick={() => void setCallRoute('private')}
              >
                <Undo2 size={14} /> Voltar ao privado
              </button>
              <button
                type="button"
                className={mode === 'talkback' ? 'is-talkback active' : 'is-talkback'}
                disabled={mode === 'switching'}
                onPointerDown={(event) => {
                  event.preventDefault()
                  talkbackHeldRef.current = true
                  void setCallRoute('talkback')
                }}
                onKeyDown={(event) => {
                  if (
                    event.repeat ||
                    (event.key !== ' ' && event.key !== 'Enter')
                  ) {
                    return
                  }
                  event.preventDefault()
                  talkbackHeldRef.current = true
                  void setCallRoute('talkback')
                }}
                onKeyUp={(event) => {
                  if (event.key !== ' ' && event.key !== 'Enter') return
                  event.preventDefault()
                  talkbackHeldRef.current = false
                  void setCallRoute('onAir')
                }}
              >
                <Mic size={14} /> Segure para falar
              </button>
            </>
          )}
        </div>
      )}
      {(error || notice || unavailable) && (
        <small className={error || unavailable ? 'is-error' : ''}>
          {error || unavailable || notice}
        </small>
      )}
    </form>
  )
}
