import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import RecordFormModal from './components/RecordForm.jsx'

// 计算 API 基地址与超时
const loc = typeof window !== 'undefined' ? window.location : undefined
const defaultBase = (loc && loc.port === '5173')
  ? 'http://localhost:3000'
  : (loc?.origin || 'http://localhost:3000')
const API_TIMEOUT = Number(import.meta.env.VITE_API_TIMEOUT_MS || 45000)
const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE || defaultBase, timeout: API_TIMEOUT })

// 请求拦截：自动附加登录令牌
api.interceptors.request.use((config) => {
  try {
    const token = localStorage.getItem('cf2dns:auth')
    if (token) config.headers['x-auth-token'] = token
  } catch (_) {}
  return config
})

function Icon({ name, className = '' }) {
  const common = 'w-4 h-4 ' + className
  switch (name) {
    case 'sun': return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
    case 'moon': return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    case 'cloud': return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 17.58A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 4 16.25"/></svg>
    default: return null
  }
}

export default function App() {
  // 主题/提示
  const [dark, setDark] = useState(false)
  const [toasts, setToasts] = useState([]) // { id, type, message }

  // 数据
  const [zones, setZones] = useState([])
  const [selectedZoneId, setSelectedZoneId] = useState('')
  const [records, setRecords] = useState([])
  const [recordsCache, setRecordsCache] = useState({}) // 缓存：{ zoneId: { data: records[], timestamp: number } }
  const [selectedIds, setSelectedIds] = useState([])
  const [editing, setEditing] = useState(null)
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchTTL, setBatchTTL] = useState('')
  const [batchProxied, setBatchProxied] = useState('keep') // keep|true|false
  const [animatingRecords, setAnimatingRecords] = useState(new Set()) // 正在动画的记录ID

  // 状态
  const [isLoading, setIsLoading] = useState(false) // 仅用于列表加载/初始化
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState('type') // name|type|content|proxied
  const [sortDir, setSortDir] = useState('asc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [activeFilters, setActiveFilters] = useState({
    types: [], // 筛选的记录类型
    proxied: null, // null | true | false
  })

  // 登录
  const [needLogin, setNeedLogin] = useState(false)
  const [loginPwd, setLoginPwd] = useState('')
  const [loginError, setLoginError] = useState('')
  const [hasToken, setHasToken] = useState(() => {
    try { return Boolean(localStorage.getItem('cf2dns:auth')) } catch (_) { return false }
  })

  const selectedZone = useMemo(() => zones.find(z => z.id === selectedZoneId), [zones, selectedZoneId])
  
  // 统计各类型记录数量
  const recordStats = useMemo(() => {
    const stats = {}
    records.forEach(r => {
      const type = r.type || 'UNKNOWN'
      stats[type] = (stats[type] || 0) + 1
    })
    return stats
  }, [records])

  // 快速筛选函数
  function toggleTypeFilter(type) {
    setActiveFilters(prev => {
      const newTypes = prev.types.includes(type)
        ? prev.types.filter(t => t !== type)
        : [...prev.types, type]
      return { ...prev, types: newTypes }
    })
    setPage(1)
  }

  function toggleProxiedFilter(proxied) {
    setActiveFilters(prev => ({
      ...prev,
      proxied: prev.proxied === proxied ? null : proxied
    }))
    setPage(1)
  }

  function clearAllFilters() {
    setActiveFilters({ types: [], proxied: null })
    setQuery('')
    setPage(1)
  }

  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])

  function notify(type, message) {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
  }

  async function fetchZones() {
    setIsLoading(true); setError('')
    try {
      const { data } = await api.get('/api/zones')
      if (data?.success) setZones(data.result || [])
      else throw new Error(data?.message || '加载域名失败')
    } catch (e) {
      if (e?.response?.status === 401) { setNeedLogin(true); setError('') }
      else { const msg = e?.response?.data?.data?.errors?.[0]?.message || e?.response?.data?.message || e.message || '加载域名失败'; setError(msg); notify('error', msg) }
    } finally { setIsLoading(false) }
  }

  async function fetchRecords(zoneId, background = false, forceRefresh = false, operation = null) {
    if (!zoneId) return
    
    const CACHE_DURATION = 5 * 60 * 1000 // 5分钟缓存
    const now = Date.now()
    const cached = recordsCache[zoneId]
    
    // 如果有特定操作验证，忽略缓存，否则检查缓存是否有效
    if (!forceRefresh && !operation && cached && (now - cached.timestamp < CACHE_DURATION)) {
      setRecords(cached.data)
      return cached.data
    }
    
    if (!background) { setIsLoading(true); setError('') }
    try {
      const { data } = await api.get(`/api/zones/${zoneId}/dns_records`)
      if (data?.success) {
        const recordsData = Array.isArray(data.result) ? data.result : (Array.isArray(data?.data?.result) ? data.data.result : [])
        
        // 如果是特定操作验证，检查操作是否真正生效
        if (operation) {
          const operationVerified = verifyOperation(operation, recordsData)
          if (!operationVerified) {
            // 操作未生效，延迟重试，但不更新UI状态，保持乐观更新
            if (!background) setIsLoading(false)
            setTimeout(() => fetchRecords(zoneId, true, true, operation), 1500)
            return // 直接返回，不更新记录状态
          }
        }
        
        setRecords(recordsData)
        // 更新缓存
        setRecordsCache(prev => ({
          ...prev,
          [zoneId]: { data: recordsData, timestamp: now }
        }))
        return recordsData
      } else {
        throw new Error(data?.message || '加载解析记录失败')
      }
    } catch (e) {
      if (e?.response?.status === 401) { setNeedLogin(true); setError('') }
      else { 
        const msg = e?.response?.data?.data?.errors?.[0]?.message || e?.response?.data?.message || e.message || '加载解析记录失败'
        setError(msg); notify('error', msg)
        // 如果请求失败但有缓存，使用缓存数据
        if (cached) {
          setRecords(cached.data)
          notify('info', '网络异常，显示缓存数据')
          return cached.data
        }
      }
    } finally { if (!background) setIsLoading(false) }
    return []
  }

  useEffect(() => { fetchZones() }, [])

  // 验证操作是否真正生效
  function verifyOperation(operation, serverRecords) {
    switch (operation.type) {
      case 'delete':
        // 验证记录是否真的被删除
        return !serverRecords.some(r => r.id === operation.recordId)
      case 'add':
        // 验证新记录是否真的存在（通过name和type匹配，因为新记录的ID可能不同）
        return serverRecords.some(r => 
          r.name === operation.record.name && 
          r.type === operation.record.type &&
          r.content === operation.record.content
        )
      case 'update':
        // 验证记录是否真的被更新
        const updatedRecord = serverRecords.find(r => r.id === operation.recordId)
        return updatedRecord && 
               updatedRecord.name === operation.record.name &&
               updatedRecord.type === operation.record.type &&
               updatedRecord.content === operation.record.content
      default:
        return true
    }
  }

  async function handleSelectZone(e) {
    const id = e.target.value
    try {
      setSelectedZoneId(id)
      setRecords([])
      setSelectedIds([])
      setPage(1)
      if (id) await fetchRecords(id)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('选择域名失败:', err)
      notify('error', err?.message || '加载域名记录失败')
    }
  }

  const visibleRecords = useMemo(() => {
    let filtered = records
    
    // 文本搜索
    const q = query.trim().toLowerCase()
    if (q) {
      filtered = filtered.filter(r => 
        (r.name || '').toLowerCase().includes(q) || 
        (r.type || '').toLowerCase().includes(q) || 
        (r.content || '').toLowerCase().includes(q)
      )
    }
    
    // 类型筛选
    if (activeFilters.types.length > 0) {
      filtered = filtered.filter(r => activeFilters.types.includes(r.type))
    }
    
    // 代理状态筛选
    if (activeFilters.proxied !== null) {
      filtered = filtered.filter(r => r.proxied === activeFilters.proxied)
    }
    
    return filtered
  }, [records, query, activeFilters])

  const sortedRecords = useMemo(() => {
    const arr = [...visibleRecords]
    const get = (r) => sortKey === 'type' ? (r.type || '') : sortKey === 'content' ? (r.content || '') : sortKey === 'proxied' ? (r.proxied ? 1 : 0) : (r.name || '')
    arr.sort((a, b) => {
      const va = get(a), vb = get(b)
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return arr
  }, [visibleRecords, sortKey, sortDir])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(sortedRecords.length / pageSize)), [sortedRecords.length, pageSize])
  useEffect(() => { if (page > totalPages) setPage(totalPages) }, [totalPages])
  useEffect(() => { setPage(1) }, [selectedZoneId, query, sortKey, sortDir, pageSize])
  const pageRecords = useMemo(() => sortedRecords.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize), [sortedRecords, page, pageSize])

  function displayName(r) {
    if (!r?.name) return ''
    const zoneName = selectedZone?.name
    if (!zoneName) return r.name
    if (r.name === zoneName) return '@'
    const suffix = '.' + zoneName
    return r.name.endsWith(suffix) ? r.name.slice(0, -suffix.length) : r.name
  }

  // 名称转换：相对名 -> 绝对名（无需用户输入完整域名）
  function toAbsoluteName(input) {
    const zoneName = selectedZone?.name || ''
    const v = String(input || '').trim()
    if (!v || v === '@') return zoneName
    if (!zoneName) return v
    if (v === zoneName || v.endsWith('.' + zoneName)) return v
    return `${v}.${zoneName}`
  }

  // 名称转换：绝对名 -> 相对名（用于编辑表单回显）
  function toRelativeName(full) {
    const zoneName = selectedZone?.name || ''
    const v = String(full || '').trim()
    if (!zoneName) return v
    if (v === zoneName) return '@'
    const suffix = '.' + zoneName
    return v.endsWith(suffix) ? v.slice(0, -suffix.length) : v
  }

  function typeCircleClass(t) {
    const x = String(t || '').toUpperCase()
    switch (x) {
      case 'A': return 'bg-blue-600'
      case 'AAAA': return 'bg-emerald-600'
      case 'CNAME': return 'bg-purple-600'
      case 'TXT': return 'bg-amber-600'
      case 'MX': return 'bg-rose-600'
      case 'NS': return 'bg-sky-600'
      default: return 'bg-gray-600'
    }
  }

  function typeBadgeClass(t) {
    const x = String(t || '').toUpperCase()
    switch (x) {
      case 'A': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
      case 'AAAA': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200'
      case 'CNAME': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200'
      case 'TXT': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
      case 'MX': return 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200'
      case 'NS': return 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-200'
    }
  }

  // 清除指定域名的缓存
  function clearCache(zoneId) {
    setRecordsCache(prev => {
      const newCache = { ...prev }
      delete newCache[zoneId]
      return newCache
    })
  }

  // 新增/修改（无感刷新）
  async function handleUpsert(input) {
    if (!selectedZoneId) return
    try {
      const body = { ...input, name: toAbsoluteName(input.name) }
      if (editing?.id) {
        const { data } = await api.put(`/api/zones/${selectedZoneId}/dns_records/${editing.id}`, body)
        if (!data?.success) throw new Error(data?.message || '修改失败')
        setRecords(prev => prev.map(r => r.id === editing.id ? (data.result || { ...r, ...body }) : r))
        // 更新缓存
        setRecordsCache(prev => {
          if (prev[selectedZoneId]) {
            return {
              ...prev,
              [selectedZoneId]: {
                ...prev[selectedZoneId],
                data: prev[selectedZoneId].data.map(r => r.id === editing.id ? (data.result || { ...r, ...body }) : r)
              }
            }
          }
          return prev
        })
        notify('success', '修改成功')
        // 后台验证修改是否真正生效
        const operation = { type: 'update', recordId: editing.id, record: body }
        fetchRecords(selectedZoneId, true, true, operation)
      } else {
        const { data } = await api.post(`/api/zones/${selectedZoneId}/dns_records`, body)
        if (!data?.success) throw new Error(data?.message || '新增失败')
        const newRecord = data.result || { ...body, id: Date.now() }
        setRecords(prev => [newRecord, ...prev])
        // 更新缓存，将新记录添加到顶部
        setRecordsCache(prev => {
          if (prev[selectedZoneId]) {
            return {
              ...prev,
              [selectedZoneId]: {
                ...prev[selectedZoneId],
                data: [newRecord, ...prev[selectedZoneId].data]
              }
            }
          }
          return prev
        })
        notify('success', '添加成功')
        // 后台验证新增是否真正生效
        const operation = { type: 'add', record: body }
        fetchRecords(selectedZoneId, true, true, operation)
      }
      setEditing(null)
    } catch (e) {
      const msg = e?.response?.data?.data?.errors?.[0]?.message || e?.response?.data?.message || e.message || '操作失败'
      notify('error', msg)
    }
  }

  async function handleDelete(record) {
    if (!selectedZoneId || !record?.id) return
    
    // 乐观更新：先从UI中移除记录
    const originalRecords = records
    const originalCache = recordsCache[selectedZoneId]
    
    setRecords(prev => prev.filter(r => r.id !== record.id))
    setSelectedIds(prev => prev.filter(id => id !== record.id))
    // 更新缓存
    setRecordsCache(prev => {
      if (prev[selectedZoneId]) {
        return {
          ...prev,
          [selectedZoneId]: {
            ...prev[selectedZoneId],
            data: prev[selectedZoneId].data.filter(r => r.id !== record.id)
          }
        }
      }
      return prev
    })
    
    try {
      const { data } = await api.delete(`/api/zones/${selectedZoneId}/dns_records/${record.id}`)
      if (!data?.success) throw new Error(data?.message || '删除失败')
      
      notify('success', '删除成功')
      // 后台验证删除是否真正生效，但不立即更新UI
      const operation = { type: 'delete', recordId: record.id }
      fetchRecords(selectedZoneId, true, true, operation)
    } catch (e) {
      // 删除失败，回滚UI状态
      setRecords(originalRecords)
      if (originalCache) {
        setRecordsCache(prev => ({
          ...prev,
          [selectedZoneId]: originalCache
        }))
      }
      const msg = e?.response?.data?.data?.errors?.[0]?.message || e?.response?.data?.message || e.message || '删除失败'
      notify('error', msg)
    }
  }

  async function handleBatchApply(e) {
    e?.preventDefault?.()
    if (!selectedZoneId || !selectedIds.length) return setBatchOpen(false)
    const ttlVal = batchTTL.trim() === '' ? null : Number(batchTTL)
    const proxVal = batchProxied === 'keep' ? null : (batchProxied === 'true')
    setIsLoading(true)
    try {
      for (const id of selectedIds) {
        const r = records.find(x => x.id === id); if (!r) continue
        const body = { type: r.type, name: r.name, content: r.content, ttl: ttlVal ?? (r.ttl ?? 1), proxied: proxVal ?? r.proxied }
        // eslint-disable-next-line no-await-in-loop
        const { data } = await api.put(`/api/zones/${selectedZoneId}/dns_records/${id}`, body)
        if (!data?.success) throw new Error(data?.message || '批量修改失败')
      }
      notify('success', '批量修改成功')
      setBatchOpen(false); setBatchTTL(''); setBatchProxied('keep')
      // 清除缓存并强制刷新
      clearCache(selectedZoneId)
      await fetchRecords(selectedZoneId, false, true)
    } catch (e) {
      const msg = e?.response?.data?.data?.errors?.[0]?.message || e?.response?.data?.message || e.message || '批量修改失败'
      notify('error', msg)
    } finally { setIsLoading(false) }
  }

  async function handleBatchDelete() {
    if (!selectedZoneId || !selectedIds.length) return
    const ok = window.confirm(`确定删除选中的 ${selectedIds.length} 条记录吗？此操作不可撤销！`)
    if (!ok) return
    
    // 保存原始状态用于可能的回滚
    const originalRecords = records
    const originalCache = recordsCache[selectedZoneId]
    const originalSelectedIds = [...selectedIds]
    
    setIsLoading(true)
    try {
      // 先乐观更新UI
      setRecords(prev => prev.filter(r => !selectedIds.includes(r.id)))
      setSelectedIds([])
      
      // 批量删除API调用
      for (const id of originalSelectedIds) {
        // eslint-disable-next-line no-await-in-loop
        const { data } = await api.delete(`/api/zones/${selectedZoneId}/dns_records/${id}`)
        if (!data?.success) throw new Error(data?.message || '删除失败')
      }
      
      notify('success', '批量删除成功')
      // 清除缓存并在后台验证
      clearCache(selectedZoneId)
      fetchRecords(selectedZoneId, true, true)
    } catch (e) {
      // 删除失败，回滚UI状态
      setRecords(originalRecords)
      setSelectedIds(originalSelectedIds)
      if (originalCache) {
        setRecordsCache(prev => ({
          ...prev,
          [selectedZoneId]: originalCache
        }))
      }
      const msg = e?.response?.data?.data?.errors?.[0]?.message || e?.response?.data?.message || e.message || '批量删除失败'
      notify('error', msg)
    } finally { 
      setIsLoading(false) 
    }
  }

  async function handleLogin(e) {
    e?.preventDefault?.()
    setLoginError('')
    try {
      const { data } = await api.post('/api/auth/login', { password: loginPwd })
      if (!data?.success) throw new Error(data?.message || '登录失败')
      if (data.token) { try { localStorage.setItem('cf2dns:auth', data.token) } catch (_) {} }
      setHasToken(Boolean(data.token)); setNeedLogin(false); setLoginPwd('')
      notify('success', '登录成功')
      await fetchZones(); if (selectedZoneId) await fetchRecords(selectedZoneId)
    } catch (e) {
      const msg = e?.response?.data?.message || e.message || '登录失败'
      setLoginError(msg); notify('error', msg)
    }
  }

  function toggleSelect(id, checked) {
    setSelectedIds(prev => {
      const set = new Set(prev)
      if (checked) set.add(id); else set.delete(id)
      return Array.from(set)
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 text-gray-900 dark:text-gray-100">
      <header className="sticky top-0 z-10 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border-b border-gray-200/80 dark:border-gray-700/50 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon name="cloud" className="text-indigo-600 floating" />
            <h1 className="font-bold text-lg bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">CF2DNS</h1>
          </div>
          <div className="flex items-center gap-3">
            <button className="btn btn-outline pulse-ring" onClick={() => setDark(v => !v)}>
              <Icon name={dark ? 'sun' : 'moon'} />
            </button>
            <button className="btn btn-outline" onClick={() => setNeedLogin(true)}>{hasToken ? '重新登录' : '登录'}</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6 pb-28 md:pb-6">
        {/* 工具栏 */}
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
            <div className="flex gap-3">
              <select value={selectedZoneId} onChange={handleSelectZone} className="select w-full">
                <option value="">选择域名</option>
                {zones.map(z => (<option key={z.id} value={z.id}>{z.name}</option>))}
              </select>
            </div>
            <div className="flex gap-3">
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索记录（name/type/content）" className="input w-full"/>
              <select value={sortKey} onChange={e => setSortKey(e.target.value)} className="select">
                <option value="name">名称</option>
                <option value="type">类型</option>
                <option value="content">内容</option>
                <option value="proxied">代理</option>
              </select>
              <button className="btn btn-outline" onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}>{sortDir === 'asc' ? '升序' : '降序'}</button>
            </div>
            <div className="flex gap-2 justify-start md:justify-end overflow-x-auto no-scrollbar">
              <select value={pageSize} onChange={e => { setPage(1); setPageSize(Number(e.target.value)) }} className="select">
                <option value={25}>每页 25</option>
                <option value={50}>每页 50</option>
                <option value={100}>每页 100</option>
              </select>
              <button className="btn btn-outline" onClick={fetchZones}>刷新域名</button>
              {selectedZoneId && (
                <>
                  <button 
                    className="btn btn-primary" 
                    onClick={() => fetchRecords(selectedZoneId, false, true)}
                    title="强制刷新（忽略缓存）"
                  >
                    刷新记录
                  </button>
                  <button className="btn btn-outline" onClick={() => setEditing({})}>添加记录</button>
                  <button className="btn btn-outline" disabled={!selectedIds.length} onClick={() => setBatchOpen(true)}>批量修改</button>
                  <button className="btn btn-danger" disabled={!selectedIds.length} onClick={handleBatchDelete}>批量删除</button>
                </>
              )}
            </div>
          </div>
          
          {/* 快速筛选标签 */}
          {selectedZoneId && records.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-300">快速筛选：</span>
                
                {/* 类型标签 */}
                {Object.entries(recordStats).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                  <button
                    key={type}
                    onClick={() => toggleTypeFilter(type)}
                    className={`chip relative ${activeFilters.types.includes(type) ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200 ring-2 ring-indigo-500' : ''}`}
                  >
                    <span className={`inline-block w-2 h-2 rounded-full mr-1 ${typeCircleClass(type)}`}></span>
                    {type} ({count})
                  </button>
                ))}
                
                {/* 代理状态标签 */}
                <button
                  onClick={() => toggleProxiedFilter(true)}
                  className={`chip ${activeFilters.proxied === true ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200 ring-2 ring-emerald-500' : ''}`}
                >
                  <span className="inline-block w-2 h-2 bg-emerald-500 rounded-full mr-1"></span>
                  Proxied ({records.filter(r => r.proxied).length})
                </button>
                
                <button
                  onClick={() => toggleProxiedFilter(false)}
                  className={`chip ${activeFilters.proxied === false ? 'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-200 ring-2 ring-gray-500' : ''}`}
                >
                  <span className="inline-block w-2 h-2 bg-gray-500 rounded-full mr-1"></span>
                  Direct ({records.filter(r => !r.proxied).length})
                </button>
                
                {/* 清除筛选 */}
                {(activeFilters.types.length > 0 || activeFilters.proxied !== null || query) && (
                  <button
                    onClick={clearAllFilters}
                    className="btn btn-outline px-2 py-1 text-xs ml-2"
                  >
                    清除筛选
                  </button>
                )}
              </div>
              
              {/* 筛选结果提示 */}
              {(activeFilters.types.length > 0 || activeFilters.proxied !== null) && (
                <div className="text-xs text-gray-500 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded">
                  已筛选 {visibleRecords.length} / {records.length} 条记录
                </div>
              )}
            </div>
          )}
        </div>

        {!!error && (
          <div className="card text-rose-700 bg-rose-50 dark:bg-rose-900/30 dark:text-rose-200 border border-rose-200 dark:border-rose-800/50">{error}</div>
        )}

        {/* 桌面端表格 */}
        <div className="hidden md:block card p-0 overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr>
                <th className="w-10"><input type="checkbox" aria-label="全选"
                  onChange={e => {
                    const checked = e.target.checked
                    if (checked) {
                      const ids = pageRecords.map(r => r.id)
                      setSelectedIds(prev => Array.from(new Set([...prev, ...ids])))
                    } else {
                      const pageSet = new Set(pageRecords.map(r => r.id))
                      setSelectedIds(prev => prev.filter(id => !pageSet.has(id)))
                    }
                  }}
                  checked={pageRecords.length > 0 && pageRecords.every(r => selectedIds.includes(r.id))}
                /></th>
                <th>名称</th>
                <th>类型</th>
                <th>内容</th>
                <th>代理</th>
                <th className="w-40 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {pageRecords.map(r => (
                <tr key={r.id}>
                  <td><input type="checkbox" checked={selectedIds.includes(r.id)} onChange={e => toggleSelect(r.id, e.target.checked)} /></td>
                  <td className="font-medium">{displayName(r)}</td>
                  <td><span className={`chip ${typeBadgeClass(r.type)}`}>{r.type}</span></td>
                  <td className="break-all text-sm text-gray-700 dark:text-gray-300">{r.content}</td>
                  <td>
                    <span className={`text-xs px-2 py-0.5 rounded-full border select-none ${r.proxied ? 'border-emerald-300 text-emerald-700 dark:text-emerald-200' : 'border-gray-300 text-gray-600 dark:text-gray-300'}`}>
                      {r.proxied ? 'Proxied' : 'Direct'}
                    </span>
                  </td>
                  <td className="text-right w-40 md:w-44">
                    <div className="flex justify-end items-center gap-2 flex-nowrap whitespace-nowrap">
                      <button className="btn btn-outline px-2 py-1" onClick={() => setEditing({ ...r, name: toRelativeName(r.name) })}>编辑</button>
                      <button className="btn btn-danger px-2 py-1" onClick={() => handleDelete(r)}>删除</button>
                    </div>
                  </td>
                </tr>
              ))}
              {isLoading && !pageRecords.length && (<tr><td colSpan="6" className="px-4 py-6 text-center text-gray-500">加载中...</td></tr>)}
              {!isLoading && !pageRecords.length && (<tr><td colSpan="6" className="px-4 py-10 text-center text-gray-500">{selectedZone ? '暂无记录' : '请选择域名后查看解析记录'}</td></tr>)}
            </tbody>
          </table>
        </div>

        {/* 移动端卡片 */}
        <div className="md:hidden grid gap-4">
          {pageRecords.map((r, index) => (
            <div 
              key={r.id} 
              className={`card p-4 hover:shadow-xl transition-all duration-300 ${animatingRecords.has(r.id) ? 'record-update' : ''} record-enter`}
              style={{animationDelay: `${index * 50}ms`}}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <input 
                    type="checkbox" 
                    className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500 transition-colors" 
                    checked={selectedIds.includes(r.id)} 
                    onChange={e => toggleSelect(r.id, e.target.checked)} 
                  />
                  <div className={`inline-flex items-center justify-center w-10 h-10 rounded-full text-white text-sm font-bold shadow-lg ${typeCircleClass(r.type)} pulse-ring`}>
                    {r.type || '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-gray-900 dark:text-gray-100 truncate text-base">{displayName(r)}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-300 break-all leading-relaxed" title={r.content}>
                      {r.content}
                    </div>
                  </div>
                </div>
                <div className="ml-3 flex flex-col items-end gap-2">
                  <span className={`text-xs px-3 py-1 rounded-full border-2 font-medium select-none transition-all duration-200 ${r.proxied ? 'border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-600' : 'border-gray-300 text-gray-600 bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600'}`}>
                    {r.proxied ? 'Proxied' : 'Direct'}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                <button className="btn btn-outline w-full px-3 py-1.5 text-sm" onClick={() => setEditing({ ...r, name: toRelativeName(r.name) })}>编辑</button>
                <button className="btn btn-danger w-full px-3 py-1.5 text-sm" onClick={() => handleDelete(r)}>删除</button>
              </div>
            </div>
          ))}
          {isLoading && !pageRecords.length && (
            <div className="card p-4 loading-shimmer bounce-in">
              <div className="h-5 w-1/3 bg-gray-200 dark:bg-gray-600 rounded mb-3"></div>
              <div className="h-4 w-2/3 bg-gray-200 dark:bg-gray-600 rounded"></div>
            </div>
          )}
          {!isLoading && !pageRecords.length && (
            <div className="text-center text-gray-500 py-12 card bounce-in">
              <div className="text-6xl mb-4">📋</div>
              <div className="text-lg font-medium mb-2">{selectedZone ? '暂无记录' : '请选择域名'}</div>
              <div className="text-sm">{selectedZone ? '开始添加DNS记录吧' : '选择域名后查看解析记录'}</div>
            </div>
          )}
        </div>

        {/* 分页条 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-sm">共 {sortedRecords.length} 条，页 {page}/{totalPages}</div>
            {selectedZoneId && recordsCache[selectedZoneId] && (
              <div className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-full">
                <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-1"></span>
                已缓存 {Math.floor((Date.now() - recordsCache[selectedZoneId].timestamp) / 1000 / 60)}分钟前
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn btn-outline" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>上一页</button>
            <button className="btn btn-outline" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>下一页</button>
          </div>
        </div>

        {/* 移动端粘性批量操作条 */}
        {selectedIds.length > 0 && (
          <div className="md:hidden fixed bottom-6 left-4 right-4 z-40 card backdrop-blur-card flex items-center justify-between px-4 py-3 shadow-2xl border-2 border-indigo-200 dark:border-indigo-700 animate-slide-up">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium">已选 {selectedIds.length} 条</span>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-outline px-3 py-1.5 text-sm" onClick={() => setSelectedIds([])}>清空</button>
              <button className="btn btn-primary px-3 py-1.5 text-sm" onClick={() => setBatchOpen(true)}>批量修改</button>
              <button className="btn btn-danger px-3 py-1.5 text-sm" onClick={handleBatchDelete}>批量删除</button>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-3 rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur px-4 py-2 shadow-soft">
            <span className="inline-block w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
            <span className="text-sm">加载中...</span>
          </div>
        )}

        {!!editing && (
          <RecordFormModal
            initial={editing?.id ? editing : null}
            onCancel={() => setEditing(null)}
            onSubmit={handleUpsert}
          />
        )}

        {!!batchOpen && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="card w-full max-w-md animate-scale-in">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-white/10">
                <h3 className="text-lg font-semibold">批量修改（{selectedIds.length} 条）</h3>
              </div>
              <form onSubmit={handleBatchApply} className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">TTL</label>
                  <input value={batchTTL} onChange={e => setBatchTTL(e.target.value)} className="input" placeholder="留空保持不变，1 表示自动" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Proxied</label>
                  <select value={batchProxied} onChange={e => setBatchProxied(e.target.value)} className="select">
                    <option value="keep">保持不变</option>
                    <option value="true">开启</option>
                    <option value="false">关闭</option>
                  </select>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" className="btn btn-outline" onClick={() => setBatchOpen(false)}>取消</button>
                  <button type="submit" className="btn btn-primary">应用</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {!!toasts.length && (
          <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
            {toasts.map(t => (
              <div key={t.id}
                   className={`px-4 py-2 rounded-lg shadow-soft border text-sm animate-slide-up ${t.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800/50' : t.type === 'error' ? 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-200 dark:border-rose-800/50' : 'bg-gray-50 text-gray-800 border-gray-200 dark:bg-gray-900/30 dark:text-gray-200 dark:border-gray-700/50' }`}>
                {t.message}
              </div>
            ))}
          </div>
        )}

        {needLogin && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="card w-full max-w-sm animate-scale-in">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-white/10">
                <h3 className="text-lg font-semibold">管理员登录</h3>
              </div>
              <form onSubmit={handleLogin} className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">密码</label>
                  <input type="password" value={loginPwd} onChange={e => setLoginPwd(e.target.value)} className="input" placeholder="请输入后台设置的 ADMIN_PASSWORD" autoFocus />
                  {!!loginError && <p className="text-xs text-rose-600 mt-1">{loginError}</p>}
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" className="btn btn-outline" onClick={() => setNeedLogin(false)}>取消</button>
                  <button type="submit" className="btn btn-primary">登录</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}










