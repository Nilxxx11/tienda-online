/* ==================================================================
   ATELIER — admin.js
   Login con Firebase Authentication, CRUD de productos en Realtime
   Database, subida de imágenes a Cloudinary (unsigned upload).
   ================================================================== */

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

let editingProductId = null; // null = creando nuevo
let uploadedImageUrl = '';
let allAdminProducts = [];
let allCategories = [];
const categoriesRef = db.ref('categorias');

/* ---------------- AUTENTICACIÓN ---------------- */
auth.onAuthStateChanged(user => {
  console.log('onAuthStateChanged disparado. Usuario:', user ? user.email : null);
  if (user) {
    document.getElementById('loginScreen').hidden = true;
    document.getElementById('adminApp').hidden = false;
    document.getElementById('userEmail').textContent = user.email;
    console.log('Pantallas alternadas. Llamando loadProducts()...');
    try {
      loadProducts();
    } catch (err) {
      console.error('Error dentro de loadProducts():', err);
    }
  } else {
    document.getElementById('loginScreen').hidden = false;
    document.getElementById('adminApp').hidden = true;
  }
}, error => {
  console.error('Error en onAuthStateChanged:', error);
});

document.getElementById('loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  const submitBtn = e.target.querySelector('button[type="submit"]');

  errorEl.textContent = '';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Entrando…';

  auth.signInWithEmailAndPassword(email, password)
    .then(() => {
      console.log('Login OK');
    })
    .catch(err => {
      console.error('Error de login Firebase:', err.code, err.message);
      errorEl.textContent = traducirErrorAuth(err.code);
    })
    .finally(() => {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Entrar';
    });
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  auth.signOut();
});

function traducirErrorAuth(code){
  const map = {
    'auth/invalid-email': 'Correo inválido.',
    'auth/user-not-found': 'No existe una cuenta con ese correo.',
    'auth/wrong-password': 'Contraseña incorrecta.',
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/too-many-requests': 'Demasiados intentos. Espera un momento.',
    'auth/unauthorized-domain': 'Este dominio/IP no está autorizado en Firebase. Agrégalo en Authentication → Settings → Authorized domains.',
    'auth/network-request-failed': 'Sin conexión con Firebase. Revisa tu internet o el bloqueo de red.'
  };
  return map[code] || `No se pudo iniciar sesión (${code || 'error desconocido'}).`;
}

/* ---------------- CARGA Y RENDER DE PRODUCTOS ---------------- */
const productsRef = db.ref('productos');

function loadProducts(){
  productsRef.on('value', snapshot => {
    const data = snapshot.val() || {};
    allAdminProducts = Object.keys(data).map(key => ({ id: key, ...data[key] }));
    renderTable();
  });
  loadCategories();
}

/* ---------------- CATEGORÍAS ---------------- */
function loadCategories(){
  categoriesRef.on('value', snapshot => {
    const data = snapshot.val() || {};
    if (Array.isArray(data)) {
      allCategories = data.filter(Boolean).sort();
    } else {
      allCategories = Object.values(data).filter(Boolean).sort();
    }
    populateCategorySelect();
  });
}

function populateCategorySelect(){
  const select = document.getElementById('fCategoria');
  const current = select.value;
  select.innerHTML = '<option value="">Sin categoría</option>';
  allCategories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    select.appendChild(opt);
  });
  if (current && allCategories.includes(current)) select.value = current;
}

document.getElementById('showNewCategoryBtn').addEventListener('click', () => {
  document.getElementById('newCategoryRow').hidden = false;
  document.getElementById('showNewCategoryBtn').hidden = true;
  document.getElementById('fNewCategory').focus();
});

document.getElementById('cancelCategoryBtn').addEventListener('click', () => {
  document.getElementById('newCategoryRow').hidden = true;
  document.getElementById('showNewCategoryBtn').hidden = false;
  document.getElementById('fNewCategory').value = '';
});

document.getElementById('addCategoryBtn').addEventListener('click', () => {
  const name = document.getElementById('fNewCategory').value.trim();
  if (!name) return;
  if (allCategories.includes(name)) {
    showToast('Esa categoría ya existe');
    return;
  }
  allCategories.push(name);
  allCategories.sort();
  categoriesRef.set(allCategories);
  document.getElementById('fCategoria').value = name;
  document.getElementById('newCategoryRow').hidden = true;
  document.getElementById('showNewCategoryBtn').hidden = false;
  document.getElementById('fNewCategory').value = '';
  showToast('Categoría agregada');
});

