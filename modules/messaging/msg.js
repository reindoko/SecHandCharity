// Messaging module: C (send) / R (view) / U (edit) / D (delete) + image attachments
// Schema: user_profiles, items, chatrooms (donor_id, recipient_id),
//         messages (chatroom_id, sender_id, item_id, message, image_url, edited_at)
// Storage: public bucket "chat-images"
import { supabaseClient } from "/assets/js/supabase-client.js";

const BUCKET = "media";
const MAX_IMAGE_MB = 5;

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const chatList = $("chatList");
const chatSearch = $("chatSearch");
const chatEmpty = $("chatEmpty");
const chatView = $("chatView");
const chatName = $("chatName");
const chatAvatar = $("chatAvatar");
const messageArea = $("messageArea");
const messageForm = $("messageForm");
const messageInput = $("messageInput");
const editBar = $("editBar");
const cancelEdit = $("cancelEdit");
const attachBtn = $("attachBtn");
const imageInput = $("imageInput");
const imagePreview = $("imagePreview");
const previewImg = $("previewImg");
const removeImage = $("removeImage");
const sendBtn = messageForm.querySelector(".send-btn");

// ---------- State ----------
let me = null;
let rooms = [];
let messages = [];
let active = null;             // id === null means a draft room, not saved yet
let editingId = null;
let pendingItemId = null;
let pendingImage = null;       // File chosen but not sent yet
let sending = false;
const profiles = new Map();
const items = new Map();

// ---------- Helpers ----------
const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const partnerId = (room) => (room.donor_id === me.id ? room.recipient_id : room.donor_id);
const nameOf = (id) => profiles.get(id)?.username || "Unknown user";
const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";

function avatarHTML(id) {
    const p = profiles.get(id);
    return p?.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : esc(initials(nameOf(id)));
}

function formatTime(iso) {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString())
        return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return (now - d) / 86400000 < 7
        ? d.toLocaleDateString([], { weekday: "short" })
        : d.toLocaleDateString([], { day: "numeric", month: "short" });
}

function firstPhoto(photo_urls) {
    if (!photo_urls) return "";
    try {
        const v = JSON.parse(photo_urls);
        if (Array.isArray(v)) return v[0] || "";
        if (typeof v === "string") return v;
    } catch { /* not JSON */ }
    return String(photo_urls).split(",")[0].trim();
}

const roomMessages = (roomId) => messages.filter((m) => m.chatroom_id === roomId);
const lastMessage = (roomId) => { const l = roomMessages(roomId); return l[l.length - 1] || null; };
const previewText = (m) => (m.message ? m.message : m.image_url ? "📷 Photo" : "");

// ---------- Load data (READ) ----------
async function loadProfiles(ids) {
    const missing = [...new Set(ids)].filter((id) => id && !profiles.has(id));
    if (!missing.length) return;
    const { data, error } = await supabaseClient
        .from("user_profiles")
        .select("id, username, avatar_url")
        .in("id", missing);
    if (error) console.error("user_profiles:", error.message);
    (data || []).forEach((p) => profiles.set(p.id, p));
    missing.forEach((id) => { if (!profiles.has(id)) profiles.set(id, { id, username: "Unknown user" }); });
}

async function loadItem(id) {
    if (!id) return null;
    if (items.has(id)) return items.get(id);
    const { data } = await supabaseClient
        .from("items")
        .select("id, donor_id, title, location, photo_urls")
        .eq("id", id)
        .maybeSingle();
    items.set(id, data || null);
    return data || null;
}

async function loadRoomsAndMessages() {
    const r = await supabaseClient
        .from("chatrooms")
        .select("*")
        .or(`donor_id.eq.${me.id},recipient_id.eq.${me.id}`);
    if (r.error) return console.error("chatrooms:", r.error.message);
    rooms = r.data || [];

    if (rooms.length) {
        const m = await supabaseClient
            .from("messages")
            .select("*")
            .in("chatroom_id", rooms.map((x) => x.id))
            .order("created_at", { ascending: true });
        if (m.error) console.error("messages:", m.error.message);
        messages = m.data || [];
    }
    await loadProfiles(rooms.map(partnerId));
}

// ---------- Render ----------
function listRooms() {
    const all = [...rooms];
    if (active && active.id === null) all.push(active);
    return all.sort((a, b) => {
        const ta = lastMessage(a.id)?.created_at || a.created_at || "9999";
        const tb = lastMessage(b.id)?.created_at || b.created_at || "9999";
        return tb.localeCompare(ta);
    });
}

const isActive = (room) => active && (room === active || (room.id !== null && room.id === active.id));

