/* Keep refresh controls steady; only their arrow animates during a request. */
(() => {
  function bind(button) {
    const icon = document.createElement("span");
    icon.className = "refresh-arrow";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.5-1L20 9M4 15l2.4 3A7 7 0 0 0 17.9 17"/></svg>';
    if (button.id === "refresh-button") button.textContent = "";
    button.prepend(icon);
    button.classList.add("refresh-control");
    const sync = () => {
      button.classList.toggle("is-loading", button.disabled);
      button.setAttribute("aria-busy", String(button.disabled));
    };
    // Each module already disables its refresh control while loading. Observe
    // that state rather than timers, so errors and fast responses reset too.
    new MutationObserver(sync).observe(button, { attributes: true, attributeFilter: ["disabled"] });
    sync();
  }
  const ids = ["refresh-button", "performance-refresh", "welcome-back-refresh", "push-refresh", "feedback-refresh",
    "app-settings-refresh", "ad-settings-refresh", "watermark-refresh", "storage-refresh", "media-refresh", "logs-refresh"];
  ids.map(id => document.getElementById(id)).filter(Boolean).forEach(bind);
})();
