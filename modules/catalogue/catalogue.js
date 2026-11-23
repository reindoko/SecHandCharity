import { supabaseClient } from "/assets/js/supabase-client.js";
import { attachLocationFilter } from "/assets/js/location.js";

const ELIGIBLE_STATUS = "Available";
const ITEM_FIELDS =
  "id, title, description, location, item_type, condition_type, delivery_type, photo_urls, status, created_at";
const CATEGORY_ITEM_TYPES = {
  clothes: "Clothing",
  books: "Books",
};
const CATEGORY_LABELS = {
  clothes: "Clothes",
  books: "Books",
  electronics: "Electronics",
  others: "Others",
};

const searchForm = document.querySelector("#catalogue-search-form");
const searchInput = document.querySelector("#catalogue-search-input");
const locationFilter = document.querySelector("#catalogue-location-filter");
const locationMenu = document.querySelector("#catalogue-location-menu");
const categoryGrid = document.querySelector("#category-grid");
const itemsHeading = document.querySelector("#items-heading");
const donationGrid = document.querySelector("#donation-grid");
const loadingState = document.querySelector("#loading-state");
const emptyState = document.querySelector("#empty-state");
const errorState = document.querySelector("#error-state");
const emptyTitle = document.querySelector("#empty-title");
const emptyMessage = document.querySelector("#empty-message");
const errorMessage = document.querySelector("#error-message");
const retryButton = document.querySelector("#retry-button");
const resultsCount = document.querySelector("#items-result-count");

let donationItems = [];
let selectedCategory = "";
let catalogueLoaded = false;

function setCatalogueState(state) {
  loadingState.hidden = state !== "loading";
  emptyState.hidden = state !== "empty";
  errorState.hidden = state !== "error";
  donationGrid.hidden = state === "loading" || state === "error" || state === "empty";
  donationGrid.setAttribute("aria-busy", String(state === "loading"));
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase() : "";
}

function matchesCategory(item, category) {
  if (!category) {
    return true;
  }

  const itemType = CATEGORY_ITEM_TYPES[category];
  return Boolean(itemType) && item.item_type === itemType;
}

function shuffle(items) {
  const shuffledItems = [...items];
  for (let index = shuffledItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffledItems[index], shuffledItems[swapIndex]] =
      [shuffledItems[swapIndex], shuffledItems[index]];
  }
  return shuffledItems;
}

