import axios from 'axios';
import logger from '../../utils/logger.js';
import { Customer, Invoice, ServiceOrder } from '../../models/index.js';

const MKAUTH_SYNC_CONFIG = {
  maxRetries: 3,
  retryDelay: 1000,
  timeout: 30000,
  pageSize: 100,
  minVersion: '24.05'
};

/**
 * Create axios instance with MK-Auth token
 */
function createMKAuthClient(baseUrl, token) {
  return axios.create({
    baseURL: baseUrl,
    timeout: MKAUTH_SYNC_CONFIG.timeout,
    headers: {
      'Authorization': `Token ${token}`,
      'Content-Type': 'application/json'
    }
  });
}

/**
 * Make request with retry logic
 */
async function makeRequest(client, endpoint, page = 1, retries = 0) {
  try {
    const response = await client.get(endpoint, {
      params: { page, limit: MKAUTH_SYNC_CONFIG.pageSize }
    });
    return response.data;
  } catch (error) {
    if (retries < MKAUTH_SYNC_CONFIG.maxRetries && (error.code === 'ECONNABORTED' || error.code === 'ECONNREFUSED')) {
      logger.warn(`MK-Auth request failed, retrying... (attempt ${retries + 1})`, { endpoint, error: error.message });
      await new Promise(resolve => setTimeout(resolve, MKAUTH_SYNC_CONFIG.retryDelay));
      return makeRequest(client, endpoint, page, retries + 1);
    }
    throw error;
  }
}

/**
 * Fetch all paginated data
 */
async function fetchAllPages(client, endpoint) {
  let page = 1;
  let allData = [];
  let hasMore = true;
  
  while (hasMore) {
    const response = await makeRequest(client, endpoint, page);
    
    if (!response || !Array.isArray(response.data)) {
      hasMore = false;
      break;
    }
    
    allData = allData.concat(response.data);
    hasMore = response.data.length === MKAUTH_SYNC_CONFIG.pageSize;
    page++;
  }
  
  return allData;
}

/**
 * Check MK-Auth version compatibility
 */
async function checkVersion(client) {
  try {
    const response = await client.get('/api/v1/sistema/versao');
    const version = response.data?.versao;
    
    if (!version) {
      logger.warn('Could not determine MK-Auth version');
      return true; // Allow sync if version check fails
    }
    
    // Simple version comparison (e.g., "24.05" >= "24.05")
    const [currentMajor, currentMinor] = version.split('.').map(Number);
    const [minMajor, minMinor] = MKAUTH_SYNC_CONFIG.minVersion.split('.').map(Number);
    
    if (currentMajor < minMajor || (currentMajor === minMajor && currentMinor < minMinor)) {
      logger.warn(`MK-Auth version ${version} is below minimum required ${MKAUTH_SYNC_CONFIG.minVersion}`);
      return false;
    }
    
    return true;
  } catch (error) {
    logger.warn('Could not check MK-Auth version', { error: error.message });
    return true; // Allow sync if version check fails
  }
}

/**
 * Sync customers from MK-Auth
 */
