import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { LicenseBanner } from './components/LicenseBanner'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'

/**
 * Protected route wrapper component
 */
const ProtectedRoute = ({ element }) => {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="loading mx-auto mb-4"></div>
          <p className="text-slate-400">Carregando...</p>
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
          element={<ProtectedRoute element={<Dashboard />} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default App
