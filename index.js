const puppeteer = require('puppeteer');
const TelegramBot = require('node-telegram-bot-api');
const chromeFinder = require('chrome-finder');
const {getTimezoneOffset} = require('date-fns-tz');
const path = require('path');
const fs = require('fs');

const credentialsPath = path.join('acc-credentials.json');
const chromePath = chromeFinder();

const token = getCredentials('token');
const bot = new TelegramBot(token, { polling: true });

const telegramUserId = getCredentials('telegramID');

const botRegex = /(.+)/;
const roundRegex = /^\/round (.+)/;

const rounds = {
    "1": 0,
    "2": 0,
    "3": 0,
    "4": 0,
    "5": 0,
    "6": 0,
    "7": 0
}

async function calcStrategy(page){
    try {
        let amount = await getStrategyAmount(page);

        rounds["1"] = parseFloat((amount * 0.005).toFixed(3));
        rounds["2"] = parseFloat((amount * 0.012).toFixed(3));
        rounds["3"] = parseFloat((amount * 0.026).toFixed(3));
        rounds["4"] = parseFloat((amount * 0.055).toFixed(3));
        rounds["5"] = parseFloat((amount * 0.118).toFixed(3));
        rounds["6"] = parseFloat((amount * 0.25).toFixed(3));
        rounds["7"] = parseFloat((amount * 0.534).toFixed(3));
    }
    catch(err){
        console.log("Error at calcStrategy occurred: " + err);
    }
}

function getLondonTime(){
    // Create a new Date object using the current date and time in UTC
    const currentDate = new Date();

// Get the time zone offset of the current location in minutes
    const localTimeOffset = -currentDate.getTimezoneOffset()/60;
    const londonTimeOffset = getTimezoneOffset("Europe/London", new Date())/(1000*60*60);

    console.log(`Local time offset: ${localTimeOffset}`);
    console.log(`London time offset: ${londonTimeOffset}`)

    currentDate.setHours(currentDate.getHours() - (localTimeOffset - londonTimeOffset));

    return currentDate;
}

function toLocalTime(londonTime){
    const localTimeOffset = new Date().getTimezoneOffset()/60;
    const londonTimeOffset = getTimezoneOffset("Europe/London", new Date())/(1000*60*60);

    londonTime.setHours(londonTime.getHours() - localTimeOffset - londonTimeOffset);

    return londonTime;
}

async function getStrategyAmount(page){
    let amount = getCredentials('strategy');

    if (typeof amount !== "number" || isNaN(amount) || amount < 20){
        amount = Math.floor(await getAccMoney(page));
    }

    return amount;
}

