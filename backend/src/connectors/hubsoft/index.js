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
 * HubSoft may return: { clientes: [...] }, { data: [...] }, [...], { faturas: [...] }, etc.
 */
function extractRecords(response) {
  if (!response) return [];
  if (Array.isArray(response)) return response;
  if (Array.isArray(response.data)) return response.data;
  if (Array.isArray(response.clientes)) return response.clientes;
  if (Array.isArray(response.faturas)) return response.faturas;
  if (Array.isArray(response.atendimentos)) return response.atendimentos;
  if (Array.isArray(response.ordens)) return response.ordens;
  // Try first array-valued key
  for (const key of Object.keys(response)) {
    if (Array.isArray(response[key])) return response[key];
  }
  return [];
}

/**
 * Fetch all paginated data from HubSoft integration API.
 * Uses alphabetic iteration on busca/termo_busca to get all records.
 */
async function fetchAllPages(client, endpoint, searchField = null) {
  let allData = [];

  if (searchField) {
    // HubSoft integration endpoints require busca + termo_busca
    // Iterate through alphabet to get all records
    const letters = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
    const seenIds = new Set();

    for (const letter of letters) {
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        try {
          const params = {
            busca: searchField,
            termo_busca: letter,
            pagina: page,
            registros_por_pagina: HUBSOFT_SYNC_CONFIG.pageSize
          };

          const response = await makeRequest(client, endpoint, params);
          const records = extractRecords(response);

          if (records.length === 0) {
            hasMore = false;
            break;
          }

          // Deduplicate by ID
          for (const record of records) {
            const id = record.id || record.id_cliente || record.codigo;
            if (id && !seenIds.has(String(id))) {
              seenIds.add(String(id));
              allData.push(record);
            }
          }

          hasMore = records.length >= HUBSOFT_SYNC_CONFIG.pageSize;
          page++;
        } catch (error) {
          logger.warn(`HubSoft fetch failed for letter '${letter}' page ${page}`, { endpoint, error: error.message });
          hasMore = false;
        }
      }
    }
  } else {
    // Standard paginated fetch
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const params = { pagina: page, registros_por_pagina: HUBSOFT_SYNC_CONFIG.pageSize };
      const response = await makeRequest(client, endpoint, params);
      const records = extractRecords(response);

      if (records.length === 0) {
        hasMore = false;
        break;
      }

      allData = allData.concat(records);
      hasMore = records.length >= HUBSOFT_SYNC_CONFIG.pageSize;
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
    const customers = await fetchAllPages(client, '/integracao/cliente', 'nome_razaosocial');
    
    const operations = customers
      .filter(customer => customer.id || customer.id_cliente || customer.codigo)
      .map(customer => {
        const extId = (customer.id || customer.id_cliente || customer.codigo)?.toString();
        return {
          updateOne: {
            filter: { providerId: provider._id, externalId: extId },
            update: {
              $set: {
                providerId: provider._id,
                externalId: extId,
                name: customer.nome_razaosocial || customer.razao_social || customer.nome || 'Unknown',
                document: customer.cpf_cnpj || customer.cnpj_cpf || customer.cnpj || customer.cpf || null,
                email: customer.email || customer.email_principal || null,
                phone: customer.telefone || customer.fone || customer.celular || null,
                plan: {
                  name: customer.plano || customer.nome_plano || '',
                  price: parseFloat(customer.valor_plano || customer.valor || 0),
                  downloadSpeed: parseFloat(customer.download || 0),
                  uploadSpeed: parseFloat(customer.upload || 0)
                },
                status: mapCustomerStatus(customer.status || customer.situacao),
                activationDate: customer.data_ativacao ? new Date(customer.data_ativacao) : null,
                cancellationDate: customer.data_cancelamento ? new Date(customer.data_cancelamento) : null,
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
    const invoices = await fetchAllPages(client, '/integracao/cliente/financeiro');
    
    // Get customers for ID lookup
    const customers = await Customer.find({ providerId: provider._id }).lean();
    const customerMap = new Map(customers.map(c => [c.externalId, c._id]));
    
    const operations = invoices
      .filter(invoice => (invoice.id || invoice.id_fatura) && (invoice.cliente_id || invoice.id_cliente))
      .map(invoice => {
        const extId = (invoice.id || invoice.id_fatura)?.toString();
        const clienteId = (invoice.cliente_id || invoice.id_cliente)?.toString();
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
                status: mapInvoiceStatus(invoice.status || invoice.situacao),
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
    const orders = await fetchAllPages(client, '/integracao/atendimento', 'assunto');
    
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
    await makeRequest(client, '/integracao/cliente', { busca: 'nome_razaosocial', termo_busca: 'a', registros_por_pagina: 1 });
    
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
