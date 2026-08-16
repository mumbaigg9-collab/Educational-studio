import React, { useState, useEffect } from "react";
import { doc, onSnapshot, setDoc, updateDoc, deleteDoc, getDoc, collection, runTransaction } from "firebase/firestore";
import { db } from "./firebase";
import { Plus, Pencil, Trash2, FolderOpen, PlayCircle, X, Check, Video as VideoIcon, ChevronRight, Lock, LogOut, KeyRound, Power, ShieldOff, ShieldCheck, Trash } from "lucide-react";

const COLORS = {
  board: "#16302A",
  boardDark: "#102420",
  card: "#1E3E35",
  cardBorder: "#2E5347",
  chalk: "#F3EFE3",
  chalkDim: "#C9CFC6",
  yellow: "#E8C468",
  coral: "#DE8B78",
};

const FONT_DISPLAY = "'Caveat', cursive";
const FONT_BODY = "'Work Sans', sans-serif";

const DEFAULT_PIN = "6200146572";

const DEFAULT_DATA = {
  subjects: [
    { id: "s1", name: "Hindi", chapters: [] },
    { id: "s2", name: "English", chapters: [] },
    { id: "s3", name: "Mathematics", chapters: [] },
    { id: "s4", name: "Science", chapters: [] },
    { id: "s5", name: "Social Science", chapters: [] },
    { id: "s6", name: "Sanskrit", chapters: [] },
  ],
};

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const dataDocRef = doc(db, "appdata", "main");
const settingsDocRef = doc(db, "appdata", "settings");
const DEVICE_ID_KEY = "video-library-device-id";
const ACCESS_CODE_KEY = "video-library-access-code";

function getYouTubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{6,})/);
  return m ? m[1] : null;
}

function getGoogleDriveId(url) {
  if (!url) return null;
  const m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=download&)?id=)([a-zA-Z0-9_-]{10,})/);
  return m ? m[1] : null;
}

function getOrCreateDeviceId() {
  try {
    let id = window.localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = "dev-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      window.localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch (e) {
    return "dev-" + Math.random().toString(36).slice(2, 10);
  }
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch (e) {
    return "";
  }
}

