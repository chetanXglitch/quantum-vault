/**
 * Quantum Vault - Frontend Application Controller
 * Handles UI separation, strict manual three-key decryption, dead-man-switch heartbeat,
 * reminder popups, and persistent notification logging.
 */

// Application State
const state = {
  activeView: "overview",
  isBackendOnline: false,
  files: [],
  recoveryRequests: [],
  notifications: [],
  unreadCount: 0,
  notificationFilter: "all",
  selectedUploadFiles: [],
  isUploading: false,
  searchQuery: "",
  tickerInterval: null,
  healthInterval: null,
  // Strict Manual Three-Key Decryption Wizard State (Stored in-memory ONLY)
  decryptWizard: {
    selectedFileId: null,
    selectedFileName: null,
    currentStep: 1,
    fragment1: "",
    fragment2: "",
    fragment3: "",
    isDecrypting: false,
    decryptedResult: null
  },
  // Dead-Man Switch Reminder State
  deadManReminder: {
    snoozedUntil: 0,
    activeFileId: null
  }
};

// ==========================================================================
// UTILITY FUNCTIONS
// ==========================================================================

function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

function formatDate(isoString) {
  if (!isoString) return "--";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "--";
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  } catch (e) {
    return isoString;
  }
}

function truncateMiddle(str, frontLen = 8, backLen = 6) {
  if (!str) return "";
  if (str.length <= frontLen + backLen + 3) return str;
  return str.slice(0, frontLen) + "..." + str.slice(-backLen);
}

function escapeHtml(text) {
  if (!text) return "";
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  };
  return text.toString().replace(/[&<>"']/g, (m) => map[m]);
}

function copyToClipboard(text, label = "Text") {
  navigator.clipboard.writeText(text).then(
    () => NotificationManager.add({ type: "success", title: "Copied", message: `${label} copied to clipboard.` }),
    () => NotificationManager.add({ type: "error", title: "Copy Failed", message: "Failed to copy to clipboard." })
  );
}

// Fragment Format Validator (Checks 32-byte Base64 or 64-char Hex)
function isValidFragmentFormat(input) {
  if (!input || typeof input !== "string") return false;
  const trimmed = input.trim();
  // Base64 format (32 bytes = 44 base64 chars with =)
  if (/^[A-Za-z0-9+/]{42,44}={0,2}$/.test(trimmed)) {
    try {
      const decoded = atob(trimmed);
      if (decoded.length === 32) return true;
    } catch (e) {}
  }
  // Hex format (32 bytes = 64 hex characters)
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return true;
  }
  return false;
}

// ==========================================================================
// UNIFIED NOTIFICATION SYSTEM (PERSISTENT BAR, DRAWER & TOASTS)
// ==========================================================================

const NotificationManager = {
  add({ type = "info", title, message }) {
    const notif = {
      id: "notif_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      type,
      title: title || (type.charAt(0).toUpperCase() + type.slice(1)),
      message,
      timestamp: new Date().toISOString(),
      read: false
    };

    state.notifications.unshift(notif);
    state.unreadCount++;

    this.updateTopBar(notif);
    this.renderDrawer();
    this.renderFullList();
    this.showToast(notif);
  },

  updateTopBar(latest) {
    const snippet = document.getElementById("notifBarSnippet");
    const badge = document.getElementById("notifBarBadge");
    const navBadge = document.getElementById("navNotifBadge");

    if (snippet && latest) {
      snippet.textContent = `[${latest.title}] ${latest.message}`;
    }
    if (badge) {
      badge.textContent = state.unreadCount;
      if (latest && (latest.type === "warning" || latest.type === "error")) {
        badge.classList.add("has-alerts");
      }
    }
    if (navBadge) {
      if (state.unreadCount > 0) {
        navBadge.style.display = "inline-block";
        navBadge.textContent = state.unreadCount;
      } else {
        navBadge.style.display = "none";
      }
    }
  },

  renderDrawer() {
    const container = document.getElementById("notifDrawerBody");
    if (!container) return;

    if (state.notifications.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 32px 16px;">
          <p style="font-size: 12px; color: var(--text-dim);">No unread notifications.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = state.notifications
      .slice(0, 15)
      .map((n) => `
        <div class="notif-card ${n.type}" id="drawer_${n.id}">
          <div class="notif-card-icon">
            ${this.getIconSvg(n.type)}
          </div>
          <div class="notif-card-content">
            <div class="notif-card-title">${escapeHtml(n.title)}</div>
            <div class="notif-card-desc">${escapeHtml(n.message)}</div>
            <div class="notif-card-time">${formatDate(n.timestamp)}</div>
          </div>
          <button class="btn-notif-dismiss" onclick="NotificationManager.dismiss('${n.id}')" title="Dismiss">&times;</button>
        </div>
      `)
      .join("");
  },

  renderFullList() {
    const container = document.getElementById("notificationsFullList");
    if (!container) return;

    let filtered = state.notifications;
    if (state.notificationFilter === "alerts") {
      filtered = filtered.filter((n) => n.type === "warning" || n.type === "error");
    } else if (state.notificationFilter === "success") {
      filtered = filtered.filter((n) => n.type === "success");
    } else if (state.notificationFilter === "error") {
      filtered = filtered.filter((n) => n.type === "error");
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 40px 20px;">
          <p style="color: var(--text-dim);">No notifications recorded in this category.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered
      .map((n) => `
        <div class="notif-card ${n.type}" id="list_${n.id}">
          <div class="notif-card-icon">
            ${this.getIconSvg(n.type)}
          </div>
          <div class="notif-card-content">
            <div class="notif-card-title">${escapeHtml(n.title)}</div>
            <div class="notif-card-desc">${escapeHtml(n.message)}</div>
            <div class="notif-card-time">${formatDate(n.timestamp)}</div>
          </div>
          <button class="btn-notif-dismiss" onclick="NotificationManager.dismiss('${n.id}')" title="Dismiss">&times;</button>
        </div>
      `)
      .join("");
  },

  showToast(notif) {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${notif.type}`;
    toast.innerHTML = `
      ${this.getIconSvg(notif.type)}
      <div style="flex: 1;">
        <div style="font-weight: 600; font-size: 13px;">${escapeHtml(notif.title)}</div>
        <div style="font-size: 12px; color: var(--text-muted);">${escapeHtml(notif.message)}</div>
      </div>
      <button style="background: none; border: none; color: var(--text-dim); cursor: pointer;" onclick="this.parentElement.remove()">&times;</button>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(10px)";
        toast.style.transition = "all 0.3s ease";
        setTimeout(() => toast.remove(), 300);
      }
    }, 4500);
  },

  dismiss(id) {
    state.notifications = state.notifications.filter((n) => n.id !== id);
    state.unreadCount = Math.max(0, state.unreadCount - 1);
    this.updateTopBar(state.notifications[0]);
    this.renderDrawer();
    this.renderFullList();
  },

  clearAll() {
    state.notifications = [];
    state.unreadCount = 0;
    this.updateTopBar(null);
    const snippet = document.getElementById("notifBarSnippet");
    if (snippet) snippet.textContent = "Notification history cleared.";
    this.renderDrawer();
    this.renderFullList();
  },

  getIconSvg(type) {
    if (type === "success") {
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === "error") {
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    } else if (type === "warning") {
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    }
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
  }
};

