# Workspace image generation controls

App settings → Image generation supports Sunburst 2.5 and 2.6 through OpenRouter.
Each model has an independent quality profile. Only 2.6 exposes complexity
(low, medium, high), sent as `provider.options.openai.complexity`. 2.5 requests
never include it. Existing app and Workspace image ratios remain effective.

Until the first Apply, Render provider/model/quality values remain effective.
A saved MongoDB configuration takes precedence for new app and Studio generations.
Read failures stop submissions before credit reservation rather than guessing.
Credentials stay in Render.

## Owner workflow

1. Select a model, quality, and (for 2.6) complexity.
2. Supply a reference image and prompt; explicitly generate a paid preview.
3. Review the image, then apply within 15 minutes.

Testing does not activate settings or consume user credits. It uses the OpenRouter
balance. No automatic paid retries or alternative-model fallbacks are performed.
Every endpoint requires a verified account in ADMIN_EMAILS. A successful test
issues a signed approval bound to the owner, complete draft, expected revision,
and expiry. Editing settings invalidates approval. Apply uses an atomic revision
guard and keeps the last 20 changes with actor, model settings and date.

Each generation resolves its configuration once before credit reservation and
passes that snapshot to the provider. Model, quality, complexity and revision are
recorded in diagnostics. Settings changes never alter an existing provider request.
Recovery never reruns it.

Deploy Backend first, then Admin-Portal. No Android update is required. Once a
Workspace override exists, use Workspace to switch models rather than editing
the Render fallback variable.

Automated provider calls are mocked. The local fixture uses a logo as preview
output and never contacts OpenRouter. An owner must assess actual image quality
and billable provider compatibility using the explicit preview after deployment.

Reference: https://openrouter.ai/docs/guides/overview/multimodal/image-generation#provider-specific-options
