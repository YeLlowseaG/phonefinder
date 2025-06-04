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
          name="code"
          :rules="[{ required: true, message: '请输入验证码' }]"
        >
          <a-input-group compact>
            <a-input
              v-model:value="formState.code"
              style="width: calc(100% - 120px)"
              placeholder="请输入验证码"
              :maxLength="6"
            >
              <template #prefix>
                <safety-outlined />
              </template>
            </a-input>
            <a-button
              type="primary"
              style="width: 120px"
              :disabled="!!countdown"
              @click="sendCode"
            >
              {{ countdown ? `${countdown}秒后重试` : '获取验证码' }}
            </a-button>
          </a-input-group>
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
  code: '',
});

const loading = ref(false);
const countdown = ref(0);

const startCountdown = () => {
  countdown.value = 60;
  const timer = setInterval(() => {
    countdown.value--;
    if (countdown.value <= 0) {
      clearInterval(timer);
    }
  }, 1000);
};

const sendCode = async () => {
  try {
    if (!/^1[3-9]\d{9}$/.test(formState.phone)) {
      message.error('请输入正确的手机号');
      return;
    }

    await request.post('/api/auth/send-code', {
      phone: formState.phone,
    });

    message.success('验证码已发送');
    startCountdown();
  } catch (error) {
    // 错误已经在响应拦截器中处理
  } finally {
    loading.value = false;
  }
};

const onFinish = async (values) => {
  try {
    loading.value = true;
    const response = await request.post('/api/auth/verify-code', values);
    
    // 保存 token 到 localStorage
    localStorage.setItem('token', response.data.data.token);
    localStorage.setItem('userInfo', JSON.stringify({
      userId: response.data.data.userId,
      phone: response.data.data.phone,
    }));

    message.success('登录成功');
    // 登录成功后跳转到主页
    router.push('/home');

  } catch (error) {
    // 错误已经在响应拦截器中处理
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