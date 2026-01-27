// Code snippets storage
let codeSnippets = [];

// Hide content feature variables
let unlockedSnippets = new Set(); // Track which snippets are unlocked in this session
let decryptedContent = new Map(); // Cache decrypted content

// Auto-update variables
let autoUpdateInterval = null;
let lastUpdateHash = null;

// Dialog state - pause loading when dialog is open
let isDialogOpen = false;

// Track expanded/viewing state to prevent refresh disruption
let expandedSnippets = new Set(); // Snippets currently being viewed/expanded
let isUserViewingPreview = false; // Flag to prevent auto-refresh while viewing
let pendingRefresh = false; // Queue refresh for when user finishes viewing

// Supabase client for direct uploads (initialized on first use)
let supabaseClient = null;
let supabaseConfig = null;

// Initialize Supabase client for direct uploads
async function getSupabaseClient() {
    if (supabaseClient) return supabaseClient;
    
    try {
        // Fetch config from server
        const response = await fetch('/.netlify/functions/config');
        
        if (!response.ok) {
            // console.error('Config endpoint error:', response.status);
            return null;
        }
        
        supabaseConfig = await response.json();
        // console.log('Supabase config loaded');
        
        // Initialize Supabase client with anon key
        supabaseClient = supabase.createClient(
            supabaseConfig.supabaseUrl,
            supabaseConfig.supabaseAnonKey
        );
        
        return supabaseClient;
    } catch (e) {
        // console.error('Failed to initialize Supabase client:', e);
        return null;
    }
}

// Upload file directly to Supabase Storage (bypasses Netlify 6MB limit)
async function uploadFileDirectly(file, snippetId) {
    const client = await getSupabaseClient();
    if (!client) {
        throw new Error('Supabase client not available');
    }
    
    const bucket = supabaseConfig.storageBucket || 'code-files';
    const ext = file.name.split('.').pop() || 'bin';
    const storagePath = `${snippetId}/${Date.now()}.${ext}`;
    
    // Upload file directly as blob (not base64)
    const { data, error } = await client.storage
        .from(bucket)
        .upload(storagePath, file, {
            contentType: file.type,
            upsert: true
        });
    
    if (error) {
        // console.error('Direct upload error:', error);
        throw new Error(`Upload failed: ${error.message}`);
    }
    
    return storagePath;
}

// Wrapper for prompt that pauses loading
function showPrompt(message) {
    isDialogOpen = true;
    const result = prompt(message);
    isDialogOpen = false;
    return result;
}

// Wrapper for alert that pauses loading
function showAlert(message) {
    isDialogOpen = true;
    alert(message);
    isDialogOpen = false;
}

// ===== Server-Side Encryption/Decryption Functions =====

// Legacy XOR decryption for backward compatibility with old encrypted content
function legacyDecrypt(encryptedText, password) {
    try {
        let key = password;
        while (key.length < 256) {
            key += password;
        }
        const encrypted = atob(encryptedText);
        let decrypted = '';
        for (let i = 0; i < encrypted.length; i++) {
            const charCode = encrypted.charCodeAt(i) ^ key.charCodeAt(i % key.length);
            decrypted += String.fromCharCode(charCode);
        }
        return decodeURIComponent(decrypted);
    } catch (e) {
        return null;
    }
}

// Encrypt content using server-side API (AES-256-GCM)
async function encryptContent(text, password) {
    try {
        const response = await fetch('/.netlify/functions/crypto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'encrypt',
                content: text,
                password: password
            })
        });
        
        const data = await response.json();
        
        if (!response.ok || !data.success) {
            // console.error('Encryption failed:', data.error);
            return null;
        }
        
        return data.encrypted;
    } catch (e) {
        // console.error('Encryption error:', e);
        return null;
    }
}

// Decrypt content using server-side API (with fallback to legacy XOR)
async function decryptContent(encryptedText, password) {
    // Guard against empty content
    if (!encryptedText || encryptedText.trim() === '') {
        // console.error('Cannot decrypt: content is empty');
        return null;
    }
    
    // First, try server-side AES decryption
    try {
        const response = await fetch('/.netlify/functions/crypto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'decrypt',
                content: encryptedText,
                password: password
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            return data.decrypted;
        }
    } catch (e) {
        // console.error('Server decryption error:', e);
    }
    
    // Fallback to legacy XOR decryption for old content
    const legacyResult = legacyDecrypt(encryptedText, password);
    if (legacyResult) {
        return legacyResult;
    }
    
    return null;
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
    if (selectedContentType === 'text') {
        codeInput.style.display = 'block';
        fileUploadArea.style.display = 'none';
        clearFileSelection();
    } else {
        codeInput.style.display = 'none';
        fileUploadArea.style.display = 'block';
        fileInput.accept = selectedContentType === 'image' ? 'image/*' : '.pdf';
    }
}

// Initialize app
initializeApp();

// Add event listener for Add button
addBtn.addEventListener('click', addCode);

// Add event listener for search input
searchInput.addEventListener('input', renderCodeList);

