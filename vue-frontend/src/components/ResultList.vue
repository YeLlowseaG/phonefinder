<template>
  <div>
    <div style="text-align: right; margin-bottom: 16px; display: none;">
      <a-button
        type="primary"
        @click="handleExport"
        :disabled="!results || results.length === 0 || !canExport"
      >
        <download-outlined />
        导出为 Excel
      </a-button>
    </div>
    
    <a-list
      v-if="results && results.length > 0"
      :data-source="results"
      :bordered="true"
      class="result-list"
    >
      <template #renderItem="{ item }">
        <a-list-item>
          <div class="result-item">
            <div class="store-name">{{ item.name }}</div>
            <div class="store-address">
              <environment-outlined /> {{ item.address }}
            </div>
            <div v-if="item.phone" class="store-phone">
              <phone-outlined /> {{ item.phone }}
            </div>
            <div v-if="item.businessArea" class="store-area">
              <shop-outlined /> {{ item.businessArea }}
            </div>
          </div>
        </a-list-item>
      </template>
    </a-list>
    
    <a-empty v-else description="暂无搜索结果" class="empty-container" />
  </div>
</template>

<script setup>
import { defineProps, computed } from 'vue';
import { message } from 'ant-design-vue';
import { 
  PhoneOutlined, 
  EnvironmentOutlined, 
  DownloadOutlined,
  ShopOutlined 
} from '@ant-design/icons-vue';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import request from '@/utils/request';

// 声明 props
const props = defineProps({
  results: {
    type: Array,
    default: () => []
  },
  userInfo: { // 添加 userInfo prop
    type: Object,
    default: () => null
  }
});

// 计算属性，判断是否可以导出
const canExport = computed(() => {
  if (!props.userInfo) return false; // 用户未登录，不能导出
  const { membershipType, dailyExportCount } = props.userInfo;

  // 免费用户不能导出
  if (membershipType === 'free') {
    return false;
  }

  // 普通会员检查每日导出次数限制
  if (membershipType === 'standard') {
    const maxDailyExport = 500; // 普通会员每日导出上限
    return dailyExportCount < maxDailyExport;
  }

  // 高级会员没有导出限制
  if (membershipType === 'premium') {
    return true;
  }

  return false; // 其他未知类型也不能导出
});

const handleExport = async () => {
  if (!props.results || props.results.length === 0) {
    message.warning('没有数据可导出');
    return;
  }

  // 在这里再次检查导出权限，以防按钮没有正确禁用
  if (!canExport.value) {
      const { membershipType } = props.userInfo;
      if (membershipType === 'free') {
          message.warning('免费用户无导出权限，请升级会员。');
      } else if (membershipType === 'standard') {
          const maxDailyExport = 500;
          message.warning(`普通会员每日最多导出 ${maxDailyExport} 条，您今日已导出 ${props.userInfo.dailyExportCount} 条。`);
      } else {
           message.warning('您没有导出权限，请联系管理员。');
      }
      return;
  }

  // 准备导出数据 (发送给后端)
  const exportData = props.results.map(item => ({
    name: item.name,
    address: item.address,
    phone: item.phone,
    businessArea: item.businessArea,
    type: item.type
  }));

  try {
    // 调用后端导出接口
    const response = await request.post('/api/export', { data: exportData }, {
      responseType: 'blob' // 告诉 axios 响应数据是二进制流
    });

    // 获取文件名 (从响应头 Content-Disposition 中获取)
    const contentDisposition = response.headers['content-disposition'];
    let filename = '商家电话搜索结果.xlsx'; // 默认文件名
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="(.*)"/);
      if (filenameMatch && filenameMatch[1]) {
        filename = decodeURIComponent(filenameMatch[1]);
      }
    }

    // 使用 file-saver 保存文件
    saveAs(response.data, filename);
    message.success('导出成功');

    // TODO: 成功导出后，可能需要刷新用户信息以更新每日导出计数显示 (如果需要立即反馈给用户的话)
    // 这可能需要从父组件 Home.vue 调用 App.vue 的 checkLoginStatus 方法，或者使用状态管理

  } catch (error) {
    // 错误已经在响应拦截器中处理
    message.error('导出失败');
  }

};

</script>

<style scoped>
.result-list {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.result-item {
  display: flex;
  align-items: flex-start;
  width: 100%;
  gap: 16px;
  padding: 8px 0;
}

.store-name {
  width: 200px;
  font-size: 16px;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.85);
  word-break: break-all;
  line-height: 1.5;
  text-align: right;
}

.store-address {
  width: 300px;
  color: rgba(0, 0, 0, 0.65);
  word-break: break-all;
  line-height: 1.5;
  text-align: right;
}

.store-phone {
  width: 150px;
  color: rgba(0, 0, 0, 0.65);
  word-break: break-all;
  line-height: 1.5;
  text-align: right;
}

.store-area {
  width: 150px;
  color: rgba(0, 0, 0, 0.65);
  word-break: break-all;
  line-height: 1.5;
  text-align: right;
}

.store-name :deep(.anticon),
.store-address :deep(.anticon),
.store-phone :deep(.anticon),
.store-area :deep(.anticon) {
  margin-right: 8px;
  color: #1890ff;
}

.empty-container {
  margin-top: 50px;
}
</style> 