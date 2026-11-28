import { supabaseClient } from "/assets/js/supabase-client.js";

const ITEM_STATUS = "Available";
const COMPLETED_STATUS = "Completed";
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
const donatedCount = document.getElementById("profile-donated");
const postedCount = document.getElementById("profile-posted");
const accountAge = document.getElementById("profile-age");
const activityCount = document.getElementById("activity-count");
const activityError = document.getElementById("activity-error");
const activityEmpty = document.getElementById("activity-empty");
const activityList = document.getElementById("activity-list");
const activityRetry = document.getElementById("activity-retry");
const activityPagination = document.getElementById("activity-pagination");
const activityPageIndicator = document.getElementById("activity-page-indicator");
const activityPrevious = document.getElementById("activity-previous");
const activityNext = document.getElementById("activity-next");
const reviewsError = document.getElementById("reviews-error");
const reviewAuthPrompt = document.getElementById("review-auth-prompt");
const reviewList = document.getElementById("review-list");
const reviewForm = document.getElementById("review-form");
const reviewFormHeading = document.getElementById("review-form-heading");
const reviewRating = document.getElementById("review-rating");
const reviewComment = document.getElementById("review-comment");
const reviewSubmit = document.getElementById("review-submit");
const reviewCancel = document.getElementById("review-cancel");
const reviewDeleteButton = document.getElementById("review-delete");
const reviewFormStatus = document.getElementById("review-form-status");

let profileId = null;
let viewer = null;
let viewerAuthError = null;
let isProfileOwner = false;
let reviews = [];
let reviewLoadError = null;
let editingReviewId = null;
let originalReviewRating = "5";
let originalReviewComment = "";
let activities = [];
let activityPage = 1;
let activityPageCount = 1;
let activityTotalCount = 0;
let activityRequestPage = 1;
let activityLoading = false;
let openingConversation = false;

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
  messageLink.hidden = true;

  const name = profile.username || "Community member";
  const viewerId = typeof viewer?.id === "string" ? viewer.id.trim() : "";
  const ownerId = typeof profile.id === "string" ? profile.id.trim() : "";
  isProfileOwner = Boolean(viewerId && ownerId && viewerId === ownerId);
  const shouldShowMessage = Boolean(viewerId && ownerId && viewerId !== ownerId);

  console.debug("[Public Profile] Message visibility check", {
    viewerId: viewerId || null,
    ownerId: ownerId || null,
    viewerIdValid: Boolean(viewerId),
    ownerIdValid: Boolean(ownerId),
    idsMatch: isProfileOwner,
    messageVisible: shouldShowMessage,
  });

  profileName.textContent = name;
  profileLocation.textContent = profile.location || "Location not provided";
  profileAvatar.src = profile.avatar_url || DEFAULT_AVATAR;
  profileAvatar.alt = `${name}'s profile picture`;
  accountAge.textContent = formatAccountAge(profile.created_at);
  messageLink.href = `/modules/messaging/msg.html?user=${encodeURIComponent(profile.id)}`;
  messageLink.hidden = !shouldShowMessage;
  document.title = `${name} | Public Profile`;
}

