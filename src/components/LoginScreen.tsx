import { useState, type FormEvent } from 'react'
import { Building2, Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react'
import { authenticate, type AppUser } from '../auth/localAuth'

type Props = {
  onLogin: (user: AppUser) => void
}

export function LoginScreen({ onLogin }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const user = await authenticate(username, password)
      onLogin(user)
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : 'Usuário ou senha inválidos.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-screen">
      <section className="login-card">
        <span className="login-brand">
          <Building2 size={28} />
        </span>
        <span className="eyebrow">Evo Coop Live</span>
        <h1>Acesse o mapa do sorteio</h1>
        <p>Entre com sua conta para registrar e alterar reservas.</p>

        <form onSubmit={(event) => void submit(event)}>
          <label className="login-field">
            <span>Usuário</span>
            <div>
              <UserRound size={17} />
              <input
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Digite seu usuário"
              />
            </div>
          </label>
          <label className="login-field">
            <span>Senha</span>
            <div>
              <LockKeyhole size={17} />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Digite sua senha"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          {error && <p className="login-error">{error}</p>}
          <button className="login-submit" type="submit" disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        <small>As ações ficam vinculadas ao usuário conectado.</small>
      </section>
    </main>
  )
}
