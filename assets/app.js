const storeKey = "fivemTicketDesk";

const defaultState = {
  session: null,
  categories: [
    { name: "ใบแดง", color: "#b84a62" },
    { name: "เคสแก๊ง", color: "#1f7a8c" },
    { name: "บั๊กระบบ", color: "#d97706" },
    { name: "ร้องเรียนแอดมิน", color: "#2563eb" }
  ],
  users: [],
  tickets: [],
  archive: [],
  config: {
    provider: "local",
    url: "",
    key: "",
    table: "app_state"
  }
};

function getSiteConfig() {
  const cfg = window.FIVEM_TICKET_CONFIG || {};
  return {
    provider: cfg.databaseProvider || "local",
    url: cfg.supabaseUrl || "",
    key: cfg.supabaseAnonKey || "",
    table: cfg.supabaseStateTable || "app_state",
    stateKey: cfg.supabaseStateKey || "main"
  };
}

function loadState() {
  const saved = localStorage.getItem(storeKey);
  const base = structuredClone(defaultState);
  base.config = { ...base.config, ...getSiteConfig() };
  if (!saved) return base;
  const parsed = JSON.parse(saved);
  const loaded = { ...base, ...parsed, config: { ...base.config, ...(parsed.config || {}) } };
  loaded.users = loaded.users || [];
  return loaded;
}

function saveState(options = {}) {
  localStorage.setItem(storeKey, JSON.stringify(state));
  if (!options.localOnly) {
    pushRemoteState();
  }
}

let state = loadState();
const page = document.body.dataset.page;

const rolePages = {
  SuperAdmin: ["dashboard", "tickets", "admin", "archive", "backend", "config", "stats"],
  Admin: ["dashboard", "tickets", "archive", "stats"],
  Guest: []
};

const pageLabels = {
  dashboard: "Dashboard",
  tickets: "Ticket",
  admin: "Admin",
  archive: "Archive",
  backend: "Backend",
  config: "Config",
  stats: "Stats"
};

function normalizeRole(role) {
  if (role === "Supervisor") return "SuperAdmin";
  if (role === "Viewer") return "Guest";
  return ["SuperAdmin", "Admin", "Guest", "Custom"].includes(role) ? role : "Guest";
}

function pagesToRole(pages = []) {
  const sorted = [...pages].sort().join(",");
  if (sorted === [...rolePages.SuperAdmin].sort().join(",")) return "SuperAdmin";
  if (sorted === [...rolePages.Admin].sort().join(",")) return "Admin";
  if (!pages.length) return "Guest";
  return "Custom";
}

function getUserPages(user) {
  if (Array.isArray(user?.pages)) return user.pages;
  return rolePages[normalizeRole(user?.role)] || [];
}

function normalizeUsers() {
  state.users = (state.users || []).map(user => ({
    id: user.id || crypto.randomUUID(),
    userId: user.userId || user.name || "",
    passwordHash: user.passwordHash || "",
    role: pagesToRole(getUserPages(user)),
    pages: getUserPages(user),
    active: user.active !== false
  })).filter(user => user.userId);
}

function canAccess(pageName = page) {
  if (pageName === "login" || pageName === "register") return true;
  return (state.session?.pages || rolePages[state.session?.role] || []).includes(pageName);
}

function redirectHomeForRole(role) {
  if (role === "SuperAdmin" || role === "Admin") window.location.href = "index.html";
}

function syncSessionRole() {
  if (!state.session) return;
  const user = state.users.find(item => item.userId === state.session.userId);
  if (!user || !user.active) {
    state.session = null;
    saveState({ localOnly: true });
    return;
  }
  state.session.role = normalizeRole(user.role);
  state.session.pages = getUserPages(user);
  state.session.name = user.userId;
}

function setupNavigation() {
  document.querySelectorAll(".nav a").forEach(link => {
    const href = link.getAttribute("href") || "";
    const targetPage = href.includes("dashboard") ? "dashboard"
      : href.includes("admin") ? "admin"
      : href.includes("archive") ? "archive"
      : href.includes("backend") ? "backend"
      : href.includes("config") ? "config"
      : href.includes("stats") ? "stats"
      : "tickets";
    if (!canAccess(targetPage)) {
      link.style.display = "none";
    }
  });
  document.querySelectorAll("[data-admin-only]").forEach(item => {
    item.hidden = !canAccess("admin");
  });
}

function updateConnectionLight(status = null) {
  const light = byId("connectionLight");
  if (!light) return;
  const online = status ?? isSupabaseReady();
  light.classList.toggle("online", Boolean(online));
  light.classList.toggle("offline", !online);
  light.title = online ? "เชื่อมต่อฐานข้อมูลแล้ว" : "ยังไม่เชื่อมต่อฐานข้อมูล";
}

function isSupabaseReady() {
  return state.config.provider === "supabase" && state.config.url && state.config.key && window.supabase;
}

function getSupabaseClient() {
  if (!isSupabaseReady()) return null;
  if (!window.fivemTicketSupabase) {
    window.fivemTicketSupabase = window.supabase.createClient(state.config.url, state.config.key);
  }
  return window.fivemTicketSupabase;
}

function publicState() {
  const copy = structuredClone(state);
  copy.session = null;
  delete copy.config;
  return copy;
}

