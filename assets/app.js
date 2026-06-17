const storeKey = "fivemTicketDesk";

const defaultState = {
  session: null,
  categories: [
    { name: "ใบแดง", color: "#b84a62" },
    { name: "เคสแก๊ง", color: "#1f7a8c" },
    { name: "บั๊กระบบ", color: "#d97706" },
    { name: "ร้องเรียนแอดมิน", color: "#2563eb" }
  ],
  users: [
    { id: crypto.randomUUID(), name: "Owner", role: "Supervisor", permissions: "ทั้งหมด", active: true },
    { id: crypto.randomUUID(), name: "Admin A", role: "Admin", permissions: "Ticket, Archive", active: true },
    { id: crypto.randomUUID(), name: "Viewer", role: "Viewer", permissions: "ดูข้อมูล", active: true }
  ],
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
  return { ...base, ...parsed, config: { ...base.config, ...(parsed.config || {}) } };
}

function saveState(options = {}) {
  localStorage.setItem(storeKey, JSON.stringify(state));
  if (!options.localOnly) {
    pushRemoteState();
  }
}

let state = loadState();
const page = document.body.dataset.page;

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
    return;
  }
  if (data?.value) {
    const localSession = state.session;
    state = {
      ...structuredClone(defaultState),
      ...data.value,
      session: localSession,
      config: { ...state.config, ...(data.value.config || {}) }
    };
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
  if (page !== "login" && !state.session) {
    window.location.href = "login.html";
  }
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
      note: ""
    }
  ];
  saveState();
}

function setStorageMode() {
  const target = byId("storageMode");
  if (target) target.textContent = state.config.provider === "local" ? "Local Browser" : state.config.provider;
}

