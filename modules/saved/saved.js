import { supabaseClient } from "/assets/js/supabase-client.js";
import { ensureUserProfile } from "/modules/account/auth.js";

const LOGIN_URL = "/modules/account/login.html";
const ITEM_DETAILS_URL = "/modules/item/item-details.html";
const ALL_CATEGORY = "all";
const ITEMS_PER_PAGE = 12;

const DEFAULT_CATEGORIES = [
  "Clothing",
  "Books",
  "Electronics",
  "Furniture",
  "Home & Living",
  "Toys & Games",
  "Baby & Kids",
  "Sports & Outdoor",
  "Shoes & Accessories",
  "Beauty & Personal Care",
  "Pet Supplies",
  "Automotive Accessories",
  "Musical Instruments",
  "Miscellaneous",
];

const savedGrid = document.getElementById("saved-grid");
const paginationEl = document.getElementById("saved-pagination");
const categoryGrid = document.getElementById("category-grid");
const keywordList = document.getElementById("keyword-list");
const statusMessage = document.getElementById("status-message");
const categoryDialog = document.getElementById("category-dialog");
const categoryForm = document.getElementById("category-form");
const categoryNameInput = document.getElementById("category-name");
const itemCategoriesDialog = document.getElementById("item-categories-dialog");
const categoryCheckboxes = document.getElementById("category-checkboxes");
const itemCategoriesForm = document.getElementById("item-categories-form");

let currentUser = null;
// Each entry: { savedId, itemId, categoriesId: number[], title, itemType, condition, deliveryType, location, thumbnailUrl }
let savedEntries = [];
// Each entry: { id: number, name: string }
let categories = [];
// Each entry: { id: number, keyword: string }
let keywords = [];

let activeCategory = ALL_CATEGORY;
let currentPage = 1;
let editingCategoryId = null;
let editingItemId = null;

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
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

function showStatus(message) {
  statusMessage.textContent = message;
  statusMessage.classList.add("is-visible");
  window.clearTimeout(showStatus.timeoutId);
  showStatus.timeoutId = window.setTimeout(() => {
    statusMessage.classList.remove("is-visible");
  }, 2200);
}