function renderList() {
    const q = chatSearch.value.trim().toLowerCase();
    const rows = listRooms().filter((r) => nameOf(partnerId(r)).toLowerCase().includes(q));
    if (!rows.length) {
        chatList.innerHTML = `<li class="list-empty">${q ? "No chats found" : "No conversations yet"}</li>`;
        return;
    }
    chatList.innerHTML = rows.map((r) => {
        const pid = partnerId(r);
        const last = r.id !== null ? lastMessage(r.id) : null;
        return `
        <li class="chat-item ${isActive(r) ? "active" : ""}" data-room="${r.id ?? "draft"}">
            <span class="avatar">${avatarHTML(pid)}</span>
            <span class="name">${esc(nameOf(pid))}</span>
            <span class="time">${last ? formatTime(last.created_at) : ""}</span>
            <span class="preview">${last ? esc(previewText(last)) : "Say hello 👋"}</span>
        </li>`;
    }).join("");
}

async function renderChat() {
    if (!active) {
        chatEmpty.hidden = false;
        chatView.hidden = true;
        return;
    }
    chatEmpty.hidden = true;
    chatView.hidden = false;
    const pid = partnerId(active);
    chatName.textContent = nameOf(pid);
    chatAvatar.innerHTML = avatarHTML(pid);

    const thread = active.id !== null ? roomMessages(active.id) : [];
    await Promise.all([...new Set(thread.map((m) => m.item_id).filter(Boolean))].map(loadItem));

    let lastItem = null;
    let html = "";

    if (active.id === null && pendingItemId) {
        await loadItem(pendingItemId);
        html += itemCardHTML(items.get(pendingItemId), true);
    }

    html += thread.map((m) => {
        const mine = m.sender_id === me.id;
        let card = "";
        if (m.item_id && m.item_id !== lastItem) {
            card = itemCardHTML(items.get(m.item_id), mine);
            lastItem = m.item_id;
        }
        const image = m.image_url
            ? `<a href="${esc(m.image_url)}" target="_blank" rel="noopener">
                   <img class="chat-image" src="${esc(m.image_url)}" alt="Photo" loading="lazy">
               </a>`
            : "";
        const text = m.message ? `<div class="bubble">${esc(m.message)}</div>` : "";
        return `${card}
        <div class="msg ${mine ? "mine" : "theirs"}" data-id="${m.id}">
            ${mine ? `<div class="msg-actions">
                ${m.message || !m.image_url ? `<button type="button" data-act="edit">Edit</button>` : ""}
                <button type="button" data-act="delete" class="danger">Delete</button>
            </div>` : ""}
            ${image}${text}
            <div class="meta">${formatTime(m.created_at)}${m.edited_at ? " · edited" : ""}</div>
        </div>`;
    }).join("");

    messageArea.innerHTML = html;
    messageArea.scrollTop = messageArea.scrollHeight;
}

function itemCardHTML(it, mine) {
    if (!it) return "";
    const img = firstPhoto(it.photo_urls);
    return `
    <div class="item-card ${mine ? "" : "theirs"}">
        <div class="thumb">${img ? `<img src="${esc(img)}" alt="">` : ""}</div>
        <div class="info"><strong>${esc(it.title || "Item")}</strong><span>📍 ${esc(it.location || "")}</span></div>
    </div>`;
}

// Scroll to bottom again once images finish loading (they change the height)
messageArea.addEventListener("load", (e) => {
    if (e.target.classList?.contains("chat-image")) messageArea.scrollTop = messageArea.scrollHeight;
}, true);

// ---------- Open a chat ----------
async function openRoom(room) {
    active = room;
    stopEditing();
    clearImage();
    await loadProfiles([partnerId(room)]);
    renderList();
    await renderChat();
    messageInput.focus();
}

chatList.addEventListener("click", (e) => {
    const li = e.target.closest(".chat-item");
    if (!li) return;
    const key = li.dataset.room;
    const room = key === "draft" ? active : rooms.find((r) => String(r.id) === key);
    if (room) openRoom(room);
});
chatSearch.addEventListener("input", renderList);

// ---------- Image attach ----------
attachBtn.addEventListener("click", () => {
    if (editingId) return;                       // can't change the image while editing text
    imageInput.click();
});

imageInput.addEventListener("change", () => {
    const file = imageInput.files[0];
    imageInput.value = "";                       // allow picking the same file again
    if (!file) return;
    if (!file.type.startsWith("image/")) return alert("Please choose an image file.");
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) return alert(`Image must be under ${MAX_IMAGE_MB} MB.`);
    clearImage();
    pendingImage = file;
    previewImg.src = URL.createObjectURL(file);
    imagePreview.hidden = false;
});

function clearImage() {
    if (previewImg.src.startsWith("blob:")) URL.revokeObjectURL(previewImg.src);
    pendingImage = null;
    previewImg.removeAttribute("src");
    imagePreview.hidden = true;
}
removeImage.addEventListener("click", clearImage);

