export type UserRole = 'admin' | 'operator'

export type AppUser = {
  id: string
  username: string
  role: UserRole
  createdAt?: string
}

async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string
    } | null
    throw new Error(payload?.error ?? 'Não foi possível concluir a operação.')
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function authenticate(username: string, password: string) {
  try {
    return await apiRequest<AppUser>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
  } catch {
    return null
  }
}

export async function getCurrentUser() {
  try {
    return await apiRequest<AppUser>('/api/auth/me')
  } catch {
    return null
  }
}

export async function logout() {
  await apiRequest<void>('/api/auth/logout', { method: 'POST' })
}

export async function listUsers() {
  return apiRequest<AppUser[]>('/api/users')
}

export async function createOperator(username: string, password: string) {
  return apiRequest<AppUser>('/api/users', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function removeOperator(id: string) {
  await apiRequest<void>(`/api/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}