async function pullRemoteState() {
  const client = getSupabaseClient();
  if (!client) return;
  const table = state.config.table || "app_state";
  const key = state.config.stateKey || "main";
  const { data, error } = await client.from(table).select("value").eq("key", key).maybeSingle();
  if (error) {
    console.warn("Supabase read failed", error);
    updateConnectionLight(false);
    return;
  }
  updateConnectionLight(true);
  if (data?.value) {
    const localSession = state.session;
    state = {
      ...structuredClone(defaultState),
      ...data.value,
      session: localSession,
      config: { ...state.config, ...(data.value.config || {}) }
    };
    normalizeUsers();
    saveState({ localOnly: true });
  }
}

async function pushRemoteState() {
  const client = getSupabaseClient();
  if (!client) return;
  const table = state.config.table || "app_state";
  const key = state.config.stateKey || "main";
  const { error } = await client.from(table).upsert({
    key,
    value: publicState(),
    updated_at: new Date().toISOString()
  });
  if (error) {
    console.warn("Supabase save failed", error);
  }
}

function requireSession() {
  if (page !== "login" && page !== "register" && !state.session) {
    window.location.href = "login.html";
    return false;
  }
  if (page !== "login" && page !== "register" && !canAccess()) {
    alert("บัญชีนี้ไม่มีสิทธิ์เข้าหน้านี้");
    window.location.href = "login.html";
    return false;
  }
  return true;
}

function byId(id) {
  return document.getElementById(id);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function nowLocalInput() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).replace("T", " ");
  return date.toLocaleString("th-TH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function priorityClass(value) {
  if (value === "สูง") return "high";
  if (value === "กลาง") return "mid";
  return "low";
}

function verdictClass(value) {
  if (value === "ผิด") return "no";
  if (value === "ไม่ผิด") return "ok";
  return "wait";
}

function getVoteCounts(ticket) {
  const adminVotes = ticket.adminVotes || [];
  if (adminVotes.length) {
    return {
      guilty: adminVotes.filter(vote => vote.vote === "ผิด").length,
      notGuilty: adminVotes.filter(vote => vote.vote === "ไม่ผิด").length
    };
  }
  return {
    guilty: Number(ticket.votes?.guilty || 0),
    notGuilty: Number(ticket.votes?.notGuilty || 0)
  };
}

function getCurrentAdminName() {
  return state.session?.userId || state.session?.name || "Unknown Admin";
}

async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function escapeText(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => alert("คัดลอกลิงก์แล้ว"));
}

function archiveSheetRows() {
  const headers = ["เลข TK", "ผู้แจ้ง", "เวลาบันทึก", "หมวดหมู่", "ความสำคัญ", "กำหนดส่ง", "สถานะ", "ผลตัดสิน", "ลิงก์ Discord", "ลิงก์รูป", "โหวตผิด", "โหวตไม่ผิด", "ผู้โหวต", "หมายเหตุ", "เวลาเข้าคลัง"];
  const rows = state.archive.map(ticket => {
    const counts = getVoteCounts(ticket);
    return [
      ticket.tkNumber,
      ticket.reporter,
      ticket.createdAt,
      ticket.category,
      ticket.priority,
      ticket.dueDate,
      ticket.status,
      ticket.verdict,
      (ticket.discordLinks || []).join(" | "),
      (ticket.imageLinks || []).join(" | "),
      counts.guilty,
      counts.notGuilty,
      (ticket.adminVotes || []).map(vote => `${vote.admin}:${vote.vote}`).join(" | "),
      ticket.note || "",
      ticket.archivedAt || ""
    ];
  });
  return [headers, ...rows];
}

function toCsvValue(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadTextFile(filename, text, type = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function seedData() {
  if (state.tickets.length) return;
  state.tickets = [
    {
      id: crypto.randomUUID(),
      tkNumber: "TK-1001",
      reporter: "Redline Gang",
      createdAt: nowLocalInput(),
      category: "ใบแดง",
      priority: "สูง",
      dueDate: todayIso(),
      status: "รอตัดสิน",
      verdict: "รอโหวต",
      discordLinks: ["https://discord.com/channels/server/ticket-1001"],
      imageLinks: ["https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=900&q=80"],
      votes: { guilty: 3, notGuilty: 1 },
      adminVotes: [],
      note: "เคสทะเลาะวิวาทในเมือง"
    },
    {
      id: crypto.randomUUID(),
      tkNumber: "TK-1002",
      reporter: "North Side",
      createdAt: nowLocalInput(),
      category: "เคสแก๊ง",
      priority: "กลาง",
      dueDate: todayIso(),
      status: "กำลังตรวจสอบ",
      verdict: "รอโหวต",
      discordLinks: ["https://discord.com/channels/server/ticket-1002"],
      imageLinks: [],
      votes: { guilty: 0, notGuilty: 2 },
      adminVotes: [],
      note: ""
    }
  ];
  saveState();
}

function setStorageMode() {
  updateConnectionLight();
}

function initLogin() {
  normalizeUsers();
  const form = byId("loginPageForm");
  const message = byId("loginMessage");
  if (!form) return;
  if (state.session?.role === "SuperAdmin" || state.session?.role === "Admin") {
    window.location.href = "index.html";
    return;
  }
  if (state.session?.role === "Guest") {
    message.textContent = "บัญชีนี้ยังเป็น Guest กรุณารอ SuperAdmin มอบสิทธิ์";
  }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const userId = byId("loginUserId").value.trim();
    const passwordHash = await hashPassword(byId("loginPassword").value);
    const user = state.users.find(item => item.userId === userId && item.passwordHash === passwordHash);
    if (!user) {
      message.textContent = "ID หรือ Pass ไม่ถูกต้อง";
      return;
    }
    if (!user.active) {
      message.textContent = "บัญชีนี้ถูกปิดใช้งาน";
      return;
    }
    state.session = { userId: user.userId, name: user.userId, role: normalizeRole(user.role), pages: getUserPages(user) };
    saveState({ localOnly: true });
    if (state.session.role === "Guest") {
      message.textContent = "บัญชีนี้ยังเป็น Guest ไม่สามารถเข้าหน้าใดได้";
      return;
    }
    window.location.href = "index.html";
  });
}

