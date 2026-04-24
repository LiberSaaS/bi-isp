import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, LineChart, Line,
} from 'recharts';
import { apiService } from '../services/api';

const T = {
  bg: '#0f0a1e', card: '#1a1232', cardBorder: '#2d2152', accent: '#7c3aed',
  cyan: '#06d6a0', gold: '#f5a623', pink: '#e74fc4', orange: '#f97316',
  red: '#ef4444', green: '#10b981', blue: '#3b82f6', textPrimary: '#f1f5f9',
  textSecondary: '#a78bfa', textMuted: '#7c6fa0', gridLine: '#1e1640',
  yellow: '#eab308',
};

const STATUS_COLORS = {
  open: T.orange,
  in_progress: T.blue,
  completed: T.green,
  cancelled: T.red,
};

const STATUS_LABELS = {
  open: 'Aberta',
  in_progress: 'Em Andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

const PRIORITY_COLORS = {
  critical: T.red,
  high: T.orange,
  medium: T.gold,
  low: T.green,
};

const PRIORITY_LABELS = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        backgroundColor: T.card, border: `1px solid ${T.cardBorder}`,
        borderRadius: '6px', padding: '8px 12px', color: T.textPrimary,
      }}>
        <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: T.textSecondary }}>{label}</p>
        {payload.map((entry, i) => (
          <p key={i} style={{ margin: '2px 0', fontSize: '12px', color: entry.color }}>
            {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString('pt-BR') : entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const KPICard = ({ title, value, subtitle, color = T.textPrimary, icon }) => (
  <div style={{
    backgroundColor: T.card, border: `1px solid ${T.cardBorder}`,
    borderRadius: '8px', padding: '16px', flex: 1, minWidth: '140px',
  }}>
    <p style={{ fontSize: '11px', color: T.textMuted, margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
      {icon && <span style={{ marginRight: '4px' }}>{icon}</span>}{title}
    </p>
    <p style={{ fontSize: '24px', fontWeight: 'bold', color, margin: '0' }}>{value}</p>
    {subtitle && <p style={{ fontSize: '11px', color: T.textSecondary, margin: '4px 0 0 0' }}>{subtitle}</p>}
  </div>
);

const AlertBadge = ({ count }) => (
  <span style={{
    backgroundColor: count >= 5 ? T.red : count >= 3 ? T.orange : T.gold,
    color: '#fff', borderRadius: '10px', padding: '2px 8px', fontSize: '11px', fontWeight: 'bold',
  }}>
    {count} O.S.
  </span>
);

function formatMinutes(minutes) {
  if (!minutes || minutes === 0) return '—';
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return `${h}h${m > 0 ? ` ${m}min` : ''}`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return `${d}d ${rh}h`;
}

export default function OrdensServico() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [subjectFilter, setSubjectFilter] = useState('');
  const [period, setPeriod] = useState(90);

  // Load provider
  useEffect(() => {
    apiService.getProviders().then(res => {
      const list = res.data.providers || [];
      if (list.length > 0) setSelectedProvider(list[0]._id);
    }).catch(() => setError('Erro ao carregar provedores'));
  }, []);

  // Load metrics
  useEffect(() => {
    if (!selectedProvider) return;
    setLoading(true);
    setError(null);
    apiService.getServiceOrderMetrics(selectedProvider, period)
      .then(res => {
        setMetrics(res.data.metrics);
        setLoading(false);
      })
      .catch(err => {
        setError('Erro ao carregar métricas de O.S.');
        setLoading(false);
      });
  }, [selectedProvider, period]);

  // Get unique subjects for filter
  const subjects = useMemo(() => {
    if (!metrics?.byCategory) return [];
    return metrics.byCategory.map(c => c.subject).filter(Boolean);
  }, [metrics]);

  // Filter recent orders by subject
  const filteredOrders = useMemo(() => {
    if (!metrics?.recentOrders) return [];
    if (!subjectFilter) return metrics.recentOrders;
    return metrics.recentOrders.filter(o =>
      (o.description || o.category || '').toLowerCase().includes(subjectFilter.toLowerCase())
    );
  }, [metrics, subjectFilter]);

  // Filter top customers by subject
  const filteredTopCustomers = useMemo(() => {
    if (!metrics?.topCustomers) return [];
    if (!subjectFilter) return metrics.topCustomers;
    return metrics.topCustomers
      .map(c => {
        const filtered = c.orders.filter(o =>
          (o.description || o.category || '').toLowerCase().includes(subjectFilter.toLowerCase())
        );
        return filtered.length > 0 ? { ...c, openCount: filtered.length, orders: filtered } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.openCount - a.openCount);
  }, [metrics, subjectFilter]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div style={{ color: T.textSecondary, fontSize: '16px' }}>Carregando O.S....</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div style={{ color: T.red, fontSize: '16px' }}>{error}</div>
      </div>
    );
  }

  if (!metrics) return null;

  const statusData = (metrics.byStatus || []).map(s => ({
    name: STATUS_LABELS[s.status] || s.status,
    value: s.count,
    color: STATUS_COLORS[s.status] || T.textMuted,
  }));

  const priorityData = (metrics.byPriority || []).map(p => ({
    name: PRIORITY_LABELS[p.priority] || p.priority,
    value: p.count,
    color: PRIORITY_COLORS[p.priority] || T.textMuted,
  }));

  const monthlyData = (metrics.byMonth || []).map(m => ({
    date: new Date(m.date).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
    Abertas: m.opened,
    Fechadas: m.closed,
  }));

  const categoryData = (metrics.byCategory || []).slice(0, 10).map(c => ({
    name: (c.subject || 'N/A').length > 25 ? c.subject.substring(0, 25) + '…' : (c.subject || 'N/A'),
    fullName: c.subject || 'N/A',
    Abertas: c.open,
    Concluídas: c.completed,
    Canceladas: c.cancelled,
    Total: c.total,
  }));

  return (
    <div style={{ padding: '0' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ color: T.textPrimary, fontSize: '22px', margin: 0, fontWeight: 600 }}>
          Ordens de Serviço
        </h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select
            value={period}
            onChange={e => setPeriod(Number(e.target.value))}
            style={{
              backgroundColor: T.card, color: T.textPrimary, border: `1px solid ${T.cardBorder}`,
              borderRadius: '6px', padding: '6px 10px', fontSize: '13px', cursor: 'pointer',
            }}
          >
            <option value={30}>30 dias</option>
            <option value={60}>60 dias</option>
            <option value={90}>90 dias</option>
            <option value={180}>180 dias</option>
            <option value={365}>1 ano</option>
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <KPICard title="Total O.S." value={metrics.totalOrders} color={T.textPrimary} />
        <KPICard title="Abertas" value={metrics.openOrders} color={T.orange} subtitle={`${metrics.inProgressOrders} em andamento`} />
        <KPICard title="Concluídas" value={metrics.completedOrders} color={T.green} />
        <KPICard title="Abertas no Mês" value={metrics.openedThisMonth} color={T.cyan} subtitle={`${metrics.closedThisMonth} fechadas`} />
        <KPICard title="Tempo Médio" value={formatMinutes(metrics.avgResolutionMinutes)} color={T.gold} subtitle="resolução" />
      </div>

      {/* Filter by Subject */}
      <div style={{
        backgroundColor: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: '8px',
        padding: '14px 16px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
      }}>
        <span style={{ color: T.textSecondary, fontSize: '13px', fontWeight: 500 }}>Filtrar por Assunto:</span>
        <select
          value={subjectFilter}
          onChange={e => setSubjectFilter(e.target.value)}
          style={{
            backgroundColor: T.bg, color: T.textPrimary, border: `1px solid ${T.cardBorder}`,
            borderRadius: '6px', padding: '6px 12px', fontSize: '13px', flex: 1, minWidth: '200px', maxWidth: '400px',
          }}
        >
          <option value="">Todos os Assuntos</option>
          {subjects.map((s, i) => (
            <option key={i} value={s}>{s}</option>
          ))}
        </select>
        {subjectFilter && (
          <button
            onClick={() => setSubjectFilter('')}
            style={{
              backgroundColor: T.accent, color: '#fff', border: 'none', borderRadius: '6px',
              padding: '6px 12px', fontSize: '12px', cursor: 'pointer',
            }}
          >
            Limpar
          </button>
        )}
      </div>

      {/* Charts Row 1: Status + Priority + Monthly */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        {/* Status Pie */}
        <div style={{ backgroundColor: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: '8px', padding: '16px' }}>
          <h3 style={{ color: T.textPrimary, fontSize: '14px', margin: '0 0 12px 0' }}>Distribuição por Status</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={statusData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Priority Pie */}
        <div style={{ backgroundColor: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: '8px', padding: '16px' }}>
          <h3 style={{ color: T.textPrimary, fontSize: '14px', margin: '0 0 12px 0' }}>Distribuição por Prioridade</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={priorityData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                {priorityData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly Evolution */}
        <div style={{ backgroundColor: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: '8px', padding: '16px' }}>
          <h3 style={{ color: T.textPrimary, fontSize: '14px', margin: '0 0 12px 0' }}>Evolução Mensal</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.gridLine} />
              <XAxis dataKey="date" tick={{ fill: T.textMuted, fontSize: 11 }} />
              <YAxis tick={{ fill: T.textMuted, fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Line type="monotone" dataKey="Abertas" stroke={T.orange} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Fechadas" stroke={T.green} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart: By Category/Subject */}
      {categoryData.length > 0 && (
        <div style={{ backgroundColor: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
          <h3 style={{ color: T.textPrimary, fontSize: '14px', margin: '0 0 12px 0' }}>O.S. por Assunto (Top 10)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={categoryData} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.gridLine} />
              <XAxis type="number" tick={{ fill: T.textMuted, fontSize: 11 }} />
              <YAxis dataKey="name" type="category" width={160} tick={{ fill: T.textMuted, fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Bar dataKey="Abertas" stackId="a" fill={T.orange} />
              <Bar dataKey="Concluídas" stackId="a" fill={T.green} />
              <Bar dataKey="Canceladas" stackId="a" fill={T.red} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Alert: Top Customers with Most Open O.S. */}
      <div style={{
        backgroundColor: T.card, border: `1px solid ${T.red}40`, borderRadius: '8px', padding: '16px', marginBottom: '20px',
      }}>
        <h3 style={{ color: T.red, fontSize: '14px', margin: '0 0 4px 0' }}>
          ⚠ Alerta: Clientes com Mais O.S. Abertas
        </h3>
        <p style={{ color: T.textMuted, fontSize: '11px', margin: '0 0 12px 0' }}>
          Clientes que requerem atenção — possuem múltiplas ordens de serviço em aberto
          {subjectFilter && <span style={{ color: T.accent }}> (filtrado por: {subjectFilter})</span>}
        </p>

        {filteredTopCustomers.length === 0 ? (
          <p style={{ color: T.textMuted, fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
            Nenhum cliente com O.S. abertas {subjectFilter ? 'para este assunto' : ''}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.cardBorder}` }}>
                  <th style={{ textAlign: 'left', padding: '8px', color: T.textSecondary, fontWeight: 500 }}>Cliente</th>
                  <th style={{ textAlign: 'left', padding: '8px', color: T.textSecondary, fontWeight: 500 }}>Plano</th>
                  <th style={{ textAlign: 'center', padding: '8px', color: T.textSecondary, fontWeight: 500 }}>O.S. Abertas</th>
                  <th style={{ textAlign: 'left', padding: '8px', color: T.textSecondary, fontWeight: 500 }}>Assuntos</th>
                </tr>
              </thead>
              <tbody>
                {filteredTopCustomers.map((c, i) => (
                  <tr key={i} style={{
                    borderBottom: `1px solid ${T.cardBorder}20`,
                    backgroundColor: c.openCount >= 5 ? `${T.red}10` : c.openCount >= 3 ? `${T.orange}08` : 'transparent',
                  }}>
                    <td style={{ padding: '10px 8px', color: T.textPrimary }}>
                      <div>{c.customerName}</div>
                      {c.customerDocument && (
                        <div style={{ fontSize: '11px', color: T.textMuted }}>{c.customerDocument}</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 8px', color: T.textSecondary, fontSize: '12px' }}>
                      {c.customerPlan || '—'}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                      <AlertBadge count={c.openCount} />
                    </td>
                    <td style={{ padding: '10px 8px', color: T.textMuted, fontSize: '12px' }}>
                      {c.orders.slice(0, 3).map((o, j) => (
                        <span key={j} style={{
                          display: 'inline-block', backgroundColor: T.bg, borderRadius: '4px',
                          padding: '2px 6px', margin: '1px 4px 1px 0', fontSize: '11px',
                        }}>
                          {o.description || o.category || 'N/A'}
                        </span>
                      ))}
                      {c.orders.length > 3 && (
                        <span style={{ color: T.textMuted, fontSize: '11px' }}>+{c.orders.length - 3}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Orders Table */}
      <div style={{ backgroundColor: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: '8px', padding: '16px' }}>
        <h3 style={{ color: T.textPrimary, fontSize: '14px', margin: '0 0 4px 0' }}>
          Últimas Ordens de Serviço
        </h3>
        <p style={{ color: T.textMuted, fontSize: '11px', margin: '0 0 12px 0' }}>
          {filteredOrders.length} ordens {subjectFilter && `(filtrado: ${subjectFilter})`}
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.cardBorder}` }}>
                <th style={{ textAlign: 'left', padding: '8px', color: T.textSecondary, fontWeight: 500 }}>ID</th>
                <th style={{ textAlign: 'left', padding: '8px', color: T.textSecondary, fontWeight: 500 }}>Cliente</th>
                <th style={{ textAlign: 'left', padding: '8px', color: T.textSecondary, fontWeight: 500 }}>Assunto</th>
                <th style={{ textAlign: 'center', padding: '8px', color: T.textSecondary, fontWeight: 500 }}>Prioridade</th>
                <th style={{ textAlign: 'center', padding: '8px', color: T.textSecondary, fontWeight: 500 }}>Status</th>
                <th style={{ textAlign: 'left', padding: '8px', color: T.textSecondary, fontWeight: 500 }}>Abertura</th>
                <th style={{ textAlign: 'left', padding: '8px', color: T.textSecondary, fontWeight: 500 }}>Tempo</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: T.textMuted }}>
                    Nenhuma O.S. encontrada
                  </td>
                </tr>
              ) : (
                filteredOrders.map((o, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${T.cardBorder}15` }}>
                    <td style={{ padding: '8px', color: T.textMuted }}>#{o.externalId}</td>
                    <td style={{ padding: '8px', color: T.textPrimary }}>{o.customerName}</td>
                    <td style={{ padding: '8px', color: T.textSecondary, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.description || o.category || '—'}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <span style={{
                        color: PRIORITY_COLORS[o.priority] || T.textMuted, fontWeight: 500,
                        fontSize: '11px', textTransform: 'uppercase',
                      }}>
                        {PRIORITY_LABELS[o.priority] || o.priority}
                      </span>
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <span style={{
                        backgroundColor: `${STATUS_COLORS[o.status] || T.textMuted}20`,
                        color: STATUS_COLORS[o.status] || T.textMuted,
                        borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: 500,
                      }}>
                        {STATUS_LABELS[o.status] || o.status}
                      </span>
                    </td>
                    <td style={{ padding: '8px', color: T.textMuted }}>
                      {o.openedAt ? new Date(o.openedAt).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td style={{ padding: '8px', color: T.textMuted }}>
                      {o.resolutionTimeMinutes ? formatMinutes(o.resolutionTimeMinutes) : (o.status === 'completed' ? '—' : '...')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
