/* ================= GLOBAL STATE ================= */

let state = {
    artikli: [],
    kupci: [],
    stavke: [],
    korisnik: null
};

let undoStack = [];
let syncQueue = JSON.parse(localStorage.getItem("syncQueue") || "[]");

let autosaveTimer;

// Dodajte nakon svake promjene podataka
async function automatskiBackup() {
    try {
        const backup = {
            timestamp: Date.now(),
            verzija: "1.0",
            korisnik: await dbDohvatiJedan(STORE_KORISNIK, 'ime'),
            brojac: await dbDohvatiJedan(STORE_BROJAC, 'brojac'),
            artikli: await dbDohvatiSve(STORE_ARTIKLI),
            kupci: await dbDohvatiSve(STORE_KUPCI),
            arhiva: await dbDohvatiSve(STORE_ARHIVA)
        };

        // Spremi u IndexedDB
        await dbSpremi(STORE_BACKUP, backup);
        
        // Spremi i u localStorage kao dodatnu sigurnost
        localStorage.setItem('lastBackup', JSON.stringify({
            timestamp: backup.timestamp,
            size: JSON.stringify(backup).length
        }));
        
        console.log('Auto backup uspješan', new Date().toLocaleTimeString());
    } catch (err) {
        console.error('Auto backup greška:', err);
    }
}

// Pozovite automatskiBackup nakon svake važne operacije:
// - nakon importArtikli()
// - nakon importKupci()
// - nakon spremiOtpremnicu()
// - nakon promjene korisnika
/* ================= AUTOSAVE ================= */

function autosave() {
    clearTimeout(autosaveTimer);

    autosaveTimer = setTimeout(async () => {
        try {
            await dbSpremi("appState", state, "state");
            console.log("Autosaved");
        } catch (e) {
            console.error("Autosave error:", e);
        }
    }, 500);
}


/* ================= UNDO ================= */

function saveStateToUndo() {
    undoStack.push(JSON.stringify(state));
    if (undoStack.length > 20) undoStack.shift();
}

function undo() {
    if (undoStack.length === 0) return;

    state = JSON.parse(undoStack.pop());
    renderAll();
    autosave();
}


/* ================= LOAD STATE ================= */

async function loadState() {
    try {
        let saved = await dbDohvatiJedan("appState", "state");
        if (saved) state = saved;
    } catch (e) {
        console.error("Load state error:", e);
    }

    renderAll();
}


/* ================= RENDER ================= */

function renderAll() {
    osvjeziListe();
    renderStavke();
    renderKorisnik();
}


/* ================= KORISNIK ================= */

function renderKorisnik() {
    let input = document.getElementById("korisnikInput");
    let slovoSpan = document.getElementById("korisnikSlovo");

    if (!input || !slovoSpan) return;

    if (state.korisnik) {
        input.value = state.korisnik;
        input.disabled = true;
        slovoSpan.textContent = state.korisnik.charAt(0).toUpperCase();
    }
}

async function initKorisnik() {
    let input = document.getElementById("korisnikInput");
    let slovoSpan = document.getElementById("korisnikSlovo");

    if (!input) return;

    if (state.korisnik) {
        renderKorisnik();
        return;
    }

    if (!input.dataset.init) {
        input.dataset.init = "1";

        input.addEventListener("blur", saveKorisnik);
        input.addEventListener("keypress", e => {
            if (e.key === "Enter") {
                e.preventDefault();
                saveKorisnik(e);
            }
        });
    }

    function saveKorisnik(e) {
        let ime = e.target.value.trim();
        if (!ime) return;

        saveStateToUndo();

        state.korisnik = ime;
        input.disabled = true;
        slovoSpan.textContent = ime.charAt(0).toUpperCase();

        autosave();
    }
}


/* ================= LISTE ================= */

