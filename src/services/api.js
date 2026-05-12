import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || ''

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' }
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    // Redirect a /login solo per sessioni scadute, NON per errori di login/setup
    const url = err.config?.url || ''
    const isAuthEndpoint = url.includes('/api/auth/login') || url.includes('/api/auth/setup') || url.includes('/api/auth/register')
    if (err.response?.status === 401 && !isAuthEndpoint) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export const licenseApi = {
  status: () => api.get('/api/license/status'),
  activate: (license_key) => api.post('/api/license/activate', { license_key }),
}

export const authApi = {
  setup:          (data) => api.post('/api/auth/setup', data),
  register:       (data) => api.post('/api/auth/register', data),
  login:          (data) => api.post('/api/auth/login', data),
  me:             ()     => api.get('/api/auth/me'),
  changePassword: (data) => api.post('/api/auth/change-password', data),
  updateProfile:  (data) => api.put('/api/auth/profile', data),
}

export const connectionsApi = {
  list: () => api.get('/api/connections'),
  create: (data) => api.post('/api/connections', data),
  update: (id, data) => api.put(`/api/connections/${id}`, data),
  test: (id) => api.post(`/api/connections/${id}/test`),
  delete: (id) => api.delete(`/api/connections/${id}`),
}

export const adminApi = {
  extendLicense: (key, days) => api.post(`/api/admin/licenses/${key}/extend`, { days }),
}

export const importApi = {
  import: (formData) => api.post('/api/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  status: (id) => api.get(`/api/import/${id}/status`),
}

export const exportApi = {
  query: (data) => api.post('/api/query', data),
}

export const queriesApi = {
  list: () => api.get('/api/saved-queries'),
  save: (data) => api.post('/api/saved-queries', data),
  delete: (id) => api.delete(`/api/saved-queries/${id}`),
}

export const operationsApi = {
  list: () => api.get('/api/operations'),
}

export const plansApi = {
  list: () => api.get('/api/plans'),
  subscription: () => api.get('/api/subscription'),
  createPayment: (data) => api.post('/api/subscription/create-payment', data),
  capturePayment: (data) => api.post('/api/subscription/capture-payment', data),
}

export default api
