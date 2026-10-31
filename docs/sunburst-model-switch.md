# Sunburst through OpenRouter

Set these environment variables on the existing Render backend service:

```text
IMAGE_GENERATION_PROVIDER=openrouter
OPENROUTER_IMAGE_MODEL=openai/gpt-image-2.5-sunburst
OPENROUTER_IMAGE_QUALITY=medium
```

Keep the existing OPENROUTER_API_KEY. Save and redeploy the backend. A saved
OPENROUTER_IMAGE_MODEL value overrides the source-code default, so an old Qwen
value must be replaced explicitly.

The app and Studio use the same configured OpenRouter model. Sunburst requests
use quality rather than resolution; app portraits retain their configured 2:3
ratio, while Studio previews use 3:4. Uploaded reference photos remain attached.
No Android release is required for the model switch.

The new model's cost can differ from Qwen. Check actual OpenRouter usage before
assuming the previous per-generation cost still applies. Automated verification
uses mocked provider responses; no paid image requests are made.
