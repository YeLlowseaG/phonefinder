const amapService = require('./services/amapService');

async function testAmapService() {
    try {
        // 测试POI搜索
        console.log('测试POI搜索...');
        const searchResult = await amapService.searchPOI('餐厅', '北京');
        if (searchResult.success) {
            console.log('搜索成功，找到', searchResult.data.length, '个结果：');
            searchResult.data.forEach((poi, index) => {
                console.log(`\n${index + 1}. ${poi.name}`);
                console.log(`   地址: ${poi.address}`);
                console.log(`   电话: ${poi.phone || '无'}`);
            });
        } else {
            console.error('搜索失败:', searchResult.error);
        }

        // 测试行政区划获取
        console.log('\n测试行政区划获取...');
        const districtResult = await amapService.getDistrictList();
        if (districtResult.success) {
            console.log('获取成功，找到', districtResult.data.length, '个省份：');
            districtResult.data.forEach(province => {
                console.log(`\n${province.name}`);
                if (province.districts) {
                    console.log('  城市:', province.districts.map(city => city.name).join(', '));
                }
            });
        } else {
            console.error('获取失败:', districtResult.error);
        }
    } catch (error) {
        console.error('测试过程中发生错误:', error);
    }
}

testAmapService(); 