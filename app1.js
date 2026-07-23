/* ==========================================================
   SYNORA AI — APPLICATION LOGIC
   Vanilla JS. No frameworks. Section switching, localStorage,
   and a live Claude-powered AI Career Assistant routed through
   our own /api/chat backend (see server.js and callAgentAPI()),
   with a local rule-based fallback (routeAgentReply()) if that
   backend isn't reachable.
========================================================== */

/* ---------------- Mock data ---------------- */
const OPPORTUNITIES = [
  { id:1, type:'Jobs', company:'Nimbus Systems', role:'Frontend Engineer', location:'Bengaluru (Remote)', domain:'Web Development', match:91, deadline:'Aug 3' },
  { id:2, type:'Jobs', company:'Verinet Labs', role:'ML Engineer I', location:'Hyderabad', domain:'AI', match:84, deadline:'Aug 10' },
  { id:3, type:'Jobs', company:'Cobalt Security', role:'SOC Analyst', location:'Pune', domain:'Cyber Security', match:76, deadline:'Aug 6' },
  { id:4, type:'Internships', company:'Quanta Analytics', role:'Data Science Intern', location:'Remote', domain:'Data Science', match:88, deadline:'Jul 30' },
  { id:5, type:'Internships', company:'Pixel Forge', role:'Full Stack Intern', location:'Chennai', domain:'Web Development', match:93, deadline:'Aug 2' },
  { id:6, type:'Internships', company:'Sentra AI', role:'AI Research Intern', location:'Remote', domain:'AI', match:80, deadline:'Aug 14' },
  { id:7, type:'Hackathons', company:'Unstop', role:'BuildForBharat 3.0', location:'Online', domain:'AI', match:95, deadline:'Aug 5' },
  { id:8, type:'Hackathons', company:'Devfolio', role:'HackCoimbatore', location:'Coimbatore', domain:'Web Development', match:89, deadline:'Aug 18' },
  { id:9, type:'Hackathons', company:'GitHub', role:'SecureHack CTF', location:'Online', domain:'Cyber Security', match:82, deadline:'Aug 9' },
];

const SKILLS_BY_DOMAIN = {
  'AI': { current:['Python','NumPy','Pandas','Git'], missing:['PyTorch','LangChain','Prompt Engineering','MLOps'] },
  'Web Development': { current:['HTML','CSS','JavaScript','Git'], missing:['React','Node.js','REST APIs','TypeScript'] },
  'Cyber Security': { current:['Networking Basics','Linux','Git'], missing:['Penetration Testing','SIEM Tools','Cryptography','OWASP Top 10'] },
  'Data Science': { current:['Python','Pandas','SQL','Git'], missing:['Scikit-learn','Statistics','Data Visualization','Deep Learning'] },
};

const COURSES = ['Neural Networks Specialization','Full Stack Open','Practical Ethical Hacking','Applied Data Science with Python'];

/* Master keyword list the Resume Agent scans uploaded text against.
   Kept broad (not domain-locked) since we don't know what's actually
   in a given resume until we've read it. */
const SKILL_KEYWORDS = [
  'Python','Java','C++','C#','JavaScript','TypeScript','Go','Rust','Kotlin','Swift',
  'HTML','CSS','SASS','Tailwind CSS','Bootstrap','React','React Native','Angular','Vue.js','Next.js','Redux',
  'Node.js','Express.js','Django','Flask','Spring Boot','REST API','GraphQL','FastAPI',
  'MongoDB','MySQL','PostgreSQL','SQLite','Firebase','Redis','SQL',
  'Git','GitHub','Docker','Kubernetes','Jenkins','CI/CD','AWS','Azure','GCP','Linux',
  'Machine Learning','Deep Learning','NumPy','Pandas','Scikit-learn','TensorFlow','PyTorch','Keras',
  'NLP','Computer Vision','OpenCV','Data Structures','Algorithms','OOP','LangChain','Prompt Engineering',
  'Networking','Penetration Testing','Cryptography','OWASP','SIEM','Cyber Security','Ethical Hacking',
  'Data Visualization','Power BI','Tableau','Excel','Statistics',
  'Figma','UI/UX','Postman','Jira','Agile','Scrum'
];

/* Section headings the Resume Agent looks for while parsing raw resume text. */
const SECTION_PATTERNS = {
  projects: /^(projects?|academic projects?|personal projects?)\s*:?\s*$/i,
  certifications: /^(certifications?|certificates?|courses?)\s*:?\s*$/i,
  experience: /^(experience|work experience|internships?|professional experience)\s*:?\s*$/i,
  education: /^(education|academic background)\s*:?\s*$/i,
  skills: /^(skills|technical skills|core competencies)\s*:?\s*$/i,
};

const ACTION_VERBS = ['built','developed','designed','led','created','implemented','optimized','improved',
  'managed','launched','engineered','automated','architected','reduced','increased','deployed',
  'collaborated','analyzed','achieved','organized','mentored','streamlined','delivered'];

const INTERVIEW_QUESTIONS = [
  'Tell me about a project you are most proud of and why.',
  'How would you approach debugging a production issue you have never seen before?',
  'Explain a technical concept from your domain to a non-technical person.',
  'Describe a time you disagreed with a teammate. How did you resolve it?',
  'Where do you want to be in your career three years from now?',
];

const SCAM_FLAGS = [
  { pattern:/registration fee|processing fee|security deposit/i, label:'Asks for an upfront fee or deposit' },
  { pattern:/whatsapp only|telegram only|contact.{0,15}whatsapp/i, label:'Pushes communication to an unofficial chat app' },
  { pattern:/no interview|instant offer|guaranteed job/i, label:'Promises a job with no real interview' },
  { pattern:/aadhaar|bank details|otp|pan card/i, label:'Requests sensitive personal or financial documents early' },
  { pattern:/urgent(ly)? hiring|limited seats|hurry/i, label:'Uses high-pressure urgency language' },
  { pattern:/\$\$\$|earn.{0,10}per day|work from home.{0,10}no experience/i, label:'Unrealistic pay-for-no-experience claims' },
];

/* ---------------- State ---------------- */
let state = {
  profile: null,
  chatHistory: [],
  bookmarks: [],
  oppTab: 'Jobs',
  interview: { qIndex:0, scores:[], active:false },
  resumeAnalyzed: false,
};

