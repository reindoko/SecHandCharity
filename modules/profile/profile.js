import { supabaseClient } from "/assets/js/supabase-client.js";

const ITEM_STATUS = "Available";
const ITEM_PAGE_SIZE = 6;
const REVIEW_PAGE_SIZE = 100;
const DEFAULT_AVATAR = "/assets/images/icon-account.png";
const LOGIN_URL = "/modules/account/login.html";

const pageStatus = document.getElementById("page-status");
const profileContent = document.getElementById("profile-content");
const profileAvatar = document.getElementById("profile-avatar");
const profileName = document.getElementById("profile-name");
const profileLocation = document.getElementById("profile-location");
const messageLink = document.getElementById("message-link");
const ratingValue = document.getElementById("profile-rating");
const ratingStars = document.getElementById("profile-rating-stars");
const reviewCount = document.getElementById("profile-review-count");
const postedCount = document.getElementById("profile-posted");
const accountAge = document.getElementById("profile-age");
const activityCount = document.getElementById("activity-count");
const activityError = document.getElementById("activity-error");
const activityEmpty = document.getElementById("activity-empty");
const activityList = document.getElementById("activity-list");
const activityMore = document.getElementById("activity-more");
const reviewsError = document.getElementById("reviews-error");
const reviewAuthPrompt = document.getElementById("review-auth-prompt");
const reviewList = document.getElementById("review-list");
const reviewForm = document.getElementById("review-form");
const reviewFormHeading = document.getElementById("review-form-heading");
const reviewRating = document.getElementById("review-rating");
const reviewComment = document.getElementById("review-comment");
const reviewSubmit = document.getElementById("review-submit");
const reviewCancel = document.getElementById("review-cancel");
const reviewFormStatus = document.getElementById("review-form-status");

let profileId = null;
let viewer = null;
let viewerAuthError = null;
let reviews = [];
let reviewLoadError = null;
let editingReviewId = null;
let activities = [];
let activitiesHaveMore = false;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function errorText(error) {
  const message = error?.message || "Unknown Supabase error";
  return `${message}${error?.code ? ` (code ${error.code})` : ""}`;
}

function showPageError(message) {
  pageStatus.hidden = false;
  pageStatus.classList.add("is-error");
  pageStatus.setAttribute("role", "alert");
  pageStatus.textContent = message;
  profileContent.hidden = true;
}

function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatAccountAge(value) {
  if (!value) return "Unavailable";
  const createdAt = new Date(value);
  if (Number.isNaN(createdAt.getTime())) return "Unavailable";
  const days = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 86400000));
  return `${days} ${days === 1 ? "day" : "days"}`;
}

function firstPhoto(value) {
  if (!value) return "";
  if (Array.isArray(value)) return value.find((photo) => typeof photo === "string" && photo.trim()) || "";
  if (typeof value !== "string") return "";
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.find((photo) => typeof photo === "string" && photo.trim()) || "";
    }
    if (typeof parsed === "string") return parsed;
  } catch {
    return value.split(",")[0].trim();
  }
  return "";
}

function setInlineError(element, error, prefix) {
  element.textContent = `${prefix}: ${errorText(error)}`;
  element.hidden = false;
}

function clearInlineError(element) {
  element.textContent = "";
  element.hidden = true;
}

function renderProfile(profile) {
  const name = profile.username || "Community member";
  profileName.textContent = name;
  profileLocation.textContent = profile.location || "Location not provided";
  profileAvatar.src = profile.avatar_url || DEFAULT_AVATAR;
  profileAvatar.alt = `${name}'s profile picture`;
  accountAge.textContent = formatAccountAge(profile.created_at);
  messageLink.href = `/modules/messaging/msg.html?user=${encodeURIComponent(profile.id)}`;
  messageLink.hidden = Boolean(viewer?.id && viewer.id === profile.id);
  document.title = `${name} | Public Profile`;
}

