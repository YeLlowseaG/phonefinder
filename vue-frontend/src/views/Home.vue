<template>
  <div class="home-container">
    <div class="search-section">
      <SearchForm @search="handleSearch" ref="searchFormRef" />
    </div>

    <div v-if="membershipInfoText" class="membership-info-text" style="margin-bottom: 16px; color: #1890ff;">
      {{ membershipInfoText }}
    </div>

    <div class="results-section">
      <ResultList :results="searchResults" :userInfo="userInfo" />
    </div>

    <!-- 悬浮按钮容器 -->
    <div class="floating-buttons" v-if="searchResults.length > 0"> <!-- 只有有结果时显示容器 -->
        <!-- 悬浮清空按钮 -->
        <a-button
          @click="clearResults"
          size="large"
          class="custom-btn-outline-primary"
        >
          返回并清空搜索结果
        </a-button>

        <!-- 悬浮导出按钮 -->
        <!-- 登录后显示 -->
        <a-button
          v-if="isLoggedIn"
          type="primary"
          size="large"
          @click="handleExport"
          :class="{ 'export-disabled': !canExport, 'custom-btn-primary': true }"
        >
          <download-outlined />
          导出为 Excel
        </a-button>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { message } from 'ant-design-vue';
import SearchForm from '../components/SearchForm.vue';
import ResultList from '../components/ResultList.vue';
import request from '@/utils/request'; // 导入 request 工具
import { useRoute } from 'vue-router';
import { DownloadOutlined } from '@ant-design/icons-vue'; // 导入 Icon
import { saveAs } from 'file-saver'; // 导入 saveAs

// 从路由中获取 userInfo
const route = useRoute();
const userInfo = ref(route.meta.userInfo || null);
const isLoggedIn = ref(!!userInfo.value); // 初始化 isLoggedIn

// 临时添加：在 isLoggedIn 或 userInfo 变化时打印
watch([isLoggedIn, userInfo], ([newIsLoggedIn, newUserInfo]) => {
  console.log('Home.vue - isLoggedIn:', newIsLoggedIn);
  console.log('Home.vue - userInfo:', newUserInfo);
}, { immediate: true }); // 立即执行一次

// 计算属性，生成会员权益提示文案
const membershipInfoText = computed(() => {
  if (!userInfo.value) return '';

  const { membershipType, dailyExportCount } = userInfo.value;

  switch (membershipType) {
    case 'free':
      return '您是免费用户，搜索结果最多显示 20 条，无数据导出权限。升级会员可查看更多数据和导出。'
    case 'standard':
      const maxDailyExport = 500;
      return `您是普通会员，搜索结果最多显示 200 条，每日可导出最多 ${maxDailyExport} 条。您今日已导出 ${dailyExportCount} 条。`;
    case 'premium':
      return '您是高级会员，搜索结果最多显示 1000 条，导出无限制。'
    default:
      return '';
  }
});

// 计算属性，判断是否可以导出
const canExport = computed(() => {
  if (!userInfo.value) return false; // 用户未登录，不能导出
  const { membershipType, dailyExportCount } = userInfo.value;

  // 免费用户不能导出
  if (membershipType === 'free') {
    return false;
  }

  // 普通会员检查每日导出次数限制
  if (membershipType === 'standard') {
    const maxDailyExport = 500; // 普通会员每日导出上限
    // 确保 dailyExportCount 是数字，避免 undefined 的问题
    const currentExportCount = typeof dailyExportCount === 'number' ? dailyExportCount : 0;
    return currentExportCount < maxDailyExport;
  }

  // 高级会员没有导出限制
  if (membershipType === 'premium') {
    return true;
  }

  return false; // 其他未知类型也不能导出
});

const searchResults = ref([]);
const searchFormRef = ref(null); // 用于获取 SearchForm 组件实例，以便控制 loading 状态

const handleSearch = async (searchParams) => {
  try {
    if (searchFormRef.value && searchFormRef.value.loading !== undefined) {
        searchFormRef.value.loading = true; // 设置 SearchForm 的 loading 状态
    }

    // 注意：后端目前实现的是分页获取所有结果（最多1000条），这里不再需要 page 和 pageSize 参数
    const response = await request.get('/api/search', {
      params: {
        keywords: searchParams.keywords,
        city: searchParams.city,
        // district 参数，如果选择了区县，则使用区县作为 city 参数
        // 高德地图 API 在文本搜索中，如果同时指定了 city 和 district，它会优先在 district 中搜索
        // 如果没有指定 district，则在 city 中搜索。因此，我们可以在选择了 district 时，将 city 设置为 district 的名称
        city: searchParams.district || searchParams.city,
      }
    });

    if (response.data.success) {
      searchResults.value = response.data.data;
    } else {
      message.error(response.data.error || '搜索失败');
      searchResults.value = []; // 清空结果
    }
  } catch (error) {
    // 错误已经在响应拦截器中处理
    searchResults.value = []; // 清空结果
  } finally {
     if (searchFormRef.value && searchFormRef.value.loading !== undefined) {
        searchFormRef.value.loading = false; // 重置 SearchForm 的 loading 状态
     }
  }
  console.log('Search completed, searchResults:', searchResults.value);
};