/* ---------------- Boot ---------------- */
window.addEventListener('DOMContentLoaded', () => {
  const savedDark = localStorage.getItem('synora_dark');
  const savedBookmarks = localStorage.getItem('synora_bookmarks');
  if (savedBookmarks) state.bookmarks = JSON.parse(savedBookmarks);
  if (savedDark === 'false') {
    document.body.classList.add('light');
    const t = document.getElementById('dark-mode-toggle');
    if (t) t.checked = false;
  }

  // Restore a logged-in account session (persistent if "remember me" was
  // checked, tab-only otherwise).
  const session = getSession();
  if (session && session.email) {
    const users = getUsers();
    const u = users[session.email];
    if (u) {
      if (u.onboarded) {
        state.profile = buildProfileFromUser(u);
        enterApp();
      } else {
        document.getElementById('ob-name').value = u.name;
        goToScreen('screen-onboarding');
      }
      return;
    }
  }

  // Restore a guest session (tab-only, never persisted to localStorage).
  const guestProfile = sessionStorage.getItem('synora_guest');
  if (guestProfile) {
    state.profile = JSON.parse(guestProfile);
    enterApp();
  }
});

/* ---------------- Accounts store ----------------
   NOTE: this is a client-only demo. Passwords are run through a small
   obfuscation hash before being written to localStorage so they are not
   sitting around in plain text, but this is NOT real cryptographic
   security — a production build must verify credentials against a real
   backend (bcrypt/argon2, HTTPS, etc). */
function getUsers(){ return JSON.parse(localStorage.getItem('synora_users') || '{}'); }
function saveUsers(users){ localStorage.setItem('synora_users', JSON.stringify(users)); }

function hashPassword(pw){
  let hash = 0;
  for (let i = 0; i < pw.length; i++){
    hash = (hash << 5) - hash + pw.charCodeAt(i);
    hash |= 0;
  }
  return 'h' + Math.abs(hash).toString(36) + pw.length;
}

function getPasswordStrength(pw){
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (!pw) return { label:'', pct:0, class:'' };
  if (score <= 1) return { label:'Weak', pct:30, class:'weak' };
  if (score <= 3) return { label:'Medium', pct:65, class:'medium' };
  return { label:'Strong', pct:100, class:'strong' };
}

function isValidEmail(email){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function isValidProfileUrl(url, mustContain){
  if (!url) return true; // optional fields
  try {
    const u = new URL(url);
    return u.hostname.toLowerCase().includes(mustContain);
  } catch (e) { return false; }
}

function buildProfileFromUser(u){
  return {
    name: u.name, email: u.email, github: u.github || '', linkedin: u.linkedin || '',
    college: u.college || 'Not specified', year: u.year || '1st Year',
    branch: u.branch || 'Not specified', domain: u.domain || 'AI',
    interests: (u.interests && u.interests.length) ? u.interests : ['Jobs'],
    joinedAt: u.joinedAt, isGuest:false,
  };
}

/* ---------------- Session ---------------- */
// Logins are always persisted to localStorage now, so users stay logged in
// across tab closes / browser restarts regardless of the "Remember me"
// checkbox. The checkbox is kept in the UI but no longer gates persistence.
function persistSession(email, remember){
  const payload = JSON.stringify({ email });
  localStorage.setItem('synora_session', payload);
  sessionStorage.removeItem('synora_session');
}
function getSession(){
  const s = sessionStorage.getItem('synora_session') || localStorage.getItem('synora_session');
  return s ? JSON.parse(s) : null;
}
function clearSession(){
  localStorage.removeItem('synora_session');
  sessionStorage.removeItem('synora_session');
}

/* ---------------- Auth modal ---------------- */
function openAuthModal(mode){
  document.getElementById('modal-auth').classList.add('active');
  switchAuthTab(mode === 'signup' ? 'signup' : 'login');
}
function closeAuthModal(){ document.getElementById('modal-auth').classList.remove('active'); }

function switchAuthTab(tab){
  const isLogin = tab !== 'signup';
  document.getElementById('tab-login-btn').classList.toggle('active', isLogin);
  document.getElementById('tab-signup-btn').classList.toggle('active', !isLogin);
  document.getElementById('form-login').classList.toggle('hidden', !isLogin);
  document.getElementById('form-signup').classList.toggle('hidden', isLogin);
  document.getElementById('login-error').textContent = '';
  document.getElementById('signup-error').textContent = '';
}

function togglePasswordVisibility(inputId, btn){
  const input = document.getElementById(inputId);
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.textContent = show ? '🙈' : '👁';
  btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
}

function updatePasswordStrength(){
  const pw = document.getElementById('signup-password').value;
  const s = getPasswordStrength(pw);
  const fill = document.getElementById('strength-fill');
  const label = document.getElementById('strength-label');
  fill.style.width = s.pct + '%';
  fill.className = 'strength-fill ' + s.class;
  label.textContent = pw ? 'Password strength: ' + s.label : '\u00A0';
}

function handleLogin(e){
  e.preventDefault();
  const errBox = document.getElementById('login-error');
  errBox.textContent = '';

  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const password = document.getElementById('login-password').value;
  const remember = document.getElementById('login-remember').checked;

  const users = getUsers();
  const u = users[email];
  if (!u || u.passwordHash !== hashPassword(password)){
    errBox.textContent = 'Invalid email or password.';
    return false;
  }

  persistSession(email, remember);
  closeAuthModal();

  if (u.onboarded){
    state.profile = buildProfileFromUser(u);
    enterApp();
  } else {
    document.getElementById('ob-name').value = u.name;
    goToScreen('screen-onboarding');
  }
  return false;
}

function handleSignup(e){
  e.preventDefault();
  const errBox = document.getElementById('signup-error');
  errBox.textContent = '';

  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim().toLowerCase();
  const github = document.getElementById('signup-github').value.trim();
  const linkedin = document.getElementById('signup-linkedin').value.trim();
  const password = document.getElementById('signup-password').value;
  const confirm = document.getElementById('signup-confirm').value;
  const remember = document.getElementById('signup-remember').checked;

  if (!name){ errBox.textContent = 'Enter your full name.'; return false; }
  if (!isValidEmail(email)){ errBox.textContent = 'Enter a valid email address.'; return false; }

  const users = getUsers();
  if (users[email]){ errBox.textContent = 'An account with this email already exists — try logging in instead.'; return false; }

  if (!isValidProfileUrl(github, 'github.com')){ errBox.textContent = 'Enter a valid GitHub profile URL (e.g. https://github.com/username).'; return false; }
  if (!isValidProfileUrl(linkedin, 'linkedin.com')){ errBox.textContent = 'Enter a valid LinkedIn profile URL (e.g. https://linkedin.com/in/username).'; return false; }

  const strength = getPasswordStrength(password);
  if (strength.label === 'Weak' || !strength.label){
    errBox.textContent = 'Choose a stronger password: 8+ characters, mixing letters, numbers, and a symbol.';
    return false;
  }
  if (password !== confirm){ errBox.textContent = 'Passwords do not match.'; return false; }

  const user = {
    name, email, passwordHash: hashPassword(password), github, linkedin,
    joinedAt: new Date().toISOString(), onboarded: false,
  };
  users[email] = user;
  saveUsers(users);
  persistSession(email, remember);
  closeAuthModal();

  document.getElementById('ob-name').value = name;
  goToScreen('screen-onboarding');
  return false;
}

function handleGoogleLogin(){
  // Demo placeholder — wire this up to real Google OAuth server-side.
  // Treated as an ephemeral guest-style session for now.
  clearSession();
  closeAuthModal();
  goToScreen('screen-onboarding');
}
function handleGuestLogin(){
  clearSession();
  closeAuthModal();
  goToScreen('screen-onboarding');
}

function goToScreen(id){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0,0);
}

