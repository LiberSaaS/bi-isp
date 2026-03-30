import React, { useState, useEffect } from 'react'
import { AlertTriangle, Lock } from 'lucide-react'
import { apiService } from '../services/api'

/**
 * License status banner component
 * Shows banner based on license status
 */
export const LicenseBanner = () => {
  const [licenseStatus, setLicenseStatus] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchLicenseStatus = async () => {
      try {
        const response = await apiService.getLicenseStatus()
        setLicenseStatus(response.data.status)
      } catch (error) {
        console.error('Failed to fetch license status:', error)
        setLicenseStatus('unknown')
      } finally {
        setLoading(false)
      }
    }

    fetchLicenseStatus()
  }, [])

  if (loading || licenseStatus === 'active') {
    return null
  }

  if (licenseStatus === 'expired' || licenseStatus === 'unknown') {
    return (
      <div className="bg-amber-900/30 border-b border-amber-700/50 px-4 py-3 flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
        <span className="text-amber-200 text-sm font-medium">
          Licença expirada — modo somente leitura
        </span>
      </div>
    )
  }

  if (licenseStatus === 'blocked') {
    return (
      <div className="bg-red-900/30 border-b border-red-700/50 px-4 py-3 flex items-center gap-3">
        <Lock className="w-5 h-5 text-red-500 flex-shrink-0" />
        <span className="text-red-200 text-sm font-medium">
          Licença bloqueada — acesse o painel Libernet
        </span>
      </div>
    )
  }

  return null
}