const clearResults = () => {
  searchResults.value = [];
};

const handleExport = async () => { // 将导出逻辑移到 Home.vue
  if (!searchResults.value || searchResults.value.length === 0) {
    message.warning('没有数据可导出');
    return;
  }

  // 在这里检查导出权限和会员类型
  if (!userInfo.value || !userInfo.value.membershipType || userInfo.value.membershipType === 'free') {
      message.warning('免费用户无导出权限，请升级会员。');
      // TODO: 可以考虑在这里引导用户到会员升级页面
      return;
  }

  // 普通会员检查每日导出次数限制
  if (userInfo.value.membershipType === 'standard') {
      const maxDailyExport = 500;
      const currentExportCount = typeof userInfo.value.dailyExportCount === 'number' ? userInfo.value.dailyExportCount : 0;
      if (currentExportCount >= maxDailyExport) {
           message.warning(`普通会员每日最多导出 ${maxDailyExport} 条，您今日已超出限制。`);
           return;
      }
  }

  // 准备导出数据 (发送给后端)
  const exportData = searchResults.value.map(item => ({
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
    // 这可能需要调用 App.vue 的 checkLoginStatus 方法，或者使用状态管理
    // 临时方案：成功导出后手动更新本地 userInfo 中的 dailyExportCount 并刷新页面顶部显示
     if (userInfo.value && userInfo.value.membershipType === 'standard') {
         const exportedCount = exportData.length; // 本次导出的数量
         // 确保 dailyExportCount 是数字再进行累加
         userInfo.value.dailyExportCount = (typeof userInfo.value.dailyExportCount === 'number' ? userInfo.value.dailyExportCount : 0) + exportedCount;
         // 可选：更新 localStorage
         localStorage.setItem('userInfo', JSON.stringify(userInfo.value));
     }

  } catch (error) {
    // 错误已经在响应拦截器中处理
    message.error('导出失败');
  }

};

// 支付相关状态
const showPaymentModal = ref(false);
const qrCodeUrl = ref('');
const currentOrderId = ref('');
let orderStatusTimer = null; // 定时器变量

// 处理购买会员
const handlePurchase = async (membershipType) => {
    try {
        // 调用后端创建支付订单
        const response = await request.post('/api/payment/create-order', {
            membershipType: membershipType,
        });

        if (response.data.success) {
            qrCodeUrl.value = response.data.data.codeUrl; // 获取二维码链接
            currentOrderId.value = response.data.data.orderId; // 获取订单号
            showPaymentModal.value = true; // 显示支付弹窗

            // 开始查询订单状态
            startPollingOrderStatus(currentOrderId.value);
        } else {
            message.error(response.data.error || '创建支付订单失败');
        }
    } catch (error) {
        // 错误已经在响应拦截器中处理
        message.error('创建支付订单失败');
    }
 };

// 开始周期性查询订单状态
const startPollingOrderStatus = (orderId) => {
    // 先清除之前的定时器，避免重复
    if (orderStatusTimer) {
        clearInterval(orderStatusTimer);
    }
    // 每隔一段时间查询一次订单状态 (例如 3 秒)
    orderStatusTimer = setInterval(() => {
        queryOrderStatus(orderId);
    }, 3000);
 };

// 查询订单状态
const queryOrderStatus = async (orderId) => {
     try {
         const response = await request.get('/api/payment/query-order', {
             params: {
                 outTradeNo: orderId,
             },
         });

         if (response.data.success) {
             const status = response.data.data.status;
             console.log(`Order ${orderId} status: ${status}`);
             if (status === 'paid') {
                 // 支付成功
                 message.success('支付成功！');
                 clearInterval(orderStatusTimer); // 停止查询
                 showPaymentModal.value = false; // 关闭弹窗
                 // TODO: 支付成功后刷新用户信息，更新页面显示
                 // 可以调用 App.vue 中的方法或刷新当前页面
                 // 临时方案：延迟一小段时间后刷新页面
                 setTimeout(() => {
                     window.location.reload();
                 }, 1000); // 延迟 1 秒刷新
             } else if (status === 'failed' || status === 'closed') {
                 // 支付失败或关闭
                 message.error('订单支付失败或已关闭。');
                 clearInterval(orderStatusTimer); // 停止查询
                 showPaymentModal.value = false; // 关闭弹窗
             } else {
                 // 仍然是 pending 或其他状态，继续等待
             }
         } else {
             // 查询接口返回失败，可能是订单不存在或网络问题
             console.error('Query order status failed:', response.data.error);
             // 这里的处理可以根据需求来，例如停止查询或继续重试几次
             // 为了避免频繁错误，可以在几次失败后停止
             // clearInterval(orderStatusTimer); // 停止查询
             // showPaymentModal.value = false; // 关闭弹窗 (可选)
         }
     } catch (error) {
         // 查询接口异常，例如网络错误
         console.error('Query order status API error:', error);
         // 这里的处理也可以根据需求来，例如停止查询或继续重试几次
         // 为了避免频繁错误，可以在几次异常后停止
         // clearInterval(orderStatusTimer); // 停止查询
         // showPaymentModal.value = false; // 关闭弹窗 (可选)
     }
 };

</script>

<style scoped>
.home-container {
  padding: 24px;
  padding-top: 24px;
  position: relative;
  padding-bottom: 80px;
  max-width: 1200px; /* 设置最大宽度 */
  margin: 0 auto; /* 居中显示 */
}

.search-section {
  margin-bottom: 24px;
}

.membership-info-text {
    margin-bottom: 16px;
    /* 使用官网的文本颜色变量 */
    color: var(--gray);
    margin-top: 80px;
}

.floating-buttons {
    position: fixed; /* 固定定位 */
    bottom: 40px; /* 距离底部 40px */
    right: 40px; /* 距离右侧 40px */
    z-index: 1000; /* 确保按钮在其他内容之上 */
    display: flex; /* 使用 flex 布局让按钮在同一行 */
    align-items: center;
}

/* 为 Ant Design Vue 按钮添加自定义样式，使其接近官网风格 */
/* 注意：直接覆盖 Ant Design Vue 样式可能需要更强的选择器或使用 ::v-deep */
/* 主要按钮 */
:deep(.custom-btn-primary.ant-btn-primary) {
    background-color: var(--primary) !important;
    border-color: var(--primary) !important;
    border-radius: 50px !important;
    font-weight: 500 !important;
    padding: 0.5rem 1.5rem !important;
    font-size: 0.85rem !important;
    text-transform: uppercase !important;
    letter-spacing: 0.5px !important;
    transition: all 0.3s ease !important;
}

:deep(.custom-btn-primary.ant-btn-primary:hover),
:deep(.custom-btn-primary.ant-btn-primary:focus) {
    background-color: var(--secondary) !important;
    border-color: var(--secondary) !important;
    transform: translateY(-2px) !important;
    box-shadow: 0 5px 15px rgba(67, 97, 238, 0.3) !important;
}

/* 次要按钮 (例如清空按钮) */
:deep(.custom-btn-outline-primary.ant-btn:not(.ant-btn-primary)) { /* 确保只影响非主要按钮 */
    color: var(--primary) !important;
    border-color: var(--primary) !important;
    background-color: transparent !important; /* 确保背景透明 */
    border-radius: 50px !important;
    font-weight: 500 !important;
     padding: 0.5rem 1.5rem !important;
    font-size: 0.85rem !important;
    text-transform: uppercase !important;
    letter-spacing: 0.5px !important;
    transition: all 0.3s ease !important;
}

:deep(.custom-btn-outline-primary.ant-btn:not(.ant-btn-primary):hover),
:deep(.custom-btn-outline-primary.ant-btn:not(.ant-btn-primary):focus) {
    background-color: var(--primary) !important;
    color: white !important; /* 悬停时文本颜色变白 */
    border-color: var(--primary) !important;
    transform: translateY(-2px) !important;
    box-shadow: 0 5px 15px rgba(67, 97, 238, 0.3) !important;
}

/* 搜索按钮 */
:deep(.home-container .ant-btn-primary) { /* 使用父容器类和 Ant Design Vue 类结合 */
     background-color: var(--primary) !important;
    border-color: var(--primary) !important;
    border-radius: 50px !important;
    font-weight: 500 !important;
    padding: 0.5rem 1.5rem !important;
    font-size: 1rem !important; /* 搜索按钮可能需要更大字体 */
    text-transform: uppercase !important;
    letter-spacing: 0.5px !important;
    transition: all 0.3s ease !important;
}

:deep(.home-container .ant-btn-primary:hover),
:deep(.home-container .ant-btn-primary:focus) {
    background-color: var(--secondary) !important;
    border-color: var(--secondary) !important;
    transform: translateY(-2px) !important;
    box-shadow: 0 5px 15px rgba(67, 97, 238, 0.3) !important;
}

/* 调整表单项间距 */
:deep(.home-container .ant-form-item) {
    margin-bottom: 16px !important; /* 示例间距 */
}

/* 为搜索条件卡片添加样式 */
:deep(.home-container .ant-card) {
    border-radius: 15px !important;
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.05) !important;
    border: none !important;
}

/* 为会员信息文本添加样式 */
.membership-info-text {
    margin-bottom: 16px;
    color: var(--gray) !important; /* 强制使用灰色 */
}

/* 为导出按钮定义禁用样式 */
.export-disabled {
    opacity: 0.6; /* 降低透明度 */
    cursor: not-allowed; /* 改变光标样式 */
}

/* 确保搜索和结果区域铺满宽度 */
.search-section,
.results-section {
  width: 100%;
}

</style> 