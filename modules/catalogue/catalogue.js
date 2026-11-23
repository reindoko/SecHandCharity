import { supabaseClient } from "/assets/js/supabase-client.js";

const PAGE_SIZE = 500;
const ITEM_FIELDS = "id,title,description,location,item_type,condition_type,status,created_at";

const searchInput = document.getElementById("item-search");
const locationFilter = document.getElementById("location-filter");
const clothesCategory = document.getElementById("category-clothes");
const catalogueState = document.getElementById("catalogue-state");
const listingGrid = document.getElementById("listing-grid");
const resultCount = document.getElementById("result-count");

let catalogueItems = [];
let selectedCategory = "";

function setState(message, isError = false) {
  catalogueState.textContent = message;
  catalogueState.classList.toggle("is-error", isError);
}

function createTag(label, value, className = "") {
  const tag = document.createElement("span");
  tag.className = `listing-tag${className ? ` ${className}` : ""}`;
  tag.textContent = `${label}: ${value || "Not provided"}`;
  return tag;
}

function createListingCard(item) {
  const card = document.createElement("a");
  card.className = "listing-card";
  card.href = `/modules/item/item-menu.html?item_id=${encodeURIComponent(item.id)}`;
  card.setAttribute(
    "aria-label",
    `Open item ${item.title || "without a title"} in the existing Item module`
  );

  const photoPlaceholder = document.createElement("div");
  photoPlaceholder.className = "listing-photo-placeholder";
  photoPlaceholder.textContent = "Photo format not verified";
  photoPlaceholder.setAttribute("aria-hidden", "true");

  const content = document.createElement("div");
  content.className = "listing-card-content";

  const title = document.createElement("h3");
  title.textContent = item.title || "Untitled item";
  content.appendChild(title);

  const description = document.createElement("p");
  description.className = "listing-description";
  description.textContent = item.description || "No description provided.";
  content.appendChild(description);

  const metadata = document.createElement("div");
  metadata.className = "listing-meta";
  metadata.append(
    createTag("Type", item.item_type || "Unverified"),
    createTag("Condition", item.condition_type),
    createTag("Location", item.location),
    createTag("Status", item.status || "Unverified", "listing-status")
  );
  content.appendChild(metadata);

  card.append(photoPlaceholder, content);
  return card;
}

function getVisibleItems() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const selectedLocation = locationFilter.value;

  return catalogueItems.filter((item) => {
    const searchableText = `${item.title || ""} ${item.description || ""}`.toLocaleLowerCase();
    const matchesQuery = !query || searchableText.includes(query);
    const matchesLocation = !selectedLocation || item.location?.trim() === selectedLocation;
    const matchesCategory = !selectedCategory || item.item_type === selectedCategory;
    return matchesQuery && matchesLocation && matchesCategory;
  });
}

function renderItems() {
  const visibleItems = getVisibleItems();
  const fragment = document.createDocumentFragment();

  for (const item of visibleItems) {
    fragment.appendChild(createListingCard(item));
  }

  listingGrid.replaceChildren(fragment);
  listingGrid.setAttribute("aria-busy", "false");
  resultCount.textContent = `${visibleItems.length} ${visibleItems.length === 1 ? "listing" : "listings"}`;

  if (visibleItems.length === 0) {
    setState(
      catalogueItems.length === 0
        ? "No listings were returned by Supabase."
        : "No listings match your selected filters."
    );
  } else {
    setState("");
  }
}

function populateLocations() {
  const locations = [...new Set(
    catalogueItems
      .map((item) => item.location?.trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));

  locationFilter.replaceChildren(new Option("All locations", ""));
  for (const location of locations) {
    locationFilter.add(new Option(location, location));
  }
  locationFilter.disabled = locations.length === 0;
}

function renderError(error) {
  console.error("Could not load catalogue items:", error);
  listingGrid.replaceChildren();
  listingGrid.setAttribute("aria-busy", "false");
  resultCount.textContent = "";
  setState("Listings could not be loaded. Please try again.", true);

  const retryButton = document.createElement("button");
  retryButton.className = "retry-button";
  retryButton.type = "button";
  retryButton.textContent = "Retry";
  retryButton.addEventListener("click", loadItems, { once: true });
  catalogueState.appendChild(retryButton);
}

async function loadItems() {
  setState("Loading listings…");
  listingGrid.replaceChildren();
  listingGrid.setAttribute("aria-busy", "true");
  resultCount.textContent = "";
  searchInput.disabled = true;
  locationFilter.disabled = true;

  const loadedItems = [];
  let offset = 0;

  try {
    while (true) {
      const { data, error } = await supabaseClient
        .from("items")
        .select(ITEM_FIELDS)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) throw error;

      loadedItems.push(...data);
      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    catalogueItems = loadedItems;
    populateLocations();
    searchInput.disabled = false;
    renderItems();
  } catch (error) {
    searchInput.disabled = false;
    renderError(error);
  }
}

searchInput.addEventListener("input", renderItems);
locationFilter.addEventListener("change", renderItems);
clothesCategory.addEventListener("click", () => {
  const isSelected = clothesCategory.getAttribute("aria-pressed") === "true";
  selectedCategory = isSelected ? "" : clothesCategory.dataset.itemType;
  clothesCategory.setAttribute("aria-pressed", String(!isSelected));
  renderItems();
});

loadItems();
