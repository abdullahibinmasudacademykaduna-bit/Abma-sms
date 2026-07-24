# Greenwood SMS — School Management System (Nursery & Primary)

A modern, responsive, installable (PWA) School Management System, purpose-built
for a Nursery + Primary school. Plain **HTML5 / CSS3 / JavaScript (ES6+)** —
no build step, no Node.js required to run it. Chart.js and QRCode.js load via
CDN. Data lives in the browser's `localStorage` behind a small data-access
layer (`js/db.js`) shaped like a Firestore client, so swapping in real
Firebase Authentication / Firestore / Storage later means editing that one
file plus `js/auth.js`.

## Run it

Plain `<script>` tags (not ES module imports) — double-click `index.html`
and it runs. For full PWA behaviour (installable, offline via the service
worker), serve it over http instead:

```bash
cd sms
python3 -m http.server 8080
# then open http://localhost:8080
```

Any static host works too — Netlify, GitHub Pages, Firebase Hosting, etc.

**Ready to go live on Firebase?** See `FIREBASE_MIGRATION.md` (in the
parent folder of `sms/`) for the full setup, data migration, security
rules, and deployment walkthrough.

**If you're updating an existing deployment**: the service worker caches
the app shell aggressively. After replacing files, do a hard reset once —
DevTools → Application → Service Workers → Unregister, then Application →
Storage → Clear site data — otherwise the browser may keep serving old
cached files. Every future update from here bumps the cache version
automatically, so this is only needed the one time.

## Roles

Super Admin, Principal, Head Teacher, Teacher, Accountant, Parent, Student.
The login screen lets you preview any role — any password works, this is a
client-side demo. Full access matrix lives in **Roles & Permissions** in the
app (or `js/auth.js` → `ROLE_PERMS`).

**Teachers are scoped to their own class(es).** A teacher only sees the
students, attendance, results, timetable, and homework for the class(es)
they're assigned to in Teacher Management — other classes are invisible to
them, not just hidden behind navigation. A class can have more than one
teacher (common for Nursery), and a teacher can be assigned more than one
class (e.g. a subject specialist). This is enforced per-module via
`getScopedClasses()` in `js/modules/people.js` — every module that lists or
filters by class calls it.

Library is managed by **Super Admin only** — everyone else with library
access gets a read-only catalog view.

## Classes & subjects

Pre-Nursery, Nursery 1–3, Primary 1–6 (`CLASS_NAMES` in `js/modules/people.js`).
Nursery subjects and Primary subjects are separate lists — Nursery gets
Numeracy, Literacy, Rhymes & Phonics, etc.; Primary gets Mathematics, English
Language, ICT, etc. Timetables follow the same split: Nursery classes get an
**activity-based** schedule (Circle Time, Snack Break, Outdoor Play...),
Primary classes get a conventional **subject-period** schedule.

## Exams & Results

Scoring: **CA1 (0–20) + CA2 (0–20) + Exam (0–60) = Total (100)**, graded
against a customizable scale (Settings → Grading Scale; defaults to
A 80–100 / B 70–79 / C 60–69 / D 50–59 / F 0–49). Each result also captures
Affective and Psychomotor skill ratings (1–5), a Class Teacher remark and a
Head Teacher remark (auto-suggested from the average, editable), and next
term's start date and fee.

The **printed report card** (opened from Results, or from a Parent/Student's
own portal) shows the school letterhead (logo/name/address from Settings),
the subject table, both skill tables, the grading key, remarks, next-term
info, signature lines, an official stamp box, and a **QR code** encoding the
result for verification. Class size, position, and attendance ("times
opened" / "times present") are all **calculated automatically** from real
student rosters, results, and attendance records — nothing is typed in by
hand. Printing uses a CSS trick that isolates just the report card, so the
rest of the app UI doesn't show up in the printout.

A **batch promotion** tool (Exams → Promotion tab, admin roles only) moves
selected students from one class to the next at term/year end.

## Fees

Each fee record is broken into categories (Tuition, Feeding, PTA Dues, etc.)
that sum to the total billed. Collection is still tracked as one running
balance against that total — a parent's payment reduces the balance the same
way regardless of category, which is how payments actually arrive in
practice. Click the eye icon on any row to see the category breakdown.

## What's included

- **Dashboard** — stat cards, attendance/fee charts, activity feed, calendar
- **Student / Teacher / Staff Management** — full CRUD, teacher class
  assignment via multi-select
- **Class & Subject Management**
- **Attendance** — mark per class per day, 14-day trend chart
- **Examination & Result Management** — see above
- **Fees & Finance** — category breakdown, partial payments, CSV export
- **Timetable** — Nursery activity grid / Primary subject grid
- **Library, Inventory, Health Records** — CRUD via a shared reusable
  table/modal engine (`js/modules/generic.js`)
- **Notice Board, Events, Communication**
- **Parent / Student / Teacher Portals** — role-specific read views, linked
  to real student/teacher records via User Management
- **User Management** — create accounts, assign roles, link a Parent/Student
  account to a student record or a Teacher account to a teacher record,
  deactivate/reset access
- **Roles & Permissions** — access matrix viewer
- **Reports & Analytics**
- **Settings** — school profile (placeholder branding until you replace it),
  logo upload, grading scale editor, light/dark theme, JSON backup & restore

## Architecture notes

```
sms/
  index.html          shell + script includes (load order matters)
  manifest.json         PWA manifest
  sw.js                  service worker (offline app-shell caching)
  css/style.css          design tokens + all component styles + report-card print styles
  js/
    icons.js              inline SVG icon set
    db.js                  localStorage data layer + seed/demo data
    auth.js                session + role/permission matrix
    ui.js                  toast, modal, form builder (incl. multiselect), table builder
    charts.js               Chart.js wrapper (line/bar/doughnut), fails gracefully offline
    router.js               hash-based router
    app.js                   login screen, app shell, nav, boot
    modules/
      people.js              Students/Teachers/Staff + CLASS_NAMES, subject
                              lists, and getScopedClasses() (the teacher
                              class-scoping helper every other module uses)
      academics.js           Classes & Subjects
      attendance.js
      exams.js                Exams, Results, Performance, Promotion, and
                               the printable report card (window.openReportCard)
      fees.js
      timetable.js
      library.js
      generic.js              makeCrudModule() factory — Inventory, Health,
                               Events, Communication, Homework, Notice Board
      portals.js              Parent/Student/Teacher portals, Reports, Roles
      users.js                User Management
      settings.js
```

- **No bundler.** Every file attaches to shared globals (`DB`, `AUTH`, `UI`,
  `CHARTS`, `ICONS`, `MODULES`, `ROUTER`, `APP`, plus `CLASS_NAMES` /
  `getScopedClasses` / etc. from `people.js`). Zero tooling required.
- **Swappable backend.** `js/db.js` and `js/auth.js` are the only two files
  that would need to change to move to Firebase — everything else only calls
  `DB.all/get/add/update/remove` and `AUTH.login/logout/currentUser/can`.
  Class-level restriction for Teachers is UI-side only right now — a real
  deployment needs the same class-ownership rule mirrored in Firestore
  Security Rules, not just hidden in the interface.
- **Data model version**: `DB_KEY` in `db.js` is `greenwood_sms_v2`. If you
  ever restructure a collection's shape again, bump that key so old
  incompatible localStorage data doesn't collide with the new shape — it'll
  just reseed cleanly instead of crashing on a shape mismatch.
