// =====================================================================
// 消息模块 / Messaging module
// C 发送 (send) · R 查看 (view) · U 编辑 (edit) · D 删除 (delete) + 图片附件 (image attachments)
//
// 用到的数据表 / Tables used:
//   user_profiles (id, username, avatar_url)
//   items         (id, donor_id, title, location, photo_urls)
//   chatrooms     (id, donor_id, recipient_id)
//   messages      (id, chatroom_id, sender_id, item_id, message, image_url, edited_at)
// 图片存放 / Image storage: Supabase Storage bucket "photos" (messages/ folder)
// =====================================================================
import { supabaseClient } from "/assets/js/supabase-client.js";

const BUCKET = "photos";     // 图片 bucket 名字 / storage bucket name
const MAX_IMAGE_MB = 5;      // 图片大小上限 (MB) / max image size in MB

// ---------- 页面元素 / DOM elements ----------
const $ = (id) => document.getElementById(id);
const chatList = $("chatList");           // 左边聊天列表 / left chat list
const chatSearch = $("chatSearch");       // 搜索框 / search box
const chatEmpty = $("chatEmpty");         // “请选择聊天” 提示 / "select a chat" placeholder
const chatView = $("chatView");           // 聊天内容整体 / whole chat view
const chatName = $("chatName");           // 对方名字 / partner name
const chatAvatar = $("chatAvatar");       // 对方头像 / partner avatar
const messageArea = $("messageArea");     // 消息显示区 / message area
const messageForm = $("messageForm");     // 输入表单 / input form
const messageInput = $("messageInput");   // 文字输入框 / text input
const editBar = $("editBar");             // 编辑提示条 / edit bar
const cancelEdit = $("cancelEdit");       // 取消编辑按钮 / cancel-edit button
const attachBtn = $("attachBtn");         // 📎 按钮 / attach button
const imageInput = $("imageInput");       // 隐藏的文件选择框 / hidden file input
const imagePreview = $("imagePreview");   // 图片预览区 / image preview box
const previewImg = $("previewImg");       // 预览图片 / preview image
const removeImage = $("removeImage");     // 取消图片 ✕ / remove-image button
const sendBtn = messageForm.querySelector(".send-btn");   // 发送按钮 / send button

// ---------- 状态 / State ----------
let me = null;                 // 当前登录用户 / current logged-in user
let rooms = [];                // 我所在的聊天室 / chatrooms I belong to
let messages = [];             // 所有消息（旧→新） / all messages (oldest → newest)
let active = null;             // 当前打开的聊天室；id 为 null 表示还没保存的新聊天 / open room; id === null = unsaved draft
let editingId = null;          // 正在编辑的消息 id / id of the message being edited
let pendingItemId = null;      // 要附带的物品 id（来自 ?item=） / item to attach (from ?item=)
let pendingImage = null;       // 已选择但还没发送的图片文件 / picked image file not yet sent
let sending = false;           // 是否正在发送（防止重复点击） / sending flag (prevents double clicks)
const profiles = new Map();    // 用户资料缓存 / user profile cache
const items = new Map();       // 物品资料缓存 / item cache

// ---------- 工具函数 / Helpers ----------

// 转义 HTML，防止 XSS 攻击 / Escape HTML to prevent XSS
const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 找出聊天室里“对方”的 id / Get the other person's id in a room
const partnerId = (room) => (room.donor_id === me.id ? room.recipient_id : room.donor_id);
const nameOf = (id) => profiles.get(id)?.username || "Unknown user";
// 名字缩写（没有头像时显示） / Initials (shown when there is no avatar)
const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";

// 头像 HTML：有图用图，没有就用缩写 / Avatar HTML: image if available, otherwise initials
function avatarHTML(id) {
    const p = profiles.get(id);
    return p?.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : esc(initials(nameOf(id)));
}

// 时间格式：今天显示时间，一周内显示星期，否则显示日期
// Time format: today → time, within a week → weekday, otherwise → date
function formatTime(iso) {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString())
        return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return (now - d) / 86400000 < 7
        ? d.toLocaleDateString([], { weekday: "short" })
        : d.toLocaleDateString([], { day: "numeric", month: "short" });
}

// photo_urls 是文字栏位：可能是单个链接、逗号分隔，或 JSON 数组；取第一张
// photo_urls is a text column: single URL, comma-separated, or JSON array; take the first one
function firstPhoto(photo_urls) {
    if (!photo_urls) return "";
    try {
        const v = JSON.parse(photo_urls);
        if (Array.isArray(v)) return v[0] || "";
        if (typeof v === "string") return v;
    } catch { /* 不是 JSON / not JSON */ }
    return String(photo_urls).split(",")[0].trim();
}

