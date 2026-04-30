export async function fetchMembers() {
  const response = await fetch("/api/members");
  if (!response.ok) {
    throw new Error("Failed to load members.");
  }
  return response.json();
}

export async function fetchMessages(userEmail, memberId) {
  const response = await fetch(
    `/api/messages?userEmail=${encodeURIComponent(userEmail)}&memberId=${memberId}`
  );
  if (!response.ok) {
    throw new Error("Failed to load messages.");
  }
  return response.json();
}

export async function sendMessageToServer(userEmail, memberId, text) {
  const response = await fetch("/api/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ userEmail, memberId, text })
  });

  if (!response.ok) {
    throw new Error("Failed to send message.");
  }

  return response.json();
}
