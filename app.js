/**
 * Vape & Hookah Accounting System - Core Application Logic
 */

// --- Audio Feedback Synth ---
function playBeep(type = 'success') {
    if (type !== 'checkout') return; // Cancel all other sounds, only play when selling a product (checkout)
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.frequency.setValueAtTime(950, audioCtx.currentTime); // High pitch chirp
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.08);
    } catch (e) {
        console.warn("AudioContext not allowed or supported by browser policy yet.");
    }
}

// --- Visual Barcode Feedback Flash ---
function triggerBarcodeFlash() {
    const flash = document.getElementById('barcode-flash-overlay');
    if (flash) {
        flash.style.opacity = '1';
        setTimeout(() => {
            flash.style.opacity = '0';
        }, 150);
    }
}

// --- STATE MANAGEMENT ---
const AppState = {
    currentUser: null,
    basket: [],
    products: [],
    transactions: [],
    employees: [],
    reconciliations: [],
    archives: [],
    settings: {
        startingCash: 150000,
        usdExchangeRate: 1500,
        firebaseConfig: {
            apiKey: "AIzaSyAJNNEzExPYLdpjfOuo6BrTacXDnPZTS7k",
            authDomain: "yall-vape.firebaseapp.com",
            databaseURL: "https://yall-vape-default-rtdb.asia-southeast1.firebasedatabase.app",
            projectId: "yall-vape",
            storageBucket: "yall-vape.firebasestorage.app",
            messagingSenderId: "248712411874",
            appId: "1:248712411874:web:ba0d434d5f02570978fcbb",
            measurementId: "G-ZLTER4Z3Y7"
        },
        sheetsUrl: ""
    },
    
    // Initial Seed Data (if Database is Empty)
    seed() {
        // Products list
        this.products = [
            { id: "p1", barcode: "6970220311234", name: "نكهة فيب فراولة فيبريسو 60 مل", cost: 10000, price: 15000, qty: 25 },
            { id: "p2", barcode: "6971556208001", name: "شيشة إلكترونية جيك فيب L200", cost: 55000, price: 75000, qty: 8 },
            { id: "p3", barcode: "6972033481203", name: "كويل فوبو PnP-VM1 0.3 اوم", cost: 3500, price: 5000, qty: 120 },
            { id: "p4", barcode: "6291007115409", name: "معسل الفاخر تفاحتين 250 غرام", cost: 8500, price: 12000, qty: 50 },
            { id: "p5", barcode: "857945005012", name: "فحم كوكو اورث طبيعي 1 كيلو", cost: 5000, price: 8000, qty: 30 }
        ];
        
        // System Users (Managers & Cashiers)
        this.users = [
            { username: "admin", name: "أبو فهد - المدير العام", password: "admin", role: "manager", permissions: ['invoice', 'expenses', 'reports', 'monthly-reports', 'treasury', 'inventory', 'settings', 'debts'] },
            { username: "mohammed", name: "محمد علي - الكاشير", password: "1234", role: "cashier", permissions: ['invoice', 'debts'] },
            { username: "ali", name: "علي حسين - الكاشير", password: "ali", role: "cashier", permissions: ['invoice', 'debts'] }
        ];

        // Employees database for Salaries Report ledger
        this.employees = [
            { id: "e1", name: "محمد علي", salary: 600000, withdrawals: [] },
            { id: "e2", name: "علي حسين", salary: 500000, withdrawals: [] },
            { id: "e3", name: "حسن جعفر", salary: 550000, withdrawals: [] }
        ];
        
        this.transactions = [];
        this.reconciliations = [];
        this.archives = [];
        this.newProductsReport = [];
        this.debts = [];
        this.needsReconciliation = false;
        
        this.settings.cashierDiscounts = [
            { from: 60000, to: 99999999, maxDiscount: 15000 },
            { from: 35000, to: 59999, maxDiscount: 10000 },
            { from: 22000, to: 34999, maxDiscount: 5000 },
            { from: 10000, to: 21999, maxDiscount: 2000 }
        ];
        
        this.saveAll();
    },
    
    loadAll() {
        if (!localStorage.getItem('vape_db_initialized')) {
            this.seed();
            localStorage.setItem('vape_db_initialized', 'true');
        } else {
            this.products = JSON.parse(localStorage.getItem('vape_products') || '[]');
            this.users = JSON.parse(localStorage.getItem('vape_users') || '[]');
            this.employees = JSON.parse(localStorage.getItem('vape_employees') || '[]');
            this.transactions = JSON.parse(localStorage.getItem('vape_transactions') || '[]');
            this.reconciliations = JSON.parse(localStorage.getItem('vape_reconciliations') || '[]');
            this.archives = JSON.parse(localStorage.getItem('vape_archives') || '[]');
            this.newProductsReport = JSON.parse(localStorage.getItem('vape_new_products') || '[]');
            this.debts = JSON.parse(localStorage.getItem('vape_debts') || '[]');
            this.needsReconciliation = localStorage.getItem('vape_needs_reconciliation') === 'true';
            
            const savedSettings = localStorage.getItem('vape_settings');
            if (savedSettings) {
                this.settings = { ...this.settings, ...JSON.parse(savedSettings) };
                
                // Ensure cashierDiscounts exists for upgrades
                if (!this.settings.cashierDiscounts) {
                    this.settings.cashierDiscounts = [
                        { from: 60000, to: 99999999, maxDiscount: 15000 },
                        { from: 35000, to: 59999, maxDiscount: 10000 },
                        { from: 22000, to: 34999, maxDiscount: 5000 },
                        { from: 10000, to: 21999, maxDiscount: 2000 }
                    ];
                }
                
                // Ensure firebaseConfig object exists without overwriting user values
                if (!this.settings.firebaseConfig) {
                    this.settings.firebaseConfig = {
                        apiKey: "AIzaSyAJNNEzExPYLdpjfOuo6BrTacXDnPZTS7k",
                        authDomain: "yall-vape.firebaseapp.com",
                        databaseURL: "https://yall-vape-default-rtdb.asia-southeast1.firebasedatabase.app",
                        projectId: "yall-vape",
                        storageBucket: "yall-vape.firebasestorage.app",
                        messagingSenderId: "248712411874",
                        appId: "1:248712411874:web:ba0d434d5f02570978fcbb",
                        measurementId: "G-ZLTER4Z3Y7"
                    };
                }
            }
        }
    },
    
    saveAll() {
        localStorage.setItem('vape_products', JSON.stringify(this.products));
        localStorage.setItem('vape_users', JSON.stringify(this.users));
        localStorage.setItem('vape_employees', JSON.stringify(this.employees));
        localStorage.setItem('vape_transactions', JSON.stringify(this.transactions));
        localStorage.setItem('vape_reconciliations', JSON.stringify(this.reconciliations));
        localStorage.setItem('vape_archives', JSON.stringify(this.archives));
        localStorage.setItem('vape_new_products', JSON.stringify(this.newProductsReport || []));
        localStorage.setItem('vape_debts', JSON.stringify(this.debts || []));
        localStorage.setItem('vape_settings', JSON.stringify(this.settings));
        localStorage.setItem('vape_needs_reconciliation', this.needsReconciliation ? 'true' : 'false');
    }
};

// --- SYNCHRONIZATION MANAGER (Google Sheets & Firebase) ---
const SyncManager = {
    isOnline: navigator.onLine,
    
    init() {
        window.addEventListener('online', () => this.updateStatus(true));
        window.addEventListener('offline', () => this.updateStatus(false));
        this.updateStatus(navigator.onLine);
        this.initFirebase();
    },
    
    updateStatus(online) {
        this.isOnline = online;
        const dot = document.getElementById('sync-dot');
        const text = document.getElementById('sync-text');
        
        if (dot && text) {
            if (online) {
                dot.className = 'sync-dot online';
                text.innerText = 'متصل سحابياً';
            } else {
                dot.className = 'sync-dot offline';
                text.innerText = 'يعمل بدون اتصال (مؤقت)';
            }
        }
    },

    // Dynamic Firebase initialization if configuration exists
    initFirebase() {
        const conf = AppState.settings.firebaseConfig;
        if (conf && conf.projectId && typeof firebase !== 'undefined') {
            try {
                if (!firebase.apps.length) {
                    firebase.initializeApp(conf);
                }
                this.firestore = firebase.firestore();
                try {
                    this.firestore.settings({
                        experimentalForceLongPolling: true
                    });
                    console.log("Firebase Firestore Initialized and configured with experimentalForceLongPolling successfully.");
                } catch (settingsErr) {
                    console.warn("Firestore settings could not be applied (likely already initialized):", settingsErr);
                }
            } catch (err) {
                console.error("Firebase init failed: ", err);
            }
        }
    },
    
    // Sync single entity to Google Sheets
    async syncToSheets(type, payload) {
        const sheetsUrl = AppState.settings.sheetsUrl;
        if (!sheetsUrl) return false;
        
        try {
            const response = await fetch(sheetsUrl, {
                method: "POST",
                mode: "no-cors", // Required for Google Apps Script Web Apps when redirecting
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ syncType: type, payload: payload })
            });
            return true;
        } catch (error) {
            console.error("Sheets Sync Error: ", error);
            return false;
        }
    },
    
    // Sync entity to Firebase Firestore
    async syncToFirebase(collectionName, docId, data) {
        if (!this.firestore) return false;
        try {
            // Firestore cannot save raw arrays, so we wrap them in an object
            let firestoreData = data;
            if (Array.isArray(data)) {
                firestoreData = { items: data };
            }
            await this.firestore.collection(collectionName).doc(docId).set(firestoreData);
            return true;
        } catch (error) {
            console.error("Firebase Sync Error: ", error);
            return false;
        }
    },

    // Delete entity from Firebase Firestore
    async deleteFromFirebase(collectionName, docId) {
        if (!this.firestore) return false;
        try {
            await this.firestore.collection(collectionName).doc(docId).delete();
            return true;
        } catch (error) {
            console.error("Firebase Delete Error: ", error);
            return false;
        }
    },

    // Fetch single document or collection
    async fetchFromFirebase(collectionName, docId = null) {
        if (!this.firestore) return null;
        try {
            if (docId) {
                const doc = await this.firestore.collection(collectionName).doc(docId).get();
                if (doc.exists) {
                    const data = doc.data();
                    if (data && data.items !== undefined && Object.keys(data).length === 1) return data.items;
                    return data;
                }
                return null;
            } else {
                const snapshot = await this.firestore.collection(collectionName).get();
                if (!snapshot.empty) {
                    const items = [];
                    snapshot.forEach(doc => {
                        const data = doc.data();
                        if (data.items !== undefined && Object.keys(data).length === 1) {
                            items.push(...data.items);
                        } else {
                            items.push(data);
                        }
                    });
                    return items;
                }
                return [];
            }
        } catch (error) {
            console.error("Firebase Fetch Error: ", error);
            return null;
        }
    },

    async fetchAllDataFromCloud() {
        if (!this.firestore) return false;
        
        try {
            const [
                cloudProducts, 
                cloudEmployees, 
                cloudSales,
                cloudExpenses,
                cloudSalaries,
                cloudReconciliations, 
                cloudArchives,
                cloudUsers,
                cloudSettings,
                cloudDebts,
                cloudDebtPayments,
                cloudNewProducts
            ] = await Promise.all([
                this.fetchFromFirebase("inventory", "inventory_master"),
                this.fetchFromFirebase("employees_master", "employees_master"),
                this.fetchFromFirebase("sales_invoices"),
                this.fetchFromFirebase("expenses"),
                this.fetchFromFirebase("salary_transactions"),
                this.fetchFromFirebase("treasury_reconciliations"),
                this.fetchFromFirebase("daily_archives"),
                this.fetchFromFirebase("system_users", "users_list"),
                this.fetchFromFirebase("system_config", "settings_config"),
                this.fetchFromFirebase("customer_debts", "debts_list"),
                this.fetchFromFirebase("debt_payments"),
                this.fetchFromFirebase("new_products_report")
            ]);
            
            let hasCloudData = false;

            // Merge or Seed Products
            if (cloudProducts && Array.isArray(cloudProducts)) { 
                AppState.products = cloudProducts; 
                hasCloudData = true; 
            } else if (AppState.products.length > 0) {
                this.dispatchSync("products", AppState.products, "inventory_master");
            }

            // Merge or Seed Employees
            if (cloudEmployees && Array.isArray(cloudEmployees)) { 
                AppState.employees = cloudEmployees; 
                hasCloudData = true; 
            } else if (AppState.employees.length > 0) {
                this.dispatchSync("employees", AppState.employees, "employees_master");
            }

            // Merge or Seed Users
            if (cloudUsers && Array.isArray(cloudUsers)) { 
                AppState.users = cloudUsers; 
                hasCloudData = true; 
            } else if (AppState.users.length > 0) {
                this.dispatchSync("users", AppState.users, "users_list");
            }

            // Merge or Seed Settings
            if (cloudSettings) { 
                const currentConfig = AppState.settings.firebaseConfig;
                AppState.settings = cloudSettings;
                if (!AppState.settings.firebaseConfig) {
                    AppState.settings.firebaseConfig = currentConfig;
                }
                hasCloudData = true; 
            } else {
                this.dispatchSync("settings", AppState.settings, "settings_config");
            }
            
            // Merge or Seed Debts
            if (cloudDebts && Array.isArray(cloudDebts)) {
                AppState.debts = cloudDebts;
                hasCloudData = true;
            } else if (AppState.debts && AppState.debts.length > 0) {
                this.dispatchSync("debts", AppState.debts, "debts_list");
            }
            
            // Transactions Merge
            let allCloudTransactions = [];
            if (cloudSales && Array.isArray(cloudSales)) { allCloudTransactions.push(...cloudSales); hasCloudData = true; }
            if (cloudExpenses && Array.isArray(cloudExpenses)) { allCloudTransactions.push(...cloudExpenses); hasCloudData = true; }
            if (cloudSalaries && Array.isArray(cloudSalaries)) { allCloudTransactions.push(...cloudSalaries); hasCloudData = true; }
            if (cloudDebtPayments && Array.isArray(cloudDebtPayments)) { allCloudTransactions.push(...cloudDebtPayments); hasCloudData = true; }
            
            if (allCloudTransactions.length > 0) {
                allCloudTransactions.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
                AppState.transactions = allCloudTransactions;
            } else if (AppState.transactions.length > 0) {
                // Seed local transactions to cloud if cloud has no transactions
                AppState.transactions.forEach(t => {
                    if (t.type === 'sale') this.dispatchSync("sales", t, t.id);
                    if (t.type === 'expense') this.dispatchSync("expenses", t, t.id);
                    if (t.type === 'salary') this.dispatchSync("salaries", t, t.id);
                    if (t.type === 'debt_payment') this.dispatchSync("debt_payments", t, t.id);
                });
            }

            // Merge or Seed Reconciliations
            if (cloudReconciliations && Array.isArray(cloudReconciliations)) { 
                cloudReconciliations.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
                AppState.reconciliations = cloudReconciliations; 
                hasCloudData = true; 
            } else if (AppState.reconciliations.length > 0) {
                AppState.reconciliations.forEach(r => this.dispatchSync("treasury", r, r.id));
            }

            // Merge or Seed Archives
            if (cloudArchives && Array.isArray(cloudArchives)) { 
                cloudArchives.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
                AppState.archives = cloudArchives; 
                hasCloudData = true; 
            } else if (AppState.archives.length > 0) {
                AppState.archives.forEach(a => this.dispatchSync("daily_summary", a, a.archiveId));
            }

            // Merge or Seed New Products Report
            if (cloudNewProducts && Array.isArray(cloudNewProducts)) {
                cloudNewProducts.sort((a, b) => new Date(a.date) - new Date(b.date));
                AppState.newProductsReport = cloudNewProducts;
                hasCloudData = true;
            } else if (AppState.newProductsReport && AppState.newProductsReport.length > 0) {
                AppState.newProductsReport.forEach(r => {
                    const docId = "NP-" + new Date(r.date).getTime();
                    this.dispatchSync("new_products", r, docId);
                });
            }
            
            AppState.saveAll();
            return hasCloudData;
        } catch (error) {
            console.error("Cloud Fetch Failed: ", error);
            return false;
        }
    },
    
    // Aggregate synchronization wrapper
    async dispatchSync(type, payload, docId) {
        // Run Sheets Sync
        this.syncToSheets(type, payload);
        
        // Run Firebase Sync if configured
        let firebaseCollection = "";
        let isDelete = false;

        switch (type) {
            case "sales": firebaseCollection = "sales_invoices"; break;
            case "expenses": firebaseCollection = "expenses"; break;
            case "salaries": firebaseCollection = "salary_transactions"; break;
            case "daily_summary": firebaseCollection = "daily_archives"; break;
            case "treasury": firebaseCollection = "treasury_reconciliations"; break;
            case "products": firebaseCollection = "inventory"; break;
            case "employees": firebaseCollection = "employees_master"; break;
            case "users": firebaseCollection = "system_users"; break;
            case "settings": firebaseCollection = "system_config"; break;
            case "debts": firebaseCollection = "customer_debts"; break;
            case "debt_payments": firebaseCollection = "debt_payments"; break;
            case "new_products": firebaseCollection = "new_products_report"; break;
            case "sales_delete": firebaseCollection = "sales_invoices"; isDelete = true; break;
            case "expenses_delete": firebaseCollection = "expenses"; isDelete = true; break;
            case "salaries_delete": firebaseCollection = "salary_transactions"; isDelete = true; break;
            case "treasury_delete": firebaseCollection = "treasury_reconciliations"; isDelete = true; break;
        }
        
        if (firebaseCollection && docId) {
            if (isDelete) {
                this.deleteFromFirebase(firebaseCollection, docId);
            } else {
                this.syncToFirebase(firebaseCollection, docId, payload);
            }
        }
    }
};

// --- GLOBAL BARCODE SCANNER PARSING SYSTEM ---
let barcodeBuffer = "";
let lastKeyTime = 0;

function setupBarcodeListener() {
    window.addEventListener('keydown', function(e) {
        const currentTime = new Date().getTime();
        
        // Scan input is fast: typically less than 40-50ms between key presses
        // If delay is longer than 50ms, discard buffer and treat as human typing
        if (lastKeyTime !== 0 && (currentTime - lastKeyTime) > 55) {
            barcodeBuffer = "";
        }
        
        // Filter out control keys except Enter
        if (e.key.length === 1) {
            barcodeBuffer += e.key;
            lastKeyTime = currentTime;
        } else if (e.key === 'Enter' && barcodeBuffer.length >= 3) {
            // Process the scanned barcode
            const finalBarcode = barcodeBuffer.trim();
            barcodeBuffer = "";
            lastKeyTime = 0;
            
            handleScannedBarcode(finalBarcode);
            e.preventDefault();
        }
    });
}

function handleScannedBarcode(barcode) {
    console.log("Scanned Barcode Detected:", barcode);
    
    // Get active workspace tab
    const activeTab = document.querySelector('.nav-item.active').dataset.tab;
    
    if (activeTab === 'invoice') {
        // Invoicing: add product directly to basket
        const product = AppState.products.find(p => p.barcode === barcode);
        if (product) {
            addToBasket(product.id);
            triggerBarcodeFlash();
            playBeep('success');
            
            // Clear search input and hide results
            const searchInput = document.getElementById('invoice-search-input');
            if (searchInput) {
                searchInput.value = '';
            }
            const resultsBox = document.getElementById('invoice-search-results');
            if (resultsBox) {
                resultsBox.style.display = 'none';
            }
        } else {
            playBeep('error');
            alert(`الباركود الممسوح [${barcode}] غير مرتبط بأي منتج في المخزن!`);
        }
    } else if (activeTab === 'inventory') {
        // Prefill modal fields if it's open
        const modalBarcode = document.getElementById('prod-barcode');
        if (modalBarcode && document.getElementById('product-modal').classList.contains('active')) {
            modalBarcode.value = barcode;
            checkAndFillProductByBarcode(barcode);
            playBeep('success');
        } else if (searchInput) {
            searchInput.value = barcode;
            filterInventory();
            playBeep('success');
            triggerBarcodeFlash();
        }
    }
}

function checkAndFillProductByBarcode(barcode) {
    if (!barcode) {
        toggleProductQtyFields(false);
        document.getElementById('modal-prod-title').innerText = "إضافة عنصر جديد للمستودع";
        document.getElementById('prod-id').value = "";
        return;
    }
    
    const existing = AppState.products.find(p => p.barcode === barcode);
    if (existing) {
        document.getElementById('prod-id').value = existing.id;
        document.getElementById('prod-name').value = existing.name;
        document.getElementById('prod-cost').value = existing.cost;
        document.getElementById('prod-price').value = existing.price;
        document.getElementById('prod-qty').value = existing.qty;
        document.getElementById('prod-source').value = existing.source || "";
        document.getElementById('modal-prod-title').innerText = "تعديل بيانات المنتج (موجود مسبقاً)";
        
        toggleProductQtyFields(true, existing);
        playBeep('success');
    } else {
        const currentId = document.getElementById('prod-id').value;
        if (currentId) {
            document.getElementById('prod-id').value = "";
            document.getElementById('prod-name').value = "";
            document.getElementById('prod-cost-usd').value = "";
            document.getElementById('prod-cost').value = "";
            document.getElementById('prod-price').value = "";
            document.getElementById('prod-qty').value = "";
            document.getElementById('prod-source').value = "";
            document.getElementById('modal-prod-title').innerText = "إضافة عنصر جديد للمستودع";
            toggleProductQtyFields(false);
        }
    }
}

