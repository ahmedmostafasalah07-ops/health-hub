const SUPABASE_URL = "https://uzjobtodofcwdrybykuy.supabase.co";
const SUPABASE_KEY = "sb_publishable_rY5kXxNWYKRywqaS50HTSA_VPkrKek_";

// Optional EmailJS settings for automatic Welcome Emails after sign-up (see Step 3 below):
const EMAILJS_PUBLIC_KEY = "";
const EMAILJS_SERVICE_ID = "";
const EMAILJS_TEMPLATE_ID = "";

let tabId = sessionStorage.getItem("hh_tab_id");
if (!tabId) {
    tabId = "tab_" + Math.random().toString(36).slice(2) + "_" + Date.now();
    sessionStorage.setItem("hh_tab_id", tabId);
}

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        storage: window.sessionStorage,
        storageKey: "healthhub-auth-" + tabId,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

let currentUser = null;
let currentProfile = null;
let myPatient = null;
let myDoctor = null;

let patients = [];
let doctors = [];
let appointments = [];
let availability = [];
let doctorFilter = "All";

let signupRole = "patient";
let setupRole = "patient";
let isSigningUp = false;
let selectedBookingDate = "";
let selectedBookingTime = "";
let realtimeChannel = null;
let syncInterval = null;
let syncTimer = null;
let isLoadingData = false;let pendingReload = false;
let lastDataHash = "";
let lastSlotsKey = "";

/* ---------------- HELPERS ---------------- */

function showError(id, message) {
    const el = document.getElementById(id);
    if (el) el.textContent = message;
}

function showInfo(id, message) {
    const el = document.getElementById(id);
    if (el) el.textContent = message;
}

function num(id) {
    const v = document.getElementById(id).value.trim();
    return v === "" ? NaN : Number(v);
}

function bmi(p) {
    const w = Number(p.weight);
    const h = Number(p.height);
    return w / (h * h);
}

function category(b) {
    if (b < 18.5) return "Underweight";
    else if (b < 25) return "Normal";
    else if (b < 30) return "Overweight";
    else return "Obese";
}

function healthAdvice(cat) {
    if (cat === "Underweight") return "BMI is below the normal range. Consider a balanced, nutrient-rich diet and doctor checkup.";
    if (cat === "Normal") return "BMI is in the healthy range. Keep up regular exercise and balanced nutrition.";
    if (cat === "Overweight") return "BMI is slightly above the normal range. Regular activity and nutrition tracking can help.";
    return "BMI is in the obese range. Consider a personalized health plan with a doctor.";
}

function findById(list, id) {
    return list.find(function (x) { return x.id === id; });
}

function validDate(text) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
    const parts = text.split("-").map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.getMonth() === parts[1] - 1 && d.getDate() === parts[2];
}

function dayOfWeekFromDate(text) {
    const parts = text.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]).getDay();
}

function hhmm(t) {
    if (!t) return "—";
    return String(t).slice(0, 5);
}

function timeToMinutes(t) {
    const parts = hhmm(t).split(":").map(Number);
    return parts[0] * 60 + parts[1];
}

function minutesToTime(m) {
    const h = String(Math.floor(m / 60)).padStart(2, "0");
    const min = String(m % 60).padStart(2, "0");
    return h + ":" + min;
}

function format12Hour(t) {
    const parts = hhmm(t).split(":").map(Number);
    if (parts.length < 2 || isNaN(parts[0])) return hhmm(t);
    const suffix = parts[0] >= 12 ? "PM" : "AM";
    const h12 = parts[0] % 12 === 0 ? 12 : parts[0] % 12;
    return h12 + ":" + String(parts[1]).padStart(2, "0") + " " + suffix;
}

function toLocalIsoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
}

function addRow(tbody, cells, actions) {
    const tr = document.createElement("tr");
    cells.forEach(function (cell) {
        const td = document.createElement("td");
        if (cell && typeof cell === "object" && cell.badge) {
            const span = document.createElement("span");
            span.className = "badge " + cell.badge;
            span.textContent = cell.text;
            td.appendChild(span);
        } else {
            td.textContent = cell;
        }
        tr.appendChild(td);
    });
    if (actions) {
        const td = document.createElement("td");
        actions.forEach(function (a) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = a.label;
            if (a.className) btn.className = a.className;
            else if (a.label === "Delete") btn.className = "danger";
            btn.addEventListener("click", a.onClick);
            td.appendChild(btn);
        });
        tr.appendChild(td);
    }
    tbody.appendChild(tr);
}

function wirePasswordToggle(btnId, inputId) {
    document.getElementById(btnId).addEventListener("click", function () {
        const input = document.getElementById(inputId);
        const isHidden = input.type === "password";
        input.type = isHidden ? "text" : "password";
        this.textContent = isHidden ? "Hide" : "Show";
    });
}

wirePasswordToggle("toggle-login-pass", "login-password");
wirePasswordToggle("toggle-su-pass", "su-password");

/* ---------------- WELCOME EMAIL (EmailJS) ---------------- */

async function sendWelcomeEmail(toEmail, payload, regData) {
    if (!EMAILJS_PUBLIC_KEY || !EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID) return;
    if (!window.emailjs) return;
    if (payload.p_role !== "patient" && payload.p_role !== "doctor") return;

    let detailsText = "";
    if (payload.p_role === "patient") {
        const b = Number(payload.p_weight) / (Number(payload.p_height) * Number(payload.p_height));
        detailsText =
            "Role: Patient\n" +
            "Patient ID: " + (regData && regData.id ? regData.id : "Assigned") + "\n" +
            "Full Name: " + payload.p_name + "\n" +
            "Age: " + payload.p_age + " years\n" +
            "Weight: " + payload.p_weight + " Kg\n" +
            "Height: " + payload.p_height + " m\n" +
            "BMI: " + b.toFixed(1) + " (" + category(b) + ")";
    } else {
        detailsText =
            "Role: Doctor\n" +
            "Doctor ID: " + (regData && regData.id ? regData.id : "Assigned") + "\n" +
            "Full Name: Dr. " + payload.p_name + "\n" +
            "Age: " + payload.p_age + " years\n" +
            "Specialty: " + payload.p_specialty;
    }

    try {
        window.emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
        await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
            to_email: toEmail,
            user_name: payload.p_name,
            user_role: payload.p_role === "doctor" ? "Doctor" : "Patient",
            user_id: regData && regData.id ? regData.id : "",
            user_details: detailsText
        });
    } catch (err) {
        console.warn("Welcome email skipped:", err);
    }
}

/* ---------------- AUTH TABS & ROLE PICKERS ---------------- */

document.getElementById("tab-login").addEventListener("click", function () {
    this.classList.add("active");
    document.getElementById("tab-signup").classList.remove("active");
    document.getElementById("login-form").hidden = false;
    document.getElementById("signup-form").hidden = true;
    showError("auth-error", "");
    showInfo("auth-info", "");
});

document.getElementById("tab-signup").addEventListener("click", function () {
    this.classList.add("active");
    document.getElementById("tab-login").classList.remove("active");
    document.getElementById("login-form").hidden = true;
    document.getElementById("signup-form").hidden = false;
    showError("auth-error", "");
    showInfo("auth-info", "");
});

function setupRolePicker(containerId, prefix, onChange) {
    document.querySelectorAll("#" + containerId + " button").forEach(function (btn) {
        btn.addEventListener("click", function () {
            document.querySelectorAll("#" + containerId + " button").forEach(function (b) { b.classList.remove("active"); });
            btn.classList.add("active");
            const role = btn.dataset.role;
            onChange(role);
            document.getElementById(prefix + "-patient-fields").hidden = role !== "patient";
            document.getElementById(prefix + "-doctor-fields").hidden = role !== "doctor";
            document.getElementById(prefix + "-admin-fields").hidden = role !== "admin";
        });
    });
}

setupRolePicker("signup-roles", "su", function (r) { signupRole = r; });
setupRolePicker("setup-roles", "st", function (r) { setupRole = r; });