function updateRatingSummary() {
  if (reviewLoadError) {
    ratingValue.textContent = "Unavailable";
    ratingStars.textContent = "☆☆☆☆☆";
    ratingStars.setAttribute("aria-label", "Rating unavailable");
    reviewCount.textContent = "Unavailable";
    return;
  }

  reviewCount.textContent = String(reviews.length);
  if (!reviews.length) {
    ratingValue.textContent = "0.0";
    ratingStars.textContent = "☆☆☆☆☆";
    ratingStars.setAttribute("aria-label", "No publicly visible ratings");
    return;
  }

  const average = reviews.reduce((sum, review) => sum + Math.min(5, Math.max(1, Number(review.star_rating) || 1)), 0) / reviews.length;
  const roundedStars = Math.min(5, Math.max(1, Math.round(average)));
  ratingValue.textContent = average.toFixed(1);
  ratingStars.textContent = `${"★".repeat(roundedStars)}${"☆".repeat(5 - roundedStars)}`;
  ratingStars.setAttribute("aria-label", `${average.toFixed(1)} out of 5 stars`);
}

function ownReview() {
  return viewer ? reviews.find((review) => review.reviewer_id === viewer.id) || null : null;
}

function renderReviews() {
  if (reviewLoadError) {
    reviewList.replaceChildren();
    setInlineError(reviewsError, reviewLoadError, "Reviews could not be loaded");
    reviewAuthPrompt.hidden = true;
    reviewForm.hidden = true;
    updateRatingSummary();
    return;
  }

  clearInlineError(reviewsError);
  updateRatingSummary();

  if (!reviews.length) {
    reviewList.innerHTML = '<p class="section-empty">No publicly visible reviews yet.</p>';
  } else {
    reviewList.innerHTML = reviews.map((review) => {
      const rating = Math.min(5, Math.max(1, Math.round(Number(review.star_rating) || 1)));
      const isOwner = Boolean(viewer && review.reviewer_id === viewer.id);
      const author = isOwner ? "You" : (review.reviewer?.username || "Community member");
      const actions = isOwner
        ? `<div class="review-actions">
             <button type="button" data-review-edit="${escapeHTML(review.id)}">Edit</button>
             <button type="button" class="delete-review" data-review-delete="${escapeHTML(review.id)}">Delete</button>
           </div>`
        : "";
      return `<article class="review-card">
        <div class="review-card-heading">
          <div>
            <div class="review-author">${escapeHTML(author)}</div>
            <div class="review-date">${escapeHTML(formatDate(review.created_at))}</div>
          </div>
          <span class="review-rating" aria-label="${rating} out of 5 stars">${"★".repeat(rating)}${"☆".repeat(5 - rating)}</span>
        </div>
        <p class="review-comment">${escapeHTML(review.comment)}</p>
        ${actions}
      </article>`;
    }).join("");
  }

  if (!viewer) {
    reviewForm.hidden = true;
    reviewAuthPrompt.innerHTML = viewerAuthError
      ? `Sign-in status could not be verified: ${escapeHTML(errorText(viewerAuthError))}`
      : `Sign in to write a review. <a href="${LOGIN_URL}">Sign in</a>`;
    reviewAuthPrompt.hidden = false;
    return;
  }

  reviewAuthPrompt.hidden = true;
  reviewForm.hidden = false;
  restoreReviewEditor();
}

function restoreReviewEditor() {
  const existing = ownReview();
  editingReviewId = existing?.id ?? null;
  reviewFormHeading.textContent = existing ? "Update your review" : "Write a review";
  reviewSubmit.textContent = existing ? "Save changes" : "Post review";
  reviewRating.value = existing ? String(existing.star_rating) : "5";
  reviewComment.value = existing?.comment || "";
  reviewCancel.hidden = !existing;
  reviewFormStatus.textContent = "";
  reviewFormStatus.className = "form-status";
}

