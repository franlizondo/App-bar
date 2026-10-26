'use strict';
// Acceso a categorías y productos.

function createMenuRepo(db) {
  const stmts = {
    categories: db.prepare('SELECT * FROM categories ORDER BY position, id'),
    category: db.prepare('SELECT * FROM categories WHERE id = ?'),
    insertCategory: db.prepare(
      'INSERT INTO categories (name, position) VALUES (?, (SELECT COALESCE(MAX(position), 0) + 1 FROM categories))'
    ),
    updateCategory: db.prepare('UPDATE categories SET name = ?, visible = ? WHERE id = ?'),
    deleteCategory: db.prepare('DELETE FROM categories WHERE id = ?'),
    setCategoryPosition: db.prepare('UPDATE categories SET position = ? WHERE id = ?'),

    products: db.prepare('SELECT * FROM products ORDER BY position, id'),
    productsByCategory: db.prepare('SELECT * FROM products WHERE category_id = ? ORDER BY position, id'),
    product: db.prepare('SELECT * FROM products WHERE id = ?'),
    insertProduct: db.prepare(`
      INSERT INTO products (category_id, name, description, price_cents, photo, available, visible, position)
      VALUES (@category_id, @name, @description, @price_cents, @photo, @available, @visible,
              (SELECT COALESCE(MAX(position), 0) + 1 FROM products WHERE category_id = @category_id))
    `),
    updateProduct: db.prepare(`
      UPDATE products SET category_id = @category_id, name = @name, description = @description,
        price_cents = @price_cents, photo = @photo, available = @available, visible = @visible,
        updated_at = datetime('now')
      WHERE id = @id
    `),
    setAvailable: db.prepare("UPDATE products SET available = ?, updated_at = datetime('now') WHERE id = ?"),
    deleteProduct: db.prepare('DELETE FROM products WHERE id = ?'),
    setProductPosition: db.prepare('UPDATE products SET position = ? WHERE id = ?'),
  };

  // Intercambia la posición de un elemento con su vecino (arriba = -1, abajo = +1).
  function move(list, id, direction, setPosition) {
    const index = list.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= list.length) return;
    db.transaction(() => {
      // Normalizamos posiciones 1..n y luego intercambiamos.
      list.forEach((item, i) => setPosition.run(i + 1, item.id));
      setPosition.run(target + 1, list[index].id);
      setPosition.run(index + 1, list[target].id);
    })();
  }

  return {
    /** Menú público: solo categorías y productos visibles, con categorías vacías omitidas. */
    publicMenu() {
      const products = stmts.products.all().filter((p) => p.visible);
      return stmts.categories
        .all()
        .filter((c) => c.visible)
        .map((c) => ({ ...c, products: products.filter((p) => p.category_id === c.id) }))
        .filter((c) => c.products.length > 0);
    },
    /** Menú completo para el administrador. */
    fullMenu() {
      const products = stmts.products.all();
      return stmts.categories.all().map((c) => ({
        ...c,
        products: products.filter((p) => p.category_id === c.id),
      }));
    },
    categories: () => stmts.categories.all(),
    category: (id) => stmts.category.get(id),
    createCategory: (name) => stmts.insertCategory.run(name).lastInsertRowid,
    updateCategory: (id, { name, visible }) => stmts.updateCategory.run(name, visible ? 1 : 0, id),
    deleteCategory: (id) => stmts.deleteCategory.run(id),
    moveCategory(id, direction) {
      move(stmts.categories.all(), id, direction, stmts.setCategoryPosition);
    },

    product: (id) => stmts.product.get(id),
    createProduct: (data) => stmts.insertProduct.run(data).lastInsertRowid,
    updateProduct: (id, data) => stmts.updateProduct.run({ ...data, id }),
    setAvailable: (id, available) => stmts.setAvailable.run(available ? 1 : 0, id),
    deleteProduct: (id) => stmts.deleteProduct.run(id),
    moveProduct(id, direction) {
      const product = stmts.product.get(id);
      if (!product) return;
      move(stmts.productsByCategory.all(product.category_id), id, direction, stmts.setProductPosition);
    },
  };
}

module.exports = { createMenuRepo };