// --- VIEW NAVIGATION GATES ---
function switchTab(tabId) {
    // Permission checks
    if (AppState.currentUser && AppState.currentUser.role === 'cashier') {
        const perms = AppState.currentUser.permissions || ['invoice'];
        if (!perms.includes(tabId)) {
            playBeep('error');
            alert("خطأ: غير مسموح بالدخول. ليس لديك صلاحية للوصول إلى هذه الصفحة!");
            return;
        }
    }

    // Update active nav link
    document.querySelectorAll('.nav-item').forEach(item => {
        if (item.dataset.tab === tabId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // Update active panel section
    document.querySelectorAll('.workspace-panel').forEach(panel => {
        if (panel.id === `${tabId}-panel`) {
            panel.classList.add('active');
        } else {
            panel.classList.remove('active');
        }
    });

    // Update Header Title and Description
    const headerTitle = document.getElementById('workspace-current-title');
    const headerDesc = document.getElementById('workspace-current-desc');
    
    if (headerTitle && headerDesc) {
        let titleHtml = '';
        let descText = '';
        
        switch (tabId) {
            case 'invoice':
                titleHtml = '<span><i class="fa-solid fa-cash-register"></i> نقطة مبيعات الكاشير</span>';
                descText = 'إصدار وصولات الزبائن وتمرير الباركود';
                break;
            case 'expenses':
                titleHtml = '<span><i class="fa-solid fa-file-invoice-dollar"></i> المصروفات والرواتب</span>';
                descText = 'تسجيل المصروفات العامة وسلف الموظفين';
                break;
            case 'reports':
                titleHtml = '<span><i class="fa-solid fa-chart-line"></i> التقرير اليومي والأرباح</span>';
                descText = 'متابعة المبيعات اليومية والأرباح الصافية';
                break;
            case 'monthly-reports':
                titleHtml = '<span><i class="fa-solid fa-calendar-days"></i> التقرير المالي الشهري</span>';
                descText = 'إحصائيات المبيعات والأرباح الشهرية';
                break;
            case 'treasury':
                titleHtml = '<span><i class="fa-solid fa-vault"></i> جرد ومطابقة الخزينة</span>';
                descText = 'مطابقة رصيد النظام مع النقدية الفعلية بالدرج';
                break;
            case 'debts':
                titleHtml = '<span><i class="fa-solid fa-hand-holding-hand"></i> قائمة الديون والذمم</span>';
                descText = 'متابعة حسابات الديون وتسديد الدفعات للعملاء';
                break;
            case 'inventory':
                titleHtml = '<span><i class="fa-solid fa-boxes-stacked"></i> المستودع والمخزن</span>';
                descText = 'إدارة المنتجات، الأسعار، والمخزون';
                break;
            case 'settings':
                titleHtml = '<span><i class="fa-solid fa-sliders"></i> إعدادات الاتصال</span>';
                descText = 'تكوين ربط قاعدة البيانات السحابية';
                break;
            case 'new-products-report':
                titleHtml = '<span><i class="fa-solid fa-clipboard-list"></i> تقرير إضافة المنتجات</span>';
                descText = 'سجل المنتجات الجديدة المضافة حديثاً للمخزن';
                break;
        }
        
        const mobileBtn = '<button id="mobile-menu-btn" onclick="toggleMobileMenu()" class="mobile-only-btn" title="القائمة"><i class="fa-solid fa-bars"></i></button>';
        headerTitle.innerHTML = mobileBtn + ' ' + titleHtml;
        headerDesc.innerText = descText;
    }
    
    // Trigger specific tab loading functions
    if (tabId === 'reports') {
        renderReportsDashboard();
    } else if (tabId === 'monthly-reports') {
        populateMonthlyReportSelect();
    } else if (tabId === 'treasury') {
        calculateTreasuryReconciliation();
    } else if (tabId === 'inventory') {
        renderInventoryTable();
    } else if (tabId === 'new-products-report') {
        renderNewProductsReport();
    } else if (tabId === 'expenses') {
        loadEmployeesUI();
        renderExpenseTable();
    } else if (tabId === 'settings') {
        loadSettingsUI();
    } else if (tabId === 'debts') {
        renderDebtsList();
        const detailPanel = document.getElementById('debtor-detail-panel');
        if (detailPanel) detailPanel.style.display = 'none';
        const placeholder = document.getElementById('debtor-empty-placeholder');
        if (placeholder) placeholder.style.display = 'flex';
    }
    
    // Hide mobile menu if open
    const sidebar = document.getElementById('main-sidebar');
    const overlay = document.getElementById('mobile-sidebar-overlay');
    if (sidebar && sidebar.classList.contains('show')) {
        sidebar.classList.remove('show');
    }
    if (overlay && overlay.classList.contains('active')) {
        overlay.classList.remove('active');
    }
}

function toggleMobileMenu() {
    const sidebar = document.getElementById('main-sidebar');
    const overlay = document.getElementById('mobile-sidebar-overlay');
    if (sidebar) {
        sidebar.classList.toggle('show');
    }
    if (overlay) {
        overlay.classList.toggle('active');
    }
}

// --- BASKET & CHECKOUT LOGIC ---
function renderBasket() {
    const tbody = document.getElementById('basket-items');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (AppState.basket.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="color: var(--text-muted); padding: 40px;">السلة فارغة. قم بتمرير الباركود أو ابحث عن منتج.</td></tr>`;
        updateInvoiceTotals();
        return;
    }
    
    AppState.basket.forEach((item, index) => {
        const discount = item.discount || 0;
        const subtotal = Math.max(0, (item.product.price * item.quantity) - discount);
        tbody.innerHTML += `
            <tr>
                <td>${item.product.name} <br><small style="color: var(--text-muted); font-size:11px;">باركود: ${item.product.barcode}</small></td>
                <td>${item.product.price.toLocaleString()} د.ع</td>
                <td>
                    <div class="qty-control">
                        <button class="qty-btn" onclick="adjustBasketQty(${index}, -1)"><i class="fa-solid fa-minus"></i></button>
                        <span class="qty-val">${item.quantity}</span>
                        <button class="qty-btn" onclick="adjustBasketQty(${index}, 1)"><i class="fa-solid fa-plus"></i></button>
                    </div>
                </td>
                <td>
                    <div style="position:relative; width: 85px;">
                        <input type="number" min="0" value="${discount > 0 ? discount : ''}" 
                               class="form-control" 
                               style="width: 100%; padding: 4px 8px; font-size: 12px; text-align: center; height: 32px; border: 1px solid var(--danger); background: rgba(220, 38, 38, 0.05); color: var(--danger); font-weight: bold; border-radius: 6px;" 
                               placeholder="0" title="أدخل مبلغ الخصم"
                               onchange="updateBasketItemDiscount(${index}, this.value)">
                    </div>
                </td>
                <td class="price-value">${subtotal.toLocaleString()} د.ع</td>
                <td>
                    <button class="delete-btn" onclick="removeFromBasket(${index})"><i class="fa-regular fa-trash-can"></i></button>
                </td>
            </tr>
        `;
    });
    
    updateInvoiceTotals();
}

function addToBasket(productId) {
    const product = AppState.products.find(p => p.id === productId);
    if (!product) return;
    
    if (product.qty <= 0) {
        playBeep('error');
        alert("عذراً، هذا المنتج نفذ تماماً من المستودع!");
        return;
    }
    
    const existingIndex = AppState.basket.findIndex(item => item.product.id === productId);
    
    if (existingIndex > -1) {
        const newQty = AppState.basket[existingIndex].quantity + 1;
        if (newQty > product.qty) {
            playBeep('error');
            alert(`الكمية المطلوبة تتجاوز المتاح في المخزن! الحد الأقصى المتوفر: ${product.qty}`);
            return;
        }
        AppState.basket[existingIndex].quantity = newQty;
    } else {
        AppState.basket.push({ product: product, quantity: 1, discount: 0 });
    }
    
    renderBasket();
}

function adjustBasketQty(index, change) {
    const item = AppState.basket[index];
    const newQty = item.quantity + change;
    
    if (newQty <= 0) {
        removeFromBasket(index);
        return;
    }
    
    // Check stock limit
    if (newQty > item.product.qty) {
        playBeep('error');
        alert(`الكمية المطلوبة تتجاوز المتاح في المخزن! الحد الأقصى المتوفر: ${item.product.qty}`);
        return;
    }
    
    item.quantity = newQty;
    
    // Clamp discount if user is cashier
    if (AppState.currentUser && AppState.currentUser.role === 'cashier') {
        const unitPrice = item.product.price;
        const maxUnitDiscount = getMaxAllowedDiscount(unitPrice);
        const maxLineDiscount = maxUnitDiscount * item.quantity;
        if (item.discount > maxLineDiscount) {
            item.discount = maxLineDiscount;
        }
    }
    
    renderBasket();
}

function removeFromBasket(index) {
    AppState.basket.splice(index, 1);
    renderBasket();
}

function updateBasketItemDiscount(index, val) {
    let discount = parseInt(val) || 0;
    if (discount < 0) discount = 0;
    
    const item = AppState.basket[index];
    const itemTotal = item.product.price * item.quantity;
    
    // Check cashier discount ceiling
    if (AppState.currentUser && AppState.currentUser.role === 'cashier') {
        const unitPrice = item.product.price;
        const maxUnitDiscount = getMaxAllowedDiscount(unitPrice);
        const maxLineDiscount = maxUnitDiscount * item.quantity;
        
        if (discount > maxLineDiscount) {
            alert(`خطأ: تجاوز الحد المسموح لخصم الكاشير على هذا الصنف!\nالحد الأقصى للقطعة الواحدة: ${maxUnitDiscount.toLocaleString()} د.ع.\nإجمالي الحد الأقصى للكمية (${item.quantity}): ${maxLineDiscount.toLocaleString()} د.ع.`);
            discount = maxLineDiscount;
        }
    }
    
    if (discount > itemTotal) {
        alert("الخصم لا يمكن أن يكون أعلى من إجمالي سعر المادة!");
        discount = itemTotal;
    }
    
    item.discount = discount;
    renderBasket();
}

function updateInvoiceTotals() {
    let subtotal = 0;
    AppState.basket.forEach(item => {
        const itemDiscount = item.discount || 0;
        subtotal += Math.max(0, (item.product.price * item.quantity) - itemDiscount);
    });
    
    const discountInput = document.getElementById('invoice-discount');
    const discountVal = discountInput ? parseInt(discountInput.value) || 0 : 0;
    
    const total = Math.max(0, subtotal - discountVal);
    
    // Update labels
    const subtotalLabel = document.getElementById('invoice-subtotal');
    const totalLabel = document.getElementById('invoice-total');
    
    if (subtotalLabel) subtotalLabel.innerText = `${subtotal.toLocaleString()} د.ع`;
    if (totalLabel) totalLabel.innerText = `${total.toLocaleString()} د.ع`;
}

function handleDiscountChange() {
    updateInvoiceTotals();
}

// Quick Search Product input logic
function initProductAutocomplete() {
    const input = document.getElementById('invoice-search-input');
    const resultsBox = document.getElementById('invoice-search-results');
    
    if (!input || !resultsBox) return;
    
    input.addEventListener('input', function() {
        const query = input.value.trim().toLowerCase();
        resultsBox.innerHTML = '';
        
        if (query.length < 2) {
            resultsBox.style.display = 'none';
            return;
        }
        
        const matched = AppState.products.filter(p => 
            p.name.toLowerCase().includes(query) || p.barcode.includes(query)
        );
        
        if (matched.length === 0) {
            resultsBox.innerHTML = `<div style="padding: 12px 15px; color: var(--text-muted); font-size:13px;">لا توجد نتائج مطابقة</div>`;
        } else {
            matched.forEach(p => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'search-result-item';
                itemDiv.innerHTML = `
                    <span class="search-result-name">${p.name} ${p.qty <= 3 ? '<span class="badge danger btn-sm" style="padding:1px 5px">مخزون حرج</span>' : ''}</span>
                    <span class="search-result-details">${p.price.toLocaleString()} د.ع | مخزن: ${p.qty}</span>
                `;
                itemDiv.addEventListener('click', function() {
                    addToBasket(p.id);
                    input.value = '';
                    resultsBox.style.display = 'none';
                });
                resultsBox.appendChild(itemDiv);
            });
        }
        resultsBox.style.display = 'block';
    });
    
    // Close dropdown on outside click
    document.addEventListener('click', function(e) {
        if (e.target !== input && e.target !== resultsBox) {
            resultsBox.style.display = 'none';
        }
    });
}

// Autocomplete inside product adding/editing modal (search by Name to retrieve Barcode & details)
function initModalProductAutocomplete() {
    const input = document.getElementById('prod-name');
    const resultsBox = document.getElementById('modal-prod-name-results');
    
    if (!input || !resultsBox) return;
    
    input.addEventListener('input', function() {
        const query = input.value.trim().toLowerCase();
        resultsBox.innerHTML = '';
        
        if (query.length < 2) {
            resultsBox.style.display = 'none';
            return;
        }
        
        const matched = AppState.products.filter(p => 
            p.name.toLowerCase().includes(query)
        );
        
        if (matched.length === 0) {
            resultsBox.style.display = 'none';
        } else {
            matched.forEach(p => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'search-result-item';
                itemDiv.innerHTML = `
                    <span class="search-result-name" style="font-weight:700; text-align: right;">${p.name}</span>
                    <span class="search-result-details" style="font-family:'Inter'; font-size: 11px; color: var(--text-muted);">
                        ${p.barcode} | ${p.price.toLocaleString()} د.ع
                    </span>
                `;
                itemDiv.addEventListener('click', function() {
                    document.getElementById('prod-id').value = p.id;
                    document.getElementById('prod-barcode').value = p.barcode;
                    document.getElementById('prod-name').value = p.name;
                    document.getElementById('prod-cost').value = p.cost;
                    document.getElementById('prod-price').value = p.price;
                    document.getElementById('prod-qty').value = p.qty;
                    document.getElementById('prod-source').value = p.source || "";
                    document.getElementById('modal-prod-title').innerText = "تعديل بيانات المنتج (موجود مسبقاً)";
                    
                    toggleProductQtyFields(true, p);
                    playBeep('success');
                    
                    resultsBox.style.display = 'none';
                });
                resultsBox.appendChild(itemDiv);
            });
            resultsBox.style.display = 'block';
        }
    });
    
    // Close dropdown on outside click
    document.addEventListener('click', function(e) {
        if (e.target !== input && e.target !== resultsBox) {
            resultsBox.style.display = 'none';
        }
    });
}

function toggleDeliveryFields() {
    const isChecked = document.getElementById('is-delivery-sale').checked;
    const fieldsDiv = document.getElementById('delivery-fields');
    if (isChecked) {
        fieldsDiv.style.display = 'block';
    } else {
        fieldsDiv.style.display = 'none';
        // Clear fields
        document.getElementById('delivery-name').value = '';
        document.getElementById('delivery-phone').value = '';
        document.getElementById('delivery-location').value = '';
    }
}

function processCheckout() {
    if (AppState.basket.length === 0) {
        alert("عذراً، السلة فارغة. أضف عناصر أولاً لإصدار الفاتورة!");
        return;
    }
    
    // Ask for invoice discount confirmation if discount is huge
    let subtotal = 0;
    AppState.basket.forEach(item => {
        const itemDiscount = item.discount || 0;
        subtotal += Math.max(0, (item.product.price * item.quantity) - itemDiscount);
    });
    const discountVal = parseInt(document.getElementById('invoice-discount').value) || 0;
    
    if (discountVal > subtotal) {
        alert("خطأ: قيمة الخصم أعلى من إجمالي الفاتورة!");
        return;
    }
    
    const invoiceId = "INV-" + Date.now().toString().slice(-8);
    const finalTotal = subtotal - discountVal;
    
    // 1. Decrement product stock in state
    AppState.basket.forEach(basketItem => {
        const prod = AppState.products.find(p => p.id === basketItem.product.id);
        if (prod) {
            prod.qty -= basketItem.quantity;
        }
    });
    
    // Capture Delivery Details
    const isDelivery = document.getElementById('is-delivery-sale').checked;
    let deliveryDetails = null;
    if (isDelivery) {
        deliveryDetails = {
            name: document.getElementById('delivery-name').value.trim(),
            phone: document.getElementById('delivery-phone').value.trim(),
            location: document.getElementById('delivery-location').value.trim()
        };
    }
    
    // Capture Credit Details
    const isCredit = document.getElementById('is-credit-sale').checked;
    let customerName = "";
    if (isCredit) {
        customerName = document.getElementById('credit-customer-name').value.trim();
        if (!customerName) {
            alert("يرجى كتابة اسم الشخص المطلوب بالدين!");
            return;
        }
        
        // Find or create debtor
        if (!AppState.debts) AppState.debts = [];
        let debtor = AppState.debts.find(d => d.customerName.toLowerCase() === customerName.toLowerCase());
        if (!debtor) {
            debtor = {
                id: "debt_" + Date.now(),
                customerName: customerName,
                amount: 0,
                history: []
            };
            AppState.debts.push(debtor);
        }
        
        debtor.amount += finalTotal;
        debtor.history.push({
            id: invoiceId,
            type: 'charge',
            amount: finalTotal,
            timestamp: new Date().toISOString(),
            description: `شراء بالدين - فاتورة رقم ${invoiceId}`
        });
    }

    // 2. Create invoice transaction
    const transaction = {
        id: invoiceId,
        type: 'sale', // sale / expense / salary
        isDelivery: isDelivery,
        deliveryDetails: deliveryDetails,
        paymentType: isCredit ? 'credit' : 'cash',
        customerName: isCredit ? customerName : null,
        items: AppState.basket.map(item => ({
            id: item.product.id,
            name: item.product.name,
            price: item.product.price,
            cost: item.product.cost,
            quantity: item.quantity,
            discount: item.discount || 0
        })),
        subtotal: subtotal,
        discount: discountVal,
        total: finalTotal,
        timestamp: new Date().toISOString(),
        createdBy: AppState.currentUser ? AppState.currentUser.name : "غير معروف"
    };
    
    AppState.transactions.push(transaction);
    
    // Save locally
    AppState.saveAll();
    
    // 3. Dispatch Sync to sheets/firebase
    SyncManager.dispatchSync("sales", transaction, transaction.id);
    if (isCredit && AppState.debts) {
        SyncManager.dispatchSync("debts", AppState.debts, "debts_list");
    }
    
    // Update local products data to Google Sheets and Firestore too
    SyncManager.dispatchSync("products", AppState.products, "inventory_master");
    
    // 4. Render receipt print preview before clearing
    buildReceiptPrintPreview(transaction);
    
    // Clear invoice screen
    AppState.basket = [];
    document.getElementById('invoice-discount').value = 0;
    
    // Clear delivery fields
    document.getElementById('is-delivery-sale').checked = false;
    toggleDeliveryFields();
    
    // Clear credit fields
    document.getElementById('is-credit-sale').checked = false;
    toggleCreditFields();
    
    renderBasket();
    
    playBeep('checkout');
    
    // Show print modal instead of alert
    const printModal = document.getElementById('print-receipt-modal');
    const headerTitle = printModal.querySelector('h3');
    const promptText = printModal.querySelector('p');
    const printBtn = printModal.querySelector('.btn-accent');
    
    if (transaction.isDelivery) {
        headerTitle.innerHTML = '<i class="fa-solid fa-motorcycle" style="color:var(--primary)"></i> تم تسجيل طلب التوصيل بنجاح';
        promptText.innerText = 'هل تريد طباعة وصل التوصيل لتسليمه للمندوب؟';
        printBtn.onclick = () => {
            printThermalDelivery(transaction.id);
            closePrintModal();
        };
    } else {
        headerTitle.innerHTML = '<i class="fa-solid fa-print" style="color:var(--primary)"></i> تم تسجيل الفاتورة بنجاح';
        promptText.innerText = 'هل تريد طباعة وصل البيع للزبون (طابعة الفواتير الحرارية)؟';
        printBtn.onclick = () => {
            window.print();
            closePrintModal();
        };
    }
    
    printModal.classList.add('active');
}

function buildReceiptPrintPreview(invoice) {
    const printContainer = document.getElementById('receipt-print-wrapper');
    if (!printContainer) return;
    
    // Ensure A4 report classes are removed for thermal receipts
    printContainer.classList.remove('a4-report');
    
    let itemsRowsHtml = '';
    invoice.items.forEach(it => {
        const itemDiscount = it.discount || 0;
        const totalLinePrice = Math.max(0, (it.price * it.quantity) - itemDiscount);
        itemsRowsHtml += `
            <tr>
                <td>${it.name} ${itemDiscount > 0 ? `<br><small style="font-size:9px;">خصم: ${itemDiscount.toLocaleString()} د.ع</small>` : ''}</td>
                <td style="text-align: center;">${it.quantity}</td>
                <td style="text-align: left;">${totalLinePrice.toLocaleString()} د.ع</td>
            </tr>
        `;
    });
    
    const dateFormatted = new Date(invoice.timestamp).toLocaleString('ar-IQ');
    
    printContainer.innerHTML = `
        <div class="print-header">
            <h1>محل يلا فيب للأراكيل والفيب</h1>
            <p>شارع المطار - مقابل المول التجاري</p>
            <p>هاتف: 07700000000</p>
            <p style="font-weight: 700; margin-top:5px; font-size:12px;">وصل مبيعات (فاتورة مبسطة)</p>
        </div>
        <div class="print-info">
            <div class="print-info-row">
                <span>رقم الوصل:</span>
                <span style="font-family:'Inter',sans-serif; font-weight:700;">${invoice.id}</span>
            </div>
            <div class="print-info-row">
                <span>التاريخ:</span>
                <span>${dateFormatted}</span>
            </div>
            <div class="print-info-row">
                <span>البائع:</span>
                <span>${invoice.createdBy}</span>
            </div>
        </div>
        <table class="print-table">
            <thead>
                <tr>
                    <th style="width: 60%;">العنصر</th>
                    <th style="text-align: center; width: 15%;">العدد</th>
                    <th style="text-align: left; width: 25%;">السعر</th>
                </tr>
            </thead>
            <tbody>
                ${itemsRowsHtml}
            </tbody>
        </table>
        <div class="print-totals">
            <div class="print-totals-row">
                <span>المجموع الفرعي:</span>
                <span>${invoice.subtotal.toLocaleString()} د.ع</span>
            </div>
            <div class="print-totals-row">
                <span>الخصم الممنوح:</span>
                <span>${invoice.discount.toLocaleString()} د.ع</span>
            </div>
            <div class="print-totals-row bold">
                <span>الصافي النهائي:</span>
                <span>${invoice.total.toLocaleString()} د.ع</span>
            </div>
        </div>
        <div class="print-footer">
            <p>شكراً لزيارتكم لنا!</p>
            <p>البضاعة المباعة تستبدل خلال 24 ساعة بشرط عدم فتح العلبة.</p>
            <p style="font-size:7px; color:#555; margin-top:5px;">تطوير Antigravity AI Systems</p>
        </div>
    `;
}

function triggerSystemPrint() {
    window.print();
    closePrintModal();
}

function closePrintModal() {
    document.getElementById('print-receipt-modal').classList.remove('active');
}

// --- EXPENSES & SALARIES LOGIC ---
// --- EXPENSES & SALARIES LOGIC ---
let currentExpensesSubTab = 'expense';
function switchExpensesSubTab(tab) {
    currentExpensesSubTab = tab;
    const expBtn = document.getElementById('subtab-expenses-btn');
    const salBtn = document.getElementById('subtab-salaries-btn');
    const expTable = document.getElementById('expenses-only-table');
    const salTable = document.getElementById('salaries-only-table');
    
    if (tab === 'expense') {
        if (expBtn) expBtn.classList.add('active');
        if (salBtn) salBtn.classList.remove('active');
        if (expTable) expTable.style.display = 'table';
        if (salTable) salTable.style.display = 'none';
    } else {
        if (expBtn) expBtn.classList.remove('active');
        if (salBtn) salBtn.classList.add('active');
        if (expTable) expTable.style.display = 'none';
        if (salTable) salTable.style.display = 'table';
    }
}

function renderExpenseTable() {
    const expBody = document.getElementById('expense-only-body');
    const salBody = document.getElementById('salary-only-body');
    if (!expBody || !salBody) return;
    
    expBody.innerHTML = '';
    salBody.innerHTML = '';
    
    // Filter out transactions of type expense and salary
    const expensesList = AppState.transactions.filter(t => t.type === 'expense');
    const salariesList = AppState.transactions.filter(t => t.type === 'salary');
    
    // Sort by timestamp desc
    expensesList.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    salariesList.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    const showActions = AppState.currentUser && AppState.currentUser.role === 'manager';
    
    // Render Expenses
    if (expensesList.length === 0) {
        expBody.innerHTML = `<tr><td colspan="7" class="text-center" style="color:var(--text-muted); padding:30px;">لا يوجد قيود منصرفات مسجلة اليوم</td></tr>`;
    } else {
        expensesList.forEach(tx => {
            const dt = new Date(tx.timestamp).toLocaleString('ar-IQ');
            const actionsHtml = showActions ? `
                <td style="text-align: center;">
                    <div class="settings-actions" style="justify-content: center;">
                        <button class="btn btn-secondary btn-sm" onclick="openEditTxModal('${tx.id}')" title="تعديل"><i class="fa-regular fa-pen-to-square" style="font-size: 11px;"></i></button>
                        <button class="btn btn-danger btn-sm" onclick="deleteTransaction('${tx.id}')" title="حذف"><i class="fa-regular fa-trash-can" style="font-size: 11px;"></i></button>
                    </div>
                </td>
            ` : `<td style="text-align: center; color: var(--text-muted); font-size: 11px;"><i class="fa-solid fa-lock"></i> مقفل</td>`;
            
            expBody.innerHTML += `
                <tr>
                    <td style="font-family:'Inter',sans-serif; font-size:12px;">${tx.id}</td>
                    <td>${dt}</td>
                    <td><span class="badge warning">${tx.category}</span></td>
                    <td class="price-value" style="color:var(--danger);">${tx.amount.toLocaleString()} د.ع</td>
                    <td>${tx.description || '-'}</td>
                    <td>${tx.createdBy}</td>
                    ${actionsHtml}
                </tr>
            `;
        });
    }
    
    // Render Salaries
    if (salariesList.length === 0) {
        salBody.innerHTML = `<tr><td colspan="7" class="text-center" style="color:var(--text-muted); padding:30px;">لا يوجد قيود سحوبات رواتب مسجلة اليوم</td></tr>`;
    } else {
        salariesList.forEach(tx => {
            const dt = new Date(tx.timestamp).toLocaleString('ar-IQ');
            const actionsHtml = showActions ? `
                <td style="text-align: center;">
                    <div class="settings-actions" style="justify-content: center;">
                        <button class="btn btn-secondary btn-sm" onclick="openEditTxModal('${tx.id}')" title="تعديل"><i class="fa-regular fa-pen-to-square" style="font-size: 11px;"></i></button>
                        <button class="btn btn-danger btn-sm" onclick="deleteTransaction('${tx.id}')" title="حذف"><i class="fa-regular fa-trash-can" style="font-size: 11px;"></i></button>
                    </div>
                </td>
            ` : `<td style="text-align: center; color: var(--text-muted); font-size: 11px;"><i class="fa-solid fa-lock"></i> مقفل</td>`;
            
            salBody.innerHTML += `
                <tr>
                    <td style="font-family:'Inter',sans-serif; font-size:12px;">${tx.id}</td>
                    <td>${dt}</td>
                    <td><span class="badge danger">${tx.employeeName}</span></td>
                    <td class="price-value" style="color:var(--danger);">${tx.amount.toLocaleString()} د.ع</td>
                    <td>${tx.description || '-'}</td>
                    <td>${tx.createdBy}</td>
                    ${actionsHtml}
                </tr>
            `;
        });
    }
}

function addGeneralExpense(e) {
    if (e) e.preventDefault();
    
    const category = document.getElementById('exp-category').value;
    const amount = parseInt(document.getElementById('exp-amount').value) || 0;
    const desc = document.getElementById('exp-desc').value.trim();
    
    if (amount <= 0 || !category) {
        alert("يرجى إدخال مبلغ صحيح واختيار فئة المصروف!");
        return;
    }
    
    const newExp = {
        id: "EXP-" + Date.now().toString().slice(-8),
        type: "expense",
        category: category,
        amount: amount,
        description: desc,
        timestamp: new Date().toISOString(),
        createdBy: AppState.currentUser ? AppState.currentUser.name : "المدير"
    };
    
    AppState.transactions.push(newExp);
    AppState.saveAll();
    
    // Sync to Cloud
    SyncManager.dispatchSync("expenses", newExp, newExp.id);
    
    // Clear Form
    document.getElementById('exp-amount').value = '';
    document.getElementById('exp-desc').value = '';
    
    playBeep('success');
    renderExpenseTable();
    alert("تم تسجيل المصروف بنجاح وتخصيمه من الخزينة اليومية.");
}

function loadEmployeesUI() {
    const salaryEmpSelect = document.getElementById('salary-employee');
    const ledgerGrid = document.getElementById('employee-ledger-cards');
    
    if (salaryEmpSelect) {
        salaryEmpSelect.innerHTML = '<option value="">-- اختر الموظف --</option>';
        AppState.employees.forEach(emp => {
            salaryEmpSelect.innerHTML += `<option value="${emp.id}">${emp.name}</option>`;
        });
    }
    
    renderEmployeeLedgerCards();
}

function renderEmployeeLedgerCards() {
    const grid = document.getElementById('employee-ledger-cards');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    AppState.employees.forEach(emp => {
        // Calculate totals for advances/withdrawals
        let totalWithdrawals = 0;
        emp.withdrawals.forEach(w => {
            const incoming = w.direction === 'in' || w.amount < 0;
            totalWithdrawals += (incoming ? -Math.abs(w.amount) : Math.abs(w.amount));
        });
        
        const remaining = Math.max(0, emp.salary - totalWithdrawals);
        
        grid.innerHTML += `
            <div class="employee-card" onclick="viewEmployeeLedgerDetails('${emp.id}')">
                <div class="employee-card-header">
                    <span class="employee-card-name">${emp.name}</span>
                    <span class="employee-card-status">نشط</span>
                </div>
                <div class="employee-card-body">
                    <div class="employee-card-stat">
                        <span>الراتب الأساسي:</span>
                        <span class="val">${emp.salary.toLocaleString()} د.ع</span>
                    </div>
                    <div class="employee-card-stat">
                        <span>إجمالي المسحوبات:</span>
                        <span class="val" style="color:var(--danger);">${totalWithdrawals.toLocaleString()} د.ع</span>
                    </div>
                    <div class="employee-card-stat" style="border-top: 1px solid rgba(255,255,255,0.05); padding-top:5px; margin-top:5px;">
                        <span>المتبقي المستحق:</span>
                        <span class="val" style="color:var(--primary); font-weight:800;">${remaining.toLocaleString()} د.ع</span>
                    </div>
                </div>
            </div>
        `;
    });
}

function addSalaryWithdrawal(e) {
    if (e) e.preventDefault();
    
    const empId = document.getElementById('salary-employee').value;
    const amountOut = parseInt(document.getElementById('salary-amount-out').value) || 0;
    const amountIn = parseInt(document.getElementById('salary-amount-in').value) || 0;
    const notes = document.getElementById('salary-desc').value.trim();
    
    if (!empId || (amountOut <= 0 && amountIn <= 0)) {
        alert("يرجى اختيار الموظف وإدخال مبلغ صادر أو وارد صحيح!");
        return;
    }
    
    const emp = AppState.employees.find(e => e.id === empId);
    if (!emp) return;
    
    const isIncoming = amountIn > 0;
    const amount = isIncoming ? amountIn : amountOut;
    
    // Check remaining limit if outgoing
    if (!isIncoming) {
        let totalWithdrawals = 0;
        emp.withdrawals.forEach(w => {
            const incoming = w.direction === 'in' || w.amount < 0;
            totalWithdrawals += (incoming ? -Math.abs(w.amount) : Math.abs(w.amount));
        });
        const maxWithdrawable = emp.salary - totalWithdrawals;
        
        if (amount > maxWithdrawable) {
            if (!confirm(`تحذير: مبلغ السلفة (${amount.toLocaleString()} د.ع) يتجاوز الرصيد المتبقي للموظف (${maxWithdrawable.toLocaleString()} د.ع). هل تريد الاستمرار وتسجيل السحب كعجز مدين؟`)) {
                return;
            }
        }
    }
    
    const withdrawalId = "SAL-" + Date.now().toString().slice(-8);
    const newTx = {
        id: withdrawalId,
        type: 'salary',
        direction: isIncoming ? 'in' : 'out',
        employeeId: emp.id,
        employeeName: emp.name,
        amount: amount,
        description: notes || (isIncoming ? "إرجاع مبلغ سلفة / سداد" : "سحب دوري من الراتب"),
        timestamp: new Date().toISOString(),
        createdBy: AppState.currentUser ? AppState.currentUser.name : "المدير"
    };
    
    // Add to employee log
    emp.withdrawals.push({
        id: withdrawalId,
        amount: amount,
        direction: isIncoming ? 'in' : 'out',
        description: notes || (isIncoming ? "إرجاع مبلغ سلفة / سداد" : "سحب دوري من الراتب"),
        timestamp: new Date().toISOString()
    });
    
    // Add to master transactions
    AppState.transactions.push(newTx);
    AppState.saveAll();
    
    // Sync to Cloud
    SyncManager.dispatchSync("salaries", newTx, newTx.id);
    SyncManager.syncToSheets("salaries_employees_master", AppState.employees);
    
    // Clear forms & update UI
    document.getElementById('salary-amount-out').value = '';
    document.getElementById('salary-amount-in').value = '';
    document.getElementById('salary-desc').value = '';
    
    playBeep('success');
    renderExpenseTable();
    renderEmployeeLedgerCards();
    
    // If ledger modal detail is open for this employee, refresh it
    const ledgerDetailTitle = document.getElementById('ledger-detail-title');
    if (ledgerDetailTitle && ledgerDetailTitle.innerText.includes(emp.name)) {
        viewEmployeeLedgerDetails(emp.id);
    }
    
    alert(`تم تسجيل الحركة للموظف ${emp.name} بنجاح بقيمة ${amount.toLocaleString()} د.ع.`);
}

function viewEmployeeLedgerDetails(empId) {
    const emp = AppState.employees.find(e => e.id === empId);
    if (!emp) return;
    
    const modal = document.getElementById('ledger-detail-modal');
    const title = document.getElementById('ledger-detail-title');
    const tableBody = document.getElementById('employee-withdrawals-body');
    const totalLabel = document.getElementById('ledger-total-withdrawn');
    const remainingLabel = document.getElementById('ledger-remaining');
    
    if (!modal || !title || !tableBody) return;
    
    title.innerText = `تقرير كشف السحوبات التفصيلي: ${emp.name}`;
    tableBody.innerHTML = '';
    
    let totalWithdrawn = 0;
    emp.withdrawals.forEach(w => {
        const isIncoming = w.direction === 'in' || w.amount < 0;
        const absAmt = Math.abs(w.amount);
        const signedAmt = isIncoming ? -absAmt : absAmt;
        totalWithdrawn += signedAmt;
        
        const dt = new Date(w.timestamp).toLocaleString('ar-IQ');
        const color = isIncoming ? 'var(--primary)' : 'var(--danger)';
        const prefix = isIncoming ? 'وارد (إرجاع) +' : 'صادر (سحب) -';
        
        tableBody.innerHTML += `
            <tr>
                <td style="font-family:'Inter'; font-size:12px;">${w.id}</td>
                <td>${dt}</td>
                <td class="price-value" style="color:${color}; font-weight:700;">${prefix}${absAmt.toLocaleString()} د.ع</td>
                <td>${w.description}</td>
            </tr>
        `;
    });
    
    if (emp.withdrawals.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center" style="color:var(--text-muted); padding:20px;">لم يقم الموظف بأي سحوبات هذا الشهر حتى الآن.</td></tr>`;
    }
    
    totalLabel.innerText = `${totalWithdrawn.toLocaleString()} د.ع`;
    
    const remaining = Math.max(0, emp.salary - totalWithdrawn);
    remainingLabel.innerText = `${remaining.toLocaleString()} د.ع`;
    
    const payBtn = document.getElementById('btn-pay-salary');
    if (payBtn) payBtn.setAttribute('data-emp-id', empId);
    
    modal.classList.add('active');
}

function closeLedgerDetailModal() {
    document.getElementById('ledger-detail-modal').classList.remove('active');
}

function payEmployeeSalary() {
    if (AppState.currentUser && AppState.currentUser.role !== 'manager') {
        playBeep('error');
        alert("خطأ: غير مسموح بالدخول. دفع الرواتب متاح لمدير النظام فقط!");
        return;
    }

    const payBtn = document.getElementById('btn-pay-salary');
    if (!payBtn) return;
    
    const empId = payBtn.getAttribute('data-emp-id');
    if (!empId) return;
    
    const emp = AppState.employees.find(e => e.id === empId);
    if (!emp) return;

    if (!confirm(`هل أنت متأكد من تسليم الراتب وتصفير كافة السحوبات للموظف ${emp.name}؟ لا يمكن التراجع عن هذا الإجراء.`)) {
        return;
    }
    
    // Calculate remaining
    let totalWithdrawn = 0;
    emp.withdrawals.forEach(w => {
        const incoming = w.direction === 'in' || w.amount < 0;
        totalWithdrawn += (incoming ? -Math.abs(w.amount) : Math.abs(w.amount));
    });
    const remaining = Math.max(0, emp.salary - totalWithdrawn);
    
    // Add transaction to daily report if there is remaining salary to pay
    if (remaining > 0) {
        const txId = "SAL-" + Date.now().toString().slice(-8);
        const newTx = {
            id: txId,
            type: "salary",
            employeeId: emp.id,
            employeeName: emp.name,
            amount: remaining,
            description: "تصفية وتسديد الراتب الشهري بالكامل",
            timestamp: new Date().toISOString(),
            createdBy: AppState.currentUser ? AppState.currentUser.name : "المدير"
        };
        AppState.transactions.push(newTx);
        SyncManager.dispatchSync("salaries", newTx, newTx.id);
    }
    
    // Clear withdrawals
    emp.withdrawals = [];
    AppState.saveAll();
    
    // Sync to Cloud
    SyncManager.dispatchSync("employees", AppState.employees, "employees_master");
    
    playBeep('success');
    alert(`تم تسليم الراتب وتصفير حساب الموظف ${emp.name} بنجاح.`);
    
    // Refresh modal and background view
    viewEmployeeLedgerDetails(empId);
    loadEmployeesUI();
}

// --- TREASURY (KHAZINA) RECONCILIATION ---
function calculateTreasuryReconciliation() {
    // 1. Calculate Book Balance (System Balance)
    // Starting cash + sales - expenses - salaries
    const startingCash = AppState.settings.startingCash || 0;
    
    let totalCashSales = 0;
    let totalDebtRepayments = 0;
    let totalExpenses = 0;
    
    const today = new Date();
    const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    
    AppState.transactions.forEach(t => {
        const d = new Date(t.timestamp || Date.now());
        const tStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        if (tStr === todayStr) {
            if (t.type === 'sale') {
                if (t.paymentType !== 'credit') {
                    totalCashSales += t.total;
                }
            } else if (t.type === 'debt_payment') {
                totalDebtRepayments += t.amount;
            } else if (t.type === 'salary' && t.direction === 'in') {
                totalCashSales += t.amount;
            } else if (t.type === 'expense' || t.type === 'salary') {
                totalExpenses += t.amount;
            }
        }
    });
    
    const systemBalance = startingCash + totalCashSales + totalDebtRepayments - totalExpenses;
    
    const sysBalanceVal = document.getElementById('treasury-system-balance');
    if (sysBalanceVal) {
        sysBalanceVal.innerText = `${systemBalance.toLocaleString()} د.ع`;
    }
    
    // Recalculate difference based on entered input
    const physicalInput = document.getElementById('treasury-physical-cash');
    const physicalAmount = physicalInput ? parseInt(physicalInput.value) || 0 : 0;
    
    const difference = physicalAmount - systemBalance;
    
    const diffBox = document.getElementById('treasury-diff-box');
    const diffValLabel = document.getElementById('treasury-diff-value');
    const diffStatusText = document.getElementById('treasury-diff-status');
    const meterFill = document.getElementById('treasury-meter-fill');
    
    if (!diffBox || !diffValLabel || !diffStatusText || !meterFill) return;
    
    diffValLabel.innerText = `${Math.abs(difference).toLocaleString()} د.ع`;
    
    if (difference === 0) {
        diffBox.className = 'difference-output-box match';
        diffStatusText.innerText = "مطابقة تامة! الخزينة الدفترية مساوية للمحل.";
        diffStatusText.style.color = 'var(--primary)';
        meterFill.style.width = '50%';
        meterFill.style.backgroundColor = 'var(--primary)';
    } else if (difference > 0) {
        diffBox.className = 'difference-output-box mismatch';
        diffStatusText.innerText = "زيادة في الصندوق! (يوجد مبلغ مالي غير مقيد)";
        diffStatusText.style.color = 'var(--accent)';
        meterFill.style.width = '75%';
        meterFill.style.backgroundColor = 'var(--accent)';
    } else {
        diffBox.className = 'difference-output-box mismatch';
        diffStatusText.innerText = "عجز/نقص في الصندوق! (ربما نسي الموظف تقييد مبيعات)";
        diffStatusText.style.color = 'var(--danger)';
        meterFill.style.width = '25%';
        meterFill.style.backgroundColor = 'var(--danger)';
    }
    
    renderTreasuryLogTable();
}

function renderTreasuryLogTable() {
    const tbody = document.getElementById('treasury-logs-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (AppState.reconciliations.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color:var(--text-muted); padding:20px;">لم يتم تسجيل أي مطابقات يدوية للخزينة سابقاً.</td></tr>`;
        return;
    }
    
    // Sort by timestamp desc
    const logs = [...AppState.reconciliations].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    logs.forEach(log => {
        const dt = new Date(log.timestamp).toLocaleString('ar-IQ');
        let statusBadge = '';
        if (log.difference === 0) {
            statusBadge = `<span class="badge success">مطابق</span>`;
        } else if (log.difference > 0) {
            statusBadge = `<span class="badge warning">زيادة (+${log.difference.toLocaleString()})</span>`;
        } else {
            statusBadge = `<span class="badge danger">عجز (${log.difference.toLocaleString()})</span>`;
        }
        
        const showActions = AppState.currentUser && AppState.currentUser.role === 'manager';
        const actionsHtml = showActions ? `
            <td style="text-align: center;">
                <div class="settings-actions" style="justify-content: center;">
                    <button class="btn btn-secondary btn-sm" onclick="openEditReconModal('${log.id}')" title="تعديل"><i class="fa-regular fa-pen-to-square" style="font-size: 11px;"></i></button>
                    <button class="btn btn-danger btn-sm" onclick="deleteReconEntry('${log.id}')" title="حذف"><i class="fa-regular fa-trash-can" style="font-size: 11px;"></i></button>
                </div>
            </td>
        ` : `<td style="text-align: center; color: var(--text-muted); font-size: 11px;"><i class="fa-solid fa-lock"></i> مقفل</td>`;
        
        tbody.innerHTML += `
            <tr>
                <td>${dt}</td>
                <td class="price-value">${log.systemBalance.toLocaleString()} د.ع</td>
                <td class="price-value">${log.physicalBalance.toLocaleString()} د.ع</td>
                <td>${statusBadge}</td>
                <td>${log.notes || '-'}</td>
                <td>${log.createdBy}</td>
                ${actionsHtml}
            </tr>
        `;
    });
}

function openEditReconModal(reconId) {
    if (AppState.currentUser && AppState.currentUser.role !== 'manager') {
        playBeep('error');
        alert("خطأ: غير مسموح بالوصول. تعديل المطابقات متاح لمدير النظام فقط!");
        return;
    }
    
    const log = AppState.reconciliations.find(r => r.id === reconId);
    if (!log) {
        alert("خطأ: لم يتم العثور على المطابقة المطلوبة!");
        return;
    }
    
    document.getElementById('edit-recon-id').value = log.id;
    document.getElementById('edit-recon-physical').value = log.physicalBalance;
    document.getElementById('edit-recon-notes').value = log.notes || '';
    
    document.getElementById('edit-recon-modal').classList.add('active');
    playBeep('success');
}

function closeEditReconModal() {
    document.getElementById('edit-recon-modal').classList.remove('active');
}

function handleSaveEditRecon(e) {
    if (e) e.preventDefault();
    
    if (AppState.currentUser && AppState.currentUser.role !== 'manager') {
        playBeep('error');
        alert("خطأ: غير مسموح بالوصول!");
        return;
    }
    
    const reconId = document.getElementById('edit-recon-id').value;
    const newPhysical = parseInt(document.getElementById('edit-recon-physical').value) || 0;
    const newNotes = document.getElementById('edit-recon-notes').value.trim();
    
    if (newPhysical <= 0) {
        alert("يرجى إدخال مبلغ صحيح وموجب!");
        return;
    }
    
    const log = AppState.reconciliations.find(r => r.id === reconId);
    if (!log) {
        alert("خطأ: لم يتم العثور على قيد المطابقة لتعديله!");
        return;
    }
    
    log.physicalBalance = newPhysical;
    log.difference = newPhysical - log.systemBalance;
    log.status = log.difference === 0 ? "مطابق" : (log.difference > 0 ? "زيادة" : "عجز");
    log.notes = newNotes;
    log.lastEditedAt = new Date().toISOString();
    log.editedBy = AppState.currentUser ? AppState.currentUser.name : "المدير";
    
    AppState.saveAll();
    
    // Sync to Cloud
    SyncManager.dispatchSync("treasury", log, log.id);
    
    calculateTreasuryReconciliation();
    closeEditReconModal();
    playBeep('success');
    alert("تم تعديل قيد مطابقة الخزينة بنجاح وحفظ التغييرات سحابياً.");
}

function deleteReconEntry(reconId) {
    if (AppState.currentUser && AppState.currentUser.role !== 'manager') {
        playBeep('error');
        alert("خطأ: غير مسموح بالوصول. حذف القيود متاح لمدير النظام فقط!");
        return;
    }
    
    if (!confirm("هل أنت متأكد تماماً من رغبتك بحذف وإلغاء قيد مطابقة الخزينة هذا نهائياً؟")) {
        return;
    }
    
    const index = AppState.reconciliations.findIndex(r => r.id === reconId);
    if (index === -1) {
        alert("خطأ: لم يتم العثور على المطابقة المطلوبة!");
        return;
    }
    
    AppState.reconciliations.splice(index, 1);
    AppState.saveAll();
    
    // Sync deletion to cloud
    SyncManager.dispatchSync("treasury_delete", { id: reconId }, reconId);
    
    calculateTreasuryReconciliation();
    playBeep('success');
    alert("تم حذف قيد مطابقة الخزينة بنجاح.");
}

function commitTreasuryReconciliation(e) {
    if (e) e.preventDefault();
    
    const physicalInput = document.getElementById('treasury-physical-cash');
    const physicalAmount = physicalInput ? parseInt(physicalInput.value) || 0 : 0;
    const notes = document.getElementById('treasury-recon-notes').value.trim();
    
    if (physicalAmount <= 0) {
        alert("يرجى إدخال الرصيد النقدي الفعلي المتواجد بالمحل!");
        return;
    }
    
    // Recalculate totals
    const startingCash = AppState.settings.startingCash || 0;
    let totalCashSales = 0;
    let totalDebtRepayments = 0;
    let totalExpenses = 0;
    
    const today = new Date();
    const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    
    AppState.transactions.forEach(t => {
        const d = new Date(t.timestamp || Date.now());
        const tStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        if (tStr === todayStr) {
            if (t.type === 'sale') {
                if (t.paymentType !== 'credit') {
                    totalCashSales += t.total;
                }
            } else if (t.type === 'debt_payment') {
                totalDebtRepayments += t.amount;
            } else if (t.type === 'salary' && t.direction === 'in') {
                totalCashSales += t.amount;
            } else if (t.type === 'expense' || t.type === 'salary') {
                totalExpenses += t.amount;
            }
        }
    });
    
    const systemBalance = startingCash + totalCashSales + totalDebtRepayments - totalExpenses;
    const difference = physicalAmount - systemBalance;
    
    let status = "مطابق";
    if (difference > 0) status = "زيادة";
    else if (difference < 0) status = "عجز";
    
    const newLog = {
        id: "REC-" + Date.now().toString().slice(-8),
        timestamp: new Date().toISOString(),
        systemBalance: systemBalance,
        physicalBalance: physicalAmount,
        difference: difference,
        status: status,
        notes: notes || "مطابقة يدوية معتادة للوردية",
        createdBy: AppState.currentUser ? AppState.currentUser.name : "المدير"
    };
    
    AppState.reconciliations.push(newLog);
    
    // Clear reconciliation flag
    AppState.needsReconciliation = false;
    
    AppState.saveAll();
    
    // Sync to Cloud
    SyncManager.dispatchSync("treasury", newLog, newLog.id);
    
    // Reset inputs
    document.getElementById('treasury-physical-cash').value = '';
    document.getElementById('treasury-recon-notes').value = '';
    
    calculateTreasuryReconciliation();
    checkReconciliationBanner();
    alert("تم قيد مطابقة الخزينة وأرشفتها بنجاح للرقابة والمراجعة الشهرية.");
}

// --- DAILY REPORT (PRINT, CLEAR & ARCHIVE) ---
function renderReportsDashboard() {
    // 1. Calculate figures
    const startingCash = AppState.settings.startingCash || 0;
    
    // Filter active today's transactions
    const today = new Date();
    const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    
    const todaysTransactions = AppState.transactions.filter(t => {
        const d = new Date(t.timestamp || Date.now());
        const tStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        return tStr === todayStr;
    });

    let totalSales = 0; // Cash sales only
    let creditSales = 0; // Unpaid credit sales
    let totalCashSales = 0;
    let totalDebtRepayments = 0;
    let totalExpenses = 0;
    
    todaysTransactions.forEach(t => {
        if (t.type === 'sale') {
            if (t.paymentType === 'credit') {
                creditSales += t.total;
            } else {
                totalSales += t.total;
                totalCashSales += t.total;
            }
        } else if (t.type === 'debt_payment') {
            totalDebtRepayments += t.amount;
        } else if (t.type === 'salary' && t.direction === 'in') {
            totalSales += t.amount;
            totalCashSales += t.amount;
        } else if (t.type === 'expense' || t.type === 'salary') {
            totalExpenses += t.amount;
        }
    });
    
    const netProfit = totalSales + totalDebtRepayments - totalExpenses;
    const systemExpected = startingCash + totalCashSales + totalDebtRepayments - totalExpenses;
    
    // Update labels
    const todayOpeningLabel = document.getElementById('report-today-opening');
    const todaySalesLabel = document.getElementById('report-today-sales');
    const todayExpensesLabel = document.getElementById('report-today-expenses');
    const todayNetLabel = document.getElementById('report-today-net');
    const todayExpectedLabel = document.getElementById('report-today-expected');
    
    if (todayOpeningLabel) todayOpeningLabel.innerText = `${startingCash.toLocaleString()} د.ع`;
    if (todaySalesLabel) {
        // Display total sales, and if there are credit sales, show details
        if (creditSales > 0) {
            todaySalesLabel.innerHTML = `<span style="font-size:16px;">${totalSales.toLocaleString()} د.ع</span><br><small style="font-size:10px; font-weight:normal; color:var(--text-muted);">نقدي: ${totalSales.toLocaleString()} | آجل (غير واصل): ${creditSales.toLocaleString()}</small>`;
        } else {
            todaySalesLabel.innerText = `${totalSales.toLocaleString()} د.ع`;
        }
    }
    if (todayExpensesLabel) todayExpensesLabel.innerText = `${totalExpenses.toLocaleString()} د.ع`;
    if (todayNetLabel) {
        todayNetLabel.innerText = `${netProfit.toLocaleString()} د.ع`;
        todayNetLabel.style.color = netProfit >= 0 ? 'var(--primary)' : 'var(--danger)';
    }
    if (todayExpectedLabel) todayExpectedLabel.innerText = `${systemExpected.toLocaleString()} د.ع`;
    
    // 2. Render daily transactions ledger
    const listBody = document.getElementById('reports-transactions-body');
    if (listBody) {
        listBody.innerHTML = '';
        const sorted = [...todaysTransactions].sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        if (sorted.length === 0) {
            listBody.innerHTML = `<tr><td colspan="6" class="text-center" style="color:var(--text-muted); padding:30px;">لم يتم إجراء أي معاملات مالية اليوم بعد.</td></tr>`;
        } else {
            sorted.forEach(tx => {
                const dt = new Date(tx.timestamp).toLocaleString('ar-IQ', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                let typeText = '';
                let priceColor = 'var(--primary)';
                let prefix = '+';
                
                if (tx.type === 'sale') {
                    typeText = tx.items && tx.items.length > 0 ? tx.items.map(it => {
                        let text = `${it.name} (العدد: ${it.quantity})`;
                        if (it.discount > 0) text += `<br><span style="color:var(--danger); font-size:10px;"><i class="fa-solid fa-tags"></i> تم خصم مبلغ ${it.discount.toLocaleString()} د.ع من هذا العنصر</span>`;
                        return text;
                    }).join('<br>') : 'فاتورة مبيعات واردة';
                    
                    if (tx.discount > 0) {
                        typeText += `<br><div style="margin-top:5px; padding:4px 8px; background:rgba(220, 38, 38, 0.1); border-right:3px solid var(--danger); color:var(--danger); font-size:11px; border-radius:4px;"><i class="fa-solid fa-tags"></i> تم خصم إضافي بقيمة <strong>${tx.discount.toLocaleString()} د.ع</strong> من إجمالي الفاتورة</div>`;
                    }
                    
                    if (tx.paymentType === 'credit') {
                        typeText += `<br><small style="color: var(--accent);"><i class="fa-solid fa-hand-holding-hand"></i> مبيعات بالدين للعميل: <strong>${tx.customerName}</strong></small>`;
                        priceColor = '#666';
                    }
                    
                    if (tx.isDelivery) {
                        typeText += `<br><small style="color: var(--accent);"><i class="fa-solid fa-truck"></i> توصيل: ${tx.deliveryDetails.name} - هاتف: ${tx.deliveryDetails.phone} (${tx.deliveryDetails.location})</small>`;
                        typeText += `<br><button class="btn btn-secondary btn-sm" style="margin-top:5px; padding: 2px 5px; font-size:10px;" onclick="printThermalDelivery('${tx.id}')"><i class="fa-solid fa-print"></i> طباعة الوصل</button>`;
                    }
                } else if (tx.type === 'expense') {
                    typeText = `مصروفات: ${tx.category}`;
                    priceColor = 'var(--danger)';
                    prefix = '-';
                } else if (tx.type === 'salary') {
                    const dirText = tx.direction === 'in' ? ' (وارد)' : ' (صادر)';
                    typeText = `رواتب: سحبة لـ ${tx.employeeName}${dirText}`;
                    priceColor = tx.direction === 'in' ? 'var(--primary)' : 'var(--danger)';
                    prefix = tx.direction === 'in' ? '+' : '-';
                } else if (tx.type === 'debt_payment') {
                    typeText = tx.description;
                    priceColor = 'var(--primary)';
                    prefix = '+';
                }
                
                const amt = tx.type === 'sale' ? tx.total : tx.amount;
                let displayAmt = amt;
                if (tx.type === 'sale' && amt < 0) {
                    priceColor = 'var(--danger)';
                    prefix = '-';
                    displayAmt = Math.abs(amt);
                }
                
                const showActions = AppState.currentUser && AppState.currentUser.role === 'manager';
                const actionsHtml = showActions ? `
                    <td style="text-align: center;">
                        <div class="settings-actions" style="justify-content: center;">
                            <button class="btn btn-secondary btn-sm" onclick="openEditTxModal('${tx.id}')" title="تعديل"><i class="fa-regular fa-pen-to-square" style="font-size: 11px;"></i></button>
                            <button class="btn btn-danger btn-sm" onclick="deleteTransaction('${tx.id}')" title="حذف"><i class="fa-regular fa-trash-can" style="font-size: 11px;"></i></button>
                        </div>
                    </td>
                ` : `<td style="text-align: center; color: var(--text-muted); font-size: 11px;"><i class="fa-solid fa-lock"></i> مقفل</td>`;
                
                listBody.innerHTML += `
                    <tr>
                        <td style="font-family:'Inter'; font-size:12px;">${tx.id}</td>
                        <td>${dt}</td>
                        <td>${typeText}</td>
                        <td class="price-value" style="color:${priceColor}; font-weight:800;">${prefix}${displayAmt.toLocaleString()} د.ع</td>
                        <td>${tx.createdBy}</td>
                        ${actionsHtml}
                    </tr>
                `;
            });
        }
    }
    
    // 3. Render Archives List (Cards)
    renderArchivesList();
    
    // Refresh modal if active
    const archiveModal = document.getElementById('archive-details-modal');
    if (archiveModal && archiveModal.classList.contains('active')) {
        const titleText = document.getElementById('archive-modal-title').innerText;
        if (titleText.includes(': ')) {
            const dStr = titleText.split(': ')[1];
            if (dStr) openArchiveDetails(dStr);
        }
    }
    
    // 4. Render Monthly Charts
    renderMonthlyChartVisuals();
    
    // 5. Populate Monthly Report selector dropdown
    populateMonthlyReportSelect();
}

function renderArchivesList() {
    const listContainer = document.getElementById('archive-days-list');
    if (!listContainer) return;
    
    // Change container to block/flex column layout instead of grid
    listContainer.style.display = 'flex';
    listContainer.style.flexDirection = 'column';
    listContainer.style.gap = '12px';
    listContainer.innerHTML = '';
    
    const sortedArchives = [...AppState.archives].sort((a,b) => new Date(b.dateStr) - new Date(a.dateStr));
    
    if (sortedArchives.length === 0) {
        listContainer.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--text-muted);">لا توجد أيام مؤرشفة حتى الآن. سيتم أرشفة اليوم الأول عند منتصف الليل.</div>`;
        return;
    }
    
    listContainer.innerHTML = `<div style="text-align: right; color: var(--text-muted); font-size: 13px; margin-bottom: 5px;">اختر يوماً لعرض التفاصيل</div>`;
    
    sortedArchives.forEach(arc => {
        // Parse the target date string (YYYY-MM-DD) for accurate day name
        const [yy, mm, dd] = arc.dateStr.split('-');
        const targetDate = new Date(yy, mm - 1, dd);
        
        // Format to Arabic long date (e.g., الأحد، 21 يونيو 2026)
        const fullDateAr = targetDate.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        
        // Format save time
        const saveTime = new Date(arc.timestamp);
        const timeAr = saveTime.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
        
        listContainer.innerHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 12px; cursor: pointer; transition: all 0.2s;" 
                 onclick="openArchiveDetails('${arc.dateStr}')" 
                 onmouseover="this.style.background='var(--bg-surface-hover)'; this.style.borderColor='var(--primary)';" 
                 onmouseout="this.style.background='var(--bg-surface)'; this.style.borderColor='var(--border-color)';">
                 
                <div style="display: flex; align-items: center; gap: 12px;">
                    <i class="fa-solid fa-calendar-days" style="color: var(--text-muted); font-size: 18px;"></i>
                    <span style="font-weight: bold; font-size: 15px; color: var(--text-main);">${fullDateAr}</span>
                </div>
                
                <div style="color: var(--text-muted); font-size: 13px;">
                    وقت الحفظ: ${timeAr}
                </div>
            </div>
        `;
    });
}

function openArchiveDetails(dateStr) {
    const modal = document.getElementById('archive-details-modal');
    const tbody = document.getElementById('archive-transactions-body');
    if (!modal || !tbody) return;
    
    modal.dataset.dateStr = dateStr;
    document.getElementById('archive-modal-title').innerText = `تفاصيل أرشيف يوم: ${dateStr}`;

    // Filter transactions for the selected date
    const dayTransactions = AppState.transactions.filter(t => {
        const d = new Date(t.timestamp || Date.now());
        const tStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        return tStr === dateStr;
    });

    // Calculate totals for the day
    let totalSales = 0; // Cash sales only
    let totalDebtPayments = 0;
    let totalExpenses = 0;
    
    dayTransactions.forEach(t => {
        if (t.type === 'sale') {
            if (t.paymentType !== 'credit') {
                totalSales += t.total;
            }
        } else if (t.type === 'debt_payment') {
            totalDebtPayments += t.amount;
        } else if (t.type === 'salary' && t.direction === 'in') {
            totalSales += t.amount;
        } else if (t.type === 'expense' || t.type === 'salary') {
            totalExpenses += t.amount;
        }
    });
    const netProfit = totalSales + totalDebtPayments - totalExpenses;

    // Update Archive Summary Modal
    document.getElementById('archive-modal-total-in').innerText = `${totalSales.toLocaleString()} د.ع`;
    document.getElementById('archive-modal-total-out').innerText = `${totalExpenses.toLocaleString()} د.ع`;
    const netProfitLabel = document.getElementById('archive-modal-net');
    netProfitLabel.innerText = `${netProfit.toLocaleString()} د.ع`;
    netProfitLabel.style.color = netProfit >= 0 ? 'var(--primary)' : 'var(--danger)';

    // Render transactions
    tbody.innerHTML = '';
    
    const sorted = [...dayTransactions].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    if (sorted.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="color:var(--text-muted); padding:30px;">لا توجد معاملات مسجلة في هذا التاريخ.</td></tr>`;
    } else {
        sorted.forEach(tx => {
            const dt = new Date(tx.timestamp).toLocaleString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
            let typeText = '';
            let priceColor = 'var(--primary)';
            let prefix = '+';
            
            if (tx.type === 'sale') {
                typeText = tx.items && tx.items.length > 0 ? tx.items.map(it => {
                    let text = `${it.name} (العدد: ${it.quantity})`;
                    if (it.discount > 0) text += `<br><span style="color:var(--danger); font-size:10px;"><i class="fa-solid fa-tags"></i> تم خصم مبلغ ${it.discount.toLocaleString()} د.ع من هذا العنصر</span>`;
                    return text;
                }).join('<br>') : 'فاتورة مبيعات واردة';
                
                if (tx.discount > 0) {
                    typeText += `<br><div style="margin-top:5px; padding:4px 8px; background:rgba(220, 38, 38, 0.1); border-right:3px solid var(--danger); color:var(--danger); font-size:11px; border-radius:4px;"><i class="fa-solid fa-tags"></i> تم خصم إضافي بقيمة <strong>${tx.discount.toLocaleString()} د.ع</strong> من إجمالي الفاتورة</div>`;
                }
                
                if (tx.isDelivery) {
                    typeText += `<br><small style="color: var(--accent);"><i class="fa-solid fa-truck"></i> توصيل: ${tx.deliveryDetails.name} - هاتف: ${tx.deliveryDetails.phone} (${tx.deliveryDetails.location})</small>`;
                    typeText += `<br><button class="btn btn-secondary btn-sm" style="margin-top:5px; padding: 2px 5px; font-size:10px;" onclick="printThermalDelivery('${tx.id}')"><i class="fa-solid fa-print"></i> طباعة الوصل</button>`;
                }
            } else if (tx.type === 'expense') {
                typeText = `مصروفات: ${tx.category}`;
                priceColor = 'var(--danger)';
                prefix = '-';
            } else if (tx.type === 'salary') {
                typeText = `رواتب: سحبة لـ ${tx.employeeName}`;
                priceColor = 'var(--danger)';
                prefix = '-';
            } else if (tx.type === 'debt_payment') {
                typeText = tx.description;
                priceColor = 'var(--primary)';
                prefix = '+';
            }
            
            const amt = tx.type === 'sale' ? tx.total : tx.amount;
            let displayAmt = amt;
            if (tx.type === 'sale' && amt < 0) {
                priceColor = 'var(--danger)';
                prefix = '-';
                displayAmt = Math.abs(amt);
            } else if (tx.type === 'sale' && tx.paymentType === 'credit') {
                priceColor = '#666';
            }
            
            const showActions = AppState.currentUser && AppState.currentUser.role === 'manager';
        const actionsHtml = showActions ? `
            <td style="text-align: center;">
                <div class="settings-actions" style="justify-content: center;">
                    <button class="btn btn-secondary btn-sm" onclick="openEditTxModal('${tx.id}')" title="تعديل"><i class="fa-regular fa-pen-to-square" style="font-size: 11px;"></i></button>
                    <button class="btn btn-danger btn-sm" onclick="deleteTransaction('${tx.id}')" title="حذف"><i class="fa-regular fa-trash-can" style="font-size: 11px;"></i></button>
                </div>
            </td>
        ` : `<td style="text-align: center; color: var(--text-muted); font-size: 11px;"><i class="fa-solid fa-lock"></i> مقفل</td>`;
        
        tbody.innerHTML += `
            <tr>
                <td style="font-family:'Inter'; font-size:12px;">${tx.id}</td>
                <td>${dt}</td>
                <td>${typeText}</td>
                <td class="price-value" style="color:${priceColor}; font-weight:800;">${prefix}${displayAmt.toLocaleString()} د.ع</td>
                <td>${tx.createdBy}</td>
                ${actionsHtml}
            </tr>
        `;
        });
    }
    
    // Show modal
    modal.classList.add('active');
}

// Legacy manual daily reset and archive logic removed.

// Print daily report screen specifically
function printDailyReport(mode = 'print') {
    const printContainer = document.getElementById('receipt-print-wrapper');
    if (!printContainer) return;
    
    // Add A4 layout styling class
    printContainer.classList.add('a4-report');
    
    // Filter for today
    const today = new Date();
    const todayStrFormat = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    
    const todaysTransactions = AppState.transactions.filter(t => {
        const d = new Date(t.timestamp || Date.now());
        const tStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        return tStr === todayStrFormat;
    });

    const sales = todaysTransactions.filter(t => t.type === 'sale');
    const expenses = todaysTransactions.filter(t => t.type === 'expense');
    const salaries = todaysTransactions.filter(t => t.type === 'salary');
    const debtPayments = todaysTransactions.filter(t => t.type === 'debt_payment');
    
    const startingCash = AppState.settings.startingCash || 0;
    let totalSalesAmt = 0;
    let totalExpensesAmt = 0;
    let totalSalariesAmt = 0;
    let totalDebtPaymentsAmt = 0;
    
    sales.forEach(s => {
        if (s.paymentType !== 'credit') {
            totalSalesAmt += s.total;
        }
    });
    expenses.forEach(e => totalExpensesAmt += e.amount);
    salaries.forEach(s => totalSalariesAmt += s.amount);
    debtPayments.forEach(d => totalDebtPaymentsAmt += d.amount);
    
    const totalOut = totalExpensesAmt + totalSalariesAmt;
    const netProfit = totalSalesAmt + totalDebtPaymentsAmt - totalOut;
    const systemExpected = startingCash + totalSalesAmt + totalDebtPaymentsAmt - totalOut;
    
    // Build Unified Ledger Rows
    let unifiedRows = '';
    const sorted = [...todaysTransactions].sort((a,b) => new Date(b.timestamp || b.date || 0) - new Date(a.timestamp || a.date || 0));
    
    if (sorted.length === 0) {
        unifiedRows = `<tr><td colspan="5" style="text-align: center; padding: 20px; color:#555;">لم يتم إجراء أي معاملات مالية اليوم بعد.</td></tr>`;
    } else {
        sorted.forEach(tx => {
            let dt = '--:--';
            try {
                dt = new Date(tx.timestamp || tx.date || Date.now()).toLocaleString('ar-IQ', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            } catch(e){}
            let typeText = '';
            let priceColor = '#2e7d32'; // Green for incoming
            let prefix = '+';
            
            if (tx.type === 'sale') {
                typeText = tx.items && tx.items.length > 0 ? tx.items.map(it => `${it.name} (العدد: ${it.quantity})`).join('<br>') : 'فاتورة مبيعات واردة';
                if (tx.paymentType === 'credit') {
                    typeText += `<br><small style="color: #666; font-size:10px;">دين (غير واصل) للزبون: ${tx.customerName}</small>`;
                    priceColor = '#666';
                }
            } else if (tx.type === 'expense') {
                typeText = `مصروفات: ${tx.category}`;
                priceColor = '#d32f2f';
                prefix = '-';
            } else if (tx.type === 'salary') {
                typeText = `رواتب: سحبة لـ ${tx.employeeName}`;
                priceColor = '#d32f2f';
                prefix = '-';
            } else if (tx.type === 'debt_payment') {
                typeText = tx.description || `تسديد دين: ${tx.customerName}`;
                priceColor = '#2e7d32';
                prefix = '+';
            }
            
            const amt = tx.type === 'sale' ? tx.total : tx.amount;
            let displayAmt = amt;
            if (tx.type === 'sale' && amt < 0) {
                priceColor = '#d32f2f';
                prefix = '-';
                displayAmt = Math.abs(amt);
            }
            
            unifiedRows += `
                <tr>
                    <td style="text-align: center; font-size:11px;">${tx.id}</td>
                    <td style="text-align: center;">${dt}</td>
                    <td style="text-align: right; padding-right: 10px;">${typeText}</td>
                    <td style="text-align: left; color:${priceColor}; font-weight:bold;">${prefix}${displayAmt.toLocaleString()} د.ع</td>
                    <td style="text-align: center;">${tx.createdBy}</td>
                </tr>
            `;
        });
    }
    
    const todayStr = new Date().toLocaleDateString('ar-IQ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const printTime = new Date().toLocaleTimeString('ar-IQ');
    const closedBy = AppState.currentUser ? AppState.currentUser.name : 'المدير';
    
    printContainer.innerHTML = `
        <div class="print-header" style="border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 20px;">
            <h1>تقرير المبيعات والوردية اليومي</h1>
            <p style="font-size: 13px; font-weight: 700;">محل يلا فيب للأراكيل والفيب</p>
            <p style="font-size: 11px;">تاريخ استخراج التقرير: ${todayStr} | الساعة: ${printTime}</p>
        </div>
        
        <div class="print-info" style="font-size: 12px; border-bottom: 1px solid #ccc; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between;">
            <div>
                <span>المسؤول عن إعداد التقرير:</span>
                <strong style="font-size: 13px;">${closedBy}</strong>
            </div>
            <div>
                <span>حالة الصندوق الحالية:</span>
                <strong style="color: green;">نشط وغير مقفل</strong>
            </div>
        </div>
        
        <h3 style="font-size: 13px; margin-bottom: 10px; border-right: 3px solid var(--primary); padding-right: 8px;">تفاصيل مبيعات وتدفقات اليوم النشط</h3>
        <table class="print-table" style="margin-bottom: 25px; border: 1px solid #ddd; width: 100%;">
            <thead>
                <tr style="background-color: #f5f5f5;">
                    <th style="width: 15%; text-align: center; padding: 6px;">رقم العملية</th>
                    <th style="width: 15%; text-align: center; padding: 6px;">الوقت والتاريخ</th>
                    <th style="width: 35%; text-align: right; padding: 6px; padding-right: 10px;">البيان / المنتجات</th>
                    <th style="width: 20%; text-align: left; padding: 6px;">السعر</th>
                    <th style="width: 15%; text-align: center; padding: 6px;">المنفذ</th>
                </tr>
            </thead>
            <tbody>
                ${unifiedRows}
            </tbody>
        </table>
        
        <div class="print-totals" style="border-top: 2px solid #000; padding-top: 15px; margin-top: 20px;">
            <div class="print-totals-row" style="font-size: 12px; margin-bottom: 6px;">
                <span>الرصيد الافتتاحي للوردية:</span>
                <strong>${startingCash.toLocaleString()} د.ع</strong>
            </div>
            <div class="print-totals-row" style="font-size: 12px; margin-bottom: 6px;">
                <span>إجمالي مبيعات اليوم (الوارد النقدي):</span>
                <strong>+${totalSalesAmt.toLocaleString()} د.ع</strong>
            </div>
            <div class="print-totals-row" style="font-size: 12px; margin-bottom: 6px;">
                <span>إجمالي تسديد الديون (الوارد):</span>
                <strong>+${totalDebtPaymentsAmt.toLocaleString()} د.ع</strong>
            </div>
            <div class="print-totals-row" style="font-size: 12px; margin-bottom: 6px;">
                <span>إجمالي المصروفات العامة (الصادر):</span>
                <strong>-${totalExpensesAmt.toLocaleString()} د.ع</strong>
            </div>
            <div class="print-totals-row" style="font-size: 12px; margin-bottom: 6px;">
                <span>إجمالي سلف الموظفين (الصادر):</span>
                <strong>-${totalSalariesAmt.toLocaleString()} د.ع</strong>
            </div>
            <div class="print-totals-row bold" style="font-size: 13px; border-top: 1px dashed #ccc; padding-top: 8px; margin-bottom: 6px;">
                <span>صافي الدخل لليوم (الوارد - الصادر):</span>
                <strong style="color:${netProfit >= 0 ? 'green' : 'red'};">${netProfit.toLocaleString()} د.ع</strong>
            </div>
            <div class="print-totals-row bold" style="font-size: 15px; border-top: 1px solid #000; padding-top: 8px;">
                <span>الرصيد الدفتري المتوقع بالصندوق:</span>
                <strong style="color: blue;">${systemExpected.toLocaleString()} د.ع</strong>
            </div>
        </div>
        
        <div class="print-footer" style="margin-top: 40px; border-top: 1px dashed #555; padding-top: 15px; text-align: center;">
            <p>تقرير معتمد ومستخرج من نظام حسابات يلا فيب الذكي</p>
            <p>توقيع المسؤول: ___________________</p>
        </div>
    `;
    
    const reportDate = new Date().toISOString().slice(0, 10);
    const fileName = `تقرير_اليومية_بتاريخ_${reportDate}`;
    
    if (mode === 'pdf') {
        printContainer.style.display = 'block';
        printContainer.style.position = 'absolute';
        printContainer.style.top = '0';
        printContainer.style.left = '0';
        printContainer.style.zIndex = '-9999';
        printContainer.style.background = '#fff';
        
        const opt = {
            margin:       10,
            filename:     `${fileName}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2 },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        
        html2pdf().set(opt).from(printContainer).save().then(() => {
            printContainer.classList.remove('a4-report');
            printContainer.style.display = '';
            printContainer.style.position = '';
            printContainer.style.top = '';
            printContainer.style.left = '';
            printContainer.style.zIndex = '';
            printContainer.style.background = '';
        });
        return;
    }
    
    // Execute print - must make element visible before calling window.print()
    // Some browsers don't correctly handle display:none -> display:block via @media print alone
    const originalTitle = document.title;
    document.title = fileName;
    
    // Temporarily force visibility in DOM before print
    printContainer.style.display = 'block';
    printContainer.style.position = 'fixed';
    printContainer.style.top = '0';
    printContainer.style.left = '0';
    printContainer.style.width = '100%';
    printContainer.style.zIndex = '-9999';
    printContainer.style.background = '#fff';
    printContainer.style.color = '#000';
    
    const restorePrintState = () => {
        printContainer.classList.remove('a4-report');
        printContainer.style.display = '';
        printContainer.style.position = '';
        printContainer.style.top = '';
        printContainer.style.left = '';
        printContainer.style.width = '';
        printContainer.style.zIndex = '';
        printContainer.style.background = '';
        printContainer.style.color = '';
        document.title = originalTitle;
        window.removeEventListener('afterprint', restorePrintState);
    };
    window.addEventListener('afterprint', restorePrintState);
    
    // Small delay to let browser repaint before printing
    setTimeout(() => {
        window.print();
    }, 150);
}

function saveDailyReportPDF() {
    printDailyReport('pdf');
}

function printThermalDelivery(txId) {
    const tx = AppState.transactions.find(t => t.id === txId);
    if (!tx || !tx.isDelivery) {
        alert("خطأ: تعذر العثور على طلب التوصيل المطلوب!");
        return;
    }
    
    const printContainer = document.getElementById('receipt-print-wrapper');
    if (!printContainer) return;
    
    printContainer.classList.add('thermal-print');
    
    let itemsHtml = '';
    if (tx.items && tx.items.length > 0) {
        tx.items.forEach(it => {
            const itemDiscount = it.discount || 0;
            const totalLinePrice = Math.max(0, (it.price * it.quantity) - itemDiscount);
            itemsHtml += `
                <div style="display: flex; justify-content: space-between; font-size: 14px; border-bottom: 1px dashed #ccc; padding: 4px 0;">
                    <div style="flex: 2; text-align: right; padding-left: 5px;">${it.name} ${itemDiscount > 0 ? `<br><span style="font-size:10px;">خصم: ${itemDiscount.toLocaleString()} د.ع</span>` : ''}</div>
                    <div style="flex: 1; text-align: center;">${it.quantity}</div>
                    <div style="flex: 1; text-align: left;">${totalLinePrice.toLocaleString()}</div>
                </div>
            `;
        });
    }

    const dt = new Date(tx.timestamp || Date.now()).toLocaleString('ar-IQ', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    printContainer.innerHTML = `
        <div style="font-family: 'Tajawal', sans-serif; color: #000; width: 100%; max-width: 80mm; margin: 0 auto; padding: 10px; box-sizing: border-box; direction: rtl;">
            <div style="text-align: center; margin-bottom: 15px; border-bottom: 2px dashed #000; padding-bottom: 10px;">
                <h2 style="margin: 0 0 5px; font-size: 20px; font-weight: bold;">يلا فيب</h2>
                <p style="margin: 0; font-size: 16px; font-weight: bold;">وصل توصيل طلب</p>
                <p style="margin: 5px 0 0; font-size: 12px;">تاريخ: ${dt}</p>
                <p style="margin: 5px 0 0; font-size: 12px;">رقم الفاتورة: ${tx.id}</p>
            </div>
            
            <div style="margin-bottom: 15px; border-bottom: 2px dashed #000; padding-bottom: 10px;">
                <p style="margin: 5px 0; font-size: 14px;"><strong>اسم الزبون:</strong> ${tx.deliveryDetails.name}</p>
                <p style="margin: 5px 0; font-size: 14px;"><strong>رقم الهاتف:</strong> ${tx.deliveryDetails.phone}</p>
                <p style="margin: 5px 0; font-size: 14px;"><strong>العنوان/الموقع:</strong> ${tx.deliveryDetails.location}</p>
            </div>
            
            <div style="margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 5px; margin-bottom: 5px;">
                    <div style="flex: 2; text-align: right; padding-left: 5px;">الصنف</div>
                    <div style="flex: 1; text-align: center;">العدد</div>
                    <div style="flex: 1; text-align: left;">السعر</div>
                </div>
                ${itemsHtml}
            </div>
            
            <div style="margin-top: 15px; padding-top: 10px; border-top: 2px dashed #000;">
                <div style="display: flex; justify-content: space-between; font-size: 16px; font-weight: bold;">
                    <span>الإجمالي:</span>
                    <span>${tx.total.toLocaleString()} د.ع</span>
                </div>
            </div>
            
            <div style="text-align: center; margin-top: 20px; font-size: 12px; border-top: 1px solid #000; padding-top: 10px;">
                <p style="margin: 0;">شكراً لتعاملكم معنا!</p>
            </div>
        </div>
    `;
    
    const originalTitle = document.title;
    document.title = 'وصل_توصيل_' + tx.id;
    
    printContainer.style.display = 'block';
    printContainer.style.position = 'fixed';
    printContainer.style.top = '0';
    printContainer.style.left = '0';
    printContainer.style.width = '100%';
    printContainer.style.zIndex = '-9999';
    printContainer.style.background = '#fff';
    printContainer.style.color = '#000';
    
    const restorePrintState = () => {
        printContainer.classList.remove('thermal-print');
        printContainer.style.display = '';
        printContainer.style.position = '';
        printContainer.style.top = '';
        printContainer.style.left = '';
        printContainer.style.width = '';
        printContainer.style.zIndex = '';
        printContainer.style.background = '';
        printContainer.style.color = '';
        document.title = originalTitle;
        window.removeEventListener('afterprint', restorePrintState);
    };
    
    window.addEventListener('afterprint', restorePrintState);
    
    setTimeout(() => {
        window.print();
    }, 150);
}

// Print daily report from archives specifically
function printArchivedReport(archiveId, tempArc = null) {
    const arc = tempArc || AppState.archives.find(a => a.archiveId === archiveId);
    if (!arc) {
        alert("خطأ: لم يتم العثور على قيد الأرشيف المطلوب!");
        return;
    }
    
    const printContainer = document.getElementById('receipt-print-wrapper');
    if (!printContainer) return;
    
    // Add A4 layout styling class
    printContainer.classList.add('a4-report');
    
    // Get sales and expenses from the archive snapshot, with fallback to current state
    let transactions = arc.transactions || [];
    if (transactions.length === 0 && arc.dateStr) {
        transactions = AppState.transactions.filter(t => {
            const d = new Date(t.timestamp || Date.now());
            const tStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
            return tStr === arc.dateStr;
        });
    }
    
    const sales = transactions.filter(t => t.type === 'sale');
    const expenses = transactions.filter(t => t.type === 'expense');
    const salaries = transactions.filter(t => t.type === 'salary');
    const debtPayments = transactions.filter(t => t.type === 'debt_payment');
    
    // Reconstruct starting cash with fallback
    const startingCash = arc.startingCash !== undefined ? arc.startingCash : (arc.systemBalance !== undefined ? Math.max(0, arc.systemBalance - arc.totalSales + arc.totalExpenses) : 0);
    
    let totalSalesAmt = 0;
    let totalExpensesAmt = 0;
    let totalSalariesAmt = 0;
    let totalDebtPaymentsAmt = arc.totalDebtPayments || 0;
    
    if (transactions.length > 0) {
        sales.forEach(s => {
            if (s.paymentType !== 'credit') {
                totalSalesAmt += s.total;
            }
        });
        expenses.forEach(e => totalExpensesAmt += e.amount);
        salaries.forEach(s => totalSalariesAmt += s.amount);
        
        totalDebtPaymentsAmt = 0;
        debtPayments.forEach(d => totalDebtPaymentsAmt += d.amount);
    } else {
        totalSalesAmt = arc.totalSales || 0;
        totalExpensesAmt = arc.totalExpenses || 0;
    }
    
    const totalOut = totalExpensesAmt + totalSalariesAmt;
    const netProfit = totalSalesAmt + totalDebtPaymentsAmt - totalOut;
    const systemExpected = startingCash + totalSalesAmt + totalDebtPaymentsAmt - totalOut;
    
    // Build Unified Ledger Rows
    let unifiedRows = '';
    const sorted = [...transactions].sort((a,b) => new Date(b.timestamp || b.date || 0) - new Date(a.timestamp || a.date || 0));
    
    if (sorted.length === 0) {
        unifiedRows = `<tr><td colspan="5" style="text-align: center; padding: 20px; color:#555;">لم يتم إجراء أي معاملات مالية في هذا اليوم.</td></tr>`;
    } else {
        sorted.forEach(tx => {
            let dt = '--:--';
            try {
                dt = new Date(tx.timestamp || tx.date || Date.now()).toLocaleString('ar-IQ', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            } catch(e){}
            let typeText = '';
            let priceColor = '#2e7d32'; // Green for incoming
            let prefix = '+';
            
            if (tx.type === 'sale') {
                typeText = tx.items && tx.items.length > 0 ? tx.items.map(it => `${it.name} (العدد: ${it.quantity})`).join('<br>') : 'فاتورة مبيعات واردة';
                if (tx.paymentType === 'credit') {
                    typeText += `<br><small style="color: #666; font-size:10px;">دين (غير واصل) للزبون: ${tx.customerName}</small>`;
                    priceColor = '#666';
                }
            } else if (tx.type === 'expense') {
                typeText = `مصروفات: ${tx.category}`;
                priceColor = '#d32f2f';
                prefix = '-';
            } else if (tx.type === 'salary') {
                typeText = `رواتب: سحبة لـ ${tx.employeeName}`;
                priceColor = '#d32f2f';
                prefix = '-';
            } else if (tx.type === 'debt_payment') {
                typeText = tx.description || `تسديد دين: ${tx.customerName}`;
                priceColor = '#2e7d32';
                prefix = '+';
            }
            
            const amt = tx.type === 'sale' ? tx.total : tx.amount;
            let displayAmt = amt;
            if (tx.type === 'sale' && amt < 0) {
                priceColor = '#d32f2f';
                prefix = '-';
                displayAmt = Math.abs(amt);
            }
            
            unifiedRows += `
                <tr>
                    <td style="text-align: center; font-size:11px;">${tx.id}</td>
                    <td style="text-align: center;">${dt}</td>
                    <td style="text-align: right; padding-right: 10px;">${typeText}</td>
                    <td style="text-align: left; color:${priceColor}; font-weight:bold;">${prefix}${displayAmt.toLocaleString()} د.ع</td>
                    <td style="text-align: center;">${tx.createdBy}</td>
                </tr>
            `;
        });
    }
    
    const printTime = arc.timestamp ? new Date(arc.timestamp).toLocaleTimeString('ar-IQ') : '--:--';
    const closedBy = arc.closedBy || 'المدير';
    
    // Safely format optional properties
    const formattedPhysical = arc.physicalCash !== undefined ? arc.physicalCash.toLocaleString() + ' د.ع' : 'غير محدد';
    const formattedDifference = arc.difference !== undefined ? arc.difference.toLocaleString() + ' د.ع' : 'غير محدد';
    const diffColor = arc.difference === 0 ? 'green' : (arc.difference > 0 ? 'orange' : 'red');
    const formattedDate = arc.date || arc.dateStr || '--';
    
    printContainer.innerHTML = `
        <div class="print-header" style="border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 20px;">
            <h1>تقرير المبيعات والوردية اليومي (مؤرشف)</h1>
            <p style="font-size: 13px; font-weight: 700;">محل يلا فيب للأراكيل والفيب</p>
            <p style="font-size: 11px;">تاريخ الوردية: ${formattedDate} | وقت الإغلاق: ${printTime}</p>
        </div>
        
        <div class="print-info" style="font-size: 12px; border-bottom: 1px solid #ccc; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between;">
            <div>
                <span>رمز الأرشيف:</span>
                <strong style="font-family:'Inter', sans-serif;">${arc.archiveId}</strong><br>
                <span>المسؤول عن إغلاق التقرير:</span>
                <strong style="font-size: 13px;">${closedBy}</strong>
            </div>
            <div>
                <span>حالة الصندوق:</span>
                <strong style="color:var(--danger);">مغلق ومؤرشف</strong>
            </div>
        </div>
        
        <h3 style="font-size: 13px; margin-bottom: 10px; border-right: 3px solid var(--primary); padding-right: 8px;">سجل الحركات وتدفقات اليوم (مؤرشف)</h3>
        <table class="print-table" style="margin-bottom: 25px; border: 1px solid #ddd; width: 100%;">
            <thead>
                <tr style="background-color: #f5f5f5;">
                    <th style="width: 15%; text-align: center; padding: 6px;">رقم العملية</th>
                    <th style="width: 15%; text-align: center; padding: 6px;">الوقت والتاريخ</th>
                    <th style="width: 35%; text-align: right; padding: 6px; padding-right: 10px;">البيان / المنتجات</th>
                    <th style="width: 20%; text-align: left; padding: 6px;">السعر</th>
                    <th style="width: 15%; text-align: center; padding: 6px;">المنفذ</th>
                </tr>
            </thead>
            <tbody>
                ${unifiedRows}
            </tbody>
        </table>
        
        <div class="print-totals" style="border-top: 2px solid #000; padding-top: 15px; margin-top: 20px;">
            <div class="print-totals-row" style="font-size: 12px; margin-bottom: 6px;">
                <span>الرصيد الافتتاحي للوردية:</span>
                <strong>${startingCash.toLocaleString()} د.ع</strong>
            </div>
            <div class="print-totals-row" style="font-size: 12px; margin-bottom: 6px;">
                <span>إجمالي مبيعات اليوم (الوارد النقدي):</span>
                <strong>+${totalSalesAmt.toLocaleString()} د.ع</strong>
            </div>
            <div class="print-totals-row" style="font-size: 12px; margin-bottom: 6px;">
                <span>إجمالي تسديد الديون (الوارد):</span>
                <strong>+${totalDebtPaymentsAmt.toLocaleString()} د.ع</strong>
            </div>
            <div class="print-totals-row" style="font-size: 12px; margin-bottom: 6px;">
                <span>إجمالي المصروفات العامة (الصادر):</span>
                <strong>-${totalExpensesAmt.toLocaleString()} د.ع</strong>
            </div>
            <div class="print-totals-row" style="font-size: 12px; margin-bottom: 6px;">
                <span>إجمالي سلف الموظفين (الصادر):</span>
                <strong>-${totalSalariesAmt.toLocaleString()} د.ع</strong>
            </div>
            <div class="print-totals-row" style="font-size: 12px; margin-bottom: 6px;">
                <span>إجمالي تسديد الديون (الوارد):</span>
                <strong>+${totalDebtPaymentsAmt.toLocaleString()} د.ع</strong>
            </div>
            <div class="print-totals-row bold" style="font-size: 13px; border-top: 1px dashed #ccc; padding-top: 8px; margin-bottom: 6px;">
                <span>صافي الدخل للوردية:</span>
                <strong style="color:${netProfit >= 0 ? 'green' : 'red'};">${(netProfit + totalDebtPaymentsAmt).toLocaleString()} د.ع</strong>
            </div>
            <div class="print-totals-row bold" style="font-size: 13px; border-top: 1px solid #ccc; padding-top: 5px; margin-bottom: 6px;">
                <span>الرصيد الدفتري المتوقع بالصندوق:</span>
                <strong>${systemExpected.toLocaleString()} د.ع</strong>
            </div>
            <div class="print-totals-row bold" style="font-size: 13px; margin-bottom: 6px;">
                <span>المبلغ الفعلي المقيد بالخزينة:</span>
                <strong>${formattedPhysical}</strong>
            </div>
            <div class="print-totals-row bold" style="font-size: 15px; border-top: 1px solid #000; padding-top: 8px;">
                <span>الفارق أو العجز في الصندوق:</span>
                <strong style="color:${diffColor};">${formattedDifference}</strong>
            </div>
        </div>
        
        <div class="print-footer" style="margin-top: 40px; border-top: 1px dashed #555; padding-top: 15px; text-align: center;">
            <p>تقرير معتمد ومستخرج من أرشيف نظام حسابات يلا فيب الذكي</p>
            <p>توقيع المسؤول: ___________________</p>
        </div>
    `;
    
    // Change page title dynamically to set file name for Save as PDF
    const originalTitle = document.title;
    const safeDateStr = (arc.date || arc.dateStr || '').replace(/[\/\\]/g, '-').replace(/\s+/g, '_');
    document.title = `تقرير_اليومية_بتاريخ_${safeDateStr}`;
    
    // Execute print - must make element visible before calling window.print()
    printContainer.style.display = 'block';
    printContainer.style.position = 'fixed';
    printContainer.style.top = '0';
    printContainer.style.left = '0';
    printContainer.style.width = '100%';
    printContainer.style.zIndex = '-9999';
    printContainer.style.background = '#fff';
    printContainer.style.color = '#000';
    
    const restorePrintState = () => {
        printContainer.classList.remove('a4-report');
        printContainer.style.display = '';
        printContainer.style.position = '';
        printContainer.style.top = '';
        printContainer.style.left = '';
        printContainer.style.width = '';
        printContainer.style.zIndex = '';
        printContainer.style.background = '';
        printContainer.style.color = '';
        document.title = originalTitle;
        window.removeEventListener('afterprint', restorePrintState);
    };
    window.addEventListener('afterprint', restorePrintState);
    
    // Small delay to let browser repaint before printing
    setTimeout(() => {
        window.print();
    }, 150);
}

function printArchivedReportFromModal() {
    const modal = document.getElementById('archive-details-modal');
    if (!modal) return;
    const dateStr = modal.dataset.dateStr;
    if (!dateStr) {
        alert("خطأ: لم يتم تحديد تاريخ الأرشيف!");
        return;
    }
    
    let arc = AppState.archives.find(a => a.dateStr === dateStr);
    if (!arc) {
        // Prepare temporary archive object
        const dayTransactions = AppState.transactions.filter(t => {
            const d = new Date(t.timestamp || Date.now());
            const tStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
            return tStr === dateStr;
        });
        
        let totalSales = 0;
        let totalExpenses = 0;
        dayTransactions.forEach(t => {
            if (t.type === 'sale') totalSales += t.total;
            else if (t.type === 'expense' || t.type === 'salary') totalExpenses += t.amount;
        });
        
        arc = {
            archiveId: 'TEMP-' + dateStr,
            dateStr: dateStr,
            date: dateStr,
            totalSales: totalSales,
            totalExpenses: totalExpenses,
            netProfit: totalSales - totalExpenses,
            physicalCash: totalSales - totalExpenses + (AppState.settings.startingCash || 0),
            difference: 0,
            startingCash: AppState.settings.startingCash || 0,
            timestamp: new Date().toISOString(),
            transactions: dayTransactions
        };
    }
    
    printArchivedReport(arc.archiveId, arc);
}

// --- MONTHLY AGGREGATED REPORT CALCS & RENDER ---
function populateMonthlyReportSelect() {
    const select = document.getElementById('monthly-report-select');
    if (!select) return;
    
    const currentSelection = select.value;
    select.innerHTML = '<option value="">-- اختر الشهر --</option>';
    
    const months = new Set();
    const today = new Date();
    const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    months.add(currentMonthKey);
    
    AppState.transactions.forEach(t => {
        const dateObj = new Date(t.timestamp || Date.now());
        const mKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
        months.add(mKey);
    });
    
    const sortedMonths = Array.from(months).sort().reverse();
    const monthsArNames = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
    
    sortedMonths.forEach(mKey => {
        const parts = mKey.split('-');
        const year = parts[0];
        const monthNum = parseInt(parts[1]);
        const monthName = monthsArNames[monthNum - 1];
        
        let label = `${monthName} ${year}`;
        if (mKey === currentMonthKey) {
            label += ' (الشهر الحالي)';
        }
        
        select.innerHTML += `<option value="${mKey}">${label}</option>`;
    });
    
    if (currentSelection && sortedMonths.includes(currentSelection)) {
        select.value = currentSelection;
    }
}

function renderMonthlyBreakdownDetails() {
    const select = document.getElementById('monthly-report-select');
    const detailsDiv = document.getElementById('monthly-breakdown-details');
    if (!select || !detailsDiv) return;
    
    const selectedMonth = select.value;
    if (!selectedMonth) {
        detailsDiv.style.display = 'none';
        return;
    }
    
    let totalSales = 0; // Cash sales only
    let creditSales = 0; // Unpaid credit sales
    let totalDebtPayments = 0;
    let totalExpenses = 0;
    let totalSalaries = 0;
    
    const productSalesMap = {};
    const sourceSalesMap = {};
    const today = new Date();
    const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    
    AppState.transactions.forEach(t => {
        const dateObj = new Date(t.timestamp || Date.now());
        const mKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
        
        if (mKey === selectedMonth) {
            if (t.type === 'sale') {
                if (t.paymentType === 'credit') {
                    creditSales += t.total;
                } else {
                    totalSales += t.total;
                }
                t.items.forEach(it => {
                    let source = it.source || "غير محدد";
                    let cost = it.cost || 0;
                    const origProd = AppState.products.find(p => p.id === it.id);
                    if (origProd) {
                        source = origProd.source || "غير محدد";
                        cost = origProd.cost || 0;
                    }
                    
                    let pName = it.name;
                    if (origProd) {
                        pName = origProd.name;
                    } else if (pName) {
                        pName = pName.replace(" (مرتجع استبدال)", "").replace(" (بديل استبدال)", "");
                    }
                    
                    if (!productSalesMap[it.id]) {
                        productSalesMap[it.id] = { name: pName, quantity: 0, totalPrice: 0 };
                    }
                    productSalesMap[it.id].quantity += it.quantity;
                    productSalesMap[it.id].totalPrice += it.price * it.quantity;
                    
                    if (!sourceSalesMap[source]) {
                        sourceSalesMap[source] = { quantity: 0, totalSales: 0, totalCost: 0, netProfit: 0 };
                    }
                    sourceSalesMap[source].quantity += it.quantity;
                    sourceSalesMap[source].totalSales += (it.price * it.quantity);
                    sourceSalesMap[source].totalCost += (cost * it.quantity);
                    sourceSalesMap[source].netProfit += ((it.price - cost) * it.quantity);
                });
            } else if (t.type === 'debt_payment') {
                totalDebtPayments += t.amount;
            } else if (t.type === 'expense') {
                totalExpenses += t.amount;
            } else if (t.type === 'salary') {
                if (t.direction === 'in') {
                    totalSalaries -= t.amount;
                } else {
                    totalSalaries += t.amount;
                }
            }
        }
    });
    
    const salesTotalLabel = document.getElementById('month-total-sales');
    if (salesTotalLabel) {
        if (creditSales > 0 || totalDebtPayments > 0) {
            salesTotalLabel.innerHTML = `<span style="font-size:16px;">${totalSales.toLocaleString()} د.ع</span><br><small style="font-size:10px; font-weight:normal; color:var(--text-muted);">نقدي: ${totalSales.toLocaleString()} | تسديد ديون: ${totalDebtPayments.toLocaleString()} | آجل: ${creditSales.toLocaleString()}</small>`;
        } else {
            salesTotalLabel.innerText = `${totalSales.toLocaleString()} د.ع`;
        }
    }
    document.getElementById('month-total-expenses').innerText = `${totalExpenses.toLocaleString()} د.ع`;
    document.getElementById('month-total-salaries').innerText = `${totalSalaries.toLocaleString()} د.ع`;
    
    const netProfit = totalSales + totalDebtPayments - (totalExpenses + totalSalaries);
    const netProfitLabel = document.getElementById('month-net-profit');
    netProfitLabel.innerText = `${netProfit.toLocaleString()} د.ع`;
    netProfitLabel.style.color = netProfit >= 0 ? 'var(--primary)' : 'var(--danger)';
    
    const tbody = document.getElementById('monthly-items-breakdown-body');
    tbody.innerHTML = '';
    
    const itemIds = Object.keys(productSalesMap).filter(id => productSalesMap[id].quantity > 0);
    if (itemIds.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center" style="color:var(--text-muted); padding:20px;">لم يتم تسجيل مبيعات بضائع لهذا الشهر بعد.</td></tr>`;
    } else {
        itemIds.forEach(id => {
            const data = productSalesMap[id];
            const avgPrice = data.quantity > 0 ? Math.round(data.totalPrice / data.quantity) : 0;
            tbody.innerHTML += `
                <tr>
                    <td style="font-weight:700;">${data.name}</td>
                    <td style="font-family:'Inter'; text-align: center; font-weight:700;">${data.quantity}</td>
                    <td class="price-value" style="font-family:'Inter';">${avgPrice.toLocaleString()} د.ع</td>
                    <td class="price-value" style="font-family:'Inter'; font-weight:800; color:var(--primary);">${data.totalPrice.toLocaleString()} د.ع</td>
                </tr>
            `;
        });
    }
    
    const sourceBody = document.getElementById('monthly-sources-breakdown-body');
    if (sourceBody) {
        sourceBody.innerHTML = '';
        const sourceKeys = Object.keys(sourceSalesMap).filter(src => sourceSalesMap[src].quantity > 0);
        if (sourceKeys.length === 0) {
            sourceBody.innerHTML = `<tr><td colspan="5" class="text-center" style="color:var(--text-muted); padding:20px;">لا توجد بيانات متاحة.</td></tr>`;
        } else {
            sourceKeys.forEach(src => {
                const data = sourceSalesMap[src];
                sourceBody.innerHTML += `
                    <tr>
                        <td style="font-weight:700;">${src}</td>
                        <td style="font-family:'Inter'; text-align: center; font-weight:700;">${data.quantity}</td>
                        <td class="price-value" style="font-family:'Inter'; color:var(--primary);">${data.totalSales.toLocaleString()} د.ع</td>
                        <td class="price-value" style="font-family:'Inter'; color:var(--danger);">${data.totalCost.toLocaleString()} د.ع</td>
                        <td class="price-value" style="font-family:'Inter'; font-weight:800; color:${data.netProfit >= 0 ? 'var(--primary)' : 'var(--danger)'};">${data.netProfit.toLocaleString()} د.ع</td>
                    </tr>
                `;
            });
        }
    }
    
    detailsDiv.style.display = 'block';
}

// Chart.js Visualizations
let reportsChart = null;
function renderMonthlyChartVisuals() {
    const canvas = document.getElementById('monthly-reports-chart');
    if (!canvas) return;
    
    // Group data by Month from transactions directly
    const groups = {};
    
    AppState.transactions.forEach(t => {
        const dateObj = new Date(t.timestamp || Date.now());
        const mStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
        
        if (!groups[mStr]) {
            groups[mStr] = { sales: 0, expenses: 0, profit: 0 };
        }
        
        if (t.type === 'sale') {
            if (t.paymentType !== 'credit') {
                groups[mStr].sales += t.total;
                groups[mStr].profit += t.total;
            }
        } else if (t.type === 'debt_payment') {
            groups[mStr].sales += t.amount;
            groups[mStr].profit += t.amount;
        } else if (t.type === 'salary' && t.direction === 'in') {
            groups[mStr].sales += t.amount;
            groups[mStr].profit += t.amount;
        } else if (t.type === 'expense' || t.type === 'salary') {
            groups[mStr].expenses += t.amount;
            groups[mStr].profit -= t.amount;
        }
    });
    
    // Prepare arrays for Chart.js
    const labels = Object.keys(groups).sort();
    const salesData = [];
    const expensesData = [];
    const profitData = [];
    
    labels.forEach(l => {
        salesData.push(groups[l].sales);
        expensesData.push(groups[l].expenses);
        profitData.push(groups[l].profit);
    });
    
    // Friendly month labels in Arabic
    const friendlyLabels = labels.map(l => {
        const parts = l.split('-');
        const monthsAr = ["كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران", "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول"];
        return `${monthsAr[parseInt(parts[1])-1]} ${parts[0]}`;
    });
    
    if (reportsChart) {
        reportsChart.destroy();
    }
    
    if (typeof Chart === 'undefined') return;
    
    const ctx = canvas.getContext('2d');
    reportsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: friendlyLabels,
            datasets: [
                {
                    label: 'الوارد (المبيعات) د.ع',
                    data: salesData,
                    backgroundColor: 'rgba(59, 130, 246, 0.45)',
                    borderColor: 'var(--primary)',
                    borderWidth: 2,
                    borderRadius: 6
                },
                {
                    label: 'الصادر (المصاريف والرواتب) د.ع',
                    data: expensesData,
                    backgroundColor: 'rgba(239, 68, 68, 0.45)',
                    borderColor: 'var(--danger)',
                    borderWidth: 2,
                    borderRadius: 6
                },
                {
                    label: 'صافي الربح د.ع',
                    data: profitData,
                    type: 'line',
                    borderColor: 'var(--accent)',
                    backgroundColor: 'transparent',
                    pointBackgroundColor: 'var(--accent)',
                    borderWidth: 3,
                    tension: 0.35,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        font: { family: 'Cairo', size: 11 },
                        color: 'var(--text-main)'
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: document.body.classList.contains('light-mode') ? 'rgba(15, 23, 42, 0.05)' : 'rgba(255,255,255,0.03)' },
                    ticks: { font: { family: 'Cairo', size: 10 }, color: 'var(--text-muted)' }
                },
                y: {
                    grid: { color: document.body.classList.contains('light-mode') ? 'rgba(15, 23, 42, 0.05)' : 'rgba(255,255,255,0.03)' },
                    ticks: { font: { family: 'Inter', size: 10 }, color: 'var(--text-muted)' }
                }
            }
        }
    });
}

// --- INVENTORY (MUKHZAN) WORKSPACE ---
let currentInventoryFilter = 'all';
function setInventoryFilter(filterType) {
    currentInventoryFilter = filterType;
    document.querySelectorAll('#inventory-panel .sub-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.getElementById(`inv-filter-${filterType}`);
    if (activeBtn) activeBtn.classList.add('active');
    renderInventoryTable();
}

function renderInventoryTable() {
    const tbody = document.getElementById('inventory-table-body');
    if (!tbody) return;
    
    // 1. Calculate stats first (on full products list)
    let uniqueTypes = AppState.products.length;
    let totalQty = 0;
    let totalCostValue = 0;
    let totalSellingValue = 0;
    
    AppState.products.forEach(p => {
        totalQty += p.qty;
        totalCostValue += p.qty * p.cost;
        totalSellingValue += p.qty * p.price;
    });
    
    let expectedProfit = totalSellingValue - totalCostValue;
    
    // Update stats labels
    const typesLabel = document.getElementById('inventory-stat-types');
    const qtyLabel = document.getElementById('inventory-stat-qty');
    const costLabel = document.getElementById('inventory-stat-cost');
    const priceLabel = document.getElementById('inventory-stat-price');
    const profitLabel = document.getElementById('inventory-stat-profit');
    
    if (typesLabel) typesLabel.innerText = uniqueTypes;
    if (qtyLabel) qtyLabel.innerText = `${totalQty.toLocaleString()} قطعة`;
    if (costLabel) costLabel.innerText = `${totalCostValue.toLocaleString()} د.ع`;
    if (priceLabel) priceLabel.innerText = `${totalSellingValue.toLocaleString()} د.ع`;
    if (profitLabel) {
        profitLabel.innerText = `${expectedProfit.toLocaleString()} د.ع`;
        profitLabel.style.color = expectedProfit >= 0 ? '#ec4899' : 'var(--danger)';
    }
    
    tbody.innerHTML = '';
    
    const filterInput = document.getElementById('inventory-search-input');
    const query = filterInput ? filterInput.value.trim().toLowerCase() : '';
    
    // Apply search AND tab filters
    const filtered = AppState.products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(query) || p.barcode.includes(query);
        let matchesTab = true;
        if (currentInventoryFilter === 'low') {
            matchesTab = p.qty > 0 && p.qty <= 5;
        } else if (currentInventoryFilter === 'empty') {
            matchesTab = p.qty <= 0;
        }
        return matchesSearch && matchesTab;
    });
    
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="color:var(--text-muted); padding:30px;">لا يوجد عناصر متطابقة في المخزن.</td></tr>`;
        return;
    }
    
    filtered.forEach(p => {
        let stockBadge = '';
        if (p.qty <= 0) {
            stockBadge = `<span class="badge danger">منتهي</span>`;
        } else if (p.qty <= 5) {
            stockBadge = `<span class="badge warning">منخفض: ${p.qty}</span>`;
        } else {
            stockBadge = `<span class="badge success">متوفر: ${p.qty}</span>`;
        }
        
        tbody.innerHTML += `
            <tr>
                <td style="font-family:'Inter'; font-weight:700;">${p.barcode}</td>
                <td style="font-weight:700;">${p.name}</td>
                <td class="price-value">${p.cost.toLocaleString()} د.ع</td>
                <td class="price-value">${p.price.toLocaleString()} د.ع</td>
                <td>${stockBadge}</td>
                ${AppState.currentUser && AppState.currentUser.role === 'manager' ? `
                <td>
                    <button class="btn btn-secondary btn-sm" onclick="openProductEditModal('${p.id}')"><i class="fa-regular fa-pen-to-square"></i> تعديل</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteProductItem('${p.id}')"><i class="fa-regular fa-trash-can"></i></button>
                </td>
                ` : `<td style="color:var(--text-muted); font-size:11px; text-align:center;"><i class="fa-solid fa-lock"></i></td>`}
            </tr>
        `;
    });
}

function filterInventory() {
    renderInventoryTable();
}

function toggleProductQtyFields(isExisting, prod = null) {
    const qtyInput = document.getElementById('prod-qty');
    const newQtyGroup = document.getElementById('prod-new-qty-group');
    const newQtyInput = document.getElementById('prod-new-qty');
    const qtyLabel = document.getElementById('prod-qty-label');
    const costUsdInput = document.getElementById('prod-cost-usd');
    
    if (isExisting) {
        qtyInput.readOnly = true;
        qtyInput.style.opacity = '0.7';
        if (newQtyGroup) newQtyGroup.style.display = 'block';
        if (newQtyInput) newQtyInput.value = 0;
        if (qtyLabel) qtyLabel.innerText = "الكمية الحالية بالمستودع";
        
        if (prod) {
            const usdRate = AppState.settings.usdExchangeRate || 1500;
            if (prod.costUsd !== undefined && prod.costUsd > 0) {
                costUsdInput.value = prod.costUsd;
            } else {
                costUsdInput.value = (prod.cost / usdRate).toFixed(2);
            }
        }
    } else {
        qtyInput.readOnly = false;
        qtyInput.style.opacity = '1';
        if (newQtyGroup) newQtyGroup.style.display = 'none';
        if (newQtyInput) newQtyInput.value = 0;
        if (qtyLabel) qtyLabel.innerText = "الكمية المدخلة للمستودع";
        if (costUsdInput) costUsdInput.value = "";
    }
}

function convertUsdToIqdCost() {
    const usdCostInput = document.getElementById('prod-cost-usd');
    const iqdCostInput = document.getElementById('prod-cost');
    if (!usdCostInput || !iqdCostInput) return;
    
    const usdCost = parseFloat(usdCostInput.value) || 0;
    const usdExchangeRate = AppState.settings.usdExchangeRate || 1500;
    
    if (usdCost > 0) {
        iqdCostInput.value = Math.round(usdCost * usdExchangeRate);
    }
}

function openProductAddModal() {
    if (AppState.currentUser && AppState.currentUser.role !== 'manager') {
        alert("غير مصرح لك بإضافة المنتجات.");
        return;
    }
    document.getElementById('modal-prod-title').innerText = "إضافة عنصر جديد للمستودع";
    document.getElementById('prod-id').value = "";
    document.getElementById('prod-barcode').value = "";
    document.getElementById('prod-name').value = "";
    document.getElementById('prod-cost-usd').value = "";
    document.getElementById('prod-cost').value = "";
    document.getElementById('prod-price').value = "";
    document.getElementById('prod-qty').value = "";
    document.getElementById('prod-source').value = "";
    if (document.getElementById('prod-invoice')) {
        document.getElementById('prod-invoice').value = "";
    }
    
    toggleProductQtyFields(false);
    
    document.getElementById('product-modal').classList.add('active');
}

function openProductEditModal(productId) {
    if (AppState.currentUser && AppState.currentUser.role !== 'manager') {
        alert("غير مصرح لك بتعديل المنتجات.");
        return;
    }
    const prod = AppState.products.find(p => p.id === productId);
    if (!prod) return;
    
    document.getElementById('modal-prod-title').innerText = "تعديل بيانات المنتج";
    document.getElementById('prod-id').value = prod.id;
    document.getElementById('prod-barcode').value = prod.barcode;
    document.getElementById('prod-name').value = prod.name;
    document.getElementById('prod-cost').value = prod.cost;
    document.getElementById('prod-price').value = prod.price;
    document.getElementById('prod-qty').value = prod.qty;
    document.getElementById('prod-source').value = prod.source || "";
    if (document.getElementById('prod-invoice')) {
        document.getElementById('prod-invoice').value = "";
    }
    
    toggleProductQtyFields(true, prod);
    
    document.getElementById('product-modal').classList.add('active');
}

function closeProductModal() {
    document.getElementById('product-modal').classList.remove('active');
}

function handleSaveProduct(e) {
    if (e) e.preventDefault();
    
    const id = document.getElementById('prod-id').value;
    const barcode = document.getElementById('prod-barcode').value.trim();
    const name = document.getElementById('prod-name').value.trim();
    const cost = parseInt(document.getElementById('prod-cost').value) || 0;
    const price = parseInt(document.getElementById('prod-price').value) || 0;
    const qty = parseInt(document.getElementById('prod-qty').value) || 0;
    const newQty = parseInt(document.getElementById('prod-new-qty').value) || 0;
    const costUsd = parseFloat(document.getElementById('prod-cost-usd').value) || 0;
    const source = document.getElementById('prod-source').value.trim() || "غير محدد";
    const invoiceEl = document.getElementById('prod-invoice');
    const invoice = invoiceEl ? invoiceEl.value.trim() : "غير محدد";
    
    if (!barcode || !name || cost <= 0 || price <= 0 || qty < 0) {
        alert("يرجى تعبئة كافة الحقول بشكل صحيح وقيم موجبة!");
        return;
    }
    
    let finalQty = qty;
    let addedQty = 0;
    let addedReportEntry = null;
    
    if (id) {
        // Edit Mode
        const prodIndex = AppState.products.findIndex(p => p.id === id);
        if (prodIndex > -1) {
            const oldQty = AppState.products[prodIndex].qty || 0;
            addedQty = newQty;
            finalQty = oldQty + addedQty;
            
            AppState.products[prodIndex] = { id, barcode, name, cost, price, qty: finalQty, costUsd, source };
            
            if (addedQty > 0) {
                addedReportEntry = {
                    date: new Date().toISOString(),
                    name: name,
                    qty: addedQty,
                    invoice: invoice,
                    source: source
                };
                if (!AppState.newProductsReport) AppState.newProductsReport = [];
                AppState.newProductsReport.push(addedReportEntry);
            }
        }
    } else {
        // Add Mode
        const dup = AppState.products.find(p => p.barcode === barcode);
        if (dup) {
            alert(`تنبيه: هذا المنتج موجود مسبقاً باسم: ${dup.name}. سيتم دمج الكمية والتعديل.`);
            addedQty = newQty > 0 ? newQty : qty;
            finalQty = dup.qty + addedQty;
            
            dup.name = name;
            dup.cost = cost;
            dup.costUsd = costUsd;
            dup.price = price;
            dup.qty = finalQty;
            dup.source = source;
            
            if (addedQty > 0) {
                addedReportEntry = {
                    date: new Date().toISOString(),
                    name: name,
                    qty: addedQty,
                    invoice: invoice,
                    source: source
                };
                if (!AppState.newProductsReport) AppState.newProductsReport = [];
                AppState.newProductsReport.push(addedReportEntry);
            }
        } else {
            finalQty = qty;
            addedQty = qty;
            const newProduct = {
                id: "p_" + Date.now(),
                barcode, name, cost, price, qty: finalQty, costUsd, source
            };
            AppState.products.push(newProduct);
            
            if (addedQty > 0) {
                addedReportEntry = {
                    date: new Date().toISOString(),
                    name: name,
                    qty: addedQty,
                    invoice: invoice,
                    source: source
                };
                if (!AppState.newProductsReport) AppState.newProductsReport = [];
                AppState.newProductsReport.push(addedReportEntry);
            }
        }
    }
    
    AppState.saveAll();
    
    // Sync all inventory to Google Sheets/Firebase
    SyncManager.dispatchSync("products", AppState.products, "inventory_master");
    
    // Sync product addition report log entry if added
    if (addedReportEntry) {
        const docId = "NP-" + new Date(addedReportEntry.date).getTime();
        SyncManager.dispatchSync("new_products", addedReportEntry, docId);
    }
    
    closeProductModal();
    playBeep('success');
    renderInventoryTable();
    
    alert("تم حفظ بيانات الصنف الجديد وتحديث قواعد البيانات سحابياً.");
}

function deleteProductItem(productId) {
    if (AppState.currentUser && AppState.currentUser.role !== 'manager') {
        alert("غير مصرح لك بحذف المنتجات.");
        return;
    }
    if (!confirm("هل أنت متأكد تماماً من رغبتك بحذف هذا المنتج نهائياً من المستودع؟")) return;
    
    const index = AppState.products.findIndex(p => p.id === productId);
    if (index > -1) {
        AppState.products.splice(index, 1);
        AppState.saveAll();
        
        // Update to Sheets
        SyncManager.dispatchSync("products", AppState.products, "inventory_master");
        
        playBeep('success');
        renderInventoryTable();
    }
}

// --- NEW PRODUCTS REPORT ---
function renderNewProductsReport(filterText = '') {
    const tbody = document.getElementById('new-products-report-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    let reports = AppState.newProductsReport || [];
    
    if (filterText) {
        const lowerFilter = filterText.toLowerCase();
        reports = reports.filter(r => 
            (r.name && r.name.toLowerCase().includes(lowerFilter)) ||
            (r.invoice && r.invoice.toLowerCase().includes(lowerFilter)) ||
            (r.source && r.source.toLowerCase().includes(lowerFilter))
        );
    }
    
    // Sort by date descending
    reports.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    if (reports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="color:var(--text-muted); padding:30px;">لا توجد إضافات منتجات مطابقة أو مسجلة.</td></tr>`;
        return;
    }
    
    reports.forEach(r => {
        const dt = new Date(r.date).toLocaleString('ar-IQ', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        tbody.innerHTML += `
            <tr>
                <td>${dt}</td>
                <td style="font-weight: bold;">${r.name}</td>
                <td>${r.qty}</td>
                <td style="font-family:'Inter';">${r.invoice || '-'}</td>
                <td>${r.source || '-'}</td>
            </tr>
        `;
    });
}

function filterNewProductsReport() {
    const searchInput = document.getElementById('new-products-search');
    const filterText = searchInput ? searchInput.value.trim() : '';
    renderNewProductsReport(filterText);
}

// --- TRANSACTION EDIT & DELETE OPERATIONS ---
function openEditTxModal(txId) {
    if (AppState.currentUser && AppState.currentUser.role !== 'manager') {
        playBeep('error');
        alert("خطأ: غير مسموح بالدخول. تعديل المعاملات متاح لمدير النظام فقط!");
        return;
    }
    
    const tx = AppState.transactions.find(t => t.id === txId);
    if (!tx) {
        alert("خطأ: لم يتم العثور على المعاملة المطلوبة!");
        return;
    }
    
    document.getElementById('edit-tx-id').value = tx.id;
    document.getElementById('edit-tx-amount').value = tx.type === 'sale' ? tx.total : tx.amount;
    document.getElementById('edit-tx-desc').value = tx.description || (tx.type === 'sale' ? `فاتورة مبيعات واردة بقيمة ${tx.total.toLocaleString()} د.ع` : '');
    
    document.getElementById('edit-tx-modal').classList.add('active');
    playBeep('success');
}

function closeEditTxModal() {
    document.getElementById('edit-tx-modal').classList.remove('active');
}

function handleSaveEditTx(e) {
    if (e) e.preventDefault();
    
    if (AppState.currentUser && AppState.currentUser.role !== 'manager') {
        playBeep('error');
        alert("خطأ: غير مسموح بالدخول. تعديل المعاملات متاح لمدير النظام فقط!");
        return;
    }
    
    const txId = document.getElementById('edit-tx-id').value;
    const newAmount = parseInt(document.getElementById('edit-tx-amount').value) || 0;
    const newDesc = document.getElementById('edit-tx-desc').value.trim();
    
    if (newAmount <= 0) {
        alert("يرجى إدخال مبلغ مالي صحيح وموجب!");
        return;
    }
    
    const tx = AppState.transactions.find(t => t.id === txId);
    if (!tx) {
        alert("خطأ: لم يتم العثور على المعاملة لتعديلها!");
        return;
    }
    
    // Update Transaction in Master List
    if (tx.type === 'sale') {
        tx.total = newAmount;
        if (tx.discount === 0) {
            tx.subtotal = newAmount;
        } else {
            tx.subtotal = newAmount + tx.discount;
        }
    } else {
        tx.amount = newAmount;
    }
    tx.description = newDesc;
    tx.lastEditedAt = new Date().toISOString();
    tx.editedBy = AppState.currentUser ? AppState.currentUser.name : "المدير";
    
    // If Salary withdrawal, we must update the employee withdrawal records as well
    if (tx.type === 'salary') {
        const emp = AppState.employees.find(emp => emp.id === tx.employeeId);
        if (emp) {
            const wIdx = emp.withdrawals.findIndex(w => w.id === tx.id);
            if (wIdx > -1) {
                emp.withdrawals[wIdx].amount = newAmount;
                emp.withdrawals[wIdx].description = newDesc;
                emp.withdrawals[wIdx].lastEditedAt = new Date().toISOString();
            }
        }
    }
    
    AppState.saveAll();
    
    // Sync to Cloud
    SyncManager.dispatchSync(tx.type === 'sale' ? 'sales' : (tx.type === 'expense' ? 'expenses' : 'salaries'), tx, tx.id);
    if (tx.type === 'salary') {
        SyncManager.syncToSheets("salaries_employees_master", AppState.employees);
    }
    
    // Refresh tables and views
    renderExpenseTable();
    renderReportsDashboard();
    renderEmployeeLedgerCards();
    calculateTreasuryReconciliation();
    
    // Close modal
    closeEditTxModal();
    playBeep('success');
    alert("تم تعديل القيد المالي بنجاح وحفظ التغييرات سحابياً.");
}

function deleteTransaction(txId) {
    if (AppState.currentUser && AppState.currentUser.role !== 'manager') {
        playBeep('error');
        alert("خطأ: غير مسموح بالدخول. حذف المعاملات متاح لمدير النظام فقط!");
        return;
    }
    
    if (!confirm("تحذير: هل أنت متأكد تماماً من رغبتك في حذف وإلغاء هذا القيد المالي نهائياً؟")) {
        return;
    }
    
    const txIndex = AppState.transactions.findIndex(t => t.id === txId);
    if (txIndex === -1) {
        alert("خطأ: لم يتم العثور على المعاملة المطلوبة!");
        return;
    }
    
    const tx = AppState.transactions[txIndex];
    
    // Reverse/Adjust side-effects of deletion
    if (tx.type === 'sale') {
        // Restock inventory for items in sale
        if (Array.isArray(tx.items)) {
            tx.items.forEach(item => {
                const prod = AppState.products.find(p => p.id === item.id);
                if (prod) {
                    prod.qty += item.quantity;
                }
            });
        }
        // Update Sheets and Firestore with restocked products
        SyncManager.dispatchSync("products", AppState.products, "inventory_master");
    } else if (tx.type === 'salary') {
        // Remove withdrawal log from employee file
        const emp = AppState.employees.find(emp => emp.id === tx.employeeId);
        if (emp) {
            emp.withdrawals = emp.withdrawals.filter(w => w.id !== tx.id);
            SyncManager.syncToSheets("salaries_employees_master", AppState.employees);
        }
    }
    
    // Remove transaction from master
    AppState.transactions.splice(txIndex, 1);
    AppState.saveAll();
    
    // Sync deletion to cloud
    SyncManager.dispatchSync(tx.type === 'sale' ? 'sales_delete' : (tx.type === 'expense' ? 'expenses_delete' : 'salaries_delete'), { id: txId }, txId);
    
    // Refresh tables and views
    renderExpenseTable();
    renderReportsDashboard();
    renderEmployeeLedgerCards();
    calculateTreasuryReconciliation();
    
    playBeep('success');
    alert("تم حذف وإلغاء القيد المالي بنجاح، وإعادة ضبط المخزن/رواتب الموظفين.");
}

// --- EMPLOYEE EDIT OPERATIONS ---
function openEditEmployeeModal(empId) {
    if (AppState.currentUser && AppState.currentUser.role !== 'manager') {
        playBeep('error');
        alert("خطأ: غير مسموح بالدخول. تعديل بيانات الموظفين متاح لمدير النظام فقط!");
        return;
    }
    
    const emp = AppState.employees.find(e => e.id === empId);
    if (!emp) {
        alert("خطأ: لم يتم العثور على الموظف!");
        return;
    }
    
    document.getElementById('edit-emp-id').value = emp.id;
    document.getElementById('edit-emp-name').value = emp.name;
    document.getElementById('edit-emp-salary').value = emp.salary;
    document.getElementById('edit-emp-salary-day').value = emp.salaryDay || 1;
    
    document.getElementById('edit-employee-modal').classList.add('active');
    playBeep('success');
}

function closeEditEmployeeModal() {
    document.getElementById('edit-employee-modal').classList.remove('active');
}

function handleSaveEditEmployee(e) {
    if (e) e.preventDefault();
    
    if (AppState.currentUser && AppState.currentUser.role !== 'manager') {
        playBeep('error');
        alert("خطأ: غير مسموح بالدخول. تعديل بيانات الموظفين متاح لمدير النظام فقط!");
        return;
    }
    
    const empId = document.getElementById('edit-emp-id').value;
    const newName = document.getElementById('edit-emp-name').value.trim();
    const newSalary = parseInt(document.getElementById('edit-emp-salary').value) || 0;
    const newSalaryDay = parseInt(document.getElementById('edit-emp-salary-day').value) || 1;
    
    if (!newName || newSalary <= 0 || newSalaryDay < 1 || newSalaryDay > 31) {
        alert("يرجى إدخال اسم صحيح وراتب شهري موجب ويوم راتب صحيح (1-31)!");
        return;
    }
    
    const emp = AppState.employees.find(e => e.id === empId);
    if (!emp) {
        alert("خطأ: لم يتم العثور على الموظف لتعديله!");
        return;
    }
    
    if (newName !== emp.name) {
        const dup = AppState.employees.find(e => e.name === newName && e.id !== empId);
        if (dup) {
            alert("خطأ: يوجد موظف آخر مسجل بهذا الاسم بالفعل!");
            return;
        }
    }
    
    // Update employee master record
    emp.name = newName;
    emp.salary = newSalary;
    emp.salaryDay = newSalaryDay;
    
    AppState.saveAll();
    
    // Sync to Cloud
    SyncManager.dispatchSync("employees", AppState.employees, "employees_master");
    
    // Refresh interfaces
    renderSettingsEmployeesList();
    loadEmployeesUI();
    renderEmployeeLedgerCards();
    
    // Close modal
    closeEditEmployeeModal();
    playBeep('success');
    alert("تم تعديل بيانات وراتب الموظف بنجاح وحفظها سحابياً.");
}

// --- CONFIGURATIONS & SETTINGS ---
function switchSettingsSection(sectionId) {
    const navButtons = document.querySelectorAll('.settings-nav-btn');
    navButtons.forEach(btn => btn.classList.remove('active'));
    
    const activeBtn = document.getElementById('setnav-' + sectionId);
    if (activeBtn) activeBtn.classList.add('active');
    
    const sections = document.querySelectorAll('.settings-section');
    sections.forEach(sec => sec.classList.remove('active'));
    
    const activeSec = document.getElementById('settings-section-' + sectionId);
    if (activeSec) activeSec.classList.add('active');
}

function loadSettingsUI() {
    const cashInput = document.getElementById('setting-starting-cash');
    if (cashInput) {
        cashInput.value = AppState.settings.startingCash;
    }
    const rateInput = document.getElementById('setting-usd-exchange-rate');
    if (rateInput) {
        rateInput.value = AppState.settings.usdExchangeRate || 1500;
    }
    
    const fbApiKeyInput = document.getElementById('setting-fb-api-key');
    const fbProjIdInput = document.getElementById('setting-fb-proj-id');
    
    if (fbApiKeyInput) fbApiKeyInput.value = AppState.settings.firebaseConfig?.apiKey || '';
    if (fbProjIdInput) fbProjIdInput.value = AppState.settings.firebaseConfig?.projectId || '';
    
    renderSettingsUsersList();
    renderSettingsEmployeesList();
    renderSettingsDiscountsList();
}

// --- CASHIER DISCOUNT RULES MANAGEMENT ---
function renderSettingsDiscountsList() {
    const listBody = document.getElementById('settings-discounts-list');
    if (!listBody) return;
    
    listBody.innerHTML = '';
    const rules = AppState.settings.cashierDiscounts || [];
    
    if (rules.length === 0) {
        listBody.innerHTML = `<tr><td colspan="4" class="text-center" style="color:var(--text-muted); padding:20px;">لا توجد قواعد خصم مخصصة.</td></tr>`;
        return;
    }
    
    const sortedRules = [...rules].sort((a, b) => b.from - a.from);
    
    sortedRules.forEach(rule => {
        listBody.innerHTML += `
            <tr>
                <td style="font-family:'Inter'; font-weight:700;">${rule.from.toLocaleString()} د.ع</td>
                <td style="font-family:'Inter'; font-weight:700;">${rule.to.toLocaleString()} د.ع</td>
                <td style="font-family:'Inter'; font-weight:800; color:var(--primary);">${rule.maxDiscount.toLocaleString()} د.ع</td>
                <td>
                    <button type="button" class="btn btn-danger btn-sm" onclick="deleteDiscountRule(${rule.from}, ${rule.to})">
                        <i class="fa-solid fa-trash-can"></i> حذف
                    </button>
                </td>
            </tr>
        `;
    });
}

function addNewDiscountRule(e) {
    if (e) e.preventDefault();
    
    const fromVal = parseInt(document.getElementById('new-disc-from').value) || 0;
    const toVal = parseInt(document.getElementById('new-disc-to').value) || 0;
    const maxVal = parseInt(document.getElementById('new-disc-max').value) || 0;
    
    if (fromVal < 0 || toVal <= fromVal || maxVal < 0) {
        alert("يرجى إدخال قيم صحيحة وموجبة! يجب أن يكون الحد الأقصى للنطاق أكبر من الحد الأدنى.");
        return;
    }
    
    if (!AppState.settings.cashierDiscounts) {
        AppState.settings.cashierDiscounts = [];
    }
    
    const dup = AppState.settings.cashierDiscounts.find(r => r.from === fromVal && r.to === toVal);
    if (dup) {
        alert("تنبيه: توجد قاعدة خصم مسجلة بالفعل بنفس هذا النطاق السعري بالضبط!");
        return;
    }
    
    AppState.settings.cashierDiscounts.push({
        from: fromVal,
        to: toVal,
        maxDiscount: maxVal
    });
    
    AppState.saveAll();
    
    SyncManager.dispatchSync("settings", AppState.settings, "settings_config");
    
    document.getElementById('new-disc-from').value = '';
    document.getElementById('new-disc-to').value = '';
    document.getElementById('new-disc-max').value = '';
    
    renderSettingsDiscountsList();
    playBeep('success');
    alert("تم إضافة قاعدة الخصم الجديدة وحفظ الإعدادات سحابياً بنجاح.");
}

function deleteDiscountRule(from, to) {
    if (!confirm("هل أنت متأكد من رغبتك في حذف قاعدة الخصم هذه؟")) return;
    
    AppState.settings.cashierDiscounts = (AppState.settings.cashierDiscounts || []).filter(
        rule => !(rule.from === from && rule.to === to)
    );
    
    AppState.saveAll();
    
    SyncManager.dispatchSync("settings", AppState.settings, "settings_config");
    
    renderSettingsDiscountsList();
    playBeep('success');
}

function saveSystemConfigurations(e) {
    if (e) e.preventDefault();
    
    const startingCash = parseInt(document.getElementById('setting-starting-cash').value) || 0;
    const usdExchangeRate = parseInt(document.getElementById('setting-usd-exchange-rate').value) || 1500;
    
    AppState.settings.startingCash = startingCash;
    AppState.settings.usdExchangeRate = usdExchangeRate;
    AppState.saveAll();
    
    SyncManager.dispatchSync("settings", AppState.settings, "settings_config");
    
    alert("تم حفظ إعدادات الدرج وسعر صرف الدولار بنجاح.");
}

function saveCloudConfigurations(e) {
    if (e) e.preventDefault();
    
    const apiKey = document.getElementById('setting-fb-api-key').value.trim();
    const projectId = document.getElementById('setting-fb-proj-id').value.trim();
    
    if (!AppState.settings.firebaseConfig) {
        AppState.settings.firebaseConfig = { apiKey: "", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: "" };
    }
    
    if (apiKey) AppState.settings.firebaseConfig.apiKey = apiKey;
    if (projectId) AppState.settings.firebaseConfig.projectId = projectId;
    
    AppState.saveAll();
    
    // Reinitialize Firestore connections
    SyncManager.initFirebase();
    
    alert("تم حفظ إعدادات الاتصال بقاعدة بيانات Firebase وتفعيل المزامنة بنجاح.");
}

// --- EMPLOYEE MANAGER IN SETTINGS ---
function addNewEmployee(e) {
    if (e) e.preventDefault();
    
    const name = document.getElementById('new-emp-name').value.trim();
    const salary = parseInt(document.getElementById('new-emp-salary').value) || 0;
    const salaryDay = parseInt(document.getElementById('new-emp-salary-day').value) || 1;
    
    if (!name || salary <= 0 || salaryDay < 1 || salaryDay > 31) {
        alert("يرجى إدخال اسم الموظف وراتب شهري صحيح ويوم استلام الراتب (1-31)!");
        return;
    }
    
    const dup = AppState.employees.find(emp => emp.name === name);
    if (dup) {
        alert("خطأ: يوجد موظف مسجل بهذا الاسم بالفعل!");
        return;
    }
    
    const newEmp = {
        id: "e_" + Date.now(),
        name: name,
        salary: salary,
        salaryDay: salaryDay,
        withdrawals: []
    };
    
    AppState.employees.push(newEmp);
    AppState.saveAll();
    
    SyncManager.dispatchSync("employees", AppState.employees, "employees_master");
    
    // Clear form
    document.getElementById('new-emp-name').value = '';
    document.getElementById('new-emp-salary').value = '';
    document.getElementById('new-emp-salary-day').value = '';
    
    playBeep('success');
    renderSettingsEmployeesList();
    
    // Refresh employee dropdown in Expenses panel
    loadEmployeesUI();
    
    alert("تم تسجيل الموظف الجديد بنجاح وتحديد راتبه.");
}

function deleteEmployee(index) {
    if (!confirm("هل أنت متأكد تماماً من رغبتك في حذف هذا الموظف؟ سيؤدي ذلك لحذف كشف سحوباته التراكمي أيضاً!")) {
        return;
    }
    
    AppState.employees.splice(index, 1);
    AppState.saveAll();
    
    SyncManager.dispatchSync("employees", AppState.employees, "employees_master");
    
    playBeep('success');
    renderSettingsEmployeesList();
    
    // Refresh employee dropdown in Expenses panel
    loadEmployeesUI();
}

function renderSettingsEmployeesList() {
    const listDiv = document.getElementById('settings-employees-list');
    if (!listDiv) return;
    
    listDiv.innerHTML = '';
    AppState.employees.forEach((emp, idx) => {
        const initial = emp.name.trim().charAt(0);
        listDiv.innerHTML += `
            <div class="settings-list-item">
                <div class="settings-item-info">
                    <div class="settings-avatar orange">${initial}</div>
                    <div class="settings-details">
                        <span class="settings-title">${emp.name}</span>
                        <span class="settings-subtitle">الراتب الشهري: ${emp.salary.toLocaleString()} د.ع</span>
                    </div>
                </div>
                <div class="settings-actions">
                    <button class="btn btn-secondary btn-sm" onclick="openEditEmployeeModal('${emp.id}')" title="تعديل الموظف">
                        <i class="fa-regular fa-pen-to-square"></i>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="deleteEmployee(${idx})" title="حذف الموظف">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
        `;
    });
}

function renderSettingsUsersList() {
    const listDiv = document.getElementById('settings-users-list');
    if (!listDiv) return;
    
    listDiv.innerHTML = '';
    AppState.users.forEach((usr, idx) => {
        const initial = usr.name.trim().charAt(0);
        const isManager = usr.role === 'manager';
        const avatarClass = isManager ? 'blue' : 'red';
        const roleLabel = isManager ? 'مدير' : 'كاشير';
        
        const actionHtml = usr.username !== 'admin' ? `
            <button class="btn btn-secondary btn-sm" onclick="openEditUserModal(${idx})" title="تعديل الحساب">
                <i class="fa-regular fa-pen-to-square"></i>
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteSystemUser(${idx})" title="حذف الحساب">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        ` : `
            <button class="btn btn-secondary btn-sm" onclick="openEditUserModal(${idx})" title="تعديل الحساب">
                <i class="fa-regular fa-pen-to-square"></i>
            </button>
            <span class="settings-badge" style="color: var(--primary);"><i class="fa-solid fa-shield-halved"></i> أساسي</span>
        `;
        
        listDiv.innerHTML += `
            <div class="settings-list-item">
                <div class="settings-item-info">
                    <div class="settings-avatar ${avatarClass}">${initial}</div>
                    <div class="settings-details">
                        <span class="settings-title">${usr.name}</span>
                        <span class="settings-subtitle">المعرف: ${usr.username}</span>
                    </div>
                </div>
                <div class="settings-actions">
                    <span class="settings-badge">${roleLabel}</span>
                    ${actionHtml}
                </div>
            </div>
        `;
    });
}

function addNewSystemUser(e) {
    if (e) e.preventDefault();
    
    const name = document.getElementById('new-user-fullname').value.trim();
    const username = document.getElementById('new-user-uname').value.trim();
    const pass = document.getElementById('new-user-pass').value.trim();
    const role = document.getElementById('new-user-role').value;
    
    if (!name || !username || !pass) {
        alert("يرجى ملئ كافة بيانات الحساب الجديد!");
        return;
    }
    
    const dup = AppState.users.find(u => u.username === username);
    if (dup) {
        alert("خطأ: اسم المستخدم هذا محجوز ومستعمل مسبقاً!");
        return;
    }
    
    let permissions = ['invoice', 'expenses', 'reports', 'monthly-reports', 'treasury', 'inventory', 'settings'];
    if (role === 'cashier') {
        permissions = [];
        document.querySelectorAll('.new-user-perm').forEach(cb => {
            if (cb.checked) permissions.push(cb.value);
        });
    }
    
    AppState.users.push({ name, username, password: pass, role, permissions });
    AppState.saveAll();
    
    SyncManager.dispatchSync("users", AppState.users, "users_list");
    
    // Clear forms
    document.getElementById('new-user-fullname').value = '';
    document.getElementById('new-user-uname').value = '';
    document.getElementById('new-user-pass').value = '';
    
    playBeep('success');
    renderSettingsUsersList();
    alert("تم إنشاء مستخدم الموظف الجديد بنجاح ويمكنه تسجيل الدخول بالصلاحية المحددة.");
}

function deleteSystemUser(index) {
    if (!confirm("هل أنت متأكد تماماً من رغبتك بحذف هذا الحساب؟")) return;
    
    AppState.users.splice(index, 1);
    AppState.saveAll();
    
    SyncManager.dispatchSync("users", AppState.users, "users_list");
    
    playBeep('success');
    renderSettingsUsersList();
}

function openEditUserModal(index) {
    if (AppState.currentUser && AppState.currentUser.role !== 'manager') {
        playBeep('error');
        alert("خطأ: غير مسموح بالوصول. هذه الصلاحية لمدير النظام فقط!");
        return;
    }
    
    const usr = AppState.users[index];
    if (!usr) return;
    
    document.getElementById('edit-user-index').value = index;
    document.getElementById('edit-user-fullname').value = usr.name;
    document.getElementById('edit-user-uname').value = usr.username;
    document.getElementById('edit-user-pass').value = usr.password;
    document.getElementById('edit-user-role').value = usr.role;
    
    // Admin user cannot edit their own username or role to maintain system stability
    if (usr.username === 'admin') {
        document.getElementById('edit-user-uname').disabled = true;
        document.getElementById('edit-user-role').disabled = true;
    } else {
        document.getElementById('edit-user-uname').disabled = false;
        document.getElementById('edit-user-role').disabled = false;
    }
    
    const perms = usr.permissions || ['invoice'];
    document.querySelectorAll('.edit-user-perm').forEach(cb => {
        cb.checked = perms.includes(cb.value);
    });
    toggleEditUserPermissions();
    
    document.getElementById('edit-user-modal').classList.add('active');
    playBeep('success');
}

function closeEditUserModal() {
    document.getElementById('edit-user-modal').classList.remove('active');
}

function handleSaveEditUser(e) {
    if (e) e.preventDefault();
    
    if (AppState.currentUser && AppState.currentUser.role !== 'manager') {
        playBeep('error');
        alert("خطأ: غير مسموح بالوصول!");
        return;
    }
    
    const index = parseInt(document.getElementById('edit-user-index').value);
    const fullname = document.getElementById('edit-user-fullname').value.trim();
    const username = document.getElementById('edit-user-uname').value.trim();
    const pass = document.getElementById('edit-user-pass').value.trim();
    
    const usr = AppState.users[index];
    if (!usr) return;
    
    if (!fullname || !username || !pass) {
        alert("يرجى تعبئة كافة الحقول بشكل صحيح!");
        return;
    }
    
    // Check duplication of username if it changed
    if (username !== usr.username) {
        const dup = AppState.users.find((u, idx) => u.username === username && idx !== index);
        if (dup) {
            alert("خطأ: اسم المستخدم هذا محجوز ومستعمل مسبقاً من مستخدم آخر!");
            return;
        }
    }
    
    // Save previous credentials if we edit currently logged-in user
    const wasSelf = AppState.currentUser && AppState.currentUser.username === usr.username;
    
    usr.name = fullname;
    // admin cannot change username or role
    if (usr.username !== 'admin') {
        usr.username = username;
        usr.role = document.getElementById('edit-user-role').value;
    }
    usr.password = pass;
    
    if (usr.role === 'manager') {
        usr.permissions = ['invoice', 'expenses', 'reports', 'monthly-reports', 'treasury', 'inventory', 'settings'];
    } else {
        const selectedPerms = [];
        document.querySelectorAll('.edit-user-perm').forEach(cb => {
            if (cb.checked) selectedPerms.push(cb.value);
        });
        usr.permissions = selectedPerms;
    }
    
    AppState.saveAll();
    
    SyncManager.dispatchSync("users", AppState.users, "users_list");
    
    // If it was the logged in user, update current session user info
    if (wasSelf) {
        AppState.currentUser = usr;
        sessionStorage.setItem('vape_current_user', JSON.stringify(usr));
        document.getElementById('sidebar-user-fullname').innerText = usr.name;
        document.getElementById('sidebar-user-role').innerText = usr.role === 'manager' ? 'مدير النظام' : 'كاشير / موظف';
    }
    
    renderSettingsUsersList();
    closeEditUserModal();
    playBeep('success');
    alert("تم تعديل بيانات المستخدم بنجاح.");
}

function toggleNewUserPermissions() {
    const role = document.getElementById('new-user-role').value;
    document.getElementById('new-user-perms-group').style.display = role === 'manager' ? 'none' : 'block';
}

function toggleEditUserPermissions() {
    const role = document.getElementById('edit-user-role').value;
    document.getElementById('edit-user-perms-group').style.display = role === 'manager' ? 'none' : 'block';
}

function getMaxAllowedDiscount(unitPrice) {
    const rules = AppState.settings.cashierDiscounts || [
        { from: 60000, to: 99999999, maxDiscount: 15000 },
        { from: 35000, to: 59999, maxDiscount: 10000 },
        { from: 22000, to: 34999, maxDiscount: 5000 },
        { from: 10000, to: 21999, maxDiscount: 2000 }
    ];
    for (const rule of rules) {
        if (unitPrice >= rule.from && unitPrice <= rule.to) {
            return rule.maxDiscount;
        }
    }
    return 0;
}

function setupRoleBasedUI(user) {
    if (!user) return;
    
    document.getElementById('sidebar-user-fullname').innerText = user.name;
    document.getElementById('sidebar-user-role').innerText = user.role === 'manager' ? 'مدير النظام' : 'كاشير / موظف';
    
    const generalDiscountInput = document.getElementById('invoice-discount');
    if (generalDiscountInput) {
        if (user.role === 'cashier') {
            generalDiscountInput.disabled = true;
            generalDiscountInput.value = 0;
            generalDiscountInput.placeholder = "الخصم العام معطل للكاشير";
        } else {
            generalDiscountInput.disabled = false;
            generalDiscountInput.placeholder = "0";
        }
    }
    
    if (user.role === 'cashier') {
        const perms = user.permissions || ['invoice'];
        document.querySelectorAll('.nav-item').forEach(item => {
            const tab = item.dataset.tab;
            if (!perms.includes(tab)) {
                item.style.display = 'none';
            } else {
                item.style.display = 'block';
            }
        });
        
        if (perms.includes('invoice')) {
            switchTab('invoice');
        } else if (perms.length > 0) {
            switchTab(perms[0]);
        } else {
            document.querySelectorAll('.workspace-panel').forEach(p => p.classList.remove('active'));
        }
    } else {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.style.display = 'block';
        });
        switchTab('invoice');
    }
}

