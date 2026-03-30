import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { apiService } from '../services/api'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  RadialBarChart, RadialBar
} from 'recharts'
import {
  LogOut, RefreshCw, Users, TrendingDown, TrendingUp,
  AlertCircle, Wrench, CheckCircle2, DollarSign, Activity,
  ChevronDown
} from 'lucide-react'

/* ───────────────── helpers ───────────────── */

const formatBRL = (v) => {
  if (v == null || isNaN(v)) return 'R$ 0,00'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const formatCompact = (v) => {
  if (v == null || isNaN(v)) return '0'
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace('.', ',') + 'M'
  if (v >= 1_000) return (v / 1_000).toFixed(1).replace('.', ',') + 'k'
  return v.toLocaleString('pt-BR')
}

const formatPercent = (v) => {
  if (v == null || isNaN(v)) return '0,00%'
  return v.toFixed(2).replace('.', ',') + '%'
}

/* ───────────── custom tooltip ───────────── */

const ChartTooltip = ({ active, payload, label, isCurrency }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-800/95 backdrop-blur-sm border border-slate-600/50 rounded-xl px-4 py-3 shadow-2xl">
      <p className="text-slate-300 text-xs font-medium mb-2">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-slate-400">{entry.name}:</span>
          <span className="text-white font-semibold">
            {isCurrency ? formatBRL(entry.value) : formatCompact(entry.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

/* ──────────── custom pie label ──────────── */

const renderCustomPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) => {
  if (percent < 0.05) return null
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 1.4
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text
      x={x} y={y}
      fill="#cbd5e1"
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      className="text-xs"
    >
      {name} ({(percent * 100).toFixed(0)}%)
    </text>
  )
}

/* ───────────── KPI card ───────────── */

const KpiCard = ({ title, value, subtitle, icon: Icon, iconColor, iconBg, trend }) => (
  <div className="bg-gradient-to-br from-slate-800 to-slate-800/80 border border-slate-700/50 rounded-2xl p-5 hover:border-slate-600/50 transition-all duration-300 hover:shadow-lg hover:shadow-slate-900/50 group">
    <div className="flex items-start justify-between mb-3">
      <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center transition-transform duration-300 group-hover:scale-110`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      {trend !== undefined && trend !== null && (
        <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
          trend >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
        }`}>
          {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {Math.abs(trend).toFixed(1)}%
        </div>
      )}
    </div>
    <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
    <p className="text-slate-400 text-sm mt-1">{title}</p>
    {subtitle && <p className="text-slate-500 text-xs mt-0.5">{subtitle}</p>}
  </div>
)

/* ──────────── chart card wrapper ──────────── */

const ChartCard = ({ title, subtitle, children, className = '' }) => (
  <div className={`bg-gradient-to-br from-slate-800 to-slate-800/80 border border-slate-700/50 rounded-2xl p-6 hover:border-slate-600/50 transition-all duration-300 ${className}`}>
    <div className="mb-5">
      <h3 className="text-white font-semibold text-base">{title}</h3>
      {subtitle && <p className="text-slate-500 text-xs mt-1">{subtitle}</p>}
    </div>
    {children}
  </div>
)

