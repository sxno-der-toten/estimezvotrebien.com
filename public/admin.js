let globalLeads = [];
let globalMandates = [];
let globalProfiles = [];
let itemToDeleteId = null;
let itemToDeleteType = null;

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });
});

let adminSupabase;
const checkReady = setInterval(() => {
    // Utilisation de isReady pour garantir que Clerk est totalement chargé
    if (window.supabaseClient && window.Clerk && window.Clerk.isReady) {
        clearInterval(checkReady);
        adminSupabase = window.supabaseClient;
        initAdminPanel();
    }
}, 100);

async function initAdminPanel() {
    const user = window.Clerk.user;
    const role = (user?.publicMetadata?.role || user?.unsafeMetadata?.role || '').toString().toLowerCase();
    const isAdmin = role === 'admin';

    if (!user || !isAdmin) {
        alert("Accès interdit : Cette page est réservée aux administrateurs.");
        window.location.href = 'index.html';
        return;
    }
    refreshAll();
}

async function refreshAll() {
    try {
        const { data: profilesData } = await adminSupabase.from('profiles').select('*');
        globalProfiles = profilesData || [];

        setupAutocomplete();
        loadStats();
        loadLeads();
        loadMandates();
    } catch (err) {
        console.error("Erreur refreshAll:", err);
    }
}

async function loadStats() {
    try {
        const { count: leadCount } = await adminSupabase.from('estimations').select('*', { count: 'exact', head: true });
        const { data: sales } = await adminSupabase.from('properties_for_sale').select('listing_price');

        let todoCount = 0;
        const { count: tc, error: errTodo } = await adminSupabase.from('estimations').select('*', { count: 'exact', head: true }).eq('is_contacted', false);
        if (!errTodo) todoCount = tc;

        let totalValue = 0;
        (sales || []).forEach(s => totalValue += (s.listing_price || 0));

        document.getElementById('stat-leads').textContent = leadCount || 0;
        document.getElementById('stat-mandats').textContent = (sales || []).length;
        document.getElementById('stat-todo').textContent = todoCount || 0;
        document.getElementById('stat-value').textContent = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(totalValue);
    } catch (e) { console.error("Erreur stats", e); }
}