function renderLoginUsers() {
    const grid = document.getElementById('login-users-grid');
    if (!grid) return;
    
    grid.innerHTML = '';
    AppState.users.forEach(user => {
        const isManager = user.role === 'manager';
        const icon = isManager ? 'fa-user-shield' : 'fa-cash-register';
        const color = isManager ? 'var(--accent)' : 'var(--primary)';
        
        grid.innerHTML += `
            <div class="user-login-card" onclick="selectLoginUser('${user.username}', '${user.name}')">
                <div class="avatar" style="background: rgba(255, 255, 255, 0.05); color: ${color}; width: 50px; height: 50px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 10px; font-size: 20px; border: 1px solid var(--border-color); transition: all 0.2s;">
                    <i class="fa-solid ${icon}"></i>
                </div>
                <div style="font-weight: bold; font-size: 13px; color: var(--text-main); text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${user.name.split(' - ')[0]}</div>
                <div style="font-size: 10px; color: var(--text-muted); text-align: center; margin-top: 3px;">${isManager ? 'مدير' : 'كاشير'}</div>
            </div>
        `;
    });
}

function selectLoginUser(username, name) {
    const grid = document.getElementById('login-users-grid');
    const toggleBtn = document.getElementById('manual-login-toggle');
    const unameInput = document.getElementById('login-uname');
    const unameGroup = document.getElementById('login-uname-group');
    const passGroup = document.getElementById('login-pass-group');
    const passLabel = document.getElementById('login-pass-label');
    const passInput = document.getElementById('login-pass');
    
    unameInput.value = username;
    if (unameGroup) unameGroup.style.display = 'none';
    if (grid) grid.style.display = 'none';
    if (toggleBtn) toggleBtn.style.display = 'none';
    
    if (passGroup) passGroup.style.display = 'block';
    if (passLabel) passLabel.innerText = `رمز المرور لحساب: ${name}`;
    if (passInput) {
        passInput.value = '';
        passInput.focus();
    }
}

