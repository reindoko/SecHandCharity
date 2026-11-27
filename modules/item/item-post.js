import { supabaseClient } from "/assets/js/supabase-client.js";
import { ensureUserProfile } from "/modules/account/auth.js";
import { attachLocationFilter } from "/assets/js/location.js";

const LOGIN_URL = "/modules/account/login.html";
const ITEM_MENU_URL = "./item-menu.html";
const STORAGE_BUCKET = "photos";
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_EXTRA_PHOTOS = 10;
const MAX_TITLE_CHARS = 120;
const MAX_DESCRIPTION_CHARS = 2000;

const CATEGORY_OPTIONS = {
  item_type: [
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
  ],
  condition_type: [
    "New",
    "Used",
    "Damaged",
    "Old",
  ],
  delivery_type: [
    "Pickup",
    "Dropoff",
    "Handover",
  ],
};

const headingEl = document.getElementById("post-page-heading");
const formEl = document.getElementById("item-post-form");

const errors = {
  thumbnail: document.getElementById("thumbnail-error"),
  extraPhotos: document.getElementById("extra-photos-error"),
  title: document.getElementById("title-error"),
  description: document.getElementById("description-error"),
  location: document.getElementById("location-error"),
  item_type: document.getElementById("item-type-error"),
  condition_type: document.getElementById("condition-type-error"),
  delivery_type: document.getElementById("delivery-type-error"),
  form: document.getElementById("post-form-error"),
};

const thumbnailDropzoneEl = document.getElementById("thumbnail-dropzone");
const thumbnailInputEl = document.getElementById("thumbnail-input");
const thumbnailPlaceholderEl = document.getElementById("thumbnail-placeholder");
const thumbnailPreviewEl = document.getElementById("thumbnail-preview");
const removeThumbnailBtnEl = document.getElementById("remove-thumbnail-btn");

const extraPhotosRowEl = document.getElementById("extra-photos-row");
const extraPhotosListEl = document.getElementById("extra-photos-list");
const extraAddSlotEl = document.getElementById("extra-add-slot");
const extraPhotosInputEl = document.getElementById("extra-photos-input");

const titleInputEl = document.getElementById("item-title");
const descriptionInputEl = document.getElementById("item-description");
const locationInputEl = document.getElementById("item-location");
const locationArrowBtnEl = document.getElementById("item-location-arrow-btn");
const locationMenuEl = document.getElementById("item-location-menu");

const createActionsEl = document.getElementById("create-actions");
const editActionsEl = document.getElementById("edit-actions");
const saveDraftBtnEl = document.getElementById("save-draft-btn");
const publishItemBtnEl = document.getElementById("publish-item-btn");
const saveChangesBtnEl = document.getElementById("save-changes-btn");

const params = new URLSearchParams(window.location.search);
const editingItemId = params.get("id")?.trim() || "";
const isEditMode = Boolean(editingItemId);

let currentUser = null;
let existingItem = null;

// Selected category values keyed by field name
const selectedCategories = {
  item_type: "",
  condition_type: "",
  delivery_type: "",
};

// Thumbnail state
let thumbnailFile = null;
let thumbnailObjectUrl = "";
let existingThumbnailUrl = "";

// Extra photos state (up to 10)
let extraPhotos = [];
let isSubmitting = false;

function getNormalizedStatus(item) {
  return String(item?.status || "").trim().toLowerCase();
}

function useSaveChangesButtons() {
  if (!isEditMode || !existingItem) return false;
  return getNormalizedStatus(existingItem) !== "drafted";
}

function setFieldError(key, message = "") {
  const el = errors[key];
  if (el) el.textContent = message;
}

function clearAllErrors() {
  Object.keys(errors).forEach((key) => setFieldError(key, ""));
}

