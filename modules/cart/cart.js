import { supabaseClient } from "/assets/js/supabase-client.js";
import { ensureUserProfile } from "/modules/account/auth.js";

const LOGIN_URL = "/modules/account/login.html";
const CATALOGUE_URL = "/modules/catalogue/catalogue.html";
const ITEM_DETAILS_URL = "/modules/item/item-details.html";
const SCHEDULER_URL = "./scheduler.html";
const ITEMS_PER_PAGE = 12;

const itemGrid = document.getElementById("item-grid");
const paginationEl = document.getElementById("cart-pagination");
const cartItemsElement = document.getElementById("cart-items");
const cartCount = document.getElementById("cart-count");
const searchInput = document.getElementById("cart-search");
const sidebar = document.getElementById("cart-sidebar");
const backdrop = document.getElementById("sidebar-backdrop");
const statusMessage = document.getElementById("status-message");

let currentUser = null;
let catalogueMap = new Map();
// Only items already in `cart_items` for the current user
let catalogueItems = [];
// Rows from `cart_items`: Array of { id: number, itemId: number }
let dbCartRows = [];
// Local JS array of itemIds selected into the right-hand Checkout list
let checkoutItemIds = [];
let currentPage = 1;

function getItemDetailsHref(itemId) {
  return `${ITEM_DETAILS_URL}?id=${encodeURIComponent(itemId)}`;
}

function showStatus(message) {
  statusMessage.textContent = message;
  statusMessage.classList.add("is-visible");
  window.clearTimeout(showStatus.timeoutId);
  showStatus.timeoutId = window.setTimeout(() => {
    statusMessage.classList.remove("is-visible");
  }, 2200);
}

function getItemThumbnail(item) {
  if (Array.isArray(item.photo_urls)) {
    const firstValid = item.photo_urls.find((url) => typeof url === "string" && url.trim() !== "");
    if (firstValid) return firstValid;
  }
  if (typeof item.photo_url === "string" && item.photo_url.trim() !== "") {
    return item.photo_url;
  }
  return "";
}

function buildPhotoEl(item, className, itemId = null) {
  const photo = document.createElement("div");
  photo.className = className;
  const thumb = getItemThumbnail(item);
  if (thumb) {
    const img = document.createElement("img");
    img.src = thumb;
    img.alt = item.title || "Item photo";
    photo.appendChild(img);
  } else {
    photo.textContent = (item.title || "?").charAt(0).toUpperCase();
  }

  if (itemId != null) {
    const link = document.createElement("a");
    link.className = "item-photo-link";
    link.href = getItemDetailsHref(itemId);
    link.setAttribute("aria-label", `View details for ${item.title || "item"}`);
    link.appendChild(photo);
    return link;
  }

  return photo;
}

function isInCheckout(itemId) {
  return checkoutItemIds.includes(itemId);
}

function getFilteredItems() {
  const query = searchInput.value.trim().toLowerCase();
  return catalogueItems.filter((item) => {
    const searchableText = `${item.title || ""} ${item.location || ""} ${item.item_type || ""} ${item.condition_type || ""} ${item.delivery_type || ""}`.toLowerCase();
    return searchableText.includes(query);
  });
}

function renderPagination(totalItems, totalPages) {
  if (!paginationEl) return;

  if (totalItems <= ITEMS_PER_PAGE || totalPages <= 1) {
    paginationEl.innerHTML = "";
    paginationEl.classList.add("is-hidden");
    return;
  }

  paginationEl.classList.remove("is-hidden");

  const showBack = currentPage > 1;
  const showNext = currentPage < totalPages;

  paginationEl.innerHTML = `
    <div class="pagination-slot pagination-slot--left">
      ${showBack ? `<button type="button" class="page-nav-btn" data-page-nav="prev">Back</button>` : ""}
    </div>
    <span class="cart-pagination-label">Page ${currentPage}</span>
    <div class="pagination-slot pagination-slot--right">
      ${showNext ? `<button type="button" class="page-nav-btn" data-page-nav="next">Next</button>` : ""}
    </div>
  `;
}

