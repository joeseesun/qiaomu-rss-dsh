// Reader display names, not official Apple names. Keep identifiers unchanged
// so a saved voice continues to select the same installed system resource.
const RECOMMENDED = {
  'com.apple.siri.natural.Linfei': ['清和', 'Qinghe'],
  'com.apple.siri.natural.zh-CN-D': ['知远', 'Zhiyuan'],
  'com.apple.ttsbundle.gryphon-neural_zh-CN-D_zh-CN_premium': ['书宁', 'Shuning'],
};
export function macVoiceChoices(voices, tx, chinese) {
  return [...voices].sort((a, b) => Number(!!RECOMMENDED[b.id]) - Number(!!RECOMMENDED[a.id])
    || Number(/^zh|^yue/.test(b.lang)) - Number(/^zh|^yue/.test(a.lang)) || b.quality - a.quality).map(v => {
    const alias = RECOMMENDED[v.id];
    const name = alias ? alias[chinese ? 0 : 1] : v.name;
    return { id: v.id, label: `${name} · ${v.lang}${v.quality > 1 ? ` · ${tx(v.quality === 3 ? 'voicePremium' : 'voiceEnhanced')}` : ''}${alias ? ` · ${tx('recommended')}` : ''}`,
      sourceName: alias ? `${v.name} · ${tx('voiceDisplayName')}` : '', recommended: !!alias };
  });
}
