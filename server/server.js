import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const storePath = path.join(__dirname, "chat-store.json");
const port = 3001;

const members = [
  { id: 1, name: "ch", teaches: ["c", "c++"], wants: ["java", "python"], role: "C Programming Mentor" },
  { id: 2, name: "satvika", teaches: ["java", "dsa"], wants: ["mern", "react"], role: "Java + DSA Learner" },
  { id: 3, name: "Cheritha", teaches: ["java", "dsa", "sql"], wants: ["mern", "node.js"], role: "Full Stack Aspirant" },
  { id: 4, name: "Akhil", teaches: ["python", "sql", "excel"], wants: ["ui ux", "figma"], role: "Backend Developer" },
  { id: 5, name: "Rohit", teaches: ["html", "css", "javascript"], wants: ["react", "firebase"], role: "Frontend Explorer" },
  { id: 6, name: "Mounika", teaches: ["english", "communication"], wants: ["data structures"], role: "Communication Coach" },
  { id: 7, name: "Vikas", teaches: ["node.js", "express", "mongodb"], wants: ["aws", "docker"], role: "API Builder" },
  { id: 8, name: "Neha", teaches: ["figma", "ui ux", "branding"], wants: ["javascript", "next.js"], role: "Product Designer" }
];

function ensureStore() {
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify({ conversations: {} }, null, 2));
  }
}

function readStore() {
  ensureStore();
  return JSON.parse(fs.readFileSync(storePath, "utf8"));
}

function writeStore(store) {
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  response.end(JSON.stringify(payload));
}

function getRoomKey(userEmail, memberId) {
  return `${userEmail.toLowerCase()}::${memberId}`;
}

function getReply(member) {
  const skills = member?.teaches?.slice(0, 2).join(" and ") || "that";
  return `Sounds good. I can help you with ${skills}. Let's schedule our next session.`;
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "OPTIONS") {
    json(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    json(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/members") {
    json(response, 200, { members });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/messages") {
    const userEmail = url.searchParams.get("userEmail");
    const memberId = Number(url.searchParams.get("memberId"));

    if (!userEmail || !memberId) {
      json(response, 400, { error: "userEmail and memberId are required." });
      return;
    }

    const store = readStore();
    const roomKey = getRoomKey(userEmail, memberId);
    const messages = store.conversations[roomKey] || [];
    json(response, 200, { messages });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/messages") {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });

    request.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        const userEmail = String(payload.userEmail || "").trim().toLowerCase();
        const memberId = Number(payload.memberId);
        const text = String(payload.text || "").trim();

        if (!userEmail || !memberId || !text) {
          json(response, 400, { error: "userEmail, memberId, and text are required." });
          return;
        }

        const store = readStore();
        const roomKey = getRoomKey(userEmail, memberId);
        const member = members.find((item) => item.id === memberId);

        if (!store.conversations[roomKey]) {
          store.conversations[roomKey] = [];
        }

        store.conversations[roomKey].push({
          sender: "you",
          text,
          createdAt: new Date().toISOString()
        });
        writeStore(store);
        json(response, 200, { ok: true });

        setTimeout(() => {
          const nextStore = readStore();
          if (!nextStore.conversations[roomKey]) {
            nextStore.conversations[roomKey] = [];
          }
          nextStore.conversations[roomKey].push({
            sender: "them",
            text: getReply(member),
            createdAt: new Date().toISOString()
          });
          writeStore(nextStore);
        }, 900);
      } catch {
        json(response, 400, { error: "Invalid request body." });
      }
    });
    return;
  }

  json(response, 404, { error: "Not found" });
});

server.listen(port, () => {
  ensureStore();
  console.log(`Skill exchange server running on http://localhost:${port}`);
});