function readRolePayload(prefix, role) {
    const name = document.getElementById(prefix + "-name").value.trim();
    if (!name) return { error: "Name cannot be empty." };

    if (role === "patient") {
        const age = num(prefix + "-p-age");
        const weight = num(prefix + "-p-weight");
        const height = num(prefix + "-p-height");
        if (!Number.isInteger(age) || age < 0 || age > 120) return { error: "Age must be a whole number between 0 and 120." };
        if (!(weight >= 2 && weight <= 400)) return { error: "Weight must be between 2 and 400 Kg." };
        if (!(height >= 0.4 && height <= 2.5)) return { error: "Height must be between 0.4 and 2.5 meters." };
        return {
            p_role: "patient",
            p_name: name,
            p_age: age,
            p_weight: weight,
            p_height: height,
            p_specialty: null,
            p_staff_code: ""
        };
    }

    if (role === "doctor") {
        const age = num(prefix + "-d-age");
        const spec = document.getElementById(prefix + "-d-spec").value.trim();
        const code = document.getElementById(prefix + "-d-code").value.trim();
        if (!Number.isInteger(age) || age < 0 || age > 120) return { error: "Age must be a whole number between 0 and 120." };
        if (!spec) return { error: "Specialty cannot be empty." };
        if (!code) return { error: "Doctor Access Code is required." };
        return {
            p_role: "doctor",
            p_name: name,
            p_age: age,
            p_weight: null,
            p_height: null,
            p_specialty: spec,
            p_staff_code: code
        };
    }

    const aCode = document.getElementById(prefix + "-a-code").value.trim();
    if (!aCode) return { error: "Admin Access Code is required." };
    return {
        p_role: "admin",
        p_name: name,
        p_age: null,
        p_weight: null,
        p_height: null,
        p_specialty: null,
        p_staff_code: aCode
    };
}

/* ---------------- AUTH SUBMIT HANDLERS ---------------- */

document.getElementById("login-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    showError("auth-error", "");
    showInfo("auth-info", "");

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    const { error } = await db.auth.signInWithPassword({ email: email, password: password });
    if (error) showError("auth-error", error.message);
});

document.getElementById("signup-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    showError("auth-error", "");
    showInfo("auth-info", "");

    const email = document.getElementById("su-email").value.trim();
    const password = document.getElementById("su-password").value;
    if (!email || password.length < 6) {
        return showError("auth-error", "Enter a valid email and a password of at least 6 characters.");
    }

    const payload = readRolePayload("su", signupRole);
    if (payload.error) return showError("auth-error", payload.error);

    isSigningUp = true;
    const { data, error } = await db.auth.signUp({
        email: email,
        password: password,
        options: {
            emailRedirectTo: window.location.origin + window.location.pathname,
            data: { pending_reg: payload }
        }
    });

    if (error) {
        isSigningUp = false;
        return showError("auth-error", error.message);
    }

    if (!data.session) {
        isSigningUp = false;
        document.getElementById("signup-form").reset();
        showInfo("auth-info", "Account created! Confirm your email, then log in — your details are already saved.");
        return;
    }

    const reg = await db.rpc("complete_registration", payload);
    isSigningUp = false;
    if (reg.error) {
        await loadUserPortal(data.session.user);
        return showError("setup-error", reg.error.message + " Try again below.");
    }

    db.auth.updateUser({ data: { pending_reg: null } });
    sendWelcomeEmail(email, payload, reg.data);
    document.getElementById("signup-form").reset();
    await loadUserPortal(data.session.user);
});

document.getElementById("setup-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    showError("setup-error", "");

    const payload = readRolePayload("st", setupRole);
    if (payload.error) return showError("setup-error", payload.error);

    const reg = await db.rpc("complete_registration", payload);
    if (reg.error) return showError("setup-error", reg.error.message);

    db.auth.updateUser({ data: { pending_reg: null } });
    sendWelcomeEmail(currentUser.email, payload, reg.data);
    document.getElementById("setup-form").reset();
    await loadUserPortal(currentUser);
});

/* ---------------- TOP-LEFT PROFILE MODAL ---------------- */

function openProfileModal() {
    if (!currentProfile || !currentUser) return;
    showError("pm-error", "");
    showInfo("pm-info", "");
    document.getElementById("pm-view").hidden = false;
    document.getElementById("pm-edit-form").hidden = true;

    const details = document.getElementById("pm-details");
    details.innerHTML = "";

    const rows = [
        ["Role", currentProfile.role.charAt(0).toUpperCase() + currentProfile.role.slice(1)],
        ["Full Name", currentProfile.full_name],
        ["Email", currentUser.email]
    ];

    if (currentProfile.role === "patient" && myPatient) {
        const b = bmi(myPatient);
        rows.push(["Patient ID", myPatient.id]);
        rows.push(["Age", myPatient.age + " yrs"]);
        rows.push(["Weight", myPatient.weight + " Kg"]);
        rows.push(["Height", myPatient.height + " m"]);
        rows.push(["BMI", b.toFixed(1) + " (" + category(b) + ")"]);
    } else if (currentProfile.role === "doctor" && myDoctor) {
        rows.push(["Doctor ID", myDoctor.id]);
        rows.push(["Age", myDoctor.age + " yrs"]);
        rows.push(["Specialty", myDoctor.specialty]);
    }

    rows.forEach(function (pair) {
        const card = document.createElement("div");
        card.className = "report-stat";
        const label = document.createElement("small");
        label.textContent = pair[0];
        const val = document.createElement("strong");
        val.textContent = pair[1];
        card.appendChild(label);
        card.appendChild(val);
        details.appendChild(card);
    });

    document.getElementById("profile-modal").hidden = false;
}

function closeProfileModal() {
    document.getElementById("profile-modal").hidden = true;
}

document.getElementById("profile-btn").addEventListener("click", openProfileModal);
document.getElementById("pm-close").addEventListener("click", closeProfileModal);

document.getElementById("pm-edit-btn").addEventListener("click", function () {
    showError("pm-error", "");
    showInfo("pm-info", "");
    document.getElementById("pm-view").hidden = true;
    document.getElementById("pm-edit-form").hidden = false;

    document.getElementById("pm-name").value = currentProfile.full_name || "";
    const isP = currentProfile.role === "patient";
    const isD = currentProfile.role === "doctor";
    document.getElementById("pm-patient-fields").hidden = !isP;
    document.getElementById("pm-doctor-fields").hidden = !isD;

    if (isP && myPatient) {
        document.getElementById("pm-p-age").value = myPatient.age;
        document.getElementById("pm-p-weight").value = myPatient.weight;
        document.getElementById("pm-p-height").value = myPatient.height;
    } else if (isD && myDoctor) {
        document.getElementById("pm-d-age").value = myDoctor.age;
        document.getElementById("pm-d-spec").value = myDoctor.specialty;
    }
});

document.getElementById("pm-cancel-edit").addEventListener("click", function () {
    document.getElementById("pm-edit-form").hidden = true;
    document.getElementById("pm-view").hidden = false;
    showError("pm-error", "");
});

document.getElementById("pm-edit-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    showError("pm-error", "");
    showInfo("pm-info", "");

    const name = document.getElementById("pm-name").value.trim();
    if (!name) return showError("pm-error", "Name cannot be empty.");

    let rpcArgs = { p_name: name, p_age: null, p_weight: null, p_height: null, p_specialty: null };

    if (currentProfile.role === "patient") {
        const age = num("pm-p-age");
        const weight = num("pm-p-weight");
        const height = num("pm-p-height");
        if (!Number.isInteger(age) || age < 0 || age > 120) return showError("pm-error", "Age must be a whole number between 0 and 120.");
        if (!(weight >= 2 && weight <= 400)) return showError("pm-error", "Weight must be between 2 and 400 Kg.");
        if (!(height >= 0.4 && height <= 2.5)) return showError("pm-error", "Height must be between 0.4 and 2.5 meters.");
        rpcArgs.p_age = age;
        rpcArgs.p_weight = weight;
        rpcArgs.p_height = height;
    } else if (currentProfile.role === "doctor") {
        const age = num("pm-d-age");
        const spec = document.getElementById("pm-d-spec").value.trim();
        if (!Number.isInteger(age) || age < 0 || age > 120) return showError("pm-error", "Age must be a whole number between 0 and 120.");
        if (!spec) return showError("pm-error", "Specialty cannot be empty.");
        rpcArgs.p_age = age;
        rpcArgs.p_specialty = spec;
    }

    const { error } = await db.rpc("update_my_profile", rpcArgs);
    if (error) return showError("pm-error", error.message);

    currentProfile.full_name = name;
    updateProfileButton();
    await loadAll();
    openProfileModal();
    showInfo("pm-info", "Information updated!");
});