function initRegister() {
  normalizeUsers();
  const registerForm = byId("registerForm");
  const message = byId("loginMessage");
  if (!registerForm) return;
  registerForm.addEventListener("submit", async event => {
    event.preventDefault();
    const userId = byId("registerUserId").value.trim();
    if (state.users.some(user => user.userId === userId)) {
      message.textContent = "ID นี้ถูกใช้แล้ว";
      return;
    }
    const firstSuperAdmin = !state.users.some(user => user.role === "SuperAdmin" && user.passwordHash);
    const role = firstSuperAdmin ? "SuperAdmin" : "Guest";
    state.users.push({
      id: crypto.randomUUID(),
      userId,
      passwordHash: await hashPassword(byId("registerPassword").value),
      role,
      pages: rolePages[role],
      active: true
    });
    state.session = { userId, name: userId, role, pages: rolePages[role] };
    saveState();
    if (role === "SuperAdmin") {
      window.location.href = "index.html";
      return;
    }
    message.textContent = "สมัครแล้ว แต่ยังเป็น Guest กรุณารอ SuperAdmin มอบสิทธิ์";
  });
}

function initLogout() {
  document.querySelectorAll("[data-logout]").forEach(button => button.addEventListener("click", () => {
    state.session = null;
    saveState();
    window.location.href = "login.html";
  }));
}

function renderCategoryOptions() {
  const select = byId("category");
  if (!select) return;
  select.innerHTML = state.categories.map(item => `<option>${escapeText(item.name)}</option>`).join("");
}

function dynamicRow(container, value = "", copyable = false, onUpdate = null) {
  const row = document.createElement("div");
  row.className = "dynamic-row";
  row.innerHTML = `
    <input value="${escapeText(value)}" placeholder="วางลิงก์ที่นี่">
    ${copyable ? '<button type="button" class="ghost-button">Copy</button>' : '<span></span>'}
    <button type="button" class="danger-button">ลบ</button>
  `;
  const input = row.querySelector("input");
  input.addEventListener("input", () => onUpdate && onUpdate());
  if (copyable) row.querySelector(".ghost-button").addEventListener("click", () => copyText(input.value));
  row.querySelector(".danger-button").addEventListener("click", () => {
    row.remove();
    if (onUpdate) onUpdate();
  });
  container.appendChild(row);
}

function getRowValues(containerId) {
  return [...byId(containerId).querySelectorAll("input")]
    .map(input => input.value.trim())
    .filter(Boolean);
}

function renderImagePreview() {
  const preview = byId("imagePreview");
  if (!preview) return;
  const urls = getRowValues("imageLinks");
  preview.innerHTML = urls.map(url => `<img src="${escapeText(url)}" alt="หลักฐาน" loading="lazy">`).join("");
}

function resetTicketForm(ticket = null) {
  const counts = ticket ? getVoteCounts(ticket) : { guilty: 0, notGuilty: 0 };
  byId("ticketId").value = ticket?.id || "";
  byId("tkNumber").value = ticket?.tkNumber || "";
  byId("reporter").value = ticket?.reporter || "";
  byId("createdAt").value = ticket?.createdAt || nowLocalInput();
  byId("category").value = ticket?.category || state.categories[0]?.name || "";
  byId("priority").value = ticket?.priority || "กลาง";
  byId("dueDate").value = ticket?.dueDate || todayIso();
  byId("status").value = ticket?.status || "เปิดงาน";
  byId("verdictDisplay").value = ticket?.verdict || "รอโหวต";
  byId("voteGuilty").value = counts.guilty;
  byId("voteNotGuilty").value = counts.notGuilty;
  byId("note").value = ticket?.note || "";
  byId("discordLinks").innerHTML = "";
  byId("imageLinks").innerHTML = "";
  (ticket?.discordLinks?.length ? ticket.discordLinks : [""]).forEach(link => dynamicRow(byId("discordLinks"), link, true));
  (ticket?.imageLinks?.length ? ticket.imageLinks : [""]).forEach(link => dynamicRow(byId("imageLinks"), link, false, renderImagePreview));
  renderImagePreview();
}

