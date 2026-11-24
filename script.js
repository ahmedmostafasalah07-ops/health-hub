const SUPABASE_URL = "https://uzjobtodofcwdrybykuy.supabase.co";
const SUPABASE_KEY = "sb_publishable_rY5kXxNWYKRywqaS50HTSA_VPkrKek_";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let patients = [];
let doctors = [];
let appointments = [];

function showError(id, message) {
    document.getElementById(id).textContent = message;
}

function showInfo(id, message) {
    document.getElementById(id).textContent = message;
}

function num(id) {
    const v = document.getElementById(id).value.trim();
    return v === "" ? NaN : Number(v);
}

function idExists(id) {
    const all = patients.concat(doctors);
    return all.some(function (p) { return p.id.toLowerCase() === id.toLowerCase(); });
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

function addRow(tbody, cells, actions) {
    const tr = document.createElement("tr");
    cells.forEach(function (text) {
        const td = document.createElement("td");
        td.textContent = text;
        tr.appendChild(td);
    });
    if (actions) {
        const td = document.createElement("td");
        actions.forEach(function (a) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = a.label;
            if (a.label === "Delete") btn.className = "danger";
            btn.addEventListener("click", a.onClick);
            td.appendChild(btn);
        });
        tr.appendChild(td);
    }
    tbody.appendChild(tr);
}

function refreshAll() {
    renderPatients();
    renderDoctors();
    fillSelects();
    renderAppointments();
}

async function loadAll() {
    const [pRes, dRes, aRes] = await Promise.all([
        db.from("patients").select("*").order("created_at", { ascending: true }),
        db.from("doctors").select("*").order("created_at", { ascending: true }),
        db.from("appointments").select("*").order("id", { ascending: true })
    ]);

    if (pRes.error) showError("p-error", pRes.error.message);
    if (dRes.error) showError("d-error", dRes.error.message);
    if (aRes.error) showError("a-error", aRes.error.message);

    patients = pRes.data || [];
    doctors = dRes.data || [];
    appointments = aRes.data || [];
    refreshAll();
}

async function handleSession(session) {
    const user = session ? session.user : null;
    const userChanged = (user ? user.id : null) !== (currentUser ? currentUser.id : null);
    currentUser = user;

    if (currentUser) {
        document.getElementById("auth-section").hidden = true;
        document.getElementById("app-nav").hidden = false;
        document.getElementById("app-main").hidden = false;
        document.getElementById("user-bar").hidden = false;
        document.getElementById("user-email").textContent = currentUser.email;
        if (userChanged) {
            await loadAll();
        }
    } else {
        patients = [];
        doctors = [];
        appointments = [];
        stopEditPatient();
        stopEditDoctor();
        stopEditAppt();
        document.getElementById("auth-section").hidden = false;
        document.getElementById("app-nav").hidden = true;
        document.getElementById("app-main").hidden = true;
        document.getElementById("user-bar").hidden = true;
        document.getElementById("user-email").textContent = "";
        refreshAll();
    }
}

document.getElementById("auth-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    showError("auth-error", "");
    showInfo("auth-info", "");

    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value;

    const { error } = await db.auth.signInWithPassword({ email: email, password: password });
    if (error) {
        showError("auth-error", error.message);
    }
});

document.getElementById("signup-btn").addEventListener("click", async function () {
    showError("auth-error", "");
    showInfo("auth-info", "");

    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value;

    if (!email || password.length < 6) {
        return showError("auth-error", "Enter a valid email and a password of at least 6 characters.");
    }

    const { data, error } = await db.auth.signUp({ email: email, password: password });
    if (error) {
        return showError("auth-error", error.message);
    }
    if (!data.session) {
        showInfo("auth-info", "Account created! Check your email to confirm, then log in.");
    }
});

document.getElementById("logout-btn").addEventListener("click", async function () {
    await db.auth.signOut();
});

let editingPatient = null;

function renderPatients() {
    const body = document.getElementById("p-body");
    body.innerHTML = "";
    patients.forEach(function (p) {
        addRow(
            body,
            [p.id, p.name, p.age, p.weight + " Kg", bmi(p).toFixed(1), category(bmi(p))],
            [
                { label: "Edit", onClick: function () { startEditPatient(p); } },
                { label: "Delete", onClick: function () { deletePatient(p); } }
            ]
        );
    });
}

function startEditPatient(p) {
    editingPatient = p;
    document.getElementById("p-id").value = p.id;
    document.getElementById("p-id").disabled = true;
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
    document.getElementById("p-id").disabled = false;
    document.querySelector("#patient-form button[type=submit]").textContent = "Add patient";
    document.getElementById("p-cancel").hidden = true;
}

async function deletePatient(p) {
    if (appointments.some(function (a) { return a.patient_id === p.id; })) {
        alert("Cannot delete: this patient has appointments. Delete them first.");
        return;
    }
    if (!confirm("Delete " + p.name + "?")) return;

    const { error } = await db
        .from("patients")
        .delete()
        .eq("id", p.id)
        .eq("user_id", currentUser.id);

    if (error) return showError("p-error", error.message);
    if (editingPatient && editingPatient.id === p.id) stopEditPatient();
    await loadAll();
}

document.getElementById("p-cancel").addEventListener("click", stopEditPatient);

