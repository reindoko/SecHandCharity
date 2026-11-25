// =====================================================================
// 预约模块 / Appointments module
//
// 主要用法 / Main use:
//   别人（recipient）向我（donor）预约取货 → 我在这里查看时间、地点、日期，
//   先同意或拒绝；同意之后，取货完成时由我点 Complete，无法进行则点 Cancel。
//   Others (recipients) book a pickup with me (the donor) → I review the time, place and date,
//   accept or decline; once accepted, I mark it Complete after the pickup, or Cancel if it can't go ahead.
//
// 两个标签页 / Two tabs:
//   "Requests to me" = 别人向我预约（默认） / bookings others made with me (default)
//   "My bookings"    = 我向别人预约的（只读 + 编辑 / 取消） / bookings I made with others
//
// C 创建 (create) · R 查看 (view) · U 编辑 / 同意 / 完成 (edit / accept / complete) · D 取消 / 拒绝 (cancel / decline)
//
// 用到的数据表 / Tables used:
//   appointments      (id, donor_id, recipient_id, location, date, time, status, created_at)
//   appointment_items (id, appointment_id, item_id)
//   items             (id, donor_id, title, photo_urls, status)
//   chatrooms         (donor_id, recipient_id)
//   user_profiles     (id, username, avatar_url)
//
// 状态流程 / Status flow:
//   pending ──(donor accepts)──▶ accepted ──(donor completes)──▶ completed
//      └────(donor declines / either side cancels)────▶ cancelled
// =====================================================================
import { supabaseClient } from "/assets/js/supabase-client.js";

// 这些状态的物品不会出现在“选择物品”列表里（例如还是草稿）
// Items with these statuses are NOT offered in the item picker (e.g. still a draft)
const EXCLUDED_ITEM_STATUSES = ["drafted"];

const STATUS_LABEL = { pending: "Pending", accepted: "Accepted", completed: "Completed", cancelled: "Cancelled" };

// ---------- 页面元素 / DOM elements ----------
const $ = (id) => document.getElementById(id);
const tabsEl = $("tabs");
const newBadge = $("newBadge");
const colWho = $("colWho");
const apptList = $("apptList");
const detailsEl = $("details");
const modal = $("modal");
const apptForm = $("apptForm");
const formTitle = $("formTitle");
const fDonor = $("fDonor");
const fItems = $("fItems");
const fLocation = $("fLocation");
const fDate = $("fDate");
const fTime = $("fTime");
const formError = $("formError");
const submitBtn = $("submitBtn");

// ---------- 状态 / State ----------
let me = null;               // 当前登录用户 / current user
let appts = [];              // 和我有关的所有预约（新→旧） / all appointments involving me (newest first)
let view = "received";       // "received" = 别人向我预约；"sent" = 我向别人预约 / "received" = others booked me; "sent" = I booked others
let selectedId = null;       // 右边正在查看的预约 id / appointment shown on the right
let editingId = null;        // 正在编辑的预约 id（null = 新建） / appointment being edited (null = creating)
let busy = false;            // 防止重复提交 / prevents double submits
const profiles = new Map();  // 用户资料缓存 / user profile cache

// ---------- 工具函数 / Helpers ----------

// 转义 HTML，防止 XSS / Escape HTML to prevent XSS
const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const nameOf = (id) => profiles.get(id)?.username || "Unknown user";

// 日期 “11 DEC 2026” / Date like "11 DEC 2026"
const fmtDate = (d) =>
    new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

