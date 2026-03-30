import axios from 'axios';
import logger from '../../utils/logger.js';
import { Customer, Invoice, ServiceOrder } from '../../models/index.js';

const SGP_SYNC_CONFIG = {
  maxRetries: 3,
  retryDelay: 1000,
  timeout: 30000,
  pageSize: 1000
};

/**
 * Create axios instance with SGP base configuration
 */
function createSGPClient(baseUrl) {
  return axios.create({
    baseURL: baseUrl,
    timeout: SGP_SYNC_CONFIG.timeout,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

/**
 * Make SGP API request with retry logic
 */
async function makeRequest(client, token, app, method, params = {}, retries = 0) {
  try {
    const response = await client.post('/api', {
      token,
      app,
      method,
      params
    });
    
    if (!response.data || !response.data.success) {
      throw new Error(response.data?.error || 'SGP API returned failure');
    }
    
    return response.data.data || [];
  } catch (error) {
    if (retries < SGP_SYNC_CONFIG.maxRetries && (error.code === 'ECONNABORTED' || error.code === 'ECONNREFUSED')) {
      logger.warn(`SGP request failed, retrying... (attempt ${retries + 1})`, { method, error: error.message });
      await new Promise(resolve => setTimeout(resolve, SGP_SYNC_CONFIG.retryDelay));
      return makeRequest(client, token, app, method, params, retries + 1);
    }
    throw error;
  }
}

/**
 * Fetch paginated data from SGP
 */
async function fetchAllPages(client, token, app, method, baseParams = {}) {
  let page = 1;
  let allData = [];
  let hasMore = true;
  
  while (hasMore) {
    const params = { ...baseParams, page, limit: SGP_SYNC_CONFIG.pageSize };
    const data = await makeRequest(client, token, app, method, params);
    
    if (!Array.isArray(data) || data.length === 0) {
      hasMore = false;
      break;
    }
    
    allData = allData.concat(data);
    hasMore = data.length === SGP_SYNC_CONFIG.pageSize;
    page++;
  }
  
  return allData;
}

/**
 * Sync customers from SGP
 */
async function syncCustomers(provider, client) {
  logger.info('Starting SGP customer sync', { providerId: provider._id });
  
  try {
    const customers = await fetchAllPages(
      client,
      provider.config.token,
      provider.config.app,
      'list_clientes'
    );
    
    const operations = customers
      .filter(customer => customer.id)
      .map(customer => ({
        updateOne: {
          filter: { providerId: provider._id, externalId: customer.id?.toString() },
          update: {
            $set: {
              providerId: provider._id,
              externalId: customer.id?.toString(),
              name: customer.razao_social || customer.nome || 'Unknown',
              document: customer.cpf_cnpj || customer.cnpj || null,
              email: customer.email || null,
              phone: customer.telefone || null,
              status: mapCustomerStatus(customer.status),
              address: {
                street: customer.endereco || null,
                number: customer.numero || null,
                complement: customer.complemento || null,
                city: customer.cidade || null,
                state: customer.estado || null,
                zipCode: customer.cep || null,
                country: 'BR'
              },
              additionalData: {
                limite_credito: customer.limite_credito,
                tipo_pessoa: customer.tipo_pessoa,
                inscricao_estadual: customer.inscricao_estadual,
                data_cadastro: customer.data_cadastro,
                contato: customer.contato,
                observacoes: customer.observacoes
              },
              source: 'sgp',
              syncedAt: new Date()
            }
          },
          upsert: true
        }
      }));
    
    if (operations.length === 0) {
      logger.info('No customers found for sync', { providerId: provider._id });
      return 0;
    }
    
    const result = await Customer.bulkWrite(operations, { ordered: false });
    const syncedCount = result.upsertedCount + result.modifiedCount;
    
    logger.info('SGP customer sync completed', {
      providerId: provider._id,
      synced: syncedCount,
      upserted: result.upsertedCount,
      modified: result.modifiedCount
    });
    
    return syncedCount;
  } catch (error) {
    logger.error('SGP customer sync failed', {
      providerId: provider._id,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Sync invoices from SGP
 */
async function syncInvoices(provider, client) {
  logger.info('Starting SGP invoice sync', { providerId: provider._id });
  
  try {
    const invoices = await fetchAllPages(
      client,
      provider.config.token,
      provider.config.app,
      'list_faturas'
    );
    
    // Get customers for ID lookup
    const customers = await Customer.find({ providerId: provider._id }).lean();
    const customerMap = new Map(customers.map(c => [c.externalId, c._id]));
    
    const operations = invoices
      .filter(invoice => invoice.id && invoice.cliente_id)
      .map(invoice => ({
        updateOne: {
          filter: { providerId: provider._id, externalId: invoice.id?.toString() },
          update: {
            $set: {
              providerId: provider._id,
              customerId: customerMap.get(invoice.cliente_id?.toString()) || null,
              externalId: invoice.id?.toString(),
              amount: parseFloat(invoice.valor) || 0,
              paidAmount: parseFloat(invoice.valor_pago) || 0,
              dueDate: new Date(invoice.data_vencimento),
              paymentDate: invoice.data_pagamento ? new Date(invoice.data_pagamento) : null,
              status: mapInvoiceStatus(invoice.status),
              source: 'sgp',
              syncedAt: new Date()
            }
          },
          upsert: true
        }
      }));
    
    if (operations.length === 0) {
      logger.info('No invoices found for sync', { providerId: provider._id });
      return 0;
    }
    
    const result = await Invoice.bulkWrite(operations, { ordered: false });
    const syncedCount = result.upsertedCount + result.modifiedCount;
    
    logger.info('SGP invoice sync completed', {
      providerId: provider._id,
      synced: syncedCount,
      upserted: result.upsertedCount,
      modified: result.modifiedCount
    });
    
    return syncedCount;
  } catch (error) {
    logger.error('SGP invoice sync failed', {
      providerId: provider._id,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Sync service orders from SGP
 */
async function syncServiceOrders(provider, client) {
  logger.info('Starting SGP service order sync', { providerId: provider._id });
  
  try {
    const orders = await fetchAllPages(
      client,
      provider.config.token,
      provider.config.app,
      'list_chamados'
    );
    
    // Get customers for ID lookup
    const customers = await Customer.find({ providerId: provider._id }).lean();
    const customerMap = new Map(customers.map(c => [c.externalId, c._id]));
    
    const operations = orders
      .filter(order => order.id)
      .map(order => ({
        updateOne: {
          filter: { providerId: provider._id, externalId: order.id?.toString() },
          update: {
            $set: {
              providerId: provider._id,
              customerId: order.cliente_id ? customerMap.get(order.cliente_id?.toString()) : null,
              externalId: order.id?.toString(),
              type: order.tipo || null,
              category: order.categoria || null,
              priority: mapPriority(order.prioridade),
              status: mapServiceOrderStatus(order.status),
              description: order.descricao || null,
              openedAt: new Date(order.data_abertura || Date.now()),
              closedAt: order.data_fechamento ? new Date(order.data_fechamento) : null,
              resolutionTimeMinutes: calculateResolutionTime(order),
              source: 'sgp',
              syncedAt: new Date()
            }
          },
          upsert: true
        }
      }));
    
    if (operations.length === 0) {
      logger.info('No service orders found for sync', { providerId: provider._id });
      return 0;
    }
    
    const result = await ServiceOrder.bulkWrite(operations, { ordered: false });
    const syncedCount = result.upsertedCount + result.modifiedCount;
    
    logger.info('SGP service order sync completed', {
      providerId: provider._id,
      synced: syncedCount,
      upserted: result.upsertedCount,
      modified: result.modifiedCount
    });
    
    return syncedCount;
  } catch (error) {
    logger.error('SGP service order sync failed', {
      providerId: provider._id,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Map SGP customer status
 */
function mapCustomerStatus(status) {
  if (!status) return 'active';
  const statusLower = status.toLowerCase();
  if (statusLower.includes('ativo') || statusLower === 'active' || status === '1' || status === 1) return 'active';
  if (statusLower.includes('inativo') || statusLower === 'inactive' || status === '0' || status === 0) return 'inactive';
  if (statusLower.includes('suspenso') || statusLower === 'suspended') return 'suspended';
  if (statusLower.includes('cancelado') || statusLower === 'cancelled') return 'inactive';
  return 'active';
}

/**
 * Map SGP invoice status
 */
function mapInvoiceStatus(status) {
  if (!status) return 'pending';
  const statusLower = status.toLowerCase();
  if (statusLower.includes('pago') || statusLower === 'paid' || status === '2' || status === 2) return 'paid';
  if (statusLower.includes('vencido') || statusLower === 'overdue' || status === '1' || status === 1) return 'overdue';
  if (statusLower.includes('cancelado') || statusLower === 'cancelled') return 'cancelled';
  return 'pending';
}

/**
 * Map SGP service order status
 */
function mapServiceOrderStatus(status) {
  if (!status) return 'open';
  const statusLower = status.toLowerCase();
  if (statusLower.includes('aberto') || statusLower === 'open' || status === '1' || status === 1) return 'open';
  if (statusLower.includes('progresso') || statusLower === 'in_progress' || status === '2' || status === 2) return 'in_progress';
  if (statusLower.includes('fechado') || statusLower.includes('completo') || statusLower === 'completed' || status === '3' || status === 3) return 'completed';
  if (statusLower.includes('cancelado') || statusLower === 'cancelled' || status === '4' || status === 4) return 'cancelled';
  return 'open';
}

/**
 * Map priority
 */
function mapPriority(priority) {
  if (!priority) return 'medium';
  const priorityLower = priority.toString().toLowerCase();
  if (priority === '1' || priority === 1 || priorityLower.includes('baixa') || priorityLower === 'low') return 'low';
  if (priority === '2' || priority === 2 || priorityLower.includes('media') || priorityLower === 'medium') return 'medium';
  if (priority === '3' || priority === 3 || priorityLower.includes('alta') || priorityLower === 'high') return 'high';
  if (priority === '4' || priority === 4 || priorityLower.includes('critica') || priorityLower === 'critical') return 'critical';
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
 * Validate SGP credentials
 */
async function validate(provider) {
  try {
    if (!provider.config.url || !provider.config.token || !provider.config.app) {
      return {
        ok: false,
        message: 'Missing required config: url, token, and app'
      };
    }
    
    const client = createSGPClient(provider.config.url);
    await makeRequest(client, provider.config.token, provider.config.app, 'list_clientes', { limit: 1 });
    
    return {
      ok: true,
      message: 'SGP credentials validated successfully'
    };
  } catch (error) {
    logger.error('SGP validation failed', { error: error.message });
    return {
      ok: false,
      message: `SGP validation failed: ${error.message}`
    };
  }
}

/**
 * Full sync of all entities
 */
async function syncAll(provider) {
  logger.info('Starting full SGP sync', { providerId: provider._id, provider: provider.name });
  
  const results = {
    customers: 0,
    invoices: 0,
    serviceOrders: 0,
    errors: 0
  };
  
  try {
    const client = createSGPClient(provider.config.url);
    
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
    
    logger.info('SGP full sync completed', { providerId: provider._id, results });
    return results;
  } catch (error) {
    logger.error('SGP full sync failed', {
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
