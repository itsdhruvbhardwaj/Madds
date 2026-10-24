const API_BASE = (window.PICMEE_API_BASE || "https://picme-ai.onrender.com").replace(/\/$/, "");

const pageYear = document.querySelector("[data-year]");
if (pageYear) pageYear.textContent = String(new Date().getFullYear());

const menuToggle = document.querySelector(".menu-toggle");
const header = document.querySelector(".site-header");
menuToggle?.addEventListener("click", () => {
  const isOpen = header.classList.toggle("menu-open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
});

const grid = document.querySelector("#style-grid");
if (grid) initStyleLibrary();

function initStyleLibrary() {
  const filters = document.querySelector("#collection-filters");
  const search = document.querySelector("#style-search");
  const count = document.querySelector("#result-count");
  const loadState = document.querySelector("#load-state");
  const loadMore = document.querySelector("#load-more");
  const sentinel = document.querySelector("#load-sentinel");
  const state = { collection: "", search: "", page: 1, hasNext: true, loading: false, requestId: 0, controller: null };
  let searchTimer;

  function showMessage(message, kind = "") {
    loadState.textContent = message;
    loadState.className = `load-state ${kind}`.trim();
  }

  function createCard(style) {
    const card = document.createElement("article");
    card.className = "style-card";

    const imageWrap = document.createElement("div");
    imageWrap.className = "style-card-image";
    const image = document.createElement("img");
    image.src = style.thumbnail || "";
    image.alt = style.name || "PicMee photo style";
    image.loading = "lazy";
    image.decoding = "async";
    image.onerror = () => {
      image.removeAttribute("src");
      imageWrap.classList.add("image-unavailable");
      imageWrap.setAttribute("aria-label", "Preview unavailable");
    };
    imageWrap.append(image);

    const tag = document.createElement("span");
    tag.className = "style-card-tag";
    tag.textContent = (style.collections || ["Style"])[0];
    imageWrap.append(tag);

    const details = document.createElement("div");
    details.className = "style-card-details";
    const title = document.createElement("h3");
    title.textContent = style.name || "Untitled style";
    const description = document.createElement("p");
    description.textContent = style.description || "Explore this PicMee style.";
    const action = document.createElement("a");
    action.className = "card-action";
    action.href = "app.html";
    action.setAttribute("aria-label", `Explore PicMee to try ${title.textContent}`);
    action.textContent = "Try in PicMee ↗";
    details.append(title, description, action);
    card.append(imageWrap, details);
    return card;
  }

  function renderFilters(collections) {
    const existing = state.collection;
    filters.replaceChildren();
    const allButton = makeFilterButton("All", "");
    filters.append(allButton);
    for (const collection of collections) filters.append(makeFilterButton(collection, collection));
    const selected = [...filters.querySelectorAll(".filter-chip")]
      .find((button) => button.dataset.collection.toLowerCase() === existing.toLowerCase());
    (selected || allButton).classList.add("selected");
    if (!selected) state.collection = "";
  }

  function makeFilterButton(label, collection) {
    const button = document.createElement("button");
    button.className = "filter-chip";
    button.type = "button";
    button.dataset.collection = collection;
    button.textContent = label;
    button.setAttribute("aria-pressed", String(collection === state.collection));
    button.addEventListener("click", () => {
      if (state.collection === collection) return;
      state.collection = collection;
      for (const chip of filters.querySelectorAll(".filter-chip")) {
        const selected = chip.dataset.collection === collection;
        chip.classList.toggle("selected", selected);
        chip.setAttribute("aria-pressed", String(selected));
      }
      loadStyles(true);
    });
    return button;
  }

  async function loadStyles(reset) {
    if (reset) {
      state.requestId += 1;
      state.controller?.abort();
      state.loading = false;
      state.page = 1;
      state.hasNext = true;
      grid.replaceChildren();
      grid.setAttribute("aria-busy", "true");
    }
    if (state.loading) return;
    if (!state.hasNext) return;

    const requestId = state.requestId;
    const controller = new AbortController();
    state.controller = controller;
    state.loading = true;
    loadMore.hidden = true;
    showMessage(state.page === 1 ? "Loading styles…" : "Loading more styles…", "loading");
    try {
      const params = new URLSearchParams({ page: String(state.page), limit: "18" });
      if (state.collection) params.set("collection", state.collection);
      if (state.search) params.set("search", state.search);
      const response = await fetch(`${API_BASE}/api/styles?${params.toString()}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Style service returned ${response.status}`);
      const payload = await response.json();
      if (requestId !== state.requestId) return;

      if (Array.isArray(payload.collections)) renderFilters(payload.collections);
      const items = Array.isArray(payload.styles) ? payload.styles : [];
      for (const style of items) grid.append(createCard(style));
      state.hasNext = Boolean(payload.pagination?.hasNextPage);
      state.page += 1;
      const total = Number(payload.pagination?.totalCount ?? items.length);
      count.textContent = `${total} ${total === 1 ? "style" : "styles"}`;
      grid.setAttribute("aria-busy", "false");
      if (grid.childElementCount === 0) {
        showMessage("No styles match that search. Try another name or collection.", "empty-state");
      } else {
        showMessage(state.hasNext ? "Keep exploring — more styles are on the way." : "You’re all caught up.");
        loadMore.textContent = "Load more styles ↓";
        loadMore.hidden = !state.hasNext;
      }
    } catch (error) {
      if (requestId !== state.requestId) return;
      console.error("Unable to load PicMee styles", error);
      grid.setAttribute("aria-busy", "false");
      showMessage("Styles couldn’t load right now. Check your connection and try again.", "error-state");
      loadMore.hidden = false;
      loadMore.textContent = state.page === 1 ? "Try again ↻" : "Try loading more ↻";
    } finally {
      if (requestId === state.requestId) state.loading = false;
    }
  }

  search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = search.value.trim();
      loadStyles(true);
    }, 280);
  });
  loadMore.addEventListener("click", () => loadStyles(grid.childElementCount === 0));
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadStyles(false);
    }, { rootMargin: "700px 0px" });
    observer.observe(sentinel);
  }
  loadStyles(true);
}