// Pause auto-update when user is typing
[passwordInput, titleInput, codeInput].forEach(input => {
    input.addEventListener('input', pauseAutoUpdateTemporarily);
});

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
        showAlert('Please enter a password!');
        passwordInput.focus();
        return;
    }
    
    if (title === '') {
        showAlert('Please enter a title!');
        titleInput.focus();
        return;
    }
    
    let content = '';
    let contentType = selectedContentType;
    let storagePath = null;
    
    // Handle different content types
    if (contentType === 'text') {
        const code = codeInput.value.trim();
        if (code === '') {
            showAlert('Please enter some text/code!');
            codeInput.focus();
            return;
        }
        content = code;
    } else if (contentType === 'image' || contentType === 'pdf') {
        if (!selectedFile) {
            showAlert('Please select a file!');
            return;
        }
        
        // For non-encrypted files, upload directly to Supabase Storage (bypasses 6MB limit)
        // For encrypted files, read as base64 and send through Netlify
        if (!hideContent) {
            // DIRECT UPLOAD - bypasses Netlify 6MB limit
            addBtn.disabled = true;
            addBtn.textContent = 'Uploading...';
            
            try {
                const snippetId = Date.now();
                storagePath = await uploadFileDirectly(selectedFile, snippetId);
                
                // Create snippet with storage path but NO content
                const snippet = {
                    id: snippetId,
                    title: title,
                    contentType: contentType,
                    content: null, // No content - file already in storage
                    storagePath: storagePath,
                    fileName: selectedFile.name,
                    fileType: selectedFile.type,
                    password: password,
                    timestamp: new Date().toLocaleString(),
                    hidden: false,
                    isEncrypted: false
                };
                
                // Send only metadata to Netlify function
                addBtn.textContent = 'Saving...';
                const response = await fetch('/.netlify/functions/save-data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ snippet: snippet })
                });
                
                if (!response.ok) {
                    throw new Error('Failed to save metadata');
                }
                
                const result = await response.json();
                const savedSnippet = result.snippet || snippet;
                codeSnippets.unshift(savedSnippet);
                
                addBtn.disabled = false;
                addBtn.textContent = 'Add Snippet';
                
                // Reset form
                resetForm();
                renderCodeList();
                // Scroll to top to show new snippet
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return;
                
            } catch (error) {
                // console.error('Direct upload failed:', error);
                showAlert('⚠️ Failed to upload file: ' + error.message);
                addBtn.disabled = false;
                addBtn.textContent = 'Add Snippet';
                return;
            }
        } else {
            // ENCRYPTED FILE - must go through Netlify (has 6MB limit)
            // Check file size first
            const fileSizeMB = selectedFile.size / (1024 * 1024);
            if (fileSizeMB > 4) { // Leave margin for base64 expansion
                showAlert(`⚠️ Encrypted files must be under 4MB (yours is ${fileSizeMB.toFixed(1)}MB).\n\nFor larger files, disable "Hide Content" to upload without encryption.`);
                return;
            }
            
            // Read file as base64 for encryption
            try {
                content = await readFileAsBase64(selectedFile);
            } catch (error) {
                showAlert('Failed to read file!');
                return;
            }
        }
    }
    
    // Encrypt content if hidden (using server-side encryption)
    let finalContent = content;
    if (hideContent) {
        addBtn.disabled = true;
        addBtn.textContent = 'Encrypting...';
        finalContent = await encryptContent(content, password);
        addBtn.disabled = false;
        addBtn.textContent = 'Add Snippet';
        
        if (!finalContent) {
            showAlert('Failed to encrypt content!');
            return;
        }
    }
    
    const snippet = {
        id: Date.now(),
        title: title,
        contentType: contentType,
        content: finalContent,
        fileName: selectedFile ? selectedFile.name : null,
        fileType: selectedFile ? selectedFile.type : null,
        password: password,
        timestamp: new Date().toLocaleString(),
        hidden: hideContent,
        isEncrypted: hideContent
    };
    
    // Save to database (encrypted files uploaded through Netlify)
    try {
        addBtn.disabled = true;
        addBtn.textContent = contentType === 'text' ? 'Saving...' : 'Uploading...';
        
        const response = await fetch('/.netlify/functions/save-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ snippet: snippet })
        });
        
        if (!response.ok) {
            throw new Error('Failed to save');
        }
        
        const result = await response.json();
        
        // Add saved snippet to local array (with storage path if file)
        const savedSnippet = result.snippet || snippet;
        codeSnippets.unshift(savedSnippet);
        
    } catch (error) {
        showAlert('⚠️ Failed to save to database. Please try again.');
        addBtn.disabled = false;
        addBtn.textContent = 'Add Snippet';
        return;
    }
    
    addBtn.disabled = false;
    addBtn.textContent = 'Add Snippet';
    
    // Reset form
    resetForm();
    renderCodeList();
    // Scroll to top to show new snippet
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Reset form helper
function resetForm() {
    passwordInput.value = '';
    titleInput.value = '';
    codeInput.value = '';
    hideContentToggle.checked = false;
    clearFileSelection();
    document.querySelector('input[name="contentType"][value="text"]').checked = true;
    selectedContentType = 'text';
    updateInputVisibility();
    passwordInput.focus();
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
    // Use loose comparison (==) to match both string and number types
    const snippet = codeSnippets.find(s => s.id == id);
    
    if (!snippet) {
        showAlert('❌ Snippet not found!');
        return;
    }
    
    const enteredPassword = showPrompt('Enter password to delete this snippet:');
    
    if (enteredPassword === null) {
        return; // User cancelled
    }
    
    if (enteredPassword !== snippet.password) {
        showAlert('❌ Incorrect password! Cannot delete snippet.');
        return;
    }
    
    if (!confirm('⚠️ Are you sure you want to delete this snippet? This action cannot be undone.')) {
        return;
    }
    
    // Delete from database (and storage if file)
    try {
        const response = await fetch(`/.netlify/functions/save-data?id=${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete from database');
        }
        
        // Remove from local array
        codeSnippets = codeSnippets.filter(s => s.id != id);
        
        // Remove from unlocked cache if present
        unlockedSnippets.delete(id);
        decryptedContent.delete(id);
        
        // Update GUI
        renderCodeList();
        
        // Show success feedback
        const tempDiv = document.createElement('div');
        tempDiv.style.cssText = 'position:fixed;top:20px;right:20px;background:#4CAF50;color:white;padding:15px 25px;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,0.1);z-index:10000;font-family:Arial,sans-serif;';
        tempDiv.textContent = '✓ Snippet deleted!';
        document.body.appendChild(tempDiv);
        setTimeout(() => tempDiv.remove(), 2000);
        
    } catch (error) {
        showAlert('⚠️ Failed to delete from database. Please try again.');
    }
}

// Copy to clipboard function
async function copyToClipboard(id, button) {
    const snippet = codeSnippets.find(s => s.id == id);
    
    if (!snippet) {
        showAlert('❌ Snippet not found!');
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
            const enteredPassword = showPrompt('🔒 Enter password to copy:');
            
            if (enteredPassword === null) {
                return; // User cancelled
            }
            
            if (enteredPassword !== snippet.password) {
                showAlert('❌ Incorrect password! Cannot copy content.');
                return;
            }
            
            // Try to decrypt with the correct password (server-side)
            button.textContent = '⏳ Decrypting...';
            const decrypted = await decryptContent(contentToCopy, enteredPassword);
            if (!decrypted) {
                button.textContent = '📋 Copy';
                showAlert('❌ Failed to decrypt content!');
                return;
            }
            
            contentToCopy = decrypted;
            // Don't cache it since we're not unlocking the view
        }
    }
    
    // Reset button text before copying (in case it shows "Decrypting...")
    button.textContent = '📋 Copy';
    
    // Copy to clipboard with fallback for mobile
    copyTextToClipboard(contentToCopy, button);
}

// Helper function to copy text with mobile fallback
function copyTextToClipboard(text, button) {
    const originalText = button.textContent;
    
    // Ensure window has focus before clipboard operation (fixes Firefox after dialogs)
    window.focus();
    
    // Use a small delay to ensure focus is restored after dialogs (needed for Firefox)
    setTimeout(() => {
        // Try modern clipboard API first
        if (navigator.clipboard && navigator.clipboard.writeText && document.hasFocus()) {
            navigator.clipboard.writeText(text).then(() => {
                button.textContent = '✓ Copied!';
                button.classList.add('copied');
                setTimeout(() => {
                    button.textContent = originalText;
                    button.classList.remove('copied');
                }, 2000);
            }).catch(() => {
                // Fallback for mobile/permission issues (Firefox often needs this)
                fallbackCopyToClipboard(text, button, originalText);
            });
        } else {
            // Fallback for older browsers or when document doesn't have focus
            fallbackCopyToClipboard(text, button, originalText);
        }
    }, 10);
}

// Fallback copy method using textarea (works on mobile)
function fallbackCopyToClipboard(text, button, originalText) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    
    // Avoid scrolling to bottom
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    textArea.style.pointerEvents = 'none';
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    // For iOS
    textArea.setSelectionRange(0, text.length);
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            button.textContent = '✓ Copied!';
            button.classList.add('copied');
            setTimeout(() => {
                button.textContent = originalText;
                button.classList.remove('copied');
            }, 2000);
        } else {
            showAlert('Failed to copy. Please copy manually.');
        }
    } catch (err) {
        showAlert('Failed to copy. Please copy manually.');
    }
    
    document.body.removeChild(textArea);
}

// Download file function (for images and PDFs)
async function downloadFile(id) {
    const snippet = codeSnippets.find(s => s.id == id);
    
    if (!snippet) {
        showAlert('❌ Snippet not found!');
        return;
    }
    
    // Check if snippet is encrypted and needs decryption
    if (snippet.isEncrypted) {
        // Check if already decrypted in cache
        if (decryptedContent.has(id)) {
            const fileContent = decryptedContent.get(id);
            downloadBase64File(fileContent, snippet.fileName || `file-${snippet.id}`);
            return;
        } else {
            // Need password to decrypt
            const enteredPassword = showPrompt('🔒 Enter password to download:');
            
            if (enteredPassword === null) {
                return; // User cancelled
            }
            
            if (enteredPassword !== snippet.password) {
                showAlert('❌ Incorrect password! Cannot download file.');
                return;
            }
            
            // If file is in storage, download and decrypt
            if (snippet.storagePath) {
                const loadingDiv = document.createElement('div');
                loadingDiv.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.8);color:white;padding:20px 40px;border-radius:10px;z-index:10000;';
                loadingDiv.textContent = '📥 Downloading encrypted file...';
                document.body.appendChild(loadingDiv);
                
                try {
                    const response = await fetch(`/.netlify/functions/get-data?id=${id}&getContent=true`);
                    if (!response.ok) {
                        loadingDiv.remove();
                        showAlert('❌ Failed to download encrypted file');
                        return;
                    }
                    
                    const data = await response.json();
                    const rawContent = data.content;
                    
                    if (!rawContent) {
                        loadingDiv.remove();
                        showAlert('❌ No encrypted content found');
                        return;
                    }
                    
                    loadingDiv.textContent = '🔓 Decrypting...';
                    
                    const decrypted = await decryptContent(rawContent, enteredPassword);
                    loadingDiv.remove();
                    
                    if (!decrypted) {
                        showAlert('❌ Failed to decrypt file!');
                        return;
                    }
                    
                    // Cache decrypted content
                    decryptedContent.set(id, decrypted);
                    downloadBase64File(decrypted, snippet.fileName || `file-${snippet.id}`);
                    return;
                } catch (e) {
                    loadingDiv.remove();
                    showAlert('❌ Failed to download file: ' + e.message);
                    return;
                }
            }
            
            // Try to decrypt from content (text/inline)
            const rawContent = snippet.content || snippet.code || '';
            const decrypted = await decryptContent(rawContent, enteredPassword);
            if (!decrypted) {
                showAlert('❌ Failed to decrypt file!');
                return;
            }
            
            downloadBase64File(decrypted, snippet.fileName || `file-${snippet.id}`);
            return;
        }
    }
    
    // If file is in Supabase Storage, get signed URL and download
    if (snippet.storagePath) {
        try {
            const response = await fetch(`/.netlify/functions/get-data?id=${id}&getUrl=true`);
            if (!response.ok) throw new Error('Failed to get file URL');
            
            const data = await response.json();
            if (data.fileUrl) {
                // Fetch the file and trigger download
                const fileResponse = await fetch(data.fileUrl);
                const blob = await fileResponse.blob();
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = snippet.fileName || `file-${snippet.id}`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                return;
            }
        } catch (error) {
            showAlert('❌ Failed to download file. Please try again.');
            return;
        }
    }
    
    // Fallback: use content directly (base64)
    const fileContent = snippet.content || snippet.code || '';
    downloadBase64File(fileContent, snippet.fileName || `file-${snippet.id}`);
}

// Helper to download base64 content
function downloadBase64File(base64Content, fileName) {
    const link = document.createElement('a');
    link.href = base64Content;
    link.download = fileName;
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
    // Supports: title, date, or both with + (e.g. "report + jan" matches title AND date)
    let filteredSnippets = codeSnippets;
    
    if (searchQuery !== '') {
        // Check if using AND operator (+)
        if (searchQuery.includes('+')) {
            const terms = searchQuery.split('+').map(t => t.trim()).filter(t => t !== '');
            filteredSnippets = codeSnippets.filter(snippet => {
                const title = snippet.title.toLowerCase();
                const timestamp = (snippet.timestamp || '').toLowerCase();
                const combined = title + ' ' + timestamp;
                // All terms must match somewhere in title or timestamp
                return terms.every(term => combined.includes(term));
            });
        } else {
            // Simple OR search (matches title OR timestamp)
            filteredSnippets = codeSnippets.filter(snippet => 
                snippet.title.toLowerCase().includes(searchQuery) ||
                (snippet.timestamp && snippet.timestamp.toLowerCase().includes(searchQuery))
            );
        }
    }
    
    // Check if no results found
    if (filteredSnippets.length === 0) {
        codeList.innerHTML = '<div class="no-results">No snippets found matching your search.</div>';
        return;
    }
    
    codeList.innerHTML = filteredSnippets.map(snippet => {
        // Support both old 'code' and new 'content' properties
        const contentType = snippet.contentType || 'text';
        const rawContent = snippet.content || snippet.code || '';
        const hasStoragePath = !!snippet.storagePath;
        
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
        
        // Check if file URL is loaded (for Supabase Storage files)
        const fileUrl = snippet.fileUrl || displayContent;
        
        // Render content based on type
        let contentHtml = '';
        const contentClass = isProtected ? 'snippet-content protected' : 'snippet-content';
        
        // Check if we have decrypted content cached for this snippet
        const hasDecryptedContent = decryptedContent.has(snippet.id);
        
        if (contentType === 'image') {
            if (isProtected) {
                contentHtml = `<div class="snippet-content protected">
                    <div style="font-size: 48px; margin-bottom: 10px;">🖼️</div>
                    <div>🔒 Image is hidden</div>
                </div>`;
            } else if (hasDecryptedContent) {
                // Decrypted content is available (for encrypted files)
                contentHtml = `<div class="snippet-content">
                    <img src="${displayContent}" alt="${escapeHtml(snippet.fileName || 'Image')}" style="max-width: 100%; border-radius: 8px;">
                    ${snippet.fileName ? `<p class="file-name">📷 ${escapeHtml(snippet.fileName)}</p>` : ''}
                </div>`;
            } else if (hasStoragePath && !snippet.fileUrl) {
                // File stored in Supabase Storage - auto-load for non-encrypted, show loading
                contentHtml = `<div class="snippet-content" data-snippet-id="${snippet.id}" data-auto-load="true">
                    <div style="font-size: 48px; margin-bottom: 10px;">🖼️</div>
                    <div class="loading-text">⏳ Loading image...</div>
                    ${snippet.fileName ? `<p class="file-name">📷 ${escapeHtml(snippet.fileName)}</p>` : ''}
                </div>`;
            } else {
                contentHtml = `<div class="snippet-content">
                    <img src="${fileUrl}" alt="${escapeHtml(snippet.fileName || 'Image')}" style="max-width: 100%; border-radius: 8px;">
                    ${snippet.fileName ? `<p class="file-name">📷 ${escapeHtml(snippet.fileName)}</p>` : ''}
                </div>`;
            }
        } else if (contentType === 'pdf') {
            if (isProtected) {
                contentHtml = `<div class="snippet-content protected">
                    <div style="font-size: 48px; margin-bottom: 10px;">📄</div>
                    <div>🔒 PDF is hidden</div>
                </div>`;
            } else if (hasDecryptedContent) {
                // Decrypted PDF content available - use unique container ID for blob URL injection
                const containerId = `pdf-container-${snippet.id}`;
                contentHtml = `<div class="snippet-content">
                    <div class="pdf-container" id="${containerId}" data-pdf-content="${encodeURIComponent(displayContent)}">
                        <div class="loading-text">⏳ Rendering PDF...</div>
                        <p class="file-name">📄 ${escapeHtml(snippet.fileName || 'Document.pdf')}</p>
                    </div>
                </div>`;
            } else if (hasStoragePath && !snippet.fileUrl) {
                // File stored in Supabase Storage - auto-load for non-encrypted, show loading
                contentHtml = `<div class="snippet-content" data-snippet-id="${snippet.id}" data-auto-load="true">
                    <div style="font-size: 48px; margin-bottom: 10px;">📄</div>
                    <div class="loading-text">⏳ Loading PDF...</div>
                    <p class="file-name">📄 ${escapeHtml(snippet.fileName || 'Document.pdf')}</p>
                </div>`;
            } else {
                contentHtml = `<div class="snippet-content">
                    <div class="pdf-container">
                        <iframe src="${fileUrl}" width="100%" height="400px" style="border: none; border-radius: 8px;"></iframe>
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
    
    // Auto-load files that need URLs (non-encrypted files in storage)
    if (!isDialogOpen) {
        autoLoadFiles();
    }
    
    // Render decrypted PDFs (convert data URLs to blob URLs)
    if (!isDialogOpen) {
        renderDecryptedPDFs();
    }
}

// Auto-load file URLs for non-encrypted files
async function autoLoadFiles() {
    if (isDialogOpen) return; // Don't load while dialog is open
    
    const autoLoadElements = document.querySelectorAll('[data-auto-load="true"]');
    
    for (const element of autoLoadElements) {
        if (isDialogOpen) break; // Stop if dialog opens
        
        const snippetId = parseInt(element.dataset.snippetId, 10);
        const snippet = codeSnippets.find(s => s.id === snippetId || s.id == snippetId);
        
        if (snippet && !snippet.fileUrl) {
            // Load the URL in background
            loadFileUrl(snippetId);
        }
    }
}

// Render decrypted PDFs by converting data URLs to blob URLs
function renderDecryptedPDFs() {
    const pdfContainers = document.querySelectorAll('[data-pdf-content]');
    
    pdfContainers.forEach(container => {
        const dataUrl = decodeURIComponent(container.dataset.pdfContent);
        
        // Convert data URL to blob
        try {
            const byteString = atob(dataUrl.split(',')[1]);
            const mimeType = dataUrl.split(',')[0].split(':')[1].split(';')[0];
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
            }
            const blob = new Blob([ab], { type: mimeType });
            const blobUrl = URL.createObjectURL(blob);
            
            // Get the file name from the existing p element
            const fileNameEl = container.querySelector('.file-name');
            const fileName = fileNameEl ? fileNameEl.outerHTML : '';
            
            // Replace container content with iframe using blob URL
            container.innerHTML = `
                <iframe src="${blobUrl}" width="100%" height="400px" style="border: none; border-radius: 8px;"></iframe>
                ${fileName}
            `;
            
            // Remove the data attribute to prevent re-processing
            container.removeAttribute('data-pdf-content');
        } catch (e) {
            // console.error('Failed to render PDF:', e);
            container.innerHTML = `<div style="color: red;">❌ Failed to render PDF</div>`;
        }
    });
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

// Load file URL from Supabase Storage
async function loadFileUrl(snippetId) {
    // Mark as viewing when loading a file
    expandedSnippets.add(snippetId);
    isUserViewingPreview = true;
    
    try {
        const response = await fetch(`/.netlify/functions/get-data?id=${snippetId}&getUrl=true`);
        if (!response.ok) {
            throw new Error('Failed to get file URL');
        }
        
        const data = await response.json();
        
        // Update snippet in local array with file URL
        const index = codeSnippets.findIndex(s => s.id === snippetId);
        if (index !== -1 && data.fileUrl) {
            codeSnippets[index].fileUrl = data.fileUrl;
            
            // Only update the specific element instead of full re-render
            updateSnippetPreview(snippetId, data.fileUrl);
        }
    } catch (error) {
        // console.error('Failed to load file URL:', error);
        // Update just the loading element to show error
        const element = document.querySelector(`[data-snippet-id="${snippetId}"][data-auto-load="true"]`);
        if (element) {
            element.innerHTML = `<div style="color: #e74c3c;">❌ Failed to load. <button onclick="loadFileUrl(${snippetId})" class="btn" style="font-size:12px;padding:5px 10px;">Retry</button></div>`;
        }
    }
}

// Update just the specific snippet's preview without full re-render
function updateSnippetPreview(snippetId, fileUrl) {
    const snippet = codeSnippets.find(s => s.id == snippetId);
    if (!snippet) return;
    
    const element = document.querySelector(`[data-snippet-id="${snippetId}"][data-auto-load="true"]`);
    if (!element) return;
    
    // Remove auto-load attribute
    element.removeAttribute('data-auto-load');
    
    const contentType = snippet.contentType || 'text';
    const fileName = snippet.fileName || 'file';
    
    if (contentType === 'image') {
        element.innerHTML = `
            <img src="${fileUrl}" alt="${escapeHtml(fileName)}" style="max-width: 100%; border-radius: 8px;">
            <p class="file-name">📷 ${escapeHtml(fileName)}</p>
        `;
    } else if (contentType === 'pdf') {
        element.innerHTML = `
            <div class="pdf-container">
                <iframe src="${fileUrl}" width="100%" height="400px" style="border: none; border-radius: 8px;"></iframe>
                <p class="file-name">📄 ${escapeHtml(fileName)}</p>
            </div>
        `;
    }
    
    // Mark viewing complete after a short delay (let user see the content)
    setTimeout(() => {
        expandedSnippets.delete(snippetId);
        if (expandedSnippets.size === 0) {
            isUserViewingPreview = false;
            // Process pending refresh if any
            if (pendingRefresh) {
                pendingRefresh = false;
                // console.log('Processing pending refresh');
                checkForUpdates();
            }
        }
    }, 2000); // Give user 2 seconds after load before allowing refresh
}

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
async function unlockContent(id) {
    const snippet = codeSnippets.find(s => s.id == id);
    if (!snippet) return;
    
    const enteredPassword = showPrompt('🔒 Enter password to view content:');
    
    if (enteredPassword === null) {
        return; // User cancelled
    }
    
    if (enteredPassword !== snippet.password) {
        showAlert('❌ Incorrect password! Content remains hidden.');
        return;
    }
    
    // Try to decrypt the content (server-side)
    if (snippet.isEncrypted) {
        let rawContent = snippet.content || snippet.code || '';
        
        // If content is empty and it's an encrypted file in storage
        if (!rawContent && snippet.storagePath) {
            // Show loading indicator
            const loadingDiv = document.createElement('div');
            loadingDiv.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.8);color:white;padding:20px 40px;border-radius:10px;z-index:10000;';
            loadingDiv.textContent = '📥 Downloading encrypted file...';
            document.body.appendChild(loadingDiv);
            
            try {
                // Fetch encrypted file content from storage
                const response = await fetch(`/.netlify/functions/get-data?id=${snippet.id}&getContent=true`);
                if (!response.ok) {
                    loadingDiv.remove();
                    const err = await response.json();
                    showAlert('❌ Failed to download encrypted file: ' + (err.error || 'Unknown error'));
                    return;
                }
                
                const data = await response.json();
                rawContent = data.content;
                
                if (!rawContent) {
                    loadingDiv.remove();
                    showAlert('❌ No encrypted content found in file');
                    return;
                }
                
                loadingDiv.textContent = '🔓 Decrypting...';
                
                // Decrypt the file content
                const decrypted = await decryptContent(rawContent, enteredPassword);
                
                loadingDiv.remove();
                
                if (!decrypted) {
                    showAlert('❌ Failed to decrypt file! Incorrect password or corrupted data.');
                    return;
                }
                
                // console.log('Decrypted content preview:', decrypted.substring(0, 100));
                // Cache the decrypted content (this is now base64 of the original file)
                decryptedContent.set(id, decrypted);
                unlockedSnippets.add(id);
                expandedSnippets.add(id); // Track as viewing
                isUserViewingPreview = true;
                renderCodeList();
                return;
            } catch (e) {
                loadingDiv.remove();
                // console.error('Failed to load/decrypt file:', e);
                showAlert('❌ Failed to load encrypted file: ' + e.message);
                return;
            }
        }
        
        // Text content - decrypt normally
        if (rawContent) {
            // Show loading indicator
            const loadingDiv = document.createElement('div');
            loadingDiv.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.8);color:white;padding:20px 40px;border-radius:10px;z-index:10000;';
            loadingDiv.textContent = '🔓 Decrypting...';
            document.body.appendChild(loadingDiv);
            
            const decrypted = await decryptContent(rawContent, enteredPassword);
            
            loadingDiv.remove();
            
            if (!decrypted) {
                showAlert('❌ Failed to decrypt! Content remains hidden.');
                return;
            }
            // Cache the decrypted content
            decryptedContent.set(id, decrypted);
        }
    }
    
    // Unlock this snippet for this session
    unlockedSnippets.add(id);
    expandedSnippets.add(id); // Track as viewing
    isUserViewingPreview = true;
    renderCodeList();
    
    // Clear viewing state after user has seen content (30 seconds)
    setTimeout(() => {
        expandedSnippets.delete(id);
        if (expandedSnippets.size === 0 && unlockedSnippets.size === 0) {
            isUserViewingPreview = false;
            // Process pending refresh if any
            if (pendingRefresh) {
                pendingRefresh = false;
                checkForUpdates();
            }
        }
    }, 20000);
}