// ==========================================================================
// VIEW NAVIGATION CONTROLLER
// ==========================================================================

const viewMetadata = {
  overview: {
    title: "Dashboard Overview",
    subtitle: "Vault inventory summary, key fragment status, and active operations"
  },
  vault: {
    title: "Secure Vault Ingestion",
    subtitle: "AES-256-CBC file encryption and multi-location fragment partitioning"
  },
  decrypt: {
    title: "Decrypt Files — Strict Three-Key Entry",
    subtitle: "Deliberate sequential key entry with client-side validation and safe preview"
  },
  deadman: {
    title: "Dead-Man Switch & Heartbeat Monitor",
    subtitle: "60-second operational timeout with active check-in controls"
  },
  notifications: {
    title: "System Notifications & Event History",
    subtitle: "Persistent event logs, check-in signals, encryption, and decryption activities"
  },
  recovery: {
    title: "Emergency Recovery Access Portal",
    subtitle: "Custodial authorization requests, pending reviews, and emergency approvals"
  }
};

function navigateTo(viewId) {
  if (!viewMetadata[viewId]) return;
  state.activeView = viewId;

  // Update navigation links
  document.querySelectorAll(".nav-link").forEach((link) => {
    if (link.getAttribute("data-view") === viewId) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });

  // Update view sections
  document.querySelectorAll(".view-section").forEach((sec) => {
    if (sec.id === `view-${viewId}`) {
      sec.classList.add("active");
    } else {
      sec.classList.remove("active");
    }
  });

  // Update page heading
  const heading = document.getElementById("viewHeading");
  const subheading = document.getElementById("viewSubheading");
  if (heading) heading.textContent = viewMetadata[viewId].title;
  if (subheading) subheading.textContent = viewMetadata[viewId].subtitle;

  // Close mobile sidebar and notification drawer if open
  closeMobileSidebar();
  closeNotificationDrawer();

  // Refresh view data
  fetchVaultData();
}

function closeMobileSidebar() {
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  if (sidebar) sidebar.classList.remove("open");
  if (backdrop) backdrop.classList.remove("show");
}

function openMobileSidebar() {
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  if (sidebar) sidebar.classList.add("open");
  if (backdrop) backdrop.classList.add("show");
}

function toggleNotificationDrawer() {
  const drawer = document.getElementById("notificationDrawer");
  if (drawer) drawer.classList.toggle("open");
}

function closeNotificationDrawer() {
  const drawer = document.getElementById("notificationDrawer");
  if (drawer) drawer.classList.remove("open");
}

// ==========================================================================
// BACKEND DATA & HEALTH FETCHING
// ==========================================================================

async function checkBackendHealth() {
  const dot = document.getElementById("backendDot");
  const label = document.getElementById("backendStatusLabel");
  const uptimeEl = document.getElementById("backendUptime");

  try {
    const health = await api.checkHealth();
    if (!state.isBackendOnline) {
      state.isBackendOnline = true;
      NotificationManager.add({ type: "info", title: "Backend Connected", message: "Established connection to Quantum Vault server." });
    }
    if (dot) dot.classList.remove("offline");
    if (label) label.textContent = "Backend: Online";

    if (uptimeEl && health.uptime !== undefined) {
      const upSec = Math.floor(health.uptime);
      const m = Math.floor(upSec / 60);
      const s = upSec % 60;
      uptimeEl.textContent = `Uptime: ${m}m ${s}s`;
    }
  } catch (err) {
    if (state.isBackendOnline) {
      state.isBackendOnline = false;
      NotificationManager.add({ type: "error", title: "Backend Offline", message: "Failed to connect to backend server." });
    }
    if (dot) dot.classList.add("offline");
    if (label) label.textContent = "Backend: Offline";
    if (uptimeEl) uptimeEl.textContent = "Disconnected";
  }
}

async function fetchVaultData() {
  try {
    const [filesRes, recRes] = await Promise.all([
      api.listFiles().catch(() => ({ files: [] })),
      api.listRecoveryRequests().catch(() => ({ requests: [] }))
    ]);

    state.files = filesRes.files || [];
    state.recoveryRequests = recRes.requests || [];

    updateMetrics();
    renderOverviewFiles();
    renderVaultFilesTable();
    populateDecryptFileDropdown();
    renderDeadManTable();
    renderRecoveryTable();
    updateHeroDeadMan();
  } catch (err) {
    console.error("Error fetching vault data:", err);
  }
}

function updateMetrics() {
  const statFiles = document.getElementById("statTotalFiles");
  const statSwitches = document.getElementById("statActiveSwitches");
  const statExpired = document.getElementById("statExpiredSwitches");
  const statRecovery = document.getElementById("statPendingRecovery");

  const totalFiles = state.files.length;
  const activeSwitches = state.files.filter((f) => f.deadManSwitch && f.deadManSwitch.status === "active").length;
  const expiredSwitches = state.files.filter((f) => f.deadManSwitch && f.deadManSwitch.status === "expired").length;
  const pendingRecovery = state.recoveryRequests.filter((r) => r.status === "pending").length;

  if (statFiles) statFiles.textContent = totalFiles;
  if (statSwitches) statSwitches.textContent = activeSwitches;
  if (statExpired) statExpired.textContent = expiredSwitches;
  if (statRecovery) statRecovery.textContent = pendingRecovery;
}

// ==========================================================================
// DASHBOARD & VAULT INVENTORY TABLES
// ==========================================================================

