const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
  region: "ap-shanghai",
});

const db = cloud.database();
const _ = db.command;

const CACHE_TTL_MS = 60 * 60 * 1000;
const memoryCache = new Map();

const getCache = (key) => {
  const hit = memoryCache.get(key);
  if (!hit) return null;
  if (hit.expireAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return hit.value;
};

const setCache = (key, value) => {
  memoryCache.set(key, { expireAt: Date.now() + CACHE_TTL_MS, value });
};

const fullField = () => ({
  _id: true,
  source: true,
  backgroundImage: true,
  image: true,
  translations: true,
  timestamp: true,
  batchDate: true,
  exportDate: true,
  day: true,
  dateKey: true
});

const briefField = () => ({
  _id: true,
  source: true,
  timestamp: true,
  batchDate: true,
  exportDate: true,
  day: true,
  dateKey: true
});

exports.main = async (event, context) => {
  try {
    const raw = event && typeof event === 'object' ? event : {};
    const includeTotal = raw.includeTotal === true;
    const brief = raw.brief === true;
    const noCache = raw.noCache === true;

    const id = raw.id != null ? String(raw.id) : '';
    if (id) {
      const cacheKey = `id:${id}`;
      if (!noCache) {
        const cached = getCache(cacheKey);
        if (cached) return cached;
      }
      const res = await db.collection("krdailysentence")
        .field(fullField())
        .doc(id)
        .get();
      const data = res && res.data ? [res.data] : [];
      const out = {
        success: true,
        data,
        total: data.length,
        page: 1,
        pageSize: data.length,
        hasMore: false
      };
      if (!noCache) setCache(cacheKey, out);
      return out;
    }

    const timestamp = raw.timestamp != null ? Number(raw.timestamp) : NaN;
    if (Number.isFinite(timestamp)) {
      const cacheKey = `ts:${timestamp}`;
      if (!noCache) {
        const cached = getCache(cacheKey);
        if (cached) return cached;
      }
      const res = await db.collection("krdailysentence")
        .field(fullField())
        .where({ timestamp })
        .limit(1)
        .get();
      const out = {
        success: true,
        data: res.data || [],
        total: (res.data || []).length,
        page: 1,
        pageSize: (res.data || []).length,
        hasMore: false
      };
      if (!noCache) setCache(cacheKey, out);
      return out;
    }

    const page = raw.page != null ? Number(raw.page) : NaN;
    const pageSize = raw.pageSize != null ? Number(raw.pageSize) : NaN;
    const offset = raw.offset != null ? Number(raw.offset) : NaN;

    const normalizedPage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const normalizedPageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(100, Math.floor(pageSize)) : 20;
    const normalizedOffset = Number.isFinite(offset) && offset >= 0 ? Math.floor(offset) : (normalizedPage - 1) * normalizedPageSize;

    const where = {};
    if (raw.progressGt != null) {
      const pg = Number(raw.progressGt);
      if (Number.isFinite(pg)) where.progress = _.gt(pg);
    } else if (raw.progressMin != null) {
      const pg = Number(raw.progressMin);
      if (Number.isFinite(pg)) where.progress = _.gte(pg);
    } else if (raw.progress != null) {
      const pg = Number(raw.progress);
      if (Number.isFinite(pg)) where.progress = pg;
    }

    const orderField = raw.orderField != null ? String(raw.orderField) : 'batchDate';
    const orderDirection = raw.orderDirection != null ? String(raw.orderDirection) : 'desc';

    const baseQuery = db.collection("krdailysentence");
    const queryWithWhere = Object.keys(where).length ? baseQuery.where(where) : baseQuery;

    let listQuery = queryWithWhere;
    try {
      listQuery = listQuery.orderBy(orderField, orderDirection === 'asc' ? 'asc' : 'desc');
    } catch (e) {}

    const cacheKey = JSON.stringify({
      where,
      orderField,
      orderDirection: orderDirection === 'asc' ? 'asc' : 'desc',
      offset: normalizedOffset,
      pageSize: normalizedPageSize,
      includeTotal,
      brief
    });
    if (!noCache) {
      const cached = getCache(cacheKey);
      if (cached) return cached;
    }

    const pickField = brief ? briefField() : fullField();
    const usePeek = normalizedPageSize < 100;
    const limitSize = usePeek ? (normalizedPageSize + 1) : normalizedPageSize;
    const res = await listQuery
      .field(pickField)
      .skip(normalizedOffset)
      .limit(limitSize)
      .get();

    const rawData = res && Array.isArray(res.data) ? res.data : [];
    let hasMore = false;
    let data = rawData;
    if (usePeek) {
      hasMore = rawData.length > normalizedPageSize;
      data = hasMore ? rawData.slice(0, normalizedPageSize) : rawData;
    } else {
      if (rawData.length < normalizedPageSize) {
        hasMore = false;
      } else {
        try {
          const moreRes = await listQuery
            .field({ _id: true })
            .skip(normalizedOffset + normalizedPageSize)
            .limit(1)
            .get();
          const moreData = moreRes && Array.isArray(moreRes.data) ? moreRes.data : [];
          hasMore = moreData.length > 0;
        } catch (e) {
          hasMore = false;
        }
      }
      data = rawData;
    }
    let totalResolved = 0;
    if (includeTotal) {
      try {
        const totalRes = await queryWithWhere.count();
        totalResolved = totalRes && totalRes.total != null ? Number(totalRes.total) : 0;
      } catch (e) {
        totalResolved = 0;
      }
    }

    const out = {
      success: true,
      data,
      total: includeTotal ? totalResolved : undefined,
      page: normalizedPage,
      pageSize: normalizedPageSize,
      offset: normalizedOffset,
      hasMore
    };
    if (!noCache) setCache(cacheKey, out);
    return out;
  } catch (e) {
    return {
      success: false,
      errMsg: e && e.message ? e.message : e
    };
  }
};