function setBusy(busy) {
  isSubmitting = busy;
  [saveDraftBtnEl, publishItemBtnEl, saveChangesBtnEl, removeThumbnailBtnEl].forEach((btn) => {
    if (btn) btn.disabled = busy;
  });
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function closeAllCategoryMenus(exceptDropdownEl = null) {
  document.querySelectorAll(".category-dropdown.is-open").forEach((dropdown) => {
    if (dropdown === exceptDropdownEl) return;
    dropdown.classList.remove("is-open");
    dropdown.querySelector(".category-menu")?.classList.add("is-hidden");
    dropdown.querySelector(".category-trigger")?.setAttribute("aria-expanded", "false");
  });
}

function getOptionsForField(fieldKey, currentValue) {
  const base = Array.isArray(CATEGORY_OPTIONS[fieldKey]) ? [...CATEGORY_OPTIONS[fieldKey]] : [];
  if (currentValue && !base.includes(currentValue)) {
    base.unshift(currentValue);
  }
  return base;
}

function renderCategoryDropdown(fieldKey) {
  const dropdownEl = document.querySelector(`[data-category-dropdown="${fieldKey}"]`);
  if (!dropdownEl) return;

  const triggerEl = dropdownEl.querySelector(".category-trigger");
  const triggerTextEl = dropdownEl.querySelector(".category-trigger-text");
  const menuEl = dropdownEl.querySelector(".category-menu");
  if (!triggerEl || !triggerTextEl || !menuEl) return;

  const placeholder = triggerEl.dataset.placeholder || "Select...";
  const currentValue = selectedCategories[fieldKey] || "";

  triggerTextEl.textContent = currentValue || placeholder;
  triggerEl.classList.toggle("has-value", Boolean(currentValue));

  const options = getOptionsForField(fieldKey, currentValue);

  if (options.length === 0) {
    menuEl.innerHTML = `<div class="location-option-empty">No options configured</div>`;
    return;
  }

  menuEl.innerHTML = options
    .map((opt) => {
      const isSelected = opt === currentValue;
      return `
        <button
          type="button"
          role="option"
          aria-selected="${isSelected}"
          class="category-option ${isSelected ? "is-selected" : ""}"
          data-category-field="${fieldKey}"
          data-category-value="${escapeHtml(opt)}"
        >
          <span>${escapeHtml(opt)}</span>
          ${isSelected ? `<span aria-hidden="true">✓</span>` : ""}
        </button>
      `;
    })
    .join("");
}

function renderAllCategoryDropdowns() {
  Object.keys(selectedCategories).forEach((fieldKey) => {
    renderCategoryDropdown(fieldKey);
  });
}

function setCategoryValue(fieldKey, value) {
  if (!(fieldKey in selectedCategories)) return;
  selectedCategories[fieldKey] = value || "";
  setFieldError(fieldKey, "");
  renderCategoryDropdown(fieldKey);
}

function revokeThumbnailObjectUrl() {
  if (thumbnailObjectUrl) {
    URL.revokeObjectURL(thumbnailObjectUrl);
    thumbnailObjectUrl = "";
  }
}

function revokeExtraFileUrls() {
  extraPhotos.forEach((entry) => {
    if (entry.kind === "file" && entry.previewUrl) {
      URL.revokeObjectURL(entry.previewUrl);
    }
  });
}

function renderThumbnailPreview() {
  if (!thumbnailPreviewEl || !thumbnailPlaceholderEl || !removeThumbnailBtnEl || !thumbnailDropzoneEl) {
    return;
  }

  if (thumbnailFile) {
    revokeThumbnailObjectUrl();
    thumbnailObjectUrl = URL.createObjectURL(thumbnailFile);
    thumbnailPreviewEl.src = thumbnailObjectUrl;
    thumbnailPreviewEl.classList.remove("is-hidden");
    thumbnailPlaceholderEl.classList.add("is-hidden");
    removeThumbnailBtnEl.classList.remove("is-hidden");
    thumbnailDropzoneEl.classList.add("photo-box--filled");
    return;
  }

  revokeThumbnailObjectUrl();

  if (existingThumbnailUrl) {
    thumbnailPreviewEl.src = existingThumbnailUrl;
    thumbnailPreviewEl.classList.remove("is-hidden");
    thumbnailPlaceholderEl.classList.add("is-hidden");
    removeThumbnailBtnEl.classList.remove("is-hidden");
    thumbnailDropzoneEl.classList.add("photo-box--filled");
    return;
  }

  thumbnailPreviewEl.removeAttribute("src");
  thumbnailPreviewEl.classList.add("is-hidden");
  thumbnailPlaceholderEl.classList.remove("is-hidden");
  removeThumbnailBtnEl.classList.add("is-hidden");
  thumbnailDropzoneEl.classList.remove("photo-box--filled");
}

function renderExtraPhotos({ scrollToEnd = false } = {}) {
  if (extraPhotosListEl) {
    extraPhotosListEl.innerHTML = extraPhotos
      .map((entry, index) => {
        const src = entry.kind === "file" ? entry.previewUrl : entry.url;
        return `
          <div class="photo-slot-col">
            <div class="photo-box photo-box--filled">
              <img src="${src}" alt="Additional photo ${index + 1}" class="photo-box-img">
              <button
                type="button"
                class="photo-remove-circle"
                data-remove-extra="${index}"
                aria-label="Remove photo ${index + 1}"
                title="Remove photo"
              >
                <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
                  <line x1="3.5" y1="3.5" x2="10.5" y2="10.5"></line>
                  <line x1="10.5" y1="3.5" x2="3.5" y2="10.5"></line>
                </svg>
              </button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  if (extraAddSlotEl) {
    extraAddSlotEl.classList.toggle("is-hidden", extraPhotos.length >= MAX_EXTRA_PHOTOS);
  }

  if (scrollToEnd && extraPhotosRowEl) {
    extraPhotosRowEl.scrollTo({
      left: extraPhotosRowEl.scrollWidth,
      behavior: "smooth",
    });
  }
}

function validateImageFile(file) {
  if (!file.type.startsWith("image/")) {
    return `"${file.name}" is not a valid image file.`;
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return `"${file.name}" exceeds the 10 MB limit.`;
  }
  return "";
}

async function uploadImage(file, slotFolder) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const uniquePart = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `${currentUser.id}/items/${slotFolder}/${uniquePart}.${ext || "jpg"}`;

  const { error: uploadError } = await supabaseClient.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { upsert: false });

  if (uploadError) {
    throw new Error(uploadError.message || "Failed to upload image.");
  }

  const { data } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function buildFinalPhotoUrls() {
  const urls = [];

  if (thumbnailFile) {
    const thumbUrl = await uploadImage(thumbnailFile, "thumbnail");
    urls.push(thumbUrl);
  } else if (existingThumbnailUrl) {
    urls.push(existingThumbnailUrl);
  }

  for (const entry of extraPhotos) {
    if (entry.kind === "url") {
      urls.push(entry.url);
    } else if (entry.kind === "file") {
      const uploadedUrl = await uploadImage(entry.file, "gallery");
      urls.push(uploadedUrl);
    }
  }

  return urls;
}

function validateForm({ requireTitle = true } = {}) {
  let valid = true;

  const title = titleInputEl?.value.trim() || "";
  if (requireTitle && !title) {
    setFieldError("title", "Please enter an item title.");
    if (valid) titleInputEl?.focus();
    valid = false;
  } else if (title.length > MAX_TITLE_CHARS) {
    setFieldError("title", `Title must be ${MAX_TITLE_CHARS} characters or fewer.`);
    if (valid) titleInputEl?.focus();
    valid = false;
  }

  const description = descriptionInputEl?.value.trim() || "";
  if (description.length > MAX_DESCRIPTION_CHARS) {
    setFieldError("description", `Description must be ${MAX_DESCRIPTION_CHARS} characters or fewer.`);
    if (valid) descriptionInputEl?.focus();
    valid = false;
  }

  return valid;
}

async function handleSave({ targetStatus }) {
  if (isSubmitting || !currentUser) return;
  clearAllErrors();

  const isValid = validateForm({
    requireTitle: targetStatus.trim().toLowerCase() !== "drafted",
  });
  if (!isValid) return;

  setBusy(true);

  try {
    const photoUrls = await buildFinalPhotoUrls();
    const payload = {
      title: titleInputEl?.value.trim() || "Untitled Draft",
      description: descriptionInputEl?.value.trim() || "",
      location: locationInputEl?.value.trim() || "",
      item_type: selectedCategories.item_type,
      condition_type: selectedCategories.condition_type,
      delivery_type: selectedCategories.delivery_type,
      photo_urls: photoUrls,
    };

    if (isEditMode) {
      const { error } = await supabaseClient
        .from("items")
        .update({
          ...payload,
          status: targetStatus,
        })
        .eq("id", editingItemId)
        .eq("donor_id", currentUser.id);

      if (error) throw new Error(error.message || "Failed to save changes.");
    } else {
      const { error } = await supabaseClient
        .from("items")
        .insert({
          ...payload,
          donor_id: currentUser.id,
          status: targetStatus,
        });

      if (error) throw new Error(error.message || "Failed to save item.");
    }

    revokeThumbnailObjectUrl();
    revokeExtraFileUrls();
    window.location.replace(ITEM_MENU_URL);
  } catch (err) {
    setFieldError("form", err.message || "Something went wrong while saving.");
    setBusy(false);
  }
}

function applyModeUi() {
  const showSaveChanges = useSaveChangesButtons();

  if (showSaveChanges) {
    document.title = "Edit Item";
    if (headingEl) headingEl.textContent = "Edit Item";
    createActionsEl?.classList.add("is-hidden");
    editActionsEl?.classList.remove("is-hidden");
  } else {
    document.title = isEditMode ? "Edit Draft" : "Post A New Item";
    if (headingEl) headingEl.textContent = isEditMode ? "Edit Draft" : "Post A New Item";
    createActionsEl?.classList.remove("is-hidden");
    editActionsEl?.classList.add("is-hidden");
  }
}

function populateFormFromItem(item) {
  if (titleInputEl) titleInputEl.value = item.title || "";
  if (descriptionInputEl) descriptionInputEl.value = item.description || "";
  if (locationInputEl) locationInputEl.value = item.location || "";

  selectedCategories.item_type = item.item_type || "";
  selectedCategories.condition_type = item.condition_type || "";
  selectedCategories.delivery_type = item.delivery_type || "";
  renderAllCategoryDropdowns();

  const photos = Array.isArray(item.photo_urls) ? item.photo_urls.filter(Boolean) : [];
  existingThumbnailUrl = photos[0] || "";
  thumbnailFile = null;

  revokeExtraFileUrls();
  extraPhotos = photos.slice(1, 1 + MAX_EXTRA_PHOTOS).map((url) => ({
    kind: "url",
    url,
  }));

  renderThumbnailPreview();
  renderExtraPhotos();
}

async function loadExistingItem() {
  if (!isEditMode || !currentUser) return;

  const { data, error } = await supabaseClient
    .from("items")
    .select("*")
    .eq("id", editingItemId)
    .eq("donor_id", currentUser.id)
    .single();

  if (error || !data) {
    setFieldError("form", "Item not found or you do not have permission to edit it.");
    setBusy(true);
    return;
  }

  existingItem = data;
  applyModeUi();
  populateFormFromItem(data);
}

titleInputEl?.addEventListener("input", () => setFieldError("title", ""));
descriptionInputEl?.addEventListener("input", () => setFieldError("description", ""));
locationInputEl?.addEventListener("input", () => setFieldError("location", ""));

locationArrowBtnEl?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (!locationInputEl || !locationMenuEl) return;

  const isOpen = !locationMenuEl.classList.contains("is-hidden");
  locationInputEl.focus();
  if (isOpen) {
    locationMenuEl.classList.add("is-hidden");
  } else {
    locationMenuEl.classList.remove("is-hidden");
  }
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".category-dropdown")) {
    closeAllCategoryMenus();
  }
});

formEl?.addEventListener("click", (event) => {
  const triggerBtn = event.target.closest(".category-trigger");
  if (triggerBtn) {
    event.stopPropagation();
    const dropdown = triggerBtn.closest(".category-dropdown");
    const menu = dropdown?.querySelector(".category-menu");
    if (!dropdown || !menu) return;

    const willOpen = menu.classList.contains("is-hidden");
    closeAllCategoryMenus(willOpen ? dropdown : null);
    menu.classList.toggle("is-hidden", !willOpen);
    dropdown.classList.toggle("is-open", willOpen);
    triggerBtn.setAttribute("aria-expanded", String(willOpen));
    return;
  }

  const optionBtn = event.target.closest(".category-option");
  if (optionBtn) {
    event.stopPropagation();
    const fieldKey = optionBtn.dataset.categoryField;
    const value = optionBtn.dataset.categoryValue || "";
    setCategoryValue(fieldKey, value);
    closeAllCategoryMenus();
  }
});

thumbnailInputEl?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  const errMsg = validateImageFile(file);
  if (errMsg) {
    setFieldError("thumbnail", errMsg);
    return;
  }

  setFieldError("thumbnail", "");
  thumbnailFile = file;
  renderThumbnailPreview();
});

removeThumbnailBtnEl?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  thumbnailFile = null;
  existingThumbnailUrl = "";
  setFieldError("thumbnail", "");
  renderThumbnailPreview();
});

extraPhotosInputEl?.addEventListener("change", (event) => {
  const files = Array.from(event.target.files || []);
  event.target.value = "";
  if (!files.length) return;

  const availableSlots = MAX_EXTRA_PHOTOS - extraPhotos.length;
  if (availableSlots <= 0) {
    setFieldError("extraPhotos", `You can attach up to ${MAX_EXTRA_PHOTOS} additional photos.`);
    return;
  }

  for (const file of files.slice(0, availableSlots)) {
    const errMsg = validateImageFile(file);
    if (errMsg) {
      setFieldError("extraPhotos", errMsg);
      return;
    }
    extraPhotos.push({
      kind: "file",
      file,
      previewUrl: URL.createObjectURL(file),
    });
  }

  if (files.length > availableSlots) {
    setFieldError(
      "extraPhotos",
      `Only ${MAX_EXTRA_PHOTOS} additional photos are allowed; extra files were skipped.`
    );
  } else {
    setFieldError("extraPhotos", "");
  }

  renderExtraPhotos({ scrollToEnd: true });
});

extraPhotosListEl?.addEventListener("click", (event) => {
  const removeBtn = event.target.closest("button[data-remove-extra]");
  if (!removeBtn) return;

  const idx = Number(removeBtn.dataset.removeExtra);
  const target = extraPhotos[idx];
  if (target?.kind === "file" && target.previewUrl) {
    URL.revokeObjectURL(target.previewUrl);
  }
  extraPhotos.splice(idx, 1);
  setFieldError("extraPhotos", "");
  renderExtraPhotos();
});

saveDraftBtnEl?.addEventListener("click", () => {
  handleSave({ targetStatus: "Drafted" });
});

formEl?.addEventListener("submit", (event) => {
  event.preventDefault();
  handleSave({ targetStatus: "Available" });
});

saveChangesBtnEl?.addEventListener("click", () => {
  handleSave({ targetStatus: existingItem?.status || "Available" });
});

async function initItemPostPage() {
  applyModeUi();
  attachLocationFilter(locationInputEl, locationMenuEl);
  renderAllCategoryDropdowns();
  renderExtraPhotos();

  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error || !session?.user) {
    window.location.replace(LOGIN_URL);
    return;
  }

  currentUser = session.user;
  await ensureUserProfile(currentUser);

  if (isEditMode) {
    await loadExistingItem();
  }
}

initItemPostPage();