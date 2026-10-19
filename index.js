const { ethers } = require("ethers");

const CONTRACT_ADDRESS = "0x9B3F6B83B07E5B313D960D47938800f0BCce206D";

const CONTRACT_ABI = [
    "function pool() external",
    "function Chainlink() external view returns (bool)",
    "function investments(uint256) external view returns (uint256 id, address investor, uint256 amount, uint256 planId, uint256 profitPercent, uint256 startTime, uint256 duration, uint256 totalGenPaid, bool processed, bool earlyWithdrawn)",
    "function invCursor() external view returns (uint256)",
    "event PoolEvent(uint256 indexed id, string itemType, address indexed user, uint256 amount, bool success)"
];

const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) {
    console.error("الخطأ: لم يتم العثور على PRIVATE_KEY في إعدادات البيئة!");
    process.exit(1);
}

const rpcUrls = [
    "https://bsc-dataseed.binance.org/",
    "https://bsc-dataseed1.binance.org/",
    "https://bsc-dataseed2.binance.org/",
    "https://bsc-dataseed3.binance.org/",
    "https://rpc.ankr.com/bsc",
    "https://1rpc.io/bnb",
    "https://bsc.publicnode.com"
];

let rpcIndex = 0;
let provider = new ethers.JsonRpcProvider(rpcUrls[rpcIndex]);

function getNextProvider() {
    rpcIndex = (rpcIndex + 1) % rpcUrls.length;
    console.log(`[${new Date().toLocaleTimeString()}] 🔄 تحويل تلقائي إلى مزود RPC رقم ${rpcIndex + 1}: ${rpcUrls[rpcIndex]}`);
    provider = new ethers.JsonRpcProvider(rpcUrls[rpcIndex]);
    return provider;
}

let wallet = new ethers.Wallet(privateKey, provider);
let contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

// الذاكرة المحلية لتتبع الاستثمارات النشطة والمنتهية
const activeInvestments = new Map();
let isExecutingPool = false;

console.log("=========================================");
console.log(" PeetX Bulletproof Bot Started (10-Layer Protection)!");
console.log(" Wallet Address: " + wallet.address);
console.log("=========================================");

// دالة تنفيذ دالة pool المعززة مع إعادة المحاولة
async function triggerPool(reason) {
    if (isExecutingPool) return; // منع التكرار المزدوج المعالج في نفس الوقت
    isExecutingPool = true;

    let success = false;
    let attempts = 0;

    console.log(`[${new Date().toLocaleTimeString()}] 🚀 طلب تنفيذ دالة pool() - السبب: ${reason}`);

    while (!success && attempts < rpcUrls.length) {
        try {
            wallet = new ethers.Wallet(privateKey, provider);
            contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

            const tx = await contract.pool();
            console.log(`[${new Date().toLocaleTimeString()}] 📤 تم إرسال المعاملة بنجاح. الهاش: ${tx.hash}`);

            const receipt = await tx.wait();
            console.log(`[${new Date().toLocaleTimeString()}] ✅ تم تأكيد المعاملة في البلوك رقم: ${receipt.blockNumber}`);
            success = true;
        } catch (error) {
            attempts++;
            console.error(`[${new Date().toLocaleTimeString()}] ⚠️ خطأ أثناء تنفيذ pool (محاولة ${attempts}/${rpcUrls.length}):`, error.reason || error.message);
            provider = getNextProvider();
        }
    }

    isExecutingPool = false;
}

// دالة الفحص الشامل والذكي لجميع الاستثمارات (السابقة والحديثة)
async function fetchAllInvestmentsSmart() {
    try {
        wallet = new ethers.Wallet(privateKey, provider);
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

        const now = Math.floor(Date.now() / 1000);
        let totalInvestments = 0;

        try {
            totalInvestments = Number(await contract.invCursor());
        } catch (e) {
            totalInvestments = 0;
        }

        if (totalInvestments === 0) return;

        const thirtyDaysAgo = now - (30 * 24 * 60 * 60);

        // قراءة الاستثمارات من الأحدث للأقدم
        for (let i = totalInvestments - 1; i >= 0; i--) {
            try {
                const invData = await contract.investments(i);
                
                if (invData && invData.investor && invData.investor !== ethers.ZeroAddress) {
                    const startTime = Number(invData.startTime);

                    // إيقاف الفحص التلقائي إذا كانت الاستثمارات أقدم من 30 يوماً
                    if (startTime < thirtyDaysAgo) {
                        break;
                    }

                    const invId = i.toString();

                    // إذا كان الاستثمار مُعالجاً أو مسحوباً، نحذفه من الذاكرة إن وجد
                    if (invData.processed || invData.earlyWithdrawn) {
                        if (activeInvestments.has(invId)) {
                            activeInvestments.delete(invId);
                        }
                        continue;
                    }

                    const duration = Number(invData.duration);
                    const expiryTime = startTime + duration;

                    // تخزين الوقت بدقة
                    activeInvestments.set(invId, expiryTime);

                    if (now >= expiryTime) {
                        console.log(`[${new Date().toLocaleTimeString()}] 🔍 كشف استثمار منتهٍ (سابق أو حالي) ID: #${invId}`);
                    }
                }
            } catch (err) {
                // تجاوز خطأ قراءة استثمار فردي والمتابعة
            }
        }
    } catch (err) {
        provider = getNextProvider();
    }
}

