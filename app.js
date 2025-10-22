/* app.js - archivo completo corregido y funcional
   - Incluye: catálogo, inicio (favoritos + promos detalladas), carrito, panel admin completo,
     CRUD productos, Combo 3x2, promos del sitio con imagen, descuentos bulk,
     creación/edición tolerante con campos opcionales (cleanPayload),
     UI admin organizada por categoría y botones compactos.
   - Este archivo contiene además la renderización de promos en recuadros grandes
     para mostrar toda la información (imagen, título, texto, badges, producto objetivo).
   - No se elimina nada funcional previamente implementado.
*/

/* --- Ajusta ADMINS si no usarás Firebase Auth (demo local) --- */
const ADMINS = [
  { email: "flixalbert75@gmail.com", password: "220817" }
];

/* --- Firestore referencias (db viene de index.html) --- */
const productsRef = db.collection("products");
const comboRef = db.collection("config").doc("combo3x2");
const siteConfigRef = db.collection("config").doc("siteConfig");
const bulkRef = db.collection("config").doc("bulkDiscount");
const promosRef = db.collection("config").doc("sitePromos"); // documento con campo promos: [ ... ]

/* --- Estado global --- */
let PRODUCTS = [];
let cart = [];
let isAdminAuthed = false;
let adminEmail = null;
let combo3x2 = { enabled: false, eligibles: [] };
let bulkDiscount = { enabled: false, minItems: 4, percent: 20, applyTo: 'all' };
let sitePromos = []; // array de promos administrables
let currentPromo = null; // promo aplicada temporalmente al abrir catálogo

/* --- Helper: limpiar payload antes de enviar a Firestore --- */
function cleanPayload(obj) {
  const out = {};
  Object.keys(obj).forEach(k => {
    const v = obj[k];
    if (v === undefined || v === null) return;
    if (typeof v === 'string' && v.trim() === '') return;
    if (Array.isArray(v) && v.length === 0) return;
    out[k] = v;
  });
  return out;
}

/* --- Inicialización: suscripciones en tiempo real --- */
function loadProductsRealtime() {
  productsRef.orderBy('order').onSnapshot(snapshot => {
    PRODUCTS = [];
    snapshot.forEach(doc => {
      PRODUCTS.push({ ...doc.data(), id: doc.id });
    });
    PRODUCTS.sort((a, b) => {
      const ao = Number(a.order ?? Number.MAX_SAFE_INTEGER);
      const bo = Number(b.order ?? Number.MAX_SAFE_INTEGER);
      if (ao === bo) return (a.nombre || "").localeCompare(b.nombre || "");
      return ao - bo;
    });
    renderCatalog();
    renderHomeExtras();
    if (isAdminAuthed) renderAdminProducts();
    if (isAdminAuthed) renderCombo3x2Admin();
  }, err => console.error("products onSnapshot error:", err));
}

function loadComboRealtime() {
  comboRef.onSnapshot(doc => {
    if (doc && doc.exists) {
      const data = doc.data() || {};
      combo3x2 = {
        enabled: Boolean(data.enabled),
        eligibles: Array.isArray(data.eligibles) ? data.eligibles.map(String) : []
      };
    } else {
      combo3x2 = { enabled: false, eligibles: [] };
      comboRef.set({ enabled: false, eligibles: [] }).catch(() => {});
    }
    renderCatalog();
    if (isAdminAuthed) renderCombo3x2Admin();
  }, err => console.error("combo3x2 onSnapshot error:", err));
}

function loadBulkRealtime() {
  bulkRef.onSnapshot(doc => {
    if (doc && doc.exists) {
      bulkDiscount = doc.data() || bulkDiscount;
    } else {
      bulkDiscount = { enabled: false, minItems: 4, percent: 20, applyTo: 'all' };
    }
    if (isAdminAuthed) loadBulkIntoAdmin();
    renderCatalog();
  }, err => console.error("bulkDiscount onSnapshot error:", err));
}

function loadPromosRealtime() {
  promosRef.onSnapshot(doc => {
    if (doc && doc.exists) {
      const data = doc.data() || {};
      sitePromos = Array.isArray(data.promos) ? data.promos : [];
    } else {
      sitePromos = [];
      promosRef.set({ promos: [] }).catch(() => {});
    }
    renderHomeExtras();
    if (isAdminAuthed) renderPromosAdmin();
  }, err => console.error("sitePromos onSnapshot error:", err));
}

function loadSiteTitle() {
  siteConfigRef.get().then(doc => {
    if (doc && doc.exists) {
      const data = doc.data();
      if (data.siteTitle) {
        const el = document.getElementById('brandNeon');
        if (el) el.textContent = data.siteTitle;
      }
    }
  }).catch(err => console.error('Error cargando siteTitle:', err));
}

/* Ejecutar suscripciones */
loadProductsRealtime();
loadComboRealtime();
loadBulkRealtime();
loadPromosRealtime();
if (typeof db !== 'undefined') loadSiteTitle();

/* --- Navegación simple entre secciones --- */
function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  if (id === 'carrito') renderCart();
  if (id === 'catalogo') renderCatalog();
  if (id === 'admin') renderAdminPanel();
}

