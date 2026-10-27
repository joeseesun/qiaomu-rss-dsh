// Public library entry. Each consumer bundles its own controller and providers.
export { SpeechService, hiddenProvider } from './speech.js';
export { normalizeSettings, ttsSecretId, getSecret, setSecret, RATES } from './settings.js';
export { TTS_PROVIDERS, ttsProfile } from './core/tts/providers.js';
export { voiceChoices, TTS_MODELS, modelKey, changeSpeechModel, loadVoiceCatalog, canLoadVoiceCatalog } from './core/tts/choices.js';
export { LOCAL_MODELS, localVoiceChoices, normalizeLocalProfile } from './runtime/registry.js';

export { splitSpeechText } from './core/tts/text.js';
export { cloudService } from './core/cloud-services.js';
export { findSpeechSettings, copySpeechSettings } from './shared/configuration.js';
export { speechFingerprint, rememberProgress, resumeOffset } from './shared/progress.js';
export { SpeechChoices, openVoicePicker } from './obsidian/speech-choices.js';