async function getAccMoney(page){
    try{
        await page.waitForSelector('.tc.flex.bgpart.ptb20.ft14 .flex1.hidden-xs .pt15.ft22');
        return await eval(`page.$eval('.tc.flex.bgpart.ptb20.ft14 .flex1.hidden-xs .pt15.ft22', val => parseFloat(val.innerText))`);
    }
    catch(err){
        console.log("Error while getting account money occurred: " + err);
        await page.waitForTimeout(3000);
        await getAccMoney(page);
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

        const londonTime = getLondonTime();
        londonTime.setHours(hours);
        londonTime.setMinutes(minutes);
        londonTime.setSeconds(seconds);

        return toLocalTime(londonTime);
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

async function login(page){
    let username = getCredentials('username');
    let password = getCredentials('password');

    try{
        await page.goto("https://www.ceremose.com/#/login?page=%2Flogin");

        await page.waitForSelector('[placeholder="Please enter your email"]');

        await clearInput(page, '[placeholder="Please enter your email"]');
        await clearInput(page, '[placeholder="Please enter a password"]');

        await page.type('[placeholder="Please enter your email"]', username);
        await page.type('[placeholder="Please enter a password"]', password);

        await Promise.all([
            page.click(".mt40.bgblue.white.tc.h48.lh48.radius2.pointer.ft20"),
            page.waitForNavigation({timeout: 10000})
        ]);

        await page.waitForSelector('.block.w100.h100.swiperhover.bgheader', {timeout: 10000});

    }
    catch(err){
        console.log("Error at logging in occurred: " + err);
        await page.waitForTimeout(3000);

        await login(page);
    }
}

async function preparePage(page){
    try{
        await page.goto("https://www.ceremose.com/#/second");

        await page.waitForSelector(".flex.alcenter.between.bgpart.bdbe9 .flex.alcenter", {timeout: 5000});
        await page.click(".flex.alcenter.between.bgpart.bdbe9 .flex.alcenter p:nth-child(2)");
        await page.waitForTimeout(2000);
    }
    catch(err){
        console.log("Error at preparing page occurred: " + err);
        await page.waitForTimeout(3000);
        await preparePage(page);
    }
}

async function clearInput(page, selector){
    try{
        await eval(`(async () => {
            await page.evaluate((selector) => {
                const input = document.querySelector(selector);
                input.value = '';
            }, '${selector}');
        })()`);
    }
    catch(err){
        console.log(`Error occurred while clearing the input ${selector}: ${err}` );
        await page.waitForTimeout(2000);
        await clearInput(page,selector);
    }
}

async function doBet(page, amount, direction){
    try {
        // clear the input
        await clearInput(page, '.el-input.el-input--suffix input.el-input__inner[type="number"]');

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

let isTradingStarted = false;

async function startTrading(){
    try {
        isTradingStarted = true;
        console.log("Started Bot");
        bot.sendMessage(telegramUserId, `Bot for account <b>${getCredentials('username')}</b> has started.`, { parse_mode: 'HTML' });
        clearInterval(timer);

        const timeLimit = 40 * 60 * 1000;
        const clockRate = 60 * 1000;
        let startTime = new Date();

        const botInterval = setInterval(botCheckTime, clockRate);

        function botCheckTime(){
            let timeNow = new Date();

            if (timeNow - startTime > timeLimit){
                console.log("Stopping the bot");
                stopBot();
                timer = setInterval(startTradingCheckTime, clockInterval);
            }
            else{
                console.log(`${((timeLimit - (timeNow - startTime)) / 60000).toFixed(2)} minutes left to close the bot.`);
            }
        }


        function stopBot(){
            isTradingStarted = false;
            browser.close();
            bot.removeTextListener(botRegex);
            bot.removeTextListener(stopTradingRegex);
            bot.removeTextListener(roundRegex);
            bot.sendMessage(telegramUserId, `Trading day ended with <b>${endRoundMoney} USDT</b> and a cumulative profit of <b>${endRoundMoney-startDayMoney} USDT</b>`, { parse_mode: 'HTML' });
            clearInterval(botInterval);
            clearInterval(checkTimeInterval);
        }

        const browser = await puppeteer.launch({headless: false,
        executablePath: chromePath});

        let page = await browser.newPage();
        await page.setViewport({width: 1566, height: 728});

        await login(page);
        await preparePage(page);

        await calcStrategy(page);

        const startDayMoney = await getAccMoney(page);
        let startRoundMoney;
        let endRoundMoney;

        let checkTimeInterval;

        const stopTradingRegex = /^\/stop/;

        bot.onText(stopTradingRegex, msg => {
            const chatID = msg.chat.id;

            if (chatID != telegramUserId && chatID != getCredentials('forwardId')){
                return bot.sendMessage(chatID, "You don't have access to this bot.");
            }

            stopBot();
            timer = setInterval(startTradingCheckTime, clockInterval);

            bot.sendMessage(chatID, `Trading stopped`);
        });

        bot.sendMessage(telegramUserId, `Logged in successfuly. Trading day started with <b>${startDayMoney} USDT</b> and strategy amount of <b>${await getStrategyAmount(page)} USDT</b>.`, { parse_mode: 'HTML' });

        function checkMessage(msg){
            try {
                console.log(`Received message: ${msg.text}`);

                if (msg.chat.id != getCredentials('forwardId') && msg.chat.id != telegramUserId){
                    console.log("The message was not sent by the right person.");
                    console.log("Message.from.id: " + msg.from.id);
                    return;
                }

                if (!matchMessage(msg.text)) return;

                let direction = getDirection(msg.text);
                let time = getTime(msg.text);
                let round = getRound(msg.text);

                if (time < new Date()) {
                    console.log("The date-time object is older than the current time.");
                    return;
                }

                if (((time - new Date()) / 60000) > 10){
                    console.log("The bet time is more than 10 minutes in the future.");
                    return;
                }

                if (round == 1) {
                    getAccMoney(page).then(money => {
                        startRoundMoney = money;
                    });
                }

                bot.onText(roundRegex, (msg, match) => {
                    const chatID = msg.chat.id;

                    if (chatID != telegramUserId && chatID != getCredentials('forwardId')){
                        return bot.sendMessage(chatID, "You don't have access to this bot.");
                    }

                    const value = match[1];

                    if (value < 1 || value > 7){
                        return bot.sendMessage(chatID, "Round should be between 1 and 7");
                    }

                    bot.sendMessage(chatID, `You changed trading round ${round} to ${value}.`);

                    round = value;
                });

                // restarting startTime
                startTime = new Date();

                bot.sendMessage(telegramUserId, `Trade round <b>${round}</b> is at: <b>${time.getHours()}:${time.getMinutes()}:${time.getSeconds()}</b>`, { parse_mode: 'HTML' });

                checkTimeInterval = setInterval(checkTime, 500);

                function checkTime() {
                    let timeNow = new Date();

                    timeNow.setSeconds(timeNow.getSeconds() + 3 + parseInt(getCredentials('adjustTime'))/1000);

                    console.log("time now: " + timeNow);
                    console.log("bet time: " + time);

                    if (timeNow >= time) {
                        console.log("It's time");
                        console.log(rounds);
                        doBet(page, rounds[round], direction);

                        bot.removeTextListener(roundRegex);

                        setTimeout(() => {
                            if (page.isClosed()) return;
                            getAccMoney(page).then(money => {
                                endRoundMoney = money;
                                bot.sendMessage(telegramUserId, `Round <b>${round}</b> ended with <b>${endRoundMoney} USDT</b> and a profit of <b>${endRoundMoney - startRoundMoney} USDT </b>`, { parse_mode: 'HTML' })
                            });
                        }, 2.5 * 60 * 1000)
                        clearInterval(checkTimeInterval);
                    }
                    else{
                        console.log("It's not time");
                    }
                }
            } catch (err) {
                console.log("Error at receiving message from telegram: " + err);
            }
        }

        bot.onText(botRegex, checkMessage);


    }
    catch(err){
        console.log("Error while launching browser occurred: " + err);
    }
}

const clockInterval = 5 * 60 * 1000;
let didTradingToday = false;

let todayDate = new Date().getDate();

let timer = setInterval(startTradingCheckTime, clockInterval);
startTradingCheckTime();

function startTradingCheckTime(){
    let timeNow = new Date();

    let startTimeDate = getLondonTime();
    console.log(`LondonTime: ${startTimeDate}`)

    startTimeDate.setHours(getCredentials('startTime').hour);
    startTimeDate.setMinutes(getCredentials('startTime').minute);

    startTimeDate = toLocalTime(startTimeDate);
    console.log(`Local time start: ${startTimeDate}`);
    console.log(`Local Time: ${timeNow}`)


    if (timeNow.getDate() !== todayDate && didTradingToday){
        console.log("todayDate: " + todayDate);
        console.log("timeNow.getDate(): " + timeNow.getDate());

        todayDate = timeNow.getDate();
        didTradingToday = false;
        console.log("Day changed");
    }

    if (didTradingToday){
        console.log("Today was already traiding");
        return;
    }

    // check if it is not Saturday and is after startTime
    if (timeNow >startTimeDate && new Date().getDay() !== 6){
        didTradingToday = true;
        startTrading();
    }
    else{
        console.log(`It's not time to start bot. Left ${(startTimeDate - timeNow)/3600000} hours`);
    }
}

bot.setMyCommands([
    {command: '/info', description: 'Get info about user'},
    {command: '/change', description: 'Change user\'s parameters'},
    {command: '/stop', description: 'Stop trading'},
    {command: '/run', description: 'Start trading'},
    {command: '/round', description: 'Change round number'}
]);

bot.onText(/^\/info/, async msg => {
    const chatID = msg.chat.id;

    if (chatID != telegramUserId && chatID != getCredentials('forwardId')){
        return bot.sendMessage(chatID, "You don't have access to this bot.");
    }

    bot.sendMessage(chatID,
        `<b>Your account username:</b> ${getCredentials('username')}
<b>Your account password:</b> ${getCredentials('password')}
<b>Starting time:</b> ${getCredentials('startTime').hour}:${getCredentials('startTime').minute} london time
<b>Strategy amount:</b> ${getCredentials('strategy')} USDT
<b>Adjust time:</b> ${getCredentials('adjustTime')} ms
        `, { parse_mode: 'HTML' });
});

function changeCredentials(parameter, newValue){
    let file = JSON.parse(fs.readFileSync(credentialsPath, "utf-8"));
    file[parameter] = newValue;

    fs.writeFileSync(credentialsPath, JSON.stringify(file, null, 2));
}

function getCredentials(parameter){
    return JSON.parse(fs.readFileSync(credentialsPath, "utf-8"))[parameter];
}

bot.onText(/^\/change(?:\s+(\S+)\s+(\S+))?/, (msg, match) => {
    const chatID = msg.chat.id;

    if (chatID != telegramUserId && chatID != getCredentials('forwardId')){
        return bot.sendMessage(chatID, "You don't have access to this bot.");
    }

    const parameter = match[1];
    const newValue = match[2];

    if (parameter === 'group'){
        changeCredentials('forwardId', newValue);

        return bot.sendMessage(chatID, `You changed successfully your groupID to ${newValue}. Make sure this is correct ID.`);
    }

    if (parameter === 'username'){
        changeCredentials('username', newValue);

        return bot.sendMessage(chatID, `You changed successfully your username to ${newValue}. Make sure this is an existing username.`);
    }
    else if(parameter === 'password'){
        changeCredentials('password', newValue);

        return bot.sendMessage(chatID, `You changed successfully your password to ${newValue}. Make sure this is an existing password.`);
    }
    else if (parameter === 'strategy'){
        if (newValue === 'remove'){
            changeCredentials('strategy', 0);

            return bot.sendMessage(chatID, `Your strategy was removed.`);
        }

        let amount = parseInt(newValue);

        if (typeof amount !== "number" || isNaN(amount) || amount < 20){
            return bot.sendMessage(chatID, "This command allows only numbers that are bigger than 20. /change strategy number");
        }

        changeCredentials('strategy', amount);

        return bot.sendMessage(chatID, `You changed your trading strategy to ${amount}. Make sure you have enough money in your balance for this strategy.`);
    }
    else if(parameter === 'startHour'){
        let number = parseInt(newValue);

        if (isNaN(number) || number < 0 || number > 23){
            return bot.sendMessage(chatID, `Hour should be a number in range of 0 - 23.`);
        }

        let startTime = getCredentials('startTime');

        startTime.hour = number;
        changeCredentials('startTime', startTime);

        return bot.sendMessage(chatID, `You changed your trading hour to ${number}. 
Now your trading start at ${getCredentials('startTime').hour}:${getCredentials('startTime').minute} london time`);
    }
    else if(parameter === 'startMinute'){
        let number = parseInt(newValue);

        if (isNaN(number) || number < 0 || number > 59){
            return bot.sendMessage(chatID, `Minute should be a number in range of 0 - 59.`);
        }

        let startTime = getCredentials('startTime');

        startTime.minute = number;
        changeCredentials('startTime', startTime);

        return bot.sendMessage(chatID, `You changed your trading minute to ${number}. 
Now your trading start at ${getCredentials('startTime').hour}:${getCredentials('startTime').minute} london time`);
    }
    else if(parameter === 'adjustTime'){
        let number = parseInt(newValue);

        if (!number){
            return bot.sendMessage(chatID, `Enter only numbers.`);
        }

        changeCredentials('adjustTime', number);

        return bot.sendMessage(chatID, `You changed adjust time to ${number} milliseconds`);
    }

    bot.sendMessage(chatID,
        `Available commands for /change:
    - /change strategy number
    - /change strategy remove
    - /change username newUsername
    - /change password newPassword
    - /change startMinute minute
    - /change startHour hour
    - /change adjustTime milliseconds
    - /change group groupID
`, { parse_mode: 'HTML' });
});

bot.onText(/^\/run/, msg => {
    const chatID = msg.chat.id;

    if (chatID != telegramUserId && chatID != getCredentials('forwardId')){
        return bot.sendMessage(chatID, "You don't have access to this bot.");
    }

    if (isTradingStarted){
        return bot.sendMessage(chatID, "The trading has already started");
    }

    startTrading();
});
