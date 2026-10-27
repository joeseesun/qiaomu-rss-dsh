import { setIcon } from '../../client/original-ui.ts';

// Icon buttons carry their name as visually hidden text instead of aria-label, so Obsidian shows no hover tooltip.
export function iconButton(parent, icon, label, onClick, { text = false, cls = '' } = {}) {
  const button = parent.createEl('button', { cls: `qaudio-button ${cls}`.trim(), attr: { type: 'button' } });
  button.setAttribute('aria-label',label);
  const iconEl = button.createSpan({ cls: 'qaudio-icon' });
  setIcon(iconEl, icon);
  const labelEl = button.createSpan({ cls: text ? 'qaudio-button-text' : 'qaudio-sr', text: label });
  button.addEventListener('click', event => { event.preventDefault(); onClick(event); });
  button.setLabel = value => {labelEl.setText(value);button.setAttribute('aria-label',value);};
  button.setIconName = name => setIcon(iconEl, name);
  return button;
}
// View header actions: replace the tooltip-producing aria-label with hidden text.
export function quietAction(el, label) {
  el.removeAttribute('aria-label');
  el.removeAttribute('data-tooltip-position');
  el.setAttribute('role', 'button');
  el.createSpan({ cls: 'qaudio-sr', text: label });
  return el;
}
export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
