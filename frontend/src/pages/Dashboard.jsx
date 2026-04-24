import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { apiService } from '../services/api'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  RadialBarChart, RadialBar, LineChart, Line
} from 'recharts'
import {
  RefreshCw, Users, TrendingDown, TrendingUp,
  AlertCircle, Wrench, CheckCircle2, DollarSign, Activity,
  ChevronDown, Wifi
} from 'lucide-react'

/* ═══════════════ HELPERS ═══════════════ */

const fmt = {
  brl: (v) => {
    if (v == null || isNaN(v)) return 'R$ 0,00'
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  },
  compact: (v) => {
    if (v == null || isNaN(v)) return '0'
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace('.', ',') + 'M'
    if (v >= 1_000) return (v / 1_000).toFixed(1).replace('.', ',') + 'k'
    return v.toLocaleString('pt-BR')
  },
  pct: (v) => {
    if (v == null || isNaN(v)) return '0,00%'
    return v.toFixed(2).replace('.', ',') + '%'
  },
  num: (v) => {
    if (v == null || isNaN(v)) return '0'
    return v.toLocaleString('pt-BR')
  }
}

/* ═══════════════ THEME COLORS ═══════════════ */

const T = {
  bg: '#0f0a1e',
  card: '#1a1232',
  cardBorder: '#2d2152',
  cardHover: '#231a45',
  accent: '#7c3aed',    // purple accent
  cyan: '#06d6a0',      // cyan/teal for gauges
  gold: '#f5a623',      // yellow/gold bars
  pink: '#e74fc4',      // pink/magenta labels
  orange: '#f97316',
  red: '#ef4444',
  green: '#10b981',
  blue: '#3b82f6',
  textPrimary: '#f1f5f9',
  textSecondary: '#a78bfa',
  textMuted: '#7c6fa0',
  gridLine: '#1e1640',
}

const PLAN_COLORS = ['#f5a623', '#06d6a0', '#e74fc4', '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#ec4899', '#64748b']

/* ═══════════════ COMPONENTS ═══════════════ */

/* ── Gauge (radial half-circle) ── */
const GaugeChart = ({ value, max = 100, label, color = T.cyan, size = 100 }) => {
  const pct = Math.min((value || 0) / max * 100, 100)
  const data = [{ value: pct, fill: color }]
  return (
    <div className="flex flex-col items-center">
      <div style={{ width: size, height: size * 0.6 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%" cy="100%"
            innerRadius="65%" outerRadius="100%"
            startAngle={180} endAngle={0}
            data={data} barSize={8}
          >
            <RadialBar background={{ fill: '#1e1640' }} dataKey="value" cornerRadius={4} animationDuration={1000} />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-lg font-bold mt-[-8px]" style={{ color }}>{fmt.pct(value)}</p>
      {label && <p className="text-[10px] mt-0.5" style={{ color: T.textMuted }}>{label}</p>}
    </div>
  )
}

/* ── KPI Big Number Card ── */
const KpiCard = ({ value, label, sub, color = T.cyan, small = false }) => (
  <div
    className="rounded-xl p-3 transition-all duration-200 hover:scale-[1.02]"
    style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}
  >
    <p className={`font-bold ${small ? 'text-lg' : 'text-2xl'} tracking-tight`} style={{ color }}>
      {value}
    </p>
    <p className="text-[11px] font-medium mt-0.5" style={{ color: T.pink }}>{label}</p>
    {sub && <p className="text-[10px] mt-0.5" style={{ color: T.textMuted }}>{sub}</p>}
  </div>
)

/* ── Mini Sparkline ── */
const Sparkline = ({ data, dataKey, color = T.cyan, height = 40 }) => (
  <ResponsiveContainer width="100%" height={height}>
    <LineChart data={data}>
      <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} dot={false} animationDuration={800} />
    </LineChart>
  </ResponsiveContainer>
)

/* ── Section Header ── */
const SectionTitle = ({ children }) => (
  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: T.pink }}>{children}</p>
)

