import React, { useState, useEffect } from 'react'
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  Shield,
  Bell,
  Activity,
  Zap,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { apiService } from '../services/api'

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

const Alertas = () => {
  const { user } = useAuth()
  const [providerId, setProviderId] = useState(null)

  const [overviewMetrics, setOverviewMetrics] = useState(null)
  const [churnMetrics, setChurnMetrics] = useState(null)
  const [planMetrics, setPlanMetrics] = useState(null)
  const [geoMetrics, setGeoMetrics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [generatedAt] = useState(new Date())

  useEffect(() => {
    apiService.getProviders().then(res => {
      const list = res.data.providers || []
      if (list.length > 0) setProviderId(list[0]._id)
    }).catch(err => setError('Erro ao carregar provedores'))
  }, [])

  useEffect(() => {
    if (!providerId) return

    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)

        const [overview, churn, plans, geo] = await Promise.all([
          apiService.getOverviewMetrics(providerId),
          apiService.getChurnMetrics(providerId),
          apiService.getPlanMetrics(providerId),
          apiService.getGeographicMetrics(providerId),
        ])

        setOverviewMetrics(overview.data.metrics || {})
        setChurnMetrics(churn.data.metrics || {})
        setPlanMetrics(plans.data.metrics || {})
        setGeoMetrics(geo.data.metrics || {})
      } catch (err) {
        console.error('Error fetching alert data:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [providerId])

  // Generate alerts from metrics
  const generateAlerts = () => {
    const alerts = []

    // Parse metrics safely
    const churnRate = churnMetrics?.churnRate ?? 0
    const cancellationsMonth = churnMetrics?.cancellationsMonth ?? 0
    const activationsMonth = churnMetrics?.activationsMonth ?? 0
    const activationsLastMonth = churnMetrics?.activationsLastMonth ?? 0
    const suspendedCustomers = churnMetrics?.suspendedCustomers ?? 0
    const totalCustomers = churnMetrics?.totalCustomers ?? 1
    const suspensionRate = totalCustomers > 0 ? (suspendedCustomers / totalCustomers) * 100 : 0

    // Critical: churnRate > 5%
    if (churnRate > 5) {
      alerts.push({
        severity: 'critical',
        category: 'Churn',
        title: 'Taxa de Cancelamento Crítica',
        detail: `Taxa de cancelamento em ${churnRate.toFixed(2)}% — acima do limite de 5%`,
        value: `${churnRate.toFixed(2)}%`,
        timestamp: new Date(),
      })
    }

    // Critical: Net negative growth (cancellations > activations)
    if (cancellationsMonth > activationsMonth && activationsMonth > 0) {
      alerts.push({
        severity: 'critical',
        category: 'Crescimento',
        title: 'Crescimento Negativo Detectado',
        detail: `Cancelamentos (${cancellationsMonth}) > Ativações (${activationsMonth}) no mês`,
        value: `-${(cancellationsMonth - activationsMonth)}`,
        timestamp: new Date(),
      })
    }

    // Warning: suspendedCustomers > 10%
    if (suspensionRate > 10) {
      alerts.push({
        severity: 'warning',
        category: 'Suspensões',
        title: 'Taxa de Suspensão Elevada',
        detail: `${suspensionRate.toFixed(2)}% de clientes suspensos — acima de 10%`,
        value: `${suspendedCustomers}/${totalCustomers}`,
        timestamp: new Date(),
      })
    }

    // Warning: churnRate between 3-5%
    if (churnRate >= 3 && churnRate <= 5) {
      alerts.push({
        severity: 'warning',
        category: 'Churn',
        title: 'Taxa de Cancelamento Elevada',
        detail: `Taxa de cancelamento em ${churnRate.toFixed(2)}% — monitoramento recomendado`,
        value: `${churnRate.toFixed(2)}%`,
        timestamp: new Date(),
      })
    }

    // Check individual plans for churn > 15%
    if (planMetrics?.plans && Array.isArray(planMetrics.plans)) {
      planMetrics.plans.forEach((plan) => {
        if (plan.churnRate && plan.churnRate > 15) {
          alerts.push({
            severity: 'warning',
            category: 'Planos',
            title: `Alto Churn no Plano: ${plan.name}`,
            detail: `Churn de ${plan.churnRate.toFixed(2)}% — acima de 15%`,
            value: `${plan.churnRate.toFixed(2)}%`,
            timestamp: new Date(),
          })
        }
      })
    }

    // Info: activationsMonth > activationsLastMonth (growth)
    if (activationsMonth > activationsLastMonth) {
      alerts.push({
        severity: 'info',
        category: 'Crescimento',
        title: 'Crescimento em Ativações Detectado',
        detail: `Ativações deste mês (${activationsMonth}) > mês anterior (${activationsLastMonth})`,
        value: `+${activationsMonth - activationsLastMonth}`,
        timestamp: new Date(),
      })
    }

    // Info: Top plan information
    if (planMetrics?.plans && Array.isArray(planMetrics.plans) && planMetrics.plans.length > 0) {
      const topPlan = planMetrics.plans.reduce((prev, current) =>
        (prev.subscribers || 0) > (current.subscribers || 0) ? prev : current
      )
      if (topPlan && topPlan.name) {
        alerts.push({
          severity: 'info',
          category: 'Planos',
          title: `Plano Mais Popular: ${topPlan.name}`,
          detail: `Plano com maior número de assinantes`,
          value: `${topPlan.subscribers || 0} clientes`,
          timestamp: new Date(),
        })
      }
    }

    // OK: churnRate < 2%
    if (churnRate < 2) {
      alerts.push({
        severity: 'ok',
        category: 'Churn',
        title: 'Taxa de Cancelamento Saudável',
        detail: `Taxa de cancelamento baixa em ${churnRate.toFixed(2)}%`,
        value: `${churnRate.toFixed(2)}%`,
        timestamp: new Date(),
      })
    }

    // OK: Net growth positive
    const netGrowth = activationsMonth - cancellationsMonth
    if (netGrowth > 0) {
      alerts.push({
        severity: 'ok',
        category: 'Crescimento',
        title: 'Crescimento Positivo',
        detail: `Crescimento líquido de ${netGrowth} clientes neste mês`,
        value: `+${netGrowth}`,
        timestamp: new Date(),
      })
    }

    // Add server-side insights
    if (overviewMetrics?.insights && Array.isArray(overviewMetrics.insights)) {
      overviewMetrics.insights.forEach((insight) => {
        alerts.push({
          severity: insight.severity || 'info',
          category: insight.category || 'Sistema',
          title: insight.title,
          detail: insight.detail,
          value: insight.value || '',
          timestamp: new Date(),
          isServerInsight: true,
        })
      })
    }

    // Sort: critical → warning → info → ok
    const severityOrder = { critical: 0, warning: 1, info: 2, ok: 3 }
    alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

    return alerts
  }

  const alerts = generateAlerts()

  // Count alerts by severity
  const alertCounts = {
    critical: alerts.filter((a) => a.severity === 'critical').length,
    warning: alerts.filter((a) => a.severity === 'warning').length,
    info: alerts.filter((a) => a.severity === 'info').length,
    ok: alerts.filter((a) => a.severity === 'ok').length,
  }

  const getSeverityColor = (severity) => {
    const colors = {
      critical: T.red,
      warning: T.orange,
      info: T.blue,
      ok: T.green,
    }
    return colors[severity] || T.textMuted
  }

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'critical':
        return <AlertTriangle size={20} />
      case 'warning':
        return <AlertCircle size={20} />
      case 'info':
        return <Info size={20} />
      case 'ok':
        return <CheckCircle2 size={20} />
      default:
        return <Bell size={20} />
    }
  }

  if (loading) {
    return (
      <div
        style={{
          backgroundColor: T.bg,
          minHeight: '100vh',
          padding: '2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ color: T.textPrimary, fontSize: '1.125rem' }}>
          Carregando alertas...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          backgroundColor: T.bg,
          minHeight: '100vh',
          padding: '2rem',
        }}
      >
        <div
          style={{
            backgroundColor: T.card,
            border: `1px solid ${T.red}`,
            borderRadius: '0.5rem',
            padding: '1.5rem',
            color: T.red,
          }}
        >
          <strong>Erro ao carregar alertas:</strong> {error}
        </div>
      </div>
    )
  }

  return (
    <div style={{ backgroundColor: T.bg, minHeight: '100vh', padding: '2rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '0.5rem',
          }}
        >
          <Zap size={28} style={{ color: T.accent }} />
          <h1 style={{ color: T.textPrimary, fontSize: '2rem', fontWeight: 'bold', margin: 0 }}>
            Alertas — Central de Monitoramento
          </h1>
        </div>
        <p style={{ color: T.textSecondary, margin: '0.5rem 0 0 0', fontSize: '0.875rem' }}>
          Monitoramento de saúde de métricas comerciais em tempo real
        </p>
      </div>

      {/* Status Summary Bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem',
        }}
      >
        {/* Critical Card */}
        <div
          style={{
            backgroundColor: T.card,
            border: `2px solid ${T.red}`,
            borderRadius: '0.75rem',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            animation: alertCounts.critical > 0 ? 'pulse 2s infinite' : 'none',
          }}
        >
          <AlertTriangle size={28} style={{ color: T.red, marginBottom: '0.5rem' }} />
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: T.red }}>
            {alertCounts.critical}
          </div>
          <div style={{ color: T.textMuted, fontSize: '0.875rem' }}>Crítico</div>
        </div>

        {/* Warning Card */}
        <div
          style={{
            backgroundColor: T.card,
            border: `2px solid ${T.orange}`,
            borderRadius: '0.75rem',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <AlertCircle size={28} style={{ color: T.orange, marginBottom: '0.5rem' }} />
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: T.orange }}>
            {alertCounts.warning}
          </div>
          <div style={{ color: T.textMuted, fontSize: '0.875rem' }}>Aviso</div>
        </div>

        {/* Info Card */}
        <div
          style={{
            backgroundColor: T.card,
            border: `2px solid ${T.blue}`,
            borderRadius: '0.75rem',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <Info size={28} style={{ color: T.blue, marginBottom: '0.5rem' }} />
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: T.blue }}>
            {alertCounts.info}
          </div>
          <div style={{ color: T.textMuted, fontSize: '0.875rem' }}>Informação</div>
        </div>

        {/* OK Card */}
        <div
          style={{
            backgroundColor: T.card,
            border: `2px solid ${T.green}`,
            borderRadius: '0.75rem',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <CheckCircle2 size={28} style={{ color: T.green, marginBottom: '0.5rem' }} />
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: T.green }}>
            {alertCounts.ok}
          </div>
          <div style={{ color: T.textMuted, fontSize: '0.875rem' }}>OK</div>
        </div>
      </div>

      {/* Alerts List */}
      <div style={{ marginBottom: '2rem' }}>
        <h2
          style={{
            color: T.textPrimary,
            fontSize: '1.25rem',
            fontWeight: 'bold',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Bell size={24} style={{ color: T.accent }} />
          Alertas Gerados ({alerts.length})
        </h2>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            maxHeight: '600px',
            overflowY: 'auto',
            paddingRight: '0.5rem',
          }}
        >
          {alerts.length === 0 ? (
            <div
              style={{
                backgroundColor: T.card,
                border: `1px solid ${T.cardBorder}`,
                borderRadius: '0.5rem',
                padding: '2rem',
                textAlign: 'center',
                color: T.textMuted,
              }}
            >
              Nenhum alerta gerado. Sistema em bom estado.
            </div>
          ) : (
            alerts.map((alert, idx) => (
              <div
                key={idx}
                style={{
                  backgroundColor: T.card,
                  border: `1px solid ${T.cardBorder}`,
                  borderLeft: `4px solid ${getSeverityColor(alert.severity)}`,
                  borderRadius: '0.5rem',
                  padding: '1rem',
                  display: 'flex',
                  gap: '1rem',
                  alignItems: 'flex-start',
                }}
              >
                {/* Icon */}
                <div
                  style={{
                    color: getSeverityColor(alert.severity),
                    flexShrink: 0,
                    marginTop: '0.125rem',
                  }}
                >
                  {getSeverityIcon(alert.severity)}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      marginBottom: '0.25rem',
                    }}
                  >
                    <h3 style={{ color: T.textPrimary, fontSize: '1rem', fontWeight: 'bold', margin: 0 }}>
                      {alert.title}
                    </h3>
                    <span
                      style={{
                        backgroundColor: getSeverityColor(alert.severity),
                        color: '#000',
                        padding: '0.25rem 0.625rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                      }}
                    >
                      {alert.category}
                    </span>
                  </div>
                  <p style={{ color: T.textSecondary, fontSize: '0.875rem', margin: '0.25rem 0', lineHeight: '1.4' }}>
                    {alert.detail}
                  </p>
                  <div style={{ color: T.textMuted, fontSize: '0.75rem', marginTop: '0.5rem' }}>
                    {alert.timestamp.toLocaleTimeString('pt-BR')}
                  </div>
                </div>

                {/* Value */}
                <div
                  style={{
                    textAlign: 'right',
                    flexShrink: 0,
                    color: getSeverityColor(alert.severity),
                    fontWeight: 'bold',
                    fontSize: '1.125rem',
                  }}
                >
                  {alert.value}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* System Health Card */}
      <div
        style={{
          backgroundColor: T.card,
          border: `1px solid ${T.cardBorder}`,
          borderRadius: '0.75rem',
          padding: '1.5rem',
        }}
      >
        <h3
          style={{
            color: T.textPrimary,
            fontSize: '1.125rem',
            fontWeight: 'bold',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Shield size={20} style={{ color: T.green }} />
          Saúde do Sistema
        </h3>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1.5rem',
          }}
        >
          {/* Data Freshness */}
          <div>
            <div style={{ color: T.textMuted, fontSize: '0.875rem', marginBottom: '0.25rem' }}>
              Dados Atualizados
            </div>
            <div style={{ color: T.textPrimary, fontSize: '1rem', fontWeight: 'bold' }}>
              {generatedAt.toLocaleTimeString('pt-BR')}
            </div>
            <div style={{ color: T.textMuted, fontSize: '0.75rem', marginTop: '0.25rem' }}>
              {generatedAt.toLocaleDateString('pt-BR')}
            </div>
          </div>

          {/* Total Customers */}
          <div>
            <div style={{ color: T.textMuted, fontSize: '0.875rem', marginBottom: '0.25rem' }}>
              Total de Clientes
            </div>
            <div style={{ color: T.textPrimary, fontSize: '1rem', fontWeight: 'bold' }}>
              {churnMetrics?.totalCustomers?.toLocaleString('pt-BR') || '—'}
            </div>
            <div style={{ color: T.textMuted, fontSize: '0.75rem', marginTop: '0.25rem' }}>
              Clientes ativos
            </div>
          </div>

          {/* Metrics Count */}
          <div>
            <div style={{ color: T.textMuted, fontSize: '0.875rem', marginBottom: '0.25rem' }}>
              Métricas Coletadas
            </div>
            <div style={{ color: T.textPrimary, fontSize: '1rem', fontWeight: 'bold' }}>
              {alerts.length}
            </div>
            <div style={{ color: T.textMuted, fontSize: '0.75rem', marginTop: '0.25rem' }}>
              Alertas gerados
            </div>
          </div>

          {/* Sync Status */}
          <div>
            <div style={{ color: T.textMuted, fontSize: '0.875rem', marginBottom: '0.25rem' }}>
              Status de Sincronização
            </div>
            <div
              style={{
                color: T.green,
                fontSize: '1rem',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <Activity size={16} />
              Ativo
            </div>
            <div style={{ color: T.textMuted, fontSize: '0.75rem', marginTop: '0.25rem' }}>
              Todas as APIs respondendo
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.7;
          }
        }
      `}</style>
    </div>
  )
}

export { Alertas }
export default Alertas
