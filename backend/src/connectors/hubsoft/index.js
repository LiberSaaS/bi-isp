import axios from 'axios';
import logger from '../../utils/logger.js';
import { Customer, Invoice, ServiceOrder } from '../../models/index.js';

const HUBSOFT_SYNC_CONFIG = {
  maxRetries: 3,
  retryDelay: 1000,
  timeout: 30000,
  pageSize: 100
};

/**
 * Get OAuth2 token from HubSoft
 * Uses /oauth/token endpoint with password grant
 */
async function getAccessToken(baseUrl, clientId, clientSecret, username, password) {
  try {
    const response = await axios.post(
      `${baseUrl}/oauth/token`,
      `grant_type=password&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
      {
        timeout: HUBSOFT_SYNC_CONFIG.timeout,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    if (!response.data.access_token) {
      throw new Error('No access token in response');
    }

    return response.data.access_token;
  } catch (error) {
    logger.error('Failed to get HubSoft access token', { error: error.message });
    throw error;
  }
}

/**
 * Create axios instance with HubSoft OAuth token
 */
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

/**
 * Make request with retry logic and pagination.
 * HubSoft /integracao/ endpoints require busca + termo_busca params.
 */
async function makeRequest(client, endpoint, params = {}, retries = 0) {
  try {
    const response = await client.get(endpoint, { params });
    return response.data;
  } catch (error) {
    if (retries < HUBSOFT_SYNC_CONFIG.maxRetries && (error.code === 'ECONNABORTED' || error.code === 'ECONNREFUSED')) {
      logger.warn(`HubSoft request failed, retrying... (attempt ${retries + 1})`, { endpoint, error: error.message });
      await new Promise(resolve => setTimeout(resolve, HUBSOFT_SYNC_CONFIG.retryDelay));
      return makeRequest(client, endpoint, params, retries + 1);
    }
    throw error;
  }
}

/**
 * Extract array from HubSoft response.
 * HubSoft may return: { status, msg, clientes: [...] }, { data: [...] }, [...], etc.
 * If the response contains status:"error", log the error and return [].
 */
function extractRecords(response) {
  if (!response) return [];
  // HubSoft error responses come back as HTTP 200 with status:"error"
  if (response.status === 'error') {
    logger.warn('HubSoft API returned error', { msg: response.msg });
    return [];
  }
  if (Array.isArray(response)) return response;
  if (Array.isArray(response.clientes)) return response.clientes;
  if (Array.isArray(response.faturas)) return response.faturas;
  if (Array.isArray(response.atendimentos)) return response.atendimentos;
  if (Array.isArray(response.ordens)) return response.ordens;
  if (Array.isArray(response.data)) return response.data;
  // Try first array-valued key (skip status/msg)
  for (const key of Object.keys(response)) {
    if (key === 'status' || key === 'msg') continue;
    if (Array.isArray(response[key])) return response[key];
  }
  return [];
}

/**
 * Fetch all data from HubSoft integration API using recursive trie search.
 *
 * HubSoft's /integracao/cliente endpoint has two key limitations:
 *   1. It always returns a MAXIMUM of 5 records per request (ignoring itens_por_página).
 *   2. Pagination (página param) is broken — every page returns the same 5 records.
 *
 * To work around this we use a trie-based deepening strategy:
 *   - Search with a prefix (e.g. "a"). If the API returns the max (5 records),
 *     there are likely more records matching that prefix than we can see.
 *   - Drill deeper by appending each character (e.g. "aa", "ab", ..., "az", "a ").
 *   - Repeat until every prefix returns fewer than MAX_PER_REQUEST results.
 *   - Deduplicate across all branches using a global Set of IDs.
 *
 * This guarantees we discover every record whose name contains at least one
 * searchable substring, even though the API never returns more than 5 at a time.
 */
const HUBSOFT_MAX_PER_REQUEST = 5;
const HUBSOFT_MAX_SEARCH_DEPTH = 5;
const SEARCH_CHARS = 'abcdefghijklmnopqrstuvwxyz '.split('');

async function fetchAllPages(client, endpoint, searchField = null) {
  const allData = [];

  if (searchField) {
    const seenIds = new Set();
    let apiCalls = 0;

    /**
     * Recursive search: fetch records for `prefix`, and if the API returns
     * the maximum number of results, drill one level deeper.
     */
    async function deepSearch(prefix, depth) {
      if (depth > HUBSOFT_MAX_SEARCH_DEPTH) return;

      try {
        apiCalls++;
        const params = {
          busca: searchField,
          termo_busca: prefix,
          'página': 1,
          'itens_por_página': 100   // requested but ignored by HubSoft
        };

        const response = await makeRequest(client, endpoint, params);
        const records = extractRecords(response);

        if (records.length === 0) return;

        // Collect unique records
        for (const record of records) {
          const id = record.id || record.id_cliente || record.codigo;
          if (id && !seenIds.has(String(id))) {
            seenIds.add(String(id));
            allData.push(record);
          }
        }

        // If we hit the per-request cap, there may be more — drill deeper
        if (records.length >= HUBSOFT_MAX_PER_REQUEST && depth < HUBSOFT_MAX_SEARCH_DEPTH) {
          for (const ch of SEARCH_CHARS) {
            await deepSearch(prefix + ch, depth + 1);
          }
        }
      } catch (error) {
        logger.warn(`HubSoft deep search failed for prefix "${prefix}"`, {
          endpoint, error: error.message
        });
      }
    }

    // Start with each letter of the alphabet (skip space as first char)
    const firstChars = 'abcdefghijklmnopqrstuvwxyz'.split('');
    for (const ch of firstChars) {
      await deepSearch(ch, 1);
    }

    logger.info(`HubSoft trie search completed`, {
      endpoint, totalRecords: allData.length, apiCalls
    });
  } else {
    // Standard paginated fetch (no search field)
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const params = { 'página': page, 'itens_por_página': HUBSOFT_SYNC_CONFIG.pageSize };
      const response = await makeRequest(client, endpoint, params);
      const records = extractRecords(response);

      if (records.length === 0) {
        hasMore = false;
        break;
      }

      allData.push(...records);
      hasMore = records.length > 0;
      page++;
    }
  }

  logger.info(`HubSoft fetchAllPages: ${allData.length} records from ${endpoint}`);
  return allData;
}

/**
 * Sync customers from HubSoft
 */
async function syncCustomers(provider, client) {
  logger.info('Starting HubSoft customer sync', { providerId: provider._id });
  
  try {
    const customers = await fetchAllPages(client, '/api/v1/integracao/cliente', 'nome_razaosocial');
    
    const operations = customers
      .filter(customer => customer.id_cliente || customer.id || customer.codigo_cliente)
      .map(customer => {
        const extId = (customer.id_cliente || customer.id || customer.codigo_cliente)?.toString();

        // Extract plan from first active service
        const activeService = (customer.servicos || []).find(s =>
          s.status_prefixo === 'servico_habilitado' || (s.status && s.status.toLowerCase().includes('habilitado'))
        ) || (customer.servicos || [])[0];

        const planName = activeService?.nome || '';
        const planPrice = parseFloat(activeService?.valor || 0);
        const dlSpeed = parseFloat(String(activeService?.velocidade_download || '0').replace(/[^\d.]/g, ''));
        const ulSpeed = parseFloat(String(activeService?.velocidade_upload || '0').replace(/[^\d.]/g, ''));

        // Determine status from ativo flag and service status
        let status = 'active';
        if (customer.ativo === false) {
          status = 'cancelled';
        } else if (activeService?.status_prefixo?.includes('suspenso')) {
          status = 'suspended';
        } else if (activeService?.status_prefixo?.includes('cancelado')) {
          status = 'cancelled';
        }

        // Find activation/cancellation dates from services
        const activationDate = activeService?.data_habilitacao ? new Date(activeService.data_habilitacao) : null;
        const cancellationDate = activeService?.data_cancelamento ? new Date(activeService.data_cancelamento) : null;

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
                address: {
                  street: customer.endereco || customer.logradouro || null,
                  number: customer.numero || null,
                  city: customer.cidade || null,
                  neighborhood: customer.bairro || null,
                  cep: customer.cep || null
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
    
    const result = await Customer.bulkWrite(operations, { ordered: false });
    const syncedCount = result.upsertedCount + result.modifiedCount;
    
    logger.info('HubSoft customer sync completed', {
      providerId: provider._id,
      synced: syncedCount,
      upserted: result.upsertedCount,
      modified: result.modifiedCount
    });
    
    return syncedCount;
  } catch (error) {
    logger.error('HubSoft customer sync failed', {
      providerId: provider._id,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Sync invoices from HubSoft
 */
async function syncInvoices(provider, client) {
  logger.info('Starting HubSoft invoice sync', { providerId: provider._id });

  try {
    // HubSoft financeiro endpoint requires searching by customer ID.
    // We iterate over all synced customers and fetch invoices per customer.
    const customers = await Customer.find({ providerId: provider._id }).lean();
    const customerMap = new Map(customers.map(c => [c.externalId, c._id]));

    const allInvoices = [];
    for (const customer of customers) {
      try {
        const response = await makeRequest(client, '/api/v1/integracao/financeiro', {
          busca: 'id_cliente',
          termo_busca: customer.externalId
        });
        const records = extractRecords(response);
        for (const inv of records) {
          inv._customerExternalId = customer.externalId;
        }
        allInvoices.push(...records);
      } catch (error) {
        logger.warn(`Failed to fetch invoices for customer ${customer.externalId}`, { error: error.message });
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

    const result = await Invoice.bulkWrite(operations, { ordered: false });
    const syncedCount = result.upsertedCount + result.modifiedCount;

    logger.info('HubSoft invoice sync completed', {
      providerId: provider._id,
      synced: syncedCount,
      upserted: result.upsertedCount,
      modified: result.modifiedCount
    });

    return syncedCount;
  } catch (error) {
    logger.error('HubSoft invoice sync failed', {
      providerId: provider._id,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Sync service orders from HubSoft
 */
async function syncServiceOrders(provider, client) {
  logger.info('Starting HubSoft service order sync', { providerId: provider._id });

  try {
    // Test if the endpoint is available first (some HubSoft instances don't have it enabled)
    const testResponse = await makeRequest(client, '/api/v1/integracao/atendimento', {
      busca: 'assunto', termo_busca: 'a', 'página': 1, 'itens_por_página': 1
    });
    if (testResponse && testResponse.status === 'error' &&
        (testResponse.msg || '').toLowerCase().includes('não disponível')) {
      logger.info('HubSoft service order endpoint not available for this instance', { providerId: provider._id });
      return 0;
    }

    const orders = await fetchAllPages(client, '/api/v1/integracao/atendimento', 'assunto');
    
    // Get customers for ID lookup
    const customers = await Customer.find({ providerId: provider._id }).lean();
    const customerMap = new Map(customers.map(c => [c.externalId, c._id]));
    
    const operations = orders
      .filter(order => order.id || order.id_atendimento)
      .map(order => {
        const extId = (order.id || order.id_atendimento)?.toString();
        const clienteId = (order.cliente_id || order.id_cliente)?.toString();
        return {
          updateOne: {
            filter: { providerId: provider._id, externalId: extId },
            update: {
              $set: {
                providerId: provider._id,
                customerId: clienteId ? customerMap.get(clienteId) : null,
                externalId: extId,
                type: order.tipo || order.tipo_atendimento || null,
                category: order.categoria || order.setor || null,
                priority: mapPriority(order.prioridade),
                status: mapServiceOrderStatus(order.status || order.situacao),
                description: order.descricao || order.assunto || null,
                openedAt: new Date(order.data_abertura || order.data_inicio || Date.now()),
                closedAt: order.data_fechamento || order.data_finalizado ? new Date(order.data_fechamento || order.data_finalizado) : null,
                resolutionTimeMinutes: calculateResolutionTime(order),
                source: 'hubsoft',
                syncedAt: new Date()
              }
            },
            upsert: true
          }
        };
      });
    
    if (operations.length === 0) {
      logger.info('No service orders found for sync', { providerId: provider._id });
      return 0;
    }
    
    const result = await ServiceOrder.bulkWrite(operations, { ordered: false });
    const syncedCount = result.upsertedCount + result.modifiedCount;
    
    logger.info('HubSoft service order sync completed', {
      providerId: provider._id,
      synced: syncedCount,
      upserted: result.upsertedCount,
      modified: result.modifiedCount
    });
    
    return syncedCount;
  } catch (error) {
    logger.error('HubSoft service order sync failed', {
      providerId: provider._id,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Map HubSoft customer status
 */
function mapCustomerStatus(status) {
  if (!status) return 'active';
  const statusLower = status.toLowerCase();
  if (statusLower.includes('ativo') || statusLower === 'active') return 'active';
  if (statusLower.includes('suspenso') || statusLower === 'suspended') return 'suspended';
  if (statusLower.includes('cancelado') || statusLower === 'cancelled') return 'cancelled';
  if (statusLower.includes('pendente') || statusLower === 'pending') return 'pending';
  return 'active';
}

/**
 * Map HubSoft invoice status
 */
function mapInvoiceStatus(status) {
  if (!status) return 'pending';
  const statusLower = status.toLowerCase();
  if (statusLower.includes('pago') || statusLower === 'paid') return 'paid';
  if (statusLower.includes('vencido') || statusLower === 'overdue') return 'overdue';
  if (statusLower.includes('cancelado') || statusLower === 'cancelled') return 'cancelled';
  return 'pending';
}

/**
 * Map HubSoft service order status
 */
function mapServiceOrderStatus(status) {
  if (!status) return 'open';
  const statusLower = status.toLowerCase();
  if (statusLower.includes('aberto') || statusLower === 'open') return 'open';
  if (statusLower.includes('progresso') || statusLower === 'in_progress') return 'in_progress';
  if (statusLower.includes('fechado') || statusLower.includes('completo') || statusLower === 'completed') return 'completed';
  if (statusLower.includes('cancelado') || statusLower === 'cancelled') return 'cancelled';
  return 'open';
}

/**
 * Map priority
 */
function mapPriority(priority) {
  if (!priority) return 'medium';
  const priorityLower = priority.toLowerCase();
  if (priorityLower.includes('critica') || priorityLower === 'critical') return 'critical';
  if (priorityLower.includes('alta') || priorityLower === 'high') return 'high';
  if (priorityLower.includes('media') || priorityLower === 'medium') return 'medium';
  if (priorityLower.includes('baixa') || priorityLower === 'low') return 'low';
  return 'medium';
}

/**
 * Calculate resolution time in minutes
 */
function calculateResolutionTime(order) {
  if (!order.data_abertura || !order.data_fechamento) return null;
  const open = new Date(order.data_abertura);
  const closed = new Date(order.data_fechamento);
  return Math.floor((closed - open) / 60000);
}

/**
 * Validate HubSoft credentials
 */
async function validate(provider) {
  try {
    if (!provider.config.url || !provider.config.clientId || !provider.config.clientSecret ||
        !provider.config.username || !provider.config.password) {
      return {
        ok: false,
        message: 'Missing required config: url, clientId, clientSecret, username, password'
      };
    }
    
    const token = await getAccessToken(
      provider.config.url,
      provider.config.clientId,
      provider.config.clientSecret,
      provider.config.username,
      provider.config.password
    );
    
    const client = createHubSoftClient(provider.config.url, token);
    await makeRequest(client, '/api/v1/integracao/cliente', { busca: 'nome_razaosocial', termo_busca: 'a', 'itens_por_página': 1, 'página': 1 });
    
    return {
      ok: true,
      message: 'HubSoft credentials validated successfully'
    };
  } catch (error) {
    logger.error('HubSoft validation failed', { error: error.message });
    return {
      ok: false,
      message: `HubSoft validation failed: ${error.message}`
    };
  }
}

/**
 * Full sync of all entities
 */
async function syncAll(provider) {
  logger.info('Starting full HubSoft sync', { providerId: provider._id, provider: provider.name });
  
  const results = {
    customers: 0,
    invoices: 0,
    serviceOrders: 0,
    errors: 0
  };
  
  try {
    const token = await getAccessToken(
      provider.config.url,
      provider.config.clientId,
      provider.config.clientSecret,
      provider.config.username,
      provider.config.password
    );
    
    const client = createHubSoftClient(provider.config.url, token);
    
    // Sync customers
    try {
      results.customers = await syncCustomers(provider, client);
    } catch (error) {
      logger.error('Customer sync failed', { providerId: provider._id, error: error.message });
      results.errors++;
    }
    
    // Sync invoices
    try {
      results.invoices = await syncInvoices(provider, client);
    } catch (error) {
      logger.error('Invoice sync failed', { providerId: provider._id, error: error.message });
      results.errors++;
    }
    
    // Sync service orders
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
      providerId: provider._id,
      error: error.message,
      stack: error.stack
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