function resetLoginScreen() {
    const grid = document.getElementById('login-users-grid');
    const toggleBtn = document.getElementById('manual-login-toggle');
    const unameGroup = document.getElementById('login-uname-group');
    const passGroup = document.getElementById('login-pass-group');
    const passInput = document.getElementById('login-pass');
    
    if (grid) grid.style.display = 'grid';
    if (toggleBtn) toggleBtn.style.display = 'block';
    if (unameGroup) unameGroup.style.display = 'none';
    if (passGroup) passGroup.style.display = 'none';
    if (passInput) passInput.value = '';
    
    renderLoginUsers();
}

function showManualLogin() {
    const grid = document.getElementById('login-users-grid');
    const toggleBtn = document.getElementById('manual-login-toggle');
    const unameInput = document.getElementById('login-uname');
    const unameGroup = document.getElementById('login-uname-group');
    const passGroup = document.getElementById('login-pass-group');
    const passLabel = document.getElementById('login-pass-label');
    const passInput = document.getElementById('login-pass');
    
    unameInput.value = '';
    if (grid) grid.style.display = 'none';
    if (toggleBtn) toggleBtn.style.display = 'none';
    
    if (unameGroup) unameGroup.style.display = 'block';
    if (passGroup) passGroup.style.display = 'block';
    if (passLabel) passLabel.innerText = 'رمز المرور';
    
    unameInput.focus();
}

