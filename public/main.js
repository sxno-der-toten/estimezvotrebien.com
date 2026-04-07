// ==========================================
// CONFIGURATION SUPABASE (Protégée contre le double chargement)
// ==========================================
if (!window.supabaseUrl) {
    window.supabaseUrl = 'https://crswkagawmfksizojgsf.supabase.co';
    window.supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNyc3drYWdhd21ma3Npem9qZ3NmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MDgyMjAsImV4cCI6MjA5MDE4NDIyMH0.hymLWw0vjv0HW_5DX5xE9DXJdbEo_OOyjIZ9qagWRnw';
}

// On crée une instance claire et on la stocke globalement
if (!window.supabaseClient && window.supabase) {
    window.supabaseClient = window.supabase.createClient(window.supabaseUrl, window.supabaseKey);
}

// On utilise 'var' car contrairement à 'const', il accepte d'être rechargé plusieurs fois sans faire d'erreur
var CLERK_SESSION_KEY = 'estimez_clerk_saved_session';

function saveClerkSession(session) {
    try {
        localStorage.setItem(CLERK_SESSION_KEY, JSON.stringify(session));
    } catch (error) {
        console.warn('Impossible de sauvegarder la session Clerk :', error);
    }
}

function getSavedClerkSession() {
    try {
        return JSON.parse(localStorage.getItem(CLERK_SESSION_KEY)) || null;
    } catch {
        return null;
    }
}

function clearSavedClerkSession() {
    try {
        localStorage.removeItem(CLERK_SESSION_KEY);
    } catch {
        // ignore
    }
}

function getClerkRole(user) {
    const rawRole = user?.publicMetadata?.role ?? user?.unsafeMetadata?.role ?? '';
    if (Array.isArray(rawRole)) {
        return rawRole
            .map(item => String(item || '').trim().toLowerCase())
            .filter(Boolean)
            .join(' ');
    }
    if (rawRole && typeof rawRole === 'object') {
        return Object.values(rawRole)
            .map(item => String(item || '').trim().toLowerCase())
            .filter(Boolean)
            .join(' ');
    }
    return String(rawRole || '').trim().toLowerCase();
}

function isClerkAdmin(user) {
    const role = getClerkRole(user);
    return role.includes('admin');
}

function restoreNavbarFromSavedSession() {
    const session = getSavedClerkSession();
    if (!session) return;

    const roleHref = session.isAdmin ? 'admin.html' : 'client.html';

    // On s'occupe UNIQUEMENT de modifier le lien "Mon espace" et son attribut href.
    // On ne détruit PLUS le conteneur avec un innerHTML.
    document.querySelectorAll('.nav-espace-link').forEach(link => {
        const parentLi = link.closest('li');
        if (parentLi) {
            parentLi.style.display = 'block';
            parentLi.style.opacity = '1';
        }

        link.textContent = 'Mon espace';
        link.setAttribute('href', roleHref);
    });
}

restoreNavbarFromSavedSession();

// ==========================================
// 1. INITIALISATION DE SWUP (Navigation Fluide)
// ==========================================
if (typeof Swup !== 'undefined') {
    var swup = new Swup();
}

// ==========================================
// 2. GESTION DES RÔLES ET LOCALSTORAGE
// ==========================================
function updateAuthState(user) {
    if (user) {
        const role = user.publicMetadata?.role === 'admin' ? 'admin' : 'client';
        localStorage.setItem('app_auth_state', 'logged_in');
        localStorage.setItem('app_user_role', role);

        // Applique les classes immédiatement pour le changement de page Swup
        document.documentElement.classList.add('is-logged-in');
        document.documentElement.classList.remove('is-logged-out');
        document.documentElement.classList.toggle('is-admin', role === 'admin');
        document.documentElement.classList.toggle('is-client', role !== 'admin');
    } else {
        localStorage.setItem('app_auth_state', 'logged_out');
        localStorage.removeItem('app_user_role');
        document.documentElement.classList.add('is-logged-out');
        document.documentElement.classList.remove('is-logged-in', 'is-admin', 'is-client');
    }
}

// ==========================================
// FONCTION DE CHARGEMENT DU DASHBOARD CLIENT
// ==========================================
async function loadClientDashboard(userId) {
    if (!window.supabaseClient) {
        console.error("Supabase Client introuvable.");
        return;
    }

    try {
        const { data: msgData, error: msgError } = await window.supabaseClient
            .from('expert_messages')
            .select('agent_name, content')
            .eq('clerk_user_id', userId)
            .maybeSingle();

        if (msgError) console.error("Erreur lors de la requête expert_messages:", msgError.message);

        const nameEl = document.getElementById('expert-name');
        const msgEl = document.getElementById('expert-message');

        if (msgData && nameEl && msgEl) {
            nameEl.textContent = msgData.agent_name;
            msgEl.textContent = msgData.content;
        } else if (nameEl && msgEl) {
            nameEl.textContent = "Bienvenue !";
            msgEl.textContent = "Nous préparons actuellement votre dossier. N'hésitez pas à nous contacter si vous avez des questions.";
        }

        const { data: salesData } = await window.supabaseClient
            .from('properties_for_sale')
            .select('*')
            .eq('clerk_user_id', userId)
            .order('created_at', { ascending: false });

        const salesContainer = document.getElementById('sales-container');

        if (salesContainer && salesData && salesData.length > 0) {
            salesContainer.innerHTML = '';
            salesData.forEach(sale => {
                const step = sale.status_step || 1;
                const progressPct = (step / 5) * 100;
                const priceFormatted = sale.listing_price
                    ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(sale.listing_price)
                    : 'Prix en cours d\'évaluation';

                const agentHtml = (sale.agent_assigned && sale.agent_assigned.trim() !== '')
                    ? `<div class="sale-agent"><i class="fas fa-user"></i> Agent : ${sale.agent_assigned}</div>`
                    : '';

                salesContainer.innerHTML += `
                    <div class="dash-card">
                        <div class="sale-header">
                            <i class="fas fa-home"></i> <strong>${sale.address}</strong>
                        </div>
                        <div class="sale-price">${priceFormatted}</div>
                        <div class="sale-status">
                            <span>Étape ${step} : ${sale.status_label || 'Constitution du dossier'}</span>
                            <div class="progress-bar"><div class="progress-fill" style="width: ${progressPct}%"></div></div>
                        </div>
                        ${agentHtml}
                    </div>
                `;
            });
        }

        const { data: estData } = await window.supabaseClient
            .from('estimations')
            .select('*')
            .eq('clerk_user_id', userId)
            .order('created_at', { ascending: false });

        const estContainer = document.getElementById('estimations-grid');
        if (estContainer && estData && estData.length > 0) {
            estContainer.innerHTML = '';
            estData.forEach(est => {
                const dateStr = new Date(est.created_at).toLocaleDateString('fr-FR');
                const minPrice = est.price_min ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(est.price_min) : '-';
                const maxPrice = est.price_max ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(est.price_max) : '-';

                estContainer.innerHTML += `
                    <div class="dash-card estimation-card">
                        <div class="est-date">Estimé le ${dateStr}</div>
                        <div class="est-address"><i class="fas fa-map-marker-alt"></i> ${est.address || 'Adresse non renseignée'}</div>
                        <div class="est-details">
                            <span>${est.property_type || 'Bien'}</span> • <span>${est.surface || 0} m²</span> • <span>${est.rooms || 0} pièces</span>
                        </div>
                        <div class="est-price-range">
                            Fourchette estimée : <strong>${minPrice} - ${maxPrice}</strong>
                        </div>
                    </div>
                `;
            });
        }
    } catch (err) {
        console.error("Erreur lors du chargement des données Supabase :", err);
    }
}

