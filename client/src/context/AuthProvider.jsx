import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCurrentUser, login as loginRequest, logout as logoutRequest } from '../lib/api.js'
import { AuthContext } from './auth-context.js'

export function AuthProvider({ children }) {
  const [authState, setAuthState] = useState({
    status: 'loading',
    currentUser: null,
    sessionError: null,
  })

  const refresh = useCallback(async () => {
    try {
      const { user } = await getCurrentUser()
      setAuthState({ status: 'authenticated', currentUser: user, sessionError: null })
      return user
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        setAuthState({ status: 'anonymous', currentUser: null, sessionError: null })
        return null
      }

      setAuthState({ status: 'anonymous', currentUser: null, sessionError: error })
      return null
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    getCurrentUser(controller.signal)
      .then(({ user }) => {
        setAuthState({ status: 'authenticated', currentUser: user, sessionError: null })
      })
      .catch(error => {
        if (error.name === 'AbortError') return
        if (error.status === 401 || error.status === 403) {
          setAuthState({ status: 'anonymous', currentUser: null, sessionError: null })
          return
        }
        setAuthState({ status: 'anonymous', currentUser: null, sessionError: error })
      })

    return () => controller.abort()
  }, [])

  const login = useCallback(async credentials => {
    const { user } = await loginRequest(credentials)
    setAuthState({ status: 'authenticated', currentUser: user, sessionError: null })
    return user
  }, [])

  const logout = useCallback(async () => {
    try {
      await logoutRequest()
    } catch (error) {
      if (error.status !== 401 && error.status !== 403) throw error
    }

    setAuthState({ status: 'anonymous', currentUser: null, sessionError: null })
  }, [])

  const value = useMemo(() => ({
    ...authState,
    login,
    logout,
    refresh,
  }), [authState, login, logout, refresh])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
