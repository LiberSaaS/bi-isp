import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { apiService } from '../services/api'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar, Legend
} from 'recharts'
import {
  RefreshCw, Users, UserPlus, UserMinus, UserX,
  AlertCircle, ChevronDown, Target, Zap,
  ArrowUpRight, ArrowDownRight, ShieldAlert, Pause
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

/* ═══════════════ HELPERS ═══════════════ */
const fmt = {
  num: (v) => (v == null || isNaN(v)) ? '0' : v.toLocaleString('pt-BR'),
  pct: (v) => (v == null || isNaN(v)) ? '0,00%' : v.toFixed(2).replace('.', ',') + '%',
  compact: (v) => {
    if (v == null || isNaN(v)) return '0'
    if (v >= 1_000) return (v / 1_000).toFixed(1).replace('.', ',') + 'k'
    return v.toLocaleString('pt-BR')
  }
}

const STATUS_MAP = {
  active: { label: 'Ativos', color: T.cyan, icon: Users },
  suspended: { label: 'Suspensos', color: T.gold, icon: Pause },
  cancelled: { label: 'Cancelados', color: T.red, icon: UserX },
  pending: { label: 'Pendentes', color: T.orange, icon: ShieldAlert },
}

/* ═══════════════ SUB-COMPONENTS ═══════════════ */

const SectionTitle = ({ children }) => (
  <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: T.pink }}>{children}</p>
)

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg px-3 py-2 shadow-xl text-xs" style={{ background: '#1e1640ee', border: `1px solid ${T.cardBorder}` }}>
      <p className="font-medium mb-1" style={{ color: T.pink }}>{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span style={{ color: T.textMuted }}>{entry.name}:</span>
          <span className="font-bold" style={{ color: T.textPrimary }}>{fmt.num(entry.value)}</span>
        </div>
      ))}
    </div>
  )
}

const BigKpi = ({ value, label, sublabel, color = T.cyan, icon: Icon }) => (
  <div className="rounded-xl p-4 transition-all hover:scale-[1.01]" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
    <div className="flex items-start justify-between">
      <div>
        <p className="text-2xl font-bold tracking-tight" style={{ color }}>{value}</p>
        <p className="text-[10px] font-semibold mt-1" style={{ color: T.pink }}>{label}</p>
        {sublabel && <p className="text-[9px] mt-0.5" style={{ color: T.textMuted }}>{sublabel}</p>}
      </div>
      {Icon && (
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      )}
    </div>
  </div>
)