/* ---------------- Onboarding ---------------- */
let obSelections = { interests: [], domain: null };

document.addEventListener('click', (e) => {
  if (e.target.matches('#ob-interests .chip')){
    e.target.classList.toggle('selected');
    const v = e.target.dataset.value;
    if (obSelections.interests.includes(v)) obSelections.interests = obSelections.interests.filter(i => i !== v);
    else obSelections.interests.push(v);
  }
  if (e.target.matches('#ob-domain .chip')){
    document.querySelectorAll('#ob-domain .chip').forEach(c => c.classList.remove('selected'));
    e.target.classList.add('selected');
    obSelections.domain = e.target.dataset.value;
  }
  if (e.target.matches('#edit-interests .chip')){
    e.target.classList.toggle('selected');
  }
});

function goToStep(step){
  for (let i = 1; i <= 3; i++){
    document.getElementById(`ob-panel-${i}`).classList.toggle('hidden', i !== step);
    const stepEl = document.querySelector(`.ob-step[data-step="${i}"]`);
    stepEl.classList.toggle('active', i === step);
    stepEl.classList.toggle('done', i < step);
  }
}

function finishOnboarding(){
  const name = document.getElementById('ob-name').value.trim() || 'Guest';
  const college = document.getElementById('ob-college').value.trim() || 'Not specified';
  const year = document.getElementById('ob-year').value;
  const branch = document.getElementById('ob-branch').value.trim() || 'Not specified';
  const domain = obSelections.domain || 'AI';
  const interests = obSelections.interests.length ? obSelections.interests : ['Jobs'];

  const session = getSession();
  if (session && session.email){
    const users = getUsers();
    const existing = users[session.email] || { email: session.email, joinedAt: new Date().toISOString() };
    const merged = { ...existing, name, college, year, branch, domain, interests, onboarded: true };
    users[session.email] = merged;
    saveUsers(users);
    state.profile = buildProfileFromUser(merged);
  } else {
    state.profile = {
      name, college, year, branch, domain, interests, github:'', linkedin:'',
      joinedAt: new Date().toISOString(), isGuest: true,
    };
    sessionStorage.setItem('synora_guest', JSON.stringify(state.profile));
  }
  enterApp();
}

/* ---------------- Enter main app ---------------- */
function enterApp(){
  goToScreen('screen-app');
  const p = state.profile;
  document.getElementById('sidebar-name').textContent = p.name;
  document.getElementById('sidebar-domain').textContent = p.domain;
  document.getElementById('dash-name').textContent = p.name.split(' ')[0];
  document.getElementById('avatar-init');
  document.querySelector('.avatar').textContent = p.name.charAt(0).toUpperCase();

  renderDashboard();
  renderMatchCards();
  renderSkillGap();
  renderOpportunities();
  renderFullTimeline();
  renderSettingsProfile();
  renderProfileView();
  seedChatWelcome();
}

