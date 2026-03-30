import { Customer, Invoice, ServiceOrder, Provider } from '../models/index.js';
import logger from '../utils/logger.js';

/**
 * Analytics Engine for ISP BI
 * Calculates KPIs from MongoDB data using aggregation pipelines
 */
class AnalyticsEngine {
  /**
   * Get comprehensive metrics for a provider
   * @param {string} providerId - MongoDB ObjectId of the provider
   * @param {number} period - Number of days to analyze (default 30)
   * @returns {Promise<Object>} Metrics object with all KPIs
   */
  async getMetrics(providerId, period = 30) {
    try {
      const now = new Date();
      const startDate = new Date(now.getTime() - period * 24 * 60 * 60 * 1000);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      // Fetch all data in parallel
      const [
        activeCustomers,
        churnData,
        defaultData,
        openServiceOrders,
        activationsThisMonth,
        mrrData,
        revenueData,
        customerEvolution,
        planDistribution,
        defaultVsRevenue
      ] = await Promise.all([
        this._getActiveCustomersCount(providerId),
        this._getChurnRate(providerId, startDate, period),
        this._getDefaultRate(providerId, startDate, period),
        this._getOpenServiceOrders(providerId),
        this._getActivationsThisMonth(providerId, monthStart),
        this._getMRR(providerId),
        this._getMonthlyRevenue(providerId, period),
        this._getCustomerEvolution(providerId, period),
        this._getPlanDistribution(providerId),
        this._getDefaultVsRevenue(providerId, period)
      ]);

      const mrr = mrrData.mrr || 0;
      const arpu = activeCustomers > 0 ? mrr / activeCustomers : 0;

      return {
        activeCustomers,
        churnRate: churnData.churnRate,
        defaultRate: defaultData.defaultRate,
        openServiceOrders,
        activationsThisMonth,
        mrr: parseFloat(mrr.toFixed(2)),
        arpu: parseFloat(arpu.toFixed(2)),
        revenueData,
        customerEvolution,
        planDistribution,
        defaultVsRevenue,
        period,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error calculating metrics', {
        providerId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get count of active customers
   * @private
   */
  async _getActiveCustomersCount(providerId) {
    const result = await Customer.aggregate([
      {
        $match: {
          providerId: providerId,
          status: 'active'
        }
      },
      {
        $count: 'total'
      }
    ]);

    return result.length > 0 ? result[0].total : 0;
  }

  /**
   * Calculate churn rate
   * Churn Rate = (Cancelled customers in period / Active customers at start) * 100
   * @private
   */
  async _getChurnRate(providerId, startDate, period) {
    // Get count of active customers at start of period
    const activeAtStart = await Customer.aggregate([
      {
        $match: {
          providerId: providerId,
          status: { $in: ['active', 'suspended'] },
          // CreatedAt before start date OR was already active
          $expr: {
            $lt: ['$createdAt', startDate]
          }
        }
      },
      {
        $count: 'total'
      }
    ]);

    const activeCount = activeAtStart.length > 0 ? activeAtStart[0].total : 0;

    // Get cancelled customers in period
    const cancelled = await Customer.aggregate([
      {
        $match: {
          providerId: providerId,
          status: 'cancelled',
          cancellationDate: {
            $gte: startDate,
            $lte: new Date()
          }
        }
      },
      {
        $count: 'total'
      }
    ]);

    const cancelledCount = cancelled.length > 0 ? cancelled[0].total : 0;

    const churnRate = activeCount > 0 ? (cancelledCount / activeCount) * 100 : 0;

    return {
      churnRate: parseFloat(churnRate.toFixed(2)),
      cancelledInPeriod: cancelledCount,
      activeAtStart: activeCount
    };
  }

  /**
   * Calculate default rate (inadimplência)
   * Default Rate = (Overdue invoices / Total invoices in period) * 100
   * @private
   */
  async _getDefaultRate(providerId, startDate, period) {
    // Get total invoices in period
    const totalInvoices = await Invoice.aggregate([
      {
        $match: {
          providerId: providerId,
          dueDate: {
            $gte: startDate,
            $lte: new Date()
          }
        }
      },
      {
        $count: 'total'
      }
    ]);

    const totalCount = totalInvoices.length > 0 ? totalInvoices[0].total : 0;

    // Get overdue invoices
    const overdueInvoices = await Invoice.aggregate([
      {
        $match: {
          providerId: providerId,
          status: 'overdue',
          dueDate: {
            $gte: startDate,
            $lte: new Date()
          }
        }
      },
      {
        $count: 'total'
      }
    ]);

    const overdueCount = overdueInvoices.length > 0 ? overdueInvoices[0].total : 0;

    const defaultRate = totalCount > 0 ? (overdueCount / totalCount) * 100 : 0;

    return {
      defaultRate: parseFloat(defaultRate.toFixed(2)),
      overdueCount,
      totalInvoices: totalCount
    };
  }

  /**
   * Get count of open service orders
   * @private
   */
  async _getOpenServiceOrders(providerId) {
    const result = await ServiceOrder.aggregate([
      {
        $match: {
          providerId: providerId,
          status: { $in: ['open', 'in_progress'] }
        }
      },
      {
        $count: 'total'
      }
    ]);

    return result.length > 0 ? result[0].total : 0;
  }

  /**
   * Get number of customer activations this month
   * @private
   */
  async _getActivationsThisMonth(providerId, monthStart) {
    const result = await Customer.aggregate([
      {
        $match: {
          providerId: providerId,
          activationDate: {
            $gte: monthStart,
            $lte: new Date()
          }
        }
      },
      {
        $count: 'total'
      }
    ]);

    return result.length > 0 ? result[0].total : 0;
  }

  /**
   * Calculate Monthly Recurring Revenue
   * MRR = Sum of all active customers' plan prices
   * @private
   */
  async _getMRR(providerId) {
    const result = await Customer.aggregate([
      {
        $match: {
          providerId: providerId,
          status: 'active'
        }
      },
      {
        $group: {
          _id: null,
          mrr: {
            $sum: '$plan.price'
          }
        }
      }
    ]);

    return {
      mrr: result.length > 0 ? result[0].mrr : 0
    };
  }

  /**
   * Get monthly revenue aggregation for charts
   * @private
   */
  async _getMonthlyRevenue(providerId, period) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - period);

    const result = await Invoice.aggregate([
      {
        $match: {
          providerId: providerId,
          createdAt: {
            $gte: startDate
          }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          totalAmount: { $sum: '$amount' },
          paidAmount: { $sum: '$paidAmount' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: {
          '_id.year': 1,
          '_id.month': 1
        }
      },
      {
        $project: {
          _id: 0,
          date: {
            $dateFromParts: {
              year: '$_id.year',
              month: '$_id.month',
              day: 1
            }
          },
          totalAmount: 1,
          paidAmount: 1,
          count: 1
        }
      }
    ]);

    return result;
  }

  /**
   * Get monthly active customer counts for evolution chart
   * @private
   */
  async _getCustomerEvolution(providerId, period) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - period);

    const result = await Customer.aggregate([
      {
        $match: {
          providerId: providerId,
          createdAt: {
            $lte: new Date()
          }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          activatedCount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'active'] }, 1, 0]
            }
          },
          cancelledCount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0]
            }
          }
        }
      },
      {
        $sort: {
          '_id.year': 1,
          '_id.month': 1
        }
      },
      {
        $project: {
          _id: 0,
          date: {
            $dateFromParts: {
              year: '$_id.year',
              month: '$_id.month',
              day: 1
            }
          },
          activatedCount: 1,
          cancelledCount: 1
        }
      }
    ]);

    return result;
  }

  /**
   * Get plan distribution for pie chart
   * @private
   */
  async _getPlanDistribution(providerId) {
    const result = await Customer.aggregate([
      {
        $match: {
          providerId: providerId,
          status: 'active'
        }
      },
      {
        $group: {
          _id: '$plan.name',
          count: { $sum: 1 },
          totalRevenue: { $sum: '$plan.price' }
        }
      },
      {
        $sort: {
          count: -1
        }
      },
      {
        $project: {
          _id: 0,
          planName: '$_id',
          customerCount: '$count',
          totalRevenue: '$totalRevenue'
        }
      }
    ]);

    return result;
  }

  /**
   * Get monthly comparison of billed vs overdue amounts
   * @private
   */
  async _getDefaultVsRevenue(providerId, period) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - period);

    const result = await Invoice.aggregate([
      {
        $match: {
          providerId: providerId,
          dueDate: {
            $gte: startDate
          }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$dueDate' },
            month: { $month: '$dueDate' }
          },
          totalBilled: {
            $sum: '$amount'
          },
          totalOverdue: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'overdue'] },
                '$amount',
                0
              ]
            }
          },
          totalPaid: { $sum: '$paidAmount' }
        }
      },
      {
        $sort: {
          '_id.year': 1,
          '_id.month': 1
        }
      },
      {
        $project: {
          _id: 0,
          date: {
            $dateFromParts: {
              year: '$_id.year',
              month: '$_id.month',
              day: 1
            }
          },
          totalBilled: 1,
          totalOverdue: 1,
          totalPaid: 1
        }
      }
    ]);

    return result;
  }

  /**
   * Get health metrics for a provider
   * @param {string} providerId - MongoDB ObjectId of the provider
   * @returns {Promise<Object>} Health status
   */
  async getHealthMetrics(providerId) {
    try {
      const provider = await Provider.findById(providerId);
      if (!provider) {
        throw new Error('Provider not found');
      }

      const [customers, invoices, serviceOrders] = await Promise.all([
        Customer.countDocuments({ providerId }),
        Invoice.countDocuments({ providerId }),
        ServiceOrder.countDocuments({ providerId })
      ]);

      const syncAgeMinutes = provider.syncAgeMinutes;
      const syncStale = syncAgeMinutes && syncAgeMinutes > 1440; // 24 hours

      return {
        providerId,
        providerName: provider.name,
        providerStatus: provider.active ? 'active' : 'inactive',
        lastSync: provider.lastSync,
        syncAgeMinutes,
        syncStale,
        lastSyncStatus: provider.lastSyncStatus,
        lastSyncError: provider.lastSyncError,
        dataPoints: {
          customers,
          invoices,
          serviceOrders
        }
      };
    } catch (error) {
      logger.error('Error getting health metrics', {
        providerId,
        error: error.message
      });
      throw error;
    }
  }
}

export default new AnalyticsEngine();
