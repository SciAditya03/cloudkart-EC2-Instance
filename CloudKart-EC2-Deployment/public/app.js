/* CloudKart storefront - talks to the Node.js backend on the same EC2 instance. */

const state = {
  products: [],
  category: 'All',
  query: '',
  cart: loadCart()
};

const $ = sel => document.querySelector(sel);
const money = n => '₹' + n.toLocaleString('en-IN');

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem('cloudkart-cart')) || {};
  } catch {
    return {};
  }
}

function saveCart() {
  try {
    localStorage.setItem('cloudkart-cart', JSON.stringify(state.cart));
  } catch { /* private mode - cart stays in memory only */ }
}

async function api(path, options) {
  const res = await fetch(path, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

/* ------------------------------ rendering ------------------------------ */

function renderCategories(categories) {
  $('#categories').innerHTML = categories.map(c =>
    `<button class="chip" data-cat="${c}" aria-pressed="${c === state.category}">${c}</button>`
  ).join('');
}

function renderProducts() {
  const grid = $('#grid');
  if (state.products.length === 0) {
    grid.innerHTML = '<p class="muted">No products matched your search.</p>';
    return;
  }
  grid.innerHTML = state.products.map(p => `
    <article class="card">
      <div class="thumb" aria-hidden="true">${p.emoji}</div>
      <h3>${p.name}</h3>
      <p class="desc">${p.description}</p>
      <div class="meta">
        <span class="price">${money(p.price)}</span>
        <span class="rating">★ ${p.rating}</span>
      </div>
      <span class="stock ${p.stock <= 10 ? 'low' : ''}">${p.stock > 0 ? p.stock + ' in stock' : 'Out of stock'}</span>
      <button data-add="${p.id}" ${p.stock === 0 ? 'disabled' : ''}>Add to cart</button>
    </article>
  `).join('');
}

function cartLines() {
  return Object.entries(state.cart).map(([id, qty]) => {
    const product = state.products.find(p => p.id === Number(id));
    return product ? { product, qty } : null;
  }).filter(Boolean);
}

function renderCart() {
  const lines = cartLines();
  const count = Object.values(state.cart).reduce((a, b) => a + b, 0);
  $('#cart-count').textContent = count;

  $('#cart-items').innerHTML = lines.length === 0
    ? '<p class="muted" style="padding:16px 0">Your cart is empty.</p>'
    : lines.map(({ product, qty }) => `
      <div class="cart-row">
        <span aria-hidden="true">${product.emoji}</span>
        <span class="name">${product.name}<br><span class="muted">${money(product.price)}</span></span>
        <span class="qty">
          <button data-dec="${product.id}" aria-label="Decrease quantity">−</button>
          <span>${qty}</span>
          <button data-inc="${product.id}" aria-label="Increase quantity">+</button>
        </span>
      </div>`).join('');

  const subtotal = lines.reduce((sum, l) => sum + l.product.price * l.qty, 0);
  const shipping = subtotal === 0 || subtotal >= 2000 ? 0 : 99;
  $('#subtotal').textContent = money(subtotal);
  $('#shipping').textContent = shipping === 0 ? 'Free' : money(shipping);
  $('#total').textContent = money(subtotal + shipping);
  $('#checkout-btn').disabled = lines.length === 0;
}

/* ------------------------------- loading ------------------------------- */

async function loadProducts() {
  const params = new URLSearchParams({ category: state.category });
  if (state.query) params.set('q', state.query);
  const data = await api('/api/products?' + params);
  state.products = data.products;
  renderProducts();
  renderCart();
}

async function showServerInfo() {
  try {
    const health = await api('/api/health');
    $('#server-line').textContent =
      `backend: ${health.status} · served by ${health.host} · ${health.platform} · uptime ${health.uptimeSeconds}s`;
  } catch {
    $('#server-line').textContent = 'backend unreachable';
  }
}

/* ------------------------------ interaction ---------------------------- */

function setCartOpen(open) {
  $('#cart-panel').classList.toggle('open', open);
  $('#cart-panel').setAttribute('aria-hidden', String(!open));
  $('#overlay').hidden = !open;
}

document.addEventListener('click', e => {
  const add = e.target.closest('[data-add]');
  if (add) {
    const id = add.dataset.add;
    state.cart[id] = (state.cart[id] || 0) + 1;
    saveCart();
    renderCart();
    // Deliberately do not open the cart panel here - its overlay would swallow
    // the next "Add to cart" click. The badge count is the feedback.
    return;
  }

  const inc = e.target.closest('[data-inc]');
  if (inc) {
    const id = inc.dataset.inc;
    const product = state.products.find(p => p.id === Number(id));
    if (product && state.cart[id] < product.stock) state.cart[id]++;
    saveCart();
    renderCart();
    return;
  }

  const dec = e.target.closest('[data-dec]');
  if (dec) {
    const id = dec.dataset.dec;
    state.cart[id]--;
    if (state.cart[id] <= 0) delete state.cart[id];
    saveCart();
    renderCart();
    return;
  }

  const chip = e.target.closest('[data-cat]');
  if (chip) {
    state.category = chip.dataset.cat;
    document.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === chip)));
    loadProducts();
  }
});

let searchTimer;
$('#search').addEventListener('input', e => {
  clearTimeout(searchTimer);
  state.query = e.target.value.trim();
  searchTimer = setTimeout(loadProducts, 200);
});

$('#cart-btn').addEventListener('click', () => setCartOpen(true));
$('#cart-close').addEventListener('click', () => setCartOpen(false));
$('#overlay').addEventListener('click', () => setCartOpen(false));

$('#checkout-btn').addEventListener('click', () => {
  $('#checkout-error').hidden = true;
  $('#checkout').showModal();
});
$('#checkout-cancel').addEventListener('click', () => $('#checkout').close());

$('#checkout-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = new FormData(e.target);
  const payload = {
    customer: {
      name: form.get('name'),
      email: form.get('email'),
      address: form.get('address')
    },
    items: Object.entries(state.cart).map(([id, qty]) => ({ id: Number(id), qty }))
  };

  try {
    const order = await api('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    $('#checkout').close();
    state.cart = {};
    saveCart();
    setCartOpen(false);
    $('#receipt-body').innerHTML = `
      <p>Thanks, ${order.customer.name}! Your order <code>${order.orderId}</code> is placed.</p>
      <ul>${order.items.map(i => `<li>${i.qty} × ${i.name} — ${money(i.lineTotal)}</li>`).join('')}</ul>
      <p>Shipping: ${order.shipping === 0 ? 'Free' : money(order.shipping)}<br>
         <strong>Total paid: ${money(order.total)}</strong></p>
      <p class="muted">Processed by EC2 instance <code>${order.servedBy}</code></p>`;
    $('#receipt').showModal();
    await loadProducts();
  } catch (err) {
    const box = $('#checkout-error');
    box.textContent = err.message;
    box.hidden = false;
  }
});

$('#receipt-close').addEventListener('click', () => $('#receipt').close());

/* --------------------------------- init -------------------------------- */

(async function init() {
  showServerInfo();
  try {
    const { categories } = await api('/api/categories');
    renderCategories(categories);
    await loadProducts();
  } catch (err) {
    $('#grid').innerHTML = `<p class="error">Could not load products: ${err.message}</p>`;
  }
})();