/* ---------------- View switching ---------------- */
function showView(targetId, btn){
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(targetId).classList.add('active');
  document.querySelectorAll('.side-link').forEach(l => l.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('sidebar').classList.remove('open');
  document.querySelector('.main-content').scrollTo(0,0);
}
function toggleSidebar(){ document.getElementById('sidebar').classList.toggle('open'); }
function scrollToId(id){ document.getElementById(id).scrollIntoView({behavior:'smooth'}); }

/* ---------------- Dashboard ---------------- */
function renderDashboard(){
  const top3 = [...OPPORTUNITIES].sort((a,b)=>b.match-a.match).slice(0,3);
  const list = document.getElementById('dash-recommended');
  list.innerHTML = top3.map(o => `
    <div class="mini-item">
      <div><div class="mi-title">${o.role}</div><div class="mi-sub">${o.company} · ${o.type}</div></div>
      <div class="mi-pct">${o.match}%</div>
    </div>`).join('');

  const skills = SKILLS_BY_DOMAIN[state.profile.domain] || SKILLS_BY_DOMAIN['AI'];
  document.getElementById('dash-missing-skills').innerHTML = skills.missing.map(s => `<span>${s}</span>`).join('');

  const milestones = ['Resume Created','Skill Gap Mapped','Applied to Jobs','Hackathon Joined','Interview Practiced'];
  document.getElementById('dash-timeline').innerHTML = milestones.map((m,i) => `<div class="mt-item ${i < 2 ? 'done':''}">${m}</div>`).join('');

  document.getElementById('dash-activity').innerHTML = `
    <li><b>Onboarding</b> completed — welcome to Synora.</li>
    <li><b>Resume Agent</b> ready to score your resume.</li>
    <li><b>${skills.missing.length} skill gaps</b> identified for ${state.profile.domain}.</li>
  `;
}

function quickAction(action){
  showView('view-chat', document.querySelector('[data-target="view-chat"]'));
  sendQuickPrompt(action === 'Analyze Resume' ? 'Analyze my resume' :
    action === 'Find Jobs' ? 'Find jobs for me' :
    action === 'Skill Gap' ? 'What is my skill gap?' : 'Start a mock interview');
}

/* ---------------- Chat ---------------- */
function seedChatWelcome(){
  if (state.chatHistory.length) return;
  addMessage('ai', `Hi ${state.profile.name.split(' ')[0]}! I'm your Synora orchestrator. Ask me to analyze your resume, find opportunities, close a skill gap, or run a mock interview — I'll route it to the right agent.`);
}

function addMessage(role, text){
  state.chatHistory.push({role, text});
  const win = document.getElementById('chat-window');
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.textContent = text;
  win.appendChild(div);
  win.scrollTop = win.scrollHeight;
}

function handleChatSubmit(e){
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return false;
  input.value = '';
  addMessage('user', text);
  simulateAgentReply(text);
  return false;
}

function sendQuickPrompt(text){
  showView('view-chat', document.querySelector('[data-target="view-chat"]'));
  addMessage('user', text);
  simulateAgentReply(text);
}

async function simulateAgentReply(text){
  const indicator = document.getElementById('typing-indicator');
  indicator.classList.remove('hidden');
  document.getElementById('chat-window').scrollTop = document.getElementById('chat-window').scrollHeight;

  const reply = await callAgentAPI(text);

  indicator.classList.add('hidden');
  addMessage('ai', reply);
}

function setAiStatus(isLive){
  const el = document.getElementById('ai-status');
  if (!el) return;
  el.textContent = isLive ? '● live AI' : '● local demo mode';
  el.classList.toggle('live', isLive);
  el.classList.toggle('offline', !isLive);
}

function buildSystemPrompt(){
  const p = state.profile;
  const skills = SKILLS_BY_DOMAIN[p.domain] || SKILLS_BY_DOMAIN['AI'];
  return `You are Synora, an AI career orchestrator helping a student named ${p.name.split(' ')[0]} plan and run their job/internship/hackathon search.

Student profile: ${p.year} ${p.branch} student at ${p.college}, targeting the ${p.domain} domain, interested in ${p.interests.join(', ')}.
Current skills: ${skills.current.join(', ')}.
Skill gaps to close: ${skills.missing.join(', ')}.

You coordinate six specialist agents the student can open from the sidebar: Resume Agent, Matchmaking Agent, Skill Gap Agent, Opportunity Agent, Interview Agent, and Scam Detection Agent. When a question fits one of them, mention which tab to open.

Be warm, specific, and encouraging. Ground advice in the profile above. Keep replies under 130 words and avoid generic filler.`;
}

function buildApiMessages(){
  const hist = state.chatHistory.slice(-12);
  const firstUserIdx = hist.findIndex(m => m.role === 'user');
  const trimmed = firstUserIdx === -1 ? [] : hist.slice(firstUserIdx);
  return trimmed.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
}

/* Real call to Claude, routed through our own /api/chat backend (see
   server.js) so the Anthropic API key stays server-side and never ships
   to the browser. Falls back to the local rule-based routeAgentReply()
   below if the backend isn't running or the call fails for any reason
   (no key configured, offline, rate limited, etc.) so the app never
   breaks — it just quietly drops back to demo mode. */
async function callAgentAPI(promptText){
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: buildSystemPrompt(),
        messages: buildApiMessages(),
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || ('AI request failed: ' + response.status));
    const text = (data.content || [])
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')
      .trim();
    if (!text) throw new Error('Empty AI response');
    setAiStatus(true);
    return text;
  } catch (err){
    console.warn('Live AI unavailable, using local agent logic instead:', err);
    setAiStatus(false);
    return routeAgentReply(promptText);
  }
}

function routeAgentReply(text){
  const t = text.toLowerCase();
  const domain = state.profile.domain;
  if (t.includes('resume')){
    return `Resume Agent: your latest resume scores 72/100. Strong on projects, but add measurable outcomes (e.g. "reduced load time by 30%") and 2 more ${domain}-relevant keywords. Open the Resume Agent tab for the full breakdown.`;
  }
  if (t.includes('job')){
    const jobs = OPPORTUNITIES.filter(o => o.type === 'Jobs').sort((a,b)=>b.match-a.match).slice(0,2);
    return `Matchmaking Agent found ${jobs.length} strong job matches:\n${jobs.map(j=>`• ${j.role} at ${j.company} — ${j.match}% fit`).join('\n')}\nSee all in the Matchmaking tab.`;
  }
  if (t.includes('internship')){
    const items = OPPORTUNITIES.filter(o => o.type === 'Internships').sort((a,b)=>b.match-a.match).slice(0,2);
    return `Matchmaking Agent found internships:\n${items.map(j=>`• ${j.role} at ${j.company} — ${j.match}% fit`).join('\n')}`;
  }
  if (t.includes('hackathon')){
    const items = OPPORTUNITIES.filter(o => o.type === 'Hackathons').sort((a,b)=>b.match-a.match).slice(0,2);
    return `Opportunity Agent found upcoming hackathons:\n${items.map(j=>`• ${j.role} (${j.company}) — deadline ${j.deadline}`).join('\n')}`;
  }
  if (t.includes('skill')){
    const s = SKILLS_BY_DOMAIN[domain];
    return `Skill Gap Agent: for ${domain}, you're missing ${s.missing.slice(0,2).join(' and ')}. I'd start with "${COURSES[0]}" this week — check the Skill Gap tab for the full path.`;
  }
  if (t.includes('interview')){
    return `Interview Agent is ready. Head to the Mock Interview tab and hit "Start Interview" — I'll ask 5 questions and grade each answer.`;
  }
  if (t.includes('advice') || t.includes('career')){
    return `Career advice: your AI Match Score is strongest in ${domain}. Spend this week closing your top skill gap and applying to your top 3 matches before their deadlines — momentum compounds.`;
  }
  return `Got it — I'll treat that as a general query. Try asking me to "find jobs", "analyze my resume", "check my skill gap", or "start a mock interview" so I can route it to the right agent.`;
}

/* ---------------- Resume Agent ---------------- */
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

function handleResumeDrop(e){
  e.preventDefault();
  e.currentTarget.classList.remove('drag');
  const file = e.dataTransfer.files[0];
  if (file) processResumeFile(file);
}
function handleResumeSelect(e){
  const file = e.target.files[0];
  if (file) processResumeFile(file);
}