// ==========================================
// OUTIL D'ESTIMATION EXISTANT
// ==========================================
window.EstimationTool = class {
    constructor() {
        this.currentStep = 1;
        this.totalSteps = 6;
        this.form = document.getElementById('estimationForm');
        this.wrapper = document.getElementById('estimationWrapper');
        this.splitContainer = document.getElementById('heroSplitContainer');
        if (this.form) this.init();
    }

    init() {
        this.bindEvents();
        this.initAutocomplete();
        this.updateUI();
    }

    bindEvents() {
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');

        if (prevBtn) prevBtn.addEventListener('click', () => this.previousStep());
        if (nextBtn) nextBtn.addEventListener('click', () => this.nextStep());
        if (this.form) this.form.addEventListener('submit', (e) => this.submitForm(e));

        const typeRadios = document.querySelectorAll('input[name="propertyType"]');
        typeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                const isAppart = e.target.value === 'Appartement' || e.target.value === 'appartement';
                const appartFields = document.getElementById('appartementFields');
                if (appartFields) appartFields.style.display = isAppart ? 'block' : 'none';

                document.querySelectorAll('.maison-only').forEach(el => el.style.display = isAppart ? 'none' : 'flex');
                document.querySelectorAll('.appartement-only').forEach(el => el.style.display = isAppart ? 'flex' : 'none');

                this.validateStep();
            });
        });

        this.form.querySelectorAll('input, select').forEach(input => {
            input.addEventListener('input', () => this.validateStep());
            input.addEventListener('change', () => this.validateStep());
        });
    }

    initAutocomplete() {
        const input = document.getElementById('addressInput');
        const suggestionsBox = document.getElementById('addressSuggestions');
        let timeout = null;

        if (!input) return;

        input.addEventListener('input', (e) => {
            clearTimeout(timeout);
            const query = e.target.value.trim();

            if (query.length < 3 || !/[a-zA-Z]/.test(query)) {
                if (suggestionsBox) suggestionsBox.innerHTML = '';
                this.validateStep();
                return;
            }

            timeout = setTimeout(async () => {
                try {
                    const response = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`);
                    if (response.status === 400) return;
                    if (!response.ok) throw new Error("Erreur réseau");
                    const data = await response.json();

                    if (suggestionsBox) {
                        suggestionsBox.innerHTML = data.features.map(f =>
                            `<li data-label="${f.properties.label}">${f.properties.label}</li>`
                        ).join('');

                        suggestionsBox.querySelectorAll('li').forEach(li => {
                            ['mousedown', 'touchstart'].forEach(eventType => {
                                li.addEventListener(eventType, (ev) => {
                                    ev.preventDefault();
                                    input.value = li.getAttribute('data-label');
                                    suggestionsBox.innerHTML = '';
                                    setTimeout(() => this.validateStep(), 50);
                                });
                            });
                        });
                    }
                } catch (error) {
                    console.error("L'autocomplétion API a échoué:", error);
                }
            }, 100);
        });

        // ==========================================
        // GESTION MOBILE SWUP-PROOF (DÉLÉGATION)
        // ==========================================
        document.addEventListener('click', (e) => {
            const profileBlock = e.target.closest('#mobile-profile-block');

            // 1. Si on clique sur le bloc profil (ou le pseudo/chevron)
            if (profileBlock) {
                // Empêche d'ouvrir/fermer si on clique précisément sur un bouton du menu
                if (!e.target.closest('#mobile-manage-account') && !e.target.closest('#mobile-sign-out')) {
                    const isOpen = profileBlock.classList.toggle('dropdown-open');
                    profileBlock.setAttribute('aria-expanded', String(isOpen));
                }
            }

            // 2. Clic sur "Gérer le compte"
            if (e.target.closest('#mobile-manage-account')) {
                if (window.Clerk) window.Clerk.openUserProfile();
                document.getElementById('mobile-profile-block')?.classList.remove('dropdown-open');
            }

            // 3. Clic sur "Se déconnecter"
            if (e.target.closest('#mobile-sign-out')) {
                if (window.Clerk) {
                    window.Clerk.signOut().then(() => {
                        window.location.href = 'index.html';
                    });
                }
            }

            // 4. Fermer la pop-up si on clique n'importe où ailleurs
            if (!profileBlock && !e.target.closest('.mobile-profile-dropdown')) {
                document.querySelectorAll('.mobile-profile-block').forEach(block => {
                    block.classList.remove('dropdown-open');
                    block.setAttribute('aria-expanded', 'false');
                });
            }
        });
    }

    updateUI() {
        const progressFill = document.getElementById('progressFill');
        if (progressFill) progressFill.style.width = `${(this.currentStep / this.totalSteps) * 100}%`;

        document.querySelectorAll('.form-step').forEach(step => {
            step.style.display = 'none';
            step.classList.remove('active');
        });

        const currentElement = document.querySelector(`.form-step[data-step="${this.currentStep}"]`);
        if (currentElement) {
            currentElement.style.display = 'block';
            setTimeout(() => currentElement.classList.add('active'), 10);
        }

        if (this.currentStep >= 2) {
            if (this.wrapper) this.wrapper.classList.add('expanded');
            if (this.splitContainer) this.splitContainer.classList.add('centered-mode');
        } else {
            if (this.wrapper) this.wrapper.classList.remove('expanded');
            if (this.splitContainer) this.splitContainer.classList.remove('centered-mode');
        }

        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        const submitBtn = document.getElementById('submitBtn');

        if (prevBtn) prevBtn.style.display = this.currentStep === 1 ? 'none' : 'block';

        if (this.currentStep === this.totalSteps) {
            if (nextBtn) nextBtn.style.display = 'none';
            if (submitBtn) submitBtn.style.display = 'block';
        } else {
            if (nextBtn) nextBtn.style.display = 'block';
            if (submitBtn) submitBtn.style.display = 'none';
        }

        this.validateStep();
    }

    validateStep() {
        const currentElement = document.querySelector(`.form-step[data-step="${this.currentStep}"]`);
        if (!currentElement) return false;

        const requiredInputs = currentElement.querySelectorAll('[required]');
        let isValid = true;

        requiredInputs.forEach(input => {
            if (input.type === 'radio') {
                const isChecked = currentElement.querySelector(`input[name="${input.name}"]:checked`);
                if (!isChecked) isValid = false;
            } else {
                if (!input.value || input.value.trim() === '') isValid = false;
            }
        });

        const btn = this.currentStep === this.totalSteps ? document.getElementById('submitBtn') : document.getElementById('nextBtn');
        if (btn) {
            btn.disabled = !isValid;
        }

        return isValid;
    }

    nextStep() {
        if (this.validateStep() && this.currentStep < this.totalSteps) {
            this.currentStep++;
            this.updateUI();
        }
    }

    previousStep() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.updateUI();
        }
    }

    async submitForm(e) {
        e.preventDefault();
        if (!this.validateStep()) return;

        if (this.wrapper) this.wrapper.classList.remove('expanded');
        if (this.form) this.form.style.display = 'none';
        const loadingSimulation = document.getElementById('loadingSimulation');
        if (loadingSimulation) loadingSimulation.style.display = 'block';

        const data = new FormData(this.form);
        const isVendrePage = window.location.pathname.includes('vendre.html');
        const isAchat = window.location.pathname.includes('acheter.html');

        const address = data.get('address') || data.get('ville') || "";
        const addrLower = address.toLowerCase();
        const surface = parseFloat(data.get('surface')) || 0;
        const type = data.get('propertyType');

        const check = (name) => data.get(name) ? "✅" : "❌";

        let prixM2Base = 3000;
        if (addrLower.includes('paris')) prixM2Base = 10500;
        else if (addrLower.includes('lyon')) prixM2Base = 5200;
        else if (addrLower.includes('bordeaux')) prixM2Base = 4800;
        else if (addrLower.includes('orleans')) prixM2Base = 3100;
        else if (addrLower.includes('toulouse')) prixM2Base = 3900;
        else if (addrLower.includes('nice')) prixM2Base = 5700;

        let coeff = 1.0;
        const condition = data.get('condition');
        if (condition === 'Excellent') coeff *= 1.12;
        else if (condition === 'Bon') coeff *= 1.0;
        else if (condition === 'Rafraîchir' || condition === 'Rafraichir') coeff *= 0.90;
        else if (condition === 'À rénover' || condition === 'Renover') coeff *= 0.75;

        const dpe = data.get('dpe');
        if (['A', 'B'].includes(dpe)) coeff *= 1.05;
        if (['F', 'G'].includes(dpe)) coeff *= 0.82;

        const vue = data.get('vue');
        if (vue === 'Dégagée') coeff *= 1.07;
        else if (vue === 'Exceptionnelle') coeff *= 1.18;
        else if (vue === 'Vis-a-vis') coeff *= 0.90;

        if (type === 'Appartement' || type === 'appartement') {
            const etage = parseInt(data.get('floorLevel')) || 0;
            const ascenseur = data.get('Ascenseur') || data.get('ascenseur');

            if (etage === 0) {
                coeff *= 0.85;
            } else if (etage >= 4) {
                if (!ascenseur || ascenseur === "Non") coeff *= 0.90;
                else coeff *= 1.05;
            }
        }

        let extras = 0;
        if (data.get('Garage') || data.get('garage')) extras += 18000;
        if (data.get('Cave') || data.get('cave')) extras += 3500;
        if (data.get('Piscine') || data.get('piscine')) extras += 30000;

        if (data.get('Balcon') || data.get('balcon')) {
            const surfaceBalconMoyenne = 6;
            extras += (surfaceBalconMoyenne * (prixM2Base * 0.35));
        }

        const prixFinal = (surface * prixM2Base * coeff) + extras;
        const lowPrice = Math.round((prixFinal * 0.94) / 1000) * 1000;
        const highPrice = Math.round((prixFinal * 1.06) / 1000) * 1000;

        const format = (p) => p.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

        // =========================================================
        // INSERTION DANS SUPABASE
        // =========================================================
        if (window.supabaseClient && window.Clerk && window.Clerk.user) {
            try {
                if (isVendrePage) {
                    const villeSelectionnee = data.get('ville') || data.get('cp') || address;
                    const prixSaisi = parseFloat(data.get('prix')) || 0;

                    const { error } = await window.supabaseClient
                        .from('properties_for_sale')
                        .insert([{
                            clerk_user_id: window.Clerk.user.id,
                            address: villeSelectionnee,
                            listing_price: prixSaisi,
                            status_step: 1,
                            status_label: 'Constitution du dossier'
                        }]);

                    if (error) throw error;
                    console.log("✅ Bien mis en vente sauvegardé dans la BDD Supabase !");
                } else {
                    const { error } = await window.supabaseClient
                        .from('estimations')
                        .insert([{
                            clerk_user_id: window.Clerk.user.id,
                            address: address,
                            property_type: type,
                            surface: surface,
                            price_min: lowPrice,
                            price_max: highPrice,
                            rooms: parseInt(data.get('rooms')) || null,
                            bedrooms: parseInt(data.get('bedrooms')) || null
                        }]);

                    if (error) throw error;
                    console.log("✅ Estimation sauvegardée dans la BDD Supabase !");
                }
            } catch (err) {
                console.error("❌ Erreur lors de l'insertion dans Supabase :", err);
            }
        } else if (!window.Clerk || !window.Clerk.user) {
            console.log("Attention : Vous n'êtes pas connecté. Votre demande ne sera pas liée à l'espace client.");
        }

        const allParams = {
            email: data.get('email'),
            phone: data.get('phone'),
            address: address,
            low_price: format(lowPrice),
            high_price: format(highPrice),
            property_type: type,
            surface: surface,
            rooms: data.get('rooms'),
            bedrooms: data.get('bedrooms'),
            year: data.get('year') || "Non précisée",
            dpe: data.get('dpe') || "Inconnu",
            condition: condition,
            vue: vue,
            floor: data.get('floorLevel') || "N/A",
            garage: check('Garage') !== "❌" ? check('Garage') : check('garage'),
            piscine: check('Piscine') !== "❌" ? check('Piscine') : check('piscine'),
            jardin: check('Jardin') !== "❌" ? check('Jardin') : check('jardin'),
            balcon: check('Balcon') !== "❌" ? check('Balcon') : check('balcon'),
            cave: check('Cave') !== "❌" ? check('Cave') : check('cave'),
            ascenseur: check('Ascenseur') !== "❌" ? check('Ascenseur') : check('ascenseur')
        };

        if (typeof emailjs !== 'undefined') {
            emailjs.send("service_zr2ihqm", "template_yjrnk9t", allParams);
            emailjs.send("service_zr2ihqm", "template_j6mtlqm", allParams)
                .then(() => console.log('Les deux mails ont été envoyés !'))
                .catch(err => console.error("Erreur envoi agent:", err));
        }

        setTimeout(() => {
            if (!isVendrePage && !isAchat) {
                const extrasArray = [
                    (data.get('Garage') || data.get('garage')) ? 'Garage/Parking' : '',
                    (data.get('Piscine') || data.get('piscine')) ? 'Piscine' : '',
                    (data.get('Jardin') || data.get('jardin')) ? 'Jardin' : '',
                    (data.get('Balcon') || data.get('balcon')) ? 'Balcon/Terrasse' : '',
                    (data.get('Cave') || data.get('cave')) ? 'Cave' : '',
                    (data.get('Ascenseur') || data.get('ascenseur')) ? 'Ascenseur' : ''
                ].filter(Boolean).join(', ');

                const paramsUrl = new URLSearchParams({
                    address: address,
                    type: type,
                    surface: surface,
                    rooms: data.get('rooms'),
                    bedrooms: data.get('bedrooms'),
                    condition: condition,
                    dpe: data.get('dpe') || 'Non précisé',
                    year: data.get('year') || 'Non précisée',
                    vue: vue || 'Standard',
                    extras: extrasArray || 'Aucun équipement spé.'
                });
                window.location.href = `votre-estimation.html?${paramsUrl.toString()}`;
            } else {
                const paramsUrl = new URLSearchParams({
                    email: data.get('email'),
                    phone: data.get('phone'),
                    projet: isVendrePage ? 'vente' : 'achat'
                });
                window.location.href = `contact.html?${paramsUrl.toString()}#grid`;
            }
        }, 2500);
    }
}

// ==========================================
// INITIALISATION DOM ET EVENEMENTS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {

    // Initialisation du formulaire d'estimation
    new window.EstimationTool();

    // Menu Hamburger
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const closeMenuBtn = document.getElementById('close-menu-btn');
    const navContent = document.getElementById('nav-content');
    const body = document.body;

    if (hamburgerBtn && navContent) {
        hamburgerBtn.addEventListener('click', () => {
            navContent.classList.add('active');
            body.classList.add('menu-open');
        });
    }
    if (closeMenuBtn && navContent) {
        closeMenuBtn.addEventListener('click', () => {
            navContent.classList.remove('active');
            body.classList.remove('menu-open');
        });
    }

    // ── Fermeture au clic sur l'overlay (voile extérieur) ──────────
    document.addEventListener('click', (e) => {
        const navContent = document.getElementById('nav-content');
        const hamburgerBtn = document.getElementById('hamburger-btn');

        // Si le menu est ouvert ET que le clic est en dehors du drawer ET en dehors du bouton hamburger
        if (
            navContent &&
            navContent.classList.contains('active') &&
            !navContent.contains(e.target) &&
            !hamburgerBtn.contains(e.target)
        ) {
            navContent.classList.remove('active');
            document.body.classList.remove('menu-open');
        }
    });
    // ───────────────────────────────────────────────────────────────

    // FAQ Accordéon
    document.querySelectorAll('.faq-question').forEach(question => {
        question.addEventListener('click', function () {
            const item = this.parentElement;
            const isActive = item.classList.contains('active');
            document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));
            if (!isActive) item.classList.add('active');
        });
    });

    // Gestion de la page de contact et du toast
    if (window.location.pathname.includes('contact.html')) {
        const urlParams = new URLSearchParams(window.location.search);

        if (urlParams.has('projet')) {
            document.querySelectorAll('h1, h2, h3').forEach(h => {
                if (h.textContent.includes('Écrivez-nous') || h.textContent.includes('Ecrivez-nous')) {
                    h.textContent = 'Votre demande a bien été envoyée.';
                }
            });

            document.querySelectorAll('p').forEach(p => {
                if (p.textContent.includes('Un projet de vente') || p.textContent.includes('estimation')) {
                    p.textContent = 'Une question ou demande particulière ? Laissez-nous un message.';
                }
            });

            if (urlParams.has('email')) {
                const emailField = document.querySelector('input[type="email"]');
                if (emailField) emailField.value = urlParams.get('email');
            }
            if (urlParams.has('phone')) {
                const phoneField = document.querySelector('input[type="tel"]');
                if (phoneField) phoneField.value = urlParams.get('phone');
            }

            const toast = document.createElement('div');
            toast.innerHTML = '<i class="fas fa-check-circle"></i> Demande envoyée avec succès !';

            Object.assign(toast.style, {
                position: 'fixed',
                top: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: '#10B981',
                color: 'white',
                padding: '12px 24px',
                borderRadius: '50px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontWeight: '600',
                fontSize: '15px',
                zIndex: '99999',
                opacity: '0',
                transition: 'all 0.4s ease'
            });

            document.body.appendChild(toast);

            setTimeout(() => {
                toast.style.opacity = '1';
                toast.style.top = '40px';
            }, 100);

            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.top = '20px';
                setTimeout(() => toast.remove(), 400);
            }, 5000);
        }
    }
});


