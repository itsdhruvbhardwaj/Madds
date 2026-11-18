import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { ImageGenerationSettings } from '../models/ImageGenerationSettings.js';

export const IMAGE_MODELS = { sunburst25: 'openai/gpt-image-2.5-sunburst', sunburst26: 'openai/gpt-image-2.6-sunburst' } as const;
export const IMAGE_QUALITIES = ['auto', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export const IMAGE_COMPLEXITIES = ['low', 'medium', 'high'] as const;
export type ModelKey = keyof typeof IMAGE_MODELS;
type Quality = typeof IMAGE_QUALITIES[number];
type Complexity = typeof IMAGE_COMPLEXITIES[number];
export type ImageSettingsValues = { activeModel: ModelKey; profiles: { sunburst25: { quality: Quality }; sunburst26: { quality: Quality; complexity: Complexity } } };
export type ImageGenerationConfig = { provider: string; model: string; quality?: string; complexity?: Complexity; revision?: number; source: 'workspace' | 'environment' };
const object = (v: any): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: any, keys: string[]) => object(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
export function validImageSettings(v: any): boolean {
  return object(v) && Object.hasOwn(IMAGE_MODELS, v.activeModel) && exact(v.profiles, ['sunburst25', 'sunburst26']) &&
    exact(v.profiles.sunburst25, ['quality']) && exact(v.profiles.sunburst26, ['quality', 'complexity']) &&
    IMAGE_QUALITIES.includes(v.profiles.sunburst25.quality) && IMAGE_QUALITIES.includes(v.profiles.sunburst26.quality) &&
    IMAGE_COMPLEXITIES.includes(v.profiles.sunburst26.complexity);
}
export function imageSettingsValues(v: ImageSettingsValues): ImageSettingsValues {
  return { activeModel: v.activeModel, profiles: { sunburst25: { quality: v.profiles.sunburst25.quality },
    sunburst26: { quality: v.profiles.sunburst26.quality, complexity: v.profiles.sunburst26.complexity } } };
}
export function configFromImageSettings(v: ImageSettingsValues, revision?: number): ImageGenerationConfig {
  const profile = v.profiles[v.activeModel];
  return { provider: 'openrouter', model: IMAGE_MODELS[v.activeModel], quality: profile.quality,
    ...(v.activeModel === 'sunburst26' ? { complexity: v.profiles.sunburst26.complexity } : {}), revision, source: 'workspace' };
}
export async function getImageGenerationSettings() {
  // Missing configuration uses Render defaults; database errors never silently switch models.
  // No cross-instance cache: subsequent generations see the last committed configuration.
  const stored = await ImageGenerationSettings.findById('image-generation', null, { maxTimeMS: 5000 }).lean();
  return presentImageGenerationSettings(stored);
}
export function presentImageGenerationSettings(stored: any) {
  if (stored && (!validImageSettings(stored) || !Number.isSafeInteger(stored.revision) || stored.revision < 0)) throw Error('Invalid image generation configuration.');
  const quality = IMAGE_QUALITIES.includes(env.openRouterImageQuality as Quality) ? env.openRouterImageQuality as Quality : 'medium';
  const defaults: ImageSettingsValues = { activeModel: env.openRouterImageModel === IMAGE_MODELS.sunburst25 ? 'sunburst25' : 'sunburst26',
    profiles: { sunburst25: { quality }, sunburst26: { quality, complexity: 'high' } } };
  return { ...imageSettingsValues(stored || defaults), revision: stored?.revision ?? 0,
    source: stored ? 'workspace' as const : 'environment' as const,
    updatedByName: stored?.updatedByName || null, updatedAt: stored?.updatedAt || null,
    history: (stored?.history || []).map((h: any) => ({ revision: h.revision, activeModel: h.activeModel, quality: h.quality,
      complexity: h.complexity, byName: h.byName, at: h.at })) };
}
export async function resolveImageGenerationConfig(): Promise<ImageGenerationConfig> {
  const settings = await getImageGenerationSettings();
  return effectiveImageGenerationConfig(settings);
}
export function effectiveImageGenerationConfig(settings: ReturnType<typeof presentImageGenerationSettings>): ImageGenerationConfig {
  if (settings.source === 'workspace') return configFromImageSettings(settings, settings.revision);
  return { provider: env.imageGenerationProvider,
    model: env.imageGenerationProvider === 'openrouter' ? env.openRouterImageModel : env.imageModel,
    quality: env.imageGenerationProvider === 'openrouter' ? env.openRouterImageQuality : env.imageQuality, source: 'environment' };
}
function settingsHash(values: ImageSettingsValues, revision: number) {
  return createHash('sha256').update(JSON.stringify({ ...imageSettingsValues(values), revision })).digest('hex');
}
export function createImageTestToken(userId: string, values: ImageSettingsValues, revision: number, now = Date.now()) {
  if (!env.jwtAccessSecret) throw Error('Test verification is unavailable.');
  const payload = Buffer.from(JSON.stringify({ userId, hash: settingsHash(values, revision), expires: now + 15 * 60_000 })).toString('base64url');
  return `${payload}.${createHmac('sha256', env.jwtAccessSecret).update(payload).digest('base64url')}`;
}
export function validImageTestToken(token: unknown, userId: string, values: ImageSettingsValues, revision: number, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 1500 || !env.jwtAccessSecret) return false;
  try {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra !== undefined) return false;
    const expected = createHmac('sha256', env.jwtAccessSecret).update(payload).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.userId === userId && data.hash === settingsHash(values, revision) && Number.isSafeInteger(data.expires) && data.expires > now;
  } catch { return false; }
}