function togglePasteResume(){
  const block = document.getElementById('resume-paste-block');
  const btn = document.getElementById('paste-toggle-btn');
  const nowHidden = block.classList.toggle('hidden');
  btn.textContent = nowHidden ? "Can't upload a file? Paste your resume text instead ▾" : "Hide paste box ▴";
}

function analyzePastedResume(){
  const text = document.getElementById('resume-paste-text').value.trim();
  const errBox = document.getElementById('resume-error');
  errBox.textContent = '';
  if (text.length < 40){
    errBox.textContent = 'Paste a bit more of your resume — that looked too short to analyze.';
    return;
  }
  document.getElementById('resume-filename').textContent = '✓ Analyzed pasted resume text';
  renderResumeAnalysis(analyzeResumeText(text));
}

/* Reads a File object (pdf / docx / txt) and returns its raw text. */
async function extractTextFromFile(file){
  const name = file.name.toLowerCase();
  if (name.endsWith('.txt')){
    return await file.text();
  }
  if (name.endsWith('.pdf')){
    if (!window.pdfjsLib) throw new Error('PDF reader failed to load. Try pasting your resume text instead.');
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++){
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(it => it.str).join(' ') + '\n';
    }
    return text;
  }
  if (name.endsWith('.docx')){
    if (!window.mammoth) throw new Error('DOCX reader failed to load. Try pasting your resume text instead.');
    const buf = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    return result.value;
  }
  throw new Error('Unsupported file type. Upload a PDF, DOCX or TXT — or paste your resume text below.');
}

async function processResumeFile(file){
  const filenameEl = document.getElementById('resume-filename');
  const errBox = document.getElementById('resume-error');
  errBox.textContent = '';
  filenameEl.textContent = `Analyzing "${file.name}"...`;
  try {
    const text = await extractTextFromFile(file);
    if (!text || text.trim().length < 40){
      throw new Error('Could not find readable text in that file. If it\'s a scanned image, try pasting the text instead.');
    }
    filenameEl.textContent = `✓ Analyzed "${file.name}"`;
    renderResumeAnalysis(analyzeResumeText(text));
  } catch (err) {
    filenameEl.textContent = 'No file analyzed yet.';
    errBox.textContent = err.message || 'Something went wrong reading that file.';
  }
}

/* Pulls the lines that sit under a given section heading out of the resume,
   stopping at the next recognized heading. */
function extractSectionItems(lines, patternKey){
  const pattern = SECTION_PATTERNS[patternKey];
  const allHeadingPatterns = Object.values(SECTION_PATTERNS);
  const startIdx = lines.findIndex(l => pattern.test(l.trim()));
  if (startIdx === -1) return [];
  const items = [];
  for (let i = startIdx + 1; i < lines.length; i++){
    const line = lines[i].trim();
    if (!line) continue;
    if (allHeadingPatterns.some(p => p.test(line))) break;
    items.push(line.replace(/^[-•*▪◦]\s*/, ''));
    if (items.length >= 6) break;
  }
  return items;
}

/* Core analysis: turns raw resume text into skills, sections, checks,
   a 0-100 score and concrete suggestions. */
function analyzeResumeText(text){
  const cleanText = text.replace(/\r/g, '');
  const lines = cleanText.split('\n').filter(l => l.trim().length);
  const lower = cleanText.toLowerCase();
  const wordCount = (cleanText.match(/\S+/g) || []).length;

  const skillsFound = SKILL_KEYWORDS.filter(skill => {
    const escaped = skill.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(lower);
  });

  const projects = extractSectionItems(lines, 'projects');
  const certifications = extractSectionItems(lines, 'certifications');
  const experience = extractSectionItems(lines, 'experience');

  const hasEmail = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(cleanText);
  const hasPhone = /(\+?\d[\d\s-]{8,}\d)/.test(cleanText);
  const hasLinkedIn = /linkedin\.com/i.test(cleanText);
  const hasGithub = /github\.com/i.test(cleanText);
  const quantifiedCount = (cleanText.match(/\d+(\.\d+)?\s?%|\b\d{2,}\+?\b/g) || []).length;
  const actionVerbCount = ACTION_VERBS.filter(v => new RegExp(`\\b${v}`, 'i').test(lower)).length;

  // ---- Scoring (transparent, additive, capped 0-100) ----
  let score = 30;
  score += Math.min(skillsFound.length * 2, 20);       // up to 20 for skills
  score += projects.length ? Math.min(5 + projects.length * 2, 15) : 0;
  score += certifications.length ? 8 : 0;
  score += experience.length ? 10 : 0;
  score += Math.min(quantifiedCount * 2, 10);          // measurable outcomes
  score += Math.min(actionVerbCount, 8);               // strong action verbs
  score += hasEmail ? 3 : 0;
  score += hasPhone ? 2 : 0;
  score += hasLinkedIn ? 2 : 0;
  score += hasGithub ? 2 : 0;
  if (wordCount < 120) score -= 10;      // likely too thin
  if (wordCount > 1400) score -= 5;      // likely too long for a student resume
  score = Math.max(10, Math.min(100, Math.round(score)));

  // ---- Suggestions ----
  const suggestions = [];
  if (quantifiedCount < 2) suggestions.push({ ok:false, text:'Add measurable outcomes to your bullet points — numbers, percentages, or scale (e.g. "reduced load time by 30%").' });
  if (skillsFound.length < 6) suggestions.push({ ok:false, text:'List more relevant technical skills explicitly — ATS filters and recruiters scan for exact keywords.' });
  if (!certifications.length) suggestions.push({ ok:false, text:'Add a Certifications section — even free courses (NPTEL, Coursera) show initiative.' });
  if (!projects.length) suggestions.push({ ok:false, text:'Add a Projects section with 2-3 entries — this matters more than GPA for most tech roles.' });
  if (!hasGithub) suggestions.push({ ok:false, text:'Add your GitHub profile link so recruiters can see your code.' });
  if (!hasLinkedIn) suggestions.push({ ok:false, text:'Add your LinkedIn profile link.' });
  if (actionVerbCount < 4) suggestions.push({ ok:false, text:'Start more bullet points with strong action verbs — Built, Led, Designed, Optimized.' });
  if (wordCount < 120) suggestions.push({ ok:false, text:'Your resume looks quite short — flesh out your projects and experience sections.' });
  if (wordCount > 1400) suggestions.push({ ok:false, text:'Your resume looks long — for a student resume, aim to keep it to about one page.' });
  if (!suggestions.length) suggestions.push({ ok:true, text:'Solid resume — skills, sections and contact details are all well covered.' });

  return {
    score, skillsFound, projects, certifications, experience,
    hasEmail, hasPhone, hasLinkedIn, hasGithub, quantifiedCount, actionVerbCount, wordCount,
    suggestions,
  };
}