// Lock content (hide again)
function lockContent(id) {
    // Remove from unlocked set to hide it again
    unlockedSnippets.delete(id);
    // Clear decrypted cache
    decryptedContent.delete(id);
    // Clear from expanded/viewing
    expandedSnippets.delete(id);
    if (expandedSnippets.size === 0) {
        isUserViewingPreview = false;
    }
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
        showAlert('⚠️ Failed to save data to database. Please try again.');
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
            
            // Handle paginated response
            let snippetsArray = [];
            if (data.snippets) {
                snippetsArray = data.snippets;
            } else if (Array.isArray(data)) {
                snippetsArray = data;
            }
            
            if (snippetsArray.length > 0) {
                // Normalize IDs to numbers to ensure consistency
                codeSnippets = snippetsArray.map(snippet => ({
                    ...snippet,
                    id: typeof snippet.id === 'string' ? parseInt(snippet.id, 10) : snippet.id
                }));
            }
        }
    } catch (error) {
        showAlert('⚠️ Failed to load data from database. Please check your connection.');
    }
}

// Initialize the app
async function initializeApp() {
    await loadFromDatabaseJSON();
    renderCodeList();
    startAutoUpdate();
}

// ===== Auto-Update Functions =====

// Generate a simple hash from snippets for change detection
function generateDataHash(snippets) {
    const str = JSON.stringify(snippets.map(s => ({ id: s.id, title: s.title, timestamp: s.timestamp })));
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
}

