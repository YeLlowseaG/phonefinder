<template>
  <a-card class="search-form" title="搜索条件" :bordered="false">
    <a-form
      :model="formState"
      name="search"
      @finish="handleSearch"
      layout="vertical"
    >
      <a-form-item
        name="keywords"
        label="关键词"
        :rules="[{ required: true, message: '请输入搜索关键词' }]"
      >
        <a-input v-model:value="formState.keywords" placeholder="请输入商家名称、类型等关键词" />
      </a-form-item>
      <a-form-item
        name="province"
        label="省份"
        :rules="[{ required: true, message: '请选择省份' }]"
      >
        <a-select
          v-model:value="formState.province"
          placeholder="请选择省份"
          @change="handleProvinceChange"
        >
          <a-select-option v-for="province in provinces" :key="province.name" :value="province.name">
            {{ province.name }}
          </a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item
        name="city"
        label="城市"
        :rules="[{ required: true, message: '请选择城市' }]"
      >
        <a-select
          v-model:value="formState.city"
          placeholder="请选择城市"
          @change="handleCityChange"
          :disabled="!formState.province"
        >
          <a-select-option v-for="city in cities" :key="city.name" :value="city.name">
            {{ city.name }}
          </a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item
        name="district"
        label="区县"
      >
        <a-select
          v-model:value="formState.district"
          placeholder="请选择区县"
          :disabled="!formState.city"
        >
          <a-select-option v-for="district in districts" :key="district.name" :value="district.name">
            {{ district.name }}
          </a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item>
        <a-button
          type="primary"
          html-type="submit"
          :loading="loading"
          block
        >
          <search-outlined /> <!-- 使用 Ant Design Vue 的 Icon -->
          搜索
        </a-button>
      </a-form-item>
    </a-form>
  </a-card>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import { SearchOutlined } from '@ant-design/icons-vue'; // 导入 Icon
import request from '../utils/request';

const formState = reactive({
  keywords: '',
  province: undefined,
  city: undefined,
  district: undefined,
});

const provinces = ref([]);
const cities = ref([]);
const districts = ref([]);
const loading = ref(false);

// 声明 emit 事件
const emit = defineEmits(['search']);

// 获取省份列表
const fetchProvinces = async () => {
  try {
    const response = await request.get('/api/districts');
    if (response.data.success) {
      provinces.value = response.data.data;
    } else {
      message.error(response.data.error || '获取省份列表失败');
    }
  } catch (error) {
    message.error('获取省份列表请求失败');
  }
};

// 处理省份选择变化
const handleProvinceChange = (value) => {
  const province = provinces.value.find(p => p.name === value);
  if (province && province.districts) {
    cities.value = province.districts;
    districts.value = []; // 清空区县
    formState.city = undefined; // 清空城市选择
    formState.district = undefined; // 清空区县选择
  } else {
    cities.value = [];
    districts.value = [];
    formState.city = undefined;
    formState.district = undefined;
  }
};

// 处理城市选择变化
const handleCityChange = (value) => {
  const city = cities.value.find(c => c.name === value);
  if (city && city.districts) {
    districts.value = city.districts;
    formState.district = undefined; // 清空区县选择
  } else {
    districts.value = [];
    formState.district = undefined;
  }
};

// 处理搜索提交
const handleSearch = (values) => {
  // 发射 search 事件，将搜索参数传递给父组件
  emit('search', values);
};

onMounted(() => {
  fetchProvinces();
});

// 将 loading 状态暴露出去，由父组件控制搜索过程中的 loading 状态
defineExpose({
  loading
});

</script>

<style scoped>
.search-form {
  margin-bottom: 24px;
}
</style> 