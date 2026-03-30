import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import {
  AlertTriangle, TrendingUp, TrendingDown, RefreshCw, Calendar,
  Users, Target, DollarSign, TrendingUpIcon, AlertCircle, CheckCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';

const T = {
  bg: '#0f0a1e', card: '#1a1232', cardBorder: '#2d2152', accent: '#7c3aed',
  cyan: '#06d6a0', gold: '#f5a623', pink: '#e74fc4', orange: '#f97316',
  red: '#ef4444', green: '#10b981', blue: '#3b82f6', textPrimary: '#f1f5f9',
  textSecondary: '#a78bfa', textMuted: '#7c6fa0', gridLine: '#1e1640',
};

export const VisaoGeral = () => {
  const { user } = useAuth();
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [period, setPeriod] = useState('current');

  // Fetch providers on mount
  useEffect(() => {
    const fetchProviders = async () => {
      try {
        setLoading(true);
        const response = await apiService.getProviders();
        const list = response.data.providers || [];
        setProviders(list);
        if (list.length > 0) {
          setSelectedProvider(list[0]._id);
        }
      } catch (err) {
        setError(err.message || 'Erro ao carregar provedores');
      } finally {
        setLoading(false);
      }
    };
    fetchProviders();
  }, []);

  // Fetch metrics when provider changes
  useEffect(() => {
    if (selectedProvider) {
      fetchMetrics();
    }
  }, [selectedProvider, period]);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiService.getOverviewMetrics(selectedProvider);
      setMetrics(response.data.metrics);
    } catch (err) {
      setError(err.message || 'Erro ao carregar métricas');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      await fetchMetrics();
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const formatCurrency = (value) => {
    if (value === null || value === undefined) return 'R$ 0,00';
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const formatNumber = (value) => {
    if (value === null || value === undefined) return '0';
    return value.toLocaleString('pt-BR');
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('pt-BR');
  };

  const getInsightIcon = (type) => {
    switch (type) {
      case 'danger':
        return <AlertTriangle size={16} />;
      case 'warning':
        return <AlertCircle size={16} />;
      case 'success':
        return <CheckCircle size={16} />;
      default:
        return <AlertTriangle size={16} />;
    }
  };

  const getInsightColor = (type) => {
    switch (type) {
      case 'danger':
        return { bg: '#7f1d1d', text: '#fca5a5', border: '#dc2626' };
      case 'warning':
        return { bg: '#7c2d12', text: '#fdba74', border: '#ea580c' };
      case 'success':
        return { bg: '#064e3b', text: '#86efac', border: '#059669' };
      default:
        return { bg: '#1e1b4b', text: '#c7d2fe', border: '#818cf8' };
    }
  };

  const KPICard = ({ icon: Icon, label, value, formatFn, trend, trendValue, color }) => (
    <div
      style={{
        backgroundColor: T.card,
        border: `1px solid ${T.cardBorder}`,
        borderRadius: '12px',
        padding: '16px',
        flex: 1,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <span style={{ color: T.pink, fontSize: '12px', fontWeight: '600' }}>{label}</span>
        {Icon && <Icon size={20} style={{ color: T.textSecondary }} />}
      </div>
      <div style={{ fontSize: '28px', fontWeight: 'bold', color: color || T.textPrimary, marginBottom: '8px' }}>
        {formatFn ? formatFn(value) : value}
      </div>
      {trend && trendValue !== null && trendValue !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
          {trendValue >= 0 ? (
            <>
              <TrendingUp size={14} style={{ color: T.green }} />
              <span style={{ color: T.green }}>+{formatNumber(trendValue)}</span>
            </>
          ) : (
            <>
              <TrendingDown size={14} style={{ color: T.red }} />
              <span style={{ color: T.red }}>{formatNumber(trendValue)}</span>
            </>
          )}
        </div>
      )}
    </div>
  );

  if (loading && !metrics) {
    return (
      <div style={{ backgroundColor: T.bg, color: T.textPrimary, padding: '32px', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', paddingTop: '64px' }}>
          <RefreshCw size={32} style={{ animation: 'spin 2s linear infinite' }} />
          <p style={{ marginTop: '16px' }}>Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: T.bg, color: T.textPrimary, padding: '32px', minHeight: '100vh' }}>
      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '32px',
          paddingBottom: '16px',
          borderBottom: `1px solid ${T.gridLine}`,
        }}
      >
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', margin: '0 0 4px 0' }}>
            Visão Geral — Painel de Controle
          </h1>
          <p style={{ margin: 0, color: T.textSecondary, fontSize: '14px' }}>
            {user?.name} • {providers.find(p => p._id === selectedProvider)?.name || 'Selecione um provedor'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          {/* Provider Selector */}
          <select
            value={selectedProvider || ''}
            onChange={(e) => setSelectedProvider(e.target.value)}
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
            {providers.map((p) => (
              <option key={p._id} value={p._id} style={{ backgroundColor: T.card, color: T.textPrimary }}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Period Selector */}
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
            <option value="current">Mês Atual</option>
            <option value="previous">Mês Anterior</option>
            <option value="ytd">Ano Corrente</option>
          </select>

          {/* Sync Button */}
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{
              backgroundColor: T.accent,
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 16px',
              cursor: syncing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '14px',
              opacity: syncing ? 0.6 : 1,
            }}
          >
            <RefreshCw size={16} style={{ animation: syncing ? 'spin 2s linear infinite' : 'none' }} />
            {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div
          style={{
            backgroundColor: '#7f1d1d',
            border: `1px solid ${T.red}`,
            color: '#fca5a5',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {metrics && (
        <>
          {/* Smart Alerts/Insights Bar */}
          {metrics.insights && metrics.insights.length > 0 && (
            <div
              style={{
                display: 'flex',
                gap: '12px',
                marginBottom: '24px',
                flexWrap: 'wrap',
              }}
            >
              {metrics.insights.map((insight, idx) => {
                const colors = getInsightColor(insight.type);
                return (
                  <div
                    key={idx}
                    style={{
                      backgroundColor: colors.bg,
                      border: `1px solid ${colors.border}`,
                      color: colors.text,
                      padding: '12px 16px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '13px',
                      fontWeight: '500',
                    }}
                  >
                    {getInsightIcon(insight.type)}
                    <span>{insight.msg}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* KPI Row */}
          <div style={{ display: 'flex', gap: '16px', marginBottom: '32px', flexWrap: 'wrap' }}>
            <KPICard
              icon={TrendingUp}
              label="Novos Hoje"
              value={metrics.activationsToday || 0}
              formatFn={formatNumber}
              color={T.cyan}
            />
            <KPICard
              icon={Target}
              label="Ativações Mês"
              value={metrics.activationsMonth || 0}
              formatFn={formatNumber}
              trend={true}
              trendValue={(metrics.activationsMonth || 0) - (metrics.activationsLastMonth || 0)}
            />
            <KPICard
              icon={AlertTriangle}
              label="Cancelamentos Mês"
              value={metrics.cancellationsMonth || 0}
              formatFn={formatNumber}
              color={T.red}
              trend={true}
              trendValue={(metrics.cancellationsMonth || 0) - (metrics.cancellationsLastMonth || 0)}
            />
            <KPICard
              icon={TrendingUpIcon}
              label="Saldo Líquido"
              value={metrics.netGrowthMonth || 0}
              formatFn={formatNumber}
              color={(metrics.netGrowthMonth || 0) >= 0 ? T.green : T.red}
              trend={true}
              trendValue={(metrics.netGrowthMonth || 0) - (metrics.netGrowthLastMonth || 0)}
            />
            <KPICard
              icon={Users}
              label="Total Base"
              value={metrics.totalCustomers || 0}
              formatFn={formatNumber}
            />
            <KPICard
              icon={CheckCircle}
              label="Ativos"
              value={metrics.activeCustomers || 0}
              formatFn={formatNumber}
              color={T.green}
            />
            <KPICard
              icon={DollarSign}
              label="MRR"
              value={metrics.mrr || 0}
              formatFn={formatCurrency}
              color={T.gold}
            />
            <KPICard
              icon={DollarSign}
              label="ARPU"
              value={metrics.arpu || 0}
              formatFn={formatCurrency}
              color={T.gold}
            />
          </div>

          {/* Charts Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px', marginBottom: '32px' }}>
            {/* Top Cidades */}
            <div
              style={{
                backgroundColor: T.card,
                border: `1px solid ${T.cardBorder}`,
                borderRadius: '12px',
                padding: '20px',
              }}
            >
              <h3 style={{ color: T.pink, fontSize: '16px', fontWeight: 'bold', margin: '0 0 16px 0' }}>
                Top Cidades
              </h3>
              {metrics.topCities && metrics.topCities.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart
                    data={metrics.topCities.slice(0, 5)}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={T.gridLine} />
                    <XAxis type="number" stroke={T.textMuted} />
                    <YAxis dataKey="city" type="category" stroke={T.textMuted} width={95} tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: T.card, border: `1px solid ${T.cardBorder}`, color: T.textPrimary }}
                      cursor={{ fill: 'rgba(124, 58, 237, 0.1)' }}
                    />
                    <Bar dataKey="count" fill={T.cyan} radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p style={{ color: T.textMuted, fontSize: '14px' }}>Sem dados</p>
              )}
            </div>

            {/* Top Planos */}
            <div
              style={{
                backgroundColor: T.card,
                border: `1px solid ${T.cardBorder}`,
                borderRadius: '12px',
                padding: '20px',
              }}
            >
              <h3 style={{ color: T.pink, fontSize: '16px', fontWeight: 'bold', margin: '0 0 16px 0' }}>
                Top Planos
              </h3>
              {metrics.topPlans && metrics.topPlans.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart
                    data={metrics.topPlans.slice(0, 5)}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={T.gridLine} />
                    <XAxis type="number" stroke={T.textMuted} />
                    <YAxis dataKey="plan" type="category" stroke={T.textMuted} width={95} tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: T.card, border: `1px solid ${T.cardBorder}`, color: T.textPrimary }}
                      cursor={{ fill: 'rgba(124, 58, 237, 0.1)' }}
                    />
                    <Bar dataKey="count" fill={T.gold} radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p style={{ color: T.textMuted, fontSize: '14px' }}>Sem dados</p>
              )}
            </div>

            {/* Status da Base */}
            <div
              style={{
                backgroundColor: T.card,
                border: `1px solid ${T.cardBorder}`,
                borderRadius: '12px',
                padding: '20px',
              }}
            >
              <h3 style={{ color: T.pink, fontSize: '16px', fontWeight: 'bold', margin: '0 0 16px 0' }}>
                Status da Base
              </h3>
              {metrics.activeCustomers !== null && metrics.suspendedCustomers !== null && metrics.cancelledCustomers !== null ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Ativos', value: metrics.activeCustomers, fill: T.green },
                        { name: 'Suspensos', value: metrics.suspendedCustomers, fill: T.orange },
                        { name: 'Cancelados', value: metrics.cancelledCustomers, fill: T.red },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {[T.green, T.orange, T.red].map((color, idx) => (
                        <Cell key={`cell-${idx}`} fill={color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: T.card, border: `1px solid ${T.cardBorder}`, color: T.textPrimary }}
                      formatter={(value) => formatNumber(value)}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p style={{ color: T.textMuted, fontSize: '14px' }}>Sem dados</p>
              )}
            </div>
          </div>

          {/* Tables Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {/* Recent Activations */}
            <div
              style={{
                backgroundColor: T.card,
                border: `1px solid ${T.cardBorder}`,
                borderRadius: '12px',
                padding: '20px',
              }}
            >
              <h3 style={{ color: T.pink, fontSize: '16px', fontWeight: 'bold', margin: '0 0 16px 0' }}>
                Últimas Ativações
              </h3>
              {metrics.recentActivations && metrics.recentActivations.length > 0 ? (
                <div style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '13px',
                    }}
                  >
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${T.gridLine}` }}>
                        <th style={{ textAlign: 'left', padding: '8px', color: T.textSecondary, fontWeight: '600' }}>
                          Nome
                        </th>
                        <th style={{ textAlign: 'left', padding: '8px', color: T.textSecondary, fontWeight: '600' }}>
                          Plano
                        </th>
                        <th style={{ textAlign: 'left', padding: '8px', color: T.textSecondary, fontWeight: '600' }}>
                          Cidade
                        </th>
                        <th style={{ textAlign: 'left', padding: '8px', color: T.textSecondary, fontWeight: '600' }}>
                          Data
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.recentActivations.slice(0, 10).map((activation, idx) => (
                        <tr key={idx} style={{ borderBottom: `1px solid ${T.gridLine}` }}>
                          <td style={{ padding: '8px', color: T.textPrimary }}>{activation.name}</td>
                          <td style={{ padding: '8px', color: T.textSecondary }}>{activation.plan?.name || '-'}</td>
                          <td style={{ padding: '8px', color: T.textSecondary }}>
                            {activation.address?.city || '-'}
                          </td>
                          <td style={{ padding: '8px', color: T.cyan }}>{formatDate(activation.activationDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ color: T.textMuted, fontSize: '14px' }}>Sem dados</p>
              )}
            </div>

            {/* Recent Cancellations */}
            <div
              style={{
                backgroundColor: T.card,
                border: `1px solid ${T.cardBorder}`,
                borderRadius: '12px',
                padding: '20px',
              }}
            >
              <h3 style={{ color: T.pink, fontSize: '16px', fontWeight: 'bold', margin: '0 0 16px 0' }}>
                Últimos Cancelamentos
              </h3>
              {metrics.recentCancellations && metrics.recentCancellations.length > 0 ? (
                <div style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '13px',
                    }}
                  >
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${T.gridLine}` }}>
                        <th style={{ textAlign: 'left', padding: '8px', color: T.textSecondary, fontWeight: '600' }}>
                          Nome
                        </th>
                        <th style={{ textAlign: 'left', padding: '8px', color: T.textSecondary, fontWeight: '600' }}>
                          Plano
                        </th>
                        <th style={{ textAlign: 'left', padding: '8px', color: T.textSecondary, fontWeight: '600' }}>
                          Cidade
                        </th>
                        <th style={{ textAlign: 'left', padding: '8px', color: T.textSecondary, fontWeight: '600' }}>
                          Motivo
                        </th>
                        <th style={{ textAlign: 'left', padding: '8px', color: T.textSecondary, fontWeight: '600' }}>
                          Data
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.recentCancellations.slice(0, 10).map((cancellation, idx) => (
                        <tr key={idx} style={{ borderBottom: `1px solid ${T.gridLine}` }}>
                          <td style={{ padding: '8px', color: T.textPrimary }}>{cancellation.name}</td>
                          <td style={{ padding: '8px', color: T.textSecondary }}>{cancellation.plan?.name || '-'}</td>
                          <td style={{ padding: '8px', color: T.textSecondary }}>
                            {cancellation.address?.city || '-'}
                          </td>
                          <td style={{ padding: '8px', color: T.red }}>{cancellation.cancellationReason || '-'}</td>
                          <td style={{ padding: '8px', color: T.red }}>{formatDate(cancellation.cancellationDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ color: T.textMuted, fontSize: '14px' }}>Sem dados</p>
              )}
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default VisaoGeral;
