/* Bump this version with every Workspace release, including asset-only changes.
 * Lifecycle notifications only: no fetch handler, Cache Storage or background sync.
 * All pages, uploads and API operations continue to use the network normally.
 */
const WORKSPACE_RELEASE = '20261116-installable-1';
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_WORKSPACE_UPDATE') event.waitUntil(self.skipWaiting());
});
// Do not claim open clients or automatically reload other team members' windows.
