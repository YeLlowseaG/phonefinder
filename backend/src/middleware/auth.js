const { verifyToken } = require('../utils/jwt');

const authMiddleware = async (req, res, next) => {
    try {
        // 从请求头获取 token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: '未提供认证令牌'
            });
        }

        // 验证 token
        const token = authHeader.split(' ')[1];
        const decoded = verifyToken(token);
        
        // 将用户 ID 添加到请求对象中
        req.userId = decoded.userId;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            error: '无效的认证令牌'
        });
    }
};

module.exports = authMiddleware; 