const DATA_URL = new URL(
  "../../../SecondHandCharity-Catalogue/data/donations.json",
  window.location.href
);
const ELIGIBLE_STATUS = "available";
const ITEM_FIELDS = [
  "title",
  "description",
  "location",
  "item_type",
  "condition_type",
  "photo_urls",
];
const CATEGORY_VALUES = {
  clothes: ["clothing", "clothes", "cloth"],
  books: ["book", "books"],
  electronics: ["electronic", "electronics"],
};

const searchForm = document.querySelector("#catalogue-search-form");
const searchInput = document.querySelector("#catalogue-search-input");
const locationFilter = document.querySelector("#catalogue-location-filter");
const categoryGrid = document.querySelector("#category-grid");
const donationGrid = document.querySelector("#donation-grid");
const loadingState = document.querySelector("#loading-state");
const emptyState = document.querySelector("#empty-state");
const errorState = document.querySelector("#error-state");
const emptyTitle = document.querySelector("#empty-title");
const emptyMessage = document.querySelector("#empty-message");
const errorMessage = document.querySelector("#error-message");
const retryButton = document.querySelector("#retry-button");
const chooseDataFileButton = document.querySelector("#choose-data-file");
const localDataFileInput = document.querySelector("#local-data-file");
const resultsCount = document.querySelector("#items-result-count");
const basketCount = document.querySelector("#basket-count");

const projectRoot = new URL("/", window.location.origin);
const localPhotoRoot = new URL("assets/donations/", projectRoot);

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

function normalizeCategory(value) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase() : "";
}

function isKnownCategory(value) {
  const normalizedValue = normalizeCategory(value);
  return Object.values(CATEGORY_VALUES).some((values) => values.includes(normalizedValue));
}

function matchesCategory(item, category) {
  if (!category) {
    return true;
  }

  const value = normalizeCategory(item.item_type);
  if (category === "others") {
    return !isKnownCategory(value);
  }

  return CATEGORY_VALUES[category].includes(value);
}

function validateDonationRecord(record, index, seenIds) {
  const recordNumber = index + 1;
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error(`Donation record ${recordNumber} must be a JSON object.`);
  }

  const validId =
    (typeof record.id === "string" && record.id.trim() !== "") ||
    (typeof record.id === "number" && Number.isSafeInteger(record.id));
  if (!validId) {
    throw new Error(`Donation record ${recordNumber} must have a valid item id.`);
  }
  if (record.status !== null && typeof record.status !== "string") {
    throw new Error(`Donation record ${recordNumber} must have a string or null status.`);
  }

  const id = String(record.id);
  if (seenIds.has(id)) {
    throw new Error(`Donation record ${recordNumber} has a duplicate id.`);
  }
  seenIds.add(id);

  for (const field of ITEM_FIELDS) {
    if (!(field in record) || (record[field] !== null && typeof record[field] !== "string")) {
      throw new Error(`Donation record ${recordNumber} must have a string or null ${field} field.`);
    }
  }

  return {
    id,
    status: record.status,
    title: record.title,
    description: record.description,
    location: record.location,
    item_type: record.item_type,
    condition_type: record.condition_type,
    photo_urls: record.photo_urls,
  };
}

function parseLocalDonations(records) {
  if (!Array.isArray(records)) {
    throw new Error("The local donation source must contain a JSON array.");
  }

  const seenIds = new Set();
  return records
    .map((record, index) => validateDonationRecord(record, index, seenIds))
    .filter((record) => record.status === ELIGIBLE_STATUS);
}

async function loadLocalDonations() {
  const response = await fetch(DATA_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      `Could not load local JSON data (${response.status}). Ensure the standalone data folder is served at ${DATA_URL.pathname}, or choose the JSON file below.`
    );
  }

  return parseLocalDonations(await response.json());
}

