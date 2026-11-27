const SAVED_KEY = "sechandcharity_saved";
const CATEGORIES_KEY = "sechandcharity_categories";
const LEGACY_ALBUMS_KEY = "sechandcharity_albums";
const KEYWORDS_KEY = "sechandcharity_wishlist_keywords";
const ALL_CATEGORY = "all";

// Demo saved items keep the interface working until saved_items and items are connected.
const demoSavedItems = [
  { id: 1, title: "Blue Denim Jacket", itemType: "Clothing", location: "Johor Bahru", condition: "Good" },
  { id: 2, title: "Programming Textbook", itemType: "Books", location: "Kuala Lumpur", condition: "Like new" },
  { id: 3, title: "Desk Lamp", itemType: "Electronics", location: "Ipoh", condition: "Good" },
  { id: 4, title: "Wooden Study Table", itemType: "Furniture", location: "Melaka City", condition: "Used" }
];

const savedGrid = document.getElementById("saved-grid");
const categoryGrid = document.getElementById("category-grid");
const keywordList = document.getElementById("keyword-list");
const statusMessage = document.getElementById("status-message");
const categoryDialog = document.getElementById("category-dialog");
const categoryForm = document.getElementById("category-form");
const categoryNameInput = document.getElementById("category-name");
const itemCategoriesDialog = document.getElementById("item-categories-dialog");
const categoryCheckboxes = document.getElementById("category-checkboxes");
const itemCategoriesForm = document.getElementById("item-categories-form");

let savedItems = JSON.parse(localStorage.getItem(SAVED_KEY) || "[1, 2, 3, 4]");
// Read the former album key once so existing browser demo data remains available as categories.
let categories = JSON.parse(
  localStorage.getItem(CATEGORIES_KEY) ||
  localStorage.getItem(LEGACY_ALBUMS_KEY) ||
  "[]"
);
let keywords = JSON.parse(localStorage.getItem(KEYWORDS_KEY) || "[\"laptop\", \"textbook\"]");
let activeCategory = ALL_CATEGORY;
let editingCategoryId = null;
let editingItemId = null;

function saveState() {
  // These local stores can later be replaced by saved_items, saved_categories,
  // saved_category_items, and wishlist_keywords Supabase queries.
  localStorage.setItem(SAVED_KEY, JSON.stringify(savedItems));
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
  localStorage.setItem(KEYWORDS_KEY, JSON.stringify(keywords));
}

function getItemById(itemId) {
  return demoSavedItems.find((item) => item.id === itemId);
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

  const allCount = demoSavedItems.filter((item) => savedItems.includes(item.id)).length;
  categoryGrid.appendChild(createCategoryCard({
    key: ALL_CATEGORY,
    name: "All Saved Items",
    count: allCount
  }));

  const builtInCategories = [...new Set(demoSavedItems.map((item) => item.itemType))];
  for (const name of builtInCategories) {
    const count = demoSavedItems.filter((item) =>
      savedItems.includes(item.id) && item.itemType === name
    ).length;
    categoryGrid.appendChild(createCategoryCard({
      key: `type:${name}`,
      name,
      count
    }));
  }

  for (const category of categories) {
    const count = category.itemIds.filter((itemId) => savedItems.includes(itemId)).length;
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
    return item.itemType === activeCategory.slice("type:".length);
  }

  const categoryId = Number(activeCategory.slice("custom:".length));
  const category = categories.find((candidate) => candidate.id === categoryId);
  return Boolean(category && category.itemIds.includes(item.id));
}

function renderSavedItems() {
  savedGrid.replaceChildren();
  const visibleItems = demoSavedItems.filter((item) =>
    savedItems.includes(item.id) && itemMatchesActiveCategory(item)
  );
  const activeCategoryLabel = document.getElementById("active-category-label");

  if (activeCategory === ALL_CATEGORY) {
    activeCategoryLabel.textContent = "All saved items";
  } else if (activeCategory.startsWith("type:")) {
    activeCategoryLabel.textContent = activeCategory.slice("type:".length);
  } else {
    const category = categories.find(
      (candidate) => candidate.id === Number(activeCategory.slice("custom:".length))
    );
    activeCategoryLabel.textContent = category ? category.name : "All saved items";
  }

  if (visibleItems.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = "No saved items in this category.";
    savedGrid.appendChild(emptyState);
    return;
  }

  for (const item of visibleItems) {
    const card = document.createElement("article");
    card.className = "saved-card";

    const photo = document.createElement("div");
    photo.className = "saved-photo";
    photo.textContent = item.title.charAt(0);

    const body = document.createElement("div");
    body.className = "saved-body";
    const title = document.createElement("h3");
    title.textContent = item.title;
    const location = document.createElement("p");
    location.textContent = `Location: ${item.location}`;
    const details = document.createElement("p");
    details.textContent = `${item.itemType} · ${item.condition}`;

    const actions = document.createElement("div");
    actions.className = "saved-actions";
    actions.append(
      createButton("Edit Categories", "secondary-button", () => openItemCategories(item)),
      createButton("Remove", "danger-button", () => removeSavedItem(item.id))
    );

    body.append(title, location, details, actions);
    card.append(photo, body);
    savedGrid.appendChild(card);
  }
}

