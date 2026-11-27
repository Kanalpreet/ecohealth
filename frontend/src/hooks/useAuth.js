import { useContext } from 'react'
import { AuthContext } from '../lib/auth-context'

/** { status: 'loading'|'authenticated'|'anonymous', user, login, register, logout } */
export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
