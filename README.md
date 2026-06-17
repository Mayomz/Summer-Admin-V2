# FiveM Ticket Desk

เว็บจัดการ Ticket สำหรับ Admin server FiveM แบบ static website ใช้กับ GitHub Pages ได้ และรองรับ Supabase เป็นฐานข้อมูลออนไลน์

## ไฟล์สำคัญ

- `login.html` หน้าเข้าสู่ระบบ
- `index.html` หน้าจัดการ Ticket
- `admin.html` หน้าจัดการสิทธิ์ผู้ใช้
- `archive.html` หน้าคลังงาน
- `backend.html` หน้าเพิ่มหมวดหมู่
- `config.html` หน้าตั้งค่าฐานข้อมูล
- `stats.html` หน้าสถิติ
- `supabase-schema.sql` SQL สำหรับสร้างตารางใน Supabase
- `assets/site-config.js` ค่าเชื่อมต่อ Supabase สำหรับตอนอัปขึ้น GitHub

## ตั้งค่า Supabase

1. สร้าง Project ใน Supabase
2. ไปที่ SQL Editor
3. คัดลอก SQL จาก `supabase-schema.sql` ไปรัน
4. ไปที่ Project Settings แล้วเปิด API
5. เอา Project URL และ anon public key มาใส่ใน `assets/site-config.js`

ตัวอย่าง:

```js
window.FIVEM_TICKET_CONFIG = {
  databaseProvider: "supabase",
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_ANON_PUBLIC_KEY",
  supabaseStateTable: "app_state",
  supabaseStateKey: "main"
};
```

## อัปขึ้น GitHub Pages

1. สร้าง repository ใหม่ใน GitHub
2. อัปโหลดไฟล์ทั้งหมดในโฟลเดอร์นี้ขึ้น repository
3. เข้า Settings > Pages
4. เลือก Deploy from a branch
5. เลือก branch `main` และ folder `/root`
6. กด Save แล้วรอลิงก์เว็บจาก GitHub Pages

หมายเหตุ: `anon public key` ของ Supabase สามารถใช้ในเว็บหน้า browser ได้ แต่ควรตั้ง Row Level Security ให้เหมาะกับงานจริงก่อนใช้งานกับข้อมูลสำคัญ
