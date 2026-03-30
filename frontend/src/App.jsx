import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { LicenseBanner } from './components/LicenseBanner'
import { Layout } from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Comercial from './pages/Comercial'

/**
 * Protected route wrapper component
 */
const ProtectedRoute = ({ element }) => {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f0a1e' }}>
        <div className="text-center">
          <div className="w-10 h-10 border-2 rounded-full animate-spin mx-auto mb-4" style={{ borderColor: '#7c3aed33', borderTopColor: '#7c3aed' }} />
          <p className="text-sm" style={{ color: '#7c6fa0' }}>Carregando...</p>
        </div>
      </div>
    )
  }

  return isAuthenticated ? element : <Navigate to="/login" replace />
}

/**
 * Main App component with routing
 */
function App() {
  const { isAuthenticated } = useAuth()

  return (
    <>
      {isAuthenticated && <LicenseBanner />}
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute
              element={
                <Layout>
                  <Dashboard />
                </Layout>
              }
            />
          }
        />
        <Route
          path="/comercial"
          element={
            <ProtectedRoute
              element={
                <Layout>
                  <Comercial />
                </Layout>
              }
            />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default App