function ticketFromForm() {
  const oldTicket = state.tickets.find(item => item.id === byId("ticketId").value);
  const counts = oldTicket ? getVoteCounts(oldTicket) : { guilty: 0, notGuilty: 0 };
  return {
    id: byId("ticketId").value || crypto.randomUUID(),
    tkNumber: byId("tkNumber").value.trim(),
    reporter: byId("reporter").value.trim(),
    createdAt: byId("createdAt").value,
    category: byId("category").value,
    priority: byId("priority").value,
    dueDate: byId("dueDate").value,
    status: byId("status").value,
    verdict: oldTicket?.verdict || "รอโหวต",
    discordLinks: getRowValues("discordLinks"),
    imageLinks: getRowValues("imageLinks"),
    votes: {
      guilty: counts.guilty,
      notGuilty: counts.notGuilty
    },
    adminVotes: oldTicket?.adminVotes || [],
    note: byId("note").value.trim()
  };
}

function renderTickets() {
  const rows = byId("ticketRows");
  if (!rows) return;
  const search = byId("ticketSearch").value.toLowerCase();
  const priority = byId("priorityFilter").value;
  const status = byId("statusFilter").value;
  const filtered = state.tickets.filter(ticket => {
    const hay = `${ticket.tkNumber} ${ticket.reporter} ${ticket.category}`.toLowerCase();
    return hay.includes(search) && (!priority || ticket.priority === priority) && (!status || ticket.status === status);
  });
  rows.innerHTML = filtered.map(ticket => {
    const counts = getVoteCounts(ticket);
    return `
    <tr data-view-row="${ticket.id}">
      <td><strong>${escapeText(ticket.tkNumber)}</strong></td>
      <td>${escapeText(ticket.reporter)}</td>
      <td>${escapeText(ticket.createdAt.replace("T", " "))}</td>
      <td>${escapeText(ticket.category)}</td>
      <td><span class="badge ${priorityClass(ticket.priority)}">${escapeText(ticket.priority)}</span></td>
      <td>${escapeText(ticket.dueDate)}</td>
      <td>${escapeText(ticket.status)}</td>
      <td><span class="badge ${verdictClass(ticket.verdict)}">${escapeText(ticket.verdict)}</span> ${counts.guilty}/${counts.notGuilty}</td>
      <td>
        <div class="row-actions">
          <button data-edit="${ticket.id}">แก้ไข</button>
          <button data-archive="${ticket.id}">เก็บ</button>
        </div>
      </td>
    </tr>
  `;
  }).join("");
  rows.querySelectorAll("[data-view-row]").forEach(row => row.addEventListener("click", () => openDetail(row.dataset.viewRow)));
  rows.querySelectorAll(".row-actions button").forEach(button => button.addEventListener("click", event => event.stopPropagation()));
  rows.querySelectorAll("[data-edit]").forEach(button => button.addEventListener("click", () => openEdit(button.dataset.edit)));
  rows.querySelectorAll("[data-archive]").forEach(button => button.addEventListener("click", () => archiveTicket(button.dataset.archive)));
  renderTicketMetrics();
}

function renderDetail(ticket) {
  ensureDetailModal();
  const counts = getVoteCounts(ticket);
  const currentVote = (ticket.adminVotes || []).find(vote => vote.admin === getCurrentAdminName());
  byId("detailTitle").textContent = `${ticket.tkNumber} - ${ticket.reporter}`;
  byId("detailHeadVote").innerHTML = `
    <div class="head-vote-card">
      <div class="head-vote-top">
        <strong>สรุปผลโหวต</strong>
        <button class="ghost-button" data-open-vote-log="${ticket.id}">ดูรายชื่อ</button>
      </div>
      <div class="head-vote-counts">
        <span>ผิด <b>${counts.guilty}</b></span>
        <span>ไม่ผิด <b>${counts.notGuilty}</b></span>
      </div>
      <div class="head-vote-actions">
        <button class="vote-icon-button down ${currentVote?.vote === "ผิด" ? "selected" : ""}" data-cast-vote="ผิด" title="โหวตว่าผิด" aria-label="โหวตว่าผิด">ผิด</button>
        <button class="vote-icon-button up ${currentVote?.vote === "ไม่ผิด" ? "selected" : ""}" data-cast-vote="ไม่ผิด" title="โหวตว่าไม่ผิด" aria-label="โหวตว่าไม่ผิด">ไม่ผิด</button>
      </div>
    </div>
  `;
  byId("ticketDetailBody").innerHTML = `
    <div class="detail-grid">
      <div class="detail-item"><span>เลข TK</span><strong>${escapeText(ticket.tkNumber)}</strong></div>
      <div class="detail-item"><span>ผู้แจ้ง</span><strong>${escapeText(ticket.reporter)}</strong></div>
      <div class="detail-item"><span>เวลาบันทึก</span><strong>${escapeText(ticket.createdAt.replace("T", " "))}</strong></div>
      <div class="detail-item"><span>หมวดหมู่</span><strong>${escapeText(ticket.category)}</strong></div>
      <div class="detail-item"><span>ความสำคัญ</span><strong>${escapeText(ticket.priority)}</strong></div>
      <div class="detail-item"><span>กำหนดส่ง</span><strong>${escapeText(ticket.dueDate)}</strong></div>
      <div class="detail-item"><span>สถานะ</span><strong>${escapeText(ticket.status)}</strong></div>
      <div class="detail-item"><span>ผลตัดสิน</span><strong>${escapeText(ticket.verdict)}</strong></div>
    </div>

    <section class="detail-panel detail-links-panel">
      <div class="section-title">
        <h3>ลิงก์ห้อง Discord</h3>
      </div>
      <div class="detail-links">
        ${(ticket.discordLinks || []).map(link => `
          <div class="link-row">
            <a href="${escapeText(link)}" target="_blank" rel="noreferrer">${escapeText(link)}</a>
            <button class="ghost-button" data-copy-detail="${escapeText(link)}">Copy</button>
          </div>
        `).join("") || "<p>ยังไม่มีลิงก์ Discord</p>"}
      </div>
    </section>

    <section class="detail-panel detail-media-panel">
      <div class="section-title">
        <h3>รูปหลักฐาน</h3>
      </div>
      <div class="detail-image-grid">
        ${(ticket.imageLinks || []).map(url => `<button class="evidence-thumb" data-zoom-image="${escapeText(url)}"><img src="${escapeText(url)}" alt="หลักฐาน" loading="lazy"></button>`).join("") || "<p>ยังไม่มีรูปหลักฐาน</p>"}
      </div>
    </section>

    <section class="detail-panel detail-note-panel">
      <div class="section-title"><h3>หมายเหตุ</h3></div>
      <p>${escapeText(ticket.note || "ไม่มีหมายเหตุ")}</p>
    </section>
  `;
  byId("ticketDetailBody").querySelectorAll("[data-copy-detail]").forEach(button => {
    button.addEventListener("click", () => copyText(button.dataset.copyDetail));
  });
  byId("detailHeadVote").querySelectorAll("[data-cast-vote]").forEach(button => {
    button.addEventListener("click", () => castAdminVote(ticket.id, button.dataset.castVote));
  });
  byId("ticketDetailBody").querySelectorAll("[data-zoom-image]").forEach(button => {
    button.addEventListener("click", () => openImageLightbox(button.dataset.zoomImage));
  });
  byId("detailHeadVote").querySelectorAll("[data-open-vote-log]").forEach(button => {
    button.addEventListener("click", () => openVoteDetail(button.dataset.openVoteLog));
  });
}

