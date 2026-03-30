import axios from 'axios';
import logger from '../../utils/logger.js';
import { Customer, Invoice, ServiceOrder } from '../../models/index.js';

const IXC_SYNC_CONFIG = {
  maxRetries: 3,
  retryDelay: 1000,
  timeout: 30000,
  pageSize: 1000
};

/**
 * Create axios instance with IXC configuration
 */
function createIXCClient(baseUrl, token) {
  const auth = Buffer.from(`${token}:`).toString('base64');
  
  return axios.create({
    baseURL: baseUrl,
    timeout: IXC_SYNC_CONFIG.timeout,
    headers: {
      'Authorization': `Basic ${auth}`,
      'ixcsoft': 'listar',
      'Content-Type': 'application/json'
    }
  });
}

/**
 * Make request with retry logic
 */
async function makeRequest(client, method, endpoint, data = null, retries = 0) {
  try {
    const response = await client({
      method,
      url: endpoint,
      data
    });
    return response.data;
  } catch (error) {
    if (retries < IXC_SYNC_CONFIG.maxRetries && (error.code === 'ECONNABORTED' || error.code === 'ECONNREFUSED')) {
      logger.warn(`IXC request failed, retrying... (attempt ${retries + 1})`, { endpoint, error: error.message });
      await new Promise(resolve => setTimeout(resolve, IXC_SYNC_CONFIG.retryDelay));
      return makeRequest(client, method, endpoint, data, retries + 1);
    }
    throw error;
  }
}

/**
 * Build IXC query body
 */
function buildIXCQueryBody(page = 1) {
  return {
    qtype: 'field',
    query: '',
    session: new Date().toISOString().split('T')[0],
    operession: '>',
    grid_param: JSON.stringify([{
      TB: '',
      TP: 'max_results',
      VL: IXC_SYNC_CONFIG.pageSize.toString()
    }]),
    page: page
  };
}

/**
 * Sync customers from IXC
 */
async function syncCustomers(provider, client) {
  logger.info('Starting IXC customer sync', { providerId: provider._id });
  
  let page = 1;
  let allCustomers = [];
  let hasMore = true;
  
  try {
    while (hasMore) {
      const body = buildIXCQueryBody(page);
      const response = await makeRequest(client, 'POST', '/cliente', body);
      
      if (!response || !Array.isArray(response)) {
        hasMore = false;
        break;
      }
      
      allCustomers = allCustomers.concat(response);
      hasMore = response.length === IXC_SYNC_CONFIG.pageSize;
      page++;
    }
    
    // Prepare upsert operations
    const operations = allCustomers.map(customer => ({
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
            status: mapCustomerStatus(customer.ativo),
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
              inscricao_estadual: customer.inscricao_estadual
            },
            source: 'ixc',
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
    
    // Batch write
    const result = await Customer.bulkWrite(operations, { ordered: false });
    const syncedCount = result.upsertedCount + result.modifiedCount;
    
    logger.info('IXC customer sync completed', {
      providerId: provider._id,
      synced: syncedCount,
      upserted: result.upsertedCount,
      modified: result.modifiedCount
    });
    
    return syncedCount;
  } catch (error) {
    logger.error('IXC customer sync failed', {
      providerId: provider._id,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Sync invoices from IXC
 */
async function syncInvoices(provider, client) {
  logger.info('Starting IXC invoice sync', { providerId: provider._id });
  
  let page = 1;
  let allInvoices = [];
  let hasMore = true;
  
  try {
    while (hasMore) {
      const body = buildIXCQueryBody(page);
      const response = await makeRequest(client, 'POST', '/fn_areceber', body);
      
      if (!response || !Array.isArray(response)) {
        hasMore = false;
        break;
      }
      
      allInvoices = allInvoices.concat(response);
      hasMore = response.length === IXC_SYNC_CONFIG.pageSize;
      page++;
    }
    
    // Get customers for ID lookup
    const customers = await Customer.find({ providerId: provider._id }).lean();
    const customerMap = new Map(customers.map(c => [c.externalId, c._id]));
    
    // Prepare upsert operations
    const operations = allInvoices
      .filter(inv => inv.id && inv.cliente_id)
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
              status: mapInvoiceStatus(invoice.situacao),
              source: 'ixc',
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
    
    logger.info('IXC invoice sync completed', {
      providerId: provider._id,
      synced: syncedCount,
      upserted: result.upsertedCount,
      modified: result.modifiedCount
    });
    
    return syncedCount;
  } catch (error) {
    logger.error('IXC invoice sync failed', {
      providerId: provider._id,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Sync service orders from IXC
 */
async function syncServiceOrders(provider, client) {
  logger.info('Starting IXC service order sync', { providerId: provider._id });
  
  let page = 1;
  let allOrders = [];
  let hasMore = true;
  
  try {
    while (hasMore) {
      const body = buildIXCQueryBody(page);
      const response = await makeRequest(client, 'POST', '/su_oss_chamado', body);
      
      if (!response || !Array.isArray(response)) {
        hasMore = false;
        break;
      }
      
      allOrders = allOrders.concat(response);
      hasMore = response.length === IXC_SYNC_CONFIG.pageSize;
      page++;
    }
    
    // Get customers for ID lookup
    const customers = await Customer.find({ providerId: provider._id }).lean();
    const customerMap = new Map(customers.map(c => [c.externalId, c._id]));
    
    // Prepare upsert operations
    const operations = allOrders
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
              source: 'ixc',
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
    
    logger.info('IXC service order sync completed', {
      providerId: provider._id,
      synced: syncedCount,
      upserted: result.upsertedCount,
      modified: result.modifiedCount
    });
    
    return syncedCount;
  } catch (error) {
    logger.error('IXC service order sync failed', {
      providerId: provider._id,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Map IXC customer status
 */
function mapCustomerStatus(status) {
  if (status === 'A' || status === '1' || status === true) return 'active';
  if (status === 'I' || status === '0' || status === false) return 'inactive';
  return 'unknown';
}

/**
 * Map IXC invoice status
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
 * Map IXC service order status
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
 * Validate IXC credentials
 */
async function validate(provider) {
  try {
    if (!provider.config.url || !provider.config.token) {
      return {
        ok: false,
        message: 'Missing required config: url and token'
      };
    }
    
    const client = createIXCClient(provider.config.url, provider.config.token);
    const body = buildIXCQueryBody(1);
    
    await makeRequest(client, 'POST', '/cliente', body);
    
    return {
      ok: true,
      message: 'IXC credentials validated successfully'
    };
  } catch (error) {
    logger.error('IXC validation failed', { error: error.message });
    return {
      ok: false,
      message: `IXC validation failed: ${error.message}`
    };
  }
}

/**
 * Full sync of all entities
 */
async function syncAll(provider) {
  logger.info('Starting full IXC sync', { providerId: provider._id, provider: provider.name });
  
  const results = {
    customers: 0,
    invoices: 0,
    serviceOrders: 0,
    errors: 0
  };
  
  try {
    const client = createIXCClient(provider.config.url, provider.config.token);
    
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
    
    logger.info('IXC full sync completed', { providerId: provider._id, results });
    return results;
  } catch (error) {
    logger.error('IXC full sync failed', {
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
  syncCustomers: (provider) => syncCustomers(provider, createIXCClient(provider.config.url, provider.config.token)),
  syncInvoices: (provider) => syncInvoices(provider, createIXCClient(provider.config.url, provider.config.token)),
  syncServiceOrders: (provider) => syncServiceOrders(provider, createIXCClient(provider.config.url, provider.config.token)),
  validate
};