async function loadLeads() {
    const tbody = document.getElementById('leads-body');
    try {
        const { data: leads, error } = await adminSupabase.from('estimations').select('*');
        if (error) throw error;

        globalLeads = leads || [];

        if (globalLeads.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px; color:#9CA3AF;">Aucune estimation dans la base de données.</td></tr>';
            return;
        }

        let sortedLeads = [...globalLeads].sort((a, b) => {
            if (a.is_contacted === b.is_contacted) {
                return new Date(b.created_at) - new Date(a.created_at);
            }
            return a.is_contacted ? 1 : -1;
        });

        tbody.innerHTML = sortedLeads.map(l => {
            const prof = globalProfiles.find(p => p.id === l.clerk_user_id) || {};
            const dateStr = new Date(l.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
            const minP = l.price_min ? l.price_min.toLocaleString('fr-FR') : '-';
            const maxP = l.price_max ? l.price_max.toLocaleString('fr-FR') : '-';
            const isContacted = l.is_contacted === true;

            const clientName = prof.first_name ? `${prof.first_name} ${prof.last_name || ''}` : 'Client Web';
            const clientContact = prof.email || l.clerk_user_id.substring(0, 8) + '...';
            const clientPhone = prof.phone ? `<br><i class="fas fa-phone" style="color:#6B7280; font-size:10px;"></i> <span style="font-weight:600; color:#4B5563;">${prof.phone}</span>` : '';

            return `
                <tr style="${isContacted ? 'opacity: 0.6' : 'font-weight: 600'}" onclick="openModal('lead', '${l.id}')">
                    <td>${dateStr}</td>
                    <td>
                        <strong style="color: #2E3F84;">${clientName}</strong><br>
                        <small style="color:#6B7280; font-weight:normal;">${clientContact}</small>${clientPhone}
                    </td>
                    <td>${l.address || 'Adresse inconnue'}<br><small style="color:#9CA3AF; font-weight:normal;">${l.property_type || 'Bien'} • ${l.surface || 0} m²</small></td>
                    <td style="color:#6C83D9">${minP}€ - ${maxP}€</td>
                    <td style="text-align: center; white-space: nowrap;" onclick="event.stopPropagation()">
                        <div style="display: flex; justify-content: center; gap: 8px;">
                            <button class="btn-action ${isContacted ? 'btn-gray' : 'btn-green'}" onclick="markLead('${l.id}', ${!isContacted})">${isContacted ? 'Afficher' : 'Archiver'}</button>
                            <button class="btn-action btn-danger" onclick="openDeleteModal('lead', '${l.id}')" title="Supprimer définitivement"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                </tr>
                `;
        }).join('');
    } catch (e) {
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red; padding:20px;">Erreur de connexion à Supabase.</td></tr>`;
    }
}

async function loadMandates() {
    const tbody = document.getElementById('mandates-body');
    try {
        const { data, error } = await adminSupabase.from('properties_for_sale').select('*');
        if (error) throw error;

        globalMandates = data || [];

        if (globalMandates.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px; color:#9CA3AF;">Aucun bien en vente.</td></tr>';
            return;
        }

        let sortedMandates = [...globalMandates].sort((a, b) => {
            const aDone = parseInt(a.status_step) === 5;
            const bDone = parseInt(b.status_step) === 5;
            if (aDone === bDone) {
                return new Date(b.created_at) - new Date(a.created_at);
            }
            return aDone ? 1 : -1;
        });

        const statusConfig = [
            { label: "Constitution du dossier", step: 1 },
            { label: "Mise en valeur & Photos", step: 2 },
            { label: "Visites en cours", step: 3 },
            { label: "Compromis de vente signé", step: 4 },
            { label: "Autre (Préciser par message au client)", step: 1 }
        ];

        tbody.innerHTML = sortedMandates.map(s => {
            const prof = globalProfiles.find(p => p.id === s.clerk_user_id) || {};
            const clientName = prof.first_name ? `${prof.first_name} ${prof.last_name || ''}` : 'Client Web';
            const clientContact = prof.email || s.clerk_user_id.substring(0, 8) + '...';
            const clientPhone = prof.phone ? `<br><i class="fas fa-phone" style="color:#6B7280; font-size:10px;"></i> <span style="font-weight:600; color:#4B5563;">${prof.phone}</span>` : '';

            const optionsHtml = statusConfig.map(conf =>
                `<option value="${conf.label}" data-step="${conf.step}" ${s.status_label === conf.label ? 'selected' : ''}>${conf.label}</option>`
            ).join('');

            const isDone = parseInt(s.status_step) === 5;

            return `
                <tr style="${isDone ? 'opacity: 0.6' : ''}" onclick="openModal('mandate', '${s.id}')">
                    <td>
                        <strong style="color: #2E3F84;">${clientName}</strong><br>
                        <small style="color:#6B7280; font-weight:normal;">${clientContact}</small>${clientPhone}
                    </td>
                    <td><strong>${s.address || 'Inconnue'}</strong></td>
                    <td onclick="event.stopPropagation()"><input type="number" class="admin-input" style="width:100px" value="${s.listing_price || 0}" id="price-${s.id}"></td>
                    <td onclick="event.stopPropagation()">
                        <select class="admin-input" id="lbl-${s.id}" onchange="document.getElementById('step-${s.id}').value = this.options[this.selectedIndex].dataset.step">
                            ${optionsHtml}
                            ${!statusConfig.find(c => c.label === s.status_label) && s.status_label ? `<option value="${s.status_label}" selected>${s.status_label}</option>` : ''}
                        </select>
                    </td>
                    <td onclick="event.stopPropagation()"><input type="number" class="admin-input" style="width:60px" min="1" max="5" value="${s.status_step || 1}" id="step-${s.id}"></td>
                    <td onclick="event.stopPropagation()"><input type="text" class="admin-input" value="${s.agent_assigned || ''}" id="agent-${s.id}" placeholder="Nom de l'agent"></td>
                    <td style="text-align:center; white-space: nowrap;" onclick="event.stopPropagation()">
                        <div style="display: flex; justify-content: center; gap: 8px;">
                            <button class="btn-action btn-green" onclick="updateMandate('${s.id}', this)">Sauvegarder</button>
                            <button class="btn-action btn-danger" onclick="openDeleteModal('mandate', '${s.id}')" title="Supprimer définitivement"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                </tr>
                `;
        }).join('');
    } catch (e) { console.error("Erreur chargement mandats:", e); }
}

window.goToMsgStep = function (step) {
    if (step === 2) {
        const searchInput = document.getElementById('user-search').value;
        if (!searchInput) {
            alert("Veuillez saisir ou sélectionner un client avant de continuer.");
            return;
        }

        if (!document.getElementById('user-select-id').value) {
            document.getElementById('user-select-id').value = searchInput;
        }
    }

    document.querySelectorAll('.msg-step').forEach(el => el.style.display = 'none');
    document.getElementById(`msg-step-${step}`).style.display = 'block';
};

function setupAutocomplete() {
    const input = document.getElementById('user-search');
    const suggestionsBox = document.getElementById('user-suggestions');
    const hiddenIdInput = document.getElementById('user-select-id');

    if (!input) return;

    input.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        suggestionsBox.innerHTML = '';
        hiddenIdInput.value = '';

        if (query.length < 2) return;

        const filtered = globalProfiles.filter(p => {
            const fullName = `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase();
            const email = (p.email || '').toLowerCase();
            const id = (p.id || '').toLowerCase();
            return fullName.includes(query) || email.includes(query) || id.includes(query);
        });

        if (filtered.length === 0) {
            suggestionsBox.innerHTML = '<li style="color:#9CA3AF; justify-content:center;">Aucun client trouvé</li>';
            return;
        }

        suggestionsBox.innerHTML = filtered.map(p => {
            const initial = p.first_name ? p.first_name.charAt(0).toUpperCase() : 'C';
            const avatarHtml = p.image_url ? `<img src="${p.image_url}">` : initial;

            return `
                <li data-id="${p.id}" data-name="${p.first_name || ''} ${p.last_name || ''}">
                    <div class="client-avatar">${avatarHtml}</div>
                    <div class="client-info-auto">
                        <strong>${p.first_name || 'Client'} ${p.last_name || ''}</strong>
                        <span>${p.email || p.id}</span>
                    </div>
                </li>
                `;
        }).join('');

        suggestionsBox.querySelectorAll('li[data-id]').forEach(li => {
            li.addEventListener('click', () => {
                input.value = li.getAttribute('data-name').trim() || li.getAttribute('data-id');
                hiddenIdInput.value = li.getAttribute('data-id');
                suggestionsBox.innerHTML = '';
            });
        });
    });

    document.addEventListener('click', (e) => {
        if (e.target !== input && !suggestionsBox.contains(e.target)) {
            suggestionsBox.innerHTML = '';
        }
    });
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    Object.assign(toast.style, {
        position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
        background: '#10B981', color: 'white', padding: '14px 28px', borderRadius: '50px',
        boxShadow: '0 10px 25px rgba(16, 185, 129, 0.3)', display: 'flex', alignItems: 'center', gap: '12px',
        fontWeight: '600', fontSize: '14px', zIndex: '99999', opacity: '0', transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
    });

    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '1'; toast.style.top = '40px'; }, 10);
    setTimeout(() => {
        toast.style.opacity = '0'; toast.style.top = '20px';
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

window.openModal = function (type, id) {
    const modal = document.getElementById('details-modal');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');

    let data, prof;

    if (type === 'lead') {
        data = globalLeads.find(l => l.id === id);
        prof = globalProfiles.find(p => p.id === data.clerk_user_id) || {};
        title.innerHTML = `<i class="fas fa-bolt" style="color:#FBBF24;"></i> Détails de l'Estimation`;

        body.innerHTML = `
                <div class="modal-grid">
                    <div class="detail-item"><span>Client</span><strong>${prof.first_name || 'Inconnu'} ${prof.last_name || ''}</strong></div>
                    <div class="detail-item"><span>Contact</span><strong>${prof.email || 'N/A'} <br> ${prof.phone || ' '}</strong></div>
                </div>
                <div class="modal-grid">
                    <div class="detail-item"><span>Adresse</span><strong>${data.address || 'N/A'}</strong></div>
                    <div class="detail-item"><span>Type de Bien</span><strong>${data.property_type || 'N/A'}</strong></div>
                    <div class="detail-item"><span>Surface</span><strong>${data.surface || 0} m²</strong></div>
                    <div class="detail-item"><span>Pièces / Chambres</span><strong>${data.rooms || '-'} / ${data.bedrooms || '-'}</strong></div>
                </div>
                <div class="detail-item" style="background:#EEF2FF; border-color:#C3CEF6;">
                    <span style="color:#6C83D9;">Fourchette Estimée Algorithme</span>
                    <strong style="color:#6C83D9; font-size:20px;">${data.price_min ? data.price_min.toLocaleString() : '-'} € — ${data.price_max ? data.price_max.toLocaleString() : '-'} €</strong>
                </div>
            `;
    } else if (type === 'mandate') {
        data = globalMandates.find(m => m.id === id);
        prof = globalProfiles.find(p => p.id === data.clerk_user_id) || {};
        title.innerHTML = `<i class="fas fa-home" style="color:#6C83D9;"></i> Détails du Mandat`;

        body.innerHTML = `
                <div class="modal-grid">
                    <div class="detail-item"><span>Client</span><strong>${prof.first_name || 'Inconnu'} ${prof.last_name || ''}</strong></div>
                    <div class="detail-item"><span>Contact</span><strong>${prof.email || 'N/A'} <br> ${prof.phone || ''}</strong></div>
                </div>
                <div class="detail-item" style="margin-bottom:20px;"><span>Adresse Complète</span><strong>${data.address || 'N/A'}</strong></div>
                <div class="modal-grid">
                    <div class="detail-item"><span>Prix Souhaité</span><strong style="color:#10B981; font-size: 18px;">${data.listing_price ? data.listing_price.toLocaleString() + ' €' : 'En attente'}</strong></div>
                    <div class="detail-item"><span>Agent Assigné</span><strong>${data.agent_assigned || 'Aucun'}</strong></div>
                    <div class="detail-item"><span>Étape Actuelle</span><strong>Étape ${data.status_step || 1} / 5</strong></div>
                    <div class="detail-item"><span>Statut Visible Client</span><strong>${data.status_label || 'Constitution du dossier'}</strong></div>
                </div>
            `;
    }

    modal.classList.add('active');
}

window.closeModal = function (e) {
    if (e && e.target.classList.contains('modal-box')) return;
    document.getElementById('details-modal').classList.remove('active');
}

window.openDeleteModal = function (type, id) {
    itemToDeleteType = type;
    itemToDeleteId = id;
    const text = type === 'lead'
        ? "Voulez-vous vraiment supprimer définitivement cette estimation ?"
        : "Voulez-vous vraiment supprimer définitivement ce mandat ?";
    document.getElementById('delete-modal-text').textContent = text;
    document.getElementById('delete-modal').classList.add('active');
};

window.closeDeleteModal = function (e) {
    if (e && e.target.classList.contains('modal-box')) return;
    document.getElementById('delete-modal').classList.remove('active');
    itemToDeleteId = null;
    itemToDeleteType = null;
};

window.confirmDelete = async function () {
    if (!itemToDeleteId || !itemToDeleteType) return;

    const table = itemToDeleteType === 'lead' ? 'estimations' : 'properties_for_sale';
    const { error } = await adminSupabase.from(table).delete().eq('id', itemToDeleteId);

    if (error) {
        alert("Erreur lors de la suppression.");
        console.error(error);
    } else {
        showToast(itemToDeleteType === 'lead' ? "Estimation supprimée avec succès." : "Mandat supprimé avec succès.");
        if (itemToDeleteType === 'lead') loadLeads();
        if (itemToDeleteType === 'mandate') loadMandates();
        loadStats();
    }

    closeDeleteModal();
};

window.markLead = async function (id, state) {
    await adminSupabase.from('estimations').update({ is_contacted: state }).eq('id', id);
    loadLeads();
    loadStats();
};

window.updateMandate = async function (id, btn) {
    const origText = btn.textContent;
    btn.textContent = "..."; btn.style.background = "#6B7280";

    const { error } = await adminSupabase.from('properties_for_sale').update({
        listing_price: document.getElementById(`price-${id}`).value,
        status_label: document.getElementById(`lbl-${id}`).value,
        status_step: document.getElementById(`step-${id}`).value,
        agent_assigned: document.getElementById(`agent-${id}`).value
    }).eq('id', id);

    if (!error) { btn.textContent = "Confirmé !"; btn.style.background = "#10B981"; }
    else { btn.textContent = "Erreur"; btn.style.background = "#EF4444"; }

    setTimeout(() => { btn.textContent = origText; btn.style.background = ""; loadStats(); }, 2000);
};

window.sendMessage = async function () {
    const userId = document.getElementById('user-select-id').value;
    const content = document.getElementById('msg-content').value;
    const agent = document.getElementById('agent-display').value;

    if (!userId || !content) {
        alert("Erreur: Le message est vide ou aucun client n'a été sélectionné dans la liste.");
        return;
    }

    const { error } = await adminSupabase.from('expert_messages').upsert({
        clerk_user_id: userId,
        content: content,
        agent_name: agent || ''
    }, { onConflict: 'clerk_user_id' });

    if (!error) {
        showToast("Le message a été envoyé sur l'espace du client !");
        document.getElementById('user-search').value = "";
        document.getElementById('user-select-id').value = "";
        document.getElementById('msg-content').value = "";
        document.getElementById('agent-display').value = "";

        goToMsgStep(1);
    } else {
        alert("Erreur lors de l'envoi.");
    }
};