async function syncCustomers(provider, client) {
  logger.info('Starting MK-Auth customer sync', { providerId: provider._id });
  
  try {
    const customers = await fetchAllPages(client, '/api/v1/clientes');
    
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
                contato: customer.contato
              },
              source: 'mkauth',
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
    
    logger.info('MK-Auth customer sync completed', {
      providerId: provider._id,
      synced: syncedCount,
      upserted: result.upsertedCount,
      modified: result.modifiedCount
    });
    
    return syncedCount;
  } catch (error) {
    logger.error('MK-Auth customer sync failed', {
      providerId: provider._id,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Sync invoices from MK-Auth
 */
async function syncInvoices(provider, client) {
  logger.info('Starting MK-Auth invoice sync', { providerId: provider._id });
  
  try {
    const invoices = await fetchAllPages(client, '/api/v1/faturas');
    
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
              source: 'mkauth',
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
    
    logger.info('MK-Auth invoice sync completed', {
      providerId: provider._id,
      synced: syncedCount,
      upserted: result.upsertedCount,
      modified: result.modifiedCount
    });
    
    return syncedCount;
  } catch (error) {
    logger.error('MK-Auth invoice sync failed', {
      providerId: provider._id,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Sync service orders from MK-Auth
 */
async function syncServiceOrders(provider, client) {
  logger.info('Starting MK-Auth service order sync', { providerId: provider._id });
  
  try {
    const orders = await fetchAllPages(client, '/api/v1/chamados');
    
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
              source: 'mkauth',
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
    
    logger.info('MK-Auth service order sync completed', {
      providerId: provider._id,
      synced: syncedCount,
      upserted: result.upsertedCount,
      modified: result.modifiedCount
    });
    
    return syncedCount;
  } catch (error) {
    logger.error('MK-Auth service order sync failed', {
      providerId: provider._id,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Map MK-Auth customer status
 */
function mapCustomerStatus(status) {
  if (!status) return 'active';
  const statusLower = status.toLowerCase();
  if (statusLower.includes('ativo') || statusLower === 'active' || status === 'A' || status === '1') return 'active';
  if (statusLower.includes('suspenso') || statusLower === 'suspended' || status === 'S') return 'suspended';
  if (statusLower.includes('cancelado') || statusLower === 'cancelled' || status === 'C') return 'inactive';
  if (statusLower.includes('inativo') || statusLower === 'inactive' || status === 'I') return 'inactive';
  return 'active';
}

/**
 * Map MK-Auth invoice status
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
 * Map MK-Auth service order status
 */
function mapServiceOrderStatus(status) {
  if (!status) return 'open';
  const statusLower = status.toLowerCase();
  if (statusLower.includes('aberto') || statusLower === 'open' || status === 'O') return 'open';
  if (statusLower.includes('progresso') || statusLower === 'in_progress' || status === 'P') return 'in_progress';
  if (statusLower.includes('fechado') || statusLower.includes('completo') || statusLower === 'completed' || status === 'F') return 'completed';
  if (statusLower.includes('cancelado') || statusLower === 'cancelled' || status === 'C') return 'cancelled';
  return 'open';
}

/**
 * Map priority
 */
function mapPriority(priority) {
  if (!priority) return 'medium';
  const priorityLower = priority.toString().toLowerCase();
  if (priorityLower.includes('baixa') || priorityLower === 'low' || priority === 'B' || priority === '1') return 'low';
  if (priorityLower.includes('media') || priorityLower === 'medium' || priority === 'M' || priority === '2') return 'medium';
  if (priorityLower.includes('alta') || priorityLower === 'high' || priority === 'A' || priority === '3') return 'high';
  if (priorityLower.includes('critica') || priorityLower === 'critical' || priority === 'C' || priority === '4') return 'critical';
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
 * Validate MK-Auth credentials and version
 */
async function validate(provider) {
  try {
    if (!provider.config.url || !provider.config.token) {
      return {
        ok: false,
        message: 'Missing required config: url and token'
      };
    }
    
    const client = createMKAuthClient(provider.config.url, provider.config.token);
    
    // Check version first
    const isVersionOk = await checkVersion(client);
    if (!isVersionOk) {
      return {
        ok: false,
        message: `MK-Auth version is below minimum required ${MKAUTH_SYNC_CONFIG.minVersion}`
      };
    }
    
    // Test API access
    await makeRequest(client, '/api/v1/clientes', 1);
    
    return {
      ok: true,
      message: 'MK-Auth credentials validated successfully'
    };
  } catch (error) {
    logger.error('MK-Auth validation failed', { error: error.message });
    return {
      ok: false,
      message: `MK-Auth validation failed: ${error.message}`
    };
  }
}

/**
 * Full sync of all entities
 */
async function syncAll(provider) {
  logger.info('Starting full MK-Auth sync', { providerId: provider._id, provider: provider.name });
  
  const results = {
    customers: 0,
    invoices: 0,
    serviceOrders: 0,
    errors: 0
  };
  
  try {
    const client = createMKAuthClient(provider.config.url, provider.config.token);
    
    // Check version compatibility
    const isVersionOk = await checkVersion(client);
    if (!isVersionOk) {
      logger.error('MK-Auth version incompatible', {
        providerId: provider._id,
        minVersion: MKAUTH_SYNC_CONFIG.minVersion
      });
      results.errors++;
      throw new Error(`MK-Auth version below minimum required ${MKAUTH_SYNC_CONFIG.minVersion}`);
    }
    
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
    
    logger.info('MK-Auth full sync completed', { providerId: provider._id, results });
    return results;
  } catch (error) {
    logger.error('MK-Auth full sync failed', {
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
