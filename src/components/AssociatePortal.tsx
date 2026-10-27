import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  BookOpen,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Check,
  Clock3,
  HelpCircle,
  Lock,
  LogOut,
  Maximize,
  Minimize,
  Minus,
  Plus,
  Radio,
  RefreshCw,
  ShieldCheck,
  Trophy,
  X,
} from 'lucide-react'
import { api } from '../api/client'
import type {
  AnticipationSessionStatus,
  AssociatePortalView,
} from '../config/anticipation'
import { youtubeEmbedUrl } from '../config/anticipation'
import {
  normalizeWhatsappPhone,
  phoneFieldValue,
} from '../config/collectionNotice'
import { AssociateDrawPanel } from './AssociateDrawPanel'
import { Grupo12Gallery } from './Grupo12Gallery'
import { CelebrationOverlay } from './CelebrationOverlay'
import { SiteFooter } from './SiteFooter'

const MIN_INSTALLMENTS = 10
const MAX_INSTALLMENTS = 30
const PRESETS = [10, 15, 20, 25, 30]

const PORTAL_TOUR_STEPS = [
  {
    selector: '.portal-topbar',
    title: 'Seu portal do associado',
    text: 'Aqui você vê o período da sessão, a situação atual do ranking e pode sair com segurança. O portal atualiza os dados automaticamente.',
  },
  {
    selector: '.portal-hero',
    title: 'Sua posição e seus números',
    text: 'Esta área mostra sua posição atual, as parcelas já pagas, as que você informou para antecipar e o total usado para ordenar o ranking.',
    optional: true,
  },
  {
    selector: '.portal-decision',
    title: 'Informe sua antecipação',
    text: 'Escolha as parcelas desta rodada e digite o celular do cadastro. O total, somando o que já foi antecipado em eventos anteriores, não passa de 30. Enquanto o ranking estiver aberto, a lista é reordenada ao salvar.',
    optional: true,
  },
  {
    selector: '.g12-gallery',
    title: 'Galeria do Grupo 12',
    text: 'As fotos e plantas do Grupo 12 aparecem conforme você desce. Clique em uma imagem para ampliar.',
    optional: true,
  },
  {
    selector: '.portal-deadline',
    title: 'Prazo para decidir',
    text: 'Estes botões só aparecem depois que as antecipações forem travadas. A quantidade fica congelada: você só pode manter ou não antecipar.',
    optional: true,
  },
  {
    selector: '.portal-ranking-intro',
    title: 'Ranking ao vivo',
    text: 'O ranking soma parcelas pagas e antecipadas. Em empate, o menor contrato fica à frente. As primeiras posições indicadas na tela participam como antecipadores.',
    optional: true,
  },
  {
    selector: '.draw-board',
    title: 'Escolha ao vivo',
    text: 'Durante o sorteio, o código da vez e os apartamentos ficam ao lado da transmissão. O número muda junto com o operador. O nome do associado não aparece.',
    optional: true,
  },
  {
    selector: '.portal-live',
    title: 'Acompanhe a transmissão',
    text: 'Quando a cooperativa publicar a transmissão, ela aparece aqui. Se a incorporação não estiver disponível, use o botão para abrir a live em outra aba.',
    optional: true,
  },
] as const

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))

const offerLabel = (status: string) => {
  if (status === 'confirmed') return 'Confirmada'
  if (status === 'withdrawn') return 'Não vai antecipar'
  return 'Antecipação informada'
}

const portalHeading = (portal: AssociatePortalView) => {
  if (portal.status !== 'active') return portal.title
  const group = portal.drawGroup ? `do Grupo ${portal.drawGroup}` : ''
  const block = portal.blockLabel
    ? portal.blockLabel.toLowerCase().startsWith('bloco')
      ? ` · ${portal.blockLabel}`
      : ` · Bloco ${portal.blockLabel}`
    : ''
  return `Sorteio ${group}${block}`.replace(/\s+/g, ' ').trim()
}

const sessionLabel = (status: AnticipationSessionStatus) => {
  if (status === 'active') return 'Escolha em andamento'
  if (status === 'locked') return 'Antecipações encerradas'
  if (status === 'closed') return 'Sessão encerrada'
  return 'Ranking aberto'
}