// 时间 “3:00 PM” / Time like "3:00 PM"
const fmtTime = (t) =>
    new Date(`1970-01-01T${t}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

// 今天的日期（本地时区，给日期输入框当最小值） / Today's date in local time (min for the date input)
function todayStr() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
}

// photo_urls 可能是单个链接、逗号分隔，或 JSON 数组；取第一张
// photo_urls may be one URL, comma-separated, or a JSON array; take the first
function firstPhoto(photo_urls) {
    if (!photo_urls) return "";
    try {
        const v = JSON.parse(photo_urls);
        if (Array.isArray(v)) return v[0] || "";
        if (typeof v === "string") return v;
    } catch { /* 不是 JSON / not JSON */ }
    return String(photo_urls).split(",")[0].trim();
}

const thumbHTML = (item) => {
    const img = firstPhoto(item?.photo_urls);
    return `<span class="thumb">${img ? `<img src="${esc(img)}" alt="">` : "🎁"}</span>`;
};

// 头像：有图片用图片，没有就用名字首字母 / Avatar: photo if there is one, otherwise the first letter of the name
const avatarHTML = (id) => {
    const url = profiles.get(id)?.avatar_url;
    return `<span class="avatar">${url ? `<img src="${esc(url)}" alt="">` : esc(nameOf(id).charAt(0).toUpperCase())}</span>`;
};

const EYE_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`;

// 当前标签页的预约：received = 我是 donor；sent = 我是 recipient
// Appointments of the current tab: received = I am the donor; sent = I am the recipient
const scoped = () => appts.filter((a) => (view === "received" ? a.donor_id === me.id : a.recipient_id === me.id));

// “别人向我预约、还没处理”的数量 / Number of incoming requests still waiting for my decision
const pendingForMe = () => appts.filter((a) => a.donor_id === me.id && a.status === "pending").length;

// 预约编号：按创建顺序 1,2,3… / Appointment number: 1,2,3… by creation order
function numbering() {
    const asc = [...scoped()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
    const map = new Map();
    asc.forEach((a, i) => map.set(a.id, i + 1));
    return map;
}

// ---------- 读取数据 (R) / Load data (READ) ----------
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

// 读取所有和我有关的预约，同时带出每个预约里的物品
// Load all appointments involving me, together with the items inside each one
async function loadAppointments() {
    const { data, error } = await supabaseClient
        .from("appointments")
        .select("*, appointment_items(item_id, items(id, title, photo_urls))")
        .or(`donor_id.eq.${me.id},recipient_id.eq.${me.id}`)
        .order("created_at", { ascending: false });
    if (error) {
        console.error("appointments:", error.message);
        apptList.innerHTML = `<li class="list-empty">Could not load appointments: ${esc(error.message)}</li>`;
        return false;
    }
    appts = data || [];
    await loadProfiles(appts.flatMap((a) => [a.donor_id, a.recipient_id]));
    return true;
}

// ---------- 画面渲染 / Render ----------

// 标签页：更新选中状态和红点 / Tabs: update the active state and the red badge
function renderTabs() {
    tabsEl.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === view));
    const n = pendingForMe();
    newBadge.textContent = n;
    newBadge.hidden = n === 0;                               // 有待处理的请求才显示红点 / show the badge only if requests are waiting
    colWho.textContent = view === "received" ? "Requested by" : "Donor";
}

// 左边的预约列表 / The appointment list on the left
function renderList() {
    renderTabs();
    const nums = numbering();
    const rows = scoped();

    if (!rows.length) {
        apptList.innerHTML = `<li class="list-empty">${
            view === "received"
                ? "Nobody has requested a pickup with you yet."
                : "You haven't booked any pickups yet. Open an item and choose “Book pickup”."
        }</li>`;
        return;
    }

    apptList.innerHTML = rows.map((a) => {
        const otherId = view === "received" ? a.recipient_id : a.donor_id;     // 列表里显示“对方” / show the other person
        // 等我处理：pending（同意/拒绝）或 accepted（完成/取消）/ waiting for me: pending (accept/decline) or accepted (complete/cancel)
        const needsMe = a.donor_id === me.id && (a.status === "pending" || a.status === "accepted");
        return `
        <li class="appt-row ${a.id === selectedId ? "selected" : ""} ${needsMe ? "needs-action" : ""}" data-id="${a.id}">
            <span class="no">${nums.get(a.id)}</span>
            <span class="who">${esc(nameOf(otherId))}</span>
            <span class="when"><strong>${fmtDate(a.date)}</strong><span>${fmtTime(a.time)}</span></span>
            <span class="where" title="${esc(a.location)}">${esc(a.location)}</span>
            <span class="badge st-${esc(a.status)}">${esc(STATUS_LABEL[a.status] || a.status)}</span>
            <button type="button" class="eye" title="View details">${EYE_SVG}</button>
        </li>`;
    }).join("");
}

