import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../models/ImageGenerationSettings.js', () => ({ ImageGenerationSettings: { findById: () => ({ lean: mocks.read }) } }));
import { configFromImageSettings, createImageTestToken, getImageGenerationSettings, resolveImageGenerationConfig, validImageSettings,
  validImageTestToken, type ImageSettingsValues } from './imageGenerationSettings.js';
const values = (): ImageSettingsValues => ({ activeModel: 'sunburst26', profiles: { sunburst25: { quality: 'medium' }, sunburst26: { quality: 'high', complexity: 'low' } } });
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('JWT_ACCESS_SECRET', 'test-secret'); mocks.read.mockResolvedValue(null); });
afterEach(() => vi.unstubAllEnvs());
describe('Image generation configuration', () => {
  it('preserves Render configuration until a Workspace override exists', async () => {
    vi.stubEnv('IMAGE_GENERATION_PROVIDER', 'openrouter'); vi.stubEnv('OPENROUTER_IMAGE_MODEL', 'openai/gpt-image-2.5-sunburst'); vi.stubEnv('OPENROUTER_IMAGE_QUALITY', 'medium');
    expect(await getImageGenerationSettings()).toMatchObject({ activeModel: 'sunburst25', source: 'environment', revision: 0 });
    expect(await resolveImageGenerationConfig()).toEqual({ provider: 'openrouter', model: 'openai/gpt-image-2.5-sunburst', quality: 'medium', source: 'environment' });
  });
  it('does not force an existing direct OpenAI deployment onto OpenRouter before Apply', async () => {
    vi.stubEnv('IMAGE_GENERATION_PROVIDER', 'openai'); vi.stubEnv('OPENAI_IMAGE_MODEL', 'gpt-image-2.5-flare');
    expect(await resolveImageGenerationConfig()).toMatchObject({ provider: 'openai', model: 'gpt-image-2.5-flare', source: 'environment' });
  });
  it('sees changes across instances while each resolved generation keeps its own snapshot', async () => {
    mocks.read.mockResolvedValueOnce({ ...values(), revision: 1 }).mockResolvedValueOnce({ ...values(), activeModel: 'sunburst25', revision: 2 });
    const first = await resolveImageGenerationConfig(), next = await resolveImageGenerationConfig();
    expect(first).toMatchObject({ model: 'openai/gpt-image-2.6-sunburst', quality: 'high', complexity: 'low', revision: 1 });
    expect(next).toMatchObject({ model: 'openai/gpt-image-2.5-sunburst', quality: 'medium', revision: 2 });
    expect(next).not.toHaveProperty('complexity'); expect(first.revision).toBe(1);
  });
  it('fails closed on database outages and corrupted saved settings', async () => {
    mocks.read.mockRejectedValueOnce(Error('database unavailable'));
    await expect(resolveImageGenerationConfig()).rejects.toThrow();
    mocks.read.mockResolvedValueOnce({ ...values(), activeModel: 'unapproved', revision: 1 });
    await expect(resolveImageGenerationConfig()).rejects.toThrow();
  });
  it('rejects unknown models, extra model parameters, invalid qualities and invalid complexity', () => {
    expect(validImageSettings(values())).toBe(true);
    for (const activeModel of ['__proto__','constructor','openai/gpt-image-2.6-flare',null]) expect(validImageSettings({ ...values(), activeModel })).toBe(false);
    for (const quality of ['ultra', 1, null]) { const v = values(); (v.profiles.sunburst25 as any).quality = quality; expect(validImageSettings(v)).toBe(false); }
    const v = values(); (v.profiles.sunburst25 as any).complexity = 'high'; expect(validImageSettings(v)).toBe(false);
    expect(validImageSettings({ ...values(), profiles: { sunburst25: { quality: 'medium' }, sunburst26: { quality: 'high', complexity: 'auto' } } })).toBe(false);
    expect(configFromImageSettings(values()).model).toBe('openai/gpt-image-2.6-sunburst');
  });
  it('binds successful-test approval to owner, all settings, revision, signature and expiry', () => {
    const v = values(), token = createImageTestToken('owner', v, 7, 1000);
    expect(validImageTestToken(token, 'owner', v, 7, 1001)).toBe(true);
    expect(validImageTestToken(token, 'other', v, 7, 1001)).toBe(false);
    expect(validImageTestToken(token, 'owner', v, 8, 1001)).toBe(false);
    expect(validImageTestToken(token, 'owner', { ...v, activeModel: 'sunburst25' }, 7, 1001)).toBe(false);
    expect(validImageTestToken(token, 'owner', v, 7, 901000)).toBe(false);
    expect(validImageTestToken(token + 'a', 'owner', v, 7, 1001)).toBe(false);
    expect(validImageTestToken('invalid', 'owner', v, 7)).toBe(false);
  });
});
