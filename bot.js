const { Telegraf } = require('telegraf');
const { ethers } = require('ethers');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('PeetX Telegram Bot is active and running 24/7!');
});

app.listen(PORT, () => {
    console.log(`[Keep-Alive Server] Running on port ${PORT}`);
});

const BOT_TOKEN = '9019514193:AAE0TOz0X-9PrAirWyw218U7RjPm0Tqaqdk';
const CHANNEL_ID = '@PeetX_Transactions';
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
    {"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"pool","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"invId","type":"uint256"}],"name":"settleInvestment","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"investments","outputs":[{"internalType":"uint256","name":"id","type":"uint256"},{"internalType":"address","name":"investor","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"uint256","name":"planId","type":"uint256"},{"internalType":"uint256","name":"profitPercent","type":"uint256"},{"internalType":"uint256","name":"startTime","type":"uint256"},{"internalType":"uint256","name":"duration","type":"uint256"},{"internalType":"uint256","name":"totalGenPaid","type":"uint256"},{"internalType":"bool","name":"processed","type":"bool"},{"internalType":"bool","name":"earlyWithdrawn","type":"bool"}],"stateMutability":"view","type":"function"}
];

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
const bscNetwork = ethers.Network.from(56);
let provider = new ethers.JsonRpcProvider(rpcUrls[rpcIndex], bscNetwork, { staticNetwork: bscNetwork });
let contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

const bot = new Telegraf(BOT_TOKEN);
const recentEventsMap = new Map();

function getNextProvider() {
    rpcIndex = (rpcIndex + 1) % rpcUrls.length;
    provider = new ethers.JsonRpcProvider(rpcUrls[rpcIndex], bscNetwork, { staticNetwork: bscNetwork });
    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    return provider;
}

function formatAddress(address) {
    if (!address) return 'N/A';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

async function sendNotificationToTelegram(txData) {
    const eventId = txData.id.toString();
    const currentTime = Date.now();

    if (recentEventsMap.has(eventId)) {
        const lastTime = recentEventsMap.get(eventId);
        if (currentTime - lastTime < 60000) {
            return;
        }
    }

    recentEventsMap.set(eventId, currentTime);

    if (recentEventsMap.size > 100) {
        const oldestKey = recentEventsMap.keys().next().value;
        recentEventsMap.delete(oldestKey);
    }

    const formattedAmount = ethers.formatUnits(txData.amount || 0n, 18);
    
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0];
    const dateTimeFormatted = `${dateStr} | ${timeStr} UTC`;

    let icon = '🔹';
    let actionTitle = txData.itemType || 'Smart Contract Action';
    const lowerType = actionTitle.toLowerCase();
    
    if (lowerType.includes('invest')) {
        icon = '📥';
        actionTitle = 'invest';
    } else if (lowerType.includes('claimearnings') || lowerType.toLowerCase() === 'claimearnings') {
        icon = '📤';
        actionTitle = 'claimEarnings';
    } else if (lowerType.includes('claimliquidity') || lowerType.includes('liquidity') || lowerType.includes('early')) {
        icon = '⚡';
        actionTitle = 'claimLiquidity';
    } else if (lowerType.includes('settleinvestment') || lowerType.includes('settle')) {
        icon = '📤';
        actionTitle = 'claim';
    } else if (lowerType.includes('pool')) {
        icon = '📤';
        actionTitle = 'claim';
    }

    const message = `
${icon} **PeetX Live Transaction**

📌 **Type:** ${actionTitle}
💰 **Amount:** \`${parseFloat(formattedAmount).toLocaleString()} USDT\`
👤 **Wallet:** \`${formatAddress(txData.user)}\`
🆔 **Tx ID:** \`#${eventId}\`
⚡ **Status:** ${txData.success ? '✅ Success' : '❌ Failed'}
🕒 **Time:** \`${dateTimeFormatted}\`

🔍 **On-Chain Verification:**
[View on BscScan](https://bscscan.com/tx/${txData.txHash || CONTRACT_ADDRESS})

*PeetX | Live Transactions ⚡*
    `.trim();

    try {
        await bot.telegram.sendMessage(CHANNEL_ID, message, { 
            parse_mode: 'Markdown',
            disable_web_page_preview: true 
        });
    } catch (error) {
        console.error('[Telegram Error]', error.message);
    }
}

async function startEventListener() {
    try {
        contract.on("PoolEvent", async (id, itemType, user, amount, success, event) => {
            try {
                const txHash = event && event.log ? event.log.transactionHash : (event ? event.transactionHash : '');
                await sendNotificationToTelegram({ id, itemType, user, amount, success, txHash });
            } catch (err) {
                console.error("Error:", err.message);
            }
        });
    } catch (error) {
        getNextProvider();
        setTimeout(startEventListener, 3000);
    }
}

async function sendStartupMessage() {
    try {
        await bot.telegram.sendMessage(CHANNEL_ID, 
            "🤖 **PeetX Bot Initialized & Online!**\n\n" +
            "✅ System is successfully running 24/7.\n" +
            "🔍 Actively tracking smart contract pool events in real-time. 🚀", 
            { parse_mode: 'Markdown' }
        );
    } catch (e) {}
}

sendStartupMessage();
startEventListener();

process.on("unhandledRejection", () => {});
process.on("uncaughtException", () => {});
