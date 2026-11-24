let patients = [];
let doctors = [];
let appointments = [];

function save(){
    localStorage.setItem("healthhub", JSON.stringify({patients, doctors, appointments}));
}

function load(){
    try{
        const data = JSON.parse(localStorage.getItem("healthhub"));
        if(data){
            patients = data.patients || [];
            doctors = data.doctors || [];
            appointments = data.appointments || [];
        }
    } catch (e) {

    }
}

function addRow(tbody, cells, actions){
    const tr = document.createElement("tr");
    cells.forEach(function(text){
        const td = document.createElement("td");
        td.textContent = text;
        tr.appendChild(td);
    });
    if(actions){
        const td = document.createElement("td");
        actions.forEach(function(a){
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = a.label;
            if(a.label === "Delete") btn.className = "danger";
            btn.addEventListener("click", a.onClick);
            td.appendChild(btn);
        });
        tr.appendChild(td);
    }
    tbody.appendChild(tr);
}

function showError(id, message){
    document.getElementById(id).textContent = message;
}

function num(id){
    const v = document.getElementById(id).value.trim();
    return v === "" ? NaN : Number(v);
}

function idExists(id){
    const all = patients.concat(doctors);
    return all.some(function (p){return p.id.toLowerCase() === id.toLowerCase(); });
}

function bmi(p){
    return p.weight / (p.height * p.height);
}

function category(b){
    if(b < 18.5) return "Underweight";
    else if(b < 25) return "Normal";
    else if(b < 30) return "Overweight";
    else return "Obese";
}

function refreshAll(){
    renderPatients();
    renderDoctors();
    fillSelects();
    renderAppointments();
}

let editingPatient = null;

function renderPatients(){
    const body = document.getElementById("p-body");
    body.innerHTML = "";
    patients.forEach(function(p){
        addRow(body, [p.id, p.name, p.age, p.weight + " Kg", bmi(p).toFixed(1), category(bmi(p))],
        [
            { label: "Edit", onClick: function(){ startEditPatient(p); } },
            { label: "Delete", onClick: function(){ deletePatient(p); } }
        ]);
    });
}