function checkListItem(ok, label){
  return `<li class="${ok ? 'ok' : 'warn'}"><span class="ci">${ok ? '✓' : '✕'}</span><span>${label}</span></li>`;
}

function renderResumeAnalysis(analysis){
  // Before any upload, show a light placeholder state rather than fake data.
  if (!analysis){
    document.getElementById('resume-skills').innerHTML = '<span class="empty-note">Upload a resume to detect skills.</span>';
    document.getElementById('resume-projects').innerHTML = '<li class="empty-note" style="list-style:none;">Nothing analyzed yet.</li>';
    document.getElementById('resume-certs').innerHTML = '<li class="empty-note" style="list-style:none;">Nothing analyzed yet.</li>';
    document.getElementById('resume-experience').innerHTML = '<li class="empty-note" style="list-style:none;">Nothing analyzed yet.</li>';
    document.getElementById('resume-checks').innerHTML = '';
    document.getElementById('resume-suggestions').innerHTML = '<li class="empty-note" style="list-style:none;">Upload or paste your resume to get personalized suggestions.</li>';
    return;
  }

  document.getElementById('resume-skills').innerHTML = analysis.skillsFound.length
    ? analysis.skillsFound.map(s => `<span>${s}</span>`).join('')
    : '<span class="empty-note">No recognized skill keywords found — try listing them explicitly.</span>';

  document.getElementById('resume-projects').innerHTML = analysis.projects.length
    ? analysis.projects.map(p => `<li>${p}</li>`).join('')
    : '<li class="empty-note" style="list-style:none;">No "Projects" section detected.</li>';

  document.getElementById('resume-certs').innerHTML = analysis.certifications.length
    ? analysis.certifications.map(c => `<li>${c}</li>`).join('')
    : '<li class="empty-note" style="list-style:none;">No "Certifications" section detected.</li>';

  document.getElementById('resume-experience').innerHTML = analysis.experience.length
    ? analysis.experience.map(x => `<li>${x}</li>`).join('')
    : '<li class="empty-note" style="list-style:none;">No "Experience" section detected.</li>';

  document.getElementById('resume-checks').innerHTML = [
    checkListItem(analysis.hasEmail, 'Email address found'),
    checkListItem(analysis.hasPhone, 'Phone number found'),
    checkListItem(analysis.hasLinkedIn, 'LinkedIn link found'),
    checkListItem(analysis.hasGithub, 'GitHub link found'),
    checkListItem(analysis.quantifiedCount >= 2, 'Measurable outcomes (numbers/%) found'),
  ].join('');

  document.getElementById('resume-suggestions').innerHTML = analysis.suggestions
    .map(s => checkListItem(s.ok, s.text)).join('');

  // Push the real score into both rings.
  ['score-resume-2','score-resume'].forEach(id => document.getElementById(id).textContent = analysis.score);
  ['ring-resume-2','ring-resume'].forEach(id => document.getElementById(id).style.setProperty('--pct', analysis.score));
  document.getElementById('resume-improve-note').textContent = '';

  state.resumeAnalyzed = true;
  state.lastResumeAnalysis = analysis;
}

// No fake demo data on first load — the Resume Agent starts empty until a real upload.
function initialResumeRender(){ renderResumeAnalysis(null); }

function improveResume(){
  if (!state.resumeAnalyzed){
    document.getElementById('resume-improve-note').textContent = 'Upload or paste your resume first so there\'s something to improve.';
    return;
  }
  const ring = document.getElementById('ring-resume-2');
  const scoreEl = document.getElementById('score-resume-2');
  let current = parseInt(scoreEl.textContent, 10);
  const target = Math.min(current + 14, 96);
  const step = setInterval(() => {
    current += 1;
    scoreEl.textContent = current;
    ring.style.setProperty('--pct', current);
    document.getElementById('score-resume').textContent = current;
    document.getElementById('ring-resume').style.setProperty('--pct', current);
    if (current >= target) clearInterval(step);
  }, 40);
  document.getElementById('resume-improve-note').textContent = 'Applied: stronger action verbs, quantified achievements, and tightened keyword coverage. Re-upload once you\'ve made these edits for a real re-score.';
}

/* ---------------- Matchmaking Agent ---------------- */
function renderMatchCards(){
  const sorted = [...OPPORTUNITIES].sort((a,b)=>b.match-a.match);
  document.getElementById('match-cards').innerHTML = sorted.map(cardTemplate).join('');
}

function cardTemplate(o){
  const bookmarked = state.bookmarks.includes(o.id);
  return `
    <div class="opp-card">
      <div class="opp-top">
        <div><h4>${o.role}</h4><div class="opp-company">${o.company}</div></div>
        <div class="opp-match">${o.match}%</div>
      </div>
      <div class="opp-loc">📍 ${o.location} · ${o.domain}</div>
      <span class="opp-deadline">Deadline: ${o.deadline}</span>
      <div class="opp-actions">
        <button class="btn btn-primary" style="flex:1" onclick="applyTo(${o.id})">Apply</button>
        <button class="bookmark-btn ${bookmarked ? 'active':''}" onclick="toggleBookmark(${o.id}, this)">★</button>
      </div>
    </div>`;
}

function applyTo(id){
  const o = OPPORTUNITIES.find(x=>x.id===id);
  alert(`Application Assist Agent: drafting your application to ${o.company} for "${o.role}". (Demo — hook this up to your backend.)`);
}
function toggleBookmark(id, btn){
  if (state.bookmarks.includes(id)){
    state.bookmarks = state.bookmarks.filter(b=>b!==id);
    btn.classList.remove('active');
  } else {
    state.bookmarks.push(id);
    btn.classList.add('active');
  }
  localStorage.setItem('synora_bookmarks', JSON.stringify(state.bookmarks));
}