// Check for updates from server
async function checkForUpdates() {
    // Don't auto-refresh if user is viewing a preview or dialog is open
    if (isDialogOpen || isUserViewingPreview) {
        // console.log('Skipping auto-update: user is viewing content');
        return;
    }
    
    try {
        const response = await fetch('/.netlify/functions/get-data');
        
        if (response.ok) {
            const data = await response.json();
            
            // Handle paginated response
            let snippetsArray = [];
            if (data.snippets) {
                snippetsArray = data.snippets;
            } else if (Array.isArray(data)) {
                snippetsArray = data;
            }
            
            // Normalize IDs to numbers
            const normalizedData = snippetsArray.map(snippet => ({
                ...snippet,
                id: typeof snippet.id === 'string' ? parseInt(snippet.id, 10) : snippet.id
            }));
            
            // Calculate hash of new data
            const newHash = generateDataHash(normalizedData);
            
            // Check if data has changed
            if (lastUpdateHash !== null && newHash !== lastUpdateHash) {
                // Data has changed - check if user is viewing anything
                if (isUserViewingPreview || expandedSnippets.size > 0) {
                    // Queue the refresh for later
                    pendingRefresh = true;
                    // console.log('Data changed but user is viewing - queuing refresh');
                    return;
                }
                
                // Data has changed - update the UI
                const oldLength = codeSnippets.length;
                const change = normalizedData.length - oldLength;
                
                // Preserve file URLs for loaded content
                preserveFileUrls(normalizedData);
                
                codeSnippets = normalizedData;
                lastUpdateHash = newHash;
                smartRenderCodeList();
                
                // Show notification only if there's a meaningful change
                if (change !== 0) {
                    showUpdateNotification(change);
                }
            } else if (lastUpdateHash === null) {
                // First check, just store the hash
                lastUpdateHash = newHash;
            }
        }
    } catch (error) {
        // console.error('Auto-update check failed:', error);
    }
}