document.getElementById("pm-logout-btn").addEventListener("click", async function () {
    closeProfileModal();
    await db.auth.signOut();
});

function updateProfileButton() {
    if (!currentProfile) return;
    const btn = document.getElementById("profile-btn");
    const name = currentProfile.full_name || currentUser.email || "User";
    document.getElementById("profile-avatar").textContent = name.charAt(0).toUpperCase();
    document.getElementById("profile-btn-name").textContent = name;
    btn.hidden = false;
}

/* ---------------- NAVIGATION & SESSION ---------------- */

function buildNav(tabs) {
    const nav = document.getElementById("app-nav");
    nav.innerHTML = "";
    tabs.forEach(function (t, idx) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = t.label;
        btn.dataset.section = t.sectionId;
        btn.dataset.bg = t.bg;
        if (idx === 0) btn.classList.add("active");
        btn.addEventListener("click", function () {
            showSection(t.sectionId, t.bg);
            nav.querySelectorAll("button").forEach(function (b) { b.classList.remove("active"); });
            btn.classList.add("active");
        });
        nav.appendChild(btn);
    });
    if (tabs.length > 0) {
        showSection(tabs[0].sectionId, tabs[0].bg);
    }
}

function showSection(sectionId, bgKey) {
    document.querySelectorAll("#app-main section").forEach(function (s) { s.hidden = true; });
    const target = document.getElementById(sectionId);
    if (target) target.hidden = false;
    document.body.dataset.bg = bgKey || "auth";
}

async function handleSession(session) {
    if (isSigningUp) return;

    const user = session ? session.user : null;
    const userChanged = (user ? user.id : null) !== (currentUser ? currentUser.id : null);
    currentUser = user;

    if (!currentUser) {
        currentProfile = null;
        myPatient = null;
        myDoctor = null;
        patients = [];
        doctors = [];
        appointments = [];
        availability = [];
        stopEditPatient();
        stopEditDoctor();
        stopEditAppt();
        stopLiveSync();
        closeHealthReport();
        closeDoctorReport();
        closeProfileModal();
        closeAvailModal();
        document.getElementById("auth-section").hidden = false;
        document.getElementById("setup-section").hidden = true;
        document.getElementById("app-nav").hidden = true;
        document.getElementById("app-main").hidden = true;
        document.getElementById("profile-btn").hidden = true;
        document.getElementById("role-badge").hidden = true;
        document.body.dataset.bg = "auth";
        return;
    }

    document.getElementById("auth-section").hidden = true;

    if (userChanged || !currentProfile) {
        await loadUserPortal(currentUser);
    }
}

async function loadUserPortal(user) {
    currentUser = user;
    let { data: profile, error } = await db
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

    if (error) {
        showError("auth-error", error.message);
        return;
    }

    // Auto-complete registration from saved signup metadata (fixes being asked twice!)
    if (!profile && user.user_metadata && user.user_metadata.pending_reg) {
        const pending = user.user_metadata.pending_reg;
        const reg = await db.rpc("complete_registration", pending);
        if (!reg.error) {
            db.auth.updateUser({ data: { pending_reg: null } });
            sendWelcomeEmail(user.email, pending, reg.data);
            const refetch = await db.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
            profile = refetch.data;
        } else {
            showError("setup-error", reg.error.message + " Please check your details below.");
        }
    }

    if (!profile) {
        currentProfile = null;
        document.getElementById("setup-section").hidden = false;
        document.getElementById("app-nav").hidden = true;
        document.getElementById("app-main").hidden = true;
        document.getElementById("profile-btn").hidden = true;
        document.getElementById("role-badge").hidden = true;
        document.body.dataset.bg = "auth";
        return;
    }

    currentProfile = profile;
    document.getElementById("auth-section").hidden = true;
    document.getElementById("setup-section").hidden = true;
    document.getElementById("app-nav").hidden = false;
    document.getElementById("app-main").hidden = false;

    updateProfileButton();
    const badge = document.getElementById("role-badge");
    badge.textContent = profile.role;
    badge.hidden = false;

    if (profile.role === "patient") {
        buildNav([
            { label: "My Health", sectionId: "patient-profile-sec", bg: "patients" },
            { label: "Appointments", sectionId: "patient-appts-sec", bg: "appointments" }
        ]);
    } else if (profile.role === "doctor") {
        buildNav([
            { label: "My Appointments", sectionId: "doctor-appts-sec", bg: "appointments" },
            { label: "My Patients", sectionId: "doctor-patients-sec", bg: "doctors" },
            { label: "My Availability", sectionId: "doctor-avail-sec", bg: "doctors" }
        ]);
    } else {
        buildNav([
            { label: "Patients", sectionId: "patients", bg: "patients" },
            { label: "Doctors", sectionId: "doctors", bg: "doctors" },
            { label: "Appointments", sectionId: "appointments", bg: "appointments" }
        ]);
    }

        await loadAll();
    startLiveSync();
}

function scheduleLiveRefresh() {
    if (!currentProfile) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () {
        loadAll(true);
    }, 250);
}

function startLiveSync() {
    stopLiveSync();
    if (!currentProfile) return;

    realtimeChannel = db
        .channel("healthhub-live-" + tabId)
        .on("postgres_changes", { event: "*", schema: "public", table: "patients" }, scheduleLiveRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "doctors" }, scheduleLiveRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, scheduleLiveRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "doctor_availability" }, scheduleLiveRefresh)
        .subscribe();

    // Lightweight backup sync every 30s (only redraws if data actually changed!)
    syncInterval = setInterval(function () {
        if (!document.hidden && currentProfile) {
            loadAll(true);
        }
    }, 30000);
}

function stopLiveSync() {
    clearTimeout(syncTimer);
    lastDataHash = "";
    lastSlotsKey = "";
    pendingReload = false;
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }
    if (realtimeChannel) {
        db.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }
}

document.addEventListener("visibilitychange", function () {
    if (!document.hidden && currentProfile) {
        loadAll(true);
    }
});

async function loadAll(isSilent) {
    if (!currentProfile) return;
    if (isLoadingData) {
        if (!isSilent) pendingReload = true;
        return;
    }
    clearTimeout(syncTimer);
    isLoadingData = true;

    try {
        const [pRes, dRes, aRes, avRes] = await Promise.all([
            db.from("patients").select("*").order("created_at", { ascending: true }),
            db.from("doctors").select("*").order("created_at", { ascending: true }),
            db.from("appointments").select("*").order("date", { ascending: true }).order("appt_time", { ascending: true }),
            db.from("doctor_availability").select("*").order("day_of_week", { ascending: true })
        ]);

        const newP = pRes.data || [];
        const newD = dRes.data || [];
        const newA = aRes.data || [];
        const newAv = avRes.data || [];

        // Skip redrawing the entire UI if nothing in the database changed!
        const newHash = JSON.stringify([newP, newD, newA, newAv]);
        if (isSilent && newHash === lastDataHash) {
            if (currentProfile.role === "patient" && selectedBookingDate) {
                const docId = document.getElementById("pb-doctor").value;
                const dow = dayOfWeekFromDate(selectedBookingDate);
                const dayAvail = availability.find(function (av) { return av.doctor_id === docId && av.day_of_week === dow; });
                if (docId && dayAvail) {
                    await renderPatientBookingTimes(docId, selectedBookingDate, dayAvail, true);
                }
            }
            return;
        }
        lastDataHash = newHash;

        patients = newP;
        doctors = newD;
        appointments = newA;
        availability = newAv;

        if (currentProfile.role === "patient") {
            myPatient = patients.find(function (p) { return p.auth_user_id === currentUser.id; }) || patients[0] || null;
            renderPatientPortal(!!isSilent);
        } else if (currentProfile.role === "doctor") {
            myDoctor = doctors.find(function (d) { return d.auth_user_id === currentUser.id; }) || null;
            renderDoctorPortal();
            renderDoctorAvailability();
        } else {
            if (pRes.error) showError("p-error", pRes.error.message);
            if (dRes.error) showError("d-error", dRes.error.message);
            if (aRes.error) showError("a-error", aRes.error.message);
            renderPatients();
            renderDoctors();
            if (!editingAppt) {
                fillSelects();
                await refreshTimeSlots("a-doctor", "a-date", "a-time", "a-avail-hint", null);
            }
            renderAppointments();
        }
    } finally {
        isLoadingData = false;
        if (pendingReload) {
            pendingReload = false;
            loadAll(false);
        }
    }
}

    // Backup auto-sync every 8 seconds so all accounts always stay up to date
    syncInterval = setInterval(function () {
        if (!document.hidden && currentProfile) {
            loadAll(true);
        }
    }, 8000);
}