function renderActivities() {
  activityList.innerHTML = activities.map((item) => {
    const photo = firstPhoto(item.photo_urls);
    const image = photo
      ? `<img class="activity-photo" src="${escapeHTML(photo)}" alt="${escapeHTML(item.title || "Donation item")}" loading="lazy">`
      : '<div class="activity-photo-placeholder" aria-label="No photo available">No photo</div>';
    return `<a class="activity-card" href="/modules/item/item-details.html?id=${encodeURIComponent(item.id)}">
      ${image}
      <div class="activity-card-content">
        <h3>${escapeHTML(item.title || "Untitled donation")}</h3>
        <p>${escapeHTML(item.location || "Location not provided")}</p>
        <p class="activity-date">Posted ${escapeHTML(formatDate(item.created_at))}</p>
      </div>
    </a>`;
  }).join("");

  activityList.querySelectorAll(".activity-photo").forEach((image) => {
    image.addEventListener("error", () => {
      const placeholder = document.createElement("div");
      placeholder.className = "activity-photo-placeholder";
      placeholder.textContent = "Photo unavailable";
      image.replaceWith(placeholder);
    }, { once: true });
  });

  activityEmpty.hidden = activities.length > 0;
  activityMore.hidden = !activitiesHaveMore;
}

async function loadReviews() {
  reviewLoadError = null;
  const loadedReviews = [];
  let offset = 0;

  while (true) {
    let data;
    let error;
    try {
      const result = await supabaseClient
        .from("reviews")
        .select("id, reviewed_user_id, reviewer_id, star_rating, comment, created_at, reviewer:user_profiles!reviews_reviewer_id_fkey(username, avatar_url)")
        .eq("reviewed_user_id", profileId)
        .order("created_at", { ascending: false })
        .range(offset, offset + REVIEW_PAGE_SIZE - 1);
      data = result.data;
      error = result.error;
    } catch (requestError) {
      error = requestError;
    }

    if (error) {
      reviewLoadError = error;
      reviews = [];
      renderReviews();
      return;
    }

    const page = Array.isArray(data) ? data : [];
    loadedReviews.push(...page);
    if (page.length < REVIEW_PAGE_SIZE) break;
    offset += page.length;
  }

  reviews = loadedReviews;
  renderReviews();
}

async function loadItemCount() {
  let count;
  let error;
  try {
    const result = await supabaseClient
      .from("items")
      .select("id", { count: "exact", head: true })
      .eq("donor_id", profileId)
      .eq("status", ITEM_STATUS);
    count = result.count;
    error = result.error;
  } catch (requestError) {
    error = requestError;
  }

  if (error) {
    postedCount.textContent = "Unavailable";
    activityCount.textContent = "Count unavailable";
    console.error("Could not count published profile items:", error.message);
    setInlineError(activityError, error, "Item count could not be loaded");
    return;
  }

  if (count === null) {
    postedCount.textContent = "Unavailable";
    activityCount.textContent = "Count unavailable";
    activityError.textContent = "Supabase did not return an exact count for published items.";
    activityError.hidden = false;
    return;
  }

  postedCount.textContent = String(count);
  activityCount.textContent = `${count} ${count === 1 ? "item" : "items"}`;
}

async function loadMoreActivities() {
  activityMore.disabled = true;
  activityMore.textContent = "Loading...";
  clearInlineError(activityError);

  try {
    const { data, error } = await supabaseClient
      .from("items")
      .select("id, title, description, location, item_type, condition_type, delivery_type, photo_urls, created_at")
      .eq("donor_id", profileId)
      .eq("status", ITEM_STATUS)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(activities.length, activities.length + ITEM_PAGE_SIZE - 1);

    if (error) throw error;

    const page = Array.isArray(data) ? data : [];
    activities.push(...page);
    activitiesHaveMore = page.length === ITEM_PAGE_SIZE;
    renderActivities();
  } catch (error) {
    console.error("Could not load profile activity:", error);
    setInlineError(activityError, error, "Donations could not be loaded");
    activityMore.hidden = false;
  } finally {
    activityMore.disabled = false;
    activityMore.textContent = "View More";
  }
}

function displayReviewFormMessage(message, isError = false) {
  reviewFormStatus.textContent = message;
  reviewFormStatus.className = `form-status${isError ? " is-error" : " is-success"}`;
}

