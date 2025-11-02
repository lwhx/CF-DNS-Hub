import { useEffect, useMemo, useState } from 'react';

const RECORD_TYPES = [
  'A',
  'AAAA',
  'CNAME',
  'MX',
  'TXT',
  'SRV',
  'NS',
  'CAA',
  'PTR',
];

const TTL_OPTIONS = [
  { label: '自动', value: 'auto' },
  { label: '60秒', value: '60' },
  { label: '5分钟', value: '300' },
  { label: '10分钟', value: '600' },
  { label: '30分钟', value: '1800' },
  { label: '1小时', value: '3600' },
  { label: '2小时', value: '7200' },
  { label: '4小时', value: '14400' },
  { label: '1天', value: '86400' },
];

const emptyFormState = {
  type: 'A',
  name: '',
  content: '',
  ttl: 'auto',
  proxied: false,
};

const getInitialState = (record) => {
  if (!record) {
    return emptyFormState;
  }

  return {
    type: record.type || 'A',
    name: record.name || '',
    content: record.content || '',
    ttl: record.ttl === 1 ? 'auto' : String(record.ttl),
    proxied: Boolean(record.proxied),
  };
};

function RecordForm({ initialData, onCancel, onSubmit, isSubmitting }) {
  const [formState, setFormState] = useState(() => getInitialState(initialData));
  const [validationError, setValidationError] = useState('');

  const ttlSelectOptions = useMemo(() => {
    if (
      formState.ttl !== 'auto' &&
      !TTL_OPTIONS.some((option) => option.value === formState.ttl)
    ) {
      return [
        ...TTL_OPTIONS,
        { label: `${formState.ttl}秒`, value: formState.ttl },
      ];
    }
    return TTL_OPTIONS;
  }, [formState.ttl]);

  useEffect(() => {
    setFormState(getInitialState(initialData));
    setValidationError('');
  }, [initialData]);

  const title = useMemo(
    () => (initialData ? '更新DNS记录' : '创建DNS记录'),
    [initialData]
  );

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setFormState((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!formState.name.trim() || !formState.content.trim()) {
      setValidationError('名称和内容为必填项。');
      return;
    }

    setValidationError('');
    onSubmit(formState);
  };

  return (
    <div className="w-full max-w-xl rounded-lg bg-white p-6 shadow-xl">
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">
        提供DNS记录详情。Cloudflare要求每个条目都有名称和内容。
      </p>

      {validationError ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {validationError}
        </div>
      ) : null}

      <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="type">
            类型
          </label>
          <select
            id="type"
            name="type"
            value={formState.type}
            onChange={handleChange}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            {RECORD_TYPES.map((recordType) => (
              <option key={recordType} value={recordType}>
                {recordType}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="name">
            名称
          </label>
          <input
            id="name"
            name="name"
            value={formState.name}
            onChange={handleChange}
            placeholder="例如：@ 或 www"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="content">
            内容
          </label>
          <input
            id="content"
            name="content"
            value={formState.content}
            onChange={handleChange}
            placeholder="例如：192.0.2.1"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="ttl">
            TTL
          </label>
            <select
              id="ttl"
              name="ttl"
              value={formState.ttl}
              onChange={handleChange}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              {ttlSelectOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input
              id="proxied"
              name="proxied"
              type="checkbox"
              checked={formState.proxied}
              onChange={handleChange}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label className="text-sm font-medium text-slate-700" htmlFor="proxied">
              通过Cloudflare代理
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            disabled={isSubmitting}
          >
              取消
          </button>
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            disabled={isSubmitting}
          >
            {isSubmitting ? '保存中...' : initialData ? '更新记录' : '创建记录'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default RecordForm;
