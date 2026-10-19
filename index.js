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

console.log("=========================================");
console.log(" PeetX Ultimate Bot Started (Fully Loaded)!");
console.log(" Wallet Address: " + wallet.address);
console.log("=========================================");

async function triggerPool() {
    let success = false;
    let attempts = 0;

    while (!success && attempts < rpcUrls.length) {
        try {
            wallet = new ethers.Wallet(privateKey, provider);
            contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

            console.log(`[${new Date().toLocaleTimeString()}] 🚀 جاري تنفيذ دالة pool()...`);
            const tx = await contract.pool();
            console.log("تم إرسال المعاملة بنجاح. الهاش: " + tx.hash);

            const receipt = await tx.wait();
            console.log("✅ تم التأكيد في البلوك رقم: " + receipt.blockNumber);
            success = true;
        } catch (error) {
            attempts++;
            console.error(`خطأ في تنفيذ pool (محاولة ${attempts}):`, error.reason || error.message);
            provider = getNextProvider();
        }
    }
}

// فحص الاستثمارات الذكي (من الأحدث للأقدم، بحد أقصى 30 يوماً)
async function fetchInvestmentsSmart() {
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

        for (let i = totalInvestments - 1; i >= 0; i--) {
            try {
                const invData = await contract.investments(i);
                if (invData && invData.investor && invData.investor !== ethers.ZeroAddress) {
                    const startTime = Number(invData.startTime);

                    if (startTime < thirtyDaysAgo) {
                        break; 
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

                    if (!activeInvestments.has(invId)) {
                        if (expiryTime > now) {
                            activeInvestments.set(invId, expiryTime);
                        } else {
                            activeInvestments.set(invId, now);
                            console.log(`⚡ وُجد استثمار منتهٍ مسبقاً رقم #${invId}!`);
                        }
                    }
                }
            } catch (err) {}
        }
    } catch (err) {
        provider = getNextProvider();
    }
}

// 1. مراقبة الذاكرة محلياً كل ثانية للتنفيذ الفوري فور انتهاء الوقت
setInterval(async () => {
    const now = Math.floor(Date.now() / 1000);
    let needToRunPool = false;

    for (let [invId, expiryTime] of activeInvestments.entries()) {
        if (now >= expiryTime) {
            console.log(`⏰ الاستثمار #${invId} انتهى وقته تماماً!`);
            needToRunPool = true;
            activeInvestments.delete(invId);
        }
    }

    if (needToRunPool) {
        await triggerPool();
    }
}, 1000);

// 2. فحص دالة Chainlink كل 5 ثوانٍ
setInterval(async () => {
    try {
        wallet = new ethers.Wallet(privateKey, provider);
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

        const chainlinkStatus = await contract.Chainlink();
        if (chainlinkStatus === true) {
            console.log(`⚡ تنبيه: دالة Chainlink أصبحت TRUE! جاري تنفيذ pool...`);
            await triggerPool();
        }
    } catch (e) {
        provider = getNextProvider();
    }
}, 5000);

// 3. تحديث الاستثمارات دورياً كل 5 ثوانٍ
setInterval(async () => {
    await fetchInvestmentsSmart();
}, 5000);

async function startBot() {
    console.log("جاري جلب الاستثمارات الأولية والفحص الشامل...");
    await fetchInvestmentsSmart();

    // الاستماع الفوري للأحداث (لايف)
    contract.on("PoolEvent", async (id, itemType, user, amount, success) => {
        try {
            const invId = id.toString();

            if (itemType === "INVESTMENT_CREATED") {
                const invData = await contract.investments(invId);
                const expiryTime = Number(invData.startTime) + Number(invData.duration);
                activeInvestments.set(invId, expiryTime);
                console.log(`🚀 تسجيل استثمار جديد لايف #${invId} (ينتهي في: ${new Date(expiryTime * 1000).toLocaleString()})`);
            } else if (itemType === "EARLY_WITHDRAWAL" || itemType === "INVESTMENT_MATURED") {
                if (activeInvestments.has(invId)) {
                    activeInvestments.delete(invId);
                    console.log(`🗑️ إزالة الاستثمار #${invId} من الذاكرة (تم سحبه أو إنهاؤه)`);
                }
            }
        } catch (err) {}
    });

    console.log("البوت يعمل الآن بأعلى كفاءة وجاهز 100%...");
}

startBot();
