/* ============================================================
   app.js — ACADEMIA VISIONOS (Vanilla JS, Premium)
   - Login (estudiante/admin) con usuario+clave estático,
     galería, CRUD videos, FAQs, imágenes, modal reproductor,
     búsqueda/filtrado, export/import, optional GAS (Google Sheets).
   - Almacenamiento: localStorage
   - Autor: Kinel & ChatGPT (2025) - Custom by user
   ============================================================ */

/* ---------------------------
   CONFIG / CONSTANTS
   --------------------------- */
const GAS_URL = "https://script.google.com/macros/s/AKfycbybkYwYFpX2KMm6v5852-HSp5dKPcbN5tMq3j2-zCa-iSmOUhr3g4GVzp9oUKECCUZx/exec"; // <-- Pega aquí la URL de tu Web App de Google Apps Script si quieres persistir en Sheets.

const KEYS = {
  VIDEOS: "vision_videos_v2",
  FAQS: "vision_faqs_v2",
  IMAGES: "vision_images_v2",
  USER:  "vision_user_v1"
};

// Credenciales estáticas (las que pediste)
const CREDENTIALS = {
  student: { user: "usuario8977", pass: "believe777" },
  admin:   { user: "edgar2026", pass: "believe2026" }
};

// UI selectors (intenta cubrir variantes)
const UI = {
  overlay: "#overlay",
  loginModal: "#loginModal",
  loginUser: "#loginUser",
  loginPass: "#loginPass",
  loginBtn: "#loginBtn",
  closeLogin: "#closeLogin",
  loginToggle: "#loginToggle",

  searchInput: "#searchInput",
  categoriesNode: "#categories",
  galleryNode: ".gallery-grid", // querySelector grabs first
  menuBtns: "#menu .menu-btn",

  userBadge: "#userBadge",
  logoutBtn: "#logoutBtn",

  // admin: support both wizard ids and simpler admin ids present in HTML
  adminVideoList: "#adminVideoList",
  wizTitle: "#wizTitle",
  wizLink: "#wizLink",
  wizCategory: "#wizCategory",
  wizNext: "#wizNext",
  wizPrev: "#wizPrev",
  wizSave: "#wizSave",
  previewBox: "#previewBox",
  videoWizard: "#videoWizard",

  // fallback ids that your HTML may have
  vidTitle: "#vidTitle",
  vidLink: "#vidLink",
  vidCategory: "#vidCategory",
  saveVideoBtn: "#saveVideoBtn",

  // categories admin
  catName: "#catName",
  addCategoryBtn: "#addCategoryBtn",
  adminCategories: "#adminCategories",
  adminGallery: "#adminGallery",

  faqList: "#faqList",
  addFaqBtn: "#addFaqBtn",

  imageInput: "#imageInput",
  imagesGrid: "#imagesGrid",

  videoModal: "#videoModal",
  modalPlayer: "#modalPlayer",
  modalMeta: "#modalMeta",
  closeVideoModal: "#closeVideoModal"
};

/* ---------------------------
   SMALL DOM HELPERS
   --------------------------- */
const $ = (sel, root = document) => {
  try { return (root || document).querySelector(sel); } catch(e) { return null; }
};
const $$ = (sel, root = document) => Array.from((root || document).querySelectorAll(sel || ""));
const on = (el, evt, cb) => el && el.addEventListener(evt, cb);
const create = (tag, props = {}) => {
  const el = document.createElement(tag);
  Object.entries(props).forEach(([k,v])=>{
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v);
  });
  return el;
};

/* ---------------------------
   APP STATE
   --------------------------- */
let state = {
  user: null,
  videos: [],
  faqs: [],
  images: [],
  ui: { activeSection: "home", wizardStep: 1, searchQuery: "", currentCategoryView: "" }
};


/* ---------------------------
   UTIL: ID / ESCAPE / DEBOUNCE
   --------------------------- */
function id(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
}
function esc(s) {
  return String(s || "").replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
}
function debounce(fn, wait = 180) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(()=>fn(...args), wait);
  };
}
function sanitizeForId(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "");
}

/* ---------------------------
   BOOTSTRAP
   --------------------------- */
document.addEventListener("DOMContentLoaded", async () => {
  bindUI();
  updateUIState();

  if (GAS_URL) {
    await loadVideosFromGAS(); // ⬅️ ESPERAR A GAS
  }

  // 🔒 SOLO si GAS no devolvió nada
  if (!state.videos.length) {
    seedDemoIfEmpty();
  }

  loadVideoCategories();
  renderAll();
  accessibilityBindings();
});


/* ---------------------------
   BIND UI
   --------------------------- */
