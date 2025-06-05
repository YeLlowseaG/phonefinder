import axios from 'axios';
import { message } from 'ant-design-vue';

const request = axios.create({
  baseURL: 'https://api.helloai001.com', // baseURL 必须用后端服务的公网域名！
  timeout: 10000,
});

// 请求拦截器
request.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
request.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response) {
      switch (error.response.status) {
        case 401:
          // token 过期或无效
          localStorage.removeItem('token');
          localStorage.removeItem('userInfo');
          message.error('登录已过期，请重新登录');
          // TODO: 跳转到登录页，这里不能直接使用 router，需要在组件中处理或通过全局导航守卫
          break;
        default:
          message.error(error.response.data?.error || '请求失败');
      }
    } else {
      message.error('网络错误，请稍后重试');
    }
    return Promise.reject(error);
  }
);

export default request; 