// ==========================================
// GESTIONNAIRE DE COOKIES (Bandeau RGPD Fonctionnel)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const consent = localStorage.getItem('estimez_cookie_consent');

    if (consent === 'all') {
        loadOptionalScripts();
    }

    if (!consent) {
        initCookieBanner();
    }
});

function initCookieBanner() {
    const banner = document.createElement('div');
    banner.className = 'cookie-banner';
    banner.innerHTML = `
        <h3><i class="fas fa-cookie-bite" style="color: #F59E0B;"></i> Respect de votre vie privée</h3>
        <p>Nous utilisons des cookies "essentiels" pour la connexion à votre espace. Nous souhaitons également utiliser des cookies optionnels pour analyser notre trafic de façon anonyme. Vous avez le choix !</p>
        <div class="cookie-btns">
            <button class="cookie-btn reject" id="cookie-reject">Refuser</button>
            <button class="cookie-btn accept" id="cookie-accept">Tout accepter</button>
        </div>
    `;

    document.body.appendChild(banner);

    setTimeout(() => {
        banner.classList.add('show');
    }, 800);

    document.getElementById('cookie-accept').addEventListener('click', () => {
        localStorage.setItem('estimez_cookie_consent', 'all');
        banner.classList.remove('show');
        loadOptionalScripts();
        setTimeout(() => banner.remove(), 500);
    });

    document.getElementById('cookie-reject').addEventListener('click', () => {
        localStorage.setItem('estimez_cookie_consent', 'essential_only');
        banner.classList.remove('show');
        setTimeout(() => banner.remove(), 500);
    });
}

