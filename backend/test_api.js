const axios = require('axios');
require('dotenv').config();

// 高德地图API配置
const AMAP_KEY = process.env.AMAP_KEY;
const AMAP_BASE_URL = 'https://restapi.amap.com/v3';

async function searchPOI(keywords, city) {
    try {
        const response = await axios.get(`${AMAP_BASE_URL}/place/text`, {
            params: {
                key: AMAP_KEY,
                keywords: keywords,
                city: city,
                extensions: 'all',  // 返回详细信息
                output: 'json'
            }
        });
        
        return response.data;
    } catch (error) {
        console.error('搜索POI时出错:', error.message);
        throw error;
    }
}

// 测试函数
async function testPOISearch() {
    try {
        // 测试搜索
        const result = await searchPOI('餐厅', '北京');
        console.log('搜索结果:', JSON.stringify(result, null, 2));
        
        // 检查是否包含电话号码
        if (result.pois && result.pois.length > 0) {
            result.pois.forEach(poi => {
                console.log('\n地点名称:', poi.name);
                console.log('地址:', poi.address);
                console.log('电话号码:', poi.tel || '无电话号码');
            });
        }
    } catch (error) {
        console.error('测试失败:', error);
    }
}

// 运行测试
testPOISearch(); 