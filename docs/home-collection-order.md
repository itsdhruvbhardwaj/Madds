# Home collection order

Studio > Collections > Home collection order is separate from sorting the Studio collection list. Expand it, move enabled collections Up/Down, and save. Hidden collections stay hidden and are placed after the enabled rows in the saved sequence. Empty collections may be omitted from the Android screen.

The existing Android Home feed already sorts by the section order field. The next Home refresh/pull-to-refresh loads the new order; this feature requires backend and Studio deployment, not an Android update.

PATCH /api/admin/catalog/home-sections/order requires a verified allowlisted administrator, every section ID exactly once, and an expected snapshot of IDs/ranks/visibility. The service reads and checks the current layout in a transaction, writes sequential ranks only, and records HOME_ORDER_UPDATED in the same transaction. Stale layouts return 409. The UI's Reload layout retrieves fresh metadata and discards unsaved changes.

New sections append after the current maximum rank rather than collection count, so rank gaps from deleted collections do not put new sections into the middle. Visibility and alphabetical sorting retain their existing controls.