function renderOverviewFiles() {
  const tbody = document.getElementById("overviewFilesTableBody");
  if (!tbody) return;

  if (state.files.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 36px 20px;">
          <div class="empty-state" style="padding: 0;">
            <h3>No encrypted files in vault</h3>
            <p>Encrypt a file in the Secure Vault to start key partitioning and dead-man protection.</p>
            <button class="btn btn-primary btn-sm" onclick="navigateTo('vault')">Open Secure Vault</button>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  const recent = state.files.slice(0, 5);
  tbody.innerHTML = recent
    .map((file) => {
      const fragments = file.fragments || {};
      const dms = file.deadManSwitch;

      let dmsBadge = '<span class="badge badge-muted">Inactive</span>';
      if (dms) {
        if (dms.status === "active") {
          const sec = Math.ceil(dms.remainingMs / 1000);
          dmsBadge = `<span class="badge ${sec <= 15 ? "badge-amber" : "badge-emerald"}">${sec}s Active</span>`;
        } else if (dms.status === "expired") {
          dmsBadge = '<span class="badge badge-rose">Expired</span>';
        }
      }

      let statusBadge = '<span class="badge badge-emerald">Encrypted</span>';
      if (file.isDecrypted) {
        statusBadge = '<span class="badge badge-cyan">Decrypted</span>';
      }

      return `
        <tr>
          <td>
            <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-dim);" title="${file.fileId}">
              ${truncateMiddle(file.fileId, 6, 4)}
            </span>
            <button style="background:none; border:none; color:var(--text-dim); cursor:pointer; padding:2px;" title="Copy File ID" onclick="copyToClipboard('${file.fileId}', 'File ID')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
          </td>
          <td><strong>${escapeHtml(file.originalName)}</strong></td>
          <td>${formatBytes(file.size)}</td>
          <td>
            <div class="fragment-badge-group">
              <span class="fragment-pill ${fragments.part1Disk ? "disk" : "missing"}" title="Part 1: storage/keys/${file.fileId}.part1">Disk</span>
              <span class="fragment-pill ${fragments.part2Backup ? "backup" : "missing"}" title="Part 2: storage/backup/${file.fileId}.part2">Backup</span>
              <span class="fragment-pill ${fragments.part3Ram ? "ram" : "missing"}" title="Part 3: RAM + storage/keys/${file.fileId}.part3">RAM</span>
            </div>
          </td>
          <td>${dmsBadge}</td>
          <td>${statusBadge}</td>
          <td>
            <button class="btn btn-outline-emerald btn-sm" onclick="startDecryptForFile('${file.fileId}')">Manual Decrypt</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderVaultFilesTable() {
  const tbody = document.getElementById("vaultFilesTableBody");
  if (!tbody) return;

  let filtered = state.files;
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    filtered = filtered.filter((f) => f.originalName.toLowerCase().includes(q) || f.fileId.toLowerCase().includes(q));
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 36px 20px;">
          <div class="empty-state" style="padding: 0;">
            <h3>No files found</h3>
            <p>${state.searchQuery ? "Try a different search term." : "No files are currently stored in the vault."}</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered
    .map((file) => {
      const fragments = file.fragments || {};
      const dms = file.deadManSwitch;

      let dmsBadge = '<span class="badge badge-muted">Inactive</span>';
      if (dms) {
        if (dms.status === "active") {
          const sec = Math.ceil(dms.remainingMs / 1000);
          dmsBadge = `<span class="badge ${sec <= 15 ? "badge-amber" : "badge-emerald"}">${sec}s Active</span>`;
        } else if (dms.status === "expired") {
          dmsBadge = '<span class="badge badge-rose">Expired</span>';
        }
      }

      let statusBadge = '<span class="badge badge-emerald">Encrypted</span>';
      if (file.isDecrypted) {
        statusBadge = '<span class="badge badge-cyan">Decrypted</span>';
      }

      return `
        <tr>
          <td>
            <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-dim);" title="${file.fileId}">
              ${truncateMiddle(file.fileId, 6, 4)}
            </span>
            <button style="background:none; border:none; color:var(--text-dim); cursor:pointer; padding:2px;" title="Copy File ID" onclick="copyToClipboard('${file.fileId}', 'File ID')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
          </td>
          <td>
            <div style="font-weight: 600; color: #ffffff;">${escapeHtml(file.originalName)}</div>
            <div style="font-size: 11px; color: var(--text-dim); font-family: var(--font-mono);">${file.encryptedFile}</div>
          </td>
          <td>${formatBytes(file.size)}</td>
          <td>${formatDate(file.uploadedAt)}</td>
          <td>
            <div class="fragment-badge-group">
              <span class="fragment-pill ${fragments.part1Disk ? "disk" : "missing"}" title="Part 1: Disk">Disk</span>
              <span class="fragment-pill ${fragments.part2Backup ? "backup" : "missing"}" title="Part 2: Backup">Backup</span>
              <span class="fragment-pill ${fragments.part3Ram ? "ram" : "missing"}" title="Part 3: RAM">RAM</span>
            </div>
          </td>
          <td>${dmsBadge}</td>
          <td>${statusBadge}</td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-primary btn-sm" onclick="startDecryptForFile('${file.fileId}')">Decrypt</button>
              <a class="btn btn-secondary btn-sm" href="${api.getDownloadUrl(file.fileId, "encrypted")}" download title="Download raw encrypted ciphertext">Raw Enc</a>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

// ==========================================================================
// SECURE VAULT (MULTI-FILE UPLOAD & ENCRYPT)
// ==========================================================================

function setupUploadWorkflow() {
  const dropzone = document.getElementById("uploadDropzone");
  const fileInput = document.getElementById("fileInput");
  const container = document.getElementById("selectedFilesContainer");
  const multiFileList = document.getElementById("multiFileList");
  const btnSubmit = document.getElementById("btnSubmitUpload");
  const btnClear = document.getElementById("btnClearSelectedFiles");
  const progressContainer = document.getElementById("uploadProgressContainer");
  const progressBar = document.getElementById("uploadProgressBar");
  const progressPercent = document.getElementById("uploadProgressPercent");
  const progressStatus = document.getElementById("uploadProgressStatus");
  const resultCard = document.getElementById("uploadSuccessResult");
  const resultBody = document.getElementById("uploadResultBody");

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener("click", () => fileInput.click());

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToUpload(Array.from(e.dataTransfer.files));
    }
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToUpload(Array.from(e.target.files));
    }
  });

  function addFilesToUpload(newFiles) {
    const valid = newFiles.filter((f) => {
      if (f.size > 50 * 1024 * 1024) {
        NotificationManager.add({ type: "warning", title: "File Exceeded Limit", message: `${f.name} exceeds the 50MB limit.` });
        return false;
      }
      return true;
    });

    state.selectedUploadFiles = [...state.selectedUploadFiles, ...valid];
    renderSelectedFiles();
  }

  function renderSelectedFiles() {
    if (state.selectedUploadFiles.length === 0) {
      if (container) container.style.display = "none";
      if (btnSubmit) btnSubmit.disabled = true;
      if (btnClear) btnClear.style.display = "none";
      return;
    }

    if (container) container.style.display = "block";
    if (btnSubmit) btnSubmit.disabled = false;
    if (btnClear) btnClear.style.display = "inline-flex";

    if (multiFileList) {
      multiFileList.innerHTML = state.selectedUploadFiles
        .map((f, idx) => `
          <div class="multi-file-item">
            <div>
              <strong>${escapeHtml(f.name)}</strong>
              <span style="color: var(--text-dim); margin-left: 8px;">(${formatBytes(f.size)})</span>
            </div>
            <button class="btn btn-secondary btn-sm" style="padding: 2px 6px;" onclick="removeSelectedFile(${idx})">&times;</button>
          </div>
        `)
        .join("");
    }
  }

  window.removeSelectedFile = (idx) => {
    state.selectedUploadFiles.splice(idx, 1);
    renderSelectedFiles();
  };

  if (btnClear) {
    btnClear.addEventListener("click", () => {
      state.selectedUploadFiles = [];
      fileInput.value = "";
      renderSelectedFiles();
      if (resultCard) resultCard.style.display = "none";
    });
  }

  if (btnSubmit) {
    btnSubmit.addEventListener("click", async () => {
      if (state.selectedUploadFiles.length === 0 || state.isUploading) return;

      state.isUploading = true;
      btnSubmit.disabled = true;
      if (progressContainer) progressContainer.classList.add("show");
      if (resultCard) resultCard.style.display = "none";

      const results = [];
      const total = state.selectedUploadFiles.length;

      for (let i = 0; i < total; i++) {
        const file = state.selectedUploadFiles[i];
        if (progressStatus) progressStatus.textContent = `Encrypting file ${i + 1} of ${total}: ${file.name}...`;

        try {
          const res = await api.uploadFile(file, (percent) => {
            const overall = Math.round(((i + percent / 100) / total) * 100);
            if (progressBar) progressBar.style.width = `${overall}%`;
            if (progressPercent) progressPercent.textContent = `${overall}%`;
          });

          results.push({ success: true, file, res });
          NotificationManager.add({
            type: "success",
            title: "File Encrypted & Stored",
            message: `${file.name} encrypted. File ID: ${truncateMiddle(res.fileId, 6, 4)}`
          });
        } catch (err) {
          results.push({ success: false, file, error: err.message });
          NotificationManager.add({
            type: "error",
            title: "Encryption Failed",
            message: `${file.name}: ${err.message}`
          });
        }
      }

      state.isUploading = false;
      if (progressContainer) progressContainer.classList.remove("show");

      // Render Results summary
      if (resultCard && resultBody) {
        resultCard.style.display = "block";
        resultBody.innerHTML = `
          <p style="margin-bottom: 12px; color: var(--text-main);">
            Processed <strong>${results.filter((r) => r.success).length}</strong> of <strong>${total}</strong> files successfully.
          </p>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${results
              .map((r) => `
                <div style="background: var(--bg-panel); padding: 10px 14px; border-radius: var(--radius-sm); border-left: 3px solid ${r.success ? "var(--emerald)" : "var(--rose)"};">
                  <div style="font-weight: 600; color: #ffffff;">${escapeHtml(r.file.name)}</div>
                  ${
                    r.success
                      ? `<div style="font-family: var(--font-mono); font-size: 11px; color: var(--cyan); margin-top: 2px;">
                          File ID: ${r.res.fileId} | Encrypted Ciphertext: ${r.res.encryptedFile}
                         </div>
                         <div style="font-size: 11px; color: var(--text-dim); margin-top: 4px;">
                           Keys distributed to: Local Disk (Part 1), Backup (Part 2), RAM / Custody (Part 3).
                         </div>`
                      : `<div style="font-size: 12px; color: var(--rose); margin-top: 2px;">Error: ${escapeHtml(r.error)}</div>`
                  }
                </div>
              `)
              .join("")}
          </div>
          <div style="margin-top: 16px; display: flex; gap: 10px;">
            <button class="btn btn-outline-emerald btn-sm" onclick="navigateTo('decrypt')">Go to Decrypt Files</button>
            <button class="btn btn-secondary btn-sm" onclick="navigateTo('deadman')">View Dead-Man Switches</button>
          </div>
        `;
      }

      // Reset selection
      state.selectedUploadFiles = [];
      fileInput.value = "";
      renderSelectedFiles();
      await fetchVaultData();
    });
  }
}

