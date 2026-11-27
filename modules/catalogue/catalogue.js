import { supabaseClient } from "/assets/js/supabase-client.js";
import { attachLocationFilter } from "/assets/js/location.js";

const ELIGIBLE_STATUS = "Available";
const ITEMS_PER_PAGE = 12;
const STORAGE_BUCKET = "photos";
const ITEM_FIELDS =
  "id, donor_id, title, description, location, item_type, condition_type, delivery_type, photo_urls, status, created_at, donor:user_profiles!items_donor_id_fkey(username)";
const CATEGORY_ITEM_TYPES = {
  clothes: "Clothing",
  books: "Books",
  electronics: "Electronics",
  furniture: "Furniture",
  "home-living": "Home & Living",
  "toys-games": "Toys & Games",
  "baby-kids": "Baby & Kids",
  "sports-outdoor": "Sports & Outdoor",
  "shoes-accessories": "Shoes & Accessories",
  "beauty-personal-care": "Beauty & Personal Care",
  "pet-supplies": "Pet Supplies",
  "automotive-accessories": "Automotive Accessories",
  "musical-instruments": "Musical Instruments",
  miscellaneous: "Miscellaneous",
};
const CATEGORY_LABELS = {
  clothes: "Clothes",
  books: "Books",
  electronics: "Electronics",
  furniture: "Furniture",
  "home-living": "Home & Living",
  "toys-games": "Toys & Games",
  "baby-kids": "Baby & Kids",
  "sports-outdoor": "Sports & Outdoor",
  "shoes-accessories": "Shoes & Accessories",
  "beauty-personal-care": "Beauty & Personal Care",
  "pet-supplies": "Pet Supplies",
  "automotive-accessories": "Automotive Accessories",
  "musical-instruments": "Musical Instruments",
  miscellaneous: "Miscellaneous",
};

const searchForm = document.querySelector("#catalogue-search-form");
const searchInput = document.querySelector("#catalogue-search-input");
const locationFilter = document.querySelector("#catalogue-location-filter");
const locationMenu = document.querySelector("#catalogue-location-menu");
const categorySection = document.querySelector("#category-section");
const categoryGrid = document.querySelector("#category-grid");
const othersCategoryView = document.querySelector("#others-category-view");
const othersSubcategoryGrid = document.querySelector("#others-subcategory-grid");
const backToCategories = document.querySelector("#back-to-categories");
const itemsHeading = document.querySelector("#items-heading");
const donationGrid = document.querySelector("#donation-grid");
const donationPagination = document.querySelector("#donation-pagination");
const donationPageIndicator = document.querySelector("#donation-page-indicator");
const previousPageButton = document.querySelector("#donation-previous-page");
const nextPageButton = document.querySelector("#donation-next-page");
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
let showingOthersCategories = false;
let catalogueLoaded = false;
let currentPage = 1;
let catalogueUserId = null;
let latestViewedCategory = "";
let categoryViewVersion = 0;
let pendingCategoryPreferenceWrite = Promise.resolve();

function setCatalogueState(state) {
  loadingState.hidden = state !== "loading";
  emptyState.hidden = state !== "empty";
  errorState.hidden = state !== "error";
  donationGrid.hidden = state === "loading" || state === "error" || state === "empty";
  donationPagination.hidden = state !== "items";
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

function hasCategory(category) {
  return Object.prototype.hasOwnProperty.call(CATEGORY_ITEM_TYPES, category);
}

function orderItemsByCategory(items, preferredCategory) {
  if (!preferredCategory) {
    return shuffle(items);
  }

  const preferredItems = items.filter((item) => matchesCategory(item, preferredCategory));
  const otherItems = items.filter((item) => !matchesCategory(item, preferredCategory));
  return [...shuffle(preferredItems), ...shuffle(otherItems)];
}

async function getCatalogueUserId() {
  try {
    const { data, error } = await supabaseClient.auth.getUser();
    if (error) {
      console.error("Could not identify the signed-in Catalogue user.", error);
      return null;
    }
    return data.user?.id || null;
  } catch (error) {
    console.error("Could not identify the signed-in Catalogue user.", error);
    return null;
  }
}

async function waitForCategoryPreferenceWrites() {
  let pendingWrite;
  do {
    pendingWrite = pendingCategoryPreferenceWrite;
    await pendingWrite;
  } while (pendingWrite !== pendingCategoryPreferenceWrite);
}

async function loadCategoryPreference(userId) {
  await waitForCategoryPreferenceWrites();

  try {
    const { data, error } = await supabaseClient
      .from("user_category_browsing")
      .select("category")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Could not load the Catalogue category preference.", error);
      return "";
    }
    if (!data) {
      return "";
    }
    if (typeof data.category === "string" && hasCategory(data.category)) {
      return data.category;
    }

    console.error("The saved Catalogue category preference is invalid.", data.category);
    return "";
  } catch (error) {
    console.error("Could not load the Catalogue category preference.", error);
    return "";
  }
}