export default function App() {
  const [mode, setMode] = useState("watch"); // watch | manage
  const [unlocked, setUnlocked] = useState(false);
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [manageTab, setManageTab] = useState("library"); // library | access

  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState("subjects"); // subjects | chapters | videos
  const [subjectId, setSubjectId] = useState(null);
  const [chapterId, setChapterId] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [addingName, setAddingName] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const [videoTitle, setVideoTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [showVideoForm, setShowVideoForm] = useState(false);

  const [deviceId] = useState(getOrCreateDeviceId);

  // ---- Access code gate ----
  const [savedCode, setSavedCode] = useState(() => {
    try { return window.localStorage.getItem(ACCESS_CODE_KEY) || ""; } catch (e) { return ""; }
  });
  const [codeDoc, setCodeDoc] = useState(undefined); // undefined = not checked yet, null = no code doc
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState("");
  const [codeChecking, setCodeChecking] = useState(false);

  useEffect(() => {
    if (!savedCode) { setCodeDoc(null); return; }
    const ref = doc(db, "accessCodes", savedCode);
    const unsub = onSnapshot(ref, (snap) => {
      setCodeDoc(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
    return () => unsub();
  }, [savedCode]);

  const hasAccess = !!(savedCode && codeDoc && !codeDoc.blocked && codeDoc.usedByDeviceId === deviceId);

  async function submitCode() {
    const code = codeInput.trim();
    if (!code) return;
    setCodeChecking(true);
    setCodeError("");
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, "accessCodes", code);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Invalid code.");
        const d = snap.data();
        if (d.blocked) throw new Error("This code has been blocked.");
        if (d.usedByDeviceId && d.usedByDeviceId !== deviceId) throw new Error("This code has already been used.");
        tx.update(ref, { usedByDeviceId: deviceId, usedAt: new Date().toISOString() });
      });
      try { window.localStorage.setItem(ACCESS_CODE_KEY, code); } catch (e) {}
      setSavedCode(code);
      setCodeInput("");
    } catch (e) {
      setCodeError(e.message || "Something went wrong, please try again.");
    } finally {
      setCodeChecking(false);
    }
  }

  // ---- Library + settings data ----
  useEffect(() => {
    const unsub = onSnapshot(
      dataDocRef,
      async (snap) => {
        if (snap.exists()) {
          setData(snap.data());
        } else {
          await setDoc(dataDocRef, DEFAULT_DATA);
          setData(DEFAULT_DATA);
        }
      },
      (err) => setError("Connection failed: " + err.message)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      settingsDocRef,
      async (snap) => {
        if (snap.exists()) {
          setSettings(snap.data());
        } else {
          const initial = { appEnabled: true, pin: DEFAULT_PIN };
          await setDoc(settingsDocRef, initial);
          setSettings(initial);
        }
        setLoading(false);
      },
      (err) => {
        setError("Connection failed: " + err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const [codes, setCodes] = useState([]);
  useEffect(() => {
    if (!(unlocked && mode === "manage" && manageTab === "access")) return;
    const unsub = onSnapshot(collection(db, "accessCodes"), (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      setCodes(list);
    });
    return () => unsub();
  }, [unlocked, mode, manageTab]);

  async function persist(next) {
    setData(next);
    try {
      await setDoc(dataDocRef, next);
      setError(null);
    } catch (e) {
      setError("Save failed, please try again.");
    }
  }

  async function toggleAppEnabled() {
    const next = { ...settings, appEnabled: !settings.appEnabled };
    setSettings(next);
    try {
      await updateDoc(settingsDocRef, { appEnabled: next.appEnabled });
    } catch (e) {
      setError("Could not update app status.");
    }
  }

  async function changePin(newPin) {
    const clean = newPin.trim();
    if (!clean) return { ok: false, message: "Enter a new PIN first." };
    try {
      await updateDoc(settingsDocRef, { pin: clean });
      return { ok: true };
    } catch (e) {
      return { ok: false, message: "Could not update PIN." };
    }
  }

  async function createCode(code) {
    const clean = code.trim();
    if (!clean) return { ok: false, message: "Enter a code first." };
    try {
      const ref = doc(db, "accessCodes", clean);
      const existing = await getDoc(ref);
      if (existing.exists()) return { ok: false, message: "This code already exists." };
      await setDoc(ref, { createdAt: new Date().toISOString(), usedByDeviceId: null, usedAt: null, blocked: false });
      return { ok: true };
    } catch (e) {
      return { ok: false, message: "Could not save code." };
    }
  }
  async function toggleBlockCode(id, blocked) {
    try {
      await updateDoc(doc(db, "accessCodes", id), { blocked: !blocked });
    } catch (e) {
      setError("Could not update code.");
    }
  }
  async function removeCode(id) {
    try {
      await deleteDoc(doc(db, "accessCodes", id));
    } catch (e) {
      setError("Could not delete code.");
    }
  }

  if (loading || !data || !settings || codeDoc === undefined) {
    return (
      <div style={{ background: COLORS.board, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{FONT_IMPORT}</style>
        <p style={{ fontFamily: FONT_BODY, color: COLORS.chalk }}>Loading...</p>
      </div>
    );
  }

  // Global app-disabled screen (developer switch), unless already unlocked into Manage.
  if (!settings.appEnabled && !unlocked) {
    return (
      <div style={{ background: COLORS.board, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <style>{FONT_IMPORT}</style>
        <div style={{ textAlign: "center", maxWidth: 320 }}>
          <Power size={40} color={COLORS.chalkDim} style={{ marginBottom: 12 }} />
          <p style={{ fontFamily: FONT_DISPLAY, color: COLORS.yellow, fontSize: 28, margin: 0 }}>Currently unavailable</p>
          <p style={{ color: COLORS.chalkDim, fontSize: 14, marginTop: 10 }}>This app has been temporarily switched off. Please check back later.</p>
        </div>
      </div>
    );
  }

  // Access-code gate — must have a valid, unblocked code granted to this device.
  if (!hasAccess && !unlocked) {
    return (
      <div style={{ background: COLORS.board, minHeight: "100vh", fontFamily: FONT_BODY }}>
        <style>{FONT_IMPORT}</style>
        <ChalkTexture />
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ width: "100%", maxWidth: 320, textAlign: "center" }}>
            <KeyRound size={34} color={COLORS.yellow} style={{ marginBottom: 10 }} />
            <p style={{ fontFamily: FONT_DISPLAY, color: COLORS.yellow, fontSize: 32, margin: 0 }}>Enter Access Code</p>
            <p style={{ color: COLORS.chalkDim, fontSize: 13, marginTop: 8, marginBottom: 18 }}>
              Ask your teacher or admin for your access code.
            </p>
            <input
              autoFocus
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitCode(); }}
              placeholder="Access code"
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box", textAlign: "center", fontSize: 16, letterSpacing: 1 }}
            />
            {codeError && <p style={{ color: "#E3948A", fontSize: 12, marginTop: 10 }}>{codeError}</p>}
            <button
              onClick={submitCode}
              disabled={codeChecking}
              style={{ ...addBtnStyle, width: "100%", justifyContent: "center", marginTop: 14, boxSizing: "border-box" }}
            >
              {codeChecking ? "Checking..." : "Unlock"}
            </button>
            <button onClick={requestManageFromGate} style={{ ...lockBtnStyle, marginTop: 18 }}>
              <Lock size={13} /> Developer login
            </button>
          </div>
        </div>
        {showPinPrompt && (
          <PinPrompt
            pinInput={pinInput}
            setPinInput={setPinInput}
            pinError={pinError}
            onSubmit={submitPin}
            onCancel={() => setShowPinPrompt(false)}
          />
        )}
      </div>
    );
  }

  const subject = data.subjects.find((s) => s.id === subjectId) || null;
  const chapter = subject ? subject.chapters.find((c) => c.id === chapterId) : null;
  const isManage = mode === "manage" && unlocked;

  function addSubject(name) {
    if (!name.trim()) return;
    persist({ ...data, subjects: [...data.subjects, { id: uid(), name: name.trim(), chapters: [] }] });
    setAddingName(""); setShowAdd(false);
  }
  function renameSubject(id, name) {
    if (!name.trim()) return;
    persist({ ...data, subjects: data.subjects.map((s) => (s.id === id ? { ...s, name: name.trim() } : s)) });
    setEditingId(null);
  }
  function deleteSubject(id) {
    persist({ ...data, subjects: data.subjects.filter((s) => s.id !== id) });
  }
  function addChapter(name) {
    if (!name.trim() || !subject) return;
    persist({
      ...data,
      subjects: data.subjects.map((s) => (s.id === subject.id ? { ...s, chapters: [...s.chapters, { id: uid(), name: name.trim(), videos: [] }] } : s)),
    });
    setAddingName(""); setShowAdd(false);
  }
  function renameChapter(id, name) {
    if (!name.trim() || !subject) return;
    persist({
      ...data,
      subjects: data.subjects.map((s) => (s.id === subject.id ? { ...s, chapters: s.chapters.map((c) => (c.id === id ? { ...c, name: name.trim() } : c)) } : s)),
    });
    setEditingId(null);
  }
  function deleteChapter(id) {
    if (!subject) return;
    persist({ ...data, subjects: data.subjects.map((s) => (s.id === subject.id ? { ...s, chapters: s.chapters.filter((c) => c.id !== id) } : s)) });
  }
  function addVideo(title, url) {
    if (!title.trim() || !url.trim() || !subject || !chapter) return;
    persist({
      ...data,
      subjects: data.subjects.map((s) =>
        s.id !== subject.id ? s : { ...s, chapters: s.chapters.map((c) => (c.id !== chapter.id ? c : { ...c, videos: [...c.videos, { id: uid(), title: title.trim(), url: url.trim() }] })) }
      ),
    });
    setVideoTitle(""); setVideoUrl(""); setShowVideoForm(false);
  }
  function deleteVideo(id) {
    if (!subject || !chapter) return;
    persist({
      ...data,
      subjects: data.subjects.map((s) =>
        s.id !== subject.id ? s : { ...s, chapters: s.chapters.map((c) => (c.id !== chapter.id ? c : { ...c, videos: c.videos.filter((v) => v.id !== id) })) }
      ),
    });
  }
  function renameVideo(id, title) {
    if (!title.trim() || !subject || !chapter) return;
    persist({
      ...data,
      subjects: data.subjects.map((s) =>
        s.id !== subject.id ? s : { ...s, chapters: s.chapters.map((c) => (c.id !== chapter.id ? c : { ...c, videos: c.videos.map((v) => (v.id === id ? { ...v, title: title.trim() } : v)) })) }
      ),
    });
    setEditingId(null);
  }

  function resetPanels() {
    setEditingId(null); setEditingText(""); setShowAdd(false); setAddingName(""); setShowVideoForm(false);
  }
  function goSubjects() { resetPanels(); setView("subjects"); setSubjectId(null); setChapterId(null); }
  function openSubject(id) { resetPanels(); setSubjectId(id); setView("chapters"); }
  function openChapter(id) { resetPanels(); setChapterId(id); setView("videos"); }
  function goChapters() { resetPanels(); setChapterId(null); setView("chapters"); }

  function requestManage() {
    if (unlocked) {
      resetPanels();
      setMode("manage");
      return;
    }
    setPinInput("");
    setPinError("");
    setShowPinPrompt(true);
  }
  function requestManageFromGate() {
    setPinInput("");
    setPinError("");
    setShowPinPrompt(true);
  }
  function submitPin() {
    const currentPin = settings.pin || DEFAULT_PIN;
    if (pinInput === currentPin) {
      setUnlocked(true);
      setShowPinPrompt(false);
      resetPanels();
      setMode("manage");
      setManageTab("library");
    } else {
      setPinError("Incorrect PIN, please try again.");
    }
  }
  function lockAndGoWatch() {
    resetPanels();
    setUnlocked(false);
    setMode("watch");
  }

  return (
    <div style={{ background: COLORS.board, minHeight: "100vh", fontFamily: FONT_BODY }}>
      <style>{FONT_IMPORT}</style>
      <ChalkTexture />

      {showPinPrompt && (
        <PinPrompt
          pinInput={pinInput}
          setPinInput={setPinInput}
          pinError={pinError}
          onSubmit={submitPin}
          onCancel={() => setShowPinPrompt(false)}
        />
      )}

      <header style={{ padding: "24px 20px 10px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontFamily: FONT_DISPLAY, color: COLORS.yellow, fontSize: 40, lineHeight: 1, margin: 0 }}>
              Class 10 Video Library
            </h1>
            <p style={{ color: COLORS.chalkDim, marginTop: 6, fontSize: 13 }}>
              {isManage ? "Manage videos — add, edit, delete." : "Choose your subject and chapter, then watch."}
            </p>
          </div>
          {isManage ? (
            <button onClick={lockAndGoWatch} style={lockBtnStyle}>
              <LogOut size={14} /> Lock &amp; exit
            </button>
          ) : (
            <button onClick={requestManage} style={lockBtnStyle}>
              <Lock size={14} /> Manage
            </button>
          )}
        </div>
        {!isManage && <Breadcrumb subject={subject} chapter={chapter} onHome={goSubjects} onSubject={goChapters} />}
        {isManage && (
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={() => setManageTab("library")} style={tabBtnStyle(manageTab === "library")}>Library</button>
            <button onClick={() => setManageTab("access")} style={tabBtnStyle(manageTab === "access")}>Access</button>
          </div>
        )}
      </header>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "10px 20px 60px" }}>
        {error && (
          <div style={{ background: "#4A2323", color: "#F5D0D0", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        {isManage && manageTab === "access" && (
          <AccessPanel
            codes={codes}
            appEnabled={settings.appEnabled}
            onToggleApp={toggleAppEnabled}
            onCreate={createCode}
            onToggleBlock={toggleBlockCode}
            onDelete={removeCode}
            onChangePin={changePin}
          />
        )}

        {(!isManage || manageTab === "library") && (
          <>
            {view === "subjects" && (
              <ListView
                emptyText={isManage ? "No subjects yet. Add one below." : "No subjects available yet."}
                items={data.subjects.map((s) => ({ id: s.id, name: s.name, sub: `${s.chapters.length} chapter${s.chapters.length === 1 ? "" : "s"}` }))}
                icon={FolderOpen}
                editingId={editingId} editingText={editingText} setEditingId={setEditingId} setEditingText={setEditingText}
                onOpen={openSubject} onRename={renameSubject} onDelete={deleteSubject}
                numbered={false} readOnly={!isManage}
              />
            )}

            {view === "chapters" && subject && (
              <ListView
                emptyText={isManage ? "No chapters in this subject yet. Add one below." : "No chapters available in this subject yet."}
                items={subject.chapters.map((c, i) => ({ id: c.id, name: c.name, sub: `${c.videos.length} video${c.videos.length === 1 ? "" : "s"}`, num: i + 1 }))}
                icon={ChevronRight}
                editingId={editingId} editingText={editingText} setEditingId={setEditingId} setEditingText={setEditingText}
                onOpen={openChapter} onRename={renameChapter} onDelete={deleteChapter}
                numbered={true} readOnly={!isManage}
              />
            )}

            {view === "videos" && chapter && (
              <VideosView
                chapter={chapter}
                editingId={editingId} editingText={editingText} setEditingId={setEditingId} setEditingText={setEditingText}
                onRename={renameVideo} onDelete={deleteVideo} readOnly={!isManage}
              />
            )}

            {isManage && (view === "subjects" || view === "chapters") && (
              <div style={{ marginTop: 18 }}>
                {!showAdd ? (
                  <button onClick={() => setShowAdd(true)} style={addBtnStyle}>
                    <Plus size={18} /> {view === "subjects" ? "Add new subject" : "Add new chapter"}
                  </button>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      autoFocus value={addingName} onChange={(e) => setAddingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") view === "subjects" ? addSubject(addingName) : addChapter(addingName);
                        if (e.key === "Escape") { setShowAdd(false); setAddingName(""); }
                      }}
                      placeholder={view === "subjects" ? "Subject name" : "Chapter name"} style={inputStyle}
                    />
                    <IconBtn onClick={() => (view === "subjects" ? addSubject(addingName) : addChapter(addingName))} title="Save"><Check size={18} /></IconBtn>
                    <IconBtn onClick={() => { setShowAdd(false); setAddingName(""); }} title="Cancel"><X size={18} /></IconBtn>
                  </div>
                )}
              </div>
            )}

            {isManage && view === "videos" && (
              <div style={{ marginTop: 18 }}>
                {!showVideoForm ? (
                  <button onClick={() => setShowVideoForm(true)} style={addBtnStyle}>
                    <Plus size={18} /> Add video
                  </button>
                ) : (
                  <div style={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 10, padding: 14 }}>
                    <input autoFocus value={videoTitle} onChange={(e) => setVideoTitle(e.target.value)} placeholder="Video title" style={{ ...inputStyle, width: "100%", marginBottom: 8 }} />
                    <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="Video URL (YouTube, Google Drive, or direct .mp4 link)" style={{ ...inputStyle, width: "100%" }} />
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button onClick={() => addVideo(videoTitle, videoUrl)} style={{ ...addBtnStyle, flex: "none" }}><Check size={16} /> Save</button>
                      <button onClick={() => { setShowVideoForm(false); setVideoTitle(""); setVideoUrl(""); }} style={{ ...addBtnStyle, flex: "none", color: COLORS.chalkDim, borderColor: COLORS.cardBorder }}><X size={16} /> Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function AccessPanel({ codes, appEnabled, onToggleApp, onCreate, onToggleBlock, onDelete, onChangePin }) {
  const [newCode, setNewCode] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  const [newPin, setNewPin] = useState("");
  const [pinMsg, setPinMsg] = useState("");
  const [pinSaving, setPinSaving] = useState(false);

  async function handleCreate() {
    setCreating(true);
    setCreateError("");
    const res = await onCreate(newCode);
    setCreating(false);
    if (res.ok) {
      setNewCode("");
    } else {
      setCreateError(res.message);
    }
  }

  async function handleChangePin() {
    setPinSaving(true);
    setPinMsg("");
    const res = await onChangePin(newPin);
    setPinSaving(false);
    if (res.ok) {
      setPinMsg("PIN updated.");
      setNewPin("");
    } else {
      setPinMsg(res.message);
    }
  }

  return (
    <div>
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 10, padding: 16, marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ color: COLORS.chalk, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
            <Power size={16} color={appEnabled ? COLORS.yellow : COLORS.coral} /> App status
          </div>
          <div style={{ color: COLORS.chalkDim, fontSize: 12, marginTop: 4 }}>
            {appEnabled ? "Live — access codes work normally." : "Switched off — nobody can view it right now."}
          </div>
        </div>
        <button onClick={onToggleApp} style={{ ...addBtnStyle, flex: "none", borderColor: appEnabled ? COLORS.yellow : COLORS.coral, color: appEnabled ? COLORS.yellow : COLORS.coral }}>
          {appEnabled ? "Turn off" : "Turn on"}
        </button>
      </div>

      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 10, padding: 14, marginBottom: 18 }}>
        <div style={{ color: COLORS.chalk, fontSize: 14, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <Lock size={15} color={COLORS.yellow} /> Change Manage PIN
        </div>
        <input
          value={newPin}
          onChange={(e) => setNewPin(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleChangePin(); }}
          placeholder="New PIN"
          type="text"
          inputMode="numeric"
          style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
        />
        {pinMsg && <p style={{ color: pinMsg === "PIN updated." ? COLORS.yellow : "#E3948A", fontSize: 12, marginTop: 8, marginBottom: 0 }}>{pinMsg}</p>}
        <button onClick={handleChangePin} disabled={pinSaving} style={{ ...addBtnStyle, marginTop: 10 }}>
          <Check size={16} /> {pinSaving ? "Saving..." : "Update PIN"}
        </button>
      </div>

      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 10, padding: 14, marginBottom: 18 }}>
        <div style={{ color: COLORS.chalk, fontSize: 14, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <KeyRound size={15} color={COLORS.yellow} /> Create a new access code
        </div>
        <input
          value={newCode}
          onChange={(e) => setNewCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
          placeholder="e.g. RAHUL01"
          style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
        />
        {createError && <p style={{ color: "#E3948A", fontSize: 12, marginTop: 8, marginBottom: 0 }}>{createError}</p>}
        <button onClick={handleCreate} disabled={creating} style={{ ...addBtnStyle, marginTop: 10 }}>
          <Plus size={16} /> {creating ? "Saving..." : "Save code"}
        </button>
      </div>

      <p style={{ color: COLORS.chalkDim, fontSize: 12, margin: "0 0 10px" }}>
        {codes.length} code{codes.length === 1 ? "" : "s"} created.
      </p>

      {codes.length === 0 ? (
        <EmptyState text="No access codes yet. Create one above." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {codes.map((c) => {
            const status = c.blocked ? "Blocked" : c.usedByDeviceId ? "Used" : "Unused";
            const statusColor = c.blocked ? COLORS.coral : c.usedByDeviceId ? COLORS.chalkDim : COLORS.yellow;
            return (
              <div key={c.id} style={rowCardStyle}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: COLORS.chalk, fontSize: 15, fontFamily: "monospace", letterSpacing: 0.5 }}>{c.id}</div>
                  <div style={{ color: statusColor, fontSize: 12, marginTop: 3 }}>
                    {status}{c.usedAt ? ` · ${formatDate(c.usedAt)}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {c.usedByDeviceId && (
                    c.blocked ? (
                      <IconBtn onClick={() => onToggleBlock(c.id, c.blocked)} title="Unblock"><ShieldCheck size={15} /></IconBtn>
                    ) : (
                      <IconBtn onClick={() => onToggleBlock(c.id, c.blocked)} title="Block" danger><ShieldOff size={15} /></IconBtn>
                    )
                  )}
                  <IconBtn onClick={() => onDelete(c.id)} title="Delete" danger><Trash size={15} /></IconBtn>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PinPrompt({ pinInput, setPinInput, pinError, onSubmit, onCancel }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20,
    }}>
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 12, padding: 22, width: "100%", maxWidth: 300 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Lock size={18} color={COLORS.yellow} />
          <span style={{ fontFamily: FONT_DISPLAY, color: COLORS.yellow, fontSize: 22 }}>Manage PIN</span>
        </div>
        <p style={{ color: COLORS.chalkDim, fontSize: 13, marginTop: 0, marginBottom: 12 }}>
          This area is for the developer only. Enter the PIN.
        </p>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          value={pinInput}
          onChange={(e) => setPinInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); if (e.key === "Escape") onCancel(); }}
          placeholder="PIN"
          style={{ ...inputStyle, width: "100%", boxSizing: "border-box", textAlign: "center", letterSpacing: 4, fontSize: 18 }}
        />
        {pinError && <p style={{ color: "#E3948A", fontSize: 12, marginTop: 8, marginBottom: 0 }}>{pinError}</p>}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={onSubmit} style={{ ...addBtnStyle, flex: 1, justifyContent: "center" }}><Check size={16} /> Unlock</button>
          <button onClick={onCancel} style={{ ...addBtnStyle, flex: "none", color: COLORS.chalkDim, borderColor: COLORS.cardBorder }}><X size={16} /></button>
        </div>
      </div>
    </div>
  );
}

function Breadcrumb({ subject, chapter, onHome, onSubject }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, fontSize: 14, color: COLORS.chalkDim, flexWrap: "wrap" }}>
      <button onClick={onHome} style={crumbBtn(!subject)}>Subjects</button>
      {subject && (<><ChevronRight size={14} /><button onClick={onSubject} style={crumbBtn(!!subject && !chapter)}>{subject.name}</button></>)}
      {chapter && (<><ChevronRight size={14} /><span style={{ color: COLORS.yellow }}>{chapter.name}</span></>)}
    </div>
  );
}
function crumbBtn(active) {
  return { background: "none", border: "none", cursor: "pointer", color: active ? COLORS.yellow : COLORS.chalkDim, fontFamily: FONT_BODY, fontSize: 14, padding: 0 };
}

function tabBtnStyle(active) {
  return {
    background: active ? COLORS.yellow : "transparent",
    color: active ? COLORS.boardDark : COLORS.chalkDim,
    border: `1px solid ${active ? COLORS.yellow : COLORS.cardBorder}`,
    borderRadius: 8, padding: "6px 14px", fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, cursor: "pointer",
  };
}

function ListView({ items, icon: Icon, editingId, editingText, setEditingId, setEditingText, onOpen, onRename, onDelete, emptyText, numbered, readOnly }) {
  if (items.length === 0) return <EmptyState text={emptyText} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((item) => (
        <div key={item.id} style={rowCardStyle}>
          {editingId === item.id && !readOnly ? (
            <div style={{ display: "flex", gap: 8, flex: 1 }}>
              <input autoFocus value={editingText} onChange={(e) => setEditingText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") onRename(item.id, editingText); if (e.key === "Escape") setEditingId(null); }}
                style={{ ...inputStyle, flex: 1 }} />
              <IconBtn onClick={() => onRename(item.id, editingText)} title="Save"><Check size={16} /></IconBtn>
              <IconBtn onClick={() => setEditingId(null)} title="Cancel"><X size={16} /></IconBtn>
            </div>
          ) : (
            <>
              <button onClick={() => onOpen(item.id)} style={rowMainBtn}>
                {numbered ? (
                  <span style={{ fontFamily: FONT_DISPLAY, color: COLORS.yellow, fontSize: 22, width: 30, textAlign: "center" }}>{item.num}</span>
                ) : (<Icon size={20} color={COLORS.yellow} />)}
                <span style={{ textAlign: "left" }}>
                  <div style={{ color: COLORS.chalk, fontSize: 16 }}>{item.name}</div>
                  <div style={{ color: COLORS.chalkDim, fontSize: 12 }}>{item.sub}</div>
                </span>
              </button>
              {!readOnly && (
                <div style={{ display: "flex", gap: 4 }}>
                  <IconBtn onClick={() => { setEditingId(item.id); setEditingText(item.name); }} title="Rename"><Pencil size={15} /></IconBtn>
                  <IconBtn onClick={() => onDelete(item.id)} title="Delete" danger><Trash2 size={15} /></IconBtn>
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function VideosView({ chapter, editingId, editingText, setEditingId, setEditingText, onRename, onDelete, readOnly }) {
  if (chapter.videos.length === 0) return <EmptyState text={readOnly ? "No videos available in this chapter yet." : "No videos in this chapter yet. Add one below."} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {chapter.videos.map((v) => {
        const ytId = getYouTubeId(v.url);
        const driveId = !ytId ? getGoogleDriveId(v.url) : null;
        return (
          <div key={v.id} style={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ aspectRatio: "16/9", background: COLORS.boardDark }}>
              {ytId ? (
                <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${ytId}`} title={v.title} frameBorder="0" allowFullScreen style={{ display: "block" }} />
              ) : driveId ? (
                <iframe width="100%" height="100%" src={`https://drive.google.com/file/d/${driveId}/preview`} title={v.title} frameBorder="0" allow="autoplay" allowFullScreen style={{ display: "block" }} />
              ) : (
                <video controls controlsList="nodownload" style={{ width: "100%", height: "100%" }} src={v.url} />
              )}
            </div>
            <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              {editingId === v.id && !readOnly ? (
                <div style={{ display: "flex", gap: 8, flex: 1 }}>
                  <input autoFocus value={editingText} onChange={(e) => setEditingText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") onRename(v.id, editingText); if (e.key === "Escape") setEditingId(null); }}
                    style={{ ...inputStyle, flex: 1 }} />
                  <IconBtn onClick={() => onRename(v.id, editingText)} title="Save"><Check size={16} /></IconBtn>
                  <IconBtn onClick={() => setEditingId(null)} title="Cancel"><X size={16} /></IconBtn>
                </div>
              ) : (
                <>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, color: COLORS.chalk, fontSize: 15 }}>
                    <PlayCircle size={16} color={COLORS.coral} /> {v.title}
                  </span>
                  {!readOnly && (
                    <div style={{ display: "flex", gap: 4 }}>
                      <IconBtn onClick={() => { setEditingId(v.id); setEditingText(v.title); }} title="Rename"><Pencil size={15} /></IconBtn>
                      <IconBtn onClick={() => onDelete(v.id)} title="Delete" danger><Trash2 size={15} /></IconBtn>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div style={{ border: `1.5px dashed ${COLORS.cardBorder}`, borderRadius: 10, padding: "30px 16px", textAlign: "center", color: COLORS.chalkDim }}>
      <VideoIcon size={26} color={COLORS.cardBorder} style={{ marginBottom: 8 }} />
      <div style={{ fontSize: 14 }}>{text}</div>
    </div>
  );
}

function IconBtn({ children, onClick, title, danger }) {
  return (
    <button onClick={onClick} title={title} style={{
      background: "transparent", border: `1px solid ${COLORS.cardBorder}`, borderRadius: 7, width: 32, height: 32,
      display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: danger ? "#E3948A" : COLORS.chalkDim,
    }}>{children}</button>
  );
}

const rowCardStyle = { background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 };
const rowMainBtn = { background: "none", border: "none", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", padding: "4px 0", flex: 1, textAlign: "left" };
const inputStyle = { background: COLORS.boardDark, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 7, color: COLORS.chalk, padding: "8px 10px", fontFamily: FONT_BODY, fontSize: 14, outline: "none" };
const addBtnStyle = { display: "flex", alignItems: "center", gap: 8, background: "none", border: `1.5px dashed ${COLORS.yellow}`, color: COLORS.yellow, borderRadius: 9, padding: "10px 16px", cursor: "pointer", fontFamily: FONT_BODY, fontSize: 14 };
const lockBtnStyle = { display: "flex", alignItems: "center", gap: 6, background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, color: COLORS.chalkDim, borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontFamily: FONT_BODY, fontSize: 13 };

function ChalkTexture() {
  return (
    <div style={{
      position: "fixed", inset: 0, pointerEvents: "none", opacity: 0.05,
      backgroundImage: "radial-gradient(circle at 20% 30%, white 0.5px, transparent 0.5px), radial-gradient(circle at 70% 60%, white 0.5px, transparent 0.5px)",
      backgroundSize: "3px 3px, 4px 4px",
    }} />
  );
}

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Work+Sans:wght@400;500;600&display=swap');`;