function stopLiveSync() {
    clearTimeout(syncTimer);
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }
    if (realtimeChannel) {
        db.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }
}

document.addEventListener("visibilitychange", function () {
    if (!document.hidden && currentProfile) {
        loadAll(true);
    }
});

async function loadAll(isSilent) {
    if (!currentProfile || isLoadingData) return;
    isLoadingData = true;

    try {
        const [pRes, dRes, aRes, avRes] = await Promise.all([
            db.from("patients").select("*").order("created_at", { ascending: true }),
            db.from("doctors").select("*").order("created_at", { ascending: true }),
            db.from("appointments").select("*").order("date", { ascending: true }).order("appt_time", { ascending: true }),
            db.from("doctor_availability").select("*").order("day_of_week", { ascending: true })
        ]);

        patients = pRes.data || [];
        doctors = dRes.data || [];
        appointments = aRes.data || [];
        availability = avRes.data || [];

        if (currentProfile.role === "patient") {
            myPatient = patients.find(function (p) { return p.auth_user_id === currentUser.id; }) || patients[0] || null;
            renderPatientPortal(!!isSilent);
        } else if (currentProfile.role === "doctor") {
            myDoctor = doctors.find(function (d) { return d.auth_user_id === currentUser.id; }) || null;
            renderDoctorPortal();
            renderDoctorAvailability();
        } else {
            if (pRes.error) showError("p-error", pRes.error.message);
            if (dRes.error) showError("d-error", dRes.error.message);
            if (aRes.error) showError("a-error", aRes.error.message);
            renderPatients();
            renderDoctors();
            if (!editingAppt) {
                fillSelects();
                await refreshTimeSlots("a-doctor", "a-date", "a-time", "a-avail-hint", null);
            }
            renderAppointments();
        }
    } finally {
        isLoadingData = false;
    }
}
/* ---------------- AVAILABLE TIME SLOTS HELPER ---------------- */

function doctorScheduleSummary(doctorId) {
    const slots = availability.filter(function (av) { return av.doctor_id === doctorId; });
    if (slots.length === 0) return "No available hours set yet.";
    return slots.map(function (av) {
        return DAY_NAMES[av.day_of_week].slice(0, 3) + " " + hhmm(av.start_time) + "-" + hhmm(av.end_time);
    }).join(", ");
}

async function refreshTimeSlots(docSelectId, dateInputId, timeSelectId, hintId, keepTime) {
    const docId = document.getElementById(docSelectId).value;
    const dateVal = document.getElementById(dateInputId).value;
    const timeSelect = document.getElementById(timeSelectId);
    const hint = document.getElementById(hintId);

    timeSelect.innerHTML = "";
    if (!docId) {
        hint.textContent = "Add a doctor first.";
        timeSelect.add(new Option("No times", ""));
        return;
    }

    const summary = doctorScheduleSummary(docId);
    hint.textContent = "Doctor's hours: " + summary;

    if (!validDate(dateVal)) {
        timeSelect.add(new Option("Pick a date first", ""));
        return;
    }

    const dow = dayOfWeekFromDate(dateVal);
    const dayAvail = availability.find(function (av) {
        return av.doctor_id === docId && av.day_of_week === dow;
    });

    if (!dayAvail) {
        timeSelect.add(new Option("Doctor unavailable on " + DAY_NAMES[dow], ""));
        return;
    }

    const bookedRes = await db.rpc("get_booked_slots", { p_doctor_id: docId, p_date: dateVal });
    const booked = (bookedRes.data || []).map(function (r) { return hhmm(r.appt_time); });

    const startMin = timeToMinutes(dayAvail.start_time);
    const endMin = timeToMinutes(dayAvail.end_time);
    const step = Number(dayAvail.slot_minutes) || 30;

    let added = 0;
    for (let m = startMin; m < endMin; m += step) {
        const label = minutesToTime(m);
        const isTaken = booked.includes(label) && label !== keepTime;
        if (!isTaken) {
            timeSelect.add(new Option(label, label));
            added++;
        }
    }

    if (added === 0) {
        timeSelect.add(new Option("All slots booked for this day", ""));
    } else if (keepTime) {
        timeSelect.value = keepTime;
    }
}

/* ---------------- PATIENT PORTAL ---------------- */

function renderPatientPortal(keepSelection) {
    if (!myPatient) return;
    const b = bmi(myPatient);
    const cat = category(b);

    document.getElementById("pp-heading").textContent = "Welcome, " + myPatient.name + " (" + myPatient.id + ")";
    document.getElementById("pp-advice").textContent = healthAdvice(cat);

    const completedCount = appointments.filter(function (a) { return a.status === "Completed"; }).length;
    const scheduledCount = appointments.length - completedCount;

    const grid = document.getElementById("pp-stats");
    grid.innerHTML = "";
    [
        ["Patient ID", myPatient.id],
        ["Age", myPatient.age + " yrs"],
        ["Weight", myPatient.weight + " Kg"],
        ["Height", myPatient.height + " m"],
        ["BMI", b.toFixed(1) + " (" + cat + ")"],
        ["Appointments", scheduledCount + " scheduled · " + completedCount + " completed"]
    ].forEach(function (pair) {
        const card = document.createElement("div");
        card.className = "report-stat";
        const label = document.createElement("small");
        label.textContent = pair[0];
        const val = document.createElement("strong");
        val.textContent = pair[1];
        card.appendChild(label);
        card.appendChild(val);
        grid.appendChild(card);
    });

    const docSel = document.getElementById("pb-doctor");
    const prevDoc = docSel.value;
    docSel.innerHTML = "";
    doctors.forEach(function (d) {
        docSel.add(new Option("Dr. " + d.name + " (" + d.specialty + ")", d.id));
    });
    if (prevDoc && findById(doctors, prevDoc)) docSel.value = prevDoc;
    renderPatientBookingDates(!!keepSelection);

    const body = document.getElementById("pp-appts-body");
    body.innerHTML = "";
    if (appointments.length === 0) {
        addRow(body, ["—", "No appointments scheduled yet.", "", "", "", "", "", ""]);
    } else {
        appointments.forEach(function (a) {
            const doc = findById(doctors, a.doctor_id);
            const st = a.status || "Scheduled";
            addRow(body, [
                "#" + a.id,
                a.date,
                format12Hour(a.appt_time),
                doc ? "Dr. " + doc.name : "?",
                doc ? doc.specialty : "—",
                a.reason || "—",
                { badge: st === "Completed" ? "completed" : "scheduled", text: st },
                a.report ? a.report : "No report yet"
            ]);
        });
    }
}

function getUpcomingAvailableDates(doctorId, maxCount) {
    const docAvail = availability.filter(function (av) { return av.doctor_id === doctorId; });
    if (docAvail.length === 0) return [];

    const results = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 60 && results.length < maxCount; i++) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
        const match = docAvail.find(function (av) { return av.day_of_week === d.getDay(); });
        if (match) {
            results.push({
                iso: toLocalIsoDate(d),
                label: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
                hours: format12Hour(match.start_time) + " - " + format12Hour(match.end_time),
                avail: match
            });
        }
    }
    return results;
}

