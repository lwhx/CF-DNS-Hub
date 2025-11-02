const express = require('express');
const cors = require('cors');
const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables from the project root so the token never reaches the client bundle.
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 4000;

// 密码文件路径
const PASSWORD_FILE = path.join(__dirname, 'password.json');

// 确保密码文件存在，如果不存在则创建默认密码
if (!fs.existsSync(PASSWORD_FILE)) {
  fs.writeFileSync(PASSWORD_FILE, JSON.stringify({ password: 'admin' }), 'utf8');
}

// 开发环境中宽松的CORS配置，允许所有本地开发端口访问
app.use(
  cors({
    origin(origin, callback) {
      // 允许所有本地开发端口（localhost或127.0.0.1）
      if (!origin || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return callback(null, true);
      }
      return callback(new Error('Origin not allowed by CORS policy'));
    },
  })
);

app.use(express.json());

const cloudflareToken = process.env.CLOUDFLARE_API_TOKEN;

if (!cloudflareToken) {
  console.error('CLOUDFLARE_API_TOKEN is not set in the environment.');
  process.exit(1);
}

// 验证令牌格式
if (cloudflareToken === 'bYy6HQrhFRa6Zvz3Q619ViZ7ENBK9JFUQaOH7Aos') {
  console.warn('警告: 您正在使用示例API令牌，这不是有效的Cloudflare令牌。请在.env文件中设置您的实际Cloudflare API令牌。');
}

// Shared axios instance so every request uses the correct auth header.
const cloudflareClient = axios.create({
  baseURL: 'https://api.cloudflare.com/client/v4',
  headers: {
    Authorization: `Bearer ${cloudflareToken}`,
    'Content-Type': 'application/json',
  },
});

app.get('/api/zones', async (req, res, next) => {
  try {
    const { data } = await cloudflareClient.get('/zones', { params: req.query });
    return res.json(data.result);
  } catch (error) {
    return next(error);
  }
});

app.get('/api/zones/:zoneId/dns_records', async (req, res, next) => {
  const { zoneId } = req.params;
  try {
    const { data } = await cloudflareClient.get(`/zones/${zoneId}/dns_records`, { params: req.query });
    return res.json(data.result);
  } catch (error) {
    return next(error);
  }
});

app.post('/api/zones/:zoneId/dns_records', async (req, res, next) => {
  const { zoneId } = req.params;
  try {
    const { data } = await cloudflareClient.post(`/zones/${zoneId}/dns_records`, req.body);
    return res.status(201).json(data.result);
  } catch (error) {
    return next(error);
  }
});

app.put('/api/zones/:zoneId/dns_records/:recordId', async (req, res, next) => {
  const { zoneId, recordId } = req.params;
  try {
    const { data } = await cloudflareClient.put(`/zones/${zoneId}/dns_records/${recordId}`, req.body);
    return res.json(data.result);
  } catch (error) {
    return next(error);
  }
});

app.delete('/api/zones/:zoneId/dns_records/:recordId', async (req, res, next) => {
  const { zoneId, recordId } = req.params;
  try {
    const { data } = await cloudflareClient.delete(`/zones/${zoneId}/dns_records/${recordId}`);
    return res.json(data.result);
  } catch (error) {
    return next(error);
  }
});

// Health endpoint helps verify the proxy is running without hitting Cloudflare.
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// 密码管理API端点
app.get('/api/password', (req, res) => {
  try {
    const passwordData = JSON.parse(fs.readFileSync(PASSWORD_FILE, 'utf8'));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取密码信息失败' });
  }
});

app.post('/api/password/verify', (req, res) => {
  try {
    const { password } = req.body;
    const passwordData = JSON.parse(fs.readFileSync(PASSWORD_FILE, 'utf8'));
    
    if (password === passwordData.password) {
      res.json({ success: true });
    } else {
      res.status(401).json({ success: false, message: '密码错误' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: '验证密码失败' });
  }
});

app.post('/api/password/change', (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const passwordData = JSON.parse(fs.readFileSync(PASSWORD_FILE, 'utf8'));
    
    if (currentPassword !== passwordData.password) {
      return res.status(401).json({ success: false, message: '当前密码错误' });
    }
    
    passwordData.password = newPassword;
    fs.writeFileSync(PASSWORD_FILE, JSON.stringify(passwordData), 'utf8');
    
    res.json({ success: true, message: '密码修改成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '修改密码失败' });
  }
});

// Central error handler to surface Cloudflare API problems cleanly to the frontend.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.response) {
    const { status, data } = err.response;
    return res.status(status).json({
      success: false,
      errors: data?.errors || [{ message: data?.message || 'Cloudflare API error' }],
    });
  }

  console.error('Unexpected server error:', err.message);
  return res.status(500).json({
    success: false,
    errors: [{ message: 'Internal server error' }],
  });
});

app.listen(PORT, () => {
  console.log(`Cloudflare DNS manager proxy listening on port ${PORT}`);
});