/* ---------------- Skill Gap Agent ---------------- */
function renderSkillGap(){
  const s = SKILLS_BY_DOMAIN[state.profile.domain];
  document.getElementById('sg-current').innerHTML = s.current.map(x=>`<span>${x}</span>`).join('');
  document.getElementById('sg-missing').innerHTML = s.missing.map(x=>`<span>${x}</span>`).join('');
  document.getElementById('sg-path').innerHTML = s.missing.map((m,i) => `
    <div class="mini-item" style="margin-bottom:10px;">
      <div><div class="mi-title">Step ${i+1}: Learn ${m}</div><div class="mi-sub">${i===0?'Start now':'~'+(i+1)*2+' weeks out'}</div></div>
      <div class="mi-pct">${i===0? '0%':'—'}</div>
    </div>`).join('');
  document.getElementById('sg-courses').innerHTML = COURSES.map(c => `
    <div class="mini-item"><div class="mi-title">${c}</div><div class="mi-pct">View →</div></div>`).join('');
}

/* ---------------- Opportunity Agent ---------------- */
function setOppTab(tab, btn){
  state.oppTab = tab;
  document.querySelectorAll('.opp-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  renderOpportunities();
}
function renderOpportunities(){
  const search = (document.getElementById('opp-search')?.value || '').toLowerCase();
  const domainFilter = document.getElementById('opp-filter-domain')?.value || '';
  const filtered = OPPORTUNITIES.filter(o => o.type === state.oppTab)
    .filter(o => !domainFilter || o.domain === domainFilter)
    .filter(o => !search || o.role.toLowerCase().includes(search) || o.company.toLowerCase().includes(search) || o.domain.toLowerCase().includes(search))
    .sort((a,b)=>b.match-a.match);
  const grid = document.getElementById('opp-cards');
  grid.innerHTML = filtered.length ? filtered.map(cardTemplate).join('') : `<p class="ob-hint">No results match your filters.</p>`;
}

/* ---------------- Mock Interview Agent ---------------- */
function startInterview(){
  state.interview = { qIndex:0, scores:[], active:true };
  document.getElementById('interview-start-card').classList.add('hidden');
  document.getElementById('interview-done-card').classList.add('hidden');
  document.getElementById('interview-active-card').classList.remove('hidden');
  showInterviewQuestion();
}
function showInterviewQuestion(){
  document.getElementById('interview-qnum').textContent = state.interview.qIndex + 1;
  document.getElementById('interview-question').textContent = INTERVIEW_QUESTIONS[state.interview.qIndex];
  document.getElementById('interview-answer').value = '';
  document.getElementById('interview-feedback').classList.add('hidden');
}
function submitInterviewAnswer(){
  const answer = document.getElementById('interview-answer').value.trim();
  if (!answer){ alert('Type an answer first.'); return; }
  const score = Math.min(10, Math.max(4, Math.round(answer.split(' ').length / 8) + Math.floor(Math.random()*3)));
  state.interview.scores.push(score);
  const feedbacks = [
    'Clear structure, but add a concrete metric to make the impact obvious.',
    'Good instinct — narrow the answer to one specific example next time.',
    'Confident delivery. Tie it back to the role you are targeting.',
    'Solid technical grounding; slow down and define jargon for a mixed panel.',
  ];
  document.getElementById('interview-feedback-text').textContent = feedbacks[Math.floor(Math.random()*feedbacks.length)];
  document.getElementById('interview-answer-score').textContent = score;
  document.getElementById('interview-feedback').classList.remove('hidden');
  document.getElementById('interview-next-btn').textContent = state.interview.qIndex >= INTERVIEW_QUESTIONS.length-1 ? 'See Results →' : 'Next Question →';
}
function nextInterviewQuestion(){
  state.interview.qIndex++;
  if (state.interview.qIndex >= INTERVIEW_QUESTIONS.length){
    const avg = Math.round(state.interview.scores.reduce((a,b)=>a+b,0) / state.interview.scores.length * 10) / 10;
    document.getElementById('interview-active-card').classList.add('hidden');
    document.getElementById('interview-done-card').classList.remove('hidden');
    document.getElementById('interview-final-score').textContent = avg;
    return;
  }
  showInterviewQuestion();
}

/* ---------------- Scam Detection Agent ---------------- */
function analyzeScam(){
  const text = document.getElementById('scam-input').value;
  if (!text.trim()){ alert('Paste a job description first.'); return; }
  const hits = SCAM_FLAGS.filter(f => f.pattern.test(text));
  const trust = Math.max(5, 100 - hits.length * 18);
  let risk = 'Low risk';
  if (trust < 50) risk = 'High risk';
  else if (trust < 78) risk = 'Medium risk';

  document.getElementById('scam-result-card').classList.remove('hidden');
  document.getElementById('scam-indicators-card').classList.remove('hidden');
  document.getElementById('scam-trust-score').textContent = trust;
  document.getElementById('ring-scam').style.setProperty('--pct', trust);
  document.getElementById('scam-risk-level').textContent = risk;
  document.getElementById('scam-indicators').innerHTML = hits.length
    ? hits.map(h => `<li>${h.label}</li>`).join('')
    : '<li>No common scam patterns detected — still verify the company independently.</li>';
}

/* ---------------- Career Timeline ---------------- */
function renderFullTimeline(){
  const items = [
    { title:'Resume Created', sub:'Uploaded and scored by the Resume Agent', done:true },
    { title:'Courses Completed', sub:'First skill-gap course finished', done:false },
    { title:'Applied to Jobs', sub:'Applications sent via Application Assist', done:false },
    { title:'Hackathons Joined', sub:'Registered for a matched hackathon', done:false },
    { title:'Interviews Cleared', sub:'Mock interview score above 7/10', done:false },
    { title:'Offers Received', sub:'Converted an application to an offer', done:false },
  ];
  document.getElementById('full-timeline').innerHTML = items.map(i => `
    <div class="vt-item ${i.done ? 'done':''}"><h4>${i.title}</h4><p>${i.sub}</p></div>`).join('');
}

/* ---------------- Settings ---------------- */
function toggleDarkMode(){
  const isDark = document.getElementById('dark-mode-toggle').checked;
  document.body.classList.toggle('light', !isDark);
  localStorage.setItem('synora_dark', isDark);
}
function renderSettingsProfile(){
  const p = state.profile;
  document.getElementById('settings-profile').innerHTML = `
    <div><b>${p.name}</b></div>
    <div>${p.isGuest ? 'Guest session' : (p.email || '')}</div>
    <div>${p.college}</div>
    <button class="link-btn" style="margin-top:6px;" onclick="showView('view-profile', document.querySelector('[data-target=view-profile]'))">Manage Profile →</button>
  `;
}
function handleLogout(){
  clearSession();
  sessionStorage.removeItem('synora_guest');
  state.profile = null;
  state.chatHistory = [];
  document.getElementById('chat-window').innerHTML = '';
  goToScreen('screen-landing');
}

/* ---------------- Profile dashboard ---------------- */
function renderProfileView(){
  const p = state.profile;
  const initials = (p.name || '?').charAt(0).toUpperCase();
  const joined = p.joinedAt ? new Date(p.joinedAt).toLocaleDateString('en-IN', { year:'numeric', month:'long', day:'numeric' }) : '—';

  document.getElementById('profile-hero').innerHTML = `
    <div class="profile-hero-avatar">${initials}</div>
    <div class="profile-hero-info">
      <h2>${p.name}</h2>
      <p>${p.isGuest ? 'Guest session — not saved to an account' : (p.email || '')}</p>
      <div class="profile-social">
        ${p.github ? `<a href="${p.github}" target="_blank" rel="noopener" class="social-pill">🐙 GitHub</a>` : ''}
        ${p.linkedin ? `<a href="${p.linkedin}" target="_blank" rel="noopener" class="social-pill">in LinkedIn</a>` : ''}
        ${(!p.github && !p.linkedin) ? '<span class="ob-hint" style="margin:0;">No social links added yet — add them via Edit Profile.</span>' : ''}
      </div>
    </div>`;

  document.getElementById('profile-details').innerHTML = `
    <div class="pd-item"><span>College</span><b>${p.college}</b></div>
    <div class="pd-item"><span>Year</span><b>${p.year}</b></div>
    <div class="pd-item"><span>Branch</span><b>${p.branch}</b></div>
    <div class="pd-item"><span>Preferred domain</span><b>${p.domain}</b></div>
    <div class="pd-item"><span>Interested in</span><b>${p.interests.join(', ')}</b></div>
    <div class="pd-item"><span>Member since</span><b>${joined}</b></div>
  `;

  document.getElementById('profile-password-card').classList.toggle('hidden', !!p.isGuest);
  document.getElementById('profile-guest-note').classList.toggle('hidden', !p.isGuest);
}

function toggleProfileEdit(show){
  if (show){
    const p = state.profile;
    document.getElementById('edit-name').value = p.name;
    document.getElementById('edit-college').value = p.college;
    document.getElementById('edit-year').value = p.year;
    document.getElementById('edit-branch').value = p.branch;
    document.getElementById('edit-github').value = p.github || '';
    document.getElementById('edit-linkedin').value = p.linkedin || '';
    document.getElementById('edit-domain').value = p.domain;
    document.querySelectorAll('#edit-interests .chip').forEach(c => {
      c.classList.toggle('selected', p.interests.includes(c.dataset.value));
    });
    document.getElementById('profile-edit-error').textContent = '';
  }
  document.getElementById('profile-view-card').classList.toggle('hidden', show);
  document.getElementById('profile-edit-card').classList.toggle('hidden', !show);
}

function saveProfileEdit(e){
  e.preventDefault();
  const errBox = document.getElementById('profile-edit-error');
  errBox.textContent = '';

  const name = document.getElementById('edit-name').value.trim();
  const college = document.getElementById('edit-college').value.trim() || 'Not specified';
  const year = document.getElementById('edit-year').value;
  const branch = document.getElementById('edit-branch').value.trim() || 'Not specified';
  const domain = document.getElementById('edit-domain').value;
  const github = document.getElementById('edit-github').value.trim();
  const linkedin = document.getElementById('edit-linkedin').value.trim();
  const interests = [...document.querySelectorAll('#edit-interests .chip.selected')].map(c => c.dataset.value);

  if (!name){ errBox.textContent = 'Name is required.'; return false; }
  if (!isValidProfileUrl(github, 'github.com')){ errBox.textContent = 'Enter a valid GitHub profile URL.'; return false; }
  if (!isValidProfileUrl(linkedin, 'linkedin.com')){ errBox.textContent = 'Enter a valid LinkedIn profile URL.'; return false; }
  if (!interests.length){ errBox.textContent = 'Pick at least one interest.'; return false; }

  state.profile = { ...state.profile, name, college, year, branch, domain, interests, github, linkedin };

  if (!state.profile.isGuest){
    const session = getSession();
    const users = getUsers();
    if (session && users[session.email]){
      users[session.email] = { ...users[session.email], name, college, year, branch, domain, interests, github, linkedin };
      saveUsers(users);
    }
  } else {
    sessionStorage.setItem('synora_guest', JSON.stringify(state.profile));
  }

  document.getElementById('sidebar-name').textContent = name;
  document.getElementById('sidebar-domain').textContent = domain;
  document.getElementById('dash-name').textContent = name.split(' ')[0];
  document.querySelector('.avatar').textContent = name.charAt(0).toUpperCase();

  renderDashboard();
  renderSkillGap();
  renderProfileView();
  renderSettingsProfile();
  toggleProfileEdit(false);
  return false;
}

function handleChangePassword(e){
  e.preventDefault();
  const errBox = document.getElementById('password-change-error');
  const okBox = document.getElementById('password-change-success');
  errBox.textContent = '';
  okBox.classList.add('hidden');

  const current = document.getElementById('pwd-current').value;
  const next = document.getElementById('pwd-new').value;
  const confirm = document.getElementById('pwd-confirm').value;

  const session = getSession();
  if (!session){ errBox.textContent = 'You must be logged into an account to change your password.'; return false; }

  const users = getUsers();
  const u = users[session.email];
  if (!u || u.passwordHash !== hashPassword(current)){ errBox.textContent = 'Current password is incorrect.'; return false; }

  const strength = getPasswordStrength(next);
  if (strength.label === 'Weak' || !strength.label){ errBox.textContent = 'Choose a stronger new password (8+ characters, mixed).'; return false; }
  if (next !== confirm){ errBox.textContent = 'New passwords do not match.'; return false; }

  u.passwordHash = hashPassword(next);
  users[session.email] = u;
  saveUsers(users);

  okBox.classList.remove('hidden');
  e.target.reset();
  return false;
}

/* Kick off a default resume analysis so the Resume Agent tab has content
   the first time a user opens it, without requiring an upload. */
document.addEventListener('DOMContentLoaded', () => {
  const check = setInterval(() => {
    if (state.profile){ initialResumeRender(); clearInterval(check); }
  }, 300);
});
