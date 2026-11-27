const SUPABASE_URL = "https://uzjobtodofcwdrybykuy.supabase.co";
const SUPABASE_KEY = "sb_publishable_rY5kXxNWYKRywqaS50HTSA_VPkrKek_";

// EmailJS settings (paste your 3 keys for Welcome Emails & Primary Admin Approval Emails):
const EMAILJS_PUBLIC_KEY = "xHopPrNzKCEaQxiI1";
const EMAILJS_SERVICE_ID = "service_6teeq3t";
const EMAILJS_TEMPLATE_ID = "template_tdpelvi";

// Keep users logged in across refreshes/reopens until they manually click Log out:
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        storage: window.localStorage,
        storageKey: "healthhub-auth",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const liveChannelId = "ch_" + Math.random().toString(36).slice(2) + "_" + Date.now();

let currentUser = null;
let currentProfile = null;
let activeViewRole = null;
let actingAsId = null;
let myPatient = null;
let myDoctor = null;

let patients = [];
let doctors = [];
let appointments = [];
let availability = [];
let locations = [];
let adminRequests = [];
let doctorFilter = "All";

let signupRole = "patient";
let setupRole = "patient";
let isSigningUp = false;
let selectedBookingLocationId = "";
let selectedBookingDate = "";
let selectedBookingTime = "";
let userCoords = null;

let realtimeChannel = null;
let syncInterval = null;
let syncTimer = null;
let isLoadingData = false;
let pendingReload = false;
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

function setHidden(id, isHidden) {
    const el = document.getElementById(id);
    if (el) el.hidden = isHidden;
}

function num(id) {
    const el = document.getElementById(id);
    if (!el) return NaN;
    const v = el.value.trim();
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
    return list.find(function (x) { return String(x.id) === String(id); });
}

function findLocation(locId) {
    if (locId === null || locId === undefined || locId === "") return null;
    return locations.find(function (l) { return String(l.id) === String(locId); }) || null;
}

function locationName(locId) {
    const loc = findLocation(locId);
    return loc ? loc.name : "—";
}

function googleMapsUrl(loc) {
    if (!loc) return "";
    if (loc.latitude !== null && loc.latitude !== undefined && loc.longitude !== null && loc.longitude !== undefined && loc.latitude !== "" && loc.longitude !== "") {
        return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(loc.latitude + "," + loc.longitude);
    }
    const q = (loc.address || loc.name || "").trim();
    if (!q) return "";
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
}

function openLocationInGoogleMaps(loc) {
    const url = googleMapsUrl(loc);
    if (!url) {
        alert("No coordinates or address saved for this location yet.");
        return;
    }
    window.open(url, "_blank", "noopener");
}

function distanceKm(lat1, lon1, lat2, lon2) {
    const toRad = function (deg) { return deg * Math.PI / 180; };
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isAdminTestRecord(rec, expectedId) {
    return !!(rec && rec.id === expectedId && String(rec.name || "").toLowerCase().includes("test"));
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

/* ---------------- FLOATING THREE-DOTS (...) ROW MENU ---------------- */

const rowMenuEl = document.getElementById("row-menu");

function closeRowMenu() {
    if (rowMenuEl) {
        rowMenuEl.hidden = true;
        rowMenuEl.innerHTML = "";
    }
}

function openRowMenu(anchorBtn, actions) {
    if (!rowMenuEl) return;
    rowMenuEl.innerHTML = "";
    actions.forEach(function (a) {
        const item = document.createElement("button");
        item.type = "button";
        item.textContent = a.label;
        if (a.className) item.className = a.className;
        else if (a.label === "Delete") item.className = "danger";
        item.addEventListener("click", function (ev) {
            ev.stopPropagation();
            closeRowMenu();
            a.onClick();
        });
        rowMenuEl.appendChild(item);
    });

    rowMenuEl.hidden = false;
    const rect = anchorBtn.getBoundingClientRect();
    const menuW = rowMenuEl.offsetWidth || 190;
    const menuH = rowMenuEl.offsetHeight || 140;

    let left = rect.right - menuW;
    if (left < 10) left = 10;
    if (left + menuW > window.innerWidth - 10) left = window.innerWidth - menuW - 10;

    let top = rect.bottom + 6;
    if (top + menuH > window.innerHeight - 10) {
        top = Math.max(10, rect.top - menuH - 6);
    }

    rowMenuEl.style.left = left + "px";
    rowMenuEl.style.top = top + "px";
}

document.addEventListener("click", function () { closeRowMenu(); });
window.addEventListener("scroll", function () { closeRowMenu(); }, true);
document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeRowMenu(); });

function addRow(tbody, cells, actions) {
    const tr = document.createElement("tr");
    cells.forEach(function (cell) {
        const td = document.createElement("td");
        if (cell && typeof cell === "object" && cell.badge) {
            const span = document.createElement("span");
            span.className = "badge " + cell.badge;
            span.textContent = cell.text;
            td.appendChild(span);
        } else if (cell && typeof cell === "object" && cell.mapLoc) {
            const url = googleMapsUrl(cell.mapLoc);
            if (url) {
                const link = document.createElement("a");
                link.href = url;
                link.target = "_blank";
                link.rel = "noopener";
                link.className = "map-link";
                link.textContent = cell.text || "Open Maps ↗";
                td.appendChild(link);
            } else {
                td.textContent = "—";
            }
        } else {
            td.textContent = cell;
        }
        tr.appendChild(td);
    });

    if (actions !== undefined) {
        const td = document.createElement("td");
        if (actions && actions.length > 0) {
            const dots = document.createElement("button");
            dots.type = "button";
            dots.className = "dots-btn";
            dots.setAttribute("aria-label", "Row actions");
            dots.innerHTML = "&#8943;";
            dots.addEventListener("click", function (ev) {
                ev.stopPropagation();
                openRowMenu(dots, actions);
            });
            td.appendChild(dots);
        }
        tr.appendChild(td);
    }
    tbody.appendChild(tr);
}

function wirePasswordToggle(btnId, inputId) {
    const btn = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    if (!btn || !input) return;
    btn.addEventListener("click", function () {
        const isHidden = input.type === "password";
        input.type = isHidden ? "text" : "password";
        this.textContent = isHidden ? "Hide" : "Show";
    });
}

wirePasswordToggle("toggle-login-pass", "login-password");
wirePasswordToggle("toggle-su-pass", "su-password");

/* ---------------- MOBILE SIDEBAR TOGGLE ---------------- */

function closeMobileSidebar() {
    const sb = document.getElementById("app-sidebar");
    if (sb) sb.classList.remove("open");
    setHidden("sidebar-overlay", true);
}

const sbToggle = document.getElementById("sidebar-toggle");
if (sbToggle) {
    sbToggle.addEventListener("click", function () {
        const sb = document.getElementById("app-sidebar");
        if (!sb) return;
        const willOpen = !sb.classList.contains("open");
        sb.classList.toggle("open", willOpen);
        setHidden("sidebar-overlay", !willOpen);
    });
}

const sbOverlay = document.getElementById("sidebar-overlay");
if (sbOverlay) sbOverlay.addEventListener("click", closeMobileSidebar);

/* ---------------- EMAIL NOTIFICATIONS (EmailJS) ---------------- */

async function sendWelcomeEmail(toEmail, payload, regData) {
    if (!EMAILJS_PUBLIC_KEY || !EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID) return;
    if (!window.emailjs) return;

    if (payload.p_role === "admin" && regData && regData.approval_status === "pending") {
        await sendAdminRequestEmail(regData.primary_admin_email, payload.p_name, toEmail);
        return;
    }

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

async function sendAdminRequestEmail(primaryEmail, applicantName, applicantEmail) {
    if (!EMAILJS_PUBLIC_KEY || !EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID) return;
    if (!window.emailjs || !primaryEmail) return;

    const detailsText =
        "New Admin Approval Request\n" +
        "Applicant Name: " + applicantName + "\n" +
        "Applicant Email: " + applicantEmail + "\n" +
        "Status: Pending Primary Admin Approval\n\n" +
        "Open Health Hub -> Admin Approvals to Approve or Deny:\n" +
        window.location.origin + window.location.pathname;

    try {
        window.emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
        await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
            to_email: primaryEmail,
            user_name: "Primary Admin",
            user_role: "New Admin Approval Request",
            user_id: "PENDING",
            user_details: detailsText
        });
    } catch (err) {
        console.warn("Admin request email skipped:", err);
    }
}

async function sendAdminDecisionEmail(toEmail, adminName, decision) {
    if (!EMAILJS_PUBLIC_KEY || !EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID) return;
    if (!window.emailjs || !toEmail) return;

    const approved = decision === "approved";
    try {
        window.emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
        await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
            to_email: toEmail,
            user_name: adminName || "Admin",
            user_role: approved ? "Admin Request Approved" : "Admin Request Denied",
            user_id: approved ? "APPROVED" : "DENIED",
            user_details: approved
                ? "Your Health Hub Admin account has been APPROVED by the Primary Admin! You can now log in:\n" + window.location.origin + window.location.pathname
                : "Your Health Hub Admin access request was DENIED by the Primary Admin."
        });
    } catch (err) {
        console.warn("Admin decision email skipped:", err);
    }
}

/* ---------------- AUTH TABS & ROLE PICKERS ---------------- */

document.getElementById("tab-login").addEventListener("click", function () {
    this.classList.add("active");
    document.getElementById("tab-signup").classList.remove("active");
    setHidden("login-form", false);
    setHidden("signup-form", true);
    showError("auth-error", "");
    showInfo("auth-info", "");
});