function shuffle(items) {
  const shuffledItems = [...items];
  for (let index = shuffledItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffledItems[index], shuffledItems[swapIndex]] = [
      shuffledItems[swapIndex],
      shuffledItems[index],
    ];
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
      console.warn("Could not parse an item's local photo_urls value.", error);
      return null;
    }
  }

  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }

    try {
      const url = new URL(candidate.trim(), projectRoot);
      if (url.origin === window.location.origin && url.pathname.startsWith(localPhotoRoot.pathname)) {
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

function updateLocationOptions(items) {
  const selectedLocation = locationFilter.value;
  const options = [new Option("All locations", "")];
  const locations = [...new Set(items.map((item) => item.location).filter(Boolean))]
    .sort((first, second) => first.localeCompare(second));

  locations.forEach((location) => options.push(new Option(location, location)));
  locationFilter.replaceChildren(...options);
  locationFilter.value = locations.includes(selectedLocation) ? selectedLocation : "";
}

function updateCategoryCounts(items) {
  for (const category of Object.keys(CATEGORY_VALUES)) {
    const count = items.filter((item) => matchesCategory(item, category)).length;
    const countElement = categoryGrid.querySelector(`[data-count-for="${category}"]`);
    countElement.textContent = `${count} ${count === 1 ? "item" : "items"}`;
  }

  const otherCount = items.filter((item) => matchesCategory(item, "others")).length;
  const otherCountElement = categoryGrid.querySelector('[data-count-for="others"]');
  otherCountElement.textContent = `${otherCount} ${otherCount === 1 ? "item" : "items"}`;
}

function getFilteredItems() {
  const keyword = searchInput.value.trim().toLocaleLowerCase();
  const location = locationFilter.value;

  return donationItems.filter((item) => {
    const matchesKeyword =
      !keyword ||
      `${item.title || ""} ${item.description || ""}`.toLocaleLowerCase().includes(keyword);
    const matchesLocation = !location || item.location === location;
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
  resultsCount.textContent = `${items.length} ${items.length === 1 ? "item" : "items"}`;

  if (items.length === 0) {
    emptyTitle.textContent = donationItems.length === 0
      ? "No donations to show yet"
      : "No items match these filters";
    emptyMessage.textContent = donationItems.length === 0
      ? "No eligible donation items are available in the local JSON source."
      : "Try another search or category to see more community donations.";
    setCatalogueState("empty");
    return;
  }
  setCatalogueState("items");
}

function displayDonations(items) {
  donationItems = shuffle(items);
  updateLocationOptions(donationItems);
  updateCategoryCounts(donationItems);
  basketCount.textContent = String(donationItems.length);
  catalogueLoaded = true;
  renderItems();
}

function showLoadError(error) {
  console.error("Failed to load local Catalogue data.", error);
  catalogueLoaded = false;
  resultsCount.textContent = "Catalogue unavailable";
  errorMessage.textContent =
    error instanceof Error ? error.message : "The local donation data could not be read.";
  setCatalogueState("error");
}

async function loadCatalogue() {
  catalogueLoaded = false;
  setCatalogueState("loading");
  resultsCount.textContent = "Loading donations...";
  donationGrid.replaceChildren();

  try {
    displayDonations(await loadLocalDonations());
  } catch (error) {
    showLoadError(error);
  }
}

async function loadSelectedFile(file) {
  catalogueLoaded = false;
  setCatalogueState("loading");
  resultsCount.textContent = "Reading local donation file...";
  try {
    displayDonations(parseLocalDonations(JSON.parse(await file.text())));
  } catch (error) {
    showLoadError(error);
  }
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  renderItems();
});

locationFilter.addEventListener("change", renderItems);
categoryGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (button) {
    selectedCategory = selectedCategory === button.dataset.category ? "" : button.dataset.category;
    categoryGrid.querySelectorAll("[data-category]").forEach((categoryButton) => {
      categoryButton.setAttribute(
        "aria-pressed",
        String(categoryButton.dataset.category === selectedCategory)
      );
    });
    renderItems();
  }
});
retryButton.addEventListener("click", loadCatalogue);
chooseDataFileButton.addEventListener("click", () => localDataFileInput.click());
localDataFileInput.addEventListener("change", () => {
  const [file] = localDataFileInput.files;
  if (file) {
    loadSelectedFile(file);
  }
});

basketCount.textContent = "0";
loadCatalogue();
