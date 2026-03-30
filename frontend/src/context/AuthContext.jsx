import React, { createContext, useContext, useState, useEffect } from 'react'
import { apiService, setTokenExpiredCallback } from '../services/api'

const AuthContext = createContext()

/**
 * @type {React.Provider}
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  // Set up token expiration callback
  useEffect(() => {
    setTokenExpiredCallback(() => {
      setUser(null)
      setToken(null)
    })
  }, [])

  // Auto-check auth on mount
  useEffect(() => {
    const checkAuth = async () => {
      const storedToken = localStorage.getItem('authToken')
      if (storedToken) {
        setToken(storedToken)
        try {
          const response = await apiService.getMe()
          setUser(response.data)
        } catch (error) {
          console.error('Failed to fetch user:', error)
          localStorage.removeItem('authToken')
          setToken(null)
        }
      }
      setLoading(false)
    }

    checkAuth()
  }, [])

  /**
   * Login with email and password
   * @param {string} email
   * @param {string} password
   * @returns {Promise}
   */
  const login = async (email, password) => {
    try {
      const response = await apiService.login(email, password)
      const { token: newToken, user: userData } = response.data
      
      setToken(newToken)
      setUser(userData)
      localStorage.setItem('authToken', newToken)
      
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || 'Erro ao fazer login'
      }
    }
  }

  /**
   * Logout
   */
  const logout = () => {
    setUser(null)
    setToken(null)
    localStorage.removeItem('authToken')
  }

  const value = {
    user,
    token,
    loading,
    login,
    logout,
    isAuthenticated: !!token
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

/**
 * Hook to use AuthContext
 * @returns {object} Auth context value
 */
export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