document.getElementById("tab-signup").addEventListener("click", function () {
    this.classList.add("active");
    document.getElementById("tab-login").classList.remove("active");
    setHidden("login-form", true);
    setHidden("signup-form", false);
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
            setHidden(prefix + "-patient-fields", role !== "patient");
            setHidden(prefix + "-doctor-fields", role !== "doctor");
            setHidden(prefix + "-admin-fields", role !== "admin");
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
        return { p_role: "patient", p_name: name, p_age: age, p_weight: weight, p_height: height, p_specialty: null, p_staff_code: "" };
    }

    if (role === "doctor") {
        const age = num(prefix + "-d-age");
        const spec = document.getElementById(prefix + "-d-spec").value.trim();
        const code = document.getElementById(prefix + "-d-code").value.trim();
        if (!Number.isInteger(age) || age < 0 || age > 120) return { error: "Age must be a whole number between 0 and 120." };
        if (!spec) return { error: "Specialty cannot be empty." };
        if (!code) return { error: "Doctor Access Code is required." };
        return { p_role: "doctor", p_name: name, p_age: age, p_weight: null, p_height: null, p_specialty: spec, p_staff_code: code };
    }

    const aCode = document.getElementById(prefix + "-a-code").value.trim();
    if (!aCode) return { error: "Admin Access Code is required." };
    return { p_role: "admin", p_name: name, p_age: null, p_weight: null, p_height: null, p_specialty: null, p_staff_code: aCode };
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

/* ---------------- PROFILE MODAL & ADMIN SWITCHER ---------------- */

let pendingSwitchRole = "admin";

function populateImpersonateSelect(role) {
    const sel = document.getElementById("pm-impersonate-select");
    const applyBtn = document.getElementById("pm-apply-view");
    if (!sel || !applyBtn) return;

    sel.innerHTML = "";
    if (role === "admin") {
        sel.hidden = true;
        applyBtn.hidden = activeViewRole === "admin";
        applyBtn.textContent = "Back to Admin";
        return;
    }

    if (role === "patient") {
        if (patients.length === 0) {
            sel.add(new Option("No patients available", ""));
            applyBtn.hidden = true;
        } else {
            patients.forEach(function (p) { sel.add(new Option(p.name + " (" + p.id + ")", p.id)); });
            if (activeViewRole === "patient" && actingAsId && findById(patients, actingAsId)) sel.value = actingAsId;
            applyBtn.hidden = false;
            applyBtn.textContent = "Act as Patient";
        }
        sel.hidden = false;
    } else if (role === "doctor") {
        if (doctors.length === 0) {
            sel.add(new Option("No doctors available", ""));
            applyBtn.hidden = true;
        } else {
            doctors.forEach(function (d) { sel.add(new Option("Dr. " + d.name + " (" + d.id + ")", d.id)); });
            if (activeViewRole === "doctor" && actingAsId && findById(doctors, actingAsId)) sel.value = actingAsId;
            applyBtn.hidden = false;
            applyBtn.textContent = "Act as Doctor";
        }
        sel.hidden = false;
    }
}

function setProfileTab(mode) {
    const isEdit = mode === "edit";
    const tabView = document.getElementById("pm-tab-view");
    const tabEdit = document.getElementById("pm-tab-edit");
    if (tabView) tabView.classList.toggle("active", !isEdit);
    if (tabEdit) tabEdit.classList.toggle("active", isEdit);
    setHidden("pm-view", isEdit);
    setHidden("pm-edit-form", !isEdit);
    showError("pm-error", "");
    showInfo("pm-info", "");

    if (isEdit) {
        populateProfileEditForm();
    }
}

function updateLiveBmiPreview() {
    const preview = document.getElementById("pm-bmi-preview");
    if (!preview) return;
    const w = num("pm-p-weight");
    const h = num("pm-p-height");
    if (w >= 2 && w <= 400 && h >= 0.4 && h <= 2.5) {
        const b = w / (h * h);
        const cat = category(b);
        preview.innerHTML = "Live BMI Preview: <strong>" + b.toFixed(1) + " (" + cat + ")</strong>";
    } else {
        preview.innerHTML = "Live BMI Preview: <strong>Enter valid weight &amp; height</strong>";
    }
}

function populateProfileEditForm() {
    if (!currentProfile || !currentUser) return;
    const roleLabel = currentProfile.role === "admin" && currentProfile.is_primary_admin
        ? "Primary Admin"
        : currentProfile.role.charAt(0).toUpperCase() + currentProfile.role.slice(1);

    document.getElementById("pm-name").value = currentProfile.full_name || "";
    const emailRead = document.getElementById("pm-email-readonly");
    const roleRead = document.getElementById("pm-role-readonly");
    if (emailRead) emailRead.value = currentUser.email || "";
    if (roleRead) roleRead.value = roleLabel;

    const isP = currentProfile.role === "patient";
    const isD = currentProfile.role === "doctor";
    setHidden("pm-patient-fields", !isP);
    setHidden("pm-doctor-fields", !isD);

    if (isP && myPatient) {
        document.getElementById("pm-p-age").value = myPatient.age;
        document.getElementById("pm-p-weight").value = myPatient.weight;
        document.getElementById("pm-p-height").value = myPatient.height;
        updateLiveBmiPreview();
    } else if (isD && myDoctor) {
        document.getElementById("pm-d-age").value = myDoctor.age;
        document.getElementById("pm-d-spec").value = myDoctor.specialty;
    }
}

function openProfileModal(initialTab) {
    if (!currentProfile || !currentUser) return;
    closeMobileSidebar();
    showError("pm-error", "");
    showInfo("pm-info", "");

    const name = currentProfile.full_name || currentUser.email || "User";
    const roleLabel = currentProfile.role === "admin" && currentProfile.is_primary_admin
        ? "Primary Admin"
        : currentProfile.role.charAt(0).toUpperCase() + currentProfile.role.slice(1);

    let idTag = "";
    if (currentProfile.role === "patient" && myPatient) idTag = " · " + myPatient.id;
    else if (currentProfile.role === "doctor" && myDoctor) idTag = " · " + myDoctor.id;

    document.getElementById("pm-big-avatar").textContent = name.charAt(0).toUpperCase();
    document.getElementById("pm-banner-name").textContent = name;
    document.getElementById("pm-banner-badge").textContent = roleLabel + idTag;
    document.getElementById("pm-banner-email").textContent = currentUser.email || "";

    const details = document.getElementById("pm-details");
    details.innerHTML = "";

    const rows = [
        ["Role", roleLabel],
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

    const switchBox = document.getElementById("pm-admin-switch");
    if (switchBox) {
        const isAdmin = currentProfile.role === "admin";
        switchBox.hidden = !isAdmin;
        if (isAdmin) {
            pendingSwitchRole = activeViewRole || "admin";
            document.querySelectorAll("#pm-role-btns button").forEach(function (b) {
                b.classList.toggle("active", b.dataset.view === pendingSwitchRole);
            });
            populateImpersonateSelect(pendingSwitchRole);
        }
    }

    setProfileTab(initialTab === "edit" ? "edit" : "view");
    setHidden("profile-modal", false);
}

function closeProfileModal() {
    setHidden("profile-modal", true);
}

document.getElementById("profile-btn").addEventListener("click", function () { openProfileModal("view"); });
document.getElementById("pm-close").addEventListener("click", closeProfileModal);
document.getElementById("pm-tab-view").addEventListener("click", function () { setProfileTab("view"); });
document.getElementById("pm-tab-edit").addEventListener("click", function () { setProfileTab("edit"); });
document.getElementById("pm-edit-btn").addEventListener("click", function () { setProfileTab("edit"); });
document.getElementById("pm-cancel-edit").addEventListener("click", function () { setProfileTab("view"); });
document.getElementById("pm-p-weight").addEventListener("input", updateLiveBmiPreview);
document.getElementById("pm-p-height").addEventListener("input", updateLiveBmiPreview);

document.querySelectorAll("#pm-role-btns button").forEach(function (btn) {
    btn.addEventListener("click", function () {
        document.querySelectorAll("#pm-role-btns button").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        pendingSwitchRole = btn.dataset.view;
        populateImpersonateSelect(pendingSwitchRole);
    });
});

document.getElementById("pm-apply-view").addEventListener("click", async function () {
    if (!currentProfile || currentProfile.role !== "admin") return;
    const sel = document.getElementById("pm-impersonate-select");
    if (pendingSwitchRole === "admin") {
        activeViewRole = "admin";
        actingAsId = null;
    } else {
        const chosenId = sel ? sel.value : "";
        if (!chosenId) return showError("pm-error", "Please select a record first.");
        activeViewRole = pendingSwitchRole;
        actingAsId = chosenId;
    }
    closeProfileModal();
    lastDataHash = "";
    lastSlotsKey = "";
    selectedBookingDate = "";
    selectedBookingTime = "";
    applyPortalView();
    await loadAll(false);
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
    openProfileModal("view");
    showInfo("pm-info", "Profile saved successfully!");
});

document.getElementById("pm-logout-btn").addEventListener("click", async function () {
    closeProfileModal();
    await db.auth.signOut();
});

document.getElementById("pm-edit-logout-btn").addEventListener("click", async function () {
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

/* ---------------- SIDEBAR NAVIGATION, SESSION & LIVE SYNC ---------------- */

function buildNav(tabs) {
    const nav = document.getElementById("app-nav");
    nav.innerHTML = "";
    tabs.forEach(function (t, idx) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = (t.icon ? t.icon + "  " : "") + t.label;
        btn.dataset.section = t.sectionId;
        btn.dataset.bg = t.bg;
        btn.dataset.baseLabel = (t.icon ? t.icon + "  " : "") + t.label;
        if (idx === 0) btn.classList.add("active");
        btn.addEventListener("click", function () {
            showSection(t.sectionId, t.bg);
            nav.querySelectorAll("button").forEach(function (b) { b.classList.remove("active"); });
            btn.classList.add("active");
            closeMobileSidebar();
        });
        nav.appendChild(btn);
    });
    if (tabs.length > 0) {
        showSection(tabs[0].sectionId, tabs[0].bg);
    }
}

function showSection(sectionId, bgKey) {
    closeRowMenu();
    document.querySelectorAll("#app-main section").forEach(function (s) { s.hidden = true; });
    const target = document.getElementById(sectionId);
    if (target) target.hidden = false;
    document.body.dataset.bg = bgKey || "auth";
}

function applyPortalView() {
    if (!currentProfile) return;
    const viewRole = activeViewRole || currentProfile.role;
    const baseRoleLabel = currentProfile.role === "admin" && currentProfile.is_primary_admin
        ? "Primary Admin"
        : currentProfile.role;

    const badgeText = (currentProfile.role === "admin" && viewRole !== "admin" && actingAsId)
        ? baseRoleLabel + " -> " + viewRole + " (" + actingAsId + ")"
        : baseRoleLabel;

    const badge = document.getElementById("role-badge");
    badge.textContent = badgeText;
    badge.hidden = false;
    const mobileBadge = document.getElementById("mobile-role-badge");
    if (mobileBadge) mobileBadge.textContent = badgeText;

    if (viewRole === "patient") {
        buildNav([
            { icon: "❤️", label: "My Health", sectionId: "patient-profile-sec", bg: "patients" },
            { icon: "📅", label: "Appointments", sectionId: "patient-appts-sec", bg: "appointments" }
        ]);
    } else if (viewRole === "doctor") {
        buildNav([
            { icon: "📅", label: "My Appointments", sectionId: "doctor-appts-sec", bg: "appointments" },
            { icon: "🧑‍🤝‍🧑", label: "My Patients", sectionId: "doctor-patients-sec", bg: "doctors" },
            { icon: "🕒", label: "My Availability", sectionId: "doctor-avail-sec", bg: "doctors" }
        ]);
    } else {
        const adminTabs = [
            { icon: "🧑‍🤝‍🧑", label: "Patients", sectionId: "patients", bg: "patients" },
            { icon: "🩺", label: "Doctors", sectionId: "doctors", bg: "doctors" },
            { icon: "📅", label: "Appointments", sectionId: "appointments", bg: "appointments" },
            { icon: "📍", label: "Locations", sectionId: "locations", bg: "locations" }
        ];
        if (currentProfile.is_primary_admin && document.getElementById("admin-approvals")) {
            adminTabs.push({ icon: "🛡️", label: "Admin Approvals", sectionId: "admin-approvals", bg: "doctors" });
        }
        buildNav(adminTabs);
    }
}

async function handleSession(session) {
    if (isSigningUp) return;

    const user = session ? session.user : null;
    const userChanged = (user ? user.id : null) !== (currentUser ? currentUser.id : null);
    currentUser = user;

    if (!currentUser) {
        stopLiveSync();
        closeRowMenu();
        closeMobileSidebar();
        currentProfile = null;
        activeViewRole = null;
        actingAsId = null;
        myPatient = null;
        myDoctor = null;
        patients = [];
        doctors = [];
        appointments = [];
        availability = [];
        locations = [];
        adminRequests = [];
        closePatientModal();
        closeDoctorModal();
        closeApptModal();
        closeLocationModal();
        closeHealthReport();
        closeDoctorReport();
        closeProfileModal();
        closeAvailModal();
        setHidden("auth-header", false);
        setHidden("auth-section", false);
        setHidden("setup-section", true);
        setHidden("pending-section", true);
        setHidden("app-shell", true);
        setHidden("app-nav", true);
        setHidden("app-main", true);
        setHidden("profile-btn", true);
        setHidden("role-badge", true);
        document.body.dataset.bg = "auth";
        return;
    }

    setHidden("auth-section", true);

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
        setHidden("auth-header", false);
        setHidden("setup-section", false);
        setHidden("pending-section", true);
        setHidden("app-shell", true);
        document.body.dataset.bg = "auth";
        return;
    }

    currentProfile = profile;

    if (profile.role === "admin" && profile.approval_status && profile.approval_status !== "approved") {
        stopLiveSync();
        setHidden("auth-header", false);
        setHidden("auth-section", true);
        setHidden("setup-section", true);
        setHidden("app-shell", true);
        setHidden("pending-section", false);
        document.body.dataset.bg = "auth";

        const isRejected = profile.approval_status === "rejected";
        document.getElementById("pending-title").textContent = isRejected
            ? "Admin Access Denied"
            : "Waiting for Primary Admin Approval";
        document.getElementById("pending-msg").textContent = isRejected
            ? "Your Admin access request was denied by the Primary Admin."
            : "Your Admin request has been sent to the Primary Admin. Once they approve it, click Check Approval Status to enter.";
        showInfo("pending-info", "");
        return;
    }

    activeViewRole = profile.role;
    actingAsId = null;
    setHidden("auth-header", true);
    setHidden("auth-section", true);
    setHidden("setup-section", true);
    setHidden("pending-section", true);
    setHidden("app-shell", false);
    setHidden("app-nav", false);
    setHidden("app-main", false);

    updateProfileButton();
    applyPortalView();

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
        .channel("healthhub-live-" + liveChannelId)
        .on("postgres_changes", { event: "*", schema: "public", table: "patients" }, scheduleLiveRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "doctors" }, scheduleLiveRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, scheduleLiveRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "doctor_availability" }, scheduleLiveRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "clinic_locations" }, scheduleLiveRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, scheduleLiveRefresh)
        .subscribe();

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
        const [pRes, dRes, aRes, avRes, locRes] = await Promise.all([
            db.from("patients").select("*").order("created_at", { ascending: true }),
            db.from("doctors").select("*").order("created_at", { ascending: true }),
            db.from("appointments").select("*").order("date", { ascending: true }).order("appt_time", { ascending: true }),
            db.from("doctor_availability").select("*").order("day_of_week", { ascending: true }),
            db.from("clinic_locations").select("*").order("created_at", { ascending: true })
        ]);

        const newP = pRes.data || [];
        const newD = dRes.data || [];
        const newA = aRes.data || [];
        const newAv = avRes.data || [];
        const newLocs = locRes.data || [];
        const viewRole = activeViewRole || currentProfile.role;

        if (currentProfile.is_primary_admin && viewRole === "admin") {
            await loadAdminRequests();
        }

        const newHash = JSON.stringify([newP, newD, newA, newAv, newLocs, viewRole, actingAsId]);
        if (isSilent && newHash === lastDataHash) {
            if (viewRole === "patient" && selectedBookingDate) {
                const docId = document.getElementById("pb-doctor").value;
                const dow = dayOfWeekFromDate(selectedBookingDate);
                const dayAvail = availability.find(function (av) {
                    const locMatch = !selectedBookingLocationId || String(av.location_id || "") === String(selectedBookingLocationId);
                    return av.doctor_id === docId && av.day_of_week === dow && locMatch;
                });
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
        locations = newLocs;

        if (viewRole === "patient") {
            if (currentProfile.role === "admin" && actingAsId) {
                myPatient = findById(patients, actingAsId) || null;
            } else {
                myPatient = patients.find(function (p) { return p.auth_user_id === currentUser.id; }) || patients[0] || null;
            }
            renderPatientPortal(!!isSilent);
        } else if (viewRole === "doctor") {
            if (currentProfile.role === "admin" && actingAsId) {
                myDoctor = findById(doctors, actingAsId) || null;
            } else {
                myDoctor = doctors.find(function (d) { return d.auth_user_id === currentUser.id; }) || null;
            }
            fillLocationSelect("av-location", true);
            renderDoctorPortal();
            renderDoctorAvailability();
        } else {
            if (pRes.error) showError("p-error", pRes.error.message);
            if (dRes.error) showError("d-error", dRes.error.message);
            if (aRes.error) showError("a-error", aRes.error.message);
            if (locRes.error) showError("loc-error", locRes.error.message);
            renderPatients();
            renderDoctors();
            renderAppointments();
            renderLocations();
            if (managingAvailDoctor) {
                fillLocationSelect("am-location", true);
                renderAvailModalTable();
            }
        }
    } finally {
        isLoadingData = false;
        if (pendingReload) {
            pendingReload = false;
            loadAll(false);
        }
    }
}