function renderTable(){
  const tbody = document.getElementById('productTableBody');
  const empty = document.getElementById('adminEmpty');
  document.getElementById('productTotal').textContent =
    allAdminProducts.length + (allAdminProducts.length === 1 ? ' producto' : ' productos');

  if (allAdminProducts.length === 0) {
    tbody.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  tbody.innerHTML = '';
  allAdminProducts.forEach(p => {
    const img = (p.imagenes && p.imagenes[0]) || p.imagen || '';
    const stock = getTotalStock(p);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${img ? `<img class="table-thumb" src="${img}" alt="">` : ''}</td>
      <td>${escapeHtml(p.nombre || '—')}</td>
      <td>${escapeHtml(p.categoria || '—')}</td>
      <td>${formatPrice(p.precio)}</td>
      <td><span class="badge-stock ${stock === 0 ? 'zero' : ''}">${stock}</span></td>
      <td>
        <label class="toggle-switch">
          <input type="checkbox" data-id="${p.id}" class="visible-toggle" ${p.activo !== false ? 'checked' : ''}>
          <span class="toggle-track"></span>
        </label>
      </td>
      <td>
        <div class="row-actions">
          <button class="edit-action" data-id="${p.id}">Editar</button>
          <button class="delete-action" data-id="${p.id}">Eliminar</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.edit-action').forEach(btn => {
    btn.addEventListener('click', () => openEditForm(btn.dataset.id));
  });
  tbody.querySelectorAll('.delete-action').forEach(btn => {
    btn.addEventListener('click', () => deleteProduct(btn.dataset.id));
  });
  tbody.querySelectorAll('.visible-toggle').forEach(toggle => {
    toggle.addEventListener('change', () => {
      productsRef.child(toggle.dataset.id).update({ activo: toggle.checked });
    });
  });
}

function getTotalStock(p){
  if (p.tallas && typeof p.tallas === 'object') {
    return Object.values(p.tallas).reduce((sum, v) => sum + (Number(v) || 0), 0);
  }
  return Number(p.stock) || 0;
}

function formatPrice(n){
  const num = Number(n) || 0;
  return (storeConfig.simboloMoneda || '$') + num.toLocaleString('es-CO');
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function deleteProduct(id){
  const p = allAdminProducts.find(x => x.id === id);
  if (!confirm(`¿Eliminar "${p ? p.nombre : 'este producto'}"? Esta acción no se puede deshacer.`)) return;
  productsRef.child(id).remove()
    .then(() => showToast('Producto eliminado'))
    .catch(() => showToast('Error al eliminar', true));
}

/* ---------------- FORMULARIO: CREAR / EDITAR ---------------- */
const formModal = document.getElementById('formModal');

document.getElementById('newProductBtn').addEventListener('click', () => openNewForm());
document.getElementById('formClose').addEventListener('click', closeForm);
document.getElementById('cancelFormBtn').addEventListener('click', closeForm);

function openNewForm(){
  editingProductId = null;
  uploadedImageUrl = '';
  document.getElementById('formTitle').textContent = 'Nuevo producto';
  document.getElementById('productForm').reset();
  document.getElementById('fActivo').checked = true;
  document.getElementById('fCategoria').value = '';
  document.getElementById('newCategoryRow').hidden = true;
  document.getElementById('showNewCategoryBtn').hidden = false;
  resetImageZone();
  formModal.classList.add('open');
}

function openEditForm(id){
  const p = allAdminProducts.find(x => x.id === id);
  if (!p) return;
  editingProductId = id;

  document.getElementById('formTitle').textContent = 'Editar producto';
  document.getElementById('fNombre').value = p.nombre || '';
  document.getElementById('fCategoria').value = p.categoria || '';
  document.getElementById('fPrecio').value = p.precio || '';
  document.getElementById('fPrecioAnterior').value = p.precioAnterior || '';
  document.getElementById('fDescripcion').value = p.descripcion || '';
  document.getElementById('fStock').value = p.stock || '';
  document.getElementById('fDestacado').checked = !!p.destacado;
  document.getElementById('fActivo').checked = p.activo !== false;

  if (p.tallas && typeof p.tallas === 'object') {
    document.getElementById('fTallas').value = Object.entries(p.tallas).map(([k,v]) => `${k}:${v}`).join(', ');
  } else {
    document.getElementById('fTallas').value = '';
  }
  document.getElementById('fColores').value = (p.colores || []).join(', ');

  const img = (p.imagenes && p.imagenes[0]) || p.imagen || '';
  uploadedImageUrl = img;
  if (img) {
    document.getElementById('imagePreview').src = img;
    document.getElementById('imagePreview').hidden = false;
    document.getElementById('uploadPrompt').hidden = true;
  } else {
    resetImageZone();
  }

  formModal.classList.add('open');
}

function closeForm(){
  formModal.classList.remove('open');
}

function resetImageZone(){
  document.getElementById('imagePreview').hidden = true;
  document.getElementById('imagePreview').src = '';
  document.getElementById('uploadPrompt').hidden = false;
  document.getElementById('uploadProgress').hidden = true;
  document.getElementById('fImagenFile').value = '';
  uploadedImageUrl = '';
}

/* ---------------- SUBIDA DE IMAGEN A CLOUDINARY ---------------- */
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fImagenFile');

document.getElementById('browseBtn').addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) uploadImage(fileInput.files[0]);
});

dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) uploadImage(file);
});

async function uploadImage(file){
  if (cloudinaryConfig.cloudName === 'TU_CLOUD_NAME') {
    showToast('Configura Cloudinary en config.js primero', true);
    return;
  }

  document.getElementById('uploadPrompt').hidden = true;
  document.getElementById('imagePreview').hidden = true;
  document.getElementById('uploadProgress').hidden = false;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', cloudinaryConfig.uploadPreset);

  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (data.secure_url) {
      uploadedImageUrl = data.secure_url;
      document.getElementById('imagePreview').src = uploadedImageUrl;
      document.getElementById('imagePreview').hidden = false;
      document.getElementById('uploadProgress').hidden = true;
      showToast('Imagen subida correctamente');
    } else {
      throw new Error(data.error?.message || 'Error desconocido');
    }
  } catch (err) {
    console.error('Error subiendo a Cloudinary:', err);
    document.getElementById('uploadProgress').hidden = true;
    document.getElementById('uploadPrompt').hidden = false;
    showToast('No se pudo subir la imagen. Revisa tu configuración de Cloudinary.', true);
  }
}

/* ---------------- GUARDAR PRODUCTO ---------------- */
document.getElementById('productForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const nombre = document.getElementById('fNombre').value.trim();
  const precio = Number(document.getElementById('fPrecio').value);

  if (!nombre || !precio) {
    showToast('Completa nombre y precio', true);
    return;
  }
  if (!uploadedImageUrl) {
    showToast('Agrega una imagen del producto', true);
    return;
  }

  // Parsear tallas: "S:5, M:8, L:3" → { S:5, M:8, L:3 }
  const tallasRaw = document.getElementById('fTallas').value.trim();
  let tallas = null;
  if (tallasRaw) {
    tallas = {};
    tallasRaw.split(',').forEach(pair => {
      const [talla, cantidad] = pair.split(':').map(s => s.trim());
      if (talla) tallas[talla] = Number(cantidad) || 0;
    });
  }

  const coloresRaw = document.getElementById('fColores').value.trim();
  const colores = coloresRaw ? coloresRaw.split(',').map(c => c.trim()).filter(Boolean) : null;

  const productData = {
    nombre,
    categoria: document.getElementById('fCategoria').value.trim() || null,
    precio,
    precioAnterior: Number(document.getElementById('fPrecioAnterior').value) || null,
    descripcion: document.getElementById('fDescripcion').value.trim() || null,
    imagenes: [uploadedImageUrl],
    tallas,
    colores,
    stock: tallas ? null : (Number(document.getElementById('fStock').value) || 0),
    destacado: document.getElementById('fDestacado').checked,
    activo: document.getElementById('fActivo').checked,
    actualizado: firebase.database.ServerValue.TIMESTAMP
  };

  // Limpiar campos null para no ensuciar la base de datos
  Object.keys(productData).forEach(key => {
    if (productData[key] === null) delete productData[key];
  });

  const saveBtn = document.getElementById('saveProductBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Guardando…';

  try {
    if (editingProductId) {
      await productsRef.child(editingProductId).update(productData);
      showToast('Producto actualizado');
    } else {
      productData.creado = firebase.database.ServerValue.TIMESTAMP;
      await productsRef.push(productData);
      showToast('Producto creado');
    }
    closeForm();
  } catch (err) {
    console.error(err);
    showToast('Error al guardar. Revisa las reglas de Firebase.', true);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Guardar producto';
  }
});

/* ---------------- TOAST ---------------- */
let toastTimer;
function showToast(msg, isError){
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.toggle('error', !!isError);
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}
