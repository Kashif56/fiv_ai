document.addEventListener('DOMContentLoaded', function() {
  console.log('Chat History page loaded');
  
  // Load chat history from storage
  loadChatHistory();
  
  // Add event listener for clear history button
  const clearBtn = document.getElementById('clear-history');
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      if (confirm('Are you sure you want to clear all chat history?')) {
        chrome.storage.local.set({ chatHistory: [] }, function() {
          document.getElementById('conversation-list').innerHTML = '';
          document.getElementById('messages-container').innerHTML = `
            <div class="no-conversation-selected">
              Select a conversation to view messages
            </div>
          `;
        });
      }
    });
  }
});

// Load chat history from storage
function loadChatHistory() {
  chrome.storage.local.get(['chatHistory'], function(result) {
    console.log('Loading chat history', result);
    const chatHistory = result.chatHistory || [];
    
    // Debug: Check what we're getting from storage
    console.log('Chat history length:', chatHistory.length);
    if (chatHistory.length > 0) {
      console.log('First message:', chatHistory[0]);
      console.log('Last message:', chatHistory[chatHistory.length - 1]);
    }
    
    // Group messages by conversation
    const conversations = groupMessagesByConversation(chatHistory);
    console.log('Grouped conversations:', Object.keys(conversations).length);
    
    // Create conversation list
    createConversationList(conversations);
    
    // Show placeholder if no conversations
    if (Object.keys(conversations).length === 0) {
      document.getElementById('messages-container').innerHTML = `
        <div class="no-messages">
          No chat history found
        </div>
      `;
    } else {
      document.getElementById('messages-container').innerHTML = `
        <div class="no-conversation-selected">
          Select a conversation to view messages
        </div>
      `;
      
      // Auto-select the first conversation
      setTimeout(() => {
        const firstConversation = document.querySelector('.conversation-item');
        if (firstConversation) {
          firstConversation.click();
        }
      }, 100);
    }
  });
}

// Group messages by conversation
function groupMessagesByConversation(chatHistory) {
  const conversations = {};
  
  console.log('Grouping messages, total count:', chatHistory.length);
  
  // First pass: group by conversationId or buyerName
  chatHistory.forEach(message => {
    // Debug: Check the message format
    console.log('Processing message:', message.sender, message.buyerName || 'No buyer name', message.content.substring(0, 30) + '...');
    
    // Fix message content if it still contains timestamps or other formatting
    const cleanContent = cleanDisplayMessage(message.content);
    
    const conversationKey = message.conversationId || message.buyerName || 'Unknown';
    
    if (!conversations[conversationKey]) {
      conversations[conversationKey] = {
        id: conversationKey,
        name: message.buyerName || extractConversationName(conversationKey),
        messages: [],
        latestTimestamp: 0
      };
    }
    
    // Save message with cleaned content
    const messageWithCleanContent = {
      ...message,
      content: cleanContent
    };
    
    conversations[conversationKey].messages.push(messageWithCleanContent);
    
    // Track the latest message timestamp for sorting
    if (message.timestamp > conversations[conversationKey].latestTimestamp) {
      conversations[conversationKey].latestTimestamp = message.timestamp;
    }
  });
  
  return conversations;
}

// Clean up message content for display
function cleanDisplayMessage(content) {
  if (!content) return '';
  
  let cleanContent = content.trim();
  
  // Remove common Fiverr message prefixes
  const prefixPatterns = [
    /^Mar \d{1,2}, \d{4}, \d{1,2}:\d{2} (AM|PM)(Replied)?/i,
    /^(Mark as s|Translate)/i
  ];
  
  for (const pattern of prefixPatterns) {
    cleanContent = cleanContent.replace(pattern, '');
  }
  
  // Remove any remaining date patterns
  const datePattern = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s\d{1,2},\s\d{4},\s\d{1,2}:\d{2}\s(AM|PM)/gi;
  cleanContent = cleanContent.replace(datePattern, '');
  
  // Remove "Replied" text
  cleanContent = cleanContent.replace(/Replied/gi, '');
  
  // Remove name patterns like "Vik K"
  const namePattern = /\b[A-Z][a-z]+ [A-Z]\b/g;
  cleanContent = cleanContent.replace(namePattern, '');
  
  return cleanContent.trim();
}

// Extract a display name from conversation ID
function extractConversationName(conversationId) {
  if (!conversationId) return 'Unknown';
  
  // If conversationId has format "name:timestamp"
  if (conversationId.includes(':')) {
    return conversationId.split(':')[0];
  }
  
  // If it's a timestamp-based ID like "Conversation-2023-01-01"
  if (conversationId.startsWith('Conversation-')) {
    return conversationId;
  }
  
  return conversationId;
}