async function saveReview(event) {
  event.preventDefault();
  if (!viewer || !profileId || reviewLoadError) return;

  const comment = reviewComment.value.trim();
  const starRating = Number(reviewRating.value);
  if (!comment || !Number.isInteger(starRating) || starRating < 1 || starRating > 5) {
    displayReviewFormMessage("Enter a comment and choose a rating from 1 to 5.", true);
    return;
  }

  reviewSubmit.disabled = true;
  displayReviewFormMessage(editingReviewId ? "Saving your review..." : "Posting your review.");

  try {
    if (editingReviewId) {
      const { data, error } = await supabaseClient
        .from("reviews")
        .update({ star_rating: starRating, comment })
        .eq("id", editingReviewId)
        .eq("reviewer_id", viewer.id)
        .eq("reviewed_user_id", profileId)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        displayReviewFormMessage("The review was not updated. It may no longer be available or current access rules may block the change.", true);
        return;
      }
    } else {
      const { error } = await supabaseClient
        .from("reviews")
        .insert({
          reviewed_user_id: profileId,
          reviewer_id: viewer.id,
          star_rating: starRating,
          comment,
        });

      if (error) throw error;
    }

    await loadReviews();
    displayReviewFormMessage("Your review was saved.");
  } catch (error) {
    console.error("Could not save profile review:", error);
    displayReviewFormMessage(`Review could not be saved: ${errorText(error)}`, true);
  } finally {
    reviewSubmit.disabled = false;
  }
}

async function deleteReview(reviewId) {
  if (!viewer || !profileId || !window.confirm("Delete your review? This cannot be undone.")) return;

  try {
    const { data, error } = await supabaseClient
      .from("reviews")
      .delete()
      .eq("id", reviewId)
      .eq("reviewer_id", viewer.id)
      .eq("reviewed_user_id", profileId)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      displayReviewFormMessage("The review was not deleted. It may no longer be available or current access rules may block the change.", true);
      return;
    }

    await loadReviews();
    displayReviewFormMessage("Your review was deleted.");
  } catch (error) {
    console.error("Could not delete profile review:", error);
    displayReviewFormMessage(`Review could not be deleted: ${errorText(error)}`, true);
  }
}

function editReview(reviewId) {
  const review = reviews.find((entry) => String(entry.id) === String(reviewId));
  if (!viewer || !review || review.reviewer_id !== viewer.id) return;
  editingReviewId = review.id;
  reviewFormHeading.textContent = "Update your review";
  reviewSubmit.textContent = "Save changes";
  reviewRating.value = String(review.star_rating);
  reviewComment.value = review.comment || "";
  reviewCancel.hidden = false;
  reviewFormStatus.textContent = "";
  reviewForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function init() {
  profileAvatar.addEventListener("error", () => {
    profileAvatar.src = DEFAULT_AVATAR;
  }, { once: true });

  try {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) {
      viewerAuthError = error;
      console.error("Could not verify the current user:", error.message);
    } else {
      viewer = session?.user || null;
    }
  } catch (error) {
    viewerAuthError = error;
    console.error("Could not verify the current user:", error);
  }

  const requestedId = new URLSearchParams(window.location.search).get("id");
  profileId = requestedId || viewer?.id || null;
  if (!profileId) {
    showPageError("A profile ID is required. Open this page with ?id=<user-id>.");
    return;
  }

  const { data: profile, error } = await supabaseClient
    .from("user_profiles")
    .select("id, username, location, avatar_url, created_at")
    .eq("id", profileId)
    .maybeSingle();

  if (error) {
    console.error("Could not load public profile:", error.message);
    showPageError(`Profile could not be loaded: ${errorText(error)}`);
    return;
  }
  if (!profile) {
    showPageError("Profile not found or not publicly available.");
    return;
  }

  renderProfile(profile);
  pageStatus.hidden = true;
  profileContent.hidden = false;

  await Promise.all([
    loadReviews(),
    loadItemCount(),
    loadMoreActivities(),
  ]);
}

reviewForm.addEventListener("submit", saveReview);
reviewCancel.addEventListener("click", restoreReviewEditor);
activityMore.addEventListener("click", loadMoreActivities);
reviewList.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-review-edit]");
  if (editButton) {
    editReview(editButton.dataset.reviewEdit);
    return;
  }

  const deleteButton = event.target.closest("[data-review-delete]");
  if (deleteButton) {
    deleteReview(deleteButton.dataset.reviewDelete);
  }
});

init().catch((error) => {
  console.error("Public Profile initialization failed:", error);
  showPageError(`Profile could not be loaded: ${errorText(error)}`);
});
