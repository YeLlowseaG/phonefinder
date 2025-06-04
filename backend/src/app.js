require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { body, query, validationResult } = require('express-validator');
const amapService = require('./services/amapService');
//const tcb = require('@cloudbase/node-sdk'); // 导入微信云托管 SDK
// const connectDB = require('./db'); // 导入数据库连接函数
// const prisma = require('./utils/prisma'); // 导入 Prisma 客户端
const { generateToken } = require('./utils/jwt');
const authMiddleware = require('./middleware/auth');
const XLSX = require('xlsx'); // 导入 xlsx 库
const wechatPayService = require('./services/wechatPayService'); // 导入微信支付服务
const { WECHAT_PAY_CONFIG, verifySign } = require('./services/wechatPayService'); // 导入 WECHAT_PAY_CONFIG 和 verifySign
const xmlparser = require('express-xml-bodyparser'); // 导入用于解析 XML 请求体的中间件
const xml2js = require('xml2js'); // 导入 xml2js 用于构建 XML 响应
// const PaymentIntent = require('./models/PaymentIntent'); // 导入 PaymentIntent 模型

// 初始化微信云托管 SDK
const appTcb = tcb.init({
  env: process.env.TENCENTCLOUD_RUNENVID || 'prod-0g944rmt0a4fee15' // 从环境变量获取环境 ID，或替换为你的环境 ID
});
const db = appTcb.database(); // 获取数据库引用
const _ = db.command; // 获取数据库命令对象

// 连接数据库 (现在由 SDK 管理连接，无需手动调用)
// connectDB();

const app = express();
const PORT = process.env.PORT || 3306;

// 中间件
app.use(cors());
app.use(express.json());
// 添加解析微信支付通知 XML 请求体的中间件
// extended: false 表示使用 qs 库解析 URL-encoded 数据，而不是 querystring 库
// recommend options for strict XML parsing
app.use(xmlparser({
  trim: true,
  explicitArray: false,
  normalize: false,
  normalizeTags: false,
  tagNameProcessors: [xml2js.processors.stripPrefix]
}));

// 内存中的验证码存储 (简单示例，生产环境请使用 Redis 或数据库)
const verificationCodes = {};

// 验证中间件
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }
    next();
};

// 路由：搜索POI
app.get('/api/search', authMiddleware, [
    query('keywords').notEmpty().withMessage('关键词不能为空'),
    query('city').notEmpty().withMessage('城市不能为空'),
    query('page').optional().isInt({ min: 1 }).withMessage('页码必须是大于0的整数'),
    query('pageSize').optional().isInt({ min: 1, max: 50 }).withMessage('每页数量必须在1-50之间'),
    validate
], async (req, res) => {
    try {
        // 从认证中间件中获取用户 ID
        const userId = req.userId;
        // 根据用户 ID 查找用户对象
        const userRes = await db.collection('users').doc(userId).get();
        const user = userRes.data[0];

        if (!user) {
            return res.status(404).json({ success: false, error: '用户未找到' });
        }

        const { keywords, city, page = 1, pageSize = 20 } = req.query;
        // 将用户对象传递给 amapService.searchPOI
        const result = await amapService.searchPOI(keywords, city, user, parseInt(page), parseInt(pageSize));
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: '服务器内部错误'
        });
    }
});

// 路由：获取行政区划
app.get('/api/districts', async (req, res) => {
    try {
        const result = await amapService.getDistrictList();
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: '服务器内部错误'
        });
    }
});

// 路由：发送手机验证码
app.post('/api/auth/send-code', [
    body('phone').isMobilePhone('zh-CN').withMessage('请填写有效的手机号码'),
    validate
], async (req, res) => {
    const { phone } = req.body;

    // 生成随机验证码 (6位数字)
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // 存储验证码及过期时间 (例如，5分钟后过期)
    verificationCodes[phone] = { code, expires: Date.now() + 5 * 60 * 1000 };

    console.log(`手机 ${phone} 的验证码是：${code}`); // 实际应用中应通过短信服务发送

    res.json({ success: true, message: '验证码已发送' });
});