function loadOptionalScripts() {
    console.log("✅ Consentement accordé : Chargement des cookies de suivi et statistiques.");
}


// ==========================================
// GESTION DES FORMULAIRES D'AUTHENTIFICATION AVANT CLERK INIT
// ==========================================
// On attache ces événements immédiatement au DOMContentLoaded pour garantir 
// que les formulaires ne se soumettent pas dans le vide, même si l'API Clerk échoue.
document.addEventListener('DOMContentLoaded', () => {

    // --- CONNEXION ---
    const loginForm = document.getElementById('clerk-login-form');
    if (loginForm) {
        const errorDiv = document.getElementById('error-message');

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            errorDiv.textContent = '';

            // Si Clerk n'a pas pu se charger (par exemple, erreur d'origine en localhost)
            if (!window.Clerk || !window.Clerk.client) {
                errorDiv.textContent = "Le service d'authentification est indisponible en environnement local sans clé de test.";
                return;
            }

            const submitBtn = loginForm.querySelector('.btn-submit');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Connexion...';
            submitBtn.disabled = true;

            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            try {
                const result = await window.Clerk.client.signIn.create({
                    identifier: email,
                    password: password,
                });
                if (result.status === 'complete') {
                    await window.Clerk.setActive({ session: result.createdSessionId });
                    window.location.href = new URL('index.html', window.location.href).href;
                } else {
                    errorDiv.textContent = "Une vérification supplémentaire est requise (2FA).";
                }
            } catch (err) {
                let errMsg = err.errors && err.errors[0] ? err.errors[0].longMessage : 'Identifiants incorrects.';
                if (errMsg.includes("couldn't find your account")) errMsg = "Cette adresse e-mail n'existe pas.";
                if (errMsg.includes("incorrect")) errMsg = "Le mot de passe est incorrect.";
                errorDiv.textContent = errMsg;
            } finally {
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
        });

        // Mot de passe oublié
        const btnForgot = document.getElementById('btn-forgot-password');
        const step1 = document.getElementById('login-step-1');
        const stepCode = document.getElementById('login-step-forgot-code');
        const stepReset = document.getElementById('login-step-forgot-reset');
        const formTitle = document.getElementById('form-title');

        if (btnForgot) {
            btnForgot.addEventListener('click', async (e) => {
                e.preventDefault();
                errorDiv.textContent = '';
                const emailInput = document.getElementById('email');

                if (!emailInput.value || !emailInput.checkValidity()) {
                    errorDiv.textContent = "Veuillez d'abord saisir une adresse e-mail valide dans le champ ci-dessus.";
                    emailInput.focus();
                    return;
                }

                if (!window.Clerk || !window.Clerk.client) {
                    errorDiv.textContent = "Le service est indisponible en local.";
                    return;
                }

                const origText = btnForgot.textContent;
                btnForgot.textContent = "Envoi...";

                try {
                    const result = await window.Clerk.client.signIn.create({
                        identifier: emailInput.value
                    });

                    const emailFactor = result.supportedFirstFactors.find(f => f.strategy === 'reset_password_email_code');
                    if (!emailFactor) throw new Error("Récupération impossible pour cet e-mail.");

                    await window.Clerk.client.signIn.prepareFirstFactor({
                        strategy: 'reset_password_email_code',
                        emailAddressId: emailFactor.emailAddressId
                    });

                    step1.classList.remove('active');
                    stepCode.classList.add('active');
                    formTitle.textContent = "Vérifiez vos e-mails";

                } catch (err) {
                    let errMsg = err.errors?.[0]?.longMessage || "Erreur lors de l'envoi.";
                    if (errMsg.includes("couldn't find your account")) errMsg = "Cette adresse e-mail n'existe pas.";
                    errorDiv.textContent = errMsg;
                } finally {
                    btnForgot.textContent = origText;
                }
            });
        }

        const btnVerifyReset = document.getElementById('btn-verify-reset');
        if (btnVerifyReset) {
            btnVerifyReset.addEventListener('click', async () => {
                errorDiv.textContent = '';
                const code = document.getElementById('reset-code').value;
                if (!code) { errorDiv.textContent = "Veuillez entrer le code de vérification."; return; }

                const origText = btnVerifyReset.textContent;
                btnVerifyReset.textContent = "Vérification...";
                try {
                    await window.Clerk.client.signIn.attemptFirstFactor({
                        strategy: 'reset_password_email_code',
                        code: code
                    });
                    stepCode.classList.remove('active');
                    stepReset.classList.add('active');
                    formTitle.textContent = "Nouveau mot de passe";
                } catch (err) {
                    errorDiv.textContent = "Le code est incorrect ou a expiré.";
                } finally {
                    btnVerifyReset.textContent = origText;
                }
            });
        }

        const btnSavePwd = document.getElementById('btn-save-new-password');
        if (btnSavePwd) {
            btnSavePwd.addEventListener('click', async () => {
                errorDiv.textContent = '';
                const newPwd = document.getElementById('new-password').value;
                if (!newPwd) { errorDiv.textContent = "Veuillez entrer un mot de passe valide."; return; }

                const origText = btnSavePwd.textContent;
                btnSavePwd.textContent = "Enregistrement...";
                try {
                    const result = await window.Clerk.client.signIn.resetPassword({
                        password: newPwd
                    });
                    if (result.status === 'complete') {
                        await window.Clerk.setActive({ session: result.createdSessionId });
                        window.location.href = new URL('index.html', window.location.href).href;
                    }
                } catch (err) {
                    let errMsg = err.errors?.[0]?.longMessage || "Erreur de réinitialisation.";
                    if (errMsg.includes("password")) errMsg = "Le mot de passe n'est pas assez fort (8 caractères min).";
                    errorDiv.textContent = errMsg;
                    btnSavePwd.textContent = origText;
                }
            });
        }

        const btnBackLogin = document.getElementById('btn-back-to-login');
        if (btnBackLogin) {
            btnBackLogin.addEventListener('click', () => {
                errorDiv.textContent = '';
                stepCode.classList.remove('active');
                step1.classList.add('active');
                formTitle.textContent = "Bon retour parmi nous !";
            });
        }

        const googleBtn = document.getElementById('btn-google');
        if (googleBtn) {
            googleBtn.addEventListener('click', async () => {
                if (!window.Clerk || !window.Clerk.client) {
                    errorDiv.textContent = "Le service SSO est indisponible en local.";
                    return;
                }
                try {
                    await window.Clerk.client.signIn.authenticateWithRedirect({
                        strategy: "oauth_google",
                        redirectUrl: new URL('sso-callback.html', window.location.href).href,
                        redirectUrlComplete: new URL('index.html', window.location.href).href,
                    });
                } catch (err) {
                    errorDiv.textContent = "Erreur de connexion avec Google.";
                }
            });
        }
    }

    // --- INSCRIPTION ---
    const regForm = document.getElementById('clerk-register-form');
    if (regForm) {
        const step1 = document.getElementById('reg-step-1');
        const step2 = document.getElementById('reg-step-2');
        const step3 = document.getElementById('reg-step-3');

        const btnNext = document.getElementById('btn-next');
        const btnBack = document.getElementById('btn-back');
        const googleBtnReg = document.getElementById('reg-btn-google');
        const errorDivReg = document.getElementById('reg-error-message');
        const formTitle = document.getElementById('form-title');

        if (googleBtnReg) {
            googleBtnReg.addEventListener('click', async () => {
                if (!window.Clerk || !window.Clerk.client) {
                    errorDivReg.textContent = "Le service SSO est indisponible en local.";
                    return;
                }
                try {
                    await window.Clerk.client.signIn.authenticateWithRedirect({
                        strategy: "oauth_google",
                        redirectUrl: new URL('sso-callback.html', window.location.href).href,
                        redirectUrlComplete: new URL('index.html', window.location.href).href,
                    });
                } catch (err) {
                    errorDivReg.textContent = "Erreur de connexion avec Google.";
                }
            });
        }

        btnNext.addEventListener('click', () => {
            const prenom = document.getElementById('prenom');
            const nom = document.getElementById('nom');
            const email = document.getElementById('email');

            if (!prenom.checkValidity() || !nom.checkValidity() || !email.checkValidity()) {
                regForm.reportValidity();
                return;
            }

            errorDivReg.textContent = "";
            step1.classList.remove('active');
            step2.classList.add('active');
        });

        btnBack.addEventListener('click', () => {
            errorDivReg.textContent = "";
            step2.classList.remove('active');
            step1.classList.add('active');
        });

        regForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            errorDivReg.textContent = "";

            if (!window.Clerk || !window.Clerk.client) {
                errorDivReg.textContent = "Le service d'inscription est indisponible en environnement local sans clé de test.";
                return;
            }

            if (step2.classList.contains('active')) {
                const prenom = document.getElementById('prenom').value;
                const nom = document.getElementById('nom').value;
                const email = document.getElementById('email').value;
                const password = document.getElementById('password').value;
                const confirmPassword = document.getElementById('confirm-password').value;
                const terms = document.getElementById('terms').checked;

                if (password !== confirmPassword) {
                    errorDivReg.textContent = "Les mots de passe ne correspondent pas.";
                    return;
                }
                if (!terms) {
                    errorDivReg.textContent = "Veuillez accepter les CGU.";
                    return;
                }

                const submitBtnReg = document.getElementById('btn-submit-reg');
                const origText = submitBtnReg.textContent;
                submitBtnReg.textContent = "Création en cours...";
                submitBtnReg.disabled = true;

                try {
                    await window.Clerk.client.signUp.create({
                        firstName: prenom,
                        lastName: nom,
                        emailAddress: email,
                        password: password
                    });

                    await window.Clerk.client.signUp.prepareEmailAddressVerification();

                    formTitle.textContent = "Vérifiez votre e-mail";
                    document.getElementById('reg-footer').style.display = 'none';
                    step2.classList.remove('active');
                    step3.classList.add('active');

                } catch (err) {
                    let errMsg = err.errors && err.errors[0] ? err.errors[0].longMessage : "Une erreur est survenue.";
                    if (errMsg.includes("already exists")) errMsg = "Cette adresse e-mail est déjà utilisée.";
                    if (errMsg.includes("password")) errMsg = "Le mot de passe n'est pas assez fort.";
                    errorDivReg.textContent = errMsg;
                } finally {
                    submitBtnReg.textContent = origText;
                    submitBtnReg.disabled = false;
                }
            }

            else if (step3.classList.contains('active')) {
                const code = document.getElementById('code-verification').value;

                if (!code) {
                    errorDivReg.textContent = "Veuillez entrer le code à 6 chiffres.";
                    return;
                }

                const verifyBtn = document.getElementById('btn-verify');
                const origText = verifyBtn.textContent;
                verifyBtn.textContent = "Vérification...";
                verifyBtn.disabled = true;

                try {
                    const completeSignUp = await window.Clerk.client.signUp.attemptEmailAddressVerification({
                        code: code
                    });

                    if (completeSignUp.status === 'complete') {
                        await window.Clerk.setActive({ session: completeSignUp.createdSessionId });
                        window.location.href = new URL('index.html', window.location.href).href;
                    } else {
                        errorDivReg.textContent = "Vérification incomplète, veuillez réessayer.";
                    }
                } catch (err) {
                    errorDivReg.textContent = "Code incorrect ou expiré. Vérifiez vos e-mails.";
                } finally {
                    verifyBtn.textContent = origText;
                    verifyBtn.disabled = false;
                }
            }
        });
    }
});


