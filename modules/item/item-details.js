import { supabaseClient } from "/assets/js/supabase-client.js";

const LOGIN_PAGE_URL = "/modules/account/login.html";
const PROFILE_PAGE_URL = "/modules/profile/profile.html";
const MESSAGING_PAGE_URL = "/modules/messaging/msg.html";
const CART_PAGE_URL = "/modules/cart/cart.html";

const returnBtnEl = document.getElementById("return-btn");
const feedbackEl = document.getElementById("details-feedback");
const photosStripEl = document.getElementById("photos-strip");

const titleEl = document.getElementById("item-title");
const statusBadgeEl = document.getElementById("item-status-badge");
const postedTimeEl = document.getElementById("item-posted-time");
const locationEl = document.getElementById("item-location");
const categoryPillsEl = document.getElementById("item-category-pills");
const descriptionEl = document.getElementById("item-description");

const donorAvatarEl = document.getElementById("donor-avatar");
const donorNameEl = document.getElementById("donor-name");
const donorRatingScoreEl = document.getElementById("donor-rating-score");
const donorRatingStarsEl = document.getElementById("donor-rating-stars");
const donorRatingCountEl = document.getElementById("donor-rating-count");
const donorProfileLinkEl = document.getElementById("donor-profile-link");

const messageDonorBtnEl = document.getElementById("message-donor-btn");
const addToCartBtnEl = document.getElementById("add-to-cart-btn");
const cartBtnLabelEl = document.getElementById("cart-btn-label");
const favouriteBtnEl = document.getElementById("favourite-btn");
const favouriteBtnLabelEl = document.getElementById("favourite-btn-label");
const favouriteBtnHeartEl = document.getElementById("favourite-btn-heart");

const reviewsHeadingEl = document.getElementById("reviews-heading");
const reviewsRatingScoreEl = document.getElementById("reviews-rating-score");
const reviewsRatingStarsEl = document.getElementById("reviews-rating-stars");
const reviewsRatingCountEl = document.getElementById("reviews-rating-count");
const reviewsListEl = document.getElementById("reviews-list");
const readAllReviewsLinkEl = document.getElementById("read-all-reviews-link");

const lightboxEl = document.getElementById("photo-lightbox");
const lightboxImgEl = document.getElementById("lightbox-img");
const lightboxCloseBtnEl = document.getElementById("lightbox-close-btn");

const params = new URLSearchParams(window.location.search);
const itemId = params.get("id")?.trim() || "";

let currentUser = null;
let loadedItem = null;
let isOpeningChat = false;
let isInCart = false;
let isFavourited = false;
let isUpdatingCart = false;
let isUpdatingFavourite = false;

function setFeedback(message = "", isError = false) {
  if (!feedbackEl) return;
  feedbackEl.textContent = message;
  feedbackEl.classList.toggle("is-error", isError);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getInitials(name) {
  const parts = String(name || "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function formatRelativeTime(dateInput) {
  if (!dateInput) return "";
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return "";

  const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSeconds < 60) return "Just now";

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 14) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 8) return `${diffWeeks} week${diffWeeks === 1 ? "" : "s"} ago`;

  return date.toLocaleDateString();
}

function renderStars(avg) {
  const rounded = Math.max(0, Math.min(5, Math.round(Number(avg) || 0)));
  return "★".repeat(rounded) + "☆".repeat(5 - rounded);
}

function syncCartButtonUi() {
  if (!addToCartBtnEl) return;
  addToCartBtnEl.classList.toggle("is-in-cart", isInCart);
  if (cartBtnLabelEl) {
    cartBtnLabelEl.textContent = isInCart
      ? "View In Shopping Cart"
      : "Add To Shopping Cart";
  }
}

function syncFavouriteButtonUi() {
  if (!favouriteBtnEl) return;
  favouriteBtnEl.classList.toggle("is-favourited", isFavourited);
  favouriteBtnEl.setAttribute("aria-pressed", String(isFavourited));
  if (favouriteBtnLabelEl) {
    favouriteBtnLabelEl.textContent = isFavourited
      ? "Remove From Favourites"
      : "Save To Favourites";
  }
  if (favouriteBtnHeartEl) {
    favouriteBtnHeartEl.innerHTML = isFavourited ? "&#9829;" : "&#9825;";
  }
}

function openLightbox(src, alt = "Item photo") {
  if (!lightboxEl || !lightboxImgEl || !src) return;
  lightboxImgEl.src = src;
  lightboxImgEl.alt = alt;
  lightboxEl.classList.remove("is-hidden");
}

