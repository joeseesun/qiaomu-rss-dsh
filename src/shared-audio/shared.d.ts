export interface EventRef {name:string;listener:EventListener}
export interface SpeechApp { workspace: { containerEl?: HTMLElement; on(name: string, callback: (...data: unknown[]) => void): EventRef; trigger(name: string, ...data: unknown[]): void; offref(ref: EventRef): void }; secretStorage: { getSecret(id: string): string | null; setSecret(id: string, value: string): Promise<void>; refreshSecret(id:string):Promise<string> }; speechSettings(sourceId:string):Promise<SpeechSettings|null> }
export interface SpeechProfile { id: string; label?: string; voice: string; model?: string; baseUrl?: string; region?: string; resourceId?: string; key?: string }
export interface SpeechSettings { provider: string; profiles: Record<string, Partial<SpeechProfile>>; rate: number; welcomed: boolean }
export interface SpeechItem { text: string; start: number; end: number }
export interface SpeechOwner { clearHighlight?: () => void; onSegment?: (item: SpeechItem, index: number) => void | Promise<void>;
  /** Word being spoken as [start, end) offsets into item.text; null before the first word. Estimated when the voice reports no timing. */
  onProgress?: (item: SpeechItem, index: number, word: { start: number; end: number } | null) => void; follow?: boolean }
