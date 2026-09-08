const express = require('express');
const { createClient } = require('@libsql/client');
const cors = require('cors');
const path = require('path');
require('dotenv').config(); // لتحميل المتغيرات من ملف .env

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// الاتصال بقاعدة بيانات Turso السحابية
const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// تهيئة الجداول عند بدء التشغيل
async function initDb() {
  try {
    await db.execute(`CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orderCode TEXT,
        customerName TEXT,
        phone TEXT,
        deviceType TEXT,
        deviceSerial TEXT,
        problem TEXT,
        status TEXT DEFAULT 'قيد الانتظار',
        estimatedHours INTEGER DEFAULT 2,
        techNotes TEXT DEFAULT '',
        repairCost REAL DEFAULT 0,
        partCost REAL DEFAULT 0,
        totalCost REAL DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    await db.execute(`CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        quantity INTEGER,
        price REAL
    )`);
    console.log('تم الاتصال بقاعدة البيانات السحابية Turso وجاهزية الجداول بنجاح.');
  } catch (err) {
    console.error('خطأ في تهيئة قاعدة البيانات:', err.message);
  }
}
initDb();

function generateOrderCode() {
    const d = new Date();
    const dateStr = d.getFullYear().toString() +
                    String(d.getMonth() + 1).padStart(2, '0') +
                    String(d.getDate()).padStart(2, '0');
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return `ORD-${dateStr}-${randomNum}`;
}

// APIs التذاكر
app.get('/api/tickets', async (req, res) => {
    try {
        const result = await db.execute("SELECT * FROM tickets WHERE status != 'إنهاء واختفاء' ORDER BY id DESC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/tickets/:id', async (req, res) => {
    try {
        const result = await db.execute({
            sql: 'SELECT * FROM tickets WHERE id = ? OR orderCode = ?',
            args: [req.params.id, req.params.id]
        });
        res.json(result.rows[0] || {});
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tickets', async (req, res) => {
    const { customerName, phone, deviceType, deviceSerial, problem, estimatedHours, repairCost, partCost } = req.body;
    const orderCode = generateOrderCode();
    const rCost = Number(repairCost) || 0;
    const pCost = Number(partCost) || 0;
    const totalCost = rCost + pCost;

    try {
        const result = await db.execute({
            sql: `INSERT INTO tickets (orderCode, customerName, phone, deviceType, deviceSerial, problem, estimatedHours, repairCost, partCost, totalCost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [orderCode, customerName, phone, deviceType, deviceSerial || 'غير محدد', problem, Number(estimatedHours) || 2, rCost, pCost, totalCost]
        });
        res.json({ id: Number(result.lastInsertRowid), orderCode });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/tickets/:id', async (req, res) => {
    const { status, estimatedHours, techNotes, repairCost, partCost } = req.body;
    const rCost = Number(repairCost) || 0;
    const pCost = Number(partCost) || 0;
    const totalCost = rCost + pCost;

    try {
        const result = await db.execute({
            sql: `UPDATE tickets SET status = ?, estimatedHours = ?, techNotes = ?, repairCost = ?, partCost = ?, totalCost = ? WHERE id = ?`,
            args: [status, Number(estimatedHours) || 0, techNotes || '', rCost, pCost, totalCost, req.params.id]
        });
        res.json({ updated: result.rowsAffected });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// APIs المخزون
app.get('/api/inventory', async (req, res) => {
    try {
        const result = await db.execute('SELECT * FROM inventory ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/inventory', async (req, res) => {
    const { name, quantity, price } = req.body;
    try {
        const result = await db.execute({
            sql: `INSERT INTO inventory (name, quantity, price) VALUES (?, ?, ?)`,
            args: [name, Number(quantity), Number(price)]
        });
        res.json({ id: Number(result.lastInsertRowid), name, quantity, price });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/inventory/:id', async (req, res) => {
    const { name, quantity, price } = req.body;
    try {
        const result = await db.execute({
            sql: `UPDATE inventory SET name = ?, quantity = ?, price = ? WHERE id = ?`,
            args: [name, Number(quantity), Number(price), req.params.id]
        });
        res.json({ updated: result.rowsAffected });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/inventory/:id', async (req, res) => {
    try {
        const result = await db.execute({
            sql: `DELETE FROM inventory WHERE id = ?`,
            args: [req.params.id]
        });
        res.json({ deleted: result.rowsAffected });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`السيرفر يعمل بنجاح على: http://localhost:${PORT}`);
});