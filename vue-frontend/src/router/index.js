import { createRouter, createWebHistory } from 'vue-router';
import Login from '../components/Login.vue';
import Home from '../views/Home.vue'; // 导入 Home 组件
import Membership from '../views/Membership.vue'; // 导入 Membership 组件
import InviteAdmin from '../views/InviteAdmin.vue'; // 导入邀请码管理页面

const routes = [
  {
    path: '/',
    redirect: '/login' // 默认重定向到登录页
  },
  {
    path: '/login',
    name: 'Login',
    component: Login
  },
  {
    path: '/home',
    name: 'Home',
    component: Home, // 使用 Home 组件
    meta: { requiresAuth: true } // 标记此路由需要认证
  },
  {
    path: '/membership', // 添加会员页面路由
    name: 'Membership',
    component: Membership,
    // meta: { requiresAuth: true } // 移除认证要求，允许未登录访问
  },
  {
    path: '/invite-admin',
    name: 'InviteAdmin',
    component: InviteAdmin
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 全局前置守卫：检查用户登录状态
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token');
  const storedUserInfo = localStorage.getItem('userInfo'); // 获取存储的用户信息
  let userInfo = null;
  if (storedUserInfo) {
      try {
          userInfo = JSON.parse(storedUserInfo);
      } catch (e) {
          console.error('解析 localStorage 中的用户信息失败:', e);
          // 解析失败，可能是存储格式错误，清除用户信息和token
          localStorage.removeItem('token');
          localStorage.removeItem('userInfo');
          token = null; // 重置 token 变量
      }
  }
  
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth);

  if (requiresAuth && !token) {
    // 需要认证但没有 token，跳转到登录页
    next('/login');
  } else if (to.path === '/login' && token) {
    // 已登录用户访问登录页，跳转到主页
    next('/home');
  } else {
    // 如果已登录且目标路由需要认证，将用户信息附加到路由 meta 中
    if (token && requiresAuth) {
        to.meta.userInfo = userInfo; // 将用户信息附加到目标路由的 meta 中
    }
    next();
  }
});

export default router; 