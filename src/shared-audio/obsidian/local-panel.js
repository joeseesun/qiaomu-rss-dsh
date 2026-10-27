import { LOCAL_MODELS, ASR_MODELS } from '../runtime/registry.js';
import { errorText, t } from '../i18n.js';
import { iconButton } from './ui.js';

const BUSY = ['runtime', 'download', 'downloaded', 'environment', 'extract', 'installed', 'verify', 'cancelling', 'server'];

// Download / progress / cancel for one local model (speech or recognition). Shows real readiness only after a local check.
export class LocalModelPanel {
  constructor(host, { manager, model, onReady, details = true }) {
    Object.assign(this, { host, manager, model, onReady });
    const info = [...LOCAL_MODELS, ...ASR_MODELS].find(x => x.id === model);
    host.addClass('qaudio-local-panel');
    this.status = host.createDiv({ cls: 'qaudio-feedback', attr: { role: 'status', 'aria-live': 'polite' } });
    this.progress = host.createEl('progress', { attr: { max: '1' } }); this.progress.toggleClass('qaudio-hidden', true);
    const actions = host.createDiv('qaudio-actions');
    this.install = iconButton(actions, 'download', t('local.download'), async () => {
      try { await manager.install(model); if (!this.disposed) await onReady?.(); }
      catch (error) { if (!this.disposed && error.name !== 'AbortError') this.status.setText(errorText(error)); }
    }, { text: true, cls: 'qaudio-primary-text' });
    this.cancel = iconButton(actions, 'x', t('local.cancel'), () => manager.cancelInstall(model), { text: true });
    this.cancel.toggleClass('qaudio-hidden', true);
    this.setup = actions.createEl('a', { text: t('local.setup'), href: 'https://github.com/joeseesun/qiaomu-audio-dsh/blob/main/docs/local-runtime.md', attr: { target: '_blank', rel: 'noopener noreferrer' } });
    this.setup.toggleClass('qaudio-hidden', true);
    this.check = iconButton(actions, 'refresh-cw', t('local.check'), () => {
      void manager.status(model).catch(error => { if (!this.disposed) this.status.setText(errorText(error)); });
    }, { text: true });
    this.size = actions.createSpan({ cls: 'qaudio-muted', text: t('local.size', { size: Math.ceil((info?.bytes || 0) / 1024 ** 2), license: info?.license || '' }) });
    if (details && info) {
      const more = host.createEl('details', { cls: 'qaudio-details' });
      more.createEl('summary', { text: t('local.details') });
      more.createEl('p', { text: t('local.storage') });
      more.createEl('a', { text: `${info.label} · ${info.license}`, href: info.source, attr: { target: '_blank', rel: 'noopener' } });
    }
    this.unsubscribe = manager.subscribe((id, state) => { if (id === model && !this.disposed) this.refresh(state); });
    this.refresh(manager.snapshot(model));
    void manager.status(model).catch(error => { if (!this.disposed) this.status.setText(errorText(error)); });
  }
  refresh(state) {
    const busy = BUSY.includes(state.phase), ready = state.phase === 'ready';
    const missingRuntime = state.phase === 'runtimeMissing';
    this.install.disabled = busy || state.phase === 'unknown'; this.install.toggleClass('qaudio-hidden', ready || busy || missingRuntime); this.size.toggleClass('qaudio-hidden', ready || missingRuntime);
    this.setup.toggleClass('qaudio-hidden', !missingRuntime);
    this.check.toggleClass('qaudio-hidden', !missingRuntime);
    this.cancel.toggleClass('qaudio-hidden', !busy); this.cancel.disabled = state.phase === 'cancelling';
    this.progress.toggleClass('qaudio-hidden', !busy);
    if (state.total) this.progress.value = state.bytes / state.total; else this.progress.removeAttribute('value');
    const progress = state.total ? ` · ${t('phase.progress', { mb: Math.floor(state.bytes / 1024 ** 2), total: Math.ceil(state.total / 1024 ** 2) })}` : '';
    this.status.setText(state.phase === 'error' ? errorText(state.error) : t(`phase.${state.phase}`) + progress);
    this.status.toggleClass('is-ready', ready);
  }
  destroy() { this.disposed = true; this.unsubscribe?.(); }
}