async function uploadImage(file) {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `media/${me.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`; 
    const { error } = await supabaseClient.storage.from(BUCKET).upload(path, file, { contentType: file.type });
    if (error) throw error;
    return supabaseClient.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// ---------- Send (CREATE) / Edit (UPDATE) ----------
async function ensureRoomSaved() {
    if (active.id !== null) return true;
    const { data, error } = await supabaseClient
        .from("chatrooms")
        .insert({ donor_id: active.donor_id, recipient_id: active.recipient_id })
        .select()
        .single();
    if (error) { alert("Could not start chat: " + error.message); return false; }
    rooms.push(data);
    active = data;
    return true;
}

function setSending(v) {
    sending = v;
    sendBtn.disabled = v;
    attachBtn.disabled = v;
}

messageForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sending || !active) return;
    const text = messageInput.value.trim();

    if (editingId) {
        if (!text) return;
        setSending(true);
        const { data, error } = await supabaseClient
            .from("messages")
            .update({ message: text, edited_at: new Date().toISOString() })
            .eq("id", editingId)
            .eq("sender_id", me.id)
            .select()
            .single();
        setSending(false);
        if (error) return alert("Could not edit message: " + error.message);
        messages = messages.map((m) => (m.id === data.id ? data : m));
        stopEditing();
    } else {
        if (!text && !pendingImage) return;
        setSending(true);
        try {
            if (!(await ensureRoomSaved())) return;
            const imageUrl = pendingImage ? await uploadImage(pendingImage) : null;
            const row = { chatroom_id: active.id, sender_id: me.id, message: text };   // message is NOT NULL -> "" for image-only
            if (imageUrl) row.image_url = imageUrl;
            if (pendingItemId) row.item_id = Number(pendingItemId);
            const { data, error } = await supabaseClient.from("messages").insert(row).select().single();
            if (error) throw error;
            pendingItemId = null;
            if (!messages.some((m) => m.id === data.id)) messages.push(data);
            messageInput.value = "";
            clearImage();
        } catch (err) {
            alert("Could not send message: " + (err.message || err));
        } finally {
            setSending(false);
        }
    }
    renderList();
    renderChat();
});

function startEditing(id) {
    const m = messages.find((x) => String(x.id) === String(id));
    if (!m) return;
    clearImage();
    editingId = m.id;
    messageInput.value = m.message;
    editBar.hidden = false;
    messageInput.focus();
}
function stopEditing() {
    if (editingId) messageInput.value = "";
    editingId = null;
    editBar.hidden = true;
}
cancelEdit.addEventListener("click", stopEditing);

// ---------- Delete ----------
async function deleteMessage(id) {
    if (!confirm("Delete this message?")) return;
    const msg = messages.find((m) => String(m.id) === String(id));
    const { error } = await supabaseClient.from("messages").delete().eq("id", id).eq("sender_id", me.id);
    if (error) return alert("Could not delete message: " + error.message);

    // Best effort: also remove the image file from Storage
    if (msg?.image_url) {
        const path = decodeURIComponent((msg.image_url.split(`/${BUCKET}/`)[1] || "").split("?")[0]);
        if (path) supabaseClient.storage.from(BUCKET).remove([path]).catch(() => {});
    }

    messages = messages.filter((m) => String(m.id) !== String(id));
    if (String(editingId) === String(id)) stopEditing();
    renderList();
    renderChat();
}

messageArea.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const id = btn.closest(".msg").dataset.id;
    btn.dataset.act === "edit" ? startEditing(id) : deleteMessage(id);
});

// ---------- Realtime ----------
function subscribe() {
    supabaseClient
        .channel("messages-" + me.id)
        .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, async ({ eventType, new: n, old: o }) => {
            if (eventType === "DELETE") {
                messages = messages.filter((m) => m.id !== o.id);
            } else {
                if (!rooms.some((r) => r.id === n.chatroom_id)) {
                    await loadRoomsAndMessages();
                    renderList();
                    if (active) renderChat();
                    return;
                }
                if (eventType === "INSERT") {
                    if (messages.some((m) => m.id === n.id)) return;
                    messages.push(n);
                } else if (eventType === "UPDATE") {
                    messages = messages.map((m) => (m.id === n.id ? n : m));
                }
            }
            renderList();
            if (active) renderChat();
        })
        .subscribe();
}

// ---------- Init ----------
function findRoomWith(otherId) {
    return rooms.find((r) => partnerId(r) === otherId);
}

async function init() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) { window.location.href = "/modules/account/login.html"; return; }
    me = user;

    await loadRoomsAndMessages();

    // msg.html?item=<id> | ?user=<id> | ?chatroom=<id>
    const params = new URLSearchParams(location.search);
    const itemParam = params.get("item");
    const userParam = params.get("user");
    const roomParam = params.get("chatroom");

    let otherId = userParam;
    if (itemParam) {
        const it = await loadItem(itemParam);
        if (it && it.donor_id !== me.id) {
            otherId = it.donor_id;
            pendingItemId = itemParam;
        }
    }

    if (roomParam) {
        active = rooms.find((r) => String(r.id) === roomParam) || null;
    } else if (otherId && otherId !== me.id) {
        await loadProfiles([otherId]);
        active =
            findRoomWith(otherId) ||
            { id: null, donor_id: otherId, recipient_id: me.id };
        if (pendingItemId) messageInput.value = "Hi, I'm interested in this item. Is it still available?";
    }

    renderList();
    await renderChat();
    subscribe();
}

init();
