import { supabaseClient } from "/assets/js/supabase-client.js";
import { attachLocationFilter } from "/assets/js/location.js";

const CATALOGUE_URL = "/modules/catalogue/catalogue.html";

// Ui helpers
function setError(elementId, message = "") {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = message;
  }
}

function clearErrors(ids) {
  ids.forEach((id) => setError(id, ""));
}

function setButtonLoading(button, isLoading, loadingText) {
  if (!button) return;
  if (!button.dataset.defaultText) {
    button.dataset.defaultText = button.textContent.trim();
  }
  button.disabled = isLoading;
  button.textContent = isLoading ? loadingText : button.dataset.defaultText;
}

// Password visibility eye buttons
function initPasswordToggles() {
  const toggles = [
    { inputId: "login-password", buttonId: "toggle-login-password" },
    { inputId: "register-password", buttonId: "toggle-register-password" },
    { inputId: "new-password", buttonId: "toggle-new-password" },
    { inputId: "confirm-new-password", buttonId: "toggle-confirm-password" },
  ];

  toggles.forEach(({ inputId, buttonId }) => {
    const input = document.getElementById(inputId);
    const button = document.getElementById(buttonId);
    if (!input || !button) return;

    const hiddenIcon = button.querySelector(".eye-icon-hidden");
    const showIcon = button.querySelector(".eye-icon-show");

    button.addEventListener("click", () => {
      const showPlainText = input.type === "password";
      input.type = showPlainText ? "text" : "password";

      if (hiddenIcon) hiddenIcon.classList.toggle("is-hidden", showPlainText);
      if (showIcon) showIcon.classList.toggle("is-hidden", !showPlainText);
    });
  });
}

// Creates entry in user_profiles if not exist yet
export async function ensureUserProfile(user, fallbackUsername = "", fallbackLocation = "") {
  if (!user) return;

  const { data: existing, error: fetchError } = await supabaseClient
    .from("user_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (fetchError) {
    console.warn("Could not fetch user_profiles:", fetchError.message);
    return;
  }

  if (existing) return;

  // Fallbacks for like gmail sign ups
  const meta = user.user_metadata || {};
  const emailValue = user.email || "";
  const generatedUsername =
    fallbackUsername ||
    meta.username ||
    (emailValue ? `${emailValue.split("@")[0]}_${user.id.slice(0, 4)}` : `user_${user.id.slice(0, 6)}`);
  const locationValue = fallbackLocation || meta.location || "Unspecified";

  const { error: insertError } = await supabaseClient
    .from("user_profiles")
    .insert({
      id: user.id,
      email: emailValue,
      username: generatedUsername,
      location: locationValue,
    });

  if (insertError) {
    console.warn("Could not create user_profiles row:", insertError.message);
  }
}

async function redirectIfAuthenticated() {
  const isAuthPage =
    Boolean(document.getElementById("login-form")) ||
    Boolean(document.getElementById("register-form"));
  if (!isAuthPage) return;

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    console.error("Failed to check session:", error.message);
    return;
  }
  if (data.session?.user) {
    await ensureUserProfile(data.session.user);
    window.location.replace(CATALOGUE_URL);
  }
}

// Get email of user from their username or just use email directly
async function resolveEmailFromIdentifier(identifier) {
  const trimmed = identifier.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return trimmed;
  }

  const { data, error } = await supabaseClient
    .from("user_profiles")
    .select("email")
    .eq("username", trimmed)
    .maybeSingle();

  if (error || !data?.email) {
    return null;
  }
  return data.email;
}

function initLoginPage() {
  const loginForm = document.getElementById("login-form");
  if (!loginForm) return;

  const identifierInput = document.getElementById("login-identifier");
  const passwordInput = document.getElementById("login-password");
  const signInBtn = document.getElementById("sign-in-btn");
  const googleBtn = document.getElementById("google-signin-btn");
  const forgotPasswordLink = document.getElementById("forgot-password-link");

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors(["login-identifier-error", "login-password-error", "login-form-error"]);

    const identifier = identifierInput?.value.trim() || "";
    const password = passwordInput?.value || "";

    if (!identifier) {
      setError("login-identifier-error", "Please enter your email or username.");
      return;
    }
    if (!password) {
      setError("login-password-error", "Please enter your password.");
      return;
    }

    setButtonLoading(signInBtn, true, "Signing in...");

    try {
      const email = await resolveEmailFromIdentifier(identifier);
      if (!email) {
        setError("login-identifier-error", "Email or username not found.");
        return;
      }

      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError("login-form-error", error.message || "Invalid login credentials.");
        return;
      }

      await ensureUserProfile(data.user);
      window.location.replace(CATALOGUE_URL);
    } catch (err) {
      console.error("Sign-in error:", err);
      setError("login-form-error", "Something went wrong while signing in.");
    } finally {
      setButtonLoading(signInBtn, false);
    }
  });

  if (googleBtn) {
    googleBtn.addEventListener("click", async () => {
      clearErrors(["login-form-error"]);
      setButtonLoading(googleBtn, true, "Redirecting...");

      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: new URL("/index.html", window.location.origin).href,
        },
      });

      if (error) {
        setError("login-form-error", error.message || "Google sign in failed.");
        setButtonLoading(googleBtn, false);
      }
    });
  }

  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener("click", async (event) => {
      event.preventDefault();
      clearErrors(["login-identifier-error", "login-form-error"]);

      const identifier = identifierInput?.value.trim() || "";
      if (!identifier) {
        setError("login-identifier-error", "Enter your email or username to reset your password.");
        return;
      }

      const email = await resolveEmailFromIdentifier(identifier);
      if (!email || !email.includes("@")) {
        setError("login-identifier-error", "No account found with that email or username.");
        return;
      }

      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: new URL("/modules/account/reset-password.html", window.location.origin).href,
      });

      if (error) {
        setError("login-form-error", error.message || "Could not send password reset email.");
        return;
      }

      setError("login-form-error", "Password reset email sent. Please check your inbox.");
    });
  }
}

