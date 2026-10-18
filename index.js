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

const PORT = process.env.PORT || 8080;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is alive and running!\n');
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`HTTP Server is running and listening on port ${PORT}`);
});

console.log("=========================================");
console.log(" PeetX Smart Bot Started (5s interval, 100 blocks check)!");
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
            console.log("تم إرسال المعاملة. الهاش: " + tx.hash);

            const receipt = await tx.wait();
            console.log("✅ تم التأكيد في البلوك: " + receipt.blockNumber);
            success = true;
        } catch (error) {
            attempts++;
            console.error(`خطأ في تنفيذ pool (محاولة ${attempts}):`, error.reason || error.message);
            provider = getNextProvider();
        }
    }
}

// دالة فحص الاستثمارات من الأحدث للأقدم (بحد أقصى 100 عنصر أو بلوك)
async function fetchInvestmentsBatch() {
    try {
        wallet = new ethers.Wallet(privateKey, provider);
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

        const now = Math.floor(Date.now() / 1000);
        let totalInvestments = 0;
        try {
            totalInvestments = Number(await contract.invCursor());
        } catch (e) {
            totalInvestments = 100;
        }

        // فحص آخر 100 استثمار كحد أقصى من الأحدث للأقدم
        let startIdx = totalInvestments > 100 ? totalInvestments - 100 : 0;

        for (let i = totalInvestments - 1; i >= startIdx; i--) {
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

                    if (!activeInvestments.has(invId)) {
                        if (expiryTime > now) {
                            activeInvestments.set(invId, expiryTime);
                            console.log(`[${new Date().toLocaleTimeString()}] ➕ تتبع الاستثمار #${invId} (ينتهي في: ${new Date(expiryTime * 1000).toLocaleString()})`);
                        } else {
                            activeInvestments.set(invId, now);
                            console.log(`[${new Date().toLocaleTimeString()}] ⚡ الاستثمار #${invId} منتهي وقته وجاهز للتنفيذ!`);
                        }
                    }
                }
            } catch (err) {}
        }
    } catch (err) {
        provider = getNextProvider();
    }
}

// فحص الذاكرة كل ثانية للتنفيذ الفوري فور انتهاء الوقت
setInterval(async () => {
    const now = Math.floor(Date.now() / 1000);
    let needToRunPool = false;

    for (let [invId, expiryTime] of activeInvestments.entries()) {
        if (now >= expiryTime) {
            console.log(`⏰ الاستثمار #${invId} انتهى وقته!`);
            needToRunPool = true;
            activeInvestments.delete(invId);
        }
    }

    try {
        const chainlinkStatus = await contract.Chainlink();
        if (chainlinkStatus === true) {
            console.log(`⚡ تنبيه Chainlink أصبح true!`);
            needToRunPool = true;
        }
    } catch (e) {}

    if (needToRunPool) {
        await triggerPool();
    }
}, 1000);

// كل 5 ثوانٍ يتم فحص الدفعة (بحد أقصى 100 من الأحدث للأقدم)
setInterval(async () => {
    await fetchInvestmentsBatch();
}, 5000);

async function startBot() {
    await fetchInvestmentsBatch();

    contract.on("PoolEvent", async (id, itemType, user, amount, success) => {
        try {
            const invId = id.toString();
            console.log(`🔔 حدث جديد | ID: ${invId} | Type: ${itemType}`);

            if (itemType === "INVESTMENT_CREATED") {
                const invData = await contract.investments(invId);
                const expiryTime = Number(invData.startTime) + Number(invData.duration);
                activeInvestments.set(invId, expiryTime);
                console.log(`🚀 إضافة استثمار جديد #${invId} (ينتهي في: ${new Date(expiryTime * 1000).toLocaleString()})`);
            } else if (itemType === "EARLY_WITHDRAWAL" || itemType === "INVESTMENT_MATURED") {
                if (activeInvestments.has(invId)) {
                    activeInvestments.delete(invId);
                    console.log(`🗑️ إزالة الاستثمار #${invId} من الذاكرة (تم سحبه)`);
                }
            }
        } catch (err) {}
    });

    console.log("البوت يعمل الآن بفحص كل 5 ثوانٍ وبكفاءة تامة...");
}

startBot();
