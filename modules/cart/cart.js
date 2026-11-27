const CART_KEY = "sechandcharity_cart";

// Demo catalogue data keeps this module usable before the live items table is connected.
const demoItems = [
  { id: 1, title: "Blue Denim Jacket", itemType: "Clothing", location: "Johor Bahru", condition: "Good" },
  { id: 2, title: "Programming Textbook", itemType: "Books", location: "Kuala Lumpur", condition: "Like new" },
  { id: 3, title: "Desk Lamp", itemType: "Electronics", location: "Ipoh", condition: "Good" },
  { id: 4, title: "Wooden Study Table", itemType: "Furniture", location: "Melaka City", condition: "Used" },
  { id: 5, title: "Digital Camera", itemType: "Electronics", location: "Petaling Jaya", condition: "Good" },
  { id: 6, title: "Children's Story Books", itemType: "Books", location: "Shah Alam", condition: "Like new" }
];

const itemGrid = document.getElementById("item-grid");
const cartItemsElement = document.getElementById("cart-items");
const cartCount = document.getElementById("cart-count");
const searchInput = document.getElementById("cart-search");
const sidebar = document.getElementById("cart-sidebar");
const backdrop = document.getElementById("sidebar-backdrop");
const statusMessage = document.getElementById("status-message");

let cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]");

function saveCart() {
  // This local store is a temporary front-end state; replace it with Supabase queries later.
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  renderCart();
}

function getItemById(itemId) {
  return demoItems.find((item) => item.id === itemId);
}

function showStatus(message) {
  statusMessage.textContent = message;
  statusMessage.classList.add("is-visible");
  window.clearTimeout(showStatus.timeoutId);
  showStatus.timeoutId = window.setTimeout(() => {
    statusMessage.classList.remove("is-visible");
  }, 2200);
}

function renderItems() {
  const query = searchInput.value.trim().toLowerCase();
  const visibleItems = demoItems.filter((item) => {
    const searchableText = `${item.title} ${item.location} ${item.itemType}`.toLowerCase();
    return searchableText.includes(query);
  });

  itemGrid.replaceChildren();

  if (visibleItems.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = "No items match your search.";
    itemGrid.appendChild(emptyState);
    return;
  }

  for (const item of visibleItems) {
    const card = document.createElement("article");
    card.className = "catalogue-card";

    const photo = document.createElement("div");
    photo.className = "item-photo";
    photo.textContent = item.title.charAt(0);

    const body = document.createElement("div");
    body.className = "card-body";

    const title = document.createElement("h3");
    title.textContent = item.title;

    const location = document.createElement("p");
    location.textContent = `Location: ${item.location}`;

    const details = document.createElement("p");
    details.textContent = `${item.itemType} · ${item.condition}`;

    const isAdded = cart.includes(item.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = isAdded ? "secondary-button" : "primary-button";
    button.textContent = isAdded ? "Added to Cart" : "Add to Cart";
    button.disabled = isAdded;
    button.addEventListener("click", () => addToCart(item.id));

    body.append(title, location, details, button);
    card.append(photo, body);
    itemGrid.appendChild(card);
  }
}

function renderCart() {
  cartCount.textContent = String(cart.length);
  cartItemsElement.replaceChildren();

  if (cart.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = "Your cart is empty.";
    cartItemsElement.appendChild(emptyState);
  } else {
    for (const itemId of cart) {
      const item = getItemById(itemId);
      if (!item) continue;

      const row = document.createElement("article");
      row.className = "cart-item";

      const photo = document.createElement("div");
      photo.className = "cart-item-photo";
      photo.textContent = item.title.charAt(0);

      const content = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = item.title;
      const location = document.createElement("p");
      location.textContent = item.location;
      content.append(title, location);

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "remove-button";
      removeButton.setAttribute("aria-label", `Remove ${item.title}`);
      removeButton.textContent = "×";
      removeButton.addEventListener("click", () => removeFromCart(item.id));

      row.append(photo, content, removeButton);
      cartItemsElement.appendChild(row);
    }
  }

  renderItems();
}

function addToCart(itemId) {
  if (!cart.includes(itemId)) {
    cart.push(itemId);
    saveCart();
    showStatus("Item added to cart.");
  }
}

function removeFromCart(itemId) {
  cart = cart.filter((cartItemId) => cartItemId !== itemId);
  saveCart();
  showStatus("Item removed.");
}

function openCart() {
  sidebar.classList.add("is-open");
  backdrop.classList.add("is-visible");
}

function closeCart() {
  sidebar.classList.remove("is-open");
  backdrop.classList.remove("is-visible");
}

searchInput.addEventListener("input", renderItems);
document.getElementById("open-cart-button").addEventListener("click", openCart);
document.getElementById("close-cart-button").addEventListener("click", closeCart);
backdrop.addEventListener("click", closeCart);

document.getElementById("cancel-all-button").addEventListener("click", () => {
  if (cart.length === 0) return;
  cart = [];
  saveCart();
  showStatus("Cart cleared.");
});

document.getElementById("continue-button").addEventListener("click", () => {
  showStatus(cart.length ? "Cart saved for this browser." : "Add an item before continuing.");
});

renderCart();