// ==========================================================================
// STRICT MANUAL THREE-KEY DECRYPTION WIZARD
// ==========================================================================

function populateDecryptFileDropdown() {
  const select = document.getElementById("decryptFileSelect");
  if (!select) return;

  const currentVal = select.value;
  select.innerHTML = '<option value="">-- Select Encrypted File from Vault --</option>';

  state.files.forEach((f) => {
    const opt = document.createElement("option");
    opt.value = f.fileId;
    opt.textContent = `${f.originalName} (${formatBytes(f.size)}) - ID: ${truncateMiddle(f.fileId, 6, 4)}`;
    select.appendChild(opt);
  });

  if (currentVal && state.files.some((f) => f.fileId === currentVal)) {
    select.value = currentVal;
  }
}

function startDecryptForFile(fileId) {
  navigateTo("decrypt");
  const select = document.getElementById("decryptFileSelect");
  if (select) {
    select.value = fileId;
    onDecryptFileSelected(fileId);
  }
}

function onDecryptFileSelected(fileId) {
  state.decryptWizard.selectedFileId = fileId;
  const file = state.files.find((f) => f.fileId === fileId);

  const infoCard = document.getElementById("selectedFileInfo");
  const nameDisp = document.getElementById("selectedFileNameDisplay");
  const sizeDisp = document.getElementById("selectedFileSizeDisplay");
  const statusDisp = document.getElementById("selectedFileStatusDisplay");

  if (!file) {
    state.decryptWizard.selectedFileName = null;
    if (infoCard) infoCard.style.display = "none";
    return;
  }

  state.decryptWizard.selectedFileName = file.originalName;
  if (infoCard) infoCard.style.display = "block";
  if (nameDisp) nameDisp.textContent = `Filename: ${file.originalName}`;
  if (sizeDisp) sizeDisp.textContent = `Size: ${formatBytes(file.size)}`;
  if (statusDisp) {
    statusDisp.className = file.isDecrypted ? "badge badge-cyan" : "badge badge-emerald";
    statusDisp.textContent = file.isDecrypted ? "Decrypted on Server" : "Encrypted (Ready)";
  }

  // Update confirmation step text
  const confirmName = document.getElementById("confirmTargetFileName");
  const confirmId = document.getElementById("confirmTargetFileId");
  if (confirmName) confirmName.textContent = file.originalName;
  if (confirmId) confirmId.textContent = file.fileId;
}

