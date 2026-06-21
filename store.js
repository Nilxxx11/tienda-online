/* ==================================================================
   ATELIER — store.js
   Lee productos de Firebase Realtime Database, maneja carrito en
   memoria (no localStorage, según restricción del entorno de
   artifacts — pero este es un sitio standalone así que en tu propio
   hosting SÍ puedes usar localStorage si quieres persistencia entre
   sesiones. Aquí lo dejamos en memoria de sesión por simplicidad.)
   ================================================================== */

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let allProducts = [];
let currentCategory = "all";
let cart = []; // { id, name, price, img, qty, size, color, ref }
let activeProduct = null;
let modalQty = 1;
let modalSelectedSize = null;
let modalSelectedColor = null;

document.getElementById('year').textContent = new Date().getFullYear();
document.getElementById('logoText').textContent = storeConfig.nombre || 'ATELIER';
document.getElementById('footerName').textContent = storeConfig.nombre || 'ATELIER';
document.getElementById('whatsappFloat').href = `https://wa.me/${storeConfig.whatsappNumero}`;
document.title = (storeConfig.nombre || 'ATELIER') + ' — Tienda';

/* Marquee: velocidad constante independiente del viewport */
(function fixMarqueeSpeed(){
  const track = document.querySelector('.marquee-track');
  if (!track) return;
  const speed = 80; // pixeles por segundo
  function update(){
    const w = track.scrollWidth / 2;
    const dur = w / speed;
    track.style.animationDuration = dur + 's';
  }
  update();
  window.addEventListener('resize', update);
})();

function formatPrice(n){
  const num = Number(n) || 0;
  return storeConfig.simboloMoneda + num.toLocaleString('es-CO');
}

/* ---------------- CARGA DE PRODUCTOS DESDE FIREBASE ---------------- */
const productsRef = db.ref('productos');

productsRef.on('value', (snapshot) => {
  const data = snapshot.val();
  document.getElementById('loadingState').hidden = true;

  allProducts = [];
  if (data) {
    Object.keys(data).forEach(key => {
      const p = data[key];
      if (p.activo !== false) { // por defecto visible salvo que se desactive explícitamente
        allProducts.push({ id: key, ...p });
      }
    });
  }

  renderCatalog();
}, (error) => {
  document.getElementById('loadingState').hidden = true;
  console.error('Error leyendo Firebase:', error);
  document.getElementById('emptyState').hidden = false;
  document.querySelector('#emptyState p').textContent = 'No se pudo conectar con la tienda.';
});

/* ---------------- CATEGORÍAS ---------------- */
db.ref('categorias').on('value', snapshot => {
  const data = snapshot.val() || {};
  let savedCats = [];
  if (Array.isArray(data)) {
    savedCats = data.filter(Boolean);
  } else {
    savedCats = Object.values(data).filter(Boolean);
  }

  const productCats = new Set();
  allProducts.forEach(p => { if (p.categoria) productCats.add(p.categoria); });
  const allCats = [...new Set([...savedCats, ...productCats])].sort();

  const list = document.getElementById('categoryList');
  list.innerHTML = `<button class="category-item ${currentCategory==='all'?'active':''}" data-cat="all">Todo</button>`;

  allCats.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'category-item' + (currentCategory === cat ? ' active' : '');
    btn.dataset.cat = cat;
    btn.textContent = cat;
    list.appendChild(btn);
  });

  list.querySelectorAll('.category-item').forEach(btn => {
    btn.addEventListener('click', () => {
      currentCategory = btn.dataset.cat;
      list.querySelectorAll('.category-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderCatalog();
      closeCategoryPanel();
    });
  });
});