async function saveCategoryPreference(userId, category) {
  const { error } = await supabaseClient
    .from("user_category_browsing")
    .upsert(
      {
        user_id: userId,
        category,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    throw error;
  }
}

function queueCategoryPreferenceSave(userId, category) {
  const write = pendingCategoryPreferenceWrite.then(() =>
    saveCategoryPreference(userId, category)
  );
  pendingCategoryPreferenceWrite = write.catch((error) => {
    console.error("Could not save the Catalogue category preference.", error);
  });
  return pendingCategoryPreferenceWrite;
}

function recordCategoryView(category) {
  if (!hasCategory(category)) {
    return;
  }

  latestViewedCategory = category;
  categoryViewVersion += 1;
  if (catalogueUserId) {
    queueCategoryPreferenceSave(catalogueUserId, category);
  }
}

function getPhotoUrl(photoValue) {
  let candidates;

  if (Array.isArray(photoValue)) {
    candidates = photoValue;
  } else if (typeof photoValue === "string" && photoValue.trim()) {
    const trimmedValue = photoValue.trim();
    candidates = [trimmedValue];

    if (trimmedValue.startsWith("[") || trimmedValue.startsWith('"')) {
      try {
        const parsed = JSON.parse(trimmedValue);
        candidates = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        if (trimmedValue.startsWith("[")) {
          return null;
        }
      }
    } else if (trimmedValue.includes(",")) {
      candidates = trimmedValue.split(",");
    }
  } else {
    return null;
  }

  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate.trim()) {
      continue;
    }

    const value = candidate.trim();

    try {
      const url = new URL(value);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return url.href;
      }
      continue;
    } catch {
      if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
        continue;
      }
    }

    const storagePath = value
      .replace(/^\/+/, "")
      .replace(new RegExp(`^(?:storage/v1/object/public/)?${STORAGE_BUCKET}/`, "i"), "");
    if (!storagePath) {
      continue;
    }

    const { data } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
    if (data?.publicUrl) {
      return data.publicUrl;
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
  const itemLink = document.createElement("a");
  itemLink.className = "donation-card-main";
  itemLink.href = `/modules/item/item-details.html?${new URLSearchParams({ id: String(item.id) })}`;
  itemLink.setAttribute("aria-label", `View donation: ${item.title || "Untitled donation"}`);

  const photoUrl = getPhotoUrl(item.photo_urls);
  if (photoUrl) {
    const image = document.createElement("img");
    image.className = "donation-card-image";
    image.src = photoUrl;
    image.alt = item.title ? `Photo of ${item.title}` : "Donated item";
    image.loading = "lazy";
    image.addEventListener("error", () => image.replaceWith(createPhotoPlaceholder()), { once: true });
    itemLink.append(image);
  } else {
    itemLink.append(createPhotoPlaceholder());
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

  itemLink.append(body);
  card.append(itemLink);

  const donorLine = document.createElement("p");
  donorLine.className = "donation-card-donor";
  donorLine.append(document.createTextNode("Posted by: "));

  const donorId = typeof item.donor_id === "string" ? item.donor_id.trim() : "";
  const donorUsername =
    typeof item.donor?.username === "string" && item.donor.username.trim()
      ? item.donor.username.trim()
      : "Unknown";

  if (donorId && donorUsername !== "Unknown") {
    const donorLink = document.createElement("a");
    donorLink.className = "donation-card-donor-link";
    donorLink.href = `/modules/profile/profile.html?id=${encodeURIComponent(donorId)}`;
    donorLink.textContent = donorUsername;
    donorLine.append(donorLink);
  } else {
    donorLine.append(document.createTextNode(donorUsername));
  }

  card.append(donorLine);
  return card;
}

function updateCategoryCounts(items) {
  for (const [category, itemType] of Object.entries(CATEGORY_ITEM_TYPES)) {
    const count = items.filter((item) => item.item_type === itemType).length;
    const countElement = categorySection.querySelector(`[data-count-for="${category}"]`);
    countElement.textContent = `${count} ${count === 1 ? "item" : "items"}`;
  }
}

function updateCategoryNavigation() {
  categoryGrid.hidden = showingOthersCategories;
  othersCategoryView.hidden = !showingOthersCategories;

  categoryGrid.querySelectorAll("[data-category]").forEach((button) => {
    const category = button.dataset.category;
    const isSelected = category === "others"
      ? showingOthersCategories
      : selectedCategory === category;
    button.setAttribute("aria-pressed", String(isSelected));
  });

  othersSubcategoryGrid.querySelectorAll("[data-subcategory]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.subcategory === selectedCategory)
    );
  });
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

