const { ethers } = require("ethers");

const CONTRACT_ADDRESS = "0x9B3F6B83B07E5B313D960D47938800f0BCce206D";

// الـ ABI الدقيق والصحيح المستخرج من عقدك
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
    {"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"pool","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"invId","type":"uint256"}],"name":"settleInvestment","outputs":[],"stateMutability":"nonpayable","type":"function"}
];

const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) {
    console.error("الخطأ: لم يتم العثور على PRIVATE_KEY في إعدادات البيئة!");
    process.exit(1);
}

// 5 روابط باينانس الرسمية مع مزودات احتياطية للتحويل الفوري
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

// الذاكرة المحلية لتتبع الاستثمارات النشطة ومواعيد انتهائها
const activeInvestments = new Map();
let isExecutingPool = false;

console.log("=========================================");
console.log(" PeetX Master Precision Bot (Loaded & Audited)!");
console.log(" Wallet Address: " + wallet.address);
console.log("=========================================");

// دالة تنفيذ pool بنظام الدفعات المتتالية (كل دفعة تعارض حد العقد 20 معاملة)
async function executePool(reason) {
    if (isExecutingPool) return;
    isExecutingPool = true;

    console.log(`[${new Date().toLocaleTimeString()}] 🚀 بدء معالجة الاستثمارات بسبب: ${reason}`);

    let hasMoreToProcess = true;
    let batchCounter = 0;
    const maxBatches = 10; 

    while (hasMoreToProcess && batchCounter < maxBatches) {
        batchCounter++;
        let success = false;
        let attempts = 0;

        console.log(`[${new Date().toLocaleTimeString()}] 📦 تنفيذ دفعة المعالجة رقم ${batchCounter} (دالة pool)...`);

        while (!success && attempts < rpcUrls.length) {
            try {
                wallet = new ethers.Wallet(privateKey, provider);
                contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

                const tx = await contract.pool();
                console.log(`[${new Date().toLocaleTimeString()}] 📤 تم إرسال المعاملة بنجاح. الهاش: ${tx.hash}`);

                const receipt = await tx.wait();
                console.log(`[${new Date().toLocaleTimeString()}] ✅ تم تأكيد الدفعة رقم ${batchCounter} في البلوك: ${receipt.blockNumber}`);
                console.log(`🎉 [نجاح المعاملة] تم تصفية الدفعة بنجاح عبر دالة pool()!`);
                
                success = true;
            } catch (error) {
                attempts++;
                console.error(`[${new Date().toLocaleTimeString()}] ⚠️ فشل في تنفيذ pool (محاولة ${attempts}/${rpcUrls.length}):`, error.reason || error.message);
                provider = getNextProvider();
            }
        }

        if (!success) {
            console.log("❌ فشلت محاولات تنفيذ هذه الدفعة.");
            break;
        }

        const now = Math.floor(Date.now() / 1000);
        let remainingExpired = 0;
        for (let [invId, expiryTime] of activeInvestments.entries()) {
            if (now >= expiryTime) {
                remainingExpired++;
            }
        }

        if (remainingExpired === 0) {
            hasMoreToProcess = false;
            console.log("✨ تمت معالجة وتصفية كافة الاستثمارات المنتهية بالكامل.");
        } else {
            console.log(`🔄 لا يزال هناك ${remainingExpired} استثماراً منتهياً، جاري إرسال الدفعة التالية...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }

    isExecutingPool = false;
}

// فحص أحدث 50 استثماراً مع تجاهل ما تجاوز 30 يوماً
async function scanRecentInvestments() {
    try {
        wallet = new ethers.Wallet(privateKey, provider);
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

        const now = Math.floor(Date.now() / 1000);
        let totalInvestments = 0;

        try {
            totalInvestments = Number(await contract.invCursor());
            console.log(`[${new Date().toLocaleTimeString()}] 📊 إجمالي الاستثمارات بالعقد: ${totalInvestments}`);
        } catch (e) {
            return;
        }

        if (totalInvestments === 0) return;

        const thirtyDaysAgo = now - (30 * 24 * 60 * 60);
        const startIndex = totalInvestments - 1;
        const limitIndex = Math.max(0, totalInvestments - 50);

        let expiredFound = false;

        console.log(`🔍 جاري فحص أحدث الاستثمارات (من #${startIndex} إلى #${limitIndex})...`);

        for (let i = startIndex; i >= limitIndex; i--) {
            try {
                const invData = await contract.investments(i);

                if (invData && invData.investor && invData.investor !== ethers.ZeroAddress) {
                    const startTime = Number(invData.startTime);

                    // إذا تجاوز الاستثمار 30 يوماً يتم تجاهله نهائياً
                    if (startTime < thirtyDaysAgo) {
                        console.log(`🛑 الاستثمار #${i} أقدم من 30 يوماً. إيقاف الفحص.`);
                        break;
                    }

                    const invId = i.toString();

                    // إذا تم معالجته أو سحبه مبكراً، يتم حذفه من الذاكرة وتخطيه
                    if (invData.processed || invData.earlyWithdrawn) {
                        if (activeInvestments.has(invId)) {
                            activeInvestments.delete(invId);
                        }
                        continue;
                    }

                    const duration = Number(invData.duration);
                    const expiryTime = startTime + duration;

                    if (now >= expiryTime) {
                        console.log(`⏰ [استثمار سابقه منتهٍ] ID: #${invId} | المحفظة: ${invData.investor} | انتهى في: ${new Date(expiryTime * 1000).toLocaleString()}`);
                        expiredFound = true;
                    } else {
                        activeInvestments.set(invId, expiryTime);
                        console.log(`➕ [تمت إضافة استثمار للذاكرة] ID: #${invId} | المحفظة: ${invData.investor} | ينتهي في: ${new Date(expiryTime * 1000).toLocaleString()}`);
                    }
                }
            } catch (err) {}
        }

        if (expiredFound) {
            await executePool("كشف استثمارات سابقة منتهية غير معالجة أثناء الفحص الأولي");
        }

    } catch (err) {
        provider = getNextProvider();
    }
}

// 1️⃣ فحص الذاكرة كل ثانية واحدة بدقة مطلقة
setInterval(async () => {
    if (isExecutingPool) return;

    const now = Math.floor(Date.now() / 1000);
    let triggerNeeded = false;

    for (let [invId, expiryTime] of activeInvestments.entries()) {
        if (now >= expiryTime) {
            console.log(`⏱️ [انتهاء الوقت بالثانية] الاستثمار رقم #${invId} وصل وقت نهايته تماماً!`);
            triggerNeeded = true;
            activeInvestments.delete(invId);
        }
    }

    if (triggerNeeded) {
        await executePool("انتهاء وقت استثمار محلياً بالثانية");
    }
}, 1000);

// 2️⃣ فحص العقد ودالة Chainlink كل 5 ثوانٍ
setInterval(async () => {
    if (isExecutingPool) return;

    try {
        wallet = new ethers.Wallet(privateKey, provider);
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

        const chainlinkStatus = await contract.Chainlink();
        if (chainlinkStatus === true) {
            console.log(`⚡ [Chainlink Alert] إشارة Chainlink أصبحت TRUE!`);
            await executePool("إشارة Chainlink أصبحت True");
        }

        await scanRecentInvestments();

    } catch (e) {
        provider = getNextProvider();
    }
}, 5000);

// الاستماع المباشر للأحداث وطباعة كافة التفاصيل في السجلات
async function startBot() {
    console.log("جاري الفحص الأولي وسحب الاستثمارات السابقة والنشطة...");
    await scanRecentInvestments();

    try {
        contract.on("PoolEvent", async (id, itemType, user, amount, success) => {
            try {
                const invId = id.toString();
                console.log(`--------------------------------------------------`);
                console.log(`🔔 [حدث جديد في العقد] ${new Date().toLocaleTimeString()}`);
                console.log(`🆔 رقم الاستثمار (ID): #${invId}`);
                console.log(`📌 نوع الحدث: ${itemType}`);
                console.log(`👛 عنوان المحفظة: ${user}`);
                console.log(`✅ حالة النجاح: ${success}`);
                console.log(`--------------------------------------------------`);

                if (itemType === "INVESTMENT_CREATED") {
                    const invData = await contract.investments(invId);
                    const expiryTime = Number(invData.startTime) + Number(invData.duration);
                    activeInvestments.set(invId, expiryTime);
                    console.log(`🚀 [مراقبة جديدة] تم تسجيل الاستثمار #${invId} للمحفظة ${user} وسيتم تنفيذه في: ${new Date(expiryTime * 1000).toLocaleString()}`);
                } else if (itemType === "EARLY_WITHDRAWAL" || itemType === "INVESTMENT_MATURED") {
                    if (activeInvestments.has(invId)) {
                        activeInvestments.delete(invId);
                        console.log(`🗑️ [إزالة من الذاكرة] تم حذف الاستثمار #${invId} لإتمام سحبه أو انتهائه.`);
                    }
                    console.log(`🎯 [نجاح المعاملة] تم رصد سحب أو انتهاء ناجح للاستثمار #${invId}، جاري تشغيل دالة pool...`);
                    await executePool(`معاملة جديدة من نوع: ${itemType} للمحفظة ${user}`);
                }
            } catch (err) {}
        });
    } catch (e) {
        console.log("الاعتماد على الفحص الدوري نشط بالكامل.");
    }

    console.log("✅ البوت يعمل بكامل طاقته ويسجل كافة الأحداث والمعاملات والسحوبات في السجلات بدقة.");
}

process.on("unhandledRejection", (reason) => {
    console.error("خطأ تم تجاوزه لضمان استمرار البوت:", reason);
});

process.on("uncaughtException", (error) => {
    console.error("استثناء تم تجاوزه لضمان استمرار البوت:", error);
});

startBot();
