# Percepta Plugin Builder

Skill สำหรับสร้างปลั๊กอิน Percepta จากไอเดียของผู้คิดค้น พร้อม SDK, source ตัวอย่าง, ตัวสร้างโปรเจกต์ และตัวสร้าง/ตรวจ ZIP ไม่กำหนดว่าต้องคิดปลั๊กอินอะไร

## เริ่มใช้งาน

โฟลเดอร์ [percepta-plugin-builder](percepta-plugin-builder/) เป็น skill ที่นำไปวางในโฟลเดอร์ skills ของ agent ได้ เช่น `~/.codex/skills/` หรือให้ agent อ่าน [SKILL.md](percepta-plugin-builder/SKILL.md) โดยตรง

```text
ใช้ $percepta-plugin-builder สร้างปลั๊กอินชื่อ …
ไอเดียคือ … ผลลัพธ์ที่ต้องการใน Percepta คือ …
ทำเป็น ZIP ติดตั้งได้ และทดสอบการส่งผลงานเข้า Percepta
```

## สร้างโปรเจกต์และ ZIP โดยตรง

ต้องมี Python3 และ Node.js20+ สำหรับสร้าง/ทดสอบ ไม่ต้อง npm install และไม่ต้องมีซอร์ส EasyVFX หรือ Percepta บนเครื่องผู้พัฒนา ส่วนการติดตั้ง/ทดสอบต้องใช้ Percepta รุ่นที่รองรับ local plugins และ manifest/SDK1.0.0

```sh
git clone https://github.com/Geeguyy/Guy-Skill.git
cd Guy-Skill/Percepta
python3 percepta-plugin-builder/scripts/new_plugin.py \
  --id yourname.your-tool --name "Your Tool" --out ./your-tool
cd your-tool
npm test
npm run package
```

นำ `dist/yourname.your-tool-0.1.0.zip` ไปที่ **Percepta → Plugins → Install ZIP** แล้วเปิดไอคอนใหม่บน ribbon ตัวอย่างเป็นวงแหวน procedural สำหรับพิสูจน์การเชื่อมต่อ Scene ปรับ UI และ domain logic ตามไอเดียของผู้สร้างได้

[Source SDK และตัวอย่าง](percepta-plugin-builder/assets/starter/) รวม generic message client, revision/session state, preview runtime ที่ pin ไว้, local Undo/Redo, recovery, native Apply/update/reload และเครื่องมือ package แบบ allowlist โค้ดที่ติดตั้งแล้วทำงานใน browser sandbox ไม่ต้องมี Node/ไฟล์จากเครื่องผู้สร้าง

## มาตรฐานใน skill

- [Manifest, ZIP และ SDK contract](percepta-plugin-builder/references/protocol.md): ID/version/permissions, sandbox และ operation ที่ใช้ได้จริง
- [Native content](percepta-plugin-builder/references/native-content.md): ส่งผลงานเข้า Scene เก็บ source เป็นของโปรเจกต์ และเปิดแก้ต่อได้
- [Quality/lifecycle](percepta-plugin-builder/references/quality.md): draft, session/revision guards, recovery, Save/Reopen, hide/show, resize/maximize, Disable/Enable, Update/Rollback และ Uninstall

ห้ามเขียนไฟล์ host ตรง ๆ, import Studio controller, ใช้ CDN ที่ sandbox ไม่รองรับ, ปลอม API, เก็บ launch secrets หรือผูกผลงานที่ commit แล้วกับโฟลเดอร์ปลั๊กอิน ให้ host จัดการ outer window และการติดตั้ง/ถอนปลั๊กอิน

## ขอบเขต API

โครงปลั๊กอิน/หน้าต่าง/draft ใช้กับไอเดียเครื่องมือทั่วไปได้ Native content adapter ที่ตรวจสอบรองรับ EasyVFX-compatible effect recipes ส่วน character, mesh, map หรือชนิดเอกสารใหม่ต้องพัฒนา host adapter เพิ่มตามแนวทางใน skill ก่อนประกาศว่าทำงาน native ครบ

ตัวอย่าง pin preview runtime1.0.0 และรับเฉพาะ ring subset ที่ใช้ร่วมกับ native host1.1.0 ที่ทดสอบได้ ไม่อ้างว่ารองรับ feature ใหม่ทั้งหมดหรือ Percepta ทุกรุ่นในอนาคต ผู้สร้างต้องตรวจ compatibility กับ host เป้าหมาย

**Save draft** เก็บงานส่วนตัวของ editor; **Apply** เปลี่ยน Scene แล้วต้อง **Save โปรเจกต์ Studio** อีกครั้ง Disable เก็บร่างไว้ ส่วน Uninstall ลบ code/private drafts และคงผลงาน native ที่ commit แล้ว

Repository นี้เผยแพร่เฉพาะ skill/SDK/source ตัวอย่าง/คู่มือ ไม่มีโปรไฟล์เครื่อง ภาพหน้าจอ หรือบันทึก QA ตัวอย่างไม่มี captured Nightcamp assets ดู [NOTICE](percepta-plugin-builder/assets/starter/NOTICE.txt) สำหรับ provenance ของ runtime