export interface SpeechController {
  owner: SpeechOwner | null; state: string; error: unknown; index: number; rate: number; items: SpeechItem[]; profile: SpeechProfile;
  cache: { clear(): void }; makeAudio: () => HTMLAudioElement;
  start(owner: SpeechOwner, items: SpeechItem[], profile: SpeechProfile, options?: { index?: number; rate?: number; paused?: boolean }): void;
  stop(owner?: SpeechOwner): void; pause(options?: { releaseSystem?: boolean }): void; toggle(): void; skip(delta: number): void; retry(): void; setRate(rate: number): void;
}
export interface LocalState { phase: string; total?: number; bytes?: number; error?: unknown; device?: string }
export interface LocalManager {
  root: string; subscribe(listener: (id: string, state: LocalState) => void): () => void; snapshot(id: string): LocalState;
  status(id: string): Promise<LocalState>; install(id: string): Promise<LocalState>; cancelInstall(id: string): void; dispose(): void;
  synthesize(profile: SpeechProfile, text: string, signal?: AbortSignal): Promise<{ bytes: Uint8Array; mime: string }>;
}
export interface SpeechHost { app: SpeechApp; manifest: { id: string }; settings: { tts: SpeechSettings }; bridge:NativeBridge; local(): NativeBridge; saveSettings(): Promise<void>; speech: SpeechService; voiceCatalogs: Record<string, VoiceCatalog>; macVoices?: VoiceChoice[]; reading?: { restartWithSettings(): void } }
export class SpeechService {
  constructor(host: SpeechHost); controller: SpeechController; settings: SpeechSettings;
  choices(profile?: SpeechProfile, options?: { chinese?: boolean; tx?: (key: string) => string }): VoiceChoice[];
  loadChoices(profile: SpeechProfile, options?: { signal?: AbortSignal; chinese?: boolean; tx?: (key: string) => string }): Promise<VoiceCatalog>;
  startPreview(owner: SpeechOwner, text: string, profile?: SpeechProfile): void; stopPreview(owner?: SpeechOwner): void; discardPreview(owner: SpeechOwner): void;
  profile(): SpeechProfile; chunking(): { limit: number; clauses: boolean }; configurationError(profile?: SpeechProfile): unknown;
  subscribe(listener: (controller: SpeechController) => void): () => void; speak(owner: SpeechOwner, text: string, profile?: SpeechProfile): number; dispose(): void;
}
export function hiddenProvider(id: string, selected: string): boolean;
export function normalizeSettings(raw: unknown, desktop?: boolean): { tts: SpeechSettings; readingProgress: Record<string, SpeechProgress> };
export function ttsSecretId(provider: string, namespace?: string): string;
export function getSecret(app: SpeechApp, id: string): string;
export function setSecret(app: SpeechApp, id: string, value: string): Promise<void>;
export const RATES: number[];
export const TTS_PROVIDERS: Readonly<Record<string, Omit<SpeechProfile, 'id'>>>;
export function ttsProfile(settings: SpeechSettings, id?: string): SpeechProfile;
export interface VoiceChoice { id: string; label: string }
export interface VoiceCatalog { voices?: VoiceChoice[]; models?: VoiceChoice[]; more?: boolean }
export const TTS_MODELS: Record<string, VoiceChoice[]>;
export function voiceChoices(profile: SpeechProfile, catalog?: VoiceCatalog): VoiceChoice[];
export function modelKey(profile: SpeechProfile): 'model' | 'resourceId';
export function changeSpeechModel(profile: SpeechProfile, value: string, catalog?: VoiceCatalog): SpeechProfile;
export function loadVoiceCatalog(profile: SpeechProfile, options: { request: (input:{url:string;method?:string;headers?:Record<string,string>;body?:string;contentType?:string})=>Promise<{status:number;json?:unknown;text:string;arrayBuffer:ArrayBuffer;headers:Record<string,string>}>; key?: string;signal?:AbortSignal }): Promise<VoiceCatalog>;
export function canLoadVoiceCatalog(id: string): boolean;
export class NativeBridge {
 constructor(api:AudioRemote,importer?:{read(id:string):Promise<SpeechSettings|null>;copy(id:string):Promise<{tts:SpeechSettings;keys:number}|null>});
 call(method:string,input:unknown):Promise<any>;speech(profile:SpeechProfile,text:string,signal?:AbortSignal):Promise<{bytes:Uint8Array;mime:string}>;
 voices(profile:SpeechProfile,options:{signal?:AbortSignal;chinese?:boolean}):Promise<VoiceCatalog>;
 snapshot(model:string):LocalState;status(model:string):Promise<LocalState>;install(model:string):Promise<LocalState>;cancelInstall(model:string):Promise<LocalState>;subscribe(callback:(id:string,state:LocalState)=>void):()=>void;
 importSpeech(id:string):Promise<{tts:SpeechSettings;keys:number}|null>;dispose():void;
}
export interface AudioRemote {operation(request:{method:string;input:unknown}):Promise<{value?:any;failure?:{message:string}}>}
export interface QiaomuAudioService {
 coordinateSpeech(pause:()=>void):{claim():void;dispose():void};
 createSpeechBridge():Promise<Pick<NativeBridge,"speech"|"voices"|"snapshot"|"status"|"install"|"cancelInstall"|"subscribe"|"dispose"> & {platform:string}>;
 readonly version:1;speak(text:string):Promise<void>;stop():void;isReading():boolean;isDictating():boolean;
 transcribe(audio:Blob|ArrayBuffer|Uint8Array|Float32Array,options?:{sampleRate?:number;signal?:AbortSignal}):Promise<string>;
 readNote(view?:unknown):Promise<unknown>;startDictation(view?:unknown):Promise<unknown>;
 registerSpeechSource(id:'qiaomu-reader-dsh'|'qiaomu-rss-dsh',source:{read():SpeechSettings|Promise<SpeechSettings|null>|null;getSecret?(provider:string):Promise<string>}):()=>void;
}
export const LOCAL_MODELS: Array<{ id: string; label: string; bytes: number; source: string; license: string }>;
export function localVoiceChoices(model: string, chinese?: boolean): VoiceChoice[];
export function normalizeLocalProfile(profile: SpeechProfile): SpeechProfile;
export function splitSpeechText(text: string, limit?: number, clauses?: boolean): SpeechItem[];
export function cloudService(kind: 'tts' | 'asr', id: string): { keyHelp: string; docs?: string } | null;
export function findSpeechSettings(app: SpeechApp, sourceId: string): Promise<SpeechSettings | null>;
export function copySpeechSettings(host: SpeechHost, sourceId: string): Promise<number>;
export interface SpeechProgress { fingerprint: string; offset: number; ended: boolean; at: number }
export function speechFingerprint(text: string): string;
export function rememberProgress(record: Record<string, SpeechProgress>, key: string, fingerprint: string, offset: number, ended?: boolean): void;
export function resumeOffset(record: Record<string, SpeechProgress>, key: string, fingerprint: string): number;

export class SpeechChoices { constructor(parent: HTMLElement, options: { host: SpeechHost; tx: (key: string) => string; chinese?: boolean; onChange: (key: string) => Promise<void>; errorText: (error: unknown) => string; onSettings?: () => void }); destroy(): void }

export function openVoicePicker(host: SpeechHost, options: { tx: (key: string) => string; chinese?: boolean; onChange: (key: string) => Promise<void>; errorText: (error: unknown) => string; onSettings?: () => void }): { close(): void };
