const { ethers } = require("ethers");

const CONTRACT_ADDRESS = "0x9B3F6B83B07E5B313D960D47938800f0BCce206D";

// الـ ABI المطلوب لقراءة تفاصيل الاستثمار، استدعاء الـ pool، والاصغاء للأحداث
const CONTRACT_ABI = [
    "function pool() external",
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

// خريطة بالذاكرة (RAM) لحفظ أوقات انتهاء الاستثمارات بدقة: { invId: expiryTimestamp }
const activeInvestments = new Map();

console.log("=========================================");
console.log(" تم تشغيل بوت PeetX الآلي (فوق الطلقة - فحص كل ثانية) بنجاح!");
console.log(" عنوان المحفظة المشغلة: " + wallet.address);
console.log("=========================================");

// دالة لتنفيذ الـ pool العامة عندما ينضج أي استثمار
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

// فحص دوري فائق السرعة في الذاكرة كل ثانية واحدة (1000ms) لضمان السرعة المطلقة
setInterval(() => {
    const now = Math.floor(Date.now() / 1000);
    let needToRunPool = false;

    for (let [invId, expiryTime] of activeInvestments.entries()) {
        if (now >= expiryTime) {
            needToRunPool = true;
            // نحذف الاستثمار من الذاكرة حتى لا يتكرر الفحص إله
            activeInvestments.delete(invId);
        }
    }

    if (needToRunPool) {
        triggerPool();
    }
}, 1000);

// دالة الاصغاء للأحداث وجلب الاستثمارات بدقة تامة
async function startEventListener() {
    
    // 1. عند تشغيل البوت، نقوم بمسح آخر البلوكات للتأكد من عدم تفويت أي استثمار نشط
    try {
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = currentBlock > 10000 ? currentBlock - 10000 : 0;
        
        console.log(`[${new Date().toLocaleTimeString()}] جاري فحص الاستثمارات السابقة لضمان عدم ضياع أي صفقة...`);
        const filter = contract.filters.PoolEvent();
        const events = await contract.queryFilter(filter, fromBlock, currentBlock);
        
        const now = Math.floor(Date.now() / 1000);

        for (const event of events) {
            const { id, itemType } = event.args;
            const invId = id.toString();

            if (itemType === "INVESTMENT_CREATED") {
                try {
                    // نسحب تفاصيل الاستثمار مباشرة من العقد (المدة، وقت البدء، الحالة)
                    const invData = await contract.investments(invId);
                    const isProcessed = invData.processed;
                    const isEarlyWithdrawn = invData.earlyWithdrawn;
                    
                    if (!isProcessed && !isEarlyWithdrawn) {
                        const startTime = Number(invData.startTime);
                        const duration = Number(invData.duration);
                        const expiryTime = startTime + duration;

                        if (expiryTime > now) {
                            activeInvestments.set(invId, expiryTime);
                        } else {
                            activeInvestments.set(invId, now); 
                        }
                    }
                } catch (e) {
                    // تجاهل أي خطأ فردي والانتقال للذي يليه
                }
            }
        }
        console.log(`[${new Date().toLocaleTimeString()}] تمت استعادة الاستثمارات النشطة بنجاح. عددها في الذاكرة حالياً: ${activeInvestments.size}`);
    } catch (err) {
        console.log("ملاحظة أثناء استرجاع الأحداث السابقة:", err.message);
    }

    // 2. الاستماع اللحظي والمباشر للأحداث الجديدة (Live Events)
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

    console.log(`[${new Date().toLocaleTimeString()}] البوت يستمع الآن للأحداث ويعمل بكفاءة تامة وسرعة فائقة...`);
}

startEventListener();
