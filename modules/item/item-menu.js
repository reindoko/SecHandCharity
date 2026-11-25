import { supabaseClient } from "/assets/js/supabase-client.js";
import { ensureUserProfile } from "/modules/account/auth.js";

const LOGIN_URL = "/modules/account/login.html";
const ITEM_EDIT_URL = "./item-post.html";
const ITEM_DETAILS_URL = "./item-details.html";
const DEFAULT_THUMBNAIL = "/assets/images/icon-item-default.png";
const DELETE_CONFIRM_TIMEOUT_MS = 3000;
const ITEMS_PER_PAGE = 10;

const STATUS_OPTIONS = [
  { value: "available", label: "Available" },
  { value: "drafted", label: "Drafted" },
  { value: "reserved", label: "Reserved" },
  { value: "completed", label: "Completed" },
];

const itemsListEl = document.getElementById("items-list");
const paginationEl = document.getElementById("items-pagination");
const pageErrorEl = document.getElementById("items-page-error");

let currentUser = null;
let userItems = [];
let currentPage = 1;
const armedDeleteIds = new Map();

function setPageError(msg = "") {
  if (pageErrorEl) pageErrorEl.textContent = msg;
}

function normalizeStatus(status) {
  const clean = (status || "drafted").toLowerCase().trim();
  if (STATUS_OPTIONS.some((opt) => opt.value === clean)) {
    return clean;
  }
  return "drafted";
}

function getStatusLabel(status) {
  const normalized = normalizeStatus(status);
  return STATUS_OPTIONS.find((opt) => opt.value === normalized)?.label || "Drafted";
}

function getStatusTriggerClass(status) {
  return `status-dropdown-trigger--${normalizeStatus(status)}`;
}

function getThumbnailUrl(item) {
  if (Array.isArray(item.photo_urls) && item.photo_urls.length > 0 && item.photo_urls[0]) {
    return item.photo_urls[0];
  }
  return DEFAULT_THUMBNAIL;
}

function closeAllStatusMenus(exceptDropdownEl = null) {
  itemsListEl?.querySelectorAll(".status-dropdown.is-open").forEach((dropdown) => {
    if (dropdown === exceptDropdownEl) return;
    dropdown.classList.remove("is-open");
    dropdown.querySelector(".status-dropdown-menu")?.classList.add("is-hidden");
    dropdown.querySelector(".status-dropdown-trigger")?.setAttribute("aria-expanded", "false");
  });
}