function openVoteDetail(id) {
  ensureVoteDetailModal();
  const ticket = state.tickets.find(item => item.id === id) || state.archive.find(item => item.id === id);
  if (!ticket) return;
  byId("voteDetailTitle").textContent = `รายชื่อผู้โหวต ${ticket.tkNumber}`;
  byId("voteDetailBody").innerHTML = (ticket.adminVotes || []).map(vote => `
    <div class="vote-log-item">
      <div>
        <strong>${escapeText(vote.admin)}</strong>
        <span>${escapeText(formatDateTime(vote.votedAt))}</span>
      </div>
      <span class="badge ${verdictClass(vote.vote)}">${escapeText(vote.vote)}</span>
    </div>
  `).join("") || `<p>ยังไม่มีแอดมินโหวต</p>`;
  byId("voteDetailModal").showModal();
}

function ensureVoteDetailModal() {
  if (byId("voteDetailModal")) return;
  const modal = document.createElement("dialog");
  modal.className = "modal compact-modal";
  modal.id = "voteDetailModal";
  modal.innerHTML = `
    <section class="modal-card">
      <header class="modal-head">
        <div>
          <p class="eyebrow">Vote Log</p>
          <h2 id="voteDetailTitle">รายชื่อผู้โหวต</h2>
        </div>
        <button class="icon-button close" type="button" data-close-vote-detail title="ปิด" aria-label="ปิด"></button>
      </header>
      <div id="voteDetailBody" class="vote-log-list"></div>
    </section>
  `;
  document.body.appendChild(modal);
  modal.querySelector("[data-close-vote-detail]").addEventListener("click", () => modal.close());
}

function openImageLightbox(url) {
  ensureImageLightbox();
  byId("lightboxImage").src = url;
  byId("imageLightbox").showModal();
}

function ensureImageLightbox() {
  if (byId("imageLightbox")) return;
  const modal = document.createElement("dialog");
  modal.className = "image-lightbox";
  modal.id = "imageLightbox";
  modal.innerHTML = `
    <button class="icon-button close" type="button" data-close-image title="ปิด" aria-label="ปิด"></button>
    <img id="lightboxImage" alt="หลักฐาน">
  `;
  document.body.appendChild(modal);
  modal.querySelector("[data-close-image]").addEventListener("click", () => modal.close());
  modal.addEventListener("click", event => {
    if (event.target === modal) modal.close();
  });
}

function ensureDetailModal() {
  if (byId("ticketDetailModal")) return;
  const modal = document.createElement("dialog");
  modal.className = "modal";
  modal.id = "ticketDetailModal";
  modal.innerHTML = `
    <section class="modal-card">
      <header class="modal-head">
        <div>
          <p class="eyebrow">Ticket Detail</p>
          <h2 id="detailTitle">รายละเอียด Ticket</h2>
        </div>
        <div class="detail-head-vote" id="detailHeadVote"></div>
        <button class="icon-button close" type="button" data-close-detail title="ปิด" aria-label="ปิด"></button>
      </header>
      <div id="ticketDetailBody" class="detail-body"></div>
    </section>
  `;
  document.body.appendChild(modal);
  modal.querySelector("[data-close-detail]").addEventListener("click", () => modal.close());
}

