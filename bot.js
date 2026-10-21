const { ethers } = require("ethers");

const CONTRACT_ADDRESS = "0x9B3F6B83B07E5B313D960D47938800f0BCce206D";

// الـ ABI الكامل والدقيق المستخرج من العقد
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
    {"inputs":[{"internalType":"uint256","name":"invId","type":"uint256"}],"name":"settleInvestment","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"investments","outputs":[{"internalType":"uint256","name":"id","type":"uint256"},{"internalType":"address","name":"investor","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"uint256","name":"planId","type":"uint256"},{"internalType":"uint256","name":"profitPercent","type":"uint256"},{"internalType":"uint256","name":"startTime","type":"uint256"},{"internalType":"uint256","name":"duration","type":"uint256"},{"internalType":"uint256","name":"totalGenPaid","type":"uint256"},{"internalType":"bool","name":"processed","type":"bool"},{"internalType":"bool","name":"earlyWithdrawn","type":"bool"}],"stateMutability":"view","type":"function"}
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

// سجل الذاكرة الداخلي المخصص لمراقبة كافة الاستثمارات
const activeInvestments = new Map();
let isExecutingPool = false;

console.log("=========================================");
console.log(" PeetX Ultra View_plans Engine Bot!");
console.log(" Wallet Address: " + wallet.address);
console.log("=========================================");

