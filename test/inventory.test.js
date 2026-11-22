const assert = require('node:assert/strict');
const { test } = require('node:test');
const inventory = require('../lib/inventory');
const orders = require('../lib/orders');

test('accepts the last sellable jar of DRY-001 without wholesale holds', () => {
  const ghee = { id: 1, sku: 'DRY-001', name: 'A2 Gir Cow Ghee 500ml', stock: 1, reserved: 0 };

  assert.equal(inventory.getSellableStock(ghee), 1);
  assert.deepEqual(inventory.check([ghee], [{ id: ghee.id, qty: 1 }]), { ok: true });
});

test('accepts the last sellable packet of SPC-001 with three held units', () => {
  const chilli = { id: 2, sku: 'SPC-001', name: 'Byadgi Chilli Powder', stock: 4, reserved: 3 };

  assert.equal(inventory.getSellableStock(chilli), 1);
  assert.deepEqual(inventory.check([chilli], [{ id: chilli.id, qty: 1 }]), { ok: true });
});

test('accepts the exact sellable quantity when several units remain', () => {
  const product = { id: 3, name: 'Rice', stock: 7, reserved: 3 };

  assert.equal(inventory.getSellableStock(product), 4);
  assert.deepEqual(inventory.check([product], [{ id: product.id, qty: 4 }]), { ok: true });
});

test('accepts a quantity below sellable stock and rejects a quantity above it', () => {
  const product = { id: 3, name: 'Rice', stock: 7, reserved: 3 };

  assert.deepEqual(inventory.check([product], [{ id: product.id, qty: 3 }]), { ok: true });
  assert.deepEqual(inventory.check([product], [{ id: product.id, qty: 5 }]), {
    ok: false,
    msg: 'Rice is out of stock (4 sellable available)'
  });
});

test('rejects two lines that together exceed the last sellable unit', () => {
  const product = { id: 3, name: 'Rice', stock: 4, reserved: 3 };
  const items = [{ id: product.id, qty: 1 }, { id: String(product.id), qty: 1 }];

  assert.deepEqual(inventory.check([product], items), {
    ok: false,
    msg: 'Rice is out of stock (1 sellable available)'
  });
});

test('cancelling pending order #1007 restores physical stock and preserves wholesale holds', () => {
  const db = {
    products: [
      { id: 1, stock: 3, reserved: 0 },
      { id: 2, stock: 6, reserved: 3 }
    ],
    orders: [],
    nextOrderId: 1007
  };
  const items = [{ id: 1, qty: 2 }, { id: 2, qty: 2 }];
  inventory.reserve(db.products, items);
  const order = orders.add(db, { status: 'pending', items });
  assert.equal(order.status, 'pending');
  assert.deepEqual(db.products, [
    { id: 1, stock: 1, reserved: 0 },
    { id: 2, stock: 4, reserved: 3 }
  ]);

  const reason = 'Cancelled from Order Register';
  const result = orders.cancel(db, '1007', reason);

  assert.equal(result.ok, true);
  assert.equal(result.order, order);
  assert.equal(result.order.status, 'cancelled');
  assert.equal(result.order.cancelReason, reason);
  assert.match(result.order.cancelledAt, /^\d{2}\/\d{2}\/\d{4}$/);
  assert.deepEqual(db.products, [
    { id: 1, stock: 3, reserved: 0 },
    { id: 2, stock: 6, reserved: 3 }
  ]);
});

test('releasing a wholesale hold by productId reduces reserved units and leaves physical stock alone', () => {
  const product = { id: 2, stock: 4, reserved: 3 };

  inventory.release([product], [{ productId: product.id, qty: 2 }]);

  assert.deepEqual(product, { id: 2, stock: 4, reserved: 1 });
});
