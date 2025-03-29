// Fiverr AI Chat Assistant - Background Service Worker

// Import the Google AI Gemini functions and functionality
// We're using a dynamic import since this is a service worker environment
let genAIInstance = null;

// Initialize the Google AI Gemini SDK
async function initGeminiAPI(apiKey) {
  try {
    // We need to dynamically load the Google Generative AI JS SDK
    // Since we can't use ES modules directly in a service worker, we'll create our own implementation
    return {
      generateContent: async (prompt, options = {}) => {
        const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent';
        const response = await fetch(`${url}?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: options.temperature || 0.7,
              maxOutputTokens: options.maxOutputTokens || 800,
              topP: options.topP || 0.95
            }
          })
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error?.message || `API request failed with status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
      }
    };
  } catch (error) {
    console.error('Fiverr AI Assistant: Failed to initialize Gemini API', error);
    throw error;
  }
}

// Listen for when the extension is installed or updated
chrome.runtime.onInstalled.addListener(function(details) {
  console.log('Fiverr AI Assistant: Extension installed/updated:', details.reason);
  
  if (details.reason === 'install') {
    // Set default settings on install
    chrome.storage.sync.set({
      apiKey: '',
      enableAI: true
    }, function() {
      console.log('Fiverr AI Assistant: Default settings initialized');
    });
    
    // Initialize empty chat history
    chrome.storage.local.set({
      chatHistory: []
    }, function() {
      console.log('Fiverr AI Assistant: Chat history initialized');
    });
    
    // Open options page on install
    chrome.tabs.create({
      url: 'popup/popup.html'
    });
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('Background script received message:', request);
  
  // Process a message with AI
  if (request.action === 'processWithAI') {
    const messageText = request.text;
    const contextMessages = request.context || '';
    
    if (!messageText) {
      console.error('Fiverr AI Assistant (Background): No message text provided for AI processing');
      sendResponse({ success: false, error: 'No message text provided' });
      return true;
    }
    
    // Get API key from settings
    chrome.storage.sync.get(['apiKey'], async function(result) {
      const apiKey = result.apiKey;
      
      if (!apiKey) {
        console.error('Fiverr AI Assistant (Background): No API key found in settings');
        sendResponse({ success: false, error: 'API key not found' });
        return;
      }
      
      console.log('Fiverr AI Assistant (Background): Processing message with AI');
      
      try {
        // Initialize the Google AI SDK
        genAIInstance = await initGeminiAPI(apiKey);
        
        // Format context string for simplified message
        let contextString = '';
        if (contextMessages) {
          contextString = `Client message: "${messageText}" with context:\n${contextMessages}`;
        } else {
          contextString = `Client message: "${messageText}"`;
        }
        
        // Construct the prompt for simplified message
        const simplifiedPrompt = `You are an expert assistant for a Fiverr freelancer. Your job is to analyze client messages and clearly explain what the client is saying and specifically what they want the freelancer to do. Focus on uncovering their core needs, expectations, and any actionable requests. Keep explanations clear, concise and practical. Consider the conversation context to provide accurate interpretation.

Analyze this client message and explain: 1) What they're saying, and 2) What they want me to do. Be concise but thorough:
${contextString}`;
        
        // Get simplified message from Gemini
        const simplifiedResponse = await genAIInstance.generateContent(simplifiedPrompt, { maxOutputTokens: 150 });
        
        if (!simplifiedResponse || !simplifiedResponse.candidates || simplifiedResponse.candidates.length === 0) {
          console.error('Fiverr AI Assistant (Background): Invalid response from Gemini API during simplification');
          sendResponse({ success: false, error: 'Failed to get a valid response from Gemini API' });
          return;
        }
        
        const simplifiedMessage = simplifiedResponse.candidates[0].content.parts[0].text.trim();
        
        // Construct the prompt for reply options
        const replyPrompt = `You are a helpful assistant for a Fiverr freelancer. Generate 3 different professional reply options to the client's message. Each reply should be casual, friendly, and impactful. Keep responses concise (2-4 sentences max) but make them effective and warm. Separate the options with |||. Consider the conversation context when crafting responses.

Generate 3 different casual and friendly reply options for this conversation context. Make them short but impactful:
${contextString}`;
        
        // Get reply options from Gemini
        const replyResponse = await genAIInstance.generateContent(replyPrompt, { maxOutputTokens: 500 });
        
        if (!replyResponse || !replyResponse.candidates || replyResponse.candidates.length === 0) {
          console.error('Fiverr AI Assistant (Background): Invalid response from Gemini API during reply generation');
          sendResponse({ success: false, error: 'Failed to get a valid response from Gemini API' });
          return;
        }
        
        const replyText = replyResponse.candidates[0].content.parts[0].text.trim();
        
        // Split the response into separate reply options
        let replyOptions = replyText.split('|||').map(reply => reply.trim());
        
        // Make sure we have at least one valid reply
        if (replyOptions.length === 0 || (replyOptions.length === 1 && replyOptions[0] === '')) {
          replyOptions = ['I apologize, but I was unable to generate reply suggestions.'];
        }
        
        // Return both the simplified message and reply options
        sendResponse({
          success: true,
          data: {
            simplifiedMessage: simplifiedMessage,
            replyOptions: replyOptions
          }
        });
      } catch (error) {
        console.error('Fiverr AI Assistant (Background): Error processing with Gemini:', error);
        sendResponse({ success: false, error: error.message });
      }
    });
    
    return true; // Indicates we'll send a response asynchronously
  }
  
  // Message listeners for different actions
  else if (request.action === 'openChatHistory') {
    // Open chat history page in a new tab
    chrome.tabs.create({
      url: chrome.runtime.getURL('pages/chat-history.html')
    });
  }
  
  // Always return true for async response
  return true;
});

// Function to process text with Gemini API
async function processWithAI(text, recentMessages = []) {
  // Get API key from storage
  const result = await chrome.storage.sync.get(['apiKey']);
  const apiKey = result.apiKey;
  
  if (!apiKey) {
    console.error('Fiverr AI Assistant: API key not set');
    throw new Error('API key not set. Please add your Google Gemini API key in the extension settings.');
  }
  
  try {
    // Initialize the Google AI SDK if not already initialized
    if (!genAIInstance) {
      genAIInstance = await initGeminiAPI(apiKey);
    }
    
    console.log('Fiverr AI Assistant: Getting simplified message');
    // Get simplified message
    const simplifiedMessage = await getSimplifiedMessage(text, apiKey, recentMessages);
    
    console.log('Fiverr AI Assistant: Getting reply options');
    // Get reply options with conversation context
    const replyOptions = await getReplyOptions(text, apiKey, recentMessages);
    
    return {
      simplifiedMessage,
      replyOptions
    };
  } catch (error) {
    console.error('Fiverr AI Assistant: API Error:', error);
    throw error;
  }
}

// Get simplified version of message
async function getSimplifiedMessage(text, apiKey, recentMessages = []) {
  try {
    // Initialize the Google AI SDK if not already initialized
    if (!genAIInstance) {
      genAIInstance = await initGeminiAPI(apiKey);
    }
    
    // Format recent messages for context
    let contextString = '';
    if (recentMessages.length > 0) {
      contextString = 'Recent conversation:\n' + 
        recentMessages.map(msg => `${msg.sender}: ${msg.content}`).join('\n') + 
        '\n\nClient\'s latest message: "' + text + '"';
    } else {
      contextString = `Client message: "${text}"`;
    }
    
    // Construct the prompt for simplified message
    const simplifiedPrompt = `You are an expert assistant for a Fiverr freelancer. Your job is to analyze client messages and clearly explain what the client is saying and specifically what they want the freelancer to do. Focus on uncovering their core needs, expectations, and any actionable requests. Keep explanations clear, concise and practical. Consider the conversation context to provide accurate interpretation.

Analyze this client message and explain: 1) What they're saying, and 2) What they want me to do. Be concise but thorough:
${contextString}`;
    
    // Get simplified message from Gemini
    const simplifiedResponse = await genAIInstance.generateContent(simplifiedPrompt, { maxOutputTokens: 150 });
    
    if (!simplifiedResponse || !simplifiedResponse.candidates || simplifiedResponse.candidates.length === 0) {
      throw new Error('Invalid response from Gemini API during simplification');
    }
    
    return simplifiedResponse.candidates[0].content.parts[0].text.trim();
  } catch (error) {
    console.error('Fiverr AI Assistant: Error in getSimplifiedMessage:', error);
    throw new Error(`Failed to simplify message: ${error.message}`);
  }
}

// Get reply options
async function getReplyOptions(text, apiKey, recentMessages = []) {
  try {
    // Initialize the Google AI SDK if not already initialized
    if (!genAIInstance) {
      genAIInstance = await initGeminiAPI(apiKey);
    }
    
    // Format recent messages for context
    let contextString = '';
    if (recentMessages.length > 0) {
      contextString = 'Recent conversation:\n' + 
        recentMessages.map(msg => `${msg.sender}: ${msg.content}`).join('\n') + 
        '\n\nClient\'s latest message: "' + text + '"';
    } else {
      contextString = `Client message: "${text}"`;
    }
    
    // Construct the prompt for reply options
    const replyPrompt = `You are a helpful assistant for a Fiverr freelancer. Generate 3 different professional reply options to the client's message. Each reply should be casual, friendly, and impactful. Keep responses concise (2-4 sentences max) but make them effective and warm. Separate the options with |||. Consider the conversation context when crafting responses.

Generate 3 different casual and friendly reply options for this conversation context. Make them short but impactful:
${contextString}`;
    
    // Get reply options from Gemini
    const replyResponse = await genAIInstance.generateContent(replyPrompt, { maxOutputTokens: 500 });
    
    if (!replyResponse || !replyResponse.candidates || replyResponse.candidates.length === 0) {
      throw new Error('Invalid response from Gemini API during reply generation');
    }
    
    const replyText = replyResponse.candidates[0].content.parts[0].text.trim();
    
    // Split the response into separate reply options
    const options = replyText.split('|||').map(reply => reply.trim());
    
    // Ensure we have at least one option
    if (options.length === 0 || (options.length === 1 && options[0] === '')) {
      return ['I apologize, but I don\'t have a specific response prepared. How else can I assist you with your request?'];
    }
    
    return options;
  } catch (error) {
    console.error('Fiverr AI Assistant: Error in getReplyOptions:', error);
    throw new Error(`Failed to generate reply options: ${error.message}`);
  }
} 