import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiService } from '../services/api'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { LogOut, RefreshCw, Users, TrendingDown, AlertCircle, Wrench, CheckCircle2 } from 'lucide-react'

/**
 * Dashboard main page component
 */
export const Dashboard = () => {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  
  const [providers, setProviders] = useState([])
  const [selectedProvider, setSelectedProvider] = useState(null)
  const [period, setPeriod] = useState('30d')
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState(null)

  // Fetch providers on mount
  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const response = await apiService.getProviders()
        const providerList = response.data.providers || []
        setProviders(providerList)
        if (providerList.length > 0) {
          setSelectedProvider(providerList[0]._id || providerList[0].id)
        }
      } catch (err) {
        console.error('Failed to fetch providers:', err)
        setError('Erro ao carregar provedores')
      }
    }

    fetchProviders()
  }, [])

  // Fetch metrics when provider or period changes
  useEffect(() => {
    if (!selectedProvider) return

    const fetchMetrics = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await apiService.getMetrics(selectedProvider)
        setMetrics(response.data)
        setLastSync(response.data.lastSync)
      } catch (err) {
        console.error('Failed to fetch metrics:', err)
        setError('Erro ao carregar métricas')
      } finally {
        setLoading(false)
      }
    }

    fetchMetrics()
  }, [selectedProvider, period])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleSync = async () => {
    if (!selectedProvider || syncing) return
    
    setSyncing(true)
    try {
      await apiService.triggerSync(selectedProvider)
      setLastSync(new Date().toISOString())
      // Refetch metrics after sync
      const response = await apiService.getMetrics(selectedProvider)
      setMetrics(response.data)
    } catch (err) {
      console.error('Failed to sync:', err)
      setError('Erro ao sincronizar dados')
    } finally {
      setSyncing(false)
    }
  }

  const handleLogoutClick = () => {
    handleLogout()
  }

  // API returns: { providerId, providerName, metrics: { activeCustomers, churnRate, ... } }
  const m = metrics?.metrics || metrics || {}

  // Chart data from API metrics
  const clientEvolutionData = (m.customerEvolution || []).map(item => ({
    month: item.date ? new Date(item.date).toLocaleDateString('pt-BR', { month: 'short' }) : '',
    clientes: item.activatedCount || 0
  }))

  const billingData = (m.defaultVsRevenue || []).map(item => ({
    status: item.date ? new Date(item.date).toLocaleDateString('pt-BR', { month: 'short' }) : '',
    faturado: item.totalBilled || 0,
    inadimplente: item.totalOverdue || 0,
    pago: item.totalPaid || 0
  }))

  const planDistribution = (m.planDistribution || []).map(item => ({
    name: item.planName || 'Sem plano',
    value: item.customerCount || 0
  }))

  const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6']

  const kpiCards = [
    {
      title: 'Clientes Ativos',
      value: m.activeCustomers ?? '—',
      icon: Users,
      color: 'text-blue-400'
    },
    {
      title: 'Churn Rate (%)',
      value: m.churnRate !== undefined ? m.churnRate.toFixed(2) : '—',
      icon: TrendingDown,
      color: 'text-red-400'
    },
    {
      title: 'Inadimplência (%)',
      value: m.defaultRate !== undefined ? m.defaultRate.toFixed(2) : '—',
      icon: AlertCircle,
      color: 'text-amber-400'
    },
    {
      title: 'OS Abertas',
      value: m.openServiceOrders ?? '—',
      icon: Wrench,
      color: 'text-orange-400'
    },
    {
      title: 'Ativações do Mês',
      value: m.activationsThisMonth ?? '—',
      icon: CheckCircle2,
      color: 'text-green-400'
    },
  ]

  return (
    <div className="flex-1 flex flex-col bg-slate-900">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-8 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">Bem-vindo, {user?.name || 'Usuário'}</p>
        </div>
        <button
          onClick={handleLogoutClick}
          className="btn btn-secondary flex items-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-auto">
        {/* Controls Row */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8 items-start sm:items-center justify-between">
          {/* Provider Selector */}
          <div className="flex gap-4 items-end">
            {providers.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Provedor
                </label>
                <select
                  value={selectedProvider || ''}
                  onChange={(e) => setSelectedProvider(e.target.value)}
                  className="input bg-slate-800"
                >
                  {providers.map((provider) => (
                    <option key={provider._id || provider.id} value={provider._id || provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Period Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Período
              </label>
              <div className="flex gap-2">
                {['30d', '60d', '90d'].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-3 py-2 rounded text-sm font-medium transition-all ${
                      period === p
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {p === '30d' ? '30 dias' : p === '60d' ? '60 dias' : '90 dias'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Sync Button */}
          <button
            onClick={handleSync}
            disabled={syncing || !selectedProvider}
            className="btn btn-primary flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-900/20 border border-red-700/50 rounded p-4 mb-8 flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-200">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="loading mx-auto mb-4"></div>
              <p className="text-slate-400">Carregando dados...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Last Sync Info */}
            {lastSync && (
              <div className="text-xs text-slate-500 mb-6">
                Última sincronização: {new Date(lastSync).toLocaleString('pt-BR')}
              </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
              {kpiCards.map((kpi, index) => (
                <div key={index} className="card">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-slate-400 text-sm font-medium mb-2">{kpi.title}</p>
                      <p className="text-2xl font-bold text-white">{kpi.value}</p>
                    </div>
                    <kpi.icon className={`w-6 h-6 ${kpi.color}`} />
                  </div>
                </div>
              ))}
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Client Evolution Chart */}
              <div className="card">
                <h2 className="text-lg font-bold text-white mb-6">Evolução de Clientes</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={clientEvolutionData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="month" stroke="#64748b" />
                    <YAxis stroke="#64748b" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '0.375rem'
                      }}
                      labelStyle={{ color: '#f1f5f9' }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="clientes"
                      stroke="#2563eb"
                      dot={{ fill: '#2563eb', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Billing Status Chart */}
              <div className="card">
                <h2 className="text-lg font-bold text-white mb-6">Faturamento vs Inadimplência</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={billingData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="status" stroke="#64748b" />
                    <YAxis stroke="#64748b" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '0.375rem'
                      }}
                      labelStyle={{ color: '#f1f5f9' }}
                    />
                    <Legend />
                    <Bar dataKey="faturado" fill="#2563eb" name="Faturado" />
                    <Bar dataKey="inadimplente" fill="#ef4444" name="Inadimplente" />
                    <Bar dataKey="pago" fill="#10b981" name="Pago" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Plan Distribution Chart */}
              <div className="card lg:col-span-1">
                <h2 className="text-lg font-bold text-white mb-6">Clientes por Plano</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={planDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {planDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '0.375rem'
                      }}
                      labelStyle={{ color: '#f1f5f9' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

export default Dashboard
