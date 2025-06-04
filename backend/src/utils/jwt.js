const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// 生成 JWT token
const generateToken = (userId) => {
    return jwt.sign(
        { userId },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
};

// 验证 JWT token
const verifyToken = (token) => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        throw new Error('Invalid token');
    }
};

module.exports = {
    generateToken,
    verifyToken
}; 