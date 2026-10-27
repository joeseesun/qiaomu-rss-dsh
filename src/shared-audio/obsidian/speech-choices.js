import { Platform, Setting } from '../../client/original-ui.ts';
import { TTS_MODELS, changeSpeechModel, modelKey, uniqueChoices, canLoadVoiceCatalog } from '../core/tts/choices.js';
import { LOCAL_MODELS, normalizeLocalProfile } from '../runtime/registry.js';
import { t } from '../i18n.js';
import { TTS_PROVIDERS, ttsProfile } from '../core/tts/providers.js';
import { hiddenProvider } from '../speech.js';
import { SoundDialog } from './sound-dialog.js';
import { LocalModelPanel } from './local-panel.js';
import { cloudService } from '../core/cloud-services.js';
import { getSecret, setSecret, ttsSecretId } from '../settings.js';
import { applySpeechChoice } from '../core/tts/recent.js';

// Shared by Audio and RSS. Based on Reader's SpeechChoices: scope voices by model,
// load native voices immediately, fence late catalogs, and preserve reading while auditioning.
export class SpeechChoices {
  constructor(parent, { host, tx, chinese = false, onChange, errorText, onSettings }) {
    Object.assign(this, { parent, host, tx, chinese, onChange, errorText, onSettings });
    this.render();
    if (host.settings.tts.provider === 'system' && window.speechSynthesis?.addEventListener) {
      this.voicesChanged = () => this.render(); window.speechSynthesis.addEventListener('voiceschanged', this.voicesChanged);
    }
  }
  options() { return { chinese: this.chinese, tx: this.tx }; }
  async update(key, value) {
    this.host.speech.stopPreview();
    const { host } = this, profile = host.speech.profile(), id = profile.id;
    let next = key === modelKey(profile) && id !== 'localModel' ? changeSpeechModel(profile, value, host.voiceCatalogs[id]) : { ...profile, [key]: value };
    if (id === 'localModel') next = normalizeLocalProfile(key === 'model' ? { ...next, voice: '' } : next);
    const { id: _id, label: _label, key: _key, ...saved } = next;
    host.settings.tts.profiles[id] = saved;
    await this.onChange(key); if (!this.disposed) this.render();
  }
  async provider(id) {
    this.abort?.abort(); this.host.speech.stopPreview();
    this.host.settings.tts.provider = id; this.host.settings.tts.welcomed = true; this.nativeAttempted = false; this.message = '';
    await this.onChange('provider'); if (!this.disposed) this.render();
  }
  async recent(value) {
    this.abort?.abort(); this.host.speech.stopPreview();
    const previous = this.host.settings.tts.profiles[value.id];
    if (previous?.baseUrl !== value.baseUrl || previous?.region !== value.region) delete this.host.voiceCatalogs[value.id];
    if (!applySpeechChoice(this.host.settings.tts, value)) return;
    this.nativeAttempted = false; this.message = '';
    await this.onChange('recent'); if (!this.disposed) this.render();
  }
  field(name, key, values, custom, parent = this.parent) {
    const value = this.host.speech.profile()[key] || '', choices = uniqueChoices(values);
    if (!choices.some(choice => choice.id === value)) choices.unshift({ id: value, label: value || this.tx(custom ? 'custom' : 'automatic') });
    const row = new Setting(parent).setName(name);
    row.addDropdown(drop => {
      drop.selectEl.dataset.speechField = key;
      for (const choice of choices) drop.addOption(choice.id, choice.label); if (custom) drop.addOption('__custom__', this.tx('custom'));
      drop.setValue(value).onChange(async next => {
        if (next === '__custom__') {
          if (row.settingEl.querySelector('input')) { row.settingEl.querySelector('input').focus(); return; }
          row.addText(text => { text.inputEl.setAttribute('aria-labelledby', row.nameEl.id); text.setValue(value); text.inputEl.addEventListener('change', () => { void this.update(key, text.getValue().trim()); }); text.inputEl.focus(); });
        } else await this.update(key, next);
      });
    });
    row.nameEl.id = `qiaomu-speech-field-${crypto.randomUUID()}`;
    for (const input of row.settingEl.querySelectorAll('select,input')) { input.removeAttribute('aria-label'); input.removeAttribute('title'); input.setAttribute('aria-labelledby', row.nameEl.id); }
    return row;
  }
  render() {
    if (this.disposed) return;
    const { host, tx } = this, profile = host.speech.profile(), id = profile.id;
    this.parent.empty(); this.parent.addClass('qaudio-choices');
    const catalog = host.voiceCatalogs[id] || {};
    if (id === 'localModel') this.field(tx('model'), 'model', LOCAL_MODELS.map(model => ({ id: model.id, label: model.label })), false);
    else if (TTS_MODELS[id]) this.field(tx(id === 'doubao' ? 'resource' : 'model'), modelKey(profile), [...TTS_MODELS[id], ...(catalog.models || [])], true);
    const voices = host.speech.choices(profile, this.options());
    const voice = this.field(tx('voice'), 'voice', voices, !['macos', 'system', 'localModel'].includes(id));
    voice.addButton(button => button.setButtonText(tx('picker')).setDisabled(id === 'macos' && !catalog.voices).onClick(() => { this.modal?.close(); this.modal = openVoicePicker(this.host, { tx: this.tx, chinese: this.chinese, errorText: this.errorText }); }));
    if (id === 'system' && Platform.isDesktopApp && Platform.isMacOS) voice.setDesc(tx('macHelp'));
    if (id === 'macos' && catalog.voices && profile.voice && !catalog.voices.some(v => v.id === profile.voice)) voice.setDesc(tx('unavailable'));
    this.modal?.refreshVoices?.();
    if (canLoadVoiceCatalog(id) || id === 'macos') {
      const refresh = new Setting(this.parent).setName(tx('refresh'));
      const feedback = refresh.descEl.createSpan({ text: this.message || '', attr: { role: 'status' } });
      refresh.addButton(button => button.setButtonText(tx('refresh')).onClick(() => { void this.load(button, feedback); }));
      if (id === 'macos' && !catalog.voices && !this.nativeAttempted) { this.nativeAttempted = true; void this.load(null, feedback); }
    }
  }
  async load(button, feedback) {
    this.abort?.abort(); const abort = this.abort = new AbortController();
    const profile = this.host.speech.profile(), identity = JSON.stringify([profile.id, profile.baseUrl, profile.region, profile.key]);
    button?.setDisabled(true); feedback?.setText(this.tx('loading'));
    try {
      const catalog = await this.host.speech.loadChoices(profile, { ...this.options(), signal: abort.signal });
      const current = this.host.speech.profile();
      if (abort.signal.aborted || this.disposed || identity !== JSON.stringify([current.id, current.baseUrl, current.region, current.key])) return;
      this.host.voiceCatalogs[profile.id] = catalog;
      // Keep the old property for Audio integrations; it is always this same native list.
      if (profile.id === 'macos') this.host.macVoices = catalog.voices;
      this.message = this.tx(catalog.more ? 'partial' : 'loaded'); this.render();
    } catch (error) {
      if (!abort.signal.aborted && !this.disposed) { this.message = this.errorText(error); feedback?.setText(this.message); button?.setDisabled(false); }
    }
  }
  destroy() { this.disposed = true; this.abort?.abort(); this.modal?.close(); if (this.voicesChanged) window.speechSynthesis.removeEventListener('voiceschanged', this.voicesChanged); }
}
export function audioSpeechChoiceText(key) {
  return t(({ service: 'settings.service', system: 'tts.provider.system', macos: 'tts.provider.macos', localModel: 'tts.provider.localModel', settings: 'player.settings', automatic: 'tts.systemVoice', model: 'settings.model', resource: 'settings.resourceId', voice: 'settings.voice', picker: 'tts.voicePicker', search: 'tts.voiceSearch', custom: 'settings.custom', refresh: 'settings.refreshVoices', loading: 'state.loading', loaded: 'settings.catalogReady', partial: 'settings.catalogPartial', preview: 'settings.preview', sample: 'tts.sample', empty: 'tts.noVoices', verified: 'state.verified', paused: 'state.paused', macHelp: 'tts.macSystemHelp', unavailable: 'tts.unavailableVoice', recommended: 'tts.recommended', voicePremium: 'tts.voicePremium', voiceEnhanced: 'tts.voiceEnhanced', voiceDisplayName: 'tts.voiceDisplayName', recent: 'tts.recent', clearRecent: 'tts.clearRecent' })[key] || key);
}
export function openVoicePicker(host, options = {}) {
  const speech = host.speech, tx = options.tx || audioSpeechChoiceText;
  const chinese = options.chinese;
  const profile = id => ({ ...ttsProfile(host.settings.tts, id), key: getSecret(host.app, ttsSecretId(id, host.manifest.id)) });
  const modal = new SoundDialog(host.app, {
    initialProvider: !host.settings.tts.welcomed && Platform.isDesktopApp && Platform.isMacOS ? 'macos' : undefined,
    chinese, current: () => speech.profile(), profile,
    providers: selected => Object.entries(TTS_PROVIDERS).filter(([id]) => !hiddenProvider(id, selected)).map(([id, data]) => ({ id, label: ['system','macos','localModel'].includes(id) ? tx(id) : data.label })),
    models: p => p.id === 'localModel' ? LOCAL_MODELS : TTS_MODELS[p.id] || [],
    changeModel: (p, value, catalog) => p.id === 'localModel' ? { ...p, ...normalizeLocalProfile({ ...p, model: value, voice: '' }) } : changeSpeechModel(p, value, catalog || {}),
    voices: (p, catalog) => catalog?.voices || speech.choices(p, { chinese, tx }),
    canLoad: p => p.id === 'macos' || canLoadVoiceCatalog(p.id),
    load: (p, signal) => speech.loadChoices(p, { chinese, tx, signal }),
    validate: p => speech.configurationError(p) || (p.id === 'localModel' && host.local().snapshot(p.model).phase !== 'ready' ? { code: 'localMissing' } : null),
    error: options.errorText, links: p => { const help = cloudService('tts', p.id); return help ? [help.keyHelp] : []; },
    recent: () => (host.settings.tts.recent || []).filter(p => !hiddenProvider(p.id, '')).slice(0, 8),
    closed: options.onClosed,
    clearRecent: async () => { host.settings.tts.recent = []; await host.saveSettings(); },
    confirm: async () => { host.settings.tts.welcomed = true; await host.saveSettings(); },
    subscribe: listener => speech.subscribe(listener), preview: (owner, text, p) => speech.startPreview(owner, text, p), stop: owner => speech.stopPreview(owner),
    setup: (el, p, onReady) => new LocalModelPanel(el, { manager: host.local(), model: p.model, onReady }),
    apply: async p => {
      const previous = structuredClone(host.settings.tts), oldKey = profile(p.id).key;
      const { key, id, label: _label, ...saved } = p;
      try {
        if (key !== oldKey) await setSecret(host.app, ttsSecretId(id, host.manifest.id), key);
        host.settings.tts.profiles[id] = saved; host.settings.tts.provider = id; host.settings.tts.welcomed = true;
        if (options.onChange) await options.onChange();
        else { await host.saveSettings(); host.reading?.restartWithSettings(); }
      } catch (error) {
        host.settings.tts = previous;
        if (key !== oldKey) await setSecret(host.app, ttsSecretId(id, host.manifest.id), oldKey);
        throw error;
      }
    },
  });
  modal.open(); return modal;
}