// --- AUTHENTICATION FLOW (LOGIN/LOGOUT) ---
function handleLogin(e) {
    if (e) e.preventDefault();
    
    const uname = document.getElementById('login-uname').value.trim();
    const pass = document.getElementById('login-pass').value.trim();
    
    const user = AppState.users.find(u => u.username === uname && u.password === pass);
    
    if (user) {
        AppState.currentUser = user;
        sessionStorage.setItem('vape_current_user', JSON.stringify(user));
        
        // Show application interface
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        
        setupRoleBasedUI(user);
        
        playBeep('success');
        
        // Start clocks
        initClocks();
    } else {
        playBeep('error');
        alert("خطأ: اسم المستخدم أو كلمة المرور غير صحيحة! يرجى إعادة المحاولة.");
    }
}

function handleLogout() {
    if (!confirm("هل تريد تسجيل الخروج والعودة لشاشة الدخول؟")) return;
    
    AppState.currentUser = null;
    sessionStorage.removeItem('vape_current_user');
    
    AppState.basket = [];
    
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('login-container').style.display = 'flex';
    document.getElementById('login-uname').value = '';
    document.getElementById('login-pass').value = '';
    
    resetLoginScreen();
    
    playBeep('success');
}

// Check active session on initial load
async function checkSession() {
    AppState.loadAll();
    SyncManager.init();
    
    const overlay = document.getElementById('cloud-sync-overlay');
    if (AppState.settings.firebaseConfig && typeof firebase !== 'undefined') {
        if (overlay) overlay.style.display = 'flex';
        await SyncManager.fetchAllDataFromCloud();
        if (overlay) overlay.style.display = 'none';
    } else {
        if (overlay) overlay.style.display = 'none';
    }

    const savedUser = sessionStorage.getItem('vape_current_user');
    if (savedUser) {
        const user = JSON.parse(savedUser);
        AppState.currentUser = user;
        
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('app-container').style.display = 'flex';
        
        setupRoleBasedUI(user);
        
        initClocks();
    } else {
        document.getElementById('app-container').style.display = 'none';
        document.getElementById('login-container').style.display = 'flex';
        resetLoginScreen();
    }
    // Load saved theme preference
    const savedTheme = localStorage.getItem('vape_theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        const themeIcon = document.getElementById('theme-icon');
        const themeText = document.getElementById('theme-text');
        if (themeIcon) {
            themeIcon.className = 'fa-solid fa-moon';
            themeIcon.style.color = 'var(--text-main)';
        }
        if (themeText) {
            themeText.innerText = 'الوضع الداكن';
        }
    }
    
    // Setup listeners
    setupBarcodeListener();
    initProductAutocomplete();
    initModalProductAutocomplete();
    
    const outInput = document.getElementById('salary-amount-out');
    const inInput = document.getElementById('salary-amount-in');
    if (outInput && inInput) {
        outInput.addEventListener('input', () => { if (outInput.value) inInput.value = ''; });
        inInput.addEventListener('input', () => { if (inInput.value) outInput.value = ''; });
    }
    
    // Check for employee salaries
    checkSalaryNotifications();
    
    // Catch up any missed auto-archives from previous days
    catchUpMissedArchives();
}