function startEditPatient(p){
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

function stopEditPatient(){
    editingPatient = null;
    document.getElementById("patient-form").reset();
    document.getElementById("p-id").disabled = false;
    document.querySelector("#patient-form button[type=submit]").textContent = "Add patient";
    document.getElementById("p-cancel").hidden = true;
}

function deletePatient(p){
    if(appointments.some(function(a){return a.patientId === p.id; })){
        alert("Cannot delete: this patient has appointments. Delete them first.");
        return;
    }
    if(!confirm("Delete " + p.name + "?"))return;
    patients = patients.filter(function(x){return x !== p; });
    if(editingPatient === p) stopEditPatient();
    save();
    refreshAll();
}

document.getElementById("p-cancel").addEventListener("click", stopEditPatient);

document.getElementById("patient-form").addEventListener("submit", function(e){
    e.preventDefault();
    const id = document.getElementById("p-id").value.trim();
    const name = document.getElementById("p-name").value.trim();
    const age = num("p-age");
    const weight = num("p-weight");
    const height = num("p-height");

    if(id === "") return showError("p-error", "ID cannot be empty.");
    if(!editingPatient && idExists(id)) return showError("p-error", "ID " + id + " is already used.");
    if(name === "") return showError("p-error", "Name cannot be empty.");
    if(!Number.isInteger(age) || age < 0 || age > 120) return showError("p-error", "Age must be a whole number between 0 and 120.");
    if(!(weight >= 2 && weight <= 400)) return showError("p-error", "Weight must be between 2 and 400 Kg.");
    if(!(height >= 0.4 && height <= 2.5)) return showError("p-error", "Height must be between 0.4 and 2.5 meters.");

    if(editingPatient){
        editingPatient.name = name;
        editingPatient.age = age;
        editingPatient.weight = weight;
        editingPatient.height = height;
    } else{
        patients.push({id: id, name: name, age: age, weight: weight, height: height });
    }
    save();
    showError("p-error", "");
    stopEditPatient();
    refreshAll();
});

let editingDoctor = null;

function renderDoctors(){
    const body = document.getElementById("d-body");
    body.innerHTML = "";
    doctors.forEach(function(d){
        addRow(body, [d.id, d.name, d.age, d.specialty],
        [
            { label: "Edit", onClick: function(){ startEditDoctor(d); } },
            { label: "Delete", onClick: function(){ deleteDoctor(d); } }
        ]);
    });
}

function startEditDoctor(d){
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

function stopEditDoctor(){
    editingDoctor = null;
    document.getElementById("doctor-form").reset();
    document.getElementById("d-id").disabled = false;
    document.querySelector("#doctor-form button[type=submit]").textContent = "Add doctor";
    document.getElementById("d-cancel").hidden = true;
}

function deleteDoctor(d){
    if(appointments.some(function(a){return a.doctorId === d.id; })){
        alert("Cannot delete: this doctor has appointments. Delete them first.");
        return;
    }
    if(!confirm("Delete " + d.name + "?"))return;
    doctors = doctors.filter(function(x){return x !== d; });
    if(editingDoctor === d) stopEditDoctor();
    save();
    refreshAll();
}

document.getElementById("d-cancel").addEventListener("click", stopEditDoctor);

document.getElementById("doctor-form").addEventListener("submit", function(e){
    e.preventDefault();
    const id = document.getElementById("d-id").value.trim();
    const name = document.getElementById("d-name").value.trim();
    const age = num("d-age");
    const spec = document.getElementById("d-spec").value.trim();

    if(id === "") return showError("d-error", "ID cannot be empty.");
    if(!editingDoctor && idExists(id)) return showError("d-error", "ID " + id + " is already used.");
    if(name === "") return showError("d-error", "Name cannot be empty.");
    if(!Number.isInteger(age) || age < 0 || age > 120) return showError("d-error", "Age must be a whole number between 0 and 120.");
    if(spec === "")return showError("d-error", "Specialty cannot be empty.");

    if(editingDoctor){
        editingDoctor.name = name;
        editingDoctor.age = age;
        editingDoctor.specialty = spec;
    }else{
        doctors.push({ id: id, name: name, age: age, specialty: spec });
    }
    save();
    showError("d-error", "");
    stopEditDoctor();
    refreshAll();
});

document.querySelectorAll("nav button").forEach(function (btn){
    btn.addEventListener("click", function(){
        document.querySelectorAll("section").forEach(function(s){ s.hidden = true; });
        document.getElementById(btn.dataset.tab).hidden = false;
        document.querySelectorAll("nav button").forEach(function (b){ b.classList.remove("active"); });
        btn.classList.add("active");
    });
});

function fillSelects(){
    const ps = document.getElementById("a-patient");
    const ds = document.getElementById("a-doctor");
    ps.innerHTML = "";
    ds.innerHTML = "";
    patients.forEach(function(p) { ps.add(new Option(p.name + " (" + p.id +")", p.id)); });
    doctors.forEach(function(d) { ds.add(new Option(d.name + " (" + d.id +")", d.id)); });
}

function findById(list, id){
    return list.find(function (x){ return x.id === id; });
}

let editingAppt = null;

function renderAppointments(){
    const body = document.getElementById("a-body");
    body.innerHTML = "";
    appointments.forEach(function(a){
        const p = findById(patients, a.patientId);
        const d = findById(doctors, a.doctorId);
        addRow(body,
        ["#" + a.id, a.date, p ? p.name : "?", d ? d.name : "?", a.reason],
        [
            { label: "Edit", onClick: function(){ startEditAppt(a); } },
            { label: "Delete", onClick: function(){ deleteAppt(a); } }
        ]);
    });
}

function startEditAppt(a){
    editingAppt = a;
    document.getElementById("a-patient").value = a.patientId;
    document.getElementById("a-doctor").value = a.doctorId;
    document.getElementById("a-date").value = a.date;
    document.getElementById("a-reason").value = a.reason;
    document.querySelector("#appt-form button[type=submit]").textContent = "Save changes";
    document.getElementById("a-cancel").hidden = false;
    showError("a-error", "");
}

function stopEditAppt(){
    editingAppt = null;
    document.getElementById("appt-form").reset();
    document.querySelector("#appt-form button[type=submit]").textContent = "Book appointment";
    document.getElementById("a-cancel").hidden = true;
}

function deleteAppt(a){
    if(!confirm("Delete appointment #" + a.id + "?"))return;
    appointments = appointments.filter(function(x){return x !== a; });
    if(editingAppt === a) stopEditAppt();
    save();
    refreshAll();
}

document.getElementById("a-cancel").addEventListener("click", stopEditAppt);

function validDate(text){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return false;
    const parts = text.split("-").map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.getMonth() === parts[1] - 1 && d.getDate() === parts[2];
}

document.getElementById("appt-form").addEventListener("submit", function(e){
    e.preventDefault();
    const patientId = document.getElementById("a-patient").value.trim();
    const doctorId = document.getElementById("a-doctor").value.trim();
    const date = document.getElementById("a-date").value;
    const reason = document.getElementById("a-reason").value.trim();

    if(patientId === "" || doctorId === "") return showError("a-error", "Add at least one patient and one doctor first.");
    if(!validDate(date)) return showError("a-error", "Please choose a valid date.");
    if(reason === "") return showError("a-error", "Reason cannot be empty.");

    if(editingAppt){
        editingAppt.patientId = patientId;
        editingAppt.doctorId = doctorId;
        editingAppt.date = date;
        editingAppt.reason = reason;
    }else{
        let nextId = 1;
        appointments.forEach(function(a){if(a.id >= nextId) nextId = a.id + 1});
        appointments.push({id: nextId, patientId: patientId, doctorId: doctorId, date: date, reason: reason });
    }
    save();
    showError("a-error", "");
    stopEditAppt();
    refreshAll();
});

load();
refreshAll();