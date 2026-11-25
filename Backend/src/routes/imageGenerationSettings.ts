import { Router, type ErrorRequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { env } from '../config/env.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { ImageGenerationSettings } from '../models/ImageGenerationSettings.js';
import { OpenRouterImageGenerator } from '../services/openrouter/generation.js';
import { configFromImageSettings, createImageTestToken, getImageGenerationSettings, imageSettingsValues, effectiveImageGenerationConfig, presentImageGenerationSettings,
  validImageSettings, validImageTestToken } from '../services/imageGenerationSettings.js';
const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.maxUploadBytes, files: 1, fields: 2, fieldSize: 16000 } });
const validRevision = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const conflict = 'Image generation settings changed. Refresh and review before applying.';
// All routes are behind adminSettingsRouter's verified ADMIN_EMAILS guard.
router.get('/', async (_req, res) => {
  const settings = await getImageGenerationSettings();
  const effective = effectiveImageGenerationConfig(settings);
  return res.json({ ok: true, ...settings, effective, canTest: !!env.openRouterApiKey && !!env.jwtAccessSecret });
});
router.post('/test', rateLimit({ windowMs: 60000, limit: 3, keyGenerator: req => (req as AuthenticatedRequest).user!.id,
  message: { error: 'Please wait a minute before starting another paid preview.' } }), upload.single('image'), async (req: AuthenticatedRequest, res) => {
  let draft: any;
  try { draft = JSON.parse(req.body?.settings || ''); } catch { return res.status(400).json({ error: 'Choose valid model settings before testing.' }); }
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  if (!validImageSettings(draft) || !validRevision(draft.expectedRevision) || !prompt || prompt.length > 10000 || !req.file)
    return res.status(400).json({ error: 'Choose valid settings, enter a prompt, and upload one JPG, PNG or WebP photo.' });
  if (!env.openRouterApiKey || !env.jwtAccessSecret) return res.status(503).json({ error: 'OpenRouter testing is not configured on the server.' });
  const type = await fileTypeFromBuffer(req.file.buffer);
  if (!type || !['image/jpeg', 'image/png', 'image/webp'].includes(type.mime)) return res.status(400).json({ error: 'Upload a valid JPG, PNG or WebP photo.' });
  const current = await getImageGenerationSettings();
  if (current.revision !== draft.expectedRevision) return res.status(409).json({ error: conflict });
  try {
    const config = configFromImageSettings(draft, draft.expectedRevision);
    const result = await new OpenRouterImageGenerator(config).generate({ prompt, aspectRatio: '3:4',
      images: [{ path: '', originalname: req.file.originalname, mimetype: type.mime, buffer: req.file.buffer }] });
    return res.json({ ok: true, image: `data:${result.mimeType || 'image/png'};base64,${result.base64}`,
      testToken: createImageTestToken(req.user!.id, draft, draft.expectedRevision), config });
  } catch {
    return res.status(502).json({ error: 'The preview could not be completed. Live settings were not changed. Check provider activity before retrying; this request may have been billed.' });
  }
});
router.patch('/', async (req: AuthenticatedRequest, res) => {
  const body = req.body;
  if (!validImageSettings(body) || !validRevision(body.expectedRevision) ||
      Object.keys(body).some(k => !['activeModel', 'profiles', 'expectedRevision', 'testToken'].includes(k)))
    return res.status(400).json({ error: 'Choose an approved model and valid settings. Complexity is available only for 2.6.' });
  if (!env.openRouterApiKey) return res.status(503).json({ error: 'OpenRouter is not configured on the server.' });
  if (!validImageTestToken(body.testToken, req.user!.id, body, body.expectedRevision))
    return res.status(400).json({ error: 'Run a successful preview with these settings before applying. Preview approval expires after 15 minutes.' });
  const values = imageSettingsValues(body), config = configFromImageSettings(values);
  try {
    const saved = await ImageGenerationSettings.findOneAndUpdate({ _id: 'image-generation', revision: body.expectedRevision }, {
      $set: { ...values, updatedByName: req.user!.name?.trim().slice(0,160) || 'Owner', updatedByEmail: req.user!.email!.toLowerCase() },
      $inc: { revision: 1 }, $push: { history: { $each: [{ revision: body.expectedRevision + 1, activeModel: values.activeModel,
        quality: config.quality, complexity: config.complexity, byName: req.user!.name?.trim().slice(0,160) || 'Owner',
        byEmail: req.user!.email!.toLowerCase(), at: new Date() }], $slice: -20 } },
    }, { returnDocument: 'after', upsert: body.expectedRevision === 0, runValidators: true, maxTimeMS: 5000 }).lean();
    if (!saved) return res.status(409).json({ error: conflict });
    return res.json({ ok: true, ...presentImageGenerationSettings(saved), effective: configFromImageSettings(values, saved.revision), canTest: true });
  } catch (error) {
    if ((error as any)?.code === 11000) return res.status(409).json({ error: conflict });
    throw error;
  }
});
router.use(((error, _req, res, _next) => res.status(error instanceof multer.MulterError ? 400 : 503).json({
  error: error instanceof multer.MulterError ? 'Upload one image up to 10 MB with a prompt and settings.' : 'Image generation settings are temporarily unavailable. Refresh before retrying.'
})) as ErrorRequestHandler);
export { router as adminImageGenerationRouter };