function closeLightbox() {
  if (!lightboxEl || !lightboxImgEl) return;
  lightboxEl.classList.add("is-hidden");
  lightboxImgEl.removeAttribute("src");
}

function renderPhotos(photoUrls) {
  if (!photosStripEl) return;
  const list = Array.isArray(photoUrls) ? photoUrls.filter(Boolean) : [];

  if (list.length === 0) {
    photosStripEl.innerHTML = `
      <div class="photo-frame">
        <div class="photo-frame-placeholder">No photos provided</div>
      </div>
    `;
    return;
  }

  // list[0] is the thumbnail first, followed by remaining gallery photos
  photosStripEl.innerHTML = list
    .map((url, idx) => {
      const label = idx === 0 ? "Thumbnail" : `Extra photo ${idx}`;
      return `
        <div class="photo-frame photo-frame--clickable" data-photo-src="${escapeHtml(url)}" data-photo-alt="${escapeHtml(label)}">
          <img src="${escapeHtml(url)}" alt="${escapeHtml(label)}" class="photo-frame-img">
        </div>
      `;
    })
    .join("");
}

function renderItemDetails(item) {
  loadedItem = item;
  document.title = item.title ? `${item.title} — Item Details` : "Item Details";

  if (titleEl) titleEl.textContent = item.title || "Untitled Item";

  const status = (item.status || "available").toLowerCase();
  if (statusBadgeEl) {
    statusBadgeEl.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    statusBadgeEl.className = `status-badge status-badge--${status}`;
  }

  if (postedTimeEl) {
    const rel = formatRelativeTime(item.created_at);
    postedTimeEl.textContent = rel ? `Posted ${rel}` : "";
  }

  if (locationEl) {
    locationEl.textContent = item.location || "Location not specified";
  }

  if (categoryPillsEl) {
    const pills = [item.item_type, item.condition_type, item.delivery_type].filter(Boolean);
    categoryPillsEl.innerHTML = pills
      .map((tag) => `<span class="category-pill">${escapeHtml(tag)}</span>`)
      .join("");
  }

  if (descriptionEl) {
    descriptionEl.textContent = item.description || "No description provided.";
  }

  renderPhotos(item.photo_urls);

  const donorId = item.donor_id || "";
  const profileHref = donorId
    ? `${PROFILE_PAGE_URL}?id=${encodeURIComponent(donorId)}`
    : PROFILE_PAGE_URL;

  if (donorProfileLinkEl) donorProfileLinkEl.href = profileHref;
  if (readAllReviewsLinkEl) readAllReviewsLinkEl.href = profileHref;

  if (currentUser && donorId && currentUser.id === donorId) {
    if (messageDonorBtnEl) messageDonorBtnEl.disabled = true;
    if (addToCartBtnEl) addToCartBtnEl.disabled = true;
    if (favouriteBtnEl) favouriteBtnEl.disabled = true;
  }
}

function extractDisplayName(row, fallback = "Donor") {
  if (!row) return fallback;
  return (
    row.full_name ||
    row.display_name ||
    row.name ||
    row.username ||
    fallback
  );
}

function extractAvatarUrl(row) {
  if (!row) return "";
  return row.avatar_url || row.profile_picture || row.photo_url || "";
}

