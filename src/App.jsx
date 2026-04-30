import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "firebase/firestore";
import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword
} from "firebase/auth";
import { auth, db, isFirebaseConfigured } from "./firebase";
import { categoryOptions, getSkillCategory, getSkillsForCategory } from "./skills";

const minPasswordLength = 8;

function splitSkills(value) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function validatePassword(password) {
  if (password.length < minPasswordLength) {
    return `Password must be at least ${minPasswordLength} characters.`;
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must include at least one uppercase letter.";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must include at least one lowercase letter.";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must include at least one number.";
  }
  return "";
}

function intersectionCount(left = [], right = []) {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item)).length;
}

function splitLines(value) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function sanitizeUsername(value = "") {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._]/g, "");
}

function validateUsername(username) {
  if (!username) {
    return "Username is required.";
  }
  if (username.length < 3) {
    return "Username must be at least 3 characters.";
  }
  if (!/^[a-z0-9._]+$/.test(username)) {
    return "Username can only use lowercase letters, numbers, dot, and underscore.";
  }
  return "";
}

function createBlankProfile(email = "", name = "", username = "") {
  const derivedUsername = sanitizeUsername(username || email.split("@")[0] || name || "member");
  return {
    name,
    email,
    username: derivedUsername,
    category: "",
    skill: "",
    teaches: [],
    wants: [],
    bio: "",
    profileImage: "",
    availability: "Available this week",
    portfolio: [],
    blockedUserIds: [],
    pinnedChatIds: []
  };
}

function createProfileFromDoc(id, data = {}) {
  const email = data.email || "";
  const derivedName = email ? email.split("@")[0] : "Member";
  const derivedUsername = sanitizeUsername(data.username || email.split("@")[0] || `${derivedName}${id.slice(0, 4)}`);
  return {
    id,
    name: data.name || derivedName,
    email,
    username: derivedUsername,
    category: data.category || getSkillCategory(data.skill || ""),
    skill: data.skill || "",
    teaches: Array.isArray(data.teaches) ? data.teaches : [],
    wants: Array.isArray(data.wants) ? data.wants : [],
    bio: data.bio || "",
    profileImage: data.profileImage || "",
    availability: data.availability || "Available this week",
    portfolio: Array.isArray(data.portfolio) ? data.portfolio : [],
    blockedUserIds: Array.isArray(data.blockedUserIds) ? data.blockedUserIds : [],
    pinnedChatIds: Array.isArray(data.pinnedChatIds) ? data.pinnedChatIds : [],
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null
  };
}

function buildRoomId(left, right) {
  return [left, right].sort().join("__");
}

function getProfileIdentityKey(profile) {
  return sanitizeUsername(profile.username || "") || (profile.email || "").trim().toLowerCase() || profile.id;
}

function scoreProfileCompleteness(profile) {
  return [
    Boolean(profile.profileImage),
    Boolean(profile.bio),
    Boolean(profile.skill),
    Boolean(profile.teaches?.length),
    Boolean(profile.wants?.length),
    Boolean(profile.portfolio?.length)
  ].filter(Boolean).length;
}

function dedupeProfiles(profiles = []) {
  const uniqueProfiles = new Map();

  for (const profile of profiles) {
    const key = getProfileIdentityKey(profile);
    const existing = uniqueProfiles.get(key);

    if (!existing) {
      uniqueProfiles.set(key, profile);
      continue;
    }

    const existingTime = getTimestampValue(existing.updatedAt || existing.createdAt);
    const nextTime = getTimestampValue(profile.updatedAt || profile.createdAt);

    if (nextTime > existingTime) {
      uniqueProfiles.set(key, profile);
      continue;
    }

    if (nextTime === existingTime && scoreProfileCompleteness(profile) > scoreProfileCompleteness(existing)) {
      uniqueProfiles.set(key, profile);
    }
  }

  return Array.from(uniqueProfiles.values());
}

function formatRole(profile) {
  if (profile.skill) {
    return `${profile.skill} skill exchange member`;
  }
  return "Skill exchange member";
}

async function ensureUniqueUsername(dbInstance, username, excludeUserId = "") {
  const normalizedUsername = sanitizeUsername(username);

  if (!normalizedUsername) {
    return false;
  }

  const snapshot = await getDocs(
    query(collection(dbInstance, "profiles"), where("usernameLower", "==", normalizedUsername), limit(5))
  );

  return !snapshot.docs.some((item) => item.id !== excludeUserId);
}

function formatFirebaseError(error, fallbackMessage) {
  const code = error?.code || "";

  if (
    code === "auth/invalid-credential" ||
    code === "auth/invalid-login-credentials" ||
    code === "auth/wrong-password" ||
    code === "auth/user-not-found"
  ) {
    return "Invalid email or password.";
  }
  if (code === "auth/email-already-in-use") {
    return "An account with this email already exists.";
  }
  if (code === "auth/invalid-email") {
    return "Please enter a valid email address.";
  }
  if (code === "auth/missing-password") {
    return "Please enter your password.";
  }
  if (code === "auth/too-many-requests") {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (code === "auth/network-request-failed") {
    return "Network error. Check your internet connection and try again.";
  }
  if (code === "auth/requires-recent-login") {
    return "Please log in again before changing your password.";
  }
  if (
    code === "permission-denied" ||
    code === "firestore/permission-denied" ||
    code === "storage/unauthorized"
  ) {
    return "Firebase permission denied. Please check your Firebase rules.";
  }
  if (
    code === "resource-exhausted" ||
    code === "firestore/resource-exhausted" ||
    code === "invalid-argument"
  ) {
    return "That image is too large to save. Please try a smaller image.";
  }

  return fallbackMessage || error?.message || "Something went wrong. Please try again.";
}

function resizeImage(file, maxSize = 720, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(maxSize / image.width, maxSize / image.height, 1);
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
          reject(new Error("Image processing is not available."));
          return;
        }

        canvas.width = width;
        canvas.height = height;
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      image.onerror = () => reject(new Error("Unable to read that image."));
      image.src = String(reader.result || "");
    };

    reader.onerror = () => reject(new Error("Unable to read that image."));
    reader.readAsDataURL(file);
  });
}

function formatMessageTime(timestamp) {
  const value = getTimestampValue(timestamp);
  if (!value) {
    return "Now";
  }

  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatChatListTime(timestamp) {
  const value = getTimestampValue(timestamp);
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const now = new Date();
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isSameDay) {
    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit"
    });
  }

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric"
  });
}