// Check and render reconciliation banner
function checkReconciliationBanner() {
    let banner = document.getElementById('reconciliation-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'reconciliation-banner';
        banner.style.cssText = 'background: var(--danger); color: white; padding: 10px; text-align: center; font-weight: bold; position: fixed; top: 0; left: 0; right: 0; z-index: 9999; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.3);';
        banner.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> تنبيه: يرجى كتابة المطابقة لليومية وتصفير الصندوق الآن (اضغط هنا للذهاب للمطابقة)';
        banner.onclick = () => switchTab('treasury');
        document.body.appendChild(banner);
        
        // Push app container down
        const appContainer = document.getElementById('app-container');
        if (appContainer) appContainer.style.marginTop = '40px';
    }
    
    if (AppState.needsReconciliation) {
        banner.style.display = 'block';
        const appContainer = document.getElementById('app-container');
        if (appContainer) appContainer.style.marginTop = '40px';
    } else {
        banner.style.display = 'none';
        const appContainer = document.getElementById('app-container');
        if (appContainer) appContainer.style.marginTop = '0';
    }
}

// Check and render salary notifications
function checkSalaryNotifications() {
    const today = new Date().getDate();
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    let salaryBanner = document.getElementById('salary-banner');
    if (!salaryBanner) {
        salaryBanner = document.createElement('div');
        salaryBanner.id = 'salary-banner';
        salaryBanner.style.cssText = 'background: #3b82f6; color: white; padding: 10px; text-align: center; font-weight: bold; position: fixed; top: 0; left: 0; right: 0; z-index: 9998; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.3); display: none;';
        salaryBanner.onclick = () => switchTab('settings'); // Go to settings/employees
        document.body.appendChild(salaryBanner);
    }
    
    // Only manager gets notified
    if (!AppState.currentUser || AppState.currentUser.role !== 'manager') {
        salaryBanner.style.display = 'none';
        return;
    }
    
    const employeesToPay = AppState.employees.filter(emp => emp.salaryDay === today);
    if (employeesToPay.length > 0) {
        const names = employeesToPay.map(e => e.name).join('، ');
        salaryBanner.innerHTML = `<i class="fa-solid fa-money-check-dollar"></i> تذكير: اليوم هو تاريخ استلام الراتب للموظفين: ${names} (انقر هنا للذهاب لإدارة الموظفين)`;
        salaryBanner.style.display = 'block';
        
        // Push app container down if needed
        const appContainer = document.getElementById('app-container');
        const reconBanner = document.getElementById('reconciliation-banner');
        if (appContainer) {
            if (reconBanner && reconBanner.style.display === 'block') {
                salaryBanner.style.top = '40px';
                appContainer.style.marginTop = '80px';
            } else {
                salaryBanner.style.top = '0';
                appContainer.style.marginTop = '40px';
            }
        }
    } else {
        salaryBanner.style.display = 'none';
    }
}

