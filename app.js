const storageKey = "skillswap-hub-state";

const defaultState = {
  user: {
    name: "Guest Learner",
    email: "guest@example.com",
    skill: "Design Thinking",
    headline: "Curious creator open to exchanging practical skills.",
    bio: "I enjoy collaborative learning sessions, quick feedback loops, and project-based growth.",
    teach: ["Design Thinking", "Wireframing", "Presentation Design"],
    learn: ["JavaScript", "Public Speaking", "Video Editing"],
    availability: "Flexible"
  },
  exchanges: 3,
  portfolio: [
    {
      title: "UX Case Study Sprint",
      description: "Mapped a complete mobile onboarding flow and tested it with five peers.",
      tag: "Design"
    },
    {
      title: "Python Study Buddy",
      description: "Created weekly coding practice sheets and taught debugging basics to new learners.",
      tag: "Programming"
    }
  ],
  contacts: [
    {
      id: 1,
      name: "Aarav Menon",
      role: "Frontend Developer",
      goal: "Can teach React basics and wants help with UI polish.",
      teaches: ["React", "JavaScript", "Git"],
      learns: ["UI Design", "Branding"],
      availability: "Weeknights",
      level: "Intermediate",
      messages: [
        { sender: "them", text: "Hi! I saw you teach design thinking. Want to swap for React help?" },
        { sender: "you", text: "Absolutely. I can help with layouts and user flows this weekend." }
      ]
    },
    {
      id: 2,
      name: "Maya Singh",
      role: "Motion Designer",
      goal: "Looking for JavaScript guidance in exchange for animation mentoring.",
      teaches: ["After Effects", "Storyboarding", "Motion"],
      learns: ["JavaScript", "Web Interactions"],
      availability: "Weekends",
      level: "Beginner friendly",
      messages: [
        { sender: "them", text: "Your profile looks great. I can teach motion basics if you help me with JS." }
      ]
    },
    {
      id: 3,
      name: "Rohan Patel",
      role: "Data Analyst",
      goal: "Wants presentation coaching and can teach dashboards and Excel automation.",
      teaches: ["Excel", "Power BI", "Analytics"],
      learns: ["Storytelling", "Communication"],
      availability: "Flexible",
      level: "Advanced",
      messages: [
        { sender: "them", text: "Happy to exchange analytics sessions for presentation feedback." }
      ]
    }
  ]
};

const navLinks = document.querySelectorAll(".nav-link");
const sections = document.querySelectorAll(".section-grid");
const profileResults = document.getElementById("profileResults");
const profileCardTemplate = document.getElementById("profileCardTemplate");
const searchInput = document.getElementById("searchInput");
const availabilityFilter = document.getElementById("availabilityFilter");
const levelFilter = document.getElementById("levelFilter");
const highlightName = document.getElementById("highlightName");
const highlightCard = document.getElementById("highlightCard");
const connectButton = document.getElementById("connectButton");
const loginForm = document.getElementById("loginForm");
const profileForm = document.getElementById("profileForm");
const profilePreview = document.getElementById("profilePreview");
const portfolioGrid = document.getElementById("portfolioGrid");
const addProjectButton = document.getElementById("addProjectButton");
const chatList = document.getElementById("chatList");
const chatWindowHeader = document.getElementById("chatWindowHeader");
const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const exchangeCount = document.getElementById("exchangeCount");
const projectCount = document.getElementById("projectCount");
const savedSkillCount = document.getElementById("savedSkillCount");

let appState = loadState();
let activeChatId = appState.contacts[0]?.id ?? null;

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) {
    return structuredClone(defaultState);
  }

  try {
    return { ...structuredClone(defaultState), ...JSON.parse(saved) };
  } catch (error) {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(appState));
}

function switchSection(sectionId) {
  sections.forEach((section) => {
    section.classList.toggle("active", section.id === sectionId);
  });

  navLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.section === sectionId);
  });
}

