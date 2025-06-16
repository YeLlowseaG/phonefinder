<template>
  <div class="membership-container">
    <h1>会员中心</h1>
    <p>邀请码激活后可体验全部会员功能，体验期为30天。</p>
    
    <!-- 临时显示用户登录状态和信息 -->
    <div v-if="isLoggedIn">
        <p>您已登录。</p>
        <p v-if="userInfo">欢迎，{{ userInfo.phone }} ({{ userInfo.membershipType === 'experience' ? '体验会员' : userInfo.membershipType === 'premium' ? '高级会员' : userInfo.membershipType === 'standard' ? '普通会员' : '免费用户' }})</p>
        <div v-if="userInfo && userInfo.membershipType === 'experience'">
            <p style="color: #52c41a;">您正在体验会员功能，剩余 {{ experienceDaysLeft }} 天。</p>
        </div>
        <div v-else-if="userInfo && userInfo.membershipType !== 'premium' && userInfo.membershipType !== 'experience'" style="margin-top: 20px; color: #ff4d4f;">
            <p>您当前为普通用户，如需体验会员功能请通过邀请码激活。</p>
        </div>
        <div v-else-if="userInfo && userInfo.membershipType === 'premium'">
            <p style="color: #1890ff;">您是高级会员，享有全部会员权益。</p>
        </div>
    </div>
    <div v-else>
        <p>您尚未登录，登录后可以查看您的会员状态和体验期信息。</p>
    </div>

    <a-divider>会员等级与权益</a-divider> <!-- 分隔线 -->

    <div class="membership-cards">
      <a-card v-for="level in membershipLevels" :key="level.type" :title="level.name">
        <p>价格: {{ level.price }}</p>
        <p>搜索结果: {{ level.searchLimit }} 条</p>
        <p>导出权限: {{ level.exportPermission }}</p>
        <template v-if="isLoggedIn && userInfo && userInfo.membershipType === level.type">
          <a-button type="primary" disabled>当前等级</a-button>
        </template>
        <template v-else>
          <a-button disabled>仅限体验期</a-button>
        </template>
      </a-card>
    </div>

    <!-- 展示扫码加微信获取邀请码的二维码 -->
    <div style="margin-top: 40px; text-align: center;">
      <p>扫码加微信获取邀请码，体验会员功能：</p>
      <img src="/quizqrcode.png" alt="微信二维码" style="width: 180px; height: 180px;" />
    </div>

    <!-- 注释掉支付相关模态框和逻辑 -->
    <!--
    <a-modal 
        v-model:visible="paymentModalVisible"
        title="微信支付"
        @cancel="handleModalClose"
        :footer="null"
    >
      <div class="qrcode-container" style="text-align: center; padding: 20px;">
        <p>请使用微信扫描下方二维码完成支付：</p>
        <!-- 二维码组件 --
        <QrcodeVue :value="qrCodeUrl" :size="200" level="H" v-if="qrCodeUrl" />
        <p style="margin-top: 10px;">订单号: {{ currentOrderId }}</p>
        <!-- 支付状态显示 --
        <div v-if="paymentStatus === 'pending'" style="margin-top: 10px;">
          <a-spin />
          <p>等待支付...</p>
        </div>
        <div v-else-if="paymentStatus === 'success'" style="margin-top: 10px; color: #52c41a;">
          <check-circle-outlined style="font-size: 24px;" />
          <p>支付成功！</p>
        </div>
        <div v-else-if="paymentStatus === 'failed'" style="margin-top: 10px; color: #ff4d4f;">
          <close-circle-outlined style="font-size: 24px;" />
          <p>支付失败，请重试</p>
        </div>
        
        <!-- 添加支付操作按钮 --
        <div style="margin-top: 20px;">
          <a-button 
            type="primary" 
            @click="handleCheckPayment" 
            :loading="checkingPayment"
            :disabled="paymentStatus !== 'pending'"
          >
            我已完成支付
          </a-button>
          <a-button 
            style="margin-left: 8px" 
            @click="handlePaymentHelp"
          >
            遇到问题？
          </a-button>
        </div>
      </div>
    </a-modal> -->

  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import request from '@/utils/request'; // 导入 request 工具
