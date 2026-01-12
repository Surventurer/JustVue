// Code snippets storage
let codeSnippets = [];

// Hide content feature variables
let unlockedSnippets = new Set(); // Track which snippets are unlocked in this session
let decryptedContent = new Map(); // Cache decrypted content

// ===== Encryption/Decryption Functions =====

// Simple encryption using AES-like algorithm (XOR-based for simplicity)
function encryptContent(text, password) {
    const key = generateKey(password);
    let encrypted = '';
    for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
        encrypted += String.fromCharCode(charCode);
    }
    return btoa(encrypted); // Base64 encode
}

function decryptContent(encryptedText, password) {
    try {
        const key = generateKey(password);
        const encrypted = atob(encryptedText); // Base64 decode
        let decrypted = '';
        for (let i = 0; i < encrypted.length; i++) {
            const charCode = encrypted.charCodeAt(i) ^ key.charCodeAt(i % key.length);
            decrypted += String.fromCharCode(charCode);
        }
        return decrypted;
    } catch (e) {
        return null; // Decryption failed
    }
}

function generateKey(password) {
    // Create a longer key from password
    let key = password;
    while (key.length < 256) {
        key += password;
    }
    return key;
}

// DOM elements
const searchInput = document.getElementById('searchInput');
const passwordInput = document.getElementById('passwordInput');
const titleInput = document.getElementById('titleInput');
const codeInput = document.getElementById('codeInput');
const addBtn = document.getElementById('addBtn');
const codeList = document.getElementById('codeList');
const hideContentToggle = document.getElementById('hideContentToggle');

// Initialize app
initializeApp();

// Add event listener for Add button
addBtn.addEventListener('click', addCode);

// Add event listener for search input
searchInput.addEventListener('input', renderCodeList);

// Add event listener for Enter key in password (Enter to focus on title)
passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        titleInput.focus();
    }
});

// Add event listener for Enter key in title (Enter to focus on code)
titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        codeInput.focus();
    }
});

// Add event listener for Enter key (Ctrl/Cmd + Enter to add)
codeInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        addCode();
    }
});

// Add code function
function addCode() {
    const password = passwordInput.value.trim();
    const title = titleInput.value.trim();
    const code = codeInput.value.trim();
    const hideContent = hideContentToggle.checked;
    
    if (password === '') {
        alert('Please enter a password!');
        passwordInput.focus();
        return;
    }
    
    if (title === '') {
        alert('Please enter a title!');
        titleInput.focus();
        return;
    }
    
    if (code === '') {
        alert('Please enter some code!');
        codeInput.focus();
        return;
    }
    
    const snippet = {
        id: Date.now(),
        title: title,
        code: hideContent ? encryptContent(code, password) : code, // Encrypt if hidden
        password: password,
        timestamp: new Date().toLocaleString(),
        hidden: hideContent,
        isEncrypted: hideContent // Flag to know if code is encrypted
    };
    
    codeSnippets.unshift(snippet);
    passwordInput.value = '';
    titleInput.value = '';
    codeInput.value = '';
    hideContentToggle.checked = false;
    passwordInput.focus();
    
    renderCodeList();
    saveToDatabaseJSON();
}