function renderPatientBookingDates(keepSelection) {
    const docId = document.getElementById("pb-doctor").value;
    const datesBox = document.getElementById("pb-dates");
    const timesBox = document.getElementById("pb-times");
    datesBox.innerHTML = "";
    if (!keepSelection) {
        timesBox.innerHTML = "";
        selectedBookingTime = "";
    }

    if (!docId) {
        selectedBookingDate = "";
        selectedBookingTime = "";
        datesBox.innerHTML = "<span class='muted'>No doctors available yet.</span>";
        return;
    }

    const upcoming = getUpcomingAvailableDates(docId, 8);
    if (upcoming.length === 0) {
        selectedBookingDate = "";
        selectedBookingTime = "";
        datesBox.innerHTML = "<span class='muted'>This doctor has not set available hours yet.</span>";
        timesBox.innerHTML = "<span class='muted'>No time slots available.</span>";
        return;
    }

    if (!upcoming.some(function (u) { return u.iso === selectedBookingDate; })) {
        selectedBookingDate = upcoming[0].iso;
        selectedBookingTime = "";
    }

    upcoming.forEach(function (u) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "slot-btn" + (u.iso === selectedBookingDate ? " active" : "");

        const title = document.createTextNode(u.label);
        const sub = document.createElement("small");
        sub.textContent = u.hours;
        btn.appendChild(title);
        btn.appendChild(sub);

        btn.addEventListener("click", function () {
            selectedBookingDate = u.iso;
            selectedBookingTime = "";
            datesBox.querySelectorAll("button").forEach(function (b) { b.classList.remove("active"); });
            btn.classList.add("active");
            renderPatientBookingTimes(docId, u.iso, u.avail, false);
        });
        datesBox.appendChild(btn);
    });

    const chosen = upcoming.find(function (u) { return u.iso === selectedBookingDate; }) || upcoming[0];
    renderPatientBookingTimes(docId, chosen.iso, chosen.avail, !!keepSelection);
}

function scheduleLiveRefresh() {
    if (!currentProfile) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () {
        loadAll(true);
    }, 250);
}

function startLiveSync() {
    stopLiveSync();
    if (!currentProfile) return;

    realtimeChannel = db
        .channel("healthhub-live-" + tabId)
        .on("postgres_changes", { event: "*", schema: "public", table: "patients" }, scheduleLiveRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "doctors" }, scheduleLiveRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, scheduleLiveRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "doctor_availability" }, scheduleLiveRefresh)
        .subscribe();

    // Lightweight backup sync every 30s (only redraws if data actually changed!)
    syncInterval = setInterval(function () {
        if (!document.hidden && currentProfile) {
            loadAll(true);
        }
    }, 30000);
}

function stopLiveSync() {
    clearTimeout(syncTimer);
    lastDataHash = "";
    lastSlotsKey = "";
    pendingReload = false;
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }
    if (realtimeChannel) {
        db.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }
}

document.addEventListener("visibilitychange", function () {
    if (!document.hidden && currentProfile) {
        loadAll(true);
    }
});

async function loadAll(isSilent) {
    if (!currentProfile) return;
    if (isLoadingData) {
        if (!isSilent) pendingReload = true;
        return;
    }
    clearTimeout(syncTimer);
    isLoadingData = true;

    try {
        const [pRes, dRes, aRes, avRes] = await Promise.all([
            db.from("patients").select("*").order("created_at", { ascending: true }),
            db.from("doctors").select("*").order("created_at", { ascending: true }),
            db.from("appointments").select("*").order("date", { ascending: true }).order("appt_time", { ascending: true }),
            db.from("doctor_availability").select("*").order("day_of_week", { ascending: true })
        ]);

        const newP = pRes.data || [];
        const newD = dRes.data || [];
        const newA = aRes.data || [];
        const newAv = avRes.data || [];

        // Skip redrawing the entire UI if nothing in the database changed!
        const newHash = JSON.stringify([newP, newD, newA, newAv]);
        if (isSilent && newHash === lastDataHash) {
            if (currentProfile.role === "patient" && selectedBookingDate) {
                const docId = document.getElementById("pb-doctor").value;
                const dow = dayOfWeekFromDate(selectedBookingDate);
                const dayAvail = availability.find(function (av) { return av.doctor_id === docId && av.day_of_week === dow; });
                if (docId && dayAvail) {
                    await renderPatientBookingTimes(docId, selectedBookingDate, dayAvail, true);
                }
            }
            return;
        }
        lastDataHash = newHash;

        patients = newP;
        doctors = newD;
        appointments = newA;
        availability = newAv;

        if (currentProfile.role === "patient") {
            myPatient = patients.find(function (p) { return p.auth_user_id === currentUser.id; }) || patients[0] || null;
            renderPatientPortal(!!isSilent);
        } else if (currentProfile.role === "doctor") {
            myDoctor = doctors.find(function (d) { return d.auth_user_id === currentUser.id; }) || null;
            renderDoctorPortal();
            renderDoctorAvailability();
        } else {
            if (pRes.error) showError("p-error", pRes.error.message);
            if (dRes.error) showError("d-error", dRes.error.message);
            if (aRes.error) showError("a-error", aRes.error.message);
            renderPatients();
            renderDoctors();
            if (!editingAppt) {
                fillSelects();
                await refreshTimeSlots("a-doctor", "a-date", "a-time", "a-avail-hint", null);
            }
            renderAppointments();
        }
    } finally {
        isLoadingData = false;
        if (pendingReload) {
            pendingReload = false;
            loadAll(false);
        }
    }
}

    const now = new Date();
    const todayIso = toLocalIsoDate(now);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const startMin = timeToMinutes(dayAvail.start_time);
    const endMin = timeToMinutes(dayAvail.end_time);
    const step = Number(dayAvail.slot_minutes) || 30;

    timesBox.innerHTML = "";
    let openCount = 0;
    let stillValid = false;

    for (let m = startMin; m < endMin; m += step) {
        const val = minutesToTime(m);
        const isTaken = booked.includes(val);
        const isPast = dateIso === todayIso && m <= nowMinutes;
        if (isTaken || isPast) continue;

        openCount++;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "slot-btn" + (val === prevSelected ? " active" : "");
        if (val === prevSelected) stillValid = true;
        btn.textContent = format12Hour(val);
        btn.addEventListener("click", function () {
            selectedBookingTime = val;
            timesBox.querySelectorAll("button").forEach(function (b) { b.classList.remove("active"); });
            btn.classList.add("active");
        });
        timesBox.appendChild(btn);
    }

    selectedBookingTime = stillValid ? prevSelected : "";

    if (openCount === 0) {
        const msg = document.createElement("span");
        msg.className = "muted";
        msg.textContent = "All time slots are booked or passed for this day. Pick another day above.";
        timesBox.appendChild(msg);
    }
}

document.getElementById("pp-quick-weight").addEventListener("click", function () {
    if (myPatient) updateWeight(myPatient);
});

document.getElementById("pb-doctor").addEventListener("change", function () {
    selectedBookingDate = "";
    selectedBookingTime = "";
    renderPatientBookingDates(false);
});

document.getElementById("pb-reason").addEventListener("change", function () {
    const otherInput = document.getElementById("pb-reason-other");
    otherInput.hidden = this.value !== "Other";
    if (this.value !== "Other") otherInput.value = "";
});

document.getElementById("pp-book-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!myPatient) return;
    showError("pb-error", "");
    showInfo("pb-info", "");

    const doctorId = document.getElementById("pb-doctor").value;
    const reasonSel = document.getElementById("pb-reason").value;
    const reasonOther = document.getElementById("pb-reason-other").value.trim();
    const reason = reasonSel === "Other" ? reasonOther : reasonSel;

    if (!doctorId) return showError("pb-error", "Please select a doctor.");
    if (!selectedBookingDate) return showError("pb-error", "Please choose an available day.");
    if (!selectedBookingTime) return showError("pb-error", "Please click an available time slot.");

    const bookedDate = selectedBookingDate;
    const bookedTime = selectedBookingTime;

    const { error } = await db.from("appointments").insert({
        patient_id: myPatient.id,
        doctor_id: doctorId,
        date: bookedDate,
        appt_time: bookedTime,
        reason: reason,
        status: "Scheduled",
        report: "",
        notes: ""
    });

    if (error) return showError("pb-error", error.message);
    document.getElementById("pb-reason").value = "";
    document.getElementById("pb-reason-other").value = "";
    document.getElementById("pb-reason-other").hidden = true;
    selectedBookingTime = "";
    showInfo("pb-info", "Appointment booked for " + bookedDate + " at " + format12Hour(bookedTime) + "!");
    await loadAll();
});

/* ---------------- DOCTOR PORTAL & AVAILABILITY ---------------- */

document.querySelectorAll("#dp-filters button").forEach(function (btn) {
    btn.addEventListener("click", function () {
        document.querySelectorAll("#dp-filters button").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        doctorFilter = btn.dataset.filter;
        renderDoctorPortal();
    });
});