// Auto Daily Reset and Archive Logic
function processDailyResetAndArchive(dateStrOverride = null, auto = false) {
    let targetDateStr;
    if (dateStrOverride) {
        targetDateStr = dateStrOverride;
    } else {
        // Default to yesterday if called right at midnight, otherwise today?
        // Actually, if it's auto-called at 00:00:00, it's archiving "yesterday".
        const now = new Date();
        if (auto && now.getHours() === 0) {
            now.setDate(now.getDate() - 1);
        }
        targetDateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    }
    
    // Check if already archived
    const existing = AppState.archives.find(a => a.dateStr === targetDateStr);
    if (existing && auto) return; // Already archived today
    
    // Calculate totals for target day
    const dayTransactions = AppState.transactions.filter(t => {
        const d = new Date(t.timestamp || Date.now());
        const tStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        return tStr === targetDateStr;
    });
    
    if (dayTransactions.length === 0 && auto) return; // Nothing to archive
    
    let totalSales = 0; // Cash sales only
    let totalExpenses = 0;
    let totalDebtPayments = 0;
    dayTransactions.forEach(t => {
        if (t.type === 'sale') {
            if (t.paymentType !== 'credit') {
                totalSales += t.total;
            }
        } else if (t.type === 'debt_payment') {
            totalDebtPayments += t.amount;
        } else if (t.type === 'salary' && t.direction === 'in') {
            totalSales += t.amount;
        } else if (t.type === 'expense' || t.type === 'salary') {
            totalExpenses += t.amount;
        }
    });
    
    const archiveObj = {
        archiveId: 'ARC-' + targetDateStr + '-' + Date.now(),
        dateStr: targetDateStr,
        totalSales: totalSales,
        totalExpenses: totalExpenses,
        totalDebtPayments: totalDebtPayments,
        netProfit: totalSales + totalDebtPayments - totalExpenses,
        timestamp: new Date().toISOString()
    };
    
    if (existing) {
        // Update existing if doing manual archive overriding
        Object.assign(existing, archiveObj);
    } else {
        AppState.archives.push(archiveObj);
    }
    
    AppState.saveAll();
    SyncManager.dispatchSync("daily_summary", archiveObj, archiveObj.archiveId);
    
    if (auto) {
        // Show notification banner or alert if someone is watching
        const banner = document.createElement('div');
        banner.style.position = 'fixed';
        banner.style.bottom = '20px';
        banner.style.left = '50%';
        banner.style.transform = 'translateX(-50%)';
        banner.style.background = 'var(--success)';
        banner.style.color = '#fff';
        banner.style.padding = '15px 30px';
        banner.style.borderRadius = '30px';
        banner.style.boxShadow = '0 10px 30px rgba(0,0,0,0.3)';
        banner.style.zIndex = '99999';
        banner.style.fontFamily = 'Inter, Cairo, sans-serif';
        banner.innerHTML = `<i class="fa-solid fa-check-circle"></i> تم إجراء المطابقة اليومية لـ ${targetDateStr} أوتوماتيكياً ونقل العمليات للأرشيف بنجاح.`;
        document.body.appendChild(banner);
        
        playBeep('success');
        
        setTimeout(() => {
            banner.style.opacity = '0';
            banner.style.transition = 'opacity 1s';
            setTimeout(() => banner.remove(), 1000);
        }, 8000);
    }
    
    // Refresh UI if we are on reports tab
    if (document.getElementById('reports-panel').classList.contains('active')) {
        renderArchivesList();
    }
}