const roomMessages = (roomId) => messages.filter((m) => m.chatroom_id === roomId);                 // 某聊天室的消息 / messages in a room
const lastMessage = (roomId) => { const l = roomMessages(roomId); return l[l.length - 1] || null; };  // 最后一条 / last message
// 列表预览文字：纯图片消息显示 “📷 Photo” / List preview text: image-only → "📷 Photo"
const previewText = (m) => (m.message ? m.message : m.image_url ? "📷 Photo" : "");

// ---------- 读取数据 (R) / Load data (READ) ----------

// 读取用户资料（只读还没缓存的） / Load user profiles (only the ones not cached yet)
async function loadProfiles(ids) {
    const missing = [...new Set(ids)].filter((id) => id && !profiles.has(id));
    if (!missing.length) return;
    const { data, error } = await supabaseClient
        .from("user_profiles")
        .select("id, username, avatar_url")
        .in("id", missing);
    if (error) console.error("user_profiles:", error.message);
    (data || []).forEach((p) => profiles.set(p.id, p));
    // 读不到的用户用占位名字，避免页面出错 / Fallback name so the UI never breaks
    missing.forEach((id) => { if (!profiles.has(id)) profiles.set(id, { id, username: "Unknown user" }); });
}

// 读取物品（用于物品卡片） / Load an item (for the item card)
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

// 读取我的所有聊天室和消息 / Load all my chatrooms and messages
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

// ---------- 画面渲染 / Render ----------

// 左边列表要显示的聊天室，按最新消息排序 / Rooms for the left list, newest activity first
function listRooms() {
    const all = [...rooms];
    if (active && active.id === null) all.push(active);   // 还没保存的新聊天 / unsaved draft chat
    return all.sort((a, b) => {
        const ta = lastMessage(a.id)?.created_at || a.created_at || "9999";
        const tb = lastMessage(b.id)?.created_at || b.created_at || "9999";
        return tb.localeCompare(ta);
    });
}

// 这个聊天室是不是当前打开的 / Is this the currently open room?
const isActive = (room) => active && (room === active || (room.id !== null && room.id === active.id));

// 画左边的聊天列表（含搜索过滤） / Render the left chat list (with search filter)
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

