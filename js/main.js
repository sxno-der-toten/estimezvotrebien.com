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

        // Affichage Appartement ou Maison
        const typeRadios = document.querySelectorAll('input[name="propertyType"]');
        typeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                const isAppart = e.target.value === 'appartement';
                const appartFields = document.getElementById('appartementFields');
                if (appartFields) appartFields.style.display = isAppart ? 'block' : 'none';

                document.querySelectorAll('.maison-only').forEach(el => el.style.display = isAppart ? 'none' : 'flex');
                document.querySelectorAll('.appartement-only').forEach(el => el.style.display = isAppart ? 'flex' : 'none');

                this.validateStep();
            });
        });

        // Validation temps réel
        this.form.querySelectorAll('input, select').forEach(input => {
            input.addEventListener('input', () => this.validateStep());
            input.addEventListener('change', () => this.validateStep());
        });
    }

    // --- AUTOCOMPLÉTION ---
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
                            // CORRECTION MOBILE : mousedown et touchstart pour éviter la perte de focus qui casse l'action
                            ['mousedown', 'touchstart'].forEach(eventType => {
                                li.addEventListener(eventType, (ev) => {
                                    ev.preventDefault(); // Bloque la perte de focus du clavier
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
            // CORRECTION MOBILE : Ne pas fermer si on touche aux suggestions
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

        // ANIMATION CENTRAGE
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

    submitForm(e) {
        e.preventDefault();
        if (!this.validateStep()) return;

        // 1. Animation de chargement
        if (this.wrapper) this.wrapper.classList.remove('expanded');
        if (this.form) this.form.style.display = 'none';
        const loadingSimulation = document.getElementById('loadingSimulation');
        if (loadingSimulation) loadingSimulation.style.display = 'block';

        // 2. RÉCUPÉRATION DES DONNÉES
        const data = new FormData(this.form);
        const address = data.get('address') || "";
        const addrLower = address.toLowerCase();
        const surface = parseFloat(data.get('surface')) || 0;
        const type = data.get('propertyType');

        // Helper pour les checkboxes (Oui/Non)
        const check = (name) => data.get(name) ? "✅" : "❌";

        // 3. BASE DE PRIX AU M2
        let prixM2Base = 3000; // Moyenne France
        // On vérifie en minuscules car addrLower convertit l'adresse en minuscules
        if (addrLower.includes('paris')) prixM2Base = 10500;
        else if (addrLower.includes('lyon')) prixM2Base = 5200;
        else if (addrLower.includes('bordeaux')) prixM2Base = 4800;
        else if (addrLower.includes('orleans')) prixM2Base = 3100;
        else if (addrLower.includes('toulouse')) prixM2Base = 3900;
        else if (addrLower.includes('nice')) prixM2Base = 5700;

        // 4. CALCUL DU SCORE EXPERT (Coefficients multipliés en cascade)
        let coeff = 1.0;

        // État général
        const condition = data.get('condition');
        if (condition === 'Excellent') coeff *= 1.12;       // +12%
        else if (condition === 'Bon') coeff *= 1.0;         // Neutre
        else if (condition === 'Rafraîchir') coeff *= 0.90; // -10%
        else if (condition === 'À rénover') coeff *= 0.75;  // -25%

        // Performance énergétique (DPE)
        const dpe = data.get('dpe');
        if (['A', 'B'].includes(dpe)) coeff *= 1.05; // +5% (Prime verte)
        if (['F', 'G'].includes(dpe)) coeff *= 0.82; // -18% (Malus passoire)

        // Environnement (Vue)
        const vue = data.get('vue');
        if (vue === 'Dégagée') coeff *= 1.07;
        else if (vue === 'Exceptionnelle') coeff *= 1.18;
        else if (vue === 'Vis-a-vis') coeff *= 0.90;

        // Étage & Ascenseur (Spécifique Appartement)
        if (type === 'Appartement' || type === 'appartement') {
            const etage = parseInt(data.get('floorLevel')) || 0;
            // Sécurité : je vérifie la majuscule ET la minuscule au cas où ton HTML change
            const ascenseur = data.get('Ascenseur') || data.get('ascenseur');

            if (etage === 0) {
                coeff *= 0.85; // Malus très fort pour le RDC
            } else if (etage >= 4) {
                if (!ascenseur) coeff *= 0.90; // Malus 4ème sans ascenseur
                else coeff *= 1.05; // Bonus étage élevé AVEC ascenseur
            }
        }

        // 5. AJOUTS FORFAITAIRES (Valeur marché des équipements)
        let extras = 0;
        if (data.get('Garage') || data.get('garage')) extras += 18000;
        if (data.get('Cave') || data.get('cave')) extras += 3500;
        if (data.get('Piscine') || data.get('piscine')) extras += 30000;

        // Pondération pro : un balcon ne vaut pas 100% du m2 intérieur, mais environ 35%
        if (data.get('Balcon') || data.get('balcon')) {
            const surfaceBalconMoyenne = 6;
            extras += (surfaceBalconMoyenne * (prixM2Base * 0.35));
        }

        // 6. CALCUL FINAL DU PRIX
        // Formule : (Surface * Prix_M2_De_Base * Tous_Les_Coefficients) + Les_Extras_Fixes
        const prixFinal = (surface * prixM2Base * coeff) + extras;

        // Création d'une fourchette réaliste (+/- 6%)
        const lowPrice = Math.round((prixFinal * 0.94) / 1000) * 1000;
        const highPrice = Math.round((prixFinal * 1.06) / 1000) * 1000;

        const format = (p) => p.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

        // 7. PRÉPARATION DES PARAMÈTRES POUR EMAILJS
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

            // Checkboxes traduits (je vérifie majuscule ou minuscule pour te protéger de toute erreur)
            garage: check('Garage') !== "❌" ? check('Garage') : check('garage'),
            piscine: check('Piscine') !== "❌" ? check('Piscine') : check('piscine'),
            jardin: check('Jardin') !== "❌" ? check('Jardin') : check('jardin'),
            balcon: check('Balcon') !== "❌" ? check('Balcon') : check('balcon'),
            cave: check('Cave') !== "❌" ? check('Cave') : check('cave'),
            ascenseur: check('Ascenseur') !== "❌" ? check('Ascenseur') : check('ascenseur')
        };

        // 8. ENVOI DES DEUX MAILS
        if (typeof emailjs !== 'undefined') {
            // Mail au Client
            emailjs.send("service_zr2ihqm", "template_yjrnk9t", allParams);

            // Mail à l'agent
            emailjs.send("service_zr2ihqm", "template_j6mtlqm", allParams)
                .then(() => console.log('Les deux mails ont été envoyés !'))
                .catch(err => console.error("Erreur envoi agent:", err));
        }

        // 9. REDIRECTION VERS CONTACT
        setTimeout(() => {
            const isAchat = window.location.pathname.includes('acheter.html');
            const paramsUrl = new URLSearchParams({
                email: data.get('email'),
                phone: data.get('phone'),
                estimation: 'done',
                projet: isAchat ? 'achat' : 'vente' // <-- Le nouveau paramètre est ici
            });
            window.location.href = `contact.html?${paramsUrl.toString()}#grid`;
        }, 2500);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Initialiser l'outil d'estimation
    new EstimationTool();

    // Menu Burger
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

    // FAQ
    document.querySelectorAll('.faq-question').forEach(question => {
        question.addEventListener('click', function () {
            const item = this.parentElement;
            const isActive = item.classList.contains('active');
            document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));
            if (!isActive) item.classList.add('active');
        });
    });
});