// Catch up missed archives if the system was closed at midnight
function catchUpMissedArchives() {
    const today = new Date();
    const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    
    const unarchivedDates = new Set();
    
    if (AppState.transactions && AppState.transactions.length > 0) {
        AppState.transactions.forEach(t => {
            const d = new Date(t.timestamp || Date.now());
            const tStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
            
            // If the transaction date is strictly less than today (meaning it's from yesterday or before)
            if (tStr < todayStr) {
                const existing = AppState.archives.find(a => a.dateStr === tStr);
                if (!existing) {
                    unarchivedDates.add(tStr);
                }
            }
        });
    }
    
    if (unarchivedDates.size > 0) {
        unarchivedDates.forEach(dateStr => {
            console.log("Auto-archiving missed day: ", dateStr);
            processDailyResetAndArchive(dateStr, false);
        });
    }
}

function showReconReminder() {
    playBeep('error');
    const banner = document.createElement('div');
    banner.style.position = 'fixed';
    banner.style.top = '20px';
    banner.style.left = '50%';
    banner.style.transform = 'translateX(-50%)';
    banner.style.background = 'var(--danger)';
    banner.style.color = '#fff';
    banner.style.padding = '20px 30px';
    banner.style.borderRadius = '15px';
    banner.style.boxShadow = '0 10px 40px rgba(0,0,0,0.5)';
    banner.style.zIndex = '999999';
    banner.style.fontFamily = 'Inter, Cairo, sans-serif';
    banner.style.textAlign = 'center';
    banner.innerHTML = `
        <i class="fa-solid fa-triangle-exclamation" style="font-size:2rem; margin-bottom:10px;"></i>
        <h3 style="margin:0 0 10px 0;">تنبيه المطابقة اليومية</h3>
        <p style="margin:0 0 15px 0;">أوشك اليوم على الانتهاء. يرجى الذهاب فوراً إلى شاشة <strong>جرد ومطابقة الخزينة</strong> لإدخال المبلغ الفعلي الموجود في المحل.</p>
        <button onclick="this.parentElement.remove(); switchTab('treasury');" style="background:#fff; color:var(--danger); border:none; padding:8px 20px; border-radius:5px; font-weight:bold; cursor:pointer;">الذهاب للمطابقة الآن</button>
        <button onclick="this.parentElement.remove();" style="background:transparent; color:#fff; border:1px solid #fff; padding:8px 20px; border-radius:5px; cursor:pointer; margin-right:10px;">إغلاق</button>
    `;
    document.body.appendChild(banner);
}

// Live Time Clocks
function initClocks() {
    function tick() {
        const now = new Date();
        const timeSpan = document.getElementById('live-time');
        const dateSpan = document.getElementById('live-date');
        
        if (timeSpan) {
            timeSpan.innerText = now.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
        if (dateSpan) {
            dateSpan.innerText = now.toLocaleDateString('ar-IQ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        }
        
        // Treasury reconciliation reminder at 23:55:00
        if (now.getHours() === 23 && now.getMinutes() === 55 && (now.getSeconds() === 0 || now.getSeconds() === 1)) {
            if (!sessionStorage.getItem('vape_recon_reminder_' + now.toLocaleDateString('en-US'))) {
                sessionStorage.setItem('vape_recon_reminder_' + now.toLocaleDateString('en-US'), 'true');
                showReconReminder();
            }
        }
        
        // Auto archive at exactly 00:00:00 or 00:00:01
        if (now.getHours() === 0 && now.getMinutes() === 0 && (now.getSeconds() === 0 || now.getSeconds() === 1)) {
            // Prevent multiple triggers
            if (!AppState.transactions || AppState.transactions.length === 0) return;
            if (!sessionStorage.getItem('vape_archived_today_' + now.toLocaleDateString('en-US'))) {
                sessionStorage.setItem('vape_archived_today_' + now.toLocaleDateString('en-US'), 'true');
                console.log("Auto triggering daily reset at midnight.");
                processDailyResetAndArchive(null, true);
            }
        }
    }
    setInterval(tick, 1000);
    tick();
    
    checkReconciliationBanner();
}

// --- THEME SWITCHER LOGIC ---
function toggleTheme() {
    const isLight = document.body.classList.toggle('light-mode');
    localStorage.setItem('vape_theme', isLight ? 'light' : 'dark');
    
    const themeIcon = document.getElementById('theme-icon');
    const themeText = document.getElementById('theme-text');
    
    if (isLight) {
        if (themeIcon) {
            themeIcon.className = 'fa-solid fa-moon';
            themeIcon.style.color = 'var(--text-main)';
        }
        if (themeText) themeText.innerText = 'الوضع الداكن';
        playBeep('success');
    } else {
        if (themeIcon) {
            themeIcon.className = 'fa-solid fa-sun';
            themeIcon.style.color = 'var(--accent)';
        }
        if (themeText) themeText.innerText = 'الوضع الفاتح';
        playBeep('success');
    }
    // Redraw charts with correct grid line colors if active
    if (document.getElementById('reports-panel').classList.contains('active')) {
        renderMonthlyChartVisuals();
    }
}

// --- CLEAR INVENTORY (تصفير المخزن) ---
function clearInventory() {
    if (AppState.currentUser && AppState.currentUser.role !== 'manager') {
        playBeep('error');
        alert("خطأ: غير مسموح بالدخول. تصفير المخزن متاح لمدير النظام فقط!");
        return;
    }

    if (!confirm("تنبيه هام جداً! هل أنت متأكد من رغبتك في حذف وتصفير كافة محتويات المستودع والمخزن بالكامل؟ لا يمكن التراجع عن هذا الإجراء!")) {
        return;
    }
    
    AppState.products = [];
    AppState.saveAll();
    
    // Sync to Cloud
    SyncManager.dispatchSync("products", AppState.products, "inventory_master");
    
    // Reload Inventory display table
    renderInventoryTable();
    playBeep('success');
    
    alert("تم تصفير المخزن بالكامل بنجاح. يمكنك الآن إضافة بضائعك الخاصة.");
}

// --- REPLACE PRODUCT TRANSACTION SYSTEM ---
let replaceOldProduct = null;
let replaceNewProduct = null;

function openReplaceModal() {
    replaceOldProduct = null;
    replaceNewProduct = null;
    document.getElementById('replace-old-barcode').value = '';
    document.getElementById('replace-new-barcode').value = '';
    const oldDetails = document.getElementById('replace-old-details');
    const newDetails = document.getElementById('replace-new-details');
    if (oldDetails) {
        oldDetails.style.display = 'none';
        oldDetails.innerText = '';
    }
    if (newDetails) {
        newDetails.style.display = 'none';
        newDetails.innerText = '';
    }
    const summaryBox = document.getElementById('replace-summary-box');
    if (summaryBox) summaryBox.style.display = 'none';
    
    document.getElementById('replace-modal').classList.add('active');
}

function closeReplaceModal() {
    document.getElementById('replace-modal').classList.remove('active');
}

function validateReplaceOldProduct(barcode) {
    const detailsDiv = document.getElementById('replace-old-details');
    if (!detailsDiv) return;
    
    if (!barcode) {
        detailsDiv.style.display = 'none';
        replaceOldProduct = null;
        updateReplaceSummary();
        return;
    }
    
    const prod = AppState.products.find(p => p.barcode === barcode.trim());
    if (prod) {
        replaceOldProduct = prod;
        detailsDiv.innerHTML = `<i class="fa-solid fa-circle-check"></i> تم العثور: <strong>${prod.name}</strong><br>السعر: ${prod.price.toLocaleString()} د.ع`;
        detailsDiv.style.background = 'rgba(16, 185, 129, 0.1)';
        detailsDiv.style.color = '#10b981';
        detailsDiv.style.display = 'block';
    } else {
        replaceOldProduct = null;
        detailsDiv.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> هذا الباركود غير مسجل في المخزن!`;
        detailsDiv.style.background = 'rgba(239, 68, 68, 0.1)';
        detailsDiv.style.color = 'var(--danger)';
        detailsDiv.style.display = 'block';
    }
    updateReplaceSummary();
}

function validateReplaceNewProduct(barcode) {
    const detailsDiv = document.getElementById('replace-new-details');
    if (!detailsDiv) return;
    
    if (!barcode) {
        detailsDiv.style.display = 'none';
        replaceNewProduct = null;
        updateReplaceSummary();
        return;
    }
    
    const prod = AppState.products.find(p => p.barcode === barcode.trim());
    if (prod) {
        if (prod.qty <= 0) {
            replaceNewProduct = null;
            detailsDiv.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> نفذ من المخزن! الكمية الحالية: 0`;
            detailsDiv.style.background = 'rgba(239, 68, 68, 0.1)';
            detailsDiv.style.color = 'var(--danger)';
            detailsDiv.style.display = 'block';
        } else {
            replaceNewProduct = prod;
            detailsDiv.innerHTML = `<i class="fa-solid fa-circle-check"></i> تم العثور: <strong>${prod.name}</strong><br>السعر: ${prod.price.toLocaleString()} د.ع | المتاح: ${prod.qty}`;
            detailsDiv.style.background = 'rgba(59, 130, 246, 0.1)';
            detailsDiv.style.color = 'var(--primary)';
            detailsDiv.style.display = 'block';
        }
    } else {
        replaceNewProduct = null;
        detailsDiv.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> هذا الباركود غير مسجل في المخزن!`;
        detailsDiv.style.background = 'rgba(239, 68, 68, 0.1)';
        detailsDiv.style.color = 'var(--danger)';
        detailsDiv.style.display = 'block';
    }
    updateReplaceSummary();
}

function updateReplaceSummary() {
    const summaryBox = document.getElementById('replace-summary-box');
    const diffDisplay = document.getElementById('replace-difference-display');
    const noteDisplay = document.getElementById('replace-direction-note');
    
    if (!replaceOldProduct || !replaceNewProduct) {
        if (summaryBox) summaryBox.style.display = 'none';
        return;
    }
    
    const diff = replaceNewProduct.price - replaceOldProduct.price;
    if (summaryBox) summaryBox.style.display = 'block';
    if (diffDisplay) {
        diffDisplay.innerText = `${Math.abs(diff).toLocaleString()} د.ع`;
    }
    
    if (diff > 0) {
        if (noteDisplay) noteDisplay.innerText = `المنتج الجديد أغلى. يجب على الزبون دفع فرق ${diff.toLocaleString()} د.ع للمحل.`;
        if (diffDisplay) diffDisplay.style.color = 'var(--primary)';
    } else if (diff < 0) {
        if (noteDisplay) noteDisplay.innerText = `المنتج الجديد أرخص. يجب على المحل إرجاع فرق ${Math.abs(diff).toLocaleString()} د.ع للزبون.`;
        if (diffDisplay) diffDisplay.style.color = 'var(--danger)';
    } else {
        if (noteDisplay) noteDisplay.innerText = `المنتجان متساويان في السعر. عملية استبدال متعادلة.`;
        if (diffDisplay) diffDisplay.style.color = 'var(--text-main)';
    }
}

function handleReplaceProduct(e) {
    if (e) e.preventDefault();
    
    if (!replaceOldProduct || !replaceNewProduct) {
        alert("يرجى إدخال وقراءة باركود المنتج القديم والجديد بنجاح أولاً!");
        return;
    }
    
    if (replaceNewProduct.qty <= 0) {
        alert("عذراً، المنتج البديل نفذ تماماً من المخزن!");
        return;
    }
    
    // 1. Update inventories
    const oldP = AppState.products.find(p => p.id === replaceOldProduct.id);
    const newP = AppState.products.find(p => p.id === replaceNewProduct.id);
    
    if (oldP) oldP.qty += 1; // Return returned item to stock
    if (newP) newP.qty -= 1; // Decrement replaced item from stock
    
    // 2. Create transaction record
    const diff = newP.price - oldP.price;
    const txId = "REP-" + Date.now().toString().slice(-8);
    const transaction = {
        id: txId,
        type: 'sale', // type 'sale' to show in sales summaries
        isReplacement: true,
        items: [
            {
                id: oldP.id,
                name: oldP.name + " (مرتجع استبدال)",
                price: oldP.price,
                cost: oldP.cost,
                quantity: -1, // Negative quantity representing return
                discount: 0
            },
            {
                id: newP.id,
                name: newP.name + " (بديل استبدال)",
                price: newP.price,
                cost: newP.cost,
                quantity: 1, // Positive quantity representing take
                discount: 0
            }
        ],
        subtotal: diff,
        discount: 0,
        total: diff,
        timestamp: new Date().toISOString(),
        createdBy: AppState.currentUser ? AppState.currentUser.name : "كاشير"
    };
    
    AppState.transactions.push(transaction);
    AppState.saveAll();
    
    // Sync to Cloud
    SyncManager.dispatchSync("sales", transaction, transaction.id);
    SyncManager.dispatchSync("products", AppState.products, "inventory_master");
    
    playBeep('checkout');
    alert(`تمت عملية الاستبدال بنجاح!\nالفرق المالي: ${diff.toLocaleString()} د.ع`);
    
    closeReplaceModal();
    
    // Refresh active workspace tab
    const activeTab = document.querySelector('.nav-item.active').dataset.tab;
    if (activeTab === 'inventory') {
        renderInventoryTable();
    } else if (activeTab === 'reports') {
        renderReportsDashboard();
    }
}

// --- DEBTS & REPAYMENTS MANAGEMENT SYSTEM ---
function toggleCreditFields() {
    const isCredit = document.getElementById('is-credit-sale').checked;
    document.getElementById('credit-fields').style.display = isCredit ? 'block' : 'none';
    if (isCredit) {
        document.getElementById('credit-customer-name').focus();
    } else {
        document.getElementById('credit-customer-name').value = '';
    }
}

function renderDebtsList() {
    const listBody = document.getElementById('debts-list-body');
    if (!listBody) return;
    
    listBody.innerHTML = '';
    const query = document.getElementById('debts-search-input').value.toLowerCase().trim();
    
    if (!AppState.debts) AppState.debts = [];
    
    // Filter active debtors
    const filtered = AppState.debts.filter(d => 
        d.customerName.toLowerCase().includes(query)
    );
    
    let totalOutstanding = 0;
    AppState.debts.forEach(d => totalOutstanding += d.amount);
    
    const totalLabel = document.getElementById('debts-stat-total');
    if (totalLabel) totalLabel.innerText = `${totalOutstanding.toLocaleString()} د.ع`;
    
    const countLabel = document.getElementById('debts-stat-count');
    if (countLabel) countLabel.innerText = AppState.debts.filter(d => d.amount > 0).length;
    
    if (filtered.length === 0) {
        listBody.innerHTML = `<tr><td colspan="3" class="text-center" style="color:var(--text-muted); padding:20px;">لا توجد حسابات ذمم مطابقة.</td></tr>`;
        return;
    }
    
    filtered.forEach(d => {
        listBody.innerHTML += `
            <tr style="cursor:pointer;" onclick="selectDebtor('${d.id}')">
                <td><strong>${d.customerName}</strong></td>
                <td class="price-value" style="color:var(--danger); font-weight:800;">${d.amount.toLocaleString()} د.ع</td>
                <td style="text-align: center;">
                    <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); selectDebtor('${d.id}')">تفاصيل ودفع</button>
                </td>
            </tr>
        `;
    });
}

function selectDebtor(debtorId) {
    if (!AppState.debts) AppState.debts = [];
    const debtor = AppState.debts.find(d => d.id === debtorId);
    if (!debtor) return;
    
    const emptyPlaceholder = document.getElementById('debtor-empty-placeholder');
    if (emptyPlaceholder) emptyPlaceholder.style.display = 'none';
    
    const detailPanel = document.getElementById('debtor-detail-panel');
    if (detailPanel) detailPanel.style.display = 'block';
    
    document.getElementById('debtor-name-display').innerText = debtor.customerName;
    document.getElementById('debtor-balance-display').innerText = `${debtor.amount.toLocaleString()} د.ع`;
    document.getElementById('debtor-id-input').value = debtor.id;
    document.getElementById('repay-amount').value = '';
    document.getElementById('repay-notes').value = '';
    
    // Render debtor history
    const historyBody = document.getElementById('debtor-history-body');
    if (historyBody) {
        historyBody.innerHTML = '';
        if (!debtor.history || debtor.history.length === 0) {
            historyBody.innerHTML = `<tr><td colspan="3" class="text-center" style="color:var(--text-muted); padding:10px;">لا توجد عمليات مسجلة.</td></tr>`;
        } else {
            const sorted = [...debtor.history].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
            sorted.forEach(h => {
                const dt = new Date(h.timestamp).toLocaleString('ar-IQ', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                const typeText = h.type === 'charge' ? 'شراء بالدين' : 'تسديد دفعة';
                const color = h.type === 'charge' ? 'var(--danger)' : 'var(--primary)';
                const prefix = h.type === 'charge' ? '+' : '-';
                
                historyBody.innerHTML += `
                    <tr>
                        <td>${dt}</td>
                        <td>${h.description || typeText}</td>
                        <td class="price-value" style="color:${color}; font-weight:700;">${prefix}${h.amount.toLocaleString()} د.ع</td>
                    </tr>
                `;
            });
        }
    }
}

function handleRepayDebt(e) {
    if (e) e.preventDefault();
    
    const debtorId = document.getElementById('debtor-id-input').value;
    const repayAmount = parseInt(document.getElementById('repay-amount').value) || 0;
    const repayNotes = document.getElementById('repay-notes').value.trim();
    
    if (!debtorId || repayAmount <= 0) {
        alert("يرجى إدخال مبلغ تسديد صحيح!");
        return;
    }
    
    const debtor = AppState.debts.find(d => d.id === debtorId);
    if (!debtor) return;
    
    if (repayAmount > debtor.amount) {
        alert(`المبلغ المدخل (${repayAmount.toLocaleString()} د.ع) أكبر من الدين المتبقي (${debtor.amount.toLocaleString()} د.ع)!`);
        return;
    }
    
    // Subtract from debt
    debtor.amount -= repayAmount;
    
    const pmtId = "PMT-" + Date.now().toString().slice(-8);
    if (!debtor.history) debtor.history = [];
    debtor.history.push({
        id: pmtId,
        type: 'payment',
        amount: repayAmount,
        timestamp: new Date().toISOString(),
        description: repayNotes || "تسديد من الحساب"
    });
    
    // Create master transaction
    const isFull = debtor.amount === 0;
    const descriptionText = isFull 
        ? `تسديد كامل الدين القديم للمدين: ${debtor.customerName}` 
        : `تسديد دفعة من دين قديم للمدين: ${debtor.customerName} (باقي: ${debtor.amount.toLocaleString()} د.ع)`;
    
    const newTx = {
        id: pmtId,
        type: 'debt_payment',
        amount: repayAmount,
        customerName: debtor.customerName,
        remainingAmount: debtor.amount,
        description: descriptionText + (repayNotes ? ` - ملاحظة: ${repayNotes}` : ''),
        timestamp: new Date().toISOString(),
        createdBy: AppState.currentUser ? AppState.currentUser.name : "كاشير"
    };
    
    AppState.transactions.push(newTx);
    AppState.saveAll();
    
    // Sync to Cloud
    SyncManager.dispatchSync("debt_payments", newTx, newTx.id);
    SyncManager.dispatchSync("debts", AppState.debts, "debts_list");
    
    playBeep('success');
    alert(`تم تسجيل تسديد مبلغ ${repayAmount.toLocaleString()} د.ع للمدين ${debtor.customerName} بنجاح.`);
    
    // Refresh UI
    renderDebtsList();
    selectDebtor(debtorId);
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', checkSession);
