import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { KeyRound, Volume2, VolumeX, X } from 'lucide-react'

export type Celebration = {
  apartmentId: string
  associateCode: string
  participant: string
  source: 'draw' | 'anticipator'
}

type Props = {
  celebration: Celebration
  onClose: () => void
}

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void>
}

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void>
}

const fullscreenElement = () => {
  const doc = document as FullscreenDocument
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null
}

const exitFullscreen = () => {
  const doc = document as FullscreenDocument
  const exit = document.exitFullscreen?.bind(document) ?? doc.webkitExitFullscreen?.bind(doc)
  return exit ? exit() : Promise.resolve()
}

const requestFullscreen = (element: HTMLElement) => {
  const target = element as FullscreenElement
  const request =
    element.requestFullscreen?.bind(element) ??
    target.webkitRequestFullscreen?.bind(target)
  return request ? request() : Promise.reject(new Error('Sem tela cheia'))
}

export function CelebrationOverlay({ celebration, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const backdropRef = useRef<HTMLDivElement | null>(null)
  const [muted, setMuted] = useState(false)
  const [host, setHost] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = false
    void video.play().catch(() => {
      // Sem interação recente o navegador bloqueia áudio; toca sem som.
      video.muted = true
      setMuted(true)
      void video.play().catch(() => undefined)
    })
  }, [celebration])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    const placeOverFullscreen = async () => {
      const current = fullscreenElement()
      if (
        current instanceof HTMLElement &&
        current.classList.contains('portal-live-stage')
      ) {
        if (!cancelled) setHost(current)
        return
      }
      const backdrop = backdropRef.current
      if (current && backdrop && current !== backdrop) {
        try {
          await requestFullscreen(backdrop)
        } catch {
          await exitFullscreen().catch(() => undefined)
        }
      }
      if (cancelled) return
      const next = fullscreenElement()
      setHost(
        next instanceof HTMLElement && next.classList.contains('portal-live-stage')
          ? next
          : null,
      )
    }
    void placeOverFullscreen()
    const onChange = () => {
      const next = fullscreenElement()
      setHost(
        next instanceof HTMLElement && next.classList.contains('portal-live-stage')
          ? next
          : null,
      )
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => {
      cancelled = true
      document.removeEventListener('fullscreenchange', onChange)
    }
  }, [celebration])

  const overlay = (
    <div
      ref={backdropRef}
      className="celebration-backdrop"
      role="dialog"
      aria-modal="true"
    >
      <section className="celebration-card">
        <button
          type="button"
          className="celebration-close"
          onClick={onClose}
          aria-label="Fechar"
        >
          <X size={18} />
        </button>
        <video
          ref={videoRef}
          src="/videos/formiga-parabens.mp4"
          playsInline
          onEnded={onClose}
        />
        <button
          type="button"
          className="celebration-sound"
          onClick={() => {
            const video = videoRef.current
            if (!video) return
            video.muted = !video.muted
            setMuted(video.muted)
          }}
          aria-label={muted ? 'Ativar som' : 'Silenciar'}
        >
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <div className="celebration-text">
          <span>
            {celebration.source === 'anticipator'
              ? 'Antecipador'
              : 'Sorteado'}
          </span>
          <h2>Parabéns, associado {celebration.associateCode}!</h2>
          {celebration.participant && <p>{celebration.participant}</p>}
          <strong>
            <KeyRound size={18} /> Apartamento {celebration.apartmentId}
          </strong>
        </div>
      </section>
    </div>
  )

  return host ? createPortal(overlay, host) : overlay
}