// 路由：验证手机验证码并登录/注册
app.post('/api/auth/verify-code', [
    body('phone').isMobilePhone('zh-CN').withMessage('请填写有效的手机号码'),
    body('code').isLength({ min: 6, max: 6 }).withMessage('验证码格式不正确'),
    validate
], async (req, res) => {
    const { phone, code } = req.body;

    // 检查是否有该手机号的验证码
    if (!verificationCodes[phone]) {
        return res.status(400).json({ success: false, error: '验证码无效或已过期' });
    }

    const storedCode = verificationCodes[phone];

    // 检查验证码是否匹配且未过期
    if (storedCode.code !== code || storedCode.expires < Date.now()) {
        // 验证失败或过期，移除验证码
        delete verificationCodes[phone];
        return res.status(400).json({ success: false, error: '验证码无效或已过期' });
    }

    // 验证成功，移除验证码
    delete verificationCodes[phone];

    try {
        // 查找用户，如果不存在则创建新用户
        const userRes = await db.collection('users').where({ phone }).get();
        let user = userRes.data[0];

        if (!user) {
            // 用户不存在，创建新用户
            const newUserRes = await db.collection('users').add({ phone });
            // 微信云托管 add 返回的是 _id，需要重新查询才能获取完整用户对象（或修改前端逻辑）
            // 为了简化，这里创建一个简化的 user 对象用于生成 token 和返回响应
            user = { _id: newUserRes.id, phone }; 
            console.log(`新用户注册成功，手机号: ${phone}`);
        } else {
            console.log(`用户登录成功，手机号: ${phone}`);
        }

        // 生成 JWT token
        const token = generateToken(user._id); // 使用 _id 字段生成 token

        res.json({
            success: true,
            message: '登录成功',
            data: {
                userId: user._id, // 使用 _id
                token,
                phone: user.phone
            }
        });

    } catch (error) {
        console.error('登录/注册失败:', error);
        res.status(500).json({ success: false, error: '服务器内部错误' });
    }
});

// 添加一个获取当前用户信息的接口
app.get('/api/auth/me', authMiddleware, async (req, res) => {
    try {
        const userId = req.userId; // 从 authMiddleware 获取 _id
        const userRes = await db.collection('users').doc(userId).get();
        const user = userRes.data[0];
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: '用户不存在'
            });
        }

        res.json({
            success: true,
            data: {
                userId: user._id, // 使用 _id
                phone: user.phone,
                membershipType: user.membershipType,
                dailyExportCount: user.dailyExportCount,
                dailyExportCountResetDate: user.dailyExportCountResetDate
            }
        });
    } catch (error) {
        console.error('获取用户信息失败:', error);
        res.status(500).json({
            success: false,
            error: '服务器内部错误'
        });
    }
});

// 路由：导出数据
app.post('/api/export', authMiddleware, async (req, res) => {
    try {
        const userId = req.userId; // 从认证中间件获取用户 _id
        const userRes = await db.collection('users').doc(userId).get();
        const user = userRes.data[0];

        if (!user) {
            return res.status(404).json({ success: false, error: '用户未找到' });
        }

        const exportData = req.body.data; // 假设前端将要导出的数据放在请求体中的 data 字段

        if (!exportData || !Array.isArray(exportData) || exportData.length === 0) {
            return res.status(400).json({ success: false, error: '没有有效的导出数据' });
        }

        // 会员权限检查和每日导出计数逻辑
        const maxDailyExportStandard = 500; // 普通会员每日导出上限
        const today = new Date();
        today.setHours(0, 0, 0, 0); // 设置到今天开始

        // 检查是否是新的一天，如果是则重置计数
        if (!user.dailyExportCountResetDate || new Date(user.dailyExportCountResetDate).getTime() < today.getTime()) {
            user.dailyExportCount = 0;
            // 注意：微信云托管数据库的日期类型可能与 Node.js Date 对象略有不同，这里直接使用 Date.now() 或 new Date() 可能需要根据实际情况调整
            // 建议在数据库中存储为时间戳或标准的 ISO 8601 字符串
            user.dailyExportCountResetDate = new Date(); // 使用 Date 对象，如果同步有问题，可能需要转成时间戳或字符串
        }

        switch (user.membershipType) {
            case 'free':
                return res.status(403).json({ success: false, error: '免费用户无导出权限，请升级会员。' });
            case 'standard':
                if (user.dailyExportCount + exportData.length > maxDailyExportStandard) {
                    return res.status(403).json({ success: false, error: `普通会员每日最多导出 ${maxDailyExportStandard} 条，您今日已超出限制。` });
                }
                // TODO: 更新用户的 dailyExportCount 将在 Excel 生成成功后进行
                break;
            case 'premium':
                // 高级会员无导出数量限制
                break;
            default:
                return res.status(403).json({ success: false, error: '未知会员类型，无导出权限。' });
        }

        // 使用 xlsx 库生成 Excel 文件
        // 准备导出数据（假设前端发送的数据结构是后端需要的）
        const worksheetData = exportData.map(item => ({
            名称: item.name || '',
            地址: item.address || '',
            电话: item.phone || '',
            商圈: item.businessArea || '',
            类型: item.type || '',
        }));

        const worksheet = XLSX.utils.json_to_sheet(worksheetData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, '商家电话');

        // 生成 Excel 文件 Buffer
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

        // 更新用户的 dailyExportCount (如果适用)
        if (user.membershipType === 'standard') {
             // 使用 _.inc() 原子更新操作，避免并发问题
             await db.collection('users').doc(userId).update({
                 data: { dailyExportCount: _.inc(exportData.length) }
                 // 注意：dailyExportCountResetDate 如果在同一天多次导出，不应该被 inc 覆盖
                 // 且如果涉及跨天重置，逻辑需要在 dailyExportCountResetDate 判断部分处理
             });
        }

        // 设置响应头以便前端下载文件
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        // 对文件名进行编码以避免特殊字符问题
        const filename = '商家电话搜索结果.xlsx';
        const encodedFilename = encodeURIComponent(filename);
        res.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);
        res.send(excelBuffer);

    } catch (error) {
        console.error('导出数据失败:', error);
        res.status(500).json({ success: false, error: '服务器内部错误' });
    }
});

