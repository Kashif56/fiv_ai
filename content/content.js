// Fiverr AI Chat Assistant - Content Script

// Global variables
let chatObserver = null;
let floatingAssistant = null;
let apiKey = '';
let enableAI = true;
let messageProcessingTimeout;
// Track message processing status
let processedMessages = new Set();
let currentlyProcessingMessage = null;
let messageProcessingDebounceTimer = null;

// Initialize when the page is fully loaded
window.addEventListener('load', initialize);

// Initialize the extension
function initialize() {
  console.log('Initializing Fiverr AI Assistant on: ' + window.location.href);
  
  // Add assistant styles
  addAssistantStyles();
  
  // Create floating assistant right away if on a Fiverr domain
  if (window.location.hostname.includes('fiverr.com')) {
    const assistant = createFloatingAssistant();
    if (assistant) {
      // Check if the assistant was manually closed by the user
      let wasManuallyClosed = false;
      
      // Check local storage first
      try {
        wasManuallyClosed = localStorage.getItem('fiv-ai-assistant-closed') === 'true';
      } catch (error) {
        console.error('Fiverr AI Assistant: Error reading closed state from storage', error);
      }
      
      // Also check window variable (for same-session persistence)
      if (window.fivAssistantManuallyClosed) {
        wasManuallyClosed = true;
      }
      
      // Only show if not manually closed
      if (!wasManuallyClosed) {
        console.log('Fiverr AI Assistant: Showing assistant (not manually closed)');
        assistant.style.display = 'block';
      } else {
        console.log('Fiverr AI Assistant: Assistant was manually closed, not showing');
      }
    }
  }
  
  // Check if on a chat page
  if (isFiverrChatPage()) {
    console.log('Fiverr AI Assistant: Chat page detected, initializing features');
    
    // Initialize chat observer
    observeChatMessages();
    
    // Process existing messages if any
    setTimeout(() => {
      processExistingMessages();
    }, 1000);
    
    // Set up periodic cache cleanup for processed messages
    setInterval(cleanupProcessedMessagesCache, 60000); // Cleanup every minute
  } else {
    console.log('Fiverr AI Assistant: Not a chat page, minimal initialization');
  }
}

// Clean up the processed messages cache to prevent memory issues
function cleanupProcessedMessagesCache() {
  // If we have too many processed messages in the cache, clear older ones
  // Keep the cache at a reasonable size (max 100 messages)
  if (processedMessages.size > 100) {
    console.log(`Fiverr AI Assistant: Cleaning up processed messages cache (${processedMessages.size} items)`);
    // Convert set to array, keep only the last 50 entries
    const messagesToKeep = Array.from(processedMessages).slice(-50);
    // Clear the set and add back the messages to keep
    processedMessages.clear();
    messagesToKeep.forEach(hash => processedMessages.add(hash));
    console.log(`Fiverr AI Assistant: Processed messages cache reduced to ${processedMessages.size} items`);
  }
}

// Load settings from Chrome storage
async function loadSettings() {
  if (!isExtensionContextValid()) {
    console.error('Fiverr AI Assistant: Cannot load settings, extension context invalidated');
    return Promise.resolve();
  }
  
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(['apiKey', 'enableAI'], function(result) {
        if (chrome.runtime.lastError) {
          console.error('Fiverr AI Assistant: Error loading settings', chrome.runtime.lastError);
          // Use default values if error occurs
          apiKey = '';
          enableAI = true;
          resolve();
          return;
        }
        
        apiKey = result.apiKey || '';
        enableAI = result.enableAI !== undefined ? result.enableAI : true;
        resolve();
      });
    } catch (error) {
      console.error('Fiverr AI Assistant: Exception loading settings', error);
      // Use default values if error occurs
      apiKey = '';
      enableAI = true;
      resolve();
    }
  });
}

// Check if current page is a Fiverr chat page
function isFiverrChatPage() {
  // More extensive selectors to find chat elements on Fiverr
  const isFiverrDomain = window.location.href.includes('fiverr.com');
  const isInboxPage = window.location.href.includes('/inbox/') || 
                     window.location.href.includes('/conversations/');
  
  console.log('Fiverr AI Assistant: URL check -', window.location.href);
  
  // Always attempt to create floating assistant on inbox/conversation pages
  if (isFiverrDomain && isInboxPage) {
    console.log('Fiverr AI Assistant: Inbox/conversation URL detected');
    return true;
  }
  
  // Additional checks for chat elements in the DOM
  const hasChatElements = !!document.querySelector('.thread-container, .conversationContainer, .inbox-conversation, .message-content, .conversationContainer, [data-testid="conversation-container"], .messaging-inbox');
  
  if (hasChatElements) {
    console.log('Fiverr AI Assistant: Chat elements found in DOM');
    return true;
  }
  
  return false;
}