/* ---------------- LOCATION HELPERS & TIME SLOTS ---------------- */

function fillLocationSelect(selectId, includeEmptyIfNone) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = "";
    if (locations.length === 0) {
        if (includeEmptyIfNone) sel.add(new Option("No locations added yet (Admin can add)", ""));
        return;
    }
    if (selectId === "a-location") {
        sel.add(new Option("Any / Match doctor's schedule", ""));
    }
    locations.forEach(function (loc) {
        sel.add(new Option(loc.name + (loc.address ? " — " + loc.address : ""), String(loc.id)));
    });
    if (prev && locations.some(function (l) { return String(l.id) === String(prev); })) {
        sel.value = prev;
    }
}

function doctorScheduleSummary(doctorId) {
    const slots = availability.filter(function (av) { return av.doctor_id === doctorId; });
    if (slots.length === 0) return "No available hours set yet.";
    return slots.map(function (av) {
        const loc = findLocation(av.location_id);
        const locPart = loc ? " @ " + loc.name : "";
        return DAY_NAMES[av.day_of_week].slice(0, 3) + " " + format12Hour(av.start_time) + "-" + format12Hour(av.end_time) + locPart;
    }).join(" · ");
}

async function refreshTimeSlots(docSelectId, dateInputId, timeSelectId, hintId, keepTime, locSelectId) {
    const docId = document.getElementById(docSelectId).value;
    const dateVal = document.getElementById(dateInputId).value;
    const timeSelect = document.getElementById(timeSelectId);
    const hint = document.getElementById(hintId);
    const chosenLocId = locSelectId && document.getElementById(locSelectId) ? document.getElementById(locSelectId).value : "";

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
        const locOk = !chosenLocId || String(av.location_id || "") === String(chosenLocId);
        return av.doctor_id === docId && av.day_of_week === dow && locOk;
    });

    if (!dayAvail) {
        timeSelect.add(new Option("Doctor unavailable on " + DAY_NAMES[dow] + (chosenLocId ? " at this location" : ""), ""));
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
            timeSelect.add(new Option(format12Hour(label), label));
            added++;
        }
    }

    if (added === 0) {
        timeSelect.add(new Option("All slots booked for this day", ""));
    } else if (keepTime) {
        timeSelect.value = keepTime;
    }
}
/* ---------------- PATIENT PORTAL (NEAREST LOCATION + GOOGLE MAPS) ---------------- */

function renderPatientLocationPicker(keepSelection) {
    const locBox = document.getElementById("pb-locations");
    const infoBanner = document.getElementById("pb-location-info");
    const infoText = document.getElementById("pb-location-text");
    if (!locBox) return;

    locBox.innerHTML = "";
    if (locations.length === 0) {
        selectedBookingLocationId = "";
        locBox.innerHTML = "<span class='muted'>No clinic branches added yet — showing all available doctors.</span>";
        if (infoBanner) infoBanner.hidden = true;
        return;
    }

    if (!locations.some(function (l) { return String(l.id) === String(selectedBookingLocationId); })) {
        selectedBookingLocationId = String(locations[0].id);
    }

    // Sort display order by distance if user clicked "Show Distance From Me"
    const ordered = locations.slice();
    if (userCoords) {
        ordered.sort(function (a, b) {
            const da = (a.latitude != null && a.longitude != null) ? distanceKm(userCoords.lat, userCoords.lng, a.latitude, a.longitude) : 999999;
            const db2 = (b.latitude != null && b.longitude != null) ? distanceKm(userCoords.lat, userCoords.lng, b.latitude, b.longitude) : 999999;
            return da - db2;
        });
    }

    ordered.forEach(function (loc) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "slot-btn" + (String(loc.id) === String(selectedBookingLocationId) ? " active" : "");

        const title = document.createTextNode(loc.name);
        btn.appendChild(title);

        let subParts = [];
        if (userCoords && loc.latitude != null && loc.longitude != null) {
            const km = distanceKm(userCoords.lat, userCoords.lng, loc.latitude, loc.longitude);
            subParts.push(km.toFixed(1) + " km away");
        }
        if (loc.address) {
            subParts.push(loc.address.length > 42 ? loc.address.slice(0, 42) + "..." : loc.address);
        }
        if (subParts.length > 0) {
            const sub = document.createElement("small");
            sub.textContent = subParts.join(" · ");
            btn.appendChild(sub);
        }

        btn.addEventListener("click", function () {
            selectedBookingLocationId = String(loc.id);
            selectedBookingDate = "";
            selectedBookingTime = "";
            renderPatientLocationPicker(false);
            renderPatientDoctorOptions(false);
        });
        locBox.appendChild(btn);
    });

    const selectedLoc = findLocation(selectedBookingLocationId);
    if (selectedLoc && infoBanner && infoText) {
        infoText.innerHTML = "";
        const strong = document.createElement("strong");
        strong.textContent = "Selected: " + selectedLoc.name;
        infoText.appendChild(strong);
        if (selectedLoc.address) {
            const span = document.createElement("span");
            span.className = "muted";
            span.textContent = " — " + selectedLoc.address;
            infoText.appendChild(span);
        }
        infoBanner.hidden = false;
    } else if (infoBanner) {
        infoBanner.hidden = true;
    }
}

