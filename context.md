# Chrome Extension: AI Chat Assistant for Fiverr

## 🔹 Overview
This Chrome Extension is designed to assist freelancers on **Fiverr** by tracking chat messages and providing AI-generated **message summaries** and **reply suggestions** using OpenAI GPT-4o.  

📌 **Note:** Currently, this extension is built **exclusively for Fiverr**, but future updates will support additional freelancing platforms.  

---

## 🔹 Extension Functionality

### **1️⃣ Extract Chat Messages from Fiverr**
- The extension will monitor Fiverr's **chat window**.
- It will detect new messages using **MutationObserver**.
- Extract messages from the **Fiverr chat DOM structure**.

### **2️⃣ Store Chat History Using Chrome Storage**
- Chats will be stored using **Chrome Storage API** instead of a backend (for now).  
- Messages will be saved locally and retrieved when needed.  
- Future versions may integrate with **Django + PostgreSQL**.

### **3️⃣ Display Floating AI Chat Assistant**
- A **floating AI assistant** will appear inside Fiverr's chat window.
- It will contain:
  - **Latest received message** (simplified in easy English).
  - **AI-generated reply suggestions**.
  - **Input box** to customize the AI-generated reply before sending.

### **4️⃣ AI Message Summarization & Reply Generation**
- When a new message arrives:
  - The message will be **sent to OpenAI GPT-4o** via API.
  - AI will return a **simplified version of the message**.
  - AI will generate a **reply suggestion**.
- The AI-generated reply will be displayed inside the **floating chat assistant**.

### **5️⃣ UI Components**
#### **Floating Assistant UI**
- A small **draggable box** inside Fiverr's chat window.
- Contains:
  - **User's latest message** (simplified in easy English).
  - **Three AI-generated reply options**.
  - A **textarea** for manual reply editing.
  - A **"Copy Reply" button** to copy AI-generated responses.

#### **Popup UI**
- Clicking the extension icon opens a **popup window**.
- Displays:
  - **Recent chat history** (retrieved from Chrome Storage).
  - **Settings panel** (toggle AI features, API key input, etc.).
  - **"View Full Chat"** button (opens complete chat history).

### **6️⃣ API Calls to OpenAI**
- `POST https://api.openai.com/v1/chat/completions` → Get AI-generated summaries and replies.

---

## 🔹 Tech Stack
### **Frontend (Chrome Extension)**
✅ Vanilla JavaScript  
✅ HTML + CSS  
✅ Chrome Extensions API (Manifest V3)  
✅ **Chrome Storage API** for local chat storage  

### **Backend (AI API)**
✅ OpenAI GPT-4o (for summarization & replies)  

---

## 🔹 Next Steps
- **Step 1:** Build the basic extension UI (floating assistant + popup).  
- **Step 2:** Extract chat messages from Fiverr using content scripts.  
- **Step 3:** Store chat messages in Chrome Storage.  
- **Step 4:** Implement AI summarization & reply generation.  

---

## 🔹 Future Plans
🔹 Expand support for **other freelancing platforms** (Upwork, Freelancer, etc.).  
🔹 Implement **Django backend + PostgreSQL** for cloud-based chat storage.  
🔹 Add **personalized AI tone settings** to match the user’s response style.  

---

**Note:** This file is structured to guide AI in Cursor to generate code accordingly. Ensure AI focuses on **UI & API integration first**, then chat storage.  