async function loadDonorAndReviews(donorId) {
  if (!donorId) return;

  let donorName = "Donor";
  let donorAvatarUrl = "";

  const { data: profileData } = await supabaseClient
    .from("user_profiles")
    .select("*")
    .eq("id", donorId)
    .maybeSingle();

  if (profileData) {
    donorName = extractDisplayName(profileData, donorName);
    donorAvatarUrl = extractAvatarUrl(profileData);
  }

  if (donorNameEl) donorNameEl.textContent = donorName;
  if (reviewsHeadingEl) reviewsHeadingEl.textContent = `Reviews for ${donorName}`;

  if (donorAvatarEl) {
    if (donorAvatarUrl) {
      donorAvatarEl.innerHTML = `<img src="${escapeHtml(donorAvatarUrl)}" alt="${escapeHtml(donorName)}">`;
    } else {
      donorAvatarEl.textContent = getInitials(donorName);
    }
  }

  const { data: reviewsData, error: reviewsError } = await supabaseClient
    .from("reviews")
    .select("*")
    .eq("reviewed_user_id", donorId)
    .order("created_at", { ascending: false })
    .limit(5);

  const reviewRows = !reviewsError && Array.isArray(reviewsData) ? reviewsData : [];
  const totalCount = reviewRows.length;
  const avgScore =
    totalCount > 0
      ? reviewRows.reduce((sum, r) => sum + (Number(r.star_rating) || 0), 0) / totalCount
      : 0;

  const formattedAvg = avgScore.toFixed(1);
  const starsText = renderStars(avgScore);
  const countText = `(${totalCount})`;

  if (donorRatingScoreEl) donorRatingScoreEl.textContent = formattedAvg;
  if (donorRatingStarsEl) donorRatingStarsEl.textContent = starsText;
  if (donorRatingCountEl) donorRatingCountEl.textContent = countText;

  if (reviewsRatingScoreEl) reviewsRatingScoreEl.textContent = formattedAvg;
  if (reviewsRatingStarsEl) reviewsRatingStarsEl.textContent = starsText;
  if (reviewsRatingCountEl) reviewsRatingCountEl.textContent = countText;

  if (!reviewsListEl) return;

  if (reviewRows.length === 0) {
    reviewsListEl.innerHTML = `<p class="reviews-empty">No reviews yet.</p>`;
    return;
  }

  const reviewerIds = [...new Set(reviewRows.map((r) => r.reviewer_id).filter(Boolean))];
  let reviewerMap = new Map();

  if (reviewerIds.length > 0) {
    const { data: reviewerProfiles } = await supabaseClient
      .from("user_profiles")
      .select("*")
      .in("id", reviewerIds);

    if (Array.isArray(reviewerProfiles)) {
      reviewerMap = new Map(reviewerProfiles.map((p) => [p.id, p]));
    }
  }

  reviewsListEl.innerHTML = reviewRows
    .map((rev) => {
      const reviewerProfile = rev.reviewer_id ? reviewerMap.get(rev.reviewer_id) : null;
      const reviewerName =
        rev.reviewer_name ||
        extractDisplayName(reviewerProfile, "Reviewer");
      const reviewerAvatar = extractAvatarUrl(reviewerProfile);
      const initials = getInitials(reviewerName);
      const timeLabel = formatRelativeTime(rev.created_at);
      return `
        <div class="review-item">
          <div class="review-avatar" aria-hidden="true">${
            reviewerAvatar
              ? `<img src="${escapeHtml(reviewerAvatar)}" alt="${escapeHtml(reviewerName)}">`
              : escapeHtml(initials)
          }</div>
          <div class="review-content">
            <div class="review-top-line">
              <span class="review-author">${escapeHtml(reviewerName)}</span>
              ${timeLabel ? `<span class="review-date">${escapeHtml(timeLabel)}</span>` : ""}
            </div>
            <div class="rating-stars" aria-hidden="true">${renderStars(rev.star_rating)}</div>
            <p class="review-comment">${escapeHtml(rev.comment || "")}</p>
          </div>
        </div>
      `;
    })
    .join("");
}

async function loadCartAndFavouriteState(targetItemId) {
  if (!currentUser || !targetItemId) {
    isInCart = false;
    isFavourited = false;
    syncCartButtonUi();
    syncFavouriteButtonUi();
    return;
  }

  const [cartRes, favRes] = await Promise.all([
    supabaseClient
      .from("cart_items")
      .select("id")
      .eq("user_id", currentUser.id)
      .eq("item_id", targetItemId)
      .maybeSingle(),
    supabaseClient
      .from("saved_items")
      .select("id")
      .eq("user_id", currentUser.id)
      .eq("item_id", targetItemId)
      .maybeSingle(),
  ]);

  isInCart = Boolean(!cartRes.error && cartRes.data);
  isFavourited = Boolean(!favRes.error && favRes.data);
  syncCartButtonUi();
  syncFavouriteButtonUi();
}

async function handleCartButtonClick() {
  if (!loadedItem?.id || isUpdatingCart) return;

  if (isInCart) {
    window.location.href = CART_PAGE_URL;
    return;
  }

  if (!currentUser) {
    window.location.href = LOGIN_PAGE_URL;
    return;
  }

  isUpdatingCart = true;
  if (addToCartBtnEl) addToCartBtnEl.disabled = true;
  setFeedback("");

  try {
    const { error } = await supabaseClient
      .from("cart_items")
      .insert({
        user_id: currentUser.id,
        item_id: loadedItem.id,
      });

    if (error) {
      throw new Error(error.message || "Failed to add item to shopping cart.");
    }

    isInCart = true;
    syncCartButtonUi();
    setFeedback(`Added "${loadedItem.title}" to shopping cart.`);
  } catch (err) {
    setFeedback(err.message || "Unable to add to shopping cart.", true);
  } finally {
    isUpdatingCart = false;
    if (addToCartBtnEl) addToCartBtnEl.disabled = false;
  }
}

