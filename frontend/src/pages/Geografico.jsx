import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';

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
};

const SectionTitle = ({ children }) => (
  <h2 style={{
    color: T.pink,
    fontSize: '1.125rem',
    fontWeight: '600',
    marginBottom: '1rem',
  }}>
    {children}
  </h2>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0];
    return (
      <div style={{
        backgroundColor: T.card,
        border: `1px solid ${T.cardBorder}`,
        borderRadius: '0.5rem',
        padding: '0.75rem',
        color: T.textPrimary,
      }}>
        <p style={{ margin: '0 0 0.25rem 0', color: T.textSecondary }}>
          {label}
        </p>
        <p style={{ margin: 0, color: data.color || T.cyan }}>
          {data.name}: {typeof data.value === 'number' && data.value > 1000
            ? data.value.toLocaleString('pt-BR')
            : data.value}
        </p>
      </div>
    );
  }
  return null;
};

const CurrencyTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0];
    return (
      <div style={{
        backgroundColor: T.card,
        border: `1px solid ${T.cardBorder}`,
        borderRadius: '0.5rem',
        padding: '0.75rem',
        color: T.textPrimary,
      }}>
        <p style={{ margin: '0 0 0.25rem 0', color: T.textSecondary }}>
          {label}
        </p>
        <p style={{ margin: 0, color: T.cyan }}>
          {data.name}: {typeof data.value === 'number'
            ? data.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
            : data.value}
        </p>
      </div>
    );
  }
  return null;
};

