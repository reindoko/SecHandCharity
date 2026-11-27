import { supabaseClient } from './supabase-client.js';

const IMAGE_PATH = "/assets/images";
const DEFAULT_AVATAR = `${IMAGE_PATH}/icon-account.png`;

const SIDEBAR_TABS = [
  {
    key: "user",
    label: "User",
    href: "/modules/account/settings.html",
    icon: DEFAULT_AVATAR,
  },
  {
    key: "catalogue",
    label: "Catalogue",
    href: "/modules/catalogue/catalogue.html",
    icon: `${IMAGE_PATH}/icon-catalogue.png`,
  },
  {
    key: "item",
    label: "Your Donations",
    href: "/modules/item/item-menu.html",
    icon: `${IMAGE_PATH}/icon-item.png`,
  },
  {
    key: "messages",
    label: "Messages",
    href: "/modules/messaging/msg.html",
    icon: `${IMAGE_PATH}/icon-message.png`,
  },
  {
    key: "appointments",
    label: "Appointments",
    href: "/modules/collection/appointments.html",
    icon: `${IMAGE_PATH}/icon-appointment.png`,
  },
  {
    key: "saved",
    label: "Saved Items",
    href: "/modules/saved/saved-items.html",
    icon: `${IMAGE_PATH}/icon-saved.png`,
  },
  {
    key: "notifications",
    label: "Notifications",
    href: "/modules/notifications/notifications.html",
    icon: `${IMAGE_PATH}/icon-notification.png`,
  },
];

function getActiveTabIndex() {
  const path = window.location.pathname.toLowerCase();
  const index = SIDEBAR_TABS.findIndex((tab) => path.endsWith(tab.href.toLowerCase()));
  return index !== -1 ? index : 1; // Defaults to the catalogue
}

function createIconHtml(tab) {
  // Custom styling for avatar
  if (tab.key === "user") {
    return `<img src="${tab.icon}" alt="" class="sidebar-avatar" />`;
  }
  return `<img src="${tab.icon}" alt="" class="sidebar-icon" aria-hidden="true" />`;
}

function renderSidebar(userName = "User", avatarUrl = DEFAULT_AVATAR) {
  // Element to inject the sidebar into
  const sidebarElement = document.getElementById("sidebar");
  if (!sidebarElement) return;

  SIDEBAR_TABS[0].label = userName;
  SIDEBAR_TABS[0].icon = avatarUrl || DEFAULT_AVATAR;

  const activeIndex = getActiveTabIndex();

  // Create each tab button
  const linksHtml = SIDEBAR_TABS.map((tab, i) => {
    const activeClass = i === activeIndex ? "is-active" : "";
    return `
      <a href="${tab.href}" class="sidebar-link ${activeClass}">
        ${createIconHtml(tab)}
        <span>${tab.label}</span>
      </a>
    `;
  }).join("");

  sidebarElement.innerHTML = `
    <nav class="sidebar-nav" aria-label="Primary sidebar">
      <div class="sidebar-links">${linksHtml}</div>
    </nav>
  `;
}

async function fetchCurrentUser() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session?.user) return;

  const { data: profile } = await supabaseClient
    .from("user_profiles")
    .select("username, avatar_url")
    .eq("id", session.user.id)
    .single();

  const username = profile?.username || session.user.user_metadata?.username || "User";
  const avatar = profile?.avatar_url || DEFAULT_AVATAR;

  renderSidebar(username, avatar);
}

// Render default sidebar while fetching database
renderSidebar();
// Reload sidebar with updated user info
fetchCurrentUser();