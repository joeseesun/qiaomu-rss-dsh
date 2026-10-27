// Console links are independent of API endpoints; opening help never sends credentials.
export const CLOUD_SERVICES = Object.freeze({
  openai: { keyHelp: 'https://platform.openai.com/api-keys', ttsDocs: 'https://developers.openai.com/api/docs/guides/text-to-speech', asrDocs: 'https://developers.openai.com/api/docs/guides/speech-to-text' },
  qwen: { keyHelp: 'https://bailian.console.aliyun.com/cn-beijing/model/settings/api-key', ttsDocs: 'https://help.aliyun.com/zh/model-studio/qwen-tts' },
  doubao: { keyHelp: 'https://console.volcengine.com/speech/service', ttsDocs: 'https://www.volcengine.com/docs/6561/1598757', asrDocs: 'https://www.volcengine.com/docs/6561/1631584' },
  minimax: { keyHelp: 'https://platform.minimax.cn/console/access?tab=api-keys', ttsDocs: 'https://platform.minimax.cn/docs/api-reference/speech-t2a-http' },
  siliconflow: { keyHelp: 'https://cloud.siliconflow.cn/account/ak', ttsDocs: 'https://docs.siliconflow.cn/docs/userguide/capabilities/text-to-speech', asrDocs: 'https://docs.siliconflow.cn/docs/api/audio-transcriptions-post' },
  elevenlabs: { keyHelp: 'https://elevenlabs.io/app/developers/api-keys', ttsDocs: 'https://elevenlabs.io/docs/overview/capabilities/text-to-speech' },
  azure: { keyHelp: 'https://portal.azure.com/#create/Microsoft.CognitiveServicesSpeechServices', ttsDocs: 'https://learn.microsoft.com/azure/ai-services/speech-service/get-started-text-to-speech' },
  glm: { keyHelp: 'https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys', asrDocs: 'https://docs.bigmodel.cn/cn/guide/models/sound-and-video/glm-asr' },
  stepfun: { keyHelp: 'https://platform.stepfun.com/interface-key', asrDocs: 'https://platform.stepfun.com/docs/zh/quickstart/overview' },
  mimo: { keyHelp: 'https://platform.xiaomimimo.com/', asrDocs: 'https://mimo.mi.com/docs/zh-CN/quick-start/summary/first-api-call' },
  groq: { keyHelp: 'https://console.groq.com/keys', asrDocs: 'https://console.groq.com/docs/speech-to-text' },
});

export function cloudService(kind, id) {
  const service = CLOUD_SERVICES[id];
  return service ? { keyHelp: service.keyHelp, docs: service[`${kind}Docs`] } : null;
}
