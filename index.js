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

const activeInvestments = new Map();
let isExecutingPool = false;

console.log("=========================================");
console.log(" PeetX Ultimate Event-Driven Bot Started!");
console.log(" Wallet Address: " + wallet.address);
console.log("=========================================");

// تنفيذ دالة pool مع الحماية الكاملة
async function executePool(reason) {
    if (isExecutingPool) return;
    isExecutingPool = true;

    let success = false;
    let attempts = 0;

    console.log(`[${new Date().toLocaleTimeString()}] 🚀 بدء تنفيذ دالة pool() بسبب: ${reason}`);

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
            console.error(`[${new Date().toLocaleTimeString()}] ⚠️ فشل في تنفيذ pool (محاولة ${attempts}/${rpcUrls.length}):`, error.reason || error.message);
            provider = getNextProvider();
        }
    }

    isExecutingPool = false;
}

// فحص واستخراج المعاملات والأحداث السابقة والنشطة من العقد مباشرة
async function auditPastAndActiveEvents() {
    try {
        wallet = new ethers.Wallet(privateKey, provider);
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

        const now = Math.floor(Date.now() / 1000);
        let totalInvestments = 0;

        try {
            totalInvestments = Number(await contract.invCursor());
            console.log(`[${new Date().toLocaleTimeString()}] 📊 إجمالي الاستثمارات في العقد: ${totalInvestments}`);
        } catch (e) {
            return;
        }

        if (totalInvestments === 0) return;

        let foundExpired = false;
        const thirtyDaysAgo = now - (30 * 24 * 60 * 60);

        for (let i = totalInvestments - 1; i >= 0; i--) {
            try {
                const invData = await contract.investments(i);

                if (invData && invData.investor && invData.investor !== ethers.ZeroAddress) {
                    const startTime = Number(invData.startTime);

                    if (startTime < thirtyDaysAgo) {
                        break; // التوقف عند تجاوز 30 يوماً
                    }

                    const invId = i.toString();

                    if (invData.processed || invData.earlyWithdrawn) {
                        if (activeInvestments.has(invId)) {
                            activeInvestments.delete(invId);
                        }
                        continue;
                    }

                    const duration = Number(invData.duration);
                    const expiryTime = startTime + duration;

                    if (now >= expiryTime) {
                        console.log(`[${new Date().toLocaleTimeString()}] ⏰ كشف استثمار منتهٍ من معاملات العقد ID: #${invId} (للمحفظة: ${invData.investor})`);
                        foundExpired = true;
                    } else {
                        activeInvestments.set(invId, expiryTime);
                    }
                }
            } catch (err) {}
        }

        if (foundExpired) {
            await executePool("اكتشاف استثمارات منتهية من خلال مسح المعاملات");
        }

    } catch (err) {
        provider = getNextProvider();
    }
}

// 1️⃣ مراقبة الذاكرة بالثانية لتنفيذ pool فور انتهاء الوقت بالتمام والكمال
setInterval(async () => {
    if (isExecutingPool) return;

    const now = Math.floor(Date.now() / 1000);
    let triggerNeeded = false;

    for (let [invId, expiryTime] of activeInvestments.entries()) {
        if (now >= expiryTime) {
            console.log(`[${new Date().toLocaleTimeString()}] ⏱️ حان وقت الاستثمار #${invId} بالتمام والكمال!`);
            triggerNeeded = true;
            activeInvestments.delete(invId);
        }
    }

    if (triggerNeeded) {
        await executePool("انتهاء وقت استثمار بالثانية محلياً");
    }
}, 1000);

// 2️⃣ فحص دالة Chainlink حصرياً كل 5 ثوانٍ (إذا كانت false لا يفعل شيئاً، وإذا true يشغل pool فوراً)
setInterval(async () => {
    if (isExecutingPool) return;

    try {
        wallet = new ethers.Wallet(privateKey, provider);
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

        const chainlinkStatus = await contract.Chainlink();
        if (chainlinkStatus === true) {
            console.log(`[${new Date().toLocaleTimeString()}] ⚡ تنبيه: دالة Chainlink أصبحت TRUE!`);
            await executePool("إشارة Chainlink أصبحت True");
        }
    } catch (e) {
        provider = getNextProvider();
    }
}, 5000);

// 3️⃣ فحص دوري للمعاملات والاستثمارات كل 5 ثوانٍ
setInterval(async () => {
    await auditPastAndActiveEvents();
}, 5000);

// الاستماع المباشر للأحداث والمعاملات الحية (Live Events & Transactions)
async function startEventListener() {
    console.log("جاري جلب الفحص الأولي لمعاملات الاستثمار...");
    await auditPastAndActiveEvents();

    try {
        contract.on("PoolEvent", async (id, itemType, user, amount, success) => {
            try {
                const invId = id.toString();
                console.log(`[${new Date().toLocaleTimeString()}] 🔔 حدث جديد من المعاملات | ID: #${invId} | النوع: ${itemType} | المحفظة: ${user}`);

                if (itemType === "INVESTMENT_CREATED") {
                    const invData = await contract.investments(invId);
                    const expiryTime = Number(invData.startTime) + Number(invData.duration);
                    activeInvestments.set(invId, expiryTime);
                    console.log(`🚀 تسجيل استثمار جديد في الذاكرة يحين وقته في: ${new Date(expiryTime * 1000).toLocaleString()}`);
                } else if (itemType === "EARLY_WITHDRAWAL" || itemType === "INVESTMENT_MATURED") {
                    if (activeInvestments.has(invId)) {
                        activeInvestments.delete(invId);
                        console.log(`🗑️ تم إزالة الاستثمار #${invId} بعد إتمام سحبه أو معالجته.`);
                    }
                    // تشغيل الـ pool فور حدوث حدث السحب أو الانتهاء
                    await executePool(`حدث معاملة جديدة من نوع: ${itemType}`);
                }
            } catch (err) {
                console.error("خطأ في معالجة الحدث:", err.message);
            }
        });
    } catch (e) {
        console.log("تعذر تفعيل الاستماع الحي، الاعتماد مستمر على الفحص الدوري بالكامل.");
    }

    console.log("✅ البوت يعمل بكامل طاقته ويراقب الأحداث والمعاملات لحظة بلحظة.");
}

process.on("unhandledRejection", (reason) => {
    console.error("خطأ تم تجاوزه لضمان استمرار البوت:", reason);
});

process.on("uncaughtException", (error) => {
    console.error("استثناء تم تجاوزه لضمان استمرار البوت:", error);
});

startEventListener();