/* --- Render catálogo --- */
function renderCatalog() {
  const container = document.getElementById('catalogContainer');
  if (!container) return;
  container.innerHTML = '';

  // Banner de promo aplicada temporalmente
  if (currentPromo) {
    const banner = document.createElement('div');
    banner.className = 'promo-active-banner';
    banner.innerHTML = `<strong>${currentPromo.title}</strong><div style="font-size:0.95rem;margin-top:0.2rem;">${currentPromo.text}${currentPromo.percent ? ` — ${currentPromo.percent}% de descuento` : ''}${currentPromo.minItems ? ` (mínimo ${currentPromo.minItems} items)` : ''}</div>`;
    container.appendChild(banner);
    setTimeout(() => { currentPromo = null; }, 8000);
  }

  // Combo 3x2 banner si está activo
  let comboBanner = document.getElementById('combo3x2Banner');
  if (combo3x2 && combo3x2.enabled) {
    if (!comboBanner) {
      comboBanner = document.createElement('div');
      comboBanner.id = "combo3x2Banner";
      comboBanner.className = "combo3x2-banner";
      document.getElementById('catalogo').prepend(comboBanner);
    }
    comboBanner.innerHTML = `
      <div>
        <strong>¡Combo 3x2 activo!</strong>
        <span style="display:block;font-size:1rem;">
          Elige cualquier <b>3 servicios</b> y el de menor precio (si es elegible) ¡te sale GRATIS!
        </span>
      </div>
    `;
  } else if (comboBanner) {
    comboBanner.remove();
  }

  // Categorías dinámicas y productos (orden por 'order')
  const cats = [...new Set(PRODUCTS.map(p => p.categoria || 'Sin categoría'))];
  cats.forEach(cat => {
    const catTitle = document.createElement('div');
    catTitle.className = 'category-title';
    catTitle.innerText = cat;
    container.appendChild(catTitle);

    const grid = document.createElement('div');
    grid.className = 'grid';

    PRODUCTS.filter(p => (p.categoria || 'Sin categoría') === cat).forEach(prod => {
      const card = document.createElement('div');
      card.className = 'product-card';
      card.setAttribute('data-product-id', prod.id);

      if (prod.oferta || prod.promo) card.classList.add('is-promoted');

      let precioHtml = prod.oferta
        ? `<span class="oferta">Oferta: ${precioCOP(prod.oferta)} <span style="font-size:0.95em;text-decoration:line-through;color:#aaa;">${precioCOP(prod.precio)}</span></span>`
        : `<span>${precioCOP(prod.precio)}</span>`;
      let promoHtml = prod.promo ? `<span class="promo">${prod.promo}</span>` : '';
      let descHtml = Array.isArray(prod.descripcion)
        ? `<ul class="desc-list">${prod.descripcion.map(d => `<li>${d}</li>`).join('')}</ul>`
        : `<p>${prod.descripcion || ''}</p>`;

      card.innerHTML = `
        <img class="product-image" src="${prod.imagen || 'images/placeholder.png'}" alt="${prod.nombre}" onclick="showProductDetails('${prod.id}')" style="cursor:pointer">
        ${promoHtml}
        <h3 onclick="showProductDetails('${prod.id}')" style="cursor:pointer">${prod.nombre}</h3>
        ${descHtml}
        ${precioHtml}
        <button class="btn" onclick="addToCart('${prod.id}')">Comprar</button>
      `;
      grid.appendChild(card);
    });

    container.appendChild(grid);
  });
}

/* --- Utilidad de precios --- */
function precioCOP(valor) {
  return "$" + Number(valor || 0).toLocaleString('es-CO') + " COP";
}

/* --- Inicio: Favoritos y Promos (detalladas) --- */
function renderHomeExtras() {
  const favContainer = document.getElementById('favoritesContainer');
  const promosContainer = document.getElementById('promosContainer');
  if (!favContainer || !promosContainer) return;

  // Favoritos (igual que antes)
  const featured = PRODUCTS.filter(p => p.featured);
  const favorites = featured.length ? featured.slice(0, 6) : [];

  favContainer.innerHTML = '';
  if (favorites.length === 0) {
    favContainer.innerHTML = '<p>No hay favoritos configurados aún.</p>';
  } else {
    const grid = document.createElement('div');
    grid.className = 'favorites-grid';
    favorites.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'fav-btn';
      btn.setAttribute('title', p.nombre);
      btn.innerHTML = `<img src="${p.imagen || 'images/placeholder.png'}" alt="${p.nombre}"><span>${p.nombre}</span>`;
      btn.onclick = () => {
        if (document.querySelector('#inicio.active')) showProductDetails(p.id);
        else openCatalogAndShow(p.id);
      };
      grid.appendChild(btn);
    });
    favContainer.appendChild(grid);
  }

  // Promos detalladas: recuadros grandes con imagen, título, texto, badges y producto objetivo si existe
  promosContainer.innerHTML = '';
  if (!sitePromos || sitePromos.length === 0) {
    promosContainer.innerHTML = '<p>No hay promociones configuradas.</p>';
  } else {
    const grid = document.createElement('div');
    grid.className = 'promos-detailed-grid';

    sitePromos.forEach(pr => {
      // Resolver nombre del producto objetivo si existe
      const targetName = pr.targetProductId ? (PRODUCTS.find(p => String(p.id) === String(pr.targetProductId))?.nombre || pr.targetProductId) : '';

      const card = document.createElement('div');
      card.className = 'promo-detailed-card';

      // Construir innerHTML (pr.image, pr.title, pr.text, pr.percent, pr.minItems)
      card.innerHTML = `
        <div class="promo-detailed-thumb">
          <img src="${pr.image || 'images/promo-placeholder.png'}" alt="${htmlEscape(pr.title)}">
        </div>
        <div class="promo-detailed-body">
          <div class="promo-detailed-head">
            <h3 class="promo-detailed-title">${htmlEscape(pr.title)}</h3>
            <div class="promo-badges">
              ${pr.percent ? `<span class="badge percent">${Number(pr.percent)}%</span>` : ''}
              ${pr.minItems ? `<span class="badge minitems">min ${Number(pr.minItems)}</span>` : ''}
            </div>
          </div>
          <p class="promo-detailed-text">${htmlEscape(pr.text)}</p>
          ${pr.targetProductId ? `<div class="promo-target">Producto objetivo: <strong>${htmlEscape(targetName)}</strong></div>` : ''}
          <div class="promo-detailed-actions">
            <button class="btn" onclick="applySitePromoAndOpen('${pr.id}')">Ver en catálogo</button>
          </div>
        </div>
      `;

      grid.appendChild(card);
    });

    promosContainer.appendChild(grid);
  }
}