// ==========================================
// LOGIQUE CLERK (AVEC GESTION DU CACHE SOLIDE ET ZÉRO FOUC)
// ==========================================
var clerkInterval = setInterval(async () => {
    if (window.Clerk) {
        clearInterval(clerkInterval);

        try {
            await window.Clerk.load({
                appearance: {
                    variables: {
                        colorPrimary: '#6C83D9',
                        colorBackground: '#FFFFFF',
                        colorText: '#2E3F84',
                        colorTextSecondary: '#6B7280',
                        colorDanger: '#EF4444',
                        colorSuccess: '#10B981',
                        borderRadius: '12px',
                        fontFamily: "'Inter', sans-serif"
                    },
                    elements: {
                        userButtonAvatarBox: { width: '25.76px', height: '25.76px' },

                        userButtonPopoverCard: {
                            right: '50vh !important',
                            transform: 'translateX(0) !important'
                        },

                        navbar: { height: 0 },

                        // --- MODIFICATION ICI POUR LE BUREAU ---
                        modalContent: {
                            maxWidth: '100vh',
                            width: '100vw',
                            height: '85vh',
                            margin: 'auto !important', /* Le !important force le centrage au milieu du voile gris */
                            position: 'relative !important', /* On annule les positions fixes/absolues calculées par Clerk */
                            inset: 'auto !important', /* Nettoie les 'top' et 'left' injectés par le JS de Clerk */
                            transform: 'none !important', /* Nettoie la translation */
                            boxShadow: '0 25px 50px -12px rgba(46, 63, 132, 0.25)'
                        },

                        /* Le conteneur parent (voile gris) doit être un flex center */
                        modalBackdrop: {
                            display: 'flex !important',
                            alignItems: 'center !important',
                            justifyContent: 'center !important'
                        },
                        // ----------------------------------------

                        cardBox: { width: '100%', height: '100%', boxShadow: 'none' },
                        scrollBox: { borderRadius: '0 20px 20px 0', height: '100%' },
                        navbar: { height: '100%', background: '#FAFBFE', borderRight: '1px solid #E3E8F5', padding: '20px 15px', borderRadius: '20px 0 0 20px' },

                        navbarButton: { borderRadius: '10px', color: '#6B7280', padding: '12px 15px', marginBottom: '5px' },
                        navbarButton__active: { backgroundColor: '#EEF2FF', color: '#6C83D9', fontWeight: '600' },
                        headerTitle: { color: '#2E3F84', fontSize: '22px', fontWeight: '800' },
                        profileSectionTitleText: { color: '#2E3F84', fontWeight: '700', borderBottom: '1px solid #E3E8F5', paddingBottom: '10px', marginBottom: '15px' },
                        formButtonPrimary: { backgroundColor: '#6C83D9', color: '#fff', borderRadius: '50px', padding: '10px 24px', textTransform: 'none', fontWeight: '600', boxShadow: 'none', "&:hover": { backgroundColor: '#566DBA' } },
                        profileSectionPrimaryButton: { color: '#6C83D9', fontWeight: '600', "&:hover": { backgroundColor: '#EEF2FF', borderRadius: '10px' } },
                        badge: { backgroundColor: '#EEF2FF', color: '#6C83D9', fontWeight: '600', borderRadius: '50px' },
                        userButtonPopoverActionButton: { borderRadius: '10px', "&:hover": { backgroundColor: '#EEF2FF' } },
                        userButtonPopoverActionButtonText: { color: '#2E3F84', fontWeight: '600' },
                        userButtonPopoverActionButtonIcon: { color: '#6C83D9' },
                        userPreviewMainIdentifier: { color: '#2E3F84', fontWeight: '700' },
                        userPreviewSecondaryIdentifier: { color: '#6B7280' }
                    }
                },
                localization: {
                    userButton: { action__manageAccount: "Gérer le compte", action__signOut: "Se déconnecter" },
                    userProfile: {
                        navbar: { title: "Compte", description: "Gérez les informations de votre compte.", account: "Profil", security: "Sécurité" },
                        start: {
                            headerTitle__account: "Détails du profil",
                            headerTitle__security: "Sécurité",
                            profileSection: { title: "Profil", primaryButton: "Mettre à jour le profil" },
                            emailAddressesSection: { title: "Adresses e-mail", primaryButton: "Ajouter une adresse e-mail", detailsAction__primary: "Principale", detailsAction__nonPrimary: "Définir comme principale", detailsAction__remove: "Supprimer" },
                            connectedAccountsSection: { title: "Comptes connectés", primaryButton: "Connecter un compte", action__connect: "Connecter", action__disconnect: "Déconnecter" },
                            passwordSection: { title: "Mot de passe", primaryButton: "Modifier le mot de passe" },
                            dangerSection: { title: "Zone de danger", deleteAccountTitle: "Supprimer le compte", deleteAccountDescription: "Supprimez définitivement votre compte et toutes vos données.", deleteAccountButton: "Supprimer le compte" }
                        },
                        profilePage: { title: "Modifier le profil", imageFormTitle: "Photo de profil", imageFormSubtitle: "Mettez à jour votre photo." },
                        securityPage: { title: "Sécurité" },
                        formButtonPrimary: "Enregistrer",
                        formButtonReset: "Annuler"
                    },
                    badge__primary: "Principal",
                    badge__unverified: "Non vérifié"
                }
            });

            if (window.Clerk.user) {
                /* MODIFICATION ICI */
                const styleId = 'fix-clerk-userpopover-position';
                if (!document.getElementById(styleId)) {
                    const styleElem = document.createElement('style');
                    styleElem.id = styleId;
                    styleElem.textContent = `
                        .cl-userButtonPopoverCard,
                        .cl-userButtonPopover {
                            right: 90px !important;
                            margin-top: 8px !important;
                        }
                    `;
                    document.head.appendChild(styleElem);
                }

                const user = window.Clerk.user;

                if (window.supabaseClient) {
                    window.supabaseClient.from('profiles').upsert({
                        id: user.id,
                        email: user.primaryEmailAddress?.emailAddress,
                        first_name: user.firstName,
                        last_name: user.lastName,
                        updated_at: new Date()
                    }).then(({ error }) => { if (error) console.error("Erreur synchro profil:", error); });
                }

                if (window.location.pathname.includes('connexion.html') || window.location.pathname.includes('inscription.html')) {
                    window.location.href = new URL('index.html', window.location.href).href;
                    return;
                }

                // --- MISE A JOUR DU CACHE ET DE L'UI ---
                const role = (window.Clerk.user?.publicMetadata?.role || window.Clerk.user?.unsafeMetadata?.role || '').toString().toLowerCase();
                const isAdmin = role === 'admin';

                localStorage.setItem('clerk_auth_state', 'logged_in');
                localStorage.setItem('clerk_auth_role', isAdmin ? 'admin' : 'client');

                document.documentElement.classList.add('is-logged-in');
                document.documentElement.classList.remove('is-logged-out');

                document.querySelectorAll('.nav-espace-link').forEach(link => {
                    link.textContent = 'Mon espace';
                    link.classList.remove('espace-disabled');
                    link.classList.add('espace-active');
                    link.setAttribute('href', isAdmin ? 'admin.html' : 'client.html');
                });

                const desktopBtn = document.getElementById('user-button-desktop');
                if (desktopBtn && !desktopBtn.hasChildNodes()) {
                    window.Clerk.mountUserButton(desktopBtn, { afterSignOutUrl: new URL('index.html', window.location.href).href });
                }

                // ── Bloc profil mobile custom ──────────────────────────────
                const mobileBtn = document.getElementById('user-button-mobile');
                if (mobileBtn && !mobileBtn.hasChildNodes()) {
                    // On monte l'avatar Clerk (pointer-events: none côté CSS,
                    // le clic est capturé par le bloc parent)
                    window.Clerk.mountUserButton(mobileBtn, {
                        afterSignOutUrl: new URL('index.html', window.location.href).href
                    });
                }

                // Injecte le nom complet dans le drawer
                const profileName = document.getElementById('mobile-profile-name');
                if (profileName && window.Clerk.user) {
                    const u = window.Clerk.user;
                    const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.primaryEmailAddress?.emailAddress || 'Mon compte';
                    profileName.textContent = fullName;
                }

                // Toggle du dropdown inversé
                const profileBlock = document.getElementById('mobile-profile-block');
                const manageBtn = document.getElementById('mobile-manage-account');
                const signOutBtn = document.getElementById('mobile-sign-out');

                // ─────────────────────────────────────────────────────────────
                if (window.location.pathname.includes('client.html')) {
                    loadClientDashboard(window.Clerk.user.id);
                }

            } else {
                // --- UTILISATEUR DÉCONNECTÉ ---
                localStorage.setItem('clerk_auth_state', 'logged_out');
                localStorage.removeItem('clerk_auth_role');

                document.documentElement.classList.add('is-logged-out');
                document.documentElement.classList.remove('is-logged-in');

                document.querySelectorAll('.nav-espace-link').forEach(link => {
                    link.textContent = 'Mon espace';
                    link.classList.add('espace-disabled');
                    link.classList.remove('espace-active');
                    link.setAttribute('href', 'connexion.html');
                });
            }
        } catch (error) {
            console.error("Erreur de chargement Clerk :", error);
        }
    }
}, 50);

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(reg => {
            console.log('PWA Service Worker enregistré !');
        }).catch(err => {
            console.log('Erreur SW:', err);
        });
    });
}