function initRegisterPage() {
  const registerForm = document.getElementById("register-form");
  if (!registerForm) return;

  const emailInput = document.getElementById("register-email");
  const usernameInput = document.getElementById("register-username");
  const passwordInput = document.getElementById("register-password");
  const locationSearchInput = document.getElementById("register-location-search");
  const locationMenu = document.getElementById("register-location-menu");
  const locationInput = document.getElementById("register-location");
  const registerBtn = document.getElementById("register-btn");

  let selectedLocation = "";

  attachLocationFilter(locationSearchInput, locationMenu, (chosenLocation) => {
    selectedLocation = chosenLocation;
    if (locationInput) {
      locationInput.value = chosenLocation;
    }
  });

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors([
      "register-email-error",
      "register-username-error",
      "register-password-error",
      "register-location-error",
      "register-form-error",
    ]);

    const email = emailInput?.value.trim() || "";
    const username = usernameInput?.value.trim() || "";
    const password = passwordInput?.value || "";
    const location = selectedLocation || locationInput?.value || "";

    let hasError = false;

    if (!email) {
      setError("register-email-error", "Please enter your email.");
      hasError = true;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("register-email-error", "Please enter a valid email address.");
      hasError = true;
    }

    if (username.length < 3) {
      setError("register-username-error", "Username must be at least 3 characters.");
      hasError = true;
    } else if (username.length > 64) {
      setError("register-username-error", "Username must be less than 64 characters.");
      hasError = true;
    }

    if (password.length < 6) {
      setError("register-password-error", "Password must be at least 6 characters.");
      hasError = true;
    } else if (!/^[A-Za-z0-9!@#$%^&*._?-]+$/.test(password)) {
      setError("register-password-error", "Password must not contain special characters.");
      hasError = true;
    }

    if (!location) {
      setError("register-location-error", "Please select a location.");
      hasError = true;
    }

    if (hasError) return;

    setButtonLoading(registerBtn, true, "Registering...");

    try {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: new URL("/index.html", window.location.origin).href,
          data: {
            username,
            location,
          },
        },
      });

      if (error) {
        setError("register-form-error", error.message || "Registration failed.");
        return;
      }

      if (data.session && data.user) {
        await ensureUserProfile(data.user, username, location);
        window.location.replace(CATALOGUE_URL);
        return;
      }

      setError(
        "register-form-error",
        "Successfully registered. Please check your email to confirm your account."
      );
      selectedLocation = "";
      if (locationInput) locationInput.value = "";
      registerForm.reset();
    } catch (err) {
      console.error("Registration error:", err);
      setError("register-form-error", "Something went wrong while registering.");
    } finally {
      setButtonLoading(registerBtn, false);
    }
  });
}

function initResetPasswordPage() {
  const resetForm = document.getElementById("reset-password-form");
  if (!resetForm) return;

  const newPasswordInput = document.getElementById("new-password");
  const confirmPasswordInput = document.getElementById("confirm-new-password");
  const resetBtn = document.getElementById("reset-password-btn");

  resetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors(["new-password-error", "confirm-password-error", "reset-form-error"]);

    const newPassword = newPasswordInput?.value || "";
    const confirmPassword = confirmPasswordInput?.value || "";
    let hasError = false;

    if (newPassword.length < 6) {
      setError("new-password-error", "Password must be at least 6 characters.");
      hasError = true;
    } else if (!/^[A-Za-z0-9!@#$%^&*._?-]+$/.test(newPassword)) {
      setError("new-password-error", "Password must not contain special characters.");
      hasError = true;
    }

    if (confirmPassword !== newPassword) {
      setError("confirm-password-error", "Passwords do not match.");
      hasError = true;
    }

    if (hasError) return;

    setButtonLoading(resetBtn, true, "Resetting...");

    try {
      const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
      if (error) {
        setError("reset-form-error", error.message || "Failed to reset password.");
        return;
      }

      await supabaseClient.auth.signOut();
      window.location.replace("./login.html");
    } catch (err) {
      console.error("Password reset error:", err);
      setError("reset-form-error", "Something went wrong while resetting password.");
    } finally {
      setButtonLoading(resetBtn, false);
    }
  });
}

// Run functions on boot
document.addEventListener("DOMContentLoaded", async () => {
  initPasswordToggles();
  initLoginPage();
  initRegisterPage();
  initResetPasswordPage();
  await redirectIfAuthenticated();
});