function removeSavedItem(itemId) {
  savedItems = savedItems.filter((savedItemId) => savedItemId !== itemId);
  categories = categories.map((category) => ({
    ...category,
    itemIds: category.itemIds.filter((categoryItemId) => categoryItemId !== itemId)
  }));
  saveState();
  renderCategories();
  renderSavedItems();
  showStatus("Saved item removed.");
}

function openCategoryDialog(category = null) {
  editingCategoryId = category?.id || null;
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

function deleteCategory(categoryId) {
  categories = categories.filter((category) => category.id !== categoryId);
  if (activeCategory === `custom:${categoryId}`) activeCategory = ALL_CATEGORY;
  saveState();
  renderCategories();
  renderSavedItems();
  showStatus("Category deleted. Saved items remain saved.");
}

function openItemCategories(item) {
  editingItemId = item.id;
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
      checkbox.checked = category.itemIds.includes(item.id);
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

  for (const keyword of keywords) {
    const chip = document.createElement("div");
    chip.className = "keyword-chip";
    const label = document.createElement("span");
    label.textContent = keyword;
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", `Remove ${keyword}`);
    removeButton.addEventListener("click", () => {
      keywords = keywords.filter((candidate) => candidate !== keyword);
      saveState();
      renderKeywords();
      showStatus("Keyword removed.");
    });
    chip.append(label, removeButton);
    keywordList.appendChild(chip);
  }
}

document.getElementById("create-category-button").addEventListener("click", () => openCategoryDialog());
document.getElementById("close-category-dialog").addEventListener("click", closeCategoryDialog);
document.getElementById("cancel-category-dialog").addEventListener("click", closeCategoryDialog);

categoryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = categoryNameInput.value.trim();
  if (!name) return;
  const wasEditing = editingCategoryId !== null;

  const builtInNames = new Set(demoSavedItems.map((item) => item.itemType.toLowerCase()));
  const duplicate = builtInNames.has(name.toLowerCase()) ||
    categories.some((category) =>
      category.name.toLowerCase() === name.toLowerCase() &&
      category.id !== editingCategoryId
    );
  if (duplicate) {
    showStatus("A category with that name already exists.");
    return;
  }

  if (wasEditing) {
    const category = categories.find((candidate) => candidate.id === editingCategoryId);
    category.name = name;
  } else {
    categories.push({
      id: Date.now(),
      name,
      itemIds: []
    });
  }

  saveState();
  closeCategoryDialog();
  renderCategories();
  renderSavedItems();
  showStatus(wasEditing ? "Category renamed." : "Category created.");
});

document.getElementById("close-item-categories-dialog")
  .addEventListener("click", closeItemCategoriesDialog);
document.getElementById("cancel-item-categories")
  .addEventListener("click", closeItemCategoriesDialog);

itemCategoriesForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const selectedIds = new Set(
    [...categoryCheckboxes.querySelectorAll('input[type="checkbox"]:checked')]
      .map((checkbox) => Number(checkbox.value))
  );

  categories = categories.map((category) => {
    const itemIds = category.itemIds.filter((itemId) => itemId !== editingItemId);
    if (selectedIds.has(category.id)) itemIds.push(editingItemId);
    return { ...category, itemIds };
  });

  saveState();
  closeItemCategoriesDialog();
  renderCategories();
  renderSavedItems();
  showStatus("Saved item categories updated.");
});

document.getElementById("keyword-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.getElementById("keyword-input");
  const keyword = input.value.trim();
  if (!keyword) return;

  if (keywords.some((candidate) =>
    candidate.toLowerCase() === keyword.toLowerCase()
  )) {
    showStatus("That wishlist keyword already exists.");
    return;
  }

  keywords.push(keyword);
  input.value = "";
  saveState();
  renderKeywords();
  showStatus("Wishlist keyword added.");
});

renderCategories();
renderSavedItems();
renderKeywords();
