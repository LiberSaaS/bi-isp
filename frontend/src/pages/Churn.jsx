import React, { useState, useEffect } from 'react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  RadialBarChart, RadialBar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, LineChart, Line
} from 'recharts'
import { useAuth } from '../context/AuthContext'
import { apiService } from '../services/api'

const T = {
  bg: '#0f0a1e', card: '#1a1232', cardBorder: '#2d2152', accent: '#7c3aed',
  cyan: '#06d6a0', gold: '#f5a623', pink: '#e74fc4', orange: '#f97316',
  red: '#ef4444', green: '#10b981', blue: '#3b82f6', textPrimary: '#f1f5f9',
  textSecondary: '#a78bfa', textMuted: '#7c6fa0', gridLine: '#1e1640',
}

const ChartTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    const value = payload[0].value
    const displayLabel = data.date || data.plan || data.city || data.reason || label

    return (
      <div
        style={{
          backgroundColor: T.card,
          border: `1px solid ${T.cardBorder}`,
          borderRadius: '8px',
          padding: '8px 12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}
      >
        <p style={{ color: T.textPrimary, margin: '0 0 4px 0', fontSize: '12px' }}>
          {displayLabel}
        </p>
        <p style={{ color: T.accent, margin: 0, fontSize: '14px', fontWeight: '600' }}>
          {value}
        </p>
      </div>
    )
  }
  return null
}

