import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';

const T = {
  bg: '#0f0a1e', card: '#1a1232', cardBorder: '#2d2152', accent: '#7c3aed',
  cyan: '#06d6a0', gold: '#f5a623', pink: '#e74fc4', orange: '#f97316',
  red: '#ef4444', green: '#10b981', blue: '#3b82f6', textPrimary: '#f1f5f9',
  textSecondary: '#a78bfa', textMuted: '#7c6fa0', gridLine: '#1e1640',
};

// Custom Tooltip Component
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        backgroundColor: T.card,
        border: `1px solid ${T.cardBorder}`,
        borderRadius: '6px',
        padding: '8px 12px',
        color: T.textPrimary,
      }}>
        <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: T.textSecondary }}>
          {label}
        </p>
        {payload.map((entry, index) => (
          <p key={index} style={{ margin: '2px 0', fontSize: '12px', color: entry.color }}>
            {entry.name}: {entry.value.toLocaleString('pt-BR')}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// KPI Card Component
const KPICard = ({ title, value, unit, highlight = false }) => (
  <div style={{
    backgroundColor: T.card,
    border: `1px solid ${T.cardBorder}`,
    borderRadius: '8px',
    padding: '16px',
    flex: 1,
    minWidth: '150px',
  }}>
    <p style={{
      fontSize: '12px',
      color: T.textMuted,
      margin: '0 0 8px 0',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
    }}>
      {title}
    </p>
    <p style={{
      fontSize: '24px',
      fontWeight: 'bold',
      color: highlight ? T.pink : T.textPrimary,
      margin: '0',
    }}>
      {value}
    </p>
    {unit && (
      <p style={{
        fontSize: '12px',
        color: T.textSecondary,
        margin: '4px 0 0 0',
      }}>
        {unit}
      </p>
    )}
  </div>
);

// Speed Color Mapping
const speedColors = {
  '1Mbps': '#ff6b6b',
  '2Mbps': '#ffa94d',
  '5Mbps': '#ffd43b',
  '10Mbps': '#a6e34d',
  '25Mbps': '#51cf66',
  '50Mbps': '#15aabf',
  '100Mbps': '#0099ff',
  '200Mbps': '#7c3aed',
  '500Mbps': '#e74fc4',
  '1Gbps': '#06d6a0',
};

export const Planos = () => {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState('');

  useEffect(() => {
    apiService.getProviders().then(res => {
      const list = res.data.providers || [];
      if (list.length > 0) setSelectedProvider(list[0]._id);
    }).catch(err => console.error('Erro ao carregar provedores:', err));
  }, []);

  useEffect(() => {
    if (!selectedProvider) return;
    fetchMetrics();
  }, [selectedProvider]);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const response = await apiService.getPlanMetrics(selectedProvider);
      setMetrics(response.data.metrics);
    } catch (error) {
      console.error('Erro ao buscar métricas de planos:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!metrics && !loading) {
    return (
      <div style={{
        padding: '24px',
        backgroundColor: T.bg,
        color: T.textPrimary,
      }}>
        Selecione um provedor para visualizar dados
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{
        padding: '24px',
        backgroundColor: T.bg,
        color: T.textPrimary,
      }}>
        Carregando dados de planos...
      </div>
    );
  }

  // Calculate insights
  const topSoldPlan = metrics.planOverview?.reduce((max, p) => p.total > max.total ? p : max);
  const highestMarginPlan = metrics.planOverview?.reduce((max, p) => p.avgPrice > max.avgPrice ? p : max);
  const highestRiskPlan = metrics.planOverview?.reduce((max, p) => p.churnRate > max.churnRate ? p : max);

  // Prepare data for charts
  const topPlansData = metrics.topPlansByRevenue || [];
  const speedDistData = metrics.speedDistribution || [];
  const priceRangeData = metrics.planPriceRanges || [];
  const planTableData = metrics.planOverview || [];

  // Prepare comparison data (top 5 plans)
  const comparisonData = planTableData.slice(0, 5).map(p => ({
    plan: p.plan,
    Vendas: p.total,
    'Receita (R$ mil)': p.totalRevenue / 1000,
  }));

  // Calculate total row
  const totalRow = {
    plan: 'Total',
    active: planTableData.reduce((sum, p) => sum + p.active, 0),
    cancelled: planTableData.reduce((sum, p) => sum + p.cancelled, 0),
    suspended: planTableData.reduce((sum, p) => sum + p.suspended, 0),
    avgPrice: planTableData.reduce((sum, p) => sum + p.avgPrice, 0) / planTableData.length,
    totalRevenue: planTableData.reduce((sum, p) => sum + p.totalRevenue, 0),
    churnRate: (planTableData.reduce((sum, p) => sum + p.churnRate, 0) / planTableData.length),
  };

  return (
    <div style={{
      backgroundColor: T.bg,
      color: T.textPrimary,
      minHeight: '100vh',
      padding: '24px',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '32px',
        gap: '16px',
        flexWrap: 'wrap',
      }}>
        <h1 style={{
          fontSize: '32px',
          fontWeight: 'bold',
          margin: '0',
          color: T.textPrimary,
        }}>
          Planos — Portfólio de Produtos
        </h1>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
            style={{
              backgroundColor: T.card,
              color: T.textPrimary,
              border: `1px solid ${T.cardBorder}`,
              borderRadius: '6px',
              padding: '8px 12px',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            <option value="">Selecionar Provedor</option>
            {/* Provider options should be populated from context */}
          </select>
          <button
            onClick={fetchMetrics}
            style={{
              backgroundColor: T.accent,
              color: T.textPrimary,
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '14px',
              cursor: 'pointer',
              fontWeight: '500',
            }}
          >
            Sincronizar
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '16px',
        marginBottom: '32px',
      }}>
        <KPICard
          title="Planos Únicos"
          value={metrics.uniquePlans}
          unit="planos"
        />
        <KPICard
          title="MRR Total"
          value={metrics.totalMRR.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          unit="receita mensal"
        />
        <KPICard
          title="ARPU Médio"
          value={metrics.avgARPU.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          unit="por cliente"
        />
        <KPICard
          title="Plano Mais Vendido"
          value={topSoldPlan?.plan || '-'}
          unit={`${topSoldPlan?.total || 0} clientes`}
          highlight
        />
        <KPICard
          title="Plano Mais Lucrativo"
          value={highestMarginPlan?.plan || '-'}
          unit={highestMarginPlan?.totalRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || 'R$ 0'}
          highlight
        />
      </div>

      {/* Row 2: Charts */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(12, 1fr)',
        gap: '16px',
        marginBottom: '32px',
      }}>
        {/* Top Plans by Revenue */}
        <div style={{
          gridColumn: 'span 5',
          backgroundColor: T.card,
          border: `1px solid ${T.cardBorder}`,
          borderRadius: '8px',
          padding: '20px',
        }}>
          <h3 style={{
            color: T.pink,
            fontSize: '16px',
            fontWeight: '600',
            margin: '0 0 20px 0',
          }}>
            Top Planos por Receita
          </h3>
          {topPlansData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topPlansData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={T.gridLine} />
                <XAxis type="number" stroke={T.textMuted} />
                <YAxis dataKey="plan" type="category" stroke={T.textMuted} width={100} />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="revenue"
                  fill={T.gold}
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ color: T.textMuted, textAlign: 'center' }}>Sem dados disponíveis</p>
          )}
        </div>

        {/* Speed Distribution */}
        <div style={{
          gridColumn: 'span 4',
          backgroundColor: T.card,
          border: `1px solid ${T.cardBorder}`,
          borderRadius: '8px',
          padding: '20px',
        }}>
          <h3 style={{
            color: T.pink,
            fontSize: '16px',
            fontWeight: '600',
            margin: '0 0 20px 0',
          }}>
            Distribuição por Velocidade
          </h3>
          {speedDistData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={speedDistData}
                  dataKey="count"
                  nameKey="speed"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ speed, count }) => `${speed}: ${count}`}
                >
                  {speedDistData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={speedColors[entry.speed] || T.accent}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ color: T.textMuted, textAlign: 'center' }}>Sem dados disponíveis</p>
          )}
        </div>

        {/* Price Range Distribution */}
        <div style={{
          gridColumn: 'span 3',
          backgroundColor: T.card,
          border: `1px solid ${T.cardBorder}`,
          borderRadius: '8px',
          padding: '20px',
        }}>
          <h3 style={{
            color: T.pink,
            fontSize: '16px',
            fontWeight: '600',
            margin: '0 0 20px 0',
          }}>
            Faixa de Preço
          </h3>
          {priceRangeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={priceRangeData}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.gridLine} />
                <XAxis
                  dataKey="_id"
                  stroke={T.textMuted}
                  tick={{ fontSize: 12 }}
                />
                <YAxis stroke={T.textMuted} />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="count"
                  fill={T.cyan}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ color: T.textMuted, textAlign: 'center' }}>Sem dados disponíveis</p>
          )}
        </div>
      </div>

      {/* Row 3: Complete Analysis Table */}
      <div style={{
        backgroundColor: T.card,
        border: `1px solid ${T.cardBorder}`,
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '32px',
      }}>
        <h3 style={{
          color: T.pink,
          fontSize: '16px',
          fontWeight: '600',
          margin: '0 0 20px 0',
        }}>
          Análise Completa de Planos
        </h3>
        <div style={{
          overflowX: 'auto',
          borderRadius: '6px',
        }} className="custom-scrollbar">
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            minWidth: '800px',
          }}>
            <thead>
              <tr style={{
                backgroundColor: T.bg,
                borderBottom: `1px solid ${T.cardBorder}`,
              }}>
                <th style={{
                  padding: '12px',
                  textAlign: 'left',
                  color: T.textSecondary,
                  fontSize: '12px',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>Plano</th>
                <th style={{
                  padding: '12px',
                  textAlign: 'center',
                  color: T.textSecondary,
                  fontSize: '12px',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>Ativos</th>
                <th style={{
                  padding: '12px',
                  textAlign: 'center',
                  color: T.textSecondary,
                  fontSize: '12px',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>Cancelados</th>
                <th style={{
                  padding: '12px',
                  textAlign: 'center',
                  color: T.textSecondary,
                  fontSize: '12px',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>Suspensos</th>
                <th style={{
                  padding: '12px',
                  textAlign: 'right',
                  color: T.textSecondary,
                  fontSize: '12px',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>Preço Médio (R$)</th>
                <th style={{
                  padding: '12px',
                  textAlign: 'right',
                  color: T.textSecondary,
                  fontSize: '12px',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>Receita (R$)</th>
                <th style={{
                  padding: '12px',
                  textAlign: 'center',
                  color: T.textSecondary,
                  fontSize: '12px',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>% Churn</th>
              </tr>
            </thead>
            <tbody>
              {planTableData.map((plan, index) => (
                <tr
                  key={index}
                  style={{
                    borderBottom: `1px solid ${T.gridLine}`,
                    backgroundColor: plan.churnRate > 10 ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                  }}
                >
                  <td style={{
                    padding: '12px',
                    color: T.textPrimary,
                    fontWeight: '500',
                  }}>
                    {plan.plan}
                  </td>
                  <td style={{
                    padding: '12px',
                    textAlign: 'center',
                    color: T.textPrimary,
                  }}>
                    {plan.active}
                  </td>
                  <td style={{
                    padding: '12px',
                    textAlign: 'center',
                    color: T.textPrimary,
                  }}>
                    {plan.cancelled}
                  </td>
                  <td style={{
                    padding: '12px',
                    textAlign: 'center',
                    color: T.textPrimary,
                  }}>
                    {plan.suspended}
                  </td>
                  <td style={{
                    padding: '12px',
                    textAlign: 'right',
                    color: T.textPrimary,
                  }}>
                    {plan.avgPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td style={{
                    padding: '12px',
                    textAlign: 'right',
                    color: T.textPrimary,
                  }}>
                    {plan.totalRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td style={{
                    padding: '12px',
                    textAlign: 'center',
                    color: plan.churnRate > 10 ? T.red : T.green,
                    fontWeight: '500',
                  }}>
                    {plan.churnRate.toFixed(1)}%
                  </td>
                </tr>
              ))}
              {/* Total Row */}
              <tr style={{
                borderTop: `2px solid ${T.cardBorder}`,
                backgroundColor: T.bg,
                fontWeight: 'bold',
              }}>
                <td style={{
                  padding: '12px',
                  color: T.pink,
                }}>
                  {totalRow.plan}
                </td>
                <td style={{
                  padding: '12px',
                  textAlign: 'center',
                  color: T.textPrimary,
                }}>
                  {totalRow.active}
                </td>
                <td style={{
                  padding: '12px',
                  textAlign: 'center',
                  color: T.textPrimary,
                }}>
                  {totalRow.cancelled}
                </td>
                <td style={{
                  padding: '12px',
                  textAlign: 'center',
                  color: T.textPrimary,
                }}>
                  {totalRow.suspended}
                </td>
                <td style={{
                  padding: '12px',
                  textAlign: 'right',
                  color: T.textPrimary,
                }}>
                  {totalRow.avgPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </td>
                <td style={{
                  padding: '12px',
                  textAlign: 'right',
                  color: T.pink,
                }}>
                  {totalRow.totalRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </td>
                <td style={{
                  padding: '12px',
                  textAlign: 'center',
                  color: T.textPrimary,
                }}>
                  {totalRow.churnRate.toFixed(1)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Row 4: Bottom Charts and Insights */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
        gap: '16px',
      }}>
        {/* Comparison Chart */}
        <div style={{
          backgroundColor: T.card,
          border: `1px solid ${T.cardBorder}`,
          borderRadius: '8px',
          padding: '20px',
        }}>
          <h3 style={{
            color: T.pink,
            fontSize: '16px',
            fontWeight: '600',
            margin: '0 0 20px 0',
          }}>
            Planos Mais Vendidos vs Mais Lucrativos
          </h3>
          {comparisonData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={comparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.gridLine} />
                <XAxis dataKey="plan" stroke={T.textMuted} angle={-45} textAnchor="end" height={80} />
                <YAxis stroke={T.textMuted} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="Vendas" fill={T.blue} />
                <Bar dataKey="Receita (R$ mil)" fill={T.gold} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ color: T.textMuted, textAlign: 'center' }}>Sem dados disponíveis</p>
          )}
        </div>

        {/* Insights Card */}
        <div style={{
          backgroundColor: T.card,
          border: `1px solid ${T.cardBorder}`,
          borderRadius: '8px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}>
          <h3 style={{
            color: T.pink,
            fontSize: '16px',
            fontWeight: '600',
            margin: '0 0 20px 0',
          }}>
            Insights Estratégicos
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <p style={{
                fontSize: '12px',
                color: T.textMuted,
                margin: '0 0 4px 0',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                Plano Âncora (Mais Vendido)
              </p>
              <p style={{
                fontSize: '18px',
                fontWeight: 'bold',
                color: T.cyan,
                margin: '0',
              }}>
                {topSoldPlan?.plan || '-'}
              </p>
              <p style={{
                fontSize: '12px',
                color: T.textSecondary,
                margin: '4px 0 0 0',
              }}>
                {topSoldPlan?.total || 0} clientes ativos
              </p>
            </div>

            <div style={{
              borderTop: `1px solid ${T.cardBorder}`,
              paddingTop: '16px',
            }}>
              <p style={{
                fontSize: '12px',
                color: T.textMuted,
                margin: '0 0 4px 0',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                Maior Margem
              </p>
              <p style={{
                fontSize: '18px',
                fontWeight: 'bold',
                color: T.gold,
                margin: '0',
              }}>
                {highestMarginPlan?.plan || '-'}
              </p>
              <p style={{
                fontSize: '12px',
                color: T.textSecondary,
                margin: '4px 0 0 0',
              }}>
                {highestMarginPlan?.avgPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || 'R$ 0'} / mês
              </p>
            </div>

            <div style={{
              borderTop: `1px solid ${T.cardBorder}`,
              paddingTop: '16px',
            }}>
              <p style={{
                fontSize: '12px',
                color: T.textMuted,
                margin: '0 0 4px 0',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                Maior Risco (Churn)
              </p>
              <p style={{
                fontSize: '18px',
                fontWeight: 'bold',
                color: highestRiskPlan?.churnRate > 10 ? T.red : T.orange,
                margin: '0',
              }}>
                {highestRiskPlan?.plan || '-'}
              </p>
              <p style={{
                fontSize: '12px',
                color: T.textSecondary,
                margin: '4px 0 0 0',
              }}>
                {highestRiskPlan?.churnRate.toFixed(1) || 0}% de churn
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Planos;