function getPhotoUrl(photoValue) {
  if (typeof photoValue !== "string" || !photoValue.trim()) {
    return null;
  }

  const trimmedValue = photoValue.trim();
  let candidates = [trimmedValue];

  if (trimmedValue.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmedValue);
      candidates = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn("Could not parse the item's photo_urls value.", error);
      return null;
    }
  } else if (trimmedValue.includes(",")) {
    candidates = trimmedValue.split(",");
  }

  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate.trim()) {
      continue;
    }

    try {
      const url = new URL(candidate.trim(), window.location.href);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return url.href;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function createPhotoPlaceholder() {
  const placeholder = document.createElement("div");
  placeholder.className = "photo-placeholder";
  placeholder.setAttribute("aria-label", "No item photo available");
  placeholder.innerHTML =
    '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="5" width="24" height="22" rx="3"></rect><circle cx="11" cy="12" r="2"></circle><path d="m6 24 7-7 5 5 3-3 5 5"></path></svg>';
  return placeholder;
}

function createLocationIcon() {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z");
  icon.append(path);

  const center = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  center.setAttribute("cx", "12");
  center.setAttribute("cy", "10");
  center.setAttribute("r", "2");
  icon.append(center);
  return icon;
}

function createDonationCard(item) {
  const card = document.createElement("article");
  card.className = "donation-card";

  const photoUrl = getPhotoUrl(item.photo_urls);
  if (photoUrl) {
    const image = document.createElement("img");
    image.className = "donation-card-image";
    image.src = photoUrl;
    image.alt = item.title ? `Photo of ${item.title}` : "Donated item";
    image.loading = "lazy";
    image.addEventListener("error", () => image.replaceWith(createPhotoPlaceholder()), { once: true });
    card.append(image);
  } else {
    card.append(createPhotoPlaceholder());
  }

  const body = document.createElement("div");
  body.className = "donation-card-body";

  const title = document.createElement("h3");
  title.className = "donation-card-title";
  title.textContent = item.title || "Untitled donation";
  body.append(title);

  const location = document.createElement("p");
  location.className = "donation-card-location";
  location.append(createLocationIcon());

  const locationText = document.createElement("span");
  locationText.textContent = item.location || "Location not provided";
  location.append(locationText);
  body.append(location);

  card.append(body);
  return card;
}

function updateCategoryCounts(items) {
  for (const [category, itemType] of Object.entries(CATEGORY_ITEM_TYPES)) {
    const count = items.filter((item) => item.item_type === itemType).length;
    const countElement = categoryGrid.querySelector(`[data-count-for="${category}"]`);
    countElement.textContent = `${count} ${count === 1 ? "item" : "items"}`;
  }
}

function getFilteredItems() {
  const keyword = searchInput.value.trim().toLocaleLowerCase();
  const location = normalizeText(locationFilter.value);

  return donationItems.filter((item) => {
    const matchesKeyword =
      !keyword ||
      `${item.title || ""} ${item.description || ""}`.toLocaleLowerCase().includes(keyword);
    const matchesLocation = !location || normalizeText(item.location).includes(location);
    return matchesKeyword && matchesLocation && matchesCategory(item, selectedCategory);
  });
}

function renderItems() {
  if (!catalogueLoaded) {
    return;
  }

  const items = getFilteredItems();
  const cards = document.createDocumentFragment();
  items.forEach((item) => cards.append(createDonationCard(item)));
  donationGrid.replaceChildren(cards);
  itemsHeading.textContent = selectedCategory
    ? `Available ${CATEGORY_LABELS[selectedCategory]}`
    : "Available Donation Items";
  resultsCount.textContent = `${items.length} ${items.length === 1 ? "item" : "items"}`;

  if (items.length === 0) {
    emptyTitle.textContent = donationItems.length === 0
      ? "No donations to show yet"
      : "No items match these filters";
    emptyMessage.textContent = donationItems.length === 0
      ? "No eligible published donation items are available."
      : "Try another search or category to see more community donations.";
    setCatalogueState("empty");
    return;
  }

  setCatalogueState("items");
}

async function loadCatalogue() {
  catalogueLoaded = false;
  setCatalogueState("loading");
  resultsCount.textContent = "Loading donations...";
  donationGrid.replaceChildren();

  let data;
  let error;

  try {
    const result = await supabaseClient
      .from("items")
      .select(ITEM_FIELDS)
      .eq("status", ELIGIBLE_STATUS);
    data = result.data;
    error = result.error;
  } catch (requestError) {
    error = requestError;
  }

  if (error) {
    console.error("Failed to load Catalogue from Supabase.", error);
    catalogueLoaded = false;
    resultsCount.textContent = "Catalogue unavailable";
    errorMessage.textContent =
      `Supabase request failed: ${error.message || "Unknown database error"}${error.code ? ` (code ${error.code})` : ""}`;
    setCatalogueState("error");
    return;
  }

  donationItems = shuffle(Array.isArray(data) ? data : []);
  updateCategoryCounts(donationItems);
  catalogueLoaded = true;
  renderItems();
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  locationMenu.classList.add("is-hidden");
  renderItems();
});

attachLocationFilter(locationFilter, locationMenu, () => renderItems());

categoryGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) {
    return;
  }

  selectedCategory = selectedCategory === button.dataset.category ? "" : button.dataset.category;
  categoryGrid.querySelectorAll("[data-category]").forEach((categoryButton) => {
    categoryButton.setAttribute(
      "aria-pressed",
      String(categoryButton.dataset.category === selectedCategory)
    );
  });
  renderItems();
});

retryButton.addEventListener("click", loadCatalogue);

loadCatalogue();