async function handleFavouriteButtonClick() {
  if (!loadedItem?.id || isUpdatingFavourite) return;

  if (!currentUser) {
    window.location.href = LOGIN_PAGE_URL;
    return;
  }

  isUpdatingFavourite = true;
  if (favouriteBtnEl) favouriteBtnEl.disabled = true;
  setFeedback("");

  try {
    if (isFavourited) {
      const { error } = await supabaseClient
        .from("saved_items")
        .delete()
        .eq("user_id", currentUser.id)
        .eq("item_id", loadedItem.id);

      if (error) {
        throw new Error(error.message || "Failed to remove from favourites.");
      }

      isFavourited = false;
      syncFavouriteButtonUi();
      setFeedback(`Removed "${loadedItem.title}" from favourites.`);
    } else {
      const { error } = await supabaseClient
        .from("saved_items")
        .insert({
          user_id: currentUser.id,
          item_id: loadedItem.id,
        });

      if (error) {
        throw new Error(error.message || "Failed to save to favourites.");
      }

      isFavourited = true;
      syncFavouriteButtonUi();
      setFeedback(`Saved "${loadedItem.title}" to favourites.`);
    }
  } catch (err) {
    setFeedback(err.message || "Unable to update favourites.", true);
  } finally {
    isUpdatingFavourite = false;
    if (favouriteBtnEl) favouriteBtnEl.disabled = false;
  }
}

async function ensureChatroomAndOpen(donorId) {
  if (!donorId || isOpeningChat) return;

  if (!currentUser) {
    window.location.href = LOGIN_PAGE_URL;
    return;
  }

  if (currentUser.id === donorId) {
    setFeedback("You cannot message your own listing.", true);
    return;
  }

  isOpeningChat = true;
  if (messageDonorBtnEl) messageDonorBtnEl.disabled = true;
  setFeedback("");

  try {
    const { data: existingRooms, error: lookupError } = await supabaseClient
      .from("chatrooms")
      .select("id, donor_id, recipient_id")
      .or(
        `and(donor_id.eq.${currentUser.id},recipient_id.eq.${donorId}),and(donor_id.eq.${donorId},recipient_id.eq.${currentUser.id})`
      )
      .limit(1);

    if (lookupError) {
      throw new Error(lookupError.message || "Failed to check existing chatroom.");
    }

    const roomExists = Array.isArray(existingRooms) && existingRooms.length > 0;

    if (!roomExists) {
      const { error: insertError } = await supabaseClient
        .from("chatrooms")
        .insert({
          donor_id: currentUser.id,
          recipient_id: donorId,
        });

      if (insertError) {
        throw new Error(insertError.message || "Failed to create chatroom.");
      }
    }

    window.location.href = `${MESSAGING_PAGE_URL}?user=${encodeURIComponent(donorId)}`;
  } catch (err) {
    setFeedback(err.message || "Unable to open chatroom.", true);
    isOpeningChat = false;
    if (messageDonorBtnEl) messageDonorBtnEl.disabled = false;
  }
}

async function initItemDetailsPage() {
  syncCartButtonUi();
  syncFavouriteButtonUi();

  const { data: { session } } = await supabaseClient.auth.getSession();
  currentUser = session?.user || null;

  if (!itemId) {
    if (titleEl) titleEl.textContent = "Item not found";
    setFeedback("Missing item ID in URL.", true);
    return;
  }

  const { data: item, error } = await supabaseClient
    .from("items")
    .select("*")
    .eq("id", itemId)
    .single();

  if (error || !item) {
    if (titleEl) titleEl.textContent = "Item not found";
    setFeedback("This item does not exist or is unavailable.", true);
    return;
  }

  renderItemDetails(item);
  await Promise.all([
    loadDonorAndReviews(item.donor_id),
    loadCartAndFavouriteState(item.id),
  ]);
}

returnBtnEl?.addEventListener("click", () => {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.replace("./item-menu.html");
  }
});

photosStripEl?.addEventListener("click", (event) => {
  const frame = event.target.closest(".photo-frame--clickable");
  if (!frame) return;
  openLightbox(frame.dataset.photoSrc, frame.dataset.photoAlt);
});

lightboxCloseBtnEl?.addEventListener("click", closeLightbox);
lightboxEl?.addEventListener("click", (event) => {
  if (event.target === lightboxEl) closeLightbox();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeLightbox();
});

messageDonorBtnEl?.addEventListener("click", () => {
  if (!loadedItem?.donor_id) return;
  ensureChatroomAndOpen(loadedItem.donor_id);
});

addToCartBtnEl?.addEventListener("click", handleCartButtonClick);
favouriteBtnEl?.addEventListener("click", handleFavouriteButtonClick);

initItemDetailsPage();