import { useRouter } from 'vue-router'; // 导入 useRouter
import { message } from 'ant-design-vue'; // 导入 message 组件
import QrcodeVue from 'qrcode.vue'; // 导入 QrcodeVue 组件
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons-vue';

const routerInstance = useRouter(); // 获取路由实例

const isLoggedIn = ref(false);
const userInfo = ref(null);

// 定义会员等级信息
const membershipLevels = [ 
    {
        type: 'free',
        name: '免费用户',
        price: '免费',
        searchLimit: '20',
        exportPermission: '无'
    },
    {
        type: 'standard',
        name: '普通会员',
        price: '¥99/年', // 示例价格
        searchLimit: '200',
        exportPermission: '每日 500 条'
    },
    {
        type: 'premium',
        name: '高级会员',
        price: '¥299/年', // 示例价格
        searchLimit: '1000+',
        exportPermission: '无限制'
    }
];

// 支付模态框相关状态
const paymentModalVisible = ref(false); // 控制模态框显示
const qrCodeUrl = ref(''); // 二维码链接
const currentOrderId = ref(''); // 当前订单号
const pollingTimer = ref(null); // 轮询定时器
const paymentStatus = ref('pending'); // 支付状态：pending, success, failed
const checkingPayment = ref(false);

const experienceDaysLeft = computed(() => {
  if (userInfo.value && userInfo.value.membershipType === 'experience' && userInfo.value.membershipExpiryDate) {
    const now = new Date();
    const expiry = new Date(userInfo.value.membershipExpiryDate);
    const diff = expiry - now;
    return diff > 0 ? Math.ceil(diff / (1000 * 60 * 60 * 24)) : 0;
  }
  return 0;
});

const checkLoginStatus = async () => {
  const token = localStorage.getItem('token');

  if (token) {
    try {
      const response = await request.get('/api/auth/me');
      if (response.data.success && response.data.data) {
        userInfo.value = response.data.data;
        isLoggedIn.value = true;
        // 注意：这里不存储到 localStorage，因为 App.vue 已经在管理
        // localStorage.setItem('userInfo', JSON.stringify(userInfo.value));
      } else {
        console.error('获取用户信息失败:', response.data.error);
        // 如果获取用户信息失败，可能token失效，清空token和用户信息
         localStorage.removeItem('token');
         localStorage.removeItem('userInfo');
         isLoggedIn.value = false;
         userInfo.value = null;
      }
    } catch (error) {
      console.error('获取用户信息请求失败:', error);
       // 如果请求失败，也可能是token失效，清空token和用户信息
       localStorage.removeItem('token');
       localStorage.removeItem('userInfo');
       isLoggedIn.value = false;
       userInfo.value = null;
    }
  } else {
    isLoggedIn.value = false;
    userInfo.value = null;
  }
};

// 开始轮询订单状态
const startPollingOrderStatus = () => {
    // 清除可能存在的旧定时器
    if (pollingTimer.value) {
        clearInterval(pollingTimer.value);
    }

    // 设置新的定时器，每3秒查询一次
    pollingTimer.value = setInterval(async () => {
        try {
            const response = await request.get(`/api/payment/query-order?outTradeNo=${currentOrderId.value}`);
            if (response.data.success) {
                const orderStatus = response.data.data.status;
                
                if (orderStatus === 'paid') {
                    // 支付成功
                    paymentStatus.value = 'success';
                    message.success('支付成功！');
                    clearInterval(pollingTimer.value);
                    paymentModalVisible.value = false;
                    // 刷新用户信息
                    await checkLoginStatus();
                } else if (orderStatus === 'failed') {
                    // 支付失败
                    paymentStatus.value = 'failed';
                    message.error('支付失败，请重试');
                    clearInterval(pollingTimer.value);
                }
            }
        } catch (error) {
            console.error('查询订单状态失败:', error);
        }
    }, 3000);
};

