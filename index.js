const { ethers } = require("ethers");

const CONTRACT_ADDRESS = "0x9B3F6B83B07E5B313D960D47938800f0BCce206D";

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
    console.error("❌ خطأ: لم يتم العثور على PRIVATE_KEY في إعدادات البيئة!");
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

async function executePool(reason) {
    if (isExecutingPool) return;
    isExecutingPool = true;

    console.log(`[${new Date().toLocaleTimeString()}] ⚡ تشغيل المعالجة بسبب: ${reason}`);

    let hasMoreToProcess = true;
    let batchCounter = 0;
    const maxBatches = 20;

    while (hasMoreToProcess && batchCounter < maxBatches) {
        batchCounter++;
        let success = false;
        let attempts = 0;

        while (!success && attempts < rpcUrls.length) {
            try {
                wallet = new ethers.Wallet(privateKey, provider);
                contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

                const tx = await contract.pool();
                console.log(`[${new Date().toLocaleTimeString()}] 📤 تم إرسال المعاملة (دفعة ${batchCounter}). الهاش: ${tx.hash}`);

                const receipt = await tx.wait();
                console.log(`[${new Date().toLocaleTimeString()}] ✅ تم تأكيد الدفعة رقم ${batchCounter} في البلوك: ${receipt.blockNumber}`);
                success = true;
            } catch (error) {
                attempts++;
                provider = getNextProvider();
            }
        }

        if (!success) break;

        const now = Math.floor(Date.now() / 1000);
        let remainingExpiredCount = 0;

        for (let [invId, expiryTime] of activeInvestments.entries()) {
            if (now >= expiryTime) {
                remainingExpiredCount++;
            }
        }

        if (remainingExpiredCount === 0) {
            hasMoreToProcess = false;
            console.log(`🎉 [تمت المعالجة] تمت تصفية جميع الاستثمارات المنتهية بعد ${batchCounter} دفعة.`);
        } else {
            await new Promise(resolve => setTimeout(resolve, 2500));
        }
    }

    isExecutingPool = false;
}

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
        const limitIndex = Math.max(0, totalInvestments - 150);
        let expiredFound = false;

        for (let i = startIndex; i >= limitIndex; i--) {
            try {
                const invData = await contract.investments(i);

                if (invData && invData.investor && invData.investor !== ethers.ZeroAddress) {
                    const invId = i.toString();

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
                            console.log(`🔍 [استثمار سابق/نشط] ID: #${invId} | المحفظة: ${invData.investor} | المتبقي: ${formatRemainingTime(expiryTime)}`);
                        }
                    }
                }
            } catch (err) {}
        }

        if (expiredFound && !isExecutingPool) {
            await executePool("اكتشاف استثمارات منتهية أثناء الفحص والمزامنة");
        }
    } catch (err) {
        provider = getNextProvider();
    }
}

setInterval(async () => {
    if (isExecutingPool) return;

    const now = Math.floor(Date.now() / 1000);
    let triggerNeeded = false;

    for (let [invId, expiryTime] of activeInvestments.entries()) {
        if (now >= expiryTime) {
            console.log(`⏱️ [انتهى الوقت] الاستثمار ID: #${invId} انتهى الآن!`);
            triggerNeeded = true;
        }
    }

    if (triggerNeeded) {
        await executePool("انتهاء وقت استثمار في المراقبة الثانية");
    }
}, 1000);

setInterval(async () => {
    if (isExecutingPool) return;
    try {
        await scanRecentInvestments();
    } catch (e) {
        provider = getNextProvider();
    }
}, 5000);

async function startBot() {
    console.log("🚀 جاري جلب الاستثمارات السابقة والنشطة عند التشغيل...");
    await scanRecentInvestments();
    console.log("✅ البوت يعمل بانتظام ويراقب الاستثمارات.");

    try {
        contract.on("PoolEvent", async (id, itemType, user, amount, success) => {
            try {
                const invId = id.toString();
                if (itemType === "INVESTMENT_CREATED") {
                    const invData = await contract.investments(invId);
                    const expiryTime = Number(invData.startTime) + Number(invData.duration);
                    activeInvestments.set(invId, expiryTime);
                    console.log(`🚀 [استثمار جديد] ID: #${invId} | الوقت المتبقي: ${formatRemainingTime(expiryTime)}`);
                } 
                else if (itemType === "EARLY_WITHDRAWAL") {
                    if (activeInvestments.has(invId)) {
                        activeInvestments.delete(invId);
                        console.log(`🗑️ [سحب مبكر] تمت إزالة الاستثمار #${invId}`);
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
    } catch (e) {}
}

process.on("unhandledRejection", () => {});
process.on("uncaughtException", () => {});

startBot();