function createButton(label, className, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

function createCategoryCard({ key, name, count, custom = false, categoryId = null }) {
  const card = document.createElement("article");
  card.className = `category-card${activeCategory === key ? " is-active" : ""}`;

  const selectButton = document.createElement("button");
  selectButton.type = "button";
  selectButton.className = "category-card-button";
  selectButton.setAttribute("aria-pressed", String(activeCategory === key));

  const title = document.createElement("h3");
  title.textContent = name;
  const itemCount = document.createElement("p");
  itemCount.textContent = `${count} saved item${count === 1 ? "" : "s"}`;
  selectButton.append(title, itemCount);
  selectButton.addEventListener("click", () => {
    activeCategory = key;
    currentPage = 1;
    renderCategories();
    renderSavedItems();
  });
  card.appendChild(selectButton);

  if (custom) {
    const actions = document.createElement("div");
    actions.className = "category-card-actions";
    actions.append(
      createButton("Rename", "secondary-button", () => {
        openCategoryDialog(categories.find((category) => category.id === categoryId));
      }),
      createButton("Delete", "danger-button", () => deleteCategory(categoryId))
    );
    card.appendChild(actions);
  }

  return card;
}

function renderCategories() {
  categoryGrid.replaceChildren();

  categoryGrid.appendChild(createCategoryCard({
    key: ALL_CATEGORY,
    name: "All Saved Items",
    count: savedEntries.length
  }));

  for (const name of DEFAULT_CATEGORIES) {
    const target = normalizeKey(name);
    const count = savedEntries.filter(
      (item) => normalizeKey(item.itemType) === target
    ).length;

    categoryGrid.appendChild(createCategoryCard({
      key: `type:${name}`,
      name,
      count
    }));
  }

  for (const category of categories) {
    const count = savedEntries.filter((entry) =>
      entry.categoriesId.includes(category.id)
    ).length;

    categoryGrid.appendChild(createCategoryCard({
      key: `custom:${category.id}`,
      name: category.name,
      count,
      custom: true,
      categoryId: category.id
    }));
  }
}

function itemMatchesActiveCategory(item) {
  if (activeCategory === ALL_CATEGORY) return true;

  if (activeCategory.startsWith("type:")) {
    const selectedType = normalizeKey(activeCategory.slice("type:".length));
    return normalizeKey(item.itemType) === selectedType;
  }

  if (activeCategory.startsWith("custom:")) {
    const categoryId = Number(activeCategory.slice("custom:".length));
    return item.categoriesId.includes(categoryId);
  }

  return true;
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
    <span class="saved-pagination-label">Page ${currentPage}</span>
    <div class="pagination-slot pagination-slot--right">
      ${showNext ? `<button type="button" class="page-nav-btn" data-page-nav="next">Next</button>` : ""}
    </div>
  `;
}

function renderSavedItems() {
  savedGrid.replaceChildren();
  const filteredItems = savedEntries.filter(itemMatchesActiveCategory);
  const activeCategoryLabel = document.getElementById("active-category-label");

  if (activeCategory === ALL_CATEGORY) {
    activeCategoryLabel.textContent = "All saved items";
  } else if (activeCategory.startsWith("type:")) {
    activeCategoryLabel.textContent = activeCategory.slice("type:".length);
  } else if (activeCategory.startsWith("custom:")) {
    const category = categories.find(
      (candidate) => candidate.id === Number(activeCategory.slice("custom:".length))
    );
    activeCategoryLabel.textContent = category ? category.name : "All saved items";
  } else {
    activeCategoryLabel.textContent = "All saved items";
  }

  if (filteredItems.length === 0) {
    currentPage = 1;
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = "No saved items in this category.";
    savedGrid.appendChild(emptyState);
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
    const card = document.createElement("article");
    card.className = "saved-card";
    const detailsHref = `${ITEM_DETAILS_URL}?id=${encodeURIComponent(item.itemId)}`;

    const photoLink = document.createElement("a");
    photoLink.href = detailsHref;
    photoLink.className = "saved-photo-link";
    photoLink.setAttribute("aria-label", `View ${item.title} details`);

    const photo = document.createElement("div");
    photo.className = "saved-photo";
    if (item.thumbnailUrl) {
      const img = document.createElement("img");
      img.src = item.thumbnailUrl;
      img.alt = item.title;
      photo.appendChild(img);
    } else {
      photo.textContent = item.title.charAt(0).toUpperCase();
    }
    photoLink.appendChild(photo);

    const body = document.createElement("div");
    body.className = "saved-body";

    const titleLink = document.createElement("a");
    titleLink.href = detailsHref;
    titleLink.className = "saved-title-link";
    const title = document.createElement("h3");
    title.textContent = item.title;
    title.title = item.title;
    titleLink.appendChild(title);

    const location = document.createElement("p");
    location.className = "saved-location";
    location.innerHTML = `<span aria-hidden="true">&#128205;</span><span>${item.location || "Unspecified"}</span>`;

    const tagsWrap = document.createElement("div");
    tagsWrap.className = "saved-tags";
    const tags = [item.itemType, item.condition, item.deliveryType].filter(Boolean);
    for (const tagText of tags) {
      const pill = document.createElement("span");
      pill.className = "saved-tag-pill";
      pill.textContent = tagText;
      tagsWrap.appendChild(pill);
    }

    const actions = document.createElement("div");
    actions.className = "saved-actions";
    actions.append(
      createButton("Edit", "secondary-button", () => openItemCategories(item)),
      createButton("Remove", "danger-button", () => removeSavedItem(item.itemId))
    );

    body.append(titleLink, location, tagsWrap, actions);
    card.append(photoLink, body);
    savedGrid.appendChild(card);
  }

  renderPagination(filteredItems.length, totalPages);
}

