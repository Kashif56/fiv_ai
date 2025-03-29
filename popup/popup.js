document.addEventListener('DOMContentLoaded', function() {
  // DOM elements
  const apiKeyInput = document.getElementById('apiKey');
  const enableAICheckbox = document.getElementById('enableAI');
  const saveSettingsBtn = document.getElementById('saveSettings');
  const recentMessagesContainer = document.getElementById('recentMessages');
  const viewFullChatBtn = document.getElementById('viewFullChat');
  const viewChatHistoryBtn = document.getElementById('viewChatHistory');
  const statusIndicator = createStatusIndicator();

  // Load saved settings
  chrome.storage.sync.get(['apiKey', 'enableAI'], function(result) {
    if (result.apiKey) {
      apiKeyInput.value = result.apiKey;
      apiKeyInput.type = 'password'; // Keep API key hidden initially
      statusIndicator.update(true, 'API key is set');
    } else {
      statusIndicator.update(false, 'API key is not set');
    }
    
    if (result.enableAI !== undefined) {
      enableAICheckbox.checked = result.enableAI;
    }
  });

  // Toggle API key visibility
  apiKeyInput.addEventListener('dblclick', function() {
    apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
  });

  // Save settings
  saveSettingsBtn.addEventListener('click', function() {
    const apiKey = apiKeyInput.value.trim();
    const enableAI = enableAICheckbox.checked;
    
    // Show saving indicator
    saveSettingsBtn.textContent = 'Saving...';
    saveSettingsBtn.disabled = true;
    
    chrome.storage.sync.set({
      apiKey: apiKey,
      enableAI: enableAI
    }, function() {
      // Update status indicator
      if (apiKey) {
        statusIndicator.update(true, 'API key saved');
      } else {
        statusIndicator.update(false, 'API key is not set');
      }
      
      // Show saved notification
      saveSettingsBtn.textContent = 'Saved!';
      
      // Reset button after 2 seconds
      setTimeout(() => {
        saveSettingsBtn.textContent = 'Save Settings';
        saveSettingsBtn.disabled = false;
      }, 2000);
    });
  });

  // Load recent chat messages
  loadRecentMessages();

  // View full chat history
  viewFullChatBtn.addEventListener('click', function() {
    // Open a new tab with full chat history
    chrome.tabs.create({
      url: chrome.runtime.getURL('pages/chat-history.html')
    });
  });

  // View chat history page
  viewChatHistoryBtn.addEventListener('click', function() {
    // Open chat history in a new tab (not current window)
    chrome.tabs.create({
      url: chrome.runtime.getURL('pages/chat-history.html')
    });
  });

  // Show recently active tab with Fiverr
  document.getElementById('goToFiverr').addEventListener('click', function() {
    // Find an open Fiverr tab
    chrome.tabs.query({url: '*://*.fiverr.com/*'}, function(tabs) {
      if (tabs.length > 0) {
        // Focus the first found Fiverr tab
        chrome.tabs.update(tabs[0].id, {active: true});
      } else {
        // Open a new tab with Fiverr if none exists
        chrome.tabs.create({url: 'https://www.fiverr.com/inbox'});
      }
    });
  });

  function loadRecentMessages() {
    chrome.storage.local.get(['chatHistory'], function(result) {
      const chatHistory = result.chatHistory || [];
      
      if (chatHistory.length === 0) {
        // Update the message to be more informative
        recentMessagesContainer.innerHTML = '<div class="no-messages">No messages yet. Open a Fiverr chat to start using the assistant.</div>';
        return;
      }
      
      // Clear the container
      recentMessagesContainer.innerHTML = '';
      
      // Sort messages by timestamp (newest first)
      const sortedMessages = [...chatHistory].sort((a, b) => b.timestamp - a.timestamp);
      
      // Get the 5 most recent messages
      const recentMessages = sortedMessages.slice(0, 5);
      
      // Group recent messages by "conversation" (messages close in time)
      const conversationGroups = groupByConversation(recentMessages);
      
      // Display each conversation group
      conversationGroups.forEach(group => {
        // Add a time separator
        const timeSeparator = document.createElement('div');
        timeSeparator.className = 'time-separator';
        const groupTime = formatTimestamp(group[0].timestamp);
        timeSeparator.innerHTML = `<span class="time-text">${groupTime}</span>`;
        recentMessagesContainer.appendChild(timeSeparator);
        
        // Add messages in this group
        group.forEach(message => {
          const messageItem = document.createElement('div');
          messageItem.className = 'message-item';
          
          // Add class based on sender
          if (message.sender.toLowerCase() === 'buyer') {
            messageItem.classList.add('buyer');
          } else {
            messageItem.classList.add('seller');
          }
          
          const messageSender = document.createElement('div');
          messageSender.className = 'message-sender';
          messageSender.textContent = message.sender === 'You' ? 'You (Seller)' : message.sender;
          
          const messageContent = document.createElement('div');
          messageContent.className = 'message-content';
          // Truncate long messages for preview
          messageContent.textContent = message.content.length > 60 
            ? message.content.substring(0, 60) + '...' 
            : message.content;
          
          messageItem.appendChild(messageSender);
          messageItem.appendChild(messageContent);
          
          recentMessagesContainer.appendChild(messageItem);
        });
      });
      
      // Add a "view more" link if there are more than 5 messages
      if (chatHistory.length > 5) {
        const viewMoreLink = document.createElement('div');
        viewMoreLink.className = 'view-more-link';
        viewMoreLink.textContent = `View ${chatHistory.length - 5} more messages...`;
        viewMoreLink.addEventListener('click', function() {
          window.location.href = '../pages/chat-history.html';
        });
        recentMessagesContainer.appendChild(viewMoreLink);
      }
    });
  }
  
  // Group messages that are part of the same conversation (within 30 minutes of each other)
  function groupByConversation(messages) {
    const groups = [];
    let currentGroup = [];
    
    // Messages should already be sorted by timestamp (newest first)
    messages.forEach(message => {
      if (currentGroup.length === 0) {
        // Start a new group
        currentGroup.push(message);
      } else {
        // Check if this message is part of the current conversation
        const lastMessage = currentGroup[currentGroup.length - 1];
        const timeDiff = Math.abs(message.timestamp - lastMessage.timestamp);
        const isCloseInTime = timeDiff < 30 * 60 * 1000; // 30 minutes
        
        if (isCloseInTime) {
          // Add to current group
          currentGroup.push(message);
        } else {
          // Start a new group
          groups.push([...currentGroup]);
          currentGroup = [message];
        }
      }
    });
    
    // Add the last group if it has messages
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
    
    return groups;
  }

  // Helper function to create and add status indicator
  function createStatusIndicator() {
    const container = document.querySelector('.settings-panel');
    const statusDiv = document.createElement('div');
    statusDiv.className = 'api-status';
    
    const statusIcon = document.createElement('span');
    statusIcon.className = 'status-icon';
    
    const statusText = document.createElement('span');
    statusText.className = 'status-text';
    
    statusDiv.appendChild(statusIcon);
    statusDiv.appendChild(statusText);
    container.appendChild(statusDiv);
    
    return {
      update: function(isValid, message) {
        statusIcon.className = 'status-icon ' + (isValid ? 'valid' : 'invalid');
        statusText.textContent = message;
      }
    };
  }

  // Format timestamp in a more user-friendly way
  function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) {
      return 'Just now';
    } else if (diffMins < 60) {
      return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    } else {
      return date.toLocaleDateString();
    }
  }
}); 