// 右边的预约详情 / The details panel on the right
function renderDetails() {
    const a = scoped().find((x) => x.id === selectedId);
    if (!a) {
        detailsEl.innerHTML = `<div class="details-empty">Select an appointment<br>to see its details</div>`;
        return;
    }

    const nums = numbering();
    const isDonor = a.donor_id === me.id;
    const otherId = isDonor ? a.recipient_id : a.donor_id;
    const items = (a.appointment_items || []).map((r) => r.items).filter(Boolean);
    const active = a.status === "pending" || a.status === "accepted";   // 还能操作吗？ / still actionable?
    const mapQ = encodeURIComponent(a.location);

    const pendingForDonor = isDonor && a.status === "pending";
    const donorAccepted = isDonor && a.status === "accepted";

    // 按钮规则 / Button rules:
    //  Accept   → donor + pending
    //  Decline  → donor + pending
    //  Complete → donor + accepted（只有捐赠者能完成 / only the donor can complete）
    //  Edit     → pending 或 accepted / pending or accepted
    //  Cancel   → 其他还能操作的情况 / every other actionable case
    const buttons = [
        pendingForDonor ? `<button type="button" class="btn btn-primary" data-act="accept">✓ Accept</button>` : "",
        donorAccepted   ? `<button type="button" class="btn btn-primary" data-act="complete">✓ Complete</button>` : "",
        active          ? `<button type="button" class="btn btn-gray" data-act="edit">✎ Edit</button>` : "",
        pendingForDonor ? `<button type="button" class="btn btn-danger" data-act="decline">✕ Decline</button>` : "",
        active && !pendingForDonor ? `<button type="button" class="btn btn-danger" data-act="cancel">✕ Cancel</button>` : "",
    ].join("");

    const note =
        pendingForDonor          ? `<p class="d-note is-action"><strong>${esc(nameOf(a.recipient_id))}</strong> would like to pick up these items at the time and place below. Please accept or decline.</p>` :
        donorAccepted            ? `<p class="d-note is-action">You accepted this request. After the pickup, mark it <strong>Complete</strong> — or <strong>Cancel</strong> if it can't go ahead.</p>` :
        a.status === "pending"   ? `<p class="d-note">Waiting for the donor to accept this appointment.</p>` :
        a.status === "accepted"  ? `<p class="d-note">Accepted. The donor will mark it completed after the pickup.</p>` :
        a.status === "completed" ? `<p class="d-note">This appointment is completed. 🎉</p>` :
        a.status === "cancelled" ? `<p class="d-note">This appointment was declined or cancelled.</p>` : "";

    detailsEl.innerHTML = `
        <div class="d-hero st-${esc(a.status)}">
            <div class="d-hero-top">
                <span class="d-hero-no">Appointment #${nums.get(a.id)}</span>
                <span class="d-hero-status">${esc(STATUS_LABEL[a.status] || a.status)}</span>
            </div>
            <div class="d-hero-when">
                <div class="chip"><small>Date</small><strong>${fmtDate(a.date)}</strong></div>
                <div class="chip"><small>Time</small><strong>${fmtTime(a.time)}</strong></div>
            </div>
        </div>

        ${note}

        <section class="d-card">
            <h3 class="sec-title">Donation Items (${items.length})</h3>
            ${items.length
                ? `<ul class="d-items">${items.map((it) => `<li class="d-item">${thumbHTML(it)}<span>${esc(it.title || "Item")}</span></li>`).join("")}</ul>`
                : `<p class="loc" style="color:var(--ink-faint)">No items attached.</p>`}
        </section>

        <section class="d-card">
            <h3 class="sec-title">People</h3>
            <div class="person">
                ${avatarHTML(a.recipient_id)}
                <div><small>Requested by</small><strong>${esc(nameOf(a.recipient_id))}${!isDonor ? " (You)" : ""}</strong></div>
            </div>
            <div class="person">
                ${avatarHTML(a.donor_id)}
                <div><small>Donor</small><strong>${esc(nameOf(a.donor_id))}${isDonor ? " (You)" : ""}</strong></div>
            </div>
            <a class="btn btn-ghost btn-block" href="/modules/messaging/msg.html?user=${esc(otherId)}">💬 Message ${esc(nameOf(otherId))}</a>
        </section>

        <section class="d-card">
            <h3 class="sec-title">Pickup Location</h3>
            <p class="loc-line">📍 ${esc(a.location)}</p>
            <!-- 地图：用 Google 地图嵌入，不需要 API key；点击在新标签页打开 -->
            <!-- Map: Google Maps embed (no API key); click opens it in a new tab -->
            <div class="map-box">
                <iframe src="https://maps.google.com/maps?q=${mapQ}&z=15&output=embed" loading="lazy" tabindex="-1" title="Map"></iframe>
                <a href="https://www.google.com/maps/search/?api=1&query=${mapQ}" target="_blank" rel="noopener"><span>Click to view in Maps</span></a>
            </div>
        </section>

        ${buttons ? `<div class="d-actions">${buttons}</div>` : ""}`;
}

