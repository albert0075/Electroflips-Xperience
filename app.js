/* app.js - Archivo completo y organizado (versión corregida)
   - He añadido las funciones administrativas faltantes (crear, editar, eliminar productos,
     mostrar formulario de edición y cancelar edición, toggle agotado).
   - Mantiene el resto de tu lógica original (promos, carrito, combo, bulk, UI).
   - Reemplaza completamente tu app.js por este archivo.
*/

/* ========== Config / Refs ========== */
/* Credenciales demo (NO usar en producción) */
const ADMINS = [
  { email: "flixalbert75@gmail.com", password: "220817" }
];

/* Firestore refs (db debe venir de index.html) */
const productsRef = db.collection("products");
const comboRef = db.collection("config").doc("combo3x2");
const siteConfigRef = db.collection("config").doc("siteConfig");
const bulkRef = db.collection("config").doc("bulkDiscount");
const promosRef = db.collection("config").doc("sitePromos");

/* Estado global */
let PRODUCTS = [];
let cart = [];
let isAdminAuthed = false;
let adminEmail = null;
let combo3x2 = { enabled: false, eligibles: [] };
let bulkDiscount = { enabled: false, minItems: 4, percent: 20, applyTo: 'all' };
let sitePromos = [];
let currentPromo = null;

/* ========== Helpers ========== */
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
function htmlEscape(str) {
  if (!str && str !== 0) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function parseDescriptionToArray(str) {
  if (str === undefined || str === null) return [];
  return String(str)
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);
}
function precioCOP(valor) {
  return "$" + Number(valor || 0).toLocaleString('es-CO') + " COP";
}

/* Toast helper (create if not exists) */
function showToast(msg, timeout = 2200) {
  let toast = document.getElementById('catalogFeedback');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'catalogFeedback';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.innerText = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), timeout);
}

/* ========== Realtime loaders ========== */
function loadProductsRealtime() {
  productsRef.orderBy('order').onSnapshot(snapshot => {
    PRODUCTS = [];
    snapshot.forEach(doc => PRODUCTS.push({ ...doc.data(), id: doc.id }));
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
      combo3x2 = { enabled: !!data.enabled, eligibles: Array.isArray(data.eligibles) ? data.eligibles.map(String) : [] };
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
    if (doc && doc.exists) bulkDiscount = doc.data() || bulkDiscount;
    else bulkDiscount = { enabled: false, minItems: 4, percent: 20, applyTo: 'all' };
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

/* start realtime listeners */
loadProductsRealtime();
loadComboRealtime();
loadBulkRealtime();
loadPromosRealtime();
if (typeof db !== 'undefined') loadSiteTitle();

/* ========== Navigation ========== */
function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  if (id === 'carrito') renderCart();
  if (id === 'catalogo') renderCatalog();
  if (id === 'admin') renderAdminPanel();
}

/* ========== Catalog Rendering ========== */
/* Reemplaza únicamente la función renderCatalog en tu app.js por esta versión */
function renderCatalog() {
  const container = document.getElementById('catalogContainer');
  if (!container) return;
  container.innerHTML = '';

  // Promo banner currentPromo
  if (currentPromo) {
    const banner = document.createElement('div');
    banner.className = 'promo-active-banner';
    banner.innerHTML = `<strong>${htmlEscape(currentPromo.title)}</strong><div style="font-size:0.95rem;margin-top:0.2rem;">${htmlEscape(currentPromo.text || '')}${currentPromo.percent ? ` — ${Number(currentPromo.percent)}%` : ''}${currentPromo.minItems ? ` (mínimo ${Number(currentPromo.minItems)} items)` : ''}</div>`;
    container.appendChild(banner);
    setTimeout(() => { currentPromo = null; }, 8000);
  }

  // Combo banner
  let comboBanner = document.getElementById('combo3x2Banner');
  if (combo3x2 && combo3x2.enabled) {
    if (!comboBanner) {
      comboBanner = document.createElement('div');
      comboBanner.id = "combo3x2Banner";
      comboBanner.className = "combo3x2-banner";
      document.getElementById('catalogo').prepend(comboBanner);
    }
    comboBanner.innerHTML = `<div><strong>¡Combo 3x2 activo!</strong><span style="display:block;font-size:1rem;">Elige cualquier <b>3 servicios</b> y el de menor precio elegible ¡te sale GRATIS!</span></div>`;
  } else if (comboBanner) comboBanner.remove();

  // categories
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

      // Build compact visible elements; longer info remains in modal (detalles)
      const precioHtml = prod.oferta
        ? `<span class="oferta">Oferta: ${precioCOP(prod.oferta)} <span style="font-size:0.95em;text-decoration:line-through;color:#aaa;">${precioCOP(prod.precio)}</span></span>`
        : `<span class="precio">${precioCOP(prod.precio)}</span>`;
      const promoHtml = prod.promo ? `<span class="promo">${htmlEscape(prod.promo)}</span>` : '';
      const descHtml = Array.isArray(prod.descripcion)
        ? `<ul class="desc-list">${prod.descripcion.map(d => `<li>${htmlEscape(d)}</li>`).join('')}</ul>`
        : `<p class="card-description">${htmlEscape(prod.descripcion || '')}</p>`;

      const agotadoHtml = prod.agotado ? `<div><span class="agotado-badge">Agotado</span></div>` : '';

      // En la tarjeta mostramos img, nombre, precio visible y botones. El resto será visible en el modal (detalles)
      card.innerHTML = `
        <img class="product-image" src="${prod.imagen || 'images/placeholder.png'}" alt="${htmlEscape(prod.nombre)}" onclick="showProductDetails('${prod.id}')" style="cursor:pointer">
        ${agotadoHtml}
        <h3 onclick="showProductDetails('${prod.id}')" style="cursor:pointer">${htmlEscape(prod.nombre)}</h3>

        <!-- Precio visible fuera de la tarjeta -->
        <div class="card-price" aria-hidden="false">${precioHtml}</div>

        <div class="card-actions">
          ${prod.agotado ? `<button class="btn" disabled style="opacity:0.5;cursor:not-allowed;">Agotado</button>` : `<button class="btn" onclick="addToCart('${prod.id}')">Add carrito</button>`}
          <button class="btn small ver-mas-btn" onclick="showProductDetails('${prod.id}')">Mas Info</button>
        </div>

        <!-- detailed info hidden for compact view but used for accessibility / desktop view -->
        <div class="card-info" aria-hidden="true" style="display:none;">
          ${promoHtml}
          ${descHtml}
          ${precioHtml}
        </div>
      `;

      grid.appendChild(card);
    });

    container.appendChild(grid);
  });
}