function renderItems({ resetPage = false } = {}) {
  if (!catalogueLoaded) {
    return;
  }

  if (resetPage) {
    currentPage = 1;
  }

  const items = getFilteredItems();
  const pageCount = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
  currentPage = Math.min(currentPage, pageCount);
  const firstItemIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageItems = items.slice(firstItemIndex, firstItemIndex + ITEMS_PER_PAGE);
  const cards = document.createDocumentFragment();
  pageItems.forEach((item) => cards.append(createDonationCard(item)));
  donationGrid.replaceChildren(cards);
  donationPageIndicator.textContent = `Page ${currentPage} of ${pageCount}`;
  previousPageButton.hidden = currentPage <= 1 || pageCount <= 1;
  nextPageButton.hidden = currentPage >= pageCount;
  itemsHeading.textContent = selectedCategory
    ? `Available ${CATEGORY_LABELS[selectedCategory]}`
    : "Available Donation Items";
  resultsCount.textContent = `${items.length} ${items.length === 1 ? "item" : "items"}`;

  if (items.length === 0) {
    const categoryHasItems = !selectedCategory ||
      donationItems.some((item) => matchesCategory(item, selectedCategory));

    if (donationItems.length === 0) {
      emptyTitle.textContent = "No donations to show yet";
      emptyMessage.textContent = "No eligible published donation items are available.";
    } else if (selectedCategory && !categoryHasItems) {
      emptyTitle.textContent = `No ${CATEGORY_LABELS[selectedCategory]} donations available`;
      emptyMessage.textContent =
        `There are currently no available ${CATEGORY_LABELS[selectedCategory].toLocaleLowerCase()} donations.`;
    } else {
      emptyTitle.textContent = "No items match these filters";
      emptyMessage.textContent = "Try another search or category to see more community donations.";
    }

    setCatalogueState("empty");
    return;
  }

  setCatalogueState("items");
}

async function loadCatalogue() {
  catalogueLoaded = false;
  currentPage = 1;
  const categoryViewVersionAtStart = categoryViewVersion;
  setCatalogueState("loading");
  resultsCount.textContent = "Loading donations...";
  donationGrid.replaceChildren();

  const userId = await getCatalogueUserId();
  catalogueUserId = userId;
  if (userId && categoryViewVersion !== categoryViewVersionAtStart) {
    await queueCategoryPreferenceSave(userId, latestViewedCategory);
  }

  let data;
  let error;
  let savedCategory = "";

  try {
    const [categoryPreference, result] = await Promise.all([
      userId ? loadCategoryPreference(userId) : Promise.resolve(""),
      supabaseClient
        .from("items")
        .select(ITEM_FIELDS)
        .eq("status", ELIGIBLE_STATUS),
    ]);
    savedCategory = categoryPreference;
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

  const preferredCategory = userId && categoryViewVersion !== categoryViewVersionAtStart
    ? latestViewedCategory
    : savedCategory;
  donationItems = orderItemsByCategory(Array.isArray(data) ? data : [], preferredCategory);
  updateCategoryCounts(donationItems);
  catalogueLoaded = true;
  renderItems();
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  locationMenu.classList.add("is-hidden");
  renderItems({ resetPage: true });
});

attachLocationFilter(locationFilter, locationMenu, () => renderItems({ resetPage: true }));

categoryGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) {
    return;
  }

  if (button.dataset.category === "others") {
    selectedCategory = "";
    showingOthersCategories = true;
  } else {
    recordCategoryView(button.dataset.category);
    selectedCategory = selectedCategory === button.dataset.category
      ? ""
      : button.dataset.category;
    showingOthersCategories = false;
  }

  updateCategoryNavigation();
  renderItems({ resetPage: true });
});

othersSubcategoryGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-subcategory]");
  if (!button) {
    return;
  }

  recordCategoryView(button.dataset.subcategory);
  selectedCategory = selectedCategory === button.dataset.subcategory
    ? ""
    : button.dataset.subcategory;
  updateCategoryNavigation();
  renderItems({ resetPage: true });
});

backToCategories.addEventListener("click", () => {
  showingOthersCategories = false;
  selectedCategory = "";
  updateCategoryNavigation();
  renderItems({ resetPage: true });
});

previousPageButton.addEventListener("click", () => {
  if (!previousPageButton.hidden) {
    currentPage -= 1;
    renderItems();
  }
});

nextPageButton.addEventListener("click", () => {
  if (!nextPageButton.hidden) {
    currentPage += 1;
    renderItems();
  }
});

retryButton.addEventListener("click", loadCatalogue);

updateCategoryNavigation();
loadCatalogue();