function renderProfiles() {
  profileResults.innerHTML = "";

  const term = searchInput.value.trim().toLowerCase();
  const availability = availabilityFilter.value;
  const level = levelFilter.value;

  const filtered = appState.contacts.filter((contact) => {
    const searchable = [
      contact.name,
      contact.role,
      contact.goal,
      ...contact.teaches,
      ...contact.learns
    ].join(" ").toLowerCase();

    const termMatch = !term || searchable.includes(term);
    const availabilityMatch = availability === "all" || contact.availability === availability;
    const levelMatch = level === "all" || contact.level === level;

    return termMatch && availabilityMatch && levelMatch;
  });

  if (filtered.length === 0) {
    profileResults.innerHTML = "<p class='muted'>No matching skill partners yet. Try a different search or filter.</p>";
  }

  filtered.forEach((contact) => {
    const node = profileCardTemplate.content.cloneNode(true);
    node.querySelector("h4").textContent = contact.name;
    node.querySelector(".role").textContent = contact.role;
    node.querySelector(".goal").textContent = contact.goal;
    node.querySelector(".level-pill").textContent = contact.level;
    node.querySelector(".availability").textContent = contact.availability;

    const skillRow = node.querySelector(".skill-row");
    [...contact.teaches.slice(0, 2), ...contact.learns.slice(0, 1)].forEach((skill) => {
      const chip = document.createElement("span");
      chip.className = "skill-chip";
      chip.textContent = skill;
      skillRow.appendChild(chip);
    });

    node.querySelector(".small-btn").addEventListener("click", () => {
      activeChatId = contact.id;
      appState.exchanges += 1;
      saveState();
      renderStats();
      renderChat();
      switchSection("chat");
    });

    const card = node.querySelector(".result-card");
    card.addEventListener("click", (event) => {
      if (!event.target.closest("button")) {
        renderHighlight(contact);
      }
    });

    profileResults.appendChild(node);
  });

  renderHighlight(filtered[0] || appState.contacts[0]);
}

function renderHighlight(contact) {
  if (!contact) {
    highlightName.textContent = "No matches found";
    highlightCard.innerHTML = "<p class='muted'>Try changing your filters to see more skill partners.</p>";
    return;
  }

  highlightName.textContent = contact.name;
  highlightCard.innerHTML = `
    <p><strong>${contact.role}</strong></p>
    <p class="muted">${contact.goal}</p>
    <div class="detail-list">
      <div><span>Teaches</span><strong>${contact.teaches.join(", ")}</strong></div>
      <div><span>Wants to learn</span><strong>${contact.learns.join(", ")}</strong></div>
      <div><span>Availability</span><strong>${contact.availability}</strong></div>
      <div><span>Level</span><strong>${contact.level}</strong></div>
    </div>
  `;

  connectButton.onclick = () => {
    activeChatId = contact.id;
    switchSection("chat");
    renderChat();
  };
}

function renderProfilePreview() {
  profilePreview.innerHTML = `
    <h3>${appState.user.name}</h3>
    <p class="muted">${appState.user.headline}</p>
    <p>${appState.user.bio}</p>
    <div class="detail-list">
      <div><span>Email</span><strong>${appState.user.email}</strong></div>
      <div><span>Offering</span><strong>${appState.user.teach.join(", ")}</strong></div>
      <div><span>Learning</span><strong>${appState.user.learn.join(", ")}</strong></div>
      <div><span>Availability</span><strong>${appState.user.availability}</strong></div>
    </div>
  `;
}

function renderPortfolio() {
  portfolioGrid.innerHTML = "";

  appState.portfolio.forEach((project) => {
    const card = document.createElement("article");
    card.className = "portfolio-item";
    card.innerHTML = `
      <span class="pill">${project.tag}</span>
      <h4>${project.title}</h4>
      <p class="muted">${project.description}</p>
    `;
    portfolioGrid.appendChild(card);
  });
}

