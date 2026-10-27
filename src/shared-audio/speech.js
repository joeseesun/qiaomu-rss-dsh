import { Notice, Platform } from '../client/original-ui.ts';
import { t } from './i18n.js';
import { rememberSpeechChoice } from './core/tts/recent.js';
import { TtsController } from './core/tts/controller.js';

import { buildSpeechRequest, checkTtsSignal, synthesizeHttp, ttsError, ttsProfile } from './core/tts/providers.js';
import { voiceChoices, loadVoiceCatalog } from './core/tts/choices.js';
import { macVoiceChoices } from './core/tts/mac-voices.js';
import { localVoiceChoices } from './runtime/registry.js';
import { splitSpeechText } from './core/tts/text.js';
import { normalizeLocalProfile } from './runtime/registry.js';
import { getSecret, ttsSecretId } from './settings.js';
import { coordinateSpeech } from './shared/coordination.js';

// One speech controller per plugin: only one thing reads aloud at a time.
export class SpeechService {
  constructor(plugin) {
    this.plugin = plugin; this.listeners = new Set();
    this.coordination = coordinateSpeech(plugin.app.workspace, () => this.controller?.pause({ releaseSystem: true }));
    this.controller = new TtsController({
      beforePlay: () => this.coordination.claim(),
      makeAudio: () => new window.Audio(), speech: window.speechSynthesis,
      makeUtterance: text => new window.SpeechSynthesisUtterance(text),
      synthesize: (profile,text,signal)=>plugin.bridge.speech(profile,text,signal),
      onChange: controller => {
        if (controller.state === 'playing' && !this.preview && rememberSpeechChoice(this.settings, controller.profile)) {
          void Promise.resolve(plugin.saveSettings?.()).catch(() => new Notice(t('settings.saveError')));
        }
        for (const listener of this.listeners) listener(controller);
      },
    });
  }
  get settings() { return this.plugin.settings.tts; }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  profile() {
    const settings = this.settings, id = settings.provider;
    let profile = ttsProfile(settings, id);
    if (id === 'localModel') profile = { ...profile, ...normalizeLocalProfile(profile) };
    return { ...profile, key: getSecret(this.plugin.app, ttsSecretId(id, this.plugin.manifest.id)) };
  }
  choices(profile = this.profile(), { chinese = false, tx = key => key } = {}) {
    if (profile.id === 'system') return [{ id: '', label: tx('automatic') }, ...(window.speechSynthesis?.getVoices?.() || []).map(v => ({ id: v.voiceURI, label: `${v.name} · ${v.lang}` }))];
    if (profile.id === 'macos') return [{ id: '', label: tx('automatic') }, ...(this.plugin.voiceCatalogs?.macos?.voices || [])];
    if (profile.id === 'localModel') return localVoiceChoices(profile.model, chinese);
    return voiceChoices(profile, this.plugin.voiceCatalogs?.[profile.id] || {});
  }
  async loadChoices(profile, { signal, chinese = false, tx = key => key } = {}) {
    const catalog=await this.plugin.bridge.voices(profile,{signal,chinese});this.plugin.voiceCatalogs[profile.id]=catalog;if(profile.id==='macos')this.plugin.macVoices=catalog.voices;return catalog;
  }

  // Preview keeps the exact reading owner and sentence. Returning restores a paused session.
  startPreview(owner, text, profile = this.profile()) {
    if (this.preview && this.preview.owner !== owner) this.stopPreview(this.preview.owner);
    const c = this.controller;
    if (!this.preview) {
      const saved = c.owner && c.items.length && !['idle', 'ended'].includes(c.state) ? { owner: c.owner, items: c.items, index: c.index, rate: c.rate, nextSection: c.nextSection, makeAudio: c.makeAudio } : null;
      c.pause({ releaseSystem: true }); this.preview = { owner, saved };
    }
    this.speak(owner, text, profile);
  }
  stopPreview(owner = this.preview?.owner) {
    if (!owner) return;
    if (!this.preview || this.preview.owner !== owner) { this.controller.stop(owner); return; }
    const preview = this.preview; this.preview = null; const c = this.controller;
    const canRestore = !c.owner || c.owner === owner;
    c.stop(owner);
    if (canRestore && preview.saved) { const saved = preview.saved; c.makeAudio = saved.makeAudio; c.start(saved.owner, saved.items, this.profile(), { ...saved, paused: true }); }
  }
  discardPreview(owner) { if (this.preview?.saved?.owner === owner) this.preview.saved = null; }
  // Long sentences for online voices; short clauses keep local synthesis responsive.
  chunking() { return this.settings.provider === 'localModel' ? { limit: 40, clauses: true } : { limit: 240, clauses: false }; }
  configurationError(profile = this.profile()) {
    if (profile.id === 'system') return typeof window.speechSynthesis?.speak === 'function' && typeof window.SpeechSynthesisUtterance === 'function' ? null : ttsError('systemUnavailable');
    if (profile.id === 'macos') return Platform.isDesktopApp && Platform.isMacOS ? null : ttsError('macPlatform');
    if (profile.id === 'edge') return Platform.isDesktopApp ? null : ttsError('mobile');
    if (profile.id === 'localModel') return Platform.isDesktopApp ? null : ttsError('localPlatform');
    try { buildSpeechRequest(profile, '', profile.key); return null; } catch (error) { return error; }
  }
  // Speak plain text without a note (settings test, public API).
  speak(owner, text, profile = this.profile()) {
    const { limit, clauses } = this.chunking(), items = splitSpeechText(text, limit, clauses);
    if (items.length) this.controller.start(owner, items, profile, { rate: this.settings.rate });
    return items.length;
  }
  dispose() { this.preview = null; this.coordination.dispose(); this.controller.dispose(); this.listeners.clear(); }
}
export function hiddenProvider(id, selected) {
  return id !== selected && ((['edge', 'localModel'].includes(id) && !Platform.isDesktopApp) || (id === 'macos' && (!Platform.isDesktopApp || !Platform.isMacOS)));
}
export function providerHelp(id) {
  return id === 'system' ? 'tts.help.system' : id === 'localModel' ? 'tts.help.localModel' : id === 'macos' ? 'tts.help.macos' : id === 'edge' ? 'tts.help.edge' : 'tts.help.cloud';
}
export function providerLabel(t, id, fallback) {
  return ['system', 'macos', 'localModel', 'doubao', 'siliconflow', 'qwen'].includes(id) ? t(`tts.provider.${id}`) : fallback;
}