// Preserve file URLs from old snippets to new ones
function preserveFileUrls(newSnippets) {
    for (const newSnippet of newSnippets) {
        const existing = codeSnippets.find(s => s.id == newSnippet.id);
        if (existing && existing.fileUrl) {
            newSnippet.fileUrl = existing.fileUrl;
        }
    }
}

// Smart render that preserves scroll position and expanded states
function smartRenderCodeList() {
    // Save scroll position
    const scrollPos = window.scrollY;
    
    // Render the list
    renderCodeList();
    
    // Restore scroll position
    window.scrollTo(0, scrollPos);
}

// Show a subtle notification when data updates
function showUpdateNotification(change) {
    const notificationDiv = document.createElement('div');
    notificationDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        font-family: Arial, sans-serif;
        font-size: 14px;
        animation: slideIn 0.3s ease-out;
    `;
    
    let message = '🔄 Data updated';
    if (change > 0) {
        message += ` (+${change} new)`;
    } else if (change < 0) {
        message += ` (${Math.abs(change)} removed)`;
    }
    
    notificationDiv.textContent = message;
    document.body.appendChild(notificationDiv);
    
    // Add slide-in animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);
    
    setTimeout(() => {
        notificationDiv.style.opacity = '0';
        notificationDiv.style.transform = 'translateX(400px)';
        notificationDiv.style.transition = 'all 0.3s ease-out';
        setTimeout(() => {
            notificationDiv.remove();
            style.remove();
        }, 300);
    }, 3000);
}

// Start automatic updates
function startAutoUpdate(intervalMs = 5000) {
    // Clear any existing interval
    if (autoUpdateInterval) {
        clearInterval(autoUpdateInterval);
    }
    
    // Set initial hash
    lastUpdateHash = generateDataHash(codeSnippets);
    
    // Start checking for updates every intervalMs (default: 5 seconds)
    autoUpdateInterval = setInterval(checkForUpdates, intervalMs);
    
    // Update indicator
    updateIndicatorStatus(true);
    // console.log(`Auto-update started (checking every ${intervalMs / 1000}s)`);
}

// Stop automatic updates (useful for testing or manual control)
function stopAutoUpdate() {
    if (autoUpdateInterval) {
        clearInterval(autoUpdateInterval);
        autoUpdateInterval = null;
        
        // Update indicator
        updateIndicatorStatus(false);
        // console.log('Auto-update stopped');
    }
}

// Update the indicator status
function updateIndicatorStatus(isActive) {
    const indicator = document.getElementById('autoUpdateIndicator');
    if (!indicator) return;
    
    const dot = indicator.querySelector('.pulse-dot');
    const text = indicator.querySelector('.indicator-text');
    
    if (isActive) {
        dot.style.background = '#4CAF50';
        text.textContent = 'Live';
        indicator.title = 'Auto-update is active';
    } else {
        dot.style.background = '#FF9800';
        text.textContent = 'Paused';
        indicator.title = 'Auto-update is paused';
    }
}

// Pause auto-update when user is actively editing
let userActivityTimeout = null;
function pauseAutoUpdateTemporarily() {
    stopAutoUpdate();
    clearTimeout(userActivityTimeout);
    userActivityTimeout = setTimeout(() => {
        startAutoUpdate();
    }, 10000); // Resume after 10 seconds of inactivity
}

// Force refresh - clears viewing state and refreshes
function forceRefresh() {
    expandedSnippets.clear();
    isUserViewingPreview = false;
    pendingRefresh = false;
    checkForUpdates();
}

// ===== Page Visibility API - Optimize battery and network usage =====
// Pause auto-updates when tab is hidden
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Tab is hidden - pause auto-updates to save resources
        if (autoUpdateInterval) {
            stopAutoUpdate();
            // Mark that we paused due to visibility (not user action)
            window._pausedByVisibility = true;
        }
    } else {
        // Tab is visible again - resume auto-updates and check for changes
        if (window._pausedByVisibility) {
            window._pausedByVisibility = false;
            startAutoUpdate();
            // Immediately check for updates since we may have missed changes
            checkForUpdates();
        }
    }
});

// Make functions available globally for manual control via console
window.codeManagerControls = {
    startAutoUpdate,
    stopAutoUpdate,
    checkForUpdates,
    forceRefresh,
    getCurrentInterval: () => autoUpdateInterval ? 'Active' : 'Paused',
    isViewing: () => ({ isUserViewingPreview, expandedSnippets: [...expandedSnippets], pendingRefresh }),
    setUpdateInterval: (seconds) => {
        stopAutoUpdate();
        startAutoUpdate(seconds * 1000);
    }
};