function renderPatientDoctorOptions(keepSelection) {
    const isAdminUser = currentProfile && currentProfile.role === "admin";
    const visibleDoctors = isAdminUser
        ? doctors
        : doctors.filter(function (d) { return !isAdminTestRecord(d, "D1"); });

    // Filter doctors who have availability at the selected location (if a location is chosen)
    let matchingDoctors = visibleDoctors;
    if (selectedBookingLocationId) {
        matchingDoctors = visibleDoctors.filter(function (d) {
            return availability.some(function (av) {
                return av.doctor_id === d.id && String(av.location_id || "") === String(selectedBookingLocationId);
            });
        });
    }

    const docSel = document.getElementById("pb-doctor");
    const prevDoc = docSel.value;
    docSel.innerHTML = "";
    if (matchingDoctors.length === 0) {
        docSel.add(new Option(selectedBookingLocationId ? "No doctors scheduled at this location yet" : "No doctors available yet", ""));
    } else {
        matchingDoctors.forEach(function (d) {
            docSel.add(new Option("Dr. " + d.name + " (" + d.specialty + ")", d.id));
        });
        if (prevDoc && findById(matchingDoctors, prevDoc)) docSel.value = prevDoc;
    }
    renderPatientBookingDates(!!keepSelection);
}

function goToPatientTab(sectionId, bgKey) {
    showSection(sectionId, bgKey);
    const nav = document.getElementById("app-nav");
    if (nav) {
        nav.querySelectorAll("button").forEach(function (b) {
            b.classList.toggle("active", b.dataset.section === sectionId);
        });
    }
}

document.getElementById("pp-go-book").addEventListener("click", function () {
    goToPatientTab("patient-appts-sec", "appointments");
});
document.getElementById("pp-view-all-appts").addEventListener("click", function () {
    goToPatientTab("patient-appts-sec", "appointments");
});
document.getElementById("pp-find-clinic").addEventListener("click", function () {
    goToPatientTab("patient-appts-sec", "appointments");
});
document.getElementById("pp-go-edit").addEventListener("click", function () {
    openProfileModal("edit");
});

