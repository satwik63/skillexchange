const members = [
  {
    id: 1,
    name: "Aria Rao",
    role: "UI/UX Designer",
    teaches: ["Figma", "Wireframing", "Design Systems"],
    wants: ["React", "Motion Graphics"],
    availability: "Available",
    rating: 4.9,
    location: "Bengaluru",
    bio: "I help founders turn rough ideas into polished digital experiences.",
    initials: "AR",
  },
  {
    id: 2,
    name: "Jin Nolan",
    role: "Frontend Developer",
    teaches: ["React", "JavaScript", "Accessibility"],
    wants: ["Brand Strategy", "Illustration"],
    availability: "Available",
    rating: 4.8,
    location: "London",
    bio: "I enjoy fast product builds and collaborative teaching sessions.",
    initials: "JN",
  },
  {
    id: 3,
    name: "Maya Sen",
    role: "Content Strategist",
    teaches: ["Copywriting", "SEO", "Personal Branding"],
    wants: ["Video Editing", "Public Speaking"],
    availability: "Busy",
    rating: 4.7,
    location: "Mumbai",
    bio: "I make ideas clear, memorable, and easier to sell.",
    initials: "MS",
  },
  {
    id: 4,
    name: "Leo Carter",
    role: "Product Manager",
    teaches: ["Roadmapping", "User Research", "Sprint Planning"],
    wants: ["SQL", "Data Visualization"],
    availability: "Available",
    rating: 4.6,
    location: "Toronto",
    bio: "I love helping teams prioritize well and ship with confidence.",
    initials: "LC",
  },
];

const portfolioItems = [
  {
    title: "Community Mentor Board",
    type: "Case Study",
    description:
      "A profile-led experience connecting mentors and learners through verified skill showcases.",
  },
  {
    title: "Swap Session Planner",
    type: "Product Flow",
    description:
      "A booking workflow for planning one-to-one learning exchanges with clear goals and notes.",
  },
  {
    title: "Creative Portfolio Reel",
    type: "Showcase",
    description:
      "A visual library of projects, testimonials, and measurable outcomes for freelancers.",
  },
  {
    title: "Trust Score Dashboard",
    type: "Analytics",
    description:
      "A dashboard concept highlighting response rate, fulfillment, and peer reviews.",
  },
];

const requests = [
  {
    name: "Aria Rao",
    offer: "Figma coaching",
    ask: "React fundamentals",
    schedule: "Weekend sessions",
  },
  {
    name: "Maya Sen",
    offer: "Brand storytelling",
    ask: "Public speaking practice",
    schedule: "Tuesdays, 7 PM",
  },
  {
    name: "Leo Carter",
    offer: "Sprint planning",
    ask: "Data dashboards",
    schedule: "Flexible weekday mornings",
  },
];

const chats = {
  "Aria Rao": [
    { sender: "partner", text: "Hey! I saw you wanted help with design systems.", time: "09:10" },
    { sender: "self", text: "Yes, and I can help with React in exchange.", time: "09:12" },
    { sender: "partner", text: "Perfect. Want to do a 45 minute session tomorrow?", time: "09:13" },
  ],
  "Jin Nolan": [
    { sender: "partner", text: "Your portfolio looks strong. Interested in a skill swap?", time: "11:00" },
    { sender: "self", text: "Absolutely. I can help with content structure.", time: "11:04" },
  ],
  "Maya Sen": [
    { sender: "partner", text: "I can help polish your profile copy if you want.", time: "16:30" },
  ],
};

const state = {
  authMode: "login",
  currentUser: null,
  selectedChat: "Aria Rao",
};