// 画右边的聊天内容 / Render the right chat view
async function renderChat() {
    // 没有打开聊天：显示提示 / No chat open: show the placeholder
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
    // 先把消息里用到的物品读好 / Preload items referenced by the messages
    await Promise.all([...new Set(thread.map((m) => m.item_id).filter(Boolean))].map(loadItem));

    let lastItem = null;
    let html = "";

    // 从物品页进来的新聊天：发送前先预览物品卡片 / New chat from an item page: preview the card before sending
    if (active.id === null && pendingItemId) {
        await loadItem(pendingItemId);
        html += itemCardHTML(items.get(pendingItemId), true);
    }

    html += thread.map((m) => {
        const mine = m.sender_id === me.id;
        let card = "";
        // 物品换了才再显示一次卡片 / Show the item card again only when the item changes
        if (m.item_id && m.item_id !== lastItem) {
            card = itemCardHTML(items.get(m.item_id), mine);
            lastItem = m.item_id;
        }
        // 图片（点击在新标签页打开大图） / Image (click opens full size in a new tab)
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
    // 注意：只有自己的消息有 Edit/Delete；纯图片消息没有 Edit
    // Note: only my own messages get Edit/Delete; image-only messages have no Edit

    messageArea.innerHTML = html;
    messageArea.scrollTop = messageArea.scrollHeight;   // 滚到最底部 / scroll to bottom
}

// 物品卡片 HTML / Item card HTML
function itemCardHTML(it, mine) {
    if (!it) return "";
    const img = firstPhoto(it.photo_urls);
    return `
    <div class="item-card ${mine ? "" : "theirs"}">
        <div class="thumb">${img ? `<img src="${esc(img)}" alt="">` : ""}</div>
        <div class="info"><strong>${esc(it.title || "Item")}</strong><span>📍 ${esc(it.location || "")}</span></div>
    </div>`;
}

// 图片加载完后再滚到底部（图片会改变高度） / Scroll to bottom again after images load (they change the height)
messageArea.addEventListener("load", (e) => {
    if (e.target.classList?.contains("chat-image")) messageArea.scrollTop = messageArea.scrollHeight;
}, true);

// ---------- 打开聊天 / Open a chat ----------
async function openRoom(room) {
    active = room;
    stopEditing();      // 切换聊天时取消编辑 / cancel editing when switching chats
    clearImage();       // 清掉还没发的图片 / drop any unsent image
    await loadProfiles([partnerId(room)]);
    renderList();
    await renderChat();
    messageInput.focus();
}

// 点击列表中的聊天项 / Click a chat row in the list
chatList.addEventListener("click", (e) => {
    const li = e.target.closest(".chat-item");
    if (!li) return;
    const key = li.dataset.room;
    const room = key === "draft" ? active : rooms.find((r) => String(r.id) === key);
    if (room) openRoom(room);
});
chatSearch.addEventListener("input", renderList);   // 输入搜索时实时过滤 / filter live while typing

// ---------- 图片附件 / Image attach ----------

// 点 📎 打开文件选择 / Click 📎 to open the file picker
attachBtn.addEventListener("click", () => {
    if (editingId) return;   // 编辑文字时不能换图片 / can't attach while editing text
    imageInput.click();
});

// 选好文件后：检查类型和大小，然后显示预览 / After picking: validate type & size, then show preview
imageInput.addEventListener("change", () => {
    const file = imageInput.files[0];
    imageInput.value = "";   // 让同一张图片可以重复选择 / allow picking the same file again
    if (!file) return;
    if (!file.type.startsWith("image/")) return alert("Please choose an image file.");
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) return alert(`Image must be under ${MAX_IMAGE_MB} MB.`);
    clearImage();
    pendingImage = file;
    previewImg.src = URL.createObjectURL(file);
    imagePreview.hidden = false;
});

// 清除已选择的图片 / Clear the picked image
function clearImage() {
    if (previewImg.src.startsWith("blob:")) URL.revokeObjectURL(previewImg.src);   // 释放内存 / free memory
    pendingImage = null;
    previewImg.removeAttribute("src");
    imagePreview.hidden = true;
}
removeImage.addEventListener("click", clearImage);

// 上传图片到 Storage，返回公开网址 / Upload to Storage and return the public URL
async function uploadImage(file) {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    // 路径：messages/用户id/时间戳-随机字符.扩展名 / path: messages/<user id>/<timestamp>-<random>.<ext>
    const path = `messages/${me.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabaseClient.storage.from(BUCKET).upload(path, file, { contentType: file.type });
    if (error) throw error;
    return supabaseClient.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// ---------- 发送 (C) / 编辑 (U) / Send (CREATE) / Edit (UPDATE) ----------

// 新聊天在发第一条消息时才真正创建聊天室 / A new chat's room is only created when the first message is sent
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

// 发送中：禁用按钮，防止重复发送 / While sending: disable buttons to prevent double sends
function setSending(v) {
    sending = v;
    sendBtn.disabled = v;
    attachBtn.disabled = v;
}

// 提交表单（发送新消息，或保存编辑） / Form submit (send a new message, or save an edit)
messageForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sending || !active) return;
    const text = messageInput.value.trim();

    if (editingId) {
        // ----- 保存编辑 (UPDATE) / Save an edit -----
        if (!text) return;
        setSending(true);
        const { data, error } = await supabaseClient
            .from("messages")
            .update({ message: text, edited_at: new Date().toISOString() })
            .eq("id", editingId)
            .eq("sender_id", me.id)    // 只能改自己的消息 / only edit my own messages
            .select()
            .single();
        setSending(false);
        if (error) return alert("Could not edit message: " + error.message);
        messages = messages.map((m) => (m.id === data.id ? data : m));
        stopEditing();
    } else {
        // ----- 发送新消息 (CREATE) / Send a new message -----
        if (!text && !pendingImage) return;   // 文字和图片至少要有一个 / need text or an image
        setSending(true);
        try {
            if (!(await ensureRoomSaved())) return;
            const imageUrl = pendingImage ? await uploadImage(pendingImage) : null;
            // message 栏位不能为空，纯图片就存空字符串 / message is NOT NULL, so image-only uses ""
            const row = { chatroom_id: active.id, sender_id: me.id, message: text };
            if (imageUrl) row.image_url = imageUrl;
            if (pendingItemId) row.item_id = Number(pendingItemId);
            const { data, error } = await supabaseClient.from("messages").insert(row).select().single();
            if (error) throw error;
            pendingItemId = null;   // 物品卡片只附在第一条消息上 / item card is attached to the first message only
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

// 开始编辑：把原文放回输入框 / Start editing: put the original text back in the input
function startEditing(id) {
    const m = messages.find((x) => String(x.id) === String(id));
    if (!m) return;
    clearImage();
    editingId = m.id;
    messageInput.value = m.message;
    editBar.hidden = false;
    messageInput.focus();
}
// 结束编辑 / Stop editing
function stopEditing() {
    if (editingId) messageInput.value = "";
    editingId = null;
    editBar.hidden = true;
}
cancelEdit.addEventListener("click", stopEditing);

// ---------- 删除 (D) / Delete ----------
async function deleteMessage(id) {
    if (!confirm("Delete this message?")) return;
    const msg = messages.find((m) => String(m.id) === String(id));
    const { error } = await supabaseClient.from("messages").delete().eq("id", id).eq("sender_id", me.id);
    if (error) return alert("Could not delete message: " + error.message);

    // 顺便删除 Storage 里的图片文件（失败也没关系） / Also remove the image file from Storage (best effort)
    if (msg?.image_url) {
        const path = decodeURIComponent((msg.image_url.split(`/${BUCKET}/`)[1] || "").split("?")[0]);
        if (path) supabaseClient.storage.from(BUCKET).remove([path]).catch(() => {});
    }

    messages = messages.filter((m) => String(m.id) !== String(id));
    if (String(editingId) === String(id)) stopEditing();
    renderList();
    renderChat();
}

// 点击消息上的 Edit / Delete 按钮（事件委托） / Click Edit / Delete on a message (event delegation)
messageArea.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const id = btn.closest(".msg").dataset.id;
    btn.dataset.act === "edit" ? startEditing(id) : deleteMessage(id);
});

// ---------- 实时更新 / Realtime ----------
// 需要在 Supabase 里为 messages 表打开 Realtime
// Requires Realtime to be enabled on the messages table in Supabase
function subscribe() {
    supabaseClient
        .channel("messages-" + me.id)
        .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, async ({ eventType, new: n, old: o }) => {
            if (eventType === "DELETE") {
                // 有消息被删除 / a message was deleted
                messages = messages.filter((m) => m.id !== o.id);
            } else {
                // 别人开了新聊天室：重新读取，让它出现在列表里
                // Someone started a new chatroom with me: reload so it shows up in the list
                if (!rooms.some((r) => r.id === n.chatroom_id)) {
                    await loadRoomsAndMessages();
                    renderList();
                    if (active) renderChat();
                    return;
                }
                if (eventType === "INSERT") {
                    // 新消息 / new message
                    if (messages.some((m) => m.id === n.id)) return;   // 自己刚发的已经加过了 / already added locally
                    messages.push(n);
                } else if (eventType === "UPDATE") {
                    // 消息被编辑 / message edited
                    messages = messages.map((m) => (m.id === n.id ? n : m));
                }
            }
            renderList();
            if (active) renderChat();
        })
        .subscribe();
}

// ---------- 初始化 / Init ----------
// 找出我和某人已有的聊天室 / Find my existing room with a given user
function findRoomWith(otherId) {
    return rooms.find((r) => partnerId(r) === otherId);
}

async function init() {
    // 检查登录，没登录就跳到登录页 / Check login; redirect to the login page if not signed in
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) { window.location.href = "/modules/account/login.html"; return; }
    me = user;

    await loadRoomsAndMessages();

    // 从其他页面跳转进来的网址参数 / URL parameters when coming from another page:
    //   msg.html?item=<物品id>     和该物品的捐赠者聊天，并附上物品卡片 / chat with the item's donor, item card attached
    //   msg.html?user=<用户id>     和指定用户聊天 / chat with a specific user
    //   msg.html?chatroom=<房间id> 打开已有的聊天室 / open an existing chatroom
    const params = new URLSearchParams(location.search);
    const itemParam = params.get("item");
    const userParam = params.get("user");
    const roomParam = params.get("chatroom");

    let otherId = userParam;
    if (itemParam) {
        const it = await loadItem(itemParam);
        if (it && it.donor_id !== me.id) {      // 自己不能和自己聊天 / can't chat with myself
            otherId = it.donor_id;
            pendingItemId = itemParam;
        }
    }

    if (roomParam) {
        active = rooms.find((r) => String(r.id) === roomParam) || null;
    } else if (otherId && otherId !== me.id) {
        await loadProfiles([otherId]);
        // 已有聊天室就打开；没有就准备一个新的（发第一条消息时才保存）
        // Open the existing room, or prepare a new one (saved on the first message)
        active =
            findRoomWith(otherId) ||
            { id: null, donor_id: otherId, recipient_id: me.id };
        if (pendingItemId) messageInput.value = "Hi, I'm interested in this item. Is it still available?";
    }

    renderList();
    await renderChat();
    subscribe();   // 开始监听实时更新 / start listening for realtime updates
}

init();