function renderPatientHomeDashboard(myAppts) {
    const displayName = myPatient ? myPatient.name : (currentProfile ? currentProfile.full_name : "Patient");
    const idLabel = myPatient ? " (" + myPatient.id + ")" : "";
    const completedList = myAppts.filter(function (a) { return a.status === "Completed"; });
    const upcomingList = myAppts.filter(function (a) { return (a.status || "Scheduled") !== "Completed"; });

    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : (hour < 18 ? "Good afternoon" : "Good evening");
    document.getElementById("pp-greeting-pill").textContent = greeting + (myPatient ? " · ID " + myPatient.id : "");
    document.getElementById("pp-heading").textContent = "Welcome, " + displayName + idLabel;

    const grid = document.getElementById("pp-stats");
    grid.innerHTML = "";

    let cat = "Normal";
    if (myPatient) {
        const b = bmi(myPatient);
        cat = category(b);
        document.getElementById("pp-advice").textContent = healthAdvice(cat);

        [
            ["Patient ID", myPatient.id],
            ["Age", myPatient.age + " yrs"],
            ["Weight", myPatient.weight + " Kg"],
            ["Height", myPatient.height + " m"],
            ["BMI", b.toFixed(1) + " (" + cat + ")"],
            ["Appointments", upcomingList.length + " upcoming · " + completedList.length + " completed"]
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

        // Visual BMI Meter & Healthy Target Range
        setHidden("pp-bmi-card", false);
        const badge = document.getElementById("pp-bmi-badge");
        badge.textContent = b.toFixed(1) + " · " + cat;
        badge.className = "badge " + (cat === "Normal" ? "completed" : (cat === "Obese" ? "danger" : "scheduled"));

        // Map BMI 14..36 onto 4%..96% of the bar
        const pct = Math.max(4, Math.min(96, ((b - 14) / (36 - 14)) * 100));
        document.getElementById("pp-bmi-pin").style.left = pct.toFixed(1) + "%";

        const h = Number(myPatient.height);
        const minW = (18.5 * h * h).toFixed(1);
        const maxW = (24.9 * h * h).toFixed(1);
        document.getElementById("pp-bmi-target").textContent =
            "Healthy weight range for your height (" + h + " m): " + minW + " Kg – " + maxW + " Kg.";
    } else {
        document.getElementById("pp-advice").textContent = "Your patient record is ready to customize — book an appointment or update your profile anytime.";
        setHidden("pp-bmi-card", true);
    }

    // Next Upcoming Visit Card
    const nextBox = document.getElementById("pp-next-appt");
    nextBox.innerHTML = "";
    if (upcomingList.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.innerHTML = "<span>You have no upcoming appointments scheduled yet.</span>";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "accent-btn small-btn";
        btn.textContent = "📅 Book Your First Visit";
        btn.addEventListener("click", function () { goToPatientTab("patient-appts-sec", "appointments"); });
        empty.appendChild(btn);
        nextBox.appendChild(empty);
    } else {
        const next = upcomingList[0];
        const doc = findById(doctors, next.doctor_id);
        const loc = findLocation(next.location_id);
        const wrap = document.createElement("div");
        wrap.className = "spotlight-box";

        const line1 = document.createElement("strong");
        line1.textContent = "Dr. " + (doc ? doc.name : next.doctor_id) + (doc ? " (" + doc.specialty + ")" : "");
        const line2 = document.createElement("div");
        line2.className = "muted";
        line2.textContent = "📅 " + next.date + " at " + format12Hour(next.appt_time) + (next.reason ? " · " + next.reason : "");
        wrap.appendChild(line1);
        wrap.appendChild(line2);

        if (loc) {
            const meta = document.createElement("div");
            meta.className = "spotlight-meta";
            const locSpan = document.createElement("span");
            locSpan.textContent = "📍 " + loc.name;
            const mapBtn = document.createElement("button");
            mapBtn.type = "button";
            mapBtn.className = "cancel small-btn";
            mapBtn.textContent = "🗺️ Open in Google Maps";
            mapBtn.addEventListener("click", function () { openLocationInGoogleMaps(loc); });
            meta.appendChild(locSpan);
            meta.appendChild(mapBtn);
            wrap.appendChild(meta);
        }
        nextBox.appendChild(wrap);
    }

    // Latest Doctor Report Card
    const repBox = document.getElementById("pp-latest-report");
    repBox.innerHTML = "";
    const withReports = completedList.filter(function (a) { return a.report && a.report.trim() !== ""; });
    if (withReports.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = "No doctor reports yet. After a doctor completes your visit, their diagnosis & instructions will appear right here.";
        repBox.appendChild(empty);
    } else {
        const latest = withReports[withReports.length - 1];
        const doc = findById(doctors, latest.doctor_id);
        const wrap = document.createElement("div");
        wrap.className = "spotlight-box";

        const head = document.createElement("strong");
        head.textContent = "Dr. " + (doc ? doc.name : latest.doctor_id) + " · " + latest.date;
        const body = document.createElement("p");
        body.style.margin = "0";
        body.textContent = latest.report;
        wrap.appendChild(head);
        wrap.appendChild(body);
        repBox.appendChild(wrap);
    }

    // Clinic Branches Grid
    const clinicsBox = document.getElementById("pp-clinics-list");
    clinicsBox.innerHTML = "";
    if (locations.length === 0) {
        clinicsBox.innerHTML = "<span class='muted'>Clinic branches will appear here once added by the clinic admin.</span>";
    } else {
        locations.forEach(function (loc) {
            const card = document.createElement("div");
            card.className = "clinic-card";
            const nameEl = document.createElement("strong");
            nameEl.textContent = "📍 " + loc.name;
            card.appendChild(nameEl);
            if (loc.address) {
                const addrEl = document.createElement("small");
                addrEl.textContent = loc.address;
                card.appendChild(addrEl);
            }
            const url = googleMapsUrl(loc);
            if (url) {
                const link = document.createElement("a");
                link.href = url;
                link.target = "_blank";
                link.rel = "noopener";
                link.className = "map-link";
                link.textContent = "🗺️ Open in Google Maps ↗";
                card.appendChild(link);
            }
            clinicsBox.appendChild(card);
        });
    }

    // Personalized Daily Wellness Tips
    const tipsBox = document.getElementById("pp-tips-grid");
    tipsBox.innerHTML = "";
    const tips = [
        {
            title: "💧 Stay Hydrated",
            text: "Aim for 7–8 glasses of water daily to support energy, focus, and healthy metabolism."
        },
        {
            title: cat === "Normal" ? "🏃 Keep Your Momentum" : (cat === "Underweight" ? "🥗 Nutrient-Dense Meals" : "🚶 Daily 30-Min Movement"),
            text: cat === "Normal"
                ? "Great job keeping a healthy BMI! Aim for 150 minutes of moderate activity each week."
                : (cat === "Underweight"
                    ? "Include protein-rich snacks and healthy fats, and check in with a doctor for a tailored plan."
                    : "A brisk 30-minute walk daily plus balanced portions can steadily improve your BMI and heart health.")
        },
        {
            title: "🩺 Routine Checkups",
            text: "Keep your weight and health vitals up to date in Edit Profile before every clinic visit."
        }
    ];
    tips.forEach(function (t) {
        const card = document.createElement("div");
        card.className = "tip-card";
        const h = document.createElement("strong");
        h.textContent = t.title;
        const p = document.createElement("p");
        p.textContent = t.text;
        card.appendChild(h);
        card.appendChild(p);
        tipsBox.appendChild(card);
    });
}

function renderPatientPortal(keepSelection) {
    const myAppts = myPatient
        ? appointments.filter(function (a) { return a.patient_id === myPatient.id; })
        : [];

    renderPatientHomeDashboard(myAppts);
    renderPatientLocationPicker(!!keepSelection);
    renderPatientDoctorOptions(!!keepSelection);

    const body = document.getElementById("pp-appts-body");
    body.innerHTML = "";
    if (myAppts.length === 0) {
        addRow(body, ["—", "No appointments scheduled yet.", "", "", "", "", "", "", "", ""]);
    } else {
        myAppts.forEach(function (a) {
            const doc = findById(doctors, a.doctor_id);
            const loc = findLocation(a.location_id);
            const st = a.status || "Scheduled";
            const actions = [];
            if (loc) {
                actions.push({
                    label: "🗺️ Open in Google Maps",
                    className: "success",
                    onClick: function () { openLocationInGoogleMaps(loc); }
                });
            }
            addRow(
                body,
                [
                    "#" + a.id,
                    a.date,
                    format12Hour(a.appt_time),
                    loc ? { mapLoc: loc, text: "📍 " + loc.name } : "—",
                    doc ? "Dr. " + doc.name : "?",
                    doc ? doc.specialty : "—",
                    a.reason || "—",
                    { badge: st === "Completed" ? "completed" : "scheduled", text: st },
                    a.report ? a.report : "No report yet"
                ],
                actions
            );
        });
    }
}

function getUpcomingAvailableDates(doctorId, maxCount) {
    const docAvail = availability.filter(function (av) {
        const locOk = !selectedBookingLocationId || String(av.location_id || "") === String(selectedBookingLocationId);
        return av.doctor_id === doctorId && locOk;
    });
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
    if (!datesBox || !timesBox) return;

    datesBox.innerHTML = "";
    if (!keepSelection) {
        timesBox.innerHTML = "";
        selectedBookingTime = "";
    }

    if (!docId) {
        selectedBookingDate = "";
        selectedBookingTime = "";
        datesBox.innerHTML = "<span class='muted'>Pick a location with scheduled doctors above.</span>";
        timesBox.innerHTML = "<span class='muted'>No time slots available.</span>";
        return;
    }

    const upcoming = getUpcomingAvailableDates(docId, 8);
    if (upcoming.length === 0) {
        selectedBookingDate = "";
        selectedBookingTime = "";
        datesBox.innerHTML = "<span class='muted'>This doctor has not set available hours at this location yet.</span>";
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

async function renderPatientBookingTimes(docId, dateIso, dayAvail, keepSelection) {
    const timesBox = document.getElementById("pb-times");
    if (!timesBox) return;
    const prevSelected = keepSelection ? selectedBookingTime : "";
    if (!keepSelection) {
        timesBox.innerHTML = "<span class='muted'>Loading available times...</span>";
        selectedBookingTime = "";
        lastSlotsKey = "";
    }

    const bookedRes = await db.rpc("get_booked_slots", { p_doctor_id: docId, p_date: dateIso });
    const booked = (bookedRes.data || []).map(function (r) { return hhmm(r.appt_time); });

    const slotsKey = docId + "|" + selectedBookingLocationId + "|" + dateIso + "|" + dayAvail.start_time + "|" + dayAvail.end_time + "|" + dayAvail.slot_minutes + "|" + booked.join(",");
    if (keepSelection && slotsKey === lastSlotsKey) {
        return;
    }
    lastSlotsKey = slotsKey;

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

document.getElementById("pb-open-maps").addEventListener("click", function () {
    const loc = findLocation(selectedBookingLocationId);
    openLocationInGoogleMaps(loc);
});

document.getElementById("pb-calc-distance").addEventListener("click", function () {
    if (!navigator.geolocation) {
        return showError("pb-error", "Your browser does not support GPS location.");
    }
    showInfo("pb-info", "Detecting your location to show distances...");
    navigator.geolocation.getCurrentPosition(
        function (pos) {
            userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            showInfo("pb-info", "Locations sorted by distance from you — click your preferred clinic!");
            renderPatientLocationPicker(true);
        },
        function (err) {
            showInfo("pb-info", "");
            showError("pb-error", "Could not get GPS location (" + err.message + "). You can still pick your clinic manually.");
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
});

document.getElementById("pb-doctor").addEventListener("change", function () {
    selectedBookingDate = "";
    selectedBookingTime = "";
    renderPatientBookingDates(false);
});

document.getElementById("pb-reason").addEventListener("change", function () {
    const otherInput = document.getElementById("pb-reason-other");
    if (!otherInput) return;
    otherInput.hidden = this.value !== "Other";
    if (this.value === "Other") otherInput.focus();
    else otherInput.value = "";
});

document.getElementById("pp-book-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!myPatient) return;
    showError("pb-error", "");
    showInfo("pb-info", "");

    const doctorId = document.getElementById("pb-doctor").value;
    const reasonSel = document.getElementById("pb-reason").value;
    const otherEl = document.getElementById("pb-reason-other");
    const reasonOther = otherEl ? otherEl.value.trim() : "";
    const reason = reasonSel === "Other" ? reasonOther : reasonSel;

    if (locations.length > 0 && !selectedBookingLocationId) return showError("pb-error", "Please choose a clinic location.");
    if (!doctorId) return showError("pb-error", "Please select a doctor.");
    if (!selectedBookingDate) return showError("pb-error", "Please choose an available day.");
    if (!selectedBookingTime) return showError("pb-error", "Please click an available time slot.");

    const bookedDate = selectedBookingDate;
    const bookedTime = selectedBookingTime;
    const locIdVal = selectedBookingLocationId ? Number(selectedBookingLocationId) : null;

    const { error } = await db.from("appointments").insert({
        patient_id: myPatient.id,
        doctor_id: doctorId,
        location_id: locIdVal,
        date: bookedDate,
        appt_time: bookedTime,
        reason: reason,
        status: "Scheduled",
        report: "",
        notes: ""
    });

    if (error) return showError("pb-error", error.message);
    document.getElementById("pb-reason").value = "";
    if (otherEl) {
        otherEl.value = "";
        otherEl.hidden = true;
    }
    selectedBookingTime = "";
    const locLabel = locIdVal ? " at " + locationName(locIdVal) : "";
    showInfo("pb-info", "Appointment booked for " + bookedDate + " at " + format12Hour(bookedTime) + locLabel + "!");
    await loadAll();
});

/* ---------------- DOCTOR PORTAL & AVAILABILITY ---------------- */

let editingDoctorAvailId = null;

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

    const myAppts = myDoctor
        ? appointments.filter(function (a) { return a.doctor_id === myDoctor.id; })
        : appointments;

    const myPatientIds = {};
    myAppts.forEach(function (a) { myPatientIds[a.patient_id] = true; });
    const myPatients = (currentProfile && currentProfile.role === "admin" && myDoctor)
        ? patients.filter(function (p) { return !!myPatientIds[p.id]; })
        : patients;

    const completedCount = myAppts.filter(function (a) { return a.status === "Completed"; }).length;
    const scheduledCount = myAppts.length - completedCount;

    const grid = document.getElementById("dp-stats");
    grid.innerHTML = "";
    [
        ["Total Appointments", String(myAppts.length)],
        ["Scheduled", String(scheduledCount)],
        ["Completed", String(completedCount)],
        ["My Patients", String(myPatients.length)]
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

    const filtered = myAppts.filter(function (a) {
        if (doctorFilter === "All") return true;
        return (a.status || "Scheduled") === doctorFilter;
    });

    const body = document.getElementById("dp-appts-body");
    body.innerHTML = "";
    if (filtered.length === 0) {
        addRow(body, ["—", "No appointments found.", "", "", "", "", "", "", "", "", ""]);
    } else {
        filtered.forEach(function (a) {
            const p = findById(patients, a.patient_id);
            const loc = findLocation(a.location_id);
            const st = a.status || "Scheduled";
            const isDone = st === "Completed";
            const vitals = p ? p.age + "y · " + p.weight + "Kg · BMI " + bmi(p).toFixed(1) : "—";
            const actions = [
                {
                    label: isDone ? "Edit Report & Notes" : "Complete & Notes",
                    className: "success",
                    onClick: function () { openDoctorReport(a); }
                },
                {
                    label: "Patient Details",
                    onClick: function () { if (p) openHealthReport(p, true); }
                }
            ];
            if (loc) {
                actions.push({
                    label: "🗺️ Open in Google Maps",
                    onClick: function () { openLocationInGoogleMaps(loc); }
                });
            }
            addRow(
                body,
                [
                    "#" + a.id,
                    a.date,
                    format12Hour(a.appt_time),
                    loc ? { mapLoc: loc, text: "📍 " + loc.name } : "—",
                    p ? p.name + " (" + p.id + ")" : a.patient_id,
                    vitals,
                    a.reason || "—",
                    { badge: isDone ? "completed" : "scheduled", text: st },
                    a.report ? a.report : "—",
                    a.notes ? a.notes : "—"
                ],
                actions
            );
        });
    }

    const pBody = document.getElementById("dp-patients-body");
    pBody.innerHTML = "";
    if (myPatients.length === 0) {
        addRow(pBody, ["—", "No patients assigned yet.", "", "", "", "", "", ""]);
    } else {
        myPatients.forEach(function (p) {
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

function stopEditDoctorAvail() {
    editingDoctorAvailId = null;
    document.getElementById("av-submit-btn").textContent = "Save Day Hours";
    setHidden("av-cancel-btn", true);
}

document.getElementById("av-cancel-btn").addEventListener("click", function () {
    stopEditDoctorAvail();
    showInfo("av-info", "");
});

function renderDoctorAvailability() {
    if (!myDoctor) return;
    const body = document.getElementById("av-body");
    body.innerHTML = "";
    const mine = availability.filter(function (av) { return av.doctor_id === myDoctor.id; });
    if (mine.length === 0) {
        addRow(body, ["No available days set yet.", "", "", "", "", ""]);
        return;
    }
    mine.forEach(function (av) {
        const loc = findLocation(av.location_id);
        const actions = [
            {
                label: "Edit",
                onClick: function () {
                    editingDoctorAvailId = av.id;
                    if (av.location_id) document.getElementById("av-location").value = String(av.location_id);
                    document.getElementById("av-day").value = String(av.day_of_week);
                    document.getElementById("av-start").value = hhmm(av.start_time);
                    document.getElementById("av-end").value = hhmm(av.end_time);
                    document.getElementById("av-slot").value = String(av.slot_minutes);
                    document.getElementById("av-submit-btn").textContent = "Update Day Hours";
                    setHidden("av-cancel-btn", false);
                    showError("av-error", "");
                    showInfo("av-info", "Editing " + DAY_NAMES[av.day_of_week] + " — adjust location/hours and click Update Day Hours.");
                }
            },
            {
                label: "Delete",
                onClick: async function () {
                    const { error } = await db.from("doctor_availability").delete().eq("id", av.id);
                    if (error) return showError("av-error", error.message);
                    if (editingDoctorAvailId === av.id) stopEditDoctorAvail();
                    showInfo("av-info", DAY_NAMES[av.day_of_week] + " removed.");
                    await loadAll();
                }
            }
        ];
        if (loc) {
            actions.unshift({
                label: "🗺️ Open in Google Maps",
                className: "success",
                onClick: function () { openLocationInGoogleMaps(loc); }
            });
        }
        addRow(
            body,
            [
                loc ? { mapLoc: loc, text: "📍 " + loc.name } : "—",
                DAY_NAMES[av.day_of_week],
                format12Hour(av.start_time),
                format12Hour(av.end_time),
                av.slot_minutes + " min"
            ],
            actions
        );
    });
}

async function saveAvailabilityRecord(doctorId, locVal, day, startTime, endTime, slotMin, existingId) {
    const locId = locVal ? Number(locVal) : null;
    const rowData = {
        doctor_id: doctorId,
        location_id: locId,
        day_of_week: day,
        start_time: startTime,
        end_time: endTime,
        slot_minutes: slotMin
    };

    if (existingId) {
        return await db.from("doctor_availability").update(rowData).eq("id", existingId);
    }

    // Check if doctor already has an entry for this same day + location
    const existing = availability.find(function (av) {
        return av.doctor_id === doctorId && av.day_of_week === day && String(av.location_id || "") === String(locId || "");
    });
    if (existing) {
        return await db.from("doctor_availability").update(rowData).eq("id", existing.id);
    }
    return await db.from("doctor_availability").insert(rowData);
}

document.getElementById("avail-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!myDoctor) return;
    showError("av-error", "");
    showInfo("av-info", "");

    const locVal = document.getElementById("av-location").value;
    const day = Number(document.getElementById("av-day").value);
    const startTime = document.getElementById("av-start").value;
    const endTime = document.getElementById("av-end").value;
    const slotMin = Number(document.getElementById("av-slot").value);

    if (locations.length > 0 && !locVal) {
        return showError("av-error", "Please choose which clinic location you will be at.");
    }
    if (!startTime || !endTime || timeToMinutes(endTime) <= timeToMinutes(startTime)) {
        return showError("av-error", "End time must be after start time.");
    }

    const { error } = await saveAvailabilityRecord(myDoctor.id, locVal, day, startTime, endTime, slotMin, editingDoctorAvailId);
    if (error) return showError("av-error", error.message);
    stopEditDoctorAvail();
    showInfo("av-info", "Saved " + DAY_NAMES[day] + (locVal ? " at " + locationName(locVal) : "") + " (" + format12Hour(startTime) + " - " + format12Hour(endTime) + ")!");
    await loadAll();
});

/* ---------------- SHARED MODALS (HEALTH REPORT & DOCTOR REPORT) ---------------- */

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
            const loc = findLocation(a.location_id);
            const item = document.createElement("div");
            item.className = "report-item";

            const top = document.createElement("div");
            const title = document.createElement("strong");
            title.textContent = "#" + a.id + " · " + a.date + " " + format12Hour(a.appt_time) + " · Dr. " + (doc ? doc.name : "?") + (loc ? " @ " + loc.name : "") + " ";
            const badge = document.createElement("span");
            const st = a.status || "Scheduled";
            badge.className = "badge " + (st === "Completed" ? "completed" : "scheduled");
            badge.textContent = st;
            top.appendChild(title);
            top.appendChild(badge);
            item.appendChild(top);

            const reason = document.createElement("p");
            reason.className = "muted";
            reason.textContent = "Reason: " + (a.reason || "—");
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

    setHidden("health-modal", false);
}

function closeHealthReport() { setHidden("health-modal", true); }
document.getElementById("hr-close").addEventListener("click", closeHealthReport);

let reportingAppt = null;

function openDoctorReport(a) {
    reportingAppt = a;
    const p = findById(patients, a.patient_id);
    const d = findById(doctors, a.doctor_id);
    const loc = findLocation(a.location_id);
    document.getElementById("dr-title").textContent = "Appointment #" + a.id + " — Report & Notes";
    document.getElementById("dr-subtitle").textContent =
        (p ? p.name + " (" + p.id + ")" : a.patient_id) +
        " with Dr. " + (d ? d.name : a.doctor_id) +
        (loc ? " @ " + loc.name : "") +
        " on " + a.date + " at " + format12Hour(a.appt_time) + " (" + (a.reason || "No reason") + ")";
    document.getElementById("dr-status").value = "Completed";
    document.getElementById("dr-report").value = a.report || "";
    document.getElementById("dr-notes").value = a.notes || "";
    showError("dr-error", "");
    setHidden("dr-modal", false);
}

function closeDoctorReport() {
    reportingAppt = null;
    setHidden("dr-modal", true);
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
/* ---------------- ADMIN: PATIENTS (POPUP MODAL + THREE-DOTS MENU) ---------------- */

let editingPatient = null;

function openPatientModal(p) {
    editingPatient = p || null;
    showError("p-form-error", "");
    if (editingPatient) {
        document.getElementById("pm-patient-title").textContent = "Edit Patient (" + editingPatient.id + ")";
        document.getElementById("p-id").value = editingPatient.id;
        document.getElementById("p-name").value = editingPatient.name;
        document.getElementById("p-age").value = editingPatient.age;
        document.getElementById("p-weight").value = editingPatient.weight;
        document.getElementById("p-height").value = editingPatient.height;
        document.getElementById("p-submit-btn").textContent = "Save Changes";
    } else {
        document.getElementById("pm-patient-title").textContent = "Add New Patient";
        document.getElementById("patient-form").reset();
        document.getElementById("p-id").value = "";
        document.getElementById("p-submit-btn").textContent = "Add Patient";
    }
    setHidden("patient-modal", false);
}

function closePatientModal() {
    editingPatient = null;
    document.getElementById("patient-form").reset();
    setHidden("patient-modal", true);
}

document.getElementById("open-add-patient-btn").addEventListener("click", function () { openPatientModal(null); });
document.getElementById("p-modal-close").addEventListener("click", closePatientModal);
document.getElementById("p-cancel").addEventListener("click", closePatientModal);

function renderPatients() {
    const body = document.getElementById("p-body");
    body.innerHTML = "";
    if (patients.length === 0) {
        addRow(body, ["—", "No patients yet. Click + Add Patient to create one.", "", "", "", "", ""]);
        return;
    }
    patients.forEach(function (p) {
        const actions = [
            { label: "Health Report", className: "success", onClick: function () { openHealthReport(p, true); } },
            { label: "Edit", onClick: function () { openPatientModal(p); } }
        ];
        if (!isAdminTestRecord(p, "P1")) {
            actions.push({ label: "Delete", className: "danger", onClick: function () { deletePatient(p); } });
        }
        addRow(
            body,
            [p.id, p.name, p.age, p.weight + " Kg", bmi(p).toFixed(1), category(bmi(p))],
            actions
        );
    });
}

async function deletePatient(p) {
    if (isAdminTestRecord(p, "P1")) {
        alert("TestPatient (P1) is a protected Admin test record.");
        return;
    }
    if (appointments.some(function (a) { return a.patient_id === p.id; })) {
        alert("Cannot delete: this patient has appointments. Delete them first.");
        return;
    }
    if (!confirm("Delete " + p.name + "?")) return;

    const { error } = await db.from("patients").delete().eq("id", p.id);
    if (error) return showError("p-error", error.message);
    await loadAll();
}

document.getElementById("patient-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    const name = document.getElementById("p-name").value.trim();
    const age = num("p-age");
    const weight = num("p-weight");
    const height = num("p-height");

    if (name === "") return showError("p-form-error", "Name cannot be empty.");
    if (!Number.isInteger(age) || age < 0 || age > 120) return showError("p-form-error", "Age must be a whole number between 0 and 120.");
    if (!(weight >= 2 && weight <= 400)) return showError("p-form-error", "Weight must be between 2 and 400 Kg.");
    if (!(height >= 0.4 && height <= 2.5)) return showError("p-form-error", "Height must be between 0.4 and 2.5 meters.");

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

    if (result.error) return showError("p-form-error", result.error.message);
    showError("p-error", "");
    closePatientModal();
    await loadAll();
});

/* ---------------- ADMIN: DOCTORS & AVAILABILITY MODAL ---------------- */

let editingDoctor = null;
let managingAvailDoctor = null;
let editingAdminAvailId = null;

function openDoctorModal(d) {
    editingDoctor = d || null;
    showError("d-form-error", "");
    if (editingDoctor) {
        document.getElementById("dm-doctor-title").textContent = "Edit Doctor (" + editingDoctor.id + ")";
        document.getElementById("d-id").value = editingDoctor.id;
        document.getElementById("d-name").value = editingDoctor.name;
        document.getElementById("d-age").value = editingDoctor.age;
        document.getElementById("d-spec").value = editingDoctor.specialty;
        document.getElementById("d-submit-btn").textContent = "Save Changes";
    } else {
        document.getElementById("dm-doctor-title").textContent = "Add New Doctor";
        document.getElementById("doctor-form").reset();
        document.getElementById("d-id").value = "";
        document.getElementById("d-submit-btn").textContent = "Add Doctor";
    }
    setHidden("doctor-modal", false);
}

function closeDoctorModal() {
    editingDoctor = null;
    document.getElementById("doctor-form").reset();
    setHidden("doctor-modal", true);
}

document.getElementById("open-add-doctor-btn").addEventListener("click", function () { openDoctorModal(null); });
document.getElementById("d-modal-close").addEventListener("click", closeDoctorModal);
document.getElementById("d-cancel").addEventListener("click", closeDoctorModal);

function stopEditAdminAvail() {
    editingAdminAvailId = null;
    document.getElementById("am-submit-btn").textContent = "Save Day Hours";
    setHidden("am-cancel-btn", true);
}

document.getElementById("am-cancel-btn").addEventListener("click", function () {
    stopEditAdminAvail();
    showInfo("am-info", "");
});

function openAvailModal(d) {
    managingAvailDoctor = d;
    stopEditAdminAvail();
    document.getElementById("am-title").textContent = "Availability — Dr. " + d.name + " (" + d.id + ")";
    fillLocationSelect("am-location", true);
    showError("am-error", "");
    showInfo("am-info", "");
    renderAvailModalTable();
    setHidden("avail-modal", false);
}

function closeAvailModal() {
    managingAvailDoctor = null;
    stopEditAdminAvail();
    setHidden("avail-modal", true);
}

function renderAvailModalTable() {
    if (!managingAvailDoctor) return;
    const body = document.getElementById("am-body");
    body.innerHTML = "";
    const list = availability.filter(function (av) { return av.doctor_id === managingAvailDoctor.id; });
    if (list.length === 0) {
        addRow(body, ["No available days set yet.", "", "", "", "", ""]);
        return;
    }
    list.forEach(function (av) {
        const loc = findLocation(av.location_id);
        const actions = [
            {
                label: "Edit",
                onClick: function () {
                    editingAdminAvailId = av.id;
                    if (av.location_id) document.getElementById("am-location").value = String(av.location_id);
                    document.getElementById("am-day").value = String(av.day_of_week);
                    document.getElementById("am-start").value = hhmm(av.start_time);
                    document.getElementById("am-end").value = hhmm(av.end_time);
                    document.getElementById("am-slot").value = String(av.slot_minutes);
                    document.getElementById("am-submit-btn").textContent = "Update Day Hours";
                    setHidden("am-cancel-btn", false);
                    showError("am-error", "");
                    showInfo("am-info", "Editing " + DAY_NAMES[av.day_of_week] + " — adjust location/hours and click Update Day Hours.");
                }
            },
            {
                label: "Delete",
                className: "danger",
                onClick: async function () {
                    const { error } = await db.from("doctor_availability").delete().eq("id", av.id);
                    if (error) return showError("am-error", error.message);
                    if (editingAdminAvailId === av.id) stopEditAdminAvail();
                    showInfo("am-info", DAY_NAMES[av.day_of_week] + " removed.");
                    await loadAll();
                    renderAvailModalTable();
                }
            }
        ];
        addRow(
            body,
            [
                loc ? { mapLoc: loc, text: "📍 " + loc.name } : "—",
                DAY_NAMES[av.day_of_week],
                format12Hour(av.start_time),
                format12Hour(av.end_time),
                av.slot_minutes + " min"
            ],
            actions
        );
    });
}

document.getElementById("am-close").addEventListener("click", closeAvailModal);

document.getElementById("am-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!managingAvailDoctor) return;
    showError("am-error", "");
    showInfo("am-info", "");

    const locVal = document.getElementById("am-location").value;
    const day = Number(document.getElementById("am-day").value);
    const startTime = document.getElementById("am-start").value;
    const endTime = document.getElementById("am-end").value;
    const slotMin = Number(document.getElementById("am-slot").value);

    if (locations.length > 0 && !locVal) {
        return showError("am-error", "Please pick a clinic location.");
    }
    if (!startTime || !endTime || timeToMinutes(endTime) <= timeToMinutes(startTime)) {
        return showError("am-error", "End time must be after start time.");
    }

    const { error } = await saveAvailabilityRecord(managingAvailDoctor.id, locVal, day, startTime, endTime, slotMin, editingAdminAvailId);
    if (error) return showError("am-error", error.message);
    stopEditAdminAvail();
    showInfo("am-info", "Saved " + DAY_NAMES[day] + (locVal ? " at " + locationName(locVal) : "") + "!");
    await loadAll();
    renderAvailModalTable();
});

function renderDoctors() {
    const body = document.getElementById("d-body");
    body.innerHTML = "";
    if (doctors.length === 0) {
        addRow(body, ["—", "No doctors yet. Click + Add Doctor to create one.", "", "", "", ""]);
        return;
    }
    doctors.forEach(function (d) {
        const actions = [
            { label: "Availability & Locations", className: "success", onClick: function () { openAvailModal(d); } },
            { label: "Edit", onClick: function () { openDoctorModal(d); } }
        ];
        if (!isAdminTestRecord(d, "D1")) {
            actions.push({ label: "Delete", className: "danger", onClick: function () { deleteDoctor(d); } });
        }
        addRow(
            body,
            [d.id, d.name, d.age, d.specialty, doctorScheduleSummary(d.id)],
            actions
        );
    });
}

async function deleteDoctor(d) {
    if (isAdminTestRecord(d, "D1")) {
        alert("TestDoctor (D1) is a protected Admin test record.");
        return;
    }
    if (appointments.some(function (a) { return a.doctor_id === d.id; })) {
        alert("Cannot delete: this doctor has appointments. Delete them first.");
        return;
    }
    if (!confirm("Delete " + d.name + "?")) return;

    const { error } = await db.from("doctors").delete().eq("id", d.id);
    if (error) return showError("d-error", error.message);
    await loadAll();
}

document.getElementById("doctor-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    const name = document.getElementById("d-name").value.trim();
    const age = num("d-age");
    const spec = document.getElementById("d-spec").value.trim();

    if (name === "") return showError("d-form-error", "Name cannot be empty.");
    if (!Number.isInteger(age) || age < 0 || age > 120) return showError("d-form-error", "Age must be a whole number between 0 and 120.");
    if (spec === "") return showError("d-form-error", "Specialty cannot be empty.");

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

    if (result.error) return showError("d-form-error", result.error.message);
    showError("d-error", "");
    closeDoctorModal();
    await loadAll();
});

/* ---------------- ADMIN: APPOINTMENTS (POPUP MODAL + THREE-DOTS MENU) ---------------- */

let editingAppt = null;

function fillApptSelects() {
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
    fillLocationSelect("a-location", true);
}

async function openApptModal(a) {
    editingAppt = a || null;
    showError("a-form-error", "");
    fillApptSelects();

    if (editingAppt) {
        document.getElementById("am-appt-title").textContent = "Edit Appointment #" + editingAppt.id;
        document.getElementById("a-patient").value = editingAppt.patient_id;
        document.getElementById("a-location").value = editingAppt.location_id ? String(editingAppt.location_id) : "";
        document.getElementById("a-doctor").value = editingAppt.doctor_id;
        document.getElementById("a-date").value = editingAppt.date;
        document.getElementById("a-reason").value = editingAppt.reason || "";
        document.getElementById("a-status").value = editingAppt.status || "Scheduled";
        document.getElementById("a-report").value = editingAppt.report || "";
        document.getElementById("a-notes").value = editingAppt.notes || "";
        document.getElementById("a-submit-btn").textContent = "Save Changes";
        await refreshTimeSlots("a-doctor", "a-date", "a-time", "a-avail-hint", hhmm(editingAppt.appt_time), "a-location");
    } else {
        document.getElementById("am-appt-title").textContent = "Book Appointment";
        document.getElementById("appt-form").reset();
        fillApptSelects();
        document.getElementById("a-submit-btn").textContent = "Book Appointment";
        await refreshTimeSlots("a-doctor", "a-date", "a-time", "a-avail-hint", null, "a-location");
    }
    setHidden("appt-modal", false);
}

function closeApptModal() {
    editingAppt = null;
    document.getElementById("appt-form").reset();
    setHidden("appt-modal", true);
}

document.getElementById("open-add-appt-btn").addEventListener("click", function () { openApptModal(null); });
document.getElementById("a-modal-close").addEventListener("click", closeApptModal);
document.getElementById("a-cancel").addEventListener("click", closeApptModal);

["a-doctor", "a-date", "a-location"].forEach(function (id) {
    document.getElementById(id).addEventListener("change", function () {
        refreshTimeSlots("a-doctor", "a-date", "a-time", "a-avail-hint", editingAppt ? hhmm(editingAppt.appt_time) : null, "a-location");
    });
});

function renderAppointments() {
    const body = document.getElementById("a-body");
    body.innerHTML = "";
    if (appointments.length === 0) {
        addRow(body, ["—", "No appointments yet. Click + Book Appointment to create one.", "", "", "", "", "", "", "", "", ""]);
        return;
    }
    appointments.forEach(function (a) {
        const p = findById(patients, a.patient_id);
        const d = findById(doctors, a.doctor_id);
        const loc = findLocation(a.location_id);
        const st = a.status || "Scheduled";
        const isDone = st === "Completed";
        const actions = [
            {
                label: isDone ? "Report & Notes" : "Complete",
                className: "success",
                onClick: function () { openDoctorReport(a); }
            },
            { label: "Edit", onClick: function () { openApptModal(a); } },
            { label: "Delete", className: "danger", onClick: function () { deleteAppt(a); } }
        ];
        if (loc) {
            actions.push({
                label: "🗺️ Open in Google Maps",
                onClick: function () { openLocationInGoogleMaps(loc); }
            });
        }
        addRow(
            body,
            [
                "#" + a.id,
                a.date,
                format12Hour(a.appt_time),
                loc ? { mapLoc: loc, text: "📍 " + loc.name } : "—",
                p ? p.name + " (" + p.id + ")" : a.patient_id,
                d ? "Dr. " + d.name : a.doctor_id,
                a.reason || "—",
                { badge: isDone ? "completed" : "scheduled", text: st },
                a.report ? a.report : "—",
                a.notes ? a.notes : "—"
            ],
            actions
        );
    });
}

async function deleteAppt(a) {
    if (!confirm("Delete appointment #" + a.id + "?")) return;
    const { error } = await db.from("appointments").delete().eq("id", a.id);
    if (error) return showError("a-error", error.message);
    await loadAll();
}

document.getElementById("appt-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    const patientId = document.getElementById("a-patient").value.trim();
    const doctorId = document.getElementById("a-doctor").value.trim();
    const locVal = document.getElementById("a-location").value;
    const date = document.getElementById("a-date").value;
    const apptTime = document.getElementById("a-time").value;
    const reason = document.getElementById("a-reason").value.trim();
    const status = document.getElementById("a-status").value;
    const report = document.getElementById("a-report").value.trim();
    const notes = document.getElementById("a-notes").value.trim();

    if (patientId === "" || doctorId === "") return showError("a-form-error", "Add at least one patient and one doctor first.");
    if (!validDate(date)) return showError("a-form-error", "Please choose a valid date.");
    if (!apptTime) return showError("a-form-error", "Please pick an available time slot.");

    // If Admin left Location as "Any", auto-fill from that doctor's availability on that weekday
    let locId = locVal ? Number(locVal) : null;
    if (!locId) {
        const dow = dayOfWeekFromDate(date);
        const av = availability.find(function (x) { return x.doctor_id === doctorId && x.day_of_week === dow && x.location_id; });
        if (av) locId = Number(av.location_id);
    }

    const rowData = {
        patient_id: patientId,
        doctor_id: doctorId,
        location_id: locId,
        date: date,
        appt_time: apptTime,
        reason: reason,
        status: status,
        report: report,
        notes: notes
    };

    let result;
    if (editingAppt) {
        result = await db.from("appointments").update(rowData).eq("id", editingAppt.id);
    } else {
        result = await db.from("appointments").insert(rowData);
    }

    if (result.error) return showError("a-form-error", result.error.message);
    showError("a-error", "");
    closeApptModal();
    await loadAll();
});

/* ---------------- ADMIN: CLINIC LOCATIONS (GPS + SEARCH + GOOGLE MAPS) ---------------- */

let editingLocation = null;

function openLocationModal(loc, autoGps) {
    editingLocation = loc || null;
    showError("lm-error", "");
    showInfo("lm-info", "");
    document.getElementById("lm-search-results").innerHTML = "";
    document.getElementById("lm-search-input").value = "";

    if (editingLocation) {
        document.getElementById("lm-title").textContent = "Edit Clinic Location";
        document.getElementById("lm-name").value = editingLocation.name || "";
        document.getElementById("lm-address").value = editingLocation.address || "";
        document.getElementById("lm-lat").value = editingLocation.latitude !== null && editingLocation.latitude !== undefined ? editingLocation.latitude : "";
        document.getElementById("lm-lng").value = editingLocation.longitude !== null && editingLocation.longitude !== undefined ? editingLocation.longitude : "";
        document.getElementById("lm-submit-btn").textContent = "Save Changes";
        setHidden("lm-search-box", false);
    } else {
        document.getElementById("lm-title").textContent = autoGps ? "Add Current Device Location" : "Search / Add Clinic Location";
        document.getElementById("location-form").reset();
        document.getElementById("lm-submit-btn").textContent = "Save Location";
        setHidden("lm-search-box", !!autoGps);
    }

    setHidden("location-modal", false);

    if (autoGps) {
        fillCurrentDeviceGps();
    } else if (!editingLocation) {
        document.getElementById("lm-search-input").focus();
    }
}

function closeLocationModal() {
    editingLocation = null;
    document.getElementById("location-form").reset();
    document.getElementById("lm-search-results").innerHTML = "";
    setHidden("location-modal", true);
}

async function fillCurrentDeviceGps() {
    if (!navigator.geolocation) {
        return showError("lm-error", "GPS is not supported by this browser. Enter or search the address below.");
    }
    showError("lm-error", "");
    showInfo("lm-info", "Detecting your device location...");

    navigator.geolocation.getCurrentPosition(
        async function (pos) {
            const lat = Number(pos.coords.latitude.toFixed(6));
            const lng = Number(pos.coords.longitude.toFixed(6));
            document.getElementById("lm-lat").value = lat;
            document.getElementById("lm-lng").value = lng;
            showInfo("lm-info", "GPS detected (" + lat + ", " + lng + ")! Looking up address...");

            try {
                const res = await fetch("https://nominatim.openstreetmap.org/reverse?format=json&lat=" + encodeURIComponent(lat) + "&lon=" + encodeURIComponent(lng));
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.display_name) {
                        document.getElementById("lm-address").value = data.display_name;
                    }
                    if (!document.getElementById("lm-name").value.trim() && data && data.address) {
                        const shortName = data.address.suburb || data.address.neighbourhood || data.address.city || data.address.town || "";
                        if (shortName) document.getElementById("lm-name").value = "Health Hub — " + shortName;
                    }
                }
                showInfo("lm-info", "Location ready! Give it a branch name and click Save Location.");
            } catch (_err) {
                showInfo("lm-info", "GPS coordinates filled (" + lat + ", " + lng + "). Enter a name & address and click Save Location.");
            }
            document.getElementById("lm-name").focus();
        },
        function (err) {
            showInfo("lm-info", "");
            showError("lm-error", "Could not read device GPS (" + err.message + "). Please allow Location access or use Search.");
            setHidden("lm-search-box", false);
        },
        { enableHighAccuracy: true, timeout: 12000 }
    );
}

async function searchPlacesByText() {
    const q = document.getElementById("lm-search-input").value.trim();
    const resultsBox = document.getElementById("lm-search-results");
    resultsBox.innerHTML = "";
    showError("lm-error", "");
    if (!q) return showError("lm-error", "Type a place, street, or city to search.");

    showInfo("lm-info", "Searching locations...");
    try {
        const res = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=5&q=" + encodeURIComponent(q));
        if (!res.ok) throw new Error("Search service returned HTTP " + res.status);
        const list = await res.json();
        showInfo("lm-info", "");

        if (!list || list.length === 0) {
            resultsBox.innerHTML = "<span class='muted'>No matches found. Try a broader city/street name, or type the address manually below.</span>";
            return;
        }

        list.forEach(function (item) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "search-result-btn";
            btn.textContent = "📍 " + item.display_name;
            btn.addEventListener("click", function () {
                const firstPart = String(item.display_name || "").split(",")[0].trim();
                if (!document.getElementById("lm-name").value.trim()) {
                    document.getElementById("lm-name").value = firstPart;
                }
                document.getElementById("lm-address").value = item.display_name || "";
                document.getElementById("lm-lat").value = Number(item.lat).toFixed(6);
                document.getElementById("lm-lng").value = Number(item.lon).toFixed(6);
                resultsBox.innerHTML = "";
                showInfo("lm-info", "Location selected! Review the Branch Name and click Save Location.");
            });
            resultsBox.appendChild(btn);
        });
    } catch (err) {
        showInfo("lm-info", "");
        showError("lm-error", "Search failed (" + err.message + "). You can still type Name, Address, and Coordinates manually.");
    }
}

document.getElementById("btn-add-current-loc").addEventListener("click", function () { openLocationModal(null, true); });
document.getElementById("btn-search-add-loc").addEventListener("click", function () { openLocationModal(null, false); });
document.getElementById("lm-close").addEventListener("click", closeLocationModal);
document.getElementById("lm-use-gps").addEventListener("click", fillCurrentDeviceGps);
document.getElementById("lm-search-btn").addEventListener("click", searchPlacesByText);
document.getElementById("lm-search-input").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
        e.preventDefault();
        searchPlacesByText();
    }
});