function renderItems() {
  const filteredItems = getFilteredItems();
  itemGrid.replaceChildren();

  if (filteredItems.length === 0) {
    currentPage = 1;
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = searchInput.value.trim()
      ? "No items match your search."
      : "No items in your cart yet.";
    itemGrid.appendChild(emptyState);
    renderPagination(0, 0);
    return;
  }

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));
  if (currentPage > totalPages) {
    currentPage = totalPages;
  }

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const visibleItems = filteredItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  for (const item of visibleItems) {
    const itemId = Number(item.id);
    const detailsHref = getItemDetailsHref(itemId);
    const card = document.createElement("article");
    card.className = "catalogue-card";

    const photo = buildPhotoEl(item, "item-photo", itemId);

    const body = document.createElement("div");
    body.className = "card-body";

    const title = document.createElement("h3");
    const titleLink = document.createElement("a");
    titleLink.href = detailsHref;
    titleLink.textContent = item.title || "Untitled Item";
    titleLink.title = item.title || "Untitled Item";
    title.appendChild(titleLink);

    const location = document.createElement("p");
    location.className = "item-location";
    location.innerHTML = `<span aria-hidden="true">&#128205;</span><span>${item.location || "Unspecified"}</span>`;

    const tagsWrap = document.createElement("div");
    tagsWrap.className = "item-tags";
    const tags = [item.item_type, item.condition_type, item.delivery_type].filter(Boolean);
    for (const tagText of tags) {
      const pill = document.createElement("span");
      pill.className = "item-tag-pill";
      pill.textContent = tagText;
      tagsWrap.appendChild(pill);
    }

    const actionsRow = document.createElement("div");
    actionsRow.className = "card-actions";

    const selectedForCheckout = isInCheckout(itemId);
    const button = document.createElement("button");
    button.type = "button";
    button.className = selectedForCheckout ? "danger-button" : "primary-button";
    button.textContent = selectedForCheckout ? "Deselect" : "Add to Checkout";
    button.addEventListener("click", () => {
      toggleCheckoutSelection(itemId);
    });

    const trashButton = document.createElement("button");
    trashButton.type = "button";
    trashButton.className = "trash-button";
    trashButton.setAttribute("aria-label", `Remove ${item.title || "item"} from shopping cart`);
    trashButton.title = "Remove from shopping cart";
    trashButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
        <path d="M10 11v6"></path>
        <path d="M14 11v6"></path>
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
      </svg>
    `;
    trashButton.addEventListener("click", () => {
      deleteFromCartTable(itemId);
    });

    actionsRow.append(button, trashButton);
    body.append(title, location, tagsWrap, actionsRow);
    card.append(photo, body);
    itemGrid.appendChild(card);
  }

  renderPagination(filteredItems.length, totalPages);
}

function renderCheckoutList() {
  cartCount.textContent = String(checkoutItemIds.length);
  cartItemsElement.replaceChildren();

  if (checkoutItemIds.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = "Your checkout list is empty.";
    cartItemsElement.appendChild(emptyState);
  } else {
    for (const itemId of checkoutItemIds) {
      const item = catalogueMap.get(itemId);
      if (!item) continue;

      const detailsHref = getItemDetailsHref(itemId);
      const row = document.createElement("article");
      row.className = "cart-item";

      const photo = buildPhotoEl(item, "cart-item-photo", itemId);

      const content = document.createElement("div");
      content.style.minWidth = "0";
      const title = document.createElement("h3");
      const titleLink = document.createElement("a");
      titleLink.href = detailsHref;
      titleLink.textContent = item.title || "Untitled Item";
      titleLink.title = item.title || "Untitled Item";
      title.appendChild(titleLink);

      const location = document.createElement("p");
      location.innerHTML = `<span aria-hidden="true">&#128205;</span> ${item.location || "Unspecified"}`;
      content.append(title, location);

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "remove-button";
      removeButton.setAttribute("aria-label", `Remove ${item.title || "item"} from checkout`);
      removeButton.textContent = "×";
      removeButton.addEventListener("click", () => removeFromCheckoutList(itemId));

      row.append(photo, content, removeButton);
      cartItemsElement.appendChild(row);
    }
  }

  renderItems();
}

// Local JS array only: adds/removes itemId in `checkoutItemIds`
function toggleCheckoutSelection(itemId) {
  if (isInCheckout(itemId)) {
    checkoutItemIds = checkoutItemIds.filter((id) => id !== itemId);
    renderCheckoutList();
    showStatus("Removed from checkout list.");
  } else {
    checkoutItemIds.push(itemId);
    renderCheckoutList();
    showStatus("Added to checkout list.");
  }
}

function removeFromCheckoutList(itemId) {
  checkoutItemIds = checkoutItemIds.filter((id) => id !== itemId);
  renderCheckoutList();
  showStatus("Removed from checkout list.");
}