/* ---------------- RENDER CATÁLOGO ---------------- */
function renderCatalog(){
  const grid = document.getElementById('catalogGrid');
  const empty = document.getElementById('emptyState');
  grid.innerHTML = '';

  const filtered = currentCategory === 'all'
    ? allProducts
    : allProducts.filter(p => p.categoria === currentCategory);

  document.getElementById('catalogCount').textContent =
    filtered.length + (filtered.length === 1 ? ' pieza' : ' piezas');

  if (filtered.length === 0) {
    empty.hidden = false;
    document.querySelector('#emptyState p').textContent = 'No hay productos en esta categoría.';
    return;
  }
  empty.hidden = true;

  filtered.forEach(p => {
    const card = document.createElement('div');
    card.className = 'product-card';
    const img = (p.imagenes && p.imagenes[0]) || p.imagen || '';
    const stockTotal = getTotalStock(p);

    card.innerHTML = `
      <div class="product-card-img">
        ${img ? `<img src="${img}" alt="${escapeHtml(p.nombre)}" loading="lazy">` : ''}
        ${stockTotal === 0 ? '<span class="product-card-badge">Agotado</span>' : (p.destacado ? '<span class="product-card-badge">Nuevo</span>' : '')}
      </div>
      <div class="product-card-body">
        <p class="product-card-name">${escapeHtml(p.nombre || 'Producto')}</p>
        <p class="product-card-price">
          ${p.precioAnterior ? `<span class="old">${formatPrice(p.precioAnterior)}</span>` : ''}
          ${formatPrice(p.precio)}
        </p>
      </div>
    `;
    card.addEventListener('click', () => openProductModal(p));
    grid.appendChild(card);
  });
}