function renderDoctorPortal() {
    if (myDoctor) {
        document.getElementById("dp-heading").textContent = "Dr. " + myDoctor.name + " (" + myDoctor.id + ")";
        document.getElementById("dp-subtitle").textContent = "Specialty: " + myDoctor.specialty;
    }

    const completedCount = appointments.filter(function (a) { return a.status === "Completed"; }).length;
    const scheduledCount = appointments.length - completedCount;

    const grid = document.getElementById("dp-stats");
    grid.innerHTML = "";
    [
        ["Total Appointments", String(appointments.length)],
        ["Scheduled", String(scheduledCount)],
        ["Completed", String(completedCount)],
        ["My Patients", String(patients.length)]
    ].forEach(function (pair) {
        const card = document.createElement("div");
        card.className = "report-stat";
        const label = document.createElement("small");
        label.textContent = pair[0];
        const val = document.createElement("strong");
        val.textContent = pair[1];
        card.appendChild(label);
        card.appendChild(val);
        grid.appendChild(card);
    });

    const filtered = appointments.filter(function (a) {
        if (doctorFilter === "All") return true;
        return (a.status || "Scheduled") === doctorFilter;
    });

    const body = document.getElementById("dp-appts-body");
    body.innerHTML = "";
    if (filtered.length === 0) {
        addRow(body, ["—", "No appointments found.", "", "", "", "", "", "", "", ""]);
    } else {
        filtered.forEach(function (a) {
            const p = findById(patients, a.patient_id);
            const st = a.status || "Scheduled";
            const isDone = st === "Completed";
            const vitals = p ? p.age + "y · " + p.weight + "Kg · BMI " + bmi(p).toFixed(1) : "—";
            addRow(
                body,
                [
                    "#" + a.id,
                    a.date,
                    hhmm(a.appt_time),
                    p ? p.name + " (" + p.id + ")" : a.patient_id,
                    vitals,
                    a.reason,
                    { badge: isDone ? "completed" : "scheduled", text: st },
                    a.report ? a.report : "—",
                    a.notes ? a.notes : "—"
                ],
                [
                    {
                        label: isDone ? "Edit Report & Notes" : "Complete & Notes",
                        className: "success",
                        onClick: function () { openDoctorReport(a); }
                    },
                    {
                        label: "Patient Details",
                        onClick: function () { if (p) openHealthReport(p, true); }
                    }
                ]
            );
        });
    }

    const pBody = document.getElementById("dp-patients-body");
    pBody.innerHTML = "";
    if (patients.length === 0) {
        addRow(pBody, ["—", "No patients assigned yet.", "", "", "", "", "", ""]);
    } else {
        patients.forEach(function (p) {
            const b = bmi(p);
            addRow(
                pBody,
                [p.id, p.name, p.age, p.weight + " Kg", p.height + " m", b.toFixed(1), category(b)],
                [
                    { label: "Full Report", className: "success", onClick: function () { openHealthReport(p, true); } }
                ]
            );
        });
    }
}

function renderDoctorAvailability() {
    if (!myDoctor) return;
    const body = document.getElementById("av-body");
    body.innerHTML = "";
    const mine = availability.filter(function (av) { return av.doctor_id === myDoctor.id; });
    if (mine.length === 0) {
        addRow(body, ["No available days set yet.", "", "", "", ""]);
        return;
    }
    mine.forEach(function (av) {
        addRow(
            body,
            [DAY_NAMES[av.day_of_week], format12Hour(av.start_time), format12Hour(av.end_time), av.slot_minutes + " min"],
            [
                {
                    label: "Edit",
                    onClick: function () {
                        document.getElementById("av-day").value = String(av.day_of_week);
                        document.getElementById("av-start").value = hhmm(av.start_time);
                        document.getElementById("av-end").value = hhmm(av.end_time);
                        document.getElementById("av-slot").value = String(av.slot_minutes);
                        showError("av-error", "");
                        showInfo("av-info", "Editing " + DAY_NAMES[av.day_of_week] + " — adjust hours and click Save Day Hours.");
                    }
                },
                {
                    label: "Delete",
                    onClick: async function () {
                        const { error } = await db.from("doctor_availability").delete().eq("id", av.id);
                        if (error) return showError("av-error", error.message);
                        showInfo("av-info", DAY_NAMES[av.day_of_week] + " removed.");
                        await loadAll();
                    }
                }
            ]
        );
    });
}
document.getElementById("avail-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!myDoctor) return;
    showError("av-error", "");
    showInfo("av-info", "");

    const day = Number(document.getElementById("av-day").value);
    const startTime = document.getElementById("av-start").value;
    const endTime = document.getElementById("av-end").value;
    const slotMin = Number(document.getElementById("av-slot").value);

    if (!startTime || !endTime || timeToMinutes(endTime) <= timeToMinutes(startTime)) {
        return showError("av-error", "End time must be after start time.");
    }

    const { error } = await db
        .from("doctor_availability")
        .upsert(
            { doctor_id: myDoctor.id, day_of_week: day, start_time: startTime, end_time: endTime, slot_minutes: slotMin },
            { onConflict: "doctor_id,day_of_week" }
        );

    if (error) return showError("av-error", error.message);
    showInfo("av-info", "Saved " + DAY_NAMES[day] + " (" + startTime + " - " + endTime + ")!");
    await loadAll();
});

/* ---------------- SHARED MODALS & WEIGHT UPDATE ---------------- */

async function updateWeight(p) {
    const raw = prompt("Enter new weight (Kg) for " + p.name + ":", p.weight);
    if (raw === null) return;
    const newWeight = Number(raw.trim());
    if (!(newWeight >= 2 && newWeight <= 400)) {
        alert("Weight must be a number between 2 and 400 Kg.");
        return;
    }

    const { error } = await db
        .from("patients")
        .update({ weight: newWeight })
        .eq("id", p.id);

    if (error) {
        alert(error.message);
        return;
    }
    await loadAll();
}

function openHealthReport(p, showNotes) {
    const b = bmi(p);
    const cat = category(b);
    const pAppts = appointments.filter(function (a) { return a.patient_id === p.id; });
    const completedCount = pAppts.filter(function (a) { return a.status === "Completed"; }).length;
    const scheduledCount = pAppts.length - completedCount;

    document.getElementById("hr-title").textContent = "Health Report: " + p.name + " (" + p.id + ")";
    const container = document.getElementById("hr-body");
    container.innerHTML = "";

    const grid = document.createElement("div");
    grid.className = "report-grid";
    [
        ["Age", p.age + " yrs"],
        ["Weight", p.weight + " Kg"],
        ["Height", p.height + " m"],
        ["BMI", b.toFixed(1) + " (" + cat + ")"],
        ["Scheduled Appts", String(scheduledCount)],
        ["Completed Appts", String(completedCount)]
    ].forEach(function (pair) {
        const card = document.createElement("div");
        card.className = "report-stat";
        const label = document.createElement("small");
        label.textContent = pair[0];
        const val = document.createElement("strong");
        val.textContent = pair[1];
        card.appendChild(label);
        card.appendChild(val);
        grid.appendChild(card);
    });
    container.appendChild(grid);

    const advice = document.createElement("p");
    advice.className = "muted";
    advice.textContent = healthAdvice(cat);
    container.appendChild(advice);

    const heading = document.createElement("h3");
    heading.textContent = "Appointments & Doctor Reports";
    container.appendChild(heading);

    if (pAppts.length === 0) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = "No appointments recorded for this patient yet.";
        container.appendChild(empty);
    } else {
        pAppts.forEach(function (a) {
            const doc = findById(doctors, a.doctor_id);
            const item = document.createElement("div");
            item.className = "report-item";

            const top = document.createElement("div");
            const title = document.createElement("strong");
            title.textContent = "#" + a.id + " · " + a.date + " " + hhmm(a.appt_time) + " · Dr. " + (doc ? doc.name : "?") + " ";
            const badge = document.createElement("span");
            const st = a.status || "Scheduled";
            badge.className = "badge " + (st === "Completed" ? "completed" : "scheduled");
            badge.textContent = st;
            top.appendChild(title);
            top.appendChild(badge);
            item.appendChild(top);

            const reason = document.createElement("p");
            reason.className = "muted";
            reason.textContent = "Reason: " + a.reason;
            item.appendChild(reason);

            const rep = document.createElement("p");
            rep.textContent = "Doctor's Report: " + (a.report ? a.report : "No report added yet.");
            item.appendChild(rep);

            if (showNotes) {
                const n = document.createElement("p");
                n.className = "muted";
                n.textContent = "Clinical Notes: " + (a.notes ? a.notes : "None");
                item.appendChild(n);
            }

            container.appendChild(item);
        });
    }

    document.getElementById("health-modal").hidden = false;
}

