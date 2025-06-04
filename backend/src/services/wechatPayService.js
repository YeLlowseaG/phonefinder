const crypto = require('crypto');
const xml2js = require('xml2js');
const axios = require('axios'); // 导入 axios

// TODO: 微信支付配置，从环境变量或配置文件读取
const WECHAT_PAY_CONFIG = {
  appId: process.env.WECHAT_APP_ID,
  mchId: process.env.WECHAT_MCH_ID,
  apiKey: process.env.WECHAT_API_KEY,
  notifyUrl: process.env.WECHAT_PAY_NOTIFY_URL,
  // TODO: 填写真实的证书路径
  // pfx: require('fs').readFileSync('/path/to/your/apiclient_cert.p12'), // 商户证书
  // passphrase: 'YOUR_CERT_PASSWORD', // 证书密码
};

// 微信支付统一下单 API 地址
const UNIFIED_ORDER_URL = 'https://api.mch.weixin.qq.com/pay/unifiedorder';

// 生成随机字符串
function generateNonceStr() {
  return Math.random().toString(36).substr(2, 15);
}

// 将对象转换为查询字符串
function toQueryString(obj) {
  return Object.keys(obj)
    .filter(key => obj[key] !== undefined && obj[key] !== '')
    .sort()
    .map(key => `${key}=${obj[key]}`)
    .join('&');
}

// 生成签名
function sign(data, apiKey) {
  const stringA = toQueryString(data);
  const stringSignTemp = `${stringA}&key=${apiKey}`;
  const signValue = crypto.createHash('md5').update(stringSignTemp, 'utf8').digest('hex').toUpperCase();
  return signValue;
}

// 将对象转换为 XML
function jsonToXml(obj) {
  const builder = new xml2js.Builder({ rootName: 'xml', headless: true });
  return builder.buildObject(obj);
}

// 将 XML 转换为对象
function xmlToJson(xml) {
  return new Promise((resolve, reject) => {
    xml2js.parseString(xml, { explicitArray: false }, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result.xml);
      }
    });
  });
}

/**
 * 验证微信支付通知签名 (APIv2 签名算法)
 * @param {object} data 微信支付通知数据对象
 * @param {string} apiKey 商户 APIv2 密钥
 * @returns {boolean} 签名是否有效
 */
function verifySign(data, apiKey) {
  // 1. 将数据对象转为数组，并移除 sign 字段
  const keys = Object.keys(data).filter(key => key !== 'sign');

  // 2. 按照字典序排序
  keys.sort();

  // 3. 拼接字符串 A
  const stringA = keys.map(key => `${key}=${data[key]}`).join('&');

  // 4. 拼接 API 密钥
  const stringSignTemp = `${stringA}&key=${apiKey}`;

  // 5. 计算签名 (MD5 并转大写)
  const signValue = crypto.createHash('md5').update(stringSignTemp, 'utf8').digest('hex').toUpperCase();

  // 6. 比对签名
  return signValue === data.sign;
}

/**
 * 创建微信支付预订单 (Native Pay - 扫码支付)
 * @param {string} orderId 商户订单号
 * @param {number} amount 订单总金额 (单位：分)
 * @param {string} description 订单描述
 * @param {string} clientIp 客户端IP
 * @returns {Promise<object>} 包含 code_url 或错误信息的 Promise
 */
async function createNativePayOrder(orderId, amount, description, clientIp) {
  // 实际调用微信支付统一下单 API 的参数构建
  const params = {
    appid: WECHAT_PAY_CONFIG.appId,
    mch_id: WECHAT_PAY_CONFIG.mchId,
    nonce_str: generateNonceStr(),
    body: description, // 商品描述
    out_trade_no: orderId, // 商户订单号
    total_fee: amount, // 总金额 (单位：分)
    spbill_create_ip: clientIp, // 终端IP
    notify_url: WECHAT_PAY_CONFIG.notifyUrl, // 通知地址
    trade_type: 'NATIVE', // 交易类型，NATIVE 为扫码支付
    // product_id: 'YOUR_PRODUCT_ID', // 扫码支付必填，此处需要根据实际商品填写
  };

  // 生成签名 (这是给微信支付 API 请求的签名)
  params.sign = sign(params, WECHAT_PAY_CONFIG.apiKey);

  const xmlBody = jsonToXml(params); // 将请求参数转为 XML

  try {
    console.log('Sending to Wechat Pay API:', xmlBody);

    // ** 调用微信支付统一下单 API **
    const response = await axios.post(UNIFIED_ORDER_URL, xmlBody, {
        headers: {
            'Content-Type': 'text/xml'
        },
        // 如果需要证书，配置 httpsAgent
        // httpsAgent: new (require('https').Agent)({
        //     pfx: WECHAT_PAY_CONFIG.pfx,
        //     passphrase: WECHAT_PAY_CONFIG.passphrase,
        // })
    });

    console.log('Received from Wechat Pay API:', response.data);

    // 将返回的 XML 数据解析为对象
    const result = await xmlToJson(response.data);
    console.log('Parsed Wechat Pay API response:', result);

    // 检查微信支付 API 返回结果
    if (result.return_code === 'SUCCESS' && result.result_code === 'SUCCESS') {
      // 成功时返回 code_url (扫码支付)
      return { success: true, code_url: result.code_url, prepay_id: result.prepay_id }; // 实际返回中可能也包含 prepay_id
    } else {
      // 处理 API 返回的错误信息
      return { success: false, error: result.return_msg || result.err_code_des || '微信支付统一下单失败' };
    }

  } catch (error) {
    console.error('调用微信支付统一下单 API 异常:', error.message);
    // 对于 axios 错误，可以打印更多信息
    if (error.response) {
        console.error('API 响应状态码:', error.response.status);
        console.error('API 响应数据:', error.response.data);
    } else if (error.request) {
        console.error('API 请求无响应:', error.request);
    } else {
        console.error('请求设置错误:', error.message);
    }

    return { success: false, error: '调用微信支付统一下单 API 失败' };
  }
}

module.exports = {
  createNativePayOrder,
  WECHAT_PAY_CONFIG,
  verifySign,
  // 其他支付相关函数
}; 