// 1️⃣ الفحص بالثانية (1s Tracker) - متابعة لحظية دقيقة للوقت بالتمام والكمال
setInterval(async () => {
    if (isExecutingPool) return;

    const now = Math.floor(Date.now() / 1000);
    let expiredInvestmentFound = false;

    for (let [invId, expiryTime] of activeInvestments.entries()) {
        if (now >= expiryTime) {
            console.log(`[${new Date().toLocaleTimeString()}] ⏰ حان الوقت بالتمام للاستثمار #${invId}!`);
            expiredInvestmentFound = true;
            activeInvestments.delete(invId); // إزالة الاستثمار بعد التحقق
        }
    }

    if (expiredInvestmentFound) {
        await triggerPool("انتهاء وقت استثمار محدد بالثانية");
    }
}, 1000);

// 2️⃣ فحص دالة Chainlink المستقل (كل 5 ثوانٍ)
setInterval(async () => {
    if (isExecutingPool) return;

    try {
        wallet = new ethers.Wallet(privateKey, provider);
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

        const chainlinkStatus = await contract.Chainlink();
        if (chainlinkStatus === true) {
            console.log(`[${new Date().toLocaleTimeString()}] ⚡ حالة Chainlink أصبحت TRUE!`);
            await triggerPool("استجابة Chainlink = TRUE");
        } else {
            // حالة False: البوت يتجاهل ولا يفعل شيئاً
        }
    } catch (e) {
        provider = getNextProvider();
    }
}, 5000);

// 3️⃣ تحديث ومراجعة قائمة الاستثمارات من العقد (كل 5 ثوانٍ)
setInterval(async () => {
    await fetchAllInvestmentsSmart();
}, 5000);

// دالة البدء الرئيسية
async function startBot() {
    console.log("جاري مراجعة العقد وجلب كافة الاستثمارات السابقة والحالية...");
    await fetchAllInvestmentsSmart();

    // الاستماع لايف للأحداث لسرعة الاستجابة
    try {
        contract.on("PoolEvent", async (id, itemType, user, amount, success) => {
            try {
                const invId = id.toString();
                if (itemType === "INVESTMENT_CREATED") {
                    const invData = await contract.investments(invId);
                    const expiryTime = Number(invData.startTime) + Number(invData.duration);
                    activeInvestments.set(invId, expiryTime);
                    console.log(`[${new Date().toLocaleTimeString()}] 🚀 تسجيل استثمار جديد لايف #${invId}`);
                } else if (itemType === "EARLY_WITHDRAWAL" || itemType === "INVESTMENT_MATURED") {
                    if (activeInvestments.has(invId)) {
                        activeInvestments.delete(invId);
                        console.log(`[${new Date().toLocaleTimeString()}] 🗑️ إزالة الاستثمار #${invId} بعد معالجته`);
                    }
                }
            } catch (err) {}
        });
    } catch (e) {
        console.log("تعذر ربط الأحداث الحية، سيعتمد البوت على الفحص الدوري الدقيق.");
    }

    console.log("✅ البوت يعمل الآن بكامل الحماية والمراقبة اللحظية.");
}

// التعامل مع أخطاء النظام ومنع إيقاف البوت
process.on("unhandledRejection", (reason, promise) => {
    console.error("خطأ تم تعقبه لمنع توقف البوت:", reason);
});

process.on("uncaughtException", (error) => {
    console.error("استثناء تم تعقبه لمنع توقف البوت:", error);
});

startBot();
