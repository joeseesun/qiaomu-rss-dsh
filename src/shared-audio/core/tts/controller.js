import { SpeechCache, checkTtsSignal, ttsError } from './providers.js';
import { estimateMarks, markIndex } from './timing.js';

export class TtsController {
  constructor({ synthesize, makeAudio, speech, makeUtterance, onChange = () => {}, beforePlay = () => {} }) {
    Object.assign(this, { synthesize, makeAudio, speech, makeUtterance, onChange, beforePlay });
    this.cache = new SpeechCache(); this.pending = new Map(); this.generation = 0;
    this.state = 'idle'; this.index = 0; this.rate = 1; this.items = [];
  }
  emit() { this.onChange(this); }
  releasePlayer() {
    this.stopProgress();
    if (this.audio) { this.audio.onended = this.audio.onerror = null; this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); this.audio = null; }
    if (this.url) { URL.revokeObjectURL(this.url); this.url = null; }
    if (this.utterance) { this.utterance.onend = this.utterance.onerror = null; this.speech?.cancel(); this.utterance = null; }
  }
  // Report the word being spoken (item.text offsets) to owners that follow along.
  startProgress(generation, item, index, result) {
    this.stopProgress();
    const audio = this.audio, owner = this.owner;
    if (!audio || !owner?.onProgress) return;
    let marks = result.marks, last = -2;
    const tick = () => {
      if (generation !== this.generation || audio !== this.audio) { this.stopProgress(); return; }
      if (!marks && audio.duration > 0 && Number.isFinite(audio.duration)) {
        const from = result.active?.from ?? 0, to = result.active?.to ?? audio.duration;
        marks = estimateMarks(item.text, Math.max(0.1, to - from), from);
      }
      if (!marks?.length) return;
      const at = audio.ended ? marks.length - 1 : markIndex(marks, audio.currentTime);
      if (at === last) return; last = at;
      owner.onProgress(item, index, at < 0 ? null : { start: marks[at].s, end: marks[at].e });
    };
    this.progressTimer = globalThis.setInterval(tick, 40); tick();
  }
  stopProgress() { if (this.progressTimer) { globalThis.clearInterval(this.progressTimer); this.progressTimer = null; } }
  stop(owner) {
    if (owner && this.owner !== owner) return;
    ++this.generation; this.abort?.abort(); this.releasePlayer(); this.pending.clear();
    this.owner?.clearHighlight?.(); this.owner = null; this.items = []; this.nextSection = null;
    this.state = 'idle'; this.error = null; this.paused = false; this.deferred = false; this.waitingSection = false; this.preparingSegment = false; this.emit();
  }
  start(owner, items, profile, { nextSection, index = 0, rate = 1, paused = false } = {}) {
    if (!paused) this.beforePlay();
    this.stop(); this.owner = owner; this.items = items; this.profile = { ...profile };
    this.nextSection = nextSection; this.index = Math.max(0, Math.min(index, items.length - 1));
    this.rate = Math.min(2, Math.max(0.5, rate));
    this.abort = new AbortController(); this.paused = paused; this.deferred = paused;
    this.state = paused ? 'paused' : 'loading';
    if (paused) this.emit(); else void this.playCurrent(this.generation);
  }
  async load(item, signal) {
    checkTtsSignal(signal);
    const { key: _key, ...publicProfile } = this.profile;
    const key = JSON.stringify([publicProfile, item.text]);
    const cached = this.cache.get(key); if (cached) return cached;
    if (this.pending.has(key)) return this.pending.get(key);
    const promise = this.synthesize(this.profile, item.text, signal).then(value => {
      checkTtsSignal(signal); this.cache.set(key, value); return value;
    });
    this.pending.set(key, promise);
    try { return await promise; } finally { if (this.pending.get(key) === promise) this.pending.delete(key); }
  }
  async playCurrent(generation) {
    if (generation !== this.generation) return;
    this.releasePlayer(); this.error = null;
    const item = this.items[this.index];
    if (!item) { this.owner?.clearHighlight?.(); this.state = 'ended'; this.emit(); return; }
    this.state = this.paused ? 'paused' : 'loading'; this.emit();
    let playing = null;
    try {
      const signal = this.abort.signal;
      if (this.profile.id === 'system') {
        if (typeof this.speech?.speak !== 'function' || typeof this.speech?.getVoices !== 'function' || !this.makeUtterance) throw ttsError('systemUnavailable');
        const utterance = this.makeUtterance(item.text);
        const voices = this.speech.getVoices();
        const voice = this.profile.voice ? voices.find(v => v.voiceURI === this.profile.voice) : null;
        if (this.profile.voice && !voice) throw ttsError('voice');
        if (voice) utterance.voice = voice;
        utterance.lang = voice?.lang || (/[\u3400-\u9fff]/u.test(item.text) ? 'zh-CN' : 'en-US');
        utterance.rate = this.rate;
        utterance.onend = () => { if (generation === this.generation) void this.advance(generation); };
        // Web Speech reports word starts only on some voices; the rest simply keep the sentence highlight.
        utterance.onboundary = event => {
          if (generation !== this.generation || event.name !== 'word') return;
          const start = event.charIndex, end = start + (event.charLength || (item.text.slice(start).match(/^[\u3400-\u9fff]|^[\p{L}\p{N}'’-]+/u)?.[0].length ?? 1));
          this.owner?.onProgress?.(item, this.index, { start, end });
        };
        utterance.onerror = () => this.fail(ttsError('system'), generation);
        this.utterance = utterance;
        this.utteranceStarted = false;
      } else {
        const result = await this.load(item, signal);
        // At faster local playback, prepare the next sentence before starting
        // so a cold voice does not leave the first transition unbuffered.
        if (this.profile.id === 'localModel' && this.rate > 1 && this.items[this.index + 1]) {
          await this.load(this.items[this.index + 1], signal).catch(() => {});
        }
        if (generation !== this.generation) return;
        this.url = URL.createObjectURL(new Blob([result.bytes], { type: result.mime }));
        const audio = this.audio = this.makeAudio();
        audio.src = this.url; audio.playbackRate = this.rate;
        audio.onended = () => { if (generation === this.generation) void this.advance(generation); };
        audio.onerror = () => this.fail(ttsError('playback'), generation);
        playing = result;
      }
      // Finish page-follow before starting this segment. Overlapping location
      // updates can otherwise be mistaken for the user browsing elsewhere.
      this.preparingSegment = true;
      await this.owner?.onSegment?.(item, this.index);
      if (generation !== this.generation) return;
      this.preparingSegment = false;
      if (!this.paused) {
        if (this.audio) await this.audio.play();
        else { this.speech.speak(this.utterance); this.utteranceStarted = true; }
      }
      if (generation !== this.generation) return;
      this.state = this.paused ? 'paused' : 'playing';
      if (playing) this.startProgress(generation, item, this.index, playing);
      this.emit();
      // Local synthesis runs serially in the worker. Keep a small buffer for
      // faster playback; remote services retain one speculative request.
      const ahead = this.profile.id === 'localModel' ? 3 : 1;
      if (!this.paused && this.profile.id !== 'system') {
        for (let offset = 1; offset <= ahead && this.items[this.index + offset]; offset++) {
          void this.load(this.items[this.index + offset], signal).catch(() => {});
        }
      }
    } catch (error) { this.fail(error, generation); }
  }
  fail(error, generation) {
    if (generation !== this.generation || error?.name === 'AbortError') return;
    this.releasePlayer(); this.abort?.abort(); this.preparingSegment = false; this.state = 'error'; this.error = error;
    this.owner?.clearHighlight?.(); this.emit();
  }
  async advance(generation) {
    if (generation !== this.generation) return;
    this.index++;
    if (this.index >= this.items.length && this.nextSection) {
      if (this.owner?.follow === false) {
        this.releasePlayer(); this.paused = true; this.waitingSection = true; this.state = 'paused'; this.emit(); return;
      }
      this.state = 'loading'; this.emit();
      try {
        const items = await this.nextSection(this.abort.signal);
        if (generation !== this.generation) return;
        this.items = items || []; this.index = 0;
      } catch (error) { this.fail(error, generation); return; }
    }
    await this.playCurrent(generation);
  }
  pause({ releaseSystem = false } = {}) {
    if (!['playing', 'loading'].includes(this.state)) return;
    this.paused = true; this.audio?.pause();
    if (this.utteranceStarted) {
      if (releaseSystem) { this.releasePlayer(); this.deferred = true; }
      else this.speech?.pause();
    }
    this.state = 'paused'; this.emit();
  }
  toggle() {
    if (this.paused || this.state === 'error' || this.state === 'ended') this.beforePlay();
    if (this.waitingSection) {
      this.waitingSection = false; this.paused = false; this.owner.follow = true; this.index--;
      void this.advance(this.generation); return;
    }
    if (this.deferred) { this.deferred = false; this.paused = false; void this.playCurrent(this.generation); return; }
    if (this.state === 'error' || this.state === 'ended') { this.retry(); return; }
    this.paused = !this.paused;
    if (this.paused) { this.audio?.pause(); if (this.utteranceStarted) this.speech?.pause(); this.state = 'paused'; }
    else {
      if (this.preparingSegment) { this.state = 'loading'; this.emit(); return; }
      const generation = this.generation;
      if (this.audio) void this.audio.play().catch(() => this.fail(ttsError('playback'), generation));
      if (this.utterance) { if (this.utteranceStarted) this.speech.resume(); else { this.speech.speak(this.utterance); this.utteranceStarted = true; } }
      this.state = this.audio || this.utterance ? 'playing' : 'loading';
    }
    this.emit();
  }
  retry() {
    this.beforePlay();
    ++this.generation; this.abort?.abort(); this.pending.clear(); this.abort = new AbortController();
    this.paused = false; this.deferred = false; this.waitingSection = false; this.index = Math.min(this.index, Math.max(0, this.items.length - 1));
    void this.playCurrent(this.generation);
  }
  skip(delta) {
    this.seek(this.index + delta);
  }
  // Navigating a paused session must never start speaking. Explicit restart
  // actions can opt into playback; all outstanding synthesis is superseded.
  seek(index, { paused = this.state === 'paused' } = {}) {
    if (!this.items.length || !Number.isFinite(index)) return;
    index = Math.max(0, Math.min(this.items.length - 1, Math.trunc(index)));
    ++this.generation; this.abort?.abort(); this.releasePlayer(); this.pending.clear();
    this.abort = new AbortController(); this.index = index; this.error = null;
    this.paused = paused; this.deferred = paused; this.waitingSection = false; this.preparingSegment = false;
    if (paused) {
      this.owner?.clearHighlight?.(); this.state = 'paused'; this.emit();
    } else { this.beforePlay(); void this.playCurrent(this.generation); }
  }
  setRate(rate) {
    this.rate = Math.max(0.5, Math.min(2, Number(rate) || 1));
    if (this.audio) this.audio.playbackRate = this.rate;
    // Web Speech cannot reliably change an active utterance's rate. Apply to
    // the next utterance without restarting and repeating the current text.
    this.emit();
  }
  dispose() { this.stop(); this.cache.clear(); }
}