// 路由：创建支付订单 (统一下单)
app.post('/api/payment/create-order', authMiddleware, [
    body('membershipType').isIn(['standard', 'premium']).withMessage('无效的会员类型'), // 验证会员类型
    validate
], async (req, res) => {
    try {
        const userId = req.userId; // 从认证中间件获取用户 _id
        const userRes = await db.collection('users').doc(userId).get();
        const user = userRes.data[0];
        if (!user) {
            return res.status(404).json({ success: false, error: '用户未找到' });
        }

        const { membershipType } = req.body;

        const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
         // 生成唯一的商户订单号 (这里简化使用用户ID和时间戳)
        // 注意：微信云托管数据库的 _id 是 String 类型
        const orderId = `${WECHAT_PAY_CONFIG.mchId || 'MCH'}${Date.now()}${userId.toString().slice(-6)}`;

        // TODO: 根据 membershipType 确定订单金额、商品描述等信息 (已存在)
        const amount = membershipType === 'standard' ? 1000 : 10000; // 示例金额 (单位：分)
        const description = `${membershipType} 会员升级`;

        // 创建 PaymentIntent 记录
        const paymentIntentRes = await db.collection('payment_intents').add({
            outTradeNo: orderId,
            userId: userId, // 存储用户 _id
            membershipType: membershipType,
            amount: amount,
            status: 'pending', // 初始状态为待支付
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        const paymentIntentId = paymentIntentRes.id; // 获取新创建的记录 ID

        const createOrderResult = await wechatPayService.createNativePayOrder(orderId, amount, description, clientIp);

        if (createOrderResult.success) {
             // 返回支付二维码链接和订单号给前端
            res.json({ success: true, data: { codeUrl: createOrderResult.code_url, orderId: orderId } });
        } else {
             // 如果微信支付统一下单失败，将 PaymentIntent 状态更新为 failed
            await db.collection('payment_intents').doc(paymentIntentId).update({
                data: { status: 'failed' }
            });

            // 如果 wechatPayService 返回 success: false，则使用它返回的错误信息
            res.status(500).json({ success: false, error: createOrderResult.error });
        }

    } catch (error) {
        console.error('创建支付订单失败:', error);
        res.status(500).json({ success: false, error: '服务器内部错误' });
    }
});

// TODO: 添加查询订单状态接口 (/api/payment/query-order)
// 可选，用于前端查询订单支付状态
app.get('/api/payment/query-order', authMiddleware, [
    query('outTradeNo').notEmpty().withMessage('商户订单号不能为空'),
    validate
], async (req, res) => {
    try {
        const userId = req.userId; // 从认证中间件获取用户 _id
        const { outTradeNo } = req.query;

        // 查找对应用户和订单号的 PaymentIntent 记录
        // 注意：微信云托管数据库 where 多个条件是 AND 关系
        const paymentIntentRes = await db.collection('payment_intents').where({ outTradeNo: outTradeNo, userId: userId }).get();
        const paymentIntent = paymentIntentRes.data[0];

        if (!paymentIntent) {
            console.warn('Attempted to query non-existent or unauthorized order:', outTradeNo, 'User ID:', userId);
            return res.status(404).json({ success: false, error: '订单未找到或不属于当前用户' });
        }

        // 返回订单状态和相关信息给前端
        res.json({
            success: true,
            data: {
                outTradeNo: paymentIntent.outTradeNo,
                status: paymentIntent.status,
                membershipType: paymentIntent.membershipType,
                amount: paymentIntent.amount,
                createdAt: paymentIntent.createdAt, // 添加创建时间
                paidAt: paymentIntent.paidAt, // 添加支付时间
                // 可以根据需要添加更多信息，例如微信交易号 wechatTransactionId
            }
        });

    } catch (error) {
        console.error('查询订单状态失败:', error, 'Query:', req.query, 'User ID:', req.userId);
        res.status(500).json({ success: false, error: '服务器内部错误' });
    }
});

// 路由：接收微信支付结果通知
app.post('/api/payment/notify', async (req, res) => {
    console.log('Received Wechat Pay Notification:', req.body);

    const notifyData = req.body;

    // 检查通信状态
    if (!notifyData || notifyData.return_code !== 'SUCCESS') {
        console.error('Wechat Pay Notification Communication Failure:', notifyData);
        // 返回失败响应
        const failXml = new xml2js.Builder({ rootName: 'xml', headless: true }).buildObject({
            return_code: 'FAIL',
            return_msg: '通信失败'
        });
        res.set('Content-Type', 'text/xml').status(200).send(failXml);
        return;
    }

    // 重要的签名验证逻辑
    // 在实际项目中，您需要根据微信支付的文档严格验证签名，防止伪造通知。
    const isSignValid = verifySign(notifyData, WECHAT_PAY_CONFIG.apiKey);
    if (!isSignValid) {
        console.error('Wechat Pay Notification Signature Verification Failed:', notifyData);
        const failXml = new xml2js.Builder({ rootName: 'xml', headless: true }).buildObject({
            return_code: 'FAIL',
            return_msg: '签名失败'
        });
        res.set('Content-Type', 'text/xml').status(200).send(failXml);
        return;
    }


    // 检查业务结果
    if (notifyData.result_code === 'SUCCESS') {
        // 支付成功，处理业务逻辑
        const { out_trade_no, total_fee, transaction_id, time_end, appid, mch_id } = notifyData;
        console.log('Payment Success:', { out_trade_no, total_fee, transaction_id, time_end, appid, mch_id });

        try {
            // 1. 根据 out_trade_no 查找 PaymentIntent 记录
            const paymentIntentRes = await db.collection('payment_intents').where({ outTradeNo: out_trade_no }).get();
            const paymentIntent = paymentIntentRes.data[0];

            // 2. 检查 PaymentIntent 是否存在且状态为 pending
            if (!paymentIntent || paymentIntent.status !== 'pending') {
                 console.warn('Invalid or already processed PaymentIntent for out_trade_no:', out_trade_no, 'Current status:', paymentIntent ? paymentIntent.status : 'Not Found');
                 // 即使 PaymentIntent 无效，也返回SUCCESS，避免微信重复发送
                 const successXml = new xml2js.Builder({ rootName: 'xml', headless: true }).buildObject({
                    return_code: 'SUCCESS',
                    return_msg: 'OK'
                 });
                 res.set('Content-Type', 'text/xml').status(200).send(successXml);
                 return;
            }

            // 3. 重要的安全检查：验证金额、appid、mch_id
            if (parseInt(total_fee) !== paymentIntent.amount || appid !== WECHAT_PAY_CONFIG.appId || mch_id !== WECHAT_PAY_CONFIG.mchId) {
                 console.error('Payment Intent Security Check Failed for out_trade_no:', out_trade_no, 'Notification data:', notifyData, 'PaymentIntent data:', paymentIntent);
                 // 记录异常或进行补偿处理
                 await db.collection('payment_intents').doc(paymentIntent._id).update({
                     data: { status: 'failed', error: '安全验证失败: 金额/appid/mch_id 不匹配' }
                 });

                 const failXml = new xml2js.Builder({ rootName: 'xml', headless: true }).buildObject({
                    return_code: 'FAIL',
                    return_msg: '安全验证失败'
                 });
                 res.set('Content-Type', 'text/xml').status(200).send(failXml);
                 return;
            }

            // 4. 支付成功，更新 PaymentIntent 状态和相关信息
            await db.collection('payment_intents').doc(paymentIntent._id).update({
                data: { status: 'paid', wechatTransactionId: transaction_id, paidAt: new Date() }
            });
            console.log(`PaymentIntent ${out_trade_no} 状态更新为 paid`);

            // 5. 更新用户会员状态
            const userRes = await db.collection('users').doc(paymentIntent.userId).get();
            const user = userRes.data[0];
            if (user) {
                 // 根据 paymentIntent.membershipType 设置新的会员类型和计算过期时间
                 const standardDurationDays = parseInt(process.env.MEMBERSHIP_STANDARD_DURATION_DAYS || '30');
                 const premiumDurationDays = parseInt(process.env.MEMBERSHIP_PREMIUM_DURATION_DAYS || '365');

                 let newMembershipExpiryDate = null;
                 if (paymentIntent.membershipType === 'standard') {
                     newMembershipExpiryDate = new Date(Date.now() + standardDurationDays * 24 * 60 * 60 * 1000);
                 } else if (paymentIntent.membershipType === 'premium') {
                      newMembershipExpiryDate = new Date(Date.now() + premiumDurationDays * 24 * 60 * 60 * 1000);
                 }

                 // 考虑现有会员未过期的情况，应在现有过期时间基础上延长 (TODO)
                 // 为了简化，这里直接覆盖过期时间。如果需要叠加，逻辑会复杂一些。

                 await db.collection('users').doc(user._id).update({
                     data: {
                         membershipType: paymentIntent.membershipType,
                         membershipExpiryDate: newMembershipExpiryDate
                     }
                 });
                 console.log(`用户 ${user._id} 会员状态更新成功为 ${user.membershipType}，过期至 ${newMembershipExpiryDate}`);
            } else {
                 console.error('User not found for PaymentIntent:', out_trade_no, 'User ID:', paymentIntent.userId, 'Notification Data:', notifyData);
                 // TODO: 记录异常，可能需要人工介入或补偿。
            }

             // 返回成功响应给微信支付
            const successXml = new xml2js.Builder({ rootName: 'xml', headless: true }).buildObject({
                return_code: 'SUCCESS',
                return_msg: 'OK'
            });
            res.set('Content-Type', 'text/xml').status(200).send(successXml);

        } catch (error) {
             console.error('处理支付成功通知时发生错误:', error, 'Notification Data:', notifyData);
             // TODO: 记录异常或进行补偿处理。

             // 返回失败响应 (可选，根据微信支付文档，处理异常时返回FAIL让微信重试)
             const failXml = new xml2js.Builder({ rootName: 'xml', headless: true }).buildObject({
                 return_code: 'FAIL',
                 return_msg: '处理失败'
             });
             res.set('Content-Type', 'text/xml').status(200).send(failXml);
        }


    } else {
        // 支付失败或其他业务错误
        console.warn('Wechat Pay Notification Business Error:', notifyData.return_msg || notifyData.err_code_des || 'Unknown error', 'Notification Data:', notifyData);

        // 根据 out_trade_no 查找 PaymentIntent 并更新状态为 failed 或 closed
         try{
            const paymentIntentRes = await db.collection('payment_intents').where({ outTradeNo: notifyData.out_trade_no }).get();
            const paymentIntent = paymentIntentRes.data[0];

            if(paymentIntent && paymentIntent.status === 'pending'){
                 await db.collection('payment_intents').doc(paymentIntent._id).update({
                     data: { status: 'failed', error: `微信支付业务失败: ${notifyData.return_msg || notifyData.err_code_des || '未知错误'} (微信交易号: ${notifyData.transaction_id})` }
                 });
                 console.log(`PaymentIntent ${notifyData.out_trade_no} 状态更新为 failed`);
            } else if (paymentIntent) {
                 console.log(`PaymentIntent ${notifyData.out_trade_no} 状态已不是 pending (${paymentIntent.status}), 不进行更新。`);
            }

         } catch (error) {
             console.error('处理支付失败通知时更新 PaymentIntent 发生错误:', error, 'Notification Data:', notifyData);
         }

        // 即使业务失败，只要接收到通知并处理完毕，也要返回SUCCESS给微信，避免重复发送
         const successXml = new xml2js.Builder({ rootName: 'xml', headless: true }).buildObject({
             return_code: 'SUCCESS',
             return_msg: 'OK'
         });
         res.set('Content-Type', 'text/xml').status(200).send(successXml);
    }
});

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        error: '服务器内部错误'
    });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
}); 