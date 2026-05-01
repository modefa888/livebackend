const logger = require('../utils/log-utils');
const pool = require('../config/db');

// 影视资源聚合服务
class VodSourceAggregator {
  constructor() {
    this.sourceCache = new Map();
  }

  // 获取聚合后的影视资源列表（去重，只保留最好的源）
  async getAggregatedSources(limit = 50) {
    try {
      const conn = await pool.getConnection();
      try {
        const [sources] = await conn.execute(
          'SELECT * FROM fabubot_vod_sources WHERE deleted = 0 ORDER BY CASE WHEN ping IS NULL THEN 1 ELSE 0 END, ping ASC, sort ASC, created_at DESC'
        );

        if (sources.length === 0) {
          return [];
        }

        // 根据域名去重，保留延迟最低的源
        const aggregated = [];
        const seenDomains = new Set();

        for (const source of sources) {
          const domain = this.getDomainFromUrl(source.url);
          
          if (!seenDomains.has(domain) && source.enabled === 1 && source.ping !== null) {
            seenDomains.add(domain);
            aggregated.push(source);
            
            if (aggregated.length >= limit) {
              break;
            }
          }
        }

        logger.info(`聚合影视资源: ${sources.length} -> ${aggregated.length}`);
        return aggregated;

      } finally {
        conn.release();
      }
    } catch (error) {
      logger.error('聚合影视资源失败:', error);
      return [];
    }
  }

  // 获取按分组的源列表（同一域名多个源，只保留最快的）
  async getSourcesByDomain() {
    try {
      const conn = await pool.getConnection();
      try {
        const [sources] = await conn.execute(
          'SELECT * FROM fabubot_vod_sources WHERE deleted = 0 ORDER BY CASE WHEN ping IS NULL THEN 1 ELSE 0 END, ping ASC'
        );

        // 按域名分组
        const domainMap = new Map();

        for (const source of sources) {
          const domain = this.getDomainFromUrl(source.url);
          
          if (!domainMap.has(domain)) {
            domainMap.set(domain, {
              domain: domain,
              sources: [source],
              bestSource: source
            });
          } else {
            const group = domainMap.get(domain);
            group.sources.push(source);
            
            // 如果有更快的源，更新最佳源
            if (source.ping !== null && 
                (group.bestSource.ping === null || source.ping < group.bestSource.ping)) {
              group.bestSource = source;
            }
          }
        }

        // 转为数组并按最佳源延迟排序
        return Array.from(domainMap.values())
          .sort((a, b) => {
            if (a.bestSource.ping === null) return 1;
            if (b.bestSource.ping === null) return -1;
            return a.bestSource.ping - b.bestSource.ping;
          });

      } finally {
        conn.release();
      }
    } catch (error) {
      logger.error('获取按域名分组的源失败:', error);
      return [];
    }
  }

  // 从URL获取域名
  getDomainFromUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      // 如果解析失败，尝试用正则
      const match = url.match(/^(?:https?:\/\/)?(?:[^@\n]+@)?(?:www\.)?([^:/\n]+)/i);
      return match ? match[1] : url;
    }
  }
}

let instance = null;

function getVodSourceAggregator() {
  if (!instance) {
    instance = new VodSourceAggregator();
  }
  return instance;
}

module.exports = {
  getVodSourceAggregator
};
