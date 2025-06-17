<template>
  <div style="max-width: 900px; margin: 40px auto;">
    <h2>邀请码管理</h2>
    <div style="margin-bottom: 16px;">
      <a-input-number v-model:value="generateCount" :min="1" :max="50" style="width: 120px; margin-right: 8px;" />
      <a-button type="primary" @click="generateCodes">生成邀请码</a-button>
      <a-select v-model:value="statusFilter" style="width: 140px; margin-left: 16px;" allowClear placeholder="全部状态">
        <a-select-option value="unused">未用</a-select-option>
        <a-select-option value="used">已用</a-select-option>
        <a-select-option value="expired">作废</a-select-option>
      </a-select>
    </div>
    <a-table :dataSource="codes" :columns="columns" :pagination="pagination" rowKey="_id" @change="handleTableChange">
      <template #action="{ record }">
        <a-button v-if="record.status === 'unused'" size="small" @click="expireCode(record.code)">作废</a-button>
        <a-button v-if="record.status === 'expired'" size="small" @click="restoreCode(record.code)">恢复</a-button>
        <a-button size="small" @click="showDetail(record.code)">详情</a-button>
      </template>
    </a-table>
    <a-modal v-model:visible="detailVisible" title="邀请码详情" :footer="null" @cancel="detailVisible=false">
      <div v-if="detail">
        <p>邀请码：{{ detail.code }}</p>
        <p>状态：{{ detail.status }}</p>
        <p>手机号：{{ detail.usedByPhone || '未使用' }}</p>
        <p>创建时间：{{ formatDate(detail.createdAt) }}</p>
        <p v-if="detail.usedBy">使用人手机号：{{ detail.usedBy.phone }}</p>
        <p v-if="detail.usedAt">使用时间：{{ formatDate(detail.usedAt) }}</p>
      </div>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import request from '@/utils/request';

const codes = ref([]);
const pagination = ref({ current: 1, pageSize: 20, total: 0 });
const statusFilter = ref();
const generateCount = ref(1);
const detailVisible = ref(false);
const detail = ref(null);

const columns = [
  { title: '邀请码', dataIndex: 'code', key: 'code' },
  { title: '状态', dataIndex: 'status', key: 'status' },
  { title: '手机号', dataIndex: 'usedByPhone', key: 'usedByPhone' }, // 新增
  { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt',
    customRender: ({ text }) => formatDate(text) },
  { title: '操作', key: 'action', slots: { customRender: 'action' } },
];

function formatDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleString();
}

async function fetchCodes() {
  const { current, pageSize } = pagination.value;
  const params = { page: current, pageSize };
  if (statusFilter.value) params.status = statusFilter.value;
  const res = await request.get('/api/invite/list', { params });
  if (res.data.success) {
    codes.value = res.data.data.codes;
    pagination.value.total = res.data.data.total;
  }
}

function handleTableChange(pag) {
  pagination.value.current = pag.current;
  pagination.value.pageSize = pag.pageSize;
  fetchCodes();
}

async function generateCodes() {
  const res = await request.post('/api/invite/generate', { count: generateCount.value });
  if (res.data.success) {
    message.success('生成成功');
    fetchCodes();
  }
}

async function expireCode(code) {
  const res = await request.post('/api/invite/expire', { code });
  if (res.data.success) {
    message.success('作废成功');
    fetchCodes();
  }
}

async function restoreCode(code) {
  const res = await request.post('/api/invite/restore', { code });
  if (res.data.success) {
    message.success('恢复成功');
    fetchCodes();
  }
}

async function showDetail(code) {
  const res = await request.get('/api/invite/detail', { params: { code } });
  if (res.data.success) {
    detail.value = res.data.data;
    detailVisible.value = true;
  }
}

onMounted(fetchCodes);
</script> 