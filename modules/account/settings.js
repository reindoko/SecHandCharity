import { supabaseClient } from "/assets/js/supabase-client.js";
import { attachLocationFilter } from "/assets/js/location.js";
import { ensureUserProfile } from "./auth.js";

const LOGIN_URL = "/modules/account/login.html";
const RESET_PASSWORD_URL = "/modules/account/reset-password.html";
const AVATAR_BUCKET = "avatar";
const DELETE_CONFIRM_TIMEOUT_MS = 3000;

const avatarImg = document.getElementById("settings-avatar");
const avatarFileInput = document.getElementById("settings-avatar-file");
const changeAvatarBtn = document.getElementById("change-avatar-btn");

const usernameInput = document.getElementById("settings-username");
const emailInput = document.getElementById("settings-email");
const passwordInput = document.getElementById("settings-password");
const locationSearchInput = document.getElementById("settings-location-search");
const locationMenu = document.getElementById("settings-location-menu");
const locationHiddenInput = document.getElementById("settings-location");

const saveBtn = document.getElementById("save-settings-btn");
const formError = document.getElementById("settings-form-error");
const changePasswordBtn = document.getElementById("change-password-btn");
const signOutBtn = document.getElementById("sign-out-btn");
const deleteAccountBtn = document.getElementById("delete-account-btn");
const deleteAccountNote = deleteAccountBtn?.nextElementSibling;

let currentUser = null;
let currentProfile = null;
let selectedLocation = "";
let isDeleteArmed = false;
let deleteResetTimer = null;

function setError(id, msg = "") {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

function clearAllErrors() {
  [
    "settings-username-error",
    "settings-email-error",
    "settings-password-error",
    "settings-location-error",
    "settings-form-error",
  ].forEach((id) => setError(id, ""));
}

function resetDeleteConfirmation() {
  isDeleteArmed = false;
  if (deleteResetTimer) {
    clearTimeout(deleteResetTimer);
    deleteResetTimer = null;
  }
  if (deleteAccountBtn) {
    deleteAccountBtn.textContent = "Delete Account";
    deleteAccountBtn.classList.remove("is-confirming");
  }
  if (deleteAccountNote) {
    deleteAccountNote.textContent = "Data will not be recovered";
  }
}

function armDeleteConfirmation() {
  isDeleteArmed = true;
  if (deleteAccountBtn) {
    deleteAccountBtn.textContent = "Click Again to Delete";
    deleteAccountBtn.classList.add("is-confirming");
  }
  if (deleteAccountNote) {
    deleteAccountNote.textContent = "Click once more to confirm";
  }
  if (deleteResetTimer) {
    clearTimeout(deleteResetTimer);
  }
  deleteResetTimer = setTimeout(() => {
    resetDeleteConfirmation();
  }, DELETE_CONFIRM_TIMEOUT_MS);
}

function formatAccountAge(createdAt) {
  if (!createdAt) return "0 Days";
  const diffMs = Math.max(0, Date.now() - new Date(createdAt).getTime());
  const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const months = Math.floor(totalDays / 30);
  const days = totalDays % 30;
  if (months > 0) {
    return `${months} Month${months > 1 ? "s" : ""} ${days} Day${days !== 1 ? "s" : ""}`;
  }
  return `${totalDays} Day${totalDays !== 1 ? "s" : ""}`;
}

function renderStars(rating) {
  const filled = Math.round(Number(rating) || 0);
  return "★".repeat(filled) + "☆".repeat(Math.max(0, 5 - filled));
}

function openLocationDropdown() {
  if (!locationSearchInput || !locationMenu) return;
  locationSearchInput.removeAttribute("readonly");
  if (locationSearchInput.value.trim().toLowerCase() === "unspecified") {
    locationSearchInput.value = "";
    selectedLocation = "";
    if (locationHiddenInput) locationHiddenInput.value = "";
  }
  locationSearchInput.focus();
  locationSearchInput.dispatchEvent(new Event("input", { bubbles: true }));
  locationMenu.classList.remove("is-hidden");
  if (saveBtn) saveBtn.hidden = false;
}

function unlockTextInput(input) {
  if (!input) return;
  input.removeAttribute("readonly");
  input.focus();
  if (saveBtn) saveBtn.hidden = false;
}

function activateField(field) {
  if (field === "location") {
    openLocationDropdown();
    return;
  }
  if (field === "password") {
    window.location.href = RESET_PASSWORD_URL;
    return;
  }
  const inputMap = {
    username: usernameInput,
    email: emailInput,
  };
  unlockTextInput(inputMap[field]);
}

attachLocationFilter(locationSearchInput, locationMenu, (chosenLocation) => {
  selectedLocation = chosenLocation || "";
  if (locationHiddenInput) {
    locationHiddenInput.value = selectedLocation;
  }
  if (saveBtn) {
    saveBtn.hidden = false;
  }
});

locationSearchInput?.addEventListener("input", () => {
  selectedLocation = locationSearchInput.value.trim();
  if (locationHiddenInput) {
    locationHiddenInput.value = selectedLocation;
  }
  if (saveBtn) saveBtn.hidden = false;
});

async function loadSettingsPage() {
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error || !session?.user) {
    window.location.replace(LOGIN_URL);
    return;
  }

  currentUser = session.user;
  await ensureUserProfile(currentUser);

  const { data: profile, error: profileError } = await supabaseClient
    .from("user_profiles")
    .select("*")
    .eq("id", currentUser.id)
    .single();

  if (profileError) {
    setError("settings-form-error", profileError.message);
    return;
  }

  currentProfile = profile;
  const savedLocation = profile.location || "";
  selectedLocation = savedLocation;

  usernameInput.value = profile.username || "";
  emailInput.value = profile.email || currentUser.email || "";
  locationSearchInput.value = savedLocation;
  locationHiddenInput.value = savedLocation;

  if (profile.avatar_url) {
    avatarImg.src = profile.avatar_url;
  }

  const rating = Number(profile.rating_avg || 0);
  document.getElementById("profile-rating").textContent = rating.toFixed(1);
  document.getElementById("profile-rating-stars").textContent = renderStars(rating);
  document.getElementById("profile-reviews").textContent = profile.review_count ?? 0;
  document.getElementById("profile-donated").textContent = profile.items_donated ?? 0;
  document.getElementById("profile-posted").textContent = profile.items_posted ?? 0;
  document.getElementById("profile-age").textContent = formatAccountAge(
    profile.created_at || currentUser.created_at
  );
}

