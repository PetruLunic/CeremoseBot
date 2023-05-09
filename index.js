const puppeteer = require('puppeteer');
const TelegramBot = require('node-telegram-bot-api');
const credentials = require('./acc-credentials.json');
const chromeFinder = require('chrome-finder');
const chromePath = chromeFinder();

const token = '6290336367:AAE0jQ-tB6TYzS_Z4Q5qhFrEeO-aKBhwF0I';
const groupBot = new TelegramBot(token, { polling: true });

const username = credentials.username;
const password = credentials.password;

const rounds = {
    "1": 0,
    "2": 0,
    "3": 0,
    "4": 0,
    "5": 0,
    "6": 0,
    "7": 0
}

async function calcRounds(page){
    try {
        await page.waitForSelector('.tc.flex.bgpart.ptb20.ft14 .flex1.hidden-xs .pt15.ft22');
        const amount = await eval(`page.$eval('.tc.flex.bgpart.ptb20.ft14 .flex1.hidden-xs .pt15.ft22', val => parseFloat(val.innerText))`);

        rounds["1"] = amount * 0.005;
        rounds["2"] = amount * 0.012;
        rounds["3"] = amount * 0.026;
        rounds["4"] = amount * 0.055;
        rounds["5"] = amount * 0.118;
        rounds["6"] = amount * 0.25;
        rounds["7"] = amount * 0.533;
    }
    catch(err){
        console.log("Error at calcRounds occurred: " + err);
    }
}


function matchMessage(msg){
    const KEYWORDS = ["Trade Type", "Trading variety", "BTC/USDT", "Trade amount", "Trading Time", "Attention, everybody!"];

    for(word of KEYWORDS){
        if (!msg.includes(word)) return false;
    }

    return true;
}

function getDirection(msg){
    if (msg.includes("Buy Up")){
        return "Buy Up";
    }
    else if (msg.includes("Buy Down")){
        return "Buy Down";
    }
}

function getTime(msg){
    const regex = /Trading Time：(\d+：\d+：\d+)/;
    const match = msg.match(regex);

    if (match) {
        const timeString = match[1];
        const [hours, minutes, seconds] = timeString.split('：');

        const dateTime = new Date();
        dateTime.setHours(parseInt(hours) + 2);
        dateTime.setMinutes(minutes);
        dateTime.setSeconds(seconds);

        return dateTime;
    } else {
        console.log("No matching time found in the text.");
    }
}

function getRound(msg){
    const regex = /\d/; // Caută prima cifră din text

    const match = msg.match(regex);
    const firstDigit = match ? match[0] : null;

    return firstDigit;
}

async function login(username, password, page){
    try{
        await page.goto("https://www.ceremose.com/#/login?page=%2Flogin");

        await page.waitForSelector('[placeholder="Please enter your email"]');

        await page.type('[placeholder="Please enter your email"]', username);
        await page.type('[placeholder="Please enter a password"]', password);

        await Promise.all([
            page.click(".mt40.bgblue.white.tc.h48.lh48.radius2.pointer.ft20"),
            page.waitForNavigation()
        ]);

        await page.waitForSelector('.block.w100.h100.swiperhover.bgheader');

    }
    catch(err){
        console.log("Error at logging in occured: " + err);
        await page.waitForTimeout(3000);
        await login(username, password, page);
    }
}

async function preparePage(page){
    try{
        await page.goto("https://www.ceremose.com/#/second");

        await page.waitForSelector(".flex.alcenter.between.bgpart.bdbe9 .flex.alcenter");
        await page.click(".flex.alcenter.between.bgpart.bdbe9 .flex.alcenter p:nth-child(2)");
        await page.waitForTimeout(2000);
    }
    catch(err){
        console.log("Error at preparing page occured: " + err);
        await page.waitForTimeout(3000);
        preparePage(page);
    }
}

async function doBet(page, amount, direction){
    try {
        // clear the input
        await eval(`page.evaluate(() => {
            const input = document.querySelector('.el-input.el-input--suffix input.el-input__inner[type="number"]');
            input.value = '';
        })`);

        await page.type('.el-input.el-input--suffix input.el-input__inner[type="number"]', amount.toString());

        await page.waitForTimeout(400);
        await page.click('.mt30.bgpart .flex.bgheader.ht50.lh50.baselight2.tc.ft14');
        await page.waitForTimeout(400);

        if (direction === "Buy Up") {
            await page.click('.flex1.bggreen.tc.ptb10.ft16.white.radius40.flex.alcenter.jscenter.pointer.mb_btn.mr20');
        } else if (direction === "Buy Down") {
            await page.click('.flex1.bgred.tc.ptb10.ft16.white.radius40.flex.alcenter.jscenter.pointer.mb_btn');
        } else {
            console.log("Did not bet. Invalid direction.");
        }
    }
    catch(err){
        console.log("Error while doing bet occurred: " + err);
    }
}

async function main(){
    try {
        const browser = await puppeteer.launch({headless: false,
        executablePath: chromePath});

        let page = await browser.newPage();
        await page.setViewport({width: 1566, height: 728});

        await login(username, password, page);
        await preparePage(page);

        await calcRounds(page);

        groupBot.onText(/(.+)/, (msg) => {
            try {
                console.log(`Received message: ${msg.text}`);

                if (!matchMessage(msg.text)) return;

                let direction = getDirection(msg.text);
                let time = getTime(msg.text);
                let round = getRound(msg.text);

                if (round == 1) {
                    calcRounds(page);
                }

                if (time < new Date()) {
                    console.log("The date-time object is older than the current time.");
                    return;
                }

                const intervalId = setInterval(checkTime, 500);

                function checkTime() {
                    let timeNow = new Date();

                    timeNow.setSeconds(timeNow.getSeconds() + 3);

                    console.log("time now: " + timeNow);
                    console.log("bet time: " + time);

                    if (timeNow >= time) {
                        console.log("It's time");
                        console.log(rounds);
                        doBet(page, rounds[round], direction);
                        clearInterval(intervalId);
                    }
                    console.log("It's not time");
                }
            } catch (err) {
                console.log("Error at receiving message from telegram: " + err);
            }
        });
    }
    catch(err){
        console.log("Error while launching browser occurred: " + err);
    }
}

main();

