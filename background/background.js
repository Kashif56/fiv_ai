// Fiverr AI Chat Assistant - Background Service Worker

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
    chrome.storage.sync.get(['apiKey'], function(result) {
      const apiKey = result.apiKey;
      
      if (!apiKey) {
        console.error('Fiverr AI Assistant (Background): No API key found in settings');
        sendResponse({ success: false, error: 'API key not found' });
        return;
      }
      
      console.log('Fiverr AI Assistant (Background): Processing message with AI');
      
      // Create a system prompt that includes the context if available
      let systemPrompt = 'You are a helpful assistant for a Fiverr freelancer.';
      
      if (contextMessages) {
        systemPrompt += ' Below is the recent conversation history for context:\n\n' + contextMessages + '\n\nConsider this context when generating your response.';
      }
      
      // Format context string for simplified message
      let contextString = '';
      if (contextMessages) {
        contextString = `Client message: "${messageText}" with context:\n${contextMessages}`;
      } else {
        contextString = `Client message: "${messageText}"`;
      }
      
      // Fetch a simplified version of the message
      fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: 'You are an expert assistant for a Fiverr freelancer. Your job is to analyze client messages and clearly explain what the client is saying and specifically what they want the freelancer to do. Focus on uncovering their core needs, expectations, and any actionable requests. Keep explanations clear, concise and practical. Consider the conversation context to provide accurate interpretation.'
            },
            {
              role: 'user',
              content: `Analyze this client message and explain: 1) What they're saying, and 2) What they want me to do. Be concise but thorough:\n${contextString}`
            }
          ],
          max_tokens: 150
        })
      })
      .then(response => response.json())
      .then(data => {
        if (data.error) {
          console.error('Fiverr AI Assistant (Background): API error during simplification:', data.error);
          sendResponse({ success: false, error: data.error.message });
          return;
        }
        
        const simplifiedMessage = data.choices && data.choices[0] && data.choices[0].message ? 
                                 data.choices[0].message.content.trim() : messageText;
        
        // Now fetch reply options
        fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content: 'You are a helpful assistant for a Fiverr freelancer. Generate 3 different professional reply options to the client\'s message. Each reply should be casual, friendly, and impactful. Keep responses concise (2-4 sentences max) but make them effective and warm. Separate the options with |||. Consider the conversation context when crafting responses.'
              },
              {
                role: 'user',
                content: `Generate 3 different casual and friendly reply options for this conversation context. Make them short but impactful:\n${contextString}`
              }
            ],
            max_tokens: 500
          })
        })
        .then(response => response.json())
        .then(data => {
          if (data.error) {
            console.error('Fiverr AI Assistant (Background): API error during reply generation:', data.error);
            sendResponse({ success: false, error: data.error.message });
            return;
          }
          
          let replyOptions = ['Sorry, I could not generate replies. Please check your API key.'];
          
          if (data.choices && data.choices[0] && data.choices[0].message) {
            // Split the response into separate reply options
            replyOptions = data.choices[0].message.content.split('|||').map(reply => reply.trim());
            
            // Make sure we have at least one valid reply
            if (replyOptions.length === 0 || (replyOptions.length === 1 && replyOptions[0] === '')) {
              replyOptions = ['I apologize, but I was unable to generate reply suggestions.'];
            }
          }
          
          // Return both the simplified message and reply options
          sendResponse({
            success: true,
            data: {
              simplifiedMessage: simplifiedMessage,
              replyOptions: replyOptions
            }
          });
        })
        .catch(error => {
          console.error('Fiverr AI Assistant (Background): Error during reply generation:', error);
          sendResponse({ success: false, error: error.message });
        });
      })
      .catch(error => {
        console.error('Fiverr AI Assistant (Background): Error during message simplification:', error);
        sendResponse({ success: false, error: error.message });
      });
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

// Function to process text with OpenAI API
async function processWithAI(text, recentMessages = []) {
  // Get API key from storage
  const result = await chrome.storage.sync.get(['apiKey']);
  const apiKey = result.apiKey;
  
  if (!apiKey) {
    console.error('Fiverr AI Assistant: API key not set');
    throw new Error('API key not set. Please add your OpenAI API key in the extension settings.');
  }
  
  try {
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
    // Format recent messages for context
    let contextString = '';
    if (recentMessages.length > 0) {
      contextString = 'Recent conversation:\n' + 
        recentMessages.map(msg => `${msg.sender}: ${msg.content}`).join('\n') + 
        '\n\nClient\'s latest message: "' + text + '"';
    } else {
      contextString = `Client message: "${text}"`;
    }
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are an expert assistant for a Fiverr freelancer. Your job is to analyze client messages and clearly explain what the client is saying and specifically what they want the freelancer to do. Focus on uncovering their core needs, expectations, and any actionable requests. Keep explanations clear, concise and practical. Consider the conversation context to provide accurate interpretation.'
          },
          {
            role: 'user',
            content: `Analyze this client message and explain: 1) What they're saying, and 2) What they want me to do. Be concise but thorough:\n${contextString}`
          }
        ],
        max_tokens: 150
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `API request failed with status: ${response.status}`);
    }
    
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message || 'OpenAI API Error');
    }
    
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content.trim();
    } else {
      throw new Error('Invalid API response for message simplification');
    }
  } catch (error) {
    console.error('Fiverr AI Assistant: Error in getSimplifiedMessage:', error);
    throw new Error(`Failed to simplify message: ${error.message}`);
  }
}

// Get reply options
async function getReplyOptions(text, apiKey, recentMessages = []) {
  try {
    // Format recent messages for context
    let contextString = '';
    if (recentMessages.length > 0) {
      contextString = 'Recent conversation:\n' + 
        recentMessages.map(msg => `${msg.sender}: ${msg.content}`).join('\n') + 
        '\n\nClient\'s latest message: "' + text + '"';
    } else {
      contextString = `Client message: "${text}"`;
    }
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant for a Fiverr freelancer. Generate 3 different professional reply options to the client\'s message. Each reply should be casual, friendly, and impactful. Keep responses concise (2-4 sentences max) but make them effective and warm. Separate the options with |||. Consider the conversation context when crafting responses.'
          },
          {
            role: 'user',
            content: `Generate 3 different casual and friendly reply options for this conversation context. Make them short but impactful:\n${contextString}`
          }
        ],
        max_tokens: 500
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `API request failed with status: ${response.status}`);
    }
    
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message || 'OpenAI API Error');
    }
    
    if (data.choices && data.choices[0] && data.choices[0].message) {
      // Split the response into separate reply options
      const options = data.choices[0].message.content.split('|||').map(reply => reply.trim());
      
      // Ensure we have at least one option
      if (options.length === 0 || (options.length === 1 && options[0] === '')) {
        return ['I apologize, but I don\'t have a specific response prepared. How else can I assist you with your request?'];
      }
      
      return options;
    } else {
      throw new Error('Invalid API response for reply options');
    }
  } catch (error) {
    console.error('Fiverr AI Assistant: Error in getReplyOptions:', error);
    throw new Error(`Failed to generate reply options: ${error.message}`);
  }
} 