function renderAll() {
    renderList();
    renderDetails();
}

// ---------- 点击事件 / Click handling ----------

// 切换标签页：Requests to me / My bookings / Switch tab
tabsEl.addEventListener("click", (e) => {
    const t = e.target.closest(".tab");
    if (!t || t.dataset.view === view) return;
    view = t.dataset.view;
    selectedId = null;
    renderAll();
});

// 点击某一行 → 在右边显示详情 / Click a row → show details on the right
apptList.addEventListener("click", (e) => {
    const row = e.target.closest(".appt-row");
    if (!row) return;
    selectedId = Number(row.dataset.id);
    renderAll();
    if (window.innerWidth <= 1100) detailsEl.scrollIntoView({ behavior: "smooth", block: "start" });
});

// 详情里的按钮（事件委托） / Buttons inside the details panel (event delegation)
detailsEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const a = appts.find((x) => x.id === selectedId);
    if (!a) return;
    switch (btn.dataset.act) {
        case "accept":   changeStatus(a, "accepted"); break;
        case "decline":  if (confirm("Decline this pickup request?")) changeStatus(a, "cancelled"); break;
        case "complete": if (confirm("Mark this appointment as completed?")) changeStatus(a, "completed"); break;
        case "cancel":   if (confirm("Cancel this appointment? This cannot be undone.")) changeStatus(a, "cancelled"); break;
        case "edit":     openForm("edit", a); break;
    }
});

// ---------- 修改状态：同意 / 拒绝 / 完成 / 取消 (U / D) ----------
// Change status: accept / decline / complete / cancel
async function changeStatus(a, status) {
    if (busy) return;
    busy = true;
    const { data, error } = await supabaseClient
        .from("appointments")
        .update({ status })
        .eq("id", a.id)
        .select()
        .single();
    busy = false;
    if (error) return alert("Could not update appointment: " + error.message);
    Object.assign(a, data);     // 合并新数据，保留已载入的物品 / merge new data, keep the loaded items
    renderAll();
}

// ---------- 新建 / 编辑弹窗 / Create / Edit modal ----------
// “新建”只会从别的页面（物品页、聊天）带着网址参数跳进来时打开；这个页面没有新建按钮
// "Create" only opens when another page (item page, chat) links here with URL parameters; this page has no "new" button

function showErr(msg) {
    formError.textContent = msg;
    formError.hidden = false;
}

function closeForm() {
    modal.hidden = true;
}