function openDetail(id) {
  ensureDetailModal();
  const ticket = state.tickets.find(item => item.id === id) || state.archive.find(item => item.id === id);
  if (!ticket) return;
  renderDetail(ticket);
  byId("ticketDetailModal").showModal();
}

function castAdminVote(id, voteValue) {
  const ticket = state.tickets.find(item => item.id === id);
  if (!ticket) {
    alert("Ticket นี้อยู่ในคลังแล้ว ไม่สามารถโหวตได้");
    return;
  }
  ticket.adminVotes = ticket.adminVotes || [];
  const admin = getCurrentAdminName();
  const existing = ticket.adminVotes.find(vote => vote.admin === admin);
  if (existing) {
    existing.vote = voteValue;
    existing.votedAt = new Date().toISOString();
  } else {
    ticket.adminVotes.push({ admin, vote: voteValue, votedAt: new Date().toISOString() });
  }
  const counts = getVoteCounts(ticket);
  ticket.votes = counts;
  if (counts.guilty > counts.notGuilty) ticket.verdict = "ผิด";
  if (counts.notGuilty > counts.guilty) ticket.verdict = "ไม่ผิด";
  if (counts.guilty === counts.notGuilty) ticket.verdict = "รอโหวต";
  saveState();
  renderTickets();
  renderDetail(ticket);
}

function renderTicketMetrics() {
  const open = state.tickets.filter(ticket => ticket.status !== "เสร็จแล้ว").length;
  const urgent = state.tickets.filter(ticket => ticket.priority === "สูง").length;
  const dueToday = state.tickets.filter(ticket => ticket.dueDate === todayIso()).length;
  const pending = state.tickets.filter(ticket => ticket.verdict === "รอโหวต").length;
  if (byId("openCount")) byId("openCount").textContent = open;
  if (byId("urgentCount")) byId("urgentCount").textContent = urgent;
  if (byId("dueTodayCount")) byId("dueTodayCount").textContent = dueToday;
  if (byId("votePendingCount")) byId("votePendingCount").textContent = pending;
}

function initDashboard() {
  renderTicketMetrics();
  const rows = byId("dashboardRows");
  if (!rows) return;
  rows.innerHTML = state.tickets.slice(0, 8).map(ticket => `
    <tr>
      <td><strong>${escapeText(ticket.tkNumber)}</strong></td>
      <td>${escapeText(ticket.reporter)}</td>
      <td>${escapeText(ticket.category)}</td>
      <td><span class="badge ${priorityClass(ticket.priority)}">${escapeText(ticket.priority)}</span></td>
      <td>${escapeText(ticket.status)}</td>
      <td>${escapeText(ticket.dueDate)}</td>
    </tr>
  `).join("") || `<tr><td colspan="6">ยังไม่มี Ticket</td></tr>`;
}

function openEdit(id) {
  const ticket = state.tickets.find(item => item.id === id);
  if (!ticket) return;
  byId("modalTitle").textContent = "แก้ไข Ticket";
  resetTicketForm(ticket);
  byId("ticketModal").showModal();
}

function archiveTicket(id) {
  const ticket = state.tickets.find(item => item.id === id);
  if (!ticket || !confirm(`เก็บ ${ticket.tkNumber} เข้าคลังใช่ไหม`)) return;
  state.tickets = state.tickets.filter(item => item.id !== id);
  state.archive.unshift({ ...ticket, archivedAt: new Date().toISOString() });
  saveState();
  renderTickets();
}

function initTickets() {
  renderCategoryOptions();
  setStorageMode();
  byId("ticketSearch").addEventListener("input", renderTickets);
  byId("priorityFilter").addEventListener("change", renderTickets);
  byId("statusFilter").addEventListener("change", renderTickets);
  byId("addDiscordLink").addEventListener("click", () => dynamicRow(byId("discordLinks"), "", true));
  byId("addImageLink").addEventListener("click", () => dynamicRow(byId("imageLinks"), "", false, renderImagePreview));
  byId("ticketForm").addEventListener("submit", event => {
    event.preventDefault();
    const ticket = ticketFromForm();
    const index = state.tickets.findIndex(item => item.id === ticket.id);
    if (index >= 0) state.tickets[index] = ticket;
    else state.tickets.unshift(ticket);
    saveState();
    byId("ticketModal").close();
    renderTickets();
  });
  document.querySelectorAll("[data-open-modal]").forEach(button => button.addEventListener("click", () => {
    byId("modalTitle").textContent = "เพิ่ม Ticket";
    resetTicketForm();
    byId(button.dataset.openModal).showModal();
  }));
  document.querySelectorAll("[data-close-modal]").forEach(button => button.addEventListener("click", () => {
    byId("ticketModal").close();
  }));
  document.querySelectorAll("[data-close-detail]").forEach(button => button.addEventListener("click", () => {
    byId("ticketDetailModal").close();
  }));
  document.querySelectorAll("[data-close-image]").forEach(button => button.addEventListener("click", () => {
    byId("imageLightbox").close();
  }));
  document.querySelectorAll("[data-close-vote-detail]").forEach(button => button.addEventListener("click", () => {
    byId("voteDetailModal").close();
  }));
  document.querySelector("[data-action='seed']").addEventListener("click", () => {
    seedData();
    renderTickets();
  });
  renderTickets();
}

