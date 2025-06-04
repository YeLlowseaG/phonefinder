const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    match: [/^1[3-9]\d{9}$/, '请填写有效的手机号码']
  },
  membershipType: { type: String, default: 'free' }, // 会员类型：free, standard, premium
  membershipExpiryDate: { type: Date }, // 会员到期时间
  dailyExportCount: { type: Number, default: 0 }, // 当日导出次数
  dailyExportCountResetDate: { type: Date, default: Date.now }, // 当日导出次数重置日期
  // 可以在这里添加其他用户字段，例如会员信息等
  // searchCount: { type: Number, default: 0 },
  // exportCount: { type: Number, default: 0 },
  // ... 其他字段
}, {
  timestamps: true // 添加创建时间和更新时间戳
});

const User = mongoose.model('User', UserSchema);

module.exports = User; 