import { Modal, setIcon } from '../../client/original-ui.ts';

// Kept identical in Audio and Reader; adapters own credentials and reading state.
export const SOUND_COPY = {
  title: ['声音', 'Sound'], service: ['语音服务', 'Voice service'], key: ['API Key', 'API key'],
  getKey: ['获取密钥', 'Get a key'], show: ['显示', 'Show'], hide: ['隐藏', 'Hide'],
  model: ['语音模型', 'Speech model'], voice: ['音色', 'Voice'], region: ['区域', 'Region'], url: ['服务地址', 'Service URL'],
  advanced: ['更多配置', 'More configuration'], search: ['搜索音色', 'Search voices'], recent: ['最近使用', 'Recently used'], clear: ['清除最近使用', 'Clear recent voices'],
  current: ['当前使用', 'Currently using'], pending: ['待应用', 'Selected'], automatic: ['自动选择', 'Automatic'],
  test: ['验证并试听', 'Verify and test'], stop: ['停止试听', 'Stop test'], apply: ['使用这个声音', 'Use this voice'], done: ['完成', 'Done'],
  ready: ['配置已填写，尚未试听', 'Configured, not tested'], verified: ['本次试听成功', 'This voice test succeeded'],
  testing: ['正在试听…', 'Testing voice…'], loading: ['正在加载音色…', 'Loading voices…'],
  local: ['使用本机声音，无需 API Key。', 'Uses device voices without an API key.'],
  edge: ['免费在线声音；试听文字会发送至微软。', 'Free online voices. Test text is sent to Microsoft.'],
  cloud: ['试听会发送一小段示例文字至所选服务，可能计费。', 'Testing sends a short sample to this provider and may incur charges.'],
  localModel: ['在本机合成；尚未安装时请先准备模型。', 'Synthesizes locally. Set up the model on this device first.'],
  setup: ['准备本机模型', 'Set up local model'], refresh: ['刷新音色', 'Refresh voices'],
  empty: ['没有匹配的音色', 'No matching voices'], edit: ['修改配置', 'Edit configuration'],
  sample: ['你好，这是语音试听。', 'Hello. This is a voice test.'], custom: ['自定义', 'Custom'],
  notChanged: ['关闭不会更改当前声音。', 'Closing keeps your current voice.'],
  saveError: ['保存失败，输入已保留，请重试。', 'Could not save. Your input is retained; retry.'],
  credentials: ['请先填写 API Key。', 'Enter an API key first.'],
};
const localIds = ['system', 'macos', 'edge', 'localModel'];
const identity = profile => JSON.stringify(Object.entries(profile).filter(([key]) => key !== 'label').sort(([a], [b]) => a.localeCompare(b)));
export class SoundDialog extends Modal {
  constructor(app, adapter) {
    super(app); this.adapter = adapter; this.drafts = new Map(); this.catalogs = new Map(); this.generation = 0;
    this.tx = key => SOUND_COPY[key][adapter.chinese ? 0 : 1];
    this.active = { ...adapter.current() }; this.id = adapter.initialProvider || this.active.id; this.drafts.set(this.id, { ...(this.id === this.active.id ? this.active : adapter.profile(this.id)) });
    this.owner = {}; this.verified = ''; this.state = ''; this.query = '';
  }
  get profile() { return this.drafts.get(this.id); }
  get dirty() { return identity(this.profile) !== identity(this.active); }
  onOpen() {
    this.setTitle(this.tx('title')); this.contentEl.classList.add('qm-sound'); this.modalEl?.classList.add('qm-sound-modal');
    this.body = this.contentEl.createDiv('qm-sound-body');
    this.footer = this.contentEl.createDiv('qm-sound-footer');
    this.feedback = this.footer.createDiv({ cls: 'qm-sound-feedback', attr: { role: 'status', 'aria-live': 'polite' } });
    this.currentLabel = this.footer.createDiv('qm-sound-current');
    this.actions = this.footer.createDiv('qm-sound-actions');
    this.test = this.action(this.actions, 'play', this.tx('test'), () => this.audition());
    this.use = this.action(this.actions, 'check', this.tx('apply'), () => { void this.apply(); }); this.use.classList.add('qm-sound-primary');
    this.unsubscribe = this.adapter.subscribe(c => {
      if (c.owner !== this.owner || !this.testIdentity || this.closed) return;
      this.state = c.state;
      if (c.state === 'ended') this.verified = this.testIdentity;
      this.message = c.state === 'error' ? this.adapter.error(c.error, this.profile.id) : '';
      this.updateFooter();
      if (['ended', 'error'].includes(c.state)) {
        const generation = this.generation;
        queueMicrotask(() => { if (!this.closed && generation === this.generation) this.adapter.stop(this.owner); });
      }
    });
    this.voicesChanged = () => { if (this.id === 'system') this.refreshList(); };
    this.contentEl.ownerDocument.defaultView?.speechSynthesis?.addEventListener('voiceschanged', this.voicesChanged);
    this.render();
  }
  action(parent, icon, text, run) {
    const button = parent.createEl('button', { cls: 'qm-sound-button', attr: { type: 'button' } });
    setIcon(button.createSpan({ cls: 'qm-sound-icon' }), icon); const label = button.createSpan({ text });
    button.setLabel = value => label.setText(value); button.addEventListener('click', run); return button;
  }
  cancelTest() { ++this.generation; this.testIdentity = ''; this.adapter.stop(this.owner); this.state = ''; this.message = ''; }
  invalidate() { this.cancelTest(); this.verified = ''; this.updateFooter(); }
  switchProvider(id) {
    this.invalidate(); this.abort?.abort(); this.id = id; this.query = ''; this.editing = false;
    if (!this.drafts.has(id)) this.drafts.set(id, { ...this.adapter.profile(id) });
    this.render();
  }
  input(parent, key, label, type = 'text') {
    const row = parent.createEl('label', { cls: 'qm-sound-field' }); row.createSpan({ text: label });
    const wrap = row.createDiv('qm-sound-input'); const input = wrap.createEl('input', { type, value: this.profile[key] || '', attr: { autocomplete: 'off', 'data-sound-field': key } });
    input.addEventListener('input', () => {
      this.profile[key] = input.value.trim(); this.catalogs.delete(this.id); this.invalidate();
      if (key === 'key') this.refreshList();
    });
    if (type === 'password') this.action(wrap, 'eye', this.tx('show'), () => { input.type = input.type === 'password' ? 'text' : 'password'; wrap.querySelector('button').setLabel(this.tx(input.type === 'password' ? 'show' : 'hide')); });
    return input;
  }
  select(parent, key, label, values, change) {
    const row = parent.createEl('label', { cls: 'qm-sound-field' }); row.createSpan({ text: label });
    const select = row.createEl('select', { attr: { 'data-sound-field': key } });
    for (const item of values) select.createEl('option', { value: item.id, text: item.label });
    select.value = this.profile[key] || '';
    select.addEventListener('change', () => change(select.value)); return select;
  }
  render() {
    if (this.closed) return;
    this.localPanel?.destroy(); this.body.empty(); this.list = null;
    this.select(this.body, 'id', this.tx('service'), this.adapter.providers(this.id), id => this.switchProvider(id));
    const profile = this.profile, cloud = !localIds.includes(profile.id);
    this.body.createDiv({ cls: 'qm-sound-help', text: this.tx(profile.id === 'edge' ? 'edge' : profile.id === 'localModel' ? 'localModel' : cloud ? 'cloud' : 'local') });
    const config = this.body.createDiv('qm-sound-config');
    if (cloud) {
      const details = this.editing || this.adapter.validate(profile) ? config : config.createEl('details');
      if (details !== config) details.createEl('summary', { text: this.tx('edit') });
      this.input(details, 'key', this.tx('key'), 'password');
      const link = this.adapter.links(profile)?.[0];
      if (link) details.createEl('a', { text: this.tx('getKey'), href: link, attr: { target: '_blank', rel: 'noopener noreferrer' } });
      if (profile.id === 'azure') this.input(details, 'region', this.tx('region'));
      if (profile.id === 'compatible') this.input(details, 'baseUrl', this.tx('url'));
    }
    const modelKey = profile.id === 'doubao' ? 'resourceId' : 'model';
    const models = this.adapter.models(profile, this.catalogs.get(this.id));
    if (models.length || cloud && !['azure'].includes(profile.id)) {
      const value = profile[modelKey] || '';
      const entries = [...models]; if (value && !entries.some(v => v.id === value)) entries.push({ id: value, label: value });
      if (profile.id !== 'localModel') entries.push({ id: '__custom__', label: this.tx('custom') });
      this.select(config, modelKey, this.tx('model'), entries, value => {
        if (value === '__custom__') { if (!config.querySelector('input[data-sound-field="'+modelKey+'"]')) this.input(config, modelKey, this.tx('model')).focus(); return; }
        this.invalidate(); this.drafts.set(this.id, this.adapter.changeModel(this.profile, value, this.catalogs.get(this.id))); this.render();
      });
    }
    if (profile.id === 'localModel') this.localPanel = this.adapter.setup?.(config.createDiv(), profile, () => this.updateFooter());
    const search = this.body.createEl('label', { cls: 'qm-sound-search' });
    search.createSpan({ cls: 'qm-sound-sr', text: this.tx('search') });
    const input = search.createEl('input', { type: 'search', value: this.query, attr: { placeholder: this.tx('search') } });
    input.addEventListener('input', () => { this.query = input.value; this.refreshList(); });
    this.list = this.body.createDiv('qm-sound-list');
    this.refreshList();
    const extra = this.body.createEl('details'); extra.createEl('summary', { text: this.tx('advanced') });
    extra.hidden = ['system', 'localModel'].includes(profile.id);
    if (profile.baseUrl !== undefined && profile.id !== 'compatible') this.input(extra, 'baseUrl', this.tx('url'));
    if (this.adapter.canLoad(profile)) this.action(extra, 'refresh-cw', this.tx('refresh'), () => { void this.loadVoices(); });
    if (!['macos', 'system', 'localModel'].includes(profile.id)) this.input(extra, 'voice', `${this.tx('voice')} ID`);
    const recent = this.adapter.recent?.() || [];
    if (recent.length) {
      const group = this.body.createEl('details'); group.createEl('summary', { text: this.tx('recent') });
      if (this.adapter.clearRecent) this.action(group, 'x', this.tx('clear'), async () => { await this.adapter.clearRecent(); this.render(); });
      for (const entry of recent) this.action(group, 'history', this.label(entry), () => {
        this.invalidate(); this.id = entry.id; this.drafts.set(this.id, { ...this.adapter.profile(entry.id), ...entry }); this.render();
      });
    }
    this.updateFooter();
    if (profile.id === 'macos' && !this.catalogs.has('macos') && !this.nativeAttempted) { this.nativeAttempted = true; void this.loadVoices(); }
  }
  label(profile) {
    const voice = this.adapter.voices(profile, this.catalogs.get(profile.id)).find(v => v.id === profile.voice)?.label || (profile.id === 'macos' ? profile.voice?.split('.').pop() : profile.voice) || this.tx('automatic');
    return `${this.adapter.providers(profile.id).find(p => p.id === profile.id)?.label || profile.id} · ${voice}`;
  }
  refreshList() {
    if (!this.list) return;
    this.list.empty();
    const p = this.profile, blocked = !localIds.includes(p.id) && !p.key && p.id !== 'compatible';
    this.list.hidden = blocked;
    this.body.querySelector('.qm-sound-search').hidden = blocked;
    if (blocked) return;
    const voices = this.adapter.voices(p, this.catalogs.get(p.id));
    const filtered = voices.filter(v => `${v.label} ${v.id}`.toLocaleLowerCase().includes(this.query.toLocaleLowerCase()));
    for (const voice of filtered) {
      const row = this.list.createDiv('qm-sound-voice');
      const choose = this.action(row, voice.id === p.voice ? 'check' : 'audio-lines', voice.label, () => {
        this.invalidate(); p.voice = voice.id; this.refreshList(); this.updateFooter();
      }); choose.setAttribute('aria-pressed', String(voice.id === p.voice));
      const test = this.action(row, 'play', this.tx('test'), () => {
        if (voice.id !== p.voice) { this.invalidate(); p.voice = voice.id; this.refreshList(); } this.audition();
      }); test.classList.add('qm-sound-audition');
      test.disabled = !!this.adapter.validate({ ...p, voice: voice.id });
    }
    if (!filtered.length) this.list.createDiv({ cls: 'qm-sound-help', text: this.tx('empty') });
  }
  updateFooter() {
    if (!this.test || this.closed) return;
    const problem = this.adapter.validate(this.profile), busy = ['loading', 'playing'].includes(this.state);
    const verified = this.verified === identity(this.profile);
    this.feedback.setText(this.message || (busy ? this.tx('testing') : problem ? problem.code === 'key' ? this.tx('credentials') : this.adapter.error(problem, this.id) : verified ? this.tx('verified') : this.tx('ready')));
    this.currentLabel.setText(`${this.tx('current')}：${this.label(this.active)}${this.dirty ? `\n${this.tx('pending')}：${this.label(this.profile)}` : ''}`);
    setIcon(this.test.querySelector('.qm-sound-icon'), busy ? 'square' : 'play');
    this.test.setLabel(this.tx(busy ? 'stop' : 'test')); this.test.disabled = this.saving || !!problem && !busy;
    this.use.setLabel(this.tx(this.dirty ? 'apply' : 'done')); this.use.disabled = this.saving || this.dirty && !verified;
  }
  async loadVoices() {
    this.abort?.abort(); const abort = this.abort = new AbortController(), profile = { ...this.profile }, stamp = identity(profile);
    this.message = this.tx('loading'); this.updateFooter();
    try {
      const catalog = await this.adapter.load(profile, abort.signal);
      if (this.closed || abort.signal.aborted || stamp !== identity(this.profile)) return;
      this.catalogs.set(profile.id, catalog);
      if (profile.id === 'macos' && !this.profile.voice && this.adapter.initialProvider === 'macos') this.profile.voice = catalog.voices.find(v => v.recommended)?.id || catalog.voices[0]?.id || '';
      this.message = ''; this.refreshList(); this.updateFooter();
    } catch (error) { if (!this.closed && !abort.signal.aborted && stamp === identity(this.profile)) { this.message = this.adapter.error(error, profile.id); this.updateFooter(); } }
  }
  audition() {
    if (['loading', 'playing'].includes(this.state)) { this.cancelTest(); this.updateFooter(); return; }
    const problem = this.adapter.validate(this.profile); if (problem) { this.message = this.adapter.error(problem, this.id); this.updateFooter(); return; }
    this.cancelTest(); this.verified = ''; this.testIdentity = identity(this.profile); this.state = 'loading'; this.updateFooter();
    try { this.adapter.preview(this.owner, this.tx('sample'), { ...this.profile }); }
    catch (error) { this.state = 'error'; this.message = this.adapter.error(error, this.id); this.updateFooter(); }
  }
  async apply() {
    if (this.saving) return;
    if (!this.dirty) { try { await this.adapter.confirm?.(); this.close(); } catch { this.message = this.tx('saveError'); this.updateFooter(); } return; }
    if (this.verified !== identity(this.profile)) return;
    this.saving = true; this.cancelTest(); this.updateFooter();
    try { await this.adapter.apply({ ...this.profile }); this.close(); }
    catch { if (!this.closed) { this.message = this.tx('saveError'); this.saving = false; this.updateFooter(); } }
  }
  onClose() {
    this.contentEl.ownerDocument.defaultView?.speechSynthesis?.removeEventListener('voiceschanged', this.voicesChanged);
    this.closed = true; ++this.generation; this.abort?.abort(); this.unsubscribe?.(); this.adapter.stop(this.owner); this.localPanel?.destroy(); this.drafts.clear(); this.adapter.closed?.(); this.contentEl.empty();
  }
}