/* ═══════════════ DASHBOARD ═══════════════ */

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

  /* ── data fetching ── */

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
        setError('Erro ao carregar metricas')
      } finally {
        setLoading(false)
      }
    }
    fetchMetrics()
  }, [selectedProvider, period])

  const handleLogout = () => { logout(); navigate('/login') }

  const handleSync = async () => {
    if (!selectedProvider || syncing) return
    setSyncing(true)
    try {
      await apiService.triggerSync(selectedProvider)
      setLastSync(new Date().toISOString())
      const response = await apiService.getMetrics(selectedProvider)
      setMetrics(response.data)
    } catch (err) {
      console.error('Failed to sync:', err)
      setError('Erro ao sincronizar dados')
    } finally {
      setSyncing(false)
    }
  }

  /* ── derived data ── */

  const m = metrics?.metrics || metrics || {}

  const clientEvolutionData = (m.customerEvolution || []).map(item => ({
    month: item.date ? new Date(item.date).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) : '',
    clientes: item.activatedCount || 0,
  }))

  const billingData = (m.defaultVsRevenue || []).map(item => ({
    month: item.date ? new Date(item.date).toLocaleDateString('pt-BR', { month: 'short' }) : '',
    faturado: item.totalBilled || 0,
    inadimplente: item.totalOverdue || 0,
    pago: item.totalPaid || 0,
  }))

  const planDistribution = (m.planDistribution || []).map(item => ({
    name: item.planName || 'Sem plano',
    value: item.customerCount || 0,
  })).sort((a, b) => b.value - a.value)

  const totalPlanCustomers = planDistribution.reduce((sum, p) => sum + p.value, 0)

  const COLORS = [
    '#6366f1', '#06b6d4', '#f59e0b', '#ef4444', '#10b981',
    '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b'
  ]

  /* ── KPI definitions ── */

  const kpiCards = [
    {
      title: 'Clientes Ativos',
      value: m.activeCustomers != null ? formatCompact(m.activeCustomers) : '—',
      icon: Users,
      iconColor: 'text-blue-400',
      iconBg: 'bg-blue-500/10',
    },
    {
      title: 'MRR',
      value: m.mrr != null ? formatBRL(m.mrr) : '—',
      subtitle: m.arpu != null ? `ARPU: ${formatBRL(m.arpu)}` : undefined,
      icon: DollarSign,
      iconColor: 'text-emerald-400',
      iconBg: 'bg-emerald-500/10',
    },
    {
      title: 'Churn Rate',
      value: m.churnRate != null ? formatPercent(m.churnRate) : '—',
      icon: TrendingDown,
      iconColor: 'text-red-400',
      iconBg: 'bg-red-500/10',
    },
    {
      title: 'Inadimplencia',
      value: m.defaultRate != null ? formatPercent(m.defaultRate) : '—',
      icon: AlertCircle,
      iconColor: 'text-amber-400',
      iconBg: 'bg-amber-500/10',
    },
    {
      title: 'Ativacoes do Mes',
      value: m.activationsThisMonth != null ? formatCompact(m.activationsThisMonth) : '—',
      icon: CheckCircle2,
      iconColor: 'text-green-400',
      iconBg: 'bg-green-500/10',
    },
    {
      title: 'OS Abertas',
      value: m.openServiceOrders != null ? formatCompact(m.openServiceOrders) : '—',
      icon: Wrench,
      iconColor: 'text-orange-400',
      iconBg: 'bg-orange-500/10',
    },
  ]

  /* ── radial gauge for default rate ── */

  const defaultGauge = [
    { name: 'Inadimplencia', value: Math.min(m.defaultRate || 0, 100), fill: '#f59e0b' },
  ]

  /* ═══════════════ RENDER ═══════════════ */

  return (
    <div className="flex-1 flex flex-col bg-slate-950 min-h-screen">
      {/* ─── Header ─── */}
      <header className="bg-slate-900/80 backdrop-blur-sm border-b border-slate-800 px-8 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">ISP Analytics BI</h1>
            <p className="text-slate-500 text-xs">
              {user?.name || 'Usuario'}
              {lastSync && (
                <span className="ml-2 text-slate-600">
                  &middot; Sync: {new Date(lastSync).toLocaleString('pt-BR')}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Sync button */}
          <button
            onClick={handleSync}
            disabled={syncing || !selectedProvider}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium rounded-xl transition-all duration-200 active:scale-95"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all duration-200 text-sm"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ─── Main ─── */}
      <main className="flex-1 p-6 lg:p-8 overflow-auto">
        {/* Controls */}
        <div className="flex flex-wrap gap-3 mb-6 items-center">
          {providers.length > 1 && (
            <div className="relative">
              <select
                value={selectedProvider || ''}
                onChange={(e) => setSelectedProvider(e.target.value)}
                className="appearance-none bg-slate-800 border border-slate-700 text-white text-sm rounded-xl pl-4 pr-10 py-2.5 focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all cursor-pointer"
              >
                {providers.map((p) => (
                  <option key={p._id || p.id} value={p._id || p.id}>{p.name}</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          )}

          <div className="flex bg-slate-800/80 border border-slate-700/50 rounded-xl p-1">
            {['30d', '60d', '90d'].map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  period === p
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {p === '30d' ? '30 dias' : p === '60d' ? '60 dias' : '90 dias'}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
              <p className="text-slate-500 text-sm">Carregando dados...</p>
            </div>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
              {kpiCards.map((kpi, i) => <KpiCard key={i} {...kpi} />)}
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

              {/* ── Customer Evolution (AreaChart) ── */}
              <ChartCard
                title="Evolucao de Clientes"
                subtitle="Ativacoes por periodo"
                className="lg:col-span-2"
              >
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={clientEvolutionData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradClientes" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="month"
                      stroke="#475569"
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      axisLine={{ stroke: '#1e293b' }}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="#475569"
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="clientes"
                      name="Clientes"
                      stroke="#6366f1"
                      strokeWidth={2.5}
                      fill="url(#gradClientes)"
                      dot={{ fill: '#6366f1', stroke: '#1e1b4b', strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6, stroke: '#6366f1', strokeWidth: 2, fill: '#fff' }}
                      animationDuration={1200}
                      animationEasing="ease-out"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* ── Plan Distribution (Donut) ── */}
              <ChartCard
                title="Clientes por Plano"
                subtitle={`${totalPlanCustomers} clientes no total`}
              >
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie
                      data={planDistribution}
                      cx="50%"
                      cy="45%"
                      innerRadius={60}
                      outerRadius={95}
                      paddingAngle={3}
                      dataKey="value"
                      label={renderCustomPieLabel}
                      animationDuration={1000}
                      animationEasing="ease-out"
                    >
                      {planDistribution.map((_, i) => (
                        <Cell
                          key={i}
                          fill={COLORS[i % COLORS.length]}
                          stroke="transparent"
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const d = payload[0]
                        return (
                          <div className="bg-slate-800/95 backdrop-blur-sm border border-slate-600/50 rounded-xl px-4 py-3 shadow-2xl">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.payload.fill }} />
                              <span className="text-white font-semibold">{d.name}</span>
                            </div>
                            <p className="text-slate-300 text-xs mt-1">
                              {d.value} clientes ({totalPlanCustomers > 0 ? ((d.value / totalPlanCustomers) * 100).toFixed(1) : 0}%)
                            </p>
                          </div>
                        )
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* ── Billing Chart (BarChart) ── */}
              <ChartCard
                title="Faturamento vs Inadimplencia"
                subtitle="Comparativo mensal (R$)"
                className="lg:col-span-2"
              >
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={billingData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} barCategoryGap="20%">
                    <defs>
                      <linearGradient id="gradFaturado" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={1} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0.6} />
                      </linearGradient>
                      <linearGradient id="gradPago" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.6} />
                      </linearGradient>
                      <linearGradient id="gradInadimplente" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity={1} />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0.6} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="month"
                      stroke="#475569"
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      axisLine={{ stroke: '#1e293b' }}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="#475569"
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => formatCompact(v)}
                    />
                    <Tooltip content={<ChartTooltip isCurrency />} />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ paddingTop: 16, fontSize: 12, color: '#94a3b8' }}
                    />
                    <Bar
                      dataKey="faturado"
                      name="Faturado"
                      fill="url(#gradFaturado)"
                      radius={[6, 6, 0, 0]}
                      animationDuration={1000}
                    />
                    <Bar
                      dataKey="pago"
                      name="Pago"
                      fill="url(#gradPago)"
                      radius={[6, 6, 0, 0]}
                      animationDuration={1000}
                    />
                    <Bar
                      dataKey="inadimplente"
                      name="Inadimplente"
                      fill="url(#gradInadimplente)"
                      radius={[6, 6, 0, 0]}
                      animationDuration={1000}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* ── Summary / Gauge ── */}
              <ChartCard title="Saude Financeira" subtitle="Indicadores-chave">
                <div className="flex flex-col items-center justify-center h-[320px] gap-4">
                  {/* Radial gauge for default rate */}
                  <ResponsiveContainer width="100%" height={160}>
                    <RadialBarChart
                      cx="50%"
                      cy="100%"
                      innerRadius={80}
                      outerRadius={120}
                      startAngle={180}
                      endAngle={0}
                      data={defaultGauge}
                      barSize={12}
                    >
                      <RadialBar
                        background={{ fill: '#1e293b' }}
                        dataKey="value"
                        cornerRadius={6}
                        animationDuration={1200}
                      />
                    </RadialBarChart>
                  </ResponsiveContainer>

                  <div className="text-center -mt-8">
                    <p className="text-3xl font-bold text-white">
                      {m.defaultRate != null ? formatPercent(m.defaultRate) : '—'}
                    </p>
                    <p className="text-slate-500 text-xs mt-1">Taxa de Inadimplencia</p>
                  </div>

                  <div className="w-full grid grid-cols-2 gap-3 mt-2">
                    <div className="bg-slate-900/60 rounded-xl p-3 text-center">
                      <p className="text-white font-semibold text-sm">
                        {m.mrr != null ? formatBRL(m.mrr) : '—'}
                      </p>
                      <p className="text-slate-500 text-xs mt-0.5">MRR</p>
                    </div>
                    <div className="bg-slate-900/60 rounded-xl p-3 text-center">
                      <p className="text-white font-semibold text-sm">
                        {m.arpu != null ? formatBRL(m.arpu) : '—'}
                      </p>
                      <p className="text-slate-500 text-xs mt-0.5">ARPU</p>
                    </div>
                  </div>
                </div>
              </ChartCard>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

export default Dashboard
