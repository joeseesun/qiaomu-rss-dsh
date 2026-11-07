import { useState } from 'react';

/**
 * Pull subscriptions from a self-hosted FreshRSS (Google Reader compatible)
 * account. The host converts the fetched list into the same preview shape as
 * OPML, so selection and import reuse the OPML pipeline. Credentials are sent
 * once per fetch and never stored by the plugin.
 */
export function FreshRssImport({ api, onDone }) {
  const [server, setServer] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const run = async (fn) => {
    setBusy(true); setMessage('');
    try { await fn(); } catch (error) { setMessage(error?.message ?? String(error)); }
    finally { setBusy(false); }
  };
  const reset = () => { setPreview(null); setSelected([]); };
  const inspect = () => run(async () => {
    const result = await api.freshrssPreview({ server: server.trim(), username: username.trim(), password });
    setPreview(result);
    setSelected(result.entries.filter((entry) => !entry.duplicate).map((entry) => entry.url));
    setPassword('');
  });
  const visible = preview?.entries.filter((entry) => `${entry.name} ${entry.group ?? ''} ${entry.url}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  return <fieldset className="qrs-opml-import qrs-freshrss-import" disabled={busy}>
    <legend>从 FreshRSS 导入</legend>
    <p className="qrs-freshrss-hint">连接自托管的 FreshRSS（或任何 Google Reader 兼容服务），拉取全部订阅与分组后挑选导入。密码仅用于本次登录，不会被保存；建议使用 FreshRSS 的应用密码。</p>
    <input aria-label="FreshRSS 地址" placeholder="https://rss.example.org" value={server} onChange={(e) => { setServer(e.target.value); reset(); }} />
    <input aria-label="FreshRSS 用户名" autoComplete="off" placeholder="用户名" value={username} onChange={(e) => { setUsername(e.target.value); reset(); }} />
    <input aria-label="FreshRSS 密码" type="password" autoComplete="off" placeholder="密码（建议应用密码）" value={password} onChange={(e) => { setPassword(e.target.value); reset(); }} />
    <button type="button" className="qmrss-btn" disabled={!server.trim() || !username.trim() || !password} onClick={() => void inspect()}>拉取订阅列表</button>
    {preview && <>
      <input aria-label="筛选导入订阅" placeholder="筛选名称、分组、地址" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="qmrss-row">
        <button type="button" className="qmrss-btn" onClick={() => setSelected(visible.filter((entry) => !entry.duplicate).map((entry) => entry.url))}>选择筛选结果</button>
        <button type="button" className="qmrss-btn" onClick={() => setSelected([])}>清空选择</button>
      </div>
      <div className="qrs-opml-results">{visible.map((entry) => <label key={entry.url}>
        <input type="checkbox" disabled={entry.duplicate} checked={selected.includes(entry.url)} onChange={(e) => setSelected(e.target.checked ? [...selected,entry.url] : selected.filter((url) => url !== entry.url))} />
        {entry.name || entry.url} {entry.group && ` · ${entry.group}`} {entry.duplicate && '（已订阅）'}
      </label>)}</div>
      <button type="button" className="qmrss-btn" disabled={!selected.length} onClick={() => void run(async () => {
        const result = await api.opmlImport(preview.xml, selected);
        setMessage(`已导入 ${result.added} 项，跳过 ${result.skipped} 项。进入频道后会自动获取文章。`);
        reset(); await onDone();
      })}>导入所选（{selected.length}）</button>
    </>}
    {busy && <div role="status">处理中…</div>}
    {message && <div role="status">{message}</div>}
  </fieldset>;
}