const KPICard = ({ title, value, subtitle, color = T.accent }) => {
  // Adapta fontSize baseado no comprimento do value (string longa = fonte menor)
  const valueStr = String(value ?? '');
  const len = valueStr.length;
  const fontSize = len <= 8 ? '1.875rem' : len <= 14 ? '1.375rem' : len <= 22 ? '1.05rem' : '0.875rem';
  return (
    <div style={{
      backgroundColor: T.card,
      border: `1px solid ${T.cardBorder}`,
      borderRadius: '0.5rem',
      padding: '1.5rem',
      minWidth: 0,
    }}>
      <p
        title={title}
        style={{
          color: T.textSecondary,
          fontSize: '0.875rem',
          margin: '0 0 0.5rem 0',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {title}
      </p>
      <p
        title={valueStr}
        style={{
          color: color,
          fontSize,
          fontWeight: '700',
          margin: '0 0 0.5rem 0',
          wordBreak: 'break-word',
          overflowWrap: 'break-word',
          lineHeight: 1.15,
        }}
      >
        {value}
      </p>
      {subtitle && (
        <p style={{
          color: T.textMuted,
          fontSize: '0.75rem',
          margin: 0,
          wordBreak: 'break-word',
        }}>
          {subtitle}
        </p>
      )}
    </div>
  );
};

const ChartCard = ({ children, title }) => (
  <div style={{
    backgroundColor: T.card,
    border: `1px solid ${T.cardBorder}`,
    borderRadius: '0.5rem',
    padding: '1.5rem',
    height: '100%',
  }}>
    {title && <SectionTitle>{title}</SectionTitle>}
    {children}
  </div>
);

const STATUS_LABEL = {
  active: { label: 'Ativo', color: '#10b981' },
  suspended: { label: 'Suspenso', color: '#f97316' },
  cancelled: { label: 'Cancelado', color: '#ef4444' },
  pending: { label: 'Pendente', color: '#eab308' },
};

const AddressSearchSection = ({ providerId }) => {
  const [city, setCity] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [street, setStreet] = useState('');
  const [status, setStatus] = useState('');
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e) => {
    e?.preventDefault?.();
    if (!providerId) return;
    if (!city.trim() && !neighborhood.trim() && !street.trim() && !status.trim()) {
      setError('Preencha ao menos um campo de filtro');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await apiService.searchCustomersByAddress(providerId, {
        city: city.trim() || undefined,
        neighborhood: neighborhood.trim() || undefined,
        street: street.trim() || undefined,
        status: status || undefined,
        limit: 500,
      });
      setResults(r.data.customers || []);
      setTotal(r.data.total || 0);
      setSearched(true);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Erro na busca');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setCity(''); setNeighborhood(''); setStreet(''); setStatus('');
    setResults([]); setTotal(0); setError(null); setSearched(false);
  };

  const inputStyle = {
    backgroundColor: T.bg,
    color: T.textPrimary,
    border: `1px solid ${T.cardBorder}`,
    borderRadius: '0.375rem',
    padding: '0.5rem 0.75rem',
    fontSize: '0.875rem',
    width: '100%',
    minWidth: 0,
  };

  return (
    <div style={{
      backgroundColor: T.card,
      border: `1px solid ${T.cardBorder}`,
      borderRadius: '0.5rem',
      padding: '1.5rem',
      marginBottom: '2rem',
    }}>
      <SectionTitle>Buscar Clientes por Endereço</SectionTitle>
      <form onSubmit={handleSearch} style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: T.textMuted, marginBottom: '0.25rem' }}>Cidade</label>
            <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="ex: Coaraci" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: T.textMuted, marginBottom: '0.25rem' }}>Bairro</label>
            <input type="text" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} placeholder="ex: Centro" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: T.textMuted, marginBottom: '0.25rem' }}>Rua / Avenida</label>
            <input type="text" value={street} onChange={(e) => setStreet(e.target.value)} placeholder="ex: Av Brasil" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: T.textMuted, marginBottom: '0.25rem' }}>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
              <option value="">Todos</option>
              <option value="active">Ativo</option>
              <option value="suspended">Suspenso</option>
              <option value="cancelled">Cancelado</option>
              <option value="pending">Pendente</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="submit" disabled={loading} style={{
            backgroundColor: T.accent, color: '#fff', border: 'none',
            borderRadius: '0.375rem', padding: '0.5rem 1.25rem',
            fontSize: '0.875rem', fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1,
          }}>
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
          <button type="button" onClick={handleClear} style={{
            backgroundColor: 'transparent', color: T.textMuted,
            border: `1px solid ${T.cardBorder}`, borderRadius: '0.375rem',
            padding: '0.5rem 1rem', fontSize: '0.875rem', cursor: 'pointer',
          }}>
            Limpar
          </button>
          {searched && !loading && (
            <span style={{ fontSize: '0.875rem', color: T.textSecondary, marginLeft: '0.5rem' }}>
              {total.toLocaleString('pt-BR')} cliente{total === 1 ? '' : 's'} encontrado{total === 1 ? '' : 's'}
              {results.length < total && ` (mostrando ${results.length})`}
            </span>
          )}
        </div>
        {error && (
          <div style={{ marginTop: '0.75rem', color: T.red, fontSize: '0.875rem' }}>{error}</div>
        )}
      </form>

      {results.length > 0 && (
        <div style={{ overflowX: 'auto', maxHeight: '500px', overflowY: 'auto', border: `1px solid ${T.cardBorder}`, borderRadius: '0.375rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead style={{ position: 'sticky', top: 0, backgroundColor: T.card, zIndex: 1 }}>
              <tr style={{ borderBottom: `1px solid ${T.gridLine}` }}>
                <th style={{ textAlign: 'left', padding: '0.6rem', color: T.textSecondary, fontWeight: 600 }}>Cliente</th>
                <th style={{ textAlign: 'left', padding: '0.6rem', color: T.textSecondary, fontWeight: 600 }}>Endereço</th>
                <th style={{ textAlign: 'left', padding: '0.6rem', color: T.textSecondary, fontWeight: 600 }}>Bairro</th>
                <th style={{ textAlign: 'left', padding: '0.6rem', color: T.textSecondary, fontWeight: 600 }}>Cidade</th>
                <th style={{ textAlign: 'left', padding: '0.6rem', color: T.textSecondary, fontWeight: 600 }}>Plano</th>
                <th style={{ textAlign: 'center', padding: '0.6rem', color: T.textSecondary, fontWeight: 600 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {results.map((c, i) => {
                const st = STATUS_LABEL[c.status] || { label: c.status, color: T.textMuted };
                return (
                  <tr key={c._id || i} style={{
                    backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(124, 58, 237, 0.05)',
                    borderBottom: `1px solid ${T.gridLine}`,
                  }}>
                    <td style={{ padding: '0.6rem', color: T.textPrimary, wordBreak: 'break-word' }}>{c.name || '—'}</td>
                    <td style={{ padding: '0.6rem', color: T.textSecondary, wordBreak: 'break-word' }}>
                      {[c.address?.street, c.address?.number].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td style={{ padding: '0.6rem', color: T.textSecondary, wordBreak: 'break-word' }}>{c.address?.neighborhood || '—'}</td>
                    <td style={{ padding: '0.6rem', color: T.textSecondary, wordBreak: 'break-word' }}>{c.address?.city || '—'}</td>
                    <td style={{ padding: '0.6rem', color: T.textSecondary, wordBreak: 'break-word' }}>
                      {c.plan?.name || '—'}
                    </td>
                    <td style={{ padding: '0.6rem', textAlign: 'center' }}>
                      <span style={{
                        backgroundColor: `${st.color}22`, color: st.color,
                        padding: '0.15rem 0.5rem', borderRadius: '0.25rem',
                        fontSize: '0.7rem', fontWeight: 600,
                      }}>
                        {st.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {searched && results.length === 0 && !loading && !error && (
        <div style={{ padding: '2rem', textAlign: 'center', color: T.textMuted }}>
          Nenhum cliente encontrado para os filtros informados.
        </div>
      )}
    </div>
  );
};

const TopNeighborhoodsTable = ({ data }) => {
  const sortedData = data.slice().sort((a, b) => b.total - a.total).slice(0, 20);

  return (
    <div style={{
      overflowY: 'auto',
      maxHeight: '400px',
      backgroundColor: T.card,
      border: `1px solid ${T.cardBorder}`,
      borderRadius: '0.5rem',
      padding: '1rem',
    }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '0.875rem',
      }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${T.gridLine}` }}>
            <th style={{
              textAlign: 'left',
              padding: '0.75rem',
              color: T.textSecondary,
              fontWeight: '600',
            }}>
              Bairro
            </th>
            <th style={{
              textAlign: 'left',
              padding: '0.75rem',
              color: T.textSecondary,
              fontWeight: '600',
            }}>
              Cidade
            </th>
            <th style={{
              textAlign: 'center',
              padding: '0.75rem',
              color: T.textSecondary,
              fontWeight: '600',
            }}>
              Total
            </th>
            <th style={{
              textAlign: 'center',
              padding: '0.75rem',
              color: T.textSecondary,
              fontWeight: '600',
            }}>
              Ativos
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row, idx) => (
            <tr
              key={`${row.neighborhood}-${idx}`}
              style={{
                backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(124, 58, 237, 0.05)',
                borderBottom: `1px solid ${T.gridLine}`,
              }}
            >
              <td style={{
                padding: '0.75rem',
                color: T.textPrimary,
              }}>
                {row.neighborhood}
              </td>
              <td style={{
                padding: '0.75rem',
                color: T.textSecondary,
              }}>
                {row.city}
              </td>
              <td style={{
                padding: '0.75rem',
                color: T.textPrimary,
                textAlign: 'center',
              }}>
                {row.total.toLocaleString('pt-BR')}
              </td>
              <td style={{
                padding: '0.75rem',
                color: T.green,
                textAlign: 'center',
              }}>
                {row.active.toLocaleString('pt-BR')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const StatusPenetrationChart = ({ data }) => {
  const chartData = data.map(item => ({
    city: item.city,
    active: item.active,
    suspended: item.suspended,
    cancelled: item.cancelled,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={chartData}
        margin={{ top: 20, right: 20, bottom: 20, left: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={T.gridLine} />
        <XAxis
          dataKey="city"
          angle={-45}
          textAnchor="end"
          height={80}
          tick={{ fill: T.textSecondary, fontSize: 12 }}
        />
        <YAxis tick={{ fill: T.textSecondary, fontSize: 12 }} />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Bar dataKey="active" stackId="a" fill={T.green} name="Ativos" />
        <Bar dataKey="suspended" stackId="a" fill={T.orange} name="Suspensos" />
        <Bar dataKey="cancelled" stackId="a" fill={T.red} name="Cancelados" />
      </BarChart>
    </ResponsiveContainer>
  );
};

export const Geografico = () => {
  const { user } = useAuth();
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [days, setDays] = useState(30);

  // Fetch providers on mount
  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const response = await apiService.getProviders();
        const list = response.data.providers || [];
        setProviders(list);
        if (list && list.length > 0) {
          setSelectedProvider(list[0]._id);
        }
      } catch (err) {
        console.error('Error fetching providers:', err);
        setError('Erro ao carregar provedoras');
      } finally {
        setLoading(false);
      }
    };

    fetchProviders();
  }, []);

  // Fetch geographic metrics when provider changes
  useEffect(() => {
    if (!selectedProvider) return;

    const fetchMetrics = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiService.getGeographicMetrics(selectedProvider);
        setMetrics(response.data.metrics);
      } catch (err) {
        console.error('Error fetching geographic metrics:', err);
        setError('Erro ao carregar métricas geográficas');
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, [selectedProvider]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const response = await apiService.getGeographicMetrics(selectedProvider);
      setMetrics(response.data.metrics);
    } catch (err) {
      console.error('Error syncing:', err);
      setError('Erro ao sincronizar dados');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        backgroundColor: T.bg,
        color: T.textPrimary,
        padding: '2rem',
        minHeight: '100vh',
      }}>
        <p>Carregando...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        backgroundColor: T.bg,
        color: T.red,
        padding: '2rem',
        minHeight: '100vh',
      }}>
        <p>{error}</p>
      </div>
    );
  }

  const byCity = metrics?.byCity || [];
  const byNeighborhood = metrics?.byNeighborhood || [];
  const activationsByCity = metrics?.activationsByCity || [];
  const statusByCity = metrics?.statusByCity || [];
  const revenueByCity = metrics?.revenueByCity || [];

  // Calculate KPI values
  const totalCidades = byCity.length;
  const topCity = byCity.length > 0 ? byCity.reduce((a, b) => a.total > b.total ? a : b) : null;
  const topTicket = revenueByCity.length > 0
    ? revenueByCity.reduce((a, b) => a.avgTicket > b.avgTicket ? a : b)
    : null;
  const totalBairros = byNeighborhood.length;
  const topActivations = activationsByCity.length > 0
    ? activationsByCity.reduce((a, b) => a.activations > b.activations ? a : b)
    : null;

  // Prepare chart data
  const clientesByCityChart = byCity
    .slice()
    .sort((a, b) => b.total - a.total)
    .map(item => ({
      city: item.city,
      clientes: item.total,
    }));

  const receivingCityData = byCity
    .slice()
    .sort((a, b) => b.active - a.active)
    .map(item => ({
      city: item.city,
      ativos: item.active,
      suspended: item.suspended,
      cancelled: item.cancelled,
    }));

  const revenueChartData = revenueByCity
    .slice()
    .sort((a, b) => b.revenue - a.revenue)
    .map(item => ({
      city: item.city,
      receita: item.revenue,
    }));

  const avgTicketData = revenueByCity
    .slice()
    .sort((a, b) => b.avgTicket - a.avgTicket)
    .map(item => ({
      city: item.city,
      ticket: item.avgTicket,
    }));

  const activationsData = activationsByCity
    .slice()
    .sort((a, b) => b.activations - a.activations)
    .map(item => ({
      city: item.city,
      ativacoes: item.activations,
    }));

  return (
    <div style={{
      backgroundColor: T.bg,
      color: T.textPrimary,
      padding: '2rem',
      minHeight: '100vh',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <div>
          <h1 style={{
            fontSize: '2rem',
            fontWeight: '700',
            margin: '0 0 0.5rem 0',
            color: T.textPrimary,
          }}>
            Geográfico — Análise Territorial
          </h1>
          <p style={{
            color: T.textSecondary,
            fontSize: '0.875rem',
            margin: 0,
          }}>
            Últimos {days} dias
          </p>
        </div>

        <div style={{
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
        }}>
          <select
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
            style={{
              backgroundColor: T.card,
              color: T.textPrimary,
              border: `1px solid ${T.cardBorder}`,
              borderRadius: '0.375rem',
              padding: '0.5rem 1rem',
              cursor: 'pointer',
            }}
          >
            {providers.map(provider => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>

          <button
            onClick={handleSync}
            disabled={syncing}
            style={{
              backgroundColor: T.accent,
              color: T.textPrimary,
              border: 'none',
              borderRadius: '0.375rem',
              padding: '0.5rem 1rem',
              cursor: syncing ? 'not-allowed' : 'pointer',
              opacity: syncing ? 0.6 : 1,
              fontSize: '0.875rem',
              fontWeight: '600',
            }}
          >
            {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem',
      }}>
        <KPICard
          title="Total de Cidades"
          value={totalCidades}
          color={T.cyan}
        />
        {topCity && (
          <KPICard
            title="Cidade #1"
            value={topCity.city}
            subtitle={`${topCity.total.toLocaleString('pt-BR')} clientes`}
            color={T.gold}
          />
        )}
        {topTicket && (
          <KPICard
            title="Maior Ticket Médio"
            value={topTicket.city}
            subtitle={topTicket.avgTicket.toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            })}
            color={T.pink}
          />
        )}
        <KPICard
          title="Total de Bairros Atendidos"
          value={totalBairros}
          color={T.green}
        />
        {topActivations && (
          <KPICard
            title="Ativações do Mês (Top Cidade)"
            value={topActivations.city}
            subtitle={`${topActivations.activations.toLocaleString('pt-BR')} ativações`}
            color={T.orange}
          />
        )}
      </div>

      {/* Address Search Section */}
      <AddressSearchSection providerId={selectedProvider} />

      {/* Row 2 - Charts */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(12, 1fr)',
        gap: '1rem',
        marginBottom: '2rem',
      }}>
        {/* Clientes por Cidade */}
        <div style={{ gridColumn: 'span 5' }}>
          <ChartCard title="Clientes por Cidade">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={clientesByCityChart}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={T.gridLine} />
                <XAxis type="number" tick={{ fill: T.textSecondary, fontSize: 12 }} />
                <YAxis dataKey="city" type="category" tick={{ fill: T.textSecondary, fontSize: 12 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="clientes" fill={T.gold} label={{ position: 'right', fill: T.textPrimary }} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Receita por Cidade */}
        <div style={{ gridColumn: 'span 4' }}>
          <ChartCard title="Receita por Cidade">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={revenueChartData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={T.gridLine} />
                <XAxis type="number" tick={{ fill: T.textSecondary, fontSize: 12 }} />
                <YAxis dataKey="city" type="category" tick={{ fill: T.textSecondary, fontSize: 12 }} />
                <Tooltip content={<CurrencyTooltip />} />
                <Bar dataKey="receita" fill={T.cyan} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Penetração por Status */}
        <div style={{ gridColumn: 'span 3' }}>
          <ChartCard title="Penetração por Status">
            <div style={{ overflowX: 'auto' }}>
              <ResponsiveContainer width={300} height={300}>
                <BarChart
                  data={receivingCityData.slice(0, 5)}
                  margin={{ top: 20, right: 10, bottom: 60, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={T.gridLine} />
                  <XAxis
                    dataKey="city"
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    tick={{ fill: T.textSecondary, fontSize: 10 }}
                  />
                  <YAxis tick={{ fill: T.textSecondary, fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="ativos" stackId="a" fill={T.green} />
                  <Bar dataKey="suspended" stackId="a" fill={T.orange} />
                  <Bar dataKey="cancelled" stackId="a" fill={T.red} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      </div>

      {/* Row 3 - Top Neighborhoods and Avg Ticket */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(12, 1fr)',
        gap: '1rem',
        marginBottom: '2rem',
      }}>
        {/* Top Neighborhoods Table */}
        <div style={{ gridColumn: 'span 8' }}>
          <ChartCard title="Top Bairros">
            <TopNeighborhoodsTable data={byNeighborhood} />
          </ChartCard>
        </div>

        {/* Avg Ticket per City */}
        <div style={{ gridColumn: 'span 4' }}>
          <ChartCard title="Ticket Médio por Cidade">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={avgTicketData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={T.gridLine} />
                <XAxis type="number" tick={{ fill: T.textSecondary, fontSize: 12 }} />
                <YAxis dataKey="city" type="category" tick={{ fill: T.textSecondary, fontSize: 12 }} />
                <Tooltip content={<CurrencyTooltip />} />
                <Bar dataKey="ticket" fill={T.pink} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>

      {/* Bottom - Activations Chart */}
      <div>
        <ChartCard title="Ativações do Mês por Cidade">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={activationsData}
              margin={{ top: 20, right: 30, bottom: 60, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={T.gridLine} />
              <XAxis
                dataKey="city"
                angle={-45}
                textAnchor="end"
                height={80}
                tick={{ fill: T.textSecondary, fontSize: 12 }}
              />
              <YAxis tick={{ fill: T.textSecondary, fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="ativacoes" fill={T.orange} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
};

export default Geografico;
