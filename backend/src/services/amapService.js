const axios = require('axios');
const cacheService = require('./cacheService');
require('dotenv').config();

class AmapService {
    constructor() {
        this.key = process.env.AMAP_KEY;
        this.baseUrl = 'https://restapi.amap.com/v3';
    }

    async searchPOI(keywords, city, user, page = 1, pageSize = 20) {
        try {
            // 生成缓存键
            const cacheKey = `poi:${keywords}:${city}:${page}:${pageSize}`;
            
            // 检查缓存
            const cachedResult = cacheService.get(cacheKey);
            if (cachedResult) {
                return cachedResult;
            }

            // 每次请求的高德API分页大小
            const amapPageSize = 25;
            // 最大尝试获取的总条数限制，根据会员类型设定
            let maxTotalResults = 0;

            switch (user.membershipType) {
                case 'free':
                    maxTotalResults = 20;
                    break;
                case 'standard':
                    maxTotalResults = 200;
                    break;
                case 'premium':
                    maxTotalResults = 1000; // 或更高，取决于您的需求和高德API限制
                    break;
                default:
                    maxTotalResults = 20; // 默认为免费用户
            }

            let allPois = [];
            let currentPage = 1;

            while (allPois.length < maxTotalResults) {
                try {
                    const response = await axios.get(`${this.baseUrl}/place/text`, {
                        params: {
                            key: this.key,
                            keywords: keywords,
                            city: city,
                            extensions: 'all',
                            output: 'json',
                            page: currentPage,
                            offset: amapPageSize
                        }
                    });

                    if (response.data.status === '1' && response.data.pois) {
                        const pois = response.data.pois;
                        if (pois.length === 0) {
                            // 没有更多数据了
                            break;
                        }
                        allPois = allPois.concat(pois);

                        // 如果返回的数据少于请求的数量，说明是最后一页
                        if (pois.length < amapPageSize) {
                            break;
                        }

                        currentPage++;
                    } else {
                        // API 返回状态码不是1，或者没有pois数据，记录错误并停止分页
                        console.error('Amap API error during pagination:', response.data.info);
                        // 可以在这里决定是否返回当前已获取的数据或一个错误
                        // 为了简单起见，我们停止并返回当前数据加上错误信息
                        return {
                            success: false,
                            error: `Failed to fetch all pages: ${response.data.info}`,
                            data: allPois.map(poi => ({
                                name: poi.name,
                                address: poi.address,
                                phone: this.formatPhone(poi.tel || ''),
                                location: poi.location,
                                type: poi.type,
                                businessArea: poi.business_area
                            }))
                        };
                    }
                } catch (error) {
                    // 请求发生错误，记录错误并停止分页
                    console.error('Request error during Amap API pagination:', error.message);
                    return {
                        success: false,
                        error: `Request error during pagination: ${error.message}`,
                         data: allPois.map(poi => ({
                            name: poi.name,
                            address: poi.address,
                            phone: this.formatPhone(poi.tel || ''),
                            location: poi.location,
                            type: poi.type,
                            businessArea: poi.business_area
                        }))
                    };
                }
            }

            // 确保返回的结果数量不超过会员等级的限制
            const finalPois = allPois.slice(0, maxTotalResults);

            const result = {
                success: true,
                data: finalPois.map(poi => ({
                    name: poi.name,
                    address: poi.address,
                    phone: this.formatPhone(poi.tel || ''),
                    location: poi.location,
                    type: poi.type,
                    businessArea: poi.business_area
                }))
            };

            // 缓存结果（30分钟）
            cacheService.set(cacheKey, result, 1800000);
            
            return result;
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getDistrictList() {
        try {
            const cacheKey = 'districts';
            
            // 检查缓存
            const cachedResult = cacheService.get(cacheKey);
            if (cachedResult) {
                return cachedResult;
            }

            const response = await axios.get(`${this.baseUrl}/config/district`, {
                params: {
                    key: this.key,
                    keywords: '中国',
                    subdistrict: 3,
                    extensions: 'base'
                }
            });

            let result;
            if (response.data.status === '1') {
                result = {
                    success: true,
                    data: response.data.districts[0].districts
                };
            } else {
                result = {
                    success: false,
                    error: response.data.info
                };
            }

            // 缓存结果（24小时）
            cacheService.set(cacheKey, result, 86400000);
            
            return result;
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // 格式化电话号码
    formatPhone(phone) {
        if (!phone) return '';
        
        // 添加类型检查，确保 phone 是字符串
        if (typeof phone !== 'string') {
            console.warn('Unexpected phone type:', phone); // 可选：记录非字符串类型的电话号码
            return ''; // 或者返回其他默认值
        }
        
        // 处理多个电话号码的情况
        const phones = phone.split(';').map(p => p.trim());
        
        return phones.map(p => {
            // 移除所有非数字字符
            const numbers = p.replace(/\D/g, '');
            
            // 格式化手机号
            if (numbers.length === 11) {
                return numbers.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
            }
            
            // 格式化座机号
            if (numbers.length === 12) {
                return numbers.replace(/(\d{4})(\d{4})(\d{4})/, '$1-$2-$3');
            }
            
            // 其他情况保持原样
            return p;
        }).join('; ');
    }
}

module.exports = new AmapService(); 