// دالة تنفيذ pool بنظام الدفعات (حد أقصى 20 معاملة لكل استدعاء)
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
        for (let [invId, invData] of activeInvestments.entries()) {
            if (now >= invData.expiryTime) {
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

// دالة تنسيق الوقت المتبقي
function formatRemainingTime(expiryTime) {
    const now = Math.floor(Date.now() / 1000);
    const diff = expiryTime - now;
    if (diff <= 0) return "منتهٍ وجاهز للتنفيذ";
    
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

// جلب المحافظ وتمريرها إلى View_plans(user, 0, 1000)
async function scanRecentInvestments() {
    try {
        wallet = new ethers.Wallet(privateKey, provider);
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

        const now = Math.floor(Date.now() / 1000);
        let totalInvestments = 0;

        try {
            totalInvestments = Number(await contract.invCursor());
        } catch (e) {
            return;
        }

        if (totalInvestments === 0) return;

        const thirtyDaysAgo = now - (30 * 24 * 60 * 60);
        const startIndex = totalInvestments - 1;
        const limitIndex = Math.max(0, totalInvestments - 50);

        let expiredFound = false;
        const processedWallets = new Set();

        for (let i = startIndex; i >= limitIndex; i--) {
            try {
                const invBasic = await contract.investments(i);

                if (invBasic && invBasic.investor && invBasic.investor !== ethers.ZeroAddress) {
                    const startTime = Number(invBasic.startTime);

                    if (startTime < thirtyDaysAgo) {
                        break;
                    }

                    const userAddress = invBasic.investor;

                    if (processedWallets.has(userAddress)) continue;
                    processedWallets.add(userAddress);

                    // استدعاء View_plans(user, 0, 1000)
                    const userPlans = await contract.View_plans(userAddress, 0, 1000);
                    const userActiveInvs = userPlans.activeInvestments;

                    if (userActiveInvs && userActiveInvs.length > 0) {
                        for (let inv of userActiveInvs) {
                            const invId = inv.id.toString();
                            const invStartTime = Number(inv.startTime);
                            const invDuration = Number(inv.duration);
                            const expiryTime = invStartTime + invDuration;

                            if (invStartTime < thirtyDaysAgo) continue;

                            if (inv.processed || inv.earlyWithdrawn) {
                                if (activeInvestments.has(invId)) {
                                    activeInvestments.delete(invId);
                                    console.log(`🗑️ [تحديث حالة] الاستثمار #${invId} تم سحبه/معالجته مسبقاً، تم إزالته من السجل.`);
                                }
                                continue;
                            }

                            if (now >= expiryTime) {
                                console.log(`⏰ [استثمار منتهٍ غير معالج] ID: #${invId} | المحفظة: ${userAddress}`);
                                expiredFound = true;
                            } else {
                                const remainingTimeStr = formatRemainingTime(expiryTime);
                                if (!activeInvestments.has(invId)) {
                                    console.log(`📥 [سجل جديد عبر View_plans] ID: #${invId} | المحفظة: ${userAddress} | الوقت المتبقي: ${remainingTimeStr}`);
                                }
                                activeInvestments.set(invId, {
                                    expiryTime: expiryTime,
                                    user: userAddress
                                });
                            }
                        }
                    }
                }
            } catch (err) {}
        }

        if (expiredFound) {
            await executePool("كشف استثمارات منتهية عبر فحص View_plans الدوري");
        }

    } catch (err) {
        provider = getNextProvider();
    }
}

// 1️⃣ مراقبة كافة السجلات الداخلية كل 1 ثانية
setInterval(async () => {
    if (isExecutingPool) return;

    const now = Math.floor(Date.now() / 1000);
    let triggerNeeded = false;

    for (let [invId, data] of activeInvestments.entries()) {
        if (now >= data.expiryTime) {
            console.log(`⏱️ [انتهاء الوقت طبيعياً] الاستثمار #${invId} للمحفظة ${data.user} وصل إلى موعد انتهائه بالثانية!`);
            triggerNeeded = true;
            activeInvestments.delete(invId);
        }
    }

    if (triggerNeeded) {
        await executePool("انتهاء وقت استثمار في السجل الداخلي (فحص الثواني)");
    }
}, 1000);

// 2️⃣ فحص العقد ودالة Chainlink والمراجعة المستمرة كل 5 ثوانٍ
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

// بدء الاستماع والعمل الفوري
async function startBot() {
    console.log("🚀 جاري بدء المراجعة وجلب المحافظ وتمريرها إلى View_plans(user, 0, 1000)...");
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
                    const userPlans = await contract.View_plans(user, 0, 1000);
                    const userActiveInvs = userPlans.activeInvestments;

                    for (let inv of userActiveInvs) {
                        if (inv.id.toString() === invId) {
                            const expiryTime = Number(inv.startTime) + Number(inv.duration);
                            const remainingTimeStr = formatRemainingTime(expiryTime);
                            
                            activeInvestments.set(invId, {
                                expiryTime: expiryTime,
                                user: user
                            });
                            console.log(`🚀 [حفظ سجل جديد تلقائياً] ID: #${invId} | المحفظة: ${user} | الوقت المتبقي: ${remainingTimeStr}`);
                            break;
                        }
                    }
                } 
                else if (itemType === "EARLY_WITHDRAWAL") {
                    if (activeInvestments.has(invId)) {
                        activeInvestments.delete(invId);
                        console.log(`🗑️ [سحب مبكر يدوي] تم حذف الاستثمار #${invId} من السجل الداخلي للمحفظة: ${user}. بدون تشغيل pool.`);
                    }
                }
                else if (itemType === "INVESTMENT_MATURED") {
                    if (activeInvestments.has(invId)) {
                        activeInvestments.delete(invId);
                    }
                    await executePool(`اكتمال وقت الاستثمار #${invId} طبيعياً للمحفظة ${user}`);
                }
            } catch (err) {}
        });
    } catch (e) {
        console.log("الاعتماد على الفحص الدوري نشط بالكامل.");
    }

    console.log("✅ البوت يعمل بكامل طاقته ومجهز بـ View_plans Engine والمراقبة بالثانية تامة.");
}

process.on("unhandledRejection", (reason) => {
    console.error("خطأ تم تجاوزه لضمان استمرار البوت:", reason);
});

process.on("uncaughtException", (error) => {
    console.error("استثناء تم تجاوزه لضمان استمرار البوت:", error);
});

startBot();
