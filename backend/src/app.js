require('dotenv').config();
const xmlparser = require('express-xml-bodyparser');
const express = require('express');
const cors = require('cors');
const { body, query, validationResult } = require('express-validator');
const amapService = require('./services/amapService');
const { generateToken } = require('./utils/jwt');
const authMiddleware = require('./middleware/auth');
const XLSX = require('xlsx');
const wechatPayService = require('./services/wechatPayService');
const { WECHAT_PAY_CONFIG, verifySign } = require('./services/wechatPayService');
const xml2js = require('xml2js');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 8080;

// 中间件
app.use(express.json());

// 内存中的验证码存储
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
        const userId = req.userId;
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user) {
            return res.status(404).json({ success: false, error: '用户未找到' });
        }

        const { keywords, city, page = 1, pageSize = 20 } = req.query;
        const result = await amapService.searchPOI(keywords, city, user, parseInt(page), parseInt(pageSize));
        res.json(result);
    } catch (error) {
        console.error('搜索失败:', error);
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
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    verificationCodes[phone] = { code, expires: Date.now() + 5 * 60 * 1000 };
    console.log(`手机 ${phone} 的验证码是：${code}`);
    res.json({ success: true, message: '验证码已发送' });
});

// 路由：验证手机验证码并登录/注册
app.post('/api/auth/verify-code', [
    body('phone').isMobilePhone('zh-CN').withMessage('请填写有效的手机号码'),
    body('code').isLength({ min: 6, max: 6 }).withMessage('验证码格式不正确'),
    validate
], async (req, res) => {
    const { phone, code } = req.body;

    if (!verificationCodes[phone]) {
        return res.status(400).json({ success: false, error: '验证码无效或已过期' });
    }

    const storedCode = verificationCodes[phone];

    if (storedCode.code !== code || storedCode.expires < Date.now()) {
        delete verificationCodes[phone];
        return res.status(400).json({ success: false, error: '验证码无效或已过期' });
    }

    delete verificationCodes[phone];

    try {
        console.log('开始查找或创建用户', phone);
        let user = await prisma.user.findUnique({
            where: { phone }
        });

        if (!user) {
            user = await prisma.user.create({
                data: { phone }
            });
            console.log(`新用户注册成功，手机号: ${phone}`);
        } else {
            console.log(`用户登录成功，手机号: ${phone}`);
        }

        const token = generateToken(user.id);

        res.json({
            success: true,
            message: '登录成功',
            data: {
                userId: user.id,
                token,
                phone: user.phone
            }
        });

    } catch (error) {
        console.error('登录/注册失败:', error, error && error.stack);
        res.status(500).json({ success: false, error: '服务器内部错误' });
    }
});

