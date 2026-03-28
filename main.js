// ==========================================
// CONFIGURATION SUPABASE
// ==========================================
const supabaseUrl = 'https://crswkagawmfksizojgsf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNyc3drYWdhd21ma3Npem9qZ3NmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MDgyMjAsImV4cCI6MjA5MDE4NDIyMH0.hymLWw0vjv0HW_5DX5xE9DXJdbEo_OOyjIZ9qagWRnw';

// On crée une instance claire et on la stocke globalement
if (!window.supabaseClient && window.supabase) {
    window.supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
}

// ==========================================
// FONCTION DE CHARGEMENT DU DASHBOARD CLIENT
// ==========================================
async function loadClientDashboard(userId) {
    // On vérifie que le client Supabase est bien initialisé
    if (!window.supabaseClient) {
        console.error("Supabase Client introuvable.");
        return;
    }

    try {
        // 1. Récupération du message de l'expert
        const { data: msgData, error: msgError } = await window.supabaseClient
            .from('expert_messages')
            .select('agent_name, content')
            .eq('clerk_user_id', userId)
            .maybeSingle();

        if (msgError) {
            console.error("Erreur lors de la requête expert_messages:", msgError.message);
        }

        const nameEl = document.getElementById('expert-name');
        const msgEl = document.getElementById('expert-message');

        if (msgData && nameEl && msgEl) {
            nameEl.textContent = msgData.agent_name;
            msgEl.textContent = msgData.content;
        } else if (nameEl && msgEl) {
            nameEl.textContent = "Sarah - Astella Agency";
            msgEl.textContent = "Bienvenue ! Je prépare actuellement votre dossier. N'hésitez pas à me contacter si vous avez des questions.";
        }

        // 2. Récupération des biens mis en vente (Filtré par utilisateur)
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

                // Condition pour afficher ou masquer dynamiquement la ligne de l'agent
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

        // 3. Récupération de l'historique des estimations (Filtré par utilisateur)
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
class EstimationTool {
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
            const query = e.target.value;

            if (query.length < 3) {
                if (suggestionsBox) suggestionsBox.innerHTML = '';
                this.validateStep();
                return;
            }

            timeout = setTimeout(async () => {
                try {
                    const response = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`);
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

        document.addEventListener('click', (e) => {
            if (e.target !== input && suggestionsBox && !suggestionsBox.contains(e.target)) {
                suggestionsBox.innerHTML = '';
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
            const paramsUrl = new URLSearchParams({
                email: data.get('email'),
                phone: data.get('phone'),
                projet: isVendrePage ? 'vente' : (isAchat ? 'achat' : 'estimation')
            });
            window.location.href = `contact.html?${paramsUrl.toString()}#grid`;
        }, 2500);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new EstimationTool();

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

    document.querySelectorAll('.faq-question').forEach(question => {
        question.addEventListener('click', function () {
            const item = this.parentElement;
            const isActive = item.classList.contains('active');
            document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));
            if (!isActive) item.classList.add('active');
        });
    });

    // ==========================================
    // GESTION DE LA PAGE CONTACT ET TOAST
    // ==========================================
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
                background: '#10B981', // Vert "Succès"
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
// LOGIQUE CLERK, DASHBOARD ET UI CLERK
// ==========================================
const clerkInterval = setInterval(async () => {
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
                        // --- Modale principale (Gérer le compte) ---
                        modalContent: {
                            maxWidth: '850px',
                            width: '90%',
                            height: '70vh',
                            minHeight: '500px',
                            maxHeight: '90vh',
                            margin: '0 auto',
                            borderRadius: '20px',
                            boxShadow: '0 25px 50px -12px rgba(46, 63, 132, 0.25)'
                        },
                        cardBox: {
                            width: '100%',
                            height: '100%',
                            borderRadius: '20px',
                            boxShadow: 'none'
                        },
                        scrollBox: {
                            borderRadius: '20px'
                        },
                        navbar: {
                            background: '#FAFBFE',
                            borderRight: '1px solid #E3E8F5',
                            padding: '20px 15px'
                        },
                        navbarButton: {
                            borderRadius: '10px',
                            color: '#6B7280',
                            padding: '12px 15px',
                            marginBottom: '5px'
                        },
                        navbarButton__active: {
                            backgroundColor: '#EEF2FF',
                            color: '#6C83D9',
                            fontWeight: '600'
                        },
                        headerTitle: {
                            color: '#2E3F84',
                            fontSize: '22px',
                            fontWeight: '800'
                        },
                        profileSectionTitleText: {
                            color: '#2E3F84',
                            fontWeight: '700',
                            borderBottom: '1px solid #E3E8F5',
                            paddingBottom: '10px',
                            marginBottom: '15px'
                        },
                        formButtonPrimary: {
                            backgroundColor: '#6C83D9',
                            color: '#fff',
                            borderRadius: '50px',
                            padding: '10px 24px',
                            textTransform: 'none',
                            fontWeight: '600',
                            boxShadow: 'none',
                            "&:hover": {
                                backgroundColor: '#566DBA'
                            }
                        },
                        profileSectionPrimaryButton: {
                            color: '#6C83D9',
                            fontWeight: '600',
                            "&:hover": {
                                backgroundColor: '#EEF2FF',
                                borderRadius: '10px'
                            }
                        },
                        badge: {
                            backgroundColor: '#EEF2FF',
                            color: '#6C83D9',
                            fontWeight: '600',
                            borderRadius: '50px'
                        },

                        // --- Menu déroulant de la photo de profil ---
                        userButtonPopoverActionButton: {
                            borderRadius: '10px',
                            "&:hover": {
                                backgroundColor: '#EEF2FF'
                            }
                        },
                        userButtonPopoverActionButtonText: {
                            color: '#2E3F84',
                            fontWeight: '600'
                        },
                        userButtonPopoverActionButtonIcon: {
                            color: '#6C83D9'
                        },
                        userPreviewMainIdentifier: {
                            color: '#2E3F84',
                            fontWeight: '700'
                        },
                        userPreviewSecondaryIdentifier: {
                            color: '#6B7280'
                        }
                    }
                },
                localization: {
                    userButton: {
                        action__manageAccount: "Gérer le compte",
                        action__signOut: "Se déconnecter"
                    },
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

            const desktopAuthContainer = document.getElementById('auth-container-desktop');
            if (desktopAuthContainer) {
                desktopAuthContainer.style.opacity = '1';
            }

            if (window.Clerk.user) {

                const user = window.Clerk.user;

                // On synchronise le profil avec Supabase SEULEMENT si Supabase est présent sur la page
                if (window.supabaseClient) {
                    window.supabaseClient.from('profiles').upsert({
                        id: user.id,
                        email: user.primaryEmailAddress?.emailAddress,
                        first_name: user.firstName,
                        last_name: user.lastName,
                        updated_at: new Date()
                    }).then(({ error }) => { if (error) console.error("Erreur synchro profil:", error); });
                }

                // --- UTILISATEUR CONNECTÉ ---
                if (window.location.pathname.includes('connexion.html') || window.location.pathname.includes('inscription.html')) {
                    window.location.href = 'index.html';
                    return;
                }

                // Vérification du rôle Admin pour révéler le bon texte de façon fluide
                const isAdmin = window.Clerk.user?.publicMetadata?.role === 'admin';

                document.querySelectorAll('.nav-espace-link').forEach(link => {
                    const roleSpan = link.querySelector('.nav-espace-role');
                    if (roleSpan) {
                        if (isAdmin) {
                            link.setAttribute('href', 'admin.html');
                            roleSpan.textContent = 'admin';
                        } else {
                            link.setAttribute('href', 'client.html');
                            roleSpan.textContent = 'client';
                        }
                        // Apparition en fondu après l'injection du texte
                        setTimeout(() => {
                            roleSpan.style.opacity = '1';
                        }, 50);
                    }
                });

                if (desktopAuthContainer) {
                    const userName = window.Clerk.user.fullName || window.Clerk.user.firstName || "Mon espace";
                    desktopAuthContainer.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 12px; justify-content: flex-end; width: 100%;">
                            <span style="font-size: 14px; font-weight: 600; color: #2E3F84; white-space: nowrap;">${userName}</span>
                            <div id="user-button-desktop"></div>
                        </div>
                    `;
                    window.Clerk.mountUserButton(document.getElementById('user-button-desktop'));
                }

                const mobileAuth = document.getElementById('auth-container-mobile');
                if (mobileAuth) {
                    mobileAuth.innerHTML = '<div id="user-button-mobile"></div>';
                    window.Clerk.mountUserButton(document.getElementById('user-button-mobile'));
                }

                // ==> APPEL À SUPABASE SI ON EST SUR LE DASHBOARD
                if (window.location.pathname.includes('client.html')) {
                    loadClientDashboard(window.Clerk.user.id);
                }

            } else {
                // --- UTILISATEUR DÉCONNECTÉ ---
                const loginForm = document.getElementById('clerk-login-form');
                if (loginForm) {
                    const googleBtn = document.getElementById('btn-google');
                    const errorDiv = document.getElementById('error-message');
                    const formTitle = document.getElementById('form-title');

                    const btnForgot = document.getElementById('btn-forgot-password');
                    const step1 = document.getElementById('login-step-1');
                    const stepCode = document.getElementById('login-step-forgot-code');
                    const stepReset = document.getElementById('login-step-forgot-reset');

                    loginForm.addEventListener('submit', async (e) => {
                        e.preventDefault();
                        errorDiv.textContent = '';

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
                                window.location.href = 'index.html';
                            } else {
                                errorDiv.textContent = "Une vérification supplémentaire est requise (2FA).";
                            }
                        } catch (err) {
                            let errMsg = err.errors[0]?.longMessage || 'Identifiants incorrects.';
                            if (errMsg.includes("couldn't find your account")) errMsg = "Cette adresse e-mail n'existe pas.";
                            if (errMsg.includes("incorrect")) errMsg = "Le mot de passe est incorrect.";
                            errorDiv.textContent = errMsg;
                        } finally {
                            submitBtn.textContent = originalText;
                            submitBtn.disabled = false;
                        }
                    });

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
                                    window.location.href = 'index.html';
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

                    if (googleBtn) {
                        googleBtn.addEventListener('click', async () => {
                            try {
                                await window.Clerk.client.signIn.authenticateWithRedirect({
                                    strategy: "oauth_google",
                                    redirectUrl: window.location.origin + "/sso-callback.html",
                                    redirectUrlComplete: window.location.origin + "/index.html",
                                });
                            } catch (err) {
                                errorDiv.textContent = "Erreur de connexion avec Google.";
                            }
                        });
                    }
                }

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
                            try {
                                await window.Clerk.client.signIn.authenticateWithRedirect({
                                    strategy: "oauth_google",
                                    redirectUrl: window.location.origin + "/sso-callback.html",
                                    redirectUrlComplete: window.location.origin + "/index.html",
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
                                let errMsg = err.errors[0]?.longMessage || "Une erreur est survenue.";
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
                                    window.location.href = 'index.html';
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
            }
        } catch (error) {
            console.error("Erreur de chargement Clerk :", error);
        }
    }
}, 50);