function osvjeziListe() {
    let artikliList = document.getElementById("artikliList");
    if (artikliList) {
        artikliList.innerHTML = "";
        (state.artikli || []).forEach(a => {
            let o = document.createElement("option");
            o.value = a.naziv;
            artikliList.appendChild(o);
        });
    }

    let kupciList = document.getElementById("kupciList");
    if (kupciList) {
        kupciList.innerHTML = "";
        (state.kupci || []).forEach(k => {
            let o = document.createElement("option");
            o.value = k.naziv;
            kupciList.appendChild(o);
        });
    }
}


/* ================= STAVKE ================= */

function renderStavke() {
    let tbody = document.querySelector("#stavkeTable tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    (state.stavke || []).forEach((s, i) => {
        let tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${s.naziv || ""}</td>
            <td>${s.kolicina || 1}</td>
            <td class="actions-cell">
                <button class="icon-btn" onclick="obrisiStavku(${i})">✕</button>
            </td>
        `;

        tbody.appendChild(tr);
    });
}

function dodajStavku(stavka) {
    saveStateToUndo();

    state.stavke.push(stavka);

    renderStavke();
    autosave();
}

function obrisiStavku(index) {
    saveStateToUndo();

    state.stavke.splice(index, 1);

    renderStavke();
    autosave();
}

// ================= TOAST NOTIFIKACIJE =================
function showToast(message, type = 'success') {
    // Ukloni postojeći toast ako postoji
    let existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();
    
    let toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Dodaj ikonu prema tipu
    let icon = '';
    if (type === 'success') icon = '✅ ';
    else if (type === 'error') icon = '❌ ';
    else if (type === 'info') icon = 'ℹ️ ';
    else if (type === 'warning') icon = '⚠️ ';
    
    toast.textContent = icon + message;
    document.body.appendChild(toast);
    
    // Automatski ukloni nakon 2.5 sekundi
    setTimeout(() => {
        if (toast && toast.remove) toast.remove();
    }, 2500);
}
/* ================= IMPORT ================= */

function importArtikli() {
    let f = document.getElementById("artikliFile")?.files[0];
    if (!f) return;

    let r = new FileReader();

    r.onload = e => {
        saveStateToUndo();

        state.artikli = e.target.result
            .split("\n")
            .map(x => {
                let c = x.split(";");
                return {
                    sifra: (c[0] || "").trim(),
                    naziv: (c[1] || "").trim(),
                    bar: (c[2] || "").trim()
                };
            })
            .filter(a => a.sifra && a.naziv);

        renderAll();
        autosave();
        alert("Artikli učitani");
    };

    r.readAsText(f, "UTF-8");
}


/* ================= TOGGLE ================= */

function toggleImport() {
    let content = document.getElementById("importContent");
    let arrow = document.getElementById("importArrow");

    if (!content || !arrow) return;

    let isHidden = content.style.display === "none" || content.style.display === "";

    content.style.display = isHidden ? "block" : "none";
    arrow.innerHTML = isHidden ? "▲" : "▼";
}


/* ================= DATUM ================= */

function formatDatum(d) {
    let date = new Date(d);
    if (isNaN(date)) return "";
    return date.toLocaleDateString("hr-HR");
}


/* ================= OFFLINE SYNC ================= */

function queueSync(action) {
    syncQueue.push(action);
    localStorage.setItem("syncQueue", JSON.stringify(syncQueue));
}

async function syncNow() {
    if (!navigator.onLine) return;

    let queue = JSON.parse(localStorage.getItem("syncQueue") || "[]");

    for (let action of queue) {
        try {
            await fetch("/api/sync", {
                method: "POST",
                body: JSON.stringify(action),
                headers: { "Content-Type": "application/json" }
            });
        } catch (e) {
            console.log("Sync failed");
            return;
        }
    }

    localStorage.removeItem("syncQueue");
}

window.addEventListener("online", syncNow);


/* ================= INIT ================= */

window.addEventListener("load", async () => {
    await loadState();
    initKorisnik();
    syncNow();
});