// Create the floating AI assistant
function createFloatingAssistant() {
  // If already exists, return
  if (document.getElementById('fiv-ai-floating-assistant')) {
    return document.getElementById('fiv-ai-floating-assistant');
  }
  
  // Create assistant container
  const assistant = document.createElement('div');
  assistant.id = 'fiv-ai-floating-assistant';
  assistant.className = 'fiv-ai-floating-assistant';
  
  // Position in bottom right corner initially
  assistant.style.bottom = '20px';
  assistant.style.right = '20px';
  
  assistant.innerHTML = `
    <div class="fiv-ai-header" id="fiv-ai-header">
      <div>Fiverr AI</div>
      <div class="fiv-ai-controls">
        <button id="fiv-ai-history-btn" title="View Chat History">💬</button>
        <button id="fiv-ai-minimize-btn" title="Minimize">_</button>
        <button id="fiv-ai-close-btn" title="Close">×</button>
      </div>
    </div>
    <div class="fiv-ai-content">
      <div class="fiv-ai-message-summary">
        <h3>Latest Message</h3>
        <div class="fiv-ai-summary-text">
          <div class="fiv-ai-no-messages">No new messages to display.</div>
        </div>
      </div>
      <div class="fiv-ai-reply-options">
        <h3>Reply Suggestions</h3>
        <div class="fiv-ai-carousel-container">
          <button class="fiv-ai-prev" title="Previous suggestion">&#8249;</button>
          <div class="fiv-ai-carousel">
            <div class="fiv-ai-suggestions">
              <div class="fiv-ai-suggestion-placeholder">
                Enable AI in settings to get reply suggestions.
              </div>
            </div>
          </div>
          <button class="fiv-ai-next" title="Next suggestion">&#8250;</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(assistant);
  
  // Create restore button (hidden initially)
  const restoreButton = document.createElement('div');
  restoreButton.id = 'fiv-ai-restore-btn';
  restoreButton.className = 'fiv-ai-restore-btn';
  restoreButton.title = 'Restore Fiverr AI Assistant';
  restoreButton.innerHTML = `<span>Fiverr AI</span>`;
  restoreButton.style.display = 'none';
  document.body.appendChild(restoreButton);
  
  // Set the global floatingAssistant variable
  floatingAssistant = assistant;
  
  // Setup chat history button
  setupChatHistoryButton();
  
  // Set up carousel buttons
  setupCarouselButtons();
  
  // Add minimize button functionality with a direct click handler
  const minimizeBtn = document.getElementById('fiv-ai-minimize-btn');
  if (minimizeBtn) {
    // Remove any existing event listeners
    const newMinimizeBtn = minimizeBtn.cloneNode(true);
    minimizeBtn.parentNode.replaceChild(newMinimizeBtn, minimizeBtn);
    
    // Add fresh event listener
    newMinimizeBtn.addEventListener('click', function(e) {
      e.stopPropagation(); // Prevent event bubbling
      console.log('Minimize button clicked');
      
      // Add minimized class to start animation
      assistant.classList.add('fiv-ai-minimized');
      
      // Explicitly hide the content
      const content = assistant.querySelector('.fiv-ai-content');
      if (content) {
        content.style.maxHeight = '0';
        content.style.opacity = '0';
        content.style.paddingTop = '0';
        content.style.paddingBottom = '0';
      }
      
      // Get position for restore button
      const rect = assistant.getBoundingClientRect();
      restoreButton.style.bottom = window.innerHeight - rect.bottom + 'px';
      restoreButton.style.right = window.innerWidth - rect.right + 'px';
      
      // Hide assistant and show restore button after animation completes
      setTimeout(() => {
        console.log('Hiding assistant and showing restore button');
        assistant.style.display = 'none';
        restoreButton.style.display = 'flex';
      }, 300);
    });
  } else {
    console.error('Fiverr AI Assistant: Minimize button not found');
  }
  
  // Add restore button functionality
  restoreButton.addEventListener('click', function(e) {
    e.stopPropagation(); // Prevent event bubbling
    console.log('Restore button clicked');
    
    // Reset the manually closed state
    window.fivAssistantManuallyClosed = false;
    try {
      localStorage.removeItem('fiv-ai-assistant-closed');
    } catch (error) {
      console.error('Fiverr AI Assistant: Error removing closed state', error);
    }
    
    // Hide restore button
    restoreButton.style.display = 'none';
    
    // Show assistant but keep it minimized initially
    assistant.style.opacity = '0';
    assistant.style.transform = 'scale(0.9)';
    assistant.style.display = 'block';
    
    // Force browser to recognize the element is now visible before applying transition
    setTimeout(() => {
      // Remove minimized class and reset any manually set styles
      assistant.classList.remove('fiv-ai-minimized');
      assistant.style.opacity = '';
      assistant.style.transform = '';
      
      // Ensure content is visible
      const content = assistant.querySelector('.fiv-ai-content');
      if (content) {
        content.style.display = 'block';
        content.style.maxHeight = '500px';
        content.style.opacity = '1';
      }
      
      console.log('Assistant restored from minimized state');
    }, 50);
  });
  
  // Add close button functionality
  const closeBtn = document.getElementById('fiv-ai-close-btn');
  if (closeBtn) {
    // Remove any existing event listeners to prevent duplicates
    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
    
    // Add fresh event listener
    newCloseBtn.addEventListener('click', function(e) {
      e.stopPropagation(); // Prevent event bubbling
      console.log('Close button clicked');
      
      // Add closing animation class
      assistant.classList.add('fiv-ai-closing');
      
      // Hide assistant and restore button after animation completes
      setTimeout(() => {
        console.log('Hiding assistant completely');
        assistant.style.display = 'none';
        assistant.classList.remove('fiv-ai-closing');
        
        // Also hide restore button if it's visible
        const restoreButton = document.getElementById('fiv-ai-restore-btn');
        if (restoreButton) {
          restoreButton.style.display = 'none';
        }
        
        // Clear any minimized state
        assistant.classList.remove('fiv-ai-minimized');
      }, 300);
      
      // Prevent auto-showing of the assistant 
      // Set a flag to indicate the assistant was manually closed
      window.fivAssistantManuallyClosed = true;
      
      // Store the closed state in local storage for persistence
      try {
        localStorage.setItem('fiv-ai-assistant-closed', 'true');
      } catch (error) {
        console.error('Fiverr AI Assistant: Error storing closed state', error);
      }
    });
  }
  
  // Add all event listeners to the assistant
  addFloatingAssistantListeners(assistant);
  
  // Make assistant draggable
  setupDragging();
  
  return assistant;
}

// Add required styles for the assistant
function addAssistantStyles() {
  const styleEl = document.createElement('style');
  styleEl.id = 'fiv-ai-assistant-styles';
  styleEl.textContent = `
    /* Floating AI assistant styles */
    .fiv-ai-floating-assistant {
      position: fixed;
      z-index: 9999;
      width: 380px;
      background-color: #fff;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
      font-family: 'Macan', 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 14px;
      color: #404145;
      overflow: hidden;
      transition: opacity 0.3s, transform 0.3s, max-height 0.3s;
      display: none;
    }

    .fiv-ai-closing {
      opacity: 0;
      transform: scale(0.9);
    }
    
    .fiv-ai-minimized {
      opacity: 0;
      transform: scale(0.9);
      max-height: 60px; /* Just enough to show the header */
      overflow: hidden;
    }

    .fiv-ai-pulse {
      animation: fiv-ai-pulse-animation 1s;
    }

    @keyframes fiv-ai-pulse-animation {
      0% { box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2); }
      50% { box-shadow: 0 4px 25px rgba(29, 191, 115, 0.6); }
      100% { box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2); }
    }

    /* Restore button styles */
    .fiv-ai-restore-btn {
      position: fixed;
      z-index: 9999;
      bottom: 20px;
      right: 20px;
      background-color: #1dbf73;
      color: white;
      padding: 12px 16px;
      border-radius: 30px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      cursor: pointer;
      font-family: 'Macan', 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 14px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }

    .fiv-ai-restore-btn:hover {
      background-color: #19a463;
      transform: translateY(-2px);
      box-shadow: 0 6px 14px rgba(0, 0, 0, 0.25);
    }

    .fiv-ai-restore-btn span {
      display: flex;
      align-items: center;
    }

    .fiv-ai-restore-btn span:before {
      content: '+';
      margin-right: 8px;
      font-size: 16px;
      font-weight: bold;
    }

    .fiv-ai-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      background-color: #1dbf73; /* Fiverr green */
      color: white;
      cursor: move;
      font-weight: 600;
      font-size: 16px;
    }

    .fiv-ai-controls {
      display: flex;
      gap: 10px;
    }

    .fiv-ai-controls button {
      background: none;
      border: none;
      color: white;
      font-size: 18px;
      cursor: pointer;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
    }

    .fiv-ai-controls button:hover {
      background-color: rgba(255, 255, 255, 0.2);
    }

    .fiv-ai-content {
      padding: 20px;
      max-height: 500px;
      transition: all 0.3s ease-in-out;
      overflow: hidden;
    }

    .fiv-ai-minimized .fiv-ai-content {
      max-height: 0 !important;
      padding-top: 0 !important;
      padding-bottom: 0 !important;
      opacity: 0 !important;
      overflow: hidden !important;
      margin: 0 !important;
      visibility: hidden;
    }

    .fiv-ai-message-summary {
      margin-bottom: 20px;
    }

    .fiv-ai-message-summary h3 {
      font-size: 18px;
      margin: 0 0 12px 0;
      color: #404145;
      font-weight: 600;
    }

    .fiv-ai-summary-text {
      background-color: #f5f5f5;
      padding: 16px;
      border-radius: 8px;
      margin: 0;
      font-size: 15px;
      line-height: 1.5;
      max-height: 200px;
      overflow-y: auto;
    }
    
    .fiv-ai-original-message {
      margin-bottom: 12px;
      padding-bottom: 10px;
      border-bottom: 1px solid #ddd;
      color: #62646a;
      font-style: italic;
      line-height: 1.5;
    }
    
    .fiv-ai-simplified {
      color: #404145;
      line-height: 1.5;
    }
    
    .fiv-ai-simplified strong {
      color: #1dbf73;
      font-weight: 600;
    }
    
    .fiv-ai-summary-text strong {
      color: #1dbf73;
      font-weight: 600;
    }
    
    .fiv-ai-summary-text em {
      color: #62646a;
      font-style: italic;
    }

    .fiv-ai-reply-options h3 {
      font-size: 18px;
      margin: 0 0 12px 0;
      color: #404145;
      font-weight: 600;
    }

    .fiv-ai-carousel-container {
      position: relative;
      width: 100%;
      padding: 0 24px;
    }

    .fiv-ai-carousel {
      width: 100%;
      margin: 0 auto;
      overflow-x: auto;
      scroll-behavior: smooth;
      scroll-snap-type: x mandatory;
      scrollbar-width: thin;
      scrollbar-color: #ddd #f5f5f5;
      -webkit-overflow-scrolling: touch;
      -ms-overflow-style: none;  /* Hide scrollbar IE and Edge */
      scrollbar-width: none;  /* Hide scrollbar Firefox */
    }
    
    .fiv-ai-carousel::-webkit-scrollbar {
      display: none; /* Hide scrollbar Chrome, Safari, Opera */
    }

    .fiv-ai-suggestions {
      display: flex;
      gap: 15px;
      padding: 5px 0;
      width: 100%;
    }

    .fiv-ai-suggestion {
      flex: 0 0 100%;
      background-color: #f5f5f5;
      border-radius: 8px;
      padding: 16px;
      font-size: 15px;
      line-height: 1.5;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      display: flex;
      flex-direction: column;
      gap: 12px;
      border: 1px solid #eee;
      transition: background-color 0.2s;
      cursor: pointer;
      height: 100%;
      min-height: 60px;
      max-height: 220px;
      width: 100%;
    }

    .fiv-ai-suggestion:hover {
      background-color: #eef9f3;
    }

    .fiv-ai-suggestion-text {
      flex: 1;
      overflow-y: auto;
      padding-right: 5px;
    }

    .fiv-ai-suggestion-placeholder {
      padding: 20px;
      background-color: #f5f5f5;
      border-radius: 8px;
      color: #62646a;
      text-align: center;
      width: 340px;
      font-style: italic;
    }

    .fiv-ai-send-btn {
      background-color: #1dbf73;
      color: white;
      border: none;
      border-radius: 4px;
      padding: 8px 16px;
      cursor: pointer;
      font-size: 15px;
      font-weight: 600;
      transition: background-color 0.2s;
      align-self: flex-end;
    }

    .fiv-ai-send-btn:hover {
      background-color: #19a463;
    }

    .fiv-ai-prev, .fiv-ai-next {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      background-color: #1dbf73;
      color: white;
      border: none;
      border-radius: 50%;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 22px;
      font-weight: bold;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      transition: all 0.2s;
      z-index: 20;
      opacity: 0.95;
      padding: 0;
      line-height: 1;
    }

    .fiv-ai-prev {
      left: -12px;
    }

    .fiv-ai-next {
      right: -12px;
    }

    .fiv-ai-prev:hover, .fiv-ai-next:hover {
      background-color: #19a463;
      opacity: 1;
      transform: translateY(-50%) scale(1.1);
    }
  `;
  
  document.head.appendChild(styleEl);
}

// Add event listeners to floating assistant
function addFloatingAssistantListeners(assistant) {
  // Since the minimize button is now handled directly in createFloatingAssistant
  // we only need event listeners for other interactions
  
  // Suggestion click events
  assistant.addEventListener('click', (e) => {
    if (e.target.classList.contains('fiv-ai-suggestion')) {
      // Scroll the suggestion into view
      e.target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
    
    // Send button click handler
    if (e.target.classList.contains('fiv-ai-send-btn')) {
      const suggestionText = e.target.parentElement.querySelector('.fiv-ai-suggestion-text').textContent;
      
      if (suggestionText) {
        // Try to find and fill Fiverr's message input
        const filled = fillFiverrMessageInput(suggestionText);
        
        // Copy to clipboard (always do this as a backup)
        navigator.clipboard.writeText(suggestionText).then(() => {
          // Show appropriate notification based on whether we filled the input or just copied
          if (filled) {
            e.target.textContent = 'Sent!';
          } else {
            e.target.textContent = 'Copied!';
          }
          
          // Reset button text after 2 seconds
          setTimeout(() => {
            e.target.textContent = 'Send';
          }, 2000);
        }).catch(err => {
          console.error('Fiverr AI Assistant: Clipboard error', err);
          e.target.textContent = 'Error!';
          setTimeout(() => {
            e.target.textContent = 'Send';
          }, 2000);
        });
      }
    }
    
    // Direct click handlers for navigation buttons
    if (e.target.classList.contains('fiv-ai-prev')) {
      const carousel = assistant.querySelector('.fiv-ai-carousel');
      if (carousel) {
        const containerWidth = carousel.clientWidth;
        carousel.scrollBy({ left: -containerWidth, behavior: 'smooth' });
      }
    }
    
    if (e.target.classList.contains('fiv-ai-next')) {
      const carousel = assistant.querySelector('.fiv-ai-carousel');
      if (carousel) {
        const containerWidth = carousel.clientWidth;
        carousel.scrollBy({ left: containerWidth, behavior: 'smooth' });
      }
    }
  });
}

// Try to fill Fiverr's message input with the selected response
function fillFiverrMessageInput(text) {
  // Find Fiverr's message input field
  const possibleSelectors = [
    'textarea[placeholder*="message"]',
    'textarea[placeholder*="type"]',
    'textarea[placeholder*="write"]',
    'textarea[placeholder*="reply"]',
    'div[contenteditable="true"]',
    'div[role="textbox"]',
    '.message-area textarea',
    '.message-box textarea',
    '.chat-input textarea',
    // More generic selectors
    'textarea',
    'div[contenteditable]'
  ];
  
  let inputField = null;
  
  for (const selector of possibleSelectors) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      // Find the most likely message input among matches
      inputField = Array.from(elements).find(el => {
        const rect = el.getBoundingClientRect();
        // Likely a message input if it's visible, has a reasonable size, and is in the bottom portion of the page
        return rect.height > 20 && 
               rect.width > 100 && 
               rect.bottom > window.innerHeight / 2 &&
               window.getComputedStyle(el).display !== 'none';
      });
      
      if (inputField) break;
    }
  }
  
  if (inputField) {
    console.log('Fiverr AI Assistant: Found message input field');
    
    // Different handling for contenteditable divs vs. textareas
    if (inputField.tagName === 'DIV' && inputField.getAttribute('contenteditable') === 'true') {
      inputField.innerHTML = text;
      // Trigger input event for reactive forms
      inputField.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // For textareas
      inputField.value = text;
      // Trigger input event for reactive forms
      inputField.dispatchEvent(new Event('input', { bubbles: true }));
      inputField.dispatchEvent(new Event('change', { bubbles: true }));
    }
    
    // Try to focus the input field
    inputField.focus();
    
    return true;
  } else {
    console.log('Fiverr AI Assistant: Message input field not found');
    return false;
  }
}

// Function to observe chat messages and process new ones
function observeChatMessages() {
  console.log('Fiverr AI Assistant: Setting up chat message observer');
  
  // Try multiple selectors to find the chat container
  const containerSelectors = [
    '.thread-container',
    '.conversationContainer',
    '.inbox-conversation',
    '.conversation-area',
    '.inbox-messaging',
    '[data-testid="conversation-container"]',
    '.messages-container', 
    '.message-list',
    '.conversation-messages',
    '.message-area',
    '.chat-container',
    'div[class*="conversation"]',
    'div[class*="inbox"]',
    'div[class*="chat"]',
    'div[class*="message"]'
  ];
  
  let chatContainer = null;
  
  // Try each selector until we find a match
  for (const selector of containerSelectors) {
    const container = document.querySelector(selector);
    if (container) {
      chatContainer = container;
      console.log(`Fiverr AI Assistant: Found chat container with selector: ${selector}`);
      break;
    }
  }
  
  // If chat container isn't available yet, retry after a short delay
  if (!chatContainer) {
    console.log('Fiverr AI Assistant: Chat container not found, will retry in 2 seconds');
    setTimeout(observeChatMessages, 2000);
    return;
  }
  
  console.log('Fiverr AI Assistant: Found chat container, setting up observer');
  
  // Process existing messages on page load
  setTimeout(() => {
    processExistingMessages();
  }, 1000);
  
  // Track the last node count to avoid processing the same state multiple times
  let lastNodeCount = 0;
  // Track the last processed timestamp to prevent too-frequent processing
  let lastProcessedTime = 0;
  
  // Create a new MutationObserver to detect message additions
  const observer = new MutationObserver((mutations) => {
    // Get current timestamp
    const now = Date.now();
    
    // Don't process again if it's been less than 300ms since last processing
    if (now - lastProcessedTime < 300) {
      return;
    }
    
    // Filter to find significant message additions
    // We're looking for new nodes being added, not just attribute changes
    const significantChanges = mutations.filter(mutation => 
      mutation.type === 'childList' && mutation.addedNodes.length > 0
    );
    
    if (significantChanges.length === 0) {
      return; // No significant changes to process
    }
    
    // Count the current number of message-like elements
    const currentNodeCount = document.querySelectorAll('.message-content, .message-bubble, .message-text, [class*="message"]').length;
    
    // If node count hasn't changed, don't reprocess
    if (currentNodeCount === lastNodeCount) {
      return;
    }
    
    lastNodeCount = currentNodeCount;
    
    console.log('Fiverr AI Assistant: Detected message changes, processing');
    
    // Wait for the DOM to settle before checking for new messages
    clearTimeout(messageProcessingTimeout);
    
    messageProcessingTimeout = setTimeout(() => {
      lastProcessedTime = Date.now();
      
      const buyerMessages = findBuyerMessages();
      const sellerMessages = findSellerMessages();
      
      if (buyerMessages.length > 0) {
        processBuyerMessages(buyerMessages);
      }
      
      if (sellerMessages.length > 0) {
        processSellerMessages(sellerMessages);
      }
    }, 500); // Half-second delay to let DOM settle
  });
  
  // Configure the observer to watch for changes to child elements and subtree
  // Only watch for structural changes (childList), not attribute or text changes
  observer.observe(chatContainer, {
    childList: true,
    subtree: true
  });
  
  // Store observer reference for cleanup
  chatObserver = observer;
  
  console.log('Fiverr AI Assistant: Message observer set up successfully');
}

// Check for new messages in the chat
function checkForNewMessages() {
  try {
    // Try to find the buyer name from the page
    const buyerName = findBuyerName();
    
    // Find buyer messages (messages not sent by the user)
    const buyerMessages = findBuyerMessages();
    
    // Find seller messages (messages sent by the user)
    const sellerMessages = findSellerMessages(); 
    
    // Process buyer messages - only these activate the AI assistant
    if (buyerMessages.length > 0) {
      // Get the latest message from the buyer
      const latestBuyerMessage = buyerMessages[buyerMessages.length - 1];
      
      if (latestBuyerMessage) {
        const buyerMessageText = extractMessageContent(latestBuyerMessage);
        
        if (buyerMessageText) {
          console.log('Fiverr AI Assistant: Found new buyer message:', buyerMessageText.substring(0, 30) + '...');
          
          // Check if message is already in history before processing
          isMessageInHistory('Buyer', buyerMessageText).then(isInHistory => {
            if (!isInHistory) {
              // Save the buyer message to chat history with conversation info
              saveMessageToHistory('Buyer', buyerMessageText, buyerName);
              
              // Process with AI if enabled - only for buyer messages
              if (enableAI && apiKey) {
                processMessageWithAI(buyerMessageText);
              } else {
                // Just show the message in the assistant
                updateAssistantWithMessage(buyerMessageText);
              }
            } else {
              console.log('Fiverr AI Assistant: Buyer message already in history, skipping processing');
            }
          });
        }
      }
    }
    
    // Store seller messages for context, but don't activate the assistant
    if (sellerMessages.length > 0) {
      // Get the latest message from the seller
      const latestSellerMessage = sellerMessages[sellerMessages.length - 1];
      
      if (latestSellerMessage) {
        const sellerMessageText = extractMessageContent(latestSellerMessage);
        
        if (sellerMessageText) {
          console.log('Fiverr AI Assistant: Found seller message, storing for context:', sellerMessageText.substring(0, 30) + '...');
          
          // Check if message is already in history before storing
          isMessageInHistory('You', sellerMessageText).then(isInHistory => {
            if (!isInHistory) {
              // Save the seller message to chat history with conversation info but don't trigger AI
              saveMessageToHistory('You', sellerMessageText, buyerName);
            } else {
              console.log('Fiverr AI Assistant: Seller message already in history, skipping storage');
            }
          });
        }
      }
    }
  } catch (error) {
    console.error('Fiverr AI Assistant: Error checking for new messages', error);
  }
}

// Improved function to check if a message is already in history
function isMessageInHistory(sender, content) {
  return new Promise((resolve) => {
    // Skip empty messages
    if (!content || content.trim() === '') {
      resolve(true); // Treat empty messages as duplicates
      return;
    }
    
    // Check if extension context is valid before proceeding
    if (!isExtensionContextValid()) {
      console.error('Fiverr AI Assistant: Cannot check message history, extension context invalidated');
      resolve(false); // Safer to assume it's not a duplicate if we can't verify
      return;
    }
    
    // Clean the content for comparison
    const cleanedContent = cleanMessageText(content).trim().toLowerCase();
    
    try {
      chrome.storage.local.get(['chatHistory'], function(result) {
        // Check if we got a runtime error
        if (chrome.runtime.lastError) {
          console.error('Fiverr AI Assistant: Error getting chat history', chrome.runtime.lastError);
          resolve(false); // Safer to assume it's not a duplicate if we can't verify
          return;
        }
        
        // Check again if extension context is still valid
        if (!isExtensionContextValid()) {
          console.error('Fiverr AI Assistant: Extension context invalidated during message history check');
          resolve(false);
          return;
        }
        
        const chatHistory = result.chatHistory || [];
        
        // For very short messages, only check for exact matches
        if (cleanedContent.length < 20) {
          const isDuplicate = chatHistory.some(msg => 
            msg.content.trim().toLowerCase() === cleanedContent && 
            msg.sender === sender
          );
          resolve(isDuplicate);
          return;
        }
        
        // For longer messages, check for similarity to handle minor differences
        for (const msg of chatHistory) {
          if (msg.sender !== sender) continue;
          
          const existingContent = msg.content.trim().toLowerCase();
          
          // Exact match
          if (existingContent === cleanedContent) {
            resolve(true);
            return;
          }
          
          // Check similarity for longer messages
          // const similarity = calculateSimilarity(existingContent, cleanedContent);
          // if (similarity > 0.85) { // 85% similarity threshold
          //   console.log(`Fiverr AI Assistant: Found similar message with ${Math.round(similarity*100)}% similarity`);
          //   resolve(true);
          //   return;
          // }
        }
        
        resolve(false);
      });
    } catch (error) {
      console.error('Fiverr AI Assistant: Error checking message history', error);
      resolve(false); // Safer to assume it's not a duplicate if we encounter an error
    }
  });
}

// Helper function to calculate similarity between two strings
function calculateSimilarity(str1, str2) {
  // Use longest common substring as a simple measure of similarity
  const lcs = findLongestCommonSubstring(str1, str2);
  
  // Calculate similarity as ratio of common text to average length
  const avgLength = (str1.length + str2.length) / 2;
  return lcs.length / avgLength;
}

// Find the longest common substring between two strings
function findLongestCommonSubstring(str1, str2) {
  if (!str1 || !str2) return '';
  
  // Create a table to store lengths of longest common substrings
  const table = Array(str1.length + 1).fill().map(() => Array(str2.length + 1).fill(0));
  
  let maxLength = 0;
  let endPosition = 0;
  
  for (let i = 1; i <= str1.length; i++) {
    for (let j = 1; j <= str2.length; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        table[i][j] = table[i - 1][j - 1] + 1;
        
        if (table[i][j] > maxLength) {
          maxLength = table[i][j];
          endPosition = i;
        }
      }
    }
  }
  
  return str1.substring(endPosition - maxLength, endPosition);
}

// Find buyer messages with multiple possible selectors
function findBuyerMessages() {
  // Try new Fiverr inbox specific selector first
  const messageElements = document.querySelectorAll('.message-content');
  if (messageElements && messageElements.length > 0) {
    console.log('Fiverr AI Assistant: Found message-content elements:', messageElements.length);
    
    // Filter for buyer messages based on sender span
    const buyerMessages = Array.from(messageElements).filter(msg => {
      const senderSpan = msg.querySelector('.sender');
      // If sender span exists and does NOT contain "Me", it's a buyer message
      return senderSpan && senderSpan.textContent && !senderSpan.textContent.includes('Me');
    });
    
    if (buyerMessages.length > 0) {
      console.log('Fiverr AI Assistant: Found buyer messages with .message-content and .sender check', buyerMessages.length);
      return buyerMessages;
    }
  }
  
  // Try various selectors that might contain buyer messages
  const possibleSelectors = [
    '.message-wrapper:not(.me) .message-body',
    '.message:not(.outgoing) .message-content',
    '.message-item:not(.sender) .message-text',
    '[data-testid="message"]:not([data-sender="me"]) .message-content',
    '.conversation-bubble:not(.own-message) .bubble-content',
    // Additional selectors for Fiverr
    '.message:not(.outgoing):not(.me) .message-text',
    '.bubble:not(.own):not(.me) .bubble-content',
    '.message-container:not(.me):not(.own):not(.seller) .message-content',
    // Messages from buyers are typically left-aligned
    '.message-left .message-content',
    '.message-left .bubble-content',
    '.left-bubble .content',
    // More specific Fiverr selectors
    '.message-container:not([class*="own"]):not([class*="me"]):not([class*="seller"]) .message-text',
    // Fiverr specific message format (e.g., "ClientNameMar 28, 2025, 8:24 PM")
    '.thread-content:not(.me) .text-content',
    '.thread-content.buyer .text-content'
  ];
  
  for (const selector of possibleSelectors) {
    const elements = document.querySelectorAll(selector);
    if (elements && elements.length > 0) {
      console.log(`Fiverr AI Assistant: Found buyer messages with selector: ${selector}`);
      return Array.from(elements);
    }
  }
  
  // If no match with predefined selectors, try more generic approach
  const allMessages = document.querySelectorAll('[class*="message"], [class*="bubble"], [class*="chat-item"], [class*="thread-content"]');
  
  // Debug info about found elements
  console.log(`Fiverr AI Assistant: Found ${allMessages.length} potential message elements`);
  if (allMessages.length > 0) {
    const classInfo = Array.from(allMessages).map(el => el.className).join(' | ');
    console.log('Fiverr AI Assistant: Message element classes:', classInfo.substring(0, 200) + (classInfo.length > 200 ? '...' : ''));
  }
  
  const buyerMessages = Array.from(allMessages).filter(msg => {
    const classNames = msg.className.toLowerCase();
    const isNotSent = !classNames.includes('own') && 
                      !classNames.includes('me') && 
                      !classNames.includes('outgoing') && 
                      !classNames.includes('sent') &&
                      !classNames.includes('seller');
    
    // Check if element has text content and it's not an input field or button
    const hasContent = msg.textContent.trim().length > 0;
    const isNotInput = msg.tagName !== 'INPUT' && 
                       msg.tagName !== 'TEXTAREA' && 
                       msg.tagName !== 'BUTTON';
    
    // Check position - buyer messages often positioned on the left (if classes don't give clear indication)
    const style = window.getComputedStyle(msg);
    const isLeftAligned = style.textAlign === 'left' || 
                          style.marginLeft === '0px' || 
                          classNames.includes('left') ||
                          !classNames.includes('right');
    
    // Buyer messages often have different background color than seller messages
    const bgColor = style.backgroundColor;
    const isLikelyBuyerColor = bgColor && 
                              !bgColor.includes('rgb(29, 191, 115)') && // Not Fiverr green
                              !bgColor.includes('#1dbf73');
                              
    // Check if the message contains a buyer-like format
    const isBuyerFormat = classNames.includes('buyer') || 
                         (!classNames.includes('seller') && 
                          !classNames.includes('outgoing') && 
                          !classNames.includes('me'));
    
    return isNotSent && hasContent && isNotInput && (isLeftAligned || isLikelyBuyerColor || isBuyerFormat);
  });
  
  if (buyerMessages.length > 0) {
    console.log('Fiverr AI Assistant: Found potential buyer messages using pattern matching:', buyerMessages.length);
    return buyerMessages;
  }
  
  console.log('Fiverr AI Assistant: No buyer messages found');
  return [];
}

// Find seller (your) messages
function findSellerMessages() {
  // Try new Fiverr inbox specific selector first
  const messageElements = document.querySelectorAll('.message-content');
  if (messageElements && messageElements.length > 0) {
    console.log('Fiverr AI Assistant: Found message-content elements:', messageElements.length);
    
    // Filter for seller messages based on sender span
    const sellerMessages = Array.from(messageElements).filter(msg => {
      const senderSpan = msg.querySelector('.sender');
      // If sender span exists and contains "Me", it's a seller message
      return senderSpan && senderSpan.textContent && senderSpan.textContent.includes('Me');
    });
    
    if (sellerMessages.length > 0) {
      console.log('Fiverr AI Assistant: Found seller messages with .message-content and .sender check', sellerMessages.length);
      return sellerMessages;
    }
  }
  
  // Try various selectors that might contain seller messages
  const possibleSelectors = [
    '.message-wrapper.me .message-body',
    '.message.outgoing .message-content',
    '.message-item.sender .message-text',
    '[data-testid="message"][data-sender="me"] .message-content',
    '.conversation-bubble.own-message .bubble-content',
    // Additional selectors for Fiverr
    '.message.outgoing.me .message-text',
    '.bubble.own.me .bubble-content',
    '.message-container.me.own.seller .message-content',
    // Messages from sellers are typically right-aligned
    '.message-right .message-content',
    '.message-right .bubble-content',
    '.right-bubble .content',
    // More specific Fiverr selectors
    '.message-container[class*="own"], .message-container[class*="me"], .message-container[class*="seller"]',
    '[class*="message"][class*="own"] .message-text',
    '[class*="message"][class*="me"] .message-text',
    '[class*="message"][class*="seller"] .message-text',
    // Fiverr specific message format (e.g., "MeMar 28, 2025, 8:25 PM")
    '.thread-content.me .text-content',
    '.thread-content.seller .text-content'
  ];
  
  for (const selector of possibleSelectors) {
    const elements = document.querySelectorAll(selector);
    if (elements && elements.length > 0) {
      console.log(`Fiverr AI Assistant: Found seller messages with selector: ${selector}`);
      return Array.from(elements);
    }
  }
  
  // If no match with predefined selectors, try more generic approach
  const allMessages = document.querySelectorAll('[class*="message"], [class*="bubble"], [class*="chat-item"], [class*="thread-content"]');
  
  const sellerMessages = Array.from(allMessages).filter(msg => {
    const classNames = msg.className.toLowerCase();
    const isSent = classNames.includes('own') || 
                   classNames.includes('me') || 
                   classNames.includes('outgoing') || 
                   classNames.includes('sent') ||
                   classNames.includes('seller') ||
                   classNames.includes('right');
    
    // Check if element has text content and it's not an input field or button
    const hasContent = msg.textContent.trim().length > 0;
    const isNotInput = msg.tagName !== 'INPUT' && 
                       msg.tagName !== 'TEXTAREA' && 
                       msg.tagName !== 'BUTTON';
    
    // Check position - seller messages often positioned on the right
    const style = window.getComputedStyle(msg);
    const isRightAligned = style.textAlign === 'right' || 
                           style.marginRight === '0px' || 
                           style.alignSelf === 'flex-end' ||
                           style.float === 'right' ||
                           classNames.includes('right');
    
    // Seller messages often have Fiverr green color
    const bgColor = style.backgroundColor;
    const isLikelySellerColor = bgColor && 
                              (bgColor.includes('rgb(29, 191, 115)') || // Fiverr green
                               bgColor.includes('#1dbf73') || 
                               bgColor.includes('rgba(29, 191, 115') ||
                               bgColor.includes('rgb(0, 157, 90)'));
                               
    // Check for messages with "Me" prefix
    const isMeFormat = msg.textContent.trim().startsWith('Me') || 
                      classNames.includes('me') || 
                      classNames.includes('seller');
    
    return (isSent || isRightAligned || isLikelySellerColor || isMeFormat) && hasContent && isNotInput;
  });
  
  if (sellerMessages.length > 0) {
    console.log('Fiverr AI Assistant: Found potential seller messages using pattern matching:', sellerMessages.length);
    return sellerMessages;
  }
  
  console.log('Fiverr AI Assistant: No seller messages found');
  return [];
}

// Function to save a message to chat history
function saveMessageToHistory(sender, content, buyerName) {
  // Skip saving if content is empty
  if (!content || content.trim() === '') {
    console.log('Fiverr AI Assistant: Skipping empty message');
    return;
  }

  // Clean any remaining formatting in the message content
  const cleanedContent = cleanMessageText(content);
  
  // Get the current timestamp
  const timestamp = new Date().getTime();
  
  // Create conversation ID based on buyer name and day
  const conversationId = buyerName ? `${buyerName}:${Math.floor(timestamp / 86400000)}` : null;
  
  // Create the message object
  const messageObj = {
    sender: sender,
    content: cleanedContent,
    timestamp: timestamp,
    buyerName: buyerName || null,
    conversationId: conversationId
  };
  
  console.log(`Fiverr AI Assistant: Saving ${sender} message:`, cleanedContent.substring(0, 30) + (cleanedContent.length > 30 ? '...' : ''));
  
  // Use promise to make storage transactions more reliable
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['chatHistory'], function(result) {
      // Initialize chat history if it doesn't exist
      let chatHistory = result.chatHistory || [];
      const originalLength = chatHistory.length;
      
      console.log('Fiverr AI Assistant: Current chat history length:', chatHistory.length);
      
      // Check if this exact message is already in the history
      const isDuplicate = chatHistory.some(msg => 
        msg.content.trim().toLowerCase() === cleanedContent.trim().toLowerCase() && 
        msg.sender === sender
      );
      
      if (isDuplicate) {
        console.log('Fiverr AI Assistant: Skipping duplicate message');
        resolve(false);
        return;
      }
      
      // Add the new message to the history
      chatHistory.push(messageObj);
      
      // Limit history size to prevent storage issues (200 is a reasonable limit)
      if (chatHistory.length > 200) {
        chatHistory = chatHistory.slice(-200);
      }
      
      // Save the updated chat history back to storage
      chrome.storage.local.set({ chatHistory: chatHistory }, function() {
        if (chrome.runtime.lastError) {
          console.error('Fiverr AI Assistant: Error saving message to history:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          console.log(`Fiverr AI Assistant: Successfully saved message. History grew from ${originalLength} to ${chatHistory.length}`);
          
          // Double-check that our save was successful by reading it back
          chrome.storage.local.get(['chatHistory'], function(verifyResult) {
            if (verifyResult.chatHistory && verifyResult.chatHistory.length > originalLength) {
              console.log('Fiverr AI Assistant: Verified save was successful. Current length:', verifyResult.chatHistory.length);
            } else {
              console.warn('Fiverr AI Assistant: Save verification failed. Expected growth not seen.');
            }
            resolve(true);
          });
        }
      });
    });
  });
}

// Helper function to determine correct sender type
function senderType(sender) {
  // If the sender is already correctly formatted, return it
  if (sender === 'Buyer' || sender === 'You') {
    return sender;
  }
  
  // Otherwise, determine based on content
  return sender.includes('Buyer') ? 'Buyer' : 'You';
}

// Process a message with Google Gemini API through the background script
// This is the correct way to make API calls in a Chrome extension - avoids CORS issues and security concerns
async function processMessageWithAI(messageText) {
  if (!apiKey || !enableAI) return;
  
  try {
    console.log('Fiverr AI Assistant: Processing message with AI');
    
    // Use the background script to process the message (avoiding CORS issues)
    chrome.runtime.sendMessage(
      { action: 'processWithAI', text: messageText },
      function(response) {
        if (response && response.success) {
          updateAssistantWithAIResults(
            response.data.simplifiedMessage, 
            response.data.replyOptions,
            messageText
          );
        } else {
          console.error('Fiverr AI Assistant: API error', response?.error || 'Unknown error');
          updateAssistantWithMessage(messageText);
        }
      }
    );
  } catch (error) {
    console.error('Fiverr AI Assistant: Error processing message with AI', error);
    // Fall back to showing the original message
    updateAssistantWithMessage(messageText);
  }
}

// Update assistant with AI results to fix carousel behavior
function updateAssistantWithAIResults(simplifiedMessage, replyOptions, originalMessage) {
  if (!floatingAssistant) {
    console.error('Fiverr AI Assistant: Floating assistant not found');
    return;
  }
  
  try {
    console.log('Fiverr AI Assistant: Updating assistant with AI results');
    console.log('Fiverr AI Assistant: Simplified message:', simplifiedMessage);
    
    // Check if assistant was manually closed
    let wasManuallyClosed = false;
    try {
      wasManuallyClosed = localStorage.getItem('fiv-ai-assistant-closed') === 'true' || window.fivAssistantManuallyClosed === true;
    } catch (error) {
      console.error('Fiverr AI Assistant: Error checking closed state', error);
    }
    
    // Always update the content even if not shown
    // Update summary section with original and simplified message
    const summaryElement = floatingAssistant.querySelector('.fiv-ai-summary-text');
    if (summaryElement) {
      let displayOriginal = originalMessage || '';
      // Truncate original if too long
      if (displayOriginal.length > 80) {
        displayOriginal = displayOriginal.substring(0, 77) + '...';
      }
      
      summaryElement.innerHTML = `
        <div class="fiv-ai-original-message">${displayOriginal}</div>
        <div class="fiv-ai-simplified"><strong>Simplified:</strong> ${simplifiedMessage}</div>
      `;
    }
    
    // Update suggestions
    const suggestionsContainer = floatingAssistant.querySelector('.fiv-ai-suggestions');
    if (suggestionsContainer) {
      // Clear existing suggestions
      suggestionsContainer.innerHTML = '';
      
      // Ensure we have valid reply options
      const validOptions = replyOptions.filter(reply => reply && reply.trim().length > 0);
      
      if (validOptions.length === 0) {
        suggestionsContainer.innerHTML = `
          <div class="fiv-ai-suggestion-placeholder">
            No valid reply options returned. Try again or edit manually.
          </div>
        `;
      } else {
        // Create each suggestion as a separate carousel item with consistent structure
        validOptions.forEach((reply, index) => {
          const suggestionElement = document.createElement('div');
          suggestionElement.className = 'fiv-ai-suggestion';
          suggestionElement.style.scrollSnapAlign = 'start';
          
          // Add suggestion text in its own container
          const suggestionText = document.createElement('div');
          suggestionText.className = 'fiv-ai-suggestion-text';
          suggestionText.textContent = reply;
          
          // Add send button
          const sendButton = document.createElement('button');
          sendButton.className = 'fiv-ai-send-btn';
          sendButton.textContent = 'Send';
          sendButton.title = 'Send this reply to chat';
          
          // Build the element in the correct hierarchy
          suggestionElement.appendChild(suggestionText);
          suggestionElement.appendChild(sendButton);
          suggestionsContainer.appendChild(suggestionElement);
        });
      }

      // Reset carousel scroll to beginning
      const carousel = floatingAssistant.querySelector('.fiv-ai-carousel');
      if (carousel) {
        carousel.scrollLeft = 0;
      }
      
      // Set up carousel buttons with event handlers
      setupCarouselButtons();
    }
    
    // Only show and restore if not manually closed
    if (!wasManuallyClosed) {
      // Find and hide the restore button if visible
      const restoreButton = document.getElementById('fiv-ai-restore-btn');
      if (restoreButton) {
        restoreButton.style.display = 'none';
      }
      
      // Show and restore the assistant
      floatingAssistant.style.display = 'block';
      floatingAssistant.classList.remove('fiv-ai-minimized');
      
      const content = floatingAssistant.querySelector('.fiv-ai-content');
      if (content) {
        content.style.display = 'block';
        content.style.maxHeight = content.scrollHeight + 'px';
      }
      
      // Attract attention with a subtle animation
      floatingAssistant.classList.remove('fiv-ai-pulse');
      setTimeout(() => {
        floatingAssistant.classList.add('fiv-ai-pulse');
      }, 10);
    } else {
      console.log('Fiverr AI Assistant: Not showing assistant due to manual close by user');
    }
  } catch (error) {
    console.error('Fiverr AI Assistant: Error updating assistant with AI results', error);
  }
}

// Update assistant with message (no AI processing)
function updateAssistantWithMessage(messageText) {
  if (!floatingAssistant) {
    console.error('Fiverr AI Assistant: Floating assistant not found when updating with message');
    return;
  }
  
  try {
    console.log('Fiverr AI Assistant: Updating assistant with original message');
    
    // Check if assistant was manually closed
    let wasManuallyClosed = false;
    try {
      wasManuallyClosed = localStorage.getItem('fiv-ai-assistant-closed') === 'true' || window.fivAssistantManuallyClosed === true;
    } catch (error) {
      console.error('Fiverr AI Assistant: Error checking closed state', error);
    }
    
    // Always update the content even if not shown
    // Update summary
    const summaryElement = floatingAssistant.querySelector('.fiv-ai-summary-text');
    if (summaryElement) {
      summaryElement.textContent = messageText;
    }
    
    // Update suggestions
    const suggestionsContainer = floatingAssistant.querySelector('.fiv-ai-suggestions');
    if (suggestionsContainer) {
      suggestionsContainer.innerHTML = `
        <div class="fiv-ai-suggestion-placeholder">
          AI suggestions unavailable. Please check your API key in the extension settings.
        </div>
      `;
      
      // Hide carousel navigation buttons
      updateCarouselButtons(0);
    }
    
    // Only show and restore if not manually closed
    if (!wasManuallyClosed) {
      // Find and hide the restore button if visible
      const restoreButton = document.getElementById('fiv-ai-restore-btn');
      if (restoreButton) {
        restoreButton.style.display = 'none';
      }
      
      // Show and restore the assistant
      floatingAssistant.style.display = 'block';
      floatingAssistant.classList.remove('fiv-ai-minimized');
      
      const content = floatingAssistant.querySelector('.fiv-ai-content');
      if (content) {
        content.style.display = 'block';
        content.style.maxHeight = content.scrollHeight + 'px';
      }
      
      // Attract attention with a subtle animation
      floatingAssistant.classList.remove('fiv-ai-pulse');
      setTimeout(() => {
        floatingAssistant.classList.add('fiv-ai-pulse');
      }, 10);
    } else {
      console.log('Fiverr AI Assistant: Not showing assistant due to manual close by user');
    }
  } catch (error) {
    console.error('Fiverr AI Assistant: Error updating assistant with message', error);
  }
}

// Update carousel buttons visibility based on number of suggestions
function updateCarouselButtons(suggestionCount) {
  const prevBtn = floatingAssistant.querySelector('.fiv-ai-prev');
  const nextBtn = floatingAssistant.querySelector('.fiv-ai-next');
  
  if (prevBtn && nextBtn) {
    if (suggestionCount <= 1) {
      // Hide navigation buttons if there's 0 or 1 suggestion
      prevBtn.style.display = 'none';
      nextBtn.style.display = 'none';
    } else {
      // Show navigation buttons with proper styling
      prevBtn.style.display = 'flex';
      nextBtn.style.display = 'flex';
      
      // Ensure the buttons are properly positioned
      prevBtn.style.position = 'absolute';
      nextBtn.style.position = 'absolute';
      prevBtn.style.left = '-15px';
      nextBtn.style.right = '-15px';
      
      // Make buttons more visible
      prevBtn.style.zIndex = '10';
      nextBtn.style.zIndex = '10';
      prevBtn.style.backgroundColor = '#1dbf73';
      nextBtn.style.backgroundColor = '#1dbf73';
    }
  }
}

// Extract message content from various message formats
function extractMessageContent(element) {
  if (!element) return null;
  
  // Debug element
  console.log('Fiverr AI Assistant: Extracting content from element with classes:', element.className);
  
  // Try to find specific text containers first
  const messageParagraph = element.querySelector('p.qem7ddk, p.message-text, .text-content p');
  if (messageParagraph && messageParagraph.textContent.trim()) {
    const extractedText = messageParagraph.textContent.trim();
    console.log('Fiverr AI Assistant: Found message in paragraph element:', extractedText.substring(0, 30) + (extractedText.length > 30 ? '...' : ''));
    return extractedText;
  }
  
  // Get the full text content
  let content = element.textContent;
  
  try {
    // Check if there's a sender span which we should skip in extraction
    const senderSpan = element.querySelector('.sender');
    if (senderSpan) {
      // Get the text content without the sender name
      // Find all text nodes that are not within the sender span
      let textContent = '';
      
      // Use a treeWalker to get text nodes
      const treeWalker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: function(node) {
            // Skip text nodes inside the sender span
            if (senderSpan.contains(node)) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );
      
      // Collect all text content from the walker
      let node;
      while (node = treeWalker.nextNode()) {
        textContent += node.nodeValue;
      }
      
      content = textContent;
    }
    
    // Clean up the content (remove dates, sender prefixes, etc.)
    const cleanedContent = cleanMessageText(content);
    if (cleanedContent) {
      console.log('Fiverr AI Assistant: Successfully extracted message content:', cleanedContent.substring(0, 30) + (cleanedContent.length > 30 ? '...' : ''));
    } else {
      console.log('Fiverr AI Assistant: Failed to extract message content');
    }
    return cleanedContent;
  } catch (e) {
    console.error('Fiverr AI Assistant: Error extracting message content', e);
    // Return the original content if there was an error
    return cleanMessageText(content);
  }
}

// Clean message text from Fiverr's formatting
function cleanMessageText(messageText) {
  // Skip empty messages
  if (!messageText.trim()) return '';
  
  let cleanContent = messageText.trim();
  
  // Check for Fiverr's date pattern and remove it if found
  const datePattern = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s\d{1,2},\s\d{4},\s\d{1,2}:\d{2}\s(AM|PM)/i;
  const dateMatch = cleanContent.match(datePattern);
  
  if (dateMatch) {
    const dateIndex = cleanContent.indexOf(dateMatch[0]);
    if (dateIndex > 0) {
      // Extract the content after the date
      const afterDate = cleanContent.substring(dateIndex + dateMatch[0].length).trim();
      if (afterDate) {
        cleanContent = afterDate;
      } else {
        // If there's nothing after the date, use content before the date
        // and remove possible name prefix (like "Me" or "Vik K")
        const beforeDate = cleanContent.substring(0, dateIndex).trim();
        const namePrefixPattern = /^(Me|[A-Za-z\s]+)/;
        const nameMatch = beforeDate.match(namePrefixPattern);
        
        if (nameMatch && nameMatch[0]) {
          cleanContent = beforeDate.substring(nameMatch[0].length).trim();
        } else {
          cleanContent = beforeDate;
        }
      }
    }
  }
  
  // If message still has "Me" prefix, remove it
  if (cleanContent.startsWith('Me')) {
    cleanContent = cleanContent.substring(2).trim();
  }
  
  // Remove any buyer name prefix if present
  const buyerNamePattern = /^[A-Za-z\s]+:/;
  const buyerNameMatch = cleanContent.match(buyerNamePattern);
  if (buyerNameMatch && buyerNameMatch[0]) {
    cleanContent = cleanContent.substring(buyerNameMatch[0].length).trim();
  }
  
  return cleanContent;
}

// Function to find all buyer and seller messages on initial load
function processExistingMessages() {
  console.log('Fiverr AI Assistant: Processing existing messages on page load');
  
  // Try to find the buyer name/conversation ID from the page
  const buyerName = findBuyerName();
  
  // Make sure chat history is initialized before adding messages
  ensureChatHistoryInitialized(function() {
    // Try multiple selectors to find messages
    const messageSelectors = [
      '.message-content',
      '.thread-content',
      '.message-text',
      '.text-content',
      '.message-body',
      '.bubble-content',
      '[class*="message"] [class*="content"]',
      '[class*="bubble"] [class*="content"]'
    ];
    
    let allMessages = [];
    
    // Try each selector
    for (const selector of messageSelectors) {
      const messages = document.querySelectorAll(selector);
      if (messages && messages.length > 0) {
        console.log(`Fiverr AI Assistant: Found ${messages.length} messages with selector ${selector}`);
        allMessages = Array.from(messages);
        break;
      }
    }
    
    // If we didn't find any messages, try more generic approach
    if (allMessages.length === 0) {
      console.log('Fiverr AI Assistant: No messages found with specific selectors, trying generic approach');
      
      const allPotentialMessages = document.querySelectorAll('[class*="message"], [class*="bubble"], [class*="chat-item"], [class*="thread-content"]');
      if (allPotentialMessages && allPotentialMessages.length > 0) {
        // Filter to likely message elements
        allMessages = Array.from(allPotentialMessages).filter(el => {
          // Skip input fields, buttons, etc.
          if (el.tagName === 'INPUT' || el.tagName === 'BUTTON' || el.tagName === 'TEXTAREA') return false;
          
          // Check if element has non-empty text content
          return el.textContent && el.textContent.trim().length > 0;
        });
        
        console.log(`Fiverr AI Assistant: Found ${allMessages.length} potential messages using generic approach`);
      }
    }
    
    if (allMessages.length > 0) {
      // First collect all messages to process
      const messagesToProcess = [];
      const buyerMessages = []; // For AI processing
      
      allMessages.forEach(msg => {
        // Extract message content
        const extractedText = extractMessageContent(msg);
        if (!extractedText) return; // Skip empty messages
        
        // Try to determine if it's a seller or buyer message
        let sender = 'Buyer'; // Default to buyer
        
        // Check if message has a sender span
        const senderSpan = msg.querySelector('.sender');
        if (senderSpan && senderSpan.textContent) {
          sender = senderSpan.textContent.includes('Me') ? 'You' : 'Buyer';
        } else {
          // Try to determine based on class and style
          const classNames = msg.className.toLowerCase();
          if (classNames.includes('own') || 
              classNames.includes('me') || 
              classNames.includes('outgoing') || 
              classNames.includes('sent') ||
              classNames.includes('seller') ||
              classNames.includes('right')) {
            sender = 'You';
          }
        }
        
        const messageObj = {
          sender: sender,
          content: extractedText,
          buyerName: buyerName,
          element: msg // Store the element reference for detecting latest message
        };
        
        messagesToProcess.push(messageObj);
        
        // Also collect buyer messages separately for AI processing
        if (sender === 'Buyer') {
          buyerMessages.push(messageObj);
        }
      });
      
      // Log what we found
      console.log(`Fiverr AI Assistant: Processing ${messagesToProcess.length} messages (${messagesToProcess.filter(m => m.sender === 'You').length} from you, ${messagesToProcess.filter(m => m.sender === 'Buyer').length} from buyer)`);
      
      // Sort all messages by DOM position
      messagesToProcess.sort((a, b) => {
        const posA = a.element.getBoundingClientRect().top;
        const posB = b.element.getBoundingClientRect().top;
        return posA - posB;
      });
      
      // Also sort buyer messages by DOM position
      buyerMessages.sort((a, b) => {
        const posA = a.element.getBoundingClientRect().top;
        const posB = b.element.getBoundingClientRect().top;
        return posA - posB;
      });
      
      // Get the latest buyer message for AI processing
      const latestBuyerMessage = buyerMessages.length > 0 ? 
        buyerMessages[buyerMessages.length - 1] : null;
      
      // Process the latest buyer message for UI and AI
      if (latestBuyerMessage) {
        console.log('Fiverr AI Assistant: Identified latest buyer message:', 
          latestBuyerMessage.content.substring(0, 30) + (latestBuyerMessage.content.length > 30 ? '...' : ''));
        
        // Generate reply suggestions if AI is enabled
        if (enableAI && apiKey) {
          generateReplySuggestions(latestBuyerMessage.content);
        } else {
          // Just show the message as-is without AI processing
          updateLatestMessage('Buyer', latestBuyerMessage.content);
        }
      }
      
      // Remove element references before storage
      messagesToProcess.forEach(msg => {
        delete msg.element;
      });
      
      // Batch save all messages
      if (messagesToProcess.length > 0) {
        batchSaveMessages(messagesToProcess);
      }
    } else {
      console.log('Fiverr AI Assistant: No messages found on page load');
    }
  });
}

// Batch save messages to avoid race conditions
function batchSaveMessages(messages) {
  if (!messages || messages.length === 0) return;
  
  console.log(`Fiverr AI Assistant: Batch saving ${messages.length} messages`);
  
  // Check if extension context is valid before proceeding
  if (!isExtensionContextValid()) {
    console.error('Fiverr AI Assistant: Cannot save messages, extension context invalidated');
    return;
  }
  
  try {
    chrome.storage.local.get(['chatHistory'], function(result) {
      // Check for runtime errors
      if (chrome.runtime.lastError) {
        console.error('Fiverr AI Assistant: Error getting chat history for batch save', chrome.runtime.lastError);
        return;
      }
      
      // Check again if extension context is still valid
      if (!isExtensionContextValid()) {
        console.error('Fiverr AI Assistant: Extension context invalidated during batch save');
        return;
      }
      
      let chatHistory = result.chatHistory || [];
      const originalLength = chatHistory.length;
      
      // Process each message
      let newMessagesAdded = 0;
      
      messages.forEach(msg => {
        const { sender, content, buyerName } = msg;
        
        // Create timestamp with slight offsets to keep order
        const timestamp = new Date().getTime() - (messages.length - newMessagesAdded);
        
        // Check if this is a duplicate in the existing history
        const isDuplicate = chatHistory.some(existingMsg => 
          existingMsg.content.trim().toLowerCase() === content.trim().toLowerCase() && 
          existingMsg.sender === sender
        );
        
        if (!isDuplicate) {
          // Create message object
          chatHistory.push({
            sender: sender,
            content: content,
            timestamp: timestamp,
            buyerName: buyerName || null, 
            conversationId: buyerName ? `${buyerName}:${Math.floor(timestamp / 86400000)}` : null
          });
          
          newMessagesAdded++;
        }
      });
      
      // Only save if we added new messages
      if (newMessagesAdded > 0) {
        console.log(`Fiverr AI Assistant: Adding ${newMessagesAdded} new messages to history`);
        
        // Limit history size
        if (chatHistory.length > 200) {
          chatHistory = chatHistory.slice(-200);
        }
        
        // Check again if extension context is still valid before saving
        if (!isExtensionContextValid()) {
          console.error('Fiverr AI Assistant: Extension context invalidated before saving chat history');
          return;
        }
        
        // Save the updated history
        try {
          chrome.storage.local.set({ chatHistory: chatHistory }, function() {
            if (chrome.runtime.lastError) {
              console.error('Fiverr AI Assistant: Error batch saving messages:', chrome.runtime.lastError);
            } else {
              console.log(`Fiverr AI Assistant: Successfully saved batch of messages. History grew from ${originalLength} to ${chatHistory.length}`);
            }
          });
        } catch (error) {
          console.error('Fiverr AI Assistant: Error batch saving messages:', error);
        }
      } else {
        console.log('Fiverr AI Assistant: No new messages to add, all were duplicates');
      }
    });
  } catch (error) {
    console.error('Fiverr AI Assistant: Error in batch save messages:', error);
  }
}

// Find the buyer name from the page content
function findBuyerName() {
  // First, try to extract from URL as that's most reliable
  const url = window.location.href;
  if (url.includes('/inbox/')) {
    const match = url.match(/\/inbox\/([^\/]+)/);
    if (match && match[1]) {
      const urlName = decodeURIComponent(match[1]);
      // Clean up any URL encoding or special characters
      const cleanName = urlName.replace(/-/g, ' ').replace(/\+/g, ' ');
      console.log(`Fiverr AI Assistant: Found buyer name from URL: ${cleanName}`);
      return cleanName;
    }
  }
  
  // Then try to find elements with the specific class 'qem7ddk' - contains @username format
  const specificNameElements = document.querySelectorAll('span.qem7ddk, span.name');
  if (specificNameElements && specificNameElements.length > 0) {
    for (const el of specificNameElements) {
      let text = el.textContent.trim();
      
      // Check if the text has the @username format and extract username
      if (text.startsWith('@')) {
        // Remove the @ symbol to get the clean username
        text = text.substring(1);
        console.log(`Fiverr AI Assistant: Found buyer name with @ format: ${text}`);
        return text;
      }
      
      // Check for regular name format
      if (text && text.length > 0 && text !== 'Me' && !text.includes('Fiverr')) {
        console.log(`Fiverr AI Assistant: Found buyer name with specific class: ${text}`);
        return text;
      }
    }
  }
  
  // Try different selectors to find the buyer name
  const possibleSelectors = [
    '.username',
    '.buyer-name',
    '.conversation-header h1, .conversation-header h2, .conversation-header h3',
    '.conversation-with',
    '.seller-name',
    '.inbox-username',
    // More generic approaches
    'h1.username',
    'h2.username',
    'span.username',
    // Try to find any element that might contain the name
    '[class*="name"]:not([class*="user"])',
    '[class*="profile"]'
  ];
  
  for (const selector of possibleSelectors) {
    const elements = document.querySelectorAll(selector);
    if (elements && elements.length > 0) {
      // Find the element that's most likely to be the buyer name
      for (const el of elements) {
        const text = el.textContent.trim();
        if (text && text.length > 0 && text !== 'Me' && !text.includes('Fiverr')) {
          console.log(`Fiverr AI Assistant: Found potential buyer name: ${text}`);
          return text;
        }
      }
    }
  }
  
  // If no specific element found, try to extract from the page title
  const pageTitle = document.title;
  if (pageTitle && pageTitle.includes('|')) {
    const parts = pageTitle.split('|');
    if (parts.length > 1) {
      const namePart = parts[0].trim();
      if (namePart && namePart !== 'Fiverr' && !namePart.includes('Inbox')) {
        console.log(`Fiverr AI Assistant: Extracted buyer name from page title: ${namePart}`);
        return namePart;
      }
    }
  }
  
  // Fallback to timestamp-based ID if no name found
  return `Conversation-${new Date().toISOString().split('T')[0]}`;
}

// Check if extension context is still valid
function isExtensionContextValid() {
  try {
    // If we can access chrome.runtime.id, the context is valid
    return !!chrome.runtime.id;
  } catch (e) {
    console.error('Fiverr AI Assistant: Extension context invalidated', e);
    return false;
  }
}

// Function to initialize the extension
function initializeExtension() {
  try {
    console.log('Fiverr AI Assistant: Initializing extension');
    
    // Check if extension context is valid first
    if (!isExtensionContextValid()) {
      console.error('Fiverr AI Assistant: Cannot initialize, extension context invalidated');
      return;
    }
    
    // Load settings
    loadSettings();
    
    // Check if we're on a Fiverr message page
    if (window.location.href.includes('fiverr.com')) {
      console.log('Fiverr AI Assistant: On Fiverr website');
      
      // Create the floating assistant
      createFloatingAssistant();
      
      // Find and process existing messages on the page
      processExistingMessages();
      
      // Ensure chat history is initialized properly
      ensureChatHistoryInitialized();
      
      // Set up observers for new messages
      observeChatMessages();
    }
  } catch (error) {
    console.error('Fiverr AI Assistant: Error initializing extension', error);
  }
}

// Ensure chat history is properly initialized
function ensureChatHistoryInitialized(callback) {
  if (!isExtensionContextValid()) {
    console.error('Fiverr AI Assistant: Cannot initialize chat history, extension context invalidated');
    return;
  }
  
  try {
    chrome.storage.local.get(['chatHistory'], function(result) {
      if (chrome.runtime.lastError) {
        console.error('Fiverr AI Assistant: Error checking chat history initialization', chrome.runtime.lastError);
        return;
      }
      
      if (!result.chatHistory) {
        console.log('Fiverr AI Assistant: Initializing empty chat history');
        chrome.storage.local.set({ chatHistory: [] }, function() {
          if (chrome.runtime.lastError) {
            console.error('Fiverr AI Assistant: Error initializing chat history', chrome.runtime.lastError);
            return;
          }
          
          console.log('Fiverr AI Assistant: Empty chat history initialized');
          if (callback && typeof callback === 'function') {
            callback();
          }
        });
      } else {
        console.log('Fiverr AI Assistant: Chat history exists with', result.chatHistory.length, 'messages');
        if (callback && typeof callback === 'function') {
          callback();
        }
      }
    });
  } catch (error) {
    console.error('Fiverr AI Assistant: Error in ensureChatHistoryInitialized', error);
  }
}

// Run when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  console.log('Fiverr AI Assistant: DOM loaded');
  initializeExtension();
});

// Also run immediately in case DOMContentLoaded already fired
if (document.readyState === 'interactive' || document.readyState === 'complete') {
  console.log('Fiverr AI Assistant: Document already ready');
  setTimeout(initializeExtension, 500); // Small delay to ensure everything is loaded
}

// Process on page load to get existing messages
window.addEventListener('load', function() {
  console.log('Fiverr AI Assistant: Window loaded');
  // Use a timeout to make sure the page is fully rendered
  setTimeout(function() {
    processExistingMessages();
  }, 1000);
});

// Process buyer messages
function processBuyerMessages(messages) {
  if (!messages || messages.length === 0) return;
  
  console.log(`Fiverr AI Assistant: Processing ${messages.length} buyer messages`);
  
  // Check if extension context is valid before proceeding
  if (!isExtensionContextValid()) {
    console.error('Fiverr AI Assistant: Cannot process buyer messages, extension context invalidated');
    
    // Show error message in the assistant
    handleExtensionError("Could not process buyer messages due to extension context invalidation");
    return;
  }
  
  // Try to find the buyer name/conversation ID from the page
  const buyerName = findBuyerName();
  
  // Create an array to store all message info for batch processing
  const messagesToProcess = [];
  
  // Process each message
  messages.forEach(msg => {
    // Skip messages from "Me" (ensure we only process buyer messages)
    const senderSpan = msg.querySelector('.sender');
    if (senderSpan && senderSpan.textContent && senderSpan.textContent.includes('Me')) {
      console.log('Fiverr AI Assistant: Skipping "Me" message in buyer processing');
      return;
    }
    
    // Extract message content
    const content = extractMessageContent(msg);
    
    if (content && content.trim()) {
      // Check if we've already processed this message
      const contentHash = hashString(content);
      if (processedMessages.has(contentHash)) {
        console.log('Fiverr AI Assistant: Skipping already processed buyer message');
        return;
      }
      
      // Add message to processing queue
      messagesToProcess.push({
        sender: 'Buyer',
        content: content,
        buyerName: buyerName,
        element: msg, // Store the element reference for detecting latest message
        contentHash: contentHash // Store hash for message tracking
      });
    }
  });
  
  // Sort messages by DOM position (approximating timestamp order)
  messagesToProcess.sort((a, b) => {
    const posA = a.element.getBoundingClientRect().top;
    const posB = b.element.getBoundingClientRect().top;
    return posA - posB;
  });
  
  // Get the latest message (last in DOM order)
  const latestMessage = messagesToProcess.length > 0 ? 
    messagesToProcess[messagesToProcess.length - 1] : null;
  
  // Process this as the most recent message for UI and AI
  if (latestMessage) {
    console.log('Fiverr AI Assistant: Identified latest buyer message:', 
      latestMessage.content.substring(0, 30) + (latestMessage.content.length > 30 ? '...' : ''));
    
    // Generate reply suggestions if AI is enabled
    if (enableAI && apiKey) {
      try {
        // Check again if extension context is still valid before calling AI processing
        if (!isExtensionContextValid()) {
          throw new Error('Extension context invalidated before generating reply suggestions');
        }
        
        generateReplySuggestions(latestMessage.content);
      } catch (error) {
        console.error('Fiverr AI Assistant: Error generating reply suggestions', error);
        handleExtensionError(latestMessage.content);
      }
    } else {
      // Just show the message as-is without AI processing
      updateLatestMessage('Buyer', latestMessage.content);
    }
    
    // Mark the message as processed to prevent duplicates
    processedMessages.add(latestMessage.contentHash);
  }
  
  // Don't try to save messages if extension context is invalid
  if (!isExtensionContextValid()) {
    console.error('Fiverr AI Assistant: Cannot save messages, extension context invalidated');
    return;
  }
  
  // Remove element references and hashes before storage
  messagesToProcess.forEach(msg => {
    delete msg.element;
    delete msg.contentHash;
  });
  
  // Batch save all messages
  if (messagesToProcess.length > 0) {
    try {
      batchSaveMessages(messagesToProcess);
    } catch (error) {
      console.error('Fiverr AI Assistant: Error during batch save messages', error);
    }
  }
}

// Process seller messages
function processSellerMessages(messages) {
  if (!messages || messages.length === 0) return;
  
  console.log(`Fiverr AI Assistant: Processing ${messages.length} seller messages`);
  
  // Try to find the buyer name/conversation ID from the page
  const buyerName = findBuyerName();
  
  // Create an array to store all message info for batch processing
  const messagesToProcess = [];
  
  // Process each message
  messages.forEach(msg => {
    const content = extractMessageContent(msg);
    
    if (content && content.trim()) {
      // Add message to processing queue
      messagesToProcess.push({
        sender: 'You',
        content: content,
        buyerName: buyerName,
        element: msg // Store the element reference for DOM position sorting
      });
    }
  });
  
  // Sort messages by DOM position (approximating timestamp order)
  messagesToProcess.sort((a, b) => {
    const posA = a.element.getBoundingClientRect().top;
    const posB = b.element.getBoundingClientRect().top;
    return posA - posB;
  });
  
  // Remove element references before storage
  messagesToProcess.forEach(msg => {
    delete msg.element;
  });
  
  // Batch save all messages
  if (messagesToProcess.length > 0) {
    batchSaveMessages(messagesToProcess);
  }
}

// Update the UI with the latest message
function updateLatestMessage(sender, content) {
  if (!floatingAssistant) return;
  
  // Update the latest message display
  const summaryElement = floatingAssistant.querySelector('.fiv-ai-summary-text');
  if (summaryElement) {
    const cleanMessage = content.length > 120 ? content.substring(0, 117) + '...' : content;
    summaryElement.textContent = cleanMessage;
    
    // Make the assistant pulse to draw attention
    floatingAssistant.classList.remove('fiv-ai-pulse');
    setTimeout(() => {
      floatingAssistant.classList.add('fiv-ai-pulse');
    }, 10);
    
    console.log(`Fiverr AI Assistant: Updated UI with latest ${sender} message`);
  }
}

// Generate reply suggestions for a message
function generateReplySuggestions(message) {
  // Skip if AI is disabled or no API key
  if (!enableAI || !apiKey) return;
  
  // Create a hash of the message to track if it's been processed
  const messageHash = hashString(message);
  
  // Don't process if message is already processed or currently being processed
  if (processedMessages.has(messageHash) || (currentlyProcessingMessage === messageHash)) {
    console.log('Fiverr AI Assistant: Skipping already processed message');
    return;
  }
  
  // Clear any existing debounce timer
  if (messageProcessingDebounceTimer) {
    clearTimeout(messageProcessingDebounceTimer);
  }
  
  // Debounce message processing to prevent multiple rapid calls
  messageProcessingDebounceTimer = setTimeout(() => {
    // Check if extension context is still valid before proceeding
    if (!isExtensionContextValid()) {
      console.error('Fiverr AI Assistant: Cannot generate reply suggestions, extension context invalidated');
      handleExtensionError(message);
      return;
    }
    
    // Mark this message as being processed
    currentlyProcessingMessage = messageHash;
    
    console.log('Fiverr AI Assistant: Generating reply suggestions for buyer message');
    
    // Store the original message for display
    const originalMessage = message;
    
    // Temporarily update the UI with "processing" status
    const summaryElement = floatingAssistant?.querySelector('.fiv-ai-summary-text');
    if (summaryElement) {
      summaryElement.innerHTML = `
        <div class="fiv-ai-original-message">${originalMessage.length > 80 ? originalMessage.substring(0, 77) + '...' : originalMessage}</div>
        <div class="fiv-ai-simplified"><em>Processing message...</em></div>
      `;
    }
    
    // Get recent conversation history for context
    try {
      if (!isExtensionContextValid()) {
        throw new Error('Extension context invalidated');
      }
      
      chrome.storage.local.get(['chatHistory'], function(result) {
        if (chrome.runtime.lastError) {
          console.error('Fiverr AI Assistant: Error getting chat history', chrome.runtime.lastError);
          handleExtensionError(originalMessage);
          currentlyProcessingMessage = null; // Reset processing state
          return;
        }
        
        // Check again if extension context is still valid
        if (!isExtensionContextValid()) {
          console.error('Fiverr AI Assistant: Extension context invalidated during chat history retrieval');
          handleExtensionError(originalMessage);
          currentlyProcessingMessage = null;
          return;
        }
        
        const chatHistory = result.chatHistory || [];
        
        // Find the current conversation ID using buyer name
        const buyerName = findBuyerName();
        const today = Math.floor(new Date().getTime() / 86400000); // Day-based timestamp
        const conversationId = buyerName ? `${buyerName}:${today}` : null;
        
        // Get latest 10 messages from this conversation for context
        let contextMessages = [];
        
        if (conversationId) {
          contextMessages = chatHistory
            .filter(msg => msg.conversationId === conversationId)
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(-10);
          
          console.log(`Fiverr AI Assistant: Found ${contextMessages.length} context messages for conversation with ${buyerName}`);
        } else {
          // If no conversation ID, just get the most recent messages as context
          contextMessages = chatHistory
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(-10);
          
          console.log(`Fiverr AI Assistant: Using ${contextMessages.length} recent messages as context`);
        }
        
        // Format context messages for the API
        const formattedContext = contextMessages.map(msg => 
          `${msg.sender}: ${msg.content}`
        ).join('\n');
        
        // Send to background script for API processing - this avoids CORS issues and keeps API calls in background
        try {
          // Check again if extension context is still valid
          if (!isExtensionContextValid()) {
            throw new Error('Extension context invalidated before sending message to background');
          }
          
          chrome.runtime.sendMessage(
            { 
              action: 'processWithAI', 
              text: message,
              context: formattedContext
            },
            function(response) {
              // Check if the extension context is still valid
              if (chrome.runtime.lastError) {
                console.error('Fiverr AI Assistant: Runtime error', chrome.runtime.lastError);
                handleExtensionError(originalMessage);
                currentlyProcessingMessage = null; // Reset processing state
                return;
              }
              
              if (response && response.success) {
                updateAssistantWithAIResults(
                  response.data.simplifiedMessage, 
                  response.data.replyOptions,
                  originalMessage
                );
                // Mark this message as processed
                processedMessages.add(messageHash);
              } else {
                console.error('Fiverr AI Assistant: API error', response?.error || 'Unknown error');
                handleExtensionError(originalMessage);
              }
              
              // Clear the currently processing message flag
              currentlyProcessingMessage = null;
            }
          );
        } catch (error) {
          console.error('Fiverr AI Assistant: Failed to send message to background script', error);
          handleExtensionError(originalMessage);
          currentlyProcessingMessage = null; // Reset processing state
        }
      });
    } catch (error) {
      console.error('Fiverr AI Assistant: Error getting chat history', error);
      handleExtensionError(originalMessage);
      currentlyProcessingMessage = null; // Reset processing state
    }
  }, 500); // 500ms debounce delay
}

// Simple string hash function to track processed messages
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

// Handle extension errors gracefully
function handleExtensionError(originalMessage) {
  if (!floatingAssistant) return;
  
  console.log('Fiverr AI Assistant: Handling extension error');
  
  let errorMessage = 'An error occurred. Please reload the page.';
  let errorDetails = 'Try reloading the page, checking your Google Gemini API key, or reinstalling the extension.';
  
  // Check if it's a context invalidation error
  try {
    chrome.runtime.id;
  } catch (e) {
    // This is definitely a context invalidation error
    errorMessage = 'Extension context has been invalidated.';
    errorDetails = 'This typically happens after the browser was updated or the extension was reloaded. Please reload this page to restore functionality.';
  }
  
  let summaryElement = floatingAssistant.querySelector('.fiv-ai-summary-text');
  // Show error in summary area
  if (summaryElement) {
    summaryElement.innerHTML = `
      <div class="fiv-ai-original-message">${originalMessage?.length > 80 ? originalMessage.substring(0, 77) + '...' : originalMessage || 'Message processing failed'}</div>
      <div class="fiv-ai-simplified"><strong>Error:</strong> ${errorMessage}</div>
    `;
  }
  
  // Just show a placeholder in the suggestions area
  const suggestionsContainer = floatingAssistant.querySelector('.fiv-ai-suggestions');
  if (suggestionsContainer) {
    suggestionsContainer.innerHTML = `
      <div class="fiv-ai-suggestion-placeholder">
        <strong>Extension Error:</strong> ${errorDetails}
      </div>
    `;
  }
  
  // Show the assistant to make the error visible
  if (floatingAssistant.style.display === 'none') {
    floatingAssistant.style.display = 'block';
    
    // Add subtle attention animation
    floatingAssistant.classList.remove('fiv-ai-pulse');
    setTimeout(() => {
      floatingAssistant.classList.add('fiv-ai-pulse');
    }, 10);
  }
}

// Handle chat history button click
function setupChatHistoryButton() {
  const chatHistoryBtn = document.getElementById('fiv-ai-history-btn');
  if (chatHistoryBtn) {
    chatHistoryBtn.addEventListener('click', () => {
      // Open chat history in a new tab
      chrome.runtime.sendMessage({
        action: 'openChatHistory'
      });
    });
  }
}

// ... existing code ...

// Add event listeners for buttons
function attachEventListeners() {
  // ... existing code ...
  
  // Setup chat history button
  setupChatHistoryButton();
  
  // ... existing code ...
}

// Make the assistant draggable by header
function setupDragging() {
  const assistant = document.getElementById('fiv-ai-floating-assistant');
  const header = document.getElementById('fiv-ai-header');
  
  if (!assistant || !header) return;
  
  let isDragging = false;
  let offsetX, offsetY;
  
  header.addEventListener('mousedown', function(e) {
    // Don't start drag if clicked on a button
    if (e.target.tagName === 'BUTTON') return;
    
    isDragging = true;
    
    // Calculate the offset of the mouse position relative to the assistant position
    const assistantRect = assistant.getBoundingClientRect();
    offsetX = e.clientX - assistantRect.left;
    offsetY = e.clientY - assistantRect.top;
    
    // Prevent text selection during drag
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', function(e) {
    if (!isDragging) return;
    
    // Calculate new position
    const x = e.clientX - offsetX;
    const y = e.clientY - offsetY;
    
    // Set new position
    assistant.style.left = `${x}px`;
    assistant.style.top = `${y}px`;
    
    // Remove bottom/right positioning if set
    assistant.style.bottom = 'auto';
    assistant.style.right = 'auto';
  });
  
  document.addEventListener('mouseup', function() {
    isDragging = false;
  });
}

// Setup carousel buttons with proper event handlers
function setupCarouselButtons() {
  if (!floatingAssistant) {
    console.error('Fiverr AI Assistant: floatingAssistant is null when setting up carousel buttons');
    return;
  }
  
  console.log('Setting up carousel buttons');
  
  // Get the carousel element
  const carousel = floatingAssistant.querySelector('.fiv-ai-carousel');
  const prevBtn = floatingAssistant.querySelector('.fiv-ai-prev');
  const nextBtn = floatingAssistant.querySelector('.fiv-ai-next');
  
  if (!carousel || !prevBtn || !nextBtn) {
    console.error('Fiverr AI Assistant: Carousel elements not found', {
      carousel: carousel ? 'Found' : 'Not found',
      prevBtn: prevBtn ? 'Found' : 'Not found',
      nextBtn: nextBtn ? 'Found' : 'Not found',
      floatingAssistantHTML: floatingAssistant.innerHTML.substring(0, 100) + '...'
    });
    return;
  }
  
  console.log('Fiverr AI Assistant: Carousel buttons found', { 
    prevBtn: prevBtn.outerHTML,
    nextBtn: nextBtn.outerHTML 
  });
  
  // Remove any existing listeners to prevent duplicates
  const newPrevBtn = prevBtn.cloneNode(true);
  const newNextBtn = nextBtn.cloneNode(true);
  
  prevBtn.parentNode.replaceChild(newPrevBtn, prevBtn);
  nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
  
  // Add click event listeners
  newPrevBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    console.log('Previous button clicked');
    const containerWidth = carousel.clientWidth;
    carousel.scrollBy({ left: -containerWidth, behavior: 'smooth' });
  });
  
  newNextBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    console.log('Next button clicked');
    const containerWidth = carousel.clientWidth;
    carousel.scrollBy({ left: containerWidth, behavior: 'smooth' });
  });
  
  // Make sure the buttons are visible if there are multiple suggestions
  const suggestions = carousel.querySelectorAll('.fiv-ai-suggestion');
  console.log(`Fiverr AI Assistant: Found ${suggestions.length} suggestions`);
  
  if (suggestions.length > 1) {
    newPrevBtn.style.display = 'flex';
    newNextBtn.style.display = 'flex';
    console.log('Fiverr AI Assistant: Showing carousel buttons for multiple suggestions');
  } else {
    newPrevBtn.style.display = 'none';
    newNextBtn.style.display = 'none';
    console.log('Fiverr AI Assistant: Hiding carousel buttons for single suggestion');
  }
}