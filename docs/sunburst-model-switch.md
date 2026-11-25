# GPT Image 2.6 Sunburst through OpenRouter

Set these environment variables on the existing Render backend service:

```text
IMAGE_GENERATION_PROVIDER=openrouter
OPENROUTER_IMAGE_MODEL=openai/gpt-image-2.6-sunburst
OPENROUTER_IMAGE_QUALITY=medium
```

Keep the existing OPENROUTER_API_KEY. Save and redeploy the backend. A saved
OPENROUTER_IMAGE_MODEL value overrides the source-code default, so an existing
2.5 Sunburst or Qwen value must be replaced explicitly. Deploy the updated
backend request handling before changing a running older backend to 2.6: the
older handling only recognizes 2.5 as a quality-based model.

The app and Studio use the same configured OpenRouter model. Both 2.5 and 2.6 Sunburst requests
use quality rather than resolution; app portraits retain their configured 2:3
ratio, while Studio previews use 3:4. Uploaded reference photos remain attached.
No Android release is required for the model switch.

To roll back, set OPENROUTER_IMAGE_MODEL=openai/gpt-image-2.5-sunburst and
redeploy; both versions keep the quality-based request format.

Model reference: https://openrouter.ai/openai/gpt-image-2.6-sunburst

The new model's cost can differ from 2.5. Check actual OpenRouter usage before
assuming the previous per-generation cost still applies. Automated verification
uses mocked provider responses; no paid image requests are made.