function clearDeleteArm(itemId, buttonEl) {
  const timer = armedDeleteIds.get(itemId);
  if (timer) {
    clearTimeout(timer);
    armedDeleteIds.delete(itemId);
  }
  if (buttonEl) {
    buttonEl.classList.remove("is-confirming");
    buttonEl.title = "Delete item";
    buttonEl.setAttribute("aria-label", "Delete item");
    buttonEl.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
        <path d="M10 11v6"></path>
        <path d="M14 11v6"></path>
      </svg>
    `;
  }
}

function armDeleteButton(itemId, buttonEl) {
  clearDeleteArm(itemId);
  buttonEl.classList.add("is-confirming");
  buttonEl.textContent = "Confirm?";
  buttonEl.title = "Click again to delete";
  buttonEl.setAttribute("aria-label", "Click again to confirm deletion");

  const timer = setTimeout(() => {
    clearDeleteArm(itemId, buttonEl);
  }, DELETE_CONFIRM_TIMEOUT_MS);

  armedDeleteIds.set(itemId, timer);
}

function buildTagPills(item) {
  const tags = [
    item.item_type,
    item.condition_type,
    item.delivery_type,
  ].filter((tag) => typeof tag === "string" && tag.trim() !== "");

  return `
    <div class="item-tags">
      ${tags.map((tag) => `<span class="item-tag-pill">${escapeHtml(tag.trim())}</span>`).join("")}
    </div>
  `;
}

function buildStatusDropdown(item) {
  const status = normalizeStatus(item.status);
  const label = getStatusLabel(status);
  const safeId = escapeHtml(item.id);

  const optionsHtml = STATUS_OPTIONS.map((opt) => {
    const isSelected = opt.value === status;
    return `
      <button
        type="button"
        role="option"
        aria-selected="${isSelected}"
        class="status-dropdown-option ${isSelected ? "is-selected" : ""}"
        data-action="select-status"
        data-id="${safeId}"
        data-value="${opt.value}"
      >
        <span>${opt.label}</span>
        ${isSelected ? `<span aria-hidden="true">✓</span>` : ""}
      </button>
    `;
  }).join("");

  return `
    <div class="item-status-col">
      <div class="status-dropdown" data-status-dropdown>
        <button
          type="button"
          class="status-dropdown-trigger ${getStatusTriggerClass(status)}"
          data-action="toggle-status"
          data-id="${safeId}"
          aria-haspopup="listbox"
          aria-expanded="false"
          aria-label="Item status: ${label}"
        >
          <span>${label}</span>
          <svg class="status-dropdown-caret" viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="5 8 10 13 15 8"></polyline>
          </svg>
        </button>
        <div class="status-dropdown-menu is-hidden" role="listbox">
          ${optionsHtml}
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderPagination(totalPages) {
  if (!paginationEl) return;

  if (userItems.length <= ITEMS_PER_PAGE || totalPages <= 1) {
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
    <span class="items-pagination-label">Page ${currentPage}</span>
    <div class="pagination-slot pagination-slot--right">
      ${showNext ? `<button type="button" class="page-nav-btn" data-page-nav="next">Next</button>` : ""}
    </div>
  `;
}

function renderItems() {
  if (!itemsListEl) return;

  if (!userItems.length) {
    currentPage = 1;
    itemsListEl.innerHTML = `<p class="items-empty-state">No posted items yet. Click <strong>+ New Item</strong> to create one.</p>`;
    renderPagination(0);
    return;
  }

  const totalPages = Math.max(1, Math.ceil(userItems.length / ITEMS_PER_PAGE));
  if (currentPage > totalPages) {
    currentPage = totalPages;
  }

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageItems = userItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  itemsListEl.innerHTML = pageItems
    .map((item, idx) => {
      const globalIdx = startIndex + idx;
      const displayNumber = userItems.length - globalIdx;
      const status = normalizeStatus(item.status);
      const thumbUrl = getThumbnailUrl(item);
      const detailsHref = `${ITEM_DETAILS_URL}?id=${encodeURIComponent(item.id)}`;
      const editHref = `${ITEM_EDIT_URL}?id=${encodeURIComponent(item.id)}`;
      const showCompleteBtn = status === "available" || status === "reserved";
      const safeTitle = escapeHtml(item.title || "Untitled Item");

      return `
        <article class="item-row-card" data-item-id="${escapeHtml(item.id)}">
          <span class="item-index">${displayNumber}</span>

          <a href="${detailsHref}" class="item-thumb-link" aria-label="View ${safeTitle} details">
            <img src="${escapeHtml(thumbUrl)}" alt="${safeTitle} thumbnail">
          </a>

          <div class="item-main-info">
            <a href="${detailsHref}" class="item-title-link" title="${safeTitle}">${safeTitle}</a>
            <span class="item-location">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
              <span>${escapeHtml(item.location || "Unspecified")}</span>
            </span>
          </div>

          ${buildStatusDropdown(item)}

          ${buildTagPills(item)}

          <div class="item-actions">
            <a
              href="${editHref}"
              class="item-action-btn item-action-btn--edit"
              title="Edit item"
              aria-label="Edit item"
            >
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
            </a>

            ${
              showCompleteBtn
                ? `
                  <button
                    type="button"
                    class="item-action-btn item-action-btn--complete"
                    data-action="complete"
                    data-id="${escapeHtml(item.id)}"
                    title="Mark as completed"
                    aria-label="Mark as completed"
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </button>
                `
                : ""
            }

            <button
              type="button"
              class="item-action-btn item-action-btn--delete"
              data-action="delete"
              data-id="${escapeHtml(item.id)}"
              title="Delete item"
              aria-label="Delete item"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                <path d="M10 11v6"></path>
                <path d="M14 11v6"></path>
              </svg>
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  renderPagination(totalPages);
}

paginationEl?.addEventListener("click", (event) => {
  const navBtn = event.target.closest("button[data-page-nav]");
  if (!navBtn) return;

  const totalPages = Math.max(1, Math.ceil(userItems.length / ITEMS_PER_PAGE));

  if (navBtn.dataset.pageNav === "prev" && currentPage > 1) {
    currentPage -= 1;
    renderItems();
    itemsListEl?.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (navBtn.dataset.pageNav === "next" && currentPage < totalPages) {
    currentPage += 1;
    renderItems();
    itemsListEl?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

async function updateItemStatus(itemId, nextStatus) {
  if (!currentUser) return;
  setPageError("");

  const normalized = normalizeStatus(nextStatus);
  const { error } = await supabaseClient
    .from("items")
    .update({ status: normalized })
    .eq("id", itemId)
    .eq("donor_id", currentUser.id);

  if (error) {
    setPageError(error.message || "Failed to update item status.");
    await loadUserItems();
    return;
  }

  userItems = userItems.map((item) =>
    String(item.id) === String(itemId) ? { ...item, status: normalized } : item
  );
  renderItems();
}

async function deleteItem(itemId, buttonEl) {
  if (!currentUser) return;
  setPageError("");

  clearDeleteArm(itemId);
  if (buttonEl) buttonEl.disabled = true;

  const { error } = await supabaseClient
    .from("items")
    .delete()
    .eq("id", itemId)
    .eq("donor_id", currentUser.id);

  if (error) {
    if (buttonEl) buttonEl.disabled = false;
    setPageError(error.message || "Failed to delete item.");
    return;
  }

  userItems = userItems.filter((item) => String(item.id) !== String(itemId));
  renderItems();
}

document.addEventListener("click", (event) => {
  if (!event.target.closest("[data-status-dropdown]")) {
    closeAllStatusMenus();
  }
});

itemsListEl?.addEventListener("click", async (event) => {
  const toggleBtn = event.target.closest('button[data-action="toggle-status"]');
  if (toggleBtn) {
    event.stopPropagation();
    const dropdown = toggleBtn.closest("[data-status-dropdown]");
    const menu = dropdown?.querySelector(".status-dropdown-menu");
    if (!dropdown || !menu) return;

    const willOpen = menu.classList.contains("is-hidden");
    closeAllStatusMenus(willOpen ? dropdown : null);
    menu.classList.toggle("is-hidden", !willOpen);
    dropdown.classList.toggle("is-open", willOpen);
    toggleBtn.setAttribute("aria-expanded", String(willOpen));
    return;
  }

  const optionBtn = event.target.closest('button[data-action="select-status"]');
  if (optionBtn) {
    event.stopPropagation();
    closeAllStatusMenus();
    await updateItemStatus(optionBtn.dataset.id, optionBtn.dataset.value);
    return;
  }

  const btn = event.target.closest("button[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  const itemId = btn.dataset.id;

  if (action === "complete") {
    await updateItemStatus(itemId, "completed");
    return;
  }

  if (action === "delete") {
    if (!armedDeleteIds.has(itemId)) {
      armDeleteButton(itemId, btn);
      return;
    }
    await deleteItem(itemId, btn);
  }
});

async function loadUserItems() {
  if (!currentUser) return;
  setPageError("");

  const { data, error } = await supabaseClient
    .from("items")
    .select("*")
    .eq("donor_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    setPageError(error.message || "Failed to load items.");
    if (itemsListEl) {
      itemsListEl.innerHTML = `<p class="items-empty-state">Unable to load items right now.</p>`;
    }
    renderPagination(0);
    return;
  }

  userItems = data || [];
  renderItems();
}

async function initItemMenuPage() {
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error || !session?.user) {
    window.location.replace(LOGIN_URL);
    return;
  }

  currentUser = session.user;
  await ensureUserProfile(currentUser);
  await loadUserItems();
}

initItemMenuPage();