function closeHealthReport() {
    document.getElementById("health-modal").hidden = true;
}

document.getElementById("hr-close").addEventListener("click", closeHealthReport);

let reportingAppt = null;

function openDoctorReport(a) {
    reportingAppt = a;
    const p = findById(patients, a.patient_id);
    const d = findById(doctors, a.doctor_id);
    document.getElementById("dr-title").textContent = "Appointment #" + a.id + " — Report & Notes";
    document.getElementById("dr-subtitle").textContent =
        (p ? p.name + " (" + p.id + ")" : a.patient_id) +
        " with Dr. " + (d ? d.name : a.doctor_id) +
        " on " + a.date + " at " + hhmm(a.appt_time) + " (" + a.reason + ")";
    document.getElementById("dr-status").value = "Completed";
    document.getElementById("dr-report").value = a.report || "";
    document.getElementById("dr-notes").value = a.notes || "";
    showError("dr-error", "");
    document.getElementById("dr-modal").hidden = false;
}

function closeDoctorReport() {
    reportingAppt = null;
    document.getElementById("dr-modal").hidden = true;
}

document.getElementById("dr-close").addEventListener("click", closeDoctorReport);
document.getElementById("dr-cancel").addEventListener("click", closeDoctorReport);

document.getElementById("dr-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!reportingAppt) return;

    const status = document.getElementById("dr-status").value;
    const report = document.getElementById("dr-report").value.trim();
    const notes = document.getElementById("dr-notes").value.trim();

    if (status === "Completed" && report === "") {
        return showError("dr-error", "Please write the doctor's report before marking Completed.");
    }

    const { error } = await db
        .from("appointments")
        .update({ status: status, report: report, notes: notes })
        .eq("id", reportingAppt.id);

    if (error) return showError("dr-error", error.message);
    closeDoctorReport();
    await loadAll();
});

/* ---------------- ADMIN: PATIENTS ---------------- */

let editingPatient = null;

function renderPatients() {
    const body = document.getElementById("p-body");
    body.innerHTML = "";
    patients.forEach(function (p) {
        addRow(
            body,
            [p.id, p.name, p.age, p.weight + " Kg", bmi(p).toFixed(1), category(bmi(p))],
            [
                { label: "Update Weight", onClick: function () { updateWeight(p); } },
                { label: "Health Report", className: "success", onClick: function () { openHealthReport(p, true); } },
                { label: "Edit", onClick: function () { startEditPatient(p); } },
                { label: "Delete", onClick: function () { deletePatient(p); } }
            ]
        );
    });
}

function startEditPatient(p) {
    editingPatient = p;
    document.getElementById("p-id").value = p.id;
    document.getElementById("p-name").value = p.name;
    document.getElementById("p-age").value = p.age;
    document.getElementById("p-weight").value = p.weight;
    document.getElementById("p-height").value = p.height;
    document.querySelector("#patient-form button[type=submit]").textContent = "Save changes";
    document.getElementById("p-cancel").hidden = false;
    showError("p-error", "");
}

function stopEditPatient() {
    editingPatient = null;
    document.getElementById("patient-form").reset();
    document.getElementById("p-id").value = "";
    document.querySelector("#patient-form button[type=submit]").textContent = "Add patient";
    document.getElementById("p-cancel").hidden = true;
}

async function deletePatient(p) {
    if (appointments.some(function (a) { return a.patient_id === p.id; })) {
        alert("Cannot delete: this patient has appointments. Delete them first.");
        return;
    }
    if (!confirm("Delete " + p.name + "?")) return;

    const { error } = await db.from("patients").delete().eq("id", p.id);
    if (error) return showError("p-error", error.message);
    if (editingPatient && editingPatient.id === p.id) stopEditPatient();
    await loadAll();
}

document.getElementById("p-cancel").addEventListener("click", stopEditPatient);

document.getElementById("patient-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    const name = document.getElementById("p-name").value.trim();
    const age = num("p-age");
    const weight = num("p-weight");
    const height = num("p-height");

    if (name === "") return showError("p-error", "Name cannot be empty.");
    if (!Number.isInteger(age) || age < 0 || age > 120) return showError("p-error", "Age must be a whole number between 0 and 120.");
    if (!(weight >= 2 && weight <= 400)) return showError("p-error", "Weight must be between 2 and 400 Kg.");
    if (!(height >= 0.4 && height <= 2.5)) return showError("p-error", "Height must be between 0.4 and 2.5 meters.");

    let result;
    if (editingPatient) {
        result = await db
            .from("patients")
            .update({ name: name, age: age, weight: weight, height: height })
            .eq("id", editingPatient.id);
    } else {
        result = await db
            .from("patients")
            .insert({ name: name, age: age, weight: weight, height: height });
    }

    if (result.error) return showError("p-error", result.error.message);
    showError("p-error", "");
    stopEditPatient();
    await loadAll();
});

/* ---------------- ADMIN: DOCTORS ---------------- */

function renderDoctors() {
    const body = document.getElementById("d-body");
    body.innerHTML = "";
    doctors.forEach(function (d) {
        addRow(
            body,
            [d.id, d.name, d.age, d.specialty, doctorScheduleSummary(d.id)],
            [
                { label: "Edit", onClick: function () { startEditDoctor(d); } },
                { label: "Delete", onClick: function () { deleteDoctor(d); } }
            ]
        );
    });
}

let editingDoctor = null;
let managingAvailDoctor = null;

function openAvailModal(d) {
    managingAvailDoctor = d;
    document.getElementById("am-title").textContent = "Availability — Dr. " + d.name + " (" + d.id + ")";
    showError("am-error", "");
    showInfo("am-info", "");
    renderAvailModalTable();
    document.getElementById("avail-modal").hidden = false;
}

function closeAvailModal() {
    managingAvailDoctor = null;
    document.getElementById("avail-modal").hidden = true;
}

function renderAvailModalTable() {
    if (!managingAvailDoctor) return;
    const body = document.getElementById("am-body");
    body.innerHTML = "";
    const list = availability.filter(function (av) { return av.doctor_id === managingAvailDoctor.id; });
    if (list.length === 0) {
        addRow(body, ["No available days set yet.", "", "", "", ""]);
        return;
    }
    list.forEach(function (av) {
        addRow(
            body,
            [DAY_NAMES[av.day_of_week], format12Hour(av.start_time), format12Hour(av.end_time), av.slot_minutes + " min"],
            [
                {
                    label: "Edit",
                    onClick: function () {
                        document.getElementById("am-day").value = String(av.day_of_week);
                        document.getElementById("am-start").value = hhmm(av.start_time);
                        document.getElementById("am-end").value = hhmm(av.end_time);
                        document.getElementById("am-slot").value = String(av.slot_minutes);
                        showError("am-error", "");
                        showInfo("am-info", "Editing " + DAY_NAMES[av.day_of_week] + " — adjust hours and click Save Day Hours.");
                    }
                },
                {
                    label: "Delete",
                    onClick: async function () {
                        const { error } = await db.from("doctor_availability").delete().eq("id", av.id);
                        if (error) return showError("am-error", error.message);
                        showInfo("am-info", DAY_NAMES[av.day_of_week] + " removed.");
                        await loadAll();
                        renderAvailModalTable();
                    }
                }
            ]
        );
    });
}

document.getElementById("am-close").addEventListener("click", closeAvailModal);

document.getElementById("am-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!managingAvailDoctor) return;
    showError("am-error", "");
    showInfo("am-info", "");

    const day = Number(document.getElementById("am-day").value);
    const startTime = document.getElementById("am-start").value;
    const endTime = document.getElementById("am-end").value;
    const slotMin = Number(document.getElementById("am-slot").value);

    if (!startTime || !endTime || timeToMinutes(endTime) <= timeToMinutes(startTime)) {
        return showError("am-error", "End time must be after start time.");
    }

    const { error } = await db
        .from("doctor_availability")
        .upsert(
            { doctor_id: managingAvailDoctor.id, day_of_week: day, start_time: startTime, end_time: endTime, slot_minutes: slotMin },
            { onConflict: "doctor_id,day_of_week" }
        );

    if (error) return showError("am-error", error.message);
    showInfo("am-info", "Saved " + DAY_NAMES[day] + " (" + format12Hour(startTime) + " - " + format12Hour(endTime) + ")!");
    await loadAll();
    renderAvailModalTable();
});

