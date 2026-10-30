const { Telegraf } = require('telegraf');
const { ethers } = require('ethers');
const express = require('express');

// --- سيرفر وهمي لمنع الاستضافة من النوم ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('PeetX Telegram Bot is active and running 24/7!');
});

app.listen(PORT, () => {
    console.log(`Keep-alive web server is running on port ${PORT}`);
});

// --- إعدادات البوت والقناة والعقد ---
const BOT_TOKEN = '9019514193:AAE0TOz0X-9PrAirWyw218U7RjPm0Tqaqdk';
const CHANNEL_ID = '@PeetX_Transactions';
const CONTRACT_ADDRESS = '0x9B3F6B83B07E5B313D960D47938800f0BCce206D';

const BSC_RPCS = [
    'https://rpc.ankr.com/bsc',
    'https://bsc-dataseed1.binance.org/',
    'https://bsc-dataseed2.binance.org/',
    'https://bsc-dataseed3.binance.org/',
    'https://1rpc.io/bnb'
];

let rpcIndex = 0;
let provider;
let contract;

const CONTRACT_ABI = [
    {
        "anonymous": false,
        "inputs": [
            {"indexed": true, "internalType": "uint256", "name": "id", "type": "uint256"},
            {"indexed": false, "internalType": "string", "name": "itemType", "type": "string"},
            {"indexed": true, "internalType": "address", "name": "user", "type": "address"},
            {"indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256"},
            {"indexed": false, "internalType": "bool", "name": "success", "type": "bool"}
        ],
        "name": "PoolEvent",
        "type": "event"
    }
];

const bot = new Telegraf(BOT_TOKEN);

function getNextProvider() {
    const rpcUrl = BSC_RPCS[rpcIndex];
    rpcIndex = (rpcIndex + 1) % BSC_RPCS.length;
    console.log(`Connecting to RPC: ${rpcUrl}`);
    return new ethers.providers.JsonRpcProvider(rpcUrl);
}

function formatAddress(address) {
    if (!address) return 'N/A';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

async function sendToTelegram(txData) {
    const formattedAmount = ethers.utils.formatUnits(txData.amount || 0, 18);
    
    let icon = '🔹';
    let actionTitle = txData.itemType || 'Smart Contract Action';
    
    const lowerType = actionTitle.toLowerCase();
    if (lowerType.includes('deposit') || lowerType.includes('invest')) {
        icon = '📥';
        actionTitle = 'New Investment / Deposit';
    } else if (lowerType.includes('claim') || lowerType.includes('payout')) {
        icon = '📤';
        actionTitle = 'Instant Payout / Earnings';
    } else if (lowerType.includes('referral')) {
        icon = '🤝';
        actionTitle = 'Referral Reward';
    } else if (lowerType.includes('early')) {
        icon = '⚡';
        actionTitle = 'Early Withdrawal';
    }

    const message = `
${icon} **PeetX Live Transaction**

📌 **Type:** ${actionTitle}
💰 **Amount:** \`${parseFloat(formattedAmount).toLocaleString()} USDT\`
👤 **Wallet:** \`${formatAddress(txData.user)}\`
🆔 **Tx ID:** \`#${txData.id.toString()}\`
⚡ **Status:** ${txData.success ? '✅ Success' : '❌ Failed'}

🔍 **On-Chain Verification:**
[View Transaction on BscScan](https://bscscan.com/address/${CONTRACT_ADDRESS})

*PeetX | Live Transactions ⚡*
    `.trim();

    try {
        await bot.telegram.sendMessage(CHANNEL_ID, message, { 
            parse_mode: 'Markdown',
            disable_web_page_preview: true 
        });
        console.log(`[Notification Sent] ID: ${txData.id} - Type: ${actionTitle}`);
    } catch (error) {
        console.error('Error sending Telegram notification:', error.message);
    }
}

async function checkRecentPastEvents() {
    try {
        const currentBlock = await provider.getBlockNumber();
        // BSC تنتج بلوك تقريباً كل 3 ثوانٍ. 10 دقائق = تقريباً 200 بلوك للوراء
        const fromBlock = Math.max(0, currentBlock - 200);
        
        console.log(`Checking past events from block ${fromBlock} to ${currentBlock}...`);
        
        const filter = contract.filters.PoolEvent();
        const events = await contract.queryFilter(filter, fromBlock, currentBlock);
        
        const currentTime = Math.floor(Date.now() / 1000);
        
        for (const event of events) {
            const block = await event.getBlock();
            const eventTime = block.timestamp;
            const diffMinutes = (currentTime - eventTime) / 60;
            
            // إذا كان الحدث لم يمر عليه أكثر من 10 دقائق
            if (diffMinutes <= 10) {
                const [id, itemType, user, amount, success] = event.args;
                console.log(`Found recent past event within 10 mins: ID ${id.toString()}`);
                await sendToTelegram({
                    id,
                    itemType,
                    user,
                    amount,
                    success,
                    txHash: event.transactionHash
                });
            }
        }
    } catch (err) {
        console.error('Error checking past events:', err.message);
    }
}

function startEventListener() {
    try {
        provider = getNextProvider();
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

        console.log(`[Connected Successfully] Initializing checks and listening...`);

        // فحص الأحداث السابقة خلال آخر 10 دقائق عند التشغيل
        checkRecentPastEvents();

        // الاستماع المباشر للأحداث الجديدة فوراً
        contract.on("PoolEvent", async (id, itemType, user, amount, success, event) => {
            console.log(`[Live Event Captured!] ID: ${id.toString()}, Type: ${itemType}`);
            await sendToTelegram({
                id,
                itemType,
                user,
                amount,
                success,
                txHash: event.transactionHash
            });
        });

        provider.on("error", (error) => {
            console.warn('Provider warning/error, rotating RPC...', error.message);
            reconnect();
        });

    } catch (err) {
        console.error('Initialization error, switching RPC...', err.message);
        reconnect();
    }
}

function reconnect() {
    if (contract && contract.removeAllListeners) {
        try { contract.removeAllListeners(); } catch (e) {}
    }
    setTimeout(startEventListener, 4000);
}

// تشغيل البوت وإرسال رسالة التأكيد الإنجليزية الفورية للقناة
bot.launch().then(async () => {
    console.log('🤖 PeetX Bot is 100% active and running!');
    try {
        await bot.telegram.sendMessage(CHANNEL_ID, 
            "🤖 **PeetX Bot Initialized & Online!**\n\n" +
            "✅ System is successfully running 24/7.\n" +
            "🔍 Actively monitoring contract investments, withdrawals, and pool events in real-time. 🚀", 
            { parse_mode: 'Markdown' }
        );
        console.log('Startup startup confirmation message sent to Telegram channel successfully.');
    } catch (e) {
        console.log('Could not send startup message (Make sure bot is admin in channel):', e.message);
    }
}).catch(err => {
    console.error('Failed to launch bot:', err);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

startEventListener();