function setupDecryptWizard() {
  const select = document.getElementById("decryptFileSelect");
  const btnRefresh = document.getElementById("btnRefreshDecryptFiles");

  if (select) {
    select.addEventListener("change", (e) => {
      onDecryptFileSelected(e.target.value);
    });
  }

  if (btnRefresh) {
    btnRefresh.addEventListener("click", () => {
      fetchVaultData();
      NotificationManager.add({ type: "info", title: "Refreshed", message: "Vault inventory updated for decryption." });
    });
  }

  // Eye Show/Hide Toggles
  setupEyeToggle("inputFragment1", "btnToggleEye1");
  setupEyeToggle("inputFragment2", "btnToggleEye2");
  setupEyeToggle("inputFragment3", "btnToggleEye3");

  // Real-time Input Validation Listeners
  setupKeyValidationListener("inputFragment1", "valF1", "hintF1", "btnNextToStep2", (val) => {
    state.decryptWizard.fragment1 = val;
  });

  setupKeyValidationListener("inputFragment2", "valF2", "hintF2", "btnNextToStep3", (val) => {
    state.decryptWizard.fragment2 = val;
  });

  setupKeyValidationListener("inputFragment3", "valF3", "hintF3", "btnNextToStep4", (val) => {
    state.decryptWizard.fragment3 = val;
  });

  // Wizard Step Navigation Buttons
  const btnNextToStep2 = document.getElementById("btnNextToStep2");
  const btnBackToStep1 = document.getElementById("btnBackToStep1");
  const btnNextToStep3 = document.getElementById("btnNextToStep3");
  const btnBackToStep2 = document.getElementById("btnBackToStep2");
  const btnNextToStep4 = document.getElementById("btnNextToStep4");
  const btnBackToStep3 = document.getElementById("btnBackToStep3");
  const btnExecute = document.getElementById("btnExecuteManualDecrypt");
  const btnCopyPreview = document.getElementById("btnCopyPreviewText");

  if (btnNextToStep2) btnNextToStep2.addEventListener("click", () => setWizardStep(2));
  if (btnBackToStep1) btnBackToStep1.addEventListener("click", () => setWizardStep(1));
  if (btnNextToStep3) btnNextToStep3.addEventListener("click", () => setWizardStep(3));
  if (btnBackToStep2) btnBackToStep2.addEventListener("click", () => setWizardStep(2));
  if (btnNextToStep4) btnNextToStep4.addEventListener("click", () => setWizardStep(4));
  if (btnBackToStep3) btnBackToStep3.addEventListener("click", () => setWizardStep(3));

  if (btnCopyPreview) {
    btnCopyPreview.addEventListener("click", () => {
      const codeBox = document.getElementById("previewCodeBox");
      if (codeBox) copyToClipboard(codeBox.textContent, "Decrypted text");
    });
  }

  // Step 4: Execute Decrypt
  if (btnExecute) {
    btnExecute.addEventListener("click", async () => {
      if (!state.decryptWizard.selectedFileId) {
        NotificationManager.add({ type: "warning", title: "File Required", message: "Please select an encrypted file in Step A first." });
        return;
      }

      const f1 = state.decryptWizard.fragment1.trim();
      const f2 = state.decryptWizard.fragment2.trim();
      const f3 = state.decryptWizard.fragment3.trim();

      if (!isValidFragmentFormat(f1) || !isValidFragmentFormat(f2) || !isValidFragmentFormat(f3)) {
        NotificationManager.add({ type: "error", title: "Invalid Keys", message: "All 3 fragments must be valid 32-byte Base64 or Hex strings." });
        return;
      }

      btnExecute.disabled = true;
      btnExecute.textContent = "Decrypting...";
      NotificationManager.add({ type: "info", title: "Decryption Initiated", message: "Submitting manual 3-key fragments to reconstruct AES-256 key..." });

      try {
        const res = await api.decryptFile(state.decryptWizard.selectedFileId, {
          fragment1: f1,
          fragment2: f2,
          fragment3: f3
        });

        NotificationManager.add({
          type: "success",
          title: "Decryption Succeeded",
          message: `Successfully decrypted ${res.originalName || "file"}!`
        });

        // Clear in-memory keys
        resetKeyInputsOnly();

        // Render Decrypted Result Card & Fetch Preview
        await renderDecryptedResult(state.decryptWizard.selectedFileId, res);
        await fetchVaultData();
      } catch (err) {
        // Clear keys on failure too to prevent lingering in memory
        resetKeyInputsOnly();

        NotificationManager.add({
          type: "error",
          title: "Decryption Failed",
          message: err.message || "Key fragments are invalid or do not match this file."
        });

        // Take user back to step 1 to retry
        setWizardStep(1);
      } finally {
        btnExecute.disabled = false;
        btnExecute.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
          </svg>
          Decrypt File
        `;
      }
    });
  }
}

function setupEyeToggle(inputId, buttonId) {
  const input = document.getElementById(inputId);
  const btn = document.getElementById(buttonId);
  if (!input || !btn) return;

  btn.addEventListener("click", () => {
    if (input.type === "password") {
      input.type = "text";
      btn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
      `;
    } else {
      input.type = "password";
      btn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      `;
    }
  });
}

function setupKeyValidationListener(inputId, pillId, hintId, nextBtnId, updateStateFn) {
  const input = document.getElementById(inputId);
  const pill = document.getElementById(pillId);
  const hint = document.getElementById(hintId);
  const btn = document.getElementById(nextBtnId);

  if (!input) return;

  input.addEventListener("input", (e) => {
    const val = e.target.value.trim();
    updateStateFn(val);

    if (!val) {
      if (pill) {
        pill.className = "validation-status-pill empty";
        pill.textContent = "Empty";
      }
      if (hint) hint.style.color = "var(--text-dim)";
      if (btn) btn.disabled = true;
      return;
    }

    if (isValidFragmentFormat(val)) {
      if (pill) {
        pill.className = "validation-status-pill valid";
        pill.textContent = "Valid (32 bytes)";
      }
      if (hint) {
        hint.style.color = "var(--emerald)";
        hint.textContent = "✓ Correct 32-byte representation.";
      }
      if (btn) btn.disabled = false;
    } else {
      if (pill) {
        pill.className = "validation-status-pill invalid";
        pill.textContent = "Invalid format";
      }
      if (hint) {
        hint.style.color = "var(--rose)";
        hint.textContent = "Must be 44-char Base64 or 64-char Hex (32 bytes).";
      }
      if (btn) btn.disabled = true;
    }
  });
}

function setWizardStep(step) {
  state.decryptWizard.currentStep = step;

  // Toggle breadcrumbs
  for (let s = 1; s <= 4; s++) {
    const badge = document.getElementById(`wStep${s}Badge`);
    const substep = document.getElementById(`wStep${s}`);
    if (badge) {
      badge.classList.remove("active", "completed");
      if (s === step) badge.classList.add("active");
      else if (s < step) badge.classList.add("completed");
    }
    if (substep) {
      substep.style.display = s === step ? "block" : "none";
    }
  }
}

function resetKeyInputsOnly() {
  state.decryptWizard.fragment1 = "";
  state.decryptWizard.fragment2 = "";
  state.decryptWizard.fragment3 = "";

  ["inputFragment1", "inputFragment2", "inputFragment3"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  ["valF1", "valF2", "valF3"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.className = "validation-status-pill empty";
      el.textContent = "Empty";
    }
  });

  ["btnNextToStep2", "btnNextToStep3", "btnNextToStep4"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = true;
  });
}

window.resetKeyWizard = function () {
  resetKeyInputsOnly();
  const resultContainer = document.getElementById("decryptResultContainer");
  if (resultContainer) resultContainer.style.display = "none";
  setWizardStep(1);
  NotificationManager.add({ type: "info", title: "Wizard Reset", message: "Key fragment fields cleared from in-memory state." });
};

async function renderDecryptedResult(fileId, res) {
  const container = document.getElementById("decryptResultContainer");
  const nameEl = document.getElementById("resultDecryptedName");
  const metaEl = document.getElementById("resultDecryptedMeta");
  const downloadLink = document.getElementById("btnDownloadDecrypted");
  const codeBox = document.getElementById("previewCodeBox");

  if (!container) return;
  container.style.display = "block";

  if (nameEl) nameEl.textContent = res.originalName || `${fileId}.decrypted`;
  if (metaEl) metaEl.textContent = `Size: ${formatBytes(res.size)} | Status: Decrypted & Restored on Server`;
  if (downloadLink) downloadLink.href = api.getDownloadUrl(fileId, "decrypted");

  // Fetch Safe Preview
  if (codeBox) codeBox.textContent = "Loading inline preview...";
  try {
    const preview = await api.previewFile(fileId);
    if (preview.canPreview && preview.content !== undefined) {
      if (codeBox) codeBox.textContent = preview.content;
    } else {
      if (codeBox) codeBox.textContent = preview.message || "Binary or large format. Please download the decrypted file.";
    }
  } catch (e) {
    if (codeBox) codeBox.textContent = "Could not load inline preview. Please use Download button.";
  }
}

// ==========================================================================
// DEAD-MAN SWITCH & HEARTBEAT CONTROLLER
// ==========================================================================

function updateHeroDeadMan() {
  const heroDisplay = document.getElementById("heroCountdownDisplay");
  const heroMeta = document.getElementById("heroLastCheckInMeta");
  const heroSubtext = document.getElementById("heroCountdownSubtext");

  // Find the most urgent active switch
  const activeSwitches = state.files
    .filter((f) => f.deadManSwitch && f.deadManSwitch.status === "active")
    .sort((a, b) => a.deadManSwitch.remainingMs - b.deadManSwitch.remainingMs);

  if (activeSwitches.length === 0) {
    const expiredCount = state.files.filter((f) => f.deadManSwitch && f.deadManSwitch.status === "expired").length;
    if (heroDisplay) {
      heroDisplay.textContent = expiredCount > 0 ? "EXPIRED" : "IDLE";
      heroDisplay.className = `checkin-countdown-huge ${expiredCount > 0 ? "expired" : ""}`;
    }
    if (heroSubtext) heroSubtext.textContent = expiredCount > 0 ? `${expiredCount} switches expired - check-in to reset` : "No active dead-man switches in vault";
    if (heroMeta) heroMeta.textContent = "Configured Timeout: 60 Seconds";
    return;
  }

  const primary = activeSwitches[0];
  const sec = Math.ceil(primary.deadManSwitch.remainingMs / 1000);

  if (heroDisplay) {
    heroDisplay.textContent = `${sec}s`;
    heroDisplay.className = `checkin-countdown-huge ${sec <= 15 ? "warning" : ""}`;
  }
  if (heroSubtext) {
    heroSubtext.textContent = `Target: ${primary.originalName} (${truncateMiddle(primary.fileId, 6, 4)})`;
  }
  if (heroMeta) {
    const lastTime = primary.deadManSwitch.lastCheckIn ? formatDate(new Date(primary.deadManSwitch.lastCheckIn).toISOString()) : "Initial Start";
    heroMeta.textContent = `Last Check-In: ${lastTime} | Next Deadline: ${formatDate(new Date(primary.deadManSwitch.deadline).toISOString())}`;
  }
}

function renderDeadManTable() {
  const tbody = document.getElementById("deadManTableBody");
  if (!tbody) return;

  const filesWithSwitches = state.files.filter((f) => f.deadManSwitch);

  if (filesWithSwitches.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 36px 20px;">
          <div class="empty-state" style="padding: 0;">
            <h3>No Dead-Man Switches</h3>
            <p>Every newly uploaded file automatically initializes an active 60-second switch.</p>
            <button class="btn btn-primary btn-sm" onclick="navigateTo('vault')">Upload File</button>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filesWithSwitches
    .map((file) => {
      const dms = file.deadManSwitch;
      const sec = Math.max(0, Math.ceil(dms.remainingMs / 1000));
      const isActive = dms.status === "active";

      return `
        <tr>
          <td>
            <div style="font-weight: 600; color: #ffffff;">${escapeHtml(file.originalName)}</div>
            <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-dim);">${file.fileId}</span>
          </td>
          <td>
            ${
              isActive
                ? `<span class="badge ${sec <= 15 ? "badge-amber" : "badge-emerald"}">Active</span>`
                : '<span class="badge badge-rose">Expired</span>'
            }
          </td>
          <td>
            ${
              isActive
                ? `<strong style="font-family: var(--font-mono); color: ${sec <= 15 ? "var(--amber)" : "var(--emerald)"}; font-size: 14px;">${sec}s</strong>`
                : '<span style="color: var(--rose); font-size: 12px; font-weight: 600;">Time Window Lapsed</span>'
            }
          </td>
          <td>${isActive ? formatDate(new Date(dms.deadline).toISOString()) : "--"}</td>
          <td>${dms.lastCheckIn ? formatDate(new Date(dms.lastCheckIn).toISOString()) : "--"}</td>
          <td>
            <button class="btn ${isActive ? "btn-primary" : "btn-outline-amber"} btn-sm" onclick="handleCheckIn('${file.fileId}')">
              ${isActive ? "Check In Now" : "Reset & Reactivate"}
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function handleCheckIn(fileId) {
  try {
    const res = await api.checkIn(fileId);
    NotificationManager.add({
      type: "success",
      title: "Check-In Accepted",
      message: `Dead-man countdown reset to 60s for file ${truncateMiddle(fileId, 6, 4)}.`
    });
    // Dismiss reminder modal if open for this file
    closeReminderModal();
    await fetchVaultData();
  } catch (err) {
    NotificationManager.add({
      type: "error",
      title: "Check-In Failed",
      message: err.message || "Failed to submit check-in to server."
    });
  }
}

// Check-in Reminder Modal Controls
function showReminderModal(file, sec) {
  const modal = document.getElementById("reminderModal");
  const countdownText = document.getElementById("reminderCountdownText");
  const targetFile = document.getElementById("reminderTargetFile");

  if (!modal) return;
  state.deadManReminder.activeFileId = file.fileId;

  if (countdownText) countdownText.textContent = `${sec}s Remaining`;
  if (targetFile) targetFile.textContent = `Target File: ${file.originalName} (${truncateMiddle(file.fileId, 6, 4)})`;

  modal.classList.add("show");
}

function closeReminderModal() {
  const modal = document.getElementById("reminderModal");
  if (modal) modal.classList.remove("show");
  state.deadManReminder.activeFileId = null;
}

function startCountdownTicker() {
  if (state.tickerInterval) clearInterval(state.tickerInterval);

  state.tickerInterval = setInterval(() => {
    let stateChanged = false;

    state.files.forEach((file) => {
      if (file.deadManSwitch && file.deadManSwitch.status === "active") {
        file.deadManSwitch.remainingMs = Math.max(0, file.deadManSwitch.remainingMs - 1000);
        const sec = Math.ceil(file.deadManSwitch.remainingMs / 1000);

        // Check for approaching deadline reminder (<= 20 seconds remaining)
        if (sec <= 20 && sec > 0 && Date.now() > state.deadManReminder.snoozedUntil) {
          if (!state.deadManReminder.activeFileId) {
            showReminderModal(file, sec);
          } else {
            const countText = document.getElementById("reminderCountdownText");
            if (countText) countText.textContent = `${sec}s Remaining`;
          }
        }

        if (file.deadManSwitch.remainingMs <= 0) {
          file.deadManSwitch.status = "expired";
          stateChanged = true;
          closeReminderModal();
          NotificationManager.add({
            type: "warning",
            title: "Dead-Man Switch Expired",
            message: `Switch expired for ${file.originalName}. File entered recovery state.`
          });
        }
      }
    });

    updateHeroDeadMan();

    if (stateChanged || state.activeView === "deadman") {
      updateMetrics();
      renderDeadManTable();
    }
  }, 1000);
}

// ==========================================================================
// RECOVERY PORTAL CONTROLLER
// ==========================================================================

function renderRecoveryTable() {
  const tbody = document.getElementById("recoveryTableBody");
  if (!tbody) return;

  if (state.recoveryRequests.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; padding: 36px 20px;">
          <div class="empty-state" style="padding: 0;">
            <h3>No Recovery Requests</h3>
            <p>Recovery requests are lodged when an authorized custodian requests emergency access to a file.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = state.recoveryRequests
    .map((req) => {
      let statusBadge = '<span class="badge badge-amber">Pending Approval</span>';
      if (req.status === "approved") {
        statusBadge = '<span class="badge badge-emerald">Approved</span>';
      } else if (req.status === "denied") {
        statusBadge = '<span class="badge badge-rose">Denied</span>';
      }

      return `
        <tr>
          <td>
            <span style="font-family: var(--font-mono); font-size: 12px; font-weight: 600; color: #ffffff;">${req.fileId}</span>
          </td>
          <td>${statusBadge}</td>
          <td>${formatDate(req.createdAt)}</td>
          <td>
            <div style="display: flex; gap: 8px;">
              ${
                req.status === "pending"
                  ? `
                <button class="btn btn-outline-emerald btn-sm" onclick="handleApproveRecovery('${req.fileId}')">Approve</button>
                <button class="btn btn-outline-rose btn-sm" onclick="handleDenyRecovery('${req.fileId}')">Deny</button>
              `
                  : ""
              }
              ${
                req.status === "approved"
                  ? `
                <button class="btn btn-primary btn-sm" onclick="startDecryptForFile('${req.fileId}')">Decrypt Authorized File</button>
              `
                  : ""
              }
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function handleApproveRecovery(fileId) {
  try {
    await api.approveRecovery(fileId);
    NotificationManager.add({
      type: "success",
      title: "Recovery Approved",
      message: `Emergency recovery approved for file ${truncateMiddle(fileId, 6, 4)}.`
    });
    await fetchVaultData();
  } catch (err) {
    NotificationManager.add({ type: "error", title: "Approval Failed", message: err.message });
  }
}

async function handleDenyRecovery(fileId) {
  try {
    await api.denyRecovery(fileId);
    NotificationManager.add({
      type: "warning",
      title: "Recovery Denied",
      message: `Recovery request denied for file ${truncateMiddle(fileId, 6, 4)}.`
    });
    await fetchVaultData();
  } catch (err) {
    NotificationManager.add({ type: "error", title: "Denial Failed", message: err.message });
  }
}

// ==========================================================================
// SETTINGS & EVENT WIRING
// ==========================================================================

function setupSettingsModal() {
  const modal = document.getElementById("settingsModal");
  const btnOpen = document.getElementById("btnSettings");
  const btnClose = document.getElementById("btnCloseSettings");
  const inputUrl = document.getElementById("apiBaseUrlInput");
  const btnSave = document.getElementById("btnSaveSettings");
  const btnReset = document.getElementById("btnResetSettings");

  if (!modal) return;

  if (btnOpen) {
    btnOpen.addEventListener("click", () => {
      if (inputUrl) inputUrl.value = api.getBaseUrl();
      modal.classList.add("show");
    });
  }

  if (btnClose) {
    btnClose.addEventListener("click", () => modal.classList.remove("show"));
  }

  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("show");
  });

  if (btnSave) {
    btnSave.addEventListener("click", async () => {
      const url = inputUrl ? inputUrl.value.trim() : "";
      api.setBaseUrl(url);
      modal.classList.remove("show");
      NotificationManager.add({ type: "info", title: "Settings Saved", message: `API Base URL configured to: ${api.getBaseUrl()}` });
      await checkBackendHealth();
      await fetchVaultData();
    });
  }

  if (btnReset) {
    btnReset.addEventListener("click", async () => {
      api.setBaseUrl("");
      if (inputUrl) inputUrl.value = api.getBaseUrl();
      modal.classList.remove("show");
      NotificationManager.add({ type: "info", title: "Settings Reset", message: "API Base URL reset to default origin." });
      await checkBackendHealth();
      await fetchVaultData();
    });
  }
}

// App Initialization
document.addEventListener("DOMContentLoaded", () => {
  // Navigation Links
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const view = link.getAttribute("data-view");
      navigateTo(view);
    });
  });

  // Mobile Menu Toggle
  const menuToggle = document.getElementById("menuToggle");
  const backdrop = document.getElementById("sidebarBackdrop");
  if (menuToggle) menuToggle.addEventListener("click", openMobileSidebar);
  if (backdrop) backdrop.addEventListener("click", closeMobileSidebar);

  // Persistent Notification Drawer Toggles
  const btnToggleNotif = document.getElementById("btnToggleNotifDrawer");
  const btnCloseDrawer = document.getElementById("btnCloseNotifDrawer");
  const btnClearDrawer = document.getElementById("btnClearNotifDrawer");
  const btnClearAllNotifs = document.getElementById("btnClearAllNotifs");

  if (btnToggleNotif) btnToggleNotif.addEventListener("click", toggleNotificationDrawer);
  if (btnCloseDrawer) btnCloseDrawer.addEventListener("click", closeNotificationDrawer);
  if (btnClearDrawer) btnClearDrawer.addEventListener("click", () => NotificationManager.clearAll());
  if (btnClearAllNotifs) btnClearAllNotifs.addEventListener("click", () => NotificationManager.clearAll());

  // Notification Filters on Full Page
  const fAll = document.getElementById("filterNotifAll");
  const fAlerts = document.getElementById("filterNotifAlerts");
  const fSuccess = document.getElementById("filterNotifSuccess");
  const fErrors = document.getElementById("filterNotifErrors");

  [fAll, fAlerts, fSuccess, fErrors].forEach((btn) => {
    if (btn) {
      btn.addEventListener("click", () => {
        [fAll, fAlerts, fSuccess, fErrors].forEach((b) => b && b.classList.remove("active"));
        btn.classList.add("active");
        if (btn === fAll) state.notificationFilter = "all";
        else if (btn === fAlerts) state.notificationFilter = "alerts";
        else if (btn === fSuccess) state.notificationFilter = "success";
        else if (btn === fErrors) state.notificationFilter = "error";
        NotificationManager.renderFullList();
      });
    }
  });

  // Reminder Modal Action Handlers
  const btnRemCheckIn = document.getElementById("btnReminderCheckInAction");
  const btnRemSnooze = document.getElementById("btnReminderSnoozeAction");

  if (btnRemCheckIn) {
    btnRemCheckIn.addEventListener("click", async () => {
      if (state.deadManReminder.activeFileId) {
        await handleCheckIn(state.deadManReminder.activeFileId);
      }
    });
  }

  if (btnRemSnooze) {
    btnRemSnooze.addEventListener("click", () => {
      state.deadManReminder.snoozedUntil = Date.now() + 10000; // Snooze 10s
      closeReminderModal();
      NotificationManager.add({ type: "info", title: "Reminder Snoozed", message: "Dead-man reminder snoozed for 10 seconds." });
    });
  }

  // Hero Check In Now Button on Dead-Man Switch page
  const btnHeroCheckIn = document.getElementById("btnHeroCheckInNow");
  if (btnHeroCheckIn) {
    btnHeroCheckIn.addEventListener("click", async () => {
      const activeSwitches = state.files
        .filter((f) => f.deadManSwitch && f.deadManSwitch.status === "active")
        .sort((a, b) => a.deadManSwitch.remainingMs - b.deadManSwitch.remainingMs);

      if (activeSwitches.length > 0) {
        await handleCheckIn(activeSwitches[0].fileId);
      } else {
        // If expired or none, check in all or first file
        if (state.files.length > 0) {
          await handleCheckIn(state.files[0].fileId);
        } else {
          NotificationManager.add({ type: "warning", title: "No Files", message: "Upload a file in Secure Vault first." });
        }
      }
    });
  }

  // Check In All Button
  const btnCheckInAll = document.getElementById("btnCheckInAll");
  if (btnCheckInAll) {
    btnCheckInAll.addEventListener("click", async () => {
      const targets = state.files.filter((f) => f.deadManSwitch && f.deadManSwitch.status === "active");
      if (targets.length === 0) {
        NotificationManager.add({ type: "info", title: "Check-In", message: "No active switches to refresh." });
        return;
      }
      for (const t of targets) {
        await api.checkIn(t.fileId).catch(() => {});
      }
      NotificationManager.add({ type: "success", title: "Check-In All Completed", message: `Refreshed ${targets.length} dead-man switches.` });
      await fetchVaultData();
    });
  }

  // Search Filter
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      state.searchQuery = e.target.value.trim();
      renderVaultFilesTable();
    });
  }

  // Recovery: Manual Create Button
  const btnCreateRec = document.getElementById("btnCreateRecovery");
  const recInput = document.getElementById("recoveryFileIdInput");
  if (btnCreateRec && recInput) {
    btnCreateRec.addEventListener("click", async () => {
      const fileId = recInput.value.trim();
      if (!fileId) {
        NotificationManager.add({ type: "warning", title: "Input Required", message: "Please enter a valid File ID." });
        return;
      }
      try {
        await api.createRecoveryRequest(fileId);
        NotificationManager.add({ type: "info", title: "Recovery Requested", message: `Lodge emergency recovery for ${truncateMiddle(fileId, 6, 4)}.` });
        recInput.value = "";
        await fetchVaultData();
      } catch (err) {
        NotificationManager.add({ type: "error", title: "Request Failed", message: err.message });
      }
    });
  }

  const btnRefreshAll = document.getElementById("btnRefreshAll");
  const btnRefreshFiles = document.getElementById("btnRefreshFiles");
  if (btnRefreshAll) btnRefreshAll.addEventListener("click", () => {
    checkBackendHealth();
    fetchVaultData();
  });
  if (btnRefreshFiles) btnRefreshFiles.addEventListener("click", fetchVaultData);

  // Setup Workflows
  setupUploadWorkflow();
  setupDecryptWizard();
  setupSettingsModal();

  // Initial Health & Data
  checkBackendHealth();
  fetchVaultData();

  // Periodic Intervals
  state.healthInterval = setInterval(checkBackendHealth, 8000);
  startCountdownTicker();
});
