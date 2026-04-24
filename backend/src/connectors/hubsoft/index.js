import axios from 'axios';
import logger from '../../utils/logger.js';
import { Customer, Invoice, ServiceOrder } from '../../models/index.js';

const HUBSOFT_SYNC_CONFIG = {
  maxRetries: 3,
  retryDelay: 2000,
  timeout: 60000,         // 60s for large paginated responses
  perPage: 500,           // max allowed by HubSoft "Todos" endpoints
  delayBetweenPages: 500, // 500ms between paginated requests to reduce load
  delayBetweenBatches: 300 // 300ms between invoice batches
};

// ─── Throttle helper ───────────────────────────────────────────────
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ─── Auth ──────────────────────────────────────────────────────────

async function getAccessToken(baseUrl, clientId, clientSecret, username, password) {
  try {
    const response = await axios.post(
      `${baseUrl}/oauth/token`,
      `grant_type=password&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
      {
        timeout: HUBSOFT_SYNC_CONFIG.timeout,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );
    if (!response.data.access_token) throw new Error('No access token in response');
    return response.data.access_token;
  } catch (error) {
    logger.error('Failed to get HubSoft access token', { error: error.message });
    throw error;
  }
}

function createHubSoftClient(baseUrl, accessToken) {
  return axios.create({
    baseURL: baseUrl,
    timeout: HUBSOFT_SYNC_CONFIG.timeout,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
}

// ─── Request with retry ────────────────────────────────────────────

async function makeRequest(client, endpoint, params = {}, retries = 0) {
  try {
    const response = await client.get(endpoint, { params });
    return response.data;
  } catch (error) {
    if (retries < HUBSOFT_SYNC_CONFIG.maxRetries &&
        (error.code === 'ECONNABORTED' || error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET' ||
         error.response?.status === 429 || error.response?.status >= 500)) {
      const delay = HUBSOFT_SYNC_CONFIG.retryDelay * (retries + 1); // exponential backoff
      logger.warn(`HubSoft request failed, retrying in ${delay}ms (attempt ${retries + 1})`, { endpoint, error: error.message });
      await sleep(delay);
      return makeRequest(client, endpoint, params, retries + 1);
    }
    throw error;
  }
}

// ─── Generic paginated "Todos" fetcher ─────────────────────────────
// Works for /cliente/todos, /atendimento/todos, /ordem_servico/todos
// All share the same pagination structure: { paginacao: { primeira_pagina, ultima_pagina, total_registros }, <key>: [...] }

async function fetchAllPaginated(client, endpoint, dataKey, extraParams = {}) {
  const allRecords = [];
  let page = 0;
  let lastPage = 0;
  let totalRegistros = 0;

  do {
    const params = {
      pagina: page,
      itens_por_pagina: HUBSOFT_SYNC_CONFIG.perPage,
      ...extraParams
    };

    const response = await makeRequest(client, endpoint, params);

    if (!response || response.status === 'error') {
      logger.warn(`HubSoft ${endpoint} returned error`, { msg: response?.msg, page });
      break;
    }

    // Extract pagination
    const paginacao = response.paginacao;
    if (paginacao) {
      lastPage = paginacao.ultima_pagina || 0;
      totalRegistros = paginacao.total_registros || 0;
    }

    // Extract records using the expected key, fallback to auto-detect
    let records = [];
    if (dataKey && Array.isArray(response[dataKey])) {
      records = response[dataKey];
    } else {
      // Auto-detect first array key (skip status/msg/paginacao)
      for (const key of Object.keys(response)) {
        if (['status', 'msg', 'paginacao'].includes(key)) continue;
        if (Array.isArray(response[key])) { records = response[key]; break; }
      }
    }

    if (records.length === 0) break;
    allRecords.push(...records);

    logger.info(`HubSoft ${endpoint} page ${page}/${lastPage}`, {
      fetched: records.length,
      accumulated: allRecords.length,
      total: totalRegistros
    });

    page++;

    // Throttle between pages to reduce load on HubSoft
    if (page <= lastPage) {
      await sleep(HUBSOFT_SYNC_CONFIG.delayBetweenPages);
    }
  } while (page <= lastPage);

  logger.info(`HubSoft ${endpoint}: fetched ${allRecords.length} records total (API reported ${totalRegistros})`);
  return allRecords;
}

// ─── Date parser for HubSoft DD/MM/YYYY format ───────────────────
function parseHubSoftDate(dateStr) {
  if (!dateStr) return null;
  // Handle DD/MM/YYYY format from HubSoft
  const parts = String(dateStr).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (parts) {
    return new Date(`${parts[3]}-${parts[2]}-${parts[1]}T00:00:00.000Z`);
  }
  // Fallback: try native Date parsing (handles ISO, YYYY-MM-DD, etc.)
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

// ─── Sync Customers ────────────────────────────────────────────────
// Uses /api/v1/integracao/cliente/todos — paginated, up to 500/page
// Fetches WITH cancelado=sim to include ALL customers (active + cancelled)
// This gives us ~4800+ records instead of ~2800 without cancelled

async function syncCustomers(provider, client) {
  logger.info('Starting HubSoft customer sync (cliente/todos with cancelado=sim)', { providerId: provider._id });

  try {
    const customers = await fetchAllPaginated(
      client,
      '/api/v1/integracao/cliente/todos',
      'clientes',
      { cancelado: 'sim' } // Include cancelled service customers
    );

    const operations = customers
      .filter(customer => customer.id_cliente || customer.codigo_cliente)
      .map(customer => {
        const extId = (customer.id_cliente || customer.codigo_cliente)?.toString();
        const servicos = customer.servicos || [];

        // Prefer active/suspended service, fallback to most recent cancelled
        const activeService = servicos.find(s =>
          s.status_prefixo === 'servico_habilitado' || (s.status && String(s.status).toLowerCase().includes('habilitado'))
        ) || servicos.find(s =>
          s.status_prefixo && s.status_prefixo.includes('suspenso')
        ) || servicos[0];

        const planName = activeService?.nome || '';
        const planPrice = parseFloat(activeService?.valor || 0);
        const dlSpeed = parseFloat(String(activeService?.velocidade_download || '0').replace(/[^\d.]/g, ''));
        const ulSpeed = parseFloat(String(activeService?.velocidade_upload || '0').replace(/[^\d.]/g, ''));

        // Determine status — check all services to find the "best" one
        let status = 'active';
        const hasActiveService = servicos.some(s => s.status_prefixo === 'servico_habilitado');
        const hasSuspendedService = servicos.some(s => s.status_prefixo && s.status_prefixo.includes('suspenso'));
        const allCancelled = servicos.length > 0 && servicos.every(s => s.status_prefixo && s.status_prefixo.includes('cancelado'));

        if (hasActiveService) {
          status = 'active';
        } else if (hasSuspendedService) {
          status = 'suspended';
        } else if (allCancelled || customer.ativo === false) {
          status = 'cancelled';
        }

        // Activation date from the service
        const activationDate = parseHubSoftDate(activeService?.data_habilitacao);

        // Cancellation data: find the most recent cancelled service
        let cancellationDate = null;
        let cancellationReason = null;
        if (status === 'cancelled') {
          // Find service with most recent cancellation date
          const cancelledServices = servicos
            .filter(s => s.data_cancelamento)
            .sort((a, b) => {
              const da = parseHubSoftDate(a.data_cancelamento);
              const db = parseHubSoftDate(b.data_cancelamento);
              return (db?.getTime() || 0) - (da?.getTime() || 0);
            });

          if (cancelledServices.length > 0) {
            cancellationDate = parseHubSoftDate(cancelledServices[0].data_cancelamento);
            cancellationReason = cancelledServices[0].motivo_cancelamento || null;
          }
        }

        // Address from service's endereco_fiscal or customer-level fields
        const addr = activeService?.endereco_fiscal || {};

        return {
          updateOne: {
            filter: { providerId: provider._id, externalId: extId },
            update: {
              $set: {
                providerId: provider._id,
                externalId: extId,
                name: customer.nome_razaosocial || customer.nome_fantasia || 'Unknown',
                document: customer.cpf_cnpj || null,
                email: customer.email_principal || customer.email_secundario || null,
                phone: customer.telefone_primario || customer.telefone_secundario || null,
                plan: {
                  name: planName,
                  price: planPrice,
                  downloadSpeed: dlSpeed,
                  uploadSpeed: ulSpeed
                },
                status,
                activationDate,
                cancellationDate,
                cancellationReason,
                address: {
                  street: addr.endereco || customer.endereco || customer.logradouro || null,
                  number: addr.numero || customer.numero || null,
                  city: addr.cidade || customer.cidade || null,
                  neighborhood: addr.bairro || customer.bairro || null,
                  cep: addr.cep || customer.cep || null
                },
                source: 'hubsoft',
                syncedAt: new Date()
              }
            },
            upsert: true
          }
        };
      });

    if (operations.length === 0) {
      logger.info('No customers found for sync', { providerId: provider._id });
      return 0;
    }

    // Bulk write in batches
    let totalSynced = 0;
    const batchSize = 500;
    for (let i = 0; i < operations.length; i += batchSize) {
      const batch = operations.slice(i, i + batchSize);
      const result = await Customer.bulkWrite(batch, { ordered: false });
      totalSynced += (result.upsertedCount || 0) + (result.modifiedCount || 0);
    }

    // Log status distribution for verification
    const statusCounts = {};
    operations.forEach(op => {
      const s = op.updateOne.update.$set.status;
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    });

    logger.info('HubSoft customer sync completed', {
      providerId: provider._id,
      synced: totalSynced,
      total: customers.length,
      statusDistribution: statusCounts
    });

    return totalSynced;
  } catch (error) {
    logger.error('HubSoft customer sync failed', {
      providerId: provider._id,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// ─── Sync Invoices ─────────────────────────────────────────────────
// Uses per-customer fetching with throttling to limit HubSoft load.
// Processes customers in small concurrent batches with delays.

async function syncInvoices(provider, client) {
  logger.info('Starting HubSoft invoice sync (throttled)', { providerId: provider._id });

  try {
    const customers = await Customer.find({ providerId: provider._id }).lean();
    const customerMap = new Map(customers.map(c => [c.externalId, c._id]));

    const allInvoices = [];
    const concurrency = 3; // max 3 concurrent requests

    // Process in batches of `concurrency`
    for (let i = 0; i < customers.length; i += concurrency) {
      const batch = customers.slice(i, i + concurrency);

      const batchResults = await Promise.allSettled(
        batch.map(async (customer) => {
          try {
            const response = await makeRequest(client, '/api/v1/integracao/financeiro', {
              busca: 'id_cliente',
              termo_busca: customer.externalId
            });
            const records = Array.isArray(response?.faturas) ? response.faturas :
                            Array.isArray(response?.data) ? response.data : [];
            for (const inv of records) {
              inv._customerExternalId = customer.externalId;
            }
            return records;
          } catch (error) {
            logger.warn(`Failed to fetch invoices for customer ${customer.externalId}`, { error: error.message });
            return [];
          }
        })
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value.length > 0) {
          allInvoices.push(...result.value);
        }
      }

      // Throttle between batches
      if (i + concurrency < customers.length) {
        await sleep(HUBSOFT_SYNC_CONFIG.delayBetweenBatches);
      }

      // Log progress every 100 customers
      if ((i + concurrency) % 100 < concurrency) {
        logger.info(`HubSoft invoice sync progress: ${Math.min(i + concurrency, customers.length)}/${customers.length} customers, ${allInvoices.length} invoices`);
      }
    }

    logger.info(`HubSoft fetched ${allInvoices.length} invoices from ${customers.length} customers`);

    const operations = allInvoices
      .filter(invoice => (invoice.id_fatura || invoice.id))
      .map(invoice => {
        const extId = (invoice.id_fatura || invoice.id)?.toString();
        const clienteId = (invoice.id_cliente || invoice._customerExternalId)?.toString();
        return {
          updateOne: {
            filter: { providerId: provider._id, externalId: extId },
            update: {
              $set: {
                providerId: provider._id,
                customerId: customerMap.get(clienteId) || null,
                externalId: extId,
                amount: parseFloat(invoice.valor || invoice.valor_total || 0),
                paidAmount: parseFloat(invoice.valor_pago || 0),
                dueDate: new Date(invoice.data_vencimento || invoice.vencimento),
                paymentDate: invoice.data_pagamento ? new Date(invoice.data_pagamento) : null,
                status: mapInvoiceStatus(invoice.status || invoice.situacao || invoice.status_prefixo),
                source: 'hubsoft',
                syncedAt: new Date()
              }
            },
            upsert: true
          }
        };
      });

    if (operations.length === 0) {
      logger.info('No invoices found for sync', { providerId: provider._id });
      return 0;
    }

    // Bulk write in batches
    let totalSynced = 0;
    const batchSize = 500;
    for (let i = 0; i < operations.length; i += batchSize) {
      const batch = operations.slice(i, i + batchSize);
      const result = await Invoice.bulkWrite(batch, { ordered: false });
      totalSynced += (result.upsertedCount || 0) + (result.modifiedCount || 0);
    }

    logger.info('HubSoft invoice sync completed', {
      providerId: provider._id,
      synced: totalSynced,
      upserted: totalSynced
    });

    return totalSynced;
  } catch (error) {
    logger.error('HubSoft invoice sync failed', {
      providerId: provider._id,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// ─── Sync Service Orders (Atendimentos) ────────────────────────────
// Uses /api/v1/integracao/atendimento/todos — paginated, up to 500/page

async function syncServiceOrders(provider, client) {
  logger.info('Starting HubSoft service order sync (atendimento/todos)', { providerId: provider._id });

  try {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = '2019-01-01';

    const atendimentos = await fetchAllPaginated(
      client,
      '/api/v1/integracao/atendimento/todos',
      'atendimentos',
      { data_inicio: startDate, data_fim: endDate, relacoes: 'cliente_servico' }
    );

    if (atendimentos.length === 0) {
      logger.info('No atendimentos found for sync', { providerId: provider._id });
      return 0;
    }

    const customers = await Customer.find({ providerId: provider._id }).lean();
    const customerMap = new Map(customers.map(c => [c.externalId, c._id]));

    const operations = atendimentos
      .filter(atend => atend.id_atendimento)
      .map(atend => {
        const extId = atend.id_atendimento.toString();
        const clienteId = atend.cliente_servico?.id_cliente?.toString() ||
                          atend.cliente_servico?.cliente?.id_cliente?.toString();
        const tipoDescricao = atend.tipo_atendimento?.descricao || null;
        const statusPrefixo = atend.status?.prefixo || '';
        const statusDescricao = atend.status?.descricao || '';

        let orderStatus = 'open';
        if (atend.data_fechamento) {
          const fechamento = (atend.status_fechamento || '').toLowerCase();
          orderStatus = fechamento.includes('cancelado') ? 'cancelled' : 'completed';
        } else if (statusPrefixo === 'em_atendimento' || statusPrefixo === 'em_andamento') {
          orderStatus = 'in_progress';
        }

        let resolutionMinutes = null;
        if (atend.data_cadastro && atend.data_fechamento) {
          resolutionMinutes = Math.floor((new Date(atend.data_fechamento) - new Date(atend.data_cadastro)) / 60000);
        }

        let priority = 'medium';
        if (tipoDescricao) {
          const t = tipoDescricao.toLowerCase();
          if (t.includes('queda massiva') || t.includes('emergencia') || t.includes('urgente')) priority = 'critical';
          else if (t.includes('cancelamento') || t.includes('cancel')) priority = 'high';
        }

        return {
          updateOne: {
            filter: { providerId: provider._id, externalId: extId },
            update: {
              $set: {
                providerId: provider._id,
                customerId: clienteId ? (customerMap.get(clienteId) || null) : null,
                externalId: extId,
                type: tipoDescricao || statusDescricao || 'Atendimento',
                category: tipoDescricao || null,
                priority,
                status: orderStatus,
                description: tipoDescricao || atend.protocolo || null,
                openedAt: atend.data_cadastro ? new Date(atend.data_cadastro) : new Date(),
                closedAt: atend.data_fechamento ? new Date(atend.data_fechamento) : null,
                resolutionTimeMinutes: resolutionMinutes,
                source: 'hubsoft',
                syncedAt: new Date()
              }
            },
            upsert: true
          }
        };
      });

    if (operations.length === 0) {
      logger.info('No valid atendimentos to sync', { providerId: provider._id });
      return 0;
    }

    let totalSynced = 0;
    const batchSize = 500;
    for (let i = 0; i < operations.length; i += batchSize) {
      const batch = operations.slice(i, i + batchSize);
      const result = await ServiceOrder.bulkWrite(batch, { ordered: false });
      totalSynced += (result.upsertedCount || 0) + (result.modifiedCount || 0);
    }

    logger.info('HubSoft service order sync completed', {
      providerId: provider._id,
      synced: totalSynced,
      totalAtendimentos: atendimentos.length
    });

    return totalSynced;
  } catch (error) {
    logger.error('HubSoft service order sync failed', {
      providerId: provider._id,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// ─── Status mappers ────────────────────────────────────────────────

function mapInvoiceStatus(status) {
  if (!status) return 'pending';
  const s = status.toLowerCase();
  if (s.includes('pago') || s === 'paid') return 'paid';
  if (s.includes('vencido') || s === 'overdue') return 'overdue';
  if (s.includes('cancelado') || s === 'cancelled') return 'cancelled';
  return 'pending';
}

function mapServiceOrderStatus(status) {
  if (!status) return 'open';
  const s = (typeof status === 'string' ? status : (status.prefixo || status.descricao || '')).toLowerCase();
  if (s.includes('fechado') || s.includes('completo') || s.includes('concluido') || s === 'completed') return 'completed';
  if (s.includes('cancelado') || s === 'cancelled') return 'cancelled';
  if (s.includes('em_atendimento') || s.includes('em_andamento') || s.includes('progresso') || s === 'in_progress') return 'in_progress';
  return 'open';
}

// ─── Validate ──────────────────────────────────────────────────────

async function validate(provider) {
  try {
    if (!provider.config.url || !provider.config.clientId || !provider.config.clientSecret ||
        !provider.config.username || !provider.config.password) {
      return { ok: false, message: 'Missing required config: url, clientId, clientSecret, username, password' };
    }

    const token = await getAccessToken(
      provider.config.url, provider.config.clientId, provider.config.clientSecret,
      provider.config.username, provider.config.password
    );

    const client = createHubSoftClient(provider.config.url, token);
    // Quick test with the paginated endpoint (1 item only)
    await makeRequest(client, '/api/v1/integracao/cliente/todos', { pagina: 0, itens_por_pagina: 1 });

    return { ok: true, message: 'HubSoft credentials validated successfully' };
  } catch (error) {
    logger.error('HubSoft validation failed', { error: error.message });
    return { ok: false, message: `HubSoft validation failed: ${error.message}` };
  }
}

// ─── Full sync ─────────────────────────────────────────────────────

async function syncAll(provider) {
  logger.info('Starting full HubSoft sync (optimized)', { providerId: provider._id, provider: provider.name });

  const results = { customers: 0, invoices: 0, serviceOrders: 0, errors: 0 };

  try {
    const token = await getAccessToken(
      provider.config.url, provider.config.clientId, provider.config.clientSecret,
      provider.config.username, provider.config.password
    );
    const client = createHubSoftClient(provider.config.url, token);

    // 1. Sync customers (paginated — ~6 API calls)
    try {
      results.customers = await syncCustomers(provider, client);
    } catch (error) {
      logger.error('Customer sync failed', { providerId: provider._id, error: error.message });
      results.errors++;
    }

    // Small delay between sync phases
    await sleep(1000);

    // 2. Sync invoices (throttled per-customer)
    try {
      results.invoices = await syncInvoices(provider, client);
    } catch (error) {
      logger.error('Invoice sync failed', { providerId: provider._id, error: error.message });
      results.errors++;
    }

    await sleep(1000);

    // 3. Sync service orders (paginated — ~13 API calls)
    try {
      results.serviceOrders = await syncServiceOrders(provider, client);
    } catch (error) {
      logger.error('Service order sync failed', { providerId: provider._id, error: error.message });
      results.errors++;
    }

    logger.info('HubSoft full sync completed', { providerId: provider._id, results });
    return results;
  } catch (error) {
    logger.error('HubSoft full sync failed', {
      providerId: provider._id, error: error.message, stack: error.stack
    });
    results.errors++;
    throw error;
  }
}

export default {
  syncAll,
  syncCustomers,
  syncInvoices,
  syncServiceOrders,
  validate
};