function getTotalStock(p){
  if (p.tallas && typeof p.tallas === 'object') {
    return Object.values(p.tallas).reduce((sum, v) => sum + (Number(v) || 0), 0);
  }
  return p.stock !== undefined ? Number(p.stock) : 99;
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

/* ---------------- MODAL DE PRODUCTO ---------------- */
const productModal = document.getElementById('productModal');

function openProductModal(p){
  activeProduct = p;
  modalQty = 1;
  modalSelectedSize = null;
  modalSelectedColor = null;

  const img = (p.imagenes && p.imagenes[0]) || p.imagen || '';
  document.getElementById('modalImg').src = img;
  document.getElementById('modalImg').alt = p.nombre || '';
  document.getElementById('modalRef').textContent = 'REF. ' + p.id.slice(-6).toUpperCase();
  document.getElementById('modalTitle').textContent = p.nombre || 'Producto';
  document.getElementById('modalPrice').textContent = formatPrice(p.precio);
  document.getElementById('modalDesc').textContent = p.descripcion || '';
  document.getElementById('qtyValue').textContent = '1';

  // Tallas
  const sizeGroup = document.getElementById('modalSizeGroup');
  const sizePills = document.getElementById('modalSizePills');
  sizePills.innerHTML = '';
  if (p.tallas && typeof p.tallas === 'object' && Object.keys(p.tallas).length) {
    sizeGroup.hidden = false;
    Object.keys(p.tallas).forEach(size => {
      const stock = Number(p.tallas[size]) || 0;
      const pill = document.createElement('button');
      pill.className = 'option-pill';
      pill.textContent = size;
      pill.disabled = stock === 0;
      if (stock === 0) pill.style.opacity = '0.35';
      pill.addEventListener('click', () => {
        modalSelectedSize = size;
        sizePills.querySelectorAll('.option-pill').forEach(b => b.classList.remove('active'));
        pill.classList.add('active');
        updateStockNote();
      });
      sizePills.appendChild(pill);
    });
  } else {
    sizeGroup.hidden = true;
  }

  // Colores
  const colorGroup = document.getElementById('modalColorGroup');
  const colorPills = document.getElementById('modalColorPills');
  colorPills.innerHTML = '';
  if (p.colores && Array.isArray(p.colores) && p.colores.length) {
    colorGroup.hidden = false;
    p.colores.forEach(color => {
      const pill = document.createElement('button');
      pill.className = 'option-pill';
      pill.textContent = color;
      pill.addEventListener('click', () => {
        modalSelectedColor = color;
        colorPills.querySelectorAll('.option-pill').forEach(b => b.classList.remove('active'));
        pill.classList.add('active');
      });
      colorPills.appendChild(pill);
    });
  } else {
    colorGroup.hidden = true;
  }

  updateStockNote();
  productModal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function updateStockNote(){
  const note = document.getElementById('stockNote');
  const addBtn = document.getElementById('modalAddBtn');
  const total = getTotalStock(activeProduct);

  if (total === 0) {
    note.textContent = 'Producto agotado por ahora.';
    addBtn.disabled = true;
    return;
  }
  addBtn.disabled = false;

  if (activeProduct.tallas && modalSelectedSize) {
    const stockTalla = Number(activeProduct.tallas[modalSelectedSize]) || 0;
    note.textContent = stockTalla > 0 ? `${stockTalla} disponibles en talla ${modalSelectedSize}` : 'Sin stock en esta talla';
    addBtn.disabled = stockTalla === 0;
  } else if (activeProduct.tallas) {
    note.textContent = 'Selecciona una talla';
  } else {
    note.textContent = '';
  }
}

document.getElementById('modalClose').addEventListener('click', closeProductModal);
productModal.addEventListener('click', (e) => { if (e.target === productModal) closeProductModal(); });

function closeProductModal(){
  productModal.classList.remove('open');
  document.body.style.overflow = '';
}

document.getElementById('qtyMinus').addEventListener('click', () => {
  if (modalQty > 1) { modalQty--; document.getElementById('qtyValue').textContent = modalQty; }
});
document.getElementById('qtyPlus').addEventListener('click', () => {
  modalQty++; document.getElementById('qtyValue').textContent = modalQty;
});

document.getElementById('modalAddBtn').addEventListener('click', () => {
  if (!activeProduct) return;

  if (activeProduct.tallas && Object.keys(activeProduct.tallas).length && !modalSelectedSize) {
    showToast('Selecciona una talla');
    return;
  }
  if (activeProduct.colores && activeProduct.colores.length && !modalSelectedColor) {
    showToast('Selecciona un color');
    return;
  }

  addToCart(activeProduct, modalQty, modalSelectedSize, modalSelectedColor);
  closeProductModal();
  showToast('¡Agregado! ✦');
  bounceCartIcon();
  openCart();
});

function bounceCartIcon(){
  const trigger = document.getElementById('cartTrigger');
  trigger.classList.remove('bounce');
  void trigger.offsetWidth; // reinicia la animación si se hace click rápido varias veces
  trigger.classList.add('bounce');
}

/* ---------------- CARRITO ---------------- */
function addToCart(p, qty, size, color){
  const img = (p.imagenes && p.imagenes[0]) || p.imagen || '';
  const lineId = p.id + '|' + (size || '') + '|' + (color || '');
  const existing = cart.find(item => item.lineId === lineId);

  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({
      lineId,
      id: p.id,
      name: p.nombre,
      price: Number(p.precio) || 0,
      img,
      qty,
      size,
      color,
      ref: p.id.slice(-6).toUpperCase()
    });
  }
  renderCart();
}

function renderCart(){
  const itemsWrap = document.getElementById('cartItems');
  const emptyMsg = document.getElementById('cartEmptyMsg');
  const footer = document.getElementById('cartFooter');
  const countBadge = document.getElementById('cartCount');

  const totalQty = cart.reduce((s, i) => s + i.qty, 0);
  countBadge.textContent = totalQty;
  countBadge.style.display = totalQty > 0 ? 'flex' : 'none';

  if (cart.length === 0) {
    emptyMsg.style.display = 'block';
    footer.hidden = true;
    itemsWrap.querySelectorAll('.cart-item').forEach(el => el.remove());
    return;
  }

  emptyMsg.style.display = 'none';
  footer.hidden = false;
  itemsWrap.innerHTML = '';

  let total = 0;
  cart.forEach(item => {
    total += item.price * item.qty;
    const row = document.createElement('div');
    row.className = 'cart-item';
    row.innerHTML = `
      <img class="cart-item-img" src="${item.img}" alt="${escapeHtml(item.name)}">
      <div>
        <p class="cart-item-name">${escapeHtml(item.name)}</p>
        <p class="cart-item-meta">REF. ${item.ref}${item.size ? ' · Talla ' + item.size : ''}${item.color ? ' · ' + item.color : ''}</p>
        <p class="cart-item-price">${formatPrice(item.price * item.qty)}</p>
        <div class="cart-item-qty">
          <button data-action="minus">&minus;</button>
          <span>${item.qty}</span>
          <button data-action="plus">+</button>
        </div>
      </div>
      <button class="cart-item-remove" data-action="remove">Quitar</button>
    `;
    row.querySelector('[data-action="minus"]').addEventListener('click', () => changeQty(item.lineId, -1));
    row.querySelector('[data-action="plus"]').addEventListener('click', () => changeQty(item.lineId, 1));
    row.querySelector('[data-action="remove"]').addEventListener('click', () => removeFromCart(item.lineId));
    itemsWrap.appendChild(row);
  });

  document.getElementById('cartTotal').textContent = formatPrice(total);
}

function changeQty(lineId, delta){
  const item = cart.find(i => i.lineId === lineId);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    removeFromCart(lineId);
  } else {
    renderCart();
  }
}

