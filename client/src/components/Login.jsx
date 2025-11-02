import { useState, useEffect } from 'react';
import axios from 'axios';

// 自适应 API 基地址：本地使用 4000 端口，部署后使用相对路径
const API_BASE_URL =
  typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:4000'
    : '';

const Login = ({ onLogin, onChangePassword }) => {
  const [password, setPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    try {
      const response = await axios.post(`${API_BASE_URL}/api/password/verify`, { password });
      if (response.data.success) {
        onLogin();
      } else {
        setError('密码错误，请重试');
      }
    } catch (err) {
      setError(err.response?.data?.message || '登录失败，请重试');
      // 如果服务器不可用，使用本地存储作为备份
      const storedPassword = localStorage.getItem('app_password') || 'admin';
      if (password === storedPassword) {
        onLogin();
        setError('');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      setIsLoading(false);
      return;
    }
    
    if (newPassword.length < 4) {
      setError('新密码长度不能少于4个字符');
      setIsLoading(false);
      return;
    }
    
    try {
      const response = await axios.post(`${API_BASE_URL}/api/password/change`, { 
        currentPassword, 
        newPassword 
      });
      
      if (response.data.success) {
        // 同时更新本地存储作为备份
        localStorage.setItem('app_password', newPassword);
        setIsChangingPassword(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        onChangePassword && onChangePassword();
      }
    } catch (err) {
      setError(err.response?.data?.message || '修改密码失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleChangePassword = () => {
    setIsChangingPassword(!isChangingPassword);
    setError('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-semibold text-center text-slate-900 mb-6">
          Cloudflare DNS 管理器
        </h1>
        
        {!isChangingPassword ? (
          <>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                  请输入密码
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="输入密码"
                  required
                  disabled={isLoading}
                />
              </div>
              
              {error && (
                <div className="text-sm text-red-600">
                  {error}
                </div>
              )}
              
              <div className="flex items-center justify-between">
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:bg-indigo-300"
                  disabled={isLoading}
                >
                  {isLoading ? '登录中...' : '登录'}
                </button>
                <button
                  type="button"
                  onClick={toggleChangePassword}
                  className="text-sm text-indigo-600 hover:text-indigo-500"
                  disabled={isLoading}
                >
                  修改密码
                </button>
              </div>
            </form>
            <p className="mt-4 text-xs text-slate-500 text-center">
              默认密码: admin
            </p>
          </>
        ) : (
          <>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label htmlFor="currentPassword" className="block text-sm font-medium text-slate-700">
                  当前密码
                </label>
                <input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  required
                  disabled={isLoading}
                />
              </div>
              
              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700">
                  新密码
                </label>
                <input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  required
                  disabled={isLoading}
                />
              </div>
              
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700">
                  确认新密码
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  required
                  disabled={isLoading}
                />
              </div>
              
              {error && (
                <div className="text-sm text-red-600">
                  {error}
                </div>
              )}
              
              <div className="flex items-center justify-between">
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:bg-indigo-300"
                  disabled={isLoading}
                >
                  {isLoading ? '提交中...' : '确认修改'}
                </button>
                <button
                  type="button"
                  onClick={toggleChangePassword}
                  className="text-sm text-indigo-600 hover:text-indigo-500"
                  disabled={isLoading}
                >
                  返回登录
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default Login;