const KPICard = ({ label, value, suffix = '', icon: Icon = null, bgColor = null, isGauge = false, gaugeData = null, gaugeColor = T.accent }) => {
  return (
    <div
      style={{
        backgroundColor: T.card,
        border: `1px solid ${T.cardBorder}`,
        borderRadius: '12px',
        padding: '16px',
        flex: 1,
      }}
    >
      <p style={{ color: T.textSecondary, margin: '0 0 12px 0', fontSize: '13px', fontWeight: '500' }}>
        {label}
      </p>
      {isGauge && gaugeData ? (
        <div style={{ height: '100px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <ResponsiveContainer width="100%" height={100}>
            <RadialBarChart
              data={gaugeData}
              innerRadius="70%"
              outerRadius="90%"
              startAngle={180}
              endAngle={0}
              margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <RadialBar dataKey="value" fill={gaugeColor} radius={[8, 8, 0, 0]} />
            </RadialBarChart>
          </ResponsiveContainer>
        </div>
      ) : null}
      <p style={{ color: T.textPrimary, margin: '12px 0 0 0', fontSize: isGauge ? '28px' : '32px', fontWeight: '700' }}>
        {value}{suffix}
      </p>
    </div>
  )
}

const InsightBox = ({ churnMetrics }) => {
  if (!churnMetrics) return null

  const insights = []

  // Insight: highest churn plan
  if (churnMetrics.churnByPlan && churnMetrics.churnByPlan.length > 0) {
    const maxChurnPlan = churnMetrics.churnByPlan.reduce((max, plan) =>
      plan.cancelled > max.cancelled ? plan : max
    )
    insights.push(`Plano "${maxChurnPlan.plan}" lidera com ${maxChurnPlan.cancelled} cancelamentos`)
  }

  // Insight: highest churn city
  if (churnMetrics.churnByCity && churnMetrics.churnByCity.length > 0) {
    const maxChurnCity = churnMetrics.churnByCity.reduce((max, city) =>
      city.cancelled > max.cancelled ? city : max
    )
    insights.push(`Cidade "${maxChurnCity.city}" com ${maxChurnCity.cancelled} cancelamentos`)
  }

  // Insight: top churn reason
  if (churnMetrics.churnReasons && churnMetrics.churnReasons.length > 0) {
    const topReason = churnMetrics.churnReasons.reduce((max, reason) =>
      reason.count > max.count ? reason : max
    )
    insights.push(`Motivo principal: "${topReason.reason}" (${topReason.count} clientes)`)
  }

  // Insight: retention status
  const retentionRate = 100 - (churnMetrics.churnRate || 0)
  if (retentionRate > 95) {
    insights.push('Excelente taxa de retenção')
  } else if (retentionRate > 85) {
    insights.push('Taxa de retenção boa')
  } else {
    insights.push('Atenção: Taxa de retenção abaixo do esperado')
  }

  return (
    <div
      style={{
        backgroundColor: T.card,
        border: `1px solid ${T.cardBorder}`,
        borderRadius: '12px',
        padding: '20px',
        marginTop: '24px',
      }}
    >
      <h3 style={{ color: T.accent, margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600' }}>
        Insights
      </h3>
      <ul style={{ margin: 0, paddingLeft: '20px' }}>
        {insights.map((insight, idx) => (
          <li key={idx} style={{ color: T.textPrimary, marginBottom: '8px', fontSize: '14px', lineHeight: '1.5' }}>
            {insight}
          </li>
        ))}
      </ul>
    </div>
  )
}

export const Churn = () => {
  const { providerId } = useAuth()
  const [churnMetrics, setChurnMetrics] = useState(null)
  const [period, setPeriod] = useState('30')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [syncTime, setSyncTime] = useState(null)

  useEffect(() => {
    fetchChurnMetrics()
  }, [providerId, period])

  const fetchChurnMetrics = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiService.getChurnMetrics(providerId, period)
      setChurnMetrics(data.metrics)
      setSyncTime(new Date())
    } catch (err) {
      setError('Erro ao carregar dados de churn')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleSync = () => {
    fetchChurnMetrics()
  }

  if (loading && !churnMetrics) {
    return (
      <div style={{ backgroundColor: T.bg, minHeight: '100vh', padding: '24px', color: T.textPrimary }}>
        <p>Carregando dados de churn...</p>
      </div>
    )
  }

  if (error && !churnMetrics) {
    return (
      <div style={{ backgroundColor: T.bg, minHeight: '100vh', padding: '24px', color: T.textPrimary }}>
        <p style={{ color: T.red }}>{error}</p>
      </div>
    )
  }

  const churnRate = churnMetrics?.churnRate || 0
  const retentionRate = 100 - churnRate
  const gaugeChurn = [{ value: Math.min(churnRate, 100), fill: T.red }]
  const gaugeRetention = [{ value: Math.min(retentionRate, 100), fill: T.green }]

  const churnByMonthData = churnMetrics?.churnByMonth || []
  const churnByPlanData = churnMetrics?.churnByPlan || []
  const churnByCityData = churnMetrics?.churnByCity || []
  const churnReasonsData = churnMetrics?.churnReasons || []

  const pieColors = [T.red, T.orange, T.gold, T.pink, T.accent, T.cyan]

  return (
    <div style={{ backgroundColor: T.bg, minHeight: '100vh', padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h1 style={{ color: T.textPrimary, margin: 0, fontSize: '28px', fontWeight: '700' }}>
            Churn — Análise de Cancelamentos
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            style={{
              backgroundColor: T.card,
              color: T.textPrimary,
              border: `1px solid ${T.cardBorder}`,
              borderRadius: '8px',
              padding: '8px 12px',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            <option value="30">Últimos 30 dias</option>
            <option value="60">Últimos 60 dias</option>
            <option value="90">Últimos 90 dias</option>
          </select>
          <button
            onClick={handleSync}
            style={{
              backgroundColor: T.accent,
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 16px',
              fontSize: '14px',
              cursor: 'pointer',
              fontWeight: '600',
            }}
          >
            {loading ? 'Sincronizando...' : 'Sincronizar'}
          </button>
          {syncTime && (
            <p style={{ color: T.textMuted, margin: 0, fontSize: '12px' }}>
              Último sync: {syncTime.toLocaleTimeString('pt-BR')}
            </p>
          )}
        </div>
      </div>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <KPICard
          label="Taxa de Churn"
          value={churnRate.toFixed(2)}
          suffix="%"
          isGauge={true}
          gaugeData={gaugeChurn}
          gaugeColor={T.red}
        />
        <KPICard
          label="Cancelados no Período"
          value={churnMetrics?.cancelledInPeriod || 0}
        />
        <KPICard
          label="Suspensos"
          value={churnMetrics?.suspendedCount || 0}
          bgColor={T.orange}
        />
        <KPICard
          label="Vida Média"
          value={churnMetrics?.avgLifetimeMonths?.toFixed(1) || 0}
          suffix=" meses"
        />
        <KPICard
          label="Total de Base"
          value={churnMetrics?.totalCustomers || 0}
        />
        <KPICard
          label="Taxa de Retenção"
          value={retentionRate.toFixed(2)}
          suffix="%"
          isGauge={true}
          gaugeData={gaugeRetention}
          gaugeColor={T.green}
        />
      </div>

      {/* Row 2: Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '24px' }}>
        {/* Cancelamentos por Mês */}
        <div
          style={{
            backgroundColor: T.card,
            border: `1px solid ${T.cardBorder}`,
            borderRadius: '12px',
            padding: '20px',
            gridColumn: 'span 2',
          }}
        >
          <h3 style={{ color: T.textPrimary, margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600' }}>
            Cancelamentos por Mês
          </h3>
          {churnByMonthData && churnByMonthData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={churnByMonthData} margin={{ top: 10, right: 30, left: 0, bottom: 40 }}>
                <defs>
                  <linearGradient id="colorChurn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={T.red} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={T.red} stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={T.gridLine} />
                <XAxis
                  dataKey="date"
                  stroke={T.textMuted}
                  style={{ fontSize: '12px' }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis stroke={T.textMuted} style={{ fontSize: '12px' }} />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke={T.red}
                  fillOpacity={1}
                  fill="url(#colorChurn)"
                  dot={{ fill: T.red, r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ color: T.textMuted, textAlign: 'center', padding: '40px 0' }}>
              Dados não disponíveis
            </p>
          )}
        </div>

        {/* Motivos de Cancelamento */}
        <div
          style={{
            backgroundColor: T.card,
            border: `1px solid ${T.cardBorder}`,
            borderRadius: '12px',
            padding: '20px',
          }}
        >
          <h3 style={{ color: T.textPrimary, margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600' }}>
            Motivos de Cancelamento
          </h3>
          {churnReasonsData && churnReasonsData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                  <Pie
                    data={churnReasonsData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={70}
                    innerRadius={50}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {churnReasonsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {churnReasonsData.map((reason, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                    <div
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '2px',
                        backgroundColor: pieColors[idx % pieColors.length],
                      }}
                    />
                    <span style={{ color: T.textPrimary }}>{reason.reason}</span>
                    <span style={{ marginLeft: 'auto', color: T.textSecondary }}>{reason.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p style={{ color: T.textMuted, textAlign: 'center', padding: '40px 0' }}>
              Dados não disponíveis
            </p>
          )}
        </div>
      </div>

      {/* Row 3: Churn by Plan and City */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '24px' }}>
        {/* Churn por Plano */}
        <div
          style={{
            backgroundColor: T.card,
            border: `1px solid ${T.cardBorder}`,
            borderRadius: '12px',
            padding: '20px',
          }}
        >
          <h3 style={{ color: T.textPrimary, margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600' }}>
            Churn por Plano
          </h3>
          {churnByPlanData && churnByPlanData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={churnByPlanData} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.gridLine} />
                <XAxis type="number" stroke={T.textMuted} style={{ fontSize: '12px' }} />
                <YAxis type="category" dataKey="plan" stroke={T.textMuted} style={{ fontSize: '11px' }} width={95} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="cancelled" fill={T.red} radius={[0, 8, 8, 0]}>
                  {churnByPlanData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={index % 2 === 0 ? T.red : '#d84747'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ color: T.textMuted, textAlign: 'center', padding: '40px 0' }}>
              Dados não disponíveis
            </p>
          )}
        </div>

        {/* Churn por Cidade */}
        <div
          style={{
            backgroundColor: T.card,
            border: `1px solid ${T.cardBorder}`,
            borderRadius: '12px',
            padding: '20px',
          }}
        >
          <h3 style={{ color: T.textPrimary, margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600' }}>
            Churn por Cidade
          </h3>
          {churnByCityData && churnByCityData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={churnByCityData} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.gridLine} />
                <XAxis type="number" stroke={T.textMuted} style={{ fontSize: '12px' }} />
                <YAxis type="category" dataKey="city" stroke={T.textMuted} style={{ fontSize: '11px' }} width={95} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="cancelled" fill={T.orange} radius={[0, 8, 8, 0]}>
                  {churnByCityData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={index % 2 === 0 ? T.orange : '#f0a820'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ color: T.textMuted, textAlign: 'center', padding: '40px 0' }}>
              Dados não disponíveis
            </p>
          )}
        </div>
      </div>

      {/* Insights */}
      <InsightBox churnMetrics={churnMetrics} />
    </div>
  )
}

export default Churn