function EyeIcon({ crossed }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M2 12C4.7 7.8 8.1 5.7 12 5.7C15.9 5.7 19.3 7.8 22 12C19.3 16.2 15.9 18.3 12 18.3C8.1 18.3 4.7 16.2 2 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.8" />
      {crossed ? (
        <path
          d="M4 20L20 4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  );
}

function ProfileInfoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5.5 18.5C6.9 15.9 9.1 14.7 12 14.7C14.9 14.7 17.1 15.9 18.5 18.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function getTimestampValue(timestamp) {
  if (!timestamp) {
    return 0;
  }
  if (typeof timestamp.toMillis === "function") {
    return timestamp.toMillis();
  }
  if (typeof timestamp.seconds === "number") {
    return timestamp.seconds * 1000;
  }
  return 0;
}

function formatRelativeTime(timestamp) {
  const value = getTimestampValue(timestamp);
  if (!value) {
    return "Just now";
  }

  const diffMinutes = Math.max(1, Math.round((Date.now() - value) / 60000));
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

function getAverageRating(reviews) {
  if (!reviews.length) {
    return 0;
  }

  const total = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0);
  return Number((total / reviews.length).toFixed(1));
}

function getStars(rating) {
  const rounded = Math.round(rating);
  return `${"★".repeat(rounded)}${"☆".repeat(Math.max(0, 5 - rounded))}`;
}

function getMemberSubtitle(member) {
  const teaches = member.teaches || [];
  const wants = member.wants || [];

  if (teaches.length) {
    return `Teaches ${teaches.slice(0, 2).join(", ")}`;
  }
  if (wants.length) {
    return `Wants ${wants.slice(0, 2).join(", ")}`;
  }
  if (member.skill && !member.skill.includes("@")) {
    return member.skill;
  }

  return "Skill exchange member";
}

function getInitial(label = "") {
  return label.trim().charAt(0).toUpperCase() || "?";
}

function renderMessageText(text = "") {
  const urlPattern = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  const parts = text.split(urlPattern);

  return parts.map((part, index) => {
    if (!part.match(urlPattern)) {
      return part;
    }

    const href = part.toLowerCase().startsWith("http") ? part : `https://${part}`;

    return (
      <a key={`${part}-${index}`} href={href} target="_blank" rel="noreferrer">
        {part}
      </a>
    );
  });
}

function ProfileAvatar({ label, image, size = "medium", ring = false }) {
  const className = [
    "profile-mini-avatar",
    `size-${size}`,
    ring ? "with-ring" : ""
  ]
    .filter(Boolean)
    .join(" ");

  if (image) {
    return <img className={className} src={image} alt={label} />;
  }

  return <div className={className}>{getInitial(label)}</div>;
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [chatRooms, setChatRooms] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [requests, setRequests] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [skillPosts, setSkillPosts] = useState([]);
  const [learningGoals, setLearningGoals] = useState([]);
  const [currentPage, setCurrentPage] = useState("home");
  const [activeChatId, setActiveChatId] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [searchTerm, setSearchTerm] = useState("");
  const [theme, setTheme] = useState(() => localStorage.getItem("skillswap-theme") || "light");
  const [chatInput, setChatInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileMessageType, setProfileMessageType] = useState("success");
  const [chatStatus, setChatStatus] = useState("Realtime chat is ready.");
  const [requestMessage, setRequestMessage] = useState("");
  const [requestMessageType, setRequestMessageType] = useState("success");
  const [browserNotificationPermission, setBrowserNotificationPermission] = useState(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );
  const notificationSeenRef = useRef(new Set());
  const chatNotificationSeenRef = useRef(new Set());
  const notificationBootstrappedRef = useRef(false);
  const chatNotificationBootstrappedRef = useRef(false);
  const profileProvisioningRef = useRef(false);
  const [showPasswords, setShowPasswords] = useState({
    auth: false,
    signupConfirm: false,
    current: false,
    next: false,
    confirmNext: false
  });
  const [filters, setFilters] = useState({
    category: "",
    teaches: "",
    wants: "",
    minRating: "0",
    onlyStrongMatches: false,
    sortBy: "match"
  });
  const [authForm, setAuthForm] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: ""
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmNewPassword: ""
  });
  const [profileForm, setProfileForm] = useState({
    name: "",
    username: "",
    email: "",
    category: "",
    skill: "",
    teaches: "",
    wants: "",
    bio: "",
    profileImage: "",
    availability: "Available this week",
    portfolio: ""
  });
  const [cameraInputKey, setCameraInputKey] = useState(0);
  const [galleryInputKey, setGalleryInputKey] = useState(0);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [viewedMember, setViewedMember] = useState(null);
  const [requestForm, setRequestForm] = useState({
    wantedSkill: "",
    offeredSkill: "",
    note: ""
  });
  const [reviewForm, setReviewForm] = useState({
    rating: 5,
    text: ""
  });
  const [reportForm, setReportForm] = useState({
    reason: "",
    blockToo: false
  });
  const [postForm, setPostForm] = useState({
    type: "teach",
    skill: "",
    text: ""
  });
  const [goalForm, setGoalForm] = useState({
    title: "",
    skill: "",
    target: ""
  });

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setAuthReady(true);
      return undefined;
    }

    return onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);

      if (!user) {
        profileProvisioningRef.current = false;
        setCurrentProfile(null);
        setMembers([]);
        setMessages([]);
        setChatRooms([]);
        setCurrentPage("home");
        setActiveChatId("");
      }
    });
  }, []);

  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem("skillswap-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (typeof Notification !== "undefined") {
      setBrowserNotificationPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (!firebaseUser || !db) {
      return undefined;
    }

    const profileRef = doc(db, "profiles", firebaseUser.uid);

    return onSnapshot(
      profileRef,
      async (snapshot) => {
        if (!snapshot.exists()) {
          if (profileProvisioningRef.current) {
            return;
          }

          const starterProfile = createBlankProfile(firebaseUser.email || "", firebaseUser.displayName || "");
          await setDoc(profileRef, {
            ...starterProfile,
            nameLower: starterProfile.name.toLowerCase(),
            usernameLower: starterProfile.username.toLowerCase(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          setCurrentProfile({ id: firebaseUser.uid, ...starterProfile });
          return;
        }

        setCurrentProfile(createProfileFromDoc(snapshot.id, snapshot.data()));
      },
      () => {
        setProfileMessageType("error");
        setProfileMessage("Unable to load your profile from Firebase.");
      }
    );
  }, [firebaseUser]);

  useEffect(() => {
    if (!notifications.length) {
      return;
    }

    if (!notificationBootstrappedRef.current) {
      notifications.forEach((notification) => notificationSeenRef.current.add(notification.id));
      notificationBootstrappedRef.current = true;
      return;
    }

    if (browserNotificationPermission !== "granted" || document.visibilityState === "visible") {
      return;
    }

    notifications.forEach((notification) => {
      if (notification.read || notificationSeenRef.current.has(notification.id)) {
        return;
      }

      notificationSeenRef.current.add(notification.id);
      new Notification(notification.title || "SkillExchange alert", {
        body: notification.body || "You have a new notification."
      });
    });
  }, [browserNotificationPermission, notifications]);

  useEffect(() => {
    if (!firebaseUser || !chatRooms.length) {
      return;
    }

    if (!chatNotificationBootstrappedRef.current) {
      chatRooms.forEach((room) => {
        if (room.lastMessageAt) {
          chatNotificationSeenRef.current.add(`${room.id}-${getTimestampValue(room.lastMessageAt)}`);
        }
      });
      chatNotificationBootstrappedRef.current = true;
      return;
    }

    if (browserNotificationPermission !== "granted" || document.visibilityState === "visible") {
      return;
    }

    chatRooms.forEach((room) => {
      const messageKey = `${room.id}-${getTimestampValue(room.lastMessageAt)}`;
      const unreadCount = Number(room.unreadCountByUser?.[firebaseUser.uid] || 0);

      if (
        !room.lastMessageAt ||
        !unreadCount ||
        room.lastMessageSenderId === firebaseUser.uid ||
        chatNotificationSeenRef.current.has(messageKey)
      ) {
        return;
      }

      chatNotificationSeenRef.current.add(messageKey);
      const senderName = room.participantNames?.[room.lastMessageSenderId] || "Someone";
      new Notification(`New message from ${senderName}`, {
        body: room.lastMessageText || "Open SkillExchange to reply."
      });
    });
  }, [browserNotificationPermission, chatRooms, firebaseUser]);

  useEffect(() => {
    if (!firebaseUser || !db) {
      return undefined;
    }

    return onSnapshot(collection(db, "reviews"), (snapshot) => {
      const nextReviews = snapshot.docs
        .map((item) => ({
          id: item.id,
          ...item.data()
        }))
        .sort((left, right) => getTimestampValue(right.updatedAt || right.createdAt) - getTimestampValue(left.updatedAt || left.createdAt));

      setReviews(nextReviews);
    });
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser || !db) {
      return undefined;
    }

    let incomingDocs = [];
    let outgoingDocs = [];

    function syncRequests() {
      const requestMap = new Map(
        [...incomingDocs, ...outgoingDocs].map((item) => [item.id, item])
      );
      const nextRequests = Array.from(requestMap.values()).sort(
        (left, right) =>
          getTimestampValue(right.updatedAt || right.createdAt) -
          getTimestampValue(left.updatedAt || left.createdAt)
      );

      setRequests(nextRequests);
    }

    const unsubscribeIncoming = onSnapshot(
      query(collection(db, "skillRequests"), where("requesteeId", "==", firebaseUser.uid)),
      (snapshot) => {
        incomingDocs = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data()
        }));
        syncRequests();
      }
    );

    const unsubscribeOutgoing = onSnapshot(
      query(collection(db, "skillRequests"), where("requesterId", "==", firebaseUser.uid)),
      (snapshot) => {
        outgoingDocs = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data()
        }));
        syncRequests();
      }
    );

    return () => {
      unsubscribeIncoming();
      unsubscribeOutgoing();
    };
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser || !db) {
      return undefined;
    }

    return onSnapshot(query(collection(db, "notifications"), where("targetUserId", "==", firebaseUser.uid)), (snapshot) => {
      const nextNotifications = snapshot.docs
        .map((item) => ({
          id: item.id,
          ...item.data()
        }))
        .sort((left, right) => getTimestampValue(right.createdAt) - getTimestampValue(left.createdAt));

      setNotifications(nextNotifications);
    });
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser || !db) {
      return undefined;
    }

    return onSnapshot(query(collection(db, "skillPosts"), orderBy("createdAt", "desc")), (snapshot) => {
      const nextPosts = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data()
      }));

      setSkillPosts(nextPosts);
    });
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser || !db) {
      return undefined;
    }

    return onSnapshot(query(collection(db, "learningGoals"), where("userId", "==", firebaseUser.uid)), (snapshot) => {
      const nextGoals = snapshot.docs
        .map((item) => ({
          id: item.id,
          ...item.data()
        }))
        .sort((left, right) => getTimestampValue(right.updatedAt || right.createdAt) - getTimestampValue(left.updatedAt || left.createdAt));

      setLearningGoals(nextGoals);
    });
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser || !db) {
      return undefined;
    }

    return onSnapshot(query(collection(db, "favorites"), where("userId", "==", firebaseUser.uid)), (snapshot) => {
      const nextFavorites = snapshot.docs
        .map((item) => ({
          id: item.id,
          ...item.data()
        }));

      setFavorites(nextFavorites);
    });
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser || !db) {
      return undefined;
    }

    return onSnapshot(
      query(collection(db, "chats"), where("participants", "array-contains", firebaseUser.uid)),
      (snapshot) => {
        const nextRooms = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data()
        }));

        setChatRooms(nextRooms);
      }
    );
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser || !db) {
      return undefined;
    }

    return onSnapshot(
      collection(db, "profiles"),
      (snapshot) => {
        const nextMembers = dedupeProfiles(
          snapshot.docs
          .map((item) => createProfileFromDoc(item.id, item.data()))
          .filter((item) => item.id !== firebaseUser.uid)
        )
          .sort((left, right) => left.name.localeCompare(right.name));

        setMembers(nextMembers);
      },
      () => {
        setChatStatus("Unable to load members. Please check your Firestore rules.");
      }
    );
  }, [firebaseUser]);

  useEffect(() => {
    const visibleChatIds = new Set(
      chatRooms.flatMap((room) =>
        (room.participants || []).filter((participantId) => participantId && participantId !== firebaseUser?.uid)
      )
    );

    if (activeChatId) {
      visibleChatIds.add(activeChatId);
    }

    const availableChatMembers = members.filter((member) => visibleChatIds.has(member.id));

    if (!availableChatMembers.length) {
      setActiveChatId("");
      return;
    }

    const activeExists = availableChatMembers.some((member) => member.id === activeChatId);
    if (!activeExists) {
      setActiveChatId(availableChatMembers[0].id);
    }
  }, [activeChatId, chatRooms, firebaseUser?.uid, members]);

  useEffect(() => {
    if (!firebaseUser || !activeChatId || !db) {
      setMessages([]);
      return undefined;
    }

    const roomId = buildRoomId(firebaseUser.uid, activeChatId);
    const roomMessages = query(collection(db, "chats", roomId, "messages"), orderBy("createdAt", "asc"));

    return onSnapshot(
      roomMessages,
      (snapshot) => {
        setMessages(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data()
          }))
        );
        setChatStatus("Realtime Firebase chat connected.");
      },
      () => {
        setChatStatus("Unable to load chat messages. Please check Firestore rules.");
      }
    );
  }, [firebaseUser, activeChatId]);

  useEffect(() => {
    if (!firebaseUser || !db || !activeChatId || !messages.length) {
      return undefined;
    }

    const roomId = buildRoomId(firebaseUser.uid, activeChatId);
    const activeRoomRecord = chatRooms.find((room) => room.id === roomId);
    const unseenIncoming = messages.filter(
      (message) =>
        message.senderId !== firebaseUser.uid &&
        !(Array.isArray(message.seenBy) ? message.seenBy : []).includes(firebaseUser.uid)
    );
    const unreadCount = Number(activeRoomRecord?.unreadCountByUser?.[firebaseUser.uid] || 0);

    if (!unseenIncoming.length && unreadCount === 0) {
      return undefined;
    }

    const roomRef = doc(db, "chats", roomId);
    const batch = writeBatch(db);

    unseenIncoming.forEach((message) => {
      batch.update(doc(db, "chats", roomId, "messages", message.id), {
        seenBy: arrayUnion(firebaseUser.uid),
        seenAt: serverTimestamp()
      });
    });

    batch.commit().catch(() => {
      setChatStatus("Unable to update seen status right now.");
    });

    updateDoc(
      roomRef,
      {
        [`unreadCountByUser.${firebaseUser.uid}`]: 0,
        [`lastSeenAtBy.${firebaseUser.uid}`]: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
    ).catch(() => {
      setChatStatus("Unable to update seen status right now.");
    });

    return undefined;
  }, [activeChatId, chatRooms, db, firebaseUser, messages]);

  useEffect(() => {
    if (!firebaseUser || !activeChatId || !currentProfile || !db) {
      return undefined;
    }

    const visibleChatIds = new Set(
      chatRooms.flatMap((room) =>
        (room.participants || []).filter((participantId) => participantId && participantId !== firebaseUser?.uid)
      )
    );
    const activeChatMember =
      members.find((member) => member.id === activeChatId && visibleChatIds.has(member.id)) ||
      members.find((member) => member.id === activeChatId);
    if (!activeChatMember) {
      return undefined;
    }

    const trimmed = chatInput.trim();

    if (!trimmed) {
      updateTypingState(false, activeChatMember);
      return undefined;
    }

    updateTypingState(true, activeChatMember);

    const timeoutId = setTimeout(() => {
      updateTypingState(false, activeChatMember);
    }, 1600);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [activeChatId, chatInput, chatRooms, currentProfile, db, firebaseUser, members]);

  useEffect(() => {
    if (!currentProfile) {
      return;
    }

    setProfileForm({
      name: currentProfile.name || "",
      username: currentProfile.username || "",
      email: currentProfile.email || firebaseUser?.email || "",
      category: currentProfile.category || getSkillCategory(currentProfile.skill || ""),
      skill: currentProfile.skill || "",
      teaches: (currentProfile.teaches || []).join(", "),
      wants: (currentProfile.wants || []).join(", "),
      bio: currentProfile.bio || "",
      profileImage: currentProfile.profileImage || "",
      availability: currentProfile.availability || "Available this week",
      portfolio: (currentProfile.portfolio || []).join("\n")
    });
  }, [currentProfile?.id, firebaseUser?.email]);

  const roomLookup = useMemo(
    () =>
      chatRooms.reduce((lookup, room) => {
        lookup[room.id] = room;
        return lookup;
      }, {}),
    [chatRooms]
  );
  const activeChat = members.find((member) => member.id === activeChatId) || null;
  const activeRoomId = firebaseUser && activeChat ? buildRoomId(firebaseUser.uid, activeChat.id) : "";
  const activeRoom = activeRoomId ? roomLookup[activeRoomId] || null : null;
  const profileImagePreview = profileForm.profileImage || currentProfile?.profileImage || "";
  const profileNamePreview = profileForm.name || currentProfile?.name || "Member";
  const profileUsernamePreview = sanitizeUsername(profileForm.username || currentProfile?.username || "");
  const profileCategoryPreview =
    profileForm.category || currentProfile?.category || getSkillCategory(profileForm.skill || currentProfile?.skill || "");
  const profileSkillPreview = profileForm.skill || currentProfile?.skill || "";
  const profileTeachesPreview = splitSkills(profileForm.teaches);
  const profileWantsPreview = splitSkills(profileForm.wants);
  const profileBioPreview = profileForm.bio || currentProfile?.bio || "";
  const profilePortfolioPreview = splitLines(profileForm.portfolio);
  const passwordFieldsComplete = Boolean(
    passwordForm.currentPassword && passwordForm.newPassword && passwordForm.confirmNewPassword
  );
  const unreadNotifications = notifications.filter((item) => !item.read);
  const incomingRequests = requests.filter((item) => item.requesteeId === firebaseUser?.uid);
  const outgoingRequests = requests.filter((item) => item.requesterId === firebaseUser?.uid);
  const pendingIncomingRequests = incomingRequests.filter((item) => item.status === "pending");
  const pendingOutgoingRequests = outgoingRequests.filter((item) => item.status === "pending");
  const receivedReviews = reviews.filter((item) => item.revieweeId === firebaseUser?.uid);
  const averageMyRating = getAverageRating(receivedReviews);
  const favoriteIds = new Set(favorites.map((item) => item.targetUserId));
  const pinnedChatIds = currentProfile?.pinnedChatIds || [];
  const unreadChatCount = chatRooms.reduce(
    (count, room) => count + Number(room.unreadCountByUser?.[firebaseUser?.uid] || 0),
    0
  );
  const pageTitles = {
    home: "Dashboard",
    matches: "Discover Matches",
    requests: "Skill Requests",
    notifications: "Notifications",
    feed: "Skill Feed",
    goals: "Learning Goals",
    chat: "Messages",
    profile: "Profile"
  };
  const pageSubtitles = {
    home: "Track your profile, requests, and activity in one place.",
    matches: "Find the right people by skill fit, reviews, and filters.",
    requests: "Manage your incoming and outgoing exchange requests.",
    notifications: "Keep up with reviews, request updates, and alerts.",
    feed: "Share what you can teach or what you want help with.",
    goals: "Track the skills you are learning and what comes next.",
    chat: "Talk to your matches in a focused workspace.",
    profile: "Update your identity, skills, and public profile.",
  };
  const showChatStatus = Boolean(chatStatus && !/connected|ready/i.test(chatStatus));
  const profileSuggestions = useMemo(() => {
    if (!currentProfile) {
      return [];
    }

    return [
      !currentProfile.category && "Choose a skill category",
      !currentProfile.skill && "Add your primary skill",
      (!currentProfile.teaches || currentProfile.teaches.length === 0) && "Add skills you can teach",
      (!currentProfile.wants || currentProfile.wants.length === 0) && "Add skills you want to learn",
      !currentProfile.bio && "Write a short bio",
      !currentProfile.profileImage && "Upload a profile picture"
    ].filter(Boolean);
  }, [currentProfile]);

  const completionPercent = useMemo(() => {
    if (!currentProfile) {
      return 0;
    }

    const completionChecks = [
      Boolean(currentProfile.category),
      Boolean(currentProfile.skill),
      Boolean(currentProfile.teaches && currentProfile.teaches.length > 0),
      Boolean(currentProfile.wants && currentProfile.wants.length > 0),
      Boolean(currentProfile.bio),
      Boolean(currentProfile.profileImage)
    ];

    return Math.round((completionChecks.filter(Boolean).length / completionChecks.length) * 100);
  }, [currentProfile]);

  const reviewSummaryByUser = useMemo(() => {
    const summary = new Map();

    for (const review of reviews) {
      const userReviews = summary.get(review.revieweeId) || [];
      userReviews.push(review);
      summary.set(review.revieweeId, userReviews);
    }

    return summary;
  }, [reviews]);

  const rankedMembers = useMemo(() => {
    if (!currentProfile) {
      return [];
    }

    const term = searchTerm.trim().toLowerCase();
    const teaches = currentProfile.teaches || [];
    const wants = currentProfile.wants || [];
    const minimumRating = Number(filters.minRating || 0);

    return members
      .filter((member) => !(currentProfile.blockedUserIds || []).includes(member.id))
      .map((member) => {
        const memberCategory = member.category || getSkillCategory(member.skill || "");
        const teachMatch = intersectionCount(member.teaches || [], wants);
        const wantMatch = intersectionCount(member.wants || [], teaches);
        const skillBoost =
          currentProfile.skill && (member.teaches || []).includes(currentProfile.skill) ? 1 : 0;
        const score = teachMatch * 2 + wantMatch * 2 + skillBoost;
        const memberReviews = reviewSummaryByUser.get(member.id) || [];
        const averageRating = getAverageRating(memberReviews);
        const activeRequest = requests.find(
          (item) =>
            ((item.requesterId === firebaseUser?.uid && item.requesteeId === member.id) ||
              (item.requesterId === member.id && item.requesteeId === firebaseUser?.uid)) &&
            item.status === "pending"
        );
        const searchable = [
          member.name,
          member.username,
          member.email,
          memberCategory,
          member.skill,
          formatRole(member),
          ...(member.teaches || []),
          ...(member.wants || [])
        ]
          .join(" ")
          .toLowerCase();

        return {
          ...member,
          matchScore: score,
          averageRating,
          reviewCount: memberReviews.length,
          activeRequestStatus: activeRequest?.status || "",
          isFavorite: favoriteIds.has(member.id),
          category: memberCategory,
          searchable
        };
      })
      .filter((member) => {
        if (term && !member.searchable.includes(term)) {
          return false;
        }
        if (filters.teaches && !(member.teaches || []).includes(filters.teaches)) {
          return false;
        }
        if (filters.wants && !(member.wants || []).includes(filters.wants)) {
          return false;
        }
        if (filters.category && member.category !== filters.category) {
          return false;
        }
        if (member.averageRating < minimumRating) {
          return false;
        }
        if (filters.onlyStrongMatches && member.matchScore <= 0) {
          return false;
        }
        return true;
      })
      .sort((left, right) => right.matchScore - left.matchScore || left.name.localeCompare(right.name));
  }, [currentProfile, favoriteIds, filters, firebaseUser?.uid, members, requests, reviewSummaryByUser, searchTerm]);

  const sortedMembers = useMemo(() => {
    const items = [...rankedMembers];

    if (filters.sortBy === "rating") {
      items.sort(
        (left, right) =>
          right.averageRating - left.averageRating ||
          right.matchScore - left.matchScore ||
          left.name.localeCompare(right.name)
      );
    } else if (filters.sortBy === "recentReviews") {
      items.sort(
        (left, right) =>
          right.reviewCount - left.reviewCount ||
          right.averageRating - left.averageRating ||
          left.name.localeCompare(right.name)
      );
    }

    return items;
  }, [filters.sortBy, rankedMembers]);

  const featuredMembers = useMemo(
    () => sortedMembers.slice(0, 8),
    [sortedMembers]
  );

  const chatMembers = useMemo(() => {
    const visibleChatIds = new Set(
      chatRooms.flatMap((room) =>
        (room.participants || []).filter((participantId) => participantId && participantId !== firebaseUser?.uid)
      )
    );

    if (activeChatId) {
      visibleChatIds.add(activeChatId);
    }

    return members
      .filter((member) => visibleChatIds.has(member.id))
      .map((member) => {
        const room = roomLookup[buildRoomId(firebaseUser?.uid || "", member.id)];
        const lastMessageText = room?.lastMessageText || "";
        const lastMessageSenderId = room?.lastMessageSenderId || "";
        const unreadCount = Number(room?.unreadCountByUser?.[firebaseUser?.uid] || 0);
        const isPinned = pinnedChatIds.includes(member.id);
        const previewPrefix =
          lastMessageSenderId && lastMessageSenderId === firebaseUser?.uid ? "You: " : "";

        return {
          ...member,
          isPinned,
          lastMessageAt: room?.lastMessageAt || null,
          lastMessageSenderId,
          unreadCount,
          lastMessagePreview: lastMessageText ? `${previewPrefix}${lastMessageText}` : "Tap to start chatting",
          lastMessageTimeLabel: formatChatListTime(room?.lastMessageAt)
        };
      })
      .sort((left, right) => {
        const leftTime = getTimestampValue(left.lastMessageAt);
        const rightTime = getTimestampValue(right.lastMessageAt);

        return (
          Number(right.isPinned) - Number(left.isPinned) ||
          right.unreadCount - left.unreadCount ||
          rightTime - leftTime ||
          left.name.localeCompare(right.name)
        );
      });
  }, [firebaseUser?.uid, members, pinnedChatIds, roomLookup]);
  const lastSelfMessageId = useMemo(() => {
    if (!firebaseUser) {
      return "";
    }

    const match = [...messages].reverse().find((message) => message.senderId === firebaseUser.uid);
    return match?.id || "";
  }, [firebaseUser, messages]);
  const otherUserIsTyping = Boolean(activeChat && activeRoom?.typingByUser?.[activeChat.id]);
  const viewedMemberReviews = useMemo(() => {
    if (!viewedMember) {
      return [];
    }

    return reviews
      .filter((item) => item.revieweeId === viewedMember.id)
      .sort(
        (left, right) =>
          getTimestampValue(right.updatedAt || right.createdAt) -
          getTimestampValue(left.updatedAt || left.createdAt)
      )
      .slice(0, 4);
  }, [reviews, viewedMember]);
  const viewedMemberReviewSummary = useMemo(() => {
    if (!viewedMember) {
      return { averageRating: 0, reviewCount: 0 };
    }

    const memberReviews = reviewSummaryByUser.get(viewedMember.id) || [];
    return {
      averageRating: getAverageRating(memberReviews),
      reviewCount: memberReviews.length
    };
  }, [reviewSummaryByUser, viewedMember]);

  const skillSuggestions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const options = getSkillsForCategory(filters.category);

    if (!term) {
      return options.slice(0, 8);
    }

    return options.filter((skill) => skill.startsWith(term) || skill.includes(term)).slice(0, 8);
  }, [filters.category, searchTerm]);

  function updateAuthField(field, value) {
    setAuthForm((current) => ({ ...current, [field]: value }));
    setAuthError("");
    setAuthNotice("");
  }

  function updateProfileField(field, value) {
    setProfileForm((current) => {
      if (field === "skill") {
        return { ...current, skill: value, category: current.category || getSkillCategory(value) };
      }
      return { ...current, [field]: value };
    });
    setProfileMessage("");
  }

  function updatePasswordField(field, value) {
    setPasswordForm((current) => ({ ...current, [field]: value }));
    setProfileMessage("");
  }

  function togglePasswordVisibility(field) {
    setShowPasswords((current) => ({ ...current, [field]: !current[field] }));
  }

  function eyeLabel(isVisible) {
    return isVisible ? "Hide password" : "Show password";
  }

  function switchAuthMode(mode) {
    setAuthMode(mode);
    setAuthError("");
    setAuthNotice("");
    setAuthForm({ name: "", username: "", email: "", password: "", confirmPassword: "" });
  }

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function resetFilters() {
    setFilters({
      category: "",
      teaches: "",
      wants: "",
      minRating: "0",
      onlyStrongMatches: false,
      sortBy: "match"
    });
    setSearchTerm("");
  }

  async function handleProfileImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const resizedImage = await resizeImage(file);
      updateProfileField("profileImage", resizedImage);
      setShowImagePicker(false);
      setProfileMessage("");
    } catch (error) {
      setProfileMessageType("error");
      setProfileMessage(error instanceof Error ? error.message : "Unable to process that image.");
    }
  }

  function closePasswordModal() {
    setShowPasswordModal(false);
    setPasswordForm({
      currentPassword: "",
      newPassword: "",
      confirmNewPassword: ""
    });
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthError("");
    setAuthNotice("");

    if (!isFirebaseConfigured || !auth || !db) {
      setAuthError("Firebase is not configured yet.");
      return;
    }

    const email = authForm.email.trim().toLowerCase();
    const password = authForm.password.trim();
    const displayName = authForm.name.trim();
    const username = sanitizeUsername(authForm.username);

    if (!email || !password) {
      setAuthError("Please enter both email and password.");
      return;
    }

    try {
      if (authMode === "signup") {
        if (!displayName) {
          setAuthError("Please enter your name.");
          return;
        }

        const usernameError = validateUsername(username);
        if (usernameError) {
          setAuthError(usernameError);
          return;
        }

        const passwordError = validatePassword(password);
        if (passwordError) {
          setAuthError(passwordError);
          return;
        }

        if (password !== authForm.confirmPassword.trim()) {
          setAuthError("Passwords do not match.");
          return;
        }

        profileProvisioningRef.current = true;
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        const isUsernameAvailable = await ensureUniqueUsername(db, username, credential.user.uid);

        if (!isUsernameAvailable) {
          await deleteUser(credential.user);
          profileProvisioningRef.current = false;
          setAuthError("That username is already taken. Please choose another one.");
          return;
        }

        const starterProfile = createBlankProfile(email, displayName, username);

        await setDoc(doc(db, "profiles", credential.user.uid), {
          ...starterProfile,
          nameLower: starterProfile.name.toLowerCase(),
          usernameLower: starterProfile.username.toLowerCase(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        profileProvisioningRef.current = false;
        setCurrentPage("home");
        setAuthNotice("Account created successfully.");
        return;
      }

      await signInWithEmailAndPassword(auth, email, password);
      setCurrentPage("home");
    } catch (error) {
      profileProvisioningRef.current = false;
      setAuthError(formatFirebaseError(error, "Unable to complete sign in."));
    }
  }

  async function handleForgotPassword() {
    const email = authForm.email.trim().toLowerCase();

    if (!email) {
      setAuthError("Enter your email first to reset your password.");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      setAuthError("");
      setAuthNotice(`Password reset email sent to ${email}.`);
    } catch (error) {
      setAuthError(formatFirebaseError(error, "Unable to send reset email."));
    }
  }

  async function logout() {
    try {
      await signOut(auth);
      setAuthForm({ name: "", username: "", email: "", password: "", confirmPassword: "" });
      setAuthError("");
      setAuthNotice("");
      setProfileMessage("");
      setShowImagePicker(false);
    } catch (error) {
      setProfileMessageType("error");
      setProfileMessage(formatFirebaseError(error, "Unable to log out right now."));
    }
  }

  function openChat(memberId) {
    setActiveChatId(memberId);
    setCurrentPage("chat");
    setChatInput("");
  }

  function openMemberProfile(member) {
    setViewedMember(member);
  }

  function closeMemberProfile() {
    setViewedMember(null);
  }

  async function enableBrowserNotifications() {
    if (typeof Notification === "undefined") {
      setRequestMessageType("error");
      setRequestMessage("This browser does not support notifications.");
      return;
    }

    const permission = await Notification.requestPermission();
    setBrowserNotificationPermission(permission);

    if (permission === "granted") {
      setRequestMessageType("success");
      setRequestMessage("Browser notifications enabled.");
    } else {
      setRequestMessageType("error");
      setRequestMessage("Notifications were not enabled. You can allow them from browser site settings.");
    }
  }

  async function updateTypingState(isTyping, targetMember = activeChat) {
    if (!db || !firebaseUser || !targetMember || !currentProfile) {
      return;
    }

    const roomId = buildRoomId(firebaseUser.uid, targetMember.id);

    try {
      await setDoc(
        doc(db, "chats", roomId),
        {
          participants: [firebaseUser.uid, targetMember.id],
          participantNames: {
            [firebaseUser.uid]: currentProfile.name || currentProfile.email,
            [targetMember.id]: targetMember.name
          },
          typingByUser: {
            [firebaseUser.uid]: isTyping
          },
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    } catch {
      // Keep typing updates silent so they never interrupt chat usage.
    }
  }

  async function pushNotification(targetUserId, title, body, type = "general") {
    if (!db || !targetUserId) {
      return;
    }

    await addDoc(collection(db, "notifications"), {
      targetUserId,
      title,
      body,
      type,
      read: false,
      createdAt: serverTimestamp()
    });
  }

  function openRequestModal(member) {
    setSelectedMember(member);
    setRequestForm({
      wantedSkill: member.teaches?.[0] || "",
      offeredSkill: currentProfile?.teaches?.[0] || currentProfile?.skill || "",
      note: ""
    });
    setRequestMessage("");
    setShowRequestModal(true);
  }

  function closeRequestModal() {
    setShowRequestModal(false);
    setSelectedMember(null);
    setRequestMessage("");
    setRequestForm({
      wantedSkill: "",
      offeredSkill: "",
      note: ""
    });
  }

  function openReviewModal(member) {
    const existingReview = reviews.find(
      (item) => item.reviewerId === firebaseUser?.uid && item.revieweeId === member.id
    );

    setSelectedMember(member);
    setReviewForm({
      rating: existingReview?.rating || 5,
      text: existingReview?.text || ""
    });
    setRequestMessage("");
    setShowReviewModal(true);
  }

  function closeReviewModal() {
    setShowReviewModal(false);
    setSelectedMember(null);
    setRequestMessage("");
    setReviewForm({
      rating: 5,
      text: ""
    });
  }

  function openReportModal(member) {
    setSelectedMember(member);
    setReportForm({
      reason: "",
      blockToo: false
    });
    setRequestMessage("");
    setShowReportModal(true);
  }

  function closeReportModal() {
    setShowReportModal(false);
    setSelectedMember(null);
    setReportForm({
      reason: "",
      blockToo: false
    });
  }

  async function sendMessage(event) {
    event.preventDefault();

    const text = chatInput.trim();
    if (!text || !firebaseUser || !currentProfile || !activeChat || !db) {
      return;
    }

    try {
      const roomId = buildRoomId(firebaseUser.uid, activeChat.id);

      await setDoc(
        doc(db, "chats", roomId),
        {
          participants: [firebaseUser.uid, activeChat.id],
          participantNames: {
            [firebaseUser.uid]: currentProfile.name || currentProfile.email,
            [activeChat.id]: activeChat.name
          },
          lastMessageText: text,
          lastMessageSenderId: firebaseUser.uid,
          lastMessageAt: serverTimestamp(),
          unreadCountByUser: {
            [firebaseUser.uid]: 0,
            [activeChat.id]: 0
          },
          lastSeenAtBy: {
            [firebaseUser.uid]: serverTimestamp()
          },
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      await addDoc(collection(db, "chats", roomId, "messages"), {
        text,
        senderId: firebaseUser.uid,
        senderName: currentProfile.name || currentProfile.email,
        receiverId: activeChat.id,
        seenBy: [firebaseUser.uid],
        createdAt: serverTimestamp()
      });

      await updateDoc(doc(db, "chats", roomId), {
        lastMessageText: text,
        lastMessageSenderId: firebaseUser.uid,
        lastMessageAt: serverTimestamp(),
        [`unreadCountByUser.${activeChat.id}`]: increment(1),
        [`unreadCountByUser.${firebaseUser.uid}`]: 0,
        [`lastSeenAtBy.${firebaseUser.uid}`]: serverTimestamp(),
        [`typingByUser.${firebaseUser.uid}`]: false,
        updatedAt: serverTimestamp()
      });

      setChatInput("");
    } catch (error) {
      setChatStatus(formatFirebaseError(error, "Message not sent."));
    }
  }

  async function submitSkillRequest(event) {
    event.preventDefault();

    if (!firebaseUser || !currentProfile || !selectedMember || !db) {
      return;
    }

    if (!requestForm.wantedSkill || !requestForm.offeredSkill) {
      setRequestMessageType("error");
      setRequestMessage("Choose both the skill you want and the skill you can offer.");
      return;
    }

    try {
      await addDoc(collection(db, "skillRequests"), {
        requesterId: firebaseUser.uid,
        requesterName: currentProfile.name || currentProfile.email,
        requesteeId: selectedMember.id,
        requesteeName: selectedMember.name,
        wantedSkill: requestForm.wantedSkill,
        offeredSkill: requestForm.offeredSkill,
        note: requestForm.note.trim(),
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await pushNotification(
        selectedMember.id,
        "New skill request",
        `${currentProfile.name || currentProfile.email} wants to learn ${requestForm.wantedSkill} and offers ${requestForm.offeredSkill}.`,
        "request"
      );

      closeRequestModal();
      setRequestMessageType("success");
      setRequestMessage("Skill request sent.");
      setCurrentPage("requests");
    } catch (error) {
      setRequestMessageType("error");
      setRequestMessage(formatFirebaseError(error, "Unable to send your request."));
    }
  }

  async function updateRequestStatus(requestId, status, requesterId, wantedSkill) {
    if (!db || !currentProfile) {
      return;
    }

    try {
      await updateDoc(doc(db, "skillRequests", requestId), {
        status,
        updatedAt: serverTimestamp()
      });

      await pushNotification(
        requesterId,
        `Request ${status}`,
        `${currentProfile.name || currentProfile.email} ${status} your request for ${wantedSkill}.`,
        "request"
      );
    } catch (error) {
      setRequestMessageType("error");
      setRequestMessage(formatFirebaseError(error, "Unable to update request status."));
    }
  }

  async function submitReview(event) {
    event.preventDefault();

    if (!firebaseUser || !currentProfile || !selectedMember || !db) {
      return;
    }

    try {
      await setDoc(
        doc(db, "reviews", `${firebaseUser.uid}__${selectedMember.id}`),
        {
          reviewerId: firebaseUser.uid,
          reviewerName: currentProfile.name || currentProfile.email,
          revieweeId: selectedMember.id,
          revieweeName: selectedMember.name,
          rating: Number(reviewForm.rating),
          text: reviewForm.text.trim(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      await pushNotification(
        selectedMember.id,
        "New review received",
        `${currentProfile.name || currentProfile.email} left you a ${reviewForm.rating}-star review.`,
        "review"
      );

      closeReviewModal();
      setRequestMessageType("success");
      setRequestMessage("Review saved.");
      setCurrentPage("matches");
    } catch (error) {
      setRequestMessageType("error");
      setRequestMessage(formatFirebaseError(error, "Unable to save your review."));
    }
  }

  async function markNotificationRead(notificationId) {
    if (!db) {
      return;
    }

    try {
      await updateDoc(doc(db, "notifications", notificationId), {
        read: true
      });
    } catch (error) {
      setRequestMessageType("error");
      setRequestMessage(formatFirebaseError(error, "Unable to update notification."));
    }
  }

  async function clearNotifications() {
    if (!db || !notifications.length) {
      return;
    }

    try {
      const batch = writeBatch(db);

      notifications.forEach((notification) => {
        batch.delete(doc(db, "notifications", notification.id));
      });

      await batch.commit();
      setRequestMessageType("success");
      setRequestMessage("Alerts cleared.");
    } catch (error) {
      setRequestMessageType("error");
      setRequestMessage(formatFirebaseError(error, "Unable to clear alerts right now."));
    }
  }

  async function toggleFavorite(member) {
    if (!firebaseUser || !db || !currentProfile) {
      return;
    }

    const favoriteDocId = `${firebaseUser.uid}__${member.id}`;

    try {
      if (favoriteIds.has(member.id)) {
        await deleteDoc(doc(db, "favorites", favoriteDocId));
        setRequestMessageType("success");
        setRequestMessage(`${member.name} removed from saved matches.`);
        return;
      }

      await setDoc(doc(db, "favorites", favoriteDocId), {
        userId: firebaseUser.uid,
        userName: currentProfile.name || currentProfile.email,
        targetUserId: member.id,
        targetUserName: member.name,
        createdAt: serverTimestamp()
      });
      setRequestMessageType("success");
      setRequestMessage(`${member.name} saved to your matches.`);
    } catch (error) {
      setRequestMessageType("error");
      setRequestMessage(formatFirebaseError(error, "Unable to update saved matches."));
    }
  }

  async function togglePinnedChat(member) {
    if (!firebaseUser || !db || !member) {
      return;
    }

    const isPinned = pinnedChatIds.includes(member.id);

    try {
      await updateDoc(doc(db, "profiles", firebaseUser.uid), {
        pinnedChatIds: isPinned ? arrayRemove(member.id) : arrayUnion(member.id),
        updatedAt: serverTimestamp()
      });
      setRequestMessageType("success");
      setRequestMessage(isPinned ? `${member.name} unpinned from chats.` : `${member.name} pinned to chats.`);
    } catch (error) {
      setRequestMessageType("error");
      setRequestMessage(formatFirebaseError(error, "Unable to update pinned chats."));
    }
  }

  async function submitSkillPost(event) {
    event.preventDefault();

    if (!firebaseUser || !db || !currentProfile) {
      return;
    }

    if (!postForm.skill.trim() || !postForm.text.trim()) {
      setRequestMessageType("error");
      setRequestMessage("Add a skill and a short post.");
      return;
    }

    try {
      await addDoc(collection(db, "skillPosts"), {
        authorId: firebaseUser.uid,
        authorName: currentProfile.name || currentProfile.email,
        authorImage: currentProfile.profileImage || "",
        category: currentProfile.category || getSkillCategory(postForm.skill),
        type: postForm.type,
        skill: postForm.skill.trim().toLowerCase(),
        text: postForm.text.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setPostForm({ type: "teach", skill: "", text: "" });
      setRequestMessageType("success");
      setRequestMessage("Posted to the skill feed.");
    } catch (error) {
      setRequestMessageType("error");
      setRequestMessage(formatFirebaseError(error, "Unable to add your post."));
    }
  }

  async function deleteSkillPost(postId) {
    if (!db) {
      return;
    }

    try {
      await deleteDoc(doc(db, "skillPosts", postId));
      setRequestMessageType("success");
      setRequestMessage("Post removed.");
    } catch (error) {
      setRequestMessageType("error");
      setRequestMessage(formatFirebaseError(error, "Unable to remove that post."));
    }
  }

  async function submitLearningGoal(event) {
    event.preventDefault();

    if (!firebaseUser || !db || !currentProfile) {
      return;
    }

    if (!goalForm.title.trim()) {
      setRequestMessageType("error");
      setRequestMessage("Add a goal title first.");
      return;
    }

    try {
      await addDoc(collection(db, "learningGoals"), {
        userId: firebaseUser.uid,
        userName: currentProfile.name || currentProfile.email,
        title: goalForm.title.trim(),
        skill: goalForm.skill.trim().toLowerCase(),
        target: goalForm.target.trim(),
        status: "planned",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setGoalForm({ title: "", skill: "", target: "" });
      setRequestMessageType("success");
      setRequestMessage("Learning goal added.");
    } catch (error) {
      setRequestMessageType("error");
      setRequestMessage(formatFirebaseError(error, "Unable to add your goal."));
    }
  }

  async function updateLearningGoalStatus(goalId, status) {
    if (!db) {
      return;
    }

    try {
      await updateDoc(doc(db, "learningGoals", goalId), {
        status,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      setRequestMessageType("error");
      setRequestMessage(formatFirebaseError(error, "Unable to update your goal."));
    }
  }

  async function deleteLearningGoal(goalId) {
    if (!db) {
      return;
    }

    try {
      await deleteDoc(doc(db, "learningGoals", goalId));
      setRequestMessageType("success");
      setRequestMessage("Learning goal removed.");
    } catch (error) {
      setRequestMessageType("error");
      setRequestMessage(formatFirebaseError(error, "Unable to remove your goal."));
    }
  }

  async function blockMember(memberId) {
    if (!firebaseUser || !db || !currentProfile) {
      return;
    }

    const nextBlockedUserIds = Array.from(new Set([...(currentProfile.blockedUserIds || []), memberId]));

    try {
      await updateDoc(doc(db, "profiles", firebaseUser.uid), {
        blockedUserIds: nextBlockedUserIds,
        updatedAt: serverTimestamp()
      });
      setRequestMessageType("success");
      setRequestMessage("User blocked successfully.");
    } catch (error) {
      setRequestMessageType("error");
      setRequestMessage(formatFirebaseError(error, "Unable to block this user."));
    }
  }

  async function submitReport(event) {
    event.preventDefault();

    if (!firebaseUser || !db || !currentProfile || !selectedMember) {
      return;
    }

    if (!reportForm.reason.trim()) {
      setRequestMessageType("error");
      setRequestMessage("Please add a short reason for the report.");
      return;
    }

    try {
      await addDoc(collection(db, "reports"), {
        reporterId: firebaseUser.uid,
        reporterName: currentProfile.name || currentProfile.email,
        targetUserId: selectedMember.id,
        targetUserName: selectedMember.name,
        reason: reportForm.reason.trim(),
        createdAt: serverTimestamp()
      });

      if (reportForm.blockToo) {
        await blockMember(selectedMember.id);
      }

      closeReportModal();
      setRequestMessageType("success");
      setRequestMessage("Report submitted.");
    } catch (error) {
      setRequestMessageType("error");
      setRequestMessage(formatFirebaseError(error, "Unable to submit the report."));
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    setProfileMessage("");

    if (!firebaseUser || !db || !currentProfile) {
      return;
    }

    if (!profileForm.name.trim()) {
      setProfileMessageType("error");
      setProfileMessage("Name is required.");
      return;
    }

    const username = sanitizeUsername(profileForm.username);
    const usernameError = validateUsername(username);
    if (usernameError) {
      setProfileMessageType("error");
      setProfileMessage(usernameError);
      return;
    }

    const isUsernameAvailable = await ensureUniqueUsername(db, username, firebaseUser.uid);
    if (!isUsernameAvailable) {
      setProfileMessageType("error");
      setProfileMessage("That username is already taken. Please choose another one.");
      return;
    }

    const teaches = splitSkills(profileForm.teaches);
    const wants = splitSkills(profileForm.wants);
    const portfolio = splitLines(profileForm.portfolio);
    const primarySkill = profileForm.skill.trim().toLowerCase();
    const category = profileForm.category || getSkillCategory(primarySkill);

    try {
      await updateDoc(doc(db, "profiles", firebaseUser.uid), {
        name: profileForm.name.trim(),
        username,
        email: firebaseUser.email || profileForm.email.trim().toLowerCase(),
        category,
        skill: primarySkill,
        teaches,
        wants,
        bio: profileForm.bio.trim(),
        profileImage: profileForm.profileImage || "",
        availability: profileForm.availability,
        portfolio,
        nameLower: profileForm.name.trim().toLowerCase(),
        usernameLower: username,
        updatedAt: serverTimestamp()
      });
      setProfileMessageType("success");
      setProfileMessage("Profile saved successfully.");
    } catch (error) {
      setProfileMessageType("error");
      setProfileMessage(formatFirebaseError(error, "Unable to save your profile."));
    }
  }

  async function handlePasswordChange(event) {
    event.preventDefault();
    setProfileMessage("");

    if (!firebaseUser) {
      return;
    }

    if (!passwordFieldsComplete) {
      setProfileMessageType("error");
      setProfileMessage("Fill all three password fields.");
      return;
    }

    const passwordError = validatePassword(passwordForm.newPassword);
    if (passwordError) {
      setProfileMessageType("error");
      setProfileMessage(passwordError);
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmNewPassword) {
      setProfileMessageType("error");
      setProfileMessage("New password and confirm password do not match.");
      return;
    }

    try {
      const credential = EmailAuthProvider.credential(
        firebaseUser.email || profileForm.email.trim().toLowerCase(),
        passwordForm.currentPassword
      );
      await reauthenticateWithCredential(firebaseUser, credential);
      await updatePassword(firebaseUser, passwordForm.newPassword);
      setProfileMessageType("success");
      setProfileMessage("Password updated successfully.");
      closePasswordModal();
    } catch (error) {
      setProfileMessageType("error");
      setProfileMessage(formatFirebaseError(error, "Unable to update your password."));
    }
  }

  if (!isFirebaseConfigured) {
    return (
      <div className="login-screen">
        <div className="login-card config-card">
          <h1>Firebase Setup Needed</h1>
          <p>Add your Firebase values to a local <code>.env</code> file and restart the Vite dev server.</p>
        </div>
      </div>
    );
  }

  if (!authReady) {
    return (
      <div className="login-screen">
        <div className="login-card config-card">
          <h1>SkillExchange</h1>
          <p>Getting things ready...</p>
        </div>
      </div>
    );
  }

  if (firebaseUser && !currentProfile) {
    return (
      <div className="login-screen">
        <div className="login-card config-card">
          <h1>Welcome back</h1>
          <p>Preparing your workspace...</p>
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <div className="login-screen">
        <div className="orb orb-left" />
        <div className="orb orb-right" />
        <div className="floating icon-code">&lt;/&gt;</div>
        <div className="floating icon-music">MUSIC</div>
        <div className="floating icon-art">ART</div>
        <div className="floating icon-food">FOOD</div>
        <div className="floating icon-fit">FIT</div>
        <div className="login-brand">SkillExchange</div>

        <div className="login-card">
          <h1>{authMode === "login" ? "Login" : "Sign Up"}</h1>
          <form onSubmit={handleAuthSubmit} className="login-form">
            {authMode === "signup" ? (
              <>
                <input
                  placeholder="Full name"
                  value={authForm.name}
                  onChange={(event) => updateAuthField("name", event.target.value)}
                />
                <input
                  placeholder="Username"
                  value={authForm.username}
                  onChange={(event) => updateAuthField("username", event.target.value)}
                />
              </>
            ) : null}

            <input
              type="email"
              placeholder="Email"
              value={authForm.email}
              onChange={(event) => updateAuthField("email", event.target.value)}
            />

            <div className="password-field">
              <input
                type={showPasswords.auth ? "text" : "password"}
                placeholder="Password"
                value={authForm.password}
                onChange={(event) => updateAuthField("password", event.target.value)}
              />
              <button
                type="button"
                className="eye-toggle"
                aria-label={eyeLabel(showPasswords.auth)}
                title={eyeLabel(showPasswords.auth)}
                onClick={() => togglePasswordVisibility("auth")}
              >
                <EyeIcon crossed={showPasswords.auth} />
              </button>
            </div>

            {authMode === "signup" ? (
              <div className="password-field">
                <input
                  type={showPasswords.signupConfirm ? "text" : "password"}
                  placeholder="Confirm password"
                  value={authForm.confirmPassword}
                  onChange={(event) => updateAuthField("confirmPassword", event.target.value)}
                />
                <button
                  type="button"
                  className="eye-toggle"
                  aria-label={eyeLabel(showPasswords.signupConfirm)}
                  title={eyeLabel(showPasswords.signupConfirm)}
                  onClick={() => togglePasswordVisibility("signupConfirm")}
                >
                  <EyeIcon crossed={showPasswords.signupConfirm} />
                </button>
              </div>
            ) : null}

            {authError ? <p className="form-message error">{authError}</p> : null}
            {authNotice ? <p className="form-message success">{authNotice}</p> : null}

            <button type="submit">{authMode === "login" ? "Log In" : "Create Account"}</button>
          </form>

          {authMode === "login" ? (
            <button type="button" className="forgot-link" onClick={handleForgotPassword}>
              Forgot password?
            </button>
          ) : null}

          <p className="switch-auth">
            {authMode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => switchAuthMode(authMode === "login" ? "signup" : "login")}
            >
              {authMode === "login" ? "Sign Up" : "Login"}
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={currentPage === "chat" ? "app-page chat-focus-page" : "app-page"}>
      <aside className={currentPage === "chat" ? "app-sidebar chat-focus-sidebar" : "app-sidebar"}>
        <div className="sidebar-brand">
          <div className="brand-mark">S</div>
          <div>
            <strong>SkillExchange</strong>
            <span>Collaborate better</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            type="button"
            className={currentPage === "home" ? "sidebar-link active" : "sidebar-link"}
            onClick={() => setCurrentPage("home")}
          >
            <span className="sidebar-icon">⌂</span>
            <span>Home</span>
          </button>
          <button
            type="button"
            className={currentPage === "matches" ? "sidebar-link active" : "sidebar-link"}
            onClick={() => setCurrentPage("matches")}
          >
            <span className="sidebar-icon">◎</span>
            <span>Matches</span>
          </button>
          <button
            type="button"
            className={currentPage === "feed" ? "sidebar-link active" : "sidebar-link"}
            onClick={() => setCurrentPage("feed")}
          >
            <span className="sidebar-icon">+</span>
            <span>Feed</span>
          </button>
          <button
            type="button"
            className={currentPage === "goals" ? "sidebar-link active" : "sidebar-link"}
            onClick={() => setCurrentPage("goals")}
          >
            <span className="sidebar-icon">✓</span>
            <span>Goals</span>
          </button>
          <button
            type="button"
            className={currentPage === "chat" ? "sidebar-link active" : "sidebar-link"}
            onClick={() => setCurrentPage("chat")}
          >
            <span className="sidebar-icon">◔</span>
            <span>Chat</span>
            {unreadChatCount ? <span className="sidebar-badge">{unreadChatCount}</span> : null}
          </button>
          <button
            type="button"
            className={currentPage === "requests" ? "sidebar-link active" : "sidebar-link"}
            onClick={() => setCurrentPage("requests")}
          >
            <span className="sidebar-icon">⇄</span>
            <span>Requests</span>
            {pendingIncomingRequests.length ? (
              <span className="sidebar-badge">{pendingIncomingRequests.length}</span>
            ) : null}
          </button>
          <button
            type="button"
            className={currentPage === "notifications" ? "sidebar-link active" : "sidebar-link"}
            onClick={() => setCurrentPage("notifications")}
          >
            <span className="sidebar-icon">◉</span>
            <span>Alerts</span>
            {unreadNotifications.length ? (
              <span className="sidebar-badge">{unreadNotifications.length}</span>
            ) : null}
          </button>
          <button
            type="button"
            className={currentPage === "profile" ? "sidebar-link active" : "sidebar-link"}
            onClick={() => setCurrentPage("profile")}
          >
            <span className="sidebar-icon">◡</span>
            <span>Profile</span>
            {completionPercent < 100 ? <span className="sidebar-badge">{completionPercent}%</span> : null}
          </button>
          <button
            type="button"
            className="sidebar-link subtle mobile-sidebar-only"
            onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
          >
            <span className="sidebar-icon">{theme === "light" ? "â˜¾" : "â˜€"}</span>
            <span>{theme === "light" ? "Dark" : "Light"}</span>
          </button>
          <button type="button" className="sidebar-link subtle mobile-sidebar-only" onClick={logout}>
            <span className="sidebar-icon">â†—</span>
            <span>Logout</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-link subtle"
            onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
          >
            <span className="sidebar-icon">{theme === "light" ? "☾" : "☀"}</span>
            <span>{theme === "light" ? "Dark mode" : "Light mode"}</span>
          </button>
          <button type="button" className="sidebar-link subtle" onClick={logout}>
            <span className="sidebar-icon">↗</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="content-area">
        <div className="content-shell">
          <div className="workspace-topbar">
            <div>
              <h1>{pageTitles[currentPage]}</h1>
              <p>{pageSubtitles[currentPage]}</p>
            </div>
          </div>

        {currentPage === "home" ? (
          <section className="home-panel">
            {showChatStatus ? <p className="form-message error">{chatStatus}</p> : null}

            <div className="completion-card">
              <div>
                <h3>Profile completion</h3>
                <p>{completionPercent}% complete</p>
              </div>
              <div className="completion-bar">
                <span style={{ width: `${completionPercent}%` }} />
              </div>
            </div>

            {profileSuggestions.length ? (
              <div className="profile-suggestion-card">
                <div>
                  <h3>Complete your profile</h3>
                  <p>Finish these details so people can understand what you offer and what you need.</p>
                </div>
                <div className="suggestion-checklist">
                  {profileSuggestions.map((item) => (
                    <span key={item} className="suggestion-item">
                      {item}
                    </span>
                  ))}
                </div>
                <button type="button" className="complete-profile-btn" onClick={() => setCurrentPage("profile")}>
                  Fill Profile
                </button>
              </div>
            ) : null}

            {featuredMembers.length ? (
              <div className="social-strip-block">
                <div className="section-head compact-head">
                  <h2>Active learners</h2>
                  <span className="meta-text">Tap a profile to start a conversation</span>
                </div>
                <div className="social-strip">
                  {featuredMembers.map((member) => (
                    <button
                      key={`home-${member.id}`}
                      type="button"
                      className="social-avatar-card"
                      onClick={() => openMemberProfile(member)}
                    >
                      <ProfileAvatar
                        label={member.name}
                        image={member.profileImage}
                        size="large"
                        ring
                      />
                      <span>{member.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="home-grid">
              <article className="simple-card">
                <h3>Your Skill</h3>
                <p>{currentProfile.skill || "Add from profile"}</p>
              </article>
              <article className="simple-card">
                <h3>Category</h3>
                <p>{currentProfile.category || getSkillCategory(currentProfile.skill || "") || "Add from profile"}</p>
              </article>
              <article className="simple-card">
                <h3>Teaches</h3>
                <p>{currentProfile.teaches.length ? currentProfile.teaches.join(", ") : "Add from profile"}</p>
              </article>
              <article className="simple-card">
                <h3>Wants</h3>
                <p>{currentProfile.wants.length ? currentProfile.wants.join(", ") : "Add from profile"}</p>
              </article>
              <article className="simple-card">
                <h3>Your Rating</h3>
                <p>{receivedReviews.length ? `${averageMyRating} / 5` : "No reviews yet"}</p>
              </article>
              <article className="simple-card">
                <h3>Availability</h3>
                <p>{currentProfile.availability || "Set in profile"}</p>
              </article>
              <article className="simple-card">
                <h3>Notifications</h3>
                <p>{unreadNotifications.length ? `${unreadNotifications.length} unread alerts` : "All caught up"}</p>
              </article>
              <article className="simple-card">
                <h3>Skill Requests</h3>
                <p>{pendingIncomingRequests.length ? `${pendingIncomingRequests.length} pending requests` : "No pending requests"}</p>
              </article>
              <article className="simple-card">
                <h3>Saved Matches</h3>
                <p>{favorites.length ? `${favorites.length} saved people` : "No saved matches yet"}</p>
              </article>
              <article className="simple-card">
                <h3>Skill Feed</h3>
                <p>{skillPosts.length ? `${skillPosts.length} recent posts` : "No posts yet"}</p>
              </article>
              <article className="simple-card">
                <h3>Learning Goals</h3>
                <p>{learningGoals.length ? `${learningGoals.length} active goals` : "Add your first goal"}</p>
              </article>
            </div>
          </section>
        ) : null}

        {currentPage === "matches" ? (
          <section>
            {requestMessage ? <p className={`form-message ${requestMessageType}`}>{requestMessage}</p> : null}
            {featuredMembers.length ? (
              <div className="social-strip-block">
                <div className="section-head compact-head">
                  <h2>Suggested people</h2>
                  <span className="meta-text">Social-style browsing with stronger skill fit first</span>
                </div>
                <div className="social-strip">
                  {featuredMembers.map((member) => (
                    <button
                      key={`matches-${member.id}`}
                      type="button"
                      className="social-avatar-card"
                      onClick={() => openMemberProfile(member)}
                    >
                      <ProfileAvatar
                        label={member.name}
                        image={member.profileImage}
                        size="large"
                        ring
                      />
                      <span>{member.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="section-head">
              <div className="filter-actions">
                <input
                  className="search-box"
                  placeholder="Search skills or names"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
                <button type="button" className="secondary-action-btn" onClick={resetFilters}>
                  Reset Filters
                </button>
              </div>
            </div>

            <div className="suggestions-row">
              {skillSuggestions.map((skill) => (
                <button
                  key={skill}
                  type="button"
                  className="suggestion-pill"
                  onClick={() => setSearchTerm(skill)}
                >
                  {skill}
                </button>
              ))}
            </div>

            <div className="filters-panel">
              <select value={filters.category} onChange={(event) => updateFilter("category", event.target.value)}>
                <option value="">All categories</option>
                {categoryOptions.map((category) => (
                  <option key={`category-${category}`} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <select value={filters.teaches} onChange={(event) => updateFilter("teaches", event.target.value)}>
                <option value="">Teaches any skill</option>
                {getSkillsForCategory(filters.category).map((skill) => (
                  <option key={`teach-${skill}`} value={skill}>
                    {skill}
                  </option>
                ))}
              </select>
              <select value={filters.wants} onChange={(event) => updateFilter("wants", event.target.value)}>
                <option value="">Wants any skill</option>
                {getSkillsForCategory(filters.category).map((skill) => (
                  <option key={`want-${skill}`} value={skill}>
                    {skill}
                  </option>
                ))}
              </select>
              <select value={filters.minRating} onChange={(event) => updateFilter("minRating", event.target.value)}>
                <option value="0">Any rating</option>
                <option value="3">3+ rating</option>
                <option value="4">4+ rating</option>
                <option value="4.5">4.5+ rating</option>
              </select>
              <select value={filters.sortBy} onChange={(event) => updateFilter("sortBy", event.target.value)}>
                <option value="match">Sort by match</option>
                <option value="rating">Sort by rating</option>
                <option value="recentReviews">Sort by reviews</option>
              </select>
              <label className="checkbox-filter">
                <input
                  type="checkbox"
                  checked={filters.onlyStrongMatches}
                  onChange={(event) => updateFilter("onlyStrongMatches", event.target.checked)}
                />
                Only strong matches
              </label>
            </div>

            <div className="match-list">
              {sortedMembers.length ? (
                sortedMembers.map((member) => (
                  <article key={member.id} className="match-card">
                    <div className="match-header">
                      <h2>{member.name}</h2>
                      <span className="match-badge">
                        {member.matchScore > 0 ? `${member.matchScore} match` : "Explore"}
                      </span>
                    </div>
                    <p>
                      <strong>Role:</strong> {formatRole(member)}
                    </p>
                    <p>
                      <strong>Category:</strong> {member.category || "Other"}
                    </p>
                    <p>
                      <strong>Availability:</strong> {member.availability || "Not set"}
                    </p>
                    <p>
                      <strong>Rating:</strong> {member.reviewCount ? `${member.averageRating} ${getStars(member.averageRating)}` : "No reviews yet"}
                    </p>
                    <p>
                      <strong>Teaches:</strong> {member.teaches.length ? member.teaches.join(", ") : "Not added yet"}
                    </p>
                    <p>
                      <strong>Wants:</strong> {member.wants.length ? member.wants.join(", ") : "Not added yet"}
                    </p>
                    {member.activeRequestStatus ? (
                      <p>
                        <strong>Request:</strong> {member.activeRequestStatus}
                      </p>
                    ) : null}
                    <div className="match-actions">
                      <button
                        type="button"
                        className="secondary-action-btn"
                        onClick={() => openMemberProfile(member)}
                      >
                        View Profile
                      </button>
                      <button type="button" className="chat-btn" onClick={() => openChat(member.id)}>
                        Chat
                      </button>
                      <button type="button" className="pay-btn" onClick={() => openRequestModal(member)}>
                        Request
                      </button>
                      <button
                        type="button"
                        className="secondary-action-btn"
                        onClick={() => toggleFavorite(member)}
                      >
                        {member.isFavorite ? "Saved" : "Save"}
                      </button>
                      <button type="button" className="secondary-action-btn" onClick={() => openReviewModal(member)}>
                        Review
                      </button>
                      <button type="button" className="secondary-action-btn" onClick={() => openReportModal(member)}>
                        Report
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <article className="match-card">
                  <h2>No matches yet</h2>
                  <p>Try changing the filters or ask more people to create accounts.</p>
                </article>
              )}
            </div>
          </section>
        ) : null}

        {currentPage === "feed" ? (
          <section className="feed-page">
            {requestMessage ? <p className={`form-message ${requestMessageType}`}>{requestMessage}</p> : null}
            <form className="profile-edit-card feed-compose-card" onSubmit={submitSkillPost}>
              <h2>Create Skill Post</h2>
              <div className="feed-form-grid">
                <select
                  value={postForm.type}
                  onChange={(event) => setPostForm((current) => ({ ...current, type: event.target.value }))}
                >
                  <option value="teach">I can teach</option>
                  <option value="learn">I want to learn</option>
                  <option value="collab">Looking to collaborate</option>
                </select>
                <input
                  placeholder="Skill, e.g. react"
                  value={postForm.skill}
                  onChange={(event) => setPostForm((current) => ({ ...current, skill: event.target.value }))}
                />
              </div>
              <textarea
                rows="3"
                placeholder="Write a short update, request, or offer..."
                value={postForm.text}
                onChange={(event) => setPostForm((current) => ({ ...current, text: event.target.value }))}
              />
              <button type="submit" className="save-profile-btn">
                Post to Feed
              </button>
            </form>

            <div className="feed-list">
              {skillPosts.length ? (
                skillPosts.map((post) => {
                  const postMember = members.find((member) => member.id === post.authorId);
                  const isOwnPost = post.authorId === firebaseUser.uid;
                  const typeLabel =
                    post.type === "teach"
                      ? "Can teach"
                      : post.type === "learn"
                        ? "Wants to learn"
                        : "Collab";

                  return (
                    <article key={post.id} className="feed-card">
                      <div className="feed-card-head">
                        <div className="chat-user-main">
                          <ProfileAvatar
                            label={post.authorName}
                            image={post.authorImage || postMember?.profileImage}
                            size="medium"
                          />
                          <div className="chat-user-text">
                            <strong>{post.authorName}</strong>
                            <span>
                              {postMember?.username ? `@${postMember.username} - ` : ""}
                              {formatRelativeTime(post.createdAt)}
                            </span>
                          </div>
                        </div>
                        <span className="match-badge">{typeLabel}</span>
                      </div>
                      <p className="feed-skill-line">
                        {post.category || "Skill"} - {post.skill || "general"}
                      </p>
                      <p>{renderMessageText(post.text)}</p>
                      <div className="match-actions">
                        {!isOwnPost && postMember ? (
                          <>
                            <button type="button" className="chat-btn" onClick={() => openChat(postMember.id)}>
                              Chat
                            </button>
                            <button type="button" className="pay-btn" onClick={() => openRequestModal(postMember)}>
                              Request
                            </button>
                            <button
                              type="button"
                              className="secondary-action-btn"
                              onClick={() => openMemberProfile(postMember)}
                            >
                              Profile
                            </button>
                          </>
                        ) : null}
                        {isOwnPost ? (
                          <button type="button" className="remove-image-btn" onClick={() => deleteSkillPost(post.id)}>
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })
              ) : (
                <article className="match-card">
                  <h2>No skill posts yet</h2>
                  <p>Post what you can teach or what you want to learn to make the community feel active.</p>
                </article>
              )}
            </div>
          </section>
        ) : null}

        {currentPage === "goals" ? (
          <section className="goals-page">
            {requestMessage ? <p className={`form-message ${requestMessageType}`}>{requestMessage}</p> : null}
            <form className="profile-edit-card goal-compose-card" onSubmit={submitLearningGoal}>
              <h2>Add Learning Goal</h2>
              <input
                placeholder="Goal title, e.g. Build a React portfolio"
                value={goalForm.title}
                onChange={(event) => setGoalForm((current) => ({ ...current, title: event.target.value }))}
              />
              <div className="feed-form-grid">
                <input
                  placeholder="Skill, e.g. react"
                  value={goalForm.skill}
                  onChange={(event) => setGoalForm((current) => ({ ...current, skill: event.target.value }))}
                />
                <input
                  placeholder="Target, e.g. this weekend"
                  value={goalForm.target}
                  onChange={(event) => setGoalForm((current) => ({ ...current, target: event.target.value }))}
                />
              </div>
              <button type="submit" className="save-profile-btn">
                Add Goal
              </button>
            </form>

            <div className="goals-grid">
              {learningGoals.length ? (
                learningGoals.map((goal) => (
                  <article key={goal.id} className={`goal-card status-${goal.status}`}>
                    <div className="match-header">
                      <h2>{goal.title}</h2>
                      <span className="match-badge">{goal.status}</span>
                    </div>
                    <p>
                      <strong>Skill:</strong> {goal.skill || "General"}
                    </p>
                    <p>
                      <strong>Target:</strong> {goal.target || "No target set"}
                    </p>
                    <span className="meta-text">{formatRelativeTime(goal.updatedAt || goal.createdAt)}</span>
                    <div className="match-actions">
                      <button type="button" className="secondary-action-btn" onClick={() => updateLearningGoalStatus(goal.id, "planned")}>
                        Planned
                      </button>
                      <button type="button" className="chat-btn" onClick={() => updateLearningGoalStatus(goal.id, "in-progress")}>
                        In Progress
                      </button>
                      <button type="button" className="pay-btn" onClick={() => updateLearningGoalStatus(goal.id, "completed")}>
                        Completed
                      </button>
                      <button type="button" className="remove-image-btn" onClick={() => deleteLearningGoal(goal.id)}>
                        Delete
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <article className="match-card">
                  <h2>No goals yet</h2>
                  <p>Add a learning goal to track your progress and keep your skill exchange focused.</p>
                </article>
              )}
            </div>
          </section>
        ) : null}

        {currentPage === "requests" ? (
          <section>
            {requestMessage ? <p className={`form-message ${requestMessageType}`}>{requestMessage}</p> : null}
            <div className="requests-grid">
              <article className="profile-edit-card">
                <h2>Incoming</h2>
                {incomingRequests.length ? (
                  incomingRequests.map((request) => (
                    <div key={request.id} className="request-card">
                      <strong>{request.requesterName}</strong>
                      <p>Wants: {request.wantedSkill}</p>
                      <p>Offers: {request.offeredSkill}</p>
                      <p>Status: {request.status}</p>
                      {request.note ? <p>Note: {request.note}</p> : null}
                      <span className="meta-text">{formatRelativeTime(request.createdAt)}</span>
                      {request.status === "pending" ? (
                        <div className="request-actions">
                          <button
                            type="button"
                            className="chat-btn"
                            onClick={() =>
                              updateRequestStatus(request.id, "accepted", request.requesterId, request.wantedSkill)
                            }
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            className="remove-image-btn"
                            onClick={() =>
                              updateRequestStatus(request.id, "declined", request.requesterId, request.wantedSkill)
                            }
                          >
                            Decline
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p>No incoming requests yet.</p>
                )}
              </article>

              <article className="profile-edit-card">
                <h2>Outgoing</h2>
                {outgoingRequests.length ? (
                  outgoingRequests.map((request) => (
                    <div key={request.id} className="request-card">
                      <strong>{request.requesteeName}</strong>
                      <p>Requested: {request.wantedSkill}</p>
                      <p>Your offer: {request.offeredSkill}</p>
                      <p>Status: {request.status}</p>
                      {request.note ? <p>Note: {request.note}</p> : null}
                      <span className="meta-text">{formatRelativeTime(request.createdAt)}</span>
                    </div>
                  ))
                ) : (
                  <p>No outgoing requests yet.</p>
                )}
              </article>
            </div>
          </section>
        ) : null}

        {currentPage === "notifications" ? (
          <section>
            {requestMessage ? <p className={`form-message ${requestMessageType}`}>{requestMessage}</p> : null}
            <div className="section-head">
              <h2>Alerts</h2>
              {notifications.length ? (
                <button type="button" className="secondary-action-btn" onClick={clearNotifications}>
                  Clear alerts
                </button>
              ) : null}
            </div>
            <article className="notification-permission-card">
              <div>
                <h3>Browser notifications</h3>
                <p>
                  {browserNotificationPermission === "granted"
                    ? "Enabled. You will get alerts for new messages and requests when this tab is not active."
                    : "Enable popups for new messages and requests while SkillExchange is open."}
                </p>
              </div>
              <button
                type="button"
                className="secondary-action-btn"
                onClick={enableBrowserNotifications}
                disabled={browserNotificationPermission === "granted" || browserNotificationPermission === "unsupported"}
              >
                {browserNotificationPermission === "granted" ? "Enabled" : "Enable"}
              </button>
            </article>
            <div className="notifications-list">
              {notifications.length ? (
                notifications.map((notification) => (
                  <article
                    key={notification.id}
                    className={notification.read ? "notification-card" : "notification-card unread"}
                  >
                    <div>
                      <h3>{notification.title}</h3>
                      <p>{notification.body}</p>
                      <span className="meta-text">{formatRelativeTime(notification.createdAt)}</span>
                    </div>
                    {!notification.read ? (
                      <button
                        type="button"
                        className="secondary-action-btn"
                        onClick={() => markNotificationRead(notification.id)}
                      >
                        Mark Read
                      </button>
                    ) : null}
                  </article>
                ))
              ) : (
                <article className="match-card">
                  <h2>No notifications yet</h2>
                  <p>Your request updates, reviews, and alerts will appear here.</p>
                </article>
              )}
            </div>
          </section>
        ) : null}

        {currentPage === "chat" ? (
          <section>
            {showChatStatus ? <p className="form-message error">{chatStatus}</p> : null}
            {chatMembers.length ? (
              <div className="social-strip chat-strip">
                {chatMembers.map((member) => {
                  return (
                    <button
                      key={`chat-strip-${member.id}`}
                      type="button"
                      className={member.id === activeChatId ? "social-avatar-card active" : "social-avatar-card"}
                      onClick={() => openChat(member.id)}
                    >
                      <ProfileAvatar
                        label={member.name}
                        image={member.profileImage}
                        size="medium"
                        ring
                      />
                      <span>{member.name}</span>
                      {member.isPinned ? <span className="pin-dot">Pinned</span> : null}
                      {member.unreadCount ? <span className="chat-unread-badge">{member.unreadCount}</span> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <div className="chat-page">
              <aside className="chat-users">
                {chatMembers.length ? (
                  chatMembers.map((member) => {
                    return (
                      <div key={member.id} className={member.id === activeChatId ? "chat-user active" : "chat-user"}>
                        <button
                          type="button"
                          className="chat-row-trigger"
                          onClick={() => openChat(member.id)}
                        >
                          <div className="chat-user-main">
                            <button
                              type="button"
                              className="chat-avatar-trigger"
                              onClick={(event) => {
                                event.stopPropagation();
                                openMemberProfile(member);
                              }}
                            >
                              <ProfileAvatar
                                label={member.name}
                                image={member.profileImage}
                                size="medium"
                              />
                            </button>
                            <div className="chat-user-text">
                              <strong>{member.name}</strong>
                              <span className="chat-preview-text">{member.lastMessagePreview}</span>
                            </div>
                          </div>
                        </button>
                        <div className="chat-user-actions">
                          {member.lastMessageTimeLabel ? (
                            <span className="chat-user-time">{member.lastMessageTimeLabel}</span>
                          ) : null}
                          <button
                            type="button"
                            className="chat-profile-icon-btn"
                            onClick={() => openMemberProfile(member)}
                            aria-label={`Open ${member.name} profile`}
                            title="Open profile"
                          >
                            <ProfileInfoIcon />
                          </button>
                          <button
                            type="button"
                            className={member.isPinned ? "mini-call-btn primary" : "mini-call-btn"}
                            onClick={() => togglePinnedChat(member)}
                            aria-label={member.isPinned ? `Unpin ${member.name}` : `Pin ${member.name}`}
                            title={member.isPinned ? "Unpin chat" : "Pin chat"}
                          >
                            {member.isPinned ? "Pinned" : "Pin"}
                          </button>
                          {member.unreadCount ? <span className="chat-unread-badge">{member.unreadCount}</span> : null}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="empty-chat">No members available yet.</div>
                )}
              </aside>

              <div className="chat-panel">
                {activeChat ? (
                  <div className="mobile-chat-header">
                    <button
                      type="button"
                      className="chat-header-trigger"
                      onClick={() => openMemberProfile(activeChat)}
                    >
                      <div className="chat-user-main">
                        <ProfileAvatar
                          label={activeChat.name}
                          image={activeChat.profileImage}
                          size="medium"
                        />
                        <div className="chat-user-text">
                          <strong>{activeChat.name}</strong>
                          {otherUserIsTyping ? <span className="typing-text">typing...</span> : null}
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      className="chat-profile-icon-btn"
                      onClick={() => openMemberProfile(activeChat)}
                      aria-label={`Open ${activeChat.name} profile`}
                      title="Open profile"
                    >
                      <ProfileInfoIcon />
                    </button>
                    <div className="call-actions">
                      <button
                        type="button"
                        className={pinnedChatIds.includes(activeChat.id) ? "call-action-btn primary" : "call-action-btn"}
                        onClick={() => togglePinnedChat(activeChat)}
                      >
                        {pinnedChatIds.includes(activeChat.id) ? "Pinned" : "Pin"}
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="message-box">
                  {!activeChat ? <div className="empty-chat">Choose a member to start chatting.</div> : null}
                  {activeChat && messages.length === 0 ? (
                    <div className="empty-chat">No messages yet. Start the conversation.</div>
                  ) : null}
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={message.senderId === firebaseUser.uid ? "message-row self" : "message-row"}
                    >
                      <div className={message.senderId === firebaseUser.uid ? "message self" : "message"}>
                        <span className="message-author">
                          {message.senderId === firebaseUser.uid ? "You" : activeChat?.name || message.senderName || "Member"}
                        </span>
                        <span>{renderMessageText(message.text)}</span>
                        <span className="message-meta">
                          {formatMessageTime(message.createdAt)}
                          {message.senderId === firebaseUser.uid && message.id === lastSelfMessageId
                            ? (Array.isArray(message.seenBy) && message.seenBy.includes(activeChatId) ? " - Seen" : " - Delivered")
                            : ""}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <form className="message-form" onSubmit={sendMessage}>
                  <input
                    placeholder="Type message..."
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    disabled={!activeChat}
                  />
                  <button type="submit" disabled={!activeChat}>
                    Send
                  </button>
                </form>
              </div>
            </div>
          </section>
        ) : null}

        {currentPage === "profile" ? (
          <section className="profile-page">
            <div className="completion-card">
              <div>
                <h3>Profile completion</h3>
                <p>{completionPercent}% complete</p>
              </div>
              <div className="completion-bar">
                <span style={{ width: `${completionPercent}%` }} />
              </div>
            </div>

            <div className="profile-grid">
              <div className="profile-card-simple">
                <div className="profile-avatar-wrap">
                  <button
                    type="button"
                    className="avatar-edit-trigger"
                    onClick={() => setShowImagePicker(true)}
                  >
                    {profileImagePreview ? (
                      <img
                        className="profile-avatar-image"
                        src={profileImagePreview}
                        alt={profileNamePreview}
                      />
                    ) : (
                      <div className="profile-avatar">
                        {(profileNamePreview || currentProfile.email || "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="avatar-edit-icon">Edit</span>
                  </button>

                  <input
                    key={galleryInputKey}
                    id="gallery-input"
                    className="avatar-file-input"
                    type="file"
                    accept="image/*"
                    onChange={handleProfileImageChange}
                  />
                  <input
                    key={cameraInputKey}
                    id="camera-input"
                    className="avatar-file-input"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleProfileImageChange}
                  />
                </div>

                <div>
                  <h2>{profileNamePreview}</h2>
                  <p>{profileUsernamePreview ? `@${profileUsernamePreview}` : "@username"}</p>
                  <p>{firebaseUser.email}</p>
                  <p>
                    <strong>Skill:</strong> {profileSkillPreview || "Not added yet"}
                  </p>
                  <p>
                    <strong>Category:</strong> {profileCategoryPreview || "Not selected yet"}
                  </p>
                  <p>
                    <strong>Availability:</strong> {profileForm.availability || "Not set"}
                  </p>
                  <p>
                    <strong>Teaches:</strong>{" "}
                    {profileTeachesPreview.length ? profileTeachesPreview.join(", ") : "Not added yet"}
                  </p>
                  <p>
                    <strong>Wants:</strong>{" "}
                    {profileWantsPreview.length ? profileWantsPreview.join(", ") : "Not added yet"}
                  </p>
                  <p>{profileBioPreview || "Add your bio from the edit form."}</p>
                  {profilePortfolioPreview.length ? (
                    <div className="portfolio-preview">
                      <strong>Portfolio</strong>
                      {profilePortfolioPreview.slice(0, 4).map((item) => (
                        <a key={item} href={item} target="_blank" rel="noreferrer">
                          {item}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <form className="profile-edit-card" onSubmit={saveProfile}>
                <h2>Edit Profile</h2>
                <input
                  placeholder="Name"
                  value={profileForm.name}
                  onChange={(event) => updateProfileField("name", event.target.value)}
                />
                <input
                  placeholder="Username"
                  value={profileForm.username}
                  onChange={(event) => updateProfileField("username", event.target.value)}
                />
                <input type="email" value={profileForm.email} readOnly className="readonly-field" />
                <p className="field-help">Email comes from your Firebase login account. Username must be unique.</p>
                <select
                  value={profileForm.category}
                  onChange={(event) => updateProfileField("category", event.target.value)}
                >
                  <option value="">Choose skill category</option>
                  {categoryOptions.map((category) => (
                    <option key={`profile-category-${category}`} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Primary skill"
                  value={profileForm.skill}
                  onChange={(event) => updateProfileField("skill", event.target.value)}
                />
                <select
                  value={profileForm.availability}
                  onChange={(event) => updateProfileField("availability", event.target.value)}
                >
                  <option>Available this week</option>
                  <option>Available on weekends</option>
                  <option>Available in evenings</option>
                  <option>Busy this week</option>
                </select>
                <input
                  placeholder="Skills you teach (comma separated)"
                  value={profileForm.teaches}
                  onChange={(event) => updateProfileField("teaches", event.target.value)}
                />
                <input
                  placeholder="Skills you want (comma separated)"
                  value={profileForm.wants}
                  onChange={(event) => updateProfileField("wants", event.target.value)}
                />
                <textarea
                  placeholder="Bio"
                  rows="5"
                  value={profileForm.bio}
                  onChange={(event) => updateProfileField("bio", event.target.value)}
                />
                <textarea
                  placeholder="Portfolio links (one per line)"
                  rows="4"
                  value={profileForm.portfolio}
                  onChange={(event) => updateProfileField("portfolio", event.target.value)}
                />

                {profileImagePreview ? (
                  <div className="preview-block">
                    <img className="profile-preview-image" src={profileImagePreview} alt="Profile preview" />
                  </div>
                ) : null}

                <div className="profile-actions-row">
                  <button
                    type="button"
                    className="secondary-action-btn"
                    onClick={() => setShowPasswordModal(true)}
                  >
                    Change Password
                  </button>
                </div>
                {profileMessage ? <p className={`form-message ${profileMessageType}`}>{profileMessage}</p> : null}

                <button type="submit" className="save-profile-btn">
                  Save Profile
                </button>
              </form>
            </div>

            <div className="profile-review-section">
              <div className="section-head">
                <h2>Your Reviews</h2>
                <span className="match-badge">
                  {receivedReviews.length ? `${averageMyRating} ${getStars(averageMyRating)}` : "No rating yet"}
                </span>
              </div>
              <div className="review-list">
                {receivedReviews.length ? (
                  receivedReviews.slice(0, 6).map((review) => (
                    <article key={review.id} className="review-card">
                      <div className="review-head">
                        <strong>{review.reviewerName}</strong>
                        <span>{review.rating}/5</span>
                      </div>
                      <p>{review.text || "Helpful skill exchange partner."}</p>
                      <span className="meta-text">{formatRelativeTime(review.updatedAt || review.createdAt)}</span>
                    </article>
                  ))
                ) : (
                  <article className="match-card">
                    <h2>No reviews yet</h2>
                    <p>When people rate your skill exchanges, they will show up here.</p>
                  </article>
                )}
              </div>
            </div>

            {showImagePicker ? (
              <div className="picker-modal" onClick={() => setShowImagePicker(false)}>
                <div className="picker-sheet" onClick={(event) => event.stopPropagation()}>
                  <h3>Update profile picture</h3>
                  <p>Choose how you want to add your photo.</p>
                  <div className="picker-actions">
                    <label className="picker-option" htmlFor="camera-input">
                      Use Camera
                    </label>
                    <label className="picker-option" htmlFor="gallery-input">
                      Choose from Gallery
                    </label>
                  </div>
                  <button type="button" className="picker-cancel" onClick={() => setShowImagePicker(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {showPasswordModal ? (
              <div className="picker-modal" onClick={closePasswordModal}>
                <div className="picker-sheet password-sheet" onClick={(event) => event.stopPropagation()}>
                  <h3>Change Password</h3>
                  <p>Enter your current password and choose a new one.</p>
                  <form className="password-modal-form" onSubmit={handlePasswordChange}>
                    <div className="password-field">
                      <input
                        type={showPasswords.current ? "text" : "password"}
                        placeholder="Current password"
                        value={passwordForm.currentPassword}
                        onChange={(event) => updatePasswordField("currentPassword", event.target.value)}
                      />
                      <button
                        type="button"
                        className="eye-toggle"
                        aria-label={eyeLabel(showPasswords.current)}
                        title={eyeLabel(showPasswords.current)}
                        onClick={() => togglePasswordVisibility("current")}
                      >
                        <EyeIcon crossed={showPasswords.current} />
                      </button>
                    </div>
                    <div className="password-field">
                      <input
                        type={showPasswords.next ? "text" : "password"}
                        placeholder="New password"
                        value={passwordForm.newPassword}
                        onChange={(event) => updatePasswordField("newPassword", event.target.value)}
                      />
                      <button
                        type="button"
                        className="eye-toggle"
                        aria-label={eyeLabel(showPasswords.next)}
                        title={eyeLabel(showPasswords.next)}
                        onClick={() => togglePasswordVisibility("next")}
                      >
                        <EyeIcon crossed={showPasswords.next} />
                      </button>
                    </div>
                    <div className="password-field">
                      <input
                        type={showPasswords.confirmNext ? "text" : "password"}
                        placeholder="Confirm new password"
                        value={passwordForm.confirmNewPassword}
                        onChange={(event) => updatePasswordField("confirmNewPassword", event.target.value)}
                      />
                      <button
                        type="button"
                        className="eye-toggle"
                        aria-label={eyeLabel(showPasswords.confirmNext)}
                        title={eyeLabel(showPasswords.confirmNext)}
                        onClick={() => togglePasswordVisibility("confirmNext")}
                      >
                        <EyeIcon crossed={showPasswords.confirmNext} />
                      </button>
                    </div>
                    {profileMessage ? <p className={`form-message ${profileMessageType}`}>{profileMessage}</p> : null}
                    <div className="picker-actions">
                      <button type="submit" className="picker-option">
                        Update Password
                      </button>
                      <button type="button" className="picker-cancel" onClick={closePasswordModal}>
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            ) : null}

          </section>
        ) : null}

        {viewedMember ? (
          <div className="picker-modal" onClick={closeMemberProfile}>
            <div className="picker-sheet member-profile-sheet" onClick={(event) => event.stopPropagation()}>
              <div className="member-profile-head">
                <div className="chat-user-main">
                  <ProfileAvatar
                    label={viewedMember.name}
                    image={viewedMember.profileImage}
                    size="large"
                  />
                  <div className="chat-user-text">
                    <strong>{viewedMember.name}</strong>
                    <span>{viewedMember.username ? `@${viewedMember.username}` : viewedMember.email}</span>
                  </div>
                </div>
                <span className="match-badge">
                  {viewedMemberReviewSummary.reviewCount
                    ? `${viewedMemberReviewSummary.averageRating} ${getStars(viewedMemberReviewSummary.averageRating)}`
                    : "No rating yet"}
                </span>
              </div>

              <div className="member-profile-grid">
                <article className="member-profile-card">
                  <h3>About</h3>
                  <p><strong>Category:</strong> {viewedMember.category || getSkillCategory(viewedMember.skill || "") || "Not selected yet"}</p>
                  <p><strong>Primary skill:</strong> {viewedMember.skill || "Not added yet"}</p>
                  <p><strong>Availability:</strong> {viewedMember.availability || "Not set"}</p>
                  <p><strong>Teaches:</strong> {viewedMember.teaches?.length ? viewedMember.teaches.join(", ") : "Not added yet"}</p>
                  <p><strong>Wants:</strong> {viewedMember.wants?.length ? viewedMember.wants.join(", ") : "Not added yet"}</p>
                  <p>{viewedMember.bio || "No bio added yet."}</p>
                </article>

                <article className="member-profile-card">
                  <h3>Portfolio</h3>
                  {viewedMember.portfolio?.length ? (
                    <div className="portfolio-preview">
                      {viewedMember.portfolio.map((item) => (
                        <a key={item} href={item} target="_blank" rel="noreferrer">
                          {item}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p>No portfolio links added yet.</p>
                  )}
                </article>
              </div>

              <div className="member-profile-card">
                <h3>Recent Reviews</h3>
                {viewedMemberReviews.length ? (
                  <div className="review-list compact-review-list">
                    {viewedMemberReviews.map((review) => (
                      <article key={review.id} className="review-card">
                        <div className="review-head">
                          <strong>{review.reviewerName}</strong>
                          <span>{review.rating}/5</span>
                        </div>
                        <p>{review.text || "Helpful skill exchange partner."}</p>
                        <span className="meta-text">{formatRelativeTime(review.updatedAt || review.createdAt)}</span>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p>No reviews yet.</p>
                )}
              </div>

              <div className="picker-actions">
                <button
                  type="button"
                  className="picker-option"
                  onClick={() => {
                    closeMemberProfile();
                    openChat(viewedMember.id);
                  }}
                >
                  Chat
                </button>
                <button
                  type="button"
                  className="picker-option"
                  onClick={() => {
                    closeMemberProfile();
                    openRequestModal(viewedMember);
                  }}
                >
                  Send Request
                </button>
                <button type="button" className="picker-cancel" onClick={closeMemberProfile}>
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {showRequestModal && selectedMember ? (
          <div className="picker-modal" onClick={closeRequestModal}>
            <div className="picker-sheet password-sheet" onClick={(event) => event.stopPropagation()}>
              <h3>Send Skill Request</h3>
              <p>Ask {selectedMember.name} for a skill exchange.</p>
              <form className="password-modal-form" onSubmit={submitSkillRequest}>
                <select
                  value={requestForm.wantedSkill}
                  onChange={(event) =>
                    setRequestForm((current) => ({ ...current, wantedSkill: event.target.value }))
                  }
                >
                  <option value="">Choose skill you want</option>
                  {(selectedMember.teaches || []).map((skill) => (
                    <option key={`requested-${skill}`} value={skill}>
                      {skill}
                    </option>
                  ))}
                </select>
                <select
                  value={requestForm.offeredSkill}
                  onChange={(event) =>
                    setRequestForm((current) => ({ ...current, offeredSkill: event.target.value }))
                  }
                >
                  <option value="">Choose skill you offer</option>
                  {Array.from(new Set([...(currentProfile.teaches || []), currentProfile.skill].filter(Boolean))).map(
                    (skill) => (
                      <option key={`offer-${skill}`} value={skill}>
                        {skill}
                      </option>
                    )
                  )}
                </select>
                <textarea
                  rows="4"
                  placeholder="Add a short note"
                  value={requestForm.note}
                  onChange={(event) =>
                    setRequestForm((current) => ({ ...current, note: event.target.value }))
                  }
                />
                {requestMessage ? <p className={`form-message ${requestMessageType}`}>{requestMessage}</p> : null}
                <div className="picker-actions">
                  <button type="submit" className="picker-option">
                    Send Request
                  </button>
                  <button type="button" className="picker-cancel" onClick={closeRequestModal}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {showReviewModal && selectedMember ? (
          <div className="picker-modal" onClick={closeReviewModal}>
            <div className="picker-sheet password-sheet" onClick={(event) => event.stopPropagation()}>
              <h3>Rate and Review</h3>
              <p>Share feedback for {selectedMember.name}.</p>
              <form className="password-modal-form" onSubmit={submitReview}>
                <select
                  value={reviewForm.rating}
                  onChange={(event) =>
                    setReviewForm((current) => ({ ...current, rating: Number(event.target.value) }))
                  }
                >
                  <option value={5}>5 - Excellent</option>
                  <option value={4}>4 - Very good</option>
                  <option value={3}>3 - Good</option>
                  <option value={2}>2 - Needs work</option>
                  <option value={1}>1 - Poor</option>
                </select>
                <textarea
                  rows="4"
                  placeholder="Write your review"
                  value={reviewForm.text}
                  onChange={(event) =>
                    setReviewForm((current) => ({ ...current, text: event.target.value }))
                  }
                />
                {requestMessage ? <p className={`form-message ${requestMessageType}`}>{requestMessage}</p> : null}
                <div className="picker-actions">
                  <button type="submit" className="picker-option">
                    Save Review
                  </button>
                  <button type="button" className="picker-cancel" onClick={closeReviewModal}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
        {showReportModal && selectedMember ? (
          <div className="picker-modal" onClick={closeReportModal}>
            <div className="picker-sheet password-sheet" onClick={(event) => event.stopPropagation()}>
              <h3>Report User</h3>
              <p>Tell us why you want to report {selectedMember.name}.</p>
              <form className="password-modal-form" onSubmit={submitReport}>
                <textarea
                  rows="4"
                  placeholder="Add a short reason"
                  value={reportForm.reason}
                  onChange={(event) =>
                    setReportForm((current) => ({ ...current, reason: event.target.value }))
                  }
                />
                <label className="checkbox-filter">
                  <input
                    type="checkbox"
                    checked={reportForm.blockToo}
                    onChange={(event) =>
                      setReportForm((current) => ({ ...current, blockToo: event.target.checked }))
                    }
                  />
                  Block this user too
                </label>
                {requestMessage ? <p className={`form-message ${requestMessageType}`}>{requestMessage}</p> : null}
                <div className="picker-actions">
                  <button type="submit" className="picker-option">
                    Submit Report
                  </button>
                  <button type="button" className="picker-cancel" onClick={closeReportModal}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
        </div>
      </main>
    </div>
  );
}