document.querySelectorAll(".edit-icon-btn[data-field], .dropdown-icon-btn[data-field]").forEach((btn) => {
  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    activateField(btn.dataset.field);
  });
});

usernameInput?.addEventListener("click", () => activateField("username"));
emailInput?.addEventListener("click", () => activateField("email"));
passwordInput?.addEventListener("click", () => activateField("password"));
locationSearchInput?.addEventListener("click", (event) => {
  event.stopPropagation();
  activateField("location");
});

saveBtn?.addEventListener("click", async () => {
  if (!currentUser) return;
  clearAllErrors();

  const newUsername = usernameInput.value.trim();
  const newLocation = locationSearchInput.value.trim();
  const newEmail = emailInput.value.trim();

  if (!newUsername) {
    setError("settings-username-error", "Username cannot be empty.");
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  try {
    const { error: updateProfileError } = await supabaseClient
      .from("user_profiles")
      .update({
        username: newUsername,
        location: newLocation,
      })
      .eq("id", currentUser.id);

    if (updateProfileError) throw updateProfileError;

    if (newEmail && newEmail !== currentUser.email) {
      const { error: emailError } = await supabaseClient.auth.updateUser({ email: newEmail });
      if (emailError) throw emailError;
    }

    currentProfile = {
      ...currentProfile,
      username: newUsername,
      location: newLocation,
      email: newEmail || currentProfile?.email,
    };
    selectedLocation = newLocation;
    locationSearchInput.value = newLocation;
    if (locationHiddenInput) locationHiddenInput.value = newLocation;
    usernameInput.setAttribute("readonly", "");
    emailInput.setAttribute("readonly", "");
    locationSearchInput.setAttribute("readonly", "");
    locationMenu?.classList.add("is-hidden");
    saveBtn.hidden = true;
  } catch (err) {
    setError("settings-form-error", err.message || "Failed to update settings.");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Changes";
  }
});

changeAvatarBtn?.addEventListener("click", () => avatarFileInput?.click());

avatarFileInput?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file || !currentUser) return;
  clearAllErrors();

  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `avatars/${currentUser.id}/${Date.now()}.${ext}`;

  changeAvatarBtn.disabled = true;
  changeAvatarBtn.textContent = "Uploading...";

  try {
    const { error: uploadError } = await supabaseClient.storage
      .from(AVATAR_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: true });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabaseClient.storage
      .from(AVATAR_BUCKET)
      .getPublicUrl(path);

    const { error: dbError } = await supabaseClient
      .from("user_profiles")
      .update({ avatar_url: publicUrl })
      .eq("id", currentUser.id);

    if (dbError) throw dbError;

    avatarImg.src = publicUrl;
    const sidebarAvatar = document.querySelector(".sidebar-avatar");
    if (sidebarAvatar) sidebarAvatar.src = publicUrl;
  } catch (err) {
    setError("settings-form-error", err.message || "Failed to upload photo.");
  } finally {
    changeAvatarBtn.disabled = false;
    changeAvatarBtn.textContent = "Change Photo";
    avatarFileInput.value = "";
  }
});

changePasswordBtn?.addEventListener("click", () => {
  window.location.href = RESET_PASSWORD_URL;
});

signOutBtn?.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  window.location.replace(LOGIN_URL);
});

deleteAccountBtn?.addEventListener("click", async () => {
  if (!currentUser) return;

  if (!isDeleteArmed) {
    armDeleteConfirmation();
    return;
  }

  resetDeleteConfirmation();
  deleteAccountBtn.disabled = true;
  deleteAccountBtn.textContent = "Deleting...";

  try {
    const { data, error } = await supabaseClient.functions.invoke("delete-account");
    if (error || data?.error) {
      throw new Error(error?.message || data?.error || "Failed to delete account.");
    }

    await supabaseClient.auth.signOut();
    window.location.replace(LOGIN_URL);
  } catch (err) {
    deleteAccountBtn.disabled = false;
    setError("settings-form-error", err.message || "Failed to delete account.");
  }
});

loadSettingsPage();