async function findConversationWith(targetId) {
  const { data, error } = await supabaseClient
    .from("chatrooms")
    .select("id")
    .or(`and(donor_id.eq.${viewer.id},recipient_id.eq.${targetId}),and(donor_id.eq.${targetId},recipient_id.eq.${viewer.id})`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function openConversation(event) {
  if (!viewer || !profileId || viewer.id === profileId) return;
  event.preventDefault();
  if (openingConversation) return;

  openingConversation = true;
  messageLink.setAttribute("aria-disabled", "true");
  messageLink.textContent = "Opening...";

  try {
    let conversation = await findConversationWith(profileId);
    if (!conversation) {
      const { data, error } = await supabaseClient
        .from("chatrooms")
        .insert({ donor_id: profileId, recipient_id: viewer.id })
        .select("id")
        .single();

      if (error) {
        conversation = await findConversationWith(profileId);
        if (!conversation) throw error;
      } else {
        conversation = data;
      }
    }

    window.location.href = `/modules/messaging/msg.html?chatroom=${encodeURIComponent(conversation.id)}`;
  } catch (error) {
    console.error("Could not open profile conversation:", error);
    window.alert(`Could not open conversation: ${errorText(error)}`);
    messageLink.textContent = "Message";
    messageLink.removeAttribute("aria-disabled");
    openingConversation = false;
  }
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

function updateReviewActionVisibility() {
  const hasChanges =
    reviewRating.value !== originalReviewRating ||
    reviewComment.value !== originalReviewComment;

  reviewCancel.hidden = !hasChanges;
  reviewSubmit.hidden = editingReviewId !== null && !hasChanges;
}

function renderReviews() {
  reviewDeleteButton.hidden = true;

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
      const isOwner = Boolean(
        viewer && !isProfileOwner && review.reviewer_id === viewer.id
      );
      const reviewerId = typeof review.reviewer_id === "string" ? review.reviewer_id.trim() : "";
      const label = isOwner ? "You" : (review.reviewer?.username || "Community member");
      const authorMarkup = !isOwner && reviewerId
        ? `<a class="review-author-link" href="/modules/profile/profile.html?id=${encodeURIComponent(reviewerId)}">${escapeHTML(label)}</a>`
        : escapeHTML(label);
      return `<article class="review-card">
        <div class="review-card-heading">
          <div>
            <div class="review-author">${authorMarkup}</div>
            <div class="review-date">${escapeHTML(formatDate(review.created_at))}</div>
          </div>
          <span class="review-rating" aria-label="${rating} out of 5 stars">${"★".repeat(rating)}${"☆".repeat(5 - rating)}</span>
        </div>
        <p class="review-comment">${escapeHTML(review.comment)}</p>
      </article>`;
    }).join("");
  }

  if (isProfileOwner) {
    reviewForm.hidden = true;
    reviewAuthPrompt.hidden = true;
    return;
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
  const isEditingReview = editingReviewId !== null;
  reviewFormHeading.textContent = isEditingReview ? "Update your review" : "Write a review";
  reviewSubmit.textContent = isEditingReview ? "Save changes" : "Post review";
  originalReviewRating = existing ? String(existing.star_rating) : "5";
  originalReviewComment = existing?.comment || "";
  reviewRating.value = originalReviewRating;
  reviewComment.value = originalReviewComment;
  updateReviewActionVisibility();
  reviewDeleteButton.hidden = false;
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

  activityEmpty.hidden = activityTotalCount > 0;
  activityRetry.hidden = true;
  activityPagination.hidden = activityTotalCount === 0;
  activityPageIndicator.textContent = `Page ${activityPage} of ${activityPageCount}`;
  activityPrevious.hidden = activityPage <= 1 || activityPageCount <= 1;
  activityNext.hidden = activityPage >= activityPageCount;
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

async function loadDonatedCount() {
  if (!donatedCount) return;

  try {
    const { count, error } = await supabaseClient
      .from("items")
      .select("id", { count: "exact", head: true })
      .eq("donor_id", profileId)
      .ilike("status", COMPLETED_STATUS);

    if (error) {
      donatedCount.textContent = "Unavailable";
      console.error("Could not count completed profile donations:", error.message);
      return;
    }

    if (count === null) {
      donatedCount.textContent = "Unavailable";
      return;
    }

    donatedCount.textContent = String(count);
  } catch (error) {
    donatedCount.textContent = "Unavailable";
    console.error("Could not count completed profile donations:", error);
  }
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

async function fetchActivityPage(page) {
  const { data, count, error } = await supabaseClient
    .from("items")
    .select(
      "id, title, description, location, item_type, condition_type, delivery_type, photo_urls, created_at",
      { count: "exact" }
    )
    .eq("donor_id", profileId)
    .eq("status", ITEM_STATUS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * ITEM_PAGE_SIZE, page * ITEM_PAGE_SIZE - 1);

  if (error) throw error;
  if (count === null) {
    throw new Error("Supabase did not return an exact count for published items.");
  }

  return { items: Array.isArray(data) ? data : [], count };
}

async function loadActivityPage(page) {
  if (activityLoading) return;

  activityLoading = true;
  activityRequestPage = page;
  activityRetry.hidden = true;
  activityRetry.disabled = true;
  clearInlineError(activityError);

  try {
    let result = await fetchActivityPage(page);
    const pageCount = Math.max(1, Math.ceil(result.count / ITEM_PAGE_SIZE));
    const targetPage = Math.min(Math.max(page, 1), pageCount);
    if (targetPage !== page) {
      result = await fetchActivityPage(targetPage);
    }

    activityPage = targetPage;
    activityPageCount = pageCount;
    activityTotalCount = result.count;
    activities = result.items;
    renderActivities();
  } catch (error) {
    console.error("Could not load profile activity:", error);
    setInlineError(activityError, error, "Donations could not be loaded");
    activityRetry.hidden = false;
  } finally {
    activityLoading = false;
    activityRetry.disabled = false;
  }
}

function displayReviewFormMessage(message, isError = false) {
  reviewFormStatus.textContent = message;
  reviewFormStatus.className = `form-status${isError ? " is-error" : " is-success"}`;
}

async function saveReview(event) {
  event.preventDefault();
  if (!viewer || !profileId || reviewLoadError || isProfileOwner) return;

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

    originalReviewRating = String(starRating);
    originalReviewComment = comment;
    reviewRating.value = originalReviewRating;
    reviewComment.value = originalReviewComment;
    updateReviewActionVisibility();
    await loadReviews();
    displayReviewFormMessage("Your review was saved.");
  } catch (error) {
    console.error("Could not save profile review:", error);
    displayReviewFormMessage(`Review could not be saved: ${errorText(error)}`, true);
  } finally {
    reviewSubmit.disabled = false;
  }
}

async function deleteReview() {
  if (!viewer || !profileId || isProfileOwner) return;

  const existing = ownReview();
  if (!existing) {
    displayReviewFormMessage("You do not have a review for this profile to delete.", true);
    return;
  }

  if (!window.confirm("Delete your review? This cannot be undone.")) return;

  try {
    const { data, error } = await supabaseClient
      .from("reviews")
      .delete()
      .eq("id", existing.id)
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

async function init() {
  profileAvatar.addEventListener("error", () => {
    profileAvatar.src = DEFAULT_AVATAR;
  }, { once: true });

  console.debug("[Public Profile] Waiting for Supabase auth session.");
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

  console.debug("[Public Profile] Supabase auth session resolved", {
    viewerId: viewer?.id || null,
    authError: viewerAuthError ? errorText(viewerAuthError) : null,
  });

  const requestedId = new URLSearchParams(window.location.search).get("id");
  profileId = requestedId || viewer?.id || null;
  console.debug("[Public Profile] Profile ID selected", {
    requestedId: requestedId || null,
    profileId,
  });
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

  console.debug("[Public Profile] Owner profile loaded", {
    requestedProfileId: profileId,
    ownerId: profile.id,
  });
  renderProfile(profile);
  pageStatus.hidden = true;
  profileContent.hidden = false;

  await Promise.all([
    loadReviews(),
    loadDonatedCount(),
    loadItemCount(),
    loadActivityPage(1),
  ]);
}

reviewForm.addEventListener("submit", saveReview);
messageLink.addEventListener("click", openConversation);
reviewCancel.addEventListener("click", restoreReviewEditor);
reviewDeleteButton.addEventListener("click", () => {
  deleteReview();
});
reviewRating.addEventListener("change", updateReviewActionVisibility);
reviewComment.addEventListener("input", updateReviewActionVisibility);
activityRetry.addEventListener("click", () => loadActivityPage(activityRequestPage));
activityPrevious.addEventListener("click", () => {
  if (!activityLoading && !activityPrevious.hidden) {
    loadActivityPage(activityPage - 1);
  }
});
activityNext.addEventListener("click", () => {
  if (!activityLoading && !activityNext.hidden) {
    loadActivityPage(activityPage + 1);
  }
});

init().catch((error) => {
  console.error("Public Profile initialization failed:", error);
  showPageError(`Profile could not be loaded: ${errorText(error)}`);
});