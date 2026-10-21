const { ethers } = require("ethers");

const CONTRACT_ADDRESS = "0x9B3F6B83B07E5B313D960D47938800f0BCce206D";

// الـ ABI الدقيق والصحيح المستخرج من العقد
const CONTRACT_ABI = [
    {"inputs":[],"stateMutability":"nonpayable","type":"constructor"},
    {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},
    {"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"id","type":"uint256"},{"indexed":false,"internalType":"string","name":"itemType","type":"string"},{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"},{"indexed":false,"internalType":"bool","name":"success","type":"bool"}],"name":"PoolEvent","type":"event"},
    {"inputs":[],"name":"Chainlink","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"NonfungiblePositionManager","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"USDT","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"address","name":"user","type":"address"},{"internalType":"uint256","name":"invCursor","type":"uint256"},{"internalType":"uint256","name":"invLimit","type":"uint256"}],"name":"View_plans","outputs":[{"components":[{"internalType":"uint256[5]","name":"counts","type":"uint256[5]"},{"internalType":"uint256[5]","name":"volumes","type":"uint256[5]"},{"internalType":"uint256","name":"totalEarnings","type":"uint256"},{"internalType":"address","name":"referrer","type":"address"},{"internalType":"uint256","name":"directReferralCount","type":"uint256"},{"internalType":"uint256","name":"teamVolume","type":"uint256"},{"internalType":"uint256","name":"totalInvested","type":"uint256"}],"internalType":"struct PeetXInvest.UserGenData","name":"userData","type":"tuple"},{"components":[{"internalType":"uint256","name":"id","type":"uint256"},{"internalType":"address","name":"investor","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"uint256","name":"planId","type":"uint256"},{"internalType":"uint256","name":"profitPercent","type":"uint256"},{"internalType":"uint256","name":"startTime","type":"uint256"},{"internalType":"uint256","name":"duration","type":"uint256"},{"internalType":"uint256","name":"totalGenPaid","type":"uint256"},{"internalType":"bool","name":"processed","type":"bool"},{"internalType":"bool","name":"earlyWithdrawn","type":"bool"}],"internalType":"struct PeetXInvest.Investment[]","name":"activeInvestments","type":"tuple[]"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"claimEarnings","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"invId","type":"uint256"}],"name":"claimLiquidity","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"uint256","name":"planId","type":"uint256"},{"internalType":"address","name":"referrer","type":"address"}],"name":"invest","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[],"name":"invCursor","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"investments","outputs":[{"internalType":"uint256","name":"id","type":"uint256"},{"internalType":"address","name":"investor","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"uint256","name":"planId","type":"uint256"},{"internalType":"uint256","name":"profitPercent","type":"uint256"},{"internalType":"uint256","name":"startTime","type":"uint256"},{"internalType":"uint256","name":"duration","type":"uint256"},{"internalType":"uint256","name":"totalGenPaid","type":"uint256"},{"internalType":"bool","name":"processed","type":"bool"},{"internalType":"bool","name":"earlyWithdrawn","type":"bool"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"pool","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"invId","type":"uint256"}],"name":"settleInvestment","outputs":[],"stateMutability":"nonpayable","type":"function"}
];

const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) {
    console.error("❌ خطأ قاتل: لم يتم العثور على PRIVATE_KEY في إعدادات البيئة!");
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
    console.log(`[${new Date().toLocaleTimeString()}] 🔄 تبديل مزود RPC تلقائياً إلى (${rpcIndex + 1}): ${rpcUrls[rpcIndex]}`);
    provider = new ethers.JsonRpcProvider(rpcUrls[rpcIndex]);
    return provider;
}

let wallet = new ethers.Wallet(privateKey, provider);
let contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

const activeInvestments = new Map();
let isExecutingPool = false;

console.log("=================================================");
console.log(" 🚀 PeetX Master Multi-Batch Investment Audit Bot");
console.log(" 👛 Wallet Address: " + wallet.address);
console.log("=================================================");