/* ========== Home (Favorites + Promos) ========== */
function renderHomeExtras() {
  const favContainer = document.getElementById('favoritesContainer');
  const promosContainer = document.getElementById('promosContainer');
  if (!favContainer || !promosContainer) return;

  // Favorites
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
      btn.innerHTML = `<img src="${p.imagen || 'images/placeholder.png'}" alt="${htmlEscape(p.nombre)}"><span>${htmlEscape(p.nombre)}</span>`;
      btn.onclick = () => { if (document.querySelector('#inicio.active')) showProductDetails(p.id); else openCatalogAndShow(p.id); };
      grid.appendChild(btn);
    });
    favContainer.appendChild(grid);
  }

  // Promos detailed
  promosContainer.innerHTML = '';
  if (!sitePromos || sitePromos.length === 0) {
    promosContainer.innerHTML = '<p>No hay promociones configuradas.</p>';
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'promos-detailed-grid';

  sitePromos.forEach(pr => {
    const targetName = pr.targetProductId ? (PRODUCTS.find(p => String(p.id) === String(pr.targetProductId))?.nombre || pr.targetProductId) : '';
    const card = document.createElement('div');
    card.className = 'promo-detailed-card';

    // prefer descripcion array if present
    let descriptionHtml = '';
    if (Array.isArray(pr.descripcion) && pr.descripcion.length > 0) {
      descriptionHtml = '<ul class="promo-detailed-list">' + pr.descripcion.map(i => `<li>${htmlEscape(i)}</li>`).join('') + '</ul>';
    } else {
      descriptionHtml = `<p class="promo-detailed-text">${htmlEscape(pr.text || '')}</p>`;
    }

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
        ${descriptionHtml}
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

/* apply promo */
function applySitePromoAndOpen(promoId) {
  const pr = sitePromos.find(p => String(p.id) === String(promoId));
  if (!pr) return;
  currentPromo = pr;
  if (pr.targetProductId) openCatalogAndShow(pr.targetProductId);
  else { showSection('catalogo'); renderCatalog(); const container = document.getElementById('catalogContainer'); if (container) container.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}

/* ========== Modal product ========== */
function showProductDetails(id) {
  const prod = PRODUCTS.find(p => String(p.id) === String(id));
  if (!prod) { showToast('Producto no encontrado.'); return; }
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
    if (prod.agotado) {
      buyBtn.disabled = true;
      buyBtn.style.opacity = '0.5';
      buyBtn.onclick = () => showToast('Producto agotado.');
    } else {
      buyBtn.disabled = false;
      buyBtn.style.opacity = '';
      buyBtn.onclick = function () { addToCart(prod.id); closeProductModal(); };
    }
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

/* open catalog and show */
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

/* ========== Promo filter UI ========== */
function togglePromoFilter(enabled) {
  const container = document.getElementById('catalogContainer');
  if (!container) return;
  if (enabled) container.classList.add('promo-filter-active');
  else container.classList.remove('promo-filter-active');
}

/* ========== Cart ========== */
function addToCart(id) {
  const prod = PRODUCTS.find(p => String(p.id) === String(id));
  if (!prod) { showToast('Producto no encontrado.'); return; }
  if (prod.agotado) { showToast('Producto agotado.'); return; }
  const precioFinal = prod.oferta ? prod.oferta : prod.precio;
  const existing = cart.find(p => String(p.id) === String(id));
  if (existing) existing.cantidad += 1;
  else cart.push({ ...prod, precio: precioFinal, cantidad: 1 });
  showToast('Producto agregado al carrito');
  renderCart();
  updateCartBubble();
}
function changeQty(id, delta) {
  const item = cart.find(p => String(p.id) === String(id));
  if (item) {
    item.cantidad = Math.max(1, item.cantidad + delta);
    renderCart();
    updateCartBubble();
  }
}
function removeFromCart(id) {
  cart = cart.filter(p => String(p.id) !== String(id));
  renderCart();
  updateCartBubble();
}
function renderCart() {
  const container = document.getElementById('cartContainer');
  if (!container) return;
  container.innerHTML = '';
  if (cart.length === 0) {
    container.innerHTML = '<p style="text-align:center;">El carrito está vacío.</p>';
    document.getElementById('cartTotal').innerText = '';
    document.getElementById('finalizeBtn').style.display = 'none';
    updateCartBubble();
    return;
  }

  let baseTotal = cart.reduce((acc, p) => acc + p.precio * p.cantidad, 0);

  // combo 3x2
  let comboMsg = "";
  if (combo3x2 && combo3x2.enabled) {
    let eligiblesInCart = [];
    cart.forEach(prod => {
      if (Array.isArray(combo3x2.eligibles) && combo3x2.eligibles.map(String).includes(String(prod.id))) {
        for (let i = 0; i < prod.cantidad; i++) eligiblesInCart.push(prod.precio);
      }
    });
    if (eligiblesInCart.length >= 3) {
      eligiblesInCart.sort((a, b) => a - b);
      const comboDiscount = eligiblesInCart[0];
      baseTotal -= comboDiscount;
      comboMsg = `<div class="combo3x2-desc">¡Combo 3x2 aplicado! Descuento: -${precioCOP(comboDiscount)}</div>`;
    }
  }

  // bulk
  let bulkMsg = "";
  if (bulkDiscount && bulkDiscount.enabled) {
    const minItems = Number(bulkDiscount.minItems || 0);
    const percent = Number(bulkDiscount.percent || 0);
    const applyTo = bulkDiscount.applyTo || 'all';
    let itemsCount = 0;
    if (applyTo === 'all') itemsCount = cart.reduce((acc,p)=>acc+p.cantidad,0);
    else cart.forEach(prod => { if (Array.isArray(combo3x2.eligibles) && combo3x2.eligibles.map(String).includes(String(prod.id))) itemsCount += prod.cantidad; });
    if (itemsCount >= minItems && percent > 0) {
      const bulkAmt = Math.round((baseTotal * percent) / 100);
      baseTotal -= bulkAmt;
      bulkMsg = `<div class="combo3x2-desc">Descuento por compra de ${itemsCount} items: -${percent}% (-${precioCOP(bulkAmt)})</div>`;
    }
  }

  cart.forEach(prod => {
    const item = document.createElement('div');
    item.className = 'cart-item';
    item.innerHTML = `
      <span>${htmlEscape(prod.nombre)} (${precioCOP(prod.precio)}) x ${prod.cantidad}</span>
      <div class="cart-controls">
        <button onclick="changeQty('${prod.id}', -1)">-</button>
        <button onclick="changeQty('${prod.id}', 1)">+</button>
        <button onclick="removeFromCart('${prod.id}')">Eliminar</button>
      </div>
    `;
    container.appendChild(item);
  });

  document.getElementById('cartTotal').innerHTML = `${comboMsg}${bulkMsg}Total: ${precioCOP(baseTotal)}`;
  document.getElementById('finalizeBtn').style.display = 'inline-block';
  updateCartBubble();
}

function finalizePurchase() {
  if (cart.length === 0) return;
  const phone = "573243052782";
  let msg = "¡Hola! Quiero finalizar mi compra en ElectroFlips Xperience:%0A";
  cart.forEach(p => msg += `- ${p.nombre} x ${p.cantidad} (${precioCOP(p.precio * p.cantidad)})%0A`);

  let total = cart.reduce((acc, p) => acc + p.precio * p.cantidad, 0);
  if (combo3x2 && combo3x2.enabled) {
    let eligibles = [];
    cart.forEach(prod => { if (Array.isArray(combo3x2.eligibles) && combo3x2.eligibles.map(String).includes(String(prod.id))) for (let i=0;i<prod.cantidad;i++) eligibles.push(prod.precio); });
    if (eligibles.length >= 3) { eligibles.sort((a,b)=>a-b); total -= eligibles[0]; msg += `Descuento Combo 3x2 aplicado: -${precioCOP(eligibles[0])}%0A`; }
  }

  if (bulkDiscount && bulkDiscount.enabled) {
    const minItems = Number(bulkDiscount.minItems || 0);
    const percent = Number(bulkDiscount.percent || 0);
    const applyTo = bulkDiscount.applyTo || 'all';
    let itemsCount = 0;
    if (applyTo === 'all') itemsCount = cart.reduce((acc,p)=>acc+p.cantidad,0);
    else cart.forEach(prod => { if (Array.isArray(combo3x2.eligibles) && combo3x2.eligibles.map(String).includes(String(prod.id))) itemsCount += prod.cantidad; });
    if (itemsCount >= minItems && percent > 0) {
      const bulkApplied = Math.round((total * percent) / 100);
      total -= bulkApplied;
      msg += `Descuento por compra múltiple (${percent}%): -${precioCOP(bulkApplied)}%0A`;
    }
  }

  msg += `Total: ${precioCOP(total)}%0A¿Me puedes indicar el proceso de pago y detalles extra?`;
  window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
  cart = [];
  renderCart();
  showToast('Redirigiendo a WhatsApp...');
  updateCartBubble();
}

/* ========== ADMIN ========== */
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
    const err = document.getElementById('adminLoginError'); if (err) err.innerText = "";
  }
}

function adminLogin(e) {
  e.preventDefault();
  const email = document.getElementById('adminEmail').value.trim();
  const password = document.getElementById('adminPassword').value.trim();
  const adminMatch = ADMINS.find(a => a.email === email && a.password === password);
  if (adminMatch) {
    isAdminAuthed = true; adminEmail = email; renderAdminPanel();
  } else {
    const err = document.getElementById('adminLoginError');
    if (err) err.innerText = "Correo o contraseña incorrectos.";
  }
  if (e && e.target) e.target.reset();
}
function adminLogout() { isAdminAuthed = false; adminEmail = null; renderAdminPanel(); }

/* Combo 3x2 admin */
function renderCombo3x2Admin() {
  let box = document.getElementById('combo3x2Admin');
  if (!box) {
    box = document.createElement('div'); box.id = 'combo3x2Admin';
    const panel = document.querySelector('.admin-panel'); if (panel) panel.prepend(box);
  }

  const productCheckboxes = PRODUCTS.map(p => {
    const checked = Array.isArray(combo3x2.eligibles) && combo3x2.eligibles.map(String).includes(String(p.id));
    return `<label style="display:inline-block;margin:0.3em 1em 0.3em 0;"><input type="checkbox" class="combo3x2Eligible" value="${p.id}" ${checked ? "checked" : ""}> ${htmlEscape(p.nombre)}</label>`;
  }).join('');

  box.innerHTML = `
    <h2>Promo Combo 3x2</h2>
    <label style="display:flex;align-items:center;gap:0.6rem;"><input type="checkbox" id="combo3x2Switch" ${combo3x2 && combo3x2.enabled ? "checked" : ""}> Activar Combo 3x2 (guardar inmediato)</label>
    <div style="margin:1em 0;"><strong>Servicios elegibles (pueden ser el GRATIS):</strong><br>${productCheckboxes || '<em>No hay productos.</em>'}</div>
    <div style="margin-top:0.6rem;"><button class="btn" id="saveCombo3x2Eligibles">Guardar elegibles</button></div><hr>
  `;

  const switchEl = document.getElementById('combo3x2Switch');
  if (switchEl) switchEl.onchange = function () {
    combo3x2.enabled = this.checked;
    comboRef.set({ enabled: combo3x2.enabled, eligibles: combo3x2.eligibles }).then(() => showToast('Estado Combo 3x2 actualizado.')).catch(err => { console.error(err); alert('Error guardando estado Combo 3x2.'); });
  };

  const saveBtn = document.getElementById('saveCombo3x2Eligibles');
  if (saveBtn) saveBtn.onclick = () => {
    const eligibles = Array.from(document.querySelectorAll('.combo3x2Eligible')).filter(c=>c.checked).map(c=>String(c.value));
    combo3x2.eligibles = eligibles;
    comboRef.set({ enabled: combo3x2.enabled, eligibles: combo3x2.eligibles }).then(()=>showToast('Elegibles guardados.')).catch(err=>{ console.error(err); alert('Error guardando eligibles.'); });
  };
}

/* Promos admin (list) */
function renderPromosAdmin() {
  const list = document.getElementById('promoList');
  if (!list) return;
  list.innerHTML = '';
  if (!sitePromos || sitePromos.length === 0) { list.innerHTML = '<p>No hay promos guardadas.</p>'; return; }

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

    let descPreview = '';
    if (Array.isArray(pr.descripcion) && pr.descripcion.length > 0) descPreview = pr.descripcion.join(' • ');
    else descPreview = pr.text || '';

    item.innerHTML = `
      <div style="display:flex;gap:0.6rem;align-items:center;">
        ${pr.image ? `<img src="${pr.image}" alt="${htmlEscape(pr.title)}" style="width:56px;height:56px;object-fit:cover;border-radius:6px;">` : ''}
        <div>
          <strong>${htmlEscape(pr.title)}</strong>
          <div style="color:#cbeee0; max-width:420px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${htmlEscape(descPreview)}</div>
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

/* Save promo (admin) */
function savePromoFromAdmin() {
  const id = document.getElementById('promoId').value || String(Date.now());
  const title = document.getElementById('promoTitle').value.trim();
  const textRaw = document.getElementById('promoText').value.trim();
  const minItems = Number(document.getElementById('promoMinItems').value) || 0;
  const percent = Number(document.getElementById('promoPercent').value) || 0;
  const applyTo = document.getElementById('promoApplyTo').value || 'all';
  const targetProductId = document.getElementById('promoTargetProduct') ? document.getElementById('promoTargetProduct').value.trim() : '';
  const image = document.getElementById('promoImage') ? document.getElementById('promoImage').value.trim() : '';

  if (!title || !textRaw) { alert('Título y texto son requeridos.'); return; }

  const descripcionArray = parseDescriptionToArray(textRaw);
  const promoObj = { id, title, text: textRaw, descripcion: descripcionArray, minItems, percent, applyTo, targetProductId };
  if (image) promoObj.image = image;

  const updated = sitePromos.filter(p => String(p.id) !== String(id)).concat([promoObj]);
  promosRef.set({ promos: updated }).then(()=>{ showToast('Promoción guardada correctamente.'); clearPromoForm(); }).catch(err=>{ console.error(err); alert('Error guardando promo.'); });
}
function clearPromoForm() {
  const ids = ['promoId','promoTitle','promoText','promoMinItems','promoPercent','promoApplyTo','promoTargetProduct','promoImage'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const applyTo = document.getElementById('promoApplyTo'); if (applyTo) applyTo.value = 'all';
}
function editPromoForm(id) {
  const pr = sitePromos.find(p => String(p.id) === String(id));
  if (!pr) return;
  document.getElementById('promoId').value = pr.id || '';
  document.getElementById('promoTitle').value = pr.title || '';
  if (Array.isArray(pr.descripcion) && pr.descripcion.length > 0) document.getElementById('promoText').value = pr.descripcion.join('; ');
  else document.getElementById('promoText').value = pr.text || '';
  document.getElementById('promoMinItems').value = pr.minItems || '';
  document.getElementById('promoPercent').value = pr.percent || '';
  document.getElementById('promoApplyTo').value = pr.applyTo || 'all';
  if (document.getElementById('promoTargetProduct')) document.getElementById('promoTargetProduct').value = pr.targetProductId || '';
  if (document.getElementById('promoImage')) document.getElementById('promoImage').value = pr.image || '';
}
function deletePromo(id) { if (!confirm('Eliminar esta promo?')) return; const updated = sitePromos.filter(p => String(p.id) !== String(id)); promosRef.set({ promos: updated }).then(()=>showToast('Promo eliminada.')).catch(err=>{ console.error(err); alert('Error eliminando promo.'); }); }

/* ========== Admin products list ========== */
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
    catBox.innerHTML = `<h3 style="margin:0 0 0.6rem 0;">${htmlEscape(cat)}</h3>`;

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

      item.innerHTML = `
        <img src="${prod.imagen || 'images/placeholder.png'}" alt="${htmlEscape(prod.nombre)}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;">
        <div style="flex:1;min-width:0;">
          <strong style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${htmlEscape(prod.nombre)}</strong>
          <small style="display:block;margin-top:0.3rem;color:#cbeee0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Array.isArray(prod.descripcion) ? prod.descripcion.join(' • ') : (prod.descripcion || '')}</small>
          <div style="margin-top:0.4rem;font-weight:bold;">${precioCOP(prod.precio)} ${prod.oferta ? `<span style="color:#ff00cc;margin-left:0.6rem;">(Oferta ${precioCOP(prod.oferta)})</span>` : ''}</div>
          <div style="margin-top:0.35rem;font-size:0.9rem;color:#ddd;">Pos: ${prod.order ?? '(sin)'}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex-shrink:0;">
          <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.9rem;">
            <input type="checkbox" ${prod.featured ? "checked" : ""} onchange="adminToggleFeatured('${prod.id}', this.checked)">
            <span style="font-size:0.85rem;">Fav</span>
          </label>
          <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.9rem;">
            <input type="checkbox" ${prod.agotado ? "checked" : ""} onchange="adminToggleAgotado('${prod.id}', this.checked)">
            <span style="font-size:0.85rem;color:${prod.agotado ? '#ffb3b3' : '#fff'};">Agotado</span>
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

/* admin toggle featured */
function adminToggleFeatured(id, checked) {
  productsRef.doc(String(id)).update({ featured: !!checked })
    .then(() => showToast(checked ? 'Producto marcado como favorito.' : 'Producto desmarcado de favoritos.'))
    .catch(err => { console.error('Error toggling featured:', err); alert('Error actualizando favorito. Revisa la consola.'); });
}

/* admin toggle agotado */
function adminToggleAgotado(id, checked) {
  productsRef.doc(String(id)).update({ agotado: !!checked })
    .then(() => showToast(checked ? 'Producto marcado como agotado.' : 'Producto marcado como disponible.'))
    .catch(err => { console.error('Error toggling agotado:', err); alert('Error actualizando estado agotado.'); });
}

/* ========== Admin: Add / Edit / Delete Products (implementación faltante) ========== */

/* Crear producto */
function adminAddProduct(e) {
  if (e && e.preventDefault) e.preventDefault();
  const nombre = (document.getElementById('adminNombre')?.value || '').trim();
  const descripcionRaw = (document.getElementById('adminDescripcion')?.value || '').trim();
  const precio = Number(document.getElementById('adminPrecio')?.value || 0);
  const categoria = (document.getElementById('adminCategoria')?.value || '').trim() || 'Sin categoría';
  const imagen = (document.getElementById('adminImagen')?.value || '').trim() || '';
  const oferta = document.getElementById('adminOferta')?.value ? Number(document.getElementById('adminOferta')?.value) : null;
  const promo = (document.getElementById('adminPromo')?.value || '').trim() || '';
  const featured = !!document.getElementById('adminFeatured')?.checked;
  const agotado = !!document.getElementById('adminAgotado')?.checked;

  if (!nombre || !descripcionRaw || isNaN(precio)) { alert('Nombre, descripción y precio son requeridos.'); return; }

  const descripcion = parseDescriptionToArray(descripcionRaw);
  const payload = cleanPayload({
    nombre,
    descripcion,
    precio,
    categoria,
    imagen,
    oferta: oferta || undefined,
    promo: promo || undefined,
    featured: !!featured,
    agotado: !!agotado,
    order: (PRODUCTS.length ? (Math.max(...PRODUCTS.map(p=>Number(p.order||0))) + 1) : 1),
    createdAt: Date.now()
  });

  productsRef.add(payload).then(() => {
    showToast('Producto creado correctamente.');
    const form = document.getElementById('addProductForm');
    if (form) form.reset();
  }).catch(err => {
    console.error('Error creando producto:', err);
    alert('Error creando producto. Revisa la consola.');
  });
}

/* Mostrar formulario de edición y precargar datos */
function adminEditProductForm(id) {
  const prod = PRODUCTS.find(p => String(p.id) === String(id));
  if (!prod) { alert('Producto no encontrado.'); return; }
  const box = document.getElementById('editFormBox');
  if (box) box.style.display = '';

  document.getElementById('editId').value = prod.id || '';
  document.getElementById('editNombre').value = prod.nombre || '';
  document.getElementById('editDescripcion').value = Array.isArray(prod.descripcion) ? prod.descripcion.join('; ') : (prod.descripcion || '');
  document.getElementById('editPrecio').value = prod.precio || '';
  document.getElementById('editCategoria').value = prod.categoria || '';
  document.getElementById('editImagen').value = prod.imagen || '';
  document.getElementById('editOferta').value = prod.oferta || '';
  document.getElementById('editPromo').value = prod.promo || '';
  document.getElementById('editFeatured').checked = !!prod.featured;
  document.getElementById('editAgotado').checked = !!prod.agotado;

  // scroll to edit form
  setTimeout(()=> {
    const el = document.getElementById('editFormBox');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 120);
}

/* Cancelar edición */
function adminCancelEdit() {
  const box = document.getElementById('editFormBox');
  if (box) box.style.display = 'none';
  const form = document.getElementById('editProductForm');
  if (form) form.reset();
}

/* Actualizar producto */
function adminEditProduct(e) {
  if (e && e.preventDefault) e.preventDefault();
  const id = document.getElementById('editId')?.value;
  if (!id) { alert('ID de producto faltante.'); return; }

  const nombre = (document.getElementById('editNombre')?.value || '').trim();
  const descripcionRaw = (document.getElementById('editDescripcion')?.value || '').trim();
  const precio = Number(document.getElementById('editPrecio')?.value || 0);
  const categoria = (document.getElementById('editCategoria')?.value || '').trim() || 'Sin categoría';
  const imagen = (document.getElementById('editImagen')?.value || '').trim() || '';
  const oferta = document.getElementById('editOferta')?.value ? Number(document.getElementById('editOferta')?.value) : null;
  const promo = (document.getElementById('editPromo')?.value || '').trim() || '';
  const featured = !!document.getElementById('editFeatured')?.checked;
  const agotado = !!document.getElementById('editAgotado')?.checked;

  if (!nombre || !descripcionRaw || isNaN(precio)) { alert('Nombre, descripción y precio son requeridos.'); return; }

  const descripcion = parseDescriptionToArray(descripcionRaw);
  const payload = cleanPayload({
    nombre,
    descripcion,
    precio,
    categoria,
    imagen,
    oferta: oferta || undefined,
    promo: promo || undefined,
    featured: !!featured,
    agotado: !!agotado,
    updatedAt: Date.now()
  });

  productsRef.doc(String(id)).update(payload).then(() => {
    showToast('Producto actualizado correctamente.');
    adminCancelEdit();
  }).catch(err => {
    console.error('Error actualizando producto:', err);
    alert('Error actualizando producto. Revisa la consola.');
  });
}

/* Eliminar producto */
function adminDeleteProduct(id) {
  if (!confirm('¿Eliminar este producto? Esta acción no se puede deshacer.')) return;
  productsRef.doc(String(id)).delete().then(() => {
    showToast('Producto eliminado.');
  }).catch(err => {
    console.error('Error eliminando producto:', err);
    alert('Error eliminando producto. Revisa la consola.');
  });
}

/* ========== Ordering helpers ========== */
function adminMoveUp(id) {
  const idx = PRODUCTS.findIndex(p => String(p.id) === String(id));
  if (idx <= 0) return;
  const current = PRODUCTS[idx]; const above = PRODUCTS[idx-1];
  const batch = db.batch();
  batch.update(productsRef.doc(current.id), { order: Number(above.order ?? Date.now()) });
  batch.update(productsRef.doc(above.id), { order: Number(current.order ?? Date.now()) });
  batch.commit().catch(err=>console.error('Error swap order',err));
}
function adminMoveDown(id) {
  const idx = PRODUCTS.findIndex(p => String(p.id) === String(id));
  if (idx < 0 || idx >= PRODUCTS.length-1) return;
  const current = PRODUCTS[idx]; const below = PRODUCTS[idx+1];
  const batch = db.batch();
  batch.update(productsRef.doc(current.id), { order: Number(below.order ?? Date.now()) });
  batch.update(productsRef.doc(below.id), { order: Number(current.order ?? Date.now()) });
  batch.commit().catch(err=>console.error('Error swap order',err));
}
function adminNormalizeOrder() {
  if (!confirm("Normalizará el orden de todos los productos (1,2,3...). ¿Continuar?")) return;
  const batch = db.batch();
  PRODUCTS.forEach((p,i)=> batch.update(productsRef.doc(p.id), { order: i+1 }));
  batch.commit().then(()=> showToast('Orden normalizado correctamente.')).catch(err=>{ console.error(err); alert('Error normalizando orden.'); });
}

/* ========== Site title / Bulk ========== */
function loadSiteTitleIntoAdmin() {
  siteConfigRef.get().then(doc => { if (doc && doc.exists) { const data = doc.data(); const input = document.getElementById('adminSiteTitle'); if (input) input.value = data.siteTitle || ''; } }).catch(err=>console.error('Error cargando siteTitle:',err));
}
function saveSiteTitle(newTitle) { return siteConfigRef.set({ siteTitle: String(newTitle) }); }

function loadBulkIntoAdmin() {
  const enabled = document.getElementById('bulkEnabled'); const minInput = document.getElementById('bulkMinItems');
  const percentInput = document.getElementById('bulkPercent'); const applyToSel = document.getElementById('bulkApplyTo');
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
  bulkRef.set(payload).then(()=> showToast('Configuración de descuento guardada correctamente.')).catch(err=>{ console.error(err); alert('Error guardando bulk.'); });
}

/* ========== Floating bubbles (cart + WhatsApp) ========== */
function updateCartBubble() {
  const badge = document.getElementById('cartBubbleBadge');
  if (!badge) return;
  const count = cart.reduce((sum, it) => sum + (Number(it.cantidad) || 0), 0);
  badge.textContent = count;
  badge.style.display = count > 0 ? 'inline-flex' : 'none';
}
function cartBubbleHandler() { showSection('carrito'); const cont = document.getElementById('cartContainer'); if (cont) cont.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function whatsappBubbleHandler() {
  const phone = "573243052782";
  const defaultMessage = "¡Hola! Me interesa recibir información sobre ElectroFlips Xperience. ¿Me ayudas, por favor?";
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(defaultMessage)}`, "_blank");
}
(function bindFloatingBubbles() {
  // bindings are set in DOMContentLoaded below to ensure elements exist; keep this here for reference
  window.updateCartBubble = updateCartBubble;
})();

/* ========== Responsive helpers ========== */
(function ensureCompactPromosOnMobile(){
  function updateLayout() {
    const isMobile = window.matchMedia('(max-width:720px)').matches;
    document.documentElement.classList.toggle('compact-promos', isMobile);
    const isInicioActive = document.querySelector('#inicio.active') !== null;
    if (isInicioActive) {
      try { renderHomeExtras(); } catch(e){ /* ignore */ }
    }
  }
  updateLayout();
  let t; window.addEventListener('resize', ()=>{ clearTimeout(t); t = setTimeout(updateLayout, 120); });
  const promosContainer = document.getElementById('promosContainer');
  if (promosContainer) {
    const mo = new MutationObserver(()=> {
      if (window.matchMedia('(max-width:720px)').matches) {
        clearTimeout(t); t = setTimeout(()=> {
          promosContainer.querySelectorAll('.promo-detailed-card').forEach(card => { card.style.maxWidth = '100%'; card.style.boxSizing = 'border-box'; });
        }, 80);
      }
    });
    mo.observe(promosContainer, { childList: true, subtree: true });
  }
})();

/* ========== Mobile sidebar and hamburger ========== */
function setupMobileNavBindings() {
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

  if (hamburger) hamburger.addEventListener('click', openMobileNav);
  if (closeBtn) closeBtn.addEventListener('click', closeMobileNav);
  if (overlay) overlay.addEventListener('click', closeMobileNav);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMobileNav(); });

  function syncBrandText() {
    if (!brandMobile) return;
    if (brandDesktop) brandMobile.textContent = brandDesktop.textContent || brandMobile.textContent;
  }
  syncBrandText();
  if (brandDesktop && brandMobile) {
    const mo = new MutationObserver(syncBrandText);
    mo.observe(brandDesktop, { childList: true, characterData: true, subtree: true });
  }
  window.closeMobileNav = closeMobileNav;
  window.openMobileNav = openMobileNav;
}

/* ========== DOMContentLoaded bindings ========== */
document.addEventListener('DOMContentLoaded', () => {
  renderCatalog();
  renderHomeExtras();
  renderAdminPanel();


function setupMobileColumnsControl() {
  const controlsWrap = document.querySelector('.catalog-controls');
  if (!controlsWrap) return;

  // evitar duplicar control
  if (document.getElementById('mobileColumnsSelect')) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'mobile-columns-control';
  wrapper.innerHTML = `
    <label for="mobileColumnsSelect">Productos/ fila (móvil)</label>
    <select id="mobileColumnsSelect" aria-label="Productos por fila en móvil">
      <option value="1">1</option>
      <option value="2">2</option>
      <option value="3">3</option>
      <option value="4">4</option>
    </select>
  `;
  controlsWrap.appendChild(wrapper);

  const select = document.getElementById('mobileColumnsSelect');
  // cargar preferencia previa
  const saved = Number(localStorage.getItem('catalog_mobile_columns')) || parseInt(getComputedStyle(document.documentElement).getPropertyValue('--mobile-columns')) || 2;
  if ([1,2,3,4].includes(saved)) {
    select.value = String(saved);
    document.documentElement.style.setProperty('--mobile-columns', String(saved));
  }

  select.addEventListener('change', (e) => {
    const v = Number(e.target.value) || 2;
    document.documentElement.style.setProperty('--mobile-columns', String(v));
    localStorage.setItem('catalog_mobile_columns', String(v));
    // re-render por si hace falta (opcional)
    try { renderCatalog(); } catch (err) { /* ignore */ }
  });
}


  // Login/logout
  const loginForm = document.getElementById('adminLoginForm'); if (loginForm) loginForm.onsubmit = adminLogin;
  const logoutBtn = document.getElementById('adminLogoutBtn'); if (logoutBtn) logoutBtn.onclick = adminLogout;

  // add/edit product forms
  const addForm = document.getElementById('addProductForm'); if (addForm) addForm.onsubmit = adminAddProduct;
  const editForm = document.getElementById('editProductForm'); if (editForm) editForm.onsubmit = adminEditProduct;
  const editCancel = document.getElementById('editCancelBtn'); if (editCancel) editCancel.onclick = adminCancelEdit;

  // Save site title
  const saveSiteTitleBtn = document.getElementById('saveSiteTitleBtn');
  if (saveSiteTitleBtn) {
    saveSiteTitleBtn.onclick = () => {
      const input = document.getElementById('adminSiteTitle');
      if (!input) return;
      saveSiteTitle(input.value.trim()).then(() => {
        const el = document.getElementById('brandNeon');
        if (el) el.textContent = input.value.trim() || 'ElectroFlips Xperience';
        showToast('Título guardado.');
      }).catch(err => { console.error('Error guardando title:', err); alert('Error guardando título. Revisa la consola.'); });
    };
  }

  // Bulk
  const saveBulkBtn = document.getElementById('saveBulkBtn'); if (saveBulkBtn) saveBulkBtn.onclick = saveBulkFromAdmin;

  // Promo save binding (in case not using inline)
  const promoSaveBtn = document.querySelector('#promoForm button[onclick="savePromoFromAdmin()"]');
  if (promoSaveBtn) promoSaveBtn.onclick = savePromoFromAdmin;

  // Modal close by clicking outside
  const modal = document.getElementById('productModal');
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeProductModal(); });

  // Setup mobile nav bindings
  setupMobileNavBindings();

  // Bind floating bubbles if they exist
  const cartBtn = document.getElementById('cartBubbleBtn');
  const wsBtn = document.getElementById('whatsappBubbleBtn');
  if (cartBtn) cartBtn.addEventListener('click', cartBubbleHandler);
  if (wsBtn) wsBtn.addEventListener('click', whatsappBubbleHandler);
  updateCartBubble();

  // Mobile class setup
  (function setupMobileClass(){
    function updateMobileClass() {
      const isMobile = window.matchMedia && window.matchMedia('(max-width: 720px)').matches;
      if (isMobile) document.documentElement.classList.add('is-mobile');
      else document.documentElement.classList.remove('is-mobile');
    }
    updateMobileClass();
    window.addEventListener('resize', () => {
      clearTimeout(window.__mobileClassTimeout);
      window.__mobileClassTimeout = setTimeout(updateMobileClass, 120);
    });
  })();
});








/* tutorial.js (versión centrada, con glow en botones carrito/whatsapp,
   comportamiento de cierre en "No, gracias" / "Saltar" / "Finalizar",
   y permite que los botones del tutorial sean clicables aun cuando el recuadro
   esté sobre la parte que se está explicando).
   - Diseñado para cargarse DESPUÉS de app.js (usa showSection/renderCatalog/renderCart si existen).
   - Colocar en la raíz del proyecto o en assets/ y enlazar en index.html.
*/
(function () {
  if (window.__electroflips_tutorial_installed_centered_v2) return;
  window.__electroflips_tutorial_installed_centered_v2 = true;

  const STEPS = [
    {
      id: 'zoom',
      title: 'Mejor visualización',
      text: 'Recomendamos usar zoom del navegador al 80% para una mejor visualización en escritorio. Puedes cambiarlo desde el menú del navegador (Ctrl/Cmd + -).'
    },
    {
      id: 'nav',
      selector: 'nav.main-nav',
      title: 'Navegación principal',
      text: 'Usa la barra de navegación para moverte entre Inicio, Catálogo, Carrito y Contacto.'
    },
    {
      id: 'favorites',
      selector: '#favoritesContainer',
      title: 'Favoritos',
      text: 'En Favoritos verás servicios destacados. Toca uno para ver detalles.'
    },
    {
      id: 'promos',
      selector: '#promosContainer',
      title: 'Promociones',
      text: 'Aquí se muestran promociones. Usa "Ver en catálogo" para navegar al producto en el catálogo.'
    },
    {
      id: 'catalog_open',

      title: 'Catálogo (abierto)',
      text: 'Abrimos el catálogo para que veas las funciones: filtrar, ver detalles y comprar. Cuando pulses Comprar el producto se agregará al carrito.',
      action: function () {
        if (typeof showSection === 'function') try { showSection('catalogo'); } catch (e) {}
        if (typeof renderCatalog === 'function') try { renderCatalog(); } catch (e) {}
      }
    },
    {
      id: 'productCard',
      selector: '.product-card',
      title: 'Tarjetas de producto',
      text: 'Cada tarjeta muestra imagen, nombre y precio. Usa "Mas Info" para ver el detalle o "Comprar" para agregar el producto al carrito. (Después debes abrir el Carrito para ver los productos que vas a comprar.)'
    },
    {
      id: 'productModal',
      title: 'Detalles del producto (ejemplo)',
      text: 'Al abrir "Mas Info" verás un modal con la imagen ampliada, descripción y el botón Comprar. Si el producto está agotado no podrás comprarlo.'
    },
    {
      id: 'cart_open',
      selector: '#cartBubbleBtn',
      title: 'Carrito (abierto)',
      text: 'Abrimos el carrito para que veas cómo cambiar cantidades, eliminar productos y finalizar compra. Recuerda: al dar click en Comprar el producto se añade al carrito; luego debes dar click en el botón Carrito para revisar y finalizar.',
      action: function () {
        if (typeof showSection === 'function') try { showSection('carrito'); } catch (e) {}
        if (typeof renderCart === 'function') try { renderCart(); } catch (e) {}
      },
      glowSelector: '#cartBubbleBtn'
    },
    {
      id: 'whatsapp_glow',
      selector: '#whatsappBubbleBtn',
      title: 'Contacto por WhatsApp',
      text: 'Este botón abre un chat de WhatsApp con la tienda. Puedes hacer preguntas o finalizar tu compra. Mientras explicamos, el botón se iluminará para llamar la atención.',
      glowSelector: '#whatsappBubbleBtn'
    },
    {
      id: 'contact',
      selector: '#contacto',
      title: 'Contacto y redes',
      text: 'En Contacto encontrarás correo, WhatsApp y redes sociales para soporte.'
    },
    {
      id: 'end',
      title: '¡Listo!',
      text: 'Recorrido finalizado. El tutorial se puede cerrar con "Finalizar", "Saltar" o "No, gracias". Si quieres repetirlo ejecuta window.startEfTutorial().'
    }
  ];

  /* Inyecta estilos (si no existen) */
  function injectTutorialStyles() {
    if (document.getElementById('tutorialStyles_centered_v2')) return;
    const css = document.createElement('style');
    css.id = 'tutorialStyles_centered_v2';
    css.innerHTML = `
/* Styles para tutorial centrado y comportamiento interactivo */
#efTutorialOverlay { position: fixed; inset:0; background: rgba(3,6,9,0.55); z-index: 9998; display:none; }
#efTutorialOverlay.visible { display:block; }

/* Tooltip centrado; pointer-events: none permite que clicks pasen al contenido detrás
   excepto en los botones (que tienen pointer-events:auto). Esto permite interactuar
   con elementos de la página aun cuando el tooltip esté encima. */
#efTutorialTooltip {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%,-50%);
  z-index: 9999;
  width: min(720px, 92%);
  max-width: 720px;
  background: linear-gradient(180deg,#0f1318,#0b0b0d);
  color: #fff;
  padding: 16px;
  border-radius: 12px;
  box-shadow: 0 18px 60px rgba(0,0,0,0.7);
  border: 1px solid rgba(255,255,255,0.04);
  font-size: 0.98rem;
  pointer-events: none; /* permite click-through excepto en controles */
}
#efTutorialTooltip h3 { margin:0 0 8px 0; color: var(--neon-pink,#ff295e); }
#efTutBody { color: #cfeee6; line-height:1.35; }

/* Controls son interactivos */
#efTutControls { display:flex; gap:8px; justify-content:flex-end; margin-top:12px; pointer-events: auto; }
#efTutControls .btn.small { padding:6px 10px; font-size:0.88rem; }

/* Prompt inicial */
#efTutorialPrompt {
  position: fixed; left:50%; top:14%; transform:translateX(-50%); z-index:10001;
  width: min(720px,92%); max-width:720px;
  background: linear-gradient(180deg,#0f1318,#0b0b0d);
  color:#fff; padding:16px; border-radius:12px; border:1px solid rgba(255,255,255,0.04);
  box-shadow:0 18px 60px rgba(0,0,0,0.7); display:none;
  pointer-events: auto;
}
#efTutorialPrompt.open { display:block; }

/* Highlight en elementos (sombra + outline) */
.ef-tut-highlight {
  position: relative;
  z-index: 10002 !important;
  box-shadow: 0 18px 60px rgba(255,41,94,0.12) !important;
  outline: 3px solid rgba(255,41,94,0.12) !important;
  border-radius: 10px;
  transform: translateY(-4px);
  transition: box-shadow 220ms ease, outline 220ms ease, transform 220ms ease;
}

/* Glow pulsante para botones (carrito / whatsapp) */
.ef-tut-glow {
  animation: efGlowPulse 1.6s infinite;
  box-shadow: 0 12px 40px rgba(255,41,94,0.18), 0 6px 26px rgba(255,41,94,0.12);
  transform: translateY(-2px);
}
@keyframes efGlowPulse {
  0% { transform: scale(1); box-shadow: 0 8px 24px rgba(255,41,94,0.12); }
  50% { transform: scale(1.06); box-shadow: 0 18px 54px rgba(255,41,94,0.22); }
  100% { transform: scale(1); box-shadow: 0 8px 24px rgba(255,41,94,0.12); }
}

/* Mobile: tooltip centrado y ancho completo */
@media (max-width:720px) {
  #efTutorialTooltip { width: calc(100% - 24px); left: 50%; top: 50%; transform: translate(-50%,-50%); }
  #efTutorialPrompt { width: calc(100% - 24px); top: 8%; left: 50%; transform: translateX(-50%); }
}
    `;
    document.head.appendChild(css);
  }

  /* Crea DOM del tutorial */
  function createTutorialDom() {
    if (document.getElementById('efTutorialOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'efTutorialOverlay';

    const tooltip = document.createElement('div');
    tooltip.id = 'efTutorialTooltip';
    tooltip.innerHTML = `
      <h3 id="efTutTitle"></h3>
      <div id="efTutBody"></div>
      <div id="efTutControls">
        <button id="efTutPrev" class="btn small">Anterior</button>
        <button id="efTutNext" class="btn small">Siguiente</button>
        <button id="efTutSkip" class="btn small" style="background:#bbb;color:#222;">Saltar</button>
      </div>
    `;

    const prompt = document.createElement('div');
    prompt.id = 'efTutorialPrompt';
    prompt.innerHTML = `
      <div>
        <h3>¿Deseas hacer el tutorial?</h3>
        <p>Recomendamos usar zoom 80% para mejor visualización. El tutorial mostrará cómo usar la página.</p>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">
          <button id="efStartTut" class="btn">Sí, empezar</button>
          <button id="efSkipTut" class="btn" style="background:#bbb;color:#222;">No, gracias</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(tooltip);
    document.body.appendChild(prompt);

    // Bind controls
    document.getElementById('efTutPrev').addEventListener('click', () => showStep(currentIndex - 1));
    document.getElementById('efTutNext').addEventListener('click', () => {
      if (currentIndex >= STEPS.length - 1) return endTutorial();
      showStep(currentIndex + 1);
    });
    document.getElementById('efTutSkip').addEventListener('click', endTutorial);
    document.getElementById('efStartTut').addEventListener('click', () => { closePrompt(); startTutorial(); });
    document.getElementById('efSkipTut').addEventListener('click', endTutorial);

    // Overlay click advances by default
    overlay.addEventListener('click', () => {
      if (!isRunning) return;
      if (currentIndex >= STEPS.length - 1) endTutorial();
      else showStep(currentIndex + 1);
    });

    // Keyboard navigation while running
    document.addEventListener('keydown', (e) => {
      if (!isRunning) return;
      if (e.key === 'Escape') endTutorial();
      if (e.key === 'ArrowRight') {
        if (currentIndex >= STEPS.length - 1) endTutorial();
        else showStep(currentIndex + 1);
      }
      if (e.key === 'ArrowLeft') showStep(currentIndex - 1);
    });
  }

  function openPrompt() {
    const p = document.getElementById('efTutorialPrompt');
    if (!p) return;
    p.classList.add('open');
  }
  function closePrompt() {
    const p = document.getElementById('efTutorialPrompt');
    if (!p) return;
    p.classList.remove('open');
  }

  /* Highlight & glow helpers */
  let highlightedEl = null;
  const activeGlows = new Set();

  function highlightElement(el) {
    clearHighlight();
    if (!el) return;
    highlightedEl = el;
    el.classList.add('ef-tut-highlight');
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }); } catch (e) {}
  }
  function clearHighlight() {
    if (highlightedEl) {
      highlightedEl.classList.remove('ef-tut-highlight');
      highlightedEl = null;
    }
  }

  function addGlow(selector) {
    try {
      const el = document.querySelector(selector);
      if (!el) return;
      el.classList.add('ef-tut-glow');
      activeGlows.add(selector);
    } catch (e) {}
  }
  function removeGlow(selector) {
    try {
      const el = document.querySelector(selector);
      if (!el) return;
      el.classList.remove('ef-tut-glow');
      activeGlows.delete(selector);
    } catch (e) {}
  }
  function clearAllGlows() {
    for (const s of Array.from(activeGlows)) removeGlow(s);
    activeGlows.clear();
  }

  /* Flow control */
  let currentIndex = 0;
  let isRunning = false;

  function startTutorial() {
    injectTutorialStyles();
    createTutorialDom();
    isRunning = true;
    document.getElementById('efTutorialOverlay').classList.add('visible');
    showStep(0);
  }

  function showStep(index) {
    if (index < 0) index = 0;
    if (index >= STEPS.length) { endTutorial(); return; }
    currentIndex = index;
    const step = STEPS[index];

    // Update tooltip content
    const titleEl = document.getElementById('efTutTitle');
    const bodyEl = document.getElementById('efTutBody');
    titleEl.innerText = step.title || '';
    bodyEl.innerText = step.text || '';

    // Update controls visibility/text
    document.getElementById('efTutPrev').style.display = index === 0 ? 'none' : 'inline-block';
    document.getElementById('efTutNext').innerText = (index === STEPS.length - 1) ? 'Finalizar' : 'Siguiente';

    // Clear previous highlights/glows
    clearHighlight();
    clearAllGlows();

    // If step has an action, run it (e.g., open catalog or cart)
    if (typeof step.action === 'function') {
      try { step.action(); } catch (e) { console.error('tutorial step action error', e); }
      // After action, try to highlight the selector (if any)
      setTimeout(() => {
        if (step.selector) {
          const el = document.querySelector(step.selector);
          if (el) highlightElement(el);
        }
        if (step.glowSelector) addGlow(step.glowSelector);
      }, 360);
      return;
    }

    // If step has glowSelector, add glow
    if (step.glowSelector) addGlow(step.glowSelector);

    // Try to highlight the element for the step (but tooltip stays centered)
    if (step.selector) {
      const el = document.querySelector(step.selector);
      if (el) highlightElement(el);
    }
  }









// Reemplaza la función `endTutorial` en tu tutorial.js por esta versión.
// Esta versión elimina completamente el overlay, tooltip y prompt del DOM,
// quita los estilos inyectados y limpia la marca global para que el tutorial
// ya no quede encima de la página después de pulsar "No, gracias", "Saltar" o "Finalizar".

function endTutorial() {
  // marcar como no corriendo para que manejadores ignorados por isRunning queden inactivos
  isRunning = false;

  // limpiar efectos visuales
  try { clearHighlight(); } catch (e) {}
  try { clearAllGlows(); } catch (e) {}

  // cerrar modal de producto si está abierto
  try { if (typeof closeProductModal === 'function') closeProductModal(); } catch (e) {}

  // quitar elementos del DOM para asegurar que no queden encima
  ['efTutorialOverlay', 'efTutorialTooltip', 'efTutorialPrompt'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  });

  // quitar estilos inyectados (si existe)
  const styleIds = ['tutorialStyles_centered_v2', 'tutorialStyles_centered', 'tutorialStyles_centered_v3'];
  styleIds.forEach(sid => {
    const s = document.getElementById(sid);
    if (s && s.parentNode) s.parentNode.removeChild(s);
  });

  // eliminar referencias globales del tutorial para evitar re-entrada inesperada
  try { delete window.startEfTutorial; } catch (e) {}
  try { delete window.endEfTutorial; } catch (e) {}
  try { delete window.__electroflips_tutorial_installed_centered_v2; } catch (e) {}
  try { delete window.__electroflips_tutorial_installed_centered; } catch (e) {}
  try { delete window.__electroflips_tutorial_installed_centered_v3; } catch (e) {}

  // pequeña pausa para asegurar que no queden clases aplicadas
  setTimeout(() => {
    // intentar limpiar cualquier highlight o glow restante por si acaso
    try { document.querySelectorAll('.ef-tut-highlight').forEach(n => n.classList.remove('ef-tut-highlight')); } catch(e){}
    try { document.querySelectorAll('.ef-tut-glow').forEach(n => n.classList.remove('ef-tut-glow')); } catch(e){}
  }, 80);
}






  // Expose controls to console
  window.startEfTutorial = function () { closePrompt(); startTutorial(); };
  window.endEfTutorial = endTutorial;

  // Init on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    injectTutorialStyles();
    createTutorialDom();
    // Delay a bit to avoid races con app.js
    setTimeout(openPrompt, 500);
  });
})();