// 打开弹窗 / Open the modal
//   mode "create": 别人向捐赠者预约（可带 preset.donor / preset.item 预选）
//   mode "edit"  : 编辑取货信息（只能改地点、日期、时间）
async function openForm(mode, appt = null, preset = {}) {
    editingId = mode === "edit" ? appt.id : null;
    formError.hidden = true;
    apptForm.reset();
    modal.classList.toggle("is-edit", mode === "edit");
    fDonor.required = mode === "create";            // 隐藏的栏位不能设为必填 / hidden fields must not be required
    fDate.min = todayStr();
    formTitle.textContent = mode === "edit" ? "Edit pickup details" : "Book a pickup";
    submitBtn.textContent = mode === "edit" ? "Save changes" : "Send request";

    if (mode === "edit") {
        fLocation.value = appt.location;
        fDate.value = appt.date;
        fTime.value = appt.time.slice(0, 5);
    } else {
        await fillDonors(preset.donor);
        if (fDonor.value) await fillItems(fDonor.value, preset.item);
    }
    modal.hidden = false;
    (mode === "edit" ? fLocation : fDonor).focus();
}

// 捐赠者下拉：我聊过天的捐赠者（我是 recipient） + 网址指定的捐赠者
// Donor dropdown: donors I have chatted with (I am the recipient) + the one from the URL
async function fillDonors(preselect) {
    const { data } = await supabaseClient.from("chatrooms").select("donor_id").eq("recipient_id", me.id);
    const ids = new Set((data || []).map((r) => r.donor_id));
    if (preselect) ids.add(preselect);
    ids.delete(me.id);                              // 不能和自己预约 / can't book with yourself
    await loadProfiles([...ids]);

    if (!ids.size) {
        fDonor.innerHTML = `<option value="">No donors yet — start a chat with a donor first</option>`;
        fItems.innerHTML = `<p class="hint">Choose a donor to see their items.</p>`;
        return;
    }
    fDonor.innerHTML =
        `<option value="">Select a donor…</option>` +
        [...ids].map((id) => `<option value="${esc(id)}">${esc(nameOf(id))}</option>`).join("");
    if (preselect && ids.has(preselect)) fDonor.value = preselect;
    else fItems.innerHTML = `<p class="hint">Choose a donor to see their items.</p>`;
}

// 物品多选列表：该捐赠者的物品 / Item checklist: the chosen donor's items
async function fillItems(donorId, preselectItem) {
    fItems.innerHTML = `<p class="hint">Loading…</p>`;
    const { data, error } = await supabaseClient
        .from("items")
        .select("id, title, photo_urls, status")
        .eq("donor_id", donorId)
        .order("created_at", { ascending: false });
    if (error) { fItems.innerHTML = `<p class="hint">Could not load items: ${esc(error.message)}</p>`; return; }

    const list = (data || []).filter((i) => !EXCLUDED_ITEM_STATUSES.includes(String(i.status || "").toLowerCase()));
    if (!list.length) { fItems.innerHTML = `<p class="hint">This donor has no items available.</p>`; return; }

    fItems.innerHTML = list.map((i) => `
        <label class="item-opt">
            <input type="checkbox" value="${i.id}" ${String(i.id) === String(preselectItem) ? "checked" : ""}>
            ${thumbHTML(i)}
            <span class="t">${esc(i.title || "Item")}</span>
        </label>`).join("");
}

fDonor.addEventListener("change", () => {
    if (fDonor.value) fillItems(fDonor.value);
    else fItems.innerHTML = `<p class="hint">Choose a donor to see their items.</p>`;
});

$("closeModal").addEventListener("click", closeForm);
$("cancelForm").addEventListener("click", closeForm);
modal.addEventListener("click", (e) => { if (e.target === modal) closeForm(); });         // 点击背景关闭 / click backdrop to close
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeForm(); });

// 提交表单 / Submit the form
apptForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    formError.hidden = true;

    const location = fLocation.value.trim();
    const date = fDate.value;
    const time = fTime.value;
    if (!location || !date || !time) return showErr("Please fill in the location, date and time.");
    if (new Date(`${date}T${time}`) < new Date()) return showErr("The pickup time must be in the future.");

    busy = true;
    submitBtn.disabled = true;
    try {
        if (editingId) await saveEdit(editingId, { location, date, time });
        else await createAppointment({ location, date, time });
        closeForm();
        renderAll();
    } catch (err) {
        showErr(err.message || String(err));
    } finally {
        busy = false;
        submitBtn.disabled = false;
    }
});

