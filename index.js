const { ethers } = require("ethers");
const http = require("http");

const CONTRACT_ADDRESS = "0x9B3F6B83B07E5B313D960D47938800f0BCce206D";

const CONTRACT_ABI = [
    "function pool() external",
    "function Chainlink() external view returns (bool)",
    "function investments(uint256) external view returns (uint256 id, address investor, uint256 amount, uint256 planId, uint256 profitPercent, uint256 startTime, uint256 duration, uint256 totalGenPaid, bool processed, bool earlyWithdrawn)",
    "event PoolEvent(uint256 indexed id, string itemType, address indexed user, uint256 amount, bool success)"
];

const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) {
    console.error("الخطأ: لم يتم العثور على PRIVATE_KEY في إعدادات البيئة (Variables)!");
    process.exit(1);
}

const provider = new ethers.JsonRpcProvider("https://bsc-dataseed.binance.org/");
const wallet = new ethers.Wallet(privateKey, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

const activeInvestments = new Map();

// 1. فتح سيرفر ويب وهمي صغير حتى المنصة السحابية لا تطفئ الحاوية (Container) أبداً
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('PeetX Bot is running successfully!\n');
}).listen(PORT, () => {
    console.log(`سيرفر الحماية شغال على البورت ${PORT} حتى يبقى البوت مستمر 24/7.`);
});

console.log("=========================================");
console.log(" تم تشغيل بوت PeetX الآلي (النسخة الخارقة الآمنة) بنجاح!");
console.log(" عنوان المحفظة المشغلة: " + wallet.address);
console.log("=========================================");

async function triggerPool() {
    try {
        console.log(`[${new Date().toLocaleTimeString()}] وُجد استثمار مستحق الوقت! جاري استدعاء وتوقيع دالة pool...`);
        const tx = await contract.pool();
        console.log("تم إرسال المعاملة بنجاح. الهاش: " + tx.hash);

        const receipt = await tx.wait();
        console.log("تم تأكيد المعاملة في البلوك رقم: " + receipt.blockNumber);
    } catch (error) {
        console.error(`[${new Date().toLocaleTimeString()}] خطأ أثناء التنفيذ:`, error.reason || error.message);
    }
}

// 2. فحص الذاكرة السريع جداً كل ثانية واحدة
setInterval(() => {
    const now = Math.floor(Date.now() / 1000);
    let needToRunPool = false;

    for (let [invId, expiryTime] of activeInvestments.entries()) {
        if (now >= expiryTime) {
            needToRunPool = true;
            activeInvestments.delete(invId);
        }
    }

    if (needToRunPool) {
        triggerPool();
    }
}, 1000);

// 3. فحص دالة Chainlink كل 5 ثواني (لإبقاء السيرفر نشط، وإذا صارت true يوقعها فوراً)
setInterval(async () => {
    try {
        const chainlinkStatus = await contract.Chainlink();
        if (chainlinkStatus === true) {
            console.log(`[${new Date().toLocaleTimeString()}] تنبيه Chainlink أصبح true! جاري التنفيذ الفوري...`);
            await triggerPool();
        }
    } catch (e) {
        // تجاهل أي خطأ مؤقت للشبكة
    }
}, 5000);

async function fetchPastEventsSafely() {
    try {
        const currentBlock = await provider.getBlockNumber();
        let startBlock = currentBlock > 2000 ? currentBlock - 2000 : 0;
        const batchSize = 100;

        console.log(`[${new Date().toLocaleTimeString()}] جاري فحص الاستثمارات القديمة بدفعات آمنة (100 بلوك بالدفعة)...`);
        
        const filter = contract.filters.PoolEvent();
        const now = Math.floor(Date.now() / 1000);

        for (let i = startBlock; i < currentBlock; i += batchSize) {
            let toBlock = i + batchSize - 1;
            if (toBlock > currentBlock) toBlock = currentBlock;

            try {
                const events = await contract.queryFilter(filter, i, toBlock);
                for (const event of events) {
                    const { id, itemType } = event.args;
                    const invId = id.toString();

                    if (itemType === "INVESTMENT_CREATED") {
                        const invData = await contract.investments(invId);
                        if (!invData.processed && !invData.earlyWithdrawn) {
                            const startTime = Number(invData.startTime);
                            const duration = Number(invData.duration);
                            const expiryTime = startTime + duration;

                            if (expiryTime > now) {
                                activeInvestments.set(invId, expiryTime);
                            } else {
                                activeInvestments.set(invId, now);
                            }
                        }
                    }
                }
            } catch (batchErr) {}
        }
        console.log(`[${new Date().toLocaleTimeString()}] تمت استعادة الاستثمارات النشطة بدقة. العدد بالذاكرة: ${activeInvestments.size}`);
    } catch (err) {
        console.log("ملاحظة أثناء جلب الأحداث:", err.message);
    }
}

async function startBot() {
    await fetchPastEventsSafely();

    contract.on("PoolEvent", async (id, itemType, user, amount, success) => {
        try {
            const invId = id.toString();

            if (itemType === "INVESTMENT_CREATED") {
                const invData = await contract.investments(invId);
                const startTime = Number(invData.startTime);
                const duration = Number(invData.duration);
                const expiryTime = startTime + duration;

                activeInvestments.set(invId, expiryTime);
                console.log(`[${new Date().toLocaleTimeString()}] استثمار جديد #${invId} تم تسجيله بدقة (ينتهي في: ${new Date(expiryTime * 1000).toLocaleString()}).`);
            
            } else if (itemType === "EARLY_WITHDRAWAL" || itemType === "INVESTMENT_MATURED") {
                if (activeInvestments.has(invId)) {
                    activeInvestments.delete(invId);
                    console.log(`[${new Date().toLocaleTimeString()}] تم إزالة الاستثمار #${invId} من الذاكرة (انتهى أو تم سحبه).`);
                }
            }
        } catch (err) {
            console.error("خطأ في معالجة الحدث اللحظي:", err.message);
        }
    });

    console.log(`[${new Date().toLocaleTimeString()}] البوت يستمع الآن للأحداث المباشرة ويعمل بكفاءة تامة...`);
}

startBot();
