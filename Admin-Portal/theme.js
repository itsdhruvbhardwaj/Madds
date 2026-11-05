/* Theme preference belongs to this browser, never to the account or backend. */
(() => {
  const key = "madds_studio_theme";
  const valid = value => value === "light" || value === "dark";
  let theme = "dark";
  try { const saved = localStorage.getItem(key); if (valid(saved)) theme = saved; } catch { /* Private/restricted storage still allows a session theme. */ }
  function apply(value, persist = false) {
    theme = valid(value) ? value : "dark";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#ffffff" : "#101110");
    document.querySelectorAll("[data-studio-theme]").forEach(select => { select.value = theme; });
    if (persist) { try { localStorage.setItem(key, theme); } catch { /* Keep the current theme without failing other controls. */ } }
  }
  // Executed in <head>, before styles render, to avoid a dark flash on reload.
  apply(theme);
  const bind = () => {
    document.querySelectorAll("[data-studio-theme]").forEach(select => {
      select.value = theme;
      select.addEventListener("change", () => apply(select.value, true));
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, {once:true}); else bind();
  window.addEventListener("storage", event => { if (event.key === key || event.key === null) apply(event.newValue); });
})();
