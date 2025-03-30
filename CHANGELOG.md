# Changelog

All notable changes to the AI Chat Assistant for Fiverr will be documented in this file.

## [Unreleased]

### Added
- Added conversation context to message simplification, allowing for more accurate simplifications based on conversation history
- Both message simplification and reply options now use up to 10 messages of conversation history as context
- Added search functionality to chat history page
- Added export button for chat history
- Added robust error handling for extension context invalidation
- Added isExtensionContextValid() function to prevent errors when extension is reloaded
- Conversation context for message simplification
- Search functionality for chat history
- Robust error handling for API calls
- Button to access chat history from main UI
- Dark/light mode detection and theme adaptation
- Clearer empty states for the extension

### Changed
- Improved message simplification prompt to focus on explaining what the client is saying and what they want the freelancer to do
- Enhanced reply options prompt to generate more casual, friendly, and impactful messages that are short but effective
- Updated system prompts to provide more specific guidance to the AI
- Completely redesigned chat history UI to match Fiverr's design system, including fonts, colors and styling
- Added Font Awesome icons for improved visual experience
- Improved empty states and visual hierarchy
- Made all Chrome API calls more robust with try/catch blocks and error handling
- Switched from OpenAI API to Google Gemini API for all AI features
  - Implemented direct API calls to Google Gemini 1.5 Pro model
  - Updated UI to reference Google Gemini instead of OpenAI
  - Improved prompt handling to work with Google's API structure
  - Added custom implementation for service worker compatibility
- Improved minimize functionality to show a dedicated restore button when assistant is minimized
- Improved message simplification prompt for better clarity
- Enhanced reply options for more casual and impactful messaging
- Updated system prompts to provide specific guidance to AI
- Complete redesign of UI to match Fiverr's design system
- Enhanced visual elements, including fonts and colors
- Added Font Awesome icons for better visual experience
- Improved empty states and visual hierarchy
- Robust error handling for Chrome API calls
- Transitioned from OpenAI API to Google Gemini API
  - Direct API calls to Google Gemini 1.5 Pro
  - Updated UI references
- Improved minimize functionality including a restore button when assistant is minimized

### Fixed
- Fixed "ReferenceError: contextString is not defined" bug in the background script
- Standardized token limits for consistency between different API calls
- Fixed "Extension context invalidated" errors by adding proper error handling
- Added graceful degradation when extension context is lost
- Improved error messaging to guide users when extension errors occur
- Removed redundant OpenAI API call functions from content.js, ensuring all API calls go through background.js
- Fixed architectural issue by ensuring all API calls go through background.js
- Fixed minimize functionality issues causing the button not to respond
- Improved minimize/restore UI transition and positioning
- Fixed issue where assistant box remained visible after minimizing
- Fixed close button functionality to properly and permanently close the assistant
- Enhanced error handling for "Extension context invalidated" errors with detailed user guidance
- Added multiple validation checks throughout message processing workflow to properly handle extension context issues

## [1.0.0] - Initial Release

### Features
- Message tracking in Fiverr chat windows
- Message simplification using OpenAI GPT-4o
- Reply suggestions with three different professional options
- Floating, draggable assistant UI
- Chat history storage and review
- Export feature for chat history 