document.getElementById("patient-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    const id = document.getElementById("p-id").value.trim();
    const name = document.getElementById("p-name").value.trim();
    const age = num("p-age");
    const weight = num("p-weight");
    const height = num("p-height");

    if (id === "") return showError("p-error", "ID cannot be empty.");
    if (!editingPatient && idExists(id)) return showError("p-error", "ID " + id + " is already used.");
    if (name === "") return showError("p-error", "Name cannot be empty.");
    if (!Number.isInteger(age) || age < 0 || age > 120) return showError("p-error", "Age must be a whole number between 0 and 120.");
    if (!(weight >= 2 && weight <= 400)) return showError("p-error", "Weight must be between 2 and 400 Kg.");
    if (!(height >= 0.4 && height <= 2.5)) return showError("p-error", "Height must be between 0.4 and 2.5 meters.");

    let result;
    if (editingPatient) {
        result = await db
            .from("patients")
            .update({ name: name, age: age, weight: weight, height: height })
            .eq("id", editingPatient.id)
            .eq("user_id", currentUser.id);
    } else {
        result = await db
            .from("patients")
            .insert({ id: id, name: name, age: age, weight: weight, height: height });
    }

    if (result.error) return showError("p-error", result.error.message);
    showError("p-error", "");
    stopEditPatient();
    await loadAll();
});

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
    document.getElementById("d-id").disabled = true;
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
    document.getElementById("d-id").disabled = false;
    document.querySelector("#doctor-form button[type=submit]").textContent = "Add doctor";
    document.getElementById("d-cancel").hidden = true;
}

async function deleteDoctor(d) {
    if (appointments.some(function (a) { return a.doctor_id === d.id; })) {
        alert("Cannot delete: this doctor has appointments. Delete them first.");
        return;
    }
    if (!confirm("Delete " + d.name + "?")) return;

    const { error } = await db
        .from("doctors")
        .delete()
        .eq("id", d.id)
        .eq("user_id", currentUser.id);

    if (error) return showError("d-error", error.message);
    if (editingDoctor && editingDoctor.id === d.id) stopEditDoctor();
    await loadAll();
}

document.getElementById("d-cancel").addEventListener("click", stopEditDoctor);

document.getElementById("doctor-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    const id = document.getElementById("d-id").value.trim();
    const name = document.getElementById("d-name").value.trim();
    const age = num("d-age");
    const spec = document.getElementById("d-spec").value.trim();

    if (id === "") return showError("d-error", "ID cannot be empty.");
    if (!editingDoctor && idExists(id)) return showError("d-error", "ID " + id + " is already used.");
    if (name === "") return showError("d-error", "Name cannot be empty.");
    if (!Number.isInteger(age) || age < 0 || age > 120) return showError("d-error", "Age must be a whole number between 0 and 120.");
    if (spec === "") return showError("d-error", "Specialty cannot be empty.");

    let result;
    if (editingDoctor) {
        result = await db
            .from("doctors")
            .update({ name: name, age: age, specialty: spec })
            .eq("id", editingDoctor.id)
            .eq("user_id", currentUser.id);
    } else {
        result = await db
            .from("doctors")
            .insert({ id: id, name: name, age: age, specialty: spec });
    }

    if (result.error) return showError("d-error", result.error.message);
    showError("d-error", "");
    stopEditDoctor();
    await loadAll();
});

document.querySelectorAll("#app-nav button").forEach(function (btn) {
    btn.addEventListener("click", function () {
        document.querySelectorAll("#app-main section").forEach(function (s) { s.hidden = true; });
        document.getElementById(btn.dataset.tab).hidden = false;
        document.querySelectorAll("#app-nav button").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
    });
});

function fillSelects() {
    const ps = document.getElementById("a-patient");
    const ds = document.getElementById("a-doctor");
    ps.innerHTML = "";
    ds.innerHTML = "";
    patients.forEach(function (p) { ps.add(new Option(p.name + " (" + p.id + ")", p.id)); });
    doctors.forEach(function (d) { ds.add(new Option(d.name + " (" + d.id + ")", d.id)); });
}

function findById(list, id) {
    return list.find(function (x) { return x.id === id; });
}

let editingAppt = null;

function renderAppointments() {
    const body = document.getElementById("a-body");
    body.innerHTML = "";
    appointments.forEach(function (a) {
        const p = findById(patients, a.patient_id);
        const d = findById(doctors, a.doctor_id);
        addRow(
            body,
            ["#" + a.id, a.date, p ? p.name : "?", d ? d.name : "?", a.reason],
            [
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

    const { error } = await db
        .from("appointments")
        .delete()
        .eq("id", a.id)
        .eq("user_id", currentUser.id);

    if (error) return showError("a-error", error.message);
    if (editingAppt && editingAppt.id === a.id) stopEditAppt();
    await loadAll();
}

document.getElementById("a-cancel").addEventListener("click", stopEditAppt);

function validDate(text) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
    const parts = text.split("-").map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.getMonth() === parts[1] - 1 && d.getDate() === parts[2];
}

document.getElementById("appt-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    const patientId = document.getElementById("a-patient").value.trim();
    const doctorId = document.getElementById("a-doctor").value.trim();
    const date = document.getElementById("a-date").value;
    const reason = document.getElementById("a-reason").value.trim();

    if (patientId === "" || doctorId === "") return showError("a-error", "Add at least one patient and one doctor first.");
    if (!validDate(date)) return showError("a-error", "Please choose a valid date.");
    if (reason === "") return showError("a-error", "Reason cannot be empty.");

    let result;
    if (editingAppt) {
        result = await db
            .from("appointments")
            .update({ patient_id: patientId, doctor_id: doctorId, date: date, reason: reason })
            .eq("id", editingAppt.id)
            .eq("user_id", currentUser.id);
    } else {
        result = await db
            .from("appointments")
            .insert({ patient_id: patientId, doctor_id: doctorId, date: date, reason: reason });
    }

    if (result.error) return showError("a-error", result.error.message);
    showError("a-error", "");
    stopEditAppt();
    await loadAll();
});

db.auth.onAuthStateChange(function (_event, session) {
    handleSession(session);
});

db.auth.getSession().then(function (res) {
    handleSession(res.data.session);
});
