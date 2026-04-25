import axios from 'axios'

const baseURL = import.meta.env.VITE_API_URL || '/api'

const axiosInstance = axios.create({
  baseURL,
})

let onTokenExpired = null

export const setTokenExpiredCallback = (callback) => {
  onTokenExpired = callback
}

axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
}, (error) => {
  return Promise.reject(error)
})

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken')
      if (onTokenExpired) {
        onTokenExpired()
      }
    }
    return Promise.reject(error)
  }
)

export const apiService = {
  login: (email, password) => {
    return axiosInstance.post('/auth/login', { email, password })
  },

  getMe: () => {
    return axiosInstance.get('/auth/me')
  },

  getMetrics: (providerId, period) => {
    return axiosInstance.get(`/metrics/${providerId}`, { params: { period } })
  },

  getCommercialMetrics: (providerId, period) => {
    return axiosInstance.get(`/metrics/${providerId}/comercial`, { params: { period } })
  },

  getOverviewMetrics: (providerId, period) => {
    return axiosInstance.get(`/metrics/${providerId}/overview`, { params: { period } })
  },

  getGeographicMetrics: (providerId) => {
    return axiosInstance.get(`/metrics/${providerId}/geographic`)
  },
  searchCustomersByAddress: (providerId, filters) => {
    return axiosInstance.get(`/customers/${providerId}/search`, { params: filters })
  },

  getChurnMetrics: (providerId, period) => {
    return axiosInstance.get(`/metrics/${providerId}/churn`, { params: { period } })
  },

  getPlanMetrics: (providerId) => {
    return axiosInstance.get(`/metrics/${providerId}/plans`)
  },

  getServiceOrderMetrics: (providerId, period) => {
    return axiosInstance.get(`/metrics/${providerId}/service-orders`, { params: { period } })
  },

  getLicenseStatus: () => {
    return axiosInstance.get('/license/status')
  },

  getProviders: () => {
    return axiosInstance.get('/providers')
  },

  getProvider: (id) => {
    return axiosInstance.get(`/providers/${id}`)
  },

  createProvider: (data) => {
    return axiosInstance.post('/providers', data)
  },

  updateProvider: (id, data) => {
    return axiosInstance.put(`/providers/${id}`, data)
  },

  deleteProvider: (id) => {
    return axiosInstance.delete(`/providers/${id}`)
  },

  validateProvider: (id) => {
    return axiosInstance.post(`/providers/${id}/validate`)
  },

  triggerSync: (providerId) => {
    return axiosInstance.post(`/sync/${providerId}`)
  },

  getSyncSettings: () => {
    return axiosInstance.get('/settings/sync')
  },

  updateSyncSettings: (data) => {
    return axiosInstance.put('/settings/sync', data)
  },
}

export default axiosInstance
