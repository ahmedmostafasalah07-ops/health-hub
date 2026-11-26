const SUPABASE_URL = "https://uzjobtodofcwdrybykuy.supabase.co";
const SUPABASE_KEY = "sb_publishable_rY5kXxNWYKRywqaS50HTSA_VPkrKek_";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let currentProfile = null;
let myPatient = null;
let myDoctor = null;

let patients = [];
let doctors = [];
let appointments = [];
let doctorFilter = "All";

let signupRole = "patient";
let setupRole = "patient";
let isSigningUp = false;

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
    options: { emailRedirectTo: window.location.origin + window.location.pathname }
});
    if (error) {
        isSigningUp = false;
        return showError("auth-error", error.message);
    }

    if (!data.session) {
        isSigningUp = false;
        showInfo("auth-info", "Account created! Confirm your email, then log in to finish your profile.");
        return;
    }

    const reg = await db.rpc("complete_registration", payload);
    isSigningUp = false;
    if (reg.error) {
        await loadUserPortal(data.session.user);
        return showError("setup-error", reg.error.message + " Try again below.");
    }

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

    document.getElementById("setup-form").reset();
    await loadUserPortal(currentUser);
});

document.getElementById("logout-btn").addEventListener("click", async function () {
    await db.auth.signOut();
});

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
        stopEditPatient();
        stopEditDoctor();
        stopEditAppt();
        closeHealthReport();
        closeDoctorReport();
        document.getElementById("auth-section").hidden = false;
        document.getElementById("setup-section").hidden = true;
        document.getElementById("app-nav").hidden = true;
        document.getElementById("app-main").hidden = true;
        document.getElementById("user-bar").hidden = true;
        document.getElementById("role-badge").hidden = true;
        document.body.dataset.bg = "auth";
        return;
    }

    document.getElementById("auth-section").hidden = true;
    document.getElementById("user-bar").hidden = false;
    document.getElementById("user-email").textContent = currentUser.email;

    if (userChanged || !currentProfile) {
        await loadUserPortal(currentUser);
    }
}

async function loadUserPortal(user) {
    currentUser = user;
    const { data: profile, error } = await db
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

    if (error) {
        showError("auth-error", error.message);
        return;
    }

    if (!profile) {
        currentProfile = null;
        document.getElementById("setup-section").hidden = false;
        document.getElementById("app-nav").hidden = true;
        document.getElementById("app-main").hidden = true;
        document.getElementById("role-badge").hidden = true;
        document.body.dataset.bg = "auth";
        return;
    }

    currentProfile = profile;
    document.getElementById("auth-section").hidden = true;
    document.getElementById("setup-section").hidden = true;
    document.getElementById("app-nav").hidden = false;
    document.getElementById("app-main").hidden = false;

    const badge = document.getElementById("role-badge");
    badge.textContent = profile.role;
    badge.hidden = false;

    if (profile.role === "patient") {
        buildNav([
            { label: "My Health", sectionId: "patient-profile-sec", bg: "patients" },
            { label: "My Appointments", sectionId: "patient-appts-sec", bg: "appointments" }
        ]);
    } else if (profile.role === "doctor") {
        buildNav([
            { label: "My Appointments", sectionId: "doctor-appts-sec", bg: "appointments" },
            { label: "My Patients", sectionId: "doctor-patients-sec", bg: "doctors" }
        ]);
    } else {
        buildNav([
            { label: "Patients", sectionId: "patients", bg: "patients" },
            { label: "Doctors", sectionId: "doctors", bg: "doctors" },
            { label: "Appointments", sectionId: "appointments", bg: "appointments" }
        ]);
    }

    await loadAll();
}

async function loadAll() {
    if (!currentProfile) return;

    const [pRes, dRes, aRes] = await Promise.all([
        db.from("patients").select("*").order("created_at", { ascending: true }),
        db.from("doctors").select("*").order("created_at", { ascending: true }),
        db.from("appointments").select("*").order("id", { ascending: true })
    ]);

    patients = pRes.data || [];
    doctors = dRes.data || [];
    appointments = aRes.data || [];

    if (currentProfile.role === "patient") {
        myPatient = patients.find(function (p) { return p.auth_user_id === currentUser.id; }) || patients[0] || null;
        renderPatientPortal();
    } else if (currentProfile.role === "doctor") {
        myDoctor = doctors.find(function (d) { return d.auth_user_id === currentUser.id; }) || null;
        renderDoctorPortal();
    } else {
        if (pRes.error) showError("p-error", pRes.error.message);
        if (dRes.error) showError("d-error", dRes.error.message);
        if (aRes.error) showError("a-error", aRes.error.message);
        renderPatients();
        renderDoctors();
        fillSelects();
        renderAppointments();
    }
}