function removeFromCart(lineId){
  cart = cart.filter(i => i.lineId !== lineId);
  renderCart();
}

/* ---------------- ABRIR/CERRAR PANELES ---------------- */
const cartPanel = document.getElementById('cartPanel');
const cartOverlay = document.getElementById('cartOverlay');
const categoryPanel = document.getElementById('categoryPanel');
const categoryOverlay = document.getElementById('categoryOverlay');

function openCart(){
  cartPanel.classList.add('open');
  cartOverlay.classList.add('show');
}
function closeCart(){
  cartPanel.classList.remove('open');
  cartOverlay.classList.remove('show');
}
document.getElementById('cartTrigger').addEventListener('click', openCart);
document.getElementById('closeCart').addEventListener('click', closeCart);
cartOverlay.addEventListener('click', closeCart);

function openCategoryPanel(){
  categoryPanel.classList.add('open');
  categoryOverlay.classList.add('show');
}
function closeCategoryPanel(){
  categoryPanel.classList.remove('open');
  categoryOverlay.classList.remove('show');
}
document.getElementById('menuTrigger').addEventListener('click', openCategoryPanel);
document.getElementById('closeCategoryPanel').addEventListener('click', closeCategoryPanel);
categoryOverlay.addEventListener('click', closeCategoryPanel);

/* ---------------- TOAST ---------------- */
let toastTimer;
function showToast(msg){
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

/* ---------------- CHECKOUT → WHATSAPP ---------------- */
document.getElementById('checkoutBtn').addEventListener('click', () => {
  if (cart.length === 0) return;

  const note = document.getElementById('cartNote').value.trim();
  let total = 0;

  let msg = `¡Hola! Quiero hacer este pedido en *${storeConfig.nombre}*:\n\n`;

  cart.forEach((item, idx) => {
    const subtotal = item.price * item.qty;
    total += subtotal;
    msg += `${idx + 1}. *${item.name}* (REF. ${item.ref})\n`;
    if (item.size) msg += `   Talla: ${item.size}\n`;
    if (item.color) msg += `   Color: ${item.color}\n`;
    msg += `   Cantidad: ${item.qty} — ${formatPrice(subtotal)}\n\n`;
  });

  msg += `*Total: ${formatPrice(total)}*\n`;

  if (note) {
    msg += `\nNota: ${note}\n`;
  }

  msg += `\n¿Está disponible? Quedo atento para coordinar el pago y la entrega.`;

  const url = `https://wa.me/${storeConfig.whatsappNumero}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
});
