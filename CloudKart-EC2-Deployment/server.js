/*
 * CloudKart - backend for the EC2-hosted online shopping website.
 * Zero external dependencies so it runs on a bare Amazon Linux EC2 box
 * with nothing but `sudo dnf install -y nodejs` and `node server.js`.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const PRODUCTS_FILE = path.join(__dirname, 'data', 'products.json');
const ORDERS_FILE = path.join(__dirname, 'data', 'orders.json');

const products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png'
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

function readOrders() {
  try {
    return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeOrders(orders) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1e6) {
        reject(new Error('payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/* ---------------------------- API routes ---------------------------- */

async function handleApi(req, res, url) {
  const route = url.pathname;

  // Health check - used by the demo to prove the instance is serving.
  if (route === '/api/health' && req.method === 'GET') {
    return sendJson(res, 200, {
      status: 'ok',
      service: 'CloudKart backend',
      host: os.hostname(),
      platform: `${os.type()} ${os.release()}`,
      uptimeSeconds: Math.round(process.uptime()),
      time: new Date().toISOString()
    });
  }

  if (route === '/api/products' && req.method === 'GET') {
    const category = url.searchParams.get('category');
    const q = (url.searchParams.get('q') || '').toLowerCase();
    let list = products;
    if (category && category !== 'All') list = list.filter(p => p.category === category);
    if (q) list = list.filter(p => (p.name + ' ' + p.description).toLowerCase().includes(q));
    return sendJson(res, 200, { count: list.length, products: list });
  }

  if (route === '/api/categories' && req.method === 'GET') {
    return sendJson(res, 200, { categories: ['All', ...new Set(products.map(p => p.category))] });
  }

  const productMatch = route.match(/^\/api\/products\/(\d+)$/);
  if (productMatch && req.method === 'GET') {
    const product = products.find(p => p.id === Number(productMatch[1]));
    if (!product) return sendJson(res, 404, { error: 'Product not found' });
    return sendJson(res, 200, product);
  }

  if (route === '/api/orders' && req.method === 'GET') {
    return sendJson(res, 200, { orders: readOrders() });
  }

  if (route === '/api/orders' && req.method === 'POST') {
    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    const { customer, items } = body;
    if (!customer || !customer.name || !customer.email || !customer.address) {
      return sendJson(res, 400, { error: 'customer name, email and address are required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return sendJson(res, 400, { error: 'order must contain at least one item' });
    }

    const lines = [];
    for (const item of items) {
      const product = products.find(p => p.id === Number(item.id));
      if (!product) return sendJson(res, 400, { error: `unknown product id ${item.id}` });
      const qty = Number(item.qty);
      if (!Number.isInteger(qty) || qty < 1) {
        return sendJson(res, 400, { error: `invalid quantity for ${product.name}` });
      }
      if (qty > product.stock) {
        return sendJson(res, 409, { error: `only ${product.stock} left of ${product.name}` });
      }
      lines.push({ id: product.id, name: product.name, price: product.price, qty, lineTotal: product.price * qty });
    }

    const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
    const shipping = subtotal >= 2000 ? 0 : 99;
    const order = {
      orderId: 'CK-' + Date.now().toString(36).toUpperCase(),
      placedAt: new Date().toISOString(),
      servedBy: os.hostname(),
      customer: { name: customer.name, email: customer.email, address: customer.address },
      items: lines,
      subtotal,
      shipping,
      total: subtotal + shipping
    };

    // Reduce in-memory stock so the demo shows inventory changing.
    for (const line of lines) {
      products.find(p => p.id === line.id).stock -= line.qty;
    }

    const orders = readOrders();
    orders.push(order);
    writeOrders(orders);
    console.log(`[order] ${order.orderId} total=${order.total} items=${lines.length}`);
    return sendJson(res, 201, order);
  }

  return sendJson(res, 404, { error: 'No such API route' });
}

/* --------------------------- static files --------------------------- */

function serveStatic(req, res, url) {
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 - page not found</h1><p><a href="/">Back to CloudKart</a></p>');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  console.log(`${new Date().toISOString()} ${req.method} ${url.pathname}`);
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch(() => sendJson(res, 500, { error: 'Internal server error' }));
  } else {
    serveStatic(req, res, url);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`CloudKart backend listening on http://0.0.0.0:${PORT} (host ${os.hostname()})`);
});
