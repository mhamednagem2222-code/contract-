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

const provider = new ethers.JsonRpcProvider("https://bsc-dataseed.binance.org/");
const wallet = new ethers.Wallet(privateKey, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

const activeInvestments = new Map();

// 1. فتح سيرفر ويب وهمي للحفاظ على استمرار البوت 24/7
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('PeetX Bot is running successfully!\n');
}).listen(PORT, () => {
    console.log(`سيرفر الحماية شغال على البورت ${PORT} حتى يبقى البوت مستمر 24/7.`);
});

console.log("=========================================");
console.log(" تم تشغيل بوت PeetX الآلي (النسخة النهائية الفائقة) بنجاح!");
console.log(" عنوان المحفظة المشغلة: " + wallet.address);
console.log("=========================================");

async function triggerPool() {
    try {
        console.log(`[${new Date().toLocaleTimeString()}] وُجد استثمار مستحق الوقت أو تفعيل مطلوب! جاري استدعاء وتوقيع دالة pool...`);
        const tx = await contract.pool();
        console.log("تم إرسال المعاملة بنجاح. الهاش: " + tx.hash);

        const receipt = await tx.wait();
        console.log("تم تأكيد المعاملة في البلوك رقم: " + receipt.blockNumber);
    } catch (error) {
        console.error(`[${new Date().toLocaleTimeString()}] خطأ أثناء التنفيذ:`, error.reason || error.message);
    }
}

// دالة لجلب وفحص الاستثمارات تدريجياً ومعرفة المسحوب والمنتهي
async function fetchAndCheckInvestments() {
    try {
        const now = Math.floor(Date.now() / 1000);
        let totalInvestments = 0;
        try {
            totalInvestments = Number(await contract.invCursor());
        } catch (e) {
            totalInvestments = 200; // قيمة احتياطية
        }

        let startIdx = totalInvestments > 200 ? totalInvestments - 200 : 0;

        for (let i = startIdx; i < totalInvestments; i++) {
            try {
                const invData = await contract.investments(i);
                if (invData && invData.investor && invData.investor !== ethers.ZeroAddress) {
                    const invId = i.toString();
                    
                    // إذا كان مسحوباً مبكراً أو معالجاً مسبقاً، نتجاهله أو نحذفه من الذاكرة
                    if (invData.processed || invData.earlyWithdrawn) {
                        if (activeInvestments.has(invId)) {
                            activeInvestments.delete(invId);
                        }
                        continue;
                    }

                    const startTime = Number(invData.startTime);
                    const duration = Number(invData.duration);
                    const expiryTime = startTime + duration;

                    // إذا لم ينتهي وقته، نضيفه أو نحدثه ونعرف وقته المتبقي
                    if (expiryTime > now) {
                        activeInvestments.set(invId, expiryTime);
                    } else {
                        // إذا انتهى وقته، نضيفه ليتم تنفيذه فوراً
                        activeInvestments.set(invId, now);
                    }
                }
            } catch (err) {
                // تخطي المعرفات الفارغة
            }
        }
    } catch (err) {
        // تجاهل أخطاء الشبكة المؤقتة
    }
}

// 2. حلقة التتبع والعمل كل 2 ثانية بالضبط (فحص الذاكرة، جلب الكميات، وفحص Chainlink)
setInterval(async () => {
    // جلب وتحديث الاستثمارات والكميات كل دورتين أو مع كل فحص لتكون الأمور محدثة
    await fetchAndCheckInvestments();

    const now = Math.floor(Date.now() / 1000);
    let needToRunPool = false;

    // فحص الاستثمارات في الذاكرة وهل انتهى وقتها
    for (let [invId, expiryTime] of activeInvestments.entries()) {
        if (now >= expiryTime) {
            console.log(`[${new Date().toLocaleTimeString()}] الاستثمار #${invId} انتهى وقته وجاهز للتنفيذ!`);
            needToRunPool = true;
            activeInvestments.delete(invId); // إزالته حتى لا يتكرر بلا طائل
        }
    }

    // فحص دالة Chainlink كدعم إضافي
    try {
        const chainlinkStatus = await contract.Chainlink();
        if (chainlinkStatus === true) {
            console.log(`[${new Date().toLocaleTimeString()}] تنبيه Chainlink أصبح true!`);
            needToRunPool = true;
        }
    } catch (e) {}

    if (needToRunPool) {
        await triggerPool();
    }
}, 2000); // كل ثانيتين تماماً كما طلبت

async function startBot() {
    console.log(`[${new Date().toLocaleTimeString()}] جاري البدء وفحص الاستثمارات القديمة والنشطة...`);
    await fetchAndCheckInvestments();
    console.log(`[${new Date().toLocaleTimeString()}] تم تحميل الاستثمارات بنجاح. عددها في الذاكرة حالياً: ${activeInvestments.size}`);

    // 3. الاستماع الفوري للأحداث (للجديد أو للسحب المبكر)
    contract.on("PoolEvent", async (id, itemType, user, amount, success) => {
        try {
            const invId = id.toString();

            if (itemType === "INVESTMENT_CREATED") {
                const invData = await contract.investments(invId);
                const startTime = Number(invData.startTime);
                const duration = Number(invData.duration);
                const expiryTime = startTime + duration;

                activeInvestments.set(invId, expiryTime);
                console.log(`[${new Date().toLocaleTimeString()}] 🚀 استثمار جديد #${invId} تم تسجيله فوراً (ينتهي في: ${new Date(expiryTime * 1000).toLocaleString()}).`);
            
            } else if (itemType === "EARLY_WITHDRAWAL" || itemType === "INVESTMENT_MATURED") {
                if (activeInvestments.has(invId)) {
                    activeInvestments.delete(invId);
                    console.log(`[${new Date().toLocaleTimeString()}] 🗑️ تم إزالة الاستثمار #${invId} من الذاكرة لأنه تم سحبه أو إنهاؤه.`);
                }
            }
        } catch (err) {
            console.error("خطأ في معالجة الحدث اللحظي:", err.message);
        }
    });

    console.log(`[${new Date().toLocaleTimeString()}] البوت يعمل الآن ويراقب كل ثانيتين بكفاءة تامة...`);
}

startBot();