// 获取当前用户信息
app.get('/api/auth/me', authMiddleware, async (req, res) => {
    try {
        const userId = req.userId;
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: '用户不存在'
            });
        }

        res.json({
            success: true,
            data: {
                userId: user.id,
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

// 导出数据
app.post('/api/export', authMiddleware, async (req, res) => {
    try {
        const userId = req.userId;
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user) {
            return res.status(404).json({ success: false, error: '用户未找到' });
        }

        const exportData = req.body.data;

        if (!exportData || !Array.isArray(exportData) || exportData.length === 0) {
            return res.status(400).json({ success: false, error: '没有有效的导出数据' });
        }

        const maxDailyExportStandard = 500;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (!user.dailyExportCountResetDate || new Date(user.dailyExportCountResetDate).getTime() < today.getTime()) {
            await prisma.user.update({
                where: { id: userId },
                data: { 
                    dailyExportCount: 0,
                    dailyExportCountResetDate: new Date()
                }
            });
        }

        switch (user.membershipType) {
            case 'free':
                return res.status(403).json({ success: false, error: '免费用户无导出权限，请升级会员。' });
            case 'standard':
                if (user.dailyExportCount + exportData.length > maxDailyExportStandard) {
                    return res.status(403).json({ success: false, error: `普通会员每日最多导出 ${maxDailyExportStandard} 条，您今日已超出限制。` });
                }
                break;
            case 'premium':
                break;
            default:
                return res.status(403).json({ success: false, error: '未知会员类型，无导出权限。' });
        }

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

        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

        if (user.membershipType === 'standard') {
            await prisma.user.update({
                where: { id: userId },
                data: { 
                    dailyExportCount: { increment: exportData.length }
                }
            });
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        const filename = '商家电话搜索结果.xlsx';
        const encodedFilename = encodeURIComponent(filename);
        res.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);
        res.send(excelBuffer);

    } catch (error) {
        console.error('导出数据失败:', error);
        res.status(500).json({ success: false, error: '服务器内部错误' });
    }
});

// 创建支付订单
app.post('/api/payment/create-order', authMiddleware, [
    body('membershipType').isIn(['standard', 'premium']).withMessage('无效的会员类型'),
    validate
], async (req, res) => {
    try {
        const userId = req.userId;
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user) {
            return res.status(404).json({ success: false, error: '用户未找到' });
        }

        const { membershipType } = req.body;
        const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const orderId = `${WECHAT_PAY_CONFIG.mchId || 'MCH'}${Date.now()}${userId.toString().slice(-6)}`;
        const amount = membershipType === 'standard' ? 100 : 10000;
        const description = `${membershipType} 会员升级`;

        const paymentIntent = await prisma.paymentIntent.create({
            data: {
                outTradeNo: orderId,
                userId: userId,
                membershipType: membershipType,
                amount: amount,
                status: 'pending',
                createdAt: new Date(),
                updatedAt: new Date(),
            }
        });

        const createOrderResult = await wechatPayService.createNativePayOrder(orderId, amount, description, clientIp);

        if (createOrderResult.success) {
            res.json({ success: true, data: { codeUrl: createOrderResult.code_url, orderId: orderId } });
        } else {
            await prisma.paymentIntent.update({
                where: { id: paymentIntent.id },
                data: { status: 'failed' }
            });

            res.status(500).json({ success: false, error: createOrderResult.error });
        }

    } catch (error) {
        console.error('创建支付订单失败:', error);
        res.status(500).json({ success: false, error: '服务器内部错误' });
    }
});

// 查询订单状态
app.get('/api/payment/query-order', authMiddleware, [
    query('outTradeNo').notEmpty().withMessage('商户订单号不能为空'),
    validate
], async (req, res) => {
    try {
        const userId = req.userId;
        const { outTradeNo } = req.query;

        const paymentIntent = await prisma.paymentIntent.findFirst({
            where: { 
                outTradeNo: outTradeNo,
                userId: userId
            }
        });

        if (!paymentIntent) {
            console.warn('Attempted to query non-existent or unauthorized order:', outTradeNo, 'User ID:', userId);
            return res.status(404).json({ success: false, error: '订单未找到或不属于当前用户' });
        }

        res.json({
            success: true,
            data: {
                outTradeNo: paymentIntent.outTradeNo,
                status: paymentIntent.status,
                membershipType: paymentIntent.membershipType,
                amount: paymentIntent.amount,
                createdAt: paymentIntent.createdAt,
                paidAt: paymentIntent.paidAt,
            }
        });

    } catch (error) {
        console.error('查询订单状态失败:', error, 'Query:', req.query, 'User ID:', req.userId);
        res.status(500).json({ success: false, error: '服务器内部错误' });
    }
});

// 接收微信支付结果通知
app.post('/api/payment/notify', xmlparser(), async (req, res) => {
    console.log('Received Wechat Pay Notification:', req.body);

    const notifyData = req.body;

    if (!notifyData || notifyData.return_code !== 'SUCCESS') {
        console.error('Wechat Pay Notification Communication Failure:', notifyData);
        const failXml = new xml2js.Builder({ rootName: 'xml', headless: true }).buildObject({
            return_code: 'FAIL',
            return_msg: '通信失败'
        });
        res.set('Content-Type', 'text/xml').status(200).send(failXml);
        return;
    }

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

    if (notifyData.result_code === 'SUCCESS') {
        const { out_trade_no, total_fee, transaction_id, time_end, appid, mch_id } = notifyData;
        console.log('Payment Success:', { out_trade_no, total_fee, transaction_id, time_end, appid, mch_id });

        try {
            const paymentIntent = await prisma.paymentIntent.findFirst({
                where: { outTradeNo: out_trade_no }
            });

            if (!paymentIntent || paymentIntent.status !== 'pending') {
                console.warn('Invalid or already processed PaymentIntent for out_trade_no:', out_trade_no, 'Current status:', paymentIntent ? paymentIntent.status : 'Not Found');
                const successXml = new xml2js.Builder({ rootName: 'xml', headless: true }).buildObject({
                    return_code: 'SUCCESS',
                    return_msg: 'OK'
                });
                res.set('Content-Type', 'text/xml').status(200).send(successXml);
                return;
            }

            if (parseInt(total_fee) !== paymentIntent.amount || appid !== WECHAT_PAY_CONFIG.appId || mch_id !== WECHAT_PAY_CONFIG.mchId) {
                console.error('Payment Intent Security Check Failed for out_trade_no:', out_trade_no, 'Notification data:', notifyData, 'PaymentIntent data:', paymentIntent);
                await prisma.paymentIntent.update({
                    where: { id: paymentIntent.id },
                    data: { 
                        status: 'failed',
                        error: '安全验证失败: 金额/appid/mch_id 不匹配'
                    }
                });

                const failXml = new xml2js.Builder({ rootName: 'xml', headless: true }).buildObject({
                    return_code: 'FAIL',
                    return_msg: '安全验证失败'
                });
                res.set('Content-Type', 'text/xml').status(200).send(failXml);
                return;
            }

            await prisma.paymentIntent.update({
                where: { id: paymentIntent.id },
                data: { 
                    status: 'paid',
                    wechatTransactionId: transaction_id,
                    paidAt: new Date()
                }
            });
            console.log(`PaymentIntent ${out_trade_no} 状态更新为 paid`);

            const user = await prisma.user.findUnique({
                where: { id: paymentIntent.userId }
            });

            if (user) {
                const standardDurationDays = parseInt(process.env.MEMBERSHIP_STANDARD_DURATION_DAYS || '30');
                const premiumDurationDays = parseInt(process.env.MEMBERSHIP_PREMIUM_DURATION_DAYS || '365');

                let newMembershipExpiryDate = null;
                if (paymentIntent.membershipType === 'standard') {
                    newMembershipExpiryDate = new Date(Date.now() + standardDurationDays * 24 * 60 * 60 * 1000);
                } else if (paymentIntent.membershipType === 'premium') {
                    newMembershipExpiryDate = new Date(Date.now() + premiumDurationDays * 24 * 60 * 60 * 1000);
                }

                await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        membershipType: paymentIntent.membershipType,
                        membershipExpiryDate: newMembershipExpiryDate
                    }
                });
                console.log(`用户 ${user.id} 会员状态更新成功为 ${paymentIntent.membershipType}，过期至 ${newMembershipExpiryDate}`);
            } else {
                console.error('User not found for PaymentIntent:', out_trade_no, 'User ID:', paymentIntent.userId, 'Notification Data:', notifyData);
            }

            const successXml = new xml2js.Builder({ rootName: 'xml', headless: true }).buildObject({
                return_code: 'SUCCESS',
                return_msg: 'OK'
            });
            res.set('Content-Type', 'text/xml').status(200).send(successXml);

        } catch (error) {
            console.error('处理支付成功通知时发生错误:', error, 'Notification Data:', notifyData);
            const failXml = new xml2js.Builder({ rootName: 'xml', headless: true }).buildObject({
                return_code: 'FAIL',
                return_msg: '处理失败'
            });
            res.set('Content-Type', 'text/xml').status(200).send(failXml);
        }

    } else {
        console.warn('Wechat Pay Notification Business Error:', notifyData.return_msg || notifyData.err_code_des || 'Unknown error', 'Notification Data:', notifyData);

        try {
            const paymentIntent = await prisma.paymentIntent.findFirst({
                where: { outTradeNo: notifyData.out_trade_no }
            });

            if (paymentIntent && paymentIntent.status === 'pending') {
                await prisma.paymentIntent.update({
                    where: { id: paymentIntent.id },
                    data: { 
                        status: 'failed',
                        error: `微信支付业务失败: ${notifyData.return_msg || notifyData.err_code_des || '未知错误'} (微信交易号: ${notifyData.transaction_id})`
                    }
                });
                console.log(`PaymentIntent ${notifyData.out_trade_no} 状态更新为 failed`);
            } else if (paymentIntent) {
                console.log(`PaymentIntent ${notifyData.out_trade_no} 状态已不是 pending (${paymentIntent.status}), 不进行更新。`);
            }

        } catch (error) {
            console.error('处理支付失败通知时更新 PaymentIntent 发生错误:', error, 'Notification Data:', notifyData);
        }

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