// دالة تنسيق الوقت المتبقي (أيام، ساعات، دقائق، ثواني)
function formatRemainingTime(expiryTime) {
    const now = Math.floor(Date.now() / 1000);
    const diff = expiryTime - now;
    if (diff <= 0) return "منتهٍ وجاهز للتصفية";
    
    const days = Math.floor(diff / (3600 * 24));
    const hours = Math.floor((diff % (3600 * 24)) / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    const seconds = diff % 60;

    let parts = [];
    if (days > 0) parts.push(`${days} يوم`);
    if (hours > 0) parts.push(`${hours} ساعة`);
    if (minutes > 0) parts.push(`${minutes} دقيقة`);
    parts.push(`${seconds} ثانية`);
    return parts.join(' و ');
}

// دالة تنفيذ pool التكرارية (تعالج 20 معاملة بكل استدعاء)
async function executePool(reason) {
    if (isExecutingPool) return;
    isExecutingPool = true;

    console.log(`[${new Date().toLocaleTimeString()}] ⚡ تشغيل المعالجة تلقائياً بسبب: ${reason}`);

    let hasMoreToProcess = true;
    let batchCounter = 0;
    const maxBatches = 20; // تسمح بمعالجة حتى 400 استثمار منتهٍ متتالي دون توقف

    while (hasMoreToProcess && batchCounter < maxBatches) {
        batchCounter++;
        let success = false;
        let attempts = 0;

        console.log(`[${new Date().toLocaleTimeString()}] 📦 إرسال الدفعة رقم ${batchCounter} لتنفيذ pool() (تصفية دفعة من 20)...`);

        while (!success && attempts < rpcUrls.length) {
            try {
                wallet = new ethers.Wallet(privateKey, provider);
                contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

                const tx = await contract.pool();
                console.log(`[${new Date().toLocaleTimeString()}] 📤 تم إرسال المعاملة. الهاش: ${tx.hash}`);

                const receipt = await tx.wait();
                console.log(`[${new Date().toLocaleTimeString()}] ✅ تم تأكيد الدفعة رقم ${batchCounter} بنجاح في البلوك: ${receipt.blockNumber}`);
                success = true;
            } catch (error) {
                attempts++;
                console.error(`[${new Date().toLocaleTimeString()}] ⚠️ فشل بالدفعة ${batchCounter} (محاولة ${attempts}/${rpcUrls.length}):`, error.reason || error.message);
                provider = getNextProvider();
            }
        }

        if (!success) {
            console.log("❌ فشلت محاولات هذه الدفعة، سيتم استكمال باقي الدفعات في الدورة القادمة.");
            break;
        }

        // فحص الاستثمارات المنتهية المتبقية بالذاكرة
        const now = Math.floor(Date.now() / 1000);
        let remainingExpiredCount = 0;

        for (let [invId, expiryTime] of activeInvestments.entries()) {
            if (now >= expiryTime) {
                remainingExpiredCount++;
            }
        }

        if (remainingExpiredCount === 0) {
            hasMoreToProcess = false;
            console.log(`🎉 [تمت المعالجة بنجاح] تم إنهاء وتصفية جميع الاستثمارات المنتهية بالكامل بعد ${batchCounter} دفعة.`);
        } else {
            console.log(`🔄 ما زال هناك ${remainingExpiredCount} استثماراً منتهياً، جاري تنفيذ الدفعة التالية (${batchCounter + 1})...`);
            await new Promise(resolve => setTimeout(resolve, 2500)); // انتظار بسيط لمنع الازدحام
        }
    }

    isExecutingPool = false;
}

// فحص واستدعاء الاستثمارات من العقد فور الرفع وطباعتها بالتفصيل
async function scanRecentInvestments() {
    try {
        wallet = new ethers.Wallet(privateKey, provider);
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

        let totalInvestments = 0;
        try {
            totalInvestments = Number(await contract.invCursor());
        } catch (e) {
            return;
        }

        if (totalInvestments === 0) return;

        const startIndex = totalInvestments - 1;
        const limitIndex = Math.max(0, totalInvestments - 150); // فحص شامل لآخر 150 استثمار

        let expiredFound = false;

        for (let i = startIndex; i >= limitIndex; i--) {
            try {
                const invData = await contract.investments(i);

                if (invData && invData.investor && invData.investor !== ethers.ZeroAddress) {
                    const invId = i.toString();

                    // إذا كان مسحوب مبكر أو معالج سابقاً -> أزله تماماً
                    if (invData.processed || invData.earlyWithdrawn) {
                        if (activeInvestments.has(invId)) {
                            activeInvestments.delete(invId);
                        }
                        continue;
                    }

                    const startTime = Number(invData.startTime);
                    const duration = Number(invData.duration);
                    const expiryTime = startTime + duration;
                    const now = Math.floor(Date.now() / 1000);

                    if (now >= expiryTime) {
                        activeInvestments.set(invId, expiryTime);
                        expiredFound = true;
                    } else {
                        if (!activeInvestments.has(invId)) {
                            activeInvestments.set(invId, expiryTime);
                            console.log(`🔍 [تحميل استثمار سابق/نشط] ID: #${invId} | المحفظة: ${invData.investor} | المتبقي: ${formatRemainingTime(expiryTime)}`);
                        }
                    }
                }
            } catch (err) {}
        }

        if (expiredFound && !isExecutingPool) {
            await executePool("اكتشاف استثمارات منتهية أثناء الفحص والمزامنة الفورية");
        }
    } catch (err) {
        provider = getNextProvider();
    }
}

// 1️⃣ فحص وتتبع الذاكرة بدقة كل 1 ثانية
setInterval(async () => {
    if (isExecutingPool) return;

    const now = Math.floor(Date.now() / 1000);
    let triggerNeeded = false;

    for (let [invId, expiryTime] of activeInvestments.entries()) {
        if (now >= expiryTime) {
            console.log(`⏱️ [الوقت انتهى بالثانية] الاستثمار ID: #${invId} وصل لوقت الانتهاء الآن!`);
            triggerNeeded = true;
        }
    }

    if (triggerNeeded) {
        await executePool("انتهاء وقت استثمار في المراقبة الثانية الحية");
    }
}, 1000);

// 2️⃣ مزامنة دورية متواصلة من العقد كل 5 ثوانٍ لضمان الشمولية والتحديث المستمر
setInterval(async () => {
    if (isExecutingPool) return;
    try {
        await scanRecentInvestments();
    } catch (e) {
        provider = getNextProvider();
    }
}, 5000);

// بدء تشغيل البوت
async function startBot() {
    console.log("🚀 جاري جلب وسحب جميع الاستثمارات السابقة والنشطة عند البدء...");
    await scanRecentInvestments();
    console.log("✅ البوت يعمل بنجاح بدون توقف ويراقب الاستثمارات ويطبق نظام الدفعات المتتالية تلقائياً.");

    try {
        contract.on("PoolEvent", async (id, itemType, user, amount, success) => {
            try {
                const invId = id.toString();
                console.log(`--------------------------------------------------`);
                console.log(`🔔 [حدث عقد جديد] ${new Date().toLocaleTimeString()}`);
                console.log(`🆔 ID: #${invId} | نوع الحدث: ${itemType} | المحفظة: ${user}`);
                console.log(`--------------------------------------------------`);

                if (itemType === "INVESTMENT_CREATED") {
                    const invData = await contract.investments(invId);
                    const expiryTime = Number(invData.startTime) + Number(invData.duration);
                    activeInvestments.set(invId, expiryTime);
                    console.log(`🚀 [تم التقاط استثمار جديد] ID: #${invId} | الوقت المتبقي: ${formatRemainingTime(expiryTime)}`);
                } 
                else if (itemType === "EARLY_WITHDRAWAL") {
                    if (activeInvestments.has(invId)) {
                        activeInvestments.delete(invId);
                        console.log(`🗑️ [سحب مبكر] تم إزالة الاستثمار #${invId} من الذاكرة لعدم تشغيل pool له.`);
                    }
                }
                else if (itemType === "INVESTMENT_MATURED") {
                    if (activeInvestments.has(invId)) {
                        activeInvestments.delete(invId);
                    }
                    await executePool(`اكتمال الاستثمار #${invId} طبيعياً`);
                }
            } catch (err) {}
        });
    } catch (e) {
        console.log("الاعتماد الأساسي على المراقبة الدورية والفحص المستمر بالثانية.");
    }
}

// حماية البوت من التوقف والانهيار عند الأخطاء الغير متوقعة
process.on("unhandledRejection", (reason) => {
    console.error("⚠️ خطأ تم تجاوزه لمنع توقف البوت:", reason);
});

process.on("uncaughtException", (error) => {
    console.error("⚠️ استثناء تم تجاوزه لمنع توقف البوت:", error);
});

startBot();