const Gauge = ({ value, max = 100, label, color = T.cyan, targetLabel }) => {
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

/* ═══════════════ MAIN ═══════════════ */

export const Comercial = () => {
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
    apiService.getProviders().then(res => {
      const list = res.data.providers || []
      setProviders(list)
      if (list.length > 0) setSelectedProvider(list[0]._id || list[0].id)
    }).catch(() => setError('Erro ao carregar provedores'))
  }, [])

  useEffect(() => {
    if (!selectedProvider) return
    setLoading(true); setError('')
    apiService.getCommercialMetrics(selectedProvider).then(res => {
      setMetrics(res.data)
      setLastSync(res.data.lastSync)
    }).catch(() => setError('Erro ao carregar metricas comerciais'))
      .finally(() => setLoading(false))
  }, [selectedProvider, period])

  const handleSync = async () => {
    if (!selectedProvider || syncing) return
    setSyncing(true)
    try {
      await apiService.triggerSync(selectedProvider)
      const res = await apiService.getCommercialMetrics(selectedProvider)
      setMetrics(res.data)
    } catch { setError('Erro ao sincronizar') }
    finally { setSyncing(false) }
  }

  /* ── Derived Data ── */
  const m = metrics?.metrics || {}

  const statusDist = useMemo(() => {
    return (m.statusDistribution || []).map(s => ({
      ...s,
      ...(STATUS_MAP[s.status] || { label: s.status, color: T.textMuted }),
    }))
  }, [m.statusDistribution])

  const totalCustomers = m.totalCustomers || 0

  const activationsByMonth = useMemo(() =>
    (m.activationsByMonth || []).map(item => ({
      month: item.date ? new Date(item.date).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) : '',
      ativacoes: item.count || 0,
    })), [m.activationsByMonth])

  const cancellationsByMonth = useMemo(() =>
    (m.cancellationsByMonth || []).map(item => ({
      month: item.date ? new Date(item.date).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) : '',
      cancelamentos: item.count || 0,
    })), [m.cancellationsByMonth])

  // Merge activations + cancellations into one timeline
  const evolutionData = useMemo(() => {
    const map = new Map()
    for (const a of (m.activationsByMonth || [])) {
      const key = a.date ? new Date(a.date).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) : ''
      map.set(key, { ...(map.get(key) || {}), month: key, ativacoes: a.count || 0 })
    }
    for (const c of (m.cancellationsByMonth || [])) {
      const key = c.date ? new Date(c.date).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) : ''
      map.set(key, { ...(map.get(key) || {}), month: key, cancelamentos: c.count || 0 })
    }
    return Array.from(map.values()).map(d => ({
      month: d.month,
      ativacoes: d.ativacoes || 0,
      cancelamentos: d.cancelamentos || 0,
      saldo: (d.ativacoes || 0) - (d.cancelamentos || 0),
    }))
  }, [m.activationsByMonth, m.cancellationsByMonth])

  const planDist = useMemo(() =>
    (m.planDistribution || [])
      .map(item => ({ name: item.planName || 'Sem plano', value: item.customerCount || 0 }))
      .sort((a, b) => b.value - a.value),
    [m.planDistribution])

  const totalPlanCustomers = planDist.reduce((s, p) => s + p.value, 0)

  // Churn rate computed from data
  const churnRate = totalCustomers > 0 ? ((m.cancelledTotal || 0) / totalCustomers * 100) : 0
  const retentionRate = 100 - churnRate

  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysPassed = now.getDate()
  const daysRemaining = daysInMonth - daysPassed

  const providerName = providers.find(p => (p._id || p.id) === selectedProvider)?.name || 'Provedor'

  /* ═══════════════ RENDER ═══════════════ */
  return (
    <div className="flex-1 flex flex-col min-h-screen overflow-auto" style={{ background: T.bg }}>
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 sticky top-0 z-10" style={{ background: '#150f2bdd', backdropFilter: 'blur(8px)', borderBottom: `1px solid ${T.cardBorder}` }}>
        <div>
          <h1 className="text-sm font-bold">
            <span style={{ color: T.gold }}>Comercial</span>
            <span style={{ color: T.textMuted }}> — Analiticos</span>
          </h1>
          <p className="text-[10px]" style={{ color: T.textMuted }}>{user?.name || 'Usuario'} &middot; {providerName}</p>
        </div>

        <div className="hidden md:flex items-center gap-5">
          {[
            { label: 'Dias Uteis', value: Math.round(daysPassed * 5 / 7), color: T.cyan },
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

        <div className="flex items-center gap-2">
          {providers.length > 1 && (
            <div className="relative">
              <select value={selectedProvider || ''} onChange={e => setSelectedProvider(e.target.value)}
                className="appearance-none text-[11px] rounded-lg pl-3 pr-7 py-1.5 cursor-pointer focus:outline-none"
                style={{ background: T.card, border: `1px solid ${T.cardBorder}`, color: T.textPrimary }}>
                {providers.map(p => <option key={p._id || p.id} value={p._id || p.id}>{p.name}</option>)}
              </select>
              <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: T.textMuted }} />
            </div>
          )}
          <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${T.cardBorder}` }}>
            {['30d', '60d', '90d'].map(p => (
              <button key={p} onClick={() => setPeriod(p)} className="px-2.5 py-1 text-[10px] font-medium transition-all"
                style={{ background: period === p ? T.accent : 'transparent', color: period === p ? '#fff' : T.textMuted }}>{p.replace('d', 'D')}</button>
            ))}
          </div>
          <button onClick={handleSync} disabled={syncing} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-medium disabled:opacity-40"
            style={{ background: T.accent, color: '#fff' }}>
            <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sync...' : 'Sync'}
          </button>
        </div>
      </header>

      {/* Body */}
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

            {/* ═══ ROW 1: KPI Cards + Gauges ═══ */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
              <BigKpi value={fmt.num(m.totalCustomers || 0)} label="# Total Base" sublabel={`${fmt.num(m.activeCustomers || 0)} ativos`} icon={Users} color={T.cyan} />
              <BigKpi value={fmt.num(m.activeCustomers || 0)} label="# Clientes Ativos" icon={Users} color={T.green} />
              <BigKpi value={fmt.num(m.activationsMonth || 0)} label="# Ativacoes Mes" icon={UserPlus} color={T.gold} />
              <BigKpi value={fmt.num(m.suspendedCount || 0)} label="# Suspensos" icon={Pause} color={T.orange} />
              <BigKpi value={fmt.num(m.cancelledTotal || 0)} label="# Cancelados Total" icon={UserMinus} color={T.red} />

              {/* Gauges */}
              <Gauge value={churnRate} max={30} label="% Churn" color={T.red} targetLabel="Meta < 5%" />
              <Gauge value={retentionRate} max={100} label="% Retencao" color={T.cyan} targetLabel="Meta > 95%" />
            </div>

            {/* ═══ ROW 2: Charts ═══ */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">

              {/* ── Pie: Clientes por Plano ── */}
              <div className="lg:col-span-3 rounded-xl p-4" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
                <SectionTitle>Distribuicao por Plano</SectionTitle>
                <div className="flex items-center justify-center" style={{ height: 190 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={planDist} cx="50%" cy="50%" innerRadius={0} outerRadius={75} paddingAngle={1} dataKey="value" animationDuration={800}
                        label={({ percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''}
                        labelLine={false}>
                        {planDist.map((_, i) => <Cell key={i} fill={PLAN_COLORS[i % PLAN_COLORS.length]} stroke="transparent" />)}
                      </Pie>
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const d = payload[0]
                        return (
                          <div className="rounded-lg px-3 py-2 text-xs shadow-xl" style={{ background: '#1e1640ee', border: `1px solid ${T.cardBorder}` }}>
                            <p className="font-bold" style={{ color: T.textPrimary }}>{d.name}</p>
                            <p style={{ color: T.textMuted }}>{d.value} clientes</p>
                          </div>
                        )
                      }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1 mt-1">
                  {planDist.slice(0, 6).map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-[10px]">
                      <span className="w-2 h-2 rounded-sm" style={{ background: PLAN_COLORS[i % PLAN_COLORS.length] }} />
                      <span className="flex-1 truncate" style={{ color: T.textMuted }}>{p.name}</span>
                      <span className="font-bold" style={{ color: T.textPrimary }}>{p.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Middle: Evolution charts ── */}
              <div className="lg:col-span-5 flex flex-col gap-3">
                {/* Ativacoes vs Cancelamentos AreaChart */}
                <div className="rounded-xl p-4" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
                  <SectionTitle>Ativacoes vs Cancelamentos</SectionTitle>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={evolutionData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gAtiv" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={T.cyan} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={T.cyan} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gCanc" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={T.red} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={T.red} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.gridLine} />
                      <XAxis dataKey="month" tick={{ fill: T.textMuted, fontSize: 9 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: T.textMuted, fontSize: 9 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
                      <Area type="monotone" dataKey="ativacoes" name="Ativacoes" stroke={T.cyan} strokeWidth={2} fill="url(#gAtiv)"
                        dot={{ fill: T.cyan, r: 2.5, stroke: T.card, strokeWidth: 1.5 }} animationDuration={800} />
                      <Area type="monotone" dataKey="cancelamentos" name="Cancelamentos" stroke={T.red} strokeWidth={2} fill="url(#gCanc)"
                        dot={{ fill: T.red, r: 2.5, stroke: T.card, strokeWidth: 1.5 }} animationDuration={800} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Saldo (net growth) bar chart */}
                <div className="rounded-xl p-4" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
                  <SectionTitle>Saldo Mensal (Ativacoes - Cancelamentos)</SectionTitle>
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={evolutionData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.gridLine} />
                      <XAxis dataKey="month" tick={{ fill: T.textMuted, fontSize: 9 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: T.textMuted, fontSize: 9 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="saldo" name="Saldo" radius={[4, 4, 0, 0]} animationDuration={700}>
                        {evolutionData.map((entry, i) => (
                          <Cell key={i} fill={entry.saldo >= 0 ? T.cyan : T.red} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* ── Right: Status table + Plan table ── */}
              <div className="lg:col-span-4 flex flex-col gap-3">
                {/* Status distribution table */}
                <div className="rounded-xl p-4" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
                  <SectionTitle>Status dos Clientes</SectionTitle>
                  <div className="flex items-center gap-2 px-3 py-1.5 text-[9px] font-semibold" style={{ color: T.pink, borderBottom: `1px solid ${T.cardBorder}` }}>
                    <span className="flex-1">Status</span>
                    <span className="w-14 text-right">Qtd</span>
                    <span className="w-16 text-right">%</span>
                  </div>
                  {statusDist.map((s, i) => (
                    <TRow key={i} label={s.label} value={s.count}
                      pct={totalCustomers > 0 ? (s.count / totalCustomers * 100).toFixed(2) + '%' : '0%'}
                      color={s.color} />
                  ))}
                  <TRow label="Total" value={totalCustomers} pct="100,00%" bold borderTop />
                </div>

                {/* Plan distribution table */}
                <div className="rounded-xl p-4" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
                  <SectionTitle>Top Planos (Ativos)</SectionTitle>
                  <div className="flex items-center gap-2 px-3 py-1 text-[9px] font-semibold" style={{ color: T.pink, borderBottom: `1px solid ${T.cardBorder}` }}>
                    <span className="flex-1">Plano</span>
                    <span className="w-14 text-right">Clientes</span>
                    <span className="w-16 text-right">%</span>
                  </div>
                  <div className="max-h-[200px] overflow-y-auto custom-scrollbar">
                    {planDist.map((p, i) => (
                      <TRow key={i} label={p.name} value={p.value}
                        pct={totalPlanCustomers > 0 ? (p.value / totalPlanCustomers * 100).toFixed(2) + '%' : '0%'}
                        color={PLAN_COLORS[i % PLAN_COLORS.length]} />
                    ))}
                  </div>
                  <TRow label="Total" value={totalPlanCustomers} pct="100,00%" bold borderTop />
                </div>
              </div>
            </div>

            {/* ═══ ROW 3: Full-width activations bar chart ═══ */}
            <div className="rounded-xl p-4" style={{ background: T.card, border: `1px solid ${T.cardBorder}` }}>
              <SectionTitle>Ativacoes Mensais</SectionTitle>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={activationsByMonth} margin={{ top: 5, right: 10, left: -10, bottom: 0 }} barCategoryGap="15%">
                  <defs>
                    <linearGradient id="gActBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={T.gold} stopOpacity={1} />
                      <stop offset="100%" stopColor={T.gold} stopOpacity={0.5} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.gridLine} />
                  <XAxis dataKey="month" tick={{ fill: T.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: T.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="ativacoes" name="Ativacoes" fill="url(#gActBar)" radius={[4, 4, 0, 0]} animationDuration={700} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Footer */}
            {lastSync && (
              <div className="text-center pb-2">
                <p className="text-[10px]" style={{ color: T.textMuted }}>
                  Ultima sincronizacao: {new Date(lastSync).toLocaleString('pt-BR')} &middot; {providerName}
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: ${T.bg}; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: ${T.cardBorder}; border-radius: 4px; }
      `}</style>
    </div>
  )
}

export default Comercial
