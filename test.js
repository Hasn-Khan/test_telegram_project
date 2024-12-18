const TelegramBot = require('node-telegram-bot-api');
const { MongoClient } = require('mongodb');
const fetch = require('node-fetch');
const dotenv = require('dotenv');
dotenv.config();
const dbUri = process.env.MONGO_DB_URI;
const dbClient = new MongoClient(dbUri);
const database = 'telegramTest';
const collectionName = 'chat';
const teleToken = process.env.TELEGRAM_BOT_TOKEN;
const teleBot = new TelegramBot(teleToken, { polling: true });
let db, collection;

const mainJob = async () => {
    try {
        try {
            await dbClient.connect();
            db = dbClient.db(database);
            collection = db.collection(collectionName);
            console.log('DB connected');
        } catch (error) {
            console.error('Error connecting DB:', error);
        }
        teleBot.on('message', async (msg) => {
            try {
                await handleConversation(msg);
            } catch (error) {
                console.error('Error handling message:', error);
            }
        });
    } catch (error) {
        console.error('Error in mainJob:', error);
    }
};

const fetchChatGptResponse = async (userInput) => {
    try {
        const requestBody = {
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: userInput }
            ],
            max_tokens: 150
        };
        const fetchOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify(requestBody)
        };
        const apiResponse = await fetch('https://api.openai.com/v1/chat/completions', fetchOptions);
        const responseData = await apiResponse.json();
        if (responseData.choices && responseData.choices.length > 0) {
            return responseData.choices[0].message.content.trim();
        } else {
            console.error('Invalid response format:', responseData);
            return 'Please try again later.';
        }
    } catch (error) {
        return 'Sorry, something went wrong.';
    }
};

const handleConversation = async (msg) => {
    const chatId = msg.chat.id;
    const userMessage = msg.text;
    let user = await collection.findOne({ chatId });
    if (!user) {
      user = await setUser(chatId);
      await saveConversation(user);
    }

    if (!user.familySize) {
      user.familySize = userMessage;
      await teleBot.sendMessage(chatId, 'Thank you! Now, what is your household income?');
    } else if (!user.householdIncome) {
      user.householdIncome = userMessage;
      await teleBot.sendMessage(chatId, 'Got it! And finally, what is your gender?');
    } else if (!user.gender) {
      user.gender = userMessage;
      await teleBot.sendMessage(chatId, 'Let me check with our assistant.');
      const chatGptResponse = await fetchChatGptResponse(userMessage);
      await teleBot.sendMessage(chatId, chatGptResponse);
    } else {
      const chatGptResponse = await fetchChatGptResponse(userMessage);
      await teleBot.sendMessage(chatId, chatGptResponse);
    }

    user.conversation.push(userMessage);
    await saveConversation(user);
};

const setUser = async (chatId) => {
    let user = {
        chatId,
        familySize: null,
        householdIncome: null,
        gender: null,
        conversation: []
    };
    return user;
};

const saveConversation = async (user) => {
    try {
      const result = await collection.updateOne(
        { chatId: user.chatId },
        { $set: user },
        { upsert: true }
      );
      console.log('User data saved to MongoDB:', result);
    } catch (error) {
      console.error('Error saving user data:', error);
    }
};

mainJob();
