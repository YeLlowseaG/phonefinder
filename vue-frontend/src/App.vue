<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { message } from 'ant-design-vue';
import router from './router';
import request from './utils/request';

const routerInstance = useRouter();
const route = useRoute();
const isLoggedIn = ref(false);
const userInfo = ref(null);
const selectedKeys = ref(['home']);

watch(() => route.path, (newPath) => {
  if (newPath === '/home') {
    selectedKeys.value = ['home'];
  } else if (newPath === '/membership') {
    selectedKeys.value = ['membership'];
  } else {
    selectedKeys.value = [];
  }
}, { immediate: true });

const checkLoginStatus = async () => {
  const token = localStorage.getItem('token');

  if (token) {
    try {
      const response = await request.get('/api/auth/me');
      if (response.data.success && response.data.data) {
        userInfo.value = response.data.data;
        isLoggedIn.value = true;
        localStorage.setItem('userInfo', JSON.stringify(userInfo.value));
      } else {
        console.error('获取用户信息失败:', response.data.error);
        handleLogout();
      }
    } catch (error) {
      console.error('获取用户信息请求失败:', error);
      handleLogout();
    }
  } else {
    isLoggedIn.value = false;
    userInfo.value = null;
  }
};

const handleLogout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('userInfo');
  isLoggedIn.value = false;
  userInfo.value = null;
  message.success('已退出登录');
  routerInstance.push('/login');
};

const goToHome = () => {
  routerInstance.push('/home');
};

const goToMembership = () => {
  routerInstance.push('/membership');
};

onMounted(() => {
  checkLoginStatus();
});

router.afterEach(() => {
    checkLoginStatus();
});
</script>

<template>
  <a-layout class="app-layout">
    <a-layout-header class="app-header">
      <div class="header-content">
        <div class="site-title" @click="goToHome">拓客宝Pro</div>
        <div class="right-section">
          <a-menu
            v-model:selectedKeys="selectedKeys"
            mode="horizontal"
            :style="{ lineHeight: '64px' }"
          >
            <a-menu-item key="home" @click="goToHome">首页</a-menu-item>
            <a-menu-item key="membership" @click="goToMembership">会员</a-menu-item>
          </a-menu>
          <div class="header-user-info">
            <template v-if="isLoggedIn && userInfo">
              <span>欢迎，{{ userInfo.phone }} <span v-if="userInfo.membershipType">({{ userInfo.membershipType }})</span></span>
              <a-button type="link" @click="handleLogout">退出登录</a-button>
            </template>
            <template v-else>
              <a-button type="primary" @click="routerInstance.push('/login')">登录</a-button>
            </template>
          </div>
        </div>
      </div>
    </a-layout-header>
    <a-layout-content class="app-content">
      <router-view />
    </a-layout-content>
  </a-layout>
</template>

<style>
.app-layout {
  min-height: 100vh;
}

.app-header {
  background-color: #fff !important;
  padding: 0 24px;
  height: 64px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.85);
  position: fixed;
  top: 0;
  width: 100%;
  z-index: 100;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.site-title {
  font-size: 18px;
  font-weight: bold;
  cursor: pointer;
}

.right-section {
    display: flex;
    align-items: center;
    gap: 20px;
}

.header-user-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.app-content {
  display: flex;
  justify-content: center;
  padding-top: 64px;
}

/* 移除旧的样式 */
/*
.app-container {
  min-height: 100vh;
}

.header {
  background-color: #fff;
  padding: 16px 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.content {
  padding: 24px;
}
*/
</style>
