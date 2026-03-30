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

  getMetrics: (providerId) => {
    return axiosInstance.get(`/metrics/${providerId}`)
  },

  getLicenseStatus: () => {
    return axiosInstance.get('/license/status')
  },

  getProviders: () => {
    return axiosInstance.get('/providers')
  },

  triggerSync: (providerId) => {
    return axiosInstance.post(`/sync/${providerId}`)
  },
}

export default axiosInstance
