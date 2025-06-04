class CacheService {
    constructor() {
        this.cache = new Map();
        this.defaultTTL = 3600000; // 1小时的缓存时间（毫秒）
    }

    set(key, value, ttl = this.defaultTTL) {
        const item = {
            value,
            expiry: Date.now() + ttl
        };
        this.cache.set(key, item);
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;

        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            return null;
        }

        return item.value;
    }

    delete(key) {
        this.cache.delete(key);
    }

    clear() {
        this.cache.clear();
    }
}

module.exports = new CacheService(); 