// ---------- 创建预约 (C) / Create ----------
// 我（recipient）向捐赠者发出取货请求 / I (the recipient) send a pickup request to the donor
async function createAppointment({ location, date, time }) {
    const donorId = fDonor.value;
    const itemIds = [...fItems.querySelectorAll("input:checked")].map((i) => Number(i.value));
    if (!donorId) throw new Error("Please choose a donor.");
    if (!itemIds.length) throw new Error("Please select at least one item.");

    // 1) 创建预约（状态默认 pending，等捐赠者同意） / Create the appointment (status defaults to pending, awaiting the donor)
    const { data: appt, error } = await supabaseClient
        .from("appointments")
        .insert({ donor_id: donorId, recipient_id: me.id, location, date, time })
        .select()
        .single();
    if (error) throw error;

    // 2) 加入物品；失败就把刚才的预约删掉，避免留下空预约
    // Attach the items; on failure, delete the appointment so no empty one is left behind
    const { error: itemsErr } = await supabaseClient
        .from("appointment_items")
        .insert(itemIds.map((item_id) => ({ appointment_id: appt.id, item_id })));
    if (itemsErr) {
        await supabaseClient.from("appointments").delete().eq("id", appt.id);
        throw itemsErr;
    }

    view = "sent";                                   // 切到 “My bookings” 看刚发出的请求 / jump to "My bookings" to see it
    await loadAppointments();
    selectedId = appt.id;
}

// ---------- 编辑取货信息 (U) / Edit pickup details ----------
async function saveEdit(id, { location, date, time }) {
    const a = appts.find((x) => x.id === id);
    // 如果是 recipient 改了已接受的预约，要回到 pending，让捐赠者重新同意；捐赠者自己改则不变
    // If the recipient changes an accepted appointment it returns to pending so the donor re-confirms;
    // if the donor edits it, the status stays as it is
    const status = a?.status === "accepted" && a.recipient_id === me.id ? "pending" : a?.status;
    const { data, error } = await supabaseClient
        .from("appointments")
        .update({ location, date, time, status })
        .eq("id", id)
        .select()
        .single();
    if (error) throw error;
    Object.assign(a, data);
}

// ---------- 实时更新 / Realtime ----------
// 需要在 Supabase 为 appointments 和 appointment_items 打开 Realtime
// Requires Realtime enabled on appointments and appointment_items in Supabase
let refreshTimer;
function subscribe() {
    const refresh = () => {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(async () => {          // 稍等一下，让物品也写完 / wait a moment so the items are written too
            if (await loadAppointments()) renderAll();
        }, 400);
    };
    supabaseClient
        .channel("appts-" + me.id)
        .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "appointment_items" }, refresh)
        .subscribe();
}

// ---------- 初始化 / Init ----------
async function init() {
    // 没登录就跳去登录页 / Redirect to login if not signed in
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) { window.location.href = "/modules/account/login.html"; return; }
    me = user;

    await loadAppointments();

    // 网址参数 / URL parameters:
    //   Appointments.html?id=<预约id>                  直接打开某个预约的详情 / open an appointment's details
    //   Appointments.html?donor=<用户id>&item=<物品id>  打开“Book a pickup”弹窗并预选 / open the "Book a pickup" modal, preselected
    //   Appointments.html?item=<物品id>                只给物品，自动找出它的捐赠者 / item only: find its donor automatically
    const params = new URLSearchParams(location.search);
    const idParam = params.get("id");
    let donorParam = params.get("donor");
    const itemParam = params.get("item");

    const target = idParam ? appts.find((a) => a.id === Number(idParam)) : null;
    if (target) {
        view = target.donor_id === me.id ? "received" : "sent";
        selectedId = target.id;
    }

    renderAll();
    subscribe();

    if (itemParam && !donorParam) {
        const { data } = await supabaseClient.from("items").select("donor_id").eq("id", itemParam).maybeSingle();
        donorParam = data?.donor_id || null;
    }
    if (donorParam && donorParam !== me.id) openForm("create", null, { donor: donorParam, item: itemParam });
}

init();