document.getElementById("lm-preview-map").addEventListener("click", function () {
    const previewLoc = {
        name: document.getElementById("lm-name").value.trim(),
        address: document.getElementById("lm-address").value.trim(),
        latitude: document.getElementById("lm-lat").value.trim(),
        longitude: document.getElementById("lm-lng").value.trim()
    };
    openLocationInGoogleMaps(previewLoc);
});

function renderLocations() {
    const body = document.getElementById("loc-body");
    if (!body) return;
    body.innerHTML = "";
    if (locations.length === 0) {
        addRow(body, ["No clinic locations yet. Click Add Current Location or Search / Add Location above.", "", "", "", ""]);
        return;
    }
    locations.forEach(function (loc) {
        const coords = (loc.latitude != null && loc.longitude != null)
            ? Number(loc.latitude).toFixed(5) + ", " + Number(loc.longitude).toFixed(5)
            : "—";
        addRow(
            body,
            [
                loc.name,
                loc.address || "—",
                coords,
                { mapLoc: loc, text: "🗺️ Open Google Maps ↗" }
            ],
            [
                { label: "🗺️ Open in Google Maps", className: "success", onClick: function () { openLocationInGoogleMaps(loc); } },
                { label: "Edit", onClick: function () { openLocationModal(loc, false); } },
                { label: "Delete", className: "danger", onClick: function () { deleteLocation(loc); } }
            ]
        );
    });
}