paginationEl?.addEventListener("click", (event) => {
  const navBtn = event.target.closest("button[data-page-nav]");
  if (!navBtn) return;

  const filteredCount = savedEntries.filter(itemMatchesActiveCategory).length;
  const totalPages = Math.max(1, Math.ceil(filteredCount / ITEMS_PER_PAGE));

  if (navBtn.dataset.pageNav === "prev" && currentPage > 1) {
    currentPage -= 1;
    renderSavedItems();
    savedGrid.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (navBtn.dataset.pageNav === "next" && currentPage < totalPages) {
    currentPage += 1;
    renderSavedItems();
    savedGrid.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

async function removeSavedItem(itemId) {
  if (!currentUser) return;

  const { error } = await supabaseClient
    .from("saved_items")
    .delete()
    .eq("user_id", currentUser.id)
    .eq("item_id", itemId);

  if (error) {
    showStatus(error.message || "Failed to remove saved item.");
    return;
  }

  savedEntries = savedEntries.filter((entry) => entry.itemId !== itemId);
  renderCategories();
  renderSavedItems();
  showStatus("Saved item removed.");
}

function openCategoryDialog(category = null) {
  editingCategoryId = category?.id ?? null;
  document.getElementById("category-dialog-title").textContent =
    category ? "Rename Category" : "Create Category";
  categoryNameInput.value = category?.name || "";
  categoryDialog.showModal();
  categoryNameInput.focus();
}

function closeCategoryDialog() {
  categoryDialog.close();
  editingCategoryId = null;
  categoryNameInput.value = "";
}

async function deleteCategory(categoryId) {
  if (!currentUser) return;

  const { error } = await supabaseClient
    .from("saved_categories")
    .delete()
    .eq("id", categoryId)
    .eq("user_id", currentUser.id);

  if (error) {
    showStatus(error.message || "Failed to delete category.");
    return;
  }

  categories = categories.filter((category) => category.id !== categoryId);

  const affectedEntries = savedEntries.filter((entry) =>
    entry.categoriesId.includes(categoryId)
  );

  for (const entry of affectedEntries) {
    const nextIds = entry.categoriesId.filter((id) => id !== categoryId);
    entry.categoriesId = nextIds;

    await supabaseClient
      .from("saved_items")
      .update({ categories_id: nextIds.length > 0 ? nextIds : null })
      .eq("id", entry.savedId)
      .eq("user_id", currentUser.id);
  }

  if (activeCategory === `custom:${categoryId}`) {
    activeCategory = ALL_CATEGORY;
    currentPage = 1;
  }
  renderCategories();
  renderSavedItems();
  showStatus("Category deleted. Saved items remain saved.");
}

function openItemCategories(item) {
  editingItemId = item.itemId;
  document.getElementById("item-categories-title").textContent = item.title;
  categoryCheckboxes.replaceChildren();

  if (categories.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = "Create a custom category first to organize this item.";
    categoryCheckboxes.appendChild(emptyState);
  } else {
    for (const category of categories) {
      const label = document.createElement("label");
      label.className = "category-checkbox";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = String(category.id);
      checkbox.checked = item.categoriesId.includes(category.id);
      const name = document.createElement("span");
      name.textContent = category.name;
      label.append(checkbox, name);
      categoryCheckboxes.appendChild(label);
    }
  }

  itemCategoriesDialog.showModal();
}

function closeItemCategoriesDialog() {
  itemCategoriesDialog.close();
  editingItemId = null;
}

function renderKeywords() {
  keywordList.replaceChildren();

  if (keywords.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = "No wishlist keywords yet.";
    keywordList.appendChild(emptyState);
    return;
  }

  for (const kwRow of keywords) {
    const chip = document.createElement("div");
    chip.className = "keyword-chip";
    const label = document.createElement("span");
    label.textContent = kwRow.keyword;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", `Remove ${kwRow.keyword}`);
    removeButton.addEventListener("click", async () => {
      if (!currentUser) return;

      const { error } = await supabaseClient
        .from("wishlist_keywords")
        .delete()
        .eq("id", kwRow.id)
        .eq("user_id", currentUser.id);

      if (error) {
        showStatus(error.message || "Failed to remove keyword.");
        return;
      }

      keywords = keywords.filter((candidate) => candidate.id !== kwRow.id);
      renderKeywords();
      showStatus("Keyword removed.");
    });

    chip.append(label, removeButton);
    keywordList.appendChild(chip);
  }
}

async function loadSavedPageData() {
  if (!currentUser) return;

  const [savedRes, categoriesRes, keywordsRes] = await Promise.all([
    supabaseClient
      .from("saved_items")
      .select("id, item_id, categories_id")
      .eq("user_id", currentUser.id)
      .order("id", { ascending: false }),
    supabaseClient
      .from("saved_categories")
      .select("id, name")
      .eq("user_id", currentUser.id)
      .order("id", { ascending: true }),
    supabaseClient
      .from("wishlist_keywords")
      .select("id, keyword")
      .eq("user_id", currentUser.id)
      .order("id", { ascending: true }),
  ]);

  categories = !categoriesRes.error && Array.isArray(categoriesRes.data)
    ? categoriesRes.data.map((row) => ({ id: Number(row.id), name: row.name }))
    : [];

  keywords = !keywordsRes.error && Array.isArray(keywordsRes.data)
    ? keywordsRes.data.map((row) => ({ id: Number(row.id), keyword: row.keyword }))
    : [];

  renderKeywords();

  if (savedRes.error) {
    showStatus(savedRes.error.message || "Failed to load saved items.");
    savedEntries = [];
    renderCategories();
    renderSavedItems();
    return;
  }

  const savedRows = savedRes.data || [];
  const itemIds = [...new Set(savedRows.map((row) => row.item_id).filter(Boolean))];

  if (itemIds.length === 0) {
    savedEntries = [];
    renderCategories();
    renderSavedItems();
    return;
  }

  const { data: itemsData, error: itemsError } = await supabaseClient
    .from("items")
    .select("*")
    .in("id", itemIds);

  if (itemsError) {
    showStatus(itemsError.message || "Failed to load item details.");
    savedEntries = [];
    renderCategories();
    renderSavedItems();
    return;
  }

  const itemMap = new Map((itemsData || []).map((item) => [Number(item.id), item]));

  savedEntries = savedRows
    .map((row) => {
      const item = itemMap.get(Number(row.item_id));
      if (!item) return null;
      const rawCatIds = Array.isArray(row.categories_id) ? row.categories_id : [];

      return {
        savedId: Number(row.id),
        itemId: Number(item.id),
        categoriesId: rawCatIds.map((id) => Number(id)).filter((id) => !Number.isNaN(id)),
        title: item.title || "Untitled Item",
        itemType: item.item_type || "",
        condition: item.condition_type || "",
        deliveryType: item.delivery_type || "",
        location: item.location || "",
        thumbnailUrl: getItemThumbnail(item),
      };
    })
    .filter(Boolean);

  renderCategories();
  renderSavedItems();
}

document.getElementById("create-category-button").addEventListener("click", () => openCategoryDialog());
document.getElementById("close-category-dialog").addEventListener("click", closeCategoryDialog);
document.getElementById("cancel-category-dialog").addEventListener("click", closeCategoryDialog);

categoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser) return;

  const name = categoryNameInput.value.trim();
  if (!name) return;
  const wasEditing = editingCategoryId !== null;

  const builtInNames = new Set(DEFAULT_CATEGORIES.map((label) => normalizeKey(label)));
  const duplicate = builtInNames.has(normalizeKey(name)) ||
    categories.some((category) =>
      normalizeKey(category.name) === normalizeKey(name) &&
      category.id !== editingCategoryId
    );
  if (duplicate) {
    showStatus("A category with that name already exists.");
    return;
  }

  if (wasEditing) {
    const { error } = await supabaseClient
      .from("saved_categories")
      .update({ name })
      .eq("id", editingCategoryId)
      .eq("user_id", currentUser.id);

    if (error) {
      showStatus(error.message || "Failed to rename category.");
      return;
    }

    const category = categories.find((candidate) => candidate.id === editingCategoryId);
    if (category) category.name = name;
  } else {
    const { data, error } = await supabaseClient
      .from("saved_categories")
      .insert({
        user_id: currentUser.id,
        name,
      })
      .select("id, name")
      .single();

    if (error || !data) {
      showStatus(error?.message || "Failed to create category.");
      return;
    }

    categories.push({ id: Number(data.id), name: data.name });
  }

  closeCategoryDialog();
  renderCategories();
  renderSavedItems();
  showStatus(wasEditing ? "Category renamed." : "Category created.");
});

document.getElementById("close-item-categories-dialog")
  .addEventListener("click", closeItemCategoriesDialog);
document.getElementById("cancel-item-categories")
  .addEventListener("click", closeItemCategoriesDialog);

itemCategoriesForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser || editingItemId === null) return;

  const entry = savedEntries.find((item) => item.itemId === editingItemId);
  if (!entry) return;

  const selectedIds = [...categoryCheckboxes.querySelectorAll('input[type="checkbox"]:checked')]
    .map((checkbox) => Number(checkbox.value))
    .filter((id) => !Number.isNaN(id));

  const { error } = await supabaseClient
    .from("saved_items")
    .update({ categories_id: selectedIds.length > 0 ? selectedIds : null })
    .eq("id", entry.savedId)
    .eq("user_id", currentUser.id);

  if (error) {
    showStatus(error.message || "Failed to update item categories.");
    return;
  }

  entry.categoriesId = selectedIds;
  closeItemCategoriesDialog();
  renderCategories();
  renderSavedItems();
  showStatus("Saved item categories updated.");
});

document.getElementById("keyword-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser) return;

  const input = document.getElementById("keyword-input");
  const keyword = input.value.trim();
  if (!keyword) return;

  if (keywords.some((candidate) =>
    normalizeKey(candidate.keyword) === normalizeKey(keyword)
  )) {
    showStatus("That wishlist keyword already exists.");
    return;
  }

  const { data, error } = await supabaseClient
    .from("wishlist_keywords")
    .insert({
      user_id: currentUser.id,
      keyword,
    })
    .select("id, keyword")
    .single();

  if (error || !data) {
    showStatus(error?.message || "Failed to add keyword.");
    return;
  }

  keywords.push({ id: Number(data.id), keyword: data.keyword });
  input.value = "";
  renderKeywords();
  showStatus("Wishlist keyword added.");
});

async function initSavedPage() {
  renderKeywords();

  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error || !session?.user) {
    window.location.replace(LOGIN_URL);
    return;
  }

  currentUser = session.user;
  await ensureUserProfile(currentUser);
  await loadSavedPageData();
}

initSavedPage();