/* ── Data Table Row ── */
const TableRow = ({ label, value, pct, highlight, isTotal }) => (
  <div
    className={`flex items-center gap-2 px-3 py-1.5 text-xs ${isTotal ? 'border-t mt-1 pt-2' : ''}`}
    style={{
      borderColor: T.cardBorder,
      color: highlight ? T.gold : T.textPrimary,
      fontWeight: isTotal || highlight ? 700 : 400,
    }}
  >
    {!isTotal && (
      <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: highlight ? T.gold : T.textMuted }} />
    )}
    <span className="flex-1 truncate">{label}</span>
    <span className="w-14 text-right font-mono" style={{ color: T.cyan }}>{fmt.num(value)}</span>
    <span className="w-14 text-right font-mono" style={{ color: T.textMuted }}>{pct}</span>
  </div>
)

/* ── Custom Tooltip ── */
const ChartTooltip = ({ active, payload, label, isCurrency }) => {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-lg px-3 py-2 shadow-xl text-xs"
      style={{ background: '#1e1640ee', border: `1px solid ${T.cardBorder}` }}
    >
      <p className="font-medium mb-1" style={{ color: T.pink }}>{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span style={{ color: T.textMuted }}>{entry.name}:</span>
          <span className="font-bold" style={{ color: T.textPrimary }}>
            {isCurrency ? fmt.brl(entry.value) : fmt.num(entry.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

/* ═══════════════ MAIN DASHBOARD ═══════════════ */

export const Dashboard = () => {
  const { user } = useAuth()

  const [providers, setProviders] = useState([])
  const [selectedProvider, setSelectedProvider] = useState(null)
  const [period, setPeriod] = useState('30d')
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState(null)

  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const response = await apiService.getProviders()
        const list = response.data.providers || []
        setProviders(list)
        if (list.length > 0) setSelectedProvider(list[0]._id || list[0].id)
      } catch (err) {
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
        const response = await apiService.getMetrics(selectedProvider, parseInt(period))
        setMetrics(response.data)
        setLastSync(response.data.lastSync)
      } catch (err) {
        setError('Erro ao carregar metricas')
      } finally {
        setLoading(false)
      }
    }
    fetchMetrics()
  }, [selectedProvider, period])

  const handleSync = async () => {
    if (!selectedProvider || syncing) return
    setSyncing(true)
    try {
      await apiService.triggerSync(selectedProvider)
      setLastSync(new Date().toISOString())
      const response = await apiService.getMetrics(selectedProvider, parseInt(period))
      setMetrics(response.data)
    } catch (err) {
      setError('Erro ao sincronizar dados')
    } finally {
      setSyncing(false)
    }
  }

  /* ── Derived Data ── */
  const m = metrics?.metrics || metrics || {}

  const clientEvolution = useMemo(() =>
    (m.customerEvolution || []).map(item => ({
      month: item.date ? new Date(item.date).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) : '',
      clientes: item.activatedCount || 0,
    })), [m.customerEvolution])

  const billingData = useMemo(() =>
    (m.defaultVsRevenue || []).map(item => ({
      month: item.date ? new Date(item.date).toLocaleDateString('pt-BR', { month: 'short' }) : '',
      faturado: item.totalBilled || 0,
      inadimplente: item.totalOverdue || 0,
      pago: item.totalPaid || 0,
    })), [m.defaultVsRevenue])

  const planDist = useMemo(() =>
    (m.planDistribution || [])
      .map(item => ({ name: item.planName || 'Sem plano', value: item.customerCount || 0 }))
      .sort((a, b) => b.value - a.value),
    [m.planDistribution])

  const totalPlanCustomers = planDist.reduce((s, p) => s + p.value, 0)

  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysPassed = now.getDate()
  const daysRemaining = daysInMonth - daysPassed

  const currentProviderName = providers.find(p => (p._id || p.id) === selectedProvider)?.name || 'Provedor'

  /* ═══════════════ RENDER ═══════════════ */

  return (
    <div className="flex-1 flex flex-col min-h-screen overflow-auto" style={{ background: T.bg }}>
      {/* ─── Top Bar ─── */}
      <header
        className="flex items-center justify-between px-6 py-3 sticky top-0 z-20"
        style={{ background: '#150f2bdd', backdropFilter: 'blur(8px)', borderBottom: `1px solid ${T.cardBorder}` }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f5a623, #e74fc4)' }}>
            <Wifi className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="text-sm font-bold" style={{ color: T.gold }}>Financeiro</span>
            <span className="text-sm font-bold" style={{ color: T.textMuted }}> — Analiticos</span>
          </div>
        </div>

        {/* Center: Days info */}
        <div className="hidden md:flex items-center gap-6 text-center">
          <div>
            <p className="text-[10px] font-medium" style={{ color: T.textMuted }}>Dias Uteis</p>
            <p className="text-sm font-bold" style={{ color: T.cyan }}>{Math.round(daysPassed * 5 / 7)}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium" style={{ color: T.textMuted }}>Dias Corridos</p>
            <p className="text-sm font-bold" style={{ color: T.textPrimary }}>{daysPassed}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium" style={{ color: T.textMuted }}>Dias Restantes</p>
            <p className="text-sm font-bold" style={{ color: T.gold }}>{daysRemaining}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium" style={{ color: T.textMuted }}>Data</p>
            <p className="text-sm font-bold" style={{ color: T.textPrimary }}>{now.toLocaleDateString('pt-BR')}</p>
          </div>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          {providers.length >= 1 && (
            <div className="relative">
              <select
                value={selectedProvider || ''}
                onChange={(e) => setSelectedProvider(e.target.value)}
                className="appearance-none text-xs rounded-lg pl-3 pr-8 py-2 cursor-pointer focus:outline-none"
                style={{ background: T.card, border: `1px solid ${T.cardBorder}`, color: T.textPrimary }}
              >
                {providers.map(p => (
                  <option key={p._id || p.id} value={p._id || p.id}>{p.name}</option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: T.textMuted }} />
            </div>
          )}

          <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${T.cardBorder}` }}>
            {['30d', '60d', '90d'].map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className="px-3 py-1.5 text-[11px] font-medium transition-all"
                style={{
                  background: period === p ? T.accent : 'transparent',
                  color: period === p ? '#fff' : T.textMuted,
                }}
              >
                {p.replace('d', 'D')}
              </button>
            ))}
          </div>

          <button
            onClick={handleSync}
            disabled={syncing || !selectedProvider}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all disabled:opacity-40"
            style={{ background: T.accent, color: '#fff' }}
          >
            <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sync...' : 'Sincronizar'}
          </button>

          {/* Logout handled by sidebar Layout */}
        </div>
      </header>

      {/* ─── Main Content ─── */}
      <main className="flex-1 p-4 lg:p-5">
        {/* Error */}
        {error && (
          <div className="rounded-xl p-3 mb-4 flex items-center gap-2 text-xs" style={{ background: '#2d0a1b', border: '1px solid #5c1a2a' }}>
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <p className="text-red-300">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <div className="w-10 h-10 border-2 rounded-full animate-spin mx-auto mb-3" style={{ borderColor: `${T.accent}33`, borderTopColor: T.accent }} />
              <p className="text-xs" style={{ color: T.textMuted }}>Carregando dados...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* ═══ ROW 1: KPI Cards + Gauges ═══ */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <KpiCard
                value={fmt.num(m.activeCustomers || 0)}
                label="# Clientes Ativos"
                color={T.cyan}
              />
              <KpiCard
                value={fmt.brl(m.mrr || 0)}
                label="# MRR"
                sub={`ARPU: ${fmt.brl(m.arpu || 0)}`}
                color={T.gold}
              />
              <KpiCard
                value={fmt.num(m.activationsThisMonth || 0)}
                label="# Ativacoes Mes"
                color={T.green}
              />
              <KpiCard
                value={fmt.num(m.openServiceOrders || 0)}
                label="# OS Abertas"
                color={T.orange}
              />

              {/* Gauges */}
              <div
                className="rounded-xl p-3 flex flex-col items-center justify-center"
                style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}
              >
                <GaugeChart value={m.churnRate || 0} max={20} label="% Churn" color={T.cyan} size={90} />
              </div>
              <div
                className="rounded-xl p-3 flex flex-col items-center justify-center"
                style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}
              >
                <GaugeChart value={m.defaultRate || 0} max={50} label="% Inadimplencia" color={T.gold} size={90} />
              </div>
            </div>

            {/* ═══ ROW 2: Charts ═══ */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">

              {/* ── Pie: Clientes por Plano ── */}
              <div
                className="lg:col-span-3 rounded-xl p-4"
                style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}
              >
                <SectionTitle>Clientes por Plano</SectionTitle>
                <div className="flex items-center justify-center" style={{ height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={planDist}
                        cx="50%" cy="50%"
                        innerRadius={0}
                        outerRadius={80}
                        paddingAngle={1}
                        dataKey="value"
                        animationDuration={800}
                        label={({ name, percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''}
                        labelLine={false}
                      >
                        {planDist.map((_, i) => (
                          <Cell key={i} fill={PLAN_COLORS[i % PLAN_COLORS.length]} stroke="transparent" />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null
                          const d = payload[0]
                          return (
                            <div className="rounded-lg px-3 py-2 text-xs shadow-xl" style={{ background: '#1e1640ee', border: `1px solid ${T.cardBorder}` }}>
                              <p className="font-bold" style={{ color: T.textPrimary }}>{d.name}</p>
                              <p style={{ color: T.textMuted }}>{d.value} clientes ({totalPlanCustomers > 0 ? ((d.value / totalPlanCustomers) * 100).toFixed(1) : 0}%)</p>
                            </div>
                          )
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Legend */}
                <div className="mt-2 space-y-1">
                  {planDist.slice(0, 5).map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-[10px]">
                      <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: PLAN_COLORS[i % PLAN_COLORS.length] }} />
                      <span className="flex-1 truncate" style={{ color: T.textMuted }}>{p.name}</span>
                      <span className="font-bold" style={{ color: T.textPrimary }}>{fmt.num(p.value)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Middle: Sparklines + Revenue ── */}
              <div className="lg:col-span-5 flex flex-col gap-3">
                {/* Revenue KPIs row */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl p-3" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
                    <p className="text-lg font-bold" style={{ color: T.cyan }}>
                      {fmt.brl(billingData.reduce((s, b) => s + b.faturado, 0))}
                    </p>
                    <p className="text-[10px] font-medium" style={{ color: T.pink }}># Total Faturado</p>
                    <Sparkline data={billingData} dataKey="faturado" color={T.cyan} />
                  </div>
                  <div className="rounded-xl p-3" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
                    <p className="text-lg font-bold" style={{ color: T.green }}>
                      {fmt.brl(billingData.reduce((s, b) => s + b.pago, 0))}
                    </p>
                    <p className="text-[10px] font-medium" style={{ color: T.pink }}># Total Pago</p>
                    <Sparkline data={billingData} dataKey="pago" color={T.green} />
                  </div>
                  <div className="rounded-xl p-3" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
                    <p className="text-lg font-bold" style={{ color: T.red }}>
                      {fmt.brl(billingData.reduce((s, b) => s + b.inadimplente, 0))}
                    </p>
                    <p className="text-[10px] font-medium" style={{ color: T.pink }}># Inadimplente</p>
                    <Sparkline data={billingData} dataKey="inadimplente" color={T.red} />
                  </div>
                </div>

                {/* Customer Evolution AreaChart */}
                <div className="rounded-xl p-4 flex-1" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
                  <SectionTitle>Evolucao de Clientes</SectionTitle>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={clientEvolution} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gEvo" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={T.cyan} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={T.cyan} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.gridLine} />
                      <XAxis dataKey="month" tick={{ fill: T.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: T.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Area
                        type="monotone" dataKey="clientes" name="Clientes"
                        stroke={T.cyan} strokeWidth={2} fill="url(#gEvo)"
                        dot={{ fill: T.cyan, stroke: T.card, strokeWidth: 2, r: 3 }}
                        activeDot={{ r: 5, stroke: T.cyan, strokeWidth: 2, fill: '#fff' }}
                        animationDuration={1000}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* ── Right: Plan Table ── */}
              <div
                className="lg:col-span-4 rounded-xl p-4"
                style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}
              >
                <SectionTitle>Distribuicao por Plano</SectionTitle>
                <div className="mt-2">
                  {/* Table Header */}
                  <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-semibold" style={{ color: T.pink, borderBottom: `1px solid ${T.cardBorder}` }}>
                    <span className="w-2" />
                    <span className="flex-1">Plano</span>
                    <span className="w-14 text-right">Valor</span>
                    <span className="w-14 text-right">%</span>
                  </div>
                  {/* Table Body */}
                  <div className="max-h-[280px] overflow-y-auto custom-scrollbar">
                    {planDist.map((p, i) => {
                      const pct = totalPlanCustomers > 0 ? (p.value / totalPlanCustomers * 100).toFixed(2) + '%' : '0%'
                      const isTop = i < 3
                      return (
                        <TableRow
                          key={i}
                          label={p.name}
                          value={p.value}
                          pct={pct}
                          highlight={isTop}
                        />
                      )
                    })}
                    <TableRow
                      label="Total"
                      value={totalPlanCustomers}
                      pct="100%"
                      isTotal
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ═══ ROW 3: Bar Chart (full width) ═══ */}
            <div
              className="rounded-xl p-4"
              style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}
            >
              <SectionTitle>Faturamento vs Inadimplencia vs Pago</SectionTitle>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={billingData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }} barCategoryGap="15%">
                  <defs>
                    <linearGradient id="gFat" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={T.gold} stopOpacity={1} />
                      <stop offset="100%" stopColor={T.gold} stopOpacity={0.5} />
                    </linearGradient>
                    <linearGradient id="gPago" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={T.cyan} stopOpacity={1} />
                      <stop offset="100%" stopColor={T.cyan} stopOpacity={0.5} />
                    </linearGradient>
                    <linearGradient id="gInad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={T.pink} stopOpacity={1} />
                      <stop offset="100%" stopColor={T.pink} stopOpacity={0.5} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.gridLine} />
                  <XAxis dataKey="month" tick={{ fill: T.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: T.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmt.compact} />
                  <Tooltip content={<ChartTooltip isCurrency />} />
                  <Legend
                    iconType="circle" iconSize={7}
                    wrapperStyle={{ fontSize: 11, color: T.textMuted, paddingTop: 8 }}
                  />
                  <Bar dataKey="faturado" name="Faturado" fill="url(#gFat)" radius={[4, 4, 0, 0]} animationDuration={800} />
                  <Bar dataKey="pago" name="Pago" fill="url(#gPago)" radius={[4, 4, 0, 0]} animationDuration={800} />
                  <Bar dataKey="inadimplente" name="Inadimplente" fill="url(#gInad)" radius={[4, 4, 0, 0]} animationDuration={800} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* ── Footer: Last sync ── */}
            {lastSync && (
              <div className="text-center pb-2">
                <p className="text-[10px]" style={{ color: T.textMuted }}>
                  Ultima sincronizacao: {new Date(lastSync).toLocaleString('pt-BR')} &middot; {currentProviderName}
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Custom scrollbar styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: ${T.bg}; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: ${T.cardBorder}; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: ${T.accent}; }
      `}</style>
    </div>
  )
}

export default Dashboard
