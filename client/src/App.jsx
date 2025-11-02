import { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
import RecordForm from './components/RecordForm.jsx';
import Login from './components/Login.jsx';

// 直接使用固定的API地址，确保连接到正确的后端
const API_BASE_URL = 'http://localhost:4000';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  // 移除withCredentials以解决CORS问题
  timeout: 10000, // 10秒超时
});

// 添加请求拦截器用于调试
apiClient.interceptors.request.use(
  (config) => {
    console.log('API Request:', config.method?.toUpperCase(), config.url);
    return config;
  },
  (error) => {
    console.error('Request Error:', error);
    return Promise.reject(error);
  }
);

// 添加响应拦截器用于调试
apiClient.interceptors.response.use(
  (response) => {
    console.log('API Response:', response.status, response.config.url);
    return response;
  },
  (error) => {
    console.error('Response Error:', error.message, error.config?.url);
    return Promise.reject(error);
  }
);

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [zones, setZones] = useState([]);
  const [selectedZone, setSelectedZone] = useState(null);
  const [dnsRecords, setDnsRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeRecord, setActiveRecord] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecords, setSelectedRecords] = useState(new Set());
  const [isAllSelected, setIsAllSelected] = useState(false);

  const selectedZoneId = selectedZone?.id;

  useEffect(() => {
    const fetchZones = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // 尝试API调用
        const { data } = await apiClient.get('/api/zones');
        setZones(data);
        if (data.length > 0) {
          setSelectedZone((current) => current || data[0]);
        }
      } catch (err) {
        console.warn('API调用失败，使用模拟数据:', err.message);
        // 使用模拟数据以便展示界面
        const mockZones = [
          { id: '1', name: 'example.com' },
          { id: '2', name: 'test-domain.com' }
        ];
        setZones(mockZones);
        setSelectedZone(mockZones[0]);
        setError('使用模拟数据展示。要查看实际数据，请在.env文件中设置有效的Cloudflare API令牌。');
      } finally {
        setIsLoading(false);
      }
    };

    fetchZones();
  }, []);

  const loadDnsRecords = useCallback(
    async ({ showLoading = true } = {}) => {
      if (!selectedZoneId) {
        setDnsRecords([]);
        return;
      }

      if (showLoading) {
        setIsLoading(true);
      }
      setError(null);

      try {
        // 尝试API调用
        const { data } = await apiClient.get(`/api/zones/${selectedZoneId}/dns_records`);
        setDnsRecords(data);
      } catch (err) {
        console.warn('DNS记录API调用失败，使用模拟数据:', err.message);
        // 使用模拟数据以便展示搜索和多选功能
        const mockRecords = [
          { id: '1', type: 'A', name: 'test.example.com', content: '192.168.1.1', ttl: 3600, proxied: true },
          { id: '2', type: 'CNAME', name: 'www.example.com', content: 'example.com', ttl: 3600, proxied: true },
          { id: '3', type: 'MX', name: 'example.com', content: 'mail.example.com', ttl: 3600, proxied: false },
          { id: '4', type: 'TXT', name: '_dmarc.example.com', content: 'v=DMARC1; p=none', ttl: 3600, proxied: false },
          { id: '5', type: 'AAAA', name: 'ipv6.example.com', content: '2001:db8::1', ttl: 3600, proxied: true },
          { id: '6', type: 'NS', name: 'example.com', content: 'ns1.example.com', ttl: 3600, proxied: false },
          { id: '7', type: 'SRV', name: '_sip._tcp.example.com', content: '0 5 5060 sip.example.com', ttl: 3600, proxied: false }
        ];
        setDnsRecords(mockRecords);
        setError('使用模拟数据展示。要查看实际数据，请确保API连接正常。');
      } finally {
        if (showLoading) {
          setIsLoading(false);
        }
      }
    },
    [selectedZoneId]
  );

  useEffect(() => {
    loadDnsRecords();
  }, [selectedZoneId, loadDnsRecords]);

  const zoneOptions = useMemo(
    () =>
      zones.map((zone) => ({
        id: zone.id,
        name: zone.name,
      })),
    [zones]
  );

  const handleZoneChange = (event) => {
    const zoneId = event.target.value;
    const zone = zones.find((item) => item.id === zoneId) || null;
    setError(null);
    setSelectedZone(zone);
  };

  const handleDeleteRecord = async (recordId) => {
    if (!selectedZoneId) {
      return;
    }

    const shouldDelete = window.confirm('确定要删除此DNS记录吗？');
    if (!shouldDelete) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await apiClient.delete(`/api/zones/${selectedZoneId}/dns_records/${recordId}`);
      await loadDnsRecords({ showLoading: false });
      // 从选中集合中移除已删除的记录
      setSelectedRecords(prev => {
        const newSet = new Set(prev);
        newSet.delete(recordId);
        return newSet;
      });
    } catch (err) {
      const message = 
        err.response?.data?.errors?.[0]?.message || err.message || '无法删除DNS记录。';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedRecords.size === 0 || !selectedZoneId) {
      return;
    }

    const recordIds = Array.from(selectedRecords);
    const shouldDelete = window.confirm(`确定要删除选中的${recordIds.length}条DNS记录吗？`);
    if (!shouldDelete) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 并行删除所有选中的记录
      await Promise.all(
        recordIds.map(id => 
          apiClient.delete(`/api/zones/${selectedZoneId}/dns_records/${id}`)
        )
      );
      await loadDnsRecords({ showLoading: false });
      // 清除选中状态
      setSelectedRecords(new Set());
      setIsAllSelected(false);
    } catch (err) {
      const message = 
        err.response?.data?.errors?.[0]?.message || err.message || '无法删除DNS记录。';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleRecord = (recordId) => {
    setSelectedRecords(prev => {
      const newSet = new Set(prev);
      if (newSet.has(recordId)) {
        newSet.delete(recordId);
      } else {
        newSet.add(recordId);
      }
      return newSet;
    });
  };

  const handleToggleAll = () => {
    if (isAllSelected) {
      setSelectedRecords(new Set());
    } else {
      setSelectedRecords(new Set(filteredRecords.map(r => r.id)));
    }
    setIsAllSelected(!isAllSelected);
  };

  // 过滤记录
  const filteredRecords = useMemo(() => {
    if (!searchQuery) {
      return dnsRecords;
    }
    const query = searchQuery.toLowerCase();
    return dnsRecords.filter(record => 
      record.type.toLowerCase().includes(query) ||
      record.name.toLowerCase().includes(query) ||
      record.content.toLowerCase().includes(query)
    );
  }, [dnsRecords, searchQuery]);

  // 监听过滤后记录变化，更新全选状态
  useEffect(() => {
    if (filteredRecords.length > 0 && selectedRecords.size === filteredRecords.length) {
      setIsAllSelected(true);
    } else {
      setIsAllSelected(false);
    }
  }, [filteredRecords, selectedRecords.size]);

  // 当区域改变时清除选中状态
  useEffect(() => {
    setSelectedRecords(new Set());
    setIsAllSelected(false);
    setSearchQuery('');
  }, [selectedZoneId]);

  const handleOpenCreate = () => {
    setError(null);
    setActiveRecord(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (record) => {
    setError(null);
    setActiveRecord(record);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setActiveRecord(null);
  };

  const handleSubmitRecord = async (formValues) => {
    if (!selectedZoneId) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const payload = {
      type: formValues.type,
      name: formValues.name,
      content: formValues.content,
      ttl: formValues.ttl === 'auto' ? 1 : Number(formValues.ttl),
      proxied: formValues.proxied,
    };

    try {
      if (activeRecord) {
        await apiClient.put(
          `/api/zones/${selectedZoneId}/dns_records/${activeRecord.id}`,
          payload
        );
      } else {
        await apiClient.post(`/api/zones/${selectedZoneId}/dns_records`, payload);
      }

      await loadDnsRecords({ showLoading: false });
      handleCloseModal();
    } catch (err) {
      const message =
        err.response?.data?.errors?.[0]?.message || err.message || '无法保存DNS记录。';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {!isLoggedIn ? (
        <Login 
          onLogin={() => setIsLoggedIn(true)} 
          onChangePassword={() => console.log('密码已修改')} 
        />
      ) : (
        <div className="min-h-screen bg-slate-100 pb-12">
          <header className="bg-white shadow-sm">
            <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center">
                <h1 className="text-2xl font-semibold text-slate-900">Cloudflare DNS 管理器</h1>
                <button
                  onClick={() => setIsLoggedIn(false)}
                  className="text-sm text-indigo-600 hover:text-indigo-500"
                >
                  退出登录
                </button>
              </div>
              <p className="max-w-3xl text-sm text-slate-500">
                安全管理Cloudflare DNS记录，无需向浏览器暴露API令牌。
              </p>
            </div>
          </header>

      <main className="mx-auto mt-8 flex max-w-6xl flex-col gap-6 px-4 sm:px-6 lg:px-8">
        <section className="rounded-lg bg-white p-6 shadow">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="zone-select">
                选择区域
              </label>
              <select
                id="zone-select"
                value={selectedZoneId || ''}
                onChange={handleZoneChange}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 sm:w-80"
              >
                <option value="" disabled>
                  {zoneOptions.length === 0 ? '加载区域中...' : '选择区域'}
                </option>
                {zoneOptions.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleOpenCreate}
                disabled={!selectedZoneId}
                className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
              >
                添加新记录
            </button>
          </div>
        </section>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <section className="overflow-hidden rounded-lg bg-white shadow">
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-800">
              {selectedZone?.name ? `${selectedZone.name} 的DNS记录` : 'DNS记录'}
            </h2>
            <p className="text-sm text-slate-500">
              查看、更新和删除所选区域的DNS记录。
            </p>
          </div>
          
          {/* 搜索和批量操作栏 */}
          <div className="px-6 py-4 border-b border-slate-200">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="w-full sm:w-64 flex">
                <input
                  type="text"
                  placeholder="搜索记录..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-l-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
                <button
                  type="button"
                  onClick={() => {
                    // 触发搜索，实际上只需要重新渲染即可
                    const query = searchQuery.trim();
                    setSearchQuery(query);
                  }}
                  className="inline-flex items-center justify-center rounded-r-md border border-l-0 border-indigo-600 bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  搜索
                </button>
              </div>
              {selectedRecords.size > 0 && (
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={isLoading}
                  className="inline-flex items-center justify-center rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  删除选中的 {selectedRecords.size} 条记录
                </button>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="flex h-48 items-center justify-center px-6">
              <span className="text-sm font-medium text-slate-500">加载数据中...</span>
            </div>
          ) : dnsRecords.length === 0 ? (
            <div className="flex h-48 items-center justify-center px-6 text-sm text-slate-500">
              {selectedZoneId
                ? '该区域未找到DNS记录。'
                : '选择区域以查看DNS记录。'
              }
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-4 py-3">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={isAllSelected && filteredRecords.length > 0}
                          onChange={handleToggleAll}
                          disabled={filteredRecords.length === 0}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">类型</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">名称</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">内容</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">TTL</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">代理</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-700">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-4 py-8 text-center text-slate-500">
                        没有找到匹配的记录
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((record) => (
                      <tr key={record.id} className={`hover:bg-slate-50 ${selectedRecords.has(record.id) ? 'bg-slate-50' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              checked={selectedRecords.has(record.id)}
                              onChange={() => handleToggleRecord(record.id)}
                              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">{record.type}</td>
                        <td className="px-4 py-3 text-slate-700 truncate max-w-[200px]" title={record.name}>{record.name}</td>
                        <td className="px-4 py-3 text-slate-700 truncate max-w-[300px]" title={record.content}>{record.content}</td>
                        <td className="px-4 py-3 text-slate-700">
                          {record.ttl === 1 ? 'Auto' : `${record.ttl}s`}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {record.proxied ? (
                            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          已启用
                        </span>
                          ) : (
                            <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600">
                          已禁用
                        </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(record)}
                              className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRecord(record.id)}
                              className="rounded-md border border-red-300 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                            >
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <RecordForm
            initialData={activeRecord}
            onCancel={handleCloseModal}
            onSubmit={handleSubmitRecord}
            isSubmitting={isSubmitting}
          />
        </div>
      ) : null}
    </div>
      )}
    </>
  );
}

export default App;
