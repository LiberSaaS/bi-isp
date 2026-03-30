import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { apiService } from '../services/api'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar, LineChart, Line, Legend
} from 'recharts'
import {
  RefreshCw, Users, TrendingUp, TrendingDown,
  AlertCircle, DollarSign, UserPlus, UserMinus,
  ChevronDown, Calendar, Target, Zap, ArrowUpRight, ArrowDownRight
} from 'lucide-react'

/* ═══════════════ THEME ═══════════════ */
const T = {
  bg: '#0f0a1e',
  card: '#1a1232',
  cardBorder: '#2d2152',
  accent: '#7c3aed',
  cyan: '#06d6a0',
  gold: '#f5a623',
  pink: '#e74fc4',
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
const STATUS_COLORS = { active: T.cyan, blocked: T.red, cancelled: T.orange, pending: T.gold, other: T.textMuted }

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

/* ═══════════════ SUB-COMPONENTS ═══════════════ */

const SectionTitle = ({ children }) => (
  <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: T.pink }}>{children}</p>
)

const ChartTooltip = ({ active, payload, label, isCurrency }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg px-3 py-2 shadow-xl text-xs" style={{ background: '#1e1640ee', border: `1px solid ${T.cardBorder}` }}>
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

/* ── Big KPI Card (like Power BI) ── */
const BigKpi = ({ value, label, sublabel, color = T.cyan, icon: Icon, trend, trendLabel }) => (
  <div className="rounded-xl p-4 transition-all hover:scale-[1.01]" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
    <div className="flex items-start justify-between">
      <div>
        <p className="text-2xl font-bold tracking-tight" style={{ color }}>{value}</p>
        <p className="text-[10px] font-semibold mt-1" style={{ color: T.pink }}>{label}</p>
        {sublabel && <p className="text-[9px] mt-0.5" style={{ color: T.textMuted }}>{sublabel}</p>}
      </div>
      <div className="flex flex-col items-end gap-1">
        {Icon && (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
            <Icon className="w-4 h-4" style={{ color }} />
          </div>
        )}
        {trend !== undefined && (
          <div className="flex items-center gap-0.5 text-[9px] font-medium" style={{ color: trend >= 0 ? T.green : T.red }}>
            {trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(trend).toFixed(1)}%
            {trendLabel && <span style={{ color: T.textMuted }}> {trendLabel}</span>}
          </div>
        )}
      </div>
    </div>
  </div>
)

/* ── Gauge (half-circle) ── */
const Gauge = ({ value, max = 100, label, subLabel, color = T.cyan, targetLabel }) => {
  const pct = Math.min((value || 0) / max * 100, 100)
  const data = [{ value: pct, fill: color }]
  return (
    <div className="rounded-xl p-3 flex flex-col items-center justify-center" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
      <div style={{ width: 100, height: 55 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart cx="50%" cy="100%" innerRadius="60%" outerRadius="100%" startAngle={180} endAngle={0} data={data} barSize={8}>
            <RadialBar background={{ fill: '#1e1640' }} dataKey="value" cornerRadius={4} animationDuration={1000} />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-lg font-bold -mt-1" style={{ color }}>{fmt.pct(value)}</p>
      <p className="text-[10px] font-semibold" style={{ color: T.pink }}>{label}</p>
      {targetLabel && <p className="text-[9px]" style={{ color: T.textMuted }}>{targetLabel}</p>}
    </div>
  )
}

/* ── Sparkline with value ── */
const SparkKpi = ({ value, label, data, dataKey, color = T.cyan }) => (
  <div className="rounded-xl p-3" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
    <p className="text-base font-bold" style={{ color }}>{value}</p>
    <p className="text-[9px] font-semibold mb-1" style={{ color: T.pink }}>{label}</p>
    <div style={{ height: 32 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} dot={false} animationDuration={600} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </div>
)

/* ── Table Row ── */
const TRow = ({ label, value, pct, color, bold, borderTop }) => (
  <div
    className={`flex items-center gap-2 px-3 py-1.5 text-[11px] ${borderTop ? 'mt-1 pt-2' : ''}`}
    style={{ borderTop: borderTop ? `1px solid ${T.cardBorder}` : 'none', fontWeight: bold ? 700 : 400 }}
  >
    {!bold && <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: color || T.textMuted }} />}
    <span className="flex-1 truncate" style={{ color: T.textPrimary }}>{label}</span>
    <span className="w-14 text-right font-mono font-bold" style={{ color: T.cyan }}>{fmt.num(value)}</span>
    <span className="w-16 text-right font-mono" style={{ color: T.textMuted }}>{pct}</span>
  </div>
)

/* ═══════════════ MAIN COMPONENT ═══════════════ */

export const Comercial = () => {
  const { user } = useAuth()
  const [providers, setProviders] = useState([])
  const [selectedProvider, setSelectedProvider] = useState(null)
  const [period, setPeriod] = useState('30d')
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await apiService.getProviders()
        const list = res.data.providers || []
        setProviders(list)
        if (list.length > 0) setSelectedProvider(list[0]._id || list[0].id)
      } catch { setError('Erro ao carregar provedores') }
    }
    fetch()
  }, [])

  useEffect(() => {
    if (!selectedProvider) return
    const fetch = async () => {
      setLoading(true); setError('')
      try {
        const res = await apiService.getMetrics(selectedProvider)
        setMetrics(res.data)
      } catch { setError('Erro ao carregar metricas') }
      finally { setLoading(false) }
    }
    fetch()
  }, [selectedProvider, period])

  const handleSync = async () => {
    if (!selectedProvider || syncing) return
    setSyncing(true)
    try {
      await apiService.triggerSync(selectedProvider)
      const res = await apiService.getMetrics(selectedProvider)
      setMetrics(res.data)
    } catch { setError('Erro ao sincronizar') }
    finally { setSyncing(false) }
  }

  /* ── Derived Data ── */
  const m = metrics?.metrics || metrics || {}

  const clientEvolution = useMemo(() =>
    (m.customerEvolution || []).map(item => ({
      month: item.date ? new Date(item.date).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) : '',
      ativacoes: item.activatedCount || 0,
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

  // Compute status distribution from planDistribution or use fallback
  const statusData = useMemo(() => {
    const active = m.activeCustomers || 0
    const activations = m.activationsThisMonth || 0
    // Infer some status categories from available data
    return [
      { label: 'Ativos', value: active, color: T.cyan },
      { label: 'Ativacoes Mes', value: activations, color: T.green },
      { label: 'Inadimplentes', value: m.defaultRate ? Math.round(active * m.defaultRate / 100) : 0, color: T.gold },
      { label: 'Churn (cancelados)', value: m.churnRate ? Math.round(active * m.churnRate / 100) : 0, color: T.red },
      { label: 'OS Abertas', value: m.openServiceOrders || 0, color: T.orange },
    ]
  }, [m])

  const statusTotal = statusData.reduce((s, d) => s + d.value, 0)

  // Computed KPIs
  const totalFaturado = billingData.reduce((s, b) => s + b.faturado, 0)
  const totalPago = billingData.reduce((s, b) => s + b.pago, 0)
  const totalInadimplente = billingData.reduce((s, b) => s + b.inadimplente, 0)
  const taxaConversao = totalFaturado > 0 ? (totalPago / totalFaturado * 100) : 0

  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysPassed = now.getDate()
  const daysRemaining = daysInMonth - daysPassed
  const diasUteis = Math.round(daysPassed * 5 / 7)

  const providerName = providers.find(p => (p._id || p.id) === selectedProvider)?.name || 'Provedor'

  /* ═══════════════ RENDER ═══════════════ */
  return (
    <div className="flex-1 flex flex-col min-h-screen overflow-auto" style={{ background: T.bg }}>
      {/* ─── Header ─── */}
      <header className="flex items-center justify-between px-5 py-3 sticky top-0 z-10" style={{ background: '#150f2bdd', backdropFilter: 'blur(8px)', borderBottom: `1px solid ${T.cardBorder}` }}>
        <div>
          <h1 className="text-sm font-bold" style={{ color: T.textPrimary }}>
            <span style={{ color: T.gold }}>Comercial</span> — Analiticos
          </h1>
          <p className="text-[10px]" style={{ color: T.textMuted }}>{user?.name || 'Usuario'} &middot; {providerName}</p>
        </div>

        {/* Center: Days */}
        <div className="hidden md:flex items-center gap-5">
          {[
            { label: 'Dias Uteis', value: diasUteis, color: T.cyan },
            { label: 'Dias Corridos', value: daysPassed, color: T.textPrimary },
            { label: 'Dias Restantes', value: daysRemaining, color: T.gold },
            { label: 'Data', value: now.toLocaleDateString('pt-BR'), color: T.textPrimary },
          ].map((d, i) => (
            <div key={i} className="text-center">
              <p className="text-[9px] font-medium" style={{ color: T.textMuted }}>{d.label}</p>
              <p className="text-xs font-bold" style={{ color: d.color }}>{d.value}</p>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {providers.length > 1 && (
            <div className="relative">
              <select
                value={selectedProvider || ''}
                onChange={e => setSelectedProvider(e.target.value)}
                className="appearance-none text-[11px] rounded-lg pl-3 pr-7 py-1.5 cursor-pointer focus:outline-none"
                style={{ background: T.card, border: `1px solid ${T.cardBorder}`, color: T.textPrimary }}
              >
                {providers.map(p => <option key={p._id || p.id} value={p._id || p.id}>{p.name}</option>)}
              </select>
              <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: T.textMuted }} />
            </div>
          )}
          <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${T.cardBorder}` }}>
            {['30d', '60d', '90d'].map(p => (
              <button key={p} onClick={() => setPeriod(p)} className="px-2.5 py-1 text-[10px] font-medium transition-all" style={{ background: period === p ? T.accent : 'transparent', color: period === p ? '#fff' : T.textMuted }}>{p.replace('d', 'D')}</button>
            ))}
          </div>
          <button onClick={handleSync} disabled={syncing} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-medium disabled:opacity-40" style={{ background: T.accent, color: '#fff' }}>
            <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sync...' : 'Sync'}
          </button>
        </div>
      </header>

      {/* ─── Body ─── */}
      <main className="flex-1 p-4 lg:p-5">
        {error && (
          <div className="rounded-xl p-3 mb-3 flex items-center gap-2 text-xs" style={{ background: '#2d0a1b', border: '1px solid #5c1a2a' }}>
            <AlertCircle className="w-4 h-4 text-red-400" />
            <p className="text-red-300">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <div className="w-10 h-10 border-2 rounded-full animate-spin mx-auto mb-3" style={{ borderColor: `${T.accent}33`, borderTopColor: T.accent }} />
              <p className="text-xs" style={{ color: T.textMuted }}>Carregando...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">

            {/* ═══ ROW 1: Big KPIs + Gauges ═══ */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
              <BigKpi value={fmt.num(m.activeCustomers || 0)} label="# Total Clientes" icon={Users} color={T.cyan} />
              <BigKpi value={fmt.pct(taxaConversao)} label="% Conversao Pgto" sublabel="Pago / Faturado" icon={Target} color={T.gold} />
              <BigKpi value={fmt.num(m.activationsThisMonth || 0)} label="# Ativacoes Mes" icon={UserPlus} color={T.green} />
              <BigKpi value={fmt.brl(m.mrr || 0)} label="# MRR" sublabel={`ARPU: ${fmt.brl(m.arpu || 0)}`} icon={DollarSign} color={T.gold} />
              <BigKpi value={fmt.num(m.openServiceOrders || 0)} label="# OS Abertas" icon={Zap} color={T.orange} />

              {/* Gauges */}
              <Gauge value={m.churnRate || 0} max={15} label="% Churn" color={T.cyan} targetLabel="Meta < 5%" />
              <Gauge value={m.defaultRate || 0} max={40} label="% Inadimplencia" color={T.gold} targetLabel="Meta < 10%" />
            </div>

            {/* ═══ ROW 2: Pie + Sparklines + Table ═══ */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">

              {/* ── Pie Chart: Planos ── */}
              <div className="lg:col-span-3 rounded-xl p-4" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
                <SectionTitle>Distribuicao por Plano</SectionTitle>
                <div className="flex items-center justify-center" style={{ height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={planDist} cx="50%" cy="50%" innerRadius={0} outerRadius={75} paddingAngle={1} dataKey="value" animationDuration={800}
                        label={({ percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''}
                        labelLine={false}
                      >
                        {planDist.map((_, i) => <Cell key={i} fill={PLAN_COLORS[i % PLAN_COLORS.length]} stroke="transparent" />)}
                      </Pie>
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const d = payload[0]
                        return (
                          <div className="rounded-lg px-3 py-2 text-xs shadow-xl" style={{ background: '#1e1640ee', border: `1px solid ${T.cardBorder}` }}>
                            <p className="font-bold" style={{ color: T.textPrimary }}>{d.name}</p>
                            <p style={{ color: T.textMuted }}>{d.value} clientes ({totalPlanCustomers > 0 ? ((d.value / totalPlanCustomers) * 100).toFixed(1) : 0}%)</p>
                          </div>
                        )
                      }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Legend */}
                <div className="space-y-1 mt-1">
                  {planDist.slice(0, 6).map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-[10px]">
                      <span className="w-2 h-2 rounded-sm" style={{ background: PLAN_COLORS[i % PLAN_COLORS.length] }} />
                      <span className="flex-1 truncate" style={{ color: T.textMuted }}>{p.name}</span>
                      <span className="font-bold" style={{ color: T.textPrimary }}>{p.value}</span>
                      <span style={{ color: T.textMuted }}>({totalPlanCustomers > 0 ? (p.value / totalPlanCustomers * 100).toFixed(1) : 0}%)</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Middle: Sparkline KPIs + Valor Investido ── */}
              <div className="lg:col-span-5 flex flex-col gap-3">
                {/* Sparkline KPI row */}
                <div className="grid grid-cols-3 gap-3">
                  <SparkKpi
                    value={fmt.brl(totalFaturado)}
                    label="# Total Faturado"
                    data={billingData} dataKey="faturado" color={T.cyan}
                  />
                  <SparkKpi
                    value={fmt.brl(totalPago)}
                    label="# Total Pago"
                    data={billingData} dataKey="pago" color={T.green}
                  />
                  <SparkKpi
                    value={fmt.brl(totalInadimplente)}
                    label="# Inadimplente"
                    data={billingData} dataKey="inadimplente" color={T.red}
                  />
                </div>

                {/* Revenue + ARPU charts */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl p-3" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
                    <p className="text-base font-bold" style={{ color: T.gold }}>{fmt.brl(m.mrr || 0)}</p>
                    <p className="text-[9px] font-semibold mb-1" style={{ color: T.pink }}># Receita Recorrente (MRR)</p>
                    <div style={{ height: 60 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={billingData}>
                          <defs>
                            <linearGradient id="gMrr" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={T.gold} stopOpacity={0.3} />
                              <stop offset="100%" stopColor={T.gold} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <Area type="monotone" dataKey="pago" stroke={T.gold} strokeWidth={1.5} fill="url(#gMrr)" dot={false} animationDuration={600} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="rounded-xl p-3" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
                    <p className="text-base font-bold" style={{ color: T.cyan }}>{fmt.brl(m.arpu || 0)}</p>
                    <p className="text-[9px] font-semibold mb-1" style={{ color: T.pink }}># ARPU (Receita por Cliente)</p>
                    <div style={{ height: 60 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={clientEvolution}>
                          <Line type="monotone" dataKey="ativacoes" stroke={T.cyan} strokeWidth={1.5} dot={false} animationDuration={600} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Client evolution area chart */}
                <div className="rounded-xl p-3" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
                  <SectionTitle>Tendencia de Ativacoes</SectionTitle>
                  <ResponsiveContainer width="100%" height={120}>
                    <AreaChart data={clientEvolution} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gEvo2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={T.cyan} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={T.cyan} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.gridLine} />
                      <XAxis dataKey="month" tick={{ fill: T.textMuted, fontSize: 9 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: T.textMuted, fontSize: 9 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Area type="monotone" dataKey="ativacoes" name="Ativacoes" stroke={T.cyan} strokeWidth={2} fill="url(#gEvo2)" dot={{ fill: T.cyan, r: 2.5, stroke: T.card, strokeWidth: 1.5 }} activeDot={{ r: 4 }} animationDuration={800} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* ── Right: Status Table ── */}
              <div className="lg:col-span-4 rounded-xl p-4" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
                <SectionTitle>Indicadores Comerciais</SectionTitle>
                <div className="mt-1">
                  <div className="flex items-center gap-2 px-3 py-1.5 text-[9px] font-semibold" style={{ color: T.pink, borderBottom: `1px solid ${T.cardBorder}` }}>
                    <span className="flex-1">Tipo</span>
                    <span className="w-14 text-right">Valor</span>
                    <span className="w-16 text-right">%</span>
                  </div>
                  {statusData.map((s, i) => (
                    <TRow key={i} label={s.label} value={s.value} pct={statusTotal > 0 ? (s.value / statusTotal * 100).toFixed(2) + '%' : '0%'} color={s.color} />
                  ))}
                  <TRow label="Total" value={statusTotal} pct="100,00%" bold borderTop />
                </div>

                {/* Plan table below */}
                <div className="mt-4">
                  <SectionTitle>Top Planos</SectionTitle>
                  <div className="flex items-center gap-2 px-3 py-1 text-[9px] font-semibold" style={{ color: T.pink, borderBottom: `1px solid ${T.cardBorder}` }}>
                    <span className="flex-1">Plano</span>
                    <span className="w-14 text-right">Clientes</span>
                    <span className="w-16 text-right">%</span>
                  </div>
                  {planDist.slice(0, 8).map((p, i) => (
                    <TRow key={i} label={p.name} value={p.value} pct={totalPlanCustomers > 0 ? (p.value / totalPlanCustomers * 100).toFixed(2) + '%' : '0%'} color={PLAN_COLORS[i % PLAN_COLORS.length]} />
                  ))}
                  <TRow label="Total" value={totalPlanCustomers} pct="100,00%" bold borderTop />
                </div>
              </div>
            </div>

            {/* ═══ ROW 3: Full-width bar chart ═══ */}
            <div className="rounded-xl p-4" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
              <SectionTitle>Faturamento Mensal — Faturado vs Pago vs Inadimplente</SectionTitle>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={billingData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }} barCategoryGap="18%">
                  <defs>
                    <linearGradient id="gF2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={T.gold} stopOpacity={1} />
                      <stop offset="100%" stopColor={T.gold} stopOpacity={0.5} />
                    </linearGradient>
                    <linearGradient id="gP2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={T.cyan} stopOpacity={1} />
                      <stop offset="100%" stopColor={T.cyan} stopOpacity={0.5} />
                    </linearGradient>
                    <linearGradient id="gI2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={T.pink} stopOpacity={1} />
                      <stop offset="100%" stopColor={T.pink} stopOpacity={0.5} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.gridLine} />
                  <XAxis dataKey="month" tick={{ fill: T.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: T.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmt.compact} />
                  <Tooltip content={<ChartTooltip isCurrency />} />
                  <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar dataKey="faturado" name="Faturado" fill="url(#gF2)" radius={[4, 4, 0, 0]} animationDuration={700} />
                  <Bar dataKey="pago" name="Pago" fill="url(#gP2)" radius={[4, 4, 0, 0]} animationDuration={700} />
                  <Bar dataKey="inadimplente" name="Inadimplente" fill="url(#gI2)" radius={[4, 4, 0, 0]} animationDuration={700} />
                </BarChart>
              </ResponsiveContainer>
            </div>

          </div>
        )}
      </main>
    </div>
  )
}

export default Comercial