// 显示支付模态框
const showPaymentModal = (codeUrl, outTradeNo) => {
    qrCodeUrl.value = codeUrl;
    currentOrderId.value = outTradeNo;
    paymentStatus.value = 'pending';
    paymentModalVisible.value = true;
    // 开始轮询订单状态
    startPollingOrderStatus();
};

// 处理模态框关闭
const handleModalClose = () => {
    paymentModalVisible.value = false;
    // 清除轮询定时器
    if (pollingTimer.value) {
        clearInterval(pollingTimer.value);
        pollingTimer.value = null;
    }
    // 重置支付状态
    paymentStatus.value = 'pending';
    // 清空状态，避免下次打开显示旧数据
    qrCodeUrl.value = '';
    currentOrderId.value = '';
};

const handleUpgrade = async (membershipType) => {
    console.log('尝试升级到', membershipType);

    if (!isLoggedIn.value) {
        // 如果未登录，提示登录
        message.warning('请先登录以升级会员');
        goToLogin(); // 跳转到登录页面
        return;
    }

    try {
        // 调用后端接口创建支付订单
        const response = await request.post('/api/payment/create-order', { membershipType });

        if (response.data.success) {
            message.success('创建订单成功，请扫描二维码支付');
            console.log('创建订单成功，支付信息:', response.data.data);

             if (response.data.data && response.data.data.codeUrl) {
                 // 调用 showPaymentModal 函数显示模态框
                 showPaymentModal(response.data.data.codeUrl, response.data.data.outTradeNo);
             } else {
                 message.error('后端未返回支付二维码信息');
             }

            // 创建订单后赋值
            currentOrderId.value = response.data.data.orderId || response.data.data.outTradeNo;

        } else {
            message.error(response.data.error || '创建支付订单失败');
        }
    } catch (error) {
        // 错误已经在响应拦截器中处理
        message.error('创建支付订单请求失败');
    }
};

const goToLogin = () => {
     routerInstance.push('/login'); // 跳转到登录页面
};

// 手动检查支付状态
const handleCheckPayment = async () => {
    if (checkingPayment.value) return;
    
    checkingPayment.value = true;
    try {
        const response = await request.get(`/api/payment/query-order?outTradeNo=${currentOrderId.value}`);
        if (response.data.success) {
            const orderStatus = response.data.data.status;
            
            if (orderStatus === 'paid') {
                paymentStatus.value = 'success';
                message.success('支付成功！');
                clearInterval(pollingTimer.value);
                paymentModalVisible.value = false;
                await checkLoginStatus();
            } else if (orderStatus === 'failed') {
                paymentStatus.value = 'failed';
                message.error('支付失败，请重试');
                clearInterval(pollingTimer.value);
            } else {
                message.info('暂未检测到支付结果，请稍后再试');
            }
        }
    } catch (error) {
        console.error('查询订单状态失败:', error);
        message.error('查询订单状态失败，请稍后重试');
    } finally {
        checkingPayment.value = false;
    }
};

// 处理支付帮助
const handlePaymentHelp = () => {
    // 这里可以跳转到帮助页面或显示帮助信息
    message.info('如果支付遇到问题，请联系客服或稍后重试');
};

onMounted(() => {
  checkLoginStatus();
});

// 在组件卸载时清理定时器
onUnmounted(() => {
    if (pollingTimer.value) {
        clearInterval(pollingTimer.value);
    }
});

// 会员页面逻辑将在后续添加
</script>

<style scoped>
.membership-container {
  padding: 40px 24px;
  position: relative;
  padding-bottom: 80px;
  max-width: 1200px; /* 设置最大宽度值 */
  margin: 0 auto; /* 居中显示 */
}

.membership-cards {
    display: flex; /* 使用 flex 布局 */
    gap: 20px; /* 卡片之间的间距 */
    flex-wrap: wrap; /* 允许换行 */
    justify-content: center; /* 卡片居中 */
}
</style> 