function initArchive() {
  const input = byId("archiveSearch");
  const exportCsv = () => {
    const csv = archiveSheetRows().map(row => row.map(toCsvValue).join(",")).join("\n");
    downloadTextFile(`fivem-ticket-archive-${todayIso()}.csv`, `\ufeff${csv}`, "text/csv;charset=utf-8");
  };
  const copySheet = () => {
    const tsv = archiveSheetRows().map(row => row.map(value => String(value ?? "").replaceAll("\t", " ").replaceAll("\n", " ")).join("\t")).join("\n");
    navigator.clipboard.writeText(tsv).then(() => alert("คัดลอกข้อมูลแล้ว นำไปวางใน Google Sheets ได้เลย"));
  };
  const render = () => {
    const search = input.value.toLowerCase();
    byId("archiveRows").innerHTML = state.archive.filter(ticket => {
      const hay = `${ticket.tkNumber} ${ticket.reporter} ${ticket.category}`.toLowerCase();
      return hay.includes(search);
    }).map(ticket => `
      <tr>
        <td><strong>${escapeText(ticket.tkNumber)}</strong></td>
        <td>${escapeText(ticket.reporter)}</td>
        <td>${escapeText(ticket.category)}</td>
        <td><span class="badge ${priorityClass(ticket.priority)}">${escapeText(ticket.priority)}</span></td>
        <td><span class="badge ${verdictClass(ticket.verdict)}">${escapeText(ticket.verdict)}</span></td>
        <td>${ticket.discordLinks.map(link => `<button class="ghost-button" data-copy="${escapeText(link)}">Copy</button>`).join(" ")}</td>
        <td><div class="row-actions"><button data-view="${ticket.id}">ดู</button><button data-restore="${ticket.id}">ดึงกลับ</button><button data-delete="${ticket.id}">ลบ</button></div></td>
      </tr>
    `).join("");
    byId("archiveRows").querySelectorAll("[data-copy]").forEach(button => button.addEventListener("click", () => copyText(button.dataset.copy)));
    byId("archiveRows").querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => openDetail(button.dataset.view)));
    byId("archiveRows").querySelectorAll("[data-restore]").forEach(button => button.addEventListener("click", () => {
      const ticket = state.archive.find(item => item.id === button.dataset.restore);
      state.archive = state.archive.filter(item => item.id !== button.dataset.restore);
      state.tickets.unshift(ticket);
      saveState();
      render();
    }));
    byId("archiveRows").querySelectorAll("[data-delete]").forEach(button => button.addEventListener("click", () => {
      if (!confirm("ลบ Ticket นี้ถาวรใช่ไหม")) return;
      state.archive = state.archive.filter(item => item.id !== button.dataset.delete);
      saveState();
      render();
    }));
  };
  input.addEventListener("input", render);
  byId("exportArchiveCsv").addEventListener("click", exportCsv);
  byId("copyArchiveSheet").addEventListener("click", copySheet);
  byId("clearArchive").addEventListener("click", () => {
    if (!confirm("ลบคลังทั้งหมดใช่ไหม")) return;
    state.archive = [];
    saveState();
    render();
  });
  render();
}

function initAdmin() {
  normalizeUsers();
  const adminAccessCount = () => state.users.filter(user => user.active && getUserPages(user).includes("admin")).length;
  const pageSummary = user => {
    const pages = getUserPages(user);
    if (!pages.length) return "ไม่มีสิทธิ์";
    if (pages.length === Object.keys(pageLabels).length) return "ทุกหน้า";
    return pages.map(pageKey => pageLabels[pageKey]).join(", ");
  };
  const render = () => {
    byId("userRows").innerHTML = state.users.map(user => `
      <tr>
        <td><button class="link-button" data-edit-permissions="${user.id}">${escapeText(user.userId)}</button></td>
        <td><span class="badge wait">${escapeText(user.role)}</span></td>
        <td>${escapeText(pageSummary(user))}</td>
        <td><span class="badge ${user.active ? "ok" : "no"}">${user.active ? "ใช้งาน" : "ปิด"}</span></td>
        <td><div class="row-actions"><button data-toggle="${user.id}">สลับสถานะ</button><button data-remove="${user.id}">ลบ</button></div></td>
      </tr>
    `).join("");
    byId("userRows").querySelectorAll("[data-edit-permissions]").forEach(button => button.addEventListener("click", () => {
      openPermissionModal(button.dataset.editPermissions);
    }));
    byId("userRows").querySelectorAll("[data-toggle]").forEach(button => button.addEventListener("click", () => {
      const user = state.users.find(item => item.id === button.dataset.toggle);
      if (!user) return;
      if (user.active && getUserPages(user).includes("admin") && adminAccessCount() <= 1) {
        alert("ปิดบัญชีที่จัดการสิทธิ์ได้คนสุดท้ายไม่ได้");
        return;
      }
      user.active = !user.active;
      if (!user.active && state.session?.userId === user.userId) {
        state.session = null;
      }
      saveState();
      if (!state.session) {
        window.location.href = "login.html";
        return;
      }
      render();
    }));
    byId("userRows").querySelectorAll("[data-remove]").forEach(button => button.addEventListener("click", () => {
      const user = state.users.find(item => item.id === button.dataset.remove);
      if (!user) return;
      if (getUserPages(user).includes("admin") && adminAccessCount() <= 1) {
        alert("ลบบัญชีที่จัดการสิทธิ์ได้คนสุดท้ายไม่ได้");
        return;
      }
      if (!confirm(`ลบบัญชี ${user.userId} ใช่ไหม`)) return;
      state.users = state.users.filter(item => item.id !== button.dataset.remove);
      if (state.session?.userId === user.userId) {
        state.session = null;
      }
      saveState();
      if (!state.session) {
        window.location.href = "login.html";
        return;
      }
      render();
    }));
  };
  const openPermissionModal = userId => {
    const user = state.users.find(item => item.id === userId);
    if (!user) return;
    byId("permissionUserId").value = user.id;
    byId("permissionTitle").textContent = `สิทธิ์ของ ${user.userId}`;
    byId("permissionEditor").innerHTML = Object.entries(pageLabels).map(([pageKey, label]) => `
      <label><input type="checkbox" value="${pageKey}" ${getUserPages(user).includes(pageKey) ? "checked" : ""}>${label}</label>
    `).join("");
    byId("permissionModal").showModal();
  };
  document.querySelectorAll("[data-close-permission]").forEach(button => {
    button.addEventListener("click", () => byId("permissionModal").close());
  });
  byId("savePermissions").addEventListener("click", () => {
    const user = state.users.find(item => item.id === byId("permissionUserId").value);
    if (!user) return;
    const nextPages = [...byId("permissionEditor").querySelectorAll("input:checked")].map(input => input.value);
    if (getUserPages(user).includes("admin") && !nextPages.includes("admin") && adminAccessCount() <= 1) {
      alert("ต้องมีบัญชีที่จัดการสิทธิ์ได้อย่างน้อย 1 คน");
      return;
    }
    user.pages = nextPages;
    user.role = pagesToRole(nextPages);
    if (state.session?.userId === user.userId) {
      state.session.role = user.role;
      state.session.pages = user.pages;
    }
    saveState();
    byId("permissionModal").close();
    if (!canAccess("admin")) {
      window.location.href = "login.html";
      return;
    }
    render();
  });
  render();
}