function bindUI() {
  // overlay click to close modals
  on($(UI.overlay), "click", () => closeAllModals());

  // login flow
  on($(UI.loginToggle), "click", () => openLogin());
  on($(UI.closeLogin), "click", () => closeLogin());
  on($(UI.loginBtn), "click", () => doLogin());

  // search with debounce
  const searchEl = $(UI.searchInput);
  if (searchEl) on(searchEl, "input", debounce(e => {
    state.ui.searchQuery = e.target.value.trim();
    // if search cleared, reset category view
    if (!state.ui.searchQuery) state.ui.currentCategoryView = "";
    renderGallery();
  }, 160));

  // bottom menu buttons
  $$(UI.menuBtns).forEach(btn => {
    on(btn, "click", () => {
      const sec = btn.dataset.section;
      if (sec) showSection(sec);
      $$(UI.menuBtns).forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  // logout button (if present)
  const logoutEl = $(UI.logoutBtn);
  if (logoutEl) on(logoutEl, "click", () => {
    state.user = null;

    updateUIState();
    renderAll();
    showSection("home");
  });

  // close video modal
  on($(UI.closeVideoModal), "click", () => closeVideoModal());

  // wizard / admin save - support two possible HTML naming conventions:
  const saveBtn = $(UI.wizSave) || $(UI.saveVideoBtn);
  if (saveBtn) on(saveBtn, "click", () => saveWizardVideo());

  // CODIGO PARA CREAR CATEGORIAS EN GOOGLESHEET DIRECTAMENTE 
on($(UI.addCategoryBtn), "click", () => {
  const name = ($(UI.catName)?.value || "").trim();
  if (!name) return flashToast("Ingresa nombre de categoría");

  fetch(GAS_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "add_category",
      name
    })
  })
    .then(() => {
      // ✅ CON no-cors: si llegó aquí, asumimos éxito

      if (!state.categories.includes(name)) {
        state.categories.push(name);
        state.categories.sort();
      }

      populateCategorySelect();
      renderAdminCategories?.();
      renderCategoryCards?.();

      $(UI.catName).value = "";
      flashToast(`Categoría "${name}" creada ✅`);
    })
    .catch(() => {
      // ❌ solo errores reales de red
      flashToast("Error de red al crear categoría ❌");
    });
});



  // admin list delegated actions
  on($(UI.adminVideoList), "click", (ev) => {
    const btn = ev.target;
    const row = btn.closest(".video-item");
    if (!row) return;
    const vid = row.dataset.id;
    if (btn.matches(".del")) deleteVideo(vid);
    else if (btn.matches(".edit")) editVideo(vid);
    else if (btn.matches(".play")) openVideoModal(findVideo(vid));
  });

  // click on video-card -> open modal (or if it's category-card -> open category)
  document.addEventListener("click", (ev) => {
    const catCard = ev.target.closest(".category-card");
    if (catCard) {
      const catName = catCard.dataset.category;
      if (catName) openCategory(catName);
      return;
    }
    const vidCard = ev.target.closest(".video-card");
    if (vidCard) {
      const vidId = vidCard.dataset.id;
      if (vidId) openVideoModal(findVideo(vidId));
    }
  });

  // FAQ actions
  const addFaq = $(UI.addFaqBtn);
  if (addFaq) on(addFaq, "click", () => addFaqDialog());
  on($(UI.faqList), "click", (ev) => {
    const el = ev.target;
    const row = el.closest(".faq");
    if (!row) return;
    const fid = row.dataset.id;
    if (el.matches(".faq-edit")) editFaq(fid);
    if (el.matches(".faq-del")) deleteFaq(fid);
  });

  // images upload
  const imageInput = $(UI.imageInput);
  if (imageInput) on(imageInput, "change", (e) => handleImageUpload(e.target.files));

  // keyboard ESC closes modals
  on(document, "keydown", (e) => {
    if (e.key === "Escape") closeAllModals();
    if (e.key === "Enter" && !$(UI.loginModal)?.classList.contains("hidden")) doLogin();
  });
}

/* ---------------------------
   ACCESSIBILITY
   --------------------------- */
function accessibilityBindings() {
  // focus behaviors or ARIA improvements could go here
}

/* ---------------------------
   SECTION NAV
   --------------------------- */
function showSection(id) {
  $$(".section").forEach(s => s.classList.remove("active"));
  const sec = document.getElementById(id);
  if (sec) sec.classList.add("active");
  state.ui.activeSection = id;
  // hide admin only
  $$(".admin-only").forEach(el => el.style.display = state.user?.role === "admin" ? "" : "none");
  // smooth scroll to top for UX
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------------------------
   LOGIN
   --------------------------- */
function openLogin() {
  $(UI.overlay)?.classList.remove("hidden");
  $(UI.loginModal)?.classList.remove("hidden");
  setupLoginPasswordToggle(); // llamamos al ojo para mostrar/ocultar contraseña
  // set focus
  $(UI.loginUser)?.focus();
}

function closeLogin() {
  $(UI.overlay)?.classList.add("hidden");
  $(UI.loginModal)?.classList.add("hidden");
}

function doLogin() {
  // asegurar que el selector SI existe
  const roleEl = document.getElementById("loginRole");

  if (!roleEl) {
    console.error("ERROR: loginRole no existe en el DOM");
    flashToast("Error interno: no se encuentra el selector de rol.", { danger: true });
    return;
  }

  const role = roleEl.value.trim();
  const username = ($(UI.loginUser)?.value || "").trim();
  const pass = ($(UI.loginPass)?.value || "").trim();

  if (!username || !pass) {
    return flashToast("Ingresa usuario y contraseña", { danger: true });
  }

  const expected = CREDENTIALS[role];

  if (!expected) {
    return flashToast("Rol inválido", { danger: true });
  }

  console.log("DEBUG LOGIN →", { role, username, pass, expected });

  if (username === expected.user && pass === expected.pass) {
    state.user = { role, name: username };

    updateUIState();
    closeLogin();

    // 🔹 mostrar sección por defecto según rol
    if (role === "admin") {
      showSection("admin-videos");
    } else {
      showSection("home");
    }

    renderAll();

    // ✅ ONBOARDING SOLO PARA ESTUDIANTE
    if (role === "student") {
      startGuidedOnboarding(); // 👈 AQUÍ
    }

    flashToast(`Bienvenido ${username} — ${role}`);
  } else {
    flashToast("Credenciales incorrectas", { danger: true });
  }
}

// FUNCION PARA MOSTRAR/OCULTAR CONTRASEÑA EN LOGIN
function setupLoginPasswordToggle() {
  const passInput = document.getElementById("loginPass");
  const toggleBtn = document.getElementById("toggleLoginPass");

  if (!passInput || !toggleBtn) return;

  let visible = false;

  toggleBtn.onclick = () => {
    visible = !visible;
    passInput.type = visible ? "text" : "password";
    toggleBtn.textContent = visible ? "🙈" : "👁️";

    // mantener foco
    passInput.focus({ preventScroll: true });
  };
}



/* ---------------------------
    ESTA FUNCION INICIA EL ONBOARDING GUIADO, EL VIDEO QUE APARECE AL PRINCIPIO
   --------------------------- */
function startGuidedOnboarding() {
  
  if (localStorage.getItem("onboarding_done")) return;

  waitForVideos(() => {
    const onboardingVideo = state.videos.find(
      v => v.category === "Bienvenido a Innova"
    );

    if (!onboardingVideo) {
      console.warn("Video de onboarding no encontrado en Google Sheets");
      return;
    }

    openVideoModal(onboardingVideo);

    // 🎉 CONFETI (NO SE TOCA)
    launchConfetti();

    // 🔔 Toast recomendado
    showOnboardingToast();

    // 👀 Escuchar cuando termina el video
    watchVideoEnd();
  });

  /* ===============================
     ESPERAR A QUE GOOGLE SHEETS CARGUE
     =============================== */
  function waitForVideos(callback) {
    const interval = setInterval(() => {
      if (Array.isArray(state.videos) && state.videos.length > 0) {
        clearInterval(interval);
        callback();
      }
    }, 200);
  }

  /* ===============================
     🔔 TOAST INICIAL
     =============================== */
  function showOnboardingToast() {
    if (!window.Swal) return;

    injectToastStyles();

    Swal.fire({
      toast: true,
      position: "top-end",
      icon: "info",
      title: "Recomendado",
      html: `
        <strong>Mira este video 🎥</strong><br>
        para empezar correctamente
      `,
      showConfirmButton: false,
      timer: 4500,
      timerProgressBar: true,
      background: "#0b1e2d",
      color: "#e6faff",
      iconColor: "#00f0ff",
      customClass: {
        popup: "onboarding-toast"
      }
    });
  }

  function injectToastStyles() {
    if (document.getElementById("onboarding-toast-style")) return;

    const style = document.createElement("style");
    style.id = "onboarding-toast-style";
    style.innerHTML = `
      .onboarding-toast {
        border-radius: 12px !important;
        padding: 14px 18px !important;
        box-shadow: 0 10px 30px rgba(0,0,0,.35) !important;
        border: 1px solid #00f0ff33 !important;
        font-size: 14px !important;
      }
    `;
    document.head.appendChild(style);
  }

  /* ===============================
     👀 DETECTAR FIN DEL VIDEO
     =============================== */
  function watchVideoEnd() {
    const interval = setInterval(() => {
      const modal = document.querySelector(".video-modal");
      const video = modal?.querySelector("video");

      if (!video) return;

      clearInterval(interval);

      video.addEventListener(
        "ended",
        () => {
          localStorage.setItem("onboarding_done", "1");
          showCategorySweetGuide();
        },
        { once: true }
      );
    }, 200);
  }

  /* ===============================
     👉 SWEET ALERT GUIADO A CATEGORÍA
     =============================== */
  function showCategorySweetGuide() {
    if (!window.Swal) return;

    Swal.fire({
      title: "¿Qué sigue? 🚀",
      html: `
        <p style="margin-bottom:8px">
          Ahora haz clic en la categoría:
        </p>
        <strong style="color:#00f0ff">
          🎓 Fundamentos / Primeros Pasos
        </strong>
      `,
      icon: "success",
      confirmButtonText: "Ir ahora",
      background: "#081923",
      color: "#e6faff",
      confirmButtonColor: "#00f0ff"
    }).then(() => {
      showCategoryGuide(); // 👈 TU FUNCIÓN EXISTENTE
    });
  }

  /* ===============================
     🎉 CONFETI (ORIGINAL — NO TOCADO)
     =============================== */
  function launchConfetti() {
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.inset = 0;
    container.style.pointerEvents = "none";
    container.style.zIndex = 10050;
    document.body.appendChild(container);

    const colors = [
      "#ff4d4d",
      "#ffd93d",
      "#6cff6c",
      "#4dd2ff",
      "#b84dff",
      "#ff66cc",
      "#00f0ff"
    ];

    const piecesPerSide = 120;
    const duration = 9500;
    const gravity = window.innerHeight + 120;

    function createPiece(fromLeft) {
      const el = document.createElement("div");
      const size = Math.random() * 10 + 6;
      el.style.position = "absolute";
      el.style.width = size + "px";
      el.style.height = size + "px";
      el.style.backgroundColor =
        colors[Math.floor(Math.random() * colors.length)];
      el.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";

      const startX = fromLeft ? 0 : window.innerWidth;
      const startY = window.innerHeight;
      const powerX =
        (fromLeft ? 1 : -1) * (Math.random() * 420 + 260);
      const powerY = -(Math.random() * 420 + 360);

      el.style.left = startX + "px";
      el.style.top = startY + "px";

      el.animate(
        [
          { transform: "translate(0,0)", opacity: 1 },
          { transform: `translate(${powerX}px, ${powerY}px)` },
          { transform: `translate(${powerX}px, ${gravity}px)`, opacity: 0 }
        ],
        {
          duration,
          easing: "cubic-bezier(.18,.85,.35,1)",
          fill: "forwards"
        }
      );

      container.appendChild(el);
    }

    for (let i = 0; i < piecesPerSide; i++) createPiece(true);
    for (let i = 0; i < piecesPerSide; i++) createPiece(false);

    setTimeout(() => container.remove(), duration + 600);
  }

  /* ===============================
     TU GUÍA EXISTENTE
     =============================== */
  function showCategoryGuide() {
    // 👌 NO SE TOCA
  }
}




/* ---------------------------
   UI STATE UPDATES
   --------------------------- */
function updateUIState() {
  const badge = $(UI.userBadge);
  if (badge) {
    if (state.user) badge.textContent = `${state.user.name} — ${state.user.role}`;
    else badge.textContent = "Invitado";
  }
  if ($(UI.loginToggle)) $(UI.loginToggle).textContent = state.user ? "Perfil" : "Login";
  // hide/show admin-only elements
  $$(".admin-only").forEach(el => el.style.display = state.user?.role === "admin" ? "" : "none");
  populateBottomNavIcons();
}

/* ---------------------------
   RENDER: ALL
   --------------------------- */
function renderAll() {
  renderCategoryCards();
  renderGallery();
  renderAdminVideoList();
  renderAdminCategories();
  renderFaqs();
  renderImages();
}

/* ---------------------------
   CATEGORY CARDS (home view) TAMBIEN CREA LAS CATEGORIAS Y LAS ENVIA A GOOGLE SHEET
   --------------------------- */
function renderCategoryCards() {
  const node = $(UI.categoriesNode);
  if (!node) return;
  node.innerHTML = "";

  /* ===============================
     🔒 SIN SESIÓN → LOGIN + MENSAJE
     =============================== */
  if (!state.user) {
    openLogin(true); // fuerza modal + blur

    const msg = document.createElement("div");
    msg.className = "category-loader";
    msg.innerHTML = `
      <div style="text-align:center">
        <div style="
          font-size: 32px;
          margin-bottom: 10px;
          color: #00f0ff;
        ">🔒</div>
        <div class="category-loading-text">
          Es necesario iniciar sesión<br>
          para cargar los videos
        </div>
      </div>
    `;
    node.appendChild(msg);
    return;
  }

  /* ===============================
     🔄 CSS DEL LOADER (UNA SOLA VEZ)
     =============================== */
  if (!document.getElementById("category-loader-css")) {
    const style = document.createElement("style");
    style.id = "category-loader-css";
    style.innerHTML = `
      .category-loader {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 140px;
        width: 100%;
      }

      .category-spinner {
        width: 46px;
        height: 46px;
        border: 4px solid rgba(0,240,255,.2);
        border-top-color: #00f0ff;
        border-radius: 50%;
        animation: spinCategory 1s linear infinite;
      }

      @keyframes spinCategory {
        to { transform: rotate(360deg); }
      }

      .category-loading-text {
        margin-top: 12px;
        font-size: 13px;
        color: #66ffff;
        text-align: center;
        opacity: .9;
        line-height: 1.4;
      }
    `;
    document.head.appendChild(style);
  }

  /* ===============================
     📊 OBTENER CATEGORÍAS
     =============================== */
  const cats = Array.from(
    new Set(
      state.videos
        .map(v => v.category)
        .filter(cat => cat && cat !== "Bienvenido a Innova")
    )
  ).sort();

  /* ===============================
     ⏳ LOADER NORMAL (CON SESIÓN)
     =============================== */
  if (!cats.length) {
    const loader = document.createElement("div");
    loader.className = "category-loader";
    loader.innerHTML = `
      <div style="text-align:center">
        <div class="category-spinner"></div>
        <div class="category-loading-text">
          Cargando categorías…
        </div>
      </div>
    `;
    node.appendChild(loader);
    return;
  }

  /* ===============================
     🗂️ RENDER NORMAL
     =============================== */
  cats.forEach(cat => {
    const card = create("div", {
      class: "category-card",
      "data-category": cat
    });

    const catVideos = state.videos.filter(v => v.category === cat);
    const thumb = catVideos.length
      ? catVideos[0].thumb
      : defaultCategoryThumb(cat);

    card.innerHTML = `
      <div class="category-thumb" style="
        background-image: url('${esc(thumb)}');
        width: 100%;
        height: 120px;
        border-radius: 8px 8px 0 0;
        background-size: cover;
        background-position: center;
        margin-bottom: 6px;
      "></div>
      <div class="category-name" style="
        text-align: center;
        font-weight: 500;
        color: #00f0ff;
      ">
        ${esc(cat)} (${catVideos.length})
      </div>
    `;

    card.style.cursor = "pointer";
    card.style.padding = "6px";
    card.style.margin = "5px";
    card.style.border = "2px solid #00f0ff";
    card.style.borderRadius = "8px";
    card.style.backgroundColor = "#ffffff0D";
    card.style.transition = "all 0.2s";
    card.style.display = "inline-block";
    card.style.width = "160px";
    card.style.userSelect = "none";

    card.addEventListener("mouseenter", () => {
      if (!card.classList.contains("active")) {
        card.style.backgroundColor = "#ffffff1A";
        card.style.borderColor = "#66ffff";
      }
    });

    card.addEventListener("mouseleave", () => {
      if (!card.classList.contains("active")) {
        card.style.backgroundColor = "#ffffff0D";
        card.style.borderColor = "#00f0ff";
      }
    });

    card.addEventListener("click", () => {
      node.querySelectorAll(".category-card").forEach(c => {
        c.classList.remove("active");
        c.style.backgroundColor = "#ffffff0D";
        c.style.borderColor = "#00f0ff";
        c.querySelector(".category-name").style.color = "#00f0ff";
      });

      card.classList.add("active");
      card.style.backgroundColor = "#00aaff";
      card.style.borderColor = "#00ffff";
      card.querySelector(".category-name").style.color = "#fff";

      state.selectedCategory = cat;
      console.log("Categoría guardada:", cat);
    });

    node.appendChild(card);
  });
}





function defaultCategoryThumb(category) {
  // static placeholder per your request (simple SVG as data URI)
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'>
    <rect width='100%' height='100%' fill='#0b1220'/>
    <text x='50%' y='50%' fill='#8fb' font-family='Arial' font-size='28' text-anchor='middle' dominant-baseline='middle'>${esc(category)}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* ---------------------------
   OPEN CATEGORY (dynamic section)
   --------------------------- */
function openCategory(catName) {
  // hide other sections
  $$(".section").forEach(s => s.classList.remove("active"));

  // sanitize id
  const sid = "cat-" + sanitizeForId(catName);
  let section = document.getElementById(sid);

  if (!section) {
    section = document.createElement("section");
    section.id = sid;
    section.className = "section fade-in";
    section.innerHTML = `
      <div class="cat-header">
        <button class="ghost backBtn">← Regresar</button>
        <h2 class="cat-title">${esc(catName)}</h2>
      </div>
      <div class="gallery-grid" id="grid-${sid}"></div>
    `;
    document.querySelector("main").appendChild(section);

    // back button
    section.querySelector(".backBtn").addEventListener("click", () => {
      section.classList.remove("active");
      const home = document.getElementById("home");
      requestAnimationFrame(()=>{ home.classList.add("active"); });
      state.ui.currentCategoryView = "";
    });
  }

  // store current
  state.ui.currentCategoryView = catName;

  // render videos for that category
  renderCategoryVideos(catName, document.getElementById("grid-" + sid));

  // show
  requestAnimationFrame(()=>{ section.classList.add("active"); });
}

/* ---------------------------
   RENDER CATEGORY VIDEOS (grid)
   --------------------------- */
function renderCategoryVideos(catName, gridNode) {
  const grid = gridNode || document.getElementById("grid-" + "cat-" + sanitizeForId(catName));
  if (!grid) return;
  grid.innerHTML = "";

  const videos = state.videos.filter(v => v.category === catName);

  if (!videos.length) {
    grid.innerHTML = `<div class="muted">No hay videos en esta categoría.</div>`;
    return;
  }

  videos.forEach(v => {
    const card = create("div", { class: "video-card fade-in", "data-id": v.id });
    card.dataset.id = v.id;
    card.innerHTML = `
      <div class="video-thumb" style="background-image:url('${esc(v.thumb)}')"></div>
      <div class="video-title">${esc(v.title)}</div>
      <div class="muted">${esc(v.category)}</div>
    `;
    card.addEventListener("click", () => openVideoModal(v));
    grid.appendChild(card);
  });
}

/* ---------------------------
   RENDER: GALLERY (general / search)
   --------------------------- */
// function renderGallery() {
//   const container = document.querySelector(UI.galleryNode);
//   if (!container) return;
//   container.innerHTML = "";

//   const q = (state.ui.searchQuery || "").toLowerCase();

//   const filtered = state.videos.filter(v => {
//     if (!q) return true;
//     return (v.title + " " + (v.category || "")).toLowerCase().includes(q);
//   });

//   if (filtered.length === 0) {
//     container.innerHTML = `<div class="muted">No se encontraron videos.</div>`;
//     return;
//   }

//   filtered.forEach(v => {
//     const card = create("div", { class: "video-card", "data-id": v.id });
//     card.dataset.id = v.id;
//     card.innerHTML = `
//       <div class="video-thumb" style="background-image:url('${esc(v.thumb)}')"></div>
//       <div class="video-title">${esc(v.title)}</div>
//       <div class="muted">${esc(v.category)}</div>
//     `;
//     container.appendChild(card);
//   });
// }

function renderGallery() {
  const container = document.querySelector(UI.galleryNode);
  if (!container) return;

  // 🧹 SIEMPRE limpiar primero
  container.innerHTML = "";

  /* ===============================
     🔒 SOLO ADMIN
     =============================== */
  if (!state.user || state.user.role !== "admin") {
    console.warn("renderGallery bloqueado: solo admin");
    return; // 👈 estudiante / invitado → NO ve nada
  }

  const q = (state.ui.searchQuery || "").toLowerCase();

  const filtered = state.videos.filter(v => {
    if (!q) return true;
    return (v.title + " " + (v.category || "")).toLowerCase().includes(q);
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="muted">No se encontraron videos.</div>`;
    return;
  }

  filtered.forEach(v => {
    const card = create("div", {
      class: "video-card",
      "data-id": v.id
    });

    card.innerHTML = `
      <div class="video-thumb"
           style="background-image:url('${esc(v.thumb)}')">
      </div>
      <div class="video-title">${esc(v.title)}</div>
      <div class="muted">${esc(v.category)}</div>
    `;

    container.appendChild(card);
  });
}

/* ---------------------------
   RENDER: ADMIN VIDEO LIST (panel)
   --------------------------- */
function renderAdminVideoList() {
  const node = $(UI.adminVideoList) || $(UI.adminGallery);
  if (!node) return;
  node.innerHTML = "";

  if (!state.videos.length) {
    node.innerHTML = `<div class="muted">No hay videos guardados.</div>`;
    return;
  }

  // FILTRO SEGÚN LA CATEGORÍA SELECCIONADA
  const list = state.activeAdminCategory && state.activeAdminCategory !== "Todas"
    ? state.videos.filter(v => v.category === state.activeAdminCategory)
    : state.videos;

  if (!list.length) {
    node.innerHTML = `<div class="muted">No hay videos en esta categoría.</div>`;
    return;
  }

  list.slice().reverse().forEach(v => {
    const card = create("div", { 
      class: "video-card", 
      "data-id": v.id,
      style: `
        padding-bottom: 16px;
        display: flex;
        flex-direction: column;
      `
    });

    card.innerHTML = `
      <div class="video-thumb" style="background-image:url('${esc(v.thumb)}');height:150px;"></div>

      <div class="video-title" style="padding:14px 14px 4px;">
        ${esc(v.title)}
      </div>

      <div class="muted" style="padding:0 14px 10px;">
        ${esc(v.category)}
      </div>

      <div class="card-actions" style="
          display:flex;
          gap:10px;
          padding:10px 14px;
          background:rgba(255,255,255,0.04);
          border-radius:14px;
          border:1px solid var(--glass-border);
          backdrop-filter:blur(12px);
          margin:0 14px;
      ">
        <button class="play small" style="
          flex:1;
          border:1px solid var(--glass-border);
          padding:8px 0;
          border-radius:10px;
          background:rgba(255,255,255,0.05);
        ">Ver</button>

        <button class="edit small" style="
          flex:1;
          border:1px solid var(--glass-border);
          padding:8px 0;
          border-radius:10px;
          background:rgba(255,255,255,0.05);
        ">Editar</button>

        <button class="del small" style="
          flex:1;
          border:1px solid rgba(255,50,50,0.35);
          padding:8px 0;
          border-radius:10px;
          background:rgba(255,255,255,0.05);
        ">Eliminar</button>
      </div>
    `;

    // 🔹 Evitar que los clicks en botones se propaguen a la card
    card.querySelectorAll(".card-actions button").forEach(btn => {
      btn.addEventListener("click", e => e.stopPropagation());
    });

    // 🔹 Agregar funcionalidad a los botones
    card.querySelector(".play").addEventListener("click", () => openVideoModal(v.id));
    card.querySelector(".edit").addEventListener("click", () => editVideo(v.id));
    card.querySelector(".del").addEventListener("click", () => deleteVideo(v.id));

    // Opcional: si quieres que clic en la card (fuera de botones) haga algo, p. ej. ver video
    card.addEventListener("click", () => openVideoModal(v.id));

    node.appendChild(card);
  });
}





/* ---------------------------
   ADMIN: categories list UI
   --------------------------- */
function renderAdminCategories() {
  const node = $(UI.adminCategories);
  if (!node) return;
  node.innerHTML = "";

  const categories = Array.from(
    new Set(state.videos.map(v => v.category || "General"))
  ).sort();

  const allCats = ["Todas", ...categories];

  if (!categories.length) {
    node.innerHTML = `<div class="muted">No hay categorías.</div>`;
    return;
  }

  allCats.forEach(cat => {
    const d = create("div", { 
      class: "admin-cat",
      "data-cat": cat,
      style: `
        padding: 10px 14px;
        margin-bottom: 8px;
        border-radius: 12px;
        cursor: pointer;
        background: ${
          state.activeAdminCategory === cat 
            ? "rgba(255,255,255,0.18)" 
            : "rgba(255,255,255,0.05)"
        };
        border: 1px solid ${
          state.activeAdminCategory === cat 
            ? "var(--glass-border)" 
            : "transparent"
        };
        backdrop-filter: blur(10px);
        transition: 0.2s;
      `
    });

    d.innerHTML = `<strong>${esc(cat)}</strong>`;

    d.onclick = () => {
      state.activeAdminCategory = cat;
      renderAdminCategories();
      renderAdminVideoList(); // ⬅️ YA NO LLAMA OTRA FUNCIÓN
    };

    node.appendChild(d);
  });
}




/* ---------------------------
  ES PARA OBTENER ELEMENTOS ADMIN (wizard o admin)
   --------------------------- */
function getAdminField(selector1, selector2) {
  return $(selector1) || $(selector2) || null;
}

/* ---------------------------
    ESPERAR Y SINCRONIZAR VIDEOS DESDE GOOGLE SHEETS
   --------------------------- */
function syncVideosFromGAS(delay = 800) {
  if (!GAS_URL) return;
  setTimeout(() => {
    loadVideosFromGAS();
  }, delay);
}

/* ---------------------------
  GUARDAR VIDEO DESDE WIZARD (ADMIN)
   --------------------------- */
async function saveWizardVideo() {
  const titleEl = getAdminField(UI.wizTitle, UI.vidTitle);
  const linkEl  = getAdminField(UI.wizLink, UI.vidLink);
  const catEl   = getAdminField(UI.wizCategory, UI.vidCategory);

  const title = (titleEl?.value || "").trim();
  const link  = (linkEl?.value || "").trim();
  // Obtener categoría de google sheets 
  const category = (catEl?.value || "").trim();

if (!category) {
  alert("Debes seleccionar una categoría");
  return;
}


  if (!title || !link) {
    return flashToast("Completa título y URL antes de guardar.", { danger: true });
  }

  // ⬅️ Esperar la thumbnail (asíncrona)
  const thumb = await thumbnailFromLink(link);

  const newVideo = {
    id: editingVideoId || id("v"),
    title,
    link,
    category,
    thumb,
    created: Date.now()
  };

  if (editingVideoId) {
    // actualizar video existente
    state.videos = state.videos.map(v =>
      v.id === editingVideoId ? newVideo : v
    );
    flashToast("Video actualizado ✅");

  } else {
    // agregar nuevo
    state.videos.push(newVideo);
    flashToast("Video guardado ✅");
  }

  renderAll();

  // --------- GOOGLE SHEETS ----------
  if (GAS_URL) {
    if (editingVideoId) {
      // primero eliminar el registro viejo
      sendToGAS({ action: "delete_video", id: editingVideoId })
        .then(() => sendToGAS({ action: "add_video", video: newVideo }))
        .then(() => syncVideosFromGAS())
        .catch(err => console.warn("GAS update failed", err));

    } else {
      sendToGAS({ action: "add_video", video: newVideo })
        .catch(err => console.warn(err));
    }
  }

  // limpiar formulario
  if (titleEl) titleEl.value = "";
  if (linkEl) linkEl.value = "";
  if (catEl) catEl.value = "";

  editingVideoId = null;
}

/* ---------------------------
   VIDEO CRUD HELPERS
   --------------------------- */
function findVideo(id) {
  return state.videos.find(v => v.id === id) || null;
}


 
// ELIMINAR VIDEO SUPER ROBUSTO + FAILSAFE
async function deleteVideo(id) {
  try {
    id = String(id).trim();
    const video = findVideo(id);

    if (!video) {
      console.warn("Video no encontrado localmente:", id);
      return;
    }

    const result = await Swal.fire({
      title: '¿Eliminar video?',
      text: `Confirma que deseas eliminar "${video.title}"`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) return;

    console.log("ENVIANDO ID A GAS:", id);

    // PETICIÓN INFALIBLE: siempre envía action + id / también por query
    if (GAS_URL) {
      await fetch(
        `${GAS_URL}?action=delete_video&id=${encodeURIComponent(id)}`,
        {
          method: "POST",
          mode: "no-cors"
        }
      ).catch(err => console.error("Fallo fetch delete:", err));
    }

    // eliminar local SIEMPRE
    state.videos = state.videos.filter(v => String(v.id).trim() !== id);
    renderAll();
    flashToast("Video eliminado correctamente");

  } catch (err) {
    console.error("Error deleteVideo:", err);
    Swal.fire("Error", "No se pudo eliminar el video", "error");
  }
}






/* ---------------------------
   EDIT VIDEO (ADMIN)
   --------------------------- */
let editingVideoId = null;

// Abrir modal con datos a editar
function editVideo(id) {
  id = String(id).trim();
  const v = findVideo(id);

  if (!v) {
    console.warn("Video no encontrado:", id);
    return;
  }

  // autocompletar
  getAdminField(UI.wizTitle, UI.vidTitle).value = v.title || "";
  getAdminField(UI.wizLink, UI.vidLink).value = v.link || "";
  getAdminField(UI.wizCategory, UI.vidCategory).value = v.category || "";
  getAdminField(UI.wizThumb, UI.vidThumb).value = v.thumb || "";

  editingVideoId = id;
  flashToast("Edita los datos y guarda.");
}

// Guardar cambios (FORZADO + INFALIBLE)
async function saveVideoEdits() {
  try {
    if (!editingVideoId) return;

    const updated = {
      id: String(editingVideoId).trim(),
      title: getAdminField(UI.wizTitle, UI.vidTitle).value || "",
      link: getAdminField(UI.wizLink, UI.vidLink).value || "",
      category: getAdminField(UI.wizCategory, UI.vidCategory).value || "",
      thumb: getAdminField(UI.wizThumb, UI.vidThumb).value || "",
      created: new Date().toISOString()
    };

    console.log("ENVIANDO VIDEO ACTUALIZADO:", updated);

    // PETICIÓN INFALIBLE → parámetros también por URL
    if (GAS_URL) {
      await fetch(
        `${GAS_URL}?action=edit_video`
        + `&id=${encodeURIComponent(updated.id)}`
        + `&title=${encodeURIComponent(updated.title)}`
        + `&link=${encodeURIComponent(updated.link)}`
        + `&category=${encodeURIComponent(updated.category)}`
        + `&thumb=${encodeURIComponent(updated.thumb)}`,
        {
          method: "POST",
          mode: "no-cors"
        }
      ).catch(err => console.error("Error fetch edit:", err));
    }

    // actualizar local
    const idx = state.videos.findIndex(v => String(v.id).trim() === updated.id);
    if (idx !== -1) state.videos[idx] = updated;

    renderAll();
    flashToast("Cambios guardados");
    editingVideoId = null;

  } catch (err) {
    console.error("Error saveVideoEdits:", err);
    Swal.fire("Error", "No se pudo actualizar el video", "error");
  }
}



/* ---------------------------
  FIN EDIT VIDEO DE PARTE DEL ADMIN 
   --------------------------- */

/* ---------------------------
   EMBED / THUMBNAIL HELPERS
   --------------------------- */
function thumbnailFromLink(link) {
  try {
    const u = new URL(link);
    if (u.hostname.includes("youtube") || u.hostname.includes("youtu.be")) {
      const vid = u.searchParams.get("v") || u.pathname.split("/").pop();
      return `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
    }
  } catch (e) { /* ignore */ }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'><rect width='100%' height='100%' fill='#081028'/><text x='50%' y='50%' fill='#777' font-family='Arial' font-size='20' dominant-baseline='middle' text-anchor='middle'>Preview</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
function embedFromLink(link) {
  try {
    const u = new URL(link);
    if (u.hostname.includes("youtube") || u.hostname.includes("youtu.be")) {
      const vid = u.searchParams.get("v") || u.pathname.split("/").pop();
      return `<iframe src="https://www.youtube.com/embed/${vid}?rel=0" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen style="width:100%;height:480px;border-radius:10px;"></iframe>`;
    }
  } catch (e) {}
  return `<iframe src="${esc(link)}" frameborder="0" style="width:100%;height:480px;border-radius:10px;"></iframe>`;
}

/* ---------------------------
   MODAL: VIDEO PLAYER
   --------------------------- */
function openVideoModal(video) {
  if (!video) return;
  const modal = $(UI.videoModal);
  if (!modal) return;
  $(UI.modalPlayer).innerHTML = embedFromLink(video.link);
  $(UI.modalMeta).innerHTML = `<h3>${esc(video.title)}</h3><div class="muted">${esc(video.category)}</div>`;
  modal.classList.remove("hidden");
  $(UI.overlay).classList.remove("hidden");
  // focus close button if available
  $(UI.closeVideoModal)?.focus();
}
function closeVideoModal() {
  $(UI.modalPlayer).innerHTML = "";
  $(UI.videoModal).classList.add("hidden");
  $(UI.overlay).classList.add("hidden");
}

/* ---------------------------
   FAQ CRUD
   --------------------------- */
function renderFaqs() {
  const node = $(UI.faqList);
  if (!node) return;
  node.innerHTML = "";
  if (!state.faqs.length) {
    node.innerHTML = `<div class="muted">No hay FAQs aún.</div>`;
    return;
  }
  state.faqs.slice().reverse().forEach(f => {
    const el = create("div", { class: "faq", "data-id": f.id });
    el.innerHTML = `
      <div>
        <div style="font-weight:700">${esc(f.q)}</div>
        <div class="muted">${esc(f.a)}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="faq-edit ghost small">Editar</button>
        <button class="faq-del ghost small">Eliminar</button>
      </div>
    `;
    node.appendChild(el);
  });
}
function addFaqDialog() {
  const q = prompt("Pregunta (FAQ):");
  if (!q) return;
  const a = prompt("Respuesta:");
  if (a === null) return;
  const newFaq = { id: id("f"), q: q.trim(), a: a.trim() };
  state.faqs.push(newFaq);
  
  renderFaqs();
  if (GAS_URL) sendToGAS({ action: "add_faq", faq: newFaq }).catch(()=>{});
  flashToast("FAQ añadida");
}
function editFaq(fid) {
  const f = state.faqs.find(x => x.id === fid);
  if (!f) return;
  const q = prompt("Editar pregunta:", f.q);
  if (q === null) return;
  const a = prompt("Editar respuesta:", f.a);
  if (a === null) return;
  f.q = q.trim();
  f.a = a.trim();
  
  renderFaqs();
  flashToast("FAQ actualizada");
}
function deleteFaq(fid) {
  if (!confirm("Eliminar FAQ?")) return;
  state.faqs = state.faqs.filter(x => x.id !== fid);
  
  renderFaqs();
  flashToast("FAQ eliminada");
}

/* ---------------------------
   IMAGES: UPLOAD & RENDER
   --------------------------- */
function handleImageUpload(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const readers = files.map(f => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res({ id: id("img"), name: f.name, data: r.result });
    r.onerror = rej;
    r.readAsDataURL(f);
  }));
  Promise.all(readers).then(results => {
    state.images.push(...results);
    
    renderImages();
    flashToast(`${results.length} imagen(es) subidas`);
  }).catch(err => {
    console.error(err);
    flashToast("Error al leer imágenes", { danger: true });
  });
}
function renderImages() {
  const node = $(UI.imagesGrid);
  if (!node) return;
  node.innerHTML = "";
  if (!state.images.length) return node.innerHTML = `<div class="muted">No hay imágenes.</div>`;
  state.images.slice().reverse().forEach(img => {
    const c = create("div", { class: "img-card" });
    c.innerHTML = `<img src="${esc(img.data)}" alt="${esc(img.name)}"><a class="download" href="${esc(img.data)}" download="${esc(img.name)}">Descargar</a>`;
    node.appendChild(c);
  });
}

/* ---------------------------
   SEND TO GAS (optional)
   --------------------------- */
async function sendToGAS(payload) {
  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

    const data = await res.json();
    return data;

  } catch (err) {
    console.error("GAS request failed", err);
    throw err;
  }
}


/* ---------------------------
   LOAD FROM GAS (optional)
   - Expects the GAS endpoint to return JSON array of videos when requested GET.
   - Implementation depends on your GAS WebApp; adapt as needed.
   --------------------------- */
let gasVideosLoaded = false;

function loadVideosFromGAS() {
  if (!GAS_URL || gasVideosLoaded) return;

  gasVideosLoaded = true; // 🔒 BLOQUEO

  const url =
    GAS_URL + (GAS_URL.includes("?") ? "&" : "?") + "action=get_videos";

  fetch(url)
    .then(r => {
      if (!r.ok) throw new Error("No se pudo cargar desde GAS");
      return r.json();
    })
    .then(data => {
      if (!Array.isArray(data)) return;

      state.videos = data
        .filter(d => d && d.title && d.link)
        .map(d => ({
          id: String(d.id || id("v")),
          title: d.title,
          link: d.link,
          category: d.category || "General",
          thumb: d.thumb || thumbnailFromLink(d.link),
          created: d.created ? Number(d.created) : Date.now()
        }));

      loadVideoCategories();
      loadCategoriesFromGAS();
      renderAll();

      flashToast("Videos cargados correctamente ✅");
    })
    .catch(err => {
      console.warn("loadVideosFromGAS error", err);
      gasVideosLoaded = false; // 🔓 permite reintento
    });
}


/* ---------------------------
    CARGAR CATEGORÍAS DESDE SHEET categorias
   --------------------------- */
function loadCategoriesFromGAS() {
  if (!GAS_URL) return;

  const url =
    GAS_URL + (GAS_URL.includes("?") ? "&" : "?") + "action=get_categories";

  fetch(url)
    .then(r => r.json())
    .then(data => {
      if (!Array.isArray(data)) return;

      const fromSheet = data.map(c => c.category);

      // unir categorías del sheet + videos
      const fromVideos = state.videos.map(v => v.category).filter(Boolean);

      state.categories = Array.from(
        new Set([...fromSheet, ...fromVideos])
      ).sort();

      populateCategorySelect();
      renderCategoryCards?.();
      renderAdminCategories?.();
    })
    .catch(err => console.warn("loadCategoriesFromGAS", err));
}



/* ---------------------------
   UTIL: EXPORT / IMPORT CSV
   --------------------------- */
function exportVideosCSV() {
  if (!state.videos.length) return flashToast("No hay videos para exportar");
  const rows = [["id","title","link","category","thumb","created"]];
  state.videos.forEach(v => rows.push([v.id, v.title, v.link, v.category, v.thumb, v.created]));
  const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = create("a", { href: url });
  a.style.display = "none";
  a.download = `videos_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  flashToast("Exportado CSV de videos");
}
function importVideosCSV(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    const text = r.result;
    const lines = text.split(/\r?\n/).filter(Boolean);
    const [hdr, ...rest] = lines;
    const cols = hdr.split(",").map(h => h.replace(/"/g,"").trim());
    rest.forEach(line => {
      const values = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
      const obj = {};
      values.forEach((v,i) => { obj[cols[i]] = v.replace(/^"|"$/g,""); });
      if (obj.id && obj.title) {
        state.videos.push({
          id: obj.id || id("v"),
          title: obj.title,
          link: obj.link || "",
          category: obj.category || "General",
          thumb: obj.thumb || thumbnailFromLink(obj.link || ""),
          created: obj.created ? Number(obj.created) : Date.now()
        });
      }
    });
    
    renderAll();
    flashToast("CSV importado");
  };
  r.readAsText(file);
}

/* ---------------------------
   SMALL UX: TOAST
   --------------------------- */
function flashToast(message, opts = {}) {
  const { danger = false, timeout = 2200 } = opts;

  const t = create("div", { class: "vision-toast" });
  t.textContent = message;

  // estilos (IGUAL a los tuyos)
  t.style.position = "fixed";
  t.style.bottom = "24px";
  t.style.left = "50%";
  t.style.transform = "translateX(-50%)";
  t.style.background = danger
    ? "linear-gradient(90deg,#ff6b6b,#ff8f8f)"
    : "linear-gradient(90deg,var(--accent,#67e) ,#8ef)";
  t.style.color = "#001";
  t.style.padding = "10px 18px";
  t.style.borderRadius = "12px";
  t.style.zIndex = 9999;
  t.style.boxShadow = "0 8px 30px rgba(0,0,0,0.6)";

  // 🔒 GUARDAR FOCO ACTUAL
  const activeElement = document.activeElement;

  // insertar toast
  document.body.appendChild(t);

  // 🔁 RESTAURAR FOCO (si aún existe)
  if (activeElement && typeof activeElement.focus === "function") {
    activeElement.focus({ preventScroll: true });
  }

  // animación de salida
  setTimeout(() => {
    t.style.opacity = "0";
    t.style.transform = "translateX(-50%) translateY(8px)";
    setTimeout(() => t.remove(), 400);
  }, timeout);
}


/* ---------------------------
   SEED: DEMO DATA (ONE-TIME)
   --------------------------- */
function seedDemoIfEmpty() {
  // → Si no hay nada guardado localmente
  if (!state.videos.length) {

    // 🔹 Ponemos categorías estáticas en el state,
    //    pero NO como videos, SOLO como referencia
    state.staticCategories = [
      "General",
      "Tutorial",
      "Curados",
      "Induccion"
    ];
  }

  // 🔹 Limpiar los estados locales (para que todo venga desde Sheet)
  state.categories = []   // ← categorías reales que vienen de la hoja categorias
  state.videos = [];
  state.faqs = [];

  // 🔹 Si existe GAS_URL, cargar SOLO los videos reales desde Sheet
  if (GAS_URL) {
    loadVideosFromGAS();   
    loadFaqsFromGAS?.();
    loadFaqsFromGAS?.();   // 👈 AQUÍ ESTÁ BIEN
    startGuidedOnboarding()
  }
}

/* ---------------------------
   HELPERS: NAV ICONS, STYLES
   --------------------------- */
function populateBottomNavIcons() {
  const role = state.user?.role || "guest";

  const VIDEO_REDIRECT_URL = "http://innovasystem.onlinewebshop.net/uploader/index.php";

  $$(UI.menuBtns).forEach(btn => {
    const section = btn.dataset.section;

    // reset seguro
    btn.onclick = null;

    /* ===============================
       🔹 ADMIN
       =============================== */
    if (role === "admin") {
      const allowed = ["home", "admin-tools", "tools"];
      btn.style.display = allowed.includes(section) ? "" : "none";

      // 🔁 ADMIN → gallery = redirect igual que student/videos
      if (section === "tools") {
        btn.onclick = () => {
          window.location.href = VIDEO_REDIRECT_URL;
        };
      }

      return;
    }

    /* ===============================
       🔹 STUDENT / GUEST
       =============================== */
    if (role === "student" || role === "guest") {
      const allowed = ["home", "videos"];
      btn.style.display = allowed.includes(section) ? "" : "none";

      if (section === "videos") {
        btn.onclick = () => {

          // 🔒 NO LOGUEADO → LOGIN + MENSAJE
          if (!state.user) {
            openLogin(true);

            Swal.fire({
              icon: "info",
              title: "Acceso requerido",
              text: "Es necesario loguearse para poder ser redireccionado",
              background: "#050814",
              color: "#e9f0ff",
              iconColor: "#4cc9f0"
            });

            return;
          }

          // ✅ LOGUEADO → REDIRECT
          window.location.href = VIDEO_REDIRECT_URL;
        };
      }

      return;
    }

    /* ===============================
       🔹 FALLBACK
       =============================== */
    btn.style.display = "none";
  });
}



//  Funcion para cargar las categorías de video desde Apps Script
async function loadVideoCategories() {
  const select =
    $(UI.wizCategory) ||
    $(UI.vidCategory);

  if (!select) return;

  // 🔒 ESPERAR a que haya videos
  if (!state.videos || !state.videos.length) {
    setTimeout(loadVideoCategories, 150);
    return;
  }

  select.innerHTML = `<option value="">Selecciona categoría</option>`;

  const categories = Array.from(
    new Set(
      state.videos.map(v => v.category).filter(Boolean)
    )
  ).sort();

  categories.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    select.appendChild(opt);
  });
}

function populateCategorySelect() {
  const select =
    $(UI.wizCategory) ||
    $(UI.vidCategory);

  if (!select) return;

  select.innerHTML = `<option value="">Selecciona categoría</option>`;

  state.categories.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    select.appendChild(opt);
  });
}


/* ---------------------------
   CLOSE MODALS
   --------------------------- */
function closeAllModals() {
  closeVideoModal();
  closeLogin();
}

/* ---------------------------
   EXPORT: State Dump (for dev)
   --------------------------- */
function exportState() { return JSON.stringify(state, null, 2); }

/* ---------------------------
   DEBUG / DEV: expose small API
   --------------------------- */
window.VisionAcademy = {
  state,
  exportState,
  renderAll,
  exportVideosCSV,
  importVideosCSV,
  openCategory,
  findVideo
};

/* ---------------------------
   POLISH: initial UI
   --------------------------- */
updateUIState();
renderAll();

/* ============================================================
   End of app.js
   ============================================================ */
