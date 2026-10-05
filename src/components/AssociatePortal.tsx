import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  CalendarClock,
  Check,
  Clock3,
  Lock,
  LogOut,
  Minus,
  Plus,
  Radio,
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
  formatWhatsappPhone,
  normalizeWhatsappPhone,
  phoneFieldValue,
} from '../config/collectionNotice'
import { SiteFooter } from './SiteFooter'

const MAX_INSTALLMENTS = 30
const PRESETS = [0, 5, 10, 20, 30]

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
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [offerAmount, setOfferAmount] = useState(0)
  const [offerText, setOfferText] = useState('')
  const [whatsappPhone, setWhatsappPhone] = useState('')
  const [signedIn, setSignedIn] = useState(false)
  const [pendingDecision, setPendingDecision] = useState<
    'confirm' | 'withdraw' | null
  >(null)
  const [heroVisible, setHeroVisible] = useState(true)
  const portalRef = useRef<HTMLElement | null>(null)
  const heroRef = useRef<HTMLElement | null>(null)
  const myRowRef = useRef<HTMLLIElement | null>(null)

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
      setWhatsappPhone(
        data.you.whatsappPhone
          ? formatWhatsappPhone(data.you.whatsappPhone)
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
        await loadChallenge().catch(() => undefined)
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
      await api.portalAccess({
        associateCode,
        documentTail,
        challengeId: challenge.id,
        answer: Number(answer),
      })
      await loadView()
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

  const applyOfferText = (raw: string) => {
    const digits = raw.replace(/\D/g, '').replace(/^0+/, '').slice(0, 2)
    const amount =
      digits === '' ? 0 : Math.min(MAX_INSTALLMENTS, Number(digits))
    setOfferText(amount === 0 ? '' : String(amount))
    setOfferAmount(amount)
  }

  const saveOffer = async () => {
    setBusy(true)
    setError('')
    try {
      await api.portalOffer('set', offerAmount, whatsappPhone)
      await loadView()
      setNotice(
        offerAmount === 0
          ? 'Você recusou antecipar parcelas. O ranking foi atualizado.'
          : `Ranking atualizado: ${offerAmount} parcela${offerAmount === 1 ? '' : 's'} antecipando.`,
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
      await api.portalOffer(action, undefined, whatsappPhone)
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
            escolhe quantas parcelas quer antecipar e vê sua posição subir na
            hora.
          </p>
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
                  onChange={(event) =>
                    setDocumentTail(
                      event.target.value.replace(/\D/g, '').slice(0, 5),
                    )
                  }
                  placeholder="00000"
                />
              </div>
            </label>
            <label className="login-field">
              <span>{challenge?.question ?? 'Verificação'}</span>
              <div>
                <input
                  inputMode="numeric"
                  value={answer}
                  onChange={(event) =>
                    setAnswer(event.target.value.replace(/\D/g, '').slice(0, 3))
                  }
                  placeholder="Resultado"
                />
              </div>
            </label>
            {error && <p className="login-error">{error}</p>}
            <button className="login-submit" type="submit" disabled={busy}>
              {busy ? 'Verificando…' : 'Entrar no ranking'}
            </button>
          </form>
          <small>
            Versão de teste. Depois o CPF virá da base real da cooperativa.
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
    you &&
      (offerAmount !== you.offeredInstallments ||
        normalizeWhatsappPhone(whatsappPhone) !==
          (you.whatsappPhone
            ? normalizeWhatsappPhone(you.whatsappPhone)
            : null)),
  )

  const quotaLabel =
    you && you.position <= view.anticipatorSlots
      ? `Dentro das ${view.anticipatorSlots} vagas`
      : `Fora das ${view.anticipatorSlots} vagas`
  const quotaClass =
    you && you.position <= view.anticipatorSlots ? 'is-in-quota' : 'is-out-quota'

  return (
    <main className="associate-portal is-open" ref={portalRef}>
      {you && (
        <button
          type="button"
          className={`portal-rank-bar${heroVisible ? '' : ' is-visible'}`}
          tabIndex={heroVisible ? -1 : 0}
          aria-hidden={heroVisible}
          onClick={() =>
            myRowRef.current?.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
            })
          }
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
            <Trophy size={14} /> Ver minha linha
          </span>
        </button>
      )}
      <div className="portal-shell">
        <header className="portal-topbar">
          <img
            className="portal-brand"
            src="/vida-nova-30-anos.png"
            alt="Cooperativa Habitacional Vida Nova — 30 anos"
          />
          <div className="portal-session">
            <span className="portal-eyebrow">Portal do associado</span>
            <h1>{view.title}</h1>
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
              className="portal-button is-ghost"
              onClick={() =>
                void api.portalLogout().then(() => {
                  setView(null)
                  setSignedIn(false)
                  void loadChallenge()
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

        <div className="portal-grid">
          <div className="portal-column">
            {you && (
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
                  </div>
                </div>
              </section>
            )}

            {you && (
              <section className="portal-card portal-decision">
                <h2>
                  <Trophy size={16} /> Sua antecipação
                </h2>

                {you.canSetOffer ? (
                  <>
                    <p className="portal-hint">
                      Escolha quantas parcelas quer antecipar, até{' '}
                      {MAX_INSTALLMENTS}. O ranking reordena na hora.
                    </p>
                    <div className="offer-stepper">
                      <button
                        type="button"
                        aria-label="Diminuir uma parcela"
                        disabled={busy || offerAmount <= 0}
                        onClick={() => applyOfferText(String(offerAmount - 1))}
                      >
                        <Minus size={18} />
                      </button>
                      <div className="offer-value">
                        <input
                          inputMode="numeric"
                          placeholder="0"
                          aria-label="Parcelas que quer antecipar"
                          value={offerText}
                          onChange={(event) => applyOfferText(event.target.value)}
                        />
                        <small>parcelas</small>
                      </div>
                      <button
                        type="button"
                        aria-label="Aumentar uma parcela"
                        disabled={busy || offerAmount >= MAX_INSTALLMENTS}
                        onClick={() => applyOfferText(String(offerAmount + 1))}
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                    <label className="login-field portal-phone">
                      <span>WhatsApp</span>
                      <div>
                        <input
                          inputMode="tel"
                          placeholder="(11) 90000-0000"
                          autoComplete="tel"
                          value={whatsappPhone}
                          onChange={(event) => {
                            const element = event.target
                            const next = phoneFieldValue(
                              element.value,
                              element.selectionStart,
                            )
                            setWhatsappPhone(next.value)
                            window.requestAnimationFrame(() => {
                              element.setSelectionRange(next.caret, next.caret)
                            })
                          }}
                        />
                      </div>
                    </label>
                    <p className="portal-hint">
                      Ao confirmar o lance, a cobrança envia o valor neste
                      número. Fora do Brasil, comece com + e o código do país.
                    </p>
                    <div className="offer-presets">
                      {PRESETS.map((preset) => (
                        <button
                          type="button"
                          key={preset}
                          className={offerAmount === preset ? 'is-active' : ''}
                          onClick={() =>
                            applyOfferText(preset === 0 ? '' : String(preset))
                          }
                        >
                          {preset === 0 ? 'Nenhuma' : preset}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="portal-button is-primary is-block"
                      disabled={busy || !pendingSave}
                      onClick={() => void saveOffer()}
                    >
                      {busy
                        ? 'Salvando…'
                        : pendingSave
                          ? 'Salvar antecipação'
                          : 'Antecipação salva'}
                    </button>
                  </>
                ) : (
                  <p className="portal-locked">
                    <Lock size={15} />
                    {view.status === 'draft'
                      ? 'Sua decisão já foi registrada e não pode mais ser alterada.'
                      : 'O ranking foi travado para a escolha das unidades.'}
                  </p>
                )}

                {you.offerDecisionUntil &&
                  (you.canConfirm || you.canWithdraw) && (
                    <div className="portal-deadline">
                      <div className="portal-deadline-text">
                        <Clock3 size={16} />
                        <div>
                          <b>Você tem até {formatDate(you.offerDecisionUntil)}</b>
                          <span>
                            Confirme que vai manter a antecipação ou recuse e
                            não antecipe nenhuma parcela.
                          </span>
                        </div>
                      </div>
                      <div className="portal-deadline-actions">
                        {you.canConfirm && (
                          <button
                            type="button"
                            className="portal-button is-primary"
                            disabled={busy}
                            onClick={() => setPendingDecision('confirm')}
                          >
                            <Check size={15} /> Manter antecipação
                          </button>
                        )}
                        {you.canWithdraw && (
                          <button
                            type="button"
                            className="portal-button is-danger"
                            disabled={busy}
                            onClick={() => setPendingDecision('withdraw')}
                          >
                            <X size={15} /> Não antecipar
                          </button>
                        )}
                      </div>
                    </div>
                  )}
              </section>
            )}

            <section className="portal-card portal-live">
              <h2>
                <Radio size={16} /> Transmissão ao vivo
              </h2>
              {embed ? (
                <iframe
                  title="Live do sorteio"
                  src={embed}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
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
          </div>

          <section className="portal-card portal-ranking-card">
            <h2>
              <Trophy size={16} /> Ranking ao vivo
            </h2>
            <p className="portal-hint">
              <ShieldCheck size={14} /> Atualiza sozinho. Ordena pelo total de
              parcelas e, em caso de empate, o menor número de contrato fica na
              frente. As {view.anticipatorSlots} primeiras posições antecipam.
            </p>
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
                  }${
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
                  <span className={`portal-tag is-${item.offerStatus}`}>
                    {offerLabel(item.offerStatus)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <SiteFooter tone="dark" />
      </div>

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
                ? 'Manter a antecipação?'
                : 'Não antecipar nenhuma parcela?'}
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
                    ? 'Sim, manter'
                    : 'Sim, não antecipar'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