function initBackend() {
  const render = () => {
    byId("categoryList").innerHTML = state.categories.map((item, index) => `
      <div class="category-item">
        <span class="color-dot" style="background:${escapeText(item.color)}"></span>
        <strong>${escapeText(item.name)}</strong>
        <button class="danger-button" data-remove-category="${index}">ลบ</button>
      </div>
    `).join("");
    byId("categoryList").querySelectorAll("[data-remove-category]").forEach(button => button.addEventListener("click", () => {
      state.categories.splice(Number(button.dataset.removeCategory), 1);
      saveState();
      render();
    }));
  };
  byId("categoryForm").addEventListener("submit", event => {
    event.preventDefault();
    state.categories.push({ name: byId("categoryName").value.trim(), color: byId("categoryColor").value });
    byId("categoryName").value = "";
    saveState();
    render();
  });
  render();
}

function initConfig() {
  byId("dbProvider").value = state.config.provider;
  byId("dbUrl").value = state.config.url;
  byId("dbKey").value = state.config.key;
  byId("dbTable").value = state.config.table;
  byId("configStatus").textContent = state.config.provider === "local" ? "Local Browser Demo" : state.config.provider;
  byId("saveConfig").addEventListener("click", () => {
    state.config = {
      provider: byId("dbProvider").value,
      url: byId("dbUrl").value.trim(),
      key: byId("dbKey").value.trim(),
      table: byId("dbTable").value.trim() || "app_state"
    };
    window.fivemTicketSupabase = null;
    saveState();
    byId("configStatus").textContent = state.config.provider === "local" ? "Local Browser Demo" : state.config.provider;
    alert("บันทึกค่าฐานข้อมูลแล้ว");
  });
}

function initStats() {
  const all = [...state.tickets, ...state.archive];
  const byReporter = all.reduce((acc, ticket) => {
    acc[ticket.reporter] = (acc[ticket.reporter] || 0) + 1;
    return acc;
  }, {});
  const entries = Object.entries(byReporter).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(item => item[1]));
  byId("totalTickets").textContent = all.length;
  byId("topReporter").textContent = entries[0]?.[0] || "-";
  byId("guiltyTotal").textContent = all.filter(ticket => ticket.verdict === "ผิด").length;
  byId("notGuiltyTotal").textContent = all.filter(ticket => ticket.verdict === "ไม่ผิด").length;
  byId("statsChart").innerHTML = entries.map(([name, count]) => `
    <div class="chart-row">
      <strong>${escapeText(name)}</strong>
      <div class="bar"><span style="width:${(count / max) * 100}%"></span></div>
      <span>${count}</span>
    </div>
  `).join("") || `<p>ยังไม่มีข้อมูล Ticket</p>`;
}

const initializers = {
  login: initLogin,
  register: initRegister,
  dashboard: initDashboard,
  tickets: initTickets,
  archive: initArchive,
  admin: initAdmin,
  backend: initBackend,
  config: initConfig,
  stats: initStats
};

async function boot() {
  await pullRemoteState();
  normalizeUsers();
  syncSessionRole();
  if (page !== "login") {
    if (!requireSession()) return;
    setupNavigation();
    updateConnectionLight();
    initLogout();
  }
  initializers[page]?.();
}

boot();