function renderDoctors() {
    const body = document.getElementById("d-body");
    body.innerHTML = "";
    doctors.forEach(function (d) {
        addRow(
            body,
            [d.id, d.name, d.age, d.specialty, doctorScheduleSummary(d.id)],
            [
                { label: "Availability", className: "success", onClick: function () { openAvailModal(d); } },
                { label: "Edit", onClick: function () { startEditDoctor(d); } },
                { label: "Delete", onClick: function () { deleteDoctor(d); } }
            ]
        );
    });
    if (managingAvailDoctor) renderAvailModalTable();
}

function startEditDoctor(d) {
    editingDoctor = d;
    document.getElementById("d-id").value = d.id;
    document.getElementById("d-name").value = d.name;
    document.getElementById("d-age").value = d.age;
    document.getElementById("d-spec").value = d.specialty;
    document.querySelector("#doctor-form button[type=submit]").textContent = "Save changes";
    document.getElementById("d-cancel").hidden = false;
    showError("d-error", "");
}

function stopEditDoctor() {
    editingDoctor = null;
    document.getElementById("doctor-form").reset();
    document.getElementById("d-id").value = "";
    document.querySelector("#doctor-form button[type=submit]").textContent = "Add doctor";
    document.getElementById("d-cancel").hidden = true;
}

async function deleteDoctor(d) {
    if (appointments.some(function (a) { return a.doctor_id === d.id; })) {
        alert("Cannot delete: this doctor has appointments. Delete them first.");
        return;
    }
    if (!confirm("Delete " + d.name + "?")) return;

    const { error } = await db.from("doctors").delete().eq("id", d.id);
    if (error) return showError("d-error", error.message);
    if (editingDoctor && editingDoctor.id === d.id) stopEditDoctor();
    await loadAll();
}

document.getElementById("d-cancel").addEventListener("click", stopEditDoctor);

document.getElementById("doctor-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    const name = document.getElementById("d-name").value.trim();
    const age = num("d-age");
    const spec = document.getElementById("d-spec").value.trim();

    if (name === "") return showError("d-error", "Name cannot be empty.");
    if (!Number.isInteger(age) || age < 0 || age > 120) return showError("d-error", "Age must be a whole number between 0 and 120.");
    if (spec === "") return showError("d-error", "Specialty cannot be empty.");

    let result;
    if (editingDoctor) {
        result = await db
            .from("doctors")
            .update({ name: name, age: age, specialty: spec })
            .eq("id", editingDoctor.id);
    } else {
        result = await db
            .from("doctors")
            .insert({ name: name, age: age, specialty: spec });
    }

    if (result.error) return showError("d-error", result.error.message);
    showError("d-error", "");
    stopEditDoctor();
    await loadAll();
});

/* ---------------- ADMIN: APPOINTMENTS ---------------- */

function fillSelects() {
    const ps = document.getElementById("a-patient");
    const ds = document.getElementById("a-doctor");
    const prevP = ps.value;
    const prevD = ds.value;
    ps.innerHTML = "";
    ds.innerHTML = "";
    patients.forEach(function (p) { ps.add(new Option(p.name + " (" + p.id + ")", p.id)); });
    doctors.forEach(function (d) { ds.add(new Option("Dr. " + d.name + " (" + d.id + ")", d.id)); });
    if (prevP && findById(patients, prevP)) ps.value = prevP;
    if (prevD && findById(doctors, prevD)) ds.value = prevD;
}

document.getElementById("a-doctor").addEventListener("change", function () {
    refreshTimeSlots("a-doctor", "a-date", "a-time", "a-avail-hint", editingAppt ? hhmm(editingAppt.appt_time) : null);
});

document.getElementById("a-date").addEventListener("change", function () {
    refreshTimeSlots("a-doctor", "a-date", "a-time", "a-avail-hint", editingAppt ? hhmm(editingAppt.appt_time) : null);
});

let editingAppt = null;

function renderAppointments() {
    const body = document.getElementById("a-body");
    body.innerHTML = "";
    appointments.forEach(function (a) {
        const p = findById(patients, a.patient_id);
        const d = findById(doctors, a.doctor_id);
        const st = a.status || "Scheduled";
        const isDone = st === "Completed";
        addRow(
            body,
            [
                "#" + a.id,
                a.date,
                hhmm(a.appt_time),
                p ? p.name + " (" + p.id + ")" : a.patient_id,
                d ? "Dr. " + d.name : a.doctor_id,
                a.reason,
                { badge: isDone ? "completed" : "scheduled", text: st },
                a.report ? a.report : "—",
                a.notes ? a.notes : "—"
            ],
            [
                {
                    label: isDone ? "Report & Notes" : "Complete",
                    className: "success",
                    onClick: function () { openDoctorReport(a); }
                },
                { label: "Edit", onClick: function () { startEditAppt(a); } },
                { label: "Delete", onClick: function () { deleteAppt(a); } }
            ]
        );
    });
}

async function startEditAppt(a) {
    editingAppt = a;
    document.getElementById("a-patient").value = a.patient_id;
    document.getElementById("a-doctor").value = a.doctor_id;
    document.getElementById("a-date").value = a.date;
    document.getElementById("a-reason").value = a.reason;
    document.getElementById("a-status").value = a.status || "Scheduled";
    document.getElementById("a-report").value = a.report || "";
    document.getElementById("a-notes").value = a.notes || "";
    await refreshTimeSlots("a-doctor", "a-date", "a-time", "a-avail-hint", hhmm(a.appt_time));
    document.querySelector("#appt-form button[type=submit]").textContent = "Save changes";
    document.getElementById("a-cancel").hidden = false;
    showError("a-error", "");
}

function stopEditAppt() {
    editingAppt = null;
    document.getElementById("appt-form").reset();
    document.querySelector("#appt-form button[type=submit]").textContent = "Book appointment";
    document.getElementById("a-cancel").hidden = true;
}

async function deleteAppt(a) {
    if (!confirm("Delete appointment #" + a.id + "?")) return;

    const { error } = await db.from("appointments").delete().eq("id", a.id);
    if (error) return showError("a-error", error.message);
    if (editingAppt && editingAppt.id === a.id) stopEditAppt();
    await loadAll();
}

document.getElementById("a-cancel").addEventListener("click", stopEditAppt);

document.getElementById("appt-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    const patientId = document.getElementById("a-patient").value.trim();
    const doctorId = document.getElementById("a-doctor").value.trim();
    const date = document.getElementById("a-date").value;
    const apptTime = document.getElementById("a-time").value;
    const reason = document.getElementById("a-reason").value.trim();
    const status = document.getElementById("a-status").value;
    const report = document.getElementById("a-report").value.trim();
    const notes = document.getElementById("a-notes").value.trim();

    if (patientId === "" || doctorId === "") return showError("a-error", "Add at least one patient and one doctor first.");
    if (!validDate(date)) return showError("a-error", "Please choose a valid date.");
    if (!apptTime) return showError("a-error", "Please pick an available time slot (the doctor must set hours for this day).");
    if (reason === "") return showError("a-error", "Reason cannot be empty.");

    let result;
    if (editingAppt) {
        result = await db
            .from("appointments")
            .update({ patient_id: patientId, doctor_id: doctorId, date: date, appt_time: apptTime, reason: reason, status: status, report: report, notes: notes })
            .eq("id", editingAppt.id);
    } else {
        result = await db
            .from("appointments")
            .insert({ patient_id: patientId, doctor_id: doctorId, date: date, appt_time: apptTime, reason: reason, status: status, report: report, notes: notes });
    }

    if (result.error) return showError("a-error", result.error.message);
    showError("a-error", "");
    stopEditAppt();
    await loadAll();
});

/* ---------------- STARTUP ---------------- */

db.auth.onAuthStateChange(function (_event, session) {
    handleSession(session);
});

db.auth.getSession().then(function (res) {
    handleSession(res.data.session);
});
