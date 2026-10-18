const { ethers } = require("ethers");
const http = require("http");

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
    console.error("الخطأ: لم يتم العثور على PRIVATE_KEY في إعدادات البيئة (Variables)!");
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

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('PeetX Smart Bot is running successfully!\n');
}).listen(PORT, () => {
    console.log(`سيرفر الحماية شغال على البورت ${PORT} حتى يبقى البوت مستمر 24/7.`);
});

console.log("=========================================");
console.log(" تم تشغيل بوت PeetX الذكي (مع إظهار الأرقام والأحداث باستمرار) بنجاح!");
console.log(" عنوان المحفظة المشغلة: " + wallet.address);
console.log("=========================================");

async function triggerPool() {
    let success = false;
    let attempts = 0;

    while (!success && attempts < rpcUrls.length) {
        try {
            wallet = new ethers.Wallet(privateKey, provider);
            contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

            console.log(`[${new Date().toLocaleTimeString()}] 🚀 جاري استدعاء وتوقيع دالة pool() الآن...`);
            const tx = await contract.pool();
            console.log("تم إرسال المعاملة بنجاح. الهاش: " + tx.hash);

            const receipt = await tx.wait();
            console.log("✅ تم تأكيد المعاملة في البلوك رقم: " + receipt.blockNumber);
            success = true;
        } catch (error) {
            attempts++;
            console.error(`[${new Date().toLocaleTimeString()}] خطأ في تنفيذ pool (محاولة ${attempts}):`, error.reason || error.message);
            provider = getNextProvider();
        }
    }
}

async function fetchRecentInvestments() {
    try {
        wallet = new ethers.Wallet(privateKey, provider);
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

        const now = Math.floor(Date.now() / 1000);
        let totalInvestments = 0;
        try {
            totalInvestments = Number(await contract.invCursor());
            console.log(`[${new Date().toLocaleTimeString()}] 📊 عدد الاستثمارات الكلي الحالي بالعقد (invCursor): ${totalInvestments}`);
        } catch (e) {
            totalInvestments = 50;
        }

        let startIdx = totalInvestments > 50 ? totalInvestments - 50 : 0;
        const thirtyDaysAgo = now - (30 * 24 * 60 * 60);

        for (let i = startIdx; i < totalInvestments; i++) {
            try {
                const invData = await contract.investments(i);
                if (invData && invData.investor && invData.investor !== ethers.ZeroAddress) {
                    const invId = i.toString();

                    if (invData.processed || invData.earlyWithdrawn) {
                        if (activeInvestments.has(invId)) {
                            activeInvestments.delete(invId);
                            console.log(`[${new Date().toLocaleTimeString()}] 🗑️ الاستثمار #${invId} مسحوب أو معالج (تم حذفه من الذاكرة).`);
                        }
                        continue;
                    }

                    const startTime = Number(invData.startTime);
                    if (startTime < thirtyDaysAgo) continue;

                    const duration = Number(invData.duration);
                    const expiryTime = startTime + duration;

                    if (!activeInvestments.has(invId)) {
                        if (expiryTime > now) {
                            activeInvestments.set(invId, expiryTime);
                            console.log(`[${new Date().toLocaleTimeString()}] ➕ إضافة الاستثمار #${invId} للذاكرة | ينتهي في: ${new Date(expiryTime * 1000).toLocaleString()}`);
                        } else {
                            activeInvestments.set(invId, now);
                            console.log(`[${new Date().toLocaleTimeString()}] ⚡ الاستثمار #${invId} منتهي وقته وجاهز للتنفيذ الفوري!`);
                        }
                    }
                }
            } catch (err) {}
        }
    } catch (err) {
        provider = getNextProvider();
    }
}

setInterval(async () => {
    const now = Math.floor(Date.now() / 1000);
    let needToRunPool = false;

    for (let [invId, expiryTime] of activeInvestments.entries()) {
        if (now >= expiryTime) {
            console.log(`[${new Date().toLocaleTimeString()}] ⏰ الكاونتر أعلن انتهاء وقت الاستثمار #${invId}!`);
            needToRunPool = true;
            activeInvestments.delete(invId);
        }
    }

    try {
        const chainlinkStatus = await contract.Chainlink();
        if (chainlinkStatus === true) {
            console.log(`[${new Date().toLocaleTimeString()}] ⚡ تنبيه Chainlink أصبح true!`);
            needToRunPool = true;
        }
    } catch (e) {}

    if (needToRunPool) {
        await triggerPool();
    }
}, 1000);

setInterval(async () => {
    await fetchRecentInvestments();
}, 5000);

async function startBot() {
    console.log(`[${new Date().toLocaleTimeString()}] جاري جلب الاستثمارات الأولية وعرض أرقامها...`);
    await fetchRecentInvestments();
    console.log(`[${new Date().toLocaleTimeString()}] إجمالي الاستثمارات النشطة حالياً بالذاكرة: ${activeInvestments.size}`);

    contract.on("PoolEvent", async (id, itemType, user, amount, success) => {
        try {
            const invId = id.toString();
            console.log(`[${new Date().toLocaleTimeString()}] 🔔 حدث جديد من العقد | ID: ${invId} | Type: ${itemType} | User: ${user}`);

            if (itemType === "INVESTMENT_CREATED") {
                const invData = await contract.investments(invId);
                const startTime = Number(invData.startTime);
                const duration = Number(invData.duration);
                const expiryTime = startTime + duration;

                activeInvestments.set(invId, expiryTime);
                console.log(`[${new Date().toLocaleTimeString()}] 🚀 تسجيل استثمار جديد رقم #${invId} (ينتهي في: ${new Date(expiryTime * 1000).toLocaleString()}). الاستثمارات النشطة بالذاكرة: ${activeInvestments.size}`);
            
            } else if (itemType === "EARLY_WITHDRAWAL" || itemType === "INVESTMENT_MATURED") {
                if (activeInvestments.has(invId)) {
                    activeInvestments.delete(invId);
                    console.log(`[${new Date().toLocaleTimeString()}] 🗑️ تم إزالة الاستثمار #${invId} من الذاكرة (سحب مبكر أو انتهاء). الاستثمارات النشطة بالذاكرة: ${activeInvestments.size}`);
                }
            }
        } catch (err) {}
    });

    console.log(`[${new Date().toLocaleTimeString()}] البوت يعمل الآن ويطبع تفاصيل الأرقام والأحداث لحظياً...`);
}

startBot();
