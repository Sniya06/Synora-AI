# Synora AI — Your Career, Orchestrated

An agentic AI career intelligence platform for college students, built for
the hackathon floor. Instead of juggling LinkedIn, Internshala, Unstop,
Naukri and GitHub across ten tabs, Synora coordinates a team of specialist
agents from one conversational workspace.

**Live demo:** https://sniya06.github.io/Synora-AI/
**Repo:** https://github.com/Sniya06/Synora-AI

---

## The agent team

| Agent | What it does |
|---|---|
| 📄 Resume Agent | Parses an uploaded PDF/DOCX/TXT resume, detects skills, projects, certifications and experience, and scores it out of 100 with concrete suggestions to improve it. |
| 🎯 Matchmaking Agent | Ranks live jobs, internships and hackathons against your profile with a fit score. |
| 📈 Skill Gap Agent | Maps what you're missing for your target domain and suggests a learning path + courses. |
| 🔍 Opportunity Agent | One searchable, filterable feed for jobs, internships and hackathons. |
| 🎤 Interview Agent | Runs a mock interview and grades your answers. |
| 🛡 Scam Detection Agent | Paste a job post, get a trust score and flagged red flags. |
| 💬 AI Career Assistant | A single chat interface that routes your question to the right agent above. |

## Tech stack

- **Frontend:** Vanilla HTML / CSS / JavaScript (no framework) — `index.html`, `style.css`, `app.js`
- **Resume parsing (client-side):** [pdf.js](https://mozilla.github.io/pdf.js/) for PDFs, [Mammoth.js](https://github.com/mwilliamson/mammoth.js) for DOCX
- **Auth & persistence:** `localStorage` / `sessionStorage` (no database — this is a frontend-only prototype for most features)
- **AI Career Assistant backend:** `server.js` (Node/Express) proxies chat requests to the Claude API so the API key never ships to the browser

## Project structure

```
Synora-AI/
├── index.html       # All screens: landing page, auth, onboarding, dashboard, agent views
├── style.css         # Styling for every screen
├── app.js            # All frontend logic (state, agents, resume analysis, chat routing)
├── server.js          # Node/Express backend — proxies /api/chat to the Claude API
├── package.json       # Backend dependencies
└── README.md
```

## Running it locally

### Option 1 — Just the frontend (fastest, no AI chat)
Every agent except the AI Career Assistant chat works entirely in the
browser. Just open `index.html` directly, or serve the folder with any
static server, e.g.:
```bash
npx serve .
```

### Option 2 — Full app, including the AI Career Assistant chat
```bash
npm install
```
Create a `.env` file in the project root with your Anthropic API key:
```
ANTHROPIC_API_KEY=your_key_here
```
Then start the server:
```bash
npm start
```
Open `http://localhost:3000` (or whatever port `server.js` logs).

## Note on the live GitHub Pages demo

GitHub Pages only serves static files — it can't run `server.js`. That
means on the [live demo link](https://sniya06.github.io/Synora-AI/):

- ✅ Resume Agent, Matchmaking, Skill Gap, Opportunity feed, Mock Interview,
  and Scam Detection all work fully — they run entirely client-side.
- ⚠️ The **AI Career Assistant chat** falls back to a local rule-based
  responder instead of a live Claude-powered reply, since it has no backend
  to call. Run the app locally (Option 2 above) to see the full AI chat
  experience.

## About the Resume Agent

Unlike a typical demo that shows the same canned result for every upload,
the Resume Agent actually reads your file:

- Extracts real text from PDF/DOCX/TXT (or accepts pasted resume text as a fallback)
- Detects skills against a ~65-keyword list spanning AI, web dev, cyber security and data science
- Pulls real Projects / Certifications / Experience sections from your resume's own headings
- Checks for an email, phone number, LinkedIn and GitHub link
- Computes a transparent 0–100 score from what it actually finds
- Gives specific, actionable suggestions (e.g. "add measurable outcomes," "no GitHub link found")

---

Built by [Sniya](https://github.com/Sniya06) — Computer Science and
Engineering, Sri Shakthi Institute of Engineering and Technology.