function initLogin() {
  const form = byId("loginPageForm");
  if (!form) return;
  if (state.session) window.location.href = "index.html";
  form.addEventListener("submit", event => {
    event.preventDefault();
    state.session = { name: byId("loginPageName").value.trim(), role: byId("loginPageRole").value };
    saveState();
    window.location.href = "index.html";
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
  byId("ticketId").value = ticket?.id || "";
  byId("tkNumber").value = ticket?.tkNumber || "";
  byId("reporter").value = ticket?.reporter || "";
  byId("createdAt").value = ticket?.createdAt || nowLocalInput();
  byId("category").value = ticket?.category || state.categories[0]?.name || "";
  byId("priority").value = ticket?.priority || "กลาง";
  byId("dueDate").value = ticket?.dueDate || todayIso();
  byId("status").value = ticket?.status || "เปิดงาน";
  byId("verdict").value = ticket?.verdict || "รอโหวต";
  byId("voteGuilty").value = ticket?.votes?.guilty || 0;
  byId("voteNotGuilty").value = ticket?.votes?.notGuilty || 0;
  byId("note").value = ticket?.note || "";
  byId("discordLinks").innerHTML = "";
  byId("imageLinks").innerHTML = "";
  (ticket?.discordLinks?.length ? ticket.discordLinks : [""]).forEach(link => dynamicRow(byId("discordLinks"), link, true));
  (ticket?.imageLinks?.length ? ticket.imageLinks : [""]).forEach(link => dynamicRow(byId("imageLinks"), link, false, renderImagePreview));
  renderImagePreview();
}

function ticketFromForm() {
  return {
    id: byId("ticketId").value || crypto.randomUUID(),
    tkNumber: byId("tkNumber").value.trim(),
    reporter: byId("reporter").value.trim(),
    createdAt: byId("createdAt").value,
    category: byId("category").value,
    priority: byId("priority").value,
    dueDate: byId("dueDate").value,
    status: byId("status").value,
    verdict: byId("verdict").value,
    discordLinks: getRowValues("discordLinks"),
    imageLinks: getRowValues("imageLinks"),
    votes: {
      guilty: Number(byId("voteGuilty").value || 0),
      notGuilty: Number(byId("voteNotGuilty").value || 0)
    },
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
  rows.innerHTML = filtered.map(ticket => `
    <tr>
      <td><strong>${escapeText(ticket.tkNumber)}</strong></td>
      <td>${escapeText(ticket.reporter)}</td>
      <td>${escapeText(ticket.createdAt.replace("T", " "))}</td>
      <td>${escapeText(ticket.category)}</td>
      <td><span class="badge ${priorityClass(ticket.priority)}">${escapeText(ticket.priority)}</span></td>
      <td>${escapeText(ticket.dueDate)}</td>
      <td>${escapeText(ticket.status)}</td>
      <td><span class="badge ${verdictClass(ticket.verdict)}">${escapeText(ticket.verdict)}</span></td>
      <td>
        <div class="row-actions">
          <button data-edit="${ticket.id}">แก้ไข</button>
          <button data-archive="${ticket.id}">เก็บ</button>
        </div>
      </td>
    </tr>
  `).join("");
  rows.querySelectorAll("[data-edit]").forEach(button => button.addEventListener("click", () => openEdit(button.dataset.edit)));
  rows.querySelectorAll("[data-archive]").forEach(button => button.addEventListener("click", () => archiveTicket(button.dataset.archive)));
  renderTicketMetrics();
}

function renderTicketMetrics() {
  const open = state.tickets.filter(ticket => ticket.status !== "เสร็จแล้ว").length;
  const urgent = state.tickets.filter(ticket => ticket.priority === "สูง").length;
  const dueToday = state.tickets.filter(ticket => ticket.dueDate === todayIso()).length;
  const pending = state.tickets.filter(ticket => ticket.verdict === "รอโหวต").length;
  byId("openCount").textContent = open;
  byId("urgentCount").textContent = urgent;
  byId("dueTodayCount").textContent = dueToday;
  byId("votePendingCount").textContent = pending;
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
  document.querySelector("[data-action='seed']").addEventListener("click", () => {
    seedData();
    renderTickets();
  });
  renderTickets();
}

function initArchive() {
  const input = byId("archiveSearch");
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
        <td><div class="row-actions"><button data-restore="${ticket.id}">ดึงกลับ</button><button data-delete="${ticket.id}">ลบ</button></div></td>
      </tr>
    `).join("");
    byId("archiveRows").querySelectorAll("[data-copy]").forEach(button => button.addEventListener("click", () => copyText(button.dataset.copy)));
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
  byId("clearArchive").addEventListener("click", () => {
    if (!confirm("ลบคลังทั้งหมดใช่ไหม")) return;
    state.archive = [];
    saveState();
    render();
  });
  render();
}

function initAdmin() {
  const render = () => {
    byId("userRows").innerHTML = state.users.map(user => `
      <tr>
        <td><strong>${escapeText(user.name)}</strong></td>
        <td>${escapeText(user.role)}</td>
        <td>${escapeText(user.permissions)}</td>
        <td><span class="badge ${user.active ? "ok" : "no"}">${user.active ? "ใช้งาน" : "ปิด"}</span></td>
        <td><div class="row-actions"><button data-toggle="${user.id}">สลับสถานะ</button><button data-remove="${user.id}">ลบ</button></div></td>
      </tr>
    `).join("");
    byId("userRows").querySelectorAll("[data-toggle]").forEach(button => button.addEventListener("click", () => {
      const user = state.users.find(item => item.id === button.dataset.toggle);
      user.active = !user.active;
      saveState();
      render();
    }));
    byId("userRows").querySelectorAll("[data-remove]").forEach(button => button.addEventListener("click", () => {
      state.users = state.users.filter(item => item.id !== button.dataset.remove);
      saveState();
      render();
    }));
  };
  byId("addUser").addEventListener("click", () => {
    const name = prompt("ชื่อผู้ใช้");
    if (!name) return;
    state.users.push({ id: crypto.randomUUID(), name, role: "Admin", permissions: "Ticket", active: true });
    saveState();
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
  tickets: initTickets,
  archive: initArchive,
  admin: initAdmin,
  backend: initBackend,
  config: initConfig,
  stats: initStats
};

async function boot() {
  requireSession();
  await pullRemoteState();
  if (page !== "login") initLogout();
  initializers[page]?.();
}

boot();