// Delete code function
async function deleteCode(id) {
    console.log('Delete called with ID:', id, 'Type:', typeof id);
    
    const snippet = codeSnippets.find(s => s.id === id);
    
    if (!snippet) {
        console.log('Snippet not found. Available IDs:', codeSnippets.map(s => s.id));
        alert('❌ Snippet not found!');
        return;
    }
    
    console.log('Found snippet:', snippet.title);
    
    const enteredPassword = prompt('Enter password to delete this snippet:');
    
    if (enteredPassword === null) {
        return; // User cancelled
    }
    
    if (enteredPassword !== snippet.password) {
        alert('❌ Incorrect password! Cannot delete snippet.');
        return;
    }
    
    if (!confirm('⚠️ Are you sure you want to delete this snippet? This action cannot be undone.')) {
        return;
    }
    
    console.log('Deleting snippet from array...');
    
    // Remove from local array
    const beforeLength = codeSnippets.length;
    codeSnippets = codeSnippets.filter(s => s.id !== id);
    const afterLength = codeSnippets.length;
    
    console.log('Array length before:', beforeLength, 'after:', afterLength);
    
    // Remove from unlocked cache if present
    unlockedSnippets.delete(id);
    decryptedContent.delete(id);
    
    // Update GUI immediately
    renderCodeList();
    
    // Save to database
    try {
        console.log('Saving to database...');
        await saveToDatabaseJSON();
        console.log('Successfully saved to database');
        
        // Show success feedback briefly
        const tempDiv = document.createElement('div');
        tempDiv.style.cssText = 'position:fixed;top:20px;right:20px;background:#4CAF50;color:white;padding:15px 25px;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,0.1);z-index:10000;font-family:Arial,sans-serif;';
        tempDiv.textContent = '✓ Snippet deleted from database!';
        document.body.appendChild(tempDiv);
        setTimeout(() => tempDiv.remove(), 2000);
    } catch (error) {
        console.error('Error saving to database:', error);
        alert('⚠️ Error: Snippet removed from display but failed to save to database. Please refresh the page.');
        // Reload from database to restore correct state
        await loadFromDatabaseJSON();
        renderCodeList();
    }
}

// Copy to clipboard function
function copyToClipboard(id, code, button) {
    const snippet = codeSnippets.find(s => s.id === id);
    let contentToCopy = code;
    
    // Check if snippet is encrypted and needs decryption
    if (snippet && snippet.isEncrypted) {
        // Check if already decrypted in cache
        if (decryptedContent.has(id)) {
            contentToCopy = decryptedContent.get(id);
        } else {
            // Need password to decrypt
            const enteredPassword = prompt('Enter password to copy:');
            
            if (enteredPassword === null) {
                return; // User cancelled
            }
            
            // Try to decrypt
            const decrypted = decryptContent(snippet.code, enteredPassword);
            if (!decrypted) {
                alert('Incorrect password! Cannot copy content.');
                return;
            }
            
            contentToCopy = decrypted;
            // Don't cache it since we're not unlocking the view
        }
    }
    
    navigator.clipboard.writeText(contentToCopy).then(() => {
        const originalText = button.textContent;
        button.textContent = '✓ Copied!';
        button.classList.add('copied');
        
        setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('copied');
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard');
    });
}