async function deleteLocation(loc) {
    if (!confirm("Delete location \"" + loc.name + "\"?")) return;
    const { error } = await db.from("clinic_locations").delete().eq("id", loc.id);
    if (error) return showError("loc-error", error.message);
    showInfo("loc-info", "Deleted " + loc.name + ".");
    await loadAll();
}

document.getElementById("location-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    const name = document.getElementById("lm-name").value.trim();
    const address = document.getElementById("lm-address").value.trim();
    const latRaw = document.getElementById("lm-lat").value.trim();
    const lngRaw = document.getElementById("lm-lng").value.trim();

    if (!name) return showError("lm-error", "Branch / Location Name cannot be empty.");
    const lat = latRaw === "" ? null : Number(latRaw);
    const lng = lngRaw === "" ? null : Number(lngRaw);
    if ((lat !== null && isNaN(lat)) || (lng !== null && isNaN(lng))) {
        return showError("lm-error", "Latitude and Longitude must be valid numbers.");
    }

    const rowData = { name: name, address: address, latitude: lat, longitude: lng };
    let result;
    if (editingLocation) {
        result = await db.from("clinic_locations").update(rowData).eq("id", editingLocation.id);
    } else {
        result = await db.from("clinic_locations").insert(rowData);
    }

    if (result.error) return showError("lm-error", result.error.message);
    showError("loc-error", "");
    showInfo("loc-info", editingLocation ? "Updated " + name + "!" : "Added location " + name + "!");
    closeLocationModal();
    await loadAll();
});

