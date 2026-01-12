// Code snippets storage
let codeSnippets = [];

// Hide content feature variables
let unlockedSnippets = new Set(); // Track which snippets are unlocked in this session
let decryptedContent = new Map(); // Cache decrypted content

// ===== Encryption/Decryption Functions =====

// Simple encryption using XOR-based algorithm with Unicode support
function encryptContent(text, password) {
    try {
        // Convert Unicode text to UTF-8 bytes, then encrypt
        const utf8Text = encodeURIComponent(text);
        const key = generateKey(password);
        let encrypted = '';
        
        for (let i = 0; i < utf8Text.length; i++) {
            const charCode = utf8Text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
            encrypted += String.fromCharCode(charCode);
        }
        
        // Convert binary string to base64
        return btoa(encrypted);
    } catch (e) {
        console.error('Encryption error:', e);
        return null;
    }
}

function decryptContent(encryptedText, password) {
    try {
        const key = generateKey(password);
        // Decode base64 to binary string
        const encrypted = atob(encryptedText);
        let decrypted = '';
        
        for (let i = 0; i < encrypted.length; i++) {
            const charCode = encrypted.charCodeAt(i) ^ key.charCodeAt(i % key.length);
            decrypted += String.fromCharCode(charCode);
        }
        
        // Convert UTF-8 bytes back to Unicode text
        return decodeURIComponent(decrypted);
    } catch (e) {
        console.error('Decryption error:', e);
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
const fileInput = document.getElementById('fileInput');
const filePreview = document.getElementById('filePreview');
const fileUploadArea = document.getElementById('fileUploadArea');
const fileSelectBtn = document.getElementById('fileSelectBtn');
const addBtn = document.getElementById('addBtn');
const codeList = document.getElementById('codeList');
const hideContentToggle = document.getElementById('hideContentToggle');

// Content type management
let selectedFile = null;
let selectedContentType = 'text';

// Content type selector handler
document.querySelectorAll('input[name="contentType"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        selectedContentType = e.target.value;
        updateInputVisibility();
    });
});

// File select button handler
fileSelectBtn.addEventListener('click', () => {
    fileInput.click();
});

// File input handler
fileInput.addEventListener('change', handleFileSelect);

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    selectedFile = file;
    
    // Show preview
    const reader = new FileReader();
    reader.onload = (event) => {
        filePreview.style.display = 'block';
        
        if (file.type.startsWith('image/')) {
            filePreview.innerHTML = `
                <div class="file-preview-container">
                    <img src="${event.target.result}" alt="Preview" style="max-width: 100%; max-height: 200px;">
                    <p>📁 ${file.name} (${(file.size / 1024).toFixed(2)} KB)</p>
                    <button type="button" onclick="clearFileSelection()" class="btn-clear-file">✕ Remove</button>
                </div>
            `;
        } else if (file.type === 'application/pdf') {
            filePreview.innerHTML = `
                <div class="file-preview-container">
                    <p>📄 ${file.name} (${(file.size / 1024).toFixed(2)} KB)</p>
                    <button type="button" onclick="clearFileSelection()" class="btn-clear-file">✕ Remove</button>
                </div>
            `;
        }
    };
    reader.readAsDataURL(file);
}

function clearFileSelection() {
    selectedFile = null;
    fileInput.value = '';
    filePreview.style.display = 'none';
    filePreview.innerHTML = '';
}

function updateInputVisibility() {
    console.log('Updating visibility, selectedContentType:', selectedContentType);
    
    if (selectedContentType === 'text') {
        codeInput.style.display = 'block';
        fileUploadArea.style.display = 'none';
        clearFileSelection();
        console.log('Showing text area, hiding file upload');
    } else {
        codeInput.style.display = 'none';
        fileUploadArea.style.display = 'block';
        fileInput.accept = selectedContentType === 'image' ? 'image/*' : '.pdf';
        console.log('Hiding text area, showing file upload');
    }
}

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
async function addCode() {
    const password = passwordInput.value.trim();
    const title = titleInput.value.trim();
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
    
    let content = '';
    let contentType = selectedContentType;
    
    // Handle different content types
    if (contentType === 'text') {
        const code = codeInput.value.trim();
        if (code === '') {
            alert('Please enter some text/code!');
            codeInput.focus();
            return;
        }
        content = code;
    } else if (contentType === 'image' || contentType === 'pdf') {
        if (!selectedFile) {
            alert('Please select a file!');
            return;
        }
        
        // Read file as base64
        try {
            content = await readFileAsBase64(selectedFile);
        } catch (error) {
            alert('Failed to read file!');
            console.error(error);
            return;
        }
    }
    
    const snippet = {
        id: Date.now(),
        title: title,
        contentType: contentType,
        content: hideContent ? encryptContent(content, password) : content,
        fileName: selectedFile ? selectedFile.name : null,
        fileType: selectedFile ? selectedFile.type : null,
        password: password,
        timestamp: new Date().toLocaleString(),
        hidden: hideContent,
        isEncrypted: hideContent
    };
    
    codeSnippets.unshift(snippet);
    
    // Reset form
    passwordInput.value = '';
    titleInput.value = '';
    codeInput.value = '';
    hideContentToggle.checked = false;
    clearFileSelection();
    document.querySelector('input[name="contentType"][value="text"]').checked = true;
    selectedContentType = 'text';
    updateInputVisibility();
    passwordInput.focus();
    
    renderCodeList();
    saveToDatabaseJSON();
}

