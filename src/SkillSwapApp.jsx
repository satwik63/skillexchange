import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  addDoc
} from "firebase/firestore";
import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword
} from "firebase/auth";
import { auth, db, isFirebaseConfigured } from "./firebase";
import { skillOptions } from "./skills";

const minPasswordLength = 8;

function createEmptyProfile(user, name = "") {
  return {
    uid: user?.uid || "",
    name: name || user?.displayName || "",
    email: user?.email || "",
    skill: "",
    teaches: [],
    wants: [],
    bio: "",
    profileImage: ""
  };
}

function splitSkills(value) {
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
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

function intersectionCount(left, right) {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item)).length;
}

function roomIdFor(leftUid, rightUid) {
  return [leftUid, rightUid].sort().join("__");
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

export default function SkillSwapApp() {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [currentUser, setCurrentUser] = useState(createEmptyProfile(null));
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [currentPage, setCurrentPage] = useState("home");
  const [activeChatId, setActiveChatId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileMessageType, setProfileMessageType] = useState("success");
  const [chatStatus, setChatStatus] = useState("Connecting to Firebase...");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [avatarInputKey, setAvatarInputKey] = useState(0);
  const [cameraInputKey, setCameraInputKey] = useState(0);
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: "",
    skill: "",
    confirmPassword: ""
  });
  const [showPasswords, setShowPasswords] = useState({
    login: false,
    signupConfirm: false,
    current: false,
    next: false,
    confirmNext: false
  });
  const [profileForm, setProfileForm] = useState({
    name: "",
    email: "",
    skill: "",
    teaches: "",
    wants: "",
    bio: "",
    profileImage: "",
    currentPassword: "",
    newPassword: "",
    confirmNewPassword: ""
  });

  const activeChat = members.find((member) => member.uid === activeChatId) || null;
  const hasAnyPasswordInput = Boolean(
    profileForm.currentPassword || profileForm.newPassword || profileForm.confirmNewPassword
  );
  const passwordFieldsComplete = Boolean(
    profileForm.currentPassword && profileForm.newPassword && profileForm.confirmNewPassword
  );
  const disableProfileSave = hasAnyPasswordInput && !passwordFieldsComplete;
  const profileSuggestions = [
    !currentUser.skill && "Add your primary skill",
    currentUser.teaches.length === 0 && "Add skills you can teach",
    currentUser.wants.length === 0 && "Add skills you want to learn",
    !currentUser.bio && "Write a short bio",
    !currentUser.profileImage && "Upload a profile picture"
  ].filter(Boolean);
  const completionChecks = [
    Boolean(currentUser.skill),
    currentUser.teaches.length > 0,
    currentUser.wants.length > 0,
    Boolean(currentUser.bio),
    Boolean(currentUser.profileImage)
  ];
  const completionPercent = Math.round(
    (completionChecks.filter(Boolean).length / completionChecks.length) * 100
  );

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setAuthReady(true);
      setChatStatus("Firebase is not configured. Add your config to .env.");
      return undefined;
    }

    return onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (!user) {
        setCurrentUser(createEmptyProfile(null));
        setMembers([]);
        setMessages([]);
        setActiveChatId("");
      }
    });
  }, []);

  useEffect(() => {
    if (!firebaseUser || !db) {
      return undefined;
    }

    const profileRef = doc(db, "profiles", firebaseUser.uid);
    return onSnapshot(profileRef, async (snapshot) => {
      if (!snapshot.exists()) {
        const emptyProfile = createEmptyProfile(firebaseUser);
        await setDoc(profileRef, emptyProfile);
        setCurrentUser(emptyProfile);
        return;
      }
      const data = snapshot.data();
      setCurrentUser({
        uid: firebaseUser.uid,
        name: data.name || "",
        email: firebaseUser.email || data.email || "",
        skill: data.skill || "",
        teaches: data.teaches || [],
        wants: data.wants || [],
        bio: data.bio || "",
        profileImage: data.profileImage || ""
      });
    });
  }, [firebaseUser]);
  useEffect(() => {
    if (!firebaseUser || !db) {
      return undefined;
    }

    const profilesRef = collection(db, "profiles");
    return onSnapshot(profilesRef, (snapshot) => {
      const nextMembers = snapshot.docs
        .map((item) => item.data())
        .filter((item) => item.uid && item.uid !== firebaseUser.uid)
        .map((item) => ({
          uid: item.uid,
          name: item.name || "Unnamed User",
          role: item.skill ? `${item.skill} learner` : "Skill exchange member",
          teaches: item.teaches || [],
          wants: item.wants || [],
          bio: item.bio || ""
        }));

      setMembers(nextMembers);
      if (!activeChatId && nextMembers.length > 0) {
        setActiveChatId(nextMembers[0].uid);
      }
    });
  }, [firebaseUser, activeChatId]);

  useEffect(() => {
    if (!firebaseUser || !db || !activeChatId) {
      return undefined;
    }

    const roomId = roomIdFor(firebaseUser.uid, activeChatId);
    const messagesRef = collection(db, "rooms", roomId, "messages");
    const roomQuery = query(messagesRef, orderBy("createdAt", "asc"));

    return onSnapshot(
      roomQuery,
      (snapshot) => {
        setMessages(
          snapshot.docs.map((item) => {
            const data = item.data();
            return {
              id: item.id,
              senderId: data.senderId,
              text: data.text || ""
            };
          })
        );
        setChatStatus("Firebase realtime chat connected.");
      },
      () => {
        setChatStatus("Unable to read chat messages.");
      }
    );
  }, [firebaseUser, activeChatId]);

  useEffect(() => {
    setProfileForm({
      name: currentUser.name || "",
      email: currentUser.email || "",
      skill: currentUser.skill || "",
      teaches: currentUser.teaches.join(", "),
      wants: currentUser.wants.join(", "),
      bio: currentUser.bio || "",
      profileImage: currentUser.profileImage || "",
      currentPassword: "",
      newPassword: "",
      confirmNewPassword: ""
    });
  }, [currentUser]);

  const filteredMembers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return members;
    }

    return members.filter((member) => {
      const searchable = [member.name, member.role, ...member.teaches, ...member.wants]
        .join(" ")
        .toLowerCase();
      return searchable.includes(term);
    });
  }, [members, searchTerm]);

  const rankedMembers = useMemo(() => {
    return filteredMembers
      .map((member) => {
        const teachMatch = intersectionCount(member.teaches || [], currentUser.wants || []);
        const wantMatch = intersectionCount(member.wants || [], currentUser.teaches || []);
        const skillBoost = currentUser.skill && (member.teaches || []).includes(currentUser.skill) ? 1 : 0;
        return {
          ...member,
          matchScore: teachMatch * 2 + wantMatch * 2 + skillBoost
        };
      })
      .sort((left, right) => right.matchScore - left.matchScore || left.name.localeCompare(right.name));
  }, [currentUser.skill, currentUser.teaches, currentUser.wants, filteredMembers]);

  const skillSuggestions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return skillOptions.slice(0, 8);
    }
    return skillOptions.filter((skill) => skill.startsWith(term) || skill.includes(term)).slice(0, 8);
  }, [searchTerm]);

  function updateAuthField(field, value) {
    setAuthForm((current) => ({ ...current, [field]: value }));
    setAuthError("");
    setAuthNotice("");
  }

  function updateProfileField(field, value) {
    setProfileForm((current) => ({ ...current, [field]: value }));
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
    setShowForgotPassword(false);
    setAuthForm({
      name: "",
      email: "",
      password: "",
      skill: "",
      confirmPassword: ""
    });
  }

  function handleProfileImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      updateProfileField("profileImage", String(reader.result || ""));
      setShowImagePicker(false);
    };
    reader.readAsDataURL(file);
  }

  function clearProfileImage() {
    updateProfileField("profileImage", "");
    setAvatarInputKey((current) => current + 1);
    setCameraInputKey((current) => current + 1);
    setShowImagePicker(false);
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

    if (!email || !password) {
      setAuthError("Please enter both email and password.");
      return;
    }

    try {
      if (authMode === "signup") {
        const passwordError = validatePassword(password);
        if (!authForm.name.trim()) {
          setAuthError("Please fill in your name.");
          return;
        }
        if (passwordError) {
          setAuthError(passwordError);
          return;
        }
        if (password !== authForm.confirmPassword.trim()) {
          setAuthError("Passwords do not match.");
          return;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const nextProfile = createEmptyProfile(userCredential.user, authForm.name.trim());
        await setDoc(doc(db, "profiles", userCredential.user.uid), nextProfile);
        setAuthNotice("Account created successfully.");
        return;
      }

      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      setAuthError(error?.message || "Unable to authenticate.");
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
      setShowForgotPassword(true);
      setAuthNotice(`Password reset email sent to ${email}.`);
    } catch (error) {
      setAuthError(error?.message || "Could not send password reset email.");
    }
  }
  async function handleLogout() {
    await signOut(auth);
    setCurrentPage("home");
    setAuthForm({
      name: "",
      email: "",
      password: "",
      skill: "",
      confirmPassword: ""
    });
  }

  async function sendMessage(event) {
    event.preventDefault();
    const text = chatInput.trim();
    if (!text || !firebaseUser || !activeChat || !db) {
      return;
    }

    try {
      const roomId = roomIdFor(firebaseUser.uid, activeChat.uid);
      await addDoc(collection(db, "rooms", roomId, "messages"), {
        senderId: firebaseUser.uid,
        senderName: currentUser.name || currentUser.email,
        text,
        createdAt: serverTimestamp()
      });
      setChatInput("");
    } catch (error) {
      setChatStatus(error?.message || "Message could not be sent.");
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    setProfileMessage("");

    if (!firebaseUser || !db) {
      setProfileMessageType("error");
      setProfileMessage("Firebase is not connected.");
      return;
    }

    let nextPassword = "";
    if (hasAnyPasswordInput) {
      if (!passwordFieldsComplete) {
        setProfileMessageType("error");
        setProfileMessage("Fill all three password fields.");
        return;
      }

      try {
        const credential = EmailAuthProvider.credential(
          firebaseUser.email || "",
          profileForm.currentPassword
        );
        await reauthenticateWithCredential(firebaseUser, credential);
        const passwordError = validatePassword(profileForm.newPassword);
        if (passwordError) {
          setProfileMessageType("error");
          setProfileMessage(passwordError);
          return;
        }
        if (profileForm.newPassword !== profileForm.confirmNewPassword) {
          setProfileMessageType("error");
          setProfileMessage("New password and confirm password do not match.");
          return;
        }
        nextPassword = profileForm.newPassword;
      } catch (error) {
        setProfileMessageType("error");
        setProfileMessage(error?.message || "Could not verify current password.");
        return;
      }
    }

    const nextProfile = {
      uid: firebaseUser.uid,
      name: profileForm.name.trim() || currentUser.name,
      email: firebaseUser.email || currentUser.email,
      skill: profileForm.skill.trim().toLowerCase(),
      teaches: splitSkills(profileForm.teaches),
      wants: splitSkills(profileForm.wants),
      bio: profileForm.bio.trim(),
      profileImage: profileForm.profileImage || ""
    };

    try {
      await setDoc(doc(db, "profiles", firebaseUser.uid), nextProfile, { merge: true });
      if (nextPassword) {
        await updatePassword(firebaseUser, nextPassword);
      }
      setProfileForm((current) => ({
        ...current,
        currentPassword: "",
        newPassword: "",
        confirmNewPassword: ""
      }));
      setProfileMessageType("success");
      setProfileMessage("Profile saved successfully.");
    } catch (error) {
      setProfileMessageType("error");
      setProfileMessage(error?.message || "Could not save profile.");
    }
  }

  const profileImagePreview = profileForm.profileImage || currentUser.profileImage || "";

  if (!isFirebaseConfigured) {
    return (
      <div className="login-screen">
        <div className="login-card config-card">
          <h1>Firebase Setup Needed</h1>
          <p>Add your Firebase keys to a local .env file using .env.example as the template.</p>
        </div>
      </div>
    );
  }

  if (!authReady) {
    return (
      <div className="login-screen">
        <div className="login-card config-card">
          <h1>Loading</h1>
          <p>Connecting to Firebase...</p>
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
            {authMode === "signup" && (
              <>
                <input placeholder="Full name" value={authForm.name} onChange={(event) => updateAuthField("name", event.target.value)} />
                <input placeholder="Primary skill" value={authForm.skill} onChange={(event) => updateAuthField("skill", event.target.value)} />
              </>
            )}
            <input type="email" placeholder="Email" value={authForm.email} onChange={(event) => updateAuthField("email", event.target.value)} />
            <div className="password-field">
              <input type={showPasswords.login ? "text" : "password"} placeholder="Password" value={authForm.password} onChange={(event) => updateAuthField("password", event.target.value)} />
              <button type="button" className="eye-toggle" aria-label={eyeLabel(showPasswords.login)} title={eyeLabel(showPasswords.login)} onClick={() => togglePasswordVisibility("login")}>
                <EyeIcon crossed={showPasswords.login} />
              </button>
            </div>
            {authMode === "signup" && (
              <div className="password-field">
                <input type={showPasswords.signupConfirm ? "text" : "password"} placeholder="Confirm password" value={authForm.confirmPassword} onChange={(event) => updateAuthField("confirmPassword", event.target.value)} />
                <button type="button" className="eye-toggle" aria-label={eyeLabel(showPasswords.signupConfirm)} title={eyeLabel(showPasswords.signupConfirm)} onClick={() => togglePasswordVisibility("signupConfirm")}>
                  <EyeIcon crossed={showPasswords.signupConfirm} />
                </button>
              </div>
            )}
            {authError && <p className="form-message error">{authError}</p>}
            {authNotice && <p className="form-message success">{authNotice}</p>}
            <button type="submit">{authMode === "login" ? "Log In" : "Create Account"}</button>
          </form>
          {authMode === "login" && <button type="button" className="forgot-link" onClick={handleForgotPassword}>Forgot password?</button>}
          {showForgotPassword && <div className="forgot-box"><strong>Reset help</strong><p>Check your email inbox for the Firebase reset link.</p></div>}
          <p className="switch-auth">
            {authMode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
            <button type="button" onClick={() => switchAuthMode(authMode === "login" ? "signup" : "login")}>{authMode === "login" ? "Sign Up" : "Login"}</button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-page">
      <header className="app-navbar">
        <div className="logo">SkillExchange</div>
        <nav className="nav-pills">
          <button type="button" onClick={() => setCurrentPage("home")}>Home</button>
          <button type="button" onClick={() => setCurrentPage("matches")}>Matches</button>
          <button type="button" onClick={() => setCurrentPage("chat")}>Chat</button>
          <button type="button" onClick={() => setCurrentPage("profile")}>Profile</button>
          <button type="button" onClick={handleLogout}>Logout</button>
        </nav>
      </header>
