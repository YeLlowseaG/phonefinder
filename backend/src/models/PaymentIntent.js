const mongoose = require('mongoose');

const paymentIntentSchema = new mongoose.Schema({
  outTradeNo: {
    type: String,
    required: true,
    unique: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  membershipType: {
    type: String,
    required: true,
    enum: ['standard', 'premium'], // 假设只有这两种付费会员类型
  },
  amount: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'paid', 'failed', 'closed'], // 支付意图的状态
    default: 'pending',
  },
  wechatTransactionId: {
    type: String,
  },
  paidAt: {
    type: Date,
  },
}, {
  timestamps: true, // 自动添加 createdAt 和 updatedAt 字段
});

const PaymentIntent = mongoose.model('PaymentIntent', paymentIntentSchema);

module.exports = PaymentIntent; 