// Helper function to read file as base64
function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Delete code function
async function deleteCode(id) {
    console.log('Delete called with ID:', id, 'Type:', typeof id);
    console.log('All snippet IDs:', codeSnippets.map(s => ({ id: s.id, type: typeof s.id })));
    
    // Use loose comparison (==) to match both string and number types
    const snippet = codeSnippets.find(s => s.id == id);
    
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
    
    // Remove from local array using loose comparison
    const beforeLength = codeSnippets.length;
    codeSnippets = codeSnippets.filter(s => s.id != id);
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
function copyToClipboard(id, button) {
    const snippet = codeSnippets.find(s => s.id == id);
    
    if (!snippet) {
        alert('❌ Snippet not found!');
        return;
    }
    
    // Use content property or fallback to code for backward compatibility
    let contentToCopy = snippet.content || snippet.code || '';
    
    // Check if snippet is encrypted and needs decryption
    if (snippet.isEncrypted) {
        // Check if already decrypted in cache (snippet is unlocked)
        if (decryptedContent.has(id)) {
            contentToCopy = decryptedContent.get(id);
        } else {
            // Need password to decrypt
            const enteredPassword = prompt('🔒 Enter password to copy:');
            
            if (enteredPassword === null) {
                return; // User cancelled
            }
            
            if (enteredPassword !== snippet.password) {
                alert('❌ Incorrect password! Cannot copy content.');
                return;
            }
            
            // Try to decrypt with the correct password
            const decrypted = decryptContent(contentToCopy, enteredPassword);
            if (!decrypted) {
                alert('❌ Failed to decrypt content!');
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

// Download file function (for images and PDFs)
function downloadFile(id) {
    const snippet = codeSnippets.find(s => s.id == id);
    
    if (!snippet) {
        alert('❌ Snippet not found!');
        return;
    }
    
    let fileContent = snippet.content || snippet.code || '';
    
    // Check if snippet is encrypted and needs decryption
    if (snippet.isEncrypted) {
        // Check if already decrypted in cache
        if (decryptedContent.has(id)) {
            fileContent = decryptedContent.get(id);
        } else {
            // Need password to decrypt
            const enteredPassword = prompt('🔒 Enter password to download:');
            
            if (enteredPassword === null) {
                return; // User cancelled
            }
            
            if (enteredPassword !== snippet.password) {
                alert('❌ Incorrect password! Cannot download file.');
                return;
            }
            
            // Try to decrypt
            const decrypted = decryptContent(fileContent, enteredPassword);
            if (!decrypted) {
                alert('❌ Failed to decrypt file!');
                return;
            }
            
            fileContent = decrypted;
        }
    }
    
    // Create download link
    const link = document.createElement('a');
    link.href = fileContent;
    link.download = snippet.fileName || `file-${snippet.id}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Render code list
function renderCodeList() {
    if (codeSnippets.length === 0) {
        codeList.innerHTML = '<div class="empty-state">No snippets yet. Add your first snippet above!</div>';
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
        // Support both old 'code' and new 'content' properties
        const contentType = snippet.contentType || 'text';
        const rawContent = snippet.content || snippet.code || '';
        
        // Highlight search term in title
        const highlightedTitle = searchQuery === ''
            ? escapeHtml(snippet.title)
            : highlightText(escapeHtml(snippet.title), searchQuery);
        
        // Determine if content should be protected
        const isProtected = snippet.hidden && !unlockedSnippets.has(snippet.id);
        
        // Get the display content (decrypted if unlocked, encrypted if locked)
        let displayContent = rawContent;
        if (snippet.isEncrypted && unlockedSnippets.has(snippet.id)) {
            displayContent = decryptedContent.get(snippet.id) || rawContent;
        }
        
        // Render content based on type
        let contentHtml = '';
        const contentClass = isProtected ? 'snippet-content protected' : 'snippet-content';
        
        if (contentType === 'image') {
            if (isProtected) {
                contentHtml = `<div class="${contentClass}">🔒 Image is hidden</div>`;
            } else {
                contentHtml = `<div class="${contentClass}">
                    <img src="${displayContent}" alt="${escapeHtml(snippet.fileName || 'Image')}" style="max-width: 100%; border-radius: 8px;">
                    ${snippet.fileName ? `<p class="file-name">📷 ${escapeHtml(snippet.fileName)}</p>` : ''}
                </div>`;
            }
        } else if (contentType === 'pdf') {
            if (isProtected) {
                contentHtml = `<div class="${contentClass}">🔒 PDF is hidden</div>`;
            } else {
                contentHtml = `<div class="${contentClass}">
                    <div class="pdf-container">
                        <embed src="${displayContent}" type="application/pdf" width="100%" height="400px" />
                        <p class="file-name">📄 ${escapeHtml(snippet.fileName || 'Document.pdf')}</p>
                    </div>
                </div>`;
            }
        } else {
            // Text/code content
            if (isProtected) {
                contentHtml = `<div class="code-content protected">🔒 Content is hidden</div>`;
            } else {
                contentHtml = `<div class="code-content">${escapeHtml(displayContent)}</div>`;
            }
        }
        
        // Create eye button for hidden content
        let eyeButton = '';
        if (snippet.hidden) {
            if (isProtected) {
                eyeButton = `<button class="eye-unlock-btn" data-action="unlock" data-id="${snippet.id}">
                    <span class="eye-text">🔓 Unlock</span>
                </button>`;
            } else {
                eyeButton = `<button class="eye-unlock-btn" data-action="lock" data-id="${snippet.id}">
                    <span class="eye-text">🔒 Hide</span>
                </button>`;
            }
        }
        
        // Content type badge
        let typeBadge = '';
        if (contentType === 'image') {
            typeBadge = '<span class="type-badge">🖼️ Image</span>';
        } else if (contentType === 'pdf') {
            typeBadge = '<span class="type-badge">📄 PDF</span>';
        } else {
            typeBadge = '<span class="type-badge">📝 Text</span>';
        }
        
        // Action buttons
        let actionButtons = '';
        if (contentType === 'text') {
            actionButtons = `<button class="btn btn-copy" data-action="copy" data-id="${snippet.id}">
                📋 Copy
            </button>`;
        } else {
            actionButtons = `<button class="btn btn-download" data-action="download" data-id="${snippet.id}">
                💾 Download
            </button>`;
        }
        
        return `
            <div class="code-item" data-snippet-id="${snippet.id}">
                <div class="snippet-header">
                    <div class="code-title">${highlightedTitle}</div>
                    ${typeBadge}
                </div>
                <div class="timestamp">Added: ${snippet.timestamp}</div>
                <div class="code-content-wrapper">
                    ${eyeButton}
                    ${contentHtml}
                </div>
                <div class="code-actions">
                    ${actionButtons}
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
    // Keep ID as string first, then try to match
    const idStr = button.dataset.id;
    const idNum = parseInt(idStr, 10);
    
    // Find snippet with either string or number comparison
    let snippet = codeSnippets.find(s => s.id == idStr || s.id === idNum);
    
    if (action === 'delete') {
        if (!snippet) {
            console.error('Cannot find snippet with ID:', idStr, idNum);
            console.log('Available snippets:', codeSnippets.map(s => ({ id: s.id, type: typeof s.id, title: s.title })));
        }
        await deleteCode(snippet ? snippet.id : idNum);
    } else if (action === 'copy') {
        if (snippet) {
            copyToClipboard(snippet.id, button);
        }
    } else if (action === 'download') {
        if (snippet) {
            downloadFile(snippet.id);
        }
    } else if (action === 'unlock') {
        unlockContent(snippet ? snippet.id : idNum);
    } else if (action === 'lock') {
        lockContent(snippet ? snippet.id : idNum);
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
    const snippet = codeSnippets.find(s => s.id == id);
    if (!snippet) return;
    
    const enteredPassword = prompt('🔒 Enter password to view content:');
    
    if (enteredPassword === null) {
        return; // User cancelled
    }
    
    if (enteredPassword !== snippet.password) {
        alert('❌ Incorrect password! Content remains hidden.');
        return;
    }
    
    // Try to decrypt the content
    if (snippet.isEncrypted) {
        const rawContent = snippet.content || snippet.code || '';
        const decrypted = decryptContent(rawContent, enteredPassword);
        if (!decrypted) {
            alert('❌ Failed to decrypt! Content remains hidden.');
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
                // Normalize IDs to numbers to ensure consistency
                codeSnippets = data.map(snippet => ({
                    ...snippet,
                    id: typeof snippet.id === 'string' ? parseInt(snippet.id, 10) : snippet.id
                }));
                console.log('Loaded snippets from database:', codeSnippets.length);
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