// Database + local variable: deletes from `cart_items`, removes from left list, and clears local selection
async function deleteFromCartTable(itemId) {
  if (!currentUser) return;

  const { error } = await supabaseClient
    .from("cart_items")
    .delete()
    .eq("user_id", currentUser.id)
    .eq("item_id", itemId);

  if (error) {
    showStatus(error.message || "Failed to delete item from cart.");
    return;
  }

  dbCartRows = dbCartRows.filter((row) => row.itemId !== itemId);
  catalogueItems = catalogueItems.filter((item) => Number(item.id) !== itemId);
  catalogueMap.delete(itemId);
  checkoutItemIds = checkoutItemIds.filter((id) => id !== itemId);
  renderCheckoutList();
  showStatus("Deleted from cart.");
}

// Local JS array only: clears `checkoutItemIds` without touching `cart_items`
function clearCart() {
  if (checkoutItemIds.length === 0) {
    showStatus("Checkout list is already empty.");
    return;
  }

  checkoutItemIds = [];
  renderCheckoutList();
  showStatus("Cleared from checkout list.");
}

function openCart() {
  sidebar.classList.add("is-open");
  backdrop.classList.add("is-visible");
}

function closeCart() {
  sidebar.classList.remove("is-open");
  backdrop.classList.remove("is-visible");
}

function handleBackNavigation() {
  if (window.history.length > 1 && document.referrer) {
    window.history.back();
  } else {
    window.location.href = CATALOGUE_URL;
  }
}

paginationEl?.addEventListener("click", (event) => {
  const navBtn = event.target.closest("button[data-page-nav]");
  if (!navBtn) return;

  const totalPages = Math.max(1, Math.ceil(getFilteredItems().length / ITEMS_PER_PAGE));

  if (navBtn.dataset.pageNav === "prev" && currentPage > 1) {
    currentPage -= 1;
    renderItems();
    itemGrid.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (navBtn.dataset.pageNav === "next" && currentPage < totalPages) {
    currentPage += 1;
    renderItems();
    itemGrid.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

async function loadCartPageData() {
  if (!currentUser) return;

  const { data: cartData, error: cartError } = await supabaseClient
    .from("cart_items")
    .select("id, item_id")
    .eq("user_id", currentUser.id)
    .order("id", { ascending: true });

  if (cartError) {
    showStatus(cartError.message || "Failed to load cart items.");
    dbCartRows = [];
    catalogueItems = [];
    catalogueMap = new Map();
    checkoutItemIds = [];
    renderCheckoutList();
    return;
  }

  dbCartRows = (cartData || []).map((row) => ({
    id: Number(row.id),
    itemId: Number(row.item_id),
  }));

  const savedItemIds = [...new Set(dbCartRows.map((row) => row.itemId))];
  if (savedItemIds.length === 0) {
    catalogueItems = [];
    catalogueMap = new Map();
    checkoutItemIds = [];
    renderCheckoutList();
    return;
  }

  const { data: itemsData, error: itemsError } = await supabaseClient
    .from("items")
    .select("*")
    .in("id", savedItemIds);

  if (itemsError) {
    showStatus(itemsError.message || "Failed to load cart item details.");
    catalogueItems = [];
    catalogueMap = new Map();
  } else {
    const byId = new Map((itemsData || []).map((item) => [Number(item.id), item]));
    catalogueItems = savedItemIds
      .map((id) => byId.get(id))
      .filter((item) => {
        if (!item) return false;
        if (!item.status) return true;
        return String(item.status).toLowerCase() === "available";
      });
    catalogueMap = new Map(catalogueItems.map((item) => [Number(item.id), item]));
    dbCartRows = dbCartRows.filter((row) => catalogueMap.has(row.itemId));
  }

  checkoutItemIds = [];
  renderCheckoutList();
}

document.getElementById("back-button").addEventListener("click", handleBackNavigation);
searchInput.addEventListener("input", () => {
  currentPage = 1;
  renderItems();
});
document.getElementById("open-cart-button")?.addEventListener("click", openCart);
backdrop.addEventListener("click", closeCart);
document.getElementById("cancel-all-button").addEventListener("click", clearCart);

document.getElementById("continue-button").addEventListener("click", () => {
  if (checkoutItemIds.length === 0) {
    showStatus("No items selected.");
    return;
  }

  const selectedIds = [...checkoutItemIds];
  sessionStorage.setItem("scheduler_item_ids", JSON.stringify(selectedIds));
  window.location.href = `${SCHEDULER_URL}?items=${encodeURIComponent(selectedIds.join(","))}`;
});

async function initCartPage() {
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error || !session?.user) {
    window.location.replace(LOGIN_URL);
    return;
  }

  currentUser = session.user;
  await ensureUserProfile(currentUser);
  await loadCartPageData();
}

initCartPage();