function renderChat() {
  chatList.innerHTML = "";

  appState.contacts.forEach((contact) => {
    const item = document.createElement("article");
    item.className = `chat-item ${contact.id === activeChatId ? "active" : ""}`;
    item.innerHTML = `
      <h4>${contact.name}</h4>
      <p class="muted">${contact.messages.at(-1)?.text || "Say hello to start the exchange."}</p>
    `;
    item.addEventListener("click", () => {
      activeChatId = contact.id;
      renderChat();
    });
    chatList.appendChild(item);
  });

  const activeContact = appState.contacts.find((contact) => contact.id === activeChatId) || appState.contacts[0];
  if (!activeContact) {
    return;
  }

  chatWindowHeader.innerHTML = `
    <h3>${activeContact.name}</h3>
    <p class="muted">${activeContact.role} | ${activeContact.availability}</p>
  `;

  chatMessages.innerHTML = "";
  activeContact.messages.forEach((message) => {
    const bubble = document.createElement("div");
    bubble.className = `message ${message.sender}`;
    bubble.textContent = message.text;
    chatMessages.appendChild(bubble);
  });

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderStats() {
  exchangeCount.textContent = appState.exchanges;
  projectCount.textContent = appState.portfolio.length;
  savedSkillCount.textContent = appState.user.teach.length + appState.user.learn.length;
}

function fillForms() {
  document.getElementById("nameInput").value = appState.user.name;
  document.getElementById("emailInput").value = appState.user.email;
  document.getElementById("skillInput").value = appState.user.skill;
  document.getElementById("headlineInput").value = appState.user.headline;
  document.getElementById("bioInput").value = appState.user.bio;
  document.getElementById("teachInput").value = appState.user.teach.join(", ");
  document.getElementById("learnInput").value = appState.user.learn.join(", ");
  document.getElementById("availabilityInput").value = appState.user.availability;
}

function initializeEvents() {
  navLinks.forEach((link) => {
    link.addEventListener("click", () => switchSection(link.dataset.section));
  });

  [searchInput, availabilityFilter, levelFilter].forEach((control) => {
    control.addEventListener("input", renderProfiles);
    control.addEventListener("change", renderProfiles);
  });

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    appState.user.name = document.getElementById("nameInput").value.trim();
    appState.user.email = document.getElementById("emailInput").value.trim();
    appState.user.skill = document.getElementById("skillInput").value.trim();
    appState.user.headline = `${appState.user.skill} mentor ready to exchange skills with focused learners.`;
    saveState();
    renderProfilePreview();
    switchSection("profile");
  });

  profileForm.addEventListener("submit", (event) => {
    event.preventDefault();
    appState.user.headline = document.getElementById("headlineInput").value.trim();
    appState.user.bio = document.getElementById("bioInput").value.trim();
    appState.user.teach = splitCommaList(document.getElementById("teachInput").value);
    appState.user.learn = splitCommaList(document.getElementById("learnInput").value);
    appState.user.availability = document.getElementById("availabilityInput").value;
    saveState();
    renderProfilePreview();
    renderStats();
  });

  addProjectButton.addEventListener("click", () => {
    const nextNumber = appState.portfolio.length + 1;
    appState.portfolio.unshift({
      title: `Skill Exchange Project ${nextNumber}`,
      description: "Added a new showcase item to highlight recent collaboration outcomes and learning progress.",
      tag: nextNumber % 2 === 0 ? "Learning" : "Teaching"
    });
    saveState();
    renderPortfolio();
    renderStats();
  });

  chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = chatInput.value.trim();
    if (!text) {
      return;
    }

    const activeContact = appState.contacts.find((contact) => contact.id === activeChatId);
    if (!activeContact) {
      return;
    }

    activeContact.messages.push({ sender: "you", text });
    activeContact.messages.push({
      sender: "them",
      text: `Sounds good. I can help with that. Let's plan a focused session around ${activeContact.teaches[0]}.`
    });

    appState.exchanges += 1;
    chatInput.value = "";
    saveState();
    renderChat();
    renderStats();
  });
}

function splitCommaList(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function init() {
  fillForms();
  renderProfiles();
  renderProfilePreview();
  renderPortfolio();
  renderChat();
  renderStats();
  initializeEvents();
}

init();
