# Workspace-controlled image watermark

## Logo setup

Deploy the backend and Workspace, then distribute the updated Android build. Open **Workspace → App settings → Image watermark**, choose **Upload / replace logo**, and select `White Cursive “madds” Lettering.png`. Enable the watermark and click **Save watermark**.

No image needs to be copied into a backend directory. The upload control stores the transparent PNG in the existing Cloudinary cloud under **`picmee/branding/watermarks`**, with a unique, versioned public ID for each upload. The supplied PNG is transparent, 2172×724 pixels, about 398 KB. Workspace resizes it to at most 1024 pixels on its longer edge, retaining transparency and PNG encoding. Other uploads may be up to 2 MB, 4096 pixels per side, and 4 million pixels before resizing.

Watermarking starts disabled until a team member uploads a logo, enables it, and saves. Uploading a replacement alone does not publish it. Width defaults to 18% of image width, opacity to 85%, and edge spacing to 2% of the shorter image edge. Placement is bottom-right with the logo's aspect ratio preserved. Width, opacity, and spacing are editable.

## Runtime behavior

- Android reads `GET /api/app-config/watermark` on every save or share from a new generation. The endpoint exposes only export settings, no admin names or Cloudinary API credentials.
- The logo is drawn onto an export copy using Android Canvas; the AI request, prompts, credits, generation result, and preview are unchanged. Repeated exports start from the original, so the watermark is not layered twice.
- The last successfully used configuration and versioned logo are saved on-device for offline exports. Online exports check again before saving. There is no guarantee of instantaneous remote changes while a phone is offline.
- If settings have never been downloaded and the backend is unavailable, export shows a retryable error. If an enabled logo cannot be loaded, export does not silently omit it. The generated photo remains available; retrying export does not start another paid generation.
- Existing gallery photos and shares of those already-saved photos remain as saved. Changing settings cannot remove a watermark already embedded in a gallery image or add one retroactively.
- Original images are not uploaded to Cloudinary by this feature. Only the branding PNG is stored there.

## Administration and cleanup

Approved team accounts use `GET/PATCH /api/admin/settings/watermark` and multipart `POST /api/admin/settings/watermark/logo`. Settings are stored separately from welcome credits in `WatermarkSettings`, with revision checks and server-authenticated editor attribution. Two team members cannot silently overwrite one another's saved edits.

Uploads receive a durable Cloudinary cleanup job before contacting the CDN. Abandoned or interrupted uploads become eligible after 24 hours; replacing a saved logo activates cleanup for the old asset. Cleanup checks the current watermark reference, including when disabled, and retries failed CDN deletions. Active logos are retained. Unique URLs prevent old app or browser caches from displaying a replacement under the previous logo's URL.

No additional environment variables are required. Existing `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` must be configured on the backend. The secret stays on the backend. Deploy the backend before the new Android app; older app releases do not support these controls.