/* ---------------- PRIMARY ADMIN APPROVALS ---------------- */

async function loadAdminRequests() {
    if (!currentProfile || !currentProfile.is_primary_admin) return;
    const { data, error } = await db.rpc("get_admin_requests");
    if (error) return showError("aa-error", error.message);
    adminRequests = data || [];
    renderAdminRequests();
}

function renderAdminRequests() {
    const body = document.getElementById("aa-body");
    if (!body) return;
    body.innerHTML = "";
    showError("aa-error", "");

    const pendingCount = adminRequests.filter(function (r) { return r.approval_status === "pending"; }).length;
    const navBtn = document.querySelector('#app-nav button[data-section="admin-approvals"]');
    if (navBtn) {
        const base = navBtn.dataset.baseLabel || "🛡️  Admin Approvals";
        navBtn.textContent = pendingCount > 0 ? base + " (" + pendingCount + ")" : base;
    }

    if (adminRequests.length === 0) {
        addRow(body, ["No other admin requests yet.", "", "", "", ""]);
        return;
    }

    adminRequests.forEach(function (req) {
        const badgeType = req.approval_status === "approved"
            ? "completed"
            : (req.approval_status === "pending" ? "scheduled" : "danger");
        const statusText = req.approval_status.charAt(0).toUpperCase() + req.approval_status.slice(1);
        const dateStr = req.created_at ? new Date(req.created_at).toLocaleString() : "—";

        const actions = [];
        if (req.approval_status !== "approved") {
            actions.push({
                label: "Approve",
                className: "success",
                onClick: async function () {
                    const { error } = await db.rpc("review_admin_request", {
                        p_target_user_id: req.user_id,
                        p_decision: "approved"
                    });
                    if (error) return showError("aa-error", error.message);
                    showInfo("aa-info", "Approved " + req.full_name + " (" + req.email + ").");
                    sendAdminDecisionEmail(req.email, req.full_name, "approved");
                    await loadAdminRequests();
                }
            });
        }
        if (req.approval_status !== "rejected") {
            actions.push({
                label: req.approval_status === "approved" ? "Revoke" : "Deny",
                className: "danger",
                onClick: async function () {
                    const { error } = await db.rpc("review_admin_request", {
                        p_target_user_id: req.user_id,
                        p_decision: "rejected"
                    });
                    if (error) return showError("aa-error", error.message);
                    showInfo("aa-info", "Denied/revoked " + req.full_name + " (" + req.email + ").");
                    sendAdminDecisionEmail(req.email, req.full_name, "rejected");
                    await loadAdminRequests();
                }
            });
        }

        addRow(
            body,
            [req.full_name, req.email, { badge: badgeType, text: statusText }, dateStr],
            actions
        );
    });
}

document.getElementById("pending-refresh-btn").addEventListener("click", async function () {
    showInfo("pending-info", "Checking...");
    if (currentUser) await loadUserPortal(currentUser);
});

document.getElementById("pending-logout-btn").addEventListener("click", async function () {
    await db.auth.signOut();
});

/* ---------------- STARTUP ---------------- */

db.auth.onAuthStateChange(function (_event, session) {
    handleSession(session);
});

db.auth.getSession().then(function (res) {
    handleSession(res.data.session);
});
