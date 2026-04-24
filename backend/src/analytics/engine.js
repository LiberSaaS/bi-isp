import mongoose from 'mongoose';
import { Customer, Invoice, ServiceOrder, Provider } from '../models/index.js';
import logger from '../utils/logger.js';

/**
 * Convert string ID to mongoose ObjectId for use in aggregate pipelines.
 * Mongoose .find() auto-casts strings to ObjectId, but .aggregate() does not.
 */
function toObjectId(id) {
  if (id instanceof mongoose.Types.ObjectId) return id;
  return new mongoose.Types.ObjectId(id);
}

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
      const oid = toObjectId(providerId);
      const now = new Date();
      const startDate = new Date(now.getTime() - period * 24 * 60 * 60 * 1000);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      // Fetch all data in parallel (use ObjectId for aggregate pipelines)
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
        this._getActiveCustomersCount(oid),
        this._getChurnRate(oid, startDate, period),
        this._getDefaultRate(oid, startDate, period),
        this._getOpenServiceOrders(oid),
        this._getActivationsThisMonth(oid, monthStart),
        this._getMRR(oid),
        this._getMonthlyRevenue(oid, period),
        this._getCustomerEvolution(oid, period),
        this._getPlanDistribution(oid),
        this._getDefaultVsRevenue(oid, period)
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
   * Get commercial metrics for a provider (activations, cancellations, status, plans)
   * @param {string} providerId - MongoDB ObjectId
   * @param {number} period - Days to analyse (default 30)
   */
  async getCommercialMetrics(providerId, period = 30) {
    try {
      const oid = toObjectId(providerId);
      const now = new Date();
      const startDate = new Date(now.getTime() - period * 24 * 60 * 60 * 1000);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [
        totalCustomers,
        activeCustomers,
        statusDist,
        activationsMonth,
        activationsByMonth,
        cancellationsByMonth,
        planDistribution,
        planRevenue,
        suspendedCount,
      ] = await Promise.all([
        Customer.countDocuments({ providerId: oid }),
        Customer.countDocuments({ providerId: oid, status: 'active' }),
        // Status distribution
        Customer.aggregate([
          { $match: { providerId: oid } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]),
        // Activations this month
        Customer.countDocuments({
          providerId: oid,
          activationDate: { $gte: monthStart, $lte: now }
        }),
        // Activations by month (evolution)
        Customer.aggregate([
          { $match: { providerId: oid, activationDate: { $ne: null } } },
          {
            $group: {
              _id: {
                year: { $year: '$activationDate' },
                month: { $month: '$activationDate' }
              },
              count: { $sum: 1 }
            }
          },
          { $sort: { '_id.year': 1, '_id.month': 1 } },
          {
            $project: {
              _id: 0,
              date: { $dateFromParts: { year: '$_id.year', month: '$_id.month', day: 1 } },
              count: 1
            }
          }
        ]),
        // Cancellations by month
        Customer.aggregate([
          { $match: { providerId: oid, cancellationDate: { $ne: null } } },
          {
            $group: {
              _id: {
                year: { $year: '$cancellationDate' },
                month: { $month: '$cancellationDate' }
              },
              count: { $sum: 1 }
            }
          },
          { $sort: { '_id.year': 1, '_id.month': 1 } },
          {
            $project: {
              _id: 0,
              date: { $dateFromParts: { year: '$_id.year', month: '$_id.month', day: 1 } },
              count: 1
            }
          }
        ]),
        // Plan distribution (active customers only)
        Customer.aggregate([
          { $match: { providerId: oid, status: 'active' } },
          { $group: { _id: '$plan.name', count: { $sum: 1 }, revenue: { $sum: '$plan.price' } } },
          { $sort: { count: -1 } },
          { $project: { _id: 0, planName: '$_id', customerCount: '$count', revenue: 1 } }
        ]),
        // Plan revenue totals
        Customer.aggregate([
          { $match: { providerId: oid, status: 'active' } },
          { $group: { _id: null, totalRevenue: { $sum: '$plan.price' }, avgPrice: { $avg: '$plan.price' } } }
        ]),
        // Suspended count
        Customer.countDocuments({ providerId: oid, status: 'suspended' }),
      ]);

      const cancelledTotal = await Customer.countDocuments({ providerId: oid, status: 'cancelled' });

      return {
        totalCustomers,
        activeCustomers,
        suspendedCount,
        cancelledTotal,
        activationsMonth,
        statusDistribution: statusDist.map(s => ({ status: s._id, count: s.count })),
        activationsByMonth,
        cancellationsByMonth,
        planDistribution,
        totalPlanRevenue: planRevenue.length > 0 ? planRevenue[0].totalRevenue : 0,
        avgPlanPrice: planRevenue.length > 0 ? parseFloat(planRevenue[0].avgPrice?.toFixed(2) || 0) : 0,
        period,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error calculating commercial metrics', { providerId, error: error.message });
      throw error;
    }
  }

  /* ═══════════════════════════════════════════════════════════════
   * GEOGRAPHIC ANALYTICS
   * ═══════════════════════════════════════════════════════════════ */

  async getGeographicMetrics(providerId) {
    try {
      const oid = toObjectId(providerId);

      const [
        byCity,
        byNeighborhood,
        activationsByCity,
        statusByCity,
        revenueByCity,
      ] = await Promise.all([
        // Clients per city
        Customer.aggregate([
          { $match: { providerId: oid } },
          { $group: { _id: '$address.city', total: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } }, cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } }, suspended: { $sum: { $cond: [{ $eq: ['$status', 'suspended'] }, 1, 0] } } } },
          { $sort: { total: -1 } },
          { $project: { _id: 0, city: '$_id', total: 1, active: 1, cancelled: 1, suspended: 1 } }
        ]),
        // Clients per neighborhood
        Customer.aggregate([
          { $match: { providerId: oid } },
          { $group: { _id: { city: '$address.city', neighborhood: '$address.neighborhood' }, total: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } } } },
          { $sort: { total: -1 } },
          { $limit: 50 },
          { $project: { _id: 0, city: '$_id.city', neighborhood: '$_id.neighborhood', total: 1, active: 1 } }
        ]),
        // Activations by city (this month)
        Customer.aggregate([
          { $match: { providerId: oid, activationDate: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } },
          { $group: { _id: '$address.city', activations: { $sum: 1 } } },
          { $sort: { activations: -1 } },
          { $project: { _id: 0, city: '$_id', activations: 1 } }
        ]),
        // Status distribution by city
        Customer.aggregate([
          { $match: { providerId: oid } },
          { $group: { _id: { city: '$address.city', status: '$status' }, count: { $sum: 1 } } },
          { $sort: { '_id.city': 1, count: -1 } },
          { $project: { _id: 0, city: '$_id.city', status: '$_id.status', count: 1 } }
        ]),
        // Revenue potential by city (sum of plan prices for active customers)
        Customer.aggregate([
          { $match: { providerId: oid, status: 'active' } },
          { $group: { _id: '$address.city', revenue: { $sum: '$plan.price' }, avgTicket: { $avg: '$plan.price' }, count: { $sum: 1 } } },
          { $sort: { revenue: -1 } },
          { $project: { _id: 0, city: '$_id', revenue: 1, avgTicket: { $round: ['$avgTicket', 2] }, count: 1 } }
        ]),
      ]);

      return {
        byCity,
        byNeighborhood,
        activationsByCity,
        statusByCity,
        revenueByCity,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error calculating geographic metrics', { providerId, error: error.message });
      throw error;
    }
  }

  /* ═══════════════════════════════════════════════════════════════
   * CHURN ANALYTICS
   * ═══════════════════════════════════════════════════════════════ */

  async getChurnMetrics(providerId, period = 90) {
    try {
      const oid = toObjectId(providerId);
      const now = new Date();
      const startDate = new Date(now.getTime() - period * 24 * 60 * 60 * 1000);

      const [
        churnByMonth,
        churnByPlan,
        churnByCity,
        churnReasons,
        customerLifetime,
        activeCount,
        cancelledInPeriod,
        suspendedCount,
        totalCustomers,
      ] = await Promise.all([
        // Cancellations by month
        Customer.aggregate([
          { $match: { providerId: oid, cancellationDate: { $ne: null } } },
          { $group: { _id: { year: { $year: '$cancellationDate' }, month: { $month: '$cancellationDate' } }, count: { $sum: 1 } } },
          { $sort: { '_id.year': 1, '_id.month': 1 } },
          { $project: { _id: 0, date: { $dateFromParts: { year: '$_id.year', month: '$_id.month', day: 1 } }, count: 1 } }
        ]),
        // Churn by plan
        Customer.aggregate([
          { $match: { providerId: oid, status: 'cancelled' } },
          { $group: { _id: '$plan.name', cancelled: { $sum: 1 } } },
          { $sort: { cancelled: -1 } },
          { $project: { _id: 0, plan: '$_id', cancelled: 1 } }
        ]),
        // Churn by city
        Customer.aggregate([
          { $match: { providerId: oid, status: 'cancelled' } },
          { $group: { _id: '$address.city', cancelled: { $sum: 1 } } },
          { $sort: { cancelled: -1 } },
          { $project: { _id: 0, city: '$_id', cancelled: 1 } }
        ]),
        // Cancellation reasons
        Customer.aggregate([
          { $match: { providerId: oid, cancellationReason: { $ne: null, $ne: '' } } },
          { $group: { _id: '$cancellationReason', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $project: { _id: 0, reason: '$_id', count: 1 } }
        ]),
        // Average customer lifetime (activation to cancellation, in days)
        Customer.aggregate([
          { $match: { providerId: oid, activationDate: { $ne: null }, cancellationDate: { $ne: null } } },
          { $project: { lifetime: { $divide: [{ $subtract: ['$cancellationDate', '$activationDate'] }, 86400000] } } },
          { $group: { _id: null, avgDays: { $avg: '$lifetime' }, minDays: { $min: '$lifetime' }, maxDays: { $max: '$lifetime' }, count: { $sum: 1 } } }
        ]),
        Customer.countDocuments({ providerId: oid, status: 'active' }),
        Customer.countDocuments({ providerId: oid, status: 'cancelled', cancellationDate: { $gte: startDate } }),
        Customer.countDocuments({ providerId: oid, status: 'suspended' }),
        Customer.countDocuments({ providerId: oid }),
      ]);

      const churnRate = activeCount > 0 ? (cancelledInPeriod / (activeCount + cancelledInPeriod)) * 100 : 0;
      const lifetime = customerLifetime.length > 0 ? customerLifetime[0] : { avgDays: 0, minDays: 0, maxDays: 0, count: 0 };

      return {
        churnRate: parseFloat(churnRate.toFixed(2)),
        totalCustomers,
        activeCount,
        cancelledInPeriod,
        suspendedCount,
        avgLifetimeDays: Math.round(lifetime.avgDays || 0),
        avgLifetimeMonths: parseFloat(((lifetime.avgDays || 0) / 30).toFixed(1)),
        churnByMonth,
        churnByPlan,
        churnByCity,
        churnReasons,
        period,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error calculating churn metrics', { providerId, error: error.message });
      throw error;
    }
  }

  /* ═══════════════════════════════════════════════════════════════
   * PLAN PORTFOLIO ANALYTICS
   * ═══════════════════════════════════════════════════════════════ */

  async getPlanMetrics(providerId) {
    try {
      const oid = toObjectId(providerId);

      const [
        planOverview,
        planByStatus,
        speedDistribution,
        technologyDistribution,
        planPriceRanges,
        topPlansByRevenue,
      ] = await Promise.all([
        // Plan overview (all customers)
        Customer.aggregate([
          { $match: { providerId: oid } },
          { $group: { _id: '$plan.name', total: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } }, cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } }, suspended: { $sum: { $cond: [{ $eq: ['$status', 'suspended'] }, 1, 0] } }, avgPrice: { $avg: '$plan.price' }, totalRevenue: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, '$plan.price', 0] } } } },
          { $sort: { active: -1 } },
          { $project: { _id: 0, plan: '$_id', total: 1, active: 1, cancelled: 1, suspended: 1, avgPrice: { $round: ['$avgPrice', 2] }, totalRevenue: { $round: ['$totalRevenue', 2] }, churnRate: { $cond: [{ $gt: ['$total', 0] }, { $round: [{ $multiply: [{ $divide: ['$cancelled', '$total'] }, 100] }, 2] }, 0] } } }
        ]),
        // Customers per plan per status
        Customer.aggregate([
          { $match: { providerId: oid } },
          { $group: { _id: { plan: '$plan.name', status: '$status' }, count: { $sum: 1 } } },
          { $project: { _id: 0, plan: '$_id.plan', status: '$_id.status', count: 1 } }
        ]),
        // Download speed distribution
        Customer.aggregate([
          { $match: { providerId: oid, status: 'active', 'plan.downloadSpeed': { $gt: 0 } } },
          { $group: { _id: '$plan.downloadSpeed', count: { $sum: 1 }, planName: { $first: '$plan.name' } } },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, speed: '$_id', count: 1, planName: 1 } }
        ]),
        // Technology distribution (from plan name patterns)
        Customer.aggregate([
          { $match: { providerId: oid, status: 'active' } },
          { $group: { _id: '$plan.name', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $project: { _id: 0, plan: '$_id', count: 1 } }
        ]),
        // Price range distribution
        Customer.aggregate([
          { $match: { providerId: oid, status: 'active', 'plan.price': { $gt: 0 } } },
          {
            $bucket: {
              groupBy: '$plan.price',
              boundaries: [0, 50, 80, 100, 130, 150, 200, 300, 500, 10000],
              default: 'Outros',
              output: { count: { $sum: 1 }, avgSpeed: { $avg: '$plan.downloadSpeed' } }
            }
          }
        ]),
        // Top plans by revenue
        Customer.aggregate([
          { $match: { providerId: oid, status: 'active' } },
          { $group: { _id: '$plan.name', revenue: { $sum: '$plan.price' }, count: { $sum: 1 }, avgPrice: { $avg: '$plan.price' }, avgSpeed: { $avg: '$plan.downloadSpeed' } } },
          { $sort: { revenue: -1 } },
          { $limit: 15 },
          { $project: { _id: 0, plan: '$_id', revenue: { $round: ['$revenue', 2] }, count: 1, avgPrice: { $round: ['$avgPrice', 2] }, avgSpeed: { $round: ['$avgSpeed', 0] } } }
        ]),
      ]);

      // Overall stats
      const totalActive = await Customer.countDocuments({ providerId: oid, status: 'active' });
      const totalMRR = topPlansByRevenue.reduce((s, p) => s + p.revenue, 0);
      const avgARPU = totalActive > 0 ? totalMRR / totalActive : 0;
      const uniquePlans = planOverview.length;

      return {
        totalActive,
        totalMRR: parseFloat(totalMRR.toFixed(2)),
        avgARPU: parseFloat(avgARPU.toFixed(2)),
        uniquePlans,
        planOverview,
        planByStatus,
        speedDistribution,
        technologyDistribution,
        planPriceRanges,
        topPlansByRevenue,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error calculating plan metrics', { providerId, error: error.message });
      throw error;
    }
  }

  /* ═══════════════════════════════════════════════════════════════
   * OVERVIEW / VISÃO GERAL (Smart Insights)
   * ═══════════════════════════════════════════════════════════════ */

  async getOverviewMetrics(providerId) {
    try {
      const oid = toObjectId(providerId);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      const weekAgo = new Date(now.getTime() - 7 * 86400000);

      const [
        totalCustomers,
        activeCustomers,
        suspendedCustomers,
        cancelledCustomers,
        activationsToday,
        activationsMonth,
        activationsLastMonth,
        cancellationsMonth,
        cancellationsLastMonth,
        mrrData,
        invoiceStats,
        topCities,
        topPlans,
        recentActivations,
        recentCancellations,
      ] = await Promise.all([
        Customer.countDocuments({ providerId: oid }),
        Customer.countDocuments({ providerId: oid, status: 'active' }),
        Customer.countDocuments({ providerId: oid, status: 'suspended' }),
        Customer.countDocuments({ providerId: oid, status: 'cancelled' }),
        Customer.countDocuments({ providerId: oid, activationDate: { $gte: today } }),
        Customer.countDocuments({ providerId: oid, activationDate: { $gte: monthStart } }),
        Customer.countDocuments({ providerId: oid, activationDate: { $gte: lastMonthStart, $lte: lastMonthEnd } }),
        Customer.countDocuments({ providerId: oid, cancellationDate: { $gte: monthStart } }),
        Customer.countDocuments({ providerId: oid, cancellationDate: { $gte: lastMonthStart, $lte: lastMonthEnd } }),
        // MRR
        Customer.aggregate([
          { $match: { providerId: oid, status: 'active' } },
          { $group: { _id: null, mrr: { $sum: '$plan.price' } } }
        ]),
        // Invoice stats (period)
        Invoice.aggregate([
          { $match: { providerId: oid, dueDate: { $gte: monthStart } } },
          { $group: { _id: '$status', total: { $sum: '$amount' }, count: { $sum: 1 } } }
        ]),
        // Top 5 cities
        Customer.aggregate([
          { $match: { providerId: oid, status: 'active' } },
          { $group: { _id: '$address.city', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 },
          { $project: { _id: 0, city: '$_id', count: 1 } }
        ]),
        // Top 5 plans
        Customer.aggregate([
          { $match: { providerId: oid, status: 'active' } },
          { $group: { _id: '$plan.name', count: { $sum: 1 }, revenue: { $sum: '$plan.price' } } },
          { $sort: { count: -1 } },
          { $limit: 5 },
          { $project: { _id: 0, plan: '$_id', count: 1, revenue: { $round: ['$revenue', 2] } } }
        ]),
        // Recent activations (last 10)
        Customer.find({ providerId: oid, activationDate: { $ne: null } })
          .sort({ activationDate: -1 }).limit(10)
          .select('name plan.name address.city activationDate status').lean(),
        // Recent cancellations (last 10)
        Customer.find({ providerId: oid, cancellationDate: { $ne: null } })
          .sort({ cancellationDate: -1 }).limit(10)
          .select('name plan.name address.city cancellationDate cancellationReason status').lean(),
      ]);

      const mrr = mrrData.length > 0 ? mrrData[0].mrr : 0;
      const arpu = activeCustomers > 0 ? mrr / activeCustomers : 0;
      const netGrowthMonth = activationsMonth - cancellationsMonth;
      const netGrowthLastMonth = activationsLastMonth - cancellationsLastMonth;
      const churnRateMonth = activeCustomers > 0 ? (cancellationsMonth / (activeCustomers + cancellationsMonth)) * 100 : 0;

      // Generate smart insights
      const insights = [];
      if (cancellationsMonth > cancellationsLastMonth * 1.2) {
        insights.push({ type: 'danger', msg: `Churn subiu ${((cancellationsMonth / Math.max(cancellationsLastMonth, 1) - 1) * 100).toFixed(0)}% em relacao ao mes anterior` });
      }
      if (activationsMonth < activationsLastMonth * 0.8 && activationsLastMonth > 0) {
        insights.push({ type: 'warning', msg: `Ativacoes caíram ${((1 - activationsMonth / activationsLastMonth) * 100).toFixed(0)}% vs mes anterior` });
      }
      if (activationsMonth > activationsLastMonth * 1.2 && activationsLastMonth > 0) {
        insights.push({ type: 'success', msg: `Ativacoes subiram ${((activationsMonth / activationsLastMonth - 1) * 100).toFixed(0)}% vs mes anterior` });
      }
      if (churnRateMonth > 5) {
        insights.push({ type: 'danger', msg: `Churn rate de ${churnRateMonth.toFixed(1)}% esta acima da meta de 5%` });
      }
      if (netGrowthMonth < 0) {
        insights.push({ type: 'danger', msg: `Saldo negativo: ${Math.abs(netGrowthMonth)} clientes a menos este mes` });
      } else if (netGrowthMonth > 0) {
        insights.push({ type: 'success', msg: `Crescimento líquido: +${netGrowthMonth} clientes este mes` });
      }
      const suspendedPct = totalCustomers > 0 ? (suspendedCustomers / totalCustomers * 100) : 0;
      if (suspendedPct > 10) {
        insights.push({ type: 'warning', msg: `${suspendedPct.toFixed(1)}% da base esta suspensa — risco de churn` });
      }

      return {
        totalCustomers,
        activeCustomers,
        suspendedCustomers,
        cancelledCustomers,
        activationsToday,
        activationsMonth,
        activationsLastMonth,
        cancellationsMonth,
        cancellationsLastMonth,
        netGrowthMonth,
        netGrowthLastMonth,
        mrr: parseFloat(mrr.toFixed(2)),
        arpu: parseFloat(arpu.toFixed(2)),
        churnRateMonth: parseFloat(churnRateMonth.toFixed(2)),
        invoiceStats,
        topCities,
        topPlans,
        recentActivations,
        recentCancellations,
        insights,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error calculating overview metrics', { providerId, error: error.message });
      throw error;
    }
  }

  /* ═══════════════════════════════════════════════════════════════
   * SERVICE ORDER ANALYTICS
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * Get comprehensive service order metrics for a provider
   * @param {string} providerId - MongoDB ObjectId of the provider
   * @param {number} period - Number of days to analyze (default 90)
   * @returns {Promise<Object>} Service order metrics
   */
  async getServiceOrderMetrics(providerId, period = 90) {
    try {
      const oid = toObjectId(providerId);
      const now = new Date();
      const startDate = new Date(now.getTime() - period * 24 * 60 * 60 * 1000);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [
        totalOrders,
        openOrders,
        inProgressOrders,
        completedOrders,
        cancelledOrders,
        openedThisMonth,
        closedThisMonth,
        byCategory,
        byStatus,
        byPriority,
        byMonth,
        avgResolutionTime,
        topCustomers,
        recentOrders
      ] = await Promise.all([
        // Totals
        ServiceOrder.countDocuments({ providerId: oid }),
        ServiceOrder.countDocuments({ providerId: oid, status: 'open' }),
        ServiceOrder.countDocuments({ providerId: oid, status: 'in_progress' }),
        ServiceOrder.countDocuments({ providerId: oid, status: 'completed' }),
        ServiceOrder.countDocuments({ providerId: oid, status: 'cancelled' }),

        // This month
        ServiceOrder.countDocuments({
          providerId: oid,
          openedAt: { $gte: monthStart, $lte: now }
        }),
        ServiceOrder.countDocuments({
          providerId: oid,
          closedAt: { $gte: monthStart, $lte: now },
          status: 'completed'
        }),

        // Distribution by category/description (used as subject/assunto)
        ServiceOrder.aggregate([
          { $match: { providerId: oid } },
          {
            $group: {
              _id: { $ifNull: ['$description', '$category'] },
              total: { $sum: 1 },
              open: { $sum: { $cond: [{ $in: ['$status', ['open', 'in_progress']] }, 1, 0] } },
              completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
              cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } }
            }
          },
          { $sort: { total: -1 } },
          { $limit: 30 },
          {
            $project: {
              _id: 0,
              subject: { $ifNull: ['$_id', 'Sem Assunto'] },
              total: 1,
              open: 1,
              completed: 1,
              cancelled: 1
            }
          }
        ]),

        // Distribution by status
        ServiceOrder.aggregate([
          { $match: { providerId: oid } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $project: { _id: 0, status: '$_id', count: 1 } }
        ]),

        // Distribution by priority
        ServiceOrder.aggregate([
          { $match: { providerId: oid } },
          { $group: { _id: '$priority', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $project: { _id: 0, priority: '$_id', count: 1 } }
        ]),

        // O.S. opened/closed by month
        ServiceOrder.aggregate([
          { $match: { providerId: oid, openedAt: { $gte: startDate } } },
          {
            $group: {
              _id: {
                year: { $year: '$openedAt' },
                month: { $month: '$openedAt' }
              },
              opened: { $sum: 1 },
              closed: {
                $sum: { $cond: [{ $ne: ['$closedAt', null] }, 1, 0] }
              }
            }
          },
          { $sort: { '_id.year': 1, '_id.month': 1 } },
          {
            $project: {
              _id: 0,
              date: { $dateFromParts: { year: '$_id.year', month: '$_id.month', day: 1 } },
              opened: 1,
              closed: 1
            }
          }
        ]),

        // Average resolution time (completed orders)
        ServiceOrder.aggregate([
          {
            $match: {
              providerId: oid,
              status: 'completed',
              resolutionTimeMinutes: { $ne: null, $gt: 0 }
            }
          },
          {
            $group: {
              _id: null,
              avgMinutes: { $avg: '$resolutionTimeMinutes' },
              minMinutes: { $min: '$resolutionTimeMinutes' },
              maxMinutes: { $max: '$resolutionTimeMinutes' }
            }
          }
        ]),

        // Top customers with most open O.S. (alert list)
        ServiceOrder.aggregate([
          {
            $match: {
              providerId: oid,
              status: { $in: ['open', 'in_progress'] }
            }
          },
          {
            $group: {
              _id: '$customerId',
              openCount: { $sum: 1 },
              orders: {
                $push: {
                  description: '$description',
                  category: '$category',
                  priority: '$priority',
                  status: '$status',
                  openedAt: '$openedAt'
                }
              }
            }
          },
          { $sort: { openCount: -1 } },
          { $limit: 20 },
          {
            $lookup: {
              from: 'customers',
              localField: '_id',
              foreignField: '_id',
              as: 'customer'
            }
          },
          { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 0,
              customerId: '$_id',
              customerName: { $ifNull: ['$customer.name', 'Cliente Desconhecido'] },
              customerDocument: '$customer.document',
              customerPlan: '$customer.plan.name',
              openCount: 1,
              orders: 1
            }
          }
        ]),

        // Recent service orders (last 50)
        ServiceOrder.aggregate([
          { $match: { providerId: oid } },
          { $sort: { openedAt: -1 } },
          { $limit: 50 },
          {
            $lookup: {
              from: 'customers',
              localField: 'customerId',
              foreignField: '_id',
              as: 'customer'
            }
          },
          { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 0,
              externalId: 1,
              description: 1,
              category: 1,
              type: 1,
              priority: 1,
              status: 1,
              openedAt: 1,
              closedAt: 1,
              resolutionTimeMinutes: 1,
              customerName: { $ifNull: ['$customer.name', 'N/A'] },
              customerDocument: '$customer.document'
            }
          }
        ])
      ]);

      const resTime = avgResolutionTime.length > 0 ? avgResolutionTime[0] : {};

      return {
        totalOrders,
        openOrders,
        inProgressOrders,
        completedOrders,
        cancelledOrders,
        openedThisMonth,
        closedThisMonth,
        byCategory,
        byStatus,
        byPriority,
        byMonth,
        avgResolutionMinutes: resTime.avgMinutes ? Math.round(resTime.avgMinutes) : 0,
        minResolutionMinutes: resTime.minMinutes || 0,
        maxResolutionMinutes: resTime.maxMinutes || 0,
        topCustomers,
        recentOrders,
        period,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error calculating service order metrics', { providerId, error: error.message });
      throw error;
    }
  }

  /**
   * Get health metrics for a provider
   * @param {string} providerId - MongoDB ObjectId of the provider
   * @returns {Promise<Object>} Health status
   */
  async getHealthMetrics(providerId) {
    try {
      const oid = toObjectId(providerId);
      const provider = await Provider.findById(oid);
      if (!provider) {
        throw new Error('Provider not found');
      }

      const [customers, invoices, serviceOrders] = await Promise.all([
        Customer.countDocuments({ providerId: oid }),
        Invoice.countDocuments({ providerId: oid }),
        ServiceOrder.countDocuments({ providerId: oid })
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