// Render code list
function renderCodeList() {
    if (codeSnippets.length === 0) {
        codeList.innerHTML = '<div class="empty-state">No code snippets yet. Add your first snippet above!</div>';
        return;
    }
    
    // Get search query
    const searchQuery = searchInput.value.trim().toLowerCase();
    
    // Filter snippets based on search query
    const filteredSnippets = searchQuery === '' 
        ? codeSnippets 
        : codeSnippets.filter(snippet => 
            snippet.title.toLowerCase().includes(searchQuery)
          );
    
    // Check if no results found
    if (filteredSnippets.length === 0) {
        codeList.innerHTML = '<div class="no-results">No snippets found matching your search.</div>';
        return;
    }
    
    codeList.innerHTML = filteredSnippets.map(snippet => {
        // Highlight search term in title
        const highlightedTitle = searchQuery === ''
            ? escapeHtml(snippet.title)
            : highlightText(escapeHtml(snippet.title), searchQuery);
        
        // Determine if content should be protected
        const isProtected = snippet.hidden && !unlockedSnippets.has(snippet.id);
        const contentClass = isProtected ? 'code-content protected' : 'code-content';
        
        // Get the display content (decrypted if unlocked, encrypted if locked)
        let displayContent = snippet.code;
        if (snippet.isEncrypted && unlockedSnippets.has(snippet.id)) {
            // Show decrypted content if unlocked
            displayContent = decryptedContent.get(snippet.id) || snippet.code;
        }
        
        // Create eye button for hidden content (both locked and unlocked)
        let eyeButton = '';
        if (snippet.hidden) {
            if (isProtected) {
                // Locked - show closed eye
                eyeButton = `<button class="eye-unlock-btn" data-action="unlock" data-id="${snippet.id}">
                    <span class="eye-text">Unlock</span>
                </button>`;
            } else {
                // Unlocked - show open eye to hide again
                eyeButton = `<button class="eye-unlock-btn" data-action="lock" data-id="${snippet.id}">
                    <span class="eye-text">Hide</span>
                </button>`;
            }
        }
        
        return `
            <div class="code-item" data-snippet-id="${snippet.id}">
                <div class="code-title">${highlightedTitle}</div>
                <div class="timestamp">Added: ${snippet.timestamp}</div>
                <div class="code-content-wrapper">
                    ${eyeButton}
                    <div class="${contentClass}">${escapeHtml(displayContent)}</div>
                </div>
                <div class="code-actions">
                    <button class="btn btn-copy" data-action="copy" data-id="${snippet.id}" data-content="${escapeForJS(displayContent)}">
                        📋 Copy to Clipboard
                    </button>
                    <button class="btn btn-delete" data-action="delete" data-id="${snippet.id}">
                        🗑️ Delete
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Event delegation for buttons
codeList.addEventListener('click', async function(e) {
    const button = e.target.closest('button[data-action]');
    if (!button) return;
    
    const action = button.dataset.action;
    const id = parseInt(button.dataset.id, 10);
    
    if (action === 'delete') {
        await deleteCode(id);
    } else if (action === 'copy') {
        const snippet = codeSnippets.find(s => s.id === id);
        if (snippet) {
            const displayContent = button.dataset.content || snippet.code;
            copyToClipboard(id, displayContent, button);
        }
    } else if (action === 'unlock') {
        unlockContent(id);
    } else if (action === 'lock') {
        lockContent(id);
    }
});

// Highlight matching text in search results
function highlightText(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
    return text.replace(regex, '<span class="highlight">$1</span>');
}

// Escape special regex characters
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Escape for JavaScript string
function escapeForJS(text) {
    return text.replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

// ===== Hide Content Feature =====

// Unlock content (called when clicking on protected content)
function unlockContent(id) {
    const snippet = codeSnippets.find(s => s.id === id);
    if (!snippet) return;
    
    const enteredPassword = prompt('Enter password to view content:');
    
    if (enteredPassword === null) {
        return; // User cancelled
    }
    
    // Try to decrypt the content
    if (snippet.isEncrypted) {
        const decrypted = decryptContent(snippet.code, enteredPassword);
        if (!decrypted) {
            alert('Incorrect password! Content remains hidden.');
            return;
        }
        // Cache the decrypted content
        decryptedContent.set(id, decrypted);
    }
    
    // Unlock this snippet for this session
    unlockedSnippets.add(id);
    renderCodeList();
}

// Lock content (hide again)
function lockContent(id) {
    // Remove from unlocked set to hide it again
    unlockedSnippets.delete(id);
    // Clear decrypted cache
    decryptedContent.delete(id);
    renderCodeList();
}

// Initial render
renderCodeList();

// ===== Database Storage Functions =====

// ===== Database Storage Functions =====

let isSaving = false;
let saveQueue = [];

// Save to database only
async function saveToDatabaseJSON() {
    // If already saving, wait for it to finish then save again
    if (isSaving) {
        return new Promise((resolve, reject) => {
            saveQueue.push({ resolve, reject });
        });
    }
    
    isSaving = true;
    
    try {
        const response = await fetch('/.netlify/functions/save-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(codeSnippets)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to save data: ${errorText}`);
        }
        
        // Process queued saves
        if (saveQueue.length > 0) {
            const queued = saveQueue.slice();
            saveQueue = [];
            isSaving = false;
            
            // Save again with the latest data
            try {
                await saveToDatabaseJSON();
                queued.forEach(q => q.resolve());
            } catch (error) {
                queued.forEach(q => q.reject(error));
            }
        }
    } catch (error) {
        console.error('Error saving:', error);
        alert('⚠️ Failed to save data to database. Please try again.');
        throw error;
    } finally {
        isSaving = false;
    }
}

// Load from database only
async function loadFromDatabaseJSON() {
    try {
        const response = await fetch('/.netlify/functions/get-data');
        
        if (response.ok) {
            const data = await response.json();
            
            if (Array.isArray(data) && data.length > 0) {
                codeSnippets = data;
            }
        } else {
            console.error('Failed to load data from database');
        }
    } catch (error) {
        console.error('Error loading from database:', error);
        alert('⚠️ Failed to load data from database. Please check your connection.');
    }
}

// Initialize the app
async function initializeApp() {
    await loadFromDatabaseJSON();
    renderCodeList();
}