import React, { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { useAuth } from '../context/AuthContext'
import { apiService } from '../services/api'
import { RefreshCw, ChevronDown, Wifi, Package, TrendingDown, Award, DollarSign } from 'lucide-react'

const T = {
  bg: '#0f0a1e', card: '#1a1232', cardBorder: '#2d2152', accent: '#7c3aed',
  cyan: '#06d6a0', gold: '#f5a623', pink: '#e74fc4', orange: '#f97316',
  red: '#ef4444', green: '#10b981', blue: '#3b82f6', textPrimary: '#f1f5f9',
  textSecondary: '#a78bfa', textMuted: '#7c6fa0', gridLine: '#1e1640',
}

const COLORS = ['#f5a623', '#06d6a0', '#e74fc4', '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#ec4899', '#64748b', '#a78bfa', '#fbbf24']

/* ── Helpers ── */
const fmt = {
  brl: v => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
  num: v => (v ?? 0).toLocaleString('pt-BR'),
  compact: v => {
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace('.', ',') + 'M'
    if (v >= 1_000) return (v / 1_000).toFixed(1).replace('.', ',') + 'k'
    return (v ?? 0).toLocaleString('pt-BR')
  },
  truncate: (s, max = 28) => {
    if (!s) return '—'
    return s.length > max ? s.substring(0, max) + '…' : s
  },
  planShort: (s, max = 22) => {
    if (!s) return '—'
    // Remove common prefixes and clean up
    let clean = s
      .replace(/^(LIBERFIBRA_|COARACI_FIBRA_|COMBO_|PROMO_)/i, '')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return clean.length > max ? clean.substring(0, max) + '…' : clean
  }
}

/* ── Custom Tooltip ── */
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.cardBorder}`,
      borderRadius: 8, padding: '10px 14px', boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    }}>
      <p style={{ margin: '0 0 6px', fontSize: 11, color: T.textMuted, fontWeight: 600 }}>{label}</p>
      {payload.map((e, i) => (
        <p key={i} style={{ margin: '2px 0', fontSize: 12, color: e.color || T.textPrimary }}>
          {e.name}: <strong>{typeof e.value === 'number' ? e.value.toLocaleString('pt-BR') : e.value}</strong>
        </p>
      ))}
    </div>
  )
}

/* ── KPI Card ── */
const KpiCard = ({ icon: Icon, title, value, sub, color = T.cyan }) => (
  <div style={{
    background: T.card, border: `1px solid ${T.cardBorder}`,
    borderRadius: 12, padding: '16px 18px', position: 'relative', overflow: 'hidden',
  }}>
    <div style={{
      position: 'absolute', top: -8, right: -8, width: 48, height: 48,
      borderRadius: '50%', background: `${color}10`,
    }} />
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      {Icon && <Icon size={14} style={{ color: T.textMuted }} />}
      <p style={{ fontSize: 10, color: T.textMuted, margin: 0, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
        {title}
      </p>
    </div>
    <p style={{
      fontSize: 22, fontWeight: 700, color, margin: 0,
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }}>
      {value}
    </p>
    {sub && (
      <p style={{
        fontSize: 11, color: T.textMuted, margin: '6px 0 0',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {sub}
      </p>
    )}
  </div>
)

/* ── Highlight Card (for plan names) ── */
const PlanHighlightCard = ({ icon: Icon, title, planName, sub, color }) => (
  <div style={{
    background: T.card, border: `1px solid ${T.cardBorder}`,
    borderRadius: 12, padding: '16px 18px', overflow: 'hidden',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      {Icon && <Icon size={14} style={{ color: T.textMuted }} />}
      <p style={{ fontSize: 10, color: T.textMuted, margin: 0, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
        {title}
      </p>
    </div>
    <p title={planName} style={{
      fontSize: 13, fontWeight: 700, color, margin: 0, lineHeight: 1.3,
      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
      overflow: 'hidden', textOverflow: 'ellipsis', minHeight: 34,
    }}>
      {planName || '—'}
    </p>
    {sub && (
      <p style={{ fontSize: 11, color: T.textMuted, margin: '6px 0 0' }}>{sub}</p>
    )}
  </div>
)

/* ── Custom Pie Label ── */
const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  if (percent < 0.04) return null // Skip tiny slices
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={600}>
      {(percent * 100).toFixed(0)}%
    </text>
  )
}

/* ═══════════════ MAIN PAGE ═══════════════ */

export const Planos = () => {
  const { user } = useAuth()
  const [providers, setProviders] = useState([])
  const [selectedProvider, setSelectedProvider] = useState('')
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    apiService.getProviders().then(res => {
      const list = res.data.providers || []
      setProviders(list)
      if (list.length > 0) setSelectedProvider(list[0]._id || list[0].id)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (selectedProvider) fetchMetrics()
  }, [selectedProvider])

  const fetchMetrics = async () => {
    try {
      setLoading(true)
      const res = await apiService.getPlanMetrics(selectedProvider)
      setMetrics(res.data.metrics)
    } catch (e) {
      console.error('Erro planos:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleSync = async () => {
    if (!selectedProvider || syncing) return
    setSyncing(true)
    try {
      await apiService.triggerSync(selectedProvider)
      await fetchMetrics()
    } catch {} finally { setSyncing(false) }
  }

  /* ── Derived data ── */
  const planTable = metrics?.planOverview || []
  const topPlans = metrics?.topPlansByRevenue || []
  const speedDist = metrics?.speedDistribution || []
  const priceRanges = metrics?.planPriceRanges || []

  const topSold = useMemo(() => planTable.reduce((max, p) => p.total > (max?.total || 0) ? p : max, null), [planTable])
  const topRevenue = useMemo(() => planTable.reduce((max, p) => (p.totalRevenue || 0) > (max?.totalRevenue || 0) ? p : max, null), [planTable])
  const topChurn = useMemo(() => planTable.reduce((max, p) => (p.churnRate || 0) > (max?.churnRate || 0) ? p : max, null), [planTable])

  const totalRow = useMemo(() => {
    if (!planTable.length) return null
    return {
      active: planTable.reduce((s, p) => s + (p.active || 0), 0),
      cancelled: planTable.reduce((s, p) => s + (p.cancelled || 0), 0),
      suspended: planTable.reduce((s, p) => s + (p.suspended || 0), 0),
      avgPrice: planTable.reduce((s, p) => s + (p.avgPrice || 0), 0) / planTable.length,
      totalRevenue: planTable.reduce((s, p) => s + (p.totalRevenue || 0), 0),
      churnRate: planTable.reduce((s, p) => s + (p.churnRate || 0), 0) / planTable.length,
    }
  }, [planTable])

  // Clean up chart data: abbreviate plan names for readability
  const topPlansChart = useMemo(() =>
    topPlans.slice(0, 10).map(p => ({
      ...p,
      planShort: fmt.planShort(p.plan, 25),
    })), [topPlans])

  const comparisonChart = useMemo(() =>
    planTable.slice(0, 8).map(p => ({
      plan: fmt.planShort(p.plan, 18),
      Clientes: p.total || 0,
      'Receita (R$k)': Math.round((p.totalRevenue || 0) / 1000),
    })), [planTable])

  /* ═══════════════ RENDER ═══════════════ */

  return (
    <div className="flex-1 flex flex-col" style={{ background: T.bg }}>

      {/* ─── Header ─── */}
      <header className="flex items-center justify-between px-6 py-3 sticky top-0 z-20"
        style={{ background: '#150f2bdd', backdropFilter: 'blur(8px)', borderBottom: `1px solid ${T.cardBorder}` }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #f5a623, #e74fc4)' }}>
            <Wifi className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="text-sm font-bold" style={{ color: T.gold }}>Planos</span>
            <span className="text-sm font-bold" style={{ color: T.textMuted }}> — Portfólio de Produtos</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {providers.length >= 1 && (
            <div className="relative">
              <select value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)}
                className="appearance-none text-[11px] rounded-lg pl-3 pr-7 py-1.5 cursor-pointer focus:outline-none"
                style={{ background: T.card, border: `1px solid ${T.cardBorder}`, color: T.textPrimary }}>
                {providers.map(p => <option key={p._id || p.id} value={p._id || p.id}>{p.name}</option>)}
              </select>
              <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: T.textMuted }} />
            </div>
          )}
          <button onClick={handleSync} disabled={syncing || !selectedProvider}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all disabled:opacity-40"
            style={{ background: T.accent, color: '#fff' }}>
            <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sync...' : 'Sincronizar'}
          </button>
        </div>
      </header>

      {/* ─── Main ─── */}
      <main className="flex-1 p-4 lg:p-5">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <div className="w-10 h-10 border-2 rounded-full animate-spin mx-auto mb-3"
                style={{ borderColor: `${T.accent}33`, borderTopColor: T.accent }} />
              <p className="text-xs" style={{ color: T.textMuted }}>Carregando dados de planos...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">

            {/* ═══ ROW 1: KPI Cards ═══ */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: 12,
            }}>
              <KpiCard icon={Package} title="Planos Únicos" value={metrics?.uniquePlans || 0} color={T.cyan} />
              <KpiCard icon={DollarSign} title="MRR Total" value={fmt.brl(metrics?.totalMRR)} color={T.gold} sub="receita mensal" />
              <KpiCard icon={DollarSign} title="ARPU Médio" value={fmt.brl(metrics?.avgARPU)} color={T.textPrimary} sub="por cliente" />
              <PlanHighlightCard icon={Award} title="Plano Mais Vendido"
                planName={topSold?.plan} sub={`${fmt.num(topSold?.total)} clientes`} color={T.pink} />
              <PlanHighlightCard icon={DollarSign} title="Plano Mais Lucrativo"
                planName={topRevenue?.plan} sub={fmt.brl(topRevenue?.totalRevenue)} color={T.gold} />
            </div>

            {/* ═══ ROW 2: Charts — 2 columns ═══ */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

              {/* Top Planos por Receita */}
              <div style={{ background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: 12, padding: '16px 20px' }}>
                <h3 style={{ color: T.pink, fontSize: 13, fontWeight: 700, margin: '0 0 16px' }}>
                  Top Planos por Receita
                </h3>
                {topPlansChart.length > 0 ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={topPlansChart} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.gridLine} horizontal={false} />
                      <XAxis type="number" stroke={T.textMuted} tick={{ fontSize: 10 }}
                        tickFormatter={v => fmt.compact(v)} />
                      <YAxis dataKey="planShort" type="category" stroke={T.textMuted}
                        width={140} tick={{ fontSize: 10 }} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="revenue" name="Receita (R$)" fill={T.gold} radius={[0, 4, 4, 0]} barSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p style={{ color: T.textMuted, textAlign: 'center', fontSize: 12 }}>Sem dados</p>
                )}
              </div>

              {/* Distribuição por Velocidade — Donut + Legenda */}
              <div style={{ background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: 12, padding: '16px 20px' }}>
                <h3 style={{ color: T.pink, fontSize: 13, fontWeight: 700, margin: '0 0 16px' }}>
                  Distribuição por Velocidade
                </h3>
                {speedDist.length > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ flex: '0 0 200px' }}>
                      <ResponsiveContainer width={200} height={200}>
                        <PieChart>
                          <Pie data={speedDist} dataKey="count" nameKey="speed"
                            cx="50%" cy="50%" innerRadius={45} outerRadius={90}
                            label={renderPieLabel} labelLine={false} strokeWidth={1} stroke={T.bg}>
                            {speedDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip content={<ChartTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
                      {speedDist.sort((a, b) => b.count - a.count).map((s, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 10, height: 10, borderRadius: 3, flexShrink: 0, background: COLORS[i % COLORS.length] }} />
                          <span style={{ fontSize: 11, color: T.textPrimary, flex: 1 }}>{s.speed} Mbps</span>
                          <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 600 }}>{s.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p style={{ color: T.textMuted, textAlign: 'center', fontSize: 12 }}>Sem dados</p>
                )}
              </div>
            </div>

            {/* ═══ ROW 3: Faixa de Preço + Comparativo ═══ */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

              {/* Faixa de Preço */}
              <div style={{ background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: 12, padding: '16px 20px' }}>
                <h3 style={{ color: T.pink, fontSize: 13, fontWeight: 700, margin: '0 0 16px' }}>
                  Distribuição por Faixa de Preço
                </h3>
                {priceRanges.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={priceRanges} margin={{ bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.gridLine} />
                      <XAxis dataKey="_id" stroke={T.textMuted} tick={{ fontSize: 10 }}
                        angle={-30} textAnchor="end" height={50} />
                      <YAxis stroke={T.textMuted} tick={{ fontSize: 10 }} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="count" name="Clientes" fill={T.cyan} radius={[4, 4, 0, 0]} barSize={28}>
                        {priceRanges.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p style={{ color: T.textMuted, textAlign: 'center', fontSize: 12 }}>Sem dados</p>
                )}
              </div>

              {/* Vendidos vs Lucrativos */}
              <div style={{ background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: 12, padding: '16px 20px' }}>
                <h3 style={{ color: T.pink, fontSize: 13, fontWeight: 700, margin: '0 0 16px' }}>
                  Clientes vs Receita (Top 8)
                </h3>
                {comparisonChart.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={comparisonChart} margin={{ bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.gridLine} />
                      <XAxis dataKey="plan" stroke={T.textMuted} tick={{ fontSize: 9 }}
                        angle={-35} textAnchor="end" height={60} interval={0} />
                      <YAxis stroke={T.textMuted} tick={{ fontSize: 10 }} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Clientes" fill={T.blue} radius={[3, 3, 0, 0]} barSize={16} />
                      <Bar dataKey="Receita (R$k)" fill={T.gold} radius={[3, 3, 0, 0]} barSize={16} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p style={{ color: T.textMuted, textAlign: 'center', fontSize: 12 }}>Sem dados</p>
                )}
              </div>
            </div>

            {/* ═══ ROW 4: Tabela + Insights ═══ */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>

              {/* Tabela completa */}
              <div style={{ background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: 12, padding: '16px 20px' }}>
                <h3 style={{ color: T.pink, fontSize: 13, fontWeight: 700, margin: '0 0 16px' }}>
                  Análise Completa de Planos
                </h3>
                <div style={{ overflowX: 'auto', borderRadius: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                    <thead>
                      <tr style={{ background: T.bg, borderBottom: `1px solid ${T.cardBorder}` }}>
                        {['Plano', 'Ativos', 'Cancel.', 'Susp.', 'Preço Médio', 'Receita', '% Churn'].map((h, i) => (
                          <th key={h} style={{
                            padding: '10px 12px', fontSize: 10, fontWeight: 700, color: T.textMuted,
                            textTransform: 'uppercase', letterSpacing: 0.5,
                            textAlign: i === 0 ? 'left' : i >= 4 ? 'right' : 'center',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {planTable.map((p, i) => (
                        <tr key={i} style={{
                          borderBottom: `1px solid ${T.gridLine}`,
                          background: (p.churnRate || 0) > 15 ? 'rgba(239,68,68,0.06)' : 'transparent',
                        }}>
                          <td title={p.plan} style={{
                            padding: '10px 12px', fontSize: 12, color: T.textPrimary, fontWeight: 500,
                            maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>{p.plan}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 12, color: T.green }}>{p.active}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 12, color: T.red }}>{p.cancelled}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 12, color: T.orange }}>{p.suspended}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: T.textPrimary }}>{fmt.brl(p.avgPrice)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: T.gold, fontWeight: 600 }}>{fmt.brl(p.totalRevenue)}</td>
                          <td style={{
                            padding: '10px 12px', textAlign: 'center', fontSize: 12, fontWeight: 600,
                            color: (p.churnRate || 0) > 10 ? T.red : (p.churnRate || 0) > 5 ? T.orange : T.green,
                          }}>{(p.churnRate || 0).toFixed(1)}%</td>
                        </tr>
                      ))}
                      {/* Total */}
                      {totalRow && (
                        <tr style={{ borderTop: `2px solid ${T.cardBorder}`, background: T.bg }}>
                          <td style={{ padding: '10px 12px', fontSize: 12, color: T.pink, fontWeight: 700 }}>Total</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 12, color: T.textPrimary, fontWeight: 700 }}>{totalRow.active}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 12, color: T.textPrimary, fontWeight: 700 }}>{totalRow.cancelled}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 12, color: T.textPrimary, fontWeight: 700 }}>{totalRow.suspended}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: T.textPrimary, fontWeight: 700 }}>{fmt.brl(totalRow.avgPrice)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: T.pink, fontWeight: 700 }}>{fmt.brl(totalRow.totalRevenue)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 12, color: T.textPrimary, fontWeight: 700 }}>{totalRow.churnRate.toFixed(1)}%</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Insights */}
              <div style={{ background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: 12, padding: '16px 20px' }}>
                <h3 style={{ color: T.pink, fontSize: 13, fontWeight: 700, margin: '0 0 16px' }}>
                  Insights Estratégicos
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Âncora */}
                  <div>
                    <p style={{ fontSize: 10, color: T.textMuted, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
                      Plano Âncora (Mais Vendido)
                    </p>
                    <p title={topSold?.plan} style={{
                      fontSize: 14, fontWeight: 700, color: T.cyan, margin: 0,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>
                      {topSold?.plan || '—'}
                    </p>
                    <p style={{ fontSize: 11, color: T.textSecondary, margin: '4px 0 0' }}>
                      {fmt.num(topSold?.total)} clientes
                    </p>
                  </div>

                  <div style={{ borderTop: `1px solid ${T.cardBorder}`, paddingTop: 16 }}>
                    <p style={{ fontSize: 10, color: T.textMuted, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
                      Maior Receita
                    </p>
                    <p title={topRevenue?.plan} style={{
                      fontSize: 14, fontWeight: 700, color: T.gold, margin: 0,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>
                      {topRevenue?.plan || '—'}
                    </p>
                    <p style={{ fontSize: 11, color: T.textSecondary, margin: '4px 0 0' }}>
                      {fmt.brl(topRevenue?.totalRevenue)}
                    </p>
                  </div>

                  <div style={{ borderTop: `1px solid ${T.cardBorder}`, paddingTop: 16 }}>
                    <p style={{ fontSize: 10, color: T.textMuted, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
                      Maior Risco (Churn)
                    </p>
                    <p title={topChurn?.plan} style={{
                      fontSize: 14, fontWeight: 700, margin: 0,
                      color: (topChurn?.churnRate || 0) > 10 ? T.red : T.orange,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>
                      {topChurn?.plan || '—'}
                    </p>
                    <p style={{ fontSize: 11, color: T.textSecondary, margin: '4px 0 0' }}>
                      {(topChurn?.churnRate || 0).toFixed(1)}% de churn
                    </p>
                  </div>

                  <div style={{ borderTop: `1px solid ${T.cardBorder}`, paddingTop: 16 }}>
                    <p style={{ fontSize: 10, color: T.textMuted, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
                      Resumo Geral
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11, color: T.textMuted }}>Total planos</span>
                        <span style={{ fontSize: 11, color: T.textPrimary, fontWeight: 600 }}>{metrics?.uniquePlans || 0}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11, color: T.textMuted }}>MRR</span>
                        <span style={{ fontSize: 11, color: T.gold, fontWeight: 600 }}>{fmt.brl(metrics?.totalMRR)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11, color: T.textMuted }}>ARPU</span>
                        <span style={{ fontSize: 11, color: T.textPrimary, fontWeight: 600 }}>{fmt.brl(metrics?.avgARPU)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}
      </main>
    </div>
  )
}

export default Planos
