// The workspace event crosses separately bundled plugins without globals or a runtime dependency.
const CLAIM = 'qiaomu-speech:claim-v1';
export function coordinateSpeech(workspace, pause) {
  const source = {};
  const ref = workspace.on(CLAIM, claimant => { if (claimant !== source) pause(); });
  return { claim: () => workspace.trigger(CLAIM, source), dispose: () => workspace.offref(ref) };
}
