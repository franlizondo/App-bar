'use strict';
// Carga un menú de ejemplo y crea mesas. Uso:  npm run seed -- 15   (crea las mesas 1 a 15)
// No borra nada: si ya hay categorías, no vuelve a cargar el menú de ejemplo.
const config = require('./config');
const { openDatabase } = require('./db');
const { createMenuRepo } = require('./data/menu');
const { createTablesRepo } = require('./data/tables');

const db = openDatabase(config.dataDir);
const menu = createMenuRepo(db);
const tables = createTablesRepo(db);

const EJEMPLO = {
  'Bebidas sin alcohol': [
    ['Agua mineral', 'Con o sin gas, 500 ml', 1800],
    ['Gaseosa', 'Línea Coca-Cola, 500 ml', 2200],
    ['Limonada casera', 'Con menta y jengibre', 3200],
    ['Café', 'Chico, jarrito o doble', 1900],
  ],
  'Cervezas y tragos': [
    ['Cerveza tirada', 'Rubia o roja, pinta', 3800],
    ['Fernet con cola', '', 4500],
    ['Vermú', 'Con soda y rodaja de naranja', 4200],
  ],
  Comidas: [
    ['Picada para dos', 'Fiambres, quesos, aceitunas y pan', 12500],
    ['Milanesa con papas fritas', 'De carne o pollo', 9800],
    ['Tostado de jamón y queso', 'En pan de miga', 5200],
    ['Empanadas', 'Carne, pollo o jamón y queso (unidad)', 1600],
  ],
  Postres: [
    ['Flan casero', 'Con dulce de leche o crema', 3500],
    ['Helado', 'Dos bochas', 3800],
  ],
};

if (menu.categories().length === 0) {
  for (const [categoria, productos] of Object.entries(EJEMPLO)) {
    const categoryId = menu.createCategory(categoria);
    for (const [name, description, precio] of productos) {
      menu.createProduct({
        category_id: categoryId,
        name,
        description,
        price_cents: precio * 100,
        photo: null,
        available: name === 'Helado' ? 0 : 1, // un producto sin stock para ver cómo se muestra
        visible: 1,
      });
    }
  }
  console.log('Menú de ejemplo cargado.');
}

const cantidad = Number(process.argv[2]) || 10;
const existentes = new Set(tables.all().map((t) => t.label));
for (let n = 1; n <= cantidad; n++) if (!existentes.has(String(n))) tables.create(String(n));
console.log(`Mesas 1 a ${cantidad} listas.`);

const base = config.publicUrl || `http://localhost:${config.port}`;
const primera = tables.all()[0];
if (primera) console.log(`Ejemplo (mesa ${primera.label}): ${base}/m/${primera.token}`);
db.close();