const authToggle = document.getElementById("authToggle");
const joinNow = document.getElementById("joinNow");
const jumpToSearch = document.getElementById("jumpToSearch");
const modeSwitch = document.getElementById("modeSwitch");
const authForm = document.getElementById("authForm");
const authMessage = document.getElementById("authMessage");
const authSubmit = document.getElementById("authSubmit");
const skillField = document.getElementById("skillField");
const nameInput = document.getElementById("nameInput");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const skillInput = document.getElementById("skillInput");
const searchInput = document.getElementById("searchInput");
const availabilityFilter = document.getElementById("availabilityFilter");
const resultsList = document.getElementById("resultsList");
const portfolioGrid = document.getElementById("portfolioGrid");
const requestList = document.getElementById("requestList");
const chatSidebar = document.getElementById("chatSidebar");
const chatThread = document.getElementById("chatThread");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");

function updateAuthUi() {
  const isSignup = state.authMode === "signup";
  modeSwitch.textContent = isSignup ? "Switch to Login" : "Switch to Sign Up";
  authSubmit.textContent = isSignup ? "Create Account" : "Login";
  skillField.style.display = isSignup ? "grid" : "none";
  nameInput.parentElement.style.display = isSignup ? "grid" : "none";
}

function renderResults() {
  const searchTerm = searchInput.value.trim().toLowerCase();
  const filterValue = availabilityFilter.value;
  const filtered = members.filter((member) => {
    const haystack = [
      member.name,
      member.role,
      member.location,
      ...member.teaches,
      ...member.wants,
    ]
      .join(" ")
      .toLowerCase();

    const matchesSearch = haystack.includes(searchTerm);
    const matchesFilter = filterValue === "all" || member.availability === filterValue;
    return matchesSearch && matchesFilter;
  });

  resultsList.innerHTML = filtered
    .map(
      (member) => `
        <article class="result-card">
          <div class="result-top">
            <div class="profile-header">
              <div class="avatar">${member.initials}</div>
              <div>
                <h3>${member.name}</h3>
                <p>${member.role} - ${member.location}</p>
              </div>
            </div>
            <span class="status-badge">${member.availability}</span>
          </div>
          <p>${member.bio}</p>
          <div>
            ${member.teaches.map((skill) => `<span class="skill-pill">Teaches: ${skill}</span>`).join("")}
          </div>
          <div>
            ${member.wants.map((skill) => `<span class="skill-pill">Wants: ${skill}</span>`).join("")}
          </div>
          <div class="result-footer">
            <span>Rating ${member.rating}</span>
            <button class="secondary-button" onclick="selectChat('${member.name}')">Message</button>
          </div>
        </article>
      `
    )
    .join("");
}

function renderPortfolio() {
  portfolioGrid.innerHTML = portfolioItems
    .map(
      (item) => `
        <article class="portfolio-item">
          <p class="eyebrow">${item.type}</p>
          <h3>${item.title}</h3>
          <p>${item.description}</p>
        </article>
      `
    )
    .join("");
}

function renderRequests() {
  requestList.innerHTML = requests
    .map(
      (request) => `
        <article class="request-card">
          <div class="request-top">
            <h3>${request.name}</h3>
            <span class="status-badge">Open</span>
          </div>
          <p>Offers: ${request.offer}</p>
          <p>Needs: ${request.ask}</p>
          <div class="request-meta">
            <span>${request.schedule}</span>
            <span>Skill Swap</span>
          </div>
        </article>
      `
    )
    .join("");
}

function renderChatSidebar() {
  chatSidebar.innerHTML = Object.keys(chats)
    .map((person) => {
      const latest = chats[person][chats[person].length - 1];
      const isActive = state.selectedChat === person ? "active" : "";
      return `
        <button class="chat-person ${isActive}" onclick="selectChat('${person}')">
          <div>
            <h3>${person}</h3>
            <p>${latest.text}</p>
          </div>
          <small>${latest.time}</small>
        </button>
      `;
    })
    .join("");
}

function renderChatThread() {
  const thread = chats[state.selectedChat] || [];
  chatThread.innerHTML = thread
    .map(
      (message) => `
        <article class="chat-bubble ${message.sender}">
          <p>${message.text}</p>
          <small>${message.time}</small>
        </article>
      `
    )
    .join("");
  chatThread.scrollTop = chatThread.scrollHeight;
}

