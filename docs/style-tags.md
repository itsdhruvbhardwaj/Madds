# Style search tags

Styles support an optional list of up to 10 manual search tags (40 characters
each). Existing styles keep their verification, IDs, images, prompts and credit
cost. Tags are not inserted into AI prompts.

## Team workflow

- Open a style, type a tag and press Enter or Add. Comma-separated entry works.
- Existing catalogue tags and a starter vocabulary appear as autocomplete suggestions.
- Remove a chip with its × button; Save style commits selected tags and pending
  valid input. Invalid input leaves the editor and selected tags intact.
- Aim for 5–10 relevant garment, colour, fabric, occasion, setting or mood tags.
  No minimum is enforced and no automatic/AI tags are published.
- Use Missing tags to find older styles. Bulk style actions add tags to the
  filtered selection without removing existing tags or changing verification.
  If any selected style exceeds the cap, the entire bulk write is rejected.
  Transactional audit records identify the team member making changes.

Canonical spelling and aliases are maintained in
`Backend/src/services/styles/styleTags.ts`. Case, Unicode compatibility forms
and whitespace are normalized; duplicates are removed. For example, sari/saari/
sarees become saree and deepavali/deepawali become diwali.

## Search and compatibility

Backend search requires all entered words to match across name, tags,
collections or description; word prefixes are supported. Exact/prefix names
rank above tags, then collections and descriptions. Equal relevance retains
the discovery seed's order. Blank searches retain discovery/Trending ordering.
Studio also keeps prompt and ID search. No unrelated broad matches are inserted.

Android's existing API search benefits after backend release without an Android
source change or app release. Previously cached responses refresh through the
existing cache/refresh flow.

The web app searches tags locally and stores the API-provided aliases with its
offline catalogue snapshot. Older snapshots without tags or aliases continue
working; refresh the catalogue to receive the new metadata.

## API and release

- `tags?: string[]` is additive. On create omission means `[]`; on update
  omission preserves stored tags and an explicit `[]` clears them.
- `GET /api/admin/catalog` includes `tagging` configuration and suggestions.
- `PATCH /api/admin/catalog/styles/tags` accepts `{ ids, tags }`, requires a
  verified administrator and merges tags transactionally with audit logging.
- `GET /api/styles` returns style tags and `searchAliases`.
- No text-index rebuild or destructive catalogue migration is required.

Deploy backend before Studio, or together. Studio disables tag controls when
an older backend lacks tagging support. Deploy the web app separately for its
local search changes; keep unrelated pending web/advertising work out of a
Studio-only release.

Validation covers normalization and limits, legacy updates, stale edits, bulk
merging/rejection, API pagination/relevance, Studio editing and web metadata.
The full backend suite has 10 pre-existing catalogue/Home/favourites fixture
failures, reproduced with the previous committed server and tests.