export function AssociatePortal() {
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<AssociatePortalView | null>(null)
  const [associateCode, setAssociateCode] = useState('')
  const [documentTail, setDocumentTail] = useState('')
  const [answer, setAnswer] = useState('')
  const [challenge, setChallenge] = useState<{
    id: string
    question: string
  } | null>(null)
  const [contactCheck, setContactCheck] = useState<{
    confirmationId: string
    channels: Array<{
      channel: 'phone' | 'email'
      label: string
      available: boolean
      mask: string
    }>
    selected: 'phone' | 'email' | null
    draft: string
  } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [offerAmount, setOfferAmount] = useState(0)
  const [offerText, setOfferText] = useState('')
  const [phoneDraft, setPhoneDraft] = useState('')
  const [phoneMatches, setPhoneMatches] = useState(false)
  const [phoneChecked, setPhoneChecked] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const [pendingDecision, setPendingDecision] = useState<
    'confirm' | 'withdraw' | null
  >(null)
  const [heroVisible, setHeroVisible] = useState(true)
  const [tourStep, setTourStep] = useState<number | null>(null)
  const [tourRect, setTourRect] = useState<DOMRect | null>(null)
  const [celebration, setCelebration] = useState<{
    apartmentId: string
    associateCode: string
    source: 'draw' | 'anticipator'
  } | null>(null)
  const seenApartment = useRef<string | null | undefined>(undefined)
  const portalRef = useRef<HTMLElement | null>(null)
  const heroRef = useRef<HTMLElement | null>(null)
  const myRowRef = useRef<HTMLLIElement | null>(null)
  const liveStageRef = useRef<HTMLDivElement | null>(null)
  const [liveFullscreen, setLiveFullscreen] = useState(false)

  const loadChallenge = async () => {
    const next = await api.portalChallenge()
    setChallenge(next)
    setAnswer('')
  }

  const loadView = async () => {
    const data = await api.portalView()
    setView(data)
    setSignedIn(true)
    if (data.you) {
      setOfferAmount(data.you.offeredInstallments)
      setOfferText(
        data.you.offeredInstallments > 0
          ? String(data.you.offeredInstallments)
          : '',
      )
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        await loadView()
      } catch {
        setView(null)
        setSignedIn(false)
        setChallenge(null)
        setAnswer('')
      } finally {
        setReady(true)
      }
    })()
  }, [])

  useEffect(() => {
    if (!signedIn) return
    const timer = window.setInterval(() => {
      void api
        .portalView()
        .then((data) => {
          setView(data)
        })
        .catch(() => undefined)
    }, 3000)
    return () => window.clearInterval(timer)
  }, [signedIn])

  const hasHero = Boolean(view?.you)

  const availableTourSteps = PORTAL_TOUR_STEPS.filter(
    (step) =>
      !('optional' in step) ||
      Boolean(document.querySelector<HTMLElement>(step.selector)),
  )
  const closeTour = (completed = false) => {
    if (completed && view?.you) {
      window.localStorage.setItem(
        `evo-coop-associate-tour:${view.you.associateCode}`,
        'seen',
      )
    }
    setTourStep(null)
    setTourRect(null)
  }

  useEffect(() => {
    if (!signedIn || !view?.you || tourStep !== null) return
    const key = `evo-coop-associate-tour:${view.you.associateCode}`
    if (window.localStorage.getItem(key) === 'seen') return
    const timer = window.setTimeout(() => setTourStep(0), 450)
    return () => window.clearTimeout(timer)
  }, [signedIn, tourStep, view?.you])

  useEffect(() => {
    if (tourStep === null) return
    const step = availableTourSteps[tourStep]
    if (!step) {
      closeTour(true)
      return
    }
    const target = document.querySelector<HTMLElement>(step.selector)
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const update = () => setTourRect(target.getBoundingClientRect())
    const timer = window.setTimeout(update, 420)
    window.addEventListener('resize', update)
    portalRef.current?.addEventListener('scroll', update)
    update()
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', update)
      portalRef.current?.removeEventListener('scroll', update)
    }
  }, [tourStep])

  useEffect(() => {
    if (!view?.you || view.status !== 'active') return
    const current = view.you.apartmentId ?? null
    if (seenApartment.current === undefined) {
      seenApartment.current = current
      return
    }
    if (!seenApartment.current && current) {
      setCelebration({
        apartmentId: current,
        associateCode: view.you.associateCode,
        source: view.you.choiceSource === 'anticipator' ? 'anticipator' : 'draw',
      })
    }
    seenApartment.current = current
  }, [view])

  useEffect(() => {
    const onChange = () => {
      setLiveFullscreen(document.fullscreenElement === liveStageRef.current)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  useEffect(() => {
    const hero = heroRef.current
    if (!hasHero || !hero) return
    const observer = new IntersectionObserver(
      ([entry]) => setHeroVisible(entry.isIntersecting),
      { root: portalRef.current, threshold: 0.35 },
    )
    observer.observe(hero)
    return () => observer.disconnect()
  }, [hasHero])

  const submitAccess = async (event: FormEvent) => {
    event.preventDefault()
    if (!challenge) return
    setBusy(true)
    setError('')
    try {
      const pending = await api.portalAccess({
        associateCode,
        documentTail,
        challengeId: challenge.id,
        answer: Number(answer),
      })
      setContactCheck({
        confirmationId: pending.confirmationId,
        channels: pending.channels,
        selected: null,
        draft: '',
      })
    } catch (accessError) {
      setError(
        accessError instanceof Error
          ? accessError.message
          : 'Não foi possível identificar o associado.',
      )
      await loadChallenge().catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }

  const submitContact = async (event: FormEvent) => {
    event.preventDefault()
    if (!contactCheck?.selected) return
    setBusy(true)
    setError('')
    try {
      await api.portalConfirm(
        contactCheck.confirmationId,
        contactCheck.selected,
        contactCheck.draft,
      )
      setContactCheck(null)
      await loadView()
    } catch (confirmError) {
      setError(
        confirmError instanceof Error
          ? confirmError.message
          : 'Não foi possível confirmar o contato.',
      )
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!signedIn) return
    const normalized = normalizeWhatsappPhone(phoneDraft)
    if (!normalized) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void api
        .portalPhoneCheck(phoneDraft)
        .then((result) => {
          if (cancelled) return
          setPhoneMatches(result.matches)
          setPhoneChecked(true)
        })
        .catch(() => {
          if (cancelled) return
          setPhoneMatches(false)
          setPhoneChecked(false)
        })
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [phoneDraft, signedIn])

  const applyOfferText = (raw: string) => {
    const cap = Math.max(
      0,
      MAX_INSTALLMENTS - (view?.you?.anticipatedInstallments ?? 0),
    )
    const digits = raw.replace(/\D/g, '').replace(/^0+/, '').slice(0, 2)
    const amount = digits === '' ? 0 : Math.min(cap, Number(digits))
    setOfferText(amount === 0 ? '' : String(amount))
    setOfferAmount(amount)
  }

  const saveOffer = async () => {
    const cap = Math.max(
      0,
      MAX_INSTALLMENTS - (view?.you?.anticipatedInstallments ?? 0),
    )
    if (offerAmount < MIN_INSTALLMENTS || offerAmount > cap) return
    setBusy(true)
    setError('')
    try {
      await api.portalOffer('set', offerAmount, phoneDraft)
      await loadView()
      setNotice(
        `Ranking atualizado: ${offerAmount} parcela${offerAmount === 1 ? '' : 's'} antecipando.`,
      )
    } catch (offerError) {
      setError(
        offerError instanceof Error
          ? offerError.message
          : 'Não foi possível atualizar as parcelas.',
      )
    } finally {
      setBusy(false)
    }
  }

  const decide = async (action: 'confirm' | 'withdraw') => {
    setBusy(true)
    setError('')
    try {
      await api.portalOffer(action)
      await loadView()
      setPendingDecision(null)
      setNotice(
        action === 'confirm'
          ? 'Antecipação mantida. Você permanece nesta posição.'
          : 'Antecipação recusada. Nenhuma parcela será antecipada.',
      )
    } catch (offerError) {
      setError(
        offerError instanceof Error
          ? offerError.message
          : 'Não foi possível registrar a decisão.',
      )
    } finally {
      setBusy(false)
    }
  }

  if (!ready) {
    return (
      <main className="associate-portal">
        <p className="associate-loading">Carregando portal do associado…</p>
      </main>
    )
  }

  if (!view) {
    return (
      <main className="associate-portal">
        <section className="associate-card">
          <img
            className="login-brand"
            src="/vida-nova-30-anos.png"
            alt="Cooperativa Habitacional Vida Nova — 30 anos"
          />
          <span className="eyebrow">Portal do associado</span>
          <h1>Antecipe e acompanhe o ranking</h1>
          <p>
            Informe o contrato e os 5 últimos dígitos do CPF. Depois você
            confirma o celular ou o e-mail do cadastro.
          </p>
          {contactCheck ? (
            <form onSubmit={(event) => void submitContact(event)}>
              {contactCheck.selected === null ? (
                <>
                  <p className="portal-contact-lead">
                    Escolha o contato para confirmar. A tela mostra só um
                    pedaço do que está no cadastro.
                  </p>
                  <div className="portal-contact-choices">
                    {contactCheck.channels.map((item) => (
                      <button
                        key={item.channel}
                        type="button"
                        className="portal-contact-choice"
                        disabled={!item.available}
                        onClick={() =>
                          setContactCheck({
                            ...contactCheck,
                            selected: item.channel,
                            draft: '',
                          })
                        }
                      >
                        <strong>{item.label}</strong>
                        <small>
                          {item.available
                            ? 'Confirmar este contato'
                            : 'Não cadastrado'}
                        </small>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <p className="portal-contact-lead">
                    {contactCheck.selected === 'phone'
                      ? 'Digite o celular completo. Só os dois últimos números aparecem.'
                      : 'Digite o e-mail completo. Só um pedaço aparece.'}
                  </p>
                  <p className="portal-contact-mask">
                    {contactCheck.channels.find(
                      (item) => item.channel === contactCheck.selected,
                    )?.mask || 'Não cadastrado'}
                  </p>
                  {contactCheck.channels.find(
                    (item) => item.channel === contactCheck.selected,
                  )?.available ? (
                    <label className="login-field">
                      <span>
                        {contactCheck.selected === 'phone'
                          ? 'Número completo'
                          : 'E-mail completo'}
                      </span>
                      <div>
                        <input
                          inputMode={
                            contactCheck.selected === 'phone' ? 'tel' : 'email'
                          }
                          autoComplete={
                            contactCheck.selected === 'phone' ? 'tel' : 'email'
                          }
                          placeholder={
                            contactCheck.selected === 'phone'
                              ? '(11) 90000-0000'
                              : 'nome@email.com'
                          }
                          value={contactCheck.draft}
                          onChange={(event) => {
                            const element = event.target
                            if (contactCheck.selected === 'phone') {
                              const next = phoneFieldValue(
                                element.value,
                                element.selectionStart,
                              )
                              setContactCheck({
                                ...contactCheck,
                                draft: next.value,
                              })
                              window.requestAnimationFrame(() => {
                                element.setSelectionRange(
                                  next.caret,
                                  next.caret,
                                )
                              })
                              return
                            }
                            setContactCheck({
                              ...contactCheck,
                              draft: element.value,
                            })
                          }}
                        />
                      </div>
                    </label>
                  ) : (
                    <p className="login-error">
                      Este contato não está no cadastro. Escolha o outro.
                    </p>
                  )}
                  <button
                    className="login-submit"
                    type="submit"
                    disabled={
                      busy ||
                      !contactCheck.channels.find(
                        (item) => item.channel === contactCheck.selected,
                      )?.available ||
                      contactCheck.draft.trim().length < 4
                    }
                  >
                    {busy ? 'Conferindo…' : 'Confirmar e entrar'}
                  </button>
                  <button
                    type="button"
                    className="portal-contact-back"
                    onClick={() => {
                      setError('')
                      setContactCheck({
                        ...contactCheck,
                        selected: null,
                        draft: '',
                      })
                    }}
                  >
                    Escolher outro contato
                  </button>
                </>
              )}
              {error && <p className="login-error">{error}</p>}
            </form>
          ) : (
          <form onSubmit={(event) => void submitAccess(event)}>
            <label className="login-field">
              <span>Número do contrato</span>
              <div>
                <input
                  inputMode="numeric"
                  maxLength={6}
                  value={associateCode}
                  onChange={(event) =>
                    setAssociateCode(
                      event.target.value.replace(/\D/g, '').slice(0, 6),
                    )
                  }
                  placeholder="000000"
                />
              </div>
            </label>
            <label className="login-field">
              <span>5 últimos dígitos do CPF</span>
              <div>
                <input
                  inputMode="numeric"
                  maxLength={5}
                  value={documentTail}
                  onChange={(event) => {
                    const digits = event.target.value
                      .replace(/\D/g, '')
                      .slice(0, 5)
                    setDocumentTail(digits)
                    if (digits.length > 0 && !challenge) void loadChallenge()
                  }}
                  placeholder="00000"
                />
              </div>
            </label>
            {documentTail.length > 0 && (
              <div className="login-field">
                <div className="login-challenge-label">
                  <label htmlFor="portal-challenge-answer">
                    {challenge?.question ?? 'Preparando a verificação…'}
                  </label>
                  <button
                    type="button"
                    className="login-challenge-refresh"
                    onClick={() => void loadChallenge()}
                    disabled={busy || !challenge}
                    aria-label="Gerar outra conta"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
                <div>
                  <input
                    id="portal-challenge-answer"
                    inputMode="numeric"
                    value={answer}
                    onChange={(event) =>
                      setAnswer(event.target.value.replace(/\D/g, '').slice(0, 3))
                    }
                    placeholder="Resultado"
                    disabled={!challenge}
                  />
                </div>
              </div>
            )}
            {error && <p className="login-error">{error}</p>}
            <button className="login-submit" type="submit" disabled={busy}>
              {busy ? 'Verificando…' : 'Entrar no ranking'}
            </button>
          </form>
          )}
          <small>
            Versão de teste. Enquanto o CPF não vier da base, use 12345.
          </small>
        </section>
        <SiteFooter tone="dark" />
      </main>
    )
  }

  const embed = view.liveUrl ? youtubeEmbedUrl(view.liveUrl) : null
  const you = view.you
  const topTotal = view.ranking.reduce(
    (largest, item) => Math.max(largest, item.totalInstallments),
    1,
  )
  const pendingSave = Boolean(
    you && offerAmount !== you.offeredInstallments,
  )
  const offerCap = you
    ? Math.max(0, MAX_INSTALLMENTS - you.anticipatedInstallments)
    : MAX_INSTALLMENTS
  const offerValid =
    offerAmount >= MIN_INSTALLMENTS &&
    offerAmount <= offerCap &&
    offerCap >= MIN_INSTALLMENTS
  const visiblePresets = PRESETS.filter(
    (preset) => preset >= MIN_INSTALLMENTS && preset <= offerCap,
  )
  const canSaveOffer =
    offerValid && Boolean(you?.hasWhatsappPhone) && phoneMatches
  const phoneComplete = Boolean(normalizeWhatsappPhone(phoneDraft))

  const quotaLabel =
    you && you.position <= view.anticipatorSlots
      ? `Dentro das ${view.anticipatorSlots} vagas`
      : `Fora das ${view.anticipatorSlots} vagas`
  const quotaClass =
    you && you.position <= view.anticipatorSlots ? 'is-in-quota' : 'is-out-quota'

  return (
    <main
      className={`associate-portal is-open${view.status === 'active' ? ' is-live' : ''}`}
      ref={portalRef}
    >
      {you && view.status !== 'active' && (
        <button
          type="button"
          className={`portal-rank-bar${heroVisible ? '' : ' is-visible'}`}
          tabIndex={heroVisible ? -1 : 0}
          aria-hidden={heroVisible}
          onClick={() => {
            const target =
              view.status === 'active'
                ? document.querySelector('.draw-board')
                : myRowRef.current
            target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }}
        >
          <span className="rank-bar-position">
            <b>{you.position}º</b>
            <small>de {view.ranking.length}</small>
          </span>
          <span className="rank-bar-identity">
            <b>{you.associateCode}</b>
            <span className={`portal-tag ${quotaClass}`}>{quotaLabel}</span>
          </span>
          <span className="rank-bar-metrics">
            <span>
              <b>{you.paidInstallments}</b>
              <small>pagas</small>
            </span>
            <span>
              <b>{you.anticipatedInstallments + you.offeredInstallments}</b>
              <small>antecipadas</small>
            </span>
            <span className="is-total">
              <b>{you.totalInstallments}</b>
              <small>total</small>
            </span>
          </span>
          <span className="rank-bar-jump">
            <Trophy size={14} />
            {view.status === 'active' ? 'Ver o sorteio' : 'Ver minha linha'}
          </span>
        </button>
      )}
      <div
        className={`portal-shell${view.status === 'active' ? ' is-draw' : ''}`}
      >
        <header className="portal-topbar">
          <img
            className="portal-brand"
            src="/vida-nova-30-anos.png"
            alt="Cooperativa Habitacional Vida Nova — 30 anos"
          />
          <div className="portal-session">
            <span className="portal-eyebrow">Portal do associado</span>
            <h1>{portalHeading(view)}</h1>
            <small>
              <CalendarClock size={13} />
              {formatDate(view.startsAt)} até {formatDate(view.endsAt)}
            </small>
          </div>
          <div className="portal-topbar-side">
            <span className={`portal-pill is-${view.status}`}>
              <i aria-hidden="true" />
              {sessionLabel(view.status)}
            </span>
            <button
              type="button"
              className="portal-button is-ghost portal-manual-button"
              onClick={() => setTourStep(0)}
            >
              <HelpCircle size={15} /> Manual
            </button>
            <button
              type="button"
              className="portal-button is-ghost"
              onClick={() =>
                void api.portalLogout().then(() => {
                  setView(null)
                  setSignedIn(false)
                  setChallenge(null)
                  setAnswer('')
                  setPhoneDraft('')
                  setPhoneMatches(false)
                  setPhoneChecked(false)
                })
              }
            >
              <LogOut size={15} /> Sair
            </button>
          </div>
        </header>

        {notice && (
          <p className="portal-notice">
            <Check size={15} /> {notice}
          </p>
        )}
        {error && (
          <p className="portal-alert">
            <X size={15} /> {error}
          </p>
        )}

        {view.status === 'active' && (
          <AssociateDrawPanel embedSrc={embed} liveUrl={view.liveUrl} />
        )}
        <div
          className={`portal-grid${view.status === 'active' ? ' is-draw' : ''}`}
        >
          <div className="portal-column">
            {you && view.status !== 'active' && (
              <section className="portal-hero" ref={heroRef}>
                <div className="portal-rank">
                  <small>Sua posição</small>
                  <strong>{you.position}º</strong>
                  <span>de {view.ranking.length}</span>
                </div>
                <div className="portal-identity">
                  <h2>{you.associateCode}</h2>
                  <div className="portal-metrics">
                    <div>
                      <b>{you.paidInstallments}</b>
                      <small>Pagas</small>
                    </div>
                    <div>
                      <b>
                        {you.anticipatedInstallments + you.offeredInstallments}
                      </b>
                      <small>Antecipadas</small>
                    </div>
                    <div className="is-total">
                      <b>{you.totalInstallments}</b>
                      <small>Total</small>
                    </div>
                  </div>
                  <div className="portal-tags">
                    <span className={`portal-tag is-${you.offerStatus}`}>
                      {offerLabel(you.offerStatus)}
                    </span>
                    <span className={`portal-tag ${quotaClass}`}>
                      {quotaLabel}
                    </span>
                    {you.apartmentId && (
                      <span className="portal-tag is-apartment">
                        Apartamento {you.apartmentId}
                      </span>
                    )}
                  </div>
                </div>
              </section>
            )}

            {you && view.status !== 'active' && (
              <section className="portal-card portal-decision">
                <h2>
                  <Trophy size={16} />{' '}
                  {you.canConfirm || you.canWithdraw
                    ? 'Confirme sua antecipação'
                    : 'Sua antecipação'}
                </h2>

                {you.canSetOffer ? (
                  <>
                    <p className="portal-hint">
                      {you.anticipatedInstallments > 0
                        ? `Você já antecipou ${you.anticipatedInstallments} parcelas. Nesta rodada pode antecipar de ${MIN_INSTALLMENTS} a ${offerCap}. O máximo total é ${MAX_INSTALLMENTS}.`
                        : `Escolha de ${MIN_INSTALLMENTS} a ${MAX_INSTALLMENTS} parcelas para antecipar. O ranking reordena na hora.`}
                    </p>
                    <div className="offer-stepper">
                      <button
                        type="button"
                        aria-label="Diminuir uma parcela"
                        disabled={busy || offerAmount <= MIN_INSTALLMENTS}
                        onClick={() => applyOfferText(String(offerAmount - 1))}
                      >
                        <Minus size={18} />
                      </button>
                      <div className="offer-value">
                        <input
                          inputMode="numeric"
                          placeholder={String(MIN_INSTALLMENTS)}
                          aria-label="Parcelas que quer antecipar"
                          value={offerText}
                          onChange={(event) => applyOfferText(event.target.value)}
                        />
                        <small>parcelas</small>
                      </div>
                      <button
                        type="button"
                        aria-label="Aumentar uma parcela"
                        disabled={busy || offerAmount >= offerCap}
                        onClick={() =>
                          applyOfferText(
                            String(
                              offerAmount < MIN_INSTALLMENTS
                                ? MIN_INSTALLMENTS
                                : offerAmount + 1,
                            ),
                          )
                        }
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                    <div className="portal-phone-confirmation">
                      <span>Confirme seu número de celular</span>
                      {you.hasWhatsappPhone ? (
                        <>
                          <strong>{you.whatsappPhoneMasked}</strong>
                          <label>
                            Digite o número completo
                            <input
                              inputMode="tel"
                              autoComplete="tel"
                              placeholder="(11) 90000-0000"
                              value={phoneDraft}
                              className={
                                phoneMatches
                                  ? 'is-match'
                                  : phoneChecked
                                    ? 'is-mismatch'
                                    : ''
                              }
                              onChange={(event) => {
                                const element = event.target
                                const next = phoneFieldValue(
                                  element.value,
                                  element.selectionStart,
                                )
                                setPhoneDraft(next.value)
                                setPhoneMatches(false)
                                setPhoneChecked(false)
                                window.requestAnimationFrame(() => {
                                  element.setSelectionRange(
                                    next.caret,
                                    next.caret,
                                  )
                                })
                              }}
                            />
                          </label>
                          {phoneChecked && !phoneMatches && (
                            <p className="portal-hint is-error">
                              Este número não confere com o cadastro.
                            </p>
                          )}
                          {phoneMatches && (
                            <p className="portal-hint is-match">
                              Número conferido.
                            </p>
                          )}
                          <p className="portal-hint">
                            O administrativo enviará as informações da
                            antecipação para este WhatsApp.
                          </p>
                        </>
                      ) : (
                        <p className="portal-hint is-error">
                          Não encontramos um celular cadastrado. Procure a
                          cooperativa para atualizar seus dados.
                        </p>
                      )}
                    </div>
                    <div className="offer-presets">
                      {visiblePresets.map((preset) => (
                        <button
                          type="button"
                          key={preset}
                          className={offerAmount === preset ? 'is-active' : ''}
                          onClick={() => applyOfferText(String(preset))}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="portal-button is-primary is-block"
                      disabled={busy || !canSaveOffer || !pendingSave}
                      onClick={() => void saveOffer()}
                    >
                      {busy
                        ? 'Salvando…'
                        : pendingSave && !phoneMatches
                          ? phoneChecked
                            ? 'Número não confere'
                            : phoneComplete
                              ? 'Conferindo celular…'
                              : 'Digite seu celular'
                          : canSaveOffer && pendingSave
                          ? 'Salvar antecipação'
                          : offerValid
                            ? 'Antecipação salva'
                            : `Escolha de ${MIN_INSTALLMENTS} a ${offerCap}`}
                    </button>
                  </>
                ) : you.canConfirm || you.canWithdraw ? (
                  <>
                    <p className="portal-hint">
                      As antecipações foram travadas. A quantidade de{' '}
                      {you.offeredInstallments} parcelas não pode mais mudar.
                      Confirme se você realmente quer antecipar.
                    </p>
                    <p className="portal-locked-offer">
                      <b>{you.offeredInstallments}</b>
                      <span>parcelas nesta rodada</span>
                    </p>
                    {you.anticipatedInstallments > 0 && (
                      <p className="portal-hint">
                        Você já tinha {you.anticipatedInstallments} parcelas
                        antecipadas. O máximo total continua{' '}
                        {MAX_INSTALLMENTS}.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="portal-locked">
                    <Lock size={15} />
                    {view.status === 'locked'
                      ? 'As antecipações foram travadas. Não há quantidade pendente para manter ou recusar.'
                      : view.status === 'draft' &&
                          you.anticipatedInstallments > 0 &&
                          MAX_INSTALLMENTS - you.anticipatedInstallments <
                            MIN_INSTALLMENTS
                        ? `Você já antecipou ${you.anticipatedInstallments} de ${MAX_INSTALLMENTS} parcelas. Não há saldo para uma nova antecipação.`
                        : view.status === 'draft'
                          ? 'Sua decisão já foi registrada e não pode mais ser alterada.'
                          : 'O ranking foi travado para a escolha das unidades.'}
                  </p>
                )}

                {(you.canConfirm || you.canWithdraw) && (
                    <div className="portal-deadline">
                      {you.offerDecisionUntil && (
                        <div className="portal-deadline-text">
                          <Clock3 size={16} />
                          <div>
                            <b>
                              Você tem até {formatDate(you.offerDecisionUntil)}
                            </b>
                            <span>
                              Depois desse horário, a antecipação desta rodada
                              não será mantida.
                            </span>
                          </div>
                        </div>
                      )}
                      <div className="portal-deadline-actions">
                        {you.canConfirm && (
                          <button
                            type="button"
                            className="portal-button is-primary"
                            disabled={busy}
                            onClick={() => setPendingDecision('confirm')}
                          >
                            <Check size={15} /> Quero antecipar
                          </button>
                        )}
                        {you.canWithdraw && (
                          <button
                            type="button"
                            className="portal-button is-danger"
                            disabled={busy}
                            onClick={() => setPendingDecision('withdraw')}
                          >
                            <X size={15} /> Não quero antecipar
                          </button>
                        )}
                      </div>
                    </div>
                  )}
              </section>
            )}

            {view.status === 'active' && <Grupo12Gallery />}

            {view.status !== 'active' && (
            <section className="portal-card portal-live">
              <h2>
                <Radio size={16} /> Transmissão ao vivo
              </h2>
              {embed ? (
                <div className="portal-live-stage" ref={liveStageRef}>
                  <iframe
                    title="Live do sorteio"
                    src={embed}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  />
                  <button
                    type="button"
                    className="portal-live-fullscreen"
                    onClick={() => {
                      const stage = liveStageRef.current
                      if (!stage) return
                      if (document.fullscreenElement === stage) {
                        void document.exitFullscreen()
                        return
                      }
                      void stage.requestFullscreen()
                    }}
                  >
                    {liveFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                    {liveFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
                  </button>
                </div>
              ) : view.liveUrl ? (
                <a
                  className="portal-button is-primary is-block"
                  href={view.liveUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Radio size={15} /> Abrir a live
                </a>
              ) : (
                <p className="portal-empty">
                  A live ainda não foi publicada. Assim que a cooperativa
                  divulgar o link, ele aparece aqui.
                </p>
              )}
            </section>
            )}
          </div>

          {view.status !== 'active' && (
          <section className="portal-card portal-ranking-card">
            <div className="portal-ranking-intro">
              <h2>
                <Trophy size={16} /> Ranking ao vivo
              </h2>
              <p className="portal-hint">
                <ShieldCheck size={14} /> Atualiza sozinho. Ordena pelo total de
                parcelas e, em caso de empate, o menor número de contrato fica na
                frente. As {view.anticipatorSlots} primeiras posições antecipam.
              </p>
            </div>
            <ol className="portal-ranking">
              {view.ranking.map((item) => (
                <li
                  key={item.associateCode}
                  ref={
                    item.associateCode === you?.associateCode
                      ? myRowRef
                      : undefined
                  }
                  className={`portal-ranking-row is-${item.offerStatus}${
                    item.associateCode === you?.associateCode ? ' is-you' : ''
                  }${item.apartmentId ? ' is-chosen' : ''}${
                    item.position <= view.anticipatorSlots
                      ? ' is-anticipator'
                      : ' is-outside'
                  }${item.position === view.anticipatorSlots ? ' is-cut' : ''}`}
                >
                  <span className="rank-position">{item.position}</span>
                  <div className="rank-person">
                    <b>{item.associateCode}</b>
                  </div>
                  <div className="rank-progress">
                    <div
                      className="rank-bar"
                      style={{
                        width: `${(item.totalInstallments / topTotal) * 100}%`,
                      }}
                    />
                    <small>
                      {item.paidInstallments} pagas +{' '}
                      {item.anticipatedInstallments + item.offeredInstallments}{' '}
                      antecipadas
                    </small>
                  </div>
                  <div className="rank-total">
                    <b>{item.totalInstallments}</b>
                    <small>total</small>
                  </div>
                  {item.apartmentId ? (
                    <span className="portal-tag is-apartment">
                      Apto {item.apartmentId}
                    </span>
                  ) : (
                    <span className={`portal-tag is-${item.offerStatus}`}>
                      {offerLabel(item.offerStatus)}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </section>
          )}
        </div>
        <SiteFooter tone="dark" />
      </div>

      {tourStep !== null && tourRect && availableTourSteps[tourStep] && (
        <div className="portal-tour" role="dialog" aria-modal="true">
          <div
            className="portal-tour-shade is-top"
            style={{ height: Math.max(0, tourRect.top - 8) }}
          />
          <div
            className="portal-tour-shade is-left"
            style={{
              top: Math.max(0, tourRect.top - 8),
              width: Math.max(0, tourRect.left - 8),
              height: tourRect.height + 16,
            }}
          />
          <div
            className="portal-tour-shade is-right"
            style={{
              top: Math.max(0, tourRect.top - 8),
              left: Math.min(window.innerWidth, tourRect.right + 8),
              height: tourRect.height + 16,
            }}
          />
          <div
            className="portal-tour-shade is-bottom"
            style={{ top: Math.min(window.innerHeight, tourRect.bottom + 8) }}
          />
          <div
            className="portal-tour-focus"
            style={{
              top: Math.max(6, tourRect.top - 8),
              left: Math.max(6, tourRect.left - 8),
              width: Math.min(
                window.innerWidth - 12,
                tourRect.width + 16,
              ),
              height: tourRect.height + 16,
            }}
          />
          <section
            className={`portal-tour-card${
              tourRect.bottom + 230 < window.innerHeight
                ? ' is-below'
                : ' is-above'
            }`}
            style={{
              left: Math.min(
                Math.max(12, tourRect.left),
                Math.max(12, window.innerWidth - 372),
              ),
              ...(tourRect.bottom + 230 < window.innerHeight
                ? { top: tourRect.bottom + 18 }
                : { bottom: window.innerHeight - tourRect.top + 18 }),
            }}
          >
            <header>
              <span>
                <BookOpen size={15} /> Manual do associado
              </span>
              <b>
                {tourStep + 1} de {availableTourSteps.length}
              </b>
            </header>
            <h2>{availableTourSteps[tourStep].title}</h2>
            <p>{availableTourSteps[tourStep].text}</p>
            <div
              className="portal-tour-progress"
              aria-hidden="true"
              style={{
                gridTemplateColumns: `repeat(${availableTourSteps.length}, 1fr)`,
              }}
            >
              {availableTourSteps.map((step, index) => (
                <i
                  key={step.selector}
                  className={index <= tourStep ? 'is-active' : ''}
                />
              ))}
            </div>
            <footer>
              <button
                type="button"
                className="portal-tour-skip"
                onClick={() => closeTour(true)}
              >
                Pular tutorial
              </button>
              <div>
                <button
                  type="button"
                  className="portal-tour-back"
                  disabled={tourStep === 0}
                  onClick={() => setTourStep((current) => Math.max(0, current! - 1))}
                >
                  <ChevronLeft size={15} /> Voltar
                </button>
                <button
                  type="button"
                  className="portal-tour-next"
                  onClick={() => {
                    if (tourStep === availableTourSteps.length - 1) {
                      closeTour(true)
                    } else {
                      setTourStep(tourStep + 1)
                    }
                  }}
                >
                  {tourStep === availableTourSteps.length - 1 ? (
                    <>
                      <Check size={15} /> Concluir
                    </>
                  ) : (
                    <>
                      Próximo <ChevronRight size={15} />
                    </>
                  )}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}

      {celebration && (
        <CelebrationOverlay
          celebration={{ ...celebration, participant: '' }}
          onClose={() => setCelebration(null)}
        />
      )}

      {pendingDecision && you && (
        <div
          className="portal-confirm-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) {
              setPendingDecision(null)
            }
          }}
        >
          <section
            className={`portal-confirm-dialog is-${pendingDecision}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="portal-confirm-title"
          >
            {pendingDecision === 'confirm' ? (
              <Check size={22} />
            ) : (
              <X size={22} />
            )}
            <h2 id="portal-confirm-title">
              {pendingDecision === 'confirm'
                ? 'Você quer antecipar?'
                : 'Não quer antecipar?'}
            </h2>
            <p>
              {pendingDecision === 'confirm'
                ? `Você confirma que vai antecipar ${you.offeredInstallments} parcela${you.offeredInstallments === 1 ? '' : 's'} e permanecer nesta posição do ranking.`
                : 'Você confirma que não vai antecipar nenhuma parcela. Sua posição no ranking será atualizada e essa escolha não poderá ser desfeita aqui.'}
            </p>
            <div className="portal-confirm-actions">
              <button
                type="button"
                className="portal-button is-ghost"
                disabled={busy}
                onClick={() => setPendingDecision(null)}
              >
                Voltar
              </button>
              <button
                type="button"
                className={`portal-button ${pendingDecision === 'confirm' ? 'is-primary' : 'is-danger'}`}
                disabled={busy}
                onClick={() => void decide(pendingDecision)}
              >
                {busy
                  ? 'Confirmando…'
                  : pendingDecision === 'confirm'
                    ? 'Sim, quero antecipar'
                    : 'Sim, não quero'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