/* ---------------- PATIENT PORTAL ---------------- */

function renderPatientPortal() {
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

    document.getElementById("pp-name").value = myPatient.name;
    document.getElementById("pp-age").value = myPatient.age;
    document.getElementById("pp-weight").value = myPatient.weight;
    document.getElementById("pp-height").value = myPatient.height;

    const body = document.getElementById("pp-appts-body");
    body.innerHTML = "";
    if (appointments.length === 0) {
        addRow(body, ["—", "No appointments scheduled yet.", "", "", "", "", ""]);
    } else {
        appointments.forEach(function (a) {
            const doc = findById(doctors, a.doctor_id);
            const st = a.status || "Scheduled";
            addRow(body, [
                "#" + a.id,
                a.date,
                doc ? "Dr. " + doc.name : "?",
                doc ? doc.specialty : "—",
                a.reason,
                { badge: st === "Completed" ? "completed" : "scheduled", text: st },
                a.report ? a.report : "No report yet"
            ]);
        });
    }
}

document.getElementById("pp-quick-weight").addEventListener("click", function () {
    if (myPatient) updateWeight(myPatient);
});

document.getElementById("pp-edit-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!myPatient) return;
    showError("pp-error", "");
    showInfo("pp-info", "");

    const name = document.getElementById("pp-name").value.trim();
    const age = num("pp-age");
    const weight = num("pp-weight");
    const height = num("pp-height");

    if (name === "") return showError("pp-error", "Name cannot be empty.");
    if (!Number.isInteger(age) || age < 0 || age > 120) return showError("pp-error", "Age must be a whole number between 0 and 120.");
    if (!(weight >= 2 && weight <= 400)) return showError("pp-error", "Weight must be between 2 and 400 Kg.");
    if (!(height >= 0.4 && height <= 2.5)) return showError("pp-error", "Height must be between 0.4 and 2.5 meters.");

    const { error } = await db
        .from("patients")
        .update({ name: name, age: age, weight: weight, height: height })
        .eq("id", myPatient.id);

    if (error) return showError("pp-error", error.message);
    showInfo("pp-info", "Profile updated!");
    await loadAll();
});

/* ---------------- DOCTOR PORTAL ---------------- */

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
        addRow(body, ["—", "No appointments found.", "", "", "", "", "", "", ""]);
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
            title.textContent = "#" + a.id + " · " + a.date + " · Dr. " + (doc ? doc.name : "?") + " ";
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
        " on " + a.date + " (" + a.reason + ")";
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

let editingDoctor = null;

function renderDoctors() {
    const body = document.getElementById("d-body");
    body.innerHTML = "";
    doctors.forEach(function (d) {
        addRow(
            body,
            [d.id, d.name, d.age, d.specialty],
            [
                { label: "Edit", onClick: function () { startEditDoctor(d); } },
                { label: "Delete", onClick: function () { deleteDoctor(d); } }
            ]
        );
    });
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
    ps.innerHTML = "";
    ds.innerHTML = "";
    patients.forEach(function (p) { ps.add(new Option(p.name + " (" + p.id + ")", p.id)); });
    doctors.forEach(function (d) { ds.add(new Option("Dr. " + d.name + " (" + d.id + ")", d.id)); });
}

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

function startEditAppt(a) {
    editingAppt = a;
    document.getElementById("a-patient").value = a.patient_id;
    document.getElementById("a-doctor").value = a.doctor_id;
    document.getElementById("a-date").value = a.date;
    document.getElementById("a-reason").value = a.reason;
    document.getElementById("a-status").value = a.status || "Scheduled";
    document.getElementById("a-report").value = a.report || "";
    document.getElementById("a-notes").value = a.notes || "";
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
    const reason = document.getElementById("a-reason").value.trim();
    const status = document.getElementById("a-status").value;
    const report = document.getElementById("a-report").value.trim();
    const notes = document.getElementById("a-notes").value.trim();

    if (patientId === "" || doctorId === "") return showError("a-error", "Add at least one patient and one doctor first.");
    if (!validDate(date)) return showError("a-error", "Please choose a valid date.");
    if (reason === "") return showError("a-error", "Reason cannot be empty.");

    let result;
    if (editingAppt) {
        result = await db
            .from("appointments")
            .update({ patient_id: patientId, doctor_id: doctorId, date: date, reason: reason, status: status, report: report, notes: notes })
            .eq("id", editingAppt.id);
    } else {
        result = await db
            .from("appointments")
            .insert({ patient_id: patientId, doctor_id: doctorId, date: date, reason: reason, status: status, report: report, notes: notes });
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