function updateProfile() {
  const name = document.getElementById("profileName");
  const role = document.getElementById("profileRole");
  const bio = document.getElementById("profileBio");
  const avatar = document.getElementById("profileAvatar");
  const status = document.getElementById("profileStatus");
  const tags = document.getElementById("profileTags");
  const hoursShared = document.getElementById("hoursShared");
  const projectsCount = document.getElementById("projectsCount");
  const ratingValue = document.getElementById("ratingValue");

  if (!state.currentUser) {
    name.textContent = "Guest Student";
    role.textContent = "Set up your account to unlock your network.";
    bio.textContent =
      "I want to connect with people who can exchange practical skills and help me build a more diverse portfolio.";
    avatar.textContent = "GS";
    status.textContent = "Guest";
    tags.innerHTML = "<span>Web Design</span><span>Public Speaking</span><span>Mentorship</span>";
    hoursShared.textContent = "16";
    projectsCount.textContent = "8";
    ratingValue.textContent = "4.8";
    return;
  }

  const initials = state.currentUser.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  name.textContent = state.currentUser.name;
  role.textContent = `${state.currentUser.skill} enthusiast building a visible portfolio.`;
  bio.textContent = `I'm using SkillSwap to teach what I know, learn faster from peers, and grow through practical collaboration.`;
  avatar.textContent = initials;
  status.textContent = "Member";
  tags.innerHTML = `<span>${state.currentUser.skill}</span><span>Collaboration</span><span>Peer Learning</span>`;
  hoursShared.textContent = "24";
  projectsCount.textContent = "12";
  ratingValue.textContent = "5.0";
}

function selectChat(person) {
  state.selectedChat = person;
  document.getElementById("chat").scrollIntoView({ behavior: "smooth", block: "start" });
  renderChatSidebar();
  renderChatThread();
}

window.selectChat = selectChat;

authToggle.addEventListener("click", () => {
  document.getElementById("auth").scrollIntoView({ behavior: "smooth", block: "start" });
});

joinNow.addEventListener("click", () => {
  document.getElementById("auth").scrollIntoView({ behavior: "smooth", block: "start" });
});

jumpToSearch.addEventListener("click", () => {
  document.getElementById("discover").scrollIntoView({ behavior: "smooth", block: "start" });
});

modeSwitch.addEventListener("click", () => {
  state.authMode = state.authMode === "login" ? "signup" : "login";
  updateAuthUi();
  authMessage.textContent =
    state.authMode === "signup"
      ? "Create a new profile to personalize the dashboard and start messaging members."
      : "Welcome back. Log in to continue your exchanges.";
});

authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  if (!email || !password) {
    authMessage.textContent = "Please fill in your email and password.";
    return;
  }

  if (state.authMode === "signup") {
    const name = nameInput.value.trim();
    const skill = skillInput.value.trim();
    if (!name || !skill) {
      authMessage.textContent = "Please add your name and a primary skill to create your account.";
      return;
    }

    state.currentUser = { name, email, skill };
    authMessage.textContent = `${name}, your account is ready. Your profile has been personalized.`;
  } else {
    state.currentUser = {
      name: "Alex Morgan",
      email,
      skill: "Frontend Development",
    };
    authMessage.textContent = "Logged in successfully. Your dashboard is now active.";
  }

  updateProfile();
  authForm.reset();
  if (state.authMode === "signup") {
    state.authMode = "login";
    updateAuthUi();
  }
});

searchInput.addEventListener("input", renderResults);
availabilityFilter.addEventListener("change", renderResults);

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = chatInput.value.trim();
  if (!value) {
    return;
  }

  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  chats[state.selectedChat].push({
    sender: "self",
    text: value,
    time,
  });

  renderChatSidebar();
  renderChatThread();
  chatInput.value = "";
});

updateAuthUi();
renderResults();
renderPortfolio();
renderRequests();
renderChatSidebar();
renderChatThread();
updateProfile();
