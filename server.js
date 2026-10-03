const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Database ----------
const db = new Database(path.join(__dirname, "profiles.db"));
db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    bio TEXT,
    skills TEXT,
    github TEXT,
    linkedin TEXT,
    twitter TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const insertProfile = db.prepare(
  `INSERT INTO profiles (name, bio, skills, github, linkedin, twitter)
   VALUES (@name, @bio, @skills, @github, @linkedin, @twitter)`
);
const getProfile = db.prepare("SELECT * FROM profiles WHERE id = ?");
const getAllProfiles = db.prepare("SELECT * FROM profiles ORDER BY id DESC");

// ---------- String helpers ----------
const escapeHtml = (str = "") =>
  String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const titleCase = (str) =>
  str
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const getInitials = (name) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

// Turns a name into a consistent colour so each avatar looks unique
const colorFromName = (name) => {
  let hash = 0;
  for (const ch of name) hash = ch.charCodeAt(0) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 50%)`;
};

// "js, Node ,  react,JS" -> ["Js", "Node", "React"]
const parseSkills = (raw = "") => {
  const seen = new Set();
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => {
      const key = s.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
};

// Accepts "github.com/me", "https://..." or a plain handle; returns safe URL or ""
const cleanUrl = (value, baseUrl) => {
  value = (value || "").trim();
  if (!value) return "";
  if (!/^https?:\/\//i.test(value)) {
    value = /^[\w.-]+$/.test(value) && baseUrl ? baseUrl + value : "https://" + value;
  }
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol) ? u.href : "";
  } catch {
    return "";
  }
};

// ---------- HTML rendering ----------
const renderCard = (p) => {
  const skills = p.skills ? p.skills.split(",") : [];
  const links = [
    ["GitHub", p.github],
    ["LinkedIn", p.linkedin],
    ["Twitter", p.twitter],
  ].filter(([, url]) => url);

  return `
  <div class="card">
    <div class="avatar" style="background:${colorFromName(p.name)}">${escapeHtml(getInitials(p.name))}</div>
    <h2>${escapeHtml(p.name)}</h2>
    <p class="bio">${escapeHtml(p.bio) || "<em>No bio provided.</em>"}</p>
    <div class="skills">
      ${skills.map((s) => `<span class="chip">${escapeHtml(s)}</span>`).join("")}
    </div>
    <div class="links">
      ${links
        .map(
          ([label, url]) =>
            `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`
        )
        .join("")}
    </div>
  </div>`;
};

const page = (title, body) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <nav><a href="/">+ Create Profile</a><a href="/profiles">All Profiles</a></nav>
  <main>${body}</main>
</body>
</html>`;

// ---------- Middleware ----------
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ---------- Routes ----------
// Handle form submission: validate, clean, store, redirect to the card
app.post("/create", (req, res) => {
  const name = titleCase(req.body.name || "");
  if (!name) {
    return res
      .status(400)
      .send(page("Error", `<p class="error">Name is required. <a href="/">Go back</a></p>`));
  }

  const result = insertProfile.run({
    name: name.slice(0, 60),
    bio: (req.body.bio || "").trim().slice(0, 300),
    skills: parseSkills(req.body.skills).join(","),
    github: cleanUrl(req.body.github, "https://github.com/"),
    linkedin: cleanUrl(req.body.linkedin, "https://linkedin.com/in/"),
    twitter: cleanUrl(req.body.twitter, "https://twitter.com/"),
  });

  res.redirect(`/profile/${result.lastInsertRowid}`);
});

// Single profile card
app.get("/profile/:id", (req, res) => {
  const profile = getProfile.get(req.params.id);
  if (!profile) {
    return res.status(404).send(page("Not found", `<p class="error">Profile not found.</p>`));
  }
  res.send(page(profile.name, renderCard(profile)));
});

// All saved profiles
app.get("/profiles", (req, res) => {
  const all = getAllProfiles.all();
  const body = all.length
    ? `<h1>All Profiles</h1><div class="grid">${all.map(renderCard).join("")}</div>`
    : `<p>No profiles yet. <a href="/">Create one!</a></p>`;
  res.send(page("All Profiles", body));
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));