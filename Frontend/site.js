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
const heroTrendingCards = document.querySelector("#hero-trending-cards");
if (heroTrendingCards) loadHeroTrendingStyles(heroTrendingCards);

async function loadHeroTrendingStyles(container) {
  try {
    const styles = [];
    let page = 1;
    let hasNextPage = true;
    while (hasNextPage) {
      const params = new URLSearchParams({ collection: "Trending", limit: "50", page: String(page) });
      const response = await fetch(`${API_BASE}/api/styles?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`Trending style service returned ${response.status}`);
      const payload = await response.json();
      if (Array.isArray(payload.styles)) styles.push(...payload.styles.filter((style) =>
        Array.isArray(style.collections) && style.collections.some((collection) =>
          typeof collection === "string" && collection.toLowerCase() === "trending"
        )
      ));
      hasNextPage = Boolean(payload.pagination?.hasNextPage);
      page += 1;
    }
    if (styles.length === 0) {
      container.closest(".hero-art")?.classList.add("hero-trending-empty");
      return;
    }

    const positions = ["left", "center", "right"];
    let cards = positions.map((position, slot) => {
      const card = document.createElement("div");
      card.className = "hero-photo";
      card.dataset.position = position;
      const initialStyleIndex = slot === 0 ? 1 : slot === 1 ? 0 : 2;
      setHeroCardStyle(card, styles[initialStyleIndex % styles.length]);
      container.append(card);
      return card;
    });

    let nextStyleIndex = 2;
    if (styles.length > 1 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.setInterval(() => {
        const [leftCard, centerCard, rightCard] = cards;
        setHeroCardStyle(rightCard, styles[nextStyleIndex % styles.length]);
        nextStyleIndex = (nextStyleIndex + 1) % styles.length;

        rightCard.classList.add("is-no-transition");
        rightCard.dataset.position = "left";
        rightCard.classList.add("is-entering");
        leftCard.dataset.position = "center";
        centerCard.dataset.position = "right";
        cards = [rightCard, leftCard, centerCard];
        void rightCard.offsetWidth;
        rightCard.classList.remove("is-no-transition");
        requestAnimationFrame(() => rightCard.classList.remove("is-entering"));
      }, 2000);
    }
  } catch (error) {
    console.error("Unable to load Madds trending styles", error);
    container.closest(".hero-art")?.classList.add("hero-trending-empty");
  }
}

function setHeroCardStyle(card, style) {
  card.style.backgroundImage = `linear-gradient(180deg,transparent 65%,rgba(0,0,0,.32)),url("${style.thumbnail || ""}")`;
  card.setAttribute("aria-label", style.name || "Trending style");
}

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
    const beforeUrl = style.exampleBeforeUrl || style.thumbnail || "";
    const afterUrl = style.exampleAfterUrl || "";
    imageWrap.classList.toggle("has-before-after", Boolean(afterUrl));
    if (afterUrl) {
      imageWrap.tabIndex = 0;
      imageWrap.setAttribute("role", "button");
      imageWrap.setAttribute("aria-label", `Show before and after examples for ${style.name || "this style"}`);
      imageWrap.setAttribute("aria-pressed", "false");
    }
    const beforeImage = document.createElement("img");
    beforeImage.className = "style-image-before";
    beforeImage.src = beforeUrl;
    beforeImage.alt = afterUrl ? `Before: ${style.name || "Madds photo style"}` : (style.name || "Madds photo style");
    beforeImage.loading = "lazy";
    beforeImage.decoding = "async";
    beforeImage.onerror = () => {
      beforeImage.removeAttribute("src");
      imageWrap.classList.add("image-unavailable");
      imageWrap.setAttribute("aria-label", "Preview unavailable");
    };
    imageWrap.append(beforeImage);
    if (afterUrl) {
      const afterImage = document.createElement("img");
      afterImage.className = "style-image-after";
      afterImage.src = afterUrl;
      afterImage.alt = `After: ${style.name || "Madds photo style"}`;
      afterImage.loading = "lazy";
      afterImage.decoding = "async";
      afterImage.onerror = () => afterImage.remove();
      imageWrap.append(afterImage);
      const beforeLabel = document.createElement("span");
      beforeLabel.className = "style-image-state";
      beforeLabel.textContent = "Before";
      const afterLabel = document.createElement("span");
      afterLabel.className = "style-image-state after-state";
      afterLabel.textContent = "After";
      imageWrap.append(beforeLabel, afterLabel);
      imageWrap.addEventListener("click", () => {
        if (window.matchMedia("(hover: none)").matches) {
          const showingAfter = imageWrap.classList.toggle("show-after");
          imageWrap.setAttribute("aria-pressed", String(showingAfter));
        }
      });
      imageWrap.addEventListener("keydown", (event) => {
        if ((event.key === "Enter" || event.key === " ") && window.matchMedia("(hover: none)").matches) {
          event.preventDefault();
          imageWrap.click();
        }
      });
    }

    const tag = document.createElement("span");
    tag.className = "style-card-tag";
    tag.textContent = (style.collections || ["Style"])[0];
    imageWrap.append(tag);

    const details = document.createElement("div");
    details.className = "style-card-details";
    const title = document.createElement("h3");
    title.textContent = style.name || "Untitled style";
    const description = document.createElement("p");
    description.textContent = style.description || "Explore this Madds style.";
    const action = document.createElement("a");
    action.className = "card-action";
    action.href = "app.html";
    action.setAttribute("aria-label", `Explore Madds to try ${title.textContent}`);
    action.textContent = "Try in Madds ↗";
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
      console.error("Unable to load Madds styles", error);
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