// Create the conversation list
function createConversationList(conversations) {
  const conversationListContainer = document.getElementById('conversation-list');
  if (!conversationListContainer) {
    console.error('Conversation list container not found');
    return;
  }
  
  // Clear existing conversations
  conversationListContainer.innerHTML = '';
  
  // Sort conversations by latest message timestamp (newest first)
  const sortedConversations = Object.values(conversations).sort((a, b) => {
    return b.latestTimestamp - a.latestTimestamp;
  });
  
  console.log('Creating conversation list with', sortedConversations.length, 'conversations');
  
  // Create conversation list items
  sortedConversations.forEach(conversation => {
    const messages = conversation.messages;
    if (messages.length === 0) return;
    
    // Get the most recent message for preview
    const latestMessage = messages.sort((a, b) => b.timestamp - a.timestamp)[0];
    
    // Create conversation item
    const conversationItem = document.createElement('div');
    conversationItem.className = 'conversation-item';
    conversationItem.dataset.conversationId = conversation.id;
    
    // Format date for display
    const messageDate = new Date(latestMessage.timestamp);
    const dateString = formatDate(messageDate);
    
    conversationItem.innerHTML = `
      <div class="conversation-name">${conversation.name}</div>
      <div class="conversation-preview">${latestMessage.content.substring(0, 50)}${latestMessage.content.length > 50 ? '...' : ''}</div>
      <div class="conversation-date">${dateString}</div>
    `;
    
    // Add click event to show messages
    conversationItem.addEventListener('click', () => {
      // Remove active class from all conversations
      document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('active');
      });
      
      // Add active class to clicked conversation
      conversationItem.classList.add('active');
      
      // Display messages for this conversation
      displayConversationMessages(conversation);
    });
    
    // Add to the list
    conversationListContainer.appendChild(conversationItem);
  });
  
  // If no conversations found
  if (sortedConversations.length === 0) {
    conversationListContainer.innerHTML = `
      <div class="no-conversations">
        No conversations found
      </div>
    `;
  }
}

// Display messages for a conversation
function displayConversationMessages(conversation) {
  const messagesContainer = document.getElementById('messages-container');
  if (!messagesContainer) {
    console.error('Messages container not found');
    return;
  }
  
  console.log('Displaying messages for conversation:', conversation.name, 'with', conversation.messages.length, 'messages');
  
  // Clear current messages
  messagesContainer.innerHTML = '';
  
  // Add conversation header
  const header = document.createElement('div');
  header.className = 'conversation-header';
  header.innerHTML = `<h2>${conversation.name}</h2>`;
  messagesContainer.appendChild(header);
  
  // Sort messages by timestamp (oldest first)
  const sortedMessages = conversation.messages.sort((a, b) => a.timestamp - b.timestamp);
  
  // Group messages by date
  const messagesByDate = {};
  
  sortedMessages.forEach(message => {
    const date = new Date(message.timestamp).toDateString();
    
    if (!messagesByDate[date]) {
      messagesByDate[date] = [];
    }
    
    messagesByDate[date].push(message);
  });
  
  // Check if we have any messages to display
  if (Object.keys(messagesByDate).length === 0) {
    messagesContainer.innerHTML += `
      <div class="no-messages">
        No messages found in this conversation
      </div>
    `;
    return;
  }
  
  // Create message elements grouped by date
  Object.keys(messagesByDate).forEach(date => {
    // Add date separator
    const dateSeparator = document.createElement('div');
    dateSeparator.className = 'date-separator';
    dateSeparator.innerHTML = `<span class="date-text">${formatDateHeader(new Date(date))}</span>`;
    messagesContainer.appendChild(dateSeparator);
    
    // Add messages for this date
    messagesByDate[date].forEach(message => {
      const messageItem = document.createElement('div');
      messageItem.className = `message-item ${message.sender.toLowerCase() === 'buyer' ? 'buyer' : 'seller'}`;
      
      // Format time for display
      const messageTime = new Date(message.timestamp);
      const timeString = messageTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      // Make sure message content is clean for display
      const displayContent = message.content || 'No content';
      
      messageItem.innerHTML = `
        <div class="message-sender">${message.sender === 'You' ? 'You' : 'Buyer'}</div>
        <div class="message-content">${displayContent}</div>
        <div class="message-time">${timeString}</div>
      `;
      
      messagesContainer.appendChild(messageItem);
    });
  });
  
  // Scroll to bottom of messages
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Format date for conversation list
function formatDate(date) {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}

// Format date for message groups
function formatDateHeader(date) {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (date.toDateString() === now.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
} 