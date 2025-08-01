<template>
  <div class="login-container">
    <a-card class="login-card" title="登录/注册" :bordered="false">
      <a-form
        :model="formState"
        name="login"
        @finish="onFinish"
        autocomplete="off"
      >
        <a-form-item
          name="phone"
          :rules="[
            { required: true, message: '请输入手机号' },
            { pattern: /^1[3-9]\d{9}$/, message: '请输入有效的手机号码' }
          ]"
        >
          <a-input
            v-model:value="formState.phone"
            placeholder="请输入手机号"
            :maxLength="11"
          >
            <template #prefix>
              <mobile-outlined />
            </template>
          </a-input>
        </a-form-item>
        <a-form-item
          name="inviteCode"
          :rules="[{ required: true, message: '请输入邀请码' }]"
        >
          <a-input
            v-model:value="formState.inviteCode"
            placeholder="请输入邀请码"
            :maxLength="20"
          >
            <template #prefix>
              <safety-outlined />
            </template>
          </a-input>
        </a-form-item>
        <a-form-item>
          <a-button type="primary" html-type="submit" block :loading="loading">
            登录/注册
          </a-button>
        </a-form-item>
      </a-form>
    </a-card>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { MobileOutlined, SafetyOutlined } from '@ant-design/icons-vue';
import request from '../utils/request';

const router = useRouter();
const formState = reactive({
  phone: '',
  inviteCode: '',
});

const loading = ref(false);

const onFinish = async (values) => {
  try {
    loading.value = true;
    const response = await request.post('/api/auth/login-invite', values);
    if (response.data.success) {
      // 保存 token 到 localStorage
      localStorage.setItem('token', response.data.data.token);
      // 登录成功提示
      message.success('登录成功');
      // 登录成功后跳转到主页
      router.push('/home');
    } else {
      // 失败时弹窗提示后端返回的文案
      message.error(response.data.error || '登录失败，请重试');
    }
  } catch (error) {
    // 网络错误或后端未返回 error 字段
    message.error(error.response?.data?.error || '网络错误，请稍后重试');
  } finally {
    loading.value = false;
  }
};

</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background-color: #f0f2f5;
}

.login-card {
  width: 100%;
  max-width: 400px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
</style> 