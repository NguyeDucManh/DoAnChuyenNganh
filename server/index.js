// ===================== IMPORTS =====================
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pkg from "pg";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import crypto from "crypto";

dotenv.config();
const { Pool } = pkg;

const app = express();

// ===================== MIDDLEWARES =====================
app.use(
  cors({
    origin: ["http://127.0.0.1:5500", "http://localhost:5500"],
    credentials: false,
  })
);
app.use(express.json({ limit: "1mb" }));

// ===================== POSTGRES =====================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // ssl: { rejectUnauthorized: false }, // bật nếu deploy cloud
});

// ===== Ensure schema (orders + trigger) =====
async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id            BIGSERIAL PRIMARY KEY,
      customer_name TEXT        NOT NULL,
      tracking_code TEXT        NOT NULL UNIQUE,
      address       TEXT,
      status        TEXT        NOT NULL DEFAULT 'Đang xử lý'
                   CHECK (status IN ('Đang xử lý','Đang giao','Đã giao','Đã hủy')),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN DEFAULT FALSE
    );

    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_orders_updated ON orders;
    CREATE TRIGGER trg_orders_updated
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);
}
await ensureSchema();

// ===================== JWT SECRET =====================
const JWT_SECRET = process.env.JWT_SECRET || "changeme";

// ===================== HEALTHCHECK =====================
app.get("/", (_req, res) => res.send("✅ API OK"));

// ===================== AUTH APIs =====================

// --- Đăng ký ---
app.post("/api/register", async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password)
      return res.status(400).json({ error: "Thiếu dữ liệu" });

    const hashed = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users (username, email, password_hash) VALUES ($1,$2,$3)",
      [username, email, hashed]
    );
    res.json({ ok: true });
  } catch (err) {
    if (err.code === "23505")
      return res.status(409).json({ error: "Username hoặc email đã tồn tại" });
    console.error("REGISTER_ERROR:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// --- Đăng nhập ---
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password)
      return res.status(400).json({ error: "Thiếu dữ liệu" });

    const { rows } = await pool.query(
      "SELECT id, username, email, password_hash FROM users WHERE username=$1",
      [username]
    );
    const user = rows[0];
    if (!user)
      return res.status(401).json({ error: "Sai tài khoản hoặc mật khẩu" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok)
      return res.status(401).json({ error: "Sai tài khoản hoặc mật khẩu" });

    const token = jwt.sign(
      { uid: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({ token, username: user.username });
  } catch (err) {
    console.error("LOGIN_ERROR:", err);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ===================== FORGOT PASSWORD (optional) =====================
const mailer = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 2525),
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      secure: false,
    })
  : null;

async function sendResetMail(to, link) {
  try {
    if (!mailer) return console.log("[DEV] Reset link:", link);
    await mailer.sendMail({
      from: process.env.FROM_EMAIL || "no-reply@example.com",
      to,
      subject: "Đặt lại mật khẩu",
      html: `<p>Bạn vừa yêu cầu đặt lại mật khẩu.</p>
             <p><a href="${link}">${link}</a></p>
             <p>Liên kết sẽ hết hạn sau 60 phút.</p>`,
    });
  } catch (e) {
    console.error("MAILER_ERROR:", e?.message || e);
  }
}

// ===================== ORDERS CRUD =====================
const ALLOWED_STATUS = ["Đang xử lý", "Đang giao", "Đã giao", "Đã hủy"];

// GET all
app.get("/api/orders", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, customer_name, tracking_code, address, status, created_at, updated_at FROM orders ORDER BY id ASC"
    );
    res.json(rows);
  } catch (e) {
    console.error("ORDERS_LIST_ERR:", e);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// CREATE
app.post("/api/orders", async (req, res) => {
  try {
    const { customer_name, tracking_code, address, status } = req.body || {};
    if (!customer_name || !tracking_code)
      return res.status(400).json({ error: "Thiếu customer_name / tracking_code" });

    const stt = ALLOWED_STATUS.includes(status) ? status : "Đang xử lý";
    const { rows } = await pool.query(
      `INSERT INTO orders (customer_name, tracking_code, address, status)
       VALUES ($1,$2,$3,$4)
       RETURNING id, customer_name, tracking_code, address, status, created_at, updated_at`,
      [customer_name, tracking_code, address || "", stt]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === "23505")
      return res.status(409).json({ error: "tracking_code đã tồn tại" });
    console.error("ORDERS_CREATE_ERR:", e);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// UPDATE
app.put("/api/orders/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { customer_name, tracking_code, address, status } = req.body || {};
    if (!id) return res.status(400).json({ error: "ID không hợp lệ" });

    const stt = ALLOWED_STATUS.includes(status) ? status : "Đang xử lý";
    const { rows } = await pool.query(
      `UPDATE orders
       SET customer_name=$1, tracking_code=$2, address=$3, status=$4, updated_at=now()
       WHERE id=$5
       RETURNING id, customer_name, tracking_code, address, status, created_at, updated_at`,
      [customer_name, tracking_code, address || "", stt, id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Không tìm thấy đơn" });
    res.json(rows[0]);
  } catch (e) {
    if (e.code === "23505")
      return res.status(409).json({ error: "tracking_code đã tồn tại" });
    console.error("ORDERS_UPDATE_ERR:", e);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// DELETE all + reset identity  ← phải đứng TRƯỚC
app.delete("/api/orders/reset", async (_req, res) => {
  try {
    await pool.query("TRUNCATE TABLE orders RESTART IDENTITY CASCADE");
    res.json({ ok: true });
  } catch (e) {
    console.error("RESET_ORDERS_ERROR:", e);
    res.status(500).json({ error: e.message || "Lỗi server" });
  }
});

// DELETE one
app.delete("/api/orders/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID không hợp lệ" });
    const { rowCount } = await pool.query("DELETE FROM orders WHERE id=$1", [id]);
    if (!rowCount) return res.status(404).json({ error: "Không tìm thấy đơn" });
    res.json({ ok: true });
  } catch (e) {
    console.error("ORDERS_DELETE_ERR:", e);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// ===================== START SERVER =====================
const PORT = Number(process.env.PORT || 30022);
app.listen(PORT, () =>
  console.log(`✅ API đang chạy tại http://localhost:${PORT}`)
);