// small helper to escape HTML inserted into innerHTML (avoid basic XSS from admin inputs)
function htmlEscape(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* Aplica promo y abre catálogo; scroll al producto si targetProductId existe */
function applySitePromoAndOpen(promoId) {
  const pr = sitePromos.find(p => String(p.id) === String(promoId));
  if (!pr) return;
  currentPromo = pr;
  if (pr.targetProductId) {
    openCatalogAndShow(pr.targetProductId);
  } else {
    showSection('catalogo');
    renderCatalog();
    const container = document.getElementById('catalogContainer');
    if (container) container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* --- Modal de producto --- */
function showProductDetails(id) {
  const prod = PRODUCTS.find(p => String(p.id) === String(id));
  if (!prod) {
    showToast('Producto no encontrado.');
    return;
  }
  const modal = document.getElementById('productModal');
  if (!modal) return;
  const img = document.getElementById('modalImage');
  const title = document.getElementById('modalTitle');
  const desc = document.getElementById('modalDesc');
  const price = document.getElementById('modalPrice');
  const buyBtn = document.getElementById('modalBuyBtn');
  const promoTag = document.getElementById('modalPromoTag');

  if (img) img.src = prod.imagen || 'images/placeholder.png';
  if (title) title.textContent = prod.nombre || '';
  if (desc) desc.innerHTML = Array.isArray(prod.descripcion) ? `<ul class="desc-list">${prod.descripcion.map(d => `<li>${htmlEscape(d)}</li>`).join('')}</ul>` : `<p>${htmlEscape(prod.descripcion || '')}</p>`;
  if (price) price.innerHTML = prod.oferta ? `<span class="oferta">Oferta: ${precioCOP(prod.oferta)}</span> <small style="text-decoration:line-through;color:#aaa;margin-left:0.6rem;">${precioCOP(prod.precio)}</small>` : `${precioCOP(prod.precio)}`;
  if (promoTag) promoTag.textContent = prod.promo || '';

  if (buyBtn) {
    buyBtn.onclick = function () {
      addToCart(prod.id);
      closeProductModal();
    };
  }

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeProductModal() {
  const modal = document.getElementById('productModal');
  if (!modal) return;
  modal.classList.remove('open');
  document.body.style.overflow = '';
}

/* Abre catálogo y muestra producto (scroll suave + highlight) */
function openCatalogAndShow(id) {
  showSection('catalogo');
  setTimeout(() => {
    renderCatalog();
    const card = document.querySelector(`.product-card[data-product-id="${id}"]`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('temp-highlight');
      setTimeout(() => card.classList.remove('temp-highlight'), 2400);
      setTimeout(() => showProductDetails(id), 500);
    } else {
      const container = document.getElementById('catalogContainer');
      if (container) container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 220);
}

/* --- Filtro para resaltar promociones en catálogo --- */
function togglePromoFilter(enabled) {
  const container = document.getElementById('catalogContainer');
  if (!container) return;
  if (enabled) container.classList.add('promo-filter-active');
  else container.classList.remove('promo-filter-active');
}

/* --- Carrito --- */
function addToCart(id) {
  const prod = PRODUCTS.find(p => String(p.id) === String(id));
  if (!prod) {
    showToast('Producto no encontrado.');
    return;
  }
  const precioFinal = prod.oferta ? prod.oferta : prod.precio;
  const existing = cart.find(p => String(p.id) === String(id));
  if (existing) {
    existing.cantidad += 1;
  } else {
    cart.push({ ...prod, precio: precioFinal, cantidad: 1 });
  }
  showToast('Producto agregado al carrito');
  renderCart();
}
function changeQty(id, delta) {
  const item = cart.find(p => String(p.id) === String(id));
  if (item) {
    item.cantidad = Math.max(1, item.cantidad + delta);
    renderCart();
  }
}
function removeFromCart(id) {
  cart = cart.filter(p => String(p.id) !== String(id));
  renderCart();
}
function renderCart() {
  const container = document.getElementById('cartContainer');
  if (!container) return;
  container.innerHTML = '';
  if (cart.length === 0) {
    container.innerHTML = '<p style="text-align:center;">El carrito está vacío.</p>';
    document.getElementById('cartTotal').innerText = '';
    document.getElementById('finalizeBtn').style.display = 'none';
    return;
  }

  // Total base
  let baseTotal = cart.reduce((acc, p) => acc + p.precio * p.cantidad, 0);

  // Aplicar Combo 3x2 (gratis el menor precio entre eligibles)
  let comboMsg = "";
  let comboDiscount = 0;
  if (combo3x2 && combo3x2.enabled) {
    let eligiblesInCart = [];
    cart.forEach(prod => {
      if (Array.isArray(combo3x2.eligibles) && combo3x2.eligibles.map(String).includes(String(prod.id))) {
        for (let i = 0; i < prod.cantidad; i++) eligiblesInCart.push(prod.precio);
      }
    });
    if (eligiblesInCart.length >= 3) {
      eligiblesInCart.sort((a, b) => a - b);
      comboDiscount = eligiblesInCart[0];
      baseTotal -= comboDiscount;
      comboMsg = `<div class="combo3x2-desc">¡Combo 3x2 aplicado! Descuento: -${precioCOP(comboDiscount)}</div>`;
    }
  }

  // Descuento bulk por cantidad (después del combo)
  let bulkMsg = "";
  let bulkAmt = 0;
  if (bulkDiscount && bulkDiscount.enabled) {
    const minItems = Number(bulkDiscount.minItems || 0);
    const percent = Number(bulkDiscount.percent || 0);
    const applyTo = bulkDiscount.applyTo || 'all';

    let itemsCount = 0;
    if (applyTo === 'all') {
      itemsCount = cart.reduce((acc, p) => acc + p.cantidad, 0);
    } else if (applyTo === 'eligibles') {
      cart.forEach(prod => {
        if (Array.isArray(combo3x2.eligibles) && combo3x2.eligibles.map(String).includes(String(prod.id))) {
          itemsCount += prod.cantidad;
        }
      });
    }

    if (itemsCount >= minItems && percent > 0) {
      bulkAmt = Math.round((baseTotal * percent) / 100);
      baseTotal -= bulkAmt;
      bulkMsg = `<div class="combo3x2-desc">Descuento por compra de ${itemsCount} items: -${percent}% (-${precioCOP(bulkAmt)})</div>`;
    }
  }

  // Render items
  cart.forEach(prod => {
    const item = document.createElement('div');
    item.className = 'cart-item';
    item.innerHTML = `
      <span>${prod.nombre} (${precioCOP(prod.precio)}) x ${prod.cantidad}</span>
      <div class="cart-controls">
        <button onclick="changeQty('${prod.id}', -1)">-</button>
        <button onclick="changeQty('${prod.id}', 1)">+</button>
        <button onclick="removeFromCart('${prod.id}')">Eliminar</button>
      </div>
    `;
    container.appendChild(item);
  });

  const totalHtml = `${comboMsg}${bulkMsg}Total: ${precioCOP(baseTotal)}`;
  document.getElementById('cartTotal').innerHTML = totalHtml;
  document.getElementById('finalizeBtn').style.display = 'inline-block';
}

function finalizePurchase() {
  if (cart.length === 0) return;
  const phone = "573243052782";
  let msg = "¡Hola! Quiero finalizar mi compra en ElectroFlips Xperience:%0A";
  cart.forEach(p => {
    msg += `- ${p.nombre} x ${p.cantidad} (${precioCOP(p.precio * p.cantidad)})%0A`;
  });

  let total = cart.reduce((acc, p) => acc + p.precio * p.cantidad, 0);
  let comboApplied = 0;
  if (combo3x2 && combo3x2.enabled) {
    let eligiblesInCart = [];
    cart.forEach(prod => {
      if (Array.isArray(combo3x2.eligibles) && combo3x2.eligibles.map(String).includes(String(prod.id))) {
        for (let i = 0; i < prod.cantidad; i++) eligiblesInCart.push(prod.precio);
      }
    });
    if (eligiblesInCart.length >= 3) {
      eligiblesInCart.sort((a, b) => a - b);
      comboApplied = eligiblesInCart[0];
      total -= comboApplied;
      msg += `Descuento Combo 3x2 aplicado: -${precioCOP(comboApplied)}%0A`;
    }
  }

  let bulkApplied = 0;
  if (bulkDiscount && bulkDiscount.enabled) {
    const minItems = Number(bulkDiscount.minItems || 0);
    const percent = Number(bulkDiscount.percent || 0);
    const applyTo = bulkDiscount.applyTo || 'all';

    let itemsCount = 0;
    if (applyTo === 'all') {
      itemsCount = cart.reduce((acc, p) => acc + p.cantidad, 0);
    } else if (applyTo === 'eligibles') {
      cart.forEach(prod => {
        if (Array.isArray(combo3x2.eligibles) && combo3x2.eligibles.map(String).includes(String(prod.id))) {
          itemsCount += prod.cantidad;
        }
      });
    }

    if (itemsCount >= minItems && percent > 0) {
      bulkApplied = Math.round((total * percent) / 100);
      total -= bulkApplied;
      msg += `Descuento por compra múltiple (${percent}%): -${precioCOP(bulkApplied)}%0A`;
    }
  }

  msg += `Total: ${precioCOP(total)}%0A¿Me puedes indicar el proceso de pago y detalles extra?`;
  window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
  cart = [];
  renderCart();
  showToast('Redirigiendo a WhatsApp...');
}

/* ------------------ ADMIN ------------------ */

/* Mostrar panel admin o login */
function renderAdminPanel() {
  const adminBox = document.getElementById('adminPanelBox');
  const loginBox = document.getElementById('adminLoginBox');
  if (isAdminAuthed) {
    if (loginBox) loginBox.style.display = "none";
    if (adminBox) adminBox.style.display = "";
    renderAdminProducts();
    renderCombo3x2Admin();
    loadSiteTitleIntoAdmin();
    loadBulkIntoAdmin();
    renderPromosAdmin();
  } else {
    if (loginBox) loginBox.style.display = "";
    if (adminBox) adminBox.style.display = "none";
    const err = document.getElementById('adminLoginError');
    if (err) err.innerText = "";
  }
}

/* Admin login/logout (demo local) */
function adminLogin(e) {
  e.preventDefault();
  const email = document.getElementById('adminEmail').value.trim();
  const password = document.getElementById('adminPassword').value.trim();
  const adminMatch = ADMINS.find(a => a.email === email && a.password === password);
  if (adminMatch) {
    isAdminAuthed = true;
    adminEmail = email;
    renderAdminPanel();
  } else {
    const err = document.getElementById('adminLoginError');
    if (err) err.innerText = "Correo o contraseña incorrectos.";
  }
  if (e && e.target) e.target.reset();
}
function adminLogout() {
  isAdminAuthed = false;
  adminEmail = null;
  renderAdminPanel();
}

/* Combo 3x2 admin UI */
function renderCombo3x2Admin() {
  let box = document.getElementById('combo3x2Admin');
  if (!box) {
    box = document.createElement('div');
    box.id = 'combo3x2Admin';
    const panel = document.querySelector('.admin-panel');
    if (panel) panel.prepend(box);
  }

  const productCheckboxes = PRODUCTS.map(p => {
    const checked = Array.isArray(combo3x2.eligibles) && combo3x2.eligibles.map(String).includes(String(p.id));
    return `<label style="display:inline-block;margin:0.3em 1em 0.3em 0;">
      <input type="checkbox" class="combo3x2Eligible" value="${p.id}" ${checked ? "checked" : ""}>
      ${p.nombre}
    </label>`;
  }).join('');

  box.innerHTML = `
    <h2>Promo Combo 3x2</h2>
    <label style="display:flex;align-items:center;gap:0.6rem;">
      <input type="checkbox" id="combo3x2Switch" ${combo3x2 && combo3x2.enabled ? "checked" : ""}>
      Activar Combo 3x2 (guardar inmediato)
    </label>
    <div style="margin:1em 0;">
      <strong>Servicios elegibles (pueden ser el GRATIS):</strong><br>
      ${productCheckboxes || '<em>No hay productos.</em>'}
    </div>
    <div style="margin-top:0.6rem;">
      <button class="btn" id="saveCombo3x2Eligibles">Guardar elegibles</button>
    </div>
    <hr>
  `;

  const switchEl = document.getElementById('combo3x2Switch');
  if (switchEl) switchEl.onchange = function () {
    combo3x2.enabled = this.checked;
    comboRef.set({ enabled: combo3x2.enabled, eligibles: combo3x2.eligibles }).then(() => {
      showToast('Estado Combo 3x2 actualizado.');
    }).catch(err => {
      console.error('Error guardando estado combo:', err);
      alert('Error guardando estado Combo 3x2. Revisa la consola.');
    });
  };

  const saveBtn = document.getElementById('saveCombo3x2Eligibles');
  if (saveBtn) saveBtn.onclick = () => {
    const eligibles = Array.from(document.querySelectorAll('.combo3x2Eligible'))
      .filter(c => c.checked)
      .map(c => String(c.value));
    combo3x2.eligibles = eligibles;
    comboRef.set({ enabled: combo3x2.enabled, eligibles: combo3x2.eligibles }).then(() => {
      showToast('Elegibles guardados.');
    }).catch(err => {
      console.error(err);
      alert("Error guardando eligibles. Revisa la consola.");
    });
  };
}

/* Promos admin UI */
function renderPromosAdmin() {
  const list = document.getElementById('promoList');
  if (!list) return;
  list.innerHTML = '';
  if (!sitePromos || sitePromos.length === 0) {
    list.innerHTML = '<p>No hay promos guardadas.</p>';
    return;
  }
  sitePromos.forEach(pr => {
    const item = document.createElement('div');
    item.className = 'promo-admin-item';
    item.style.display = 'flex';
    item.style.justifyContent = 'space-between';
    item.style.alignItems = 'center';
    item.style.padding = '0.6rem';
    item.style.background = '#232526';
    item.style.borderRadius = '8px';
    item.style.marginBottom = '0.6rem';
    item.innerHTML = `
      <div style="display:flex;gap:0.6rem;align-items:center;">
        ${pr.image ? `<img src="${pr.image}" alt="${pr.title}" style="width:56px;height:56px;object-fit:cover;border-radius:6px;">` : ''}
        <div>
          <strong>${pr.title}</strong>
          <div style="color:#cbeee0;">${pr.text}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn small" onclick="editPromoForm('${pr.id}')">Editar</button>
        <button class="btn small danger" onclick="deletePromo('${pr.id}')">Eliminar</button>
      </div>
    `;
    list.appendChild(item);
  });
}

function savePromoFromAdmin() {
  const id = document.getElementById('promoId').value || String(Date.now());
  const title = document.getElementById('promoTitle').value.trim();
  const text = document.getElementById('promoText').value.trim();
  const minItems = Number(document.getElementById('promoMinItems').value) || 0;
  const percent = Number(document.getElementById('promoPercent').value) || 0;
  const applyTo = document.getElementById('promoApplyTo').value || 'all';
  const targetProductId = document.getElementById('promoTargetProduct') ? document.getElementById('promoTargetProduct').value.trim() : '';
  const image = document.getElementById('promoImage') ? document.getElementById('promoImage').value.trim() : '';

  if (!title || !text) { alert('Título y texto son requeridos.'); return; }

  const promoObj = { id, title, text, minItems, percent, applyTo, targetProductId };
  if (image) promoObj.image = image;

  const updated = sitePromos.filter(p => String(p.id) !== String(id)).concat([promoObj]);
  promosRef.set({ promos: updated })
    .then(() => {
      showToast('Promoción guardada correctamente.');
      clearPromoForm();
    })
    .catch(err => {
      console.error('Error guardando promo:', err);
      alert('Error guardando promo. Revisa la consola.');
    });
}

function clearPromoForm() {
  const ids = ['promoId','promoTitle','promoText','promoMinItems','promoPercent','promoApplyTo','promoTargetProduct','promoImage'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const applyTo = document.getElementById('promoApplyTo');
  if (applyTo) applyTo.value = 'all';
}

function editPromoForm(id) {
  const pr = sitePromos.find(p => String(p.id) === String(id));
  if (!pr) return;
  document.getElementById('promoId').value = pr.id || '';
  document.getElementById('promoTitle').value = pr.title || '';
  document.getElementById('promoText').value = pr.text || '';
  document.getElementById('promoMinItems').value = pr.minItems || '';
  document.getElementById('promoPercent').value = pr.percent || '';
  document.getElementById('promoApplyTo').value = pr.applyTo || 'all';
  if (document.getElementById('promoTargetProduct')) document.getElementById('promoTargetProduct').value = pr.targetProductId || '';
  if (document.getElementById('promoImage')) document.getElementById('promoImage').value = pr.image || '';
}

function deletePromo(id) {
  if (!confirm('Eliminar esta promo?')) return;
  const updated = sitePromos.filter(p => String(p.id) !== String(id));
  promosRef.set({ promos: updated }).then(() => {
    showToast('Promo eliminada.');
  }).catch(err => {
    console.error('Error eliminando promo:', err);
    alert('Error eliminando promo. Revisa la consola.');
  });
}

/* --- Admin: productos organizados por categoría (como catálogo) --- */
function renderAdminProducts() {
  const list = document.getElementById('adminProductList');
  if (!list) return;
  list.innerHTML = '';

  const topControls = document.createElement('div');
  topControls.style.display = 'flex';
  topControls.style.justifyContent = 'space-between';
  topControls.style.alignItems = 'center';
  topControls.style.marginBottom = '0.8rem';
  topControls.innerHTML = `<div><button class="btn" id="normalizeOrderBtn">Normalizar orden</button></div>`;
  list.appendChild(topControls);
  const normalizeBtn = document.getElementById('normalizeOrderBtn');
  if (normalizeBtn) normalizeBtn.onclick = adminNormalizeOrder;

  const cats = [...new Set(PRODUCTS.map(p => p.categoria || 'Sin categoría'))];
  cats.forEach(cat => {
    const catBox = document.createElement('div');
    catBox.className = 'admin-category-box';
    catBox.style.marginBottom = '1rem';
    catBox.innerHTML = `<h3 style="margin:0 0 0.6rem 0;">${cat}</h3>`;

    const grid = document.createElement('div');
    grid.className = 'admin-grid';
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(320px, 1fr))';
    grid.style.gap = '0.8rem';

    PRODUCTS.filter(p => (p.categoria || 'Sin categoría') === cat).forEach(prod => {
      const item = document.createElement('div');
      item.className = 'product-admin-item';
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.gap = '1rem';
      item.style.background = '#232526';
      item.style.padding = '0.8rem';
      item.style.borderRadius = '8px';
      // compact action column
      item.innerHTML = `
        <img src="${prod.imagen || 'images/placeholder.png'}" alt="${prod.nombre}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;">
        <div style="flex:1;min-width:0;">
          <strong style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${prod.nombre}</strong>
          <small style="display:block;margin-top:0.3rem;color:#cbeee0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Array.isArray(prod.descripcion) ? prod.descripcion.join(' • ') : (prod.descripcion || '')}</small>
          <div style="margin-top:0.4rem;font-weight:bold;">${precioCOP(prod.precio)} ${prod.oferta ? `<span style="color:#ff00cc;margin-left:0.6rem;">(Oferta ${precioCOP(prod.oferta)})</span>` : ''}</div>
          <div style="margin-top:0.35rem;font-size:0.9rem;color:#ddd;">Pos: ${prod.order ?? '(sin)'}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex-shrink:0;">
          <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.9rem;">
            <input type="checkbox" ${prod.featured ? "checked" : ""} onchange="adminToggleFeatured('${prod.id}', this.checked)">
            <span style="font-size:0.85rem;">Fav</span>
          </label>
          <div style="display:flex;gap:6px;">
            <button class="btn small" title="Subir" onclick="adminMoveUp('${prod.id}')">↑</button>
            <button class="btn small" title="Bajar" onclick="adminMoveDown('${prod.id}')">↓</button>
            <button class="btn small" title="Editar" onclick="adminEditProductForm('${prod.id}')">✎</button>
            <button class="btn small danger" title="Eliminar" onclick="adminDeleteProduct('${prod.id}')">🗑</button>
          </div>
        </div>
      `;
      grid.appendChild(item);
    });

    catBox.appendChild(grid);
    list.appendChild(catBox);
  });
}

function adminToggleFeatured(id, checked) {
  productsRef.doc(String(id)).update({ featured: !!checked })
    .then(() => showToast(checked ? 'Producto marcado como favorito.' : 'Producto desmarcado de favoritos.'))
    .catch(err => {
      console.error('Error toggling featured:', err);
      alert('Error actualizando favorito. Revisa la consola.');
    });
}

/* --- CRUD productos: crear/editar con campos opcionales --- */
// Reemplaza adminAddProduct
function adminAddProduct(e) {
  e.preventDefault();
  const nombreEl = document.getElementById('adminNombre');
  const descEl = document.getElementById('adminDescripcion');
  const precioEl = document.getElementById('adminPrecio');
  const categoriaEl = document.getElementById('adminCategoria');

  if (!nombreEl || !precioEl || !categoriaEl || !descEl) {
    alert('Faltan campos esenciales en el formulario.');
    return;
  }

  const nombre = nombreEl.value.trim();
  const descripcionRaw = descEl.value || '';
  const descripcion = descripcionRaw ? descripcionRaw.split(';').map(x => x.trim()).filter(Boolean) : [];
  const precio = Number(precioEl.value) || 0;
  const categoria = categoriaEl.value.trim();

  const imagenEl = document.getElementById('adminImagen');
  const ofertaEl = document.getElementById('adminOferta');
  const promoEl = document.getElementById('adminPromo');
  const featuredEl = document.getElementById('adminFeatured');

  const imagen = imagenEl ? imagenEl.value.trim() : undefined;
  const ofertaVal = ofertaEl ? ofertaEl.value.trim() : '';
  const oferta = ofertaVal !== '' ? Number(ofertaVal) : undefined;
  const promo = promoEl ? promoEl.value.trim() : undefined;
  const featured = !!(featuredEl && featuredEl.checked);

  const maxOrder = PRODUCTS.reduce((max, p) => {
    const o = Number(p.order ?? -Infinity);
    return isFinite(o) ? Math.max(max, o) : max;
  }, 0);

  const payload = cleanPayload({
    nombre,
    descripcion,
    precio,
    categoria,
    imagen,
    oferta,
    promo,
    featured,
    order: maxOrder + 1
  });

  productsRef.add(payload)
    .then(() => {
      if (e && e.target) e.target.reset();
      showToast('Producto creado correctamente.');
    })
    .catch(err => {
      console.error('Error agregando producto:', err);
      alert('Error al agregar producto. Revisa la consola.');
    });
}

function adminDeleteProduct(id) {
  if (!confirm('¿Eliminar este producto?')) return;
  productsRef.doc(id).delete()
    .then(() => showToast('Producto eliminado correctamente.'))
    .catch(err => {
      console.error(err);
      alert("Error eliminando producto.");
    });
}

function adminEditProductForm(id) {
  const prod = PRODUCTS.find(p => String(p.id) === String(id));
  if (!prod) return;
  document.getElementById('editId').value = prod.id;
  document.getElementById('editNombre').value = prod.nombre || '';
  document.getElementById('editDescripcion').value = Array.isArray(prod.descripcion) ? prod.descripcion.join('; ') : (prod.descripcion || '');
  document.getElementById('editPrecio').value = prod.precio || '';
  document.getElementById('editCategoria').value = prod.categoria || '';
  document.getElementById('editImagen').value = prod.imagen || '';
  document.getElementById('editOferta').value = prod.oferta || '';
  document.getElementById('editPromo').value = prod.promo || '';
  document.getElementById('editFeatured').checked = !!prod.featured;
  document.getElementById('editFormBox').style.display = '';
}

function adminEditProduct(e) {
  e.preventDefault();
  const id = document.getElementById('editId').value;
  if (!id) { alert('ID de producto faltante.'); return; }

  const nombreEl = document.getElementById('editNombre');
  const descEl = document.getElementById('editDescripcion');
  const precioEl = document.getElementById('editPrecio');
  const categoriaEl = document.getElementById('editCategoria');
  const imagenEl = document.getElementById('editImagen');
  const ofertaEl = document.getElementById('editOferta');
  const promoEl = document.getElementById('editPromo');
  const featuredEl = document.getElementById('editFeatured');

  const nombre = nombreEl ? nombreEl.value.trim() : undefined;
  const descripcionRaw = descEl ? descEl.value : undefined;
  const descripcion = (typeof descripcionRaw === 'string' && descripcionRaw.trim() !== '') ? descripcionRaw.split(';').map(x => x.trim()).filter(Boolean) : undefined;
  const precio = precioEl && precioEl.value !== '' ? Number(precioEl.value) : undefined;
  const categoria = categoriaEl ? categoriaEl.value.trim() : undefined;
  const imagen = imagenEl ? imagenEl.value.trim() : undefined;
  const ofertaVal = ofertaEl ? ofertaEl.value.trim() : '';
  const oferta = ofertaVal !== '' ? Number(ofertaVal) : undefined;
  const promo = promoEl ? promoEl.value.trim() : undefined;
  const featured = typeof featuredEl !== 'undefined' ? !!featuredEl.checked : undefined;

  const updateObj = cleanPayload({ nombre, descripcion, precio, categoria, imagen, oferta, promo, featured });

  if (Object.keys(updateObj).length === 0) {
    showToast('No hay cambios para guardar.');
    document.getElementById('editFormBox').style.display = 'none';
    return;
  }

  productsRef.doc(id).update(updateObj)
    .then(() => {
      document.getElementById('editFormBox').style.display = 'none';
      showToast('Producto actualizado correctamente.');
    })
    .catch(err => {
      console.error('Error actualizando producto:', err);
      alert('Error al editar producto. Revisa la consola.');
    });
}


function adminCancelEdit() {
  document.getElementById('editFormBox').style.display = 'none';
}

/* --- Reordenamiento: Up / Down y Normalizar --- */
function adminMoveUp(id) {
  const idx = PRODUCTS.findIndex(p => String(p.id) === String(id));
  if (idx <= 0) return;
  const current = PRODUCTS[idx];
  const above = PRODUCTS[idx - 1];
  const batch = db.batch();
  const curRef = productsRef.doc(current.id);
  const aboveRef = productsRef.doc(above.id);
  const curOrder = Number(current.order ?? Date.now());
  const aboveOrder = Number(above.order ?? Date.now() - 1);
  batch.update(curRef, { order: aboveOrder });
  batch.update(aboveRef, { order: curOrder });
  batch.commit().catch(err => console.error("Error swap order:", err));
}

function adminMoveDown(id) {
  const idx = PRODUCTS.findIndex(p => String(p.id) === String(id));
  if (idx < 0 || idx >= PRODUCTS.length - 1) return;
  const current = PRODUCTS[idx];
  const below = PRODUCTS[idx + 1];
  const batch = db.batch();
  const curRef = productsRef.doc(current.id);
  const belowRef = productsRef.doc(below.id);
  const curOrder = Number(current.order ?? Date.now());
  const belowOrder = Number(below.order ?? Date.now() + 1);
  batch.update(curRef, { order: belowOrder });
  batch.update(belowRef, { order: curOrder });
  batch.commit().catch(err => console.error("Error swap order:", err));
}

function adminNormalizeOrder() {
  if (!confirm("Normalizará el orden de todos los productos (1,2,3...). ¿Continuar?")) return;
  const batch = db.batch();
  PRODUCTS.forEach((p, i) => {
    const ref = productsRef.doc(p.id);
    batch.update(ref, { order: i + 1 });
  });
  batch.commit()
    .then(() => alert("Orden normalizado correctamente."))
    .catch(err => {
      console.error("Error normalizando orden:", err);
      alert("Error normalizando orden. Revisa la consola.");
    });
}

/* --- Site title save/load (neón) --- */
function loadSiteTitleIntoAdmin() {
  siteConfigRef.get().then(doc => {
    if (doc && doc.exists) {
      const data = doc.data();
      const input = document.getElementById('adminSiteTitle');
      if (input) input.value = data.siteTitle || '';
    }
  }).catch(err => console.error('Error cargando siteTitle:', err));
}

function saveSiteTitle(newTitle) {
  return siteConfigRef.set({ siteTitle: String(newTitle) });
}

/* --- Bulk discount load/save into admin --- */
function loadBulkIntoAdmin() {
  const enabled = document.getElementById('bulkEnabled');
  const minInput = document.getElementById('bulkMinItems');
  const percentInput = document.getElementById('bulkPercent');
  const applyToSel = document.getElementById('bulkApplyTo');
  if (enabled) enabled.checked = Boolean(bulkDiscount.enabled);
  if (minInput) minInput.value = Number(bulkDiscount.minItems || 4);
  if (percentInput) percentInput.value = Number(bulkDiscount.percent || 20);
  if (applyToSel) applyToSel.value = bulkDiscount.applyTo || 'all';
}

function saveBulkFromAdmin() {
  const enabled = document.getElementById('bulkEnabled') ? document.getElementById('bulkEnabled').checked : false;
  const minItems = Number(document.getElementById('bulkMinItems') ? document.getElementById('bulkMinItems').value : 4);
  const percent = Number(document.getElementById('bulkPercent') ? document.getElementById('bulkPercent').value : 0);
  const applyTo = document.getElementById('bulkApplyTo') ? document.getElementById('bulkApplyTo').value : 'all';
  const payload = { enabled: Boolean(enabled), minItems: Math.max(1, minItems), percent: Math.max(0, Math.min(100, percent)), applyTo };
  bulkRef.set(payload)
    .then(() => showToast('Configuración de descuento guardada correctamente.'))
    .catch(err => {
      console.error('Error guardando bulk:', err);
      alert('Error guardando configuración de descuento. Revisa la consola.');
    });
}

/* --- Toast feedback --- */
function showToast(msg) {
  const toast = document.getElementById('catalogFeedback');
  if (!toast) return;
  toast.innerText = msg;
  toast.classList.add('show');
  setTimeout(() => { toast.classList.remove('show'); }, 2200);
}

/* --- Contacto (si existe formulario) --- */
const contactForm = document.getElementById('contactForm');
if (contactForm) {
  contactForm.addEventListener('submit', function(e){
    e.preventDefault();
    const nombre = contactForm.nombre.value.trim();
    const email = contactForm.email.value.trim();
    const mensaje = contactForm.mensaje.value.trim();
    const feedback = document.getElementById('contactFeedback');
    if(!nombre || !email || !mensaje || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){
      feedback.innerText = "Por favor completa todos los campos correctamente.";
      feedback.style.color = "#ff5b5b";
      return;
    }
    feedback.innerText = "¡Mensaje enviado! Nos pondremos en contacto contigo.";
    feedback.style.color = "#00ff85";
    contactForm.reset();
    setTimeout(()=>{feedback.innerText="";}, 3000);
  });
}

/* --- Inicialización: eventos y listeners del DOM --- */
document.addEventListener('DOMContentLoaded', () => {
  renderCatalog();
  renderHomeExtras();
  renderAdminPanel();

  const loginForm = document.getElementById('adminLoginForm');
  if (loginForm) loginForm.onsubmit = adminLogin;

  const logoutBtn = document.getElementById('adminLogoutBtn');
  if (logoutBtn) logoutBtn.onclick = adminLogout;

  const addForm = document.getElementById('addProductForm');
  if (addForm) addForm.onsubmit = adminAddProduct;

  const editForm = document.getElementById('editProductForm');
  if (editForm) editForm.onsubmit = adminEditProduct;

  const editCancel = document.getElementById('editCancelBtn');
  if (editCancel) editCancel.onclick = adminCancelEdit;

  const saveSiteTitleBtn = document.getElementById('saveSiteTitleBtn');
  if (saveSiteTitleBtn) {
    saveSiteTitleBtn.onclick = () => {
      const input = document.getElementById('adminSiteTitle');
      if (!input) return;
      saveSiteTitle(input.value.trim()).then(() => {
        const el = document.getElementById('brandNeon');
        if (el) el.textContent = input.value.trim() || 'ElectroFlips Xperience';
        showToast('Título guardado.');
      }).catch(err => {
        console.error('Error guardando title:', err);
        alert('Error guardando título. Revisa la consola.');
      });
    };
     // --- Insertar dentro de document.addEventListener('DOMContentLoaded', ...) ---
// Detectar dispositivo / ancho y agregar clase al <html> para estilos específicos
(function setupMobileClass(){
  function updateMobileClass() {
    const isMobile = window.matchMedia && window.matchMedia('(max-width: 720px)').matches;
    if (isMobile) document.documentElement.classList.add('is-mobile');
    else document.documentElement.classList.remove('is-mobile');
  }
  // Ejecutar al inicio
  updateMobileClass();
  // Escuchar cambios de tamaño (rotación o redimension)
  window.addEventListener('resize', () => {
    // throttle simple
    clearTimeout(window.__mobileClassTimeout);
    window.__mobileClassTimeout = setTimeout(updateMobileClass, 120);
  });
})();
     // --- Mobile sidebar toggle + sync brand neon text ---
// Pegar dentro de DOMContentLoaded o justo después de que el DOM haya cargado.

(function mobileNavSetup(){
  const hamburger = document.getElementById('mobileHamburger');
  const overlay = document.getElementById('mobileNavOverlay');
  const sidebar = document.getElementById('mobileSidebar');
  const closeBtn = document.getElementById('mobileCloseBtn');
  const brandDesktop = document.getElementById('brandNeon');
  const brandMobile = document.getElementById('brandNeonMobile');

  function openMobileNav() {
    if (overlay) overlay.classList.add('visible');
    if (sidebar) sidebar.classList.add('open');
    if (overlay) overlay.setAttribute('aria-hidden', 'false');
    if (sidebar) sidebar.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('mobile-nav-open');
    document.body.style.overflow = 'hidden';
  }
  function closeMobileNav() {
    if (overlay) overlay.classList.remove('visible');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.setAttribute('aria-hidden', 'true');
    if (sidebar) sidebar.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('mobile-nav-open');
    document.body.style.overflow = '';
  }

  // Bind events if elements exist
  if (hamburger) hamburger.addEventListener('click', openMobileNav);
  if (closeBtn) closeBtn.addEventListener('click', closeMobileNav);
  if (overlay) overlay.addEventListener('click', closeMobileNav);
  // close with Escape key
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMobileNav(); });

  // Sync brand neon text (initial + when site title changes from admin)
  function syncBrandText() {
    if (!brandMobile) return;
    if (brandDesktop) brandMobile.textContent = brandDesktop.textContent || brandMobile.textContent;
  }
  // initial
  syncBrandText();

  // observe brandDesktop changes (so when admin saves title it's reflected)
  if (brandDesktop && brandMobile) {
    const mo = new MutationObserver(syncBrandText);
    mo.observe(brandDesktop, { childList: true, characterData: true, subtree: true });
  }

  // expose close function globally so markup onclick (closeMobileNav()) works
  window.closeMobileNav = closeMobileNav;
  window.openMobileNav = openMobileNav;
})();
  }

  const saveBulkBtn = document.getElementById('saveBulkBtn');
  if (saveBulkBtn) saveBulkBtn.onclick = saveBulkFromAdmin;

  const savePromoBtn = document.querySelector('#promoForm button[onclick="savePromoFromAdmin()"]');
  // promo form uses inline onclick; if not found nothing to bind

  // Modal close handler (click outside to close)
  const modal = document.getElementById('productModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeProductModal();
    });
  }

});

